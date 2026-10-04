import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { BattleScene } from './game/scenes/BattleScene';
import { DebugMenu } from './ui/debug-menu';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout.width,
  height: layout.height,
  backgroundColor: '#000000',
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BattleScene],
});

// Dev only: lets the browser console inspect the running game (window.__game)
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// --- Debug menu ---
const debug = new DebugMenu(document.getElementById('ui-root')!);
const battle = () => game.scene.getScene(BattleScene.KEY) as BattleScene | null;
const newSeed = () => Math.floor(Date.now() % 1_000_000_000);

let fps: HTMLDivElement | null = null;
let fpsTimer = 0;
let forcePortrait = false;

debug.register({
  id: 'mode.toggle',
  section: 'Game mode',
  label: () =>
    battle()?.mode === 'test'
      ? 'Mode: TEST (no turn order). Switch to Turn-based'
      : 'Mode: TURN-BASED. Switch to Test (no turn order)',
  run: () => {
    const b = battle();
    if (b) b.scene.restart({ seed: newSeed(), mode: b.mode === 'test' ? 'turns' : 'test' });
  },
});
debug.register({
  id: 'battle.restart-new',
  section: 'Battle',
  label: 'Restart battle (new seed)',
  run: () => battle()?.scene.restart({ seed: newSeed() }),
});
debug.register({
  id: 'battle.restart-same',
  section: 'Battle',
  label: 'Restart battle (same seed)',
  run: () => battle()?.scene.restart({ seed: battle()?.seed }),
});
debug.register({
  id: 'battle.autoplay',
  section: 'Battle',
  label: () => (battle()?.autoPlay ? 'Auto-play my party (AI): ON, turn off' : 'Auto-play my party (AI): OFF, turn on'),
  run: () => battle()?.toggleAutoPlay(),
});
debug.register({
  id: 'battle.skip-turn',
  section: 'Battle',
  label: 'Skip the current turn',
  run: () => battle()?.skipCurrentTurn(),
});
debug.register({
  id: 'battle.cycle-actor',
  section: 'Battle',
  label: () => {
    const b = battle();
    if (b?.mode !== 'test') return 'Acting unit: set by turn order (test mode only)';
    const a = b.activeActor;
    return `Test mode: acting unit ${a ? `${a.name} (${a.side === 'party' ? 'player' : 'enemy'})` : '-'}. Next unit`;
  },
  run: () => battle()?.cycleActor(),
});
debug.register({
  id: 'battle.slots',
  section: 'Battle',
  label: () => (battle()?.showSlots ? 'Hide slot frames' : 'Show slot frames'),
  run: () => {
    const b = battle();
    b?.setSlotsVisible(!b.showSlots);
  },
});
debug.register({
  id: 'screen.fps',
  section: 'Screen',
  label: () => (fps ? 'Hide FPS counter' : 'Show FPS counter'),
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
  section: 'Screen',
  label: () => (forcePortrait ? 'Hide the "rotate your phone" notice' : 'Force the "rotate your phone" notice'),
  run: () => {
    forcePortrait = !forcePortrait;
    document.body.classList.toggle('force-portrait', forcePortrait);
  },
});
debug.registerInfo('units', () =>
  Object.fromEntries(
    (battle()?.battle?.combatants ?? []).map((c) => [
      `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.summoned ? ' (summon)' : ''}`,
      `${c.hp <= 0 ? 'DEAD' : `HP ${c.hp}/${c.maxHp}`} - MP ${c.mp}/${c.maxMp} - SPD ${c.stats.spd}${c.shield > 0 ? ` - Shield ${c.shield}` : ''}${Object.keys(c.cooldowns).length > 0 ? ` - CD: ${Object.entries(c.cooldowns).map(([id, n]) => `${id} ${n}`).join(', ')}` : ''}`,
    ]),
  ),
);
debug.registerInfo('core', () => {
  const b = battle();
  const eng = b?.battle;
  const queue = eng
    ?.turnQueue()
    .map((uid) => eng.get(uid)?.name ?? '?')
    .join(' > ');
  const lastDamage = eng?.log
    .flatMap((e) => (e.type === 'damage' ? [e.amount] : []))
    .slice(-6)
    .join(', ');
  return {
    'Game mode': b?.mode === 'test' ? 'Test' : 'Turn-based',
    'Turn queue': queue || '-',
    'Turns taken': String(eng?.turnsTaken ?? 0),
    'Last AI decision': b?.lastAi ?? '-',
    Seed: String(b?.seed ?? '-'),
    'Recent damage': lastDamage || '-',
    Version: __APP_VERSION__,
    'Build time': new Date(__BUILD_TIME__).toLocaleString('en-GB'),
    'Game resolution': `${layout.width} x ${layout.height}`,
    'On-screen size': `${Math.round(game.scale.displaySize.width)} x ${Math.round(game.scale.displaySize.height)}`,
    'Window (CSS px)': `${window.innerWidth} x ${window.innerHeight}`,
  };
});
