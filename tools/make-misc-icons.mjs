// Boyalı oyun ikonları (Ömer 2026-10-10, 60 ikon; skill ikonları HARİÇ): assets/source/misc-icons/ altındaki üç ChatGPT sayfası (1536x1024,
// 5 sütun x 4 satır, satır satır) kesilir ve her ikon için kare PNG yazılır:
//   assets/misc-icons/<grup>/<ad>.png        128x128 (DOM: Codex, savaş HUD'ı rozetleri, tooltip'ler; tarayıcı küçültür)
//   assets/misc-icons/<grup>/small/<ad>.png   64x64  (Phaser dokusu; önceden lanczos ile küçültülmüş)
// Oyunda tek giriş: `miscIconName(grup, ad)` (src/ui/misc-icons.ts) -> art-registry '<grup>:<ad>'; dosya yoksa kodla çizilen eski ikon.
//
// status-sheet.png gerçek saydamlık taşır. world-sheet.png ve class-node-sheet.png SAYDAMLIK TAŞIMAZ: ChatGPT arka plana gri/beyaz dama
// deseni gömmüş (tonlar ~145 ve ~200, ~11 px kareler). Araç bunu siler:
//   1) Sayfa kenarından taşma dolgusu (flood fill): yalnızca neredeyse renksiz (doygunluk düşük) ve açık (dama tonlarında) pikseller; ikonların
//      koyu konturu dolguyu durdurur, ikonun İÇİNDEKİ açık parçalar (buz kristali, kabarcık, kutsal alev, mum, parşömen) dokunulmaz.
//   2) Kenara bağlı olmayan ama dama deseni olan kapalı delikler (yay ile kiriş arası gibi): renksiz bileşenin içinde yerel dama imzası güçlüyse
//      (yüksek geçirgen parlaklık ~5 px'te ters, ~10 px'te aynı işaret) silinir; düz / yumuşak geçişli iç parçalar (mum, parşömen) bu sınamayı geçmez.
//   2b) Renkli yarı saydam hale ya da kabarcık altında görünen dama: aynı imzayla bulunur, renk ve alfa geri çözülür (checkerShowThrough).
//   3) Kenar yumuşatma: silinen alana komşu açık-gri kenar halkası saydamlaşır, sonra alfa 1 px tüylenir.
// Doğrulama: --check=<klasör> her ikonu koyu ve açık zemin üstünde (128 ve 24 px) bir kontrol sayfasına yazar (<klasör>/misc-icons-check-<sayfa>.png).
//
// Yeniden üretmek için: node tools/make-misc-icons.mjs [--debug] [--check=<klasör>]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = 'assets/misc-icons';
const SIZES = [
  { sub: '', size: 128 },
  { sub: 'small', size: 64 },
];
const MARGIN = 0.05;
const DEBUG = process.argv.includes('--debug');
const CHECK_ARG = process.argv.find((a) => a.startsWith('--check'));
const CHECK = CHECK_ARG ? CHECK_ARG.split('=')[1] || 'tmp' : null;

