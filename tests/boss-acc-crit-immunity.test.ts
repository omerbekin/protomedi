import { describe, expect, it } from 'vitest';
import { Battle, content, describeSkill, explainChoice, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode, Teams } from '../src/engine';
import { isAccuracyCritDebuff } from '../src/engine/cc-immunity';
import { buildWiki } from '../src/wiki/catalog';

/**
 * Madde 272 (Ömer 2026-10-08): "İsabeti-kritiği bozan etkiler de boss'a işlemesin. Hexer'in Omen'indeki kritik düşürme (Misfortune) de boss'a işlemesin."
 * formulas.json > ccImmunity.accuracyCrit: isabet/kritik düşüren debuff'lar (accuracyDelta < 0 ya da critDelta < 0: Blinded, Jinxed) boss'a uygulanmaz
 * (CC ile aynı 'Immune' akışı). ccImmunity.omenCrit: Omen uygulanır (yığın, Doom aynen) ama critDeltaPerStack boss'ta yok sayılır. Taunt kararı aynen.
 */
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === type);
const cells = (map: Record<number, string>) => Array.from({ length: content.CELL_COUNT }, (_, i) => map[i] ?? '');
const IMM = content.formulas.ccImmunity!;
const OMEN = content.statuses.omen!;
const BOSS: Teams['units'] = { enemies: { 1: { tier: 'boss' } } };
const ELITE: Teams['units'] = { enemies: { 1: { tier: 'elite' } } };

function grid(party: Record<number, string>, enemies: Record<number, string>, opts: { mode?: BattleMode; units?: Teams['units']; natural?: boolean } = {}): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, opts.mode ?? 'test', { party: cells(party), enemies: cells(enemies), ...(opts.units ? { units: opts.units } : {}) }, false));
  b.debugClearCooldowns();
  b.freeMp = true;
  for (const c of b.combatants) {
    if (!opts.natural) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, surviveChance: 0, resilience: 0 });
    c.hp = c.maxHp = 5000;
  }
  return b;
}
const at = (b: Battle, side: 'party' | 'enemy', slot: number) => b.combatants.find((c) => c.side === side && c.slot === slot && c.hp > 0)!;
const has = (b: Battle, uid: string, kind: string) => b.get(uid)!.statuses.some((s) => s.kind === kind);

describe('Boss isabet/kritik bağışıklığı: veri', () => {
  it('ccImmunity.accuracyCrit ve omenCrit açık; kural accuracyDelta/critDelta < 0 olan debuff\'ları seçer (Blinded, Jinxed), Shrouded/Omen değil', () => {
    expect(IMM.accuracyCrit).toBe(true);
    expect(IMM.omenCrit).toBe(true);
    const picked = Object.entries(content.statuses).filter(([, d]) => isAccuracyCritDebuff(d)).map(([id]) => id).sort();
    expect(picked).toContain('blinded');
    expect(picked).toContain('jinxed');
    for (const id of picked) {
      const d = content.statuses[id]!;
      expect(d.type).toBe('debuff');
      expect((d.accuracyDelta ?? 0) < 0 || (d.critDelta ?? 0) < 0).toBe(true);
    }
    expect(picked).not.toContain('shrouded');
    expect(picked).not.toContain('omen'); // Omen uygulanır; yalnızca Misfortune yok sayılır
    expect(IMM.taunt).toBe(true); // Ömer kararı (1): taunt boss'a işlemez, aynen
  });
});

describe('Boss isabet/kritik bağışıklığı: motor', () => {
  for (const mode of ['test', 'turns'] as BattleMode[]) {
    it(`Jinx: boss Jinxed yemez (olay immune + 'Immune'), hasar ve Omen işler; elit ve normal düşman Jinxed olur (${mode})`, () => {
      for (const [units, immune] of [[BOSS, true], [ELITE, false], [undefined, false]] as const) {
        const b = grid({ 4: 'hexer' }, { 1: 'warrior', 4: 'mage' }, { mode, ...(units ? { units } : {}) });
        const h = at(b, 'party', 4);
        const e = at(b, 'enemy', 1);
        if (mode === 'turns') for (let i = 0; i < 60 && b.currentUid !== h.uid; i++) b.skipTurn();
        const hp = e.hp;
        const r = b.useSkill(h.uid, 'jinx', e.uid);
        expect(r.ok).toBe(true);
        const ev = r.ok ? r.events : [];
        expect(e.hp).toBeLessThan(hp);
        expect(e.statuses.find((s) => s.kind === 'omen')?.stacks ?? 0).toBeGreaterThan(0);
        expect(ofType(ev, 'status').some((s) => s.target === e.uid && s.status === 'jinxed')).toBe(!immune);
        const imm = ofType(ev, 'immune');
        expect(imm.length).toBe(immune ? 1 : 0);
        if (immune) {
          expect(imm[0]).toMatchObject({ target: e.uid, status: 'jinxed', source: h.uid });
          expect(ofType(ev, 'passive').some((p) => p.actor === e.uid && p.name === 'Immune')).toBe(true);
        }
      }
    });
  }

  it('Smoke Bomb: düşman tahtasında boss Blinded olmaz (Immune), yanındaki normal düşman olur', () => {
    const b = grid({ 0: 'cutthroat' }, { 1: 'warrior', 2: 'mage' }, { units: BOSS });
    const boss = at(b, 'enemy', 1);
    const other = at(b, 'enemy', 2);
    const anchor = b.shapeAnchors('party-0', 'smoke_bomb', 'enemy').find((a) => {
      const t = b.shapePreviewCells('party-0', 'smoke_bomb', a, 'enemy').targets;
      return t.includes(boss.uid) && t.includes(other.uid);
    })!;
    expect(anchor).toBeDefined();
    const r = b.useSkill('party-0', 'smoke_bomb', undefined, anchor, 'enemy');
    expect(r.ok).toBe(true);
    expect(has(b, boss.uid, 'blinded')).toBe(false);
    expect(has(b, other.uid, 'blinded')).toBe(true);
    expect(ofType(r.ok ? r.events : [], 'immune').map((x) => x.status)).toEqual(['blinded']);
  });

  it('Misfortune: boss\'ta Omen yığını kritik şansını düşürmez (yığın ve Doom aynen); elitte düşürür', () => {
    for (const [units, ignored] of [[BOSS, true], [ELITE, false]] as const) {
      const b = grid({ 4: 'hexer' }, { 1: 'warrior' }, { units });
      const h = at(b, 'party', 4);
      const e = at(b, 'enemy', 1);
      e.stats.critChance = 0.2;
      for (let i = 0; i < 2; i++) expect(b.useSkill(h.uid, 'evil_eye', e.uid).ok).toBe(true);
      expect(e.statuses.find((s) => s.kind === 'omen')?.stacks).toBe(2);
      expect(b.ignoresMisfortune(e)).toBe(ignored);
      expect(b.effectiveStats(e).critChance).toBeCloseTo(ignored ? 0.2 : 0.2 + 2 * OMEN.critDeltaPerStack!);
      // 3. Omen: Doom boss'ta da patlar
      const r = b.useSkill(h.uid, 'evil_eye', e.uid);
      expect(r.ok && ofType(r.events, 'doom').length).toBe(1);
    }
  });
});

