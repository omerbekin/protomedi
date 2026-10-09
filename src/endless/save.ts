// Endless kaydı (saf; depo dışarıdan verilir): tek koşu yuvası (her dalga sonrası otomatik, Ironman gibi; yenilgide yükleme yok) + yerel
// en iyi skor listesi. Sürümlü; bozuk / tanınmayan kayıt oyunu çökertmez (yok sayılır). Anahtarlar `protomedi.*` kalıbında (CLAUDE.md).
import { CELL_COUNT, classes } from '../engine/content';
import type { EndlessRun, ScoreEntry } from './data';
import { validSuspended } from './replay';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RUN_KEY = 'protomedi.endless.v1';
export const SCORES_KEY = 'protomedi.endless.scores.v1';
export const SAVE_VERSION = 1;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Kayıttaki koşu geçerli mi (alan alan; eksik / bozuk -> null). */
export function parseRun(raw: string | null): EndlessRun | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { version?: number; run?: EndlessRun };
    const r = data?.run;
    if (data?.version !== SAVE_VERSION || !r || r.version !== 1) return null;
    if (!isNum(r.seed) || !isNum(r.wave) || r.wave < 1 || !isNum(r.gold) || !isNum(r.nextItem)) return null;
    if (!['ready', 'relic', 'reward', 'shop', 'over'].includes(r.phase)) return null;
    if (!Array.isArray(r.heroes) || !r.heroes.length) return null;
    for (const h of r.heroes) if (!h || typeof h.id !== 'string' || !classes[h.class] || !isNum(h.hpRatio) || typeof h.equipment !== 'object' || !h.equipment) return null;
    // Dizilim (2026-10-09): bozuk hücre atılır (o zaman wavePlan tüm takımı otomatik dizer)
    for (const h of r.heroes) if (h.slot !== undefined && (!Number.isInteger(h.slot) || h.slot < 0 || h.slot >= CELL_COUNT)) delete h.slot;
    if (!r.stats || !isNum(r.stats.cleared) || !isNum(r.stats.turns) || !isNum(r.stats.kills)) return null;
    if (r.phase === 'reward' && !Array.isArray(r.offer)) return null;
    if (r.phase === 'shop' && !Array.isArray(r.shop)) return null;
    // Tüccar (2026-10-09): yenileme sayacı ve bu ziyaretin geri alım listesi; eski kayıtta yok; bozuk geri alım satırları atılır
    if (r.shopRerolls !== undefined && (!isNum(r.shopRerolls) || r.shopRerolls < 0)) delete r.shopRerolls;
    if (r.buyback !== undefined) {
      if (!Array.isArray(r.buyback)) delete r.buyback;
      else r.buyback = r.buyback.filter((e) => e && isNum(e.price) && e.price >= 0 && e.item && typeof e.item.uid === 'string' && typeof e.item.id === 'string');
    }
    // Torba (2026-10-09): eski kayıtta yok = boş; bozuk satırlar atılır
    if (r.bag !== undefined) {
      if (!Array.isArray(r.bag)) return null;
      r.bag = r.bag.filter((i) => i && typeof i.uid === 'string' && typeof i.id === 'string');
    }
    if (r.relics !== undefined && (!Array.isArray(r.relics) || r.relics.some((x) => typeof x !== 'string'))) return null;
    if (r.phase === 'relic' && !Array.isArray(r.relicOffer)) return null;
    if (r.blessing !== undefined && (!isNum(r.blessing.hpMult) || !isNum(r.blessing.waves))) return null;
    // Bozuk yarım savaş kaydı koşuyu bozmaz: yalnızca o kayıt atılır
    if (r.suspended !== undefined && !validSuspended(r.suspended)) delete r.suspended;
    return r;
  } catch {
    return null;
  }
}

export function loadRun(kv: KV | null): EndlessRun | null {
  try {
    const r = parseRun(kv?.getItem(RUN_KEY) ?? null);
    return r && r.phase !== 'over' ? r : null;
  } catch {
    return null;
  }
}

/** Koşuyu yazar; bitmiş koşu yuvayı boşaltır. Depo yoksa / doluysa false (oyun sürer). */
export function saveRun(kv: KV | null, run: EndlessRun): boolean {
  if (!kv) return false;
  try {
    if (run.phase === 'over') kv.removeItem(RUN_KEY);
    else kv.setItem(RUN_KEY, JSON.stringify({ version: SAVE_VERSION, run }));
    return true;
  } catch {
    return false;
  }
}

export function clearRun(kv: KV | null): void {
  try {
    kv?.removeItem(RUN_KEY);
  } catch {
    /* depo kapalı */
  }
}

export function loadScores(kv: KV | null): ScoreEntry[] {
  try {
    const raw = kv?.getItem(SCORES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { version?: number; scores?: ScoreEntry[] };
    if (data?.version !== SAVE_VERSION || !Array.isArray(data.scores)) return [];
    return data.scores.filter((e) => e && isNum(e.wave) && isNum(e.cleared) && isNum(e.turns) && isNum(e.kills) && Array.isArray(e.classes) && typeof e.date === 'string');
  } catch {
    return [];
  }
}

export function saveScores(kv: KV | null, scores: ScoreEntry[]): boolean {
  if (!kv) return false;
  try {
    kv.setItem(SCORES_KEY, JSON.stringify({ version: SAVE_VERSION, scores }));
    return true;
  } catch {
    return false;
  }
}
