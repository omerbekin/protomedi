import { describe, expect, it } from 'vitest';
import { Battle, advanceTurn, content, predictQueue } from '../src/engine';
import type { BattleEvent, TurnSlot } from '../src/engine';

const turnsBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'turns'));
const slot = (uid: string, spd: number, side: 'party' | 'enemy' = 'party', n = 0, counter = 0): TurnSlot => ({
  uid,
  side,
  slot: n,
  spd,
  counter,
});

/** Sırası gelen aktörün uid'sini, aksiyonu yapmadan ilerletmek için pas geçer ve kuyruğu döndürür. */
function playOrder(battle: Battle, turns: number): string[] {
  const order: string[] = [];
  for (let i = 0; i < turns && !battle.winner; i++) {
    order.push(battle.currentUid!);
    const r = battle.skipTurn();
    if (!r.ok) throw new Error(r.reason);
  }
  return order;
}

describe('sıra hesabı (saf fonksiyonlar)', () => {
  it('hızlı olan daha sık oynar (SPD 20 vs 10: 2 kat)', () => {
    const queue = predictQueue([slot('fast', 20), slot('slow', 10, 'enemy')], 100, 12, null);
    expect(queue.filter((u) => u === 'fast')).toHaveLength(8);
    expect(queue.filter((u) => u === 'slow')).toHaveLength(4);
  });

  it('eşit hızda sıra dönüşümlü gider ve parti önce başlar', () => {
    const queue = predictQueue([slot('a', 10, 'enemy', 0), slot('b', 10, 'party', 0)], 100, 6, null);
    expect(queue).toEqual(['b', 'a', 'b', 'a', 'b', 'a']);
  });

  it('SPD 0 olan hiç oynamaz', () => {
    const queue = predictQueue([slot('a', 10), slot('stuck', 0, 'enemy')], 100, 4, null);
    expect(queue).toEqual(['a', 'a', 'a', 'a']);
  });

  it('kimse yoksa boş kuyruk, tahmin girdiyi değiştirmez', () => {
    expect(predictQueue([], 100, 5, null)).toEqual([]);
    const slots = [slot('a', 7), slot('b', 13, 'enemy')];
    predictQueue(slots, 100, 10, null);
    expect(slots.map((s) => s.counter)).toEqual([0, 0]);
  });

  it('advanceTurn eşiğe ilk ulaşanı seçer ve sayaçları orantılı ilerletir', () => {
    const slots = [slot('a', 12), slot('b', 9, 'enemy')];
    expect(advanceTurn(slots, 100)?.uid).toBe('a'); // 9 tikte 108
    expect(slots.map((s) => s.counter)).toEqual([108, 81]);
  });

  it('şu anki aktör kuyruğun başında, sayacı eşik kadar düşmüş sayılır', () => {
    // a her 2 tikte, b her 10 tikte oynar; 10. tikte eşitlikte parti (a) önce
    const queue = predictQueue([slot('a', 50, 'party', 0, 100), slot('b', 10, 'enemy')], 100, 7, 'a');
    expect(queue).toEqual(['a', 'a', 'a', 'a', 'a', 'a', 'b']);
  });
});

