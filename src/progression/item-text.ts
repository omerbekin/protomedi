// Item metinleri ve karşılaştırma (saf; kuşanma ekranı, loot kartı, wiki aynı fonksiyonu kullanır). Oyun içi metinler İngilizce.
import { classes, formulas } from '../engine/content';
import { applyUnitModifiers } from '../engine/stats';
import { ITEMS, itemDef, rarityDef, slotDef, STAT_IDS, type Equipment, type ItemDef, type ItemInstance, type ItemStatId } from './items';
import { loadout, type LoadoutSource } from './loadout';

const PCT = new Set<ItemStatId>(['might', 'crit', 'critDmg', 'accuracy', 'evasion']);

/** Tek stat satırı: "+3% Might", "+12 Max HP", "+0.5 Speed". */
export function statLine(k: ItemStatId, v: number): string {
  const name = ITEMS.stats[k]?.name ?? k;
  const num = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${v >= 0 ? '+' : ''}${num}${PCT.has(k) ? '%' : ''} ${name}`;
}

/** Item'in stat satırları (veri sırasıyla). */
export const itemLines = (d: ItemDef): string[] => STAT_IDS.filter((k) => d.stats[k]).map((k) => statLine(k, d.stats[k]!));

/** Alt başlık: "Rare Gloves · Item level 9" (silahta aile adı). */
export function itemSubtitle(d: ItemDef): string {
  const fam = d.family ? ITEMS.weaponFamilies.find((f) => f.id === d.family)?.name : undefined;
  return `${rarityDef(d.rarity).name} ${fam ?? slotDef(d.slot).name} · Item level ${d.ilvl}`;
}

/** Kuşanma ekranının stat paneli: gösterilen değerler (oyun içi kısaltmalar, alt bar stat bloğuyla aynı dil). */
export interface HeroPanelStat {
  id: string;
  label: string;
  value: number;
  /** Gösterim: tam sayı, yüzde ya da 1 ondalık. */
  fmt: 'int' | 'pct' | 'dec';
}

/** Kahramanın savaşa gireceği statlar (temel + item'ler; güç katmanıyla AYNI hesap). */
export function heroPanel(src: LoadoutSource): HeroPanelStat[] {
  const def = classes[src.class];
  if (!def) return [];
  const st = applyUnitModifiers(def, loadout(src).modifiers, formulas).stats;
  return [
    { id: 'hp', label: 'HP', value: st.hp, fmt: 'int' },
    { id: 'mp', label: 'MP', value: st.mp, fmt: 'int' },
    { id: 'str', label: 'STR', value: st.str, fmt: 'dec' },
    { id: 'dex', label: 'DEX', value: st.dex, fmt: 'dec' },
    { id: 'int', label: 'INT', value: st.int, fmt: 'dec' },
    { id: 'luck', label: 'LUCK', value: st.luck, fmt: 'dec' },
    { id: 'power', label: 'MIGHT', value: (st.spellPowerMult ?? 1) - 1, fmt: 'pct' },
    { id: 'armor', label: 'ARM', value: st.armor, fmt: 'int' },
    { id: 'magicArmor', label: 'M.ARM', value: st.magicArmor, fmt: 'int' },
    { id: 'crit', label: 'CRIT', value: st.critChance, fmt: 'pct' },
    { id: 'critMult', label: 'CDMG', value: st.critMult, fmt: 'dec' },
    { id: 'accuracy', label: 'ACC', value: st.accuracy, fmt: 'pct' },
    { id: 'evasion', label: 'EVA', value: st.evasion, fmt: 'pct' },
    { id: 'spd', label: 'SPD', value: st.spd, fmt: 'dec' },
    { id: 'hpRegen', label: 'HP+/t', value: st.hpRegen, fmt: 'dec' },
    { id: 'mpRegen', label: 'MP+/t', value: st.mpRegen, fmt: 'int' },
  ];
}

export function fmtPanel(s: Pick<HeroPanelStat, 'value' | 'fmt'>): string {
  if (s.fmt === 'pct') return `${Math.round(s.value * 1000) / 10}%`;
  if (s.fmt === 'dec') return String(Math.round(s.value * 10) / 10);
  return String(Math.round(s.value));
}

/** Bu item takılırsa panelde değişen statlar (fark: + / -). */
export function equipDiff(src: LoadoutSource & { equipment: Equipment }, inst: ItemInstance): Array<HeroPanelStat & { delta: number }> {
  const d = itemDef(inst.id);
  if (!d) return [];
  const now = heroPanel(src);
  const after = heroPanel({ ...src, equipment: { ...src.equipment, [d.slot]: inst } });
  return after
    .map((a, i) => ({ ...a, delta: Math.round((a.value - now[i]!.value) * 10000) / 10000 }))
    .filter((x) => x.delta !== 0);
}

/** Primary bonusunun oyun içi adı (uyarı metni). */
export const PRIMARY_BONUS_NAME: Record<string, string> = { str: 'Resilience', dex: "Hunter's Mark", int: 'Mana Echo', luck: 'Lucky Escape' };
