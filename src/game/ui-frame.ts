import Phaser from 'phaser';

/**
 * Alt bar ve sıra çubuğu için ortak "medieval çerçeve" yardımcıları: koyu deri/taş degradesi, tane dokusu,
 * altın/bronz çok katmanlı kenar, iç gölge, köşe süsleri. Hepsi Graphics ile çizilir (dışarıdan asset yok).
 */
export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';

export const GOLD = {
  dark: 0x6b4f26,
  edge: 0x9a7438,
  light: 0xe8c47e,
  bright: 0xffe29a,
} as const;

/** Küçük, döşenebilir bir gürültü dokusu (taş/deri tanesi); bir kez üretilir. */
export function ensureGrain(scene: Phaser.Scene): string {
  const key = 'ui-grain';
  if (scene.textures.exists(key)) return key;
  const size = 192;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const v = rnd();
    const light = v > 0.5;
    img.data[i * 4] = light ? 255 : 0;
    img.data[i * 4 + 1] = light ? 235 : 0;
    img.data[i * 4 + 2] = light ? 200 : 0;
    img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 46);
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

/** Dikey degrade dolgu. */
export function gradientRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, alpha = 1): void {
  g.fillGradientStyle(top, top, bottom, bottom, alpha).fillRect(x, y, w, h);
}

/** Çok katmanlı altın/bronz çerçeve + iç gölge. `bevel` küçük çerçeveler için daraltılabilir. */
export function frameRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { edge?: number; light?: number; bevel?: number; alpha?: number; shadow?: number } = {},
): void {
  const edge = o.edge ?? GOLD.edge;
  const light = o.light ?? GOLD.light;
  const b = o.bevel ?? 4;
  const a = o.alpha ?? 1;
  g.lineStyle(1, 0x050302, a).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  g.lineStyle(b - 1, edge, a).strokeRect(x + (b - 1) / 2 + 0.5, y + (b - 1) / 2 + 0.5, w - b, h - b);
  g.lineStyle(1, light, 0.8 * a).strokeRect(x + b + 1.5, y + b + 1.5, w - 2 * b - 3, h - 2 * b - 3);
  const sh = o.shadow ?? 0.4;
  for (let i = 0; i < 4; i++) {
    g.lineStyle(1, 0x000000, (sh - i * 0.09) * a).strokeRect(x + b + 3.5 + i, y + b + 3.5 + i, w - 2 * (b + 3.5 + i), h - 2 * (b + 3.5 + i));
  }
}

/** Köşelerde altın elmas + L şeklinde ince süs. */
export function cornerOrnaments(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, size = 6, alpha = 1): void {
  const corners: Array<[number, number, number, number]> = [
    [x + 2, y + 2, 1, 1],
    [x + w - 2, y + 2, -1, 1],
    [x + 2, y + h - 2, 1, -1],
    [x + w - 2, y + h - 2, -1, -1],
  ];
  const len = size * 2.6;
  for (const [cx, cy, dx, dy] of corners) {
    g.lineStyle(2, GOLD.bright, 0.9 * alpha);
    g.lineBetween(cx + dx * 3, cy + dy * 3, cx + dx * (3 + len), cy + dy * 3);
    g.lineBetween(cx + dx * 3, cy + dy * 3, cx + dx * 3, cy + dy * (3 + len));
    const pts = [
      { x: cx + dx * 3, y: cy + dy * 3 - size },
      { x: cx + dx * 3 + size, y: cy + dy * 3 },
      { x: cx + dx * 3, y: cy + dy * 3 + size },
      { x: cx + dx * 3 - size, y: cy + dy * 3 },
    ];
    g.fillStyle(0x1a1008, alpha).fillPoints(pts, true);
    g.lineStyle(1.5, GOLD.light, alpha).strokePoints(pts, true);
  }
}

/** Dışa doğru sönen ışıma (seçili/çok güçlü skill vurgusu). */
export function glowRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hex: number, alpha = 0.5, spread = 8): void {
  for (let i = 0; i < spread; i++) {
    g.lineStyle(2, hex, alpha * (1 - i / spread) * 0.55).strokeRect(x - 1 - i * 1.5, y - 1 - i * 1.5, w + 2 + i * 3, h + 2 + i * 3);
  }
}

/** Taş/deri paneli: degrade zemin + tane dokusu + çerçeve. Döndürdüğü nesneler bir container'a konabilir. */
export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { top?: number; bottom?: number; edge?: number; light?: number; bevel?: number; ornaments?: boolean; grain?: number; alpha?: number } = {},
): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics();
  gradientRect(g, x, y, w, h, o.top ?? 0x2b2017, o.bottom ?? 0x0f0a07, o.alpha ?? 1);
  const grain = scene.add.tileSprite(x, y, w, h, ensureGrain(scene)).setOrigin(0, 0).setAlpha(o.grain ?? 0.7);
  const f = scene.add.graphics();
  frameRect(f, x, y, w, h, { edge: o.edge, light: o.light, bevel: o.bevel });
  if (o.ornaments !== false) cornerOrnaments(f, x, y, w, h, Math.max(3, (o.bevel ?? 4) + 1));
  return [g, grain, f];
}

/** Sağ üst köşe rozeti: koyu hap + altın kontur. Metin sola/sağa göre ölçülür; sağ kenar `right`. */
export function makeBadge(scene: Phaser.Scene, right: number, top: number, label: string, size = 14): Phaser.GameObjects.GameObject[] {
  const text = scene.add.text(0, 0, label.toUpperCase(), { fontFamily: SERIF, fontSize: `${size}px`, fontStyle: 'bold', color: '#f3d9a0', stroke: '#0c0805', strokeThickness: 2 });
  const padX = 10;
  const w = text.width + padX * 2;
  const h = text.height + 6;
  const g = scene.add.graphics();
  g.fillStyle(0x120c07, 0.95).fillRoundedRect(right - w, top, w, h, 6);
  g.lineStyle(2, GOLD.edge, 1).strokeRoundedRect(right - w, top, w, h, 6);
  g.lineStyle(1, GOLD.light, 0.7).strokeRoundedRect(right - w + 3, top + 3, w - 6, h - 6, 4);
  text.setPosition(right - w + padX, top + 3);
  return [g, text];
}
