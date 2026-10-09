import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode, StatusDef } from '../src/engine';

/**
 * Madde 284 (Ömer'in Endless hata bildirimi): düşmanda arka sırada tek Undead + önüne çağrılmış Skeleton varken Warrior'ın Double Strike'ı
 * Undead'e vurabildi. Çağrı ön sırayı doğru dolduruyordu (ör. sıra 0); sızıntı Abyssal Fury'nin +1 menziliydi: menzil "bir sonraki DOLU sıra"
 * sayıldığı için +1, aradaki boş sıraları atlayıp sıra 3'teki Undead'e ulaşıyordu. Kural artık: en öndeki meleeRows dolu sıra + reach MUTLAK sıra
 * (battle.meleeRowLimit). Menzil eki yokken davranış değişmedi.
 */
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const FURY = (content.skills.abyssal_cry!.effects.find((e) => e.type === 'status') as { status: string }).status;
const reachBonus = (content.statuses[FURY] as StatusDef).reachBonus!;
const lanes = content.formulas.formation.lanes;

function mk(enemies: Record<number, string>, mode: BattleMode = 'test'): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells({ 0: 'warrior', 1: 'paladin' }), enemies: cells(enemies) }, false));
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, surviveChance: 0 });
    c.maxHp = Math.max(c.maxHp, 500);
    c.hp = c.maxHp;
    if (c.maxRage !== undefined) c.rage = c.maxRage;
  }
  b.debugClearCooldowns();
  return b;
}
const warrior = (b: Battle) => b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
const enemyOf = (b: Battle, id: string) => b.combatants.find((c) => c.side === 'enemy' && c.defId === id && c.hp > 0)!;
const targets = (b: Battle, skill = 'melee_attack') => b.validTargets(warrior(b).uid, skill).map((c) => c.defId).sort();

describe('melee menzili: çağrılmış Skeleton önde, Undead arkada (madde 284)', () => {
  const backSlot = 3 * lanes; // sıra 3 (en arka), şerit 0

  it('Raise Dead ile çağrılan Skeleton ön sırayı tutar: Double Strike yalnızca Skeleton\'a; Undead "Out of reach", vuruş reddedilir', () => {
    const b = mk({ [backSlot]: 'undead' });
    const undead = enemyOf(b, 'undead');
    expect(b.useSkill(undead.uid, 'raise_dead', undefined, 0).ok).toBe(true);
    const skel = enemyOf(b, 'skeleton');
    expect(skel).toMatchObject({ board: 'enemy', slot: 0, summoned: true });
    expect(targets(b)).toEqual(['skeleton']);
    expect(b.targetProblem(warrior(b).uid, 'melee_attack', undead.uid)).toBe('Out of reach');
    expect(b.useSkill(warrior(b).uid, 'melee_attack', undead.uid)).toMatchObject({ ok: false, reason: 'Invalid target' });
    const r = b.useSkill(warrior(b).uid, 'melee_attack', skel.uid);
    if (!r.ok) throw new Error(r.reason);
    expect(new Set(ofType(r.events, 'damage').map((e) => e.target))).toEqual(new Set([skel.uid]));
  });

  it('UnitSetup ile doğrudan konan (summoned) Skeleton da ön sırayı tutar', () => {
    const b = mk({ 0: 'skeleton', [backSlot]: 'undead' });
    expect(enemyOf(b, 'skeleton').summoned).toBe(true);
    expect(targets(b)).toEqual(['skeleton']);
  });

  it('Abyssal Fury (+1 menzil) boş sıraları atlamaz: sıra 0 Skeleton, sıra 3 Undead -> yalnızca Skeleton; önizleme ve YZ de aynı', () => {
    const b = mk({ 0: 'skeleton', [backSlot]: 'undead' });
    const w = warrior(b);
    expect(b.useSkill(w.uid, 'abyssal_cry').ok).toBe(true);
    expect(b.reachOf(w, content.skills.melee_attack!)).toBe(reachBonus);
    const undead = enemyOf(b, 'undead');
    expect(targets(b)).toEqual(['skeleton']);
    expect(targets(b, 'whirlwind')).toEqual(['skeleton']);
    expect(b.reachOf(w, content.skills.whirlwind!)).toBe(0); // Whirlwind Fury menzilini almaz
    expect(b.targetProblem(w.uid, 'melee_attack', undead.uid)).toBe('Out of reach');
    expect(b.useSkill(w.uid, 'melee_attack', undead.uid).ok).toBe(false);
    // Önizleme yalnızca geçerli hedefi gösterir (UI hedef hücreleri validTargets'tan gelir)
    expect(previewSkill(b, w.uid, 'melee_attack', enemyOf(b, 'skeleton').uid)[0]?.damage).toBeDefined();
    // YZ (aynı Warrior'ı oynasa) Undead'i melee ile seçmez
    const choice = chooseAction(b, w.uid, content.aiConfig);
    if (choice && content.skills[choice.skillId]?.motion === 'melee' && !content.skills[choice.skillId]?.ignoreReach) expect(choice.targetUid).not.toBe(undead.uid);
  });

  it('Abyssal Fury hâlâ ön sıranın hemen arkasına ulaşır (sıra 0 + sıra 1); 2 sıra gerisine ulaşmaz', () => {
    const b = mk({ 0: 'skeleton', [lanes]: 'mage', [2 * lanes]: 'undead' });
    const w = warrior(b);
    expect(targets(b)).toEqual(['skeleton']);
    expect(b.useSkill(w.uid, 'abyssal_cry').ok).toBe(true);
    expect(targets(b)).toEqual(['mage', 'skeleton']);
  });

  it('ön sıra boşken taban kural değişmedi: en öndeki DOLU sıra vurulur (sıra 3 tek başına)', () => {
    const b = mk({ [backSlot]: 'undead' });
    expect(targets(b)).toEqual(['undead']);
  });

  it('YZ meleeIncoming kuralı validTargets ile aynı: inMeleeReach', () => {
    const b = mk({ 0: 'skeleton', [backSlot]: 'undead' });
    const undead = enemyOf(b, 'undead');
    expect(b.inMeleeReach(undead.uid, 0)).toBe(false);
    expect(b.inMeleeReach(undead.uid, reachBonus)).toBe(false);
    expect(b.inMeleeReach(enemyOf(b, 'skeleton').uid, 0)).toBe(true);
    expect(b.inMeleeReach(undead.uid, 0, lanes)).toBe(false); // varsayımsal sıra 1: 0 menzilde değil
    expect(b.inMeleeReach(undead.uid, 1, lanes)).toBe(true); // +1 menzille sıra 1'e ulaşılır
  });
});

