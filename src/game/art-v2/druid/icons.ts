/**
 * Druid - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/druid/idle.png): yeşil kukuletalı, kürk yakalı yaşlı druid; budaklı meşe asası (tepesinde
 * turuncu meyve/küre, meşe yaprakları, sarmaşık sarılı), altın broş ve işlemeler, avucunda yeşil ışıyan yaprak. Treant (çağrı):
 * yosunlu meşe gövdesi, kehribar (turuncu) gözler ve göğüste kehribar budak, tepesinde meşe yaprakları, kalın kök parmaklar.
 * v2 görsel dili: "meşe (loblu yaprak), kabuk ve kök, yosun, kehribar ışık, altın damar". Diken = Thorn Whip / Nature's Wrath,
 * kalın kök = Treant (Root Smash, Vine Snare).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): leaf, leaves, thornwhip, roots, rejuvenate, treant, rootsmash, vinesnare
 *  - leaf: Druid logosu; leaves: Verdant Blessing pasifi; treant: Summon Treant skill'i + Treant logosu
 *
 * SPRITES: v2 efektlerinin (vfx.ts) kullandığı ek çizimler; efektte k.v2Sprite(c, 'ad', renk, x, y, boyut) ile çizilir.
 */
import type { V2SpriteEntry } from '../types';
import type { PxGrid } from '../../pixel-art';
import { sparkle } from '../../pixel-art';

// ---------------------------------------------------------------------------------------------------------------- yardımcılar

/**
 * Meşe yaprağı (loblu): sap (x0,y0) -> uç (x1,y1); `w` en geniş yarı genişlik. Kenarda 4 çift yuvarlak lob, orta damar `vein`,
 * yan damarlar. hi = açık yüz, lo = koyu yüz.
 */
function oakLeaf(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number, hi = 'g', lo = 'G', vein = 'Y'): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const nx = -dy;
  const ny = dx;
  const at = (t: number, s: number) => ({ x: x0 + dx * len * t + nx * s, y: y0 + dy * len * t + ny * s });
  const sap = 0.16; // sap boyu (oran)
  // gövde: lob dairelerinin zinciri
  const lobes = [0.3, 0.47, 0.64, 0.8];
  const prof = (t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - sap) / (1 - sap)))) ** 0.7;
  for (const side of [1, -1]) {
    for (const t of lobes) {
      const r = w * (0.5 + 0.18 * prof(t));
      const p = at(t, side * w * prof(t) * 0.62);
      g.disc(p.x, p.y, r, side > 0 ? lo : hi);
    }
  }
  // iç dolgu (lobların arasını kapat) + uç lob
  const body: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = sap + ((1 - sap) * i) / 10;
    const p = at(t, w * prof(t) * 0.55);
    body.push(p.x, p.y);
  }
  for (let i = 10; i >= 0; i--) {
    const t = sap + ((1 - sap) * i) / 10;
    const p = at(t, -w * prof(t) * 0.55);
    body.push(p.x, p.y);
  }
  g.poly(body, hi);
  const tip = at(0.93, 0);
  g.disc(tip.x, tip.y, w * 0.5, hi);
  // koyu yarı (alt-sağ yüz) gövdede de
  const half: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = sap + ((1 - sap) * i) / 10;
    const p = at(t, w * prof(t) * 0.55);
    half.push(p.x, p.y);
  }
  for (let i = 10; i >= 0; i--) {
    const p = at(sap + ((1 - sap) * i) / 10, 0);
    half.push(p.x, p.y);
  }
  g.poly(half, lo);
  // damarlar
  const s = at(0, 0);
  const e = at(0.95, 0);
  g.line(s.x, s.y, e.x, e.y, vein, Math.max(0.5, w * 0.11));
  for (const t of lobes) {
    const a = at(t - 0.06, 0);
    for (const side of [1, -1]) {
      const b = at(t + 0.03, side * w * prof(t) * 0.75);
      g.line(a.x, a.y, b.x, b.y, vein, 0.5);
    }
  }
}

