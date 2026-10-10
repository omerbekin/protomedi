import { describe, expect, it } from 'vitest';
import { badgeRow, badgeRows, solveBadgeSizes, type BadgeUnit } from '../src/game/badge-layout';

// Telefonda büyüyen durum rozetleri hiçbir şeye binmez (src/game/badge-layout.ts).
const unit = (id: string, x: number, barY: number, left: number, right: number): BadgeUnit => {
  const ownBar = { x0: x - 55, y0: barY - 11, x1: x + 55, y1: barY + 22 };
  return { id, x, barY, barHalfW: 52, left, right, ownBar, parts: [ownBar, { x0: x - 40, y0: barY - 40, x1: x + 40, y1: barY - 18 }, { x0: x - 40, y0: barY + 24, x1: x + 40, y1: barY + 214 }] };
};
const O = { base: 28, max: 40, gapBar: 8, gapItem: 6, margin: 3 };

describe('rozet boyu çözücü', () => {
  it('yalnız birim: tam telefon boyu', () => {
    expect(solveBadgeSizes([unit('a', 500, 500, 2, 2)], O).get('a')).toEqual({ left: 40, right: 40 });
  });

  it('yakın komşu: büyüyebildiği kadar büyür, rozet sıraları ve engeller çakışmaz; sığmazsa masaüstü boyu', () => {
    const us = [unit('a', 784, 560, 2, 1), unit('b', 599, 560, 1, 2), unit('c', 725, 617, 2, 2)];
    const s = solveBadgeSizes(us, O);
    for (const u of us) {
      const sz = s.get(u.id)!;
      for (const side of ['left', 'right'] as const) {
        expect(sz[side]).toBeGreaterThanOrEqual(28);
        expect(sz[side]).toBeLessThanOrEqual(40);
      }
      // büyütülmüş her sıra: başka hiçbir birimin parçasına ve rozetine binmez
      const grown = [sz.left > 28 ? badgeRow(u, -1, u.left, sz.left, O.gapBar, O.gapItem, O.base) : null, sz.right > 28 ? badgeRow(u, 1, u.right, sz.right, O.gapBar, O.gapItem, O.base) : null].filter((r) => !!r);
      for (const v of us) {
        if (v === u) continue;
        for (const r of grown) for (const b of [...v.parts, ...badgeRows(v, s.get(v.id)!, O.gapBar, O.gapItem, O.base)]) expect(r!.x1 <= b.x0 || b.x1 <= r!.x0 || r!.y1 <= b.y0 || b.y1 <= r!.y0, `${u.id} vs ${v.id}`).toBe(true);
      }
    }
    expect([...s.values()].some((z) => z.left > 28 || z.right > 28)).toBe(true);
  });

  it('rozetsiz birim değişmez', () => {
    expect(solveBadgeSizes([unit('a', 0, 0, 0, 0)], O).get('a')).toEqual({ left: 28, right: 28 });
  });
});
