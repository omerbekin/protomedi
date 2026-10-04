import { rollCrit, rollDamage, rollDodge, rollHeal, shieldAmount } from './formulas';
import { Rng } from './rng';
import { damageSpecFor, type DamageEffect } from './spec';
import { armorReduction, attributePower } from './stats';
import { advanceTurn, predictQueue, type TurnSlot } from './turn-order';
import type { BattleEvent, BattleMode, Combatant, CombatantDef, Formulas, GroundDef, GroundEffect, Side, SkillDef, SkillEffect, Status, StatusDef } from './types';

export interface BattleSetup {
  seed: number;
  party: CombatantDef[];
  enemies: CombatantDef[];
  /** Her birimin yuvası (party/enemies ile aynı sırada); yoksa 0,1,2... */
  partySlots?: number[];
  enemySlots?: number[];
  skills: Record<string, SkillDef>;
  /** Buff/debuff tanımları (data/statuses.json). */
  statuses?: Record<string, StatusDef>;
  /** Yerde kalan etki tanımları (data/grounds.json). */
  grounds?: Record<string, GroundDef>;
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
type Emit = (event: BattleEvent) => void;

const opposite = (side: Side): Side => (side === 'party' ? 'enemy' : 'party');

/**
 * Savaş durumu ve kuralları. Saf TypeScript; aynı seed + aynı eylemler = aynı olaylar.
 * turns modunda sırası gelmeyen aktör oynayamaz; test modunda sıra yoktur.
 * Dizilim: her tarafın `formation.rows` sırası (0 = en önde) ve her sırada `formation.lanes` şeridi var; yuva = sıra * lanes + şerit.
 * Yakın dövüş skill'leri düşmanın en öndeki `formation.meleeRows` dolu sırasına vurabilir.
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
  /** Debug: true iken hiçbir skill MP harcamaz ve MP yetersizliği engel olmaz (iki taraf için de). */
  freeMp = false;

