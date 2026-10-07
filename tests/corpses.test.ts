import { describe, expect, it } from 'vitest';
import { Battle, MatchLog, applySummonVariant, chooseAction, content, describeSkill, explainChoice, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode } from '../src/engine';

/**
 * Ceset sistemi + Raise Dead (madde 222, 230): ölen (çağrı olmayan) birim ceset bırakır (revivable); Undead'in Raise Dead'i Skeleton'ı KENDİ tarafına
 * çağırır ve karşı taraftaki SEÇİLEN diriltilebilir cesedi tüketir (oyuncu corpseUid ile seçer; YZ en tehlikelisini; consumed: artık diriltilemez,
 * yuvası rezerve değil) -> beslenmiş (fed) Skeleton; ceset yoksa beslenmemiş (unfed). Sayılar veriden okunur (skeleton.json variants).
 */
const ai = content.aiConfig;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

// party-0 Warrior(0), party-1 Undead(3), party-2 Paladin(4); enemy-0 Warrior(0), enemy-1 Defender(1), enemy-2 Paladin(3), enemy-3 Undead(4)
function mk(mode: BattleMode = 'test', seed = 1): Battle {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party: cells({ 0: 'warrior', 3: 'undead', 4: 'paladin' }), enemies: cells({ 0: 'warrior', 1: 'defender', 3: 'paladin', 4: 'undead' }) }, false));
  b.freeMp = true;
  return b;
}
const act = (b: Battle, actor: string, skill: string, target?: string, slot?: number, corpse?: string): BattleEvent[] => {
  const r = b.useSkill(actor, skill, target, slot, undefined, corpse);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
};
const skeletonDef = content.summons.skeleton!;
const variants = skeletonDef.variants!;

