import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { getSpriteVariant } from './sprite-variants';

/**
 * Asset bulucu. Build sırasında assets/ klasörü taranır:
 *  - assets/sprites/<id>/<animasyon>.png  (yatay sprite sheet, kare kareler)
 *  - assets/backgrounds/<id>.(png|jpg)
 * Dosya yoksa placeholder çizilir; eksik asset oyunu çökertmez.
 */
const spriteFiles = import.meta.glob('../../assets/sprites/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const backgroundFiles = import.meta.glob('../../assets/backgrounds/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Kafa avatarları: assets/avatars/<id>.png (tools/import-characters-v2.py ile kafa kırpılarak üretilir). */
const avatarFiles = import.meta.glob('../../assets/avatars/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const ANIMATIONS = ['idle', 'attack', 'cast', 'hit', 'death', 'defend'] as const;
export type AnimName = (typeof ANIMATIONS)[number];

const spriteKey = (id: string, anim: string) => `sprite:${id}:${anim}`;
const placeholderKey = (id: string) => `placeholder:${id}`;
const avatarKey = (id: string) => `avatar:${id}`;

/** Sprite görünüm varyantları (idle-<varyant>.png / <id>-<varyant>.png): seçim src/game/sprite-variants.ts, ayar debug > Characters. */
/** Seçili varyant; dosyası yüklenmemişse (ya da seçim yoksa) null: varsayılan görünüm. */
function activeVariant(scene: Phaser.Scene | null, spriteId: string): string | null {
  const v = getSpriteVariant(spriteId);
  if (!v) return null;
  return !scene || scene.textures.exists(spriteKey(spriteId, `idle-${v}`)) ? v : null;
}
export const backgroundKey = (id: string) => `bg:${id}`;

function fileStem(path: string): string[] {
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  return [parts.pop() ?? '', file.replace(/\.[^.]+$/, '')];
}

/** preload() içinde çağrılır: var olan tüm sprite ve arka planları yükler. */
export function preloadAssets(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(spriteFiles)) {
    const [id, anim] = fileStem(path);
    scene.load.image(spriteKey(id!, anim!), url);
  }
  for (const [path, url] of Object.entries(avatarFiles)) {
    const [, id] = fileStem(path);
    scene.load.image(avatarKey(id!), url);
  }
  for (const [path, url] of Object.entries(backgroundFiles)) {
    const [, id] = fileStem(path);
    scene.load.image(backgroundKey(id!), url);
  }
}

/** Kafa avatarının doku anahtarı; avatar dosyası yoksa null (çağıran eski kırpmaya/silüete döner). Kare, sağa bakar. */
export function avatarTexture(scene: Phaser.Scene, spriteId: string): string | null {
  const id = spriteId.replace(/^enemy_/, '');
  const v = getSpriteVariant(id);
  const vKey = v ? avatarKey(`${id}-${v}`) : null;
  if (vKey && scene.textures.exists(vKey)) return vKey;
  const key = avatarKey(id);
  return scene.textures.exists(key) ? key : null;
}

export function hasBackground(scene: Phaser.Scene, id: string): boolean {
  return scene.textures.exists(backgroundKey(id));
}

/**
 * Bir karakter için gösterilecek doku. Gerçek sprite varsa onu kareler halinde böler
 * ve animasyon kaydeder; yoksa sınıfı simgeleyen placeholder üretir.
 */
export function characterTexture(scene: Phaser.Scene, spriteId: string, color: string): { key: string; real: boolean } {
  const variant = activeVariant(scene, spriteId);
  const idleKey = spriteKey(spriteId, variant ? `idle-${variant}` : 'idle');
  if (scene.textures.exists(idleKey)) {
    for (const anim of ANIMATIONS) registerSheet(scene, spriteId, anim, variant);
    return { key: idleKey, real: true };
  }
  return { key: makePlaceholder(scene, spriteId, color), real: false };
}

export function animKey(spriteId: string, anim: AnimName, scene: Phaser.Scene | null = null): string | null {
  const variant = anim === 'idle' ? activeVariant(scene, spriteId) : null;
  return `anim:${spriteId}:${anim}${variant ? `-${variant}` : ''}`;
}

function registerSheet(scene: Phaser.Scene, spriteId: string, anim: AnimName, variant: string | null = null): void {
  // Varyant yalnızca idle için vardır (idle-<varyant>.png); diğer animasyonlar ortak
  const v = anim === 'idle' ? variant : null;
  const key = spriteKey(spriteId, v ? `idle-${v}` : anim);
  const animName = `anim:${spriteId}:${anim}${v ? `-${v}` : ''}`;
  if (!scene.textures.exists(key) || scene.anims.exists(animName)) return;
  const texture = scene.textures.get(key);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // pixel art keskin kalsın
  // Kare sayısı: genişlik / yükseklik (yuvarlanır). Tek bir ayakta duran illüstrasyon (genişlik < 1,5 x yükseklik)
  // 1 kare sayılır; yatay sprite sheet'te kareler yaklaşık kare olmalıdır.
  const src = texture.getSourceImage();
  const frameHeight = src.height;
  const count = Math.max(1, Math.round(src.width / frameHeight));
  const frameWidth = Math.floor(src.width / count);
  for (let i = 0; i < count; i++) texture.add(i, 0, i * frameWidth, 0, frameWidth, frameHeight);
  scene.anims.create({
    key: animName,
    frames: Array.from({ length: count }, (_, i) => ({ key, frame: i })),
    frameRate: layout.animation.spriteFps,
    repeat: anim === 'idle' ? -1 : 0,
  });
}

// --- Placeholder: sınıf rengine boyalı blok karakter + sınıfı anlatan donanım ---

type G = Phaser.GameObjects.Graphics;
type Painter = (g: G) => void;

const pts = (...xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2]!, y: xy[i * 2 + 1]! }));

