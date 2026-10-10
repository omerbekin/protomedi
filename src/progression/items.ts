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
  /** Bütçe çarpanı (Ömer 2026-10-10: Common 1,0 / Uncommon 1,4 / Rare 1,85 / Epic 2,3). */
  mult: number;
  affixes: number;
  color: string;
  /** Item'in TAM stat sayısı (Common 1, Uncommon 2, Rare 3, Epic 3; Ömer 2026-10-10). */
  statCount: number;
  /** Bu nadirlik özel etki (`effect`) taşıyabilir mi (Epic; etkiler henüz onaylı değil: item-effects.md). */
  effect?: boolean;
}

/** Motor kancası adları (src/engine/types.ts > ItemEffects alanları). */
export const EFFECT_HOOKS = ['startShieldRatio', 'critMp', 'secondWind', 'startCharge', 'steadfast', 'debuffShorten', 'tierDamageMult', 'adjacentGuard', 'turnMp', 'firstSkillFree', 'executeLifesteal'] as const;
export type EffectHook = (typeof EFFECT_HOOKS)[number];

/** Epic özel etki tanımı (items.json > effects). `text` içindeki {pct}/{value}/{alan} yer tutucuları `value`'dan doldurulur. */
export interface EffectDef {
  name: string;
  text: string;
  ip: number;
  hook: EffectHook;
  value: number | boolean | Record<string, number>;
}

/** Yuvanın stat kuralı (Ömer 2026-10-10): `main` = ana stat adayları (item en az birini taşır), `extras` = ek stat adayları. '@family' = silah ailesinin ana statı. */
export interface SlotStatRule {
  main: string[];
  extras: string[];
}

export interface StatDef {
  name: string;
  /** 1 birimin Item Points değeri. */
  ip: number;
  /** Motorda bugün karşılığı var mı (src/progression/loadout.ts). */
  engine: boolean;
  integer?: boolean;
  percent?: boolean;
  /** Zar adımı (değerler bunun katı; tam sayı statlarda 1, MP 5, hız 0,5). */
  step: number;
  /** Yalnızca bu yuvalarda olabilir (yoksa her yuvada). Might: yalnızca silah (Ömer 2026-10-09, madde 286). */
  slots?: SlotId[];
}

export interface WeaponFamilyDef {
  id: string;
  name: string;
  classes: string[];
  /** Ailenin ana statı (silahın ana stat adayı; Ömer 2026-10-10: balta/topuz STR, yay/hançer DEX, asa INT, tılsım LUCK). */
  attr: ItemStatId;
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
  /** İsteğe bağlı ikon adı (src/game/item-icons.ts > ITEM_ICONS); yoksa silah ailesinin / yuvanın ikonu. */
  icon?: string;
  /**
   * Epic özel etki kancası (Ömer 2026-10-10: ilkesel evet, etkiler henüz SEÇİLMEDİ; öneri listesi docs/design/progression/item-effects.md).
   * `items.json > effects` kayıtlı bir id olmalı; şu an kayıt BOŞ, hiçbir item taşımaz ve motorda davranışı yoktur.
   */
  effect?: string;
}

export interface ItemsData {
  slots: SlotDef[];
  rarities: RarityDef[];
  setColor: string;
  budget: { base: number; perIlvl: number; endlessPerIlvl: number; tolerance: number; goldPerIP: number; minValue: number; sellRatio: number };
  /** Stat zarları (Ömer 2026-10-10): her stat bütçe değerinin ±spread aralığında, adımına yuvarlanır. */
  rolls: { spread: number };
  slotStats: Record<SlotId, SlotStatRule>;
  /** Epic özel etki kaydı (id -> tanım; Ömer onayı 2026-10-10, madde 292). */
  effects: Record<string, EffectDef>;
  /** Etki kuralları (tek veri anahtarı ile çevrilir; varsayılanlar en güvenli olan, madde 292). */
  effectRules: { ipFromBudget: boolean; stack: boolean; endless: boolean };
  stats: Record<ItemStatId, StatDef>;
  caps: { crit: number; accuracy: number; evasion: number; spd: number; spdPerItem: number };
  weaponFamilies: WeaponFamilyDef[];
  bag: number;
  items: ItemDef[];
  loot: LootConfig;
  bases: unknown[];
  affixes: unknown[];
  uniques: unknown[];
  sets: unknown[];
  traits: Record<string, unknown>;
}

