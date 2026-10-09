import { describe, expect, it } from 'vitest';
import { isBackdropTap } from '../src/ui/backdrop';

const panel = { x: 100, y: 100, w: 200, h: 100 };

describe('zemine dokununca kapanma (CLAUDE.md > Geri / Menu kuralı)', () => {
  it('basış ve bırakış panelin dışındaysa kapanır', () => {
    expect(isBackdropTap({ x: 10, y: 10 }, { x: 20, y: 500 }, panel)).toBe(true);
  });
  it('panelin içinde başlayıp dışarıda biten sürükleme kapatmaz', () => {
    expect(isBackdropTap({ x: 150, y: 150 }, { x: 10, y: 10 }, panel)).toBe(false);
  });
  it('dışarıda başlayıp panelde biten basış kapatmaz; basış yoksa kapatmaz', () => {
    expect(isBackdropTap({ x: 10, y: 10 }, { x: 150, y: 150 }, panel)).toBe(false);
    expect(isBackdropTap(null, { x: 10, y: 10 }, panel)).toBe(false);
  });
});
