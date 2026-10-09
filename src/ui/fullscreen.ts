/**
 * Tam ekran: sağ üstte düğme (ayar ve wiki düğmelerinin yanında), ayarlar menüsünde satır, debug menüsünde eylem.
 * Fullscreen API (webkit önekli sürüm dahil) varsa kullanılır ve mümkünse yatay yön kilitlenir. iPhone Safari'de sayfa elementleri için
 * Fullscreen API yoktur: düğme yerine kısa bir ipucu ("Add to Home Screen for full screen") gösterilir. Desteklenmeyen yerde sessizce geçilir.
 */
import { iconUrl } from './dom-icons';

export type FullscreenSupport = 'native' | 'ios' | 'none';

export interface FullscreenEnv {
  /** documentElement üzerinde requestFullscreen var mı. */
  hasRequest: boolean;
  /** Webkit önekli sürüm var mı. */
  hasWebkitRequest: boolean;
  userAgent: string;
  /** iPadOS 13+ kendini Mac olarak tanıtır: Mac + dokunmatik noktası > 1. */
  maxTouchPoints: number;
  platform: string;
}

export function isIOSLike(env: Pick<FullscreenEnv, 'userAgent' | 'maxTouchPoints' | 'platform'>): boolean {
  return /iPhone|iPad|iPod/i.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
}

/** 'native': düğme tam ekran ister. 'ios': Safari, Fullscreen API yok -> ana ekrana ekle ipucu. 'none': özellik yok, düğme gizlenir. */
export function detectFullscreenSupport(env: FullscreenEnv): FullscreenSupport {
  if (env.hasRequest || env.hasWebkitRequest) return 'native';
  return isIOSLike(env) ? 'ios' : 'none';
}

/** Ana ekrandan (PWA) açılmış mı: o zaman zaten tam ekrandır, düğme/ipucu gerekmez. */
export function isStandalone(): boolean {
  try {
    return (window.matchMedia?.('(display-mode: fullscreen)').matches || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true) ?? false;
  } catch {
    return false;
  }
}

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function currentSupport(): FullscreenSupport {
  const el = document.documentElement as FsEl;
  return detectFullscreenSupport({
    hasRequest: typeof el.requestFullscreen === 'function',
    hasWebkitRequest: typeof el.webkitRequestFullscreen === 'function',
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? '',
  });
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Tam ekrana geç (kullanıcı hareketi içinden çağrılmalı). Reddedilirse (headless, izin yok) sessizce false döner. */
export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o?.lock?.('landscape');
  } catch {
    // yön kilidi her yerde yok (masaüstü, iOS): sessizce geç
  }
  return true;
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDoc;
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch {
    // yok say
  }
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    // yok say
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
let watching = false;

/** Tam ekran durumunu izler (Esc / sistem çıkışı dahil); hemen bir kez de çağrılır. Dönüş: aboneliği bırak. */
export function onFullscreenChange(fn: Listener): () => void {
  listeners.add(fn);
  if (!watching) {
    watching = true;
    const fire = (): void => listeners.forEach((l) => l(isFullscreen()));
    document.addEventListener('fullscreenchange', fire);
    document.addEventListener('webkitfullscreenchange', fire);
  }
  fn(isFullscreen());
  return () => listeners.delete(fn);
}

const HINT_KEY = 'proto.hint.fullscreen.v1';

export function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberHint(): void {
  try {
    window.localStorage.setItem(HINT_KEY, '1');
  } catch {
    // saklama kapalıysa geç
  }
}

/** Ana ekran iPhone ipucu metni / dokunmatik ilk açılış ipucu metni. */
export const IOS_HINT = 'Add to Home Screen for full screen';
export const TOUCH_HINT = 'Tap the corner arrows for full screen';

/**
 * Sağ üst tam ekran düğmesi. Destek 'none' ise eklenmez; 'ios' ise düğme ipucu gösterir ("Add to Home Screen for full screen");
 * ana ekrandan (standalone) açıldıysa hiç eklenmez. İlk açılışta dokunmatik cihazda kapatılabilir küçük bir ipucu çıkar (bir kez).
 */
/** Sağ üst tam ekran düğmesi yalnızca dokunmatik cihazda (Ömer 2026-10-09; masaüstünde Settings satırı ve debug girişi yeter). */
export function wantsFullscreenButton(env: { coarse: boolean; maxTouchPoints: number }): boolean {
  return env.coarse || env.maxTouchPoints > 0;
}

export function createFullscreenButton(root: HTMLElement): { setHint: (text: string) => void; support: FullscreenSupport } {
  const support = currentSupport();
  const noop = { setHint: () => {}, support };
  if (support === 'none' || isStandalone()) return noop;
  if (!wantsFullscreenButton({ coarse: !!window.matchMedia?.('(pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints ?? 0 })) return noop;

  const btn = document.createElement('button');
  btn.className = 'settings-toggle fullscreen-toggle';
  btn.type = 'button';
  const label = support === 'ios' ? IOS_HINT : 'Fullscreen';
  btn.title = label;
  btn.setAttribute('aria-label', 'Fullscreen');
  const img = document.createElement('img');
  img.alt = '';
  img.src = iconUrl('fullscreen');
  btn.append(img);

  const toast = document.createElement('div');
  toast.className = 'fs-hint';
  toast.hidden = true;
  const msg = document.createElement('span');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fs-hint-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close hint');
  toast.append(msg, close);
  let timer = 0;
  const showHint = (text: string, ms = 6000): void => {
    msg.textContent = text;
    toast.hidden = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (toast.hidden = true), ms);
  };
  close.addEventListener('click', () => {
    toast.hidden = true;
    rememberHint();
  });

  btn.addEventListener('click', () => {
    if (support === 'ios') {
      showHint(IOS_HINT);
      return;
    }
    void toggleFullscreen();
  });
  onFullscreenChange((on) => {
    img.src = iconUrl(on ? 'exitfullscreen' : 'fullscreen');
    btn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    btn.setAttribute('aria-label', btn.title);
  });

  root.append(btn, toast);

  // İlk açılışta dokunmatik cihazlarda tek seferlik ipucu
  try {
    if (!hintSeen() && window.matchMedia?.('(pointer: coarse)').matches) {
      showHint(support === 'ios' ? IOS_HINT : TOUCH_HINT, 9000);
      rememberHint();
    }
  } catch {
    // yok say
  }
  return { setHint: showHint, support };
}
