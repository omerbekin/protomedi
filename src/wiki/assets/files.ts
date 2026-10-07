import { assetFiles } from '../../gallery/files';
import type { LegacyFiles } from './legacy-catalog';

/**
 * Wiki > Assets / Legacy görsel dosyaları: Vite derleme sırasında assets/ klasörünü tarar (elle liste yok). Yeni dosya konunca
 * kendiliğinden görünür. sprites/avatars/sprites_old gallery/files.ts'ten gelir; concepts ve characters-pool burada.
 */
const glob = (m: Record<string, unknown>): Record<string, string> => m as Record<string, string>;

export const legacyFiles: LegacyFiles = {
  ...assetFiles,
  concepts: glob(import.meta.glob('../../../assets/concepts/*/*.png', { eager: true, query: '?url', import: 'default' })),
  pool: glob(import.meta.glob('../../../assets/characters-pool/*.png', { eager: true, query: '?url', import: 'default' })),
};
