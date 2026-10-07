/**
 * Geometer - SÜRÜM 2 SKILL ANİMASYONLARI (boş iskelet; content-designer doldurur). Kılavuz: docs/design/art-v2.md
 *
 * Nasıl: VFX içine anahtar = skill'in v1 `vfx` adı (vfx'i olmayan skill'de skill id'si) olan bir fonksiyon koy:
 *   async (c, k) => { ... }   c = VfxCtx (v1 ile aynı: c.actor, c.targets, c.centerPos, c.cells, c.lunge, c.windUp, c.sfx, c.gate...)
 *                             k = yardımcılar: k.sprite, k.burst, k.ring, k.travel, k.flash, k.shake, k.wait, k.counter, k.v2Sprite,
 *                                 k.Phaser ve v1 efektleri k.v1.<ad>(c) (eskisini temel alıp üstüne eklemek için)
 * Promise "vuruş anında" çözülmeli (hasar rakamları o an çıkar). Yoksa v1 efekti oynar.
 * Phaser'ı ve ../../vfx'i ÇALIŞMA ZAMANINDA içe aktarma (yalnızca import type); her şey k üzerinden gelir.
 *
 * Bu class'ın skill'leri -> VFX anahtarları:
 *   shape_row (Row Sweep) -> 'shaperow'
 *   shape_column (Column Spear) -> 'shapecolumn'
 *   shape_rect (Block Slam) -> 'shaperect'
 *   shape_plus (Cross Burst) -> 'shapeplus'
 */
import type { V2Vfx } from '../types';

export const VFX: Record<string, V2Vfx> = {};
