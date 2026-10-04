import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { computeZoom } from '../src/game/scaling';

describe('savaş yerleşimi verisi', () => {
  it('sanal çözünürlük 480x270', () => {
    expect([layout.virtualWidth, layout.virtualHeight]).toEqual([480, 270]);
  });

  it('parti 4 yuva, düşman 5 yuva', () => {
    expect(layout.partySlots).toHaveLength(4);
    expect(layout.enemySlots).toHaveLength(5);
  });

  it('parti solda, düşmanlar sağda', () => {
    const mid = layout.virtualWidth / 2;
    for (const s of layout.partySlots) expect(s.x).toBeLessThan(mid);
    for (const s of layout.enemySlots) expect(s.x).toBeGreaterThan(mid);
  });

  it('tüm yuvalar ekranın içinde', () => {
    const half = layout.slotSize / 2;
    for (const s of [...layout.partySlots, ...layout.enemySlots]) {
      expect(s.x - half).toBeGreaterThanOrEqual(0);
      expect(s.x + half).toBeLessThanOrEqual(layout.virtualWidth);
      expect(s.y - layout.slotSize).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(layout.virtualHeight);
    }
  });

  it('sıra çubuğu ~8 aktör gösterir ve ekrana sığar', () => {
    const { x, cells, cellSize, gap } = layout.turnBar;
    expect(cells).toBe(8);
    expect(x + cells * cellSize + (cells - 1) * gap).toBeLessThanOrEqual(layout.virtualWidth);
  });
});

describe('ölçekleme', () => {
  it('büyük ekranda tamsayı ölçek seçer', () => {
    expect(computeZoom(1920, 1080, 480, 270)).toBe(4);
    expect(computeZoom(1366, 768, 480, 270)).toBe(2);
    expect(computeZoom(844, 390, 480, 270)).toBe(1); // yatay iPhone
  });

  it('sanal çözünürlükten küçük ekranda taşmadan küçültür', () => {
    const z = computeZoom(390, 844, 480, 270); // dikey iPhone
    expect(z).toBeLessThan(1);
    expect(480 * z).toBeLessThanOrEqual(390);
  });
});
