// Primary bonusu uyarısı (saf; Ömer kararı, madde 278): primary statını başka bir stat geçince primary bonusu (Resilience / Hunter's Mark /
// Mana Echo / Lucky Escape) normal kurala göre KAPANIR; item, level ya da skill ağacı bunu yapacaksa oyuncu ÖNCEDEN uyarılır.
// Kuşanma ekranı (Aşama 1) ve skill ağacı (Aşama 3) bu yardımcıyı kullanır. Motor kuralı değişmez (src/engine/stats.ts > isPrimaryActive).
import { classes, formulas } from '../engine/content';
import { applyUnitModifiers, isPrimaryActive } from '../engine/stats';
import type { Attribute, Attributes, UnitModifiers } from '../engine/types';
import { itemDef, type Equipment, type ItemInstance } from './items';
import { loadout, type LoadoutSource } from './loadout';

/** Denenen değişiklik: bir item takmak (yuvasındakinin yerine) ve/veya düz stat puanı (level / ağaç). */
export interface PrimaryChange {
  equip?: ItemInstance;
  attrDelta?: Partial<Attributes>;
}

export interface PrimaryCheck {
  primary?: Attribute;
  activeNow: boolean;
  activeAfter: boolean;
  /** Değişiklik bonusu kapatıyor (uyarı gösterilmeli). */
  lost: boolean;
  /** Değişiklik kapalı bonusu açıyor. */
  gained: boolean;
  /** Değişiklikten sonra primary statı GEÇEN statlar (uyarı metni için: "STR would exceed INT"). */
  overtakenBy: Attribute[];
  /** Değişiklik sonrası dört stat. */
  after: Attributes;
}

const ATTRS: Attribute[] = ['str', 'int', 'dex', 'luck'];

function attrsWith(classId: string, mods: UnitModifiers | undefined): Attributes {
  const def = classes[classId];
  if (!def) throw new Error(`Unknown class: ${classId}`);
  return applyUnitModifiers(def, mods, formulas).attributes;
}

/** Kahramanın statlarına bu değişiklik uygulanırsa primary bonusu ne olur? */
export function primaryCheck(src: LoadoutSource, change: PrimaryChange): PrimaryCheck {
  const primary = classes[src.class]?.primary;
  const now = attrsWith(src.class, loadout(src).modifiers);
  let equipment: Partial<Equipment> | undefined = src.equipment;
  if (change.equip) {
    const d = itemDef(change.equip.id);
    if (d) equipment = { ...(src.equipment ?? {}), [d.slot]: change.equip };
  }
  const mods: UnitModifiers = { ...(loadout({ ...src, equipment }).modifiers ?? {}) };
  if (change.attrDelta) {
    const add: Partial<Attributes> = { ...(mods.attrAdd ?? {}) };
    for (const k of ATTRS) if (change.attrDelta[k]) add[k] = (add[k] ?? 0) + change.attrDelta[k]!;
    mods.attrAdd = add;
  }
  const after = attrsWith(src.class, Object.keys(mods).length ? mods : undefined);
  const activeNow = isPrimaryActive(now, primary);
  const activeAfter = isPrimaryActive(after, primary);
  const overtakenBy = primary ? ATTRS.filter((k) => k !== primary && after[k] > after[primary]) : [];
  return { ...(primary ? { primary } : {}), activeNow, activeAfter, lost: activeNow && !activeAfter, gained: !activeNow && activeAfter, overtakenBy, after };
}

/** Kısa yol: bu item / puan primary bonusunu kapatır mı? */
export const primaryBonusLost = (src: LoadoutSource, change: PrimaryChange): boolean => primaryCheck(src, change).lost;
