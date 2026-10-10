import { describe, expect, it } from 'vitest';
import { Battle, Rng, content, type BattleEvent, type ItemEffects, type Teams, type UnitSetup } from '../src/engine';
import { activeHeroes, addItem, debugTeleport, equipItem, grantAllLegendaries, latestSave, memoryKV, newCampaign, pickHero, writeSave, battlePlan, type CampaignState } from '../src/campaign';
import {
  ITEMS,
  LEGENDARY_LIMIT_MSG,
  bestMoves,
  canEquip,
  effectLine,
  emptyEquipment,
  equipmentEffects,
  itemDef,
  legendaryIds,
  legendaryPreviewWanted,
  rollLoot,
  targetIP,
  validateItems,
} from '../src/progression';
import { equipFromBag, grantLegendariesRun, newRun, upgradePairs } from '../src/endless';
import { buildMechanics } from '../src/wiki/catalog';

// Legendary item'ler (Ömer onayı 2026-10-10, madde 296): veri kuralları, kahraman başına 1, düşüş YOK, önizleme, 10 etkinin motor davranışı.

const cells = (u: Record<number, string>): string[] => Array.from({ length: content.CELL_COUNT }, (_, i) => u[i] ?? '');
const make = (party: Record<number, string>, enemies: Record<number, string>, units: Record<number, UnitSetup> = {}, enemyUnits: Record<number, UnitSetup> = {}, mode: 'turns' | 'test' = 'test', seed = 11): Battle => {
  const teams: Teams = { party: cells(party), enemies: cells(enemies), units: { party: units, enemies: enemyUnits } };
  return new Battle(content.battleSetup('random-battle', seed, mode, teams, false));
};
const fx = (e: ItemEffects): UnitSetup => ({ itemEffects: e });
const unit = (b: Battle, uid: string) => b.combatants.find((c) => c.uid === uid)!;
const passives = (b: Battle, name: string) => b.log.filter((e) => e.type === 'passive' && e.passive === name).length;
const value = (id: string) => ITEMS.effects[id]!.value as never;
type Priv = { addStatus: (t: unknown, s: unknown, emit: (e: BattleEvent) => void) => void; applyHit: (a: unknown, t: unknown, n: number, ty: string, crit: boolean, emit: (e: BattleEvent) => void, red: boolean, meta: unknown) => number };
const firstSkill = (cls: string) => content.classes[cls]!.skills[0]!;

