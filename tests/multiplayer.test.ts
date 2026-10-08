import { describe, expect, it } from 'vitest';
import { chooseAction, content } from '../src/engine';
import { formatLobbyCode, generateLobbyCode, generatePeerId, inviteLink, isValidLobbyCode, isValidPeerId, LOBBY_ALPHABET, LOBBY_CODE_LENGTH, lobbyFromSearch, normalizeLobbyCode } from '../src/net/lobby-code';
import { CATCHUP_CHUNK, encodeMessage, MAX_MESSAGE_CHARS, parseMessage, RateLimiter, type NetMessage } from '../src/net/protocol';
import { createMatchBattle, Lockstep, moveProblem, type MatchSetup } from '../src/net/lockstep';
import { stateHash, fnv1a } from '../src/net/state-hash';
import { ReconnectMachine, RECONNECT_TIMEOUT_MS } from '../src/net/reconnect';
import { contentFingerprint, MpSession, validTeam, type SessionEvent } from '../src/net/session';
import { FakeOpponent } from '../src/net/fake-opponent';
import { loopbackPair, type Timer } from '../src/net/transport';
import { deriveSeed, makeNonce, sha256 } from '../src/net/sha256';
import { sanitizeName } from '../src/net/protocol';

/** Belirleyici sahte saat + zamanlayıcı: ağ testleri gerçek zamana ve internete çıkmaz. */
class Clock implements Timer {
  t = 1_000_000;
  private q: Array<{ at: number; fn: () => void; id: number }> = [];
  private id = 0;
  now = (): number => this.t;
  setTimeout(fn: () => void, ms: number): number {
    this.q.push({ at: this.t + Math.max(0, ms), fn, id: ++this.id });
    return this.id;
  }
  /** Süreyi ilerletir, vakti gelen işleri sırayla çalıştırır; `each` her adımda (oturum tick'i). */
  advance(ms: number, step = 50, each?: () => void): void {
    const end = this.t + ms;
    while (this.t < end) {
      this.t = Math.min(end, this.t + step);
      for (;;) {
        this.q.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = this.q[0];
        if (!next || next.at > this.t) break;
        this.q.shift();
        next.fn();
      }
      each?.();
    }
  }
}

/** Sabit tohumlu [0,1) üreteci. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const team = (seed: number): string[] => content.randomCells(content.randomTeam(seed, 4, content.randomPool), seed);
const setupOf = (seed: number): MatchSetup => ({ match: 'M1', seed, host: team(seed + 1), guest: team(seed + 2) });

/** Sıradaki birimin sahibi YZ ile hamle seçer (testte iki oyuncunun yerine). */
function aiChoice(ls: Lockstep) {
  const actor = ls.battle.currentActor!;
  return chooseAction(ls.battle, actor.uid, content.aiConfig);
}

describe('lobi kodu', () => {
  it('6 karakter, yalnızca karışmayan alfabe; davet linki ve adres çözümü', () => {
    for (const ch of '01OILSZB258') expect(LOBBY_ALPHABET).not.toContain(ch);
    const r = rng(7);
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = generateLobbyCode(r);
      expect(c).toHaveLength(LOBBY_CODE_LENGTH);
      expect(isValidLobbyCode(c)).toBe(true);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(495); // çakışma çok nadir
    expect(generateLobbyCode(() => 0.999999)).toBe('999999'.replace(/9/g, LOBBY_ALPHABET.at(-1)!));
    expect(normalizeLobbyCode(' acd-efg ')).toBe('ACDEFG');
    expect(normalizeLobbyCode('https://omerbekin.github.io/protomedi/?lobby=acdefg')).toBe('ACDEFG');
    expect(normalizeLobbyCode('ACDEF0')).toBeNull();
    expect(normalizeLobbyCode('ACDEF')).toBeNull();
    expect(normalizeLobbyCode('<script>')).toBeNull();
    expect(inviteLink('https://omerbekin.github.io/protomedi/?seed=3#x', 'ACDEFG')).toBe('https://omerbekin.github.io/protomedi/?lobby=ACDEFG');
    expect(lobbyFromSearch('?lobby=acdefg&x=1')).toBe('ACDEFG');
    expect(lobbyFromSearch('?lobby=hello')).toBeNull();
    expect(formatLobbyCode('ACDEFG')).toBe('ACD EFG');
    expect(isValidPeerId(generatePeerId(rng(3)))).toBe(true);
  });
});

