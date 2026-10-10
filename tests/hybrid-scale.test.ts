import { describe, expect, it } from 'vitest';
import { Battle, content, damageRange, describeSkill, previewSkill } from '../src/engine';
import { bonusScaleRaw, damageSpecFor } from '../src/engine/spec';

// Defender Seçenek A (Ömer 2026-10-10): Tremor Slam ve Fist Crush, STR ölçeğinin üstüne Defender'ın GEÇERLİ zırhının bir payını ekler
// (generic damage.bonusScale; aura / item / boss bağı zırhı dahil). Taunt artık kalkan vermez.

const cells = (m: Record<number, string>) => Array.from({ length: 12 }, (_, i) => m[i] ?? '');
const dmgOf = (id: string) => content.skills[id]!.effects.find((e) => e.type === 'damage') as Extract<(typeof content.skills)[string]['effects'][number], { type: 'damage' }>;

describe('hibrit ölçek: damage.bonusScale (Defender)', () => {
  it('veri: Tremor Slam ve Fist Crush STR + zırh payı; Taunt kalkansız', () => {
    for (const id of ['tremor_slam', 'fist_crush']) {
      const e = dmgOf(id);
      expect(e.scale).toBe('str');
      expect(e.bonusScale).toEqual([{ stat: 'armor', pct: expect.any(Number) }]);
      expect(e.bonusScale![0]!.pct).toBeGreaterThan(0);
      expect(e.bonusScale![0]!.pct).toBeLessThanOrEqual(0.25);
    }
    expect(content.skills.taunt!.effects.some((e) => e.type === 'shield')).toBe(false);
    expect(content.skills.taunt!.effects.some((e) => e.type === 'taunt')).toBe(true);
  });

  it('bonusScaleRaw: zırh / büyü zırhı / temel stat x pct toplamı', () => {
    const s = { ...content.classes.defender!.stats, armor: 20, magicArmor: 10, str: 15 };
    expect(bonusScaleRaw([{ stat: 'armor', pct: 0.25 }], s)).toBe(5);
    expect(bonusScaleRaw([{ stat: 'armor', pct: 0.25 }, { stat: 'magicArmor', pct: 0.5 }, { stat: 'str', pct: 0.1 }], s)).toBeCloseTo(11.5, 9);
    expect(bonusScaleRaw(undefined, s)).toBe(0);
  });

  it('hasar ve önizleme saldıranın GEÇERLİ zırhını (aura dahil) kullanır; zırh arttıkça hasar artar', () => {
    // Defender (0) yanında Warrior (1): Defender kendi aurasından da zırh alır
    const b = new Battle(content.battleSetup('random-battle', 2, 'test', { party: cells({ 0: 'defender', 1: 'warrior' }), enemies: cells({ 0: 'mage' }) }, false));
    const d = b.combatants.find((c) => c.defId === 'defender')!;
    const m = b.combatants.find((c) => c.defId === 'mage')!;
    const eff = b.effectiveStats(d);
    expect(eff.armor).toBeGreaterThan(d.stats.armor); // aura
    const e = dmgOf('tremor_slam');
    const want = damageRange(b.attackStats(d), b.effectiveStats(m), damageSpecFor(d, m, e, content.formulas, 1, true, b.damageTakenMult(m), b.dealtDamageMult(d, m), eff), content.formulas);
    const noBonus = damageRange(b.attackStats(d), b.effectiveStats(m), damageSpecFor(d, m, { ...e, bonusScale: undefined }, content.formulas, 1, true, b.damageTakenMult(m), b.dealtDamageMult(d, m)), content.formulas);
    const pv = previewSkill(b, d.uid, 'tremor_slam', m.uid).find((p) => p.uid === m.uid)!.damage!;
    expect(pv.avg).toBe(want.avg);
    expect(want.avg).toBeGreaterThan(noBonus.avg);
    const before = pv.avg;
    d.stats.armor += 40;
    expect(previewSkill(b, d.uid, 'tremor_slam', m.uid).find((p) => p.uid === m.uid)!.damage!.avg).toBeGreaterThan(before);
  });

  it('skill açıklaması iki ölçeği de yazar; "Physical/Magic" kelimesi yok', () => {
    const def = content.classes.defender!;
    const text = describeSkill(content.skills.fist_crush!, def.stats, content.formulas, content.summons, {}).lines.join('\n');
    const pct = Math.round(dmgOf('fist_crush').bonusScale![0]!.pct * 100);
    expect(text).toContain(`STR + ${pct}% Armor`);
    expect(text).not.toMatch(/physical|magic damage/i);
    const taunt = describeSkill(content.skills.taunt!, def.stats, content.formulas, content.summons, {}).lines.join('\n');
    expect(taunt).not.toMatch(/shield/i);
  });
});
