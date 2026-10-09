// Endless tüccarı (Odo the Peddler; Ömer 2026-10-09, taslak v1 "Travelling cart"): satış, bu ziyaretin geri alımı, malları yenileme ve
// detay panelinin saf hesapları (kim kullanır, en büyük yükseltme kimde, takılıyla stat farkı). Saf; her fonksiyon yeni durum döner.
// Satın alma run.ts > buyItem, ayrılma run.ts > leaveShop. Ekran: src/game/scenes/EndlessScene.ts > drawShop. Sayılar data/endless.json > shop.
import { ITEMS, STAT_IDS, canEquip, itemDef, itemIP, sellValue, type ItemDef, type ItemStatId } from '../progression/items';
import { ENDLESS, type EndlessConfig, type EndlessHero, type EndlessRun } from './data';
import { bagOf, endlessBagSize, heroOf, shopStock } from './run';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const defIn = (catalog: ItemDef[], id: string): ItemDef | undefined => catalog.find((d) => d.id === id) ?? itemDef(id);

/** Torbadaki item'in satış fiyatı (bilinmeyen item: 0). */
export function sellPriceOf(run: EndlessRun, uid: string, catalog: ItemDef[] = ITEMS.items): number {
  const inst = bagOf(run).find((i) => i.uid === uid);
  const d = inst ? defIn(catalog, inst.id) : undefined;
  return d ? sellValue(d) : 0;
}

/**
 * Torbadaki item'i tüccara sat (yalnızca 'shop' aşamasında): altın += satış değeri, item bu ziyaretin geri alım listesine girer
 * (aynı örnek, aynı fiyat; liste shop.buybackSize'ı aşarsa en eskisi düşer). Takılı item'ler satılmaz (önce Gear'da çıkarılır).
 */
export function sellItem(run: EndlessRun, uid: string, catalog: ItemDef[] = ITEMS.items, cfg: EndlessConfig = ENDLESS): EndlessRun {
  if (run.phase !== 'shop') return run;
  const idx = bagOf(run).findIndex((i) => i.uid === uid);
  if (idx < 0) return run;
  const d = defIn(catalog, bagOf(run)[idx]!.id);
  if (!d) return run;
  const s = clone(run);
  const [item] = s.bag!.splice(idx, 1);
  const price = sellValue(d);
  s.gold += price;
  const list = [...(s.buyback ?? []), { item: item!, price }];
  s.buyback = list.slice(Math.max(0, list.length - Math.max(1, cfg.shop.buybackSize)));
  return s;
}

/** Geri alım: bu ziyarette satılan item aynı fiyata torbaya döner (aynı uid). Altın ya da torba yeri yetmezse durum aynı. */
export function buybackItem(run: EndlessRun, index: number, cfg: EndlessConfig = ENDLESS): EndlessRun {
  const e = run.phase === 'shop' ? run.buyback?.[index] : undefined;
  if (!e || run.gold < e.price || bagOf(run).length >= endlessBagSize(cfg)) return run;
  const s = clone(run);
  s.gold -= e.price;
  s.bag = [...bagOf(s), { ...e.item }];
  s.buyback!.splice(index, 1);
  return s;
}

/** Malları yenile (seed'li; her yenileme farklı): shop.rerollCost altın. Yeni stok çıkmazsa ya da altın yetmezse durum aynı. */
export function rerollShop(run: EndlessRun, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): EndlessRun {
  if (run.phase !== 'shop' || run.gold < cfg.shop.rerollCost) return run;
  const n = (run.shopRerolls ?? 0) + 1;
  const stock = shopStock(run, cfg, catalog, n, (run.shop ?? []).map((e) => e.itemId));
  if (!stock.length) return run;
  const s = clone(run);
  s.gold -= cfg.shop.rerollCost;
  s.shop = stock;
  s.shopRerolls = n;
  return s;
}

/** Debug "Open merchant": kamptaki koşuyu tüccar aşamasına alır (temizlenen dalganın stoğu). Stok çıkmazsa durum aynı. */
export function openShop(run: EndlessRun, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): EndlessRun {
  if (run.phase !== 'ready' || run.suspended) return run;
  const stock = shopStock(run, cfg, catalog);
  if (!stock.length) return run;
  const s = clone(run);
  s.phase = 'shop';
  s.shop = stock;
  delete s.shopRerolls;
  delete s.buyback;
  return s;
}

/** Bu item'i takabilen kahramanlar (silah aileleri; silah değilse herkes). */
export const usableHeroes = (run: EndlessRun, d: ItemDef): EndlessHero[] => run.heroes.filter((h) => canEquip(h.class, d));

/** Kahramanın o yuvadaki item'i (boş: undefined). */
export function equippedFor(run: EndlessRun, heroId: string, d: ItemDef, catalog: ItemDef[] = ITEMS.items): ItemDef | undefined {
  const cur = heroOf(run, heroId)?.equipment[d.slot];
  return cur ? defIn(catalog, cur.id) : undefined;
}

/** Stat farkı satırı: şimdiki (takılı), yeni ve fark. */
export interface StatDelta {
  stat: ItemStatId;
  now: number;
  next: number;
  diff: number;
}

/** Takılıyla karşılaştırma: iki item'de geçen her stat (veri sırasıyla). */
export function statDelta(run: EndlessRun, heroId: string, d: ItemDef, catalog: ItemDef[] = ITEMS.items): StatDelta[] {
  const cur = equippedFor(run, heroId, d, catalog);
  const out: StatDelta[] = [];
  for (const k of STAT_IDS) {
    const now = cur?.stats[k] ?? 0;
    const next = d.stats[k] ?? 0;
    if (!now && !next) continue;
    out.push({ stat: k, now, next, diff: Math.round((next - now) * 100) / 100 });
  }
  return out;
}

/** IP kazancı (yeni item IP - takılı item IP; boş yuva 0). */
export const ipGain = (run: EndlessRun, heroId: string, d: ItemDef, catalog: ItemDef[] = ITEMS.items): number => {
  const cur = equippedFor(run, heroId, d, catalog);
  return itemIP(d) - (cur ? itemIP(cur) : 0);
};

/** "BEST": item'i takabilenler içinde en büyük IP kazancı olan kahraman (kazanç yoksa null). Eşitlikte takım sırası. */
export function bestHeroFor(run: EndlessRun, d: ItemDef, catalog: ItemDef[] = ITEMS.items): string | null {
  let best: string | null = null;
  let gain = 0;
  for (const h of usableHeroes(run, d)) {
    const g = ipGain(run, h.id, d, catalog);
    if (g > gain + 1e-9) {
      gain = g;
      best = h.id;
    }
  }
  return best;
}

/** Fiyat için eksik altın (yetiyorsa 0). */
export const goldShort = (run: EndlessRun, price: number): number => Math.max(0, price - run.gold);