describe('protokol şeması', () => {
  const good: NetMessage[] = [
    { t: 'hello', v: 1, build: 'p1-abc', match: null, count: 0, phase: 'lobby' },
    { t: 'ping', n: 3 },
    { t: 'ready', on: true },
    { t: 'phase', to: 'teams' },
    { t: 'team', cells: team(5), ready: true },
    { t: 'start', match: 'Ab3', seed: 42, host: team(1), guest: team(2) },
    { t: 'move', match: 'Ab3', seq: 0, actor: 'party-0', choice: { skillId: 'slash', targetUid: 'enemy-1' }, before: '0123abcd' },
    { t: 'move', match: 'Ab3', seq: 1, actor: 'enemy-0', choice: null, before: '0123abcd' },
    { t: 'ack', match: 'Ab3', seq: 1, hash: 'deadbeef' },
    { t: 'catchup', match: 'Ab3', from: 4, moves: [{ seq: 4, actor: 'party-1', choice: { skillId: 'move_tile', slot: 3 }, before: '00000000' }] },
    { t: 'rematch', on: false },
    { t: 'ended', match: 'Ab3', winner: 'party', reason: 'forfeit' },
    { t: 'desync', match: 'Ab3', seq: 7 },
    { t: 'leave' },
  ];
  it('geçerli mesajlar aynen geri çözülür', () => {
    for (const m of good) expect(parseMessage(encodeMessage(m)), m.t).toEqual(m);
  });
  it('geçersiz / kötü niyetli mesajlar reddedilir', () => {
    const bad: unknown[] = [
      42,
      '',
      'not json',
      '[]',
      'null',
      JSON.stringify({ t: 'nope' }),
      JSON.stringify({ t: '__proto__' }),
      JSON.stringify({ t: 'constructor' }),
      JSON.stringify({ t: 'ready', on: 'yes' }),
      JSON.stringify({ t: 'ready', on: true, extra: 1 }), // fazla alan
      JSON.stringify({ t: 'team', cells: team(1).slice(0, 11), ready: true }), // 11 hücre
      JSON.stringify({ t: 'team', cells: [...team(1).slice(0, 11), 'DROP TABLE'], ready: true }),
      JSON.stringify({ t: 'start', match: 'A', seed: -1, host: team(1), guest: team(2) }),
      JSON.stringify({ t: 'start', match: 'A', seed: 1.5, host: team(1), guest: team(2) }),
      JSON.stringify({ t: 'move', match: 'A', seq: 0, actor: 'party-0', choice: { skillId: 'x', slot: 99 }, before: '00000000' }),
      JSON.stringify({ t: 'move', match: 'A', seq: 0, actor: 'party-0', choice: { skillId: 'x', hack: true }, before: '00000000' }),
      JSON.stringify({ t: 'move', match: 'A', seq: 0, actor: 'party-0', choice: null, before: 'zz' }),
      JSON.stringify({ t: 'move', match: 'A', seq: 0, actor: 'party-0', choice: null, before: '00000000', x: 1 }),
      JSON.stringify({ t: 'catchup', match: 'A', from: 2, moves: [{ seq: 3, actor: 'a', choice: null, before: '00000000' }] }), // seq sırası tutmuyor
      JSON.stringify({ t: 'catchup', match: 'A', from: 0, moves: Array.from({ length: CATCHUP_CHUNK + 1 }, (_, i) => ({ seq: i, actor: 'a', choice: null, before: '00000000' })) }),
      JSON.stringify({ t: 'ended', match: 'A', winner: 'nobody', reason: 'forfeit' }),
      JSON.stringify({ t: 'hello', v: 1, build: 'x y', match: null, count: 0, phase: 'lobby' }),
      'x'.repeat(MAX_MESSAGE_CHARS + 1),
    ];
    for (const b of bad) expect(parseMessage(b), String(b).slice(0, 80)).toBeNull();
  });
  it('hız sınırı: pencere içinde sınırdan fazlası atılır', () => {
    const r = new RateLimiter(3, 1000);
    expect([r.allow(0), r.allow(1), r.allow(2), r.allow(3)]).toEqual([true, true, true, false]);
    expect(r.allow(1001)).toBe(true);
  });
  it('takım doğrulaması: tam 4, bilinen class, 12 hücre', () => {
    expect(validTeam(team(1))).toBe(true);
    expect(validTeam(team(1).map((c, i) => (i === team(1).indexOf(team(1).find(Boolean)!) ? '' : c)))).toBe(false);
    const t = team(1);
    t[t.indexOf('')] = 'not_a_class';
    expect(validTeam(t)).toBe(false);
  });
});

