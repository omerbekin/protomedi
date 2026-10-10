import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';

// Savaş tahtası ile alt HUD bandı arası boşluk (Ömer 2026-10-10): en öndeki hücrenin zemin vurgusu banda değmesin. HUD bandının üst kenarı
// 1080'lik sahnede ~910 (bh-band, 170 birim); hücre plakası ayak çizgisinin ~20 birim altına iner. En az 30 birim boşluk kalsın.
const HUD_TOP = 910;
const TILE_BELOW_FEET = 20;

describe('savaş tahtası HUD bandından uzak', () => {
  it('en alttaki yuvanın zemin vurgusu ile HUD bandı arasında en az 30 birim', () => {
    const lowest = Math.max(...[...layout.partySlots, ...layout.enemySlots].map((s) => s.y));
    expect(HUD_TOP - (lowest + TILE_BELOW_FEET)).toBeGreaterThanOrEqual(30);
  });
});
