/**
 * Kalıcı alan pusunun çizimi (yaşam döngüsü: `linger-haze.ts`). v1 dışı yeni modül: Smoke Bomb'un cast animasyonu (vfx.ts, DONDURULDU) aynen kalır;
 * bu pus cast dumanı dağılırken alanın hücrelerinde belirir, etki sürdükçe çok soluk ve yavaşça sürüklenen gri-kömür bir sis olarak kalır.
 *
 * Katman: derinlik 35 = zemin efektlerinin (30) üstü, hücre seçim plakalarının (40/60) ve birimlerin (derinlik = ayak y'si, ~780+) altı. Böylece
 * hedef hücreleri, birimleri ve isim/can plakalarını örtmez; birimlerin aralarında ve ayaklarında görünür.
 */
import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { content } from '../engine';
import { cellQuad } from './shape-geometry';

const PUFF_KEY = 'fx:hazePuff';
/** Pus katmanı derinliği (bkz. dosya başı). */
export const HAZE_DEPTH = 35;

/** Görünüm ayarları (yalnızca görsel; oyun kuralı değil). */
const SMOKE = {
  tints: [0x6c737b, 0x8c949d, 0xc4c9cf],
  /** Tek puf saydamlığı aralığı: üst üste binince yumuşak kenarlı dokuyla görünür yoğunluk ~%15-25 (soluk ama okunur). */
  alpha: [0.3, 0.4] as [number, number],
  puffsPerCell: 5,
  /** Pufun hücre merkezinden yukarı kayması (px): bilek-diz hizasında asılı durur. */
  lift: [0, 18] as [number, number],
  drift: [10, 22] as [number, number],
  driftMs: [3800, 6200] as [number, number],
  fadeInDelayMs: 650,
  fadeInMs: 1400,
  fadeOutMs: 1100,
};

/** Yumuşak radyal puf dokusu (beyaz, kenara doğru saydam); tint ile boyanır. Bir kez üretilir. */
function ensurePuff(scene: Phaser.Scene): void {
  if (scene.textures.exists(PUFF_KEY)) return;
  const size = 128;
  const tex = scene.textures.createCanvas(PUFF_KEY, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

const between = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);

export interface HazeView {
  /** Yavaşça söner ve kendini yok eder. */
  fadeOut(): void;
  destroy(): void;
}

/** Hücrelerin üstünde soluk duman pusu (`board` tahtasında, `slots` hücreleri). */
export function smokeHaze(scene: Phaser.Scene, board: 'party' | 'enemy', slots: number[]): HazeView {
  ensurePuff(scene);
  const boardSlots = (board === 'party' ? layout.partySlots : layout.enemySlots) as Array<{ x: number; y: number }>;
  const items: Phaser.GameObjects.Image[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  for (const slot of slots) {
    const q = cellQuad(boardSlots, content.GRID.lanes, slot, 1);
    // dörtgenin iki ekseni: sıra yönü (q0->q1, uzun) ve şerit yönü (q0->q3, eğik kısa)
    const ax = { x: (q[1]!.x - q[0]!.x) / 2, y: (q[1]!.y - q[0]!.y) / 2 };
    const lx = { x: (q[3]!.x - q[0]!.x) / 2, y: (q[3]!.y - q[0]!.y) / 2 };
    const c = { x: (q[0]!.x + q[2]!.x) / 2, y: (q[0]!.y + q[2]!.y) / 2 };
    const w = Math.hypot(ax.x, ax.y) * 2;
    for (let i = 0; i < SMOKE.puffsPerCell; i++) {
      const t = -0.55 + (1.1 * (i + Math.random() * 0.6)) / SMOKE.puffsPerCell;
      const u = (Math.random() - 0.5) * 0.7;
      const x = c.x + ax.x * t + lx.x * u;
      const y = c.y + ax.y * t + lx.y * u - between(SMOKE.lift);
      const a = between(SMOKE.alpha);
      const img = scene.add
        .image(x, y, PUFF_KEY)
        .setTint(SMOKE.tints[Math.floor(Math.random() * SMOKE.tints.length)]!)
        .setAlpha(a)
        .setScale((w * between([0.8, 1.05])) / 128, between([0.5, 0.7]));
      items.push(img);
      // yavaş sürüklenme (iki yana) + hafif yükselip alçalma + nefes alan saydamlık
      const dir = Math.random() < 0.5 ? -1 : 1;
      tweens.push(
        scene.tweens.add({ targets: img, x: x + dir * between(SMOKE.drift), y: y - between([2, 7]), duration: between(SMOKE.driftMs), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1200 }),
        scene.tweens.add({ targets: img, alpha: a * 0.6, scaleX: img.scaleX * 1.08, duration: between([2600, 4400]), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1500 }),
      );
    }
  }
  const box = scene.add.container(0, 0, items).setDepth(HAZE_DEPTH).setAlpha(0);
  let fadeIn: Phaser.Tweens.Tween | undefined = scene.tweens.add({ targets: box, alpha: 1, delay: SMOKE.fadeInDelayMs, duration: SMOKE.fadeInMs, ease: 'Sine.easeOut' });
  let gone = false;
  const destroy = () => {
    if (gone) return;
    gone = true;
    for (const tw of tweens) tw.remove();
    fadeIn?.remove();
    box.destroy();
  };
  return {
    fadeOut() {
      if (gone) return;
      fadeIn?.remove();
      fadeIn = undefined;
      scene.tweens.add({ targets: box, alpha: 0, duration: SMOKE.fadeOutMs, ease: 'Sine.easeIn', onComplete: destroy });
    },
    destroy,
  };
}