describe('Boss isabet/kritik bağışıklığı: önizleme, YZ, skill-info, wiki', () => {
  it('önizleme: Jinx boss\'ta "Immune: Jinxed", hasar ve Omen yine görünür', () => {
    for (const units of [BOSS, undefined]) {
      const b = grid({ 4: 'hexer' }, { 1: 'warrior' }, units ? { units } : {});
      const pv = previewSkill(b, at(b, 'party', 4).uid, 'jinx', at(b, 'enemy', 1).uid).find((p) => p.uid === at(b, 'enemy', 1).uid)!;
      expect(pv.immune ?? []).toEqual(units ? [content.statuses.jinxed!.name] : []);
      expect(pv.damage).toBeDefined();
      expect(pv.omen).toBeDefined();
    }
  });

  it('YZ: boss\'a Jinx\'in isabet/kritik bozma değeri 0 (hasar ve Omen değeri var); normal düşmanda var', () => {
    for (const units of [BOSS, undefined]) {
      const b = grid({ 4: 'hexer' }, { 1: 'warrior' }, { natural: true, ...(units ? { units } : {}) });
      const cand = explainChoice(b, at(b, 'party', 4).uid, content.aiConfig)!.candidates.find((c) => c.skill === 'jinx')!;
      expect(cand).toBeDefined();
      expect((cand.mitigation ?? 0) > 0).toBe(!units);
      expect(cand.dmg).toBeGreaterThan(0);
      expect(cand.curse ?? 0).toBeGreaterThan(0);
    }
  });

  it('YZ: tek düşman boss iken Smoke Bomb\'un düşman tahtasında koruma değeri 0', () => {
    for (const units of [BOSS, undefined]) {
      const b = grid({ 0: 'cutthroat' }, { 1: 'warrior' }, { natural: true, ...(units ? { units } : {}) });
      const cands = explainChoice(b, 'party-0', content.aiConfig)!.candidates.filter((c) => c.skill === 'smoke_bomb' && c.board === 'foe');
      expect(cands.length).toBeGreaterThan(0);
      expect(cands.some((c) => (c.mitigation ?? 0) > 0)).toBe(!units);
    }
  });

  it('skill-info: Smoke Bomb ve Jinx "Bosses are immune to ..."; Omen veren skill "Bosses ignore Misfortune"', () => {
    const lines = (id: string, cls: string) => describeSkill(content.skills[id]!, content.classes[cls]!.stats, content.formulas, {}, { statuses: content.statuses }).lines;
    expect(lines('smoke_bomb', 'cutthroat').some((l) => l.includes(`Bosses are immune to ${content.statuses.blinded!.name}`))).toBe(true);
    expect(lines('smoke_bomb', 'cutthroat').some((l) => l.includes(`Bosses are immune to ${content.statuses.shrouded!.name}`))).toBe(false);
    expect(lines('jinx', 'hexer').some((l) => l.includes(`Bosses are immune to ${content.statuses.jinxed!.name}`))).toBe(true);
    expect(lines('evil_eye', 'hexer').some((l) => l.includes('Bosses ignore Misfortune'))).toBe(true);
    const uy = content.bosses.bridge_warden!.boss!.passives!.find((p) => p.id === 'unyielding')!;
    expect(uy.text).toContain('Blinded');
    expect(uy.text).toContain('Misfortune');
  });

  it('wiki: boss makalesi bağışıklık satırı Blinded, Jinxed ve Misfortune\'u sayar', () => {
    const text = JSON.stringify(buildWiki({ sprites: {}, avatars: {} }));
    const line = text.split('Bosses are immune to crowd control')[1]?.slice(0, 400) ?? '';
    for (const w of [content.statuses.blinded!.name, content.statuses.jinxed!.name, 'Misfortune']) expect(line, w).toContain(w);
  });
});
