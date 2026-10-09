/**
 * Mage - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter referansı (assets/sprites/mage/idle.png): koyu mavi cübbe + altın işleme (daire-çizgi ve baklava mühürleri), elinde mavi
 * kristalli bükülmüş ahşap asa, avucunda MAVİ alev, kemerinde büyü kitabı. Görsel dil: "bilgin elementalist": element (ateş/buz)
 * avuçtaki mavi çekirdekten doğar, altın mühür geometrisiyle biçimlenir. Ateşlerin çekirdeği mavi-beyaz (en sıcak gaz alevi).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): wizhat, echo, fireball, blizzard, manabarrier, meteor
 * SPRITES: boş (efekt dokuları vfx.ts'de gürültüyle üretilir).
 */
import type { V2SpriteEntry } from '../types';
import { crystal, sparkle, type PxGrid } from '../../pixel-art';

// ------------------------------------------------------------------------------------------------ yardımcılar

/** Kuyruklu kuyruk yıldızı biçimi: baş (hx,hy) r yarıçaplı, kuyruk ucu (tx,ty); katman kalınlığı k. */
function cometShape(g: PxGrid, hx: number, hy: number, tx: number, ty: number, r: number, t: string, wob = 0): void {
  const a = Math.atan2(hy - ty, hx - tx); // kuyruktan başa
  const pts: number[] = [tx, ty];
  // kuyruk kenarı (dalgalı alev dilleri) -> baş çevresi -> diğer kenar
  const side = (sgn: number) => {
    const out: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const k = i / 5;
      const bx = tx + (hx - tx) * k;
      const by = ty + (hy - ty) * k;
      const w = r * k ** 0.8 * (1 + (i % 2 ? wob : -wob * 0.6));
      out.push(bx - Math.sin(a) * w * sgn, by + Math.cos(a) * w * sgn);
    }
    return out;
  };
  pts.push(...side(1));
  for (let i = 0; i <= 12; i++) {
    const th = a + Math.PI / 2 - (i / 12) * Math.PI;
    pts.push(hx + Math.cos(th) * r, hy + Math.sin(th) * r);
  }
  const s2 = side(-1);
  for (let i = s2.length - 2; i >= 0; i -= 2) pts.push(s2[i]!, s2[i + 1]!);
  g.poly(pts, t);
}

/** Mavi avuç alevi (mage'in imzası): koyu mavi dış, mavi, buz mavisi, beyaz çekirdek. */
function blueFlame(g: PxGrid, cx: number, by: number, h: number, w: number): void {
  const f = (k: number, t: string, lean = 0) =>
    g.poly([cx + lean * k, by - h * k, cx + w * k * 0.75, by - h * k * 0.55, cx + w * k, by - h * k * 0.2, cx + w * k * 0.55, by, cx - w * k * 0.55, by, cx - w * k, by - h * k * 0.22, cx - w * k * 0.6, by - h * k * 0.62, cx - w * 0.25 * k, by - h * k * 0.45], t);
  f(1, 'U', 1.5);
  f(0.82, 'u', 1);
  f(0.56, 'c', 0.5);
  f(0.3, 'w', 0);
}

// ------------------------------------------------------------------------------------------------ ikonlar

