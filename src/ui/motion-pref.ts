// "Reduced motion" ayarı (Ömer 2026-10-10; Settings ekranı ve ana menü Settings sütunu): açıkken ana menü arka planında paralaks ve
// parçacık yok, yalnızca sabit görüntü. Kayıt yoksa işletim sisteminin `prefers-reduced-motion` tercihi izlenir; seçim kaydedilince o geçerli.
const KEY = 'proto.reducedMotion';
const listeners = new Set<(on: boolean) => void>();

function stored(): boolean | null {
  try {
    const v = window.localStorage?.getItem(KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

function osPrefers(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Azaltılmış hareket açık mı (kayıtlı seçim, yoksa işletim sistemi tercihi). */
export function reducedMotion(): boolean {
  return stored() ?? osPrefers();
}

export function setReducedMotion(on: boolean): void {
  try {
    window.localStorage?.setItem(KEY, on ? '1' : '0');
  } catch {
    /* depolama yok: yalnızca bu oturum dinleyicilere bildirilir */
  }
  for (const fn of listeners) fn(on);
}

/** Değişince haber ver (kaldırma işlevi döner). */
export function onReducedMotionChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
