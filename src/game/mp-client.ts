/**
 * Multiplayer istemcisi (tarayıcı yapıştırıcısı): oturumu (src/net/session.ts), bağlantıyı (WebRTC + Worker) ya da debug sahte rakibi
 * kurar; oturum olaylarına göre sahneleri değiştirir (lobi -> takım seçimi -> savaş -> sonuç) ve üst bağlantı şeridini günceller.
 * Sahne sınıflarını içe aktarmaz (anahtarla açar); sahneler multiplayer'ı mp-hooks.ts arayüzünden görür.
 */
import type Phaser from 'phaser';
import type { ChoiceLike } from '../engine';
import { resolveSignalingUrl, iceServersFor } from '../net/config';
import { FakeOpponent } from '../net/fake-opponent';
import { generateLobbyCode, generatePeerId, inviteLink, isValidLobbyCode, isValidPeerId } from '../net/lobby-code';
import { MpSession, type MatchResult, type Role, type SessionEvent } from '../net/session';
import { sanitizeName } from '../net/protocol';
import { WebRtcLink, type LinkError } from '../net/webrtc-link';
import { setBanner, toast } from '../ui/mp-overlay';
import type { MpBattleHooks, MpResultInfo, MpTeamHooks } from './mp-hooks';

export const MP_SCENE = 'MultiplayerScene';
const SCENES = ['BattleScene', 'TeamSelectScene', 'CampaignMapScene', 'MainMenuScene', MP_SCENE];
const STORE_KEY = 'protomedi.mp';
/** Yenilenen sekme bu süre içinde aynı lobiye kendiliğinden döner. */
const REJOIN_WINDOW_MS = 15 * 60 * 1000;

export type ClientState = 'idle' | 'connecting' | 'lobby' | 'error';

const cryptoRandom = (): number => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
};

const ERROR_TEXT: Record<LinkError, string> = {
  'no-lobby': 'No lobby with this code (it may have closed)',
  full: 'This lobby is full',
  taken: 'Lobby code is taken',
  'bad-request': 'Invalid lobby code',
  rate: 'Too many messages',
  unreachable: 'Cannot reach the multiplayer server',
};

interface Stored {
  code: string;
  role: Role;
  peerId: string;
  at: number;
}

function readStore(): Stored | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null') as Stored | null;
    if (!v || !isValidLobbyCode(v.code) || !isValidPeerId(v.peerId) || (v.role !== 'host' && v.role !== 'guest')) return null;
    return v;
  } catch {
    return null;
  }
}

function writeStore(v: Stored | null): void {
  try {
    if (v) sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* gizli sekme: yeniden bağlanma yalnızca aynı sayfada */
  }
}

const NAME_KEY = 'protomedi.mpName';

/** Kayıtlı oyuncu adı (localStorage; erişilemezse boş). */
export function loadName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* gizli sekme: yalnızca bu oturumda */
  }
}

/** Ekranda görünen ad: boşsa kurucu 'Player 1', katılan 'Player 2'. */
export const displayName = (name: string, role: Role): string => name || (role === 'host' ? 'Player 1' : 'Player 2');

/** Sonuç ekranı metni (saf). */
export function resultInfo(r: MatchResult, local: 'party' | 'enemy'): MpResultInfo {
  const won = r.winner === local;
  switch (r.reason) {
    case 'forfeit':
      return won ? { victory: true, subtitle: 'Your opponent did not come back' } : { victory: false, subtitle: 'You were disconnected for too long' };
    case 'left':
      return won ? { victory: true, subtitle: 'Your opponent left the battle' } : { victory: false, subtitle: 'You left the battle' };
    case 'failed':
      return { victory: false, title: 'NO CONTEST', subtitle: 'The connection could not be restored' };
    case 'desync':
      return { victory: false, title: 'NO CONTEST', subtitle: 'Desync detected - the match was stopped' };
    default:
      return { victory: won };
  }
}

