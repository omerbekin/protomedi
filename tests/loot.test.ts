import { describe, expect, it } from 'vitest';
import { applyUnitModifiers, Battle, content, hasUnitModifiers, Rng } from '../src/engine';
import {
  acknowledgeLoot,
  activeHeroes,
  addItem,
  applyBattle,
  autoResolve,
  battlePlan,
  completeSimple,
  debugTeleport,
  discardItem,
  discardNeedsConfirm,
  takeLeftover,
  equipBest,
  newCampaign,
  nextStep,
  pickHero,
  type CampaignState,
} from '../src/campaign';
import { BAG_SIZE, ITEMS, RARITY_IDS, bestMoves, canEquip, emptyEquipment, itemDef, loadout, primaryCheck, rollLoot, validateItems } from '../src/progression';

// Item MVP (madde 280): motorun toplamsal ekleri, loot (seed'li, zorluktan bağımsız, attempt'ten bağımsız, tekrarda azalan), Equip best.

const f = content.formulas;
const party4 = ['warrior', 'mage', 'archer', 'gambler'].map((c) => ({ class: c, equipment: emptyEquipment() }));

describe('motor: toplamsal ekler (UnitModifiers)', () => {
  it('hpAdd hpMult sonrası, kritik/isabet/kaçınma oran olarak, hız/MP/yenilenme düz; ek yoksa tanım aynen', () => {
    const w = content.classes.warrior!;
    const m = applyUnitModifiers(w, { hpMult: 2, hpAdd: 10, mpAdd: 5, spdAdd: 0.5, critAdd: 0.03, critMultAdd: 0.1, accuracyAdd: 0.02, evasionAdd: 0.04, hpRegenAdd: 1, mpRegenAdd: 1 }, f);
    expect(m.stats.hp).toBe(Math.round(w.stats.hp * 2) + 10);
    expect(m.stats.mp).toBe(w.stats.mp + 5);
    expect(m.stats.spd).toBe(w.stats.spd + 0.5);
    expect(m.stats.critChance).toBeCloseTo(w.stats.critChance + 0.03, 9);
    expect(m.stats.critMult).toBeCloseTo(w.stats.critMult + 0.1, 9);
    expect(m.stats.accuracy).toBeCloseTo(w.stats.accuracy + 0.02, 9);
    expect(m.stats.evasion).toBeCloseTo(w.stats.evasion + 0.04, 9);
    expect(m.stats.hpRegen).toBe(w.stats.hpRegen + 1);
    expect(m.stats.mpRegen).toBe(w.stats.mpRegen + 1);
    expect(applyUnitModifiers(w, { evasionAdd: 5 }, f).stats.evasion).toBe(f.attributes.evasionMax);
    expect(hasUnitModifiers({ critAdd: 0 })).toBe(false);
    expect(applyUnitModifiers(w, { hpAdd: 0 }, f)).toBe(w);
    // yalnızca hpMult: diğer türev değerler eskisiyle birebir (yuvarlama yok)
    const h = applyUnitModifiers(w, { hpMult: 1.5 }, f);
    expect([h.stats.critChance, h.stats.accuracy, h.stats.evasion, h.stats.mp]).toEqual([w.stats.critChance, w.stats.accuracy, w.stats.evasion, w.stats.mp]);
  });

  it("savaşta birimin maks canı ve MP'si eklerle başlar", () => {
    const cells = (u: Record<number, string>) => Array.from({ length: content.CELL_COUNT }, (_, i) => u[i] ?? '');
    const b = new Battle(content.battleSetup('random-battle', 5, 'turns', { party: cells({ 0: 'warrior' }), enemies: cells({ 0: 'mage' }), units: { party: { 0: { modifiers: { hpAdd: 12, mpAdd: 10 } } } } }, false));
    const u = b.combatants.find((c) => c.uid === 'party-0')!;
    expect(u.maxHp).toBe(content.classes.warrior!.stats.hp + 12);
    expect(u.maxMp).toBe(content.classes.warrior!.stats.mp + 10);
  });

  it('güç katmanı tüm item statlarını motora çevirir (yüzdeler oran)', () => {
    const r = loadout({ class: 'gambler', equipment: { ...emptyEquipment(), gloves: { uid: 'i1', id: 'hawkeye_gloves' }, boots: { uid: 'i2', id: 'swift_sabatons' }, armor: { uid: 'i3', id: 'coat_of_plates' } } });
    const g = itemDef('hawkeye_gloves')!.stats;
    expect(r.unsupported).toEqual([]);
    expect(r.modifiers).toMatchObject({ critAdd: g.crit! / 100, critMultAdd: g.critDmg! / 100, magicArmorAdd: itemDef('coat_of_plates')!.stats.magicArmor! });
  });
});

