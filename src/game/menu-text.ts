import type Phaser from 'phaser';
import { SERIF } from './ui-frame';

/**
 * Menünün hafif çizim yardımcıları (parıltı dokusu, yazı): ana menü ilk kod parçasında bunlarla yetinir (hızlı açılış); portre / class logosu /
 * atmosferik arka plan src/game/menu-ui.ts'te kalır (ikon motorunu çeker). menu-ui bunları aynen yeniden dışa verir.
 */

/**
 * Menü parıltı şiddeti (tek ayar noktası): 1 = eski (çok parlak) görünüm, 0 = hiç parıltı yok. Varsayılan 0,4.
 * Işık huzmeleri, toz zerreleri, meşale, başlık ışığı, düğme/kart/yuva parlamaları buna göre ölçeklenir.
 */
export const GLOW_SCALE = 0.4;
/** Bir parıltı alfasını GLOW_SCALE ile ölçekler (eski alfa -> yeni alfa). */
export const fx = (alpha: number): number => alpha * GLOW_SCALE;

// --- Dokular ---

export function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
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

