import { ITEM_ICON_SIZE, itemIconName, paintItemIcon } from '../game/item-icons';

/**
 * Item / ödül ikonlarının DOM resmi (Gear ekranı, Spoils kartı, Codex). Çizim tek kaynaktan: src/game/item-icons.ts.
 * Resim 128x128 data URL'dir; CSS `image-rendering: pixelated` ile ölçeklenir.
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

/** Bir item'in (ya da boş yuvanın) ikonu: item'in `icon` alanı > silah ailesi > yuva. */
export function itemDefIcon(d: { slot: string; family?: string; icon?: string } | undefined | null, slot: string, accent: string | undefined, cls: string): HTMLImageElement {
  return itemIconImg(itemIconName(d, slot), accent, cls);
}
