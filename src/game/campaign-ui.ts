import Phaser from 'phaser';
import { content } from '../engine';
import { classAvatar, goldText, makeMenuButton, serif } from './menu-ui';
import { GOLD, SERIF, makePanel } from './ui-frame';

/**
 * Sefer ekranlarının ortak parçaları (ana menü ve harita): pencere (modal), sınıf kartı, can çubuğu, parşömen plaka.
 * Hepsi kodla çizilir; metinler İngilizce. Her parça verilen `layer` container'ına eklenir (harita sahnesinde arayüz kamerası katmanı).
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

/** Wraps text to a width (serif metin). */
export function bodyText(scene: Phaser.Scene, x: number, y: number, text: string, width: number, size = 26, color = '#e8d9b8'): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: SERIF, fontSize: `${size}px`, color, stroke: '#0c0805', strokeThickness: 3, wordWrap: { width }, align: 'center', lineSpacing: 6 })
    .setResolution(2)
    .setOrigin(0.5, 0);
}

/** Ortada pencere: kararan zemin (altındaki tıklamaları yutar), taş panel, altın başlık, metin, alt düğmeler. */
export function openModal(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  o: { title: string; subtitle?: string; text?: string; width?: number; height?: number; buttons?: ModalButton[]; dim?: number; y?: number },
): Modal {
  const w = o.width ?? 980;
  const h = o.height ?? 520;
  const x = W / 2 - w / 2;
  const y = o.y ?? H / 2 - h / 2;
  const root = scene.add.container(0, 0);
  layer.add(root);
  const dim = scene.add.rectangle(0, 0, W, H, 0x050302, o.dim ?? 0.55).setOrigin(0, 0).setInteractive();
  root.add(dim);
  root.add(makePanel(scene, x, y, w, h, { top: 0x2e2218, bottom: 0x110b07, bevel: 5, alpha: 0.98 }));
  root.add(goldText(scene, W / 2, y + 52, o.title, 48, 3).setOrigin(0.5));
  let top = y + 92;
  if (o.subtitle) {
    root.add(serif(scene, W / 2, top + 4, o.subtitle, 22, '#b9a27a', { bold: false, stroke: 2, spacing: 1 }).setOrigin(0.5, 0));
    top += 40;
  }
  if (o.text) {
    const t = bodyText(scene, W / 2, top + 6, o.text, w - 120);
    root.add(t);
    top += t.height + 22;
  }
  const buttons = o.buttons ?? [];
  const by = y + h - 64;
  const bw = Math.min(360, (w - 80) / Math.max(1, buttons.length) - 30);
  const x0 = W / 2 - ((buttons.length - 1) * (bw + 30)) / 2;
  buttons.forEach((b, i) => root.add(makeMenuButton(scene, x0 + i * (bw + 30), by, bw, 78, b.label, b.run, { primary: !!b.primary, size: b.primary ? 32 : 28 }).container));
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 220 });
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

/** Can çubuğu (0-1), yeşil -> sarı -> kırmızı. */
export function hpBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = Phaser.Math.Clamp(ratio, 0, 1);
  const col = r > 0.6 ? 0x4f9a4a : r > 0.3 ? 0xc9a23a : 0xb2463c;
  g.fillStyle(0x090604, 1).fillRect(x, y, w, h);
  if (r > 0) g.fillStyle(col, 1).fillRect(x + 1, y + 1, Math.max(2, (w - 2) * r), h - 2);
  g.fillStyle(0xffffff, 0.12).fillRect(x + 1, y + 1, w - 2, Math.max(1, h / 3));
  g.lineStyle(1, GOLD.dark, 1).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  return g;
}

/** Küçük taç (lider işareti), merkez (cx, cy). */
export function crown(scene: Phaser.Scene, cx: number, cy: number, s = 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const pts = [-14, 8, -14, -6, -7, 1, 0, -10, 7, 1, 14, -6, 14, 8].map((v) => v * s);
  const p = Array.from({ length: pts.length / 2 }, (_, i) => new Phaser.Math.Vector2(cx + pts[i * 2]!, cy + pts[i * 2 + 1]!));
  g.fillStyle(0xf2c94c, 1).fillPoints(p, true);
  g.lineStyle(2, 0x5a3a10, 1).strokePoints(p, true);
  g.fillStyle(0xb2463c, 1).fillCircle(cx, cy + 3 * s, 2.5 * s);
  return g;
}

export interface ClassCard {
  container: Phaser.GameObjects.Container;
  setSelected(on: boolean): void;
  setLeader(on: boolean): void;
}

/** Sınıf kartı: kafa avatarı, ad, birincil stat; seçilince altın çerçeve, lider tacı. Dokunma alanı kartın tamamı (>= 44 gerçek px). */
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
  const draw = (sel: boolean) => {
    bg.clear();
    bg.fillGradientStyle(sel ? 0x4a3418 : 0x2a2017, sel ? 0x4a3418 : 0x2a2017, 0x120c07, 0x120c07, 1).fillRect(-w / 2, -h / 2, w, h);
    bg.lineStyle(sel ? 4 : 2, sel ? GOLD.bright : GOLD.edge, 1).strokeRect(-w / 2, -h / 2, w, h);
  };
  draw(false);
  c.add(bg);
  const av = Math.min(w - 30, h - 80);
  c.add(classAvatar(scene, def, 0, -h / 2 + 12 + av / 2, av));
  const name = serif(scene, 0, h / 2 - 50, def.name, 22, '#f3e4c4').setOrigin(0.5);
  if (name.width > w - 12) name.setScale((w - 12) / name.width);
  c.add(name);
  const sub = o.tag ?? (def.primary ? def.primary.toUpperCase() : '');
  c.add(serif(scene, 0, h / 2 - 24, sub, 15, '#b9a27a', { bold: false, stroke: 2, spacing: 1 }).setOrigin(0.5));
  if (o.hp !== undefined) c.add(hpBar(scene, -w / 2 + 12, h / 2 - 12, w - 24, 7, o.hp));
  const crownMark = crown(scene, w / 2 - 22, -h / 2 + 20, 1).setVisible(false);
  c.add(crownMark);
  if (o.onTap) {
    const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => o.onTap?.());
    zone.on('pointerover', () => c.setScale(1.03));
    zone.on('pointerout', () => c.setScale(1));
    c.add(zone);
  }
  return { container: c, setSelected: draw, setLeader: (on) => crownMark.setVisible(on) };
}

/** Parşömen plaka (harita etiketleri): açık krem degrade, koyu kahve kenar. Merkez üst (cx, top). */
export function parchmentPlate(scene: Phaser.Scene, cx: number, top: number, w: number, h: number, alpha = 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35 * alpha).fillRect(cx - w / 2 + 3, top + 4, w, h);
  g.fillGradientStyle(0xf1e4c3, 0xf1e4c3, 0xd9c497, 0xd9c497, alpha).fillRect(cx - w / 2, top, w, h);
  g.lineStyle(2, 0x6b4f26, alpha).strokeRect(cx - w / 2, top, w, h);
  g.lineStyle(1, 0xb08a4a, 0.8 * alpha).strokeRect(cx - w / 2 + 4, top + 4, w - 8, h - 8);
  return g;
}
