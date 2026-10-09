/**
 * Debug menüsü > Setup > Endless (Endless Lite, open-questions madde 281): ekranı aç, dalgayı kazanılmış say (ödül/dükkân/boss akışını hızlı
 * denemek için), sonraki elit/boss dalgasına atla, altın ver, en iyi koşular listesini sil. Sahne sınıfını içe aktarmaz (Node testinde Phaser yok).
 */
import type Phaser from 'phaser';
import { SCORES_KEY, applyOutcome, autoPlayWave, giveItem, grantRelic, waveKind, wavePlan, type EndlessRun } from '../endless';
import { ENDLESS_SCENE, commit, continueRun, endless, openEndless, openMerchant, recordScore, startRun, storage } from '../game/endless-session';
import type { DebugMenu } from './debug-menu';

const TAB = 'Setup';
const SECTION = 'Endless';
const SCENES = ['BattleScene', 'TeamSelectScene', 'CampaignMapScene', 'MainMenuScene', 'MultiplayerScene', ENDLESS_SCENE];

function open(game: Phaser.Game, data?: object): void {
  const active = SCENES.find((k) => game.scene.isActive(k));
  if (active) (game.scene.getScene(active) as Phaser.Scene).scene.start(ENDLESS_SCENE, data);
  else game.scene.start(ENDLESS_SCENE, data);
}

/** Kampta bekleyen koşu (yoksa kayıtlı olan; o da yoksa rastgele 4 class'lık yeni koşu). */
function readyRun(): EndlessRun {
  const run = endless.run ?? continueRun() ?? startRun(['warrior', 'archer', 'mage', 'druid']);
  return run;
}

export function registerEndlessDebug(game: Phaser.Game, debug: DebugMenu): void {
  debug.register({
    id: 'endless.open',
    tab: TAB,
    section: SECTION,
    icon: 'next',
    label: 'Open Endless',
    hint: 'Open the Endless screen (Continue / New Run / best runs). Also: add ?endless=1 to the address',
    run: () => openEndless(game),
  });
  debug.register({
    id: 'endless.win',
    tab: TAB,
    section: SECTION,
    icon: 'helm',
    label: 'Win this wave',
    hint: 'Count the waiting wave as won without fighting (heroes keep their health) and open the reward cards; starts a run if none',
    run: () => {
      const run = readyRun();
      if (run.phase !== 'ready') return open(game);
      const plan = wavePlan(run);
      commit(applyOutcome(run, plan, { victory: true, units: run.heroes.map((h) => ({ heroId: h.id, hpRatio: h.hpRatio, alive: true })), kills: plan.enemies.filter(Boolean).length, turns: 0 }));
      open(game);
    },
  });
  debug.register({
    id: 'endless.auto',
    tab: TAB,
    section: SECTION,
    icon: 'flask',
    label: 'Auto-play wave',
    hint: 'Let the AI play the waiting wave for your side too (instant, no animation) and show the result: rewards or the run summary',
    run: () => {
      const run = readyRun();
      if (run.phase !== 'ready') return open(game);
      const next = autoPlayWave(run);
      commit(next);
      if (next.phase === 'over') recordScore(next); // yenilgi: skor listesine yazılır (savaş ekranındaki yolla aynı)
      open(game);
    },
  });
  debug.register({
    id: 'endless.jump',
    tab: TAB,
    section: SECTION,
    icon: 'skull',
    label: 'Jump to elite/boss',
    hint: 'Move the waiting run to the next elite or boss wave (no rewards are given for the skipped waves)',
    run: () => {
      const run = readyRun();
      if (run.phase !== 'ready') return open(game);
      let w = run.wave + 1;
      while (waveKind(w) === 'normal') w++;
      commit({ ...run, wave: w, stats: { ...run.stats, cleared: w - 1 } });
      open(game);
    },
  });
  debug.register({
    id: 'endless.gold',
    tab: TAB,
    section: SECTION,
    icon: 'clipboard',
    label: 'Give 200 gold',
    hint: 'Add 200 gold to the current Endless run (for the merchant)',
    run: () => {
      const run = readyRun();
      commit({ ...run, gold: run.gold + 200 });
      if (game.scene.isActive(ENDLESS_SCENE)) open(game);
    },
  });
  debug.register({
    id: 'endless.shop',
    tab: TAB,
    section: SECTION,
    icon: 'clipboard',
    label: 'Open merchant',
    hint: 'Open the merchant (Odo the Peddler): in the waiting camp of your run, or else in a throwaway preview run that is not saved or scored. Also: ?merchant=1',
    run: () => openMerchant(game),
  });
  debug.register({
    id: 'endless.relic',
    tab: TAB,
    section: SECTION,
    icon: 'ankh',
    label: 'Give relic',
    hint: 'Give the current Endless run the next relic it does not have yet (a suspended battle is discarded, its setup changed)',
    run: () => {
      const run = readyRun();
      commit(grantRelic(run));
      if (game.scene.isActive(ENDLESS_SCENE)) open(game);
    },
  });
  debug.register({
    id: 'endless.item',
    tab: TAB,
    section: SECTION,
    icon: 'helm',
    label: 'Give item',
    hint: 'Put an item into the Endless bag (equip it on the camp screen with Gear)',
    run: () => {
      commit(giveItem(readyRun()));
      if (game.scene.isActive(ENDLESS_SCENE)) open(game);
    },
  });
  debug.register({
    id: 'endless.scores',
    tab: TAB,
    section: SECTION,
    icon: 'restart',
    label: 'Clear best runs',
    hint: 'Delete the local list of best Endless runs',
    run: () => {
      try {
        storage()?.removeItem(SCORES_KEY);
      } catch {
        /* depo kapalı */
      }
      if (game.scene.isActive(ENDLESS_SCENE)) openEndless(game);
    },
  });
}
