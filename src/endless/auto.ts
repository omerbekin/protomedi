// Endless dalgasını başsız (headless) oynatır: iki taraf yapay zeka (testler, debug "Auto-win" yok; ileride balance-tester'ın `sim:endless` aracı
// bunu kullanır: roadmap 1.5 "item'li / item'siz kaçıncı dalgada ölünür"). Saf: yalnızca motor.
import { Battle, battleSummary, chooseAction, content, type AiDifficulty } from '../engine';
import { ENDLESS, type EndlessConfig, type EndlessRun } from './data';
import { applyOutcome, outcomeFromSummary } from './run';
import { wavePlan, type WavePlan } from './waves';

/** Savaşı bitmiş saymak için tur sınırı (src/sim/simulate.ts MAX_TURNS ile aynı). */
export const AUTO_MAX_TURNS = 400;

/** Planın savaşı (BattleScene'in kurduğuyla aynı giriş: hücre listeleri, arrange=false). */
export const battleFor = (plan: WavePlan): Battle =>
  new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));

export function fightWave(plan: WavePlan, player: AiDifficulty = 'medium'): Battle {
  const battle = battleFor(plan);
  while (!battle.winner && battle.turnsTaken < AUTO_MAX_TURNS) {
    const actor = battle.currentActor;
    if (!actor) break;
    const choice = chooseAction(battle, actor.uid, content.aiConfig, undefined, { difficulty: actor.side === 'enemy' ? plan.difficulty : player });
    if (!battle.applyChoice(actor.uid, choice).ok) break;
  }
  return battle;
}

/** Sıradaki dalgayı YZ ile oynar ve sonucu koşuya uygular. */
export function autoPlayWave(run: EndlessRun, player: AiDifficulty = 'medium', cfg: EndlessConfig = ENDLESS): EndlessRun {
  const plan = wavePlan(run, cfg);
  const battle = fightWave(plan, player);
  const sum = battleSummary(battle);
  return applyOutcome(run, plan, outcomeFromSummary(plan, battle.winner === 'party', sum.units, sum.turnsTaken), cfg);
}
