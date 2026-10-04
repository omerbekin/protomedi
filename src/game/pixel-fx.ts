import { crystal, sparkle, type Draw, type PxGrid } from './pixel-art';

/** Efekt (VFX) sprite'ları (32x32): ikon olmayan, animasyonlarda kullanılan çizimler. Aynı jetonlar, aynı araçlar. */
export const PIXEL_FX: Record<string, Draw> = {
  shard: (g) => {
    crystal(g, 16, 16, 14, 31, 'c', 'u');
    g.line(13, 8, 14, 22, 'w');
  },
  leafbit: (g) => {
    g.poly([5, 24, 8, 12, 17, 6, 26, 6, 26, 16, 17, 24], 'G').poly([5, 24, 8, 12, 17, 6, 26, 6, 14, 18], 'g');
    g.line(7, 23, 24, 8, 'w', 1);
  },
  plume: (g) => {
    g.poly([5, 28, 9, 14, 22, 2, 29, 4, 27, 16, 14, 26], 'w').poly([5, 28, 9, 14, 22, 2, 15, 14], 'l');
    g.line(7, 27, 26, 6, 'y', 2);
    g.line(12, 20, 20, 21, 'y').line(16, 13, 24, 14, 'y');
  },
  rock: (g) => {
    g.poly([6, 22, 3, 12, 11, 6, 22, 8, 28, 18, 21, 27], 'd').poly([7, 20, 5, 13, 11, 8, 17, 9, 12, 18], 'm');
    g.rect(9, 10, 3, 2, 'l').line(14, 22, 22, 17, 'o');
  },
  ember: (g) => {
    g.disc(16, 16, 9, 'r').disc(16, 16, 7, 'f').disc(16, 16, 4.6, 'y').disc(14.5, 14.5, 2, 'w');
  },
  flake: (g) => {
    g.rect(14, 3, 4, 26, 'c').rect(3, 14, 26, 4, 'c').rect(14, 14, 4, 4, 'w');
    g.line(7, 7, 25, 25, 'c', 2).line(25, 7, 7, 25, 'c', 2).disc(16, 16, 3, 'w');
  },
  splinter: (g) => {
    g.line(5, 27, 25, 5, 'n', 3).line(6, 28, 26, 6, 'b', 1);
    g.poly([25, 5, 29, 2, 27, 8], 'k');
  },
  exclaim: (g) => {
    g.poly([9, 2, 23, 2, 20, 20, 12, 20], 'r').poly([9, 2, 23, 2, 22, 8, 10, 8], 'f');
    g.rect(11, 24, 10, 7, 'r').rect(11, 24, 4, 7, 'f');
  },
  spark: (g) => {
    sparkle(g, 16, 16, 15, 'y');
    sparkle(g, 16, 16, 9, 'w');
  },
  wisp: (g) => {
    g.poly([16, 0, 23, 12, 23, 20, 16, 31, 9, 20, 9, 12], 'p').poly([16, 8, 19, 16, 16, 24, 13, 16], 'c');
  },
  // Mezardan uzanan çürümüş el: açık (uzanır) ve kıvrık (pençe) kare
  undeadhand: (g) => {
    undeadHand(g, false);
  },
  undeadhand2: (g) => {
    undeadHand(g, true);
  },
  runering: (g) => {
    g.ring(16, 16, 15.5, 'a', 2).ring(16, 16, 11, 'z', 1).ring(16, 16, 8, 'a', 1);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.rect(16 + Math.cos(a) * 13.3 - 1, 16 + Math.sin(a) * 13.3 - 1, 2, 2, 'w');
      g.rect(16 + Math.cos(a + Math.PI / 12) * 9.6 - 1, 16 + Math.sin(a + Math.PI / 12) * 9.6 - 1, 2, 2, 'A');
    }
  },
  circle: (g) => {
    g.ring(16, 16, 15.5, 'a', 2).ring(16, 16, 12, 'z', 1);
    for (let k = 0; k < 5; k++) {
      const a0 = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
      const a1 = -Math.PI / 2 + ((k + 1) * 4 * Math.PI) / 5;
      g.line(16 + Math.cos(a0) * 12, 16 + Math.sin(a0) * 12, 16 + Math.cos(a1) * 12, 16 + Math.sin(a1) * 12, 'a', 1);
    }
    g.disc(16, 16, 2, 'w');
  },
  // Meteor gövdesi (sağa doğru gider, kuyruk solda); iki kare alev titremesi için
  meteorbody: (g) => {
    meteorBody(g, 0);
  },
  meteorbody2: (g) => {
    meteorBody(g, 1);
  },
  axe: (g) => {
    // tek ağızlı savaş baltası (yukarı bakar)
    g.rect(14.5, 8, 3, 23, 'b').rect(14.5, 8, 1, 23, 'n').rect(17, 8, 1, 23, 'k');
    g.poly([17, 3, 29, 5, 30, 17, 17, 16], 'm').poly([17, 3, 29, 5, 24, 9, 17, 9], 'l').poly([17, 14, 30, 17, 24, 13, 17, 12], 'd');
    g.line(27, 6, 28, 16, 'w', 1);
    g.disc(16, 30, 1.6, 'y');
  },
  smoke: (g) => {
    g.disc(16, 16, 11, 'd').disc(13, 13, 7, 'm');
  },
  dust: (g) => {
    g.disc(16, 16, 10, 'm').disc(13, 13, 6, 'l');
  },
};

