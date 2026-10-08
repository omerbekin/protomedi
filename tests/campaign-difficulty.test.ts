import { describe, expect, it } from 'vitest';
import { CONFIG, battlePlan, debugTeleport, newCampaign, withDifficulty } from '../src/campaign';
import { categoryFirstWin, simulateCampaign, type NodeCategory } from '../src/sim/campaign';
import campaignBalance from '../data/campaign/balance.json';

// Zorluk sıralaması (docs/balance.md > Sefer dengesi): aynı seed'lerle Easy > Medium > Hard ilk deneme kazanma oranı.
const T = campaignBalance.test;
const run = (difficulty: 'easy' | 'medium' | 'hard') => categoryFirstWin(simulateCampaign({ difficulty, player: 'medium', runs: T.orderRuns, firstSeed: T.orderSeed }));
const easy = run('easy');
const medium = run('medium');
const hard = run('hard');

describe(`zorluk sıralaması (${T.orderRuns} sefer, seed ${T.orderSeed})`, () => {
  for (const c of ['normal', 'elite', 'boss'] as NodeCategory[])
    it(`${c}: Easy > Medium > Hard (en az 5 puan arayla)`, () => {
      const msg = `${c}: easy %${easy[c].toFixed(1)}, medium %${medium[c].toFixed(1)}, hard %${hard[c].toFixed(1)}`;
      expect(easy[c] - medium[c], msg).toBeGreaterThanOrEqual(5);
      expect(medium[c] - hard[c], msg).toBeGreaterThanOrEqual(5);
    });

  it('tutorial: Easy >= Medium >= Hard', () => {
    expect(easy.tutorial).toBeGreaterThanOrEqual(medium.tutorial);
    expect(medium.tutorial).toBeGreaterThanOrEqual(hard.tutorial);
  });
});

describe('zorluk tanımı düşmanlara uygulanır', () => {
  it('çarpanlar çarpılır, düz ekler toplanır; zorluk ekleri yoksa karşılaşma aynen', () => {
    expect(withDifficulty({ hpMult: 2, spriteScale: 1.4 }, { hpMult: 1.1, powerMult: 1.2, armorAdd: 2 })).toEqual({ hpMult: 2.2, spriteScale: 1.4, powerMult: 1.2, armorAdd: 2 });
    expect(withDifficulty(undefined, undefined)).toBeUndefined();
    expect(withDifficulty({ hpMult: 0.5 }, {})).toEqual({ hpMult: 0.5 });
  });

  it('Hard: tüm düşmanlar campaign.json > difficulties.hard.enemy ile, boss ayrıca enemyTier.boss ile güçlenir; Medium veride yazıldığı gibi', () => {
    const plan = (difficulty: 'medium' | 'hard', node: string) => battlePlan(debugTeleport(newCampaign({ mode: 'normal', seed: 3, difficulty }), node));
    const hard = CONFIG.difficulties.hard;
    const m5 = plan('medium', '5A').units.enemies;
    const h5 = plan('hard', '5A').units.enemies;
    for (const slot of Object.keys(m5)) {
      expect(h5[+slot]!.modifiers!.hpMult).toBeCloseTo((m5[+slot]!.modifiers!.hpMult ?? 1) * (hard.enemy?.hpMult ?? 1), 2);
      expect(h5[+slot]!.modifiers!.powerMult ?? 1).toBeCloseTo((m5[+slot]!.modifiers!.powerMult ?? 1) * (hard.enemy?.powerMult ?? 1), 2);
    }
    // Lord Morvane (düğüm 12): rütbe eki uygulanır
    const boss = (d: 'medium' | 'hard', node: string) => Object.values(plan(d, node).units.enemies).find((u) => u.tier === 'boss')!.modifiers!;
    const mb = boss('medium', '12');
    const hb = boss('hard', '12');
    expect(hb.hpMult).toBeCloseTo(mb.hpMult! * (hard.enemy?.hpMult ?? 1) * (hard.enemyTier?.boss?.hpMult ?? 1), 2);
    // The Bridge Warden (düğüm 9): noTierMods, yalnızca genel Hard eki (sim ölçümü: rütbe ekiyle Hard ilk deneme ~%15); eylem sayısı aynı
    const mw = boss('medium', '9');
    const hw = boss('hard', '9');
    expect(hw.hpMult ?? 1).toBeCloseTo((mw.hpMult ?? 1) * (hard.enemy?.hpMult ?? 1), 2);
    expect(hw.actionsPerTurn).toBe(mw.actionsPerTurn);
  });
});
