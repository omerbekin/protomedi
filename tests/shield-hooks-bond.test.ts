import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describeSkill, explainChoice, predictQueue, previewSkill, skillCostAmount } from '../src/engine';
import type { AiConfig, BattleEvent, BattleMode, Combatant, SkillDef } from '../src/engine';

/**
 * Madde 240 (Ömer): Anti-Mage Spell Ward (dosta/kendine, saldıranın MP'sini yakar, %25 buff siler), Mage Mana Barrier (debuff siler, emdikçe MP verir),
 * generic kalkan kancaları (shield.onAbsorb), Undead lifesteal %35, Dark Bond (lifesteal kopyası) ve yarım turn (turnCost 0,5). Sayılar veriden okunur.
 */
const S = content.skills;
const ai: AiConfig = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const ward = S.spell_ward!.effects.find((e) => e.type === 'shield')!;
const wardHook = (ward as Extract<SkillDef['effects'][number], { type: 'shield' }>).onAbsorb!;
const barrier = S.mana_barrier!.effects.find((e) => e.type === 'shield') as Extract<SkillDef['effects'][number], { type: 'shield' }>;
const bondEffect = S.dark_bond!.effects.find((e) => e.type === 'bond') as Extract<SkillDef['effects'][number], { type: 'bond' }>;

