/**
 * Geniş (21:9) harita görseli yerleşimi (saf; Phaser'sız, vitest ile sınanır).
 *
 * Sefer haritasının düğüm konumları (data/campaign/<harita>.json > nodes[].pos, 0-1) eski 16:9 görsele (valdoria-bg.webp) göredir.
 * Geniş görsel (valdoria-bg-wide.webp) eski haritayı içinde bir bölge olarak taşır: `backgroundWide.region` = [x0, y0, x1, y1] (geniş görselin
 * kesirleri; eski 16:9 haritanın kapladığı dikdörtgen). Böylece düğüm/bölge/yol konumları DEĞİŞMEZ: o bölge dünyada eski haritanın yerine
 * (sefer: 0-1920 x 0-1080) oturur, görselin kalanı iki yana (ve hafifçe alta) taşar. Geniş görsel yoksa eski görsel bölge [0,0,1,1] ile aynı kuralla.
 * Yeni bir geniş görsel takılırken yalnızca dosya + region güncellenir (region ölçümü: eski görselle özellik eşleştirme; bkz. docs).
 */

export type Region = readonly [number, number, number, number];

export const FULL_REGION: Region = [0, 0, 1, 1];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtPlacement {
  /** Görselin sol-üst köşesi (dünya) ve ölçeği (görsel pikseli başına dünya birimi). */
  x: number;
  y: number;
  scale: number;
  /** Görselin dünyadaki kapsamı. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Görseli, `region`'u dünyadaki `target` dikdörtgenine oturacak şekilde yerleştirir (oran region'dan; yatay ölçek esas). */
export function placeArt(imgW: number, imgH: number, region: Region, target: Rect): ArtPlacement {
  const [x0, y0, x1] = region;
  const scale = target.w / ((x1 - x0) * imgW);
  const x = target.x - x0 * imgW * scale;
  const y = target.y - y0 * imgH * scale;
  return { x, y, scale, left: x, right: x + imgW * scale, top: y, bottom: y + imgH * scale };
}

/**
 * Menü arka planı gibi kaydırılamayan sahnelerde: görsel görünen alanı [viewL, viewR] yatayda kaplıyorsa boşluk kalmayacak kadar (en az)
 * kaydırma; görsel daha darsa ortalar (kalan boşluk kenar dolgusuyla kapanır). Dönüş: x kaydırması.
 */
export function coverShift(p: Pick<ArtPlacement, 'left' | 'right'>, viewL: number, viewR: number): number {
  const w = p.right - p.left;
  if (w <= viewR - viewL) return (viewL + viewR) / 2 - (p.left + p.right) / 2;
  if (p.left > viewL) return viewL - p.left;
  if (p.right < viewR) return viewR - p.right;
  return 0;
}

/** Düğüm konumu (eski 16:9 harita kesri) -> geniş görselin kesri (ölçüm/doğrulama ve testler için). */
export function regionToImage(pos: readonly [number, number], region: Region): [number, number] {
  return [region[0] + pos[0] * (region[2] - region[0]), region[1] + pos[1] * (region[3] - region[1])];
}

/** Geniş görselin kesri -> eski 16:9 harita kesri (yeni görsele göre ölçülmüş bir noktayı düğüm verisine çevirmek için). */
export function imageToRegion(frac: readonly [number, number], region: Region): [number, number] {
  return [(frac[0] - region[0]) / (region[2] - region[0]), (frac[1] - region[1]) / (region[3] - region[1])];
}

/** Bölge tutarlı mı: 0-1 içinde, sıralı ve görsel oranıyla birlikte ~16:9 (eski haritanın oranı) verir. */
export function regionAspect(imgW: number, imgH: number, region: Region): number {
  return ((region[2] - region[0]) * imgW) / ((region[3] - region[1]) * imgH);
}

export interface FocusCrop {
  /** Görselden alınacak kırpma dikdörtgeni (görsel pikseli) ve ölçek (kutuyu tam doldurur). */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  scale: number;
}

/**
 * Kartı boşluksuz dolduran ve `focus` noktasını (görselin kesri) kutunun TAM ORTASINA getiren kırpma (Play kartları). Odak kenara yakınsa
 * görsel ortalanabilecek kadar yakınlaşır (en az "kaplama" ölçeği). Odak yoksa ortalı kaplama (eski davranış).
 */
export function focusCrop(imgW: number, imgH: number, boxW: number, boxH: number, focus?: readonly [number, number] | null): FocusCrop {
  const cover = Math.max(boxW / imgW, boxH / imgH);
  if (!focus) {
    const cropW = boxW / cover;
    const cropH = boxH / cover;
    return { cropX: (imgW - cropW) / 2, cropY: (imgH - cropH) / 2, cropW, cropH, scale: cover };
  }
  const fx = Math.min(1, Math.max(0, focus[0])) * imgW;
  const fy = Math.min(1, Math.max(0, focus[1])) * imgH;
  const halfW = Math.max(1e-6, Math.min(fx, imgW - fx));
  const halfH = Math.max(1e-6, Math.min(fy, imgH - fy));
  const scale = Math.max(cover, boxW / (2 * halfW), boxH / (2 * halfH));
  const cropW = boxW / scale;
  const cropH = boxH / scale;
  return { cropX: fx - cropW / 2, cropY: fy - cropH / 2, cropW, cropH, scale };
}
