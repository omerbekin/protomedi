import { healAmount, magicDamage, physicalDamage } from './formulas';
import { Rng } from './rng';
import { advanceTurn, predictQueue, type TurnSlot } from './turn-order';
import type { BattleEvent, BattleMode, Combatant, CombatantDef, Formulas, Side, SkillDef } from './types';

export interface BattleSetup {
  seed: number;
  party: CombatantDef[];
  enemies: CombatantDef[];
  skills: Record<string, SkillDef>;
  formulas: Formulas;
  /** Çağrılabilecek birimlerin tanımları (id -> tanım). */
  units: Record<string, CombatantDef>;
  /** Her tarafın en fazla kaç yuvası var (çağrı için boş yer aranır). */
  maxSlots: { party: number; enemy: number };
  /** turns (varsayılan): hıza göre sıralı. test: sırasız, herkes istediği an oynar. */
  mode?: BattleMode;
}

export type ActionResult = { ok: true; events: BattleEvent[] } | { ok: false; reason: string };
export type CanUse = { ok: true } | { ok: false; reason: string };

type Listener = (event: BattleEvent) => void;

const opposite = (side: Side): Side => (side === 'party' ? 'enemy' : 'party');

/**
 * Savaş durumu ve kuralları. Saf TypeScript; aynı seed + aynı eylemler = aynı olaylar.
 * turns modunda sırası gelmeyen aktör oynayamaz; test modunda sıra yoktur.
 */
export class Battle {
  readonly seed: number;
  readonly mode: BattleMode;
  readonly combatants: Combatant[];
  readonly log: BattleEvent[] = [];
  winner: Side | null = null;
  /** turns modunda şu an sırası gelen aktörün uid'si (test modunda hep null). */
  currentUid: string | null = null;
  /** Şimdiye kadar oynanan (veya pas geçilen) tur sayısı. */
  turnsTaken = 0;

  private readonly rng: Rng;
  private readonly setup: BattleSetup;
  private readonly listeners = new Set<Listener>();
  private summonCount = 0;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.seed = setup.seed;
    this.mode = setup.mode ?? 'turns';
    this.rng = new Rng(setup.seed);
    this.combatants = [
      ...setup.party.map((d, i) => createCombatant(d, 'party', i, `party-${i}`)),
      ...setup.enemies.map((d, i) => createCombatant(d, 'enemy', i, `enemy-${i}`)),
    ];
    this.record({ type: 'battleStart', seed: this.seed, combatants: this.combatants.map(cloneCombatant) });
    if (this.mode === 'turns') this.advance((e) => this.record(e));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get formulas(): Formulas {
    return this.setup.formulas;
  }

  get(uid: string): Combatant | undefined {
    return this.combatants.find((c) => c.uid === uid);
  }

  living(side: Side): Combatant[] {
    return this.combatants.filter((c) => c.side === side && c.hp > 0);
  }

  /** Şu an sırası gelen aktör (turns modunda). */
  get currentActor(): Combatant | undefined {
    return this.currentUid ? this.get(this.currentUid) : undefined;
  }

  /** Sıra çubuğu: şu anki aktör + sonrakiler (uid listesi). Ölüm/çağrı sonrası yeniden hesaplanır. */
  turnQueue(count = this.setup.formulas.turn.queueLength): string[] {
    if (this.mode !== 'turns') return [];
    return predictQueue(this.turnSlots(), this.setup.formulas.turn.threshold, count, this.currentUid);
  }

  skill(skillId: string): SkillDef | undefined {
    return this.setup.skills[skillId];
  }

  /** Skill tek bir hedef seçilmesini gerektiriyor mu? */
  needsTargetChoice(skillId: string): boolean {
    const t = this.skill(skillId)?.target;
    return t === 'single_enemy' || t === 'single_ally';
  }

  /** Bu skill için seçilebilecek hedefler (çoklu hedefli skill'de: hepsi). */
  validTargets(actorUid: string, skillId: string): Combatant[] {
    const actor = this.get(actorUid);
    const skill = this.skill(skillId);
    if (!actor || !skill) return [];
    switch (skill.target) {
      case 'self':
        return [actor];
      case 'single_enemy':
      case 'all_enemies':
        return this.living(opposite(actor.side));
      case 'single_ally':
      case 'all_allies':
        return this.living(actor.side);
    }
  }

