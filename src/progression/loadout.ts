// Güç toplama katmanı (roadmap.md 1.1; saf, Phaser/DOM yok): savaşa girerken bir kahramanın "class temeli + item'ler (+ ileride level, ağaç)"
// gücü TEK fonksiyonda toplanır ve motorun mevcut kapısına (UnitSetup.modifiers) çevrilir. Sefer ve endless aynı fonksiyonu kullanır;
// Quick Battle / multiplayer kullanmaz (Ömer kararı 2026-10-09: QB/MP dokunulmaz).
// Kural: hiçbir şey takılı değilse modifiers YOK (undefined) => savaş bugünküyle birebir aynı (tests/loadout.test.ts determinizm testi).
import type { Attribute, UnitModifiers, UnitSetup } from '../engine/types';
import { ITEMS, SLOT_IDS, STAT_IDS, itemDef, type Equipment, type ItemStatId, type ItemStats } from './items';

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
  /** Motorda henüz karşılığı olmayan, bu yüzden savaşa yansımayan statlar (engine-dev, Aşama 1). */
  unsupported: ItemStatId[];
  /** Veride bulunamayan item id'leri (kayıt eski/yeni veriyle uyuşmuyorsa; yok sayılır, oyun çökmez). */
  missing: string[];
}

const ATTRS: Attribute[] = ['str', 'dex', 'int', 'luck'];
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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
    for (const k of STAT_IDS) {
      const v = d.stats[k];
      if (v) stats[k] = r3((stats[k] ?? 0) + v);
    }
  }
  const caps = ITEMS.caps;
  for (const k of ['crit', 'accuracy', 'evasion', 'spd'] as const) if (stats[k] !== undefined) stats[k] = Math.min(stats[k]!, caps[k]);
  return { stats, missing };
}

/**
 * Kahramanın savaş gücü -> motor güçlendirmesi. Eşleme: STR/DEX/INT/LUCK -> attrAdd, Armor -> armorAdd, Magic Armor -> magicArmorAdd,
 * Might (%) -> powerMult (toplanarak: +%3 ve +%4 = x1,07). Primary bonusu NORMAL kurala göre işler: item'den gelen stat primary statı geçerse bonus
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
  if (!Object.keys(mods).length) return { stats, unsupported, missing };
  return { modifiers: mods, stats, unsupported, missing };
}

/** Kahramanın savaş kurulumu (UnitSetup) parçası; güç yoksa boş nesne. Çağıran başka alanlarla (startHpRatio...) birleştirir. */
export function loadoutSetup(src: LoadoutSource): Pick<UnitSetup, 'modifiers'> {
  const m = loadout(src).modifiers;
  return m ? { modifiers: m } : {};
}
