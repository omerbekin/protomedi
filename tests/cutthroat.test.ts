import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describePassive, describeSkill, explainChoice, MatchLog } from '../src/engine';
import type { AiConfig, BattleEvent, CombatantDef, SkillDef } from '../src/engine';
import { areaDefProblem, shapeCells, skillAreaProblem } from '../src/engine/area-shape';
import { previewSkill } from '../src/engine/preview';
import { buildWiki } from '../src/wiki/catalog';

// Cutthroat (open-questions.md madde 225): Venom Edge, Saltire Cut (X şekli, merkez 2 vuruş), Smoke Bomb (area_any: Blinded / Shrouded),
// Backstab (arkası boş hedef, garantili kritik), Opportunist (Wound/Slow/Stun'lu hedefe +%25). Testler sayıları veriden okur.

const fm = content.formulas.formation;
const ct = content.classes.cutthroat!;
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Ev<T> => e.type === type);

function arena(party: [string, number][], enemies: [string, number][], seed = 1, mode: 'test' | 'turns' = 'test', skills: Record<string, SkillDef> = {}): Battle {
  const base = content.battleSetup('random-battle', seed, mode, { party: [], enemies: [] }, false);
  const b = new Battle({ ...base, skills: { ...base.skills, ...skills }, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
  b.freeMp = true;
  return b;
}
/** Her vuruş isabet eder, kimse ölmez, Lucky Escape yok (hasar sayımı için). */
const sure = (b: Battle) => {
  for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0, surviveChance: 0, resilience: 0 });
  for (const c of b.combatants) c.hp = c.maxHp = 5000;
  return b;
};
const WAR = (...slots: number[]): [string, number][] => slots.map((s) => ['warrior', s]);
const NO_GLOBAL: AiConfig = { ...content.aiConfig, global: undefined };
/** Smoke Bomb'un bir durum etkisinin süresi (veriden). */
const smokeTurns = (status: string): number => {
  for (const e of content.skills.smoke_bomb!.effects) if (e.type === 'status' && e.status === status) return e.turns;
  throw new Error(status);
};
const dmgOn = (events: BattleEvent[], uid: string) => ofType(events, 'damage').filter((e) => e.target === uid);

describe('Cutthroat class verisi', () => {
  it('görünen ad, rol, stat 5/5/15/5 (toplam 30), primary dex en yüksek ve aktif (Hunter\'s Mark), düşük can, AI assassin', () => {
    expect(ct.name).toBe('Cutthroat');
    expect(ct.role).toBe('Assassin');
    const a = ct.attributes;
    expect(a.str + a.int + a.dex + a.luck).toBe(30);
    expect(ct.primary).toBe('dex');
    expect(a.dex).toBe(Math.max(a.str, a.int, a.dex, a.luck));
    expect(ct.stats.primaryActive).toBe(true);
    expect(ct.stats.hunterMark).toBe(content.formulas.primaryBonus.dex.hunterMarkMult);
    expect(ct.stats.hp).toBeLessThanOrEqual(content.formulas.attributes.hpBase + 30); // kırılgan (Str 5: taban + 30; madde 261'da taban 20 -> 30)
    expect(ct.ai).toBe('assassin');
    expect(content.aiConfig.profiles.assassin!.priorities).toEqual(['kill', 'tactic', 'damage']);
    expect(ct.skills).toEqual(['venom_edge', 'x_cut', 'smoke_bomb', 'backstab']);
    expect(content.randomPool).toContain('cutthroat');
    expect(content.battles['random-battle']!.random!.pool).toContain('cutthroat');
  });

  it('her hasar etkisi DEX ölçekli; Venom Edge 0 MP + Wound; Backstab 4. yuva (cooldown + initialCooldown, garantili kritik, arkası boş kuralı)', () => {
    for (const id of ct.skills) for (const e of content.skills[id]!.effects) if (e.type === 'damage') expect(e.scale, id).toBe('dex');
    const ve = content.skills.venom_edge!;
    expect(ve.cost.amount).toBe(0);
    expect(ve.motion).toBe('melee');
    expect(ve.effects.some((e) => e.type === 'status' && e.status === 'wound')).toBe(true);
    const bs = content.skills.backstab!;
    expect(bs.requiresOpenBehind).toBe(true);
    expect(bs.ignoreReach && bs.ignoreFrontRow).toBe(true);
    expect((bs.cooldown ?? 0) > 0 && (bs.initialCooldown ?? 0) > 0).toBe(true);
    expect(bs.effects.some((e) => e.type === 'damage' && e.guaranteedCrit)).toBe(true);
    expect(content.skills.x_cut!.area).toMatchObject({ shape: 'x', hitsAtCenter: 2 });
    expect(content.skills.smoke_bomb!.target).toBe('area_any');
  });

  it('pasif Opportunist (bonusVsStatus): durum listesi ve yüzde veride; açıklama veriden', () => {
    const p = ct.passive!;
    expect(p.effect.type).toBe('bonusVsStatus');
    if (p.effect.type !== 'bonusVsStatus') return;
    expect(p.effect.statuses).toEqual(['wound', 'slow', 'stun', 'wither']); // Ö7 (Hexer): Withering eklendi, Omen eklenmedi
    const text = describePassive(p, ct.stats, content.formulas);
    expect(text).toContain(`+${Math.round(p.effect.bonus * 100)}%`);
    expect(text).toMatch(/Wound, Slow, Stun or Wither/);
  });
});

