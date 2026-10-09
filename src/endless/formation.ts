// Endless dizilimi (Ömer 2026-10-09: "karakterler bir önceki dalgada nerede kaldılarsa oradan devam etsin; koşu başında tek seferlik dizilim").
// Saf. Kural: koşu başında oyuncu 4 kahramanı 4 sıra x 3 şerit ızgaraya dizer (öneri = otomatik dizilim); her kazanılan dalganın sonunda her
// kahramanın SAVAŞ SONUNDAKİ hücresi saklanır (Move ile değişen dahil), sonraki dalga oradan başlar. Düşen kahraman (20% canla kalkar) son
// hücresine döner; orası doluysa kendi tahtasındaki en yakın boş hücreye (belirleyici sıra). Çağrılar taşınmaz. Eski kayıt (hücre yok) =
// otomatik dizilim. Dalgalar arası dizilim düzenleme YOK.
import { CELL_COUNT, classes, defaultSlots } from '../engine/content';
import type { EndlessHero } from './data';

const LANES = 3;
const validCell = (c: unknown): c is number => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < CELL_COUNT;

/** Hücreler geçerli ve tekil mi (uzunluk = kahraman sayısı). */
export function validSlots(slots: readonly unknown[], count: number): slots is number[] {
  return slots.length === count && slots.every(validCell) && new Set(slots).size === slots.length;
}

/** Otomatik dizilim (yakın dövüşçüler önde; motorun defaultSlots'u): koşu başındaki öneri ve eski kayıtların hücresi. */
export const autoSlots = (classIds: string[]): number[] => defaultSlots(classIds);

/** Koşudaki kahramanların hücreleri (kahraman sırasıyla). Hücresi olmayan / çakışan eski kayıt: hepsi otomatik dizilim. */
export function heroSlots(heroes: Pick<EndlessHero, 'class' | 'slot'>[]): number[] {
  const live = heroes.filter((h) => classes[h.class]);
  const own = live.map((h) => h.slot);
  return validSlots(own, live.length) ? own : autoSlots(live.map((h) => h.class));
}

/** İki hücre arası uzaklık (sıra + şerit farkı; Manhattan). */
const cellDist = (a: number, b: number): number => Math.abs(Math.floor(a / LANES) - Math.floor(b / LANES)) + Math.abs((a % LANES) - (b % LANES));

/** `target`e en yakın boş hücre: önce uzaklık, eşitse küçük hücre numarası (önde, üst şerit). Hepsi doluysa -1. */
export function nearestFree(target: number, taken: ReadonlySet<number>): number {
  let best = -1;
  for (let c = 0; c < CELL_COUNT; c++) {
    if (taken.has(c)) continue;
    if (best < 0 || cellDist(c, target) < cellDist(best, target)) best = c;
  }
  return best;
}

/** Savaş sonu: kahraman başına hücre ve sağ mı. */
export interface EndCell {
  heroId: string;
  slot?: number;
  alive: boolean;
}

/**
 * Zafer sonrası hücreler: önce sağ kalanlar savaş sonu hücrelerine (sırayla; çakışırsa en yakın boş), sonra düşenler son hücrelerine
 * (doluysa en yakın boş), kahraman sırasıyla. Savaşta görünmeyen kahraman eski hücresini (yoksa en yakın boşu) korur. Dönen: heroId -> hücre.
 */
export function carrySlots(heroes: Pick<EndlessHero, 'id' | 'class' | 'slot'>[], end: EndCell[]): Map<string, number> {
  const before = heroSlots(heroes);
  const prev = new Map(heroes.filter((h) => classes[h.class]).map((h, i) => [h.id, before[i]!]));
  const endOf = new Map(end.map((u) => [u.heroId, u]));
  const taken = new Set<number>();
  const out = new Map<string, number>();
  const put = (id: string, want: number | undefined) => {
    const w = validCell(want) ? want : (prev.get(id) ?? 0);
    const c = taken.has(w) ? nearestFree(w, taken) : w;
    if (c < 0) return;
    taken.add(c);
    out.set(id, c);
  };
  const order = heroes.filter((h) => prev.has(h.id));
  for (const h of order) if (endOf.get(h.id)?.alive) put(h.id, endOf.get(h.id)!.slot);
  for (const h of order) if (!endOf.get(h.id)?.alive) put(h.id, endOf.get(h.id)?.slot ?? prev.get(h.id));
  return out;
}

// ------------------------------------------------------------ koşu başı dizilim taslağı (takım seçiminden sonra, koşu başlamadan)

/** Dizilim taslağı: seçilen class'lar ve hücreleri (aynı sırada). */
export interface FormationDraft {
  classes: string[];
  slots: number[];
}

export const newDraft = (classIds: string[]): FormationDraft => ({ classes: [...classIds], slots: autoSlots(classIds) });

/** Taslakta `index`inci kahramanı hücreye taşı; hücre doluysa yer değiştir (seferin moveHero kuralı). */
export function moveInDraft(d: FormationDraft, index: number, cell: number): FormationDraft {
  if (index < 0 || index >= d.slots.length || !validCell(cell)) return d;
  const slots = [...d.slots];
  const other = slots.indexOf(cell);
  if (other >= 0) slots[other] = slots[index]!;
  slots[index] = cell;
  return { ...d, slots };
}

/** Taslağı otomatik dizilime döndür ("Auto arrange"). */
export const autoDraft = (d: FormationDraft): FormationDraft => ({ ...d, slots: autoSlots(d.classes) });