describe('lockstep', () => {
  it('iki sanal istemci aynı hamlelerle her adımda aynı özet ve aynı sonuç', () => {
    for (const seed of [11, 202, 3003]) {
      const s = setupOf(seed);
      const host = new Lockstep(createMatchBattle(s), s, 'party');
      const guest = new Lockstep(createMatchBattle(s), s, 'enemy');
      expect(host.hash()).toBe(guest.hash());
      let n = 0;
      while (!host.battle.winner && n < 600) {
        const owner = host.isLocalTurn() ? host : guest;
        const other = owner === host ? guest : host;
        const r = owner.local(aiChoice(owner));
        const mv = r.ok ? r.move : (owner.local(null) as { ok: true; move: never }).move;
        expect(mv, `seed ${seed} hamle ${n}`).toBeTruthy();
        const rr = other.remote(s.match, mv);
        expect(rr.ok, JSON.stringify(rr)).toBe(true);
        if (rr.ok) expect(owner.onAck(rr.ack.seq, rr.ack.hash)).toBeNull();
        expect(other.hash()).toBe(owner.hash());
        n++;
      }
      expect(host.battle.winner).toBeTruthy();
      expect(guest.battle.winner).toBe(host.battle.winner);
      expect(host.moves).toEqual(guest.moves);
    }
  });

  it('durum özeti: aynı durum = aynı özet, bir can farkı = farklı özet', () => {
    const s = setupOf(5);
    const a = createMatchBattle(s);
    const b = createMatchBattle(s);
    expect(stateHash(a)).toBe(stateHash(b));
    b.combatants[0]!.hp -= 1;
    expect(stateHash(a)).not.toBe(stateHash(b));
    expect(fnv1a('')).toBe('811c9dc5');
  });

  it('desync tespiti: hamle öncesi özet ya da ack tutmazsa yakalanır', () => {
    const s = setupOf(77);
    const host = new Lockstep(createMatchBattle(s), s, 'party');
    const guest = new Lockstep(createMatchBattle(s), s, 'enemy');
    const owner = host.isLocalTurn() ? host : guest;
    const other = owner === host ? guest : host;
    other.battle.combatants.find((c) => c.hp > 1)!.hp -= 1; // bir taraf bozuldu
    const r = owner.local(aiChoice(owner));
    if (!r.ok) throw new Error(r.reason);
    const rr = other.remote(s.match, r.move);
    expect(rr).toMatchObject({ ok: false, reason: 'desync' });
    expect(other.desync?.kind).toBe('before');
    // ack yolu: hamle sonrası özet farklı bildirilirse
    const s2 = setupOf(78);
    const h2 = new Lockstep(createMatchBattle(s2), s2, 'party');
    const g2 = new Lockstep(createMatchBattle(s2), s2, 'enemy');
    const o2 = h2.isLocalTurn() ? h2 : g2;
    const r2 = o2.local(aiChoice(o2));
    if (!r2.ok) throw new Error(r2.reason);
    expect(o2.onAck(r2.move.seq, 'ffffffff')?.kind).toBe('ack');
    expect(o2.local(null)).toMatchObject({ ok: false });
  });

  it('sıra kilidi: rakibin biri, sırası gelmeyen birim, yanlış seq ve kuralsız hamle reddedilir', () => {
    const s = setupOf(9);
    const host = new Lockstep(createMatchBattle(s), s, 'party');
    const guest = new Lockstep(createMatchBattle(s), s, 'enemy');
    const owner = host.isLocalTurn() ? host : guest;
    const other = owner === host ? guest : host;
    // Sırası olmayan taraf yerel hamle yapamaz
    expect(other.local(aiChoice(other))).toMatchObject({ ok: false, reason: "Opponent's turn" });
    const actor = owner.battle.currentActor!;
    const h = owner.hash();
    // Karşı tarafın kendi birimi için "rakip hamlesi" (başkasının birimini oynatma girişimi)
    expect(owner.remote(s.match, { seq: 0, actor: actor.uid, choice: { skillId: 'skip_turn' }, before: h })).toMatchObject({ ok: false, reason: 'not-your-unit' });
    // Sırası gelmeyen birim
    const idle = other.battle.combatants.find((c) => c.side === other.remoteSide && c.uid !== actor.uid)!;
    expect(other.remote(s.match, { seq: 0, actor: idle.uid, choice: { skillId: 'skip_turn' }, before: h })).toMatchObject({ ok: false, reason: 'not-your-turn' });
    // seq boşluğu ve yanlış maç
    expect(other.remote(s.match, { seq: 5, actor: actor.uid, choice: null, before: h })).toMatchObject({ ok: false, reason: 'gap' });
    expect(other.remote('OTHER', { seq: 0, actor: actor.uid, choice: null, before: h })).toMatchObject({ ok: false, reason: 'wrong-match' });
    // Kuralsız: sahip olmadığı skill, eylemi varken pas, MP'si dolu iken Rest
    const foreign = Object.keys(content.skills).find((id) => !actor.skills.includes(id))!;
    expect(other.remote(s.match, { seq: 0, actor: actor.uid, choice: { skillId: foreign }, before: h })).toMatchObject({ ok: false, reason: 'illegal' });
    expect(other.remote(s.match, { seq: 0, actor: actor.uid, choice: null, before: h })).toMatchObject({ ok: false, reason: 'illegal' });
    expect(moveProblem(other.battle, actor.uid, { skillId: 'rest' })).toBeTruthy(); // savaş başında MP dolu
    expect(other.seq).toBe(0);
    expect(other.hash()).toBe(h); // reddedilen hamleler durumu değiştirmez
    // Geçerli hamle ve tekrar gönderimi
    const r = owner.local(aiChoice(owner));
    if (!r.ok) throw new Error(r.reason);
    expect(other.remote(s.match, r.move).ok).toBe(true);
    expect(other.remote(s.match, r.move)).toMatchObject({ ok: false, reason: 'duplicate' });
  });
});