describe('savaşta sıra (turns modu)', () => {
  it('SPD en yüksek olan Archer (12) ilk oynar', () => {
    const b = turnsBattle();
    expect(b.currentActor?.name).toBe('Archer');
    expect(b.mode).toBe('turns');
  });

  it('kuyruk 8 kişilik ve ilk eleman şu anki aktör', () => {
    const b = turnsBattle();
    const q = b.turnQueue();
    expect(q).toHaveLength(content.formulas.turn.queueLength);
    expect(q[0]).toBe(b.currentUid);
  });

  it('gerçekte oynanan sıra, tahmin edilen sıra ile birebir aynı (ölüm/çağrı yokken)', () => {
    const b = turnsBattle();
    const predicted = b.turnQueue(30);
    expect(playOrder(b, 30)).toEqual(predicted);
  });

  it('uzun vadede herkesin oynama sayısı SPD ile orantılı', () => {
    const b = turnsBattle();
    const order = playOrder(b, 360);
    const count = (uid: string) => order.filter((u) => u === uid).length;
    const total = b.combatants.reduce((sum, c) => sum + c.stats.spd, 0);
    for (const c of b.combatants) {
      expect(count(c.uid) / 360).toBeCloseTo(c.stats.spd / total, 1);
    }
    // Hızlı karakter yavaş olandan SPD oranına yakın sıklıkta oynar (Archer 12, Undead 8: ~1,5 kat)
    const ratio = b.get('enemy-1')!.stats.spd / b.get('party-3')!.stats.spd;
    expect(count('enemy-1') / count('party-3')).toBeCloseTo(ratio, 0);
  });

  it('sırası gelmeyen aktör oynayamaz, gelen oynayabilir', () => {
    const b = turnsBattle();
    const current = b.currentUid!;
    const other = b.combatants.find((c) => c.uid !== current && c.side === 'party')!;
    const otherSkill = other.skills[0]!;
    expect(b.canUse(other.uid, otherSkill)).toEqual({ ok: false, reason: "Not this unit's turn" });
    expect(b.useSkill(other.uid, otherSkill, 'enemy-0').ok).toBe(false);
  });

  it('skill kullanınca sıra ilerler ve turnStart olayı sonda gelir', () => {
    const b = turnsBattle();
    const archer = b.currentUid!;
    const target = b.living('party')[0]!;
    const r = b.useSkill(archer, 'quick_shot', target.uid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const last = r.events.at(-1)!;
    expect(last.type).toBe('turnStart');
    // sıra ilerler; en hızlı birim (SPD farkı büyükse) art arda da oynayabilir, bu yüzden aktörün değişmesi şart değil
    expect(b.currentUid).toBeDefined();
    if (last.type === 'turnStart') {
      expect(last.actor).toBe(b.currentUid);
      expect(last.queue).toEqual(b.turnQueue());
    }
  });

  it('pas geçince turnSkipped + turnStart olayları gelir', () => {
    const b = turnsBattle();
    const first = b.currentUid;
    const r = b.skipTurn();
    expect(r.ok && r.events.map((e) => e.type)).toEqual(['turnSkipped', 'turnStart']);
    expect(b.currentUid).not.toBe(first);
    expect(b.turnsTaken).toBe(1);
  });

  it('ölen aktör sıradan çıkar', () => {
    const b = turnsBattle();
    const victim = b.combatants.find((c) => c.name === 'Mage' && c.side === 'party')!;
    victim.hp = 0;
    expect(b.turnQueue(40)).not.toContain(victim.uid);
  });

  it('çağrılan birim sıraya katılır', () => {
    const b = turnsBattle();
    // Druid'in sırasına kadar pas geç, sonra çağır
    for (let i = 0; i < 40 && b.currentActor?.name !== 'Druid'; i++) b.skipTurn();
    expect(b.currentActor?.name).toBe('Druid');
    const events = (b.useSkill(b.currentUid!, 'summon_treant') as { events: BattleEvent[] }).events;
    const summoned = events.find((e) => e.type === 'summon');
    expect(summoned).toBeDefined();
    const uid = summoned && summoned.type === 'summon' ? summoned.combatant.uid : '';
    expect(b.turnQueue(40)).toContain(uid);
  });

  it('savaş bitince sıra durur', () => {
    const b = turnsBattle();
    for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0 }); // iska savaşı uzatmasın
    for (const c of b.living('enemy')) c.hp = 1;
    for (let i = 0; i < 60 && !b.winner; i++) {
      const actor = b.currentActor!;
      actor.mp = actor.maxMp; // MP yenilenmesi Int'ten gelir (Warrior düşük): senaryo MP'ye takılmasın
      if (actor.side === 'party' && b.canUse(actor.uid, 'whirlwind').ok) b.useSkill(actor.uid, 'whirlwind');
      else b.skipTurn();
    }
    expect(b.winner).toBe('party');
    expect(b.skipTurn().ok).toBe(false);
    expect(b.log.at(-1)?.type).toBe('battleEnd');
  });

  it('aynı seed + aynı eylemler aynı sırayı üretir', () => {
    expect(playOrder(turnsBattle(9), 25)).toEqual(playOrder(turnsBattle(9), 25));
  });
});

describe('test modu (sırasız)', () => {
  it('sıra yok: currentUid boş, kuyruk boş, herkes istediği an oynayabilir', () => {
    const b = new Battle(content.battleSetup('first-battle', 1, 'test'));
    expect(b.mode).toBe('test');
    expect(b.currentUid).toBeNull();
    expect(b.turnQueue()).toEqual([]);
    expect(b.useSkill('party-0', 'melee_attack', 'enemy-0').ok).toBe(true);
    expect(b.useSkill('party-0', 'melee_attack', 'enemy-0').ok).toBe(true); // arka arkaya
    expect(b.useSkill('enemy-3', 'thorn_whip', 'party-0').ok).toBe(true); // düşman da
    expect(b.log.some((e) => e.type === 'turnStart')).toBe(false);
  });

  it('test modunda pas geçmek yok', () => {
    const b = new Battle(content.battleSetup('first-battle', 1, 'test'));
    expect(b.skipTurn().ok).toBe(false);
  });
});

describe('SPEED çubuğu verisi (turnProgress / turnProgressOf)', () => {
  it('saf fonksiyon 0-1 aralığına sıkıştırır', async () => {
    const { turnProgress } = await import('../src/engine');
    expect(turnProgress(0, 100)).toBe(0);
    expect(turnProgress(40, 100)).toBeCloseTo(0.4);
    expect(turnProgress(130, 100)).toBe(1);
    expect(turnProgress(-20, 100)).toBe(0);
  });

  it('sıradaki aktörün çubuğu dolu, diğerleri 0-1 arasında; durumu değiştirmez', () => {
    const b = turnsBattle();
    const before = b.combatants.map((c) => c.turnCounter);
    const cur = b.currentUid!;
    expect(b.turnProgressOf(cur)).toBe(1);
    for (const c of b.combatants) {
      const p = b.turnProgressOf(c.uid);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(b.combatants.map((c) => c.turnCounter)).toEqual(before);
  });

  it('oynayınca aktörün çubuğu düşer, test modunda null', () => {
    const b = turnsBattle();
    const cur = b.currentUid!;
    b.skipTurn();
    if (b.currentUid !== cur) expect(b.turnProgressOf(cur)).toBeLessThan(1);
    const t = new Battle(content.battleSetup('first-battle', 1, 'test'));
    expect(t.turnProgressOf(t.combatants[0]!.uid)).toBeNull();
    expect(b.turnProgressOf('yok')).toBeNull();
  });
});
