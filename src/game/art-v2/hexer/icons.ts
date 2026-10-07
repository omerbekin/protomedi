/**
 * Hexer - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md, görsel brief docs/design/classes/hexer.md bölüm 9.
 *
 * Karakter referansı (assets/sprites/hexer/idle.png, kapüşonsuz): kıvrık ahşap asa, asaya KIRMIZI İPLİKLE bağlı oyma KEMİK PULLAR
 * (biri yeşil), öbür elde KARA MUMLU demir kandil, erik/patlıcan rengi yırtık cüppe, zeytin yeşili kuşak. Lanetçi; büyüsü nesnelerden:
 * kemik tılsım, iplik düğümü, mum, nazar. Kafatası ve hayvan YOK (Undead/Druid'in); yonca yalnızca solmuş.
 * Aile renkleri: class #6a2f5f (erik), lanet ışığı #b04fa8, çürük yeşili #9cab3c, kemik #e9dfc4 ('e'), kandil alevi #d9a441 ('Y'/'y' az).
 * v1 paleti sabit olduğu için bu renkler skill'in vurgu rengi ('a'/'A'/'z') ve en yakın jetonlarla kurulur
 * (çürük yeşili kemik/mum ikonlarında 's'/'S'; mor ışık 'p'/'P').
 *
 * v1 ikon adları (yer tutucu ödünç adlar; ICONS anahtarları bunlar, çizimler brief'teki gerçek ikonlar):
 *   rune -> hexerlogo (logo)      soul -> illomen (pasif Ill Omen)      eye -> evileye (Evil Eye)
 *   drainfield -> witheringcurse  clover -> jinx                        voidstrike -> doommark (Doom Mark)
 * Durum rozetleri (omen/wither/jinxed) statuses.json'da ortak (shared) ikon adlarını kullandığı için burada SPRITES olarak hazır:
 *   badge_omen, badge_wither, badge_jinxed (+ misfortune, doom). Bağlantı ui-dev/shared işi (rapora yazıldı).
 */
import type { V2SpriteEntry } from '../types';
import { flame, sparkle, type PxGrid } from '../../pixel-art';

type P = [number, number];

// ---------------------------------------------------------------- ortak parçalar

/** Oyma kemik tılsım pulu: disk + kenar + oyulmuş rün çizgileri; `crack` ise çatlak ve kopuk dilim. */
function charm(g: PxGrid, cx: number, cy: number, r: number, o: { crack?: boolean; carve?: string; body?: string; rune?: number } = {}): void {
  const body = o.body ?? 'e';
  g.disc(cx, cy, r, 'n');
  g.disc(cx - r * 0.08, cy - r * 0.08, r * 0.86, body);
  const c = o.carve ?? 'A';
  const w = Math.max(0.25, r * 0.13);
  const k = o.rune ?? 0;
  // basit oyma rünler (asadaki pulların "X" ve çizgili desenleri)
  if (k === 0) g.line(cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45, c, w).line(cx + r * 0.45, cy - r * 0.45, cx - r * 0.45, cy + r * 0.45, c, w);
  else if (k === 1) g.line(cx, cy - r * 0.55, cx, cy + r * 0.55, c, w).line(cx - r * 0.4, cy - r * 0.15, cx + r * 0.4, cy - r * 0.15, c, w).line(cx - r * 0.3, cy + r * 0.25, cx + r * 0.3, cy + r * 0.25, c, w);
  else g.ring(cx, cy, r * 0.42, c, w).set(cx, cy, c);
  if (o.crack) {
    g.line(cx + r * 0.15, cy - r * 0.95, cx - r * 0.05, cy - r * 0.2, 'o', w * 1.1).line(cx - r * 0.05, cy - r * 0.2, cx + r * 0.3, cy + r * 0.35, 'o', w * 1.1).line(cx + r * 0.3, cy + r * 0.35, cx + r * 0.05, cy + r * 0.95, 'o', w * 1.1);
  }
}

