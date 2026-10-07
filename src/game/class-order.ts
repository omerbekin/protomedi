import type { Attribute } from '../engine/types';

/**
 * Class'ların primary statına göre sırası (takım seçimi rafı + wiki class listesi): STR - DEX - INT - LUCK.
 * Pure helper: class names are never listed here, the order comes from each class's `primary` field.
 * Grup içi sıra: ada göre alfabetik (büyük/küçük harf ve tire fark etmez). Primary'si olmayan class'lar gruplardan sonra,
 * test class'ları (`testOnly`) en sonda.
 */
export const PRIMARY_ORDER: readonly Attribute[] = ['str', 'dex', 'int', 'luck'];

export interface OrderableClass {
  id: string;
  name: string;
  primary?: Attribute;
  testOnly?: boolean;
}

/** Sıra anahtarı: 0..3 = primary grubu, 4 = primary'siz, 5 = test class'ı. */
export function classGroupRank(c: OrderableClass): number {
  if (c.testOnly) return PRIMARY_ORDER.length + 1;
  const i = c.primary ? PRIMARY_ORDER.indexOf(c.primary) : -1;
  return i >= 0 ? i : PRIMARY_ORDER.length;
}

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Class'ları primary grubuna göre sıralar (yeni liste döner); grup içi ada göre, eşitlikte id. */
export function sortByPrimary<T extends OrderableClass>(classes: readonly T[]): T[] {
  return [...classes].sort((a, b) => classGroupRank(a) - classGroupRank(b) || plain(a.name).localeCompare(plain(b.name)) || a.id.localeCompare(b.id));
}

/** Ardışık aynı gruptaki class'lar. `stat` = primary grubu; primary'siz ve test grupları `null`. */
export interface ClassGroup<T> {
  stat: Attribute | null;
  test: boolean;
  items: T[];
}

export function groupByPrimary<T extends OrderableClass>(classes: readonly T[]): ClassGroup<T>[] {
  const groups: ClassGroup<T>[] = [];
  let lastRank = -1;
  for (const c of sortByPrimary(classes)) {
    const rank = classGroupRank(c);
    if (rank !== lastRank) {
      groups.push({ stat: rank < PRIMARY_ORDER.length ? PRIMARY_ORDER[rank]! : null, test: rank > PRIMARY_ORDER.length, items: [] });
      lastRank = rank;
    }
    groups[groups.length - 1]!.items.push(c);
  }
  return groups;
}

/** Primary stat -> grup rengi (data/battle-layout.json > colors.primaryGroup); bilinmeyen/primary'siz için `fallback`. */
export function groupColor(map: Partial<Record<Attribute, string>>, stat: Attribute | null | undefined, fallback = '#b9a27a'): string {
  return (stat && map[stat]) || fallback;
}
