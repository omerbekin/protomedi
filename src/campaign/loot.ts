// Seferde loot'un duruma yazılması (saf; durumu YERİNDE değiştirir, çağıran klonlamış olmalı: state.ts > applyBattle / completeSimple).
// Zar: hash(seed, harita, düğüm, 'loot', tür, oynama sayısı): yenilgi/deneme sayısı ve Retreat loot'u DEĞİŞTİRMEZ (save-scum yok, items.md 3.4).
import { BAG_SIZE, itemDef, rollLoot, type ItemInstance, type LootKind } from '../progression';
import { chapterOf, nodeIlvl } from './power';
import { rngFor } from './seed';
import type { CampaignState, Hero, LootDrop } from './types';

/** Kayıt alanının varsayılanı. */
export const emptyLootState = (): CampaignState['lootState'] => ({ rarePity: 0, clears: {} });

/**
 * Düğümün loot'unu verir: item'ler torbaya (doluysa sığmayanlar kartta `left`: oyuncu yer açıp alabilir), altın kesesine; `pendingLoot` haritada gösterilecek
 * "Spoils" kartıdır (arayüz onaylayınca `acknowledgeLoot`). Aynı düğümün kaçıncı zaferi olduğu `lootState.clears`'ta sayılır.
 */
export function grantLoot(t: CampaignState, nodeId: string, kind: LootKind, party: Hero[]): LootDrop {
  const key = `${nodeId}:${kind === 'treasure' ? 'treasure' : 'battle'}`;
  const replay = t.lootState.clears[key] ?? 0;
  const res = rollLoot({
    rng: rngFor(t.seed, t.mapId, nodeId, 'loot', kind, replay),
    kind,
    chapter: chapterOf(t.mapId).chapter,
    ilvl: nodeIlvl(t.mapId, nodeId),
    party: party.map((h) => ({ class: h.class, equipment: h.equipment })),
    replay,
    pity: t.lootState.rarePity,
  });
  t.lootState.rarePity = res.pity;
  t.lootState.clears[key] = replay + 1;
  const items: ItemInstance[] = [];
  const left: string[] = [];
  for (const id of res.items) {
    if (t.inventory.length < BAG_SIZE) {
      const inst: ItemInstance = { uid: `i${t.nextItemId++}`, id };
      t.inventory.push(inst);
      items.push(inst);
    } else left.push(id); // torba dolu: Spoils kartında "geride kalan" (madde 280)
  }
  t.gold += res.gold;
  const drop: LootDrop = { node: nodeId, kind, items: items.map((i) => i.uid), gold: res.gold, ...(left.length ? { left } : {}) };
  // Aynı düğümde savaş + sandık (korunan hazine): tek kartta birleşir
  const prev = t.pendingLoot;
  if (prev && prev.node === nodeId) {
    const allLeft = [...(prev.left ?? []), ...left];
    t.pendingLoot = { node: nodeId, kind, items: [...prev.items, ...drop.items], gold: prev.gold + drop.gold, ...(allLeft.length ? { left: allLeft } : {}) };
  } else {
    // Önceki kart hiç kapatılmadıysa onun geride kalanları burada kaybolur (normal akışta kart her zaman önce kapanır)
    t.pendingLoot = drop;
  }
  return drop;
}

/**
 * Spoils kartında geride kalan bir item'i torbaya alır (yer açıldıysa). `index` = `pendingLoot.left` içindeki sıra. Yer yoksa durum aynen döner.
 */
export function takeLeftover(s: CampaignState, index: number): CampaignState {
  const left = s.pendingLoot?.left ?? [];
  const id = left[index];
  if (id === undefined || s.inventory.length >= BAG_SIZE || !itemDef(id)) return s;
  const t = JSON.parse(JSON.stringify(s)) as CampaignState;
  const inst: ItemInstance = { uid: `i${t.nextItemId++}`, id };
  t.inventory.push(inst);
  const pl = t.pendingLoot!;
  pl.items.push(inst.uid);
  pl.left = left.filter((_, i) => i !== index);
  if (!pl.left.length) delete pl.left;
  return t;
}

/** Spoils kartı kapandı: geride kalan item'ler (varsa) kaybolur. */
export function acknowledgeLoot(s: CampaignState): CampaignState {
  if (!s.pendingLoot) return s;
  const t = JSON.parse(JSON.stringify(s)) as CampaignState;
  delete t.pendingLoot;
  return t;
}
