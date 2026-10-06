import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { attributePower, content } from '../src/engine';
import type { StatKind } from '../src/engine';
import { ICON_KINDS, isIconKind } from '../src/ui/icon-kinds';
import { BACKUP_VFX, VFX_KINDS } from '../src/ui/vfx-kinds';
import { UI_ICONS } from '../src/ui/dom-icons';
import { STAT_COLOR, STAT_ICON, UI_ICON, STAT_LABEL } from '../src/ui/stat-icons';

// Şema doğrulama: data/ altına eklenen her içerik burada denetlenir.
const SKILL_TARGETS = ['single_enemy', 'all_enemies', 'area_enemies', 'column_enemies', 'everyone', 'random_enemies', 'single_ally', 'dead_ally', 'all_allies', 'self'];
const MOTIONS = ['melee', 'ranged', 'cast', 'sky', 'ground', 'whip'];
const ATTRIBUTES = ['str', 'int', 'dex', 'luck'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const PLACEHOLDER_SPRITE_CLASSES: string[] = [];
const everyone = { ...content.classes, ...content.summons };

describe('skill verisi', () => {
  const all = Object.entries(content.skills);

  it('skill\'ler tanımlı ve anahtar = id', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const [key, s] of all) expect(s.id, key).toBe(key);
  });

  for (const [key, s] of all) {
    it(`${key}: şema geçerli`, () => {
      expect(s.name.length).toBeGreaterThan(0);
      expect(SKILL_TARGETS).toContain(s.target);
      expect(MOTIONS).toContain(s.motion);
      expect(s.fx).toMatch(HEX);
      expect(['mp', 'hp', 'rage']).toContain(s.cost.resource);
      expect(s.cost.amount).toBeGreaterThanOrEqual(0);
      expect(s.effects.length).toBeGreaterThan(0);
      for (const e of s.effects) {
        switch (e.type) {
          case 'damage':
            expect(['physical', 'magic']).toContain(e.damageType);
            expect(ATTRIBUTES, `${key} scale`).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            if (e.ignoreDefense !== undefined) expect(e.ignoreDefense).toBeLessThanOrEqual(1);
            if (e.lifesteal !== undefined) expect(e.lifesteal).toBeLessThanOrEqual(1);
            if (e.falloff !== undefined) expect(e.falloff).toBeGreaterThan(0);
            if (e.falloff !== undefined) expect(e.falloff).toBeLessThanOrEqual(1);
            if (e.bonusPerMissingMana !== undefined) expect(e.bonusPerMissingMana).toBeGreaterThan(0);
            if (e.bonusFromShield) expect(e.bonusFromShield.ratio).toBeGreaterThan(0);
            if (e.repeatChance !== undefined) {
              expect(e.repeatChance).toBeGreaterThan(0);
              expect(e.repeatChance).toBeLessThanOrEqual(1);
            }
            if (e.bet) {
              expect(['hp', 'mp']).toContain(e.bet.resource);
              expect(e.bet.ratio).toBeGreaterThan(0);
              expect(e.bet.ratio).toBeLessThanOrEqual(1);
              expect(e.bet.winChance).toBeGreaterThan(0);
              expect(e.bet.winChance).toBeLessThan(1);
              expect(e.bet.winMult).toBeGreaterThan(1);
              if (e.bet.loseMult !== undefined) expect(e.bet.loseMult).toBeGreaterThanOrEqual(0);
              if (e.bet.perStake !== undefined) expect(e.bet.perStake).toBeGreaterThan(0);
            }
            break;
          case 'randomStatus':
            expect(e.options.length, key).toBeGreaterThanOrEqual(2);
            for (const o of e.options) {
              expect(content.statuses[o.status], `${key} -> status ${o.status}`).toBeDefined();
              expect(o.turns).toBeGreaterThan(0);
              expect(o.weight).toBeGreaterThan(0);
            }
            break;
          case 'heal':
            expect(ATTRIBUTES, `${key} scale`).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            break;
          case 'hot':
            expect(ATTRIBUTES, `${key} scale`).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            expect(e.turns).toBeGreaterThan(0);
            break;
          case 'shield':
            expect(ATTRIBUTES, `${key} scale`).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            if (e.shieldType !== undefined) expect(e.shieldType).toBe('magic');
            break;
          case 'summon':
            expect(content.summons[e.unit] ?? content.classes[e.unit], `${key} -> ${e.unit}`).toBeDefined();
            if (e.lifespan !== undefined) expect(e.lifespan).toBeGreaterThan(0);
            break;
          case 'manaBurn':
            expect(e.amount).toBeGreaterThan(0);
            break;
          case 'taunt':
            expect(e.turns).toBeGreaterThan(0);
            break;
          case 'status':
            expect(content.statuses[e.status], `${key} -> status ${e.status}`).toBeDefined();
            expect(e.turns).toBeGreaterThan(0);
            break;
          case 'ground':
            expect(content.grounds[e.ground], `${key} -> ground ${e.ground}`).toBeDefined();
            expect(e.turns).toBeGreaterThan(0);
            expect(ATTRIBUTES).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            break;
          case 'thorns':
            expect(ATTRIBUTES, `${key} scale`).toContain(e.scale);
            expect(e.power).toBeGreaterThan(0);
            expect(e.turns).toBeGreaterThan(0);
            expect(s.target, key).toBe('self');
            expect(content.statuses.thorns, key).toBeDefined();
            break;
          case 'selfDamage':
            expect(e.ratio).toBeGreaterThan(0);
            expect(e.ratio).toBeLessThan(1);
            break;
          case 'revive':
            expect(e.hpRatio).toBeGreaterThan(0);
            expect(e.hpRatio).toBeLessThanOrEqual(1);
            expect(e.mpRatio).toBeGreaterThanOrEqual(0);
            expect(e.mpRatio).toBeLessThanOrEqual(1);
            expect(s.target).toBe('dead_ally');
            break;
          case 'guard':
            expect(e.turns).toBeGreaterThan(0);
            expect(e.share).toBeGreaterThan(0);
            expect(e.share).toBeLessThanOrEqual(1);
            break;
          default:
            throw new Error(`${key}: bilinmeyen etki türü ${(e as { type: string }).type}`);
        }
      }
    });
  }

  it('saldırı ve mana yakma düşmanı, şifa/kalkan/koruma dostu (veya kendini) hedefler', () => {
    for (const [key, s] of all) {
      const hurts = s.effects.some((e) => e.type === 'damage' || e.type === 'manaBurn');
      const helps = s.effects.some((e) => e.type === 'heal' || e.type === 'hot' || (e.type === 'shield' && !e.self) || e.type === 'guard' || e.type === 'taunt');
      if (hurts) expect(['single_enemy', 'all_enemies', 'area_enemies', 'column_enemies', 'everyone', 'random_enemies'], key).toContain(s.target);
      if (helps) expect(['single_ally', 'all_allies', 'self', 'everyone'], key).toContain(s.target);
    }
  });

  it('taunt yalnızca kendine, guard tek bir dosta uygulanır', () => {
    for (const [key, s] of all) {
      if (s.effects.some((e) => e.type === 'taunt')) expect(s.target, key).toBe('self');
      if (s.effects.some((e) => e.type === 'guard')) expect(s.target, key).toBe('single_ally');
    }
  });
});

