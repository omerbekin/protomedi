import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describePassive, describeSkill, explainChoice, MatchLog, previewSkill } from '../src/engine';
import type { AiConfig, BattleEvent, Combatant, CombatantDef, Status } from '../src/engine';
import { shapeCells } from '../src/engine/area-shape';
import { buildWiki } from '../src/wiki/catalog';

// Hexer (docs/design/classes/hexer.md; Ömer kararları Ö1-Ö12): Omen yığını, Doom (3'te anında / süre bitiminde / Doom Mark), Misfortune, Wither (DoT),
// Jinxed, Ill Omen. Sayılar veriden okunur (statuses.json > omen/wither/jinxed, skills.json, classes/hexer.json).

const hx = content.classes.hexer!;
const S = content.skills;
const OMEN = content.statuses.omen!;
const DOOM = OMEN.doom!;
const MAX = OMEN.maxStacks!;
const DUR = OMEN.duration!;
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Ev<T> => e.type === type);
const NO_GLOBAL: AiConfig = { ...content.aiConfig, global: undefined };
const omenEffect = (id: string) => S[id]!.effects.find((e) => e.type === 'omen') as Extract<(typeof S)[string]['effects'][number], { type: 'omen' }>;

function arena(party: [string, number][], enemies: [string, number][], mode: 'test' | 'turns' = 'test', seed = 1): Battle {
  const base = content.battleSetup('random-battle', seed, mode, { party: [], enemies: [] }, false);
  const b = new Battle({ ...base, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
  b.freeMp = true;
  return b;
}
/** Her vuruş isabet eder, kritik yok, kimse kolay ölmez, Lucky Escape / Resilience yok (sayım için). */
function sure(b: Battle, hp = 5000): Battle {
  for (const c of b.combatants) {
    Object.assign(c.stats, { accuracy: 10, evasion: 0, critChance: 0, surviveChance: 0, resilience: 0, manaEcho: 0 });
    c.hp = c.maxHp = hp;
  }
  return b;
}
const P = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'party' && c.slot === slot && !c.summoned)!;
const E = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'enemy' && c.slot === slot && !c.summoned)!;
function cast(b: Battle, uid: string, skill: string, target?: string, slot?: number): BattleEvent[] {
  const r = b.useSkill(uid, skill, target, slot);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
}
const omenOf = (c: Combatant): Status | undefined => c.statuses.find((s) => s.kind === 'omen');
const luck = (c: Combatant) => c.stats[DOOM.scale];
/** turns modunda: `uid` sırası gelene kadar diğerleri pas geçer (uid şu an sıradaysa önce kendi turu da geçer). */
function nextTurnOf(b: Battle, uid: string): void {
  if (b.currentUid === uid) b.skipTurn();
  for (let i = 0; i < 400 && b.currentUid !== uid && !b.winner; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}
const doomRangeOf = (b: Battle, target: Combatant, omens: number, mult: number, stat: number) => b.doomRange(target, 'omen', omens, mult, stat)!;
const inRange = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;

describe('Hexer class verisi', () => {
  it('ad, rol, renk, stat 6/7/3/14 (toplam 30), luck primary en yüksek ve aktif (Lucky Escape), türetilmiş değerler', () => {
    expect(hx.name).toBe('Hexer');
    expect(hx.role).toBe('Curse Caster');
    expect(hx.color).toBe('#6a2f5f');
    const a = hx.attributes;
    expect([a.str, a.int, a.dex, a.luck]).toEqual([8, 5, 3, 14]); // madde 261 denge turu: str 6 -> 8, int 7 -> 5
    expect(a.str + a.int + a.dex + a.luck).toBe(30);
    expect(hx.primary).toBe('luck');
    expect(a.luck).toBe(Math.max(a.str, a.int, a.dex, a.luck));
    expect(hx.stats.primaryActive).toBe(true);
    expect(hx.stats.surviveChance).toBe(content.formulas.primaryBonus.luck.surviveChance);
    const f = content.formulas.attributes;
    expect(hx.stats.hp).toBe(f.hpBase + f.hpPerStr * a.str); // 56
    expect(hx.stats.mp).toBe(f.mpBase + f.mpPerInt * a.int); // 44
    expect(hx.stats.spd).toBe(Math.round(f.spdBase + f.spdPerDex * a.dex)); // 8
    expect(hx.stats.accuracy).toBeCloseTo(f.accuracyBase + f.accuracyPerLuck * a.luck); // %94
    expect(hx.stats.critChance).toBeCloseTo(f.critChanceBase + f.critChancePerLuck * a.luck); // %12
    expect([hx.stats.hp, hx.stats.mp, hx.stats.spd]).toEqual([78, 40, 8]); // madde 261: can tabanı 30, str 8
    expect(hx.stats.armor).toBe(4);
    expect(hx.stats.magicArmor).toBe(0);
    expect(hx.spriteId).toBe('hexer');
    expect(hx.skills).toEqual(['evil_eye', 'withering_curse', 'jinx', 'doom_mark']);
    expect(hx.ai).toBe('hexer');
    expect(content.aiConfig.profiles.hexer!.priorities).toEqual(['kill', 'tactic', 'aoe', 'damage']);
    expect(content.aiConfig.profiles.hexer!.omenValueShare).toBeGreaterThan(0);
    expect(content.randomPool).toContain('hexer');
    expect(content.battles['random-battle']!.random!.pool).toContain('hexer');
  });

  it('tüm hasarlar LUCK ölçekli büyü/dark; Evil Eye bedelsiz; Doom Mark 4. yuva (cooldown + initialCooldown 2 <= maxInitial)', () => {
    for (const id of hx.skills) for (const e of S[id]!.effects) if (e.type === 'damage' || e.type === 'dot') expect(e.scale, id).toBe('luck');
    expect(DOOM.scale).toBe('luck');
    expect(S.evil_eye!.cost.amount).toBe(0);
    expect(S.doom_mark!.initialCooldown).toBe(2);
    expect(S.doom_mark!.initialCooldown!).toBeLessThanOrEqual(content.formulas.cooldown.maxInitial);
    const b = arena([['hexer', 4]], [['warrior', 0]], 'turns');
    expect(P(b, 4).cooldowns.doom_mark).toBe(2);
    expect(S.withering_curse!.area).toMatchObject({ shape: 'rect', rows: 2, cols: 3, stages: 'row' }); // Ö6
  });
});

describe('Omen (yığın, süre, Resilience)', () => {
  it('isabette +1, kritikte +2 (debug crit always), iskada 0; üst sınırda Doom anında (Ö1), yığın ve sayaç sıfırlanır', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h = P(b, 4);
    const w = E(b, 0);
    const ee = omenEffect('evil_eye');
    let ev = cast(b, h.uid, 'evil_eye', w.uid);
    expect(omenOf(w)?.stacks).toBe(ee.stacks);
    expect(ofType(ev, 'omen')[0]).toMatchObject({ source: h.uid, target: w.uid, delta: ee.stacks, stacks: ee.stacks, max: MAX, cause: 'skill' });
    expect(ofType(ev, 'status').find((e) => e.status === 'omen')).toMatchObject({ stacks: ee.stacks, turns: DUR });
    // iska: Omen yok
    b.debug.dodge = 'always';
    ev = cast(b, h.uid, 'evil_eye', w.uid);
    expect(ofType(ev, 'omen')).toHaveLength(0);
    expect(omenOf(w)?.stacks).toBe(ee.stacks);
    b.debug.dodge = 'auto';
    // kritik: critStacks (1 + 2 = 3 => Doom anında)
    b.debug.crit = 'always';
    ev = cast(b, h.uid, 'evil_eye', w.uid);
    expect(ofType(ev, 'omen')[0]).toMatchObject({ delta: ee.critStacks! > MAX - ee.stacks ? MAX - ee.stacks : ee.critStacks, crit: true, stacks: MAX });
    const doom = ofType(ev, 'doom');
    expect(doom).toHaveLength(1);
    expect(doom[0]).toMatchObject({ cause: 'complete', omens: MAX, mult: 1, source: h.uid, target: w.uid });
    expect(omenOf(w)).toBeUndefined();
    expect(ofType(ev, 'statusEnd').some((e) => e.status === 'omen' && e.cause === 'doom')).toBe(true);
  });

  it('süre ilk Omen\'le başlar, skill ile eklenen her yeni Omen süreyi TAM süreye yeniler (refreshOnStack; Ö2 güncellendi 2026-10-08); Resilience zarı yalnızca ilk eklemede', () => {
    expect(OMEN.refreshOnStack).toBe(true);
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h = P(b, 4);
    const w = E(b, 0);
    cast(b, h.uid, 'evil_eye', w.uid);
    expect(omenOf(w)!.turns).toBe(DUR);
    omenOf(w)!.turns = 1; // iki tur geçti
    const ev0 = cast(b, h.uid, 'evil_eye', w.uid);
    expect(omenOf(w)!.stacks).toBe(2);
    expect(omenOf(w)!.turns).toBe(DUR);
    expect(ofType(ev0, 'status').find((e) => e.status === 'omen')).toMatchObject({ stacks: 2, turns: DUR });
    // Resilience (STR primary): ilk eklemede zar (1 = kesin) süreyi 1 kısaltır; sonraki Omen'de zar yok (passive olayı yok)
    const b2 = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const w2 = E(b2, 0);
    w2.stats.resilience = 1;
    let ev = cast(b2, P(b2, 4).uid, 'evil_eye', w2.uid);
    expect(omenOf(w2)!.turns).toBe(DUR - 1);
    expect(ofType(ev, 'passive').some((e) => e.name === 'Resilience')).toBe(true);
    ev = cast(b2, P(b2, 4).uid, 'evil_eye', w2.uid);
    expect(ofType(ev, 'passive').some((e) => e.name === 'Resilience')).toBe(false);
    expect(omenOf(w2)!.turns).toBe(DUR); // yenileme tam süre, Resilience zarı yok
  });

  it('turns modunda: SON Omen\'den sonra taşıyanın 3. tur başında yığın sayısı kadar Doom (expire, x expireMult); arada eklenen Omen sayacı yeniler', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0]], 'turns'));
    const h = P(b, 4);
    const w = E(b, 0);
    nextTurnOf(b, h.uid);
    const start = b.log.length;
    cast(b, h.uid, 'evil_eye', w.uid);
    let added = false;
    let start2 = start;
    for (let i = 0; i < 40 && !b.log.slice(start).some((e) => e.type === 'doom'); i++) {
      if (!added && b.currentUid === h.uid && omenOf(w) && omenOf(w)!.turns < DUR) {
        start2 = b.log.length;
        const ev = cast(b, h.uid, 'evil_eye', w.uid);
        added = true;
        expect(ofType(ev, 'status').find((e) => e.status === 'omen')).toMatchObject({ stacks: 2, turns: DUR }); // sayaç yenilendi
      } else b.skipTurn();
    }
    expect(added).toBe(true);
    // Doom, SON Omen'den sonraki DUR. kendi tur başında: arada DUR - 1 tur başı, Doom'dan hemen sonra taşıyanın turnStart'ı gelir
    const after = b.log.slice(start2);
    const di = after.findIndex((e) => e.type === 'doom');
    const wStarts = after.map((e, i) => (e.type === 'turnStart' && e.actor === w.uid ? i : -1)).filter((i) => i >= 0);
    expect(wStarts.filter((i) => i < di).length).toBe(DUR - 1);
    expect(wStarts.find((i) => i > di)).toBe(after.findIndex((e, i) => i > di && e.type === 'turnStart'));
    const d = ofType(b.log, 'doom').at(-1)!;
    expect(d).toMatchObject({ cause: 'expire', omens: 2, mult: DOOM.expireMult, target: w.uid });
  });
});

