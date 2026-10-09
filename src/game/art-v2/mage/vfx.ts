/**
 * Mage - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter: avucunda mavi alev, elinde mavi kristalli asa, cübbesinde altın mühürler (assets/sprites/mage/idle.png). Büyüler YERİNDE atılır:
 * ateş avuçtaki mavi çekirdekten doğar, buz ve kalkan asanın kristalinden, büyük büyüler (Meteor) ince rünlü bir mühürle açılır.
 * Ayna tarafı: karakterin bakış yönü (`face`) her konumu çevirir.
 *
 * GÖRSEL DİL (2026-10-09 Ömer: "çizgi film gibi, özellikle Meteor"): GERÇEKÇİ, AĞIR, SİNEMATİK piksel art.
 *  - Düz renkli yuvarlak balonlar ve kalın konturlu halkalar yerine GÜRÜLTÜ DOKULU, düzensiz kenarlı, az basamaklı alfa dokular
 *    (`softTexture` + değer gürültüsü). Ateş tek bir renk rampasıyla boyanır: beyaz-sarı çekirdek -> turuncu -> koyu kızıl -> is siyahı.
 *  - Ateş "soğur": sprite'ın tint'i zamanla koyu kızıla ve ise iner (dokudaki renkler çarpılır), sonra yerini koyu dumana bırakır.
 *  - Zıplayan/esneyen (Back/yoyo) hareket yok; fizik: yerçekimi, sürtünme, yavaş yükselen ve dağılan duman, yere oturan kor ve kül.
 *  - Parlama beyaz değil SICAK turuncu, kısa; sarsıntı kısa ve sert. Parçacıklar az ama anlamlı (soğuyan kıvılcım, kül, kar).
 *
 * Skill -> anahtar: fire_bolt -> 'fireball', blizzard -> 'blizzard', mana_barrier -> 'barrier', meteor -> 'meteor'
 * Promise VURUŞ ANINDA çözülür; kuyruk (sönen duman, kor) arkada akar. Tüm süreler k.slow() ile skillSlowdown'a uyar.
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: tam ekran karartma görünen alanın tamamını kaplar
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

/** Karakterin baktığı yön: oyuncu sağa (+1), düşman sola (-1). */
const face = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);
/** Mage'in avucu (mavi alevli el) ve asasının kristali (sprite oranlarından). */
const handOf = (v: CombatantView): Pt => ({ x: v.container.x + face(v) * v.w * 0.38, y: v.container.y - v.h * 0.71 });
const staffOf = (v: CombatantView): Pt => ({ x: v.container.x - face(v) * v.w * 0.43, y: v.container.y - v.h * 0.92 });

// =====================================================================================================================
// GÜRÜLTÜ ve RENK RAMPASI (yalnızca doku üretiminde; deterministik, her açılışta aynı doku)

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Katmanlı gürültü 0..1. */
function fbm(x: number, y: number, s: number, oct = 4): number {
  let t = 0;
  let amp = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    t += vnoise(x * f, y * f, s + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return t / n;
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ateş rampası (sıcaktan soğuğa): beyaz-sarı çekirdek -> sarı -> turuncu -> kızıl -> koyu kızıl -> is. */
const FIRE_RAMP: Array<[number, string]> = [
  [0.9, '#fffbe8'],
  [0.79, '#ffe9a0'],
  [0.68, '#ffc85a'],
  [0.57, '#ff9a30'],
  [0.46, '#ee6a1e'],
  [0.36, '#c4401a'],
  [0.27, '#8a2616'],
  [0.19, '#4e1a12'],
  [0, '#24150f'],
];
const fireHex = (h: number): string => FIRE_RAMP.find(([t]) => h >= t)![1];
const FIRE_NUM = FIRE_RAMP.map(([t, c]) => [t, parseInt(c.slice(1), 16)] as [number, number]);
const fireNum = (h: number): number => FIRE_NUM.find(([t]) => h >= t)![1];

/** İki rengi karıştırır (tint geçişleri: ateşin soğuması). */
function mix(a: number, b: number, t: number): number {
  const u = clamp01(t);
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
/** Soğuma tint'i: 0 = doku kendi renginde (sıcak), 0,5 = koyu kızıl, 1 = is. */
const coolTint = (t: number): number => (t < 0.5 ? mix(0xffffff, 0xb05a3a, t * 2) : mix(0xb05a3a, 0x3a2a24, (t - 0.5) * 2));

// =====================================================================================================================
// DOKULAR (bir kez üretilir; düşük çözünürlük + az basamaklı alfa = piksel art; büyütme NEAREST)

/** Yumuşak radyal ışık noktası (beyaz; tint + ADD ile ışık). */
const dotTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:dot', 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    return d >= 1 ? null : { c: '#ffffff', a: (1 - d) ** 1.8 };
  });

/** Ateş topağı: gürültüyle bozulmuş kenar, içte rampa (beyaz-sarı -> turuncu -> kızıl -> is). 4 varyant (titreme). */
const fireTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2mage:fire${v}`, 48, 48, (x, y) => {
    const nx = (x + 0.5) / 48;
    const ny = (y + 0.5) / 48;
    const r = 0.37 + (fbm(nx * 4, ny * 4, 11 + v * 7) - 0.5) * 0.26;
    const d = Math.hypot(nx - 0.5, (ny - 0.5) * 1.05) / r;
    if (d >= 1) return null;
    const heat = clamp01((1 - d) * 1.05 + (fbm(nx * 8, ny * 8, 29 + v * 5) - 0.5) * 0.5 + 0.1);
    if (heat < 0.12) return null;
    const edge = d > 0.78 ? (1 - d) / 0.22 : 1;
    return { c: fireHex(heat), a: edge * (heat < 0.2 ? 0.7 : 1) };
  });

/** Alev dili (aşağıdan yukarı; origin altta): kıvrılan, ucu kopuk, gürültülü; dipte sıcak, ucunda kızıl-is. 4 varyant. */
const flameTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2mage:flame${v}`, 32, 64, (x, y) => {
    const nx = (x + 0.5) / 32 - 0.5;
    const ny = (y + 0.5) / 64; // 0 tepe, 1 dip
    const sway = (fbm(ny * 2.4, v * 3.1, 41 + v) - 0.5) * 0.55 * (1 - ny) ** 1.2;
    const w = 0.44 * ny ** 0.6 * (0.8 + 0.4 * fbm(ny * 5, 1.7 + v, 53 + v));
    if (w <= 0.01) return null;
    const u = Math.abs(nx - sway) / w;
    if (u >= 1) return null;
    const n = fbm((x + 0.5) / 32 * 5, (y + 0.5) / 64 * 9 + v * 0.7, 61 + v);
    const heat = clamp01((1 - u ** 1.5) * (0.22 + 0.86 * ny) + (n - 0.5) * 0.55);
    if (heat < 0.15) return null;
    return { c: fireHex(heat), a: heat < 0.22 ? 0.55 : 1 };
  });

/** Duman/sis topağı: düzensiz kenarlı, içi gürültülü gri (tint ile is siyahı / buz sisi / toz olur). 3 varyant. */
const smokeTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2mage:smoke${v}`, 40, 40, (x, y) => {
    const nx = (x + 0.5) / 40;
    const ny = (y + 0.5) / 40;
    const r = 0.36 + (fbm(nx * 3.5, ny * 3.5, 101 + v * 9) - 0.5) * 0.3;
    const d = Math.hypot(nx - 0.5, ny - 0.5) / r;
    if (d >= 1) return null;
    const n = fbm(nx * 7, ny * 7, 131 + v * 3);
    const L = clamp01(0.5 + (n - 0.5) * 0.9 + (0.5 - ny) * 0.35);
    const c = L > 0.72 ? '#ffffff' : L > 0.56 ? '#d9d9d9' : L > 0.4 ? '#b0b0b0' : '#8a8a8a';
    return { c, a: Math.min(1, (1 - d) * 2.2) * (0.55 + n * 0.5) };
  });

/**
 * Meteor kayası (gidiş yönü +x): bazalt gövde, gürültülü yüzey ve üst-arka ışık; içinden sızan ısı damarları (çatlak ağı), öndeki eriyen
 * (ablasyon) kenar sarı-turuncu kızgın. 2 varyant: damarların nabzı.
 */
const rockTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2mage:rock${v}`, 44, 44, (x, y) => {
    const dx = x + 0.5 - 22;
    const dy = y + 0.5 - 22;
    const a = Math.atan2(dy, dx);
    const R = 17 * (0.84 + 0.32 * (fbm(Math.cos(a) * 1.3 + 4, Math.sin(a) * 1.3 + 4, 71) - 0.5) * 2);
    const d = Math.hypot(dx, dy);
    if (d >= R) return null;
    const q = d / R;
    const n = fbm(x / 7, y / 7, 83);
    // çatlak ağı (gürültünün orta çizgisi = sırt)
    const ridge = Math.abs(fbm(x / 10, y / 10, 97) - 0.5);
    const ridge2 = Math.abs(fbm(x / 6 + 9, y / 6, 113) - 0.5);
    const front = dx / R; // +1 = gidiş yönü
    if (front > 0.35 && q > 0.72) return { c: q > 0.9 ? (v ? '#fff0b8' : '#ffe08a') : front > 0.6 ? '#ffb347' : '#e8641c', a: 1 };
    if (ridge < 0.018 + (v ? 0.006 : 0)) return { c: v ? '#fff0b8' : '#ffd27a', a: 1 };
    if (ridge < 0.04 || ridge2 < 0.016) return { c: v ? '#ff8a2a' : '#e0601a', a: 1 };
    if (ridge < 0.06) return { c: '#7a2a14', a: 1 };
    const lit = 0.5 + ((-dx * 0.55 - dy * 0.65) / R) * 0.42 + (n - 0.5) * 0.55 + Math.max(0, front) * 0.2;
    const c = lit > 0.78 ? '#7a6656' : lit > 0.62 ? '#5a483c' : lit > 0.47 ? '#3e322b' : lit > 0.33 ? '#2a211d' : '#171110';
    return { c, a: 1 };
  });

