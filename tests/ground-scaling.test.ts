import { describe, expect, it } from 'vitest';
import { Battle, attributePower, content, describeSkill, previewSkill } from '../src/engine';
import type { BattleEvent } from '../src/engine';

const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const mk = (caster: string, mode: 'turns' | 'test') => {
  const b = new Battle(content.battleSetup('random-battle', 3, mode, { party: cells({ 0: caster }), enemies: cells({ 0: 'warrior', 3: 'warrior' }) }, false));
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, armor: 0, magicArmor: 0 });
  const me = b.combatants.find((c) => c.side === 'party')!;
  me.mp = 999;
  if (mode === 'turns') while (b.currentUid !== me.uid) b.skipTurn();
  return { b, me };
};
const groundOf = (skill: string) => content.skills[skill]!.effects.find((e) => e.type === 'ground') as { type: 'ground'; ground: string; turns: number; scale: 'str' | 'int' | 'dex' | 'luck'; power: number };
const cast = (b: Battle, uid: string, skill: string) => {
  const r = b.useSkill(uid, skill, 'enemy-0');
  if (!r.ok) throw new Error(r.reason);
  return r.events;
};
/** Zemin hasarı bırakılan tik sonrası ilk 'damage' olayları: hedef -> miktar (can + kalkan). */
const firstTick = (b: Battle, me: string) => {
  const out = new Map<string, number>();
  const res = { get: (_: string) => [...out.values()][0] };
  for (let i = 0; i < 30 && out.size < 1; i++) {
    const r = b.skipTurn();
    if (!r.ok) break;
    for (const e of r.events as Extract<BattleEvent, { type: 'damage' }>[]) if (e.type === 'damage' && e.source === me && !out.has(e.target)) out.set(e.target, e.amount + e.absorbed);
  }
  return res;
};

const CASES = [
  { caster: 'paladin', skill: 'judgment', scale: 'int' },
  { caster: 'mage', skill: 'meteor', scale: 'int' },
  { caster: 'undead', skill: 'wail_of_the_dead', scale: 'int' },
] as const;

describe('yer etkisi (ground) hasarı bırakanın statına bağlıdır', () => {
  for (const c of CASES) {
    it(`${c.skill}: ground ${c.scale} ile ölçeklenir ve bırakıldığı andaki stat sabitlenir`, () => {
      const g = groundOf(c.skill);
      expect(g.scale).toBe(c.scale);
      for (const mode of ['turns', 'test'] as const) {
        const lo = mk(c.caster, mode);
        const hi = mk(c.caster, mode);
        lo.me.stats.int = 4;
        hi.me.stats.int = 40;
        cast(lo.b, lo.me.uid, c.skill);
        cast(hi.b, hi.me.uid, c.skill);
        const f = content.formulas;
        expect(lo.b.ground[0]!.amount).toBe(Math.round(attributePower(lo.me.stats, g.scale, f) * g.power));
        expect(hi.b.ground[0]!.amount).toBe(Math.round(attributePower(hi.me.stats, g.scale, f) * g.power));
        expect(hi.b.ground[0]!.amount).toBeGreaterThan(lo.b.ground[0]!.amount);
        expect(hi.b.ground[0]).toMatchObject({ scale: 'int', sourceStat: 40, power: g.power });
      }
    });

    it(`${c.skill}: farklı Int farklı tik hasarı verir (turns); sonradan stat değişse de snapshot geçerli`, () => {
      const lo = mk(c.caster, 'turns');
      const hi = mk(c.caster, 'turns');
      lo.me.stats.int = 4;
      hi.me.stats.int = 40;
      cast(lo.b, lo.me.uid, c.skill);
      cast(hi.b, hi.me.uid, c.skill);
      hi.me.stats.int = 1; // bırakıldıktan sonra stat düşse de tik değişmez
      const a = firstTick(lo.b, lo.me.uid).get('enemy-0')!;
      const b = firstTick(hi.b, hi.me.uid).get('enemy-0')!;
      expect(a).toBe(Math.max(content.formulas.damage.minDamage, lo.b.ground[0]!.amount));
      expect(b).toBeGreaterThan(a);
    });
  }

  it('Int 0 civarında tik en az minDamage kadardır (negatif/NaN olmaz)', () => {
    const t = mk('paladin', 'turns');
    t.me.stats.int = 0;
    cast(t.b, t.me.uid, 'judgment');
    expect(t.b.ground[0]!.amount).toBe(0);
    const tick = firstTick(t.b, t.me.uid).get('enemy-0')!;
    expect(tick).toBe(content.formulas.damage.minDamage);
  });

  it('tik hedefin büyü zırhından etkilenir (zırhsız kadar değil), kritik/isabet yok', () => {
    const t = mk('paladin', 'turns');
    cast(t.b, t.me.uid, 'judgment');
    const amount = t.b.ground[0]!.amount;
    const target = t.b.get('enemy-0')!;
    expect(t.b.groundTickDamage('holy_fire', amount, target)).toBe(amount);
    target.stats.magicArmor = content.formulas.armor.k; // %50 azaltma
    expect(t.b.groundTickDamage('holy_fire', amount, target)).toBe(Math.round(amount / 2));
  });

  it('Judgment skill-info ve önizleme Int\'e göre değişir; ikisi aynı sayıyı gösterir', () => {
    const lo = mk('paladin', 'test');
    const hi = mk('paladin', 'test');
    lo.me.stats.int = 6;
    hi.me.stats.int = 30;
    const sk = content.skills.judgment!;
    const info = (m: typeof lo) => describeSkill(sk, m.me.stats, content.formulas, {}, { grounds: content.grounds }).lines.join(' ');
    expect(info(lo)).toMatch(/85% INT/);
    expect(info(lo)).not.toBe(info(hi));
    const pv = (m: typeof lo) => previewSkill(m.b, m.me.uid, 'judgment', 'enemy-0')[0]!.ground!;
    expect(pv(hi).perTick).toBeGreaterThan(pv(lo).perTick);
    expect(pv(hi).total).toBe(pv(hi).perTick * groundOf('judgment').turns);
    expect(info(hi)).toContain(`(${pv(hi).perTick})`);
  });
});
