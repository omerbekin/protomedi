// Endless koşu durumu ve kuralları (saf; her fonksiyon yeni durum döner, girdiyi değiştirmez). Sayılar data/endless.json'dan.
import { classes } from '../engine/content';
import { BAG_SIZE, ITEMS, RARITY_IDS, canEquip, itemDef, itemIP, itemValue, sellValue, type ItemDef, type ItemInstance, type RarityId, type SlotId } from '../progression/items';
import { bestMoves } from '../progression/equip';
import { emptyEquipment } from '../progression/items';
import { ENDLESS, type EndlessConfig, type EndlessHero, type EndlessRun, type RewardCard, type ScoreEntry, type ShopEntry, type WaveKind } from './data';
import { rngFor, waveKind, waveSeed, type WavePlan } from './waves';
import type { SuspendedBattle } from './replay';
import { relicOffer, victoryHealOf } from './relics';
import { autoSlots, carrySlots, validSlots } from './formation';
import type { Rng } from '../engine/rng';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Yeni koşu: seçilen class'lar (level 1, item yok, tam can). `slots` = koşu başı dizilimi (class'larla aynı sırada hücre; geçersizse /
 * verilmezse otomatik dizilim).
 */
export function newRun(seed: number, classIds: string[], startedAt = new Date().toISOString(), cfg: EndlessConfig = ENDLESS, slots?: number[]): EndlessRun {
  const keep = classIds.map((c, i) => ({ c, i })).filter((x) => classes[x.c]).slice(0, cfg.partySize);
  const picked = keep.map((x) => x.c);
  if (!picked.length) throw new Error('Endless: no valid class picked');
  const want = slots ? keep.map((x) => slots[x.i]) : [];
  const cells = validSlots(want, picked.length) ? want : autoSlots(picked);
  return {
    version: 1,
    seed,
    wave: 1,
    phase: 'ready',
    heroes: picked.map((c, i) => ({ id: `h${i + 1}`, class: c, hpRatio: 1, equipment: {}, slot: cells[i]! })),
    gold: 0,
    stats: { cleared: 0, turns: 0, kills: 0 },
    nextItem: 1,
    startedAt,
  };
}

export const heroOf = (run: EndlessRun, id: string): EndlessHero | undefined => run.heroes.find((h) => h.id === id);

/** Gear Score: takılı item'lerin IP toplamı (items.md 2.3; 1 IP ~ +%1 güç). */
export function gearScore(run: Pick<EndlessRun, 'heroes'>): number {
  let ip = 0;
  for (const h of run.heroes)
    for (const inst of Object.values(h.equipment)) {
      const d = inst ? itemDef(inst.id) : undefined;
      if (d) ip += itemIP(d);
    }
  return Math.round(ip * 10) / 10;
}

// ------------------------------------------------------------ savaş sonucu

export interface WaveOutcome {
  victory: boolean;
  /** Kahraman başına son durum (motor özeti üzerinden); `slot` = savaş sonundaki hücre (dizilim taşınır). */
  units: Array<{ heroId: string; hpRatio: number; alive: boolean; slot?: number }>;
  kills: number;
  turns: number;
}

/** Motor özetinin (battleSummary) birim görünümü. */
export interface SummaryUnitLike {
  uid: string;
  side: string;
  summoned: boolean;
  hp: number;
  maxHp: number;
  slot?: number;
}

/** Savaş özeti -> dalga sonucu: 'party-i' birimi heroOrder[i] kahramanıdır; çağrılar sayılmaz. */
export function outcomeFromSummary(plan: Pick<WavePlan, 'heroOrder'>, victory: boolean, units: SummaryUnitLike[], turns: number): WaveOutcome {
  const heroes = units
    .filter((c) => c.side === 'party' && !c.summoned && /^party-\d+$/.test(c.uid))
    .map((c) => ({ heroId: plan.heroOrder[Number(c.uid.slice('party-'.length))] ?? '', hpRatio: clamp01(c.hp / Math.max(1, c.maxHp)), alive: c.hp > 0, ...(c.slot !== undefined ? { slot: c.slot } : {}) }))
    .filter((u) => u.heroId);
  const kills = units.filter((c) => c.side === 'enemy' && !c.summoned && c.hp <= 0).length;
  return { victory, units: heroes, kills, turns };
}

