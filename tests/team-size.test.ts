import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { BattleMode } from '../src/engine';
import { simulate } from '../src/sim/simulate';

/**
 * Takım boyutu: her taraf 1..12 (formasyon yuva sayısı = rows x lanes) birim alabilir; 5-5 varsayılandır.
 * content.battleSetup(id, seed, mode, { party, enemies }) farklı uzunluklu listeleri kabul eder; rastgele takımlarda partySize/enemySize seçilir.
 */
const CELLS = content.formulas.formation.rows * content.formulas.formation.lanes;
const lanes = content.formulas.formation.lanes;
const POOL = content.randomPool; // testOnly class'lar (aoe_tester) rastgele havuzda yok
const sizes = [1, 2, 3, 5, 7, 9, 10, 12];

describe('takım boyutu: rastgele takım çekme', () => {
  it('varsayılan 5-5 (random-battle.random.size); açık 5-5 ile birebir aynı; boyut seed\'e göre deterministik', () => {
    const def = content.battles['random-battle']!.random!;
    for (const seed of [1, 2, 3, 99]) {
      const d = content.rollTeams('random-battle', seed);
      expect(d.party).toHaveLength(def.size);
      expect(d.enemies).toHaveLength(def.size);
      expect(content.rollTeams('random-battle', seed, { partySize: def.size, enemySize: def.size })).toEqual(d);
      expect(content.rollTeams('random-battle', seed)).toEqual(d);
    }
    expect(def.size).toBe(5);
  });

  it('her boyut için taraf başına tam o kadar sınıf çekilir; havuz yettiği sürece hepsi farklı; havuzdan fazlasında tekrar eder', () => {
    for (const n of sizes) {
      for (const seed of [1, 2, 3]) {
        const t = content.rollTeams('random-battle', seed, { partySize: n, enemySize: n });
        for (const list of [t.party, t.enemies]) {
          expect(list, `n=${n}`).toHaveLength(n);
          for (const id of list) expect(POOL).toContain(id);
          if (n <= POOL.length) expect(new Set(list).size, `n=${n}`).toBe(n);
          else {
            expect(new Set(list).size).toBe(POOL.length); // havuzun hepsi kullanıldı
            for (const id of POOL) expect(list.filter((x) => x === id).length).toBeLessThanOrEqual(Math.ceil(n / POOL.length));
          }
        }
      }
    }
  });

  it('taraf boyutları bağımsız (3v7); geçersiz boyutlar 1..12 arasına sıkıştırılır', () => {
    const t = content.rollTeams('random-battle', 4, { partySize: 3, enemySize: 7 });
    expect([t.party.length, t.enemies.length]).toEqual([3, 7]);
    expect(content.clampTeamSize(0)).toBe(1);
    expect(content.clampTeamSize(-5)).toBe(1);
    expect(content.clampTeamSize(99)).toBe(CELLS);
    expect(content.clampTeamSize(Number.NaN)).toBe(1);
    expect(content.clampTeamSize(4.9)).toBe(4);
    expect(content.rollTeams('random-battle', 4, { partySize: 99, enemySize: 0 })).toMatchObject({ party: expect.any(Array) });
    expect(content.rollTeams('random-battle', 4, { partySize: 99, enemySize: 0 }).party).toHaveLength(CELLS);
    expect(content.rollTeams('random-battle', 4, { partySize: 99, enemySize: 0 }).enemies).toHaveLength(1);
  });

  it('randomTeam (takım seçim ekranının Randomize\'ı) de her boyutu verir', () => {
    for (const n of [1, 5, 9, 12]) expect(content.randomTeam(7, n)).toHaveLength(n);
  });

  it('sabit savaşlar (first-battle) boyut seçeneklerinden etkilenmez', () => {
    const t = content.rollTeams('first-battle', 1, { partySize: 9, enemySize: 9 });
    expect(t.party).toEqual(content.battles['first-battle']!.party);
  });
});

