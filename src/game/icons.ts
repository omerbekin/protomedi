import Phaser from 'phaser';
import type { SkillDef } from '../engine';
import { isIconKind, type IconKind } from '../ui/icon-kinds';

/**
 * Placeholder ikonlar: kodla çizilen 64x64 basit semboller (skill ikonları, class logoları, stat ikonları).
 * Gerçek ikon gelince `assets/icons/<ad>.png` konup buradan yüklenebilir; şimdilik hepsi üretilir.
 */
const SIZE = 64;
const WHITE = 0xf4ede1;
const DARK = 0x1a1410;

type G = Phaser.GameObjects.Graphics;
type Painter = (g: G, c: number) => void;

const pts = (...xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2]!, y: xy[i * 2 + 1]! }));

const leafShape = (g: G, c: number, ox: number, oy: number, s: number) => {
  g.fillStyle(c).fillPoints(pts(ox + 14 * s, oy + 50 * s, ox + 20 * s, oy + 22 * s, ox + 44 * s, oy + 12 * s, ox + 50 * s, oy + 30 * s, ox + 36 * s, oy + 50 * s), true);
  g.lineStyle(2, WHITE).lineBetween(ox + 16 * s, oy + 48 * s, ox + 44 * s, oy + 16 * s);
};

const arrowHead = (g: G, c: number, x: number, y: number, dx: number, dy: number) => {
  // (dx, dy): birim yön; uç noktası (x, y)
  const px = -dy;
  const py = dx;
  g.fillStyle(c).fillTriangle(x + dx * 8, y + dy * 8, x - dx * 8 + px * 8, y - dy * 8 + py * 8, x - dx * 8 - px * 8, y - dy * 8 - py * 8);
};

const shieldShape = (g: G, fill: number, outline: number, ox = 0, oy = 0, s = 1) => {
  const p = pts(ox + 32 * s, oy + 8 * s, ox + 52 * s, oy + 15 * s, ox + 50 * s, oy + 36 * s, ox + 32 * s, oy + 56 * s, ox + 14 * s, oy + 36 * s, ox + 12 * s, oy + 15 * s);
  g.fillStyle(fill).fillPoints(p, true);
  g.lineStyle(3, outline).strokePoints(p, true);
};