/**
 * Dalga sonucunu uygular. Yalnızca 'ready' aşamasında ve planın dalgası koşunun dalgasıysa işler (aynı sonuç iki kez yazılmaz).
 * Zafer: can taşıma (seferle aynı: +%20, düşen %20 ile kalkar, boss sonrası tam), dalga +1, ödül kartları. Yenilgi: koşu biter.
 */
export function applyOutcome(run: EndlessRun, plan: Pick<WavePlan, 'wave'>, out: WaveOutcome, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): EndlessRun {
  if (run.phase !== 'ready' || plan.wave !== run.wave) return run;
  const s = clone(run);
  delete s.suspended; // savaş bitti: yarım savaş kaydı artık geçersiz
  s.stats.turns += Math.max(0, out.turns);
  s.stats.kills += Math.max(0, out.kills);
  if (!out.victory) {
    s.phase = 'over';
    s.end = 'defeat';
    for (const u of out.units) {
      const h = heroOf(s, u.heroId);
      if (h) h.hpRatio = u.alive ? u.hpRatio : 0;
    }
    return s;
  }
  const boss = waveKind(run.wave, cfg) === 'boss';
  // Dizilim taşınır: savaş sonundaki hücreler (düşen son hücresine, doluysa en yakın boşa)
  const cells = carrySlots(run.heroes, out.units);
  for (const h of s.heroes) {
    const c = cells.get(h.id);
    if (c !== undefined) h.slot = c;
  }
  for (const u of out.units) {
    const h = heroOf(s, u.heroId);
    if (!h) continue;
    if (boss) h.hpRatio = clamp01(cfg.carry.bossVictoryHeal);
    else h.hpRatio = u.alive ? clamp01(u.hpRatio + victoryHealOf(run.relics, cfg)) : clamp01(cfg.carry.reviveRatio);
  }
  // Hero's Feast: kazanılan her dalga bir hak düşer
  if (s.blessing) {
    s.blessing.waves -= 1;
    if (s.blessing.waves <= 0) delete s.blessing;
  }
  s.stats.cleared = run.wave;
  s.wave = run.wave + 1;
  s.phase = 'reward';
  s.offer = rewardOffer(s, cfg, catalog);
  // Boss zaferi: önce kalıntı seçimi (sahip olunmayan yoksa atlanır), sonra ödül kartları
  if (boss) {
    const relics = relicOffer(s.seed, s.stats.cleared, s.relics, cfg);
    if (relics.length) {
      s.phase = 'relic';
      s.relicOffer = relics;
    }
  }
  return s;
}

/** Kalıntıyı seç (yalnızca 'relic' aşamasında ve teklifteki biri): koşuya eklenir, ödül kartlarına geçilir. */
export function chooseRelic(run: EndlessRun, id: string): EndlessRun {
  if (run.phase !== 'relic' || !run.relicOffer?.includes(id) || run.relics?.includes(id)) return run;
  const s = clone(run);
  s.relics = [...(s.relics ?? []), id];
  delete s.relicOffer;
  s.phase = s.offer ? 'reward' : 'ready';
  return s;
}

/** Kalıntı ver (debug "Give relic"): sahip olunmayan ilk kalıntı (ya da verilen); hepsi varsa durum aynı. Yarım savaş kaydı silinir (kurulum değişti). */
export function grantRelic(run: EndlessRun, id?: string, cfg: EndlessConfig = ENDLESS): EndlessRun {
  const owned = run.relics ?? [];
  const pick = id ?? cfg.relics.list.find((r) => !owned.includes(r.id))?.id;
  if (!pick || owned.includes(pick) || !cfg.relics.list.some((r) => r.id === pick)) return run;
  const s = clone(run);
  s.relics = [...owned, pick];
  delete s.suspended;
  return s;
}

/** Koşudan vazgeç (kamp ekranında, onaylı): skor yine yazılır. */
export function abandonRun(run: EndlessRun): EndlessRun {
  if (run.phase === 'over') return run;
  const s: EndlessRun = { ...clone(run), phase: 'over', end: 'abandoned', offer: undefined, shop: undefined, relicOffer: undefined };
  delete s.shopRerolls;
  delete s.buyback;
  delete s.suspended;
  return s;
}

// ------------------------------------------------------------ yarım kalan savaş

