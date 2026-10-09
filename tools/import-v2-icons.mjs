#!/usr/bin/env node
/**
 * GÖRSEL v2 İKON İÇE AKTARICI: Ömer'in hazır ikon dosyalarını (assets/source/<sahip>-icons/*.png, asıl/kaynak; oyuna yüklenmez)
 * oyunun görsel ikon klasörüne yazar: assets/icons-v2/<sahip>/<v1 ikon adı>.png (ad = skill.icon / passive.icon).
 * Pikseller AYNEN korunur (büyütme/küçültme/kırpma yok; yalnızca PNG yeniden yazılır, meta veri atılır). Kare olmayan ya da 128'den
 * farklı boyutlu dosyada uyarır. `src/game/art-v2/<sahip>/icons.ts` dosyasında `{ image: '<sahip>/<ad>' }` girdisiyle bağlanır.
 *
 * Kullanım:
 *   node tools/import-v2-icons.mjs <kaynak klasör> <sahip> <dosya=ad> [<dosya=ad> ...]
 *   node tools/import-v2-icons.mjs assets/source/defender-icons defender tremor-slam=tremor2 taunt=taunt2 guard=guard2 fist-crush=fistcrush2 bulwark-aura=aura
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [srcDir, owner, ...pairs] = process.argv.slice(2);
if (!srcDir || !owner || !pairs.length) {
  console.error('kullanım: node tools/import-v2-icons.mjs <kaynak klasör> <sahip> <dosya=ad> ...');
  process.exit(1);
}
const outDir = join('assets', 'icons-v2', owner);
mkdirSync(outDir, { recursive: true });
for (const pair of pairs) {
  const [file, name] = pair.split('=');
  if (!file || !name) throw new Error(`geçersiz eşleşme: ${pair}`);
  const src = join(srcDir, file.endsWith('.png') ? file : `${file}.png`);
  const meta = await sharp(src).metadata();
  if (meta.width !== meta.height || meta.width !== 128) console.warn(`uyarı: ${src} ${meta.width}x${meta.height} (beklenen 128x128)`);
  const out = join(outDir, `${name}.png`);
  await sharp(src).png({ compressionLevel: 9 }).toFile(out);
  console.log(`${src} -> ${out} (${meta.width}x${meta.height})`);
}
