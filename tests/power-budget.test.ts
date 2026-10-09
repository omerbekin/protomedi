import { describe, expect, it } from 'vitest';
import { CONFIG, POWER_BUDGET, chapterEnemyMods, chapterOf, enemyScale, enemyScaleAt, expectedPowerAt, getMap, nodeDepth, nodeIlvl, withDifficulty } from '../src/campaign';

// Güç bütçesi (data/campaign/power-budget.json; roadmap 1.3, items.md 4.2-4.3; Ömer kararı: item +%15/+%30/+%45, telafi ~%80).

const map = getMap('valdoria');

describe('güç bütçesi', () => {
  it('3 bölüm (Valdoria + The Ashlands + The Ember Throne), ilvl 1-10 / 11-20 / 21-30, item eğrisi +%15/+%30/+%45, telafi 0,8', () => {
    expect(POWER_BUDGET.chapters.map((c) => c.name)).toEqual(['Valdoria', 'The Ashlands', 'The Ember Throne']);
    expect(POWER_BUDGET.chapters.map((c) => c.ilvl)).toEqual([
      [1, 10],
      [11, 20],
      [21, 30],
    ]);
    expect(POWER_BUDGET.chapters.map((c) => c.end.item)).toEqual([0.15, 0.3, 0.45]);
    expect(POWER_BUDGET.compensation).toBe(0.8);
    for (const k of POWER_BUDGET.systems) {
      const ends = POWER_BUDGET.chapters.map((c) => c.end[k]);
      expect([...ends].sort((a, b) => a - b), k).toEqual(ends); // bölümden bölüme artar
    }
    expect(chapterOf('valdoria').chapter).toBe(1);
    for (const m of CONFIG.maps) expect(POWER_BUDGET.chapters.some((c) => c.map === m), m).toBe(true);
  });

  it('aşama 0: açık sistem yok => her Valdoria düğümünde düşman ölçeği 1 (bugünkü savaşlar birebir)', () => {
    expect(POWER_BUDGET.activeSystems).toEqual([]);
    for (const n of map.nodes) {
      expect(enemyScale('valdoria', n.id)).toBe(1);
      expect(chapterEnemyMods('valdoria', n.id)).toBeUndefined();
    }
  });

  it('düşman ölçeği = 1 + 0,8 x beklenen güç; bölüm içinde derinlikle doğrusal', () => {
    const [c1, c2, c3] = POWER_BUDGET.chapters;
    expect(enemyScaleAt(c1!, 0, ['item'])).toBe(1);
    expect(enemyScaleAt(c1!, 1, ['item'])).toBe(1.12);
    expect(enemyScaleAt(c2!, 0, ['item'])).toBe(1.12); // bölüm başı = önceki bölüm sonu
    expect(enemyScaleAt(c3!, 1, ['item', 'level', 'tree'])).toBe(1.8);
    expect(expectedPowerAt(c1!, 0.5).item).toBeCloseTo(0.075, 9);
    expect(nodeDepth('valdoria', map.start)).toBe(0);
    expect(nodeDepth('valdoria', '12')).toBe(1);
    expect(nodeIlvl('valdoria', map.start)).toBe(1);
    expect(nodeIlvl('valdoria', '12')).toBe(10);
  });

  it('kanca: item sistemi açılınca bölüm ölçeği düşman hpMult/powerMult ile çarpılır (zorluk ekiyle aynı kural)', () => {
    const mods = chapterEnemyMods('valdoria', '12', ['item'])!;
    expect(mods).toEqual({ hpMult: 1.12, powerMult: 1.12 });
    expect(withDifficulty({ hpMult: 2, statMult: 1.1 }, mods)).toEqual({ hpMult: 2.24, statMult: 1.1, powerMult: 1.12 });
  });
});