/** Koşunun geçerli yarım savaşı: yalnızca 'ready' aşamasında, aynı dalga ve aynı savaş seed'iyle; değilse null (eski / bozuk kayıt kullanılmaz). */
export function suspendedOf(run: EndlessRun | null): SuspendedBattle | null {
  const x = run?.suspended;
  if (!run || !x || run.phase !== 'ready' || x.wave !== run.wave || x.seed !== waveSeed(run.seed, run.wave)) return null;
  return x;
}

/** Yarım savaşı yazar (`undefined` = siler). Yalnızca 'ready' aşamasında. */
export function withSuspended(run: EndlessRun, x: SuspendedBattle | undefined): EndlessRun {
  if (run.phase !== 'ready') return run;
  const s = clone(run);
  if (x) s.suspended = clone(x);
  else delete s.suspended;
  return s;
}

// ------------------------------------------------------------ item önerisi (ödül kartı + dükkân)

/** Bu dalgada düşebilecek en yüksek item seviyesi. */
export const ilvlCap = (cleared: number, cfg: EndlessConfig = ENDLESS): number => Math.max(1, Math.round(cleared * cfg.items.ilvlPerWave)) + cfg.items.ilvlAhead;

/** Item tanımı: önce verilen katalogda (testler / ileride affix'li örnekler), yoksa items.json'da. */
const defIn = (catalog: ItemDef[], id: string): ItemDef | undefined => catalog.find((d) => d.id === id) ?? itemDef(id);

/** Kahramanın o yuvadaki item'inin IP'si (boş = 0). */
function slotIP(h: EndlessHero, d: ItemDef, catalog: ItemDef[]): number {
  const cur = h.equipment[d.slot];
  const cd = cur ? defIn(catalog, cur.id) : undefined;
  return cd ? itemIP(cd) : 0;
}

/** Nadirlik sırası (0 = common). */
const rarityRank = (r: RarityId): number => RARITY_IDS.indexOf(r);

/** Item önerisinin ek koşulları: seviye tavanına ek (elit/boss), en az nadirlik (yoksa mevcut en yüksek nadirlik). */
export interface PairOptions {
  ilvlBonus?: number;
  minRarity?: RarityId;
}

/**
 * Takım için yükseltme olan (item, kahraman) çiftleri: kahraman takabilir (silah ailesi), item o yuvadakinden güçlü (IP), seviye tavanın altında.
 * `minRarity` verilirse önce o nadirlik ve üstü; hiç yoksa mevcut en yüksek nadirlik (asla boş kalmaz). Sonra en yüksek seviyeli `window` aralığı;
 * `exclude` item id'leri atlanır.
 */
export function upgradePairs(run: EndlessRun, cleared: number, exclude: string[] = [], cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items, o: PairOptions = {}): Array<{ def: ItemDef; heroId: string }> {
  const cap = ilvlCap(cleared, cfg) + (o.ilvlBonus ?? 0);
  let pairs: Array<{ def: ItemDef; heroId: string }> = [];
  for (const d of catalog) {
    if (d.ilvl > cap || exclude.includes(d.id) || bagOf(run).some((i) => i.id === d.id)) continue;
    for (const h of run.heroes) if (canEquip(h.class, d) && itemIP(d) > slotIP(h, d, catalog)) pairs.push({ def: d, heroId: h.id });
  }
  if (!pairs.length) return pairs;
  if (o.minRarity) {
    const floor = rarityRank(o.minRarity);
    const best = Math.max(...pairs.map((p) => rarityRank(p.def.rarity)));
    const need = Math.min(floor, best);
    pairs = pairs.filter((p) => rarityRank(p.def.rarity) >= need);
  }
  const top = Math.max(...pairs.map((p) => p.def.ilvl));
  return pairs.filter((p) => p.def.ilvl > top - cfg.items.window);
}

const pickOne = <T>(list: T[], rng: Rng): T | undefined => (list.length ? list[rng.int(0, list.length - 1)] : undefined);

/** Altın kartının miktarı (temizlenen dalgayla büyür). */
export const goldAmount = (cleared: number, cfg: EndlessConfig = ENDLESS): number => Math.round(cfg.rewards.goldBase + cfg.rewards.goldPerWave * cleared);

