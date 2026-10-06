import { damageRange, rollCrit, rollDamage, rollHeal, shieldAmount } from './formulas';
import { isShapeArea, shapeCells } from './area-shape';
import { pickSideNeighbors } from './formation';
import { betMultipliers, betStake } from './gamble';
import { Rng } from './rng';
import { damageSpecFor, type DamageEffect } from './spec';
import { armorReduction, attributePower, hitOutcome } from './stats';
import { advanceTurn, predictQueue, turnProgress, type TurnSlot } from './turn-order';
import type { ActionInfo, BattleAction, BattleEvent, BattleMode, BetSpec, Combatant, CombatantDef, Formulas, GlobalSkillDef, GroundDef, GroundEffect, Side, SkillDef, SkillEffect, Status, StatusDef } from './types';

export interface BattleSetup {
  seed: number;
  party: CombatantDef[];
  enemies: CombatantDef[];
  /** Her birimin yuvası (party/enemies ile aynı sırada); yoksa 0,1,2... */
  partySlots?: number[];
  enemySlots?: number[];
  skills: Record<string, SkillDef>;
  /** Global skill'ler (data/global-skills.json): rest / skip_turn / move_tile; yoksa hiçbir birim global skill kullanamaz. */
  globalSkills?: Record<string, GlobalSkillDef>;
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

/** Debug: hasar çarpanı ve kritik/kaçınma zorlaması (varsayılan: 1, auto, auto = oyun kuralı aynen). */
export interface DebugFlags {
  damageMult: number;
  /** always: her vuruş kritik; never: hiç kritik yok. */
  crit: 'auto' | 'always' | 'never';
  /** always: hasar veren her vuruş iska olur ('dodge' olayı: hedef kaçındı); never: hiç iska yok (dodge da miss de). */
  dodge: 'auto' | 'always' | 'never';
  /** always: hasar veren her vuruş 'miss' olur (saldıranın isabeti yetmedi); dodge 'always' ile birlikteyse dodge kazanır. Yoksa/auto: oyun kuralı. */
  miss?: 'auto' | 'always';
}

/** Yapay zeka (ya da arayüz) seçimini motora çevirmek için yapısal giriş: skillId bir class skill'i ya da global skill id'si olabilir. */
export interface ChoiceLike {
  skillId: string;
  targetUid?: string;
  /** Move Tile: hedef boş yuva. */
  slot?: number;
}

/** Global skill'in oyun içi sonucu için birim başına son eylem türü (yapay zeka salınımı önlemek için okur). */
export type LastActionKind = 'skill' | 'rest' | 'skip' | 'move' | 'pass';

export type ActionResult = { ok: true; events: BattleEvent[] } | { ok: false; reason: string };
export type CanUse = { ok: true } | { ok: false; reason: string };

type Listener = (event: BattleEvent) => void;

/** Bir eylemin (skill / global skill / pas) uygulanmadan hemen önceki bilgisi (BattleObserver.before). */
export interface ObservedAction {
  kind: 'skill' | 'global' | 'pass';
  actorUid: string;
  /** skill: skill id'si; global: global skill id'si. */
  id?: string;
  /** skill: vurulacak/etkilenecek birimler (alan skill'inde pencere); global move: yok. */
  targetUids?: string[];
  /** Alan/şerit skill'inde merkez hücre; Move Tile'da hedef yuva. */
  center?: number;
  /** Alan/şerit skill'inde kapsanan tüm hücreler (boş olanlar dahil). */
  cells?: number[];
}

/**
 * Salt-okunur gözlemci (maç kaydı için; src/engine/match-log.ts). Motorun durumunu ve rastgele sayı akışını DEĞİŞTİRMEZ: yalnızca çağrılır.
 * before: geçerli bir eylem, durum değişmeden hemen önce; after: eylem bitti (kazanan belirlendi, sıra henüz ilerlemedi). Sersemlik pasında before gelmez, yalnızca after gelir.
 */
export interface BattleObserver {
  before?(info: ObservedAction): void;
  after?(actorUid: string): void;
}
type Emit = (event: BattleEvent) => void;

const opposite = (side: Side): Side => (side === 'party' ? 'enemy' : 'party');

/**
 * Boş yuva "hedef kimliği": Move Tile'ın hedefi birim değil boş bir yuvadır (hedef türü 'empty_tile'). `targetUid` alanı taşıyan arayüz/YZ yolları
 * için yuva `tile:<yuva>` biçiminde yazılır; useSkill/act bunu yuvaya çevirir (slot parametresi de aynı işi görür).
 */
export const tileUid = (slot: number): string => `tile:${slot}`;
export const slotOfTileUid = (uid?: string): number | undefined => {
  const m = /^tile:(\d+)$/.exec(uid ?? '');
  return m ? Number(m[1]) : undefined;
};

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
  /** Debug bayrakları (yalnızca debug menüsünden değişir; varsayılanlar oyunu hiç etkilemez, rastgele sayı akışı da aynı kalır). */
  readonly debug: DebugFlags = { damageMult: 1, crit: 'auto', dodge: 'auto', miss: 'auto' };
  /** İsteğe bağlı gözlemci (maç kaydı); yoksa hiçbir şey değişmez. */
  observer: BattleObserver | null = null;
  /** debugCast sürerken true: menzil/taunt kısıtları yok sayılır. */
  private debugCasting = false;
  /** Şu an işlenen skill yakın dövüş (motion 'melee') mü: dikenli (thorns) durum yalnızca bu vuruşları yansıtır. */
  private castMelee = false;