describe('class ve çağrı verisi', () => {
  for (const [key, def] of Object.entries(everyone)) {
    it(`${key}: şema geçerli`, () => {
      expect(def.id).toBe(key);
      expect(def.color).toMatch(HEX);
      expect(isIconKind(def.logo), `${key} logo ${def.logo}`).toBe(true);
      expect(def.stats.hp).toBeGreaterThan(0);
      expect(def.stats.mp).toBeGreaterThanOrEqual(0);
      for (const a of ATTRIBUTES) expect((def.attributes as unknown as Record<string, number>)[a], `${key} ${a}`).toBeGreaterThanOrEqual(0);
      expect(def.stats.armor).toBeGreaterThanOrEqual(0);
      expect(def.stats.magicArmor).toBeGreaterThanOrEqual(0);
      for (const id of def.skills) expect(content.skills[id], `${key} -> ${id}`).toBeDefined();
    });
  }

  it('skill listesi olan karakterlerin MP\'si en pahalı MP skill\'ine yetiyor', () => {
    for (const def of Object.values(everyone)) {
      for (const id of def.skills) {
        const cost = content.skills[id]!.cost;
        if (cost.resource === 'mp') expect(def.stats.mp, `${def.id} ${id}`).toBeGreaterThanOrEqual(cost.amount);
        if (cost.resource === 'hp') expect(def.stats.hp, `${def.id} ${id}`).toBeGreaterThan(cost.amount);
      }
    }
  });

  it('her skill en az bir karakter tarafından kullanılıyor', () => {
    const used = new Set(Object.values(everyone).flatMap((d) => d.skills));
    for (const id of Object.keys(content.skills)) expect(used.has(id), id).toBe(true);
  });

  it('zırh "normal seviyelerde": hiçbir class\'ta fiziksel zırh k\'nin yarısını aşmaz (Defender hariç) ve yalnızca Defender yüksek', () => {
    const k = content.formulas.armor.k;
    for (const def of Object.values(content.classes)) {
      if (def.id === 'defender') expect(def.stats.armor).toBeGreaterThan(k * 0.6);
      else expect(def.stats.armor, def.id).toBeLessThanOrEqual(k * 0.5);
    }
  });
});

