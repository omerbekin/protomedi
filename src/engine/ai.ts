import { tileUid, type Battle } from './battle';
import { shapeLabel } from './area-shape';
import { betStake } from './gamble';
import { previewForTargets } from './preview';
import { armorReduction, attributePower, hitChance } from './stats';
import type { Combatant, CorpseChoice, Side, SkillAiCond, SkillDef } from './types';

/**
 * Yapay zeka: sırası gelen aktör için bir skill ve hedef seçer. Saf ve belirleyici:
 * rastgelelik kullanmaz, motorun RNG'sine dokunmaz; aynı durum = aynı karar.
 * Öncelikler ve eşikler data/ai.json profillerinden gelir (karakterin `ai` alanı profil seçer).
 * Etki tahmini önizlemeyle aynı hesaptır (src/engine/preview.ts): zırh, menzil, taunt, kalkan hepsi hesaba girer.
 */
export type AiPriority = 'kill' | 'heal' | 'tactic' | 'summon' | 'shield' | 'aoe' | 'damage' | 'taunt' | 'guard' | 'burn';

export interface AiProfile {
  priorities: AiPriority[];
  focus: 'lowest_hp' | 'lowest_ratio';
  aoeMinTargets: number;
  healBelowRatio: number;
  shieldBelowRatio: number;
  maxSummons: number;
  mpCostWeight: number;
  hpCostWeight: number;
  minHpRatioForHpCost: number;
  /** guard: canı bu orandan düşük, korumasız dostu koru. */
  guardBelowRatio?: number;
  /** burn: en az bu kadar düşmanın yakılabilir manası varsa toplu mana yak. */
  burnMinTargets?: number;
  /**
   * summon (ceset tüketen çağrı, Raise Dead): tüketilecek düşman cesedi YOKSA çağrı beslenmemiş (unfed) gelir; o zaman yalnızca çağrının tahmini değeri
   * (birimin en iyi ham hasarı x ömür x summonValueShare) bu turun en iyi başka hamlesinin değerinden (değer - bedel) büyük ya da eşitse çağrılır.
   * Ceset varsa (beslenmiş) eski kural: en ucuz çağrı. Varsayılan 0,5.
   */
  summonValueShare?: number;
}

/**
 * Global skill (Rest / Skip Turn / Move Tile) kuralları (data/ai.json > global). Hepsi taktik DEĞER hesabına bağlıdır (skill değeri = beklenen hasar/şifa/kalkan - bedel;
 * 'şimdiki hamle' = yapay zekanın global olmadan seçeceği hamle). Çağrılan birimler global skill kullanmaz; öldürücü/işlevsel (şifa, çağrı, kalkan, taunt...) hamleler her zaman önce gelir.
 */
export interface AiGlobalConfig {
  enabled: boolean;
  rest: {
    /** Rest, MP oranı bu değerin altındayken ve skill şu an MP yüzünden yapılamıyorken (senaryo A) düşünülür. */
    mpBelowRatio: number;
    /** Cooldown'daki skill'e MP biriktirmek (senaryo B): skill en geç bu kadar kendi turu sonra hazır olmalı. */
    lookaheadTurns: number;
    /** Ertelenen güçlü skill'in değeri bu oranla çarpılır (bekleme bedeli). */
    futureValueShare: number;
    /** Rest'in net kazancı (ertelenen skill - şimdiki hamle), ertelenen skill değerinin en az bu payı olmalı. */
    minGainShare: number;
    /** Tehlike: can oranı bu değerin altında VE düşmanın bir turda vuracağı beklenen hasar canın dangerIncomingShare katından fazla ise Rest/Skip denenmez. */
    dangerHpRatio: number;
    dangerIncomingShare: number;
  };
  skip: {
    /**
     * Skip (sonraki tur %100 hızla yarı sürede gelir; birim hemen tekrar oynamaz): yapacak değerli hamle yokken ya da şimdiki hamlenin değeri,
     * 1 tur sonra hazır olacak skill'in değerinin bu payından azsa. Başka durumda seçilmez ('bedava zaman' yok: bir tur kaybedilir).
     */
    worthlessShare: number;
  };
  move: {
    /** Geri çekilme: engellenen yakın dövüş hasarı, birimin canının en az bu payı olmalı. */
    minAvoidShare: number;
    /** Menzilli/kırılgan birimin hamlesini kaybetmenin bedeli (şimdiki hamle değerinin payı); yakın dövüşçüde meleeOpportunityShare. */
    opportunityShare: number;
    meleeOpportunityShare: number;
    /** Yakın dövüşçü/Defender bu can oranının altındaysa geri çekilebilir (üstündeyse ileri atılır, geri değil). */
    retreatHpRatio: number;
    /** Öne geçme: kazanılan yakın dövüş değeri (potansiyel - şimdiki), potansiyelin en az bu payı olmalı. */
    minFrontGainShare: number;
    /** Aura komşuluğu: kazanılan beklenen hasar azalması (can-eşdeğer) en az bu kadar olmalı. */
    minAuraGain: number;
  };
}

export interface AiConfig {
  defaultProfile: string;
  profiles: Record<string, AiProfile>;
  /** Global skill kuralları; yoksa ya da enabled false ise yapay zeka hiç global skill kullanmaz. */
  global?: AiGlobalConfig;
}

export interface AiChoice {
  /** Class skill'i ya da global skill id'si (rest / skip_turn / move_tile). */
  skillId: string;
  /** Tek hedefli skill'lerde hedef; çoklu/kendine skill'lerde tanımsız. */
  targetUid?: string;
  /** move_tile: gidilecek boş yuva (targetUid de aynı yuvayı `tile:<yuva>` olarak taşır: yalnızca targetUid geçiren eski kod yolları için). Alan skill'inde anchor hücre. */
  slot?: number;
  /** area_any alan skill'inde anchor hücrenin tahtası (kendi ya da karşı taraf). */
  board?: Side;
  /** Ceset tüketen çağrı (Raise Dead): tüketilecek düşman cesedi (en tehlikeli; battle.corpseChoices). Çağrıda `slot` çağrı yuvasıdır. */
  corpseUid?: string;
  /** Hangi öncelik bu kararı verdirdi ('fallback': hiçbiri uymadı, en değerlisi seçildi; rest/skip/move: global skill kuralı). */
  reason: AiPriority | 'fallback' | 'rest' | 'skip' | 'move';
}

/**
 * Karar izi (isteğe bağlı, salt yazılır): chooseAction'a verilirse seçimin gerekçesi buraya yazılır. İz seçimi ASLA etkilemez:
 * yalnızca yapılan hesapların sonuçları kopyalanır (aynı durum + iz var/yok = aynı karar; tests/match-log.test.ts kilitler).
 */
export interface AiTrace {
  options: Option[];
  reserves: Reserve[];
  /** Öncelik sırası boyunca denenen seçiciler (ilk uyan seçimi verir; sonra durulur). */
  steps: Array<{ priority: AiPriority | 'fallback'; option?: Option }>;
  /** Global skill'ler olmadan class seçimi (null: hiçbir şey seçilemedi). */
  classPick?: { option: Option; reason: AiChoice['reason'] } | null;
  global?: GlobalTrace;
}

export interface GlobalTrace {
  enabled: boolean;
  /** Global skill kararına hiç girilmediyse nedeni. */
  gate?: string;
  /** Şimdiki class hamlesinin net değeri ve ödeyeceği MP. */
  vNow?: number;
  spend?: number;
  danger?: { active: boolean; hpRatio: number; incoming: number; hp: number };
  move?: { slot: number; net: number } | null;
  moveBlocked?: string;
  restGain?: number;
  restBlocked?: string;
  skipChecks?: Array<{ skill: string; futureValue: number; nowValue: number; needBelow: number; hit: boolean }>;
  skipNote?: string;
  outcome?: string;
}

export interface Option {
  skill: SkillDef;
  targetUid?: string;
  /** Şekil skill'inde seçilen anchor hücre (boş hücre de olabilir) ve şeklin kapsadığı tüm hücreler. */
  anchorSlot?: number;
  cells?: number[];
  /** area_any (Smoke Bomb) seçeneğinde alanın atıldığı tahta (diğer alan skill'lerinde tanımsız: karşı tahta). */
  board?: Side;
  /**
   * İsabet/kaçınma durumlarının (Blinded/Shrouded) koruma değeri (can-eşdeğer): kör edilen düşmanın vuracağı beklenen hasardaki azalma ya da örtülen
   * dostun yiyeceği beklenen hasardaki azalma, kalan tur sayısıyla (statusMitigation). value() içine girer.
   */
  mitigation: number;
  targets: Combatant[];
  /** Hedeflerin canı/kalkanıyla sınırlı toplam beklenen hasar (fazla vuruş sayılmaz); arkaya sıçrayan dahil. */
  damage: number;
  kills: Combatant[];
  heal: number;
  selfHeal: number;
  shield: number;
  /** Yakılacak toplam mana ve mana yakılan hedef sayısı. */
  burn: number;
  burnTargets: number;
  /** Düşmüş bir dostu diriltir mi (diriltilen birimin maks canı değer sayılır). */
  revive: number;
  /** Mana yakmanın değeri: yakılan mana, hedefin mana havuzuyla (büyücüler) ağırlıklanır. */
  burnScore: number;
  /** Ana hedef (tek hedefli skill'lerde seçilen düşman, alan skill'lerinde merkez/ilk hedef) ve ona beklenen ortalama hasar. */
  primary?: Combatant;
  primaryAvg: number;
  /** Ana hedefe isabet şansı (hasar veriyorsa; yoksa 0). */
  primaryHit: number;
  /** bonusPerMissingMana: ana hedefe eksik mana ekinin ham hasar içindeki payı (0-1). */
  missingManaShare: number;
  /** Saf self-buff skill'i (yalnızca kendine durum + kendine hasar): net değeri (can-eşdeğer; savunma + hasar artışı - bedel - kaçırılan hamle). */
  pureBuff: boolean;
  buff: number;
  /** Skill'in `ai` bağlam ipucu sağlanmıyor: bu seçenek yalnızca öldürücü vuruşta (ya da hiçbir şey uymazsa son çare olarak) seçilir. */
  blocked: boolean;
  summon: boolean;
  /** Ceset tüketen çağrı: true = şu an ceset var (beslenmiş/empowered), false = ceset yok (beslenmemiş/unfed); diğer seçeneklerde tanımsız. */
  empowered?: boolean;
  /** Çağrının tahmini değeri (can-eşdeğer): çağrılacak birimin (varyantı uygulanmış) en iyi ham skill hasarı x ömür x summonValueShare; çağrı değilse 0. */
  summonValue: number;
  /** Çağrı seçeneğinde: çağrının yuvası (battle.summonSlotFor) ve (ceset tüketen çağrıda) tüketilecek ceset + tüm ceset adayları (tehlike puanlarıyla). */
  summonSlot?: number;
  corpseUid?: string;
  corpseOptions?: CorpseChoice[];
  taunt: boolean;
  guard: boolean;
  cost: number;
  hpCost: boolean;
}

