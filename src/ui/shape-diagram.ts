/**
 * AOE şekil şeması (saf): skill tooltip'inde ve wiki'de gösterilen küçük ızgara (herhangi RxC: formasyon boyutunda (şimdi 4 sütun x 3 satır), düşman tahtası ekranda göründüğü gibi).
 * Kapsanan hücreler boyalı, anchor (fare hücresi) işaretli. Çizim (Phaser / CSS) bu verinin dışındadır.
 * Özel işaretler: X şeklinde merkez çift vuruş (`hits`: anchor hücresinde '×2'), iki tahtaya atılabilen alan skill'inde (area_any: Smoke Bomb) `note: 'either side'`.
 */
import { RECT_CENTER_MIN, isShapeArea, screenCellOf, shapeCells, shapeStages } from '../engine/area-shape';
import type { ShapeFormation } from '../engine/area-shape';
import type { AreaDef, SkillDef } from '../engine';
import { stageMap } from '../game/cell-style';

export interface MiniCell {
  /** Ekran sütunu (soldan) ve satırı (yukarıdan). */
  col: number;
  row: number;
  on: boolean;
  anchor: boolean;
  /** Aşamalı vuruşta 1 tabanlı aşama numarası (yoksa tek vuruş). */
  stage?: number;
  /** Bu hücredeki birim kaç kez vurulur (yalnızca 2 ve üstü yazılır: X şeklinin merkezi '×2'). */
  hits?: number;
}

export interface MiniShape {
  cols: number;
  rows: number;
  /** Satır satır (üstten alta, soldan sağa) tüm hücreler. */
  cells: MiniCell[];
  /** Şemanın yanına yazılan kısa not (iki tahtaya atılabilen alan skill'inde 'either side'). */
  note?: string;
}

/** area_any (iki tahtaya da atılabilen alan) şemasının notu. */
export const EITHER_SIDE_NOTE = 'either side';

/**
 * Bir eksende örnek anchor koordinatı. Boyut >= RECT_CENTER_MIN: fare hücresi alanın ORTASINDA kalacak (ortalı alan tahtaya sığar) bir hücre, yani orta;
 * daha küçük boyutta: sıra ekseninde (`low`) soldan 2. hücre (alan sağa uzar), şerit ekseninde (`high`) en alt hücre (sol-alt köşe).
 */
export function rectExampleAxis(size: number, max: number, smallAt: 'low' | 'high'): number {
  if (size >= RECT_CENTER_MIN) {
    const before = Math.floor((size - 1) / 2); // alanın anchor'dan önceki hücre sayısı
    return Math.max(before, Math.min(1, max - size + before));
  }
  return smallAt === 'low' ? Math.min(1, max - size) : max - 1;
}

/**
 * Şeklin örnek şeması: row / column / plus / x için ortadaki hücre (sütun 1, satır 1); rect için Ömer'in anchor kuralı (madde 226): boyutu 3 ve üstü olan
 * eksende anchor alanın ortasında, 1-2 boyutlu eksende dikdörtgenin sol-alt köşesi (kaymasız, tahtanın içinde kalan bir örnek). Şekil değilse null.
 */
export function shapeMiniGrid(area: AreaDef | undefined, formation: ShapeFormation): MiniShape | null {
  if (!isShapeArea(area)) return null;
  const { rows: depth, lanes } = formation; // ekranda: sütun = sıra (derinlik), satır = şerit
  const rectW = Math.max(1, Math.min(depth, Math.floor(area.rows ?? 1)));
  const rectH = Math.max(1, Math.min(lanes, Math.floor(area.cols ?? 1)));
  const wantCol = area.shape === 'rect' ? rectExampleAxis(rectW, depth, 'low') : Math.min(1, depth - 1);
  const wantRow = area.shape === 'rect' ? rectExampleAxis(rectH, lanes, 'high') : Math.min(1, lanes - 1);
  let anchorSlot = 0;
  for (let slot = 0; slot < depth * lanes; slot++) {
    const g = screenCellOf(formation, 'enemy', slot);
    if (g.col === wantCol && g.row === wantRow) anchorSlot = slot;
  }
  const covered = new Set(shapeCells(area, anchorSlot, 'enemy', formation));
  const staged = shapeStages(area, anchorSlot, 'enemy', formation);
  const stages = staged.length > 1 ? stageMap(staged) : new Map<number, number>(); // yalnızca aşamalı şekilde numara
  const centerHits = area.shape === 'x' ? Math.floor(area.hitsAtCenter ?? 1) : 1;
  const cells: MiniCell[] = [];
  for (let slot = 0; slot < depth * lanes; slot++) {
    const g = screenCellOf(formation, 'enemy', slot);
    const stage = covered.has(slot) ? stages.get(slot) : undefined;
    const isAnchor = slot === anchorSlot;
    cells.push({ col: g.col, row: g.row, on: covered.has(slot), anchor: isAnchor, ...(stage ? { stage } : {}), ...(isAnchor && centerHits > 1 && covered.has(slot) ? { hits: centerHits } : {}) });
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cols: depth, rows: lanes, cells };
}

/** Skill'in şekil şeması: area_enemies ve iki tahtaya atılabilen area_any ('either side' notu ile); şekil skill'i değilse null. */
export function skillMiniGrid(skill: SkillDef, formation: ShapeFormation): MiniShape | null {
  if (skill.target !== 'area_enemies' && skill.target !== 'area_any') return null;
  const grid = shapeMiniGrid(skill.area, formation);
  if (!grid) return null;
  return skill.target === 'area_any' ? { ...grid, note: EITHER_SIDE_NOTE } : grid;
}

/** Düz metin gösterimi (test / erişilebilirlik): satır başına bir dize, '#' = kapsanan, 'A' = kapsanan anchor, 'X' = çift vuruşlu anchor (×2), '+' = kapsanmayan anchor, '.' = boş. */
export function miniGridText(m: MiniShape): string[] {
  const out: string[] = [];
  for (let r = 0; r < m.rows; r++) {
    out.push(
      m.cells
        .filter((c) => c.row === r)
        .map((c) => (c.anchor ? (c.on ? (c.hits && c.hits > 1 ? 'X' : 'A') : '+') : c.on ? '#' : '.'))
        .join(''),
    );
  }
  return out;
}