  /** Aktör şu an bu skill'i kullanabilir mi (sıra, bedel, yer, savaş durumu)? */
  canUse(actorUid: string, skillId: string): CanUse {
    if (this.winner) return { ok: false, reason: 'Battle is over' };
    const actor = this.get(actorUid);
    if (!actor) return { ok: false, reason: 'No such unit' };
    if (actor.hp <= 0) return { ok: false, reason: 'Unit is dead' };
    if (this.mode === 'turns' && this.currentUid !== actorUid) return { ok: false, reason: "Not this unit's turn" };
    if (!actor.skills.includes(skillId)) return { ok: false, reason: 'Unit does not have this skill' };
    const skill = this.skill(skillId);
    if (!skill) return { ok: false, reason: 'Unknown skill' };
    if (this.mode === 'turns' && (actor.cooldowns[skillId] ?? 0) > 0) return { ok: false, reason: 'On cooldown' };
    const { resource, amount } = skill.cost;
    if (resource === 'mp' && actor.mp < amount) return { ok: false, reason: 'Not enough MP' };
    if (resource === 'hp' && actor.hp <= amount) return { ok: false, reason: 'Not enough HP' };
    if (skill.effects.some((e) => e.type === 'summon') && this.freeSlot(actor.side) === null) {
      return { ok: false, reason: 'No free slot' };
    }
    return { ok: true };
  }

  /** Aktörün şu an kullanabileceği en az bir skill'i var mı? */
  hasUsableSkill(actorUid: string): boolean {
    return (this.get(actorUid)?.skills ?? []).some((id) => this.canUse(actorUid, id).ok);
  }

  useSkill(actorUid: string, skillId: string, targetUid?: string): ActionResult {
    const can = this.canUse(actorUid, skillId);
    if (!can.ok) return can;
    const actor = this.get(actorUid)!;
    const skill = this.skill(skillId)!;

    let targets = this.validTargets(actorUid, skillId);
    if (this.needsTargetChoice(skillId)) {
      const chosen = targets.find((c) => c.uid === targetUid);
      if (!chosen) return { ok: false, reason: 'Invalid target' };
      targets = [chosen];
    }

    const events: BattleEvent[] = [];
    const emit = (e: BattleEvent) => {
      events.push(e);
      this.record(e);
    };

    emit({ type: 'skillUsed', actor: actor.uid, skill: skill.id, targets: targets.map((t) => t.uid) });

    if (this.mode === 'turns' && (skill.cooldown ?? 0) > 0) actor.cooldowns[skill.id] = skill.cooldown!;

    const { resource, amount: cost } = skill.cost;
    if (cost > 0) {
      actor[resource] -= cost;
      emit({ type: 'resource', actor: actor.uid, resource, amount: cost, after: actor[resource] });
    }

    for (const effect of skill.effects) {
      switch (effect.type) {
        case 'damage':
          for (const target of targets) {
            if (target.hp <= 0) continue;
            this.applyDamage(actor, target, effect, emit);
          }
          break;
        case 'heal':
          for (const target of targets) {
            if (target.hp <= 0) continue;
            const amount = healAmount(actor.stats, effect.power, this.setup.formulas, this.rng);
            this.applyHeal(actor, target, amount, emit);
          }
          break;
        case 'shield':
          for (const target of targets) {
            if (target.hp <= 0) continue;
            const amount = Math.round(actor.stats[effect.stat] * effect.power);
            target.shield += amount;
            emit({ type: 'shield', source: actor.uid, target: target.uid, amount, shieldAfter: target.shield });
          }
          break;
        case 'summon': {
          const def = this.setup.units[effect.unit];
          const slot = this.freeSlot(actor.side);
          if (!def || slot === null) break;
          const summoned = createCombatant(def, actor.side, slot, `${actor.side}-s${this.summonCount++}`);
          summoned.summoned = true;
          this.combatants.push(summoned);
          emit({ type: 'summon', actor: actor.uid, combatant: cloneCombatant(summoned) });
          break;
        }
      }
    }

    this.finishAction(actor, emit);
    return { ok: true, events };
  }

  /** Turns modunda: sırası gelen aktör hiçbir şey yapamıyorsa (ör. MP bitti) turunu pas geçer. */
  skipTurn(): ActionResult {
    if (this.mode !== 'turns') return { ok: false, reason: 'Turns are only used in turn mode' };
    if (this.winner) return { ok: false, reason: 'Battle is over' };
    const actor = this.currentActor;
    if (!actor) return { ok: false, reason: 'No active unit' };
    const events: BattleEvent[] = [];
    const emit = (e: BattleEvent) => {
      events.push(e);
      this.record(e);
    };
    emit({ type: 'turnSkipped', actor: actor.uid });
    this.finishAction(actor, emit);
    return { ok: true, events };
  }

  /** Eylem sonrası: kazananı belirle, turns modunda sırayı ilerlet. */
  private finishAction(actor: Combatant, emit: (e: BattleEvent) => void): void {
    this.turnsTaken++;
    if (!this.winner) {
      if (this.living('enemy').length === 0) this.winner = 'party';
      else if (this.living('party').length === 0) this.winner = 'enemy';
      if (this.winner) emit({ type: 'battleEnd', winner: this.winner });
    }
    if (this.mode === 'turns' && !this.winner) {
      actor.turnCounter -= this.setup.formulas.turn.threshold;
      this.advance(emit);
    }
  }

