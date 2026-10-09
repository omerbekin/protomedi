/**
 * Defender - SÜRÜM 2 İKONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Kodla çizilmez: Ömer'in hazır 128x128 ikonları (asıllar assets/source/defender-icons, oyundaki kopyalar assets/icons-v2/defender;
 * içe aktarma `node tools/import-v2-icons.mjs assets/source/defender-icons defender tremor-slam=tremor2 taunt=taunt2 guard=guard2
 * fist-crush=fistcrush2 bulwark-aura=aura`). Koyu zeminli, ince koyu çerçeveli resimler; HUD'ın kendi vurgu çerçevesi içinde olduğu gibi durur.
 *
 * v1 ikon adları (ICONS anahtarları): tremor2 (Tremor Slam), taunt2 (Taunt), guard2 (Guard), fistcrush2 (Fist Crush), aura (Bulwark Aura).
 * Class logosu (bulwark) v1'de kalır.
 */
import type { V2SpriteEntry } from '../types';

export const ICONS: Record<string, V2SpriteEntry> = {
  tremor2: { image: 'defender/tremor2' },
  taunt2: { image: 'defender/taunt2' },
  guard2: { image: 'defender/guard2' },
  fistcrush2: { image: 'defender/fistcrush2' },
  aura: { image: 'defender/aura' },
};

export const SPRITES: Record<string, V2SpriteEntry> = {};
