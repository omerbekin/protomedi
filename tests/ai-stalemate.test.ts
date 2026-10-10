import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import { ValueContext, DEFAULT_VALUE, type AiValueConfig } from '../src/engine/ai-value';
import type { Battle as BattleT } from '../src/engine';

// Undead aynası tıkanması (open-questions madde 291; 2026-10-10): YZ yeniden çağrılabilen Skeleton'ları vurup duruyordu, lifesteal + Dark Bond +
// yenilenme + Raise Dead hasarı karşılıyordu (tests/ai-global.test.ts seed 12 bitmiyordu). Düzeltme yalnızca YZ değer terazisinde (kural değişmez):
// value.resummonShare (boşuna çağrı öldürme/bağ/şifa) + tıkanma sinyali value.stallTurns / stallRamp / stallFocus (uzun savaşta çağırıcıya odak).

const cells = (m: Record<number, string>) => Array.from({ length: 12 }, (_, i) => m[i] ?? '');
const vc = (): AiValueConfig => ({ ...DEFAULT_VALUE, ...(content.aiConfig.value ?? {}) }) as AiValueConfig;

/** Undead (party) karşısında önde Skeleton, arkada Undead. Kritik/kaçınma kapalı, isabet tam. */
function mirror(mode: 'turns' | 'test' = 'turns', lockOwn = false): { b: BattleT; me: string; foe: string; skel: string } {
  const units = lockOwn ? { party: { 6: { lockSkills: ['raise_dead', 'wail_of_the_dead'] } } } : undefined;
  const b = new Battle(content.battleSetup('random-battle', 4, mode, { party: cells({ 6: 'undead' }), enemies: cells({ 0: 'skeleton', 6: 'undead' }), ...(units ? { units } : {}) }, false));
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  const me = b.combatants.find((c) => c.side === 'party' && c.defId === 'undead')!.uid;
  const foe = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'undead')!.uid;
  const skel = b.combatants.find((c) => c.defId === 'skeleton')!.uid;
  return { b, me, foe, skel };
}

describe('YZ: boşuna çağrı ve tıkanma (Undead aynası)', () => {
  it('veri: ayarlar data/ai.json > value içinde', () => {
    const v = vc();
    expect(v.resummonShare).toBeGreaterThan(0);
    expect(v.resummonShare).toBeLessThan(1);
    expect(v.stallTurns).toBeGreaterThan(100); // normal savaşlar ~37 turda biter: sinyal onlara dokunmaz
    expect(v.stallRamp).toBeGreaterThan(0);
    expect(v.stallFocus).toBeGreaterThan(0);
  });

  it('çağırıcı ufukta yeniden çağırabiliyorsa çağrıyı öldürmenin payı düşer; Raise Dead uzun cooldown\'daysa tam değer', () => {
    const { b, me, foe, skel } = mirror();
    const ctx = new ValueContext(b, b.get(me)!, vc(), () => 'lowest_hp');
    expect(ctx.resummonShare(b.get(skel)!)).toBe(vc().resummonShare);
    expect(ctx.resummonShare(b.get(foe)!)).toBe(1); // çağrı değil
    b.get(foe)!.cooldowns.raise_dead = 9;
    expect(new ValueContext(b, b.get(me)!, vc(), () => 'lowest_hp').resummonShare(b.get(skel)!)).toBe(1);
    b.get(foe)!.hp = 0; // çağırıcı yok
    b.get(foe)!.cooldowns.raise_dead = 0;
    expect(new ValueContext(b, b.get(me)!, vc(), () => 'lowest_hp').resummonShare(b.get(skel)!)).toBe(1);
  });

  it('tıkanma sinyali: stallTurns öncesi 0, sonra doğrusal 1\'e; tıkanmada çağrı cooldown\'dan bağımsız olarak kısmen değersiz', () => {
    const { b, me, foe, skel } = mirror();
    const v = vc();
    b.get(foe)!.cooldowns.raise_dead = 9;
    const at = (t: number) => {
      b.turnsTaken = t;
      return new ValueContext(b, b.get(me)!, v, () => 'lowest_hp');
    };
    expect(at(0).stall()).toBe(0);
    expect(at(v.stallTurns!).stall()).toBe(0);
    expect(at(v.stallTurns! + v.stallRamp! / 2).stall()).toBeCloseTo(0.5, 9);
    expect(at(v.stallTurns! + v.stallRamp! * 5).stall()).toBe(1);
    expect(at(v.stallTurns! + v.stallRamp! * 5).resummonShare(b.get(skel)!)).toBeCloseTo(v.resummonShare!, 9);
  });

  it('Undead önündeki Skeleton yerine (Raise Dead hazırken) karşı Undead\'i vurur', () => {
    const { b, me, foe } = mirror('test', true); // kendi Raise Dead'i kilitli: yalnızca hedef seçimi ölçülür
    const ch = chooseAction(b, me, { ...content.aiConfig, global: undefined });
    expect(ch?.skillId).toBe('bone_throw');
    expect(ch?.targetUid).toBe(foe);
    // karşılaştırma: pay kapalıyken (eski terazi) çifte hasar alan Skeleton seçiliyordu
    const old = chooseAction(b, me, { ...content.aiConfig, global: undefined, value: { ...DEFAULT_VALUE, ...content.aiConfig.value, resummonShare: 1 } });
    expect(old?.targetUid).not.toBe(foe);
  });

  it('regresyon: Undead\'e karşı Undead son oyunu (ai-global seed 12) artık biter', () => {
    const b = new Battle(content.battleSetup('random-battle', 12, 'turns'));
    for (let i = 0; i < 600 && !b.winner; i++) {
      const u = b.currentUid!;
      expect(b.applyChoice(u, chooseAction(b, u, content.aiConfig)).ok).toBe(true);
    }
    expect(b.winner).not.toBeNull();
  });

  it('belirleyici: aynı savaş iki kez aynı sonuç', () => {
    const run = () => {
      const b = new Battle(content.battleSetup('random-battle', 12, 'turns'));
      const picks: string[] = [];
      for (let i = 0; i < 600 && !b.winner; i++) {
        const u = b.currentUid!;
        const ch = chooseAction(b, u, content.aiConfig);
        picks.push(`${u}:${ch?.skillId}:${ch?.targetUid ?? ''}`);
        b.applyChoice(u, ch);
      }
      return { winner: b.winner, picks };
    };
    expect(run()).toEqual(run());
  });
});
