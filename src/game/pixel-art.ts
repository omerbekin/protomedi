/**
 * Piksel art ikon/sprite motoru: her çizim 64x64'lük bir ızgaraya (koordinatlar 32'lik uzayda, 2 kat ince piksel) kodla çizilir (kalın çizgi, daire, halka, çokgen...), ardından
 * otomatik koyu kontur ve ışık/gölge geçişi (sol-üst kenar aydınlık, sağ-alt kenar gölge) uygulanır. Phaser'a bağımlı değildir
 * (test edilebilir); doku üretimi src/game/icons.ts içinde yapılır. Çizimler: pixel-icons.ts (ikonlar), pixel-fx.ts (efekt sprite'ları).
 *
 * Renk jetonları: '.' boş, 'o' kontur, 'w' beyaz, 'l' açık gri, 'm' orta gri, 'd' koyu gri, 'k' koyu kahve, 'b' kahve, 'n' kum/ten,
 * 'y' altın, 'Y' koyu altın, 'r' kırmızı, 'R' koyu kırmızı, 'f' turuncu, 'g' yeşil, 'G' koyu yeşil, 'u' mavi, 'U' koyu mavi, 'c' buz mavisi,
 * 'p' mor, 'P' koyu mor, 's' çürük yeşil deri, 'S' koyu deri, 'e' kemik, 'a' vurgu rengi (skill/sınıf rengi), 'A' koyu vurgu, 'z' açık vurgu.
 */
/** Doku ızgarası: 64x64. Çizim koordinatları hâlâ 32'lik "mantıksal" uzayda yazılır; her koordinat K kat ince piksele çevrilir. */
export const GRID = 64;
const K = 2;

export const PALETTE: Record<string, number> = {
  o: 0x15101c,
  w: 0xfdfaf2,
  l: 0xd7dce6,
  m: 0x98a2b4,
  d: 0x5b6579,
  k: 0x4a2e1a,
  b: 0x8c5a2b,
  n: 0xe3b983,
  y: 0xffd23f,
  Y: 0xc4821a,
  r: 0xe5463b,
  R: 0x8e1f2c,
  f: 0xff8a1f,
  g: 0x62d04b,
  G: 0x2c7a2b,
  u: 0x4aa3ff,
  U: 0x2757b8,
  c: 0xa8ebff,
  p: 0xb872ff,
  P: 0x5a2a9c,
  s: 0x86a374,
  S: 0x4d6547,
  e: 0xeae3c6,
};

/** Bir pikselin jetonu ve ışık seviyesi (-1 gölge, 0 normal, +1 aydınlık). */
export interface Cell {
  t: string;
  s: number;
}

