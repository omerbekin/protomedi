/**
 * Sefer haritası görünümünün saf hesapları (Phaser'sız; test edilir): yakınlaştırma aralığı, kaydırma sınırı (21:9 harita çerçevesi),
 * kaydırma düğmelerinin etkinliği, tekerlek / trackpad girdisinin yorumu. Sahne: src/game/scenes/CampaignMapScene.ts.
 */

/** Harita yakınlaştırması (Ömer 2026-10-09: küçük bir aralık). Kameranın gerçek yakınlaştırması bunun render ölçeğiyle çarpımı. */
export const MAP_ZOOM = { min: 1, max: 1.4, step: 0.1 } as const;

export const clampZoom = (z: number): number => Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, Math.round(z * 100) / 100));

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface View {
  /** Görünen dünya genişliği / yüksekliği (tuval / gerçek yakınlaştırma). */
  w: number;
  h: number;
}

/** Kamera ortasının gidebileceği aralık: görünüm çerçeveden asla taşmaz; çerçeveden genişse ortada sabit kalır. */
export function midLimits(b: Bounds, v: View): { minX: number; maxX: number; minY: number; maxY: number } {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const fx = v.w >= b.right - b.left;
  const fy = v.h >= b.bottom - b.top;
  return {
    minX: fx ? cx : b.left + v.w / 2,
    maxX: fx ? cx : b.right - v.w / 2,
    minY: fy ? cy : b.top + v.h / 2,
    maxY: fy ? cy : b.bottom - v.h / 2,
  };
}

/** Kamera ortasını çerçeveye kısar. */
export function clampMid(mid: { x: number; y: number }, b: Bounds, v: View): { x: number; y: number } {
  const l = midLimits(b, v);
  return { x: Math.min(l.maxX, Math.max(l.minX, mid.x)), y: Math.min(l.maxY, Math.max(l.minY, mid.y)) };
}

/** Hangi yöne kaydırılabilir (◂ ▸ düğmeleri, ok tuşları); 1 px tolerans. */
export function canPan(mid: { x: number; y: number }, b: Bounds, v: View): { left: boolean; right: boolean; up: boolean; down: boolean } {
  const l = midLimits(b, v);
  return { left: mid.x > l.minX + 1, right: mid.x < l.maxX - 1, up: mid.y > l.minY + 1, down: mid.y < l.maxY - 1 };
}

/**
 * Tekerlek / trackpad: Ctrl (trackpad sıkıştırması tarayıcıda Ctrl + tekerlek gelir) = yakınlaştırma; değilse kaydırma.
 * Dikeyde yer yoksa dikey tekerlek de yatay kaydırır (fare tekerleğiyle sağa-sola gezinme).
 */
export function wheelAction(e: { dx: number; dy: number; ctrl: boolean }, room: { vertical: boolean }): { zoom: number; panX: number; panY: number } {
  if (e.ctrl) return { zoom: e.dy < 0 ? MAP_ZOOM.step : e.dy > 0 ? -MAP_ZOOM.step : 0, panX: 0, panY: 0 };
  if (room.vertical) return { zoom: 0, panX: e.dx, panY: e.dy };
  return { zoom: 0, panX: e.dx !== 0 ? e.dx : e.dy, panY: 0 };
}
