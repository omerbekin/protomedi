/**
 * Paladin - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/paladin/idle.png): kapalı büyük miğfer (great helm), pirinç kenarlı çelik levha zırh, kızıl
 * tabar üstünde KREM HAÇ (uçları genişleyen haç), kızıl kite kalkan (krem haç, çelik kenar, pirinç perçin), sapı deri sarılı,
 * yüzünde haç işlemeli blok başlı SAVAŞ ÇEKİCİ. v2 ikonları bu hanedan dilini (kızıl + krem haç + pirinç) ve kutsal ışığı kullanır.
 * 128x128 (0..32 mantıksal; 0,25 = 1 ince piksel); ana hatlar en az 2 ince piksel.
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): holy, divine, judgehammer, ankh, judgebeam, radiance
 *   holy (logo) ............. Paladin'in kızıl kite kalkanı: krem haç, çelik kenar, pirinç perçinler
 *   divine (Divine Light) ... yukarıdan inen ışık huzmesi, altında yeşil şifa artısı (tur başında en yaralı dosta şifa)
 *   judgehammer (Holy Strike) Paladin'in çekici: haç işlemeli blok baş, arkasında kutsal ışık patlaması
 *   ankh (Resurrection) ..... altın kanatlı kızıl kalp, üstünde krem haç ve hale (ölüyü geri getirir)
 *   judgebeam (Judgment) .... gökten inen huzme + altında kutsal ateşten haç (artı biçimli alan = haç)
 *   radiance (Radiance) ..... haçlı güneş: uzun-kısa ışınlar, ortada beyaz çekirdek ve krem haç (herkese: dosta şifa, düşmana hasar)
 *
 * SPRITES: v2 efektlerinin (vfx.ts) ek çizimleri (k.v2Sprite(c, 'ad', renk, x, y, boyut)).
 */
import type { V2SpriteEntry } from '../types';
import { flame, type PxGrid } from '../../pixel-art';

/** Paladin haçı (uçları genişleyen, tabardaki gibi): merkez (cx,cy), kol uzunluğu r, kol kalınlığı w. */
function paladinCross(g: PxGrid, cx: number, cy: number, r: number, w: number, t: string, down = 1.25): void {
  const flare = w * 0.55;
  // dikey kol (alt kol biraz uzun)
  g.poly([cx - w / 2, cy - r + flare, cx - w / 2 - flare, cy - r, cx + w / 2 + flare, cy - r, cx + w / 2, cy - r + flare, cx + w / 2, cy + r * down - flare, cx + w / 2 + flare, cy + r * down, cx - w / 2 - flare, cy + r * down, cx - w / 2, cy + r * down - flare], t);
  // yatay kol
  g.poly([cx - r + flare, cy - w / 2, cx - r, cy - w / 2 - flare, cx - r, cy + w / 2 + flare, cx - r + flare, cy + w / 2, cx + r - flare, cy + w / 2, cx + r, cy + w / 2 + flare, cx + r, cy - w / 2 - flare, cx + r - flare, cy - w / 2], t);
}

/** Işın yıldızı (güneş): n ışın, uzun/kısa sırayla. */
function rays(g: PxGrid, cx: number, cy: number, rLong: number, rShort: number, n: number, w: number, tLong: string, tShort: string, rot = 0): void {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? rShort : rLong;
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    g.poly([cx + nx, cy + ny, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx - nx, cy - ny], i % 2 ? tShort : tLong);
  }
}

