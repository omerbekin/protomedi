// Loot üretimi (saf, seed'li; Phaser/DOM yok). Tasarım: docs/design/progression/items.md 3.1-3.4; Ömer kararları: düşen item sayısı ve
// nadirlik her zorlukta AYNI (karar 6), boss/hazine düşüşleri otomatik (karar 8), tekrar oynamada azalan ödül (roadmap 2.3 A).
// Sefer (src/campaign/loot.ts) ve endless aynı fonksiyonu kullanabilir; rastgelelik yalnızca verilen Rng'den.
import type { Rng } from '../engine/rng';
import { classWeaponFamilies, ITEMS, RARITY_IDS, SLOT_IDS, instanceIP, itemDef, type Equipment, type ItemDef, type LootKind, type RarityId, type SlotId } from './items';

export interface LootInput {
  rng: Rng;
  kind: LootKind;
  /** Bölüm (1..3): nadirlik eğrisi. */
  chapter: number;
  /** Düğümün item seviyesi: bu seviyeye kadar olan item'ler düşer. */
  ilvl: number;
  /** Aktif takım (sınıf + takılı item'ler): takım boyutu, "akıllı" yuva ve kullanılabilir silah ailesi için. */
  party: Array<{ class: string; equipment?: Partial<Equipment> }>;
  /** Kaçıncı zafer (0 = ilk). Tekrarda azalan ödül, nadirlik tavanı; garanti/pity yalnızca ilk zaferde. */
  replay?: number;
  /** Art arda Rare'siz düşüş sayacı (pity). */
  pity?: number;
}

export interface LootResult {
  /** Düşen item id'leri (sırayla). */
  items: string[];
  gold: number;
  /** Güncel pity sayacı. */
  pity: number;
}

const rIdx = (r: RarityId) => RARITY_IDS.indexOf(r);

/** Kesirli beklentiyi seed'li yuvarlar (taban + kalan olasılık). */
function roundChance(rng: Rng, v: number): number {
  const base = Math.floor(v);
  return base + (rng.next() < v - base ? 1 : 0);
}

/** Bölüm eğrisinden nadirlik zarı. */
function rollRarity(rng: Rng, chapter: number): number {
  const curve = ITEMS.loot.rarityByChapter[String(chapter)] ?? ITEMS.loot.rarityByChapter['1']!;
  const total = curve.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < curve.length; i++) {
    r -= curve[i]!;
    if (r < 0) return i;
  }
  return 0;
}

/** Takımdaki en zayıf yuva (boş = 0 IP); eşitlikte seed'li seçim. */
function weakestSlot(rng: Rng, party: LootInput['party']): SlotId {
  let best = Infinity;
  let slots: SlotId[] = [];
  for (const h of party)
    for (const k of SLOT_IDS) {
      const inst = h.equipment?.[k];
      const ip = inst && itemDef(inst.id) ? instanceIP(inst) : 0;
      if (ip < best) {
        best = ip;
        slots = [k];
      } else if (ip === best && !slots.includes(k)) slots.push(k);
    }
  return slots.length ? slots[rng.int(0, slots.length - 1)]! : SLOT_IDS[rng.int(0, SLOT_IDS.length - 1)]!;
}

/**
 * Bir item seç: yuva (+ silahta aile), nadirlik, ilvl <= düğüm ilvl'si. Uygun yoksa önce aile/yuva gevşer, sonra nadirlik bir kademe iner;
 * `floor` (garanti nadirlik) altına inilmez: o kademede ilvl gevşer (en düşük ilvl'li o nadirlikte item).
 */
function pickItem(rng: Rng, slot: SlotId, family: string | undefined, rarity: number, ilvl: number, floor: number): ItemDef | undefined {
  const fit = (r: number, useSlot: boolean, capIlvl: boolean) =>
    ITEMS.items.filter((d) => rIdx(d.rarity) === r && (!useSlot || (d.slot === slot && (slot !== 'weapon' || !family || d.family === family))) && (!capIlvl || d.ilvl <= ilvl));
  const choose = (pool: ItemDef[]) => pool[rng.int(0, pool.length - 1)];
  for (let r = rarity; r >= floor; r--) {
    for (const useSlot of [true, false]) {
      const pool = fit(r, useSlot, true);
      if (pool.length) return choose(pool);
    }
    if (r === floor && floor > 0) {
      const pool = fit(r, false, false).sort((a, b) => a.ilvl - b.ilvl);
      if (pool.length) return choose(pool.filter((d) => d.ilvl === pool[0]!.ilvl));
    }
  }
  return undefined;
}

/** Bir zaferin / sandığın loot'u (items.md 3.1-3.4). Aynı Rng durumu + aynı girdi = aynı sonuç. */
export function rollLoot(o: LootInput): LootResult {
  const L = ITEMS.loot;
  const rng = o.rng;
  const replay = Math.max(0, o.replay ?? 0);
  const rep = L.repeat[Math.min(replay, L.repeat.length - 1)]!;
  const first = replay === 0;
  const n = Math.max(1, o.party.length);
  const expected = o.kind === 'treasure' ? L.treasureBase + L.treasurePerMember * n : L.perPartyMember[o.kind] * n;
  let count = roundChance(rng, expected * rep.items);
  if (first) count = Math.max(count, L.minItems[o.kind] ?? 0);
  const families = [...new Set(o.party.flatMap((h) => classWeaponFamilies(h.class)))];
  const minR = first ? L.minRarity[o.kind] : undefined;
  const cap = rIdx(rep.maxRarity);
  let pity = o.pity ?? 0;
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    let r = rollRarity(rng, o.chapter);
    if (o.kind === 'elite') r += L.eliteShift;
    let floor = 0;
    if (i === 0 && minR) floor = rIdx(minR);
    if (first && pity >= L.pity.rareAfter) floor = Math.max(floor, rIdx('rare'));
    r = Math.min(Math.max(r, floor), cap, RARITY_IDS.length - 1);
    floor = Math.min(floor, r);
    const slot = rng.next() < L.smartSlotChance ? weakestSlot(rng, o.party) : SLOT_IDS[rng.int(0, SLOT_IDS.length - 1)]!;
    let family: string | undefined;
    if (slot === 'weapon') {
      const all = ITEMS.weaponFamilies.map((f) => f.id);
      const usable = families.length && rng.next() < L.usableWeaponChance ? families : all;
      family = usable[rng.int(0, usable.length - 1)];
    }
    const d = pickItem(rng, slot, family, r, o.ilvl, floor);
    if (!d) continue;
    items.push(d.id);
    if (first) pity = rIdx(d.rarity) >= rIdx('rare') ? 0 : pity + 1;
  }
  const gold = Math.round((L.gold[o.kind] ?? 0) * Math.max(1, o.ilvl) * rep.gold);
  return { items, gold, pity };
}
