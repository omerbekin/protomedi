/**
 * Debug menüsü > Campaign sekmesi (campaign-dev): haritayı aç, düğüme ışınlan, düğümü kazanılmış say, sis aç/kapa, can taşımayı göster,
 * kayıt al / son kayda dön / tüm kayıtları sil, Normal-Ironman değiştir. Sahne sınıflarını içe aktarmaz (Node testinde Phaser yok): anahtarla açar.
 */
import type Phaser from 'phaser';
import { debugTeleport, debugWinNode, getMap, latestSave, newCampaign, nextStep, stopNumber, wipeSaves, type CampaignState } from '../campaign';
import { current, loadEntry, startNewCampaign, loadLastSave, save, session, setState, storage, MAP_SCENE } from '../game/campaign-session';
import { debugButton, debugHeading, type DebugMenu } from './debug-menu';

export const CAMPAIGN_TAB = 'Campaign';

const SCENES = ['BattleScene', 'TeamSelectScene', 'CampaignMapScene', 'MainMenuScene'];

/** Haritayı (yeniden) açar: etkin sahne haritaya geçer. */
function openMap(game: Phaser.Game): void {
  const active = SCENES.find((k) => game.scene.isActive(k));
  if (active) (game.scene.getScene(active) as Phaser.Scene).scene.start(MAP_SCENE);
  else game.scene.start(MAP_SCENE);
}

const ensureState = (): CampaignState => current() ?? (setState(newCampaign({ mode: 'normal', seed: Math.floor(Date.now() % 1_000_000_000) })), current()!);

