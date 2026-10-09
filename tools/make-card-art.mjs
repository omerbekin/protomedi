// Play ekranı kart görselleri (Ömer 2026-10-10): assets/source/cards/*.webp asıllarından (1024x1536) oyunun yüklediği küçültülmüş
// sürümleri üretir: assets/cards/<ad>.webp, 768x1152 webp (kart 1080p'de 460 px genişlikte: 768 px ~1,7x; 3440x1440'ta kart ~613 px,
// 4K'da ~920 px: hafif büyütülür ama görüntü yumuşak kalır). Yeniden üretmek için: node tools/make-card-art.mjs
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/cards';
const OUT = 'assets/cards';
const WIDTH = 768;

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC)) {
  if (!/\.(webp|png|jpe?g)$/i.test(f)) continue;
  const name = f.replace(/\.[^.]+$/, '');
  const info = await sharp(join(SRC, f)).resize({ width: WIDTH }).webp({ quality: 84, effort: 6 }).toFile(join(OUT, `${name}.webp`));
  console.log(`${name}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
