import { betMultipliers, betStake } from './gamble';
import { attributePower } from './stats';
import type { Attribute, CombatantDef, Element, Formulas, GroundDef, PassiveDef, SkillDef, SkillTarget, Stats, StatusDef } from './types';

/** Skill'in oyuncuya gösterilen genel bilgileri (tooltip). Metinler İngilizce (oyun içi arayüz). */
export interface SkillInfo {
  name: string;
  target: string;
  /** Kısa hedef türü rozeti: Self / AoE / Single Target / Column / Random / ... */
  targetBadge: string;
  cost: string;
  cooldown: string;
  /** Savaş başında bu skill bekleme sayacıyla başlıyorsa tek satır ('Opens on cooldown: 3 turns'), yoksa boş. Yalnızca turns modunda gösterilir. */
  initialCooldown: string;
  /** Etki satırları: hasar ölçeği, şifa, kalkan, çağrı, menzil ve ek kurallar. */
  lines: string[];
  /** `lines` ile aynı sırada: satırın rengini belirleyen element ('shield' / 'magicShield' kalkan satırları). */
  kinds: Array<Element | 'shield' | 'magicShield' | undefined>;
}

export const TARGET_TEXT: Record<SkillTarget, string> = {
  single_enemy: 'One enemy',
  all_enemies: 'All enemies',
  area_enemies: 'Area',
  column_enemies: 'Column',
  single_ally: 'One ally',
  dead_ally: 'One fallen ally',
  all_allies: 'All allies',
  everyone: 'Everyone',
  random_enemies: 'Random enemies',
  self: 'Self',
};

/** Sağ üst rozet için kısa hedef türü (tooltip düzeni). */
export const TARGET_BADGE: Record<SkillTarget, string> = {
  single_enemy: 'Single Target',
  all_enemies: 'All Enemies',
  area_enemies: 'AoE',
  column_enemies: 'Column',
  single_ally: 'Single Ally',
  dead_ally: 'Dead Ally',
  all_allies: 'All Allies',
  everyone: 'Everyone',
  random_enemies: 'Random',
  self: 'Self',
};

/** Rozet metni: alan skill'inde yarıçap ("AoE · r1"), rastgele skill'de hedef sayısı ("Random · 3") rozette yazar, açıklamada değil. */
export function targetBadge(skill: SkillDef): string {
  if (skill.target === 'area_enemies') return `${TARGET_BADGE.area_enemies} · r${skill.area?.radius ?? 1}`;
  if (skill.target === 'random_enemies') return `${TARGET_BADGE.random_enemies} · ${skill.count ?? 3}`;
  return TARGET_BADGE[skill.target];
}

export const ATTRIBUTE_NAME: Record<Attribute, string> = { str: 'STR', int: 'INT', dex: 'DEX', luck: 'LUCK' };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Buff/debuff ve yer etkisi adlarını metinlere çevirmek için tanımlar (data/statuses.json, data/grounds.json). */
export interface EffectDefs {
  statuses?: Record<string, StatusDef>;
  grounds?: Record<string, GroundDef>;
}

/** Pasifin oyuncuya gösterilen açıklaması; değerler sahibinin stat'larından hesaplanır. */
export function describePassive(passive: PassiveDef, stats: Stats, formulas: Formulas): string {
  const e = passive.effect;
  const val = (scale: Attribute, power: number) => Math.round(attributePower(stats, scale, formulas) * power);
  switch (e.type) {
    case 'rage':
      return `The lower your HP, the harder you hit: up to +${pct(e.maxBonus)} damage at the brink of death.`;
    case 'divineLight':
      return `At the start of your turn, heal the most wounded ally for ${val(e.scale, e.power)} (${pct(e.power)} of ${ATTRIBUTE_NAME[e.scale]}).`;
    case 'spellEcho':
      return `Damaging spells with a cooldown have a ${pct(e.chance)} chance to be ready again immediately.`;
    case 'longshot':
      return `Deal +${pct(e.perRow)} damage for every row of distance between you and your target (your row + their row).`;
    case 'verdantBlessing':
      return `Whenever you summon, all wounded allies are healed for ${val(e.scale, e.power)} (${pct(e.power)} of ${ATTRIBUTE_NAME[e.scale]}).`;
    case 'soulDrain':
      return `Heal for ${pct(e.ratio)} of all damage you deal (damage dealt by your summons counts too).`;
    case 'manaOverflow':
      return `Magic damage blocked by your magic armor builds up; every ${e.threshold} blocked, your whole team gains ${e.mana} MP.`;
    case 'armorAura':
      return `You and the allies right next to you (front, back, left, right) gain bonus armor equal to ${pct(e.pct)} of your own armor (+${Math.round(stats.armor * e.pct)} now). A unit benefits from at most ${e.maxStacks} such auras.`;
  }
}