/** Kabuklu kök/dal parçası: (x0,y0)->(x1,y1) kalınlık w0->w1, koyu kenar + açık yüz + kabuk çizgileri. */
function root(g: PxGrid, pts: Array<[number, number]>, w0: number, w1: number, hi = 'b', lo = 'k'): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
    g.line(ax, ay, bx, by, lo, w);
  }
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
    g.line(ax - w * 0.18, ay - w * 0.12, bx - w * 0.18, by - w * 0.12, hi, Math.max(0.5, w * 0.5));
  }
}

/** Diken: (x,y) tabanından (nx,ny) yönüne sivri üçgen. */
function thorn(g: PxGrid, x: number, y: number, nx: number, ny: number, l: number, t = 'e'): void {
  const px = -ny;
  const py = nx;
  g.poly([x + px * l * 0.32, y + py * l * 0.32, x + nx * l, y + ny * l, x - px * l * 0.32, y - py * l * 0.32], t);
}

/** Bézier boyunca dikenli sarmaşık gövdesi (Thorn Whip / Nature's Wrath). */
function bramble(g: PxGrid, p0: [number, number], c: [number, number], p1: [number, number], w0: number, w1: number, thorns = 7): void {
  const pt = (u: number) => ({
    x: (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0],
    y: (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1],
  });
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a = pt(i / N);
    const b = pt((i + 1) / N);
    g.line(a.x, a.y, b.x, b.y, 'G', w0 + ((w1 - w0) * i) / N);
  }
  for (let i = 0; i < N; i++) {
    const a = pt(i / N);
    const b = pt((i + 1) / N);
    const w = (w0 + ((w1 - w0) * i) / N) * 0.45;
    g.line(a.x - w * 0.3, a.y - w * 0.3, b.x - w * 0.3, b.y - w * 0.3, 'g', Math.max(0.5, w));
  }
  for (let i = 1; i <= thorns; i++) {
    const u = (i - 0.4) / (thorns + 0.2);
    const a = pt(u);
    const b = pt(u + 0.01);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const side = i % 2 ? 1 : -1;
    const nx = (-(b.y - a.y) / l) * side;
    const ny = ((b.x - a.x) / l) * side;
    const w = w0 + (w1 - w0) * u;
    thorn(g, a.x + nx * w * 0.35, a.y + ny * w * 0.35, nx + (b.x - a.x) / l * 0.5, ny + (b.y - a.y) / l * 0.5, 1.6 + w * 0.5);
  }
}

/** Toprak şeridi (alt). */
function soil(g: PxGrid, y: number, h = 5): void {
  g.poly([0.5, y + 1, 5, y - 0.8, 11, y + 0.4, 17, y - 1, 23, y + 0.3, 31.5, y - 0.6, 31.5, y + h, 0.5, y + h], 'k');
  g.poly([0.5, y + 1, 5, y - 0.8, 11, y + 0.4, 17, y - 1, 23, y + 0.3, 31.5, y - 0.6, 31.5, y + 1.4, 0.5, y + 2.2], 'b');
}

// ---------------------------------------------------------------------------------------------------------------- ikonlar

