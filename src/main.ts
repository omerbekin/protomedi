import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { audioSettings, playSfxOn } from './game/audio';
import { BattleScene } from './game/scenes/BattleScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { CampaignMapScene } from './game/scenes/CampaignMapScene';
import { DebugMenu } from './ui/debug-menu';
import { DEBUG_INFO_TAB, DEBUG_TABS, registerDebugTools } from './ui/debug-tools';
import { flowContext, startMainMenu, startNewGame, startTeamSelect } from './game/session-flow';
import { SettingsMenu } from './ui/settings';
import { createFullscreenButton } from './ui/fullscreen';
import { installViewport, parseRotateMode } from './ui/viewport';
import { WikiPanel } from './wiki/view';
import { debugState } from './game/debug-state';
import './style.css';

// Geliştirme sunucusunda sekme adı canlı olmadığını belirtir (canlı sürüm: ProtoMedi).
if (import.meta.env.DEV) document.title = 'ProtoMedi (dev - NOT LIVE)';

// Normal açılış: ana menü (Continue / New Campaign / Load Game / Quick Battle). Adreste ?seed=123 varsa menüyü atlayıp o seed'in
// rastgele takımlarıyla doğrudan savaş (hata ayıklama / tekrar oynatma için); ?campaign=1 doğrudan sefer haritasını açar (geliştirme).
const params = new URLSearchParams(window.location.search);
const skipSelect = params.has('seed');
const openCampaign = !skipSelect && params.has('campaign');
const otherScenes = [TeamSelectScene, BattleScene, MainMenuScene, CampaignMapScene];
const firstScene = skipSelect ? BattleScene : openCampaign ? CampaignMapScene : MainMenuScene;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout.width,
  height: layout.height,
  backgroundColor: '#000000',
  antialias: true,
  // Oran korunarak (FIT) görünür alanın en büyük 16:9 kısmı; yerleşim/döndürme src/ui/viewport.ts
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [firstScene, ...otherScenes.filter((sc) => sc !== firstScene)],
});

// Dev only: lets the browser console inspect the running game (window.__game)
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// --- Screen layout: fills the visible area, follows the address bar, rotates the stage on upright phones ---
installViewport(game, document.getElementById('stage')!, parseRotateMode(window.location.search));

// --- Debug menu ---
const debug = new DebugMenu(document.getElementById('ui-root')!, DEBUG_TABS, DEBUG_INFO_TAB);

// --- Settings (top right): sound volume 0-10 ---
new SettingsMenu(document.getElementById('ui-root')!, {
  onVolume: (level) => {
    audioSettings.volume = level / 10;
  },
  preview: () => playSfxOn((game.sound as unknown as { context?: AudioContext }).context, 'stunChime'),
  // New Game / Team Select (an unfinished battle asks for confirmation first)
  flow: { context: () => flowContext(game), newGame: () => startNewGame(game), teamSelect: () => startTeamSelect(game), mainMenu: () => startMainMenu(game) },
});

// --- Fullscreen button (top right, next to the wiki); hidden where the browser has no Fullscreen API (iPhone: shows an Add to Home Screen hint) ---
createFullscreenButton(document.getElementById('ui-root')!);

// --- Wiki (top right, next to the settings gear): opens over the game; the battle is paused while it is open ---
const battleNow = (): BattleScene | null => (game.scene.isActive(BattleScene.KEY) ? (game.scene.getScene(BattleScene.KEY) as BattleScene) : null);
const wiki = new WikiPanel(document.getElementById('ui-root')!, {
  onOpen: () => {
    debugState.uiPaused = true;
    battleNow()?.applyDebugTiming();
  },
  onClose: () => {
    debugState.uiPaused = false;
    battleNow()?.applyDebugTiming();
  },
});
registerDebugTools({ game, debug });
debug.registerMenuControls();

// Derin bağlantı: ?wiki=<bölüm> wiki'yi o bölümde açar (assets, sounds, animations, icons, art, palette, legacy, classes, skills...); ?wiki= boşsa başlangıç
const wikiParam = new URLSearchParams(window.location.search).get('wiki');
if (wikiParam !== null) {
  wiki.show(wikiParam);
  wiki.setOpen(true);
}
