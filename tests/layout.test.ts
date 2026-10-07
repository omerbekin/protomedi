import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';

describe('savaş yerleşimi verisi', () => {
  it('oyun çözünürlüğü 1920x1080 (HD)', () => {
    expect([layout.width, layout.height]).toEqual([1920, 1080]);
  });

  it('her iki tarafta 4 sıra x 3 şerit = 12 yuva', () => {
    expect(layout.partySlots).toHaveLength(12);
    expect(layout.enemySlots).toHaveLength(12);
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

  it('placeholder çizimi 140x200 koordinatlarıyla yapıldı; sprite kutusuna küçültülerek sığar', () => {
    expect(layout.characterSize).toEqual({ width: 140, height: 200 });
    expect(layout.spriteBox.width / layout.characterSize.width).toBeGreaterThan(0.5);
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

  it('komşu sıraların arası, aynı sıradaki perspektif kaymasından büyük', () => {
    for (const slots of [layout.partySlots, layout.enemySlots]) {
      const dx = (a: number, b: number) => Math.abs(slots[a]!.x - slots[b]!.x);
      for (let row = 0; row < 3; row++) expect(dx(row * 3 + 1, (row + 1) * 3 + 1)).toBeGreaterThan(dx(row * 3, row * 3 + 2)); // sıra aralığı, aynı sıradaki x farkından büyük
    }
  });

  it('yuvalar sıra x şerit düzeninde: aynı şeritte y aynı, ön sıra ekran ortasına daha yakın', () => {
    const mid = layout.width / 2;
    for (const slots of [layout.partySlots, layout.enemySlots]) {
      for (let lane = 0; lane < 3; lane++) {
        const ys = [0, 1, 2, 3].map((row) => slots[row * 3 + lane]!.y);
        expect(new Set(ys).size).toBe(1);
      }
      for (let row = 1; row < 4; row++) expect(Math.abs(slots[row * 3 + 1]!.x - mid)).toBeGreaterThan(Math.abs(slots[(row - 1) * 3 + 1]!.x - mid));
    }
  });

  it('sıra çubuğu: ortada şu anki, solda geçmiş, sağda sıradakiler; ekrana sığar', () => {
    const { cellSize, gap, pastCells } = layout.turnBar;
    const cells = pastCells + layout.turnBar.cells; // geçmiş + şu anki + sıradakiler
    expect(layout.turnBar.cells).toBe(5);
    expect(pastCells).toBe(4);
    expect(cells * cellSize + (cells - 1) * gap).toBeLessThanOrEqual(layout.width);
  });

  it('komut düğmeleri yatay telefonda da >= 44 gerçek piksel', () => {
    // En kötü durum: ~360px yüksekliğinde yatay telefon ekranı (tarayıcı çubukları açıkken)
    const scale = 360 / layout.height;
    expect(layout.commandPanel.buttonHeight * scale).toBeGreaterThanOrEqual(44);
    expect(layout.commandPanel.y + layout.commandPanel.buttonHeight).toBeLessThanOrEqual(layout.height);
  });

  it("HP/MP/stat bloğu alt barın yatayda en fazla %30'unu kaplar", () => {
    const p = layout.commandPanel;
    expect((p.padding + p.statsWidth) / layout.width).toBeLessThanOrEqual(0.3);
  });

  it('komut panelinde karakter bilgisi + 4 skill düğmesi yan yana sığıyor', () => {
    const p = layout.commandPanel;
    const needed = p.padding * 2 + p.statsWidth + 4 * p.buttonWidth + 4 * p.gap + p.tipWidth;
    expect(needed).toBeLessThanOrEqual(layout.width);
  });
});

describe('animasyon ve arayüz ayarları', () => {
  it('skill animasyonları %20 yavaş', () => {
    expect(layout.animation.skillSlowdown).toBeCloseTo(1.2, 5);
  });

  it('hasar/şifa/MP sayıları ekranda en az 2 saniye kalır (eskisinden +0,5 sn), son 200 ms solar', () => {
    expect(layout.animation.damageNumberMs).toBeGreaterThanOrEqual(2000);
    expect(layout.animation.floatFadeMs).toBeLessThanOrEqual(layout.animation.damageNumberMs);
  });

  it('skill düğmeleri küçük (kompakt) ve ikon + isim + bedel sığıyor', () => {
    const p = layout.commandPanel;
    expect(p.buttonWidth).toBeLessThanOrEqual(240);
    expect(p.iconSize + 10 + 60).toBeLessThanOrEqual(p.buttonHeight); // ikon + isim + bedel satırı dikey sığar
  });

  it('zırh ikonu, takım seçimi ve kompakt tooltip ayarları tutarlı', () => {
    expect(layout.armorIcon.maxSize).toBeGreaterThan(layout.armorIcon.minSize);
    expect(layout.armorIcon.maxArmor).toBeGreaterThan(0);
    const t = layout.teamSelect;
    expect(4 * t.slotWidth + 3 * t.gap + 60).toBeLessThanOrEqual(layout.width / 2);
    expect(layout.tooltip.compact).toBeDefined();
  });

  it('tooltip genişlikleri ekrana sığar', () => {
    expect(layout.tooltip.width).toBeLessThan(layout.width / 2);
  });

  it('büyük vuruş efektleri tanımlı: ratio eşikleri sıralı', () => {
    expect(layout.animation.hitMaxRatio).toBeGreaterThan(layout.animation.cameraShakeRatio);
    expect(layout.animation.cameraShakeRatio).toBeGreaterThan(0);
  });
});