export const ICONS: Record<string, V2SpriteEntry> = {
  /** Druid logosu: altın damarlı meşe yaprağı, sapında küçük palamut. */
  leaf: (g) => {
    oakLeaf(g, 6.5, 26.5, 26.5, 5, 6.4, 'a', 'A', 'Y');
    g.disc(10.5, 15.5, 1.1, 'z').disc(14, 11.5, 0.8, 'z');
    // palamut
    g.ellipse(6.2, 27.4, 2.3, 2.7, 'b');
    g.ellipse(6.2, 25.6, 2.6, 1.4, 'k');
    g.disc(5.4, 27.4, 0.6, 'n');
    sparkle(g, 26, 5.5, 2.6, 'w');
  },

  /** Verdant Blessing (çağırınca tüm dostlar iyileşir): yelpaze hâlinde üç meşe yaprağı, ortada filizlenen palamut, şifa ışıltısı. */
  leaves: (g) => {
    oakLeaf(g, 16, 23, 4, 7, 4.6, 'g', 'G', 'Y');
    oakLeaf(g, 16, 23, 28, 7, 4.6, 'g', 'G', 'Y');
    oakLeaf(g, 16, 24, 16, 2.5, 5, 'a', 'A', 'Y');
    // palamut + filiz
    g.ellipse(16, 26.4, 3.4, 3.8, 'b');
    g.ellipse(16, 23.8, 3.9, 2, 'k');
    g.dither(13, 23, 6, 1.4, 'k', 'b');
    g.disc(14.8, 26.8, 0.9, 'n');
    sparkle(g, 6, 22.5, 2.6, 'z');
    sparkle(g, 26.5, 22.5, 2.6, 'z');
    sparkle(g, 16, 30, 1.6, 'w');
  },

  /** Thorn Whip: S kıvrımlı dikenli sarmaşık kırbaç; ucu şaklar, dikenden kan damlar (Wound). */
  thornwhip: (g) => {
    bramble(g, [4, 29], [3, 10], [16, 13], 3.8, 3, 4);
    bramble(g, [16, 13], [28, 16], [25, 5], 3, 1.6, 4);
    g.disc(4, 29, 2, 'k'); // tutulan uç (asa ucu)
    // yapraklar
    g.poly([7, 18, 3, 15.5, 4.6, 20.5], 'g').poly([19.5, 12.5, 21, 9, 22.5, 13], 'g');
    // şak: kıvılcım + yay çizgileri
    sparkle(g, 25.5, 4.5, 4.4, 'w');
    sparkle(g, 25.5, 4.5, 2.2, 'z');
    g.ring(25.5, 4.5, 7.2, 'w', 0.7, Math.PI * 0.1, Math.PI * 0.55);
    // kan damlası (Wound)
    g.poly([28.6, 9.5, 30, 12.6, 27.2, 12.6], 'r');
    g.disc(28.6, 12.8, 1.4, 'r');
  },

  /** Nature's Wrath: toprağı yarıp yelpaze gibi fışkıran kalın kökler ve dikenli sarmaşıklar; savrulan toprak. */
  roots: (g) => {
    soil(g, 25.5, 6);
    // kalkan toprak kabukları
    g.poly([9, 26, 12, 21.5, 16, 20.5, 20, 21.5, 23, 26], 'k');
    g.poly([10.5, 25.6, 13, 22.4, 16, 21.6, 19, 22.4, 21.5, 25.6], 'b');
    // üç kalın dikenli kök yelpaze gibi fışkırır (orta en kalın)
    const arms: Array<[Array<[number, number]>, number]> = [
      [[[13, 24], [9, 19], [5.5, 13], [4, 6.5]], 3.4],
      [[[16, 23], [16.5, 16], [15, 9], [16.5, 2]], 4.2],
      [[[19, 24], [23, 19], [26.5, 13], [28, 6.5]], 3.4],
    ];
    for (const [pts, w] of arms) root(g, pts, w, w * 0.4);
    const spikes: Array<[number, number, number, number]> = [
      [7.5, 16, -1, -0.2],
      [10.2, 19.6, 1, -0.3],
      [5.2, 10, 1, -0.4],
      [14.2, 13, -1, -0.2],
      [18, 17.5, 1, -0.2],
      [16.4, 6.5, -1, -0.3],
      [24.6, 16, 1, -0.2],
      [22, 19.6, -1, -0.3],
      [27, 10, -1, -0.4],
    ];
    for (const [x, y, nx, ny] of spikes) thorn(g, x, y, nx, ny, 2.6);
    // yeşil sürgün yaprakları
    g.poly([16.6, 9, 21, 6.4, 19.6, 11], 'a').poly([5, 13, 1.2, 11.4, 3, 15.4], 'a').poly([27, 13, 31, 11.4, 29.2, 15.4], 'a');
    // savrulan toprak
    g.disc(3, 22, 1.1, 'b').disc(29.5, 21.5, 1.2, 'k').disc(8.6, 23, 0.9, 'b').disc(24, 22.8, 0.9, 'k');
  },

  /** Rejuvenate: tohumdan filizlenen genç sürgün (iki yaprak + ışıyan tomurcuk), etrafında yükselen şifa sarmalı. */
  rejuvenate: (g) => {
    // şifa sarmalı (arkada, yarım)
    g.ring(16, 18, 11.5, 'A', 1.1, Math.PI * 1.05, Math.PI * 1.95);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + i * 0.17);
      g.disc(16 + Math.cos(a) * 11.5, 18 + Math.sin(a) * 4, 0.9, 'z');
    }
    // tohum + toprak
    g.ellipse(16, 28.5, 9, 2.6, 'k');
    g.ellipse(16, 27.2, 3.2, 2.4, 'b');
    g.line(14.4, 26.4, 17.2, 28, 'n', 0.5);
    // sap
    g.line(16, 26, 15.4, 19, 'G', 1.6).line(15.4, 19, 16.6, 11, 'G', 1.4);
    g.line(15.7, 25, 15.2, 19.5, 'g', 0.5);
    // iki yaprak
    g.poly([15.6, 19.5, 8, 15.6, 6.4, 19.8, 11, 21.6], 'g');
    g.poly([15.6, 19.5, 11, 21.6, 6.4, 19.8], 'G');
    g.line(15, 19.6, 8.4, 18, 'z', 0.5);
    g.poly([16.2, 16.4, 23.8, 11.6, 26, 15.8, 21, 18.2], 'g');
    g.poly([16.2, 16.4, 21, 18.2, 26, 15.8], 'G');
    g.line(16.8, 16.4, 24, 13.6, 'z', 0.5);
    // ışıyan tomurcuk
    g.disc(16.8, 8.6, 3.6, 'a');
    g.disc(16.8, 8.6, 2.4, 'z');
    g.disc(16.4, 8, 1.1, 'w');
    sparkle(g, 23.5, 4.5, 2.6, 'w');
    sparkle(g, 8.5, 9, 1.8, 'z');
  },

  /** Summon Treant + Treant logosu: kabuklu meşe yüzü, kehribar gözler, alnında yosun, tepesinde meşe dalları ve yaprakları. */
  treant: (g) => {
    // tepe dalları (gövdeden yukarı ayrılır) + meşe yaprakları
    root(g, [[10.5, 11], [7.5, 6.5], [4, 4.5]], 2.4, 1.2);
    root(g, [[16, 10], [16.8, 5], [15.6, 1.5]], 2.6, 1.2);
    root(g, [[21.5, 11], [24.5, 6.5], [28, 4.5]], 2.4, 1.2);
    oakLeaf(g, 5, 6, 0.8, 1.2, 2.9, 'a', 'A', 'G');
    oakLeaf(g, 27, 6, 31.2, 1.2, 2.9, 'a', 'A', 'G');
    oakLeaf(g, 16, 3.5, 21.5, 0.8, 2.4, 'a', 'A', 'G');
    // gövde-baş (yukarı doğru genişleyen kabuk, düzensiz kenar)
    g.poly([7.5, 9.5, 12, 8, 16, 9, 20, 8, 24.5, 9.5, 26.5, 16, 25.5, 24, 26.5, 31.5, 5.5, 31.5, 6.5, 24, 5.5, 16], 'k');
    g.poly([8.6, 10.5, 12, 9.2, 16, 10.2, 20, 9.2, 23.4, 10.5, 25.2, 16, 24.3, 24, 25, 31.5, 7, 31.5, 7.7, 24, 6.8, 16], 'b');
    // kabuk lifleri
    for (const x of [10.5, 13.5, 18.8, 21.6]) g.line(x, 11, x + (x < 16 ? -0.8 : 0.8), 31, 'k', 0.6);
    g.line(16.2, 20, 16, 31, 'k', 0.6);
    // ağır kaş + gözler
    g.poly([8.5, 15, 15, 16.4, 15.4, 18.2, 8.2, 17], 'k');
    g.poly([23.5, 15, 17, 16.4, 16.6, 18.2, 23.8, 17], 'k');
    g.ellipse(12, 18.6, 2.3, 1.3, 'o').ellipse(20, 18.6, 2.3, 1.3, 'o');
    g.ellipse(12, 18.6, 1.6, 0.9, 'f').ellipse(20, 18.6, 1.6, 0.9, 'f');
    g.disc(12.3, 18.5, 0.45, 'y').disc(20.3, 18.5, 0.45, 'y');
    // burun çıkıntısı + ağız yarığı
    g.poly([16, 17.5, 17.6, 23, 14.4, 23], 'k');
    g.poly([16, 18, 16.9, 22.4, 15.1, 22.4], 'n');
    g.line(12.5, 26, 19.5, 25.6, 'o', 0.8);
    // yosun
    g.dither(9, 9.6, 6, 2, 'g', 'G').dither(19, 9.6, 5, 1.6, 'g', 'G');
    g.disc(7.4, 23, 1.4, 'g').disc(24.8, 27, 1.2, 'g');
  },

  /** Root Smash (Treant): yosunlu dev ahşap yumruk yerden yukarı fırlar; bileğinden kökler toprağa iner, darbe çizgileri. */
  rootsmash: (g) => {
    soil(g, 27, 5);
    // bilek: burgulu kök demeti topraktan çıkar
    root(g, [[16, 31], [14.8, 27], [16, 22.5]], 7.5, 6.5);
    root(g, [[9.5, 30.5], [11.5, 27.5], [13, 24]], 2, 1.4);
    root(g, [[23, 30.5], [20.6, 27.5], [19.2, 24]], 2, 1.4);
    // yumruk gövdesi (boğumlar yukarıda)
    g.poly([7.5, 7.5, 24.5, 7.5, 26, 12, 25.5, 22, 22, 24.5, 10, 24.5, 6.5, 22, 6, 12], 'k');
    // dört kıvrık parmak (dikey sütunlar)
    for (let i = 0; i < 4; i++) {
      const x = 7.8 + i * 4.3;
      g.poly([x, 9, x + 3.6, 9, x + 3.6, 17.5, x, 17.5], 'b');
      g.ellipse(x + 1.8, 8.8, 1.9, 1.7, 'b');
      g.line(x + 0.6, 9.5, x + 0.6, 16.5, 'n', 0.5);
      g.line(x + 0.4, 13.2, x + 3.2, 13.4, 'k', 0.5); // orta boğum
    }
    // avuç tabanı
    g.poly([7, 17.5, 25, 17.5, 24.6, 22, 21.6, 23.8, 10.4, 23.8, 7.4, 22], 'b');
    // başparmak parmakların önünden yatay geçer
    g.poly([6.5, 16, 18.5, 15.2, 20, 17.4, 18.4, 19.6, 7.6, 20.2], 'k');
    g.poly([7.4, 16.8, 18, 16, 19, 17.6, 17.8, 19, 8, 19.4], 'n');
    g.line(8, 17, 17, 16.4, 'w', 0.5);
    // yosun + kehribar budak
    g.dither(19.5, 20.5, 4.5, 2, 'g', 'G');
    g.disc(10.2, 9.2, 1, 'g');
    g.disc(12.5, 21.6, 0.9, 'f');
    // darbe çizgileri
    g.line(2.5, 4, 5.5, 7, 'w', 0.9).line(29.5, 4, 26.5, 7, 'w', 0.9).line(16, 0.5, 16, 4.5, 'w', 0.9);
    g.disc(3.5, 25, 1, 'b').disc(28.5, 24.4, 1.1, 'k');
  },

  /** Vine Snare (Treant): topraktan çıkan kök-sarmaşık halkaları bir çizmeyi bileğinden sıkıca sarar (yere bağlanma). */
  vinesnare: (g) => {
    soil(g, 27, 5);
    // yandan bacak (koyu mavi pantolon) + kahve çizme: yakalanan düşman
    g.poly([10.5, 1, 17.5, 1, 17.8, 14, 10.8, 14], 'U');
    g.line(11.4, 2, 11.6, 13.5, 'u', 0.6);
    g.poly([10.4, 13, 18, 13, 18.2, 19.5, 27, 21, 28.6, 26.6, 9.8, 26.6], 'd');
    g.poly([11.2, 13.6, 17.2, 13.6, 17.4, 20.2, 26.2, 21.8, 27.4, 25.6, 10.8, 25.6], 'm');
    g.line(18, 21, 26, 22.6, 'l', 0.6);
    g.rect(10, 12.4, 8.6, 1.8, 'l');
    // kök-sarmaşık sarmalı: bacağı önden saran kavisli bantlar (arka yarısı gizli)
    const wrap = (cy: number, tilt: number) => {
      const pts: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        pts.push(14.2 + Math.cos(a) * 6.6, cy + Math.sin(a) * 2.4 + Math.cos(a) * tilt);
      }
      for (let i = 0; i < 12; i++) g.line(pts[i * 2]!, pts[i * 2 + 1]!, pts[i * 2 + 2]!, pts[i * 2 + 3]!, 'k', 2.2);
      for (let i = 0; i < 12; i++) g.line(pts[i * 2]!, pts[i * 2 + 1]! - 0.4, pts[i * 2 + 2]!, pts[i * 2 + 3]! - 0.4, 'G', 0.9);
    };
    wrap(6, -1.4);
    wrap(15.5, -1.4);
    // ayak bileğini saran kalın kök: topraktan çıkar, bileği dolar, ucu sağda kıvrılır
    root(g, [[4.5, 30], [3.6, 24], [5, 17], [7.6, 7]], 2.8, 1.6, 'b', 'k');
    g.line(6, 21.6, 22, 19.4, 'k', 2.8).line(6.4, 21, 21.6, 18.8, 'b', 1.3);
    root(g, [[22, 19.4], [25.5, 17], [26.5, 13]], 2.2, 1.2, 'b', 'k');
    // yeşil sürgünler
    g.poly([7.6, 7, 3.6, 3.4, 5.6, 8.8], 'a').poly([26.5, 13, 30.6, 9.6, 29.4, 14.6], 'a').poly([3.8, 19.6, 0.6, 17.2, 1.8, 21.8], 'g');
    // sıkma çizgileri
    g.line(27.5, 12, 30, 11, 'w', 0.7).line(27.5, 15, 30.5, 15, 'w', 0.7).line(1, 26, 2.8, 25, 'w', 0.7);
  },
};

