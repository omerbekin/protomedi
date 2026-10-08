import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Battle, attributePower, content, deriveStats, describeStat, previewSkill } from '../src/engine';
import type { Attribute, CombatantData } from '../src/engine';

const f = content.formulas;
const ATTRS: Attribute[] = ['str', 'int', 'dex', 'luck'];
const classes = Object.values(content.classes);
const sum = (a: Record<Attribute, number>) => a.str + a.int + a.dex + a.luck;

const base: CombatantData = {
  id: 'x', name: 'X', spriteId: 'x', color: '#ffffff', logo: 'sword', frontPriority: 0,
  attributes: { str: 8, int: 8, dex: 8, luck: 6 }, armor: 0, magicArmor: 0, skills: [],
};
const mk = (primary: Attribute | undefined, attributes: CombatantData['attributes']) =>
  deriveStats({ ...base, ...(primary ? { primary } : {}), attributes }, f);

describe('stat toplamı ve primary stat (class verisi)', () => {
  for (const def of classes) {
    it(`${def.id}: dört stat toplamı 30`, () => {
      expect(sum(def.attributes)).toBe(30);
    });
    it(`${def.id}: primary tanımlı ve class'ın en yüksek statıyla uyumlu`, () => {
      expect(def.primary, def.id).toBeDefined();
      expect(ATTRS).toContain(def.primary);
      expect(def.attributes[def.primary!]).toBe(Math.max(...ATTRS.map((a) => def.attributes[a])));
      expect(def.stats.primaryActive).toBe(true);
    });
  }

  it("hiçbir class dex 0 değil (en az 2); çevik class'lar (Archer, Anti-Mage, Gambler, Cutthroat) çevik olmayanlardan çok dex taşır", () => {
    for (const def of classes) expect(def.attributes.dex, def.id).toBeGreaterThanOrEqual(2);
    const AGILE = ['archer', 'antimage', 'gambler', 'cutthroat'];
    const agile = AGILE.map((id) => content.classes[id]!.attributes.dex);
    const slow = classes.filter((c) => !AGILE.includes(c.id)).map((c) => c.attributes.dex);
    expect(Math.min(...agile)).toBeGreaterThan(Math.max(...slow));
    // En yüksek dex dex-primary bir class'ta (Cutthroat 15, Archer 14)
    const top = Math.max(...classes.map((c) => c.attributes.dex));
    expect(classes.filter((c) => c.attributes.dex === top).every((c) => c.primary === 'dex')).toBe(true);
    expect(content.classes.cutthroat!.attributes.dex).toBe(top);
  });

  it('çağrılan birimlerin primary statı yok ve bonus almazlar', () => {
    for (const s of Object.values(content.summons)) {
      expect(s.primary).toBeUndefined();
      expect(s.stats.primaryActive).toBe(false);
      expect([s.stats.resilience, s.stats.hunterMark, s.stats.manaEcho, s.stats.surviveChance]).toEqual([0, 0, 0, 0]);
      expect(s.stats.magicArmor).toBe(0);
      expect(s.stats.spellPowerMult).toBe(1);
    }
  });
});

describe('Dex evasion verir, Luck accuracy verir; skill ölçek çarpanları 1x', () => {
  it('Dex arttıkça evasion artar (tam sayı adımlı, azalan getiri yok, evasionMax üst sınırı); primary olmasa da verir', () => {
    const a = f.attributes;
    const ev = (dex: number) => mk(undefined, { str: 0, int: 0, dex, luck: 0 }).evasion;
    expect(ev(0)).toBe(0);
    expect(ev(a.dexPerEvasionStep)).toBeCloseTo(a.evasionPerStep, 10);
    // her dexPerEvasionStep dex tam bir adım: dex 5 -> %2, 10 -> %4, 15 -> %6 (varsayılan veriyle)
    for (const dex of [3, 6, 9, 13, 14, 15, 30]) expect(ev(dex), `dex ${dex}`).toBeCloseTo(Math.min(a.evasionMax, Math.floor(dex / a.dexPerEvasionStep) * a.evasionPerStep), 10);
    // yüzde her zaman tam sayı
    for (let d = 0; d <= 40; d++) expect(Number.isInteger(Math.round(ev(d) * 10000) / 100), `dex ${d}`).toBe(true);
    expect(ev(10000)).toBe(a.evasionMax);
    expect(a.evasionMax).toBeLessThanOrEqual(0.75);
    expect('evasionK' in a).toBe(false);
    expect('min' in f.hit).toBe(false); // hit şansı alt sınırı kaldırıldı
  });

  it('Luck arttıkça accuracy artar; kritik çarpanı SABİT (Luck artırmaz)', () => {
    const lk = (luck: number) => mk(undefined, { str: 0, int: 0, dex: 0, luck });
    expect(lk(0).accuracy).toBeCloseTo(f.attributes.accuracyBase, 10);
    expect(lk(10).accuracy).toBeCloseTo(f.attributes.accuracyBase + 10 * f.attributes.accuracyPerLuck, 10);
    expect(lk(10).accuracy).toBeGreaterThan(lk(5).accuracy);
    expect(lk(0).critMult).toBe(f.attributes.critMult);
    expect(lk(30).critMult).toBe(f.attributes.critMult);
    expect(lk(30).critChance).toBeGreaterThan(lk(0).critChance); // kritik ŞANSI Luck'tan gelmeye devam eder
    expect('critMultPerLuck' in f.attributes).toBe(false);
  });

  it('Dex hâlâ hız verir', () => {
    expect(mk('str', { str: 10, int: 0, dex: 20, luck: 0 }).spd).toBeGreaterThan(mk('str', { str: 10, int: 0, dex: 0, luck: 0 }).spd);
  });

  it('tüm stat ölçek çarpanları 1; Int primary değilken güç = stat', () => {
    for (const a of ATTRS) expect(f.scaling[a]).toBe(1);
    const s = mk('str', { str: 10, int: 12, dex: 4, luck: 4 });
    for (const a of ATTRS) expect(attributePower(s, a, f)).toBe(s[a]);
  });
});

