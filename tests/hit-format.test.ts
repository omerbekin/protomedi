import { describe, expect, it } from 'vitest';
import { formatHit, hitColor, hitColors, hitPercent } from '../src/game/hit-format';

describe('hit preview format', () => {
  it('formats rounded percent', () => {
    expect(formatHit(0.92)).toBe('92% hit');
    expect(formatHit(1)).toBe('100% hit');
    expect(formatHit(0.2)).toBe('20% hit');
    expect(formatHit(0.9149)).toBe('91% hit');
    expect(hitPercent(1.4)).toBe(100);
    expect(hitPercent(-1)).toBe(0);
  });
  it('colors by threshold', () => {
    expect(hitColor(0.95)).toBe(hitColors.good);
    expect(hitColor(0.9)).toBe(hitColors.good);
    expect(hitColor(0.89)).toBe(hitColors.warn);
    expect(hitColor(0.7)).toBe(hitColors.warn);
    expect(hitColor(0.69)).toBe(hitColors.low);
  });
});
