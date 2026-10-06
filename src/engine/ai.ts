import type { Battle } from './battle';
import { betStake } from './gamble';
import { previewForTargets } from './preview';
import { armorReduction, attributePower } from './stats';
import type { Combatant, SkillAiCond, SkillDef } from './types';

/**
 * Yapay zeka: sırası gelen aktör için bir skill ve hedef seçer. Saf ve belirleyici:
 * rastgelelik kullanmaz, motorun RNG'sine dokunmaz; aynı durum = aynı karar.
 * Öncelikler ve eşikler data/ai.json profillerinden gelir (karakterin `ai` alanı profil seçer).
 * Etki tahmini önizlemeyle aynı hesaptır (src/engine/preview.ts): zırh, menzil, taunt, kalkan hepsi hesaba girer.
 */
export type AiPriority = 'kill' | 'heal' | 'tactic' | 'summon' | 'shield' | 'aoe' | 'damage' | 'taunt' | 'guard' | 'burn' | 'thorns';

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
  /** thorns: dikenli kalkan açmak için en az bu kadar yakın dövüşçü (motion 'melee' skill'i olan) canlı düşman olmalı. Varsayılan 1. */
  thornsMinMelee?: number;
}

export interface AiConfig {
  defaultProfile: string;
  profiles: Record<string, AiProfile>;
}

export interface AiChoice {
  skillId: string;
  /** Tek hedefli skill'lerde hedef; çoklu/kendine skill'lerde tanımsız. */
  targetUid?: string;
  /** Hangi öncelik bu kararı verdirdi ('fallback': hiçbiri uymadı, en değerlisi seçildi). */
  reason: AiPriority | 'fallback';
}

interface Option {
  skill: SkillDef;
  targetUid?: string;
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
  /** bonusPerMissingMana: ana hedefe eksik mana ekinin ham hasar içindeki payı (0-1). */
  missingManaShare: number;
  /** Saf self-buff skill'i (yalnızca kendine durum + kendine hasar): net değeri (can-eşdeğer; savunma + hasar artışı - bedel - kaçırılan hamle). */
  pureBuff: boolean;
  buff: number;
  /** Skill'in `ai` bağlam ipucu sağlanmıyor: bu seçenek yalnızca öldürücü vuruşta (ya da hiçbir şey uymazsa son çare olarak) seçilir. */
  blocked: boolean;
  summon: boolean;
  taunt: boolean;
  guard: boolean;
  thorns: boolean;
  cost: number;
  hpCost: boolean;
}

