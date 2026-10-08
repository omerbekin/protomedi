import Phaser from 'phaser';
import type { CampaignMap } from '../campaign';
import { campaignArtKey, hasCampaignArt } from './campaign-art';
import { FULL_REGION, type Region } from './wide-map';

/**
 * Harita arka planı (ana menü, sefer haritası, multiplayer zemini): varsa geniş (21:9) görsel + bölgesi, yoksa eski 16:9 görsel (bölge tamamı).
 * Yerleşim hesabı saf: `src/game/wide-map.ts`.
 */
export interface MapArt {
  key: string;
  region: Region;
  wide: boolean;
}

/** Haritanın arka plan görseli: geniş görsel yüklüyse o, değilse `background`. İkisi de yoksa null. */
export function mapArt(scene: Phaser.Scene, map: Pick<CampaignMap, 'background' | 'backgroundWide'>): MapArt | null {
  const w = map.backgroundWide;
  if (w && hasCampaignArt(scene, w.image)) return { key: campaignArtKey(w.image), region: w.region, wide: true };
  if (hasCampaignArt(scene, map.background)) return { key: campaignArtKey(map.background), region: FULL_REGION, wide: false };
  return null;
}

/**
 * Bulanık kopya dokusu (bir kez üretilir): küçültüp yumuşak büyütme (her tarayıcıda çalışır; WebGL preFX blur büyük görsellerde kayıp/kırpık
 * çizdiği için kullanılmaz). `factor`: küçültme oranı (büyük = daha bulanık).
 */
export function blurredTexture(scene: Phaser.Scene, key: string, factor = 10): string {
  const out = `${key}:blur${factor}`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const w = src.width;
  const h = src.height;
  const sw = Math.max(1, Math.round(w / factor));
  const sh = Math.max(1, Math.round(h / factor));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d');
  const tex = scene.textures.createCanvas(out, w, h);
  if (!sctx || !tex) return key;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, w, h);
  tex.refresh();
  return out;
}

/**
 * Görsel görünen alanı kaplamıyorsa iki yandaki boşluğu dolduran kenar uzantısı: görselin aynalanmış, bulanık ve karartılmış kopyaları.
 * `place(img)` ana görsele göre konumlar; görsel boşluk bırakmıyorsa ekran dışında kalır.
 */
export function edgeFillers(scene: Phaser.Scene, key: string, depth: number): { items: Phaser.GameObjects.Image[]; place: (img: Phaser.GameObjects.Image) => void } {
  const blur = blurredTexture(scene, key, 12);
  const items = [-1, 1].map((side) => scene.add.image(0, 0, blur).setFlipX(true).setTint(0x4a4038).setDepth(depth).setData('side', side));
  const place = (img: Phaser.GameObjects.Image): void => {
    for (const f of items) {
      const side = f.getData('side') as number;
      f.setDisplaySize(img.displayWidth, img.displayHeight).setOrigin(img.originX, img.originY);
      f.setPosition(img.x + side * img.displayWidth, img.y).setVisible(img.visible);
    }
  };
  return { items, place };
}
