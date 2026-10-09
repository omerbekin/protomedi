/**
 * Multiplayer oturumu (saf; Phaser/DOM yok): lobi (hazır), takım seçimi, savaş (lockstep), sonuç (rövanş / lobiye dönüş),
 * kopma (60 sn) ve yeniden bağlanma (hello + catchup, sayfa yenilenince start + tüm hamleler).
 * Taşıma dışarıdan verilir (`attach`): tarayıcıda WebRTC DataChannel, testte ve debug sahte rakipte bellek içi loopback.
 * Ayrıntı: docs/design/multiplayer.md.
 */
import { content } from '../engine';
import type { ChoiceLike } from '../engine';
import { createMatchBattle, Lockstep, sideOfRole, type Desync, type MatchSetup } from './lockstep';
import { CATCHUP_CHUNK, CELLS, encodeMessage, parseMessage, PROTOCOL_VERSION, RateLimiter, type MoveRecord, type NetMessage, type NetSide, type Phase } from './protocol';
import { ReconnectMachine, SILENCE_TIMEOUT_MS, type LinkStatus, type ServerView } from './reconnect';
import { rematchView, type RematchView } from './rematch';
import { deriveSeed, makeNonce, sha256 } from './sha256';
import { fnv1a } from './state-hash';
import type { Timer, Transport } from './transport';

export type Role = 'host' | 'guest';
export const TEAM_SIZE = 4;
export const PING_EVERY_MS = 2000;
/** Röle modunda (mesajlar Cloudflare Worker'dan geçer, her mesaj kotadan yer): seyrek kalp atışı ve geniş sessizlik payı. */
export const RELAY_PING_MS = 20_000;
export const RELAY_SILENCE_MS = 50_000;

export interface MatchResult {
  winner: NetSide | null;
  reason: 'battle' | 'forfeit' | 'left' | 'failed' | 'desync';
}

export type SessionEvent =
  | { type: 'peer'; connected: boolean }
  | { type: 'phase'; phase: Phase }
  | { type: 'lobby' }
  | { type: 'team' }
  | { type: 'start'; lockstep: Lockstep; recovered: boolean }
  | { type: 'move'; move: MoveRecord; remote: boolean }
  | { type: 'link'; status: LinkStatus }
  | { type: 'desync'; desync: Desync }
  | { type: 'ended'; result: MatchResult }
  | { type: 'rematch' }
  | { type: 'peerLeft' }
  | { type: 'error'; code: 'version' | 'gone'; message: string };

export interface SessionOptions {
  role: Role;
  now?: () => number;
  /** [0,1): seed ve maç kimliği için (tarayıcıda crypto; testte sabit). */
  random?: () => number;
  /** İçerik parmak izi (varsayılan: contentFingerprint()). Farklıysa iki oyuncu aynı savaşı kuramaz. */
  build?: string;
  /** Sayfa yenilendikten sonra lobiye yeniden katılan oturum: rakibin gönderdiği start + kendi eski hamlelerimiz kabul edilir. */
  recovering?: boolean;
  teamSize?: number;
  /** Ayrılırken 'leave' mesajı gitsin diye kanal biraz sonra kapatılır (testte sahte saat). */
  timer?: Timer;
  /** İsteğe bağlı oyuncu adı (yalnızca doğrudan eşler arası kanalda rakibe gider). */
  name?: string;
}

let fingerprint: string | null = null;
/** Savaşı etkileyen içerik verisinin özeti (class, skill, formül, durum, zemin, çağrı, global eylem). */
export function contentFingerprint(): string {
  fingerprint ??= `p${PROTOCOL_VERSION}-${fnv1a(JSON.stringify([content.classes, content.skills, content.formulas, content.statuses, content.grounds, content.summons, content.globalSkills, content.battles[content.DEFAULT_BATTLE]]))}`;
  return fingerprint;
}

/** Takım hücre listesi geçerli mi: 12 hücre, seçilebilir class'lar, tam `size` birim. */
export function validTeam(cells: string[], size = TEAM_SIZE): boolean {
  if (cells.length !== CELLS) return false;
  const ids = cells.filter((c) => c !== '');
  return ids.length === size && ids.every((id) => content.selectableClasses.includes(id));
}

