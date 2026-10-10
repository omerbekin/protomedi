import Phaser from 'phaser';
import { BODY_FONT, DISPLAY_FONT } from '../ui/menu-style';
import { ensureGlow } from './menu-text';
import { drawMiniShape, miniShapeSize } from './shape-draw';
import type { MiniShape } from '../ui/shape-diagram';
import { onStageResize, stageView } from './stage';
import { FULL_W, FULL_X0 } from '../ui/viewport';
import { isBackdropTap } from '../ui/backdrop';
import { motion, MOTION } from '../ui/motion';
import { uiSound, type UiSoundKind } from '../ui/ui-sound';

/**
 * ZARİF TASARIM KİTİ (Phaser tarafı; Ömer 2026-10-09: ana menü + Quick Battle "Twin Formations" dili HER ekranda).
 * Dil: Cinzel 600 büyük harf başlık/düğme yazısı + EB Garamond italik açıklama, ince altın çizgiler (alfa .16 / .3 / .55), kor elmaslar,
 * kutusuz yazı düğmeleri (hover: elmas + kor parıltısı + 4 px sağa), yumuşak geçişler (Cubic.easeOut 180-350 ms).
 * DOM ekranları için aynı dilin CSS sınıfları: `src/ui/elegant.css` (`el-*`). Kullanım kuralları CLAUDE.md > "Tasarım kiti".
 *
 *  - elText / elBody / elGlow           yazılar (Cinzel / Garamond; parıltı = kor yazı gölgesi)
 *  - elDiamond, diamondPts, fadeLine, vGradient, hGradient   çizim parçaları
 *  - elLink                             kutusuz yazı düğmesi (Random, Clear, ◂ Back...)
 *  - elBack                             sol üst "◂ Back  Esc" (stageView'e yaslı; Esc'i çağıran bağlar)
 *  - elButton  (primary | secondary)    çerçeveli düğme: primary = START (hazırken nefes alan kor), secondary = Random both
 *  - elIconButton                       küçük kare ikon (+ isteğe bağlı yazı) düğmesi
 *  - elPanel                            ince çerçeveli koyu panel / kart (köşe elmasları isteğe bağlı)
 *  - elHeading                          altın degradeli başlık + iki yanda süs çizgisi
 *  - elStatus                           durum satırı (ok / warn / bad tonları, nabız)
 *  - elTip / placeElTip                 tooltip
 *  - elConfirm                          onay penceresi (Yes / No; Esc = No)
 *  - elBadge                            yuvarlak sayı rozeti (Player mavi / Enemy kırmızı / altın)
 *  - elToast                            üst ortada kısa bildirim
 */

export const EL = {
  TXT: '#d9c8a2',
  ON: '#f3d999',
  MUTED: '#a8977a',
  DIM: '#7d705a',
  NOTE: '#cdb88d',
  PRI: '#ffd76a',
  BAD: '#e8806a',
  EMBER: 0xe0702a,
  EMBER2: 0xffb35a,
  GOLD: 0xd9b26a,
  ON_N: 0xf3d999,
  INK: 0x080604,
  SH_DARK: 'rgba(12,8,5,0.95)',
  SH_GLOW: 'rgba(240,140,40,0.85)',
  LINE: { a1: 0.16, a2: 0.3, a3: 0.55 },
  /** Parıltı (yazı gölgesi) kesilmesin diye yazılara iç boşluk. */
  PAD: 16,
  /** Dokunma alanı yüksekliği (dünya pikseli). */
  HIT: 72,
  EASE: 'Cubic.easeOut',
} as const;

const NUM_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";

// --- Çizim parçaları ---

export const diamondPts = (cx: number, cy: number, r: number) => [
  { x: cx, y: cy - r },
  { x: cx + r, y: cy },
  { x: cx, y: cy + r },
  { x: cx - r, y: cy },
];

/** Dikey degrade dilimleri (CSS linear-gradient 180deg): stops = [konum 0..1, alfa]. */
export function vGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, stops: Array<[number, number]>): void {
  for (let k = 0; k < stops.length - 1; k++) {
    const [p0, a0] = stops[k]!;
    const [p1, a1] = stops[k + 1]!;
    g.fillGradientStyle(color, color, color, color, a0, a0, a1, a1).fillRect(x, y + p0 * h, w, (p1 - p0) * h + 0.5);
  }
}

/** Yatay degrade dilimleri (CSS linear-gradient 90deg). */
export function hGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, stops: Array<[number, number]>): void {
  for (let k = 0; k < stops.length - 1; k++) {
    const [p0, a0] = stops[k]!;
    const [p1, a1] = stops[k + 1]!;
    g.fillGradientStyle(color, color, color, color, a0, a1, a0, a1).fillRect(x + p0 * w, y, (p1 - p0) * w + 0.5, h);
  }
}

/** Yatay ince çizgi; 'in' = x0'da saydam x1'de dolu, 'out' tersi, 'both' iki uçta saydam. */
export function fadeLine(g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number, color: number, alpha: number, dir: 'in' | 'out' | 'both'): void {
  const steps = 24;
  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) / steps;
    const a = dir === 'in' ? t : dir === 'out' ? 1 - t : 1 - Math.abs(t - 0.5) * 2;
    g.lineStyle(1, color, alpha * a).lineBetween(x0 + ((x1 - x0) * s) / steps, y, x0 + ((x1 - x0) * (s + 1)) / steps, y);
  }
}

