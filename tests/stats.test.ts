import { describe, expect, it } from 'vitest';
import { Rng, armorReduction, attributePower, content, damageRange, deriveStats, hitChance, rollCrit, rollHit } from '../src/engine';
import type { CombatantData, DamageSpec, Stats } from '../src/engine';

const f = content.formulas;
const base: CombatantData = {
  id: 'x',
  name: 'X',
  spriteId: 'x',
  color: '#ffffff',
  logo: 'sword',
  frontPriority: 0,
  attributes: { str: 10, int: 10, dex: 10, luck: 0 },
  armor: 0,
  magicArmor: 0,
  skills: [],
};
const stats = (over: Partial<CombatantData['attributes']> = {}, extra: Partial<CombatantData> = {}) =>
  deriveStats({ ...base, ...extra, attributes: { ...base.attributes, ...over } }, f);

describe('4 temel özellik ve türev stat\'lar', () => {
  it('Strength can verir, Intelligence mana verir, Dexterity hız verir', () => {
    const s = stats({ str: 20, int: 30, dex: 8 });
    expect(s.hp).toBe(f.attributes.hpBase + f.attributes.hpPerStr * 20);
    expect(s.mp).toBe(f.attributes.mpBase + f.attributes.mpPerInt * 30);
    expect(s.spd).toBe(Math.round(f.attributes.spdBase + f.attributes.spdPerDex * 8));
  });

  it('her özellik yalnızca kendi türevini değiştirir', () => {
    const a = stats();
    const str = stats({ str: 20 });
    expect([str.mp, str.spd, str.evasion, str.accuracy, str.critChance, str.mpRegen]).toEqual([a.mp, a.spd, a.evasion, a.accuracy, a.critChance, a.mpRegen]);
    const int = stats({ int: 20 });
    expect([int.hp, int.spd, int.evasion, int.accuracy, int.critChance, int.hpRegen]).toEqual([a.hp, a.spd, a.evasion, a.accuracy, a.critChance, a.hpRegen]);
    const dex = stats({ dex: 20 });
    expect([dex.hp, dex.mp, dex.critChance, dex.accuracy]).toEqual([a.hp, a.mp, a.critChance, a.accuracy]);
    const luck = stats({ luck: 20 });
    expect([luck.hp, luck.mp, luck.spd, luck.evasion]).toEqual([a.hp, a.mp, a.spd, a.evasion]);
  });

  it('Dexterity evasion (kaçınma) verir: tam sayı adımlı (her dexPerEvasionStep dex = +evasionPerStep), evasionMax üst sınırlı', () => {
    const { dexPerEvasionStep: step, evasionPerStep: per, evasionMax: max } = f.attributes;
    expect(stats({ dex: 0 }).evasion).toBe(0);
    expect(stats({ dex: step - 1 }).evasion).toBe(0); // adım dolmadan kaçınma yok
    expect(stats({ dex: step }).evasion).toBeCloseTo(per, 10);
    expect(stats({ dex: step * 2 }).evasion).toBeCloseTo(per * 2, 10);
    expect(stats({ dex: step * 2 + step - 1 }).evasion).toBeCloseTo(per * 2, 10); // yarım adım sayılmaz
    // tam sayı yüzde: evasion x 100 her zaman tam sayı (adım yüzdesi tam sayı olduğu sürece)
    for (let d = 0; d <= 60; d++) expect(Number.isInteger(Math.round(stats({ dex: d }).evasion * 10000) / 100)).toBe(true);
    // azalan getiri yok: eşit dex artışı eşit evasion artışı verir (üst sınıra kadar)
    expect(stats({ dex: step * 5 }).evasion - stats({ dex: step * 4 }).evasion).toBeCloseTo(stats({ dex: step }).evasion - stats({ dex: 0 }).evasion, 10);
    expect(stats({ dex: 13 }).evasion).toBeCloseTo(Math.floor(13 / step) * per, 10);
    expect(stats({ dex: 100000 }).evasion).toBe(max);
  });

  it('Luck: %5 kritik şansı + accuracy; kritik çarpanı SABİT (Luck artırmaz)', () => {
    const none = stats({ luck: 0 });
    expect(none.critChance).toBeCloseTo(f.attributes.critChanceBase, 10);
    expect(none.critMult).toBe(f.attributes.critMult);
    expect(none.accuracy).toBeCloseTo(f.attributes.accuracyBase, 10);
    const lucky = stats({ luck: 10 });
    expect(lucky.critChance).toBeGreaterThan(none.critChance);
    expect(lucky.accuracy).toBeGreaterThan(none.accuracy);
    expect(lucky.critMult).toBe(none.critMult);
  });

  it('Str düz can yenilenmesi, Int MP yenilenmesi verir (0 Int = 0)', () => {
    expect(stats({ str: 20 }).hpRegen).toBeCloseTo(20 * f.attributes.hpRegenPerStr, 10);
    expect(stats({ str: 0 }).hpRegen).toBe(0);
    expect(stats({ int: 0 }).mpRegen).toBe(0);
    expect(stats({ int: 20 }).mpRegen).toBe(Math.round(20 * f.attributes.mpRegenPerInt));
    expect(stats({ int: 20 }).mpRegen).toBeGreaterThan(stats({ int: 8 }).mpRegen);
  });

  it('overrides türev stat\'ı ezer (çağrılan birimin canı gibi)', () => {
    expect(stats({ str: 99 }, { overrides: { hp: 35 } }).hp).toBe(35);
  });

  it('veri dosyalarındaki her class\'ın stat\'ları özelliklerinden türetilmiş ve geçerli', () => {
    for (const def of Object.values(content.classes)) {
      // can ya STR'den türer ya da (Defender gibi) veride elle ezilmiştir
      const derived = Math.round(f.attributes.hpBase + f.attributes.hpPerStr * def.attributes.str);
      if (def.id === 'defender') expect(def.stats.hp, def.id).toBe(158); // Defender canı elle ayarlı (128 -> %30 artış -> %5 azalış)
      else expect(def.stats.hp, def.id).toBe(derived);
      expect(def.stats.mp, def.id).toBe(Math.round(f.attributes.mpBase + f.attributes.mpPerInt * def.attributes.int));
      expect(def.stats.spd, def.id).toBeGreaterThan(0);
      expect(def.stats.critChance, def.id).toBeGreaterThanOrEqual(0.05);
    }
  });
});

