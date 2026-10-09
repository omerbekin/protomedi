/**
 * ITEM İKON GÖRSELLERİ (Ömer 2026-10-10): assets/items/<item-id>.webp (256x256, saydam; ChatGPT sayfalarından `node tools/make-item-icons.mjs`
 * ile kesilir, asıllar assets/source/item-icons oyuna YÜKLENMEZ). Vite derleme sırasında taranır (elle liste yok); yalnızca URL'ler
 * pakete girer, dosyalar kullanılınca (DOM <img>) ya da arka plan yükleme listesiyle (Phaser, src/game/assets.ts) iner.
 *
 * Kural: görseli olan item görseli gösterir; olmayan (ör. çizmeler, Paket 6 gelene kadar) kod çizimi piksel ikona düşer
 * (src/game/item-icons.ts > itemIconName: `icon` alanı > silah ailesi > yuva). Nadirlik parıltısı / çerçeve ekranın işidir.
 * Phaser'sız ve DOM'suz: Codex ve testler de buradan okur.
 */
const files = import.meta.glob('../../assets/items/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** item id -> görsel URL'si. */
export const ITEM_IMAGE_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files)
    .map(([path, url]) => [(path.split('/').pop() ?? '').replace(/\.[^.]+$/, ''), url] as const)
    .sort((a, b) => a[0].localeCompare(b[0])),
);

/** Görseli olan item kimlikleri (sıralı). */
export const ITEM_IMAGE_IDS: readonly string[] = Object.keys(ITEM_IMAGE_FILES);

/** Item'in görsel ikonunun URL'si; görseli yoksa null (çağıran piksel ikona düşer). */
export function itemImageUrl(d: { id?: string } | undefined | null): string | null {
  return (d?.id && ITEM_IMAGE_FILES[d.id]) || null;
}

/** Phaser doku anahtarı. */
export const itemImageKey = (id: string): string => `item-img:${id}`;
