/**
 * Archer - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/archer/idle.png): yeşil kukuletalı korucu, sade ahşap UZUN YAY (pirinç kavrama halkası),
 * sırtta beyaz-kahve tüylü oklarla dolu sadak, deri kolluk/kemer. Silahı tek: yay ve ok. Bu yüzden tüm ikonlar ok/yayın kendisinden
 * ve okun yaptığı işten (hız, delip geçme, gökten yağma, zırh kırma, uzak menzil) kurulur; büyü ışığı yok, malzeme gerçek:
 * ahşap gövde ('n' açık meşe, 'b' kahve), çelik uç ('l'/'m'), tüy ('w' beyaz + 'a' vurgu), sicim/deri ('k').
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): bow (logo), sharp (pasif Sharpshooter), arrow (Quick Shot), pierce (Piercing Arrow),
 * arrows (Arrow Rain), aimedshot (Aimed Shot).
 * SPRITES: v2 efektlerinin (vfx.ts) ok, kıymık, zırh parçası çizimleri.
 */
import type { V2SpriteEntry } from '../types';
import type { PxGrid } from '../../pixel-art';

type P = [number, number];

/** Okun kendisi: kuyruk (x0,y0) -> uç (x1,y1). Gövde, geniş çelik uç, sicim bağı, üç tüy, gez. */
function arrow(g: PxGrid, x0: number, y0: number, x1: number, y1: number, o: { sw?: number; hl?: number; hw?: number; fl?: number; fw?: number; vane?: [string, string]; head?: [string, string] } = {}): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const nx = -dy;
  const ny = dx;
  const sw = o.sw ?? 1.2; // gövde kalınlığı
  const hl = o.hl ?? 4.6; // uç boyu
  const hw = o.hw ?? 2.1; // uç yarı genişliği
  const fl = o.fl ?? 6; // tüy boyu
  const fw = o.fw ?? 1.9; // tüy genişliği
  const [v1, v2] = o.vane ?? ['w', 'a'];
  const [h1, h2] = o.head ?? ['l', 'm'];
  const at = (k: number, side = 0): P => [x0 + dx * k + nx * side, y0 + dy * k + ny * side];
  // tüyler (gövdenin iki yanında; arkası kesik, önü inceltilmiş)
  const f0 = 0.9;
  const f1 = f0 + fl;
  for (const [s, c] of [[1, v1], [-1, v2]] as Array<[number, string]>) {
    const a = at(f0, s * fw);
    const b = at(f0 + fl * 0.35, s * fw * 1.05);
    const e = at(f1, s * 0.35);
    const r = at(f1 - 0.5, 0);
    const q = at(f0, 0);
    g.poly([q[0], q[1], a[0], a[1], b[0], b[1], e[0], e[1], r[0], r[1]], c);
    // tüy dikişi (barbs): ince koyu çizgiler
    for (let k = 1; k < 4; k++) {
      const m0 = at(f0 + (fl * k) / 4.5, s * 0.3);
      const m1 = at(f0 + (fl * k) / 4.5 - 0.9, s * fw * 0.85);
      g.line(m0[0], m0[1], m1[0], m1[1], c === 'w' ? 'l' : 'A', 0.25);
    }
  }
  // gövde
  const s0 = at(0.2);
  const s1 = at(len - hl * 0.7);
  g.line(s0[0], s0[1], s1[0], s1[1], 'n', sw);
  const g0 = at(f1 + 0.4, sw * 0.32);
  const g1 = at(len - hl * 0.9, sw * 0.32);
  g.line(g0[0], g0[1], g1[0], g1[1], 'b', Math.max(0.25, sw * 0.28)); // ahşap damarı
  // gez (nock) ve tüy bağı
  const nk = at(0);
  g.line(nk[0], nk[1], at(0.9)[0], at(0.9)[1], 'k', sw * 1.1);
  const tb = at(f1 + 0.1);
  g.line(tb[0], tb[1], at(f1 + 0.8)[0], at(f1 + 0.8)[1], 'k', sw * 1.15);
  // uç bağı ve geniş uç
  const hb = at(len - hl - 0.7);
  g.line(hb[0], hb[1], at(len - hl + 0.1)[0], at(len - hl + 0.1)[1], 'k', sw * 1.25);
  const tip = at(len);
  const bl = at(len - hl, hw);
  const br = at(len - hl, -hw);
  const notch = at(len - hl * 0.72);
  g.poly([tip[0], tip[1], bl[0], bl[1], notch[0], notch[1], br[0], br[1]], h2);
  g.poly([tip[0], tip[1], bl[0], bl[1], notch[0], notch[1]], h1);
  const ridge0 = at(len - hl * 0.7);
  g.line(ridge0[0], ridge0[1], at(len - 0.6)[0], at(len - 0.6)[1], 'w', 0.25);
}

