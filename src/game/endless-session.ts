import type Phaser from 'phaser';
import { battleSummary, content } from '../engine';
import type { Battle } from '../engine';
import {
  abandonRun,
  addScore,
  applyOutcome,
  attachRecorder,
  battleFor,
  battleHash,
  replayActions,
  restoreBattle,
  suspendedOf,
  withSuspended,
  type ReplayAction,
  loadRun,
  loadScores,
  newRun,
  outcomeFromSummary,
  saveRun,
  saveScores,
  scoreOf,
  wavePlan,
  type EndlessRun,
  type KV,
  type ScoreEntry,
  type WavePlan,
} from '../endless';
import { pickBackground } from './battle-background';
import type { ResultAction } from './result-screen';
import type { BattleSceneData } from './scenes/BattleScene';
import { newSeed } from './seed';

/**
 * Endless'ın tarayıcı tarafı (oturum): o anki koşu, localStorage, savaşa geçiş ve savaştan dönüş. Kurallar src/endless/ içinde (saf).
 * BattleScene'e seferle aynı kapıdan (`campaign` kancaları: sonuç ekranı düğmeleri + Retreat) bağlanır; BattleScene'de endless'a özel kod yok.
 */

export const ENDLESS_SCENE = 'EndlessScene';
const BATTLE_SCENE = 'BattleScene';

export function storage(): KV | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface LastScore {
  entry: ScoreEntry;
  /** Skor listesindeki sırası (0 = en iyi), listeye giremediyse -1. */
  rank: number;
}

export const endless = {
  run: null as EndlessRun | null,
  /** Biten koşunun skoru (Run over ekranı). */
  last: null as LastScore | null,
  /** Kamp ekranında bir kez gösterilecek kısa not. */
  notice: '',
};

/** Kayıtlı koşu (yoksa null). Bellektekini tazeler. */
export function savedRun(): EndlessRun | null {
  return loadRun(storage());
}

export function startRun(classIds: string[]): EndlessRun {
  endless.run = newRun(newSeed(), classIds);
  endless.last = null;
  saveRun(storage(), endless.run);
  return endless.run;
}

export function continueRun(): EndlessRun | null {
  endless.run = savedRun();
  endless.last = null;
  return endless.run;
}

/** Koşu durumu değişti: belleğe ve kayda yaz (bitmişse yuva boşalır). */
export function commit(run: EndlessRun): void {
  endless.run = run;
  saveRun(storage(), run);
}

/** Koşu bitti: skoru yerel listeye yaz (bir kez; çağıran koşunun yeni bittiğinden emin olur). */
export function recordScore(run: EndlessRun): void {
  const res = addScore(loadScores(storage()), scoreOf(run));
  saveScores(storage(), res.list);
  endless.last = { entry: res.list[res.rank] ?? scoreOf(run), rank: res.rank };
}

/** Kamp ekranı > Abandon Run (onaylı). */
export function abandon(): void {
  stopRecording();
  const run = endless.run;
  if (!run) return;
  const over = abandonRun(run);
  commit(over);
  recordScore(over);
}

export const scores = (): ScoreEntry[] => loadScores(storage());

const goTo = (game: Phaser.Game, key: string, data?: object) => (game.scene.getScene(BATTLE_SCENE) as Phaser.Scene).scene.start(key, data);

/** Ana menü (Play > Endless mode) ve debug için tek giriş: etkin sahne ne olursa olsun Endless başlık ekranını açar. */
export function openEndless(game: Phaser.Game): void {
  const active = game.scene.getScenes(true)[0];
  if (active) active.scene.start(ENDLESS_SCENE, { view: 'title' });
  else game.scene.start(ENDLESS_SCENE, { view: 'title' });
}

// ------------------------------------------------------------ yarım kalan savaş (kayıt + devam)

/** Kayıt tutulan savaş: her başarılı eylemden sonra koşunun `suspended` alanı yazılır (sekme kapansa da o tura dönülür). */
let recording: { battle: Battle; stop: () => void } | null = null;

function stopRecording(): void {
  recording?.stop();
  recording = null;
}

