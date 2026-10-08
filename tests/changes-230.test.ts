import { describe, expect, it } from 'vitest';
import { Battle, MatchLog, chooseAction, content, describePassive, describeSkill, explainChoice, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode } from '../src/engine';

/**
 * Madde 230 (Ömer kararları): Raise Dead iki adımlı hedefleme (ceset seç -> yuva seç; YZ en tehlikeli cesedi seçer), Guard kendine atılamaz,
 * Tremor Slam bedelsiz/cooldown'suz, Resurrection %30 + 2 tur %10 yenilenme, All In daha az şansa dayalı (EV aynı), Sharpshooter perRow,
 * hasar olayının kaynak alanları (origin / element / damageType / ground / groundId). Sayılar veriden okunur.
 */
const ai = content.aiConfig;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const mk = (party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test', seed = 1): Battle => {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party: cells(party), enemies: cells(enemies) }, false));
  b.freeMp = true;
  return b;
};
/** turns modunda `uid`'in sırası gelene kadar pas geç. */
const waitTurn = (b: Battle, uid: string) => {
  for (let i = 0; i < 500 && b.currentUid !== uid && !b.winner; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
};
/** Herkes (yaşayanlar) çok canlı: öldürme önceliği karışmasın. Cesetlerin maks canı (tehlike hesabı) değişmesin diye ÖLDÜRMEDEN SONRA çağrılır. */
const tough = (b: Battle) => {
  for (const c of b.combatants) if (c.hp > 0) c.hp = c.maxHp = 5000;
  return b;
};
const reviveEffect = () => content.skills.resurrection!.effects.find((e) => e.type === 'revive') as { hpRatio: number; mpRatio: number; regen: { turns: number; ratio: number } };

describe('Raise Dead: YZ en tehlikeli cesedi seçer', () => {
  it('danger veriden ve gerekçeli; Paladin (diriltici) cesedi Mage cesedinden tehlikeli: YZ Paladin cesedini tüketir', () => {
    const b = mk({ 3: 'undead', 0: 'warrior' }, { 0: 'warrior', 3: 'paladin', 4: 'mage' });
    b.debugKill('enemy-1', false); // Paladin
    b.debugKill('enemy-2', false); // Mage
    tough(b);
    const choices = b.corpseChoices('party-1', 'raise_dead');
    const pal = choices.find((c) => c.uid === 'enemy-1')!;
    const mage = choices.find((c) => c.uid === 'enemy-2')!;
    expect(pal.why).toContain('reviver');
    expect(mage.why).not.toContain('reviver');
    expect(pal.danger).toBeGreaterThan(mage.danger);
    expect(b.corpseToConsume('party-1')?.uid).toBe('enemy-1');
    const choice = chooseAction(b, 'party-1', ai)!;
    expect(choice).toMatchObject({ skillId: 'raise_dead', reason: 'summon', corpseUid: 'enemy-1' });
    expect(b.summonSlots('party-1', 'raise_dead')).toContain(choice.slot!);
    expect(choice.slot).toBe(b.summonSlotFor('party-1', 'raise_dead'));
    const r = b.applyChoice('party-1', choice);
    expect(r.ok).toBe(true);
    expect(b.corpseOf('enemy-1')?.state).toBe('consumed');
    expect(b.corpseOf('enemy-2')?.state).toBe('revivable');
  });

  it('formül: (tehdit + en iyi skill) x maks can / hpRef x diriltici x (diriltici yaşıyor ve tarafında boş hücre varsa) diriltilebilir çarpanı', () => {
    const cfg = content.formulas.corpseDanger!;
    const b = mk({ 3: 'undead' }, { 0: 'warrior', 3: 'mage', 4: 'archer', 5: 'paladin' });
    b.debugKill('enemy-1', false); // Mage
    b.debugKill('enemy-2', false); // Archer
    const before = Object.fromEntries(b.corpseChoices('party-0', 'raise_dead').map((c) => [c.uid, c]));
    expect(before['enemy-1']!.why).toContain(`revivable by Paladin ${cfg.revivableMult}`);
    // Madde 257: Mage'in yuvasına canlı bir birim girse de diriltilebilir (başka boş hücreye): çarpan KALIR
    b.get('enemy-0')!.slot = b.get('enemy-1')!.slot;
    expect(Object.fromEntries(b.corpseChoices('party-0', 'raise_dead').map((c) => [c.uid, c]))['enemy-1']!.why).toContain('revivable');
    // diriltici (Paladin) düşünce çarpan kalkar
    b.debugKill('enemy-3', false);
    const after = Object.fromEntries(b.corpseChoices('party-0', 'raise_dead').map((c) => [c.uid, c]));
    expect(after['enemy-1']!.why).not.toContain('revivable');
    expect(after['enemy-1']!.danger).toBeCloseTo(before['enemy-1']!.danger / cfg.revivableMult, 0);
    expect(after['enemy-2']!.danger).toBeCloseTo(before['enemy-2']!.danger / cfg.revivableMult, 0);
    // en tehlikeli seçilir (corpseChoices argmax'ı)
    const top = [...b.corpseChoices('party-0', 'raise_dead')].sort((x, y) => y.danger - x.danger || x.slot - y.slot)[0]!;
    expect(b.corpseToConsume('party-0')?.uid).toBe(top.uid);
  });

  it('eşitlikte küçük yuva; aynı durum = aynı karar (deterministik)', () => {
    const b = mk({ 3: 'undead', 0: 'warrior' }, { 1: 'mage', 4: 'mage', 0: 'warrior' });
    b.debugKill('enemy-2', false); // Mage, yuva 4 (önce ölür)
    b.debugKill('enemy-1', false); // Mage, yuva 1
    tough(b);
    const [a, c] = b.corpseChoices('party-1', 'raise_dead');
    expect(a!.danger).toBe(c!.danger);
    expect(b.corpseToConsume('party-1')?.slot).toBe(Math.min(a!.slot, c!.slot));
    expect(JSON.stringify(chooseAction(b, 'party-1', ai))).toBe(JSON.stringify(chooseAction(b, 'party-1', ai)));
  });

  it('maç kaydı: ceset adayları, danger puanı, gerekçe ve seçilmeyen cesetler', () => {
    const b = mk({ 3: 'undead', 0: 'warrior' }, { 0: 'warrior', 3: 'paladin', 4: 'mage' });
    b.debugKill('enemy-1', false);
    b.debugKill('enemy-2', false);
    tough(b);
    const ex = explainChoice(b, 'party-1', ai)!;
    const cand = ex.candidates.find((c) => c.skill === 'raise_dead')!;
    expect(cand.corpse).toMatchObject({ unit: 'E1:Paladin' });
    expect(cand.otherCorpses).toEqual([{ unit: 'E2:Mage', danger: b.corpseChoices('party-1', 'raise_dead').find((c) => c.uid === 'enemy-2')!.danger }]);
    expect(ex.final).toMatchObject({ skill: 'raise_dead', corpse: 'E1:Paladin' });
    const log = new MatchLog(b, { version: 'test' });
    log.noteAi(ex);
    expect(b.applyChoice('party-1', chooseAction(b, 'party-1', ai)).ok).toBe(true);
    const text = log.serialize();
    expect(text).toMatch(/consumes E1:Paladin \(danger [\d.]+: \(threat .*reviver/);
    expect(text).toContain('other corpses E2:Mage danger');
  });

  it('iki modda YZ seçimi uygulanır (turns: sırası gelince)', () => {
    for (const mode of ['test', 'turns'] as const) {
      const b = mk({ 3: 'undead', 0: 'warrior' }, { 0: 'warrior', 3: 'paladin', 4: 'mage' }, mode, 4);
      b.debugKill('enemy-1', false);
      b.debugKill('enemy-2', false);
    tough(b);
      if (mode === 'turns') waitTurn(b, 'party-1');
      // Terazi: Raise Dead seçilip seçilmemesi değerine bağlı; seçildiğinde (ya da adayında) tüketilecek ceset en tehlikelisi
      const cand = explainChoice(b, 'party-1', ai)!.candidates.find((c) => c.skill === 'raise_dead')!;
      expect(cand.corpse?.unit).toBe('E1:Paladin');
      const choice = chooseAction(b, 'party-1', ai)!;
      if (choice.skillId === 'raise_dead') expect(choice.corpseUid).toBe('enemy-1');
      const r = b.applyChoice('party-1', { skillId: 'raise_dead', slot: cand.summonSlot, corpseUid: 'enemy-1' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(ofType(r.events, 'skillUsed')[0]).toMatchObject({ corpseUid: 'enemy-1', slot: cand.summonSlot });
    }
  });
});

describe('Guard kendine atılamaz', () => {
  it('veri excludeSelf; hedef listesinde kullanıcı yok; kendine atmak "Cannot guard yourself"; önizleme boş', () => {
    expect(content.skills.guard!.excludeSelf).toBe(true);
    const b = mk({ 0: 'defender', 1: 'warrior' }, { 0: 'archer' });
    expect(b.validTargets('party-0', 'guard').map((c) => c.uid)).toEqual(['party-1']);
    expect(b.useSkill('party-0', 'guard', 'party-0')).toEqual({ ok: false, reason: 'Cannot guard yourself' });
    expect(b.targetProblem('party-0', 'guard', 'party-0')).toBe('Cannot guard yourself');
    expect(previewSkill(b, 'party-0', 'guard', 'party-0')).toEqual([]);
    expect(b.useSkill('party-0', 'guard', 'party-1').ok).toBe(true);
    // Taunt etkilenmez (kendine)
    expect(b.useSkill('party-0', 'taunt').ok).toBe(true);
  });

  it('yalnız Defender: Guard kullanılamaz ("No ally to guard"); YZ seçmez; açıklamada yazar', () => {
    const b = mk({ 0: 'defender' }, { 0: 'archer' });
    expect(b.canUse('party-0', 'guard')).toEqual({ ok: false, reason: 'No ally to guard' });
    expect(chooseAction(b, 'party-0', ai)?.skillId).not.toBe('guard');
    const info = describeSkill(content.skills.guard!, content.classes.defender!.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.join(' ')).toContain('Cannot target yourself');
  });
});

describe('Tremor Slam: bedelsiz ve cooldown yok', () => {
  it('veri: MP 0, cooldown yok; turns modunda art arda kullanılabilir, MP harcamaz', () => {
    const t = content.skills.tremor_slam!;
    expect(t.cost.amount).toBe(0);
    expect(t.cooldown ?? 0).toBe(0);
    const b = mk({ 0: 'defender' }, { 0: 'warrior', 1: 'mage' }, 'turns');
    b.freeMp = false;
    const d = b.get('party-0')!;
    for (let k = 0; k < 2; k++) {
      waitTurn(b, 'party-0');
      const mp = d.mp;
      const r = b.useSkill('party-0', 'tremor_slam', 'enemy-0');
      expect(r.ok).toBe(true);
      if (r.ok) expect(ofType(r.events, 'resource').filter((e) => e.actor === 'party-0')).toHaveLength(0);
      expect(d.cooldowns.tremor_slam).toBeUndefined();
      expect(d.mp).toBeGreaterThanOrEqual(mp);
    }
    const info = describeSkill(t, content.classes.defender!.stats, content.formulas);
    expect(info.cost).toBe('Free');
    expect(info.cooldown).toBe('None');
  });
});

describe('Resurrection: %30 can/mana + 2 tur %10 yenilenme', () => {
  const setup = (mode: BattleMode) => {
    const b = mk({ 0: 'warrior', 2: 'paladin' }, { 0: 'archer' }, mode);
    const p = b.get('party-1')!;
    delete p.passive; // Divine Light (aynı kaynaktan şifa) karışmasın
    return b;
  };

  it('veri ve açıklama', () => {
    const r = reviveEffect();
    expect(r.hpRatio).toBe(0.3);
    expect(r.mpRatio).toBe(0.3);
    expect(r.regen).toEqual({ turns: 2, ratio: 0.1 });
    const info = describeSkill(content.skills.resurrection!, content.classes.paladin!.stats, content.formulas);
    expect(info.lines.join(' ')).toContain('30% HP and 30% MP');
    expect(info.lines.join(' ')).toContain('regenerates 10% of its max HP');
    expect(info.lines.join(' ')).toContain('next 2 turns');
  });

  it('turns: dirilen birim sonraki 2 turunun başında maks canın %10ui kadar iyileşir, sonra biter; can maks\'ı aşmaz; Resilience uygulanmaz', () => {
    const b = setup('turns');
    const w = b.get('party-0')!;
    const { hpRatio, regen } = reviveEffect();
    b.debugKill('party-0', false);
    waitTurn(b, 'party-1');
    const ev = b.useSkill('party-1', 'resurrection', 'party-0');
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    expect(w.hp).toBe(Math.round(w.maxHp * hpRatio));
    expect(ofType(ev.events, 'status')).toEqual([expect.objectContaining({ target: 'party-0', status: 'regen', turns: regen.turns, source: 'party-1', cause: 'revival' })]);
    expect(ev.events.some((e) => e.type === 'passive' && e.name === 'Resilience')).toBe(false);
    const per = Math.round(w.maxHp * regen.ratio);
    const ticks: number[] = [];
    const start = b.log.length;
    // 1. tik
    waitTurn(b, 'party-0');
    const tick = () => b.log.slice(start).filter((e): e is Extract<BattleEvent, { type: 'heal' }> => e.type === 'heal' && e.target === 'party-0' && e.source === 'party-1');
    ticks.push(...tick().map((e) => e.amount));
    expect(ticks).toEqual([per]);
    // 2. tik: can maks'a yakınken yalnızca eksik kadar
    w.hp = w.maxHp - 3;
    b.skipTurn();
    waitTurn(b, 'party-0');
    expect(tick().map((e) => e.amount)).toEqual([per, 3]);
    expect(w.hp).toBeLessThanOrEqual(w.maxHp);
    expect(w.statuses.some((s) => s.kind === 'regen')).toBe(false);
    expect(b.log.slice(start).some((e) => e.type === 'statusEnd' && e.target === 'party-0' && e.status === 'regen')).toBe(true);
    // 3. tur: yenilenme yok
    w.hp = 10;
    b.skipTurn();
    waitTurn(b, 'party-0');
    expect(tick()).toHaveLength(2);
  });

  it('test modu: diriltme ve durum uygulanır, çökme yok', () => {
    const b = setup('test');
    b.debugKill('party-0', false);
    const r = b.useSkill('party-1', 'resurrection', 'party-0');
    expect(r.ok).toBe(true);
    expect(b.get('party-0')!.statuses).toEqual([expect.objectContaining({ kind: 'regen', cause: 'revival', amount: Math.round(b.get('party-0')!.maxHp * reviveEffect().regen.ratio) })]);
  });
});

describe('Sharpshooter perRow ve açıklama', () => {
  it('perRow veriden (0,08) ve açıklamada', () => {
    const p = content.classes.archer!.passive!;
    expect((p.effect as { perRow: number }).perRow).toBe(0.08);
    expect(describePassive(p, content.classes.archer!.stats, content.formulas)).toContain('+8% damage for every row');
  });
});

describe('hasar olayı kaynak alanları (UI yazı/ikon)', () => {
  it('skill vuruşu: origin skill, element, damageType, crit boolean', () => {
    const b = mk({ 0: 'mage' }, { 0: 'warrior' });
    b.debug.dodge = 'never';
    const r = b.useSkill('party-0', 'fire_bolt', 'enemy-0');
    expect(r.ok).toBe(true);
    const d = r.ok ? ofType(r.events, 'damage')[0]! : undefined;
    expect(d).toMatchObject({ origin: 'skill', element: 'fire', damageType: 'magic' });
    expect(typeof d!.crit).toBe('boolean');
    const w = mk({ 0: 'warrior' }, { 0: 'archer' });
    w.debug.dodge = 'never';
    const r2 = w.useSkill('party-0', 'melee_attack', 'enemy-0');
    expect(r2.ok && ofType(r2.events, 'damage')[0]).toMatchObject({ origin: 'skill', element: 'physical', damageType: 'physical' });
  });

  it('yer etkisi tiki: origin ground, ground türü, groundId, element (zehir = nature)', () => {
    const b = mk({ 0: 'undead' }, { 0: 'warrior' }, 'turns');
    const target = b.get('enemy-0')!;
    b.ground.push({ id: 'gx', ground: 'poison', board: 'enemy', slots: [target.slot], turns: 5, source: 'party-0', sourceSide: 'party', amount: 10 });
    const start = b.log.length;
    for (let i = 0; i < 50 && !b.log.slice(start).some((e) => e.type === 'turnStart' && e.actor === 'enemy-0'); i++) b.skipTurn();
    const tick = b.log.slice(start).find((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.target === 'enemy-0');
    expect(tick).toMatchObject({ origin: 'ground', ground: 'poison', groundId: 'gx', element: content.grounds.poison!.element, damageType: 'magic', crit: false });
  });

  it('kendine hasar: origin self (generic selfDamage etkisi; madde 262 sonrası hiçbir oyun skilli kullanmıyor: test kopyası)', () => {
    const setup = content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior' }), enemies: cells({ 0: 'archer' }) }, false);
    const cry = setup.skills.abyssal_cry!;
    setup.skills = { ...setup.skills, abyssal_cry: { ...cry, effects: [{ type: 'selfDamage', ratio: 0.15 }, ...cry.effects] } };
    const b = new Battle(setup);
    b.get('party-0')!.rage = 100;
    const r = b.useSkill('party-0', 'abyssal_cry');
    expect(r.ok).toBe(true);
    if (r.ok) expect(ofType(r.events, 'damage').filter((e) => e.target === 'party-0')[0]).toMatchObject({ origin: 'self' });
  });
});