/** Hücre listeli savaş; kritik, Mana Echo kapalı; isabet tam, kaçınma yok; canlar en az 100 (senaryolar ölmeden sürsün). */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test', seed = 1, tweak?: (setup: ReturnType<typeof content.battleSetup>) => void): Battle {
  const setup = content.battleSetup('random-battle', seed, mode, { party: cells(party), enemies: cells(enemies) }, false);
  tweak?.(setup);
  const b = new Battle(setup);
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, manaEcho: 0, resilience: 0, surviveChance: 0 });
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
  }
  return b;
}
const at = (b: Battle, side: 'party' | 'enemy', slot: number): Combatant => b.combatants.find((c) => c.side === side && c.slot === slot && !c.summoned)!;
function act(b: Battle, uid: string, skill: string, target?: string, slot?: number): BattleEvent[] {
  const r = b.useSkill(uid, skill, target, slot);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
}
/** turns modunda sırası gelene kadar pas. */
function until(b: Battle, uid: string): void {
  for (let i = 0; i < 400 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}

describe('Spell Ward (Anti-Mage): dosta ya da kendine, kancalar', () => {
  it('hedef türü single_ally, excludeSelf YOK: hem kendine hem dosta atılır; kalkan formülü aynı (Int x 0,3 + kalan MP x 0,6)', () => {
    expect(S.spell_ward!.target).toBe('single_ally');
    expect(S.spell_ward!.excludeSelf).toBeUndefined();
    expect(ward).toMatchObject({ scale: 'int', power: 0.3, shieldType: 'magic', bonusPerMana: 0.6 });
    expect(wardHook).toEqual({ burnMana: 8, dispelChance: 0.25 });
    const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' });
    const am = at(b, 'party', 1);
    const w = at(b, 'party', 0);
    expect(b.validTargets(am.uid, 'spell_ward').map((c) => c.uid).sort()).toEqual([w.uid, am.uid].sort());
    const ev = ofType(act(b, am.uid, 'spell_ward', w.uid), 'shield')[0]!;
    expect(ev.target).toBe(w.uid);
    expect(ev.magic).toBe(true);
    expect(w.magicShield).toBe(ev.amount);
    expect(w.shieldHooks).toEqual([{ skill: 'spell_ward', caster: am.uid, magic: true, amount: ev.amount, onAbsorb: wardHook }]);
    expect(act(b, am.uid, 'spell_ward', am.uid).length).toBeGreaterThan(0);
    expect(am.magicShield).toBeGreaterThan(0);
  });

  it('kalkan büyü vuruşunu emince saldıranın MP\'si burnMana kadar yanar (olay: shieldTrigger + manaBurn cause spell_ward); 0\'ın altına inmez', () => {
    const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' });
    const am = at(b, 'party', 1);
    const w = at(b, 'party', 0);
    const mage = at(b, 'enemy', 0);
    act(b, am.uid, 'spell_ward', w.uid);
    const before = mage.mp;
    const events = act(b, mage.uid, 'fire_bolt', w.uid);
    const dmg = ofType(events, 'damage')[0]!;
    expect(dmg.absorbed).toBeGreaterThan(0);
    const trig = ofType(events, 'shieldTrigger');
    expect(trig).toHaveLength(1);
    expect(trig[0]).toMatchObject({ bearer: w.uid, caster: am.uid, attacker: mage.uid, skill: 'spell_ward', absorbed: dmg.absorbed, burned: wardHook.burnMana });
    const burn = ofType(events, 'manaBurn')[0]!;
    expect(burn).toMatchObject({ source: w.uid, target: mage.uid, amount: wardHook.burnMana, cause: 'spell_ward' });
    expect(mage.mp).toBe(before - S.fire_bolt!.cost.amount - wardHook.burnMana!);
    // olay sırası: hasar -> tetik -> mana yakma
    expect(events.indexOf(dmg)).toBeLessThan(events.indexOf(trig[0]!));
    expect(events.indexOf(trig[0]!)).toBeLessThan(events.indexOf(burn));

    // MP yetmezse kalan kadarı yanar, 0'da durur
    const b2 = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' });
    act(b2, at(b2, 'party', 1).uid, 'spell_ward', at(b2, 'party', 0).uid);
    const m2 = at(b2, 'enemy', 0);
    m2.mp = S.fire_bolt!.cost.amount + 3;
    const e2 = act(b2, m2.uid, 'fire_bolt', at(b2, 'party', 0).uid);
    expect(ofType(e2, 'manaBurn')[0]!.amount).toBe(3);
    expect(m2.mp).toBe(0);
  });

  it('kalkan yokken ya da emmediği (fiziksel) vuruşta tetiklenmez', () => {
    const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage', 1: 'archer' });
    const w = at(b, 'party', 0);
    const mage = at(b, 'enemy', 0);
    expect(ofType(act(b, mage.uid, 'fire_bolt', w.uid), 'shieldTrigger')).toHaveLength(0); // kalkan yok
    act(b, at(b, 'party', 1).uid, 'spell_ward', w.uid);
    const phys = act(b, at(b, 'enemy', 1).uid, 'quick_shot', w.uid); // büyü kalkanı fizikseli emmez
    expect(ofType(phys, 'damage')[0]!.absorbed).toBe(0);
    expect(ofType(phys, 'shieldTrigger')).toHaveLength(0);
    expect(ofType(phys, 'manaBurn')).toHaveLength(0);
  });

  it('madde 241: tetik HER darbede: alan büyüsü iki kalkanlı dosta vurunca her emilen darbede mana yakma', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 3: 'antimage' }, { 0: 'mage' });
    const am = at(b, 'party', 3);
    const [w, p] = [at(b, 'party', 0), at(b, 'party', 1)];
    act(b, am.uid, 'spell_ward', w.uid);
    act(b, am.uid, 'spell_ward', p.uid);
    const mage = at(b, 'enemy', 0);
    const events = act(b, mage.uid, 'meteor', undefined, 0); // plus: 0,1,3 -> üç birim
    const absorbedHits = ofType(events, 'damage').filter((d) => d.absorbed > 0).length;
    expect(absorbedHits).toBeGreaterThanOrEqual(2);
    expect(ofType(events, 'manaBurn').filter((e) => e.cause === 'spell_ward')).toHaveLength(absorbedHits);
    expect(ofType(events, 'shieldTrigger')).toHaveLength(absorbedHits);
  });

  it('yer etkisi (zemin) tiki tetiklemez: doğrudan saldıran yok', () => {
    const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'undead' }, 'turns');
    const w = at(b, 'party', 0);
    const u = at(b, 'enemy', 0);
    b.debugCast(at(b, 'party', 1).uid, 'spell_ward', w.uid);
    expect(w.magicShield).toBeGreaterThan(0);
    b.ground.push({ id: 'gtest', ground: 'poison', board: 'party', slots: [w.slot], turns: 9, source: u.uid, sourceSide: 'enemy', amount: 10 });
    const from = b.log.length;
    if (b.currentUid === w.uid) b.skipTurn();
    until(b, w.uid);
    const events = b.log.slice(from);
    const tick = ofType(events, 'damage').find((d) => d.origin === 'ground' && d.target === w.uid)!;
    expect(tick.absorbed).toBeGreaterThan(0);
    expect(ofType(events, 'shieldTrigger')).toHaveLength(0);
    expect(ofType(events, 'manaBurn')).toHaveLength(0);
  });

  it(`saldıranda buff varsa darbe başına %${wardHook.dispelChance! * 100} ihtimalle RASTGELE bir buff silinir (1000 örnek; iki buff da seçilir); dark_bond silinmez`, () => {
    let dispels = 0;
    const picked = new Map<string, number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' }, 'test', seed);
      const w = at(b, 'party', 0);
      const mage = at(b, 'enemy', 0);
      act(b, at(b, 'party', 1).uid, 'spell_ward', w.uid);
      b.debugAddStatus(mage.uid, 'haste', 2);
      b.debugAddStatus(mage.uid, 'fortify', 3);
      const ends = ofType(act(b, mage.uid, 'fire_bolt', w.uid), 'statusEnd').filter((e) => e.dispelled);
      if (ends.length > 0) {
        dispels++;
        expect(ends).toHaveLength(1);
        expect(ends[0]).toMatchObject({ target: mage.uid, dispelled: true, source: w.uid, cause: 'spell_ward' });
        expect(['haste', 'fortify']).toContain(ends[0]!.status);
        picked.set(ends[0]!.status, (picked.get(ends[0]!.status) ?? 0) + 1);
        expect(mage.statuses).toHaveLength(1);
      }
    }
    expect(dispels / 1000).toBeGreaterThan(wardHook.dispelChance! - 0.04);
    expect(dispels / 1000).toBeLessThan(wardHook.dispelChance! + 0.04);
    // rastgele seçim: iki buff da kabaca yarı yarıya
    expect(picked.get('haste')! / dispels).toBeGreaterThan(0.35);
    expect(picked.get('fortify')! / dispels).toBeGreaterThan(0.35);
    // Dark Bond bağı silinebilir değil
    expect(content.statuses.dark_bond!.dispellable).toBe(false);
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'mage' });
    act(b, at(b, 'party', 1).uid, 'dark_bond', at(b, 'party', 0).uid);
    expect(b.dispelCandidates(at(b, 'party', 1), 'buff')).toHaveLength(0);
  });

  it('buff yokken dispel zarı atılmaz (RNG akışı aynı): aynı seed + buff yok = aynı sonuç; turns modunda da çalışır ve determinist', () => {
    const run = () => {
      const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' }, 'turns', 7);
      const am = at(b, 'party', 1);
      const w = at(b, 'party', 0);
      const mage = at(b, 'enemy', 0);
      until(b, am.uid);
      act(b, am.uid, 'spell_ward', w.uid);
      until(b, mage.uid);
      act(b, mage.uid, 'fire_bolt', w.uid);
      return b.log;
    };
    const a = run();
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
    expect(ofType(a, 'manaBurn').filter((e) => e.cause === 'spell_ward')).toHaveLength(1);
  });
});

