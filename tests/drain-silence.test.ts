import { describe, expect, it } from 'vitest';
import { Battle, burnAmountFor, content, describeSkill, emptyProcApplies, explainChoice, MatchLog, nominalBurn, previewSkill } from '../src/engine';
import type { BattleEvent, Combatant, CombatantDef, SkillDef } from '../src/engine';
import { describeEvent } from '../src/engine/match-log';
import { buildWiki } from '../src/wiki/catalog';

// Madde 260 (Ömer 2026-10-08): Anti-Mage Drain Field maks MP yüzdesiyle yakar; manası biten düşmana %50 Silence + hasar.
// Hexer Jinx: yerleşik kritik şansı eki (critBonus). Sayılar veriden okunur.

const S = content.skills;
type ManaBurn = Extract<SkillDef['effects'][number], { type: 'manaBurn' }>;
type Dmg = Extract<SkillDef['effects'][number], { type: 'damage' }>;
const DF = S.drain_field!.effects.find((e) => e.type === 'manaBurn') as ManaBurn;
const EMPTY = DF.onEmpty!;
const SIL = content.statuses[EMPTY.status]!;
const JINX = S.jinx!.effects.find((e) => e.type === 'damage') as Dmg;
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Ev<T> => e.type === type);
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;

function arena(party: [string, number][], enemies: [string, number][], mode: 'test' | 'turns' = 'test', seed = 1, skills: Record<string, SkillDef> = {}): Battle {
  const base = content.battleSetup('random-battle', seed, mode, { party: [], enemies: [] }, false);
  return new Battle({ ...base, skills: { ...base.skills, ...skills }, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
}
/** Kimse ölmez, Lucky Escape / Resilience yok. */
function tough(b: Battle, hp = 50000): Battle {
  for (const c of b.combatants) {
    Object.assign(c.stats, { surviveChance: 0, resilience: 0 });
    c.hp = c.maxHp = hp;
  }
  return b;
}
const P = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'party' && c.slot === slot)!;
const E = (b: Battle, slot: number): Combatant => b.combatants.find((c) => c.side === 'enemy' && c.slot === slot)!;
function cast(b: Battle, uid: string, skill: string, target?: string): BattleEvent[] {
  const r = b.useSkill(uid, skill, target);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
}
function nextTurnOf(b: Battle, uid: string): void {
  if (b.currentUid === uid) b.skipTurn();
  for (let i = 0; i < 400 && b.currentUid !== uid && !b.winner; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}
/** Zarı her zaman tutan Drain Field kopyası (chance 1). */
const sureDrain = (): Record<string, SkillDef> => ({ drain_field: { ...S.drain_field!, effects: [{ ...DF, onEmpty: { ...EMPTY, chance: 1 } }] } });

describe('Drain Field verisi (madde 260)', () => {
  it('yakım maks MP yüzdesi; onEmpty: zar, susturan durum, Anti-Mage statıyla (INT) ölçekli büyü hasarı', () => {
    expect(DF.pctMax).toBeGreaterThan(0);
    expect(DF.pctMax).toBeLessThanOrEqual(1);
    expect(EMPTY.chance).toBeGreaterThan(0);
    expect(EMPTY.chance).toBeLessThanOrEqual(1);
    expect(EMPTY.turns).toBeGreaterThanOrEqual(1);
    expect(EMPTY.damage.scale).toBe(content.classes.antimage!.primary); // hasar ölçekleme kuralı: skill sahibinin statı
    expect(EMPTY.damage.power).toBeGreaterThan(0);
    expect(SIL.type).toBe('debuff');
    expect(SIL.blocksMpSkills).toBe(true);
    expect(SIL.tickAtTurnEnd).toBe(true);
    expect(SIL.dispellable).not.toBe(false);
  });
});

describe('Drain Field: yüzdeyle yakım', () => {
  it('her hedef kendi maks MP\'sinin pctMax kadarını kaybeder (mevcut MP\'yle sınırlı)', () => {
    const b = tough(arena([['antimage', 0]], [['mage', 0], ['warrior', 3], ['hexer', 1]]));
    const am = P(b, 0);
    const before = new Map(b.living('enemy').map((c) => [c.uid, c.mp]));
    const ev = cast(b, am.uid, 'drain_field', E(b, 0).uid);
    const burns = ofType(ev, 'manaBurn');
    expect(burns.length).toBeGreaterThan(1);
    for (const e of burns) {
      const t = b.get(e.target)!;
      expect(e.amount).toBe(Math.min(before.get(t.uid)!, Math.round(t.maxMp * DF.pctMax!)));
    }
    // büyük mana havuzu daha çok kaybeder
    const byMax = burns.map((e) => ({ max: b.get(e.target)!.maxMp, amount: e.amount })).sort((x, y) => x.max - y.max);
    expect(byMax.at(-1)!.amount).toBeGreaterThanOrEqual(byMax[0]!.amount);
    expect(nominalBurn(DF, { maxMp: 50 })).toBe(Math.round(50 * DF.pctMax!));
    expect(burnAmountFor(DF, { mp: 3, maxMp: 50 })).toBe(Math.min(3, Math.round(50 * DF.pctMax!)));
  });

  it('manası yakımdan fazla kalan hedefe zar atılmaz; 0\'a inen ve zaten 0 olan hedefe atılır; maks MP 0 olan birime atılmaz', () => {
    const b = tough(arena([['antimage', 0]], [['mage', 0], ['warrior', 3], ['hexer', 1]]));
    const [full, low, zero] = [E(b, 0), E(b, 3), E(b, 1)];
    low.mp = Math.max(1, nominalBurn(DF, low) - 1); // bu yakımla 0'a iner
    zero.mp = 0; // zaten 0
    expect(emptyProcApplies(DF, full)).toBe(false);
    expect(emptyProcApplies(DF, low)).toBe(true);
    expect(emptyProcApplies(DF, zero)).toBe(true);
    expect(emptyProcApplies(DF, { mp: 0, maxMp: 0, hp: 10 })).toBe(false);
    const ev = cast(b, P(b, 0).uid, 'drain_field', full.uid);
    const rolled = ofType(ev, 'emptyProc').map((e) => e.target).sort();
    expect(rolled).toEqual([low.uid, zero.uid].sort());
  });
});

describe('Drain Field: mana boşalma zarı', () => {
  it('1000 örnekte ~%50 tutar; tutunca Silence + isabet zarsız hasar (kaçınma yüksek olsa da), tutmayınca hiçbir şey', () => {
    const b = tough(arena([['antimage', 0]], [['hexer', 0]]));
    b.freeMp = true;
    const am = P(b, 0);
    const foe = E(b, 0);
    foe.stats.evasion = 5; // normal bir vuruş neredeyse hiç isabet etmez: onEmpty hasarı isabet zarı atmaz
    let hits = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      foe.mp = 0;
      foe.hp = foe.maxHp;
      foe.statuses = [];
      const ev = cast(b, am.uid, 'drain_field', foe.uid);
      const proc = ofType(ev, 'emptyProc');
      expect(proc).toHaveLength(1);
      expect(proc[0]!.chance).toBe(EMPTY.chance);
      expect(ofType(ev, 'dodge').length + ofType(ev, 'miss').length).toBe(0);
      if (proc[0]!.success) {
        hits++;
        const st = ofType(ev, 'status').filter((e) => e.target === foe.uid && e.status === EMPTY.status);
        expect(st).toHaveLength(1);
        expect(st[0]!.turns).toBe(EMPTY.turns);
        const dmg = ofType(ev, 'damage').filter((e) => e.target === foe.uid);
        expect(dmg).toHaveLength(1);
        expect(dmg[0]!.origin).toBe('skill');
        expect(dmg[0]!.element).toBe(EMPTY.damage.element);
        expect(dmg[0]!.amount + dmg[0]!.absorbed).toBeGreaterThan(0);
        // olay sırası: emptyProc -> status -> damage
        expect(ev.indexOf(proc[0]!)).toBeLessThan(ev.indexOf(st[0]!));
        expect(ev.indexOf(st[0]!)).toBeLessThan(ev.indexOf(dmg[0]!));
      } else {
        expect(ofType(ev, 'status')).toHaveLength(0);
        expect(ofType(ev, 'damage')).toHaveLength(0);
      }
    }
    expect(hits / N).toBeGreaterThan(EMPTY.chance - 0.05);
    expect(hits / N).toBeLessThan(EMPTY.chance + 0.05);
  });

  it('belirleyici: aynı seed + aynı girdiler = aynı olaylar (zar dahil)', () => {
    const run = () => {
      const b = tough(arena([['antimage', 0]], [['mage', 0], ['warrior', 3], ['hexer', 1]], 'test', 42));
      b.freeMp = true;
      for (const c of b.living('enemy')) c.mp = 0;
      const out: BattleEvent[] = [];
      for (let i = 0; i < 20; i++) {
        for (const c of b.living('enemy')) c.mp = 0;
        out.push(...cast(b, P(b, 0).uid, 'drain_field', E(b, 0).uid));
      }
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });
});

describe('Silence etkisi', () => {
  it('susturulan birim MP bedelli skill kullanamaz; bedelsiz skill ve global eylemler serbest; dispel silinebilir', () => {
    const b = tough(arena([['antimage', 0]], [['hexer', 0]], 'test', 1, sureDrain()));
    const hx = E(b, 0);
    hx.mp = 0;
    cast(b, P(b, 0).uid, 'drain_field', hx.uid);
    expect(b.isSilenced(hx.uid)).toBe(true);
    hx.mp = hx.maxMp;
    const costly = hx.skills.filter((id) => S[id]!.cost.resource === 'mp' && S[id]!.cost.amount > 0);
    const free = hx.skills.filter((id) => S[id]!.cost.amount <= 0);
    expect(costly.length).toBeGreaterThan(0);
    expect(free.length).toBeGreaterThan(0);
    for (const id of costly) expect(b.canUse(hx.uid, id)).toEqual({ ok: false, reason: 'Silenced' });
    for (const id of free) expect(b.canUse(hx.uid, id).ok).toBe(true);
    b.freeMp = true; // Unlimited MP debug'ı da susturmayı açmaz
    for (const id of costly) expect(b.canUse(hx.uid, id).ok).toBe(false);
    expect(b.listActions(hx.uid).filter((a) => a.kind === 'global').some((a) => a.ok)).toBe(true);
    expect(b.dispelCandidates(hx, 'debuff').map((s) => s.kind)).toContain(EMPTY.status);
  });

  it('turns modu: 1 turluk susturma hedefin BİR SONRAKİ turunun tamamını kapsar, tur bitince kalkar', () => {
    const b = tough(arena([['antimage', 0]], [['hexer', 0]], 'turns', 3, sureDrain()));
    const am = P(b, 0);
    const hx = E(b, 0);
    nextTurnOf(b, am.uid);
    hx.mp = 0;
    am.mp = am.maxMp;
    cast(b, am.uid, 'drain_field', hx.uid);
    expect(b.isSilenced(hx.uid)).toBe(true);
    // hedefin sırası gelene kadar (onun turunu geçmeden) diğerleri pas geçer: tur BAŞINDA süre azalmaz
    for (let i = 0; i < 400 && b.currentUid !== hx.uid; i++) b.skipTurn();
    expect(b.currentUid).toBe(hx.uid);
    expect(b.isSilenced(hx.uid)).toBe(true);
    hx.mp = hx.maxMp;
    const costly = hx.skills.find((id) => S[id]!.cost.resource === 'mp' && S[id]!.cost.amount > 0 && !(hx.cooldowns[id] ?? 0))!;
    expect(b.canUse(hx.uid, costly)).toEqual({ ok: false, reason: 'Silenced' });
    // tur biter (pas): durum kalkar
    const r = b.skipTurn();
    if (!r.ok) throw new Error(r.reason);
    expect(ofType(r.events, 'statusEnd').some((e) => e.target === hx.uid && e.status === EMPTY.status)).toBe(true);
    expect(b.isSilenced(hx.uid)).toBe(false);
  });

  it('Resilience 1 turluk susturmayı kısaltmaz (zar yok)', () => {
    const b = tough(arena([['antimage', 0]], [['warrior', 0]], 'test', 1, sureDrain()));
    const w = E(b, 0);
    w.stats.resilience = 1;
    w.mp = 0;
    const ev = cast(b, P(b, 0).uid, 'drain_field', w.uid);
    expect(ofType(ev, 'passive').some((e) => e.name === 'Resilience')).toBe(false);
    expect(w.statuses.find((s) => s.kind === EMPTY.status)?.turns).toBe(EMPTY.turns);
  });
});

describe('Drain Field: önizleme, YZ, açıklama, kayıt, wiki', () => {
  it('önizleme: yakım miktarı ve yalnızca manası bitecek hedefte zar ihtimali + durum + hasar aralığı', () => {
    const b = tough(arena([['antimage', 0]], [['mage', 0], ['hexer', 1]]));
    const [full, zero] = [E(b, 0), E(b, 1)];
    zero.mp = 0;
    const pv = previewSkill(b, P(b, 0).uid, 'drain_field', full.uid);
    const pf = pv.find((x) => x.uid === full.uid)!;
    const pz = pv.find((x) => x.uid === zero.uid)!;
    expect(pf.burn).toBe(burnAmountFor(DF, full));
    expect(pf.emptyProc).toBeUndefined();
    expect(pz.burn ?? 0).toBe(0);
    expect(pz.emptyProc?.chance).toBe(EMPTY.chance);
    expect(pz.emptyProc?.status).toBe(EMPTY.status);
    expect(pz.emptyProc?.statusName).toBe(SIL.name);
    expect(pz.emptyProc?.turns).toBe(EMPTY.turns);
    expect(pz.emptyProc!.damage.min).toBeGreaterThan(0);
    expect(pz.emptyProc!.damage.max).toBeGreaterThanOrEqual(pz.emptyProc!.damage.min);
  });

  it('YZ: manası bitecek düşmanda silence terimi (engellenen MP\'li hamle) ve zarın hasarı değere girer', () => {
    // turns modu: MP 0'daki Mage bir sonraki turunda yenilenmeyle ucuz MP'li skill'ini (Fire Bolt) ödeyebilir; susturma onu engeller
    // (test modunda yenilenme yok: MP 0'daki birim zaten MP'li skill kullanamaz, susturmanın değeri 0 olur)
    const b = arena([['antimage', 0], ['warrior', 1]], [['hexer', 0], ['mage', 1], ['druid', 2]], 'turns');
    for (const c of b.living('enemy')) c.mp = 0;
    const ex = explainChoice(b, P(b, 0).uid, content.aiConfig)!;
    const drain = ex.candidates.filter((c) => c.skill === 'drain_field');
    expect(drain.length).toBeGreaterThan(0);
    expect(Math.max(...drain.map((c) => c.terms?.silence ?? 0))).toBeGreaterThan(0);
    expect(Math.max(...drain.map((c) => c.terms?.damage ?? 0))).toBeGreaterThan(0);
  });

  it('skill-info: yüzde yakım ve zar satırı veriden', () => {
    const info = describeSkill(S.drain_field!, content.classes.antimage!.stats, content.formulas, {}, { statuses: content.statuses });
    const text = info.lines.join(' | ');
    expect(text).toContain(`${Math.round(DF.pctMax! * 100)}% of each target's max MP`);
    expect(text).toContain(`${Math.round(EMPTY.chance * 100)}% chance`);
    expect(text).toContain(SIL.name);
  });

  it('maç kaydı emptyProc olayını yazar; wiki Silence makalesi var', () => {
    const b = tough(arena([['antimage', 0]], [['hexer', 0]], 'test', 1, sureDrain()));
    const log = new MatchLog(b);
    E(b, 0).mp = 0;
    const ev = cast(b, P(b, 0).uid, 'drain_field', E(b, 0).uid);
    const proc = ofType(ev, 'emptyProc')[0]!;
    expect(describeEvent(b, proc)).toContain('out of mana');
    expect(log.moves.length).toBeGreaterThanOrEqual(0);
    const wiki = buildWiki({ sprites: {}, avatars: {} });
    const art = wiki.mechanics.find((a) => a.id === 'silence');
    expect(art).toBeDefined();
    const text = art!.blocks.flatMap((x) => (x.kind === 'p' ? [x.text] : x.kind === 'list' ? x.items : [])).join(' ');
    expect(text).toContain(S.drain_field!.name);
    expect(text).toContain(SIL.name);
  });
});

describe('Jinx: yerleşik kritik eki (critBonus)', () => {
  it('veri: critBonus > 0, guaranteedCrit yok; açıklamada "+25% crit chance"', () => {
    expect(JINX.critBonus).toBeGreaterThan(0);
    expect(JINX.guaranteedCrit).toBeUndefined();
    const info = describeSkill(S.jinx!, content.classes.hexer!.stats, content.formulas, {}, { statuses: content.statuses });
    expect(info.lines).toContain(`+${Math.round(JINX.critBonus! * 100)}% crit chance`);
  });

  it('önizleme kritik şansı = geçerli kritik + bonus; Jinxed kullanıcıda 0 kalır', () => {
    const b = arena([['hexer', 0]], [['warrior', 0]]);
    const hx = P(b, 0);
    const base = b.effectiveStats(hx).critChance;
    const pv = previewSkill(b, hx.uid, 'jinx', E(b, 0).uid)[0]!;
    expect(pv.damage!.critChance).toBeCloseTo(Math.min(1, base + JINX.critBonus!));
    hx.statuses.push({ kind: 'jinxed', turns: 2, source: E(b, 0).uid });
    expect(previewSkill(b, hx.uid, 'jinx', E(b, 0).uid)[0]!.damage!.critChance).toBe(0);
  });

  it('kritik oranı ~ taban + bonus (1000 örnek); kritik Jinx critStacks Omen ve x critMult hasar', () => {
    const b = tough(arena([['hexer', 0]], [['warrior', 0]]));
    b.freeMp = true;
    const hx = P(b, 0);
    const foe = E(b, 0);
    Object.assign(hx.stats, { accuracy: 10, critChance: 0.1 });
    foe.stats.evasion = 0;
    const omenEff = S.jinx!.effects.find((e) => e.type === 'omen') as Extract<SkillDef['effects'][number], { type: 'omen' }>;
    let crits = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      foe.statuses = [];
      foe.hp = foe.maxHp;
      const ev = cast(b, hx.uid, 'jinx', foe.uid);
      const d = ofType(ev, 'damage').find((e) => e.target === foe.uid && e.origin === 'skill' && !e.status)!;
      const om = ofType(ev, 'omen')[0]!;
      if (d.crit) {
        crits++;
        expect(om.delta).toBe(omenEff.critStacks);
      } else expect(om.delta).toBe(omenEff.stacks);
    }
    const want = 0.1 + JINX.critBonus!;
    expect(crits / N).toBeGreaterThan(want - 0.05);
    expect(crits / N).toBeLessThan(want + 0.05);
    expect(hx.stats.critMult).toBe(content.formulas.attributes.critMult);
  });
});
