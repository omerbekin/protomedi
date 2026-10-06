import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { audioSettings, playSfxOn } from './game/audio';
import { BattleScene } from './game/scenes/BattleScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { DebugMenu } from './ui/debug-menu';
import { DEBUG_TABS, registerDebugTools } from './ui/debug-tools';
import { SettingsMenu } from './ui/settings';
import './style.css';

// Geliştirme sunucusunda sekme adı canlı olmadığını belirtir (canlı sürüm: ProtoMedi).
if (import.meta.env.DEV) document.title = 'ProtoMedi (dev - NOT LIVE)';

// Normal açılış: takım seçim ekranı. Adreste ?seed=123 varsa seçimi atlayıp o seed'in rastgele takımlarıyla doğrudan savaş
// (hata ayıklama / tekrar oynatma için).
const skipSelect = new URLSearchParams(window.location.search).has('seed');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout.width,
  height: layout.height,
  backgroundColor: '#000000',
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: skipSelect ? [BattleScene, TeamSelectScene] : [TeamSelectScene, BattleScene],
});

// Dev only: lets the browser console inspect the running game (window.__game)
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// --- Debug menu ---
const debug = new DebugMenu(document.getElementById('ui-root')!, DEBUG_TABS);

// --- Settings (top right): sound volume 0-10 ---
new SettingsMenu(document.getElementById('ui-root')!, {
  onVolume: (level) => {
    audioSettings.volume = level / 10;
  },
  preview: () => playSfxOn((game.sound as unknown as { context?: AudioContext }).context, 'stunChime'),
});

registerDebugTools({ game, debug });