/** Savaşa günlük tutucuyu bağlar; günlük `actions` ile (devam ediliyorsa önceki eylemlerle) başlar. */
function startRecording(battle: Battle, plan: WavePlan, actions: ReplayAction[]): void {
  stopRecording();
  const log = [...actions];
  let active = true;
  const off = attachRecorder(battle, (a) => {
    const run = endless.run;
    if (!active || !run || run.phase !== 'ready' || run.wave !== plan.wave) return;
    log.push(a);
    commit(withSuspended(run, { wave: plan.wave, seed: plan.seed, actions: [...log], turn: battle.turnsTaken, hash: battleHash(battle) }));
  });
  recording = {
    battle,
    stop: () => {
      active = false;
      off();
    },
  };
}

/** Yarım savaşı sil (geri çekilme: savaş sayılmaz). */
function dropSuspended(): void {
  const run = endless.run;
  if (run?.suspended) commit(withSuspended(run, undefined));
}

/**
 * Sıradaki dalganın savaşını başlatır (mevcut savaş girişi: takımlar + seed + birim kurulumları + zorluk + arka plan).
 * `resume`: yarım kalan savaş günlüğü önce başsız bir savaşta oynatılıp doğrulanır; tutarsa sahnedeki savaş da aynı günlükle o tura getirilir.
 * Tutmazsa (veri değişmiş, kayıt bozuk) kayıt atılır ve dalga baştan başlar (kampta not gösterilir).
 */
export function startWave(scene: Phaser.Scene, resume = false): WavePlan | null {
  const run = endless.run;
  if (!run || run.phase !== 'ready') return null;
  const plan = wavePlan(run);
  let susp = resume ? suspendedOf(run) : null;
  if (susp && !restoreBattle(battleFor(plan), susp)) {
    susp = null;
    endless.notice = 'The suspended battle could not be restored. The wave starts over.';
  }
  if (!susp) dropSuspended();
  const replay = susp?.actions ?? [];
  const game = scene.game;
  // Doku anahtarı assets.ts > backgroundKey ile aynı ('bg:<id>'); assets.ts Phaser yüklediği için burada içe aktarılmaz (debug testleri Node'da)
  const exists = (id: string) => game.textures.exists(`bg:${id}`);
  const background = plan.background ?? pickBackground('quick', plan.seed, exists) ?? undefined;
  const data: Partial<BattleSceneData> = {
    seed: plan.seed,
    mode: 'turns',
    battleId: content.DEFAULT_BATTLE,
    teams: { party: plan.party, enemies: plan.enemies, units: plan.units },
    partySize: plan.party.filter(Boolean).length,
    enemySize: plan.enemies.filter(Boolean).length,
    difficulty: plan.difficulty,
    ...(background ? { background } : {}),
    campaign: {
      // Sahne savaşı kurar kurmaz (çizimden önce): devam ise günlük oynatılır, sonra kayıt başlar
      prepareBattle: (battle) => {
        if (replay.length) replayActions(battle, replay);
        startRecording(battle, plan, replay);
      },
      resultActions: (victory, battle) => resultActions(game, plan, victory, battle),
      retreatLabel: 'Retreat to Camp',
      retreat: () => {
        stopRecording();
        dropSuspended();
        endless.notice = 'You retreated. The battle did not count.';
        goTo(game, ENDLESS_SCENE);
      },
    },
  };
  scene.scene.start(BATTLE_SCENE, data);
  return plan;
}

/**
 * Sonuç ekranı düğmeleri. Sonuç, düğmeler kurulurken (savaş biter bitmez) koşuya yazılır ve kaydedilir: sekme kapansa da yenilgi geri alınamaz
 * (Ironman gibi). applyOutcome aynı dalgayı iki kez yazmaz; yarım savaş kaydını da siler.
 */
export function resultActions(game: Phaser.Game, plan: WavePlan, victory: boolean, battle: Battle): ResultAction[] {
  if (recording?.battle === battle) stopRecording();
  const run = endless.run;
  if (run) {
    const sum = battleSummary(battle);
    const next = applyOutcome(run, plan, outcomeFromSummary(plan, victory, sum.units, sum.turnsTaken));
    if (next !== run) {
      commit(next);
      if (next.phase === 'over') recordScore(next);
    }
  }
  if (victory) return [{ label: 'Claim Reward', primary: true, run: () => goTo(game, ENDLESS_SCENE) }];
  return [
    { label: 'Run Summary', primary: true, run: () => goTo(game, ENDLESS_SCENE) },
    { label: 'Main Menu', run: () => goTo(game, 'MainMenuScene') },
  ];
}
