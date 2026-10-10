import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import type { Battle } from '../src/engine';
import {
  ENDLESS,
  applyOutcome,
  battleFor,
  fightWave,
  newRun,
  outcomeFromBattle,
  parseRun,
  restoreBattle,
  battleHash,
  snapshotCarry,
  wavePlan,
  type EndlessRun,
} from '../src/endless';

// Endless sürekli akış (Ömer 2026-10-10, open-questions madde 300): dalga arası taşınan / sıfırlanan durum.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const unitOf = (b: Battle, cls: string) => b.combatants.find((c) => c.side === 'party' && c.defId === cls && !c.summoned)!;

/** 1. dalgayı kazanan bir koşu + bitmiş savaş (seed taranır). */
function wonWave1(): { run: EndlessRun; battle: Battle; plan: ReturnType<typeof wavePlan> } {
  for (let seed = 1; seed < 40; seed++) {
    const run = newRun(seed, PARTY, '2026-10-10T00:00:00.000Z');
    const plan = wavePlan(run);
    const battle = fightWave(plan);
    if (battle.winner === 'party' && battle.combatants.filter((c) => c.side === 'party' && !c.summoned).every((c) => c.hp > 0)) return { run, battle, plan };
  }
  throw new Error('no clean wave-1 win');
}

describe('Endless sürekli akış: dalga arası taşıma', () => {
  it('buff, Rage ve kalkan taşınır; debuff silinir; MP canla aynı oranla (+%20)', () => {
    const { run, battle, plan } = wonWave1();
    const w = unitOf(battle, 'warrior');
    const m = unitOf(battle, 'mage');
    w.statuses = [
      { kind: 'haste', turns: 2, source: m.uid },
      { kind: 'slow', turns: 3, source: 'enemy-0' },
    ];
    w.rage = 17;
    w.shield = 9;
    m.mp = Math.round(m.maxMp * 0.3);
    const out = outcomeFromBattle(plan, battle);
    const next = applyOutcome(run, plan, out);
    const hw = next.heroes.find((h) => h.class === 'warrior')!;
    expect(hw.carry?.statuses?.map((s) => s.kind)).toEqual(['haste']); // debuff silindi
    expect(hw.carry?.statuses?.[0]!.source).toBe(`h:${next.heroes.find((h) => h.class === 'mage')!.id}`);
    expect(hw.carry?.rage).toBe(17);
    expect(hw.carry?.shield).toBe(9);
    const hm = next.heroes.find((h) => h.class === 'mage')!;
    expect(hm.carry?.mpRatio).toBeCloseTo(Math.min(1, m.mp / m.maxMp + ENDLESS.carry.victoryHeal), 2);
    // Sonraki dalganın savaşı bu durumla kurulur (kaynak uid'si yeni savaşın büyücüsüne eşlenir)
    const b2 = battleFor(wavePlan({ ...next, phase: 'ready' }));
    const w2 = unitOf(b2, 'warrior');
    const m2 = unitOf(b2, 'mage');
    expect(w2.statuses).toEqual([{ kind: 'haste', turns: 2, source: m2.uid }]);
    expect(w2.rage).toBe(17);
    expect(w2.shield).toBe(9);
    expect(m2.mp).toBe(Math.round(m2.maxMp * hm.carry!.mpRatio!));
  });

  it('düşen kahraman %20 can ve %20 MP ile, temiz kalkar; boss zaferi tam can + tam MP', () => {
    const { run, battle, plan } = wonWave1();
    const a = unitOf(battle, 'archer');
    a.hp = 0;
    a.statuses = [{ kind: 'haste', turns: 2, source: a.uid }];
    const next = applyOutcome(run, plan, outcomeFromBattle(plan, battle));
    const ha = next.heroes.find((h) => h.class === 'archer')!;
    expect(ha.hpRatio).toBe(ENDLESS.carry.reviveRatio);
    expect(ha.carry).toEqual({ mpRatio: ENDLESS.carry.reviveRatio });
    // Boss dalgası
    const bossRun = { ...run, wave: ENDLESS.bossEvery };
    const bp = { ...plan, wave: ENDLESS.bossEvery };
    const after = applyOutcome(bossRun, bp, outcomeFromBattle(plan, battle));
    for (const h of after.heroes) {
      expect(h.hpRatio).toBe(1);
      expect(h.carry?.mpRatio).toBeUndefined(); // tam
    }
  });

  it("cooldown'lar sıfırlanır: 2. dalgadan itibaren başlangıç cooldown'u yok (carry.cooldowns 'clear'); 'initial' eski kural", () => {
    const run = newRun(3, PARTY, '2026-10-10T00:00:00.000Z');
    const ult = (b: Battle) => Object.keys(unitOf(b, 'warrior').cooldowns).length + Object.keys(unitOf(b, 'mage').cooldowns).length;
    expect(ult(battleFor(wavePlan(run)))).toBeGreaterThan(0); // 1. dalga: savaş başı gibi
    const w2 = { ...run, wave: 2 };
    expect(ult(battleFor(wavePlan(w2)))).toBe(0);
    expect(ult(battleFor(wavePlan(w2, { ...ENDLESS, carry: { ...ENDLESS.carry, cooldowns: 'initial' } })))).toBeGreaterThan(0);
  });

  it('çağrılar taşınır: hücre, sahip, can, ömür, beslenme; kahraman uid sırası çağrıyla bozulmaz', () => {
    const base = newRun(5, PARTY, '2026-10-10T00:00:00.000Z');
    const owner = base.heroes.find((h) => h.class === 'druid')!;
    const used = new Set(base.heroes.map((h) => h.slot));
    const cell = [...Array(12).keys()].find((c) => !used.has(c))!;
    const run: EndlessRun = { ...base, wave: 2, summons: [{ unit: 'skeleton', slot: cell, owner: owner.id, hp: 20, lifespan: 3, empowered: true, statuses: [{ kind: 'haste', turns: 1, source: `h:${owner.id}` }] }] };
    const plan = wavePlan(run);
    expect(plan.heroOrder.filter((x) => x === '')).toHaveLength(1);
    const b = battleFor(plan);
    const sk = b.combatants.find((c) => c.summoned && c.side === 'party')!;
    const dr = unitOf(b, 'druid');
    expect(sk.slot).toBe(cell);
    expect(sk.hp).toBe(20);
    expect(sk.owner).toBe(dr.uid);
    expect(sk.lifespan).toBe(3);
    expect(sk.empowered).toBe(true);
    expect(sk.maxHp).toBe(content.summons.skeleton!.stats.hp); // beslenmiş varyant (mult 1)
    expect(sk.statuses).toEqual([{ kind: 'haste', turns: 1, source: dr.uid }]);
    // Sonuç eşlemesi: çağrı kahraman sayılmaz, kahramanlar doğru id'lerle
    const snap = snapshotCarry(b, plan.heroOrder);
    expect(Object.keys(snap.heroes).sort()).toEqual(run.heroes.map((h) => h.id).sort());
    expect(snap.summons).toMatchObject([{ unit: 'skeleton', slot: cell, owner: owner.id, hp: 20, lifespan: 3, empowered: true }]);
  });

  it('kayıt sürüm 3: ara verme durumu aynen döner; sürüm 2 göçü taşınanı ve yarım savaşı siler', () => {
    const { run, battle, plan } = wonWave1();
    unitOf(battle, 'warrior').rage = 12;
    const next = applyOutcome(run, plan, outcomeFromBattle(plan, battle));
    const back = parseRun(JSON.stringify({ version: 3, run: next }))!;
    expect(back.heroes).toEqual(next.heroes);
    expect(back.phase).toBe(next.phase);
    const old = parseRun(JSON.stringify({ version: 2, run: { ...next, suspended: { wave: 2, seed: 1, actions: [], turn: 0, hash: 'x' } } }))!;
    expect(old.heroes.every((h) => h.carry === undefined)).toBe(true);
    expect(old.suspended).toBeUndefined();
  });

  it('yarım savaş (dalga 2, taşınan durumla) eylem günlüğünden birebir döner', () => {
    const { run, battle, plan } = wonWave1();
    unitOf(battle, 'warrior').rage = 20;
    const ready = { ...applyOutcome(run, plan, outcomeFromBattle(plan, battle)), phase: 'ready' as const, offer: undefined };
    const p2 = wavePlan(ready);
    const b = battleFor(p2);
    const actions: Array<{ k: 'skip' }> = [];
    for (let i = 0; i < 3 && !b.winner; i++) if (b.skipTurn().ok) actions.push({ k: 'skip' });
    const susp = { wave: p2.wave, seed: p2.seed, actions, turn: b.turnsTaken, hash: battleHash(b) };
    expect(restoreBattle(battleFor(wavePlan(ready)), susp)).toBe(true);
  });
});