describe('Mana Barrier (Mage): debuff siler, emdikçe MP verir', () => {
  it('atıldığı dostun TÜM debuff\'larını siler (statusEnd dispelled), buff\'lara dokunmaz; kalkan aynı (Int x 1,7)', () => {
    expect(S.mana_barrier!.effects[0]).toEqual({ type: 'dispel', status: 'debuff' });
    expect(barrier).toMatchObject({ scale: 'int', power: 1.7, onAbsorb: { giveMana: 3 } });
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'warrior' });
    const w = at(b, 'party', 0);
    const mage = at(b, 'party', 1);
    for (const [k, t] of [['slow', 2], ['wound', 3], ['stun', 1], ['blinded', 2], ['haste', 2]] as const) b.debugAddStatus(w.uid, k, t);
    const events = act(b, mage.uid, 'mana_barrier', w.uid);
    const ends = ofType(events, 'statusEnd').filter((e) => e.dispelled);
    expect(ends.map((e) => e.status)).toEqual(['wound', 'slow', 'blinded', 'stun']); // en uzun önce, eşitlikte önce uygulanan
    for (const e of ends) expect(e).toMatchObject({ target: w.uid, source: mage.uid, cause: 'mana_barrier' });
    expect(w.statuses.map((s) => s.kind)).toEqual(['haste']);
    // önce silme, sonra kalkan
    expect(events.indexOf(ends[0]!)).toBeLessThan(events.findIndex((e) => e.type === 'shield'));
    expect(w.shield).toBeGreaterThan(0);
  });

  it('madde 241: kalkan emdiği HER vuruşta taşıyana SABİT giveMana MP verir (mpRegen cause mana_barrier); MP maksimumu aşmaz', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'warrior' });
    const w = at(b, 'party', 0);
    act(b, at(b, 'party', 1).uid, 'mana_barrier', w.uid);
    w.mp = 0;
    const events = act(b, at(b, 'enemy', 0).uid, 'melee_attack', w.uid); // Double Strike: iki vuruş
    const hits = ofType(events, 'damage').filter((d) => d.target === w.uid && d.absorbed > 0);
    const gains = ofType(events, 'mpRegen').filter((e) => e.cause === 'mana_barrier');
    expect(hits).toHaveLength(2);
    expect(gains.map((g) => g.amount)).toEqual(hits.map(() => barrier.onAbsorb!.giveMana!));
    expect(gains.every((g) => g.actor === w.uid)).toBe(true);
    expect(w.mp).toBe(gains.reduce((s, g) => s + g.amount, 0));
    // MP maks sınırı
    const b2 = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'warrior' });
    const w2 = at(b2, 'party', 0);
    act(b2, at(b2, 'party', 1).uid, 'mana_barrier', w2.uid);
    w2.mp = w2.maxMp - 1;
    const e2 = act(b2, at(b2, 'enemy', 0).uid, 'melee_attack', w2.uid);
    expect(ofType(e2, 'mpRegen').filter((e) => e.cause === 'mana_barrier').reduce((s, g) => s + g.amount, 0)).toBe(1);
    expect(w2.mp).toBe(w2.maxMp);
  });
});

describe('generic kalkan kancası (shield.onAbsorb): her kalkan türünde, veriden', () => {
  const testWard: SkillDef = {
    id: 'test_ward', name: 'Test Ward', icon: 'shield', target: 'single_ally', cost: { resource: 'mp', amount: 0 }, motion: 'cast', fx: '#ffffff',
    effects: [{ type: 'shield', scale: 'int', power: 1, onAbsorb: { burnMana: 5, giveMana: 4 } }],
  };
  const withWard = (setup: ReturnType<typeof content.battleSetup>) => {
    setup.skills = { ...setup.skills, test_ward: testWard };
    setup.party = setup.party.map((d) => (d.id === 'mage' ? { ...d, skills: [...d.skills, 'test_ward'] } : d));
  };

  it('fiziksel kalkanda fiziksel vuruş: saldıranın MP\'si yanar ve taşıyan MP kazanır; kancalı katman kancasızdan ÖNCE tükenir', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'archer' }, 'test', 1, withWard);
    const w = at(b, 'party', 0);
    w.shield = 10; // kancasız eski kalkan
    act(b, at(b, 'party', 1).uid, 'test_ward', w.uid);
    expect(w.shieldHooks![0]!.amount).toBe(w.shield - 10);
    const archer = at(b, 'enemy', 0);
    w.mp = 0;
    const mpBefore = archer.mp;
    const events = act(b, archer.uid, 'quick_shot', w.uid);
    const hit = ofType(events, 'damage')[0]!;
    expect(hit.absorbed).toBeGreaterThan(0);
    expect(ofType(events, 'shieldTrigger')[0]).toMatchObject({ skill: 'test_ward', absorbed: hit.absorbed, burned: 5 });
    expect(archer.mp).toBe(mpBefore - 5);
    expect(w.mp).toBe(4);
    expect(w.shield).toBe(w.shieldHooks ? w.shieldHooks[0]!.amount + 10 : 10); // emilen önce kancalı katmandan
  });

  it('kalkan bir yoldan sıfırlanınca (debug temizliği, ölüm/diriltme) kanca kalmaz', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'archer' }, 'test', 1, withWard);
    const w = at(b, 'party', 0);
    act(b, at(b, 'party', 1).uid, 'test_ward', w.uid);
    b.debugClearStatuses(w.uid);
    expect(w.shieldHooks).toBeUndefined();
    w.shield = 30; // kancasız yeni kalkan: tetik yok
    expect(ofType(act(b, at(b, 'enemy', 0).uid, 'quick_shot', w.uid), 'shieldTrigger')).toHaveLength(0);
  });
});

