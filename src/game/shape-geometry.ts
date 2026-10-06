/**
 * AOE şekil hedeflemesinin saf (Phaser'sız) geometrisi: yuva (hücre) -> ekran dörtgeni, imleç -> hücre, rect'in gerçek sol-alt köşesi.
 * Hücre konumları data/battle-layout.json yuva koordinatlarındandır (karakterin AYAK noktası); hücre zemini, sıra yönü (satır adımı) ile
 * şerit yönü (şerit adımı) vektörleriyle çizilen paralelkenardır: yan yana hücreler boşluksuz döşenir, oyuncu tarafı aynalı yuvalardan otomatik ayna olur.
 */
import { screenCellOf } from '../engine/area-shape';
import type { ShapeFormation } from '../engine/area-shape';
import type { Side } from '../engine';

export interface Pt {
  x: number;
  y: number;
}

/** Hücre zemininin ayak noktasına göre dikey kayması (mevcut alan göstergeleriyle aynı: y - 4). */
export const FLOOR_LIFT = 4;

/** Hücre zemininin merkezi (ayak noktasının biraz üstü). */
export function cellCenter(slots: Pt[], slot: number): Pt {
  const s = slots[slot] ?? { x: 0, y: 0 };
  return { x: s.x, y: s.y - FLOOR_LIFT };
}

/**
 * Hücrenin zemin dörtgeni (4 köşe, saat yönünde: sol-üst, sağ-üst, sağ-alt, sol-alt ekranda ENEMY tarafı için). `fill` 1 = komşuyla tam bitişik,
 * 1'den küçük = aralık bırakır. Satır adımı = slots[lanes] - slots[0] (sıra yönü), şerit adımı = slots[1] - slots[0].
 */
export function cellQuad(slots: Pt[], lanes: number, slot: number, fill = 0.94): Pt[] {
  const c = cellCenter(slots, slot);
  const a = slots[0] ?? { x: 0, y: 0 };
  const rowStep = slots[lanes] ? { x: slots[lanes]!.x - a.x, y: slots[lanes]!.y - a.y } : { x: 180, y: 0 };
  const laneStep = slots[1] ? { x: slots[1]!.x - a.x, y: slots[1]!.y - a.y } : { x: 60, y: 56 };
  const r = { x: (rowStep.x * fill) / 2, y: (rowStep.y * fill) / 2 };
  const l = { x: (laneStep.x * fill) / 2, y: (laneStep.y * fill) / 2 };
  return [
    { x: c.x - r.x - l.x, y: c.y - r.y - l.y },
    { x: c.x + r.x - l.x, y: c.y + r.y - l.y },
    { x: c.x + r.x + l.x, y: c.y + r.y + l.y },
    { x: c.x - r.x + l.x, y: c.y - r.y + l.y },
  ];
}

/** Nokta çokgenin içinde mi (dışbükey/içbükey; ışın atma)? */
export function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * İmleç hangi hücrenin üstünde? Önce zemin dörtgenleri (boşluksuz); yoksa karakter gövdesi (ayak noktasından yukarı `body.h`, yanlara `body.w / 2`):
 * birden çok gövde çakışırsa öndeki (ayak noktası en aşağıda olan) kazanır. Hiçbiri değilse null.
 */
export function pickCell(slots: Pt[], lanes: number, x: number, y: number, body?: { w: number; h: number }): number | null {
  for (let slot = 0; slot < slots.length; slot++) if (pointInPoly(cellQuad(slots, lanes, slot, 1), x, y)) return slot;
  if (!body) return null;
  let best: number | null = null;
  for (let slot = 0; slot < slots.length; slot++) {
    const s = slots[slot]!;
    if (Math.abs(x - s.x) <= body.w / 2 && y <= s.y && y >= s.y - body.h && (best === null || s.y > slots[best]!.y)) best = slot;
  }
  return best;
}

/** Ekran çerçevesi (sınır kutusu) tüm hücreleri + gövdeleri kapsayacak şekilde: etkileşim bölgesi için. */
export function boardBounds(slots: Pt[], body: { w: number; h: number }, pad = 16): { x0: number; y0: number; x1: number; y1: number } {
  const xs = slots.map((s) => s.x);
  const ys = slots.map((s) => s.y);
  return { x0: Math.min(...xs) - body.w / 2 - pad, y0: Math.min(...ys) - body.h - pad, x1: Math.max(...xs) + body.w / 2 + pad, y1: Math.max(...ys) + 34 };
}

/**
 * Kapsanan hücrelerin EKRANDAKİ sol-alt köşe hücresi (en soldaki sütunun en alt satırı). Rect için bu, dikdörtgenin gerçek sol-alt köşesidir:
 * tahtaya sığsın diye kaydıysa fare hücresinden (anchor) farklı olabilir. Boş liste = null.
 */
export function bottomLeftSlot(cells: number[], board: Side, formation: ShapeFormation): number | null {
  let best: number | null = null;
  let bc = 0;
  let br = 0;
  for (const slot of cells) {
    const g = screenCellOf(formation, board, slot);
    if (best === null || g.col < bc || (g.col === bc && g.row > br)) {
      best = slot;
      bc = g.col;
      br = g.row;
    }
  }
  return best;
}

export interface ShapeMarks {
  /** Fare hücresi (anchor). */
  anchor: number;
  /** Dikdörtgenin gerçek sol-alt köşe hücresi (yalnızca rect). */
  corner: number | null;
  /** Rect tahtaya sığsın diye kaydı mı (köşe fare hücresinden farklı)? */
  shifted: boolean;
}

/** Hover işaretleri: anchor her zaman işaretlenir; rect'te gerçek sol-alt köşe ve kayma bilgisi eklenir. */
export function shapeMarks(isRect: boolean, cells: number[], anchor: number, board: Side, formation: ShapeFormation): ShapeMarks {
  if (!isRect) return { anchor, corner: null, shifted: false };
  const corner = bottomLeftSlot(cells, board, formation);
  return { anchor, corner, shifted: corner !== null && corner !== anchor };
}
