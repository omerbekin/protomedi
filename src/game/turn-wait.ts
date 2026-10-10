/**
 * Turlar arası GÖRSEL bekleme (Ömer 2026-10-10; yalnızca sunum, motor ve sıra aynı). Motor her birimin sıra sayacını hızı kadar doldurur
 * (eşik formulas.turn.threshold); bir eylemden sonra sıradaki aktör eşiğe ulaşana kadar geçen "oyun zamanı" gerçek zamana çevrilir:
 * hızı `refSpd` (20) olan birim boştan doluya `fullMs` (2000 ms) içinde dolar, yani tik başına fullMs * refSpd / threshold. Tek bekleme en
 * çok `maxMs` (1x'te); Battle speed (0.25x-4x) böler, tavan da onunla bölünür; Reduced motion kısaltır. Saf ve test edilebilir (Phaser'sız).
 */
export interface TurnWaitCfg {
  fullMs: number;
  refSpd: number;
  maxMs: number;
  /** Reduced motion açıkken çarpan (bekleme yine olur, kısalır). */
  reducedMotionMult: number;
}

/** Bir anlık sıra sayacı görüntüsü: birim -> sayaç ve (o andaki) hız. */
export type CounterSnap = Map<string, { counter: number; spd: number }>;

/**
 * Önceki turnStart anındaki görüntü (`prev`) ile yeni turnStart anındaki görüntüden (`next`) geçen tik sayısı. Önceki aktör (sayacı tur
 * sonunda düştü) ve yeni aktör (tur başında durumları azalır, hızı değişmiş olabilir) önce dışarıda tutulur; geri kalan ortak birimlerde
 * (sayaç farkı / hız) en sık çıkan tamsayı. Başka birim yoksa yeni aktörle hesaplanır; o da yoksa null.
 */
export function elapsedTicks(prev: CounterSnap, next: CounterSnap, prevActor: string | null, newActor: string | null = null): number | null {
  const others = votesOf(prev, next, (uid) => uid !== prevActor && uid !== newActor);
  return others ?? votesOf(prev, next, (uid) => uid !== prevActor);
}

function votesOf(prev: CounterSnap, next: CounterSnap, use: (uid: string) => boolean): number | null {
  const votes = new Map<number, number>();
  for (const [uid, n] of next) {
    if (!use(uid) || n.spd <= 0) continue;
    const p = prev.get(uid);
    if (!p) continue;
    const t = Math.round((n.counter - p.counter) / n.spd);
    if (t < 0) continue;
    votes.set(t, (votes.get(t) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [t, n] of votes) if (n > bestN || (n === bestN && best !== null && t < best)) [best, bestN] = [t, n];
  return best;
}

/** Tik sayısı -> bekleme (ms): tavan, Battle speed ve Reduced motion uygulanmış. */
export function waitMs(ticks: number, threshold: number, cfg: TurnWaitCfg, speed: number, reducedMotion: boolean): number {
  const perTick = (cfg.fullMs * cfg.refSpd) / threshold;
  // tavan 1x'te tanımlı: hız bölünce tavan da bölünür (2,5 sn / hız); 1x altında bekleme uzar
  const ms = Math.min(cfg.maxMs, Math.max(0, ticks) * perTick) / Math.max(0.25, speed);
  return Math.round(reducedMotion ? ms * cfg.reducedMotionMult : ms);
}

/** Beklemenin başındaki sayaç (geriye doğru): yeni sayaç - hız x tik (önceki aktör için de doğru: düşüş sonrası değer). */
export const startCounter = (counter: number, spd: number, ticks: number): number => counter - spd * ticks;