describe('primary bonusları (formulas.json > primaryBonus)', () => {
  it("Str primary: Resilience (debuff 1 tur kısalma şansı); diğer bonuslar yok", () => {
    const s = mk('str', { str: 12, int: 6, dex: 6, luck: 6 });
    const none = mk(undefined, { str: 12, int: 6, dex: 6, luck: 6 });
    expect(s.resilience).toBe(f.primaryBonus.str.resilienceChance);
    expect(s.resilience).toBeGreaterThan(0);
    expect(none.resilience).toBe(0);
    expect([s.hunterMark, s.manaEcho, s.spellPowerMult, s.magicArmor]).toEqual([0, 0, 1, 0]);
    expect(s.hpRegen).toBe(none.hpRegen); // yenilenme yalnızca Str x hpRegenPerStr
  });

  it("Dex primary: Hunter's Mark (hedefinden hızlıysa fazla hasar); evasion Dex statından gelir, primary bonusu evasion eklemez", () => {
    const a = mk('dex', { str: 6, int: 6, dex: 12, luck: 6 });
    const none = mk(undefined, { str: 6, int: 6, dex: 12, luck: 6 });
    expect(a.hunterMark).toBe(f.primaryBonus.dex.hunterMarkMult);
    expect(a.hunterMark).toBeGreaterThan(0);
    expect(none.hunterMark).toBe(0);
    expect(a.evasion).toBe(none.evasion);
    expect([a.resilience, a.manaEcho]).toEqual([0, 0]);
  });

  it('Int primary: Mana Echo (skill sonrası MP iadesi şansı); büyü zırhı, hasar/şifa çarpanı ve kritik DEĞİŞMEZ', () => {
    const s = mk('int', { str: 6, int: 12, dex: 6, luck: 6 });
    const none = mk(undefined, { str: 6, int: 12, dex: 6, luck: 6 });
    expect(s.manaEcho).toBe(f.primaryBonus.int.manaEchoChance);
    expect(s.manaEcho).toBeGreaterThan(0);
    expect(none.manaEcho).toBe(0);
    expect(s.magicArmor).toBe(none.magicArmor); // Arcane Ward kalktı
    expect(attributePower(s, 'int', f)).toBe(12);
    expect(s.critChance).toBe(none.critChance);
    expect(s.surviveChance).toBe(0);
    expect(s.mpRegen).toBe(none.mpRegen);
  });

  it('Luck primary: ölümden kurtulma şansı verir; kritik şansı/accuracy yalnızca Luck statından gelir', () => {
    const none = mk(undefined, { str: 6, int: 6, dex: 6, luck: 12 });
    const s = mk('luck', { str: 6, int: 6, dex: 6, luck: 12 });
    expect(s.surviveChance).toBe(f.primaryBonus.luck.surviveChance);
    expect(s.surviveChance).toBeGreaterThan(0);
    expect(none.surviveChance).toBe(0);
    expect(s.critChance).toBe(none.critChance);
    expect(s.critMult).toBe(none.critMult);
    expect(s.accuracy).toBe(none.accuracy);
    expect([s.resilience, s.hunterMark, s.manaEcho]).toEqual([0, 0, 0]);
  });

  it('primary en yüksek stat DEĞİLSE bonus kapalı', () => {
    const s = mk('dex', { str: 12, int: 6, dex: 8, luck: 4 });
    expect(s.primaryActive).toBe(false);
    expect(s.hunterMark).toBe(0);
    const t = mk('str', { str: 5, int: 15, dex: 5, luck: 5 });
    expect([t.primaryActive, t.resilience]).toEqual([false, 0]);
    const u = mk('int', { str: 5, int: 5, dex: 15, luck: 5 });
    expect(u.manaEcho).toBe(0);
  });

  it('eşitlikte bonus AKTİF (en yüksek statla berabere)', () => {
    const s = mk('dex', { str: 10, int: 4, dex: 10, luck: 6 });
    expect(s.primaryActive).toBe(true);
    expect(s.hunterMark).toBe(f.primaryBonus.dex.hunterMarkMult);
  });

  it('eski bonuslar kaldırıldı: Iron Skin, Momentum, Arcane Ward alanları ne veride ne motorda var', () => {
    expect('physReduction' in f.primaryBonus.str).toBe(false);
    expect('momentum' in f.primaryBonus.dex).toBe(false);
    expect('magicArmor' in f.primaryBonus.int).toBe(false);
    const s = mk('str', { str: 12, int: 6, dex: 6, luck: 6 }) as unknown as Record<string, unknown>;
    expect('physReduction' in s || 'momentum' in s).toBe(false);
    for (const file of ['src/engine/battle.ts', 'src/engine/stats.ts', 'src/engine/stat-info.ts', 'src/engine/spec.ts', 'data/formulas.json']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/Iron Skin|Momentum|Arcane Ward|physReduction|primary_dex/);
    }
  });
});

