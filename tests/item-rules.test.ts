import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine';
import { activeHeroes, applyBattle, debugTeleport, latestSave, memoryKV, newCampaign, normalizeState, pickHero, writeSave, type CampaignState } from '../src/campaign';
import {
  ITEMS,
  instanceIP,
  instanceLines,
  instanceStats,
  itemDef,
  itemIP,
  loadout,
  makeItem,
  rollStats,
  statLine,
  statRange,
  validateItems,
  type ItemsData,
} from '../src/progression';
import { chooseReward, newRun } from '../src/endless';

// Item yeniden yapılanması (Ömer onayı 2026-10-10; items.md 1.3a): nadirlik = stat sayısı + güç, yuva ana statı + izinli ekler,
// stat zarları (seed'li, kayda yazılır), Epic etki kancası (davranış yok).

const copy = (): ItemsData => JSON.parse(JSON.stringify(ITEMS)) as ItemsData;

describe('nadirlik = stat sayısı + güç', () => {
  it('Common 1 stat x1,0 / Uncommon 2 x1,4 / Rare 3 x1,85 / Epic 3 x2,3 (+ etki kancası)', () => {
    const r = Object.fromEntries(ITEMS.rarities.map((x) => [x.id, x]));
    expect([r.common!.statCount, r.uncommon!.statCount, r.rare!.statCount, r.epic!.statCount]).toEqual([1, 2, 3, 3]);
    expect([r.common!.mult, r.uncommon!.mult, r.rare!.mult, r.epic!.mult]).toEqual([1, 1.4, 1.85, 2.3]);
    expect(r.epic!.effect).toBe(true);
    expect(r.rare!.effect).toBeUndefined();
  });

  it('katalog geçerli: her item doğru stat sayısında, yuvasının ana statını taşır, ekleri izinli, bütçe ±%10', () => {
    expect(validateItems()).toEqual([]);
    for (const d of ITEMS.items) {
      const rar = ITEMS.rarities.find((x) => x.id === d.rarity)!;
      expect(Object.keys(d.stats), d.id).toHaveLength(rar.statCount);
      if (d.rarity !== 'epic') expect(d.effect, d.id).toBeUndefined(); // etki yalnızca Epic'te (madde 291)
    }
    expect(ITEMS.items).toHaveLength(52); // id'ler korunur (ikonlar id'ye boyalı)
    expect(Object.keys(ITEMS.effects)).toHaveLength(11); // Ömer onayı 2026-10-10 (madde 291)
  });

  it('silahın ana statı Might ya da ailesinin statı (balta/topuz STR, yay/hançer DEX, asa INT, tılsım LUCK)', () => {
    const fam = Object.fromEntries(ITEMS.weaponFamilies.map((f) => [f.id, f.attr]));
    expect(fam).toEqual({ axes: 'str', maces: 'str', bows: 'dex', daggers: 'dex', staves: 'int', charms: 'luck' });
    for (const d of ITEMS.items.filter((x) => x.slot === 'weapon')) {
      const attrs = (['str', 'dex', 'int', 'luck'] as const).filter((k) => d.stats[k]);
      for (const a of attrs) expect(a, d.id).toBe(fam[d.family!]);
    }
  });

  it('doğrulayıcı yakalar: yanlış stat sayısı, ana stat yok, izinsiz ek, etki yalnız Epic ve kayıtlı', () => {
    const d = copy();
    d.items = [
      { id: 'a', name: 'A', slot: 'gloves', rarity: 'common', ilvl: 2, stats: { crit: 1, armor: 1 } },
      { id: 'b', name: 'B', slot: 'armor', rarity: 'common', ilvl: 4, stats: { hp: 4 } },
      { id: 'c', name: 'C', slot: 'boots', rarity: 'uncommon', ilvl: 8, stats: { evasion: 2, crit: 3 } },
      { id: 'd', name: 'D', slot: 'helm', rarity: 'rare', ilvl: 9, stats: { hp: 4, armor: 1, accuracy: 1 }, effect: 'x' },
      { id: 'e', name: 'E', slot: 'weapon', family: 'bows', rarity: 'rare', ilvl: 10, stats: { str: 1, might: 1, accuracy: 1 } },
    ];
    const errs = validateItems(d).join(' | ');
    expect(errs).toMatch(/item a: Common items have exactly 1 stat/);
    expect(errs).toMatch(/item b: needs a main armor stat/);
    expect(errs).toMatch(/item c: stat crit is not allowed on boots/);
    expect(errs).toMatch(/item d: only Epic items carry an effect/);
    expect(errs).toMatch(/item d: unknown effect x/);
    expect(errs).toMatch(/item e: stat str is not allowed on weapon/);
  });
});