describe("X şekli (shape 'x') ve merkez çift vuruş (hitsAtCenter)", () => {
  const X = { shape: 'x' as const };
  it('hücre kümesi: anchor + 4 çapraz komşu; kenar/köşede tahta dışı atlanır; iki tahtada aynı (yuva tabanlı)', () => {
    for (const board of ['party', 'enemy'] as const) {
      expect(shapeCells(X, 4, board, fm)).toEqual([0, 2, 4, 6, 8]); // sıra 1, şerit 1: tam X
      expect(shapeCells(X, 7, board, fm)).toEqual([3, 5, 7, 9, 11]);
      expect(shapeCells(X, 0, board, fm)).toEqual([0, 4]); // köşe: tek çapraz
      expect(shapeCells(X, 2, board, fm)).toEqual([2, 4]);
      expect(shapeCells(X, 1, board, fm)).toEqual([1, 3, 5]); // ön kenar: 2 çapraz
      expect(shapeCells(X, 3, board, fm)).toEqual([1, 3, 7]); // üst şerit kenarı
      expect(shapeCells(X, 10, board, fm)).toEqual([6, 8, 10]); // arka kenar
      expect(shapeCells(X, 11, board, fm)).toEqual([7, 11]);
    }
  });

  it('veri doğrulaması: x geçerli; hitsAtCenter 1..5 tam sayı; rows/cols x ile kullanılamaz', () => {
    expect(areaDefProblem({ shape: 'x', hitsAtCenter: 2 }, fm)).toBeNull();
    expect(areaDefProblem({ shape: 'x', hitsAtCenter: 0 }, fm)).not.toBeNull();
    expect(areaDefProblem({ shape: 'x', hitsAtCenter: 1.5 }, fm)).not.toBeNull();
    expect(areaDefProblem({ shape: 'x', rows: 2 }, fm)).not.toBeNull();
    expect(skillAreaProblem(content.skills.x_cut!, fm)).toBeNull();
    expect(skillAreaProblem(content.skills.smoke_bomb!, fm)).toBeNull();
  });

  it('Saltire Cut: merkezdeki birim 2 kez (ayrı zar), çaprazlar 1 kez; toplam hasar = olaylar toplamı; menzilli (arka sıradan da)', () => {
    const b = sure(arena([['cutthroat', 9]], WAR(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)));
    const r = b.useSkill('party-0', 'x_cut', undefined, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used = ofType(r.events, 'skillUsed')[0]!;
    expect(used.cells).toEqual([0, 2, 4, 6, 8]);
    const at = (slot: number) => b.combatants.find((c) => c.side === 'enemy' && c.slot === slot)!.uid;
    expect(dmgOn(r.events, at(4))).toHaveLength(content.skills.x_cut!.area!.hitsAtCenter!);
    for (const s of [0, 2, 6, 8]) expect(dmgOn(r.events, at(s)), `slot ${s}`).toHaveLength(1);
    for (const s of [1, 3, 5, 7, 9, 10, 11]) expect(dmgOn(r.events, at(s)), `slot ${s}`).toHaveLength(0);
    const total = ofType(r.events, 'damage').reduce((t, e) => t + e.amount + e.absorbed, 0);
    const lost = b.combatants.filter((c) => c.side === 'enemy').reduce((t, c) => t + (c.maxHp - c.hp), 0);
    expect(total).toBe(lost);
  });

  it('merkez hücre boşsa çift vuruş yok; köşe anchor: merkez + tek çapraz', () => {
    const b = sure(arena([['cutthroat', 0]], WAR(0, 2, 6, 8)));
    const r = b.useSkill('party-0', 'x_cut', undefined, 4);
    expect(r.ok).toBe(true);
    if (r.ok) expect(ofType(r.events, 'damage')).toHaveLength(4);
    const c = sure(arena([['cutthroat', 0]], WAR(0, 4)));
    const r2 = c.useSkill('party-0', 'x_cut', undefined, 0);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(dmgOn(r2.events, 'enemy-0')).toHaveLength(2);
      expect(dmgOn(r2.events, 'enemy-1')).toHaveLength(1);
    }
  });

  it('önizleme = gerçek: vurulanlar aynı; merkezin önizleme hasarı tek vuruşun 2 katı (her anchor, iki taraf)', () => {
    for (const actorSide of ['party', 'enemy'] as const)
      for (let anchor = 0; anchor < 12; anchor++) {
        const foes = WAR(0, 1, 3, 4, 5, 7, 9, 11);
        const b = sure(actorSide === 'party' ? arena([['cutthroat', 6]], foes) : arena(foes, [['cutthroat', 6]]));
        const actor = actorSide === 'party' ? 'party-0' : 'enemy-0';
        const pv = previewSkill(b, actor, 'x_cut', undefined, anchor);
        const r = b.useSkill(actor, 'x_cut', undefined, anchor);
        if (!r.ok) {
          expect(pv.filter((p) => p.damage)).toHaveLength(0);
          continue;
        }
        const hitUids = [...new Set(ofType(r.events, 'damage').map((e) => e.target))].sort();
        expect(pv.filter((p) => p.damage).map((p) => p.uid).sort(), `${actorSide} @${anchor}`).toEqual(hitUids);
        const center = b.combatants.find((c) => c.side !== b.get(actor)!.side && c.slot === anchor);
        if (center) {
          const cp = pv.find((p) => p.uid === center.uid)!.damage!;
          const other = pv.find((p) => p.uid !== center.uid && p.damage)?.damage;
          if (other) expect(cp.avg).toBe(other.avg * 2); // aynı class/zırh: merkez = 2 vuruş
          expect(dmgOn(r.events, center.uid)).toHaveLength(2);
        }
      }
  });

  it('skill açıklaması ve rozet: X, merkez 2 kez vurulur', () => {
    const info = describeSkill(content.skills.x_cut!, ct.stats, content.formulas);
    expect(info.targetBadge).toBe('X');
    expect(info.target).toContain('X');
    expect(info.lines.join('\n')).toMatch(/hit 2 times/);
  });
});