describe('Undead: lifesteal %35 (veriden), Dark Bond', () => {
  it('Vampiric Bite oranı 0,35; skill sırası [Bone Throw, Wail, Dark Bond, Raise Dead]; Blood Rite yok', () => {
    expect((content.classes.undead!.passive!.effect as { ratio: number }).ratio).toBe(0.35);
    expect(content.classes.undead!.skills).toEqual(['bone_throw', 'wail_of_the_dead', 'dark_bond', 'raise_dead']);
    expect(content.classes.undead!.skills[3]).toBe('raise_dead');
    expect(S.blood_rite).toBeUndefined();
    expect(S.dark_bond).toMatchObject({ target: 'single_ally', excludeSelf: true, cost: { resource: 'mp', amount: 8 }, cooldown: 2, turnCost: 0.5 });
    expect(bondEffect).toEqual({ type: 'bond', turns: 3, ratio: 1 });
    // hasar yok: hasar ölçek kuralı dışında değil (ölçekli etki yok)
    expect(S.dark_bond!.effects.some((e) => e.type === 'damage' || 'scale' in e)).toBe(false);
  });

  it('kendine atılamaz; yalnızsa kullanılamaz', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const u = at(b, 'party', 1);
    expect(b.validTargets(u.uid, 'dark_bond').map((c) => c.uid)).toEqual([at(b, 'party', 0).uid]);
    expect(b.useSkill(u.uid, 'dark_bond', u.uid)).toEqual({ ok: false, reason: 'Cannot target yourself' });
    const alone = mk({ 1: 'undead' }, { 0: 'defender' });
    expect(alone.canUse(at(alone, 'party', 1).uid, 'dark_bond')).toEqual({ ok: false, reason: 'No other ally' });
  });

  it('bağ iki uçta dark_bond durumu kurar; Undead\'in her lifesteal kazancı kadar bağlı dost da iyileşir (heal cause dark_bond)', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const [w, u] = [at(b, 'party', 0), at(b, 'party', 1)];
    const ev = act(b, u.uid, 'dark_bond', w.uid);
    expect(ofType(ev, 'status').map((s) => [s.target, s.status, s.partner, s.turns])).toEqual([
      [u.uid, 'dark_bond', w.uid, bondEffect.turns],
      [w.uid, 'dark_bond', u.uid, bondEffect.turns],
    ]);
    expect(b.bondPartnerOf(u.uid)).toBe(w.uid);
    w.hp -= 60;
    u.hp -= 60;
    const events = act(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid);
    const dmg = ofType(events, 'damage')[0]!;
    const want = Math.max(1, Math.round(dmg.amount * 0.35));
    const heals = ofType(events, 'heal');
    expect(heals.find((h) => h.target === u.uid)!.amount).toBe(want);
    expect(heals.find((h) => h.target === w.uid)).toMatchObject({ source: u.uid, amount: want, cause: 'dark_bond' });
  });

  it('madde 241: Undead canı doluyken can çalınmaz ve kopya yok; kısmi dolulukta yalnızca gerçekten iyileşen kadar; dost tam canlıysa olay yok; Wound dostta uygulanır', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const [w, u] = [at(b, 'party', 0), at(b, 'party', 1)];
    act(b, u.uid, 'dark_bond', w.uid);
    const full = act(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid); // ikisi de tam canlı
    expect(ofType(full, 'heal')).toHaveLength(0);
    w.hp -= 50;
    const e2 = act(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid); // Undead tam canlı: dost da almaz
    expect(ofType(e2, 'heal')).toHaveLength(0);
    u.hp = u.maxHp - 2; // kısmi: Undead yalnızca 2 iyileşir, dost da 2
    const e2b = act(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid);
    expect(Math.max(1, Math.round(ofType(e2b, 'damage')[0]!.amount * 0.35))).toBeGreaterThan(2);
    expect(ofType(e2b, 'heal').map((h) => [h.target, h.amount])).toEqual([[u.uid, 2], [w.uid, 2]]);
    u.hp -= 60;
    b.debugAddStatus(w.uid, 'wound', 3);
    const e3 = act(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid);
    const raw = Math.max(1, Math.round(ofType(e3, 'damage')[0]!.amount * 0.35));
    expect(ofType(e3, 'heal').find((h) => h.target === w.uid)!.amount).toBe(Math.round(raw * content.statuses.wound!.healTakenMult!));
  });

  it('çağrısının (Skeleton) hasarından gelen lifesteal de kopyalanır', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const [w, u] = [at(b, 'party', 0), at(b, 'party', 1)];
    act(b, u.uid, 'dark_bond', w.uid);
    const sk = ofType(act(b, u.uid, 'raise_dead', undefined, 2), 'summon')[0]!.combatant.uid;
    Object.assign(b.get(sk)!.stats, { accuracy: 10, evasion: 0, critChance: 0 });
    w.hp -= 50;
    u.hp -= 50;
    const ev = act(b, sk, 'skeleton_strike', at(b, 'enemy', 0).uid);
    const want = Math.max(1, Math.round(ofType(ev, 'damage')[0]!.amount * 0.35));
    expect(ofType(ev, 'heal').map((h) => [h.target, h.amount, h.cause])).toEqual([
      [u.uid, want, undefined],
      [w.uid, want, 'dark_bond'],
    ]);
  });

  it('aynı anda tek bağ: yenisi eskisini koparır (statusEnd cause bond_broken); dispel/temizlik bağa dokunmaz', () => {
    const b = mk({ 0: 'warrior', 1: 'undead', 2: 'mage' }, { 0: 'defender' });
    const [w, u, m] = [at(b, 'party', 0), at(b, 'party', 1), at(b, 'party', 2)];
    act(b, u.uid, 'dark_bond', w.uid);
    const ev = act(b, u.uid, 'dark_bond', m.uid);
    expect(ofType(ev, 'statusEnd').map((e) => [e.target, e.status, e.cause])).toEqual([
      [u.uid, 'dark_bond', 'bond_broken'],
      [w.uid, 'dark_bond', 'bond_broken'],
    ]);
    expect(w.statuses.some((s) => s.kind === 'dark_bond')).toBe(false);
    expect(b.bondPartnerOf(u.uid)).toBe(m.uid);
    // Mana Barrier (debuff siler) bağa dokunmaz
    act(b, m.uid, 'mana_barrier', u.uid);
    expect(b.bondPartnerOf(u.uid)).toBe(m.uid);
  });

  it('süre Undead\'in kendi turlarıyla: 3 turu boyunca sürer; dostun kopyası kendi turunda azalmaz, sahibininkiyle eşitlenir; ikisi birlikte biter', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 3);
    const [w, u] = [at(b, 'party', 0), at(b, 'party', 1)];
    until(b, u.uid);
    act(b, u.uid, 'dark_bond', w.uid);
    const own = () => u.statuses.find((s) => s.kind === 'dark_bond');
    const copy = () => w.statuses.find((s) => s.kind === 'dark_bond');
    let undeadTurns = 0;
    let from = b.log.length;
    for (let i = 0; i < 200 && undeadTurns < bondEffect.turns; i++) {
      b.skipTurn();
      for (const e of b.log.slice(from)) if (e.type === 'turnStart' && e.actor === u.uid) undeadTurns++;
      from = b.log.length;
      if (undeadTurns < bondEffect.turns) {
        expect(own()!.turns).toBe(bondEffect.turns - undeadTurns);
        expect(copy()!.turns).toBe(own()!.turns);
      }
    }
    expect(undeadTurns).toBe(bondEffect.turns);
    expect(own()).toBeUndefined();
    expect(copy()).toBeUndefined();
  });

  it('bağlı dost ya da Undead ölünce bağ biter', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const [w, u] = [at(b, 'party', 0), at(b, 'party', 1)];
    act(b, u.uid, 'dark_bond', w.uid);
    b.debugKill(w.uid);
    expect(u.statuses.some((s) => s.kind === 'dark_bond')).toBe(false);
    expect(b.bondPartnerOf(u.uid)).toBeNull();
    const b2 = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const [w2, u2] = [at(b2, 'party', 0), at(b2, 'party', 1)];
    act(b2, u2.uid, 'dark_bond', w2.uid);
    b2.debugKill(u2.uid);
    expect(w2.statuses.some((s) => s.kind === 'dark_bond')).toBe(false);
  });
});