describe('Abyssal Fury menzili Whirlwind üzerinde işlemez (madde 284, Ömer 2026-10-09)', () => {
  it('Fury varken Whirlwind yalnızca ön sırayı vurur (2. sıra değil); Double Strike 2. sıraya ulaşır; Whirlwind yine 1 yük düşürür ve STR ekini alır', () => {
    const b = mk({ 0: 'skeleton', [lanes]: 'mage', [lanes + 1]: 'archer' });
    const w = warrior(b);
    expect(b.useSkill(w.uid, 'abyssal_cry').ok).toBe(true);
    const fury = () => w.statuses.find((s) => s.kind === FURY);
    const before = fury()!.turns;
    expect(targets(b)).toEqual(['archer', 'mage', 'skeleton']);
    expect(targets(b, 'whirlwind')).toEqual(['skeleton']);
    expect(content.skills.whirlwind!.ignoreReachBonus).toBe(true);
    expect(b.attackStats(w).str).toBeGreaterThan(w.stats.str); // STR eki Fury'den (Whirlwind hasarına da işler)
    const pv = previewSkill(b, w.uid, 'whirlwind', enemyOf(b, 'skeleton').uid);
    expect(pv.map((p) => p.uid)).not.toContain(enemyOf(b, 'mage').uid);
    const r = b.useSkill(w.uid, 'whirlwind');
    if (!r.ok) throw new Error(r.reason);
    expect(new Set(ofType(r.events, 'damage').map((e) => e.target))).toEqual(new Set([enemyOf(b, 'skeleton').uid]));
    expect(fury()?.turns).toBe(before - 1);
  });

  it('Fury, Whirlwind için kendi sıra kuralını da gevşetmez: önünde dost varken (2. sıra) Whirlwind kullanılamaz, Double Strike kullanılabilir', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'paladin', 3: 'warrior' }), enemies: cells({ 0: 'defender' }) }, false));
    const w = warrior(b);
    w.rage = w.maxRage!;
    w.mp = w.maxMp;
    expect(b.useSkill(w.uid, 'abyssal_cry').ok).toBe(true);
    expect(b.canUse(w.uid, 'melee_attack').ok).toBe(true);
    expect(b.canUse(w.uid, 'whirlwind')).toEqual({ ok: false, reason: 'Melee: front row only' });
  });
});
