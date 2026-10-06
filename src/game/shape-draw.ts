import Phaser from 'phaser';
import type { MiniShape } from '../ui/shape-diagram';
import { GOLD } from './ui-frame';

/** Şekil şemasının (mini ızgara) piksel boyutu. */
export function miniShapeSize(mini: MiniShape, cell = 11, gap = 2): { w: number; h: number } {
  return { w: mini.cols * cell + (mini.cols - 1) * gap + 8, h: mini.rows * cell + (mini.rows - 1) * gap + 8 };
}

/**
 * Tooltip'teki küçük şekil şeması: koyu plaka, kapsanan hücreler altın/turuncu boyalı, kapsanmayanlar silik; anchor hücrede küçük beyaz elmas.
 * (x, y) şemanın sol-üst köşesi.
 */
export function drawMiniShape(scene: Phaser.Scene, x: number, y: number, mini: MiniShape, cell = 11, gap = 2): Phaser.GameObjects.Graphics {
  const { w, h } = miniShapeSize(mini, cell, gap);
  const g = scene.add.graphics();
  g.fillStyle(0x0b0806, 0.95).fillRoundedRect(x, y, w, h, 4);
  g.lineStyle(1.5, GOLD.edge, 0.9).strokeRoundedRect(x, y, w, h, 4);
  for (const c of mini.cells) {
    const cx = x + 4 + c.col * (cell + gap);
    const cy = y + 4 + c.row * (cell + gap);
    if (c.on) {
      g.fillStyle(0xffb347, 0.95).fillRect(cx, cy, cell, cell);
      g.fillStyle(0xffffff, 0.25).fillRect(cx, cy, cell, 2);
    } else g.fillStyle(0x3a2d1f, 0.9).fillRect(cx, cy, cell, cell);
    if (c.anchor) {
      const mx = cx + cell / 2;
      const my = cy + cell / 2;
      g.fillStyle(0x1a0f06, 1).fillPoints([{ x: mx, y: my - 4.5 }, { x: mx + 4.5, y: my }, { x: mx, y: my + 4.5 }, { x: mx - 4.5, y: my }], true);
      g.fillStyle(0xfff6d6, 1).fillPoints([{ x: mx, y: my - 3 }, { x: mx + 3, y: my }, { x: mx, y: my + 3 }, { x: mx - 3, y: my }], true);
    }
  }
  return g;
}