/** Kor elmas (dolu, hafif ışıltılı) ya da içi boş altın elmas; merkez (0, 0). */
export function elDiamond(scene: Phaser.Scene, r: number, hollow = false): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  if (hollow) {
    g.lineStyle(1, EL.GOLD, 0.45).strokePoints(diamondPts(0, 0, r), true);
    return g;
  }
  g.fillStyle(EL.EMBER, 0.25).fillPoints(diamondPts(0, 0, r + 4), true);
  g.fillStyle(EL.EMBER, 1).fillPoints(diamondPts(0, 0, r), true);
  g.lineStyle(1, EL.EMBER2, 1).strokePoints(diamondPts(0, 0, r), true);
  return g;
}

// --- Yazılar ---

/** Cinzel 600 (varsayılan büyük harf), harf aralığı `em`; koyu yazı gölgesi. `pad` = parıltı için iç boşluk (x o kadar sola alınır). */
export function elText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: string = EL.TXT, o: { em?: number; pad?: boolean; weight?: string; upper?: boolean } = {}): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x - (o.pad ? EL.PAD : 0), y, o.upper === false ? text : text.toUpperCase(), { fontFamily: DISPLAY_FONT, fontSize: `${size}px`, fontStyle: o.weight ?? '600', color, letterSpacing: size * (o.em ?? 0.05) })
    .setResolution(2)
    .setShadow(0, 2, EL.SH_DARK, 4, false, true);
  if (o.pad) t.setPadding(EL.PAD, EL.PAD, EL.PAD, EL.PAD);
  return t;
}

/** EB Garamond (varsayılan italik); hafif koyu gölge. */
export function elBody(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: string = EL.NOTE, italic = true, wrap?: number): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, { fontFamily: BODY_FONT, fontSize: `${size}px`, fontStyle: italic ? 'italic' : 'normal', color, ...(wrap ? { wordWrap: { width: wrap, useAdvancedWrap: true } } : {}) })
    .setResolution(2)
    .setShadow(0, 2, EL.SH_DARK, 4, false, true);
  return t;
}

/** Kor parıltısı aç / kapat (yazı gölgesi). */
export function elGlow(t: Phaser.GameObjects.Text, on: boolean): void {
  if (on) t.setShadow(0, 0, EL.SH_GLOW, 14, false, true);
  else t.setShadow(0, 2, EL.SH_DARK, 4, false, true);
}

/** Yazıyı `maxW`'a sığdırır (oran korunur). */
export function fitW(t: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  if (t.width > maxW) t.setScale(maxW / t.width);
  return t;
}

// --- Düğmeler ---

export interface ElLink {
  root: Phaser.GameObjects.Container;
  width: number;
  text: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
}

/**
 * Kutusuz yazı düğmesi: hover'da önünde kor elmas belirir, yazı açılır + parlar + 4 px sağa kayar. Kök (0, 0) = sol kenar, dikey orta.
 * `isBusy` true dönerse (ör. sürükleme sürüyor) hover / tık yok sayılır.
 */
export function elLink(
  scene: Phaser.Scene,
  label: string,
  run: () => void,
  o: { size?: number; small?: string; enabled?: boolean; isBusy?: () => boolean; onHover?: (on: boolean) => void; sound?: UiSoundKind; icon?: string | undefined; iconSize?: number } = {},
): ElLink {
  const size = o.size ?? 21;
  const root = scene.add.container(0, 0);
  const dia = elDiamond(scene, 7).setPosition(11, 0).setAlpha(0).setScale(0.4);
  // isteğe bağlı ikon (doku anahtarı; ör. boyalı arayüz ikonu Gear / Formation): elmasın sağında, yazının solunda
  const isz = o.iconSize ?? Math.round(size * 1.5);
  const icon = o.icon ? scene.add.image(28 + isz / 2, 0, o.icon).setDisplaySize(isz, isz) : null;
  const tx = icon ? 28 + isz + 8 : 28;
  const text = elText(scene, tx, 0, label, size, EL.TXT, { em: 0.08, pad: true }).setOrigin(0, 0.5);
  const tw = text.width - EL.PAD * 2;
  let width = tx + tw + 14;
  const parts: Phaser.GameObjects.GameObject[] = icon ? [dia, icon, text] : [dia, text];
  if (o.small) {
    const s = elBody(scene, tx + tw + 16, 1, o.small, 17, EL.DIM).setOrigin(0, 0.5);
    parts.push(s);
    width += 16 + s.width;
  }
  const zone = scene.add.zone(width / 2, 0, width, EL.HIT).setInteractive({ useHandCursor: true });
  root.add([...parts, zone]);
  let enabled = o.enabled !== false;
  icon?.setAlpha(enabled ? 1 : 0.45);
  const hover = (v: boolean) => {
    const on = v && enabled;
    scene.tweens.killTweensOf(icon ? [dia, text, icon] : [dia, text]);
    scene.tweens.add({ targets: dia, alpha: on ? 1 : 0, scale: on ? 1 : 0.4, duration: 180, ease: EL.EASE });
    scene.tweens.add({ targets: text, x: (on ? tx + 4 : tx) - EL.PAD, duration: 180, ease: EL.EASE });
    if (icon) scene.tweens.add({ targets: icon, x: 28 + isz / 2 + (on ? 4 : 0), alpha: enabled ? 1 : 0.45, duration: 180, ease: EL.EASE });
    text.setColor(!enabled ? EL.DIM : on ? EL.ON : EL.TXT);
    elGlow(text, on);
  };
  zone.on('pointerover', () => {
    if (o.isBusy?.()) return;
    hover(true);
    if (enabled) uiSound('hover');
    o.onHover?.(true);
  });
  zone.on('pointerout', () => {
    hover(false);
    o.onHover?.(false);
  });
  zone.on('pointerup', () => {
    if (o.isBusy?.() || !enabled) return;
    uiSound(o.sound ?? 'select');
    run();
  });
  return {
    root,
    width,
    text,
    setEnabled(on: boolean) {
      enabled = on;
      hover(false);
    },
  };
}