describe('Süre bitimi Doom (Ö2/Ö3/Ö12)', () => {
  /** Omen'i Hexer'in turunda ekler, sonra taşıyanın turları gelene kadar ilerler; patlamanın olaylarını döndürür. */
  function expireScenario(setup?: (b: Battle, h: Combatant, w: Combatant) => void, beforeExpire?: (b: Battle, h: Combatant, w: Combatant) => void) {
    const b = sure(arena([['hexer', 4], ['warrior', 0]], [['warrior', 0], ['warrior', 1]], 'turns'));
    const h = P(b, 4);
    const w = E(b, 0);
    setup?.(b, h, w);
    nextTurnOf(b, h.uid);
    cast(b, h.uid, 'withering_curse', undefined, w.slot);
    beforeExpire?.(b, h, w);
    for (let i = 0; i < 60 && omenOf(w) && w.hp > 0; i++) b.skipTurn();
    return { b, h, w };
  }

  it('sıra: zemin -> Wither tiki -> Doom -> can yenilenmesi -> turnStart; origin status, Guard YOK, snapshot Luck (Hexer ölmüş olsa da)', () => {
    let snap = 0;
    const { b, w } = expireScenario(
      (_b, h) => {
        h.stats.luck = 40; // snapshot Omen eklenirken alınır
        snap = 40;
      },
      (bb, h, ww) => {
        h.stats.luck = 1; // sonradan değişse de snapshot kullanılır
        bb.debugKill(h.uid, false); // Ö3: Hexer ölse de lanet sürer ve patlar
        ww.hp = ww.maxHp - 50; // can yenilenmesi olsun
        ww.statuses.push({ kind: 'guard', turns: 9, source: E(bb, 1).uid, share: 0.5 }); // Ö12: Guard'a aktarılmaz
      },
    );
    const idx = (pred: (e: BattleEvent) => boolean) => b.log.findIndex(pred);
    const di = idx((e) => e.type === 'doom');
    expect(di).toBeGreaterThan(0);
    const doom = b.log[di] as Ev<'doom'>;
    expect(doom).toMatchObject({ cause: 'expire', omens: omenEffect('withering_curse').stacks, target: w.uid });
    // aynı tur başı: wither tiki doom'dan önce, yenilenme ve turnStart sonra
    const turnStart = b.log.findIndex((e, i) => i > di && e.type === 'turnStart' && e.actor === w.uid);
    const lastTurnStartBefore = b.log.slice(0, di).map((e, i) => (e.type === 'turnStart' ? i : -1)).filter((i) => i >= 0).at(-1)!;
    const wither = b.log.findIndex((e, i) => i > lastTurnStartBefore && i < di && e.type === 'damage' && e.target === w.uid && e.status === 'wither');
    expect(wither).toBeGreaterThan(lastTurnStartBefore);
    const regen = b.log.findIndex((e, i) => i > di && e.type === 'heal' && e.target === w.uid);
    expect(regen).toBeGreaterThan(di);
    expect(regen).toBeLessThan(turnStart);
    const dmg = b.log.slice(di + 1).filter((e): e is Ev<'damage'> => e.type === 'damage' && e.status === 'omen');
    expect(dmg).toHaveLength(1); // Guard'a pay yok
    expect(dmg[0]!.redirected).toBeUndefined();
    expect(dmg[0]).toMatchObject({ origin: 'status', element: DOOM.element, damageType: DOOM.damageType, target: w.uid });
    expect(inRange(dmg[0]!.amount, doomRangeOf(b, w, doom.omens, DOOM.expireMult, snap))).toBe(true);
    expect(omenOf(w)).toBeUndefined();
  });

  it('isabet zarı yok (debug dodge always yine vurur); kalkan emer; Lucky Escape normal', () => {
    const { b, w } = expireScenario(undefined, (bb, _h, ww) => {
      bb.debug.dodge = 'always';
      ww.magicShield = 3;
      ww.stats.surviveChance = 1;
      ww.hp = 2;
      ww.statuses = ww.statuses.filter((s) => s.kind !== 'wither'); // tikte ölmesin
    });
    const dmg = ofType(b.log, 'damage').filter((e) => e.status === 'omen');
    expect(dmg).toHaveLength(1);
    // Madde 258: Lucky Escape ölümcül Doom'u TAMAMEN yok sayar: kalkan harcanmaz, can değişmez
    expect(dmg[0]).toMatchObject({ amount: 0, absorbed: 0, magicShieldAfter: 3, luckyEscape: true });
    expect(dmg[0]!.hpAfter).toBeGreaterThan(0);
    expect(ofType(b.log, 'passive').some((e) => e.actor === w.uid && e.name === 'Lucky Escape')).toBe(true);
  });

  it('taşıyan Wither tikinde ölürse Doom patlamaz; Ill Omen tüm yığını en yakına geçirir', () => {
    const { b, w } = expireScenario(undefined, (_bb, _h, ww) => {
      ww.hp = 1;
    });
    expect(w.hp).toBe(0);
    expect(ofType(b.log, 'doom')).toHaveLength(0);
    const t = ofType(b.log, 'omenTransfer');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ from: w.uid, stacks: omenEffect('withering_curse').stacks });
  });

  it('iki Hexer aynı yığını doldurur (Ö8); 3\'ü tamamlayanın Luck\'ı (anında Doom); süre bitiminde son ekleyenin snapshot\'ı', () => {
    const b = sure(arena([['hexer', 4], ['hexer', 5]], [['warrior', 0]]));
    const [h1, h2] = [P(b, 4), P(b, 5)];
    h1.stats.luck = 10;
    h2.stats.luck = 30;
    const w = E(b, 0);
    cast(b, h1.uid, 'evil_eye', w.uid);
    cast(b, h2.uid, 'evil_eye', w.uid);
    expect(omenOf(w)).toMatchObject({ stacks: 2, source: h2.uid, snapStat: 30 });
    const ev = cast(b, h1.uid, 'evil_eye', w.uid);
    const d = ofType(ev, 'doom')[0]!;
    expect(d).toMatchObject({ source: h1.uid, cause: 'complete', omens: MAX });
    const dmg = ofType(ev, 'damage').find((e) => e.status === 'omen')!;
    expect(inRange(dmg.amount, doomRangeOf(b, w, MAX, 1, 10))).toBe(true);
  });
});