describe('zırh: yüzdesel ve azalan getirili', () => {
  it('zırh 0 hiçbir şey azaltmaz, k kadar zırh %50 azaltır, hiçbir zaman %100 olmaz', () => {
    expect(armorReduction(0, f)).toBe(0);
    expect(armorReduction(f.armor.k, f)).toBeCloseTo(0.5, 10);
    expect(armorReduction(1e9, f)).toBeLessThan(1);
  });

  it('zırh arttıkça azalma artar ama artış hızı düşer (parabolik / azalan getiri)', () => {
    const r = (a: number) => armorReduction(a, f);
    for (let a = 5; a <= 100; a += 5) expect(r(a + 5)).toBeGreaterThan(r(a)); // artan
    const gain = (a: number) => r(a + 10) - r(a); // aynı +10 zırhın kazancı
    expect(gain(10)).toBeGreaterThan(gain(30));
    expect(gain(30)).toBeGreaterThan(gain(60));
  });

  it('hasar düz değil YÜZDESEL düşer: aynı zırh büyük vuruşta da küçük vuruşta da aynı oranı azaltır', () => {
    const attacker = stats({ str: 10 });
    const defender = stats({}, { armor: 30 }); // %50
    const dmg = (power: number): number => {
      const spec: DamageSpec = { damageType: 'physical', scale: 'str', power };
      return damageRange(attacker, defender, spec, f).avg / damageRange(attacker, stats({}, { armor: 0 }), spec, f).avg;
    };
    expect(dmg(1)).toBeCloseTo(0.5, 1);
    expect(dmg(5)).toBeCloseTo(0.5, 1); // düz azalma olsaydı büyük vuruşta oran 0,5'ten çok yüksek olurdu
  });

  it('fiziksel hasar fiziksel zırhla, büyü hasarı büyü zırhıyla azalır; ignoreDefense zırhı yok sayar', () => {
    const attacker = stats();
    const defender = stats({}, { armor: 30, magicArmor: 0 });
    const phys: DamageSpec = { damageType: 'physical', scale: 'str', power: 2 };
    const mag: DamageSpec = { damageType: 'magic', scale: 'str', power: 2 };
    expect(damageRange(attacker, defender, phys, f).avg).toBeLessThan(damageRange(attacker, defender, mag, f).avg);
    const pierced = damageRange(attacker, defender, { ...phys, ignoreDefense: 0.5 }, f).avg;
    expect(pierced).toBeGreaterThan(damageRange(attacker, defender, phys, f).avg);
    expect(pierced).toBeLessThan(damageRange(attacker, stats({}, { armor: 0 }), phys, f).avg);
  });

  it('çağrılan birimler hasarı summon.damageTakenMultiplier kat fazla yer', () => {
    const attacker = stats();
    const defender = stats();
    const spec: DamageSpec = { damageType: 'physical', scale: 'str', power: 1 };
    const normal = damageRange(attacker, defender, spec, f).avg;
    const summoned = damageRange(attacker, defender, { ...spec, takenMultiplier: f.summon.damageTakenMultiplier }, f).avg;
    expect(f.summon.damageTakenMultiplier).toBe(2);
    expect(summoned).toBe(normal * 2);
  });

  it('skill gücü hangi özelliğe bağlıysa onunla ölçeklenir (str/int/dex/luck)', () => {
    const s: Stats = stats({ str: 10, int: 20, dex: 30, luck: 5 });
    expect(attributePower(s, 'str', f)).toBe(10 * f.scaling.str);
    expect(attributePower(s, 'int', f)).toBe(20 * f.scaling.int);
    expect(attributePower(s, 'dex', f)).toBe(30 * f.scaling.dex);
    expect(attributePower(s, 'luck', f)).toBe(5 * f.scaling.luck);
  });
});

