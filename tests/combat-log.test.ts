import { describe, expect, it } from 'vitest';
import { CombatLog, type LogNames } from '../src/game/combat-log';
import type { BattleEvent } from '../src/engine';

const units: Record<string, { name: string; side: 'party' | 'enemy' }> = {
  a: { name: 'Cutthroat', side: 'enemy' },
  b: { name: 'Hexer', side: 'party' },
  c: { name: 'Warrior', side: 'party' },
};
const names: LogNames = {
  unit: (uid) => units[uid],
  skill: (id) => ({ venom_edge: 'Venom Edge', whirl: 'Whirlwind' })[id] ?? id,
  status: (id) => ({ wound: 'Wounded' })[id] ?? id,
  ground: (id) => ({ poison: 'Poison' })[id] ?? id,
  globalKind: (id) => id,
};
const ev = (e: object) => e as BattleEvent;
const text = (log: CombatLog, i = 0) => log.entries()[i]!.parts.map((p) => p.t).join('');

describe('combat log (HUD > Battle info)', () => {
  it('one line per action: actor, skill, target, damage and statuses', () => {
    const log = new CombatLog(names);
    log.begin('a');
    log.push(ev({ type: 'skillUsed', actor: 'a', skill: 'venom_edge', targets: ['b'] }));
    log.push(ev({ type: 'damage', source: 'a', target: 'b', amount: 9, absorbed: 0, hpAfter: 10, shieldAfter: 0, magicShieldAfter: 0, crit: false, origin: 'skill' }));
    log.push(ev({ type: 'status', target: 'b', status: 'wound', turns: 2, source: 'a' }));
    expect(text(log)).toBe('Cutthroat used Venom Edge on Hexer · 9 · Wounded');
    expect(log.entries()[0]!.parts[0]!.k).toBe('e');
    expect(log.entries()[0]!.round).toBe(1);
  });

  it('area hits list every target; crit and KO are marked', () => {
    const log = new CombatLog(names);
    log.push(ev({ type: 'skillUsed', actor: 'c', skill: 'whirl', targets: ['a'] }));
    log.push(ev({ type: 'damage', source: 'c', target: 'a', amount: 18, absorbed: 2, hpAfter: 0, shieldAfter: 0, magicShieldAfter: 0, crit: true, origin: 'skill' }));
    log.push(ev({ type: 'death', target: 'a', corpse: true }));
    expect(text(log)).toBe('Warrior used Whirlwind on Cutthroat · 20 crit · KO');
  });

  it('turns and rounds: a new round starts when a unit acts again', () => {
    const log = new CombatLog(names);
    log.begin('a');
    log.push(ev({ type: 'turnStart', actor: 'b', queue: [] }));
    log.push(ev({ type: 'turnStart', actor: 'b', queue: [], extra: true }));
    expect([log.round, log.turn]).toEqual([1, 2]);
    log.push(ev({ type: 'turnStart', actor: 'a', queue: [] }));
    expect([log.round, log.turn]).toEqual([2, 3]);
  });

  it('ground ticks get their own line, latest first', () => {
    const log = new CombatLog(names);
    log.push(ev({ type: 'turnStart', actor: 'b', queue: [] }));
    log.push(ev({ type: 'damage', source: 'a', target: 'b', amount: 4, absorbed: 0, hpAfter: 6, shieldAfter: 0, magicShieldAfter: 0, crit: false, origin: 'ground', ground: 'poison' }));
    log.push(ev({ type: 'globalUsed', actor: 'b', id: 'rest' }));
    expect(text(log, 0)).toBe('Hexer rested');
    expect(text(log, 1)).toBe('Hexer took 4 from Poison');
  });
});
