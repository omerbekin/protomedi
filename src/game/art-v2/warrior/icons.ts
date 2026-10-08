/**
 * Warrior - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/warrior/idle.png): sakallı, başı açık savaşçı; çelik levha zırh + pirinç kenarlar, kızıl atkı ve
 * yırtık kızıl etek, iki elle tutulan UZUN KILIÇ (pirinç siper, deri kabza). v1'deki balta/boynuzlu miğfer yerine v2 bu kılıcı ve
 * kızıl-çelik paleti kullanır. 128x128 (0..32 mantıksal; 0,25 = 1 ince piksel); ana hatlar en az 2 ince piksel (36-60 px'te okunur).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): helm, rage, sword, whirlwind, charge, warcry, abyssalfury (durum rozeti)
 *   helm (logo) ............ çapraz iki uzun kılıç + kızıl yuvarlak arma
 *   rage (Berserker) ....... kılıcın içinden geçtiği kan damlası (can azaldıkça vuruş sertleşir)
 *   sword (Double Strike) .. uzun kılıç + arkasında çapraz iki kesik (X: iki vuruş)
 *   whirlwind .............. merkezden dönen kılıç (saat ibresi gibi) + arkasında dönen kesik yayları
 *   charge ................. öne eğik omuzluk (pauldron) + arkada savrulan kızıl atkı + önde çarpma yıldızı
 *   warcry (Abyssal Cry) ... sakallı savaşçı profilden kükrer; karanlık kızıl ses dalgaları
 *   abyssalfury (Abyssal Fury rozeti, madde 262) ... kızıl öfkeyle dolu, ucundan ileri kızıl iz uzanan kılıç + rün halkalı 3 kor (3 yük)
 *
 * SPRITES: v2 efektlerinin (vfx.ts) ek çizimleri (k.v2Sprite(c, 'ad', renk, x, y, boyut)).
 */
import type { V2SpriteEntry } from '../types';
import type { PxGrid } from '../../pixel-art';

// ---------------------------------------------------------------------------------------------------------------------
// Ortak parçalar

/** Uçlara doğru incelen yay bandı (kılıç kesiği / dönme izi). a0..a1 radyan; w orta kalınlık. */
function crescent(g: PxGrid, cx: number, cy: number, r: number, a0: number, a1: number, w: number, t: string, flat = 1): void {
  const n = 28;
  const out: number[] = [];
  const inn: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = a0 + (a1 - a0) * s;
    // kalınlık: başta ince, sonda (kesiğin ucu) kalın, en uçta sivri
    const th = w * Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 0.8;
    out.push(cx + Math.cos(a) * (r + th / 2), cy + Math.sin(a) * (r + th / 2) * flat);
    inn.unshift(cx + Math.cos(a) * (r - th / 2), cy + Math.sin(a) * (r - th / 2) * flat);
  }
  g.poly([...out, ...inn], t);
}

/**
 * Warrior'ın uzun kılıcı: kabza ucu (px,py) -> uç (tx,ty). Çelik ağız (açık/koyu yarı + oluk), pirinç siper, deri kabza, pirinç topuz.
 * `bw` ağız genişliği, `grip` kabza uzunluğu (mantıksal).
 */
export function greatsword(g: PxGrid, px: number, py: number, tx: number, ty: number, bw = 3.2, grip = 4.5): void {
  const len = Math.hypot(tx - px, ty - py) || 1;
  const dx = (tx - px) / len;
  const dy = (ty - py) / len;
  const nx = -dy;
  const ny = dx;
  const gx = px + dx * grip; // siper noktası
  const gy = py + dy * grip;
  // ağız: koyu alt yarı + açık üst yarı + sivri uç
  const h = bw / 2;
  const tipBack = bw * 1.4;
  const bx = tx - dx * tipBack;
  const by = ty - dy * tipBack;
  g.poly([gx + nx * h, gy + ny * h, bx + nx * h, by + ny * h, tx, ty, bx - nx * h, by - ny * h, gx - nx * h, gy - ny * h], 'm');
  g.poly([gx + nx * h, gy + ny * h, bx + nx * h, by + ny * h, tx, ty, gx, gy], 'l');
  g.line(gx + dx * 1.5, gy + dy * 1.5, bx - dx * 1.2, by - dy * 1.2, 'd', 0.5); // oluk
  g.line(gx + dx * 2 + nx * h * 0.55, gy + dy * 2 + ny * h * 0.55, bx - dx * 2 + nx * h * 0.55, by - dy * 2 + ny * h * 0.55, 'w', 0.5); // ağız parlaması
  // siper (pirinç, uçları hafif kıvrık)
  const cw = bw * 1.55;
  g.line(gx + nx * cw, gy + ny * cw, gx - nx * cw, gy - ny * cw, 'Y', 1.5);
  g.line(gx + nx * cw * 0.9, gy + ny * cw * 0.9 - 0.25, gx - nx * cw * 0.9, gy - ny * cw * 0.9 - 0.25, 'y', 0.5);
  g.disc(gx + nx * cw, gy + ny * cw, 0.9, 'Y').disc(gx - nx * cw, gy - ny * cw, 0.9, 'Y');
  // deri kabza (sarım çizgili)
  g.line(px + dx * 0.8, py + dy * 0.8, gx - dx * 0.6, gy - dy * 0.6, 'b', 1.5);
  for (let s = 1.4; s < grip - 0.6; s += 1.1) g.line(px + dx * s + nx * 0.6, py + dy * s + ny * 0.6, px + dx * (s + 0.4) - nx * 0.6, py + dy * (s + 0.4) - ny * 0.6, 'k', 0.4);
  // topuz
  g.disc(px, py, 1.3, 'Y').disc(px - 0.3, py - 0.3, 0.5, 'y');
}

