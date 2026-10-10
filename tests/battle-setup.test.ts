import { describe, expect, it } from 'vitest';
import { applyUnitModifiers, Battle, battleSummary, chooseAction, content, damageRange, deriveStats, previewSkill, roundStat, unitLabel } from '../src/engine';
import type { BattleEvent, BattleMode, CombatantData, Teams, UnitSetup } from '../src/engine';

// Savaş kurulum seçenekleri (sefer için; docs/design/combat.md > Savaş kurulum seçenekleri): birim güçlendirmesi, özel ad, başlangıç canı/MP,
// savaş sonu özeti, hazır çağrı, tur başına ek eylem. Verilmezse savaş birebir eskisi gibi olmalı.

const BATTLE = 'random-battle';
const f = content.formulas;
const MODES: BattleMode[] = ['turns', 'test'];

/** Hücre listesi (dizin = yuva). */
const cells = (units: Record<number, string>): string[] => Array.from({ length: content.CELL_COUNT }, (_, i) => units[i] ?? '');

const TEAMS: Teams = {
  party: cells({ 0: 'warrior', 1: 'defender', 6: 'mage', 8: 'archer' }),
  enemies: cells({ 0: 'warrior', 2: 'cutthroat', 6: 'druid', 7: 'hexer' }),
};

const make = (seed: number, mode: BattleMode, teams: Teams = TEAMS) => new Battle(content.battleSetup(BATTLE, seed, mode, teams, false));

/** İki taraf da yapay zekayla oynar (turns: sıraya göre; test: canlı birimler sırayla). Olay kaydı döner. */
function playOut(b: Battle, maxMoves = 400): BattleEvent[] {
  let i = 0;
  for (let n = 0; n < maxMoves && !b.winner; n++) {
    let uid: string | undefined;
    if (b.mode === 'turns') uid = b.currentActor?.uid;
    else {
      const living = b.combatants.filter((c) => c.hp > 0);
      uid = living[i++ % living.length]?.uid;
    }
    if (!uid) break;
    const r = b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
    if (!r.ok && b.mode === 'turns') break;
  }
  return b.log;
}

describe('verilmediğinde birebir eski davranış', () => {
  for (const mode of MODES) {
    it(`${mode}: units yok / boş = aynı kurulum ve aynı savaş (aynı seed)`, () => {
      for (const seed of [1, 7, 42]) {
        const plain = content.battleSetup(BATTLE, seed, mode, TEAMS, false);
        expect(plain.partyUnits).toBeUndefined();
        expect(plain.enemyUnits).toBeUndefined();
        const empty = content.battleSetup(BATTLE, seed, mode, { ...TEAMS, units: { party: {}, enemies: [] } }, false);
        expect(empty.partyUnits).toBeUndefined();
        expect(empty.enemyUnits).toBeUndefined();
        // birim başına boş kurulum ({}) ve etkisiz çarpanlar da hiçbir şeyi değiştirmez
        const neutral = content.battleSetup(BATTLE, seed, mode, { ...TEAMS, units: { party: { 0: {}, 1: { modifiers: { hpMult: 1, statMult: 1 } } }, enemies: { 0: {} } } }, false);
        const a = playOut(new Battle(plain));
        expect(playOut(new Battle(empty))).toEqual(a);
        const n = playOut(new Battle(neutral));
        // tek fark: etkisiz çarpanların bilgi amaçlı `modifiers` alanı (battleStart'ta); savaşın kendisi aynı
        expect(n.slice(1)).toEqual(a.slice(1));
      }
    });
  }

  it('rastgele savaş (takım verilmeden) eskisi gibi: partyUnits/enemyUnits yazılmaz', () => {
    const s = content.battleSetup(BATTLE, 5, 'turns', { partySize: 5, enemySize: 5 });
    expect(s.partyUnits).toBeUndefined();
    expect(s.enemyUnits).toBeUndefined();
  });
});

