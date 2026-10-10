// Stat ikonları (Ömer 2026-10-10): assets/source/stat-icons/stat-sheet.png (ChatGPT, gerçek saydamlık, 4x4 ızgara, satır satır) kesilir ve her
// stat için kare ikon yazılır:
//   assets/stat-icons/<stat>.png        128x128 (DOM: Gear, Codex, savaş HUD'ı; tarayıcı küçültür)
//   assets/stat-icons/small/<stat>.png   64x64  (Phaser dokusu: 20-40 px gösterimde ince ayrıntı ezilmesin diye önceden lanczos ile küçültülmüş)
//
// Izgara KUSURSUZ varsayılmaz: hücre sınırları alfa izdüşümünden ölçülür (beklenen sınırın ±%12'sinde en boş sütun / satır), sonra her
// hücrede alfası eşiği geçen piksellerin sınır kutusu bulunur (tek tük kırıntı sayılmaz). Kutu kare tuvale eşit kenar payıyla ortalanır ve
// lanczos3 ile küçültülür (boyalı ikonlar; nearest DEĞİL).
//
// Yeniden üretmek için: node tools/make-stat-icons.mjs   (--debug = hücre ve kutu raporu)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/stat-icons/stat-sheet.png';
const OUT = 'assets/stat-icons';
const SIZES = [
  { dir: OUT, size: 128 },
  { dir: join(OUT, 'small'), size: 64 },
];
/** Kenar payı (kenar uzunluğunun oranı, her yanda). */
const MARGIN = 0.05;
/** Bu alfanın üstü "dolu" sayılır (yumuşak kenar gölgesi kutuyu şişirmesin). */
const ALPHA = 40;
const DEBUG = process.argv.includes('--debug');

/** Satır satır 4x4 (src/engine StatKind adları + might). */
const GRID = [
  ['hp', 'mp', 'str', 'int'],
  ['dex', 'luck', 'spd', 'might'],
  ['critChance', 'critMult', 'accuracy', 'evasion'],
  ['armor', 'magicArmor', 'hpRegen', 'mpRegen'],
];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const ch = info.channels;
const alpha = (x, y) => data[(y * W + x) * ch + 3];

/** Alfa izdüşümü: sütun (axis 'x') ya da satır başına dolu piksel sayısı. */
function profile(axis) {
  const n = axis === 'x' ? W : H;
  const out = new Float64Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha(x, y) > ALPHA) out[axis === 'x' ? x : y]++;
  return out;
}

/** Beklenen k/4 sınırının çevresinde en boş çizgi (eşitlikte beklenene en yakın). */
function cuts(prof, n) {
  const res = [0];
  for (let k = 1; k < 4; k++) {
    const want = (n * k) / 4;
    const win = Math.round(n * 0.12);
    let best = Math.round(want);
    for (let i = Math.round(want - win); i <= Math.round(want + win); i++) {
      if (prof[i] < prof[best] || (prof[i] === prof[best] && Math.abs(i - want) < Math.abs(best - want))) best = i;
    }
    res.push(best);
  }
  res.push(n);
  return res;
}

const cx = cuts(profile('x'), W);
const cy = cuts(profile('y'), H);
if (DEBUG) console.log('column cuts', cx.join(' '), '| row cuts', cy.join(' '));

/** Hücre içinde dolu piksellerin kutusu; en az 2 dolu pikseli olan satır/sütunlar sayılır (tek kırıntı kutuyu büyütmesin). */
function bbox(x0, y0, x1, y1) {
  const cols = new Int32Array(x1 - x0);
  const rows = new Int32Array(y1 - y0);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (alpha(x, y) > ALPHA) {
        cols[x - x0]++;
        rows[y - y0]++;
      }
  const first = (a) => a.findIndex((v) => v >= 2);
  const last = (a) => a.length - 1 - [...a].reverse().findIndex((v) => v >= 2);
  const l = first(cols);
  const t = first(rows);
  if (l < 0 || t < 0) return null;
  return { left: x0 + l, top: y0 + t, right: x0 + last(cols) + 1, bottom: y0 + last(rows) + 1 };
}

for (const { dir } of SIZES) mkdirSync(dir, { recursive: true });

for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++) {
    const stat = GRID[r][c];
    const b = bbox(cx[c], cy[r], cx[c + 1], cy[r + 1]);
    if (!b) throw new Error(`${stat}: hücre boş`);
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
      await sharp(crop).resize(size, size, { kernel: sharp.kernel.lanczos3, fit: 'fill' }).png({ compressionLevel: 9 }).toFile(join(dir, `${stat}.png`));
    }
    if (DEBUG) console.log(`${stat.padEnd(11)} cell ${cx[c]},${cy[r]}-${cx[c + 1]},${cy[r + 1]}  box ${b.left},${b.top} ${w}x${h}  side ${side}`);
  }
console.log(`16 stat icons -> ${OUT}/<stat>.png (128) + ${OUT}/small/<stat>.png (64)`);
