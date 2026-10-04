import type { Battle } from './battle';
import { previewForTargets } from './preview';
import { attributePower } from './stats';
import type { Combatant, SkillDef } from './types';

/**
 * Yapay zeka: sırası gelen aktör için bir skill ve hedef seçer. Saf ve belirleyici:
 * rastgelelik kullanmaz, motorun RNG'sine dokunmaz; aynı durum = aynı karar.
 * Öncelikler ve eşikler data/ai.json profillerinden gelir (karakterin `ai` alanı profil seçer).
 * Etki tahmini önizlemeyle aynı hesaptır (src/engine/preview.ts): zırh, menzil, taunt, kalkan hepsi hesaba girer.
 */
export type AiPriority = 'kill' | 'heal' | 'summon' | 'shield' | 'aoe' | 'damage' | 'taunt' | 'guard' | 'burn';

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
  /** 4. (güçlü) skill'e verilen puan çarpanı: mantıklıysa (değer katıyorsa) önceliklendirilir. Varsayılan 1,5. */
  ultimateWeight?: number;
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
  /** Mana yakmanın değeri: yakılan mana, hedefin mana havuzuyla (büyücüler) ağırlıklanır. */
  burnScore: number;
  /** 4. (güçlü) skill mi. */
  ultimate: boolean;
  summon: boolean;
  taunt: boolean;
  guard: boolean;
  cost: number;
  hpCost: boolean;
}

const ratio = (c: Combatant) => c.hp / c.maxHp;
const threat = (c: Combatant) => Math.max(c.stats.str, c.stats.int, c.stats.dex) + c.stats.spd;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const BURN_WEIGHT = 0.6;
/** 4. (güçlü) skill'in puan çarpanı. */
const ult = (profile: AiProfile, o: Option) => (o.ultimate ? profile.ultimateWeight ?? 1.5 : 1);
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

  for (const priority of profile.priorities) {
    const pick = PICKERS[priority](battle, actor, profile, options);
    if (pick) return toChoice(pick, priority);
  }
  // Hiçbir öncelik uymadıysa: değer katan en iyi seçenek; hiçbiri değer katmıyorsa pas geç.
  const fallback = best(options.filter((o) => value(o) > 0), (o) => value(o) - o.cost);
  return fallback ? toChoice(fallback, 'fallback') : null;
}

function toChoice(option: Option, reason: AiChoice['reason']): AiChoice {
  return { skillId: option.skill.id, ...(option.targetUid ? { targetUid: option.targetUid } : {}), reason };
}

const value = (o: Option) => o.damage + o.heal + o.selfHeal + o.shield * 0.5 + o.burn * BURN_WEIGHT;

function buildOptions(battle: Battle, actor: Combatant, profile: AiProfile): Option[] {
  const options: Option[] = [];
  for (const skillId of actor.skills) {
    if (!battle.canUse(actor.uid, skillId).ok) continue;
    const skill = battle.skill(skillId)!;
    const candidates = battle.validTargets(actor.uid, skillId);
    if (candidates.length === 0) continue;
    const area = skill.target === 'area_enemies' || skill.target === 'column_enemies';
    const groups = area ? candidates.map((t) => battle.areaWindow(actor.uid, skillId, t.uid)) : battle.needsTargetChoice(skillId) ? candidates.map((t) => [t]) : [candidates];
    const anchors = candidates.map((t) => t.uid);
    for (const [gi, targets] of groups.entries()) {
      const targetUid = area ? anchors[gi] : battle.needsTargetChoice(skillId) ? targets[0]!.uid : undefined;
      options.push(evaluate(battle, actor, skill, targets, targetUid, profile));
    }
  }
  return options;
}

function evaluate(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[], targetUid: string | undefined, profile: AiProfile): Option {
  const previews = previewForTargets(battle, actor, skill.id, targets);
  const o: Option = {
    skill,
    ...(targetUid ? { targetUid } : {}),
    targets,
    damage: 0,
    kills: [],
    heal: 0,
    selfHeal: 0,
    shield: 0,
    burn: 0,
    burnTargets: 0,
    burnScore: 0,
    ultimate: actor.skills.indexOf(skill.id) === 3,
    summon: skill.effects.some((e) => e.type === 'summon'),
    taunt: skill.effects.some((e) => e.type === 'taunt'),
    guard: skill.effects.some((e) => e.type === 'guard'),
    cost: skill.cost.amount * (skill.cost.resource === 'mp' ? profile.mpCostWeight : profile.hpCostWeight),
    hpCost: skill.cost.resource === 'hp' && skill.cost.amount > 0,
  };
  const lifesteal = Math.max(0, ...skill.effects.map((e) => (e.type === 'damage' ? (e.lifesteal ?? 0) : 0)));
  for (const p of previews) {
    const target = battle.get(p.uid);
    if (!target) continue;
    if (p.damage) {
      o.damage += p.damage.hpLoss + p.damage.absorbed;
      if (p.damage.hpLoss >= target.hp) o.kills.push(target);
      if (lifesteal > 0 && !p.damage.splash) o.selfHeal += p.damage.hpLoss * lifesteal;
    }
    if (p.heal) o.heal += p.heal.avg;
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

const hasStatus = (c: Combatant, kind: 'taunt' | 'guard' | 'regen') => c.statuses.some((s) => s.kind === kind);

const PICKERS: Record<AiPriority, Picker> = {
  // Birini öldürebilen en iyi seçenek: en tehlikeli düşmanları öldüren, sonra en ucuz olan.
  kill: (_b, _a, _p, options) => {
    const killers = options.filter((o) => o.kills.length > 0);
    return best(killers, (o) => sum(o.kills.map(threat)) * 1000 - o.cost);
  },

  // Dostlardan biri eşiğin altındaysa, o dostu içeren en verimli şifa (anlık veya tur bazlı).
  heal: (_b, actor, profile, options) => {
    const hurt = (c: Combatant) => ratio(c) < profile.healBelowRatio;
    if (profile.healBelowRatio <= 0) return undefined;
    const healers = options.filter((o) => o.heal > 0 && o.targets.some(hurt));
    return best(healers, (o) => o.heal - o.cost + (o.targets.length === 1 ? (1 - ratio(o.targets[0] ?? actor)) * 10 : 0));
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
    return best(aoes, (o) => o.damage * ult(profile, o) - o.cost);
  },

  // Odak hedefe (profil: en az can / en düşük can oranı) en verimli hasar; herkese vuran skill de aday.
  damage: (_b, actor, profile, options) => {
    const damaging = options.filter((o) => o.damage > 0).filter(affordable(actor, profile));
    if (damaging.length === 0) return undefined;
    // Odak, vurulabilecek (menzil ve taunt'a uyan) düşmanlar arasından seçilir
    const reachable = new Map<string, Combatant>();
    for (const o of damaging) for (const t of o.targets) reachable.set(t.uid, t);
    const focus = best([...reachable.values()], (c) => (profile.focus === 'lowest_hp' ? -(c.hp + c.shield + c.magicShield) : -ratio(c)));
    const onFocus = damaging.filter((o) => (o.skill.target === 'all_enemies' || (o.skill.target === 'single_enemy' ? o.targets[0] === focus : o.targets.includes(focus!))));
    return best(onFocus.length > 0 ? onFocus : damaging, (o) => (o.damage + o.selfHeal + o.burn * BURN_WEIGHT) * ult(profile, o) - o.cost);
  },
};