describe('item içeriği (Valdoria)', () => {
  it("her yuvada ve her silah ailesinde Common..Rare bölüm 1 item'i var; Epic'ler var; bölüm 1'de yalnızca 2 Legendary (düşmez)", () => {
    expect(validateItems()).toEqual([]);
    const ch1 = ITEMS.items.filter((d) => d.ilvl <= 10);
    for (const slot of ['weapon', 'helm', 'armor', 'gloves', 'boots', 'trinket'] as const)
      for (const r of ['common', 'uncommon', 'rare', 'epic'] as const)
        if (slot !== 'weapon' || r !== 'epic') expect(ch1.some((d) => d.slot === slot && d.rarity === r), `${slot} ${r}`).toBe(true);
    for (const fam of ITEMS.weaponFamilies) for (const r of ['common', 'uncommon', 'rare'] as const) expect(ch1.some((d) => d.family === fam.id && d.rarity === r), `${fam.id} ${r}`).toBe(true);
    expect(ch1.filter((d) => d.rarity === 'legendary').map((d) => d.id)).toEqual(['emberbrand', 'mantle_of_valdren', 'pilgrims_road_boots']); // madde 296 (normal loot zarından düşmez)
    expect(ch1.filter((d) => d.rarity !== 'legendary').length).toBeGreaterThanOrEqual(40);
  });
});

describe('loot üretimi', () => {
  const roll = (kind: 'battle' | 'elite' | 'boss' | 'treasure', seed: number, extra: Partial<Parameters<typeof rollLoot>[0]> = {}) => rollLoot({ rng: new Rng(seed), kind, chapter: 1, ilvl: 6, party: party4, ...extra });

  it('belirleyici: aynı zar aynı loot', () => {
    expect(roll('battle', 7)).toEqual(roll('battle', 7));
  });

  it("beklenen sayı: savaş 0,5 x takım, boss en az 1 ve ilk item'i Rare+, hazine en az 1 Rare+; ilvl sınırı", () => {
    let battleItems = 0;
    for (let i = 0; i < 400; i++) battleItems += roll('battle', i).items.length;
    expect(battleItems / 400).toBeCloseTo(ITEMS.loot.perPartyMember.battle * 4, 0);
    for (let i = 0; i < 100; i++) {
      for (const kind of ['boss', 'treasure'] as const) {
        const r = roll(kind, i);
        expect(r.items.length).toBeGreaterThanOrEqual(1);
        expect(RARITY_IDS.indexOf(itemDef(r.items[0]!)!.rarity)).toBeGreaterThanOrEqual(RARITY_IDS.indexOf('rare'));
      }
      for (const id of roll('battle', i, { ilvl: 3 }).items) expect(itemDef(id)!.ilvl).toBeLessThanOrEqual(3);
    }
  });

  it('tekrar oynamada azalan ödül (%60/%40/%25) ve nadirlik tavanı; garanti yok', () => {
    const avg = (replay: number) => {
      let n = 0;
      let g = 0;
      for (let i = 0; i < 300; i++) {
        const r = roll('elite', i, { replay });
        n += r.items.length;
        g += r.gold;
      }
      return { n: n / 300, g: g / 300 };
    };
    const a0 = avg(0);
    const a1 = avg(1);
    const a3 = avg(5);
    expect(a1.n).toBeLessThan(a0.n);
    expect(a3.n).toBeLessThan(a1.n);
    expect(a1.g / a0.g).toBeCloseTo(0.6, 2);
    expect(a3.g / a0.g).toBeCloseTo(0.25, 2);
    for (let i = 0; i < 200; i++) for (const id of roll('elite', i, { replay: 2 }).items) expect(RARITY_IDS.indexOf(itemDef(id)!.rarity)).toBeLessThanOrEqual(RARITY_IDS.indexOf('rare'));
  });

  it('pity: 6 Rare\'siz düşüşten sonra Rare+ garanti', () => {
    const r = roll('battle', 3, { pity: ITEMS.loot.pity.rareAfter });
    if (r.items.length) expect(RARITY_IDS.indexOf(itemDef(r.items[0]!)!.rarity)).toBeGreaterThanOrEqual(RARITY_IDS.indexOf('rare'));
  });
});

