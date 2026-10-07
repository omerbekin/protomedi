import { describe, expect, it } from 'vitest';
import { Battle, MatchLog, chooseAction, content, describeSkill, explainChoice } from '../src/engine';
import type { BattleEvent, BattleMode } from '../src/engine';
import { backRaiseFlow, pickCorpse, pickSlot, reconcileRaiseFlow, reviveCorpseTip, reviveFlowHint, reviveSlotTip, startRaiseFlow } from '../src/game/raise-dead-flow';
import type { RaiseFlow, RaiseInputs } from '../src/game/raise-dead-flow';

/**
 * Resurrection İKİ ADIMLI (madde 257, Ömer): önce diriltilecek ölü dost, sonra kendi tarafında BOŞ bir hücre; dost o hücrede dirilir. Cesedin üstünde
 * canlı birim (ör. Skeleton) olması engel değil. Boş hücre yoksa kullanılamaz ('No free cell'). Oranlar veriden (skills.json > resurrection).
 */
const ai = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const revive = () => content.skills.resurrection!.effects.find((e) => e.type === 'revive') as { hpRatio: number; mpRatio: number };

// party-0 Warrior(0), party-1 Paladin(1), party-2 Undead(4), party-3 Mage(5); enemy-0 Warrior(0), enemy-1 Archer(1)
function mk(mode: BattleMode = 'test'): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells({ 0: 'warrior', 1: 'paladin', 4: 'undead', 5: 'mage' }), enemies: cells({ 0: 'warrior', 1: 'archer' }) }, false));
  b.freeMp = true;
  return b;
}
const inputs = (b: Battle, actor = 'party-1'): RaiseInputs => ({
  choices: b.validTargets(actor, 'resurrection').map((c) => ({ uid: c.uid, slot: c.slot, name: c.name, danger: 0, why: '' })),
  slots: b.reviveSlots(actor, 'resurrection'),
});
const state = (r: ReturnType<typeof pickCorpse>): RaiseFlow => {
  if (r.kind !== 'state') throw new Error(`state bekleniyordu: ${r.kind}`);
  return r.flow;
};

