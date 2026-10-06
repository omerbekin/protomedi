import { GRID, INTERNAL_TOKEN_VALUES, shadeColor, spriteCells } from '../game/pixel-art';

/** Arayüz (DOM) için ikon: piksel art motorunun çizimini 64x64 bir resme (data URL) çevirir; CSS'te `image-rendering: pixelated` ile gösterilir. */
const cache = new Map<string, string>();

export function iconUrl(name: string, accent = '#ffffff'): string {
  const key = `${name}:${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cells = spriteCells(name);
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
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
export const UI_ICONS = ['flask', 'team', 'dice', 'robot', 'gear', 'speaker', 'next', 'freemp', 'pause', 'ffwd'] as const;
