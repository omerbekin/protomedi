// Karakter sayfasını (assets/source/character-sheet.webp, 12 karakter, saydam arka plan) tek tek PNG'lere ayırır.
// Çıktı: assets/characters-pool/<isim>.png. Kullanım (proje kökünde): npm i --no-save sharp && node tools/slice-characters.mjs
// Karakterler birbirine değdiği için her karakter için elle seçilmiş başlangıç noktalarından yayılma yapılır (seeds).
// Sayfa değişirse seeds koordinatlarını (sayfa pikseli) güncelle.
import sharp from 'sharp';
const { data, info } = await sharp('assets/source/character-sheet.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const A = (p) => data[p * 4 + 3];
const THR = 24;
// 1) Bağlı parçalar (yalnızca belirgin pikseller)
const comp = new Int32Array(N).fill(0); let nComp = 0; const sizes = [0];
for (let s = 0; s < N; s++) {
  if (A(s) <= THR || comp[s]) continue;
  const id = ++nComp; sizes.push(0); const stack = [s]; comp[s] = id;
  while (stack.length) { const p = stack.pop(); sizes[id]++; const x = p % W, y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (A(q) > THR && !comp[q]) { comp[q] = id; stack.push(q); } } }
}
// 2) Karakter başına başlangıç noktaları (yaklaşık; en yakın dolu piksele oturtulur)
const seeds = {
  wolf: [[120, 150]], frog: [[680, 250]], rabbit: [[855, 220]], dog: [[1030, 200]], giraffe: [[100, 520]], rhino: [[300, 520]], goat: [[1030, 540]],
  bear: [[320, 230], [325, 60], [262, 30], [360, 92], [300, 330], [372, 330], [285, 375], [355, 375], [250, 200]],
  boar: [[500, 240], [490, 70], [470, 25], [440, 290], [418, 335], [470, 330], [550, 330], [465, 368], [552, 368], [560, 70]],
  deer: [[500, 540], [480, 440], [480, 385], [560, 520], [440, 640], [480, 735], [545, 735], [415, 560], [452, 410], [430, 398]],
  cow: [[660, 520], [640, 430], [750, 585], [640, 700], [690, 735], [610, 735]],
  sheep: [[840, 540], [830, 420], [912, 500], [810, 720], [860, 725], [790, 520], [790, 582], [802, 550]],
};
const names = Object.keys(seeds);
function snap([sx, sy]) { for (let r = 0; r < 80; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; if (A(y * W + x) > 200) return y * W + x; } throw new Error('seed ' + sx + ',' + sy); }
const owner = new Int16Array(N).fill(-1);
let frontier = [];
names.forEach((n, i) => seeds[n].forEach((pt) => { const p = snap(pt); if (owner[p] === -1) { owner[p] = i; frontier.push(p); } }));
// 3) Çok kaynaklı yayılma: yalnızca aynı bağlı parça içinde
while (frontier.length) { const next = [];
  for (const p of frontier) { const x = p % W, y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx;
      if (owner[q] === -1 && A(q) > THR && comp[q] === comp[p]) { owner[q] = owner[p]; next.push(q); } } }
  frontier = next; }
// 4) Sahipsiz küçük parçalar (ör. ayrık patiler, kılıç uçları): en yakın sahipli piksele ait say
const orphanComps = new Set(); for (let p = 0; p < N; p++) if (A(p) > THR && owner[p] === -1) orphanComps.add(comp[p]);
const assignedPixels = []; for (let p = 0; p < N; p++) if (owner[p] !== -1) assignedPixels.push(p);
const grid = new Map(); const CELL = 16; for (const p of assignedPixels) { const k = ((p % W) / CELL | 0) + ',' + (((p / W) | 0) / CELL | 0); (grid.get(k) ?? grid.set(k, []).get(k)).push(p); }
const report = [];
for (const id of orphanComps) {
  const pix = []; for (let p = 0; p < N; p++) if (comp[p] === id) pix.push(p);
  // parçanın merkezine en yakın sahipli piksel
  const cx = pix.reduce((s, p) => s + (p % W), 0) / pix.length, cy = pix.reduce((s, p) => s + ((p / W) | 0), 0) / pix.length;
  let best = -1, bd = Infinity; const gx = cx / CELL | 0, gy = cy / CELL | 0;
  for (let r = 1; r < 12 && best === -1; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const arr = grid.get((gx + dx) + ',' + (gy + dy)); if (!arr) continue; for (const q of arr) { const d = (q % W - cx) ** 2 + (((q / W) | 0) - cy) ** 2; if (d < bd) { bd = d; best = owner[q]; } } }
  report.push(`orphan comp ${id} n=${pix.length} at (${cx | 0},${cy | 0}) -> ${names[best]} (dist ${Math.sqrt(bd) | 0})`);
  if (pix.length > 150) for (const p of pix) owner[p] = best; // çok küçük artıkları at
}
// 5) Silik kenarlar: en yakın sahipli piksele (2 piksel içinde) kat
for (let pass = 0; pass < 2; pass++) { const add = [];
  for (let p = 0; p < N; p++) if (owner[p] === -1 && A(p) > 0) { const x = p % W, y = (p / W) | 0; let o = -1;
    for (let dy = -1; dy <= 1 && o === -1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (owner[q] !== -1) { o = owner[q]; break; } }
    if (o !== -1) add.push([p, o]); }
  for (const [p, o] of add) owner[p] = o; }
for (let i = 0; i < names.length; i++) {
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let p = 0; p < N; p++) if (owner[p] === i) { const x = p % W, y = (p / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const w = maxX - minX + 1, h = maxY - minY + 1; const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (y + minY) * W + (x + minX); if (owner[p] !== i) continue; const o = (y * w + x) * 4; out[o] = data[p * 4]; out[o + 1] = data[p * 4 + 1]; out[o + 2] = data[p * 4 + 2]; out[o + 3] = data[p * 4 + 3]; }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(`assets/characters-pool/${names[i]}.png`);
  report.push(`${names[i].padEnd(8)} ${w}x${h}`);
}
console.log('components', nComp); console.log(report.join('\n'));