describe('Resurrection: motor', () => {
  it('iki modda: seçilen ölü dost seçilen boş hücrede dirilir; olaylar hücreyi taşır; ceset kaydı biter', () => {
    for (const mode of ['test', 'turns'] as const) {
      const b = mk(mode);
      b.debugKill('party-0', false);
      if (mode === 'turns') for (let i = 0; i < 200 && b.currentUid !== 'party-1'; i++) b.skipTurn();
      expect(b.reviveSlots('party-1', 'resurrection')).toEqual(b.freeSlots('party'));
      const r = b.useSkill('party-1', 'resurrection', 'party-0', 3);
      expect(r.ok, mode).toBe(true);
      if (!r.ok) continue;
      expect(ofType(r.events, 'skillUsed')[0]).toMatchObject({ skill: 'resurrection', targets: ['party-0'], slot: 3 });
      expect(ofType(r.events, 'revive')[0]).toMatchObject({ target: 'party-0', slot: 3, from: 0 });
      const w = b.get('party-0')!;
      expect(w).toMatchObject({ slot: 3, board: 'party', hp: Math.max(1, Math.round(w.maxHp * revive().hpRatio)) });
      expect(w.turnCounter).toBe(0); // dirilen boş tur sayacıyla başlar
      expect(b.corpseOf('party-0')).toBeNull();
      expect(b.freeSlots('party')).not.toContain(3);
    }
  });

  it('cesedin üstünde Skeleton (canlı birim) varken de diriltilir; dolu hücre reddedilir', () => {
    const b = mk();
    b.debugKill('enemy-1', false);
    b.debugKill('party-0', false);
    const sk = ofType((b.useSkill('party-2', 'raise_dead', undefined, 0, undefined, 'enemy-1') as { ok: true; events: BattleEvent[] }).events, 'summon')[0]!.combatant;
    expect(sk.slot).toBe(0); // Skeleton Warrior'ın cesedinin üstünde (Faz 4)
    expect(b.validTargets('party-1', 'resurrection').map((c) => c.uid)).toEqual(['party-0']);
    expect(b.reviveBlockReason('party-1', 'party-0')).toBeNull();
    expect(b.useSkill('party-1', 'resurrection', 'party-0', 0)).toEqual({ ok: false, reason: 'That cell is not free' });
    expect(b.useSkill('party-1', 'resurrection', 'party-0', 1)).toEqual({ ok: false, reason: 'That cell is not free' });
    const r = b.useSkill('party-1', 'resurrection', 'party-0', 2);
    expect(r.ok).toBe(true);
    expect(b.get('party-0')!.slot).toBe(2);
  });

  it('hücre verilmezse varsayılan: kendi hücresi boşsa o, doluysa en yakın boş hücre', () => {
    const b = mk();
    b.debugKill('party-0', false);
    expect(b.reviveSlotFor('party-1', 'resurrection', 'party-0')).toBe(0);
    b.debugKill('enemy-1', false);
    b.useSkill('party-2', 'raise_dead', undefined, 0, undefined, 'enemy-1');
    const s = b.reviveSlotFor('party-1', 'resurrection', 'party-0')!;
    expect(b.freeSlots('party')).toContain(s);
    expect(Math.abs(b.rowOf(s) - b.rowOf(0)) + Math.abs(b.laneOf(s) - b.laneOf(0))).toBe(1);
  });

  it('boş hücre yoksa kullanılamaz ve nedeni yazılır; YZ seçmez', () => {
    const full = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === 1 ? 'paladin' : 'warrior']));
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells(full), enemies: cells({ 0: 'warrior' }) }, false));
    b.freeMp = true;
    b.debugKill('party-0', false);
    b.debugKill('enemy-0', false); // ceset yer tutmaz; hücre 0 boş -> önce bir birim oraya koy
    expect(b.canUse('party-1', 'resurrection').ok).toBe(true);
    b.combatants.push({ ...b.get('party-2')!, uid: 'blocker', slot: 0, summoned: true, hp: 10 });
    expect(b.freeSlots('party')).toEqual([]);
    expect(b.canUse('party-1', 'resurrection')).toEqual({ ok: false, reason: 'No free cell' });
    expect(b.reviveBlockReason('party-1', 'party-0')).toBe('No free cell');
  });

  it('determinizm: aynı seed + aynı hamleler = aynı savaş (hücre dahil)', () => {
    const run = () => {
      const b = mk('turns');
      b.debugKill('party-0', false);
      for (let i = 0; i < 200 && b.currentUid !== 'party-1'; i++) b.skipTurn();
      b.useSkill('party-1', 'resurrection', 'party-0', 6);
      for (let i = 0; i < 60 && !b.winner; i++) b.applyChoice(b.currentUid!, chooseAction(b, b.currentUid!, content.aiConfig));
      return JSON.stringify(b.log);
    };
    expect(run()).toBe(run());
  });

  it('skill açıklaması ve maç kaydı yeni kuralı anlatır', () => {
    const info = describeSkill(content.skills.resurrection!, content.classes.paladin!.stats, content.formulas).lines.join(' | ');
    expect(info).toContain('Choose a fallen ally, then choose an empty cell');
    expect(info).toContain('empty turn bar');
    const b = mk();
    b.debugKill('party-0', false);
    const log = new MatchLog(b, { version: 'test' });
    b.useSkill('party-1', 'resurrection', 'party-0', 3);
    expect(log.serialize()).toMatch(/revives P0:Warrior \(hp \d+, mp \d+, cell 3; corpse was on cell 0\)/);
  });
});