describe('stat zarları', () => {
  it('aralık: katalog değeri ± %15, adıma yuvarlanır, en az bir adım; metin "+4 Max HP (3–5)"', () => {
    const mail = itemDef('riveted_mail')!; // +2 Armor, +4 Max HP
    expect(statRange(mail, 'hp')).toEqual([3, 5]);
    expect(statRange(mail, 'armor')).toEqual([1, 3]); // en az bir adım (değer >= 2 adım)
    expect(statRange(itemDef('arming_sword')!, 'str')).toEqual([1, 1]); // tek adım: aralık yok
    expect(statRange(itemDef('work_gloves')!, 'crit')).toEqual([2.5, 3.5]); // yüzde statlar 0,5 adımlı
    expect(statLine('hp', 4, [3, 5])).toBe('+4 Max HP (3–5)');
    expect(statLine('armor', 2, [2, 2])).toBe('+2 Armor');
    // Ömer: aralıklar görünsün => item'lerin neredeyse hepsi en az bir zarlı stat taşır
    const shown = ITEMS.items.filter((d) => (Object.keys(d.stats) as Array<keyof typeof d.stats>).some((k) => statRange(d, k)[0] !== statRange(d, k)[1])).length;
    expect(shown).toBeGreaterThanOrEqual(ITEMS.items.length - 2);
    for (const d of ITEMS.items)
      for (const k of Object.keys(d.stats) as Array<keyof typeof d.stats>) {
        const [lo, hi] = statRange(d, k);
        expect(lo, `${d.id} ${k}`).toBeLessThanOrEqual(d.stats[k]!);
        expect(hi).toBeGreaterThanOrEqual(d.stats[k]!);
        expect(lo).toBeGreaterThan(0);
      }
  });

  it('belirleyici ve aralık içinde; ortalama katalog değerine yakın (güç dengesi korunur)', () => {
    const d = itemDef('twin_stilettos')!;
    expect(rollStats(d, new Rng(5))).toEqual(rollStats(d, new Rng(5)));
    let ipSum = 0;
    for (let i = 0; i < 400; i++) {
      const inst = makeItem(d.id, `u${i}`, new Rng(i));
      const st = instanceStats(inst);
      for (const k of Object.keys(d.stats) as Array<keyof typeof d.stats>) {
        const [lo, hi] = statRange(d, k);
        expect(st[k]).toBeGreaterThanOrEqual(lo);
        expect(st[k]).toBeLessThanOrEqual(hi);
      }
      ipSum += instanceIP(inst);
    }
    expect(Math.abs(ipSum / 400 - itemIP(d)) / itemIP(d)).toBeLessThan(0.05);
  });

  it('eski örnek (zarsız) = katalog değeri (aralığın ortası); aralık dışı zar sıkıştırılır; güç katmanı zarı kullanır', () => {
    expect(instanceStats({ id: 'riveted_mail' })).toEqual(itemDef('riveted_mail')!.stats);
    expect(instanceStats({ id: 'riveted_mail', rolls: { hp: 99, armor: 2 } }).hp).toBe(5);
    expect(instanceLines({ uid: 'x', id: 'riveted_mail', rolls: { armor: 2, hp: 3 } })).toEqual(['+2 Armor (1–3)', '+3 Max HP (3–5)']);
    expect(loadout({ class: 'warrior', equipment: { armor: { uid: 'x', id: 'riveted_mail', rolls: { armor: 2, hp: 3 } } } }).modifiers?.hpAdd).toBe(3);
  });
});

describe('zarlar kayıtta: sefer ve Endless', () => {
  const won = (seed = 31): CampaignState => {
    const s = debugTeleport(pickHero(newCampaign({ mode: 'normal', seed }), 'archer'), '5A');
    return applyBattle({ ...s, inventory: [] }, { victory: true, units: activeHeroes(s).map((h) => ({ heroId: h.id, hpRatio: 1, alive: true })) });
  };

  it('sefer loot\'u zarlı gelir; aynı sefer + aynı düşüş = aynı zarlar (yükleyip yeniden kazanmak değiştirmez)', () => {
    const a = won();
    const b = won();
    expect(a.inventory.length).toBeGreaterThan(0);
    for (const it of a.inventory) expect(it.rolls).toBeDefined();
    expect(a.inventory).toEqual(b.inventory);
  });

  it('kayıt round-trip zarları korur; eski kayıttaki zarsız item yüklenince aralığın ortasını kullanır, bozuk zar alanı item\'i atar', () => {
    const s = won();
    const kv = memoryKV();
    writeSave(kv, s, 'auto');
    expect(latestSave(kv)!.state.inventory).toEqual(s.inventory);
    const old = JSON.parse(JSON.stringify(s)) as CampaignState;
    old.inventory = old.inventory.map(({ rolls: _r, ...it }) => it);
    const n = normalizeState(old)!;
    for (const it of n.inventory) expect(instanceStats(it)).toEqual(itemDef(it.id)!.stats);
    const bad = JSON.parse(JSON.stringify(s)) as CampaignState & { inventory: unknown[] };
    (bad.inventory[0] as unknown as Record<string, unknown>).rolls = 'junk';
    expect(normalizeState(bad)!.inventory).toHaveLength(s.inventory.length - 1);
  });

  it('Endless: ödül item\'i koşu seed\'iyle zarlanır; aynı koşu = aynı zar', () => {
    const run = { ...newRun(77, ['warrior', 'mage', 'archer', 'gambler'], 't'), phase: 'reward' as const, offer: [{ kind: 'item' as const, itemId: 'riveted_mail', heroId: 'h1' }] };
    const a = chooseReward(run, 0);
    const b = chooseReward(run, 0);
    expect(a.bag![0]!.rolls).toBeDefined();
    expect(a.bag).toEqual(b.bag);
  });
});
