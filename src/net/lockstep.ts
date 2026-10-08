/**
 * Lockstep (saf): iki istemci aynı seed + aynı takımlarla aynı savaşı kurar; ağdan yalnızca hamleler gider.
 * Her hamle iki tarafta motorda sınanır (sıra kilidi, taraf sahipliği, kurallar) ve durum özetiyle (stateHash) karşılaştırılır.
 * Ayrıntı: docs/design/multiplayer.md bölüm 4-6.
 */
import { Battle, content } from '../engine';
import type { ChoiceLike } from '../engine';
import { stateHash } from './state-hash';
import { toWireChoice, MAX_MOVES, type MoveRecord, type NetSide, type WireChoice } from './protocol';

export interface MatchSetup {
  match: string;
  seed: number;
  /** Kurucunun takımı (sol, party) ve katılanın takımı (sağ, enemies): 12 hücrelik listeler. */
  host: string[];
  guest: string[];
}

/** Kurucu sol tarafı (party), katılan sağ tarafı (enemy) oynar. */
export const sideOfRole = (role: 'host' | 'guest'): NetSide => (role === 'host' ? 'party' : 'enemy');

/** İki istemcide birebir aynı savaşı kurar (tek oyunculu Quick Battle'la aynı yol; debug ayarları uygulanmaz). */
export function createMatchBattle(setup: MatchSetup): Battle {
  return new Battle(content.battleSetup(content.DEFAULT_BATTLE, setup.seed, 'turns', { party: [...setup.host], enemies: [...setup.guest] }, false));
}

export interface Desync {
  seq: number;
  local: string;
  remote: string;
  /** 'before': gelen hamlenin öncesi tutmadı; 'ack': rakibin hamle sonrası özeti tutmadı; 'illegal': rakibin hamlesi bizde geçersiz. */
  kind: 'before' | 'ack' | 'illegal';
}

export type RemoteResult =
  | { ok: true; ack: { seq: number; hash: string } }
  | { ok: false; reason: 'wrong-match' | 'duplicate' | 'gap' | 'not-your-turn' | 'not-your-unit' | 'over' | 'desync' | 'illegal' | 'stopped'; detail?: string };

/** Pas (seçim yok) yalnızca birimin hiçbir eylemi yoksa geçerlidir; seçimli hamlede motorun kullanım kuralı. Geçerliyse null, değilse sebep. */
export function moveProblem(battle: Battle, actorUid: string, choice: ChoiceLike | null): string | null {
  const actor = battle.get(actorUid);
  if (!actor) return 'No such unit';
  if (battle.winner) return 'Battle is over';
  if (battle.currentUid !== actorUid) return "Not this unit's turn";
  if (!choice) {
    const any = actor.summoned ? battle.hasUsableSkill(actorUid) : battle.legalActions(actorUid).length > 0;
    return any ? 'Pass is only allowed without a usable action' : null;
  }
  if (battle.globalDef(choice.skillId)) {
    const g = battle.canUseGlobal(actorUid, choice.skillId, choice.slot);
    return g.ok ? null : g.reason;
  }
  const c = battle.canUse(actorUid, choice.skillId);
  return c.ok ? null : c.reason;
}

export class Lockstep {
  readonly moves: MoveRecord[] = [];
  /** Kendi hamlelerimizin sonrası özetleri (seq -> hash): rakibin ack'iyle karşılaştırılır. */
  private readonly afterHash = new Map<number, string>();
  desync: Desync | null = null;

  constructor(
    readonly battle: Battle,
    readonly setup: MatchSetup,
    readonly localSide: NetSide,
  ) {}

  get remoteSide(): NetSide {
    return this.localSide === 'party' ? 'enemy' : 'party';
  }

  get seq(): number {
    return this.moves.length;
  }

  hash(): string {
    return stateHash(this.battle);
  }

  /** Sıradaki birimin sahibi (savaş bittiyse null). */
  turnOwner(): NetSide | null {
    if (this.battle.winner) return null;
    return this.battle.currentActor?.side ?? null;
  }

  isLocalTurn(): boolean {
    return !this.desync && this.turnOwner() === this.localSide;
  }