describe('Str: düz can yenilenmesi, Int: MP yenilenmesi (turns modu)', () => {
  it('hpRegen = Str x hpRegenPerStr; mpRegen = round(Int x mpRegenPerInt); 0 Int = 0 MP regen', () => {
    for (const str of [0, 4, 14, 30]) expect(mk(undefined, { str, int: 0, dex: 0, luck: 0 }).hpRegen).toBeCloseTo(str * f.attributes.hpRegenPerStr, 10);
    for (const int of [0, 4, 14, 30]) expect(mk(undefined, { str: 0, int, dex: 0, luck: 0 }).mpRegen).toBe(Math.round(int * f.attributes.mpRegenPerInt));
    expect(mk('str', { str: 30, int: 0, dex: 0, luck: 0 }).mpRegen).toBe(0);
    expect(mk(undefined, { str: 0, int: 20, dex: 0, luck: 0 }).hpRegen).toBe(0);
  });

  it("class'larda sabit mpRegen alanı yok: her class'ın mpRegen'i Int'inden türer", () => {
    for (const def of classes) {
      expect(def.stats.mpRegen, def.id).toBe(Math.round(def.attributes.int * f.attributes.mpRegenPerInt));
      expect(def.stats.hpRegen, def.id).toBeCloseTo(def.attributes.str * f.attributes.hpRegenPerStr, 10);
    }
  });

  it('turns modunda kendi turunun başında düz can yenilenir; tam canda yenilenme olayı yok', () => {
    const b = new Battle(content.battleSetup('first-battle', 1, 'turns'));
    const w = b.combatants.find((c) => c.defId === 'warrior' && c.side === 'party')!;
    const expected = Math.round(w.stats.hpRegen);
    expect(expected).toBeGreaterThan(0);
    for (let i = 0; i < 100 && b.currentUid !== w.uid; i++) b.skipTurn();
    w.hp = 10;
    b.skipTurn();
    const from = b.log.length;
    for (let i = 0; i < 100 && b.currentUid !== w.uid; i++) b.skipTurn();
    const heals = b.log.slice(from).filter((e) => e.type === 'heal' && e.target === w.uid && e.source === w.uid);
    expect(heals[0]).toMatchObject({ type: 'heal', amount: expected });
    // Savaş başında kimse yaralı değil: yenilenme olayı yok
    const full = new Battle(content.battleSetup('first-battle', 1, 'turns'));
    expect(full.log.some((e) => e.type === 'heal')).toBe(false);
  });
});

const nextRoll = (b: Battle): number => (b as unknown as { rng: { next(): number } }).rng.next(); // RNG akışının nerede olduğunu ölçer (zar atıldı mı?)
const teamsPB = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };
const calmAll = (b: Battle) => {
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
};
const passives = (events: { type: string; passive?: string }[], id: string) => events.filter((e) => e.type === 'passive' && e.passive === id).length;

