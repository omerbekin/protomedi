import Phaser from 'phaser';
import layout from '../data/battle-layout.json';
import { audioSettings, playSfxOn } from './game/audio';
import { BattleScene } from './game/scenes/BattleScene';
import { TeamSelectScene } from './game/scenes/TeamSelectScene';
import { newSeed } from './game/seed';
import { DebugMenu } from './ui/debug-menu';
import { SettingsMenu } from './ui/settings';
import './style.css';

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
const debug = new DebugMenu(document.getElementById('ui-root')!);
/** The battle scene, only while a battle is actually running (not on the team selection screen). */
const battle = (): BattleScene | null => (game.scene.isActive(BattleScene.KEY) ? (game.scene.getScene(BattleScene.KEY) as BattleScene) : null);

let fps: HTMLDivElement | null = null;
let fpsTimer = 0;
let forcePortrait = false;

// --- Settings (top right): sound volume 0-10 ---
new SettingsMenu(document.getElementById('ui-root')!, {
  onVolume: (level) => {
    audioSettings.volume = level / 10;
  },
  preview: () => playSfxOn((game.sound as unknown as { context?: AudioContext }).context, 'stunChime'),
});

debug.register({
  id: 'scene.team-select',
  section: 'Battle',
  dock: { row: 0, order: 1, icon: 'team' },
  label: 'Team select',
  hint: 'Back to the team selection screen',
  run: () => {
    const b = battle();
    if (b) b.goToTeamSelect();
  },
});
debug.register({
  id: 'mode.toggle',
  section: 'Control',
  dock: { row: 0, order: 0, icon: 'flask', on: () => battle()?.mode === 'test' },
  label: () => (battle()?.mode === 'test' ? 'Mode: Test' : 'Mode: Turns'),
  hint: 'Switch between turn-based and test mode (no turn order, any unit can act). Restarts the battle.',
  run: () => {
    const b = battle();
    if (b) b.scene.restart({ seed: newSeed(), mode: b.mode === 'test' ? 'turns' : 'test' });
  },
});
debug.register({
  id: 'battle.rematch',
  section: 'Battle',
  label: 'Rematch',
  hint: 'Same teams, new seed',
  run: () => battle()?.scene.restart({ seed: newSeed() }),
});
debug.register({
  id: 'battle.random',
  section: 'Battle',
  dock: { row: 0, order: 2, icon: 'dice' },
  label: 'New teams',
  hint: 'Random teams, new seed',
  run: () => battle()?.scene.restart({ seed: newSeed(), teams: undefined }),
});
debug.register({
  id: 'battle.restart-same',
  section: 'Battle',
  label: 'Same seed',
  hint: 'Restart the battle with the same seed and teams',
  run: () => battle()?.scene.restart({ seed: battle()?.seed }),
});
debug.register({
  id: 'battle.autoplay',
  section: 'Control',
  dock: { row: 1, order: 0, icon: 'robot', on: () => !!battle()?.autoPlay },
  label: () => (battle()?.autoPlay ? 'Auto: on' : 'Auto: off'),
  hint: 'Let the AI play your party',
  run: () => battle()?.toggleAutoPlay(),
});
debug.register({
  id: 'battle.free-mp',
  section: 'Control',
  dock: { row: 1, order: 1, icon: 'freemp', on: () => BattleScene.freeMp },
  label: () => (BattleScene.freeMp ? 'Free MP: on' : 'Free MP: off'),
  hint: 'Skills cost no mana (both sides)',
  run: () => {
    BattleScene.freeMp = !BattleScene.freeMp;
    const b = battle();
    if (b) {
      b.battle.freeMp = BattleScene.freeMp;
      b.refreshCommandsNow();
    }
  },
});
debug.register({
  id: 'battle.skip-turn',
  section: 'Control',
  label: 'Skip turn',
  hint: "Skip the current unit's turn",
  run: () => battle()?.skipCurrentTurn(),
});
debug.register({
  id: 'battle.cycle-actor',
  section: 'Control',
  dock: {
    row: 1,
    order: 2,
    icon: () => {
      const a = battle()?.activeActor;
      return a ? { name: a.logo, accent: a.color, overlay: 'next' } : { name: 'next' };
    },
  },
  label: () => {
    const b = battle();
    if (b?.mode !== 'test') return 'Next unit';
    const a = b.activeActor;
    return a ? `Next: ${a.name}` : 'Next unit';
  },
  hint: 'Test mode only: switch to the next unit',
  run: () => battle()?.cycleActor(),
});
debug.register({
  id: 'battle.slots',
  section: 'View',
  label: () => (battle()?.showSlots ? 'Slots: on' : 'Slots: off'),
  hint: 'Show the formation cells',
  run: () => {
    const b = battle();
    b?.setSlotsVisible(!b.showSlots);
  },
});
debug.register({
  id: 'screen.fps',
  section: 'View',
  label: () => (fps ? 'FPS: on' : 'FPS: off'),
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
  section: 'View',
  label: () => (forcePortrait ? 'Portrait: on' : 'Portrait: off'),
  hint: 'Force the "rotate your phone" notice',
  run: () => {
    forcePortrait = !forcePortrait;
    document.body.classList.toggle('force-portrait', forcePortrait);
  },
});
debug.registerInfo('units', () =>
  Object.fromEntries(
    (battle()?.battle?.combatants ?? []).map((c) => [
      `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.summoned ? ' (summon)' : ''}`,
      [
        c.hp <= 0 ? 'DEAD' : `HP ${c.hp}/${c.maxHp}`,
        `MP ${c.mp}/${c.maxMp}`,
        `STR ${c.stats.str} DEX ${c.stats.dex} INT ${c.stats.int} LCK ${c.stats.luck}`,
        `SPD ${c.stats.spd}`,
        `ARM ${c.stats.armor}${c.stats.magicArmor > 0 ? ` M.ARM ${c.stats.magicArmor}` : ''}`,
        c.shield > 0 ? `Shield ${c.shield}` : '',
        c.magicShield > 0 ? `Magic shield ${c.magicShield}` : '',
        c.statuses.length > 0 ? `Status: ${c.statuses.map((s) => `${s.kind} ${s.turns}`).join(', ')}` : '',
        Object.keys(c.cooldowns).length > 0 ? `CD: ${Object.entries(c.cooldowns).map(([id, n]) => `${id} ${n}`).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' - '),
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
    .flatMap((e) => (e.type === 'damage' ? [`${e.amount}${e.crit ? '!' : ''}`] : []))
    .slice(-6)
    .join(', ');
  return {
    'Game mode': b?.mode === 'test' ? 'Test' : b ? 'Turn-based' : 'Team selection',
    'Turn queue': queue || '-',
    'Turns taken': String(eng?.turnsTaken ?? 0),
    'Selected skill': b?.selectedSkill ?? '-',
    'Last AI decision': b?.lastAi ?? '-',
    Seed: String(b?.seed ?? '-'),
    'Player team': eng ? eng.livingByDepth('party').map((c) => c.name).join(' > ') : '-',
    'Enemy team': eng ? eng.livingByDepth('enemy').map((c) => c.name).join(' > ') : '-',
    'Recent damage (! = crit)': lastDamage || '-',
    Version: __APP_VERSION__,
    'Build time': new Date(__BUILD_TIME__).toLocaleString('en-GB'),
    'Game resolution': `${layout.width} x ${layout.height}`,
    'On-screen size': `${Math.round(game.scale.displaySize.width)} x ${Math.round(game.scale.displaySize.height)}`,
    'Window (CSS px)': `${window.innerWidth} x ${window.innerHeight}`,
  };
});
