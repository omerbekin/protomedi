import { Rng } from '../engine/rng';

/**
 * Seferin seed türetimi (campaign.md 5.4): düğüm savaş seed'i, aday çekilişleri ve olay sonuçları
 * `hash(seed, mapId, nodeId, salt)` ile türetilir. Math.random yok: aynı sefer seed'i = aynı adaylar, aynı savaş seed'leri.
 */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = `${p}|`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  // son karıştırma (avalanche)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 1_000_000_000;
}

/** Bir düğümdeki savaşın seed'i. `attempt` yenilgide artan yerel sayaç (kayda yazılmaz): zarlar değişir, düşman takımı aynı kalır. */
export const battleSeed = (seed: number, mapId: string, nodeId: string, attempt = 0): number => hashSeed(seed, mapId, nodeId, 'battle', attempt);

export const rngFor = (seed: number, ...parts: Array<string | number>): Rng => new Rng(hashSeed(seed, ...parts));

/** Seed'li karıştırma (Fisher-Yates), yeni dizi. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