  /** Eşit sayaçta önce oynayan taraf: seed'e göre belirlenir ki hiçbir taraf kalıcı avantaj almasın. */
  private readonly tieFirst: Side;
  private readonly rng: Rng;
  private readonly setup: BattleSetup;
  private readonly listeners = new Set<Listener>();
  private readonly announcedDead = new Set<string>();
  /** Luck-primary "Lucky Escape" hakkını kullanmış birimler. */
  private readonly luckySaved = new Set<string>();
  private summonCount = 0;
  /** Birim başına üst üste Skip Turn sayısı (başka bir eylem sıfırlar) ve son eylem türü. */
  private readonly skipStreak = new Map<string, number>();
  private readonly lastKind = new Map<string, LastActionKind>();
  /** Şu an işlenen skill'in Rage kazancı: hedef uid -> o hedefe yapılan vuruşların kazancı toplamı (yalnızca Rage'li kullanıcıda; yoksa null). */
  private rageTally: Map<string, number> | null = null;
  /** Başlangıç cooldown'u olan birimler: ilk turunun başında azalmayacak skill'ler (uid -> skill id'leri). */
  private readonly initialHold = new Map<string, Set<string>>();
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
    // Başlangıç cooldown'u (initialCooldown): yalnızca turns modunda ve class birimlerinde; test modunda cooldown zaten yok
    if (this.mode === 'turns') for (const c of this.combatants) this.applyInitialCooldowns(c);
    this.record({ type: 'battleStart', seed: this.seed, combatants: this.combatants.map(cloneCombatant) });
    if (this.mode === 'turns') this.advance((e) => this.record(e));
  }

  /**
   * Skill'lerin `initialCooldown` değerini sayaca yazar (üst sınır formulas.json > cooldown.maxInitial).
   * Sayaç normal cooldown sayacıdır; yalnızca birimin İLK turunun başındaki azalma atlanır, böylece skill, birimin
   * ilk N turunda kullanılamaz ve ilk turunda sayaç N gösterir.
   */
  private applyInitialCooldowns(c: Combatant): void {
    if (c.summoned) return;
    const max = this.setup.formulas.cooldown?.maxInitial ?? 0;
    for (const id of c.skills) {
      const n = Math.min(max, Math.floor(this.skill(id)?.initialCooldown ?? 0));
      if (n <= 0) continue;
      c.cooldowns[id] = n;
      let held = this.initialHold.get(c.uid);
      if (!held) this.initialHold.set(c.uid, (held = new Set()));
      held.add(id);
    }
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

  /** Birimin son eylem türü (skill / rest / skip / move / pass); henüz eylemi yoksa tanımsız. */
  lastActionOf(uid: string): LastActionKind | undefined {
    return this.lastKind.get(uid);
  }

  /** Birimin üst üste kaç kez Skip Turn kullandığı. */
  skipStreakOf(uid: string): number {
    return this.skipStreak.get(uid) ?? 0;
  }

  private noteAction(uid: string, kind: LastActionKind): void {
    this.lastKind.set(uid, kind);
    this.skipStreak.set(uid, kind === 'skip' ? (this.skipStreak.get(uid) ?? 0) + 1 : 0);
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

  /**
   * Yer etkisinin bir tikte hedefe vereceği büyü hasarı: ham miktar (bırakanın statından sabitlenmiş) x element zayıflığı x (1 - büyü zırhı azalması).
   * Kritik/isabet yok; sapma yok (tik sabit). Önizleme ve tik aynı fonksiyonu kullanır.
   */
  groundTickDamage(groundId: string, amount: number, target: Combatant): number {
    const f = this.setup.formulas;
    const weak = target.tags.reduce((m, tag) => m * (f.weaknesses?.[tag]?.[this.setup.grounds?.[groundId]?.element ?? 'physical'] ?? 1), 1);
    const red = armorReduction(this.effectiveStats(target).magicArmor, f);
    return Math.max(f.damage.minDamage, Math.round(amount * weak * (1 - red)));
  }

  /** Skip Turn hız desteği (birim uid -> +oran; 1 = %100): birimin bir sonraki turunun başlamasına kadar sürer. */
  private readonly speedBoost = new Map<string, number>();

  /** Birimin Skip Turn hız desteği (0 = yok; 1 = +%100: sayaç iki kat hızlı dolar). Bir sonraki turu başlayınca sıfırlanır. UI hız çubuğu/rozeti için. */
  speedBoostOf(uid: string): number {
    return this.speedBoost.get(uid) ?? 0;
  }

  /** Destek HARİÇ hız: stat x durum çarpanları (Slow/Haste). */
  baseSpeedOf(c: Combatant): number {
    return Math.max(1, Math.round(c.stats.spd * this.statusMult(c, 'speedMult')));
  }

  /**
   * Sıra hesabında kullanılan hız: stat x (durum çarpanları + Skip Turn desteği). Destek TOPLAMSALdır (yüzdeler toplanır):
   * Haste (x1,4) + %100 = x2,4; Slow (x0,7) + %100 = x1,7; durumsuz = x2.
   */
  speedOf(c: Combatant): number {
    const boost = this.speedBoostOf(c.uid);
    if (boost <= 0) return this.baseSpeedOf(c);
    return Math.max(1, Math.round(c.stats.spd * (this.statusMult(c, 'speedMult') + boost)));
  }

  /** Dex-primary Hunter's Mark: saldıran hedefinden daha HIZLIYSA (geçerli hız, Slow/Haste dahil; geçici Skip desteği hariç) hasar çarpanı 1 + hunterMark; değilse 1. */
  hunterMarkMult(actor: Combatant, target: Combatant): number {
    const m = actor.stats.hunterMark ?? 0;
    return m > 0 && this.baseSpeedOf(actor) > this.baseSpeedOf(target) ? 1 + m : 1;
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

  /**
   * Zırh aurası (Defender gibi) dahil, savaştaki geçerli stat'lar. Aura yoksa gerçek stat nesnesi döner.
   * Aura: kaynağın KENDİ zırhının pct'si, kendine ve artı şeklindeki komşu dostlara; bir birim en fazla maxStacks kaynaktan (en büyükler) alır.
   */
  effectiveStats(c: Combatant): Combatant['stats'] {
    const bonus = this.auraArmor(c);
    return bonus > 0 ? { ...c.stats, armor: c.stats.armor + bonus } : c.stats;
  }

  /** Birimin aldığı toplam aura zırhı (pasif armorAura kaynaklarından). */
  auraArmor(c: Combatant): number {
    const gains: number[] = [];
    let maxStacks = 1;
    for (const a of this.combatants) {
      const e = a.passive?.effect;
      if (e?.type !== 'armorAura' || a.hp <= 0 || a.side !== c.side || a.board !== c.board) continue;
      const dr = Math.abs(this.rowOf(a.slot) - this.rowOf(c.slot));
      const dl = Math.abs(this.laneOf(a.slot) - this.laneOf(c.slot));
      if (dr + dl > 1) continue;
      gains.push(a.stats.armor * e.pct);
      maxStacks = Math.max(maxStacks, e.maxStacks);
    }
    gains.sort((x, y) => y - x);
    return gains.slice(0, maxStacks).reduce((t, g) => t + g, 0);
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

  /** Birimin sıra sayacı doluluğu, 0-1 (SPEED çubuğu). Yalnızca turns modunda; test modunda ya da bilinmeyen/ölü birimde null. Salt okunur. */
  turnProgressOf(uid: string): number | null {
    const c = this.get(uid);
    if (this.mode !== 'turns' || !c || c.hp <= 0) return null;
    return turnProgress(c.turnCounter, this.setup.formulas.turn.threshold);
  }

  skill(skillId: string): SkillDef | undefined {
    return this.setup.skills[skillId];
  }

  /**
   * Yan vuruşlu (`splash`) tek hedef skill'inin, seçilen hedefin yanında vuracağı canlı düşmanlar (slot sırasıyla).
   * 'perpendicular': hedefin EKRANDA görünen üst ve alt komşusu (formulas.json > formation.sideNeighbors, layout koordinatlarından
   * üretilir; her yönün en yakın DOLU hücresi, boş/ölü hücre atlanır). Harita yoksa eski kural: aynı sıra, şerit farkı 1.
   */
  splashTargets(skillId: string, chosen: Combatant): Combatant[] {
    const skill = this.skill(skillId);
    if (!skill?.splash || skill.target !== 'single_enemy') return [];
    const map = this.setup.formulas.formation.sideNeighbors?.[chosen.board]?.[chosen.slot];
    if (map) {
      const alive = this.living(chosen.side).filter((c) => c.uid !== chosen.uid && c.board === chosen.board);
      return pickSideNeighbors(map, (slot) => alive.some((c) => c.slot === slot)).map((slot) => alive.find((c) => c.slot === slot)!);
    }
    const row = this.rowOf(chosen.slot);
    const lane = this.laneOf(chosen.slot);
    return this.living(chosen.side)
      .filter((c) => c.uid !== chosen.uid && c.board === chosen.board && this.rowOf(c.slot) === row && Math.abs(this.laneOf(c.slot) - lane) === 1)
      .sort((a, b) => a.slot - b.slot);
  }

  /** Skill tek bir hedef seçilmesini gerektiriyor mu? */
  needsTargetChoice(skillId: string): boolean {
    const t = this.skill(skillId)?.target;
    return t === 'single_enemy' || t === 'single_ally' || t === 'dead_ally' || t === 'area_enemies' || t === 'column_enemies';
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

  /** Şekil (hücre kümesi) tabanlı alan skill'i mi (area.shape: row | column | rect | plus)? Eski `area.radius` ve column_enemies skill'leri şekil DEĞİLdir (davranışları aynen). */
  isShapeSkill(skillId: string): boolean {
    const skill = this.skill(skillId);
    return skill?.target === 'area_enemies' && isShapeArea(skill.area);
  }

  /**
   * Alan/şerit skill'inin anchor (merkez) hücreye göre kapsadığı tüm hücreler (boş olanlar dahil; gösterim için), yuva sırasıyla.
   * `board`: hücrelerin ait olduğu tahta (varsayılan 'enemy'); yalnızca şekil skill'lerinde önemlidir (rect'in ekrandaki sol-alt köşesi tahtaya göre ayna).
   */
  areaCells(skillId: string, centerSlot: number, board: Side = 'enemy'): number[] {
    const skill = this.skill(skillId);
    if (!skill) return [];
    if (this.isShapeSkill(skillId)) return shapeCells(skill.area!, centerSlot, board, this.setup.formulas.formation);
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
    if (this.isShapeSkill(skillId)) {
      // Şekil hücre kümesi 'vurulabilir hücreler'i belirler; yakın dövüşte erişilemeyen (arkadaki) hücreler validTargets ile elenir
      const cells = new Set(this.areaCells(skillId, centerSlot, board));
      return this.validTargets(actorUid, skillId).filter((c) => c.board === board && cells.has(c.slot));
    }
    return this.validTargets(actorUid, skillId).filter((c) => c.board === board && this.inShape(skill, centerSlot, c.slot));
  }

  /**
   * UI için: bu alan skill'inin SEÇİLEBİLİR anchor hücreleri (hedef tahtasında, artan sırada). Boş hücre de anchor olabilir: şekil en az bir
   * vurulabilir (canlı, erişilebilir) düşmanı kapsıyorsa geçerlidir. Alan skill'i değilse boş liste.
   */
  shapeAnchors(actorUid: string, skillId: string): number[] {
    const actor = this.get(actorUid);
    if (!actor || !this.isAreaSkill(skillId)) return [];
    const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
    return Array.from({ length: total }, (_, i) => i).filter((i) => this.areaWindowAt(actorUid, skillId, i).length > 0);
  }

  /**
   * UI hover: anchor hücreye atılırsa kapsanan hücreler (tahtaya sığdırılmış), vurulacak birimler (uid, yuva sırasıyla) ve geçerlilik.
   * valid=false ise reason nedeni yazar; cells yine de döner (hücre aralık dışı değilse) ki UI şekli soluk gösterebilsin. Savaşı değiştirmez.
   */
  shapePreviewCells(actorUid: string, skillId: string, anchorSlot: number): { cells: number[]; targets: string[]; valid: boolean; reason?: string } {
    const actor = this.get(actorUid);
    const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
    if (!actor || !this.skill(skillId)) return { cells: [], targets: [], valid: false, reason: 'Unknown unit or skill' };
    if (!this.isAreaSkill(skillId)) return { cells: [], targets: [], valid: false, reason: 'Not an area skill' };
    if (!Number.isInteger(anchorSlot) || anchorSlot < 0 || anchorSlot >= total) return { cells: [], targets: [], valid: false, reason: 'Invalid cell' };
    const board = opposite(actor.side);
    const cells = this.areaCells(skillId, anchorSlot, board);
    const targets = this.areaWindowAt(actorUid, skillId, anchorSlot).map((c) => c.uid);
    if (targets.length > 0) return { cells, targets, valid: true };
    const inShape = this.livingByDepth(opposite(actor.side)).some((c) => c.board === board && cells.includes(c.slot));
    return { cells, targets, valid: false, reason: inShape ? 'No target in reach' : 'No enemy in the area' };
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
        if (skill.motion === 'melee' && !skill.ignoreReach && !this.debugCasting) {
          if (actor.board !== actor.side) {
            // Düşman tahtasına sızmış dost çağrı: yalnızca 1 birim yarıçapındaki (artı şekli) düşmanlara vurabilir
            list = list.filter((c) => c.board === actor.board && Math.abs(this.rowOf(c.slot) - this.rowOf(actor.slot)) + Math.abs(this.laneOf(c.slot) - this.laneOf(actor.slot)) <= 1);
          } else {
            // Ön sıra, düşmanın kendi tahtasındaki birimlere göre belirlenir; bizim tahtamıza sızan düşman çağrıları hep yakındadır
            const home = list.filter((c) => c.board === c.side);
            const rows = [...new Set(home.map((c) => this.rowOf(c.slot)))].slice(0, this.setup.formulas.formation.meleeRows + (skill.reach ?? 0));
            list = list.filter((c) => c.board !== c.side || rows.includes(this.rowOf(c.slot)));
          }
        }
        if (skill.target === 'single_enemy' && !this.debugCasting) {
          const taunters = list.filter((c) => c.statuses.some((s) => s.kind === 'taunt'));
          if (taunters.length > 0) list = taunters;
        }
        return list;
      }
      case 'single_ally':
      case 'all_allies':
        return this.livingByDepth(actor.side);
      case 'dead_ally':
        // Düşmüş dostlar (çağrılar hariç); yuvası başka bir birim tarafından doldurulduysa diriltilemez
        return this.combatants
          .filter((c) => c.side === actor.side && c.board === c.side && c.hp <= 0 && !c.summoned && !this.combatants.some((o) => o.hp > 0 && o.board === c.board && o.slot === c.slot))
          .sort((x, y) => x.slot - y.slot);
      case 'everyone':
        return [...this.livingByDepth(actor.side), ...this.livingByDepth(opposite(actor.side))];
      case 'empty_tile':
        return []; // hedef birim değil boş yuva: freeTiles(uid)
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
    if (skill.motion === 'melee' && skill.target !== 'self' && !skill.ignoreFrontRow && !skill.ignoreReach && actor.board === actor.side && this.rowOf(actor.slot) > this.frontRowOf(actor.side) + (skill.reach ?? 0)) {
      return { ok: false, reason: 'Melee: front row only' };
    }
    const { resource, amount } = skill.cost;
    if (resource === 'mp' && !this.freeMp && actor.mp < amount) return { ok: false, reason: 'Not enough MP' };
    if (resource === 'rage' && (actor.rage ?? 0) < amount) return { ok: false, reason: 'Not enough rage' };
    if (resource === 'hp' && actor.hp <= amount) return { ok: false, reason: 'Not enough HP' };
    if (skill.effects.some((e) => e.type === 'summon') && this.freeSlots(this.summonBoard(actorUid, skillId)).length === 0) {
      return { ok: false, reason: 'No free slot' };
    }
    if (this.validTargets(actorUid, skillId).length === 0) return { ok: false, reason: skill.target === 'dead_ally' ? 'No fallen ally' : 'No target in reach' };
    return { ok: true };
  }

  /** Aktörün şu an kullanabileceği en az bir skill'i var mı? */
  hasUsableSkill(actorUid: string): boolean {
    return (this.get(actorUid)?.skills ?? []).some((id) => this.canUse(actorUid, id).ok);
  }

  /** Class skill'i ya da (skillId global bir id ise) global skill kullanır; global skill'de `slot` Move Tile'ın hedef boş yuvasıdır. */
  useSkill(actorUid: string, skillId: string, targetUid?: string, slot?: number): ActionResult {
    if (this.globalDef(skillId)) return this.useGlobal(actorUid, skillId, slot ?? slotOfTileUid(targetUid));
    return this.cast(actorUid, skillId, targetUid, slot, false);
  }

  /** Tek giriş noktası: class skill'i ya da global skill ({kind:'global', id, slot?}). */
  act(actorUid: string, action: BattleAction): ActionResult {
    return action.kind === 'global' ? this.useGlobal(actorUid, action.id, action.slot ?? slotOfTileUid(action.targetUid)) : this.cast(actorUid, action.skillId, action.targetUid, action.slot, false);
  }

  /** Yapay zeka seçimini uygular; seçim yoksa (null) turu pas geçer (skipTurn). */
  applyChoice(actorUid: string, choice: ChoiceLike | null): ActionResult {
    if (!choice) return this.skipTurn();
    return this.useSkill(actorUid, choice.skillId, choice.targetUid, choice.slot);
  }

  /** Global skill tanımı (data/global-skills.json). */
  globalDef(id: string): GlobalSkillDef | undefined {
    return this.setup.globalSkills?.[id];
  }

  /** Bu savaşta tanımlı global skill id'leri (rest, skip_turn, move_tile). */
  globalSkillIds(): string[] {
    return Object.keys(this.setup.globalSkills ?? {});
  }

  /**
   * Birimin Move Tile için seçebileceği boş yuvalar (kendi tarafında, ÜZERİNDE CANLI BİRİM OLMAYAN yuvalar; küçükten büyüğe).
   * Kural (Ömer): ölü bir dostun yuvasına geçiş YASAK (diriltme için ayrılmıştır); bu yuvalar `fallenSlots` ile ayrıca verilir
   * (UI soluk "reserved" hücre gösterebilir). Çağrılar için freeSlots değişmedi. Düşman tahtasına sızmış birim hareket edemez.
   */
  freeTiles(actorUid: string): number[] {
    const actor = this.get(actorUid);
    if (!actor || actor.hp <= 0 || actor.board !== actor.side) return [];
    const reserved = new Set(this.fallenSlots(actor.side));
    return this.freeSlots(actor.side).filter((s) => !reserved.has(s));
  }

  /** Bir tarafın tahtasında diriltilmeyi bekleyen (düşmüş, çağrı olmayan) dostların boş yuvaları. */
  fallenSlots(side: Side): number[] {
    return this.combatants
      .filter((c) => c.side === side && c.board === side && c.hp <= 0 && !c.summoned && !this.combatants.some((o) => o.hp > 0 && o.board === side && o.slot === c.slot))
      .map((c) => c.slot)
      .sort((a, b) => a - b);
  }

  /**
   * Birimin `slot` yuvasındaki (varsayılan: şu anki) SIRA SIRALAMASI: kendi tahtasındaki canlı birimlerin dolu sıraları arasında kaçıncı (0 = en önde).
   * Düşmanın yakın dövüşü sıralamaya göre işler (meleeRows + reach'ten küçükse hedeflenebilir).
   */
  rowRank(uid: string, slot?: number): number {
    const c = this.get(uid);
    if (!c) return 0;
    const at = slot ?? c.slot;
    const rows = new Set(this.combatants.filter((o) => o.uid !== uid && o.hp > 0 && o.board === c.board && o.side === c.side).map((o) => this.rowOf(o.slot)));
    rows.add(this.rowOf(at));
    return [...rows].sort((a, b) => a - b).indexOf(this.rowOf(at));
  }

  /** Birim `slot` yuvasındayken yakın dövüş skill'i (reach ile) kullanabilir mi? (canUse'taki 'Melee: front row only' kuralı, varsayımsal yuva için). */
  canMeleeFrom(uid: string, slot: number, reach = 0): boolean {
    const c = this.get(uid);
    if (!c) return false;
    const rows = this.combatants.filter((o) => o.uid !== uid && o.hp > 0 && o.board === c.board && o.side === c.side).map((o) => this.rowOf(o.slot));
    const front = Math.min(this.rowOf(slot), ...rows);
    return this.rowOf(slot) <= front + reach;
  }

  /** Global skill şu an kullanılabilir mi (sıra, mod, MP dolu mu, üst üste skip sınırı, boş yuva)? `slot`: Move Tile hedefi (verilirse geçerli olmalı). */
  canUseGlobal(actorUid: string, id: string, slot?: number): CanUse {
    const def = this.globalDef(id);
    if (!def) return { ok: false, reason: 'Unknown action' };
    if (this.winner) return { ok: false, reason: 'Battle is over' };
    const actor = this.get(actorUid);
    if (!actor) return { ok: false, reason: 'No such unit' };
    if (actor.hp <= 0) return { ok: false, reason: 'Unit is dead' };
    if (actor.summoned) return { ok: false, reason: 'Summoned units cannot use this' };
    if (this.mode === 'turns' && this.currentUid !== actorUid) return { ok: false, reason: "Not this unit's turn" };
    if (def.turnsOnly && this.mode !== 'turns') return { ok: false, reason: 'Only in turn mode' };
    if (def.kind === 'rest') {
      if (actor.maxMp <= 0) return { ok: false, reason: 'No MP' };
      if (actor.mp >= actor.maxMp) return { ok: false, reason: 'MP is full' };
    } else if (def.kind === 'skip') {
      if (this.skipStreakOf(actorUid) >= (def.maxConsecutive ?? 1)) return { ok: false, reason: 'Cannot skip again' };
    } else {
      if (actor.board !== actor.side) return { ok: false, reason: 'Cannot move here' };
      const free = this.freeTiles(actorUid);
      if (free.length === 0) return { ok: false, reason: 'No empty cell' };
      if (slot !== undefined && this.fallenSlots(actor.side).includes(slot)) return { ok: false, reason: 'That cell is reserved for a fallen ally' };
      if (slot !== undefined && !free.includes(slot)) return { ok: false, reason: 'Invalid cell' };
    }
    return { ok: true };
  }

  /**
   * Global skill kullanır ve turu bitirir. rest: +def.mp MP (üst sınırı aşmaz; olay mpRegen). skip: turu geçer; sayaç normal düşer ama birimin bir sonraki turuna
   * kadar hızı +def.speedBonus (1 = %100: sayaç iki kat hızlı dolar, sıradaki tur yarı sürede gelir; olay turnSkipped voluntary + speedBoost), üst üste en çok
   * def.maxConsecutive kez; cooldown/MP sayaçları normal işler.
   * move: kendi tarafındaki boş `slot` yuvasına geçer (olay moved {actor, from, to}); sıra, ön sıra kuralı, aura/yan komşuluk, taunt/guard yeni yuvaya göre kendiliğinden güncellenir
   * (hepsi yuvadan hesaplanır). Olay akışı her zaman 'globalUsed' ile başlar.
   */
  useGlobal(actorUid: string, id: string, slot?: number): ActionResult {
    const def = this.globalDef(id);
    const can = this.canUseGlobal(actorUid, id, slot);
    if (!can.ok) return can;
    if (def!.kind === 'move' && slot === undefined) return { ok: false, reason: 'Pick an empty cell' };
    const actor = this.get(actorUid)!;
    const events: BattleEvent[] = [];
    const emit: Emit = (e) => {
      events.push(e);
      this.record(e);
    };
    this.observer?.before?.({ kind: 'global', actorUid, id, ...(slot !== undefined ? { center: slot } : {}) });
    emit({ type: 'globalUsed', actor: actor.uid, id });
    if (def!.kind === 'rest') {
      const gain = Math.min(def!.mp ?? 0, actor.maxMp - actor.mp);
      actor.mp += gain;
      emit({ type: 'mpRegen', actor: actor.uid, amount: gain, after: actor.mp });
    } else if (def!.kind === 'skip') {
      // Sayaç normal düşer (taşan kısım korunur); bunun yerine bir sonraki tura kadar hız +speedBonus (varsayılan %100) artar.
      const bonus = this.mode === 'turns' ? Math.max(0, def!.speedBonus ?? 1) : 0;
      if (bonus > 0) this.speedBoost.set(actor.uid, bonus);
      emit({ type: 'turnSkipped', actor: actor.uid, voluntary: true, ...(bonus > 0 ? { speedBoost: bonus } : {}) });
    } else {
      const from = actor.slot;
      actor.slot = slot!;
      emit({ type: 'moved', actor: actor.uid, from, to: actor.slot });
    }
    this.noteAction(actor.uid, def!.kind === 'rest' ? 'rest' : def!.kind === 'skip' ? 'skip' : 'move');
    this.finishAction(actor, emit);
    return { ok: true, events };
  }

  /** Aktörün şu an yapabileceği tüm eylemler: class skill'leri ve global skill'ler (ok: kullanılabilir mi, reason: neden değil, slots: Move Tile yuvaları). */
  listActions(actorUid: string): ActionInfo[] {
    const actor = this.get(actorUid);
    if (!actor) return [];
    const out: ActionInfo[] = actor.skills.map((id) => {
      const c = this.canUse(actorUid, id);
      return { kind: 'skill', id, ok: c.ok, ...(c.ok ? {} : { reason: c.reason }) };
    });
    for (const id of this.globalSkillIds()) {
      const c = this.canUseGlobal(actorUid, id);
      out.push({ kind: 'global', id, ok: c.ok, ...(c.ok ? {} : { reason: c.reason }), ...(this.globalDef(id)?.kind === 'move' && c.ok ? { slots: this.freeTiles(actorUid) } : {}) });
    }
    return out;
  }

  /** Şu an kullanılabilir (ok) eylemler. */
  legalActions(actorUid: string): ActionInfo[] {
    return this.listActions(actorUid).filter((a) => a.ok);
  }


  /**
   * Debug: skill'i bedel, bekleme, menzil, sıra ve kullanıcının skill listesi kurallarını yok sayarak oynatır (animasyon/ses galerisi).
   * Hedef geçersizse ilk uygun hedefe/hücreye gider. Sıra ilerlemez, MP/bekleme harcanmaz, savaş bitmez.
   */
  debugCast(actorUid: string, skillId: string, targetUid?: string, slot?: number): ActionResult {
    if (!this.get(actorUid)) return { ok: false, reason: 'No such unit' };
    if (!this.skill(skillId)) return { ok: false, reason: 'Unknown skill' };
    this.debugCasting = true;
    try {
      return this.cast(actorUid, skillId, targetUid, slot, true);
    } finally {
      this.debugCasting = false;
    }
  }

  private cast(actorUid: string, skillId: string, targetUid: string | undefined, slot: number | undefined, debug: boolean): ActionResult {
    if (!debug) {
      const can = this.canUse(actorUid, skillId);
      if (!can.ok) return can;
      if (slot !== undefined && this.needsSlotChoice(skillId) && !this.freeSlots(this.summonBoard(actorUid, skillId)).includes(slot)) return { ok: false, reason: 'Invalid slot' };
    }
    const actor = this.get(actorUid)!;
    const skill = this.skill(skillId)!;
    const f = this.setup.formulas;

    let targets = this.validTargets(actorUid, skillId);
    if (debug && targets.length === 0 && !this.needsSlotChoice(skillId)) return { ok: false, reason: skill.target === 'dead_ally' ? 'No fallen ally' : 'No target' };
    let centerSlot: number | undefined;
    let centerCells: number[] | undefined;
    const hit = new Set<string>();
    const splashUids = new Set<string>();
    if (this.isAreaSkill(skillId)) {
      // Merkez (anchor): seçilen birimin hücresi ya da (boş olabilen) seçilen hücre. Şekil skill'inde anchor birimi erişim dışında (arkada) da olabilir.
      const board = opposite(actor.side);
      const shape = this.isShapeSkill(skillId);
      const anchorUnit = targetUid ? (shape ? this.get(targetUid) : targets.find((c) => c.uid === targetUid)) : undefined;
      const anchor = anchorUnit && anchorUnit.hp > 0 && (!shape || anchorUnit.board === board) ? anchorUnit : undefined;
      const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
      const center = anchor ? anchor.slot : (slot ?? (debug ? targets[0]?.slot : undefined));
      if (center === undefined || !Number.isInteger(center) || center < 0 || center >= total) return { ok: false, reason: 'Invalid target' };
      targets = this.areaWindowAt(actorUid, skillId, center);
      if (shape && !debug && targets.length === 0) return { ok: false, reason: 'No target in the area' };
      centerSlot = center;
      centerCells = this.areaCells(skillId, center, board);
    } else if (skill.target === 'random_enemies') {
      // Rastgele (seed'li) farklı `count` düşman
      const pool = [...targets];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      targets = pool.slice(0, skill.count ?? 3).sort((x, y) => x.slot - y.slot);
    } else if (this.needsTargetChoice(skillId)) {
      const chosen = targets.find((c) => c.uid === targetUid) ?? (debug ? targets[0] : undefined);
      if (!chosen) return { ok: false, reason: 'Invalid target' };
      targets = [chosen];
      // Yan vuruşlu (splash) skill: seçilen hedefin yanındaki hücreler de vurulur (ilk hedef = seçilen)
      for (const s of this.splashTargets(skillId, chosen)) {
        targets.push(s);
        splashUids.add(s.uid);
      }
    }

    const events: BattleEvent[] = [];
    const emit: Emit = (e) => {
      events.push(e);
      this.record(e);
    };

    if (!debug) this.observer?.before?.({ kind: 'skill', actorUid, id: skillId, targetUids: targets.map((t) => t.uid), ...(centerSlot !== undefined ? { center: centerSlot, cells: centerCells } : {}) });
    emit({ type: 'skillUsed', actor: actor.uid, skill: skill.id, targets: targets.map((t) => t.uid), ...(centerSlot !== undefined ? { center: centerSlot, anchor: centerSlot, cells: centerCells } : {}) });

    if (!debug && this.mode === 'turns' && (skill.cooldown ?? 0) > 0) actor.cooldowns[skill.id] = skill.cooldown!;

    const { resource, amount: cost } = skill.cost;
    if (!debug && cost > 0 && !(resource === 'mp' && this.freeMp)) {
      if (resource === 'rage') {
        actor.rage = (actor.rage ?? 0) - cost;
        emit({ type: 'rage', actor: actor.uid, delta: -cost, after: actor.rage, max: actor.maxRage ?? 0 });
      } else {
        actor[resource] -= cost;
        emit({ type: 'resource', actor: actor.uid, resource, amount: cost, after: actor[resource] });
      }
    }

    // Rage'li kullanıcı: bu skill'in isabet eden hasar vuruşları hedef başına toplanır (strike doldurur), skill bitince tek kazanç olarak işlenir
    this.rageTally = !debug && actor.maxRage !== undefined ? new Map() : null;
    this.castMelee = skill.motion === 'melee';
    for (const effect of skill.effects) {
      const ts = this.effectTargets(skill, effect, targets, actor);
      switch (effect.type) {
        case 'damage': {
          // Bahis: skill başına bir kez zar atılır; kazanç/kayıp çarpanı tüm vuruşlara uygulanır
          const betMult = effect.bet ? this.rollBet(actor, effect.bet, emit) : 1;
          let repeatAnnounced = false;
          if (betMult > 0) {
            ts.forEach((target, idx) => {
              if (target.hp <= 0) return;
              // Şerit skill'inde her yeni hedef bir öncekinin `falloff` katı hasar alır (öndekinden arkadakine)
              const mult = (effect.falloff ? Math.pow(effect.falloff, idx) : 1) * betMult * (splashUids.has(target.uid) ? skill.splash?.mult ?? 1 : 1);
              const r = this.strike(actor, target, effect, emit, mult, idx === 0);
              if (r.landed) hit.add(target.uid);
              // Çifte vuruş: aynı vuruş bir kez daha (zar her hedef için bir kez atılır)
              if (effect.repeatChance && this.rng.next() < effect.repeatChance && target.hp > 0) {
                if (!repeatAnnounced) {
                  repeatAnnounced = true;
                  emit({ type: 'passive', actor: actor.uid, passive: 'gamble_double', name: 'Double Hit' });
                }
                const r2 = this.strike(actor, target, effect, emit, mult, false);
                if (r2.landed) hit.add(target.uid);
              }
            });
          }
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
        case 'revive':
          for (const target of ts) {
            if (target.hp > 0) continue;
            target.hp = Math.max(1, Math.round(target.maxHp * effect.hpRatio));
            target.mp = Math.round(target.maxMp * effect.mpRatio);
            target.shield = 0;
            target.magicShield = 0;
            target.statuses = [];
            target.turnCounter = 0;
            if (target.maxRage !== undefined) target.rage = 0;
            this.announcedDead.delete(target.uid);
            emit({ type: 'revive', source: actor.uid, target: target.uid, hpAfter: target.hp, mpAfter: target.mp });
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
        case 'randomStatus': {
          const hasDamage = skill.effects.some((e) => e.type === 'damage');
          const recipients = hasDamage ? ts.filter((c) => hit.has(c.uid)) : ts;
          const total = effect.options.reduce((a, o) => a + o.weight, 0);
          for (const r of recipients) {
            if (r.hp <= 0 || total <= 0) continue;
            let roll = this.rng.next() * total;
            const pick = effect.options.find((o) => (roll -= o.weight) < 0) ?? effect.options[effect.options.length - 1]!;
            this.addStatus(r, { kind: pick.status, turns: pick.turns, source: actor.uid }, emit);
          }
          break;
        }
        case 'ground': {
          if (centerSlot === undefined) break;
          const slots = centerCells ?? this.areaCells(skillId, centerSlot, opposite(actor.side));
          const g: GroundEffect = {
            id: `g${this.groundCount++}`,
            ground: effect.ground,
            board: opposite(actor.side),
            slots,
            turns: effect.turns,
            source: actor.uid,
            sourceSide: actor.side,
            amount: Math.round(attributePower(actor.stats, effect.scale, f) * effect.power),
            scale: effect.scale,
            sourceStat: actor.stats[effect.scale],
            power: effect.power,
          };
          this.ground.push(g);
          emit({ type: 'ground', id: g.id, ground: g.ground, board: g.board, slots: g.slots, turns: g.turns });
          break;
        }
        case 'thorns':
          this.addStatus(actor, { kind: 'thorns', turns: effect.turns, source: actor.uid, amount: Math.round(attributePower(actor.stats, effect.scale, f) * effect.power) }, emit);
          break;
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

    this.castMelee = false;

    // Rage kazancı: skill başına tek (en yüksek tek hedefin toplamı; perCastCap ile sınırlı), yalnızca isabet eden hasar vuruşlarından
    if (this.rageTally && this.rageTally.size > 0 && actor.maxRage !== undefined) {
      const cap = f.rage.perCastCap;
      const gain = Math.round(Math.min(cap, Math.max(...this.rageTally.values())));
      const after = Math.min(actor.maxRage, (actor.rage ?? 0) + gain);
      const delta = after - (actor.rage ?? 0);
      this.rageTally = null;
      if (delta > 0) {
        actor.rage = after;
        emit({ type: 'rage', actor: actor.uid, delta, after, max: actor.maxRage });
      }
    }
    this.rageTally = null;

    // Int-primary Mana Echo: skill sonrası ihtimalle MP bedelinin yarısı (yukarı yuvarla, en az 1) geri gelir; bedelsiz skill'de zar atılmaz
    if (!debug && resource === 'mp' && cost > 0 && !this.freeMp && (actor.stats.manaEcho ?? 0) > 0 && this.rng.next() < actor.stats.manaEcho) {
      const back = Math.min(Math.max(1, Math.ceil(cost / 2)), actor.maxMp - actor.mp);
      emit({ type: 'passive', actor: actor.uid, passive: 'primary_int', name: 'Mana Echo' });
      if (back > 0) {
        actor.mp += back;
        emit({ type: 'mpRegen', actor: actor.uid, amount: back, after: actor.mp });
      }
    }

    // Pasif: Spell Echo, cooldown'lu bir hasar skill'i bazen anında yeniden hazır olur
    const echo = actor.passive?.effect;
    if (!debug && echo?.type === 'spellEcho' && this.mode === 'turns' && (skill.cooldown ?? 0) > 0 && skill.effects.some((e) => e.type === 'damage') && this.rng.next() < echo.chance) {
      delete actor.cooldowns[skill.id];
      emit({ type: 'passive', actor: actor.uid, passive: actor.passive!.id, name: actor.passive!.name });
    }

    if (!debug) {
      this.noteAction(actor.uid, 'skill');
      this.finishAction(actor, emit);
    }
    return { ok: true, events };
  }

  /**
   * Bahis zarı: bahsi hesaplar, zar atar, kaybedilirse bahsi kullanıcıdan düşer; hasar çarpanını döndürür (0 = iska).
   * Can bahsi canı en fazla 1'e indirir (öldürmez; Lucky Escape'e gerek kalmaz). Olay: 'passive' (Jackpot! / Bust!) + hasar ya da kaynak olayı.
   */
  private rollBet(actor: Combatant, bet: BetSpec, emit: Emit): number {
    const stake = betStake(bet, actor.maxHp, actor.hp, actor.mp);
    const m = betMultipliers(bet, stake);
    const won = this.rng.next() < bet.winChance;
    emit({ type: 'passive', actor: actor.uid, passive: won ? 'gamble_win' : 'gamble_lose', name: won ? 'Jackpot!' : 'Bust!' });
    if (won) return m.win;
    if (stake > 0) {
      if (bet.resource === 'hp') {
        actor.hp -= stake;
        emit({ type: 'damage', source: actor.uid, target: actor.uid, amount: stake, absorbed: 0, hpAfter: actor.hp, shieldAfter: actor.shield, magicShieldAfter: actor.magicShield, crit: false });
      } else {
        actor.mp -= stake;
        emit({ type: 'resource', actor: actor.uid, resource: 'mp', amount: stake, after: actor.mp });
      }
    }
    return m.lose;
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
    this.observer?.before?.({ kind: 'pass', actorUid: actor.uid });
    emit({ type: 'turnSkipped', actor: actor.uid });
    this.noteAction(actor.uid, 'pass');
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
    this.observer?.after?.(actor.uid);
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
    this.speedBoost.delete(actor.uid); // Skip Turn desteği, birimin sıradaki turu başlayınca biter
    // Kendi turunun başında: bekleme süreleri 1 azalır
    const held = this.initialHold.get(actor.uid);
    this.initialHold.delete(actor.uid);
    for (const id of Object.keys(actor.cooldowns)) {
      if (held?.has(id)) continue; // başlangıç cooldown'u: ilk turda azalmaz (ilk N turda kullanılamaz)
      actor.cooldowns[id] = Math.max(0, (actor.cooldowns[id] ?? 0) - 1);
      if (actor.cooldowns[id] === 0) delete actor.cooldowns[id];
    }
    // Sersemlemiş (skipTurn) birim bu turu oynayamaz; durum süresi aşağıda azalmadan önce okunur
    let skipThisTurn = actor.statuses.some((st) => this.statusDef(st.kind)?.skipTurn);
    // Yerdeki etkiler: bu birimin hücresinde duran (düşman) etkiler hasar verir
    for (const g of [...this.ground]) {
      if (g.board !== actor.board || !g.slots.includes(actor.slot) || g.sourceSide === actor.side || actor.hp <= 0) continue;
      const src = this.get(g.source) ?? actor;
      this.applyHit(src, actor, this.groundTickDamage(g.ground, g.amount, actor), 'magic', false, emit, false);
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
    // Str: tur başı düz can yenilenmesi (Str x hpRegenPerStr, yuvarlanır)
    const hpRegen = Math.round(actor.stats.hpRegen ?? 0);
    if (actor.hp > 0 && !skipThisTurn && hpRegen > 0 && actor.hp < actor.maxHp) this.applyHeal(actor, actor, hpRegen, false, emit);
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
      .map((c) => ({
        uid: c.uid,
        side: c.side,
        slot: c.slot,
        spd: this.speedOf(c),
        counter: c.turnCounter,
        ...(this.speedBoostOf(c.uid) > 0 ? { baseSpd: this.baseSpeedOf(c) } : {}),
      }));
  }

  private addStatus(target: Combatant, status: Status, emit: Emit): void {
    // Str-primary Resilience: karaktere uygulanan her debuff, uygulanırken ihtimalle 1 tur kısalır (en az 1 kalır; 1 turluk debuff'ta zar atılmaz).
    // Yer etkilerinin kendi süresi (ground turns) buradan geçmez; yalnızca karakter üstünde tutulan durumlar etkilenir.
    const resilience = target.stats.resilience ?? 0;
    if (resilience > 0 && this.statusDef(status.kind)?.type === 'debuff' && status.turns > 1 && this.rng.next() < resilience) {
      status = { ...status, turns: status.turns - 1 };
      emit({ type: 'passive', actor: target.uid, passive: 'primary_str', name: 'Resilience' });
    }
    target.statuses = target.statuses.filter((s) => !(s.kind === status.kind && (status.kind !== 'regen' || s.source === status.source)));
    target.statuses.push(status);
    emit({ type: 'status', target: target.uid, status: status.kind, turns: status.turns, source: status.source });
    // Kontrol (CC) durumu (data/statuses.json > breaksTaunt, şu an Stun): taunt'ı olan birim bunu yerse taunt uygulandığı AN silinir (süre kısalsa da, 1 tur olsa da)
    if (this.statusDef(status.kind)?.breaksTaunt && target.statuses.some((s) => s.kind === 'taunt')) {
      target.statuses = target.statuses.filter((s) => s.kind !== 'taunt');
      emit({ type: 'statusEnd', target: target.uid, status: 'taunt', broken: true });
    }
  }

  /**
   * Tek bir hasar vuruşu: isabet zarı (TEK zar; accuracy vs evasion; iska = 'dodge' (hedef kaçındı) ya da 'miss' (saldıran isabet ettiremedi) olayı)
   * -> zar -> kritik (SON çarpan) -> guard paylaşımı -> kalkan -> can.
   * `powerMult`: arkaya sıçrayan kısmî hasar için güç çarpanı.
   */
  private strike(actor: Combatant, target: Combatant, effect: DamageEffect, emit: Emit, powerMult: number, extras: boolean): { landed: boolean } {
    const f = this.setup.formulas;
    // Zarlar her zaman atılır (debug zorlaması rastgele sayı akışını değiştirmez); vuruş başına TEK zar üç sonuca ayrışır
    let outcome = hitOutcome(actor.stats, target.stats, f, this.rng.next());
    if (this.debug.dodge === 'always') outcome = 'dodge';
    else if (this.debug.miss === 'always') outcome = 'miss';
    else if (this.debug.dodge === 'never') outcome = 'hit';
    if (outcome !== 'hit') {
      emit({ type: outcome, source: actor.uid, target: target.uid });
      return { landed: false };
    }
    const spec = damageSpecFor(actor, target, effect, f, powerMult, extras, this.damageTakenMult(target), this.hunterMarkMult(actor, target));
    const targetStats = this.effectiveStats(target);
    const base = rollDamage(actor.stats, targetStats, spec, f, this.rng);
    const rolled = rollCrit(actor.stats, this.rng);
    const crit = this.debug.crit === 'auto' ? rolled.crit : this.debug.crit === 'always';
    const mult = crit ? actor.stats.critMult : 1;
    const total = Math.max(f.damage.minDamage, Math.round(base * mult * this.debug.damageMult));

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

    // Rage: isabet eden hasar vuruşu, vurulan hasarın hedefin maks canına yüzdesine göre kazanç (hedef başına toplanır; formulas.json > rage)
    if (this.rageTally && actor.maxRage !== undefined) {
      const r = f.rage;
      const gain = Math.min(r.perHitCap, r.hitBase + r.perHpPercent * ((total / Math.max(1, target.maxHp)) * 100));
      this.rageTally.set(target.uid, (this.rageTally.get(target.uid) ?? 0) + gain);
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
    this.reflectThorns(actor, target, emit);
    this.announceIfDead(target, emit);
    if (guardian) this.announceIfDead(guardian, emit);
    return { landed: true };
  }

  /**
   * Dikenli (thorns) durumdaki birime yakın dövüşle isabet eden saldırgan sabit fiziksel hasar alır (zırh etkiler; isabet/kritik/sapma yok, RNG tüketmez).
   * Yansıma doğrudan applyHit'ten geçer: yeni bir vuruş (strike) olmadığı için yansımayı tekrar yansıtmaz.
   */
  private reflectThorns(attacker: Combatant, holder: Combatant, emit: Emit): void {
    if (!this.castMelee || attacker.hp <= 0 || attacker.side === holder.side) return;
    const th = holder.statuses.find((s) => s.kind === 'thorns');
    if (!th || !th.amount) return;
    const f = this.setup.formulas;
    const taken = attacker.summoned ? f.summon.damageTakenMultiplier : 1;
    const dmg = damageRange(holder.stats, this.effectiveStats(attacker), { damageType: 'physical', scale: 'str', power: 0, extra: th.amount, takenMultiplier: taken }, f).avg;
    emit({ type: 'passive', actor: holder.uid, passive: 'thorns', name: 'Thorns' });
    this.applyHit(holder, attacker, dmg, 'physical', false, emit, false);
    this.announceIfDead(attacker, emit);
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
    // Luck-primary: ölümcül vuruşta şansla 1 canla kurtulur (savaş başına bir kez, seed'li RNG)
    let luckySaved = false;
    if (rest >= target.hp && (target.stats.surviveChance ?? 0) > 0 && !this.luckySaved.has(target.uid) && this.rng.next() < target.stats.surviveChance) {
      this.luckySaved.add(target.uid);
      rest = target.hp - 1;
      luckySaved = true;
    }
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
    if (luckySaved) emit({ type: 'passive', actor: target.uid, passive: 'primary_luck', name: 'Lucky Escape' });
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

  // --- Debug araçları (yalnızca debug menüsü çağırır; oyun kuralı değişmez, durum olay akışıyla UI'a yansır) ---

  private readonly debugEmit: Emit = (e) => this.record(e);

  private checkWinner(): void {
    if (this.winner) return;
    if (this.living('enemy').length === 0) this.winner = 'party';
    else if (this.living('party').length === 0) this.winner = 'enemy';
    if (this.winner) this.record({ type: 'battleEnd', winner: this.winner });
  }

  /** Debug: birimi öldürür (olaylar: death; takım biterse battleEnd). */
  debugKill(uid: string, allowEnd = true): ActionResult {
    const c = this.get(uid);
    if (!c || c.hp <= 0) return { ok: false, reason: 'Unit is not alive' };
    if (this.winner) return { ok: false, reason: 'Battle is over' };
    c.hp = 0;
    c.shield = 0;
    c.magicShield = 0;
    this.record({ type: 'resource', actor: c.uid, resource: 'hp', amount: 0, after: 0 });
    this.announceIfDead(c, this.debugEmit);
    if (allowEnd) this.checkWinner();
    return { ok: true, events: [] };
  }

  /** Debug: düşmüş (çağrı olmayan) birimi, hücresi boşsa, maks canının `ratio` kadarıyla diriltir. */
  debugRevive(uid: string, ratio = 1): ActionResult {
    const c = this.get(uid);
    if (!c || c.hp > 0) return { ok: false, reason: 'Unit is not dead' };
    if (this.winner) return { ok: false, reason: 'Battle is over' };
    if (c.summoned) return { ok: false, reason: 'Summons cannot be revived' };
    if (this.combatants.some((o) => o.hp > 0 && o.board === c.board && o.slot === c.slot)) return { ok: false, reason: 'Cell is taken' };
    c.hp = Math.max(1, Math.round(c.maxHp * ratio));
    c.mp = Math.round(c.maxMp * ratio);
    c.shield = 0;
    c.magicShield = 0;
    c.statuses = [];
    c.turnCounter = 0;
    if (c.maxRage !== undefined) c.rage = 0;
    this.announcedDead.delete(c.uid);
    this.record({ type: 'revive', source: c.uid, target: c.uid, hpAfter: c.hp, mpAfter: c.mp });
    return { ok: true, events: [] };
  }

  /** Debug: can, mana ya da Rage'i ayarlar (can 0 = öldür; ölü birimde can > 0 = diriltir; rage yalnızca Rage'li birimde). */
  debugSetResource(uid: string, resource: 'hp' | 'mp' | 'rage', value: number): ActionResult {
    const c = this.get(uid);
    if (!c) return { ok: false, reason: 'No such unit' };
    if (resource === 'rage') {
      if (c.maxRage === undefined) return { ok: false, reason: 'Unit has no rage' };
      const v = Math.max(0, Math.min(c.maxRage, Math.round(value)));
      const before = c.rage ?? 0;
      c.rage = v;
      if (v !== before) this.record({ type: 'rage', actor: c.uid, delta: v - before, after: v, max: c.maxRage });
      return { ok: true, events: [] };
    }
    const max = resource === 'hp' ? c.maxHp : c.maxMp;
    const v = Math.max(0, Math.min(max, Math.round(value)));
    if (resource === 'hp') {
      if (v <= 0) return this.debugKill(uid);
      if (c.hp <= 0) return this.debugRevive(uid, v / c.maxHp);
    } else if (c.hp <= 0) return { ok: false, reason: 'Unit is dead' };
    if (c[resource] === v) return { ok: true, events: [] };
    c[resource] = v;
    this.record({ type: 'resource', actor: c.uid, resource, amount: 0, after: v });
    return { ok: true, events: [] };
  }

  /** Debug: bir tarafın (ya da herkesin) canlı birimlerinin can ve manasını doldurur. */
  debugFill(side?: Side): void {
    for (const c of this.combatants) {
      if (c.hp <= 0 || (side && c.side !== side)) continue;
      this.debugSetResource(c.uid, 'hp', c.maxHp);
      this.debugSetResource(c.uid, 'mp', c.maxMp);
    }
  }

  /** Debug: bekleme sürelerini sıfırlar (verilen birim ya da herkes). */
  debugClearCooldowns(uid?: string): void {
    for (const c of this.combatants) {
      if (uid && c.uid !== uid) continue;
      c.cooldowns = {};
      this.initialHold.delete(c.uid);
    }
  }

  /** Debug: tanımlı bir durumu (data/statuses.json) birime ekler. */
  debugAddStatus(uid: string, kind: string, turns = 3): ActionResult {
    const c = this.get(uid);
    if (!c || c.hp <= 0) return { ok: false, reason: 'Unit is not alive' };
    if (!this.statusDef(kind)) return { ok: false, reason: 'Unknown status' };
    this.addStatus(c, { kind: kind as Status['kind'], turns: Math.max(1, Math.round(turns)), source: c.uid }, this.debugEmit);
    return { ok: true, events: [] };
  }

  /** Debug: birimin tüm durumlarını ve kalkanlarını temizler. */
  debugClearStatuses(uid: string): void {
    const c = this.get(uid);
    if (!c) return;
    c.statuses = [];
    c.shield = 0;
    c.magicShield = 0;
  }

  /** Debug: tüm düşmüş (çağrı olmayan) birimleri diriltir. */
  debugReviveAll(): void {
    for (const c of this.combatants) if (c.hp <= 0 && !c.summoned) this.debugRevive(c.uid);
  }

  /** Debug: her şeyi eski haline getirir (galeri sonrası): ölüler diri, çağrılar gider, durum/kalkan/yer etkisi temiz, can/mana dolu. */
  debugResetAll(): void {
    for (const c of this.combatants) {
      if (c.summoned && c.hp > 0) {
        c.hp = 0;
        this.announcedDead.add(c.uid);
        this.record({ type: 'despawn', target: c.uid });
      }
    }
    for (const g of [...this.ground]) {
      this.ground.splice(this.ground.indexOf(g), 1);
      this.record({ type: 'groundEnd', id: g.id });
    }
    this.debugReviveAll();
    for (const c of this.combatants) if (c.hp > 0) this.debugClearStatuses(c.uid);
    this.debugFill();
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
    ...(def.maxRage !== undefined ? { rage: 0, maxRage: def.maxRage } : {}),
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
