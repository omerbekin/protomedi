import { describe, expect, it } from 'vitest';
import { applyUnitModifiers, Battle, content } from '../src/engine';
import {
  acknowledgeHandover,
  activeHeroes,
  addGold,
  addItem,
  autoResolve,
  battlePlan,
  debugTeleport,
  equipItem,
  farewell,
  formCompany,
  moveTo,
  heroLoadout,
  newCampaign,
  nextStep,
  pickHero,
  unequipItem,
  type CampaignState,
} from '../src/campaign';
import { emptyEquipment, loadout } from '../src/progression';
import { fightPlan } from '../src/sim/campaign';

// Güç toplama katmanı (roadmap.md 1.1, madde 278): temel + item -> UnitSetup.modifiers. Boş yükleme = bugünkü savaş birebir.

const f = content.formulas;

/** Valdoria'da savaşlı bir düğüme ışınlanmış sefer (kadro seed'li otomatik). */
const atBattle = (node = '5A', seed = 42): CampaignState => debugTeleport(pickHero(newCampaign({ mode: 'normal', seed }), 'archer'), node);

describe('güç katmanı: boş yükleme', () => {
  it('hiçbir şey takılı değilse modifiers yok', () => {
    expect(loadout({ class: 'warrior', level: 1, equipment: emptyEquipment() })).toEqual({ stats: {}, unsupported: [], missing: [] });
    expect(loadout({ class: 'warrior' }).modifiers).toBeUndefined();
  });

  it("battlePlan: item'siz kahramanın kurulumunda yalnızca can taşıma var (bugünkü plan)", () => {
    let s = atBattle();
    // bir kahraman eksik canla
    s = { ...s, roster: s.roster.map((h, i) => (i === 0 ? { ...h, hpRatio: 0.5 } : h)) };
    const plan = battlePlan(s);
    for (const u of Object.values(plan.units.party)) expect(Object.keys(u)).toEqual(['startHpRatio']);
    expect(Object.values(plan.units.party)).toHaveLength(1);
  });

  it("determinizm: aynı seed aynı savaş; item'siz plan, birim kurulumu hiç verilmemiş savaşla birebir aynı", () => {
    const s = atBattle();
    expect(nextStep(s).kind).toBe('battle');
    const plan = battlePlan(s);
    expect(plan.units.party).toEqual({});
    const a = fightPlan(plan, 'medium');
    const b = fightPlan(plan, 'medium');
    expect(a.log).toEqual(b.log);
    const bare = fightPlan({ ...plan, units: { party: {}, enemies: plan.units.enemies } }, 'medium');
    expect(a.log).toEqual(bare.log);
  });
});

describe('güç katmanı: item -> modifiers', () => {
  it('statlar toplanır: STR/DEX/INT/LUCK -> attrAdd, Armor -> armorAdd, Might % -> powerMult', () => {
    const eq = { ...emptyEquipment(), weapon: { uid: 'i1', id: 'woodcutters_axe' }, boots: { uid: 'i2', id: 'turnshoes' }, gloves: { uid: 'i3', id: 'bracers_of_the_fox' } };
    const r = loadout({ class: 'warrior', equipment: eq });
    expect(r.modifiers).toEqual({ attrAdd: { dex: 1 }, armorAdd: 1, powerMult: 1.03 });
    expect(r.stats).toEqual({ might: 3, armor: 1, dex: 1 });
  });

  it('veride olmayan item yok sayılır (eski kayıt çökmez)', () => {
    const r = loadout({ class: 'mage', equipment: { ...emptyEquipment(), helm: { uid: 'i9', id: 'no_such_item' } } });
    expect(r.modifiers).toBeUndefined();
    expect(r.missing).toEqual(['no_such_item']);
  });

  it("takılı item savaşa girer: birimin statları güç katmanının modifiers'ıyla aynı; aynı seed aynı savaş", () => {
    let s = atBattle();
    const hero = activeHeroes(s).find((h) => h.class !== 'mage' && h.class !== 'druid' && h.class !== 'undead') ?? activeHeroes(s)[0]!;
    let r = addItem(s, 'turnshoes');
    s = equipItem(r.state, hero.id, r.item.uid);
    r = addItem(s, 'bracers_of_the_fox');
    s = equipItem(r.state, hero.id, r.item.uid);
    const plan = battlePlan(s);
    const cell = s.active.indexOf(hero.id);
    expect(plan.units.party[cell]!.modifiers).toEqual(heroLoadout(s.roster.find((h) => h.id === hero.id)!).modifiers);
    const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));
    const idx = plan.heroOrder.indexOf(hero.id);
    const unit = battle.combatants.find((c) => c.uid === `party-${idx}`)!;
    const want = applyUnitModifiers(content.classes[hero.class]!, plan.units.party[cell]!.modifiers, f);
    expect(unit.stats.dex).toBe(want.stats.dex);
    expect(unit.stats.armor).toBe(content.classes[hero.class]!.stats.armor + 1);
    expect(fightPlan(plan, 'medium').log).toEqual(fightPlan(plan, 'medium').log);
  });
});