describe('takım boyutu: savaş kurulumu ve dizilim', () => {
  it('battleSetup: farklı uzunlukta takım listeleri kabul edilir (3v7); partySize/enemySize ile rastgele boyut', () => {
    const explicit = content.battleSetup('random-battle', 1, 'turns', { party: ['warrior', 'mage', 'archer'], enemies: ['defender', 'paladin', 'druid', 'undead', 'gambler', 'antimage', 'warrior'] });
    expect([explicit.party.length, explicit.enemies.length]).toEqual([3, 7]);
    const rolled = content.battleSetup('random-battle', 1, 'turns', { partySize: 2, enemySize: 11 });
    expect([rolled.party.length, rolled.enemies.length]).toEqual([2, 11]);
    const def = content.battleSetup('random-battle', 1, 'turns');
    expect([def.party.length, def.enemies.length]).toEqual([5, 5]);
    // yalnızca bir taraf verilirse diğeri seed'e göre çekilir
    const half = content.battleSetup('random-battle', 1, 'turns', { party: ['mage'], enemySize: 4 });
    expect([half.party.length, half.enemies.length]).toEqual([1, 4]);
  });

  it('her boyutta yuvalar benzersiz ve 0..11 içinde; her birim bir yuvaya yerleşir; yakın dövüşçü ancak önündeki sıralar doluysa arka sırada', () => {
    for (const n of sizes) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const s = content.battleSetup('random-battle', seed, 'turns', { partySize: n, enemySize: n });
        for (const [defs, slots] of [[s.party, s.partySlots!], [s.enemies, s.enemySlots!]] as const) {
          expect(slots, `n=${n}`).toHaveLength(n);
          expect(new Set(slots).size).toBe(n);
          for (const sl of slots) {
            expect(sl).toBeGreaterThanOrEqual(0);
            expect(sl).toBeLessThan(CELLS);
          }
          const perRow = new Map<number, number>();
          for (const sl of slots) perRow.set(Math.floor(sl / lanes), (perRow.get(Math.floor(sl / lanes)) ?? 0) + 1);
          defs.forEach((d, i) => {
            const row = Math.floor(slots[i]! / lanes);
            const melee = content.skills[d.skills[0]!]?.motion === 'melee';
            if (melee) for (let r = 0; r < row; r++) expect(perRow.get(r) ?? 0, `n=${n} seed ${seed} ${d.id} satır ${row}`).toBe(lanes);
          });
        }
      }
    }
  });

  it('hücre listesiyle (arrange=false) 12 dolu hücre, 1 birim ve uzunluğu 12 olmayan sınıf listeleri çalışır; 12\'den uzun sınıf listesi 12\'ye kesilir', () => {
    const full = Array.from({ length: 12 }, (_, i) => POOL[i % POOL.length]!);
    const s = content.battleSetup('random-battle', 1, 'turns', { party: full, enemies: ['mage'] }, false);
    expect([s.party.length, s.enemies.length]).toEqual([12, 1]);
    const long = content.battleSetup('random-battle', 1, 'turns', { party: [...full, 'warrior', 'mage'], enemies: ['mage'] });
    expect(long.party).toHaveLength(12);
  });

  it('tüm yuvalar doluyken çağrı yapılamaz ("No free slot"); boyut 12 savaşı başlatır', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: ['druid', ...Array.from({ length: 11 }, () => 'warrior')], enemies: ['mage'] }));
    expect(b.living('party')).toHaveLength(12);
    expect(b.freeSlots('party')).toEqual([]);
    const druid = b.combatants.find((c) => c.defId === 'druid')!;
    druid.mp = 1000;
    expect(b.canUse(druid.uid, 'summon_treant')).toEqual({ ok: false, reason: 'No free slot' });
    expect(b.canUseGlobal(druid.uid, 'move_tile')).toEqual({ ok: false, reason: 'No empty cell' });
  });
});

describe('takım boyutu: savaşlar başlar ve biter, deterministiktir', () => {
  const play = (p: number, e: number, seed: number, mode: BattleMode = 'turns') => {
    const b = new Battle(content.battleSetup('random-battle', seed, mode, { partySize: p, enemySize: e }));
    for (let i = 0; i < 2500 && !b.winner; i++) {
      if (mode === 'turns') {
        const u = b.currentUid!;
        const r = b.applyChoice(u, chooseAction(b, u, content.aiConfig));
        expect(r.ok, `${p}v${e} seed ${seed} tur ${i}`).toBe(true);
      } else {
        // test modu: sırasız; her canlı birim sırayla YZ'nin seçtiği hamleyi yapar
        for (const c of b.combatants.filter((x) => x.hp > 0)) {
          if (b.winner) break;
          const choice = chooseAction(b, c.uid, content.aiConfig);
          if (choice) b.applyChoice(c.uid, choice);
        }
      }
    }
    return b;
  };

  for (const [p, e] of [[1, 1], [3, 7], [12, 12], [1, 12], [12, 1], [5, 5]] as const) {
    it(`${p}v${e}: turns modunda savaş her seed'de sonuçlanır`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const b = play(p, e, seed);
        expect(b.winner, `${p}v${e} seed ${seed}`).not.toBeNull();
        expect(b.combatants.filter((c) => !c.summoned && c.side === 'party')).toHaveLength(p);
        expect(b.combatants.filter((c) => !c.summoned && c.side === 'enemy')).toHaveLength(e);
      }
    });
  }

  it('test modunda da (3v7, 12v12) savaş biter', () => {
    for (const [p, e] of [[3, 7], [12, 12]] as const) expect(play(p, e, 2, 'test').winner, `${p}v${e}`).not.toBeNull();
  });

  it('aynı seed + aynı boyut = birebir aynı savaş (olay akışı)', () => {
    for (const [p, e] of [[1, 1], [3, 7], [12, 12]] as const) expect(JSON.stringify(play(p, e, 5).log), `${p}v${e}`).toBe(JSON.stringify(play(p, e, 5).log));
  });

  it('sıra (tur) sistemi boyuta bağlı değil: kuyruk her boyutta uzunluğu en fazla birim sayısı kadar; her birim oynar', () => {
    for (const [p, e] of [[1, 1], [12, 12]] as const) {
      const b = new Battle(content.battleSetup('random-battle', 3, 'turns', { partySize: p, enemySize: e }));
      expect(b.turnQueue().length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (let i = 0; i < 200 && !b.winner && seen.size < p + e; i++) {
        seen.add(b.currentUid!);
        b.skipTurn();
      }
      expect(seen.size).toBe(p + e);
    }
  });

  it('simülatör takım boyutlarını alır (3v7): savaşlar biter, ölçüm çalışır', () => {
    const r = simulate(20, 1, 'random-battle', { partySize: 3, enemySize: 7 });
    expect(r.partyWins + r.enemyWins + r.draws).toBe(20);
    expect(r.draws).toBeLessThanOrEqual(2);
    expect(r.enemyWins).toBeGreaterThan(r.partyWins); // 7 birim 3 birime karşı
  });
});