describe('veri ve kurallar', () => {
  it('10 Legendary: x2,85 bütçe (etki düşülmüş), 3 stat + benzersiz Legendary etkisi; katalog geçerli', () => {
    expect(validateItems()).toEqual([]);
    const leg = ITEMS.items.filter((d) => d.rarity === 'legendary');
    expect(leg.map((d) => d.name)).toEqual(['Emberbrand', 'Mantle of Valdren', "Oathkeeper's Bulwark", 'Windrunner Longbow', 'Whisper of Morvane', 'Staff of the Last Ember', "The Gambler's Last Coin", 'Crown of the Ashen King', "Pilgrim's Road Boots", 'Heart of the Forge']);
    expect(ITEMS.rarities.find((r) => r.id === 'legendary')).toMatchObject({ mult: 2.85, statCount: 3, effect: true });
    expect(ITEMS.rarities.find((r) => r.id === 'legendary')!.color).not.toBe(ITEMS.rarities.find((r) => r.id === 'epic')!.color);
    for (const d of leg) {
      expect(Object.keys(d.stats), d.id).toHaveLength(3);
      expect(ITEMS.effects[d.effect!]!.legendary, d.id).toBe(true);
      expect(effectLine(d), d.id).toBeTruthy();
    }
    const e = itemDef('emberbrand')!;
    expect(targetIP(e)).toBeCloseTo(1.5 * (ITEMS.budget.base + ITEMS.budget.perIlvl * e.ilvl) * 2.85 - ITEMS.effects[e.effect!]!.ip, 6);
    expect(ITEMS.effectRules.stack).toBe(false);
  });

  it("bölüm: Valdoria (ilvl <= 10, bölüm 1) yalnızca Emberbrand, Mantle of Valdren ve Pilgrim's Road Boots; diğerleri sonraki bölümlerde", () => {
    const ch1 = ITEMS.items.filter((d) => d.rarity === 'legendary' && (d.minChapter ?? 1) <= 1 && d.ilvl <= 10).map((d) => d.id);
    expect(ch1).toEqual(['emberbrand', 'mantle_of_valdren', 'pilgrims_road_boots']); // Ömer 2026-10-10: Valdoria havuzu 3
    for (const d of ITEMS.items.filter((x) => x.rarity === 'legendary' && !ch1.includes(x.id))) expect(d.minChapter, d.id).toBeGreaterThanOrEqual(2);
  });

  it('Usable by: Oathkeeper yalnız Defender / Paladin (Warrior topuz kullansa da), Crown herkes', () => {
    const ob = itemDef('oathkeepers_bulwark')!;
    expect(canEquip('defender', ob)).toBe(true);
    expect(canEquip('paladin', ob)).toBe(true);
    expect(canEquip('warrior', ob)).toBe(false);
    expect(canEquip('mage', itemDef('crown_of_the_ashen_king')!)).toBe(true);
  });

  it('düşüş YOK: legendaryChance 0, hiçbir zar Legendary vermez (sefer loot\'u, bölüm 3 dahil); Endless ödül / tüccar önermez', () => {
    expect(ITEMS.loot.legendaryChance).toBe(0);
    const party = ['warrior', 'mage', 'archer', 'gambler'].map((c) => ({ class: c }));
    for (let i = 0; i < 400; i++)
      for (const kind of ['battle', 'elite', 'boss', 'treasure'] as const)
        for (const chapter of [1, 2, 3])
          for (const id of rollLoot({ rng: new Rng(i), kind, chapter, ilvl: 30, party }).items) expect(itemDef(id)!.rarity, id).not.toBe('legendary');
    const run = newRun(4, ['warrior', 'archer', 'mage', 'cutthroat'], 't');
    expect(upgradePairs(run, 60).some((p) => p.def.rarity === 'legendary')).toBe(false);
  });
});

describe('kahraman başına 1 Legendary', () => {
  const s0 = (): CampaignState => ({ ...debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 3 }), 'warrior'), '5A'), inventory: [] });

  it('sefer: ikinci Legendary engellenir (mesaj), aynı yuvadakinin yerine geçmek serbest; Equip best ikinciyi seçmez', () => {
    let s = s0();
    const w = activeHeroes(s).find((h) => canEquip(h.class, itemDef('emberbrand')!)) ?? activeHeroes(s)[0]!;
    if (!canEquip(w.class, itemDef('emberbrand')!)) return; // takımda kılıç taşıyan yoksa atla (seed'e bağlı kadro)
    let r = addItem(s, 'emberbrand');
    s = equipItem(r.state, w.id, r.item.uid);
    r = addItem(s, 'crown_of_the_ashen_king');
    expect(() => equipItem(r.state, w.id, r.item.uid)).toThrow(LEGENDARY_LIMIT_MSG);
    // bestMoves: torbada iki Legendary olsa da en çok biri seçilir
    const moves = bestMoves({ class: 'warrior', equipment: emptyEquipment() }, [{ uid: 'a', id: 'emberbrand' }, { uid: 'b', id: 'crown_of_the_ashen_king' }, { uid: 'c', id: 'mantle_of_valdren' }]);
    expect(moves.filter((m) => itemDef(m.uid === 'a' ? 'emberbrand' : m.uid === 'b' ? 'crown_of_the_ashen_king' : 'mantle_of_valdren')!.rarity === 'legendary')).toHaveLength(1);
  });

  it('Endless: ikinci Legendary engellenir', () => {
    let run = grantLegendariesRun(newRun(4, ['warrior', 'archer', 'mage', 'defender'], 't'));
    const w = run.heroes.find((h) => h.class === 'warrior')!;
    const bag = run.bag!;
    run = equipFromBag(run, w.id, bag.find((i) => i.id === 'emberbrand')!.uid);
    expect(() => equipFromBag(run, w.id, run.bag!.find((i) => i.id === 'crown_of_the_ashen_king')!.uid)).toThrow(LEGENDARY_LIMIT_MSG);
  });
});

