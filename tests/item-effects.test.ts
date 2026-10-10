import { afterEach, describe, expect, it } from 'vitest';
import { Battle, content, previewSkill, type BattleEvent, type ItemEffects, type Teams, type UnitSetup } from '../src/engine';
import { activeHeroes, addItem, debugTeleport, equipItem, latestSave, memoryKV, newCampaign, pickHero, writeSave, battlePlan } from '../src/campaign';
import { ITEMS, effectLine, emptyEquipment, equipmentEffects, itemDef, itemLines, loadoutSetup, targetIP, validateItems } from '../src/progression';
import { newRun, wavePlan } from '../src/endless';
import { itemStatLines } from '../src/endless/format';


// Epic item özel etkileri (Ömer onayı 2026-10-10, madde 292): motor kancaları, veri, metin, yığılmama, Endless yolu, kayıt.

const f = content.formulas;
const cells = (u: Record<number, string>): string[] => Array.from({ length: content.CELL_COUNT }, (_, i) => u[i] ?? '');
const make = (party: Record<number, string>, enemies: Record<number, string>, units: Record<number, UnitSetup> = {}, enemyUnits: Record<number, UnitSetup> = {}, seed = 11): Battle => {
  const teams: Teams = { party: cells(party), enemies: cells(enemies), units: { party: units, enemies: enemyUnits } };
  return new Battle(content.battleSetup('random-battle', seed, 'turns', teams, false));
};
const fx = (e: ItemEffects): UnitSetup => ({ itemEffects: e });
const unit = (b: Battle, uid: string) => b.combatants.find((c) => c.uid === uid)!;
type Priv = { addStatus: (t: unknown, s: unknown, emit: (e: BattleEvent) => void) => void; applyHit: (a: unknown, t: unknown, n: number, ty: string, crit: boolean, emit: (e: BattleEvent) => void, red: boolean, meta: unknown) => number };

describe('veri: etki kaydı, Epic atamaları, bütçe', () => {
  it('11 onaylı etki kayıtlı, reddedilenler yok; her Epic item bir etki taşır, bütçeden düşülmüş statlarla ±%10', () => {
    expect(Object.keys(ITEMS.effects).sort()).toEqual(['bloodletter', 'ember_heart', 'giantslayer', 'iron_will', 'mana_spring', 'opening_ward', 'quick_start', 'second_wind', 'steadfast', 'thrifty', 'wardens_oath']);
    expect(validateItems()).toEqual([]);
    const epics = ITEMS.items.filter((d) => d.rarity === 'epic');
    for (const d of epics) expect(d.effect, d.id).toBeDefined();
    expect(ITEMS.items.filter((d) => d.rarity !== 'epic').every((d) => !d.effect)).toBe(true);
    expect(ITEMS.effectRules).toEqual({ ipFromBudget: true, stack: false, endless: true });
    const dane = itemDef('dane_axe')!;
    const full = 1.5 * (ITEMS.budget.base + ITEMS.budget.perIlvl * dane.ilvl) * 2.3;
    expect(targetIP(dane)).toBeCloseTo(full - ITEMS.effects[dane.effect!]!.ip, 6);
  });

  it('metin: kart / ipucu satırı etki adı + tek cümle (Gear, Spoils, Endless, tüccar aynı yardımcıyı kullanır)', () => {
    expect(effectLine(itemDef('rune_staff')!)).toBe('Thrifty: Your first skill each battle costs no MP.');
    expect(effectLine(itemDef('dane_axe')!)).toBe('Giantslayer: Your skills deal 8% more damage to elites and bosses.');
    expect(effectLine(itemDef('ashen_locket')!)).toBe('Ember Heart: While above 50% HP, regain 1 extra MP at the start of each turn.');
    expect(effectLine(itemDef('turnshoes')!)).toBeNull();
    expect(itemLines(itemDef('great_helm')!).at(-1)).toMatch(/^Iron Will: .*15%.*50%/);
    expect(itemStatLines(itemDef('hawkeye_gloves')!).at(-1)).toBe('Mana Spring: On a critical hit, gain 4 MP (once per action).');
  });
});

