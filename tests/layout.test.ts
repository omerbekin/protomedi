import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';

describe('savaş yerleşimi verisi', () => {
  it('oyun çözünürlüğü 1920x1080 (HD)', () => {
    expect([layout.width, layout.height]).toEqual([1920, 1080]);
  });

  it('parti 4 yuva, düşman 5 yuva (4 + 1 çağrı yeri)', () => {
    expect(layout.partySlots).toHaveLength(4);
    expect(layout.enemySlots).toHaveLength(5);
  });

  it('parti solda, düşmanlar sağda', () => {
    const mid = layout.width / 2;
    for (const s of layout.partySlots) expect(s.x).toBeLessThan(mid);
    for (const s of layout.enemySlots) expect(s.x).toBeGreaterThan(mid);
  });

  it('tüm karakterler (sprite kutusu) ekranın içinde ve komut panelinin üstünde', () => {
    const { width: bw, height: bh } = layout.spriteBox;
    for (const s of [...layout.partySlots, ...layout.enemySlots]) {
      expect(s.x - bw / 2).toBeGreaterThanOrEqual(0);
      expect(s.x + bw / 2).toBeLessThanOrEqual(layout.width);
      expect(s.y - bh).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(layout.commandPanel.y);
    }
  });

  it('placeholder boyutu sprite kutusundan büyük değil', () => {
    expect(layout.characterSize.width).toBeLessThanOrEqual(layout.spriteBox.width);
    expect(layout.characterSize.height).toBeLessThanOrEqual(layout.spriteBox.height);
  });

  it('aynı sıradaki karakterler üst üste binmiyor', () => {
    const { width: bw } = layout.spriteBox;
    for (const slots of [layout.partySlots, layout.enemySlots]) {
      for (const a of slots) {
        for (const b of slots) {
          if (a === b || a.y !== b.y) continue;
          expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(bw);
        }
      }
    }
  });

  it('komşu karakterlerin kutuları yatayda en fazla %20 örtüşüyor (arka/ön sıra dizilimi)', () => {
    const { width: bw } = layout.spriteBox;
    for (const slots of [layout.partySlots, layout.enemySlots]) {
      const xs = slots.map((s) => s.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(bw - (xs[i]! - xs[i - 1]!)).toBeLessThanOrEqual(bw * 0.2);
    }
  });

  it('sıra çubuğu ~8 aktör gösterir ve ekrana sığar', () => {
    const { cells, cellSize, gap } = layout.turnBar;
    expect(cells).toBe(8);
    expect(cells * cellSize + (cells - 1) * gap).toBeLessThanOrEqual(layout.width);
  });

  it('komut düğmeleri yatay telefonda da >= 44 gerçek piksel', () => {
    // En kötü durum: ~340px yüksekliğinde yatay telefon ekranı (tarayıcı çubukları açıkken)
    const scale = 340 / layout.height;
    expect(layout.commandPanel.buttonHeight * scale).toBeGreaterThanOrEqual(44);
    expect(layout.commandPanel.y + layout.commandPanel.buttonHeight).toBeLessThanOrEqual(layout.height);
  });

  it('komut panelinde karakter bilgisi + 4 skill düğmesi yan yana sığıyor', () => {
    const p = layout.commandPanel;
    const needed = p.padding * 2 + p.infoWidth + 4 * p.buttonWidth + 4 * p.gap;
    expect(needed).toBeLessThanOrEqual(layout.width);
  });
});