/** Sayfalar: hücre haritası satır satır, her hücre [grup, ad]. `alphaBox`: kutu ölçümünde "dolu" eşiği (status'ta yumuşak hale kutuyu şişirmesin). */
const SHEETS = [
  {
    file: 'status-sheet.png',
    checker: false,
    alphaBox: 110,
    grid: [
      [['status', 'slow'], ['status', 'haste'], ['status', 'wound'], ['status', 'stun'], ['status', 'fortify']],
      [['status', 'blessed'], ['status', 'blinded'], ['status', 'shrouded'], ['status', 'dark_bond'], ['status', 'omen']],
      [['status', 'wither'], ['status', 'jinxed'], ['status', 'abyssal_fury'], ['status', 'silence'], ['status', 'overextended']],
      [['status', 'staggered'], ['status', 'ash_brand'], ['status', 'anchored'], ['status', 'doom'], ['fx', 'crit']],
    ],
  },
  {
    file: 'world-sheet.png',
    checker: true,
    alphaBox: 40,
    grid: [
      [['element', 'fire'], ['element', 'ice'], ['element', 'holy'], ['element', 'arcane'], ['element', 'nature']],
      [['element', 'dark'], ['ground', 'poison'], ['ground', 'burning'], ['ground', 'holy_fire'], ['ground', 'flooded_planks']],
      [['relic', 'ember_of_valdren'], ['relic', 'pilgrims_bell'], ['relic', 'whetstone_of_ashford'], ['relic', 'banner_of_the_bridge'], ['relic', 'last_rites']],
      [['relic', 'iron_oath'], ['emblem', 'heal'], ['emblem', 'feast'], ['fx', 'corpse'], ['fx', 'barrier']],
    ],
  },
  {
    file: 'class-node-sheet.png',
    checker: true,
    alphaBox: 40,
    grid: [
      [['class', 'warrior'], ['class', 'defender'], ['class', 'paladin'], ['class', 'archer'], ['class', 'cutthroat']],
      [['class', 'antimage'], ['class', 'mage'], ['class', 'druid'], ['class', 'undead'], ['class', 'hexer']],
      [['class', 'gambler'], ['node', 'battle'], ['node', 'elite'], ['node', 'boss'], ['node', 'event']],
      [['node', 'town'], ['node', 'treasure'], ['node', 'rest'], ['node', 'merchant'], ['node', 'start']],
    ],
  },
];
const COLS = 5;
const ROWS = 4;

// ---------------------------------------------------------------- dama deseni silme

/** Dama pikseli adayı: renksiz (kanallar arası fark küçük) ve açık. */
const NEUTRAL = 16;
const LIGHT = 128;
const isBgLike = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL && Math.min(r, g, b) >= LIGHT;


/** Kutu bulanıklığı (integral görüntü; kenarlarda pencere kırpılır). */
function boxBlur(src, W, H, r) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += src[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(W, x + r + 1);
      const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      out[y * W + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Yarı saydam hale / kabarcık altındaki dama: ChatGPT ışıltıyı damanın ÜSTÜNE boyamış (renkli ama desenli). Yerel dama imzası aranır: yüksek
 * geçirgen parlaklık ~5 px kaymada ters, ~10 px kaymada aynı işaretli (iki eksende) ise burada dama görünüyordur; genliği / saf dama genliği =
 * damanın görünme oranı t. Bu piksellerde renk yerel ortalamadan (desen süzülmüş) geri çözülür: F = (ort - t·dama) / (1 - t), alfa = 1 - t.
 * Dönüş: piksel başına { g: imza gücü 0-1, t, lp: süzülmüş RGB }.
 */
function checkerShowThrough(rgb, W, H) {
  const N = W * H;
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const G = new Float32Array(N);
  const B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    R[i] = rgb[i * 3];
    G[i] = rgb[i * 3 + 1];
    B[i] = rgb[i * 3 + 2];
    L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  }
  const mean = boxBlur(L, W, H, 5);
  const hp = new Float32Array(N);
  for (let i = 0; i < N; i++) hp[i] = L[i] - mean[i];
  const p0 = new Float32Array(N);
  const p5 = new Float32Array(N);
  const p10 = new Float32Array(N);
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? hp[y * W + x] : 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = hp[i];
      p0[i] = v * v;
      p5[i] = (v * at(x + 5, y) + v * at(x, y + 5)) / 2;
      p10[i] = (v * at(x + 10, y) + v * at(x, y + 10)) / 2;
    }
  const P0 = boxBlur(p0, W, H, 8);
  const P5 = boxBlur(p5, W, H, 8);
  const P10 = boxBlur(p10, W, H, 8);
  // saf dama genliği: sayfa kenarındaki şeritten
  let amp0 = 0;
  let n0 = 0;
  for (let y = 12; y < 20; y++)
    for (let x = 20; x < W - 20; x++) {
      amp0 += Math.sqrt(P0[y * W + x]);
      n0++;
    }
  amp0 /= n0;
  const lp = [boxBlur(R, W, H, 5), boxBlur(G, W, H, 5), boxBlur(B, W, H, 5)];
  const g = new Float32Array(N);
  const t = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const rho = P0[i] > 4 ? (P10[i] - P5[i]) / (2 * P0[i]) : 0;
    g[i] = Math.max(0, Math.min(1, (rho - 0.2) / 0.3));
    t[i] = Math.max(0, Math.min(1, Math.sqrt(P0[i]) / amp0));
  }
  return { g, t, lp, amp0 };
}