describe('modifiers: güçlendirme / zayıflatma', () => {
  it('statMult temel statları ölçekler, türev değerler formüllerle yeniden hesaplanır; hpMult en son', () => {
    const def = content.classes.warrior!;
    const m = applyUnitModifiers(def, { statMult: 1.15, hpMult: 1.8 }, f);
    const a = def.attributes;
    const r = (v: number) => roundStat(v, f); // x2 stat ölçeği: statScale katına (eski tam sayının 2 katı)
    expect(m.attributes).toEqual({ str: r(a.str * 1.15), int: r(a.int * 1.15), dex: r(a.dex * 1.15), luck: r(a.luck * 1.15) });
    const A = f.attributes;
    const baseHp = Math.round(A.hpBase + A.hpPerStr * m.attributes.str);
    expect(m.stats.hp).toBe(Math.round(baseHp * 1.8));
    expect(m.stats.spd).toBe(Math.max(1, Math.round(A.spdBase + A.spdPerDex * m.attributes.dex)));
    expect(m.stats.critChance).toBeCloseTo(A.critChanceBase + A.critChancePerLuck * m.attributes.luck, 10);
    expect(m.stats.mp).toBe(Math.round(A.mpBase + A.mpPerInt * m.attributes.int));
    // orijinal tanım değişmedi
    expect(content.classes.warrior!.stats).toEqual(deriveStats({ ...(def as unknown as CombatantData), attributes: def.attributes, armor: def.stats.armor, magicArmor: def.stats.magicArmor }, f));
  });

  it('güçlendirilmiş temel statlar her zaman TAM SAYI (Ömer kararı: "STR 5.5" yok; standart yuvarlama)', () => {
    const ATTR = ['str', 'int', 'dex', 'luck'] as const;
    const modsList = [{ statMult: 1.15 }, { statMult: 0.7 }, { statMult: 1.137, hpMult: 2 }, { attrMult: { dex: 0.55 } }, { statMult: 1.05, attrAdd: { str: 1.5, luck: 0.4 } }];
    for (const def of [...Object.values(content.classes), content.summons.treant!].filter(Boolean)) {
      for (const mods of modsList) {
        const m = applyUnitModifiers(def!, mods, f);
        for (const k of ATTR) {
          expect(Number.isInteger(m.attributes[k] / (f.statScale ?? 1)), `${def!.id} ${k} ${JSON.stringify(mods)}`).toBe(true); // eski ölçekte tam sayı
          const raw = def!.attributes[k] * (mods.statMult ?? 1) * ((mods as { attrMult?: Partial<Record<string, number>> }).attrMult?.[k] ?? 1) + ((mods as { attrAdd?: Partial<Record<string, number>> }).attrAdd?.[k] ?? 0);
          expect(m.attributes[k]).toBe(Math.max(0, roundStat(raw, f)));
        }
      }
    }
    // örnek (x2 ölçek): 10 x 1,1 = 11 -> 12; 30 x 1,1 = 33 -> 34; 8 x 1,1 = 8,8 -> 8 (eski ölçekte 5,5 -> 6, 16,5 -> 17, 4,4 -> 4)
    const fake = { ...content.classes.warrior!, attributes: { str: 10, int: 30, dex: 30, luck: 8 } };
    expect(applyUnitModifiers(fake, { statMult: 1.1 }, f).attributes).toEqual({ str: 12, int: 34, dex: 34, luck: 8 });
  });

  it('veri overrides korunur (Defender sabit canı statMult ile değişmez, hpMult ile değişir)', () => {
    const def = content.classes.defender!;
    expect(def.overrides?.hp).toBeDefined();
    expect(applyUnitModifiers(def, { statMult: 1.5 }, f).stats.hp).toBe(def.overrides!.hp);
    expect(applyUnitModifiers(def, { statMult: 1.5, hpMult: 2 }, f).stats.hp).toBe(Math.round(def.overrides!.hp! * 2));
  });

  it('attrMult / attrAdd / armorAdd / magicArmorAdd / powerMult / spriteScale', () => {
    const def = content.classes.archer!;
    const m = applyUnitModifiers(def, { attrMult: { dex: 0.5 }, attrAdd: { str: 4 }, armorAdd: 5, magicArmorAdd: -100, powerMult: 1.25, spriteScale: 1.4 }, f);
    expect(m.attributes.dex).toBe(Math.round(def.attributes.dex * 0.5));
    expect(m.attributes.str).toBe(def.attributes.str + 4);
    expect(m.stats.armor).toBe(def.stats.armor + 5);
    expect(m.stats.magicArmor).toBe(0);
    expect(m.stats.spellPowerMult).toBe(1.25);
    expect(m.spriteScale).toBe(1.4);
    expect(m.stats.spd).toBeLessThan(def.stats.spd);
    expect(applyUnitModifiers(def, {}, f)).toBe(def);
    expect(applyUnitModifiers(def, undefined, f)).toBe(def);
  });

  for (const mode of MODES) {
    it(`${mode}: savaşta birimin statları güçlendirilmiş; önizleme ve hasar formülü bunu kullanır`, () => {
      const teams: Teams = {
        party: cells({ 0: 'warrior' }),
        enemies: cells({ 0: 'warrior', 1: 'warrior' }),
        units: { enemies: { 1: { modifiers: { hpMult: 2, statMult: 1.2, armorAdd: 10, powerMult: 1.5 } } } },
      };
      const b = make(3, mode, teams);
      const plain = b.get('enemy-0')!;
      const boss = b.get('enemy-1')!;
      const want = applyUnitModifiers(content.classes.warrior!, teams.units!.enemies![1]!.modifiers, f);
      expect(boss.maxHp).toBe(want.stats.hp);
      expect(boss.hp).toBe(boss.maxHp);
      expect(boss.stats).toEqual(want.stats);
      expect(boss.maxHp).toBeGreaterThan(plain.maxHp * 2);
      expect(boss.modifiers).toEqual(teams.units!.enemies![1]!.modifiers);
      // önizleme: güçlendirilmiş hedefe hasar daha az (zırh), güçlendirilmiş saldıran daha çok vurur (stat x powerMult)
      const hero = b.get('party-0')!;
      const skill = hero.skills[0]!;
      const toPlain = previewSkill(b, hero.uid, skill, plain.uid).find((p) => p.uid === plain.uid)!.damage!;
      const toBoss = previewSkill(b, hero.uid, skill, boss.uid).find((p) => p.uid === boss.uid)!.damage!;
      expect(toBoss.avg).toBeLessThan(toPlain.avg);
      const spec = { damageType: 'physical' as const, scale: 'str' as const, power: 1 };
      const byBoss = damageRange(boss.stats, hero.stats, spec, f).avg;
      const byPlain = damageRange(plain.stats, hero.stats, spec, f).avg;
      expect(byBoss).toBeGreaterThan(byPlain * 1.5);
      // yapay zeka bu birimle geçerli bir karar verir
      const choice = chooseAction(b, boss.uid, content.aiConfig);
      if (mode === 'test') expect(choice).not.toBeNull();
    });
  }
});