const ratio = (c: Combatant) => c.hp / c.maxHp;
const threat = (c: Combatant) => Math.max(c.stats.str, c.stats.int, c.stats.dex) + c.stats.spd;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const BURN_WEIGHT = 0.6;
/** Kararlı sıralama: eşitlikte seçenek sırası (skill sırası, hedef sırası) korunur. */
const best = <T>(items: T[], score: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((top, item) => (top === undefined || score(item) > score(top) ? item : top), undefined);

export function chooseAction(battle: Battle, actorUid: string, config: AiConfig): AiChoice | null {
  const actor = battle.get(actorUid);
  if (!actor || actor.hp <= 0) return null;
  const profile = config.profiles[actor.ai ?? config.defaultProfile] ?? config.profiles[config.defaultProfile];
  if (!profile) return null;

  const options = buildOptions(battle, actor, profile);
  if (options.length === 0) return null;
  // Bağlam ipucu (skill.ai) sağlanmayan seçenekler yalnızca öldürücü vuruşta (kill önceliği) aday olur
  const open = options.filter((o) => !o.blocked);

  for (const priority of profile.priorities) {
    const pick = PICKERS[priority](battle, actor, profile, priority === 'kill' ? options : open);
    if (pick) return toChoice(pick, priority);
  }
  // Hiçbir öncelik uymadıysa: değer katan en iyi seçenek; hiçbiri değer katmıyorsa pas geç.
  // Bağlamı sağlanmayan seçenekler en son çare: başka hiçbir şey yapılamıyorsa pas geçmektense onlardan biri oynanır.
  const pool = (list: Option[]) => best(list.filter((o) => value(o) > 0), (o) => value(o) - o.cost);
  const fallback = pool(open) ?? pool(options);
  return fallback ? toChoice(fallback, 'fallback') : null;
}

function toChoice(option: Option, reason: AiChoice['reason']): AiChoice {
  return { skillId: option.skill.id, ...(option.targetUid ? { targetUid: option.targetUid } : {}), reason };
}

const value = (o: Option) => o.damage + o.heal + o.selfHeal + o.shield * 0.5 + o.burn * BURN_WEIGHT + Math.max(0, o.buff);

function buildOptions(battle: Battle, actor: Combatant, profile: AiProfile): Option[] {
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
  for (const o of options) o.blocked = !hintHolds(battle, actor, o) || spendsReserve(actor, o, reserve);
  return options;
}

/**
 * MP ayırma: `reserveMp: N` ipuçlu bir skill (ör. Aimed Shot, Meteor) hazırsa ya da en geç N tur sonra hazır olacaksa, bağlamı
 * şu an mevcutsa (ipucu sağlanıyorsa) ve o zamana kadar yenilenmeyle MP'si ona yetebilecekse, onu yetersiz bırakacak SALDIRI harcamaları ertelenir. Şifa, kalkan, çağrı gibi
 * işlevsel skill'ler ve öldürücü vuruş (kill önceliği) etkilenmez. Skill'in gereken MP'si: bedeli ve (varsa) minSelfMpRatio x en yüksek MP.
 */
interface Reserve {
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
    if (skillOptions(battle, actor, id, profile).some((o) => hintHolds(battle, actor, o))) out.push({ need, turns });
  }
  return out;
}

function spendsReserve(actor: Combatant, o: Option, reserves: Reserve[]): boolean {
  const pureAttack = o.damage > 0 && o.heal === 0 && o.shield === 0 && o.burn === 0 && !o.summon && !o.taunt && !o.guard && !o.thorns;
  if (reserves.length === 0 || o.skill.ai || !pureAttack || o.skill.cost.resource !== 'mp' || o.skill.cost.amount <= 0) return false;
  return reserves.some((r) => actor.mp - o.skill.cost.amount + actor.stats.mpRegen * r.turns < r.need);
}

