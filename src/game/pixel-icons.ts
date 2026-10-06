import { blade, flame, leafShape, orb, shieldShape, sparkle, type Draw, type PxGrid } from './pixel-art';

/**
 * Tüm piksel art ikonlar (32x32). Anahtar = veri dosyalarındaki ikon adı (skill.icon, class.logo, passive.icon, status.icon, stat ikonu).
 * Çizim araçları ve renk jetonları için bkz. pixel-art.ts. Koordinatlar 0..31; ışık/gölge ve kontur otomatik eklenir.
 */
const TAU = Math.PI * 2;
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

/**
 * Kutsal halo: dolu, damalı geçişli radyal parlama (beyaz çekirdek -> altın -> koyu altın -> koyu kahve; koyu zeminde yumuşak sönen bir ışık hâlesi gibi okunur).
 * Ham 64'lük pikselle çizilir (0,5 mantıksal birim), böylece geçişler ince damalı olur.
 */
export function holyHalo(g: PxGrid, cx: number, cy: number, r: number): void {
  const bands: Array<[number, string, string]> = [
    [0.3, 'w', 'w'],
    [0.42, 'w', 'y'],
    [0.56, 'y', 'y'],
    [0.66, 'y', 'Y'],
    [0.78, 'Y', 'Y'],
    [0.84, 'Y', 'k'],
    [0.93, 'k', 'o'],
    [1, 'o', 'o'],
  ];
  for (let py = 0; py < 64; py++)
    for (let px = 0; px < 64; px++) {
      const d = Math.hypot((px + 0.5) / 2 - cx, (py + 0.5) / 2 - cy) / r;
      if (d >= 1) continue;
      const i = bands.findIndex((b) => d < b[0]);
      const b = bands[i]!;
      g.rect(px / 2, py / 2, 0.5, 0.5, (px + py) % 2 === 0 ? b[1] : b[2]);
    }
}

/** Savaş çekici (kafa yukarıda, sap aşağıda). `outlined`: halo üstünde okunsun diye kendi koyu konturunu çizer (halo boşluk bırakmadığı için otomatik kontur yetmez). */
export function holyHammer(g: PxGrid, outlined = false): void {
  if (outlined) {
    const e = 0.5;
    const o = (x: number, y: number, w: number, h: number) => g.rect(x - e, y - e, w + e * 2, h + e * 2, 'o');
    o(14.5, 15, 3, 14);
    o(4.5, 7, 23, 9);
    g.disc(16, 29, 2.2, 'o');
  }
  g.rect(14.5, 15, 3, 14, 'b').rect(14.5, 15, 1, 14, 'n').rect(16.5, 15, 1, 14, 'k');
  g.line(14.5, 21, 17.5, 22.5, 'k').line(14.5, 25, 17.5, 26.5, 'k');
  g.rect(6, 7, 20, 9, 'm').rect(6, 7, 20, 2.5, 'l').rect(6, 14, 20, 2, 'd');
  g.rect(4.5, 8, 2, 7, 'd').rect(25.5, 8, 2, 7, 'd');
  g.rect(14, 7, 4, 9, 'y').rect(15, 8, 1.5, 7, 'w');
  g.disc(16, 11.5, 1.2, 'r');
  g.disc(16, 29, 1.5, 'y');
}

// ---------- GAMBLER: ortak çizim parçaları (zar, altın para, iskambil kartı, para yığını) ----------
type DieTones = { top: string; left: string; right: string; pip: string; edge?: string };
const BONE_DIE: DieTones = { top: 'w', left: 'e', right: 'n', pip: 'k' };
const GOLD_DIE: DieTones = { top: 'y', left: 'Y', right: 'b', pip: 'w' };

/** Eş eksenli (izometrik) zar: üst yüz 1, sol yüz 2, sağ yüz 3 nokta. `w` = yarı genişlik; (cx, cy) üst yüzün merkezi. */
export function isoDie(g: PxGrid, cx: number, cy: number, w: number, t: DieTones = BONE_DIE): void {
  const tv = w * 0.5;
  const h = w * 1.05;
  g.poly([cx - w, cy, cx, cy + tv, cx, cy + tv + h, cx - w, cy + h], t.left);
  g.poly([cx, cy + tv, cx + w, cy, cx + w, cy + h, cx, cy + tv + h], t.right);
  g.poly([cx, cy - tv, cx + w, cy, cx, cy + tv, cx - w, cy], t.top);
  // yüzler arası ince kenar çizgileri (kemik kenarı belli olsun)
  const e = t.edge ?? 'm';
  g.line(cx, cy + tv, cx, cy + tv + h, e, 0.5).line(cx - w, cy, cx, cy + tv, e, 0.5).line(cx, cy + tv, cx + w, cy, e, 0.5);
  const pr = Math.max(0.9, w * 0.13);
  // üst: 1 nokta (yassı elips)
  g.ellipse(cx, cy, pr * 1.5, pr * 0.8, t.pip);
  // sol: 2 nokta (köşegen)
  const lcx = cx - w / 2;
  const lcy = cy + tv / 2 + h / 2;
  for (const s of [-1, 1]) g.disc(lcx + s * w * 0.2, lcy + s * (h * 0.2 + tv * 0.2), pr, t.pip);
  // sağ: 3 nokta (köşegen)
  const rcx = cx + w / 2;
  const rcy = lcy;
  for (const s of [-1, 0, 1]) g.disc(rcx + s * w * 0.24, rcy + s * (h * 0.24 - tv * 0.24), pr, t.pip);
}

/** Önden altın para: kenar, iç halka, kabartma tacı, parıltı. */
export function goldCoin(g: PxGrid, cx: number, cy: number, r: number): void {
  g.disc(cx, cy, r, 'Y').disc(cx - r * 0.06, cy - r * 0.06, r - 1, 'y');
  g.ring(cx, cy, r * 0.68, 'Y', Math.max(0.8, r * 0.1));
  const k = r * 0.3;
  g.poly([cx - k, cy + k * 0.7, cx - k, cy - k * 0.6, cx - k * 0.5, cy, cx, cy - k, cx + k * 0.5, cy, cx + k, cy - k * 0.6, cx + k, cy + k * 0.7], 'Y');
  g.ring(cx, cy, r - 0.5, 'w', 1, 3.5, 4.7);
}

/** Yan duran para yığını (kenar bantları): `n` para, genişlik `w`, tabanı `by`. */
export function coinStack(g: PxGrid, cx: number, by: number, w: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = by - 2.6 * (i + 1);
    g.rect(cx - w / 2, y, w, 3.4, 'Y').rect(cx - w / 2, y, w, 1.6, i % 2 ? 'y' : 'n');
    g.ellipse(cx, y, w / 2, 1.5, i % 2 ? 'Y' : 'y');
  }
  const top = by - 2.6 * n;
  g.ellipse(cx, top, w / 2, 1.6, 'y').ellipse(cx - w * 0.12, top - 0.3, w * 0.22, 0.6, 'w');
}

/** İskambil kartı: döndürülmüş, kenarlı. `face`: 'heart' | 'spade' | 'diamond' | 'back'. */
export function playingCard(g: PxGrid, cx: number, cy: number, w: number, h: number, ang: number, face: 'heart' | 'spade' | 'diamond' | 'back'): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rot = (x: number, y: number): [number, number] => [cx + x * c - y * s, cy + x * s + y * c];
  const quad = (hw: number, hh: number) => [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)].flat();
  g.poly(quad(w / 2, h / 2), 'd');
  if (face === 'back') {
    g.poly(quad(w / 2 - 0.9, h / 2 - 0.9), 'z');
    g.poly(quad(w / 2 - 1.8, h / 2 - 1.8), 'a');
    const d = Math.min(w, h) * 0.26;
    g.poly([rot(0, -d * 1.5), rot(d, 0), rot(0, d * 1.5), rot(-d, 0)].flat(), 'A');
    const [px, py] = rot(0, 0);
    g.disc(px, py, 0.9, 'z');
    return;
  }
  g.poly(quad(w / 2 - 0.9, h / 2 - 0.9), 'w');
  const col = face === 'spade' ? 'o' : 'r';
  const at = (x: number, y: number, k: number) => {
    const P = (px: number, py: number) => rot(x + px * k, y + py * k);
    if (face === 'heart') {
      const [ax, ay] = P(-1.1, -0.7);
      const [bx, by] = P(1.1, -0.7);
      g.disc(ax, ay, 1.35 * k, col).disc(bx, by, 1.35 * k, col).poly([P(-2.4, 0), P(2.4, 0), P(0, 2.9)].flat(), col);
    } else if (face === 'diamond') {
      g.poly([P(0, -3), P(2.1, 0), P(0, 3), P(-2.1, 0)].flat(), col);
    } else {
      g.poly([P(0, -3), P(2.7, 0.6), P(-2.7, 0.6)].flat(), col);
      const [ax, ay] = P(-1.3, 0.8);
      const [bx, by] = P(1.3, 0.8);
      g.disc(ax, ay, 1.35 * k, col).disc(bx, by, 1.35 * k, col).poly([P(0, 0.6), P(1.1, 3.2), P(-1.1, 3.2)].flat(), col);
    }
  };
  at(0, 0, Math.min(w, h) * 0.2);
  at(-w * 0.27, -h * 0.34, 0.34);
  at(w * 0.27, h * 0.34, 0.34);
}