/** Paladin'in savaş çekici: sap ucu (px,py) -> baş merkezi (hx,hy). Blok çelik baş, pirinç bantlar, yüzde krem haç. */
export function warhammer(g: PxGrid, px: number, py: number, hx: number, hy: number, headW = 9, headH = 6.5): void {
  const len = Math.hypot(hx - px, hy - py) || 1;
  const dx = (hx - px) / len;
  const dy = (hy - py) / len;
  const nx = -dy;
  const ny = dx;
  // sap: koyu ahşap + deri sarım
  g.line(px, py, hx - dx * 1, hy - dy * 1, 'k', 2.4);
  g.line(px + nx * 0.4, py + ny * 0.4, hx - dx * 1 + nx * 0.4, hy - dy * 1 + ny * 0.4, 'b', 1);
  for (let s = 1; s < 6; s += 1.2) g.line(px + dx * s - nx, py + dy * s - ny, px + dx * (s + 0.5) + nx, py + dy * (s + 0.5) + ny, 'k', 0.45);
  g.disc(px, py, 1.1, 'Y');
  // baş: sapa dik uzanan blok
  const hw = headW / 2;
  const hh = headH / 2;
  const P = (a: number, b: number) => [hx + nx * a + dx * b, hy + ny * a + dy * b];
  g.poly([...P(-hw, -hh), ...P(hw, -hh), ...P(hw, hh), ...P(-hw, hh)], 'd');
  g.poly([...P(-hw, -hh), ...P(hw, -hh), ...P(hw, hh * 0.1), ...P(-hw, hh * 0.1)], 'm');
  // pirinç bantlar (iki uçta)
  for (const s of [-hw + 1, hw - 1]) {
    const [a0, b0] = P(s, -hh);
    const [a1, b1] = P(s, hh);
    g.line(a0!, b0!, a1!, b1!, 'Y', 1.3);
  }
  // yüzde küçük krem haç
  const [cx, cy] = P(0, 0);
  g.line(cx! - nx * 2, cy! - ny * 2, cx! + nx * 2, cy! + ny * 2, 'e', 1.1);
  g.line(cx! - dx * 2, cy! - dy * 2, cx! + dx * 2, cy! + dy * 2, 'e', 1.1);
}

