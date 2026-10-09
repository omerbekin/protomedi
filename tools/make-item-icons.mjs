// Item ikonları (Ömer 2026-10-10): assets/source/item-icons/pack1..5.png (ChatGPT, docs/design/prompts/item-icons.md > Paket 1-5;
// her sayfa 4x2 ızgara, satır satır soldan sağa, hücre N = paketin N. item'i) kesilir, arka planı temizlenir ve her item için
// assets/items/<item-id>.webp yazılır (256x256, saydam, nesne ortada, eşit kenar payı).
//
//  - pack1 ve pack7 gerçek saydamlık taşır (yalnızca çok düşük alfa kırıntıları silinir).
//  - pack2-5 resme gömülü SAHTE saydamlık damalı zemini taşır: hücre / sayfa kenarlarından flood-fill, yalnızca kenara bağlı açık gri-beyaz
//    nötr pikseller silinir (nesnenin içindeki parlamalar ve beyaz kısımlar kalır). Nesnenin kapattığı damalı adacıklar (ör. yay ile kirişin
//    arası) ayrıca bulunur: tamamen nötr, açık iki tonlu (damalı) ve yeterince büyük bölgeler.
//  - Kenar yumuşatma: zemine 1-2 px yakın pikseller zemin rengiyle karışık kabul edilir; alfa ve renk karışımdan geri çözülür
//    (koyu zeminde açık hale kalmasın).
//  - Saydamlık otomatik algılanır (alfası < 250 piksel oranı). extra-*.png dosyaları istenen paketler değildir; item'e bağlanmaz.
//
//  - TEK ITEM DEĞİŞTİRME: assets/source/item-icons/overrides/<item-id>.(png|webp) varsa sayfadaki hücrenin yerine o kullanılır
//    (tek nesneli görsel; gerçek saydamlık ya da sahte damalı zemin, aynı temizlik uygulanır). Örn. yeni bir Archer's Bracer çizimi.
//
// Yeniden üretmek için: node tools/make-item-icons.mjs   (isteğe bağlı: --debug = hücre başına kaldırılan adacık / kırıntı raporu)
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/item-icons';
const OUT = 'assets/items';
const SIZE = 256;
const MARGIN = 12;
const DEBUG = process.argv.includes('--debug');

/** Paket -> 8 hücrenin item kimliği (docs/design/prompts/item-icons.md sırası). */
const PACKS = {
  pack1: ['woodcutters_axe', 'bearded_axe', 'arming_sword', 'dane_axe', 'flanged_mace', 'oak_shield', 'morning_star', 'short_bow'],
  pack2: ['hunting_bow', 'yew_longbow', 'rondel_dagger', 'misericorde', 'twin_stilettos', 'ash_staff', 'oak_staff', 'bone_staff'],
  pack3: ['rune_staff', 'worn_deck', 'loaded_bones', 'hex_doll', 'padded_gambeson', 'quilted_jack', 'leather_jerkin', 'riveted_mail'],
  pack4: ['brigandine', 'warded_hauberk', 'coat_of_plates', 'leather_coif', 'iron_cap', 'padded_hood', 'nasal_helm', 'kettle_hat'],
  // Ömer 2026-10-10: hücre 4 (çivili deri eldiven) = Studded Gauntlets, hücre 5 (zincir eldiven) = Archer's Bracer (geçici; asıl çizim
  // gelince overrides/ ile değiştirilir).
  pack5: ['great_helm', 'work_gloves', 'leather_gloves', 'studded_gauntlets', 'archers_bracer', 'keen_gauntlets', 'hawkeye_gloves', 'bracers_of_the_fox'],
  // Paket 6 ve 7: hücre 7-8 boş.
  pack6: ['turnshoes', 'soft_boots', 'hobnailed_boots', 'riding_boots', 'ranger_boots', 'swift_sabatons', null, null],
  pack7: ['copper_ring', 'rabbits_foot', 'wolf_tooth', 'pilgrims_token', 'saints_medal', 'ashen_locket', null, null],
};
/** Kaynak dosya adı (uzantı). */
const SRC_FILE = { pack6: 'pack6.webp', pack7: 'pack7.webp' };
/** Tek item değiştirme dosyaları: item id -> dosya yolu. */
const OVERRIDE_DIR = join(SRC, 'overrides');
const OVERRIDES = Object.fromEntries(
  (existsSync(OVERRIDE_DIR) ? readdirSync(OVERRIDE_DIR) : []).filter((f) => /\.(png|webp)$/i.test(f)).map((f) => [f.replace(/\.[^.]+$/, ''), join(OVERRIDE_DIR, f)]),
);

/** Kenardan yayılan zemin: açık ve nötr (damalı karelerin iki tonu ~233-255). */
const isBg = (r, g, b) => Math.min(r, g, b) >= 222 && Math.max(r, g, b) - Math.min(r, g, b) <= 10;
/** Kapalı adacık adayı: daha sıkı (tam nötr). */
const isStrictBg = (r, g, b) => Math.min(r, g, b) >= 226 && Math.max(r, g, b) - Math.min(r, g, b) <= 4;

