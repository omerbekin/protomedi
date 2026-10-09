// Sefer ekipmanı (saf; her işlem YENİ durum döndürür): torba, kuşanma, çıkarma, altın ve kahramanın savaş gücü.
// Aşama 0 temeli (roadmap 1.4); loot / tüccar / ekranlar Aşama 1. Kurallar: docs/design/progression/items.md.
import { BAG_SIZE, canEquip, itemDef, loadout, SLOT_IDS, type ItemInstance, type LoadoutResult, type SlotId } from '../progression';
import { clone, heroById } from './state';
import type { CampaignState, Hero } from './types';

/** Torbada yer var mı? */
export const bagHasRoom = (s: CampaignState, n = 1): boolean => s.inventory.length + n <= BAG_SIZE;

/** Torbaya yeni bir item örneği ekler (veride olmalı). Torba doluysa hata (loot ekranı Aşama 1'de "Bag full" kararını sorar). */
export function addItem(s: CampaignState, itemId: string): { state: CampaignState; item: ItemInstance } {
  if (!itemDef(itemId)) throw new Error(`Unknown item: ${itemId}`);
  if (!bagHasRoom(s)) throw new Error('Bag is full');
  const t = clone(s);
  const item: ItemInstance = { uid: `i${t.nextItemId++}`, id: itemId };
  t.inventory.push(item);
  return { state: t, item };
}

/** Kahraman bu item'i takabilir mi (yuva ve silah ailesi)? Hata nedeni ya da null. */
export function equipError(hero: Hero, item: ItemInstance): string | null {
  const d = itemDef(item.id);
  if (!d) return `Unknown item: ${item.id}`;
  if (!canEquip(hero.class, d)) return `${hero.class} cannot use ${d.family ?? d.slot}`;
  return null;
}

/** Torbadaki item'i kahramana takar; yuvada item varsa torbaya geri döner (yer değiştirme: torba boyutu değişmez). */
export function equipItem(s: CampaignState, heroId: string, uid: string): CampaignState {
  const hero = heroById(s, heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  const idx = s.inventory.findIndex((it) => it.uid === uid);
  if (idx < 0) throw new Error(`Item not in the bag: ${uid}`);
  const item = s.inventory[idx]!;
  const err = equipError(hero, item);
  if (err) throw new Error(err);
  const slot = itemDef(item.id)!.slot;
  const t = clone(s);
  const h = heroById(t, heroId)!;
  const old = h.equipment[slot];
  t.inventory.splice(idx, 1);
  if (old) t.inventory.splice(idx, 0, old);
  h.equipment[slot] = { ...item };
  return t;
}

/** Yuvadaki item'i çıkarıp torbaya koyar (torba doluysa hata). */
export function unequipItem(s: CampaignState, heroId: string, slot: SlotId): CampaignState {
  const hero = heroById(s, heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  if (!hero.equipment[slot]) return s;
  if (!bagHasRoom(s)) throw new Error('Bag is full');
  const t = clone(s);
  const h = heroById(t, heroId)!;
  t.inventory.push(h.equipment[slot]!);
  h.equipment[slot] = null;
  return t;
}

/** Altın ekler/çıkarır (eksiye düşmez). */
export function addGold(s: CampaignState, amount: number): CampaignState {
  const t = clone(s);
  t.gold = Math.max(0, Math.round(t.gold + amount));
  return t;
}

/** Kahramanın takılı item sayısı. */
export const equippedCount = (h: Hero): number => SLOT_IDS.filter((k) => h.equipment?.[k]).length;

/** Kahramanın savaş gücü (güç toplama katmanı; Party ekranı önizlemesi ve battlePlan aynı fonksiyonu kullanır). */
export const heroLoadout = (h: Hero): LoadoutResult => loadout(h);