/** RGB tamponu -> RGBA (dama silinmiş, kenarı tüylenmiş). */
function removeChecker(rgb, W, H) {
  const N = W * H;
  const px = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  const bgLike = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const [r, g, b] = px(i);
    bgLike[i] = isBgLike(r, g, b) ? 1 : 0;
  }
  // 1) kenardan taşma dolgusu (4 komşu)
  const removed = new Uint8Array(N);
  const stack = [];
  const seed = (i) => {
    if (bgLike[i] && !removed[i]) {
      removed[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  const flood = () => {
    while (stack.length) {
      const i = stack.pop();
      const x = i % W;
      if (x > 0) seed(i - 1);
      if (x < W - 1) seed(i + 1);
      if (i >= W) seed(i - W);
      if (i < N - W) seed(i + W);
    }
  };
  flood();
  // 2) kapalı dama delikleri: kalan renksiz-açık bileşenler; içinde dama imzası (checkerShowThrough.g) güçlüyse delik = arka plan, silinir
  const show = checkerShowThrough(rgb, W, H);
  const seen = new Uint8Array(N);
  let holes = 0;
  for (let s = 0; s < N; s++) {
    if (!bgLike[s] || removed[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j >= 0 && j < N && bgLike[j] && !removed[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
      }
    }
    if (comp.length < 60) continue;
    let gs = 0;
    for (const i of comp) gs += show.g[i];
    if (gs / comp.length > 0.45) {
      for (const i of comp) removed[i] = 1;
      holes++;
    }
  }
  // 3) kenar halkası: silinen alana komşu, açık-gri (dama ile kontur arası karışım) pikseller de saydam
  for (let pass = 0; pass < 2; pass++) {
    const next = removed.slice();
    for (let i = 0; i < N; i++) {
      if (removed[i]) continue;
      const x = i % W;
      const nb = (x > 0 && removed[i - 1]) || (x < W - 1 && removed[i + 1]) || (i >= W && removed[i - W]) || (i < N - W && removed[i + W]);
      if (!nb) continue;
      const [r, g, b] = px(i);
      if (Math.max(r, g, b) - Math.min(r, g, b) <= NEUTRAL + 6 && Math.min(r, g, b) >= 112) next[i] = 1;
    }
    removed.set(next);
  }
  // yarı saydam hale altındaki dama: renk ve alfa geri çözülür (checkerShowThrough)
  const m = [0, 0, 0];
  {
    let n = 0;
    for (let i = 0; i < N; i++)
      if (removed[i] && i % 7 === 0) {
        m[0] += rgb[i * 3];
        m[1] += rgb[i * 3 + 1];
        m[2] += rgb[i * 3 + 2];
        n++;
      }
    for (let c = 0; c < 3; c++) m[c] /= n || 1;
  }
  // alfa + 1 px tüy (3x3 kutu ortalaması, yalnızca küçültür)
  const a0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) a0[i] = removed[i] ? 0 : 255;
  const out = Buffer.alloc(N * 4);
  let matted = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let a = a0[i];
      if (a) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            sum += a0[yy * W + xx];
            cnt++;
          }
        a = Math.min(a, Math.round(sum / cnt + 40));
      }
      let col = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
      const gi = Math.sqrt(show.g[i]);
      // desenli ve neredeyse renksiz: hale değil, dama deliğinin ta kendisi (ör. ay hilalinin dumanı arası) -> tamamen saydam
      if (a && gi > 0.45 && show.t[i] > 0.5 && Math.max(...col) - Math.min(...col) <= 42 && Math.min(...col) >= 90 && Math.max(...col) <= 215) a = 0;
      if (a && gi > 0) {
        const te = Math.min(0.97, show.t[i] * gi);
        const al = 1 - te;
        const F = [0, 1, 2].map((c) => Math.max(0, Math.min(255, (show.lp[c][i] - te * m[c]) / al)));
        col = col.map((v, c) => Math.round(gi * F[c] + (1 - gi) * v));
        a = Math.round(a * (al < 0.06 ? 0 : al));
        matted++;
      }
      out[i * 4] = col[0];
      out[i * 4 + 1] = col[1];
      out[i * 4 + 2] = col[2];
      out[i * 4 + 3] = Math.min(255, a);
    }
  if (DEBUG) console.log(`  dama genliği ${show.amp0.toFixed(1)}, hale altında çözülen piksel ${matted}`);
  return { rgba: out, holes };
}