/** Kafanın merkezi ve yarıçapı: tüm sınıflar aynı iskeleti kullanır, farkı donanım yaratır. */
const HEAD = { x: 70, y: 40, r: 34 };

/** Yüzü (gözler) yeniden çizer; kafayı kapatan donanımlardan sonra kullanılır. */
function eyes(g: G, color = 0x1a1410): void {
  g.fillStyle(color).fillRect(77, 34, 8, 12).fillRect(95, 34, 8, 12);
}

/** Üst yarım daire (miğfer/kukuleta). */
function topHalf(g: G, r: number, fill: number): void {
  g.fillStyle(fill);
  g.beginPath();
  g.arc(HEAD.x, HEAD.y + 2, r, Math.PI, Math.PI * 2, false);
  g.closePath();
  g.fillPath();
}

const PAINTERS: Record<string, Painter> = {
  // Miğfer + kızıl tüy + kılıç
  warrior: (g) => {
    topHalf(g, 38, 0x8d99ae);
    g.fillStyle(0x636e72).fillRect(HEAD.x - 38, HEAD.y, 76, 7); // miğfer kenarı
    g.fillStyle(0xc0392b).fillTriangle(70, 0, 54, 14, 86, 14); // tüy
    g.fillStyle(0xdfe6e9).fillRect(114, 26, 9, 104).fillTriangle(114, 26, 123, 26, 118.5, 10); // kılıç
    g.fillStyle(0xf1c40f).fillRect(105, 128, 27, 8); // siper
    g.fillStyle(0x6d4c41).fillRect(115, 136, 7, 24);
    g.fillStyle(0xf1c40f).fillCircle(118.5, 164, 6);
    eyes(g);
  },
  // Hale + haçlı kalkan
  paladin: (g) => {
    g.lineStyle(6, 0xffe066, 1).strokeEllipse(HEAD.x, 9, 60, 14);
    g.fillStyle(0xb8860b).fillPoints(pts(10, 92, 56, 92, 56, 132, 33, 166, 10, 132), true);
    g.fillStyle(0xf1c40f).fillPoints(pts(14, 96, 52, 96, 52, 130, 33, 158, 14, 130), true);
    g.fillStyle(0xffffff).fillRect(30, 100, 7, 46).fillRect(18, 113, 31, 7); // haç
    g.fillStyle(0xffffff).fillRect(HEAD.x - 20, 62, 40, 6); // yaka
  },
  // Sivri şapka + yıldız + asa
  mage: (g) => {
    g.fillStyle(0x1f3a93).fillTriangle(46, 24, 96, 24, 74, 0);
    g.fillStyle(0x16286b).fillEllipse(HEAD.x, 24, 90, 15);
    g.fillStyle(0xffe066).fillCircle(72, 14, 3.5);
    g.fillStyle(0x8d6e63).fillRect(117, 52, 6, 140); // asa
    g.fillStyle(0x74b9ff).fillCircle(120, 44, 11);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(120, 44, 11);
    eyes(g);
  },
  // Kuru kafa + kaburga
  undead: (g) => {
    g.fillStyle(0xe8e4d0).fillCircle(HEAD.x, HEAD.y, HEAD.r);
    g.fillStyle(0x1a1410).fillCircle(74, 38, 8).fillCircle(95, 38, 8);
    g.fillTriangle(86, 50, 81, 60, 91, 60);
    g.fillStyle(0xcfcab4).fillRect(52, 62, 46, 12);
    g.lineStyle(2, 0x1a1410, 1);
    for (let x = 58; x < 98; x += 7) g.lineBetween(x, 62, x, 74);
    g.lineStyle(5, 0xe8e4d0, 1);
    for (const y of [92, 108, 124]) g.lineBetween(42, y, 98, y);
    g.lineBetween(70, 78, 70, 150);
  },
  // Kukuleta + yay ve ok
  archer: (g) => {
    topHalf(g, 38, 0x2d6a4f);
    g.fillStyle(0x1b4332).fillTriangle(34, 44, 52, 44, 36, 70);
    g.fillStyle(0xe74c3c).fillTriangle(88, 12, 106, 2, 98, 20); // tüy
    g.lineStyle(6, 0x8d6e63, 1);
    g.beginPath();
    g.arc(82, 112, 50, -Math.PI * 0.45, Math.PI * 0.45, false);
    g.strokePath();
    g.lineStyle(2, 0xffffff, 1).lineBetween(90, 64, 90, 160);
    g.lineStyle(4, 0xdfe6e9, 1).lineBetween(62, 112, 126, 112);
    g.fillStyle(0xdfe6e9).fillTriangle(124, 105, 124, 119, 138, 112);
    eyes(g);
  },
  // Boynuz/dal tacı + yapraklı asa
  druid: (g) => {
    g.lineStyle(6, 0x6d4c41, 1);
    g.lineBetween(56, 14, 46, 2).lineBetween(52, 8, 38, 8).lineBetween(84, 14, 94, 2).lineBetween(88, 8, 102, 8);
    g.fillStyle(0x7ed957).fillCircle(46, 3, 6).fillCircle(94, 3, 6).fillCircle(38, 9, 5).fillCircle(102, 9, 5);
    g.fillStyle(0x6d4c41).fillRect(116, 56, 6, 136); // asa
    g.fillStyle(0x7ed957).fillEllipse(119, 46, 20, 34);
    g.fillStyle(0x4c9a2a).fillEllipse(119, 46, 6, 28);
    g.fillStyle(0x7ed957).fillTriangle(70, 66, 40, 80, 100, 80); // yaprak yaka
    eyes(g);
  },
  // Ağaç gövdesi + yaprak tacı
  treant: (g) => {
    g.lineStyle(4, 0x4a2c15, 1);
    for (const x of [48, 70, 92]) g.lineBetween(x, 90, x + 4, 130).lineBetween(x + 4, 130, x - 2, 176);
    g.fillStyle(0x2d6a4f).fillCircle(44, 38, 24).fillCircle(98, 38, 24);
    g.fillStyle(0x3f8f5f).fillCircle(70, 22, 28).fillCircle(70, 48, 22);
    g.fillStyle(0x6bbf59).fillCircle(56, 16, 8).fillCircle(86, 28, 7);
    g.fillStyle(0x4a2c15).fillTriangle(24, 192, 8, 200, 38, 200).fillTriangle(116, 192, 132, 200, 102, 200);
    eyes(g, 0xf1c40f);
  },
};

