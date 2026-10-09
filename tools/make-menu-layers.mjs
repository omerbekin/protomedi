// Ana menü katmanlı arka planı (Ömer 2026-10-10): assets/source/menu-layers/*.png asıllarından oyunun yüklediği webp sürümlerini
// üretir: assets/menu/sky.webp (opak), far / middle / foreground.webp (saydam), fx.webp (efekt sayfası 4x2 hücre, 256 px).
// Katmanlar 2580x1080 (21.5:9 mantıksal genişlik) kalır: sahne tam genişlikte, piksel art keskin. Yeniden üretmek için:
//   node tools/make-menu-layers.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/menu-layers';
const OUT = 'assets/menu';
const JOBS = [
  { src: '01-sky.png', out: 'sky.webp', opts: { quality: 80, effort: 6 } },
  { src: '02-far.png', out: 'far.webp', opts: { quality: 82, alphaQuality: 90, effort: 6 } },
  { src: '03-middle.png', out: 'middle.webp', opts: { quality: 82, alphaQuality: 90, effort: 6 } },
  { src: '04-foreground.png', out: 'foreground.webp', opts: { quality: 82, alphaQuality: 90, effort: 6 } },
  { src: '05-effects-sheet.png', out: 'fx.webp', opts: { quality: 88, alphaQuality: 100, effort: 6 } },
];

mkdirSync(OUT, { recursive: true });
for (const j of JOBS) {
  let img = sharp(join(SRC, j.src));
  if (j.out === 'sky.webp') img = img.removeAlpha();
  const info = await img.webp(j.opts).toFile(join(OUT, j.out));
  console.log(`${j.out} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