/**
 * Sol üst "◂ Back  Esc" (ya da "◂ Menu"): kurulum ekranlarının ortak geri düğmesi. Sahnenin sol kenarına yaslanır (geniş ekranda da).
 * Esc tuşunu çağıran sahne bağlar (aynı `run`). CLAUDE.md > "Geri / Menu kuralı".
 */
export function elBack(scene: Phaser.Scene, run: () => void, o: { label?: string; isBusy?: () => boolean; depth?: number } = {}): ElLink {
  const l = elLink(scene, `◂ ${o.label ?? 'Back'}`, run, { small: 'Esc', isBusy: o.isBusy, sound: 'back' });
  l.root.setDepth(o.depth ?? 40).setY(56);
  const place = () => l.root.setX(stageView.left + 48);
  place();
  onStageResize(scene, place);
  return l;
}

export interface ElButton {
  root: Phaser.GameObjects.Container;
  w: number;
  h: number;
  /** primary: hazır (altın çerçeve + nefes alan kor); secondary: etkin. */
  setReady(on: boolean): void;
  setLabel(label: string): void;
  shake(): void;
}

/**
 * Çerçeveli düğme. primary (START BATTLE dili): 84 px, Cinzel 30, iki yanda elmas; hazır değilken soluk, hazırken altın + nefes alan kor.
 * secondary (Random both dili): 56 px, Cinzel 21, ince soluk çerçeve, içi boş elmaslar. Genişlik verilmezse yazıya göre (`minLabel` en uzun yazı).
 * Kök (0, 0) = düğmenin ortası.
 */