/**
 * Dalga arası kartlar (seed'li). Normal dalga: item (yoksa x1,5 altın), altın, iyileştirme (+%40).
 * Elit / boss dalgası (data/endless.json > special): `itemCards` farklı item kartı (en az Rare / Epic, seviye tavanı yüksek), x2 / x3 altın,
 * elitte +%60 iyileştirme, boss'ta Hero's Feast (tam can + birkaç dalga maks can bonusu). Uygun item kalmazsa item kartının yerine altın.
 */
export function rewardOffer(run: EndlessRun, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): RewardCard[] {
  const cleared = run.stats.cleared;
  const rng = rngFor(run.seed, cleared, 'reward');
  const kind = waveKind(cleared, cfg);
  const sp = kind === 'elite' ? cfg.special.elite : kind === 'boss' ? cfg.special.boss : null;
  const gold = Math.round(goldAmount(cleared, cfg) * (sp?.goldMult ?? 1));
  const cards: RewardCard[] = [];
  const taken: string[] = [];
  for (let i = 0; i < (sp?.itemCards ?? 1); i++) {
    const pair = pickOne(upgradePairs(run, cleared, taken, cfg, catalog, sp ? { ilvlBonus: sp.ilvlBonus, minRarity: sp.minRarity } : {}), rng);
    if (pair) {
      taken.push(pair.def.id);
      cards.push({ kind: 'item', itemId: pair.def.id, heroId: pair.heroId });
    } else if (!cards.some((c) => c.kind === 'gold')) cards.push({ kind: 'gold', amount: Math.round(gold * 1.5) });
  }
  cards.push({ kind: 'gold', amount: gold });
  if (kind === 'boss') cards.push({ kind: 'feast', hpMult: cfg.special.boss.feastHpMult, waves: cfg.special.boss.feastWaves });
  else cards.push({ kind: 'heal', ratio: kind === 'elite' ? cfg.special.elite.healRatio : cfg.rewards.healRatio });
  return cards;
}

/**
 * Dükkân stoğu: farklı item'ler, her biri takımda bir yükseltme; fiyat = item değeri. `reroll` (0 = ilk stok) yenilemenin seed'idir;
 * `avoid` id'leri (yenilemede eski mallar) önce dışarıda tutulur, yetmezse yine gelebilir (tezgâh boş kalmasın).
 */
export function shopStock(run: EndlessRun, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items, reroll = 0, avoid: string[] = []): ShopEntry[] {
  const cleared = run.stats.cleared;
  const rng = reroll > 0 ? rngFor(run.seed, cleared, 'shop', reroll) : rngFor(run.seed, cleared, 'shop');
  const out: ShopEntry[] = [];
  const taken: string[] = [];
  for (let i = 0; i < cfg.shop.size; i++) {
    const fresh = avoid.length ? pickOne(upgradePairs(run, cleared, [...taken, ...avoid], cfg, catalog), rng) : undefined;
    const pair = fresh ?? pickOne(upgradePairs(run, cleared, taken, cfg, catalog), rng);
    if (!pair) break;
    taken.push(pair.def.id);
    out.push({ itemId: pair.def.id, heroId: pair.heroId, price: itemValue(pair.def) });
  }
  return out;
}

/** Ödülden sonra: dükkân dalgasıysa dükkân, değilse kamp. */
function afterReward(s: EndlessRun, cfg: EndlessConfig, catalog: ItemDef[]): EndlessRun {
  s.offer = undefined;
  const shopWave = cfg.shop.every > 0 && s.stats.cleared > 0 && s.stats.cleared % cfg.shop.every === 0;
  const stock = shopWave ? shopStock(s, cfg, catalog) : [];
  if (stock.length) {
    s.phase = 'shop';
    s.shop = stock;
  } else {
    s.phase = 'ready';
    s.shop = undefined;
  }
  return s;
}

// ------------------------------------------------------------ torba ve kuşanma (Gear ekranı; seferle aynı kurallar)

/** Torba kapasitesi (data/endless.json > bagSize; yoksa seferin 30'u). */
export const endlessBagSize = (cfg: EndlessConfig = ENDLESS): number => cfg.bagSize ?? BAG_SIZE;

export const bagOf = (run: EndlessRun): ItemInstance[] => run.bag ?? [];