describe('displayName, tier', () => {
  it('birimde, battleStart olayında ve maç kaydı etiketinde görünür; sınıf adı (name) aynı kalır', () => {
    const teams: Teams = {
      ...TEAMS,
      units: { enemies: { 0: { displayName: 'Bandit Chief', tier: 'elite', modifiers: { hpMult: 1.8, statMult: 1.15, spriteScale: 1.3 } } } },
    };
    const b = make(1, 'turns', teams);
    const chief = b.get('enemy-0')!;
    expect(chief.displayName).toBe('Bandit Chief');
    expect(chief.tier).toBe('elite');
    expect(chief.name).toBe(content.classes.warrior!.name);
    expect(chief.spriteScale).toBe(1.3);
    const start = b.log[0]!;
    expect(start.type).toBe('battleStart');
    const c = start.type === 'battleStart' ? start.combatants.find((x) => x.uid === 'enemy-0')! : undefined;
    expect(c?.displayName).toBe('Bandit Chief');
    expect(c?.tier).toBe('elite');
    expect(unitLabel(chief)).toContain('Bandit Chief');
    expect(b.get('enemy-1')!.displayName).toBeUndefined();
  });

  it('sınıf listesiyle (arrange true) kurulum, dizilimden önceki dizine göre eşlenir', () => {
    // archer önce verilir ama warrior (melee) öne dizilir: kurulum yine archer'a gider
    const s = content.battleSetup(BATTLE, 1, 'turns', { party: ['archer', 'warrior'], enemies: ['mage'], units: { party: [{ displayName: 'Hawkeye' }] } }, true);
    const b = new Battle(s);
    const archer = b.combatants.find((c) => c.defId === 'archer')!;
    expect(archer.displayName).toBe('Hawkeye');
    expect(b.combatants.find((c) => c.defId === 'warrior')!.displayName).toBeUndefined();
  });
});