export function elButton(
  scene: Phaser.Scene,
  label: string,
  run: () => void,
  o: { kind?: 'primary' | 'secondary'; w?: number; h?: number; size?: number; minLabel?: string; isBusy?: () => boolean; ready?: boolean; icon?: string | undefined; iconSize?: number } = {},
): ElButton {
  const primary = (o.kind ?? 'primary') === 'primary';
  const size = o.size ?? (primary ? 30 : 21);
  const em = primary ? 0.12 : 0.1;
  const probe = elText(scene, 0, 0, o.minLabel && o.minLabel.length > label.length ? o.minLabel : label, size, EL.DIM, { em });
  const w = o.w ?? Math.ceil(probe.width + (primary ? 112 : 80));
  probe.destroy();
  const h = o.h ?? (primary ? 84 : 56);
  const root = scene.add.container(0, 0);
  const breath = scene.add.image(0, 0, ensureGlow(scene)).setTint(EL.EMBER).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w * 1.35, h * 2.6).setAlpha(0);
  const plate = scene.add.graphics();
  const text = elText(scene, 0, 0, label, size, EL.DIM, { em, pad: true }).setOrigin(0.5);
  // isteğe bağlı ikon (doku anahtarı; ör. boyalı arayüz ikonu Gear): yazının solunda, ikisi birlikte ortalanır
  const isz = o.iconSize ?? Math.round(size * 1.6);
  const icon = o.icon ? scene.add.image(0, 0, o.icon).setDisplaySize(isz, isz) : null;
  const iconRoom = icon ? isz + 10 : 0;
  // Ortalama: Phaser harf aralığını son harfin sonuna da ekler, yazı sola kayar; yarısı kadar sağa alınır. Sığmayan yazı küçültülür
  // (düğme sabit genişlikliyse yazı taşmaz; elmaslar çerçevenin dışında, iç boşluk iki yanda).
  const fitLabel = () => {
    text.setScale(1).setX((size * em) / 2 + iconRoom / 2);
    const inner = text.width - EL.PAD * 2 - size * em;
    const room = w - (primary ? 64 : 40) - iconRoom;
    if (inner > room) text.setScale(room / inner);
    if (icon) icon.setX(-(Math.min(inner, room) + iconRoom) / 2 + isz / 2);
  };
  fitLabel();
  const lift = scene.add.container(0, 0, icon ? [plate, icon, text] : [plate, text]);
  const zone = scene.add.zone(0, 0, w + 16, Math.max(h + 12, EL.HIT - 6)).setInteractive({ useHandCursor: true });
  root.add([breath, lift, zone]);
  let ready = o.ready ?? !primary;
  let hover = false;
  let breathTween: Phaser.Tweens.Tween | undefined;
  const draw = () => {
    plate.clear();
    if (primary) {
      plate.fillStyle(0x000000, 0.35).fillRect(-w / 2 + 4, -h / 2 + 14, w - 8, h);
      plate.lineStyle(3, 0x0c0805, 0.8).strokeRect(-w / 2 - 3.5, -h / 2 - 3.5, w + 7, h + 7);
      plate.fillStyle(0x261b11, 0.88).fillRect(-w / 2, -h / 2, w, h);
      plate.fillGradientStyle(0x0c0906, 0x0c0906, 0x0c0906, 0x0c0906, 0, 0, 0.75, 0.75).fillRect(-w / 2, -h / 2, w, h);
      plate.lineStyle(2, ready && hover ? EL.ON_N : EL.GOLD, ready ? 1 : 0.28).strokeRect(-w / 2, -h / 2, w, h);
      for (const sx of [-1, 1]) {
        const cx = sx * (w / 2 + 2);
        if (ready) {
          plate.fillStyle(EL.EMBER, 0.3).fillPoints(diamondPts(cx, 0, 13), true);
          plate.fillStyle(EL.EMBER, 1).fillPoints(diamondPts(cx, 0, 8.5), true);
          plate.lineStyle(1, EL.EMBER2, 1).strokePoints(diamondPts(cx, 0, 8.5), true);
        } else {
          plate.fillStyle(0x3a2d20, 1).fillPoints(diamondPts(cx, 0, 8.5), true);
          plate.lineStyle(1, EL.GOLD, 0.35).strokePoints(diamondPts(cx, 0, 8.5), true);
        }
      }
      text.setColor(ready ? EL.ON : EL.DIM);
      elGlow(text, ready && hover);
    } else {
      plate.lineStyle(3, 0x0c0805, 0.6).strokeRect(-w / 2 - 3.5, -h / 2 - 3.5, w + 7, h + 7);
      plate.fillGradientStyle(0x1e160e, 0x1e160e, 0x0c0906, 0x0c0906, 0.78).fillRect(-w / 2, -h / 2, w, h);
      const on = hover && ready;
      plate.lineStyle(1, on ? EL.ON_N : EL.GOLD, on ? 0.9 : EL.LINE.a2).strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      for (const sx of [-1, 1]) {
        const dx = sx * (w / 2 + 1);
        plate.fillStyle(0x1a130c, 1).fillPoints(diamondPts(dx, 0, 6), true);
        plate.lineStyle(1, on ? EL.EMBER2 : EL.GOLD, on ? 1 : 0.45).strokePoints(diamondPts(dx, 0, 6), true);
      }
      text.setColor(!ready ? EL.DIM : on ? EL.ON : EL.TXT);
      elGlow(text, on);
    }
    icon?.setAlpha(ready ? 1 : 0.45);
  };
  const setReady = (r: boolean) => {
    ready = r;
    draw();
    breathTween?.stop();
    breath.setAlpha(0);
    breathTween = primary && ready ? scene.tweens.add({ targets: breath, alpha: { from: 0, to: 0.32 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }) : undefined;
    if (!ready) scene.tweens.add({ targets: lift, y: 0, duration: 250, ease: EL.EASE });
  };
  zone.on('pointerover', () => {
    if (o.isBusy?.()) return;
    hover = true;
    if (ready) uiSound('hover');
    draw();
    if (ready) scene.tweens.add({ targets: lift, y: primary ? -3 : -2, duration: 250, ease: EL.EASE });
  });
  zone.on('pointerout', () => {
    hover = false;
    draw();
    scene.tweens.add({ targets: lift, y: 0, scale: 1, duration: 250, ease: EL.EASE });
  });
  zone.on('pointerdown', () => scene.tweens.add({ targets: lift, scale: 0.97, duration: 70 }));
  zone.on('pointerup', () => {
    scene.tweens.add({ targets: lift, scale: 1, duration: 120, ease: EL.EASE });
    if (o.isBusy?.()) return;
    uiSound(primary ? 'confirm' : 'select');
    run();
  });
  setReady(ready);
  return {
    root,
    w,
    h,
    setReady: (r: boolean) => (r === ready ? draw() : setReady(r)),
    setLabel: (l: string) => {
      if (text.text !== l.toUpperCase()) {
        text.setText(l.toUpperCase());
        fitLabel();
      }
    },
    shake: () => scene.tweens.add({ targets: lift, x: { from: -10, to: 0 }, duration: 260, ease: 'Bounce.easeOut' }),
  };
}

/** Küçük kare düğme: ince çerçeve + ikon (doku anahtarı) ya da kısa yazı; hover'da altın çerçeve + 2 px kalkma. Kök = orta. */
export function elIconButton(scene: Phaser.Scene, content: { icon?: string; label?: string }, run: () => void, o: { size?: number; round?: boolean; onHover?: (on: boolean) => void } = {}): { root: Phaser.GameObjects.Container; setActive(on: boolean): void } {
  const s = o.size ?? 48;
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const parts: Phaser.GameObjects.GameObject[] = [g];
  if (content.icon) parts.push(scene.add.image(0, 0, content.icon).setDisplaySize(s * 0.72, s * 0.72));
  else if (content.label) parts.push(fitW(elText(scene, 0, 0, content.label, Math.round(s * 0.36), EL.TXT, { em: 0.06 }).setOrigin(0.5), s - 8));
  let active = false;
  let hover = false;
  const draw = () => {
    g.clear();
    g.fillStyle(EL.INK, 0.55);
    if (o.round) g.fillCircle(0, 0, s / 2);
    else g.fillRect(-s / 2, -s / 2, s, s);
    const on = hover || active;
    g.lineStyle(active ? 2 : 1, on ? EL.ON_N : EL.GOLD, on ? 1 : EL.LINE.a2);
    if (o.round) g.strokeCircle(0, 0, s / 2 - 0.5);
    else g.strokeRect(-s / 2 + 0.5, -s / 2 + 0.5, s - 1, s - 1);
  };
  draw();
  const zone = scene.add.zone(0, 0, Math.max(s, 56), Math.max(s, 56)).setInteractive({ useHandCursor: true });
  root.add([...parts, zone]);
  zone.on('pointerover', () => {
    hover = true;
    draw();
    scene.tweens.add({ targets: root, y: root.y - 2, duration: 160, ease: EL.EASE });
    o.onHover?.(true);
  });
  zone.on('pointerout', () => {
    hover = false;
    draw();
    scene.tweens.add({ targets: root, y: root.y + 2, duration: 160, ease: EL.EASE });
    o.onHover?.(false);
  });
  zone.on('pointerup', run);
  return {
    root,
    setActive(on: boolean) {
      active = on;
      draw();
    },
  };
}