/** Kırmızı iplik (Bézier, ince). */
function thread(g: PxGrid, p0: P, p1: P, p2: P, w = 0.6, t = 'r', steps = 18): void {
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const p: P = [(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
    g.line(prev[0], prev[1], p[0], p[1], t, w);
    prev = p;
  }
}

/** Yedi köşeli rün (heptagram {7/3}) halka içinde. */
function heptagram(g: PxGrid, cx: number, cy: number, r: number, t: string, w: number, skip?: (i: number) => boolean): void {
  const pt = (i: number): P => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 7;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  for (let i = 0; i < 7; i++) {
    if (skip?.(i)) continue;
    const a = pt(i);
    const b = pt((i + 3) % 7);
    g.line(a[0], a[1], b[0], b[1], t, w);
  }
}

/** Badem biçimli insan gözü (kirpiksiz): göz akı, irise vurgu ışığı, bebek, parlama. `open` 0..1 göz kapağı açıklığı. */
function eye(g: PxGrid, cx: number, cy: number, w: number, h: number, open = 1, o: { lid?: string; white?: string } = {}): void {
  const hh = h * open;
  const lid = o.lid ?? 'k';
  const pts = (k: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      out.push(cx - w + u * w * 2, cy - Math.sin(u * Math.PI) * hh * k);
    }
    for (let i = 16; i >= 0; i--) {
      const u = i / 16;
      out.push(cx - w + u * w * 2, cy + Math.sin(u * Math.PI) * hh * k * 0.8);
    }
    return out;
  };
  if (open <= 0.08) {
    g.line(cx - w, cy, cx + w, cy, lid, Math.max(0.5, h * 0.22));
    g.line(cx - w * 0.6, cy + h * 0.15, cx + w * 0.6, cy + h * 0.15, lid, 0.25);
    return;
  }
  g.poly(pts(1.18), lid);
  g.poly(pts(1), o.white ?? 'w');
  const ir = Math.min(hh * 0.95, w * 0.42);
  g.disc(cx, cy, ir, 'A');
  g.disc(cx, cy, ir * 0.8, 'a');
  g.disc(cx, cy, ir * 0.42, 'o');
  g.disc(cx - ir * 0.32, cy - ir * 0.35, Math.max(0.25, ir * 0.18), 'w');
  // üst kapak gölgesi
  g.line(cx - w * 0.7, cy - hh * 0.92, cx + w * 0.7, cy - hh * 0.92, lid, Math.max(0.25, h * 0.12));
}

/** Kara mum (dik): gövde, eriyik akıntıları, fitil; `lit` ise kirli kehribar küçük alev. */
function blackCandle(g: PxGrid, cx: number, base: number, h: number, w: number, lit = true): void {
  g.rect(cx - w / 2, base - h, w, h, 'o');
  g.rect(cx - w / 2 + w * 0.15, base - h, w * 0.25, h, 'd'); // soluk yansıma
  g.ellipse(cx, base - h, w / 2, w * 0.2, 'd');
  g.line(cx + w * 0.3, base - h, cx + w * 0.42, base - h + h * 0.35, 'd', 0.5); // akıntı
  g.line(cx, base - h, cx, base - h - w * 0.4, 'k', 0.5);
  if (lit) flame(g, cx, base - h - w * 0.35, w * 1.5, w * 0.48, 'Y', 'y', 'w');
}

/** Çürük damarı: kökten dallanan sarı-yeşil çizgiler (deterministik). */
function veins(g: PxGrid, x: number, y: number, ang: number, len: number, w: number, t: string, core: string, depth = 2): void {
  let px = x;
  let py = y;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const a = ang + Math.sin(i * 1.7 + x) * 0.35;
    const nx = px + (Math.cos(a) * len) / steps;
    const ny = py + (Math.sin(a) * len) / steps * 0.55;
    g.line(px, py, nx, ny, t, w * (1 - i / (steps + 2)));
    if (i < steps - 2) g.line(px, py, nx, ny, core, Math.max(0.25, w * 0.35));
    if (depth > 0 && i === 2) veins(g, nx, ny, a + 0.7, len * 0.5, w * 0.7, t, core, depth - 1);
    if (depth > 0 && i === 4) veins(g, nx, ny, a - 0.8, len * 0.4, w * 0.6, t, core, depth - 1);
    px = nx;
    py = ny;
  }
}