describe('Smoke Bomb (area_any): düşman tarafında Blinded, kendi tarafında Shrouded', () => {
  const blind = content.statuses.blinded!;
  const shroud = content.statuses.shrouded!;
  const turnsOf = smokeTurns;

  it('durum tanımları: Blinded debuff (accuracyDelta -0,30), Shrouded buff (evasionDelta +0,20)', () => {
    expect(blind.type).toBe('debuff');
    expect(blind.accuracyDelta).toBeCloseTo(-0.3);
    expect(shroud.type).toBe('buff');
    expect(shroud.evasionDelta).toBeCloseTo(0.2);
  });

  it('düşman tahtasına (varsayılan): 2x2 alandaki düşmanlar Blinded (süre veriden); dostlara bir şey olmaz', () => {
    const b = arena([['cutthroat', 0], ['warrior', 1]], WAR(0, 1, 3, 4, 8));
    for (const c of b.combatants) c.stats.resilience = 0; // Resilience (Warrior) süreyi rastgele kısaltmasın
    const cells = b.areaCells('smoke_bomb', 4, 'enemy');
    expect(cells).toHaveLength(4);
    const r = b.useSkill('party-0', 'smoke_bomb', undefined, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ofType(r.events, 'skillUsed')[0]!.board).toBe('enemy');
    const inside = b.combatants.filter((c) => c.side === 'enemy' && cells.includes(c.slot));
    expect(inside.length).toBeGreaterThan(0);
    for (const c of b.combatants.filter((x) => x.side === 'enemy')) {
      const st = c.statuses.find((s) => s.kind === 'blinded');
      if (cells.includes(c.slot)) expect(st?.turns, c.uid).toBe(turnsOf('blinded'));
      else expect(st, c.uid).toBeUndefined();
      expect(c.statuses.some((s) => s.kind === 'shrouded')).toBe(false);
    }
    for (const c of b.living('party')) expect(c.statuses).toHaveLength(0);
    expect(ofType(r.events, 'damage')).toHaveLength(0); // hasar yok
  });

  it('kendi tahtasına (board = kendi tarafı ya da tile:<yuva>): alandaki dostlar Shrouded; düşmanlar etkilenmez', () => {
    const b = arena([['cutthroat', 0], ['warrior', 1], ['mage', 4]], WAR(0, 1));
    const r = b.useSkill('party-0', 'smoke_bomb', undefined, 1, 'party');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cells = b.areaCells('smoke_bomb', 1, 'party');
    expect(ofType(r.events, 'skillUsed')[0]!.board).toBe('party');
    for (const c of b.living('party')) {
      const st = c.statuses.find((s) => s.kind === 'shrouded');
      if (cells.includes(c.slot)) expect(st?.turns, c.uid).toBe(turnsOf('shrouded'));
      else expect(st).toBeUndefined();
    }
    for (const c of b.living('enemy')) expect(c.statuses).toHaveLength(0);
    // tile:<yuva> = kendi tahtası (Move ile aynı yazım)
    const c2 = arena([['cutthroat', 0], ['warrior', 1]], WAR(0));
    expect(c2.useSkill('party-0', 'smoke_bomb', 'tile:1').ok).toBe(true);
    expect(c2.get('party-1')!.statuses.some((s) => s.kind === 'shrouded')).toBe(true);
    // canlı dost uid'si anchor ise onun tahtası
    const c3 = arena([['cutthroat', 0], ['warrior', 1]], WAR(0));
    expect(c3.useSkill('party-0', 'smoke_bomb', 'party-1').ok).toBe(true);
    expect(c3.get('party-1')!.statuses.some((s) => s.kind === 'shrouded')).toBe(true);
  });

  it('anchor seçimi: iki tahtada da (shapeAnchorCells); boş alan reddedilir; önizleme hücreleri ve nedenleri', () => {
    const b = arena([['cutthroat', 0]], WAR(11));
    const cells = b.shapeAnchorCells('party-0', 'smoke_bomb');
    expect(cells.some((c) => c.board === 'enemy')).toBe(true);
    expect(cells.some((c) => c.board === 'party')).toBe(true); // Cutthroat kendisi de dost
    const pv = b.shapePreviewCells('party-0', 'smoke_bomb', 0, 'enemy');
    expect(pv.valid).toBe(false);
    expect(pv.reason).toBe('No enemy in the area');
    expect(b.shapePreviewCells('party-0', 'smoke_bomb', 9, 'party')).toMatchObject({ valid: false, reason: 'No ally in the area' });
    expect(b.useSkill('party-0', 'smoke_bomb', undefined, 9, 'party').ok).toBe(false);
    const ok = b.shapePreviewCells('party-0', 'smoke_bomb', 0, 'party');
    expect(ok.valid).toBe(true);
    expect(ok.targets).toEqual(['party-0']);
  });

  it('cooldown veriden; test modunda cooldown yok', () => {
    const b = arena([['cutthroat', 0]], WAR(0, 1), 1, 'turns');
    const uid = b.currentUid!;
    const actor = b.get(uid)!;
    if (actor.defId === 'cutthroat') {
      expect(b.useSkill(uid, 'smoke_bomb', undefined, 0).ok).toBe(true);
      expect(actor.cooldowns.smoke_bomb).toBe(content.skills.smoke_bomb!.cooldown);
    }
    const t = arena([['cutthroat', 0]], WAR(0, 1));
    expect(t.useSkill('party-0', 'smoke_bomb', undefined, 0).ok).toBe(true);
    expect(t.useSkill('party-0', 'smoke_bomb', undefined, 0).ok).toBe(true);
  });
});