/** 32x32'lik jeton ızgarası ve çizim araçları. */
export class PxGrid {
  readonly cells: string[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => '.'));

  /** Ham (64'lük) piksel yazar. */
  private px(x: number, y: number, t: string): void {
    if (x >= 0 && y >= 0 && x < GRID && y < GRID) this.cells[y]![x] = t;
  }

  /** Mantıksal (32'lik) koordinatta tek nokta: K x K ince piksel. */
  set(x: number, y: number, t: string): this {
    const rx = Math.round(x * K);
    const ry = Math.round(y * K);
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) this.px(rx + i, ry + j, t);
    return this;
  }

  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? '.';
  }

  /** Kalınlıklı Bresenham çizgisi (w: mantıksal kalınlık, 1 = K ince piksel). */
  line(x0: number, y0: number, x1: number, y1: number, t: string, w = 1): this {
    x0 = Math.round(x0 * K);
    y0 = Math.round(y0 * K);
    x1 = Math.round(x1 * K);
    y1 = Math.round(y1 * K);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const th = Math.max(1, Math.round(w * K));
    const off = Math.floor((th - 1) / 2);
    for (;;) {
      for (let j = 0; j < th; j++) for (let i = 0; i < th; i++) this.px(x0 - off + i, y0 - off + j, t);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number, t: string): this {
    const rx = Math.round(x * K);
    const ry = Math.round(y * K);
    for (let j = 0; j < Math.round(h * K); j++) for (let i = 0; i < Math.round(w * K); i++) this.px(rx + i, ry + j, t);
    return this;
  }

  /** Dolu daire (yarım piksel merkezler desteklenir). */
  disc(cx: number, cy: number, r: number, t: string): this {
    const [cxr, cyr, rr] = [cx * K, cy * K, r * K];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if ((x + 0.5 - cxr) ** 2 + (y + 0.5 - cyr) ** 2 <= rr * rr) this.px(x, y, t);
    return this;
  }

  /** Elips (yarıçaplar rx, ry). */
  ellipse(cx: number, cy: number, rx: number, ry: number, t: string): this {
    const [cxr, cyr, rxr, ryr] = [cx * K, cy * K, rx * K, ry * K];
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (((x + 0.5 - cxr) / rxr) ** 2 + ((y + 0.5 - cyr) / ryr) ** 2 <= 1) this.px(x, y, t);
    return this;
  }

  /** Daire çizgisi (halka); `a0..a1` verilirse yalnızca o yay (radyan). */
  ring(cx: number, cy: number, r: number, t: string, thick = 1, a0?: number, a1?: number): this {
    const [cxr, cyr, rr, th] = [cx * K, cy * K, r * K, thick * K];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const dx = x + 0.5 - cxr;
        const dy = y + 0.5 - cyr;
        const d = Math.hypot(dx, dy);
        if (d > rr || d < rr - th) continue;
        if (a0 !== undefined && a1 !== undefined) {
          let a = Math.atan2(dy, dx);
          while (a < a0) a += Math.PI * 2;
          if (a > a1) continue;
        }
        this.px(x, y, t);
      }
    return this;
  }

  /** Dolu çokgen (tarama çizgisi). Köşeler [x0,y0,x1,y1,...]. */
  poly(ptsLogical: number[], t: string): this {
    const pts = ptsLogical.map((v) => v * K);
    const n = pts.length / 2;
    for (let y = 0; y < GRID; y++) {
      const xs: number[] = [];
      const py = y + 0.5;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]!;
        const ay = pts[i * 2 + 1]!;
        const bx = pts[((i + 1) % n) * 2]!;
        const by = pts[((i + 1) % n) * 2 + 1]!;
        if ((ay <= py && by > py) || (by <= py && ay > py)) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]! - 0.5); x <= Math.floor(xs[i + 1]! - 0.5); x++) this.px(x, y, t);
    }
    return this;
  }

  /** Dama (dither) dolgu: iki jetonu satranç düzeninde karıştırır (yumuşak geçiş hissi). */
  dither(x: number, y: number, w: number, h: number, a: string, b: string): this {
    const rx = Math.round(x * K);
    const ry = Math.round(y * K);
    for (let j = 0; j < Math.round(h * K); j++) for (let i = 0; i < Math.round(w * K); i++) this.px(rx + i, ry + j, (i + j) % 2 === 0 ? a : b);
    return this;
  }

  /** Sol yarıyı sağa ayna olarak yansıtır (simetrik çizimler için). */
  mirror(): this {
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID / 2; x++) if (this.get(x, y) !== '.') this.px(GRID - 1 - x, y, this.get(x, y));
    return this;
  }

  /** Dolu pikselin 4 komşusu boşsa oraya kontur koyar. */
  outline(): this {
    const add: Array<[number, number]> = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        if (this.get(x, y) !== '.') continue;
        if ([this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)].some((c) => c !== '.' && c !== 'o')) add.push([x, y]);
      }
    for (const [x, y] of add) this.px(x, y, 'o');
    return this;
  }

  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }

  /**
   * Işık geçişi: sol-üste doğru boşluğa/konturlara olan uzaklığa göre kenar parlaması (+1), sağ-alta doğru uzaklığa göre gölge (-1);
   * kenara yakın bölgede dama (dither) ile yumuşatılır. Beyaz ve kontur etkilenmez.
   */
  lit(): Cell[][] {
    const empty = (x: number, y: number) => {
      const c = this.get(x, y);
      return c === '.' || c === 'o';
    };
    const dist = (x: number, y: number, dx: number, dy: number, max: number) => {
      for (let d = 1; d <= max; d++) if (empty(x + dx * d, y + dy * d)) return d;
      return max + 1;
    };
    return this.cells.map((row, y) =>
      row.map((t, x) => {
        if (t === '.' || t === 'o' || t === 'w') return { t, s: 0 };
        const hi = Math.min(dist(x, y, -1, 0, 6), dist(x, y, 0, -1, 6), dist(x, y, -1, -1, 6));
        const lo = Math.min(dist(x, y, 1, 0, 6), dist(x, y, 0, 1, 6), dist(x, y, 1, 1, 6));
        const checker = (x + y) % 2 === 0;
        let s = 0;
        if (hi <= 2 && hi < lo) s = 1;
        else if (lo <= 2 && lo < hi) s = -1;
        else if (hi <= 4 && hi < lo && checker) s = 1;
        else if (lo <= 4 && lo < hi && checker) s = -1;
        return { t, s };
      }),
    );
  }
}

