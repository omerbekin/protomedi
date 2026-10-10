// "Equip best" (saf): bir kahraman için torbadan en iyi item'leri seçer. Kuşanma ekranındaki düğme ve sefer sim'inin `best` politikası
// aynı fonksiyonu kullanır (items.md 4.4, 5.4). Puan = item IP'si, ana statlar sınıfa göre ağırlıklı; primary bonusunu kapatacak item seçilmez.
import { classes } from '../engine/content';
import { canEquip, instanceStats, legendaryConflict, ITEMS, itemDef, SLOT_IDS, STAT_IDS, type Equipment, type ItemDef, type ItemInstance, type ItemStats, type SlotId } from './items';
import { primaryCheck } from './primary';

/** Sınıfın bu item'e verdiği değer: ana stat (STR/DEX/INT/LUCK) sınıfın primary'si ise tam, değilse çeyrek; diğer statlar tam IP. */
export const itemScore = (classId: string, d: ItemDef): number => statsScore(classId, d.stats);

/** Örneğin (zarlarıyla) sınıfa değeri. */
export const instanceScore = (classId: string, inst: ItemInstance): number => statsScore(classId, instanceStats(inst));

function statsScore(classId: string, stats: ItemStats): number {
  const primary = classes[classId]?.primary;
  let score = 0;
  for (const k of STAT_IDS) {
    const v = stats[k];
    if (!v) continue;
    const isAttr = k === 'str' || k === 'dex' || k === 'int' || k === 'luck';
    score += ITEMS.stats[k].ip * v * (isAttr && k !== primary ? 0.25 : 1);
  }
  return Math.round(score * 1000) / 1000;
}

export interface EquipMove {
  slot: SlotId;
  uid: string;
}

/**
 * Bir kahramanın torbadan yapacağı en iyi değişimler (yuva başına en yüksek puanlı, kullanılabilir, primary'yi bozmayan ve takılıdan
 * iyi item). `taken`: başka kahramanlara ayrılmış uid'ler (takım için sırayla çağrılır).
 */
export function bestMoves(hero: { class: string; equipment: Equipment }, bag: ItemInstance[], taken: Set<string> = new Set()): EquipMove[] {
  const moves: EquipMove[] = [];
  let equipment = { ...hero.equipment };
  for (const slot of SLOT_IDS) {
    const cur = equipment[slot];
    const curDef = cur ? itemDef(cur.id) : undefined;
    let best: { inst: ItemInstance; score: number } | undefined;
    for (const inst of bag) {
      if (taken.has(inst.uid)) continue;
      const d = itemDef(inst.id);
      if (!d || d.slot !== slot || !canEquip(hero.class, d) || legendaryConflict(equipment, d)) continue;
      const score = instanceScore(hero.class, inst);
      if (best && score <= best.score) continue;
      if (primaryCheck({ class: hero.class, equipment }, { equip: inst }).lost) continue;
      best = { inst, score };
    }
    if (best && best.score > (cur && curDef ? instanceScore(hero.class, cur) : 0)) {
      moves.push({ slot, uid: best.inst.uid });
      taken.add(best.inst.uid);
      equipment = { ...equipment, [slot]: best.inst };
    }
  }
  return moves;
}