describe('yarım turn (turnCost 0,5)', () => {
  /** Eylemden sonra sayaç: c1 = c0 - eşik x turnCost + hız x tik (tik sayısı herkes için aynı; başka bir birimden çözülür). */
  function deducted(b: Battle, uid: string, skill: string, target?: string): number {
    const actor = b.get(uid)!;
    const other = b.combatants.find((c) => c.uid !== uid && c.hp > 0)!;
    const [c0, o0, spd, ospd] = [actor.turnCounter, other.turnCounter, b.speedOf(actor), b.speedOf(other)];
    act(b, uid, skill, target);
    const ticks = (other.turnCounter - o0) / ospd;
    return c0 + spd * ticks - actor.turnCounter;
  }
  const threshold = content.formulas.turn.threshold;

  it('Dark Bond sayaçtan eşiğin YARISINI düşer, tam turn skill tamamını; skillUsed.turnCost 0,5', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 2);
    const u = at(b, 'party', 1);
    until(b, u.uid);
    expect(b.turnCostOf('dark_bond')).toBe(0.5);
    const ev: BattleEvent[] = [];
    const off = b.on((e) => ev.push(e));
    expect(deducted(b, u.uid, 'dark_bond', at(b, 'party', 0).uid)).toBeCloseTo(threshold * 0.5, 6);
    off();
    expect(ofType(ev, 'skillUsed')[0]!.turnCost).toBe(0.5);
    until(b, u.uid);
    expect(deducted(b, u.uid, 'bone_throw', at(b, 'enemy', 0).uid)).toBeCloseTo(threshold, 6);
    expect(b.turnCostOf('bone_throw')).toBe(1);
    expect(b.turnCostOf('skip_turn')).toBe(1);
  });

  it('Haste/Slow ve Skip Turn desteğiyle tutarlı: düşüş hızdan bağımsız hep eşiğin yarısı', () => {
    for (const st of ['haste', 'slow'] as const) {
      const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 4);
      const u = at(b, 'party', 1);
      until(b, u.uid);
      b.debugAddStatus(u.uid, st, 3);
      expect(deducted(b, u.uid, 'dark_bond', at(b, 'party', 0).uid)).toBeCloseTo(threshold * 0.5, 6);
    }
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 5);
    const u = at(b, 'party', 1);
    until(b, u.uid);
    expect(b.useGlobal(u.uid, 'skip_turn').ok).toBe(true);
    until(b, u.uid);
    expect(b.speedBoostOf(u.uid)).toBe(0); // destek tur başında bitti
    expect(deducted(b, u.uid, 'dark_bond', at(b, 'party', 0).uid)).toBeCloseTo(threshold * 0.5, 6);
  });

  it('sıra tahmini: turnQueueAfter yarım turnu hesaba katar ve gerçekleşen sırayla aynıdır; kullanıcı daha erken tekrar oynar', () => {
    const b = mk({ 0: 'warrior', 1: 'undead', 2: 'archer' }, { 0: 'defender', 1: 'mage', 2: 'druid' }, 'turns', 9);
    const u = at(b, 'party', 1);
    until(b, u.uid);
    const full = b.turnQueue();
    const half = b.turnQueueAfter('dark_bond');
    expect(b.turnQueueAfter('bone_throw')).toEqual(full);
    expect(half[0]).toBe(u.uid);
    expect(half.indexOf(u.uid, 1)).toBeLessThan(full.indexOf(u.uid, 1) === -1 ? Infinity : full.indexOf(u.uid, 1));
    act(b, u.uid, 'dark_bond', at(b, 'party', 0).uid);
    expect(b.turnQueue().slice(0, half.length - 1)).toEqual(half.slice(1));
    // saf fonksiyon: currentCost 0,5 = eşiğin yarısı
    const slots = [
      { uid: 'a', side: 'party' as const, slot: 0, spd: 10, counter: 100 },
      { uid: 'b', side: 'enemy' as const, slot: 0, spd: 10, counter: 50 },
    ];
    expect(predictQueue(slots, 100, 4, 'a')).toEqual(['a', 'b', 'a', 'b']);
    expect(predictQueue(slots, 100, 4, 'a', 'party', 0.5)).toEqual(['a', 'a', 'b', 'a']);
  });

  it('test modunda sıra yok: yarım turn etkisiz ama skill çalışır; cooldown/MP aynı kurallarla (turns modunda cooldown 2, MP veriden)', () => {
    const t = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'test');
    const tu = at(t, 'party', 1);
    expect(t.turnQueueAfter('dark_bond')).toEqual([]);
    const ev = act(t, tu.uid, 'dark_bond', at(t, 'party', 0).uid);
    expect(ofType(ev, 'skillUsed')[0]!.turnCost).toBe(0.5);
    expect(tu.turnCounter).toBe(0);
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 2);
    const u = at(b, 'party', 1);
    until(b, u.uid);
    const mp = u.mp;
    act(b, u.uid, 'dark_bond', at(b, 'party', 0).uid);
    expect(u.mp).toBe(mp - S.dark_bond!.cost.amount);
    expect(u.cooldowns.dark_bond).toBe(S.dark_bond!.cooldown);
  });
});