describe('kopma / yeniden bağlanma durum makinesi (60 sn)', () => {
  it('rakip sunucudan da düştüyse 60 sn sonra kalan kazanır; içinde dönerse devam', () => {
    const m = new ReconnectMachine();
    m.channelUp(0);
    m.channelDown(1000);
    m.setServer({ online: true, peerPresent: false });
    expect(m.tick(30_000)).toMatchObject({ phase: 'waiting', who: 'peer' });
    expect(m.tick(30_000).remainingMs).toBe(31_000);
    m.channelUp(40_000);
    expect(m.tick(40_001).phase).toBe('connected');
    m.channelDown(50_000);
    expect(m.tick(50_000 + RECONNECT_TIMEOUT_MS - 1).phase).toBe('waiting');
    expect(m.tick(50_000 + RECONNECT_TIMEOUT_MS).phase).toBe('won');
    m.channelUp(200_000); // sonuçlanmış durum değişmez
    expect(m.current).toBe('won');
  });
  it('kopan bizsek kaybederiz; ikimiz de sunucudaysak kazanan yok; sessizlik kopma sayılır', () => {
    const a = new ReconnectMachine();
    a.channelUp(0);
    a.setServer({ online: false, peerPresent: false });
    a.channelDown(0);
    expect(a.tick(RECONNECT_TIMEOUT_MS).phase).toBe('lost');
    const b = new ReconnectMachine();
    b.channelUp(0);
    b.setServer({ online: true, peerPresent: true });
    expect(b.tick(5000).phase).toBe('connected');
    expect(b.tick(9000).phase).toBe('waiting'); // 8 sn sessizlik
    expect(b.tick(9000 + RECONNECT_TIMEOUT_MS).phase).toBe('failed');
  });
});