describe('motor kancaları (verilmezse birim aynı)', () => {
  it('Opening Ward: savaş başı kalkan = maks canın oranı', () => {
    const b = make({ 0: 'warrior' }, { 0: 'mage' }, { 0: fx({ startShieldRatio: 0.08 }) });
    const w = unit(b, 'party-0');
    expect(w.shield).toBe(Math.round(w.maxHp * 0.08));
    expect(unit(make({ 0: 'warrior' }, { 0: 'mage' }), 'party-0').shield).toBe(0);
  });

  it('Quick Start: dolu sayaçla başlayan birim ilk turunu daha erken alır', () => {
    const firstTurn = (b: Battle, uid: string) => b.log.findIndex((e) => e.type === 'turnStart' && e.actor === uid);
    const playUntil = (b: Battle) => {
      for (let i = 0; i < 12 && !b.winner; i++) {
        const a = b.currentActor;
        if (!a) break;
        b.act(a.uid, { kind: 'global', id: 'skip_turn' });
      }
      return b;
    };
    const base = playUntil(make({ 0: 'defender', 6: 'mage' }, { 0: 'archer', 1: 'cutthroat' }));
    const quick = playUntil(make({ 0: 'defender', 6: 'mage' }, { 0: 'archer', 1: 'cutthroat' }, { 6: fx({ startCharge: 0.9 }) }));
    const at = (i: number) => (i < 0 ? Infinity : i);
    expect(firstTurn(quick, 'party-1')).toBeGreaterThanOrEqual(0);
    expect(at(firstTurn(quick, 'party-1'))).toBeLessThan(at(firstTurn(base, 'party-1')));
  });

  it('Steadfast: çekilemez / itilemez', () => {
    const b = make({ 0: 'warrior', 1: 'mage' }, { 0: 'mage' }, { 0: fx({ steadfast: true }) });
    expect(b.immuneToDisplacement(unit(b, 'party-0'))).toBe(true);
    expect(b.immuneToDisplacement(unit(b, 'party-1'))).toBe(false);
  });

  it('Iron Will: debuff 1 tur kısalır (Resilience ile toplanır, tavan); etkisiz birim aynı', () => {
    const debuff = Object.entries(content.statuses).find(([, d]) => d.type === 'debuff' && !d.maxStacks && !d.untilResolved && !d.cc)![0];
    const run = (setup: UnitSetup | undefined, cls = 'mage') => {
      const b = make({ 0: cls }, { 0: 'mage' }, setup ? { 0: setup } : {});
      const t = unit(b, 'party-0');
      (b as unknown as Priv).addStatus(t, { kind: debuff, turns: 3, source: 'enemy-0' }, () => {});
      return t.statuses.find((s) => s.kind === debuff)!.turns;
    };
    expect(run(fx({ debuffShorten: { chance: 1, cap: 1 } }))).toBe(2);
    expect(run(undefined)).toBe(3); // mage: Resilience yok
    expect(run(fx({ debuffShorten: { chance: 1, cap: 0 } }))).toBe(3); // tavan 0
  });

  it('Giantslayer: elit / boss hedefe hasar çarpanı; önizleme de görür', () => {
    const b = make({ 0: 'warrior' }, { 0: 'warrior', 1: 'mage' }, { 0: fx({ tierDamageMult: 1.08 }) }, { 0: { tier: 'elite' } });
    const w = unit(b, 'party-0');
    expect(b.dealtDamageMult(w, unit(b, 'enemy-0'))).toBeCloseTo(1.08 * b.hunterMarkMult(w, unit(b, 'enemy-0')), 9);
    expect(b.dealtDamageMult(w, unit(b, 'enemy-1'))).toBe(b.hunterMarkMult(w, unit(b, 'enemy-1')));
    const plain = make({ 0: 'warrior' }, { 0: 'warrior', 1: 'mage' }, {}, { 0: { tier: 'elite' } });
    const sk = content.classes.warrior!.skills[0]!;
    const hi = previewSkill(b, 'party-0', sk, 'enemy-0');
    const lo = previewSkill(plain, 'party-0', sk, 'enemy-0');
    expect(JSON.stringify(hi)).not.toEqual(JSON.stringify(lo));
  });

  it("Warden's Oath: ekranda yan komşu dost daha az hasar alır; komşu olmayan almaz", () => {
    const b = make({ 0: 'defender', 1: 'mage', 9: 'archer' }, { 0: 'mage' }, { 0: fx({ adjacentGuard: 0.05 }) });
    expect(b.damageTakenMult(unit(b, 'party-1'))).toBeCloseTo(0.95, 9);
    expect(b.damageTakenMult(unit(b, 'party-2'))).toBe(1);
    expect(b.damageTakenMult(unit(b, 'party-0'))).toBe(1); // kendisi değil
  });

  it('Ember Heart: can eşiğin üstündeyken tur başında ek MP', () => {
    const regenOf = (setup: UnitSetup) => {
      const b = make({ 0: 'mage' }, { 0: 'defender' }, { 0: { ...setup, startMpRatio: 0 } });
      for (let i = 0; i < 20 && !b.winner; i++) {
        const a = b.currentActor;
        if (!a) break;
        if (a.uid === 'party-0' && b.log.some((e) => e.type === 'turnStart' && e.actor === 'party-0')) break;
        b.act(a.uid, { kind: 'global', id: 'skip_turn' });
      }
      const ev = b.log.filter((e): e is Extract<BattleEvent, { type: 'mpRegen' }> => e.type === 'mpRegen' && e.actor === 'party-0' && !e.cause);
      return ev[0]?.amount ?? 0;
    };
    expect(regenOf(fx({ turnMp: { mp: 1, above: 0.5 } }))).toBe(regenOf({}) + 1);
    expect(regenOf({ ...fx({ turnMp: { mp: 1, above: 0.5 } }), startHpRatio: 0.3 })).toBe(regenOf({}));
  });

  it('Thrifty: savaştaki ilk skill MP bedelsiz, sonrakiler normal', () => {
    const b = make({ 0: 'mage' }, { 0: 'defender' }, { 0: fx({ firstSkillFree: true }) });
    const m = unit(b, 'party-0');
    const sk = content.classes.mage!.skills.find((id) => content.skills[id]!.cost.resource === 'mp' && content.skills[id]!.cost.amount > 0 && content.skills[id]!.target === 'single_enemy')!;
    b.debug.dodge = 'never';
    expect(b.thriftyFree(m, 'mp')).toBe(true);
    const before = m.mp;
    expect(b.useSkill('party-0', sk, 'enemy-0').ok).toBe(true);
    const echo = b.log.filter((e): e is Extract<BattleEvent, { type: 'mpRegen' }> => e.type === 'mpRegen' && e.actor === 'party-0').reduce((x, e) => x + e.amount, 0);
    expect(m.mp - echo).toBe(before); // bedel ödenmedi (Mana Echo geri dönüşü hariç)
    expect(b.thriftyFree(m, 'mp')).toBe(false);
    expect(b.log.some((e) => e.type === 'resource' && e.actor === 'party-0')).toBe(false);
  });

  it('Mana Spring: kendi kritik vuruşunda MP', () => {
    const cast = (setup: UnitSetup) => {
      const b = make({ 0: 'warrior' }, { 0: 'defender' }, { 0: setup });
      b.debug.crit = 'always';
      b.debug.dodge = 'never';
        b.useSkill('party-0', content.classes.warrior!.skills[0]!, 'enemy-0');
      return b.log.filter((e): e is Extract<BattleEvent, { type: 'mpRegen' }> => e.type === 'mpRegen' && e.cause === 'mana_spring').reduce((a, e) => a + e.amount, 0);
    };
    expect(cast({ ...fx({ critMp: 4 }), startMp: 0 })).toBe(4); // eylem başına bir kez (çok vuruşlu skill'de de 4)
    expect(cast({ startMp: 0 })).toBe(0);
  });

  it('Second Wind: savaşta bir kez, eşiğin altına inince şifa', () => {
    const b = make({ 0: 'warrior' }, { 0: 'mage' }, { 0: fx({ secondWind: { below: 0.3, heal: 0.12 } }) });
    const w = unit(b, 'party-0');
    const e = unit(b, 'enemy-0');
    const hit = (n: number) => (b as unknown as Priv).applyHit(e, w, n, 'physical', false, () => {}, false, { origin: 'skill' });
    hit(Math.ceil(w.maxHp * 0.75));
    const healedTo = w.hp;
    expect(w.secondWindUsed).toBe(true);
    expect(healedTo).toBe(w.maxHp - Math.ceil(w.maxHp * 0.75) + Math.round(w.maxHp * 0.12));
    hit(Math.round(w.maxHp * 0.1));
    expect(w.hp).toBe(healedTo - Math.round(w.maxHp * 0.1)); // ikinci kez yok
  });

  it('Bloodletter: canı eşiğin altındaki düşmana vuruşta verilen can kaybının oranı şifa', () => {
    const b = make({ 0: 'warrior' }, { 0: 'defender' }, { 0: { ...fx({ executeLifesteal: { below: 0.3, ratio: 0.5 } }), startHpRatio: 0.5 } }, { 0: { startHpRatio: 0.2 } });
    b.debug.dodge = 'never';
    b.useSkill('party-0', content.classes.warrior!.skills[0]!, 'enemy-0');
    expect(b.log.some((e) => e.type === 'passive' && e.passive === 'bloodletter')).toBe(true);
    const healthy = make({ 0: 'warrior' }, { 0: 'defender' }, { 0: { ...fx({ executeLifesteal: { below: 0.3, ratio: 0.5 } }), startHpRatio: 0.5 } });
    healthy.debug.dodge = 'never';
    healthy.useSkill('party-0', content.classes.warrior!.skills[0]!, 'enemy-0');
    expect(healthy.log.some((e) => e.type === 'passive' && e.passive === 'bloodletter')).toBe(false);
  });
});