export function describeSkill(skill: SkillDef, stats: Stats, formulas: Formulas, units: Record<string, CombatantDef> = {}, defs: EffectDefs = {}): SkillInfo {
  const lines: string[] = [];
  const kinds: SkillInfo['kinds'] = [];
  const add = (text: string, kind?: SkillInfo['kinds'][number]) => {
    lines.push(text);
    kinds.push(kind);
  };
  // Aynı etki art arda tekrar ediyorsa (Double Strike: iki vuruş) tek satır + 'x2'
  const effects: Array<{ e: SkillDef['effects'][number]; times: number }> = [];
  for (const e of skill.effects) {
    const last = effects[effects.length - 1];
    if (last && JSON.stringify(last.e) === JSON.stringify(e) && e.type === 'damage') last.times++;
    else effects.push({ e, times: 1 });
  }
  for (const { e, times } of effects) {
    const who = skill.target === 'everyone' ? ((e.side ?? (e.type === 'heal' || e.type === 'hot' || e.type === 'shield' || e.type === 'guard' ? 'allies' : 'enemies')) === 'allies' ? ' (allies)' : ' (enemies)') : '';
    const raw = (scale: Attribute, power: number) => Math.round(attributePower(stats, scale, formulas) * power);
    if (e.type === 'damage') {
      const element = e.element ?? 'physical';
      add(`Damage ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${times > 1 ? ` x${times}` : ''}${who}`, element);
      if (e.ignoreDefense) add(`Ignores ${pct(e.ignoreDefense)} of armor`);
      if (e.lifesteal) add(`Heals you for ${pct(e.lifesteal)} of damage dealt`);
      if (e.bonusVsTag) add(`x${e.bonusVsTag.multiplier} vs ${e.bonusVsTag.tag}`);
      if (e.falloff) add(`Each target hit takes ${pct(1 - e.falloff)} less damage than the previous one`);
      if (e.bonusPerMissingMana) add(`+${e.bonusPerMissingMana} per missing mana of the target`, element);
      if (e.repeatChance) add(`${pct(e.repeatChance)} chance to hit twice`, element);
      if (e.bet) {
        const b = e.bet;
        const stake = betStake(b, stats.hp, stats.hp, Math.max(0, stats.mp - (skill.cost.resource === 'mp' ? skill.cost.amount : 0)));
        const m = betMultipliers(b, stake);
        const what = b.resource === 'hp' ? `${pct(b.ratio)} of your max HP (${stake})` : b.ratio >= 1 ? 'all your remaining MP' : `${pct(b.ratio)} of your remaining MP`;
        const win = b.perStake ? `x${(b.winMult).toFixed(1).replace(/.0$/, '')} damage, +${b.perStake} per ${b.resource.toUpperCase()} bet` : `x${m.win.toFixed(1).replace(/.0$/, '')} damage`;
        const lose = m.lose <= 0 ? 'you miss' : `x${m.lose.toFixed(1).replace(/.0$/, '')} damage`;
        add(`Bet ${what}: ${pct(b.winChance)} chance for ${win}; otherwise ${lose} and you lose the bet`, element);
      }
      if (e.bonusFromShield) add(`+${pct(e.bonusFromShield.ratio)} of your shield${e.bonusFromShield.consume ? ' (consumed)' : ''}`, element);
    } else if (e.type === 'heal') {
      add(`Heal ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${who}`);
    } else if (e.type === 'revive') {
      add(`Revives the ally where it fell with ${pct(e.hpRatio)} HP and ${pct(e.mpRatio)} MP`);
    } else if (e.type === 'hot') {
      add(`Heal ${raw(e.scale, e.power)} per turn for ${e.turns} turns`);
    } else if (e.type === 'shield') {
      const magic = e.shieldType === 'magic';
      add(`${magic ? 'Magic shield' : 'Shield'} ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${e.self ? ' on you' : ''}`, magic ? 'magicShield' : 'shield');
      if (e.bonusPerMana) add(`+${e.bonusPerMana} per MP left after casting`, magic ? 'magicShield' : 'shield');
    } else if (e.type === 'summon') {
      const unit = units[e.unit];
      const life = e.lifespan ? ` for ${e.lifespan} turns` : '';
      add(unit ? `Summons ${unit.name} (HP ${unit.stats.hp})${life}` : `Summons ${e.unit}${life}`);
      add(`Summons take x${formulas.summon.damageTakenMultiplier} damage`);
    } else if (e.type === 'manaBurn') {
      add(e.gainRatio ? `Steals ${e.amount} MP: you gain ${pct(e.gainRatio)} of it` : `Burns ${e.amount} MP`);
    } else if (e.type === 'taunt') {
      add(`Taunt ${e.turns} turns: enemies must target you${e.breakRatio ? ` (ends after losing ${pct(e.breakRatio)} HP)` : ''}`);
      if (e.allyDamageMult !== undefined) add(`Your allies take ${pct(1 - e.allyDamageMult)} less damage while it lasts`);
    } else if (e.type === 'status') {
      const def = defs.statuses?.[e.status];
      add(`${e.self ? 'You gain' : 'Applies'} ${def?.name ?? e.status} for ${e.turns} turn${e.turns > 1 ? 's' : ''}${def ? `: ${def.text}` : ''}`, undefined);
    } else if (e.type === 'randomStatus') {
      const total = e.options.reduce((a, o) => a + o.weight, 0);
      add(`Random effect on each target hit: ${e.options.map((o) => `${defs.statuses?.[o.status]?.name ?? o.status} ${o.turns} turn${o.turns > 1 ? 's' : ''} (${pct(o.weight / total)})`).join(', ')}`);
    } else if (e.type === 'ground') {
      const g = defs.grounds?.[e.ground];
      add(`Leaves ${g?.name ?? e.ground} on the area for ${e.turns} turns: ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)}) damage at the start of each enemy turn there`, g?.element);
    } else if (e.type === 'thorns') {
      add(`Thorns ${e.turns} turns: melee attackers take ${raw(e.scale, e.power)} (${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]}) damage back (armor applies, never misses; reflected damage is not reflected again)`, 'physical');
    } else if (e.type === 'selfDamage') {
      add(`Costs you ${pct(e.ratio)} of your max HP`);
    } else if (e.type === 'guard') {
      add(`Guard ${e.turns} turns: take ${pct(e.share)} of the damage ally takes`);
    }
  }
  if (skill.splash && skill.target === 'single_enemy') add(`Also hits the units beside the target (the neighbors above and below it on screen) for ${pct(skill.splash.mult ?? 1)} damage`, 'physical');
  if (skill.motion === 'melee' && skill.target !== 'self') add(skill.ignoreReach ? 'Charges at any enemy' : skill.reach ? `Melee: front ${skill.reach + 1} rows only (reach +${skill.reach})` : 'Melee: front row only');
  const { resource, amount } = skill.cost;
  const initialTurns = Math.min(formulas.cooldown?.maxInitial ?? 0, Math.floor(skill.initialCooldown ?? 0));
  return {
    name: skill.name,
    target: skill.target === 'area_enemies' ? `Area (radius ${skill.area?.radius ?? 1})` : skill.target === 'random_enemies' ? `${skill.count ?? 3} random enemies` : TARGET_TEXT[skill.target],
    targetBadge: targetBadge(skill),
    cost: amount > 0 ? `${amount} ${resource.toUpperCase()}` : 'Free',
    cooldown: (skill.cooldown ?? 0) > 0 ? `${skill.cooldown} turns` : 'None',
    initialCooldown: initialTurns > 0 ? `Opens on cooldown: ${initialTurns} turn${initialTurns > 1 ? 's' : ''}` : '',
    lines,
    kinds,
  };
}