describe('cesetler: durumlar ve olaylar', () => {
  it('ölen birim revivable ceset bırakır (death olayı corpse: true); canlıda ceset yok', () => {
    const b = mk();
    expect(b.corpseOf('enemy-0')).toBeNull();
    b.debugKill('enemy-0', false);
    expect(b.log.filter((e) => e.type === 'death').at(-1)).toMatchObject({ target: 'enemy-0', corpse: true });
    expect(b.corpseOf('enemy-0')).toEqual({ uid: 'enemy-0', slot: 0, side: 'enemy', state: 'revivable' });
    expect(b.corpses('enemy').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(b.corpses('party')).toEqual([]);
  });

  it('çağrılar ceset bırakmaz; sahibi ölünce ölen çağrı da ceset bırakmaz', () => {
    const b = mk();
    const sk = ofType(act(b, 'party-1', 'raise_dead'), 'summon')[0]!.combatant.uid;
    b.debugKill(sk, false);
    expect(b.corpseOf(sk)).toBeNull();
    const c = mk();
    const sk2 = ofType(act(c, 'party-1', 'raise_dead'), 'summon')[0]!.combatant.uid;
    c.debugKill('party-1', false);
    expect(c.get(sk2)!.hp).toBe(0);
    expect(c.corpseOf(sk2)).toBeNull();
    expect(c.log.filter((e) => e.type === 'death' && e.target === sk2).at(-1)).toMatchObject({ corpse: false });
    expect(c.corpses('party').map((x) => x.uid)).toEqual(['party-1']);
  });

  it('dirilen birimin cesedi biter; tekrar ölünce yeni revivable ceset', () => {
    const b = mk();
    b.debugKill('party-0', false);
    act(b, 'party-2', 'resurrection', 'party-0');
    expect(b.corpseOf('party-0')).toBeNull();
    b.debugKill('party-0', false);
    expect(b.corpseOf('party-0')?.state).toBe('revivable');
  });
});

describe('Raise Dead: kendi tarafına çağrı + ceset tüketimi', () => {
  it('veri: onEnemyBoard yok, consumeCorpse var; MP/cooldown/ömür önceki gibi veriden', () => {
    const e = content.skills.raise_dead!.effects.find((x) => x.type === 'summon')!;
    expect(e).toMatchObject({ unit: 'skeleton', lifespan: 4, consumeCorpse: true });
    expect((e as Record<string, unknown>).onEnemyBoard).toBeUndefined();
  });

  it('Skeleton Undead\'in KENDİ tahtasına, seçilen boş yuvaya çağrılır; dolu/yanlış yuva reddedilir', () => {
    const b = mk();
    expect(b.summonBoard('party-1', 'raise_dead')).toBe('party');
    expect(b.freeSlots('party')).not.toContain(0);
    expect(b.useSkill('party-1', 'raise_dead', undefined, 0)).toEqual({ ok: false, reason: 'Invalid slot' });
    const ev = ofType(act(b, 'party-1', 'raise_dead', undefined, 1), 'summon')[0]!;
    expect(ev.combatant).toMatchObject({ side: 'party', board: 'party', slot: 1, name: 'Skeleton', summoned: true, owner: 'party-1' });
  });

  it('yuva yoksa "No free slot"', () => {
    const all = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === 3 ? 'undead' : 'warrior']));
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells(all), enemies: cells({ 0: 'warrior' }) }, false));
    expect(b.canUse('party-3', 'raise_dead')).toEqual({ ok: false, reason: 'No free slot' });
  });

  it('düşman cesedi yoksa beslenmemiş (unfed): can ve STR veri çarpanıyla (~-%33), corpseConsumed yok', () => {
    const b = mk();
    const ev = act(b, 'party-1', 'raise_dead');
    expect(ofType(ev, 'corpseConsumed')).toHaveLength(0);
    const s = ofType(ev, 'summon')[0]!;
    expect(s.empowered).toBe(false);
    expect(s.combatant.empowered).toBe(false);
    const unfed = applySummonVariant(skeletonDef, 'unfed').stats;
    expect(s.combatant.maxHp).toBe(Math.round(skeletonDef.stats.hp * variants.unfed.mult));
    expect(s.combatant.maxHp).toBe(unfed.hp);
    expect(s.combatant.stats.str).toBe(Math.round(skeletonDef.stats.str * variants.unfed.mult * 10) / 10);
    expect(variants.unfed.mult).toBeCloseTo(0.67, 5);
  });

  it('düşman cesedi varsa tüketir: corpseConsumed olayı, ceset consumed, Skeleton beslenmiş (fed) = veri dosyasındaki mevcut değerler', () => {
    const b = mk();
    b.debugKill('enemy-1', false);
    const ev = act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-1');
    expect(ofType(ev, 'corpseConsumed')).toEqual([{ type: 'corpseConsumed', uid: 'enemy-1', by: 'party-1', slot: 1, side: 'enemy' }]);
    // olay sırası: önce tüketim, sonra çağrı
    expect(ev.findIndex((e) => e.type === 'corpseConsumed')).toBeLessThan(ev.findIndex((e) => e.type === 'summon'));
    expect(b.corpseOf('enemy-1')?.state).toBe('consumed');
    const s = ofType(ev, 'summon')[0]!;
    expect(s.empowered).toBe(true);
    expect(variants.fed.mult).toBe(1);
    expect(s.combatant.maxHp).toBe(skeletonDef.stats.hp);
    expect(s.combatant.stats.str).toBe(skeletonDef.stats.str);
    expect(s.combatant.stats.armor).toBe(skeletonDef.stats.armor);
    // beslenmiş / beslenmemiş oranı veriyle tutarlı (~+%50)
    const unfed = applySummonVariant(skeletonDef, 'unfed').stats;
    expect(s.combatant.maxHp / unfed.hp).toBeGreaterThan(1.45);
    expect(s.combatant.maxHp / unfed.hp).toBeLessThan(1.55);
  });

  it('oyuncu cesedi seçer: iki cesetten seçilen tüketilir, diğeri revivable kalır; kendi tarafındaki ceset aday değil', () => {
    const b = mk();
    b.debugKill('party-0', false); // kendi ölüsü: aday değil
    b.debugKill('enemy-2', false);
    b.debugKill('enemy-0', false);
    expect(b.corpseChoices('party-1', 'raise_dead').map((c) => [c.uid, c.slot, c.name])).toEqual([['enemy-0', 0, 'Warrior'], ['enemy-2', 3, 'Paladin']]);
    expect(b.needsCorpseChoice('party-1', 'raise_dead')).toBe(true);
    // en son ölen enemy-0 değil, oyuncunun seçtiği enemy-2 tüketilir (eski otomatik kural kalktı)
    const ev = act(b, 'party-1', 'raise_dead', undefined, 1, 'enemy-2');
    expect(b.corpseOf('enemy-2')?.state).toBe('consumed');
    expect(b.corpseOf('enemy-0')?.state).toBe('revivable');
    expect(b.corpseOf('party-0')?.state).toBe('revivable');
    expect(ofType(ev, 'skillUsed')[0]).toMatchObject({ skill: 'raise_dead', slot: 1, corpseUid: 'enemy-2' });
    expect(b.corpseChoices('party-1', 'raise_dead').map((c) => c.uid)).toEqual(['enemy-0']);
  });

  it('ceset varken corpseUid zorunlu ("Choose a corpse to consume"); geçersiz/kendi ceset reddedilir; ceset yokken verilen corpseUid yok sayılır', () => {
    const b = mk();
    b.debugKill('enemy-1', false);
    b.debugKill('party-0', false);
    expect(b.useSkill('party-1', 'raise_dead', undefined, 1)).toEqual({ ok: false, reason: 'Choose a corpse to consume' });
    expect(b.useSkill('party-1', 'raise_dead', undefined, 1, undefined, 'party-0')).toEqual({ ok: false, reason: 'Invalid corpse' });
    expect(b.useSkill('party-1', 'raise_dead', undefined, 1, undefined, 'enemy-2')).toEqual({ ok: false, reason: 'Invalid corpse' }); // canlı
    expect(b.corpseOf('enemy-1')?.state).toBe('revivable'); // reddedilen deneme hiçbir şeyi değiştirmez
    expect(b.log.some((e) => e.type === 'skillUsed')).toBe(false);
    // ceset yok: yalnızca yuva; verilen corpseUid yok sayılır (beslenmemiş)
    const c = mk();
    const ev = act(c, 'party-1', 'raise_dead', undefined, 2, 'enemy-0');
    expect(ofType(ev, 'corpseConsumed')).toHaveLength(0);
    expect(ofType(ev, 'summon')[0]).toMatchObject({ empowered: false });
    expect(ofType(ev, 'skillUsed')[0]!.corpseUid).toBeUndefined();
    expect(c.needsCorpseChoice('party-1', 'raise_dead')).toBe(false);
  });

  it('summonSlots (madde 257, Faz 4): kendi tahtasındaki TÜM boş yuvalar; ölü dostun cesedinin üstüne de çağrılır, dost yine diriltilebilir', () => {
    const b = mk();
    b.debugKill('party-0', false); // party-0 (Warrior) yuva 0'da düştü
    expect(b.fallenSlots('party')).toEqual([0]); // bilgi amaçlı (madde 258: Move da girebilir)
    expect(b.freeTiles('party-2')).toContain(0);
    expect(b.summonSlots('party-1', 'raise_dead')).toEqual(b.freeSlots('party'));
    expect(b.summonSlots('party-1', 'raise_dead')).toContain(0);
    const sk = ofType(act(b, 'party-1', 'raise_dead', undefined, 0), 'summon')[0]!.combatant;
    expect(sk.slot).toBe(0); // Skeleton cesedin üstünde
    expect(b.validTargets('party-2', 'resurrection').map((c) => c.uid)).toEqual(['party-0']); // ceset hâlâ diriltilebilir
    const ev = act(b, 'party-2', 'resurrection', 'party-0'); // hücre verilmezse en yakın boş hücre
    const rv = ofType(ev, 'revive')[0]!;
    expect(rv.from).toBe(0);
    expect(rv.slot).not.toBe(0);
    expect(b.get('party-0')!.slot).toBe(rv.slot);
    expect(b.summonSlots('party-1', 'bone_throw')).toEqual([]); // çağrı değil
  });

  it('düşman Undead de aynı kuralla oyuncunun cesedini tüketir (iki taraf)', () => {
    const b = mk();
    b.debugKill('party-0', false);
    const ev = act(b, 'enemy-3', 'raise_dead', undefined, undefined, 'party-0');
    expect(ofType(ev, 'corpseConsumed')[0]).toMatchObject({ uid: 'party-0', by: 'enemy-3', side: 'party' });
    expect(ofType(ev, 'summon')[0]!.combatant.board).toBe('enemy');
  });

  it('önizleme ve açıklama: beslenmiş/beslenmemiş hâl ve iki stat hâli', () => {
    const b = mk();
    expect(previewSkill(b, 'party-1', 'raise_dead')[0]!.summon).toMatchObject({ unit: 'skeleton', empowered: false, corpse: null });
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-2', false);
    // seçilmeden: YZ önerisi (en tehlikeli); seçilince: seçilen ceset + seçilen yuva
    const top = b.corpseChoices('party-1', 'raise_dead').reduce((x, y) => (y.danger > x.danger ? y : x));
    expect(previewSkill(b, 'party-1', 'raise_dead')[0]!.summon).toMatchObject({ empowered: true, corpse: top.uid, hp: skeletonDef.stats.hp });
    expect(previewSkill(b, 'party-1', 'raise_dead', undefined, 2, undefined, 'enemy-0')[0]!.summon).toMatchObject({ empowered: true, corpse: 'enemy-0', slot: 2 });
    expect(b.summonPreview('party-1', 'raise_dead', 'enemy-2', 5)).toMatchObject({ empowered: true, corpse: { uid: 'enemy-2' }, slot: 5 });
    const info = describeSkill(content.skills.raise_dead!, content.classes.undead!.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.join(' ')).toContain('Choose a fallen foe to consume, then choose where the Skeleton rises');
    expect(info.lines.join(' ')).toContain('can no longer be revived');
    expect(info.lines.join(' ')).toContain(`HP ${skeletonDef.stats.hp}`);
    expect(info.lines.join(' ')).toContain(`HP ${applySummonVariant(skeletonDef, 'unfed').stats.hp}`);
  });
});