describe('Str primary: Resilience savaşta', () => {
  const chance = f.primaryBonus.str.resilienceChance;
  const mkRes = (seed: number, mode: 'turns' | 'test' = 'test', res = chance) => {
    const b = calmAll(new Battle(content.battleSetup('first-battle', seed, mode, teamsPB)));
    const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    victim.stats.resilience = res;
    return { b, victim };
  };
  const turnsOf = (victim: { statuses: { kind: string; turns: number }[] }, kind: string) => victim.statuses.find((s) => s.kind === kind)?.turns;

  it('olasılık veriden: resilienceChance 0,35 ve Str-primary class bunu alır', () => {
    expect(chance).toBe(0.35);
    for (const def of classes) expect(def.stats.resilience, def.id).toBe(def.primary === 'str' ? chance : 0);
  });

  it('debuff uygulanırken %35 ihtimalle 1 tur kısalır; oran veriye uyar (iki modda da)', () => {
    for (const mode of ['test', 'turns'] as const) {
      let shorter = 0;
      const N = 1500;
      for (let seed = 1; seed <= N; seed++) {
        const { b, victim } = mkRes(seed, mode);
        expect(b.debugAddStatus(victim.uid, 'slow', 3).ok).toBe(true);
        const t = turnsOf(victim, 'slow')!;
        expect([2, 3]).toContain(t);
        if (t === 2) shorter++;
      }
      expect(Math.abs(shorter / N - chance), mode).toBeLessThan(0.05);
    }
  });

  it('tüm debuff türleri (data/statuses.json type=debuff) etkilenir; buff etkilenmez ve zar harcamaz', () => {
    const debuffs = Object.entries(content.statuses).filter(([, d]) => d.type === 'debuff').map(([id]) => id);
    const buffs = Object.entries(content.statuses).filter(([, d]) => d.type === 'buff').map(([id]) => id);
    expect(debuffs).toEqual(expect.arrayContaining(['slow', 'wound', 'stun']));
    for (const kind of debuffs) {
      const { b, victim } = mkRes(1, 'test', 1); // şans 1: her debuff kısalır
      b.debugAddStatus(victim.uid, kind, 3);
      expect(turnsOf(victim, kind), kind).toBe(2);
    }
    for (const kind of buffs) {
      const { b, victim } = mkRes(1, 'test', 1);
      const before = nextRoll(b);
      const x = mkRes(1, 'test', 1);
      x.b.debugAddStatus(x.victim.uid, kind, 3);
      expect(turnsOf(x.victim, kind), kind).toBe(3); // buff kısalmaz
      expect(nextRoll(x.b), kind).toBe(before); // zar atılmadı
      void victim;
    }
  });

  it('tur sayısı 1in altına inmez: 1 turluk debuff etkilenmez ve zar harcamaz; uzun debuff tek seferde yalnızca 1 azalır', () => {
    const one = mkRes(1, 'test', 1);
    const ref = mkRes(1, 'test', 1);
    one.b.debugAddStatus(one.victim.uid, 'stun', 1);
    expect(turnsOf(one.victim, 'stun')).toBe(1);
    expect(nextRoll(one.b)).toBe(nextRoll(ref.b));
    for (const turns of [2, 3, 5]) {
      const { b, victim } = mkRes(1, 'test', 1);
      b.debugAddStatus(victim.uid, 'slow', turns);
      expect(turnsOf(victim, 'slow')).toBe(turns - 1);
    }
  });

  it('şans 0 ya da Str-primary olmayan birim: hiç kısalmaz ve zar atılmaz', () => {
    const none = mkRes(1, 'test', 0);
    const ref = mkRes(1, 'test', 0);
    none.b.debugAddStatus(none.victim.uid, 'slow', 3);
    expect(turnsOf(none.victim, 'slow')).toBe(3);
    expect(nextRoll(none.b)).toBe(nextRoll(ref.b));
  });

  it('gerçek skill: Thorn Whip (wound, 2 tur) Str-primary hedefte 1 tura inebilir, hiçbir zaman 0a inmez; event: passive Resilience', () => {
    let short = 0;
    let seen = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const b = calmAll(new Battle(content.battleSetup('first-battle', seed, 'test', { party: ['druid', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] })));
      const druid = b.combatants.find((c) => c.side === 'party' && c.defId === 'druid')!;
      const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
      victim.hp = victim.maxHp = 100000;
      victim.stats.resilience = 1;
      const r = b.useSkill(druid.uid, 'thorn_whip', victim.uid);
      if (!r.ok) throw new Error(r.reason);
      seen++;
      const wound = victim.statuses.find((s) => s.kind === 'wound');
      expect(wound?.turns).toBe(1);
      short++;
      expect(passives(r.events, 'primary_str')).toBe(1);
      expect(r.events.some((e) => e.type === 'passive' && e.name === 'Resilience')).toBe(true);
    }
    expect(seen).toBe(short);
  });

  it('ground (yer etkisi) süresi etkilenmez; yer etkileri karakter üstüne debuff bırakmaz, tik hasarı zar atmaz', () => {
    // Meteor/Wail/Judgment: ground kendi turn sayacını taşır; Resilience yalnızca karakter üstündeki durumlara (statuses) bakar.
    for (const [skillId, skill] of Object.entries(content.skills)) {
      const grounds = skill.effects.filter((e) => e.type === 'ground');
      if (grounds.length === 0) continue;
      const b = calmAll(new Battle(content.battleSetup('first-battle', 2, 'test', { party: ['mage', 'paladin', 'undead', 'archer'], enemies: ['warrior', 'defender', 'archer', 'mage'] })));
      const actor = b.combatants.find((c) => c.side === 'party' && c.skills.includes(skillId));
      if (!actor) continue; // boss skill'i (Breaking Span: telgraflı, zemin çözülmede; tests/bridge-warden.test.ts)
      const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
      victim.hp = victim.maxHp = 100000;
      victim.stats.resilience = 1;
      actor.mp = actor.maxMp = 999;
      const r = skill.target === 'area_enemies' || skill.target === 'single_enemy' ? b.useSkill(actor.uid, skillId, victim.uid, victim.slot) : b.useSkill(actor.uid, skillId, victim.uid);
      if (!r.ok) continue;
      expect(passives(r.events, 'primary_str'), skillId).toBe(0);
      for (const g of b.ground) expect(g.turns, skillId).toBe(grounds.find((e) => e.type === 'ground' && e.ground === g.ground)?.turns ?? g.turns);
    }
  });

  it('aynı seed aynı sonuç (belirleyici)', () => {
    const run = (seed: number) => {
      const { b, victim } = mkRes(seed);
      b.debugAddStatus(victim.uid, 'slow', 3);
      b.debugAddStatus(victim.uid, 'wound', 4);
      return JSON.stringify([turnsOf(victim, 'slow'), turnsOf(victim, 'wound'), nextRoll(b)]);
    };
    expect(run(9)).toBe(run(9));
  });
});

