// Güç toplama katmanı (roadmap.md 1.1; saf, Phaser/DOM yok): savaşa girerken bir kahramanın "class temeli + item'ler (+ ileride level, ağaç)"
// gücü TEK fonksiyonda toplanır ve motorun mevcut kapısına (UnitSetup.modifiers) çevrilir. Sefer ve endless aynı fonksiyonu kullanır;
// Quick Battle / multiplayer kullanmaz (Ömer kararı 2026-10-09: QB/MP dokunulmaz).
// Kural: hiçbir şey takılı değilse modifiers YOK (undefined) => savaş bugünküyle birebir aynı (tests/loadout.test.ts determinizm testi).
import type { Attribute, ItemEffects, UnitModifiers, UnitSetup } from '../engine/types';
import { ITEMS, SLOT_IDS, STAT_IDS, instanceStats, itemDef, type EffectDef, type Equipment, type ItemStatId, type ItemStats } from './items';

/** Güç katmanının girdisi: sefer kahramanı (campaign Hero) ve endless kahramanı bu şekle uyar. */
export interface LoadoutSource {
  class: string;
  /** Aşama 2 (level sistemi) için ayrıldı; şimdilik güce etkisi yok. */
  level?: number;
  equipment?: Partial<Equipment>;
}

export interface LoadoutResult {
  /** Motora giden güçlendirme; hiçbir katkı yoksa undefined (birim bugünkü haliyle aynı). */
  modifiers?: UnitModifiers;
  /** Toplanmış item statları (tavanlar uygulanmış; arayüz önizlemesi / Gear Score için). */
  stats: ItemStats;
  /** Motorda karşılığı olmayan statlar (madde 280'den beri hepsi destekli; liste boş kalır, ileride yeni stat eklenirse dolar). */
  unsupported: ItemStatId[];
  /** Veride bulunamayan item id'leri (kayıt eski/yeni veriyle uyuşmuyorsa; yok sayılır, oyun çökmez). */
  missing: string[];
}

const ATTRS: Attribute[] = ['str', 'dex', 'int', 'luck'];
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Takılı item'lerin statlarını toplar ve tavanları uygular (items.md 1.5: kritik, isabet, kaçınma, hız). */
export function sumEquipment(equipment: Partial<Equipment> | undefined): { stats: ItemStats; missing: string[] } {
  const stats: ItemStats = {};
  const missing: string[] = [];
  for (const slot of SLOT_IDS) {
    const inst = equipment?.[slot];
    if (!inst) continue;
    const d = itemDef(inst.id);
    if (!d) {
      missing.push(inst.id);
      continue;
    }
    // Zarlanmış değerler (Ömer 2026-10-10); zarı olmayan eski örnek = katalog değeri (aralığın ortası)
    const st = instanceStats(inst);
    for (const k of STAT_IDS) {
      const v = st[k];
      if (v) stats[k] = r3((stats[k] ?? 0) + v);
    }
  }
  const caps = ITEMS.caps;
  for (const k of ['crit', 'accuracy', 'evasion', 'spd'] as const) if (stats[k] !== undefined) stats[k] = Math.min(stats[k]!, caps[k]);
  return { stats, missing };
}

/**
 * Kahramanın savaş gücü -> motor güçlendirmesi. Eşleme: STR/DEX/INT/LUCK -> attrAdd, Armor -> armorAdd, Magic Armor -> magicArmorAdd,
 * Might (%) -> powerMult (toplanarak: +%3 ve +%4 = x1,07), Max HP/MP/Speed/Crit/Crit Damage/Accuracy/Evasion/regen -> toplamsal ekler (hpAdd...). Primary bonusu NORMAL kurala göre işler: item'den gelen stat primary statı geçerse bonus
 * kapanır (Ömer, madde 278); kuşanma ekranı bunu önceden `primaryCheck` ile uyarır. Level / ağaç katkıları (Aşama 2-3) aynı toplama eklenecek.
 */
