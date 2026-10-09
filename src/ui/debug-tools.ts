/**
 * Debug menüsünün içeriği: sekmeler, ikonlu düğmeler ve paneller (birim araçları, skill cast, seed, hız, Test Mode...).
 * Her düğmenin bir ikonu olur (`dock.icon` ya da `icon`). `dock` alanı olan eylemler ayrıca ilk sekmede (Quick) bölüm bölüm görünür (src/ui/debug-layout.ts DOCK_GROUPS). Yeni eylem eklerken ikon ver.
 * Sahneye yalnızca BattleScene'in debug* yöntemleri ve motorun debug* yöntemleri üzerinden dokunur; oyun kuralı burada yoktur.
 */
import type Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { content, TARGET_TEXT } from '../engine';
import type { Combatant } from '../engine';
import {
  DAMAGE_MULTS,
  debugState,
  groupSkillsByOwner,
  nextInCycle,
  parseSeed,
  resourceValue,
  SPEEDS,
  speedLabel,
  STATUS_TURNS,
  tweaksSummary,
  type ResourcePreset,
} from '../game/debug-state';
import { BattleScene } from '../game/scenes/BattleScene';
import { newSeed } from '../game/seed';
import { DEFAULT_VARIANT, SPRITE_VARIANTS, getSpriteVariant, setSpriteVariant, variantLabel } from '../game/sprite-variants';
import { debugButton, debugHeading, debugSection, type DebugMenu } from './debug-menu';
import { QUICK_TAB } from './debug-layout';
import { UNIT_SELECT_EVENT } from '../game/unit-select';
import { DEFAULT_TEST_SIZE, buildTestBattleData, clampTeam, placeClass, removeSlot, resizeTeam, setTestSwitches, testClassIds, testMode, testModeSummary, type TestSide } from '../game/test-mode';
import { copyMatchData } from './match-copy';
import { isFullscreen, toggleFullscreen } from './fullscreen';
import { registerCampaignDebug } from './debug-campaign';
import { registerMultiplayerDebug } from './debug-mp';
import { registerEndlessDebug } from './debug-endless';
import { getRotateMode, setRotateMode } from './viewport';
import { stageView } from '../game/stage-view';
import { backgroundPool } from '../game/battle-background';
import { VERSIONS_TAB, registerVersionsPanel } from './debug-versions';

/** Sekme sırası (menü bu sırayla gösterir). */
export const DEBUG_TABS = [QUICK_TAB, 'Battle', 'Unit', 'Skills', 'Rolls', 'Speed & View', 'Setup', 'Campaign', 'Test Mode', 'Characters', VERSIONS_TAB, 'Data'];
/** Canlı bilgi paneli (Info) bu sekmededir. */
export const DEBUG_INFO_TAB = 'Data';

interface Ctx {
  game: Phaser.Game;
  debug: DebugMenu;
}

let fps: HTMLDivElement | null = null;
let fpsTimer = 0;
/** Seed giriş kutusunun taslağı (menü yenilense de kaybolmasın). */
let seedDraft = '';
let hpDraft = '';
let mpDraft = '';
let rageDraft = '';

const FORCE_LABEL = { auto: 'Normal', always: 'Always', never: 'Never' } as const;

/** Panellerin üstünde kısa bilgi/hata satırı (bir sonraki işleme kadar kalır). */
const notes = new Map<string, string>();

function noteLine(panel: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'debug-note';
  el.textContent = notes.get(panel) ?? '';
  el.hidden = !notes.get(panel);
  return el;
}

const heading = (text: string): HTMLElement => debugHeading(text);

const row = (...children: HTMLElement[]): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'debug-grid';
  el.append(...children);
  return el;
};

