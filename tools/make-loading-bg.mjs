// Açılış yükleme ekranının arka planı (Ömer 2026-10-10): assets/source/loading/loading-bg.png (ChatGPT, 1536x1024 savaş masası; ortası başlık ve
// çubuk için karanlık) -> public/loading/loading-bg.webp (1600 genişlik, web için sıkıştırılmış; public: JS paketinden ÖNCE iner).
// Ayrıca 32x21'lik bulanık yer tutucu üretip index.html'deki `/*boot-ph*/url(...)/*boot-ph*/` işaretlerinin arasına base64 olarak yazar:
// kutu ilk karede bu bulanık görüntüyle açılır, asıl resim yüklenince üstüne solar (src/ui/boot-loader.ts, index.html).
//
// Yeniden üretmek için: node tools/make-loading-bg.mjs
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'assets/source/loading/loading-bg.png';
const OUT = 'public/loading/loading-bg.webp';
const WIDTH = 1600;
const QUALITY = 74;
const LIMIT = 200 * 1024;

mkdirSync('public/loading', { recursive: true });
await sharp(SRC).resize(WIDTH, null, { kernel: sharp.kernel.lanczos3 }).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(OUT);
const size = statSync(OUT).size;
if (size > LIMIT) throw new Error(`${OUT} ${Math.round(size / 1024)} KB (sınır ${LIMIT / 1024} KB): QUALITY düşür`);

const ph = await sharp(SRC).resize(32, 21).blur(0.6).webp({ quality: 40 }).toBuffer();
const url = `url(data:image/webp;base64,${ph.toString('base64')})`;
const html = readFileSync('index.html', 'utf8');
const re = /\/\*boot-ph\*\/.*?\/\*boot-ph\*\//s;
if (!re.test(html)) throw new Error('index.html: /*boot-ph*/ işaretleri yok');
writeFileSync('index.html', html.replace(re, `/*boot-ph*/${url}/*boot-ph*/`));
console.log(`${OUT} ${Math.round(size / 1024)} KB · yer tutucu ${ph.length} bayt -> index.html`);
