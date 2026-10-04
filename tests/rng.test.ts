import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine';

describe('Rng (seed\'li rastgele)', () => {
  it('aynı seed birebir aynı diziyi üretir', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('farklı seed farklı dizi üretir', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() her zaman [0, 1) aralığında kalır', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) iki ucu da üretir ve dışına çıkmaz', () => {
    const rng = new Rng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('durum kaydedilip geri yüklenince dizi kaldığı yerden devam eder', () => {
    const rng = new Rng(99);
    rng.next();
    rng.next();
    const restored = Rng.fromState(rng.getState());
    expect(restored.next()).toEqual(rng.next());
  });
});