describe('zarlar: kritik ve dodge', () => {
  it('kritik sıklığı şansa uyar (istatistiksel)', () => {
    const rate = (chance: number) => {
      const rng = new Rng(7);
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (rollCrit({ critChance: chance, critMult: 1.5 }, rng).crit) hits++;
      return hits / 20000;
    };
    expect(rate(0.05)).toBeGreaterThan(0.04);
    expect(rate(0.05)).toBeLessThan(0.06);
    expect(rate(0.3)).toBeGreaterThan(0.28);
    expect(rate(0.3)).toBeLessThan(0.32);
  });

  it('kritik yoksa çarpan 1, varsa critMult', () => {
    expect(rollCrit({ critChance: 0, critMult: 2 }, new Rng(1))).toEqual({ crit: false, mult: 1 });
    expect(rollCrit({ critChance: 1, critMult: 2 }, new Rng(1))).toEqual({ crit: true, mult: 2 });
  });

  it('isabet şansı = accuracy - evasion, [0, hit.max] arasında (alt sınır yok)', () => {
    const { max } = f.hit;
    expect(hitChance({ accuracy: 0.9 }, { evasion: 0.2 }, f)).toBeCloseTo(0.7, 10);
    expect(hitChance({ accuracy: 0.9 }, { evasion: 0 }, f)).toBeCloseTo(0.9, 10);
    expect(hitChance({ accuracy: 5 }, { evasion: 0 }, f)).toBe(max);
    expect(hitChance({ accuracy: 0.1 }, { evasion: 0.65 }, f)).toBe(0); // alt sınır yok: %0 olabilir, negatife düşmez
    // saldırgan Luck'ı arttıkça, hedef Dex'i arttıkça: monoton
    expect(hitChance(stats({ luck: 10 }), stats({ dex: 5 }), f)).toBeGreaterThan(hitChance(stats({ luck: 2 }), stats({ dex: 5 }), f));
    expect(hitChance(stats({ luck: 5 }), stats({ dex: 20 }), f)).toBeLessThan(hitChance(stats({ luck: 5 }), stats({ dex: 2 }), f));
  });

  it('rollHit sıklığı hit şansına uyar; her çağrı tam bir sayı tüketir', () => {
    const rng = new Rng(3);
    let hits = 0;
    const att = { accuracy: 0.9 };
    const def = { evasion: 0.2 };
    for (let i = 0; i < 20000; i++) if (rollHit(att, def, f, rng)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.68);
    expect(hits / 20000).toBeLessThan(0.72);
    const a = new Rng(5);
    const b = new Rng(5);
    rollHit(att, def, f, a);
    b.next();
    expect(a.next()).toBe(b.next());
  });
});
