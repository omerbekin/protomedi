import { describe, expect, it } from 'vitest';
import { isDebugTap, wantsDebugButton } from '../src/ui/debug-gesture';

describe('gizli debug girişi: üç parmakla kısa dokunma', () => {
  it('üç parmak, kısa, kaymasız dokunuş debug menüsünü açar', () => {
    expect(isDebugTap({ maxTouches: 3, durationMs: 250, maxMovePx: 6 })).toBe(true);
  });
  it('normal oyun hareketleri tetiklemez: tek / iki parmak, uzun basma, kaydırma, dört parmak', () => {
    expect(isDebugTap({ maxTouches: 1, durationMs: 120, maxMovePx: 0 })).toBe(false);
    expect(isDebugTap({ maxTouches: 2, durationMs: 200, maxMovePx: 4 })).toBe(false);
    expect(isDebugTap({ maxTouches: 3, durationMs: 1200, maxMovePx: 0 })).toBe(false);
    expect(isDebugTap({ maxTouches: 3, durationMs: 300, maxMovePx: 120 })).toBe(false); // üç parmakla kaydırma (sistem ekran görüntüsü)
    expect(isDebugTap({ maxTouches: 4, durationMs: 200, maxMovePx: 0 })).toBe(false);
  });
});

describe('?debug=1: görünür DEBUG düğmesi', () => {
  it('yalnızca adreste debug varsa', () => {
    expect(wantsDebugButton('')).toBe(false);
    expect(wantsDebugButton('?seed=4')).toBe(false);
    expect(wantsDebugButton('?debug=1')).toBe(true);
    expect(wantsDebugButton('?seed=4&debug')).toBe(true);
    expect(wantsDebugButton('?debug=0')).toBe(false);
  });
});