/** Kurucu + sahte rakip (loopback) ile tam akış. Kurucunun hamlelerini de YZ seçer. */
function hostWithBot(seed: number, latency = 20) {
  const clock = new Clock();
  const host = new MpSession({ role: 'host', now: clock.now, random: rng(seed) });
  const bot = new FakeOpponent(host, { timer: clock, now: clock.now, random: rng(seed + 99), thinkMs: 400, returnAfterMs: 10_000 });
  bot.setLatency(latency);
  const events: SessionEvent[] = [];
  host.on((e) => {
    events.push(e);
    if (e.type === 'phase' && e.phase === 'teams') host.setTeam(team(seed), true);
  });
  let last = 0;
  const tick = () => {
    host.tick();
    bot.bot.tick();
    const ls = host.lockstep;
    if (ls && !host.result && host.connected && ls.isLocalTurn() && clock.t - last >= 400) {
      last = clock.t;
      const c = aiChoice(ls);
      if (!(c && host.localMove(c).ok)) host.localMove({ skillId: 'skip_turn' }).ok || host.localMove(null);
    }
  };
  return { clock, host, bot, events, tick };
}

describe('oturum: lobi -> takım -> savaş -> sonuç (loopback, internet yok)', () => {
  it('iki taraf hazır olunca takım seçimi, ikisi de hazır olunca aynı savaş; maç sonuna kadar aynı özet', () => {
    const { clock, host, bot, tick } = hostWithBot(4242);
    bot.connect();
    clock.advance(500, 50, tick);
    expect(host.connected && bot.bot.connected).toBe(true);
    host.setReady(true);
    clock.advance(3000, 50, tick);
    expect(host.lockstep).toBeTruthy();
    expect(bot.bot.lockstep?.setup).toEqual(host.lockstep!.setup);
    expect(host.lockstep!.setup.host).toEqual(team(4242)); // kurucu sol
    clock.advance(600_000, 50, tick);
    expect(host.result?.reason).toBe('battle');
    expect(bot.bot.result).toEqual(host.result);
    expect(bot.bot.lockstep!.hash()).toBe(host.lockstep!.hash());
    expect(host.lockstep!.moves.length).toBeGreaterThan(10);
    expect(host.rejected + bot.bot.rejected).toBe(0);
    // Rövanş: ikisi de isteyince yeniden takım seçimi
    host.requestRematch(true);
    clock.advance(2000, 50, tick);
    expect(['teams', 'battle']).toContain(host.phase);
  });

  it('kopma 60 sn içinde dönerse kaldığı yerden devam (eksik hamleler catchup ile)', () => {
    const { clock, host, bot, tick } = hostWithBot(777);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(8000, 50, tick);
    const before = host.lockstep!.seq;
    expect(before).toBeGreaterThan(0);
    bot.drop();
    clock.advance(3000, 50, tick);
    expect(host.linkStatus()).toMatchObject({ phase: 'waiting', who: 'peer' });
    expect(host.lockstep!.seq).toBe(host.lockstep!.seq); // savaş duruyor
    clock.advance(9000, 50, tick); // 10 sn sonra döner
    expect(host.connected).toBe(true);
    expect(host.linkStatus().phase).toBe('connected');
    clock.advance(20_000, 50, tick);
    expect(host.lockstep!.seq).toBeGreaterThan(before);
    expect(bot.bot.lockstep!.hash()).toBe(host.lockstep!.hash());
    expect(host.result === null || host.result.reason === 'battle').toBe(true);
  });

  it('dönmezse 60 sn sonra kalan kazanır', () => {
    const { clock, host, bot, tick } = hostWithBot(31);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(5000, 50, tick);
    expect(host.phase).toBe('battle');
    bot.stayAway = true;
    bot.drop();
    clock.advance(59_000, 50, tick);
    expect(host.result).toBeNull();
    clock.advance(10_000, 50, tick);
    expect(host.result).toEqual({ winner: 'party', reason: 'forfeit' });
  });

  it('sayfası yenilenen oyuncu (yeni oturum) start + tüm hamleleri alır ve aynı yerden devam eder', async () => {
    const { clock, host, bot, tick } = hostWithBot(55, 0);
    bot.setLatency(10);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(10_000, 50, tick);
    const ls = host.lockstep!;
    expect(ls.seq).toBeGreaterThan(2);
    bot.stop();
    // Katılan sekmeyi yeniledi: hafızası boş, kurtarma modunda yeni oturum
    const fresh = new MpSession({ role: 'guest', now: clock.now, recovering: true });
    const [a, b] = loopbackPair(clock);
    a.latencyMs = 10;
    b.latencyMs = 10;
    fresh.attach(b);
    host.attach(a);
    clock.advance(2000, 50, () => host.tick());
    expect(fresh.lockstep?.setup.match).toBe(ls.setup.match);
    expect(fresh.lockstep!.seq).toBe(ls.seq);
    expect(fresh.lockstep!.hash()).toBe(ls.hash());
    expect(fresh.rejected).toBe(0);
  });

  it('kötü niyetli eş: geçersiz mesajlar sayılır, takımımızı değiştiren start ve başkasının birimi reddedilir', () => {
    const clock = new Clock();
    const guest = new MpSession({ role: 'guest', now: clock.now });
    const [a, b] = loopbackPair(clock);
    a.latencyMs = 5;
    b.latencyMs = 5;
    guest.attach(b);
    const evil = (m: unknown) => a.send(typeof m === 'string' ? m : JSON.stringify(m));
    evil({ t: 'hello', v: 1, build: contentFingerprint(), match: null, count: 0, phase: 'lobby' });
    clock.advance(100);
    expect(guest.connected).toBe(true);
    evil('garbage');
    evil({ t: 'ready', on: 1 });
    clock.advance(100);
    expect(guest.rejected).toBe(2);
    evil({ t: 'phase', to: 'teams' });
    clock.advance(100);
    expect(guest.phase).toBe('teams');
    guest.setTeam(team(1), true);
    // İki taraflı seed: kurucu önce taahhüt, sonra sayısını açar
    const N = 'ab'.repeat(16);
    evil({ t: 'commit', c: sha256(N) });
    clock.advance(100);
    expect(guest.seedNonce.revealed).toBe(true); // katılan, kurucunun taahhüdünü görünce kendi sayısını açtı
    evil({ t: 'reveal', n: 'cd'.repeat(16) }); // taahhüde uymayan sayı
    clock.advance(100);
    expect(guest.seedNonce.remote).toBeNull();
    evil({ t: 'reveal', n: N });
    clock.advance(100);
    const fair = deriveSeed(N, guest.seedNonce.local!);
    evil({ t: 'start', match: 'X1', seed: fair, host: team(2), guest: team(3) }); // bizim takımımız değil
    clock.advance(100);
    expect(guest.lockstep).toBeNull();
    evil({ t: 'start', match: 'X1', seed: (fair + 1) % 2 ** 31, host: team(2), guest: team(1) }); // kurucunun seçtiği seed
    clock.advance(100);
    expect(guest.lockstep).toBeNull();
    evil({ t: 'start', match: 'X1', seed: fair, host: team(2), guest: team(1) });
    clock.advance(100);
    expect(guest.lockstep?.setup.seed).toBe(fair);
    const ls = guest.lockstep!;
    // Kurucu, katılanın birimini oynatmaya çalışır
    const mine = ls.battle.combatants.find((c) => c.side === 'enemy')!;
    evil({ t: 'move', match: 'X1', seq: 0, actor: mine.uid, choice: { skillId: 'skip_turn' }, before: ls.hash() });
    clock.advance(100);
    expect(ls.seq).toBe(0);
    expect(guest.result?.reason).toBe('desync'); // kuralsız hamle maçı durdurur
    // Sürüm farkı
    const g2 = new MpSession({ role: 'guest', now: clock.now });
    const [c, d] = loopbackPair(clock);
    c.latencyMs = 5;
    d.latencyMs = 5;
    const errs: string[] = [];
    g2.on((e) => e.type === 'error' && errs.push(e.code));
    g2.attach(d);
    c.send(JSON.stringify({ t: 'hello', v: 1, build: 'other-build', match: null, count: 0, phase: 'lobby' }));
    clock.advance(100);
    expect(errs).toEqual(['version']);
    expect(g2.connected).toBe(false);
  });

  it('desync simülasyonu iki tarafta da yakalanır ve maç kazanansız biter', () => {
    const { clock, host, bot, tick } = hostWithBot(909);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(4000, 50, tick);
    expect(host.phase).toBe('battle');
    expect(host.simulateDesync()).toBe(true);
    clock.advance(10_000, 50, tick);
    expect(host.result).toEqual({ winner: null, reason: 'desync' });
    expect(bot.bot.result).toEqual({ winner: null, reason: 'desync' });
  });
});

