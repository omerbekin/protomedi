import { describe, expect, it } from 'vitest';
import { Battle, content } from '../src/engine';
import type { BattleMode } from '../src/engine';
import { DEFAULT_TEST_SIZE, buildTestBattleData, defaultTeam, placeClass, removeSlot, resizeTeam, testClassIds } from '../src/game/test-mode';
import { UnitSelection, isSelectModifier, pickUnitAt } from '../src/game/unit-select';

const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');

function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'turns'): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells(party), enemies: cells(enemies) }, false));
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
}

describe('Test Mode: motor debug bayrakları (Unlimited Rage, No cooldowns)', () => {
  it('varsayılan kapalı: Rage yetmezse kullanılamaz (oyun kuralı aynen)', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' });
    expect(b.freeRage).toBe(false);
    expect(b.noCooldowns).toBe(false);
    b.currentUid = 'party-0';
    expect(b.canUse('party-0', 'abyssal_cry').ok).toBe(false);
  });

  it('freeRage: Rage 0 iken Rage skill kullanılabilir ve Rage harcanmaz', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' }, 'test');
    b.freeRage = true;
    expect(b.get('party-0')!.rage ?? 0).toBe(0);
    expect(b.canUse('party-0', 'abyssal_cry').ok).toBe(true);
    const r = b.useSkill('party-0', 'abyssal_cry');
    expect(r.ok).toBe(true);
    expect(b.get('party-0')!.rage ?? 0).toBeGreaterThanOrEqual(0);
    expect(r.ok && r.events.some((e) => e.type === 'rage' && e.delta < 0)).toBe(false);
  });

  it('noCooldowns: turns modunda bile cooldown başlamaz ve cooldown\'daki skill kullanılabilir', () => {
    const b = mk({ 0: 'mage' }, { 0: 'archer' }, 'turns');
    b.freeMp = true;
    b.noCooldowns = true;
    const mage = b.get('party-0')!;
    // sırayı mage'e ver
    b.currentUid = 'party-0';
    mage.cooldowns.meteor = 3;
    expect(b.canUse('party-0', 'meteor').ok).toBe(true);
    delete mage.cooldowns.meteor;
    const r = b.useSkill('party-0', 'meteor', 'enemy-0');
    if (r.ok) expect(mage.cooldowns.meteor).toBeUndefined();
    b.noCooldowns = false;
    mage.cooldowns.meteor = 3;
    expect(b.canUse('party-0', 'meteor').ok).toBe(false);
  });
});

describe('Test Mode: takım seçici mantığı', () => {
  it('varsayılan takımlar 5 birim ve seçilebilir class\'lardan', () => {
    for (const side of ['party', 'enemies'] as const) {
      const t = defaultTeam(side);
      expect(t).toHaveLength(DEFAULT_TEST_SIZE);
      for (const id of t) expect(testClassIds()).toContain(id);
    }
  });

  it('placeClass: yuva seçiliyse değiştirir, değilse sona ekler (üst sınır tahta boyutu)', () => {
    expect(placeClass(['warrior', 'mage'], 1, 'archer')).toEqual({ team: ['warrior', 'archer'], slot: 1 });
    expect(placeClass(['warrior'], null, 'mage')).toEqual({ team: ['warrior', 'mage'], slot: null });
    const full = Array.from({ length: content.CELL_COUNT }, () => 'warrior');
    expect(placeClass(full, null, 'mage').team).toHaveLength(content.CELL_COUNT);
  });

  it('removeSlot: en az 1 birim kalır; resizeTeam: büyütür/küçültür ve sınırlar', () => {
    expect(removeSlot(['warrior', 'mage', 'archer'], 1).team).toEqual(['warrior', 'archer']);
    expect(removeSlot(['warrior'], 0).team).toEqual(['warrior']);
    expect(resizeTeam(['warrior', 'mage'], 4)).toHaveLength(4);
    expect(resizeTeam(['warrior', 'mage', 'archer'], 1)).toEqual(['warrior']);
    expect(resizeTeam(['warrior'], 999)).toHaveLength(content.CELL_COUNT);
  });

  it('buildTestBattleData: test modu, istenen class\'larla savaş kurulur', () => {
    const wanted = { party: ['warrior', 'paladin'], enemies: ['mage', 'archer', 'undead'] };
    const data = buildTestBattleData(wanted, 123);
    expect(data.mode).toBe('test');
    expect(data.partySize).toBe(2);
    expect(data.enemySize).toBe(3);
    const b = new Battle(content.battleSetup('random-battle', data.seed, data.mode, data.teams, false));
    const names = (side: 'party' | 'enemy') => b.combatants.filter((c) => c.side === side && !c.summoned).map((c) => c.defId).sort();
    expect(names('party')).toEqual([...wanted.party].sort());
    expect(names('enemy')).toEqual([...wanted.enemies].sort());
  });
});

describe('Genel Ctrl + tık birim seçimi (saf mantık)', () => {
  it('Ctrl ya da Cmd seçim tuşudur; yalın tık değil', () => {
    expect(isSelectModifier({ ctrlKey: true })).toBe(true);
    expect(isSelectModifier({ metaKey: true })).toBe(true);
    expect(isSelectModifier({})).toBe(false);
    expect(isSelectModifier(undefined)).toBe(false);
  });

  it('UnitSelection: aç/kapat (toggle), sonuncu = ana seçim, clear', () => {
    const s = new UnitSelection();
    expect(s.toggle('a')).toBe(true);
    expect(s.toggle('b')).toBe(true);
    expect(s.last).toBe('b');
    expect(s.toggle('b')).toBe(false);
    expect(s.uids).toEqual(['a']);
    expect(s.clear()).toBe(true);
    expect(s.clear()).toBe(false);
    expect(s.size).toBe(0);
  });

  it('pickUnitAt: ayak merkezi x,y; kutunun içindeki en yakın birim', () => {
    const units = [
      { uid: 'a', x: 100, y: 300, w: 100, h: 200 },
      { uid: 'b', x: 160, y: 300, w: 100, h: 200 },
    ];
    expect(pickUnitAt(units, 100, 200)).toBe('a');
    expect(pickUnitAt(units, 170, 200)).toBe('b');
    expect(pickUnitAt(units, 400, 200)).toBeUndefined();
    expect(pickUnitAt(units, 100, 350)).toBeUndefined();
  });
});