// --- Panel, başlık, durum ---

/** İnce çerçeveli koyu panel / kart (sol üst köşe (x, y)). `corners` = köşelerde küçük içi boş elmas. */
export function elPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: { alpha?: number; corners?: boolean; border?: number } = {}): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3).fillRect(x + 4, y + 12, w, h);
  g.lineStyle(3, EL.INK, 0.7).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  g.fillGradientStyle(0x1e160e, 0x1e160e, 0x0c0906, 0x0c0906, o.alpha ?? 0.94).fillRect(x, y, w, h);
  g.lineStyle(1, EL.GOLD, o.border ?? 0.42).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (o.corners) for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
    g.fillStyle(0x140e09, 1).fillPoints(diamondPts(cx, cy, 5), true);
    g.lineStyle(1, EL.GOLD, 0.7).strokePoints(diamondPts(cx, cy, 5), true);
  }
  return g;
}

/** Altın degradeli Cinzel başlık + iki yanda (ince çizgi + içi boş elmas) süs. Kök = başlığın ortası. */
export function elHeading(scene: Phaser.Scene, x: number, y: number, text: string, size = 40, o: { ornament?: number } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const t = scene.add
    .text(0, 0, text.toUpperCase(), { fontFamily: DISPLAY_FONT, fontSize: `${size}px`, fontStyle: '600', color: '#ffffff', letterSpacing: size * 0.14 })
    .setResolution(2)
    .setOrigin(0.5)
    .setShadow(0, 2, 'rgba(0,0,0,0.9)', 3, false, true)
    .setTint(0xfbe7b0, 0xfbe7b0, 0xc7984f, 0xc7984f);
  t.x = (size * 0.14) / 2;
  const half = (t.width - size * 0.14) / 2;
  const len = o.ornament ?? 120;
  const orn = scene.add.graphics();
  if (len > 0)
    for (const dir of [-1, 1]) {
      const d0 = half + 22;
      orn.lineStyle(1, EL.GOLD, 0.8).strokePoints(diamondPts(dir * (d0 + 4), 0, 5.6), true);
      fadeLine(orn, dir * (d0 + 16 + len), dir * (d0 + 16), 0, EL.GOLD, 0.6, 'in');
    }
  c.add([orn, t]);
  return c;
}

export type ElTone = 'ok' | 'note' | 'warn' | 'bad';
const TONE: Record<ElTone, string> = { ok: EL.ON, note: EL.NOTE, warn: EL.PRI, bad: EL.BAD };

/** Durum satırı (EB Garamond italik); `set` tonu ve isteğe bağlı nabzı ayarlar. ' · ' ile ayrılmış uyarılar `split` ile alt alta. */
export function elStatus(scene: Phaser.Scene, x: number, y: number, o: { size?: number; origin?: [number, number]; align?: 'left' | 'center' | 'right'; split?: boolean } = {}): { text: Phaser.GameObjects.Text; set(msg: string, tone?: ElTone | string, pulse?: boolean): void } {
  const t = elBody(scene, x, y, '', o.size ?? 20, EL.NOTE).setOrigin(...(o.origin ?? [0.5, 0.5])).setAlign(o.align ?? 'center').setLineSpacing(-2);
  let tw: Phaser.Tweens.Tween | undefined;
  return {
    text: t,
    set(msg, tone = 'note', pulse = false) {
      t.setText(o.split ? msg.split(/\s+·\s+/).join('\n') : msg).setColor(TONE[tone as ElTone] ?? tone);
      if (pulse) {
        tw?.stop();
        t.setScale(1.1);
        tw = scene.tweens.add({ targets: t, scale: 1, duration: 360, ease: 'Back.easeOut' });
      }
    },
  };
}

// --- Tooltip ---

export interface ElTipSpec {
  icon?: string;
  iconSize?: number;
  title: string;
  titleHex?: string;
  badge?: string;
  /** Başlığın altında yan yana küçük Cinzel etiketler (skill: hedef türü · element · Melee / Ranged; src/ui/skill-tags.ts). Varsa badge yerine. */
  tags?: Array<{ text: string; color?: string; icon?: string }>;
  /** Başlık altı ince çizginin altındaki küçük Cinzel satır (Cost · Cooldown). */
  meta?: string;
  shape?: MiniShape | null;
  lines: Array<[string, string?]>;
  width?: number;
}

