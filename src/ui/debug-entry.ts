import type Phaser from 'phaser';
import { trackChunkLoad } from './boot-loader';
import { listenDebugTap, wantsDebugButton } from './debug-gesture';
import type { DebugMenu } from './debug-menu';

/**
 * Debug menüsünün hafif girişi (hızlı açılış): menünün ve araçlarının kodu ayrı parçadadır (src/ui/debug-boot.ts), ilk açılışta indirilir.
 * Açma yolları değişmez: ` / F2, üç parmakla kısa dokunma, Settings > Developer tools; `?debug=1` ile menü açılışta hemen kurulur
 * (sağ alttaki DEBUG düğmesi). Menü kurulduktan sonra kendi dinleyicileri devralır; bu dosyadakiler susar.
 */

let ctx: { game: Phaser.Game; root: HTMLElement } | null = null;
let menu: Promise<DebugMenu> | null = null;
let ready = false;

function loadMenu(): Promise<DebugMenu> | null {
  if (!ctx) return null;
  if (!menu) {
    const { game, root } = ctx;
    menu = trackChunkLoad(import('./debug-boot').then((m) => m.createDebugMenu(game, root)));
    menu.then(
      () => {
        ready = true;
      },
      (err: unknown) => {
        menu = null;
        console.error('[debug] debug menüsü yüklenemedi', err);
      },
    );
  }
  return menu;
}

/** main.ts: gizli girişleri bağlar (menü ilk kullanımda kurulur). */
export function installDebugEntry(game: Phaser.Game, root: HTMLElement): void {
  ctx = { game, root };
  window.addEventListener('keydown', (e) => {
    if (ready) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.key === '`' || e.key === 'F2') openDebugMenu();
  });
  listenDebugTap(() => {
    if (!ready) openDebugMenu();
  });
  if (wantsDebugButton(window.location.search)) void loadMenu();
}

/** Settings > Developer tools ve ana menü: debug menüsünü açar (gerekirse önce indirir). */
export function openDebugMenu(): void {
  void loadMenu()?.then((m) => m.setOpen(true), () => undefined);
}
