import { sizesFromSearch, type SideSizes } from './team-select-model';

/** Yeni bir savaş seed'i (tarayıcı tarafı; motor kendi içinde Date/Math.random kullanmaz). */
export const newSeed = (): number => Math.floor(Date.now() % 1_000_000_000);

/** Sayfa açılışındaki seed: adreste `?seed=123` varsa o (hata ayıklama için), yoksa rastgele. */
export function initialSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : newSeed();
}

/** Sayfa açılışındaki takım boyutları: adreste `?party=3&enemies=8` varsa onlar (1-12), yoksa varsayılan 4-4. */
export function initialSizes(): SideSizes {
  return sizesFromSearch(window.location.search);
}