export class MpClient {
  session: MpSession | null = null;
  link: WebRtcLink | null = null;
  fake: FakeOpponent | null = null;
  code = '';
  role: Role = 'host';
  state: ClientState = 'idle';
  error = '';
  latencyMs = 0;
  /** Debug: sahte rakip koptuktan sonra geri dönmesin. */
  fakeStaysAway = false;
  /** Debug: doğrudan WebRTC denemeden röleyle bağlan (kurucu ayarı; röle yedeğini iki sekmede denemek için). */
  forceRelay = false;
  /** Son kanal türü: doğrudan (WebRTC) ya da röle (Worker). */
  channelMode: 'direct' | 'relay' | null = null;
  private game: Phaser.Game | null = null;
  private peerId = '';
  private readonly listeners = new Set<() => void>();
  private timer = 0;
  private offSession: (() => void) | null = null;
  private remoteCbs = new Set<() => void>();
  private endedCbs = new Set<(r: MpResultInfo) => void>();
  private teamCbs = new Set<() => void>();
  private statusCbs = new Set<() => void>();

  attachGame(game: Phaser.Game): void {
    this.game = game;
  }

  /** Worker adresi (yoksa null: "Server not configured"). */
  serverUrl(): string | null {
    return resolveSignalingUrl(window.location.hostname, window.location.search);
  }

  get active(): boolean {
    return !!this.session;
  }

  get isFake(): boolean {
    return !!this.fake;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    for (const l of [...this.listeners]) l();
  }

  /** Yerel ve rakip adı (ekranda; boşsa Player 1/2). */
  names(): { local: string; remote: string } {
    const s = this.session;
    const other: Role = this.role === 'host' ? 'guest' : 'host';
    return { local: displayName(s?.localName ?? loadName(), this.role), remote: displayName(s?.remoteName ?? '', other) };
  }

  /** Adı değiştir (temizlenir, kaydedilir, bağlıysa rakibe doğrudan gider). */
  setName(raw: string): string {
    const name = sanitizeName(raw);
    saveName(name);
    this.session?.setName(name);
    this.changed();
    return name;
  }

  inviteLink(): string {
    const link = inviteLink(window.location.href, this.code);
    // Yerel test: yerel sunucu adresi (?mpserver=) davet linkinde de kalsın (yalnızca localhost'ta geçerli)
    const local = new URLSearchParams(window.location.search).get('mpserver');
    return local && this.serverUrl() === local.replace(/\/+$/, '') ? `${link}&mpserver=${encodeURIComponent(local)}` : link;
  }

  /** Bu sekmede yarım kalan lobi (sayfa yenilendi): kod ve rol. */
  pendingRejoin(): Stored | null {
    const s = readStore();
    return s && Date.now() - s.at < REJOIN_WINDOW_MS ? s : null;
  }

  // ------------------------------------------------------------ kurma / katılma

  host(): void {
    this.begin('host', generateLobbyCode(cryptoRandom), false);
  }

  join(code: string): void {
    this.begin('guest', code, false);
  }

  /** Sayfa yenilendiyse aynı lobiye aynı kimlikle dön (savaş sürüyorsa rakip kaldığımız yeri gönderir). */
  rejoin(s: Stored): void {
    this.peerId = s.peerId;
    this.begin(s.role, s.code, true);
  }

  private begin(role: Role, code: string, recovering: boolean): void {
    this.reset();
    const url = this.serverUrl();
    if (!url) {
      this.fail('Server not configured');
      return;
    }
    this.role = role;
    this.code = code;
    if (!recovering || !isValidPeerId(this.peerId)) this.peerId = generatePeerId(cryptoRandom);
    this.state = 'connecting';
    this.makeSession(role, recovering);
    this.channelMode = null;
    const link = new WebRtcLink(url, code, role, this.peerId, iceServersFor(url), {
      onWelcome: () => {
        this.state = 'lobby';
        writeStore({ code: this.code, role, peerId: this.peerId, at: Date.now() });
        this.changed();
      },
      onServer: (view) => {
        this.session?.setServer(view);
        this.changed();
      },
      onChannel: (t, mode) => {
        this.channelMode = mode;
        this.session?.setRelay(mode === 'relay'); // önce: röledeyken ad gönderilmez, kalp atışı seyrek
        this.session?.attach(t);
        this.changed();
      },
      onError: (e) => {
        if (e === 'taken' && role === 'host' && !recovering) {
          this.host(); // kod dolu: yeni kod
          return;
        }
        writeStore(null);
        this.fail(ERROR_TEXT[e] ?? 'Connection error');
      },
    }, { forceRelay: this.forceRelay && role === 'host' });
    link.latencyMs = this.latencyMs;
    this.link = link;
    link.start();
    this.changed();
  }

