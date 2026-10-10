// Arayüz ikonları (Ömer 2026-10-10): assets/source/ui-icons/ui-sheet.png (ChatGPT, gerçek saydamlık, 4x4 ızgara, satır satır) kesilir ve her
// arayüz kavramı için kare ikon yazılır (make-stat-icons.mjs ile aynı yöntem):
//   assets/ui-icons/<ad>.png        128x128 (DOM: Gear, Endless, Codex, savaş HUD'ı; tarayıcı küçültür)
//   assets/ui-icons/small/<ad>.png   64x64  (Phaser dokusu; önceden lanczos ile küçültülmüş)
// Oyunda tek giriş: `uiIconName(ad)` (src/ui/ui-icons.ts) -> art-registry 'ui:<ad>'; dosya yoksa kodla çizilen yedek.
//
// Izgara KUSURSUZ varsayılmaz: hücre sınırları alfa izdüşümünden ölçülür (beklenen sınırın ±%12'sinde en boş sütun / satır), sonra her
// hücrede alfası eşiği geçen piksellerin sınır kutusu bulunur. Kutu kare tuvale eşit kenar payıyla ortalanır ve lanczos3 ile küçültülür.
//
// Yeniden üretmek için: node tools/make-ui-icons.mjs   (--debug = hücre ve kutu raporu)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/ui-icons/ui-sheet.png';
const OUT = 'assets/ui-icons';
const SIZES = [
  { dir: OUT, size: 128 },
  { dir: join(OUT, 'small'), size: 64 },
];
/** Kenar payı (kenar uzunluğunun oranı, her yanda). */
const MARGIN = 0.05;
/** Bu alfanın üstü "dolu" sayılır (yumuşak kenar gölgesi kutuyu şişirmesin). */
const ALPHA = 40;
const DEBUG = process.argv.includes('--debug');

/** Satır satır 4x4 (adlar src/ui/ui-icons.ts > UiIconKind ile aynı). */
const GRID = [
  ['rest', 'skip', 'move', 'cooldown'],
  ['rage', 'luckyEscape', 'passive', 'combatLog'],
  ['gold', 'bag', 'gear', 'formation'],
  ['codex', 'settings', 'fullscreen', 'menu'],
];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const ch = info.channels;
const alpha = (x, y) => data[(y * W + x) * ch + 3];

/** Alfa izdüşümü: sütun (axis 'x'; yalnızca y0..y1 satır bandında) ya da satır başına dolu piksel sayısı. */
function profile(axis, y0 = 0, y1 = H) {
  const n = axis === 'x' ? W : H;
  const out = new Float64Array(n);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (alpha(x, y) > ALPHA) out[axis === 'x' ? x : y]++;
  return out;
}

/** Beklenen k/4 sınırının çevresindeki en boş şeridin ORTASI (en uzun boş şerit; eşitlikte beklenene en yakın): kesim komşu ikonun kenarını kırpmasın. */
function cuts(prof, n) {
  const res = [0];
  for (let k = 1; k < 4; k++) {
    const want = (n * k) / 4;
    const win = Math.round(n * 0.12);
    const lo = Math.round(want - win);
    const hi = Math.round(want + win);
    let min = Infinity;
    for (let i = lo; i <= hi; i++) min = Math.min(min, prof[i]);
    let best = null;
    for (let i = lo; i <= hi; i++) {
      if (prof[i] !== min) continue;
      let j = i;
      while (j + 1 <= hi && prof[j + 1] === min) j++;
      const run = { mid: Math.round((i + j) / 2), len: j - i + 1 };
      if (!best || run.len > best.len || (run.len === best.len && Math.abs(run.mid - want) < Math.abs(best.mid - want))) best = run;
      i = j;
    }
    res.push(best.mid);
  }
  res.push(n);
  return res;
}

const cy = cuts(profile('y'), H);
// sütun kesimleri SATIR BANDI başına (ikonlar satırdan satıra farklı genişlikte; tüm sayfa izdüşümü bir satırın ikonunu kırpabilir)
const cxs = [0, 1, 2, 3].map((r) => cuts(profile('x', cy[r], cy[r + 1]), W));
if (DEBUG) console.log('row cuts', cy.join(' '), '| column cuts per row', cxs.map((c) => c.join(' ')).join(' / '));

/**
 * Hücre içinde dolu piksellerin kutusu; en az 2 dolu pikseli olan satır/sütunlar sayılır. Bu sayfada komşu ikonun kenarı hücre sınırına
 * taşabiliyor (Rest'in battaniyesi Skip hücresine): hücre KENARINA değen, ana gövdeden boşlukla ayrılmış küçük parça (toplam kütlenin %3'ü
 * altı) atılır. Gövdenin içindeki ayrık parçalar (Lucky Escape kıvılcımları) kenara değmedikçe kalır.
 */
function bbox(x0, y0, x1, y1) {
  const cols = new Int32Array(x1 - x0);
  const rows = new Int32Array(y1 - y0);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (alpha(x, y) > ALPHA) {
        cols[x - x0]++;
        rows[y - y0]++;
      }
  const span = (a) => {
    const runs = [];
    let cur = null;
    a.forEach((v, i) => {
      if (v >= 2) {
        if (!cur) runs.push((cur = { s: i, e: i, m: 0 }));
        cur.e = i;
        cur.m += v;
      } else cur = null;
    });
    const total = runs.reduce((t, r) => t + r.m, 0);
    const keep = runs.filter((r) => !((r.s === 0 || r.e === a.length - 1) && r.m < total * 0.03));
    return keep.length ? [keep[0].s, keep[keep.length - 1].e] : null;
  };
  const cx = span(cols);
  const cy = span(rows);
  if (!cx || !cy) return null;
  return { left: x0 + cx[0], top: y0 + cy[0], right: x0 + cx[1] + 1, bottom: y0 + cy[1] + 1 };
}

for (const { dir } of SIZES) mkdirSync(dir, { recursive: true });

for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++) {
    const name = GRID[r][c];
    const cx = cxs[r];
    const b = bbox(cx[c], cy[r], cx[c + 1], cy[r + 1]);
    if (!b) throw new Error(`${name}: hücre boş`);
    const w = b.right - b.left;
    const h = b.bottom - b.top;
    const side = Math.ceil(Math.max(w, h) / (1 - 2 * MARGIN));
    // kare tuval: kutu ortada, eşit kenar payı (sayfanın dışına taşan kısım saydam)
    const crop = await sharp(SRC)
      .ensureAlpha()
      .extract({ left: b.left, top: b.top, width: w, height: h })
      .extend({
        top: Math.floor((side - h) / 2),
        bottom: Math.ceil((side - h) / 2),
        left: Math.floor((side - w) / 2),
        right: Math.ceil((side - w) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    for (const { dir, size } of SIZES) {
      await sharp(crop).resize(size, size, { kernel: sharp.kernel.lanczos3, fit: 'fill' }).png({ compressionLevel: 9 }).toFile(join(dir, `${name}.png`));
    }
    if (DEBUG) console.log(`${name.padEnd(11)} cell ${cx[c]},${cy[r]}-${cx[c + 1]},${cy[r + 1]}  box ${b.left},${b.top} ${w}x${h}  side ${side}`);
  }
console.log(`16 UI icons -> ${OUT}/<name>.png (128) + ${OUT}/small/<name>.png (64)`);