describe('başlangıç canı ve MP', () => {
  for (const mode of MODES) {
    it(`${mode}: startHp / startHpRatio / startMp; ölü başlanamaz, maks aşılamaz`, () => {
      const units: Record<number, UnitSetup> = {
        0: { startHpRatio: 0.5 },
        1: { startHp: 0, startMp: 3 },
        6: { startHp: 99999, startMpRatio: 0 },
        8: { startHpRatio: 0.3, startHp: 7 }, // mutlak değer öncelikli
      };
      const b = make(2, mode, { ...TEAMS, units: { party: units } });
      // battleStart anındaki durum (turns modunda ilk aktörün tur başı yenilenmesi kurucuda işler)
      const start = b.log[0]!;
      const roster = start.type === 'battleStart' ? start.combatants : [];
      const at = (slot: number) => roster.find((c) => c.side === 'party' && c.slot === slot)!;
      expect(at(0).hp).toBe(Math.round(at(0).maxHp * 0.5));
      expect(at(1).hp).toBe(1);
      expect(at(1).mp).toBe(Math.min(3, at(1).maxMp));
      expect(at(6).hp).toBe(at(6).maxHp);
      expect(at(6).mp).toBe(0);
      expect(at(8).hp).toBe(7);
      // önizleme/YZ mevcut canı görür: yaralı birime öldürücü vuruş daha kolay
      expect(at(1).hp).toBeGreaterThan(0);
    });
  }

  it('can ve güçlendirme birlikte: oran güçlendirilmiş maks cana göre', () => {
    const b = make(4, 'turns', { ...TEAMS, units: { enemies: { 0: { modifiers: { hpMult: 3 }, startHpRatio: 0.25 } } } });
    const u = b.get('enemy-0')!;
    expect(u.hp).toBe(Math.round(u.maxHp * 0.25));
    expect(u.maxHp).toBe(applyUnitModifiers(content.classes.warrior!, { hpMult: 3 }, f).stats.hp);
  });
});

describe('savaş sonu özeti (battleSummary)', () => {
  for (const mode of MODES) {
    it(`${mode}: her birimin uid, classId, can, hayatta mı; savaşı değiştirmez`, () => {
      const b = make(11, mode, { ...TEAMS, units: { party: { 1: { startHpRatio: 0.6 } }, enemies: { 0: { displayName: 'Road Thug', tier: 'boss' } } } });
      const before = battleSummary(b);
      expect(before.winner).toBeNull();
      expect(before.units.find((u) => u.uid === 'enemy-0')!.displayName).toBe('Road Thug');
      expect(before.units.find((u) => u.uid === 'enemy-0')!.tier).toBe('boss');
      playOut(b);
      const logLen = b.log.length;
      const s = battleSummary(b);
      expect(b.log.length).toBe(logLen);
      expect(battleSummary(b)).toEqual(s);
      expect(s.winner).toBe(b.winner);
      expect(s.turnsTaken).toBe(b.turnsTaken);
      expect(s.units).toHaveLength(b.combatants.length);
      for (const u of s.units) {
        const c = b.get(u.uid)!;
        expect(u.classId).toBe(c.defId);
        expect(u.side).toBe(c.side);
        expect(u.hp).toBe(Math.max(0, c.hp));
        expect(u.maxHp).toBe(c.maxHp);
        expect(u.hpRatio).toBeCloseTo(Math.max(0, c.hp) / c.maxHp, 10);
        expect(u.alive).toBe(c.hp > 0);
        expect(u.summoned).toBe(c.summoned);
        if (!u.alive && !u.summoned) expect(u.corpse).toBeDefined();
        if (u.alive || u.summoned) expect(u.corpse).toBeUndefined();
      }
      // sefer can taşıma: oyuncunun çağrı olmayan birimleri
      expect(s.units.filter((u) => u.side === 'party' && !u.summoned).length).toBe(4);
    });
  }
});

