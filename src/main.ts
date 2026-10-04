import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { BattleScene } from './game/scenes/BattleScene';
import { computeZoom } from './game/scaling';
import { DebugMenu } from './ui/debug-menu';
import './style.css';

const { virtualWidth, virtualHeight } = layout;

const currentZoom = () => computeZoom(window.innerWidth, window.innerHeight, virtualWidth, virtualHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: virtualWidth,
  height: virtualHeight,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.NONE, zoom: currentZoom() },
  scene: [BattleScene],
});

window.addEventListener('resize', () => game.scale.setZoom(currentZoom()));

// --- Debug menüsü ---
const debug = new DebugMenu(document.getElementById('ui-root')!);
const battle = () => game.scene.getScene(BattleScene.KEY) as BattleScene | null;
const newSeed = () => Math.floor(Date.now() % 1_000_000_000);

let fps: HTMLDivElement | null = null;
let fpsTimer = 0;
let forcePortrait = false;

debug.register({
  id: 'battle.restart-new',
  section: 'Savaş',
  label: 'Savaşı yeni seed ile yeniden başlat',
  run: () => battle()?.scene.restart({ seed: newSeed() }),
});
debug.register({
  id: 'battle.restart-same',
  section: 'Savaş',
  label: 'Savaşı aynı seed ile yeniden başlat',
  run: () => battle()?.scene.restart({ seed: battle()?.seed }),
});
debug.register({
  id: 'battle.slots',
  section: 'Savaş',
  label: () => (battle()?.showSlots ? 'Yuva çerçevelerini gizle' : 'Yuva çerçevelerini göster'),
  run: () => {
    const b = battle();
    b?.setSlotsVisible(!b.showSlots);
  },
});
debug.register({
  id: 'screen.fps',
  section: 'Ekran',
  label: () => (fps ? 'FPS sayacını gizle' : 'FPS sayacını göster'),
  run: () => {
    if (fps) {
      fps.remove();
      fps = null;
      window.clearInterval(fpsTimer);
      return;
    }
    const el = document.createElement('div');
    el.className = 'fps-counter';
    document.body.append(el);
    fps = el;
    const tick = () => {
      el.textContent = `${Math.round(game.loop.actualFps)} FPS`;
    };
    tick();
    fpsTimer = window.setInterval(tick, 500);
  },
});
debug.register({
  id: 'screen.portrait',
  section: 'Ekran',
  label: () => (forcePortrait ? '"Yatay çevir" uyarısını kapat' : '"Yatay çevir" uyarısını zorla göster'),
  run: () => {
    forcePortrait = !forcePortrait;
    document.body.classList.toggle('force-portrait', forcePortrait);
  },
});
debug.registerInfo('core', () => ({
  Sürüm: __APP_VERSION__,
  'Derleme zamanı': new Date(__BUILD_TIME__).toLocaleString('tr-TR'),
  Seed: String(battle()?.seed ?? '-'),
  Ölçek: `${currentZoom().toFixed(2)}x`,
  'Ekran (CSS px)': `${window.innerWidth} x ${window.innerHeight}`,
  'Piksel yoğunluğu': String(window.devicePixelRatio),
}));
