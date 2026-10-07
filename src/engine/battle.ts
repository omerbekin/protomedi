import { skillCostAmount } from './cost';
import { damageRange, rollCrit, rollDamage, rollHeal, shieldAmount, type DamageSpec, type Range } from './formulas';
import { isShapeArea, shapeCells, shapeStages } from './area-shape';
import { pickSideNeighbors } from './formation';
import { betMultipliers, betStake } from './gamble';
import { Rng } from './rng';
import { damageSpecFor, type DamageEffect } from './spec';
import { applySummonVariant, armorReduction, attributePower, hitOutcome } from './stats';
import type { Corpse, CorpseChoice, CorpseState, DamageOrigin, Element } from './types';
import { advanceTurn, predictQueue, turnProgress, type TurnSlot } from './turn-order';
import type { ActionInfo, AreaStage, BattleAction, BattleEvent, BattleMode, BetSpec, Combatant, CombatantDef, Formulas, GlobalSkillDef, GroundDef, GroundEffect, ShieldHook, Side, SkillDef, SkillEffect, Status, StatusDef } from './types';

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
  /** area_any alan skill'i: anchor hücrenin tahtası (yoksa karşı taraf). */
  board?: Side;
  /** Ceset tüketen çağrı (Raise Dead): tüketilecek düşman cesedinin uid'si. */
  corpseUid?: string;
}

