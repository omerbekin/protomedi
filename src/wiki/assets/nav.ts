/**
 * Wiki sol menüsündeki Assets / Legacy bölümlerinin kimlik, başlık ve ikonları (saf veri: testlenebilir). Sıra = menü sırası.
 * `?wiki=<id>` derin bağlantısı ve debug menüsündeki 'Open assets (wiki)' bu kimlikleri kullanır.
 */
export const ASSET_NAV = [
  { id: 'assets', title: 'ASSETS', icon: 'frame', sub: false },
  { id: 'sounds', title: 'SOUNDS', icon: 'speaker', sub: true },
  { id: 'animations', title: 'ANIMATIONS', icon: 'wand', sub: true },
  { id: 'icons', title: 'ICONS', icon: 'frame', sub: true },
  { id: 'art', title: 'CHARACTER ART', icon: 'helm', sub: true },
  { id: 'palette', title: 'PALETTE & UI', icon: 'drop', sub: true },
  { id: 'versions', title: 'VERSIONS', icon: 'swap', sub: true },
  { id: 'legacy', title: 'LEGACY', icon: 'skull', sub: true },
] as const;

export type AssetSectionId = (typeof ASSET_NAV)[number]['id'];

const META = new Map<string, (typeof ASSET_NAV)[number]>(ASSET_NAV.map((n) => [n.id, n]));
export const assetNav = (id: AssetSectionId): (typeof ASSET_NAV)[number] => META.get(id)!;

/** `?wiki=` için eş anlamlılar. */
export const WIKI_ALIASES: Record<string, string> = { gallery: 'assets', characters: 'art', 'character-art': 'art', ui: 'palette' };
