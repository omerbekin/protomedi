import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content } from '../src/engine';
import { classGroupRank, groupByPrimary, groupColor, PRIMARY_ORDER, sortByPrimary } from '../src/game/class-order';
import { rosterGroups, rosterIds } from '../src/game/team-select-model';

const c = (id: string, name: string, primary?: 'str' | 'dex' | 'int' | 'luck', testOnly = false) => ({ id, name, primary, testOnly });

describe('class sırası (primary statına göre)', () => {
  it('STR - DEX - INT - LUCK, grup içi ada göre, primary yoksa gruplardan sonra, test class en sonda', () => {
    const list = [c('t', 'Geometer', 'int', true), c('g', 'Gambler', 'luck'), c('x', 'Zed'), c('m', 'Mage', 'int'), c('a', 'Anti-Mage', 'int'), c('w', 'Warrior', 'str'), c('r', 'Archer', 'dex'), c('d', 'Defender', 'str')];
    expect(sortByPrimary(list).map((x) => x.id)).toEqual(['d', 'w', 'r', 'a', 'm', 'g', 'x', 't']);
  });

  it('yeni class kendi primary grubuna girer; sabit ad listesi yok', () => {
    const list = [c('w', 'Warrior', 'str'), c('n', 'Berserker', 'str'), c('g', 'Gambler', 'luck')];
    expect(sortByPrimary(list).map((x) => x.id)).toEqual(['n', 'w', 'g']);
    expect(PRIMARY_ORDER).toEqual(['str', 'dex', 'int', 'luck']);
  });

  it('gruplama: ardışık gruplar, primary yok = stat null, test = test', () => {
    const groups = groupByPrimary([c('a', 'A', 'dex'), c('b', 'B', 'str'), c('x', 'X'), c('t', 'T', 'str', true)]);
    expect(groups.map((g) => [g.stat, g.test, g.items.map((i) => i.id)])).toEqual([['str', false, ['b']], ['dex', false, ['a']], [null, false, ['x']], [null, true, ['t']]]);
    expect(classGroupRank(c('t', 'T', 'str', true))).toBeGreaterThan(classGroupRank(c('x', 'X')));
  });

  it('gerçek veri: raf STR, DEX, INT, LUCK sırasında; test class sonda; her primary rengi tanımlı', () => {
    const ids = rosterIds();
    const ranks = ids.map((id) => classGroupRank(content.classes[id]!));
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    expect(ids.slice(0, 2).map((id) => content.classes[id]!.primary)).toEqual(['str', 'str']);
    expect(rosterGroups().flatMap((g) => g.items.map((i) => i.id))).toEqual(ids);
    const map = layout.colors.primaryGroup as Record<string, string>;
    for (const stat of PRIMARY_ORDER) expect(map[stat], stat).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(PRIMARY_ORDER.map((s) => map[s])).size).toBe(4);
    expect(groupColor(map, undefined)).toBe('#b9a27a');
    expect(groupColor(map, 'dex')).toBe(map.dex);
  });
});