describe('yapay zeka (madde 240)', () => {
  it('Undead: bağlanacak dost varken ve bağ yokken Dark Bond kurar (tactic; yarım turn tempo değeri); bağ sürerken yeniden kurmaz', () => {
    const b = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' }, 'turns', 2);
    const u = at(b, 'party', 1);
    until(b, u.uid);
    u.cooldowns.raise_dead = 3; // çağrı önceliği karışmasın
    const fullValue = explainChoice(b, u.uid, ai)!.candidates.find((c) => c.skill === 'dark_bond')?.bond ?? 0;
    u.hp = Math.round(u.maxHp * 0.6); // madde 241: canı doluyken can çalınmaz -> bağ değeri düşük; yaralıyken yüksek
    const pick = chooseAction(b, u.uid, ai)!;
    expect(pick).toMatchObject({ skillId: 'dark_bond', targetUid: at(b, 'party', 0).uid, reason: 'tactic' });
    const cand = explainChoice(b, u.uid, ai)!.candidates.find((c) => c.skill === 'dark_bond')!;
    expect(cand.turnCost).toBe(0.5);
    expect(cand.bond).toBeGreaterThan(0);
    expect(cand.tempo).toBeGreaterThan(0);
    expect(cand.bond).toBeGreaterThan(fullValue);
    // test modunda (cooldown yok): bağ kurulduktan sonra değeri 0 -> yeniden seçilmez
    const t = mk({ 0: 'warrior', 1: 'undead' }, { 0: 'defender' });
    const tu = at(t, 'party', 1);
    tu.hp = Math.round(tu.maxHp * 0.6);
    tu.skills = tu.skills.filter((id) => id !== 'raise_dead'); // test modunda cooldown yok: çağrı önceliği karışmasın
    expect(chooseAction(t, tu.uid, ai)?.skillId).toBe('dark_bond');
    act(t, tu.uid, 'dark_bond', at(t, 'party', 0).uid);
    expect(chooseAction(t, tu.uid, ai)?.skillId).not.toBe('dark_bond');
  });

  it('Anti-Mage: canı eşiğin (veri: maxTargetHpRatio, madde 241 ölçümüyle 0,45) altındaki dosta Spell Ward atar; eşiğin üstündeki dosta atmaz', () => {
    const limit = S.spell_ward!.ai!.requires!.maxTargetHpRatio!;
    expect(limit).toBeLessThanOrEqual(content.aiConfig.profiles.antimage!.shieldBelowRatio);
    const run = (ratio: number) => {
      const b = mk({ 0: 'warrior', 1: 'antimage' }, { 0: 'mage' });
      const w = at(b, 'party', 0);
      w.hp = Math.round(w.maxHp * ratio);
      at(b, 'enemy', 0).maxHp = at(b, 'enemy', 0).hp = 500;
      return { pick: chooseAction(b, at(b, 'party', 1).uid, ai), w };
    };
    const low = run(limit - 0.1);
    expect(low.pick).toMatchObject({ skillId: 'spell_ward', targetUid: low.w.uid, reason: 'shield' });
    expect(run(limit + 0.15).pick?.skillId).not.toBe('spell_ward');
  });

  it('Mage: yaralı olmasa da sersemlemiş dostunu Mana Barrier ile temizler (cleanse değeri >= cleanseMinValue)', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'defender' });
    const w = at(b, 'party', 0);
    at(b, 'enemy', 0).maxHp = at(b, 'enemy', 0).hp = 500;
    b.debugAddStatus(w.uid, 'stun', 1);
    b.debugAddStatus(w.uid, 'slow', 2);
    const pick = chooseAction(b, at(b, 'party', 1).uid, ai)!;
    expect(pick).toMatchObject({ skillId: 'mana_barrier', targetUid: w.uid, reason: 'shield' });
    expect(explainChoice(b, at(b, 'party', 1).uid, ai)!.candidates.find((c) => c.skill === 'mana_barrier' && c.target?.endsWith('Warrior'))!.cleanse).toBeGreaterThanOrEqual(content.aiConfig.profiles.caster!.cleanseMinValue!);
  });

  it('karışık takımlar iki modda çökmeden biter ve determinist (Undead, Anti-Mage, Mage)', () => {
    for (const mode of ['turns', 'test'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const run = () => {
          const setup = content.battleSetup('random-battle', seed, mode, { party: ['undead', 'antimage', 'mage', 'warrior', 'paladin'], enemies: ['undead', 'mage', 'antimage', 'archer', 'defender'] });
          const b = new Battle(setup);
          for (let i = 0; i < 600 && !b.winner; i++) {
            if (mode === 'turns') {
              const uid = b.currentUid!;
              b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
            } else {
              const actor = b.combatants.filter((c) => c.hp > 0)[i % b.combatants.filter((c) => c.hp > 0).length]!;
              const choice = chooseAction(b, actor.uid, content.aiConfig);
              if (choice && !b.globalDef(choice.skillId)) b.applyChoice(actor.uid, choice);
            }
          }
          return b.log;
        };
        const a = run();
        expect(JSON.stringify(run()), `${mode} ${seed}`).toBe(JSON.stringify(a));
        if (mode === 'turns') expect(a.some((e) => e.type === 'battleEnd'), `seed ${seed}`).toBe(true);
      }
    }
  });
});

