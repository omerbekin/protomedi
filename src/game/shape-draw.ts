import Phaser from 'phaser';
import type { MiniShape } from '../ui/shape-diagram';
import { CELL_HUE, cellOutlineEdges, cellStyle, stageAlpha } from './cell-style';
import type { CellState, CellTone, Pt } from './cell-style';
import { cellQuad } from './shape-geometry';
import { GOLD, SERIF } from './ui-frame';

/**
 * ORTAK HÜCRE PLAKASI (CellTile): yuva/hedef seçiminin her yerinde (Move Tile, tek/dost hedef, diriltme, şekil ve alan skill'leri, takım seçimi)
 * aynı çizim. Zemine yatan, ince çerçeveli, yarı saydam dolgulu eğik dörtgen; komşu hücreler birleşik görünür (içeride ızgara, dışarıda belirgin hat).
 * Durumlar ve renkler: `cell-style.ts`.
 */
export interface CellTileSpec {
  slot: number;
  state: CellState;
  tone?: CellTone;
  /** Aşamalı vuruş: 1 tabanlı aşama numarası (varsa soluklaşma + köşede küçük rakam). */
  stage?: number;
}

/** Tek bir dörtgenin plakası (keyfi dörtgen: takım seçimi dikdörtgen slotları da bunu kullanır). */
export function drawQuadTile(g: Phaser.GameObjects.Graphics, quad: Pt[], state: CellState, tone: CellTone = 'neutral', alphaMul = 1): void {
  const s = cellStyle(state, tone);
  g.fillStyle(s.fill, s.fillAlpha * alphaMul).fillPoints(quad, true);
  g.lineStyle(s.lineWidth, s.line, s.lineAlpha * alphaMul).strokePoints(quad, true);
  if (s.corners) {
    // Köşe işaretleri: her köşede kenarlar boyunca kısa, parlak L
    g.lineStyle(s.lineWidth + 3, s.line, 1);
    for (let i = 0; i < 4; i++) {
      const p = quad[i]!;
      const a = quad[(i + 1) % 4]!;
      const b = quad[(i + 3) % 4]!;
      const toward = (to: Pt): Pt => ({ x: p.x + (to.x - p.x) * 0.26, y: p.y + (to.y - p.y) * 0.26 });
      const n1 = toward(a);
      const n2 = toward(b);
      g.beginPath().moveTo(n1.x, n1.y).lineTo(p.x, p.y).lineTo(n2.x, n2.y).strokePath();
    }
  }
}

/**
 * Bir hücre kümesini ortak plaka diliyle `g` içine çizer. Hücreler hafif içeri çekilmiş çizilir (içeride ızgara çizgisi), seçili (selectable
 * olmayan) hücrelerin BİRLEŞİK dış hattı ayrıca belirgin çizilir. Aşama numaraları küçük Text olarak döner (çağıran kapsayıcıya ekler).
 */
export function drawCellTiles(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, slots: Pt[], lanes: number, specs: CellTileSpec[]): Phaser.GameObjects.Text[] {
  const labels: Phaser.GameObjects.Text[] = [];
  const rows = Math.ceil(slots.length / lanes);
  // Zemin sırası: önce hafif (selectable), sonra güçlü; böylece parlak hücre komşu çizgiyi örter
  const rank = (s: CellTileSpec) => (s.state === 'selectable' ? 0 : s.state === 'anchor' ? 2 : 1);
  const sorted = [...specs].sort((a, b) => rank(a) - rank(b));
  for (const sp of sorted) {
    const mul = sp.stage ? stageAlpha(sp.stage) : 1;
    drawQuadTile(g, cellQuad(slots, lanes, sp.slot, 0.94), sp.state, sp.tone ?? 'neutral', mul);
    if (sp.stage) {
      const q = cellQuad(slots, lanes, sp.slot, 0.94);
      const c = { x: (q[0]!.x + q[2]!.x) / 2, y: (q[0]!.y + q[2]!.y) / 2 };
      const top = q.reduce((m, p) => (p.y < m.y ? p : m)); // en üstteki köşe
      const hue = CELL_HUE[sp.tone ?? 'neutral'];
      const t = scene.add
        .text(top.x + (c.x - top.x) * 0.34, top.y + (c.y - top.y) * 0.5, String(sp.stage), { fontFamily: SERIF, fontSize: '20px', fontStyle: 'bold', color: `#${hue.hi.toString(16).padStart(6, '0')}`, stroke: '#0c0805', strokeThickness: 3 })
        .setOrigin(0.5)
        .setAlpha(Math.max(0.6, mul));
      labels.push(t);
    }
  }
  // Birleşik dış hat: kümedeki aktif (selectable olmayan) hücrelerin dışa bakan kenarları, en güçlü hücrenin çizgi rengiyle
  const active = specs.filter((s) => s.state !== 'selectable');
  if (active.length > 0) {
    const lead = active.find((s) => s.state === 'anchor') ?? active[0]!;
    const st = cellStyle(lead.state === 'anchor' ? 'affected' : lead.state, lead.tone ?? 'neutral');
    const cells = active.map((s) => s.slot);
    g.lineStyle(st.lineWidth + 2, lead.state === 'invalid' ? st.line : CELL_HUE[lead.tone ?? 'neutral'].hi, Math.min(1, st.lineAlpha + 0.1));
    for (const [a, b] of cellOutlineEdges((slot) => cellQuad(slots, lanes, slot, 1), lanes, rows, cells)) g.beginPath().moveTo(a.x, a.y).lineTo(b.x, b.y).strokePath();
  }
  return labels;
}

