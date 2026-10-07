/**
 * Saf hücre seçimi: imleç -> hedef tahtadaki yuva. Önce karakter ÇİZİMİ (sprite dikdörtgeni, şeffaf pikseller sayılmaz), sonra zemin dörtgeni.
 * Neden sprite önce: öndeki şeridin karakteri arkadaki hücrelerin zeminini çizimiyle örter; imleç o karakterin başındayken zemin
 * dörtgeni arkadaki komşuyu bulurdu (madde 233). Örtüşen çizimlerde en öndeki (ayağı en aşağıda) birim kazanır.
 */
import { pickCell, type Pt } from './shape-geometry';

/** Tahtadaki bir canlı birimin ekrandaki çizimi: ayak noktası + sığdırılmış boyut. */
export interface PickSprite {
  slot: number;
  /** Ayak noktası (sprite'ın alt-orta noktası). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** İsteğe bağlı: ekran noktasında çizim opak mı (alfa duyarlı)? Verilmezse dikdörtgenin içi yeter. */
  opaque?: (x: number, y: number) => boolean;
}

/** Ekranın dolu piksel aradığı küçük yarıçap: ince kılıç/asa çizgisine rastlamak kolay olsun. */
export const OPAQUE_REACH = 8;

/** Nokta çizim dikdörtgeninin içinde mi (alt-orta ayak noktası)? */
export function inSpriteRect(s: PickSprite, x: number, y: number): boolean {
  return Math.abs(x - s.x) <= s.w / 2 && y <= s.y && y >= s.y - s.h;
}

/**
 * İmleç hangi yuvada? 1) imleç bir birimin çiziminin (opak) içindeyse o birim (örtüşmede ayağı en aşağıda olan);
 * 2) değilse zemin dörtgeni (boş hücre, ceset); 3) o da değilse `body` verilmişse gövde dikdörtgeni yedeği (eski davranış); yoksa null.
 */
export function pickCellAt(slots: Pt[], lanes: number, x: number, y: number, sprites: PickSprite[], body?: { w: number; h: number }): number | null {
  let best: PickSprite | null = null;
  for (const s of sprites) {
    if (!inSpriteRect(s, x, y)) continue;
    if (best && s.y <= best.y) continue; // öndeki zaten kazandı: pahalı alfa sorgusuna gerek yok
    if (s.opaque && !s.opaque(x, y)) continue;
    best = s;
  }
  if (best) return best.slot;
  return pickCell(slots, lanes, x, y, body);
}

/**
 * Doku alfasına bakan `opaque` üretir: sprite'ın çerçeve-yerel piksel koordinatına çevirir (yatay çevrilmiş olabilir), imleç çevresinde
 * `OPAQUE_REACH` ekran pikseli yarıçapta beş noktadan biri doluysa true. `alphaAt(u, v)` çerçeve pikselinin alfasını (0-255) verir, bilinmiyorsa null.
 */
export function alphaOpaque(s: { x: number; y: number; w: number; h: number }, frameW: number, frameH: number, flipX: boolean, alphaAt: (u: number, v: number) => number | null, threshold = 24): (x: number, y: number) => boolean {
  const sample = (x: number, y: number): boolean => {
    let u = Math.floor(((x - (s.x - s.w / 2)) / s.w) * frameW);
    const v = Math.floor(((y - (s.y - s.h)) / s.h) * frameH);
    if (flipX) u = frameW - 1 - u;
    if (u < 0 || v < 0 || u >= frameW || v >= frameH) return false;
    const a = alphaAt(u, v);
    return a === null ? true : a >= threshold; // okunamadıysa dikdörtgen yeter
  };
  return (x, y) => {
    const r = OPAQUE_REACH;
    return sample(x, y) || sample(x - r, y) || sample(x + r, y) || sample(x, y - r) || sample(x, y + r);
  };
}