/** Dört kollu parlama yıldızı (çarpma). */
function star(g: PxGrid, cx: number, cy: number, r: number, t: string, spikes = 8, inner = 0.42, rot = 0): void {
  const pts: number[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.poly(pts, t);
}

/** Damla (alt yuvarlak, üst sivri). */
function drop(g: PxGrid, cx: number, cy: number, r: number, t: string): void {
  g.disc(cx, cy, r, t);
  g.poly([cx - r * 0.92, cy - r * 0.35, cx, cy - r * 2.3, cx + r * 0.92, cy - r * 0.35], t);
}

/** Öfke koru: koyu kızıl rün halkası (4 çentikli) içinde parlayan kor (dış koyu kızıl, iç kızıl, sarı-beyaz çekirdek). */
function furyCore(g: PxGrid, cx: number, cy: number, r: number): void {
  g.ring(cx, cy, r, 'R', r * 0.2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    g.disc(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, r * 0.17, 'r');
  }
  g.disc(cx, cy, r * 0.62, 'R').disc(cx, cy, r * 0.48, 'r').disc(cx - r * 0.1, cy - r * 0.1, r * 0.26, 'y').disc(cx - r * 0.16, cy - r * 0.16, r * 0.11, 'w');
}

export const ICONS: Record<string, V2SpriteEntry> = {
  // Logo: çapraz iki uzun kılıç, ortada kızıl yuvarlak arma (atkı rengi) + pirinç kenar
  helm: (g) => {
    greatsword(g, 6, 27, 27, 5, 3, 4.5);
    greatsword(g, 26, 27, 5, 5, 3, 4.5);
    g.disc(16, 16.5, 5.6, 'Y').disc(16, 16.5, 4.6, 'R').disc(16, 16.5, 3.6, 'r');
    g.line(13.5, 14, 15.5, 13, 'z', 0.5);
    // arma ortasında küçük çelik çivi
    g.disc(16, 16.5, 1.2, 'l').disc(15.7, 16.2, 0.45, 'w');
  },

  // Berserker: kılıç tepeden kan damlasının içinden geçer; damladan iki küçük damla kopar
  rage: (g) => {
    drop(g, 15.5, 20.5, 8, 'R');
    drop(g, 15, 20.2, 6.6, 'r');
    g.disc(12.3, 19.5, 1.4, 'z').disc(11.8, 22.5, 0.6, 'z');
    greatsword(g, 16, 2, 16, 30.5, 3, 4.5);
    drop(g, 26, 26.5, 1.7, 'r');
    drop(g, 6.5, 28, 1.3, 'R');
  },

  // Double Strike: arkada çapraz iki beyaz kesik (iki vuruş), önde çapraz uzun kılıç
  sword: (g) => {
    // iki paralel kesik izi (sol üstten sağ alta, hafif kavisli): "iki vuruş"
    for (const o of [-2.8, 2.8]) {
      crescent(g, 34 + o, -4 - o, 31.5, 2.81, 1.88, 3.4, 'w');
      crescent(g, 34 + o, -4 - o, 31.5, 2.81, 1.88, 1.4, 'r');
    }
    greatsword(g, 5, 28, 28, 4, 3.6, 5);
  },

  // Whirlwind: kızıl göbekten dışa uzanan kılıç (ibre) + arkasında dönen kesik yayları + yerde toz
  whirlwind: (g) => {
    crescent(g, 16, 16.5, 12.5, -0.6, 2.2, 3.4, 'l');
    crescent(g, 16, 16.5, 12.5, -0.6, 2.2, 1.4, 'w');
    crescent(g, 16, 16.5, 12.5, 2.55, 5.0, 3.0, 'm');
    crescent(g, 16, 16.5, 12.5, 2.55, 5.0, 1.2, 'l');
    crescent(g, 16, 16.5, 7.5, 0.9, 3.6, 1.8, 'z');
    greatsword(g, 16.5, 16.5, 28.5, 4.8, 3.2, 3.2);
    g.disc(16.5, 16.5, 2.6, 'R').disc(16.5, 16.5, 1.7, 'r');
    g.disc(4, 28, 1.3, 'd').disc(7, 29.5, 0.9, 'm').disc(27.5, 28.5, 1.1, 'd');
  },

  // Charge: öne eğilmiş çelik omuzluk (pirinç kenar, perçin), arkada savrulan kızıl atkı, hız çizgileri, önde çarpma yıldızı
  charge: (g) => {
    // çarpma yıldızı (arka plan: önce çizilir)
    star(g, 25.5, 15, 7.2, 'y', 8, 0.42, 0.2);
    star(g, 25.5, 15, 4.4, 'w', 8, 0.45, 0.6);
    // kabzaya bağlı kızıl atkı arkaya savrulur
    g.poly([8, 17.5, 1, 12, 3.5, 16.5, 0.5, 20.5, 5, 20, 8, 19.5], 'R');
    g.poly([8, 17.8, 2.5, 13.5, 4.5, 16.8, 7.5, 18.6], 'r');
    // öne uzatılmış kılıç (hafif aşağı, ucu çarpmada)
    greatsword(g, 5, 16.5, 25, 15.5, 4.8, 5);
    // hız çizgileri
    g.line(1, 24, 12, 24, 'z', 1.1).line(4, 27.5, 15, 27.5, 'z', 1.1).line(2, 8.5, 11, 8.5, 'z', 1.1);
    // sersemletme yıldızı
    star(g, 26.5, 26, 3.6, 'y', 5, 0.45, -Math.PI / 2);
  },

  // Abyssal Cry: sakallı savaşçı profilden (sağa) kükrer; arkada kızıl-karanlık alev, önde üç ses dalgası
  warcry: (g) => {
    // karanlık aura
    g.poly([2, 30, 1.5, 21, 3.5, 15, 4.5, 19, 6, 10, 8, 15, 11, 7.5, 12, 14, 18, 30], 'R');
    g.poly([3.5, 30, 3.5, 24, 5, 21, 6.5, 24, 8, 19, 10, 25, 12, 30], 'r');
    // boyun + omuz (kızıl atkı)
    g.poly([4, 31, 6, 24, 13, 23, 17, 26, 17, 31], 'R');
    g.line(6, 25, 15, 24.5, 'r', 1.2);
    // kafa (profil, sağa bakar)
    g.ellipse(11, 13.5, 5.6, 6.6, 'n');
    g.poly([14.5, 10, 17.8, 13, 16.6, 13.6, 15.5, 13.2], 'n'); // burun
    // saç (koyu kahve, arkaya taranmış)
    g.poly([5.4, 14, 5.6, 8.5, 8.5, 6, 13, 6.2, 16, 8.5, 13, 8.4, 10.5, 10, 8.5, 13.5, 7.5, 16], 'k');
    // kaş + göz (öfkeli)
    g.line(12.5, 10.2, 15.5, 11.4, 'k', 1);
    g.rect(13.6, 11.5, 1, 0.8, 'o');
    // ağız: geniş açık
    g.poly([13.5, 15.6, 18.5, 14.8, 18, 19.8, 13.5, 18.5], 'o');
    g.poly([14.2, 16.3, 17.6, 15.6, 17.2, 18.8, 14.2, 18], 'R');
    g.line(14.4, 16, 17.6, 15.4, 'w', 0.5);
    // sakal
    g.poly([7.5, 16, 13.5, 18.8, 17, 19.6, 15, 22.6, 11, 23.4, 8, 21], 'k');
    g.poly([8.5, 17.4, 12, 19.4, 14, 21.6, 11, 22.4], 'b');
    g.ellipse(9.6, 14.6, 1.1, 1.4, 'n'); // kulak
    // ses dalgaları
    g.ring(18, 17, 4.5, 'r', 1.4, -0.9, 0.9);
    g.ring(18, 17, 8.5, 'r', 1.4, -0.85, 0.85);
    g.ring(18, 17, 12.5, 'R', 1.4, -0.8, 0.8);
  },

  // Abyssal Fury (durum rozeti): arkada kızıl-karanlık öfke alevi, öfkeyle dolu uzun kılıç (ağzında kızıl damarlar), ucundan ileri
  // uzanan kızıl iz (menzil +1) ve sol üstte rün halkalı 3 kor (3 saldırı yükü)
  abyssalfury: (g) => {
    // öfke alevi (arka)
    g.poly([6, 31, 4, 24, 6.5, 19, 7.5, 22.5, 10, 14, 11.5, 19.5, 15, 11.5, 16, 18, 19.5, 15, 19, 22, 24, 31], 'R');
    g.poly([8.5, 31, 8, 26, 10, 22.5, 11.5, 25.5, 14, 20, 15, 25, 17.5, 22.5, 18, 27, 21, 31], 'r');
    // kılıç ucundan ileri uzanan kızıl iz: incelen kama + kor kıvılcımları
    g.poly([20, 10, 31.5, 0.5, 22.5, 12.5], 'R');
    g.poly([21.5, 10.2, 30.5, 1.5, 22.6, 11.2], 'r');
    g.line(23, 9.5, 29.5, 2.5, 'f', 0.5);
    g.disc(27.5, 7.5, 0.7, 'f').disc(25, 3.5, 0.5, 'y');
    // öfke parıltısı + kılıç (kabza sol alt, uç sağ üst)
    g.line(8.5, 23.5, 23, 9, 'R', 5.5);
    greatsword(g, 3, 29, 23.5, 8.5, 3.4, 5);
    // ağızda kızıl öfke damarları
    g.line(10.5, 21.5, 14, 18, 'r', 0.75).line(14, 18, 15.5, 17.4, 'r', 0.5).line(15.5, 17.4, 19.5, 13, 'r', 0.75);
    g.disc(14, 18, 0.6, 'f').disc(19.5, 13, 0.6, 'f');
    // 3 kor (yük)
    furyCore(g, 4.8, 13, 3.4);
    furyCore(g, 7.2, 5.4, 3.4);
    furyCore(g, 14.6, 3.6, 3.4);
  },
};

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Uzun kılıç (yatay: topuz solda, uç sağda): efektlerde savrulan / dönen kılıç. 256x256, mantıksal 64. */
  blade: {
    size: 256,
    logical: 64,
    draw: (g) => greatsword(g, 4, 32, 61, 32, 5.2, 9),
  },
  /** Kesik izi (smear): yarım ay biçimli, uçlara incelen beyaz-krem yay. Merkez sprite merkezi; yay sağa bakar. */
  smear: {
    size: 192,
    logical: 48,
    outline: false,
    draw: (g) => {
      crescent(g, 16, 24, 20, -1.35, 1.35, 7, 'z');
      crescent(g, 17, 24, 20, -1.3, 1.3, 4.4, 'w');
    },
  },
  /** Çapraz yarık (Double Strike'ın hedefte kalan X izi). */
  gash: {
    size: 128,
    outline: false,
    draw: (g) => {
      g.line(5, 5, 27, 27, 'R', 3).line(27, 5, 5, 27, 'R', 3);
      g.line(5.5, 5.5, 26.5, 26.5, 'r', 1.6).line(26.5, 5.5, 5.5, 26.5, 'r', 1.6);
      g.line(7, 7, 25, 25, 'w', 0.5).line(25, 7, 7, 25, 'w', 0.5);
    },
  },
  /** Sersemletme yıldızı (Charge): beş köşeli sarı yıldız. */
  daze: {
    size: 96,
    draw: (g) => {
      star(g, 16, 16, 13, 'y', 5, 0.45, -Math.PI / 2);
      star(g, 16, 16.5, 8, 'z', 5, 0.45, -Math.PI / 2);
      g.disc(13, 12, 1.5, 'w');
    },
  },
  /** Çarpma yıldızı (Charge): sivri, düzensiz patlama. */
  impact: {
    size: 192,
    logical: 48,
    outline: false,
    draw: (g) => {
      star(g, 24, 24, 23, 'y', 9, 0.36, 0.1);
      star(g, 24, 24, 15, 'z', 9, 0.4, 0.4);
      star(g, 24, 24, 8, 'w', 7, 0.45, 0.1);
    },
  },
  /** Öfke yükü (Abyssal Cry): rün halkalı kızıl kor; savaşçının gövdesi çevresinde 3 tane belirir (3 saldırı yükü). */
  furycore: {
    size: 96,
    draw: (g) => furyCore(g, 16, 16, 7.5),
  },
};