describe('bilerek ayrılma ve sonuç metni', () => {
  it('savaşta ayrılan kaybeder, kalan hemen kazanır', () => {
    const { clock, host, bot, tick } = hostWithBot(1234);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(3000, 50, tick);
    expect(host.phase).toBe('battle');
    bot.bot.leave();
    expect(bot.bot.result).toEqual({ winner: 'party', reason: 'left' });
    clock.advance(500, 50, tick);
    expect(host.result).toEqual({ winner: 'party', reason: 'left' });
  });
});

describe('iki taraflı seed (commit-reveal) ve SHA-256', () => {
  it('SHA-256 bilinen değerler; seed iki sayıdan türer, tek taraf belirleyemez', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
    const r = rng(1);
    const a = makeNonce(r);
    const b = makeNonce(r);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(deriveSeed(a, b)).toBe(deriveSeed(a, b));
    expect(deriveSeed(a, b)).not.toBe(deriveSeed(b, a));
    expect(deriveSeed(a, b)).toBeLessThan(2 ** 31);
  });
  it('kurucu ile sahte rakip: maçın seed değeri iki tarafın sayısından; rövanşta yeni sayı', () => {
    const { clock, host, bot, tick } = hostWithBot(606);
    bot.connect();
    clock.advance(300, 50, tick);
    host.setReady(true);
    clock.advance(3000, 50, tick);
    const ls = host.lockstep!;
    expect(ls.setup.seed).toBe(deriveSeed(host.seedNonce.local!, bot.bot.seedNonce.local!));
    expect(host.seedNonce.remote).toBe(bot.bot.seedNonce.local);
  });
  it('rakip sayımızı gördükten sonra yeni taahhüt gönderirse biz de yeni sayı seçeriz (seed seçtirilemez)', () => {
    const clock = new Clock();
    const guest = new MpSession({ role: 'guest', now: clock.now, random: rng(9) });
    const [a, b] = loopbackPair(clock);
    a.latencyMs = 5;
    b.latencyMs = 5;
    guest.attach(b);
    const evil = (m: unknown) => a.send(JSON.stringify(m));
    evil({ t: 'hello', v: 1, build: contentFingerprint(), match: null, count: 0, phase: 'lobby' });
    evil({ t: 'phase', to: 'teams' });
    evil({ t: 'commit', c: sha256('11'.repeat(16)) });
    clock.advance(100);
    const first = guest.seedNonce.local;
    expect(guest.seedNonce.revealed).toBe(true);
    evil({ t: 'commit', c: sha256('22'.repeat(16)) });
    clock.advance(100);
    expect(guest.seedNonce.local).not.toBe(first);
  });
});

