/**
 * ITEM VE ÖDÜL İKONLARI: tek ortak kaynak (Endless ödül kartları + dükkân, sefer Spoils kartı, Gear ekranı yuvaları + torba,
 * Codex "Items and gear" makalesi, Codex > Assets > Icons). Pixel art motoruyla (src/game/pixel-art.ts) v2 kalitesinde 128x128 çizilir
 * (32'lik mantıksal koordinat, 1 birim = 4 ince piksel, otomatik kontur + ışık/gölge). Phaser'a ve DOM'a bağımlı DEĞİL (testte yüklenir):
 * doku/resim üretimi `paintItemIcon` ile çağıranın canvas'ına yapılır (Phaser: src/game/endless-emblems.ts, DOM: src/ui/item-icon-dom.ts).
 *
 * NADİRLİK: nesnenin kendisi yeniden boyanmaz; yalnızca küçük ayrıntılar (mücevher, kenar şeridi, bilezik, kabza taşı) vurgu jetonu
 * `'a'` (+ koyu `'A'`, açık `'z'`) ile çizilir ve çağıran buna nadirlik rengini verir. Çerçeve / parıltı rengi ekranın kendi işidir.
 *
 * ÖNCELİK: item'in boyalı görseli varsa (assets/items/<id>.webp, src/game/item-icon-files.ts) ekranlar onu gösterir; buradaki çizimler
 * görseli olmayan item'lerin, boş yuvaların ve ödül kartlarının yedeğidir.
 *
 * Ad seçimi: item'in `icon` alanı (data/items.json, isteğe bağlı) > silah ailesi (`FAMILY_ICON`) > yuva (`SLOT_ICON`).
 * Yeni ikon = `ITEM_ICONS`'a yeni anahtar; Codex > Assets > Icons onu kendiliğinden listeler (src/gallery/catalog.ts > itemIcons).
 */
import { PxGrid, INTERNAL_TOKEN_VALUES, blade, shadeColor, sparkle, type Cell } from './pixel-art';

type Draw = (g: PxGrid) => void;

/** İkon boyutu (ince piksel). */
export const ITEM_ICON_SIZE = 128;

// ------------------------------------------------------------------------------------------------- çizim yardımcıları

interface PenOpt {
  /** Saat yönünde dönüş (derece). */
  deg?: number;
  /** Ölçek. */
  s?: number;
  tx?: number;
  ty?: number;
  cx?: number;
  cy?: number;
  /** Yatay ayna. */
  flip?: boolean;
}

/** Dönmüş / ölçeklenmiş yerel uzayda çizen kalem (silahları dikey tasarlayıp çapraz koymak için). */
function pen(g: PxGrid, o: PenOpt = {}) {
  const a = ((o.deg ?? 0) * Math.PI) / 180;
  const s = o.s ?? 1;
  const cx = o.cx ?? 16;
  const cy = o.cy ?? 16;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const P = (x: number, y: number): [number, number] => {
    let dx = (x - cx) * s;
    const dy = (y - cy) * s;
    if (o.flip) dx = -dx;
    return [cx + dx * cos - dy * sin + (o.tx ?? 0), cy + dx * sin + dy * cos + (o.ty ?? 0)];
  };
  const pts = (p: number[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) out.push(...P(p[i]!, p[i + 1]!));
    return out;
  };
  const api = {
    P,
    poly: (p: number[], t: string) => void g.poly(pts(p), t),
    line: (x0: number, y0: number, x1: number, y1: number, t: string, w = 1) => {
      const [a0, b0] = P(x0, y0);
      const [a1, b1] = P(x1, y1);
      g.line(a0, b0, a1, b1, t, w * s);
    },
    /** Yuvarlak uçlu kalın çizgi. */
    stroke: (x0: number, y0: number, x1: number, y1: number, t: string, w = 1) => {
      api.line(x0, y0, x1, y1, t, w);
      api.disc(x0, y0, w / 2, t);
      api.disc(x1, y1, w / 2, t);
    },
    disc: (x: number, y: number, r: number, t: string) => {
      const [a0, b0] = P(x, y);
      g.disc(a0, b0, r * s, t);
    },
    ellipse: (x: number, y: number, rx: number, ry: number, t: string) => {
      const p: number[] = [];
      for (let i = 0; i < 28; i++) {
        const an = (i / 28) * Math.PI * 2;
        p.push(x + Math.cos(an) * rx, y + Math.sin(an) * ry);
      }
      api.poly(p, t);
    },
    rect: (x: number, y: number, w: number, h: number, t: string) => api.poly([x, y, x + w, y, x + w, y + h, x, y + h], t),
    blade: (x0: number, y0: number, x1: number, y1: number, w: number, hi = 'l', lo = 'm', fuller = 'w') => {
      const [a0, b0] = P(x0, y0);
      const [a1, b1] = P(x1, y1);
      blade(g, a0, b0, a1, b1, w * s, hi, lo, fuller);
    },
  };
  return api;
}