describe('Doom (anında, Doom Mark)', () => {
  it('3\'te anında Doom: hasar = Luck x powerPerStack x 3 (aralık), büyü zırhı uygulanır, kalkan emer, Guard paylaşır, origin skill', () => {
    const b = sure(arena([['hexer', 4]], [['antimage', 0], ['warrior', 1]]));
    const h = P(b, 4);
    const am = E(b, 0);
    const guard = E(b, 1);
    for (let i = 0; i < MAX - 1; i++) cast(b, h.uid, 'evil_eye', am.uid);
    am.statuses.push({ kind: 'guard', turns: 9, source: guard.uid, share: 0.5 });
    const range = doomRangeOf(b, am, MAX, 1, luck(h));
    const raw = doomRangeOf(b, E(b, 1), MAX, 1, luck(h)); // büyü zırhı 0 olan hedef
    expect(range.avg).toBeLessThan(raw.avg); // Anti-Mage büyü zırhı 20
    const ev = cast(b, h.uid, 'evil_eye', am.uid);
    const dmg = ofType(ev, 'damage').filter((e) => e.status === 'omen');
    expect(dmg.some((e) => e.redirected && e.target === guard.uid)).toBe(true); // skill vuruşunun parçası: Guard paylaşır
    expect(dmg.every((e) => e.origin === 'skill')).toBe(true);
    const total = dmg.reduce((t, e) => t + e.amount + e.absorbed, 0);
    expect(total).toBeGreaterThanOrEqual(range.min - 1);
    expect(total).toBeLessThanOrEqual(range.max + 1);
  });

  it('Doom Mark: 0/1/2 Omen -> yığın+1 ile Doom x mult (tek patlama, çift patlama yok); iskada hiçbir şey olmaz, yığın korunur', () => {
    const det = S.doom_mark!.effects.find((e) => e.type === 'detonate') as { mult: number };
    for (const pre of [0, 1, 2]) {
      const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
      const h = P(b, 4);
      const w = E(b, 0);
      for (let i = 0; i < pre; i++) cast(b, h.uid, 'evil_eye', w.uid);
      const ev = cast(b, h.uid, 'doom_mark', w.uid);
      const dooms = ofType(ev, 'doom');
      expect(dooms, `pre ${pre}`).toHaveLength(1);
      expect(dooms[0]).toMatchObject({ cause: 'detonate', omens: pre + 1, mult: det.mult, skill: 'doom_mark' });
      const dmg = ofType(ev, 'damage').find((e) => e.status === 'omen')!;
      expect(inRange(dmg.amount, doomRangeOf(b, w, pre + 1, det.mult, luck(h))), `pre ${pre}`).toBe(true);
      expect(omenOf(w)).toBeUndefined();
    }
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h = P(b, 4);
    const w = E(b, 0);
    cast(b, h.uid, 'evil_eye', w.uid);
    const turns = omenOf(w)!.turns;
    b.debug.miss = 'always';
    const ev = cast(b, h.uid, 'doom_mark', w.uid);
    expect(ofType(ev, 'doom')).toHaveLength(0);
    expect(omenOf(w)).toMatchObject({ stacks: 1, turns });
  });

  it('Doom ile ölen birim ceset bırakır; Ill Omen yalnızca onDoomKill kadar Omen geçirir', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0], ['warrior', 1]]));
    const h = P(b, 4);
    const [w, n] = [E(b, 0), E(b, 1)];
    cast(b, h.uid, 'evil_eye', w.uid);
    cast(b, h.uid, 'evil_eye', w.uid);
    w.hp = 20; // Evil Eye vuruşu öldürmez, Doom öldürür
    const ev = cast(b, h.uid, 'evil_eye', w.uid);
    expect(ofType(ev, 'death').find((e) => e.target === w.uid)).toMatchObject({ corpse: true });
    const pe = hx.passive!.effect as { onDoomKill: number };
    expect(ofType(ev, 'omenTransfer')[0]).toMatchObject({ from: w.uid, to: n.uid, stacks: pe.onDoomKill, after: pe.onDoomKill });
  });
});

