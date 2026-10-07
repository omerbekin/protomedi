/**
 * Shared (global) - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Global eylemler (Rest / Skip Turn / Move) ve can çubuğunun yanındaki DURUM ROZETLERİ. Rozetler oyunda ~28 px'e küçültülür:
 * bu yüzden tek, iri, kalın konturlu bir siluet + tek vurgu (`'a'` = durumun kendi rengi, statuses.json > color) kuralıyla çizildi;
 * ince ayrıntı yalnızca büyük görünümde (tooltip, wiki) okunan bonus. Aynı ad birden çok yerde kullanılır:
 *   boot = Move + Slow + Haste (vurgu rengi ayırır), guardian = Fortified + Guard, holy = Blessed + Holy Fire zemini,
 *   poison = Withering + Poison zemini, finger = Jinxed + Taunt, flame = Burning Ground zemini, shield = zırh aurası, leaf = Regen.
 *
 * v1 ikon adları (ICONS anahtarları): rest, hourglass, boot, drop, bash, guardian, holy, blinded, shrouded, soul, eye, poison, finger
 */
import type { V2SpriteEntry } from '../types';
import { flame, shieldShape, sparkle, type PxGrid } from '../../pixel-art';

/** Beş köşeli yıldız. */
function star(g: PxGrid, cx: number, cy: number, r: number, t: string): void {
  const p: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.poly(p, t);
}

/** Damla (uç yukarıda). */
function drop(g: PxGrid, cx: number, cy: number, r: number, t: string): void {
  g.poly([cx, cy - r * 2.2, cx + r * 0.95, cy - r * 0.2, cx - r * 0.95, cy - r * 0.2], t);
  g.disc(cx, cy, r, t);
}