describe('güç katmanı: etkiler, yığılmama, Endless, kayıt', () => {
  afterEach(() => {
    ITEMS.effectRules.stack = false;
    ITEMS.effectRules.endless = true;
  });

  it('Epic item etkisi kuruluma girer; aynı etki iki item\'den toplanmaz (stack kapalı), açılınca toplanır', () => {
    const eq = { ...emptyEquipment(), armor: { uid: 'a', id: 'coat_of_plates' } };
    expect(loadoutSetup({ class: 'defender', equipment: eq }).itemEffects).toEqual({ adjacentGuard: 0.05 });
    // aynı etki iki kaynaktan (test: aynı item'i iki yuvaya koyarak)
    const twice = { ...eq, helm: { uid: 'b', id: 'coat_of_plates' } };
    expect(equipmentEffects(twice)).toEqual({ adjacentGuard: 0.05 });
    ITEMS.effectRules.stack = true;
    expect(equipmentEffects(twice)!.adjacentGuard).toBeCloseTo(0.1, 9);
    expect(loadoutSetup({ class: 'defender', equipment: emptyEquipment() }).itemEffects).toBeUndefined();
  });

  it('Endless: etkiler dalga kurulumuna girer; effectRules.endless kapalıysa girmez', () => {
    const run = newRun(5, ['warrior', 'mage', 'archer', 'defender'], 't');
    run.heroes[0]!.equipment = { weapon: { uid: 'e1', id: 'dane_axe' } };
    const units = () => Object.values(wavePlan(run).units.party);
    expect(units().some((u) => u.itemEffects?.tierDamageMult === ITEMS.effects.giantslayer!.value)).toBe(true);
    ITEMS.effectRules.endless = false;
    expect(units().some((u) => u.itemEffects)).toBe(false);
  });

  it('sefer: etkili item kayıt round-trip sonrası savaş planında etkisiyle gelir', () => {
    let s = debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 21 }), 'archer'), '5A');
    s = { ...s, inventory: [] };
    const hero = activeHeroes(s)[0]!;
    const r = addItem(s, 'great_helm');
    s = equipItem(r.state, hero.id, r.item.uid);
    const kv = memoryKV();
    writeSave(kv, s, 'auto');
    const back = latestSave(kv)!.state;
    const cell = back.active.indexOf(hero.id);
    expect(battlePlan(back).units.party[cell]!.itemEffects).toEqual({ debuffShorten: ITEMS.effects.iron_will!.value });
  });

  it('Quick Battle kurulumunda etki yok (units verilmezse birim aynı)', () => {
    const b = new Battle(content.battleSetup('random-battle', 3, 'turns', { party: cells({ 0: 'warrior' }), enemies: cells({ 0: 'mage' }) }, false));
    for (const c of b.combatants) expect(c.itemEffects).toBeUndefined();
    void f;
  });
});
