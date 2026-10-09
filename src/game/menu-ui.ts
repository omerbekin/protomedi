import Phaser from 'phaser';
import type { CombatantDef } from '../engine';
import { avatarTexture, characterTexture } from './assets';
import { cornerOrnaments, frameRect, GOLD, makePanel, SERIF } from './ui-frame';
import type { MiniShape } from '../ui/shape-diagram';
import { drawMiniShape, miniShapeSize } from './shape-draw';
import { ensureIcon } from './icons';
import { ownerOfUnit } from './asset-versions';
import { onStageResize, stageView } from './stage';
import { coverShift, FULL_REGION, placeArt, type Region } from './wide-map';
import { edgeFillers } from './map-art';
import { FULL_W, FULL_X0 } from '../ui/viewport';

/**
 * Menü ekranları (takım seçimi) için ortak çizim yardımcıları: atmosferik arka plan, altın yazı, düğme, tooltip, kafa portresi.
 * Savaş ekranındaki panel dilini (ui-frame.ts) kullanır; hepsi kodla çizilir.
 */

const cssHex = (v: number) => `#${v.toString(16).padStart(6, '0')}`;

/**
 * Menü parıltı şiddeti (tek ayar noktası): 1 = eski (çok parlak) görünüm, 0 = hiç parıltı yok. Varsayılan 0,4.
 * Işık huzmeleri, toz zerreleri, meşale, başlık ışığı, düğme/kart/yuva parlamaları buna göre ölçeklenir.
 */
export const GLOW_SCALE = 0.4;
/** Bir parıltı alfasını GLOW_SCALE ile ölçekler (eski alfa -> yeni alfa). */
export const fx = (alpha: number): number => alpha * GLOW_SCALE;

// --- Dokular ---

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

/** Yumuşak yuvarlak ışıma (beyaz; tint ile renklenir). */
export const ensureGlow = (scene: Phaser.Scene): string =>
  canvasTexture(scene, 'mu-glow', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });

const ensureVignette = (scene: Phaser.Scene): string =>
  canvasTexture(scene, 'mu-vignette', 512, 288, (ctx) => {
    const g = ctx.createRadialGradient(256, 144, 70, 256, 144, 330);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(4,2,1,0.35)');
    g.addColorStop(1, 'rgba(2,1,0,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
  });

const ensureFog = (scene: Phaser.Scene): string =>
  canvasTexture(scene, 'mu-fog', 512, 192, (ctx) => {
    let seed = 987654;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 14; i++) {
      const x = 60 + rnd() * 392;
      const y = 50 + rnd() * 92;
      const r = 50 + rnd() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,240,220,0.5)');
      g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 192);
    }
  });

const ensureBeam = (scene: Phaser.Scene): string =>
  canvasTexture(scene, 'mu-beam', 64, 512, (ctx) => {
    const v = ctx.createLinearGradient(0, 0, 0, 512);
    v.addColorStop(0, 'rgba(255,225,160,0.9)');
    v.addColorStop(0.6, 'rgba(255,210,140,0.3)');
    v.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 512);
    // yatayda yumuşak kenarlar
    ctx.globalCompositeOperation = 'destination-in';
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 512);
  });

// --- Arka plan ---

/**
 * Atmosferik arka plan: koyulaştırılmış salon, sıcak ışık havuzları, ışık huzmeleri, sis, toz zerreleri, vinyet.
 * Her şey derinlik 0-12 arasındadır; arayüz üstüne çizilir.
 */
/**
 * Menü zemini (takım seçimi, multiplayer). `region` verilirse görsel geniş bir harita görselidir ve o bölge eskiden 16:9 görselin durduğu yere
 * oturur (src/game/wide-map.ts). Geniş ekranda görsel boşluk bırakmayacak kadar kayar; yetmezse kenar uzantısı; vinyet görünen alanı kaplar.
 */