/** Sivri uçlu, ortası şişkin savrulma izi (a -> b); `bulge` yana eğrilik (+ sağa), `w` en geniş yer. */
export function streak(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number, bulge: number, t: string): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const out: number[] = [];
  const back: number[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const cx = x0 + (x1 - x0) * u + nx * bulge * Math.sin(u * Math.PI);
    const cy = y0 + (y1 - y0) * u + ny * bulge * Math.sin(u * Math.PI);
    const half = (w / 2) * Math.sin(u * Math.PI) ** 0.8;
    out.push(cx + nx * half, cy + ny * half);
    back.unshift(cx - nx * half, cy - ny * half);
  }
  g.poly([...out, ...back], t);
}

/** Dikenli kalkan/kabuk için tek sivri diken (taban merkezi bx,by; ucu tx,ty; taban genişliği w). */
export function thorn(g: PxGrid, bx: number, by: number, tx: number, ty: number, w: number, lo = 'k', hi = 'n'): void {
  const len = Math.hypot(tx - bx, ty - by) || 1;
  const nx = (-(ty - by) / len) * (w / 2);
  const ny = ((tx - bx) / len) * (w / 2);
  g.poly([bx + nx, by + ny, tx, ty, bx - nx, by - ny], lo);
  g.poly([bx + nx, by + ny, tx, ty, bx, by], hi);
}