export function registerDebugTools({ game, debug }: Ctx): void {
  // Sefer (campaign-dev): Campaign sekmesi
  registerCampaignDebug(game, debug);
  // Multiplayer (multiplayer-dev): Setup > Multiplayer bölümü
  registerMultiplayerDebug(game, debug);
  // Endless Lite: Setup > Endless bölümü
  registerEndlessDebug(game, debug);
  /** The battle scene, only while a battle is actually running (not on the team selection screen). */
  const battle = (): BattleScene | null => (game.scene.isActive(BattleScene.KEY) ? (game.scene.getScene(BattleScene.KEY) as BattleScene) : null);
  const applyFlags = (): void => {
    const b = battle();
    if (b) Object.assign(b.battle.debug, debugState.flags);
  };
  const applyTiming = (): void => battle()?.applyDebugTiming();

  // A Ctrl+click selection change refreshes the open Unit tab (the highlighted units)
  if (typeof window !== 'undefined') window.addEventListener(UNIT_SELECT_EVENT, () => debug.refresh());

  // ===== Battle =====
  debug.register({
    id: 'scene.team-select',
    icon: 'team',
    tab: 'Setup',
    section: 'Battle setup',
    label: 'Team select',
    hint: 'Go back to the team selection screen to pick new classes',
    run: () => battle()?.goToTeamSelect(),
  });
  debug.register({
    id: 'mode.toggle',
    tab: 'Setup',
    section: 'Battle setup',
    dock: { group: 'Battle', order: 2, icon: 'flask', short: 'Mode', on: () => battle()?.mode === 'test', state: () => (battle()?.mode === 'test' ? 'Test' : 'Turns') },
    label: () => (battle()?.mode === 'test' ? 'Mode: Test' : 'Mode: Turns'),
    hint: 'Switch between turn-based and test mode (no turn order, any unit can act); restarts the battle',
    run: () => {
      const b = battle();
      if (b) b.scene.restart({ seed: newSeed(), mode: b.mode === 'test' ? 'turns' : 'test' });
    },
  });
  debug.register({
    id: 'battle.random',
    tab: 'Setup',
    section: 'Battle setup',
    dock: { group: 'Battle', order: 1, icon: 'dice', short: 'New teams' },
    label: 'New teams',
    hint: 'Start a new battle with random teams and a new seed',
    run: () => battle()?.scene.restart({ seed: newSeed(), teams: undefined }),
  });
  // Geometer (aoe_tester) test battle: player team = Geometer + 4 random classes, 5 random enemies, test mode (no turn order, no cooldowns)
  debug.register({
    id: 'battle.test-aoe',
    icon: 'geometerlogo',
    tab: 'Setup',
    section: 'Test battles',
    label: 'Test AOE shapes',
    hint: 'Start a test battle with the Geometer (row, column, block and cross shapes) on your team against 5 random enemies; test mode: no turn order, no cooldowns',
    run: () => {
      const seed = newSeed();
      const mates = content.randomTeam(seed, 4);
      const data = {
        seed,
        mode: 'test' as const,
        teams: { party: content.randomCells(content.arrangeTeam(['aoe_tester', ...mates]), seed), enemies: content.randomCells(content.randomTeam(seed + 7, 5), seed + 7) },
        partySize: 5,
        enemySize: 5,
      };
      // from the battle: restart it; from team select (or anywhere else): start the battle scene
      const b = battle();
      if (b) b.scene.restart(data);
      else game.scene.getScenes(true)[0]?.scene.start(BattleScene.KEY, data);
    },
  });
  // Cutthroat + Undead + Paladin test battle: Smoke Bomb on both boards, Backstab targets, corpse marks, Raise Dead preview, Resurrection (test mode: no turn order, no cooldowns)
  debug.register({
    id: 'battle.test-cutthroat',
    icon: 'cutthroatlogo',
    tab: 'Setup',
    section: 'Test battles',
    label: 'Test Cutthroat corpses',
    hint: 'Start a test battle with a Cutthroat (Smoke Bomb on either side, Backstab), an Undead and a Paladin on your team against 5 random enemies; kill enemies (Units tools) to see corpse marks, then try Raise Dead and Resurrection',
    run: () => {
      const seed = newSeed();
      const mates = content.randomTeam(seed, 2);
      const data = {
        seed,
        mode: 'test' as const,
        teams: { party: content.randomCells(content.arrangeTeam(['cutthroat', 'undead', 'paladin', ...mates]), seed), enemies: content.randomCells(content.randomTeam(seed + 7, 5), seed + 7) },
        partySize: 5,
        enemySize: 5,
      };
      const b = battle();
      if (b) b.scene.restart(data);
      else game.scene.getScenes(true)[0]?.scene.start(BattleScene.KEY, data);
    },
  });
  debug.register({
    id: 'battle.rematch',
    icon: 'swap',
    tab: 'Setup',
    section: 'Battle setup',
    label: 'Rematch',
    hint: 'Start a new battle with the same teams but a new seed',
    run: () => battle()?.scene.restart({ seed: newSeed() }),
  });
  debug.register({
    id: 'battle.restart-same',
    tab: 'Setup',
    section: 'Battle setup',
    dock: { group: 'Battle', order: 0, icon: 'restart', short: 'Restart battle' },
    label: 'Restart battle',
    hint: 'Restart the battle from the beginning with the same seed and teams',
    run: () => battle()?.scene.restart({ seed: battle()?.seed }),
  });
  debug.register({
    id: 'battle.skip-turn',
    tab: 'Battle',
    section: 'Flow',
    dock: { group: 'Battle', order: 3, icon: 'next', short: 'Skip turn' },
    label: 'Skip turn',
    hint: "Skip the current unit's turn",
    run: () => battle()?.skipCurrentTurn(),
  });
  debug.register({
    id: 'battle.cycle-actor',
    tab: 'Battle',
    section: 'Flow',
    dock: {
      group: 'Battle',
      order: 5,
      short: 'Next unit',
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
    hint: 'Test mode only: hand control to the next unit',
    run: () => battle()?.cycleActor(),
  });
  debug.register({
    id: 'battle.autoplay',
    tab: 'Battle',
    section: 'Flow',
    dock: { group: 'Battle', order: 4, icon: 'robot', short: 'Auto-play', on: () => !!battle()?.autoPlay },
    label: () => (battle()?.autoPlay ? 'Auto-play: on' : 'Auto-play: off'),
    on: () => !!battle()?.autoPlay,
    hint: 'Let the AI play your own party turns',
    run: () => battle()?.toggleAutoPlay(),
  });
  debug.register({
    id: 'battle.free-mp',
    icon: 'freemp',
    tab: 'Battle',
    section: 'Rules',
    label: () => (BattleScene.freeMp ? 'Free MP: on' : 'Free MP: off'),
    on: () => BattleScene.freeMp,
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
    id: 'tweak.enemy-ai',
    icon: 'robot',
    tab: 'Battle',
    section: 'Rules',
    label: () => (debugState.enemyAiOff ? 'Enemy AI: off' : 'Enemy AI: on'),
    on: () => debugState.enemyAiOff,
    hint: 'Off: enemies never act and their turns are skipped (turn mode)',
    run: () => {
      debugState.enemyAiOff = !debugState.enemyAiOff;
    },
  });

  // Seed panel
  debug.registerPanel({
    id: 'panel.seed',
    tab: 'Setup',
    render: (el, refresh) => {
      const note = noteLine('seed');
      const seed = battle()?.seed;
      const copy = async (text: string, what: string): Promise<void> => {
        try {
          await navigator.clipboard.writeText(text);
          notes.set('seed', `${what} copied`);
        } catch {
          notes.set('seed', `Could not copy (${text})`);
        }
        refresh();
      };
      const input = document.createElement('input');
      input.className = 'debug-input';
      input.type = 'text';
      input.inputMode = 'numeric';
      input.placeholder = 'Seed number';
      input.value = seedDraft;
      input.addEventListener('input', () => {
        seedDraft = input.value;
      });
      const start = (): void => {
        const n = parseSeed(seedDraft);
        const b = battle();
        if (n === null) notes.set('seed', 'Seed must be a whole number (0 or more)');
        else if (!b) notes.set('seed', 'Start a battle first');
        else {
          notes.set('seed', '');
          b.scene.restart({ seed: n });
        }
        refresh();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') start();
      });
      const inputRow = document.createElement('div');
      inputRow.className = 'debug-inline';
      inputRow.append(input, debugButton('Start', start, { icon: 'next', title: 'Restart the battle (same teams) with this seed' }));
      el.append(
        heading('Seed'),
        row(
          debugButton(`Seed: ${seed ?? '-'}`, () => seed !== undefined && void copy(String(seed), 'Seed'), { icon: 'clover', title: 'Click to copy the seed' }),
          debugButton('Copy link', () => seed !== undefined && void copy(`${window.location.origin}${window.location.pathname}?seed=${seed}`, 'Link'), { icon: 'clipboard', title: 'Copy a link that opens this exact battle' }),
        ),
        inputRow,
        note,
      );
    },
  });

  // ===== Unit =====
  debug.registerPanel({
    id: 'panel.unit',
    tab: 'Unit',
    render: (el, refresh) => {
      const scene = battle();
      if (!scene) {
        el.append(noteLineText('Start a battle to use unit tools'));
        return;
      }
      const b = scene.battle;
      const unit = scene.debugUnit;
      const selected = new Set(scene.selectedUids);
      // Tools act on every Ctrl+clicked unit (or the one picked below)
      const act = (fn: (u: Combatant) => { ok: boolean; reason?: string } | void): (() => void) => () => {
        const targets = scene.debugTargets();
        if (targets.length === 0) return;
        let reason = '';
        for (const u of targets) {
          const r = fn(u);
          if (r && !r.ok) reason = r.reason ?? 'Not possible';
        }
        notes.set('unit', reason);
        scene.debugAfterChange();
        refresh();
      };
      // Unit picker
      const chips = scene.debugUnits().map((c) => {
        const btn = debugButton(`${c.name}${c.summoned ? '*' : ''}`, () => {
          scene.clearUnitSelection();
          scene.debugUnitUid = c.uid;
          refresh();
        }, { icon: c.logo, accent: c.color, on: unit?.uid === c.uid || selected.has(c.uid), className: `chip ${c.side}${c.hp <= 0 ? ' dead' : ''}`, title: `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.hp <= 0 ? ' (dead)' : ''}` });
        return btn;
      });
      el.append(heading('Unit (tools apply to the highlighted ones)'), row(...chips));
      const hintLine = noteLineText(`Ctrl + click (Mac: Cmd, touch: long press) any unit in the battle to select it; click again to deselect, Esc or a click on empty ground clears. ${selected.size > 0 ? `Selected: ${selected.size}.` : ''}`);
      hintLine.classList.add('dim');
      el.append(hintLine);
      if (selected.size > 0) el.append(row(debugButton('Clear selection', () => {
        scene.clearUnitSelection();
        refresh();
      }, { icon: 'frame', title: 'Deselect all Ctrl+clicked units' })));
      if (unit && selected.size <= 1) {
        const line = document.createElement('div');
        line.className = 'debug-note dim';
        line.textContent = `${unit.side === 'party' ? 'Player' : 'Enemy'} ${unit.name}: ${unit.hp <= 0 ? 'DEAD' : `HP ${unit.hp}/${unit.maxHp}, MP ${unit.mp}/${unit.maxMp}${unit.maxRage !== undefined ? `, Rage ${unit.rage ?? 0}/${unit.maxRage}` : ''}`}`;
        el.append(line);
      }
      el.append(noteLine('unit'));

      const hp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'hp', resourceValue(u.maxHp, preset))), { icon: 'heart' });
      const mp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'mp', resourceValue(u.maxMp, preset))), { icon: 'droplet' });
      el.append(...debugSection('Health', hp('HP 1', 'one'), hp('HP 25%', 'quarter'), hp('HP 50%', 'half'), hp('HP full', 'full')));
      el.append(...debugSection('Mana', mp('MP 0', 'zero'), mp('MP 50%', 'half'), mp('MP full', 'full')));
      if (unit?.maxRage !== undefined) {
        const rage = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'rage', resourceValue(u.maxRage ?? 0, preset))), { icon: 'flame', title: `Set this unit's Rage (${label})` });
        el.append(...debugSection('Rage', rage('Rage 0', 'zero'), rage('Rage 50%', 'half'), rage('Rage full', 'full')));
      }

      const numberRow = (placeholder: string, get: () => string, set: (v: string) => void, apply: (n: number) => (u: Combatant) => { ok: boolean; reason?: string }): HTMLElement => {
        const input = document.createElement('input');
        input.className = 'debug-input';
        input.type = 'text';
        input.inputMode = 'numeric';
        input.placeholder = placeholder;
        input.value = get();
        input.addEventListener('input', () => set(input.value));
        const go = (): void => {
          const n = Number(get());
          if (get().trim() === '' || !Number.isFinite(n)) return;
          act(apply(n))();
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') go();
        });
        const wrap = document.createElement('div');
        wrap.className = 'debug-inline';
        wrap.append(input, debugButton('Set', go, { icon: 'next' }));
        return wrap;
      };
      el.append(
        numberRow('Exact HP', () => hpDraft, (v) => (hpDraft = v), (n) => (u) => b.debugSetResource(u.uid, 'hp', n)),
        numberRow('Exact MP', () => mpDraft, (v) => (mpDraft = v), (n) => (u) => b.debugSetResource(u.uid, 'mp', n)),
        ...(unit?.maxRage !== undefined ? [numberRow('Exact Rage', () => rageDraft, (v) => (rageDraft = v), (n) => (u) => b.debugSetResource(u.uid, 'rage', n))] : []),
      );

      el.append(
        ...debugSection(
          'Life',
          debugButton('Kill', act((u) => b.debugKill(u.uid)), { icon: 'skull' }),
          debugButton('Revive', act((u) => b.debugRevive(u.uid)), { icon: 'ankh' }),
          debugButton('Clear cooldowns', act((u) => b.debugClearCooldowns(u.uid)), { icon: 'hourglass', title: 'Reset all skill cooldowns of this unit' }),
          debugButton('Clear status', act((u) => b.debugClearStatuses(u.uid)), { icon: 'drop', title: 'Remove statuses and shields from this unit' }),
        ),
      );

      const statusButtons = Object.entries(content.statuses).map(([kind, def]) =>
        debugButton(def.name, act((u) => b.debugAddStatus(u.uid, kind, STATUS_TURNS)), { icon: def.type === 'debuff' ? 'poison' : 'shield', title: `${def.text} (${STATUS_TURNS} turns)`, className: def.type === 'debuff' ? 'bad' : 'good' }),
      );
      el.append(...debugSection('Add status', ...statusButtons));

    },
  });
  debug.register({
    id: 'unit.heal-team',
    tab: 'Battle',
    section: 'Team',
    dock: { group: 'Battle', order: 6, icon: 'heart', short: 'Heal my team' },
    label: 'Heal my team',
    hint: 'Revive and fully restore HP and MP of all your units',
    run: () => {
      const s = battle();
      if (!s) return;
      for (const c of s.battle.combatants) if (c.side === 'party' && c.hp <= 0 && !c.summoned) s.battle.debugRevive(c.uid);
      s.battle.debugFill('party');
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.kill-enemies',
    tab: 'Battle',
    section: 'Team',
    dock: { group: 'Battle', order: 7, icon: 'skull', short: 'Kill enemies' },
    label: 'Kill enemies',
    hint: 'Kill all enemies (you win)',
    run: () => {
      const s = battle();
      if (!s) return;
      for (const c of s.battle.living('enemy')) s.battle.debugKill(c.uid);
      s.debugAfterChange();
    },
  });

  debug.register({
    id: 'unit.revive-all',
    icon: 'ankh',
    tab: 'Battle',
    section: 'Team',
    label: 'Revive everyone',
    hint: 'Bring every fallen unit (both sides) back to life',
    run: () => {
      const s = battle();
      if (!s) return;
      s.battle.debugReviveAll();
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.clear-cooldowns',
    icon: 'hourglass',
    tab: 'Battle',
    section: 'Team',
    label: 'Clear all cooldowns',
    hint: "Reset every unit's skill cooldowns",
    run: () => {
      const s = battle();
      if (!s) return;
      s.battle.debugClearCooldowns();
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.heal-enemies',
    icon: 'heart',
    tab: 'Battle',
    section: 'Team',
    label: 'Heal enemies',
    hint: 'Revive and fully restore HP and MP of all enemies',
    run: () => {
      const s = battle();
      if (!s) return;
      for (const c of s.battle.combatants) if (c.side === 'enemy' && c.hp <= 0 && !c.summoned) s.battle.debugRevive(c.uid);
      s.battle.debugFill('enemy');
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.kill-party',
    icon: 'skull',
    tab: 'Battle',
    section: 'Team',
    label: 'Kill my team',
    hint: 'Kill all your units (you lose)',
    run: () => {
      const s = battle();
      if (!s) return;
      for (const c of s.battle.living('party')) s.battle.debugKill(c.uid);
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.set-rage',
    icon: 'rage',
    tab: 'Unit',
    section: 'Quick',
    label: 'Set rage',
    hint: 'Fill the Rage bar of the picked unit (or of your first Rage unit, e.g. the Warrior); exact values are in the Unit tab',
    run: () => {
      const s = battle();
      if (!s) return;
      const picked = s.debugUnit;
      const u = picked?.maxRage !== undefined ? picked : s.debugUnits().find((c) => c.maxRage !== undefined && c.hp > 0);
      if (u) s.battle.debugSetResource(u.uid, 'rage', u.maxRage ?? 0);
      s.debugAfterChange();
    },
  });
  debug.register({
    id: 'unit.tools',
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Tools', order: 1, icon: 'muscle', short: 'Unit tools' },
    label: 'Unit tools',
    hint: 'Open the Unit tab: pick one unit, then set HP/MP, kill, revive or add a status',
    run: () => debug.openTab('Unit'),
  });

  // ===== Skills (cast tool: changes the running battle; animation/sound previews live in the wiki) =====
  let galleryMsg = '';
  debug.registerPanel({
    id: 'panel.gallery',
    tab: 'Skills',
    render: (el, refresh) => {
      const scene = battle();
      if (!scene) {
        el.append(noteLineText('Start a battle to cast skills'));
        return;
      }
      const caster = scene.galleryActor;
      const living = scene.debugUnits().filter((c) => c.hp > 0);
      const intro = noteLineText('Tap a skill to cast it from the caster onto the target cell in this battle (damage, statuses and summons really happen). Cost, cooldown, range and turn order are ignored.');
      intro.classList.add('dim');
      el.append(intro);

      // Caster + options
      const changeCaster = (): void => {
        if (living.length === 0) return;
        const i = living.findIndex((c) => c.uid === caster?.uid);
        scene.galleryCaster = living[(i + 1) % living.length]!.uid;
        refresh();
      };
      el.append(
        heading('Caster and options'),
        row(
          debugButton(`Caster: ${caster ? `${caster.side === 'enemy' ? 'Enemy ' : ''}${caster.name}` : '-'}`, changeCaster, { icon: caster?.logo ?? 'wand', ...(caster ? { accent: caster.color } : {}), title: 'Tap to switch to the next unit' }),
          debugButton(debugState.galleryReset ? 'Reset after: on' : 'Reset after: off', () => {
            debugState.galleryReset = !debugState.galleryReset;
            refresh();
          }, { icon: 'restart', on: debugState.galleryReset, title: 'On: after each cast everything goes back (dead revived, summons removed, full HP/MP). Off: effects stay.' }),
        ),
      );

      // Target cell grid (the board the caster attacks)
      const board = caster?.side === 'enemy' ? 'party' : 'enemy';
      const cells: HTMLElement[] = [debugButton('Auto', () => {
        scene.galleryCell = null;
        refresh();
      }, { on: scene.galleryCell === null, title: 'First living enemy / front cell' })];
      el.append(heading(`Target cell (${board === 'enemy' ? 'enemy' : 'your'} side, row 1 = front)`));
      const grid = document.createElement('div');
      grid.className = 'debug-cells';
      grid.style.gridTemplateColumns = `repeat(${content.GRID.lanes}, 1fr)`;
      for (let slot = 0; slot < content.CELL_COUNT; slot++) {
        const unit = scene.battle.combatants.find((c) => c.board === board && c.slot === slot && c.hp > 0);
        const label = unit ? unit.name.slice(0, 7) : `${Math.floor(slot / content.GRID.lanes) + 1}-${(slot % content.GRID.lanes) + 1}`;
        grid.append(debugButton(label, () => {
          scene.galleryCell = slot;
          refresh();
        }, { on: scene.galleryCell === slot, className: unit ? 'occupied' : 'empty', title: unit ? `${unit.name} (cell ${slot + 1})` : `Empty cell ${slot + 1}` }));
      }
      el.append(row(...cells), grid);
      const msg = noteLine('gallery');
      msg.textContent = galleryMsg;
      msg.hidden = !galleryMsg;
      el.append(msg);

      // The skills, grouped by class
      for (const group of groupSkillsByOwner(content.classes, content.summons, content.skills)) {
        const buttons = group.skills.map((id) => {
          const skill = content.skills[id]!;
          const sfx = (skill.sfx ?? []).join(', ');
          return debugButton(skill.name, () => {
            galleryMsg = scene.debugCastSkill(id);
            refresh();
          }, { icon: skill.icon, className: 'skill', title: `${skill.name} - ${TARGET_TEXT[skill.target]}${sfx ? ` - sound: ${sfx}` : ''}` });
        });
        el.append(...debugSection(group.label, ...buttons));
      }
    },
  });

  // ===== Tweaks =====
  for (const sp of SPEEDS) {
    debug.register({
      id: `tweak.speed.${sp}`,
      icon: 'hourglass',
      tab: 'Speed & View',
      section: 'Animation speed',
      label: speedLabel(sp),
      on: () => debugState.speed === sp,
      hint: 'Speed of all animations',
      run: () => {
        debugState.speed = sp;
        applyTiming();
      },
    });
  }
  debug.register({
    id: 'tweak.speed-cycle',
    dockOnly: true,
    tab: 'Speed & View',
    section: 'Quick',
    dock: { group: 'Speed & View', order: 0, icon: 'hourglass', short: 'Speed', on: () => debugState.speed !== 1, state: () => speedLabel(debugState.speed) },
    label: () => `Speed: ${speedLabel(debugState.speed)}`,
    hint: 'Tap to cycle the animation speed (0.25x, 0.5x, 1x, 2x, 4x)',
    run: () => {
      debugState.speed = nextInCycle(SPEEDS, debugState.speed as (typeof SPEEDS)[number]);
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.skip',
    tab: 'Speed & View',
    section: 'Animation speed',
    dock: { group: 'Speed & View', order: 2, icon: 'ffwd', short: 'Skip anims', on: () => debugState.skipAnims },
    label: () => (debugState.skipAnims ? 'Skip anims: on' : 'Skip anims: off'),
    on: () => debugState.skipAnims,
    hint: 'Play animations extremely fast so battle results come almost instantly',
    run: () => {
      debugState.skipAnims = !debugState.skipAnims;
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.pause',
    tab: 'Speed & View',
    section: 'Animation speed',
    dock: { group: 'Speed & View', order: 1, icon: 'pause', short: 'Pause', on: () => debugState.paused },
    label: () => (debugState.paused ? 'Pause: on' : 'Pause: off'),
    on: () => debugState.paused,
    hint: 'Freeze all animations and timers (tap again to continue)',
    run: () => {
      debugState.paused = !debugState.paused;
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.numbers',
    icon: 'eye',
    tab: 'Speed & View',
    section: 'Display',
    label: () => (debugState.hideNumbers ? 'Hide numbers: on' : 'Hide numbers: off'),
    on: () => debugState.hideNumbers,
    hint: 'Hide the damage and heal numbers floating above units',
    run: () => {
      debugState.hideNumbers = !debugState.hideNumbers;
    },
  });
  debug.register({
    id: 'battle.slots',
    icon: 'frame',
    tab: 'Speed & View',
    section: 'Display',
    label: () => (battle()?.showSlots ? 'Show slots: on' : 'Show slots: off'),
    on: () => !!battle()?.showSlots,
    hint: 'Draw the formation cells (4 rows x 3 lanes) on the battlefield',
    run: () => {
      const b = battle();
      b?.setSlotsVisible(!b.showSlots);
    },
  });
  debug.register({
    id: 'screen.fps',
    icon: 'info',
    tab: 'Speed & View',
    section: 'Display',
    label: () => (fps ? 'Show FPS: on' : 'Show FPS: off'),
    on: () => !!fps,
    hint: 'Show a frames-per-second counter in the top left corner',
    run: () => {
      if (fps) {
        fps.remove();
        fps = null;
        window.clearInterval(fpsTimer);
        return;
      }
      const el = document.createElement('div');
      el.className = 'fps-counter';
      (document.getElementById('ui-root') ?? document.body).append(el);
      fps = el;
      const tick = (): void => {
        el.textContent = `${Math.round(game.loop.actualFps)} FPS`;
      };
      tick();
      fpsTimer = window.setInterval(tick, 500);
    },
  });
  // Rotate view (portrait phones): auto = rotate only on touch devices held upright; on/off force it (for testing on a desktop window)
  debug.register({
    id: 'screen.portrait',
    icon: 'swap',
    tab: 'Speed & View',
    section: 'Display',
    label: () => `Rotate view: ${getRotateMode()}`,
    on: () => getRotateMode() !== 'auto',
    hint: 'Turn the game 90 degrees so it fills a phone held upright: auto (touch devices only), on, off. Pointer input and all panels follow the rotation',
    run: () => setRotateMode(getRotateMode() === 'auto' ? 'on' : getRotateMode() === 'on' ? 'off' : 'auto'),
  });
  // Savaş arka planı: tüm arka planlar arasında dolaş (Quick Battle / multiplayer havuzları + sefer arka planları); savaş sürer
  const bgIds = (): string[] => [...new Set([...backgroundPool('quick'), ...backgroundPool('multiplayer'), 'castle-hall', 'kings-bridge'])];
  debug.register({
    id: 'screen.background',
    icon: 'frame',
    tab: 'Speed & View',
    section: 'Display',
    label: () => `Background: ${battle()?.backgroundId || '-'}`,
    hint: 'Cycle the battle background (Quick Battle pool, multiplayer pool, campaign ones). Quick Battle and multiplayer normally pick one from the battle seed',
    run: () => {
      const b = battle();
      if (!b) return;
      const ids = bgIds();
      b.debugSetBackground(ids[(ids.indexOf(b.backgroundId) + 1) % ids.length]!);
    },
  });
  for (const m of DAMAGE_MULTS) {
    debug.register({
      id: `tweak.damage.${m}`,
      icon: 'sword',
      tab: 'Rolls',
      section: 'Damage dealt (both sides)',
      label: m >= 1000 ? 'One-hit kill' : `${m}x`,
      on: () => debugState.flags.damageMult === m,
      hint: m >= 1000 ? 'Every hit kills (unless dodged or fully blocked)' : `All damage is multiplied by ${m}`,
      run: () => {
        debugState.flags.damageMult = m;
        applyFlags();
      },
    });
  }
  debug.register({
    id: 'tweak.damage-ohk',
    dockOnly: true,
    tab: 'Rolls',
    section: 'Quick',
    dock: { group: 'Rolls', order: 0, icon: 'sword', short: 'Damage', on: () => debugState.flags.damageMult > 1, state: () => (debugState.flags.damageMult >= 1000 ? 'Kill' : `${debugState.flags.damageMult}x`) },
    label: () => (debugState.flags.damageMult > 1 ? `Damage: ${debugState.flags.damageMult >= 1000 ? 'one-hit kill' : `${debugState.flags.damageMult}x`}` : 'Damage: 1x'),
    hint: 'Tap to cycle the damage multiplier for both sides: 1x, 10x, one-hit kill',
    run: () => {
      debugState.flags.damageMult = nextInCycle(DAMAGE_MULTS, debugState.flags.damageMult as (typeof DAMAGE_MULTS)[number]);
      applyFlags();
    },
  });
  for (const v of ['auto', 'always', 'never'] as const) {
    debug.register({
      id: `tweak.crit.${v}`,
      icon: 'burst',
      tab: 'Rolls',
      section: 'Critical hits',
      label: v === 'auto' ? 'Crit: normal' : v === 'always' ? 'Always crit' : 'Never crit',
      on: () => debugState.flags.crit === v,
      run: () => {
        debugState.flags.crit = v;
        applyFlags();
      },
    });
    debug.register({
      id: `tweak.dodge.${v}`,
      icon: 'feather',
      tab: 'Rolls',
      section: 'Dodging (physical hits)',
      label: v === 'auto' ? 'Dodge: normal' : v === 'always' ? 'Always dodge' : 'Never dodge',
      on: () => debugState.flags.dodge === v,
      run: () => {
        debugState.flags.dodge = v;
        applyFlags();
      },
    });
  }
  for (const v of ['auto', 'always'] as const) {
    debug.register({
      id: `tweak.miss.${v}`,
      icon: 'arrow',
      tab: 'Rolls',
      section: 'Misses (attacker misses)',
      label: v === 'auto' ? 'Miss: normal' : 'Always miss',
      hint: v === 'auto' ? 'Misses follow the accuracy rule' : 'Every damaging hit misses: a pale MISS appears above the attacker (Always dodge wins if both are on)',
      on: () => (debugState.flags.miss ?? 'auto') === v,
      run: () => {
        debugState.flags.miss = v;
        applyFlags();
      },
    });
  }
  debug.register({
    id: 'tweak.crit-cycle',
    dockOnly: true,
    tab: 'Rolls',
    section: 'Quick',
    dock: { group: 'Rolls', order: 1, icon: 'burst', short: 'Crit', on: () => debugState.flags.crit !== 'auto', state: () => FORCE_LABEL[debugState.flags.crit] },
    label: () => `Crit: ${FORCE_LABEL[debugState.flags.crit]}`,
    hint: 'Tap to cycle critical hits: normal, always, never',
    run: () => {
      debugState.flags.crit = nextInCycle(['auto', 'always', 'never'] as const, debugState.flags.crit);
      applyFlags();
    },
  });
  debug.register({
    id: 'tweak.dodge-cycle',
    dockOnly: true,
    tab: 'Rolls',
    section: 'Quick',
    dock: { group: 'Rolls', order: 2, icon: 'feather', short: 'Dodge', on: () => debugState.flags.dodge !== 'auto', state: () => FORCE_LABEL[debugState.flags.dodge] },
    label: () => `Dodge: ${FORCE_LABEL[debugState.flags.dodge]}`,
    hint: 'Tap to cycle dodging: normal, always, never',
    run: () => {
      debugState.flags.dodge = nextInCycle(['auto', 'always', 'never'] as const, debugState.flags.dodge);
      applyFlags();
    },
  });

  debug.register({
    id: 'tweak.miss-cycle',
    dockOnly: true,
    tab: 'Rolls',
    section: 'Quick',
    dock: { group: 'Rolls', order: 3, icon: 'arrow', short: 'Miss', on: () => (debugState.flags.miss ?? 'auto') !== 'auto', state: () => ((debugState.flags.miss ?? 'auto') === 'auto' ? 'Auto' : 'Always') },
    label: () => `Miss: ${(debugState.flags.miss ?? 'auto') === 'auto' ? 'Auto' : 'Always'}`,
    hint: 'Tap to toggle misses: automatic (accuracy rule) or always (a pale MISS above the attacker)',
    run: () => {
      debugState.flags.miss = (debugState.flags.miss ?? 'auto') === 'auto' ? 'always' : 'auto';
      applyFlags();
    },
  });

  // ===== Tools: shortcuts to the tab / page that holds each tool =====
  const shortcut = (id: string, order: number, icon: string, short: string, tab: string, hint: string): void =>
    debug.register({ id, dockOnly: true, tab, section: 'Tools', dock: { group: 'Tools', order, icon, short }, label: short, hint, run: () => debug.openTab(tab) });
  shortcut('tools.skills', 0, 'wand', 'Cast skill', 'Skills', 'Open the Skills tab: cast any skill from a chosen unit onto a chosen cell of the running battle without spending a turn (animations and sounds themselves are in the wiki under Assets)');
  for (const [id, victory, short] of [['tools.result-victory', true, 'Preview victory'], ['tools.result-defeat', false, 'Preview defeat']] as const) {
    debug.register({
      id,
      icon: victory ? 'helm' : 'skull',
      tab: 'Battle',
      section: 'Result screens',
      label: short,
      hint: `Show the ${victory ? 'VICTORY' : 'DEFEAT'} screen with the stats so far, without ending the battle (Esc or Enter closes it)`,
      run: () => battle()?.showResult(victory, true),
    });
  }
  // Match record (every move + AI reasons) to the clipboard: paste it to ask "why did unit X do move Y?" (src/engine/match-log.ts, docs/design/match-log.md)
  debug.register({
    id: 'tools.copy-match',
    tab: 'Data',
    section: 'Match record',
    dock: { group: 'Tools', order: 2, icon: 'clipboard', short: 'Copy match data' },
    label: 'Copy match data',
    hint: 'Copy the match record to the clipboard: every move so far with the state before it, the result, and for AI moves all candidates with their scores and why one was chosen. Works mid-battle and in test mode',
    run: () => void copyMatchData({ get: () => battle()?.matchLogData() ?? null }),
  });
  debug.register({
    id: 'tools.fullscreen',
    icon: 'fullscreen',
    tab: 'Speed & View',
    section: 'Display',
    label: 'Fullscreen',
    on: () => isFullscreen(),
    hint: 'Toggle full screen (hides the browser address bar; landscape is locked where the browser allows it)',
    run: () => void toggleFullscreen(),
  });
  shortcut('tools.seed', 3, 'clover', 'Seed & link', 'Setup', "Open the Setup tab: copy this battle's seed or link, or restart with a typed seed");


  // ===== Test Mode: test-mode battle + unlimited resources + custom teams =====
  const applyTestSwitches = (): void => {
    const b = battle();
    if (!b) return;
    b.battle.freeMp = BattleScene.freeMp;
    b.battle.freeRage = testMode.unlimitedRage;
    b.battle.noCooldowns = testMode.noCooldowns;
    b.refreshCommandsNow();
  };
  const setMode = (mode: 'test' | 'turns'): void => {
    const b = battle();
    if (b && b.mode !== mode) b.scene.restart({ seed: b.seed, mode }); // same seed and teams, only the mode changes
  };
  // Opening the tab changes nothing; the first time the Test mode button turns it on, all three switches turn on too
  // (afterwards the switches below are yours to change)
  const enableTestMode = (): void => {
    if (!testMode.autoEnabled) {
      testMode.autoEnabled = true;
      BattleScene.freeMp = true;
      setTestSwitches(true);
      applyTestSwitches();
    }
    setMode('test');
  };
  // Turning Test mode off also turns the unlimited switches off, so normal battles keep their cooldowns, MP and Rage costs
  const disableTestMode = (): void => {
    testMode.autoEnabled = false;
    BattleScene.freeMp = false;
    setTestSwitches(false);
    applyTestSwitches();
    setMode('turns');
  };
  debug.register({
    id: 'test.enable',
    icon: 'flask',
    tab: 'Test Mode',
    section: 'Test Mode',
    label: () => (battle()?.mode === 'test' ? 'Test mode: on' : 'Test mode: off'),
    on: () => battle()?.mode === 'test',
    hint: 'On: no turn order, every unit can act at any time, unlimited MP/Rage and no cooldowns (the battle restarts with the same teams). Off: normal turn-based battle with normal costs and cooldowns',
    run: () => (battle()?.mode === 'test' ? disableTestMode() : enableTestMode()),
  });
  debug.register({
    id: 'test.unlimited-mp',
    icon: 'freemp',
    tab: 'Test Mode',
    section: 'Switches',
    label: () => (BattleScene.freeMp ? 'Unlimited MP: on' : 'Unlimited MP: off'),
    on: () => BattleScene.freeMp,
    hint: 'Skills cost no mana (both sides); the same switch as Battle > Free MP',
    run: () => {
      BattleScene.freeMp = !BattleScene.freeMp;
      applyTestSwitches();
    },
  });
  debug.register({
    id: 'test.unlimited-rage',
    icon: 'rage',
    tab: 'Test Mode',
    section: 'Switches',
    label: () => (testMode.unlimitedRage ? 'Unlimited Rage: on' : 'Unlimited Rage: off'),
    on: () => testMode.unlimitedRage,
    hint: 'Rage skills (Abyssal Cry) cost no Rage and need none (both sides)',
    run: () => {
      testMode.unlimitedRage = !testMode.unlimitedRage;
      applyTestSwitches();
    },
  });
  debug.register({
    id: 'test.no-cooldowns',
    icon: 'hourglass',
    tab: 'Test Mode',
    section: 'Switches',
    label: () => (testMode.noCooldowns ? 'No cooldowns: on' : 'No cooldowns: off'),
    on: () => testMode.noCooldowns,
    hint: 'Cooldowns never run: every skill is always ready, also in turn mode (both sides)',
    run: () => {
      testMode.noCooldowns = !testMode.noCooldowns;
      applyTestSwitches();
    },
  });
  debug.registerPanel({
    id: 'panel.test-teams',
    tab: 'Test Mode',
    render: (el, refresh) => {
      const side = testMode.side;
      const team = testMode.teams[side];
      const sideName = (s: TestSide): string => (s === 'party' ? 'Allies' : 'Enemies');
      const classOf = (id: string) => content.classes[id];
      el.append(heading('Teams'));
      el.append(
        row(
          ...(['party', 'enemies'] as const).map((s) =>
            debugButton(`${sideName(s)} (${testMode.teams[s].length})`, () => {
              testMode.side = s;
              testMode.slot = null;
              refresh();
            }, { icon: s === 'party' ? 'team' : 'skull', on: side === s, className: `sidebtn ${s}`, title: `Edit the ${sideName(s).toLowerCase()} team of the test battle` }),
          ),
        ),
      );
      // The slots of the edited side: tap one, then tap a class below to replace it
      const slots = team.map((id, i) => {
        const def = classOf(id);
        return debugButton(def?.name ?? id, () => {
          testMode.slot = testMode.slot === i ? null : i;
          refresh();
        }, { icon: def?.logo ?? 'helm', ...(def ? { accent: def.color } : {}), className: `slot${testMode.slot === i ? ' sel' : ''}`, on: testMode.slot === i, title: `${sideName(side)} slot ${i + 1}: ${def?.name ?? id}. Tap to select it, then pick a class below to replace it` });
      });
      const grid = document.createElement('div');
      grid.className = 'debug-slots';
      grid.append(...slots);
      el.append(grid);
      const edit = (r: { team: string[]; slot: number | null }): void => {
        testMode.teams[side] = r.team;
        testMode.slot = r.slot;
        refresh();
      };
      el.append(
        row(
          debugButton('Remove', () => edit(removeSlot(team, testMode.slot ?? team.length - 1)), { icon: 'skull', title: 'Remove the selected slot (or the last one); a team keeps at least 1 unit' }),
          debugButton('Smaller', () => edit({ team: resizeTeam(team, team.length - 1), slot: null }), { icon: 'arrow', title: 'Team size - 1' }),
          debugButton('Bigger', () => edit({ team: resizeTeam(team, clampTeam(team.length + 1)), slot: null }), { icon: 'next', title: 'Team size + 1 (up to the board size)' }),
          debugButton('Random', () => edit({ team: content.randomTeam(newSeed(), team.length), slot: null }), { icon: 'dice', title: 'Fill this team with random different classes (same size)' }),
        ),
      );
      // Class palette
      el.append(heading(testMode.slot !== null ? `Pick a class for slot ${testMode.slot + 1}` : 'Pick a class to add'));
      el.append(
        row(
          ...testClassIds().map((id) => {
            const def = classOf(id)!;
            return debugButton(def.name, () => edit(placeClass(team, testMode.slot, id)), { icon: def.logo, accent: def.color, title: `${def.name}: ${testMode.slot !== null ? 'replaces the selected slot' : 'added to the end of the team'}` });
          }),
        ),
      );
      el.append(
        row(
          debugButton('Start test battle', () => {
            const data = buildTestBattleData(testMode.teams, newSeed());
            const b = battle();
            if (b) b.scene.restart(data);
            else game.scene.getScenes(true)[0]?.scene.start(BattleScene.KEY, data);
          }, { icon: 'flask', className: 'good', title: `Start a test-mode battle with exactly these teams (${testMode.teams.party.length} vs ${testMode.teams.enemies.length}); the switches above apply` }),
        ),
      );
      const note = noteLineText(`Default size ${DEFAULT_TEST_SIZE} per side; up to ${content.CELL_COUNT}. Units are placed on the board automatically (tanks in front).`);
      note.classList.add('dim');
      el.append(note);
    },
  });

  // ===== Characters: look variants (assets/sprites/<id>/idle-<variant>.png; src/game/sprite-variants.ts) =====
  debug.registerPanel({
    id: 'panel.characters',
    tab: 'Characters',
    render: (el, refresh) => {
      const ids = Object.keys(SPRITE_VARIANTS).sort();
      if (ids.length === 0) {
        el.append(noteLineText('No character has alternative looks yet'));
        return;
      }
      for (const id of ids) {
        const def = Object.values(content.classes).find((c) => c.spriteId === id) ?? Object.values(content.summons).find((c) => c.spriteId === id);
        const name = def?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
        const current = getSpriteVariant(id) ?? DEFAULT_VARIANT;
        const buttons = [DEFAULT_VARIANT, ...SPRITE_VARIANTS[id]!].map((v) =>
          debugButton(variantLabel(id, v), () => {
            setSpriteVariant(id, v === DEFAULT_VARIANT ? null : v);
            refresh();
          }, { icon: 'team', on: current === v, title: `${name} look: ${variantLabel(id, v)}${v === DEFAULT_VARIANT ? ' (default)' : ''}` }),
        );
        el.append(...debugSection(`${name} look`, ...buttons));
      }
      const note = noteLineText('Saved in this browser. Applies from the next battle or Team Select screen (use Restart battle); the wiki updates after the page is reloaded.');
      note.classList.add('dim');
      el.append(note);
    },
  });

  // ===== Versions: art & sound version per class (v1 current / v2 redesign; src/game/asset-versions.ts, src/ui/debug-versions.ts) =====
  registerVersionsPanel(debug, {
    refreshBattle: () => battle()?.refreshCommandsNow(),
    restartBattle: () => {
      const b = battle();
      if (!b) return false;
      b.scene.restart({ seed: b.seed });
      return true;
    },
  });

  // ===== Info (Data tab) =====
  debug.registerInfo('units', () =>
    Object.fromEntries(
      (battle()?.battle?.combatants ?? []).map((c) => [
        `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.summoned ? ' (summon)' : ''}`,
        [
          c.hp <= 0 ? 'DEAD' : `HP ${c.hp}/${c.maxHp}`,
          `MP ${c.mp}/${c.maxMp}`,
          c.maxRage !== undefined ? `Rage ${c.rage ?? 0}/${c.maxRage}` : '',
          `STR ${c.stats.str} DEX ${c.stats.dex} INT ${c.stats.int} LCK ${c.stats.luck}`,
          c.stats.primary ? `Primary: ${c.stats.primary.toUpperCase()}${c.stats.primaryActive ? "" : " (inactive)"}` : "",
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
      'Debug tweaks': tweaksSummary(debugState, BattleScene.freeMp, testModeSummary(testMode)),
      Version: __APP_VERSION__,
      'Build time': new Date(__BUILD_TIME__).toLocaleString('en-GB'),
      'Game resolution': `${Math.round(stageView.viewW)} x ${layout.height} (logical; base ${layout.width})`,
      'Canvas (real px)': `${stageView.canvasW} x ${stageView.canvasH} (render x${stageView.zoom.toFixed(2)})`,
      'On-screen size': `${Math.round(game.scale.displaySize.width)} x ${Math.round(game.scale.displaySize.height)}`,
      'Window (CSS px)': `${window.innerWidth} x ${window.innerHeight}`,
    };
  });
}

function noteLineText(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'debug-note';
  el.textContent = text;
  return el;
}