const N8 = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

/** Bir sayfayı (cols x rows ızgara; tek görsel için 1x1) temizler ve hücreleri keser. `ids[c]` null olan hücre atlanır. */
async function processPack(file, ids, cols = 4, rows = 2) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const n = W * H;
  const px = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) px[i] = data[i];
  // bg: 1 = zemin
  const bg = new Uint8Array(n);
  const realAlpha = (() => {
    let t = 0;
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) t++;
    return t > n * 0.2;
  })();
  const cellW = W / cols;
  const cellH = H / rows;
  const report = [];

  if (realAlpha) {
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 24) bg[i] = 1;
  } else {
    // 1) kenar flood-fill: sayfa kenarları + hücre sınırları tohum
    const q = new Int32Array(n);
    let qh = 0;
    let qt = 0;
    const seed = (x, y) => {
      const i = y * W + x;
      if (bg[i] || !isBg(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) return;
      bg[i] = 1;
      q[qt++] = i;
    };
    const inner = (count, step) => Array.from({ length: count - 1 }, (_, k) => [Math.round((k + 1) * step) - 1, Math.round((k + 1) * step)]).flat();
    for (let x = 0; x < W; x++) for (const y of [0, H - 1, ...inner(rows, cellH)]) seed(x, y);
    for (let y = 0; y < H; y++) for (const x of [0, W - 1, ...inner(cols, cellW)]) seed(x, y);
    while (qh < qt) {
      const i = q[qh++];
      const x = i % W;
      const y = (i - x) / W;
      for (let k = 0; k < 8; k += 2) {
        const nx = x + N8[k];
        const ny = y + N8[k + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        seed(nx, ny);
      }
    }
    // 2) kapalı damalı adacıklar
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (bg[s] || seen[s] || !isBg(data[s * 4], data[s * 4 + 1], data[s * 4 + 2])) continue;
      const comp = [s];
      seen[s] = 1;
      for (let h = 0; h < comp.length; h++) {
        const i = comp[h];
        const x = i % W;
        const y = (i - x) / W;
        for (let k = 0; k < 8; k += 2) {
          const nx = x + N8[k];
          const ny = y + N8[k + 1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (seen[j] || bg[j] || !isBg(data[j * 4], data[j * 4 + 1], data[j * 4 + 2])) continue;
          seen[j] = 1;
          comp.push(j);
        }
      }
      if (comp.length < 150) continue;
      let hi = 0;
      let lo = 0;
      for (const i of comp) {
        if (!isStrictBg(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) continue;
        const v = data[i * 4];
        if (v >= 250) hi++;
        else if (v <= 244) lo++;
      }
      const isChecker = hi > comp.length * 0.15 && lo > comp.length * 0.15;
      if (!isChecker) continue;
      for (const i of comp) bg[i] = 1;
      const i0 = comp[0];
      report.push(`  adacık silindi: hücre ${cellOf(i0 % W, Math.floor(i0 / W)) + 1}, ${comp.length} px`);
    }
    // 3) kenar karışımını geri çöz (zemine 1-2 px uzaklıktaki pikseller)
    const dist = new Uint8Array(n).fill(255);
    const dq = [];
    for (let i = 0; i < n; i++) if (bg[i]) {
      dist[i] = 0;
      dq.push(i);
    }
    for (let h = 0; h < dq.length; h++) {
      const i = dq[h];
      if (dist[i] >= 4) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (let k = 0; k < 16; k += 2) {
        const nx = x + N8[k];
        const ny = y + N8[k + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist[j] > dist[i] + 1) {
          dist[j] = dist[i] + 1;
          dq.push(j);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (dist[i] !== 1 && dist[i] !== 2) continue;
      const x = i % W;
      const y = (i - x) / W;
      // yerel zemin rengi (2 px içindeki zemin piksellerinin ortalaması) ve iç renk (en uzak / en koyu iç piksel)
      let br = 0;
      let bgc = 0;
      let bb = 0;
      let bc = 0;
      let fi = -1;
      let fd = -1;
      let fl = 1e9;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (bg[j]) {
            if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
              br += data[j * 4];
              bgc += data[j * 4 + 1];
              bb += data[j * 4 + 2];
              bc++;
            }
            continue;
          }
          const d = dist[j];
          const l = data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2];
          if (d > fd || (d === fd && l < fl)) {
            fd = d;
            fl = l;
            fi = j;
          }
        }
      if (!bc || fi < 0) continue;
      const B = [br / bc, bgc / bc, bb / bc];
      const F = [data[fi * 4], data[fi * 4 + 1], data[fi * 4 + 2]];
      const C = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      const fb = [F[0] - B[0], F[1] - B[1], F[2] - B[2]];
      const den = fb[0] ** 2 + fb[1] ** 2 + fb[2] ** 2;
      if (den < 40 * 40 * 3) continue; // açık nesne zemine değiyor: dokunma
      let a = ((C[0] - B[0]) * fb[0] + (C[1] - B[1]) * fb[1] + (C[2] - B[2]) * fb[2]) / den;
      a = Math.max(0, Math.min(1, a));
      if (a < 0.06) {
        bg[i] = 1;
        continue;
      }
      for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, (C[c] - (1 - a) * B[c]) / a));
      px[i * 4 + 3] = 255 * a;
    }
  }
  for (let i = 0; i < n; i++) if (bg[i]) px[i * 4 + 3] = 0;

  function cellOf(x, y) {
    return Math.min(cols - 1, Math.floor(x / cellW)) + Math.min(rows - 1, Math.floor(y / cellH)) * cols;
  }

  // 4) bileşenler -> hücre (ağırlık merkezine göre); kırıntılar atılır
  const label = new Int32Array(n).fill(-1);
  const comps = [];
  for (let s = 0; s < n; s++) {
    if (px[s * 4 + 3] <= 0 || label[s] >= 0) continue;
    const id = comps.length;
    const list = [s];
    label[s] = id;
    let sx = 0;
    let sy = 0;
    let light = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (let h = 0; h < list.length; h++) {
      const i = list[h];
      const x = i % W;
      const y = (i - x) / W;
      sx += x;
      sy += y;
      if (Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) >= 185) light++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let k = 0; k < 16; k += 2) {
        const nx = x + N8[k];
        const ny = y + N8[k + 1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (label[j] >= 0 || px[j * 4 + 3] <= 0) continue;
        label[j] = id;
        list.push(j);
      }
    }
    comps.push({ id, count: list.length, light: light / list.length, cx: sx / list.length, cy: sy / list.length, x0, y0, x1, y1 });
  }
  const results = [];
  for (let c = 0; c < cols * rows; c++) {
    if (!ids[c]) continue;
    const mine = comps.filter((k) => cellOf(k.cx, k.cy) === c);
    const big = mine.filter((k) => k.count >= 400);
    const near = (k) => big.some((b) => k.x1 >= b.x0 - 10 && k.x0 <= b.x1 + 10 && k.y1 >= b.y0 - 10 && k.y0 <= b.y1 + 10);
    // açık renkli küçük adacıklar = damalı zemin kırıntısı (sahte saydamlıklı sayfalarda)
    const speck = (k) => !realAlpha && k.count < 120 && k.light > 0.5;
    const keep = mine.filter((k) => k.count >= 400 || (k.count >= 6 && near(k) && !speck(k)));
    const dropped = mine.filter((k) => !keep.includes(k));
    if (dropped.length) report.push(`  hücre ${c + 1}: ${dropped.length} kırıntı atıldı (toplam ${dropped.reduce((s, k) => s + k.count, 0)} px)`);
    const keepIds = new Set(keep.map((k) => k.id));
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const k of keep) {
      x0 = Math.min(x0, k.x0);
      y0 = Math.min(y0, k.y0);
      x1 = Math.max(x1, k.x1);
      y1 = Math.max(y1, k.y1);
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y + y0) * W + (x + x0);
        if (!keepIds.has(label[i])) continue;
        const o = (y * w + x) * 4;
        for (let ch = 0; ch < 4; ch++) buf[o + ch] = Math.round(px[i * 4 + ch]);
      }
    results.push({ id: ids[c], buf, w, h });
  }
  return { results, report };
}