/**
 * Item'i torbaya koyar (yeni örnek uid'i). Torba doluysa satış değerine (`sellValue`) çevrilir (kaybolmaz). Bilinmeyen item: ok false.
 */
function addToBag(s: EndlessRun, itemId: string, catalog: ItemDef[], cfg: EndlessConfig): { ok: boolean; sold: number } {
  const d = defIn(catalog, itemId);
  if (!d) return { ok: false, sold: 0 };
  const bag = (s.bag ??= []);
  if (bag.length >= endlessBagSize(cfg)) {
    const sold = sellValue(d);
    s.gold += sold;
    return { ok: true, sold };
  }
  bag.push({ uid: `e${s.nextItem}`, id: d.id });
  s.nextItem += 1;
  return { ok: true, sold: 0 };
}

/** Debug "Give item": torbaya bir item (verilmezse koşu seed'iyle değil, katalogdaki sıradaki rastgele olmayan seçim: torbada olmayan ilki). */
export function giveItem(run: EndlessRun, itemId?: string, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): EndlessRun {
  const id = itemId ?? catalog.find((d) => !bagOf(run).some((i) => i.id === d.id))?.id;
  if (!id) return run;
  const s = clone(run);
  return addToBag(s, id, catalog, cfg).ok ? s : run;
}

/** Kuşanma yapılabilir mi? Yalnızca kamp / ödül / dükkân aşamasında ve yarım kalan savaş yokken (devam eden savaşın kurulumu değişmesin). */
export function gearLockReason(run: EndlessRun): string | null {
  if (run.phase === 'over') return 'The run is over.';
  if (run.phase === 'relic') return 'Choose a relic first.';
  if (suspendedOf(run)) return 'Finish the suspended battle first.';
  return null;
}

const lockCheck = (run: EndlessRun): void => {
  const why = gearLockReason(run);
  if (why) throw new Error(why);
};

