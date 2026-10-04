import { describePassive } from './skill-info';
import { armorReduction } from './stats';
import type { CombatantDef, Formulas, SkillDef, Stats } from './types';

/** Arayüzde gösterilen stat türleri: 4 temel özellik, can/mana ve alt stat'lar. */
export type StatKind = 'hp' | 'mp' | 'str' | 'int' | 'dex' | 'luck' | 'spd' | 'critChance' | 'critMult' | 'armor' | 'magicArmor';

export interface StatInfo {
  title: string;
  lines: string[];
}

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

/** Bir stat'ın ne işe yaradığını ve şu anki etkisini anlatan tooltip metni (İngilizce). */
export function describeStat(kind: StatKind, stats: Stats, f: Formulas): StatInfo {
  const a = f.attributes;
  switch (kind) {
    case 'str':
      return {
        title: `Strength ${stats.str}`,
        lines: [
          `Max HP: +${a.hpPerStr} per point (now ${stats.hp})`,
          `Strength skills deal ${num(f.scaling.str)}x of STR as base damage`,
        ],
      };
    case 'int':
      return {
        title: `Intelligence ${stats.int}`,
        lines: [
          `Max MP: +${a.mpPerInt} per point (now ${stats.mp})`,
          `Intelligence skills (magic damage, heals, magic shields) use ${num(f.scaling.int)}x of INT`,
        ],
      };
    case 'dex':
      return {
        title: `Dexterity ${stats.dex}`,
        lines: [
          `Speed: +${num(a.spdPerDex)} per point (now ${stats.spd}); faster units act more often`,
          `Physical dodge: +${pct(a.dodgePerDex, 1)} per point (now ${pct(stats.dodge, 1)})`,
          `Dexterity skills deal ${num(f.scaling.dex)}x of DEX as base damage`,
        ],
      };
    case 'luck':
      return {
        title: `Luck ${stats.luck}`,
        lines: [
          `Crit chance: +${pct(a.critChancePerLuck, 1)} per point (now ${pct(stats.critChance, 1)})`,
          `Crit damage: +${pct(a.critMultPerLuck)} per point (now x${stats.critMult.toFixed(2)})`,
          'Crits are the final multiplier of damage and healing, never of shields',
        ],
      };
    case 'hp':
      return { title: `Health ${stats.hp}`, lines: [`Max HP comes from Strength (+${a.hpPerStr} per point)`, 'At 0 HP the unit falls'] };
    case 'mp':
      return { title: `Mana ${stats.mp}`, lines: [`Max MP comes from Intelligence (+${a.mpPerInt} per point)`, `Regenerates ${stats.mpRegen} at the start of each of its turns`] };
    case 'spd':
      return { title: `Speed ${stats.spd}`, lines: [`Comes from Dexterity (+${num(a.spdPerDex)} per point)`, 'Decides how soon the unit acts: higher speed means more turns'] };
    case 'critChance':
      return { title: `Crit chance ${pct(stats.critChance, 1)}`, lines: [`Base ${pct(a.critChanceBase)}, +${pct(a.critChancePerLuck, 1)} per Luck`, 'Applies to damage and healing, not shields'] };
    case 'critMult':
      return { title: `Crit damage x${stats.critMult.toFixed(2)}`, lines: [`Base x${num(a.critMultBase)}, +${pct(a.critMultPerLuck)} per Luck`, 'A crit multiplies the final damage or healing (after armor and all bonuses)'] };
    case 'armor': {
      const r = armorReduction(stats.armor, f);
      return {
        title: `Armor ${stats.armor}`,
        lines: [
          `Reduces physical damage taken by ${pct(r, 1)}`,
          `Diminishing returns: armor / (armor + ${f.armor.k}); 50% needs ${f.armor.k} armor`,
        ],
      };
    }
    case 'magicArmor': {
      const r = armorReduction(stats.magicArmor, f);
      return {
        title: `Magic armor ${stats.magicArmor}`,
        lines: [
          stats.magicArmor > 0 ? `Reduces magic damage taken by ${pct(r, 1)}` : 'No magic armor: magic damage is not reduced',
          `Diminishing returns: armor / (armor + ${f.armor.k}); rare, few classes have it`,
        ],
      };
    }
  }
}

/** Takım seçim ekranındaki class kartı için özet (İngilizce). */
export function describeClass(def: CombatantDef, skills: Record<string, SkillDef>, _f: Formulas): StatInfo {
  const s = def.stats;
  const names = def.skills.map((id) => skills[id]?.name ?? id).join(', ');
  const lines = [
    `STR ${s.str}   DEX ${s.dex}   INT ${s.int}   LUCK ${s.luck}`,
    `HP ${s.hp}   MP ${s.mp}   SPD ${s.spd}   Armor ${s.armor}${s.magicArmor > 0 ? `   Magic armor ${s.magicArmor}` : ''}   Crit ${pct(s.critChance, 1)} x${s.critMult.toFixed(2)}`,
    ...(def.passive ? [`Passive - ${def.passive.name}: ${describePassive(def.passive, def.stats, _f)}`] : []),
    `Skills: ${names}`,
  ];
  return { title: def.name, lines };
}
