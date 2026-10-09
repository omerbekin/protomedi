import Phaser from 'phaser';
import { avatarTexture, spriteTexture } from './assets';

/**
 * Endless tüccarının (Odo the Peddler) görseli. Gerçek sanat gelince kendiliğinden kullanılır:
 *  - boy figürü: assets/sprites/merchant/idle.png (tek illüstrasyon; sola bakan tezgâha dönük durması için sağa bakan çizim beklenir)
 *  - kafa portresi: assets/avatars/merchant.png (konuşma balonunun yanında)
 * Yoksa tasarım kitinde bir yer tutucu siluet (SVG -> doku; kapüşonlu seyyar satıcı, sırt yükü, fenerli asa, kese) çizilir.
 */
export const MERCHANT_ID = 'merchant';
const PH_KEY = 'merchant:placeholder';
/** Yer tutucu dokusunun piksel boyu (SVG viewBox 420x960, 2 kat çözünürlük). */
const PH_W = 840;
const PH_H = 1920;

const SVG = `<svg viewBox="0 0 420 960" width="${PH_W}" height="${PH_H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="mf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2817"/><stop offset=".55" stop-color="#1c130b"/><stop offset="1" stop-color="#0b0705"/></linearGradient>
<linearGradient id="mp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a18"/><stop offset="1" stop-color="#140d07"/></linearGradient>
<radialGradient id="lg"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset=".25" stop-color="#f08c28" stop-opacity=".55"/><stop offset="1" stop-color="#e0702a" stop-opacity="0"/></radialGradient>
<radialGradient id="fc" cx=".45" cy=".55"><stop offset="0" stop-color="#2a1c10"/><stop offset="1" stop-color="#050302"/></radialGradient>
</defs>
<g stroke="rgba(217,178,106,.55)" stroke-width="2" stroke-linejoin="round">
<ellipse cx="210" cy="932" rx="190" ry="20" fill="rgba(0,0,0,.5)" stroke="none"/>
<line x1="262" y1="150" x2="262" y2="600" stroke-width="6" stroke="#2a1d10"/><line x1="350" y1="150" x2="350" y2="600" stroke-width="6" stroke="#2a1d10"/>
<rect x="248" y="200" width="118" height="370" rx="14" fill="url(#mp)"/>
<line x1="250" y1="300" x2="364" y2="300"/><line x1="250" y1="430" x2="364" y2="430"/>
<ellipse cx="306" cy="176" rx="72" ry="28" fill="#2b1c10"/><path d="M240 176 Q306 196 372 176" fill="none"/>
<path d="M372 250 l22 4 l-4 46 q-14 10 -26 0 z" fill="#231709"/><circle cx="388" cy="345" r="20" fill="#1d1309"/><line x1="388" y1="325" x2="388" y2="308"/>
<path d="M366 400 q34 6 30 40 q-20 14 -34 -4" fill="#231709"/>
<line x1="76" y1="160" x2="60" y2="930" stroke="#2a1b0e" stroke-width="11"/><line x1="76" y1="160" x2="60" y2="930" stroke-width="1.5" fill="none"/>
<path d="M76 162 Q76 128 108 130 L108 150" fill="none" stroke-width="3"/>
<circle cx="108" cy="190" r="70" fill="url(#lg)" stroke="none"/>
<path d="M94 152 h28 l6 12 v40 l-6 10 h-28 l-6 -10 v-40 z" fill="#2a1a0c"/><rect x="98" y="166" width="20" height="36" fill="#ffc35e" stroke="none" opacity=".92"/>
<line x1="108" y1="166" x2="108" y2="202" stroke="#2a1a0c" stroke-width="2"/>
<path d="M206 98 C156 98 132 148 134 204 C120 258 110 330 112 410 L90 872 Q200 910 334 874 L302 420 C302 330 292 252 280 206 C282 146 256 98 206 98 Z" fill="url(#mf)"/>
<path d="M130 600 L120 870 M178 560 L172 890 M250 560 L262 890" fill="none" stroke="rgba(217,178,106,.14)"/>
<path d="M206 112 C170 112 156 150 160 196 C164 236 186 262 208 262 C232 262 250 236 252 196 C254 150 240 112 206 112 Z" fill="url(#fc)" stroke="rgba(217,178,106,.3)"/>
<path d="M176 220 Q208 300 240 220 Q232 268 208 276 Q184 268 176 220 Z" fill="#3b2b1c" stroke="rgba(217,178,106,.25)"/>
<circle cx="194" cy="196" r="2.6" fill="#ffb35a" stroke="none" opacity=".85"/><circle cx="222" cy="196" r="2.6" fill="#ffb35a" stroke="none" opacity=".85"/>
<path d="M150 250 C112 300 92 360 80 426 L102 440 C118 380 142 322 170 292 Z" fill="#20160c"/>
<circle cx="78" cy="434" r="14" fill="#3b2a1a"/>
<path d="M118 470 Q210 492 306 466" fill="none" stroke="#d9b26a" stroke-width="3"/>
<path d="M226 482 q-22 30 -6 60 q26 14 48 -4 q12 -30 -8 -56 z" fill="#3a2614" stroke="#d9b26a"/><path d="M232 488 q16 8 30 -2" fill="none" stroke="#d9b26a"/>
<circle cx="232" cy="560" r="5" fill="#e8c06a" stroke="none"/><circle cx="246" cy="566" r="4" fill="#d9a548" stroke="none"/>
<ellipse cx="160" cy="912" rx="40" ry="16" fill="#140d07"/><ellipse cx="258" cy="912" rx="40" ry="16" fill="#140d07"/>
</g></svg>`;

