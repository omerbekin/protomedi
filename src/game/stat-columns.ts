import type { StatKind, Stats } from '../engine';

/**
 * Alt bardaki stat bloğunun düzeni (saf, Phaser'sız): avatar | ana özellikler (STR/DEX/INT/LUCK) | ATAK alt statları | DEFANS alt statları.
 * Ömer: avatar ve ana stat sütunu aynen kalır; türetilmiş statlar iki sütuna bölünür.
 */
export const MAIN_STATS: StatKind[] = ['str', 'dex', 'int', 'luck'];
/** Atak sütunu: kritik şansı, kritik hasar çarpanı, isabet, hız. */
export const ATTACK_STATS: StatKind[] = ['critChance', 'critMult', 'accuracy', 'spd'];
/** Defans sütunu: zırh, büyü zırhı, kaçınma, can ve mana yenilenmesi. */
export const DEFENSE_STATS: StatKind[] = ['armor', 'magicArmor', 'evasion', 'hpRegen', 'mpRegen'];

export interface StatBlockMetrics {
  /** Avatar kenarı (1:1). */
  avatar: number;
  avatarX: number;
  mainX: number;
  mainW: number;
  attackX: number;
  attackW: number;
  defenseX: number;
  defenseW: number;
  /** Bloğun sağ kenarı (x0'dan itibaren dahil). */
  right: number;
}

/** Sütun x/genişlikleri; `x0` bloğun sol kenarı. Tam bar ve hover bilgi kutusu aynı ölçüyü kullanır. */
export function statBlockMetrics(x0: number): StatBlockMetrics {
  const avatar = 142;
  const mainX = x0 + avatar + 14;
  const mainW = 140;
  const attackX = mainX + mainW;
  const attackW = 116;
  const defenseX = attackX + attackW;
  const defenseW = 104;
  return { avatar, avatarX: x0, mainX, mainW, attackX, attackW, defenseX, defenseW, right: defenseX + defenseW };
}

/** `count` satırı `top`..`top + height` arasına eşit aralıkla dizer: her satırın orta y'si. */
export function rowCenters(count: number, top: number, height: number): number[] {
  const step = height / count;
  return Array.from({ length: count }, (_, i) => top + step * (i + 0.5));
}

const trim = (v: number, digits: number) => v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

/** Bir stat satırının kısa yazısı (alt bar ve hover kutusu). */
export function statRowText(k: StatKind, s: Stats, label: Record<StatKind, string>): string {
  switch (k) {
    case 'str': case 'int': case 'dex': case 'luck': return `${label[k]} ${s[k]}`;
    case 'spd': return `SPD ${s.spd}`;
    case 'critChance': return `CRIT ${trim(s.critChance * 100, 1)}%`;
    case 'critMult': return `CDMG x${trim(s.critMult, 2)}`;
    case 'accuracy': return `ACC ${Math.round(s.accuracy * 100)}%`;
    case 'evasion': return `EVA ${Math.round(s.evasion * 100)}%`;
    case 'armor': return `ARM ${Math.round(s.armor)}`;
    case 'magicArmor': return `M.ARM ${Math.round(s.magicArmor)}`;
    case 'hpRegen': return `HP+${Math.round(s.hpRegen)}/t`;
    case 'mpRegen': return `MP+${Math.round(s.mpRegen)}/t`;
    default: return '';
  }
}