const PAINTERS: Record<IconKind, Painter> = {
  // --- skill ikonları ---
  sword: (g, c) => {
    g.lineStyle(6, WHITE).lineBetween(18, 46, 44, 18);
    g.lineStyle(5, c).lineBetween(11, 39, 25, 53);
    g.lineStyle(5, c).lineBetween(18, 46, 12, 54);
  },
  bigsword: (g, c) => {
    g.lineStyle(9, WHITE).lineBetween(18, 46, 46, 16);
    g.lineStyle(7, c).lineBetween(9, 38, 26, 55);
    g.lineStyle(7, c).lineBetween(18, 46, 11, 56);
    g.fillStyle(c).fillTriangle(50, 6, 56, 12, 46, 14);
  },
  swirl: (g, c) => {
    g.lineStyle(5, c).beginPath().arc(32, 32, 18, 0.3 * Math.PI, 1.7 * Math.PI, false).strokePath();
    g.lineStyle(4, WHITE).beginPath().arc(32, 32, 9, 1.2 * Math.PI, 2.6 * Math.PI, false).strokePath();
    arrowHead(g, c, 49, 24, 0.4, -0.9);
  },
  shield: (g, c) => {
    shieldShape(g, c, WHITE);
    g.lineStyle(3, WHITE).lineBetween(32, 14, 32, 48);
  },
  holy: (g, c) => {
    g.lineStyle(4, c);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.lineBetween(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
    }
    g.fillStyle(WHITE).fillCircle(32, 32, 10);
  },
  cross: (g, c) => {
    g.fillStyle(c).fillRect(25, 10, 14, 44).fillRect(10, 25, 44, 14);
    g.lineStyle(3, WHITE).strokeRect(25, 10, 14, 44);
  },
  burst: (g, c) => {
    g.lineStyle(4, c);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const r = i % 2 === 0 ? 26 : 19;
      g.lineBetween(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9, 32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fillStyle(WHITE).fillCircle(32, 32, 8);
  },
  hammer: (g, c) => {
    g.fillStyle(c).fillRect(29, 24, 7, 32);
    g.fillStyle(WHITE).fillRect(14, 10, 36, 18);
    g.lineStyle(3, c).strokeRect(14, 10, 36, 18);
  },
  flame: (g, c) => {
    g.fillStyle(c).fillTriangle(32, 6, 49, 40, 15, 40).fillCircle(32, 40, 17);
    g.fillStyle(WHITE).fillTriangle(32, 26, 40, 46, 24, 46).fillCircle(32, 46, 8);
  },
  snow: (g) => {
    g.lineStyle(4, WHITE);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.lineBetween(32 - Math.cos(a) * 24, 32 - Math.sin(a) * 24, 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
    }
    g.fillStyle(0x8fd8ff).fillCircle(32, 32, 6);
  },
  meteor: (g, c) => {
    g.lineStyle(10, WHITE, 0.75).lineBetween(34, 30, 56, 8);
    g.lineStyle(5, c, 0.9).lineBetween(30, 36, 54, 14);
    g.fillStyle(c).fillCircle(25, 40, 15);
    g.fillStyle(WHITE).fillCircle(21, 36, 5);
  },
  barrier: (g, c) => {
    g.fillStyle(c, 0.3).fillCircle(32, 32, 22);
    g.lineStyle(5, c).strokeCircle(32, 32, 22);
    g.lineStyle(4, WHITE).beginPath().arc(32, 32, 14, 1.1 * Math.PI, 1.6 * Math.PI, false).strokePath();
  },
  bone: (g) => {
    g.lineStyle(8, WHITE).lineBetween(18, 46, 46, 18);
    for (const [x, y] of [[14, 42], [20, 50], [44, 14], [50, 22]] as const) g.fillStyle(WHITE).fillCircle(x, y, 6);
  },
  drain: (g, c) => {
    g.lineStyle(5, c).strokeCircle(32, 32, 22);
    g.lineStyle(4, WHITE).strokeCircle(32, 32, 13);
    g.fillStyle(c).fillCircle(32, 32, 5);
  },
  drop: (g, c) => {
    g.fillStyle(c).fillTriangle(32, 7, 48, 36, 16, 36).fillCircle(32, 40, 16);
    g.fillStyle(WHITE).fillCircle(26, 38, 4);
  },
  wail: (g, c) => {
    g.fillStyle(WHITE).fillCircle(32, 26, 15).fillRect(17, 26, 30, 24);
    g.fillTriangle(17, 50, 25, 50, 21, 58).fillTriangle(27, 50, 37, 50, 32, 58).fillTriangle(39, 50, 47, 50, 43, 58);
    g.fillStyle(DARK).fillCircle(26, 25, 3).fillCircle(38, 25, 3).fillEllipse(32, 36, 8, 10);
    g.lineStyle(3, c).strokeCircle(32, 26, 19);
  },
  arrow: (g, c) => {
    g.lineStyle(5, WHITE).lineBetween(14, 50, 46, 18);
    g.lineStyle(3, c).lineBetween(14, 50, 12, 42).lineBetween(14, 50, 22, 52).lineBetween(20, 44, 16, 40);
    arrowHead(g, c, 50, 14, 0.7, -0.7);
  },
  pierce: (g, c) => {
    g.lineStyle(5, WHITE).lineBetween(8, 52, 54, 12);
    arrowHead(g, c, 56, 10, 0.76, -0.65);
    g.lineStyle(4, c).strokeCircle(30, 32, 12);
  },
  arrows: (g, c) => {
    for (const x of [16, 32, 48]) {
      g.lineStyle(4, WHITE).lineBetween(x, 6, x, 40);
      arrowHead(g, c, x, 48, 0, 1);
    }
  },
  target: (g, c) => {
    g.lineStyle(4, c).strokeCircle(32, 32, 22);
    g.lineStyle(3, WHITE).strokeCircle(32, 32, 13);
    g.fillStyle(c).fillCircle(32, 32, 5);
    g.lineStyle(3, WHITE).lineBetween(32, 4, 32, 16).lineBetween(32, 48, 32, 60).lineBetween(4, 32, 16, 32).lineBetween(48, 32, 60, 32);
  },
  thorn: (g, c) => {
    g.lineStyle(5, c).lineBetween(10, 50, 24, 36).lineBetween(24, 36, 36, 42).lineBetween(36, 42, 50, 18);
    g.fillStyle(WHITE).fillTriangle(24, 36, 20, 28, 30, 32).fillTriangle(36, 42, 34, 52, 42, 46).fillTriangle(50, 18, 56, 24, 46, 24);
  },
  leaf: (g, c) => leafShape(g, c, 0, 0, 1),
  tree: (g, c) => {
    g.fillStyle(0x6b4423).fillRect(28, 34, 8, 22);
    g.fillStyle(c).fillCircle(32, 22, 14).fillCircle(21, 31, 11).fillCircle(43, 31, 11);
  },
  leaves: (g, c) => {
    leafShape(g, c, -6, -4, 0.7);
    leafShape(g, c, 18, -6, 0.7);
    leafShape(g, c, 6, 16, 0.7);
  },
  fist: (g, c) => {
    g.fillStyle(WHITE).fillRoundedRect(16, 24, 32, 26, 6);
    for (let i = 0; i < 4; i++) g.fillCircle(21 + i * 7, 22, 4.5);
    g.lineStyle(4, c).lineBetween(18, 38, 46, 38);
  },
  bash: (g, c) => {
    shieldShape(g, c, WHITE, -2, 6, 0.8);
    g.lineStyle(4, WHITE);
    for (const [x1, y1, x2, y2] of [[44, 12, 58, 6], [46, 22, 60, 22], [44, 32, 58, 38]] as const) g.lineBetween(x1, y1, x2, y2);
  },
  roar: (g, c) => {
    g.fillStyle(c).fillPoints(pts(12, 26, 28, 26, 44, 12, 44, 52, 28, 38, 12, 38), true);
    g.lineStyle(4, WHITE).beginPath().arc(46, 32, 8, -0.8, 0.8, false).strokePath();
    g.lineStyle(4, WHITE).beginPath().arc(46, 32, 15, -0.8, 0.8, false).strokePath();
  },
  guardian: (g, c) => {
    shieldShape(g, c, WHITE, 6, 2, 0.8);
    shieldShape(g, WHITE, c, -6, 10, 0.8);
  },
  crush: (g, c) => {
    shieldShape(g, c, WHITE);
    g.lineStyle(4, DARK).lineBetween(32, 12, 28, 26).lineBetween(28, 26, 36, 34).lineBetween(36, 34, 30, 46);
    g.lineStyle(2, WHITE).lineBetween(32, 12, 28, 26).lineBetween(28, 26, 36, 34).lineBetween(36, 34, 30, 46);
  },
  manaburn: (g, c) => {
    g.fillStyle(0x4f8cff).fillTriangle(32, 14, 46, 42, 18, 42).fillCircle(32, 44, 14);
    g.fillStyle(c).fillTriangle(32, 2, 42, 22, 22, 22);
    g.fillStyle(WHITE).fillCircle(26, 42, 4);
  },
  drainfield: (g, c) => {
    g.lineStyle(4, c).strokeCircle(32, 32, 22);
    g.lineStyle(3, WHITE).strokeCircle(32, 32, 11);
    for (const [x, y, dx, dy] of [[8, 8, 1, 1], [56, 8, -1, 1], [8, 56, 1, -1], [56, 56, -1, -1]] as const) {
      g.lineStyle(3, WHITE).lineBetween(x, y, x + dx * 14, y + dy * 14);
      arrowHead(g, c, x + dx * 18, y + dy * 18, dx * 0.7, dy * 0.7);
    }
  },
  void: (g, c) => {
    g.lineStyle(4, c).strokeCircle(32, 32, 24);
    g.fillStyle(0x1a0a2a).fillCircle(32, 32, 17);
    g.lineStyle(3, c).strokeCircle(32, 32, 17);
    g.fillStyle(WHITE).fillCircle(20, 18, 2).fillCircle(46, 44, 2).fillCircle(44, 14, 1.5);
  },
  rune: (g, c) => {
    const d = pts(32, 6, 56, 32, 32, 58, 8, 32);
    g.fillStyle(c, 0.35).fillPoints(d, true);
    g.lineStyle(4, c).strokePoints(d, true);
    g.lineStyle(4, WHITE).lineBetween(32, 18, 32, 46).lineBetween(22, 28, 32, 36).lineBetween(42, 28, 32, 36);
  },

  // --- class logoları ---
  helm: (g, c) => {
    g.fillStyle(WHITE).beginPath().arc(32, 32, 20, Math.PI, 2 * Math.PI, false).closePath().fillPath();
    g.fillRect(12, 32, 40, 18);
    g.fillStyle(DARK).fillRect(18, 34, 28, 6).fillRect(30, 40, 4, 10);
    g.fillStyle(c).fillTriangle(32, 4, 24, 16, 40, 16);
  },
  wizhat: (g, c) => {
    g.fillStyle(c).fillTriangle(14, 46, 50, 46, 38, 6);
    g.fillStyle(WHITE).fillEllipse(32, 48, 52, 12);
    g.fillStyle(0xffe066).fillCircle(36, 26, 4);
  },
  skull: (g) => {
    g.fillStyle(WHITE).fillCircle(32, 28, 20).fillRect(20, 38, 24, 16);
    g.fillStyle(DARK).fillCircle(24, 28, 6).fillCircle(40, 28, 6).fillTriangle(32, 34, 28, 42, 36, 42);
    g.lineStyle(2, DARK).lineBetween(26, 46, 26, 54).lineBetween(32, 46, 32, 54).lineBetween(38, 46, 38, 54);
  },
  bow: (g, c) => {
    g.lineStyle(5, c).beginPath().arc(24, 32, 24, -0.9, 0.9, false).strokePath();
    g.lineStyle(2, WHITE).lineBetween(39, 12, 39, 52);
    g.lineStyle(4, WHITE).lineBetween(14, 32, 54, 32);
    arrowHead(g, WHITE, 56, 32, 1, 0);
  },
  bulwark: (g, c) => {
    g.fillStyle(c).fillRoundedRect(14, 6, 36, 52, 8);
    g.lineStyle(4, WHITE).strokeRoundedRect(14, 6, 36, 52, 8);
    g.lineStyle(3, WHITE).lineBetween(32, 10, 32, 54).lineBetween(18, 28, 46, 28);
    g.fillStyle(WHITE).fillCircle(22, 16, 2.5).fillCircle(42, 16, 2.5).fillCircle(22, 42, 2.5).fillCircle(42, 42, 2.5);
  },
  nullsphere: (g, c) => {
    g.fillStyle(c, 0.4).fillCircle(32, 32, 22);
    g.lineStyle(5, c).strokeCircle(32, 32, 22);
    g.lineStyle(6, WHITE).lineBetween(16, 48, 48, 16);
    g.fillStyle(WHITE).fillCircle(32, 32, 4);
  },

  // Orta parmak: Taunt
  finger: (g, c) => {
    g.fillStyle(WHITE).fillRoundedRect(14, 34, 36, 24, 8);
    g.fillStyle(c).fillRoundedRect(27, 4, 11, 36, 5); // havaya kalkan orta parmak
    g.fillStyle(WHITE).fillRoundedRect(16, 26, 10, 14, 5).fillRoundedRect(39, 26, 10, 14, 5).fillRoundedRect(8, 38, 10, 10, 5);
    g.lineStyle(2, DARK).strokeRoundedRect(27, 4, 11, 36, 5).strokeRoundedRect(14, 34, 36, 24, 8);
  },
  // --- stat ikonları ---
  hourglass: (g, c) => {
    g.fillStyle(c).fillPoints(pts(16, 8, 48, 8, 48, 14, 36, 32, 48, 50, 48, 56, 16, 56, 16, 50, 28, 32, 16, 14), true);
    g.fillStyle(WHITE).fillPoints(pts(22, 14, 42, 14, 32, 30), true).fillPoints(pts(32, 36, 42, 50, 22, 50), true);
    g.lineStyle(4, WHITE).lineBetween(12, 8, 52, 8).lineBetween(12, 56, 52, 56);
  },
  muscle: (g, c) => {
    g.lineStyle(10, WHITE).lineBetween(10, 50, 28, 42);
    g.fillStyle(c).fillCircle(32, 34, 13);
    g.lineStyle(10, WHITE).lineBetween(34, 38, 46, 14);
    g.fillStyle(WHITE).fillCircle(48, 12, 8);
    g.lineStyle(3, DARK).beginPath().arc(30, 30, 8, 3.4, 5.2, false).strokePath();
  },
  wand: (g, c) => {
    g.lineStyle(6, 0x8a6a3a).lineBetween(12, 54, 40, 26);
    g.lineStyle(2, WHITE).lineBetween(12, 54, 40, 26);
    g.fillStyle(c).fillPoints(pts(46, 6, 50, 16, 60, 18, 52, 24, 54, 34, 46, 28, 38, 34, 40, 24, 32, 18, 42, 16), true);
    g.fillStyle(WHITE).fillCircle(22, 14, 2.5).fillCircle(14, 28, 2).fillCircle(56, 44, 2.5);
  },
  feather: (g, c) => {
    g.fillStyle(c).fillPoints(pts(12, 52, 18, 30, 40, 8, 54, 10, 52, 28, 30, 48), true);
    g.lineStyle(3, WHITE).lineBetween(14, 52, 48, 14);
    g.lineStyle(2, WHITE).lineBetween(26, 36, 36, 38).lineBetween(32, 28, 42, 30).lineBetween(38, 20, 46, 22);
  },
  clover: (g, c) => {
    g.fillStyle(c).fillCircle(24, 22, 12).fillCircle(40, 22, 12).fillCircle(24, 38, 12).fillCircle(40, 38, 12);
    g.fillStyle(WHITE, 0.35).fillCircle(21, 19, 4).fillCircle(37, 19, 4);
    g.lineStyle(4, 0x6b4423).lineBetween(32, 34, 40, 58);
  },
  boot: (g, c) => {
    g.fillStyle(c).fillPoints(pts(20, 8, 38, 8, 38, 34, 54, 42, 54, 54, 16, 54, 16, 40, 20, 40), true);
    g.lineStyle(3, WHITE).strokePoints(pts(20, 8, 38, 8, 38, 34, 54, 42, 54, 54, 16, 54, 16, 40, 20, 40), true);
    g.lineStyle(3, WHITE).lineBetween(8, 24, 18, 24).lineBetween(6, 32, 18, 32);
  },
  blast: (g, c) => {
    const spikes: { x: number; y: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 === 0 ? 28 : 15;
      spikes.push({ x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r });
    }
    g.fillStyle(c).fillPoints(spikes, true);
    g.fillStyle(WHITE).fillCircle(32, 32, 9);
  },
  heart: (g, c) => {
    g.fillStyle(c).fillCircle(22, 24, 14).fillCircle(42, 24, 14).fillTriangle(9, 30, 55, 30, 32, 56);
    g.fillStyle(WHITE, 0.4).fillCircle(18, 20, 4);
  },
  droplet: (g, c) => {
    g.fillStyle(c).fillTriangle(32, 6, 48, 38, 16, 38).fillCircle(32, 40, 16);
    g.fillStyle(WHITE, 0.5).fillCircle(25, 38, 4);
  },
};

const iconKey = (kind: string, hex: string, framed: boolean) => `icon:${kind}:${hex}:${framed ? 'f' : 'n'}`;

/**
 * Bir ikon türünün dokusunu (yoksa) üretir ve anahtarını döndürür. `framed`: koyu zemin ve renkli çerçeve (skill ikonu);
 * çerçevesiz: yalnızca sembol (stat ve logo). Bilinmeyen tür düz bir daireye düşer.
 */
export function ensureIcon(scene: Phaser.Scene, kind: string, hex: string, framed = true): string {
  const key = iconKey(kind, hex, framed);
  if (scene.textures.exists(key)) return key;
  const c = Phaser.Display.Color.HexStringToColor(hex).color;
  const g = scene.make.graphics({}, false);
  if (framed) {
    g.fillStyle(DARK, 0.92).fillRoundedRect(1, 1, SIZE - 2, SIZE - 2, 10);
    g.lineStyle(3, c).strokeRoundedRect(1.5, 1.5, SIZE - 3, SIZE - 3, 10);
  }
  if (isIconKind(kind)) PAINTERS[kind](g, c);
  else g.fillStyle(c).fillCircle(32, 32, 18);
  g.generateTexture(key, SIZE, SIZE);
  g.destroy();
  return key;
}

/** Skill ikonu: skill'in `fx` renginde, çerçeveli. */
export const ensureSkillIcon = (scene: Phaser.Scene, skill: SkillDef): string => ensureIcon(scene, skill.icon, skill.fx, true);