describe('Blinded / Shrouded stat etkisi ve Resilience', () => {
  it('effectiveStats: isabet -0,30, kaçınma +0,20; 0 altına inmez; hit şansı [0, max]; önizleme = vuruştaki şans', () => {
    const b = arena([['warrior', 0]], [['archer', 0]]);
    const w = b.get('party-0')!;
    const a = b.get('enemy-0')!;
    const acc0 = w.stats.accuracy;
    const eva0 = a.stats.evasion;
    const hit0 = previewSkill(b, 'party-0', 'melee_attack', 'enemy-0')[0]!.damage!.hitChance;
    b.debugAddStatus('party-0', 'blinded', 2);
    expect(b.effectiveStats(w).accuracy).toBeCloseTo(acc0 - 0.3);
    expect(w.stats.accuracy).toBe(acc0); // gerçek stat değişmez
    const hit1 = previewSkill(b, 'party-0', 'melee_attack', 'enemy-0')[0]!.damage!.hitChance;
    expect(hit1).toBeCloseTo(Math.max(0, Math.min(content.formulas.hit.max, acc0 - 0.3 - eva0)));
    b.debugAddStatus('enemy-0', 'shrouded', 2);
    expect(b.effectiveStats(a).evasion).toBeCloseTo(eva0 + 0.2);
    const hit2 = previewSkill(b, 'party-0', 'melee_attack', 'enemy-0')[0]!.damage!.hitChance;
    expect(hit2).toBeCloseTo(Math.max(0, acc0 - 0.3 - eva0 - 0.2));
    expect(hit2).toBeLessThan(hit1);
    expect(hit1).toBeLessThan(hit0);
    // alt sınır: isabet 0'ın altına inmez, hit şansı 0'a sıkışır
    w.stats.accuracy = 0.1;
    expect(b.effectiveStats(w).accuracy).toBe(0);
    expect(previewSkill(b, 'party-0', 'melee_attack', 'enemy-0')[0]!.damage!.hitChance).toBe(0);
  });

  it('gerçek vuruş da durumlu isabeti kullanır: isabet 0 iken hep iska (miss), durumsuz hep isabet', () => {
    const b = arena([['warrior', 0]], [['defender', 0]]);
    const w = b.get('party-0')!;
    Object.assign(w.stats, { accuracy: 0.3 });
    b.get('enemy-0')!.stats.evasion = 0;
    b.get('enemy-0')!.hp = b.get('enemy-0')!.maxHp = 99999;
    b.debugAddStatus('party-0', 'blinded', 9);
    for (let i = 0; i < 20; i++) {
      const r = b.useSkill('party-0', 'melee_attack', 'enemy-0');
      if (r.ok) expect(ofType(r.events, 'damage').filter((e) => e.target === 'enemy-0')).toHaveLength(0);
    }
  });

  it('Resilience (Str primary) debuff olan Blinded\'ı kısaltabilir; buff olan Shrouded\'a uygulanmaz', () => {
    const b = arena([['cutthroat', 0], ['warrior', 1]], [['warrior', 0], ['warrior', 1]]);
    for (const c of b.combatants) c.stats.resilience = 1; // her debuff kesin kısalır
    expect(b.useSkill('party-0', 'smoke_bomb', undefined, 0).ok).toBe(true);
    const t = smokeTurns('blinded');
    expect(b.get('enemy-0')!.statuses.find((s) => s.kind === 'blinded')!.turns).toBe(t - 1);
    expect(b.useSkill('party-0', 'smoke_bomb', undefined, 0, 'party').ok).toBe(true);
    const t2 = smokeTurns('shrouded');
    expect(b.get('party-1')!.statuses.find((s) => s.kind === 'shrouded')!.turns).toBe(t2);
  });
});