/** Bir skill'in tüm (hedef/alan) seçenekleri. Bekleme ve MP denetimi YAPMAZ (çağıran denetler). */
function skillOptions(battle: Battle, actor: Combatant, skillId: string, profile: AiProfile): Option[] {
  const skill = battle.skill(skillId)!;
  const candidates = battle.validTargets(actor.uid, skillId);
  if (candidates.length === 0) return [];
  const area = skill.target === 'area_enemies' || skill.target === 'column_enemies';
  // Yan vuruşlu (splash) tek hedef skill'inde grup = seçilen hedef + yanındakiler (ilk eleman seçilen hedeftir)
  const groups = area ? candidates.map((t) => battle.areaWindow(actor.uid, skillId, t.uid)) : battle.needsTargetChoice(skillId) ? candidates.map((t) => [t, ...battle.splashTargets(skillId, t)]) : [candidates];
  const anchors = candidates.map((t) => t.uid);
  const out: Option[] = [];
  for (const [gi, targets] of groups.entries()) {
    const targetUid = area ? anchors[gi] : battle.needsTargetChoice(skillId) ? targets[0]!.uid : undefined;
    out.push(evaluate(battle, actor, skill, targets, targetUid, profile));
  }
  return out;
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
  const attacking = ['single_enemy', 'area_enemies', 'column_enemies', 'all_enemies', 'random_enemies', 'everyone'];
  let total = 0;
  for (const foe of battle.living(foeSide(actor))) {
    let top = 0;
    for (const id of foe.skills) {
      const sk = battle.skill(id);
      if (!sk || !attacking.includes(sk.target)) continue;
      if (sk.cost.resource === 'mp' && foe.mp < sk.cost.amount) continue;
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

/** Bağlam koşulu (SkillAiCond) bu seçenek için sağlanıyor mu? Tanımlı tüm alanlar birlikte sağlanmalı. */
function condHolds(cond: SkillAiCond, battle: Battle, actor: Combatant, o: Option): boolean {
  const foes = battle.living(foeSide(actor));
  const allies = battle.living(actor.side);
  const enemyHits = o.targets.filter((t) => t.side !== actor.side).length;
  const primary = o.primary && o.primary.side !== actor.side ? o.primary : undefined;
  if (cond.kill && o.kills.length === 0) return false;
  if (cond.minTargets !== undefined && enemyHits < cond.minTargets) return false;
  if (cond.minLivingEnemies !== undefined && foes.length < cond.minLivingEnemies) return false;
  if (cond.minLivingAllies !== undefined && allies.length < cond.minLivingAllies) return false;
  if (cond.minSelfHpRatio !== undefined && ratio(actor) < cond.minSelfHpRatio) return false;
  if (cond.minSelfHpRatioAfter !== undefined && (actor.hp - selfHpCost(actor, o.skill)) / actor.maxHp < cond.minSelfHpRatioAfter) return false;
  if (cond.minSelfMpRatio !== undefined && (actor.maxMp <= 0 || actor.mp / actor.maxMp < cond.minSelfMpRatio)) return false;
  if (cond.minBattleTurns !== undefined && battle.turnsTaken < cond.minBattleTurns) return false;
  if (cond.minWoundedAllies !== undefined && allies.filter((c) => ratio(c) < (cond.woundedBelowRatio ?? 0.7)).length < cond.minWoundedAllies) return false;
  if (cond.minTargetArmorReduction !== undefined && (!primary || armorReduction(battle.effectiveStats(primary).armor, battle.formulas) < cond.minTargetArmorReduction)) return false;
  if (cond.minTargetHpToDamage !== undefined && (!primary || o.primaryAvg <= 0 || (primary.hp + primary.shield + primary.magicShield) / o.primaryAvg < cond.minTargetHpToDamage)) return false;
  if (cond.minMissingManaShare !== undefined && o.missingManaShare < cond.minMissingManaShare) return false;
  return true;
}

/** Skill'in `ai` ipucu bu durumda sağlanıyor mu (ipucu yoksa her zaman)? */
function hintHolds(battle: Battle, actor: Combatant, o: Option): boolean {
  const hint = o.skill.ai;
  if (!hint) return true;
  if (hint.requires && !condHolds(hint.requires, battle, actor, o)) return false;
  return !hint.anyOf?.length || hint.anyOf.some((c) => condHolds(c, battle, actor, o));
}

function evaluate(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[], targetUid: string | undefined, profile: AiProfile): Option {
  const previews = previewForTargets(battle, actor, skill.id, targets);
  const o: Option = {
    skill,
    ...(targetUid ? { targetUid } : {}),
    ...(targets[0] ? { primary: targets[0] } : {}),
    targets,
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
    thorns: skill.effects.some((e) => e.type === 'thorns'),
    cost: skill.cost.amount * (skill.cost.resource === 'mp' ? profile.mpCostWeight : profile.hpCostWeight),
    hpCost: (skill.cost.resource === 'hp' && skill.cost.amount > 0) || skill.effects.some((e) => e.type === 'damage' && e.bet?.resource === 'hp'),
  };
  // Bahis: kaybedilirse gidecek MP, bedele beklenen olarak eklenir (MP bahsi); can bahsi hpCost kuralıyla (düşük canda oynanmaz) sınırlanır
  for (const e of skill.effects) {
    if (e.type === 'damage' && e.bet?.resource === 'mp') {
      const mpLeft = skill.cost.resource === 'mp' && !battle.freeMp ? actor.mp - skill.cost.amount : actor.mp;
      o.cost += (1 - e.bet.winChance) * betStake(e.bet, actor.maxHp, actor.hp, mpLeft) * profile.mpCostWeight;
    }
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
      if (target === targets[0]) o.primaryAvg = p.damage.avg;
      // Beklenen hasar isabet şansıyla çarpılır; "öldürür" saymak için isabet şansı yeterince yüksek olmalı (formulas.json > hit.aiKillMin)
      o.damage += (p.damage.hpLoss + p.damage.absorbed) * p.damage.hitChance;
      if (p.damage.hpLoss >= target.hp && p.damage.hitChance >= battle.formulas.hit.aiKillMin) o.kills.push(target);
      if (lifesteal > 0 && !p.damage.splash) o.selfHeal += p.damage.hpLoss * p.damage.hitChance * lifesteal;
    }
    if (p.heal) o.heal += p.heal.avg;
    if (skill.effects.some((e) => e.type === 'revive')) o.revive += target.maxHp;
    if (p.hot) o.heal += p.hot.total;
    // Saldırı skill'inin kendine verdiği kalkan (Shield Bash) kalkan önceliğini tetiklemez
    if (p.shield && !['single_enemy', 'all_enemies', 'area_enemies', 'column_enemies'].includes(skill.target)) o.shield += p.shield.amount;
    if (p.burn) {
      o.burn += p.burn;
      o.burnScore += p.burn * Math.max(0.5, target.maxMp / 30); // mana havuzu büyük (büyücü) hedefte mana yakmak daha değerli
      o.burnTargets++;
    }
  }
  // Yerde kalan etki (zehir, yanan zemin, holy fire): alandaki düşmanların turlar boyunca alacağı beklenen hasar
  const anchor = targetUid ? battle.get(targetUid) : undefined;
  if (anchor && skill.target === 'area_enemies') {
    for (const e of skill.effects) {
      if (e.type !== 'ground') continue;
      const cells = new Set(battle.areaCells(skill.id, anchor.slot));
      const amount = Math.round(attributePower(actor.stats, e.scale, battle.formulas) * e.power);
      const standing = battle.living(anchor.side).filter((c) => c.board === anchor.board && cells.has(c.slot)).length;
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

type Picker = (battle: Battle, actor: Combatant, profile: AiProfile, options: Option[]) => Option | undefined;

/** Can ödeyen skill'ler için kullanıcının canı yeterince yüksek mi? (Öldürücü vuruşta bu kural yok.) */
const affordable = (actor: Combatant, profile: AiProfile) => (o: Option) =>
  !o.hpCost || ratio(actor) >= profile.minHpRatioForHpCost;

const hasStatus = (c: Combatant, kind: 'taunt' | 'guard' | 'regen' | 'thorns') => c.statuses.some((s) => s.kind === kind);

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

  // Yeterince çağrılmış birim yoksa çağır.
  summon: (battle, actor, profile, options) => {
    const alive = battle.combatants.filter((c) => c.side === actor.side && c.summoned && c.hp > 0).length;
    if (alive >= profile.maxSummons) return undefined;
    return best(options.filter((o) => o.summon), (o) => -o.cost);
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

  // Thorns: kendinde yoksa ve karşıda yeterince yakın dövüşçü varsa dikenli kalkan aç (yansıyan hasar yalnızca melee vuruşlara işler).
  thorns: (battle, actor, profile, options) => {
    if (hasStatus(actor, 'thorns')) return undefined;
    const melee = battle.living(actor.side === 'party' ? 'enemy' : 'party').filter((c) => c.skills.some((id) => battle.skill(id)?.motion === 'melee')).length;
    if (melee < (profile.thornsMinMelee ?? 1)) return undefined;
    return best(options.filter((o) => o.thorns), (o) => -o.cost);
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
