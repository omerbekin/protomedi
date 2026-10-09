// Item verisi ve kuralları (saf TypeScript; Phaser/DOM yok). Tasarım: docs/design/progression/items.md (Ömer kararları bölüm 7).
// Aşama 0: şema, doğrulama, IP/değer hesabı, kuşanma kuralı. Loot, tüccar, affix üreteci Aşama 1-2'de.
import itemsJson from '../../data/items.json';
import { classes, randomPool } from '../engine/content';

/** 6 yuva (karar 1). Sıra veridekiyle aynı. */
export const SLOT_IDS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'trinket'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type RarityId = (typeof RARITY_IDS)[number];

/** Item statları (items.md 1.5). */
export const STAT_IDS = ['str', 'dex', 'int', 'luck', 'armor', 'magicArmor', 'might', 'hp', 'crit', 'critDmg', 'accuracy', 'evasion', 'spd', 'mp', 'mpRegen', 'hpRegen'] as const;
export type ItemStatId = (typeof STAT_IDS)[number];
export type ItemStats = Partial<Record<ItemStatId, number>>;

export interface SlotDef {
  id: SlotId;
  name: string;
  weight: number;
}

export interface RarityDef {
  id: RarityId;
  name: string;
  mult: number;
  affixes: number;
  color: string;
}

export interface StatDef {
  name: string;
  /** 1 birimin Item Points değeri. */
  ip: number;
  /** Motorda bugün karşılığı var mı (src/progression/loadout.ts). */
  engine: boolean;
  integer?: boolean;
  percent?: boolean;
}

export interface WeaponFamilyDef {
  id: string;
  name: string;
  classes: string[];
}

/** Sabit (el yapımı) item. */
export interface ItemDef {
  id: string;
  name: string;
  slot: SlotId;
  /** Yalnızca silahta (karar 2: silah aileleri). */
  family?: string;
  rarity: RarityId;
  ilvl: number;
  stats: ItemStats;
}

export interface ItemsData {
  slots: SlotDef[];
  rarities: RarityDef[];
  setColor: string;
  budget: { base: number; perIlvl: number; endlessPerIlvl: number; tolerance: number; goldPerIP: number; minValue: number; sellRatio: number };
  stats: Record<ItemStatId, StatDef>;
  caps: { crit: number; accuracy: number; evasion: number; spd: number; spdPerItem: number };
  weaponFamilies: WeaponFamilyDef[];
  bag: number;
  items: ItemDef[];
  bases: unknown[];
  affixes: unknown[];
  uniques: unknown[];
  sets: unknown[];
  traits: Record<string, unknown>;
}

export const ITEMS: ItemsData = itemsJson as unknown as ItemsData;

/**
 * Kayıttaki item örneği (roadmap 1.4: kayda yalnızca id (+ ileride seed'li zar) yazılır, asıl sayılar veriden hesaplanır; item verisi
 * dengelenince eski kayıtlar da yeni sayıları alır). `uid` sefer içinde tekil. `affixes` Aşama 2 (affix üreteci) için ayrıldı.
 */
export interface ItemInstance {
  uid: string;
  id: string;
  affixes?: Array<{ id: string; roll: number }>;
}

/** Kahramanın takılı item'leri: 6 yuvanın hepsi anahtar olarak var, boş = null. */
export type Equipment = Record<SlotId, ItemInstance | null>;

export const emptyEquipment = (): Equipment => Object.fromEntries(SLOT_IDS.map((k) => [k, null])) as Equipment;

/** Torba kapasitesi (items.json > bag; 30). */
export const BAG_SIZE = ITEMS.bag;

const byId = new Map(ITEMS.items.map((d) => [d.id, d]));
export const itemDef = (id: string): ItemDef | undefined => byId.get(id);

export const slotDef = (id: SlotId): SlotDef => ITEMS.slots.find((s) => s.id === id)!;
export const rarityDef = (id: RarityId): RarityDef => ITEMS.rarities.find((r) => r.id === id)!;

/** Seviye bütçesi B(ilvl) = base + perIlvl x ilvl (items.md 1.4). */
export const levelBudget = (ilvl: number): number => ITEMS.budget.base + ITEMS.budget.perIlvl * ilvl;

/** Item'in hedef IP'si: yuva ağırlığı x B(ilvl) x nadirlik çarpanı. */
export const targetIP = (d: Pick<ItemDef, 'slot' | 'ilvl' | 'rarity'>): number => slotDef(d.slot).weight * levelBudget(d.ilvl) * rarityDef(d.rarity).mult;

/** Statların toplam IP'si (gerçek güç). */
export function statsIP(stats: ItemStats): number {
  let ip = 0;
  for (const [k, v] of Object.entries(stats) as Array<[ItemStatId, number]>) ip += (ITEMS.stats[k]?.ip ?? 0) * v;
  return Math.round(ip * 1000) / 1000;
}

export const itemIP = (d: ItemDef): number => statsIP(d.stats);