describe('Backstab: yalnızca arkası boş hedef, garantili kritik, ışınlanma olay alanları', () => {
  it('arkası dolu = geçersiz (Target is shielded from behind); en arka sıra = geçersiz (No room behind the target); arkası boş = geçerli (herhangi sırada)', () => {
    // düşman: 0 (arkası 3 dolu), 3 (arkası 6 boş), 1 (arkası 4 boş), 9 (en arka)
    const b = arena([['cutthroat', 6]], WAR(0, 3, 1, 9));
    const valid = b.validTargets('party-0', 'backstab').map((c) => c.slot).sort((x, y) => x - y);
    expect(valid).toEqual([1, 3]);
    expect(b.targetProblem('party-0', 'backstab', 'enemy-0')).toBe('Target is shielded from behind');
    expect(b.targetProblem('party-0', 'backstab', 'enemy-3')).toBe('No room behind the target');
    expect(b.targetProblem('party-0', 'backstab', 'enemy-1')).toBeNull();
    expect(b.useSkill('party-0', 'backstab', 'enemy-0')).toEqual({ ok: false, reason: 'Target is shielded from behind' });
    expect(b.useSkill('party-0', 'backstab', 'enemy-3')).toEqual({ ok: false, reason: 'No room behind the target' });
    expect(b.useSkill('party-0', 'backstab', 'enemy-1').ok).toBe(true); // ön sıra kuralı yok: arka sıradan (6) vurur
  });

  it('ceset (ölü birim) ve ölü dostun ayrılmış hücresi engel DEĞİL: yalnızca canlı birim engeller', () => {
    const b = arena([['cutthroat', 0]], WAR(0, 3));
    expect(b.targetProblem('party-0', 'backstab', 'enemy-0')).toBe('Target is shielded from behind');
    b.debugKill('enemy-1');
    expect(b.fallenSlots('enemy')).toContain(3);
    expect(b.targetProblem('party-0', 'backstab', 'enemy-0')).toBeNull();
    expect(b.useSkill('party-0', 'backstab', 'enemy-0').ok).toBe(true);
  });

  it('kullanılabilir hedef yoksa canUse nedeni; Move ile arkası boşalan hedef geçerli olur (global skill etkileşimi)', () => {
    const b = arena([['cutthroat', 0]], WAR(9, 10, 11, 6, 7, 8));
    expect(b.validTargets('party-0', 'backstab')).toHaveLength(0);
    expect(b.canUse('party-0', 'backstab')).toEqual({ ok: false, reason: 'No target with room behind it' });
    const w = arena([['cutthroat', 0]], WAR(0, 3));
    expect(w.targetProblem('party-0', 'backstab', 'enemy-0')).toBe('Target is shielded from behind');
    expect(w.useGlobal('enemy-1', 'move_tile', 5).ok).toBe(true); // arkadaki birim yan hücreye geçer
    expect(w.targetProblem('party-0', 'backstab', 'enemy-0')).toBeNull();
    expect(w.useSkill('party-0', 'backstab', 'enemy-0').ok).toBe(true);
  });

  it('olay: skillUsed.behindSlot/behindBoard (ışınlanma hücresi) ve from (dönüş hücresi); formasyon değişmez', () => {
    const b = sure(arena([['cutthroat', 4]], WAR(1)));
    const r = b.useSkill('party-0', 'backstab', 'enemy-0');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used = ofType(r.events, 'skillUsed')[0]!;
    expect(used.behindSlot).toBe(1 + fm.lanes);
    expect(used.behindBoard).toBe('enemy');
    expect(used.from).toBe(4);
    expect(b.get('party-0')!.slot).toBe(4);
    expect(b.get('party-0')!.board).toBe('party');
    expect(ofType(r.events, 'moved')).toHaveLength(0);
  });

  it('garantili kritik: 1000 seed\'de isabet eden her vuruş kritik ve kritik çarpanı uygulanır; isabet zarı normal (iska olabilir)', () => {
    let hits = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const b = arena([['cutthroat', 0]], WAR(1), seed);
      b.get('enemy-0')!.hp = b.get('enemy-0')!.maxHp = 99999;
      const r = b.useSkill('party-0', 'backstab', 'enemy-0');
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const d of ofType(r.events, 'damage')) {
        expect(d.crit, `seed ${seed}`).toBe(true);
        hits++;
      }
    }
    expect(hits).toBeGreaterThan(800); // isabet normal: çoğu vurur
    // isabet zarı atılır: debug dodge always -> iska
    const m = arena([['cutthroat', 0]], WAR(1));
    m.debug.dodge = 'always';
    const r = m.useSkill('party-0', 'backstab', 'enemy-0');
    expect(r.ok && ofType(r.events, 'dodge').length).toBe(1);
  });

  it('önizleme: kritik şansı 1, hasar aralığı kritik çarpanlı; gerçek hasar aralık içinde', () => {
    const b = sure(arena([['cutthroat', 0]], WAR(1)));
    const p = previewSkill(b, 'party-0', 'backstab', 'enemy-0')[0]!.damage!;
    expect(p.critChance).toBe(1);
    const r = b.useSkill('party-0', 'backstab', 'enemy-0');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dealt = ofType(r.events, 'damage')[0]!.amount;
    expect(dealt).toBeGreaterThanOrEqual(p.min - 1);
    expect(dealt).toBeLessThanOrEqual(p.max + 1);
  });

  it('açıklama: arkası boş kuralı, garantili kritik', () => {
    const t = describeSkill(content.skills.backstab!, ct.stats, content.formulas).lines.join('\n');
    expect(t).toMatch(/empty cell right behind/);
    expect(t).toMatch(/Always a critical hit/);
  });
});