describe("Dex primary: Hunter's Mark savaşta", () => {
  const mult = 1 + f.primaryBonus.dex.hunterMarkMult;
  const setup = (mode: 'turns' | 'test', hunter: number, actorSpd: number, targetSpd: number) => {
    const b = calmAll(new Battle(content.battleSetup('first-battle', 1, mode, teamsPB)));
    const attacker = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'defender')!;
    attacker.stats.hunterMark = hunter;
    attacker.stats.str = 400; // büyük sayılar: yuvarlama payı oranı bozmasın (hedef zırhı/skill gücü veriden değişebilir)
    attacker.stats.spd = actorSpd;
    victim.stats.spd = targetSpd;
    victim.hp = victim.maxHp = 100000;
    delete attacker.passive; // rage vb. pasifler oranı bozmasın
    if (mode === 'turns') b.currentUid = attacker.uid; // turns modunda yalnızca sırası gelen oynar
    return { b, attacker, victim };
  };
  const hitTotal = (x: ReturnType<typeof setup>) => {
    const r = x.b.useSkill(x.attacker.uid, 'melee_attack', x.victim.uid);
    if (!r.ok) throw new Error(r.reason);
    return r.events.filter((e) => e.type === 'damage').reduce((t, e) => t + (e as { amount: number; absorbed: number }).amount + (e as { absorbed: number }).absorbed, 0);
  };

  it('veriden: hunterMarkMult 0,15 ve yalnızca Dex-primary class alır', () => {
    expect(f.primaryBonus.dex.hunterMarkMult).toBe(0.15);
    for (const def of classes) expect(def.stats.hunterMark, def.id).toBe(def.primary === 'dex' ? f.primaryBonus.dex.hunterMarkMult : 0);
  });

  it('hedefinden daha hızlıysa +%15 hasar; eşit ya da yavaşsa bonus yok (iki modda da)', () => {
    for (const mode of ['test', 'turns'] as const) {
      const plain = hitTotal(setup(mode, 0, 20, 5));
      const fast = hitTotal(setup(mode, f.primaryBonus.dex.hunterMarkMult, 20, 5));
      const equal = hitTotal(setup(mode, f.primaryBonus.dex.hunterMarkMult, 10, 10));
      const slow = hitTotal(setup(mode, f.primaryBonus.dex.hunterMarkMult, 5, 20));
      expect(fast, mode).toBeGreaterThan(plain);
      expect(fast / plain, mode).toBeGreaterThan(mult - 0.04);
      expect(fast / plain, mode).toBeLessThan(mult + 0.04);
      expect(equal, mode).toBe(plain);
      expect(slow, mode).toBe(plain);
    }
  });

  it('geçerli hız sayılır: hedef Slow olunca bonus başlar', () => {
    const x = setup('test', f.primaryBonus.dex.hunterMarkMult, 8, 9);
    expect(x.b.hunterMarkMult(x.attacker, x.victim)).toBe(1);
    x.b.debugAddStatus(x.victim.uid, 'slow', 3);
    expect(x.b.speedOf(x.victim)).toBeLessThan(x.b.speedOf(x.attacker));
    expect(x.b.hunterMarkMult(x.attacker, x.victim)).toBeCloseTo(mult, 10);
  });

  it('önizleme bonusu yansıtır', () => {
    const fast = setup('test', f.primaryBonus.dex.hunterMarkMult, 20, 5);
    const slow = setup('test', f.primaryBonus.dex.hunterMarkMult, 5, 20);
    const pf = previewSkill(fast.b, fast.attacker.uid, 'melee_attack', fast.victim.uid)[0]!.damage!;
    const ps = previewSkill(slow.b, slow.attacker.uid, 'melee_attack', slow.victim.uid)[0]!.damage!;
    // avg küçük sayılarda yuvarlamadan oynar; min+max daha kararlı bir ölçüdür
    const ratio = (pf.min + pf.max) / (ps.min + ps.max);
    expect(pf.avg).toBeGreaterThan(ps.avg);
    expect(ratio).toBeGreaterThan(mult - 0.08);
    expect(ratio).toBeLessThan(mult + 0.08);
  });

  it('yalnızca hasar veren vuruşlar: kalkan/şifa değişmez', () => {
    const mk2 = (hunter: number) => {
      const x = setup('test', hunter, 20, 5);
      x.attacker.stats.hunterMark = hunter;
      return x;
    };
    const shieldSkill = content.classes.defender!.skills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'shield' && e.self));
    if (shieldSkill) {
      const a = mk2(0);
      const c = mk2(f.primaryBonus.dex.hunterMarkMult);
      const defA = a.b.combatants.find((u) => u.side === 'party' && u.defId === 'warrior')!;
      void defA;
      expect(previewSkill(a.b, a.attacker.uid, shieldSkill, a.attacker.uid)).toEqual(previewSkill(c.b, c.attacker.uid, shieldSkill, c.attacker.uid));
    }
  });
});

