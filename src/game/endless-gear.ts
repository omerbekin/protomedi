import { bagOf, discardFromBag, endlessBagSize, equipBestRun, equipFromBag, fullEquipment, unequipToBag, type EndlessRun } from '../endless';
import { openGear, type GearSource } from '../ui/gear-screen';

/**
 * Endless'ın Gear kaynağı (adaptör): seferin Gear ekranı (src/ui/gear-screen.ts) aynen kullanılır; işlemler src/endless/run.ts'in saf
 * torba fonksiyonlarıdır (silah ailesi, primary uyarısı, "Equip best" seferle aynı). `get` / `set` koşu durumunu okur / yazar (set = kayıt).
 */
export function endlessGearSource(get: () => EndlessRun, set: (r: EndlessRun) => void): GearSource {
  const apply = (fn: (r: EndlessRun) => EndlessRun): void => set(fn(get()));
  return {
    heroes: () => get().heroes.map((h) => ({ id: h.id, class: h.class, level: 1, equipment: fullEquipment(h) })),
    bag: () => bagOf(get()),
    bagSize: endlessBagSize(),
    gold: () => get().gold,
    equip: (heroId, uid) => apply((r) => equipFromBag(r, heroId, uid)),
    unequip: (heroId, slot) => apply((r) => unequipToBag(r, heroId, slot)),
    discard: (uid) => apply((r) => discardFromBag(r, uid)),
    equipBest: (ids) => apply((r) => equipBestRun(r, ids)),
    emptyText: 'The bag is empty. Rewards and the merchant bring new gear.',
  };
}

/** Kamp ekranından Gear'ı açar (DOM katmanı; kapanınca `onClose`). */
export function openEndlessGear(root: HTMLElement, get: () => EndlessRun, set: (r: EndlessRun) => void, onClose: () => void, hero?: string): () => void {
  return openGear(root, endlessGearSource(get, set), { hero, onClose });
}