describe('hazır çağrı düşman (Skeleton / Treant)', () => {
  for (const mode of MODES) {
    it(`${mode}: data/summons birimi doğrudan takıma konur, çağrı kurallarıyla (sahipsiz, süresiz, ceset bırakmaz)`, () => {
      const teams: Teams = { party: cells({ 0: 'warrior', 6: 'mage' }), enemies: cells({ 0: 'skeleton', 1: 'treant', 6: 'undead' }) };
      const b = make(9, mode, teams);
      const sk = b.combatants.find((c) => c.defId === 'skeleton')!;
      const tr = b.combatants.find((c) => c.defId === 'treant')!;
      expect(sk.summoned).toBe(true);
      expect(tr.summoned).toBe(true);
      expect(sk.owner).toBeUndefined();
      expect(sk.lifespan).toBeUndefined();
      expect(sk.maxHp).toBe(content.summons.skeleton!.stats.hp);
      expect(b.combatants.find((c) => c.defId === 'undead')!.summoned).toBe(false);
      expect(b.debugKill(sk.uid).ok).toBe(true);
      expect(b.corpseOf(sk.uid)).toBeNull();
      playOut(b);
      expect(b.winner).not.toBeNull();
    });
  }
});

describe('tur başına ek eylem (actionsPerTurn)', () => {
  const bossTeams = (n: number): Teams => ({
    party: cells({ 0: 'warrior', 1: 'archer', 6: 'mage' }),
    enemies: cells({ 1: 'defender' }),
    units: { enemies: { 1: { displayName: 'Bridge Warden', tier: 'boss', modifiers: { hpMult: 6, statMult: 1.5, actionsPerTurn: n } } } },
  });

  it('turns: boss kendi turunda 2 eylem yapar; ek turnStart extra:true, tur başı işlemleri tekrarlanmaz', () => {
    const b = make(5, 'turns', bossTeams(2));
    const boss = b.get('enemy-0')!;
    expect(boss.actionsPerTurn).toBe(2);
    let guard = 0;
    while (b.currentActor?.uid !== boss.uid && guard++ < 50) {
      const uid = b.currentActor!.uid;
      b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
    }
    expect(b.currentActor?.uid).toBe(boss.uid);
    const mark = b.log.length;
    const r1 = b.applyChoice(boss.uid, chooseAction(b, boss.uid, content.aiConfig));
    expect(r1.ok).toBe(true);
    const ev1 = b.log.slice(mark);
    const extra = ev1.filter((e) => e.type === 'turnStart');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ type: 'turnStart', actor: boss.uid, extra: true });
    expect(ev1.some((e) => e.type === 'mpRegen' && e.actor === boss.uid && !e.cause)).toBe(false);
    expect(b.currentActor?.uid).toBe(boss.uid);
    const mark2 = b.log.length;
    expect(b.applyChoice(boss.uid, chooseAction(b, boss.uid, content.aiConfig)).ok).toBe(true);
    if (!b.winner) {
      const starts = b.log.slice(mark2).filter((e) => e.type === 'turnStart');
      expect(starts[0]).toBeDefined();
      expect(starts[0]!.type === 'turnStart' && starts[0]!.extra).toBeFalsy();
      expect(b.currentActor?.uid).not.toBe(boss.uid);
    }
  });

  it('turns: Skip Turn ek eylemleri bitirir; tüm savaş YZ ile biter', () => {
    const b = make(6, 'turns', bossTeams(3));
    const boss = b.get('enemy-0')!;
    let guard = 0;
    while (b.currentActor?.uid !== boss.uid && guard++ < 50) {
      const uid = b.currentActor!.uid;
      b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
    }
    expect(b.act(boss.uid, { kind: 'global', id: 'skip_turn' }).ok).toBe(true);
    expect(b.currentActor?.uid).not.toBe(boss.uid);
    playOut(b, 1000);
    expect(b.winner).not.toBeNull();
  });

  it('test modunda etkisiz (sıra yok); aynı seed = aynı savaş', () => {
    const a = playOut(make(8, 'test', bossTeams(2)));
    expect(a.some((e) => e.type === 'turnStart')).toBe(false);
    expect(playOut(make(8, 'turns', bossTeams(2)))).toEqual(playOut(make(8, 'turns', bossTeams(2))));
  });
});

