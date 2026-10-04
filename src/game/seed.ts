/** Yeni bir savaş seed'i (tarayıcı tarafı; motor kendi içinde Date/Math.random kullanmaz). */
export const newSeed = (): number => Math.floor(Date.now() % 1_000_000_000);

/** Sayfa açılışındaki seed: adreste `?seed=123` varsa o (hata ayıklama için), yoksa rastgele. */
export function initialSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : newSeed();
}