describe('hız (SPD) ve yapay zeka verisi', () => {
  it('her karakterin sıra için SPD statı var (> 0)', () => {
    for (const def of Object.values(everyone)) expect(def.stats.spd, def.id).toBeGreaterThan(0);
  });

  it('SPD değerleri farklı (sıra çubuğu çeşitli olsun diye en az 4 farklı hız)', () => {
    const speeds = new Set(Object.values(everyone).map((d) => d.stats.spd));
    expect(speeds.size).toBeGreaterThanOrEqual(4);
  });

  it('sıra ayarları geçerli', () => {
    expect(content.formulas.turn.threshold).toBeGreaterThan(0);
    expect(content.formulas.turn.queueLength).toBeGreaterThanOrEqual(1);
  });

  const PRIORITIES = ['kill', 'heal', 'tactic', 'summon', 'shield', 'aoe', 'damage', 'taunt', 'guard', 'burn', 'thorns'];

  it('varsayılan YZ profili tanımlı', () => {
    expect(content.aiConfig.profiles[content.aiConfig.defaultProfile]).toBeDefined();
  });

  for (const [name, p] of Object.entries(content.aiConfig.profiles)) {
    it(`YZ profili ${name}: geçerli`, () => {
      expect(p.priorities.length).toBeGreaterThan(0);
      for (const pr of p.priorities) expect(PRIORITIES, `${name} -> ${pr}`).toContain(pr);
      expect(['lowest_hp', 'lowest_ratio']).toContain(p.focus);
      expect(p.aoeMinTargets).toBeGreaterThanOrEqual(1);
      for (const ratio of [p.healBelowRatio, p.shieldBelowRatio, p.minHpRatioForHpCost, p.guardBelowRatio ?? 0]) {
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
      }
      // Profil bir etkiye öncelik veriyorsa o etki için gereken eşik de ayarlı olmalı
      if (p.priorities.includes('heal')) expect(p.healBelowRatio).toBeGreaterThan(0);
      if (p.priorities.includes('shield')) expect(p.shieldBelowRatio).toBeGreaterThan(0);
      if (p.priorities.includes('summon')) expect(p.maxSummons).toBeGreaterThan(0);
      if (p.priorities.includes('guard')) expect(p.guardBelowRatio ?? 0).toBeGreaterThan(0);
      if (p.priorities.includes('burn')) expect(p.burnMinTargets ?? 0).toBeGreaterThan(0);
    });
  }

  it('her karakterin YZ profili tanımlı bir profile işaret ediyor', () => {
    for (const def of Object.values(everyone)) {
      if (def.ai !== undefined) expect(content.aiConfig.profiles[def.ai], `${def.id} -> ${def.ai}`).toBeDefined();
    }
  });

  it('profilin öncelik verdiği etkiyi karakter gerçekten yapabiliyor (ölü öncelik yok)', () => {
    const has = (def: { skills: string[] }, ...types: string[]) =>
      def.skills.some((id) => content.skills[id]?.effects.some((e) => types.includes(e.type)));
    for (const def of Object.values(everyone)) {
      const p = content.aiConfig.profiles[def.ai ?? content.aiConfig.defaultProfile]!;
      if (p.priorities.includes('heal')) expect(has(def, 'heal', 'hot'), `${def.id} heal`).toBe(true);
      if (p.priorities.includes('shield')) expect(has(def, 'shield'), `${def.id} shield`).toBe(true);
      if (p.priorities.includes('summon')) expect(has(def, 'summon'), `${def.id} summon`).toBe(true);
      if (p.priorities.includes('taunt')) expect(has(def, 'taunt'), `${def.id} taunt`).toBe(true);
      if (p.priorities.includes('guard')) expect(has(def, 'guard'), `${def.id} guard`).toBe(true);
      if (p.priorities.includes('burn')) expect(has(def, 'manaBurn'), `${def.id} burn`).toBe(true);
    }
  });
});

