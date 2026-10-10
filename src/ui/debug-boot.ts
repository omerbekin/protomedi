import type Phaser from 'phaser';
import { DebugMenu } from './debug-menu';
import { DEBUG_INFO_TAB, DEBUG_TABS, registerDebugTools } from './debug-tools';

/** Debug menüsünü kurar (ayrı kod parçası; src/ui/debug-entry.ts ilk açılışta yükler). */
export function createDebugMenu(game: Phaser.Game, root: HTMLElement): DebugMenu {
  const debug = new DebugMenu(root, DEBUG_TABS, DEBUG_INFO_TAB);
  registerDebugTools({ game, debug });
  debug.registerMenuControls();
  return debug;
}