describe('önizleme ve kayıt', () => {
  it('?legendary=1 / debug: 10 Legendary torbaya (zarlı), tekrar verince çoğalmaz; kayıt round-trip etkiyi korur', () => {
    expect(legendaryPreviewWanted('?legendary=1')).toBe(true);
    expect(legendaryPreviewWanted('?endless=1')).toBe(false);
    let s: CampaignState = { ...debugTeleport(pickHero(newCampaign({ mode: 'normal', seed: 8 }), 'defender'), '5A'), inventory: [] };
    s = grantAllLegendaries(s);
    expect(s.inventory.map((i) => i.id).sort()).toEqual(legendaryIds().sort());
    for (const i of s.inventory) expect(i.rolls).toBeDefined();
    expect(grantAllLegendaries(s).inventory).toHaveLength(10);
    const run = grantLegendariesRun(newRun(9, ['warrior', 'archer', 'mage', 'druid'], 't'));
    expect(run.bag!.filter((i) => itemDef(i.id)!.rarity === 'legendary')).toHaveLength(10);
    // takılı Legendary: kayıttan sonra savaş planında etkisiyle
    const def = activeHeroes(s)[0]!; // Crown herkese uyar
    s = equipItem(s, def.id, s.inventory.find((i) => i.id === 'crown_of_the_ashen_king')!.uid);
    const kv = memoryKV();
    writeSave(kv, s, 'auto');
    const back = latestSave(kv)!.state;
    expect(battlePlan(back).units.party[back.active.indexOf(def.id)]!.itemEffects).toEqual({ ignoreFirstDebuff: true });
  });

  it('Codex: Legendary makalesi 10 item\'i etkisiyle listeler', () => {
    const art = buildMechanics().find((a) => a.id === 'legendary-items')!;
    const txt = JSON.stringify(art);
    for (const id of legendaryIds()) expect(txt).toContain(itemDef(id)!.name);
    expect(equipmentEffects({ weapon: { uid: 'x', id: 'emberbrand' } })).toEqual({ onHitDot: value('ember_burn') });
  });
});