mkdirSync(OUT, { recursive: true });
const jobs = [
  ...Object.entries(PACKS).map(([pack, ids]) => ({ label: pack, file: join(SRC, SRC_FILE[pack] ?? `${pack}.png`), ids: ids.map((id) => (id && OVERRIDES[id] ? null : id)), cols: 4, rows: 2 })),
  ...Object.entries(OVERRIDES).map(([id, file]) => ({ label: `override ${id}`, file, ids: [id], cols: 1, rows: 1 })),
];
for (const id of Object.keys(OVERRIDES)) if (!Object.values(PACKS).flat().includes(id)) console.warn(`uyarı: override ${id} hiçbir pakette yok (yeni item ise items.json'da olmalı)`);
for (const job of jobs) {
  if (!job.ids.some(Boolean)) continue;
  const { results, report } = await processPack(job.file, job.ids, job.cols, job.rows);
  const pack = job.label;
  if (DEBUG && report.length) console.log(`${pack}:\n${report.join('\n')}`);
  for (const r of results) {
    const inner = SIZE - MARGIN * 2;
    const s = Math.min(inner / r.w, inner / r.h);
    const tw = Math.max(1, Math.round(r.w * s));
    const th = Math.max(1, Math.round(r.h * s));
    const scaled = await sharp(r.buf, { raw: { width: r.w, height: r.h, channels: 4 } }).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer();
    const info = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: scaled, left: Math.round((SIZE - tw) / 2), top: Math.round((SIZE - th) / 2) }])
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(join(OUT, `${r.id}.webp`));
    console.log(`${pack} -> ${r.id}.webp (${r.w}x${r.h} -> ${tw}x${th}) ${Math.round(info.size / 1024)} KB`);
  }
}
