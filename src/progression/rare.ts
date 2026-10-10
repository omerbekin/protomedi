// Ortak "nadir düşüş" zarı (Ömer onayı 2026-10-10, madde 297): her kazanılan savaşta BİR zar (sefer ve Endless). Saf ve seed'li.
// İsabette dal: set parçası (set item'leri henüz yok: veri kancası, düşüş yok) ya da Legendary. Kötü şans koruması: düşüşsüz her zafer şansı artırır,
// düşüşte sıfırlanır. Akıllı loot YOK (Ömer: FOMO): uygun havuzdan tekdüze seçim, takım sınıfına ağırlık yok, sahip olunan Legendary yine düşebilir.
import type { Rng } from '../engine/rng';
import { ITEMS, type ItemDef } from './items';

export type RareBattleKind = 'battle' | 'elite' | 'boss';

/** items.json > rareDrop (tüm sayılar veride). */
export interface RareDropConfig {
  chance: Record<RareBattleKind, number>;
  /** Düşüşsüz her zaferde şansa eklenen pay (0,005 = +%0,5). */
  pityPerMiss: number;
  /** İsabette dal payları: set parçası / Legendary (toplamı 1'den küçükse kalan = hiçbir şey). */
  split: { set: number; legendary: number };
  /** Set item'leri var mı: false iken set dalı hiçbir şey vermez (kanca). */
  setsEnabled: boolean;
  /** Bölüm başına Legendary dal çarpanı (Valdoria = 1: 0,5). */
  chapterLegendaryMult: Record<string, number>;
  endless: {
    /** Dalga başına şansa ek (0,001 = +%0,1). */
    perWave: number;
    /** Legendary bu dalgadan itibaren uygun. */
    legendaryFromWave: number;
    /** Tüccar (Odo): bu dalgadan itibaren her ziyarette `chance` ihtimalle bir nadir mal, fiyat = değer x priceMult. */
    merchant: { fromWave: number; chance: number; priceMult: number };
  };
}

export const RARE: RareDropConfig = (ITEMS as unknown as { rareDrop: RareDropConfig }).rareDrop;

export interface RareRollInput {
  rng: Rng;
  kind: RareBattleKind;
  /** Düşüşsüz geçen zafer sayısı (kayıtta). */
  misses: number;
  /** Sefer: bölüm (Legendary uygunluğu minChapter + bölüm çarpanı). */
  chapter?: number;
  /** Endless: dalga (şans artışı + Legendary dalga kapısı). */
  wave?: number;
  catalog?: ItemDef[];
  cfg?: RareDropConfig;
}

export interface RareRollResult {
  /** Düşen item id'si (yoksa undefined). */
  item?: string;
  branch: 'none' | 'set' | 'legendary';
  /** Güncel sayaç: düşüşte 0, değilse +1. */
  misses: number;
  /** Bu zarın şansı (rapor / test için). */
  chance: number;
}

/** Bu zaferin nadir düşüş şansı. */
export function rareChance(kind: RareBattleKind, misses: number, wave?: number, cfg: RareDropConfig = RARE): number {
  return cfg.chance[kind] + cfg.pityPerMiss * Math.max(0, misses) + (wave !== undefined ? cfg.endless.perWave * Math.max(0, wave) : 0);
}

/** Uygun Legendary havuzu: sefer = minChapter <= bölüm; Endless = dalga kapısından sonra hepsi. */
export function legendaryPool(o: { chapter?: number; wave?: number }, catalog: ItemDef[] = ITEMS.items, cfg: RareDropConfig = RARE): ItemDef[] {
  const leg = catalog.filter((d) => d.rarity === 'legendary');
  if (o.wave !== undefined) return o.wave >= cfg.endless.legendaryFromWave ? leg : [];
  return leg.filter((d) => (d.minChapter ?? 1) <= (o.chapter ?? 1));
}

/** Bir zaferin nadir düşüş zarı (seed'li; zar sayısı sabit: iki zar + isabette havuz seçimi). */
export function rollRareDrop(o: RareRollInput): RareRollResult {
  const cfg = o.cfg ?? RARE;
  const chance = rareChance(o.kind, o.misses, o.wave, cfg);
  const miss = (): RareRollResult => ({ branch: 'none', misses: o.misses + 1, chance });
  if (o.rng.next() >= chance) return miss();
  const r = o.rng.next();
  const legShare = cfg.split.legendary * (o.chapter !== undefined ? (cfg.chapterLegendaryMult[String(o.chapter)] ?? 1) : 1);
  if (r < cfg.split.set) {
    // Set dalı: set item'leri henüz yok (kanca); düşüş olmadığı için sayaç sıfırlanmaz
    return cfg.setsEnabled ? miss() : miss();
  }
  if (r < cfg.split.set + legShare) {
    const pool = legendaryPool({ chapter: o.chapter, wave: o.wave }, o.catalog ?? ITEMS.items, cfg);
    if (!pool.length) return miss();
    const d = pool[o.rng.int(0, pool.length - 1)]!; // tekdüze: akıllı loot yok
    return { item: d.id, branch: 'legendary', misses: 0, chance };
  }
  return miss();
}
