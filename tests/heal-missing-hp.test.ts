import { describe, expect, it } from 'vitest';
import { Battle, content, describeSkill, healRange, missingHpHealMult, previewSkill } from '../src/engine';
import type { BattleEvent } from '../src/engine';

// Ömer isteği 2026-10-09: Paladin'in Radiance'ı canı düşük dostu biraz daha fazla iyileştirsin.
// Generic mekanik: heal.missingHpBonus -> şifa x (1 + bonus x hedefin eksik can oranı), hedef başına (alan şifasında her dost kendi oranıyla).

const radiance = content.skills.radiance!;
const healEffect = radiance.effects.find((e) => e.type === 'heal') as Extract<(typeof radiance.effects)[number], { type: 'heal' }>;
const BONUS = healEffect.missingHpBonus!;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const BIG = 100000;
const NEAR_FULL = BIG - 1000; // eksik can şifadan büyük (tavan devreye girmez), oran 0,01

/** Test modu savaşı: Paladin (0), Warrior (1), Mage (6) vs Archer; kritik kapalı; dostların maks canı büyük (tavan devreye girmesin). */
function mk(hp: { warrior: number; mage: number }): { b: Battle; uid: (id: string) => string } {
  const b = new Battle(content.battleSetup('random-battle', 7, 'test', { party: cells({ 0: 'paladin', 1: 'warrior', 6: 'mage' }), enemies: cells({ 0: 'archer' }) }, false));
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, manaEcho: 0 });
    c.mp = c.maxMp;
    if (c.side === 'party' && c.defId !== 'paladin') c.maxHp = BIG;
  }
  const uid = (id: string) => b.combatants.find((c) => c.side === 'party' && c.defId === id)!.uid;
  b.combatants.find((c) => c.uid === uid('warrior'))!.hp = hp.warrior;
  b.combatants.find((c) => c.uid === uid('mage'))!.hp = hp.mage;
  return { b, uid };
}

const healsOf = (events: BattleEvent[], target: string) => events.filter((e): e is Extract<BattleEvent, { type: 'heal' }> => e.type === 'heal' && e.target === target);

describe('heal.missingHpBonus (Radiance: canı düşük dosta daha fazla şifa)', () => {
  it('veri: Radiance şifasında bonus 0,5', () => {
    expect(BONUS).toBe(0.5);
  });

  it('çarpan: canı dolu +%0, yarı can +bonus/2, ölmek üzere ~+bonus; bonus yoksa tam 1', () => {
    expect(missingHpHealMult(0.5, 100, 100)).toBe(1);
    expect(missingHpHealMult(0.5, 50, 100)).toBe(1.25);
    expect(missingHpHealMult(0.5, 0, 100)).toBe(1.5);
    expect(missingHpHealMult(0.5, 150, 100)).toBe(1); // oran [0, 1]
    expect(missingHpHealMult(undefined, 1, 100)).toBe(1);
    expect(missingHpHealMult(0, 1, 100)).toBe(1);
  });

  it('motor: alan şifasında her dost kendi eksik can oranıyla; aynı zar (RNG sırası değişmez)', () => {
    // Aynı seed: A'da Warrior neredeyse ölü, Mage neredeyse dolu; B'de tersi. Zarlar aynı olduğundan oranlar karşılaştırılabilir.
    const A = mk({ warrior: 1, mage: NEAR_FULL });
    const B = mk({ warrior: NEAR_FULL, mage: 1 });
    const ra = A.b.useSkill(A.uid('paladin'), 'radiance');
    const rb = B.b.useSkill(B.uid('paladin'), 'radiance');
    if (!ra.ok || !rb.ok) throw new Error('Radiance kullanılamadı');
    const ea = ra;
    const eb = rb;
    const lowA = healsOf(ea.events, A.uid('warrior'))[0]!.amount; // ~ taban x 1,5
    const fullB = healsOf(eb.events, B.uid('warrior'))[0]!.amount; // ~ taban x 1,0
    const lowB = healsOf(eb.events, B.uid('mage'))[0]!.amount;
    const fullA = healsOf(ea.events, A.uid('mage'))[0]!.amount;
    expect(fullB).toBeGreaterThan(0);
    const ratio = missingHpHealMult(BONUS, 1, BIG) / missingHpHealMult(BONUS, NEAR_FULL, BIG); // ~1,5 / 1,005
    expect(Math.abs(lowA - fullB * ratio)).toBeLessThanOrEqual(1);
    expect(Math.abs(lowB - fullA * ratio)).toBeLessThanOrEqual(1);
    expect(lowA).toBeGreaterThan(fullB * 1.4);
    // düşmana giden hasar iki savaşta aynı (RNG sırası korunur)
    const dmg = (ev: BattleEvent[]) => ev.filter((e) => e.type === 'damage').map((e) => JSON.stringify(e));
    expect(dmg(ea.events)).toEqual(dmg(eb.events));
  });

  it('önizleme motorla aynı çarpanı kullanır (yapay zekanın şifa değeri de buradan gelir)', () => {
    const { b, uid } = mk({ warrior: BIG / 2, mage: NEAR_FULL });
    const pal = b.combatants.find((c) => c.uid === uid('paladin'))!;
    const r = healRange(pal.stats, healEffect.scale, healEffect.power, content.formulas);
    const pv = previewSkill(b, pal.uid, 'radiance');
    const w = pv.find((p) => p.uid === uid('warrior'))!.heal!;
    expect(w.avg).toBe(Math.round(r.avg * 1.25));
    expect(w.min).toBe(Math.round(r.min * 1.25));
    expect(w.max).toBe(Math.round(r.max * 1.25));
    const m = pv.find((p) => p.uid === uid('mage'))!.heal!;
    expect(m.avg).toBe(Math.round(r.avg * missingHpHealMult(BONUS, NEAR_FULL, BIG)));
  });

  it('skill açıklaması bonusu yazar; bonusu olmayan şifa (Druid) yazmaz', () => {
    const pal = content.classes.paladin!;
    const text = describeSkill(radiance, pal.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds }).lines.join('\n');
    expect(text).toContain("Heals more the lower the ally's health: up to +50%");
    const others = Object.values(content.skills).filter((s) => s.id !== 'radiance' && s.effects.some((e) => e.type === 'heal'));
    for (const s of others) {
      expect(s.effects.some((e) => e.type === 'heal' && !!e.missingHpBonus)).toBe(false);
      expect(describeSkill(s, pal.stats, content.formulas, content.summons, {}).lines.join('\n')).not.toContain('lower the ally');
    }
  });
});
