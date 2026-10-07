/**
 * Anti-Mage - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/antimage/idle.png): kapüşonlu, koyu örgü zırh + çelik plaka, mürdüm (bordo-mor) kuşak,
 * mor rünlü düz kılıç, kaldırdığı çelik eldivenin çevresinde süzülen KIRIK RÜN TABLETLERİ. Felsefe: büyücü değil, büyü avcısı;
 * büyüyü kırar, düşmanın MAVİ manasını söküp kendi MOR boşluğuna çevirir. Görsel dil: çelik + mor rün, kırık tabletler,
 * mavi mana (karşı tarafın) -> mor (onun).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): nullsphere, overflow, manaburn, drainfield, spellward, voidstrike
 */
import type { V2SpriteEntry } from '../types';
import { shieldShape, type PxGrid } from '../../pixel-art';

/** Rün tableti (sprite'taki eldivenin çevresindeki kırık parçalar): merkez, yarı boy, açı, renk. */
function tablet(g: PxGrid, cx: number, cy: number, w: number, h: number, ang: number, body = 'p', rune = 'w'): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (x: number, y: number): [number, number] => [cx + x * c - y * s, cy + x * s + y * c];
  const pts = [P(-w, -h), P(w * 0.7, -h), P(w, -h * 0.4), P(w, h), P(-w * 0.6, h), P(-w, h * 0.5)].flat();
  g.poly(pts, body);
  const [ax, ay] = P(0, -h * 0.55);
  const [bx, by] = P(0, h * 0.55);
  g.line(ax, ay, bx, by, rune, Math.min(w, h) * 0.32);
}

/** Rünlü düz kılıç (sprite'taki gibi): kabza (x0,y0) -> uç (x1,y1). */
function runeSword(g: PxGrid, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const nx = -dy;
  const ny = dx;
  const h = w / 2;
  const tx = x1 - dx * w * 1.6;
  const ty = y1 - dy * w * 1.6;
  g.poly([x0 + nx * h, y0 + ny * h, tx + nx * h, ty + ny * h, x1, y1, tx - nx * h, ty - ny * h, x0 - nx * h, y0 - ny * h], 'm');
  g.poly([x0 + nx * h, y0 + ny * h, tx + nx * h, ty + ny * h, x1, y1, x0, y0], 'l');
  // mor rünler (oluk boyunca)
  for (let k = 0.18; k < 0.8; k += 0.17) {
    const px = x0 + (x1 - x0) * k;
    const py = y0 + (y1 - y0) * k;
    g.line(px - dx * 0.7, py - dy * 0.7, px + dx * 0.7, py + dy * 0.7, 'p', 0.6);
    g.set(px + nx * 0.25 - 0.1, py + ny * 0.25 - 0.1, 'a');
  }
  // haç siper, kabza, topuz
  g.line(x0 + nx * w * 1.5, y0 + ny * w * 1.5, x0 - nx * w * 1.5, y0 - ny * w * 1.5, 'Y', 1.1);
  g.line(x0, y0, x0 - dx * 4.5, y0 - dy * 4.5, 'k', 1.2);
  g.disc(x0 - dx * 5.3, y0 - dy * 5.3, 1.2, 'Y');
}

