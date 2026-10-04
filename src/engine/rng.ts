/**
 * Seed'li rastgele sayı üreteci (mulberry32).
 * Motorda Math.random yasaktır; tüm rastgelelik buradan gelir.
 * Aynı seed + aynı çağrı sırası = birebir aynı sayı dizisi.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) aralığında sayı. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] aralığında tamsayı (iki uç dahil). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Kaydetmek / tekrar oynatmak için anlık durum. */
  getState(): number {
    return this.state;
  }

  static fromState(state: number): Rng {
    return new Rng(state);
  }
}