describe('Wither (karakter üstü DoT)', () => {
  it('tik miktarı uygulama anında sabit (Luck x power), büyü zırhı uygulanır, isabet/kritik yok, origin status; yeniden uygulanınca büyük miktar kalır', () => {
    const dot = S.withering_curse!.effects.find((e) => e.type === 'dot') as { power: number; turns: number };
    const b = sure(arena([['hexer', 4]], [['warrior', 0]], 'turns'));
    const h = P(b, 4);
    const w = E(b, 0);
    nextTurnOf(b, h.uid);
    cast(b, h.uid, 'withering_curse', undefined, w.slot);
    const st = w.statuses.find((s) => s.kind === 'wither')!;
    expect(st.amount).toBe(Math.round(luck(h) * content.formulas.scaling.luck * dot.power));
    expect(st.turns).toBeLessThanOrEqual(dot.turns);
    h.stats.luck = 1; // snapshot: sonradan değişmez
    b.debug.crit = 'always';
    b.debug.dodge = 'always';
    nextTurnOf(b, w.uid);
    const tick = ofType(b.log, 'damage').filter((e) => e.status === 'wither').at(-1)!;
    expect(tick).toMatchObject({ origin: 'status', crit: false, element: 'dark', damageType: 'magic', target: w.uid });
    expect(tick.amount).toBe(b.dotTickDamage('wither', st.amount!, w));
    // yeniden uygulama: süre yenilenir, büyük miktar kalır
    const b2 = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h2 = P(b2, 4);
    const w2 = E(b2, 0);
    cast(b2, h2.uid, 'withering_curse', undefined, 0);
    const big = w2.statuses.find((s) => s.kind === 'wither')!.amount!;
    w2.statuses.find((s) => s.kind === 'wither')!.turns = 1;
    h2.stats.luck = 1;
    cast(b2, h2.uid, 'withering_curse', undefined, 0);
    expect(w2.statuses.find((s) => s.kind === 'wither')).toMatchObject({ amount: big, turns: dot.turns });
  });

  it('Hexer ölse de Wither ve Omen sürer (Ö3); Opportunist Wither\'lı hedefe bonus verir, yalnız Omen\'li hedefe vermez (Ö7)', () => {
    const b = sure(arena([['hexer', 4], ['cutthroat', 0]], [['warrior', 0], ['warrior', 1]]));
    const h = P(b, 4);
    const ct = P(b, 0);
    const [w, n] = [E(b, 0), E(b, 1)];
    cast(b, h.uid, 'withering_curse', undefined, 0); // ikisine de Wither + Omen
    n.statuses = n.statuses.filter((s) => s.kind !== 'wither'); // n yalnız Omen'li
    b.debugKill(h.uid, false);
    expect(w.statuses.some((s) => s.kind === 'wither')).toBe(true);
    expect(omenOf(w)).toBeDefined();
    const pw = previewSkill(b, ct.uid, 'venom_edge', w.uid)[0]!.damage!.avg;
    const pn = previewSkill(b, ct.uid, 'venom_edge', n.uid)[0]!.damage!.avg;
    const bonus = (ct.passive!.effect as { bonus: number }).bonus;
    expect(Math.abs(pw / pn - (1 + bonus))).toBeLessThan(0.08); // küçük sayılarda yuvarlama
  });
});

describe('Misfortune ve Jinxed (kritik ekleri)', () => {
  it('Misfortune: Omen başına kritik -%3, 0\'ın altına inmez; effectiveStats = önizleme', () => {
    const b = arena([['hexer', 4]], [['gambler', 0]]);
    sure(b);
    const g = E(b, 0);
    g.stats.critChance = 0.11;
    const h = P(b, 4);
    cast(b, h.uid, 'evil_eye', g.uid);
    cast(b, h.uid, 'evil_eye', g.uid);
    expect(b.effectiveStats(g).critChance).toBeCloseTo(0.11 + 2 * OMEN.critDeltaPerStack!);
    g.stats.critChance = 0.02;
    expect(b.effectiveStats(g).critChance).toBe(0);
    g.stats.critChance = 0.11;
    const pv = previewSkill(b, g.uid, 'loaded_dice', h.uid)[0]!.damage!;
    expect(pv.critChance).toBeCloseTo(b.effectiveStats(g).critChance);
  });

  it('Jinxed: isabet -%20 ve kritik 0; taşıyanın sonraki hasar skill\'inin TÜM vuruşlarından sonra düşer (consumed); Backstab yine kritik (Ö5)', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h = P(b, 4);
    const w = E(b, 0);
    w.stats.critChance = 1;
    w.stats.accuracy = 0.9;
    cast(b, h.uid, 'jinx', w.uid);
    const j = content.statuses.jinxed!;
    expect(b.effectiveStats(w).accuracy).toBeCloseTo(0.9 + j.accuracyDelta!);
    expect(b.effectiveStats(w).critChance).toBe(0);
    b.debug.dodge = 'never';
    const ev = cast(b, w.uid, 'melee_attack', h.uid);
    const hits = ofType(ev, 'damage').filter((e) => e.source === w.uid && e.target === h.uid);
    expect(hits.length).toBe(2); // çift vuruş: ikisi de Jinxed
    expect(hits.every((e) => !e.crit)).toBe(true);
    expect(ofType(ev, 'statusEnd').find((e) => e.status === 'jinxed')).toMatchObject({ target: w.uid, consumed: true });
    expect(w.statuses.some((s) => s.kind === 'jinxed')).toBe(false);
    // Backstab garantili kritik Jinx'e rağmen kritik
    const b2 = sure(arena([['hexer', 4]], [['cutthroat', 0]]));
    const ct = E(b2, 0);
    cast(b2, P(b2, 4).uid, 'jinx', ct.uid);
    b2.debug.dodge = 'never';
    const ev2 = cast(b2, ct.uid, 'backstab', P(b2, 4).uid);
    expect(ofType(ev2, 'damage').filter((e) => e.source === ct.uid).every((e) => e.crit)).toBe(true);
  });
});