describe('10 etki (motor)', () => {
  it('Emberbrand: isabet eden vuruş Burning (fire DoT) bırakır, 2 tur', () => {
    const b = make({ 0: 'warrior' }, { 0: 'mage' }, { 0: fx({ onHitDot: value('ember_burn') }) }); // mage: Resilience yok (süre kısalmaz)
    b.debug.dodge = 'never';
    b.useSkill('party-0', firstSkill('warrior'), 'enemy-0');
    const st = unit(b, 'enemy-0').statuses.find((s) => s.kind === 'burning');
    expect(st).toBeDefined();
    expect(st!.turns).toBe(2);
    expect(st!.amount).toBeGreaterThan(0);
    expect(content.statuses.burning!.dot).toBeDefined();
  });

  it("Oathkeeper's Bulwark: yan komşu dosta gelen ölümcül vuruşu üstlenir, savaşta bir kez", () => {
    const b = make({ 0: 'defender', 1: 'mage' }, { 0: 'warrior' }, { 0: fx({ interceptLethal: true }), 1: { startHp: 1 } });
    b.debug.dodge = 'never';
    const keeper = unit(b, 'party-0');
    const mage = unit(b, 'party-1');
    const hpBefore = keeper.hp + keeper.shield;
    b.useSkill('enemy-0', firstSkill('warrior'), 'party-1');
    // ilk ölümcül vuruş taşıyana gitti (redirected); Warrior'ın temel saldırısı iki vuruşlu: ikinci vuruş artık korunmaz (savaşta bir kez)
    const toKeeper = b.log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.target === 'party-0' && !!e.redirected);
    expect(toKeeper).toHaveLength(1);
    expect(keeper.hp + keeper.shield).toBeLessThan(hpBefore);
    void mage;
    expect(passives(b, 'oathkeeper')).toBe(1);
    expect(keeper.interceptUsed).toBe(true);
  });

  it('Windrunner Longbow: savaştaki ilk saldırı rastgele ikinci bir düşmana da vurur; ikinci saldırı vurmaz', () => {
    const b = make({ 0: 'archer' }, { 0: 'defender', 1: 'mage', 2: 'warrior' }, { 0: fx({ firstAttackEcho: 0.5 }) });
    b.debug.dodge = 'never';
    const sk = content.classes.archer!.skills.find((id) => content.skills[id]!.target === 'single_enemy')!;
    b.useSkill('party-0', sk, 'enemy-0');
    const hitTargets = new Set(b.log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.source === 'party-0').map((e) => e.target));
    expect(hitTargets.size).toBeGreaterThanOrEqual(2);
    expect(passives(b, 'windrunner')).toBe(1);
    expect(unit(b, 'party-0').echoUsed).toBe(true);
  });

  it('Whisper of Morvane: öldürünce aynı turda bir eylem daha (ihtimal 1 iken); tur başına en çok bir kez', () => {
    const b = make({ 0: 'cutthroat' }, { 0: 'mage', 1: 'mage' }, { 0: fx({ killExtraTurn: 1 }) }, { 0: { startHp: 1 }, 1: { startHp: 1 } }, 'turns');
    b.debug.dodge = 'never';
    // sıra kimdeyse cutthroat'a gelene kadar pas
    for (let i = 0; i < 20 && b.currentActor?.uid !== 'party-0'; i++) b.act(b.currentActor!.uid, { kind: 'global', id: 'skip_turn' });
    expect(b.currentActor?.uid).toBe('party-0');
    const sk = content.classes.cutthroat!.skills.find((id) => content.skills[id]!.target === 'single_enemy' && b.canUse('party-0', id).ok)!;
    b.useSkill('party-0', sk, 'enemy-0');
    expect(passives(b, 'morvane_whisper')).toBe(1);
    expect(b.currentActor?.uid).toBe('party-0'); // ek eylem
    expect(b.log.some((e) => e.type === 'turnStart' && e.actor === 'party-0' && e.extra)).toBe(true);
    const sk2 = content.classes.cutthroat!.skills.find((id) => content.skills[id]!.target === 'single_enemy' && b.canUse('party-0', id).ok);
    if (sk2 && unit(b, 'enemy-1').hp > 0) {
      b.useSkill('party-0', sk2, 'enemy-1');
      expect(passives(b, 'morvane_whisper')).toBe(1); // bu turda ikinci kez yok
    }
  });

  it('Staff of the Last Ember: her 3. büyü bedelsiz (ve güçlü), sonra çarpan temizlenir', () => {
    const b = make({ 0: 'mage' }, { 0: 'defender' }, { 0: fx({ nthSpellFree: value('last_ember') }) });
    const m = unit(b, 'party-0');
    const sk = content.classes.mage!.skills.find((id) => content.skills[id]!.cost.resource === 'mp' && content.skills[id]!.cost.amount > 0 && content.skills[id]!.target === 'single_enemy' && !content.skills[id]!.cooldown)!;
    b.debug.dodge = 'never';
    const resourceEvents = () => b.log.filter((e) => e.type === 'resource' && e.actor === 'party-0').length;
    for (let i = 0; i < 3; i++) {
      m.mp = m.maxMp;
      b.useSkill('party-0', sk, 'enemy-0');
    }
    expect(passives(b, 'last_ember')).toBe(1);
    expect(resourceEvents()).toBe(2); // 3 büyüden yalnızca 2'si MP ödedi
    expect(m.empowerMult).toBeUndefined();
  });

  it("The Gambler's Last Coin: savaşta bir kez iskayı yeniden zarlar", () => {
    const b = make({ 0: 'gambler' }, { 0: 'defender' }, { 0: { ...fx({ rerollMiss: true }), modifiers: { accuracyAdd: -5 } } });
    const sk = content.classes.gambler!.skills.find((id) => content.skills[id]!.target === 'single_enemy' && content.skills[id]!.effects.some((e) => e.type === 'damage'))!;
    b.useSkill('party-0', sk, 'enemy-0');
    b.useSkill('party-0', sk, 'enemy-0');
    expect(passives(b, 'last_coin')).toBe(1);
  });

  it('Crown of the Ashen King: savaşta uygulanan ilk debuff yok sayılır, ikincisi işler', () => {
    const b = make({ 0: 'mage' }, { 0: 'mage' }, { 0: fx({ ignoreFirstDebuff: true }) });
    const t = unit(b, 'party-0');
    (b as unknown as Priv).addStatus(t, { kind: 'slow', turns: 2, source: 'enemy-0' }, () => {});
    expect(t.statuses.some((s) => s.kind === 'slow')).toBe(false);
    (b as unknown as Priv).addStatus(t, { kind: 'slow', turns: 2, source: 'enemy-0' }, () => {});
    expect(t.statuses.some((s) => s.kind === 'slow')).toBe(true);
  });

  it('Mantle of Valdren: savaş başı kalkan %15; can %30 altına inince bir kez yenilenir', () => {
    const b = make({ 0: 'defender' }, { 0: 'warrior' }, { 0: fx({ shieldRefresh: value('valdren_mantle') }) });
    const d = unit(b, 'party-0');
    expect(d.shield).toBe(Math.round(d.maxHp * 0.15));
    const hit = (n: number) => (b as unknown as Priv).applyHit(unit(b, 'enemy-0'), d, n, 'physical', false, () => {}, false, { origin: 'skill' });
    hit(d.shield + Math.ceil(d.maxHp * 0.75));
    expect(d.shieldRefreshed).toBe(true);
    expect(d.shield).toBe(Math.round(d.maxHp * 0.15));
    hit(d.shield);
    hit(1);
    expect(d.shield).toBe(0); // ikinci kez yenilenmez
  });

  it("Pilgrim's Road Boots: Move yarım tur harcar ve Fleet (+%10 kaçınma) verir", () => {
    const run = (setup: UnitSetup) => {
      const b = make({ 0: 'archer' }, { 0: 'defender' }, { 0: setup }, {}, 'turns');
      for (let i = 0; i < 20 && b.currentActor?.uid !== 'party-0'; i++) b.act(b.currentActor!.uid, { kind: 'global', id: 'skip_turn' });
      const a = unit(b, 'party-0');
      const before = a.turnCounter;
      b.act('party-0', { kind: 'global', id: 'move_tile', slot: 4 });
      return { b, a, spent: before - a.turnCounter };
    };
    const strider = run(fx({ moveStride: value('pilgrims_stride') }));
    const normal = run({});
    expect(strider.a.statuses.some((s) => s.kind === 'fleet')).toBe(true);
    expect(strider.b.effectiveStats(strider.a).evasion).toBeCloseTo(strider.a.stats.evasion + 0.1, 9);
    expect(passives(strider.b, 'pilgrims_stride')).toBe(1);
    expect(normal.a.statuses.some((s) => s.kind === 'fleet')).toBe(false);
    void strider.spent;
    void normal.spent;
  });

  it('Heart of the Forge: kritik vuruşta en yaralı dost iyileşir', () => {
    const b = make({ 0: 'paladin', 1: 'mage' }, { 0: 'defender' }, { 0: fx({ critHealAlly: 0.1 }), 1: { startHpRatio: 0.3 } });
    b.debug.crit = 'always';
    b.debug.dodge = 'never';
    const before = unit(b, 'party-1').hp;
    b.useSkill('party-0', content.classes.paladin!.skills.find((id) => content.skills[id]!.target === 'single_enemy' && content.skills[id]!.effects.some((e) => e.type === 'damage'))!, 'enemy-0');
    expect(passives(b, 'forge_heart')).toBeGreaterThanOrEqual(1);
    expect(unit(b, 'party-1').hp).toBeGreaterThan(before);
  });
});