/** Seramik (pişmiş toprak) boncuk; `cracked` ise ortadan çatlak. */
function bead(g: PxGrid, cx: number, cy: number, r: number, cracked = false): void {
  g.disc(cx, cy, r, 'b');
  g.disc(cx - r * 0.1, cy - r * 0.1, r * 0.8, 'n');
  g.disc(cx, cy, r * 0.28, 'k'); // delik
  if (cracked) g.line(cx - r * 0.2, cy - r, cx + r * 0.1, cy - r * 0.2, 'o', Math.max(0.25, r * 0.16)).line(cx + r * 0.1, cy + r * 0.25, cx - r * 0.25, cy + r, 'o', Math.max(0.25, r * 0.16));
}

/** Cadı düğümü: üç ilmek (triquetra benzeri) kalın iplikle. */
function witchKnot(g: PxGrid, cx: number, cy: number, r: number, w: number, t = 'a', hi = 'z'): void {
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
    const lx = cx + Math.cos(a) * r * 0.55;
    const ly = cy + Math.sin(a) * r * 0.55;
    g.ring(lx, ly, r * 0.62, t, w);
    g.ring(lx - 0.2, ly - 0.2, r * 0.62 - w * 0.25, hi, Math.max(0.25, w * 0.25), a - 2.2, a - 1.2);
  }
}

// ---------------------------------------------------------------- ikonlar

