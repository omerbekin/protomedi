import layout from '../../data/battle-layout.json';

/**
 * Savaş arka planı seçimi (saf; `tests/battle-background.test.ts`). Havuzlar `data/battle-layout.json > backgrounds`.
 * Sefer savaşı kendi arka planını verir (karşılaşma > düğüm > bölge); verilmezse Quick Battle / multiplayer havuzundan seed'e göre biri.
 * Seçim yalnızca seed'den türer: çevrimiçi savaşta iki oyuncu aynı seed'i aldığı için aynı arka planı görür.
 */
export type BackgroundPool = 'quick' | 'multiplayer';

const POOLS = layout.backgrounds as unknown as Record<BackgroundPool, string[]> & { offsetY: Record<string, number> };

/** Seed'den havuz dizini (karıştırılmış; ardışık seed'ler farklı arka planlara dağılır). */
export function poolIndex(seed: number, size: number): number {
  if (size <= 0) return 0;
  const h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) % size;
}

/** Havuzdan seed'e göre arka plan kimliği; `exists` verilirse yalnızca dosyası olanlar arasından (hiçbiri yoksa null). */
export function pickBackground(pool: BackgroundPool, seed: number, exists: (id: string) => boolean = () => true): string | null {
  const list = (POOLS[pool] ?? []).filter(exists);
  return list.length ? list[poolIndex(seed, list.length)]! : null;
}

/** Savaşın arka planı: sefer açıkça verdiyse o (varsa), değilse havuzdan, o da yoksa savaşın varsayılanı. */
export function battleBackground(o: { explicit?: string; pool: BackgroundPool | null; seed: number; fallback: string; exists: (id: string) => boolean }): string {
  if (o.explicit && o.exists(o.explicit)) return o.explicit;
  if (o.pool) {
    const p = pickBackground(o.pool, o.seed, o.exists);
    if (p) return p;
  }
  return o.fallback;
}

/** Arka plan başına dikey ofset (dünya px). */
export const backgroundOffsetY = (id: string): number => POOLS.offsetY?.[id] ?? 0;

export const backgroundPool = (pool: BackgroundPool): readonly string[] => POOLS[pool] ?? [];