  /** Sıradaki aktörü belirler ve turnStart olayını yayınlar. */
  private advance(emit: (e: BattleEvent) => void): void {
    const slots = this.turnSlots();
    const next = advanceTurn(slots, this.setup.formulas.turn.threshold);
    for (const s of slots) {
      const c = this.get(s.uid);
      if (c) c.turnCounter = s.counter;
    }
    this.currentUid = next?.uid ?? null;
    const actor = next ? this.get(next.uid) : undefined;
    if (!next || !actor) return;
    // Kendi turunun başında: bekleme süreleri 1 azalır, MP yenilenir
    for (const id of Object.keys(actor.cooldowns)) {
      actor.cooldowns[id] = Math.max(0, (actor.cooldowns[id] ?? 0) - 1);
      if (actor.cooldowns[id] === 0) delete actor.cooldowns[id];
    }
    const regen = Math.max(0, Math.min(actor.stats.mpRegen, actor.maxMp - actor.mp));
    if (regen > 0) {
      actor.mp += regen;
      emit({ type: 'mpRegen', actor: actor.uid, amount: regen, after: actor.mp });
    }
    emit({ type: 'turnStart', actor: next.uid, queue: this.turnQueue() });
  }

  private turnSlots(): TurnSlot[] {
    return this.combatants
      .filter((c) => c.hp > 0)
      .map((c) => ({ uid: c.uid, side: c.side, slot: c.slot, spd: c.stats.spd, counter: c.turnCounter }));
  }

  private applyDamage(
    actor: Combatant,
    target: Combatant,
    effect: Extract<SkillDef['effects'][number], { type: 'damage' }>,
    emit: (e: BattleEvent) => void,
  ): void {
    const bonus = effect.bonusVsTag && target.tags.includes(effect.bonusVsTag.tag) ? effect.bonusVsTag.multiplier : 1;
    const calc = effect.damageType === 'physical' ? physicalDamage : magicDamage;
    const total = calc(actor.stats, target.stats, effect.power * bonus, this.setup.formulas, this.rng, effect.ignoreDefense ?? 0);

    const absorbed = Math.min(target.shield, total);
    target.shield -= absorbed;
    const amount = total - absorbed;
    target.hp = Math.max(0, target.hp - amount);
    emit({
      type: 'damage',
      source: actor.uid,
      target: target.uid,
      amount,
      absorbed,
      hpAfter: target.hp,
      shieldAfter: target.shield,
    });

    if (effect.lifesteal && actor.hp > 0) {
      this.applyHeal(actor, actor, Math.round(amount * effect.lifesteal), emit);
    }
    if (target.hp === 0) emit({ type: 'death', target: target.uid });
  }

  private applyHeal(source: Combatant, target: Combatant, wanted: number, emit: (e: BattleEvent) => void): void {
    const amount = Math.max(0, Math.min(wanted, target.maxHp - target.hp));
    if (amount === 0 && source === target) return; // can emme: dolu canda boş olay üretme
    target.hp += amount;
    emit({ type: 'heal', source: source.uid, target: target.uid, amount, hpAfter: target.hp });
  }

  /** Çağrı için boş yuva: canlı birimi olmayan en yüksek numaralı yuva (arka sıra önce). */
  private freeSlot(side: Side): number | null {
    for (let slot = this.setup.maxSlots[side] - 1; slot >= 0; slot--) {
      if (!this.combatants.some((c) => c.side === side && c.slot === slot && c.hp > 0)) return slot;
    }
    return null;
  }

  private record(e: BattleEvent): void {
    this.log.push(e);
    for (const l of this.listeners) l(e);
  }
}

function createCombatant(def: CombatantDef, side: Side, slot: number, uid: string): Combatant {
  return {
    uid,
    defId: def.id,
    name: def.name,
    spriteId: def.spriteId,
    color: def.color,
    side,
    slot,
    stats: { ...def.stats },
    hp: def.stats.hp,
    maxHp: def.stats.hp,
    mp: def.stats.mp,
    maxMp: def.stats.mp,
    shield: 0,
    tags: [...(def.tags ?? [])],
    skills: [...def.skills],
    summoned: false,
    ai: def.ai,
    turnCounter: 0,
    cooldowns: {},
  };
}

function cloneCombatant(c: Combatant): Combatant {
  return { ...c, stats: { ...c.stats }, tags: [...c.tags], skills: [...c.skills], cooldowns: { ...c.cooldowns } };
}