/** Kızgın iz/kuyruk (sağa bakar, baş sağda): başta kalın-sıcak, geriye incelip kızıl ve ise döner. 2 varyant. */
const streakTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2mage:streak${v}`, 96, 24, (x, y) => {
    const nx = (x + 0.5) / 96; // 0 kuyruk, 1 baş
    const ny = (y + 0.5) / 24 - 0.5;
    const w = 0.08 + 0.42 * nx ** 0.8 * (0.85 + 0.3 * fbm(nx * 6, v * 2.3, 151 + v));
    const off = (fbm(nx * 3, 3.3 + v, 163 + v) - 0.5) * 0.25 * (1 - nx);
    const u = Math.abs(ny - off) / w;
    if (u >= 1) return null;
    const n = fbm(nx * 14 - v, ny * 4, 171 + v);
    const heat = clamp01(nx ** 1.4 * (1 - u * u) * 1.15 + (n - 0.5) * 0.5);
    if (heat < 0.1) return null;
    return { c: fireHex(heat), a: heat < 0.2 ? 0.5 : 1 };
  });

/** Yanık izi: kömürleşmiş, kenarları yırtık koyu leke (yere yatık). */
const scorchTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:scorch', 64, 28, (x, y) => {
    const nx = (x + 0.5) / 64 - 0.5;
    const ny = (y + 0.5) / 28 - 0.5;
    const d = Math.hypot(nx * 2, ny * 2);
    const n = fbm(x / 6, y / 4, 181);
    const lim = 0.78 + (n - 0.5) * 0.5;
    if (d >= lim) return null;
    const q = d / lim;
    return { c: q < 0.45 ? '#0e0908' : q < 0.75 ? '#1f1511' : '#35261d', a: q > 0.8 ? 0.55 : 0.85 };
  });
/** Yanığın üstünde kalan korlar (yalnızca benekler; ADD ile nabız atar). */
const emberBedTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:emberbed', 64, 28, (x, y) => {
    const nx = (x + 0.5) / 64 - 0.5;
    const ny = (y + 0.5) / 28 - 0.5;
    const d = Math.hypot(nx * 2, ny * 2);
    if (d >= 0.7) return null;
    const n = fbm(x / 3, y / 2, 191);
    if (n < 0.62) return null;
    return { c: n > 0.72 ? '#ffd27a' : n > 0.67 ? '#ff8a2a' : '#c23d12', a: 1 - d };
  });

/** İnce rünlü mühür halkası: iki ince daire, aralarında tohumlu rün işaretleri, içte ince daire (kontursuz; tint + ADD). */
const runeRingTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:runering', 128, 128, (x, y) => {
    const dx = x + 0.5 - 64;
    const dy = y + 0.5 - 64;
    const d = Math.hypot(dx, dy);
    const a = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2); // 0..1
    if (Math.abs(d - 61) < 0.7) return { c: '#ffffff', a: 0.95 };
    if (Math.abs(d - 50) < 0.6) return { c: '#ffffff', a: 0.75 };
    if (Math.abs(d - 24) < 0.5) return { c: '#ffffff', a: 0.45 };
    // rün kuşağı: 24 kutu, her birinde tohumlu çizgi deseni (dikey çubuk + 1-2 yatay/eğik işaret)
    if (d > 52 && d < 59) {
      const seg = Math.floor(a * 24);
      const fx = a * 24 - seg; // kutu içi 0..1 (açısal)
      const fy = (d - 52) / 7; // 0..1 (radyal)
      if (fx < 0.12 || fx > 0.88) return null;
      const h1 = hash2(seg, 1, 7);
      const h2 = hash2(seg, 2, 7);
      const h3 = hash2(seg, 3, 7);
      const stem = Math.abs(fx - (0.3 + h1 * 0.4)) < 0.07;
      const bar = Math.abs(fy - (0.25 + h2 * 0.5)) < 0.1 && fx > 0.2 && fx < 0.8;
      const diag = h3 > 0.5 && Math.abs(fy - (fx - 0.15)) < 0.09;
      return stem || bar || diag ? { c: '#ffffff', a: 0.9 } : null;
    }
    // iç kuşakta 6 ince kiriş (mühür geometrisi)
    if (d < 50 && d > 24) {
      for (let i = 0; i < 3; i++) {
        const th = (i / 3) * Math.PI;
        const dist = Math.abs(dx * Math.sin(th) - dy * Math.cos(th));
        if (dist < 0.5) return { c: '#ffffff', a: 0.35 };
      }
    }
    return null;
  });

/** Buz mızrağı (aşağı bakan ince kristal): yarı saydam, iki yüzlü, keskin ışık kenarı. */
const shardTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:shard', 12, 44, (x, y) => {
    const ny = (y + 0.5) / 44; // 0 kök, 1 uç
    const half = 5.6 * (1 - ny) ** 0.9;
    const dx = x + 0.5 - 6;
    if (Math.abs(dx) > half) return null;
    if (Math.abs(dx) > half - 0.9) return { c: dx < 0 ? '#ffffff' : '#4f86a8', a: 0.95 };
    return { c: dx < -0.5 ? '#e4f8ff' : dx < 1 ? '#bfe7f8' : '#8cc4e2', a: 0.72 };
  });

/** Kalkan küresi: içi neredeyse saydam, ince fresnel kenarı, silik petek örgüsü ve ince parlama yayı. */
const shellTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:shell', 80, 80, (x, y) => {
    const dx = (x + 0.5 - 40) / 40;
    const dy = (y + 0.5 - 40) / 40;
    const d = Math.hypot(dx, dy);
    if (d >= 1) return null;
    if (d > 0.955) return { c: '#ffffff', a: 0.85 };
    if (d > 0.9) return { c: '#ffffff', a: 0.4 };
    // petek: altıgen ızgara kenarları (küre üstünde basit izdüşüm)
    const sx = dx / Math.sqrt(Math.max(0.05, 1 - d * d)) * 2.2;
    const sy = dy / Math.sqrt(Math.max(0.05, 1 - d * d)) * 2.2;
    const hq = (2 / 3) * sx;
    const hr = (-1 / 3) * sx + (Math.sqrt(3) / 3) * sy;
    const cube = [hq, hr, -hq - hr];
    const fr = cube.map((v) => Math.abs(v - Math.round(v)));
    const edge = Math.max(...fr) > 0.44;
    // parlama yayı (üst-sol)
    const spec = Math.abs(Math.hypot(dx + 0.12, dy + 0.12) - 0.72) < 0.03 && dx < -0.1 && dy < -0.1;
    if (spec) return { c: '#ffffff', a: 0.7 };
    if (edge && d < 0.88) return { c: '#ffffff', a: 0.16 + d * 0.12 };
    return { c: '#ffffff', a: 0.03 + d ** 4 * 0.18 };
  });

/** Isı titremesi için yumuşak RGB gürültü (kamera displacement haritası; yalnızca WebGL). */
function hazeTexture(s: Phaser.Scene): string {
  const key = 'v2mage:haze';
  if (s.textures.exists(key)) return key;
  const tex = s.textures.createCanvas(key, 128, 128);
  if (!tex) return key;
  const ctx = tex.getContext();
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      img.data[i] = Math.round(fbm(x / 9, y / 5, 211, 3) * 255);
      img.data[i + 1] = Math.round(fbm(x / 9 + 30, y / 5, 223, 3) * 255);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}

// =====================================================================================================================
// YARDIMCILAR

function glow(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, tint: number, alpha: number, depth = k.DEPTH + 40): Img {
  return c.scene.add.image(x, y, dotTex(k, c.scene)).setDisplaySize(size, size).setTint(tint).setAlpha(alpha).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
}

/** Nesneyi söndürüp yok eder. */
function fade(c: VfxCtx, k: VfxKit, obj: Phaser.GameObjects.GameObject, delay: number, dur: number, extra: Record<string, unknown> = {}): void {
  c.scene.tweens.add({ targets: obj, alpha: 0, delay: k.slow(delay), duration: k.slow(dur), ...extra, onComplete: () => obj.destroy() });
}

/** Sıcak (beyaz değil) kısa ekran parlaması: turuncu, ışık gibi (ADD), hızlı söner. */
function warmFlash(c: VfxCtx, k: VfxKit, tint: number, alpha: number, dur: number): void {
  const r = c.scene.add.rectangle(960, 540, FULL_W, 1080, tint, alpha).setDepth(k.DEPTH - 20).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: r, alpha: 0, duration: k.slow(dur), ease: 'Quad.easeOut', onComplete: () => r.destroy() });
}

/**
 * Ateş topu katmanı: gürültü dokulu ateş topağı büyür, yükselir, varyant değiştirerek titrer ve SOĞUR (tint: sıcak -> koyu kızıl -> is),
 * sonra söner. Normal karışım (koyu kızıl ve is görünsün); `light` verilirse altında sıcak ADD ışık.
 */
function fireball(c: VfxCtx, k: VfxKit, x: number, y: number, o: { size: [number, number]; life: number; rise?: number; drift?: number; delay?: number; depth?: number; light?: number; fadeFrom?: number; cool?: [number, number] }): void {
  const v0 = Math.floor(k.rnd(0, 4));
  const img = c.scene.add.image(x, y, fireTex(k, c.scene, v0)).setDisplaySize(o.size[0], o.size[0]).setDepth(o.depth ?? k.DEPTH + 38).setRotation(k.rnd(-0.6, 0.6)).setFlipX(Math.random() < 0.5);
  const lt = o.light ? glow(c, k, x, y, o.size[1] * 1.3, 0xff7a2a, 0, (o.depth ?? k.DEPTH + 38) - 1) : null;
  img.setVisible(false);
  const rise = o.rise ?? 0;
  const drift = o.drift ?? 0;
  void k.wait(c.scene, k.slow(o.delay ?? 0)).then(() => {
    img.setVisible(true);
    let lastV = -1;
    void k.counter(c.scene, k.slow(o.life), (u) => {
      const e = 1 - (1 - u) ** 2.2;
      const s = o.size[0] + (o.size[1] - o.size[0]) * e;
      img.setDisplaySize(s, s).setPosition(k.snap(x + drift * e), k.snap(y - rise * e ** 1.3));
      const vv = Math.floor(u * 9) % 4;
      if (vv !== lastV) {
        lastV = vv;
        img.setTexture(fireTex(k, c.scene, (v0 + vv) % 4));
      }
      const ff = o.fadeFrom ?? 0.7;
      const cl = o.cool ?? [0.12, 0.8];
      img.setTint(coolTint(clamp01((u - cl[0]) / cl[1]))).setAlpha(u > ff ? (1 - u) / (1 - ff) : 1);
      if (lt) lt.setPosition(img.x, img.y).setAlpha((o.light ?? 0) * (1 - u) ** 1.5);
      if (u >= 1) {
        img.destroy();
        lt?.destroy();
      }
    });
  });
}

/** Yavaş yükselip genişleyen, rüzgârla kayan koyu duman (normal karışım). */
function smoke(c: VfxCtx, k: VfxKit, x: number, y: number, o: { n: number; spread: number; size: [number, number]; rise: [number, number]; life: [number, number]; tint?: number | number[]; alpha?: number; drift?: number; jitter?: number; delay?: [number, number]; depth?: number; grow?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const s = k.rnd(o.size[0], o.size[1]);
    const p = c.scene.add
      .image(x + k.rnd(-o.spread, o.spread), y + k.rnd(-o.spread * 0.3, o.spread * 0.3), smokeTex(k, c.scene, i % 3))
      .setDisplaySize(s * 0.55, s * 0.55)
      .setTint(Array.isArray(o.tint) ? k.pick(o.tint) : (o.tint ?? 0x2e2622))
      .setAlpha(0)
      .setDepth(o.depth ?? k.DEPTH + 22)
      .setRotation(k.rnd(0, 6))
      .setFlipX(Math.random() < 0.5);
    const life = k.rnd(o.life[0], o.life[1]);
    const dl = o.delay ? k.rnd(o.delay[0], o.delay[1]) : 0;
    const g = o.grow ?? 1.5;
    c.scene.tweens.add({ targets: p, alpha: o.alpha ?? 0.6, delay: k.slow(dl), duration: k.slow(life * 0.15) });
    c.scene.tweens.add({ targets: p, x: p.x + (o.drift ?? 0) * k.rnd(0.6, 1.2) + k.rnd(-(o.jitter ?? 0), o.jitter ?? 0), y: p.y - k.rnd(o.rise[0], o.rise[1]), displayWidth: s * g, displayHeight: s * g, rotation: p.rotation + k.rnd(-0.5, 0.5), delay: k.slow(dl), duration: k.slow(life), ease: 'Sine.easeOut' });
    fade(c, k, p, dl + life * 0.35, life * 0.65, { ease: 'Sine.easeIn' });
  }
}

/** Parçacık: fizik (yerçekimi, sürtünme), kıvılcım soğur (rampa), kül salınır, kar rüzgârla eğik iner. */
type Part = { x: number; y: number; vx: number; vy: number; g: number; drag: number; life: number; age: number; size: number; kind: 'spark' | 'ash' | 'snow' | 'ice' | 'mote'; heat?: number; floor?: number; ph?: number; a?: number; col?: number };

/** Tek Graphics üzerinde parçacık alanı çizer; `spawn` her karede yeni parçacık ekleyebilir. dur: efekt (yavaşlatılmamış) ms. */
function particles(c: VfxCtx, k: VfxKit, depth: number, dur: number, init: Part[], spawn?: (t: number, dt: number, out: Part[]) => void): Phaser.GameObjects.Graphics {
  const g = c.scene.add.graphics().setDepth(depth);
  const ps = init.slice();
  let last = 0;
  void k.counter(c.scene, k.slow(dur), (u) => {
    const t = u * dur;
    const dt = Math.min(50, t - last) / 1000;
    last = t;
    if (spawn) spawn(t, dt * 1000, ps);
    g.clear();
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.age += dt * 1000;
      if (p.age >= p.life) {
        ps.splice(i, 1);
        continue;
      }
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        // yere oturur: kıvılcım/kor yerde kalıp sönmeye devam eder
        p.y = p.floor;
        p.vy = 0;
        p.vx *= 0.3;
        p.g = 0;
      }
      const q = p.age / p.life;
      const s = p.size;
      if (p.kind === 'spark') {
        const h = (p.heat ?? 0.85) * (1 - q) ** 0.8;
        if (h < 0.2) continue;
        g.fillStyle(fireNum(h), q > 0.85 ? (1 - q) / 0.15 : 1);
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 140) {
          // hızlı kıvılcım: hız yönünde kısa çizgi
          const lx = (p.vx / sp) * s * 1.6;
          const ly = (p.vy / sp) * s * 1.6;
          g.fillRect(k.snap(p.x - lx), k.snap(p.y - ly), s, s);
        }
        g.fillRect(k.snap(p.x), k.snap(p.y), s, s);
      } else if (p.kind === 'ash') {
        const sw = Math.sin(p.age * 0.006 + (p.ph ?? 0)) * 10;
        g.fillStyle(p.col ?? 0x6e6862, (p.a ?? 0.85) * (q > 0.7 ? (1 - q) / 0.3 : 1)).fillRect(k.snap(p.x + sw), k.snap(p.y), s, Math.max(2, s - 2));
      } else if (p.kind === 'snow') {
        const al = (p.a ?? 0.8) * (q > 0.85 ? (1 - q) / 0.15 : q < 0.1 ? q / 0.1 : 1);
        g.fillStyle(p.col ?? 0xffffff, al);
        if (s >= 4) {
          // yakın tanecik: hız yönünde iz (rüzgârla eğik çizgi)
          const sp = Math.hypot(p.vx, p.vy) || 1;
          for (let j = 1; j <= 2; j++) g.fillRect(k.snap(p.x - (p.vx / sp) * s * j), k.snap(p.y - (p.vy / sp) * s * j), s - 2, s - 2);
        }
        g.fillRect(k.snap(p.x), k.snap(p.y), s, s);
      } else if (p.kind === 'ice') {
        g.fillStyle(p.col ?? 0xe4f8ff, (p.a ?? 0.9) * (1 - q * q)).fillRect(k.snap(p.x), k.snap(p.y), s, Math.max(2, s - 2));
      } else {
        g.fillStyle(p.col ?? 0xa8ebff, (p.a ?? 0.8) * Math.sin(q * Math.PI)).fillRect(k.snap(p.x), k.snap(p.y), s, s);
      }
    }
    if (u >= 1) g.destroy();
  });
  return g;
}

/** Kıvılcım demeti (soğuyan, yerçekimli). */
function sparks(x: number, y: number, n: number, k: VfxKit, o: { speed: [number, number]; angle?: [number, number]; g?: number; life?: [number, number]; size?: [number, number]; heat?: number; floor?: number }): Part[] {
  return Array.from({ length: n }, () => {
    const a = k.rnd(o.angle?.[0] ?? -Math.PI, o.angle?.[1] ?? 0);
    const sp = k.rnd(o.speed[0], o.speed[1]);
    return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? 900, drag: 1.2, life: k.rnd(o.life?.[0] ?? 400, o.life?.[1] ?? 800), age: 0, size: k.snap(k.rnd(o.size?.[0] ?? 2, o.size?.[1] ?? 4)) || 2, kind: 'spark' as const, heat: o.heat ?? k.rnd(0.75, 0.95), floor: o.floor };
  });
}

/** İnce rünlü mühür: yatık elips olarak yumuşakça açılır (sıçramadan), hafif parlaklık nabzı, söner. */
function runeSigil(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, flat: number, o: { open?: number; hold?: number; depth?: number; tint?: number; alpha?: number; flatX?: number } = {}): Img {
  const s = c.scene.add.image(x, y, runeRingTex(k, c.scene)).setDisplaySize(size, size).setTint(o.tint ?? 0xe8b860).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0).setDepth(o.depth ?? k.DEPTH + 24);
  const base = s.scaleX;
  const fx = o.flatX ?? 1;
  s.setScale(base * 0.6 * fx, base * 0.6 * flat);
  const open = o.open ?? 260;
  c.scene.tweens.add({ targets: s, scaleX: base * fx, scaleY: base * flat, alpha: o.alpha ?? 0.9, duration: k.slow(open), ease: 'Sine.easeOut' });
  if (flat === 1 && fx === 1) c.scene.tweens.add({ targets: s, angle: 40, duration: k.slow(open + (o.hold ?? 400) + 400) });
  fade(c, k, s, open + (o.hold ?? 400), 360);
  return s;
}

/** Avuç alevi kabarır: mavi çekirdek ve içe çekilen birkaç ince kıvılcım (abartısız). */
function palmFlare(c: VfxCtx, k: VfxKit, p: Pt, dur: number, tint = 0x4aa3ff): void {
  const outer = glow(c, k, p.x, p.y, 30, tint, 0);
  const core = glow(c, k, p.x, p.y, 14, 0xd8f6ff, 0);
  c.scene.tweens.add({ targets: outer, alpha: 0.75, displayWidth: 90, displayHeight: 90, duration: k.slow(dur), ease: 'Quad.easeIn' });
  c.scene.tweens.add({ targets: core, alpha: 0.95, displayWidth: 34, displayHeight: 34, duration: k.slow(dur), ease: 'Quad.easeIn' });
  fade(c, k, outer, dur, 160);
  fade(c, k, core, dur, 120);
  particles(c, k, k.DEPTH + 42, dur, Array.from({ length: 6 }, () => {
    const a = k.rnd(0, Math.PI * 2);
    const r = k.rnd(50, 80);
    const life = k.rnd(dur * 0.6, dur);
    return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, vx: (-Math.cos(a) * r) / (life / 1000), vy: (-Math.sin(a) * r) / (life / 1000), g: 0, drag: 0, life, age: 0, size: 2, kind: 'mote' as const, col: 0xa8ebff };
  }));
}

/** Asanın kristali parlar (buz/kalkan büyüleri): yumuşak ışık, ışın yok. */
function staffFlare(c: VfxCtx, k: VfxKit, dur: number, tint: number): Pt {
  const p = staffOf(c.actor);
  const g1 = glow(c, k, p.x, p.y, 24, tint, 0);
  const g2 = glow(c, k, p.x, p.y, 12, 0xffffff, 0);
  c.scene.tweens.add({ targets: g1, alpha: 0.7, displayWidth: 100, displayHeight: 100, duration: k.slow(dur), ease: 'Sine.easeOut' });
  c.scene.tweens.add({ targets: g2, alpha: 0.9, displayWidth: 28, displayHeight: 28, duration: k.slow(dur), ease: 'Sine.easeOut' });
  fade(c, k, g1, dur, 300);
  fade(c, k, g2, dur, 220);
  return p;
}

/** Yerden fışkıran gerçekçi alev dilleri: dipte geniş ve sıcak, kıvrılarak yükselir, varyant değiştirip titrer, incelip soğuyarak söner. */
function flames(c: VfxCtx, k: VfxKit, x: number, y: number, n: number, w: number, h: [number, number], o: { life?: [number, number]; stagger?: number; depth?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const v0 = Math.floor(k.rnd(0, 4));
    const H = k.rnd(h[0], h[1]);
    const W = H * k.rnd(0.42, 0.6);
    const fx = x + (n === 1 ? 0 : ((i / (n - 1)) - 0.5) * w) + k.rnd(-w * 0.08, w * 0.08);
    const fy = y + k.rnd(-3, 4);
    const f = c.scene.add.image(fx, fy, flameTex(k, c.scene, v0)).setOrigin(0.5, 1).setDisplaySize(W, 4).setDepth(o.depth ?? fy + 2).setFlipX(Math.random() < 0.5);
    const life = k.rnd(o.life?.[0] ?? 520, o.life?.[1] ?? 820);
    const dl = i * (o.stagger ?? 18) + k.rnd(0, 30);
    f.setVisible(false);
    void k.wait(c.scene, k.slow(dl)).then(() => {
      f.setVisible(true);
      let lastV = -1;
      void k.counter(c.scene, k.slow(life), (u) => {
        const up = Math.min(1, u / 0.22);
        const hh = H * (1 - (1 - up) ** 2) * (u > 0.6 ? 1 - (u - 0.6) * 0.9 : 1);
        const ww = W * (u > 0.5 ? 1 - (u - 0.5) * 1.1 : 1);
        f.setDisplaySize(Math.max(2, ww), Math.max(2, hh));
        const vv = Math.floor(u * 11) % 4;
        if (vv !== lastV) {
          lastV = vv;
          f.setTexture(flameTex(k, c.scene, (v0 + vv) % 4));
        }
        f.setTint(coolTint(clamp01((u - 0.45) / 0.6))).setAlpha(u > 0.75 ? (1 - u) / 0.25 : 1);
        if (u >= 1) f.destroy();
      });
    });
  }
}

/** Yanık izi + üstünde nabız atan korlar; yavaş söner. */
function scorch(c: VfxCtx, k: VfxKit, x: number, y: number, w: number, o: { delay?: number; hold?: number } = {}): void {
  const s = c.scene.add.image(x, y, scorchTex(k, c.scene)).setDisplaySize(w, w * 0.44).setDepth(k.FLOOR_FX + 1).setAlpha(0).setFlipX(Math.random() < 0.5);
  const e = c.scene.add.image(x, y, emberBedTex(k, c.scene)).setDisplaySize(w, w * 0.44).setDepth(k.FLOOR_FX + 2).setAlpha(0).setBlendMode(k.Phaser.BlendModes.ADD).setFlipX(Math.random() < 0.5);
  const dl = o.delay ?? 0;
  const hold = o.hold ?? 900;
  c.scene.tweens.add({ targets: s, alpha: 1, delay: k.slow(dl), duration: k.slow(160) });
  c.scene.tweens.add({ targets: e, alpha: 1, delay: k.slow(dl), duration: k.slow(120) });
  // korlar nefes alır (yavaş, düzensiz değil ama yumuşak) ve söner
  c.scene.tweens.add({ targets: e, alpha: 0.55, delay: k.slow(dl + 200), duration: k.slow(260), yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
  fade(c, k, e, dl + hold * 0.7, hold * 0.8);
  fade(c, k, s, dl + hold, 1100);
}

/** Kamera ısı titremesi (WebGL displacement). Canvas'ta ya da FX yoksa hiçbir şey yapmaz. `level(0..1)` şiddet; `stop()` kaldırır. */
function heatHaze(c: VfxCtx, k: VfxKit): { level: (a: number) => void; stop: () => void } {
  const cam = c.scene.cameras.main;
  const fxp = (cam as unknown as { postFX?: Phaser.GameObjects.Components.FX }).postFX;
  if (!fxp || c.scene.sys.game.renderer.type !== k.Phaser.WEBGL) return { level: () => undefined, stop: () => undefined };
  let fx: Phaser.FX.Displacement | null = null;
  try {
    fx = fxp.addDisplacement(hazeTexture(c.scene), 0, 0);
  } catch {
    fx = null;
  }
  if (!fx) return { level: () => undefined, stop: () => undefined };
  let lvl = 0;
  let alive = true;
  const tick = (time: number): void => {
    if (!fx) return;
    fx.x = lvl * 0.0032 * Math.sin(time * 0.031);
    fx.y = lvl * 0.0042 * Math.sin(time * 0.047 + 1.3);
  };
  c.scene.events.on('update', tick);
  const stop = (): void => {
    if (!alive) return;
    alive = false;
    c.scene.events.off('update', tick);
    if (fx) fxp.remove(fx);
    fx = null;
  };
  c.scene.time.delayedCall(4000, stop); // güvence: efekt yarıda kesilse de kalkar
  return { level: (a) => (lvl = a), stop };
}

// =====================================================================================================================
// FIRE BOLT

/**
 * Fire Bolt: avuçtaki mavi alev kabarır, önünde ince rünlü mühür (yandan görünen elips) belirir; alev mühürden geçip yoğun bir ateş oku
 * olur: beyaz-sarı küçük çekirdek, arkasında her karede doğup soğuyan gürültülü ateş topakları (kıvrak, düzensiz kuyruk), ince is ve tek
 * tük soğuyan kıvılcım. Çarpınca: kısa sıcak ışık, küçük katmanlı ateş patlaması (soğuyup ise döner), gövdede kısa alev dilleri, yükselen
 * is, yere düşen kıvılcımlar, yanık izi. İlk hasar ~0,67 sn (v1 ~0,74 sn).
 */
const fireBolt: V2Vfx = async (c, k) => {
  const f = face(c.actor);
  const hand = handOf(c.actor);
  c.actor.play('cast');
  c.sfx('flameIgnite');
  palmFlare(c, k, hand, 240);
  runeSigil(c, k, hand.x + f * 44, hand.y, 92, 1, { open: 200, hold: 200, flatX: 0.3, tint: 0xe8b860, alpha: 0.75 });
  await k.wait(c.scene, k.slow(270));
  c.actor.play('idle');
  await Promise.all(
    c.targets.map(async (t) => {
      c.sfx('flameRoar');
      const from = { x: hand.x + f * 44, y: hand.y };
      const to = k.spot(t);
      const dir = to.x >= from.x ? 1 : -1;
      const arc = Math.min(50, Math.abs(to.x - from.x) * 0.05);
      const core = glow(c, k, from.x, from.y, 26, 0xfff2c0, 1, k.DEPTH + 34);
      const halo = glow(c, k, from.x, from.y, 110, 0xff6a1a, 0.5, k.DEPTH + 31);
      const head = c.scene.add.image(from.x, from.y, fireTex(k, c.scene, 0)).setDisplaySize(64, 64).setDepth(k.DEPTH + 33);
      const body = c.scene.add.image(from.x, from.y, streakTex(k, c.scene, 0)).setOrigin(1, 0.5).setDisplaySize(170, 46).setDepth(k.DEPTH + 32).setFlipX(dir < 0);
      let px = from.x;
      let py = from.y;
      let n = 0;
      await k.counter(c.scene, k.slow(300), (u) => {
        const e = u * u * 0.4 + u * 0.6;
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * arc;
        core.setPosition(x, y);
        halo.setPosition(x - dir * 10, y).setAlpha(0.42 + 0.1 * Math.sin(u * 50));
        head.setPosition(k.snap(x - dir * 6), k.snap(y)).setTexture(fireTex(k, c.scene, Math.floor(u * 20) % 4)).setRotation(k.rnd(-0.3, 0.3));
        // gövde: başın arkasında kızgın iz (uçuş yönüne dönük)
        const ex = from.x + (to.x - from.x) * Math.min(1, e + 0.02);
        const ey = from.y + (to.y - from.y) * Math.min(1, e + 0.02) - Math.sin(Math.min(1, e + 0.02) * Math.PI) * arc;
        const rot = Math.atan2(ey - y, ex - x);
        body.setOrigin(dir > 0 ? 1 : 0, 0.5).setPosition(k.snap(x + dir * 14), k.snap(y)).setRotation(dir > 0 ? rot : rot - Math.PI).setTexture(streakTex(k, c.scene, Math.floor(u * 24) % 2)).setDisplaySize(130 + 60 * Math.min(1, u * 3), 44);
        // kuyruk: geçtiği yol boyunca soğuyan ateş topakları (kare hızından bağımsız: mesafeye göre)
        const dist = Math.hypot(x - px, y - py);
        const steps = Math.min(8, Math.floor(dist / 9));
        for (let i = 1; i <= steps; i++) {
          const qx = px + ((x - px) * i) / steps;
          const qy = py + ((y - py) * i) / steps;
          n++;
          fireball(c, k, qx - dir * 12 + k.rnd(-4, 4), qy + k.rnd(-5, 5), { size: [k.rnd(24, 32), k.rnd(44, 58)], life: k.rnd(110, 170), rise: k.rnd(8, 22), drift: -dir * k.rnd(6, 16), depth: k.DEPTH + 30, fadeFrom: 0, cool: [0, 0.7] });
          if (n % 6 === 0) smoke(c, k, qx - dir * 30, qy, { n: 1, spread: 4, size: [22, 34], rise: [30, 60], life: [600, 800], alpha: 0.32, drift: -dir * 10 });
        }
        if (steps) {
          px = x;
          py = y;
        }
      });
      core.destroy();
      halo.destroy();
      head.destroy();
      body.destroy();
      // ÇARPMA: küçük ateş patlaması
      c.sfx('fireBlast');
      warmFlash(c, k, 0xff7a2a, 0.08, 180);
      k.shake(c.scene, 90, 0.004);
      const hitGlow = glow(c, k, to.x, to.y, 70, 0xfff2c0, 0.95, k.DEPTH + 46);
      c.scene.tweens.add({ targets: hitGlow, displayWidth: 150, displayHeight: 150, alpha: 0, duration: k.slow(180), ease: 'Quad.easeOut', onComplete: () => hitGlow.destroy() });
      fireball(c, k, to.x, to.y, { size: [60, 150], life: 380, rise: 26, depth: k.DEPTH + 40, light: 0.55, cool: [0.1, 0.5], fadeFrom: 0.25 });
      for (let i = 0; i < 4; i++) fireball(c, k, to.x + k.rnd(-26, 26), to.y + k.rnd(-22, 18), { size: [30, k.rnd(70, 100)], life: k.rnd(300, 440), rise: k.rnd(20, 60), drift: k.rnd(-20, 20), delay: i * 30, depth: k.DEPTH + 39, cool: [0.05, 0.5], fadeFrom: 0.25 });
      particles(c, k, k.DEPTH + 44, 900, sparks(to.x, to.y, 9, k, { speed: [120, 380], angle: [-Math.PI * 0.95, -Math.PI * 0.05], g: 900, life: [350, 750], floor: t.container.y + k.rnd(-6, 6) }));
      flames(c, k, to.x, t.container.y - 4, 3, t.w * 0.45, [60, 95], { life: [380, 560], depth: t.container.depth + 1 });
      const lg = glow(c, k, to.x, t.container.y - t.h * 0.35, t.w * 1.5, 0xff6a1a, 0.3, k.DEPTH + 20);
      fade(c, k, lg, 160, 480);
      smoke(c, k, to.x, to.y - 20, { n: 6, spread: 26, size: [56, 90], rise: [90, 170], life: [1100, 1500], alpha: 0.62, tint: [0x2a221e, 0x3a302a], drift: -dir * 24, jitter: 16, delay: [80, 240] });
      scorch(c, k, t.container.x, t.container.y - 2, t.w * 0.85, { delay: 60, hold: 700 });
    }),
  );
};

// =====================================================================================================================
// BLIZZARD

/** Blizzard'ın kırağısı: hücreler merkezden dışa donar; ince kırağı benekleri ve dallanan kristal çizgiler (kontur yok). */
function frostFloor(c: VfxCtx, k: VfxKit, slots: number[], center: Pt): { g: Phaser.GameObjects.Graphics; draw: (u: number) => void } {
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX);
  const cells = slots.map((s) => {
    const q = k.quadOf(c.board, s, 0.97);
    const m = k.cellMid(c.board, s);
    const specks = Array.from({ length: 34 }, () => ({ p: k.inQuad(q, 0.95), w: Math.random() < 0.25 ? 4 : 2, c: Math.random() < 0.3 ? 0xbfe7f8 : 0xf2fcff }));
    const veins = Array.from({ length: 4 }, () => {
      let p = k.inQuad(q, 0.6);
      let a = k.rnd(0, Math.PI * 2);
      return Array.from({ length: 10 }, () => {
        a += k.rnd(-0.6, 0.6);
        return (p = { x: p.x + Math.cos(a) * 7, y: p.y + Math.sin(a) * 2.8 });
      });
    });
    return { q, m, specks, veins, d: Math.hypot(m.x - center.x, m.y - center.y) };
  });
  const span = Math.max(1, ...cells.map((x) => x.d));
  const shrink = (q: Pt[], s: number) => {
    const cx = (q[0]!.x + q[2]!.x) / 2;
    const cy = (q[0]!.y + q[2]!.y) / 2;
    return q.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
  };
  const draw = (u: number) => {
    g.clear();
    for (const cl of cells) {
      const v = clamp01((u - (cl.d / span) * 0.45) / 0.55);
      if (v <= 0) continue;
      const e = 1 - (1 - v) ** 2;
      g.fillStyle(0x9fd4ef, 0.2 * e).fillPoints(shrink(cl.q, 0.35 + 0.65 * e), true);
      g.fillStyle(0xe4f8ff, 0.14 * e).fillPoints(shrink(cl.q, (0.35 + 0.65 * e) * 0.6), true);
      const nS = Math.floor(cl.specks.length * e);
      for (let i = 0; i < nS; i++) g.fillStyle(cl.specks[i]!.c, 0.75).fillRect(k.snap(cl.specks[i]!.p.x), k.snap(cl.specks[i]!.p.y), cl.specks[i]!.w, 2);
      for (const vein of cl.veins) {
        const n = Math.floor(vein.length * e);
        for (let i = 0; i < n; i++) g.fillStyle(0xf2fcff, 0.55).fillRect(k.snap(vein[i]!.x), k.snap(vein[i]!.y), 2, 2);
      }
    }
  };
  return { g, draw };
}

/**
 * Blizzard (rect 3x2): asanın kristali soğuk parlar; ekran soğuk maviye kararır, alanın üstünde yırtık, gürültü dokulu koyu fırtına bulutu
 * rüzgârla akar. İnce kar RÜZGÂRLA EĞİK ve yoğun yağar (uzak taneler küçük ve silik, yakınlar iz bırakır), yerde soğuk sis süzülür, hücreler
 * merkezden dışa kırağılanır. Sonra ince, yarı saydam buz mızrakları rüzgâr açısıyla saplanır ve ince kırıntılara dağılır (buz sisi);
 * ilk mızrak yere değince hasar. Hedeflerin ayağında kısa, saydam buz kabuğu. İlk hasar ~0,97 sn, fırtına toplam ~0,25 sn daha uzun (2026-10-09; v1 ilk hasar ~1,4 sn).
 */
const blizzard: V2Vfx = async (c, k) => {
  c.sfx('windHowl');
  c.actor.play('cast');
  const crystalAt = staffFlare(c, k, 300, 0x8fd8ff);
  particles(c, k, k.DEPTH + 42, 900, Array.from({ length: 6 }, () => ({ x: crystalAt.x + k.rnd(-8, 8), y: crystalAt.y + k.rnd(-8, 8), vx: k.rnd(-30, 30), vy: k.rnd(-70, -30), g: -20, drag: 1, life: k.rnd(500, 850), age: 0, size: 2, kind: 'ice' as const, a: 0.8 })));
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const cells = slots.map((s) => ({ s, q: k.quadOf(c.board, s, 0.92), m: k.cellMid(c.board, s) }));
  const xs = cells.flatMap((x) => x.q.map((p) => p.x));
  const ys = cells.flatMap((x) => x.q.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yTop = Math.min(...ys);
  const yBot = Math.max(...ys);
  const center = c.centerPos ?? { x: (x0 + x1) / 2, y: (yTop + yBot) / 2 };
  const cloudY = yTop - 300;
  const wind = c.board === 'enemy' ? 1 : -1; // büyücüden uzağa
  const slant = 0.62; // kar düşüş eğimi (vx / vy)
  // 1) soğuk karartma + rüzgârla savrulan kar perdesi (beyazlık: yarı saydam, gürültülü sis katmanları alanı süpürür; çizgi film bulutu yok)
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x0a1828, 1).setAlpha(0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.32, duration: k.slow(420) });
  const clouds: Img[] = [];
  const span = x1 - x0 + 360;
  const nVeil = Math.max(5, Math.round(span / 160));
  for (let i = 0; i < nVeil; i++) {
    const layer = i % 2;
    const x = x0 - 180 + (span * (i + 0.5)) / nVeil + k.rnd(-30, 30);
    const y = k.rnd(cloudY + 120, yBot - 40);
    const w = k.rnd(260, 380);
    const p = c.scene.add.image(x - wind * 220, y, smokeTex(k, c.scene, i % 3)).setDisplaySize(w, w * 0.42).setTint(layer ? 0xc8dcea : 0xe6f0f6).setAlpha(0).setDepth(k.DEPTH + 18 + layer).setRotation(k.rnd(-0.2, 0.2)).setFlipX(Math.random() < 0.5);
    c.scene.tweens.add({ targets: p, alpha: layer ? 0.22 : 0.3, duration: k.slow(k.rnd(380, 520)), delay: k.slow(i * 30) });
    c.scene.tweens.add({ targets: p, x: x + wind * k.rnd(220, 320), y: y + k.rnd(10, 40), displayWidth: w * 1.3, duration: k.slow(2900), delay: k.slow(i * 30), ease: 'Linear' });
    clouds.push(p);
  }
  // 2) kar: tek Graphics, yoğun, rüzgârla eğik (alanın biraz dışına da taşar)
  let snowOn = true;
  let acc = 0;
  const snowG = particles(c, k, k.DEPTH + 20, 3300, [], (_t, dt, out) => {
    if (!snowOn) return;
    acc += dt * 0.69; // ~690 tane / sn (Ömer 2026-10-09: +%15)
    while (acc >= 1) {
      acc -= 1;
      const near = Math.random() < 0.28;
      const vy = near ? k.rnd(620, 820) : k.rnd(380, 560);
      const floor = k.rnd(yTop - 10, yBot + 6);
      const life = ((floor - cloudY - 20) / vy) * 1000;
      const sx = k.rnd(x0 - 160, x1 + 160) - wind * slant * (floor - cloudY);
      out.push({ x: sx, y: cloudY + k.rnd(10, 40), vx: wind * vy * slant * k.rnd(0.85, 1.15), vy, g: 0, drag: 0, life, age: 0, size: near ? 4 : Math.random() < 0.5 ? 2 : 3, kind: 'snow', a: near ? 0.9 : k.rnd(0.45, 0.8), col: Math.random() < 0.25 ? 0xd8eef8 : 0xffffff });
    }
  });
  await k.wait(c.scene, k.slow(240));
  c.actor.play('idle');
  c.sfx('hailPatter');
  // 3) zemin kırağılanır + soğuk sis
  const frost = frostFloor(c, k, slots, center);
  void k.counter(c.scene, k.slow(600), (u) => frost.draw(u), 'Quad.easeOut');
  for (let i = 0; i < Math.max(4, cells.length); i++) {
    const cl = cells[i % cells.length]!;
    const p = k.inQuad(cl.q, 0.8);
    const m = c.scene.add.image(p.x - wind * 60, p.y - 8, smokeTex(k, c.scene, i % 3)).setDisplaySize(140, 46).setTint(0xcfe6f2).setAlpha(0).setDepth(k.DEPTH + 18);
    c.scene.tweens.add({ targets: m, alpha: 0.38, duration: k.slow(400), delay: k.slow(i * 40) });
    c.scene.tweens.add({ targets: m, x: m.x + wind * 150, displayWidth: 200, duration: k.slow(2500), delay: k.slow(i * 40), ease: 'Linear' });
    fade(c, k, m, 1550 + i * 40, 900);
  }
  await k.wait(c.scene, k.slow(360)); // fırtına biraz daha uzun sürer (Ömer 2026-10-09: +0,25 sn)
  // 4) buz mızrakları rüzgâr açısıyla saplanır
  let landed = 0;
  let firstLanded: () => void = () => undefined;
  const first = new Promise<void>((r) => (firstLanded = r));
  const iceBits: Part[] = [];
  const iceG = particles(c, k, k.DEPTH + 33, 1900, [], (_t, _dt, out) => {
    while (iceBits.length) out.push(iceBits.pop()!);
  });
  void iceG;
  const ang = Math.atan2(1, wind * slant); // düşüş yönü
  // mızrak sayısı: hedefli hücre 3, boş hücre 2; toplamın ~%15'i kadar ek mızrak hücrelere sırayla dağıtılır (Ömer 2026-10-09)
  const base = cells.map((cl) => (c.targets.some((t) => t.combatant.slot === cl.s) ? 3 : 2));
  const extra = Math.round(base.reduce((a, b) => a + b, 0) * 0.15);
  for (let i = 0; i < extra; i++) base[i % base.length]! += 1;
  const jobs = cells.flatMap((cl, ci) =>
    Array.from({ length: base[ci]! }, async (_, i) => {
      await k.wait(c.scene, k.slow(i * 155 + (ci % 3) * 30 + k.rnd(0, 40)));
      const to = i === 0 ? { x: cl.m.x + k.rnd(-12, 12), y: cl.m.y - k.rnd(24, 46) } : k.inQuad(cl.q, 0.75);
      const len = i === 0 ? 96 : k.rnd(60, 84);
      const fall = 420;
      const sp = c.scene.add.image(to.x - Math.cos(ang) * fall, to.y - Math.sin(ang) * fall, shardTex(k, c.scene)).setOrigin(0.5, 1).setDisplaySize(len * 0.27, len).setDepth(k.DEPTH + 30).setRotation(ang - Math.PI / 2);
      await k.travel(c.scene, sp, to, 190, { ease: 'in' });
      sp.destroy();
      if (landed++ === 0) firstLanded();
      if (landed % 3 === 1) c.sfx('iceCrack');
      // kırılma: ince buz kırıntıları sekip düşer, buz sisi
      for (let j = 0; j < 10; j++) {
        const a = k.rnd(-Math.PI * 0.95, -Math.PI * 0.05);
        const s = k.rnd(80, 260);
        iceBits.push({ x: to.x, y: to.y, vx: Math.cos(a) * s + wind * 40, vy: Math.sin(a) * s, g: 1300, drag: 1.5, life: k.rnd(320, 600), age: 0, size: Math.random() < 0.3 ? 4 : 2, kind: 'ice', floor: to.y + k.rnd(0, 10), col: Math.random() < 0.4 ? 0xffffff : 0xbfe7f8 });
      }
      const mist = c.scene.add.image(to.x, to.y - 6, smokeTex(k, c.scene, j3(landed))).setDisplaySize(40, 26).setTint(0xe4f4fb).setAlpha(0.55).setDepth(k.DEPTH + 26);
      c.scene.tweens.add({ targets: mist, displayWidth: 120, displayHeight: 56, alpha: 0, x: mist.x + wind * 30, y: mist.y - 16, duration: k.slow(620), ease: 'Sine.easeOut', onComplete: () => mist.destroy() });
    }),
  );
  await Promise.race([first, k.wait(c.scene, k.slow(480))]);
  // vuruş anı: kısa sarsıntı, hedeflerin ayağında saydam buz kabuğu
  k.shake(c.scene, 120, 0.004);
  for (const t of c.targets) {
    const fp = k.feet(t);
    for (let i = 0; i < 4; i++) {
      const x = fp.x + (i - 1.5) * t.w * 0.16 + k.rnd(-5, 5);
      const h = k.rnd(30, 54) * (1 - Math.abs(i - 1.5) * 0.15);
      // yukarı bakan kısa buz dikeni (doku ters: uç yukarıda), dipten büyür
      const sp = c.scene.add.image(x, fp.y + 6, shardTex(k, c.scene)).setOrigin(0.5, 1).setFlipY(true).setRotation(k.rnd(-0.3, 0.3)).setDisplaySize(h * 0.3, 2).setDepth(t.container.depth + 1);
      c.scene.tweens.add({ targets: sp, displayHeight: h, duration: k.slow(110), delay: k.slow(i * 16), ease: 'Quad.easeOut' });
      fade(c, k, sp, 650, 420);
    }
    const rime = c.scene.add.image(fp.x, fp.y - 10, smokeTex(k, c.scene, 1)).setDisplaySize(t.w * 1.1, 40).setTint(0xdff2fb).setAlpha(0.45).setDepth(t.container.depth + 2);
    c.scene.tweens.add({ targets: rime, alpha: 0, y: rime.y - 14, displayWidth: t.w * 1.4, duration: k.slow(800), onComplete: () => rime.destroy() });
  }
  // kuyruk: kar diner, bulut dağılır, kırağı erir
  void Promise.all(jobs).then(async () => {
    await k.wait(c.scene, k.slow(330));
    snowOn = false;
    c.scene.tweens.add({ targets: clouds, alpha: 0, duration: k.slow(700), onComplete: () => clouds.forEach((p) => p.destroy()) });
    c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(700), onComplete: () => dim.destroy() });
    c.scene.tweens.add({ targets: frost.g, alpha: 0, delay: k.slow(500), duration: k.slow(900), onComplete: () => frost.g.destroy() });
    void snowG;
  });
};
/** Sis dokusu varyantı (0..2). */
const j3 = (n: number): number => n % 3;

// =====================================================================================================================
// MANA BARRIER

/**
 * Mana Barrier (tek dost): asanın kristali yumuşakça parlar, kristalden dosta birkaç ince mana zerresi süzülür; dostun ayağında ince rünlü
 * mühür açılır. ARINMA (yalnızca gerçekten debuff silindiyse): ince altın bir ışık çizgisi ayaklardan başa yükselir, geçtiği yerden koyu lanet
 * dumanı kopup dağılır. Sonra yarı saydam, ince kenarlı bir küre yerden yukarı doğru örülür (silik petek örgüsü), kapanınca kenarında ince bir
 * ışık dolaşır; içinde üç küçük mana zerresi yavaşça döner (kalkan emdikçe MP). Kalkan rakamı küre kapanınca çıkar (~1,0 sn).
 */
const barrier: V2Vfx = async (c, k) => {
  c.sfx('magicHum');
  c.actor.play('cast');
  const crystalAt = staffFlare(c, k, 260, 0x6ec1ff);
  await Promise.all(
    c.targets.map(async (t) => {
      const fp = k.feet(t);
      const mid = k.spot(t);
      // kristalden dosta ince mana zerreleri (kendine atınca yok)
      if (t !== c.actor) {
        for (let i = 0; i < 7; i++) {
          const d = glow(c, k, crystalAt.x, crystalAt.y, k.rnd(8, 14), 0x8fd0ff, 0.9, k.DEPTH + 34);
          void k.wait(c.scene, k.slow(i * 26)).then(() => k.travel(c.scene, d, { x: mid.x + k.rnd(-18, 18), y: mid.y + k.rnd(-26, 26) }, 300, { ease: 'in', arc: 50 + i * 5 }).then(() => fade(c, k, d, 0, 120)));
        }
      }
      runeSigil(c, k, fp.x, fp.y - 2, Math.max(150, t.w * 1.3), 0.3, { open: 260, hold: 760, depth: k.FLOOR_FX + 3, tint: 0x8fc8ff, alpha: 0.7 });
      await k.wait(c.scene, k.slow(200));
      c.actor.play('idle');
      // ARINMA: yalnızca bu dostun debuff'ı GERÇEKTEN silindiyse (c.usage: motor olayları; olaysız önizlemede hep oynar)
      const cleansed = !c.usage || c.usage.dispelledFrom(t.combatant.uid).length > 0;
      if (cleansed) {
        c.sfx('cleanseSweep');
        const band = c.scene.add.ellipse(fp.x, fp.y, t.w * 0.95, 20).setStrokeStyle(2, 0xfff0c0, 0.85).setDepth(t.container.depth + 2).setBlendMode(k.Phaser.BlendModes.ADD);
        const bandGlow = glow(c, k, fp.x, fp.y, t.w, 0xffe6a0, 0.25, t.container.depth + 1).setDisplaySize(t.w * 1.1, 26);
        await k.counter(c.scene, k.slow(300), (u) => {
          const y = fp.y - t.h * 1.0 * u;
          band.setPosition(fp.x, y).setScale(1 - 0.3 * u, 1).setAlpha(0.85 * (1 - u * 0.4));
          bandGlow.setPosition(fp.x, y);
        }, 'Sine.easeInOut');
        fade(c, k, band, 0, 160);
        fade(c, k, bandGlow, 0, 160);
        // koyu lanet dumanı kopup dağılır
        smoke(c, k, mid.x, mid.y, { n: 6, spread: t.w * 0.28, size: [36, 60], rise: [50, 110], life: [600, 900], tint: 0x2a1636, alpha: 0.55, drift: k.rnd(-20, 20), depth: t.container.depth + 3, grow: 1.8 });
        particles(c, k, k.DEPTH + 36, 700, Array.from({ length: 6 }, () => ({ x: mid.x + k.rnd(-t.w * 0.3, t.w * 0.3), y: mid.y + k.rnd(-t.h * 0.35, t.h * 0.3), vx: k.rnd(-20, 20), vy: k.rnd(-60, -20), g: 0, drag: 0.5, life: k.rnd(400, 650), age: 0, size: 2, kind: 'mote' as const, col: 0xfff0c0 })));
      }
      // KÜRE: yerden yukarı örülür
      const R = Math.max(t.w, t.h) * 0.56;
      const shell = c.scene.add.image(mid.x, mid.y, shellTex(k, c.scene)).setDisplaySize(R * 2.05, R * 2.1).setTint(0x8fd0ff).setAlpha(0.95).setDepth(k.DEPTH + 26).setBlendMode(k.Phaser.BlendModes.ADD);
      const TH = 80;
      shell.setCrop(0, TH, TH, 0);
      // örülme kenarı: yükselen ince ışık çizgisi
      const edge = c.scene.add.rectangle(mid.x, mid.y + R, R * 1.4, 2, 0xd8f0ff, 0.8).setDepth(k.DEPTH + 27).setBlendMode(k.Phaser.BlendModes.ADD);
      await k.counter(c.scene, k.slow(280), (u) => {
        const h = TH * u;
        shell.setCrop(0, TH - h, TH, h);
        const yy = mid.y + R * 1.05 - R * 2.1 * u;
        const half = Math.sqrt(Math.max(0, 1 - ((yy - mid.y) / (R * 1.05)) ** 2)) * R;
        edge.setPosition(mid.x, yy).setSize(Math.max(2, half * 2), 2);
      }, 'Sine.easeOut');
      edge.destroy();
      shell.setCrop();
      c.sfx('domeLock');
      // kapanış: kenarda ince ışık dolaşır, kısa yumuşak parlama
      const rim = c.scene.add.image(mid.x, mid.y, shellTex(k, c.scene)).setDisplaySize(R * 2.05, R * 2.1).setTint(0xffffff).setAlpha(0.35).setDepth(k.DEPTH + 27).setBlendMode(k.Phaser.BlendModes.ADD);
      fade(c, k, rim, 0, 260);
      const soft = glow(c, k, mid.x, mid.y, R * 2.2, 0x6ec1ff, 0.22, k.DEPTH + 25);
      fade(c, k, soft, 60, 360);
      const spark = glow(c, k, mid.x, mid.y - R, 16, 0xffffff, 0.9, k.DEPTH + 29);
      void k.counter(c.scene, k.slow(420), (u) => {
        const a = -Math.PI / 2 + u * Math.PI * 2;
        spark.setPosition(mid.x + Math.cos(a) * R * 0.98, mid.y + Math.sin(a) * R * 1.02).setAlpha(0.9 * (1 - u * 0.6));
        if (u >= 1) spark.destroy();
      }, 'Sine.easeInOut');
      // içeride dönen küçük mana zerreleri (emdikçe MP)
      const orbit = Array.from({ length: 3 }, (_, i) => glow(c, k, mid.x, mid.y, 12, 0xa8e0ff, 0.8, k.DEPTH + 30).setData('ph', (i / 3) * Math.PI * 2));
      void k.counter(c.scene, k.slow(1000), (u) => {
        for (const d of orbit) {
          const a = (d.getData('ph') as number) + u * Math.PI * 2;
          d.setPosition(mid.x + Math.cos(a) * R * 0.5, mid.y + Math.sin(a) * R * 0.16 + R * 0.3).setAlpha(0.8 * (u > 0.7 ? (1 - u) / 0.3 : Math.min(1, u * 4)));
        }
        if (u >= 1) orbit.forEach((d) => d.destroy());
      });
      c.scene.tweens.add({ targets: shell, alpha: 0.5, delay: k.slow(200), duration: k.slow(360) });
      fade(c, k, shell, 700, 420);
    }),
  );
};

// =====================================================================================================================
// METEOR

/**
 * Meteor (plus): büyücü asayı kaldırır, kristal kızıl kor gibi yanar; gökyüzü sıcak bir alacakaranlığa döner ve hedef alanın üstünde, gökte
 * İNCE RÜNLÜ bir mühür açılır (yatık elips). Mührün içinden gerçek bir KAYA doğar: bazalt gövde, içinden sızan ısı damarları, öndeki eriyen
 * kenar kızgın; açılı bir yörüngeyle hızlanarak iner, arkasında kızgın iz, her karede doğup soğuyan ateş topakları ve KALIN İS izi, ara ara
 * kopan kıvılcımlar. İndikçe hava titrer (ısı bozulması), yerde gölge koyulaşır ve sıcak bir ışık lekesi büyür.
 * ÇARPMA: kısa beyaz-sarı çekirdek, SICAK turuncu ekran parlaması, kısa sert sarsıntı; kızıl ateş topu kabarıp yükselirken soğur ve yerini
 * yükselen koyu duman sütununa bırakır; gecikmeli toz şok dalgası yerde yayılır; soğuyan kıvılcımlar ve kızgın kaya parçaları savrulup yere
 * oturur; kül yağar. Artının KOLLARI: zeminde kızgın bir çatlak kola koşar, kolun hücresinde yerden gerçekçi alev dilleri fışkırır (hasar o an);
 * her hücrede kor benekli yanık izi kalır (Burning Ground ardından gelir). İlk hasar ~1,15 sn (önceki v2 ~1,22 sn, v1 ~1,27 sn); kol hasarları ~0,3 sn sonra.
 */
const meteor: V2Vfx = async (c, k) => {
  const f = face(c.actor);
  c.actor.play('cast');
  staffFlare(c, k, 260, 0xff6a1a);
  palmFlare(c, k, handOf(c.actor), 240, 0xff6a1a);
  const cell = c.centerPos ?? (c.targets[0] ? k.feet(c.targets[0]) : k.feet(c.actor));
  const cx = cell.x;
  const cy = cell.y - 30;
  const ground = cy + 44;
  // gök sıcak alacakaranlığa döner, ince mühür açılır
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x1c0806, 1).setAlpha(0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.3, duration: k.slow(400) });
  const skyX = cx - f * 430;
  const skyY = 150;
  c.sfx('sigilOpen');
  runeSigil(c, k, skyX, skyY, 280, 0.36, { open: 280, hold: 560, depth: k.DEPTH + 12, tint: 0xf0a050, alpha: 0.85 });
  const skyGlow = glow(c, k, skyX, skyY, 300, 0xff5a1a, 0, k.DEPTH + 11).setDisplaySize(320, 110);
  c.scene.tweens.add({ targets: skyGlow, alpha: 0.4, duration: k.slow(280) });
  fade(c, k, skyGlow, 720, 420);
  // yerde gölge ve sıcak ışık lekesi (kontur yok)
  const shadow = c.scene.add.ellipse(cx, ground, 40, 12, 0x000000, 0).setDepth(k.FLOOR_FX + 4);
  const heatSpot = glow(c, k, cx, ground - 6, 60, 0xff6a1a, 0, k.FLOOR_FX + 5).setDisplaySize(60, 18);
  await k.wait(c.scene, k.slow(280));
  c.actor.play('idle');
  // meteor mühürden doğar ve açılı yörüngeyle hızlanarak iner
  c.sfx('meteorWhistle');
  const haze = heatHaze(c, k);
  const end = { x: cx, y: cy - 6 };
  const ang = Math.atan2(end.y - skyY, end.x - skyX);
  const rock = c.scene.add.image(skyX, skyY, rockTex(k, c.scene, 0)).setDepth(k.DEPTH + 31).setRotation(ang);
  const streak = c.scene.add.image(skyX, skyY, streakTex(k, c.scene, 0)).setOrigin(1, 0.5).setDepth(k.DEPTH + 30).setRotation(ang);
  const halo = glow(c, k, skyX, skyY, 200, 0xff6a1a, 0.55, k.DEPTH + 29);
  const core = glow(c, k, skyX, skyY, 60, 0xffd27a, 0.7, k.DEPTH + 32);
  const trailBits: Part[] = [];
  particles(c, k, k.DEPTH + 33, 1600, [], (_t, _dt, out) => {
    while (trailBits.length) out.push(trailBits.pop()!);
  });
  const ROCK = 120; // son boy (px): alev, iz ve ışık bu boya göre
  const ROCK_BODY = ROCK * 1.1; // kayanın kendisi ~%10 daha iri (Ömer 2026-10-09), alev/iz aynı
  let px = skyX;
  let py = skyY;
  let n = 0;
  const FALL = 575;
  await k.counter(c.scene, k.slow(FALL), (u) => {
    const e = u ** 1.7;
    const x = skyX + (end.x - skyX) * e;
    const y = skyY + (end.y - skyY) * e;
    const sc = 0.3 + 0.7 * e; // perspektif: yaklaştıkça büyür
    rock.setPosition(k.snap(x), k.snap(y)).setDisplaySize(ROCK_BODY * sc, ROCK_BODY * sc).setRotation(ang + u * 0.6).setTexture(rockTex(k, c.scene, Math.floor(u * 16) % 2));
    streak.setPosition(k.snap(x + Math.cos(ang) * ROCK * sc * 0.3), k.snap(y + Math.sin(ang) * ROCK * sc * 0.3)).setDisplaySize(ROCK * sc * (2.6 + 1.6 * e), ROCK * sc * 0.95).setTexture(streakTex(k, c.scene, Math.floor(u * 22) % 2));
    halo.setPosition(x, y).setDisplaySize(260 * sc, 260 * sc).setAlpha(0.45 + 0.1 * e);
    core.setPosition(x + Math.cos(ang) * ROCK * sc * 0.28, y + Math.sin(ang) * ROCK * sc * 0.28).setDisplaySize(70 * sc, 70 * sc);
    // gölge koyulaşır, ışık lekesi büyür, hava titrer
    shadow.setSize(40 + 300 * e, 12 + 70 * e).setFillStyle(0x000000, 0.42 * e);
    heatSpot.setDisplaySize(60 + 360 * e, 18 + 90 * e).setAlpha(0.5 * e);
    haze.level(0.25 + 0.75 * e);
    // iz: geçtiği yol boyunca soğuyan ateş topakları + kalın is (mesafeye göre; kare hızından bağımsız)
    const dist = Math.hypot(x - px, y - py);
    const step = 13 * sc;
    const steps = Math.min(8, Math.floor(dist / step));
    for (let i = 1; i <= steps; i++) {
      const qx = px + ((x - px) * i) / steps;
      const qy = py + ((y - py) * i) / steps;
      n++;
      const bx = qx - Math.cos(ang) * ROCK * sc * 0.55;
      const by = qy - Math.sin(ang) * ROCK * sc * 0.55;
      fireball(c, k, bx + k.rnd(-6, 6) * sc, by + k.rnd(-6, 6) * sc, { size: [ROCK * sc * k.rnd(0.5, 0.7), ROCK * sc * k.rnd(0.9, 1.2)], life: k.rnd(150, 230), rise: k.rnd(6, 20), depth: k.DEPTH + 28, fadeFrom: 0.05, cool: [0, 0.7] });
      if (n % 2 === 0) smoke(c, k, bx - Math.cos(ang) * ROCK * sc * 0.7, by - Math.sin(ang) * ROCK * sc * 0.7, { n: 1, spread: 12 * sc, size: [ROCK * sc * 0.8, ROCK * sc * 1.4], rise: [20, 70], life: [900, 1500], alpha: 0.5, tint: [0x241c18, 0x30261f, 0x3c322b], drift: -f * 40, jitter: 20, depth: k.DEPTH + 26, grow: 2 });
      if (n % 3 === 0) trailBits.push(...sparks(bx, by, 1, k, { speed: [40, 160], angle: [ang + Math.PI - 0.7, ang + Math.PI + 0.7], g: 500, life: [300, 600], size: [2, 4] }));
    }
    if (steps) {
      px = x;
      py = y;
    }
  });
  rock.destroy();
  streak.destroy();
  halo.destroy();
  core.destroy();
  shadow.destroy();
  heatSpot.destroy();
  c.scene.tweens.add({ targets: dim, alpha: 0, delay: k.slow(300), duration: k.slow(1100), onComplete: () => dim.destroy() });
  // ÇARPMA
  c.sfx('bigBoom');
  c.sfx('fireCrackle');
  haze.level(1);
  void k.wait(c.scene, k.slow(260)).then(() => k.counter(c.scene, k.slow(400), (u) => haze.level(1 - u))).then(() => haze.stop());
  warmFlash(c, k, 0xff7a2a, 0.34, 340);
  k.shake(c.scene, 220, 0.013);
  // kısa beyaz-sarı çekirdek
  const flashCore = glow(c, k, cx, cy, 90, 0xfff6d8, 1, k.DEPTH + 47);
  c.scene.tweens.add({ targets: flashCore, displayWidth: 260, displayHeight: 200, alpha: 0, duration: k.slow(150), ease: 'Quad.easeOut', onComplete: () => flashCore.destroy() });
  const warm = glow(c, k, cx, cy, 200, 0xff6a1a, 0.7, k.DEPTH + 21);
  c.scene.tweens.add({ targets: warm, displayWidth: 620, displayHeight: 420, alpha: 0, duration: k.slow(900), ease: 'Sine.easeOut', onComplete: () => warm.destroy() });
  // kızıl ateş topu: katmanlı topaklar kabarır, yükselir, soğur
  fireball(c, k, cx, cy, { size: [150, 330], life: 700, rise: 80, depth: k.DEPTH + 40, light: 0.6, cool: [0.12, 0.55], fadeFrom: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * (0.1 + 0.8 * (i / 4)) + k.rnd(-0.2, 0.2);
    const r = k.rnd(30, 70);
    fireball(c, k, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, { size: [90, k.rnd(190, 260)], life: k.rnd(620, 860), rise: k.rnd(80, 170), drift: Math.cos(a) * k.rnd(30, 70), delay: 20 + i * 30, depth: k.DEPTH + 39, cool: [0.1, 0.6], fadeFrom: 0.5 });
  }
  // yükselen koyu duman sütunu (yavaş dağılır)
  smoke(c, k, cx, cy - 30, { n: 18, spread: 46, size: [90, 170], rise: [200, 480], life: [1800, 2700], alpha: 0.62, tint: [0x1e1714, 0x2a211c, 0x3a302a], drift: -f * 50, jitter: 70, delay: [180, 900], depth: k.DEPTH + 37, grow: 2.1 });
  smoke(c, k, cx, ground - 10, { n: 6, spread: 120, size: [100, 160], rise: [40, 110], life: [1600, 2200], alpha: 0.5, tint: 0x3a2e28, delay: [100, 400], depth: k.DEPTH + 36, grow: 1.6 });
  // gecikmeli şok dalgası: yerde ince toz halkası + yerden kayan toz
  void k.wait(c.scene, k.slow(80)).then(() => {
    const sw = c.scene.add.graphics().setDepth(k.FLOOR_FX + 6);
    void k.counter(c.scene, k.slow(520), (u) => {
      const e = 1 - (1 - u) ** 2.4;
      sw.clear();
      sw.lineStyle(6, 0xd8c8b0, 0.32 * (1 - u)).strokeEllipse(cx, ground, 120 + 620 * e, 36 + 190 * e);
      sw.lineStyle(2, 0xfff0d8, 0.4 * (1 - u)).strokeEllipse(cx, ground, 110 + 600 * e, 32 + 184 * e);
      if (u >= 1) sw.destroy();
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + k.rnd(-0.2, 0.2);
      const d = c.scene.add.image(cx + Math.cos(a) * 50, ground + Math.sin(a) * 16, smokeTex(k, c.scene, i % 3)).setDisplaySize(70, 40).setTint(0x8a7a66).setAlpha(0.5).setDepth(k.DEPTH + 23);
      c.scene.tweens.add({ targets: d, x: cx + Math.cos(a) * k.rnd(260, 360), y: ground + Math.sin(a) * k.rnd(80, 110) - 10, displayWidth: 170, displayHeight: 80, alpha: 0, duration: k.slow(k.rnd(900, 1200)), ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  });
  // soğuyan kıvılcımlar (yere oturur), kül yağar
  particles(c, k, k.DEPTH + 44, 2600, [
    ...sparks(cx, cy, 26, k, { speed: [200, 620], angle: [-Math.PI * 0.95, -Math.PI * 0.05], g: 1100, life: [700, 1500], size: [2, 5], floor: ground + 6 }).map((p) => ({ ...p, floor: ground + k.rnd(-30, 40) })),
    ...Array.from({ length: 18 }, () => ({ x: cx + k.rnd(-260, 260), y: cy - k.rnd(150, 380), vx: k.rnd(-15, 15), vy: k.rnd(30, 70), g: 0, drag: 0, life: k.rnd(1600, 2500), age: -k.rnd(300, 900), size: k.rnd(2, 4) > 3 ? 4 : 2, kind: 'ash' as const, ph: k.rnd(0, 6), col: Math.random() < 0.3 ? 0x8a827a : 0x5e5852, a: 0.8 })),
  ]);
  // kızgın kaya parçaları savrulur, yere düşer, ince is bırakır
  for (let i = 0; i < 6; i++) {
    const r = c.scene.add.image(cx, cy, rockTex(k, c.scene, i % 2)).setDisplaySize(k.rnd(18, 30), k.rnd(16, 26)).setDepth(k.DEPTH + 45).setRotation(k.rnd(0, 6));
    const a = k.rnd(-Math.PI * 0.92, -Math.PI * 0.08);
    const sp = k.rnd(320, 620);
    const spin = k.rnd(-7, 7);
    const floorY = ground + k.rnd(-30, 40);
    let tick = 0;
    void k.counter(c.scene, k.slow(1100), (u) => {
      const tt = u * 1.1;
      const yy = cy + Math.sin(a) * sp * tt + 0.5 * 1200 * tt * tt;
      const down = yy >= floorY;
      if (!down) r.setPosition(k.snap(cx + Math.cos(a) * sp * tt), k.snap(yy)).setRotation(spin * u);
      else if (r.y < floorY) r.setY(k.snap(floorY)); // yere oturur, orada soğur
      r.setTint(coolTint(u * 0.9)).setAlpha(u > 0.8 ? (1 - u) / 0.2 : 1);
      if (tick++ % 5 === 0 && !down) smoke(c, k, r.x, r.y, { n: 1, spread: 2, size: [16, 24], rise: [10, 30], life: [400, 600], alpha: 0.45, depth: k.DEPTH + 34 });
      if (u >= 1) r.destroy();
    });
  }
  // artının kolları: zeminde kızgın çatlak koşar, kolda alev dilleri fışkırır
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const arrive = new Map<number, { p: Promise<void>; r: () => void }>();
  for (const s of slots) {
    let r: () => void = () => undefined;
    const p = new Promise<void>((res) => (r = res));
    arrive.set(s, { p, r });
  }
  if (midSlot !== undefined) arrive.get(midSlot)?.r();
  const mid = midSlot !== undefined ? k.cellMid(c.board, midSlot) : { x: cx, y: ground };
  // merkez hücrede de kısa alev dilleri ve yanık
  flames(c, k, mid.x, mid.y + 6, 5, 120, [110, 180], { life: [600, 900], stagger: 24 });
  for (const s of slots) {
    const m = k.cellMid(c.board, s);
    const q = k.quadOf(c.board, s, 0.9);
    const w = Math.abs(q[1]!.x - q[0]!.x) + Math.abs(q[2]!.x - q[1]!.x) * 0.5;
    scorch(c, k, m.x, m.y, Math.max(140, w * 0.95), { delay: s === midSlot ? 40 : 260, hold: 1500 });
  }
  const arms = slots.filter((s) => s !== midSlot);
  const fissure = c.scene.add.graphics().setDepth(k.FLOOR_FX + 7);
  const lines = arms.map((s) => {
    const to = k.cellMid(c.board, s);
    const n2 = 9;
    const pts = Array.from({ length: n2 + 1 }, (_, i) => ({ x: mid.x + ((to.x - mid.x) * i) / n2 + (i && i < n2 ? k.rnd(-8, 8) : 0), y: mid.y + ((to.y - mid.y) * i) / n2 + (i && i < n2 ? k.rnd(-4, 4) : 0) }));
    return { s, to, pts, u: 0 };
  });
  const drawFissure = (alpha: number): void => {
    fissure.clear();
    for (const l of lines) {
      const upto = l.u * (l.pts.length - 1);
      for (let i = 1; i <= Math.ceil(upto); i++) {
        const a = l.pts[i - 1]!;
        const b0 = l.pts[i]!;
        const tt = Math.min(1, upto - (i - 1));
        const b = { x: a.x + (b0.x - a.x) * tt, y: a.y + (b0.y - a.y) * tt };
        fissure.lineStyle(7, 0x120a08, 0.8 * alpha).lineBetween(a.x, a.y, b.x, b.y);
        fissure.lineStyle(3, 0xe8641c, 0.95 * alpha).lineBetween(a.x, a.y, b.x, b.y);
        fissure.lineStyle(1, 0xffd27a, alpha).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  };
  void k.wait(c.scene, k.slow(55)).then(() => {
    void k.counter(c.scene, k.slow(200), (u) => {
      for (const l of lines) l.u = u;
      drawFissure(1);
    }, 'Quad.easeOut').then(() => {
      for (const l of lines) {
        flames(c, k, l.to.x, l.to.y + 6, 6, 110, [120, 200], { life: [620, 950], stagger: 20 });
        const e = glow(c, k, l.to.x, l.to.y - 50, 80, 0xff7a2a, 0.6, k.DEPTH + 20);
        c.scene.tweens.add({ targets: e, displayWidth: 260, displayHeight: 220, alpha: 0, duration: k.slow(500), onComplete: () => e.destroy() });
        smoke(c, k, l.to.x, l.to.y - 60, { n: 3, spread: 40, size: [90, 140], rise: [150, 260], life: [1500, 2100], alpha: 0.55, tint: 0x241c18, drift: -f * 30, delay: [250, 500], depth: k.DEPTH + 35, grow: 1.7 });
        particles(c, k, k.DEPTH + 43, 1000, sparks(l.to.x, l.to.y - 20, 6, k, { speed: [100, 320], angle: [-Math.PI * 0.85, -Math.PI * 0.15], g: 900, life: [400, 800], floor: l.to.y + k.rnd(-10, 20) }));
        arrive.get(l.s)?.r();
      }
      // çatlak soğur ve söner
      void k.counter(c.scene, k.slow(900), (u) => drawFissure(1 - u)).then(() => fissure.destroy());
    });
  });
  await k.hitsAt(c, (t) => arrive.get(t.combatant.slot)?.p ?? Promise.resolve(), k.wait(c.scene, k.slow(90)));
};

export const VFX: Record<string, V2Vfx> = { fireball: fireBolt, blizzard, barrier, meteor };