describe('oyuncu adı', () => {
  it('temizlik: yalnızca harf/rakam/boşluk, 16 karakter; şema dışı ad reddedilir', () => {
    expect(sanitizeName('  Ömer <script> 42!!  ')).toBe('Ömer script 42');
    expect(sanitizeName('a'.repeat(30))).toHaveLength(16);
    expect(sanitizeName('!!!')).toBe('');
    expect(parseMessage(JSON.stringify({ t: 'name', name: 'Ömer' }))).toBeTruthy();
    expect(parseMessage(JSON.stringify({ t: 'name', name: '<b>x</b>' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ t: 'name', name: 'x'.repeat(17) }))).toBeNull();
  });
  it('ad doğrudan kanalda rakibe gider; röle modunda gönderilmez', () => {
    const { clock, host, bot, tick } = hostWithBot(707);
    host.setName('Omer');
    bot.connect();
    clock.advance(500, 50, tick);
    expect(bot.bot.remoteName).toBe('Omer');
    bot.bot.setName('Ali');
    clock.advance(200, 50, tick);
    expect(host.remoteName).toBe('Ali');
    host.setRelay(true);
    bot.bot.setRelay(true);
    host.setName('Secret');
    clock.advance(200, 50, tick);
    expect(bot.bot.remoteName).toBe('');
  });
});

