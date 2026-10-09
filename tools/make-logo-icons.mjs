/**
 * Favicon + web app manifest ikonları: ana menü logosunun başındaki amblem (taş halka + alev), Ömer 2026-10-09.
 * Kaynak: assets/source/branding/logo.png (amblem soldaki ~460 px'lik bölge). Koyu zeminde kare; maskable sürümde güvenli bölge payı.
 * Çalıştır: node tools/make-logo-icons.mjs   (çıktı: public/icons/favicon-32.png, icon-192.png, icon-512.png, icon-maskable-512.png)
 * Eski piksel 'helm' ikon üretici: tools/make-pwa-icons.ts (artık kullanılmıyor).
 */
import sharp from 'sharp';

const SRC = 'assets/source/branding/logo.png';
const OUT = 'public/icons';
const BG = { r: 13, g: 10, b: 7, alpha: 1 }; // menü arka planı #0d0a07

const crop = await sharp(SRC).extract({ left: 0, top: 0, width: 460, height: 502 }).png().toBuffer();
const emblem = await sharp(crop).trim({ threshold: 1 }).png().toBuffer();

/** size: kenar; inset: kenarlardan bırakılan pay oranı; bg: zemin (favicon şeffaf). */
async function icon(file, size, inset, bg) {
  const inner = Math.round(size * (1 - inset * 2));
  const art = await sharp(emblem).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: size <= 64 ? 'lanczos3' : 'nearest' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log(file, size);
}

await icon('favicon-32.png', 32, 0.02, { r: 0, g: 0, b: 0, alpha: 0 });
await icon('icon-192.png', 192, 0.08, BG);
await icon('icon-512.png', 512, 0.08, BG);
await icon('icon-maskable-512.png', 512, 0.2, BG);