export const ICONS: Record<string, V2SpriteEntry> = {
  /** Mana Steal: mor rünlü kılıç, ucundaki MAVİ mana küresini deler; kürenin manası kılıca doğru damlalar hâlinde akar. */
  manaburn: (g) => {
    // mavi mana küresi (delinmiş, çatlak)
    g.disc(22, 10, 8.2, 'U');
    g.disc(22, 10, 6.9, 'u');
    g.disc(20.2, 8.2, 2.6, 'c');
    g.line(18, 14.5, 21.5, 10.5, 'w', 0.6);
    g.line(25.5, 4.5, 23.5, 8.5, 'w', 0.6);
    runeSword(g, 8, 24, 29.5, 2.5, 4);
    // kılıca doğru akan mana damlaları (mavi -> mor)
    const drop = (x: number, y: number, r: number, t: string) => {
      g.poly([x - r * 0.9, y - r * 0.3, x + r * 1.9, y - r * 2.2, x + r * 0.3, y + r * 0.9], t);
      g.disc(x, y, r, t);
    };
    drop(17, 21.5, 2, 'u');
    drop(12.5, 26, 1.8, 'p');
    drop(21.5, 19.5, 1.4, 'c');
    g.disc(4.5, 27.5, 2.6, 'a');
    g.disc(4.5, 27.5, 1.3, 'z');
  },

  /** Drain Field: yere işlenmiş 3x3 rün mührü (eğik ızgara), ortasında boşluk ağzı; yukarıdan mavi mana zerreleri içine çekilir. */
  drainfield: (g) => {
    // eğik eşkenar dörtgen alan (3x3)
    const T = [16, 13.5];
    const R = [31, 21.5];
    const B = [16, 29.5];
    const L = [1, 21.5];
    g.poly([...T, ...R, ...B, ...L], 'P');
    // ızgara çizgileri
    const lerp = (a: number[], b: number[], k: number) => [a[0]! + (b[0]! - a[0]!) * k, a[1]! + (b[1]! - a[1]!) * k];
    for (const k of [1 / 3, 2 / 3]) {
      const [a1, a2] = lerp(T, R, k);
      const [b1, b2] = lerp(L, B, k);
      g.line(a1!, a2!, b1!, b2!, 'a', 0.6);
      const [c1, c2] = lerp(T, L, k);
      const [d1, d2] = lerp(R, B, k);
      g.line(c1!, c2!, d1!, d2!, 'a', 0.6);
    }
    // dış kenar parlaklığı
    g.line(L[0]!, L[1]!, T[0]!, T[1]!, 'z', 0.6);
    g.line(T[0]!, T[1]!, R[0]!, R[1]!, 'z', 0.6);
    // orta hücrede boşluk girdabı
    g.ellipse(16, 21.5, 4.6, 2.5, 'o');
    g.ring(16, 21.5, 4.6, 'z', 0.5, Math.PI * 0.9, Math.PI * 1.9);
    g.ring(16.6, 21.3, 2.6, 'a', 0.5, Math.PI * -0.1, Math.PI * 0.9);
    // çekilen mavi mana damlaları (aşağı bakan uç, arkada kısa kuyruk)
    const mote = (x: number, y: number, ang: number, r: number) => {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      g.line(x - dx * r * 3.2, y - dy * r * 3.2, x, y, 'U', r * 0.8);
      g.poly([x - dy * r, y + dx * r, x + dx * r * 1.8, y + dy * r * 1.8, x + dy * r, y - dx * r], 'u');
      g.disc(x, y, r, 'u');
      g.disc(x - dx * 0.3, y - dy * 0.3, r * 0.5, 'c');
    };
    mote(9.5, 7.5, 1.2, 1.9);
    mote(22.5, 7, 1.95, 1.9);
    mote(16, 4.5, Math.PI / 2, 2.2);
  },

  /** Spell Ward: mor altıgen büyü kalkanı, ortasında büyü-kıran rün; çevresinde dışa dikenli kırık rün tabletleri (saldıranı cezalandırır). */
  spellward: (g) => {
    // dışa bakan küçük dikenler (misilleme)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = 16 + Math.cos(a) * 14.6;
      const y = 16.5 + Math.sin(a) * 14.6;
      g.poly([16 + Math.cos(a - 0.12) * 11.5, 16.5 + Math.sin(a - 0.12) * 11.5, x, y, 16 + Math.cos(a + 0.12) * 11.5, 16.5 + Math.sin(a + 0.12) * 11.5], 'z');
    }
    // altıgen bariyer
    const hexPts = (r: number) => Array.from({ length: 6 }, (_, i) => [16 + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * r, 16.5 + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * r]).flat();
    g.poly(hexPts(10.5), 'P');
    g.poly(hexPts(8.5), 'a');
    g.poly(hexPts(6.3), 'P');
    // büyü kıran rün: daire + çapraz çizgi
    g.ring(16, 16.5, 4.2, 'z', 1);
    g.line(12.5, 20, 19.5, 13, 'w', 1);
    // çevrede kırık tabletler (sprite'taki eldivenin halkası)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6;
      tablet(g, 16 + Math.cos(a) * 12.4, 16.5 + Math.sin(a) * 12.4, 1.5, 2.4, a + Math.PI / 2, 'l', 'p');
    }
  },

  /** Void Strike: kara boşluk tekilliği; sekiz mor iğne ve mavi mana damlaları merkeze çöker (kayıp mana kadar güçlü). */
  voidstrike: (g) => {
    // içe çöken iğneler
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const ox = 16 + Math.cos(a) * 15;
      const oy = 16 + Math.sin(a) * 15;
      const ix = 16 + Math.cos(a) * 6.8;
      const iy = 16 + Math.sin(a) * 6.8;
      const nx = -Math.sin(a) * 1.4;
      const ny = Math.cos(a) * 1.4;
      g.poly([ox + nx, oy + ny, ix, iy, ox - nx, oy - ny], i % 2 ? 'a' : 'p');
      g.line(ox, oy, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 'z', 0.4);
    }
    // mavi mana damlaları (dört ana yönde, içe akan)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.disc(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 1.5, 'u');
      g.disc(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 0.7, 'c');
    }
    // tekillik: kızgın halka + kara çekirdek
    g.disc(16, 16, 6.6, 'z');
    g.disc(16, 16, 5.6, 'a');
    g.disc(16, 16, 4.4, 'o');
    g.ring(16, 16, 5.6, 'w', 0.5, Math.PI * 1.1, Math.PI * 1.5);
  },

  /** Logo: büyüyü kıran kılıç: dik rünlü kılıç, kırılarak dağılan mor rün halkasının içinden geçer. */
  nullsphere: (g) => {
    // kırık rün halkası (dört parça, aralıklı)
    for (let i = 0; i < 4; i++) g.ring(16, 15, 11.5, 'a', 2.4, (i / 4) * Math.PI * 2 + 0.28, ((i + 1) / 4) * Math.PI * 2 - 0.28);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.disc(16 + Math.cos(a) * 10.3, 15 + Math.sin(a) * 10.3, 0.7, 'z');
    }
    // kopan parçalar
    tablet(g, 27.5, 4, 1.4, 2, 0.6, 'a', 'z');
    tablet(g, 4, 26, 1.3, 1.8, -0.4, 'a', 'z');
    runeSword(g, 16, 25, 16, 1, 4.6);
  },

  /** Mana Overflow (pasif): büyü zırhı plakası (çelik kalkan, mor rün) büyüyü emer; tepesinden takıma taşan mavi mana. */
  overflow: (g) => {
    // taşan mana (kalkanın üstünde kabaran yüzey + yükselen damlalar)
    g.ellipse(16, 12, 9, 3, 'u');
    g.ellipse(16, 11.6, 7, 2, 'c');
    for (const [x, y, r] of [[9, 6, 1.7], [16, 3.5, 2.1], [23, 6, 1.7]] as Array<[number, number, number]>) {
      g.disc(x, y, r, 'u');
      g.poly([x - r * 0.8, y + r * 0.3, x, y - r * 2.4, x + r * 0.8, y + r * 0.3], 'u');
      g.disc(x - r * 0.3, y - r * 0.2, r * 0.4, 'w');
    }
    shieldShape(g, 16, 12, 20, 19, 'm', 'd');
    g.line(8, 14.2, 24, 14.2, 'l', 0.6);
    // mor rün (büyü kıran) kalkan ortasında
    g.ring(16, 20.5, 3.6, 'a', 0.9);
    g.line(13.2, 23.4, 18.8, 17.6, 'z', 0.8);
    // emilen mor oklar (yanlardan çarpan büyü)
    g.poly([1, 18, 5.5, 16.5, 5, 20], 'a');
    g.poly([31, 22, 26.5, 20.5, 27, 24], 'a');
  },
};

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Rün tableti (efekt parçası): açık çelik-mor, ortasında rün. */
  tablet: { size: 64, draw: (g) => tablet(g, 16, 16, 9, 13, 0, 'z', 'P') },
  /** Kırık tablet parçası. */
  shard: { size: 64, draw: (g) => {
    g.poly([6, 6, 22, 3, 27, 14, 12, 27], 'z');
    g.poly([6, 6, 22, 3, 14, 12], 'w');
    g.line(12, 18, 19, 10, 'P', 2);
  } },
  /** Mavi mana damlası (düşmanın manası). */
  bluedrop: { size: 64, draw: (g) => {
    g.poly([16, 2, 24, 17, 16, 30, 8, 17], 'u');
    g.disc(16, 20, 8, 'u');
    g.disc(16, 21, 5, 'c');
    g.disc(13.5, 18, 2, 'w');
  } },
  /** Mor boşluk iğnesi (yukarı bakar). */
  needle: { size: 96, draw: (g) => {
    g.poly([16, 1, 19.5, 20, 16, 31, 12.5, 20], 'P');
    g.poly([16, 1, 16, 31, 12.5, 20], 'p');
    g.line(15, 6, 15, 20, 'z', 0.8);
  } },
  /** Rünlü kılıç (efekt: savuruş hayaleti), yatay sağa bakar. */
  blade: { size: 128, draw: (g) => runeSword(g, 7, 16, 31, 16, 3) },
};
