import { FAMILY_ICON, SLOT_ICON } from '../game/item-icons';
import { itemIconImg } from '../ui/item-icon-dom';

/**
 * Codex "Items and gear" makalesi için yuva ikonları. Tek ortak kaynak: src/game/item-icons.ts (Gear ekranı, Spoils kartı ve Endless
 * kartları da aynı piksel art çizimlerini kullanır). `color` = nadirlik rengi: yalnızca mücevher / kenar ayrıntılarını boyar.
 */
export const SLOT_GLYPH: Readonly<Record<string, string>> = SLOT_ICON;

/** Yuva ikonunun resim öğesi (bilinmeyen yuva: muska). */
export function slotGlyph(slot: string, color: string, cls = 'cx-slot-svg'): HTMLImageElement {
  return itemIconImg(SLOT_GLYPH[slot] ?? 'amulet', color, `${cls} cx-px`);
}

/** Silah ailesi ikonu (data/items.json > weaponFamilies; bilinmeyen aile: balta). */
export function familyGlyph(family: string, color: string, cls = 'cx-slot-svg'): HTMLImageElement {
  return itemIconImg(FAMILY_ICON[family] ?? 'axe', color, `${cls} cx-px`);
}
