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

  it("aşama 1: 'item' açık; Valdoria'da telafi ölçülen item gücüne göre (ölçülen +%8 => final x1,064); başlangıç x1", () => {
    expect(POWER_BUDGET.activeSystems).toEqual(['item']);
    const c1 = POWER_BUDGET.chapters[0]!;
    expect(c1.end.item).toBe(0.15); // tasarım hedefi (Ömer) korunur
    expect(c1.measured?.item).toBe(0.08);
    expect(enemyScale('valdoria', map.start)).toBe(1);
    expect(chapterEnemyMods('valdoria', map.start)).toBeUndefined();
    expect(enemyScale('valdoria', '12')).toBe(1.064);
    for (const n of map.nodes) expect(enemyScale('valdoria', n.id)).toBeGreaterThanOrEqual(1);
  });

  it('düşman ölçeği = 1 + 0,8 x beklenen güç; bölüm içinde derinlikle doğrusal; ölçülen yoksa hedef', () => {
    const [c1, c2, c3] = POWER_BUDGET.chapters;
    expect(enemyScaleAt(c1!, 0, ['item'])).toBe(1);
    expect(enemyScaleAt(c1!, 1, ['item'])).toBe(1.064);
    expect(enemyScaleAt(c2!, 0, ['item'])).toBe(1.064); // bölüm başı = önceki bölüm sonu
    expect(enemyScaleAt(c3!, 1, ['item', 'level', 'tree'])).toBe(1.8);
    expect(expectedPowerAt(c1!, 0.5).item).toBeCloseTo(0.04, 9);
    expect(enemyScaleAt(c1!, 1, [])).toBe(1);
    expect(nodeDepth('valdoria', map.start)).toBe(0);
    expect(nodeDepth('valdoria', '12')).toBe(1);
    expect(nodeIlvl('valdoria', map.start)).toBe(1);
    expect(nodeIlvl('valdoria', '12')).toBe(10);
  });

  it('kanca: bölüm ölçeği düşman hpMult/powerMult ile çarpılır (zorluk ekiyle aynı kural)', () => {
    const mods = chapterEnemyMods('valdoria', '12', ['item'])!;
    expect(mods).toEqual({ hpMult: 1.064, powerMult: 1.064 });
    expect(withDifficulty({ hpMult: 2, statMult: 1.1 }, mods)).toEqual({ hpMult: 2.128, statMult: 1.1, powerMult: 1.064 });
  });
});