/** Koşulu sağlayan ince pikselleri boyar (x, y mantıksal piksel merkezi); `only` verilirse yalnızca o jetonların üstüne. */
function paintIf(g: PxGrid, t: string, test: (x: number, y: number) => boolean, only?: string): void {
  for (let y = 0; y < g.size; y++)
    for (let x = 0; x < g.size; x++) {
      if (only !== undefined && !only.includes(g.get(x, y))) continue;
      if (test((x + 0.5) / g.k, (y + 0.5) / g.k)) g.px(x, y, t);
    }
}

/** Zincir zırh dokusu: `on` jetonlu bölgeye kaydırmalı küçük halka sıraları (üst kenar açık, alt kenar koyu). */
function mail(g: PxGrid, on: string, hi = 'l', lo = 'd'): void {
  const n = Math.max(1, Math.round(g.k / 4)); // 128'de 1 (4 ince piksellik halka)
  for (let y = 0; y < g.size; y++)
    for (let x = 0; x < g.size; x++) {
      if (g.get(x, y) !== on) continue;
      const row = Math.floor(y / (3 * n));
      const u = Math.floor((x + (row % 2) * 2 * n) / n) % 4;
      const v = Math.floor(y / n) % 3;
      if (v === 0 && (u === 1 || u === 2)) g.px(x, y, hi);
      else if (v === 2 && (u === 0 || u === 3)) g.px(x, y, lo);
    }
}

/** Para (üstten eğik görünüş): kenar + yüz. */
function coinFlat(g: PxGrid, x: number, y: number, r = 3): void {
  g.ellipse(x, y, r, r * 0.5, 'Y');
  g.ellipse(x - 0.1, y - 0.35, r * 0.82, r * 0.34, 'y');
}

/** Dik duran para: yüz + kenar halkası + yuvarlak damga. */
function coinUp(g: PxGrid, x: number, y: number, r: number): void {
  g.disc(x, y, r, 'Y');
  g.disc(x - r * 0.08, y - r * 0.06, r * 0.8, 'y');
  g.ring(x - r * 0.08, y - r * 0.06, r * 0.5, 'Y', 0.5);
  g.disc(x - r * 0.08, y - r * 0.06, r * 0.14, 'Y');
}

/** Beyaz damarsız yaprak (küçük gösterimde beyaz leke olmasın). */
function herb(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = (-(y1 - y0) / len) * w;
  const ny = ((x1 - x0) / len) * w;
  g.poly([x0, y0, mx + nx, my + ny, x1, y1, mx - nx, my - ny], 'G');
  g.poly([x0, y0, mx + nx * 0.9, my + ny * 0.9, x1, y1], 'g');
}

// ------------------------------------------------------------------------------------------------- çizimler

/** Tek eldiven (yerel uzay; kalem ile yerleştirilir). */
function glove(p: ReturnType<typeof pen>, tone: string, seam: string): void {
  // kalın deri bilek (manşet)
  p.poly([7.5, 22.5, 22.5, 22.5, 25, 31, 5, 31], seam);
  // avuç
  p.poly([8.5, 12.5, 22.5, 12.5, 22.5, 20, 20.5, 24, 10, 24, 8, 19.5], tone);
  // parmaklar
  p.stroke(10.5, 13.5, 9.6, 5.8, tone, 3);
  p.stroke(14.1, 12.5, 14, 3.6, tone, 3.1);
  p.stroke(17.7, 12.5, 18.2, 4.4, tone, 3.1);
  p.stroke(21, 13.5, 22.2, 7.4, tone, 2.8);
  // başparmak
  p.stroke(9, 19.5, 4.6, 13, tone, 3.2);
  // parmak araları dikiş
  p.line(12.3, 12.6, 12.1, 8, 'o', 0.45);
  p.line(15.9, 12.4, 16, 7.5, 'o', 0.45);
  p.line(19.5, 12.8, 20.2, 9, 'o', 0.45);
  // boğum dikişi
  p.line(9.5, 14.6, 22, 14.6, seam, 0.5);
  // manşet: nadirlik şeridi + perçin
  p.rect(7.4, 22.3, 15.2, 1.6, 'a');
  p.disc(15, 27, 1.1, 'y');
}

