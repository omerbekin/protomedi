import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { BAG_SIZE, ITEMS, RARITY_IDS, SLOT_IDS, canEquip, classWeaponFamilies, itemDef, itemIP, itemValue, targetIP, validateItems, type ItemsData } from '../src/progression';

// data/items.json şeması (docs/design/progression/items.md 5.3; Ömer kararları bölüm 7). Aşama 0: şema + 3 örnek item.

const copy = (): ItemsData => JSON.parse(JSON.stringify(ITEMS)) as ItemsData;

describe('items.json şeması', () => {
  it('veri geçerli (validateItems boş)', () => {
    expect(validateItems()).toEqual([]);
  });

  it('6 yuva (karar 1), 5 nadirlik (karar 3), yuva ağırlıkları toplamı 6, torba 30', () => {
    expect(ITEMS.slots.map((s) => s.id)).toEqual([...SLOT_IDS]);
    expect(ITEMS.slots.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(6, 6);
    expect(ITEMS.rarities.map((r) => r.id)).toEqual([...RARITY_IDS]);
    expect(BAG_SIZE).toBe(30);
  });

  it('silah aileleri (karar 2): her oynanabilir sınıfın en az bir ailesi var; Mage asa, Archer yay kullanır', () => {
    for (const c of content.randomPool) expect(classWeaponFamilies(c).length, c).toBeGreaterThan(0);
    const axe = itemDef('woodcutters_axe')!;
    expect(canEquip('warrior', axe)).toBe(true);
    expect(canEquip('mage', axe)).toBe(false);
    expect(canEquip('mage', itemDef('turnshoes')!)).toBe(true); // silah dışı yuvalar herkese serbest
  });

  it('örnek item IP / değer: bütçe formülü (yuva x B(ilvl) x nadirlik), altın = 10 x IP', () => {
    for (const d of ITEMS.items) {
      const t = targetIP(d);
      expect(Math.abs(itemIP(d) - t), d.id).toBeLessThanOrEqual(t * ITEMS.budget.tolerance + 1e-9);
      expect(itemValue(d)).toBe(Math.max(ITEMS.budget.minValue, Math.round(ITEMS.budget.goldPerIP * itemIP(d))));
    }
    expect(itemValue(itemDef('woodcutters_axe')!)).toBe(15); // items.md 1.9 tablosu
  });

  it('doğrulayıcı hataları yakalar: ailesiz silah, motorda olmayan stat, kesirli ana stat, bütçe dışı IP, bilinmeyen yuva', () => {
    const d = copy();
    d.items = [
      { id: 'a', name: 'A', slot: 'weapon', rarity: 'common', ilvl: 2, stats: { might: 3 } },
      { id: 'b', name: 'B', slot: 'helm', rarity: 'common', ilvl: 3, stats: { hp: 2 } },
      { id: 'c', name: 'C', slot: 'gloves', rarity: 'rare', ilvl: 20, stats: { dex: 1.5 } },
      { id: 'd', name: 'D', slot: 'boots', rarity: 'common', ilvl: 2, stats: { armor: 9 } },
      { id: 'e', name: 'E', slot: 'cape' as never, rarity: 'common', ilvl: 2, stats: { armor: 1 } },
    ];
    const errs = validateItems(d).join('\n');
    expect(errs).toMatch(/item a: weapon needs a known family/);
    expect(errs).toMatch(/item b: stat hp is not supported by the engine yet/);
    expect(errs).toMatch(/item c: stat dex must be an integer/);
    expect(errs).toMatch(/item d: IP .* outside budget/);
    expect(errs).toMatch(/item e: unknown slot cape/);
  });
});