describe('Ill Omen (pasif omenTransfer)', () => {
  it('Doom dışı ölümde tüm yığın; varışta en fazla maxOnArrival (Doom yok); en yakın seçimi deterministik; kalan süreyi taşır, alıcının sayacı uzamaz', () => {
    const pe = hx.passive!.effect as { maxOnArrival: number };
    const b = sure(arena([['hexer', 4], ['warrior', 0]], [['warrior', 4], ['warrior', 1], ['warrior', 3], ['warrior', 5]]));
    const h = P(b, 4);
    const dead = E(b, 4);
    cast(b, h.uid, 'evil_eye', dead.uid);
    cast(b, h.uid, 'evil_eye', dead.uid);
    omenOf(dead)!.turns = 2;
    // en yakın: ekran ızgarasında Manhattan 1 olanlar (aynı sıra 3 ve 5, ön sıra 1); eşitlikte aynı sıra, sonra küçük yuva => 3
    const expected = b.nearestLivingAlly(dead)!;
    expect(expected.slot).toBe(3);
    dead.hp = 1;
    const mark = b.log.length;
    b.debugKill(dead.uid, false); // Doom dışı ölüm
    const ev = b.log.slice(mark);
    expect(ofType(ev, 'omenTransfer')[0]).toMatchObject({ source: h.uid, from: dead.uid, to: expected.uid, stacks: 2, after: 2 });
    expect(ofType(ev, 'doom')).toHaveLength(0);
    expect(omenOf(expected)).toMatchObject({ stacks: 2, turns: 2 }); // ölenin kalan süresi
    // alıcıda zaten yığın varsa: toplanır ama maxOnArrival'da kesilir, alıcının sayacı korunur
    const b2 = sure(arena([['hexer', 4], ['warrior', 0]], [['warrior', 0], ['warrior', 1]]));
    const h2 = P(b2, 4);
    const [d2, r2] = [E(b2, 0), E(b2, 1)];
    cast(b2, h2.uid, 'evil_eye', d2.uid);
    cast(b2, h2.uid, 'evil_eye', d2.uid);
    cast(b2, h2.uid, 'evil_eye', r2.uid);
    omenOf(r2)!.turns = 3;
    omenOf(d2)!.turns = 1;
    d2.hp = 1;
    b2.debugKill(d2.uid, false);
    expect(omenOf(r2)).toMatchObject({ stacks: pe.maxOnArrival, turns: 3 });
    expect(pe.maxOnArrival).toBeLessThan(MAX);
  });

  it('Hexer ölmüşse Omen geçmez (ama canlı hedefteki lanet sürer)', () => {
    const b = sure(arena([['hexer', 4], ['warrior', 0]], [['warrior', 0], ['warrior', 1]]));
    const h = P(b, 4);
    const [d, r] = [E(b, 0), E(b, 1)];
    cast(b, h.uid, 'evil_eye', d.uid);
    b.debugKill(h.uid, false);
    d.hp = 1;
    const mark = b.log.length;
    b.debugKill(d.uid, false);
    const ev = b.log.slice(mark);
    expect(ofType(ev, 'omenTransfer')).toHaveLength(0);
    expect(omenOf(r)).toBeUndefined();
  });
});

describe('Withering Curse (rect 2x3, aşamalı)', () => {
  it('hücreler rect 2x3 (area-shape), aşamalar önden arkaya; her aşamada hasar + Wither + Omen; aşama içinde Doom', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0], ['warrior', 1], ['warrior', 3], ['warrior', 9]]));
    const h = P(b, 4);
    const cells = shapeCells(S.withering_curse!.area!, 0, 'enemy', content.formulas.formation);
    expect(cells.length).toBe(6);
    const front = E(b, 0);
    cast(b, h.uid, 'evil_eye', front.uid);
    cast(b, h.uid, 'evil_eye', front.uid);
    const ev = cast(b, h.uid, 'withering_curse', undefined, 0);
    const used = ofType(ev, 'skillUsed')[0]!;
    expect(used.cells).toEqual(cells);
    expect(used.stages!.length).toBe(2);
    const hitUids = used.stages!.flatMap((s) => s.targets);
    expect(hitUids).not.toContain(E(b, 9).uid);
    for (const uid of hitUids) {
      expect(ofType(ev, 'omen').some((e) => e.target === uid)).toBe(true);
      expect(ofType(ev, 'status').some((e) => e.target === uid && e.status === 'wither')).toBe(true);
    }
    const doom = ev.find((e) => e.type === 'doom')!;
    expect(doom).toMatchObject({ target: front.uid, cause: 'complete', stage: 0 });
    // aşama sırası: aşama 0'ın tüm olayları aşama 1'den önce
    const stages = ev.filter((e) => e.stage !== undefined).map((e) => e.stage!);
    expect([...stages].sort((a, b2) => a - b2)).toEqual(stages);
  });
});

