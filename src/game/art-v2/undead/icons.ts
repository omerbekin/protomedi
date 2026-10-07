/**
 * Undead - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/undead/idle.png): kukuletalı lich; mor + kömür grisi yırtık cübbe, kemik kafatası, TURKUAZ
 * yanan gözler, avucunda turkuaz ruh ateşi, asasında turkuaz kristal. Skeleton (çağrı): paslı kısa kılıç + yuvarlak ahşap kalkan,
 * turkuaz gözler. v2 görsel dili: "turkuaz ruh ateşi + mezar moru + kemik". Palette turkuaz jeton yok: 'c' (buz mavisi) ile 'g'
 * (yeşil) dama deseniyle karıştırılır (uzaktan nane-turkuaz okunur).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): skull, soul, darkbond, bonethrow, wail, raise, bone, boneslash
 *  - skull: Undead logosu + Skeleton logosu (kukuletalı lich kafatası)
 *  - soul: Vampiric Bite pasifi: ısıran dişler + kan kalbi + içinde ruh
 *  - darkbond: Dark Bond skill'i (+ dark_bond durum rozeti, o shared'dan çözülür): iki kalp arasında kemik zincir
 *  - bonethrow, wail, raise: Undead skill'leri; bone (Bone Strike), boneslash (Bone Slash): Skeleton skill'leri
 *
 * SPRITES: v2 efektlerinin (vfx.ts) kullandığı ek çizimler; efektte k.v2Sprite(c, 'ad', renk, x, y, boyut) ile çizilir.
 */
import type { V2SpriteEntry } from '../types';
import type { PxGrid } from '../../pixel-art';
import { blade, sparkle } from '../../pixel-art';

// ---------------------------------------------------------------------------------------------------------------- yardımcılar

/** Turkuaz ruh ateşi dolgusu: daire içinde 'c'/'g' dama + beyaz çekirdek. */
function soulDisc(g: PxGrid, cx: number, cy: number, r: number): void {
  g.disc(cx, cy, r, 'G');
  // dama: c/g karışımı (turkuaz), kenarı koyu yeşil
  const k = g.k;
  for (let y = Math.floor((cy - r) * k); y <= Math.ceil((cy + r) * k); y++)
    for (let x = Math.floor((cx - r) * k); x <= Math.ceil((cx + r) * k); x++) {
      const d = Math.hypot(x + 0.5 - cx * k, y + 0.5 - cy * k) / (r * k);
      if (d > 0.78) continue;
      g.px(x, y, d < 0.32 ? 'w' : (x + y) % 2 ? 'c' : 'g');
    }
}

/** Ruh alevi (damla biçimli, turkuaz): taban (cx, by), yükseklik h, genişlik w. */
function soulFlame(g: PxGrid, cx: number, by: number, h: number, w: number): void {
  const shape = (s: number) => [cx, by - h * s, cx + w * s * 1.05, by - h * s * 0.42, cx + w * s * 0.8, by - h * s * 0.08, cx, by, cx - w * s * 0.8, by - h * s * 0.08, cx - w * s * 1.05, by - h * s * 0.42];
  g.poly(shape(1), 'G');
  // iç: c/g dama (turkuaz)
  const tmp: Array<[number, number]> = [];
  const inner = shape(0.72).map((v) => v * g.k);
  const n = inner.length / 2;
  for (let y = 0; y < g.size; y++) {
    const xs: number[] = [];
    const py = y + 0.5;
    for (let i = 0; i < n; i++) {
      const ax = inner[i * 2]!;
      const ay = inner[i * 2 + 1]!;
      const bx = inner[((i + 1) % n) * 2]!;
      const by2 = inner[((i + 1) % n) * 2 + 1]!;
      if ((ay <= py && by2 > py) || (by2 <= py && ay > py)) xs.push(ax + ((py - ay) / (by2 - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]! - 0.5); x <= Math.floor(xs[i + 1]! - 0.5); x++) tmp.push([x, y]);
  }
  for (const [x, y] of tmp) g.px(x, y, (x + y) % 2 ? 'c' : 'g');
  g.poly(shape(0.38), 'w');
}

/** Uzun kemik (femur): iki uçta çift topuz, gövde açık kemik + alt kenar gölgesi. */
function femur(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number, hi = 'e', lo = 'n'): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const r = w * 0.72;
  for (const [x, y] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    g.disc(x + nx * r * 0.8, y + ny * r * 0.8, r, hi);
    g.disc(x - nx * r * 0.8, y - ny * r * 0.8, r, hi);
  }
  g.line(x0, y0, x1, y1, hi, w);
  // alt kenar gölgesi + uç gölgeleri
  g.line(x0 + nx * w * 0.32, y0 + ny * w * 0.32, x1 + nx * w * 0.32, y1 + ny * w * 0.32, lo, w * 0.3);
  g.disc(x0 + nx * r * 1.05, y0 + ny * r * 1.05, r * 0.42, lo);
  g.disc(x1 + nx * r * 1.05, y1 + ny * r * 1.05, r * 0.42, lo);
  // parlama
  g.line(x0 - nx * w * 0.25 + (x1 - x0) * 0.15, y0 - ny * w * 0.25 + (y1 - y0) * 0.15, x0 - nx * w * 0.25 + (x1 - x0) * 0.7, y0 - ny * w * 0.25 + (y1 - y0) * 0.7, 'w', 0.5);
}