export const ITEM_ICONS: Record<string, Draw> = {
  // ---------------------------------------------------------------- ödüller

  /** Altın: büzgülü deri kese, ağzından sikkeler taşıyor; önünde sikke yığını (para simgesi yok). */
  gold: (g) => {
    // kese gövdesi
    g.poly([6.5, 10, 17.5, 10, 21, 15, 22, 21.5, 19.5, 26.5, 12, 28.2, 4.8, 26.5, 2.4, 21.5, 3, 15], 'b');
    g.poly([8, 6, 16, 6, 17.5, 10.5, 6.5, 10.5], 'b');
    // fırfırlı ağız + içindeki karanlık + görünen sikkeler
    g.poly([4.6, 2.6, 8.4, 4, 12, 1.8, 15.6, 4, 19.4, 2.6, 17, 7.2, 7, 7.2], 'b');
    g.ellipse(12, 4.9, 4.4, 1.3, 'k');
    g.ellipse(10.6, 4.4, 1.8, 0.8, 'y');
    g.ellipse(13.8, 4.7, 1.6, 0.7, 'Y');
    // büzgü kordonu, düğüm ve sarkan uçlar
    g.line(6.4, 8.4, 17.6, 8.4, 'k', 1.1);
    g.disc(16.2, 8.6, 1.1, 'k');
    g.line(16.4, 9.2, 18.6, 13.4, 'k', 0.6);
    g.line(16, 9.3, 16.6, 13.8, 'k', 0.6);
    // deri kırışıkları
    g.line(8, 12.5, 6, 22.5, 'k', 0.45);
    g.line(11.5, 12, 11, 20, 'k', 0.45);
    // keseden düşen sikke
    coinUp(g, 21.5, 12.5, 2.4);
    // ön yığın: tepe, sonra arkadan öne sikkeler
    g.poly([10.5, 30.5, 31, 30.5, 29.5, 25.5, 25.5, 20.6, 20, 20, 15, 23.5, 11.5, 27.5], 'Y');
    for (const [x, y] of [
      [20.5, 20.6],
      [17.8, 22.8],
      [23, 22.6],
      [15.2, 25.4],
      [20.4, 25.2],
      [25.6, 25],
      [13, 28.2],
      [17.8, 28.4],
      [22.6, 28.4],
      [27.4, 28],
    ] as Array<[number, number]>)
      coinFlat(g, x, y, 2.9);
    // yığına yaslanmış sikke
    coinUp(g, 27.6, 18.6, 3.6);
    // parıltılar
    sparkle(g, 25.2, 14.2, 2.2, 'w');
    g.disc(16.6, 22.3, 0.5, 'w');
    g.disc(21.6, 27.9, 0.5, 'w');
  },

  /** Rest / şifa: mantar tıpalı, boynunda şifalı ot demeti bağlı yuvarlak cam şişede kırmızı iksir. */
  draught: (g) => {
    const R = 9.4;
    const cx = 16;
    const cy = 20.6;
    // cam gövde + boyun + ağız
    g.disc(cx, cy, R, 'c');
    g.rect(13.6, 6, 4.8, 7.5, 'c');
    g.rect(12.6, 5, 6.8, 1.8, 'l');
    // iksir (dolu, üstte hava payı) + derinde koyu kırmızı
    paintIf(g, 'r', (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= (R - 1.2) ** 2 && y >= 15.6);
    paintIf(g, 'R', (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= (R - 1.2) ** 2 && (x - 13.6) ** 2 + (y - 18) ** 2 > 8.6 ** 2 && y >= 15.6);
    paintIf(g, 'f', (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= (R - 1.2) ** 2 && y >= 15.6 && y < 16.5);
    // mantar tıpa
    g.rect(13.5, 1.4, 5, 4, 'b');
    g.line(14.2, 2.6, 17.8, 2.6, 'k', 0.4);
    // boyna sarılı ip + ot demeti
    g.line(13.2, 9.2, 18.8, 9.2, 'k', 0.9);
    herb(g, 19, 9.6, 25.8, 5.6, 1.8);
    herb(g, 19, 10.2, 25, 13.4, 1.5);
    herb(g, 18.6, 9, 21.4, 2.8, 1.3);
    g.disc(18.8, 9.4, 1, 'k');
    // cam parlaması ve kabarcıklar
    g.ring(cx, cy, R - 1.6, 'w', 0.7, Math.PI * 1.08, Math.PI * 1.42);
    g.disc(11.4, 23.6, 0.7, 'w');
    g.line(14.6, 6.8, 14.6, 12.4, 'w', 0.5);
    g.disc(18.2, 21, 0.7, 'w');
    g.disc(20.4, 24.2, 0.5, 'w');
    g.disc(16.6, 25.6, 0.45, 'w');
  },

  /** Hero's Feast: kalaycı tabağında kızarmış kuş (but kemikleri dışarıda), üzüm salkımı; arkada şarap dolu altın kadeh. */
  feast: (g) => {
    // kadeh (arkada)
    g.poly([20, 3, 30, 3, 29.5, 7, 27.5, 10.5, 25, 11.5, 22.5, 10.5, 20.5, 7], 'y');
    g.ellipse(25, 3.7, 4.8, 1.2, 'R');
    g.rect(24.2, 11, 1.6, 6, 'Y');
    g.disc(25, 13, 1.3, 'y');
    g.ellipse(25, 17, 3.6, 1.3, 'Y');
    g.disc(25, 7.2, 1.2, 'r');
    g.line(21.6, 5, 22.6, 8.6, 'w', 0.5);
    // kalay tabak
    g.ellipse(15, 24.6, 14, 5.6, 'm');
    g.ellipse(15, 24.2, 10.8, 3.9, 'l');
    // kızarmış kuş: altın kahve gövde, yukarı kalkık iki but, beyaz kemik uçları
    const leg = (x: number, y: number, deg: number) => {
      const p = pen(g, { deg, cx: x, cy: y });
      p.ellipse(x, y, 2.6, 4.4, 'Y');
      p.ellipse(x - 0.6, y - 0.8, 1.3, 2.6, 'q');
      p.stroke(x, y - 4, x, y - 7.4, 'e', 1.3);
      p.disc(x - 0.8, y - 7.8, 0.95, 'e');
      p.disc(x + 0.8, y - 7.8, 0.95, 'e');
    };
    leg(13.6, 15.6, -22);
    g.ellipse(13.4, 20.4, 9.4, 5.4, 'Y');
    g.ellipse(12, 18.6, 6.4, 2.6, 'q');
    g.ellipse(10.4, 18, 2.6, 1, 'n');
    g.disc(8.2, 20.8, 0.55, 'b');
    g.disc(14.8, 22, 0.55, 'b');
    g.disc(18.4, 20, 0.55, 'b');
    leg(18.2, 16, 12);
    // üzüm + yaprak
    for (const [x, y] of [
      [4.6, 25.4],
      [6.4, 26.6],
      [3.6, 27.2],
      [5.4, 28.4],
      [7.6, 28.6],
    ] as Array<[number, number]>)
      g.disc(x, y, 1.2, 'p');
    g.disc(4.2, 25, 0.4, 'w');
    herb(g, 22, 26.6, 27.6, 24.6, 1.4);
  },

  // ---------------------------------------------------------------- silah aileleri

  /** Axes & Swords: sakallı balta (çelik ağız, meşe sap, sargılı kabza; nadirlik: yuva bileziği). */
  axe: (g) => {
    const p = pen(g, { deg: 40, s: 0.88, tx: 1, ty: 2.5 });
    p.stroke(16, 5, 16, 30.5, 'b', 2.4);
    for (let y = 23.5; y <= 29.5; y += 1.5) p.line(14.8, y, 17.2, y + 0.6, 'k', 0.5);
    p.disc(16, 30.6, 1.4, 'm');
    // ağız
    p.poly([16, 5, 13.5, 4.2, 9, 3.4, 5, 2.4, 3.4, 6, 3.4, 11, 5, 15.6, 8, 18.2, 9.6, 14.6, 12, 11.2, 16, 10.6], 'm');
    p.poly([16, 5, 13.5, 4.2, 9, 3.4, 5, 2.4, 3.4, 6, 3.6, 8.5, 9, 7.6, 16, 7.6], 'l');
    p.line(4.4, 3.6, 3.9, 10, 'w', 0.55);
    p.line(3.9, 10, 5.6, 15, 'w', 0.55);
    // yuva + topuz
    p.poly([14.2, 3.6, 19, 4.8, 19, 10.6, 14.2, 11.6], 'd');
    p.rect(14, 11.6, 4, 1.2, 'a');
    p.disc(16.8, 7.4, 0.6, 'l');
  },

  /** Arming sword: dolu oluklu çelik namlu, çapraz siper, deri kabza, mücevherli topuz (nadirlik rengi). */
  sword: (g) => {
    const p = pen(g, { deg: 45, s: 0.92, tx: 0.5, ty: 0.5 });
    p.blade(16, 22.5, 16, 1.4, 3.6, 'l', 'm', 'w');
    p.stroke(9.5, 22.8, 22.5, 22.8, 'm', 1.9);
    p.disc(16, 22.8, 1.1, 'a');
    p.line(16, 24, 16, 28.4, 'k', 2.1);
    for (let y = 24.6; y <= 28; y += 1.1) p.line(15, y, 17, y + 0.5, 'b', 0.45);
    p.disc(16, 30, 2.1, 'y');
    p.disc(16, 30, 1.2, 'a');
  },

  /** Maces & Shields: kanatlı gürz (demir baş, çelik kanatlar, tepe çivisi; nadirlik: boyun bileziği). */
  mace: (g) => {
    const p = pen(g, { deg: 40, s: 0.9, tx: 1, ty: 1.5 });
    p.stroke(16, 12, 16, 30.5, 'b', 2.3);
    for (let y = 23.5; y <= 29.5; y += 1.5) p.line(14.8, y, 17.2, y + 0.6, 'k', 0.5);
    p.disc(16, 30.8, 1.6, 'm');
    // baş
    p.poly([15, 3.2, 17, 3.2, 16, 0.4], 'l');
    p.ellipse(16, 8, 4.2, 5.2, 'd');
    p.poly([12.6, 3.6, 8.8, 5.2, 8.2, 9.2, 9.4, 12.2, 12.6, 12.8], 'l');
    p.poly([19.4, 3.6, 23.2, 5.2, 23.8, 9.2, 22.6, 12.2, 19.4, 12.8], 'm');
    p.poly([14.6, 2.8, 17.4, 2.8, 17.4, 13.2, 14.6, 13.2], 'l');
    p.line(15.4, 3.6, 15.4, 12.4, 'w', 0.5);
    p.rect(13.8, 13.2, 4.4, 1.4, 'a');
  },

  /** Oak shield: çelik kenarlı, tahta kaplamalı meşe kalkan; ortada demir umbo, nadirlik renkli boya şeridi. */
  shield: (g) => {
    const top = 2.4;
    const outer = [4, top, 28, top, 28, 15, 16, 30.2, 4, 15];
    const inner = [6, top + 2, 26, top + 2, 26, 14.4, 16, 27.6, 6, 14.4];
    g.poly(outer, 'm');
    g.poly(inner, 'b');
    // tahta aralıkları
    for (const x of [10, 14, 18, 22]) paintIf(g, 'k', (px, py) => Math.abs(px - x) < 0.25 && py > top + 2, 'b');
    // boya şeridi (çapraz bant)
    paintIf(g, 'a', (px, py) => Math.abs(py - px * 0.9 - 1) < 2, 'bk');
    // umbo + perçinler
    g.disc(16, 13.6, 3.6, 'd');
    g.disc(16, 13.6, 2.6, 'l');
    g.disc(15.2, 12.8, 0.8, 'w');
    for (const [x, y] of [
      [7.4, 6],
      [24.6, 6],
      [7.6, 13.6],
      [24.4, 13.6],
      [16, 25],
    ] as Array<[number, number]>)
      g.disc(x, y, 0.65, 'l');
  },

  /** Bows: porsuk uzun yay (deri kabza, nadirlik şeridi) ve kirişe takılı tüylü ok. */
  bow: (g) => {
    const cx = 28.6;
    const cy = 28.6;
    const r = 22;
    const a0 = Math.PI * 1.06;
    const a1 = Math.PI * 1.44;
    const end = (a: number): [number, number] => [cx + Math.cos(a) * r - 0.6, cy + Math.sin(a) * r - 0.6];
    const [x0, y0] = end(a0);
    const [x1, y1] = end(a1);
    // kiriş
    g.line(x0, y0, x1, y1, 'e', 0.5);
    // yay gövdesi
    g.ring(cx, cy, r + 1, 'b', 3, a0, a1);
    g.ring(cx, cy, r + 1, 'k', 0.8, a0, a1);
    // uç kertikleri
    g.disc(x0, y0, 1, 'k');
    g.disc(x1, y1, 1, 'k');
    // kabza: deri sargı, iki yanında nadirlik renkli bilezik
    const gm = Math.PI * 1.25;
    g.ring(cx, cy, r + 1.6, 'k', 4.2, gm - 0.08, gm + 0.08);
    g.ring(cx, cy, r + 1.6, 'a', 4.2, gm - 0.108, gm - 0.08);
    g.ring(cx, cy, r + 1.6, 'a', 4.2, gm + 0.08, gm + 0.108);
    // ok
    g.line(24.6, 24.6, 8.2, 8.2, 'b', 0.9);
    g.poly([5.4, 5.4, 10.4, 7.6, 7.6, 10.4], 'l');
    g.line(6.8, 6.8, 8.6, 8, 'w', 0.4);
    g.poly([21.4, 22.6, 25, 21.4, 27.4, 23.8, 23.8, 25], 'r');
    g.poly([22.6, 21.4, 21.4, 25, 23.8, 27.4, 25, 23.8], 'w');
  },

  /** Daggers: rondel hançer (iki yuvarlak siper, ince namlu; nadirlik: rondellerin göbeği). */
  dagger: (g) => {
    const p = pen(g, { deg: 45, s: 0.95, tx: 0.5, ty: 0.5 });
    p.blade(16, 19.5, 16, 2.4, 3, 'l', 'm', 'w');
    p.disc(16, 20, 2.8, 'm');
    p.disc(16, 20, 1.3, 'a');
    p.line(16, 21.5, 16, 26.6, 'k', 2);
    for (let y = 22; y <= 26; y += 1.1) p.line(15.1, y, 16.9, y + 0.5, 'b', 0.45);
    p.disc(16, 28.2, 2.8, 'm');
    p.disc(16, 28.2, 1.3, 'a');
  },

  /** Staves: budaklı meşe asa; tepede kökler gibi kıvrılan pençeler bir kristal küreyi tutar (küre nadirlik renginde). */
  staff: (g) => {
    const p = pen(g, { deg: 32, s: 0.95, tx: 0.5, ty: 1 });
    p.stroke(16, 10, 16, 31, 'b', 2.2);
    p.disc(15, 16, 0.7, 'k');
    p.disc(17, 25, 0.7, 'k');
    p.line(15, 19, 17, 19.6, 'Y', 0.7);
    p.line(15, 20.4, 17, 21, 'Y', 0.7);
    p.disc(16, 5.4, 4.8, 'A');
    p.disc(15.7, 5.1, 4.2, 'a');
    p.disc(14.4, 3.8, 1.8, 'z');
    p.disc(13.9, 3.3, 0.8, 'w');
    p.stroke(16, 11.4, 11.6, 8.4, 'b', 1.9);
    p.stroke(11.6, 8.4, 11.2, 3.6, 'b', 1.6);
    p.stroke(16, 11.4, 20.4, 8.6, 'b', 1.9);
    p.stroke(20.4, 8.6, 20.8, 3.6, 'b', 1.6);
    p.stroke(16, 11.6, 16, 10, 'b', 2);
  },

  /** Charms: eski bir fal kartı (kenarı nadirlik renginde) ve önünde iki kemik zar. */
  charms: (g) => {
    const card = pen(g, { deg: -14, cx: 12, cy: 13 });
    card.rect(5, 2.5, 13, 19, 'e');
    card.rect(6.6, 4.1, 9.8, 15.8, 'a');
    card.rect(7.6, 5.1, 7.8, 13.8, 'e');
    card.poly([11.5, 7.6, 14, 12, 11.5, 16.4, 9, 12], 'R');
    card.disc(11.5, 12, 0.8, 'y');
    // zarlar
    const d1 = pen(g, { deg: 14, cx: 22, cy: 23 });
    d1.rect(17.6, 18.6, 8.8, 8.8, 'e');
    for (const [x, y] of [
      [19.8, 20.8],
      [24.2, 20.8],
      [22, 23],
      [19.8, 25.2],
      [24.2, 25.2],
    ] as Array<[number, number]>)
      d1.disc(x, y, 0.85, 'k');
    const d2 = pen(g, { deg: -10, cx: 10, cy: 26 });
    d2.rect(6.6, 22.6, 6.8, 6.8, 'e');
    for (const [x, y] of [
      [8.4, 24.4],
      [10, 26],
      [11.6, 27.6],
    ] as Array<[number, number]>)
      d2.disc(x, y, 0.75, 'k');
  },

  // ---------------------------------------------------------------- zırh / takı

  /** Helm: burun siperli demir miğfer, perçinli alın bandı (kenar çizgileri nadirlik renginde), altta zincir boyunluk. */
  helm: (g) => {
    // zincir boyunluk
    g.poly([5, 18, 27, 18, 28, 27, 24, 30.5, 8, 30.5, 4, 27], 'd');
    mail(g, 'd', 'm', 'o');
    // kubbe
    paintIf(g, 'm', (x, y) => ((x - 16) / 11) ** 2 + ((y - 18) / 15) ** 2 <= 1 && y <= 19);
    g.line(16, 3.6, 16, 17, 'l', 1.2);
    // alın bandı
    g.rect(4.8, 16.6, 22.4, 3.4, 'd');
    g.rect(4.8, 16.6, 22.4, 0.7, 'a');
    g.rect(4.8, 19.4, 22.4, 0.6, 'a');
    for (const x of [7.2, 10.4, 21.6, 24.8]) g.disc(x, 18.3, 0.65, 'l');
    // yüz açıklığı + burun siperi
    g.poly([8.2, 20, 23.8, 20, 22.8, 26.6, 18, 27.6, 14, 27.6, 9.2, 26.6], 'o');
    g.rect(14.8, 16.6, 2.4, 11, 'm');
    g.line(15.4, 20, 15.4, 27, 'l', 0.5);
  },

  /** Armor: zincir gömlek (kısa kollu hauberk), deri kemer + pirinç toka; etek ve kol ağızlarında nadirlik renkli kenar. */
  mail: (g) => {
    g.poly([6, 6, 12, 3.6, 20, 3.6, 26, 6, 30.6, 15, 26.4, 17, 24, 12, 24, 29, 8, 29, 8, 12, 5.6, 17, 1.4, 15], 'm');
    paintIf(g, '.', (x, y) => ((x - 16) / 3.6) ** 2 + ((y - 3.4) / 2.6) ** 2 <= 1);
    mail(g, 'm', 'l', 'd');
    // kenarlar
    g.poly([8, 27.2, 24, 27.2, 24, 29, 8, 29], 'a');
    g.poly([26.4, 17, 30.6, 15, 29.9, 13.6, 25.8, 15.6], 'a');
    g.poly([5.6, 17, 1.4, 15, 2.1, 13.6, 6.2, 15.6], 'a');
    // kemer
    g.rect(8, 19.4, 16, 2.2, 'k');
    g.rect(14.6, 19, 2.8, 3, 'y');
    g.rect(15.4, 19.8, 1.2, 1.4, 'k');
    g.line(17.4, 21.6, 18.6, 25, 'k', 0.9);
  },

  /** Gloves: bir çift deri eldiven (arkadaki koyu); manşette nadirlik şeridi. */
  gloves: (g) => {
    glove(pen(g, { s: 0.8, tx: 5.2, ty: -1.6, flip: true }), 'k', 'o');
    glove(pen(g, { s: 0.86, tx: -3.2, ty: 2 }), 'b', 'k');
  },

  /** Boots: kıvrık konçlu deri çizme, tokalı kayış (nadirlik rengi), kalın taban ve topuk. */
  boots: (g) => {
    g.poly([10.6, 6, 20.4, 6, 20.4, 18.6, 27.6, 20.6, 30.4, 24, 30.4, 27.6, 10, 27.6, 9.4, 18], 'b');
    g.poly([20.4, 18.6, 27.6, 20.6, 30.4, 24, 21, 23.4], 'k');
    // kıvrık konç
    g.poly([9, 2.4, 22, 2.4, 21.4, 7.6, 9.6, 7.6], 'n');
    g.line(9.4, 7.6, 21.6, 7.6, 'k', 0.6);
    // kayış + toka
    g.rect(9.6, 14.4, 11, 2.4, 'a');
    g.rect(16.4, 13.8, 2.8, 3.6, 'y');
    g.rect(17.2, 14.6, 1.2, 2, 'k');
    // taban + topuk
    g.rect(9.6, 27.2, 21, 2.2, 'k');
    g.rect(9.6, 27.2, 5.4, 3.2, 'k');
    // dikiş
    g.line(12.4, 9.4, 12, 25.6, 'k', 0.4);
  },

  /** Trinket: altın zincirli muska; kakmalı yuvada nadirlik renginde taş. */
  amulet: (g) => {
    // zincir (küçük halkalar)
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      for (const [ax, ay] of [
        [4.6, 2.4],
        [27.4, 2.4],
      ] as Array<[number, number]>) {
        const x = ax + (16 - ax) * t;
        const y = ay + (12.8 - ay) * t;
        g.ring(x, y, 1.15, i % 2 ? 'Y' : 'y', 0.6);
      }
    }
    // askı halkası
    g.ring(16, 13, 1.6, 'y', 0.8);
    // yuva + taş
    g.disc(16, 21.4, 7.6, 'y');
    g.ring(16, 21.4, 6.2, 'Y', 0.7);
    for (const [x, y] of [
      [11, 16.4],
      [21, 16.4],
      [11, 26.4],
      [21, 26.4],
    ] as Array<[number, number]>)
      g.disc(x, y, 1.2, 'y');
    g.disc(16, 21.4, 4.6, 'A');
    g.disc(15.8, 21.1, 3.9, 'a');
    g.disc(14.8, 19.9, 1.6, 'z');
    g.disc(14.4, 19.5, 0.7, 'w');
  },

  /** Ring: bakır yüzük, taç yuvalı taşı nadirlik renginde. */
  ring: (g) => {
    g.ellipse(16, 21, 10.4, 7.4, 'f');
    g.ellipse(16, 21.6, 7.2, 4.6, '.');
    paintIf(g, 'Y', (x, y) => ((x - 16) / 10.4) ** 2 + ((y - 21) / 7.4) ** 2 <= 1 && ((x - 16) / 8.6) ** 2 + ((y - 19.6) / 6.6) ** 2 > 1 && y > 21, 'f');
    // taç yuva
    g.poly([11.2, 15.6, 20.8, 15.6, 19.4, 11, 12.6, 11], 'Y');
    g.poly([11.4, 11.6, 12.6, 7, 14, 10.6, 16, 6.4, 18, 10.6, 19.4, 7, 20.6, 11.6], 'y');
    g.disc(16, 9.6, 3.4, 'A');
    g.disc(15.8, 9.3, 2.8, 'a');
    g.disc(14.9, 8.4, 0.9, 'w');
    g.line(9, 18, 11, 16.6, 'w', 0.5);
  },
};

/** Yuva -> varsayılan ikon. */
export const SLOT_ICON: Readonly<Record<string, string>> = { weapon: 'axe', helm: 'helm', armor: 'mail', gloves: 'gloves', boots: 'boots', trinket: 'amulet' };

/** Silah ailesi (data/items.json > weaponFamilies) -> ikon. */
export const FAMILY_ICON: Readonly<Record<string, string>> = { axes: 'axe', maces: 'mace', bows: 'bow', daggers: 'dagger', staves: 'staff', charms: 'charms' };

/** Ödül kartı türü -> ikon. */
export const REWARD_ICON = { gold: 'gold', heal: 'draught', feast: 'feast' } as const;

/** Codex için insan okunur adlar. */
export const ITEM_ICON_LABEL: Readonly<Record<string, string>> = {
  gold: 'Gold reward (coin purse)',
  draught: 'Rest / heal reward (healing draught)',
  feast: "Hero's Feast reward",
  axe: 'Weapon: Axes & Swords',
  sword: 'Weapon: sword (item icon)',
  mace: 'Weapon: Maces & Shields',
  shield: 'Weapon: shield (item icon)',
  bow: 'Weapon: Bows',
  dagger: 'Weapon: Daggers',
  staff: 'Weapon: Staves',
  charms: 'Weapon: Charms',
  helm: 'Helm',
  mail: 'Armor',
  gloves: 'Gloves',
  boots: 'Boots',
  amulet: 'Trinket',
  ring: 'Trinket: ring (item icon)',
};

export const ITEM_ICON_NAMES: readonly string[] = Object.keys(ITEM_ICONS);

/** Bir item'in ikon adı: `icon` alanı > silah ailesi > yuva. Bilinmeyen yuva -> 'amulet'. */
export function itemIconName(d: { slot: string; family?: string; icon?: string } | undefined | null, slot?: string): string {
  if (d?.icon && ITEM_ICONS[d.icon]) return d.icon;
  if (d?.slot === 'weapon' && d.family && FAMILY_ICON[d.family]) return FAMILY_ICON[d.family]!;
  return SLOT_ICON[d?.slot ?? slot ?? ''] ?? 'amulet';
}

// ------------------------------------------------------------------------------------------------- üretim

const cellCache = new Map<string, Cell[][]>();

/** İkonun ızgarası (kontur dahil); bilinmeyen ad için null. */
export function itemIconGrid(name: string): PxGrid | null {
  const draw = ITEM_ICONS[name];
  if (!draw) return null;
  const g = new PxGrid(ITEM_ICON_SIZE);
  draw(g);
  g.outline();
  return g;
}

/** Işık seviyeli hücreler (önbellekli). */
export function itemIconCells(name: string): Cell[][] | null {
  const hit = cellCache.get(name);
  if (hit) return hit;
  const g = itemIconGrid(name);
  if (!g) return null;
  const cells = g.lit();
  cellCache.set(name, cells);
  return cells;
}

/** Vurgu (nadirlik) rengi verilmezse kullanılan renk (ödül ikonları vurgu kullanmaz). */
export const ITEM_ICON_DEFAULT_ACCENT = '#c9a45c';

/**
 * İkonu bir 2D canvas bağlamına 1:1 piksel olarak çizer (ITEM_ICON_SIZE x ITEM_ICON_SIZE). `accent` = nadirlik rengi ('a' jetonları).
 * Phaser dokusu ve DOM resmi bunu kullanır: tüm ekranlar aynı çizimi gösterir.
 */
export function paintItemIcon(ctx: CanvasRenderingContext2D, name: string, accent = ITEM_ICON_DEFAULT_ACCENT, ox = 0, oy = 0): boolean {
  const cells = itemIconCells(name);
  if (!cells) return false;
  const pal = INTERNAL_TOKEN_VALUES(accent);
  cells.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c.t === '.') return;
      const v = pal[c.t];
      ctx.fillStyle = v === undefined ? '#ff00ff' : `#${shadeColor(v, c.s).toString(16).padStart(6, '0')}`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }),
  );
  return true;
}