// ---------------------------------------------------------------- ızgara ve kutu (make-ui-icons.mjs ile aynı yöntem)

function profile(alpha, W, H, thr, axis, y0 = 0, y1 = H) {
  const out = new Float64Array(axis === 'x' ? W : H);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (alpha(x, y) > thr) out[axis === 'x' ? x : y]++;
  return out;
}

/** Beklenen k/n sınırının çevresindeki en boş şeridin ortası. */
function cuts(prof, len, n) {
  const res = [0];
  for (let k = 1; k < n; k++) {
    const want = (len * k) / n;
    const win = Math.round((len / n) * 0.3);
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
  res.push(len);
  return res;
}

/** Hücre kutusu; hücre kenarına değen küçük kırıntılar (toplamın %3'ü altı) atılır. */
function bbox(alpha, thr, x0, y0, x1, y1) {
  const cols = new Int32Array(x1 - x0);
  const rows = new Int32Array(y1 - y0);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (alpha(x, y) > thr) {
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

/** Hücrede kenara değen küçük bileşenleri saydamlaştırır; silinen bileşen sayısını döner. */
function dropEdgeStrays(rgba, W, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const lab = new Int32Array(w * h).fill(-1);
  const on = (x, y) => rgba[((y0 + y) * W + x0 + x) * 4 + 3] > 12;
  const comps = [];
  for (let s = 0; s < w * h; s++) {
    if (lab[s] >= 0 || !on(s % w, Math.floor(s / w))) continue;
    const id = comps.length;
    const list = [s];
    lab[s] = id;
    let edge = false;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % w;
      const y = Math.floor(i / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (lab[j] < 0 && on(xx, yy)) {
            lab[j] = id;
            list.push(j);
          }
        }
    }
    comps.push({ list, edge });
  }
  const total = comps.reduce((t, c) => t + c.list.length, 0);
  let n = 0;
  for (const c of comps) {
    if (!c.edge || c.list.length >= total * 0.15) continue;
    for (const i of c.list) rgba[((y0 + Math.floor(i / w)) * W + x0 + (i % w)) * 4 + 3] = 0;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- ana akış

const made = [];
for (const sheet of SHEETS) {
  const src = join('assets/source/misc-icons', sheet.file);
  let rgba;
  let W;
  let H;
  if (sheet.checker) {
    const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    W = info.width;
    H = info.height;
    const r = removeChecker(data, W, H);
    rgba = r.rgba;
    if (DEBUG) console.log(`${sheet.file}: dama silindi, kapalı delik ${r.holes}`);
  } else {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    W = info.width;
    H = info.height;
    rgba = data;
  }
  const alpha = (x, y) => rgba[(y * W + x) * 4 + 3];
  const cy = cuts(profile(alpha, W, H, sheet.alphaBox, 'y'), H, ROWS);
  const cxs = [...Array(ROWS).keys()].map((r) => cuts(profile(alpha, W, H, sheet.alphaBox, 'x', cy[r], cy[r + 1]), W, COLS));
  if (DEBUG) console.log(`${sheet.file}: rows ${cy.join(' ')} | cols ${cxs.map((c) => c.join(' ')).join(' / ')}`);
  // komşu ikondan hücreye taşan parçalar (ör. Elite miğferinin sorgucu Druid hücresinde): hücre kenarına değen, toplamın %15'inden küçük bağlı
  // bileşenler silinir (8 komşu, düşük alfa eşiğiyle hale de bileşene dahil)
  let strays = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) strays += dropEdgeStrays(rgba, W, cxs[r][c], cy[r], cxs[r][c + 1], cy[r + 1]);
  if (DEBUG) console.log(`  taşan parça silindi: ${strays}`);
  const img = sharp(rgba, { raw: { width: W, height: H, channels: 4 } });
  const flat = await img.png().toBuffer();
  const checks = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const [group, name] = sheet.grid[r][c];
      const cx = cxs[r];
      const b = bbox(alpha, sheet.alphaBox, cx[c], cy[r], cx[c + 1], cy[r + 1]);
      if (!b) throw new Error(`${group}/${name}: hücre boş`);
      // hale / yumuşak kenar kutunun biraz dışına taşabilir: hücre içinde kalarak 4 px pay
      const pad = 4;
      const left = Math.max(cx[c], b.left - pad);
      const top = Math.max(cy[r], b.top - pad);
      const right = Math.min(cx[c + 1], b.right + pad);
      const bottom = Math.min(cy[r + 1], b.bottom + pad);
      const w = right - left;
      const h = bottom - top;
      const side = Math.ceil(Math.max(w, h) / (1 - 2 * MARGIN));
      const crop = await sharp(flat)
        .extract({ left, top, width: w, height: h })
        .extend({
          top: Math.floor((side - h) / 2),
          bottom: Math.ceil((side - h) / 2),
          left: Math.floor((side - w) / 2),
          right: Math.ceil((side - w) / 2),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      for (const { sub, size } of SIZES) {
        const dir = join(OUT, group, sub);
        mkdirSync(dir, { recursive: true });
        await sharp(crop).resize(size, size, { kernel: sharp.kernel.lanczos3, fit: 'fill' }).png({ compressionLevel: 9 }).toFile(join(dir, `${name}.png`));
      }
      checks.push(join(OUT, group, `${name}.png`));
      made.push(`${group}/${name}`);
      if (DEBUG) console.log(`  ${`${group}/${name}`.padEnd(28)} box ${b.left},${b.top} ${b.right - b.left}x${b.bottom - b.top} side ${side}`);
    }
  if (CHECK) {
    // her ikon: koyu zeminde 128 | açık zeminde 128 | koyu zeminde 24 | açık zeminde 24
    mkdirSync(CHECK, { recursive: true });
    const cellW = 128 * 2 + 24 * 2 + 40;
    const comps = [];
    checks.forEach((f, i) => {
      const x = (i % COLS) * cellW;
      const y = Math.floor(i / COLS) * 140;
      comps.push({ input: { create: { width: 136, height: 136, channels: 4, background: '#14100c' } }, left: x, top: y });
      comps.push({ input: { create: { width: 136, height: 136, channels: 4, background: '#e9e4d8' } }, left: x + 136, top: y });
      comps.push({ input: f, left: x + 4, top: y + 4 });
      comps.push({ input: f, left: x + 140, top: y + 4 });
      comps.push({ input: { create: { width: 32, height: 32, channels: 4, background: '#14100c' } }, left: x + 276, top: y + 4 });
      comps.push({ input: { create: { width: 32, height: 32, channels: 4, background: '#e9e4d8' } }, left: x + 276, top: y + 40 });
    });
    const small = await Promise.all(checks.map((f) => sharp(f).resize(24, 24, { kernel: sharp.kernel.lanczos3 }).png().toBuffer()));
    small.forEach((buf, i) => {
      const x = (i % COLS) * cellW;
      const y = Math.floor(i / COLS) * 140;
      comps.push({ input: buf, left: x + 280, top: y + 8 });
      comps.push({ input: buf, left: x + 280, top: y + 44 });
    });
    const out = join(CHECK, `misc-icons-check-${sheet.file}`);
    await sharp({ create: { width: cellW * COLS, height: 140 * ROWS, channels: 4, background: '#555555' } }).composite(comps).png().toFile(out);
    console.log(`kontrol sayfası: ${out}`);
  }
}
console.log(`${made.length} icons -> ${OUT}/<group>/<name>.png (128) + small/ (64)`);