  /** Yerel oyuncunun hamlesi: sınanır, uygulanır, gönderilecek kayıt döner. */
  local(choice: ChoiceLike | null): { ok: true; move: MoveRecord } | { ok: false; reason: string } {
    if (this.desync) return { ok: false, reason: 'Match stopped (desync)' };
    if (this.seq >= MAX_MOVES) return { ok: false, reason: 'Too many moves' };
    const actor = this.battle.currentActor;
    if (!actor) return { ok: false, reason: 'No active unit' };
    if (actor.side !== this.localSide) return { ok: false, reason: "Opponent's turn" };
    const problem = moveProblem(this.battle, actor.uid, choice);
    if (problem) return { ok: false, reason: problem };
    const move: MoveRecord = { seq: this.seq, actor: actor.uid, choice: toWireChoice(choice), before: this.hash() };
    const res = this.battle.applyChoice(actor.uid, choice);
    if (!res.ok) return { ok: false, reason: res.reason };
    this.moves.push(move);
    this.afterHash.set(move.seq, this.hash());
    return { ok: true, move };
  }

  /** Rakibin hamlesi: sıra, sahiplik, özet ve kural denetiminden geçerse uygulanır ve ack döner. */
  remote(match: string, move: MoveRecord): RemoteResult {
    if (match !== this.setup.match) return { ok: false, reason: 'wrong-match' };
    if (this.desync) return { ok: false, reason: 'stopped' };
    if (move.seq < this.seq) return { ok: false, reason: 'duplicate' };
    if (move.seq > this.seq) return { ok: false, reason: 'gap' };
    if (this.battle.winner) return { ok: false, reason: 'over' };
    if (this.battle.currentUid !== move.actor) return { ok: false, reason: 'not-your-turn' };
    if (this.battle.get(move.actor)?.side !== this.remoteSide) return { ok: false, reason: 'not-your-unit' };
    const before = this.hash();
    if (before !== move.before) {
      this.desync = { seq: move.seq, local: before, remote: move.before, kind: 'before' };
      return { ok: false, reason: 'desync' };
    }
    const choice = move.choice as (WireChoice & ChoiceLike) | null;
    const problem = moveProblem(this.battle, move.actor, choice);
    if (problem) return { ok: false, reason: 'illegal', detail: problem };
    const res = this.battle.applyChoice(move.actor, choice);
    if (!res.ok) return { ok: false, reason: 'illegal', detail: res.reason };
    this.moves.push({ ...move, choice: move.choice ? { ...move.choice } : null });
    return { ok: true, ack: { seq: move.seq, hash: this.hash() } };
  }

  /** Rakibin, bizim hamlemizden sonraki özeti. Tutmazsa desync. Bilinmeyen seq yok sayılır. */
  onAck(seq: number, hash: string): Desync | null {
    const mine = this.afterHash.get(seq);
    if (mine === undefined) return null;
    this.afterHash.delete(seq);
    if (mine !== hash && !this.desync) this.desync = { seq, local: mine, remote: hash, kind: 'ack' };
    return this.desync;
  }

  /** Yeniden bağlanma: `from`'dan itibaren kayıtlı hamleler (catchup mesajına). */
  movesFrom(from: number): MoveRecord[] {
    return this.moves.slice(from);
  }

  /** Kendi hamlemizi yeniden uygulama (catchup ile kendi kaydımız geri gelirse): seq doğrulanır, sahiplik serbest. Yeniden kurulumda kullanılır. */
  replay(move: MoveRecord): boolean {
    if (move.seq !== this.seq || this.battle.currentUid !== move.actor || this.desync) return false;
    if (this.hash() !== move.before) {
      this.desync = { seq: move.seq, local: this.hash(), remote: move.before, kind: 'before' };
      return false;
    }
    const choice = move.choice as (WireChoice & ChoiceLike) | null;
    if (moveProblem(this.battle, move.actor, choice)) return false;
    if (!this.battle.applyChoice(move.actor, choice).ok) return false;
    this.moves.push(move);
    return true;
  }
}
