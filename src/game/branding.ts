import type Phaser from 'phaser';

/** Ana menü logosu: assets/branding/logo.(png|webp). Dosya yoksa menü yazı başlığına düşer. */
const files = import.meta.glob('../../assets/branding/logo.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const LOGO_KEY = 'branding:logo';

export function preloadLogo(scene: Phaser.Scene): void {
  const url = Object.values(files)[0];
  if (url && !scene.textures.exists(LOGO_KEY)) scene.load.image(LOGO_KEY, url);
}

export const hasLogo = (scene: Phaser.Scene): boolean => scene.textures.exists(LOGO_KEY);

/** Logoyu oranı korunarak maxW x maxH kutusuna sığdırır. Kaynak yüksek çözünürlüklü (1872x502) ve küçültülerek
 * gösterildiği için LINEAR filtre (NEAREST küçültmede pikselleri yırtar). */
export function addLogo(scene: Phaser.Scene, x: number, y: number, maxW: number, maxH: number): Phaser.GameObjects.Image {
  scene.textures.get(LOGO_KEY).setFilter(0 /* Phaser.Textures.FilterMode.LINEAR */);
  const img = scene.add.image(x, y, LOGO_KEY);
  img.setScale(Math.min(maxW / img.width, maxH / img.height));
  return img;
}
