// Cloudflare'e yüklenecek oyun dosyalarını (../dist) ücretsiz plan sınırlarına göre denetler. İnternete çıkmaz, hesap gerekmez.
// Sınırlar (Workers Static Assets, ücretsiz plan): sürüm başına en çok 20.000 dosya, dosya başına en çok 25 MiB.
// Ayrıca kaynak klasörlerin (assets/source, voice-candidates, _import_new) yanlışlıkla dist'e girmediğini doğrular.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const MAX_FILES = 20000;
const MAX_BYTES = 25 * 1024 * 1024;
const FORBIDDEN = /(^|\/)(source|voice-candidates|_import_new|sprites_old|concepts)(\/|$)/i;

if (!existsSync(dist)) {
  console.error('dist yok: önce oyun klasöründe `npm run build` çalıştır.');
  process.exit(1);
}
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push({ path: relative(dist, p).split('\\').join('/'), size: statSync(p).size });
  }
};
walk(dist);
const errors = [];
if (files.length > MAX_FILES) errors.push(`${files.length} dosya (sınır ${MAX_FILES})`);
for (const f of files) {
  if (f.size > MAX_BYTES) errors.push(`${f.path}: ${(f.size / 1048576).toFixed(1)} MiB (sınır 25 MiB)`);
  if (FORBIDDEN.test(f.path)) errors.push(`${f.path}: kaynak klasör dist'e girmiş`);
}
const total = files.reduce((s, f) => s + f.size, 0);
const biggest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);
console.log(`dist: ${files.length} dosya, toplam ${(total / 1048576).toFixed(1)} MiB; en büyükler: ${biggest.map((f) => `${f.path} ${(f.size / 1048576).toFixed(2)} MiB`).join(', ')}`);
if (errors.length) {
  console.error('YÜKLENEMEZ:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('OK: ücretsiz plan dosya sınırları içinde.');
