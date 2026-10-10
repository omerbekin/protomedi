// Altın kayıtları yazar: npx tsx tests/golden/record.ts [grup ...]  (grup yoksa hepsi)
// Çıktı: tests/fixtures/golden/<grup>.json. YALNIZCA bilinçli olarak "yeni doğru" kabul edilen bir değişiklikten sonra çalıştırılır;
// ×2 stat dönüşümünde ÇALIŞTIRILMAZ (dönüşüm bu kayıtlara karşı sınanır).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS } from './harness';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'golden');
mkdirSync(dir, { recursive: true });
const want = process.argv.slice(2);
for (const [name, fn] of Object.entries(GROUPS)) {
  if (want.length && !want.includes(name)) continue;
  const t0 = Date.now();
  const g = fn();
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(g, null, 0).replace(/\],"/g, '],\n"').replace(/\},\{"id"/g, '},\n{"id"'));
  const events = g.battles.reduce((n, b) => n + b.events.length, 0);
  console.log(`${name}: ${g.battles.length} savaş, ${events} olay, ${g.extra?.length ?? 0} ek satır (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
}