/** Tek hücrelik plaka (CellTile): yeni bir Graphics döner. */
export function drawCellTile(scene: Phaser.Scene, slots: Pt[], lanes: number, slot: number, state: CellState, tone: CellTone = 'neutral'): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  drawCellTiles(scene, g, slots, lanes, [{ slot, state, tone }]);
  return g;
}

/** Şemanın yanındaki kısa notun (ör. 'either side') ayırdığı genişlik; not yoksa 0. */
export const MINI_NOTE_W = 62;

/** Şekil şemasının (mini ızgara) piksel boyutu (not varsa solundaki not alanı dahil). */
export function miniShapeSize(mini: MiniShape, cell = 11, gap = 2): { w: number; h: number } {
  return { w: mini.cols * cell + (mini.cols - 1) * gap + 8 + (mini.note ? MINI_NOTE_W : 0), h: mini.rows * cell + (mini.rows - 1) * gap + 8 };
}

/**
 * Tooltip'teki küçük şekil şeması (herhangi RxC): koyu plaka, kapsanan hücreler ortak palette dolu, kapsanmayanlar silik; anchor hücrede köşe işaretleri;
 * aşamalı vuruşta hücrede küçük rakam; çift vuruşlu merkezde (X şekli) '×2'; iki tahtaya atılabilen skill'de plakanın solunda kısa not ('either side').
 * (x, y) şemanın (not dahil) sol-üst köşesi. Graphics + varsa Text'leri içeren bir Container döner.
 */
export function drawMiniShape(scene: Phaser.Scene, x: number, y: number, mini: MiniShape, cell = 11, gap = 2): Phaser.GameObjects.Container {
  const full = miniShapeSize(mini, cell, gap);
  const noteW = mini.note ? MINI_NOTE_W : 0;
  const w = full.w - noteW;
  const h = full.h;
  const px0 = x + noteW; // plakanın sol kenarı
  const g = scene.add.graphics();
  const extras: Phaser.GameObjects.GameObject[] = [];
  g.fillStyle(0x0b0806, 0.95).fillRoundedRect(px0, y, w, h, 4);
  g.lineStyle(1.5, GOLD.edge, 0.9).strokeRoundedRect(px0, y, w, h, 4);
  if (mini.note) {
    extras.push(scene.add.text(px0 - 6, y + h / 2, mini.note.toUpperCase(), { fontFamily: SERIF, fontSize: '12px', fontStyle: 'bold', color: '#e6d3a3', stroke: '#0c0805', strokeThickness: 2, align: 'right', wordWrap: { width: noteW - 8 } }).setOrigin(1, 0.5));
  }
  const on = cellStyle('affected');
  for (const c of mini.cells) {
    const cx = px0 + 4 + c.col * (cell + gap);
    const cy = y + 4 + c.row * (cell + gap);
    if (c.on) {
      const a = c.stage ? stageAlpha(c.stage) : 1;
      g.fillStyle(on.fill, 0.35 + 0.6 * a).fillRect(cx, cy, cell, cell);
      g.lineStyle(1, CELL_HUE.neutral.hi, 0.9 * a).strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
    } else {
      g.fillStyle(0x3a2d1f, 0.9).fillRect(cx, cy, cell, cell);
    }
    if (c.anchor) {
      g.lineStyle(2, 0xffffff, 1);
      const k = 3.5;
      for (const [px, py, dx, dy] of [[cx, cy, 1, 1], [cx + cell, cy, -1, 1], [cx + cell, cy + cell, -1, -1], [cx, cy + cell, 1, -1]] as const) {
        g.beginPath().moveTo(px + dx * k, py).lineTo(px, py).lineTo(px, py + dy * k).strokePath();
      }
    }
    if (c.hits && c.hits > 1) {
      // Merkez birimi birden çok kez vurulur: hücrenin içinde, koyu rakam (hücre 11 px: '×N' sığmaz; açıklama metni 'struck N times' der)
      extras.push(scene.add.text(cx + cell / 2, cy + cell / 2 + 0.5, String(c.hits), { fontFamily: SERIF, fontSize: '11px', fontStyle: 'bold', color: '#2a1405' }).setOrigin(0.5));
    }
  }
  return scene.add.container(0, 0, [g, ...extras]);
}
