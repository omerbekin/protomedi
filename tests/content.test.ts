import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content } from '../src/engine';

// Şema doğrulama: data/ altına eklenen her içerik burada denetlenir.
const SKILL_TARGETS = ['single_enemy', 'all_enemies', 'single_ally', 'all_allies', 'self'];
const MOTIONS = ['melee', 'ranged', 'cast'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const everyone = { ...content.classes, ...content.enemies };

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
      expect(['mp', 'hp']).toContain(s.cost.resource);
      expect(s.cost.amount).toBeGreaterThanOrEqual(0);
      expect(s.effects.length).toBeGreaterThan(0);
      for (const e of s.effects) {
        if (e.type === 'damage') {
          expect(['physical', 'magic']).toContain(e.damageType);
          expect(e.power).toBeGreaterThan(0);
          if (e.ignoreDefense !== undefined) expect(e.ignoreDefense).toBeLessThanOrEqual(1);
          if (e.lifesteal !== undefined) expect(e.lifesteal).toBeLessThanOrEqual(1);
        } else if (e.type === 'heal') {
          expect(e.power).toBeGreaterThan(0);
        } else if (e.type === 'shield') {
          expect(['def', 'mag']).toContain(e.stat);
          expect(e.power).toBeGreaterThan(0);
        } else if (e.type === 'summon') {
          expect(content.enemies[e.unit] ?? content.classes[e.unit], `${key} -> ${e.unit}`).toBeDefined();
        } else {
          throw new Error(`${key}: bilinmeyen etki türü ${(e as { type: string }).type}`);
        }
      }
    });
  }

  it('saldırı etkili skill\'ler düşmanı, şifa/kalkan etkililer dostu hedefler', () => {
    for (const [key, s] of all) {
      const hurts = s.effects.some((e) => e.type === 'damage');
      const helps = s.effects.some((e) => e.type === 'heal' || e.type === 'shield');
      if (hurts) expect(['single_enemy', 'all_enemies'], key).toContain(s.target);
      if (helps) expect(['single_ally', 'all_allies', 'self'], key).toContain(s.target);
    }
  });
});

describe('class ve düşman verisi', () => {
  for (const [key, def] of Object.entries(everyone)) {
    it(`${key}: şema geçerli`, () => {
      expect(def.id).toBe(key);
      expect(def.color).toMatch(HEX);
      expect(def.stats.hp).toBeGreaterThan(0);
      expect(def.stats.mp).toBeGreaterThanOrEqual(0);
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

  const PRIORITIES = ['kill', 'heal', 'summon', 'shield', 'aoe', 'damage'];

  it('varsayılan YZ profili tanımlı', () => {
    expect(content.aiConfig.profiles[content.aiConfig.defaultProfile]).toBeDefined();
  });

  for (const [name, p] of Object.entries(content.aiConfig.profiles)) {
    it(`YZ profili ${name}: geçerli`, () => {
      expect(p.priorities.length).toBeGreaterThan(0);
      for (const pr of p.priorities) expect(PRIORITIES, `${name} -> ${pr}`).toContain(pr);
      expect(['lowest_hp', 'lowest_ratio']).toContain(p.focus);
      expect(p.aoeMinTargets).toBeGreaterThanOrEqual(1);
      for (const ratio of [p.healBelowRatio, p.shieldBelowRatio, p.minHpRatioForHpCost]) {
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
      }
      // Profil bir etkiye öncelik veriyorsa o etki için gereken eşik de ayarlı olmalı
      if (p.priorities.includes('heal')) expect(p.healBelowRatio).toBeGreaterThan(0);
      if (p.priorities.includes('shield')) expect(p.shieldBelowRatio).toBeGreaterThan(0);
      if (p.priorities.includes('summon')) expect(p.maxSummons).toBeGreaterThan(0);
    });
  }

  it('her karakterin YZ profili tanımlı bir profile işaret ediyor', () => {
    for (const def of Object.values(everyone)) {
      if (def.ai !== undefined) expect(content.aiConfig.profiles[def.ai], `${def.id} -> ${def.ai}`).toBeDefined();
    }
  });

  it('profilin öncelik verdiği etkiyi karakter gerçekten yapabiliyor (ölü öncelik yok)', () => {
    const has = (def: { skills: string[] }, type: string) =>
      def.skills.some((id) => content.skills[id]?.effects.some((e) => e.type === type));
    for (const def of Object.values(everyone)) {
      const p = content.aiConfig.profiles[def.ai ?? content.aiConfig.defaultProfile]!;
      if (p.priorities.includes('heal')) expect(has(def, 'heal'), `${def.id} heal`).toBe(true);
      if (p.priorities.includes('shield')) expect(has(def, 'shield'), `${def.id} shield`).toBe(true);
      if (p.priorities.includes('summon')) expect(has(def, 'summon'), `${def.id} summon`).toBe(true);
    }
  });
});

describe('savaş tanımı', () => {
  it('parti/düşman listeleri tanımlı varlıklara işaret ediyor ve yuvalara sığıyor', () => {
    for (const b of Object.values(content.battles)) {
      for (const id of b.party) expect(content.classes[id], id).toBeDefined();
      for (const id of b.enemies) expect(content.enemies[id], id).toBeDefined();
      expect(b.party.length).toBeLessThanOrEqual(b.slots.party);
      expect(b.enemies.length).toBeLessThanOrEqual(b.slots.enemy);
      expect(b.slots.party).toBeLessThanOrEqual(layout.partySlots.length);
      expect(b.slots.enemy).toBeLessThanOrEqual(layout.enemySlots.length);
    }
  });

  it('ilk savaş 4v4: Warrior/Paladin/Mage/Undead vs Warrior/Archer/Mage/Druid', () => {
    const b = content.battles['first-battle']!;
    expect(b.party).toEqual(['warrior', 'paladin', 'mage', 'undead']);
    expect(b.enemies).toEqual(['enemy_warrior', 'enemy_archer', 'enemy_mage', 'enemy_druid']);
  });
});