describe('açıklama ve önizleme', () => {
  const stats = (cls: string) => content.classes[cls]!.stats;
  const info = (id: string, cls: string) => describeSkill(S[id]!, stats(cls), content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });

  it('Spell Ward / Mana Barrier / Dark Bond tooltip satırları veriden', () => {
    const sw = info('spell_ward', 'antimage').lines.join(' | ');
    expect(sw).toContain(`Every hit the shield absorbs burns ${wardHook.burnMana} MP from the attacker`);
    expect(sw).toContain(`${wardHook.dispelChance! * 100}% chance to remove a random buff from the attacker`);
    expect(sw).toContain('not ground effects');
    const mb = info('mana_barrier', 'mage').lines.join(' | ');
    expect(mb).toContain('Removes every debuff from the target');
    expect(mb).toContain(`Every hit the shield absorbs gives the shielded unit ${barrier.onAbsorb!.giveMana} MP`);
    const db = info('dark_bond', 'undead');
    expect(db.lines.join(' | ')).toContain('Takes half a turn');
    expect(db.lines.join(' | ')).toContain('the bonded ally heals the same amount');
    expect(db.turnCost).toBe('Half turn');
    expect(info('bone_throw', 'undead').turnCost).toBe('');
  });

  it('önizleme: Mana Barrier silinecek debuff\'ları, Spell Ward kancaları, Dark Bond bağı gösterir', () => {
    const b = mk({ 0: 'warrior', 1: 'mage', 2: 'antimage', 3: 'undead' }, { 0: 'defender' });
    const [w, m, am, u] = [0, 1, 2, 3].map((s) => at(b, 'party', s));
    b.debugAddStatus(w!.uid, 'slow', 2);
    const mb = previewSkill(b, m!.uid, 'mana_barrier', w!.uid)[0]!;
    expect(mb.dispel).toEqual(['Slow']);
    expect(mb.shield!.amount).toBeGreaterThan(0);
    const sw = previewSkill(b, am!.uid, 'spell_ward', w!.uid)[0]!;
    expect(sw.shield).toMatchObject({ magic: true, onAbsorb: wardHook });
    const db = previewSkill(b, u!.uid, 'dark_bond', w!.uid)[0]!;
    expect(db.statuses).toEqual([`Dark Bond ${bondEffect.turns} turns`]);
  });
});