// ---------------------------------------------------------------------------------------------------------------- efekt sprite'ları

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Meşe yaprağı (dökülen/savrulan; 'a' = skill rengi). */
  oakleaf: { size: 48, draw: (g) => oakLeaf(g, 5, 27, 27, 5, 7, 'a', 'A', 'G') },

  /** Kahverengi kuru meşe yaprağı (Treant'tan dökülen). */
  dryleaf: { size: 48, draw: (g) => oakLeaf(g, 5, 27, 27, 5, 7, 'n', 'b', 'k') },

  /** Diken (hedefe saplanan: Thorn Whip'in Wound'u). */
  thornbarb: { size: 48, draw: (g) => {
    g.poly([4, 21, 28, 15, 6, 11], 'e');
    g.poly([4, 21, 28, 15, 6, 16], 'n');
    g.disc(4.6, 16, 3.4, 'G');
    g.disc(5.6, 16, 2, 'g');
  } },

  /** Fışkıran kalın kök ucu (dikey; alt kenar toprağa gömülü). */
  rootspike: { size: 128, draw: (g) => {
    g.poly([10, 32, 22, 32, 20, 22, 18.5, 12, 16.4, 1.5, 13.6, 12, 12, 22], 'k');
    g.poly([11.4, 32, 18.4, 32, 17.6, 22, 16.6, 12, 16, 4, 14.6, 12, 13.4, 22], 'b');
    for (const y of [26, 19, 13]) g.line(13, y, 17.6, y - 1, 'k', 0.5);
    g.line(13.2, 30, 14.4, 12, 'n', 0.5);
    g.dither(17, 22, 3, 3, 'g', 'G');
    // yan sürgün + yaprak
    g.line(17.8, 17, 22, 13, 'k', 1.2);
    g.poly([22, 13, 26.5, 9.4, 25, 14], 'a');
  } },

  /** Dikenli sarmaşık filizi (dikey, kıvrık; Nature's Wrath hücre patlaması). */
  thornshoot: { size: 128, draw: (g) => {
    bramble(g, [16, 32], [9, 18], [17, 3], 3, 1.2, 6);
    g.poly([12.6, 18, 7, 14.6, 9.2, 20.4], 'a');
    g.poly([14.6, 10, 20, 7, 19, 12], 'a');
  } },

  /** Dev ahşap kök yumruğu (yukarı bakan, boğumlar üstte; Root Smash). */
  rootfist: { size: 192, draw: (g) => {
    root(g, [[16, 33], [15.4, 27], [16.4, 21]], 7.5, 6.5);
    g.poly([6, 7.5, 26, 7.5, 27.5, 14, 25.5, 22, 7.5, 22, 5, 14], 'k');
    g.poly([7, 8.5, 25, 8.5, 26.4, 14, 24.6, 21, 8.4, 21, 6.2, 14], 'b');
    for (let i = 0; i < 4; i++) {
      const x = 9.2 + i * 4.6;
      g.ellipse(x, 8.6, 2.5, 2.5, 'k');
      g.ellipse(x, 8.3, 2, 2.1, 'b');
      g.disc(x - 0.7, 7.6, 0.7, 'n');
    }
    g.line(8, 13.6, 24.5, 13.6, 'k', 0.6);
    for (const x of [11, 15.6, 20.2]) g.line(x, 14.4, x + 0.6, 21, 'k', 0.5);
    g.poly([5, 12, 10, 14.4, 9.6, 19, 4.6, 16.6], 'b');
    g.line(5, 12, 4.6, 16.6, 'k', 0.6);
    g.dither(16.5, 15, 7, 2.4, 'g', 'G');
    g.dither(8, 19, 3, 1.6, 'g', 'G');
    g.disc(22.5, 18, 1.1, 'f').disc(22.3, 17.8, 0.5, 'y'); // kehribar budak
  } },

  /** Filiz (Rejuvenate: hedefin ayağında açan). */
  sprout: { size: 64, draw: (g) => {
    g.line(16, 31, 15.4, 18, 'G', 1.8).line(15.4, 18, 16.6, 9, 'G', 1.4);
    g.poly([15.6, 19.5, 6, 14.6, 4.4, 20.4, 10.6, 22.4], 'g');
    g.poly([15.6, 19.5, 10.6, 22.4, 4.4, 20.4], 'G');
    g.poly([16.2, 15.4, 25.6, 10, 28, 15.6, 21.6, 18.4], 'g');
    g.poly([16.2, 15.4, 21.6, 18.4, 28, 15.6], 'G');
    g.disc(16.8, 7.4, 3.4, 'a');
    g.disc(16.4, 6.8, 1.6, 'z');
  } },

  /** Çiçek (Rejuvenate'in iyileşme-zaman-içinde izi: hedefin etrafında açar). */
  blossom: { size: 48, draw: (g) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.disc(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 5.4, 'z');
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.disc(16 + Math.cos(a) * 7.4, 16 + Math.sin(a) * 7.4, 3.6, 'w');
    }
    g.disc(16, 16, 4, 'y').disc(15, 15, 1.6, 'w');
  } },

  /** Işıyan tohum (Rejuvenate: druid'in avucundan dosta süzülen). */
  seedlight: { size: 64, outline: false, draw: (g) => {
    g.disc(16, 16, 9, 'A');
    g.disc(16, 16, 7, 'a');
    g.disc(16, 16, 4.6, 'z');
    g.disc(15, 15, 2.4, 'w');
  } },

  /** Palamut (Summon Treant: druid'in toprağa ektiği tohum). */
  acorn: { size: 64, draw: (g) => {
    g.ellipse(16, 19, 8, 9.5, 'b');
    g.ellipse(14, 17, 4, 6, 'n');
    g.ellipse(16, 11, 9.5, 4.4, 'k');
    g.dither(8, 8.5, 16, 3, 'k', 'b');
    g.line(16, 7, 17.5, 2.5, 'k', 1.6);
    g.disc(16, 28, 1.2, 'k');
  } },

  /** Meşe mührü: zeminde yeşil-altın büyü dairesi (kontursuz). */
  groverune: { size: 128, outline: false, draw: (g) => {
    g.ring(16, 16, 15.4, 'a', 1);
    g.ring(16, 16, 12.8, 'Y', 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = 16 + Math.cos(a) * 14.1;
      const y = 16 + Math.sin(a) * 14.1;
      g.disc(x, y, 1, 'z');
      const b = a + Math.PI / 6;
      // yaprak işaretleri
      g.line(16 + Math.cos(b) * 13.4, 16 + Math.sin(b) * 13.4, 16 + Math.cos(b) * 14.8, 16 + Math.sin(b) * 14.8, 'Y', 0.5);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.line(16, 16, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 'a', 0.6);
      g.disc(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 1.4, 'a');
    }
    g.ring(16, 16, 4, 'a', 0.6);
  } },

  /** Toprak topağı (savrulan). */
  clod: { size: 32, draw: (g) => {
    g.poly([6, 18, 11, 8, 22, 7, 27, 16, 21, 25, 10, 25], 'k');
    g.poly([9, 16, 12, 10, 20, 9.4, 22, 14, 16, 18], 'b');
  } },
};
