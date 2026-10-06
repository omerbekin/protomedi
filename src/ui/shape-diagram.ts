/**
 * AOE şekil şeması (saf): skill tooltip'inde ve wiki'de gösterilen küçük ızgara (4 sütun x 3 satır, düşman tahtası ekranda göründüğü gibi).
 * Kapsanan hücreler boyalı, anchor (fare hücresi) işaretli. Çizim (Phaser / CSS) bu verinin dışındadır.
 */
import { isShapeArea, screenCellOf, shapeCells } from '../engine/area-shape';
import type { ShapeFormation } from '../engine/area-shape';
import type { AreaDef, SkillDef } from '../engine';

export interface MiniCell {
  /** Ekran sütunu (soldan) ve satırı (yukarıdan). */
  col: number;
  row: number;
  on: boolean;
  anchor: boolean;
}

export interface MiniShape {
  cols: number;
  rows: number;
  /** Satır satır (üstten alta, soldan sağa) tüm hücreler. */
  cells: MiniCell[];
}

/**
 * Şeklin örnek şeması: row / column / plus için ortadaki hücre (sütun 1, satır 1), rect için dikdörtgenin sol-alt köşesi anchor olacak şekilde
 * (kaymasız, tahtanın içinde kalan bir örnek). Şekil değilse null.
 */
export function shapeMiniGrid(area: AreaDef | undefined, formation: ShapeFormation): MiniShape | null {
  if (!isShapeArea(area)) return null;
  const { rows: depth, lanes } = formation; // ekranda: sütun = sıra (derinlik), satır = şerit
  const rectW = Math.max(1, Math.min(depth, Math.floor(area.rows ?? 1)));
  const wantCol = area.shape === 'rect' ? Math.min(1, depth - rectW) : Math.min(1, depth - 1);
  const wantRow = area.shape === 'rect' ? lanes - 1 : Math.min(1, lanes - 1);
  let anchorSlot = 0;
  for (let slot = 0; slot < depth * lanes; slot++) {
    const g = screenCellOf(formation, 'enemy', slot);
    if (g.col === wantCol && g.row === wantRow) anchorSlot = slot;
  }
  const covered = new Set(shapeCells(area, anchorSlot, 'enemy', formation));
  const cells: MiniCell[] = [];
  for (let slot = 0; slot < depth * lanes; slot++) {
    const g = screenCellOf(formation, 'enemy', slot);
    cells.push({ col: g.col, row: g.row, on: covered.has(slot), anchor: slot === anchorSlot });
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cols: depth, rows: lanes, cells };
}

/** Skill'in şekil şeması (şekil skill'i değilse null). */
export const skillMiniGrid = (skill: SkillDef, formation: ShapeFormation): MiniShape | null => (skill.target === 'area_enemies' ? shapeMiniGrid(skill.area, formation) : null);

/** Düz metin gösterimi (test / erişilebilirlik): satır başına bir dize, '#' = kapsanan, 'A' = kapsanan anchor, '+' = kapsanmayan anchor, '.' = boş. */
export function miniGridText(m: MiniShape): string[] {
  const out: string[] = [];
  for (let r = 0; r < m.rows; r++) {
    out.push(
      m.cells
        .filter((c) => c.row === r)
        .map((c) => (c.anchor ? (c.on ? 'A' : '+') : c.on ? '#' : '.'))
        .join(''),
    );
  }
  return out;
}
