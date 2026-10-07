import { INTERNAL_TOKEN_VALUES, shadeColor } from '../game/pixel-art';
import { resolveSprite } from '../game/art-registry';

/**
 * Arayüz (DOM) için ikon: piksel art motorunun çizimini bir resme (data URL) çevirir; CSS'te `image-rendering: pixelated` ile gösterilir.
 * Sürüm farkında: `owner` (class id / 'shared') verilirse o sahibin seçili sürümü (v1 64x64, v2 varsayılan 128x128); `v2:<sahip>:<ad>`
 * adı doğrudan v2 çizimidir. Resim boyutu çizim boyutudur; CSS ölçüsü değişmez (yüksek çözünürlük yalnızca daha ince piksel demektir).
 */
const cache = new Map<string, string>();

export function iconUrl(name: string, accent = '#ffffff', owner?: string | null): string {
  const art = resolveSprite(name, owner);
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

/** Arayüzde kullanılan ikonlar (debug dock, ayarlar): her biri kullanılıyor olmalı (test). */
export const UI_ICONS = ['flask', 'team', 'dice', 'robot', 'gear', 'fullscreen', 'exitfullscreen', 'speaker', 'next', 'freemp', 'pause', 'ffwd', 'restart', 'eye', 'swap', 'info', 'frame', 'book', 'clipboard'] as const;