export type Draw = (g: PxGrid) => void;

// ---------------------------------------------------------------------------------------------------------------------
// Ortak parçalar (ikonlar ve efekt sprite'ları tarafından kullanılır)

/** İki nokta arasında uçlu bıçak: açık yarı + koyu yarı + orta oluk. */
export function blade(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number, hi = 'l', lo = 'm', fuller = 'w'): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const nx = -dy;
  const ny = dx;
  const h = w / 2;
  const tx = x1 - dx * w * 1.1;
  const ty = y1 - dy * w * 1.1;
  g.poly([x0 + nx * h, y0 + ny * h, tx + nx * h, ty + ny * h, x1, y1, tx - nx * h, ty - ny * h, x0 - nx * h, y0 - ny * h], lo);
  g.poly([x0 + nx * h, y0 + ny * h, tx + nx * h, ty + ny * h, x1, y1, x0, y0], hi);
  g.line(x0 + dx * 2, y0 + dy * 2, tx - dx, ty - dy, fuller);
}

/** Küre: gövde + parlak nokta. */
export function orb(g: PxGrid, cx: number, cy: number, r: number, body: string, spec = 'w'): void {
  g.disc(cx, cy, r, body);
  g.disc(cx - r * 0.35, cy - r * 0.38, Math.max(1, r * 0.28), spec);
}

/** Alev: dıştan içe katmanlı damla (üç renk). */
export function flame(g: PxGrid, cx: number, by: number, h: number, w: number, c1: string, c2: string, c3: string): void {
  const f = (k: number, t: string) =>
    g.poly([cx, by - h * k, cx + w * k * 1.05, by - h * k * 0.42, cx + w * k * 0.8, by - h * k * 0.1 + h * (1 - k) * 0.1, cx, by, cx - w * k * 0.8, by - h * k * 0.1 + h * (1 - k) * 0.1, cx - w * k * 1.05, by - h * k * 0.42], t);
  f(1, c1);
  f(0.68, c2);
  f(0.38, c3);
}

/** Kalkan: kenar + zemin. */
export function shieldShape(g: PxGrid, cx: number, top: number, w: number, h: number, rim: string, field: string): void {
  const p = (inset: number) => [cx - w / 2 + inset, top + inset, cx + w / 2 - inset, top + inset, cx + w / 2 - inset, top + h * 0.55, cx, top + h - inset * 0.5, cx - w / 2 + inset, top + h * 0.55];
  g.poly(p(0), rim);
  g.poly(p(2), field);
}

/** Yaprak: iki nokta arası sivri yaprak + orta damar. */
export function leafShape(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number, hi = 'g', lo = 'G'): void {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / len) * w;
  const ny = ((x1 - x0) / len) * w;
  g.poly([x0, y0, mx + nx, my + ny, x1, y1, mx - nx, my - ny], lo);
  g.poly([x0, y0, mx + nx * 0.9, my + ny * 0.9, x1, y1], hi);
  g.line(x0, y0, x1, y1, 'w');
}

