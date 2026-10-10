// Arayüz hareketinin TEK kaynağı (Ömer 2026-10-10): ekran geçişi, pencere açılış / kapanış, panel değişimi, bildirim ve tooltip süreleri
// data/ui-motion.json'dan; 'Reduced motion' açıkken hepsi 0 (src/ui/motion-pref.ts). Phaser tarafı elegant-ui.ts'teki yardımcılarla
// (elScreenIn, elGo, elModalIn, elModalOut, elToast), DOM tarafı elegant.css'teki .el-modal / .el-modal-panel / .el-closing sınıflarıyla
// kullanır; DOM süreleri buradan CSS değişkenlerine (--m-*) yazılır. Phaser içe aktarmaz (DOM ekranları ve testler de kullanır).
import cfg from '../../data/ui-motion.json';
import { onReducedMotionChange, reducedMotion } from './motion-pref';
import { uiSound } from './ui-sound';

export type MotionPreset = 'screen' | 'modal' | 'panel' | 'toast' | 'tooltip' | 'result' | 'wave';

/** Başlık ölçeği (oyun birimi; data/ui-motion.json > type). */
export const TYPE = cfg.type;

export const MOTION = cfg;

/** Süre (ms); azaltılmış harekette 0. */
export function ms(value: number): number {
  return reducedMotion() ? 0 : value;
}

/** Ön ayarın süreleri (azaltılmış harekette 0). */
export function motion<K extends MotionPreset>(preset: K): (typeof cfg)[K] {
  const p = cfg[preset] as Record<string, unknown>;
  if (!reducedMotion()) return cfg[preset];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'number' && /Ms$|^ms$/.test(k) ? 0 : v;
  return out as (typeof cfg)[K];
}

/** DOM: süreleri CSS değişkenlerine yazar ve <html> üstünde `reduced-motion` sınıfını ayarlar (bir kez kurulur, değişince güncellenir). */
let installed = false;
export function applyMotionCss(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = () => {
    const r = reducedMotion();
    const v = (n: number) => `${r ? 0 : n}ms`;
    root.style.setProperty('--m-modal-in', v(cfg.modal.inMs));
    root.style.setProperty('--m-modal-out', v(cfg.modal.outMs));
    root.style.setProperty('--m-modal-rise', `${r ? 0 : cfg.modal.rise}px`);
    root.style.setProperty('--m-panel', v(cfg.panel.ms));
    root.style.setProperty('--m-tooltip', v(cfg.tooltip.inMs));
    root.style.setProperty('--m-ease', cfg.ease.css);
    root.style.setProperty('--m-dim', String(cfg.dim.modal));
    root.classList.toggle('reduced-motion', r);
  };
  set();
  if (installed) return;
  installed = true;
  onReducedMotionChange(set);
}

/**
 * DOM penceresini kapanış hareketiyle kaldırır: `.el-closing` (zemin ve panel solar) eklenir, süre bitince `done` (azaltılmış harekette
 * hemen). Kapanış sırasında tıklamalar geçmez.
 */
export function closeDom(overlay: HTMLElement, done: () => void): void {
  uiSound('close');
  const t = ms(cfg.modal.outMs);
  if (t <= 0) return done();
  overlay.classList.add('el-closing');
  window.setTimeout(done, t);
}

applyMotionCss();