export function buildBackdrop(scene: Phaser.Scene, W: number, H: number, bgKey: string | null, region: Region = FULL_REGION): void {
  const glow = ensureGlow(scene);
  scene.cameras.main.setBackgroundColor('#0b0705');
  let layoutBg: (() => void) | null = null;
  if (bgKey) {
    const img = scene.add.image(W / 2, H / 2, bgKey).setDepth(0).setTint(0x8a7a6e);
    const rw = (region[2] - region[0]) * img.width;
    const rh = (region[3] - region[1]) * img.height;
    const k = Math.max(W / rw, H / rh);
    const p = placeArt(img.width, img.height, region, { x: W / 2 - (rw * k) / 2, y: H / 2 - (rh * k) / 2, w: rw * k, h: rh * k });
    const cx = (p.left + p.right) / 2;
    const cy = (p.top + p.bottom) / 2;
    img.setScale(p.scale).setPosition(cx, cy);
    const fill = edgeFillers(scene, bgKey, 0);
    for (const f of fill.items) f.setTint(0x3a3028);
    layoutBg = () => {
      img.setX(cx + coverShift(p, stageView.left, stageView.right));
      fill.place(img);
    };
  }
  const dark = scene.add.graphics().setDepth(1);
  dark.fillGradientStyle(0x050302, 0x050302, 0x0a0604, 0x0a0604, 0.9, 0.9, 0.78, 0.78).fillRect(FULL_X0, 0, FULL_W, H);
  dark.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.7, 0.7).fillRect(FULL_X0, H * 0.55, FULL_W, H * 0.45);

  // Sıcak ışık havuzları (orta sahne + meşale)
  scene.add.image(W / 2, 330, glow).setDepth(2).setTint(0xff9a4a).setScale(15, 7).setAlpha(fx(0.16)).setBlendMode(Phaser.BlendModes.ADD);
  scene.add.image(W / 2, 40, glow).setDepth(2).setTint(0xffd9a0).setScale(11, 2.4).setAlpha(fx(0.22)).setBlendMode(Phaser.BlendModes.ADD);
  if (bgKey) {
    // Meşale: eskiden hızlı titriyordu (380ms); şimdi küçük, sönük ve çok yavaş soluyor.
    const torch = scene.add.image(108, 600, glow).setDepth(2).setTint(0xff7a2a).setScale(4.6, 4.6).setAlpha(fx(0.3)).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: torch, alpha: { from: fx(0.26), to: fx(0.34) }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // Işık huzmeleri
  const beam = ensureBeam(scene);
  const beams: Array<[number, number, number, number, number]> = [
    [520, -20, 230, 0.16, -0.32],
    [800, -30, 150, 0.12, -0.18],
    [1090, -30, 190, 0.14, 0.12],
    [1380, -20, 260, 0.13, 0.28],
    [1660, -20, 140, 0.1, 0.4],
  ];
  beams.forEach(([x, y, w, a, rot], i) => {
    // İnce ve hafif huzmeler: genişlik x0,55 (GLOW_SCALE 1'de eski genişlik), alfa GLOW_SCALE ile azalır.
    const thin = 0.55 + 0.45 * GLOW_SCALE;
    const b = scene.add.image(x, y, beam).setOrigin(0.5, 0).setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd9a0);
    b.setDisplaySize(w * thin, 1500).setRotation(rot).setAlpha(fx(a));
    scene.tweens.add({ targets: b, alpha: { from: fx(a) * 0.6, to: fx(a) }, duration: 7000 + i * 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 400 });
    scene.tweens.add({ targets: b, rotation: rot + 0.05 * (i % 2 ? 1 : -1), duration: 9000 + i * 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  });

  // Sis katmanları
  const fog = ensureFog(scene);
  for (let i = 0; i < 4; i++) {
    const y = 760 + i * 80;
    const f = scene.add.image(W / 2 + (i % 2 ? -200 : 200), y, fog).setDepth(4).setAlpha(0.1 + i * 0.015).setScale(5.2, 2.2 + i * 0.3).setTint(0xcab8a4);
    scene.tweens.add({ targets: f, x: f.x + (i % 2 ? 360 : -360), duration: 38000 + i * 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // Toz zerreleri (yukarı süzülür)
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dustCount = Math.round(46 * Math.min(1, GLOW_SCALE * 1.25)); // 0,4 -> 23 (eskiden 46)
  for (let i = 0; i < dustCount; i++) {
    const s = 0.04 + rnd() * 0.07;
    const m = scene.add.image(rnd() * W, 200 + rnd() * 880, glow).setDepth(5).setScale(s).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setTint(rnd() > 0.5 ? 0xffe0a8 : 0xffc890);
    const rise = 120 + rnd() * 280;
    scene.tweens.add({
      targets: m,
      y: m.y - rise,
      x: m.x + (rnd() - 0.5) * 120,
      alpha: { from: 0, to: fx(0.18 + rnd() * 0.5) },
      duration: 7000 + rnd() * 8000,
      delay: rnd() * 6000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  const vignette = scene.add.image(W / 2, H / 2, ensureVignette(scene)).setDepth(6).setDisplaySize(W, H);
  onStageResize(scene, () => {
    layoutBg?.();
    vignette.setDisplaySize(stageView.viewW, H);
  });
}

// --- Metin ---

/** Serif metin, koyu kontur; çözünürlük 2 (FIT ölçeklemede keskin kalır). */
export function serif(scene: Phaser.Scene, x: number, y: number, text: string, size: number, hex = '#f3e4c4', o: { bold?: boolean; stroke?: number; spacing?: number; font?: string; weight?: string } = {}): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: o.font ?? SERIF,
      fontSize: `${size}px`,
      fontStyle: o.weight ?? (o.bold === false ? 'normal' : 'bold'),
      color: hex,
      stroke: '#0c0805',
      strokeThickness: o.stroke ?? Math.max(2, Math.round(size / 8)),
      letterSpacing: o.spacing ?? 0,
    })
    .setResolution(2);
}

/** Altın degradeli başlık yazısı (beyaz metin + dikey tint). */
export function goldText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, spacing = 0, o: { font?: string; weight?: string; stroke?: number } = {}): Phaser.GameObjects.Text {
  const t = serif(scene, x, y, text, size, '#ffffff', { stroke: o.stroke ?? Math.max(3, Math.round(size / 9)), spacing, font: o.font, weight: o.weight });
  t.setTint(0xfff2c0, 0xfff2c0, 0xc89238, 0xc89238);
  return t;
}

/** Metin `maxW`'dan genişse yatayda ve dikeyde küçültür (isim kutuları için). */
export function fitText(t: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  if (t.width > maxW) t.setScale(maxW / t.width);
  return t;
}

// --- Portre ---

function ensureBust(scene: Phaser.Scene, hex: string): string {
  return canvasTexture(scene, `mu-bust:${hex}`, 128, 128, (ctx) => {
    const base = hex;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, base);
    g.addColorStop(1, '#120c07');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(64, 138, 56, 52, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 54, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(55, 45, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(48, 56, 12, 5);
    ctx.fillRect(68, 56, 12, 5);
  });
}

/** Sınıfın kafa portresi ("avatar"): sprite'ın üst kısmı kırpılır; savaştaki sıra çubuğuyla aynı kesim. `size` kenar uzunluğu. */
export function classAvatar(scene: Phaser.Scene, def: CombatantDef, cx: number, cy: number, size: number, flip = false): Phaser.GameObjects.Image {
  const av = avatarTexture(scene, def.spriteId);
  if (av) {
    const head = scene.add.image(cx, cy, av);
    head.setScale(size / head.width);
    if (flip) head.setFlipX(true);
    return head;
  }
  const tex = characterTexture(scene, def.spriteId, def.color);
  if (!tex.real) {
    // Sprite yok: sınıf renginde basit büst silueti
    const key = ensureBust(scene, def.color);
    const bust = scene.add.image(cx, cy, key);
    bust.setScale(size / bust.width);
    if (flip) bust.setFlipX(true);
    return bust;
  }
  const img = scene.add.image(cx, cy, tex.key);
  const fw = img.frame.width;
  const fh = img.frame.height;
  const cw = fw * 0.72;
  const ch = Math.min(fh * 0.34, cw);
  const cropX = (fw - cw) / 2;
  const cropY = fh * 0.03;
  img.setCrop(cropX, cropY, cw, ch);
  img.setOrigin((cropX + cw / 2) / fw, (cropY + ch / 2) / fh);
  img.setScale(size / Math.max(cw, ch));
  if (flip) img.setFlipX(true);
  return img;
}

/**
 * Class logosu madalyonu (koyu daire + class rengi kenar + logo): sefer kartlarında, takım şeridinde, kayıt kartlarında avatarın köşesinde.
 * Logo seçili sanat sürümüyle (debug > Versions) çizilir ve sürüm değişince kendiliğinden yenilenir (icons.ts > refreshSceneIcons).
 */
export function classLogoBadge(scene: Phaser.Scene, def: CombatantDef, cx: number, cy: number, r: number): Phaser.GameObjects.GameObject[] {
  const bg = scene.add.circle(cx, cy, r, 0x000000, 0.8).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(def.color).color);
  const icon = scene.add.image(cx, cy, ensureIcon(scene, def.logo, def.color, false, ownerOfUnit(def.id))).setDisplaySize(r * 1.4, r * 1.4);
  return [bg, icon];
}

// --- Düğme ---

export interface MenuButton {
  container: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  shake(): void;
}

/** Bronz/altın düğme: degrade plaka, çok katmanlı çerçeve, hover parlaması, basma animasyonu. Merkez (cx, cy). */
export function makeMenuButton(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  onTap: () => void,
  o: { primary?: boolean; size?: number; icon?: string; font?: string; weight?: string; spacing?: number } = {},
): MenuButton {
  const primary = !!o.primary;
  const body = scene.add.graphics();
  const plate = (top: number, bottom: number, edge: number, light: number) => {
    body.clear();
    body.fillGradientStyle(top, top, bottom, bottom, 1).fillRect(-w / 2, -h / 2, w, h);
    body.fillStyle(0xffffff, 0.08).fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4);
    frameRect(body, -w / 2, -h / 2, w, h, { edge, light, bevel: primary ? 5 : 4 });
    cornerOrnaments(body, -w / 2, -h / 2, w, h, primary ? 6 : 4);
  };
  const glow = scene.add.image(0, 0, ensureGlow(scene)).setTint(primary ? 0xffc860 : 0xffb050).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  glow.setDisplaySize(w * 1.5, h * 2.2);
  const text = goldText(scene, 0, 0, label, o.size ?? (primary ? 40 : 28), o.spacing ?? (primary ? 2 : 1), { font: o.font, weight: o.weight }).setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [glow, body, text];
  const container = scene.add.container(cx, cy, parts);
  const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
  container.add(zone);
  let enabled = true;
  let pulse: Phaser.Tweens.Tween | undefined;
  const look = () => {
    if (primary) plate(enabled ? 0x9a6a28 : 0x3a2c1c, enabled ? 0x3f220c : 0x16100b, enabled ? GOLD.light : 0x5b4a30, enabled ? GOLD.bright : 0x7a6a4c);
    else plate(0x5c4128, 0x24170d, GOLD.edge, GOLD.light);
    text.setAlpha(enabled ? 1 : 0.5);
    pulse?.stop();
    glow.setAlpha(0);
    // START: eskiden hızlı altın nabız (0,22-0,6 / 900ms); şimdi çok hafif ve yavaş.
    if (primary && enabled) pulse = scene.tweens.add({ targets: glow, alpha: { from: fx(0.3), to: fx(0.5) }, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  };
  look();
  const tweenTo = (s: number, ms = 110) => scene.tweens.add({ targets: container, scale: s, duration: ms, ease: 'Sine.easeOut' });
  zone.on('pointerover', () => {
    tweenTo(1.035);
    if (!primary || !enabled) scene.tweens.add({ targets: glow, alpha: fx(enabled ? 0.45 : 0.12), duration: 140 });
    text.setTint(0xffffff, 0xffffff, 0xffe29a, 0xffe29a);
  });
  zone.on('pointerout', () => {
    tweenTo(1);
    if (!primary || !enabled) scene.tweens.add({ targets: glow, alpha: 0, duration: 200 });
    text.setTint(0xfff2c0, 0xfff2c0, 0xc89238, 0xc89238);
  });
  zone.on('pointerdown', () => tweenTo(0.96, 70));
  zone.on('pointerup', () => {
    tweenTo(1.035, 90);
    onTap();
  });
  return {
    container,
    setEnabled(on: boolean) {
      if (enabled === on) return;
      enabled = on;
      look();
    },
    shake() {
      scene.tweens.add({ targets: container, x: { from: cx - 10, to: cx }, duration: 240, ease: 'Bounce.easeOut' });
    },
  };
}

// --- Tooltip ---

export interface TipContent {
  title: string;
  titleHex?: string;
  /** Başlığın solundaki ikon dokusu anahtarı. */
  icon?: string;
  /** Sağ üst rozet (hedef türü, arketip). */
  badge?: string;
  /** AOE şekil şeması (mini ızgara): rozetin soluna çizilir. */
  shape?: MiniShape;
  rows: Array<[string, string?]>;
  width?: number;
}

/** Savaş ekranındaki bilgi panelleri dilinde tooltip (taş/deri panel, altın başlık). Konumlanmamış container + boyut döner. */
export function buildTip(scene: Phaser.Scene, c: TipContent): { container: Phaser.GameObjects.Container; width: number; height: number } {
  const w = c.width ?? 430;
  const pad = 18;
  const items: Phaser.GameObjects.GameObject[] = [];
  const iconSize = c.icon ? 40 : 0;
  const title = serif(scene, pad + (iconSize ? iconSize + 12 : 0), pad - 2, c.title, 30, c.titleHex ?? '#ffe29a').setOrigin(0, 0);
  let y = pad + Math.max(iconSize, title.height) + 4;
  const body: Phaser.GameObjects.GameObject[] = [title];
  if (c.icon) body.push(scene.add.image(pad + iconSize / 2, pad + iconSize / 2 - 2, c.icon).setDisplaySize(iconSize, iconSize));
  if (c.badge) {
    const badge = serif(scene, 0, 0, c.badge.toUpperCase(), 14, '#f3d9a0', { spacing: 1 });
    const bw = badge.width + 20;
    const bh = badge.height + 6;
    const g = scene.add.graphics();
    g.fillStyle(0x120c07, 0.95).fillRoundedRect(w - pad - bw, pad, bw, bh, 6);
    g.lineStyle(2, GOLD.edge, 1).strokeRoundedRect(w - pad - bw, pad, bw, bh, 6);
    badge.setPosition(w - pad - bw + 10, pad + 3);
    body.push(g, badge);
    if (c.shape) {
      const sz = miniShapeSize(c.shape);
      body.push(drawMiniShape(scene, w - pad - bw - 10 - sz.w, pad - 6, c.shape));
      y = Math.max(y, pad - 6 + sz.h + 6);
    }
  }
  const rule = scene.add.graphics();
  rule.lineStyle(1, GOLD.edge, 0.7).lineBetween(pad, y, w - pad, y);
  rule.fillStyle(GOLD.light, 0.9).fillPoints([{ x: w / 2, y: y - 3 }, { x: w / 2 + 4, y }, { x: w / 2, y: y + 3 }, { x: w / 2 - 4, y }], true);
  body.push(rule);
  y += 10;
  for (const [text, hex] of c.rows) {
    const t = serif(scene, pad, y, text, 18, hex ?? '#e6d8bd', { bold: false, stroke: 2 }).setOrigin(0, 0);
    t.setWordWrapWidth(w - pad * 2, true).setLineSpacing(2);
    body.push(t);
    y += t.height + 5;
  }
  const h = y + pad - 4;
  items.push(...makePanel(scene, 0, 0, w, h, { top: 0x2a2017, bottom: 0x0d0805, bevel: 3, grain: 0.7, alpha: 0.98 }), ...body);
  return { container: scene.add.container(0, 0, items).setDepth(5000), width: w, height: h };
}

/** Tooltip'i bir dikdörtgenin üstüne/altına koyar ve ekrandan taşırmaz. */
export function placeTip(tip: { container: Phaser.GameObjects.Container; width: number; height: number }, anchor: { x: number; y: number; w: number; h: number }, prefer: 'above' | 'below', W: number, H: number): void {
  const margin = 10;
  let x = anchor.x + anchor.w / 2 - tip.width / 2;
  let y = prefer === 'above' ? anchor.y - tip.height - margin : anchor.y + anchor.h + margin;
  if (y < 6) y = anchor.y + anchor.h + margin;
  if (y + tip.height > H - 6) y = Math.max(6, anchor.y - tip.height - margin);
  x = Math.min(W - tip.width - 8, Math.max(8, x));
  tip.container.setPosition(Math.round(x), Math.round(y));
}

export { cssHex };
