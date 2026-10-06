import type { StatKind } from '../engine';
import type { IconKind } from './icon-kinds';

/** Her stat'ın placeholder ikonu ve rengi (alt bar ve tooltip). Tüm stat türleri tanımlı olmak zorunda. */
export const STAT_ICON: Record<StatKind, IconKind> = {
  hp: 'heart',
  mp: 'droplet',
  str: 'muscle',
  int: 'wand',
  dex: 'feather',
  luck: 'clover',
  spd: 'boot',
  critChance: 'burst',
  accuracy: 'blast',
  evasion: 'whirlwind',
  armor: 'shield',
  magicArmor: 'rune',
};

/** Primary statın ismi bu altın renkte yazılır. */
export const PRIMARY_GOLD = '#ffd700';

export const STAT_COLOR: Record<StatKind, string> = {
  hp: '#e0574a',
  mp: '#4f8cff',
  str: '#ff9f43',
  int: '#7dc4ff',
  dex: '#7dff9b',
  luck: '#ffd166',
  spd: '#b5e6ff',
  critChance: '#ffe066',
  accuracy: '#ff9a7a',
  evasion: '#9be8c8',
  armor: '#c9d1dc',
  magicArmor: '#c58bff',
};

/** Kısa etiketler (alt barda ikonun yanında). */
export const STAT_LABEL: Record<StatKind, string> = {
  hp: 'HP',
  mp: 'MP',
  str: 'STR',
  int: 'INT',
  dex: 'DEX',
  luck: 'LCK',
  spd: 'SPD',
  critChance: 'CRIT',
  accuracy: 'ACC',
  evasion: 'EVA',
  armor: 'ARM',
  magicArmor: 'M.ARM',
};

/** Stat olmayan arayüz ikonları (skill düğmesindeki bekleme süresi). */
export const UI_ICON: Record<'hourglass', IconKind> = { hourglass: 'hourglass' };
export const UI_COLOR = '#d9c9a3';

/** Rage kaynağı (Warrior): skill maliyeti ve bar için alev ikonu + kırmızı-turuncu renk (data/battle-layout.json > colors.rage ile aynı). */
export const RAGE_ICON: IconKind = 'flame';
export const RAGE_COLOR = '#ff7a2f';
