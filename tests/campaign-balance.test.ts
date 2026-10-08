import { describe, expect, it } from 'vitest';
import { getMap } from '../src/campaign';
import { allRoutes, categoryFirstWin, routeLabel, simulateCampaign, type NodeCategory } from '../src/sim/campaign';
import campaignBalance from '../data/campaign/balance.json';

// Sefer zorluk eğrisi (docs/balance.md > Sefer dengesi): Medium zorluk, oyuncu vekili Medium YZ, seed'li küçük örnek.
// Bant = data/campaign/balance.json > targets.medium ± test.tolerance (örnek küçük). Tam ölçüm: npm run sim:campaign.
const T = campaignBalance.test;
const target = campaignBalance.targets.medium as unknown as Record<NodeCategory, [number, number]>;
const result = simulateCampaign({ difficulty: 'medium', player: 'medium', runs: T.runs, firstSeed: T.firstSeed });
const cat = categoryFirstWin(result);

describe(`sefer zorluk eğrisi (Medium, ${T.runs} sefer, seed ${T.firstSeed})`, () => {
  for (const c of ['tutorial', 'normal', 'elite', 'boss'] as NodeCategory[]) {
    const [lo, hi] = target[c];
    it(`${c} düğümleri ilk denemede %${lo - T.tolerance}-${Math.min(100, hi + T.tolerance)} kazanılıyor`, () => {
      expect(cat[c], `${c} %${cat[c].toFixed(1)}`).toBeGreaterThanOrEqual(lo - T.tolerance);
      expect(cat[c], `${c} %${cat[c].toFixed(1)}`).toBeLessThanOrEqual(hi + T.tolerance);
    });
  }

  it('eğri iner: tutorial > normal > elit > boss', () => {
    expect(cat.tutorial).toBeGreaterThan(cat.normal);
    expect(cat.normal).toBeGreaterThan(cat.elite);
    expect(cat.elite).toBeGreaterThan(cat.boss);
  });

  it('12 rotanın hepsi oynandı ve her savaşlı düğüm ölçüldü', () => {
    const map = getMap('valdoria');
    expect(Object.keys(result.routes).sort()).toEqual(allRoutes(map).map((r) => routeLabel(map, r)).sort());
    for (const n of map.nodes.filter((x) => x.encounter)) expect(result.nodes[n.id]?.reached, n.id).toBeGreaterThan(0);
  });
});
