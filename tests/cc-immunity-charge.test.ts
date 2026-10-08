import { describe, expect, it } from 'vitest';
import { Battle, content, describeSkill, explainChoice, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode, SkillDef, Teams } from '../src/engine';
import { describeEvent } from '../src/engine/match-log';

/**
 * Madde 271 (Ömer 2026-10-08):
 * (1) "Boss'lar CC yemesin ... Ama Omen, Wound, ignite gibi skill'leri yesin": boss rütbesi (formulas.json > ccImmunity.tiers) statuses.json > cc durumlarını
 *     (Stun, Slow, Silence) yemez (olay `immune` + 'Immune' yazısı), taunt'a uymaz, çekilemez; diğer debuff'lar işler. Elitler bağışık değil.
 * (2) "Warrior Charge attığı zaman eğer ön sırada değilse ... şeridinin en ön sırasını önceleyerek ön sıradaki bir hücreye geçsin": skill.advanceToFront.
 */
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === type);
const cells = (map: Record<number, string>) => Array.from({ length: content.CELL_COUNT }, (_, i) => map[i] ?? '');
const IMM = content.formulas.ccImmunity!;
const CHARGE = content.skills.charge!;

function grid(party: Record<number, string>, enemies: Record<number, string>, opts: { mode?: BattleMode; units?: Teams['units']; seed?: number } = {}): Battle {
  const b = new Battle(content.battleSetup('random-battle', opts.seed ?? 1, opts.mode ?? 'test', { party: cells(party), enemies: cells(enemies), ...(opts.units ? { units: opts.units } : {}) }, false));
  b.debugClearCooldowns();
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, surviveChance: 0, resilience: 0 });
    c.hp = c.maxHp = 5000;
  }
  return b;
}
const at = (b: Battle, side: 'party' | 'enemy', slot: number) => b.combatants.find((c) => c.side === side && c.slot === slot && c.hp > 0)!;
const act = (b: Battle, uid: string, skill: string, target?: string): BattleEvent[] => {
  const r = b.useSkill(uid, skill, target);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
};
const has = (b: Battle, uid: string, kind: string) => b.get(uid)!.statuses.some((s) => s.kind === kind);
const BOSS: Teams['units'] = { enemies: { 1: { tier: 'boss' } } };
const ELITE: Teams['units'] = { enemies: { 1: { tier: 'elite' } } };

describe('CC bağışıklığı: veri', () => {
  it('CC listesi statuses.json > cc: Stun, Slow, Silence; Wound/Omen/Wither/Blinded/Jinxed/Overextended/Staggered CC değil', () => {
    const cc = Object.entries(content.statuses).filter(([, d]) => d.cc).map(([id]) => id).sort();
    expect(cc).toEqual(['silence', 'slow', 'stun']);
    for (const id of ['wound', 'omen', 'wither', 'blinded', 'jinxed', 'overextended', 'staggered', 'ash_brand']) expect(content.statuses[id]!.cc).toBeUndefined();
    expect(IMM.tiers).toEqual(['boss']); // elitler bağışık değil
    expect(IMM.taunt).toBe(true);
    expect(IMM.displacement).toBe(true);
  });
});

