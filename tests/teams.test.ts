import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';

const BATTLE = 'random-battle';
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('seed\'e göre takım seçimi', () => {
  it('aynı seed her zaman aynı takımları verir', () => {
    for (const seed of [1, 7, 42, 99999]) expect(content.rollTeams(BATTLE, seed)).toEqual(content.rollTeams(BATTLE, seed));
  });

  it('her takım 5 kişi ve kendi içinde farklı class\'lardan oluşur', () => {
    for (const seed of SEEDS) {
      const { party, enemies } = content.rollTeams(BATTLE, seed);
      expect(party, `seed ${seed}`).toHaveLength(5);
      expect(enemies, `seed ${seed}`).toHaveLength(5);
      expect(new Set(party).size, `seed ${seed}`).toBe(5);
      expect(new Set(enemies).size, `seed ${seed}`).toBe(5);
    }
  });

  it('farklı seed\'ler farklı kompozisyonlar üretir (hem oyuncu hem düşman tarafı)', () => {
    const party = new Set(SEEDS.map((s) => [...content.rollTeams(BATTLE, s).party].sort().join()));
    const enemy = new Set(SEEDS.map((s) => [...content.rollTeams(BATTLE, s).enemies].sort().join()));
    expect(party.size).toBeGreaterThanOrEqual(40); // havuzdan (9 class) 5 seçim: 126 farklı küme
    expect(enemy.size).toBeGreaterThanOrEqual(40);
  });

  it('oyuncu ve düşman takımları aynı seed\'de birbirinden bağımsız (hep aynı çift çıkmaz)', () => {
    const same = SEEDS.filter((s) => {
      const t = content.rollTeams(BATTLE, s);
      return [...t.party].sort().join() === [...t.enemies].sort().join();
    });
    expect(same.length).toBeLessThan(SEEDS.length * 0.2);
  });

  it('her class her iki tarafta da yeterince sık görünür (adil dağılım)', () => {
    const ids = content.randomPool;
    for (const side of ['party', 'enemies'] as const) {
      const counts = new Map<string, number>();
      for (const s of SEEDS) for (const id of content.rollTeams(BATTLE, s)[side]) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const id of ids) {
        const share = (counts.get(id) ?? 0) / SEEDS.length; // beklenen: 5/8 = 0,625
        expect(share, `${side} ${id}`).toBeGreaterThan(0.5);
        expect(share, `${side} ${id}`).toBeLessThan(0.75);
      }
    }
  });

  it('aynı class iki tarafta birden çıkabilir ve görseli aynıdır', () => {
    const seed = SEEDS.find((s) => {
      const t = content.rollTeams(BATTLE, s);
      return t.party.includes('mage') && t.enemies.includes('mage');
    })!;
    expect(seed).toBeDefined();
    const b = new Battle(content.battleSetup(BATTLE, seed, 'test'));
    const mages = b.combatants.filter((c) => c.defId === 'mage');
    expect(mages.map((m) => m.side).sort()).toEqual(['enemy', 'party']);
    expect(new Set(mages.map((m) => m.spriteId)).size).toBe(1);
  });

  it('savaş, seed\'in verdiği takımlarla kurulur; takım rastgeleliği savaşın RNG\'sini etkilemez', () => {
    const teams = content.rollTeams(BATTLE, 5);
    const b = new Battle(content.battleSetup(BATTLE, 5, 'turns'));
    const ids = (side: 'party' | 'enemy') => b.combatants.filter((c) => c.side === side).map((c) => c.defId).sort();
    expect(ids('party')).toEqual([...teams.party].sort()); // şeritler rastgele olduğundan hücre sırası değişebilir, kadro aynı
    expect(ids('enemy')).toEqual([...teams.enemies].sort());
    // Aynı seed aynı savaşı kurar (şerit dağılımı dahil)
    const again = new Battle(content.battleSetup(BATTLE, 5, 'turns'));
    expect(again.log).toEqual(b.log);
  });

  it('sabit savaş her seed\'de aynı takımları verir', () => {
    expect(content.rollTeams('first-battle', 1)).toEqual(content.rollTeams('first-battle', 777));
  });
});

describe('rastgele takımlarla tam savaşlar', () => {
  it('her seed\'de savaş yapay zeka ile sonuçlanır (sonsuz döngü / geçersiz hamle yok)', () => {
    let stuck = 0;
    for (const seed of SEEDS.slice(0, 150)) {
      const b = new Battle(content.battleSetup(BATTLE, seed, 'turns'));
      for (let i = 0; i < 400 && !b.winner; i++) {
        const actor = b.currentUid!;
        const choice = chooseAction(b, actor, content.aiConfig);
        const r = b.applyChoice(actor, choice);
        expect(r.ok, `seed ${seed} tur ${i}`).toBe(true);
      }
      if (!b.winner) stuck++;
    }
    expect(stuck).toBeLessThanOrEqual(2); // kilitlenen savaş neredeyse hiç olmamalı
  });

  it('Druid oyuncu tarafındayken de çağrı yapabilir (oyuncu tarafında boş yuva var)', () => {
    const teams = { party: ['druid', 'warrior', 'mage', 'paladin'], enemies: ['warrior', 'archer', 'mage', 'undead'] };
    const b = new Battle(content.battleSetup(BATTLE, 1, 'test', teams));
    const druid = b.combatants.find((c) => c.side === 'party' && c.defId === 'druid')!;
    const r = b.useSkill(druid.uid, 'summon_treant');
    expect(r.ok).toBe(true);
    expect(b.living('party')).toHaveLength(5);
    expect(b.combatants.find((c) => c.summoned)?.side).toBe('party');
  });
});