/** Hasar olayının kaynak bilgisi (BattleEvent 'damage' > origin/element/damageType/ground/groundId). */
interface HitMeta {
  origin: DamageOrigin;
  element?: Element;
  damageType?: 'physical' | 'magic';
  ground?: string;
  groundId?: string;
  /** Durum kaynaklı hasar (Wither tiki, Doom): damage olayına `status` olarak yazılır. */
  status?: Status['kind'];
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
  /** area_any (Smoke Bomb): alanın atıldığı tahta. */
  board?: Side;
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
  /** Debug (Test Mode): true iken Rage harcanmaz ve Rage yetersizliği engel olmaz (iki taraf için de; freeMp ile aynı desen). */
  freeRage = false;
  /** Debug (Test Mode): true iken cooldown hiç başlamaz ve cooldown'daki skill da kullanılabilir (iki taraf için de). */
  noCooldowns = false;
  /** Debug bayrakları (yalnızca debug menüsünden değişir; varsayılanlar oyunu hiç etkilemez, rastgele sayı akışı da aynı kalır). */
  readonly debug: DebugFlags = { damageMult: 1, crit: 'auto', dodge: 'auto', miss: 'auto' };
  /** İsteğe bağlı gözlemci (maç kaydı); yoksa hiçbir şey değişmez. */
  observer: BattleObserver | null = null;
  /** debugCast sürerken true: menzil/taunt kısıtları yok sayılır. */
  private debugCasting = false;
  /**
   * Cesetler (madde 222): ölen her ÇAĞRI OLMAYAN birim yuvasında ceset bırakır (uid -> durum). revivable = Resurrection ile diriltilebilir,
   * consumed = Raise Dead tüketti (diriltilemez, yuvası rezerve değil). Dirilince kayıt silinir. Çağrıların ölümü ceset bırakmaz.
   */
  private readonly corpseState = new Map<string, CorpseState>();
  /** Ceset sırası (ölüm anı): uid -> artan sayı (corpses() listesinin sırası). */
  private readonly corpseOrder = new Map<string, number>();
  private corpseCounter = 0;

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
    return this.tickDamage(this.setup.grounds?.[groundId]?.element ?? 'physical', 'magic', amount, target);
  }

  /**
   * Sabit (sapmasız, kritiksiz, isabet zarsız) tik hasarı: ham miktar x element zayıflığı x (1 - zırh azalması; büyüde büyü zırhı). Yer etkisi tiki ve
   * karakter üstü DoT (Wither) aynı kuralı kullanır; önizleme de bu fonksiyonu kullanır.
   */
  tickDamage(element: Element, damageType: 'physical' | 'magic', amount: number, target: Combatant): number {
    const f = this.setup.formulas;
    const weak = target.tags.reduce((m, tag) => m * (f.weaknesses?.[tag]?.[element] ?? 1), 1);
    const st = this.effectiveStats(target);
    const red = armorReduction(damageType === 'magic' ? st.magicArmor : st.armor, f);
    return Math.max(f.damage.minDamage, Math.round(amount * weak * (1 - red)));
  }

  /** DoT durumunun (statuses.json > dot) bir tikte hedefe vereceği hasar (önizleme ve gerçek tik aynı). */
  dotTickDamage(kind: string, amount: number, target: Combatant): number {
    const dot = this.statusDef(kind)?.dot;
    return this.tickDamage(dot?.element ?? 'physical', dot?.damageType ?? 'magic', amount, target);
  }

  // --- Yığılan durum (Omen) ve Doom (Hexer) ---

  /** Birimdeki `kind` yığını (yoksa 0). */
  stacksOf(uid: string, kind: string): number {
    return this.get(uid)?.statuses.find((s) => s.kind === kind)?.stacks ?? 0;
  }

  /** Yığılan durumun Doom'u için hasar belirtimi (zayıflık, alınan hasar çarpanları; isabet zarı yok). */
  private doomSpec(target: Combatant, kind: string, power: number): DamageSpec | null {
    const doom = this.statusDef(kind)?.doom;
    if (!doom) return null;
    const f = this.setup.formulas;
    const weak = target.tags.reduce((m, tag) => m * (f.weaknesses?.[tag]?.[doom.element] ?? 1), 1);
    return {
      damageType: doom.damageType,
      scale: doom.scale,
      power: doom.powerPerStack * power * weak,
      extra: 0,
      takenMultiplier: (target.summoned ? f.summon.damageTakenMultiplier : 1) * this.damageTakenMult(target),
    };
  }

  /** Doom hesabında saldıran yerine geçen stat nesnesi: yalnızca ölçek statı (snapshot ya da canlı değer). */
  private static scaleOnly(scale: string, value: number): Combatant['stats'] {
    return { [scale]: value, spellPowerMult: 1 } as unknown as Combatant['stats'];
  }

  /**
   * Doom'un hedefe hasar aralığı (kritik hariç; min/max/avg) ve kritikte en yüksek değer: `omens` yığın x `mult` çarpan, ölçek statı `statValue`
   * (canlı Hexer'in o anki değeri ya da snapshot). Büyü zırhı, zayıflık, alınan hasar çarpanları dahil; kalkan hariç. Saf (önizleme ve YZ).
   */
  doomRange(target: Combatant, kind: string, omens: number, mult: number, statValue: number): Range | null {
    const spec = this.doomSpec(target, kind, omens * mult);
    const doom = this.statusDef(kind)?.doom;
    if (!spec || !doom || omens <= 0) return null;
    return damageRange(Battle.scaleOnly(doom.scale, statValue), this.effectiveStats(target), spec, this.setup.formulas);
  }

  /** Yığına yazılan snapshot: ekleyenin doom ölçek statı, geçerli kritik şansı ve kritik çarpanı. */
  private stackSnapshot(actor: Combatant, kind: string): Pick<Status, 'snapStat' | 'snapCrit' | 'snapCritMult'> {
    const doom = this.statusDef(kind)?.doom;
    return { snapStat: doom ? actor.stats[doom.scale] : 0, snapCrit: this.effectiveStats(actor).critChance, snapCritMult: actor.stats.critMult };
  }

  /**
   * Yığın ekler (Omen): yoksa durumu süresiyle (statuses.json > duration; Resilience zarı yalnızca burada) başlatır, varsa yığını artırır ama süreye
   * DOKUNMAZ (madde Ö2). Snapshot ve kaynak son ekleyene yazılır. Olaylar: status (stacks) + omen. `autoDoom` ve yığın maxStacks'e ulaştıysa Doom anında.
   */
  private addStacks(target: Combatant, kind: Status['kind'], n: number, actor: Combatant, emit: Emit, crit: boolean, autoDoom: boolean): void {
    const def = this.statusDef(kind);
    if (!def?.maxStacks || n <= 0 || target.hp <= 0) return;
    const max = def.maxStacks;
    let st = target.statuses.find((s) => s.kind === kind);
    const before = st?.stacks ?? 0;
    const snap = this.stackSnapshot(actor, kind);
    if (!st) {
      this.addStatus(target, { kind, turns: def.duration ?? 3, source: actor.uid, stacks: Math.min(max, n), ...snap }, emit);
      st = target.statuses.find((s) => s.kind === kind)!;
    } else {
      st.stacks = Math.min(max, before + n);
      st.source = actor.uid;
      Object.assign(st, snap);
      emit({ type: 'status', target: target.uid, status: kind, turns: st.turns, source: actor.uid, stacks: st.stacks });
    }
    emit({ type: 'omen', source: actor.uid, target: target.uid, delta: (st.stacks ?? 0) - before, stacks: st.stacks ?? 0, max, ...(crit ? { crit: true } : {}), cause: 'skill' });
    if (autoDoom && (st.stacks ?? 0) >= max && def.doom) this.triggerDoom(target, st, 1, 'complete', actor, emit);
  }

  /**
   * Doom: yığını tüketip patlatır. complete / detonate: tetikleyen (canlı, eylem yapan) Hexer'in o anki ölçek statı ve kritik şansı; skill vuruşunun
   * parçası (Guard paylaşımı, kalkan, kalkan kancaları, Lucky Escape normal; origin 'skill'). expire: yığındaki snapshot (son ekleyen; ölmüş olabilir),
   * tur başı durum hasarı: Guard'a AKTARILMAZ (madde Ö12), origin 'status'. İsabet zarı yok; sapma ve ayrı kritik zarı var (seed'li RNG).
   * Ölümde Ill Omen Doom kuralıyla (onDoomKill) çalışır.
   */
  private triggerDoom(target: Combatant, status: Status, mult: number, cause: 'complete' | 'expire' | 'detonate', trigger: Combatant | undefined, emit: Emit, skillId?: string): void {
    const doom = this.statusDef(status.kind)?.doom;
    const omens = status.stacks ?? 0;
    target.statuses = target.statuses.filter((s) => s !== status);
    emit({ type: 'statusEnd', target: target.uid, status: status.kind, cause: 'doom' });
    if (!doom || omens <= 0 || target.hp <= 0) return;
    const f = this.setup.formulas;
    const live = cause !== 'expire' && trigger !== undefined && trigger.hp > 0;
    const statValue = live ? trigger!.stats[doom.scale] : (status.snapStat ?? 0);
    const critChance = live ? this.effectiveStats(trigger!).critChance : (status.snapCrit ?? 0);
    const critMult = live ? trigger!.stats.critMult : (status.snapCritMult ?? f.attributes.critMult);
    const src = live ? trigger! : (this.get(status.source) ?? target);
    emit({ type: 'doom', source: src.uid, target: target.uid, omens, mult, cause, ...(skillId ? { skill: skillId } : {}) });
    const spec = this.doomSpec(target, status.kind, omens * mult)!;
    const base = rollDamage(Battle.scaleOnly(doom.scale, statValue), this.effectiveStats(target), spec, f, this.rng);
    const rolled = rollCrit({ critChance, critMult }, this.rng);
    const crit = this.debug.crit === 'auto' ? rolled.crit : this.debug.crit === 'always';
    const total = Math.max(f.damage.minDamage, Math.round(base * (crit ? critMult : 1) * this.debug.damageMult));
    const meta: HitMeta = { origin: cause === 'expire' ? 'status' : 'skill', element: doom.element, damageType: doom.damageType, status: status.kind };
    const guard = cause === 'expire' ? undefined : target.statuses.find((s) => s.kind === 'guard');
    const guardian = guard ? this.get(guard.source) : undefined;
    if (guard && guardian && guardian !== target && guardian.hp > 0) {
      const redirected = Math.round(total * (guard.share ?? 0.5));
      this.applyHit(src, target, total - redirected, doom.damageType, crit, emit, false, meta);
      if (redirected > 0) this.applyHit(src, guardian, redirected, doom.damageType, crit, emit, true, meta);
    } else {
      this.applyHit(src, target, total, doom.damageType, crit, emit, false, meta);
    }
    this.announceIfDead(target, emit, status);
    if (guardian) this.announceIfDead(guardian, emit);
  }

  /**
   * Ill Omen (pasif omenTransfer): ölen birimin yığını (Doom ile öldüyse `doomed`: tüketilen yığının kalanı, onDoomKill kadar), yığının kaynağı canlıysa
   * ve bu pasifi taşıyorsa, ölenin tahtasındaki en yakın canlı birime geçer. Varışta en fazla maxOnArrival (ve maxStacks - 1: Doom tetiklemez);
   * ölenin kalan süresini (en az 1) ve snapshot'ını taşır; alıcıda yığın varsa alıcının sayacı korunur.
   */
  private illOmen(dead: Combatant, emit: Emit, doomed?: Status): void {
    const list = doomed ? [doomed] : dead.statuses.filter((s) => (this.statusDef(s.kind)?.maxStacks ?? 0) > 0 && (s.stacks ?? 0) > 0);
    for (const st of list) {
      const owner = this.get(st.source);
      const pe = owner?.passive?.effect;
      if (!owner || owner.hp <= 0 || pe?.type !== 'omenTransfer' || pe.status !== st.kind || owner.side === dead.side) continue;
      if (!doomed) {
        dead.statuses = dead.statuses.filter((s) => s !== st);
        emit({ type: 'statusEnd', target: dead.uid, status: st.kind, cause: 'ill_omen' });
      }
      const pass = doomed ? pe.onDoomKill : (st.stacks ?? 0);
      const to = this.nearestLivingAlly(dead);
      const def = this.statusDef(st.kind);
      if (!to || pass <= 0 || !def?.maxStacks) continue;
      const cap = Math.min(pe.maxOnArrival, def.maxStacks - 1);
      const ex = to.statuses.find((s) => s.kind === st.kind);
      const before = ex?.stacks ?? 0;
      const after = Math.min(cap, before + pass);
      if (after <= before) continue;
      const snap = { snapStat: st.snapStat, snapCrit: st.snapCrit, snapCritMult: st.snapCritMult };
      emit({ type: 'passive', actor: owner.uid, passive: owner.passive!.id, name: owner.passive!.name });
      let turns: number;
      if (ex) {
        ex.stacks = after;
        ex.source = owner.uid;
        Object.assign(ex, snap);
        turns = ex.turns; // alıcının sayacı korunur (uzamaz)
      } else {
        turns = Math.max(1, st.turns); // ölenin kalan süresi (yeni 3 tur değil; Resilience zarı yok: taze lanet değil)
        to.statuses.push({ kind: st.kind, turns, source: owner.uid, stacks: after, ...snap });
      }
      emit({ type: 'omenTransfer', source: owner.uid, from: dead.uid, to: to.uid, stacks: after - before, after });
      emit({ type: 'omen', source: owner.uid, target: to.uid, delta: after - before, stacks: after, max: def.maxStacks, cause: 'transfer' });
      emit({ type: 'status', target: to.uid, status: st.kind, turns, source: owner.uid, stacks: after });
    }
  }

  /**
   * Ölen birimin tahtasındaki EN YAKIN canlı dostu (Ill Omen alıcısı; çağrılar dahil): ekran ızgarasında (formation.screenGrid) Manhattan uzaklığı en küçük;
   * eşitlikte önce aynı sıra (derinlik), sonra küçük yuva. Izgara yoksa sıra/şerit Manhattan. Belirleyici.
   */
  nearestLivingAlly(dead: Combatant): Combatant | undefined {
    const grid = this.setup.formulas.formation.screenGrid?.[dead.board];
    const pos = (slot: number) => grid?.[slot] ?? { col: this.rowOf(slot), row: this.laneOf(slot) };
    const p = pos(dead.slot);
    const dist = (c: Combatant) => Math.abs(pos(c.slot).col - p.col) + Math.abs(pos(c.slot).row - p.row);
    const sameRow = (c: Combatant) => (this.rowOf(c.slot) === this.rowOf(dead.slot) ? 0 : 1);
    return this.combatants
      .filter((c) => c.uid !== dead.uid && c.hp > 0 && c.side === dead.side && c.board === dead.board)
      .sort((a, b) => dist(a) - dist(b) || sameRow(a) - sameRow(b) || a.slot - b.slot)[0];
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
    // area_any (Smoke Bomb): etki yalnızca `side` tarafındaki birimlere (alan hangi tahtaya atılırsa atılsın; veri doğrulaması side'ı zorunlu kılar)
    if (skill.target === 'area_any') return effect.side === undefined || (effect.side === 'allies') === (target.side === actor.side);
    if (skill.target !== 'everyone') return true;
    const alliedDefault = effect.type === 'heal' || effect.type === 'hot' || effect.type === 'shield' || effect.type === 'guard' || effect.type === 'bond' || (effect.type === 'dispel' && effect.status === 'debuff');
    const side = effect.side ?? (alliedDefault ? 'allies' : 'enemies');
    return (side === 'allies') === (target.side === actor.side);
  }

  private effectTargets(skill: SkillDef, effect: SkillEffect, targets: Combatant[], actor: Combatant): Combatant[] {
    return skill.target === 'everyone' || skill.target === 'area_any' ? targets.filter((c) => this.effectAppliesTo(skill, effect, c, actor)) : targets;
  }

  /**
   * Zırh aurası (Defender gibi) ve durumların isabet/kaçınma ekleri (Blinded/Shrouded: statuses.json > accuracyDelta/evasionDelta) dahil,
   * savaştaki geçerli stat'lar. Hiçbiri yoksa gerçek stat nesnesi döner. İsabet/kaçınma 0'ın altına inmez; hit şansı ayrıca [0, hit.max] arasına sıkışır.
   * Aura: kaynağın KENDİ zırhının pct'si, kendine ve artı şeklindeki komşu dostlara; bir birim en fazla maxStacks kaynaktan (en büyükler) alır.
   */
  effectiveStats(c: Combatant): Combatant['stats'] {
    const bonus = this.auraArmor(c);
    let acc = 0;
    let eva = 0;
    let crit = 0;
    for (const s of c.statuses) {
      const d = this.statusDef(s.kind);
      acc += d?.accuracyDelta ?? 0;
      eva += d?.evasionDelta ?? 0;
      // Kritik eki (Jinxed: kritik yok) ve yığın başına kritik eki (Omen Misfortune); sonuç [0, 1]
      crit += (d?.critDelta ?? 0) + (d?.critDeltaPerStack ?? 0) * (s.stacks ?? 0);
    }
    if (bonus <= 0 && acc === 0 && eva === 0 && crit === 0) return c.stats;
    return {
      ...c.stats,
      armor: c.stats.armor + bonus,
      accuracy: Math.max(0, Math.round((c.stats.accuracy + acc) * 10000) / 10000),
      evasion: Math.max(0, Math.round((c.stats.evasion + eva) * 10000) / 10000),
      critChance: Math.min(1, Math.max(0, Math.round((c.stats.critChance + crit) * 10000) / 10000)),
    };
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

  /**
   * Sıra çubuğu ÖNİZLEMESİ: şu anki aktör `skillId`'yi kullanırsa sıra nasıl olur (skill'in turnCost'u: yarım turn skill'de aktörün sayacından eşiğin yarısı
   * düşer, sonraki sırası yarı sürede gelir). Global skill / bilinmeyen id / tam turn skill = turnQueue ile aynı. Savaşı değiştirmez.
   */
  turnQueueAfter(skillId: string, count = this.setup.formulas.turn.queueLength): string[] {
    if (this.mode !== 'turns') return [];
    return predictQueue(this.turnSlots(), this.setup.formulas.turn.threshold, count, this.currentUid, this.tieFirst, this.turnCostOf(skillId));
  }

  /** Skill'in turn bedeli (0 < x <= 1; yoksa 1). Global skill'ler ve bilinmeyen id'ler 1. */
  turnCostOf(skillId: string): number {
    const c = this.skill(skillId)?.turnCost;
    return c !== undefined && c > 0 && c <= 1 ? c : 1;
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
    return t === 'single_enemy' || t === 'single_ally' || t === 'dead_ally' || t === 'area_enemies' || t === 'area_any';
  }

  /** Çağrı skill'i mi (yeri oyuncu seçer)? */
  needsSlotChoice(skillId: string): boolean {
    return !!this.skill(skillId)?.effects.some((e) => e.type === 'summon');
  }

  /** Alan skill'i mi (target 'area_enemies' / 'area_any' + area.shape; oyuncu bir anchor hücre seçer, hücre boş olabilir)? */
  isAreaSkill(skillId: string): boolean {
    return this.isShapeSkill(skillId);
  }

  /** Şekil (hücre kümesi) tabanlı alan skill'i mi (area.shape: row | column | rect | plus | x)? Tüm alan skill'leri şekillidir (isAreaSkill ile aynı). */
  isShapeSkill(skillId: string): boolean {
    const skill = this.skill(skillId);
    return (skill?.target === 'area_enemies' || skill?.target === 'area_any') && isShapeArea(skill.area);
  }

  /** İki tahtaya da atılabilen alan skill'i mi (target 'area_any': Smoke Bomb)? Anchor tahtası `board` ile seçilir. */
  isAnyBoardArea(skillId: string): boolean {
    return this.isShapeSkill(skillId) && this.skill(skillId)!.target === 'area_any';
  }

  /** Aşamalı (area.stages) alan skill'i mi? */
  isStagedSkill(skillId: string): boolean {
    return this.isShapeSkill(skillId) && !!this.skill(skillId)!.area!.stages;
  }

  /** Alan skill'inin bu kullanıcı için geçerli tahtası: area_any'de istenen tahta (yoksa karşı taraf), diğerlerinde hep karşı taraf. */
  private areaBoard(actor: Combatant | undefined, skillId: string, board?: Side): Side {
    const foe: Side = actor ? opposite(actor.side) : 'enemy';
    return board && this.isAnyBoardArea(skillId) ? board : foe;
  }

  /**
   * Alan skill'inin anchor hücreye göre kapsadığı tüm hücreler (boş olanlar dahil; gösterim için), yuva sırasıyla.
   * `board`: hücrelerin ait olduğu tahta (varsayılan 'enemy'; rect'in ekrandaki sol-alt köşesi tahtaya göre ayna).
   */
  areaCells(skillId: string, centerSlot: number, board: Side = 'enemy'): number[] {
    const skill = this.skill(skillId);
    if (!skill || !this.isShapeSkill(skillId)) return [];
    return shapeCells(skill.area!, centerSlot, board, this.setup.formulas.formation);
  }

  /** Alan skill'inin hücreleri aşamalara bölünmüş (aşamasız skill: tek aşama). Her aşama yuva sırasıyla; boş hücreler dahil. */
  areaStageCells(skillId: string, centerSlot: number, board: Side = 'enemy'): number[][] {
    const skill = this.skill(skillId);
    if (!skill || !this.isShapeSkill(skillId)) return [];
    return shapeStages(skill.area!, centerSlot, board, this.setup.formulas.formation);
  }

  /**
   * UI/vfx için: aşamalı skill'in anchor'a göre aşamaları (hücreler + vurulacak birimler, aşama sırasıyla). Aşamasız skill'de tek aşama.
   * Cast edilince `skillUsed.stages` ile aynıdır (aşamalı skill'lerde). Savaşı değiştirmez. `board`: yalnızca area_any'de anlamlı.
   */
  areaStages(actorUid: string, skillId: string, anchorSlot: number, board?: Side): AreaStage[] {
    const actor = this.get(actorUid);
    if (!actor) return [];
    const b = this.areaBoard(actor, skillId, board);
    const hits = this.areaWindowAt(actorUid, skillId, anchorSlot, b);
    return this.areaStageCells(skillId, anchorSlot, b).map((cells) => ({ cells, targets: hits.filter((c) => cells.includes(c.slot)).map((c) => c.uid) }));
  }

  /**
   * Alan skill'inin anchor hücreye göre vurduğu/etkilediği birimler. Şekil hücre kümesi 'vurulabilir hücreler'i belirler; ölü/boş hücreler boşluktur,
   * yakın dövüşte erişilemeyen (arkadaki) hücreler validTargets ile elenir. Sıra: aşamalı skill'de aşama sırasıyla (aşama içinde derinlik sırası),
   * aşamasızda derinlik sırası (öndeki önce; falloff bu sırayla azalır). `board`: area_any'de anchor tahtası (yoksa karşı taraf); area_any alandaki
   * birimlerden en az bir etkinin uygulandığı (side) canlı birimleri döndürür; area_enemies yalnızca düşmanları.
   */
  areaWindowAt(actorUid: string, skillId: string, centerSlot: number, board?: Side): Combatant[] {
    const skill = this.skill(skillId);
    if (!skill || !this.isShapeSkill(skillId)) return [];
    const actor = this.get(actorUid);
    const b = this.areaBoard(actor, skillId, board);
    const stages = this.areaStageCells(skillId, centerSlot, b);
    const cells = new Set(stages.flat());
    let hits = this.validTargets(actorUid, skillId).filter((c) => c.board === b && cells.has(c.slot));
    // area_any: hiçbir etkinin uygulanmadığı birimler (ör. yalnızca düşmana giden etki varken dostlar) hedef sayılmaz
    if (actor && skill.target === 'area_any') hits = hits.filter((c) => skill.effects.some((e) => this.effectAppliesTo(skill, e, c, actor)));
    if (stages.length <= 1) return hits;
    return stages.flatMap((st) => hits.filter((c) => st.includes(c.slot)));
  }

  /**
   * UI için: bu alan skill'inin SEÇİLEBİLİR anchor hücreleri (tahtada, artan sırada). Boş hücre de anchor olabilir: şekil en az bir
   * vurulabilir (canlı, erişilebilir) birimi kapsıyorsa geçerlidir. Alan skill'i değilse boş liste. `board`: area_any'de hangi tahta (yoksa karşı taraf).
   */
  shapeAnchors(actorUid: string, skillId: string, board?: Side): number[] {
    const actor = this.get(actorUid);
    if (!actor || !this.isAreaSkill(skillId)) return [];
    const b = this.areaBoard(actor, skillId, board);
    const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
    return Array.from({ length: total }, (_, i) => i).filter((i) => this.areaWindowAt(actorUid, skillId, i, b).length > 0);
  }

  /** TÜM seçilebilir anchor hücreleri (tahta + yuva): area_enemies'de yalnızca karşı tahta; area_any'de önce karşı, sonra kendi tahtası. */
  shapeAnchorCells(actorUid: string, skillId: string): Array<{ board: Side; slot: number }> {
    const actor = this.get(actorUid);
    if (!actor || !this.isAreaSkill(skillId)) return [];
    const boards: Side[] = this.isAnyBoardArea(skillId) ? [opposite(actor.side), actor.side] : [opposite(actor.side)];
    return boards.flatMap((board) => this.shapeAnchors(actorUid, skillId, board).map((slot) => ({ board, slot })));
  }

  /**
   * UI hover: anchor hücreye atılırsa kapsanan hücreler (tahtaya sığdırılmış), vurulacak birimler (uid, yuva sırasıyla) ve geçerlilik.
   * valid=false ise reason nedeni yazar; cells yine de döner (hücre aralık dışı değilse) ki UI şekli soluk gösterebilsin. Savaşı değiştirmez.
   * `board`: yalnızca area_any'de anlamlı (kendi tahtan ya da karşı tahta; yoksa karşı taraf).
   */
  shapePreviewCells(actorUid: string, skillId: string, anchorSlot: number, board?: Side): { cells: number[]; targets: string[]; valid: boolean; reason?: string } {
    const actor = this.get(actorUid);
    const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
    if (!actor || !this.skill(skillId)) return { cells: [], targets: [], valid: false, reason: 'Unknown unit or skill' };
    if (!this.isAreaSkill(skillId)) return { cells: [], targets: [], valid: false, reason: 'Not an area skill' };
    if (!Number.isInteger(anchorSlot) || anchorSlot < 0 || anchorSlot >= total) return { cells: [], targets: [], valid: false, reason: 'Invalid cell' };
    const b = this.areaBoard(actor, skillId, board);
    const cells = this.areaCells(skillId, anchorSlot, b);
    const targets = this.areaWindowAt(actorUid, skillId, anchorSlot, b).map((c) => c.uid);
    if (targets.length > 0) return { cells, targets, valid: true };
    if (this.isAnyBoardArea(skillId)) return { cells, targets, valid: false, reason: b === actor.side ? 'No ally in the area' : 'No enemy in the area' };
    const inShape = this.livingByDepth(opposite(actor.side)).some((c) => c.board === b && cells.includes(c.slot));
    return { cells, targets, valid: false, reason: inShape ? 'No target in reach' : 'No enemy in the area' };
  }

  /** Anchor olarak seçilen (canlı) birimin hücresine göre areaWindowAt (birim erişim dışında da olabilir: yalnızca hücreyi belirler). area_any'de birimin tahtası. */
  areaWindow(actorUid: string, skillId: string, anchorUid: string): Combatant[] {
    const actor = this.get(actorUid);
    const anchor = this.get(anchorUid);
    if (!actor || !anchor || anchor.hp <= 0) return [];
    if (this.isAnyBoardArea(skillId)) return this.areaWindowAt(actorUid, skillId, anchor.slot, anchor.board);
    if (anchor.board !== opposite(actor.side)) return [];
    return this.areaWindowAt(actorUid, skillId, anchor.slot);
  }

  /** Çağrı skill'inin birimi hangi tahtaya koyacağı: daima kullanıcının KENDİ tahtası (Raise Dead dahil; eski düşman tahtasına çağrı kaldırıldı, madde 222). */
  summonBoard(actorUid: string, _skillId?: string): Side {
    return this.get(actorUid)?.side ?? 'party';
  }

  // --- Cesetler (madde 222) ---

  /** Bir tarafın cesetleri (ölü, çağrı olmayan birimler; revivable ya da consumed), ölüm sırasıyla (ilk ölen önce). UI: ankh (revivable) / kuru kafa (consumed) işaretleri. */
  corpses(side: Side): Corpse[] {
    return this.combatants
      .filter((c) => c.side === side && this.corpseState.has(c.uid) && c.hp <= 0)
      .sort((a, b) => (this.corpseOrder.get(a.uid) ?? 0) - (this.corpseOrder.get(b.uid) ?? 0))
      .map((c) => ({ uid: c.uid, slot: c.slot, side: c.side, state: this.corpseState.get(c.uid)! }));
  }

  /** Birimin cesedi (yoksa null: canlı, çağrı ya da hiç ölmemiş). */
  corpseOf(uid: string): Corpse | null {
    const c = this.get(uid);
    const state = this.corpseState.get(uid);
    return c && state && c.hp <= 0 ? { uid: c.uid, slot: c.slot, side: c.side, state } : null;
  }

  /** Skill ceset tüketen bir çağrı mı (summon etkisi + consumeCorpse: Raise Dead)? */
  consumesCorpse(skillId: string): boolean {
    return !!this.skill(skillId)?.effects.some((e) => e.type === 'summon' && e.consumeCorpse);
  }

  /**
   * Ceset tüketen çağrının (Raise Dead) seçebileceği cesetler (madde 230): kullanıcının KARŞI tarafındaki diriltilebilir (revivable, çağrı olmayan)
   * cesetler, yuva sırasıyla; her biri `danger` (o birim diriltilirse karşı takıma vereceği değer) ve `why` (gerekçe) taşır. Boş = tüketilecek ceset yok
   * (çağrı beslenmemiş gelir). Ceset tüketmeyen skill'de boş. Savaşı değiştirmez (UI seçim + YZ).
   */
  corpseChoices(actorUid: string, skillId: string): CorpseChoice[] {
    const actor = this.get(actorUid);
    if (!actor || !this.consumesCorpse(skillId)) return [];
    return this.corpses(opposite(actor.side))
      .filter((c) => c.state === 'revivable')
      .sort((a, b) => a.slot - b.slot)
      .map((c) => {
        const unit = this.get(c.uid)!;
        const d = this.corpseDanger(unit);
        return { uid: c.uid, slot: c.slot, name: unit.name, danger: d.danger, why: d.why };
      });
  }

  /** Oyuncu ceset seçmek zorunda mı (ceset tüketen çağrı + en az bir tüketilebilir ceset)? */
  needsCorpseChoice(actorUid: string, skillId: string): boolean {
    return this.corpseChoices(actorUid, skillId).length > 0;
  }

  /**
   * Ceset tehlikesi (formulas.json > corpseDanger): (tehdit + en iyi skill değeri) x (maks can / hpRef) x [diriltici: reviverMult]
   * x [kendi tarafında yaşayan bir diriltici onu diriltebiliyor (yuvası boş): revivableMult]. Tehdit = max(str, int, dex) + hız (YZ kill önceliğiyle aynı).
   * Saf ve belirleyici.
   */
  corpseDanger(unit: Combatant): { danger: number; why: string } {
    const cfg = this.setup.formulas.corpseDanger ?? { hpRef: 100, reviverMult: 1.5, revivableMult: 1.5 };
    const f = this.setup.formulas;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const threat = Math.max(unit.stats.str, unit.stats.int, unit.stats.dex) + unit.stats.spd;
    let best = 0;
    let bestName = '';
    for (const id of unit.skills) {
      const sk = this.skill(id);
      if (!sk) continue;
      let v = 0;
      for (const e of sk.effects) {
        if (e.type === 'damage' || e.type === 'heal') v += attributePower(unit.stats, e.scale, f) * e.power;
        else if (e.type === 'hot') v += attributePower(unit.stats, e.scale, f) * e.power * e.turns;
        else if (e.type === 'shield') v += attributePower(unit.stats, e.scale, f) * e.power * 0.5;
      }
      if (v > best) {
        best = v;
        bestName = sk.name;
      }
    }
    const hpFactor = unit.maxHp / Math.max(1, cfg.hpRef);
    let danger = (threat + best) * hpFactor;
    const parts = [`(threat ${r1(threat)} + best skill ${r1(best)}${bestName ? ` ${bestName}` : ''}) x HP ${Math.round(hpFactor * 100) / 100}`];
    const canRevive = (c: Combatant) => c.skills.some((id) => this.skill(id)?.effects.some((e) => e.type === 'revive'));
    if (canRevive(unit)) {
      danger *= cfg.reviverMult;
      parts.push(`x reviver ${cfg.reviverMult}`);
    }
    const cellFree = !this.combatants.some((o) => o.hp > 0 && o.board === unit.board && o.slot === unit.slot);
    const reviver = cellFree ? this.livingByDepth(unit.side).find((c) => !c.summoned && c.uid !== unit.uid && canRevive(c)) : undefined;
    if (reviver) {
      danger *= cfg.revivableMult;
      parts.push(`x revivable by ${reviver.name} ${cfg.revivableMult}`);
    }
    return { danger: r1(danger), why: parts.join(' ') };
  }

  /**
   * Yapay zekanın (ve oyuncu seçmeden önceki önizlemenin) tüketeceği ceset: corpseChoices içinde EN TEHLİKELİ olan (eşitlikte küçük yuva).
   * Yoksa null (çağrı beslenmemiş gelir). Savaşı değiştirmez. Eski "en son ölen" kuralı madde 230 ile kalktı.
   */
  corpseToConsume(actorUid: string, skillId?: string): Corpse | null {
    const actor = this.get(actorUid);
    if (!actor) return null;
    const id = skillId ?? actor.skills.find((s) => this.consumesCorpse(s));
    if (!id) return null;
    const best = this.corpseChoices(actorUid, id).reduce<CorpseChoice | null>((top, c) => (!top || c.danger > top.danger ? c : top), null);
    return best ? this.corpseOf(best.uid) : null;
  }

  /**
   * Çağrı skill'inin hangi varyantla çağıracağı (UI tooltip/önizleme ve YZ için; savaşı değiştirmez): ceset tüketen çağrıda
   * { empowered: true/false, corpse } (beslenmiş / beslenmemiş), diğer çağrılarda { empowered: undefined, corpse: null }.
   * `corpseUid`: oyuncunun seçtiği ceset (geçerliyse o; verilmezse/geçersizse YZ önerisi = en tehlikeli). `slot`: seçilen yuva (geçerliyse o; yoksa varsayılan).
   */
  summonPreview(actorUid: string, skillId: string, corpseUid?: string, slot?: number): { unit: CombatantDef | null; empowered: boolean | undefined; corpse: Corpse | null; slot: number | null } {
    const effect = this.skill(skillId)?.effects.find((e) => e.type === 'summon');
    if (!effect || effect.type !== 'summon') return { unit: null, empowered: undefined, corpse: null, slot: null };
    const def = this.setup.units[effect.unit];
    const free = this.summonSlots(actorUid, skillId);
    const spot = slot !== undefined && free.includes(slot) ? slot : this.summonSlotFor(actorUid, skillId);
    if (!effect.consumeCorpse) return { unit: def ?? null, empowered: undefined, corpse: null, slot: spot };
    const chosen = corpseUid && this.corpseChoices(actorUid, skillId).some((c) => c.uid === corpseUid) ? this.corpseOf(corpseUid) : null;
    const corpse = chosen ?? this.corpseToConsume(actorUid, skillId);
    return { unit: def ? applySummonVariant(def, corpse ? 'fed' : 'unfed') : null, empowered: !!corpse, corpse, slot: spot };
  }

  /**
   * Diriltme hedefinin neden seçilemeyeceği (UI tooltip, önizleme): null = diriltilebilir. 'Corpse was consumed' (Raise Dead tüketti),
   * 'Cell is taken' (yuvasında canlı birim var), 'Not a fallen ally' (canlı, çağrı ya da düşman).
   */
  reviveBlockReason(actorUid: string, targetUid: string): string | null {
    const actor = this.get(actorUid);
    const t = this.get(targetUid);
    if (!actor || !t || t.side !== actor.side || t.hp > 0 || t.summoned) return 'Not a fallen ally';
    if (this.corpseState.get(t.uid) === 'consumed') return 'Corpse was consumed';
    if (this.combatants.some((o) => o.hp > 0 && o.board === t.board && o.slot === t.slot)) return 'Cell is taken';
    return null;
  }

  /** Ceset kaydı: çağrı olmayan birim öldüğünde (revivable). */
  private leaveCorpse(c: Combatant): boolean {
    if (c.summoned) return false;
    this.corpseState.set(c.uid, 'revivable');
    this.corpseOrder.set(c.uid, ++this.corpseCounter);
    return true;
  }

  /** Dirilen birimin ceset kaydı biter. */
  private clearCorpse(uid: string): void {
    this.corpseState.delete(uid);
    this.corpseOrder.delete(uid);
  }

  /**
   * Çağrı skill'i için seçilebilecek yuvalar (madde 230): kullanıcının KENDİ tahtasındaki boş yuvalar, ölü dostun diriltme için ayrılmış yuvaları
   * (fallenSlots) HARİÇ; küçükten büyüğe. Çağrı skill'i değilse boş.
   */
  summonSlots(actorUid: string, skillId: string): number[] {
    if (!this.get(actorUid) || !this.needsSlotChoice(skillId)) return [];
    const board = this.summonBoard(actorUid, skillId);
    const reserved = new Set(this.fallenSlots(board));
    return this.freeSlots(board).filter((s) => !reserved.has(s));
  }

  /** Çağrının varsayılan (yapay zeka) yuvası: summonSlots içinden; yakın dövüşçü çağrı en öndeki, diğerleri en arkadaki yuvaya. Yer yoksa null. */
  summonSlotFor(actorUid: string, skillId: string): number | null {
    const effect = this.skill(skillId)?.effects.find((e) => e.type === 'summon');
    const def = effect && effect.type === 'summon' ? this.setup.units[effect.unit] : undefined;
    const free = this.summonSlots(actorUid, skillId);
    if (!def || free.length === 0) return null;
    const melee = this.setup.skills[def.skills[0] ?? '']?.motion === 'melee';
    return melee ? free[0]! : free[free.length - 1]!;
  }

  /** Bir tahtadaki boş (canlı birim olmayan) yuvalar (küçükten büyüğe). Çağrılar için summonSlots kullanılır (ölü dost yuvaları hariç). */
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
      case 'random_enemies':
      case 'all_enemies': {
        let list = this.livingByDepth(opposite(actor.side));
        if (skill.motion === 'melee' && !skill.ignoreReach && !this.debugCasting) {
          // Ön sıra, düşmanın kendi tahtasındaki birimlere göre belirlenir (çağrılar da kendi tahtalarında durur; eski "düşman tahtasına sızan çağrı" kuralı madde 222 ile kalktı)
          const home = list.filter((c) => c.board === c.side);
          const rows = [...new Set(home.map((c) => this.rowOf(c.slot)))].slice(0, this.setup.formulas.formation.meleeRows + (skill.reach ?? 0));
          list = list.filter((c) => c.board !== c.side || rows.includes(this.rowOf(c.slot)));
        }
        // Backstab: yalnızca arkası boş hedefler (menzil gibi bir erişim kuralı; taunt bundan SONRA uygulanır: arkası dolu taunter seçilemez)
        if (skill.requiresOpenBehind && !this.debugCasting) list = list.filter((c) => this.openBehindProblem(c) === null);
        if (skill.target === 'single_enemy' && !this.debugCasting) {
          const taunters = list.filter((c) => c.statuses.some((s) => s.kind === 'taunt'));
          if (taunters.length > 0) list = taunters;
        }
        return list;
      }
      case 'single_ally':
        // excludeSelf (Guard): kullanıcı kendini hedefleyemez
        return this.livingByDepth(actor.side).filter((c) => !skill.excludeSelf || c.uid !== actor.uid);
      case 'all_allies':
        return this.livingByDepth(actor.side);
      case 'dead_ally':
        // Düşmüş dostlar (çağrılar hariç); cesedi tüketildiyse (Raise Dead) ya da yuvası başka bir birim tarafından doldurulduysa diriltilemez
        return this.combatants
          .filter((c) => c.side === actor.side && c.board === c.side && c.hp <= 0 && !c.summoned && this.corpseState.get(c.uid) !== 'consumed' && !this.combatants.some((o) => o.hp > 0 && o.board === c.board && o.slot === c.slot))
          .sort((x, y) => x.slot - y.slot);
      case 'everyone':
        return [...this.livingByDepth(actor.side), ...this.livingByDepth(opposite(actor.side))];
      case 'area_any':
        // İki tahtaya da atılabilen alan (Smoke Bomb): alandaki her canlı birim aday; etkiler `side` ile ayrılır (menzil/taunt yok)
        return [...this.livingByDepth(opposite(actor.side)), ...this.livingByDepth(actor.side)];
      case 'empty_tile':
        return []; // hedef birim değil boş yuva: freeTiles(uid)
    }
  }

  /** Bir birimin hemen ARKASINDAKİ hücre (bir sıra daha derin, aynı şerit, kendi tahtasında); en arka sıradaysa null. */
  behindSlotOf(c: Combatant): number | null {
    const { rows, lanes } = this.setup.formulas.formation;
    const behind = c.slot + lanes;
    return behind < rows * lanes ? behind : null;
  }

  /**
   * requiresOpenBehind (Backstab) kuralı: hedefin arkası BOŞ mu? Boşsa null; değilse oyuncuya gösterilecek neden (İngilizce):
   * 'No room behind the target' (hedef en arka sırada) ya da 'Target is shielded from behind' (arkasındaki hücrede CANLI birim var).
   * Karar: yalnızca canlı birim engeller; ceset ve ölü dostun ayrılmış (fallenSlots) hücresi engel DEĞİLDİR.
   */
  openBehindProblem(target: Combatant): string | null {
    const behind = this.behindSlotOf(target);
    if (behind === null) return 'No room behind the target';
    if (this.combatants.some((o) => o.hp > 0 && o.board === target.board && o.slot === behind)) return 'Target is shielded from behind';
    return null;
  }

  /**
   * UI/önizleme: bu skill bu hedefe kullanılabilir mi? Kullanılabilirse null; değilse neden (ör. Backstab: 'No room behind the target' /
   * 'Target is shielded from behind'; menzil: 'Out of reach'; taunt: 'Must target the taunting enemy'). Bedel/sıra denetlenmez (canUse ayrı).
   */
  targetProblem(actorUid: string, skillId: string, targetUid: string): string | null {
    const actor = this.get(actorUid);
    const skill = this.skill(skillId);
    const target = this.get(targetUid);
    if (!actor || !skill || !target) return 'Invalid target';
    if (target.hp <= 0 && skill.target !== 'dead_ally') return 'Target is dead';
    if (this.validTargets(actorUid, skillId).some((c) => c.uid === targetUid)) return null;
    if (skill.excludeSelf && targetUid === actorUid) return this.selfTargetReason(skill);
    if (skill.target === 'single_enemy' && target.side !== actor.side) {
      if (skill.requiresOpenBehind) {
        const p = this.openBehindProblem(target);
        if (p) return p;
      }
      const tauntingFoe = this.living(target.side).some((c) => c.statuses.some((s) => s.kind === 'taunt'));
      return tauntingFoe ? 'Must target the taunting enemy' : 'Out of reach';
    }
    return 'Invalid target';
  }

  /** excludeSelf skill'inde kullanıcı kendini seçtiyse neden: Guard 'Cannot guard yourself', diğerleri 'Cannot target yourself'. */
  private selfTargetReason(skill: SkillDef): string {
    return skill.effects.some((e) => e.type === 'guard') ? 'Cannot guard yourself' : 'Cannot target yourself';
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
    if (this.mode === 'turns' && !this.noCooldowns && (actor.cooldowns[skillId] ?? 0) > 0) return { ok: false, reason: 'On cooldown' };
    // Yakın dövüş yalnızca kendi takımının ön sırasındaki birimlerden yapılabilir (dash/charge gibi skill'ler ignoreFrontRow ile istisna olur)
    if (skill.motion === 'melee' && skill.target !== 'self' && !skill.ignoreFrontRow && !skill.ignoreReach && actor.board === actor.side && this.rowOf(actor.slot) > this.frontRowOf(actor.side) + (skill.reach ?? 0)) {
      return { ok: false, reason: 'Melee: front row only' };
    }
    const resource = skill.cost.resource;
    const amount = skillCostAmount(skill.cost, actor); // oranlı bedel (ofCurrent): mevcut kaynağın oranı, en az 1
    if (resource === 'mp' && !this.freeMp && actor.mp < amount) return { ok: false, reason: 'Not enough MP' };
    if (resource === 'rage' && !this.freeRage && (actor.rage ?? 0) < amount) return { ok: false, reason: 'Not enough rage' };
    if (resource === 'hp' && actor.hp <= amount) return { ok: false, reason: 'Not enough HP' };
    if (skill.effects.some((e) => e.type === 'summon') && this.summonSlots(actorUid, skillId).length === 0) {
      return { ok: false, reason: 'No free slot' };
    }
    if (this.validTargets(actorUid, skillId).length === 0) {
      const reason = skill.target === 'dead_ally' ? this.noReviveReason(actor) : skill.requiresOpenBehind ? 'No target with room behind it' : skill.excludeSelf ? (skill.effects.some((e) => e.type === 'guard') ? 'No ally to guard' : 'No other ally') : 'No target in reach';
      return { ok: false, reason };
    }
    return { ok: true };
  }

  /** Diriltilecek hedef yoksa neden: tüm düşmüş dostların cesedi tüketildiyse 'Corpse was consumed', aksi halde 'No fallen ally'. */
  private noReviveReason(actor: Combatant): string {
    const fallen = this.combatants.filter((c) => c.side === actor.side && c.hp <= 0 && !c.summoned);
    return fallen.length > 0 && fallen.every((c) => this.corpseState.get(c.uid) === 'consumed') ? 'Corpse was consumed' : 'No fallen ally';
  }

  /** Aktörün şu an kullanabileceği en az bir skill'i var mı? */
  hasUsableSkill(actorUid: string): boolean {
    return (this.get(actorUid)?.skills ?? []).some((id) => this.canUse(actorUid, id).ok);
  }

  /**
   * Class skill'i ya da (skillId global bir id ise) global skill kullanır; global skill'de `slot` Move Tile'ın hedef boş yuvasıdır.
   * `board`: yalnızca area_any (Smoke Bomb) alan skill'inde anchor hücrenin tahtası (yoksa karşı taraf; `targetUid = 'tile:<yuva>'` kendi tahtası).
   * `corpseUid`: ceset tüketen çağrıda (Raise Dead) tüketilecek düşman cesedi (corpseChoices'tan); ceset varken ZORUNLU ('Choose a corpse to consume'),
   * hiç ceset yokken verilirse yok sayılır. Çağrıda `slot` summonSlots'tan biri olmalı (verilmezse varsayılan yuva).
   */
  useSkill(actorUid: string, skillId: string, targetUid?: string, slot?: number, board?: Side, corpseUid?: string): ActionResult {
    if (this.globalDef(skillId)) return this.useGlobal(actorUid, skillId, slot ?? slotOfTileUid(targetUid));
    return this.cast(actorUid, skillId, targetUid, slot, false, board, corpseUid);
  }

  /** Tek giriş noktası: class skill'i ya da global skill ({kind:'global', id, slot?}). */
  act(actorUid: string, action: BattleAction): ActionResult {
    return action.kind === 'global' ? this.useGlobal(actorUid, action.id, action.slot ?? slotOfTileUid(action.targetUid)) : this.cast(actorUid, action.skillId, action.targetUid, action.slot, false, action.board, action.corpseUid);
  }

  /** Yapay zeka seçimini uygular; seçim yoksa (null) turu pas geçer (skipTurn). */
  applyChoice(actorUid: string, choice: ChoiceLike | null): ActionResult {
    if (!choice) return this.skipTurn();
    return this.useSkill(actorUid, choice.skillId, choice.targetUid, choice.slot, choice.board, choice.corpseUid);
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

  /** Bir tarafın tahtasında diriltilmeyi bekleyen (düşmüş, çağrı olmayan, cesedi TÜKETİLMEMİŞ) dostların boş yuvaları; tüketilmiş cesedin yuvası rezerve değildir. */
  fallenSlots(side: Side): number[] {
    return this.combatants
      .filter((c) => c.side === side && c.board === side && c.hp <= 0 && !c.summoned && this.corpseState.get(c.uid) !== 'consumed' && !this.combatants.some((o) => o.hp > 0 && o.board === side && o.slot === c.slot))
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
  debugCast(actorUid: string, skillId: string, targetUid?: string, slot?: number, corpseUid?: string): ActionResult {
    if (!this.get(actorUid)) return { ok: false, reason: 'No such unit' };
    if (!this.skill(skillId)) return { ok: false, reason: 'Unknown skill' };
    this.debugCasting = true;
    try {
      return this.cast(actorUid, skillId, targetUid, slot, true, undefined, corpseUid);
    } finally {
      this.debugCasting = false;
    }
  }

  private cast(actorUid: string, skillId: string, targetUid: string | undefined, slot: number | undefined, debug: boolean, boardArg?: Side, corpseArg?: string): ActionResult {
    if (!debug) {
      const can = this.canUse(actorUid, skillId);
      if (!can.ok) return can;
      if (slot !== undefined && this.needsSlotChoice(skillId) && !this.summonSlots(actorUid, skillId).includes(slot)) {
        return { ok: false, reason: this.fallenSlots(this.summonBoard(actorUid, skillId)).includes(slot) ? 'That cell is reserved for a fallen ally' : 'Invalid slot' };
      }
    }
    // Ceset tüketen çağrı (Raise Dead, madde 230): oyuncu cesedi seçer (ceset varken zorunlu); debug oynatmada seçilmezse YZ önerisi (en tehlikeli)
    let corpseUid: string | undefined;
    if (this.consumesCorpse(skillId)) {
      const choices = this.corpseChoices(actorUid, skillId);
      if (choices.length > 0) {
        if (corpseArg && choices.some((c) => c.uid === corpseArg)) corpseUid = corpseArg;
        else if (debug) corpseUid = this.corpseToConsume(actorUid, skillId)?.uid;
        else if (!corpseArg) return { ok: false, reason: 'Choose a corpse to consume' };
        else return { ok: false, reason: this.corpseState.get(corpseArg) === 'consumed' ? 'Corpse was consumed' : 'Invalid corpse' };
      }
    }
    // Çağrının yuvası (skillUsed olayına da yazılır): seçilen ya da varsayılan; debug oynatmada yer yoksa herhangi bir boş yuva
    let summonSpot: number | null = null;
    if (this.needsSlotChoice(skillId)) {
      const okSlots = this.summonSlots(actorUid, skillId);
      const anyFree = this.freeSlots(this.summonBoard(actorUid, skillId));
      summonSpot = slot !== undefined && (okSlots.includes(slot) || (debug && anyFree.includes(slot))) ? slot : this.summonSlotFor(actorUid, skillId);
      if (summonSpot === null && debug) summonSpot = anyFree[0] ?? null;
    }
    const actor = this.get(actorUid)!;
    const skill = this.skill(skillId)!;
    const f = this.setup.formulas;

    let targets = this.validTargets(actorUid, skillId);
    if (debug && targets.length === 0 && !this.needsSlotChoice(skillId)) return { ok: false, reason: skill.target === 'dead_ally' ? 'No fallen ally' : 'No target' };
    let centerSlot: number | undefined;
    let centerCells: number[] | undefined;
    const hit = new Set<string>();
    /** Bu skill'de en az bir KRİTİK vuruş alan hedefler (Omen critStacks). */
    const critHit = new Set<string>();
    const splashUids = new Set<string>();
    let stageGroups: AreaStage[] | undefined;
    let stageTargets: Combatant[][] | undefined;
    let areaBoard: Side | undefined;
    if (this.isAreaSkill(skillId)) {
      // Anchor: seçilen birimin hücresi ya da (boş olabilen) seçilen hücre. Anchor birimi erişim dışında (arkada) da olabilir: yalnızca hücreyi belirler.
      // area_any (Smoke Bomb): tahta = anchor biriminin tahtası; `tile:<yuva>` = kendi tahtası; yoksa `boardArg` (varsayılan karşı taraf).
      const anyBoard = this.isAnyBoardArea(skillId);
      const tileSlot = anyBoard ? slotOfTileUid(targetUid) : undefined;
      const anchorUnit = targetUid && tileSlot === undefined ? this.get(targetUid) : undefined;
      const board: Side = anyBoard ? (tileSlot !== undefined ? actor.side : anchorUnit && anchorUnit.hp > 0 ? anchorUnit.board : (boardArg ?? opposite(actor.side))) : opposite(actor.side);
      const anchor = anchorUnit && anchorUnit.hp > 0 && anchorUnit.board === board ? anchorUnit : undefined;
      const total = this.setup.formulas.formation.rows * this.setup.formulas.formation.lanes;
      const center = anchor ? anchor.slot : (tileSlot ?? slot ?? (debug ? targets.find((c) => c.board === board)?.slot ?? targets[0]?.slot : undefined));
      if (center === undefined || !Number.isInteger(center) || center < 0 || center >= total) return { ok: false, reason: 'Invalid target' };
      targets = this.areaWindowAt(actorUid, skillId, center, board);
      if (!debug && targets.length === 0) return { ok: false, reason: anyBoard && board === actor.side ? 'No ally in the area' : 'No target in the area' };
      centerSlot = center;
      areaBoard = board;
      centerCells = this.areaCells(skillId, center, board);
      // Aşamalı vuruş: hedefler aşamalara bölünür (areaWindowAt zaten aşama sırasıyla döner)
      if (this.isStagedSkill(skillId)) {
        const all = targets;
        const cellsByStage = this.areaStageCells(skillId, center, board);
        stageTargets = cellsByStage.map((cells) => all.filter((c) => cells.includes(c.slot)));
        stageGroups = cellsByStage.map((cells, i) => ({ cells, targets: stageTargets![i]!.map((c) => c.uid) }));
      }
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
      if (!chosen) {
        if (skill.excludeSelf && targetUid === actorUid) return { ok: false, reason: this.selfTargetReason(skill) };
        return { ok: false, reason: skill.target === 'dead_ally' && targetUid && this.corpseState.get(targetUid) === 'consumed' ? 'Corpse was consumed' : (targetUid && skill.requiresOpenBehind && this.targetProblem(actorUid, skillId, targetUid)) || 'Invalid target' };
      }
      targets = [chosen];
      // Yan vuruşlu (splash) skill: seçilen hedefin yanındaki hücreler de vurulur (ilk hedef = seçilen)
      for (const s of this.splashTargets(skillId, chosen)) {
        targets.push(s);
        splashUids.add(s.uid);
      }
    }

    const events: BattleEvent[] = [];
    // Aşamalı skill: aşama sürerken çıkan HER olay aşama numarasını taşır (stage)
    let stage: number | undefined;
    const emit: Emit = (e) => {
      const ev: BattleEvent = stage === undefined ? e : { ...e, stage };
      events.push(ev);
      this.record(ev);
    };

    if (!debug) this.observer?.before?.({ kind: 'skill', actorUid, id: skillId, targetUids: targets.map((t) => t.uid), ...(centerSlot !== undefined ? { center: centerSlot, cells: centerCells } : {}), ...(areaBoard && skill.target === 'area_any' ? { board: areaBoard } : {}) });
    // Backstab (requiresOpenBehind): görsel ışınlanma hücresi (hedefin arkası) ve dönüş hücresi; gerçek yer değiştirme yok
    const backTarget = skill.requiresOpenBehind ? targets[0] : undefined;
    const behind = backTarget ? this.behindSlotOf(backTarget) : null;
    emit({
      type: 'skillUsed',
      actor: actor.uid,
      skill: skill.id,
      targets: targets.map((t) => t.uid),
      ...(centerSlot !== undefined ? { center: centerSlot, anchor: centerSlot, cells: centerCells } : {}),
      ...(stageGroups ? { stages: stageGroups } : {}),
      ...(areaBoard && skill.target === 'area_any' ? { board: areaBoard } : {}),
      ...(backTarget && behind !== null ? { behindSlot: behind, behindBoard: backTarget.board, from: actor.slot } : {}),
      ...(summonSpot !== null ? { slot: summonSpot } : {}),
      ...(corpseUid ? { corpseUid } : {}),
      ...(this.turnCostOf(skill.id) < 1 ? { turnCost: this.turnCostOf(skill.id) } : {}),
    });

    if (!debug && this.mode === 'turns' && !this.noCooldowns && (skill.cooldown ?? 0) > 0) actor.cooldowns[skill.id] = skill.cooldown!;

    const resource = skill.cost.resource;
    const cost = skillCostAmount(skill.cost, actor); // oranlı bedel (Wail: mevcut canın %20'si) ödeme anındaki kaynaktan
    if (!debug && cost > 0 && !(resource === 'mp' && this.freeMp) && !(resource === 'rage' && this.freeRage)) {
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
    // Aşamasız skill tek grup (tüm hedefler). Aşamalı skill: her aşama sırayla tüm etkileri uygular (aşama başına bir kez çalışması sorun olan
    // etkiler (bahis, kalkan tüketme, mana çalma kazancı, kendine etkiler) aşamalı skill'de veri doğrulamasıyla yasak: stagedEffectProblem).
    const groups: Array<{ targets: Combatant[]; cells?: number[] }> =
      stageTargets && stageGroups ? stageTargets.map((ts, i) => ({ targets: ts, cells: stageGroups![i]!.cells })) : [{ targets, ...(centerCells ? { cells: centerCells } : {}) }];
    let repeatAnnounced = false;
    // endsOnOwnAttack (Jinxed): bu hasar skill'inin TÜM vuruşları durumdan etkilenir, skill bitince durum düşer
    const ownAttackEnds = skill.effects.some((e) => e.type === 'damage') ? actor.statuses.filter((s) => this.statusDef(s.kind)?.endsOnOwnAttack) : [];
    const hitIndex = new Map<SkillEffect, number>(); // etki başına toplam vuruş sırası (falloff ve ilk-hedef ekleri aşamalar boyunca sürer)
    for (const [gi, group] of groups.entries()) {
    stage = stageGroups ? gi : undefined;
    for (const effect of skill.effects) {
      const ts = this.effectTargets(skill, effect, group.targets, actor);
      switch (effect.type) {
        case 'damage': {
          // Bahis: skill başına bir kez zar atılır; kazanç/kayıp çarpanı tüm vuruşlara uygulanır
          const betMult = effect.bet ? this.rollBet(actor, effect.bet, emit) : 1;
          const base = hitIndex.get(effect) ?? 0;
          hitIndex.set(effect, base + ts.length);
          if (betMult > 0) {
            ts.forEach((target, i) => {
              const idx = base + i;
              if (target.hp <= 0) return;
              // Şerit skill'inde her yeni hedef bir öncekinin `falloff` katı hasar alır (öndekinden arkadakine)
              const mult = (effect.falloff ? Math.pow(effect.falloff, idx) : 1) * betMult * (splashUids.has(target.uid) ? skill.splash?.mult ?? 1 : 1);
              const r = this.strike(actor, target, effect, emit, mult, idx === 0);
              if (r.landed) hit.add(target.uid);
              if (r.crit) critHit.add(target.uid);
              // X şekli gibi: anchor (merkez) hücredeki birim hitsAtCenter kez vurulur (her vuruş ayrı isabet/hasar/kritik zarı)
              if (centerSlot !== undefined && target.board === areaBoard && target.slot === centerSlot) {
                for (let k = 1; k < (skill.area?.hitsAtCenter ?? 1) && target.hp > 0; k++) {
                  const rc = this.strike(actor, target, effect, emit, mult, false);
                  if (rc.landed) hit.add(target.uid);
                  if (rc.crit) critHit.add(target.uid);
                }
              }
              // Çifte vuruş: aynı vuruş bir kez daha (zar her hedef için bir kez atılır)
              if (effect.repeatChance && this.rng.next() < effect.repeatChance && target.hp > 0) {
                if (!repeatAnnounced) {
                  repeatAnnounced = true;
                  emit({ type: 'passive', actor: actor.uid, passive: 'gamble_double', name: 'Double Hit' });
                }
                const r2 = this.strike(actor, target, effect, emit, mult, false);
                if (r2.landed) hit.add(target.uid);
                if (r2.crit) critHit.add(target.uid);
              }
            });
          }
          // Shield Crush gibi: kullanıcının kalkanı tüm hedefler vurulduktan sonra tüketilir
          if (effect.bonusFromShield?.consume && actor.shield > 0) {
            const spent = actor.shield;
            actor.shield = 0;
            this.trimShieldHooks(actor);
            emit({ type: 'shield', source: actor.uid, target: actor.uid, amount: -spent, shieldAfter: 0, magicShieldAfter: actor.magicShield, magic: false });
          }
          break;
        }
        case 'heal':
          for (const target of ts) {
            if (target.hp <= 0) continue;
            const base = rollHeal(actor.stats, effect.scale, effect.power, f, this.rng);
            const { crit, mult } = rollCrit(this.effectiveStats(actor), this.rng); // kritik: şifanın SON çarpanı (geçerli kritik şansı: Misfortune/Jinxed dahil)
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
            delete target.shieldHooks;
            target.statuses = [];
            target.turnCounter = 0;
            if (target.maxRage !== undefined) target.rage = 0;
            this.announcedDead.delete(target.uid);
            this.clearCorpse(target.uid);
            emit({ type: 'revive', source: actor.uid, target: target.uid, hpAfter: target.hp, mpAfter: target.mp });
            // Diriltme sonrası yenilenme (veri: revive.regen): sonraki `turns` turunun başında maks canın `ratio`'su (sabit, kritiksiz; durum olayı cause 'revival')
            if (effect.regen && effect.regen.turns > 0 && effect.regen.ratio > 0) {
              const amount = Math.max(1, Math.round(target.maxHp * effect.regen.ratio));
              this.addStatus(target, { kind: 'regen', turns: effect.regen.turns, source: actor.uid, amount, critChance: 0, critMult: 1, cause: 'revival' }, emit, 'revival');
            }
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
                critChance: this.effectiveStats(actor).critChance,
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
            this.trimShieldHooks(target);
            if (magic) target.magicShield += amount;
            else target.shield += amount;
            // Kancalı kalkan (onAbsorb): havuzun bu kısmı bu skill'e ait; aynı atanın aynı skill'i yeniden atılırsa katman büyür
            if (effect.onAbsorb && amount > 0) {
              const hooks = (target.shieldHooks ??= []);
              const same = hooks.find((h) => h.skill === skill.id && h.caster === actor.uid && h.magic === magic);
              if (same) same.amount += amount;
              else hooks.push({ skill: skill.id, caster: actor.uid, magic, amount, onAbsorb: { ...effect.onAbsorb } });
            }
            emit({ type: 'shield', source: actor.uid, target: target.uid, amount, shieldAfter: target.shield, magicShieldAfter: target.magicShield, magic });
          }
          break;
        case 'dispel':
          for (const target of ts) {
            if (target.hp > 0) this.dispel(target, effect.status, effect.count, actor, skill.id, emit);
          }
          break;
        case 'bond':
          for (const target of ts) {
            if (target.hp <= 0 || target.uid === actor.uid) continue;
            this.formBond(actor, target, effect.turns, effect.ratio, emit);
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
          // `chance`: her (canlı) alıcı için BAĞIMSIZ zar (alıcı başına bir rng sayısı; chance yoksa/1 ise zar atılmaz, akış eskisiyle aynı)
          const chance = effect.chance ?? 1;
          for (const r of recipients) {
            if (r.hp <= 0) continue;
            if (chance < 1 && !(this.rng.next() < chance)) continue;
            this.addStatus(r, { kind: effect.status, turns: effect.turns, source: actor.uid }, emit, effect.cause);
          }
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
          const slots = group.cells ?? this.areaCells(skillId, centerSlot, opposite(actor.side));
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
        case 'omen': {
          // Yığın (Omen): yalnızca isabet edenlere; kritik vuruş alana critStacks. Aynı skill'de detonate varsa otomatik Doom bastırılır (çift patlama yok)
          const kind = effect.status ?? 'omen';
          const hasDamage = skill.effects.some((e) => e.type === 'damage');
          const recipients = hasDamage ? ts.filter((c) => hit.has(c.uid)) : ts;
          const auto = !skill.effects.some((e) => e.type === 'detonate' && e.status === kind);
          for (const r of recipients) {
            if (r.hp <= 0) continue;
            const crit = critHit.has(r.uid) && effect.critStacks !== undefined;
            this.addStacks(r, kind, crit ? effect.critStacks! : effect.stacks, actor, emit, crit, auto);
          }
          break;
        }
        case 'detonate': {
          // Doom Mark: isabet eden hedefteki yığın (kaç olursa olsun, en az 1) çarpanla anında patlar; iskada hiçbir şey olmaz (yığın ve sayaç yerinde)
          const hasDamage = skill.effects.some((e) => e.type === 'damage');
          for (const r of hasDamage ? ts.filter((c) => hit.has(c.uid)) : ts) {
            const st = r.statuses.find((s) => s.kind === effect.status);
            if (r.hp <= 0 || !st || (st.stacks ?? 0) <= 0) continue;
            this.triggerDoom(r, st, effect.mult, 'detonate', actor, emit, skill.id);
          }
          break;
        }
        case 'dot': {
          // Karakter üstü DoT (Wither): miktar uygulama anında sabitlenir; yeniden uygulanınca süre yenilenir, büyük miktar kalır
          const hasDamage = skill.effects.some((e) => e.type === 'damage');
          const amount = Math.round(attributePower(actor.stats, effect.scale, f) * effect.power);
          for (const r of hasDamage ? ts.filter((c) => hit.has(c.uid)) : ts) {
            if (r.hp <= 0) continue;
            const old = r.statuses.find((s) => s.kind === effect.status)?.amount ?? 0;
            this.addStatus(r, { kind: effect.status, turns: effect.turns, source: actor.uid, amount: Math.max(amount, old) }, emit);
          }
          break;
        }
        case 'selfDamage': {
          const amount = Math.min(actor.hp - 1, Math.round(actor.maxHp * effect.ratio));
          if (amount > 0) {
            actor.hp -= amount;
            emit({ type: 'damage', source: actor.uid, target: actor.uid, amount, absorbed: 0, hpAfter: actor.hp, shieldAfter: actor.shield, magicShieldAfter: actor.magicShield, crit: false, origin: 'self' });
          }
          break;
        }
        case 'summon': {
          const baseDef = this.setup.units[effect.unit];
          const board = actor.side; // çağrılar daima kendi tahtasına
          const spot = baseDef ? summonSpot : null;
          if (!baseDef || spot === null) break;
          // Ceset tüketen çağrı (Raise Dead): seçilen (oyuncu) / en tehlikeli (YZ) düşman cesedini tüketir -> beslenmiş (fed); ceset yoksa beslenmemiş (unfed)
          let empowered: boolean | undefined;
          if (effect.consumeCorpse) {
            const corpse = corpseUid && this.corpseState.get(corpseUid) === 'revivable' ? this.corpseOf(corpseUid) : null;
            empowered = !!corpse;
            if (corpse) {
              this.corpseState.set(corpse.uid, 'consumed');
              emit({ type: 'corpseConsumed', uid: corpse.uid, by: actor.uid, slot: corpse.slot, side: corpse.side });
            }
          }
          const def = empowered === undefined ? baseDef : applySummonVariant(baseDef, empowered ? 'fed' : 'unfed');
          const summoned = createCombatant(def, actor.side, spot, `${actor.side}-s${this.summonCount++}`);
          summoned.board = board;
          summoned.owner = actor.uid;
          summoned.summoned = true;
          summoned.lifespan = effect.lifespan;
          if (empowered !== undefined) summoned.empowered = empowered;
          this.combatants.push(summoned);
          emit({ type: 'summon', actor: actor.uid, combatant: cloneCombatant(summoned), ...(empowered !== undefined ? { empowered } : {}) });
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
    }
    stage = undefined;

    for (const s of ownAttackEnds) {
      if (!actor.statuses.includes(s)) continue;
      actor.statuses = actor.statuses.filter((x) => x !== s);
      emit({ type: 'statusEnd', target: actor.uid, status: s.kind, consumed: true });
    }

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
      this.finishAction(actor, emit, this.turnCostOf(skill.id));
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
        emit({ type: 'damage', source: actor.uid, target: actor.uid, amount: stake, absorbed: 0, hpAfter: actor.hp, shieldAfter: actor.shield, magicShieldAfter: actor.magicShield, crit: false, origin: 'self' });
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

  /**
   * Eylem sonrası: çağrının süresi dolduysa kaldır, kazananı belirle, turns modunda sırayı ilerlet.
   * `turnCost` (skill'in turnCost'u; varsayılan 1): sayaçtan eşiğin bu katı düşer (0,5 = yarım turn: sonraki sıra yarı sürede gelir).
   */
  private finishAction(actor: Combatant, emit: Emit, turnCost = 1): void {
    this.turnsTaken++;
    if (this.mode === 'turns' && actor.summoned && actor.lifespan !== undefined && actor.hp > 0) {
      actor.lifespan--;
      if (actor.lifespan <= 0) {
        actor.hp = 0;
        emit({ type: 'despawn', target: actor.uid });
        this.breakAllBonds(actor, emit);
      }
    }
    if (!this.winner) {
      if (this.living('enemy').length === 0) this.winner = 'party';
      else if (this.living('party').length === 0) this.winner = 'enemy';
      if (this.winner) emit({ type: 'battleEnd', winner: this.winner });
    }
    this.observer?.after?.(actor.uid);
    if (this.mode === 'turns' && !this.winner) {
      actor.turnCounter -= this.setup.formulas.turn.threshold * turnCost;
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
      this.applyHit(src, actor, this.groundTickDamage(g.ground, g.amount, actor), 'magic', false, emit, false, { origin: 'ground', element: this.setup.grounds?.[g.ground]?.element ?? 'physical', damageType: 'magic', ground: g.ground, groundId: g.id });
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
    // Karakter üstü DoT tikleri (Wither): zemin tiklerinden HEMEN sonra; isabet/kritik yok, Guard'a aktarılmaz, kalkan ve Lucky Escape normal
    for (const st of [...actor.statuses]) {
      const dot = this.statusDef(st.kind)?.dot;
      if (!dot || actor.hp <= 0 || !actor.statuses.includes(st)) continue;
      const src = this.get(st.source) ?? actor;
      this.applyHit(src, actor, this.dotTickDamage(st.kind, st.amount ?? 0, actor), dot.damageType, false, emit, false, { origin: 'status', element: dot.element, damageType: dot.damageType, status: st.kind });
      this.announceIfDead(actor, emit);
    }
    // Yığılan durumun süresi (Omen, madde Ö2): taşıyanın tur başında 1 azalır; dolunca yığın sayısı kadar Doom patlar (burstOnExpire; snapshot ile).
    // DoT tikinden SONRA, yenilenmeden ÖNCE; taşıyan zemin/DoT tikinde öldüyse patlamaz (Ill Omen ölümde yığını zaten geçirdi)
    for (const st of [...actor.statuses]) {
      const def = this.statusDef(st.kind);
      if (!def?.maxStacks || actor.hp <= 0 || !actor.statuses.includes(st)) continue;
      st.turns--;
      if (st.turns > 0) continue;
      if (def.burstOnExpire && def.doom && (st.stacks ?? 0) > 0) this.triggerDoom(actor, st, def.doom.expireMult ?? 1, 'expire', undefined, emit);
      else {
        actor.statuses = actor.statuses.filter((s) => s !== st);
        emit({ type: 'statusEnd', target: actor.uid, status: st.kind });
      }
    }
    if (actor.hp <= 0) skipThisTurn = true;
    // Süreli durumlar: tur bazlı şifa işler, süreler azalır, biten durumlar kalkar
    for (const status of [...actor.statuses]) {
      if (!actor.statuses.includes(status)) continue;
      if (this.statusDef(status.kind)?.maxStacks) continue; // yığılan durumun süresi yukarıda işlendi
      // Dark Bond: süre yalnızca bağı KURANIN turlarında azalır; bağlı dosttaki kopya kendi turunda azalmaz (sahibininkiyle eşitlenir)
      if (status.kind === 'dark_bond' && status.source !== actor.uid) continue;
      if (status.kind === 'regen' && actor.hp > 0) {
        const { crit, mult } = rollCrit({ critChance: status.critChance ?? 0, critMult: status.critMult ?? 1 }, this.rng);
        this.applyHeal(this.get(status.source) ?? actor, actor, Math.round((status.amount ?? 0) * mult), crit, emit);
      }
      status.turns--;
      const mirror = status.kind === 'dark_bond' ? this.bondCopy(actor.uid, status.partner) : undefined;
      if (mirror) mirror.status.turns = status.turns;
      if (status.turns <= 0) {
        actor.statuses = actor.statuses.filter((s) => s !== status);
        emit({ type: 'statusEnd', target: actor.uid, status: status.kind });
        if (mirror) {
          mirror.unit.statuses = mirror.unit.statuses.filter((s) => s !== mirror.status);
          emit({ type: 'statusEnd', target: mirror.unit.uid, status: 'dark_bond' });
        }
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

  /** `cause`: görsel neden (skill etkisinin `cause` alanı, ör. 'vines'); `status` olayına aynen yazılır. */
  private addStatus(target: Combatant, status: Status, emit: Emit, cause?: string): void {
    // Str-primary Resilience: karaktere uygulanan her debuff, uygulanırken ihtimalle 1 tur kısalır (en az 1 kalır; 1 turluk debuff'ta zar atılmaz).
    // Yer etkilerinin kendi süresi (ground turns) buradan geçmez; yalnızca karakter üstünde tutulan durumlar etkilenir.
    const resilience = target.stats.resilience ?? 0;
    if (resilience > 0 && this.statusDef(status.kind)?.type === 'debuff' && status.turns > 1 && this.rng.next() < resilience) {
      status = { ...status, turns: status.turns - 1 };
      emit({ type: 'passive', actor: target.uid, passive: 'primary_str', name: 'Resilience' });
    }
    // Aynı türden durum yenisiyle değişir; tur bazlı şifa (regen) ve Dark Bond kopyası kaynağa göre ayrı tutulur (iki farklı Undead aynı dostu bağlayabilir)
    const perSource = status.kind === 'regen' || status.kind === 'dark_bond';
    target.statuses = target.statuses.filter((s) => !(s.kind === status.kind && (!perSource || s.source === status.source)));
    target.statuses.push(status);
    emit({ type: 'status', target: target.uid, status: status.kind, turns: status.turns, source: status.source, ...(cause ? { cause } : {}), ...(status.partner ? { partner: status.partner } : {}), ...(status.stacks !== undefined ? { stacks: status.stacks } : {}) });
    // Kontrol (CC) durumu (data/statuses.json > breaksTaunt, şu an Stun): taunt'ı olan birim bunu yerse taunt uygulandığı AN silinir (süre kısalsa da, 1 tur olsa da)
    if (this.statusDef(status.kind)?.breaksTaunt && target.statuses.some((s) => s.kind === 'taunt')) {
      target.statuses = target.statuses.filter((s) => s.kind !== 'taunt');
      emit({ type: 'statusEnd', target: target.uid, status: 'taunt', broken: true });
    }
  }

  // --- Dispel, kalkan kancaları, Dark Bond ---

  /**
   * Silinebilecek durumlar (dispel adayı): statuses.json'da türü `kind` (buff/debuff) olan ve `dispellable: false` olmayanlar; EN UZUN süreli önce,
   * eşitlikte önce uygulanan (dizi sırası). Özel kodlu durumlar (taunt, guard, regen) tanımsız olduğu için silinmez. Saf.
   */
  dispelCandidates(c: Combatant, kind: 'buff' | 'debuff'): Status[] {
    return c.statuses
      .map((s, i) => ({ s, i, d: this.statusDef(s.kind) }))
      .filter((x) => x.d?.type === kind && x.d.dispellable !== false)
      .sort((a, b) => b.s.turns - a.s.turns || a.i - b.i)
      .map((x) => x.s);
  }

  /** Hedefteki `kind` durumlarını siler (count yoksa hepsi); her biri için statusEnd {dispelled, source, cause}. Silinenleri döndürür. */
  private dispel(target: Combatant, kind: 'buff' | 'debuff', count: number | undefined, source: Combatant, cause: string, emit: Emit): Status[] {
    const picks = this.dispelCandidates(target, kind).slice(0, count ?? Infinity);
    for (const s of picks) {
      target.statuses = target.statuses.filter((x) => x !== s);
      emit({ type: 'statusEnd', target: target.uid, status: s.kind, dispelled: true, source: source.uid, cause });
    }
    return picks;
  }

  /** Kancalı kalkan katmanlarını havuza sığdırır (havuz kancasız bir yoldan azaldıysa: Shield Crush tüketmesi vb.); en eski katman önce kırpılır. */
  private trimShieldHooks(c: Combatant): void {
    if (!c.shieldHooks) return;
    for (const magic of [true, false]) {
      let excess = c.shieldHooks.filter((h) => h.magic === magic).reduce((t, h) => t + h.amount, 0) - (magic ? c.magicShield : c.shield);
      for (const h of c.shieldHooks) {
        if (excess <= 0) break;
        if (h.magic !== magic) continue;
        const cut = Math.min(h.amount, excess);
        h.amount -= cut;
        excess -= cut;
      }
    }
    c.shieldHooks = c.shieldHooks.filter((h) => h.amount > 0);
    if (c.shieldHooks.length === 0) delete c.shieldHooks;
  }

  /** Bir havuzdan emilen miktarı kancalı katmanlara (eskiden yeniye) yazar; kancalı katmanlar kancasız kalkandan önce tükenir. */
  private drainHooks(c: Combatant, magic: boolean, taken: number, out: Array<{ hook: ShieldHook; part: number }>): void {
    let left = taken;
    for (const h of c.shieldHooks ?? []) {
      if (left <= 0) break;
      if (h.magic !== magic) continue;
      const part = Math.min(h.amount, left);
      if (part <= 0) continue;
      h.amount -= part;
      left -= part;
      out.push({ hook: h, part });
    }
  }

  /**
   * Kalkan kancası (onAbsorb): kancalı kalkan bir skill vuruşunu emdi. madde 241: burnMana, dispelChance (RASTGELE bir buff) ve giveMana
   * (sabit MP, maks'ı aşmaz) kalkanın emdiği HER darbede. Olaylar: shieldTrigger, sonra manaBurn / statusEnd {dispelled} / mpRegen (cause = skill).
   */
  private absorbTrigger(hook: ShieldHook, bearer: Combatant, attacker: Combatant, part: number, emit: Emit): void {
    const spec = hook.onAbsorb;
    let burned = 0;
    let dispelled: Status | undefined;
    let mana = 0;
    // Madde 241 (Ömer): her şey kalkanın emdiği HER darbede (çok vuruşlu saldırı = her vuruşta)
    if (attacker.hp > 0) {
      if (spec.burnMana) burned = Math.max(0, Math.min(attacker.mp, spec.burnMana));
      if (spec.dispelChance) {
        const pool = this.dispelCandidates(attacker, 'buff');
        // zar yalnızca silinecek buff varken; silinecek buff RASTGELE biri (seed'li RNG; ikinci sayı yalnızca birden çok aday varsa)
        if (pool.length > 0 && this.rng.next() < spec.dispelChance) dispelled = pool.length === 1 ? pool[0] : pool[this.rng.int(0, pool.length - 1)];
      }
    }
    if (spec.giveMana && bearer.hp > 0 && bearer.maxMp > 0) mana = Math.max(0, Math.min(Math.round(spec.giveMana), bearer.maxMp - bearer.mp));
    if (burned <= 0 && !dispelled && mana <= 0) return;
    emit({ type: 'shieldTrigger', bearer: bearer.uid, caster: hook.caster, attacker: attacker.uid, skill: hook.skill, absorbed: part, ...(burned > 0 ? { burned } : {}), ...(dispelled ? { dispelled: dispelled.kind } : {}), ...(mana > 0 ? { mana } : {}) });
    if (burned > 0) {
      attacker.mp -= burned;
      emit({ type: 'manaBurn', source: bearer.uid, target: attacker.uid, amount: burned, mpAfter: attacker.mp, cause: hook.skill });
    }
    if (dispelled) {
      attacker.statuses = attacker.statuses.filter((s) => s !== dispelled);
      emit({ type: 'statusEnd', target: attacker.uid, status: dispelled.kind, dispelled: true, source: bearer.uid, cause: hook.skill });
    }
    if (mana > 0) {
      bearer.mp += mana;
      emit({ type: 'mpRegen', actor: bearer.uid, amount: mana, after: bearer.mp, cause: hook.skill });
    }
  }

  /** Dark Bond: `ownerUid`'nin kurduğu bağın bağlı dosttaki kopyası (yoksa undefined). */
  private bondCopy(ownerUid: string, partnerUid: string | undefined): { unit: Combatant; status: Status } | undefined {
    const unit = partnerUid ? this.get(partnerUid) : undefined;
    const status = unit?.statuses.find((s) => s.kind === 'dark_bond' && s.source === ownerUid);
    return unit && status ? { unit, status } : undefined;
  }

  /** Birimin KURDUĞU geçerli bağın bağlı dostu (uid); bağ yoksa / öbür uç kopmuşsa null. UI (bağ çizgisi) ve YZ için. */
  bondPartnerOf(uid: string): string | null {
    const c = this.get(uid);
    const own = c?.statuses.find((s) => s.kind === 'dark_bond' && s.source === uid);
    const copy = c && own ? this.bondCopy(uid, own.partner) : undefined;
    return copy && copy.unit.hp > 0 && c!.hp > 0 ? copy.unit.uid : null;
  }

  /** Birimin kurduğu bağı koparır (kendi durumu + dosttaki kopya); olay statusEnd {cause: 'bond_broken'}. */
  private breakOwnedBond(owner: Combatant, emit: Emit): void {
    const own = owner.statuses.find((s) => s.kind === 'dark_bond' && s.source === owner.uid);
    if (!own) return;
    owner.statuses = owner.statuses.filter((s) => s !== own);
    emit({ type: 'statusEnd', target: owner.uid, status: 'dark_bond', cause: 'bond_broken' });
    const copy = this.bondCopy(owner.uid, own.partner);
    if (copy) {
      copy.unit.statuses = copy.unit.statuses.filter((s) => s !== copy.status);
      emit({ type: 'statusEnd', target: copy.unit.uid, status: 'dark_bond', cause: 'bond_broken' });
    }
  }

  /** Birimin dahil olduğu TÜM bağları koparır (kurduğu bağ + kendisine kurulmuş bağlar): ölüm, debug temizliği. */
  private breakAllBonds(c: Combatant, emit: Emit): void {
    this.breakOwnedBond(c, emit);
    for (const copy of c.statuses.filter((s) => s.kind === 'dark_bond' && s.source !== c.uid)) {
      const owner = this.get(copy.source);
      if (owner && owner.statuses.some((s) => s.kind === 'dark_bond' && s.source === owner.uid && s.partner === c.uid)) this.breakOwnedBond(owner, emit);
      else if (c.statuses.includes(copy)) {
        c.statuses = c.statuses.filter((s) => s !== copy);
        emit({ type: 'statusEnd', target: c.uid, status: 'dark_bond', cause: 'bond_broken' });
      }
    }
  }

  /** Dark Bond kurar: önce kullanıcının eski bağı kopar (aynı anda tek bağ), sonra iki uca 'dark_bond' durumu (süre kullanıcının turlarıyla). */
  private formBond(owner: Combatant, partner: Combatant, turns: number, ratio: number, emit: Emit): void {
    this.breakOwnedBond(owner, emit);
    this.addStatus(owner, { kind: 'dark_bond', turns, source: owner.uid, partner: partner.uid, ratio }, emit);
    this.addStatus(partner, { kind: 'dark_bond', turns, source: owner.uid, partner: owner.uid, ratio }, emit);
  }

  /**
   * Dark Bond kopyası: `healer`'ın lifesteal kazancı (`amount`: GERÇEKTEN iyileştiği miktar; canı doluyken 0 = kopya yok, madde 241) bağlı dosta `ratio` katıyla
   * şifa olur (dostun can maks'ını aşmaz, Wound gibi alınan şifa çarpanları dostta uygulanır). Olay: heal {cause: 'dark_bond'}.
   */
  private bondEcho(healer: Combatant, amount: number, emit: Emit): void {
    if (amount <= 0) return;
    const own = healer.statuses.find((s) => s.kind === 'dark_bond' && s.source === healer.uid);
    const copy = own ? this.bondCopy(healer.uid, own.partner) : undefined;
    if (!own || !copy || copy.unit.hp <= 0 || copy.unit.hp >= copy.unit.maxHp) return;
    this.applyHeal(healer, copy.unit, Math.round(amount * (own.ratio ?? 1)), false, emit, 'dark_bond');
  }

  /**
   * Tek bir hasar vuruşu: isabet zarı (TEK zar; accuracy vs evasion; iska = 'dodge' (hedef kaçındı) ya da 'miss' (saldıran isabet ettiremedi) olayı)
   * -> zar -> kritik (SON çarpan) -> guard paylaşımı -> kalkan -> can.
   * `powerMult`: arkaya sıçrayan kısmî hasar için güç çarpanı.
   */
  private strike(actor: Combatant, target: Combatant, effect: DamageEffect, emit: Emit, powerMult: number, extras: boolean): { landed: boolean; crit?: boolean } {
    const f = this.setup.formulas;
    // Zarlar her zaman atılır (debug zorlaması rastgele sayı akışını değiştirmez); vuruş başına TEK zar üç sonuca ayrışır
    // İsabet/kaçınma: durum ekleri (Blinded/Shrouded) dahil geçerli stat'lar (effectiveStats); hit şansı [0, hit.max]
    let outcome = hitOutcome(this.effectiveStats(actor), this.effectiveStats(target), f, this.rng.next());
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
    // Garantili kritik (Backstab): kritik zarı ATILMAZ, kritik çarpanı uygulanır (debug 'never' yine kapatır; Jinxed bunu bozmaz: madde Ö5).
    // Kritik şansı durum ekleriyle (Jinxed, Omen Misfortune) geçerli değerdir (effectiveStats).
    const rolled = effect.guaranteedCrit ? { crit: true } : rollCrit(this.effectiveStats(actor), this.rng);
    const crit = this.debug.crit === 'auto' ? rolled.crit : this.debug.crit === 'always';
    const mult = crit ? actor.stats.critMult : 1;
    const total = Math.max(f.damage.minDamage, Math.round(base * mult * this.debug.damageMult));

    const guard = target.statuses.find((s) => s.kind === 'guard');
    const guardian = guard ? this.get(guard.source) : undefined;
    let hpLoss: number;
    const meta: HitMeta = { origin: 'skill', element: effect.element ?? 'physical', damageType: effect.damageType };
    if (guard && guardian && guardian !== target && guardian.hp > 0) {
      const redirected = Math.round(total * (guard.share ?? 0.5));
      hpLoss = this.applyHit(actor, target, total - redirected, effect.damageType, crit, emit, false, meta);
      if (redirected > 0) this.applyHit(actor, guardian, redirected, effect.damageType, crit, emit, true, meta);
    } else {
      hpLoss = this.applyHit(actor, target, total, effect.damageType, crit, emit, false, meta);
    }

    // Rage: isabet eden hasar vuruşu, vurulan hasarın hedefin maks canına yüzdesine göre kazanç (hedef başına toplanır; formulas.json > rage)
    if (this.rageTally && actor.maxRage !== undefined) {
      const r = f.rage;
      const gain = Math.min(r.perHitCap, r.hitBase + r.perHpPercent * ((total / Math.max(1, target.maxHp)) * 100));
      this.rageTally.set(target.uid, (this.rageTally.get(target.uid) ?? 0) + gain);
    }
    if (effect.lifesteal && actor.hp > 0) {
      // Madde 241: canı doluyken can çalınmaz; Dark Bond kopyası yalnızca GERÇEKTEN iyileşen miktar
      const healed = this.applyHeal(actor, actor, Math.round(hpLoss * effect.lifesteal), false, emit);
      this.bondEcho(actor, healed, emit);
    }
    // Pasif: Soul Drain, verilen her hasarın bir kısmı kullanıcıya şifa
    // (çağrılanların verdiği hasardan da sahibi faydalanır)
    const drainer = actor.passive?.effect.type === 'soulDrain' ? actor : actor.owner ? this.get(actor.owner) : undefined;
    const drain = drainer?.passive?.effect;
    if (drainer && drain?.type === 'soulDrain' && drainer.hp > 0 && hpLoss > 0) {
      const healed = this.applyHeal(drainer, drainer, Math.max(1, Math.round(hpLoss * drain.ratio)), false, emit);
      this.bondEcho(drainer, healed, emit);
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
    return { landed: true, crit };
  }

  /** Hasarı kalkana (büyüyse önce büyü kalkanına) ve cana uygular; canı düşüren miktarı döndürür. */
  private applyHit(actor: Combatant, target: Combatant, amount: number, type: 'physical' | 'magic', crit: boolean, emit: Emit, redirected: boolean, meta: HitMeta): number {
    let rest = amount;
    let absorbed = 0;
    let pendingBreak = false;
    // Kancalı kalkanlar (onAbsorb): emilen miktar önce kancalı katmanlara yazılır; tetikler hasar olayından SONRA işlenir
    this.trimShieldHooks(target);
    const hooked: Array<{ hook: ShieldHook; part: number }> = [];
    if (type === 'magic') {
      const a = Math.min(target.magicShield, rest);
      target.magicShield -= a;
      rest -= a;
      absorbed += a;
      this.drainHooks(target, true, a, hooked);
    }
    const b = Math.min(target.shield, rest);
    target.shield -= b;
    rest -= b;
    absorbed += b;
    this.drainHooks(target, false, b, hooked);
    if (hooked.length > 0) this.trimShieldHooks(target);
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
      origin: meta.origin,
      ...(meta.element ? { element: meta.element } : {}),
      ...(meta.damageType ? { damageType: meta.damageType } : {}),
      ...(meta.ground ? { ground: meta.ground, groundId: meta.groundId } : {}),
      ...(meta.status ? { status: meta.status } : {}),
    });
    if (luckySaved) emit({ type: 'passive', actor: target.uid, passive: 'primary_luck', name: 'Lucky Escape' });
    if (pendingBreak) emit({ type: 'statusEnd', target: target.uid, status: 'taunt', broken: true });
    // Kalkan kancaları yalnızca DOĞRUDAN bir saldırganın skill vuruşunda (yer etkisi tiki / kendine hasar tetiklemez)
    if (meta.origin === 'skill' && actor.side !== target.side) for (const { hook, part } of hooked) this.absorbTrigger(hook, target, actor, part, emit);
    return rest;
  }

  /** `doomed`: birim Doom ile öldüyse tüketilen yığın (Ill Omen yalnızca onDoomKill kadar geçirir). */
  private announceIfDead(c: Combatant, emit: Emit, doomed?: Status): void {
    if (c.hp > 0 || this.announcedDead.has(c.uid) || c.lifespan === 0) return;
    this.announcedDead.add(c.uid);
    // Çağrı olmayan birim yuvasında ceset bırakır (revivable); çağrının ölümü (sahibiyle birlikte ölmesi dahil) ceset bırakmaz
    const corpse = this.leaveCorpse(c);
    emit({ type: 'death', target: c.uid, corpse });
    // Dark Bond: ölen birimin kurduğu ya da taşıdığı bağ kopar
    this.breakAllBonds(c, emit);
    // Ill Omen (Hexer pasifi): ölenin Omen'leri en yakın canlı dostuna geçer
    this.illOmen(c, emit, doomed);
    // Çağıran ölünce çağırdıkları da ölür
    for (const s of this.combatants) {
      if (s.owner === c.uid && s.hp > 0) {
        s.hp = 0;
        this.announceIfDead(s, emit);
      }
    }
  }

  /** Şifa uygular; GERÇEKTEN iyileşen miktarı döndürür (can maks'ı ve alınan şifa çarpanları sonrası). */
  private applyHeal(source: Combatant, target: Combatant, wantedRaw: number, crit: boolean, emit: Emit, cause?: string): number {
    const wanted = Math.round(wantedRaw * this.statusMult(target, 'healTakenMult')); // Wound gibi durumlar alınan şifayı azaltır
    const amount = Math.max(0, Math.min(wanted, target.maxHp - target.hp));
    if (amount === 0 && (source === target || wanted === 0)) return 0; // boş şifa olayı üretme
    target.hp += amount;
    emit({ type: 'heal', source: source.uid, target: target.uid, amount, hpAfter: target.hp, crit, ...(cause ? { cause } : {}) });
    return amount;
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
    delete c.shieldHooks;
    this.record({ type: 'resource', actor: c.uid, resource: 'hp', amount: 0, after: 0 });
    this.announceIfDead(c, this.debugEmit);
    if (allowEnd) this.checkWinner();
    return { ok: true, events: [] };
  }

  /** Debug: düşmüş (çağrı olmayan) birimi, hücresi boşsa, maks canının `ratio` kadarıyla diriltir (debug aracı: tüketilmiş cesedi de diriltir; ceset kaydı silinir). */
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
    delete c.shieldHooks;
    c.statuses = [];
    c.turnCounter = 0;
    if (c.maxRage !== undefined) c.rage = 0;
    this.announcedDead.delete(c.uid);
    this.clearCorpse(c.uid);
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
    const def = this.statusDef(kind);
    if (!def) return { ok: false, reason: 'Unknown status' };
    // Yığılan durum (Omen): her eklemede +1 yığın (snapshot = taşıyanın kendi statı; kaynağı Hexer değil, Ill Omen çalışmaz); 3'te Doom
    if (def.maxStacks) this.addStacks(c, kind as Status['kind'], 1, c, this.debugEmit, false, true);
    else this.addStatus(c, { kind: kind as Status['kind'], turns: Math.max(1, Math.round(turns)), source: c.uid, ...(def.dot ? { amount: 1 } : {}) }, this.debugEmit);
    return { ok: true, events: [] };
  }

  /** Debug: birimin tüm durumlarını ve kalkanlarını temizler. */
  debugClearStatuses(uid: string): void {
    const c = this.get(uid);
    if (!c) return;
    this.breakAllBonds(c, this.debugEmit); // bağın öbür ucunda sahipsiz kopya kalmasın
    c.statuses = [];
    c.shield = 0;
    c.magicShield = 0;
    delete c.shieldHooks;
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
    ...(c.shieldHooks ? { shieldHooks: c.shieldHooks.map((h) => ({ ...h, onAbsorb: { ...h.onAbsorb } })) } : {}),
  };
}
