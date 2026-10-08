/**
 * Debug sahte rakip (saf; tarayıcı gerekmez): aynı sekmede bellek içi loopback ile bağlanan ikinci bir MpSession (katılan rolü).
 * Lobide hazır olur, rastgele takım seçer, savaşta kendi birimlerini yapay zekayla oynar (yalnızca debug; gerçek multiplayer'da YZ yok),
 * rövanş isteğini kabul eder. `drop()` kanalı koparır; `stayAway` kapalıysa `returnAfterMs` sonra geri döner.
 */
import { chooseAction, content } from '../engine';
import { MpSession, TEAM_SIZE } from './session';
import { loopbackPair, type LoopbackEnd, type Timer } from './transport';

export interface FakeOpponentOptions {
  timer?: Timer;
  /** Hamle öncesi "düşünme" süresi (ms). */
  thinkMs?: number;
  /** Kopunca geri dönme süresi (ms). */
  returnAfterMs?: number;
  random?: () => number;
  now?: () => number;
}

export class FakeOpponent {
  readonly bot: MpSession;
  latencyMs = 0;
  /** true: koptuktan sonra geri dönmez (60 sn kuralını denemek için). */
  stayAway = false;
  private ends: [LoopbackEnd, LoopbackEnd] | null = null;
  private readonly timer: Timer;
  private readonly thinkMs: number;
  private readonly returnAfterMs: number;
  private readonly random: () => number;
  private stopped = false;
  private thinking = false;

  constructor(
    readonly host: MpSession,
    o: FakeOpponentOptions = {},
  ) {
    this.timer = o.timer ?? { setTimeout: (fn, ms) => setTimeout(fn, ms) };
    this.thinkMs = o.thinkMs ?? 700;
    this.returnAfterMs = o.returnAfterMs ?? 10_000;
    this.random = o.random ?? Math.random;
    this.bot = new MpSession({ role: 'guest', random: this.random, timer: this.timer, ...(o.now ? { now: o.now } : {}) });
    this.bot.on((e) => {
      if (this.stopped) return;
      if (e.type === 'phase' && e.phase === 'teams') this.later(() => this.pickTeam(), 400);
      if (e.type === 'lobby' && this.bot.phase === 'lobby' && this.bot.connected && !this.bot.ready.local) this.later(() => this.bot.setReady(true), 300);
      if (e.type === 'peer' && e.connected && this.bot.phase === 'lobby') this.later(() => this.bot.setReady(true), 300);
      if (e.type === 'start' || e.type === 'move' || (e.type === 'peer' && e.connected)) this.maybePlay();
      if (e.type === 'rematch' && this.bot.rematch.remote && !this.bot.rematch.local) this.later(() => this.bot.requestRematch(true), 400);
    });
  }

  /** Bağlan (ilk kez ya da geri dönüş). */
  connect(): void {
    if (this.stopped) return;
    const [a, b] = loopbackPair(this.timer);
    a.latencyMs = this.latencyMs;
    b.latencyMs = this.latencyMs;
    this.ends = [a, b];
    this.host.setServer({ online: true, peerPresent: true });
    this.bot.setServer({ online: true, peerPresent: true });
    this.bot.attach(b);
    this.host.attach(a);
  }

  setLatency(ms: number): void {
    this.latencyMs = ms;
    if (this.ends) for (const e of this.ends) e.latencyMs = ms;
  }

  /** Bağlantıyı koparır: sahte rakip "sunucudan da düşmüş" sayılır; stayAway kapalıysa sonra döner. */
  drop(): void {
    this.host.setServer({ online: true, peerPresent: false });
    this.ends?.[0].close();
    this.ends = null;
    if (!this.stayAway) this.later(() => this.connect(), this.returnAfterMs);
  }

  stop(): void {
    this.stopped = true;
    this.ends?.[0].close();
    this.ends = null;
  }

  private later(fn: () => void, ms: number): void {
    this.timer.setTimeout(() => {
      if (!this.stopped) fn();
    }, ms);
  }

  private pickTeam(): void {
    if (this.bot.phase !== 'teams') return;
    const seed = Math.floor(this.random() * 1_000_000);
    const cells = content.randomCells(content.randomTeam(seed, TEAM_SIZE, content.randomPool), seed);
    this.bot.setTeam(cells, true);
  }

  private maybePlay(): void {
    const ls = this.bot.lockstep;
    if (this.thinking || !ls || this.bot.result || !ls.isLocalTurn() || !this.bot.connected) return;
    this.thinking = true;
    this.later(() => {
      this.thinking = false;
      const now = this.bot.lockstep;
      if (now !== ls || this.bot.result || !ls.isLocalTurn() || !this.bot.connected) return;
      const actor = ls.battle.currentActor!;
      const choice = chooseAction(ls.battle, actor.uid, content.aiConfig);
      if (!(choice && this.bot.localMove(choice).ok)) {
        // YZ boş döndü (ya da seçim geçersiz): ilk kullanılabilir eylem, o da yoksa pas
        const b = ls.battle;
        const alt = b.legalActions(actor.uid).find((a) => a.ok);
        const target = alt && alt.kind === 'skill' ? b.validTargets(actor.uid, alt.id)[0]?.uid : undefined;
        if (!(alt && this.bot.localMove({ skillId: alt.id, ...(alt.slots?.length ? { slot: alt.slots[0]! } : {}), ...(target ? { targetUid: target } : {}) }).ok)) this.bot.localMove(null);
      }
      this.maybePlay();
    }, this.thinkMs);
  }
}