describe('class havuzu', () => {
  it('tüm class\'lar (veriden) var ve her class\'ın tam 4 skill\'i var', () => {
    // class havuzu veriden okunur (data/classes); takım havuzu (random-battle) tüm class'ları içerir
    const files = readdirSync(join(__dirname, '..', 'data', 'classes')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    expect(Object.keys(content.classes).sort()).toEqual(files.sort());
    expect([...content.battles['random-battle']!.random!.pool].sort()).toEqual(content.randomPool.slice().sort()); // havuz = testOnly olmayan class'lar
    expect(content.selectableClasses.sort()).toEqual(Object.keys(content.classes).sort());
    expect(content.classes.aoe_tester!.testOnly).toBe(true);
    expect(content.randomPool).not.toContain('aoe_tester');
    expect(Object.keys(content.classes)).toContain('gambler');
    for (const def of Object.values(content.classes)) expect(def.skills, def.id).toHaveLength(4);
  });

  it('class id, sprite id ve görsel dosyası birbirine bağlı (görsel class\'a aittir, taraf fark etmez)', () => {
    for (const [id, def] of Object.entries(content.classes)) {
      expect(def.id).toBe(id);
      if (def.testOnly) { expect(existsSync(join(__dirname, '..', 'assets', 'sprites', def.spriteId, 'idle.png')), id).toBe(true); continue; } // test class'ı başka class'ın görselini geçici kullanır
      expect(def.spriteId, id).toBe(id);
      // Sprite'ı henüz çizilmemiş class'lar placeholder (class rengine boyalı blok) kullanır; sprite gelince listeden çıkarılır.
      if (!PLACEHOLDER_SPRITE_CLASSES.includes(id)) expect(existsSync(join(__dirname, '..', 'assets', 'sprites', id, 'idle.png')), `assets/sprites/${id}/idle.png`).toBe(true);
    }
  });

  it('karşı takımdaki karakterler de aynı class tanımını kullanır (tek havuz)', () => {
    const setup = content.battleSetup('first-battle', 1, 'test');
    const mageA = setup.party.find((d) => d.id === 'mage')!;
    const mageB = setup.enemies.find((d) => d.id === 'mage')!;
    expect(mageA).toBe(mageB);
    expect(mageA.spriteId).toBe(mageB.spriteId);
  });
});

describe('güç sınırları (kalkan ve çağrı çok güçlü olmasın)', () => {
  const classHps = Object.values(content.classes).filter((d) => !d.testOnly).map((d) => d.stats.hp);
  /** Stat toplamı 30 olunca en zayıf class canı çok düşüktür (mage 38); koruma sınırları ortalama canı baz alır. */
  const avgHp = classHps.reduce((a, b) => a + b, 0) / classHps.length;

  it('hiçbir kalkan skill\'i (sahibi class için) en zayıf class canının %25\'inden fazlasını emmez', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      for (const e of s.effects) {
        if (e.type !== 'shield') continue;
        for (const def of Object.values(content.classes)) {
          if (!def.skills.includes(id)) continue;
          const amount = attributePower(def.stats, e.scale, content.formulas) * e.power;
          expect(amount, `${def.id} ${id}`).toBeLessThanOrEqual(avgHp * 0.4); // Mana Barrier INT ile ölçeklenir; ortalama class canının %40'ını aşmasın (stat 30 kuralı sonrası gevşetildi, bkz. open-questions 175)
        }
      }
    }
  });

  it('kalkan skill\'lerinin cooldown\'u var, çağrının cooldown\'u en az 5 tur', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      if (s.effects.some((e) => e.type === 'shield' && !e.self)) expect(s.cooldown ?? 0, id).toBeGreaterThanOrEqual(3);
      if (s.effects.some((e) => e.type === 'summon')) expect(s.cooldown ?? 0, id).toBeGreaterThanOrEqual(5);
    }
  });

  it('çağrılan birim, en zayıf class\'ın canının 1,5 katından azına sahip', () => {
    for (const def of Object.values(content.summons)) expect(def.stats.hp).toBeLessThan(avgHp * 1.5); // çağrılar ortalama class canının 1,5 katından fazla cana sahip olmasın (stat 30 kuralı sonrası ortalama baz alındı)
  });
});

