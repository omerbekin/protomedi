/**
 * Debug menüsünün içeriği: sekmeler, düğmeler ve paneller (birim araçları, skill galerisi, ses listesi, seed, hız...).
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
    dock: { row: 0, order: 1, icon: 'team' },
    label: 'Team select',
    hint: 'Back to the team selection screen',
    run: () => battle()?.goToTeamSelect(),
  });
  debug.register({
    id: 'mode.toggle',
    tab: 'Battle',
    section: 'Battle',
    dock: { row: 0, order: 0, icon: 'flask', on: () => battle()?.mode === 'test' },
    label: () => (battle()?.mode === 'test' ? 'Mode: Test' : 'Mode: Turns'),
    hint: 'Switch between turn-based and test mode (no turn order, any unit can act). Restarts the battle.',
    run: () => {
      const b = battle();
      if (b) b.scene.restart({ seed: newSeed(), mode: b.mode === 'test' ? 'turns' : 'test' });
    },
  });
  debug.register({
    id: 'battle.random',
    tab: 'Battle',
    section: 'Battle',
    dock: { row: 0, order: 2, icon: 'dice' },
    label: 'New teams',
    hint: 'Random teams, new seed',
    run: () => battle()?.scene.restart({ seed: newSeed(), teams: undefined }),
  });
  debug.register({
    id: 'battle.rematch',
    tab: 'Battle',
    section: 'Battle',
    label: 'Rematch',
    hint: 'Same teams, new seed',
    run: () => battle()?.scene.restart({ seed: newSeed() }),
  });
  debug.register({
    id: 'battle.restart-same',
    tab: 'Battle',
    section: 'Battle',
    label: 'Same seed',
    hint: 'Restart the battle with the same seed and teams',
    run: () => battle()?.scene.restart({ seed: battle()?.seed }),
  });
  debug.register({
    id: 'battle.skip-turn',
    tab: 'Battle',
    section: 'Turn',
    label: 'Skip turn',
    hint: "Skip the current unit's turn",
    run: () => battle()?.skipCurrentTurn(),
  });
  debug.register({
    id: 'battle.cycle-actor',
    tab: 'Battle',
    section: 'Turn',
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
    id: 'battle.autoplay',
    tab: 'Battle',
    section: 'Control',
    dock: { row: 1, order: 0, icon: 'robot', on: () => !!battle()?.autoPlay },
    label: () => (battle()?.autoPlay ? 'Auto: on' : 'Auto: off'),
    on: () => !!battle()?.autoPlay,
    hint: 'Let the AI play your party',
    run: () => battle()?.toggleAutoPlay(),
  });
  debug.register({
    id: 'battle.free-mp',
    tab: 'Battle',
    section: 'Control',
    dock: { row: 1, order: 1, icon: 'freemp', on: () => BattleScene.freeMp },
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
    label: () => (debugState.enemyAiOff ? 'Enemy AI: off' : 'Enemy AI: on'),
    on: () => debugState.enemyAiOff,
    hint: 'Off: enemies never act, their turns are skipped (turn mode)',
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
        line.textContent = `${unit.side === 'party' ? 'Player' : 'Enemy'} ${unit.name}: ${unit.hp <= 0 ? 'DEAD' : `HP ${unit.hp}/${unit.maxHp}, MP ${unit.mp}/${unit.maxMp}`}`;
        el.append(line);
      }
      el.append(noteLine('unit'));

      const hp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'hp', resourceValue(u.maxHp, preset))));
      const mp = (label: string, preset: ResourcePreset): HTMLElement => debugButton(label, act((u) => b.debugSetResource(u.uid, 'mp', resourceValue(u.maxMp, preset))));
      el.append(...debugSection('Health', hp('HP 1', 'one'), hp('HP 25%', 'quarter'), hp('HP 50%', 'half'), hp('HP full', 'full')));
      el.append(...debugSection('Mana', mp('MP 0', 'zero'), mp('MP 50%', 'half'), mp('MP full', 'full')));

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
    dock: { row: 1, order: 3, icon: 'heart' },
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
    dock: { row: 1, order: 4, icon: 'skull' },
    label: 'Kill enemies',
    hint: 'Kill all enemies (you win)',
    run: () => {
      const s = battle();
      if (!s) return;
      for (const c of s.battle.living('enemy')) s.battle.debugKill(c.uid);
      s.debugAfterChange();
    },
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
    dock: { row: 0, order: 3, icon: 'hourglass', on: () => debugState.speed !== 1 },
    label: () => `Speed: ${speedLabel(debugState.speed)}`,
    hint: 'Cycle the animation speed (0.25x - 4x)',
    run: () => {
      debugState.speed = nextInCycle(SPEEDS, debugState.speed as (typeof SPEEDS)[number]);
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.skip',
    tab: 'Tweaks',
    section: 'Animation speed',
    dock: { row: 2, order: 2, icon: 'ffwd', on: () => debugState.skipAnims },
    label: () => (debugState.skipAnims ? 'Skip anims: on' : 'Skip anims: off'),
    on: () => debugState.skipAnims,
    hint: 'Play animations extremely fast (battle results come instantly)',
    run: () => {
      debugState.skipAnims = !debugState.skipAnims;
      applyTiming();
    },
  });
  debug.register({
    id: 'tweak.pause',
    tab: 'Tweaks',
    section: 'Animation speed',
    dock: { row: 0, order: 4, icon: 'pause', on: () => debugState.paused },
    label: () => (debugState.paused ? 'Paused' : 'Pause'),
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
    label: () => (debugState.hideNumbers ? 'Numbers: hidden' : 'Numbers: shown'),
    on: () => debugState.hideNumbers,
    hint: 'Hide damage and heal numbers above units',
    run: () => {
      debugState.hideNumbers = !debugState.hideNumbers;
    },
  });
  debug.register({
    id: 'battle.slots',
    tab: 'Tweaks',
    section: 'Display',
    label: () => (battle()?.showSlots ? 'Slots: on' : 'Slots: off'),
    on: () => !!battle()?.showSlots,
    hint: 'Show the formation cells',
    run: () => {
      const b = battle();
      b?.setSlotsVisible(!b.showSlots);
    },
  });
  debug.register({
    id: 'screen.fps',
    tab: 'Tweaks',
    section: 'Display',
    label: () => (fps ? 'FPS: on' : 'FPS: off'),
    on: () => !!fps,
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
    label: () => (forcePortrait ? 'Portrait: on' : 'Portrait: off'),
    on: () => forcePortrait,
    hint: 'Force the "rotate your phone" notice',
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
    dock: { row: 2, order: 0, icon: 'sword', on: () => debugState.flags.damageMult > 1 },
    label: () => (debugState.flags.damageMult > 1 ? `Damage: ${debugState.flags.damageMult >= 1000 ? 'one-hit kill' : `${debugState.flags.damageMult}x`}` : 'Damage: 1x'),
    hint: 'Cycle the damage multiplier: 1x, 10x, one-hit kill',
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
  debug.register({
    id: 'tweak.crit-cycle',
    dockOnly: true,
    tab: 'Tweaks',
    section: 'Quick',
    dock: { row: 2, order: 1, icon: 'burst', on: () => debugState.flags.crit !== 'auto' },
    label: () => `Crit: ${debugState.flags.crit}`,
    hint: 'Cycle critical hits: normal, always, never',
    run: () => {
      debugState.flags.crit = nextInCycle(['auto', 'always', 'never'] as const, debugState.flags.crit);
      applyFlags();
    },
  });

  // ===== Info =====
  debug.registerInfo('units', () =>
    Object.fromEntries(
      (battle()?.battle?.combatants ?? []).map((c) => [
        `${c.side === 'party' ? 'Player' : 'Enemy'} ${c.name}${c.summoned ? ' (summon)' : ''}`,
        [
          c.hp <= 0 ? 'DEAD' : `HP ${c.hp}/${c.maxHp}`,
          `MP ${c.mp}/${c.maxMp}`,
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