/** Dört köşeli yıldız parıltısı. */
export function sparkle(g: PxGrid, cx: number, cy: number, r: number, t = 'w'): void {
  g.poly([cx, cy - r, cx + r * 0.22, cy - r * 0.22, cx + r, cy, cx + r * 0.22, cy + r * 0.22, cx, cy + r, cx - r * 0.22, cy + r * 0.22, cx - r, cy, cx - r * 0.22, cy - r * 0.22], t);
}

/** Kristal: sivri üst/alt, iki tonlu. */
export function crystal(g: PxGrid, cx: number, cy: number, w: number, h: number, hi: string, lo: string): void {
  g.poly([cx, cy - h / 2, cx + w / 2, cy - h * 0.12, cx + w / 2, cy + h * 0.2, cx, cy + h / 2, cx - w / 2, cy + h * 0.2, cx - w / 2, cy - h * 0.12], lo);
  g.poly([cx, cy - h / 2, cx - w / 2, cy - h * 0.12, cx - w / 2, cy + h * 0.2, cx, cy + h / 2], hi);
  g.line(cx - w * 0.18, cy - h * 0.2, cx - w * 0.18, cy + h * 0.15, 'w');
}

// ---------------------------------------------------------------------------------------------------------------------
// Çizimleri dışa aç (pixel-icons / pixel-fx bu dosyadaki araçları içe aktarır; döngüsel import için en altta)

import { PIXEL_FX } from './pixel-fx';
import { PIXEL_ICONS } from './pixel-icons';
export { PIXEL_FX, PIXEL_ICONS };

/** Kontur istemeyen efekt sprite'ları (halka/yer deseni gibi geniş, ince çizimler). */
const NO_OUTLINE = new Set(['runering', 'circle', 'dust']);

function drawSprite(name: string): PxGrid | null {
  const fn = PIXEL_ICONS[name] ?? PIXEL_FX[name];
  if (!fn) return null;
  const g = new PxGrid();
  fn(g);
  if (!NO_OUTLINE.has(name)) g.outline();
  return g;
}

/** İkon ya da efekt sprite'ının jeton satırları (kontur dahil); bilinmeyen ad için null. */
export function spriteRows(name: string): string[] | null {
  return drawSprite(name)?.rows() ?? null;
}

/** Işık seviyeleriyle birlikte hücreler (doku üretimi bunu kullanır). */
export function spriteCells(name: string): Cell[][] | null {
  return drawSprite(name)?.lit() ?? null;
}

/** Yalnızca ikonlar için `spriteRows` (testler). */
export function iconRows(name: string): string[] | null {
  return PIXEL_ICONS[name] ? spriteRows(name) : null;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Vurgu renginden türetilen jetonlar: 'a' vurgu, 'A' koyu, 'z' açık. */
export function accentTokens(hex: string): Record<string, number> {
  const [r, g, b] = hexToRgb(hex);
  const mix = (k: number, to: number) => (Math.round(r + (to - r) * k) << 16) | (Math.round(g + (to - g) * k) << 8) | Math.round(b + (to - b) * k);
  return { a: (r << 16) | (g << 8) | b, A: mix(0.5, 0), z: mix(0.45, 255) };
}

export const INTERNAL_TOKEN_VALUES = (accent: string): Record<string, number> => ({ ...PALETTE, ...accentTokens(accent) });

/** Bir rengi ışık seviyesine göre aydınlatır/karartır. */
export function shadeColor(rgb: number, s: number): number {
  if (s === 0) return rgb;
  const to = s > 0 ? 255 : 0;
  const k = s > 0 ? 0.28 : 0.3;
  const ch = (shift: number) => {
    const v = (rgb >> shift) & 255;
    return Math.round(v + (to - v) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
