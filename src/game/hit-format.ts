/** Hover önizlemesindeki isabet yazısı (saf; Phaser'a bağımlı değil, test edilebilir). */

/** Eşikler (yüzde): >= good normal, >= warn sarımsı, altı turuncu-kırmızı. */
export const hitThresholds = { good: 90, warn: 70 };

export const hitColors = { good: '#b8b0a0', warn: '#e6c84a', low: '#ee7a4a' };

/** 0-1 isabet şansını tam yüzdeye çevirir (0-100). */
export function hitPercent(chance: number): number {
  return Math.round(Math.min(1, Math.max(0, chance)) * 100);
}

/** "92% hit" */
export function formatHit(chance: number): string {
  return `${hitPercent(chance)}% hit`;
}

/** İsabet şansına göre yazı rengi. */
export function hitColor(chance: number): string {
  const pct = hitPercent(chance);
  if (pct >= hitThresholds.good) return hitColors.good;
  if (pct >= hitThresholds.warn) return hitColors.warn;
  return hitColors.low;
}