/** Meteor gövdesi: kızgın kaya + alevli halo + sola uzanan katmanlı kuyruk; `frame` kuyruk dillerini oynatır. */
function meteorBody(g: PxGrid, frame: number): void {
  const j = frame ? 1 : 0;
  g.poly([0, 16, 6, 9 - j, 12, 6, 21, 4, 21, 28, 12, 26, 6, 23 + j], 'R');
  g.poly([2, 16, 8, 11 + j, 13, 8, 21, 7, 21, 25, 13, 24, 8, 21 - j], 'r');
  g.poly([6, 16 - j, 11, 12, 15, 10, 21, 10, 21, 22, 15, 21, 11, 20 + j], 'f');
  g.poly([11, 16, 15, 13, 21, 13, 21, 19, 15, 19], 'y');
  g.disc(21, 16, 12, 'r').disc(21.5, 16, 10.8, 'f');
  g.disc(21.5, 16, 9.3, 'k').disc(20.5, 15, 7.4, 'b').disc(19, 13.5, 4.2, 'n').disc(18, 12.5, 1.6, 'w');
  g.disc(24.5, 19.5, 2.8, 'k').disc(17, 20, 1.9, 'k').disc(23, 11, 1.5, 'k');
  g.line(15, 22, 21, 25, 'f', 1).line(21, 25, 27, 20, 'y', 1).line(13, 18, 17, 22, 'f', 1).line(26, 12, 28, 16, 'f', 1);
  g.line(21, 9, 24, 13, 'f', 1).line(24, 13, 22, 17, 'y', 1);
  g.rect(1, 13 - j * 2, 2, 2, 'y').rect(4, 20, 2, 2, 'f');
}

/** Çürümüş el: dikey kol (altı yere gömülü), avuç, 5 parmak; `curl` doluysa parmaklar pençe gibi kıvrılır. */
function undeadHand(g: PxGrid, curl: boolean): void {
  g.poly([11, 31, 12.5, 17, 19.5, 17, 21, 31], 'S').poly([11, 31, 12.5, 17, 15.5, 17, 14.5, 31], 's');
  g.poly([13, 31, 14.5, 18, 16, 18, 15, 31], 'G').rect(17.5, 22, 2, 5, 'G');
  g.line(16.5, 18, 16, 27, 'e', 1).rect(16, 24, 2, 1, 'w');
  g.poly([10, 31, 21.5, 31, 21.5, 28, 17, 25, 10, 28], 'k');
  g.poly([11, 19, 11.5, 11.5, 20.5, 11.5, 21, 19], 's').poly([11, 19, 11.5, 12, 14.5, 12, 13.5, 19], 'g').rect(17, 14, 3, 3, 'S');
  const fingers: Array<[number, number, number, number]> = [[12.5, 12, -100, 10.5], [15.5, 11.5, -90, 12.5], [18.5, 12, -80, 11], [20.5, 13.5, -62, 8], [11, 16, -152, 7.5]];
  for (const [bx, by, deg, len] of fingers) {
    const a = (deg * Math.PI) / 180;
    if (!curl) {
      const ex = bx + Math.cos(a) * len;
      const ey = by + Math.sin(a) * len;
      g.line(bx, by, ex, ey, 's', 2.4).line(bx + 0.5, by, ex + 0.5, ey, 'g', 1);
      g.disc(ex, ey, 1.2, 'e').set(ex, ey - 1, 'k');
    } else {
      const mx = bx + Math.cos(a) * len * 0.55;
      const my = by + Math.sin(a) * len * 0.55;
      const a2 = a + (bx < 16 ? 1.25 : -1.25);
      const ex = mx + Math.cos(a2) * len * 0.5;
      const ey = my + Math.sin(a2) * len * 0.5;
      g.line(bx, by, mx, my, 's', 2.4).line(mx, my, ex, ey, 's', 2.2);
      g.disc(ex, ey, 1.2, 'e').set(ex, ey + 0.5, 'k');
    }
  }
  g.rect(13, 26, 1, 1, 'R').rect(18, 20, 1, 2, 'R').rect(14, 14, 2, 1, 'R');
}