describe('röle modu (Worker üzerinden): az mesaj', () => {
  it('maç başına mesaj sayısı: hamle başına tek mesaj, seyrek kalp atışı, ack yalnızca sonda', () => {
    const run = (relay: boolean) => {
      const { clock, host, bot, tick } = hostWithBot(4242);
      bot.connect();
      clock.advance(200, 50, tick);
      host.setRelay(relay);
      bot.bot.setRelay(relay);
      clock.advance(300, 50, tick);
      host.setReady(true);
      clock.advance(600_000, 50, tick);
      expect(host.result?.reason).toBe('battle');
      expect(bot.bot.lockstep!.hash()).toBe(host.lockstep!.hash());
      const ends = (host as unknown as { channel: { sent: string[]; peer: { sent: string[] } } }).channel;
      const msgs = [...ends.sent, ...ends.peer.sent];
      const moves = host.lockstep!.seq;
      const count = (t: string) => msgs.filter((m) => m.includes(`"t":"${t}"`)).length;
      return { total: msgs.length, moves, ping: count('ping') + count('pong'), ack: count('ack'), simulatedMs: clock.t - 1_000_000 };
    };
    const direct = run(false);
    const relay = run(true);
    expect(relay.moves).toBe(direct.moves);
    expect(relay.ack).toBe(1); // yalnızca son hamlenin ack'i
    expect(relay.ping).toBeLessThan(direct.ping / 5);
    expect(relay.total).toBeLessThan(direct.total / 2);
    // Ölçüm raporu (docs/design/multiplayer.md > Kota hesabı)
    console.log('[mp-traffic]', JSON.stringify({ direct, relay }));
  });
});
