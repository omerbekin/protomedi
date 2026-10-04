import type { Battle } from './battle';
import { expectedDamage, expectedHeal } from './formulas';
import type { Combatant, SkillDef } from './types';

/**
 * Yapay zeka: sırası gelen aktör için bir skill ve hedef seçer. Saf ve belirleyici:
 * rastgelelik kullanmaz, motorun RNG'sine dokunmaz; aynı durum = aynı karar.
 * Öncelikler ve eşikler data/ai.json profillerinden gelir (karakterin `ai` alanı profil seçer).
 */
export type AiPriority = 'kill' | 'heal' | 'summon' | 'shield' | 'aoe' | 'damage';

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
  /** Hedeflerin canı/kalkanıyla sınırlı toplam beklenen hasar (fazla vuruş sayılmaz). */
  damage: number;
  kills: Combatant[];
  heal: number;
  selfHeal: number;
  shield: number;
  summon: boolean;
  cost: number;
  hpCost: boolean;
}

const ratio = (c: Combatant) => c.hp / c.maxHp;
const threat = (c: Combatant) => Math.max(c.stats.atk, c.stats.mag) + c.stats.spd;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
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

const value = (o: Option) => o.damage + o.heal + o.selfHeal + o.shield * 0.5;

function buildOptions(battle: Battle, actor: Combatant, profile: AiProfile): Option[] {
  const options: Option[] = [];
  for (const skillId of actor.skills) {
    if (!battle.canUse(actor.uid, skillId).ok) continue;
    const skill = battle.skill(skillId)!;
    const candidates = battle.validTargets(actor.uid, skillId);
    if (candidates.length === 0) continue;
    const groups = battle.needsTargetChoice(skillId) ? candidates.map((t) => [t]) : [candidates];
    for (const targets of groups) {
      const targetUid = battle.needsTargetChoice(skillId) ? targets[0]!.uid : undefined;
      options.push(evaluate(battle, actor, skill, targets, targetUid, profile));
    }
  }
  return options;
}

function evaluate(
  battle: Battle,
  actor: Combatant,
  skill: SkillDef,
  targets: Combatant[],
  targetUid: string | undefined,
  profile: AiProfile,
): Option {
  const o: Option = {
    skill,
    ...(targetUid ? { targetUid } : {}),
    targets,
    damage: 0,
    kills: [],
    heal: 0,
    selfHeal: 0,
    shield: 0,
    summon: false,
    cost: skill.cost.amount * (skill.cost.resource === 'mp' ? profile.mpCostWeight : profile.hpCostWeight),
    hpCost: skill.cost.resource === 'hp' && skill.cost.amount > 0,
  };
  for (const effect of skill.effects) {
    for (const t of targets) {
      if (effect.type === 'damage') {
        const bonus = effect.bonusVsTag && t.tags.includes(effect.bonusVsTag.tag) ? effect.bonusVsTag.multiplier : 1;
        const est = expectedDamage(effect.damageType, actor.stats, t.stats, effect.power * bonus, battle.formulas, effect.ignoreDefense ?? 0);
        const effective = t.hp + t.shield;
        const dealt = Math.min(est, effective);
        o.damage += dealt;
        if (est >= effective) o.kills.push(t);
        if (effect.lifesteal) o.selfHeal += Math.min(Math.round(dealt * effect.lifesteal), actor.maxHp - actor.hp);
      } else if (effect.type === 'heal') {
        o.heal += Math.min(expectedHeal(actor.stats, effect.power, battle.formulas), t.maxHp - t.hp);
      } else if (effect.type === 'shield') {
        o.shield += Math.round(actor.stats[effect.stat] * effect.power);
      }
    }
    if (effect.type === 'summon') o.summon = true;
  }
  return o;
}

type Picker = (battle: Battle, actor: Combatant, profile: AiProfile, options: Option[]) => Option | undefined;

/** Can ödeyen skill'ler için kullanıcının canı yeterince yüksek mi? (Öldürücü vuruşta bu kural yok.) */
const affordable = (actor: Combatant, profile: AiProfile) => (o: Option) =>
  !o.hpCost || ratio(actor) >= profile.minHpRatioForHpCost;

const PICKERS: Record<AiPriority, Picker> = {
  // Birini öldürebilen en iyi seçenek: en tehlikeli düşmanları öldüren, sonra en ucuz olan.
  kill: (_b, _a, _p, options) => {
    const killers = options.filter((o) => o.kills.length > 0);
    return best(killers, (o) => sum(o.kills.map(threat)) * 1000 - o.cost);
  },

  // Dostlardan biri eşiğin altındaysa, o dostu içeren en verimli şifa.
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
    const needs = (c: Combatant) => c.shield === 0 && ratio(c) < profile.shieldBelowRatio;
    const shielders = options.filter((o) => o.shield > 0 && o.targets.some(needs));
    return best(shielders, (o) => o.shield - o.cost + (1 - ratio(o.targets[0]!)) * 50);
  },

  // Yeterince düşman varsa herkese vuran en verimli skill.
  aoe: (battle, actor, profile, options) => {
    if (battle.living(actor.side === 'party' ? 'enemy' : 'party').length < profile.aoeMinTargets) return undefined;
    const aoes = options.filter((o) => o.skill.target === 'all_enemies' && o.damage > 0).filter(affordable(actor, profile));
    return best(aoes, (o) => o.damage - o.cost);
  },

  // Odak hedefe (profil: en az can / en düşük can oranı) en verimli hasar; herkese vuran skill de aday.
  damage: (battle, actor, profile, options) => {
    const damaging = options.filter((o) => o.damage > 0).filter(affordable(actor, profile));
    if (damaging.length === 0) return undefined;
    const enemies = battle.living(actor.side === 'party' ? 'enemy' : 'party');
    const focus = best(enemies, (c) => (profile.focus === 'lowest_hp' ? -(c.hp + c.shield) : -ratio(c)));
    const onFocus = damaging.filter((o) => o.skill.target === 'all_enemies' || o.targets[0] === focus);
    return best(onFocus.length > 0 ? onFocus : damaging, (o) => o.damage + o.selfHeal - o.cost);
  },
};