export const ICONS: Record<string, V2SpriteEntry> = {
  // Logo: kızıl kite kalkan + krem haç
  holy: (g) => {
    const kite = (inset: number) => [16, 2.5 + inset, 27.5 - inset, 5.5 + inset * 0.6, 26.5 - inset, 17, 16, 30 - inset * 1.4, 5.5 + inset, 17, 4.5 + inset, 5.5 + inset * 0.6];
    g.poly(kite(0), 'd');
    g.poly(kite(1.3), 'm');
    g.poly(kite(2.4), 'R');
    g.poly([16, 3.9, 25.1, 6.4, 24.4, 16.6, 16, 27.4], 'r');
    paladinCross(g, 16, 13.5, 7.2, 2.8, 'e', 1.3);
    for (const [x, y] of [[16, 4.2], [25.3, 7], [24.7, 15.5], [7.3, 15.5], [6.7, 7], [19.5, 24.5], [12.5, 24.5]] as Array<[number, number]>) g.disc(x, y, 0.6, 'y');
    g.line(7.5, 8, 9.5, 6.5, 'z', 0.5);
  },

  // Divine Light: yukarıdan inen yumuşak huzme (dama geçişli) + altında yeşil şifa artısı + parıltılar
  divine: (g) => {
    // tepeden yelpaze gibi açılan ışık şeritleri (dama ile yumuşak), altta parlayan şifa artısı
    for (const [x1, w, t] of [[3, 2.2, 'Y'], [9, 2.6, 'y'], [16, 3.4, 'z'], [23, 2.6, 'y'], [29, 2.2, 'Y']] as Array<[number, number, string]>) {
      g.poly([16 - 0.6, 0, 16 + 0.6, 0, x1 + w, 24, x1 - w, 24], t);
    }
    g.disc(16, 1.5, 2.6, 'w');
    g.ellipse(16, 24, 7, 2.6, 'z');
    // şifa artısı
    g.rect(13, 16.5, 6, 14, 'G').rect(9, 20.5, 14, 6, 'G');
    g.rect(13.8, 17.3, 4.4, 12.4, 'g').rect(9.8, 21.3, 12.4, 4.4, 'g');
    g.line(14.5, 18, 14.5, 21.5, 'w', 0.5);
    g.disc(4, 6, 0.8, 'w').disc(28, 9, 0.8, 'w');
  },

  // Holy Strike: arkada kutsal ışık patlaması, önde haç işlemeli çekiç (baş sol üstte, inen darbe)
  judgehammer: (g) => {
    rays(g, 11, 11, 11, 6.5, 8, 1.4, 'y', 'Y', 0.2);
    g.disc(11, 11, 4.5, 'z');
    g.disc(11, 11, 2.8, 'w');
    warhammer(g, 27.5, 28.5, 11.5, 11.5, 14, 10);
  },

  // Resurrection: altın kanatlı kızıl kalp + krem haç + üstte hale
  ankh: (g) => {
    // kanatlar (aynalı): üç tüy katmanı
    for (const sgn of [-1, 1]) {
      const X = (x: number) => 16 + sgn * x;
      g.poly([X(4), 13, X(15.5), 7, X(14.5), 11, X(16), 12.5, X(13.5), 15, X(14.5), 17.5, X(11), 18.5, X(11.5), 21, X(5), 20], 'Y');
      g.poly([X(4), 13.5, X(14), 8.5, X(13), 11.5, X(14.2), 13, X(12), 15, X(12.6), 17, X(5), 18.5], 'y');
      g.line(X(6), 14.5, X(12), 10.5, 'z', 0.5);
    }
    // kalp
    g.disc(12.6, 15, 4.3, 'R').disc(19.4, 15, 4.3, 'R');
    g.poly([8.4, 16, 23.6, 16, 16, 26], 'R');
    g.disc(12.6, 15, 3.4, 'r').disc(19.4, 15, 3.4, 'r');
    g.poly([9.3, 16, 22.7, 16, 16, 24.6], 'r');
    g.disc(11.2, 13.6, 1, 'z');
    paladinCross(g, 16, 17, 3.6, 1.5, 'e', 1.2);
    // hale
    g.ring(16, 4.5, 6, 'y', 1.2);
    g.ring(16, 4.5, 6, 'Y', 0.4);
  },

  // Judgment: gökten huzme, altında kutsal ateşten haç (alanın artı biçimi)
  judgebeam: (g) => {
    // yerde yassı haç (artı biçimli alan) kutsal ateşle yanar; gökten merkeze huzme iner
    const fy = 0.5; // zemin basıklığı
    const cy = 24;
    const cell = (x: number, y: number, t: string, k = 1) => g.poly([x - 4.2 * k, y, x, y - 4.2 * fy * k, x + 4.2 * k, y, x, y + 4.2 * fy * k], t);
    const cells: Array<[number, number]> = [[16, cy], [8, cy - 3.6], [24, cy + 3.6], [8, cy + 3.6], [24, cy - 3.6]];
    // artı: merkez + sol-arka, sağ-ön, sol-ön, sağ-arka (izometrik kollar)
    for (const [x, y] of cells) cell(x, y, 'Y', 1.05);
    for (const [x, y] of cells) cell(x, y, 'y', 0.8);
    // alevler: her hücreden yükselir
    const fl = (x: number, y: number, h: number, w: number) => {
      g.poly([x, y - h, x + w, y - h * 0.45, x + w * 0.8, y, x - w * 0.8, y, x - w, y - h * 0.45], 'f');
      g.poly([x, y - h * 0.72, x + w * 0.62, y - h * 0.32, x + w * 0.5, y, x - w * 0.5, y, x - w * 0.62, y - h * 0.32], 'y');
      g.poly([x, y - h * 0.4, x + w * 0.3, y - h * 0.15, x, y, x - w * 0.3, y - h * 0.15], 'w');
    };
    fl(8, cy - 3.6, 7, 2.6);
    fl(24, cy - 3.6, 7, 2.6);
    fl(8, cy + 3.6, 8, 2.9);
    fl(24, cy + 3.6, 8, 2.9);
    // huzme merkeze
    g.poly([13.6, 0, 18.4, 0, 19.2, 23, 12.8, 23], 'Y');
    g.poly([14.6, 0, 17.4, 0, 17.9, 23, 14.1, 23], 'y');
    g.poly([15.4, 0, 16.6, 0, 16.8, 23, 15.2, 23], 'w');
    g.ellipse(16, cy, 5.5, 2.4, 'w');
    paladinCross(g, 16, 8, 3.2, 1.4, 'e', 1.1);
  },

  // Radiance: haçlı güneş
  radiance: (g) => {
    rays(g, 16, 16, 15.5, 10, 8, 2.1, 'y', 'Y', -Math.PI / 2);
    g.disc(16, 16, 8.4, 'Y');
    g.disc(16, 16, 7.4, 'y');
    g.disc(16, 16, 5.6, 'z');
    paladinCross(g, 16, 15.5, 5, 2.2, 'w', 1.2);
  },
};

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Kutsal ışıktan çekiç (Holy Strike): yatay, sap solda (pivot), baş sağda. 256 kare, mantıksal 64. */
  lighthammer: {
    size: 256,
    logical: 64,
    draw: (g) => {
      // sap
      g.line(3, 32, 46, 32, 'Y', 5).line(3, 30.8, 46, 30.8, 'y', 1.8);
      g.disc(3, 32, 3.4, 'y');
      // blok baş (dikey)
      g.rect(44, 18, 15, 28, 'y');
      g.rect(45.5, 19.5, 12, 25, 'z');
      g.rect(44, 18, 15, 3.5, 'Y').rect(44, 42.5, 15, 3.5, 'Y');
      // yüzde haç
      g.rect(50, 24, 3, 16, 'w').rect(46.5, 30.5, 10, 3, 'w');
    },
  },
  /** Çarpmada parlayan büyük haç damgası (uçları genişleyen; ADD ile). */
  crossflare: {
    size: 192,
    logical: 48,
    outline: false,
    draw: (g) => {
      paladinCross(g, 24, 22, 20, 7.5, 'y', 1.1);
      paladinCross(g, 24, 22, 17, 4.6, 'z', 1.1);
      paladinCross(g, 24, 22, 13, 2, 'w', 1.1);
    },
  },
  /** Diriliş mührü: yere yatırılan halka + haç + rün çentikleri (yassı gösterilir). */
  sigil: {
    size: 256,
    logical: 64,
    outline: false,
    draw: (g) => {
      g.ring(32, 32, 30, 'y', 1.6);
      g.ring(32, 32, 25, 'Y', 0.8);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.line(32 + Math.cos(a) * 25.8, 32 + Math.sin(a) * 25.8, 32 + Math.cos(a) * 28.4, 32 + Math.sin(a) * 28.4, i % 2 ? 'Y' : 'z', 1);
      }
      paladinCross(g, 32, 32, 19, 5, 'y', 1);
      paladinCross(g, 32, 32, 16, 2.6, 'z', 1);
    },
  },
  /** Kutsal alev dili (Judgment): altın-beyaz, alt geniş. */
  holyflame: {
    size: 128,
    draw: (g) => {
      // yan diller + ana alev (pixel-art flame: dıştan içe üç renk)
      flame(g, 9.5, 30, 15, 4.5, 'Y', 'y', 'z');
      flame(g, 22.5, 30, 18, 4.8, 'Y', 'y', 'z');
      flame(g, 16, 31, 29, 8.5, 'Y', 'y', 'w');
    },
  },
  /** Güneş ışınları (Radiance): ince uzun ışınlar (ADD, döndürülür). */
  sunrays: {
    size: 256,
    logical: 64,
    outline: false,
    draw: (g) => {
      rays(g, 32, 32, 31, 20, 12, 1.6, 'y', 'z');
      g.disc(32, 32, 9, 'z');
      g.disc(32, 32, 6, 'w');
    },
  },
  /** Şifa artısı (yeşil-altın, yükselen). */
  healplus: {
    size: 64,
    draw: (g) => {
      g.rect(12, 5, 8, 22, 'G').rect(5, 12, 22, 8, 'G');
      g.rect(13.5, 6.5, 5, 19, 'g').rect(6.5, 13.5, 19, 5, 'g');
      g.rect(14.5, 8, 1.5, 6, 'w');
    },
  },
  /** Kutsal tüy (diriliş). */
  feather: {
    size: 64,
    draw: (g) => {
      g.poly([8, 28, 12, 15, 20, 5, 26, 3, 24, 10, 17, 21], 'w');
      g.poly([8, 28, 12, 15, 20, 5, 22, 6, 15, 18], 'e');
      g.line(8, 28, 23, 6, 'y', 0.6);
    },
  },
};