const ratio = (c: Combatant) => c.hp / c.maxHp;
const threat = (c: Combatant) => Math.max(c.stats.str, c.stats.int, c.stats.dex) + c.stats.spd;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const BURN_WEIGHT = 0.6;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Kararlı sıralama: eşitlikte seçenek sırası (skill sırası, hedef sırası) korunur. */
const best = <T>(items: T[], score: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((top, item) => (top === undefined || score(item) > score(top) ? item : top), undefined);

export function chooseAction(battle: Battle, actorUid: string, config: AiConfig, trace?: AiTrace): AiChoice | null {
  // hitLoss önbelleği yalnızca bu karar boyunca yaşar (durum değişmez); iç içe çağrıda dıştaki korunur
  const outer = hitLossCache;
  hitLossCache = outer ?? new Map();
  try {
    return chooseActionInner(battle, actorUid, config, trace);
  } finally {
    hitLossCache = outer;
  }
}

/** statusMitigation hesabında tekrar eden (saldıran, kurban, ek) sonuçları: tek bir chooseAction çağrısı süresince (saf; seçimi değiştirmez). */
let hitLossCache: Map<string, number> | null = null;

function chooseActionInner(battle: Battle, actorUid: string, config: AiConfig, trace?: AiTrace): AiChoice | null {
  const actor = battle.get(actorUid);
  if (!actor || actor.hp <= 0) return null;
  const profile = config.profiles[actor.ai ?? config.defaultProfile] ?? config.profiles[config.defaultProfile];
  if (!profile) return null;

  const options = buildOptions(battle, actor, profile, trace);
  const pick = options.length === 0 ? null : pickClassOption(battle, actor, profile, options, trace);
  if (trace) {
    trace.options = options;
    trace.classPick = pick;
  }
  const g = config.global;
  if (g?.enabled && !actor.summoned && battle.globalSkillIds().length > 0) {
    const gt: GlobalTrace | undefined = trace ? { enabled: true } : undefined;
    if (trace) trace.global = gt;
    const choice = chooseGlobal(battle, actor, profile, g, pick, gt);
    if (choice) return choice;
  } else if (trace) {
    trace.global = { enabled: false, gate: !g?.enabled ? 'global skills disabled in ai.json' : actor.summoned ? 'summoned units cannot use global skills' : 'no global skills' };
  }
  return pick ? toChoice(pick.option, pick.reason) : null;
}

/** Class skill'leri arasından (global skill'ler olmadan) seçim: öncelik sırası, sonra değer katan en iyi seçenek; hiçbiri yoksa null. */
function pickClassOption(battle: Battle, actor: Combatant, profile: AiProfile, options: Option[], trace?: AiTrace): { option: Option; reason: AiChoice['reason'] } | null {
  // Bağlam ipucu (skill.ai) sağlanmayan seçenekler yalnızca öldürücü vuruşta (kill önceliği) aday olur
  const open = options.filter((o) => !o.blocked);

  for (const priority of profile.priorities) {
    const pick = PICKERS[priority](battle, actor, profile, priority === 'kill' ? options : open);
    trace?.steps.push({ priority, ...(pick ? { option: pick } : {}) });
    if (pick) return { option: pick, reason: priority };
  }
  // Hiçbir öncelik uymadıysa: değer katan en iyi seçenek; hiçbiri değer katmıyorsa pas geç.
  // Bağlamı sağlanmayan seçenekler en son çare: başka hiçbir şey yapılamıyorsa pas geçmektense onlardan biri oynanır.
  const pool = (list: Option[]) => best(list.filter((o) => value(o) > 0), (o) => value(o) - o.cost);
  const fallback = pool(open) ?? pool(options);
  trace?.steps.push({ priority: 'fallback', ...(fallback ? { option: fallback } : {}) });
  return fallback ? { option: fallback, reason: 'fallback' } : null;
}

function toChoice(option: Option, reason: AiChoice['reason']): AiChoice {
  return {
    skillId: option.skill.id,
    ...(option.targetUid ? { targetUid: option.targetUid } : {}),
    ...(option.anchorSlot !== undefined ? { slot: option.anchorSlot } : option.summonSlot !== undefined ? { slot: option.summonSlot } : {}),
    ...(option.board ? { board: option.board } : {}),
    ...(option.corpseUid ? { corpseUid: option.corpseUid } : {}),
    reason,
  };
}

const value = (o: Option) => o.damage + o.heal + o.selfHeal + o.shield * 0.5 + o.burn * BURN_WEIGHT + Math.max(0, o.buff) + o.mitigation;

function buildOptions(battle: Battle, actor: Combatant, profile: AiProfile, trace?: AiTrace): Option[] {
  const options: Option[] = [];
  for (const skillId of actor.skills) {
    if (!battle.canUse(actor.uid, skillId).ok) continue;
    options.push(...skillOptions(battle, actor, skillId, profile));
  }
  // İkinci geçiş: saf self-buff'ların net değeri (diğer seçeneklerin değeri bilinmeli) ve skill'in bağlam ipucu
  const attackScore = (o: Option) => value(o) - o.cost;
  const attacks = options.filter((x) => !x.pureBuff);
  for (const o of options) {
    if (!o.pureBuff) continue;
    const alt = Math.max(0, ...attacks.map(attackScore));
    const free = attacks.filter((x) => x.skill.cost.amount === 0).map((x) => x.damage);
    const basic = free.length > 0 ? Math.max(...free) : Math.max(0, ...attacks.map((x) => x.damage));
    o.buff = buffValue(battle, actor, o, alt, basic, profile);
  }
  const reserve = reservedMp(battle, actor, profile);
  if (trace) trace.reserves = reserve;
  for (const o of options) o.blocked = !hintHolds(battle, actor, o) || spendsReserve(actor, o, reserve);
  return options;
}

/**
 * MP ayırma: `reserveMp: N` ipuçlu bir skill (ör. Aimed Shot, Meteor) hazırsa ya da en geç N tur sonra hazır olacaksa, bağlamı
 * şu an mevcutsa (ipucu sağlanıyorsa) ve o zamana kadar yenilenmeyle MP'si ona yetebilecekse, onu yetersiz bırakacak SALDIRI harcamaları ertelenir. Şifa, kalkan, çağrı gibi
 * işlevsel skill'ler ve öldürücü vuruş (kill önceliği) etkilenmez. Skill'in gereken MP'si: bedeli ve (varsa) minSelfMpRatio x en yüksek MP.
 */
export interface Reserve {
  /** Ayrılan skill'in id'si (yalnızca açıklama için). */
  skill: string;
  need: number;
  /** Hazır olmasına kalan tur (0 = hazır, 1..N). */
  turns: number;
}

function reservedMp(battle: Battle, actor: Combatant, profile: AiProfile): Reserve[] {
  if (battle.mode !== 'turns') return [];
  const out: Reserve[] = [];
  for (const id of actor.skills) {
    const sk = battle.skill(id);
    const turns = actor.cooldowns[id] ?? 0;
    if (!sk?.ai?.reserveMp || sk.cost.resource !== 'mp' || turns > sk.ai.reserveMp) continue;
    const need = Math.max(sk.cost.amount, Math.ceil((sk.ai.requires?.minSelfMpRatio ?? 0) * actor.maxMp));
    if (actor.mp + actor.stats.mpRegen * turns < need) continue;
    // Yalnızca bağlam şu an var olan (skill şimdi kullanılabilir olsa seçilebilecek) durumda ayır: bağlam yokken MP boşuna bekletilmez
    if (skillOptions(battle, actor, id, profile).some((o) => hintHolds(battle, actor, o))) out.push({ skill: id, need, turns });
  }
  return out;
}

function spendsReserve(actor: Combatant, o: Option, reserves: Reserve[]): boolean {
  const pureAttack = o.damage > 0 && o.heal === 0 && o.shield === 0 && o.burn === 0 && !o.summon && !o.taunt && !o.guard;
  if (reserves.length === 0 || o.skill.ai || !pureAttack || o.skill.cost.resource !== 'mp' || o.skill.cost.amount <= 0) return false;
  return reserves.some((r) => actor.mp - o.skill.cost.amount + actor.stats.mpRegen * r.turns < r.need);
}

/** Bir skill'in tüm (hedef/alan) seçenekleri. Bekleme ve MP denetimi YAPMAZ (çağıran denetler). */
function skillOptions(battle: Battle, actor: Combatant, skillId: string, profile: AiProfile): Option[] {
  const skill = battle.skill(skillId)!;
  const candidates = battle.validTargets(actor.uid, skillId);
  if (candidates.length === 0) return [];
  if (battle.isAreaSkill(skillId)) {
    // Alan (şekil) skill'i: her seçilebilir anchor hücre (boş hücre dahil) bir aday; aynı hücre kümesini veren anchor'lar tek aday (en küçük yuva).
    // Aşamalı skill de aynı: değerlendirme toplam hasar / hedef sayısı üzerinden (aşama sırası sonucu değiştirmez; falloff sırası gerçek vuruşla aynı).
    // area_any (Smoke Bomb): her iki tahtanın anchor'ları ayrı aday (tahta anahtarın parçası).
    const out: Option[] = [];
    const seen = new Set<string>();
    const anyBoard = battle.isAnyBoardArea(skillId);
    for (const { board, slot } of battle.shapeAnchorCells(actor.uid, skillId)) {
      const cells = battle.areaCells(skillId, slot, board);
      const key = `${board}:${cells.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const targets = battle.areaWindowAt(actor.uid, skillId, slot, board);
      const occupant = battle.combatants.find((c) => c.hp > 0 && c.board === board && c.slot === slot);
      // X şekli: anchor'daki birim hitsAtCenter kez vurulur (önizleme/değer buna göre)
      const center = targets.find((c) => c.board === board && c.slot === slot);
      const o = evaluate(battle, actor, skill, targets, occupant?.uid, profile, board === foeSide(actor) ? cells : undefined, center?.uid);
      o.anchorSlot = slot;
      o.cells = cells;
      if (anyBoard) o.board = board;
      out.push(o);
    }
    return out;
  }
  // Yan vuruşlu (splash) tek hedef skill'inde grup = seçilen hedef + yanındakiler (ilk eleman seçilen hedeftir)
  const groups = battle.needsTargetChoice(skillId) ? candidates.map((t) => [t, ...battle.splashTargets(skillId, t)]) : [candidates];
  return groups.map((targets) => evaluate(battle, actor, skill, targets, battle.needsTargetChoice(skillId) ? targets[0]!.uid : undefined, profile));
}

const foeSide = (actor: Combatant) => (actor.side === 'party' ? 'enemy' : 'party');

/** Saf self-buff skill'i mi: yalnızca kendine durum ve kendine hasar etkileri var (Abyssal Cry gibi). */
function isPureBuff(skill: SkillDef): boolean {
  return skill.target === 'self' && skill.effects.some((e) => e.type === 'status' && e.self) && skill.effects.every((e) => (e.type === 'status' && e.self) || e.type === 'selfDamage');
}

/** Skill'in kullanıcıya vereceği can kaybı (can bedeli + kendine hasar); canı en az 1 bırakır. */
function selfHpCost(actor: Combatant, skill: SkillDef): number {
  const hpCost = skill.cost.resource === 'hp' ? skill.cost.amount : 0;
  const self = sum(skill.effects.map((e) => (e.type === 'selfDamage' ? e.ratio * actor.maxHp : 0)));
  return Math.max(0, Math.min(actor.hp - 1, hpCost + self));
}

/**
 * Düşman takımının, kullanıcıya TEK bir tur dolusu vurabileceği beklenen toplam hasar: her düşman, kullanabileceği
 * (MP'si yeten) en çok hasar veren skill'iyle (isabet şansı, zırh ve durum çarpanı dahil; önizleme formülü).
 */
function incomingDamage(battle: Battle, actor: Combatant): number {
  const attacking = ['single_enemy', 'area_enemies', 'all_enemies', 'random_enemies', 'everyone'];
  let total = 0;
  for (const foe of battle.living(foeSide(actor))) {
    let top = 0;
    for (const id of foe.skills) {
      const sk = battle.skill(id);
      if (!sk || !attacking.includes(sk.target)) continue;
      if (sk.cost.resource === 'mp' && foe.mp < sk.cost.amount) continue;
      if (sk.cost.resource === 'rage' && (foe.rage ?? 0) < sk.cost.amount) continue;
      const d = previewForTargets(battle, foe, id, [actor]).find((p) => p.uid === actor.uid)?.damage;
      if (d) top = Math.max(top, d.avg * d.hitChance);
    }
    total += top;
  }
  return total;
}

/**
 * Saf self-buff'ın net değeri (can-eşdeğer): savunma (alınan hasarı azaltan durum x düşmanın bana vuracak payı x süre)
 * + hasar artışı (Berserker gibi eksik cana bağlı pasif: kendine hasarla artan bonus x temel saldırı x süre)
 * - can bedeli - bu tur başka bir saldırı yapmamanın bedeli (alt x opportunityShare). Aynı durum zaten üzerindeyse değeri 0'dır.
 */
function buffValue(battle: Battle, actor: Combatant, o: Option, alt: number, basicDamage: number, profile: AiProfile): number {
  const own = o.skill.effects.filter((e): e is Extract<typeof e, { type: 'status' }> => e.type === 'status' && !!e.self);
  if (own.some((e) => actor.statuses.some((s) => s.kind === e.status && s.turns > 0))) return 0; // zaten aktif: yığılmaz
  const hint = o.skill.ai;
  const turns = Math.max(0, ...own.map((e) => e.turns));
  let mitigation = 0;
  for (const e of own) mitigation = Math.max(mitigation, 1 - (battle.statusDef(e.status)?.damageTakenMult ?? 1));
  const defend = mitigation > 0 ? mitigation * incomingDamage(battle, actor) * (hint?.incomingShare ?? 0.4) * turns : 0;
  const pe = actor.passive?.effect;
  const rage = pe?.type === 'rage' ? pe.maxBonus : 0;
  const lost = selfHpCost(actor, o.skill);
  const offense = rage * (actor.maxHp > 0 ? lost / actor.maxHp : 0) * basicDamage * turns;
  return defend + offense - lost * profile.hpCostWeight - alt * (hint?.opportunityShare ?? 0.5);
}

/**
 * Bağlam koşulu (SkillAiCond) bu seçenek için sağlanıyor mu? Tanımlı tüm alanlar birlikte sağlanmalı.
 * condFailure: sağlanmayan İLK koşulun adı (sağlanıyorsa null). detail=true ise değerleri de yazar (yalnızca açıklama için; seçimi etkilemez).
 */
function condHolds(cond: SkillAiCond, battle: Battle, actor: Combatant, o: Option, mpOverride?: number): boolean {
  return condFailure(cond, battle, actor, o, mpOverride, false) === null;
}

function condFailure(cond: SkillAiCond, battle: Battle, actor: Combatant, o: Option, mpOverride: number | undefined, detail: boolean): string | null {
  const foes = battle.living(foeSide(actor));
  const allies = battle.living(actor.side);
  const enemyHits = o.targets.filter((t) => t.side !== actor.side).length;
  const primary = o.primary && o.primary.side !== actor.side ? o.primary : undefined;
  if (cond.kill && o.kills.length === 0) return detail ? 'kill (option kills nobody)' : '';
  if (cond.minTargets !== undefined && enemyHits < cond.minTargets) return detail ? `minTargets ${cond.minTargets} (hits ${enemyHits})` : '';
  if (cond.minLivingEnemies !== undefined && foes.length < cond.minLivingEnemies) return detail ? `minLivingEnemies ${cond.minLivingEnemies} (have ${foes.length})` : '';
  if (cond.minLivingAllies !== undefined && allies.length < cond.minLivingAllies) return detail ? `minLivingAllies ${cond.minLivingAllies} (have ${allies.length})` : '';
  if (cond.minSelfHpRatio !== undefined && ratio(actor) < cond.minSelfHpRatio) return detail ? `minSelfHpRatio ${cond.minSelfHpRatio} (hp ${r2(ratio(actor))})` : '';
  if (cond.minSelfHpRatioAfter !== undefined && (actor.hp - selfHpCost(actor, o.skill)) / actor.maxHp < cond.minSelfHpRatioAfter) return detail ? `minSelfHpRatioAfter ${cond.minSelfHpRatioAfter} (after cost ${r2((actor.hp - selfHpCost(actor, o.skill)) / actor.maxHp)})` : '';
  if (cond.minSelfMpRatio !== undefined && (actor.maxMp <= 0 || (mpOverride ?? actor.mp) / actor.maxMp < cond.minSelfMpRatio)) return detail ? `minSelfMpRatio ${cond.minSelfMpRatio} (mp ${r2((mpOverride ?? actor.mp) / Math.max(1, actor.maxMp))})` : '';
  if (cond.minSelfRage !== undefined && (actor.rage ?? 0) < cond.minSelfRage) return detail ? `minSelfRage ${cond.minSelfRage} (rage ${actor.rage ?? 0})` : '';
  if (cond.minBattleTurns !== undefined && battle.turnsTaken < cond.minBattleTurns) return detail ? `minBattleTurns ${cond.minBattleTurns} (turn ${battle.turnsTaken})` : '';
  if (cond.minWoundedAllies !== undefined && allies.filter((c) => ratio(c) < (cond.woundedBelowRatio ?? 0.7)).length < cond.minWoundedAllies) return detail ? `minWoundedAllies ${cond.minWoundedAllies} below ${cond.woundedBelowRatio ?? 0.7} (have ${allies.filter((c) => ratio(c) < (cond.woundedBelowRatio ?? 0.7)).length})` : '';
  if (cond.minTargetArmorReduction !== undefined && (!primary || armorReduction(battle.effectiveStats(primary).armor, battle.formulas) < cond.minTargetArmorReduction)) return detail ? `minTargetArmorReduction ${cond.minTargetArmorReduction} (target ${primary ? r2(armorReduction(battle.effectiveStats(primary).armor, battle.formulas)) : 'none'})` : '';
  if (cond.minTargetHpToDamage !== undefined && (!primary || o.primaryAvg <= 0 || (primary.hp + primary.shield + primary.magicShield) / o.primaryAvg < cond.minTargetHpToDamage)) return detail ? `minTargetHpToDamage ${cond.minTargetHpToDamage} (target ${primary && o.primaryAvg > 0 ? r2((primary.hp + primary.shield + primary.magicShield) / o.primaryAvg) : 'n/a'})` : '';
  if (cond.minMissingManaShare !== undefined && o.missingManaShare < cond.minMissingManaShare) return detail ? `minMissingManaShare ${cond.minMissingManaShare} (have ${r2(o.missingManaShare)})` : '';
  const allyHits = o.targets.filter((t) => t.side === actor.side).length;
  if (cond.minAllyTargets !== undefined && allyHits < cond.minAllyTargets) return detail ? `minAllyTargets ${cond.minAllyTargets} (covers ${allyHits})` : '';
  const share = primary && primary.maxHp > 0 ? (o.primaryAvg * o.primaryHit) / primary.maxHp : 0;
  if (cond.minTargetMaxHpShare !== undefined && share < cond.minTargetMaxHpShare) return detail ? `minTargetMaxHpShare ${cond.minTargetMaxHpShare} (expected ${r2(share)} of max HP)` : '';
  if (cond.targetBehindFront && (!primary || battle.rowRank(primary.uid) < battle.formulas.formation.meleeRows)) return detail ? `targetBehindFront (target ${primary ? `row rank ${battle.rowRank(primary.uid)}` : 'none'} is within normal melee reach)` : '';
  return null;
}

/** Skill'in `ai` ipucu bu durumda sağlanıyor mu (ipucu yoksa her zaman)? */
function hintHolds(battle: Battle, actor: Combatant, o: Option, mpOverride?: number): boolean {
  const hint = o.skill.ai;
  if (!hint) return true;
  if (hint.requires && !condHolds(hint.requires, battle, actor, o, mpOverride)) return false;
  return !hint.anyOf?.length || hint.anyOf.some((c) => condHolds(c, battle, actor, o, mpOverride));
}

function evaluate(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[], targetUid: string | undefined, profile: AiProfile, areaCells?: number[], centerUid?: string): Option {
  const previews = previewForTargets(battle, actor, skill.id, targets, centerUid);
  const o: Option = {
    skill,
    ...(targetUid ? { targetUid } : {}),
    ...(targets[0] ? { primary: targets[0] } : {}),
    targets,
    mitigation: statusMitigation(battle, actor, skill, targets),
    primaryHit: 0,
    damage: 0,
    kills: [],
    heal: 0,
    selfHeal: 0,
    shield: 0,
    burn: 0,
    burnTargets: 0,
    revive: 0,
    burnScore: 0,
    primaryAvg: 0,
    missingManaShare: 0,
    pureBuff: isPureBuff(skill),
    buff: 0,
    blocked: false,
    summon: skill.effects.some((e) => e.type === 'summon'),
    taunt: skill.effects.some((e) => e.type === 'taunt'),
    guard: skill.effects.some((e) => e.type === 'guard'),
    summonValue: 0,
    // Rage bedeli skora yansımaz (Rage yalnızca harcanmak için birikir; bedel koşulu canUse + skill'in ai bağlamıyla sağlanır)
    cost: skill.cost.amount * (skill.cost.resource === 'mp' ? profile.mpCostWeight : skill.cost.resource === 'hp' ? profile.hpCostWeight : 0),
    hpCost: (skill.cost.resource === 'hp' && skill.cost.amount > 0) || skill.effects.some((e) => e.type === 'damage' && e.bet?.resource === 'hp'),
  };
  // Bahis: kaybedilirse gidecek MP, bedele beklenen olarak eklenir (MP bahsi); can bahsi hpCost kuralıyla (düşük canda oynanmaz) sınırlanır
  for (const e of skill.effects) {
    if (e.type === 'damage' && e.bet?.resource === 'mp') {
      const mpLeft = skill.cost.resource === 'mp' && !battle.freeMp ? actor.mp - skill.cost.amount : actor.mp;
      o.cost += (1 - e.bet.winChance) * betStake(e.bet, actor.maxHp, actor.hp, mpLeft) * profile.mpCostWeight;
    }
  }
  // Çağrı: beslenmiş/beslenmemiş hâli ve tahmini değeri (varyantı uygulanmış birimin en iyi ham hasarı x ömür x summonValueShare)
  const summonEffect = skill.effects.find((e) => e.type === 'summon');
  if (summonEffect && summonEffect.type === 'summon') {
    // Yuva: mevcut çağrı yuvası kuralı (summonSlotFor); ceset: karşı takımda diriltilmesi EN TEHLİKELİ olan (battle.corpseToConsume)
    const sp = battle.summonPreview(actor.uid, skill.id);
    if (sp.empowered !== undefined) o.empowered = sp.empowered;
    if (sp.slot !== null) o.summonSlot = sp.slot;
    if (sp.corpse) o.corpseUid = sp.corpse.uid;
    if (summonEffect.consumeCorpse) o.corpseOptions = battle.corpseChoices(actor.uid, skill.id);
    if (sp.unit) o.summonValue = summonRawDamage(battle, sp.unit.stats, sp.unit.skills) * (summonEffect.lifespan ?? 3) * (profile.summonValueShare ?? 0.5);
  }
  const manaEffect = skill.effects.find((e) => e.type === 'damage' && e.bonusPerMissingMana);
  const first = targets[0];
  if (manaEffect && manaEffect.type === 'damage' && first) {
    const extra = Math.max(0, first.maxMp - first.mp) * (manaEffect.bonusPerMissingMana ?? 0);
    const base = attributePower(actor.stats, manaEffect.scale, battle.formulas) * manaEffect.power;
    o.missingManaShare = extra + base > 0 ? extra / (extra + base) : 0;
  }
  const lifesteal = Math.max(0, ...skill.effects.map((e) => (e.type === 'damage' ? (e.lifesteal ?? 0) : 0)));
  for (const p of previews) {
    const target = battle.get(p.uid);
    if (!target) continue;
    if (p.damage) {
      if (target === targets[0]) {
        o.primaryAvg = p.damage.avg;
        o.primaryHit = p.damage.hitChance;
      }
      // Beklenen hasar isabet şansıyla çarpılır; "öldürür" saymak için isabet şansı yeterince yüksek olmalı (formulas.json > hit.aiKillMin)
      o.damage += (p.damage.hpLoss + p.damage.absorbed) * p.damage.hitChance;
      if (p.damage.hpLoss >= target.hp && p.damage.hitChance >= battle.formulas.hit.aiKillMin) o.kills.push(target);
      if (lifesteal > 0 && !p.damage.splash) o.selfHeal += p.damage.hpLoss * p.damage.hitChance * lifesteal;
    }
    if (p.heal) o.heal += p.heal.avg;
    if (skill.effects.some((e) => e.type === 'revive')) o.revive += target.maxHp;
    if (p.hot) o.heal += p.hot.total;
    // Saldırı skill'inin kendine verdiği kalkan (Shield Bash) kalkan önceliğini tetiklemez
    if (p.shield && !['single_enemy', 'all_enemies', 'area_enemies'].includes(skill.target)) o.shield += p.shield.amount;
    if (p.burn) {
      o.burn += p.burn;
      o.burnScore += p.burn * Math.max(0.5, target.maxMp / 30); // mana havuzu büyük (büyücü) hedefte mana yakmak daha değerli
      o.burnTargets++;
    }
  }
  // Yerde kalan etki (zehir, yanan zemin, holy fire): alandaki (şeklin TÜM hücreleri; boş anchor dahil) düşmanların turlar boyunca alacağı beklenen hasar
  if (areaCells) {
    const cells = new Set(areaCells);
    for (const e of skill.effects) {
      if (e.type !== 'ground') continue;
      const amount = Math.round(attributePower(actor.stats, e.scale, battle.formulas) * e.power);
      const standing = battle.living(foeSide(actor)).filter((c) => c.board === foeSide(actor) && cells.has(c.slot)).length;
      o.damage += amount * e.turns * standing * 0.7;
    }
  }
  // Rastgele hedefli skill: hedefler önceden bilinmez; beklenen hasar hedef sayısına oranlanır, öldürme garanti değildir
  if (skill.target === 'random_enemies' && targets.length > 0) {
    o.damage *= Math.min(skill.count ?? 3, targets.length) / targets.length;
    o.kills = [];
  }
  o.selfHeal = Math.min(Math.round(o.selfHeal), actor.maxHp - actor.hp);
  return o;
}

const ATTACK_TARGETS = ['single_enemy', 'area_enemies', 'all_enemies', 'random_enemies', 'everyone'];

/**
 * `attacker` -> `victim` en iyi saldırısının (MP/Rage'i yeten) beklenen hasarındaki AZALMA, saldıranın isabetine `accDelta` ya da kurbanın
 * kaçınmasına `evaDelta` eklenince: max(skill) [ortalama hasar x (hit şansı - yeni hit şansı)]. Önizleme formülü (zırh, durumlar, kalkan dahil).
 */
function hitLoss(battle: Battle, attacker: Combatant, victim: Combatant, accDelta: number, evaDelta: number): number {
  const key = `${attacker.uid}|${victim.uid}|${accDelta}|${evaDelta}`;
  const cached = hitLossCache?.get(key);
  if (cached !== undefined) return cached;
  const v = hitLossRaw(battle, attacker, victim, accDelta, evaDelta);
  hitLossCache?.set(key, v);
  return v;
}

function hitLossRaw(battle: Battle, attacker: Combatant, victim: Combatant, accDelta: number, evaDelta: number): number {
  const f = battle.formulas;
  const a = battle.effectiveStats(attacker);
  const v = battle.effectiveStats(victim);
  const after = hitChance({ accuracy: Math.max(0, a.accuracy + accDelta) }, { evasion: Math.max(0, v.evasion + evaDelta) }, f);
  let top = 0;
  for (const id of attacker.skills) {
    const sk = battle.skill(id);
    if (!sk || !ATTACK_TARGETS.includes(sk.target)) continue;
    if (sk.cost.resource === 'mp' && attacker.mp < sk.cost.amount) continue;
    if (sk.cost.resource === 'rage' && (attacker.rage ?? 0) < sk.cost.amount) continue;
    const d = previewForTargets(battle, attacker, id, [victim]).find((p) => p.uid === victim.uid)?.damage;
    if (d) top = Math.max(top, d.avg * Math.max(0, d.hitChance - after));
  }
  return top;
}

/**
 * İsabet/kaçınma durumlarının (statuses.json > accuracyDelta / evasionDelta: Blinded, Shrouded) koruma değeri, can-eşdeğer, yapay ağırlık YOK:
 * - Düşmana isabet cezası (Blinded): o düşmanın bizim canlı birimlerimize yapabileceği en iyi saldırının beklenen hasar azalması, birimlerimizin ORTALAMASI
 *   (her turda birine vurur) x yeni eklenen tur sayısı (zaten varsa yalnızca uzayan kısım).
 * - Dosta kaçınma bonusu (Shrouded): her düşmanın o dosta en iyi saldırısındaki beklenen hasar azalmasının toplamı / canlı dost sayısı
 *   (her düşman birimlerimizden birine vurur) x yeni eklenen tur sayısı.
 */
function statusMitigation(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[]): number {
  let total = 0;
  for (const e of skill.effects) {
    if (e.type !== 'status' || e.self) continue;
    const def = battle.statusDef(e.status);
    const acc = def?.accuracyDelta ?? 0;
    const eva = def?.evasionDelta ?? 0;
    if (acc >= 0 && eva <= 0) continue;
    const chance = (e as { chance?: number }).chance ?? 1;
    for (const t of targets) {
      if (t.hp <= 0 || !battle.effectAppliesTo(skill, e, t, actor)) continue;
      const turns = Math.max(0, e.turns - (t.statuses.find((s) => s.kind === e.status)?.turns ?? 0));
      if (turns <= 0) continue;
      if (acc < 0 && t.side !== actor.side) {
        const victims = battle.living(actor.side);
        if (victims.length > 0) total += (sum(victims.map((v) => hitLoss(battle, t, v, acc, 0))) / victims.length) * turns * chance;
      }
      if (eva > 0 && t.side === actor.side) {
        const allies = Math.max(1, battle.living(actor.side).length);
        total += (sum(battle.living(foeSide(actor)).map((foe) => hitLoss(battle, foe, t, 0, eva))) / allies) * turns * chance;
      }
    }
  }
  return total;
}

/** Bir birimin skill'leri arasında tek kullanımlık en yüksek HAM hasar (zırhsız, kritiksiz; yan vuruş dahil değil): stat x güç toplamı. */
function summonRawDamage(battle: Battle, stats: Combatant['stats'], skills: string[]): number {
  let top = 0;
  for (const id of skills) {
    const sk = battle.skill(id);
    if (!sk) continue;
    const raw = sum(sk.effects.map((e) => (e.type === 'damage' ? attributePower(stats, e.scale, battle.formulas) * e.power : 0)));
    top = Math.max(top, raw);
  }
  return top;
}

/**
 * Çağrı seçimi (summon önceliği ve açıklaması aynı fonksiyonu kullanır): yeterince çağrı yoksa. Beslenmiş (ceset tüketen) ya da ceset tüketmeyen çağrı:
 * en ucuzu. Beslenmemiş (ceset yok) çağrı: yalnızca tahmini değeri, bu turun en iyi başka (çağrı olmayan) hamlesinin değerinden düşük değilse.
 */
function summonPool(options: Option[]): { pool: Option[]; alt: number; unfedOnly: boolean } {
  const summons = options.filter((o) => o.summon);
  const ready = summons.filter((o) => o.empowered !== false);
  if (ready.length > 0 || summons.length === 0) return { pool: ready, alt: 0, unfedOnly: false };
  const alt = Math.max(0, ...options.filter((o) => !o.summon).map((o) => (o.pureBuff ? o.buff : value(o)) - o.cost));
  return { pool: summons.filter((o) => o.summonValue - o.cost >= alt), alt, unfedOnly: true };
}

type Picker = (battle: Battle, actor: Combatant, profile: AiProfile, options: Option[]) => Option | undefined;

// ---------------------------------------------------------------- global skill'ler (Rest / Skip Turn / Move Tile)

/** Class hamlesinin değeri (can-eşdeğer): beklenen hasar/şifa/kalkan/buff - bedel; hamle yoksa 0. */
const optionNet = (o: Option | undefined): number => (o ? Math.max(0, (o.pureBuff ? o.buff : value(o)) - o.cost) : 0);

/**
 * Skill'in bedeli ve bekleme dışında (hedef, menzil/ön sıra, boş yer) kullanılabilir olup olmadığı: Rest/Skip kararlarında
 * "şu an MP/cooldown yüzünden yapılamayan ama bekleyince yapılabilecek" skill'leri bulmak için.
 */
function usableIgnoringCost(battle: Battle, actor: Combatant, skill: SkillDef): boolean {
  if (skill.motion === 'melee' && skill.target !== 'self' && !skill.ignoreFrontRow && !skill.ignoreReach && actor.board === actor.side && !battle.canMeleeFrom(actor.uid, actor.slot, skill.reach ?? 0)) return false;
  if (skill.effects.some((e) => e.type === 'summon') && battle.summonSlots(actor.uid, skill.id).length === 0) return false;
  return battle.validTargets(actor.uid, skill.id).length > 0;
}

/** Skill'in şu anki en değerli (bağlamı sağlanan) seçeneğinin net değeri; MP/cooldown denetlenmez. `mp`: bağlamdaki MP oranı koşulu için varsayılan MP. */
function bestSkillValue(battle: Battle, actor: Combatant, skill: SkillDef, profile: AiProfile, mp: number): number {
  if (!usableIgnoringCost(battle, actor, skill)) return 0;
  let top = 0;
  for (const o of skillOptions(battle, actor, skill.id, profile)) {
    if (!hintHolds(battle, actor, o, mp)) continue;
    top = Math.max(top, value(o) - o.cost);
  }
  return top;
}

/** Rest'in "ek MP ile yapılabilecek" en değerli skill'e kazandıracağı net değer (ertelenen skill değeri - şimdiki hamle); 0 = fayda yok. */
function restGain(battle: Battle, actor: Combatant, profile: AiProfile, g: AiGlobalConfig, mpGain: number, vNow: number, spend: number): number {
  const turnsMode = battle.mode === 'turns';
  const regen = turnsMode ? actor.stats.mpRegen : 0;
  let top = 0;
  for (const id of actor.skills) {
    const sk = battle.skill(id);
    if (!sk || sk.cost.resource !== 'mp' || sk.cost.amount <= 0) continue;
    const cd = turnsMode ? (actor.cooldowns[id] ?? 0) : 0;
    const wait = Math.max(1, cd);
    if (wait > g.rest.lookaheadTurns) continue;
    const need = Math.max(sk.cost.amount, Math.ceil((sk.ai?.requires?.minSelfMpRatio ?? 0) * actor.maxMp));
    if (need > actor.maxMp) continue;
    const without = Math.min(actor.maxMp, actor.mp - spend + regen * wait);
    const mid = Math.min(actor.maxMp, actor.mp + mpGain);
    const withRest = Math.min(actor.maxMp, mid + regen * wait);
    if (without >= need || withRest < need) continue; // Rest, skill'i yapılabilir yapan şey olmalı
    if (cd === 0 && actor.mp / Math.max(1, actor.maxMp) >= g.rest.mpBelowRatio) continue; // şu an hazır ama MP az: yalnızca MP düşükken
    const v = bestSkillValue(battle, actor, sk, profile, withRest) * g.rest.futureValueShare;
    const net = v - vNow;
    if (v > 0 && net >= g.rest.minGainShare * v) top = Math.max(top, net);
  }
  return top;
}

/** Düşman takımının, birimin `slot` yuvasındayken ona yakın dövüşle vurabileceği beklenen hasar (tek turluk; hedef paylaşımı dahil). */
function meleeIncoming(battle: Battle, actor: Combatant, slot: number): number {
  const foes = battle.living(foeSide(actor));
  const meleeRows = battle.formulas.formation.meleeRows;
  const exposed = battle.living(actor.side).filter((c) => c.board === actor.board && battle.rowRank(c.uid) < meleeRows).length;
  let total = 0;
  for (const foe of foes) {
    if (foe.board !== foe.side) continue; // tahtamıza sızmış çağrılar (yalnızca bitişik): bu hesabın dışında
    let top = 0;
    for (const id of foe.skills) {
      const sk = battle.skill(id);
      if (!sk || sk.motion !== 'melee' || sk.target === 'self') continue;
      if (battle.get(foe.uid)?.cooldowns[id]) continue;
      if (sk.cost.resource === 'mp' && foe.mp < sk.cost.amount) continue;
      if (sk.cost.resource === 'rage' && (foe.rage ?? 0) < sk.cost.amount) continue;
      if (!sk.ignoreFrontRow && !sk.ignoreReach && !battle.canMeleeFrom(foe.uid, foe.slot, sk.reach ?? 0)) continue; // saldıran kendi ön sırasında değil
      if (!sk.ignoreReach && battle.rowRank(actor.uid, slot) >= meleeRows + (sk.reach ?? 0)) continue; // hedef erişim dışında
      const d = previewForTargets(battle, foe, id, [actor]).find((p) => p.uid === actor.uid)?.damage;
      if (!d) continue;
      const share = sk.target === 'single_enemy' && !sk.ignoreReach ? 1 / Math.max(1, exposed) : 1; // tek hedefli: dikkat erişilebilir birimler arasında bölünür
      top = Math.max(top, d.avg * d.hitChance * share);
    }
    total += top;
  }
  return total;
}

/** Bir yuvadaki birimin bitişik (artı şekli) canlı dostlarının zırh aurasından beklenen hasar azalması (can-eşdeğer). */
function auraBenefit(battle: Battle, actor: Combatant, slot: number, pct: number, incoming: Map<string, number>): number {
  let total = 0;
  for (const ally of battle.living(actor.side)) {
    if (ally.uid === actor.uid || ally.board !== actor.board) continue;
    const dr = Math.abs(battle.rowOf(ally.slot) - battle.rowOf(slot));
    const dl = Math.abs(battle.laneOf(ally.slot) - battle.laneOf(slot));
    if (dr + dl > 1) continue;
    const armor = battle.effectiveStats(ally).armor;
    const gain = armorReduction(armor + actor.stats.armor * pct, battle.formulas) - armorReduction(armor, battle.formulas);
    let inc = incoming.get(ally.uid);
    if (inc === undefined) incoming.set(ally.uid, (inc = incomingDamage(battle, ally)));
    total += gain * inc;
  }
  return total;
}

interface MovePlan {
  slot: number;
  net: number;
}

/** Move Tile için en iyi plan (yoksa null): geri çekilme (kırılgan/yaralı), öne geçme (yakın dövüşçü), aura komşuluğu. Üst üste hareket yok. */
function bestMove(battle: Battle, actor: Combatant, g: AiGlobalConfig, vNow: number): MovePlan | null {
  const free = battle.freeTiles(actor.uid);
  if (free.length === 0 || battle.lastActionOf(actor.uid) === 'move') return null;
  const meleeSkills = actor.skills.map((id) => battle.skill(id)).filter((s): s is SkillDef => !!s && s.motion === 'melee' && s.target !== 'self' && !s.ignoreFrontRow && !s.ignoreReach);
  const fragile = !actor.skills.some((id) => battle.skill(id)?.motion === 'melee');
  const wounded = ratio(actor) < g.move.retreatHpRatio;
  const meleeRows = battle.formulas.formation.meleeRows;
  const pickSlot = (slots: number[], adj: (slot: number) => number): number => {
    // Bitişik dost sayısı (aura/komşuluk) çok olan, sonra öne yakın, sonra küçük yuva (ölü dost yuvaları freeTiles'ta zaten yok)
    return [...slots].sort((a, b) => adj(b) - adj(a) || battle.rowOf(a) - battle.rowOf(b) || a - b)[0]!;
  };
  const neighbors = (slot: number) => battle.living(actor.side).filter((c) => c.uid !== actor.uid && c.board === actor.board && Math.abs(battle.rowOf(c.slot) - battle.rowOf(slot)) + Math.abs(battle.laneOf(c.slot) - battle.laneOf(slot)) <= 1).length;
  const plans: MovePlan[] = [];

  // 1) Geri çekilme: menzilli/kırılgan birim (ya da yaralı yakın dövüşçü) yakın dövüşe açıkken, düşmanın yakın dövüş tehdidi büyükse erişim dışına
  if ((fragile || wounded) && battle.rowRank(actor.uid) < meleeRows) {
    const now = meleeIncoming(battle, actor, actor.slot);
    if (now >= g.move.minAvoidShare * actor.hp) {
      const safe = free.filter((s) => battle.rowRank(actor.uid, s) >= meleeRows && meleeIncoming(battle, actor, s) < now);
      if (safe.length > 0) {
        const slot = pickSlot(safe, neighbors);
        const avoided = now - meleeIncoming(battle, actor, slot);
        const cost = vNow * (fragile ? g.move.opportunityShare : g.move.meleeOpportunityShare);
        if (avoided >= g.move.minAvoidShare * actor.hp && avoided > cost) plans.push({ slot, net: avoided - cost });
      }
    }
  }

  // 2) Öne geçme: yakın dövüşçü şu an ön sırada olmadığı için melee yapamıyor; öne boş yuva varsa potansiyel melee değeri kazanılır
  if (meleeSkills.length > 0 && !wounded && !meleeSkills.some((s) => battle.canMeleeFrom(actor.uid, actor.slot, s.reach ?? 0))) {
    const front = free.filter((s) => meleeSkills.some((sk) => battle.canMeleeFrom(actor.uid, s, sk.reach ?? 0)));
    if (front.length > 0) {
      const foes = battle.livingByDepth(foeSide(actor));
      let potential = 0;
      for (const sk of meleeSkills) {
        if ((actor.cooldowns[sk.id] ?? 0) > 0 && battle.mode === 'turns') continue;
        if (sk.cost.resource === 'mp' && !battle.freeMp && actor.mp < sk.cost.amount) continue;
        if (sk.cost.resource === 'rage' && (actor.rage ?? 0) < sk.cost.amount) continue;
        const home = foes.filter((c) => c.board === c.side);
        const rows = [...new Set(home.map((c) => battle.rowOf(c.slot)))].slice(0, meleeRows + (sk.reach ?? 0));
        const reachable = foes.filter((c) => c.board !== c.side || rows.includes(battle.rowOf(c.slot)));
        const exp = (uid: string) => {
          const p = previewForTargets(battle, actor, sk.id, [reachable.find((c) => c.uid === uid)!])[0];
          return p?.damage ? p.damage.avg * p.damage.hitChance : 0;
        };
        const single = Math.max(0, ...reachable.map((c) => exp(c.uid)));
        const total = sk.target === 'single_enemy' ? single : reachable.reduce((a, c) => a + exp(c.uid), 0);
        potential = Math.max(potential, total - (sk.cost.resource === 'mp' ? sk.cost.amount * 0.5 : 0));
      }
      const net = potential * 0.9 - vNow;
      if (potential > 0 && net >= g.move.minFrontGainShare * potential) plans.push({ slot: pickSlot(front, neighbors), net });
    }
  }

  // 3) Aura komşuluğu: zırh aurası taşıyan birim, daha çok dostun bitişiğine geçerek ve melee yeteneğini koruyarak beklenen hasarı azaltır
  const aura = actor.passive?.effect;
  if (aura?.type === 'armorAura' && battle.living(actor.side).length > 1) {
    const incoming = new Map<string, number>();
    const here = auraBenefit(battle, actor, actor.slot, aura.pct, incoming);
    const canMeleeNow = meleeSkills.some((s) => battle.canMeleeFrom(actor.uid, actor.slot, s.reach ?? 0));
    let top: MovePlan | null = null;
    for (const s of free) {
      if (canMeleeNow && !meleeSkills.some((sk) => battle.canMeleeFrom(actor.uid, s, sk.reach ?? 0))) continue; // melee yeteneğini kaybetme
      if (battle.rowOf(s) > battle.rowOf(actor.slot)) continue; // geriye çekilme: ön sıradaki dostlar korumasız kalır
      const gain = auraBenefit(battle, actor, s, aura.pct, incoming) - here;
      const net = gain - vNow * g.move.opportunityShare;
      if (gain >= g.move.minAuraGain && net > 0 && (!top || net > top.net || (net === top.net && s < top.slot))) top = { slot: s, net };
    }
    if (top) plans.push(top);
  }

  return plans.length ? plans.reduce((a, b) => (b.net > a.net ? b : a)) : null;
}

/**
 * Global skill kararı (Rest / Skip Turn / Move Tile); null = class hamlesi (ya da pas) kalır.
 * Öldürücü ve işlevsel (şifa, çağrı, kalkan, taunt, guard, mana yakma) hamleler her zaman önce gelir.
 * Tehlikede (can düşük ve gelen hasar büyük) dinlenme/bekleme denenmez; yalnızca geri çekilme (Move) olabilir.
 */
function chooseGlobal(battle: Battle, actor: Combatant, profile: AiProfile, g: AiGlobalConfig, pick: { option: Option; reason: AiChoice['reason'] } | null, trace?: GlobalTrace): AiChoice | null {
  const reason = pick?.reason;
  if (reason === 'kill') {
    if (trace) trace.gate = 'class move is a killing blow: global skills are not considered';
    return null;
  }
  if (reason && !['damage', 'aoe', 'tactic', 'fallback'].includes(reason)) {
    if (trace) trace.gate = `class move is functional (priority "${reason}"): global skills are not considered`;
    return null; // işlevsel hamle
  }
  const vNow = optionNet(pick?.option);
  const spend = pick && pick.option.skill.cost.resource === 'mp' && !battle.freeMp ? pick.option.skill.cost.amount : 0;
  const lowHp = ratio(actor) < g.rest.dangerHpRatio;
  const incoming = trace || lowHp ? incomingDamage(battle, actor) : 0;
  const danger = lowHp && incoming >= actor.hp * g.rest.dangerIncomingShare;
  if (trace) {
    trace.vNow = vNow;
    trace.spend = spend;
    trace.danger = { active: danger, hpRatio: ratio(actor), incoming, hp: actor.hp };
  }

  const canMove = battle.canUseGlobal(actor.uid, 'move_tile');
  const canRest = battle.canUseGlobal(actor.uid, 'rest');
  const move = canMove.ok ? bestMove(battle, actor, g, vNow) : null;
  const rest = canRest.ok && !danger ? restGain(battle, actor, profile, g, battle.globalDef('rest')?.mp ?? 0, vNow, spend) : 0;
  if (trace) {
    trace.move = move;
    if (!canMove.ok) trace.moveBlocked = canMove.reason;
    else if (!move) trace.moveBlocked = 'no profitable move (retreat / step forward / aura adjacency all fail their thresholds)';
    trace.restGain = rest;
    if (!canRest.ok) trace.restBlocked = canRest.reason;
    else if (danger) trace.restBlocked = 'danger: low HP and high incoming damage';
    else if (rest <= 0) trace.restBlocked = 'no skill becomes affordable with extra MP (or gain below minGainShare)';
  }
  const best = [
    ...(move && move.net > 0 ? [{ net: move.net, choice: { skillId: 'move_tile', slot: move.slot, targetUid: tileUid(move.slot), reason: 'move' } as AiChoice }] : []),
    ...(rest > 0 ? [{ net: rest, choice: { skillId: 'rest', reason: 'rest' } as AiChoice }] : []),
  ].sort((a, b) => b.net - a.net)[0];
  if (best) {
    if (trace) trace.outcome = `${best.choice.skillId} (net ${r2(best.net)} beats the class move value ${r2(vNow)})`;
    return best.choice;
  }
  if (danger) {
    if (trace) trace.outcome = 'danger: no rest/skip; class move stands';
    return null;
  }

  // Skip Turn: yapılacak değerli hamle yok; ya da 1 tur sonra hazır olacak güçlü skill'e kıyasla şimdiki hamle değersiz.
  // Skip artık sonraki turu yarı sürede getirir (hız x2, düşman araya girebilir): cooldown/MP bir azalma sonraki turda yine işler, yani skill hazır olur.
  if (trace) trace.skipChecks = [];
  const canSkip = battle.canUseGlobal(actor.uid, 'skip_turn');
  if (trace && !canSkip.ok) trace.skipNote = canSkip.reason;
  if (canSkip.ok) {
    if (!pick) {
      if (trace) trace.outcome = 'skip_turn: nothing worthwhile to do';
      return { skillId: 'skip_turn', reason: 'skip' };
    }
    const regen = actor.stats.mpRegen;
    for (const id of actor.skills) {
      const sk = battle.skill(id);
      if (!sk || (actor.cooldowns[id] ?? 0) !== 1) continue;
      const need = sk.cost.resource === 'mp' ? Math.max(sk.cost.amount, Math.ceil((sk.ai?.requires?.minSelfMpRatio ?? 0) * actor.maxMp)) : 0;
      if (sk.cost.resource === 'mp' && !battle.freeMp && Math.min(actor.maxMp, actor.mp + regen) < need) continue;
      if (sk.cost.resource === 'rage' && (actor.rage ?? 0) < sk.cost.amount) continue;
      const v = bestSkillValue(battle, actor, sk, profile, Math.min(actor.maxMp, actor.mp + regen)) * g.rest.futureValueShare;
      const hit = v > 0 && vNow < g.skip.worthlessShare * v;
      trace?.skipChecks?.push({ skill: id, futureValue: v, nowValue: vNow, needBelow: g.skip.worthlessShare * v, hit });
      if (hit) {
        if (trace) trace.outcome = `skip_turn: ${id} is ready next turn (value ${r2(v)}) and the current move is worth only ${r2(vNow)}`;
        return { skillId: 'skip_turn', reason: 'skip' };
      }
    }
  }
  // Yapılacak değerli hamle yok, Skip da yok (üst üste sınırı) ama MP eksik: Rest hiç değilse MP biriktirir
  if (!pick && canRest.ok && !danger) {
    if (trace) trace.outcome = 'rest: no move to make, at least accumulate MP';
    return { skillId: 'rest', reason: 'rest' };
  }
  if (trace) trace.outcome = 'no global skill is worth it: class move stands';
  return null;
}

/** Can ödeyen skill'ler için kullanıcının canı yeterince yüksek mi? (Öldürücü vuruşta bu kural yok.) */
const affordable = (actor: Combatant, profile: AiProfile) => (o: Option) =>
  !o.hpCost || ratio(actor) >= profile.minHpRatioForHpCost;

const hasStatus = (c: Combatant, kind: 'taunt' | 'guard' | 'regen') => c.statuses.some((s) => s.kind === kind);

const PICKERS: Record<AiPriority, Picker> = {
  // Birini öldürebilen en iyi seçenek: en tehlikeli düşmanları öldüren, sonra en ucuz olan.
  kill: (_b, _a, _p, options) => {
    const killers = options.filter((o) => o.kills.length > 0);
    return best(killers, (o) => sum(o.kills.map(threat)) * 1000 - o.cost);
  },

  // Dostlardan biri eşiğin altındaysa, o dostu içeren en verimli şifa (anlık veya tur bazlı).
  heal: (_b, actor, profile, options) => {
    // Düşmüş bir dostu diriltmek her şifadan değerlidir: en güçlü (en çok canlı) birim önce
    const revives = options.filter((o) => o.revive > 0);
    if (revives.length > 0) return best(revives, (o) => o.revive - o.cost);
    const hurt = (c: Combatant) => ratio(c) < profile.healBelowRatio;
    if (profile.healBelowRatio <= 0) return undefined;
    const healers = options.filter((o) => o.heal > 0 && o.targets.some(hurt));
    return best(healers, (o) => o.heal - o.cost + (o.targets.length === 1 ? (1 - ratio(o.targets[0] ?? actor)) * 10 : 0));
  },

  // Bağlam: skill'in `ai` ipucu sağlanıyorsa (4. skill'ler gibi güçlü skill'ler yalnızca doğru bağlamda aday olur) en değerlisi.
  // Saf self-buff'ta (Abyssal Cry) değer = net buff değeri (savunma + hasar artışı - bedeller); diğerlerinde beklenen değer - bedel.
  tactic: (_b, actor, profile, options) => {
    const score = (o: Option) => (o.pureBuff ? o.buff : value(o)) - o.cost;
    return best(options.filter((o) => o.skill.ai && score(o) > 0).filter(affordable(actor, profile)), score);
  },

  // Yeterince çağrılmış birim yoksa çağır (ceset tüketen çağrıda: ceset varsa hemen; yoksa yalnızca beslenmemiş hâlin değeri yetiyorsa).
  summon: (battle, actor, profile, options) => {
    const alive = battle.combatants.filter((c) => c.side === actor.side && c.summoned && c.hp > 0).length;
    if (alive >= profile.maxSummons) return undefined;
    return best(summonPool(options).pool, (o) => -o.cost);
  },

  // Kalkansız ve canı eşiğin altındaki dosta (veya kendine) kalkan; en yaralı olana öncelik.
  shield: (_b, _a, profile, options) => {
    if (profile.shieldBelowRatio <= 0) return undefined;
    const needs = (c: Combatant) => c.shield === 0 && c.magicShield === 0 && ratio(c) < profile.shieldBelowRatio;
    const shielders = options.filter((o) => o.shield > 0 && !o.taunt && o.targets.some(needs));
    return best(shielders, (o) => o.shield - o.cost + (1 - ratio(o.targets[0]!)) * 50);
  },

  // Taunt: kendinde yoksa ve takımda korunacak başka biri varsa çek.
  taunt: (battle, actor, _p, options) => {
    if (hasStatus(actor, 'taunt') || battle.living(actor.side).length < 2) return undefined;
    return best(options.filter((o) => o.taunt), (o) => -o.cost);
  },

  // Guard: canı eşiğin altındaki, korumasız (kendimiz olmayan) dostu koru; en yaralı olana öncelik.
  guard: (_b, actor, profile, options) => {
    const limit = profile.guardBelowRatio ?? 0;
    if (limit <= 0) return undefined;
    const guards = options.filter((o) => o.guard && o.targets[0] && o.targets[0] !== actor && ratio(o.targets[0]) < limit && !hasStatus(o.targets[0], 'guard'));
    return best(guards, (o) => (1 - ratio(o.targets[0]!)) * 100 - o.cost);
  },

  // Toplu mana yakma: en az burnMinTargets düşmanın yakılabilir manası varsa.
  burn: (_b, _a, profile, options) => {
    const min = profile.burnMinTargets ?? 2;
    // Alanda yeterince hedef ya da mana havuzu büyük (büyücü) bir hedef varsa; en çok mana-ağırlıklı değeri veren alan seçilir
    const burners = options.filter((o) => (o.skill.target === 'all_enemies' || o.skill.target === 'area_enemies') && (o.burnTargets >= min || o.burnScore >= 40));
    return best(burners, (o) => o.burnScore - o.cost);
  },

  // Yeterince düşman varsa herkese vuran en verimli skill.
  aoe: (battle, actor, profile, options) => {
    if (battle.living(actor.side === 'party' ? 'enemy' : 'party').length < profile.aoeMinTargets) return undefined;
    const aoes = options.filter((o) => (o.skill.target === 'all_enemies' || o.skill.target === 'area_enemies') && o.damage > 0).filter(affordable(actor, profile));
    return best(aoes, (o) => o.damage - o.cost);
  },

  // Odak hedefe (profil: en az can / en düşük can oranı) en verimli hasar; herkese vuran skill de aday.
  damage: (_b, actor, profile, options) => {
    const damaging = options.filter((o) => o.damage > 0).filter(affordable(actor, profile));
    if (damaging.length === 0) return undefined;
    // Odak, vurulabilecek (menzil ve taunt'a uyan) düşmanlar arasından seçilir
    const reachable = new Map<string, Combatant>();
    for (const o of damaging) for (const t of o.skill.target === 'single_enemy' ? o.targets.slice(0, 1) : o.targets) reachable.set(t.uid, t);
    const focus = best([...reachable.values()], (c) => (profile.focus === 'lowest_hp' ? -(c.hp + c.shield + c.magicShield) : -ratio(c)));
    const onFocus = damaging.filter((o) => (o.skill.target === 'all_enemies' || (o.skill.target === 'single_enemy' ? o.targets[0] === focus : o.targets.includes(focus!))));
    return best(onFocus.length > 0 ? onFocus : damaging, (o) => o.damage + o.selfHeal + o.burn * BURN_WEIGHT - o.cost);
  },
};

// ---------------------------------------------------------------- karar açıklaması (maç kaydı için)

/** Birimin kısa, okunur etiketi: "P0:Warrior" (P/E = taraf, sayı = takım içi sıra) - maç kaydı ve açıklama bunu kullanır. */
export function unitLabel(c: Pick<Combatant, 'uid' | 'side' | 'name'>): string {
  return `${c.side === 'party' ? 'P' : 'E'}${c.uid.split('-').pop()}:${c.name}`;
}

/** Açıklamadaki tek bir aday (skill + hedef/alan) ve puanları. */
export interface AiCandidate {
  skill: string;
  name: string;
  /** Hedef birim (tek hedefli skill) ya da alan skill'inin merkez birimi; kendine/herkese skill'lerde tanımsız. */
  target?: string;
  /** Alan/şerit skill'inde merkez hücre (yuva numarası, 0 tabanlı). */
  center?: number;
  /** Şekil skill'inde: şekil adı ('rect 2x3', 'row', 'column', 'plus') ve kapsadığı tüm hücreler (match-log). */
  shape?: string;
  cells?: number[];
  /** area_any (Smoke Bomb): alanın atıldığı tahta ('own' = kendi tarafı, 'foe' = karşı taraf). */
  board?: 'own' | 'foe';
  /** İsabet/kaçınma durumlarının (Blinded/Shrouded) koruma değeri (can-eşdeğer; 0 ise yazılmaz). */
  mitigation?: number;
  /** Vurulan/etkilenen tüm birimler (alan, yan vuruş, herkes) ve bunların kaçı düşman. */
  hits: string[];
  enemyHits: number;
  /** Hedeflerin canı/kalkanıyla sınırlı toplam beklenen hasar (isabet şansıyla çarpılmış; alan skill'inde TÜM hedeflerin toplamı). */
  dmg: number;
  kills: string[];
  heal: number;
  selfHeal: number;
  shield: number;
  burn: number;
  buff: number;
  revive: number;
  /** MP/can bedelinin skora yansıyan ağırlıklı değeri (ai.json mpCostWeight/hpCostWeight). */
  cost: number;
  /** Genel değer - bedel (yedek seçim ve global kararlar bunu kullanır). */
  net: number;
  /** Ana hedefe isabet şansı (hasar veriyorsa). */
  hit?: number;
  /** Hedef başına beklenen hasar (en çok 8): ortalama hasar, isabet şansı, bu vuruşla öldürür mü. */
  perTarget?: Array<{ unit: string; avg: number; hit: number; lethal: boolean }>;
  /** Çağrı adayında tahmini çağrı değeri (birimin en iyi ham hasarı x ömür x summonValueShare). */
  summonValue?: number;
  /** Çağrı adayında çağrı yuvası (kendi tahtası). */
  summonSlot?: number;
  /** Ceset tüketen çağrı adayında: tüketilecek ceset (tehlike puanı + gerekçe) ve seçilmeyen diğer cesetler. */
  corpse?: { unit: string; danger: number; why: string };
  otherCorpses?: Array<{ unit: string; danger: number }>;
  /** Etiketler: summon, empowered (ceset tüketilecek), unfed (ceset yok), taunt, guard, selfBuff, hpCost, hint (skill'in ai bağlam ipucu var). */
  tags: string[];
  /** Kazanan önceliğin seçicisinde bu adayın puanı (yalnızca seçicinin havuzundaki adaylarda). */
  score?: number;
  /** chosen: seçildi; lost: havuzdaydı ama puanı düşük; blocked: bağlam/MP ayırma yüzünden elendi; skipped: kazanan önceliğin havuzu dışında. */
  verdict: 'chosen' | 'lost' | 'blocked' | 'skipped';
  /** blocked/skipped nedeni ya da kısa not. */
  note?: string;
}

export interface AiExplanation {
  uid: string;
  actor: string;
  profile: string;
  priorities: string[];
  focusRule: string;
  /** Verilen karar (chooseAction ile birebir aynı); null = hiçbir şey yapılamadı (tur pas). */
  final: { skill: string; name: string; target?: string; slot?: number; board?: 'own' | 'foe'; corpse?: string; reason: string } | null;
  /** Tek cümlelik özet: hangi kural/öncelik neden bu kararı verdirdi. */
  why: string;
  /** Öncelik sırası boyunca her seçici: picked (seçti) / none (uymadı) ve gerekçe. */
  steps: Array<{ priority: string; result: 'picked' | 'none'; detail: string }>;
  /** Kazanan önceliğin seçim kuralı (puan formülü). */
  winnerRule?: string;
  candidates: AiCandidate[];
  /** Kullanılamayan skill'ler ve nedeni (cooldown, MP, Rage, menzil, hedef yok...). */
  rejected: Array<{ skill: string; name: string; reason: string }>;
  /** MP ayırma (reserveMp): ertelenen saldırıların nedeni. */
  reserves: Array<{ skill: string; needMp: number; inTurns: number }>;
  /** Global skill (Rest / Skip / Move) değerlendirmesi. */
  global: GlobalTrace;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Bir önceliğin seçicisinin havuzu ve puan formülü (PICKERS ile aynı mantık; yalnızca açıklama için, seçimi etkilemez; testle kilitli). */
function pickerView(priority: AiPriority | 'fallback', actor: Combatant, profile: AiProfile, options: Option[]): { pool: Option[]; score: (o: Option) => number; rule: string } {
  switch (priority) {
    case 'kill':
      return { pool: options.filter((o) => o.kills.length > 0), score: (o) => sum(o.kills.map(threat)) * 1000 - o.cost, rule: 'kill: options that kill a foe; highest (sum of killed foes threat x 1000 - cost)' };
    case 'heal': {
      const revives = options.filter((o) => o.revive > 0);
      if (revives.length > 0) return { pool: revives, score: (o) => o.revive - o.cost, rule: 'heal: revive a fallen ally (highest max HP - cost)' };
      const hurt = (c: Combatant) => ratio(c) < profile.healBelowRatio;
      return {
        pool: profile.healBelowRatio <= 0 ? [] : options.filter((o) => o.heal > 0 && o.targets.some(hurt)),
        score: (o) => o.heal - o.cost + (o.targets.length === 1 ? (1 - ratio(o.targets[0] ?? actor)) * 10 : 0),
        rule: `heal: ally below ${profile.healBelowRatio} HP; heal - cost + (1 - target hp ratio) x 10 for single targets`,
      };
    }
    case 'tactic':
      return {
        pool: options.filter((o) => o.skill.ai && (o.pureBuff ? o.buff : value(o)) - o.cost > 0).filter(affordable(actor, profile)),
        score: (o) => (o.pureBuff ? o.buff : value(o)) - o.cost,
        rule: 'tactic: skills with an ai context hint that holds and net > 0; highest (value - cost); a self-buff uses its net buff value',
      };
    case 'summon': {
      const sp = summonPool(options);
      return {
        pool: sp.pool,
        score: (o) => -o.cost,
        rule: sp.unfedOnly
          ? `summon: no corpse to consume, so the summon comes unfed; only if its value (summon value - cost) >= best other move ${r1(sp.alt)}; cheapest`
          : 'summon: cheapest summon (a corpse-consuming summon is ready to be empowered)',
      };
    }
    case 'shield': {
      const needs = (c: Combatant) => c.shield === 0 && c.magicShield === 0 && ratio(c) < profile.shieldBelowRatio;
      return {
        pool: profile.shieldBelowRatio <= 0 ? [] : options.filter((o) => o.shield > 0 && !o.taunt && o.targets.some(needs)),
        score: (o) => o.shield - o.cost + (1 - ratio(o.targets[0]!)) * 50,
        rule: `shield: unshielded ally below ${profile.shieldBelowRatio} HP; shield - cost + (1 - hp ratio) x 50`,
      };
    }
    case 'taunt':
      return { pool: options.filter((o) => o.taunt), score: (o) => -o.cost, rule: 'taunt: cheapest taunt' };
    case 'guard': {
      const limit = profile.guardBelowRatio ?? 0;
      return {
        pool: limit <= 0 ? [] : options.filter((o) => o.guard && o.targets[0] && o.targets[0] !== actor && ratio(o.targets[0]) < limit && !hasStatus(o.targets[0], 'guard')),
        score: (o) => (1 - ratio(o.targets[0]!)) * 100 - o.cost,
        rule: `guard: unguarded ally below ${limit} HP; (1 - hp ratio) x 100 - cost`,
      };
    }
    case 'burn': {
      const min = profile.burnMinTargets ?? 2;
      return {
        pool: options.filter((o) => (o.skill.target === 'all_enemies' || o.skill.target === 'area_enemies') && (o.burnTargets >= min || o.burnScore >= 40)),
        score: (o) => o.burnScore - o.cost,
        rule: `burn: area/all mana burn on >= ${min} foes (or burn score >= 40); mana-weighted burn - cost`,
      };
    }
    case 'aoe':
      return {
        pool: options.filter((o) => (o.skill.target === 'all_enemies' || o.skill.target === 'area_enemies') && o.damage > 0).filter(affordable(actor, profile)),
        score: (o) => o.damage - o.cost,
        rule: 'aoe: area/all-enemies skills with damage; total expected damage over ALL hit foes - cost',
      };
    case 'damage': {
      const damaging = options.filter((o) => o.damage > 0).filter(affordable(actor, profile));
      const reachable = new Map<string, Combatant>();
      for (const o of damaging) for (const t of o.skill.target === 'single_enemy' ? o.targets.slice(0, 1) : o.targets) reachable.set(t.uid, t);
      const focus = best([...reachable.values()], (c) => (profile.focus === 'lowest_hp' ? -(c.hp + c.shield + c.magicShield) : -ratio(c)));
      const onFocus = damaging.filter((o) => o.skill.target === 'all_enemies' || (o.skill.target === 'single_enemy' ? o.targets[0] === focus : o.targets.includes(focus!)));
      return {
        pool: onFocus.length > 0 ? onFocus : damaging,
        score: (o) => o.damage + o.selfHeal + o.burn * BURN_WEIGHT - o.cost,
        rule: `damage: focus = ${focus ? unitLabel(focus) : 'none'} (${profile.focus}); only options that hit the focus; highest (damage + self heal + 0.6 x burn - cost)`,
      };
    }
    case 'fallback': {
      const positive = (l: Option[]) => l.filter((o) => value(o) > 0);
      const open = positive(options.filter((o) => !o.blocked));
      return { pool: open.length > 0 ? open : positive(options), score: (o) => value(o) - o.cost, rule: 'fallback: nothing matched; best (value - cost) among options with positive value' };
    }
  }
}

/** Seçici hiçbir şey seçmediğinde nedeni (kısa). */
function noPickReason(priority: AiPriority | 'fallback', battle: Battle, actor: Combatant, profile: AiProfile, options: Option[]): string {
  switch (priority) {
    case 'kill':
      return 'no option kills a foe (needs hit chance >= aiKillMin)';
    case 'heal':
      return profile.healBelowRatio <= 0 ? 'healBelowRatio is 0 (disabled in this profile)' : `no ally below ${profile.healBelowRatio} HP with a usable heal`;
    case 'tactic': {
      const hinted = options.filter((o) => o.skill.ai);
      return hinted.length === 0 ? 'no skill with an ai context hint is usable and holding' : 'hinted skills exist but none has a positive net value (or its HP cost is not affordable)';
    }
    case 'summon': {
      const alive = battle.combatants.filter((c) => c.side === actor.side && c.summoned && c.hp > 0).length;
      if (alive >= profile.maxSummons) return `summons alive ${alive} >= maxSummons ${profile.maxSummons}`;
      const sp = summonPool(options);
      if (sp.unfedOnly) {
        const top = Math.max(...options.filter((o) => o.summon).map((o) => o.summonValue - o.cost));
        return `no corpse to consume (summon would be unfed): summon value ${r1(top)} < best other move ${r1(sp.alt)}`;
      }
      return 'no usable summon skill';
    }
    case 'shield':
      return profile.shieldBelowRatio <= 0 ? 'shieldBelowRatio is 0 (disabled)' : `no unshielded ally below ${profile.shieldBelowRatio} HP with a usable shield`;
    case 'taunt':
      return hasStatus(actor, 'taunt') ? 'already taunting' : battle.living(actor.side).length < 2 ? 'alone on the field' : 'no usable taunt skill';
    case 'guard':
      return (profile.guardBelowRatio ?? 0) <= 0 ? 'guardBelowRatio is 0 (disabled)' : `no unguarded ally below ${profile.guardBelowRatio} HP with a usable guard`;
    case 'burn':
      return 'no area mana burn worth it';
    case 'aoe': {
      const foes = battle.living(foeSide(actor)).length;
      return foes < profile.aoeMinTargets ? `living foes ${foes} < aoeMinTargets ${profile.aoeMinTargets}` : 'no usable area/all-enemies damage skill (or its HP cost is not affordable)';
    }
    case 'damage':
      return 'no damaging option (or HP cost not affordable)';
    case 'fallback':
      return 'no option has positive value';
  }
}

/**
 * Yapay zeka kararının açıklaması: aynı durumda chooseAction'ın verdiği kararı (final) ve değerlendirilen TÜM adayları, puanlarını,
 * elenme nedenlerini ve global skill değerlendirmesini verir. Saf ve belirleyici; motora ve RNG'ye dokunmaz, seçimi etkilemez:
 * karar chooseAction ile hesaplanır, açıklama o hesabın izinden (AiTrace) okunur. Yeni karar kuralı/öncelik eklenince burası da güncellenir.
 */
export function explainChoice(battle: Battle, actorUid: string, config: AiConfig): AiExplanation | null {
  const actor = battle.get(actorUid);
  if (!actor || actor.hp <= 0) return null;
  const profileName = config.profiles[actor.ai ?? config.defaultProfile] ? (actor.ai ?? config.defaultProfile) : config.defaultProfile;
  const profile = config.profiles[profileName];
  if (!profile) return null;
  const trace: AiTrace = { options: [], reserves: [], steps: [] };
  const choice = chooseAction(battle, actorUid, config, trace);
  const pick = trace.classPick ?? null;
  const skillName = (id: string) => battle.skill(id)?.name ?? battle.globalDef(id)?.name ?? id;
  const visibleFor = (priority: AiPriority | 'fallback') => (priority === 'kill' ? trace.options : trace.options.filter((o) => !o.blocked));

  const steps: AiExplanation['steps'] = trace.steps.map((s) =>
    s.option
      ? { priority: s.priority, result: 'picked', detail: `${skillName(s.option.skill.id)}${s.option.targetUid ? ` -> ${labelOf(battle, s.option.targetUid)}` : ''}` }
      : { priority: s.priority, result: 'none', detail: noPickReason(s.priority, battle, actor, profile, visibleFor(s.priority)) },
  );

  const winnerStep = pick ? trace.steps[trace.steps.length - 1] : undefined;
  const view = winnerStep ? pickerView(winnerStep.priority, actor, profile, winnerStep.priority === 'fallback' ? trace.options : visibleFor(winnerStep.priority)) : null;
  const candidates: AiCandidate[] = trace.options.map((o) => {
    const centerUid = o.anchorSlot !== undefined ? o.targets.find((t) => t.board === (o.board ?? foeSide(actor)) && t.slot === o.anchorSlot)?.uid : undefined;
    const previews = previewForTargets(battle, actor, o.skill.id, o.targets, centerUid);
    const perTarget = previews
      .filter((p) => p.damage)
      .slice(0, 8)
      .map((p) => ({ unit: labelOf(battle, p.uid), avg: r1(p.damage!.avg), hit: r2(p.damage!.hitChance), lethal: p.damage!.hpLoss >= (battle.get(p.uid)?.hp ?? Infinity) }));
    const firstHit = previews.find((p) => p.damage)?.damage;
    const c: AiCandidate = {
      skill: o.skill.id,
      name: o.skill.name,
      ...(o.targetUid ? { target: labelOf(battle, o.targetUid) } : {}),
      ...(o.anchorSlot !== undefined ? { center: o.anchorSlot, shape: shapeLabel(o.skill.area!), cells: o.cells ?? [] } : {}),
      hits: o.targets.map((t) => unitLabel(t)),
      enemyHits: o.targets.filter((t) => t.side !== actor.side).length,
      dmg: r1(o.damage),
      kills: o.kills.map(unitLabel),
      heal: r1(o.heal),
      selfHeal: r1(o.selfHeal),
      shield: r1(o.shield),
      burn: r1(o.burn),
      buff: r1(o.buff),
      ...(o.board ? { board: o.board === actor.side ? ('own' as const) : ('foe' as const) } : {}),
      ...(o.mitigation > 0 ? { mitigation: r1(o.mitigation) } : {}),
      revive: r1(o.revive),
      cost: r1(o.cost),
      net: r1((o.pureBuff ? o.buff : value(o)) - o.cost),
      ...(firstHit ? { hit: r2(firstHit.hitChance) } : {}),
      ...(perTarget.length > 0 ? { perTarget } : {}),
      ...(o.summon ? { summonValue: r1(o.summonValue) } : {}),
      ...(o.summonSlot !== undefined ? { summonSlot: o.summonSlot } : {}),
      ...corpseInfo(battle, o),
      tags: [o.summon && 'summon', o.empowered === true && 'empowered', o.empowered === false && 'unfed', o.taunt && 'taunt', o.guard && 'guard', o.pureBuff && 'selfBuff', o.hpCost && 'hpCost', o.skill.ai && 'hint'].filter((t): t is string => !!t),
      verdict: 'skipped',
    };
    const inPool = view?.pool.includes(o) ?? false;
    if (inPool) c.score = r1(view!.score(o));
    if (pick && o === pick.option) c.verdict = 'chosen';
    else if (inPool) c.verdict = 'lost';
    else if (o.blocked) {
      c.verdict = 'blocked';
      c.note = blockedReason(battle, actor, o, trace.reserves);
    } else c.note = !winnerStep ? 'no priority selected anything' : winnerStep.priority === 'damage' && o.damage > 0 ? 'not on the focus target (the damage priority only attacks the focus)' : `not in the pool of "${winnerStep.priority}"`;
    return c;
  });
  // Okunurluk: seçilen en üstte, sonra puanı yüksek olanlar, sonra elenenler
  const order = { chosen: 0, lost: 1, skipped: 2, blocked: 3 } as const;
  candidates.sort((a, b) => order[a.verdict] - order[b.verdict] || (b.score ?? b.net) - (a.score ?? a.net));

  const rejected: AiExplanation['rejected'] = [];
  for (const id of actor.skills) {
    const can = battle.canUse(actor.uid, id);
    if (!can.ok) rejected.push({ skill: id, name: skillName(id), reason: describeCanUse(battle, actor, id, can.reason) });
    else if (!trace.options.some((o) => o.skill.id === id)) rejected.push({ skill: id, name: skillName(id), reason: 'no valid target' });
  }

  const final = choice ? { skill: choice.skillId, name: skillName(choice.skillId), ...(choice.targetUid ? { target: labelOf(battle, choice.targetUid) } : {}), ...(choice.slot !== undefined ? { slot: choice.slot } : {}), ...(choice.board ? { board: choice.board === actor.side ? ('own' as const) : ('foe' as const) } : {}), ...(choice.corpseUid ? { corpse: labelOf(battle, choice.corpseUid) } : {}), reason: choice.reason } : null;
  const chosen = candidates.find((c) => c.verdict === 'chosen');
  const runnerUp = candidates.find((c) => c.verdict === 'lost');
  const tag = (c: AiCandidate) => `${c.name}${c.target ? ` -> ${c.target}` : ''}`;
  let why: string;
  if (!choice) why = 'No usable action: the turn is passed.';
  else if (choice.reason === 'rest' || choice.reason === 'skip' || choice.reason === 'move') {
    why = `Global skill "${skillName(choice.skillId)}": ${trace.global?.outcome ?? choice.reason}. ${chosen ? `The class move would have been ${tag(chosen)} (net ${chosen.net}).` : 'No class move was available.'}`;
  } else {
    why = `Priority "${choice.reason}" decided (${view?.rule ?? 'n/a'}): ${chosen ? `${tag(chosen)} score ${chosen.score ?? chosen.net}` : skillName(choice.skillId)}${runnerUp ? `; next best ${tag(runnerUp)} score ${runnerUp.score ?? runnerUp.net}` : ''}.`;
    if (trace.global?.gate) why += ` Global skills: ${trace.global.gate}.`;
    else if (trace.global?.outcome) why += ` Global skills: ${trace.global.outcome}.`;
  }
  const g = trace.global ?? { enabled: false };
  return {
    uid: actor.uid,
    actor: unitLabel(actor),
    profile: profileName,
    priorities: profile.priorities,
    focusRule: profile.focus,
    final,
    why,
    steps,
    ...(view ? { winnerRule: view.rule } : {}),
    candidates,
    rejected,
    reserves: trace.reserves.map((r) => ({ skill: r.skill, needMp: r.need, inTurns: r.turns })),
    global: { ...g, ...(g.move ? { move: { slot: g.move.slot, net: r1(g.move.net) } } : {}) },
  };
}

/** Çağrı adayının ceset bilgisi (açıklama): tüketilecek ceset (tehlike + gerekçe) ve seçilmeyen diğer cesetler. */
function corpseInfo(battle: Battle, o: Option): Pick<AiCandidate, 'corpse' | 'otherCorpses'> {
  const list = o.corpseOptions ?? [];
  const chosen = list.find((c) => c.uid === o.corpseUid);
  if (!chosen) return {};
  const others = list.filter((c) => c !== chosen).sort((a, b) => b.danger - a.danger || a.slot - b.slot);
  return {
    corpse: { unit: labelOf(battle, chosen.uid), danger: chosen.danger, why: chosen.why },
    ...(others.length > 0 ? { otherCorpses: others.map((c) => ({ unit: labelOf(battle, c.uid), danger: c.danger })) } : {}),
  };
}

function labelOf(battle: Battle, uid: string): string {
  const tile = /^tile:(\d+)$/.exec(uid);
  if (tile) return `cell ${tile[1]}`;
  const c = battle.get(uid);
  return c ? unitLabel(c) : uid;
}

/** Bir seçeneğin neden "blocked" olduğu (bağlam ipucu sağlanmadı ya da MP ayrıldı). */
function blockedReason(battle: Battle, actor: Combatant, o: Option, reserves: Reserve[]): string {
  const hint = o.skill.ai;
  if (hint?.requires) {
    const f = condFailure(hint.requires, battle, actor, o, undefined, true);
    if (f !== null) return `ai hint requires: ${f}`;
  }
  if (hint?.anyOf?.length && !hint.anyOf.some((c) => condHolds(c, battle, actor, o))) {
    return `ai hint anyOf: none holds (${hint.anyOf.map((c) => condFailure(c, battle, actor, o, undefined, true)).join(' | ')})`;
  }
  const r = reserves.find((x) => actor.mp - o.skill.cost.amount + actor.stats.mpRegen * x.turns < x.need);
  if (r) return `MP kept in reserve for ${battle.skill(r.skill)?.name ?? r.skill} (needs ${r.need} MP in ${r.turns} turn(s); would leave ${actor.mp - o.skill.cost.amount})`;
  return 'blocked';
}

function describeCanUse(battle: Battle, actor: Combatant, id: string, reason: string): string {
  const sk = battle.skill(id);
  if (reason === 'On cooldown') return `on cooldown (${actor.cooldowns[id] ?? 0} own turn(s) left)`;
  if (reason === 'Not enough MP' && sk) return `not enough MP (needs ${sk.cost.amount}, has ${actor.mp})`;
  if (reason === 'Not enough rage' && sk) return `not enough Rage (needs ${sk.cost.amount}, has ${actor.rage ?? 0})`;
  if (reason === 'Not enough HP' && sk) return `not enough HP (cost ${sk.cost.amount}, has ${actor.hp})`;
  return reason.charAt(0).toLowerCase() + reason.slice(1);
}