export type LootKind = 'battle' | 'elite' | 'boss' | 'treasure';

/** Loot ayarları (items.json > loot; items.md 3.1-3.4). */
export interface LootConfig {
  perPartyMember: Record<'battle' | 'elite' | 'boss', number>;
  minItems: Record<LootKind, number>;
  minRarity: Partial<Record<LootKind, RarityId>>;
  treasureBase: number;
  treasurePerMember: number;
  eliteShift: number;
  rarityByChapter: Record<string, number[]>;
  pity: { rareAfter: number };
  smartSlotChance: number;
  usableWeaponChance: number;
  repeat: Array<{ items: number; gold: number; maxRarity: RarityId }>;
  gold: Record<LootKind, number>;
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
  /**
   * Zarlanan stat değerleri (Ömer 2026-10-10): item oluşturulurken seed'li zarla bir kez atılır ve kayda yazılır (yeniden yüklemede yeniden
   * atılmaz). Yoksa (eski kayıt) aralığın ortası = katalog değeri kullanılır. Okunurken güncel aralığa sıkıştırılır (veri dengelenirse taşmaz).
   */
  rolls?: Partial<Record<ItemStatId, number>>;
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

/**
 * Item'in STATLARININ hedef IP'si: yuva ağırlığı x B(ilvl) x nadirlik çarpanı; etkisi varsa ve effectRules.ipFromBudget açıksa etkinin IP'si
 * bütçeden düşer (madde 292: güç sabit).
 */
export const targetIP = (d: Pick<ItemDef, 'slot' | 'ilvl' | 'rarity'> & { effect?: string }): number =>
  slotDef(d.slot).weight * levelBudget(d.ilvl) * rarityDef(d.rarity).mult - (d.effect && ITEMS.effectRules?.ipFromBudget ? (ITEMS.effects[d.effect]?.ip ?? 0) : 0);

/** Statların toplam IP'si (gerçek güç). */
export function statsIP(stats: ItemStats): number {
  let ip = 0;
  for (const [k, v] of Object.entries(stats) as Array<[ItemStatId, number]>) ip += (ITEMS.stats[k]?.ip ?? 0) * v;
  return Math.round(ip * 1000) / 1000;
}

/** Item'in IP'si: statlar + etkisi (etki IP'si; değer/fiyat/Gear Score bunu da sayar). */
export const itemIP = (d: ItemDef): number => statsIP(d.stats) + effectIP(d);

/** Etkinin IP'si (yoksa 0). */
export const effectIP = (d: Pick<ItemDef, 'effect'>): number => (d.effect ? (ITEMS.effects[d.effect]?.ip ?? 0) : 0);

// ------------------------------------------------------------ stat zarları (Ömer 2026-10-10)

const snap = (v: number, step: number): number => Math.round(Math.round(v / step) * step * 1000) / 1000;

/**
 * Bir statın zar aralığı [en az, en çok] (Ömer 2026-10-10): katalog değerinin (orta) iki yanına SİMETRİK, en az bir adım
 * (`d = max(adım, değer x spread)`, adıma yuvarlanır); alt uç en az bir adım. Değer tek adımsa (ör. +1 STR, +0,5 hız) aralık yok.
 * Simetrik + tekdüze zar => beklenen değer = katalog değeri (denge sabit).
 */
export function statRange(d: ItemDef, k: ItemStatId): [number, number] {
  const mid = d.stats[k] ?? 0;
  if (!mid) return [0, 0];
  const step = ITEMS.stats[k]?.step ?? 1;
  let dev = Math.max(step, snap(mid * ITEMS.rolls.spread, step));
  if (mid - dev < step) dev = Math.max(0, snap(mid - step, step));
  return [snap(mid - dev, step), snap(mid + dev, step)];
}

/** Item'in tüm statları için seed'li zar (aynı Rng durumu = aynı değerler). Aralığı tek değer olan statlar zar tüketmez. */
export function rollStats(d: ItemDef, rng: { int(min: number, max: number): number }): Partial<Record<ItemStatId, number>> {
  const out: Partial<Record<ItemStatId, number>> = {};
  for (const k of STAT_IDS) {
    if (!d.stats[k]) continue;
    const [lo, hi] = statRange(d, k);
    const step = ITEMS.stats[k]?.step ?? 1;
    const n = Math.round((hi - lo) / step);
    out[k] = n > 0 ? snap(lo + rng.int(0, n) * step, step) : lo;
  }
  return out;
}

/** Yeni item örneği, zarları atılmış (sefer loot'u loot seed'inden, Endless koşu seed'inden Rng verir). */
export function makeItem(id: string, uid: string, rng: { int(min: number, max: number): number }): ItemInstance {
  const d = itemDef(id);
  return d ? { uid, id, rolls: rollStats(d, rng) } : { uid, id };
}

/**
 * Örneğin gerçek statları: zar varsa o (güncel aralığa sıkıştırılıp adıma yuvarlanır), yoksa katalog değeri (aralığın ortası; eski kayıtlar).
 * Katalogda olmayan zar alanları yok sayılır.
 */
export function instanceStats(inst: Pick<ItemInstance, 'id' | 'rolls'>): ItemStats {
  const d = itemDef(inst.id);
  if (!d) return {};
  const out: ItemStats = {};
  for (const k of STAT_IDS) {
    const mid = d.stats[k];
    if (!mid) continue;
    const r = inst.rolls?.[k];
    if (typeof r !== 'number' || !Number.isFinite(r)) {
      out[k] = mid;
      continue;
    }
    const [lo, hi] = statRange(d, k);
    out[k] = snap(Math.min(hi, Math.max(lo, r)), ITEMS.stats[k]?.step ?? 1);
  }
  return out;
}

/** Örneğin IP'si (zarlarıyla; Gear Score, "en zayıf yuva", Equip best). */
export const instanceIP = (inst: Pick<ItemInstance, 'id' | 'rolls'>): number => {
  const d = itemDef(inst.id);
  return statsIP(instanceStats(inst)) + (d ? effectIP(d) : 0);
};

/** Altın değeri = goldPerIP x IP (yuvarlanır, en az minValue). Aynı sayı: tüccar fiyatı, ileride endless Gear Score (items.md 2.1). */
export const itemValue = (d: ItemDef): number => Math.max(ITEMS.budget.minValue, Math.round(ITEMS.budget.goldPerIP * itemIP(d)));

/**
 * Satış değeri = değer x sellRatio (items.json > budget.sellRatio; Ömer 2026-10-09: 0,5), yuvarlanır, en az 1. TEK KAYNAK: tüccarda satış,
 * Endless torba doluyken otomatik satış, ödül kartındaki "Sell: N" ve (ileride) seferin satışı hep bunu kullanır.
 */
export const sellValue = (d: ItemDef): number => Math.max(1, Math.round(itemValue(d) * ITEMS.budget.sellRatio));

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
    if (!Number.isInteger(r.statCount) || r.statCount < 1) errors.push(`rarity ${r.id}: bad statCount`);
    if (!/^#[0-9a-f]{6}$/i.test(r.color)) errors.push(`rarity ${r.id}: bad color`);
  }
  for (const k of STAT_IDS) if (!data.stats[k] || !(data.stats[k].ip > 0) || !(data.stats[k].step > 0)) errors.push(`stat ${k}: missing or bad ip/step`);
  if (!(data.rolls?.spread >= 0 && data.rolls.spread < 0.5)) errors.push('rolls.spread must be in [0, 0.5)');
  for (const slot of SLOT_IDS) {
    const rule = data.slotStats?.[slot];
    if (!rule || !rule.main?.length) {
      errors.push(`slotStats.${slot}: missing main stats`);
      continue;
    }
    for (const k of [...rule.main, ...rule.extras]) if (k !== '@family' && !(STAT_IDS as readonly string[]).includes(k)) errors.push(`slotStats.${slot}: unknown stat ${k}`);
  }
  for (const k of Object.keys(data.stats)) if (!(STAT_IDS as readonly string[]).includes(k)) errors.push(`stat ${k}: unknown stat`);
  if (!Number.isInteger(data.bag) || data.bag <= 0) errors.push('bag: must be a positive integer');
  // Silah aileleri: sınıflar var olmalı, her oynanabilir sınıfın en az bir ailesi olmalı
  const famIds = data.weaponFamilies.map((f) => f.id);
  if (new Set(famIds).size !== famIds.length) errors.push('weaponFamilies: duplicate ids');
  for (const f of data.weaponFamilies) for (const c of f.classes) if (!classes[c]) errors.push(`family ${f.id}: unknown class ${c}`);
  for (const f of data.weaponFamilies) if (!['str', 'dex', 'int', 'luck'].includes(f.attr)) errors.push(`family ${f.id}: attr must be str/dex/int/luck`);
  for (const [id, e] of Object.entries(data.effects ?? {})) {
    if (!e.name || !e.text || !(e.ip > 0)) errors.push(`effect ${id}: needs name, text and ip`);
    if (!(EFFECT_HOOKS as readonly string[]).includes(e.hook)) errors.push(`effect ${id}: unknown hook ${e.hook}`);
  }
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
      if (sd.slots && !sd.slots.includes(d.slot)) errors.push(`${at}: stat ${k} is only allowed on ${sd.slots.join(', ')}`);
    }
    if ((d.stats.spd ?? 0) > data.caps.spdPerItem) errors.push(`${at}: speed above the per-item cap`);
    // Nadirlik = stat sayısı; yuvanın ana statı ve izinli ekleri (Ömer 2026-10-10)
    const rar = data.rarities.find((r) => r.id === d.rarity);
    const rule = data.slotStats?.[d.slot];
    if (rar && rule) {
      if (entries.length !== rar.statCount) errors.push(`${at}: ${rar.name} items have exactly ${rar.statCount} stat(s), found ${entries.length}`);
      const fam = d.family ? data.weaponFamilies.find((f) => f.id === d.family)?.attr : undefined;
      const resolve = (list: string[]) => list.map((k) => (k === '@family' ? fam : k)).filter((k): k is string => !!k);
      const main = resolve(rule.main);
      const allowed = new Set([...main, ...resolve(rule.extras)]);
      if (!entries.some(([k]) => main.includes(k))) errors.push(`${at}: needs a main ${d.slot} stat (${main.join(' / ')})`);
      for (const [k] of entries) if (!allowed.has(k)) errors.push(`${at}: stat ${k} is not allowed on ${d.slot}`);
    }
    if (d.effect !== undefined) {
      if (!rar?.effect) errors.push(`${at}: only Epic items carry an effect`);
      if (!data.effects?.[d.effect]) errors.push(`${at}: unknown effect ${d.effect}`);
    }
    // IP bütçesi (Legendary/Set Aşama 3'te trait/set payıyla ayrıca)
    if (d.rarity !== 'legendary' && slotIds.includes(d.slot) && (RARITY_IDS as readonly string[]).includes(d.rarity)) {
      const target = targetIP(d); // etki IP'si (ipFromBudget) düşülmüş
      const ip = statsIP(d.stats);
      if (Math.abs(ip - target) > target * data.budget.tolerance + 1e-9) errors.push(`${at}: IP ${ip} outside budget ${target.toFixed(2)} ±${data.budget.tolerance * 100}%`);
    }
  }
  return errors;
}