describe('Opportunist: Wound / Slow / Stun\'lu hedefe +%25 hasar', () => {
  const bonus = (ct.passive!.effect as { bonus: number }).bonus;
  it('önizleme: durumlu hedefte hasar x(1 + bonus), durumsuzda yok; her durum için', () => {
    for (const status of ['wound', 'slow', 'stun']) {
      const b = arena([['cutthroat', 0]], [['defender', 0]]);
      b.get('party-0')!.stats.dex = 200; // büyük sayılar: yuvarlama payı küçük
      const base = previewSkill(b, 'party-0', 'venom_edge', 'enemy-0')[0]!.damage!.avg;
      b.debugAddStatus('enemy-0', status, 2);
      const boosted = previewSkill(b, 'party-0', 'venom_edge', 'enemy-0')[0]!.damage!.avg;
      expect(Math.abs(boosted - base * (1 + bonus)), status).toBeLessThanOrEqual(1);
      b.debugClearStatuses('enemy-0');
      b.debugAddStatus('enemy-0', 'haste', 2); // listede olmayan durum: bonus yok
      expect(previewSkill(b, 'party-0', 'venom_edge', 'enemy-0')[0]!.damage!.avg).toBe(base);
    }
  });

  it('gerçek vuruş (aynı seed): Wound\'lu hedef bonus alır, kritik dahil (aynı zar dizisi)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plain = sure(arena([['cutthroat', 0]], [['defender', 0]], seed));
      const hurt = sure(arena([['cutthroat', 0]], [['defender', 0]], seed));
      hurt.get('enemy-0')!.statuses.push({ kind: 'wound', turns: 5, source: 'x' }); // RNG tüketmeden durum
      plain.get('party-0')!.stats.dex = hurt.get('party-0')!.stats.dex = 200;
      const a = plain.useSkill('party-0', 'venom_edge', 'enemy-0');
      const c = hurt.useSkill('party-0', 'venom_edge', 'enemy-0');
      if (!a.ok || !c.ok) throw new Error('cast');
      const da = ofType(a.events, 'damage')[0]!;
      const dc = ofType(c.events, 'damage')[0]!;
      expect(dc.crit).toBe(da.crit);
      expect(Math.abs(dc.amount - da.amount * (1 + bonus))).toBeLessThanOrEqual(2);
    }
  });

  it('başka class\'larda (pasifsiz) durum bonusu yok', () => {
    const b = arena([['archer', 0]], [['defender', 0]]);
    const base = previewSkill(b, 'party-0', 'quick_shot', 'enemy-0')[0]!.damage!.avg;
    b.debugAddStatus('enemy-0', 'wound', 2);
    expect(previewSkill(b, 'party-0', 'quick_shot', 'enemy-0')[0]!.damage!.avg).toBe(base);
  });
});

