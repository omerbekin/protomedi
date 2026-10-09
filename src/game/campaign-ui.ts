import Phaser from 'phaser';
import { content } from '../engine';
import { classAvatar, classLogoBadge } from './menu-ui';
import { FULL_W, FULL_X0 } from '../ui/viewport';
import { EL, elBody, elButton, elHeading, elPanel, elText, fitW } from './elegant-ui';
import { BODY_FONT } from '../ui/menu-style';

/**
 * Sefer ekranlarının ortak parçaları (ana menü ve harita): pencere (modal), sınıf kartı, can çubuğu, taç.
 * Görünüm tasarım kitidir (src/game/elegant-ui.ts; CLAUDE.md > Tasarım kiti): ince çerçeveli koyu panel, altın Cinzel başlık,
 * EB Garamond metin, kit düğmeleri. Her parça verilen `layer` container'ına eklenir (harita sahnesinde arayüz kamerası katmanı).
 */

export const W = 1920;
export const H = 1080;

export interface ModalButton {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface Modal {
  root: Phaser.GameObjects.Container;
  close: () => void;
  /** İçerik alanı (pencere içi, başlık ve düğmeler hariç). */
  area: { x: number; y: number; w: number; h: number };
}

/** Ortalanmış, sarılmış gövde metni (EB Garamond). */
export function bodyText(scene: Phaser.Scene, x: number, y: number, text: string, width: number, size = 25, color: string = EL.NOTE): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: BODY_FONT, fontSize: `${size}px`, color, wordWrap: { width, useAdvancedWrap: true }, align: 'center', lineSpacing: 4 })
    .setResolution(2)
    .setShadow(0, 2, EL.SH_DARK, 4, false, true)
    .setOrigin(0.5, 0);
}

/** Ortada pencere: kararan zemin (altındaki tıklamaları yutar), kit paneli, altın başlık, metin, alt düğmeler (ilk primary). */
export function openModal(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  o: { title: string; subtitle?: string; text?: string; width?: number; height?: number; buttons?: ModalButton[]; dim?: number; y?: number; fit?: boolean },
): Modal {
  const w = o.width ?? 980;
  const root = scene.add.container(0, 0);
  layer.add(root);
  const dim = scene.add.rectangle(FULL_X0, 0, FULL_W, H, 0x050302, o.dim ?? 0.62).setOrigin(0, 0).setInteractive(); // geniş ekranda da tüm alan
  root.add(dim);
  // Yazılar önce ölçülür: `fit` (onay pencereleri) yüksekliği içeriğe göre kısar, metin ile düğmeler arasında boşluk kalmaz
  const sub = o.subtitle ? elBody(scene, W / 2, 0, o.subtitle, 22, EL.MUTED, true, w - 140).setOrigin(0.5, 0).setAlign('center') : null;
  const text = o.text ? bodyText(scene, W / 2, 0, o.text, w - 140) : null;
  const buttons = o.buttons ?? [];
  const contentH = (sub ? sub.height + 12 : 0) + (text ? text.height + 22 : 0);
  const h = o.fit ? 96 + contentH + (buttons.length ? 120 : 30) : (o.height ?? 520);
  const x = W / 2 - w / 2;
  const y = o.y ?? H / 2 - h / 2;
  root.add(elPanel(scene, x, y, w, h, { corners: true, alpha: 0.97 }));
  root.add(elHeading(scene, W / 2, y + 54, o.title, 40, { ornament: Math.min(120, w / 2 - 220) }));
  let top = y + 96;
  if (sub) {
    sub.y = top;
    root.add(sub);
    top += sub.height + 12;
  }
  if (text) {
    text.y = top + 6;
    root.add(text);
    top += text.height + 22;
  }
  const by = y + h - 62;
  const bw = Math.min(330, (w - 100) / Math.max(1, buttons.length) - 34);
  const x0 = W / 2 - ((buttons.length - 1) * (bw + 34)) / 2;
  buttons.forEach((b, i) => {
    const btn = elButton(scene, b.label, b.run, { kind: b.primary ? 'primary' : 'secondary', w: bw, h: b.primary ? 72 : 60, size: b.primary ? 24 : 19, ready: true });
    btn.root.setPosition(x0 + i * (bw + 34), by);
    root.add(btn.root);
  });
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 200, ease: EL.EASE });
  let closed = false;
  return {
    root,
    area: { x: x + 30, y: top, w: w - 60, h: by - 50 - top },
    close: () => {
      if (closed) return;
      closed = true;
      root.destroy(true);
    },
  };
}

