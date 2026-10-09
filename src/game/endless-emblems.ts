import Phaser from 'phaser';
import { ensureGlow } from './menu-ui';
import { EL } from './elegant-ui';
import { ITEM_ICON_SIZE, REWARD_ICON, itemIconName, paintItemIcon } from './item-icons';

/**
 * Endless ödül / dükkân / kalıntı kartlarının amblemleri. İkonlar piksel art (tek ortak kaynak: src/game/item-icons.ts; Gear ekranı,
 * Spoils kartı ve Codex de aynı çizimleri gösterir); burada Phaser dokusuna 1:1 çevrilir (NEAREST).
 * Madalyon (tasarım kiti): koyu disk + renkli ince halka + arkada yumuşak parıltı; `rich` (elit / boss / kalıntı) ince ikinci halka ekler.
 */

/** Piksel ikon dokusu (bir kez üretilir; nadirlik rengi anahtarın parçası). */
function pixelTexture(scene: Phaser.Scene, name: string, accent?: string): string {
  const key = `item-icon:${name}:${accent ?? ''}`;
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, ITEM_ICON_SIZE, ITEM_ICON_SIZE);
  if (!t) return key;
  paintItemIcon(t.getContext(), name, accent);
  t.refresh();
  t.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** Item ikonu (item'in `icon` alanı > silah ailesi > yuva); nadirlik rengi taş / kenar ayrıntısını boyar. */
export const itemEmblem = (scene: Phaser.Scene, d: { slot: string; family?: string; icon?: string }, rarityColor: string): string => pixelTexture(scene, itemIconName(d), rarityColor);

/** Altın: deri kese ve sikke yığını. */
export const purseEmblem = (scene: Phaser.Scene): string => pixelTexture(scene, REWARD_ICON.gold);
/** Rest / şifa: kırmızı iksir şişesi. */
export const healEmblem = (scene: Phaser.Scene): string => pixelTexture(scene, REWARD_ICON.heal);
/** Hero's Feast: kızarmış kuş ve kadeh. */
export const feastEmblem = (scene: Phaser.Scene): string => pixelTexture(scene, REWARD_ICON.feast);

/** Piksel ikonların madalyondaki ölçeği (disk çapına oran). */
export const PIXEL_ICON_SCALE = 0.88;

/** Renk dizgesi -> sayı. */
export const hexNum = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

/**
 * Madalyon: parıltı + koyu disk + halka (+ rich: ince dış halka) + ortada amblem dokusu. Kök = merkez.
 * `iconScale`: amblemin disk çapına oranı (varsayılan PIXEL_ICON_SCALE).
 */
export function medallion(scene: Phaser.Scene, texture: string, color: number, r: number, o: { rich?: boolean; iconScale?: number } = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const glow = scene.add.image(0, 0, ensureGlow(scene)).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(o.rich ? 0.34 : 0.22).setDisplaySize(r * 4, r * 4);
  const g = scene.add.graphics();
  g.fillStyle(EL.INK, 0.72).fillCircle(0, 0, r);
  g.lineStyle(1.5, color, 0.7).strokeCircle(0, 0, r);
  g.lineStyle(1, EL.GOLD, EL.LINE.a1).strokeCircle(0, 0, r - 7);
  // rich: yalnızca ince dış halka (Ömer 2026-10-09: madalyonun dört yanındaki elmaslar kaldırıldı)
  if (o.rich) g.lineStyle(1, color, 0.32).strokeCircle(0, 0, r + 9);
  const icon = scene.add.image(0, 0, texture).setDisplaySize(r * 2 * (o.iconScale ?? PIXEL_ICON_SCALE), r * 2 * (o.iconScale ?? PIXEL_ICON_SCALE));
  c.add([glow, g, icon]);
  // Yavaş nefes (yalnızca parıltı)
  scene.tweens.add({ targets: glow, alpha: { from: glow.alpha, to: glow.alpha * 0.6 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return c;
}