const MATCH_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export class MpSession {
  readonly role: Role;
  readonly localSide: NetSide;
  phase: Phase = 'lobby';
  /** Eş ile el sıkışma (hello) tamam ve kanal açık. */
  connected = false;
  /** Bu oturumda rakip en az bir kez bağlandı mı (kopma sayacı yalnızca ondan sonra işler). */
  everConnected = false;
  ready = { local: false, remote: false };
  team = { local: null as string[] | null, localReady: false, remote: null as string[] | null, remoteReady: false };
  rematch = { local: false, remote: false };
  /** Sonuç ekranında rakip ayrıldı (leave) ya da 60 sn içinde dönmedi: rövanş artık mümkün değil (lobiye dönünce sıfırlanır). */
  opponentGone = false;
  lockstep: Lockstep | null = null;
  result: MatchResult | null = null;
  /** Gelen geçersiz/kötü niyetli mesaj sayısı (debug bilgisi). */
  rejected = 0;
  lastError = '';
  /** Oyuncu adları (boşsa ekranda 'Player 1/2'). Rakibin adı yalnızca doğrudan kanaldan gelir. */
  localName = '';
  remoteName = '';
  /** Röle modu: mesajlar Worker'dan geçer; kalp atışı seyrek, ack yalnızca maç sonunda, ad gönderilmez. */
  relay = false;
  /** İki taraflı seed (commit-reveal): bu takım seçimi turunun gizli sayıları ve taahhütleri. */
  seedNonce = { local: null as string | null, localCommit: null as string | null, remote: null as string | null, remoteCommit: null as string | null, revealed: false };

  private channel: Transport | null = null;
  /** Bu kanalda eşin hello'su alındı (sürüm uyumlu). */
  private handshaken = false;
  private readonly listeners = new Set<(e: SessionEvent) => void>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly build: string;
  private readonly teamSize: number;
  private readonly timer: Timer;
  private recovering: boolean;
  /** Yeniden kurulan maç: catchup'ta kendi tarafımızın eski hamleleri de kabul edilir. */
  private recoveredMatch: string | null = null;
  /** Bu maçta kanal en az bir kez düştü mü ('ended' mesajı yalnızca o zaman kabul edilir). */
  private droppedThisMatch = false;
  private readonly machine = new ReconnectMachine();
  private lastPing = 0;
  private pingN = 0;
  private limiter = new RateLimiter();
  private lastLink: LinkStatus['phase'] = 'connected';

  constructor(o: SessionOptions) {
    this.role = o.role;
    this.localSide = sideOfRole(o.role);
    this.now = o.now ?? (() => Date.now());
    this.random = o.random ?? Math.random;
    this.build = o.build ?? contentFingerprint();
    this.recovering = !!o.recovering;
    this.teamSize = o.teamSize ?? TEAM_SIZE;
    this.timer = o.timer ?? { setTimeout: (fn, ms) => setTimeout(fn, ms) };
    this.localName = o.name ?? '';
  }

  /** Röle modunu aç/kapat (bağlantı katmanı kanal türüne göre çağırır). */
  setRelay(on: boolean): void {
    this.relay = on;
    this.machine.setSilence(on ? RELAY_SILENCE_MS : SILENCE_TIMEOUT_MS);
    if (on) this.remoteName = '';
  }

  /** Adı değiştir; doğrudan kanal açıksa rakibe gider (röle modunda gitmez: Worker'dan geçmesin). */
  setName(name: string): void {
    this.localName = name;
    if (name && !this.relay && this.connected) this.send({ t: 'name', name });
    this.emit({ type: 'lobby' });
  }

  get remoteSide(): NetSide {
    return this.localSide === 'party' ? 'enemy' : 'party';
  }

  on(cb: (e: SessionEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: SessionEvent): void {
    for (const l of [...this.listeners]) l(e);
  }

  private send(msg: NetMessage): void {
    if (this.channel?.open) this.channel.send(encodeMessage(msg));
  }

  // ------------------------------------------------------------ taşıma

  /** Yeni (ya da yeniden kurulan) eşler arası kanal. */
  attach(t: Transport): void {
    if (this.channel && this.channel !== t) this.channel.close();
    this.channel = t;
    this.handshaken = false;
    this.limiter = new RateLimiter();
    t.onMessage((text) => {
      if (this.channel === t) this.handle(text);
    });
    t.onClose(() => {
      if (this.channel !== t) return;
      this.channel = null;
      this.handshaken = false;
      const was = this.connected;
      this.connected = false;
      if (this.everConnected) {
        this.machine.channelDown(this.now());
        if (this.phase === 'battle') this.droppedThisMatch = true;
      }
      if (was) this.emit({ type: 'peer', connected: false });
      this.emitLink();
    });
    this.sendHello();
  }

  private sendHello(): void {
    this.send({ t: 'hello', v: PROTOCOL_VERSION, build: this.build, match: this.lockstep?.setup.match ?? null, count: this.lockstep?.seq ?? 0, phase: this.phase, ...(this.localName && !this.relay ? { name: this.localName } : {}) });
  }

  /** Sunucu görüşü (signaling): biz bağlı mıyız, eş lobide mi. */
  setServer(view: ServerView): void {
    this.machine.setServer(view);
  }

  /** Debug: kanalı koparır. */
  dropChannel(): void {
    this.channel?.close();
  }

  get hasChannel(): boolean {
    return !!this.channel?.open;
  }

  linkStatus(): LinkStatus {
    return this.machine.status(this.now());
  }

  /** Saat: kalp atışı, sessizlik ve 60 sn kuralı. Tarayıcıda ~250 ms'de bir çağrılır. */
  tick(): void {
    const now = this.now();
    if (this.connected && now - this.lastPing >= (this.relay ? RELAY_PING_MS : PING_EVERY_MS)) {
      this.lastPing = now;
      this.send({ t: 'ping', n: ++this.pingN });
    }
    if (!this.everConnected) return;
    const st = this.machine.tick(now);
    if (st.phase === 'waiting' && this.connected) {
      // sessizlik zaman aşımı: kanal açık görünse de ölü sayılır
      this.connected = false;
      this.emit({ type: 'peer', connected: false });
    }
    if (st.phase !== this.lastLink) this.emitLink();
    if (st.phase === 'won' || st.phase === 'lost' || st.phase === 'failed') this.onTimeout(st.phase);
  }

  private emitLink(): void {
    const st = this.machine.status(this.now());
    this.lastLink = st.phase;
    this.emit({ type: 'link', status: st });
  }

  /** 60 sn doldu. Savaştaysa maç biter; değilse lobiye dönülür. */
  private onTimeout(phase: 'won' | 'lost' | 'failed'): void {
    const live = this.phase === 'battle' && this.lockstep && !this.result;
    if (live) this.finish({ winner: phase === 'won' ? this.localSide : phase === 'lost' ? this.remoteSide : null, reason: phase === 'failed' ? 'failed' : 'forfeit' });
    else if (this.phase === 'result') {
      // Sonuç ekranında rakip 60 sn dönmedi: ekran kalır (sonuç görünsün), rövanş kapanır; Back to lobby çalışır
      this.markOpponentGone();
    } else {
      this.emit({ type: 'error', code: 'gone', message: phase === 'lost' ? 'Connection lost' : 'Opponent left' });
      this.enterLobby(false);
    }
    this.everConnected = false; // sayaç durur; yeni bağlantı gelirse yeniden başlar
    this.machine.reset(this.now());
    this.lastLink = 'connected';
  }

  // ------------------------------------------------------------ gelen mesajlar

  handle(text: string): void {
    const now = this.now();
    if (!this.limiter.allow(now)) {
      this.rejected++;
      return;
    }
    const msg = parseMessage(text);
    if (!msg) {
      this.rejected++;
      return;
    }
    this.machine.heard(now);
    if (msg.t !== 'hello' && !this.handshaken) return; // el sıkışmadan önce yalnızca hello
    if (msg.t !== 'hello' && !this.connected) {
      // Sessizlikten sonra aynı kanaldan yeniden ses geldi (ör. arka plandaki sekme uyandı): bağlantı geri döndü
      this.connected = true;
      this.machine.channelUp(now);
      this.emit({ type: 'peer', connected: true });
      this.emitLink();
    }
    switch (msg.t) {
      case 'hello':
        return this.onHello(msg);
      case 'ping':
        if (!this.relay) this.send({ t: 'pong', n: msg.n }); // rölede iki taraf da kendi ping'ini atar; yanıt kotayı ikiye katlardı
        return;
      case 'name':
        if (!this.relay) {
          this.remoteName = msg.name;
          this.emit({ type: 'lobby' });
        }
        return;
      case 'commit': {
        if (this.phase !== 'teams' || this.seedNonce.remoteCommit === msg.c) return;
        // Rakip yeni taahhüt gönderdi (yeniden bağlanma). Biz sayımızı zaten açtıysak o sayıyı artık kullanmayız:
        // yoksa rakip bizim sayımızı görüp kendi sayısını ona göre seçebilirdi. Yeni tur, yeni sayı.
        if (this.seedNonce.revealed) this.newSeedRound();
        this.seedNonce.remoteCommit = msg.c;
        this.seedNonce.remote = null;
        this.maybeReveal();
        return;
      }
      case 'reveal':
        // Taahhüde uymayan sayı (hile girişimi ya da eski turdan kalma): kabul edilmez
        if (this.phase !== 'teams' || !this.seedNonce.remoteCommit || sha256(msg.n) !== this.seedNonce.remoteCommit) return;
        this.seedNonce.remote = msg.n;
        this.maybeStart();
        return;
      case 'pong':
        return;
      case 'ready':
        if (this.phase !== 'lobby') return;
        this.ready.remote = msg.on;
        this.emit({ type: 'lobby' });
        this.maybeGoTeams();
        return;
      case 'phase':
        if (msg.to === 'teams') {
          if (this.role === 'guest' && (this.phase === 'lobby' || this.phase === 'result')) this.enterTeams(false);
        } else if (!(this.phase === 'battle' && this.lockstep && !this.result)) this.enterLobby(false);
        return;
      case 'team':
        if (this.phase !== 'teams') return;
        if (!validTeam(msg.cells, this.teamSize)) {
          this.rejected++;
          return;
        }
        this.team.remote = [...msg.cells];
        this.team.remoteReady = msg.ready;
        this.emit({ type: 'team' });
        this.maybeStart();
        return;
      case 'start':
        return this.onStart(msg);
      case 'move':
        return this.onMove(msg.match, { seq: msg.seq, actor: msg.actor, choice: msg.choice, before: msg.before });
      case 'ack': {
        const ls = this.lockstep;
        if (!ls || msg.match !== ls.setup.match) return;
        const d = ls.onAck(msg.seq, msg.hash);
        if (d) this.onDesync(d);
        return;
      }
      case 'catchup':
        return this.onCatchup(msg.match, msg.from, msg.moves);
      case 'rematch':
        if (this.phase !== 'result') return;
        this.rematch.remote = msg.on;
        this.emit({ type: 'rematch' });
        this.maybeRematch();
        return;
      case 'ended':
        if (!this.lockstep || msg.match !== this.lockstep.setup.match || this.result || !this.droppedThisMatch) return;
        this.finish({ winner: msg.winner, reason: msg.reason });
        return;
      case 'desync': {
        const ls = this.lockstep;
        if (!ls || msg.match !== ls.setup.match || this.result) return;
        ls.desync ??= { seq: msg.seq, local: ls.hash(), remote: '', kind: 'ack' };
        this.onDesync(ls.desync, false);
        return;
      }
      case 'leave':
        this.emit({ type: 'peerLeft' });
        if (this.phase === 'battle' && this.lockstep && !this.result) this.finish({ winner: this.localSide, reason: 'left' });
        if (this.phase === 'result') this.markOpponentGone();
        this.everConnected = false;
        this.machine.reset(this.now());
        if (this.phase !== 'result') this.enterLobby(false);
        this.channel?.close();
        return;
    }
  }

  private onHello(msg: Extract<NetMessage, { t: 'hello' }>): void {
    if (msg.v !== PROTOCOL_VERSION || msg.build !== this.build) {
      this.lastError = 'Game versions differ - reload the page';
      this.emit({ type: 'error', code: 'version', message: this.lastError });
      return;
    }
    const first = !this.connected;
    if (msg.name && !this.relay) this.remoteName = msg.name;
    this.handshaken = true;
    this.connected = true;
    this.everConnected = true;
    this.machine.channelUp(this.now());
    if (first) this.emit({ type: 'peer', connected: true });
    this.emitLink();
    const ls = this.lockstep;
    if (ls) {
      const m = ls.setup;
      if (msg.match !== m.match) {
        // Eş bu maçı bilmiyor (sayfayı yeniledi): kurulum + tüm hamleler
        if (msg.match === null || this.role === 'host') {
          this.send({ t: 'start', match: m.match, seed: m.seed, host: [...m.host], guest: [...m.guest] });
          this.sendCatchup(0);
        }
      } else if (msg.count < ls.seq) this.sendCatchup(msg.count);
      if (this.result && msg.match === m.match && (this.result.reason === 'forfeit' || this.result.reason === 'left') && this.result.winner) {
        this.send({ t: 'ended', match: m.match, winner: this.result.winner, reason: this.result.reason }); // taraf mutlak (party/enemy)
      }
    }
    let seeded = false;
    if (!ls && this.role === 'guest' && (msg.phase === 'lobby' || msg.phase === 'teams') && msg.phase !== this.phase) {
      // Kurucu akışı yönetir: guest kurucunun aşamasına geçer
      if (msg.phase === 'teams') {
        this.enterTeams(false);
        seeded = true;
      } else this.enterLobby(false);
    }
    // Ekranda kaybolan bilgileri tazele
    if (this.phase === 'lobby') this.send({ t: 'ready', on: this.ready.local });
    if (this.phase === 'teams') {
      // Yeniden bağlanma: seed taahhütleri baştan (eş sayfayı yenilediyse eski sayısı yok)
      if (!seeded) this.newSeedRound();
      if (this.team.local) this.send({ t: 'team', cells: [...this.team.local], ready: this.team.localReady });
    }
    if (this.phase === 'result') {
      // Rakip aynı maçın sonuç ekranına geri döndüyse (60 sn sonrası geç dönüş) rövanş yeniden mümkün; ayrılıp yeniden katıldıysa değil
      if (this.opponentGone && ls && msg.match === ls.setup.match && msg.phase === 'result') {
        this.opponentGone = false;
        this.emit({ type: 'rematch' });
      }
      this.send({ t: 'rematch', on: this.rematch.local });
    }
  }

  private sendCatchup(from: number): void {
    const ls = this.lockstep;
    if (!ls) return;
    const all = ls.movesFrom(from);
    for (let i = 0; i < all.length; i += CATCHUP_CHUNK) this.send({ t: 'catchup', match: ls.setup.match, from: from + i, moves: all.slice(i, i + CATCHUP_CHUNK) });
  }

  private onStart(msg: Extract<NetMessage, { t: 'start' }>): void {
    const normal = this.role === 'guest' && this.phase === 'teams';
    const recover = this.recovering && (!this.lockstep || this.lockstep.setup.match !== msg.match);
    if (!normal && !recover) return;
    if (!validTeam(msg.host, this.teamSize) || !validTeam(msg.guest, this.teamSize)) {
      this.rejected++;
      return;
    }
    if (normal && this.team.local && msg.guest.join(',') !== this.team.local.join(',')) {
      this.rejected++; // kurucu bizim takımımızı değiştirmiş: kabul edilmez
      return;
    }
    if (normal) {
      // Seed iki tarafın sayısından türemeli: kurucu kendi seçtiği seed'i dayatamaz
      const n = this.seedNonce;
      if (!n.local || !n.remote || msg.seed !== deriveSeed(n.remote, n.local)) {
        this.rejected++;
        return;
      }
    }
    if (recover) {
      this.recovering = false;
      this.recoveredMatch = msg.match;
    }
    this.createMatch({ match: msg.match, seed: msg.seed, host: [...msg.host], guest: [...msg.guest] }, recover);
  }

  private onMove(match: string, move: MoveRecord): void {
    const ls = this.lockstep;
    if (!ls || this.result) return;
    const r = ls.remote(match, move);
    if (r.ok) {
      // Rölede ack yalnızca maç bitince (hamle başına mesaj = kota); ayrışma yine sonraki hamlenin 'before' özetiyle yakalanır
      if (!this.relay || ls.battle.winner) this.send({ t: 'ack', match, seq: r.ack.seq, hash: r.ack.hash });
      this.emit({ type: 'move', move, remote: true });
      this.checkWinner();
      return;
    }
    if (r.reason === 'gap') this.send({ t: 'hello', v: PROTOCOL_VERSION, build: this.build, match: ls.setup.match, count: ls.seq, phase: this.phase });
    else if (r.reason === 'desync' && ls.desync) this.onDesync(ls.desync);
    else if (r.reason === 'illegal' || r.reason === 'not-your-unit' || r.reason === 'not-your-turn') {
      this.rejected++;
      // Kuralsız hamle: ya hile ya da ayrışma. Maç durdurulur.
      ls.desync = { seq: move.seq, local: ls.hash(), remote: move.before, kind: 'illegal' };
      this.onDesync(ls.desync);
    }
  }

  private onCatchup(match: string, from: number, moves: MoveRecord[]): void {
    const ls = this.lockstep;
    if (!ls || match !== ls.setup.match || this.result) return;
    let applied = 0;
    for (const m of moves) {
      if (m.seq < ls.seq) continue;
      if (m.seq > ls.seq) break;
      const side = ls.battle.get(m.actor)?.side;
      if (side === this.localSide) {
        if (this.recoveredMatch !== match || !ls.replay(m)) break; // kendi hamlemiz yalnızca sayfa yenilendiyse rakipten gelir
      } else {
        const r = ls.remote(match, m);
        if (!r.ok) {
          if (r.reason === 'desync' && ls.desync) this.onDesync(ls.desync);
          break;
        }
        if (!this.relay || ls.battle.winner) this.send({ t: 'ack', match, seq: r.ack.seq, hash: r.ack.hash });
      }
      applied++;
      this.emit({ type: 'move', move: m, remote: true });
    }
    void from;
    if (applied) this.checkWinner();
  }

  private onDesync(d: Desync, tell = true): void {
    if (this.result) return;
    if (tell && this.lockstep) this.send({ t: 'desync', match: this.lockstep.setup.match, seq: d.seq });
    this.emit({ type: 'desync', desync: d });
    this.finish({ winner: null, reason: 'desync' });
  }

  // ------------------------------------------------------------ akış

  private enterLobby(announce: boolean): void {
    if (announce) this.send({ t: 'phase', to: 'lobby' });
    this.phase = 'lobby';
    this.ready = { local: false, remote: false };
    this.rematch = { local: false, remote: false };
    this.opponentGone = false;
    this.team.localReady = false;
    this.team.remoteReady = false;
    this.team.remote = null;
    this.lockstep = null;
    this.result = null;
    this.droppedThisMatch = false;
    this.emit({ type: 'phase', phase: 'lobby' });
  }

  private enterTeams(announce: boolean): void {
    if (announce) this.send({ t: 'phase', to: 'teams' });
    this.phase = 'teams';
    this.team.localReady = false;
    this.team.remoteReady = false;
    this.team.remote = null;
    this.rematch = { local: false, remote: false };
    this.opponentGone = false;
    this.lockstep = null;
    this.result = null;
    this.droppedThisMatch = false;
    this.newSeedRound();
    this.emit({ type: 'phase', phase: 'teams' });
  }

  private maybeGoTeams(): void {
    if (this.role === 'host' && this.phase === 'lobby' && this.ready.local && this.ready.remote && this.connected) this.enterTeams(true);
  }

  private maybeStart(): void {
    if (this.role !== 'host' || this.phase !== 'teams' || !this.connected) return;
    const t = this.team;
    if (!t.localReady || !t.remoteReady || !t.local || !t.remote) return;
    const n = this.seedNonce;
    if (!n.local || !n.remote) return; // iki taraflı seed henüz hazır değil
    const setup: MatchSetup = { match: this.newMatchId(), seed: deriveSeed(n.local, n.remote), host: [...t.local], guest: [...t.remote] };
    this.send({ t: 'start', ...setup, host: [...setup.host], guest: [...setup.guest] });
    this.createMatch(setup, false);
  }

  /** Yeni takım seçimi turu: yeni gizli sayı, taahhüdü rakibe. */
  private newSeedRound(): void {
    const nonce = makeNonce(this.random);
    this.seedNonce = { local: nonce, localCommit: sha256(nonce), remote: null, remoteCommit: null, revealed: false };
    this.send({ t: 'commit', c: this.seedNonce.localCommit! });
  }

  /** İki taahhüt de varsa kendi sayımızı aç (rakibin taahhüdünü görmeden açmak hileye kapı olurdu). */
  private maybeReveal(): void {
    const n = this.seedNonce;
    if (n.revealed || !n.local || !n.remoteCommit) return;
    n.revealed = true;
    this.send({ t: 'reveal', n: n.local });
  }

  private maybeRematch(): void {
    if (this.role === 'host' && this.phase === 'result' && this.rematch.local && this.rematch.remote && this.connected && !this.opponentGone) this.enterTeams(true);
  }

  /** Rakip sonuç ekranından gitti: bekleyen istekleri düşür, rövanşı kapat. */
  private markOpponentGone(): void {
    this.opponentGone = true;
    this.rematch = { local: false, remote: false };
    this.emit({ type: 'rematch' });
  }

  private newMatchId(): string {
    let s = '';
    for (let i = 0; i < 8; i++) s += MATCH_ABC[Math.floor(this.random() * MATCH_ABC.length) % MATCH_ABC.length];
    return s;
  }

  private createMatch(setup: MatchSetup, recovered: boolean): void {
    this.lockstep = new Lockstep(createMatchBattle(setup), setup, this.localSide);
    this.result = null;
    this.droppedThisMatch = false;
    this.phase = 'battle';
    this.emit({ type: 'phase', phase: 'battle' });
    this.emit({ type: 'start', lockstep: this.lockstep, recovered });
  }

  private checkWinner(): void {
    const w = this.lockstep?.battle.winner;
    if (w && !this.result) this.finish({ winner: w, reason: 'battle' });
  }

  private finish(result: MatchResult): void {
    this.result = result;
    this.phase = 'result';
    this.rematch = { local: false, remote: false };
    this.emit({ type: 'phase', phase: 'result' });
    this.emit({ type: 'ended', result });
  }

  // ------------------------------------------------------------ yerel komutlar

  setReady(on: boolean): void {
    if (this.phase !== 'lobby') return;
    this.ready.local = on;
    this.send({ t: 'ready', on });
    this.emit({ type: 'lobby' });
    this.maybeGoTeams();
  }

  /** Takım seçimi: kendi tarafımızın 12 hücresi + hazır mı. Geçersiz takımla hazır olunamaz. */
  setTeam(cells: string[], ready: boolean): boolean {
    if (this.phase !== 'teams') return false;
    const ok = validTeam(cells, this.teamSize);
    this.team.local = [...cells];
    this.team.localReady = ready && ok;
    if (ok) this.send({ t: 'team', cells: [...cells], ready: this.team.localReady });
    this.emit({ type: 'team' });
    this.maybeStart();
    return ok;
  }

  /** Yerel oyuncunun hamlesi (choice null = pas). */
  localMove(choice: ChoiceLike | null): { ok: true } | { ok: false; reason: string } {
    const ls = this.lockstep;
    if (!ls || this.result) return { ok: false, reason: 'No match' };
    if (!this.connected) return { ok: false, reason: 'Waiting for the connection' };
    const r = ls.local(choice);
    if (!r.ok) return r;
    this.send({ t: 'move', match: ls.setup.match, ...r.move });
    this.emit({ type: 'move', move: r.move, remote: false });
    this.checkWinner();
    return { ok: true };
  }

  /** Rövanş iste (on) ya da isteği geri al (off). İptal her zaman mümkündür; rakip gittiyse ya da bağlantı yoksa yeni istek yok sayılır. */
  requestRematch(on = true): void {
    if (this.phase !== 'result') return;
    if (on && (this.opponentGone || !this.connected)) return;
    this.rematch.local = on;
    this.send({ t: 'rematch', on });
    this.emit({ type: 'rematch' });
    this.maybeRematch();
  }

  /** Sonuç ekranının düğme/durum görünümü (saf karar: ./rematch.ts). */
  rematchView(): RematchView {
    return rematchView({ inResult: this.phase === 'result', connected: this.connected, opponentGone: this.opponentGone, local: this.rematch.local, remote: this.rematch.remote });
  }

  /** Lobiye dön: her durumda çalışır (bekleyen rövanş isteği, kopuk bağlantı ya da ayrılmış rakip fark etmez). */
  backToLobby(): void {
    this.enterLobby(true);
  }

  /** Bilerek ayrılma: rakibe haber verilir, kanal kapanır. Savaş sürüyorsa rakip kazanır (biz kaybederiz). */
  leave(): void {
    this.send({ t: 'leave' });
    if (this.phase === 'battle' && this.lockstep && !this.result) this.finish({ winner: this.remoteSide, reason: 'left' });
    this.everConnected = false;
    const ch = this.channel;
    this.channel = null;
    this.connected = false;
    if (ch) this.timer.setTimeout(() => ch.close(), 300); // 'leave' önce gitsin
  }

  // ------------------------------------------------------------ debug

  /** Debug: yerel savaş durumunu bozar (bir sonraki özet karşılaştırması desync yakalar). */
  simulateDesync(): boolean {
    const b = this.lockstep?.battle;
    const unit = b?.combatants.find((c) => c.hp > 1);
    if (!unit) return false;
    unit.hp -= 1;
    return true;
  }
}