/** Dönüşümlü çizim: (x,y)'yi merkez etrafında açı + ölçekle çevirir. */
const xf = (cx: number, cy: number, ang: number, s = 1) => (x: number, y: number): P => {
  const dx = (x - cx) * s;
  const dy = (y - cy) * s;
  return [cx + dx * Math.cos(ang) - dy * Math.sin(ang), cy + dx * Math.sin(ang) + dy * Math.cos(ang)];
};

/** İkinci dereceden Bézier boyunca kalınlığı değişen çizgi (yay kolu). */
function limb(g: PxGrid, p0: P, p1: P, p2: P, w0: number, w1: number, t: string, steps = 26): void {
  const pt = (u: number): P => [(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
  for (let i = 0; i < steps; i++) {
    const a = pt(i / steps);
    const b = pt((i + 1) / steps);
    const u = (i + 0.5) / steps;
    const w = w0 + (w1 - w0) * (1 - Math.abs(u - 0.5) * 2); // ortada (kavrama) kalın
    g.line(a[0], a[1], b[0], b[1], t, w);
  }
}

export const ICONS: Record<string, V2SpriteEntry> = {
  /**
   * LOGO (bow): tam gerilmiş uzun yay + gezde ok, çapraz (ok sağ üste bakar). Sprite'taki gibi sade ahşap kol, pirinç halkalı deri kavrama.
   * 15-26 px'te de okunsun diye kol kalın, ok tek ve uzun.
   */
  bow: (g) => {
    const T = xf(16, 16, -Math.PI / 4, 0.9);
    const L = (x0: number, y0: number, x1: number, y1: number, t: string, w: number) => {
      const a = T(x0, y0);
      const b = T(x1, y1);
      g.line(a[0], a[1], b[0], b[1], t, w * 0.9);
    };
    // kiriş: uçlardan gerilmiş gez noktasına
    L(9, 3, 4.5, 16, 'e', 0.75);
    L(9, 29, 4.5, 16, 'e', 0.75);
    // yay kolları (Bézier): kavramada kalın, uçlara incelir
    limb(g, T(9, 3), T(25, 16), T(9, 29), 1.5, 3.0, 'b');
    limb(g, T(9.6, 3.6), T(24, 16), T(9.6, 28.4), 0.25, 0.9, 'n'); // kolun iç yüzü (açık ahşap)
    // recurve uçlar
    L(9, 3, 11.2, 1.6, 'b', 1.4);
    L(9, 29, 11.2, 30.4, 'b', 1.4);
    // ok (gezden uca)
    const a = T(4.5, 16);
    const b = T(30, 16);
    arrow(g, a[0], a[1], b[0], b[1], { sw: 1.3, hl: 4.4, hw: 2.2, fl: 5.2, fw: 1.9, vane: ['w', 'a'] });
    // deri kavrama + pirinç halkalar (sprite'taki gibi)
    L(16.2, 13.6, 16.2, 18.4, 'k', 2.9);
    L(16.2, 13.4, 16.2, 13.9, 'y', 3.1);
    L(16.2, 18.1, 16.2, 18.6, 'y', 3.1);
  },

  /**
   * PASİF Sharpshooter (uzak sıradaki hedefe daha çok hasar): uzak bir saman hedefin tam ortasına saplanmış ok; ok yolunun altında
   * üç mesafe kazığı, uzaklaştıkça boyu ve parlaklığı artıyor (mesafe = hasar). Hedef yeşil vurgu halkalı.
   */
  sharp: (g) => {
    // mesafe kazıkları (yakından uzağa: kısa/sönük -> uzun/parlak)
    const posts: Array<[number, number, string, string]> = [
      [6, 3.2, 'd', 'm'],
      [12.5, 5.2, 'A', 'a'],
      [19, 7.4, 'a', 'z'],
    ];
    for (const [x, h, c, top] of posts) {
      g.rect(x - 0.9, 30 - h, 1.8, h, c);
      g.rect(x - 0.9, 30 - h, 1.8, 0.75, top);
    }
    g.rect(2, 29.6, 21, 1, 'k'); // zemin çizgisi
    // ok yolunun kesik izi
    for (let i = 0; i < 5; i++) {
      const u = i / 5;
      const x = 3 + u * 13;
      const y = 25 - u * 11.5;
      g.line(x, y, x + 1.3, y - 1.15, i < 2 ? 'm' : 'l', 0.5);
    }
    // saman hedef (sağ üst): kenar + halkalar
    g.disc(23.5, 9.5, 7.6, 'b');
    g.disc(23.5, 9.5, 6.8, 'n');
    g.ring(23.5, 9.5, 6.4, 'Y', 0.5);
    g.disc(23.5, 9.5, 4.9, 'a');
    g.disc(23.5, 9.5, 3.4, 'w');
    g.disc(23.5, 9.5, 1.9, 'r');
    g.disc(23.2, 9.2, 0.6, 'w');
    // saman lifleri
    for (const [x, y] of [[17.8, 7.5], [18.2, 12.2], [28.6, 6.4], [28.8, 12.5], [21.4, 15.6], [25.6, 3.2]] as P[]) g.line(x, y, x + 0.75, y + 0.5, 'Y', 0.25);
    // tam ortaya saplanmış ok (ucu hedefte gömülü)
    arrow(g, 9.4, 21.6, 23.2, 9.8, { sw: 1.15, hl: 1.2, hw: 0.6, fl: 4.8, fw: 1.8 });
    g.disc(23.4, 9.6, 0.75, 'k');
  },

  /**
   * QUICK SHOT (tek hedef + kendine Haste): tek ok, sağ üste çok hızlı uçuyor; arkasında üç hava çizgisi ve tüylerin iki silik
   * art görüntüsü (çabukluk/Haste). Ucunda küçük hava kıvılcımı.
   */
  arrow: (g) => {
    // hava çizgileri (hız)
    const streak = (x0: number, y0: number, l: number, t: string, w = 0.6) => g.line(x0, y0, x0 + l, y0 - l, t, w);
    streak(2.2, 22.2, 7, 'm', 0.5);
    streak(5.5, 28.5, 8.5, 'l', 0.6);
    streak(9.2, 29.6, 5.5, 'm', 0.5);
    streak(1.2, 17.5, 4.2, 'd', 0.5);
    // tüylerin art görüntüleri (Haste)
    arrow(g, 1.6, 30.4, 6.2, 25.8, { sw: 0.5, hl: 0.1, hw: 0.1, fl: 4, fw: 1.4, vane: ['d', 'd'] });
    arrow(g, 3.4, 28.6, 8, 24, { sw: 0.5, hl: 0.1, hw: 0.1, fl: 4, fw: 1.6, vane: ['m', 'A'] });
    // ok
    arrow(g, 5.2, 26.8, 28.6, 3.4, { sw: 1.9, hl: 5.6, hw: 2.7, fl: 6.8, fw: 2.5, vane: ['w', 'a'] });
    // uçta hava yırtılması
    g.line(29.2, 1.6, 30.8, 0.6, 'w', 0.5).line(30.2, 3.8, 31.4, 3.6, 'w', 0.5).line(26.8, 1.2, 27.4, 0.2, 'l', 0.5);
  },

  /**
   * PIERCING ARROW (sütun, önden arkaya delip geçer, her delişte güç kaybı): ağır ok iki kalın ahşap kalkanı arka arkaya delip
   * çıkıyor; her kalkanın çıkış yüzünden kıymıklar saçılıyor, ikincide daha az (falloff). Ok ucu çeliği parlak, gövdesi uzun.
   */
  pierce: (g) => {
    // iki yuvarlak ahşap kalkan (yandan, ok yönüne dik duran elipsler): sütundaki iki düşman
    const shield = (cx: number, cy: number, R: number, r: number) => {
      const pts = (k: number) => {
        const out: number[] = [];
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          // büyük eksen (1,1)/√2 doğrultusunda, küçük eksen ok doğrultusunda (1,-1)/√2
          const u = Math.cos(a) * R * k;
          const v = Math.sin(a) * r * k;
          out.push(cx + (u + v) * 0.707, cy + (u - v) * 0.707);
        }
        return out;
      };
      g.poly(pts(1), 'k');
      g.poly(pts(0.84), 'b');
      // kalaslar (kalkan yüzündeki çizgiler)
      for (const k of [-0.45, 0, 0.45]) g.line(cx + (k * R - r * 0.6) * 0.707, cy + (k * R + r * 0.6) * 0.707, cx + (k * R + r * 0.6) * 0.707, cy + (k * R - r * 0.6) * 0.707, 'k', 0.25);
      g.line(cx - R * 0.7 * 0.707 - 0.4, cy - R * 0.7 * 0.707 + 0.4, cx + R * 0.7 * 0.707 - 0.4, cy + R * 0.7 * 0.707 + 0.4, 'n', 0.5); // ışık
      // demir kenar perçinleri
      for (const k of [-0.78, 0.78]) g.disc(cx + R * k * 0.707, cy + R * k * 0.707, 0.6, 'm');
    };
    shield(11.2, 20.8, 7.4, 2.6);
    shield(19.8, 12.2, 6.4, 2.3);
    // ok: kuyruk sol altta, uç sağ üstte iki tahtayı geçmiş
    arrow(g, 1.6, 30.4, 29.8, 2.2, { sw: 1.5, hl: 5.4, hw: 2.6, fl: 5.6, fw: 2.1, vane: ['w', 'a'] });
    // deliğin çevresi (gövdenin tahtadan geçtiği yer kararmış)
    g.disc(11.6, 20.4, 0.9, 'k').disc(20, 12, 0.85, 'k');
    g.line(10.6, 21.4, 12.6, 19.4, 'n', 1.1);
    g.line(19, 13, 21, 11, 'n', 1.1);
    // çıkış kıymıkları (ok yönünde saçılır; ikinci tahtada daha az)
    const chip = (x: number, y: number, l: number, a: number) => g.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 'n', 0.6);
    chip(14.4, 19.6, 2.2, -0.15);
    chip(13.6, 16.8, 2, -1.2);
    chip(15.4, 17.6, 1.7, -0.7);
    chip(12.6, 15.8, 1.2, -1.6);
    chip(22.6, 10.6, 1.5, -0.3);
    chip(21.8, 8.6, 1.3, -1.1);
    g.set(16.4, 16.2, 'e').set(14.8, 14.4, 'b').set(23.8, 8.4, 'e');
  },

  /**
   * ARROW RAIN (3x3 alan, gökten): yere yatık 3x3 hücreli toprak plaka; üstüne dik açıyla yağan oklar. Üçü düşüyor (arkalarında hava
   * çizgisi), dördü toprağa saplanmış (uçları gömülü, yalnızca gövde ve tüy görünür) ve dibinde toz.
   */
  arrows: (g) => {
    // zemin: eğik 3x3 plaka (tahtadaki hücre dili)
    const A: P = [2, 25.6];
    const B: P = [19.6, 21.4];
    const C: P = [30, 25.4];
    const D: P = [12.4, 29.8];
    g.poly([A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1]], 'k');
    g.poly([A[0] + 0.9, A[1], B[0], B[1] + 0.6, C[0] - 1, C[1], D[0], D[1] - 0.6], 'b');
    const lerp = (p: P, q: P, u: number): P => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    for (const u of [1 / 3, 2 / 3]) {
      const a = lerp(A, B, u);
      const b = lerp(D, C, u);
      g.line(a[0], a[1], b[0], b[1], 'k', 0.5);
      const c = lerp(A, D, u);
      const d = lerp(B, C, u);
      g.line(c[0], c[1], d[0], d[1], 'k', 0.5);
    }
    // saplanmış oklar: yere değdiği nokta -> geriye (sol üste) gövde + tüy
    const stuck = (x: number, y: number, l: number) => {
      arrow(g, x - l * 0.5, y - l * 0.866, x + 0.2, y + 0.2, { sw: 1, hl: 0.1, hw: 0.1, fl: 3.4, fw: 1.4 });
      g.line(x - 1.1, y + 0.3, x + 1.2, y + 0.3, 'n', 0.5); // toz
    };
    stuck(9, 26.2, 8);
    stuck(16.6, 24.4, 7.6);
    stuck(22.4, 26.8, 7);
    stuck(14, 28.2, 6.4);
    // düşen oklar (dik; uç aşağıda)
    const fall = (x: number, y: number, l: number) => {
      arrow(g, x - l * 0.42, y - l * 0.9, x, y, { sw: 1.1, hl: 3.2, hw: 1.6, fl: 3.6, fw: 1.5 });
      g.line(x - l * 0.42 - 1.6, y - l * 0.9 - 3.6, x - l * 0.42 - 0.6, y - l * 0.9 - 1.4, 'm', 0.5);
    };
    fall(10.8, 15.6, 11);
    fall(20.6, 13.4, 11);
    fall(28.2, 17.2, 10);
  },

  /**
   * AIMED SHOT (tek hedef, dev hasar, zırhın yarısını yok sayar): çelik göğüs plakası tam ortadan delinmiş ve çatlamış, ok saplı;
   * dört köşede altın nişan köşebentleri + ince artı (uzun nişan), plakadan kopan parçalar.
   */
  aimedshot: (g) => {
    // göğüs plakası (çelik): omuz oyukları, boyun kesiği, belde daralan; sol yarı ışıkta
    const plate = [7.4, 7, 12.4, 7, 14, 9.2, 18, 9.2, 19.6, 7, 24.6, 7, 26, 10.6, 24.4, 22, 20, 26.4, 12, 26.4, 7.6, 22, 6, 10.6];
    g.poly(plate, 'd');
    g.poly([7.4, 7, 12.4, 7, 14, 9.2, 16, 9.2, 16, 26.4, 12, 26.4, 7.6, 22, 6, 10.6], 'm');
    g.line(8, 8.2, 12, 8.2, 'l', 0.5).line(7, 11, 7.6, 20.6, 'l', 0.5); // kenar parlaması
    g.line(14.2, 10, 17.8, 10, 'k', 0.5); // boyun kesiği deri astar
    g.line(16, 10, 16, 25.6, 'l', 0.5); // orta sırt çizgisi
    g.line(9.6, 11, 22.4, 11, 'd', 0.5); // perçin hattı
    for (const x of [10.5, 13.5, 18.5, 21.5]) g.disc(x, 11, 0.45, 'w');
    // çatlak (merkezden dışa)
    const crack = (pts: number[]) => {
      for (let i = 0; i + 3 < pts.length; i += 2) g.line(pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, 'o', 0.6);
    };
    crack([16, 17, 13.2, 14.6, 11.6, 14.8, 9.4, 12.6]);
    crack([16, 17, 19.6, 15.2, 21.2, 12.6]);
    crack([16, 17, 14.2, 20.8, 14.8, 23.6]);
    crack([16, 17, 20.4, 20.4, 22.6, 20.6]);
    g.disc(16, 17, 1.7, 'o');
    // kopan plaka parçaları
    g.poly([24.6, 15, 27.2, 14, 26.4, 16.6], 'l').poly([7, 17.4, 4.6, 16.4, 5.6, 19], 'm').poly([22.8, 24.6, 25, 25.8, 23, 27], 'l');
    // ok: sol alttan gelip ortaya saplanmış (uç gömülü)
    arrow(g, 1.4, 30.6, 16, 17.2, { sw: 1.4, hl: 1.4, hw: 0.8, fl: 5.4, fw: 2.1, vane: ['w', 'r'] });
    // nişan köşebentleri (altın) + ince artı
    const L = 4.2;
    const W = 1.15;
    const c = 'a';
    for (const [x, y, sx, sy] of [[2, 2, 1, 1], [30, 2, -1, 1], [2, 30, 1, -1], [30, 30, -1, -1]] as Array<[number, number, number, number]>) {
      g.line(x, y, x + sx * L, y, c, W).line(x, y, x, y + sy * L, c, W);
    }
    g.line(16, 1.2, 16, 4.6, 'z', 0.5).line(16, 27.6, 16, 30.8, 'z', 0.5).line(1.2, 17, 4.4, 17, 'z', 0.5).line(27.6, 17, 30.8, 17, 'z', 0.5);
  },
};

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Uçan ok (yatay, uç SAĞDA): efektte gerçek uçuş açısına döndürülür. 128 ince piksel; 0..32 mantıksal. */
  arrow: (g) => arrow(g, 1.5, 16, 30.5, 16, { sw: 1.25, hl: 4.6, hw: 2.1, fl: 6.4, fw: 2.1, vane: ['w', 'a'] }),
  /** Ağır ok (Piercing / Aimed): daha kalın gövde, iri uç, kırmızı tüy. */
  arrowheavy: (g) => arrow(g, 1, 16, 31, 16, { sw: 1.6, hl: 5.8, hw: 2.8, fl: 7, fw: 2.5, vane: ['w', 'r'] }),
  /** Saplanmış ok (uç yok: hedefte/toprakta gömülü), yatay, gömülen uç SAĞDA. */
  arrowstuck: (g) => arrow(g, 9, 16, 31.5, 16, { sw: 1.25, hl: 0.1, hw: 0.1, fl: 6.4, fw: 2.1, vane: ['w', 'a'] }),
  /** Ahşap kıymık. */
  splinter: { size: 64, draw: (g) => {
    g.poly([6, 18, 26, 12, 28, 14.5, 8, 20.5], 'n');
    g.line(9, 18.6, 24, 14, 'b', 0.6);
  } },
  /** Çelik zırh kırığı (Aimed Shot). */
  plateshard: { size: 64, draw: (g) => {
    g.poly([6, 10, 24, 6, 27, 18, 14, 27, 5, 20], 'm');
    g.poly([6, 10, 24, 6, 15, 15, 5, 20], 'l');
    g.line(8, 11, 22, 7.5, 'w', 0.7);
  } },
  /** Toz/çim tutamı (ok yere saplanınca). */
  dirt: { size: 64, outline: false, draw: (g) => {
    g.disc(16, 18, 6, 'b').disc(11, 20, 4, 'k').disc(21, 19, 4.5, 'n').disc(15, 15, 3, 'n');
  } },
};