export function loadout(src: LoadoutSource): LoadoutResult {
  const { stats, missing } = sumEquipment(src.equipment);
  const unsupported = (Object.keys(stats) as ItemStatId[]).filter((k) => stats[k] && !ITEMS.stats[k]?.engine);
  const mods: UnitModifiers = {};
  const attrAdd: Partial<Record<Attribute, number>> = {};
  for (const a of ATTRS) if (stats[a]) attrAdd[a] = stats[a]!;
  if (Object.keys(attrAdd).length) mods.attrAdd = attrAdd;
  if (stats.armor) mods.armorAdd = stats.armor;
  if (stats.magicArmor) mods.magicArmorAdd = stats.magicArmor;
  if (stats.might) mods.powerMult = r3(1 + stats.might / 100);
  // Toplamsal ekler (motor, madde 280): yüzdeler motorun 0-1 oranına çevrilir
  if (stats.hp) mods.hpAdd = stats.hp;
  if (stats.mp) mods.mpAdd = stats.mp;
  if (stats.spd) mods.spdAdd = stats.spd;
  if (stats.crit) mods.critAdd = r4(stats.crit / 100);
  if (stats.critDmg) mods.critMultAdd = r4(stats.critDmg / 100);
  if (stats.accuracy) mods.accuracyAdd = r4(stats.accuracy / 100);
  if (stats.evasion) mods.evasionAdd = r4(stats.evasion / 100);
  if (stats.hpRegen) mods.hpRegenAdd = stats.hpRegen;
  if (stats.mpRegen) mods.mpRegenAdd = stats.mpRegen;
  if (!Object.keys(mods).length) return { stats, unsupported, missing };
  return { modifiers: mods, stats, unsupported, missing };
}

/**
 * Takılı item'lerin Epic etkileri -> motor kancaları (UnitSetup.itemEffects; madde 292). effectRules.stack kapalıysa (varsayılan) aynı etki
 * iki item'den gelse de bir kez uygulanır (en yüksek değer); açıksa sayısal değerler toplanır. Etki yoksa undefined.
 */
export function equipmentEffects(equipment: Partial<Equipment> | undefined): ItemEffects | undefined {
  const out: Record<string, unknown> = {};
  const stack = !!ITEMS.effectRules?.stack;
  for (const slot of SLOT_IDS) {
    const inst = equipment?.[slot];
    const id = inst ? itemDef(inst.id)?.effect : undefined;
    const e: EffectDef | undefined = id ? ITEMS.effects[id] : undefined;
    if (!e) continue;
    out[e.hook] = mergeEffect(out[e.hook], e.value, stack);
  }
  return Object.keys(out).length ? (out as ItemEffects) : undefined;
}

/** İki etki değerini birleştirir: sayı (en yüksek ya da toplam), boolean (ya da), nesne (alan alan aynı kural; eşik alanları değişmez). */
function mergeEffect(prev: unknown, next: EffectDef['value'], stack: boolean): unknown {
  if (prev === undefined) return typeof next === 'object' ? { ...next } : next;
  if (typeof next === 'boolean') return !!prev || next;
  if (typeof next === 'number') return stack ? (prev as number) + next : Math.max(prev as number, next);
  const p = prev as Record<string, number>;
  const thresholds = new Set(['below', 'above', 'cap']);
  const thr = new Set([...thresholds, 'turns', 'every']); // eşik / süre / sıklık alanları toplanmaz; metin alanları (durum id'si) aynen
  return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, typeof v === 'string' || thr.has(k) ? v : stack ? (p[k] ?? 0) + v : Math.max(p[k] ?? 0, v)]));
}

/**
 * Kahramanın savaş kurulumu (UnitSetup) parçası: statlar (modifiers) + Epic etkileri (itemEffects); yoksa boş nesne. Çağıran başka alanlarla
 * (startHpRatio...) birleştirir. `effects: false` = etkiler verilmez (Endless'ta effectRules.endless kapalıysa).
 */
export function loadoutSetup(src: LoadoutSource, o: { effects?: boolean } = {}): Pick<UnitSetup, 'modifiers' | 'itemEffects'> {
  const m = loadout(src).modifiers;
  const fx = o.effects === false ? undefined : equipmentEffects(src.equipment);
  return { ...(m ? { modifiers: m } : {}), ...(fx ? { itemEffects: fx } : {}) };
}