describe('Resurrection ve tüketilmiş ceset', () => {
  it('tüketilmiş ceset diriltilemez: hedef listesinde yok, nedeni "Corpse was consumed"; revivable olan hâlâ hedef', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-1');
    expect(b.validTargets('enemy-2', 'resurrection').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(b.useSkill('enemy-2', 'resurrection', 'enemy-1')).toEqual({ ok: false, reason: 'Corpse was consumed' });
    expect(b.reviveBlockReason('enemy-2', 'enemy-1')).toBe('Corpse was consumed');
    expect(b.reviveBlockReason('enemy-2', 'enemy-0')).toBeNull();
  });

  it('tüm düşmüşler tüketildiyse canUse nedeni "Corpse was consumed"', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-0');
    expect(b.canUse('enemy-2', 'resurrection')).toEqual({ ok: false, reason: 'Corpse was consumed' });
    expect(previewSkill(b, 'enemy-2', 'resurrection', 'enemy-0')).toEqual([]);
  });

  it('fallenSlots güncel: tüketilmiş cesedin yuvası listeden düşer; Move ceset hücresine her durumda girebilir (madde 258)', () => {
    const b = mk();
    b.debugKill('enemy-1', false);
    expect(b.fallenSlots('enemy')).toEqual([1]);
    expect(b.freeTiles('enemy-0')).toContain(1);
    act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-1');
    expect(b.fallenSlots('enemy')).toEqual([]);
    expect(b.freeTiles('enemy-0')).toContain(1);
    expect(b.useGlobal('enemy-0', 'move_tile', 1).ok).toBe(true);
  });
});