describe('Önizleme (preview) = gerçek', () => {
  it('Evil Eye 2 Omen\'li hedefte: omens 2->3 ve DOOM aralığı; gerçek Doom aralıkta', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]));
    const h = P(b, 4);
    const w = E(b, 0);
    cast(b, h.uid, 'evil_eye', w.uid);
    cast(b, h.uid, 'evil_eye', w.uid);
    const pv = previewSkill(b, h.uid, 'evil_eye', w.uid)[0]!;
    expect(pv.omen).toMatchObject({ before: 2, after: 3, max: MAX });
    expect(pv.omen!.doom).toMatchObject({ omens: MAX, mult: 1, cause: 'complete' });
    const ev = cast(b, h.uid, 'evil_eye', w.uid);
    const dmg = ofType(ev, 'damage').find((e) => e.status === 'omen')!;
    expect(dmg.amount).toBeGreaterThanOrEqual(pv.omen!.doom!.min);
    expect(dmg.amount).toBeLessThanOrEqual(pv.omen!.doom!.max);
    // Doom Mark: detonate aralığı; Withering Curse: wither tik önizlemesi
    cast(b, h.uid, 'evil_eye', w.uid);
    const dm = previewSkill(b, h.uid, 'doom_mark', w.uid)[0]!;
    expect(dm.omen!.doom).toMatchObject({ omens: 2, cause: 'detonate' });
    const wc = previewSkill(b, h.uid, 'withering_curse', undefined, 0)[0]!;
    expect(wc.dot!.perTick).toBeGreaterThan(0);
    expect(wc.omen).toBeDefined();
  });

  it('skill-info: Omen/Doom/Wither/Jinxed satırları veriden; pasif açıklaması', () => {
    const defs = { statuses: content.statuses, grounds: content.grounds };
    const ee = describeSkill(S.evil_eye!, hx.stats, content.formulas, {}, defs).lines.join(' | ');
    expect(ee).toContain(`Adds 1 ${OMEN.name} (2 on a critical hit)`);
    expect(ee).toContain(`At ${MAX} Omens, Doom strikes`);
    const dm = describeSkill(S.doom_mark!, hx.stats, content.formulas, {}, defs).lines.join(' | ');
    expect(dm).toContain('x1.5');
    expect(dm).not.toContain(`At ${MAX} Omens`);
    const wc = describeSkill(S.withering_curse!, hx.stats, content.formulas, {}, defs).lines.join(' | ');
    expect(wc).toContain('Withering for 3 turns');
    const jx = describeSkill(S.jinx!, hx.stats, content.formulas, {}, defs).lines.join(' | ');
    expect(jx).toContain('Jinxed');
    expect(describePassive(hx.passive!, hx.stats, content.formulas)).toContain('nearest enemy');
  });
});

describe('Yapay zeka (hexer profili)', () => {
  const big = (b: Battle) => {
    for (const c of b.living('enemy')) c.hp = c.maxHp = 500;
    return b;
  };
  it('(1) 2 Omen\'li hedef + Doom Mark hazır -> Doom Mark; 0 Omen\'li hedefte Doom Mark seçilmez (öldürücü değilse)', () => {
    const b = big(sure(arena([['hexer', 4]], [['warrior', 0]]), 500));
    const h = P(b, 4);
    const w = E(b, 0);
    const doomScore = () => explainChoice(b, h.uid, NO_GLOBAL)!.candidates.find((x) => x.skill === 'doom_mark')!.score!;
    const before = doomScore();
    cast(b, h.uid, 'evil_eye', w.uid);
    cast(b, h.uid, 'evil_eye', w.uid);
    // Terazi (madde 257): Doom Mark'ın değeri Omen yığınıyla büyür (ultimate genelde hemen kullanılabilir; K5)
    expect(doomScore()).toBeGreaterThan(before);
    expect(chooseAction(b, h.uid, NO_GLOBAL)).toMatchObject({ skillId: 'doom_mark', targetUid: w.uid });
    const ex = explainChoice(b, h.uid, NO_GLOBAL)!;
    const c = ex.candidates.find((x) => x.skill === 'doom_mark')!;
    expect(c.notes!.join(' ')).toContain('detonate 3 omen x1.5');
  });

  it('(2) 2 Omen\'li yaralı hedef, Evil Eye + otomatik Doom öldürüyor -> bedelsiz Evil Eye (kill önceliği, en ucuz)', () => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0]]), 500);
    const h = P(b, 4);
    const w = E(b, 0);
    cast(b, h.uid, 'evil_eye', w.uid);
    cast(b, h.uid, 'evil_eye', w.uid);
    w.hp = 25;
    const ch = chooseAction(b, h.uid, NO_GLOBAL)!;
    expect(ch.reason).toBe('kill');
    const ex = explainChoice(b, h.uid, NO_GLOBAL)!;
    const eye = ex.candidates.find((x) => x.skill === 'evil_eye' && x.target === ex.final!.target)!;
    expect(eye.notes!.join(' ')).toContain('omens 2->3 DOOM');
    expect(eye.kills.length).toBe(1); // bedelsiz Evil Eye + otomatik Doom öldürür (aday terazide; alan skill'i de öldürüp daha çok vurabilir)
  });

  it('(3) ön sırada 2+ düşman -> Withering Curse; tek düşman -> seçilmez', () => {
    const b = big(sure(arena([['hexer', 4]], [['warrior', 0], ['warrior', 1], ['warrior', 2]]), 500));
    expect(chooseAction(b, P(b, 4).uid, NO_GLOBAL)?.skillId).toBe('withering_curse');
    const one = big(sure(arena([['hexer', 4]], [['warrior', 0]]), 500));
    expect(chooseAction(one, P(one, 4).uid, NO_GLOBAL)?.skillId).not.toBe('withering_curse');
  });

  it('(4) güçlü büyücüye (Mage) Jinx; yalnızca düşük hasarlı rakip varsa Jinx seçilmez', () => {
    const b = big(sure(arena([['hexer', 4]], [['mage', 9]]), 500));
    Object.assign(E(b, 9).stats, { accuracy: content.classes.mage!.stats.accuracy, critChance: content.classes.mage!.stats.critChance }); // gerçek isabet/kritik: Jinx'in önleyeceği değer
    // Terazi: Jinx'in değeri önlediği beklenen hasardır (mitigation); güçlü büyücüde zayıfa göre çok daha yüksek
    const ex = explainChoice(b, P(b, 4).uid, NO_GLOBAL)!;
    const strongJinx = ex.candidates.find((x) => x.skill === 'jinx')!;
    expect(strongJinx.notes!.join(' ')).toContain('mitigation');
    const weak = big(sure(arena([['hexer', 4]], [['mage', 9]]), 500));
    Object.assign(E(weak, 9).stats, { int: 1, str: 1, dex: 1, accuracy: content.classes.mage!.stats.accuracy, critChance: content.classes.mage!.stats.critChance });
    const weakJinx = explainChoice(weak, P(weak, 4).uid, NO_GLOBAL)!.candidates.find((x) => x.skill === 'jinx')!;
    expect(strongJinx.terms!.mitigation!).toBeGreaterThan((weakJinx.terms?.mitigation ?? 0) * 3);
    expect(chooseAction(weak, P(weak, 4).uid, NO_GLOBAL)?.skillId).not.toBe('jinx');
  });

  it('(5) taunt\'lı Defender: tek hedefli skill\'ler ona gider', () => {
    const b = big(sure(arena([['hexer', 4]], [['defender', 0], ['mage', 9]]), 500));
    const d = E(b, 0);
    d.statuses.push({ kind: 'taunt', turns: 3, source: d.uid, taken: 0 });
    for (let i = 0; i < 4; i++) {
      const ch = chooseAction(b, P(b, 4).uid, NO_GLOBAL)!;
      if (S[ch.skillId]!.target === 'single_enemy') expect(ch.targetUid).toBe(d.uid);
      cast(b, P(b, 4).uid, ch.skillId, ch.targetUid, ch.slot);
    }
  });

  it('(6) iki modda determinizm: aynı seed + Hexer takımı = aynı olay akışı; maç kaydında Omen/Doom satırları', () => {
    const run = (mode: 'turns' | 'test') => {
      const b = new Battle(content.battleSetup('random-battle', 77, mode, { party: ['hexer', 'warrior', 'mage', 'paladin', 'archer'], enemies: ['hexer', 'defender', 'gambler', 'druid', 'cutthroat'] }));
      const log = new MatchLog(b, { version: 'test' });
      for (let i = 0; i < 160 && !b.winner; i++) {
        const actor = mode === 'turns' ? b.currentActor : b.living(i % 2 === 0 ? 'party' : 'enemy')[0];
        if (!actor) break;
        log.noteAi(explainChoice(b, actor.uid, content.aiConfig));
        const r = b.applyChoice(actor.uid, chooseAction(b, actor.uid, content.aiConfig));
        if (!r.ok && mode === 'turns') b.skipTurn();
      }
      return { events: JSON.stringify(b.log.slice(1)), text: log.serialize() };
    };
    for (const mode of ['turns', 'test'] as const) {
      const a = run(mode);
      const c = run(mode);
      expect(a.events, mode).toBe(c.events);
    }
    const t = run('turns').text;
    expect(t).toMatch(/\+omen \d/);
    expect(t).toMatch(/omens \d->\d/);
  });
});