// ------------------------------------------------------------ x2 stat ölçeği kayıt göçü (Ömer onayı 2026-10-10)

/** x2 ölçekli item statları: STR/DEX/INT/LUCK, zırh, büyü zırhı, hız (katalog ve zar değerleri eskinin 2 katı). */
export const SCALED_ITEM_STATS: readonly ItemStatId[] = ['str', 'dex', 'int', 'luck', 'armor', 'magicArmor', 'spd'];

/**
 * Eski (x1 ölçekli) kayıttaki item örneklerinin zarlarını x2 ölçeğe taşır: kayıt ağacında `uid` + `id` + `rolls` taşıyan her nesnenin ölçekli
 * stat zarları 2 ile çarpılır (yerinde). Diğer zarlar (can, MP, kritik...) değişmez. Taşınan örnek sayısını döndürür. Sefer ve Endless kaydı kullanır.
 */
export function migrateRollsX2(root: unknown): number {
  let n = 0;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (typeof rec.uid === 'string' && typeof rec.id === 'string' && rec.rolls && typeof rec.rolls === 'object') {
      const rolls = rec.rolls as Record<string, unknown>;
      let touched = false;
      for (const k of SCALED_ITEM_STATS) {
        const v = rolls[k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          rolls[k] = v * 2;
          touched = true;
        }
      }
      if (touched) n++;
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(root);
  return n;
}
