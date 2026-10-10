import { afterEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine';
import { activeHeroes, applyBattle, debugTeleport, newCampaign, normalizeState, pickHero, type CampaignState } from '../src/campaign';
import { ITEMS, RARE, itemDef, itemValue, legendaryPool, rareChance, rollRareDrop, type RareDropConfig } from '../src/progression';
import { applyOutcome, newRun, shopStock, wavePlan } from '../src/endless';
import { parseRun } from '../src/endless/save';

// Ortak nadir düşüş zarı (Ömer onayı 2026-10-10, madde 297): şans, kötü şans koruması, set kancası, Valdoria yarılama, Endless dalga kapısı, tüccar.

const cfgWith = (patch: Partial<RareDropConfig>): RareDropConfig => ({ ...JSON.parse(JSON.stringify(RARE)), ...patch }) as RareDropConfig;
const always = (o: Partial<RareDropConfig> = {}) => cfgWith({ chance: { battle: 1, elite: 1, boss: 1 }, ...o });

describe('veri ve şans', () => {
  it('taban: normal %1, elit %3, boss %6; düşüşsüz her zafer +%0,5; Endless dalga başına +%0,1; set %75 / Legendary %25; Valdoria x0,5', () => {
    expect(RARE.chance).toEqual({ battle: 0.01, elite: 0.03, boss: 0.06 });
    expect(RARE.pityPerMiss).toBe(0.005);
    expect(RARE.split).toEqual({ set: 0.75, legendary: 0.25 });
    expect(RARE.setsEnabled).toBe(false);
    expect(RARE.chapterLegendaryMult['1']).toBe(0.5);
    expect(RARE.endless.legendaryFromWave).toBe(11);
    expect(rareChance('battle', 0)).toBeCloseTo(0.01, 9);
    expect(rareChance('elite', 4)).toBeCloseTo(0.03 + 0.02, 9);
    expect(rareChance('boss', 0, 20)).toBeCloseTo(0.06 + 0.02, 9);
  });

  it('Valdoria havuzu 3 Legendary (Emberbrand, Mantle of Valdren, Pilgrim\'s Road Boots); Endless havuzu 11. dalgadan itibaren hepsi', () => {
    expect(legendaryPool({ chapter: 1 }).map((d) => d.id).sort()).toEqual(['emberbrand', 'mantle_of_valdren', 'pilgrims_road_boots']);
    expect(legendaryPool({ chapter: 3 })).toHaveLength(10);
    expect(legendaryPool({ wave: 10 })).toHaveLength(0);
    expect(legendaryPool({ wave: 11 })).toHaveLength(10);
  });
});

describe('zar', () => {
  it('belirleyici: aynı zar aynı sonuç', () => {
    const a = rollRareDrop({ rng: new Rng(7), kind: 'boss', misses: 3, chapter: 2 });
    const b = rollRareDrop({ rng: new Rng(7), kind: 'boss', misses: 3, chapter: 2 });
    expect(a).toEqual(b);
  });

  it('isabette set dalı (set item yok) hiçbir şey vermez ve sayacı sıfırlamaz; Legendary dalı ~%25 (bölüm 2), Valdoria\'da yarısı', () => {
    const rate = (chapter: number) => {
      let leg = 0;
      for (let i = 0; i < 4000; i++) {
        const r = rollRareDrop({ rng: new Rng(i), kind: 'battle', misses: 2, chapter, cfg: always() });
        if (r.item) {
          leg++;
          expect(r.misses).toBe(0);
        } else expect(r.misses).toBe(3); // set dalı ya da boş: sayaç sürer
      }
      return leg / 4000;
    };
    expect(rate(2)).toBeGreaterThan(0.22);
    expect(rate(2)).toBeLessThan(0.28);
    expect(rate(1)).toBeGreaterThan(0.1);
    expect(rate(1)).toBeLessThan(0.15);
  });

  it('kötü şans koruması: düşüşsüz zafer sayacı artar, şans büyür, düşüşte tabana döner', () => {
    let misses = 0;
    let dropped = false;
    for (let i = 0; i < 2000 && !dropped; i++) {
      const before = misses;
      const r = rollRareDrop({ rng: new Rng(1000 + i), kind: 'battle', misses, chapter: 2 });
      expect(r.chance).toBeCloseTo(rareChance('battle', before), 9);
      misses = r.misses;
      if (r.item) {
        dropped = true;
        expect(misses).toBe(0);
      } else expect(misses).toBe(before + 1);
    }
    expect(dropped).toBe(true);
  });

  it('akıllı loot yok: havuzdan tekdüze (Valdoria\'nın 3 item\'i de düşer, tekrarlar dahil)', () => {
    const seen = new Map<string, number>();
    const cfg = always({ split: { set: 0, legendary: 1 }, chapterLegendaryMult: {} });
    for (let i = 0; i < 900; i++) {
      const r = rollRareDrop({ rng: new Rng(i), kind: 'battle', misses: 0, chapter: 1, cfg });
      seen.set(r.item!, (seen.get(r.item!) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual(['emberbrand', 'mantle_of_valdren', 'pilgrims_road_boots']);
    for (const n of seen.values()) expect(n).toBeGreaterThan(220);
  });

  it('Endless dalga kapısı: 10. dalgada Legendary yok, 11. dalgada var', () => {
    const cfg = always({ split: { set: 0, legendary: 1 } });
    expect(rollRareDrop({ rng: new Rng(1), kind: 'battle', misses: 0, wave: 10, cfg }).item).toBeUndefined();
    expect(rollRareDrop({ rng: new Rng(1), kind: 'battle', misses: 0, wave: 11, cfg }).item).toBeDefined();
  });
});

describe('sefer ve Endless bağlantısı, kayıt', () => {
  afterEach(() => {
    RARE.chance.battle = 0.01;
    RARE.endless.merchant.chance = 0.1;
  });

  it('sefer: her savaş zaferinde zar; sayaç kayıtta; eski kayıtta yoksa 0', () => {
    const s0: CampaignState = { ...debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 5 }), 'archer'), '5A'), inventory: [] };
    const before = s0.lootState.rareMisses ?? 0;
    const s1 = applyBattle(s0, { victory: true, units: activeHeroes(s0).map((h) => ({ heroId: h.id, hpRatio: 1, alive: true })) });
    expect([before + 1, 0]).toContain(s1.lootState.rareMisses);
    const old = JSON.parse(JSON.stringify(s1)) as CampaignState;
    delete old.lootState.rareMisses;
    expect(normalizeState(old)!.lootState.rareMisses).toBe(0);
  });

  it('sefer: isabet olunca nadir item torbada ve Spoils kartında işaretli', () => {
    RARE.chance.battle = 1;
    let hit: CampaignState | null = null;
    for (let seed = 1; seed < 80 && !hit; seed++) {
      const s0: CampaignState = { ...debugTeleport(pickHero(newCampaign({ mode: 'normal', seed }), 'archer'), '5A'), inventory: [] };
      const s1 = applyBattle(s0, { victory: true, units: activeHeroes(s0).map((h) => ({ heroId: h.id, hpRatio: 1, alive: true })) });
      if (s1.pendingLoot?.rare?.length) hit = s1;
    }
    expect(hit).not.toBeNull();
    const id = hit!.pendingLoot!.rare![0]!;
    expect(itemDef(id)!.rarity).toBe('legendary');
    expect(hit!.inventory.some((i) => i.id === id)).toBe(true);
    expect(hit!.lootState.rareMisses).toBe(0);
  });

  it('Endless: zaferde zar (sayaç), eski kayıtta sayaç 0; tüccar 11. dalgadan itibaren nadir mal (yüksek fiyat)', () => {
    let run = newRun(3, ['warrior', 'archer', 'mage', 'druid'], 't');
    const plan = wavePlan(run);
    run = applyOutcome(run, plan, { victory: true, units: run.heroes.map((h) => ({ heroId: h.id, hpRatio: 1, alive: true })), kills: 3, turns: 10 });
    expect(run.rarePity).toBe(1); // dalga 1 < 11: Legendary yok, set dalı boş => düşüş yok
    const raw = JSON.stringify({ version: 2, run: { ...run, rarePity: 'x' } });
    expect(parseRun(raw)!.rarePity).toBe(0);
    RARE.endless.merchant.chance = 1;
    const late = { ...run, wave: 12, stats: { ...run.stats, cleared: 11 } };
    const stock = shopStock(late);
    const rare = stock.filter((e) => itemDef(e.itemId)!.rarity === 'legendary');
    expect(rare).toHaveLength(1);
    expect(rare[0]!.price).toBe(Math.round(itemValue(itemDef(rare[0]!.itemId)!) * RARE.endless.merchant.priceMult));
    const early = { ...run, wave: 10, stats: { ...run.stats, cleared: 9 } };
    expect(shopStock(early).some((e) => itemDef(e.itemId)!.rarity === 'legendary')).toBe(false);
    void ITEMS;
  });
});