export const ICONS: Record<string, V2SpriteEntry> = {
  /**
   * LOGO (rune -> hexerlogo): kara mumlu demir kandil (Hexer'in elindeki), altında kırmızı iplikle sallanan üç kemik pul; sağdaki çatlak.
   * 15 px'te: koyu kandil + parlak alev + üç açık pul.
   */
  rune: (g) => {
    // askı halkası ve kapak
    g.ring(16, 2.6, 1.6, 'm', 0.6);
    g.poly([10.6, 7.6, 21.4, 7.6, 19.2, 4.4, 12.8, 4.4], 'd');
    // gövde: demir çerçeve, içi sıcak cam
    g.rect(10.8, 7.6, 10.4, 11.4, 'o');
    g.rect(12, 8.6, 8, 9.4, 'A');
    g.rect(12, 8.6, 8, 9.4, 'A');
    g.dither(12, 12.6, 8, 5.4, 'A', 'Y');
    g.rect(15.6, 8.6, 0.8, 9.4, 'd'); // orta çubuk
    blackCandle(g, 16, 18, 4.2, 2.4, true);
    g.rect(10.4, 18.6, 11.2, 1.6, 'd');
    // kırmızı iplik + üç kemik pul
    thread(g, [16, 20.2], [12.5, 21.6], [8.6, 23.2], 0.6);
    thread(g, [16, 20.2], [16, 22], [16, 24.6], 0.6);
    thread(g, [16, 20.2], [19.5, 21.6], [23.4, 23.2], 0.6);
    charm(g, 8.6, 26, 3, { rune: 1 });
    charm(g, 16, 27.6, 3.2, { rune: 0 });
    charm(g, 23.4, 26, 3, { rune: 2, crack: true });
  },

  /**
   * PASİF Ill Omen (soul -> illomen): ölen lanetlinin Omen'leri en yakın düşmana geçer. Soldaki çatlak pul, içinden eflatun bir duman
   * ipliği kıvrılarak sağdaki sağlam pula akıyor ve onu ışıtıyor.
   */
  soul: (g) => {
    charm(g, 8.4, 21.4, 6.6, { crack: true, rune: 0 });
    // duman ipliği (kalın -> ince), eflatun
    const pts: P[] = [[10.6, 17.2], [12.6, 10.8], [17.4, 9.4], [20.6, 13.4], [22.4, 15.6]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const w = 2.2 - i * 0.35;
      g.line(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], 'p', w);
      g.line(pts[i]![0] - 0.25, pts[i]![1] - 0.25, pts[i + 1]![0] - 0.25, pts[i + 1]![1] - 0.25, 'z', Math.max(0.25, w * 0.3));
    }
    g.disc(13.2, 6.6, 0.9, 'p').disc(18.6, 5.4, 0.6, 'z').disc(9.4, 12.2, 0.6, 'p');
    // alıcı pul (eflatun hale)
    g.disc(23.6, 21.6, 7.4, 'P');
    charm(g, 23.6, 21.6, 6, { rune: 2, carve: 'P' });
    sparkle(g, 28.6, 14.6, 2, 'z');
  },

  /**
   * EVIL EYE (eye -> evileye): asadaki pullar gibi kemik pul; üstüne oyulmuş TEK insan gözü (kirpiksiz), irisi lanet ışığında,
   * pulun kenarında çürük yeşili halka, tepede kırmızı iplik ilmiği.
   */
  eye: (g) => {
    thread(g, [13.2, 4.8], [16, 0.6], [18.8, 4.8], 0.7);
    g.disc(16, 17, 13.4, 'S');
    // kenar çürüğü: lekeli halka
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      g.disc(16 + Math.cos(a) * 12.4, 17 + Math.sin(a) * 12.4, i % 3 === 0 ? 1.3 : 0.8, i % 2 ? 's' : 'S');
    }
    g.disc(16, 17, 11.2, 'n');
    g.disc(15.6, 16.6, 10.2, 'e');
    // oyma göz
    eye(g, 16, 17.2, 8.6, 4.6, 1, { lid: 'k', white: 'w' });
    // oyma çizgileri (kirpik değil, kemikteki çentikler)
    g.line(9, 9.6, 10.4, 11, 'b', 0.5).line(23, 9.6, 21.6, 11, 'b', 0.5).line(16, 7.4, 16, 9.2, 'b', 0.5);
  },

  /**
   * WITHERING CURSE (drainfield -> witheringcurse): yere devrilmiş kara mum, fitili kararmış ve tütüyor; dibinden yere sarı-yeşil
   * çürük damarları sızıyor, çevredeki ot bıçakları grileşmiş ve eğilmiş.
   */
  drainfield: (g) => {
    // zemin
    g.ellipse(16, 24.6, 14.6, 5.4, 'k');
    g.ellipse(16, 24.2, 13.4, 4.6, 'S');
    // damarlar (mumun dibinden sağa/sola sızar)
    veins(g, 12.4, 23.6, 0.25, 15, 1.5, 'a', 'z');
    veins(g, 12.4, 23.6, Math.PI - 0.15, 10, 1.3, 'a', 'z');
    veins(g, 13.4, 24.4, 0.9, 9, 1.1, 'a', 'z', 1);
    // ölü ot
    for (const [x, y, d] of [[5, 22, -1], [7, 26.4, 1], [24, 21.6, 1], [27.4, 25.4, -1], [20.4, 27.6, 1]] as Array<[number, number, number]>) {
      g.line(x, y, x + d * 0.8, y - 3, 'm', 0.5).line(x + d * 0.8, y - 3, x + d * 2.2, y - 3.6, 'm', 0.5);
    }
    // devrilmiş kara mum (çapraz): dip sol altta, fitil sağ üstte
    g.line(9.4, 22.6, 21.6, 10.4, 'o', 4.4);
    g.line(8.8, 21.4, 20.6, 9.6, 'd', 0.9);
    g.disc(21.8, 10.2, 2.1, 'd');
    g.line(22.6, 9.2, 23.8, 7.8, 'k', 0.6); // kararmış fitil
    // eriyik birikintisi
    g.ellipse(10.4, 24.2, 3.2, 1.2, 'o');
    // tüten is (gri kıvrım)
    thread(g, [24.2, 7.2], [22.4, 4.4], [25.6, 1.6], 0.75, 'm');
    g.disc(26.4, 1.4, 0.6, 'l');
  },

  /**
   * JINX (clover -> jinx): kırmızı iplikle üç kez atılmış cadı düğümü; ortasında çatlamış seramik boncuk, iki ip ucu sarkıyor.
   */
  clover: (g) => {
    thread(g, [12, 21.6], [8.8, 26.4], [6.2, 30.4], 1.1, 'A');
    thread(g, [20, 21.6], [23.2, 26.4], [25.8, 30.4], 1.1, 'A');
    witchKnot(g, 16, 15.2, 9.4, 1.7, 'a', 'z');
    bead(g, 16, 15.8, 3.4, true);
    // çatlaktan seken kıymıklar
    g.poly([20.6, 9.4, 22, 8.2, 21.6, 10.2], 'n').poly([11.2, 21.4, 9.6, 22.4, 10.6, 20.4], 'b');
  },

  /**
   * DOOM MARK (voidstrike -> doommark): kemik beyazı halka içinde yedi köşeli rün mühür; mühür ortadan çatlamış, çatlaktan mor ışık
   * sızıyor, kopan kemik kıymıkları.
   */
  voidstrike: (g) => {
    g.disc(16, 16, 14, 'P');
    g.disc(16, 16, 12.6, 'A');
    g.ring(16, 16, 14, 'e', 2);
    g.ring(16, 16, 11.4, 'n', 0.5);
    heptagram(g, 16, 16, 10.6, 'e', 1.2);
    // çatlak: sağ üstten sol alta, iki yana açılan mor ışık
    const crack: P[] = [[22.4, 1.4], [18.8, 8.8], [20.4, 12.6], [14.6, 17.2], [16, 21], [10.4, 26.6], [9.4, 30.6]];
    for (let i = 0; i + 1 < crack.length; i++) g.line(crack[i]![0], crack[i]![1], crack[i + 1]![0], crack[i + 1]![1], 'p', 2.4);
    for (let i = 0; i + 1 < crack.length; i++) g.line(crack[i]![0], crack[i]![1], crack[i + 1]![0], crack[i + 1]![1], 'z', 1);
    for (let i = 0; i + 1 < crack.length; i++) g.line(crack[i]![0], crack[i]![1], crack[i + 1]![0], crack[i + 1]![1], 'w', 0.25);
    // kopan kemik kıymıkları
    g.poly([24.6, 4, 27.4, 2.6, 26.2, 5.4], 'e').poly([6, 27.6, 3.6, 29.6, 4.4, 26.4], 'e').poly([27.6, 9.4, 30.2, 9.8, 28.2, 11.4], 'n');
  },
};

