import { describe, expect, it } from 'vitest';
import { FULL_W, FULL_X0, GAME_H, GAME_W, MAX_GAME_W, MENU_COL_X, logicalWidthFor, menuColumnShift, stageMetrics } from '../src/ui/viewport';

describe('geniş ekran: mantıksal genişlik (yükseklik 1080 sabit)', () => {
  it('16:9 = 1920; daha dar ekranlarda da 1920 (üst/alt bant)', () => {
    expect(logicalWidthFor(1920, 1080)).toBe(1920);
    expect(logicalWidthFor(1280, 720)).toBe(1920);
    expect(logicalWidthFor(1920, 1200)).toBe(1920); // 16:10
    expect(logicalWidthFor(1024, 768)).toBe(1920); // 4:3
    expect(logicalWidthFor(0, 100)).toBe(GAME_W);
  });
  it('ekran oranıyla esner: 21:9 (2560x1080) = 2560, ultrawide 3440x1440 = 2580 (üst sınır ~21.5:9)', () => {
    expect(logicalWidthFor(2560, 1080)).toBe(2560);
    expect(logicalWidthFor(3440, 1440)).toBe(2580);
    expect(MAX_GAME_W).toBe(2580);
  });
  it('32:9 gibi daha geniş ekranlarda üst sınırda kalır (iki yanda bant)', () => {
    expect(logicalWidthFor(5120, 1440)).toBe(MAX_GAME_W);
    expect(logicalWidthFor(3840, 1080)).toBe(MAX_GAME_W);
  });
});

describe('geniş ekran: tuval ve render ölçeği (gerçek piksel)', () => {
  it('1920x1080: bugünkü gibi (tuval 1920x1080, yakınlaştırma 1, görünen 0-1920)', () => {
    const m = stageMetrics(1920, 1080, 1);
    expect([m.canvasW, m.canvasH, m.zoom, m.left, m.right]).toEqual([1920, 1080, 1, 0, 1920]);
  });
  it('3440x1440: tuval ekranın gerçek pikseli, mantıksal 2580x1080 x 1,333; iki yana 330 açılır', () => {
    const m = stageMetrics(3440, 1440, 1);
    expect([m.canvasW, m.canvasH]).toEqual([3440, 1440]);
    expect(m.zoom).toBeCloseTo(4 / 3);
    expect(m.viewW).toBeCloseTo(2580);
    expect(m.left).toBeCloseTo(-330);
    expect(m.right).toBeCloseTo(2250);
  });
  it('küçük ekranda tuval 1920x1080 kalır (tarayıcı küçültür; render ölçeği en az 1)', () => {
    const m = stageMetrics(1280, 720, 1);
    expect([m.canvasW, m.canvasH, m.zoom]).toEqual([1920, 1080, 1]);
    expect(m.cssScale).toBeCloseTo(2 / 3);
  });
  it('yüksek DPI: cihaz pikseli sayılır ama tuval 3840 genişliği / 2 katı aşmaz', () => {
    const phone = stageMetrics(844, 390, 3); // telefon yatay: 2532x1170 gerçek piksel
    expect(phone.canvasH).toBe(1170);
    expect(phone.canvasW).toBeLessThanOrEqual(2533);
    const big = stageMetrics(3840, 1600, 2); // 4K+ ve dpr 2
    expect(big.canvasW).toBeLessThanOrEqual(3840);
    expect(big.zoom).toBeLessThanOrEqual(2);
    expect(big.viewW).toBeCloseTo(MAX_GAME_W, 0);
  });
  it('1080 civarındaki küçük farklar render ölçeğini 1 bırakır (bulanık yeniden örnekleme yok)', () => {
    expect(stageMetrics(1922, 1081, 1).zoom).toBe(1);
  });
  it('tam ekran örtüler en geniş görünümü (ve sarsıntı payını) kaplar', () => {
    const m = stageMetrics(3440, 1440, 1);
    expect(FULL_X0).toBeLessThan(m.left);
    expect(FULL_X0 + FULL_W).toBeGreaterThan(m.right);
    expect(GAME_H).toBe(1080);
  });
  it('sol sütun: 16:9da kaymaz, geniş ekranda sola yaklaşır ama görünen kenara yapışmaz', () => {
    expect(menuColumnShift(0)).toBe(0);
    const left = stageMetrics(3440, 1440, 1).left;
    const textX = MENU_COL_X + menuColumnShift(left);
    expect(textX).toBeLessThan(MENU_COL_X);
    expect(textX - left).toBeGreaterThan(MENU_COL_X);
  });
});