describe('sefer ekipmanı: torba, kuşanma, altın', () => {
  it('kuşanma yuvaya gider, eski item torbaya döner; silah ailesi kuralı; çıkarma torbaya', () => {
    let s = atBattle();
    const team = activeHeroes(s);
    const mage = team.find((h) => h.class === 'mage');
    const warriorish = team.find((h) => ['warrior', 'antimage'].includes(h.class));
    let r = addItem(s, 'turnshoes');
    const h = team[0]!;
    s = equipItem(r.state, h.id, r.item.uid);
    expect(s.inventory).toEqual([]);
    expect(s.roster.find((x) => x.id === h.id)!.equipment.boots?.id).toBe('turnshoes');
    r = addItem(s, 'turnshoes');
    s = equipItem(r.state, h.id, r.item.uid);
    expect(s.inventory.map((i) => i.uid)).toEqual(['i1']); // eskisi torbaya döndü
    s = unequipItem(s, h.id, 'boots');
    expect(s.inventory).toHaveLength(2);
    expect(s.roster.find((x) => x.id === h.id)!.equipment.boots).toBeNull();
    r = addItem(s, 'woodcutters_axe');
    if (mage) expect(() => equipItem(r.state, mage.id, r.item.uid)).toThrow(/cannot use axes/);
    if (warriorish) expect(equipItem(r.state, warriorish.id, r.item.uid).roster.find((x) => x.id === warriorish.id)!.equipment.weapon?.id).toBe('woodcutters_axe');
    expect(() => addItem(s, 'nope')).toThrow();
    expect(addGold(addGold(s, 50), -80).gold).toBe(0);
  });

  it('torba sınırı 30', () => {
    let s = atBattle();
    for (let i = 0; i < 30; i++) s = addItem(s, 'turnshoes').state;
    expect(() => addItem(s, 'turnshoes')).toThrow(/Bag is full/);
  });

  it("Ashford vedası: tutorial takımının item'leri torbaya düşer, yeni bölük takabilir (karar 7)", () => {
    let s = pickHero(newCampaign({ mode: 'normal', seed: 3 }), 'warrior');
    const hero = s.roster[0]!;
    const r = addItem(s, 'woodcutters_axe');
    s = equipItem(r.state, hero.id, r.item.uid);
    for (let guard = 0; guard < 50 && nextStep(s).kind !== 'farewell'; guard++) {
      const st = nextStep(s);
      s = st.kind === 'move' ? moveTo(s, st.options[0]!) : autoResolve(s, st);
    }
    expect(nextStep(s).kind).toBe('farewell');
    s = farewell(s);
    expect(s.roster.some((h) => h.id === hero.id)).toBe(false);
    expect(s.inventory.map((i) => i.id)).toEqual(['woodcutters_axe']);
    expect(s.pendingHandover).toEqual({ node: s.at, from: [{ heroId: hero.id, class: 'warrior' }], items: [s.inventory[0]!.uid] });
    expect(acknowledgeHandover(s).pendingHandover).toBeUndefined();
    expect(acknowledgeHandover(s).inventory).toEqual(s.inventory);
    s = formCompany(s, ['warrior', 'mage', 'archer']);
    const w = s.roster.find((h) => h.class === 'warrior')!;
    expect(w.level).toBe(1);
    s = equipItem(s, w.id, s.inventory[0]!.uid);
    expect(s.inventory).toEqual([]);
  });
});