export function registerCampaignDebug(game: Phaser.Game, debug: DebugMenu): void {
  const reload = () => openMap(game);
  debug.register({
    id: 'campaign.open',
    tab: CAMPAIGN_TAB,
    section: 'Map',
    icon: 'boot',
    label: 'Open map',
    hint: 'Open the campaign map (starts a new Normal campaign if none is loaded)',
    run: () => {
      ensureState();
      reload();
    },
  });
  debug.register({
    id: 'campaign.fog',
    tab: CAMPAIGN_TAB,
    section: 'Map',
    icon: 'eye',
    on: () => session.revealFog,
    label: () => (session.revealFog ? 'Reveal fog: on' : 'Reveal fog: off'),
    hint: 'Show every stop ahead (fog off) or hide what is more than two stops away (normal rule)',
    run: () => {
      session.revealFog = !session.revealFog;
      if (game.scene.isActive(MAP_SCENE)) reload();
    },
  });
  debug.register({
    id: 'campaign.hp',
    tab: CAMPAIGN_TAB,
    section: 'Map',
    icon: 'heart',
    on: () => session.showHp,
    label: () => (session.showHp ? 'Show carried HP: on' : 'Show carried HP: off'),
    hint: 'Show each hero\'s carried health as a percentage on the map (the Data list below shows it too)',
    run: () => {
      session.showHp = !session.showHp;
      if (game.scene.isActive(MAP_SCENE)) reload();
    },
  });
  debug.register({
    id: 'campaign.new',
    tab: CAMPAIGN_TAB,
    section: 'Map',
    icon: 'restart',
    label: 'New campaign',
    hint: 'Start a fresh Normal campaign (Medium) in the current slot (Slot 1 if none is loaded); the old saves in that slot are replaced',
    run: () => {
      startNewCampaign('normal', 'medium', current()?.slot ?? 0);
      reload();
    },
  });
  debug.register({
    id: 'campaign.mode',
    tab: CAMPAIGN_TAB,
    section: 'Map',
    icon: 'swap',
    label: () => `Mode: ${current()?.mode === 'ironman' ? 'Ironman' : 'Normal'}`,
    hint: 'Debug only: switch the loaded campaign between Normal and Ironman (in the game the mode is fixed at the start; save rules follow the mode)',
    run: () => {
      const s = ensureState();
      setState({ ...s, mode: s.mode === 'ironman' ? 'normal' : 'ironman' });
      reload();
    },
  });
  debug.register({
    id: 'campaign.win',
    tab: CAMPAIGN_TAB,
    section: 'Progress',
    icon: 'sword',
    label: 'Win this stop',
    hint: 'Count the battle at the current stop as won (health does not change) and return to the map',
    run: () => {
      const s = ensureState();
      setState(debugWinNode(s));
      reload();
    },
  });
  debug.register({
    id: 'campaign.skip-tutorial',
    tab: CAMPAIGN_TAB,
    section: 'Progress',
    icon: 'next',
    label: 'Skip tutorial',
    hint: 'Jump to Ashford Village (the tutorial heroes say farewell, then you form your company of three)',
    run: () => {
      setState(debugTeleport(ensureState(), '4'));
      reload();
    },
  });
  debug.register({
    id: 'campaign.save',
    tab: CAMPAIGN_TAB,
    section: 'Saves',
    icon: 'clipboard',
    label: 'Save now',
    hint: 'Write an autosave of the current campaign now (Ironman keeps a single save)',
    run: () => {
      if (current()) save('auto');
      if (game.scene.isActive(MAP_SCENE)) reload();
    },
  });
  debug.register({
    id: 'campaign.load-last',
    tab: CAMPAIGN_TAB,
    section: 'Saves',
    icon: 'restart',
    label: 'Load last save',
    hint: 'Go back to the newest save (as after a defeat)',
    run: () => {
      const s = current();
      if (s) loadLastSave();
      else {
        const e = latestSave(storage());
        if (e) loadEntry(e);
      }
      if (current()) reload();
    },
  });
  debug.register({
    id: 'campaign.wipe',
    tab: CAMPAIGN_TAB,
    section: 'Saves',
    icon: 'flame',
    label: 'Wipe all saves',
    hint: 'Delete every campaign save in this browser (the loaded campaign stays open)',
    run: () => wipeSaves(storage()),
  });
  debug.registerPanel({
    id: 'campaign.teleport',
    tab: CAMPAIGN_TAB,
    render: (el) => {
      el.append(debugHeading('Teleport to stop'));
      const grid = document.createElement('div');
      grid.className = 'debug-grid';
      for (const n of getMap('valdoria').nodes) {
        grid.append(
          debugButton(`${n.id} ${n.name}`, () => {
            setState(debugTeleport(ensureState(), n.id));
            reload();
          }, { title: `${n.subtitle}: the road from Mill Road is rebuilt, earlier stops count as done, missing heroes are picked automatically` }),
        );
      }
      el.append(grid);
      const s = current();
      const info = document.createElement('div');
      info.className = 'debug-note';
      info.textContent = s
        ? `Slot ${s.slot + 1} · campaign seed ${s.seed} · ${s.mode} · ${s.difficulty} · stop ${stopNumber(s)}/12 at ${s.at} · next: ${nextStep(s).kind} · HP: ${s.roster.map((h) => `${h.class} ${Math.round(h.hpRatio * 100)}%`).join(', ') || '-'}`
        : 'No campaign loaded.';
      el.append(info);
    },
  });

  // Ana menü (Play kartları, Settings ve Multiplayer sütunları; src/game/scenes/MainMenuScene.ts)
  const openMenu = (view: 'menu' | 'play' | 'settings' | 'mp') => {
    const active = [...SCENES, 'MultiplayerScene'].find((k) => game.scene.isActive(k));
    if (active) (game.scene.getScene(active) as Phaser.Scene).scene.start('MainMenuScene', { view });
    else game.scene.start('MainMenuScene', { view });
  };
  const views: Array<['menu' | 'play' | 'settings' | 'mp', string, string, string]> = [
    ['menu', 'Main menu', 'frame', 'Open the main menu (Play · Settings · Codex)'],
    ['play', 'Play cards', 'sword', 'Open the main menu on the Play cards (Campaign · Quick Battle · Multiplayer)'],
    ['settings', 'Menu settings', 'gear', 'Open the main menu on its Settings column'],
    ['mp', 'Menu multiplayer', 'team', 'Open the main menu on its Multiplayer column (name, Host, Join)'],
  ];
  for (const [view, label, icon, hint] of views) {
    debug.register({ id: `menu.${view}`, tab: CAMPAIGN_TAB, section: 'Main menu', icon, label, hint, run: () => openMenu(view) });
  }
}