/** Etiket satırı (yan yana, ince noktalarla ayrılmış küçük büyük harf Cinzel; element kendi renginde, ikonlu). Kök sol üst. */
function tagRow(scene: Phaser.Scene, x: number, tags: NonNullable<ElTipSpec['tags']>): Phaser.GameObjects.Container {
  const c = scene.add.container(x, 0);
  let cx = 0;
  const h = 22;
  tags.forEach((t, i) => {
    if (i > 0) {
      const dot = scene.add.graphics();
      dot.fillStyle(EL.GOLD, 0.55).fillCircle(cx + 6, h / 2, 1.6);
      c.add(dot);
      cx += 12;
    }
    if (t.icon) {
      c.add(scene.add.image(cx + 8, h / 2, t.icon).setDisplaySize(16, 16));
      cx += 20;
    }
    const tx = elText(scene, cx, h / 2, t.text, 13, t.color ?? EL.MUTED, { em: 0.14 }).setOrigin(0, 0.5);
    c.add(tx);
    cx += tx.displayWidth;
  });
  c.setSize(cx, h);
  // elBody ile aynı arayüz: yükseklik / genişlik ölçüsü
  (c as unknown as { height: number }).height = h;
  (c as unknown as { width: number }).width = cx;
  return c;
}

/** Tooltip kutusu (konumlanmamış; derinlik 5000). */
export function elTip(scene: Phaser.Scene, spec: ElTipSpec): { container: Phaser.GameObjects.Container; width: number; height: number } {
  const w = spec.width ?? 460;
  const px = 20;
  const items: Phaser.GameObjects.GameObject[] = [];
  const y0 = 18;
  const iconS = spec.icon ? (spec.iconSize ?? 52) : 0;
  let hx = px;
  if (spec.icon) {
    items.push(scene.add.image(px + iconS / 2, y0 + iconS / 2, spec.icon).setDisplaySize(iconS, iconS));
    const b = scene.add.graphics();
    b.lineStyle(1, EL.GOLD, EL.LINE.a2).strokeRect(px, y0, iconS, iconS);
    items.push(b);
    hx += iconS + 14;
  }
  const shapeSz = spec.shape ? miniShapeSize(spec.shape) : null;
  const textW = w - hx - px - (shapeSz ? shapeSz.w + 10 : 0);
  const title = fitW(elText(scene, hx, 0, spec.title, 24, spec.titleHex ?? EL.ON).setOrigin(0, 0), textW);
  const badge = spec.tags?.length ? tagRow(scene, hx, spec.tags) : spec.badge ? elBody(scene, hx, 0, spec.badge, 18, EL.MUTED).setOrigin(0, 0) : null;
  const headH = title.displayHeight + (badge ? badge.height : 0);
  const blockH = Math.max(iconS, headH);
  title.y = y0 + (blockH - headH) / 2;
  if (badge) {
    badge.y = title.y + title.displayHeight - 2;
    if (badge.width > textW) badge.setScale(textW / badge.width);
    items.push(badge);
  }
  items.push(title);
  if (spec.shape && shapeSz) items.push(drawMiniShape(scene, w - px - shapeSz.w, y0 + (blockH - shapeSz.h) / 2, spec.shape));
  let y = y0 + Math.max(blockH, shapeSz?.h ?? 0) + 8;
  const rule = scene.add.graphics();
  items.push(rule);
  if (spec.meta || spec.lines.length) {
    rule.lineStyle(1, EL.GOLD, EL.LINE.a1).lineBetween(px, y, w - px, y);
    y += spec.meta ? 6 : 8;
  }
  if (spec.meta) {
    const m = elText(scene, px, y, spec.meta, 14, EL.MUTED, { em: 0.1 }).setOrigin(0, 0);
    items.push(m);
    y += m.height + 8;
  }
  for (const [text, hex] of spec.lines) {
    const t = scene.add.text(px, y, text, { fontFamily: BODY_FONT, fontSize: '19px', color: hex ?? EL.TXT, wordWrap: { width: w - px * 2, useAdvancedWrap: true }, lineSpacing: 1 }).setResolution(2);
    items.push(t);
    y += t.height + 3;
  }
  const h = y + 14;
  const bg = elPanel(scene, 0, 0, w, h, { alpha: 0.97 });
  return { container: scene.add.container(0, 0, [bg, ...items]).setDepth(5000), width: w, height: h };
}

/** Tooltip'i bir dikdörtgenin üstüne (yer yoksa altına) koyar, görünen alandan taşırmaz, yukarı kayarak belirtir. */
export function placeElTip(scene: Phaser.Scene, tip: { container: Phaser.GameObjects.Container; width: number; height: number }, anchor: { x: number; y: number; w: number; h: number }, prefer: 'above' | 'below' = 'above'): void {
  let ty = prefer === 'above' ? anchor.y - tip.height - 14 : anchor.y + anchor.h + 14;
  if (ty < 50) ty = anchor.y + anchor.h + 14;
  if (ty + tip.height > 1080 - 8) ty = Math.max(8, anchor.y - tip.height - 14);
  const tx = Math.max(stageView.left + 16, Math.min(stageView.right - tip.width - 16, anchor.x + anchor.w / 2 - tip.width / 2));
  tip.container.setPosition(Math.round(tx), Math.round(ty) + 6).setAlpha(0);
  scene.tweens.add({ targets: tip.container, alpha: 1, y: Math.round(ty), duration: 160, ease: EL.EASE });
}

// --- Onay penceresi ---