/** Torbadaki item'i kahramana takar; yuvadaki item torbaya döner (sefer `equipItem` ile aynı kural). Hata: Error (Gear ekranı mesajı). */
export function equipFromBag(run: EndlessRun, heroId: string, uid: string): EndlessRun {
  lockCheck(run);
  const hero = heroOf(run, heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  const bag = bagOf(run);
  const idx = bag.findIndex((i) => i.uid === uid);
  if (idx < 0) throw new Error(`Item not in the bag: ${uid}`);
  const d = itemDef(bag[idx]!.id);
  if (!d) throw new Error(`Unknown item: ${bag[idx]!.id}`);
  if (!canEquip(hero.class, d)) throw new Error(`${hero.class} cannot use ${d.family ?? d.slot}`);
  const s = clone(run);
  const h = heroOf(s, heroId)!;
  const nb = [...bagOf(s)];
  const item = nb[idx]!;
  const old = h.equipment[d.slot];
  nb.splice(idx, 1);
  if (old) nb.splice(idx, 0, old);
  h.equipment = { ...h.equipment, [d.slot]: { ...item } };
  s.bag = nb;
  return s;
}

/** Yuvadaki item'i torbaya koyar (torba doluysa hata). */
export function unequipToBag(run: EndlessRun, heroId: string, slot: SlotId, cfg: EndlessConfig = ENDLESS): EndlessRun {
  lockCheck(run);
  const hero = heroOf(run, heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  if (!hero.equipment[slot]) return run;
  if (bagOf(run).length >= endlessBagSize(cfg)) throw new Error('Bag is full');
  const s = clone(run);
  const h = heroOf(s, heroId)!;
  s.bag = [...bagOf(s), h.equipment[slot]!];
  const eq = { ...h.equipment };
  delete eq[slot];
  h.equipment = eq;
  return s;
}

/** Torbadaki item'i atar (kalıcı). */
export function discardFromBag(run: EndlessRun, uid: string): EndlessRun {
  lockCheck(run);
  if (!bagOf(run).some((i) => i.uid === uid)) throw new Error(`Item not in the bag: ${uid}`);
  const s = clone(run);
  s.bag = bagOf(s).filter((i) => i.uid !== uid);
  return s;
}

/** "Equip best" (seferle aynı seçici `bestMoves`; primary bonusunu kapatan item seçilmez). Varsayılan: tüm takım, sırayla. */
export function equipBestRun(run: EndlessRun, heroIds?: string[]): EndlessRun {
  lockCheck(run);
  let s = run;
  for (const id of heroIds ?? run.heroes.map((h) => h.id)) {
    const h = heroOf(s, id);
    if (!h) continue;
    for (const m of bestMoves({ class: h.class, equipment: { ...emptyEquipment(), ...h.equipment } }, bagOf(s))) s = equipFromBag(s, id, m.uid);
  }
  return s;
}

/** Kahramanın 6 yuvalı tam ekipmanı (Gear ekranı / stat paneli; boş yuva null). */
export const fullEquipment = (h: EndlessHero) => ({ ...emptyEquipment(), ...h.equipment });


/** Kartı seç (yalnızca 'reward' aşamasında). */
export function chooseReward(run: EndlessRun, index: number, cfg: EndlessConfig = ENDLESS, catalog: ItemDef[] = ITEMS.items): EndlessRun {
  const card = run.phase === 'reward' ? run.offer?.[index] : undefined;
  if (!card) return run;
  const s = clone(run);
  if (card.kind === 'gold') s.gold += card.amount;
  else if (card.kind === 'heal') for (const h of s.heroes) h.hpRatio = clamp01(h.hpRatio + card.ratio);
  else if (card.kind === 'feast') {
    for (const h of s.heroes) h.hpRatio = 1;
    s.blessing = { hpMult: card.hpMult, waves: card.waves };
  }
  else if (!addToBag(s, card.itemId, catalog, cfg).ok) return run; // item torbaya (Gear ekranında takılır)
  return afterReward(s, cfg, catalog);
}

/** Dükkândan satın al: yeterli altın ve torbada yer varsa item torbaya girer, satır 'sold' olur. */
export function buyItem(run: EndlessRun, index: number, catalog: ItemDef[] = ITEMS.items, cfg: EndlessConfig = ENDLESS): EndlessRun {
  const e = run.phase === 'shop' ? run.shop?.[index] : undefined;
  if (!e || e.sold || run.gold < e.price || bagOf(run).length >= endlessBagSize(cfg)) return run;
  const s = clone(run);
  if (!addToBag(s, e.itemId, catalog, cfg).ok) return run;
  s.gold -= e.price;
  s.shop![index]!.sold = true;
  return s;
}

/** Tüccardan ayrıl: stok, yenileme sayacı ve bu ziyaretin geri alım listesi silinir. */
export function leaveShop(run: EndlessRun): EndlessRun {
  if (run.phase !== 'shop') return run;
  const s: EndlessRun = { ...clone(run), phase: 'ready' };
  delete s.shop;
  delete s.shopRerolls;
  delete s.buyback;
  return s;
}

/** Kartın / dükkân satırının yerine geçeceği item (arayüz: "replaces Turnshoes"). */
export function replacedItem(run: EndlessRun, heroId: string, itemId: string, catalog: ItemDef[] = ITEMS.items): ItemDef | undefined {
  const h = heroOf(run, heroId);
  const d = defIn(catalog, itemId);
  const cur = h && d ? h.equipment[d.slot] : null;
  return cur ? defIn(catalog, cur.id) : undefined;
}

// ------------------------------------------------------------ skor

export function scoreOf(run: EndlessRun, date = new Date().toISOString()): ScoreEntry {
  return { wave: run.wave, cleared: run.stats.cleared, turns: run.stats.turns, kills: run.stats.kills, classes: run.heroes.map((h) => h.class), gearScore: gearScore(run), date };
}

/** Skor sırası: daha çok temizlenen dalga önde; eşitse daha az tur, sonra daha erken tarih. */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  return b.cleared - a.cleared || a.turns - b.turns || a.date.localeCompare(b.date);
}

/** Listeye ekler, sıralar, ilk N'i tutar. Dönen: yeni liste + eklenenin sırası (listeye giremediyse -1). */
export function addScore(list: ScoreEntry[], entry: ScoreEntry, cfg: EndlessConfig = ENDLESS): { list: ScoreEntry[]; rank: number } {
  const all = [...list, entry].sort(compareScores).slice(0, Math.max(1, cfg.highScores));
  return { list: all, rank: all.indexOf(entry) };
}

export const waveLabel = (kind: WaveKind): string => (kind === 'boss' ? 'Boss wave' : kind === 'elite' ? 'Elite wave' : 'Wave');