describe('Resurrection: arayüz akışı (saf, Raise Dead ile ortak durum makinesi)', () => {
  it('adım 1 ölü dost -> adım 2 boş hücre -> cast (useSkill(uid, skill, dost, hücre)); Esc geri; seçili dosta tekrar tık geri', () => {
    const b = mk();
    b.debugKill('party-0', false);
    b.debugKill('party-3', false);
    const inp = inputs(b);
    let flow = startRaiseFlow(inp)!;
    expect(flow).toEqual({ step: 'corpse', twoStep: true });
    expect(reviveFlowHint(flow)).toEqual({ step: 'Step 1/2', text: 'Choose a fallen ally to revive' });
    expect(pickSlot(flow, inp, inp.slots[0]!).kind).toBe('invalid');
    flow = state(pickCorpse(flow, inp, 'party-3'));
    expect(reviveFlowHint(flow, 'Mage')).toEqual({ step: 'Step 2/2', text: 'Choose an empty cell where Mage rises' });
    expect(state(backRaiseFlow(flow))).toEqual({ step: 'corpse', twoStep: true });
    expect(state(pickCorpse(flow, inp, 'party-3'))).toEqual({ step: 'corpse', twoStep: true });
    const act = pickSlot(flow, inp, 9);
    expect(act).toEqual({ kind: 'cast', slot: 9, corpseUid: 'party-3' });
    expect(pickSlot(flow, inp, 1).kind).toBe('invalid'); // Paladin'in hücresi
    if (act.kind !== 'cast') return;
    expect(b.useSkill('party-1', 'resurrection', act.corpseUid, act.slot).ok).toBe(true);
    expect(b.get('party-3')!.slot).toBe(9);
    // diriltilen dost listeden çıkar: akış yeniden doğrulanır (kalan tek ölü)
    expect(reconcileRaiseFlow({ step: 'slot', twoStep: true, corpseUid: 'party-3' }, inputs(b))).toEqual({ step: 'corpse', twoStep: true });
  });

  it('ipuçları: cesedin üstünde birim varsa söylenir; hücre ipucu düştüğü hücreyi ve sırayı yazar', () => {
    const tip = reviveCorpseTip({ name: 'Warrior', hp: 33, mp: 9, taken: 'Skeleton' });
    expect(tip.title).toBe('Revive Warrior');
    expect(tip.rows.map((r) => r.text).join(' ')).toContain('Skeleton stands on the corpse');
    expect(reviveSlotTip({ name: 'Warrior', row: 0, ownCell: true }).rows.map((r) => r.text)).toEqual(['Where it fell', 'Row 1 (front)', 'Click to revive it here']);
  });
});

describe('Resurrection: yapay zeka (terazi, madde 257)', () => {
  it('YZ ölü dostu ve hücreyi birlikte seçer: yakın dövüşçü ön sırada vurabileceği hücreye, seçim uygulanır', () => {
    const b = mk();
    b.debugKill('party-0', false);
    b.debugKill('enemy-1', false);
    b.useSkill('party-2', 'raise_dead', undefined, 0, undefined, 'enemy-1'); // Warrior'ın ceset hücresinde Skeleton var
    b.get('enemy-0')!.maxHp = b.get('enemy-0')!.hp = 3000; // savaş belli olmasın (madde 258: kazanılmış savaşta diriltme değeri 0)
    const ex = explainChoice(b, 'party-1', ai)!;
    const c = ex.candidates.find((x) => x.skill === 'resurrection' && x.target === 'P0:Warrior')!;
    expect(c.reviveSlot).toBeDefined();
    expect(b.reviveSlots('party-1', 'resurrection')).toContain(c.reviveSlot);
    expect(c.terms!.revive).toBeGreaterThan(0);
    const choice = chooseAction(b, 'party-1', ai)!;
    if (choice.skillId === 'resurrection') {
      expect(b.reviveSlots('party-1', 'resurrection')).toContain(choice.slot);
      expect(b.applyChoice('party-1', choice).ok).toBe(true);
    }
  });

  it('menzilli dost (Mage) güvenli arka hücreyi, yakın dövüşçü (Warrior) ön hücreyi tercih eder', () => {
    const b = mk();
    b.debugKill('party-0', false);
    b.debugKill('party-3', false);
    const ex = explainChoice(b, 'party-1', ai)!;
    const mage = ex.candidates.find((x) => x.skill === 'resurrection' && x.target === 'P3:Mage')!;
    const war = ex.candidates.find((x) => x.skill === 'resurrection' && x.target === 'P0:Warrior')!;
    expect(b.rowOf(war.reviveSlot!)).toBe(0);
    expect(b.rowOf(mage.reviveSlot!)).toBeGreaterThan(0);
  });

  it('boş hücre yoksa Resurrection adayı yok (kullanılamaz)', () => {
    const full = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === 1 ? 'paladin' : 'warrior']));
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells(full), enemies: cells({ 0: 'warrior' }) }, false));
    b.debugKill('party-0', false);
    b.combatants.push({ ...b.get('party-2')!, uid: 'blocker', slot: 0, summoned: true, hp: 10 });
    expect(chooseAction(b, 'party-1', ai)?.skillId).not.toBe('resurrection');
    expect(explainChoice(b, 'party-1', ai)!.rejected.find((r) => r.skill === 'resurrection')?.reason).toBe('no free cell');
  });
});