describe('Cutthroat yapay zekası (assassin): bağlam ipuçları, determinizm', () => {
  /** Yalnızca verilen skill'ler hazır: diğerleri cooldown'da (turns modu, Cutthroat'ın sırası). */
  function turnArena(party: [string, number][], enemies: [string, number][], ready: string[]): Battle | null {
    for (let seed = 1; seed < 400; seed++) {
      const b = arena(party, enemies, seed, 'turns');
      const actor = b.currentActor;
      if (!actor || actor.defId !== 'cutthroat') continue;
      actor.cooldowns = {};
      for (const id of actor.skills) if (!ready.includes(id)) actor.cooldowns[id] = 3;
      return b;
    }
    return null;
  }

  it('Backstab: arka saftaki (normal melee erişemeyen) hedefe seçilir; geçerli hedef yoksa seçilmez', () => {
    const b = turnArena([['cutthroat', 0]], [['warrior', 0], ['mage', 4], ['warrior', 2]], ['venom_edge', 'backstab'])!;
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(ch?.skillId).toBe('backstab');
    expect(b.get(ch!.targetUid!)!.defId).toBe('mage');
    // mage'in arkası dolu ve öndekilerin de: Backstab seçilemez
    const c = turnArena([['cutthroat', 0]], [['warrior', 0], ['warrior', 3], ['warrior', 6], ['warrior', 9]], ['venom_edge', 'backstab'])!;
    // 0,3,6: arkası dolu; 9: en arka -> geçerli hedef yok
    const ch2 = chooseAction(c, c.currentUid!, NO_GLOBAL);
    expect(ch2?.skillId).not.toBe('backstab');
  });

  it('Backstab terazide: bağlam ipucu engellemez (madde 257); en yüksek puanlı seçenek seçilir, puan cooldown bedelini içerir', () => {
    const b = turnArena([['cutthroat', 0]], [['defender', 1]], ['venom_edge', 'backstab'])!;
    const d = b.get('enemy-0')!;
    d.hp = d.maxHp = 2000;
    const ex = explainChoice(b, b.currentUid!, NO_GLOBAL)!;
    const bs = ex.candidates.find((x) => x.skill === 'backstab')!;
    expect(bs.verdict).not.toBe('blocked');
    expect(bs.terms!.cooldown).toBeLessThan(0);
    expect(ex.candidates.find((x) => x.verdict === 'chosen')!.score).toBe(Math.max(...ex.candidates.map((x) => x.score ?? -Infinity)));
  });

  it('Saltire Cut: X en az 2 düşmanı kapsayınca seçilir; tek düşman varken seçilmez', () => {
    const b = turnArena([['cutthroat', 9]], WAR(0, 2, 4, 6, 8), ['x_cut'])!;
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(ch?.skillId).toBe('x_cut');
    expect(ch?.slot).toBe(4); // merkez çift vuruş + 4 çapraz
    expect(b.applyChoice(b.currentUid!, ch).ok).toBe(true);
    // tek düşman: X yalnızca o düşmanı vurur; terazi daha değerli seçeneği seçer (X'in değeri vurulanların toplamı)
    const c = turnArena([['cutthroat', 0]], WAR(4), ['venom_edge', 'x_cut'])!;
    const ex = explainChoice(c, c.currentUid!, NO_GLOBAL)!;
    expect(ex.candidates.filter((x) => x.skill === 'x_cut').every((x) => x.enemyHits <= 1)).toBe(true);
    expect(ex.candidates.find((x) => x.verdict === 'chosen')!.score).toBe(Math.max(...ex.candidates.map((x) => x.score ?? -Infinity)));
  });

  it('Smoke Bomb: 2x2 alanda >= 2 tehlikeli düşman -> düşman tarafına; seçim uygulanır ve Blinded verir', () => {
    const b = turnArena([['cutthroat', 0], ['warrior', 1], ['paladin', 2]], [['warrior', 0], ['warrior', 1], ['paladin', 9]], ['smoke_bomb'])!; // madde 261: Archer güçlenince tek Archer'ı kör etmek iki Warrior'la başa baş; arka saf Paladin
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(ch?.skillId).toBe('smoke_bomb');
    expect(ch?.board ?? 'enemy').toBe('enemy');
    expect(ch?.reason).toBe('tactic');
    expect(b.applyChoice(b.currentUid!, ch).ok).toBe(true);
    expect(b.living('enemy').filter((c) => c.statuses.some((s) => s.kind === 'blinded')).length).toBeGreaterThanOrEqual(2);
  });

  it('Smoke Bomb: düşmanlar dağınık (hiçbir 2x2 iki düşmanı kapsamaz) ama dostlar kümeli ve tehdit altında -> kendi tarafına (Shrouded)', () => {
    const b = turnArena([['cutthroat', 0], ['mage', 1], ['archer', 3]], [['warrior', 0], ['mage', 11]], ['smoke_bomb'])!;
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(ch?.skillId).toBe('smoke_bomb');
    expect(ch?.board).toBe(b.currentActor!.side);
    expect(b.applyChoice(b.currentUid!, ch).ok).toBe(true);
    expect(b.living('party').filter((c) => c.statuses.some((s) => s.kind === 'shrouded')).length).toBeGreaterThanOrEqual(2);
  });

  it('Smoke Bomb: tek düşman / tek dost kapsanırken bağlam sağlanmaz (seçilmez)', () => {
    const b = turnArena([['cutthroat', 0]], [['warrior', 0]], ['venom_edge', 'smoke_bomb'])!;
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(ch?.skillId).not.toBe('smoke_bomb');
    const ex = explainChoice(b, b.currentUid!, NO_GLOBAL)!;
    for (const c of ex.candidates.filter((x) => x.skill === 'smoke_bomb')) expect(c.verdict).not.toBe('chosen');
  });

  it('karar açıklaması (match-log): Smoke Bomb adayında tahta ve koruma değeri; X adayında şekil satırı', () => {
    const b = turnArena([['cutthroat', 0], ['warrior', 1]], WAR(0, 1, 3, 4), ['x_cut', 'smoke_bomb'])!;
    const ex = explainChoice(b, b.currentUid!, NO_GLOBAL)!;
    const smoke = ex.candidates.filter((x) => x.skill === 'smoke_bomb');
    expect(smoke.some((x) => x.board === 'foe')).toBe(true);
    expect(smoke.some((x) => (x.mitigation ?? 0) > 0)).toBe(true);
    const xc = ex.candidates.find((x) => x.skill === 'x_cut')!;
    expect(xc.shape).toBe('x center x2');
    // maç kaydı: aday satırı şekli ve tahtayı yazar; Smoke Bomb hamlesi "on own/foe side"
    const log = new MatchLog(b, { version: 'test' });
    log.noteAi(ex);
    const ch = chooseAction(b, b.currentUid!, NO_GLOBAL);
    expect(b.applyChoice(b.currentUid!, ch).ok).toBe(true);
    const text = log.serialize();
    expect(text).toMatch(/shape x center x2 @cell \d+/);
    expect(text).toMatch(/Smoke Bomb[^\n]*\((foe|own) side\)/);
  });

  it('determinizm: aynı seed + Cutthroat\'lı takımlar = birebir aynı savaş (iki mod); kilitlenme yok', () => {
    const run = (seed: number, mode: 'turns' | 'test') => {
      const setup = content.battleSetup('random-battle', seed, mode, { party: ['cutthroat', 'warrior', 'mage', 'archer', 'paladin'], enemies: ['cutthroat', 'defender', 'druid', 'undead', 'antimage'] });
      const b = new Battle(setup);
      for (let i = 0; i < 400 && !b.winner; i++) {
        if (mode === 'turns') {
          const uid = b.currentUid!;
          b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
        } else {
          const actor = b.combatants.filter((c) => c.hp > 0)[i % b.combatants.filter((c) => c.hp > 0).length]!;
          const ch = chooseAction(b, actor.uid, content.aiConfig);
          if (ch) b.applyChoice(actor.uid, ch);
        }
      }
      return JSON.stringify(b.log);
    };
    for (const seed of [3, 17, 42]) {
      expect(run(seed, 'turns')).toBe(run(seed, 'turns'));
      expect(run(seed, 'test')).toBe(run(seed, 'test'));
    }
  });
});

describe('wiki: Cutthroat ve yeni mekanikler', () => {
  const wiki = buildWiki({ sprites: {}, avatars: {} });
  it('class kartı, skill kartları (X ve Smoke Bomb şeması), durumlar ve Mechanics makaleleri', () => {
    const c = wiki.classes.find((x) => x.id === 'cutthroat')!;
    expect(c).toBeDefined();
    expect(c.skills.map((s) => s.id)).toEqual(ct.skills);
    expect(wiki.skills.find((s) => s.id === 'x_cut')?.shape).toBeDefined();
    expect(wiki.skills.find((s) => s.id === 'smoke_bomb')?.shape).toBeDefined();
    expect(wiki.statuses.map((s) => s.id)).toEqual(expect.arrayContaining(['blinded', 'shrouded']));
    const ids = wiki.mechanics.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['backstab', 'status-bonus']));
    const all = JSON.stringify(wiki.mechanics);
    expect(all).toMatch(/X: the anchor cell and the 4 diagonal cells/);
    expect(all).toMatch(/either side/);
    expect(all).toMatch(/Blinded/);
    expect(all).toMatch(/Opportunist/);
  });
});
