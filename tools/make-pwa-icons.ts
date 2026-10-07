/**
 * Web app manifest ikonlarını üretir: piksel art motorunun 'helm' ikonu koyu zeminde, en yakın komşu büyütmeyle.
 * Çalıştır: npx tsx tools/make-pwa-icons.ts   (çıktı: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { GRID, INTERNAL_TOKEN_VALUES, shadeColor, spriteCells } from '../src/game/pixel-art';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
function png(size: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** inset: ikonun kenarlardan bırakılan pay (maskable için daha büyük: güvenli bölge). */
function render(size: number, inset: number): Buffer {
  const cells = spriteCells('helm')!;
  const pal = INTERNAL_TOKEN_VALUES('#ffd23f');
  const bg = [0x14, 0x10, 0x1c];
  const rgb = new Uint8Array(size * size * 3);
  const inner = size - inset * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let col = bg;
      const ix = x - inset;
      const iy = y - inset;
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        const c = cells[Math.floor((iy * GRID) / inner)]![Math.floor((ix * GRID) / inner)]!;
        if (c.t !== '.' && pal[c.t] !== undefined) {
          const v = shadeColor(pal[c.t]!, c.s);
          col = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        }
      }
      rgb.set(col, (y * size + x) * 3);
    }
  }
  return png(size, rgb);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 16));
writeFileSync('public/icons/icon-512.png', render(512, 40));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 100));
console.log('icons written');
