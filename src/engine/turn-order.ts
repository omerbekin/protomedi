import type { Side } from './types';

/**
 * Sayaç (ATB benzeri) sıra sistemi, saf fonksiyonlar halinde.
 * Her tikte herkesin sayacı SPD kadar dolar; eşiğe ulaşan oynar, oynayınca sayacından eşik düşer
 * (taşan kısım korunur, yani hızlı karakter daha sık oynar). Rastgelelik yok: aynı durum = aynı sıra.
 */
export interface TurnSlot {
  uid: string;
  side: Side;
  slot: number;
  spd: number;
  counter: number;
}

/** Eşit sayaçta: sayacı yüksek olan, sonra `firstSide` tarafı, sonra düşük yuva, sonra uid. */
function compare(a: TurnSlot, b: TurnSlot, firstSide: Side): number {
  if (a.counter !== b.counter) return b.counter - a.counter;
  if (a.side !== b.side) return a.side === firstSide ? -1 : 1;
  if (a.slot !== b.slot) return a.slot - b.slot;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

/**
 * Sıradaki aktörü bulur. Sayaçları (yerinde) en erken oynayacak kişi eşiğe ulaşana kadar ilerletir;
 * seçilen aktörün sayacını DÜŞÜRMEZ (oyun bitirince düşer). SPD'si 0 olanlar hiç oynamaz.
 */
export function advanceTurn(slots: TurnSlot[], threshold: number, firstSide: Side = 'party'): TurnSlot | null {
  const movers = slots.filter((s) => s.spd > 0);
  if (movers.length === 0) return null;
  const ticks = Math.min(...movers.map((s) => Math.max(0, Math.ceil((threshold - s.counter) / s.spd))));
  for (const s of movers) s.counter += s.spd * ticks;
  return movers.filter((s) => s.counter >= threshold).sort((a, b) => compare(a, b, firstSide))[0] ?? null;
}

/**
 * Sıra çubuğu için tahmin: şu anki aktör (varsa) + sonraki aktörler. Girdiyi değiştirmez.
 * Ölüm/çağrı gibi gelecek olayları bilemez; her olaydan sonra yeniden hesaplanır.
 */
export function predictQueue(
  slots: TurnSlot[],
  threshold: number,
  count: number,
  currentUid: string | null,
  firstSide: Side = 'party',
): string[] {
  const copy = slots.map((s) => ({ ...s }));
  const queue: string[] = [];
  const current = currentUid ? copy.find((s) => s.uid === currentUid) : undefined;
  if (current) {
    queue.push(current.uid);
    current.counter -= threshold;
  }
  while (queue.length < count) {
    const next = advanceTurn(copy, threshold, firstSide);
    if (!next) break;
    queue.push(next.uid);
    next.counter -= threshold;
  }
  return queue;
}

/** Sıra sayacının eşiğe oranı, 0-1 arası (arayüzdeki SPEED çubuğu için; salt okunur, yalnızca hesap). */
export function turnProgress(counter: number, threshold: number): number {
  if (threshold <= 0) return 1;
  return Math.min(1, Math.max(0, counter / threshold));
}