/** Altın değeri = goldPerIP x IP (yuvarlanır, en az minValue). Aynı sayı: tüccar fiyatı, ileride endless Gear Score (items.md 2.1). */
export const itemValue = (d: ItemDef): number => Math.max(ITEMS.budget.minValue, Math.round(ITEMS.budget.goldPerIP * itemIP(d)));

/** Sınıfın kullanabildiği silah aileleri (karar 2). */
export const classWeaponFamilies = (classId: string): string[] => ITEMS.weaponFamilies.filter((f) => f.classes.includes(classId)).map((f) => f.id);

/** Bu sınıf bu item'i takabilir mi? Silah değilse herkes; silahsa ailesi sınıfa izinli olmalı. */
export function canEquip(classId: string, d: ItemDef): boolean {
  if (d.slot !== 'weapon') return true;
  return !!d.family && classWeaponFamilies(classId).includes(d.family);
}

/** items.json doğrulaması (boş liste = geçerli). Test: tests/items-data.test.ts. */
export function validateItems(data: ItemsData = ITEMS): string[] {
  const errors: string[] = [];
  const slotIds = data.slots.map((s) => s.id);
  if (slotIds.join() !== SLOT_IDS.join()) errors.push(`slots must be ${SLOT_IDS.join(', ')}`);
  for (const s of data.slots) if (!(s.weight > 0) || !s.name) errors.push(`slot ${s.id}: bad weight/name`);
  if (data.rarities.map((r) => r.id).join() !== RARITY_IDS.join()) errors.push(`rarities must be ${RARITY_IDS.join(', ')}`);
  for (const r of data.rarities) {
    if (!(r.mult > 0) || !Number.isInteger(r.affixes) || r.affixes < 0) errors.push(`rarity ${r.id}: bad mult/affixes`);
    if (!/^#[0-9a-f]{6}$/i.test(r.color)) errors.push(`rarity ${r.id}: bad color`);
  }
  for (const k of STAT_IDS) if (!data.stats[k] || !(data.stats[k].ip > 0)) errors.push(`stat ${k}: missing or bad ip`);
  for (const k of Object.keys(data.stats)) if (!(STAT_IDS as readonly string[]).includes(k)) errors.push(`stat ${k}: unknown stat`);
  if (!Number.isInteger(data.bag) || data.bag <= 0) errors.push('bag: must be a positive integer');
  // Silah aileleri: sınıflar var olmalı, her oynanabilir sınıfın en az bir ailesi olmalı
  const famIds = data.weaponFamilies.map((f) => f.id);
  if (new Set(famIds).size !== famIds.length) errors.push('weaponFamilies: duplicate ids');
  for (const f of data.weaponFamilies) for (const c of f.classes) if (!classes[c]) errors.push(`family ${f.id}: unknown class ${c}`);
  for (const c of randomPool) if (!data.weaponFamilies.some((f) => f.classes.includes(c))) errors.push(`class ${c} has no weapon family`);
  // Item'ler
  const ids = data.items.map((d) => d.id);
  if (new Set(ids).size !== ids.length) errors.push('items: duplicate ids');
  for (const d of data.items) {
    const at = `item ${d.id}`;
    if (!d.name) errors.push(`${at}: no name`);
    if (!slotIds.includes(d.slot)) errors.push(`${at}: unknown slot ${d.slot}`);
    if (!(RARITY_IDS as readonly string[]).includes(d.rarity)) errors.push(`${at}: unknown rarity ${d.rarity}`);
    if (!Number.isInteger(d.ilvl) || d.ilvl < 1) errors.push(`${at}: ilvl must be a positive integer`);
    if (d.slot === 'weapon' && !famIds.includes(d.family ?? '')) errors.push(`${at}: weapon needs a known family`);
    if (d.slot !== 'weapon' && d.family !== undefined) errors.push(`${at}: only weapons have a family`);
    const entries = Object.entries(d.stats ?? {}) as Array<[ItemStatId, number]>;
    if (!entries.length) errors.push(`${at}: no stats`);
    for (const [k, v] of entries) {
      const sd = data.stats[k];
      if (!sd) {
        errors.push(`${at}: unknown stat ${k}`);
        continue;
      }
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push(`${at}: stat ${k} must be positive`);
      if (sd.integer && !Number.isInteger(v)) errors.push(`${at}: stat ${k} must be an integer`);
      if (!sd.engine) errors.push(`${at}: stat ${k} is not supported by the engine yet (needs a UnitModifiers field, engine-dev)`);
    }
    if ((d.stats.spd ?? 0) > data.caps.spdPerItem) errors.push(`${at}: speed above the per-item cap`);
    // IP bütçesi (Legendary/Set Aşama 3'te trait/set payıyla ayrıca)
    if (d.rarity !== 'legendary' && slotIds.includes(d.slot) && (RARITY_IDS as readonly string[]).includes(d.rarity)) {
      const target = targetIP(d);
      const ip = statsIP(d.stats);
      if (Math.abs(ip - target) > target * data.budget.tolerance + 1e-9) errors.push(`${at}: IP ${ip} outside budget ${target.toFixed(2)} ±${data.budget.tolerance * 100}%`);
    }
  }
  return errors;
}
