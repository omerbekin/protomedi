import type Phaser from 'phaser';

/** Sefer haritası görselleri: assets/campaign/<id>.(webp|png|jpg). Dosya yoksa harita kodla çizilmiş parşömen zemine düşer. */
const files = import.meta.glob('../../assets/campaign/*.{webp,png,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const campaignArtKey = (id: string): string => `campaign:${id}`;

/** `only`: yalnızca bu görseller (ana menü yalnızca Campaign kartının görselini ister); verilmezse hepsi. */
export function preloadCampaignArt(scene: Phaser.Scene, only?: string[]): void {
  for (const [path, url] of Object.entries(files)) {
    const id = (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    if (only && !only.includes(id)) continue;
    if (!scene.textures.exists(campaignArtKey(id))) scene.load.image(campaignArtKey(id), url);
  }
}

export const hasCampaignArt = (scene: Phaser.Scene, id: string): boolean => scene.textures.exists(campaignArtKey(id));
