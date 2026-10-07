import { describe, expect, it } from 'vitest';
import { Battle, content } from '../src/engine';
import type { BattleEvent } from '../src/engine';
import { backRaiseFlow, corpseHoverTip, pickCorpse, pickSlot, raiseFlowHint, reconcileRaiseFlow, slotHoverTip, startRaiseFlow } from '../src/game/raise-dead-flow';
import type { RaiseFlow, RaiseInputs } from '../src/game/raise-dead-flow';

// Raise Dead iki adımlı seçim durum makinesi (madde 230): adım 1 ceset -> adım 2 yuva -> cast; ceset yok -> tek adım; geri alma; geçersiz girdiler.
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

// party: Cutthroat(0), Undead(3); enemy: Warrior(0), Defender(1), Mage(4)
function mk(): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat', 3: 'undead' }), enemies: cells({ 0: 'warrior', 1: 'defender', 4: 'mage' }) }, false));
  b.freeMp = true;
  return b;
}
const inputs = (b: Battle): RaiseInputs => ({ choices: b.corpseChoices('party-1', 'raise_dead'), slots: b.summonSlots('party-1', 'raise_dead') });
const state = (r: ReturnType<typeof pickCorpse>): RaiseFlow => {
  if (r.kind !== 'state') throw new Error(`state bekleniyordu: ${r.kind}`);
  return r.flow;
};

describe('Raise Dead akışı: ceset varken iki adım', () => {
  it('adım 1 -> ceset seç -> adım 2 -> yuva seç -> cast; seçilen ceset tüketilir, diğeri diriltilebilir kalır', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    const inp = inputs(b);
    let flow = startRaiseFlow(inp)!;
    expect(flow).toEqual({ step: 'corpse', twoStep: true });
    expect(raiseFlowHint(flow).step).toBe('Step 1/2');
    expect(raiseFlowHint(flow).text).toBe('Choose a corpse to consume');
    // ceset adımında yuvaya tıklamak geçersiz
    expect(pickSlot(flow, inp, inp.slots[0]!).kind).toBe('invalid');
    flow = state(pickCorpse(flow, inp, 'enemy-1'));
    expect(flow).toEqual({ step: 'slot', twoStep: true, corpseUid: 'enemy-1' });
    expect(raiseFlowHint(flow).step).toBe('Step 2/2');
    const slot = inp.slots[inp.slots.length - 1]!;
    const act = pickSlot(flow, inp, slot);
    expect(act).toEqual({ kind: 'cast', slot, corpseUid: 'enemy-1' });
    if (act.kind !== 'cast') return;
    const r = b.useSkill('party-1', 'raise_dead', undefined, act.slot, undefined, act.corpseUid);
    expect(r.ok).toBe(true);
    const events = r.ok ? r.events : [];
    expect(ofType(events, 'corpseConsumed')[0]!.uid).toBe('enemy-1');
    const summon = ofType(events, 'summon')[0]!.combatant;
    expect(summon.slot).toBe(slot);
    expect(b.corpseOf('enemy-0')?.state).toBe('revivable'); // diğer ceset diriltilebilir kalır
    expect(b.corpseOf('enemy-1')?.state).toBe('consumed');
  });

  it('Esc geri alma: seçili ceset -> adım 1; adım 1 Esc skill iptal; seçili cesede tekrar tık adım 1 döner', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    const inp = inputs(b);
    const chosen = state(pickCorpse(startRaiseFlow(inp)!, inp, 'enemy-0'));
    expect(state(backRaiseFlow(chosen))).toEqual({ step: 'corpse', twoStep: true });
    expect(backRaiseFlow({ step: 'corpse', twoStep: true }).kind).toBe('cancel'); // iki Esc = iptal
    expect(state(pickCorpse(chosen, inp, 'enemy-0'))).toEqual({ step: 'corpse', twoStep: true }); // seçili cesede tekrar tık
    // başka cesede tık: doğrudan ona geç
    expect(state(pickCorpse(chosen, inp, 'enemy-1')).corpseUid).toBe('enemy-1');
  });

  it('geçersiz ceset ve yuva: tüketilmiş ceset, ölü dost yuvası, dolu yuva, olmayan uid', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    expect(b.useSkill('party-1', 'raise_dead', undefined, undefined, undefined, 'enemy-0').ok).toBe(true); // enemy-0 tüketildi
    b.debugKill('party-0', false); // ölü dost: yuvası ayrılır
    const inp = inputs(b);
    expect(inp.choices.map((c) => c.uid)).toEqual(['enemy-1']);
    const flow0 = startRaiseFlow(inp)!;
    const consumed = pickCorpse(flow0, inp, 'enemy-0', new Set(['enemy-0']));
    expect(consumed).toEqual({ kind: 'invalid', reason: 'Corpse was consumed' });
    expect(pickCorpse(flow0, inp, 'nobody')).toEqual({ kind: 'invalid', reason: 'Invalid corpse' });
    const flow = state(pickCorpse(flow0, inp, 'enemy-1'));
    expect(pickSlot(flow, inp, b.get('party-0')!.slot).kind).toBe('invalid'); // ölü dostun ayrılmış yuvası summonSlots'ta yok
    expect(pickSlot(flow, inp, b.get('party-1')!.slot).kind).toBe('invalid'); // dolu yuva
    expect(inp.slots).not.toContain(b.get('party-0')!.slot);
    // motor da aynı kuralı uygular
    expect(b.useSkill('party-1', 'raise_dead', undefined, b.get('party-0')!.slot, undefined, 'enemy-1').ok).toBe(false);
  });

  it('seçili ceset sonradan seçilemez olursa adım 1 düşer; ceset kalmazsa tek adıma geçer; yuva kalmazsa akış biter', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    const inp = inputs(b);
    const flow = state(pickCorpse(startRaiseFlow(inp)!, inp, 'enemy-0'));
    expect(reconcileRaiseFlow(flow, inp)).toEqual(flow);
    expect(reconcileRaiseFlow(flow, { choices: [], slots: inp.slots })).toEqual({ step: 'slot', twoStep: false });
    expect(reconcileRaiseFlow({ step: 'slot', twoStep: false }, inp)).toEqual({ step: 'corpse', twoStep: true });
    expect(reconcileRaiseFlow(flow, { choices: inp.choices, slots: [] })).toBeNull();
  });
});

