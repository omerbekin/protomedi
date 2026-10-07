/**
 * Sürüm 2 (v2) sanat dosyalarının ortak tipleri. Kılavuz: docs/design/art-v2.md.
 * Bu dosya ve class dosyaları Phaser'ı ÇALIŞMA ZAMANINDA içe aktarmaz (yalnızca `import type`): böylece testlerde (node) yüklenebilir
 * ve döngüsel import olmaz. Efekt yardımcıları (sprite, burst, ring, travel...) vfx fonksiyonuna ikinci parametre `k` olarak verilir.
 */
import type { Draw } from '../pixel-art';
import type { SfxDef } from '../audio';
import type { VfxCtx } from '../vfx';
import type { VfxKit } from '../vfx-versions';

/** v2 ikon/efekt sprite'larının varsayılan çözünürlüğü (ince piksel). v1 = 64. */
export const V2_DEFAULT_SIZE = 128;

/**
 * Bir v2 çizimi. Kısa yazım: yalnızca çizim fonksiyonu (128x128, 32'lik mantıksal koordinat, otomatik kontur).
 * Uzun yazım: boyut (ör. 96, 128, 192, 256), mantıksal uzay (`logical`: koordinatların 0..logical aralığı; varsayılan 32,
 * ham piksel için `logical = size`), kontur (efekt halkası gibi ince çizimlerde false).
 */
export interface V2Sprite {
  draw: Draw;
  size?: number;
  logical?: number;
  outline?: boolean;
}
export type V2SpriteEntry = Draw | V2Sprite;

/** v2 skill efekti: v1 ile aynı bağlam (`c`), ek olarak v1 efekt yardımcıları ve v1 efektlerinin kendisi (`k`). */
export type V2Vfx = (c: VfxCtx, k: VfxKit) => Promise<void>;

/** data/audio-v2/<classId>.json şeması (data/audio.json ile aynı `sfx` biçimi; `master` yok, ana ses seviyesi audio.json'dan). */
export interface AudioFileV2 {
  _not?: string;
  sfx: Record<string, SfxDef>;
}

/** Bir class'ın v2 ikon dosyasının dışa açtıkları. */
export interface ClassIconsV2 {
  /** Anahtar = v1 adı (skill.icon / passive.icon / logo). */
  ICONS: Record<string, V2SpriteEntry>;
  /** v2 efektlerinin kullandığı ek sprite'lar; efektte `k.v2Sprite(c, 'ad', renk, x, y, boyut)` ile çizilir. */
  SPRITES: Record<string, V2SpriteEntry>;
}