/** Kafatası (önden): kubbe + çene, göz çukurları turkuaz yanar. */
function skullFace(g: PxGrid, cx: number, cy: number, s: number, glow = true): void {
  g.disc(cx, cy, 6.6 * s, 'e');
  g.poly([cx - 4.6 * s, cy + 2.6 * s, cx + 4.6 * s, cy + 2.6 * s, cx + 3.6 * s, cy + 9.2 * s, cx - 3.6 * s, cy + 9.2 * s], 'e');
  // elmacık gölgesi
  g.poly([cx - 6.2 * s, cy + 1.6 * s, cx - 3.4 * s, cy + 3.6 * s, cx - 4.4 * s, cy + 5.6 * s], 'n');
  g.poly([cx + 6.2 * s, cy + 1.6 * s, cx + 3.4 * s, cy + 3.6 * s, cx + 4.4 * s, cy + 5.6 * s], 'n');
  g.ellipse(cx - 2.8 * s, cy + 0.8 * s, 2.15 * s, 2.35 * s, 'o');
  g.ellipse(cx + 2.8 * s, cy + 0.8 * s, 2.15 * s, 2.35 * s, 'o');
  if (glow) {
    g.disc(cx - 2.8 * s, cy + 1 * s, 1.15 * s, 'c').disc(cx + 2.8 * s, cy + 1 * s, 1.15 * s, 'c');
    g.disc(cx - 2.8 * s, cy + 1 * s, 0.5 * s, 'w').disc(cx + 2.8 * s, cy + 1 * s, 0.5 * s, 'w');
  }
  g.poly([cx, cy + 3 * s, cx - 1.1 * s, cy + 5 * s, cx + 1.1 * s, cy + 5 * s], 'o');
  // dişler
  g.rect(cx - 3.2 * s, cy + 6.1 * s, 6.4 * s, 1.7 * s, 'w');
  g.line(cx - 3.4 * s, cy + 7.9 * s, cx + 3.4 * s, cy + 7.9 * s, 'o', 0.5);
  for (let i = -2; i <= 2; i++) g.line(cx + i * 1.3 * s, cy + 6.1 * s, cx + i * 1.3 * s, cy + 7.7 * s, 'n', 0.25);
}

/** Kalp: iki lob + uç; (cx, cy) lobların ortası, s ölçek (1 = ~23 birim genişlik). */
function heartShape(g: PxGrid, cx: number, cy: number, s: number, t: string, grow = 0): void {
  const r = 6.4 * s + grow;
  g.disc(cx - 5 * s, cy, r, t).disc(cx + 5 * s, cy, r, t);
  g.poly([cx - 11.2 * s - grow, cy + 1.4 * s, cx + 11.2 * s + grow, cy + 1.4 * s, cx, cy + 13 * s + grow * 1.4], t);
}