  /** Eşit sayaçta önce oynayan taraf: seed'e göre belirlenir ki hiçbir taraf kalıcı avantaj almasın. */
  private readonly tieFirst: Side;
  private readonly rng: Rng;
  private readonly setup: BattleSetup;
  private readonly listeners = new Set<Listener>();
  private readonly announcedDead = new Set<string>();
  private summonCount = 0;
  private groundCount = 0;
  /** Yerde duran (süreli) etkiler. */
  readonly ground: GroundEffect[] = [];

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.seed = setup.seed;
    this.mode = setup.mode ?? 'turns';
    this.rng = new Rng(setup.seed);
    this.tieFirst = (Math.imul(setup.seed >>> 0, 2654435761) >>> 16) % 2 === 0 ? 'party' : 'enemy';
    this.combatants = [
      ...setup.party.map((d, i) => createCombatant(d, 'party', setup.partySlots?.[i] ?? i, `party-${i}`)),
      ...setup.enemies.map((d, i) => createCombatant(d, 'enemy', setup.enemySlots?.[i] ?? i, `enemy-${i}`)),
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

  /** Bir tarafın canlı birimleri, öndekinden arkadakine (slot sırası). */
  livingByDepth(side: Side): Combatant[] {
    return this.living(side).sort((a, b) => a.slot - b.slot);
  }

  /** Bir durum tanımı (data/statuses.json); taunt/guard/regen gibi özel kodlu durumların tanımı yoktur. */
  statusDef(kind: string): StatusDef | undefined {
    return this.setup.statuses?.[kind];
  }

  /** Birimin üzerindeki durumların bir çarpanının (hız, alınan hasar, alınan şifa) çarpımı. */
  statusMult(c: Combatant, key: 'speedMult' | 'damageTakenMult' | 'healTakenMult'): number {
    let m = 1;
    for (const s of c.statuses) m *= this.statusDef(s.kind)?.[key] ?? 1;
    return m;
  }

  /** Alınan hasarın toplam çarpanı: durumlar (Fortified/Blessed...) x taunt eden dostun koruması (taunt'lı olmayan dostlar). */
  damageTakenMult(target: Combatant): number {
    let m = this.statusMult(target, 'damageTakenMult');
    if (!target.statuses.some((s) => s.kind === 'taunt')) {
      let protect = 1;
      for (const ally of this.living(target.side)) {
        if (ally.uid === target.uid) continue;
        for (const s of ally.statuses) if (s.kind === 'taunt' && s.allyMult !== undefined) protect = Math.min(protect, s.allyMult);
      }
      m *= protect;
    }
    return m;
  }

  /** Sıra hesabında kullanılan hız: stat x durum çarpanları (Slow/Haste). */
  speedOf(c: Combatant): number {
    return Math.max(1, Math.round(c.stats.spd * this.statusMult(c, 'speedMult')));
  }

  /** 'everyone' hedefli skill'lerde bir etkinin bu hedefe uygulanıp uygulanmadığı (diğer skill'lerde hep evet). */
  effectAppliesTo(skill: SkillDef, effect: SkillEffect, target: Combatant, actor: Combatant): boolean {
    if (skill.target !== 'everyone') return true;
    const alliedDefault = effect.type === 'heal' || effect.type === 'hot' || effect.type === 'shield' || effect.type === 'guard';
    const side = effect.side ?? (alliedDefault ? 'allies' : 'enemies');
    return (side === 'allies') === (target.side === actor.side);
  }

  private effectTargets(skill: SkillDef, effect: SkillEffect, targets: Combatant[], actor: Combatant): Combatant[] {
    return skill.target === 'everyone' ? targets.filter((c) => this.effectAppliesTo(skill, effect, c, actor)) : targets;
  }

  /** Zırh aurası (Defender gibi) dahil, savaştaki geçerli stat'lar. Aura yoksa gerçek stat nesnesi döner. */
  effectiveStats(c: Combatant): Combatant['stats'] {
    let bonus = 0;
    for (const a of this.combatants) {
      const e = a.passive?.effect;
      if (e?.type !== 'armorAura' || a.hp <= 0 || a.side !== c.side || a.board !== c.board) continue;
      const dr = Math.abs(this.rowOf(a.slot) - this.rowOf(c.slot));
      const dl = Math.abs(this.laneOf(a.slot) - this.laneOf(c.slot));
      if (dr + dl <= 1) bonus += e.armor;
    }
    return bonus > 0 ? { ...c.stats, armor: c.stats.armor + bonus } : c.stats;
  }

  /** Yuvanın sırası (0 = en önde) ve şeridi. */
  rowOf(slot: number): number {
    return Math.floor(slot / this.setup.formulas.formation.lanes);
  }

  laneOf(slot: number): number {
    return slot % this.setup.formulas.formation.lanes;
  }

  /** Şu an sırası gelen aktör (turns modunda). */
  get currentActor(): Combatant | undefined {
    return this.currentUid ? this.get(this.currentUid) : undefined;
  }

  /** Sıra çubuğu: şu anki aktör + sonrakiler (uid listesi). Ölüm/çağrı sonrası yeniden hesaplanır. */
  turnQueue(count = this.setup.formulas.turn.queueLength): string[] {
    if (this.mode !== 'turns') return [];
    return predictQueue(this.turnSlots(), this.setup.formulas.turn.threshold, count, this.currentUid, this.tieFirst);
  }

  skill(skillId: string): SkillDef | undefined {
    return this.setup.skills[skillId];
  }

  /** Skill tek bir hedef seçilmesini gerektiriyor mu? */
  needsTargetChoice(skillId: string): boolean {
    const t = this.skill(skillId)?.target;
    return t === 'single_enemy' || t === 'single_ally' || t === 'area_enemies' || t === 'column_enemies';
  }

  /** Çağrı skill'i mi (yeri oyuncu seçer)? */
  needsSlotChoice(skillId: string): boolean {
    return !!this.skill(skillId)?.effects.some((e) => e.type === 'summon');
  }

  /** Alan veya şerit skill'i mi (oyuncu bir merkez hücre seçer; hücre boş olabilir)? */
  isAreaSkill(skillId: string): boolean {
    const t = this.skill(skillId)?.target;
    return t === 'area_enemies' || t === 'column_enemies';
  }

  /** Skill'in şekli: merkez hücreye göre (satır farkı, şerit farkı) bu hücre kapsanıyor mu? */
  private inShape(skill: SkillDef, centerSlot: number, slot: number): boolean {
    const dr = Math.abs(this.rowOf(slot) - this.rowOf(centerSlot));
    const dl = Math.abs(this.laneOf(slot) - this.laneOf(centerSlot));
    if (skill.target === 'column_enemies') return dl === 0;
    const radius = skill.area?.radius ?? 1;
    if (dr === 0 || dl === 0) return Math.max(dr, dl) <= radius;
    return radius >= 2 && dr === 1 && dl === 1;
  }

  /** Alan/şerit skill'inin merkez hücreye göre kapsadığı tüm hücreler (boş olanlar dahil; gösterim için). */
  areaCells(skillId: string, centerSlot: number): number[] {
    const skill = this.skill(skillId);
    if (!skill) return [];
    const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
    return Array.from({ length: total }, (_, i) => i).filter((i) => this.inShape(skill, centerSlot, i));
  }

  /**
   * Alan/şerit skill'inin merkez hücreye göre vurduğu düşmanlar (slot sırasıyla).
   * area_enemies (radius 1): merkez + önü, arkası, sağı, solu (artı, çapraz yok). radius 2: öne/arkaya/sağa/sola 2'şer + çaprazlara 1'er.
   * column_enemies: merkezin şeridindeki herkes. Boş/ölü hücreler boşluktur; merkez hücre boş olabilir.
   */
  areaWindowAt(actorUid: string, skillId: string, centerSlot: number): Combatant[] {
    const skill = this.skill(skillId);
    if (!skill) return [];
    const actor = this.get(actorUid);
    const board = actor ? opposite(actor.side) : 'enemy';
    return this.validTargets(actorUid, skillId).filter((c) => c.board === board && this.inShape(skill, centerSlot, c.slot));
  }

  /** Merkez olarak seçilen birimin hücresine göre areaWindowAt. */
  areaWindow(actorUid: string, skillId: string, anchorUid: string): Combatant[] {
    const center = this.validTargets(actorUid, skillId).find((c) => c.uid === anchorUid);
    return center ? this.areaWindowAt(actorUid, skillId, center.slot) : [];
  }

  /** Çağrı skill'inin birimi hangi tahtaya koyacağı (kendi tahtası ya da düşmanın tahtası). */
  summonBoard(actorUid: string, skillId: string): Side {
    const actor = this.get(actorUid);
    const onEnemy = this.skill(skillId)?.effects.some((e) => e.type === 'summon' && e.onEnemyBoard);
    return actor ? (onEnemy ? opposite(actor.side) : actor.side) : 'party';
  }

  /** Bir tahtadaki çağrı için seçilebilecek boş yuvalar (küçükten büyüğe). */
  freeSlots(side: Side): number[] {
    const out: number[] = [];
    for (let slot = 0; slot < this.setup.maxSlots[side]; slot++) {
      if (!this.combatants.some((c) => c.board === side && c.slot === slot && c.hp > 0)) out.push(slot);
    }
    return out;
  }

  /** Yakın dövüş skill'i mi (menzili sınırlı: düşmanın en öndeki birimleri)? */
  isMelee(skillId: string): boolean {
    return this.skill(skillId)?.motion === 'melee';
  }

  /**
   * Bu skill için seçilebilecek hedefler (çoklu hedefli skill'de: hepsi).
   * Yakın dövüş menzille sınırlıdır; taunt'lı düşman varsa tek hedefli skill'ler yalnızca ona (menzildeyse) gider.
   */
  validTargets(actorUid: string, skillId: string): Combatant[] {
    const actor = this.get(actorUid);
    const skill = this.skill(skillId);
    if (!actor || !skill) return [];
    switch (skill.target) {
      case 'self':
        return [actor];
      case 'single_enemy':
      case 'area_enemies':
      case 'column_enemies':
      case 'random_enemies':
      case 'all_enemies': {
        let list = this.livingByDepth(opposite(actor.side));
        if (skill.motion === 'melee' && !skill.ignoreReach) {
          if (actor.board !== actor.side) {
            // Düşman tahtasına sızmış dost çağrı: yalnızca 1 birim yarıçapındaki (artı şekli) düşmanlara vurabilir
            list = list.filter((c) => c.board === actor.board && Math.abs(this.rowOf(c.slot) - this.rowOf(actor.slot)) + Math.abs(this.laneOf(c.slot) - this.laneOf(actor.slot)) <= 1);
          } else {
            // Ön sıra, düşmanın kendi tahtasındaki birimlere göre belirlenir; bizim tahtamıza sızan düşman çağrıları hep yakındadır
            const home = list.filter((c) => c.board === c.side);
            const rows = [...new Set(home.map((c) => this.rowOf(c.slot)))].slice(0, this.setup.formulas.formation.meleeRows);
            list = list.filter((c) => c.board !== c.side || rows.includes(this.rowOf(c.slot)));
          }
        }
        if (skill.target === 'single_enemy') {
          const taunters = list.filter((c) => c.statuses.some((s) => s.kind === 'taunt'));
          if (taunters.length > 0) list = taunters;
        }
        return list;
      }
      case 'single_ally':
      case 'all_allies':
        return this.livingByDepth(actor.side);
      case 'everyone':
        return [...this.livingByDepth(actor.side), ...this.livingByDepth(opposite(actor.side))];
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
    // Yakın dövüş yalnızca kendi takımının ön sırasındaki birimlerden yapılabilir (dash/charge gibi skill'ler ignoreFrontRow ile istisna olur)
    if (skill.motion === 'melee' && skill.target !== 'self' && !skill.ignoreFrontRow && !skill.ignoreReach && actor.board === actor.side && this.rowOf(actor.slot) !== this.frontRowOf(actor.side)) {
      return { ok: false, reason: 'Melee: front row only' };
    }
    const { resource, amount } = skill.cost;
    if (resource === 'mp' && !this.freeMp && actor.mp < amount) return { ok: false, reason: 'Not enough MP' };
    if (resource === 'hp' && actor.hp <= amount) return { ok: false, reason: 'Not enough HP' };
    if (skill.effects.some((e) => e.type === 'summon') && this.freeSlots(this.summonBoard(actorUid, skillId)).length === 0) {
      return { ok: false, reason: 'No free slot' };
    }
    if (this.validTargets(actorUid, skillId).length === 0) return { ok: false, reason: 'No target in reach' };
    return { ok: true };
  }

  /** Aktörün şu an kullanabileceği en az bir skill'i var mı? */
  hasUsableSkill(actorUid: string): boolean {
    return (this.get(actorUid)?.skills ?? []).some((id) => this.canUse(actorUid, id).ok);
  }

  useSkill(actorUid: string, skillId: string, targetUid?: string, slot?: number): ActionResult {
    const can = this.canUse(actorUid, skillId);
    if (!can.ok) return can;
    if (slot !== undefined && this.needsSlotChoice(skillId) && !this.freeSlots(this.summonBoard(actorUid, skillId)).includes(slot)) return { ok: false, reason: 'Invalid slot' };
    const actor = this.get(actorUid)!;
    const skill = this.skill(skillId)!;
    const f = this.setup.formulas;

    let targets = this.validTargets(actorUid, skillId);
    let centerSlot: number | undefined;
    const hit = new Set<string>();
    if (this.isAreaSkill(skillId)) {
      // Merkez: seçilen birimin hücresi ya da (boş olabilen) seçilen hücre
      const anchor = targetUid ? targets.find((c) => c.uid === targetUid) : undefined;
      const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
      const center = anchor ? anchor.slot : slot;
      if (center === undefined || !Number.isInteger(center) || center < 0 || center >= total) return { ok: false, reason: 'Invalid target' };
      targets = this.areaWindowAt(actorUid, skillId, center);
      centerSlot = center;
    } else if (skill.target === 'random_enemies') {
      // Rastgele (seed'li) farklı `count` düşman
      const pool = [...targets];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      targets = pool.slice(0, skill.count ?? 3).sort((x, y) => x.slot - y.slot);
    } else if (this.needsTargetChoice(skillId)) {
      const chosen = targets.find((c) => c.uid === targetUid);
      if (!chosen) return { ok: false, reason: 'Invalid target' };
      targets = [chosen];
    }

    const events: BattleEvent[] = [];
    const emit: Emit = (e) => {
      events.push(e);
      this.record(e);
    };

    emit({ type: 'skillUsed', actor: actor.uid, skill: skill.id, targets: targets.map((t) => t.uid), ...(centerSlot !== undefined ? { center: centerSlot } : {}) });

    if (this.mode === 'turns' && (skill.cooldown ?? 0) > 0) actor.cooldowns[skill.id] = skill.cooldown!;

    const { resource, amount: cost } = skill.cost;
    if (cost > 0 && !(resource === 'mp' && this.freeMp)) {
      actor[resource] -= cost;
      emit({ type: 'resource', actor: actor.uid, resource, amount: cost, after: actor[resource] });
    }

    for (const effect of skill.effects) {
      const ts = this.effectTargets(skill, effect, targets, actor);
      switch (effect.type) {
        case 'damage': {
          ts.forEach((target, idx) => {
            if (target.hp <= 0) return;
            // Şerit skill'inde her yeni hedef bir öncekinin `falloff` katı hasar alır (öndekinden arkadakine)
            const mult = effect.falloff ? Math.pow(effect.falloff, idx) : 1;
            const r = this.strike(actor, target, effect, emit, mult, idx === 0);
            if (!r.dodged) hit.add(target.uid);
          });
          // Shield Crush gibi: kullanıcının kalkanı tüm hedefler vurulduktan sonra tüketilir
          if (effect.bonusFromShield?.consume && actor.shield > 0) {
            const spent = actor.shield;
            actor.shield = 0;
            emit({ type: 'shield', source: actor.uid, target: actor.uid, amount: -spent, shieldAfter: 0, magicShieldAfter: actor.magicShield, magic: false });
          }
          break;
        }
        case 'heal':
          for (const target of ts) {
            if (target.hp <= 0) continue;
            const base = rollHeal(actor.stats, effect.scale, effect.power, f, this.rng);
            const { crit, mult } = rollCrit(actor.stats, this.rng); // kritik: şifanın SON çarpanı
            this.applyHeal(actor, target, Math.round(base * mult), crit, emit);
          }
          break;
        case 'hot':
          for (const target of ts) {
            if (target.hp <= 0) continue;
            this.addStatus(
              target,
              {
                kind: 'regen',
                turns: effect.turns,
                source: actor.uid,
                amount: Math.round(attributePower(actor.stats, effect.scale, f) * effect.power),
                critChance: actor.stats.critChance,
                critMult: actor.stats.critMult,
              },
              emit,
            );
          }
          break;
        case 'shield':
          for (const target of effect.self ? [actor] : ts) {
            if (target.hp <= 0) continue;
            const amount = shieldAmount(actor.stats, effect.scale, effect.power, f) + Math.round((effect.bonusPerMana ?? 0) * actor.mp); // kritik uygulanmaz
            const magic = effect.shieldType === 'magic';
            if (magic) target.magicShield += amount;
            else target.shield += amount;
            emit({ type: 'shield', source: actor.uid, target: target.uid, amount, shieldAfter: target.shield, magicShieldAfter: target.magicShield, magic });
          }
          break;
        case 'manaBurn': {
          let total = 0;
          for (const target of ts) {
            if (target.hp <= 0) continue;
            const burned = Math.min(target.mp, effect.amount);
            if (burned <= 0) continue;
            target.mp -= burned;
            total += burned;
            emit({ type: 'manaBurn', source: actor.uid, target: target.uid, amount: burned, mpAfter: target.mp });
          }
          const gain = Math.min(Math.floor(total * (effect.gainRatio ?? 0)), actor.maxMp - actor.mp);
          if (gain > 0) {
            actor.mp += gain;
            emit({ type: 'mpRegen', actor: actor.uid, amount: gain, after: actor.mp });
          }
          break;
        }
        case 'taunt':
          this.addStatus(actor, { kind: 'taunt', turns: effect.turns, source: actor.uid, taken: 0, ...(effect.allyDamageMult !== undefined ? { allyMult: effect.allyDamageMult } : {}), ...(effect.breakRatio ? { breakAt: Math.max(1, Math.round(actor.maxHp * effect.breakRatio)) } : {}) }, emit);
          break;
        case 'guard':
          for (const target of ts) {
            if (target.hp > 0) this.addStatus(target, { kind: 'guard', turns: effect.turns, source: actor.uid, share: effect.share }, emit);
          }
          break;
        case 'status': {
          // Hasar veren skill'lerde yalnızca gerçekten vurulanlar; hasar yoksa (saf buff/debuff) tüm hedefler
          const hasDamage = skill.effects.some((e) => e.type === 'damage');
          const recipients = effect.self ? [actor] : hasDamage ? ts.filter((c) => hit.has(c.uid)) : ts;
          for (const r of recipients) if (r.hp > 0) this.addStatus(r, { kind: effect.status, turns: effect.turns, source: actor.uid }, emit);
          break;
        }
        case 'ground': {
          if (centerSlot === undefined) break;
          const slots = this.areaCells(skillId, centerSlot);
          const g: GroundEffect = {
            id: `g${this.groundCount++}`,
            ground: effect.ground,
            board: opposite(actor.side),
            slots,
            turns: effect.turns,
            source: actor.uid,
            sourceSide: actor.side,
            amount: Math.round(attributePower(actor.stats, effect.scale, f) * effect.power),
          };
          this.ground.push(g);
          emit({ type: 'ground', id: g.id, ground: g.ground, board: g.board, slots: g.slots, turns: g.turns });
          break;
        }
        case 'selfDamage': {
          const amount = Math.min(actor.hp - 1, Math.round(actor.maxHp * effect.ratio));
          if (amount > 0) {
            actor.hp -= amount;
            emit({ type: 'damage', source: actor.uid, target: actor.uid, amount, absorbed: 0, hpAfter: actor.hp, shieldAfter: actor.shield, magicShieldAfter: actor.magicShield, crit: false });
          }
          break;
        }
        case 'summon': {
          const def = this.setup.units[effect.unit];
          const board = effect.onEnemyBoard ? opposite(actor.side) : actor.side;
          const spot = def ? (slot ?? this.defaultSummonSlot(board, def)) : null;
          if (!def || spot === null) break;
          const summoned = createCombatant(def, actor.side, spot, `${actor.side}-s${this.summonCount++}`);
          summoned.board = board;
          summoned.owner = actor.uid;
          summoned.summoned = true;
          summoned.lifespan = effect.lifespan;
          this.combatants.push(summoned);
          emit({ type: 'summon', actor: actor.uid, combatant: cloneCombatant(summoned) });
          // Pasif: Verdant Blessing, çağrı yapınca tüm dostları iyileştirir
          const pe = actor.passive?.effect;
          if (pe?.type === 'verdantBlessing') {
            emit({ type: 'passive', actor: actor.uid, passive: actor.passive!.id, name: actor.passive!.name });
            const amount = Math.round(attributePower(actor.stats, pe.scale, f) * pe.power);
            for (const ally of this.living(actor.side)) if (ally.hp < ally.maxHp) this.applyHeal(actor, ally, amount, false, emit);
          }
          break;
        }
      }
    }

    // Pasif: Spell Echo, cooldown'lu bir hasar skill'i bazen anında yeniden hazır olur
    const echo = actor.passive?.effect;
    if (echo?.type === 'spellEcho' && this.mode === 'turns' && (skill.cooldown ?? 0) > 0 && skill.effects.some((e) => e.type === 'damage') && this.rng.next() < echo.chance) {
      delete actor.cooldowns[skill.id];
      emit({ type: 'passive', actor: actor.uid, passive: actor.passive!.id, name: actor.passive!.name });
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
    const emit: Emit = (e) => {
      events.push(e);
      this.record(e);
    };
    emit({ type: 'turnSkipped', actor: actor.uid });
    this.finishAction(actor, emit);
    return { ok: true, events };
  }

  /** Eylem sonrası: çağrının süresi dolduysa kaldır, kazananı belirle, turns modunda sırayı ilerlet. */
  private finishAction(actor: Combatant, emit: Emit): void {
    this.turnsTaken++;
    if (this.mode === 'turns' && actor.summoned && actor.lifespan !== undefined && actor.hp > 0) {
      actor.lifespan--;
      if (actor.lifespan <= 0) {
        actor.hp = 0;
        emit({ type: 'despawn', target: actor.uid });
      }
    }
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

  /** Sıradaki aktörü belirler; onun turu başlarken bekleme, durum ve MP işlemlerini yapıp turnStart yayınlar. */
  private advance(emit: Emit): void {
    const slots = this.turnSlots();
    const next = advanceTurn(slots, this.setup.formulas.turn.threshold, this.tieFirst);
    for (const s of slots) {
      const c = this.get(s.uid);
      if (c) c.turnCounter = s.counter;
    }
    this.currentUid = next?.uid ?? null;
    const actor = next ? this.get(next.uid) : undefined;
    if (!next || !actor) return;
    // Kendi turunun başında: bekleme süreleri 1 azalır
    for (const id of Object.keys(actor.cooldowns)) {
      actor.cooldowns[id] = Math.max(0, (actor.cooldowns[id] ?? 0) - 1);
      if (actor.cooldowns[id] === 0) delete actor.cooldowns[id];
    }
    // Sersemlemiş (skipTurn) birim bu turu oynayamaz; durum süresi aşağıda azalmadan önce okunur
    let skipThisTurn = actor.statuses.some((st) => this.statusDef(st.kind)?.skipTurn);
    // Yerdeki etkiler: bu birimin hücresinde duran (düşman) etkiler hasar verir
    for (const g of [...this.ground]) {
      if (g.board !== actor.board || !g.slots.includes(actor.slot) || g.sourceSide === actor.side || actor.hp <= 0) continue;
      const src = this.get(g.source) ?? actor;
      const weak = actor.tags.reduce((m, tag) => m * (this.setup.formulas.weaknesses?.[tag]?.[this.setup.grounds?.[g.ground]?.element ?? 'physical'] ?? 1), 1);
      this.applyHit(src, actor, Math.round(g.amount * weak), 'magic', false, emit, false);
      this.announceIfDead(actor, emit);
    }
    // Bu birimin bıraktığı yer etkilerinin süresi azalır (bırakan ölmüşse etki biter)
    for (const g of [...this.ground]) {
      const src = this.get(g.source);
      if (g.source === actor.uid) g.turns--;
      if (g.turns <= 0 || !src || src.hp <= 0) {
        this.ground.splice(this.ground.indexOf(g), 1);
        emit({ type: 'groundEnd', id: g.id });
      }
    }
    if (actor.hp <= 0) skipThisTurn = true;
    // Süreli durumlar: tur bazlı şifa işler, süreler azalır, biten durumlar kalkar
    for (const status of [...actor.statuses]) {
      if (status.kind === 'regen' && actor.hp > 0) {
        const { crit, mult } = rollCrit({ critChance: status.critChance ?? 0, critMult: status.critMult ?? 1 }, this.rng);
        this.applyHeal(this.get(status.source) ?? actor, actor, Math.round((status.amount ?? 0) * mult), crit, emit);
      }
      status.turns--;
      if (status.turns <= 0) {
        actor.statuses = actor.statuses.filter((s) => s !== status);
        emit({ type: 'statusEnd', target: actor.uid, status: status.kind });
      }
    }
    // MP yenilenir
    const regen = Math.max(0, Math.min(actor.stats.mpRegen, actor.maxMp - actor.mp));
    if (regen > 0) {
      actor.mp += regen;
      emit({ type: 'mpRegen', actor: actor.uid, amount: regen, after: actor.mp });
    }
    // Pasif: Divine Light, tur başında en yaralı dostu iyileştirir
    const dl = actor.passive?.effect;
    if (dl?.type === 'divineLight' && actor.hp > 0 && !skipThisTurn) {
      const hurt = this.living(actor.side).filter((c) => c.hp < c.maxHp).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (hurt) {
        emit({ type: 'passive', actor: actor.uid, passive: actor.passive!.id, name: actor.passive!.name });
        this.applyHeal(actor, hurt, Math.round(attributePower(actor.stats, dl.scale, this.setup.formulas) * dl.power), false, emit);
      }
    }
    emit({ type: 'turnStart', actor: next.uid, queue: this.turnQueue() });
    if (skipThisTurn) {
      emit({ type: 'turnSkipped', actor: actor.uid, stunned: actor.hp > 0 });
      this.finishAction(actor, emit);
    }
  }

  private turnSlots(): TurnSlot[] {
    return this.combatants
      .filter((c) => c.hp > 0)
      .map((c) => ({ uid: c.uid, side: c.side, slot: c.slot, spd: this.speedOf(c), counter: c.turnCounter }));
  }

  private addStatus(target: Combatant, status: Status, emit: Emit): void {
    target.statuses = target.statuses.filter((s) => !(s.kind === status.kind && (status.kind !== 'regen' || s.source === status.source)));
    target.statuses.push(status);
    emit({ type: 'status', target: target.uid, status: status.kind, turns: status.turns, source: status.source });
  }

  /**
   * Tek bir hasar vuruşu: dodge (yalnızca fiziksel) -> zar -> kritik (SON çarpan) -> guard paylaşımı -> kalkan -> can.
   * `powerMult`: arkaya sıçrayan kısmî hasar için güç çarpanı.
   */
  private strike(actor: Combatant, target: Combatant, effect: DamageEffect, emit: Emit, powerMult: number, extras: boolean): { dodged: boolean } {
    const f = this.setup.formulas;
    if (effect.damageType === 'physical' && rollDodge(target.stats, this.rng)) {
      emit({ type: 'dodge', source: actor.uid, target: target.uid });
      return { dodged: true };
    }
    const spec = damageSpecFor(actor, target, effect, f, powerMult, extras, this.damageTakenMult(target));
    const targetStats = this.effectiveStats(target);
    const base = rollDamage(actor.stats, targetStats, spec, f, this.rng);
    const { crit, mult } = rollCrit(actor.stats, this.rng);
    const total = Math.max(f.damage.minDamage, Math.round(base * mult));

    const guard = target.statuses.find((s) => s.kind === 'guard');
    const guardian = guard ? this.get(guard.source) : undefined;
    let hpLoss: number;
    if (guard && guardian && guardian !== target && guardian.hp > 0) {
      const redirected = Math.round(total * (guard.share ?? 0.5));
      hpLoss = this.applyHit(actor, target, total - redirected, effect.damageType, crit, emit, false);
      if (redirected > 0) this.applyHit(actor, guardian, redirected, effect.damageType, crit, emit, true);
    } else {
      hpLoss = this.applyHit(actor, target, total, effect.damageType, crit, emit, false);
    }

    if (effect.lifesteal && actor.hp > 0) {
      this.applyHeal(actor, actor, Math.round(hpLoss * effect.lifesteal), false, emit);
    }
    // Pasif: Soul Drain, verilen her hasarın bir kısmı kullanıcıya şifa
    // (çağrılanların verdiği hasardan da sahibi faydalanır)
    const drainer = actor.passive?.effect.type === 'soulDrain' ? actor : actor.owner ? this.get(actor.owner) : undefined;
    const drain = drainer?.passive?.effect;
    if (drainer && drain?.type === 'soulDrain' && drainer.hp > 0 && hpLoss > 0) {
      this.applyHeal(drainer, drainer, Math.max(1, Math.round(hpLoss * drain.ratio)), false, emit);
    }
    // Pasif: Mana Overflow, büyü zırhının engellediği hasar birikir; eşikte tüm takıma mana
    const overflow = target.passive?.effect;
    if (overflow?.type === 'manaOverflow' && effect.damageType === 'magic' && target.hp > 0) {
      const r = armorReduction(targetStats.magicArmor, f);
      if (r > 0) {
        target.charge += (total * r) / (1 - r);
        while (target.charge >= overflow.threshold) {
          target.charge -= overflow.threshold;
          emit({ type: 'passive', actor: target.uid, passive: target.passive!.id, name: target.passive!.name });
          for (const ally of this.living(target.side)) {
            const gain = Math.min(overflow.mana, ally.maxMp - ally.mp);
            if (gain <= 0) continue;
            ally.mp += gain;
            emit({ type: 'mpRegen', actor: ally.uid, amount: gain, after: ally.mp });
          }
        }
      }
    }
    this.announceIfDead(target, emit);
    if (guardian) this.announceIfDead(guardian, emit);
    return { dodged: false };
  }

  /** Hasarı kalkana (büyüyse önce büyü kalkanına) ve cana uygular; canı düşüren miktarı döndürür. */
  private applyHit(actor: Combatant, target: Combatant, amount: number, type: 'physical' | 'magic', crit: boolean, emit: Emit, redirected: boolean): number {
    let rest = amount;
    let absorbed = 0;
    let pendingBreak = false;
    if (type === 'magic') {
      const a = Math.min(target.magicShield, rest);
      target.magicShield -= a;
      rest -= a;
      absorbed += a;
    }
    const b = Math.min(target.shield, rest);
    target.shield -= b;
    rest -= b;
    absorbed += b;
    target.hp = Math.max(0, target.hp - rest);
    const taunt = target.statuses.find((s) => s.kind === 'taunt' && s.breakAt !== undefined);
    if (taunt && rest > 0) {
      taunt.taken = (taunt.taken ?? 0) + rest;
      if (taunt.taken >= (taunt.breakAt ?? Infinity)) {
        target.statuses = target.statuses.filter((s) => s !== taunt);
        pendingBreak = true;
      }
    }
    emit({
      type: 'damage',
      source: actor.uid,
      target: target.uid,
      amount: rest,
      absorbed,
      hpAfter: target.hp,
      shieldAfter: target.shield,
      magicShieldAfter: target.magicShield,
      crit,
      ...(redirected ? { redirected: true } : {}),
    });
    if (pendingBreak) emit({ type: 'statusEnd', target: target.uid, status: 'taunt', broken: true });
    return rest;
  }

  private announceIfDead(c: Combatant, emit: Emit): void {
    if (c.hp > 0 || this.announcedDead.has(c.uid) || c.lifespan === 0) return;
    this.announcedDead.add(c.uid);
    emit({ type: 'death', target: c.uid });
    // Çağıran ölünce çağırdıkları da ölür
    for (const s of this.combatants) {
      if (s.owner === c.uid && s.hp > 0) {
        s.hp = 0;
        this.announceIfDead(s, emit);
      }
    }
  }

  private applyHeal(source: Combatant, target: Combatant, wantedRaw: number, crit: boolean, emit: Emit): void {
    const wanted = Math.round(wantedRaw * this.statusMult(target, 'healTakenMult')); // Wound gibi durumlar alınan şifayı azaltır
    const amount = Math.max(0, Math.min(wanted, target.maxHp - target.hp));
    if (amount === 0 && (source === target || wanted === 0)) return; // boş şifa olayı üretme
    target.hp += amount;
    emit({ type: 'heal', source: source.uid, target: target.uid, amount, hpAfter: target.hp, crit });
  }

  /**
   * Çağrı için varsayılan boş hücre (yapay zeka): yakın dövüşçüler ön sırada işe yarar, o yüzden onlar en öndeki boş hücreye,
   * diğerleri en arkadaki boş hücreye gider.
   */
  private defaultSummonSlot(side: Side, def: CombatantDef): number | null {
    const free = this.freeSlots(side);
    if (free.length === 0) return null;
    const melee = this.setup.skills[def.skills[0] ?? '']?.motion === 'melee';
    return melee ? free[0]! : free[free.length - 1]!;
  }

  /** Bir tarafın en önde duran canlı biriminin sırası (0 = en önde). */
  frontRowOf(side: Side): number {
    const rows = this.living(side).filter((c) => c.board === side).map((c) => this.rowOf(c.slot));
    return rows.length ? Math.min(...rows) : 0;
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
    ...(def.spriteScale ? { spriteScale: def.spriteScale } : {}),
    color: def.color,
    logo: def.logo,
    side,
    board: side,
    slot,
    stats: { ...def.stats },
    hp: def.stats.hp,
    maxHp: def.stats.hp,
    mp: def.stats.mp,
    maxMp: def.stats.mp,
    shield: 0,
    magicShield: 0,
    statuses: [],
    tags: [...(def.tags ?? [])],
    skills: [...def.skills],
    summoned: false,
    lifespan: undefined,
    ai: def.ai,
    ...(def.passive ? { passive: def.passive } : {}),
    charge: 0,
    turnCounter: 0,
    cooldowns: {},
  };
}

function cloneCombatant(c: Combatant): Combatant {
  return {
    ...c,
    stats: { ...c.stats },
    tags: [...c.tags],
    skills: [...c.skills],
    cooldowns: { ...c.cooldowns },
    statuses: c.statuses.map((s) => ({ ...s })),
  };
}