  /** Debug: sunucusuz, aynı sekmede sahte rakiple lobi. */
  hostWithFake(): void {
    this.reset();
    this.role = 'host';
    this.code = 'LOCAL';
    this.state = 'lobby';
    const s = this.makeSession('host', false);
    const fake = new FakeOpponent(s, { thinkMs: 900, returnAfterMs: 10_000 });
    fake.setLatency(this.latencyMs);
    fake.stayAway = this.fakeStaysAway;
    this.fake = fake;
    window.setTimeout(() => this.fake === fake && fake.connect(), 800);
    this.changed();
  }

  private makeSession(role: Role, recovering: boolean): MpSession {
    const s = new MpSession({ role, random: cryptoRandom, recovering, name: loadName() });
    this.session = s;
    this.offSession = s.on((e) => this.onSession(e));
    this.timer = window.setInterval(() => {
      s.tick();
      this.fake?.bot.tick();
      this.updateBanner();
    }, 250);
    return s;
  }

  private fail(message: string): void {
    this.reset();
    this.state = 'error';
    this.error = message;
    this.changed();
  }

  /** Bilerek ayrıl (Leave / Main Menu): rakibe ve sunucuya haber verilir. */
  leave(): void {
    if (!this.session) return;
    this.session.leave();
    writeStore(null);
    // Bağlantı 'leave' mesajı gittikten sonra kapanır
    const link = this.link;
    this.link = null;
    if (link) window.setTimeout(() => link.stop(true), 400);
    this.reset();
    this.state = 'idle';
    this.changed();
  }

  private reset(): void {
    this.offSession?.();
    this.offSession = null;
    window.clearInterval(this.timer);
    this.link?.stop(true);
    this.link = null;
    this.fake?.stop();
    this.fake = null;
    this.session = null;
    this.error = '';
    this.remoteCbs.clear();
    this.endedCbs.clear();
    this.teamCbs.clear();
    this.statusCbs.clear();
    setBanner('');
  }

  // ------------------------------------------------------------ oturum olayları -> sahneler

