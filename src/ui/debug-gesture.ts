/**
 * Gizli debug girişi (Ömer 2026-10-09): görünür DEBUG düğmesi yok. Açmanın yolları:
 *  - klavye: ` ya da F2
 *  - dokunmatik: ÜÇ PARMAKLA KISA DOKUNMA (üç parmak aynı anda değsin, 0,7 sn içinde kalksın, parmaklar kaymasın)
 *  - Settings ekranının altındaki küçük "Developer tools" satırı
 *  - adreste `?debug=1`: sağ altta DEBUG düğmesi görünür
 * Oyun hiçbir yerde üç parmak kullanmaz (dokunma, uzun basma = birim seçimi, sürükleme), bu yüzden normal oyunda kendiliğinden
 * tetiklenmez. Sistem hareketleri (üç parmakla aşağı kaydırıp ekran görüntüsü) kaydırma olduğu için sayılmaz.
 */

export const DEBUG_TAP = { fingers: 3, maxMs: 700, maxMovePx: 30 } as const;

export interface TapSample {
  /** Hareket boyunca aynı anda değen en fazla parmak sayısı. */
  maxTouches: number;
  /** İlk parmağın değmesinden son parmağın kalkmasına kadar geçen süre. */
  durationMs: number;
  /** Herhangi bir parmağın başlangıç noktasından en uzak kayması (CSS piksel). */
  maxMovePx: number;
}

/** Saf karar: bu dokunuş debug menüsünü açar / kapatır mı? (tam üç parmak, kısa, kaymasız) */
export function isDebugTap(t: TapSample): boolean {
  return t.maxTouches === DEBUG_TAP.fingers && t.durationMs <= DEBUG_TAP.maxMs && t.maxMovePx <= DEBUG_TAP.maxMovePx;
}

/** Adreste `?debug=1` (ya da `?debug`) var mı: görünür DEBUG düğmesi. */
export function wantsDebugButton(search: string): boolean {
  const v = new URLSearchParams(search).get('debug');
  return v !== null && v !== '0' && v !== 'false';
}

/** Pencereye üç parmak dokunma dinleyicisini bağlar; tanınınca `onTap` çağrılır. */
export function listenDebugTap(onTap: () => void, target: Window = window): void {
  let start = 0;
  let maxTouches = 0;
  let maxMove = 0;
  const origin = new Map<number, { x: number; y: number }>();
  const opts = { passive: true, capture: true } as const;
  target.addEventListener(
    'touchstart',
    (e) => {
      if (origin.size === 0) {
        start = performance.now();
        maxTouches = 0;
        maxMove = 0;
      }
      for (const t of Array.from(e.changedTouches)) origin.set(t.identifier, { x: t.clientX, y: t.clientY });
      maxTouches = Math.max(maxTouches, e.touches.length);
    },
    opts,
  );
  target.addEventListener(
    'touchmove',
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        const o = origin.get(t.identifier);
        if (o) maxMove = Math.max(maxMove, Math.hypot(t.clientX - o.x, t.clientY - o.y));
      }
    },
    opts,
  );
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) origin.delete(t.identifier);
    if (e.touches.length > 0) return;
    origin.clear();
    if (isDebugTap({ maxTouches, durationMs: performance.now() - start, maxMovePx: maxMove })) onTap();
    maxTouches = 0;
  };
  target.addEventListener('touchend', end, opts);
  target.addEventListener('touchcancel', () => {
    origin.clear();
    maxTouches = 0;
  }, opts);
}