describe('CC bağışıklığı: motor', () => {
  for (const mode of ['test', 'turns'] as BattleMode[]) {
    it(`boss Charge'ın Stun'unu yemez (hasar yer), olay immune + 'Immune'; elit ve normal düşman sersemler (${mode})`, () => {
      for (const [units, immune] of [[BOSS, true], [ELITE, false], [undefined, false]] as const) {
        const b = grid({ 0: 'warrior' }, { 1: 'defender', 4: 'mage' }, { mode, ...(units ? { units } : {}) });
        const w = at(b, 'party', 0);
        const e = at(b, 'enemy', 1);
        if (mode === 'turns') for (let i = 0; i < 40 && b.currentUid !== w.uid; i++) b.skipTurn();
        const hp = e.hp;
        const ev = act(b, w.uid, 'charge', e.uid);
        expect(e.hp).toBeLessThan(hp);
        // (turns modunda sersem düşman hemen sırası gelince turu kaybedip durumu düşürebilir: olaydan bakılır)
        expect(ofType(ev, 'status').some((s) => s.target === e.uid && s.status === 'stun')).toBe(!immune);
        expect(ofType(ev, 'immune').length).toBe(immune ? 1 : 0);
        if (immune) {
          expect(ofType(ev, 'immune')[0]).toMatchObject({ target: e.uid, status: 'stun', source: w.uid });
          expect(ofType(ev, 'passive').some((p) => p.actor === e.uid && p.name === 'Immune')).toBe(true);
          expect(describeEvent(b, ofType(ev, 'immune')[0]!)).toContain('IMMUNE');
        }
      }
    });
  }

  it('boss Slow ve Silence (madde 272: Blinded, Jinxed da) yemez; Wound, Omen, Wither, Overextended uygulanır', () => {
    const b = grid({ 0: 'warrior' }, { 1: 'defender' }, { units: BOSS });
    const e = at(b, 'enemy', 1);
    for (const k of ['slow', 'silence', 'stun', 'blinded', 'jinxed']) {
      b.debugAddStatus(e.uid, k, 2);
      expect(has(b, e.uid, k)).toBe(false);
    }
    for (const k of ['wound', 'wither', 'overextended']) {
      b.debugAddStatus(e.uid, k, 2);
      expect(has(b, e.uid, k)).toBe(true);
    }
    b.debugAddStatus(e.uid, 'omen');
    expect(e.statuses.find((s) => s.kind === 'omen')?.stacks).toBe(1);
  });

  it('Drain Field: MP\'si biten boss susturulmaz ama zarın hasarını yer; önizleme Immune gösterir; YZ susturma değeri 0', () => {
    const sure: Record<string, SkillDef> = { drain_field: { ...content.skills.drain_field!, effects: content.skills.drain_field!.effects.map((x) => (x.type === 'manaBurn' && x.onEmpty ? { ...x, onEmpty: { ...x.onEmpty, chance: 1 } } : x)) } };
    for (const units of [BOSS, undefined]) {
      const base = content.battleSetup('random-battle', 1, 'test', { party: cells({ 4: 'antimage' }), enemies: cells({ 1: 'mage' }), ...(units ? { units } : {}) }, false);
      const b = new Battle({ ...base, skills: { ...base.skills, ...sure } });
      for (const c of b.combatants) c.hp = c.maxHp = 5000;
      const am = at(b, 'party', 4);
      const m = at(b, 'enemy', 1);
      m.mp = 0;
      const pv = previewSkill(b, am.uid, 'drain_field', m.uid).find((p) => p.uid === m.uid)!;
      expect(!!pv.immune?.length).toBe(!!units);
      const ex = explainChoice(b, am.uid, content.aiConfig)!;
      const cand = ex.candidates.find((c) => c.skill === 'drain_field'); // tek düşman
      if (cand && units) expect(cand.terms?.silence ?? 0).toBe(0); // boss: susturma değeri yok (MP'siz normal hedefte de engellenen hamle 0 olabilir)
      const hp = m.hp;
      const ev = act(b, am.uid, 'drain_field', m.uid);
      expect(has(b, m.uid, 'silence')).toBe(!units);
      expect(m.hp).toBeLessThan(hp);
      expect(ofType(ev, 'immune').length).toBe(units ? 1 : 0);
    }
  });

  it('taunt: boss tek hedefli skill\'lerde taunt\'lı düşmana zorlanmaz; normal düşman zorlanır', () => {
    for (const [units, free] of [[BOSS, true], [undefined, false]] as const) {
      const b = grid({ 0: 'defender', 1: 'mage' }, { 1: 'warrior' }, units ? { units } : {});
      const d = at(b, 'party', 0);
      const m = at(b, 'party', 1);
      act(b, d.uid, 'taunt');
      const e = at(b, 'enemy', 1);
      const ids = b.validTargets(e.uid, 'melee_attack').map((c) => c.uid);
      expect(ids.includes(m.uid)).toBe(free);
      expect(b.targetProblem(e.uid, 'melee_attack', m.uid)).toBe(free ? null : 'Must target the taunting enemy');
    }
  });

  it('boss çekilemez (Chain Hook / pull); elit çekilir', () => {
    for (const [units, pulled] of [[{ enemies: { 4: { tier: 'boss' as const } } }, false], [{ enemies: { 4: { tier: 'elite' as const } } }, true]] as const) {
      const b = grid({ 0: 'warrior' }, { 4: 'mage' }, { units });
      expect(b.pullDestination(at(b, 'enemy', 4)) !== null).toBe(pulled);
    }
  });

  it('önizleme: Charge boss\'ta "Immune: Stun"; YZ: boss\'a Charge\'ın kontrol (Stun) değeri yok, normal düşmanda var', () => {
    for (const units of [BOSS, undefined]) {
      const b = grid({ 0: 'warrior' }, { 1: 'defender' }, units ? { units } : {});
      const w = at(b, 'party', 0);
      const e = at(b, 'enemy', 1);
      const pv = previewSkill(b, w.uid, 'charge', e.uid).find((p) => p.uid === e.uid)!;
      expect(pv.statuses?.some((s) => s.startsWith('Immune: '))).toBe(!!units);
      expect(pv.immune ?? []).toEqual(units ? [content.statuses.stun!.name] : []);
      const cand = explainChoice(b, w.uid, content.aiConfig)!.candidates.find((c) => c.skill === 'charge')!; // tek düşman
      expect((cand.terms?.control ?? 0) > 0).toBe(!units);
    }
  });

  it('skill-info: CC durumu veren skill "Bosses are immune"; Warden pasif metni immune to crowd control', () => {
    const info = describeSkill(CHARGE, content.classes.warrior!.stats, content.formulas, {}, { statuses: content.statuses });
    expect(info.lines.some((l) => l.includes('Bosses are immune to Stun'))).toBe(true);
    const wound = describeSkill(content.skills.melee_attack!, content.classes.warrior!.stats, content.formulas, {}, { statuses: content.statuses });
    expect(wound.lines.some((l) => l.includes('Bosses are immune'))).toBe(false);
    const uy = content.bosses.bridge_warden!.boss!.passives!.find((p) => p.id === 'unyielding')!;
    expect(uy.text).toContain('Immune to crowd control');
  });
});

