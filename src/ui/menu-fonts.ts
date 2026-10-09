/**
 * Menü fontlarının yüklenmesi (Cinzel 600/700, EB Garamond 400/italik; @font-face `src/style.css`, dosyalar `assets/fonts`, internetsiz).
 * Phaser yazıları çizildiği andaki fontla tuvale basılır: font hazır olmadan çizilirse yedek fontla kalır. Bu yüzden zarif menü
 * (`menu-style.ts`) yazılarını fontlar hazır olunca çizer (`whenMenuFontsReady`). latin-ext alt kümesi Türkçe harfler için ayrıca istenir.
 */
const SAMPLE = 'AaBbÖöŞşİıĞğÜüÇç ◂';
const WANT = ['600 32px Cinzel', '700 32px Cinzel', '400 32px "EB Garamond"', 'italic 400 32px "EB Garamond"'];
/** Font gelmezse (eski tarayıcı, bozuk dosya) menü en fazla bu kadar bekler, sonra yedek fontla çizer. */
const TIMEOUT_MS = 3000;

let ready = false;
let pending: Promise<void> | null = null;

export function menuFontsReady(): boolean {
  return ready;
}

/** Fontları yüklemeye başlar (bir kez); hepsi hazır olunca (ya da zaman aşımında) çözülür. */
export function whenMenuFontsReady(): Promise<void> {
  if (pending) return pending;
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) {
    ready = true;
    return (pending = Promise.resolve());
  }
  const load = Promise.all(WANT.map((f) => fonts.load(f, SAMPLE).catch(() => [])));
  const timeout = new Promise<void>((res) => setTimeout(res, TIMEOUT_MS));
  pending = Promise.race([load.then(() => undefined), timeout]).then(() => {
    ready = true;
  });
  return pending;
}
