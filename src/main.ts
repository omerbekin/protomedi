import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import type { BattleScene } from './game/scenes/BattleScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { gateScene, prefetchScenes, sceneList } from './game/lazy-scenes';
import { loadNet, mp, setMultiplayerBoot } from './game/mp-client';
import { lobbyFromSearch } from './net/lobby-code';
import { installDebugEntry } from './ui/debug-entry';
import { flowContext, startMainMenu, startNewGame, startTeamSelect } from './game/session-flow';
import { SettingsScreen } from './ui/settings';
import { GameMenu, isGameMenuOpen } from './ui/game-menu';
import { lockInput, onInputLockChange, unlockInput } from './ui/input-lock';
import { createFullscreenButton } from './ui/fullscreen';
import { installViewport, parseRotateMode } from './ui/viewport';
import { installStage, setStageMetrics } from './game/stage';
import { installWiki, openWiki } from './wiki/open';
import { debugState } from './game/debug-state';
import { menuStyle } from './ui/menu-style';
import { whenMenuFontsReady } from './ui/menu-fonts';
import './style.css';
import { markBootReady, setBootProgress, whenBootReady } from './ui/boot-loader';

// Modüller yüklendi: açılış ekranı ilerler (sonraki adımlar: ana menünün dosyaları, fontlar; src/ui/boot-loader.ts)
setBootProgress(0.12);

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
// ?endless=1 doğrudan Endless ekranını açar (Endless Lite; ana menüde kartı yok, debug > Setup > Endless de açar)
// ?merchant=1 doğrudan Endless tüccarını açar (bekleyen gerçek koşuda; yoksa kaydedilmeyen önizleme koşusu: src/game/endless-session.ts > prepareMerchant)
const openMerchantShortcut = !skipSelect && !openCampaign && params.has('merchant');
const openEndless = !skipSelect && !openCampaign && (params.has('endless') || openMerchantShortcut);
// (Endless sahnesi ayrı kod parçasında: tüccar hazırlığı bitmeden sahne başlamaz)
if (openMerchantShortcut) gateScene('EndlessScene', import('./game/endless-session').then((m) => m.prepareMerchant()));
// Multiplayer: davet linki (?lobby=KOD) lobiye katılır; yenilenen sekme yarım kalan lobisine döner (docs/design/multiplayer.md)
const lobbyCode = skipSelect || openCampaign || openEndless ? null : lobbyFromSearch(window.location.search);
const rejoin = !skipSelect && !openCampaign && !openEndless && !lobbyCode && !!mp.pendingRejoin();
if (lobbyCode) {
  setMultiplayerBoot({ join: lobbyCode });
  params.delete('lobby'); // yenilemede tekrar katılmaya çalışmasın (yarım kalan lobi sessionStorage'dan döner)
  window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`);
} else if (rejoin) setMultiplayerBoot({ rejoin: true });
// Hızlı açılış: ana menü dışındaki sahnelerin kodu ilk gerektiğinde indirilir (src/game/lazy-scenes.ts); doğrudan bağlantıda o sahne ilk sırada
const firstScene = skipSelect ? 'BattleScene' : openCampaign ? 'CampaignMapScene' : openEndless ? 'EndlessScene' : lobbyCode || rejoin ? 'MultiplayerScene' : 'menu';

// Ses modülü (sentez tarifleri, ~190 kB) savaş parçasıyla ortak ayrı parçadadır: açılışta indirilmez. Kayıtlı ses seviyesi modül inince
// uygulanır: menü hazır olunca (arka plan indirmesiyle) ya da doğrudan bağlantıda ilk sahne başlamadan önce.
let volumeLevel: number | null = null;
let audioReady = false;
const withAudio = () =>
  import('./game/audio').then((a) => {
    audioReady = true;
    if (volumeLevel !== null) a.audioSettings.volume = volumeLevel / 10;
    return a;
  });
if (firstScene !== 'menu') gateScene(firstScene, withAudio());
whenBootReady(() => void withAudio().catch(() => undefined));

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
  // Bir sahnenin preload'u 32'den fazla dosya kuyruğa alınca ilk 32'den sonra yükleme takılabiliyordu (açılışta ~45 sn siyah ekran);
  // tek partide hepsi istenir. Ana menü artık yalnızca kendi ihtiyacını yükler (src/game/assets.ts > preloadAssets).
  loader: { maxParallelDownloads: 64 },
  scene: sceneList(firstScene, MainMenuScene),
});

mp.attachGame(game);

// Açılış yükleme ekranı: ana menü kendisi kapatır (fontlar hazır, menü çizildi); doğrudan başka sahneyle açılışta (?seed=, ?campaign=1,
// ?endless=1, lobi linki) o sahnenin kodu inip sahne kurulunca kapanır (src/game/lazy-scenes.ts). Güvenlik ağı: bir şey takılırsa 25 sn sonra yine kalkar.
window.setTimeout(markBootReady, 25000);
// Menü hazır olunca diğer sahnelerin kodu arka planda indirilir (ilk Quick Battle / sefer geçişinde bekleme olmasın)
whenBootReady(() => window.setTimeout(() => void prefetchScenes(game).then(() => loadNet()).catch(() => undefined), 600));

// Dev / local test only: lets the browser console inspect the running game (window.__game; also in a local production build on localhost)
if (import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname)) (window as unknown as { __game: Phaser.Game }).__game = game;
// Dev / local test only: multiplayer client (window.__mp) for console checks (also in a local production build on localhost)
if (import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname)) (window as unknown as { __mp: typeof mp }).__mp = mp;

// --- Screen layout: fills the visible area, follows the address bar, rotates the stage on upright phones ---
installStage(game);
installViewport(game, document.getElementById('stage')!, parseRotateMode(window.location.search), setStageMetrics);

// --- Debug menu (gizli girişler; menünün kodu ilk açılışta indirilir: src/ui/debug-entry.ts) ---
installDebugEntry(game, document.getElementById('ui-root')!);

// --- DOM katmanları (ayarlar, Menu, wiki) açıkken alttaki sahne tıklama almaz (src/ui/input-lock.ts) ---
onInputLockChange((locked) => {
  game.input.enabled = !locked;
});

// --- Settings screen (Ömer 2026-10-08: no gear; opened from a menu: main menu > Settings, campaign Menu > Settings, battle Menu > Settings) ---
new SettingsScreen(document.getElementById('ui-root')!, {
  onVolume: (level) => {
    volumeLevel = level;
    if (audioReady) void withAudio();
  },
  preview: () => void withAudio().then((a) => a.playSfxOn((game.sound as unknown as { context?: AudioContext }).context, 'stunChime')),
});

// --- Fullscreen button (top right, next to the wiki); hidden where the browser has no Fullscreen API (iPhone: shows an Add to Home Screen hint) ---
createFullscreenButton(document.getElementById('ui-root')!);

// --- Wiki / Codex: opens over the game; the battle is paused while it is open (code + catalog load on first open: src/wiki/open.ts) ---
/** Açık savaş sahnesi (kodu henüz inmemiş yer tutucu sahne sayılmaz: src/game/lazy-scenes.ts). */
const battleNow = (): BattleScene | null => {
  const s = game.scene.isActive('BattleScene') ? game.scene.getScene('BattleScene') : null;
  return s && !('isLoading' in s) ? (s as BattleScene) : null;
};
installWiki(document.getElementById('ui-root')!, {
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
  codex: () => openWiki(),
  retreat: () => battleNow()?.campaign?.retreat?.(),
  retreatLabel: () => battleNow()?.campaign?.retreatLabel,
  onOpen: () => {
    debugState.uiPaused = true;
    battleNow()?.applyDebugTiming();
  },
  onClose: () => {
    debugState.uiPaused = false;
    battleNow()?.applyDebugTiming();
  },
});

// Derin bağlantı: ?wiki=<bölüm> wiki'yi o bölümde açar (assets, sounds, animations, icons, art, palette, legacy, classes, skills...); ?wiki= boşsa başlangıç
const wikiParam = new URLSearchParams(window.location.search).get('wiki');
if (wikiParam !== null) openWiki(wikiParam || undefined);
