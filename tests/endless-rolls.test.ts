import { describe, expect, it } from 'vitest';
import { bestHeroFor, buyItem, chooseReward, ipGain, itemStatRows, newRun, rerollShop, rewardOffer, rolledStats, statDelta, type EndlessRun } from '../src/endless';
import { instanceStats, itemDef, statLine, statRange } from '../src/progression';

// Endless stat zarları (Ömer 2026-10-10, item yeniden yapılanması): kartta / tezgâhta görünen zarlanmış değer = alınan örneğin değeri;
// tüccar karşılaştırması ve BEST zarlanmış değerlerle.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const AT = '2026-10-10T00:00:00.000Z';

function atShop(gold = 1000, seed = 11): EndlessRun {
  const base: EndlessRun = { ...newRun(seed, PARTY, AT), wave: 6, phase: 'reward', stats: { cleared: 5, turns: 0, kills: 0 }, offer: [{ kind: 'gold', amount: 0 }] };
  const run = chooseReward(base, 0);
  return { ...run, gold };
}

describe('endless zarlar: gösterilen = alınan', () => {
  it('ödül kartı zarlanmış gelir ve alınan örnek aynı zarları taşır', () => {
    const run: EndlessRun = { ...newRun(3, PARTY, AT), wave: 2, phase: 'reward', stats: { cleared: 1, turns: 0, kills: 0 } };
    const offer = rewardOffer(run);
    const card = offer.find((c) => c.kind === 'item');
    if (!card || card.kind !== 'item') throw new Error('item card expected');
    expect(card.rolls).toBeTruthy();
    expect(rewardOffer(run)).toEqual(offer); // seed'li
    const taken = chooseReward({ ...run, offer }, offer.indexOf(card));
    const inst = taken.bag!.at(-1)!;
    expect(inst.id).toBe(card.itemId);
    expect(inst.rolls).toEqual(card.rolls);
  });

  it('tezgâh malları zarlanmış; satın alınan örnek aynı zarları taşır; yenileme yeni zarlar atar', () => {
    const run = atShop();
    const e = run.shop![0]!;
    expect(e.rolls).toBeTruthy();
    const d = itemDef(e.itemId)!;
    for (const [k, v] of Object.entries(e.rolls!)) {
      const [lo, hi] = statRange(d, k as never);
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    }
    const bought = buyItem(run, 0);
    expect(bought.bag!.at(-1)!.rolls).toEqual(e.rolls);
    expect(rerollShop(run).shop!.every((w) => !!w.rolls)).toBe(true);
  });

  it('eski kayıt (kartta zar yok): alınırken zarlanır', () => {
    const run: EndlessRun = { ...newRun(4, PARTY, AT), wave: 2, phase: 'reward', stats: { cleared: 1, turns: 0, kills: 0 }, offer: [{ kind: 'item', itemId: 'leather_coif', heroId: 'h1' }] };
    const inst = chooseReward(run, 0).bag!.at(-1)!;
    expect(inst.rolls).toBeTruthy();
  });
});

describe('endless zarlar: tüccar gösterimi', () => {
  const d = itemDef('brigandine')!;
  const keys = Object.keys(d.stats) as Array<keyof typeof d.stats>;
  const hi = Object.fromEntries(keys.map((k) => [k, statRange(d, k)[1]]));

  it('itemStatRows: zarlanmış değer + aralık; satır yazısı "+4 Max HP (3–5)" biçiminde', () => {
    const rows = itemStatRows(d, hi);
    expect(new Set(rows.map((r) => r.stat))).toEqual(new Set(keys.filter((k) => d.stats[k])));
    for (const r of rows) {
      expect(r.value).toBe(instanceStats({ id: d.id, rolls: hi })[r.stat]);
      expect(r.range).toEqual(statRange(d, r.stat));
    }
    const r0 = rows[0]!;
    if (r0.range[0] !== r0.range[1]) expect(statLine(r0.stat, r0.value, r0.range)).toMatch(/\(\d+(\.\d)?–\d+(\.\d)?\)$/);
    // zar yoksa katalog değeri (orta)
    for (const r of itemStatRows(d)) expect(r.value).toBe(rolledStats(d)[r.stat]);
  });

  it('karşılaştırma ve BEST zarlanmış değerlerle (aynı item, daha iyi zar = yükseltme)', () => {
    const m = itemDef('flanged_mace')!; // zar aralığı olan item (silah: takımda yalnızca warrior kullanır)
    const mk = Object.keys(m.stats) as Array<keyof typeof m.stats>;
    const mHi = Object.fromEntries(mk.map((k) => [k, statRange(m, k)[1]]));
    const mLo = Object.fromEntries(mk.map((k) => [k, statRange(m, k)[0]]));
    const run = atShop();
    const w = run.heroes[0]!;
    w.equipment = { weapon: { uid: 'x', id: m.id, rolls: mLo } };
    const rows = statDelta(run, w.id, m, undefined, mHi);
    for (const r of rows) {
      expect(r.now).toBe(instanceStats({ id: m.id, rolls: mLo })[r.stat]);
      expect(r.next).toBe(instanceStats({ id: m.id, rolls: mHi })[r.stat]);
      expect(r.diff).toBeGreaterThan(0);
    }
    expect(ipGain(run, w.id, m, undefined, mHi)).toBeGreaterThan(0);
    expect(bestHeroFor(run, m, undefined, mHi)).toBe(w.id);
    expect(bestHeroFor(run, m, undefined, mLo)).toBeNull(); // aynı zar: yükseltme değil
  });
});