describe('Int primary: Mana Echo savaşta', () => {
  const chance = f.primaryBonus.int.manaEchoChance;
  const mkEcho = (seed: number, echo: number, mode: 'turns' | 'test' = 'test') => {
    const b = calmAll(new Battle(content.battleSetup('first-battle', seed, mode, teamsPB)));
    const caster = b.combatants.find((c) => c.side === 'party' && c.defId === 'mage')!;
    caster.stats.manaEcho = echo;
    return { b, caster };
  };
  const costed = Object.entries(content.skills).filter(([id]) => content.classes.mage!.skills.includes(id)).filter(([, s]) => s.cost.resource === 'mp' && s.cost.amount > 0);
  const targetFor = (b: Battle, id: string) => {
    const t = content.skills[id]!.target;
    if (t === 'single_enemy' || t === 'area_enemies') return b.combatants.find((c) => c.side === 'enemy' && c.hp > 0)!.uid;
    if (t === 'single_ally') return b.combatants.find((c) => c.side === 'party' && c.hp > 0)!.uid;
    return undefined;
  };

  it('veriden: manaEchoChance 0,20; yalnızca Int-primary class alır', () => {
    expect(chance).toBe(0.2);
    for (const def of classes) expect(def.stats.manaEcho, def.id).toBe(def.primary === 'int' ? chance : 0);
  });

  it('şans 1: bedelin yarısı (yukarı yuvarla, en az 1) geri gelir; olay passive Mana Echo + mpRegen', () => {
    expect(costed.length).toBeGreaterThan(0);
    for (const [id, skill] of costed) {
      const { b, caster } = mkEcho(1, 1);
      caster.cooldowns = {};
      const before = caster.mp;
      const r = b.useSkill(caster.uid, id, targetFor(b, id), content.skills[id]!.target === 'area_enemies' ? b.combatants.find((c) => c.side === 'enemy')!.slot : undefined);
      if (!r.ok) throw new Error(`${id}: ${r.reason}`);
      const back = Math.max(1, Math.ceil(skill.cost.amount / 2));
      expect(caster.mp, id).toBe(before - skill.cost.amount + back);
      expect(passives(r.events, 'primary_int'), id).toBe(1);
      expect(r.events.some((e) => e.type === 'passive' && e.name === 'Mana Echo')).toBe(true);
      expect(r.events.some((e) => e.type === 'mpRegen' && e.actor === caster.uid && e.amount === back), id).toBe(true);
    }
  });

  it('şans 0: iade yok; MP üst sınırını aşmaz', () => {
    const [id, skill] = costed[0]!;
    const { b, caster } = mkEcho(1, 0);
    const before = caster.mp;
    b.useSkill(caster.uid, id, targetFor(b, id));
    expect(caster.mp).toBe(before - skill.cost.amount);
    // üst sınır: iade en fazla maxMp - mp (bedel zaten düşüldüğü için tam dolmaz ama sınır korunur)
    const x = mkEcho(1, 1);
    x.caster.mp = x.caster.maxMp;
    x.b.useSkill(x.caster.uid, id, targetFor(x.b, id));
    expect(x.caster.mp).toBeLessThanOrEqual(x.caster.maxMp);
  });

  it('bedelsiz skill iade almaz ve zar harcamaz', () => {
    const free = Object.entries(content.skills).find(([sid, s]) => content.classes.mage!.skills.includes(sid) && s.cost.amount === 0) ?? Object.entries(content.skills).find(([sid, s]) => content.classes.archer!.skills.includes(sid) && s.cost.amount === 0)!;
    const a = mkEcho(1, 1);
    const ref = mkEcho(1, 0);
    const freeId = free[0];
    const actor = (x: { b: Battle; caster: { uid: string; defId: string } }) => (content.classes.mage!.skills.includes(freeId) ? x.caster.uid : x.b.combatants.find((c) => c.side === 'party' && c.defId === 'archer')!.uid);
    const ra = a.b.useSkill(actor(a), freeId, targetFor(a.b, freeId));
    ref.b.useSkill(actor(ref), freeId, targetFor(ref.b, freeId));
    expect(ra.ok && passives(ra.events, 'primary_int')).toBe(0);
    expect(nextRoll(a.b)).toBe(nextRoll(ref.b)); // Mana Echo zarı atılmadı
  });

  it('oran veriye uyar (iki modda da) ve aynı seed aynı sonuç', () => {
    const [id] = costed[0]!;
    for (const mode of ['test', 'turns'] as const) {
      let hits = 0;
      const N = 1200;
      for (let seed = 1; seed <= N; seed++) {
        const { b, caster } = mkEcho(seed, chance, mode);
        if (mode === 'turns') for (let i = 0; i < 100 && b.currentUid !== caster.uid; i++) b.skipTurn();
        const r = b.useSkill(caster.uid, id, targetFor(b, id));
        if (r.ok && passives(r.events, 'primary_int') > 0) hits++;
      }
      expect(Math.abs(hits / N - chance), mode).toBeLessThan(0.04);
    }
    const run = (seed: number) => {
      const { b, caster } = mkEcho(seed, chance);
      b.useSkill(caster.uid, id, targetFor(b, id));
      return caster.mp;
    };
    expect(run(5)).toBe(run(5));
  });
});

