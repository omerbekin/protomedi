import { blade, crystal, leafShape, sparkle, type Draw, type PxGrid } from './pixel-art';
import { gauntletFist, goldCoin, holyHammer, isoDie, playingCard, thorn, towerShield } from './pixel-icons';

/** Efekt (VFX) sprite'ları (32x32): ikon olmayan, animasyonlarda kullanılan çizimler. Aynı jetonlar, aynı araçlar. */
export const PIXEL_FX: Record<string, Draw> = {
  /** Defender: dik duran lacivert kule kalkanı (Tremor Slam'de yere çakılan, Taunt'ta vurulan, Guard'da hayalet olarak beliren). */
  towershield: (g) => {
    towerShield(g, 16, 0.5, 20, 31);
  },
  /** Defender: aşağı inen çelik zırh eldiveni (Fist Crush). */
  gauntlet: (g) => {
    gauntletFist(g, 16, 2, 1.45);
  },
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
  // Holy Strike animasyonu: halosuz çekiç (halo ayrı yumuşak doku olarak çekicin arkasında nabız atar)
  hammerbit: (g) => {
    holyHammer(g);
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
  voidspike: (g) => {
    // uzun, sivri boşluk iğnesi (ucu yukarı); parlayan çekirdek
    g.poly([16, 0, 21, 8, 19, 27, 16, 31, 13, 27, 11, 8], 'P').poly([16, 0, 13, 8, 13, 27, 16, 31], 'p').poly([16, 3, 18, 9, 17, 24, 16, 27, 15, 24, 14, 9], 'o');
    g.line(16, 4, 16, 26, 'c', 1).line(15, 12, 15, 22, 'w', 1);
  },
  manadrop: (g) => {
    // gerçekçi mana damlası: sivri uç yukarıda, yuvarlak gövde aşağıda; mor tonlar (skill rengi: a/A/z), parlak çekirdek, ışık yansıması
    g.poly([16, 1, 21, 11, 25, 19, 23, 26, 16, 30, 9, 26, 7, 19, 11, 11], 'A');
    g.poly([16, 3, 20, 12, 23, 19, 21, 25, 16, 28, 11, 25, 9, 19, 12, 12], 'a');
    g.poly([16, 8, 19, 15, 21, 20, 19, 24, 16, 26, 13, 24, 11, 20, 13, 15], 'z');
    g.poly([16, 14, 18, 19, 16, 23, 14, 19], 'p');
    g.disc(13, 17, 1.6, 'w').rect(12, 21, 1.2, 1.2, 'z');
  },
  // ---------- Gambler efektleri ----------
  // Kemik zar (eş eksenli), uçarken dönen mermi
  die: (g) => {
    isoDie(g, 16, 8.5, 11);
  },
  // Altın zar (All In): büyük, beyaz noktalı
  diegold: (g) => {
    isoDie(g, 16, 8.5, 11, { top: 'y', left: 'Y', right: 'b', pip: 'w' });
    g.rect(3, 12, 1.4, 1.4, 'w').rect(25, 8, 1.4, 1.4, 'w');
  },
  // Önden altın para (yağmur, parıltı)
  coin: (g) => {
    goldCoin(g, 16, 16, 13);
  },
  // Tek iskambil kartı (bıçak gibi fırlatılır; ucu yukarı)
  card: (g) => {
    playingCard(g, 16, 16, 15, 24, 0, 'spade');
  },
  // Kan damlası (High Stakes bahsi): sivri ucu yukarıda, ışık yansımalı
  blooddrop: (g) => {
    g.poly([16, 4, 22.4, 16, 23, 21, 20.4, 26, 16, 27.5, 11.6, 26, 9, 21, 9.6, 16], 'R');
    g.poly([16, 7, 21, 16.5, 21.3, 21, 19.2, 24.8, 16, 25.8, 12.8, 24.8, 10.7, 21, 11, 16.5], 'r');
    g.rect(12.4, 17, 1.8, 4.4, 'w');
  },
  // Düello kılıcı: ince, düz uçlu; NE'ye bakar (sağ-yukarı)
  duelsword: (g) => {
    blade(g, 9, 23, 29, 3, 3.6, 'l', 'm');
    g.line(5, 19, 15, 29, 'a', 2.2).line(5, 18.5, 15, 28.5, 'z', 1);
    g.line(8, 25, 4, 29, 'b', 2.4).line(7.4, 25.6, 4.6, 28.4, 'k', 0.8);
    g.disc(2.8, 29.8, 2, 'y');
    g.line(12, 20, 27, 5, 'w', 0.8);
  },
  // ---------- Bone Slash / Thorn Shield efektleri ----------
  // Kemik kıymığı: uzun, sivri, bir ucu kırık; uçarken döner
  bonesliver: (g) => {
    g.poly([3, 27, 8, 19, 25, 3, 29, 4, 24, 14, 14, 24], 'e');
    g.poly([3, 27, 8, 19, 25, 3, 16, 17, 10, 25], 'w');
    g.poly([24, 14, 29, 4, 27, 12], 'n');
    g.line(14, 20, 20, 14, 'n', 1).rect(12, 22, 2, 2, 'k').rect(20, 9, 1.5, 1.5, 'k');
  },
  // Ahşap diken: yerden fırlar (ucu yukarıda); kahverengi gövde, açık kenar, çevresinde yeşil sarmaşık
  thornspike: (g) => {
    g.poly([10, 31, 12, 20, 14, 9, 16, 0, 18.5, 9, 20, 20, 22, 31], 'k');
    g.poly([10, 31, 12, 20, 14, 9, 16, 0, 16, 31], 'b');
    g.poly([12.5, 28, 13.5, 18, 15, 6, 15.4, 28], 'n');
    g.line(10.5, 26, 21.5, 22, 'G', 1.8).line(11.5, 25.6, 20.5, 22.2, 'g', 0.7);
    g.line(12, 18, 20, 15.6, 'G', 1.4).line(12.8, 17.6, 19.6, 15.8, 'g', 0.5);
    g.rect(6, 29, 4, 2, 'k').rect(22, 29, 4, 2, 'k');
  },
  // Dikenli sarmaşık/kök: kıvrılarak yükselir, yanlarında küçük dikenler
  thornvine: (g) => {
    const path: Array<[number, number]> = [[15, 31], [10, 24], [19, 17], [11, 10], [18, 2]];
    for (let i = 0; i < path.length - 1; i++) g.line(path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], 'k', 4);
    for (let i = 0; i < path.length - 1; i++) g.line(path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1], 'G', 2.6);
    for (let i = 0; i < path.length - 1; i++) g.line(path[i]![0] - 0.6, path[i]![1], path[i + 1]![0] - 0.6, path[i + 1]![1], 'g', 1);
    for (const [bx, by, tx, ty] of [[10, 24, 3, 22], [19, 17, 27, 14.5], [11, 10, 4, 7.5], [17, 25, 24, 27]] as const) thorn(g, bx, by, tx, ty, 3.4);
  },
  // ---------- Geometer (şekil skill'leri) efektleri ----------
  // Rün karosu: kare çerçeve + köşe çentikleri + açısal haritacı rünü (eşkenar dörtgen, artı, merkez nokta); zemine yassı basılır
  gridrune: (g) => {
    g.rect(3, 3, 26, 26, 'A').rect(5, 5, 22, 22, '.');
    g.rect(3, 3, 26, 1.4, 'a').rect(3, 3, 1.4, 26, 'a');
    for (const [x, y] of [[3, 3], [26, 3], [3, 26], [26, 26]] as const) g.rect(x, y, 3, 3, 'z');
    g.line(16, 7.5, 24.5, 16, 'a', 1.6).line(24.5, 16, 16, 24.5, 'a', 1.6).line(16, 24.5, 7.5, 16, 'a', 1.6).line(7.5, 16, 16, 7.5, 'a', 1.6);
    g.line(16, 8.5, 23.5, 16, 'z', 0.6).line(8.5, 16, 16, 8.5, 'z', 0.6);
    g.line(16, 11, 16, 21, 'w', 0.8).line(11, 16, 21, 16, 'w', 0.8);
    g.disc(16, 16, 1.8, 'w');
  },
  // Kare taş mühür (Block Slam): kalın taş blok; ön yüzünde ışıyan oyma kare rün
  gridseal: (g) => {
    g.rect(3, 9, 26, 20, 'd').rect(3, 9, 26, 3, 'l').rect(3, 12, 26, 14, 'm').rect(3, 26, 26, 3, 'd');
    g.rect(3, 9, 1.5, 20, 'l').rect(27.5, 12, 1.5, 17, 'd');
    g.rect(8, 14, 16, 10, 'A').rect(9, 15, 14, 8, 'm');
    g.rect(9, 15, 14, 1, 'a').rect(9, 22, 14, 1, 'a').rect(9, 15, 1, 8, 'a').rect(22, 15, 1, 8, 'a');
    g.line(16, 16, 20.5, 19, 'z', 1).line(20.5, 19, 16, 22, 'z', 1).line(16, 22, 11.5, 19, 'z', 1).line(11.5, 19, 16, 16, 'z', 1);
    g.disc(16, 19, 1.2, 'w');
    g.line(6, 13, 7.5, 17, 'd', 0.5).line(25, 21, 23.5, 25, 'd', 0.5).rect(26, 13, 1.5, 1.5, 'l');
  },
  // Kalem ucu kıvılcımı: tebeşir-ışık kaleminin ucu (küçük kare çekirdekli dört köşeli yıldız)
  gridspark: (g) => {
    sparkle(g, 16, 16, 14, 'a');
    sparkle(g, 16, 16, 9, 'z');
    g.rect(13.5, 13.5, 5, 5, 'w');
  },
  // Işık mızrağı (Column Spear): sağa bakan uzun ışık mızrağı; uç beyaz, gövde arcane, kuyrukta söner
  lightspear: (g) => {
    g.poly([0, 13.5, 6, 14.6, 22, 14.6, 22, 17.4, 6, 17.4, 0, 18.5], 'A');
    g.line(3, 16, 22, 16, 'a', 2.2).line(7, 16, 22, 16, 'z', 1.2).line(12, 16, 22, 16, 'w', 0.5);
    g.poly([20, 10, 31.5, 16, 20, 22, 22.5, 16], 'z').poly([21.5, 12.8, 29, 16, 21.5, 19.2, 23.2, 16], 'w');
  },
  // ---------- Cutthroat / Treant (yeni) efektleri ----------
  // Kil duman bombası (fırlatılan): yuvarlak sırlı çömlek, balmumu tıpa, yanan kısa fitil
  claybomb: (g) => {
    g.disc(16, 19, 11, 'k').disc(15, 18, 10, 'b');
    g.ellipse(11.5, 14, 3.6, 2.6, 'n').disc(10.4, 13, 1, 'w');
    g.line(6, 21, 26, 21, 'k', 0.8).line(7.5, 25, 24.5, 25, 'k', 0.8);
    g.rect(12, 5.5, 8, 4, 'b').rect(12, 5.5, 8, 1, 'n').rect(11.4, 4, 9.2, 2, 'R');
    g.line(17, 4, 20, 0.8, 'n', 1);
    g.disc(20.6, 0.8, 1.6, 'f').disc(20.6, 0.8, 0.7, 'y');
  },
  // Kil kırığı: sırlı çömlek parçası (patlamada saçılır)
  claychip: (g) => {
    g.poly([4, 22, 9, 8, 22, 4, 28, 12, 20, 26], 'b').poly([6, 20, 10, 9, 20, 6, 14, 18], 'n');
    g.line(9, 22, 24, 12, 'k', 1);
  },
  // Kök yumruğu (Root Smash, gökten iner): aşağı bakan kabuklu ahşap yumruk; bileği yukarı uzanan kök demeti, yosun ve yaprak
  rootfist: (g) => {
    // bilek: üç kök yukarı uzanır
    g.line(12, 0, 13, 12, 'k', 4).line(16, 0, 16, 12, 'k', 4.4).line(20.5, 0, 19.5, 12, 'k', 4);
    g.line(12, 0, 13, 12, 'b', 2.4).line(16, 0, 16, 12, 'b', 2.8).line(20.5, 0, 19.5, 12, 'b', 2.4);
    g.line(15.4, 0, 15.4, 12, 'n', 0.7);
    // yumruk gövdesi (kabuk)
    g.poly([6, 12, 26, 11, 28, 18, 27, 25, 5, 25, 4, 18], 'k');
    g.poly([7, 12.6, 25, 11.8, 26.6, 18, 25.6, 23.6, 6.4, 23.6, 5.4, 18], 'b');
    g.line(9, 13.4, 9.6, 22, 'k', 0.7).line(15, 13, 14.6, 22.4, 'k', 0.7).line(21.6, 12.8, 22.2, 22, 'k', 0.7);
    g.rect(7.6, 13.2, 6, 1.4, 'n').rect(17, 12.8, 6.6, 1.2, 'n');
    // bükülmüş parmaklar (altta, eklem kabarıkları)
    for (const x of [7.8, 12.6, 17.4, 22.2]) g.disc(x, 26.4, 3, 'k').disc(x - 0.2, 26, 2.2, 'b').rect(x - 1.4, 24.6, 1.6, 0.8, 'n');
    // başparmak (yanda)
    g.poly([26, 15, 30, 17, 30.6, 22, 27.6, 23.4, 26.6, 19], 'k').poly([26.6, 15.6, 29.4, 17.4, 29.6, 21.4, 27.6, 22], 'b');
    // yosun ve sürgün
    g.disc(10.4, 18.6, 1.8, 'G').disc(10, 18.2, 0.9, 'g').disc(21, 19.4, 1.6, 'G').disc(20.6, 19, 0.7, 'g');
    leafShape(g, 6, 11.6, 1.2, 7.6, 1.6);
    leafShape(g, 24.6, 10.8, 29.6, 6.8, 1.6);
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