describe('Wiki', () => {
  it('Mechanics > Curses makalesi (Omen, Doom, süre bitimi, Misfortune, Withering, Jinxed, Ill Omen); durumlar listede', () => {
    const wiki = buildWiki({ sprites: {}, avatars: {} });
    const art = wiki.mechanics.find((a) => a.id === 'curses')!;
    expect(art).toBeDefined();
    const text = art.blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : [])).join(' ');
    for (const w of ['Doom', 'timer', 'Misfortune', 'Withering', 'Jinxed', 'Ill Omen', 'guard', String(MAX)]) expect(text, w).toContain(w);
    for (const id of ['omen', 'wither', 'jinxed']) expect(wiki.statuses.find((s) => s.id === id)!.usedBy.length, id).toBeGreaterThan(0);
  });
});

// Ömer kararları 2026-10-08: (1) Doom Mark tüm Omen'leri harcar; vuruşu ya da patlaması öldürürse Ill Omen ÇALIŞMAZ (detonate noTransferOnKill).
// (2) Kritik Jinx yığını 3'e tamamlarsa Doom KESİN kritik (omen critDoomOnCrit). Her iki kural iki modda ve belirleyici.
describe('Doom Mark öldürünce Omen silinir; kritik Jinx -> kritik Doom (2026-10-08)', () => {
  const detonate = () => S.doom_mark!.effects.find((e) => e.type === 'detonate') as Extract<(typeof S)[string]['effects'][number], { type: 'detonate' }>;
  const jinxCritBonus = () => (S.jinx!.effects.find((e) => e.type === 'damage') as { critBonus?: number }).critBonus ?? 0;
  /** Hedefe hazır Omen yığını (Hexer'in snapshot'ıyla). */
  const plant = (w: Combatant, h: Combatant, stacks: number) => w.statuses.push({ kind: 'omen', turns: DUR, source: h.uid, stacks, snapStat: luck(h), snapCrit: 0, snapCritMult: h.stats.critMult });
  /** turns modunda Hexer'in turuna gelinir. */
  const ready = (b: Battle, h: Combatant) => {
    if (b.mode === 'turns') nextTurnOf(b, h.uid);
  };
  const setup = (mode: 'test' | 'turns', seed = 1) => {
    const b = sure(arena([['hexer', 4]], [['warrior', 0], ['warrior', 1]], mode, seed));
    b.noCooldowns = true; // turns modunda Doom Mark'ın başlangıç cooldown'u testi engellemesin
    const log = new MatchLog(b, { version: 'test' });
    const h = P(b, 4);
    ready(b, h);
    return { b, log, h, w: E(b, 0), n: E(b, 1) };
  };

  it('veri: Doom Mark detonate noTransferOnKill; yalnızca Jinx omen etkisi critDoomOnCrit taşır', () => {
    expect(detonate().noTransferOnKill).toBe(true);
    expect(omenEffect('jinx').critDoomOnCrit).toBe(true);
    for (const id of ['evil_eye', 'withering_curse', 'doom_mark']) expect(omenEffect(id).critDoomOnCrit, id).toBeFalsy();
  });

  for (const mode of ['test', 'turns'] as const) {
    it(`[${mode}] Doom Mark yığının tamamını (kendi +Omen'i dahil) patlatır, yığın 0; patlama öldürürse Omen geçmez (Ill Omen yok)`, () => {
      const s0 = setup(mode);
      plant(s0.w, s0.h, MAX - 1);
      s0.b.debug.crit = 'always'; // kritik +2: yığın sınırda kesilir, yine hepsi harcanır
      const ev0 = cast(s0.b, s0.h.uid, 'doom_mark', s0.w.uid);
      expect(ofType(ev0, 'doom')).toHaveLength(1);
      expect(ofType(ev0, 'doom')[0]).toMatchObject({ omens: MAX, cause: 'detonate' });
      expect(s0.b.stacksOf(s0.w.uid, 'omen')).toBe(0);

      const { b, h, w, n } = setup(mode);
      plant(w, h, 2);
      w.hp = previewSkill(b, h.uid, 'doom_mark', w.uid)[0]!.damage!.max + 1; // vuruş öldürmez, Doom öldürür
      const ev = cast(b, h.uid, 'doom_mark', w.uid);
      expect(ofType(ev, 'doom')).toHaveLength(1);
      expect(ofType(ev, 'death').some((e) => e.target === w.uid)).toBe(true);
      expect(ofType(ev, 'omenTransfer')).toHaveLength(0);
      expect(ofType(ev, 'passive').some((e) => e.passive === hx.passive!.id)).toBe(false);
      expect(omenOf(n)).toBeUndefined();
      expect(omenOf(w)).toBeUndefined();
    });

    it(`[${mode}] Doom Mark VURUŞU öldürürse: Doom yok, Omen silinir (statusEnd erased), Ill Omen yok; Evil Eye vuruşuyla ölümde yığın geçer, otomatik Doom ölümünde onDoomKill geçer`, () => {
      const { b, log, h, w, n } = setup(mode);
      plant(w, h, 2);
      w.hp = 1;
      const ev = cast(b, h.uid, 'doom_mark', w.uid);
      expect(ofType(ev, 'death').some((e) => e.target === w.uid)).toBe(true);
      expect(ofType(ev, 'doom')).toHaveLength(0);
      expect(ofType(ev, 'omenTransfer')).toHaveLength(0);
      expect(ofType(ev, 'statusEnd').some((e) => e.target === w.uid && e.status === 'omen' && e.cause === 'erased')).toBe(true);
      expect(omenOf(w)).toBeUndefined();
      expect(omenOf(n)).toBeUndefined();
      expect(log.serialize()).toContain('erased: Doom Mark kill');

      // karşılaştırma (kural değişmedi): Evil Eye vuruşuyla ölüm -> tüm yığın geçer
      const s2 = setup(mode);
      plant(s2.w, s2.h, 2);
      s2.w.hp = 1;
      expect(ofType(cast(s2.b, s2.h.uid, 'evil_eye', s2.w.uid), 'omenTransfer')[0]).toMatchObject({ from: s2.w.uid, to: s2.n.uid, stacks: 2 });
      // otomatik Doom ile ölüm -> onDoomKill (1) geçer
      const s3 = setup(mode);
      plant(s3.w, s3.h, MAX - 1);
      s3.w.hp = previewSkill(s3.b, s3.h.uid, 'evil_eye', s3.w.uid)[0]!.damage!.max + 1;
      const pe = hx.passive!.effect as { onDoomKill: number };
      expect(ofType(cast(s3.b, s3.h.uid, 'evil_eye', s3.w.uid), 'omenTransfer')[0]).toMatchObject({ from: s3.w.uid, stacks: pe.onDoomKill });
    });

    it(`[${mode}] kritik Jinx 3'e tamamlarsa Doom KESİN kritik (zar yok: doom sureCrit); kritiksiz Jinx ve Evil Eye kritiği normal`, () => {
      // Hexer'in kendi kritik şansı 1 - critBonus (Doom zarı tek başına bazen iskalardı); Jinx vuruşu critBonus ile kesin kritik
      const cc = 1 - jinxCritBonus();
      expect(cc).toBeLessThan(1);
      for (let seed = 1; seed <= 12; seed++) {
        const { b, log, h, w } = setup(mode, seed);
        h.stats.critChance = cc;
        plant(w, h, MAX - 2);
        const ev = cast(b, h.uid, 'jinx', w.uid);
        expect(ofType(ev, 'omen')[0]).toMatchObject({ crit: true, stacks: MAX });
        const d = ofType(ev, 'doom');
        expect(d, `seed ${seed}`).toHaveLength(1);
        expect(d[0]).toMatchObject({ cause: 'complete', sureCrit: true });
        expect(ofType(ev, 'damage').filter((e) => e.status === 'omen').every((e) => e.crit), `seed ${seed}`).toBe(true);
        expect(log.serialize()).toContain('SURE CRIT');
      }
      // Jinx kritiksiz (debug never): sureCrit yok, Doom kritik değil
      const s2 = setup(mode);
      plant(s2.w, s2.h, MAX - 1);
      s2.b.debug.crit = 'never';
      const ev2 = cast(s2.b, s2.h.uid, 'jinx', s2.w.uid);
      expect(ofType(ev2, 'doom')[0]!.sureCrit).toBeUndefined();
      expect(ofType(ev2, 'damage').filter((e) => e.status === 'omen').some((e) => e.crit)).toBe(false);
      // Evil Eye kritiği 3'e tamamlar: Doom kendi zarını atar (sureCrit yok)
      const s3 = setup(mode);
      s3.h.stats.critChance = 1;
      plant(s3.w, s3.h, MAX - 2);
      const ev3 = cast(s3.b, s3.h.uid, 'evil_eye', s3.w.uid);
      expect(ofType(ev3, 'omen')[0]).toMatchObject({ crit: true, stacks: MAX });
      expect(ofType(ev3, 'doom')[0]!.sureCrit).toBeUndefined();
    });

    it(`[${mode}] determinizm: aynı seed + aynı girdi = aynı olaylar (kritik Jinx, Doom Mark öldürme)`, () => {
      const run = () => {
        const { b, h, w, n } = setup(mode, 7);
        h.stats.critChance = 0.5;
        plant(w, h, 1);
        plant(n, h, 1);
        const a = cast(b, h.uid, 'jinx', w.uid);
        if (mode === 'turns') nextTurnOf(b, h.uid);
        n.hp = 5;
        const c = cast(b, h.uid, 'doom_mark', n.uid);
        return JSON.stringify([a, c]);
      };
      expect(run()).toBe(run());
    });
  }

  it("önizleme: Jinx tamamlarsa doomOnCrit sureCrit (critChance 1); Evil Eye'da yok; refreshOnStack -> turnsLeft tam süre", () => {
    const { b, h, w } = setup('test');
    plant(w, h, MAX - 1);
    const pj = previewSkill(b, h.uid, 'jinx', w.uid)[0]!.omen!;
    expect(pj.doom!.sureCrit).toBeUndefined();
    expect(pj.doomOnCrit).toMatchObject({ sureCrit: true, critChance: 1, omens: MAX });
    expect(pj.doomOnCrit!.hpLoss).toBeGreaterThan(pj.doom!.hpLoss);
    expect(previewSkill(b, h.uid, 'evil_eye', w.uid)[0]!.omen!.doomOnCrit).toBeUndefined();
    const st = omenOf(w)!;
    st.stacks = MAX - 2;
    expect(previewSkill(b, h.uid, 'jinx', w.uid)[0]!.omen!.doomOnCrit).toMatchObject({ sureCrit: true });
    expect(previewSkill(b, h.uid, 'evil_eye', w.uid)[0]!.omen!.doomOnCrit!.sureCrit).toBeUndefined();
    st.turns = 1;
    expect(previewSkill(b, h.uid, 'evil_eye', w.uid)[0]!.omen!.turnsLeft).toBe(DUR);
    // AI notu kesin kritik Doom'u gösterir
    const ex = explainChoice(b, h.uid, NO_GLOBAL);
    expect(JSON.stringify(ex)).toContain('sure crit DOOM');
  });

  it('skill-info, pasif metni ve wiki yeni kuralları anlatır', () => {
    const defs = { statuses: content.statuses, grounds: content.grounds };
    const info = (id: string) => describeSkill(S[id]!, hx.stats, content.formulas, {}, defs).lines.join(' | ');
    expect(info('jinx')).toContain(`A critical Jinx that completes ${MAX} Omens makes the Doom a critical hit`);
    expect(info('evil_eye')).not.toContain('makes the Doom a critical hit');
    expect(info('evil_eye')).toContain('resets the');
    expect(info('doom_mark')).toContain('Ill Omen does not trigger');
    expect(describePassive(hx.passive!, hx.stats, content.formulas)).toContain('passes none');
    const wiki = buildWiki({ sprites: {}, avatars: {} });
    const art = wiki.mechanics.find((a) => a.id === 'curses')!;
    const text = art.blocks.flatMap((x) => (x.kind === 'p' ? [x.text] : x.kind === 'list' ? x.items : [])).join(' ');
    expect(text).toContain('Critical Doom');
    expect(text).toContain('nothing passes on');
    expect(text).toContain('resets it');
  });
});
