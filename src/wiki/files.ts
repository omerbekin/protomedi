import type { WikiFiles } from './catalog';

/**
 * Wiki'nin görsel dosyaları: Vite derleme sırasında assets/ klasörünü tarar (elle liste yok). Yeni sprite/avatar dosyası
 * konunca wiki kendiliğinden görür (gallery/files.ts ile aynı URL'ler).
 */
const glob = (m: Record<string, unknown>): Record<string, string> => m as Record<string, string>;

export const wikiFiles: WikiFiles = {
  sprites: glob(import.meta.glob('../../assets/sprites/*/*.png', { eager: true, query: '?url', import: 'default' })),
  avatars: glob(import.meta.glob('../../assets/avatars/*.png', { eager: true, query: '?url', import: 'default' })),
};