describe('Warrior Charge: ön sıraya geçiş (advanceToFront)', () => {
  it('veri: Charge advanceToFront taşır', () => {
    expect(CHARGE.advanceToFront).toBe(true);
  });

  for (const mode of ['test', 'turns'] as BattleMode[]) {
    it(`ön sırada değilse önce kendi şeridinin ön hücresine geçer; olay moved {advance} (${mode})`, () => {
      const b = grid({ 4: 'warrior', 0: 'mage' }, { 1: 'mage' }, { mode });
      const w = at(b, 'party', 4); // sıra 1, şerit 1 -> şeridin ön hücresi 1 boş
      if (mode === 'turns') for (let i = 0; i < 40 && b.currentUid !== w.uid; i++) b.skipTurn();
      const ev = act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
      expect(w.slot).toBe(1);
      const mv = ofType(ev, 'moved');
      expect(mv).toEqual([{ type: 'moved', actor: w.uid, from: 4, to: 1, cause: 'charge', by: w.uid, advance: true }]);
      // olay sırası: vuruştan (hasar/durum) sonra
      expect(ev.findIndex((e) => e.type === 'moved')).toBeGreaterThan(ev.findIndex((e) => e.type === 'damage' || e.type === 'miss' || e.type === 'dodge'));
      expect(describeEvent(b, mv[0]!)).toContain('front row');
    });
  }

  it('şeridin ön hücresi doluysa ön sıradaki en yakın boş hücre (şerit farkı en az; eşitlikte küçük şerit)', () => {
    // şerit 1 (yuva 4), ön 1 dolu; 0 ve 2 eşit uzaklıkta -> 0
    let b = grid({ 4: 'warrior', 1: 'mage' }, { 1: 'mage' });
    let w = at(b, 'party', 4);
    act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
    expect(w.slot).toBe(0);
    // şerit 0 (yuva 6, sıra 2), ön 0 dolu; en yakın şerit 1 (yuva 1)
    b = grid({ 6: 'warrior', 0: 'mage' }, { 1: 'mage' });
    w = at(b, 'party', 6);
    act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
    expect(w.slot).toBe(1);
    expect(b.advanceDestination(w)).toBeNull(); // artık ön sırada
  });

  it('ön sıra doluysa yerinde kalır; zaten ön sıradaysa hareket yok', () => {
    let b = grid({ 3: 'warrior', 0: 'mage', 1: 'archer', 2: 'paladin' }, { 1: 'mage' });
    let w = at(b, 'party', 3);
    expect(b.advanceDestination(w)).toBeNull();
    let ev = act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
    expect(w.slot).toBe(3);
    expect(ofType(ev, 'moved')).toEqual([]);
    b = grid({ 2: 'warrior' }, { 1: 'mage' });
    w = at(b, 'party', 2);
    ev = act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
    expect(w.slot).toBe(2);
    expect(ofType(ev, 'moved')).toEqual([]);
  });

  it('ölü dostun ceset hücresine de geçebilir (Move kuralı)', () => {
    const b = grid({ 3: 'warrior', 0: 'mage', 1: 'archer', 2: 'paladin' }, { 1: 'mage' });
    const w = at(b, 'party', 3);
    const corpse = at(b, 'party', 0);
    expect(b.debugKill(corpse.uid).ok).toBe(true);
    expect(b.advanceDestination(w)).toBe(0);
    act(b, w.uid, 'charge', at(b, 'enemy', 1).uid);
    expect(w.slot).toBe(0);
  });

  it('önizleme ve skill-info: "steps into the front row"', () => {
    const b = grid({ 4: 'warrior' }, { 1: 'mage' });
    const w = at(b, 'party', 4);
    const self = previewSkill(b, w.uid, 'charge', at(b, 'enemy', 1).uid).find((p) => p.uid === w.uid);
    expect(self?.advance).toEqual({ from: 4, to: 1 });
    const info = describeSkill(CHARGE, content.classes.warrior!.stats, content.formulas, {}, { statuses: content.statuses });
    expect(info.lines.some((l) => l.includes('step into the front row'))).toBe(true);
  });

  it('YZ: ön sıraya geçiş terazide (position): melee yapamayan arka Warrior için kazanç; tam can tank riski yarı', () => {
    // Warrior sıra 1'de, önünde dost (ön sıra dolu değil ama Warrior melee yapamaz: dostun sırası daha önde)
    const b = grid({ 4: 'warrior', 0: 'mage' }, { 1: 'mage', 4: 'archer' });
    const w = at(b, 'party', 4);
    expect(b.canMeleeFrom(w.uid, 4)).toBe(false);
    const cand = explainChoice(b, w.uid, content.aiConfig)!.candidates.find((c) => c.skill === 'charge')!;
    expect(cand.terms?.position ?? 0).toBeGreaterThan(0);
    expect(cand.notes?.some((n) => n.startsWith('advance to cell 1'))).toBe(true);
    // ön sıradaki Warrior: terim yok
    const b2 = grid({ 1: 'warrior' }, { 1: 'mage' });
    const c2 = explainChoice(b2, at(b2, 'party', 1).uid, content.aiConfig)!.candidates.find((c) => c.skill === 'charge')!;
    expect(c2.terms?.position).toBeUndefined();
  });

  it('determinizm: aynı seed + aynı hamleler = aynı olaylar', () => {
    const run = () => {
      const b = grid({ 4: 'warrior', 1: 'mage' }, { 1: 'mage' });
      act(b, at(b, 'party', 4).uid, 'charge', at(b, 'enemy', 1).uid);
      return JSON.stringify(b.log);
    };
    expect(run()).toBe(run());
  });
});
