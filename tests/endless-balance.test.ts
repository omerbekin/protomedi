// Endless denge eğrisi (hafif): seed'li küçük örnekte simülatör (src/sim/endless.ts) hedef bantların içinde kalır.
// Hedefler ve tolerans: data/endless.json > balance. Tam rapor: npm run sim:endless.
import { describe, expect, it } from 'vitest';
import { ENDLESS } from '../src/endless';
import { keyMetrics, simulateEndless, summarize } from '../src/sim/endless';

interface Balance {
  targets: Record<'earlyMinWin' | 'firstBossWin' | 'mean' | 'reach30', [number, number]>;
  test: { runs: number; firstSeed: number; tolerance: Record<'earlyMinWin' | 'firstBossWin' | 'mean' | 'reach30', number> };
}
const BAL = (ENDLESS as unknown as { balance: Balance }).balance;

describe('endless balance (seeded sample)', () => {
  const res = simulateEndless({ runs: BAL.test.runs, firstSeed: BAL.test.firstSeed, maxWave: 32 });
  const k = keyMetrics(res);
  const band = (key: keyof Balance['targets']): [number, number] => {
    const [lo, hi] = BAL.targets[key];
    const t = BAL.test.tolerance[key];
    return [lo - t, hi + t];
  };

  it('is deterministic for the same seeds', () => {
    const again = simulateEndless({ runs: 4, firstSeed: BAL.test.firstSeed, maxWave: 32 });
    expect(again.runs.map((r) => r.reached)).toEqual(res.runs.slice(0, 4).map((r) => r.reached));
  });

  it('keeps the curve inside the target bands', () => {
    const msg = JSON.stringify(k);
    const [e0] = band('earlyMinWin');
    expect(k.earlyMinWin, msg).toBeGreaterThanOrEqual(e0);
    const [b0, b1] = band('firstBossWin');
    expect(k.firstBossWin, msg).toBeGreaterThanOrEqual(b0);
    expect(k.firstBossWin, msg).toBeLessThanOrEqual(b1);
    const [m0, m1] = band('mean');
    expect(k.mean, msg).toBeGreaterThanOrEqual(m0);
    expect(k.mean, msg).toBeLessThanOrEqual(m1);
    expect(k.reach30, msg).toBeLessThanOrEqual(band('reach30')[1]);
  });

  it('survival only goes down and the boss is the first big drop', () => {
    const s = summarize(res);
    for (let w = 2; w < s.survival.length; w++) expect(s.survival[w]!).toBeLessThanOrEqual(s.survival[w - 1]!);
    // 10. dalganın kazanma oranı ilk 9 dalganın hepsinden düşük (boss = ilk ciddi sınav)
    const early = s.winRate.slice(1, ENDLESS.bossEvery).filter((v) => !Number.isNaN(v));
    expect(s.winRate[ENDLESS.bossEvery]!).toBeLessThan(Math.min(...early));
  });
});
