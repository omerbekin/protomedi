/**
 * Debug menüsünün içeriği: sekmeler, düğmeler ve paneller (birim araçları, skill galerisi, ses listesi, seed, hız...).
 * Dock'taki (altta bölümlü hızlı düğmeler) her düğme: bölüm + ikon + kısa yazı + hint. Yeni eylem eklerken bir bölüme koy (src/ui/debug-layout.ts DOCK_GROUPS).
 * Sahneye yalnızca BattleScene'in debug* yöntemleri ve motorun debug* yöntemleri üzerinden dokunur; oyun kuralı burada yoktur.
 */
import type Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { content, TARGET_TEXT } from '../engine';
import type { Combatant } from '../engine';
import { audioSettings, playSfxOn, SFX_IDS } from '../game/audio';
import {
  DAMAGE_MULTS,
  debugState,
  groupSkillsByOwner,
  nextInCycle,
  parseSeed,
  resourceValue,
  sfxLabel,
  SPEEDS,
  speedLabel,
  STATUS_TURNS,
  tweaksSummary,
  type ResourcePreset,
} from '../game/debug-state';
import { BattleScene } from '../game/scenes/BattleScene';
import { newSeed } from '../game/seed';
import { debugButton, debugSection, type DebugMenu } from './debug-menu';
import { copyMatchData } from './match-copy';

/** Sekme sırası (menü bu sırayla gösterir). */
export const DEBUG_TABS = ['Battle', 'Unit', 'Skills', 'Sounds', 'Tweaks', 'Info'];

interface Ctx {
  game: Phaser.Game;
  debug: DebugMenu;
}

let fps: HTMLDivElement | null = null;
let fpsTimer = 0;
let forcePortrait = false;
/** Seed giriş kutusunun taslağı (menü yenilense de kaybolmasın). */
let seedDraft = '';
let hpDraft = '';
let mpDraft = '';
let rageDraft = '';

const FORCE_LABEL = { auto: 'Normal', always: 'Always', never: 'Never' } as const;

/** Opens the asset gallery page in a new tab (relative URL: works on the dev server and in the build). */
function openAssetGallery(): void {
  window.open('./gallery.html', '_blank', 'noopener');
}

/** Panellerin üstünde kısa bilgi/hata satırı (bir sonraki işleme kadar kalır). */
const notes = new Map<string, string>();

function noteLine(panel: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'debug-note';
  el.textContent = notes.get(panel) ?? '';
  el.hidden = !notes.get(panel);
  return el;
}

const heading = (text: string): HTMLElement => {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
};

const row = (...children: HTMLElement[]): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'debug-grid';
  el.append(...children);
  return el;
};

