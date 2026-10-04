import Phaser from 'phaser';
import type { SkillDef } from '../engine';
import { GRID, INTERNAL_TOKEN_VALUES, shadeColor, spriteCells } from './pixel-art';

/**
 * Piksel art ikon dokuları. Çizimler src/game/pixel-art.ts motoruyla 32x32'lik ızgaralara çizilir (otomatik kontur + ışık/gölge);
 * burada 1:1 Phaser dokusuna çevrilir ve NEAREST filtreyle keskin gösterilir.
 */
const UNIT = 1;
const FRAME = 6; // çerçeveli skill ikonu: 3 piksel çerçeve + 3 piksel boşluk
const FRAME_GRID = GRID + FRAME * 2;

const iconKey = (kind: string, hex: string, framed: boolean) => `icon:${kind}:${hex}:${framed ? 'f' : 'n'}`;

const css = (v: number) => `#${v.toString(16).padStart(6, '0')}`;

/**
 * Bir ikon türünün dokusunu (yoksa) üretir ve anahtarını döndürür. `framed`: koyu zemin ve renkli çerçeve (skill ikonu);
 * çerçevesiz: yalnızca sembol (stat, logo, rozet). Bilinmeyen tür düz bir kareye düşer.
 */
export function ensureIcon(scene: Phaser.Scene, kind: string, hex: string, framed = true): string {
  const key = iconKey(kind, hex, framed);
  if (scene.textures.exists(key)) return key;
  const cells =
    spriteCells(kind) ?? Array.from({ length: GRID }, (_, y) => Array.from({ length: GRID }, (_, x) => ({ t: x > 15 && x < 48 && y > 15 && y < 48 ? 'a' : '.', s: 0 })));
  const pal = INTERNAL_TOKEN_VALUES(hex);
  const size = framed ? FRAME_GRID : GRID;
  const tex = scene.textures.createCanvas(key, size * UNIT, size * UNIT);
  if (!tex) return key;
  const ctx = tex.getContext();
  const px = (x: number, y: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * UNIT, y * UNIT, UNIT, UNIT);
  };
  if (framed) {
    const accent = css(pal.a!);
    const cut = 6; // köşe kesiği
    for (let y = 0; y < FRAME_GRID; y++)
      for (let x = 0; x < FRAME_GRID; x++) {
        const dx = Math.min(x, FRAME_GRID - 1 - x);
        const dy = Math.min(y, FRAME_GRID - 1 - y);
        if (dx + dy < cut) continue;
        if (dx < 3 || dy < 3) px(x, y, accent);
        else px(x, y, '#1a1410', 0.92);
      }
  }
  const off = framed ? FRAME : 0;
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.t === '.') return;
      const v = pal[cell.t];
      px(x + off, y + off, v === undefined ? '#ff00ff' : css(shadeColor(v, cell.s)));
    });
  });
  ctx.globalAlpha = 1;
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** Skill ikonu: skill'in `fx` renginde, çerçeveli. */
export const ensureSkillIcon = (scene: Phaser.Scene, skill: SkillDef): string => ensureIcon(scene, skill.icon, skill.fx, true);