// Sefer tutorial'ı (Ömer şikâyeti 2026-10-08: Mill Road Cutpurse ultisini hemen atıyor): UnitSetup.lockSkills ve initialCooldownBonus.
describe('lockSkills ve initialCooldownBonus', () => {
  const ULT = 'backstab'; // Cutthroat 4. yuva (initialCooldown'lu)
  for (const mode of MODES) {
    it(`${mode}: kilitli skill canUse 'Locked', YZ hiç seçmez; diğer skill'ler serbest; aynı seed = aynı savaş`, () => {
      const units = { enemies: { 2: { lockSkills: [ULT] } as UnitSetup } };
      const b = make(3, mode, { ...TEAMS, units });
      const ct = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'cutthroat')!;
      expect(ct.lockedSkills).toEqual([ULT]);
      expect(ct.skills).toContain(ULT); // listede kalır
      b.noCooldowns = true;
      if (mode === 'turns') for (let i = 0; i < 200 && b.currentUid !== ct.uid && !b.winner; i++) b.skipTurn();
      expect(b.canUse(ct.uid, ULT)).toEqual({ ok: false, reason: 'Locked' });
      expect(b.canUse(ct.uid, 'venom_edge').ok).toBe(true);
      const log = playOut(make(3, mode, { ...TEAMS, units }));
      expect(log.some((e) => e.type === 'skillUsed' && e.actor === ct.uid && e.skill === ULT)).toBe(false);
      expect(JSON.stringify(playOut(make(3, mode, { ...TEAMS, units })))).toBe(JSON.stringify(log));
    });
  }

  it('turns: initialCooldownBonus cooldown\'lu her skill\'in başlangıç cooldown\'una eklenir (maxInitial aşılabilir); cooldown\'suz temel saldırı serbest; çağrılara ve test moduna etki yok', () => {
    const bonus = f.cooldown.maxInitial; // initialCooldown + bonus > maxInitial
    const b = make(5, 'turns', { ...TEAMS, units: { enemies: { 0: { initialCooldownBonus: bonus }, 2: { initialCooldownBonus: bonus } } } });
    const w = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    const ct = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'cutthroat')!;
    const S = content.skills;
    expect(ct.cooldowns[ULT]).toBe(Math.min(f.cooldown.maxInitial, S[ULT]!.initialCooldown!) + bonus);
    expect(ct.cooldowns[ULT]!).toBeGreaterThan(f.cooldown.maxInitial);
    for (const id of w.skills) {
      const sk = S[id]!;
      const expected = (sk.cooldown ?? 0) > 0 || (sk.initialCooldown ?? 0) > 0 ? Math.min(f.cooldown.maxInitial, sk.initialCooldown ?? 0) + bonus : 0;
      expect(w.cooldowns[id] ?? 0, id).toBe(expected);
    }
    expect(w.cooldowns.melee_attack ?? 0).toBe(0);
    // bonus yokken eskisi gibi
    const plain = make(5, 'turns');
    expect(plain.combatants.find((c) => c.side === 'enemy' && c.defId === 'cutthroat')!.cooldowns[ULT]).toBe(Math.min(f.cooldown.maxInitial, S[ULT]!.initialCooldown!));
    // test modunda cooldown yok
    const t = make(5, 'test', { ...TEAMS, units: { enemies: { 2: { initialCooldownBonus: bonus } } } });
    expect(t.combatants.find((c) => c.side === 'enemy' && c.defId === 'cutthroat')!.cooldowns[ULT] ?? 0).toBe(0);
    // birimin kendi ilk (min + bonus) turunda kullanılamaz, sonra kullanılabilir
    const n = ct.cooldowns[ULT]!;
    let own = 0;
    for (let i = 0; i < 600 && !b.winner && own <= n; i++) {
      if (b.currentUid === ct.uid) {
        own++;
        b.noCooldowns = false;
        const can = b.canUse(ct.uid, ULT);
        const reason = can.ok ? undefined : can.reason;
        if (own <= n) expect(reason, `tur ${own}`).toBe('On cooldown');
        else expect(reason).not.toBe('On cooldown');
      }
      b.skipTurn();
    }
  });
});
