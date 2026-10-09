// Gear ekranında sürükle-bırak / çift tıklama kararları (saf; DOM'suz, testli: tests/gear-drop.test.ts).
// Torbadaki item: aynı türdeki yuvaya ya da soldaki bir kahramana bırakılınca o kahramana kuşanılır (silah ailesi uymalı);
// kuşanılmış yuvadaki item torbaya bırakılınca çıkarılır. Geri kalan her şey geçersiz (ikon yerine döner).
import { canEquip, itemDef, type SlotId } from '../progression';

export type DragSource = { kind: 'bag'; uid: string; itemId: string } | { kind: 'slot'; heroId: string; slot: SlotId };
export type DropTarget = { kind: 'slot'; heroId: string; slot: SlotId } | { kind: 'hero'; heroId: string } | { kind: 'bag' };
export type DropAction = { kind: 'equip'; heroId: string; uid: string } | { kind: 'unequip'; heroId: string; slot: SlotId } | { kind: 'none'; reason?: string };

/** `classOf`: kahramanın sınıfı (yoksa undefined). */
export function dropAction(src: DragSource, target: DropTarget, classOf: (heroId: string) => string | undefined): DropAction {
  if (src.kind === 'slot') {
    return target.kind === 'bag' ? { kind: 'unequip', heroId: src.heroId, slot: src.slot } : { kind: 'none' };
  }
  if (target.kind === 'bag') return { kind: 'none' };
  const d = itemDef(src.itemId);
  const cls = classOf(target.heroId);
  if (!d || !cls) return { kind: 'none' };
  if (target.kind === 'slot' && target.slot !== d.slot) return { kind: 'none', reason: 'Wrong slot' };
  if (!canEquip(cls, d)) return { kind: 'none', reason: 'Cannot use' };
  return { kind: 'equip', heroId: target.heroId, uid: src.uid };
}

/** Çift tıklama / çift dokunma: aynı hedefe iki dokunuş `ms` içinde mi? */
export function isDoubleTap(prev: { key: string; at: number } | null, key: string, at: number, ms = 380): boolean {
  return !!prev && prev.key === key && at - prev.at <= ms;
}