/** Omur boncuğu (zincir halkası), (x, y) merkez, `ang` zincir yönü, `len` uzunluk: iki eklem topuzu + bel + dikey çıkıntı + kan noktası. */
function vertebraBead(g: PxGrid, x: number, y: number, ang: number, len: number): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const h = len / 2;
  const w = len * 0.42;
  // gövde (bel)
  g.line(x - ux * h * 0.7, y - uy * h * 0.7, x + ux * h * 0.7, y + uy * h * 0.7, 'e', w * 1.25);
  // uçlarda çift eklem topuzu
  for (const sgn of [-1, 1]) {
    const ex = x + ux * h * sgn;
    const ey = y + uy * h * sgn;
    g.disc(ex + nx * w * 0.42, ey + ny * w * 0.42, w * 0.52, 'e');
    g.disc(ex - nx * w * 0.42, ey - ny * w * 0.42, w * 0.52, 'e');
  }
  // dikey dikenler (üst/alt)
  g.poly([x - ux * w * 0.5, y - uy * w * 0.5, x + nx * w * 1.25, y + ny * w * 1.25, x + ux * w * 0.5, y + uy * w * 0.5], 'e');
  g.poly([x - ux * w * 0.5, y - uy * w * 0.5, x - nx * w * 1.25, y - ny * w * 1.25, x + ux * w * 0.5, y + uy * w * 0.5], 'e');
  // alt gölge + parlama + ortadaki kan-ruh deliği
  g.line(x - ux * h * 0.8 + nx * w * 0.42, y - uy * h * 0.8 + ny * w * 0.42, x + ux * h * 0.8 + nx * w * 0.42, y + uy * h * 0.8 + ny * w * 0.42, 'n', 0.5);
  g.line(x - ux * h * 0.6 - nx * w * 0.36, y - uy * h * 0.6 - ny * w * 0.36, x + ux * h * 0.5 - nx * w * 0.36, y + uy * h * 0.5 - ny * w * 0.36, 'w', 0.25);
  g.disc(x, y, w * 0.3, 'R');
}

// ---------------------------------------------------------------------------------------------------------------- ikonlar