describe('arayüz açıklaması: primary stat altın, bonus tooltip\'te', () => {
  it('primary stat tooltip\'i primary işaretlidir ve bonusu anlatır', () => {
    for (const def of classes) {
      const info = describeStat(def.primary!, def.stats, f);
      expect(info.primary, def.id).toBe(true);
      expect(info.lines.join('\n')).toContain('Primary bonus');
      for (const a of ATTRS.filter((x) => x !== def.primary)) expect(describeStat(a, def.stats, f).primary).toBeUndefined();
    }
  });
});

describe('Luck primary: Lucky Escape (ölümcül vuruştan kurtulma) savaşta', () => {
  const teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };
  const setup = (seed: number, chance: number) => {
    const b = new Battle(content.battleSetup('first-battle', seed, 'test', teams));
    for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    const attacker = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    victim.stats.surviveChance = chance;
    victim.hp = 1;
    victim.shield = 0;
    return { b, attacker, victim };
  };

  it('şans 1: ilk ölümcül vuruş yok sayılır, ikinci ölümcül vuruşta (hak bitti) ölür', () => {
    const { b, attacker, victim } = setup(1, 1);
    const r = b.useSkill(attacker.uid, 'melee_attack', victim.uid); // iki vuruş
    expect(r.ok).toBe(true);
    const passives = r.ok ? r.events.filter((e) => e.type === 'passive' && (e as { passive: string }).passive === 'primary_luck') : [];
    expect(passives).toHaveLength(1);
    expect(victim.hp).toBe(0);
  });

  it('madde 258: ölümcül vuruş TAMAMEN yok sayılır (can 35, 40 hasar -> can 35 kalır); olay amount 0 + luckyEscape; kalkan harcanmaz', () => {
    const { b, attacker, victim } = setup(1, 1);
    victim.hp = 35;
    victim.shield = 4;
    b.debug.damageMult = 1000; // kesin ölümcül
    const r = b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(r.ok).toBe(true);
    expect(victim.hp).toBe(35);
    expect(victim.shield).toBe(4);
    const dmg = r.ok ? r.events.filter((e) => e.type === 'damage' && e.target === victim.uid) : [];
    expect(dmg).toHaveLength(1);
    expect(dmg[0]).toMatchObject({ amount: 0, absorbed: 0, hpAfter: 35, shieldAfter: 4, luckyEscape: true });
    // Vuruşa bağlı durum (Charge'ın Stun'ı) yok sayılan vuruşla uygulanmaz
    expect(victim.statuses.some((s) => s.kind === 'stun')).toBe(false);
    expect(r.ok && r.events.some((e) => e.type === 'death' && e.target === victim.uid)).toBe(false);
  });

  it('madde 258: yok sayılan vuruşta lifesteal yok, taunt sayacı işlemez', () => {
    const s = content.battleSetup('first-battle', 1, 'test', teams);
    const steal = { ...content.skills.charge!, id: 'steal_test', effects: content.skills.charge!.effects.map((e) => (e.type === 'damage' ? { ...e, lifesteal: 1 } : e)) };
    s.skills = { ...s.skills, steal_test: steal };
    const b = new Battle(s);
    for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    const attacker = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    victim.stats.surviveChance = 1;
    victim.hp = 10;
    attacker.hp = Math.round(attacker.maxHp / 2);
    const before = attacker.hp;
    victim.statuses.push({ kind: 'taunt', turns: 3, source: victim.uid, breakAt: 5, taken: 0 });
    b.debug.damageMult = 1000;
    attacker.skills = [...attacker.skills, 'steal_test'];
    const r = b.useSkill(attacker.uid, 'steal_test', victim.uid);
    expect(r.ok).toBe(true);
    expect(victim.hp).toBe(10);
    expect(attacker.hp).toBe(before);
    expect(victim.statuses.find((s) => s.kind === 'taunt')?.taken ?? 0).toBe(0);
  });

  it('şans 1: tek ölümcül vuruşta can değişmez', () => {
    const { b, attacker, victim } = setup(1, 1);
    // ilk vuruştan sonra durmak için tek vuruşluk skill: Double Strike yerine Charge
    const r = b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(r.ok).toBe(true);
    expect(victim.hp).toBe(1);
  });

  it('şans 0: kurtulma yok', () => {
    const { b, attacker, victim } = setup(1, 0);
    b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(victim.hp).toBe(0);
  });

  it('aynı seed aynı sonuç (belirleyici); ölümcül olmayan vuruş zar harcamaz', () => {
    const run = (seed: number) => {
      const { b, attacker, victim } = setup(seed, f.primaryBonus.luck.surviveChance);
      b.useSkill(attacker.uid, 'charge', victim.uid);
      return victim.hp;
    };
    expect(run(7)).toBe(run(7));
    const outcomes = new Set<number>();
    for (let s = 1; s <= 60; s++) outcomes.add(run(s));
    expect(outcomes).toEqual(new Set([0, 1])); // şans ne 0 ne 1: iki sonuç da görülür
  });

  it('Luck-primary olmayan birimler kurtulma şansı almaz (class verisi)', () => {
    for (const def of classes) expect(def.stats.surviveChance, def.id).toBe(def.primary === 'luck' ? f.primaryBonus.luck.surviveChance : 0);
  });
});