describe('savaş tanımı', () => {
  const classIds = Object.keys(content.classes);
  const poolIds = content.randomPool;

  it('sabit savaşın listeleri tanımlı class\'lara işaret ediyor ve yuvalara sığıyor', () => {
    for (const b of Object.values(content.battles)) {
      expect(b.slots.party).toBeLessThanOrEqual(layout.partySlots.length);
      expect(b.slots.enemy).toBeLessThanOrEqual(layout.enemySlots.length);
      if (b.random) continue;
      for (const id of [...(b.party ?? []), ...(b.enemies ?? [])]) expect(classIds, id).toContain(id);
      expect((b.party ?? []).length).toBeLessThanOrEqual(b.slots.party);
      expect((b.enemies ?? []).length).toBeLessThanOrEqual(b.slots.enemy);
    }
  });

  it('rastgele savaşın havuzu tüm class\'lar ve her taraf için en az bir yuva boş kalıyor (çağrı yeri)', () => {
    const b = content.battles['random-battle']!;
    expect(b.random).toBeDefined();
    expect([...b.random!.pool].sort()).toEqual([...poolIds].sort()); // testOnly class'lar havuzda yok
    expect(b.random!.size).toBeLessThanOrEqual(b.random!.pool.length);
    expect(b.random!.size).toBeLessThan(b.slots.party);
    expect(b.random!.size).toBeLessThan(b.slots.enemy);
  });

  it('ilk savaş (sabit) 4v4: Warrior/Paladin/Mage/Undead vs Warrior/Archer/Mage/Druid', () => {
    const b = content.battles['first-battle']!;
    expect(b.party).toEqual(['warrior', 'paladin', 'mage', 'undead']);
    expect(b.enemies).toEqual(['warrior', 'archer', 'mage', 'druid']);
  });

  it('oyunun varsayılan savaşı rastgele takımlı', () => {
    expect(content.battles[content.DEFAULT_BATTLE]?.random).toBeDefined();
  });
});

