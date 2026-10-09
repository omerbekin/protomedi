import { describe, expect, it } from 'vitest';
import itemsJson from '../data/items.json';
import { FAMILY_ICON, ITEM_ICONS, ITEM_ICON_NAMES, ITEM_ICON_SIZE, REWARD_ICON, SLOT_ICON, itemIconCells, itemIconGrid, itemIconName } from '../src/game/item-icons';
import { PALETTE, V2_PALETTE } from '../src/game/pixel-art';

describe('item / ödül ikonları (src/game/item-icons.ts)', () => {
  it('her ikon 128x128 çizilir, yalnızca bilinen jetonları kullanır ve boş değildir', () => {
    const known = new Set(['.', 'o', 'a', 'A', 'z', ...Object.keys(PALETTE), ...Object.keys(V2_PALETTE)]);
    for (const n of ITEM_ICON_NAMES) {
      const rows = itemIconGrid(n)!.rows();
      expect(rows.length, n).toBe(ITEM_ICON_SIZE);
      const filled = rows.join('').replace(/\./g, '').length;
      expect(filled, `${n} dolu piksel`).toBeGreaterThan(ITEM_ICON_SIZE * ITEM_ICON_SIZE * 0.1);
      for (const t of new Set(rows.join(''))) expect(known.has(t), `${n} jeton ${t}`).toBe(true);
      expect(itemIconCells(n)).not.toBeNull();
    }
  });

  it('her yuva, her silah ailesi ve her ödül türü bir ikona bağlı', () => {
    for (const s of itemsJson.slots) expect(ITEM_ICONS[SLOT_ICON[s.id] ?? ''], s.id).toBeDefined();
    for (const f of itemsJson.weaponFamilies) expect(ITEM_ICONS[FAMILY_ICON[f.id] ?? ''], f.id).toBeDefined();
    for (const n of Object.values(REWARD_ICON)) expect(ITEM_ICONS[n], n).toBeDefined();
  });

  it('items.json > icon alanı (isteğe bağlı) var olan bir ikonu gösterir; silahlar ailesinin ikonunu alır', () => {
    for (const d of itemsJson.items as Array<{ id: string; slot: string; family?: string; icon?: string }>) {
      if (d.icon) expect(ITEM_ICONS[d.icon], `${d.id} icon ${d.icon}`).toBeDefined();
      const n = itemIconName(d);
      expect(ITEM_ICONS[n], d.id).toBeDefined();
      if (!d.icon && d.slot === 'weapon') expect(n, d.id).toBe(FAMILY_ICON[d.family!]);
    }
    expect(itemIconName(undefined, 'boots')).toBe('boots');
  });

  it('nadirlik yalnızca ayrıntıyı boyar: her item ikonunda vurgu jetonu var ama ikonun küçük bir kısmı', () => {
    const rewards = new Set<string>(Object.values(REWARD_ICON));
    for (const n of ITEM_ICON_NAMES.filter((x) => !rewards.has(x))) {
      const all = itemIconGrid(n)!.rows().join('');
      const accent = all.replace(/[^aAz]/g, '').length;
      const filled = all.replace(/\./g, '').length;
      expect(accent, `${n} vurgu`).toBeGreaterThan(0);
      expect(accent / filled, `${n} vurgu oranı`).toBeLessThan(0.3);
    }
  });
});