  private onSession(e: SessionEvent): void {
    const s = this.session;
    if (!s) return;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'lobby') this.goto(MP_SCENE, {});
        else if (e.phase === 'teams') this.goto('TeamSelectScene', { mp: this.teamHooks(), teams: undefined });
        break;
      case 'start':
        this.goto('BattleScene', { mp: this.battleHooks(), seed: e.lockstep.setup.seed, mode: 'turns', teams: undefined, campaign: undefined });
        break;
      case 'move':
        if (e.remote) for (const cb of [...this.remoteCbs]) cb();
        break;
      case 'ended':
        if (e.result.reason !== 'battle') {
          const info = resultInfo(e.result, s.localSide);
          for (const cb of [...this.endedCbs]) cb(info);
        }
        break;
      case 'team':
        for (const cb of [...this.teamCbs]) cb();
        break;
      case 'peer':
      case 'link':
        for (const cb of [...this.statusCbs]) cb();
        break;
      case 'desync':
        console.warn('[multiplayer] desync', e.desync);
        toast(`Desync detected (move ${e.desync.seq + 1})`, 6000);
        break;
      case 'peerLeft':
        toast('Your opponent left');
        break;
      case 'error':
        if (e.code === 'version') this.fail(e.message);
        else toast(e.message);
        break;
      case 'rematch':
        if (s.rematch.remote && !s.rematch.local) toast('Your opponent wants a rematch');
        break;
      default:
        break;
    }
    this.changed();
  }

  private goto(key: string, data: object): void {
    const g = this.game;
    if (!g) return;
    const cur = SCENES.find((k) => g.scene.isActive(k));
    if (cur === key && key === MP_SCENE) return; // lobi zaten açık: yalnızca yenilenir (changed)
    if (cur) (g.scene.getScene(cur) as Phaser.Scene).scene.start(key, data);
    else g.scene.start(key, data);
  }

  private teamHooks(): MpTeamHooks {
    const s = this.session!;
    return {
      localSide: s.localSide === 'party' ? 'party' : 'enemies',
      initial: s.team.local ? [...s.team.local] : null,
      setTeam: (cells, ready) => s.setTeam(cells, ready),
      myReady: () => s.team.localReady,
      opponentReady: () => s.team.remoteReady,
      opponentName: () => this.names().remote,
      onChange: (cb) => {
        this.teamCbs.add(cb);
        return () => this.teamCbs.delete(cb);
      },
    };
  }

  private battleHooks(): MpBattleHooks {
    const s = this.session!;
    const ls = s.lockstep!;
    return {
      localSide: s.localSide,
      battle: ls.battle,
      submit: (choice: ChoiceLike | null) => {
        const r = s.localMove(choice);
        if (!r.ok) toast(r.reason);
        return r.ok;
      },
      canAct: () => s.connected && !s.result && s.lockstep === ls,
      onRemote: (cb) => {
        this.remoteCbs.add(cb);
        return () => this.remoteCbs.delete(cb);
      },
      onEnded: (cb) => {
        this.endedCbs.add(cb);
        return () => this.endedCbs.delete(cb);
      },
      onStatus: (cb) => {
        this.statusCbs.add(cb);
        return () => this.statusCbs.delete(cb);
      },
      result: () => (s.result && s.lockstep === ls ? resultInfo(s.result, s.localSide) : null),
      names: () => this.names(),
      resultActions: () => [
        {
          label: 'Rematch',
          primary: true,
          run: () => {
            if (!s.connected) toast('Your opponent is not connected');
            s.requestRematch(true);
            toast('Waiting for your opponent...');
          },
        },
        { label: 'Back to lobby', run: () => s.backToLobby() },
      ],
    };
  }

  private updateBanner(): void {
    const s = this.session;
    if (!s || !s.everConnected) return setBanner('');
    const st = s.linkStatus();
    if (st.phase !== 'waiting') return setBanner('');
    const sec = Math.ceil(st.remainingMs / 1000);
    const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const text = st.who === 'peer' ? `Opponent disconnected - waiting ${clock}` : st.who === 'self' ? `Connection lost - reconnecting ${clock}` : `Reconnecting... ${clock}`;
    setBanner(text, st.who === 'self' ? 'error' : 'warn');
  }

  // ------------------------------------------------------------ debug

  setLatency(ms: number): void {
    this.latencyMs = ms;
    this.fake?.setLatency(ms);
    if (this.link) this.link.latencyMs = ms;
  }

  /** Debug: bağlantıyı kopar. Sahte rakip: rakip düşer (stayAway kapalıysa 10 sn sonra döner). Gerçek bağlantı: biz 10 sn düşeriz. */
  dropConnection(): void {
    if (this.fake) {
      this.fake.stayAway = this.fakeStaysAway;
      this.fake.drop();
      return;
    }
    const link = this.link;
    if (!link) return;
    link.stop(false);
    this.session?.dropChannel();
    window.setTimeout(() => {
      if (this.link === link) link.start();
    }, 10_000);
  }

  simulateDesync(): boolean {
    return this.session?.simulateDesync() ?? false;
  }

  /** Debug bilgisi (Data sekmesi). */
  info(): Record<string, string> {
    const s = this.session;
    if (!s) return { 'MP state': this.state + (this.error ? ` (${this.error})` : '') };
    const st = s.linkStatus();
    const v = this.link?.serverView;
    return {
      'MP role': `${this.role}${this.fake ? ' (fake opponent)' : ''}`,
      'MP code': this.code,
      'MP phase': s.phase,
      'MP link': `${s.connected ? 'connected' : 'not connected'} / ${st.phase}${st.phase === 'waiting' ? ` ${Math.ceil(st.remainingMs / 1000)}s` : ''}`,
      'MP server': v ? `${v.online ? 'online' : 'offline'}, opponent ${v.peerPresent ? 'present' : 'away'}` : '-',
      'MP moves': String(s.lockstep?.seq ?? 0),
      'MP hash': s.lockstep?.hash() ?? '-',
      'MP rejected msgs': String(s.rejected),
      'MP latency': `${this.latencyMs} ms`,
      'MP channel': this.fake ? 'loopback' : (this.channelMode ?? '-'),
      'MP server traffic': this.link ? `${this.link.stats.connects} connects, ${this.link.stats.sent} msgs (${this.link.stats.relaySent} relay)` : '-',
      'MP names': `${this.names().local} vs ${this.names().remote}`,
    };
  }
}

/** Tek örnek (sayfa başına bir multiplayer oturumu). */
export const mp = new MpClient();
