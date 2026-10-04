import { attributePower } from './stats';
import type { Attribute, CombatantDef, Element, Formulas, GroundDef, PassiveDef, SkillDef, SkillTarget, Stats, StatusDef } from './types';

/** Skill'in oyuncuya gösterilen genel bilgileri (tooltip). Metinler İngilizce (oyun içi arayüz). */
export interface SkillInfo {
  name: string;
  target: string;
  cost: string;
  cooldown: string;
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
      return `You and the allies right next to you (front, back, left, right) gain +${e.armor} armor.`;
  }
}

export function describeSkill(skill: SkillDef, stats: Stats, formulas: Formulas, units: Record<string, CombatantDef> = {}, defs: EffectDefs = {}): SkillInfo {
  const lines: string[] = [];
  const kinds: SkillInfo['kinds'] = [];
  const add = (text: string, kind?: SkillInfo['kinds'][number]) => {
    lines.push(text);
    kinds.push(kind);
  };
  let canCrit = false;
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
      canCrit = true;
      const element = e.element ?? 'physical';
      add(`Damage ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${times > 1 ? ` x${times}` : ''}${who}`, element);
      if (e.ignoreDefense) add(`Ignores ${pct(e.ignoreDefense)} of armor`);
      if (e.lifesteal) add(`Heals you for ${pct(e.lifesteal)} of damage dealt`);
      if (e.bonusVsTag) add(`x${e.bonusVsTag.multiplier} vs ${e.bonusVsTag.tag}`);
      if (e.falloff) add(`Each target hit takes ${pct(1 - e.falloff)} less damage than the previous one`);
      if (e.bonusPerMissingMana) add(`+${e.bonusPerMissingMana} per missing mana of the target`, element);
      if (e.bonusFromShield) add(`+${pct(e.bonusFromShield.ratio)} of your shield${e.bonusFromShield.consume ? ' (consumed)' : ''}`, element);
    } else if (e.type === 'heal') {
      canCrit = true;
      add(`Heal ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${who}`);
    } else if (e.type === 'revive') {
      add(`Revives the ally where it fell with ${pct(e.hpRatio)} HP and ${pct(e.mpRatio)} MP`);
    } else if (e.type === 'hot') {
      canCrit = true;
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
      add(`Burns ${e.amount} MP${e.gainRatio ? `, you gain ${pct(e.gainRatio)} of it` : ''}`);
    } else if (e.type === 'taunt') {
      add(`Taunt ${e.turns} turns: enemies must target you${e.breakRatio ? ` (ends after losing ${pct(e.breakRatio)} HP)` : ''}`);
      if (e.allyDamageMult !== undefined) add(`Your allies take ${pct(1 - e.allyDamageMult)} less damage while it lasts`);
    } else if (e.type === 'status') {
      const def = defs.statuses?.[e.status];
      add(`${e.self ? 'You gain' : 'Applies'} ${def?.name ?? e.status} for ${e.turns} turn${e.turns > 1 ? 's' : ''}${def ? `: ${def.text}` : ''}`, undefined);
    } else if (e.type === 'ground') {
      const g = defs.grounds?.[e.ground];
      add(`Leaves ${g?.name ?? e.ground} on the area for ${e.turns} turns: ${raw(e.scale, e.power)} damage at the start of each enemy turn there`, g?.element);
    } else if (e.type === 'selfDamage') {
      add(`Costs you ${pct(e.ratio)} of your max HP`);
    } else if (e.type === 'guard') {
      add(`Guard ${e.turns} turns: take ${pct(e.share)} of the damage ally takes`);
    }
  }
  if (skill.motion === 'melee' && skill.target !== 'self') add(skill.ignoreReach ? 'Charges at any enemy' : skill.reach ? `Melee: front ${skill.reach + 1} rows only (reach +${skill.reach})` : 'Melee: front row only');
  if (canCrit) add(`Crit ${(stats.critChance * 100).toFixed(1).replace(/\.0$/, '')}% x${stats.critMult.toFixed(2)}`);
  const { resource, amount } = skill.cost;
  return {
    name: skill.name,
    target: skill.target === 'area_enemies' ? `Area (radius ${skill.area?.radius ?? 1})` : skill.target === 'random_enemies' ? `${skill.count ?? 3} random enemies` : TARGET_TEXT[skill.target],
    cost: amount > 0 ? `${amount} ${resource.toUpperCase()}` : 'Free',
    cooldown: (skill.cooldown ?? 0) > 0 ? `${skill.cooldown} turns` : 'None',
    lines,
    kinds,
  };
}