export function registerDebugTools({ game, debug }: Ctx): void {
  /** The battle scene, only while a battle is actually running (not on the team selection screen). */
  const battle = (): BattleScene | null => (game.scene.isActive(BattleScene.KEY) ? (game.scene.getScene(BattleScene.KEY) as BattleScene) : null);
  const applyFlags = (): void => {
    const b = battle();
    if (b) Object.assign(b.battle.debug, debugState.flags);
  };
  const applyTiming = (): void => battle()?.applyDebugTiming();
  const audioCtx = (): AudioContext | undefined => (game.sound as unknown as { context?: AudioContext }).context;

  // ===== Battle =====
  debug.register({
    id: 'scene.team-select',
    tab: 'Battle',
    section: 'Battle',
    dock: { group: 'Battle flow', order: 2, icon: 'team', short: 'Team select' },
    label: 'Team select',
    hint: 'Go back to the team selection screen to pick new classes',
    run: () => battle()?.goToTeamSelect(),
  });
  debug.register({
    id: 'mode.toggle',
    tab: 'Battle',
    section: 'Battle',
    dock: { group: 'Battle flow', order: 3, icon: 'flask', short: 'Mode', on: () => battle()?.mode === 'test', state: () => (battle()?.mode === 'test' ? 'Test' : 'Turns') },
    label: () => (battle()?.mode === 'test' ? 'Mode: Test' : 'Mode: Turns'),
    hint: 'Switch between turn-based and test mode (no turn order, any unit can act); restarts the battle',
    run: () => {
      const b = battle();
      if (b) b.scene.restart({ seed: newSeed(), mode: b.mode === 'test' ? 'turns' : 'test' });
    },
  });
  debug.register({
    id: 'battle.random',
    tab: 'Battle',
    section: 'Battle',
    dock: { group: 'Battle flow', order: 1, icon: 'dice', short: 'New teams' },
    label: 'New teams',
    hint: 'Start a new battle with random teams and a new seed',
    run: () => battle()?.scene.restart({ seed: newSeed(), teams: undefined }),
  });
  // Geometer (aoe_tester) test battle: player team = Geometer + 4 random classes, 5 random enemies, test mode (no turn order, no cooldowns)
  debug.register({
    id: 'battle.test-aoe',
    tab: 'Battle',
    section: 'Battle',
    dock: { group: 'Battle flow', order: 9, icon: 'blast', short: 'Test AOE shapes' },
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
  debug.register({
    id: 'battle.rematch',
    tab: 'Battle',
    section: 'Battle',
    label: 'Rematch',
    hint: 'Start a new battle with the same teams but a new seed',
    run: () => battle()?.scene.restart({ seed: newSeed() }),
  });
  debug.register({
    id: 'battle.restart-same',
    tab: 'Battle',
    section: 'Battle',
    dock: { group: 'Battle flow', order: 0, icon: 'restart', short: 'Restart battle' },
    label: 'Restart battle',
    hint: 'Restart the battle from the beginning with the same seed and teams',
    run: () => battle()?.scene.restart({ seed: battle()?.seed }),
  });
  debug.register({
    id: 'battle.skip-turn',
    tab: 'Battle',
    section: 'Turn',
    dock: { group: 'Battle flow', order: 4, icon: 'next', short: 'Skip turn' },
    label: 'Skip turn',
    hint: "Skip the current unit's turn",
    run: () => battle()?.skipCurrentTurn(),
  });
  debug.register({
    id: 'battle.cycle-actor',
    tab: 'Battle',
    section: 'Turn',
    dock: {
      group: 'Units',
      order: 4,
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
    section: 'Control',
    dock: { group: 'Battle flow', order: 5, icon: 'robot', short: 'Auto-play', on: () => !!battle()?.autoPlay },
    label: () => (battle()?.autoPlay ? 'Auto-play: on' : 'Auto-play: off'),
    on: () => !!battle()?.autoPlay,
    hint: 'Let the AI play your own party turns',
    run: () => battle()?.toggleAutoPlay(),
  });
  debug.register({
    id: 'battle.free-mp',
    tab: 'Battle',
    section: 'Control',
    dock: { group: 'Combat tweaks', order: 4, icon: 'freemp', short: 'Free MP', on: () => BattleScene.freeMp },
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
    tab: 'Battle',
    section: 'Control',
    dock: { group: 'Combat tweaks', order: 5, icon: 'helm', short: 'Enemy AI', on: () => debugState.enemyAiOff, state: () => (debugState.enemyAiOff ? 'OFF' : 'ON') },
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
    tab: 'Battle',
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
      inputRow.append(input, debugButton('Start', start, { title: 'Restart the battle (same teams) with this seed' }));
      el.append(
        heading('Seed'),
        row(
          debugButton(`Seed: ${seed ?? '-'}`, () => seed !== undefined && void copy(String(seed), 'Seed'), { title: 'Click to copy the seed' }),
          debugButton('Copy link', () => seed !== undefined && void copy(`${window.location.origin}${window.location.pathname}?seed=${seed}`, 'Link'), { title: 'Copy a link that opens this exact battle' }),
        ),
        inputRow,
        note,
      );
      const ver = document.createElement('div');
      ver.className = 'debug-note dim';
      ver.textContent = `Version ${__APP_VERSION__} - built ${new Date(__BUILD_TIME__).toLocaleString('en-GB')}`;
      el.append(ver);
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
      const act = (fn: (u: Combatant) => { ok: boolean; reason?: string } | void): (() => void) => () => {
        const u = scene.debugUnit;
        if (!u) return;
        const r = fn(u);
        notes.set('unit', r && !r.ok ? (r.reason ?? 'Not possible') : '');
        scene.debugAfterChange();
        refresh();
      };
      const team = (fn: () => void): (() => void) => () => {
        fn();
        notes.set('unit', '');
        scene.debugAfterChange();
        refresh();
      };

      // Unit picker
      const chips = scene.debugUnits().map((c) => {
        const btn = debugButton(`${c.name}${c.summoned ? '*' : ''}`, () => {
          scene.debugUnitUid = c.uid;
          refresh();
        }, { on: unit?.uid === c.uid, className: `chip ${c.side}${c.hp <= 0 ? ' dead' : ''}`, title: `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.hp <= 0 ? ' (dead)' : ''}` });
        return btn;
      });
      el.append(heading('Unit (tools apply to the highlighted one)'), row(...chips));
      if (unit) {
        const line = document.createElement('div');
        line.className = 'debug-note dim';
        line.textContent = `${unit.side === 'party' ? 'Player' : 'Enemy'} ${unit.name}: ${unit.hp <= 0 ? 'DEAD' : `HP ${unit.hp}/${unit.maxHp}, MP ${unit.mp}/${unit.maxMp}${unit.maxRage !== undefined ? `, Rage ${unit.rage ?? 0}/${unit.maxRage}` : ''}`}`;
        el.append(line);
      }
      el.append(noteLine('unit'));

      const hp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'hp', resourceValue(u.maxHp, preset))));
      const mp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'mp', resourceValue(u.maxMp, preset))));
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
        wrap.append(input, debugButton('Set', go));
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
          debugButton('Kill', act((u) => b.debugKill(u.uid))),
          debugButton('Revive', act((u) => b.debugRevive(u.uid))),
          debugButton('Clear cooldowns', act((u) => b.debugClearCooldowns(u.uid)), { title: 'Reset all skill cooldowns of this unit' }),
          debugButton('Clear status', act((u) => b.debugClearStatuses(u.uid)), { title: 'Remove statuses and shields from this unit' }),
        ),
      );

      const statusButtons = Object.entries(content.statuses).map(([kind, def]) =>
        debugButton(def.name, act((u) => b.debugAddStatus(u.uid, kind, STATUS_TURNS)), { title: `${def.text} (${STATUS_TURNS} turns)`, className: def.type === 'debuff' ? 'bad' : 'good' }),
      );
      el.append(...debugSection('Add status', ...statusButtons));

      const healSide = (side: 'party' | 'enemy'): void => {
        for (const c of b.combatants) if (c.side === side && c.hp <= 0 && !c.summoned) b.debugRevive(c.uid);
        b.debugFill(side);
      };
      const killSide = (side: 'party' | 'enemy'): void => {
        for (const c of b.living(side)) b.debugKill(c.uid);
      };
      el.append(
        ...debugSection(
          'Teams',
          debugButton('Heal my team', team(() => healSide('party')), { title: 'Revive and fully restore HP and MP of all your units', icon: 'heart' }),
          debugButton('Heal enemies', team(() => healSide('enemy')), { title: 'Revive and fully restore all enemies' }),
          debugButton('Clear all cooldowns', team(() => b.debugClearCooldowns()), { title: 'Reset every unit\'s cooldowns' }),
          debugButton('Revive everyone', team(() => b.debugReviveAll())),
          debugButton('Kill enemies', team(() => killSide('enemy')), { title: 'Kill all enemies (you win)', icon: 'skull' }),
          debugButton('Kill my team', team(() => killSide('party')), { title: 'Kill all your units (you lose)' }),
        ),
      );
    },
  });
  debug.register({
    id: 'unit.heal-team',
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Units', order: 0, icon: 'heart', short: 'Heal my team' },
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
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Units', order: 2, icon: 'skull', short: 'Kill enemies' },
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
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Units', order: 1, icon: 'ankh', short: 'Revive everyone' },
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
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Units', order: 3, icon: 'rune', short: 'Clear all cooldowns' },
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
    id: 'unit.set-rage',
    dockOnly: true,
    tab: 'Unit',
    section: 'Quick',
    dock: { group: 'Units', order: 6, icon: 'flame', short: 'Set rage' },
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
    dock: { group: 'Units', order: 5, icon: 'muscle', short: 'Unit tools' },
    label: 'Unit tools',
    hint: 'Open the Unit tab: pick one unit, then set HP/MP, kill, revive or add a status',
    run: () => debug.openTab('Unit'),
  });

  // ===== Skills (gallery) =====
  let galleryMsg = '';
  debug.registerPanel({
    id: 'panel.gallery',
    tab: 'Skills',
    render: (el, refresh) => {
      const scene = battle();
      if (!scene) {
        el.append(noteLineText('Start a battle to use the skill gallery'));
        return;
      }
      const caster = scene.galleryActor;
      const living = scene.debugUnits().filter((c) => c.hp > 0);
      const intro = noteLineText('Tap a skill to play it (animation and sound) from the caster onto the target. Cost, cooldown, range and turn order are ignored.');
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
          debugButton(`Caster: ${caster ? `${caster.side === 'enemy' ? 'Enemy ' : ''}${caster.name}` : '-'}`, changeCaster, { title: 'Tap to switch to the next unit' }),
          debugButton(debugState.galleryReset ? 'Reset after: on' : 'Reset after: off', () => {
            debugState.galleryReset = !debugState.galleryReset;
            refresh();
          }, { on: debugState.galleryReset, title: 'On: after each cast everything goes back (dead revived, summons removed, full HP/MP). Off: effects stay.' }),
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

  // ===== Sounds =====
  debug.registerPanel({
    id: 'panel.asset-gallery-link',
    tab: 'Sounds',
    render: (el) => {
      el.append(
        ...debugSection('Asset gallery', debugButton('Open Asset Gallery', openAssetGallery, { icon: 'frame', title: 'Open the asset gallery (sounds, icons and more) in a new browser tab' })),
        noteLineText('The full sound list is also in the asset gallery. These buttons play the same sounds.'),
      );
    },
  });
  debug.registerPanel({
    id: 'panel.sounds',
    tab: 'Sounds',
    render: (el, refresh) => {
      const note = noteLine('sound');
      const users = new Map<string, string[]>();
      for (const s of Object.values(content.skills)) for (const k of s.sfx ?? []) users.set(k, [...(users.get(k) ?? []), s.name]);
      const buttons = SFX_IDS.map((id) =>
        debugButton(sfxLabel(id), () => {
          notes.set('sound', audioSettings.enabled && audioSettings.volume > 0 ? '' : 'Sound is muted (volume 0 in settings, top right)');
          playSfxOn(audioCtx(), id);
          refresh();
        }, { title: users.has(id) ? `Used by: ${users.get(id)!.join(', ')}` : 'Not used by any skill' }),
      );
      el.append(...debugSection(`All sounds (${SFX_IDS.length})`, ...buttons), note);
    },
  });

  // ===== Tweaks =====
  for (const sp of SPEEDS) {
    debug.register({
      id: `tweak.speed.${sp}`,
      tab: 'Tweaks',
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
    tab: 'Tweaks',
    section: 'Animation speed',
    dock: { group: 'Battle flow', order: 7, icon: 'hourglass', short: 'Speed', on: () => debugState.speed !== 1, state: () => speedLabel(debugState.speed) },
    label: () => `Speed: ${speedLabel(debugState.speed)}`,
    hint: 'Tap to cycle the animation speed (0.25x, 0.5x, 1x, 2x, 4x)',
    run: () => {
      debugState.speed = nextInCycle(SPEEDS, debugState.speed as (typeof SPEEDS)[number]);
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.skip',
    tab: 'Tweaks',
    section: 'Animation speed',
    dock: { group: 'Battle flow', order: 8, icon: 'ffwd', short: 'Skip anims', on: () => debugState.skipAnims },
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
    tab: 'Tweaks',
    section: 'Animation speed',
    dock: { group: 'Battle flow', order: 6, icon: 'pause', short: 'Pause', on: () => debugState.paused },
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
    tab: 'Tweaks',
    section: 'Display',
    dock: { group: 'View', order: 2, icon: 'eye', short: 'Hide numbers', on: () => debugState.hideNumbers },
    label: () => (debugState.hideNumbers ? 'Hide numbers: on' : 'Hide numbers: off'),
    on: () => debugState.hideNumbers,
    hint: 'Hide the damage and heal numbers floating above units',
    run: () => {
      debugState.hideNumbers = !debugState.hideNumbers;
    },
  });
  debug.register({
    id: 'battle.slots',
    tab: 'Tweaks',
    section: 'Display',
    dock: { group: 'View', order: 3, icon: 'frame', short: 'Show slots', on: () => !!battle()?.showSlots },
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
    tab: 'Tweaks',
    section: 'Display',
    dock: { group: 'View', order: 4, icon: 'info', short: 'Show FPS', on: () => !!fps },
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
      document.body.append(el);
      fps = el;
      const tick = (): void => {
        el.textContent = `${Math.round(game.loop.actualFps)} FPS`;
      };
      tick();
      fpsTimer = window.setInterval(tick, 500);
    },
  });
  debug.register({
    id: 'screen.portrait',
    tab: 'Tweaks',
    section: 'Display',
    dock: { group: 'View', order: 5, icon: 'swap', short: 'Force portrait', on: () => forcePortrait },
    label: () => (forcePortrait ? 'Force portrait: on' : 'Force portrait: off'),
    on: () => forcePortrait,
    hint: 'Show the "rotate your phone" notice as if the screen were upright',
    run: () => {
      forcePortrait = !forcePortrait;
      document.body.classList.toggle('force-portrait', forcePortrait);
    },
  });
  for (const m of DAMAGE_MULTS) {
    debug.register({
      id: `tweak.damage.${m}`,
      tab: 'Tweaks',
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
    tab: 'Tweaks',
    section: 'Quick',
    dock: { group: 'Combat tweaks', order: 0, icon: 'sword', short: 'Damage', on: () => debugState.flags.damageMult > 1, state: () => (debugState.flags.damageMult >= 1000 ? 'Kill' : `${debugState.flags.damageMult}x`) },
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
      tab: 'Tweaks',
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
      tab: 'Tweaks',
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
      tab: 'Tweaks',
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
    tab: 'Tweaks',
    section: 'Quick',
    dock: { group: 'Combat tweaks', order: 1, icon: 'burst', short: 'Crit', on: () => debugState.flags.crit !== 'auto', state: () => FORCE_LABEL[debugState.flags.crit] },
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
    tab: 'Tweaks',
    section: 'Quick',
    dock: { group: 'Combat tweaks', order: 2, icon: 'feather', short: 'Dodge', on: () => debugState.flags.dodge !== 'auto', state: () => FORCE_LABEL[debugState.flags.dodge] },
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
    tab: 'Tweaks',
    section: 'Quick',
    dock: { group: 'Combat tweaks', order: 3, icon: 'arrow', short: 'Miss', on: () => (debugState.flags.miss ?? 'auto') !== 'auto', state: () => ((debugState.flags.miss ?? 'auto') === 'auto' ? 'Auto' : 'Always') },
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
  shortcut('tools.skills', 0, 'wand', 'Skill preview', 'Skills', 'Open the Skills tab: play any skill animation and sound on a target without spending a turn');
  shortcut('tools.sounds', 1, 'speaker', 'Sounds', 'Sounds', 'Open the Sounds tab: listen to every sound effect');
  debug.register({
    id: 'tools.asset-gallery',
    dockOnly: true,
    tab: 'Sounds',
    section: 'Tools',
    dock: { group: 'Tools', order: 2, icon: 'frame', short: 'Asset gallery' },
    label: 'Asset gallery',
    hint: 'Open the asset gallery page (sounds, icons and more) in a new browser tab',
    run: openAssetGallery,
  });
  for (const [id, victory, order, icon, short] of [['tools.result-victory', true, 5, 'sword', 'Preview victory'], ['tools.result-defeat', false, 6, 'skull', 'Preview defeat']] as const) {
    debug.register({
      id,
      dockOnly: true,
      tab: 'Battle',
      section: 'Tools',
      dock: { group: 'Tools', order, icon, short },
      label: short,
      hint: `Show the ${victory ? 'VICTORY' : 'DEFEAT'} screen with the stats so far, without ending the battle (Esc or Enter closes it)`,
      run: () => battle()?.showResult(victory, true),
    });
  }
  // Match record (every move + AI reasons) to the clipboard: paste it to ask "why did unit X do move Y?" (src/engine/match-log.ts, docs/design/match-log.md)
  debug.register({
    id: 'tools.copy-match',
    dockOnly: true,
    tab: 'Battle',
    section: 'Tools',
    dock: { group: 'Tools', order: 7, icon: 'clipboard', short: 'Copy match data' },
    label: 'Copy match data',
    hint: 'Copy the match record to the clipboard: every move so far with the state before it, the result, and for AI moves all candidates with their scores and why one was chosen. Works mid-battle and in test mode',
    run: () => void copyMatchData({ get: () => battle()?.matchLogData() ?? null }),
  });
  shortcut('tools.seed', 3, 'clover', 'Seed & link', 'Battle', 'Open the Battle tab: copy this battle\'s seed or link, or restart with a typed seed');
  shortcut('tools.info', 4, 'info', 'Info', 'Info', 'Open the Info tab: live stats, turn queue and AI decisions');

  // ===== Info =====
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
      'Debug tweaks': tweaksSummary(debugState, BattleScene.freeMp),
      Version: __APP_VERSION__,
      'Build time': new Date(__BUILD_TIME__).toLocaleString('en-GB'),
      'Game resolution': `${layout.width} x ${layout.height}`,
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
