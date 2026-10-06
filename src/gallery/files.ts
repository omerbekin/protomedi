import type { AssetFiles } from './catalog';

/**
 * Galerinin görsel dosyaları: Vite derleme sırasında assets/ klasörünü tarar (elle liste yok). Yeni sprite/avatar dosyası
 * konunca galeri kendiliğinden görür. Aynı dosyalar oyunun src/game/assets.ts taramasıyla aynı URL'leri üretir.
 */
const glob = (m: Record<string, unknown>): Record<string, string> => m as Record<string, string>;

export const assetFiles: AssetFiles = {
  sprites: glob(import.meta.glob('../../assets/sprites/*/*.png', { eager: true, query: '?url', import: 'default' })),
  avatars: glob(import.meta.glob('../../assets/avatars/*.png', { eager: true, query: '?url', import: 'default' })),
  spritesOld: glob(import.meta.glob('../../assets/sprites_old/*/*.png', { eager: true, query: '?url', import: 'default' })),
};