describe('Raise Dead akışı: ceset yokken tek adım', () => {
  it('yalnızca yuva seçilir, beslenmemiş Skeleton gelir, corpseUid verilmez', () => {
    const b = mk();
    const inp = inputs(b);
    expect(inp.choices).toEqual([]);
    const flow = startRaiseFlow(inp)!;
    expect(flow).toEqual({ step: 'slot', twoStep: false });
    expect(raiseFlowHint(flow).step).toBe('');
    expect(raiseFlowHint(flow).text).toContain('where');
    expect(pickCorpse(flow, inp, 'enemy-0').kind).toBe('invalid');
    expect(backRaiseFlow(flow).kind).toBe('cancel'); // tek adımda Esc doğrudan iptal
    const slot = inp.slots[0]!;
    const act = pickSlot(flow, inp, slot);
    expect(act).toEqual({ kind: 'cast', slot });
    const r = b.useSkill('party-1', 'raise_dead', undefined, slot);
    expect(r.ok).toBe(true);
    const events = r.ok ? r.events : [];
    expect(ofType(events, 'corpseConsumed')).toHaveLength(0);
    expect(ofType(events, 'summon')[0]!.combatant.slot).toBe(slot);
  });

  it('boş yuva yok: akış başlamaz (null); motor da reddeder', () => {
    expect(startRaiseFlow({ choices: [], slots: [] })).toBeNull();
    expect(startRaiseFlow({ choices: [{ uid: 'x', slot: 0, name: 'X', danger: 1, why: '' }], slots: [] })).toBeNull();
  });
});

describe('Raise Dead akışı: motor sözleşmesi ve tooltip metinleri', () => {
  it('ceset varken corpseUid vermeden cast edilemez (motor hatası); tooltip içerikleri', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    const slot = b.summonSlots('party-1', 'raise_dead')[0]!;
    const bad = b.useSkill('party-1', 'raise_dead', undefined, slot);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('Choose a corpse to consume');
    const c = b.corpseChoices('party-1', 'raise_dead')[0]!;
    const sp = b.summonPreview('party-1', 'raise_dead', c.uid, slot);
    expect(sp.empowered).toBe(true);
    expect(sp.slot).toBe(slot);
    const tip = corpseHoverTip(c, { unitName: sp.unit!.name, hp: sp.unit!.stats.hp });
    expect(tip.title).toBe(`Consume ${c.name}'s corpse (danger ${c.danger})`);
    expect(tip.rows[0]!.text).toBe(c.why);
    expect(tip.rows.some((r) => r.text === `Empowered ${sp.unit!.name} HP ${sp.unit!.stats.hp}`)).toBe(true);
    const st = slotHoverTip({ unitName: 'Skeleton', hp: 105, empowered: true, corpseName: c.name, row: 0, reserved: false });
    expect(st.rows.map((r) => r.text)).toEqual(['Empowered Skeleton HP 105', `Consumes ${c.name}'s corpse`, 'Row 1 (front)', 'Click to raise it here']);
    expect(slotHoverTip({ unitName: 'Skeleton', hp: 70, empowered: false, corpseName: null, row: 2, reserved: false }).rows[0]!.text).toBe('Unfed Skeleton HP 70');
    expect(slotHoverTip({ unitName: 'Skeleton', hp: 70, empowered: false, corpseName: null, row: 2, reserved: true }).title).toBe('Reserved cell');
    // ceset olmayan çağrı (ör. Treant): ceset adımı yok
    expect(slotHoverTip({ unitName: 'Treant', hp: 90, empowered: undefined, corpseName: null, row: 3, reserved: false }).rows[0]!.text).toBe('Treant HP 90');
  });
});