/** "enemy_archer" ve "archer" aynı çizimi kullanır. */
const kindOf = (spriteId: string) => spriteId.replace(/^enemy_/, '');

function makePlaceholder(scene: Phaser.Scene, spriteId: string, color: string): string {
  const key = placeholderKey(spriteId);
  if (scene.textures.exists(key)) return key;
  const { width: w, height: h } = layout.characterSize;
  const base = Phaser.Display.Color.HexStringToColor(color);
  const dark = base.clone().darken(35).color;
  const light = base.clone().lighten(15).color;
  const g = scene.make.graphics({}, false);
  // Gölge
  g.fillStyle(0x000000, 0.35).fillEllipse(w / 2, h - 8, w * 0.8, 16);
  // Gövde
  g.fillStyle(dark).fillRoundedRect(w * 0.2 - 4, h * 0.36 - 4, w * 0.6 + 8, h * 0.6 + 8, 14);
  g.fillStyle(base.color).fillRoundedRect(w * 0.2, h * 0.36, w * 0.6, h * 0.6, 12);
  // Kafa
  g.fillStyle(dark).fillCircle(HEAD.x, HEAD.y, HEAD.r + 4);
  g.fillStyle(light).fillCircle(HEAD.x, HEAD.y, HEAD.r);
  // Gözler (karakter sağa bakar; düşmanlar sahnede ters çevrilir)
  eyes(g);
  // Sınıfa özel donanım
  PAINTERS[kindOf(spriteId)]?.(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}