export const ICONS: Record<string, V2SpriteEntry> = {
  /** Undead / Skeleton logosu: yırtık mor kukuletanın içinden bakan, gözleri turkuaz yanan kafatası. */
  skull: (g) => {
    // kukuleta (yırtık alt kenar)
    g.poly([16, 1.5, 23, 3.5, 27.5, 9, 29, 17, 28.5, 24.5, 30.5, 30.5, 25.5, 28.5, 22.5, 31, 19.5, 28.5, 16, 30.5, 12.5, 28.5, 9.5, 31, 6.5, 28.5, 1.5, 30.5, 3.5, 24.5, 3, 17, 4.5, 9, 9, 3.5], 'P');
    g.poly([9, 3.5, 16, 1.5, 16, 4.5, 10.5, 6.5, 7, 12, 6, 20, 4.5, 26, 3.5, 24.5, 3, 17, 4.5, 9], 'p');
    g.line(23.5, 6, 27, 14, 'P', 1); // kıvrım
    // kukuleta içi derin gölge
    g.ellipse(16, 17.5, 9, 11, 'o');
    g.ellipse(16, 18.5, 8, 9.5, 'P');
    g.ellipse(16, 18.5, 7.2, 8.6, 'o');
    skullFace(g, 16, 14.5, 1);
  },

  /** Vampiric Bite: kemik çene kan kalbine diş geçirir; kalbin içinde turkuaz ruh yanar, uçtan kan damlar (ısırıp ruh/can çekmek). */
  soul: (g) => {
    // kalp
    g.disc(11.2, 15.5, 6.4, 'R').disc(20.8, 15.5, 6.4, 'R');
    g.poly([5, 17, 27, 17, 16, 29], 'R');
    g.disc(11.2, 15.2, 5.4, 'r').disc(20.8, 15.2, 5.4, 'r');
    g.poly([6.2, 16.6, 25.8, 16.6, 16, 27.2], 'r');
    g.disc(9.4, 13.4, 1.8, 'z');
    // içte ruh alevi
    soulFlame(g, 16, 24.5, 9.5, 3.4);
    // üst çene (kemik yay) + iki uzun diş kalbe batar
    g.ring(16, 15, 13.5, 'e', 2.6, Math.PI * 1.12, Math.PI * 1.88);
    g.ring(16, 15, 13.5, 'n', 0.6, Math.PI * 1.12, Math.PI * 1.88);
    g.poly([7.4, 6.6, 11.6, 5.2, 10.6, 15.2], 'e');
    g.poly([20.4, 5.2, 24.6, 6.6, 21.4, 15.2], 'e');
    g.line(10.9, 6.6, 10.5, 13.4, 'n', 0.5).line(23.6, 7.2, 21.6, 13.4, 'n', 0.5);
    // diş yaraları ve kan damlası
    g.disc(10.7, 15.6, 0.9, 'R').disc(21.3, 15.6, 0.9, 'R');
    g.poly([16, 28.5, 17.6, 31, 14.4, 31], 'R');
    g.disc(16, 31, 1.4, 'R');
  },

  /**
   * Dark Bond: iki kalp arasında sarkan kemik zincir (animasyondaki omur boncukları + kan ipliği). Solda Undead'in mor kalbi
   * (içinde turkuaz ruh ateşi), sağda dostun kan kalbi; zincirin ortasından kan-ruh damlası akar (lifesteal'ın paylaşıldığı yol).
   */
  darkbond: (g) => {
    // zincir yolu: Undead kalbinin ucundan dost kalbinin ucuna, aşağı sarkan yay (önce çizilir: kalpler üstüne biner)
    const p0 = { x: 7.4, y: 13.6 };
    const p1 = { x: 24.6, y: 13.6 };
    const sag = 13.4;
    const at = (u: number) => ({ x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u + Math.sin(u * Math.PI) * sag });
    // kan ipliği
    for (let i = 0; i < 30; i++) {
      const a = at(i / 30);
      const b = at((i + 1) / 30);
      g.line(a.x, a.y, b.x, b.y, 'R', 0.9);
    }
    // omur boncukları (zincir yönünde döndürülmüş; aralarda kan ipliği görünür)
    // (yay uzunluğuna göre eşit aralık: dipte sıkışmasınlar)
    const pts = Array.from({ length: 121 }, (_, i) => at(i / 120));
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    const total = acc[acc.length - 1]!;
    for (const f of [0.17, 0.335, 0.5, 0.665, 0.83]) {
      const i = Math.max(1, acc.findIndex((v) => v >= f * total));
      const p = pts[i]!;
      const q = pts[Math.min(pts.length - 1, i + 1)]!;
      const o = pts[i - 1]!;
      vertebraBead(g, p.x, p.y, Math.atan2(q.y - o.y, q.x - o.x), 3.0);
    }
    // ortada nabız: kan-ruh damlası zincirden akar
    const m = at(0.5);
    g.disc(m.x, m.y + 2.6, 1.1, 'r');
    g.poly([m.x - 0.9, m.y + 2.4, m.x + 0.9, m.y + 2.4, m.x, m.y + 4.6], 'r');
    // kalpler: Undead (sol, mor + turkuaz ruh ateşi) ve dost (sağ, kan); ikisi de zincire doğru hafif eğik
    heartShape(g, 7.4, 6.4, 0.5, 'P');
    heartShape(g, 7.4, 6.4, 0.5, 'p', -0.8);
    soulFlame(g, 7.4, 11.4, 6.6, 2.4);
    g.disc(5, 5, 0.9, 'w');
    heartShape(g, 24.6, 6.4, 0.5, 'R');
    heartShape(g, 24.6, 6.4, 0.5, 'r', -0.8);
    g.disc(22.2, 5, 0.9, 'w');
    g.line(21.6, 8.6, 23.6, 10.6, 'R', 0.5);
    // bağın uçları: zincir kalplerin ucuna kemik halkayla takılı
    g.disc(p0.x, p0.y + 0.4, 1.1, 'e').disc(p1.x, p1.y + 0.4, 1.1, 'e');
    sparkle(g, 16, 3.6, 2.4, 'c');
  },

  /** Bone Throw: turkuaz ruh ateşine sarılı, dönerek uçan femur kemiği; arkasında dönüş izleri. */
  bonethrow: (g) => {
    // dönüş izleri (arka sol-alt)
    g.ring(15, 17, 13.5, 'P', 1.6, Math.PI * 0.5, Math.PI * 1.0);
    g.ring(15, 17, 10.5, 'p', 1.3, Math.PI * 0.58, Math.PI * 0.98);
    g.ring(15, 17, 13.5, 'c', 0.6, Math.PI * 0.62, Math.PI * 0.92);
    // kuyruktaki ruh alevi
    soulFlame(g, 7.5, 27, 9, 3.6);
    femur(g, 9.5, 22.5, 23.5, 8.5, 3.4);
    // çatlak
    g.line(17.5, 14.5, 15.8, 16.6, 'n', 0.5).line(15.8, 16.6, 16.6, 17.4, 'n', 0.5);
    sparkle(g, 27, 4.5, 3.4, 'w');
    g.disc(27, 4.5, 0.7, 'c');
  },

  /** Wail of the Dead: çığlık atan mor hayalet (ağzı aşağı sarkmış kafatası), önünde ses dalgaları, ağzından zehir damlar. */
  wail: (g) => {
    // hayalet gövde: kafadan sağ-alta savrulan yırtık kuyruk
    g.poly([9, 6.5, 14.5, 2.5, 21, 4.5, 24.5, 10, 27.5, 15.5, 31, 19.5, 27, 20.5, 30, 25.5, 24.5, 24.5, 25.5, 30.5, 19.5, 26, 15, 28.5, 12.5, 22.5, 8.5, 18.5, 7, 12], 'a');
    g.poly([14.5, 2.5, 21, 4.5, 24.5, 10, 27.5, 15.5, 31, 19.5, 26, 18.5, 22, 12, 18, 6.5], 'z');
    // uzamış kafatası yüzü
    g.ellipse(14.5, 11.5, 5.4, 6.4, 'e');
    g.poly([10.4, 13, 18.6, 13, 17.2, 22.5, 11.8, 22.5], 'e');
    g.ellipse(12.2, 10.6, 1.5, 2, 'o').ellipse(16.8, 10.6, 1.5, 2, 'o');
    g.disc(12.2, 10.9, 0.75, 'c').disc(16.8, 10.9, 0.75, 'c');
    // kopmuş çene: kocaman açık çığlık ağzı
    g.ellipse(14.5, 17.6, 2.7, 4.2, 'o');
    g.ellipse(14.5, 18.2, 1.5, 2.6, 'P');
    // ses dalgaları (sola)
    g.ring(13, 16, 8.5, 'w', 1.1, Math.PI * 0.72, Math.PI * 1.22);
    g.ring(13, 16, 11.5, 'z', 1.1, Math.PI * 0.74, Math.PI * 1.2);
    g.ring(13, 16, 14.5, 'a', 1.1, Math.PI * 0.78, Math.PI * 1.16);
    // zehir damlaları
    g.disc(13.6, 25.2, 1.1, 'g').disc(15.6, 28.4, 0.9, 'g').disc(13, 30.4, 0.7, 'G');
  },

  /** Raise Dead: mezar toprağını yarıp çıkan iskelet eli; arkasında mor ölü-çağırma halkası, avucun üstünde turkuaz ruh. */
  raise: (g) => {
    // halka + rünler
    g.ring(16, 13.5, 12.5, 'a', 1.4);
    g.ring(16, 13.5, 9.6, 'A', 0.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      g.disc(16 + Math.cos(a) * 11, 13.5 + Math.sin(a) * 11, 0.7, 'z');
    }
    // ruh
    soulDisc(g, 16, 6.5, 3);
    // önkol kemikleri
    g.line(14.6, 27, 15, 18, 'e', 1.5).line(17.6, 27, 17.2, 18, 'e', 1.5);
    g.line(15.3, 27, 15.4, 19, 'n', 0.5);
    // avuç ve parmaklar (açık, yukarı uzanan)
    g.ellipse(16.2, 16.6, 3.4, 2.4, 'e');
    const fingers: Array<[number, number, number, number]> = [
      [13.2, 15.8, 10.4, 10.6],
      [14.8, 15, 13.8, 8.6],
      [16.6, 14.8, 16.8, 8.2],
      [18.2, 15.2, 19.8, 9.4],
      [19.2, 16.8, 22.4, 13.8],
    ];
    for (const [x0, y0, x1, y1] of fingers) {
      g.line(x0, y0, x1, y1, 'e', 1.15);
      g.disc(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5, 0.75, 'w');
    }
    // mezar toprağı
    g.ellipse(16, 28, 14, 4.2, 'k');
    g.ellipse(15, 27, 11, 2.6, 'b');
    g.disc(6, 25.5, 1.3, 'b').disc(26.5, 24.8, 1.1, 'k').disc(22.5, 22.8, 0.9, 'b').disc(9.5, 22.5, 0.8, 'k');
  },

  /** Bone Strike (Skeleton): iskelet elinde çentikli, paslı kısa kılıç çaprazlama iner. */
  bone: (g) => {
    blade(g, 10.5, 21.5, 27.5, 4.5, 4.6, 'l', 'm');
    // pas lekeleri (dama) ve çentikler
    g.dither(17, 12.5, 3, 2.5, 'b', 'm').dither(22.5, 8, 2.5, 2, 'b', 'Y');
    g.poly([19.6, 12.6, 21.2, 12.2, 20.6, 13.8], '.').poly([14.2, 18.4, 15.6, 17.6, 15.4, 19.2], '.');
    // demir siper
    g.line(6.5, 17, 14, 24.5, 'd', 2.3).line(6.5, 16.6, 14, 24.1, 'm', 0.6);
    // deri sarılı kabza
    g.line(9.5, 22.5, 4, 28, 'k', 2.4);
    // kemik parmaklar kabzayı sarar
    for (let i = 0; i < 3; i++) {
      const x = 8.1 - i * 1.55;
      const y = 23.9 + i * 1.55;
      g.line(x - 1.6, y - 1.6, x + 1.6, y + 1.6, 'e', 1.15);
    }
    g.disc(9.6, 25.6, 1.2, 'e'); // başparmak
    g.disc(3.2, 28.8, 1.7, 'd').disc(2.8, 28.4, 0.6, 'l'); // topuz
    sparkle(g, 26.5, 5.5, 3, 'w');
  },

  /** Bone Slash (Skeleton): paslı kılıç geniş yay çizerek savrulur; yay üç şeride (hedef + iki yanı) üç kesik bırakır. */
  boneslash: (g) => {
    // geniş hilal iz (kemik beyazı), içi oyulmuş
    g.disc(15, 17, 13.5, 'l');
    g.disc(15.6, 17.4, 12.6, 'e');
    g.disc(18.6, 19.6, 12.2, '.');
    g.ring(15, 17, 13.5, 'w', 0.9, Math.PI * 0.95, Math.PI * 1.75);
    // yayın ucunda kılıç
    blade(g, 21.5, 7.5, 30, 1.5, 3.4, 'l', 'm');
    g.dither(25, 4.5, 2, 1.5, 'b', 'm');
    g.line(19.5, 5.5, 23, 10, 'd', 1.8);
    g.line(21, 8, 18.5, 10, 'k', 1.6);
    // üç şerit, üç kesik
    for (let i = 0; i < 3; i++) {
      const y = 15.5 + i * 5.6;
      g.poly([21.5, y + 1.6, 30, y - 2.6, 25.5, y + 0.4], 'R');
      g.poly([22.5, y + 1.1, 29.4, y - 2.2, 25.6, y - 0.1], 'r');
      g.line(23.6, y + 0.4, 28.2, y - 1.8, 'w', 0.5);
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------- efekt sprite'ları

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Fırlatılan femur (Bone Throw mermisi). */
  femur: { size: 96, draw: (g) => femur(g, 7, 25, 25, 7, 4.2) },

  /** Turkuaz ruh alevi (avuç ateşi, lifesteal ruhu). */
  soulflame: { size: 96, draw: (g) => soulFlame(g, 16, 29, 26, 9) },

  /** Ruh kıvılcımı: küçük turkuaz ruh topu (lifesteal akışı, iz). */
  soulmote: { size: 64, outline: false, draw: (g) => {
    g.disc(16, 16, 9, 'G');
    soulDisc(g, 16, 16, 8);
  } },

  /** Çığlık atan banshee (Wail of the Dead): ağzı açık uzamış kafatası + savrulan mor gövde. */
  banshee: { size: 128, draw: (g) => {
    g.poly([10, 7, 15.5, 2.5, 21.5, 5, 25, 11, 26, 18, 30.5, 24, 25.5, 24, 28, 30.5, 22, 27, 20, 31.5, 16.5, 27, 13, 31.5, 11.5, 26, 6.5, 29.5, 8, 22, 5, 17, 7.5, 12], 'a');
    g.poly([15.5, 2.5, 21.5, 5, 25, 11, 26, 18, 30.5, 24, 24, 20, 21, 12, 18, 6], 'z');
    g.ellipse(16, 12, 5.6, 6.6, 'e');
    g.poly([11.6, 13.5, 20.4, 13.5, 18.8, 24, 13.2, 24], 'e');
    g.ellipse(13.6, 11, 1.6, 2.1, 'o').ellipse(18.4, 11, 1.6, 2.1, 'o');
    g.disc(13.6, 11.3, 0.8, 'c').disc(18.4, 11.3, 0.8, 'c');
    g.ellipse(16, 18.6, 2.8, 4.6, 'o');
    g.ellipse(16, 19.2, 1.6, 3, 'P');
  } },

  /** Kemik iskelet eli (yerden çıkıp bileği kavrar: Bone Throw'un Slow'u). */
  gravehand: { size: 96, draw: (g) => {
    g.line(14.5, 31, 15, 20, 'e', 1.8).line(18, 31, 17.6, 20, 'e', 1.8);
    g.ellipse(16.4, 18.4, 4, 2.8, 'e');
    const f: Array<[number, number, number, number, number, number]> = [
      [12.6, 17.6, 10, 12.4, 12.4, 9],
      [14.6, 16.6, 13.6, 10.2, 16, 7.6],
      [16.8, 16.4, 17.4, 9.8, 19.6, 7.8],
      [18.8, 16.8, 21, 11.2, 23, 9.6],
      [20.2, 18.6, 23.6, 16, 25, 13.2],
    ];
    for (const [x0, y0, x1, y1, x2, y2] of f) {
      g.line(x0, y0, x1, y1, 'e', 1.3).line(x1, y1, x2, y2, 'e', 1.1);
      g.disc(x1, y1, 0.8, 'w');
    }
    g.line(15.4, 30, 15.6, 21, 'n', 0.6);
  } },

  /** Bağ kalbi (Dark Bond): bağlı iki birimin üstünde kısa yanan kan-ruh kalbi. */
  bondheart: { size: 64, draw: (g) => {
    g.disc(11, 13, 6.6, 'R').disc(21, 13, 6.6, 'R');
    g.poly([4.6, 14.6, 27.4, 14.6, 16, 28], 'R');
    g.disc(11, 12.6, 5.6, 'a').disc(21, 12.6, 5.6, 'a');
    g.poly([5.8, 14.2, 26.2, 14.2, 16, 26], 'a');
    soulDisc(g, 16, 16.5, 4);
    g.disc(9.2, 10.6, 1.6, 'z');
  } },

  /** Omur boncuğu (Dark Bond'un kemik zinciri halkası). */
  vertebra: { size: 64, draw: (g) => {
    // yatay kemik halka (zincir yönünde): iki eklem topuzu + bel + üstte/altta kısa çıkıntılar
    g.disc(6.5, 13.2, 3.6, 'e').disc(6.5, 18.8, 3.6, 'e');
    g.disc(25.5, 13.2, 3.6, 'e').disc(25.5, 18.8, 3.6, 'e');
    g.rect(6.5, 12, 19, 8, 'e');
    g.poly([13, 12, 16, 6.5, 19, 12], 'e').poly([13, 20, 16, 25.5, 19, 20], 'e');
    g.line(7, 18.6, 25, 18.6, 'n', 1);
    g.disc(16, 16, 2.2, 'R');
    g.line(8, 13.4, 23, 13.4, 'w', 0.5);
  } },

  /** Yarım tur kum saati: üst hazne yarı dolu (Dark Bond yarım tur harcar). */
  halfglass: { size: 96, draw: (g) => {
    g.rect(7, 3, 18, 2.6, 'b').rect(7, 26.4, 18, 2.6, 'b');
    g.line(8.5, 5, 8.5, 26.5, 'k', 1.2).line(23.5, 5, 23.5, 26.5, 'k', 1.2);
    g.poly([10, 5.6, 22, 5.6, 16.8, 15.4, 15.2, 15.4], 'l');
    g.poly([15.2, 16.6, 16.8, 16.6, 22, 26.4, 10, 26.4], 'l');
    // kum: üstte yarı, altta yarı
    g.poly([12.6, 10.6, 19.4, 10.6, 16.8, 15.2, 15.2, 15.2], 'n');
    g.line(16, 15, 16, 24, 'n', 0.5);
    g.poly([12.6, 26.2, 19.4, 26.2, 16, 22], 'n');
    g.line(11, 6.5, 13, 9.5, 'w', 0.5);
  } },

  /** Mezar mührü: zeminde dönen ölü-çağırma halkası (kontursuz; yere yatırılarak çizilir). */
  gravesigil: { size: 128, outline: false, draw: (g) => {
    g.ring(16, 16, 15.5, 'a', 1.1);
    g.ring(16, 16, 13.4, 'z', 0.5);
    g.ring(16, 16, 9.2, 'a', 0.75);
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;
      g.line(16 + Math.cos(a0) * 9.2, 16 + Math.sin(a0) * 9.2, 16 + Math.cos(a1) * 9.2, 16 + Math.sin(a1) * 9.2, 'a', 0.5);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = 16 + Math.cos(a) * 14.45;
      const y = 16 + Math.sin(a) * 14.45;
      if (i % 3 === 0) g.disc(x, y, 0.9, 'w');
      else g.line(x - Math.sin(a) * 0.7, y + Math.cos(a) * 0.7, x + Math.sin(a) * 0.7, y - Math.cos(a) * 0.7, 'z', 0.5);
    }
    g.disc(16, 16, 1.6, 'z');
  } },

  /** Kemik kıymığı (Bone Throw parçalanması, Skeleton kesişleri). */
  bonechip: { size: 48, draw: (g) => {
    g.poly([6, 20, 14, 9, 25, 6, 21, 15, 26, 24, 13, 23], 'e');
    g.line(10, 19, 21, 11, 'n', 1);
    g.line(12, 14, 18, 9.6, 'w', 0.8);
  } },

  /** Pas pulu (Skeleton'un paslı kılıcından dökülen). */
  rustflake: { size: 32, draw: (g) => {
    g.poly([8, 12, 20, 6, 25, 16, 17, 25, 7, 21], 'b');
    g.poly([11, 13, 18, 10, 20, 16, 14, 19], 'Y');
  } },
};