/** İnce can çubuğu (0-1): koyu zemin, yeşil -> sarı -> kırmızı, ince altın çerçeve (kit). */
export function hpBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = Phaser.Math.Clamp(ratio, 0, 1);
  const col = r > 0.6 ? 0x7fb85a : r > 0.3 ? 0xd9b24a : 0xc4553f;
  g.fillStyle(EL.INK, 0.85).fillRect(x, y, w, h);
  if (r > 0) g.fillStyle(col, 0.95).fillRect(x + 1, y + 1, Math.max(2, (w - 2) * r), h - 2);
  g.lineStyle(1, EL.GOLD, EL.LINE.a2).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  return g;
}

/** Küçük taç (lider işareti), merkez (cx, cy): ince altın çizgi + kor taş. */
export function crown(scene: Phaser.Scene, cx: number, cy: number, s = 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const pts = [-14, 8, -14, -6, -7, 1, 0, -10, 7, 1, 14, -6, 14, 8].map((v) => v * s);
  const p = Array.from({ length: pts.length / 2 }, (_, i) => new Phaser.Math.Vector2(cx + pts[i * 2]!, cy + pts[i * 2 + 1]!));
  g.fillStyle(0x2a1d10, 0.95).fillPoints(p, true);
  g.lineStyle(1.5, EL.ON_N, 1).strokePoints(p, true);
  g.fillStyle(EL.EMBER, 1).fillCircle(cx, cy + 3 * s, 2.5 * s);
  return g;
}

export interface ClassCard {
  container: Phaser.GameObjects.Container;
  setSelected(on: boolean): void;
  setLeader(on: boolean): void;
}

/** Sınıf kartı (kit): ince çerçeve, kafa avatarı, Cinzel ad, primary stat; seçilince açık altın çerçeve, lider tacı. Dokunma alanı kartın tamamı. */
export function classCard(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  classId: string,
  o: { tag?: string; hp?: number; onTap?: () => void } = {},
): ClassCard {
  const def = content.classes[classId]!;
  const c = scene.add.container(cx, cy);
  const bg = scene.add.graphics();
  let hover = false;
  let sel = false;
  const draw = () => {
    bg.clear();
    bg.fillGradientStyle(0x281d13, 0x281d13, 0x0a0705, 0x0a0705, sel ? 0.95 : 0.8).fillRect(-w / 2, -h / 2, w, h);
    if (sel) bg.lineStyle(2, EL.ON_N, 1).strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    else bg.lineStyle(1, EL.GOLD, hover ? 1 : EL.LINE.a2).strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
  };
  draw();
  c.add(bg);
  const av = Math.min(w - 30, h - 80);
  c.add(classAvatar(scene, def, 0, -h / 2 + 12 + av / 2, av));
  c.add(classLogoBadge(scene, def, -av / 2 + 14, -h / 2 + 12 + av - 12, 15)); // class logosu (seçili sanat sürümüyle)
  const name = fitW(elText(scene, 0, h / 2 - 50, def.name, 19, EL.ON, { em: 0.05 }).setOrigin(0.5), w - 12);
  c.add(name);
  const sub = o.tag ?? (def.primary ? def.primary.toUpperCase() : '');
  c.add(fitW(elBody(scene, 0, h / 2 - 24, sub, 16, EL.MUTED).setOrigin(0.5), w - 12));
  if (o.hp !== undefined) c.add(hpBar(scene, -w / 2 + 12, h / 2 - 12, w - 24, 6, o.hp));
  const crownMark = crown(scene, w / 2 - 22, -h / 2 + 20, 1).setVisible(false);
  c.add(crownMark);
  if (o.onTap) {
    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => o.onTap?.());
    zone.on('pointerover', () => {
      hover = true;
      draw();
      scene.tweens.add({ targets: c, y: cy - 4, duration: 200, ease: EL.EASE });
    });
    zone.on('pointerout', () => {
      hover = false;
      draw();
      scene.tweens.add({ targets: c, y: cy, duration: 200, ease: EL.EASE });
    });
    c.add(zone);
  }
  return {
    container: c,
    setSelected: (on) => {
      sel = on;
      draw();
    },
    setLeader: (on) => crownMark.setVisible(on),
  };
}
