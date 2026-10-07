/**
 * Savaştaki birim ADI ve RÜTBESİ (sefer: madde 251 UnitSetup.displayName / tier). Saf (Phaser'sız). Ad plakası, tooltip, sıra çubuğu,
 * stat bloğu, duyuru şeridi ve sonuç ekranı aynı yardımcıyı kullanır: özel ad varsa o ('Bandit Chief'), yoksa class adı.
 * Rütbe rengi data/battle-layout.json > colors.tier (elite altın, boss kızıl).
 */
import layout from '../../data/battle-layout.json';
import type { Combatant, UnitTier } from '../engine';

export const unitName = (c: Pick<Combatant, 'name' | 'displayName'>): string => c.displayName ?? c.name;

export interface TierStyle {
  tier: UnitTier;
  /** Rozet yazısı (İngilizce). */
  label: string;
  hex: string;
}

const TIER_HEX = (layout.colors as { tier?: Record<string, string> }).tier ?? {};

/** Rütbenin görünümü (rütbesiz birimde null). */
export function tierStyle(tier: UnitTier | undefined | null): TierStyle | null {
  if (tier === 'elite') return { tier, label: 'ELITE', hex: TIER_HEX['elite'] ?? '#f0c24a' };
  if (tier === 'boss') return { tier, label: 'BOSS', hex: TIER_HEX['boss'] ?? '#e0413c' };
  return null;
}
