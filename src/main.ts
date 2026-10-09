import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { audioSettings, playSfxOn } from './game/audio';
import { BattleScene } from './game/scenes/BattleScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { CampaignMapScene } from './game/scenes/CampaignMapScene';
import { MultiplayerScene, setMultiplayerBoot } from './game/scenes/MultiplayerScene';
import { mp } from './game/mp-client';
import { lobbyFromSearch } from './net/lobby-code';
import { DebugMenu } from './ui/debug-menu';
import { DEBUG_INFO_TAB, DEBUG_TABS, registerDebugTools } from './ui/debug-tools';
import { flowContext, startMainMenu, startNewGame, startTeamSelect } from './game/session-flow';
import { SettingsScreen } from './ui/settings';
import { GameMenu, isGameMenuOpen } from './ui/game-menu';
import { lockInput, onInputLockChange, unlockInput } from './ui/input-lock';
import { createFullscreenButton } from './ui/fullscreen';
import { installViewport, parseRotateMode } from './ui/viewport';
import { installStage, setStageMetrics } from './game/stage';
import { WikiPanel } from './wiki/view';
import { debugState } from './game/debug-state';
import { menuStyle } from './ui/menu-style';
import { whenMenuFontsReady } from './ui/menu-fonts';
import './style.css';

// Ana menü stili (?menu=new önizleme; varsayılan src/ui/menu-style.ts): zarif stilde fontlar hemen yüklenmeye başlar, oyun içi Settings sütunu CSS sınıfıyla
if (menuStyle === 'elegant') {
  document.documentElement.classList.add('menu-elegant');
  void whenMenuFontsReady();
}

// Geliştirme sunucusunda sekme adı canlı olmadığını belirtir (canlı sürüm: Embers of Valdoria).
if (import.meta.env.DEV) document.title = 'Embers of Valdoria (dev - NOT LIVE)';

// Normal açılış: ana menü (Continue / New Campaign / Load Game / Quick Battle). Adreste ?seed=123 varsa menüyü atlayıp o seed'in
// rastgele takımlarıyla doğrudan savaş (hata ayıklama / tekrar oynatma için); ?campaign=1 doğrudan sefer haritasını açar (geliştirme).
const params = new URLSearchParams(window.location.search);
const skipSelect = params.has('seed');
const openCampaign = !skipSelect && params.has('campaign');
// Multiplayer: davet linki (?lobby=KOD) lobiye katılır; yenilenen sekme yarım kalan lobisine döner (docs/design/multiplayer.md)
const lobbyCode = skipSelect || openCampaign ? null : lobbyFromSearch(window.location.search);
const rejoin = !skipSelect && !openCampaign && !lobbyCode && !!mp.pendingRejoin();
if (lobbyCode) {
  setMultiplayerBoot({ join: lobbyCode });
  params.delete('lobby'); // yenilemede tekrar katılmaya çalışmasın (yarım kalan lobi sessionStorage'dan döner)
  window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`);
} else if (rejoin) setMultiplayerBoot({ rejoin: true });
const otherScenes = [TeamSelectScene, BattleScene, MainMenuScene, CampaignMapScene, MultiplayerScene];
const firstScene = skipSelect ? BattleScene : openCampaign ? CampaignMapScene : lobbyCode || rejoin ? MultiplayerScene : MainMenuScene;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout.width,
  height: layout.height,
  backgroundColor: '#000000',
  antialias: true,
  // Oran korunarak (FIT); tuval boyutu ekran oranı ve gerçek piksel çözünürlüğüyle src/ui/viewport.ts > stageMetrics'ten gelir (geniş ekran:
  // mantıksal genişlik 1920-2580, yükseklik 1080; kamera yakınlaştırması src/game/stage.ts). Yerleşim/döndürme src/ui/viewport.ts
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [firstScene, ...otherScenes.filter((sc) => sc !== firstScene)],
});

mp.attachGame(game);

// Dev only: lets the browser console inspect the running game (window.__game)
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
// Dev / local test only: multiplayer client (window.__mp) for console checks (also in a local production build on localhost)
if (import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname)) (window as unknown as { __mp: typeof mp }).__mp = mp;

// --- Screen layout: fills the visible area, follows the address bar, rotates the stage on upright phones ---
installStage(game);
installViewport(game, document.getElementById('stage')!, parseRotateMode(window.location.search), setStageMetrics);

// --- Debug menu ---
const debug = new DebugMenu(document.getElementById('ui-root')!, DEBUG_TABS, DEBUG_INFO_TAB);

// --- DOM katmanları (ayarlar, Menu, wiki) açıkken alttaki sahne tıklama almaz (src/ui/input-lock.ts) ---
onInputLockChange((locked) => {
  game.input.enabled = !locked;
});

// --- Settings screen (Ömer 2026-10-08: no gear; opened from a menu: main menu > Settings, campaign Menu > Settings, battle Menu > Settings) ---
new SettingsScreen(document.getElementById('ui-root')!, {
  onVolume: (level) => {
    audioSettings.volume = level / 10;
  },
  preview: () => playSfxOn((game.sound as unknown as { context?: AudioContext }).context, 'stunChime'),
});

// --- Fullscreen button (top right, next to the wiki); hidden where the browser has no Fullscreen API (iPhone: shows an Add to Home Screen hint) ---
createFullscreenButton(document.getElementById('ui-root')!);

// --- Wiki (top right): opens over the game; the battle is paused while it is open ---
const battleNow = (): BattleScene | null => (game.scene.isActive(BattleScene.KEY) ? (game.scene.getScene(BattleScene.KEY) as BattleScene) : null);
const wiki = new WikiPanel(document.getElementById('ui-root')!, {
  onOpen: () => {
    lockInput('wiki');
    debugState.uiPaused = true;
    battleNow()?.applyDebugTiming();
  },
  onClose: () => {
    unlockInput('wiki');
    debugState.uiPaused = isGameMenuOpen(); // the battle Menu below keeps the battle paused
    battleNow()?.applyDebugTiming();
  },
});

// --- In-game Menu (top right "Menu" button + Esc) of battle / team select / multiplayer: Resume / Settings / New Game / Team Select /
// Retreat to Map (campaign) / Back to Main Menu; the battle is paused while it is open (src/ui/game-menu.ts) ---
new GameMenu(document.getElementById('ui-root')!, {
  context: () => flowContext(game),
  newGame: () => startNewGame(game),
  teamSelect: () => startTeamSelect(game),
  mainMenu: () => startMainMenu(game),
  retreat: () => battleNow()?.campaign?.retreat?.(),
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