describe('wiki ve Legacy (madde 240)', () => {
  it('Mechanics: kalkan kancaları, dispel, Dark Bond ve yarım turn makaleleri veriden', async () => {
    const { buildMechanics } = await import('../src/wiki/catalog');
    const arts = buildMechanics();
    const text = (id: string) => JSON.stringify(arts.find((a) => a.id === id)?.blocks ?? null);
    expect(text('shields')).toContain(`Spell Ward (magic shield): when it absorbs a hit, it burns ${wardHook.burnMana} MP`);
    expect(text('shields')).toContain(`Mana Barrier (shield): when it absorbs a hit, it gives the shielded unit ${barrier.onAbsorb!.giveMana} MP`);
    expect(text('dispel')).toContain('Mana Barrier');
    expect(text('dark-bond')).toContain('Dark Bond: bond for 3 turns');
    expect(text('dark-bond')).toContain('Vampiric Bite, 35%');
    expect(text('half-turn')).toContain('Half-turn skills: Dark Bond');
  });

  it('kaldırılan Blood Rite\'ın ikonu, animasyonu ve sesi Legacy\'ye düşer', async () => {
    const { buildCatalog } = await import('../src/gallery/catalog');
    const { buildLegacy } = await import('../src/wiki/assets/legacy-catalog');
    const files = { sprites: {}, avatars: {}, spritesOld: {}, concepts: {}, pool: {} };
    const items = buildLegacy(buildCatalog(files), files).groups.flatMap((g) => g.items);
    expect(items.some((i) => i.kind === 'icon' && i.id === 'bloodrite')).toBe(true);
    expect(items.some((i) => i.kind === 'vfx' && i.id === 'bloodhands')).toBe(true);
    expect(items.some((i) => i.kind === 'sound' && i.id === 'clawRake')).toBe(true);
  });
});

describe('Wail of the Dead can bedeli (madde 241 + Ömer 2026-10-07: MEVCUT canın %20si)', () => {
  const cost = S.wail_of_the_dead!.cost;
  const ratio = cost.ofCurrent!;

  it('bedel MP değil CAN, mevcut canın oranı (veriden; round, en az 1); ödenir, asla öldürmez; tooltip "20% of current HP"', () => {
    expect(cost.resource).toBe('hp');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    const b = mk({ 1: 'undead' }, { 0: 'defender', 1: 'warrior', 3: 'archer' });
    const u = at(b, 'party', 1);
    const mp = u.mp;
    const want = Math.max(1, Math.round(u.hp * ratio));
    expect(skillCostAmount(cost, u)).toBe(want);
    const ev = act(b, u.uid, 'wail_of_the_dead', undefined, 1);
    expect(ofType(ev, 'resource')[0]).toMatchObject({ resource: 'hp', amount: want });
    expect(u.mp).toBe(mp);
    // yarı canda bedel de yarıya iner (mevcut canın oranı)
    expect(skillCostAmount(cost, { hp: 40, mp: 0 })).toBe(Math.round(40 * ratio));
    // en az 1; canı 1 iken bedel 1 = kullanılamaz (asla öldürmez), canı 2 iken kullanılır ve 1 kalır
    expect(skillCostAmount(cost, { hp: 2, mp: 0 })).toBe(1);
    expect(skillCostAmount(cost, { hp: 1, mp: 0 })).toBe(1);
    const b2 = mk({ 1: 'undead' }, { 0: 'defender', 1: 'warrior', 3: 'archer' }, 'test');
    const u2 = at(b2, 'party', 1);
    u2.hp = 1;
    expect(b2.canUse(u2.uid, 'wail_of_the_dead')).toEqual({ ok: false, reason: 'Not enough HP' });
    u2.hp = 2;
    expect(b2.canUse(u2.uid, 'wail_of_the_dead').ok).toBe(true);
    const ev2 = b2.useSkill(u2.uid, 'wail_of_the_dead', undefined, 1);
    expect(ev2.ok).toBe(true);
    if (ev2.ok) expect(ofType(ev2.events, 'resource')[0]).toMatchObject({ resource: 'hp', amount: 1, after: 1 }); // bedelden sonra 1 can (sonra Vampiric Bite iyileştirebilir)
    const info = describeSkill(S.wail_of_the_dead!, content.classes.undead!.stats, content.formulas);
    expect(info.cost).toBe(`${Math.round(ratio * 100)}% of current HP`);
    expect(info.lines.join(' ')).toContain(`Costs ${Math.round(ratio * 100)}% of current HP`);
  });

  it('madde 247 (Ömer): YZ düşük can kuralı (minHpRatioForHpCost) Wail\'e UYGULANMAZ: oranlı bedel muaf, yarı canın altında da kullanır', () => {
    const minRatio = content.aiConfig.profiles.darkmage!.minHpRatioForHpCost;
    expect(minRatio).toBeGreaterThan(0); // kural sabit can bedeli / can bahsi için duruyor
    const setup = (ratio: number) => {
      const b = mk({ 1: 'undead' }, { 0: 'defender', 1: 'warrior', 3: 'archer', 4: 'mage' });
      for (const c of b.living('enemy')) c.maxHp = c.hp = 500;
      const u = at(b, 'party', 1);
      u.hp = Math.round(u.maxHp * ratio);
      u.skills = u.skills.filter((id) => id !== 'raise_dead' && id !== 'dark_bond');
      return { pick: chooseAction(b, u.uid, ai)?.skillId, cand: explainChoice(b, u.uid, ai)!.candidates.find((c) => c.skill === 'wail_of_the_dead') };
    };
    const low = setup(minRatio - 0.2);
    expect(low.pick).toBe('wail_of_the_dead');
    expect(low.cand?.tags).not.toContain('hpCost'); // eşik etiketi yok (Copy match data'da da görünmez)
    expect(setup(1).pick).toBe('wail_of_the_dead');
  });

  it('can bahsi (High Stakes) hâlâ düşük can kuralına tabi: aday etiketi hpCost', () => {
    const b = mk({ 1: 'gambler' }, { 0: 'defender', 1: 'warrior', 3: 'archer' });
    const g = at(b, 'party', 1);
    const cand = explainChoice(b, g.uid, ai)!.candidates.find((c) => c.skill === 'high_stakes');
    expect(cand?.tags).toContain('hpCost');
  });
});