describe('skill temasına uygun stat (class verisi)', () => {
  it('Undead (Dark Mage, Int primary): hasar/yer etkisi skill\'leri Int ile ölçeklenir', () => {
    for (const id of ['bone_throw', 'wail_of_the_dead']) { // madde 240: Blood Rite kalktı; Dark Bond ölçeksiz (hasar yok)
      const scales = content.skills[id]!.effects.flatMap((e) => ('scale' in e ? [e.scale] : []));
      expect(scales.length, id).toBeGreaterThan(0);
      expect(new Set(scales), id).toEqual(new Set(['int']));
    }
  });

  it('her class\'ın hasar/şifa/kalkan skill\'lerinin çoğu primary statıyla ölçeklenir (Str/Int/Dex/Luck uyumu)', () => {
    for (const def of classes) {
      const scales = def.skills.flatMap((id) => content.skills[id]!.effects.flatMap((e) => ('scale' in e ? [e.scale] : [])));
      const share = scales.filter((s) => s === def.primary).length / scales.length;
      expect(share, def.id).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('Lucky Escape: şans %30, diriltme hakkı geri vermez', () => {
  const teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };
  const make = (seed: number, chance: number, mode: 'turns' | 'test' = 'test') => {
    const b = new Battle(content.battleSetup('first-battle', seed, mode, teams));
    for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    const attacker = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    const victim = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    victim.stats.surviveChance = chance;
    return { b, attacker, victim };
  };
  const luckyCount = (r: { ok: boolean; events?: { type: string; passive?: string }[] }) => (r.events ?? []).filter((e) => e.type === 'passive' && e.passive === 'primary_luck').length;

  it('olasılık veriden: surviveChance 0,30', () => {
    expect(f.primaryBonus.luck.surviveChance).toBe(0.3);
    expect(content.classes.gambler!.stats.surviveChance).toBe(f.primaryBonus.luck.surviveChance);
  });

  it('kurtul -> öl -> diril -> ölümcül vuruş: ikinci kez kurtulma yok (hak diriltmeyle yenilenmez)', () => {
    const { b, attacker, victim } = make(1, 1);
    victim.hp = 1;
    const first = b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(luckyCount(first as never)).toBe(1);
    expect(victim.hp).toBe(1);
    expect(b.debugKill(victim.uid, false).ok).toBe(true);
    expect(b.debugRevive(victim.uid, 1).ok).toBe(true);
    victim.hp = 1;
    victim.stats.surviveChance = 1; // şans kesin olsa bile hak kullanılmış
    const second = b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(luckyCount(second as never)).toBe(0);
    expect(victim.hp).toBe(0);
  });

  it('zar tutmadıysa hak yanmaz: ölüp dirilince hâlâ denenebilir', () => {
    const { b, attacker, victim } = make(1, 0);
    victim.hp = 1;
    b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(victim.hp).toBe(0); // zar tutmadı (şans 0)
    expect(b.debugRevive(victim.uid, 1).ok).toBe(true);
    victim.stats.surviveChance = 1;
    victim.hp = 1;
    const r = b.useSkill(attacker.uid, 'charge', victim.uid);
    expect(luckyCount(r as never)).toBe(1);
    expect(victim.hp).toBe(1);
  });

  it('iki modda da çalışır ve aynı seed aynı sonucu verir', () => {
    for (const mode of ['test', 'turns'] as const) {
      const run = (seed: number) => {
        const { b, attacker, victim } = make(seed, 1, mode);
        victim.hp = 1;
        if (mode === 'turns') for (let i = 0; i < 400 && b.currentUid !== attacker.uid; i++) b.skipTurn();
        const hpBefore = victim.hp; // (turns modunda tur başı yenilenme canı artırmış olabilir)
        b.debug.damageMult = 1000;
        const r = b.useSkill(attacker.uid, 'charge', victim.uid);
        // madde 258: ölümcül vuruş yok sayılır, can değişmez (turns modunda sonraki tur başı yenilenmesi canı sonradan artırabilir: olaydan okunur)
        const hit = r.ok ? r.events.find((e) => e.type === 'damage' && e.target === victim.uid) : undefined;
        return hit && hit.type === 'damage' && hit.luckyEscape ? hit.hpAfter - hpBefore : -1;
      };
      expect(run(3), mode).toBe(0);
      expect(run(3), mode).toBe(run(3));
    }
  });
});
