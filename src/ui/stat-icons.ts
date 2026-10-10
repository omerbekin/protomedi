import type { StatKind } from '../engine';
import type { IconKind } from './icon-kinds';

/**
 * Her stat'ın KODLA ÇİZİLEN ikonu: boyalı görsel (assets/stat-icons) yoksa yedek; Codex > Icons piksel listesi de bunu sayar. Ekranda stat ikonu
 * gösterirken bunu değil `statIconName(k)` kullan. Tüm stat türleri tanımlı olmak zorunda.
 */
export const STAT_ICON: Record<StatKind, IconKind> = {
  hp: 'heart',
  mp: 'droplet',
  str: 'muscle',
  int: 'wand',
  dex: 'feather',
  luck: 'clover',
  spd: 'boot',
  critChance: 'burst',
  critMult: 'critdmg',
  accuracy: 'blast',
  evasion: 'whirlwind',
  armor: 'shield',
  magicArmor: 'rune',
  hpRegen: 'hpregen',
  mpRegen: 'mpregen',
};

/** Stat ikonu alan her tür: motor statları + Might (item'lerin skill gücü eki; motorda tek stat değil). */
export type StatIconKind = StatKind | 'might';

/**
 * STAT İKONU ADI (TEK KAYNAK, Ömer 2026-10-10): `ensureIcon(scene, statIconName(k), STAT_COLOR[k], false)` (Phaser) ve
 * `iconUrl(statIconName(k), STAT_COLOR[k])` (DOM) bu adı boyalı PNG'ye çözer (assets/stat-icons/<k>.png; src/game/art-registry.ts >
 * resolveSprite, src/game/icon-image-files.ts). Dosya yoksa kodla çizilen yedeğe düşer: STAT_ICON[k] (Might: Shared v2 `v2:shared:might`).
 */
export const STAT_ICON_PREFIX = 'stat:';
export const statIconName = (kind: StatIconKind): string => `${STAT_ICON_PREFIX}${kind}`;

/** Görseli olmayan stat ikonunun kodla çizilen yedeği (bilinmeyen türde null). */
export function statIconFallback(kind: string): string | null {
  if (kind === 'might') return 'v2:shared:might';
  return (STAT_ICON as Record<string, IconKind | undefined>)[kind] ?? null;
}

/** Might'ın rengi (Gear / Endless satırları). */
export const MIGHT_COLOR = '#ff9f43';

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
  critMult: '#ff9f43',
  accuracy: '#ff9a7a',
  evasion: '#9be8c8',
  armor: '#c9d1dc',
  magicArmor: '#c58bff',
  hpRegen: '#7dff9b',
  mpRegen: '#7dc4ff',
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
  critMult: 'CDMG',
  accuracy: 'ACC',
  evasion: 'EVA',
  armor: 'ARM',
  magicArmor: 'M.ARM',
  hpRegen: 'HP+',
  mpRegen: 'MP+',
};

/** Stat olmayan arayüz ikonları (skill düğmesindeki bekleme süresi). */
export const UI_ICON: Record<'hourglass', IconKind> = { hourglass: 'hourglass' };
export const UI_COLOR = '#d9c9a3';

/** Rage kaynağı (Warrior): skill maliyeti ve bar için alev ikonu + kırmızı-turuncu renk (data/battle-layout.json > colors.rage ile aynı). */
export const RAGE_ICON: IconKind = 'flame';
export const RAGE_COLOR = '#ff7a2f';