describe('YZ: Undead ve Paladin', () => {
  /** Öldürme önceliği karışmasın: herkes çok canlı. */
  const tough = (b: Battle) => {
    for (const c of b.combatants) if (c.hp > 0) c.hp = c.maxHp = 5000;
    return b;
  };

  it('Undead: düşman cesedi varsa ve Skeleton yoksa Raise Dead (summon, empowered)', () => {
    const b = tough(mk());
    b.debugKill('enemy-1', false);
    expect(chooseAction(b, 'party-1', ai)).toMatchObject({ skillId: 'raise_dead', reason: 'summon', corpseUid: 'enemy-1' });
    const ex = explainChoice(b, 'party-1', ai)!;
    expect(ex.candidates.find((c) => c.skill === 'raise_dead')!.tags).toContain('empowered');
    expect(b.applyChoice('party-1', chooseAction(b, 'party-1', ai)).ok).toBe(true);
    expect(b.corpseOf('enemy-1')?.state).toBe('consumed');
    b.debugKill('enemy-0', false);
    expect(chooseAction(b, 'party-1', ai)?.skillId).not.toBe('raise_dead'); // aynı anda çağrı sınırı (maxSummons)
  });

  it('Undead: ceset yoksa beslenmemiş çağrı yalnızca değeri en iyi başka hamleye yetiyorsa (kural ve açıklama tutarlı); değer beslenmişten düşük', () => {
    const b = tough(mk());
    const ex = explainChoice(b, 'party-1', ai)!;
    const cand = ex.candidates.find((c) => c.skill === 'raise_dead')!;
    expect(cand.tags).toContain('unfed');
    const alt = Math.max(0, ...ex.candidates.filter((c) => c.skill !== 'raise_dead').map((c) => c.net));
    const choice = chooseAction(b, 'party-1', ai)!;
    if (cand.summonValue! - cand.cost >= alt + 0.1) expect(choice.skillId).toBe('raise_dead');
    if (cand.summonValue! - cand.cost <= alt - 0.1) expect(choice.skillId).not.toBe('raise_dead');
    const fed = tough(mk());
    fed.debugKill('enemy-1', false);
    const fedCand = explainChoice(fed, 'party-1', ai)!.candidates.find((c) => c.skill === 'raise_dead')!;
    expect(fedCand.summonValue!).toBeGreaterThan(cand.summonValue!);
  });

  it('Paladin: tüketilmemiş cesedi diriltir, tüketilmişi seçmez', () => {
    const b = tough(mk());
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-1'); // enemy-1 tüketildi
    const c = chooseAction(b, 'enemy-2', ai)!;
    if (c.skillId === 'resurrection') expect(c.targetUid).toBe('enemy-0');
    expect(c).toMatchObject({ skillId: 'resurrection', targetUid: 'enemy-0' });
    act(b, 'enemy-2', 'resurrection', 'enemy-0');
    expect(chooseAction(b, 'enemy-2', ai)?.skillId).not.toBe('resurrection');
  });
});

describe('iki mod, determinizm, maç kaydı', () => {
  it('turns ve test modunda çalışır; aynı seed = aynı olaylar', () => {
    for (const mode of ['test', 'turns'] as const) {
      const run = () => {
        const b = mk(mode, 5);
        b.debugKill('enemy-0', false);
        for (let i = 0; i < 400 && mode === 'turns' && b.currentUid !== 'party-1'; i++) b.skipTurn();
        act(b, 'party-1', 'raise_dead', undefined, undefined, 'enemy-0');
        return JSON.stringify(b.log.filter((e) => e.type !== 'battleStart'));
      };
      const a = run();
      expect(a).toContain('corpseConsumed');
      expect(a).toBe(run());
    }
  });

  it('maç kaydı ceset tüketimini, empowered bilgisini ve çağrı yuvasını yazar', () => {
    const b = mk();
    const log = new MatchLog(b, { version: 'test' });
    b.debugKill('enemy-1', false);
    act(b, 'party-1', 'raise_dead', undefined, 1, 'enemy-1');
    const text = log.serialize();
    expect(text).toContain('consumes the corpse of E1:Defender');
    expect(text).toContain('EMPOWERED');
    expect(text).toContain('own board cell 1');
  });
});
