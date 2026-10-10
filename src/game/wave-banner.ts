// Endless sürekli akış (Ömer 2026-10-10, open-questions madde 300): dalga başı "WAVE X" bandı ve yeni düşmanların girişi (tasarım kiti:
// Cinzel 600 büyük harf + EB Garamond italik alt yazı, ince altın çizgiler, tek kor elmas). Süreler data/ui-motion.json > wave; Reduced motion:
// hareket yok (bant anında belirir / kaybolur) ama okunabilsin diye yine holdMs kadar ekranda kalır.
import Phaser from 'phaser';
import { MOTION, motion } from '../ui/motion';
import { reducedMotion } from '../ui/motion-pref';
import { FULL_W, FULL_X0 } from '../ui/viewport';
import { EL, elBody, elDiamond, elText, fadeLine, vGradient } from './elegant-ui';

const W = 1920;
const CY = 300; // birimlerin ad plakalarının üstünde (gökyüzü)

/** Bandı gösterir; bitince (sönünce) çözülür. `title` = "WAVE 7", `sub` = karşılaşma adı ya da düşmanlar. */
export function showWaveBanner(scene: Phaser.Scene, title: string, sub?: string): Promise<void> {
  const m = motion('wave');
  const hold = MOTION.wave.holdMs;
  const root = scene.add.container(0, 0).setDepth(4900);
  const band = scene.add.graphics();
  vGradient(band, FULL_X0, CY - 130, FULL_W, 260, EL.INK, [
    [0, 0],
    [0.3, 0.72],
    [0.7, 0.72],
    [1, 0],
  ]);
  const lines = scene.add.graphics();
  fadeLine(lines, W / 2 - 520, W / 2 + 520, CY - 74, EL.GOLD, EL.LINE.a3, 'both');
  fadeLine(lines, W / 2 - 420, W / 2 + 420, CY + 82, EL.GOLD, EL.LINE.a2, 'both');
  const dia = elDiamond(scene, 7).setPosition(W / 2, CY - 74);
  const t = elText(scene, W / 2, CY + 2, title, 104, EL.ON, { em: 0.18 }).setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [band, lines, dia, t];
  if (sub) parts.push(elBody(scene, W / 2, CY + 114, sub, 30, EL.NOTE, true).setOrigin(0.5));
  root.add(parts);
  return new Promise((resolve) => {
    const done = () => {
      root.destroy();
      resolve();
    };
    if (reducedMotion() || m.inMs <= 0) {
      scene.time.delayedCall(hold, done);
      return;
    }
    root.setAlpha(0);
    t.setScale(1.08);
    scene.tweens.add({ targets: root, alpha: 1, duration: m.inMs, ease: MOTION.ease.phaser });
    scene.tweens.add({ targets: t, scale: 1, duration: m.inMs + hold, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: root, alpha: 0, delay: m.inMs + hold, duration: m.outMs, ease: 'Sine.easeIn', onComplete: done });
  });
}

/** Yeni düşmanlar girer: sağdan kayarak belirir (Reduced motion: anında). `views` = düşman görünümlerinin kapları (önceden gizli). */
export function enemiesEnter(scene: Phaser.Scene, containers: Phaser.GameObjects.Container[]): Promise<void> {
  const m = motion('wave');
  if (!containers.length) return Promise.resolve();
  if (m.enterMs <= 0) {
    for (const c of containers) c.setAlpha(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let left = containers.length;
    containers.forEach((c, i) => {
      const x = c.x;
      c.setX(x + MOTION.wave.enterOffset).setAlpha(0);
      scene.tweens.add({
        targets: c,
        x,
        alpha: 1,
        delay: i * 70,
        duration: m.enterMs,
        ease: MOTION.ease.phaser,
        onComplete: () => --left === 0 && resolve(),
      });
    });
  });
}
