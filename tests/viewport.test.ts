import { describe, expect, it } from 'vitest';
import { detectFullscreenSupport, isIOSLike } from '../src/ui/fullscreen';
import { fitScale, layoutFor, parseRotateMode, rotatedToStage, shouldRotate } from '../src/ui/viewport';

describe('ölçek hesabı (FIT)', () => {
  it('oran korunur, kısıtlayan kenar belirler', () => {
    expect(fitScale(1920, 1080)).toBe(1);
    expect(fitScale(960, 1080)).toBe(0.5);
    expect(fitScale(1920, 270)).toBe(0.25);
    expect(fitScale(0, 100)).toBe(0);
  });
});

describe('dikeyde döndürme kararı', () => {
  it('yatay ekranda asla döndürmez', () => {
    expect(shouldRotate(812, 375, true)).toBe(false);
    expect(shouldRotate(1024, 768, true)).toBe(false);
  });
  it('dikey dokunmatik telefon/tablette döndürür, oyun belirgin büyür', () => {
    expect(shouldRotate(375, 812, true)).toBe(true);
    expect(shouldRotate(768, 1024, true)).toBe(true);
    const l = layoutFor(375, 812, true);
    expect(l.rotated).toBe(true);
    expect(l.stageW).toBe(812);
    expect(l.stageH).toBe(375);
    expect(l.scale).toBeGreaterThan(fitScale(375, 812) * 1.5);
  });
  it('fare cihazında (masaüstü) otomatik döndürmez; elle açılabilir', () => {
    expect(shouldRotate(600, 900, false)).toBe(false);
    expect(shouldRotate(600, 900, false, 'on')).toBe(true);
    expect(shouldRotate(375, 812, true, 'off')).toBe(false);
  });
  it('neredeyse kare dikey alanda kazanç yetmiyorsa döndürmez', () => {
    expect(shouldRotate(900, 1000, true)).toBe(false);
  });
  it('?rotate= kipi', () => {
    expect(parseRotateMode('?rotate=on')).toBe('on');
    expect(parseRotateMode('?rotate=off')).toBe('off');
    expect(parseRotateMode('?seed=3')).toBe('auto');
  });
});

describe('döndürülmüş sahnede dokunma eşlemesi', () => {
  it('ekranın üst-sağı sahnenin sol-üstüdür; alt-sol sahnenin sağ-altıdır', () => {
    const vw = 375;
    const vh = 812;
    expect(rotatedToStage(vw, 0, vw)).toEqual({ x: 0, y: 0 });
    expect(rotatedToStage(0, vh, vw)).toEqual({ x: vh, y: vw });
    expect(rotatedToStage(vw, vh, vw)).toEqual({ x: vh, y: 0 });
  });
  it('translateX(vw) rotate(90deg) dönüşünün tersidir', () => {
    const vw = 375;
    for (const [lx, ly] of [[10, 20], [400, 300], [800, 5]]) {
      // ileri dönüşüm: ekran = (vw - ly, lx)
      const s = { x: vw - ly!, y: lx! };
      expect(rotatedToStage(s.x, s.y, vw)).toEqual({ x: lx, y: ly });
    }
  });
});

describe('tam ekran desteği algısı', () => {
  const base = { hasRequest: false, hasWebkitRequest: false, userAgent: 'Mozilla/5.0', maxTouchPoints: 0, platform: 'Win32' };
  it('requestFullscreen ya da webkit önekli sürüm varsa native', () => {
    expect(detectFullscreenSupport({ ...base, hasRequest: true })).toBe('native');
    expect(detectFullscreenSupport({ ...base, hasWebkitRequest: true })).toBe('native');
  });
  it('iPhone Safari (API yok) ipucu kipine geçer; diğerinde gizli', () => {
    const iphone = { ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5, platform: 'iPhone' };
    expect(detectFullscreenSupport(iphone)).toBe('ios');
    expect(detectFullscreenSupport(base)).toBe('none');
  });
  it('iPadOS (Mac gibi görünür) iOS sayılır', () => {
    expect(isIOSLike({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5, platform: 'MacIntel' })).toBe(true);
    expect(isIOSLike({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, platform: 'MacIntel' })).toBe(false);
  });
});