// ---------------------------------------------------------------- efekt sprite'ları ve rozetler

const eyeSprite = (open: number): V2SpriteEntry => ({ size: 96, draw: (g) => eye(g, 16, 16, 13, 7.6, open, { lid: 'P', white: 'e' }) });

export const SPRITES: Record<string, V2SpriteEntry> = {
  /** Nazar gözü kareleri (asanın ucunda açılır, hedefin göğsünde belirip kapanır). Vurgu = lanet ışığı. */
  eye_open: eyeSprite(1),
  eye_half: eyeSprite(0.45),
  eye_closed: eyeSprite(0),
  /** Omen pulu (yığın işareti): küçük kemik pul, eflatun oyma. */
  charm: { size: 64, draw: (g) => {
    thread(g, [12, 6], [16, 1.4], [20, 6], 1);
    charm(g, 16, 17, 11, { carve: 'a', rune: 0 });
  } },
  /** Çatlamış pul (Doom anında). */
  charmcracked: { size: 64, draw: (g) => {
    charm(g, 16, 17, 11, { carve: 'a', rune: 0, crack: true });
  } },
  /** Kemik kıymığı. */
  boneshard: { size: 64, draw: (g) => g.poly([8, 14, 24, 9, 26, 13, 12, 21], 'e').line(10, 15, 22, 11, 'n', 0.6) },
  /** Seramik boncuk (Jinx) ve kırığı. */
  bead: { size: 64, draw: (g) => bead(g, 16, 16, 10) },
  beadshard: { size: 64, draw: (g) => g.poly([7, 12, 20, 7, 24, 18, 12, 24], 'n').poly([7, 12, 20, 7, 14, 15], 'b') },
  /** Kara mum alevi (yerden fışkırıp sönen; koyu dış, kehribar çekirdek). */
  blackflame: { size: 64, draw: (g) => flame(g, 16, 30, 26, 8.4, 'o', 'A', 'Y') },
  /** Kara mum (Withering başlangıcı, rozet). */
  candle: { size: 64, draw: (g) => blackCandle(g, 16, 29, 16, 7, true) },
  /** Mühür (zemine yatırılarak kullanılır: dikey ölçek ~0,35). Kontursuz ince çizim. */
  seal: { size: 192, outline: false, draw: (g) => {
    g.ring(16, 16, 15.4, 'e', 0.9);
    g.ring(16, 16, 13.6, 'e', 0.4);
    heptagram(g, 16, 16, 13.2, 'e', 0.6);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 7;
      g.disc(16 + Math.cos(a) * 14.5, 16 + Math.sin(a) * 14.5, 0.55, 'z');
    }
  } },
  /** Çatlamış mühür (Doom Mark sonrası zemin izi). */
  sealcracked: { size: 192, outline: false, draw: (g) => {
    g.ring(16, 16, 15.4, 'd', 0.9);
    heptagram(g, 16, 16, 13.2, 'd', 0.6, (i) => i === 2 || i === 5);
    const crack: P[] = [[22, 1], [18.6, 8.6], [20, 12.6], [14.6, 17], [16, 21], [10.4, 27], [9.6, 31]];
    for (let i = 0; i + 1 < crack.length; i++) g.line(crack[i]![0], crack[i]![1], crack[i + 1]![0], crack[i + 1]![1], 'o', 0.9);
  } },
  /** Durum rozeti: Bad Omen (eflatun mühür pulu). */
  badge_omen: { size: 64, draw: (g) => {
    g.disc(16, 16, 13, 'A');
    charm(g, 16, 16, 11, { carve: 'a', rune: 0 });
    g.ring(16, 16, 13, 'a', 1.4);
  } },
  /** Durum rozeti: Withering (eğilmiş, eriyen kara mum). */
  badge_wither: { size: 64, draw: (g) => {
    g.ellipse(16, 28, 11, 2.6, 'a');
    g.poly([11, 28, 21, 28, 22, 14, 18, 7, 12, 14], 'o');
    g.line(13, 13, 12.4, 26, 'd', 1);
    g.line(19, 10, 23.6, 6, 'k', 0.8);
    g.disc(24.4, 5.2, 1.4, 'a');
    g.line(21.6, 18, 23.4, 26.6, 'o', 1.4);
  } },
  /** Durum rozeti: Jinxed (küçük kırmızı düğüm). */
  badge_jinxed: { size: 64, draw: (g) => {
    witchKnot(g, 16, 15, 11, 2.6, 'r', 'w');
    bead(g, 16, 15.6, 3.6, true);
  } },
  /** Misfortune (wiki/tooltip): solmuş, çatlak, gri-yeşil üç yapraklı yonca. */
  misfortune: { size: 64, draw: (g) => {
    for (const [x, y] of [[16, 9.5], [9.5, 17], [22.5, 17]] as P[]) {
      g.disc(x - 2.2, y, 4.2, 'S').disc(x + 2.2, y, 4.2, 'S').disc(x, y + 2.4, 3.8, 'S');
      g.disc(x - 2.4, y - 0.4, 2.2, 's');
    }
    g.line(16, 16, 18, 30, 'S', 1.6);
    g.line(13, 6, 17, 14, 'o', 0.6).line(23, 14, 21, 20, 'o', 0.6);
  } },
  /** Doom (yüzen yazı yanı): ortadan ikiye çatlamış seramik tılsım. */
  doom: { size: 64, draw: (g) => {
    g.poly([4, 5, 15, 4, 13.4, 12, 16, 19, 13.6, 28, 4, 27], 'n').poly([5, 6, 13.8, 5.2, 12.4, 12, 5, 13], 'e');
    g.poly([18, 4, 28, 5, 28, 27, 17, 28, 19.6, 19, 16.6, 12], 'b').poly([19, 5.4, 27, 6, 27, 12, 18.4, 12], 'n');
    heptagram(g, 16, 16, 7, 'A', 0.8);
  } },
};