const confirmOpen = new WeakSet<Phaser.Scene>();
/** Sahnede açık onay penceresi var mı? (Sahnenin kendi Esc / Enter işleyicileri bunu önce sormalı.) */
export const elConfirmOpen = (scene: Phaser.Scene): boolean => confirmOpen.has(scene);

/**
 * Zemine dokununca kapanma (oyun geneli kural, CLAUDE.md > Geri / Menu kuralı; DOM eşi src/ui/backdrop.ts): `shade` tüm alanı kaplayan
 * etkileşimli koyu örtü (sol üst köşesi `origin`), `rect` panel. Basış ve bırakış ikisi de panelin dışında ve örtünün üstündeyse `run`.
 * Panelin içinde başlayıp dışarıda biten sürükleme kapatmaz. Konumlar örtünün yerel koordinatından (kameradan bağımsız).
 */
export function elBackdropTap(scene: Phaser.Scene, shade: Phaser.GameObjects.Rectangle, rect: { x: number; y: number; w: number; h: number }, run: () => void): void {
  let down: { x: number; y: number } | null = null;
  const at = (lx: number, ly: number) => ({ x: shade.x + lx, y: shade.y + ly });
  shade.on('pointerdown', (_p: Phaser.Input.Pointer, lx: number, ly: number) => {
    down = at(lx, ly);
  });
  shade.on('pointerup', (_p: Phaser.Input.Pointer, lx: number, ly: number) => {
    const d = down;
    down = null;
    if (isBackdropTap(d, at(lx, ly), rect)) run();
  });
  // Başka bir nesnede başlayan basış (sürükleme) örtüde bitse de sayılmaz
  const reset = (_p: unknown, o: unknown) => {
    if (o !== shade) down = null;
  };
  scene.input.on('gameobjectdown', reset);
  shade.once('destroy', () => scene.input.off('gameobjectdown', reset));
}

/**
 * Onay penceresi (yalnızca ilerleme kaybolacaksa: savaşın ortasında çıkmak, koşuyu bırakmak; CLAUDE.md > "Geri / Menu kuralı").
 * Tüm görünür alanı kaplayan koyu örtü + ince çerçeveli panel + Yes (primary) / No (secondary). Esc ve örtüye dokunmak = No.
 */
export function elConfirm(scene: Phaser.Scene, o: { title?: string; text: string; yes?: string; no?: string; onYes: () => void; onNo?: () => void }): { close(): void } {
  const root = scene.add.container(0, 0).setDepth(7000);
  const shade = scene.add.rectangle(FULL_X0, 0, FULL_W, 1080, 0x050302, 0.62).setOrigin(0, 0).setInteractive();
  const w = 620;
  const body = elBody(scene, 960, 0, o.text, 22, EL.NOTE, true, w - 80).setOrigin(0.5, 0).setAlign('center');
  const titleH = o.title ? 56 : 0;
  const h = 40 + titleH + body.height + 36 + 64 + 34;
  const y0 = 540 - h / 2;
  const panel = elPanel(scene, 960 - w / 2, y0, w, h, { corners: true });
  root.add([shade, panel]);
  if (o.title) root.add(elText(scene, 960, y0 + 40 + 14, o.title, 28, EL.ON, { em: 0.08 }).setOrigin(0.5));
  body.y = y0 + 40 + titleH;
  root.add(body);
  let closed = false;
  confirmOpen.add(scene);
  const close = () => {
    if (closed) return;
    closed = true;
    confirmOpen.delete(scene);
    scene.input.keyboard?.off('keydown-ESC', onEsc);
    const off = (o: Phaser.GameObjects.GameObject): void => {
      if (o.input) o.disableInteractive();
      if (o instanceof Phaser.GameObjects.Container) o.each(off);
    };
    off(root); // kapanırken düğmeler ikinci kez basılmasın
    elModalOut(scene, root, () => root.destroy());
  };
  const by = y0 + h - 34 - 32;
  const yes = elButton(scene, o.yes ?? 'Yes', () => (close(), o.onYes()), { kind: 'primary', h: 64, size: 24, w: 220, ready: true });
  const no = elButton(scene, o.no ?? 'No', () => (close(), o.onNo?.()), { kind: 'secondary', h: 64, size: 22, w: 220 });
  // Düğme sırası (kit kuralı): ikincil (No / Cancel) solda, birincil eylem en sağda
  no.root.setPosition(960 - 130, by);
  yes.root.setPosition(960 + 130, by);
  root.add([yes.root, no.root]);
  const onEsc = () => {
    close();
    o.onNo?.();
  };
  scene.input.keyboard?.on('keydown-ESC', onEsc);
  // Zemine dokunmak = No (iptal); panelin içinde başlayan sürükleme kapatmaz
  elBackdropTap(scene, shade, { x: 960 - w / 2, y: y0, w, h }, () => (close(), o.onNo?.()));
  elModalIn(scene, root);
  return { close };
}

// --- Ortak hareket (Ömer 2026-10-10; data/ui-motion.json, src/ui/motion.ts; Reduced motion = anında) ---

/** Ekrana giriş: sahne kararıktan açılır (her sahnenin create() sonunda; ekran geçişi ön ayarı). */
export function elScreenIn(scene: Phaser.Scene): void {
  const m = motion('screen');
  const [r, g, b] = MOTION.screen.color as [number, number, number];
  if (m.inMs > 0) scene.cameras.main.fadeIn(m.inMs, r, g, b);
}

