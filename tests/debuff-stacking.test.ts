import { describe, expect, it } from 'vitest';
import { Battle, content } from '../src/engine';
import type { Combatant, CombatantDef, Status } from '../src/engine';
import { mergeRefreshStrongest, statusStackMode } from '../src/engine/status-stack';

// Aynı debuff üst üste binmez (Ömer 2026-10-10; statuses.json > stack, src/engine/status-stack.ts): birimde her debuff'tan TEK örnek, süre
// max(kalan, yeni), güç (DoT miktarı) ve kaynak en güçlü uygulamanın. İstisna: Omen bilinçli yığılır (3 Omen -> Doom).

const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;
function arena(party: [string, number][], enemies: [string, number][]): Battle {
  const base = content.battleSetup('random-battle', 1, 'test', { party: [], enemies: [] }, false);
  const b = new Battle({ ...base, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
  b.freeMp = true;
  b.noCooldowns = true;
  for (const c of b.combatants) {
    Object.assign(c.stats, { accuracy: 10, evasion: 0, critChance: 0, surviveChance: 0, resilience: 0, manaEcho: 0 });
    c.hp = c.maxHp = 5000;
  }
  return b;
}
const P = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'party' && c.slot === slot && !c.summoned)!;
const E = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'enemy' && c.slot === slot && !c.summoned)!;
const all = (c: Combatant, kind: string): Status[] => c.statuses.filter((s) => s.kind === kind);
const one = (c: Combatant, kind: string): Status => {
  const list = all(c, kind);
  expect(list).toHaveLength(1);
  return list[0]!;
};
function cast(b: Battle, uid: string, skill: string, target?: string, slot?: number): void {
  const r = b.useSkill(uid, skill, target, slot);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
}

describe('statuses.json > stack (veri)', () => {
  it('debuff varsayılanı refresh-strongest; Omen stack, Ash Brand replace; buff replace; stack yalnızca yığınlı (maxStacks) durumda', () => {
    for (const [id, d] of Object.entries(content.statuses)) {
      const mode = statusStackMode(d);
      if (id === 'omen') expect(mode, id).toBe('stack');
      else if (id === 'ash_brand') expect(mode, id).toBe('replace');
      else expect(mode, id).toBe(d.type === 'debuff' ? 'refresh-strongest' : 'replace');
      expect(mode === 'stack', `${id}: stack <=> maxStacks`).toBe(!!d.maxStacks);
    }
  });
});

describe('mergeRefreshStrongest (saf)', () => {
  const st = (turns: number, amount: number | undefined, source: string): Status => ({ kind: 'wither', turns, source, ...(amount !== undefined ? { amount } : {}) });
  it('süre max(kalan, yeni): kısa yeniden uygulama kalanı kısaltmaz, uzun olan geri uzatır ama yeninin tam süresini aşmaz', () => {
    expect(mergeRefreshStrongest(st(3, 5, 'a'), st(1, 5, 'b')).turns).toBe(3);
    expect(mergeRefreshStrongest(st(1, 5, 'a'), st(2, 5, 'b')).turns).toBe(2);
  });
  it('güçlü yeni: miktar ve kaynak yeninin; zayıf/eşit yeni: eski miktar ve kaynak kalır, süre tazelenir', () => {
    expect(mergeRefreshStrongest(st(1, 5, 'a'), st(3, 9, 'b'))).toMatchObject({ amount: 9, source: 'b', turns: 3 });
    expect(mergeRefreshStrongest(st(1, 9, 'a'), st(3, 5, 'b'))).toMatchObject({ amount: 9, source: 'a', turns: 3 });
    expect(mergeRefreshStrongest(st(1, undefined, 'a'), st(2, undefined, 'b'))).toMatchObject({ source: 'a', turns: 2 });
  });
});

describe('aynı debuff yığılmaz (motor)', () => {
  it('refresh-longer: Slow yeniden uygulanınca tek örnek, süre max(kalan, yeni); yeni uygulamanın tam süresini aşmaz', () => {
    const b = arena([['warrior', 0]], [['warrior', 0]]);
    const t = E(b, 0);
    b.debugAddStatus(t.uid, 'slow', 3);
    const slowed = b.speedOf(t);
    b.debugAddStatus(t.uid, 'slow', 1); // eski kural: 1'e kısalırdı
    expect(one(t, 'slow').turns).toBe(3);
    one(t, 'slow').turns = 1; // birkaç tur geçmiş gibi
    b.debugAddStatus(t.uid, 'slow', 2);
    expect(one(t, 'slow').turns).toBe(2); // geri uzar, 1 + 2 = 3 değil
    expect(b.speedOf(t)).toBe(slowed); // hız çarpanı bir kez
  });

  it('Resilience ile kısalan yeniden uygulama mevcut süreyi kısaltmaz', () => {
    const b = arena([['warrior', 0]], [['warrior', 0]]);
    const t = E(b, 0);
    b.debugAddStatus(t.uid, 'wound', 2);
    t.stats.resilience = 1; // her debuff 1 tur kısa gelir
    b.debugAddStatus(t.uid, 'wound', 2);
    expect(one(t, 'wound').turns).toBe(2);
  });

  it('strongest magnitude kept: güçlü Wither zayıfın yerine geçer (miktar + kaynak); zayıf yeniden uygulama yalnızca süreyi tazeler', () => {
    const b = arena([['hexer', 0], ['hexer', 1]], [['warrior', 0]]);
    const weak = P(b, 0);
    const strong = P(b, 1);
    weak.stats.luck = 10;
    strong.stats.luck = 60;
    const t = E(b, 0);
    const turns = (content.skills.withering_curse!.effects.find((e) => e.type === 'dot') as { turns: number }).turns;
    cast(b, weak.uid, 'withering_curse', undefined, t.slot);
    const weakAmount = one(t, 'wither').amount!;
    cast(b, strong.uid, 'withering_curse', undefined, t.slot);
    const w = one(t, 'wither');
    expect(w.amount!).toBeGreaterThan(weakAmount);
    expect(w.source).toBe(strong.uid);
    const strongAmount = w.amount!;
    // weaker reapply only refreshes: miktar ve kaynak güçlününki kalır, süre tazelenir
    one(t, 'wither').turns = 1;
    cast(b, weak.uid, 'withering_curse', undefined, t.slot);
    expect(one(t, 'wither')).toMatchObject({ amount: strongAmount, source: strong.uid, turns });
    expect(b.log.filter((e) => e.type === 'status' && e.status === 'wither').at(-1)).toMatchObject({ source: strong.uid, turns });
  });

  it('omen still stacks: Bad Omen yığını artar (tek örnek, stacks sayacı), 3\'te Doom', () => {
    const b = arena([['hexer', 0]], [['warrior', 0]]);
    const h = P(b, 0);
    const t = E(b, 0);
    cast(b, h.uid, 'evil_eye', t.uid);
    cast(b, h.uid, 'evil_eye', t.uid);
    expect(one(t, 'omen').stacks).toBe(2);
    cast(b, h.uid, 'evil_eye', t.uid);
    expect(b.log.some((e) => e.type === 'doom' && e.target === t.uid)).toBe(true);
    expect(all(t, 'omen')).toHaveLength(0); // Doom yığını tüketti
  });
});
