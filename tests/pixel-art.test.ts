import { describe, expect, it } from 'vitest';
import { GRID, PALETTE, PIXEL_ICONS, iconRows } from '../src/game/pixel-art';
import { ICON_KINDS } from '../src/ui/icon-kinds';

describe('piksel art ikonlar', () => {
  it('ICON_KINDS ile PIXEL_ICONS birebir aynı', () => {
    expect([...ICON_KINDS].sort()).toEqual(Object.keys(PIXEL_ICONS).sort());
  });

  for (const name of Object.keys(PIXEL_ICONS)) {
    it(`${name}: 16x16, geçerli jetonlar, yeterince dolu ve kontur var`, () => {
      const rows = iconRows(name)!;
      expect(rows).toHaveLength(GRID);
      let filled = 0;
      for (const row of rows) {
        expect(row).toHaveLength(GRID);
        for (const t of row) {
          if (t === '.') continue;
          filled++;
          expect(t in PALETTE || 'aAz'.includes(t), `${name}: bilinmeyen jeton ${t}`).toBe(true);
        }
      }
      expect(filled, name).toBeGreaterThan(30);
      expect(filled, name).toBeLessThan(GRID * GRID * 0.9);
      expect(rows.join('').includes('o'), name).toBe(true);
    });
  }
});
