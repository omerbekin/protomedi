/**
 * Geometer - SÜRÜM 2 İKONLARI (boş iskelet; content-designer doldurur). Kılavuz: docs/design/art-v2.md
 *
 * Nasıl: ICONS içine v1'deki AYNI ADLA bir çizim koy; o class v2 seçiliyken oyunda/wiki'de v1 yerine bu görünür. Ad yoksa v1 kalır.
 * Çizim motoru v1 ile aynı (src/game/pixel-art.ts: PxGrid + blade/orb/flame/shieldShape/leafShape/sparkle/crystal), varsayılan
 * 128x128 ince piksel; koordinatlar yine 0..32 mantıksal uzayda (0,25 = 1 ince piksel). Boyut/kontur için { draw, size, logical, outline }.
 * Renk jetonları pixel-art.ts başındaki listede ('a' = skill/class vurgu rengi).
 *
 * Bu class'ın v1 ikon adları (ICONS anahtarları): geometerlogo, testrig, rowsweep, columnspear, blockslam, crossburst
 *
 * SPRITES: v2 efektlerinin (vfx.ts) kullandığı ek çizimler; efektte k.v2Sprite(c, 'ad', renk, x, y, boyut) ile çizilir.
 * Yalnızca bu dosyaya ve aynı klasördeki vfx.ts'e, data/audio-v2/aoe_tester.json'a dokun (başka class'ın dosyasına değil).
 */
import type { V2SpriteEntry } from '../types';
// import { PxGrid, blade, orb, flame, sparkle } from '../../pixel-art';

export const ICONS: Record<string, V2SpriteEntry> = {};

export const SPRITES: Record<string, V2SpriteEntry> = {};
