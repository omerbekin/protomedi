import { trackChunkLoad } from '../ui/boot-loader';
import type { WikiHooks, WikiPanel } from './view';

/**
 * Codex'in hafif girişi (hızlı açılış): Codex'in kodu ve katalogu ayrı parçadadır (src/wiki/view.ts + catalog), ilk açılışta indirilir ve
 * kurulur (uzun sürerse kısa yükleyici). Ana menü, harita Menu'sü, oyun içi Menu ve `?wiki=` bağlantısı buradan açar.
 */

let setup: { root: HTMLElement; hooks: WikiHooks } | null = null;
let panel: Promise<WikiPanel> | null = null;

/** main.ts: Codex'in bağlanacağı kök ve açılma / kapanma kancaları (panel henüz kurulmaz). */
export function installWiki(root: HTMLElement, hooks: WikiHooks): void {
  setup = { root, hooks };
}

function loadPanel(): Promise<WikiPanel> | null {
  if (!setup) return null;
  if (!panel) {
    const { root, hooks } = setup;
    panel = trackChunkLoad(import('./view').then((m) => new m.WikiPanel(root, hooks)));
    panel.catch((err: unknown) => {
      panel = null;
      console.error('[wiki] Codex yüklenemedi', err);
    });
  }
  return panel;
}

/** Codex'i aç; `section` verilirse o bölümde (ya da 'bölüm:madde') açılır. */
export function openWiki(section?: string): void {
  void loadPanel()?.then((p) => {
    if (section) p.show(section);
    p.setOpen(true);
  }, () => undefined);
}