export const ICONS: Record<string, V2SpriteEntry> = {
  /** Skip Turn: ahşap çerçeveli kum saati, üst hazne boşalıyor; yanda hız çizgileri (sıradaki tur yarı sürede). */
  hourglass: (g) => {
    // hız çizgileri
    g.line(1, 12, 6, 12, 'a', 1.3);
    g.line(2.5, 17, 6.5, 17, 'a', 1.3);
    g.line(1, 22, 6, 22, 'a', 1.3);
    // cam
    g.poly([9.5, 5, 26.5, 5, 26.5, 7, 19, 15.5, 19, 16.5, 26.5, 25, 26.5, 27, 9.5, 27, 9.5, 25, 17, 16.5, 17, 15.5, 9.5, 7], 'c');
    // kum: üstte az, akan ip, altta yığın
    g.poly([13.5, 10.5, 22.5, 10.5, 18.6, 14.8, 17.4, 14.8], 'y');
    g.line(18, 15, 18, 23, 'y', 0.75);
    g.poly([11.5, 26, 24.5, 26, 21, 21.5, 15, 21.5], 'y');
    g.poly([14, 26, 22, 26, 19.5, 23.5, 16.5, 23.5], 'Y');
    // ahşap kapaklar ve direkler
    g.rect(7.5, 2, 21, 3.4, 'b');
    g.rect(7.5, 26.6, 21, 3.4, 'b');
    g.line(9, 5, 9, 27, 'k', 1.1);
    g.line(27, 5, 27, 27, 'k', 1.1);
    g.line(11, 7, 14, 10, 'w', 0.6);
  },

  /** Move / Slow / Haste: çelik dizlikli deri çizme, vurgu renkli kayış ve arkasında hareket çizgileri. */
  boot: (g) => {
    // hareket çizgileri (vurgu)
    g.line(1, 9, 8, 9, 'a', 1.4);
    g.line(0.5, 15, 7, 15, 'a', 1.4);
    g.line(2, 21, 7.5, 21, 'a', 1.4);
    // çizme gövdesi
    g.poly([11, 3, 21, 3, 21, 19, 29, 21, 30.5, 25, 30, 28, 11, 28, 10, 18], 'b');
    g.poly([21, 19, 29, 21, 30.5, 25, 22, 24], 'k');
    // taban
    g.rect(10.5, 27, 20, 2.6, 'k');
    // çelik dizlik (üst)
    g.poly([10, 2, 22, 2, 22.5, 7.5, 9.5, 7.5], 'l');
    g.line(10, 5, 22, 5, 'm', 0.6);
    // vurgu kayışı
    g.rect(10.2, 13, 11, 2.6, 'a');
    g.rect(14, 12.6, 2.8, 3.4, 'y');
  },

  /** Wound: kan damlası, üzerinde açık bir yara kesiği (alınan şifa azalır). */
  drop: (g) => {
    drop(g, 16, 19.5, 9.5, 'r');
    g.disc(16, 20.5, 6.5, 'R');
    g.disc(16, 19.5, 6.3, 'r');
    // çapraz yara
    g.line(9.5, 25, 23, 12, 'o', 2.2);
    g.line(10.5, 24.4, 22, 13, 'R', 0.75);
    g.disc(12, 14, 1.8, 'w');
    // sızan damla
    drop(g, 25, 28.5, 1.6, 'r');
  },

  /** Stun: göçük çelik miğfer ve çevresinde dönen sarı yıldızlar (sıradaki turu kaçırır). */
  bash: (g) => {
    // yörünge
    g.ellipse(16, 8, 14.5, 4.5, 'Y');
    g.ellipse(16, 8, 13.2, 3.3, '.');
    // miğfer
    g.poly([6, 28, 6, 17, 9, 11, 16, 9, 23, 11, 26, 17, 26, 28], 'm');
    g.poly([8, 17, 9.5, 12.5, 16, 10.8, 22.5, 12.5, 24, 17], 'l');
    g.rect(8.5, 19, 15, 2.6, 'o');
    g.line(16, 21, 16, 28, 'd', 1.6);
    // göçük
    g.line(19, 11.2, 21.5, 15.5, 'd', 0.8);
    // yıldızlar (yörüngenin önünde)
    for (const [x, y, r] of [[4.5, 9.5, 4.6], [27.5, 8, 4], [16, 3.8, 3.6]] as Array<[number, number, number]>) {
      star(g, x, y, r, 'a');
      star(g, x, y, r * 0.45, 'w');
    }
  },

  /** Fortified / Guard: vurgu renkli kalkan üzerinde mazgallı kale burcu (alınan hasar azalır). */
  guardian: (g) => {
    shieldShape(g, 16, 2, 26, 28, 'l', 'a');
    g.poly([5.5, 4, 26.5, 4, 26.5, 7, 5.5, 7], 'z');
    // burç
    g.rect(11, 12, 10, 12, 'l');
    for (const x of [10, 14.6, 19.2]) g.rect(x, 8.5, 2.8, 4, 'l');
    g.rect(14.6, 18.5, 2.8, 5.5, 'o');
    g.line(11, 15.5, 21, 15.5, 'm', 0.5);
  },

  /** Blessed / Holy Fire: ışın saçan altın haç ve hale. */
  holy: (g) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.poly([16 + Math.cos(a - 0.14) * 9, 16 + Math.sin(a - 0.14) * 9, 16 + Math.cos(a) * 15.5, 16 + Math.sin(a) * 15.5, 16 + Math.cos(a + 0.14) * 9, 16 + Math.sin(a + 0.14) * 9], 'a');
    }
    g.ring(16, 16, 10.5, 'y', 1.6);
    g.rect(13.6, 3.5, 4.8, 25, 'y');
    g.rect(6.5, 10.6, 19, 4.8, 'y');
    g.rect(14.8, 4.5, 1.4, 23, 'w');
    g.rect(7.5, 11.8, 17, 1.2, 'w');
  },

  /** Blinded: göz, önünden geçen kalın kömür dumanı bandı (isabet düşer). */
  blinded: (g) => {
    g.poly([1, 12, 8, 4.5, 16, 2.5, 24, 4.5, 31, 12, 24, 19.5, 16, 21.5, 8, 19.5], 'w');
    g.disc(16, 12, 6.8, 'U');
    g.disc(16, 12, 3.4, 'o');
    g.disc(13.6, 9.6, 1.5, 'w');
    // duman bandı (gözün alt yarısına çapraz)
    for (const [x, y, r, t] of [[4, 22, 4.5, 'd'], [10, 19, 5, 'm'], [17, 18, 5.2, 'm'], [24.5, 19.5, 5, 'd'], [29, 23, 3.4, 'm'], [8, 26.5, 4, 'm'], [16, 25.5, 4.6, 'd'], [24, 27, 3.8, 'm']] as Array<[number, number, number, string]>) g.disc(x, y, r, t);
    g.disc(10, 17.5, 2.2, 'l');
    g.disc(17.5, 16.5, 2.2, 'l');
  },

  /** Shrouded: duman perdesinin ardında kapüşonlu siluet (kaçınma artar). */
  shrouded: (g) => {
    // kapüşonlu siluet
    g.poly([16, 2, 22, 6, 24, 14, 27, 28, 5, 28, 8, 14, 10, 6], 'd');
    g.poly([12, 9, 16, 6.5, 20, 9, 20.5, 15, 11.5, 15], 'o');
    g.disc(14, 12, 0.9, 'a');
    g.disc(18, 12, 0.9, 'a');
    // duman perdesi (alt yarı)
    for (const [x, y, r, t] of [[5, 22, 5.5, 'l'], [13, 24, 6.5, 'm'], [22, 22.5, 6, 'l'], [28, 25, 4.5, 'm'], [9, 28, 4.5, 'm'], [19, 28.5, 4.5, 'l']] as Array<[number, number, number, string]>) g.disc(x, y, r, t);
    g.disc(6, 20.5, 2.4, 'w');
    g.disc(21, 20.5, 2.4, 'w');
  },

  /** Dark Bond: zincirle birbirine bağlı iki kızıl yürek (Undead'in çaldığı can bağlı dosta da akar). */
  soul: (g) => {
    const heart = (cx: number, cy: number, r: number) => {
      g.disc(cx - r * 0.5, cy - r * 0.2, r * 0.58, 'a');
      g.disc(cx + r * 0.5, cy - r * 0.2, r * 0.58, 'a');
      g.poly([cx - r * 1.07, cy, cx + r * 1.07, cy, cx, cy + r * 1.15], 'a');
      g.disc(cx - r * 0.6, cy - r * 0.35, r * 0.2, 'z');
    };
    heart(8.5, 10, 7.5);
    heart(23.5, 21, 7.5);
    // zincir halkaları (arada, çapraz)
    g.ellipse(14, 15, 3.4, 2.2, 'l');
    g.ellipse(14, 15, 1.8, 0.8, '.');
    g.ellipse(18, 17, 2.2, 3.4, 'm');
    g.ellipse(18, 17, 0.8, 1.8, '.');
  },

  /** Bad Omen: mor balmumu mühür pulu (damlayan kenar), üzerinde kazınmış göz. */
  eye: (g) => {
    g.disc(16, 15, 13, 'a');
    for (const [x, y, r] of [[8, 25, 2.6], [21, 27.5, 2.2], [26.5, 22, 2], [13, 28, 1.6]] as Array<[number, number, number]>) g.disc(x, y, r, 'a');
    g.ring(16, 15, 10, 'A', 1);
    // kazınmış göz
    g.poly([7.5, 15, 12, 10.5, 16, 9.5, 20, 10.5, 24.5, 15, 20, 19.5, 16, 20.5, 12, 19.5], 'A');
    g.disc(16, 15, 3.6, 'z');
    g.disc(16, 15, 1.7, 'o');
    g.disc(11.5, 7, 1.6, 'z');
  },

  /** Withering / Poison: damlayan zehir sızıntısı ve içinde kuru kafa. */
  poison: (g) => {
    drop(g, 16, 18, 11, 'a');
    g.disc(16, 18.5, 8.5, 'A');
    g.disc(16, 18, 8.2, 'a');
    // kuru kafa
    g.disc(16, 17, 5.4, 'e');
    g.rect(13, 20.5, 6, 3.4, 'e');
    g.disc(13.8, 17, 1.6, 'o');
    g.disc(18.2, 17, 1.6, 'o');
    g.poly([16, 18.6, 17, 20.4, 15, 20.4], 'o');
    g.line(14.6, 21.5, 14.6, 23.6, 'o', 0.5);
    g.line(17.4, 21.5, 17.4, 23.6, 'o', 0.5);
    g.disc(10, 12, 1.4, 'z');
    drop(g, 26, 29.5, 1.5, 'a');
  },

  /** Jinxed / Taunt: yukarıyı gösteren çelik eldiven, parmağa bağlı vurgu renkli uğursuzluk ipliği. */
  finger: (g) => {
    // kalkık işaret parmağı (yuvarlak uçlu, eklem çizgili)
    g.rect(9.5, 5, 5, 12, 'l');
    g.disc(12, 5, 2.5, 'l');
    g.line(9.5, 11, 14.5, 11, 'm', 0.5);
    // yumruk: bükük parmaklar (3 eklem), avuç, başparmak
    g.rect(9, 14.5, 15, 11, 'm');
    for (const x of [16.5, 19.5, 22.5]) {
      g.disc(x, 15.8, 1.9, 'l');
      g.line(x - 1.5, 18.5, x - 1.5, 21.5, 'd', 0.4);
    }
    g.poly([7.5, 19, 16, 18, 17, 21.5, 8.5, 23], 'l');
    // bilek/manşet
    g.rect(8.5, 25.5, 16, 5, 'd');
    g.line(8.5, 27.5, 24.5, 27.5, 'm', 0.5);
    // uğursuzluk ipliği düğümü (parmakta) ve sallanan uçlar
    g.rect(8.8, 8, 6.4, 2.2, 'a');
    g.poly([15, 9, 21, 5, 21.5, 8.5], 'a');
    g.poly([15, 9, 20, 12.5, 18, 13.5], 'a');
    g.line(21, 6.5, 27, 2.5, 'a', 0.9);
    g.line(20, 12, 26, 11, 'a', 0.9);
  },

  /** Burning Ground (zemin rozeti): katmanlı alev ve kömür. */
  flame: (g) => {
    g.ellipse(16, 27.5, 12, 3, 'k');
    flame(g, 16, 28, 26, 11.5, 'r', 'f', 'y');
    flame(g, 16, 28, 9, 4, 'w', 'w', 'w');
    g.disc(6, 9, 1.2, 'f');
    g.disc(26, 6, 1, 'y');
  },

  /** Zırh aurası: perçinli çelik kalkan. */
  shield: (g) => {
    shieldShape(g, 16, 2, 26, 28, 'm', 'l');
    g.line(16, 5, 16, 27, 'm', 1.2);
    g.line(6, 13, 26, 13, 'm', 1.2);
    for (const [x, y] of [[8.5, 6.5], [23.5, 6.5], [8.5, 19], [23.5, 19]]) g.disc(x!, y!, 1, 'd');
    g.line(7.5, 6, 11, 6, 'w', 0.6);
  },

  /** Regen: filizlenen yaprak çifti ve yeşil can damlası. */
  leaf: (g) => {
    g.line(16, 30, 16, 14, 'G', 1.4);
    g.poly([16, 18, 4, 10, 6, 4, 14, 8], 'g');
    g.poly([16, 15, 28, 6, 27, 1.5, 18, 5], 'g');
    g.line(16, 18, 7, 7, 'G', 0.5);
    g.line(16, 15, 25.5, 4, 'G', 0.5);
    drop(g, 22.5, 25, 3.6, 'a');
    g.disc(21.5, 24, 1, 'w');
  },
};

export const SPRITES: Record<string, V2SpriteEntry> = {
  // NOT: Rest ikonu ICONS yerine burada bekliyor: src/gallery/catalog.ts > buildIcons global skill ikonlarını (rest) "kullanılıyor" saymadığı
  // için v1 'rest' Legacy'de görünüyor ve tests/asset-versions.test.ts (v2 olan öğe legacy olamaz) kırılıyor. ui-dev catalog'a
  // content.globalSkills ikonlarını ekleyince bu girdi ICONS'a taşınır (anahtar: rest).
  /** Rest: hilal ay ve içinde dolan mavi mana damlası (nefes al, MP topla). */
  rest: (g) => {
    g.disc(14, 16, 12.5, 'y');
    g.disc(19.5, 12.5, 10.5, '.');
    g.disc(10, 22, 1.4, 'Y');
    g.disc(6.5, 14, 1, 'Y');
    drop(g, 22, 22, 5, 'u');
    g.disc(22, 22.6, 3, 'c');
    g.disc(20.6, 21, 1.1, 'w');
    sparkle(g, 26, 5, 2.6, 'w');
    sparkle(g, 18.5, 3.5, 1.6, 'w');
  },

};