export const ICONS: Record<string, V2SpriteEntry> = {
  /** Fire Bolt: avuçtaki mavi çekirdekten doğan ateş oku; sağ üste fırlayan kuyruklu alev, mavi-beyaz en sıcak çekirdek. */
  fireball: (g) => {
    // kuvvetli kıvılcımlar (kuyruk boyunca)
    for (const [x, y, t] of [[3, 15, 'r'], [13, 30, 'f'], [26, 26, 'y']] as Array<[number, number, string]>) g.disc(x, y, 0.9, t);
    // okun içinden geçtiği altın mühür (eğik halka, arkadaki yarısı)
    g.ring(8, 24, 6, 'Y', 1, Math.PI * 0.75, Math.PI * 1.75);
    cometShape(g, 20, 12, 1.5, 30.5, 9.5, 'R', 0.18);
    cometShape(g, 20.3, 11.8, 4.5, 27.5, 8.4, 'r', 0.22);
    cometShape(g, 20.6, 11.5, 8, 24, 7, 'f', 0.15);
    cometShape(g, 21, 11.2, 11.5, 20.5, 5.4, 'y', 0.1);
    // mavi-beyaz çekirdek (mage'in avuç alevi)
    g.disc(21.4, 10.9, 4, 'c');
    g.disc(22, 10.4, 2.5, 'w');
    g.line(13, 19, 16.5, 15.5, 'y', 0.5);
    g.ring(8, 24, 6, 'y', 1, Math.PI * -0.25, Math.PI * 0.75); // mührün öndeki yarısı
  },

  /** Blizzard: koyu fırtına bulutu, rüzgârla eğik düşen buz sarkıtları ve önde büyük kar kristali. */
  blizzard: (g) => {
    // bulut (alt yüzü koyu)
    g.ellipse(16, 8.5, 13.5, 5.2, 'd');
    g.disc(9, 6.5, 4.6, 'm');
    g.disc(16.5, 4.8, 5.4, 'm');
    g.disc(23.5, 6.6, 4.4, 'm');
    g.disc(10, 5.6, 3, 'l');
    g.disc(16.5, 3.8, 3.6, 'l');
    g.ellipse(16, 11, 12, 1.8, 'd');
    // rüzgâr çizgileri
    g.line(2, 15, 9, 13.5, 'l', 0.5);
    g.line(4, 19, 10, 17.5, 'l', 0.5);
    // eğik sarkıtlar (sola, rüzgâr yönüne)
    const shard = (x: number, y: number, len: number) => {
      g.poly([x - 1.4, y, x + 1.4, y, x - len * 0.35, y + len], 'u');
      g.poly([x - 1.4, y, x, y, x - len * 0.35, y + len], 'c');
    };
    shard(7, 12, 9);
    shard(13.5, 12.5, 11);
    shard(4, 13, 6);
    // büyük kar kristali (6 kol + dallar)
    const cx = 21.5;
    const cy = 22.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const ex = cx + Math.cos(a) * 8;
      const ey = cy + Math.sin(a) * 8;
      g.line(cx, cy, ex, ey, 'c', 1.25);
      for (const k of [0.5, 0.78]) {
        const bx = cx + Math.cos(a) * 8 * k;
        const by = cy + Math.sin(a) * 8 * k;
        for (const s of [-1, 1]) g.line(bx, by, bx + Math.cos(a + s * 0.85) * 2.4 * (1.2 - k), by + Math.sin(a + s * 0.85) * 2.4 * (1.2 - k), 'c', 0.9);
      }
      g.line(cx, cy, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 'w', 0.5);
    }
    g.disc(cx, cy, 2.2, 'u');
    g.disc(cx, cy, 1.2, 'w');
    g.set(3, 26, 'w').set(9, 29, 'c').set(12, 24, 'w');
  },

  /** Mana Barrier: altın mühür tabanında yükselen petek yüzeyli mavi kristal kubbe, içinde mana damlası (emdikçe MP); dışa kopan kara lanet kırıkları (dispel). */
  manabarrier: (g) => {
    // altın mühür tabanı
    g.ellipse(16, 27, 13.5, 3.6, 'Y');
    g.ellipse(16, 27, 11.5, 2.4, 'U');
    // kubbe gövdesi
    g.disc(16, 16.5, 12, 'U');
    g.disc(16, 16.5, 10.6, 'u');
    // petek (altıgen) fasetleri
    const hex = (x: number, y: number, r: number) => {
      const p: number[] = [];
      for (let i = 0; i < 6; i++) p.push(x + Math.cos((i / 6) * Math.PI * 2) * r, y + Math.sin((i / 6) * Math.PI * 2) * r);
      for (let i = 0; i < 6; i++) g.line(p[i * 2]!, p[i * 2 + 1]!, p[((i + 1) % 6) * 2]!, p[((i + 1) % 6) * 2 + 1]!, 'c', 0.5);
    };
    for (const [x, y] of [[16, 16.5], [10.8, 13.5], [21.2, 13.5], [10.8, 19.5], [21.2, 19.5], [16, 10.5], [16, 22.5]]) hex(x!, y!, 3.4);
    // mana damlası (ortada)
    g.poly([16, 11.5, 19.2, 17.5, 16, 21, 12.8, 17.5], 'c');
    g.disc(16, 18, 3.1, 'c');
    g.disc(16, 18.4, 1.9, 'w');
    // parlama yayı
    g.ring(16, 16.5, 10, 'w', 0.75, Math.PI * 1.05, Math.PI * 1.45);
    // dışa kopan kara lanet kırıkları (dispel)
    g.poly([26.5, 4.5, 29.5, 3, 28.5, 6.5], 'P');
    g.poly([28.5, 9.5, 31, 9, 29.5, 11.5], 'P');
    sparkle(g, 26.5, 8, 1.8, 'w');
  },

  /** Meteor: erimiş çatlaklı kaya, öndeki kızgın kenar, arkasında katmanlı alev ve duman. */
  meteor: (g) => {
    // duman kuyruğu (en arkada)
    g.disc(27.5, 4, 3.2, 'd');
    g.disc(24.5, 2.6, 2.4, 'm');
    // alev kuyruğu: sol alttaki kayadan sağ üste
    cometShape(g, 12, 20, 31, 1, 9.5, 'R', 0.2);
    cometShape(g, 12, 20, 28, 4, 8.4, 'r', 0.25);
    cometShape(g, 12, 20, 24.5, 7.5, 7.4, 'f', 0.18);
    cometShape(g, 12, 20, 20, 12, 6.4, 'y', 0.1);
    // kaya (düzensiz)
    g.poly([6, 16, 10, 13, 15, 13.5, 18.5, 17, 18, 22.5, 14.5, 27, 8.5, 27.5, 4.5, 23.5], 'k');
    g.poly([6.8, 16.6, 10.3, 14.2, 14.8, 14.6, 17.4, 17.6, 16.8, 22, 13.8, 25.8, 9, 26.2, 5.8, 23], 'd');
    g.poly([7.5, 16.5, 10.5, 14.8, 13, 15.5, 10, 18.5], 'm');
    // erimiş çatlak ağı (kayanın içinden sızan kızgınlık)
    for (const [a, b, c2, d, t] of [
      [13.5, 15, 12.5, 18.5, 'f'], [12.5, 18.5, 9, 20, 'f'], [9, 20, 6, 19.5, 'R'], [12.5, 18.5, 15.5, 21, 'y'], [15.5, 21, 17, 20.5, 'f'],
      [9, 20, 9.8, 23.5, 'f'], [9.8, 23.5, 7, 25.5, 'R'], [9.8, 23.5, 13, 25, 'f'], [15.5, 21, 14, 24.5, 'R'],
    ] as Array<[number, number, number, number, string]>) g.line(a, b, c2, d, t, 0.5);
    // ön kızgın kenar (alt-sol, gidiş yönü)
    g.line(4.8, 23.5, 8.5, 27.4, 'y', 0.9);
    g.line(4.6, 19.5, 4.8, 23.5, 'f', 0.8);
    g.line(8.5, 27.4, 13.5, 27, 'f', 0.8);
    // kopan küçük kayalar ve kıvılcım
    g.disc(4, 13, 1.3, 'd');
    g.disc(20, 27, 1.1, 'd');
    g.set(4.5, 28, 'f').set(2.5, 22, 'y');
  },

  /** Spell Echo (pasif): mavi avuç alevi, çevresinde dönen altın ok (büyü yeniden hazır) ve arkasında koyu yankı kopyası. */
  echo: (g) => {
    // dönen altın ok (tam tur değil, ok başıyla)
    g.ring(16, 17, 12.5, 'y', 1.6, Math.PI * -0.35, Math.PI * 1.3);
    const a = Math.PI * -0.35;
    const hx = 16 + Math.cos(a) * 11.7;
    const hy = 17 + Math.sin(a) * 11.7;
    g.poly([hx - 3.6, hy - 1.4, hx + 3.4, hy - 2.6, hx + 0.6, hy + 4.2], 'y');
    // yankı kopyası (koyu mavi alev silüeti, sağ üste kaydırılmış)
    g.poly([22, 6.5, 25.5, 12, 25.5, 17, 22.5, 20, 18, 20, 16.5, 15.5, 18.5, 11], 'U');
    g.poly([21.8, 9, 24, 13, 23.6, 17, 20.5, 18.6, 18.6, 15.5], 'P');
    // asıl alev
    blueFlame(g, 15, 24.5, 15, 6.4);
    // mühür noktaları
    g.disc(16, 4.5, 0.9, 'Y');
    g.disc(28.5, 17, 0.9, 'Y');
  },

  /** Logo: mage'in asası: bükülmüş ahşap, altın bilezikler, tepede pençelerin tuttuğu mavi kristal. */
  wizhat: (g) => {
    // asa gövdesi (hafif eğik, bükülme izleri)
    g.line(19, 31, 15.5, 13, 'b', 2.4);
    g.line(18.5, 29, 16, 15, 'k', 0.6);
    for (const y of [27, 22.5, 18]) g.line(15, y + 0.6, 19.5, y - 0.6, 'k', 0.6);
    // altın bilezikler
    g.line(14.4, 20, 18.6, 19.2, 'y', 1.2);
    g.line(13.8, 14.2, 18, 13.4, 'y', 1.4);
    // kristali tutan pençeler
    g.line(14.2, 13.5, 10.5, 8, 'b', 1.3);
    g.line(17.6, 13, 21, 7.5, 'b', 1.3);
    // kristal
    crystal(g, 15.8, 8.5, 9, 15, 'c', 'u');
    g.poly([15.8, 1, 20.3, 6.7, 20.3, 11.5, 15.8, 16], 'U');
    g.line(14, 4.5, 14, 10, 'w', 0.6);
    // sallanan altın tılsım
    g.line(13.3, 15, 10, 21, 'Y', 0.5);
    g.poly([10, 20.5, 11.5, 22.5, 10, 24.5, 8.5, 22.5], 'y');
    g.disc(10, 25.6, 0.7, 'u');
  },
};

// ------------------------------------------------------------------------------------------------ efekt sprite'ları

/**
 * v2 efektlerinin ek çizimleri. 2026-10-09 gerçekçi yeniden tasarımla Mage efektleri dokularını vfx.ts içinde gürültüyle üretir
 * (ateş/alev/duman/kaya/mühür/kalkan); eski çizgi film sprite'ları (bolt, mantle, rock, tongue, icicle, flake, facet...) kaldırıldı.
 */
export const SPRITES: Record<string, V2SpriteEntry> = {};