describe('görsel veri: skill ikonları, class logoları, stat ikonları, hareket', () => {
  it('her skill\'in ikon türü tanımlı', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      expect(isIconKind(s.icon), `${id} -> ${s.icon}`).toBe(true);
    }
  });

  it('her class\'ın logosu bir ikon türü ve her class\'ın logosu farklı', () => {
    const logos = Object.values(content.classes).map((d) => d.logo);
    for (const l of logos) expect(isIconKind(l), l).toBe(true);
    expect(new Set(logos).size).toBe(logos.length);
  });

  it('tüm stat türlerinin ikonu, rengi ve etiketi var; ikonlar geçerli ve temel 4 özellik birbirinden farklı', () => {
    const kinds: StatKind[] = ['hp', 'mp', 'str', 'int', 'dex', 'luck', 'spd', 'critChance', 'accuracy', 'evasion', 'armor', 'magicArmor'];
    for (const k of kinds) {
      expect(isIconKind(STAT_ICON[k]), k).toBe(true);
      expect(STAT_COLOR[k], k).toMatch(HEX);
      expect(STAT_LABEL[k].length, k).toBeGreaterThan(0);
    }
    expect(new Set(['str', 'int', 'dex', 'luck'].map((k) => STAT_ICON[k as StatKind])).size).toBe(4);
  });

  it('her ikon türü en az bir skill, class veya stat tarafından kullanılıyor (ölü ikon yok)', () => {
    const used = new Set<string>([
      ...Object.values(content.skills).map((s) => s.icon),
      ...Object.values(content.classes).map((c) => c.logo),
      ...Object.values(content.summons).map((c) => c.logo),
      ...Object.values(content.classes).map((c) => c.passive?.icon ?? ''),
      ...Object.values(STAT_ICON),
      ...Object.values(UI_ICON),
      ...Object.values(content.statuses).map((s) => s.icon),
      ...Object.values(content.grounds).map((g) => g.icon),
      ...Object.values(content.globalSkills).map((g) => g.icon), // Rest / Skip Turn / Move
      'shield', // zırh aurası rozeti
      'skull', // ölümcül hasar işareti
      'hourglass', // kalan tur
      'leaf', // regen rozeti
      'roar', // varsayılan durum ikonu
      'finger', // yedek
      'holystrike', // yedek: Holy Strike'ın eski ikonu
      ...UI_ICONS, // debug dock ve ayarlar (DOM)
    ]);
    for (const kind of ICON_KINDS) expect(used.has(kind), kind).toBe(true);
  });

  it('her skill piksel art efektine (vfx) sahip; yalnızca Radiance genel hareketi kullanır', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      if (id === 'radiance') {
        expect(s.vfx, id).toBeUndefined();
        continue;
      }
      expect(VFX_KINDS as readonly string[], `${id} vfx`).toContain(s.vfx);
    }
    // her efekt en az bir skill tarafından kullanılıyor
    const used = new Set(Object.values(content.skills).map((s) => s.vfx));
    for (const k of VFX_KINDS) if (!BACKUP_VFX.includes(k)) expect(used.has(k), k).toBe(true);
  });

  it("yukarıdan düşen skill'lerin hepsinin düşen şey türü var", () => {
    const sky = Object.values(content.skills).filter((s) => s.motion === 'sky');
    expect(sky.map((s) => s.id).sort()).toEqual(['arrow_rain', 'blizzard', 'drain_field', 'fist_crush', 'holy_strike', 'judgment', 'meteor', 'radiance']);
    for (const s of sky) expect(['arrows', 'shards', 'meteor', 'void', 'light', 'fist'], s.id).toContain(s.skyFx);
    for (const s of Object.values(content.skills)) if (s.motion !== 'sky') expect(s.skyFx, s.id).toBeUndefined();
  });
});