export const PIXEL_ICONS: Record<string, Draw> = {
  // ---------- WARRIOR ----------
  sword: (g) => {
    blade(g, 11, 20, 27, 4, 5, 'l', 'm');
    g.line(6, 15, 16, 25, 'Y', 3).line(6, 14, 16, 24, 'y', 2);
    g.line(10, 22, 5, 27, 'b', 3).line(9, 23, 6, 26, 'k', 1);
    g.disc(3.5, 28.5, 2.2, 'y');
  },
  charge: (g) => {
    blade(g, 14, 16, 30, 16, 6, 'w', 'l');
    g.rect(11, 8, 3, 17, 'y').rect(13, 9, 1, 15, 'Y');
    g.rect(4, 14, 7, 5, 'b').rect(6, 14, 1, 5, 'k').rect(9, 14, 1, 5, 'k');
    g.disc(3.5, 16.5, 2.4, 'y');
    g.line(0, 7, 8, 7, 'm').line(3, 11, 9, 11, 'l').line(0, 22, 8, 22, 'm').line(3, 26, 10, 26, 'l');
    g.disc(4, 29, 1.6, 'd').disc(8, 29.5, 1.2, 'm').disc(13, 28.5, 1.4, 'd');
  },
  whirlwind: (g) => {
    g.ring(16, 16, 11, 'm', 3).ring(16, 16, 8, 'l', 1);
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + 0.4;
      const [tx, ty] = polar(16, 16, 15.5, a);
      const [b1x, b1y] = polar(16, 16, 8, a + 0.6);
      const [b2x, b2y] = polar(16, 16, 8, a - 0.6);
      g.poly([tx, ty, b1x, b1y, b2x, b2y], i % 2 ? 'l' : 'w');
    }
    orb(g, 16, 16, 4.6, 'y');
  },
  warcry: (g) => {
    g.rect(9, 13, 7, 12, 'n').rect(9, 22, 7, 3, 'Y');
    g.poly([8, 16, 8, 10, 12, 5, 16, 5, 16, 13, 12, 13], 'm').rect(14, 8, 2, 9, 'd');
    g.poly([8, 12, 4, 11, 2, 3, 6, 7, 8, 8], 'l').poly([8, 12, 5, 11, 3, 5, 6, 8], 'w');
    g.rect(10, 16, 4, 2, 'o').line(9, 14, 14, 16, 'k');
    g.rect(11, 21, 5, 5, 'o').rect(11, 21, 5, 1, 'w').rect(13, 24, 3, 2, 'r');
    g.mirror();
    g.ring(23, 17, 4, 'r', 2, -1.1, 1.1).ring(23, 17, 7.5, 'r', 2, -1.1, 1.1).ring(23, 17, 11, 'f', 1, -1, 1);
  },
  helm: (g) => {
    g.poly([6, 28, 6, 14, 9, 7, 13, 4, 16, 4, 16, 28], 'm').rect(6, 18, 10, 10, 'd');
    g.poly([8, 28, 8, 15, 11, 9, 14, 6, 16, 6, 16, 14, 12, 14, 12, 28], 'l');
    g.rect(7, 14, 9, 3, 'o').rect(7, 19, 9, 1, 'o').rect(7, 22, 9, 1, 'o').rect(7, 25, 9, 1, 'o');
    g.rect(14, 14, 2, 14, 'd');
    g.mirror();
    g.poly([16, 4, 13, 1, 19, 1], 'a');
    g.poly([13, 4, 16, 2, 19, 4, 18, 8, 14, 8], 'a').poly([14, 4, 16, 3, 18, 4, 17, 7, 15, 7], 'z');
    g.rect(15, 14, 2, 14, 'd');
  },
  rage: (g) => {
    flame(g, 16, 30, 28, 11, 'r', 'f', 'y');
    g.poly([9, 22, 6, 14, 11, 18], 'R').poly([23, 22, 26, 14, 21, 18], 'R');
    g.disc(14, 22, 1.6, 'w');
  },

  // ---------- PALADIN ----------
  holystrike: (g) => {
    for (let i = 0; i < 5; i++) {
      const a = -2.6 + i * 0.52;
      const [x0, y0] = polar(22, 9, 8, a);
      const [x1, y1] = polar(22, 9, 12, a);
      g.line(x0, y0, x1, y1, 'y', 2);
    }
    blade(g, 11, 22, 25, 8, 5, 'w', 'l');
    g.line(5, 17, 17, 29, 'Y', 3).line(5, 16, 17, 28, 'y', 2);
    g.line(10, 24, 6, 28, 'b', 3);
    g.disc(4.5, 29.5, 2.2, 'y');
    sparkle(g, 26, 5, 4, 'w');
  },
  ankh: (g) => {
    g.ring(16, 9, 6.5, 'y', 4).ring(16, 9, 6.5, 'Y', 1);
    g.rect(13, 14, 6, 17, 'y').rect(5, 18, 22, 5, 'y');
    g.rect(13, 14, 2, 17, 'w').rect(5, 18, 22, 1, 'w');
    g.rect(17, 22, 2, 9, 'Y');
    g.disc(16, 20.5, 1.4, 'r');
    sparkle(g, 26, 5, 3);
    sparkle(g, 6, 27, 2.5);
  },
  // Holy Strike: kutsal bir parlaklığın (halo) içinde savaş çekici; iz/çizgi yok
  judgehammer: (g) => {
    holyHalo(g, 16, 12.5, 16.5);
    holyHammer(g, true);
    sparkle(g, 4.5, 5, 3.2);
    sparkle(g, 27.5, 7, 2.6);
    sparkle(g, 5.5, 25, 2.2);
    sparkle(g, 27, 24, 1.8, 'y');
    g.rect(9, 1.5, 1, 1, 'w').rect(23, 2, 1, 1, 'w').rect(2, 15, 1, 1, 'y').rect(29.5, 15, 1, 1, 'w').rect(11, 28, 1, 1, 'y');
  },
  // Judgment: gökten inen ışık sütunu içinde hüküm terazisi
  judgebeam: (g) => {
    g.ellipse(16, 28, 14, 3.4, 'Y').ellipse(16, 27.6, 10.5, 2.4, 'y').ellipse(16, 27.2, 5.5, 1.2, 'w');
    g.poly([10, 0, 22, 0, 29, 27, 3, 27], 'y');
    g.poly([11.5, 0, 20.5, 0, 26, 27, 6, 27], 'w');
    // terazi (koyu siluet, ışığın önünde okunur): direk, kol, zincirler, kefeler
    g.rect(15, 9, 2, 17, 'b').rect(15, 9, 1, 17, 'n');
    g.rect(10.5, 24, 11, 2.2, 'b').rect(10.5, 24, 11, 0.8, 'n');
    g.line(6, 9.5, 26, 9.5, 'k', 1.6).line(6, 9, 26, 9, 'b', 0.8);
    g.disc(16, 7.4, 2, 'k').disc(15.6, 7, 0.9, 'n');
    g.line(6.5, 10.5, 3.5, 17.5, 'k', 0.8).line(6.5, 10.5, 9.5, 17.5, 'k', 0.8);
    g.line(25.5, 10.5, 22.5, 17.5, 'k', 0.8).line(25.5, 10.5, 28.5, 17.5, 'k', 0.8);
    g.poly([2, 17.5, 11, 17.5, 9.5, 21, 3.5, 21], 'k').poly([2.5, 17.5, 10.5, 17.5, 10, 18.6, 3, 18.6], 'b');
    g.poly([21, 17.5, 30, 17.5, 28.5, 21, 22.5, 21], 'k').poly([21.5, 17.5, 29.5, 17.5, 29, 18.6, 22, 18.6], 'b');
    sparkle(g, 5, 4, 3.2);
    sparkle(g, 27, 6, 2.6);
  },
  radiance: (g) => {
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16;
      const long = i % 2 === 0;
      const [tx, ty] = polar(16, 16, long ? 15.5 : 11.5, a);
      const [b1x, b1y] = polar(16, 16, 7, a + 0.2);
      const [b2x, b2y] = polar(16, 16, 7, a - 0.2);
      g.poly([tx, ty, b1x, b1y, b2x, b2y], long ? 'y' : 'Y');
    }
    orb(g, 16, 16, 6.5, 'y');
    g.disc(16, 16, 3.5, 'w');
  },
  holy: (g) => {
    shieldShape(g, 16, 2, 26, 28, 'a', 'A');
    g.rect(14, 7, 4, 17, 'w').rect(8, 11, 16, 4, 'w');
    g.rect(14, 7, 1, 17, 'l').rect(8, 11, 16, 1, 'l');
    g.poly([16, 3, 14, 6, 18, 6], 'z');
  },
  divine: (g) => {
    g.rect(13, 3, 6, 26, 'y').rect(5, 11, 22, 6, 'y');
    g.rect(13, 3, 2, 26, 'w').rect(5, 11, 22, 2, 'w').rect(17, 17, 2, 12, 'Y');
    g.ring(16, 14, 9, 'y', 1);
    sparkle(g, 6, 5, 3.5);
    sparkle(g, 26, 25, 3.5);
  },

  // ---------- MAGE ----------
  fireball: (g) => {
    flame(g, 6, 20, 14, 5, 'R', 'r', 'f');
    g.poly([2, 10, 12, 14, 12, 20, 3, 18], 'R').poly([1, 22, 12, 17, 12, 22, 4, 25], 'R');
    g.poly([4, 12, 14, 15, 14, 19, 5, 17], 'r').poly([5, 21, 14, 18, 14, 22, 7, 24], 'r');
    g.disc(21, 16, 9, 'r').disc(21.5, 16.5, 7.4, 'f').disc(22, 16.5, 5, 'y');
    g.disc(23, 15, 2.6, 'w');
    g.rect(13, 6, 2, 2, 'f').rect(8, 26, 2, 2, 'f').rect(26, 5, 2, 2, 'y');
  },
  blizzard: (g) => {
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 - Math.PI / 2;
      const [x1, y1] = polar(16, 16, 14, a);
      g.line(16, 16, x1, y1, 'c', 2);
      for (const k of [0.45, 0.72]) {
        const [bx, by] = polar(16, 16, 14 * k, a);
        for (const d of [-0.9, 0.9]) {
          const [ex, ey] = polar(bx, by, 5 * (1.1 - k * 0.5), a + d);
          g.line(bx, by, ex, ey, 'c', 1);
        }
      }
    }
    g.disc(16, 16, 3.5, 'w');
    g.ring(16, 16, 5, 'c', 1);
  },
  manabarrier: (g) => {
    g.disc(16, 16, 14, 'U').disc(16, 16, 12.5, 'u').ring(16, 16, 14, 'c', 2);
    g.poly([16, 7, 22, 11, 22, 19, 16, 23, 10, 19, 10, 11], 'c').poly([16, 10, 20, 12.5, 20, 17.5, 16, 20, 12, 17.5, 12, 12.5], 'u');
    g.ring(16, 16, 11, 'w', 1, 3.4, 4.9);
    g.rect(8, 8, 3, 3, 'w').rect(11, 6, 2, 2, 'w');
  },
  meteor: (g) => {
    // alev kuyruğu (sağ üst), kızgın kaya (sol alt)
    g.poly([31, 0, 24, 2, 15, 9, 12, 15, 20, 15, 27, 10], 'r').poly([31, 4, 26, 8, 19, 15, 16, 21, 23, 18, 30, 11], 'R');
    g.poly([29, 1, 21, 5, 14, 12, 18, 14, 25, 8], 'f').poly([27, 3, 19, 8, 15, 13, 19, 12, 23, 7], 'y');
    g.line(31, 0, 16, 13, 'w', 1);
    g.disc(12, 20, 11.5, 'r').disc(12, 20, 10.3, 'f');
    g.disc(12, 20, 9, 'k').disc(11, 19, 7, 'b').disc(9.5, 17, 4, 'n').disc(8.5, 16, 1.5, 'w');
    g.disc(15, 24, 2.6, 'k').disc(7, 22, 1.8, 'k').disc(14, 15, 1.4, 'k');
    g.line(8, 26, 14, 28, 'f', 1).line(14, 28, 19, 24, 'y', 1).line(5, 24, 8, 27, 'f', 1);
    g.rect(24, 15, 2, 2, 'f').rect(5, 10, 2, 2, 'y').rect(26, 21, 2, 2, 'f').rect(2, 14, 1, 1, 'y');
  },
  wizhat: (g) => {
    g.poly([4, 24, 11, 8, 17, 1, 24, 24], 'a').poly([4, 24, 11, 8, 14, 8, 10, 24], 'z').poly([17, 1, 25, 11, 23, 12, 17, 6], 'A');
    g.poly([17, 1, 21, 3, 19, 6], 'a');
    g.ellipse(16, 25, 15, 4.5, 'A').ellipse(16, 24, 15, 3.5, 'a');
    g.rect(8, 19, 16, 3, 'y').rect(8, 19, 16, 1, 'w').rect(14, 18, 4, 5, 'Y');
    sparkle(g, 24, 8, 3.5, 'y');
    sparkle(g, 11, 14, 2.2, 'w');
  },
  echo: (g) => {
    g.ring(16, 16, 15, 'p', 2).ring(16, 16, 10.5, 'u', 2);
    g.poly([16, 8, 22, 16, 16, 24, 10, 16], 'c').poly([16, 11, 19, 16, 16, 21, 13, 16], 'w');
    g.rect(15, 1, 2, 3, 'w').rect(15, 28, 2, 3, 'w').rect(1, 15, 3, 2, 'w').rect(28, 15, 3, 2, 'w');
  },

  // ---------- UNDEAD ----------
  skull: (g) => {
    g.disc(16, 13, 11.5, 'w').poly([8, 19, 24, 19, 22, 28, 10, 28], 'w').rect(11, 27, 10, 3, 'l');
    g.disc(11.5, 14, 3.6, 'o').disc(20.5, 14, 3.6, 'o').poly([16, 18, 14, 22, 18, 22], 'o');
    g.line(13, 27, 13, 30, 'o').line(16, 27, 16, 30, 'o').line(19, 27, 16 + 3, 30, 'o');
    g.disc(11, 13.5, 1.2, 'p').disc(20, 13.5, 1.2, 'p');
    g.line(8, 6, 13, 3, 'l', 2);
  },
  bonethrow: (g) => {
    g.line(7, 24, 25, 6, 'l', 3).line(8, 25, 26, 7, 'w', 1);
    for (const [x, y] of [[5, 22], [6, 26], [24, 5], [27, 8]] as const) g.disc(x, y, 3, 'w');
    g.line(0, 12, 6, 10, 'p', 2).line(0, 17, 5, 15, 'P', 2).line(24, 22, 31, 25, 'p', 2).line(21, 27, 28, 29, 'P', 2);
  },
  bloodrite: (g) => {
    g.poly([4, 11, 28, 11, 24, 22, 8, 22], 'm').rect(4, 10, 24, 4, 'R').rect(6, 12, 20, 2, 'r');
    g.rect(14, 22, 4, 6, 'd').rect(8, 28, 16, 3, 'd').rect(9, 28, 14, 1, 'm');
    g.poly([16, 0, 21, 6, 20, 10, 12, 10, 11, 6], 'r').disc(14, 6, 1.6, 'w');
    g.line(8, 14, 10, 18, 'l').line(24, 14, 22, 18, 'd');
  },
  wail: (g) => {
    g.poly([5, 28, 5, 12, 9, 4, 16, 2, 23, 4, 27, 12, 27, 28, 22, 24, 19, 29, 16, 24, 13, 29, 10, 24], 'w');
    g.poly([5, 28, 5, 14, 9, 8, 9, 24], 'l').poly([27, 28, 27, 14, 24, 9, 24, 24], 'm');
    g.ellipse(11.5, 13, 2.8, 3.6, 'o').ellipse(20.5, 13, 2.8, 3.6, 'o').ellipse(16, 21, 3.4, 4.6, 'o').disc(16, 22.5, 2, 'P');
    g.line(0, 9, 3, 7, 'p', 2).line(0, 15, 3, 15, 'p', 2).line(31, 9, 28, 7, 'p', 2).line(31, 15, 28, 15, 'p', 2);
  },
  raise: (g) => {
    g.rect(0, 24, 32, 8, 'k').rect(0, 24, 32, 2, 'b').rect(4, 26, 3, 2, 'k').rect(22, 27, 4, 2, 'b');
    g.rect(12, 12, 8, 14, 'l').rect(12, 12, 2, 14, 'w');
    g.rect(9, 9, 3, 8, 'l').rect(13, 3, 3, 11, 'l').rect(17, 2, 3, 12, 'l').rect(21, 6, 3, 9, 'l');
    g.rect(13, 3, 1, 11, 'w').rect(17, 2, 1, 12, 'w');
    g.rect(12, 22, 8, 2, 'm');
    g.line(3, 18, 6, 12, 'p', 2).line(28, 18, 25, 12, 'p', 2).rect(1, 9, 2, 2, 'P').rect(29, 9, 2, 2, 'P');
  },
  soul: (g) => {
    g.poly([16, 0, 24, 12, 25, 22, 16, 30, 7, 22, 8, 12], 'p');
    g.poly([16, 8, 20, 15, 20, 22, 16, 26, 12, 22, 12, 15], 'c').poly([16, 14, 18, 18, 16, 22, 14, 18], 'w');
    g.rect(13, 12, 2, 3, 'o').rect(18, 12, 2, 3, 'o');
  },
  bone: (g) => {
    blade(g, 11, 20, 27, 4, 5, 'l', 'd', 'm');
    g.rect(15, 13, 2, 2, 'b').rect(19, 9, 2, 2, 'b').rect(23, 6, 2, 2, 'b').rect(13, 17, 1, 1, 'k');
    g.line(6, 15, 16, 25, 'd', 3).line(6, 14, 16, 24, 'm', 2);
    g.line(10, 22, 6, 26, 'k', 3);
    g.disc(4.5, 27.5, 3, 'w');
  },

  // Bone Slash: geniş kemik pala savruluyor; arkasında yan yana (eş merkezli) üç vuruş izi
  boneslash: (g) => {
    const px = 5;
    const py = 28;
    const arc = (r: number, d0: number, d1: number, w: number, t: string) => {
      const pts: Array<[number, number]> = [];
      const back: Array<[number, number]> = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const a = ((d0 + (d1 - d0) * u) * Math.PI) / 180;
        const half = (w / 2) * Math.sin(u * Math.PI) ** 0.7;
        pts.push(polar(px, py, r + half, a));
        back.unshift(polar(px, py, r - half, a));
      }
      g.poly([...pts, ...back].flat(), t);
    };
    // üç iz: iç, orta (en geniş), dış
    arc(13, -100, -52, 3, 'm');
    arc(19.5, -98, -50, 4.4, 'l');
    arc(26, -90, -48, 3, 'm');
    arc(19.5, -92, -56, 1.5, 'w');
    // kemik pala: sapa doğru daralan geniş, hafif kıvrık bıçak
    const ang = (-38 * Math.PI) / 180;
    const tip = polar(px, py, 27, ang);
    g.poly([...polar(px, py, 8, ang - 0.34), ...polar(px, py, 17, ang - 0.19), ...tip, ...polar(px, py, 21, ang + 0.13), ...polar(px, py, 8, ang + 0.3)], 'n');
    g.poly([...polar(px, py, 8, ang - 0.34), ...polar(px, py, 17, ang - 0.19), ...tip, ...polar(px, py, 14, ang - 0.02), ...polar(px, py, 8, ang - 0.02)], 'e');
    g.line(...polar(px, py, 11, ang - 0.12), ...polar(px, py, 22, ang - 0.07), 'w', 1);
    for (const r of [12, 16, 20]) {
      const [nx, ny] = polar(px, py, r, ang + 0.17 - r * 0.004);
      g.rect(nx - 1, ny - 1, 2, 2, 'k');
    }
    // kabza: kemik çapraz tutamak + iki yuvarlak topuz
    g.line(...polar(px, py, 7, ang - 0.55), ...polar(px, py, 7, ang + 0.55), 'n', 2.4);
    g.line(...polar(px, py, 7, ang - 0.55), ...polar(px, py, 7, ang + 0.55), 'e', 1);
    g.line(px + 1, py - 1, px - 1, py + 1, 'b', 3);
    g.disc(2.4, 29.6, 2.9, 'e').disc(5.8, 31, 2.1, 'e').disc(1.6, 28.8, 1, 'w');
    g.rect(28, 20, 1.5, 1.5, 'w').rect(22, 3, 1.2, 1.2, 'e');
  },

  // ---------- ARCHER ----------
  arrow: (g) => {
    g.line(3, 28, 24, 7, 'b', 2).line(4, 28, 25, 7, 'k', 1);
    g.poly([30, 1, 30, 11, 20, 1], 'l').poly([30, 1, 28, 9, 22, 3], 'w').poly([30, 1, 30, 4, 27, 1], 'w');
    g.poly([2, 22, 8, 22, 6, 28, 0, 28], 'r').poly([6, 26, 12, 26, 10, 31, 4, 31], 'R').poly([9, 19, 13, 19, 12, 23, 8, 23], 'r');
  },
  pierce: (g) => {
    g.line(0, 26, 24, 8, 'b', 2).line(0, 27, 25, 9, 'k', 1);
    g.poly([31, 2, 31, 12, 21, 2], 'l').poly([31, 2, 29, 10, 23, 4], 'w');
    g.ring(15, 17, 7, 'a', 2).ring(15, 17, 4, 'z', 1);
    g.poly([0, 21, 5, 21, 3, 26, 0, 26], 'r');
  },
  arrows: (g) => {
    for (const x of [6, 16, 26]) {
      g.line(x, 1, x, 20, 'b', 2);
      g.poly([x - 4, 19, x + 5, 19, x + 0.5, 30], 'l').poly([x - 4, 19, x - 0.5, 19, x + 0.5, 28], 'w');
      g.rect(x - 3, 1, 3, 4, 'r').rect(x + 1, 1, 3, 4, 'R').rect(x - 3, 6, 3, 3, 'r').rect(x + 1, 6, 3, 3, 'R');
    }
  },
  aimedshot: (g) => {
    g.ring(16, 16, 13, 'a', 2).ring(16, 16, 7.5, 'z', 1);
    g.rect(15, 0, 2, 7, 'a').rect(15, 25, 2, 7, 'a').rect(0, 15, 7, 2, 'a').rect(25, 15, 7, 2, 'a');
    g.disc(16, 16, 2.4, 'r');
    g.line(31, 3, 18, 15, 'y', 2);
    g.poly([31, 0, 31, 6, 25, 0], 'w');
  },
  bow: (g) => {
    g.poly([8, 1, 11, 1, 14, 8, 14, 24, 11, 31, 8, 31, 10, 24, 10, 8], 'b');
    g.poly([9, 1, 11, 1, 13, 8, 12, 8], 'n').rect(12, 13, 3, 6, 'k');
    g.line(9, 1, 9, 31, 'w');
    g.line(9, 16, 26, 16, 'k', 1);
    g.poly([31, 16, 24, 12, 24, 20], 'l').poly([31, 16, 25, 14, 25, 16], 'w');
    g.line(9, 11, 13, 16, 'r', 2).line(9, 21, 13, 16, 'R', 2);
  },
  sharp: (g) => {
    g.ring(16, 16, 14, 'a', 2).ring(16, 16, 8.5, 'a', 2);
    g.rect(15, 0, 2, 6, 'a').rect(15, 26, 2, 6, 'a').rect(0, 15, 6, 2, 'a').rect(26, 15, 6, 2, 'a');
    g.disc(16, 16, 3, 'y').disc(15, 15, 1, 'w');
  },

  // ---------- DRUID ----------
  thornwhip: (g) => {
    const path: Array<[number, number]> = [[3, 29], [5, 22], [8, 17], [13, 18], [17, 15], [20, 9], [25, 6], [30, 6]];
    for (let i = 0; i < path.length - 1; i++) g.line(path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], 'G', 4);
    for (let i = 0; i < path.length - 1; i++) g.line(path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], 'g', 2);
    for (const [x, y, dx, dy] of [[6, 20, -4, -2], [12, 18, 0, 5], [18, 12, 4, 3], [22, 8, -2, -5], [27, 6, 2, 5]] as const) g.poly([x, y, x + dx - 1, y + dy, x + dx + 1, y + dy], 'w');
    g.rect(1, 27, 5, 5, 'b').rect(2, 28, 3, 1, 'k');
  },
  rootsmash: (g) => {
    g.poly([6, 9, 25, 9, 27, 24, 20, 30, 8, 28], 'b').rect(6, 9, 20, 4, 'n').rect(8, 14, 3, 14, 'k').rect(20, 14, 4, 10, 'k');
    g.line(10, 6, 10, 10, 'g', 2).line(16, 3, 16, 10, 'g', 2).line(22, 6, 22, 10, 'g', 2);
    g.rect(13, 17, 6, 4, 'k').disc(10, 4, 2, 'G').disc(16, 2, 2, 'G').disc(22, 4, 2, 'G');
  },
  rejuvenate: (g) => {
    g.rect(14, 14, 4, 17, 'G').rect(14, 14, 1, 17, 'g');
    leafShape(g, 14, 17, 2, 7, 5, 'g', 'G');
    leafShape(g, 18, 13, 30, 3, 5, 'g', 'G');
    g.rect(10, 29, 12, 3, 'k').rect(10, 29, 12, 1, 'b');
    sparkle(g, 26, 20, 4);
    sparkle(g, 6, 22, 2.5, 'z');
    g.disc(16, 12, 3, 'y').disc(15, 11, 1, 'w');
  },
  treant: (g) => {
    g.rect(12, 16, 8, 14, 'b').rect(12, 16, 2, 14, 'n').rect(18, 16, 2, 14, 'k').rect(8, 28, 16, 3, 'k');
    g.disc(16, 9, 9, 'G').disc(7, 14, 6, 'G').disc(25, 14, 6, 'G').disc(15, 8, 6.5, 'g').disc(6, 13, 4, 'g').disc(24, 13, 4, 'g');
    g.disc(12, 6, 1.6, 'z').disc(5, 11, 1.2, 'z');
    g.rect(13, 20, 2, 2, 'o').rect(17, 20, 2, 2, 'o').rect(15, 25, 3, 2, 'o');
  },
  roots: (g) => {
    g.rect(0, 26, 32, 6, 'k').rect(0, 26, 32, 2, 'b').rect(6, 28, 3, 2, 'k');
    g.line(7, 27, 4, 16, 'b', 3).line(4, 16, 9, 6, 'b', 3).line(9, 6, 6, 2, 'n', 2);
    g.line(16, 27, 16, 12, 'b', 3).line(16, 12, 12, 4, 'b', 3).line(16, 12, 22, 4, 'b', 3);
    g.line(26, 27, 28, 16, 'b', 3).line(28, 16, 24, 10, 'b', 3);
    g.disc(9, 6, 2.6, 'g').disc(12, 4, 2, 'g').disc(22, 4, 2.6, 'g').disc(24, 10, 2.2, 'g').disc(6, 2, 2, 'z');
  },
  // Thorn Shield: yaşayan ahşap kalkan; kenarından sivri dikenler, altından kökler, üstünde yeşil sürgün
  thornshield: (g) => {
    // altta kök ayakları
    g.line(9, 26, 4, 30, 'k', 2.2).line(16, 28, 16, 31.5, 'k', 2.2).line(23, 26, 28, 30, 'k', 2.2);
    g.line(9, 26, 6, 28, 'b', 1).line(23, 26, 26, 28, 'b', 1);
    // dikenler (kenarın dışına)
    for (const [bx, by, tx, ty] of [[8, 5, 4, 0.5], [16, 3, 16, -0.5], [24, 5, 28, 0.5], [3.5, 13, -1, 11], [28.5, 13, 33, 11], [4.5, 21, 0, 23.5], [27.5, 21, 32, 23.5]] as const) thorn(g, bx, by, tx, ty, 4);
    // kalkan: koyu ahşap kenar, kahve tahta zemin
    shieldShape(g, 16, 3.5, 25, 25, 'k', 'b');
    // tahta damarları ve çıtalar
    g.line(16, 6, 16, 26, 'k', 0.8).line(10, 8, 10, 19, 'k', 0.6).line(22, 8, 22, 19, 'k', 0.6);
    g.line(8, 13, 24, 13, 'k', 0.8);
    g.rect(7, 7, 7, 3, 'n').rect(18, 7, 6, 2, 'n');
    // sürgünler: kalkanı saran yeşil sarmaşık + yaprak
    g.line(7, 10, 12, 15, 'G', 1.8).line(12, 15, 16, 14, 'G', 1.8).line(16, 14, 22, 18, 'G', 1.8).line(22, 18, 25, 24, 'G', 1.6);
    g.line(7, 10, 12, 15, 'g', 0.8).line(16, 14, 22, 18, 'g', 0.8);
    g.disc(10, 17.5, 2.2, 'g').disc(9.4, 16.8, 0.8, 'z').disc(24.5, 14.5, 2, 'g').disc(23.9, 13.9, 0.7, 'z').disc(19, 21.5, 1.8, 'g');
    // kalkan göbeği: büyük diken
    g.disc(16, 16, 3.4, 'k').disc(16, 16, 2.4, 'b');
    thorn(g, 16, 16, 16, 9.5, 4.2, 'k', 'n');
    thorn(g, 16, 16, 21.5, 20, 3.4, 'k', 'n');
    thorn(g, 16, 16, 10.5, 20, 3.4, 'k', 'n');
  },
  leaf: (g) => {
    g.poly([3, 27, 5, 13, 16, 3, 28, 3, 28, 16, 18, 26], 'G');
    g.poly([3, 27, 5, 13, 16, 3, 28, 3, 14, 17], 'g');
    g.line(5, 25, 26, 5, 'w', 2);
    g.line(11, 19, 16, 22, 'G', 1).line(15, 15, 20, 18, 'G', 1).line(18, 11, 23, 14, 'G', 1);
    g.line(3, 27, 0, 30, 'b', 2);
  },
  leaves: (g) => {
    leafShape(g, 3, 20, 12, 3, 6, 'g', 'G');
    leafShape(g, 14, 17, 29, 4, 6, 'g', 'G');
    leafShape(g, 6, 30, 22, 17, 6, 'g', 'G');
  },

  // ---------- DEFENDER ----------
  guard: (g) => {
    shieldShape(g, 12, 2, 22, 26, 'a', 'z');
    g.rect(11, 6, 3, 18, 'a').rect(5, 11, 14, 3, 'a');
    g.rect(22, 18, 8, 11, 'n').rect(22, 18, 2, 11, 'Y').rect(28, 16, 3, 4, 'n').rect(25, 16, 3, 3, 'n');
    g.disc(12, 12.5, 2.4, 'y');
  },
  tremor: (g) => {
    g.rect(0, 22, 32, 10, 'k').rect(0, 22, 32, 2, 'b');
    g.line(15, 22, 11, 26, 'o', 2).line(11, 26, 17, 28, 'o', 2).line(17, 28, 13, 31, 'o', 2).line(4, 24, 0, 26, 'o', 2).line(25, 24, 31, 28, 'o', 2);
    g.rect(10, 4, 12, 13, 'n').rect(10, 4, 12, 4, 'Y').rect(8, 8, 3, 8, 'n').rect(21, 8, 3, 8, 'n').rect(10, 15, 12, 2, 'Y');
    g.line(3, 14, 7, 16, 'w', 2).line(28, 14, 24, 16, 'w', 2).line(4, 8, 8, 10, 'w', 2).line(27, 8, 23, 10, 'w', 2);
  },
  fistcrush: (g) => {
    g.rect(6, 8, 20, 18, 'n').rect(6, 8, 20, 4, 'y').rect(6, 24, 20, 2, 'Y');
    for (const x of [6, 12, 18, 24]) g.rect(x - 1, 3, 5, 7, 'n').rect(x - 1, 3, 5, 2, 'y').rect(x + 2, 4, 1, 5, 'Y');
    g.rect(0, 14, 7, 8, 'n').rect(0, 14, 2, 8, 'Y');
    g.line(13, 12, 13, 22, 'Y').line(19, 12, 19, 22, 'Y');
    g.line(9, 29, 23, 29, 'o', 2).line(6, 31, 10, 31, 'd').line(22, 31, 26, 31, 'd');
  },
  bulwark: (g) => {
    shieldShape(g, 16, 1, 27, 30, 'a', 'A');
    g.rect(14, 4, 4, 22, 'z').rect(6, 12, 20, 4, 'z');
    g.disc(9.5, 7, 1.6, 'w').disc(22.5, 7, 1.6, 'w').disc(9.5, 20, 1.4, 'w').disc(22.5, 20, 1.4, 'w');
  },
  aura: (g) => {
    g.ring(16, 16, 15, 'a', 2).ring(16, 16, 10.5, 'z', 2);
    g.poly([16, 8, 22, 11, 22, 18, 16, 24, 10, 18, 10, 11], 'w').poly([16, 11, 19, 13, 19, 17, 16, 20, 13, 17, 13, 13], 'a');
  },

  // ---------- ANTI-MAGE ----------
  manaburn: (g) => {
    g.poly([16, 4, 25, 16, 25, 23, 16, 31, 7, 23, 7, 16], 'u').poly([16, 11, 21, 18, 20, 24, 12, 24, 11, 18], 'c');
    g.rect(12, 18, 2, 3, 'w');
    flame(g, 16, 14, 14, 7, 'f', 'y', 'w');
    g.line(3, 9, 7, 12, 'p', 2).line(29, 9, 25, 12, 'p', 2);
  },
  drainfield: (g) => {
    g.ring(16, 16, 14, 'p', 2).ring(16, 16, 8, 'P', 2);
    g.disc(16, 16, 3.4, 'o');
    for (const [x, y, dx, dy] of [[2, 2, 1, 1], [29, 2, -1, 1], [2, 29, 1, -1], [29, 29, -1, -1]] as const) {
      g.line(x, y, x + dx * 5, y + dy * 5, 'z', 2);
      g.rect(x + dx * 6 - 1, y + dy * 6 - 1, 3, 3, 'w');
    }
  },
  spellward: (g) => {
    g.poly([16, 0, 28, 5, 26, 20, 16, 31, 6, 20, 4, 5], 'p').poly([16, 4, 24, 8, 23, 19, 16, 27, 9, 19, 8, 8], 'P');
    g.line(16, 8, 16, 22, 'c', 2).line(11, 12, 21, 12, 'c', 2).line(11, 12, 16, 22, 'c', 1).line(21, 12, 16, 22, 'c', 1);
    g.rect(5, 3, 2, 2, 'w');
  },
  voidstrike: (g) => {
    g.disc(16, 16, 14, 'P').disc(16, 16, 11.5, 'o').ring(16, 16, 13, 'p', 2);
    g.line(4, 28, 27, 5, 'w', 2).line(6, 29, 28, 7, 'c', 1);
    g.rect(9, 8, 2, 2, 'p').rect(21, 22, 2, 2, 'p').rect(8, 18, 2, 2, 'z').rect(23, 12, 2, 2, 'p');
  },
  overflow: (g) => {
    g.poly([16, 2, 25, 15, 25, 22, 16, 30, 7, 22, 7, 15], 'u').poly([16, 8, 21, 16, 21, 22, 16, 26, 11, 22, 11, 16], 'c');
    g.line(3, 6, 10, 11, 'p', 2).line(29, 6, 22, 11, 'p', 2).rect(15, 0, 2, 3, 'w');
    g.disc(13, 19, 1.4, 'w');
  },
  nullsphere: (g) => {
    g.disc(16, 16, 14, 'a').disc(16, 16, 11, 'A');
    g.line(6, 26, 25, 7, 'w', 3).line(7, 27, 26, 8, 'l', 1);
    g.disc(11, 10, 2.4, 'z').disc(9, 12, 1.2, 'z');
  },


  // ---------- GAMBLER ----------
  // Class logosu: arkada yarım açık iskambil kartı, önde kemik zar ve altın para
  gamblerlogo: (g) => {
    playingCard(g, 22.5, 11.5, 11, 16, 0.42, 'heart');
    isoDie(g, 11, 12.5, 9);
    goldCoin(g, 22, 21.5, 8);
    sparkle(g, 4.5, 5, 2.6, 'y');
    sparkle(g, 28, 28, 2, 'w');
  },
  // Double or Nothing: bir altın para ve yanında yarısı altın, yarısı boş (kararmış) ikinci para
  doubleornothing: (g) => {
    const hx = 22.5;
    const hy = 11.5;
    g.disc(hx, hy, 8.2, 'Y');
    g.poly(Array.from({ length: 14 }, (_, i) => polar(hx, hy, 7.6, Math.PI / 2 + (i / 13) * Math.PI)).flat(), 'y');
    g.poly(Array.from({ length: 14 }, (_, i) => polar(hx, hy, 7.6, -Math.PI / 2 + (i / 13) * Math.PI)).flat(), 'd');
    g.ring(hx, hy, 7.6, 'Y', 1, Math.PI / 2, Math.PI * 1.5).ring(hx, hy, 7.6, 'm', 1, -Math.PI / 2, Math.PI / 2);
    g.ring(hx, hy, 4.6, 'Y', 0.8, Math.PI / 2, Math.PI * 1.5);
    g.line(hx, hy - 7.8, hx, hy + 7.8, 'o', 1);
    g.line(hx + 2, hy - 2.6, hx + 5.2, hy + 3, 'o', 0.9).line(hx + 5.2, hy - 2.6, hx + 2, hy + 3, 'o', 0.9);
    goldCoin(g, 10.5, 20, 8.6);
    sparkle(g, 27.5, 24, 3, 'w');
    sparkle(g, 4, 6, 2.4, 'y');
  },
  // Loaded Dice: kemik zar, kırık köşesinden içindeki altın/kurşun parıltısı görünür
  loadeddice: (g) => {
    isoDie(g, 15, 10, 11);
    g.poly([22, 8, 26, 10, 26, 14, 24, 14.5], 'y');
    g.poly([23, 9.5, 25.5, 10.8, 25.5, 13, 24, 13.4], 'w');
    g.line(24, 14.5, 22.2, 17, 'y', 0.9).line(22.2, 17, 24.2, 19.5, 'y', 0.9).line(24.2, 19.5, 22.4, 22, 'y', 0.9);
    g.line(22.2, 17, 20.5, 16.4, 'w', 0.5);
    g.rect(4, 26, 2, 2, 'y').rect(26, 27, 2, 2, 'Y').rect(8, 29, 1, 1, 'y');
    sparkle(g, 26.5, 5, 4, 'w');
    sparkle(g, 5, 7, 2.6, 'y');
  },
  // High Stakes: altın para yığını üstüne düşen kan damlası
  highstakes: (g) => {
    coinStack(g, 20, 30, 14, 4);
    coinStack(g, 7.5, 30, 11, 2);
    const d = 5;
    g.poly([14 + d, 1.5, 19.2 + d, 9.5, 19.6 + d, 13, 17.5 + d, 16.5, 14 + d, 17.5, 10.5 + d, 16.5, 8.4 + d, 13, 8.8 + d, 9.5], 'R');
    g.poly([14 + d, 3.5, 18 + d, 10, 18.2 + d, 13, 16.5 + d, 15.6, 14 + d, 16.2, 11.5 + d, 15.6, 9.8 + d, 13, 10 + d, 10], 'r');
    g.rect(11 + d, 10, 1.6, 3.6, 'w');
    g.ellipse(20, 19.3, 6.2, 1.3, 'R').ellipse(20, 19.1, 4.6, 0.8, 'r');
    g.rect(4, 12, 1.6, 2.4, 'r').rect(5, 16, 1.2, 1.6, 'R');
  },
  // Card Trick: yelpaze gibi açılmış üç iskambil kartı
  cardtrick: (g) => {
    playingCard(g, 16 - 6.6, 31 - 10.3, 11, 18, -0.55, 'back');
    playingCard(g, 16 + 6.6, 31 - 10.3, 11, 18, 0.55, 'spade');
    playingCard(g, 16, 31 - 12, 11, 18, 0, 'heart');
    g.rect(14, 28.5, 4, 3, 'Y').rect(14, 28.5, 4, 1, 'y');
    sparkle(g, 26.5, 5, 3.2, 'w');
    sparkle(g, 5, 6, 2.2, 'y');
  },
  // All In: ortadaki altın para yığını ve üstündeki zarlar, arkada ışık huzmeleri
  allin: (g) => {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (1 + i / 9);
      const [tx, ty] = polar(16, 21, 15.5, a);
      const [b1x, b1y] = polar(16, 21, 7, a + 0.15);
      const [b2x, b2y] = polar(16, 21, 7, a - 0.15);
      g.poly([tx, ty, b1x, b1y, b2x, b2y], i % 2 ? 'Y' : 'y');
    }
    g.ellipse(16, 27.5, 14.5, 4, 'Y');
    const pile: Array<[number, number]> = [[6, 26], [11, 27.5], [16, 28], [21, 27.5], [26, 26], [8.5, 23.2], [13.5, 24.5], [18.5, 24.5], [23.5, 23.2], [11, 20.8], [16, 21.5], [21, 20.8], [16, 18.4]];
    pile.forEach(([x, y], i) => {
      g.ellipse(x, y, 5, 2.5, i % 2 ? 'Y' : 'y').ellipse(x, y - 0.5, 4, 1.6, i % 2 ? 'y' : 'n');
    });
    isoDie(g, 16, 5.8, 6.2, GOLD_DIE);
    isoDie(g, 6.5, 14, 4.2);
    isoDie(g, 25.5, 15, 4);
    sparkle(g, 27, 4, 3, 'w');
    sparkle(g, 5, 5, 2.4, 'y');
  },

  // ---------- arayüz: debug dock ve ayarlar ----------
  flask: (g) => {
    g.rect(12, 3, 8, 10, 'c').rect(13, 4, 2, 8, 'w');
    g.poly([12, 12, 20, 12, 28, 28, 4, 28], 'c').poly([9, 20, 23, 20, 28, 28, 4, 28], 'g');
    g.rect(11, 1, 10, 3, 'b').rect(11, 1, 10, 1, 'n');
    g.disc(14, 23.5, 1.4, 'w').disc(19, 25, 1.1, 'w').disc(16, 17, 1, 'w');
    g.rect(9, 20, 14, 1, 'z');
  },
  team: (g) => {
    for (const [cx, body, y0] of [[8, 'u', 12], [24, 'r', 12], [16, 'y', 8]] as const) {
      g.disc(cx, y0 + 4, 3.8, 'n');
      g.poly([cx - 6, y0 + 20, cx - 5, y0 + 10, cx + 5, y0 + 10, cx + 6, y0 + 20], body);
      g.rect(cx - 2, y0 + 8, 4, 2, 'n');
    }
    g.rect(4, 29, 24, 2, 'd');
  },
  dice: (g) => {
    g.rect(4, 4, 24, 24, 'w').rect(4, 25, 24, 3, 'm').rect(25, 4, 3, 24, 'm');
    for (const [x, y] of [[9, 9], [23, 9], [16, 16], [9, 23], [23, 23]] as const) g.disc(x, y, 2.4, 'r');
  },
  robot: (g) => {
    g.line(16, 9, 16, 4, 'd', 2).disc(16, 3.5, 2.2, 'r');
    g.rect(6, 9, 20, 17, 'm').rect(6, 9, 20, 3, 'l').rect(6, 24, 20, 2, 'd');
    g.rect(3, 14, 3, 7, 'd').rect(26, 14, 3, 7, 'd');
    g.rect(9, 14, 5, 5, 'o').rect(18, 14, 5, 5, 'o').rect(10, 15, 3, 3, 'c').rect(19, 15, 3, 3, 'c');
    g.rect(11, 22, 10, 2, 'o').line(13, 22, 13, 24, 'm').line(16, 22, 16, 24, 'm').line(19, 22, 19, 24, 'm');
  },
  gear: (g) => {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = (r: number, w: number) => [16 + c * r - s * w, 16 + s * r + c * w] as const;
      const [x1, y1] = px(9, -3.2);
      const [x2, y2] = px(15, -2.6);
      const [x3, y3] = px(15, 2.6);
      const [x4, y4] = px(9, 3.2);
      g.poly([x1, y1, x2, y2, x3, y3, x4, y4], 'm');
    }
    g.disc(16, 16, 10.5, 'm').disc(16, 16, 8.4, 'l').disc(16, 16, 4.6, 'o').disc(16, 16, 3.4, 'd');
  },
  speaker: (g) => {
    g.poly([3, 12, 10, 12, 18, 5, 18, 27, 10, 20, 3, 20], 'l').poly([3, 12, 10, 12, 10, 20, 3, 20], 'm');
    g.ring(18, 16, 6, 'y', 2, -0.95, 0.95).ring(18, 16, 10.5, 'y', 2, -0.95, 0.95).ring(18, 16, 15, 'y', 2, -0.85, 0.85);
  },
  next: (g) => {
    g.poly([4, 5, 16, 16, 4, 27, 4, 20, 9, 16, 4, 12], 'y').poly([16, 5, 28, 16, 16, 27, 16, 20, 21, 16, 16, 12], 'y');
  },
  pause: (g) => {
    g.rect(5, 4, 8, 24, 'y').rect(19, 4, 8, 24, 'y').rect(5, 4, 8, 3, 'w').rect(19, 4, 8, 3, 'w');
  },
  ffwd: (g) => {
    g.poly([3, 5, 15, 16, 3, 27], 'y').poly([15, 5, 27, 16, 15, 27], 'y').rect(27, 5, 3, 22, 'w');
  },
  freemp: (g) => {
    g.poly([16, 1, 26, 17, 26, 21, 16, 30, 6, 21, 6, 17], 'u').poly([16, 9, 22, 18, 20, 24, 12, 24, 10, 18], 'U');
    g.ring(12.5, 18.5, 3.2, 'w', 1.4).ring(19.5, 18.5, 3.2, 'w', 1.4);
  },

  // ---------- ortak: durumlar, yerdeki etkiler, istatistikler ----------
  drop: (g) => {
    g.poly([16, 1, 25, 16, 25, 22, 16, 30, 7, 22, 7, 16], 'r').poly([16, 10, 21, 18, 20, 25, 13, 25, 12, 18], 'R');
    g.rect(11, 18, 2, 4, 'w');
  },
  // Zehir: YEŞİL damla içinde kafatası + yan kabarcıklar (kanama damlasından, kırmızı 'drop', ayrışsın)
  poison: (g) => {
    g.poly([16, 1, 26, 15, 27, 23, 16, 31, 5, 23, 6, 15], 'g').poly([16, 1, 26, 15, 27, 23, 16, 31, 18, 22, 19, 12], 'G');
    g.disc(16, 17, 5.6, 'w').rect(13, 21, 6, 4, 'w').rect(13, 24, 6, 1, 'l');
    g.disc(13.8, 17, 1.7, 'o').disc(18.2, 17, 1.7, 'o').rect(15, 20, 2, 2, 'o');
    g.rect(9, 14, 2, 4, 'z').disc(27, 6, 2.4, 'g').disc(5, 8, 1.8, 'g');
  },
  flame: (g) => {
    flame(g, 16, 31, 30, 12, 'f', 'y', 'w');
    g.disc(11, 14, 1.4, 'r');
  },
  roar: (g) => {
    g.poly([2, 12, 10, 12, 22, 4, 22, 27, 10, 19, 2, 19], 'a').rect(0, 12, 4, 8, 'A').rect(15, 11, 2, 2, 'w');
    g.ring(24, 16, 5, 'w', 2, -1.1, 1.1).ring(24, 16, 9, 'w', 2, -1.1, 1.1);
  },
  bash: (g) => {
    shieldShape(g, 11, 3, 20, 24, 'a', 'A');
    g.rect(9, 7, 3, 16, 'z');
    g.line(24, 8, 30, 4, 'w', 2).line(24, 14, 31, 14, 'w', 2).line(24, 20, 30, 25, 'w', 2);
  },
  guardian: (g) => {
    g.poly([12, 2, 29, 2, 29, 16, 21, 25, 12, 16], 'l');
    shieldShape(g, 11, 10, 19, 21, 'a', 'z');
    g.rect(9, 14, 3, 12, 'a').rect(3, 18, 16, 3, 'a');
  },
  shield: (g) => {
    shieldShape(g, 16, 1, 27, 30, 'l', 'm');
    g.rect(14, 4, 4, 22, 'w').disc(9, 8, 1.4, 'w');
  },
  hourglass: (g) => {
    g.rect(4, 0, 24, 4, 'y').rect(4, 28, 24, 4, 'y').rect(4, 0, 24, 1, 'w');
    g.poly([6, 4, 26, 4, 26, 8, 18, 16, 26, 24, 26, 28, 6, 28, 6, 24, 14, 16, 6, 8], 'c');
    g.poly([9, 6, 23, 6, 16, 14], 'w').poly([16, 20, 23, 26, 9, 26], 'y');
    g.rect(15, 15, 2, 5, 'y');
  },
  boot: (g) => {
    g.poly([8, 2, 18, 2, 18, 17, 28, 21, 29, 28, 6, 28, 6, 18, 8, 18], 'b').rect(8, 2, 10, 4, 'n').rect(6, 25, 23, 3, 'k').rect(8, 8, 2, 10, 'k');
    g.line(0, 10, 6, 10, 'w', 2).line(0, 16, 4, 16, 'l', 2);
  },
  heart: (g) => {
    g.disc(10, 11, 7.6, 'r').disc(22, 11, 7.6, 'r').poly([3, 14, 29, 14, 16, 29], 'r');
    g.disc(8, 8, 2.6, 'w').rect(5, 14, 2, 4, 'R').rect(25, 14, 2, 4, 'R');
  },
  droplet: (g) => {
    g.poly([16, 1, 26, 19, 26, 23, 16, 30, 6, 23, 6, 19], 'u').poly([16, 10, 22, 20, 20, 25, 13, 25, 12, 20], 'U');
    g.rect(11, 18, 2, 5, 'w').rect(13, 24, 2, 2, 'c');
  },
  muscle: (g) => {
    g.rect(6, 10, 20, 17, 'n').rect(6, 10, 20, 4, 'y').rect(6, 25, 20, 2, 'Y');
    for (const x of [6, 12, 18]) g.rect(x, 5, 6, 7, 'n').rect(x, 5, 6, 2, 'y');
    g.rect(0, 16, 7, 8, 'n').rect(0, 16, 2, 8, 'Y').line(12, 16, 12, 23, 'Y').line(18, 16, 18, 23, 'Y');
  },
  wand: (g) => {
    g.line(3, 29, 18, 14, 'b', 3).line(4, 29, 19, 14, 'k', 1);
    g.poly([24, 0, 26, 6, 32, 8, 26, 10, 24, 17, 22, 10, 16, 8, 22, 6], 'y');
    g.rect(23, 7, 2, 2, 'w');
    sparkle(g, 7, 9, 3, 'c');
    sparkle(g, 28, 24, 3, 'c');
    g.rect(12, 3, 2, 2, 'c');
  },
  feather: (g) => {
    g.poly([2, 29, 6, 15, 20, 2, 30, 2, 28, 16, 16, 26], 'g');
    g.poly([2, 29, 6, 15, 20, 2, 12, 15], 'z');
    g.line(4, 29, 27, 6, 'w', 2);
    g.line(10, 19, 18, 21, 'G').line(15, 12, 23, 14, 'G').line(12, 25, 16, 23, 'G');
  },
  clover: (g) => {
    g.disc(10, 9, 6, 'g').disc(22, 9, 6, 'g').disc(10, 20, 6, 'g').disc(22, 20, 6, 'g');
    g.disc(8, 6.5, 2, 'w').disc(20, 6.5, 2, 'w').line(16, 16, 22, 31, 'G', 2).rect(14, 14, 4, 4, 'G');
  },
  burst: (g) => {
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16;
      const [tx, ty] = polar(16, 16, i % 2 ? 11 : 15.5, a);
      const [b1x, b1y] = polar(16, 16, 6, a + 0.28);
      const [b2x, b2y] = polar(16, 16, 6, a - 0.28);
      g.poly([tx, ty, b1x, b1y, b2x, b2y], 'y');
    }
    orb(g, 16, 16, 6, 'y');
    g.disc(16, 16, 3, 'w');
  },
  blast: (g) => {
    g.poly([16, 0, 20, 10, 31, 8, 23, 16, 31, 25, 19, 22, 16, 31, 12, 22, 1, 26, 9, 16, 1, 6, 12, 10], 'f');
    g.poly([16, 8, 20, 14, 16, 23, 12, 14], 'y').disc(16, 15, 3, 'w');
  },
  rune: (g) => {
    g.poly([16, 0, 28, 16, 16, 31, 4, 16], 'p').poly([16, 4, 24, 16, 16, 27, 8, 16], 'P');
    g.line(16, 8, 16, 23, 'c', 2).line(10, 12, 16, 17, 'c', 2).line(22, 12, 16, 17, 'c', 2);
  },
  finger: (g) => {
    // çelik eldiven, orta parmak havada (Taunt)
    g.poly([8, 29, 8, 26, 24, 26, 24, 29], 'd').poly([7, 31, 9, 26, 23, 26, 25, 31], 'd').rect(8, 27, 16, 1.5, 'Y').rect(10, 29, 12, 1, 'k');
    g.disc(11, 28.5, 0.9, 'y').disc(21, 28.5, 0.9, 'y');
    g.poly([6, 19, 8, 15, 24, 15, 26, 19, 25, 26, 7, 26], 'm').poly([6, 19, 8, 15, 13, 15, 11, 26, 7, 26], 'l');
    g.rect(14.5, 2, 6.2, 15, 'm').rect(14.5, 2, 2, 15, 'l').rect(18.7, 2, 2, 15, 'd');
    g.disc(17.6, 3.6, 3.1, 'm').disc(16.6, 3, 1.4, 'w').rect(14.5, 6.5, 6.2, 0.9, 'd').rect(14.5, 10.5, 6.2, 0.9, 'd').rect(14.5, 14, 6.2, 0.9, 'd');
    for (const [x, y] of [[10, 17.5], [23, 17.5]] as const) g.disc(x, y, 2.4, 'l').disc(x + 0.5, y + 0.7, 1.3, 'm');
    g.poly([5, 23, 8, 19, 10, 26, 7, 28], 'm').poly([5, 23, 8, 19, 8, 23, 6, 25], 'l');
    g.line(11, 22, 22, 22, 'd', 1).line(11, 24.5, 22, 24.5, 'd', 1);
  },
};