/** Ekrandan çıkış: sahne kararır, sonra `key` sahnesi açılır (yeni sahne elScreenIn ile açılır). Azaltılmış harekette hemen. */
export function elGo(scene: Phaser.Scene, key: string, data?: object): void {
  const m = motion('screen');
  const [r, g, b] = MOTION.screen.color as [number, number, number];
  const go = () => scene.sys.isActive() && scene.scene.start(key, data);
  if (m.outMs <= 0 || scene.cameras.main.fadeEffect.isRunning) return void go();
  scene.input.enabled = false; // kararırken ikinci tık başka yere gitmesin
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  scene.cameras.main.fadeOut(m.outMs, r, g, b);
}

/** Pencere açılışı: kök solarak belirir, `panel` (yoksa kök) 'rise' px aşağıdan yükselir. */
export function elModalIn(scene: Phaser.Scene, root: Phaser.GameObjects.Container, panel?: Phaser.GameObjects.Container): void {
  uiSound('open');
  const m = motion('modal');
  if (m.inMs <= 0) return void root.setAlpha(1);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: m.inMs, ease: MOTION.ease.phaser });
  const p = panel ?? root;
  const y = p.y;
  p.y = y + m.rise;
  scene.tweens.add({ targets: p, y, duration: m.inMs, ease: MOTION.ease.phaser });
}

/** Pencere kapanışı: kök söner, sonra `done` (azaltılmış harekette hemen). */
export function elModalOut(scene: Phaser.Scene, root: Phaser.GameObjects.Container, done: () => void): void {
  uiSound('close');
  const m = motion('modal');
  if (m.outMs <= 0) return done();
  scene.tweens.killTweensOf(root);
  scene.tweens.add({ targets: root, alpha: 0, duration: m.outMs, ease: 'Sine.easeIn', onComplete: done });
}

// --- Rozet, bildirim ---

const BADGE_TONES = {
  party: { fill: 0x2b5a92, ring: 0x9cbde6, text: '#f4f8ff' },
  enemies: { fill: 0x93382a, ring: 0xe39a88, text: '#fff4f0' },
  gold: { fill: 0x6e4f1e, ring: 0xf3d999, text: '#fff6dc' },
} as const;
export type ElBadgeTone = keyof typeof BADGE_TONES;
export const BADGE_LABEL: Record<'party' | 'enemies', string> = { party: '#9cbde6', enemies: '#e39a88' };

/** Yuvarlak sayı rozeti (0 iken gizli; değer değişince küçük zıplama). Düz rakamlı serif (Cinzel'in 1'i I gibi okunur). Kök = orta. */
export function elBadge(scene: Phaser.Scene, tone: ElBadgeTone, r = 12): { c: Phaser.GameObjects.Container; n: number; set(n: number, animate?: boolean): void } {
  const b = BADGE_TONES[tone];
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45).fillCircle(0, 1.5, r + 1.5);
  g.fillStyle(b.fill, 1).fillCircle(0, 0, r);
  g.lineStyle(1.5, b.ring, 1).strokeCircle(0, 0, r);
  const t = scene.add
    .text(0, 0.5, '', { fontFamily: NUM_FONT, fontSize: `${Math.round(r * 1.25)}px`, fontStyle: 'bold', color: b.text })
    .setResolution(2)
    .setOrigin(0.5)
    .setShadow(0, 1, 'rgba(0,0,0,0.6)', 2, false, true);
  const c = scene.add.container(0, 0, [g, t]).setVisible(false);
  const badge = {
    c,
    n: 0,
    set(n: number, animate = true) {
      if (n === badge.n) return;
      const appear = badge.n === 0 && n > 0;
      badge.n = n;
      t.setText(String(n));
      c.setVisible(n > 0);
      if (n > 0 && animate) {
        scene.tweens.killTweensOf(c);
        c.setScale(appear ? 0.4 : 1.25);
        scene.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
    },
  };
  return badge;
}

/** Üst ortada kısa bildirim (iki yana saydamlaşan koyu bant, EB Garamond italik); dönen fonksiyon mesajı gösterir. */
export function elToast(scene: Phaser.Scene, y = 145, parent?: Phaser.GameObjects.Container): (msg: string, sound?: UiSoundKind | null) => void {
  const band = scene.add.graphics();
  const text = elBody(scene, 0, 0, '', 23, EL.ON).setOrigin(0.5);
  const root = scene.add.container(960, y, [band, text]).setDepth(5500).setAlpha(0);
  parent?.add(root); // ör. iki kameralı sahnede arayüz katmanı
  let timer: Phaser.Time.TimerEvent | undefined;
  return (msg: string, sound: UiSoundKind | null = 'toast') => {
    if (!msg) return;
    if (sound) uiSound(sound);
    text.setText(msg);
    const w = text.width + 208;
    band.clear();
    hGradient(band, -w / 2, -26, w, 52, 0x0a0705, [
      [0, 0],
      [0.18, 0.92],
      [0.82, 0.92],
      [1, 0],
    ]);
    const m = motion('toast');
    scene.tweens.killTweensOf(root);
    root.setY(y - m.rise);
    scene.tweens.add({ targets: root, alpha: 1, y, duration: Math.max(1, m.inMs), ease: EL.EASE });
    timer?.remove();
    timer = scene.time.delayedCall(m.holdMs, () => scene.tweens.add({ targets: root, alpha: 0, y: y - m.rise, duration: Math.max(1, m.outMs), ease: EL.EASE }));
  };
}