let loading = false;
const waiting = new Set<() => void>();

/** Yer tutucu dokusu (bir kez, eşzamansız: SVG resmi yüklenince `onReady` çağrılır). Hazırsa anahtarı döner, değilse null. */
function placeholder(scene: Phaser.Scene, onReady: () => void): string | null {
  if (scene.textures.exists(PH_KEY)) return PH_KEY;
  waiting.add(onReady);
  if (loading) return null;
  loading = true;
  const img = new Image();
  img.onload = () => {
    loading = false;
    if (!scene.textures.exists(PH_KEY)) scene.textures.addImage(PH_KEY, img);
    const cbs = [...waiting];
    waiting.clear();
    cbs.forEach((f) => f());
  };
  img.onerror = () => {
    loading = false;
    waiting.clear();
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
  return null;
}

/**
 * Tüccarın boy figürü: alt orta (x, bottom), yükseklik `h`. Gerçek sprite varsa o (NEAREST, oran korunur), yoksa yer tutucu siluet.
 * Yer tutucu henüz hazır değilse boş kap döner ve doku gelince `parent`'a eklenecek şekilde kendini doldurur.
 */
export function merchantFigure(scene: Phaser.Scene, x: number, bottom: number, h: number, maxW = h * 0.6): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const fill = (key: string, pixel: boolean) => {
    if (!c.scene) return; // kap yok edildi (ekran yeniden çizildi)
    const img = scene.add.image(x, bottom, key).setOrigin(0.5, 1);
    if (pixel) img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    img.setScale(Math.min(h / img.height, maxW / img.width));
    c.add(img);
  };
  const real = spriteTexture(scene, MERCHANT_ID);
  if (real) fill(real, true);
  else {
    const key = placeholder(scene, () => fill(PH_KEY, false));
    if (key) fill(key, false);
  }
  return c;
}

/** Tüccarın kafa portresi dokusu (assets/avatars/merchant.png); yoksa null (balon portresiz çizilir). */
export const merchantAvatar = (scene: Phaser.Scene): string | null => avatarTexture(scene, MERCHANT_ID);
