import { ITEM_ICON_SIZE, itemIconName, paintItemIcon } from '../game/item-icons';
import { itemImageUrl } from '../game/item-icon-files';

/**
 * Item / ödül ikonlarının DOM resmi (Gear ekranı, Spoils kartı, Codex). Tek kaynak: item'in görseli varsa assets/items/<id>.webp
 * (src/game/item-icon-files.ts; tarayıcı kullanılınca indirir), yoksa kod çizimi piksel ikon (src/game/item-icons.ts).
 * Piksel ikon 128x128 data URL'dir; CSS `image-rendering: pixelated` ile ölçeklenir. Görsel `item-art` sınıfı taşır (yumuşak ölçek).
 */
const cache = new Map<string, string>();

export function itemIconUrl(name: string, accent?: string): string {
  const key = `${name}:${accent ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = ITEM_ICON_SIZE;
  canvas.height = ITEM_ICON_SIZE;
  const ctx = canvas.getContext('2d');
  const url = ctx && paintItemIcon(ctx, name, accent) ? canvas.toDataURL('image/png') : '';
  cache.set(key, url);
  return url;
}

/** İkon `<img>` öğesi. */
export function itemIconImg(name: string, accent: string | undefined, cls: string, title?: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = itemIconUrl(name, accent);
  img.alt = title ?? name;
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/** Bir item'in ikon URL'si: görseli > piksel ikon (`icon` alanı > silah ailesi > yuva). */
export function itemDefIconUrl(d: { id?: string; slot: string; family?: string; icon?: string } | undefined | null, slot: string, accent?: string): string {
  return itemImageUrl(d) ?? itemIconUrl(itemIconName(d, slot), accent);
}

/** Bir item'in (ya da boş yuvanın) ikonu: görseli > item'in `icon` alanı > silah ailesi > yuva. */
export function itemDefIcon(d: { id?: string; slot: string; family?: string; icon?: string } | undefined | null, slot: string, accent: string | undefined, cls: string): HTMLImageElement {
  const art = itemImageUrl(d);
  if (!art) return itemIconImg(itemIconName(d, slot), accent, cls);
  const img = itemIconImg(itemIconName(d, slot), accent, `${cls} item-art`, d?.id);
  img.src = art;
  img.decoding = 'async';
  // görsel inemezse piksel ikona dön
  img.addEventListener('error', () => (img.src = itemIconUrl(itemIconName(d, slot), accent)), { once: true });
  return img;
}