describe('seferde loot', () => {
  const at5A = (difficulty: 'easy' | 'medium' | 'hard' = 'medium'): CampaignState => debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 77, difficulty }), 'archer'), '5A');
  const win = (s: CampaignState) => applyBattle(s, { victory: true, units: activeHeroes(s).map((h) => ({ heroId: h.id, hpRatio: 1, alive: true })) });

  it("zafer loot'u torbaya + altın + Spoils kartı; zorluktan bağımsız (karar 6); deneme sayısından bağımsız", () => {
    const before = at5A();
    const after = win(before);
    const got = after.inventory.length - before.inventory.length;
    expect(after.pendingLoot!.items).toHaveLength(got);
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.lootState.clears['5A:battle']).toBe(1);
    // aynı sefer, farklı zorluk: aynı loot
    const hard = win(at5A('hard'));
    expect(hard.inventory.map((i) => i.id)).toEqual(after.inventory.map((i) => i.id));
    expect(hard.gold).toBe(after.gold);
    // yenilgi (deneme sayacı artar) loot'u değiştirmez: loot yalnızca zaferde, zar attempt içermez
    expect(win(applyBattle(before, { victory: false, units: [] })).inventory.map((i) => i.id)).toEqual(after.inventory.map((i) => i.id));
    expect(acknowledgeLoot(after).pendingLoot).toBeUndefined();
  });

  it('hazine sandığı: en az 1 Rare+; torba doluysa sığmayan altına ÇEVRİLMEZ, kartta bekler; yer açılıp alınabilir, kart kapanınca kaybolur', () => {
    let s = debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 9 }), 'mage'), '6B');
    while (nextStep(s).kind !== 'treasure') s = autoResolve(s);
    const open = completeSimple(s, 'treasure');
    const ids = open.pendingLoot!.items.map((u) => open.inventory.find((i) => i.uid === u)?.id).filter(Boolean) as string[];
    expect(ids.some((id) => RARITY_IDS.indexOf(itemDef(id)!.rarity) >= RARITY_IDS.indexOf('rare'))).toBe(true);
    let full: CampaignState = { ...s, inventory: [] };
    delete full.pendingLoot;
    for (let i = 0; i < BAG_SIZE; i++) full = addItem(full, 'turnshoes').state;
    const o2 = completeSimple(full, 'treasure');
    const left = o2.pendingLoot!.left!;
    expect(o2.inventory).toHaveLength(BAG_SIZE);
    expect(left.length).toBeGreaterThan(0);
    expect(o2.gold - full.gold).toBe(o2.pendingLoot!.gold); // satış yok
    // yer yokken alınamaz
    expect(takeLeftover(o2, 0)).toBe(o2);
    // yer aç (at) ve al
    const freed = discardItem(o2, o2.inventory[0]!.uid);
    const took = takeLeftover(freed, 0);
    expect(took.inventory).toHaveLength(BAG_SIZE);
    expect(took.inventory.at(-1)!.id).toBe(left[0]);
    expect(took.pendingLoot!.left ?? []).toHaveLength(left.length - 1);
    // kart kapanınca geride kalanlar kaybolur
    expect(acknowledgeLoot(took).pendingLoot).toBeUndefined();
    expect(acknowledgeLoot(took).inventory).toEqual(took.inventory);
  });

  it('atma: Rare ve üstü onay ister, altı istemez; torbada olmayan atılamaz', () => {
    expect(discardNeedsConfirm({ uid: 'a', id: 'turnshoes' })).toBe(false);
    expect(discardNeedsConfirm({ uid: 'b', id: 'brigandine' })).toBe(true);
    expect(discardNeedsConfirm({ uid: 'c', id: 'swift_sabatons' })).toBe(true);
    const s = addItem(at5A(), 'turnshoes');
    expect(discardItem(s.state, s.item.uid).inventory.some((i) => i.uid === s.item.uid)).toBe(false);
    expect(() => discardItem(s.state, 'nope')).toThrow();
  });

  it('Equip best: kullanılabilir, primary\'yi bozmayan, takılıdan iyi item; savaş planına yansır', () => {
    let s = at5A();
    for (const id of ['woodcutters_axe', 'bone_staff', 'yew_longbow', 'brigandine', 'arming_sword']) s = addItem(s, id).state;
    const t = equipBest(s);
    for (const h of activeHeroes(t))
      for (const inst of Object.values(h.equipment)) {
        if (!inst) continue;
        expect(canEquip(h.class, itemDef(inst.id)!)).toBe(true);
      }
    expect(t.inventory.length).toBeLessThan(s.inventory.length);
    const cells = Object.values(battlePlan(t).units.party).filter((u) => u.modifiers);
    expect(cells.length).toBeGreaterThan(0);
    // primary bozan item seçilmez: Paladin'e STR silahı (Arming Sword +1 STR) önerilmez
    const pal = { class: 'paladin', equipment: emptyEquipment() };
    const moves = bestMoves(pal, [{ uid: 'x1', id: 'arming_sword' }, { uid: 'x2', id: 'flanged_mace' }]);
    expect(primaryCheck(pal, { equip: { uid: 'x1', id: 'arming_sword' } }).lost).toBe(false); // 13/13 eşit: açık kalır
    expect(moves.map((m) => m.uid)).toEqual(['x2']); // Arming Sword ailesi (axes) Paladin'e uygun değil
  });
});
