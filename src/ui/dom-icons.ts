import { INTERNAL_TOKEN_VALUES, shadeColor } from '../game/pixel-art';
import { resolveSprite, statusBadge } from '../game/art-registry';
import { onVersionsChange, ownerOfLogo } from '../game/asset-versions';
import { smoothUrl } from '../game/icon-image-files';

/**
 * Arayüz (DOM) için ikon: piksel art motorunun çizimini bir resme (data URL) çevirir; CSS'te `image-rendering: pixelated` ile gösterilir.
 * Sürüm farkında: `owner` (class id / 'shared') verilirse o sahibin seçili sürümü (v1 64x64, v2 varsayılan 128x128); `v2:<sahip>:<ad>`
 * adı doğrudan v2 çizimidir. Resim boyutu çizim boyutudur; CSS ölçüsü değişmez (yüksek çözünürlük yalnızca daha ince piksel demektir).
 */
const cache = new Map<string, string>();

export function iconUrl(name: string, accent = '#ffffff', owner?: string | null): string {
  const art = resolveSprite(name, owner);
  if (art.image) return art.smooth ? smoothUrl(art.domImage ?? art.image) : art.image; // hazır PNG: doğrudan dosya (piksel v2 ikonu pixelated, boyalı stat ikonu #smooth)
  const key = `${art.key}:${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cells = art.cells();
  const canvas = document.createElement('canvas');
  canvas.width = art.size;
  canvas.height = art.size;
  const ctx = canvas.getContext('2d');
  if (!cells || !ctx) return '';
  const pal = INTERNAL_TOKEN_VALUES(accent);
  cells.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c.t === '.') return;
      const v = pal[c.t];
      ctx.fillStyle = v === undefined ? '#ff00ff' : `#${shadeColor(v, c.s).toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/**
 * SÜRÜME CANLI BAĞLI DOM ikonu: resmi çizer ve adını/rengini/sahibini öğeye yazar; debug > Versions'ta seçim değişince belgedeki tüm bağlı
 * ikonlar (wiki, debug, ayar panelleri) sayfa yenilemeden yeni sürümle yeniden çizilir. `owner` verilmezse ad bir class logosuysa onun
 * sahibi kullanılır (logolar her yerde seçili sürümle görünsün); diğer çıplak adlar v1 kalır.
 */
export function bindIcon<T extends HTMLImageElement>(img: T, name: string, accent = '#ffffff', owner?: string | null): T {
  const o = owner === undefined ? ownerOfLogo(name) : owner;
  img.dataset['vIcon'] = name;
  img.dataset['vAccent'] = accent;
  if (o) img.dataset['vOwner'] = o;
  else delete img.dataset['vOwner'];
  img.src = iconUrl(name, accent, o);
  return img;
}

/** Durum rozeti (canlı): sınıfa özgü durumda sahibinin v2 `badge_<id>` çizimi, yoksa Shared (art-registry > statusBadge). */
export function bindStatusIcon<T extends HTMLImageElement>(img: T, statusId: string, icon: string, accent = '#ffffff'): T {
  img.dataset['vStatus'] = statusId;
  img.dataset['vStatusIcon'] = icon;
  const b = statusBadge(statusId, icon);
  return bindIcon(img, b.name, accent, b.owner);
}

/** Belgedeki sürüme bağlı tüm ikonları yeniden çizer (seçim değişince otomatik). */
export function refreshBoundIcons(root: ParentNode | null = typeof document !== 'undefined' ? document : null): void {
  if (!root) return;
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-v-icon]')) {
    if (img.dataset['vStatus']) {
      const b = statusBadge(img.dataset['vStatus'], img.dataset['vStatusIcon'] ?? '');
      img.dataset['vIcon'] = b.name;
      img.dataset['vOwner'] = b.owner;
    }
    const name = img.dataset['vIcon']!;
    const url = iconUrl(name, img.dataset['vAccent'] ?? '#ffffff', img.dataset['vOwner'] ?? null);
    if (url && img.src !== url) img.src = url;
  }
}

if (typeof document !== 'undefined') onVersionsChange(() => refreshBoundIcons());

/** Arayüzde kullanılan ikonlar (debug dock, ayarlar): her biri kullanılıyor olmalı (test). */
export const UI_ICONS = ['flask', 'team', 'dice', 'robot', 'gear', 'fullscreen', 'exitfullscreen', 'speaker', 'next', 'freemp', 'pause', 'ffwd', 'restart', 'eye', 'swap', 'info', 'frame', 'book', 'clipboard'] as const;
