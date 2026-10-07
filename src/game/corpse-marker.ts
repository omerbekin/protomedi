import Phaser from 'phaser';
import { ensureIcon } from './icons';
import type { Pt } from './shape-geometry';

/** Ceset işaretinin renkleri: kemik beyazı kuru kafa, soluk altın ankh (parıltısız, sade). */
const BONE = '#d9d0bb';
const ANKH = '#c9a853';

export interface CorpseMarker {
  readonly container: Phaser.GameObjects.Container;
  /** Tüketilen / dirilen cesedin işareti: kısa süre solup kaybolur (`fast` = hemen). */
  remove(fast?: boolean): void;
  /** Raise Dead'in tüketeceği ceset: yumuşak nabız (ipucu); false = normal. */
  setConsumeHint(on: boolean): void;
  /** Raise Dead'in 2. adımında oyuncunun SEÇTİĞİ ceset: işaret büyür ve belirgin nabız atar; false = normal. */
  setSelected(on: boolean): void;
}

export interface CorpseMarkerOptions {
  /** Ölüm animasyonu yeni bittiyse işaret yumuşakça belirir; yükleme/senkron anında hemen görünür. */
  fadeIn: boolean;
  onOver?: () => void;
  onOut?: () => void;
}

/**
 * Cesedin yuvasındaki küçük işaret: zeminde yatık bir kuru kafa (hafif gölgeli) ve yanında/arkasında dik duran küçük bir ankh. Mevcut 'ankh' ve
 * 'skull' piksel ikonlarının yeniden kullanımı; ~56 px, sade (parıltı yok). `pos` hücrenin zemin merkezidir. Üstüne gelince `onOver` / `onOut`.
 */
export function createCorpseMarker(scene: Phaser.Scene, pos: Pt, opts: CorpseMarkerOptions): CorpseMarker {
  const shadow = scene.add.ellipse(0, -2, 72, 15, 0x000000, 0.4);
  const ankh = scene.add.image(18, -36, ensureIcon(scene, 'ankh', ANKH, false)).setDisplaySize(52, 52).setAlpha(0.92);
  const skull = scene.add.image(-9, -17, ensureIcon(scene, 'skull', BONE, false)).setDisplaySize(46, 40).setAngle(-9);
  const hit = scene.add.zone(0, -26, 84, 66).setInteractive();
  if (opts.onOver) hit.on('pointerover', opts.onOver);
  if (opts.onOut) hit.on('pointerout', opts.onOut);
  const container = scene.add.container(pos.x, pos.y, [shadow, ankh, skull, hit]).setDepth(pos.y - 1); // birimin (aynı y) altında kalır
  let gone = false;
  if (opts.fadeIn) {
    container.setAlpha(0).setY(pos.y - 6);
    scene.tweens.add({ targets: container, alpha: 1, y: pos.y, duration: 380, ease: 'Sine.easeOut' });
  }
  let pulse: Phaser.Tweens.Tween | undefined;
  return {
    container,
    remove: (fast = false) => {
      if (gone) return;
      gone = true;
      pulse?.stop();
      scene.tweens.killTweensOf(container);
      if (fast || !container.active) {
        container.destroy();
        return;
      }
      scene.tweens.add({ targets: container, alpha: 0, y: container.y - 8, scale: 0.88, duration: 420, ease: 'Quad.easeIn', onComplete: () => container.destroy() });
    },
    setConsumeHint: (on) => {
      if (gone || !container.active) return;
      pulse?.stop();
      pulse = undefined;
      scene.tweens.killTweensOf(container);
      container.setAlpha(1).setScale(1);
      if (on) pulse = scene.tweens.add({ targets: container, alpha: 0.55, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    },
    setSelected: (on) => {
      if (gone || !container.active) return;
      pulse?.stop();
      pulse = undefined;
      scene.tweens.killTweensOf(container);
      container.setAlpha(1).setScale(1);
      if (on) {
        container.setScale(1.3);
        pulse = scene.tweens.add({ targets: container, scale: 1.45, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    },
  };
}
