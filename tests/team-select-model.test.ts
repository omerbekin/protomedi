import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { archetypeOf, clampSize, defaultTeamSize, freeCellFor, isTeamFull, missingCount, missingMessage, parseSizeParam, pipLayout, rosterLayout, sizeSummary, sizesFromSearch, stepSize, teamCount, TEAM_SIZE, trimToSize } from '../src/game/team-select-model';

const ids = Object.keys(content.classes);

describe('takım seçimi (veriden)', () => {
  it('havuz en az takım boyutu kadar sınıf içerir', () => {
    expect(ids.length).toBeGreaterThanOrEqual(TEAM_SIZE);
  });

  it('her sınıf kartı için gereken veri var: ad, logo, 4 stat, skiller, arketip', () => {
    for (const id of ids) {
      const def = content.classes[id]!;
      expect(def.name).toBeTruthy();
      expect(def.logo).toBeTruthy();
      expect(def.skills.length).toBeGreaterThan(0);
      for (const s of def.skills) expect(content.skills[s], `${id}: ${s}`).toBeDefined();
      for (const k of ['str', 'dex', 'int', 'luck'] as const) expect(typeof def.stats[k]).toBe('number');
      expect(archetypeOf(def).length).toBeGreaterThan(0);
    }
  });

  it('kart yerleşimi sınıf sayısından türer; 1-16 sınıf ekrana sığar', () => {
    for (const n of [ids.length, 1, 5, 9, 10, 12, 16]) {
      const l = rosterLayout(n, 1792, 246, 188, 270);
      expect(l.cols * l.rows).toBeGreaterThanOrEqual(n);
      expect(l.cols * l.cardW + (l.cols - 1) * l.gap).toBeLessThanOrEqual(1792 + 0.01);
      expect(l.rows * l.cardH + (l.rows - 1) * l.gap).toBeLessThanOrEqual(246 + 0.01);
    }
  });

  it('yeni seçilen sınıf boş bir hücre bulur; yakın dövüşçü ön sıraya gider', () => {
    const cells = Array.from({ length: content.CELL_COUNT }, () => '');
    const melee = ids.find((id) => content.isMeleeClass(id));
    if (melee) expect(Math.floor(freeCellFor(cells, melee) / content.GRID.lanes)).toBe(0);
    const team: string[] = [...cells];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const cell = freeCellFor(team, ids[i % ids.length]!);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(team[cell]).toBe('');
      team[cell] = ids[i % ids.length]!;
    }
  });
});

describe('takım boyutu (saf mantık)', () => {
  const cells = (n: number) => Array.from({ length: content.CELL_COUNT }, (_, i) => (i < n ? ids[i % ids.length]! : ''));

  it('boyut 1..12 aralığına kısılır; varsayılan 5', () => {
    expect(clampSize(0)).toBe(1);
    expect(clampSize(99)).toBe(content.CELL_COUNT);
    expect(clampSize(7.9)).toBe(7);
    expect(defaultTeamSize()).toBe(5);
    expect(stepSize(12, 1)).toBe(12);
    expect(stepSize(1, -1)).toBe(1);
    expect(stepSize(5, 1)).toBe(6);
  });

  it('adres parametreleri: ?party=3&enemies=8; geçersiz ve eksik değer varsayılana düşer', () => {
    expect(sizesFromSearch('?seed=7&party=3&enemies=8')).toEqual({ party: 3, enemies: 8 });
    expect(sizesFromSearch('?seed=7')).toEqual({ party: 5, enemies: 5 });
    expect(sizesFromSearch('?party=abc&enemies=50')).toEqual({ party: 5, enemies: 12 });
    expect(parseSizeParam('', 5)).toBe(5);
  });

  it('doluluk: START yalnızca iki takım da seçilen boyuta eşitken', () => {
    expect(isTeamFull(cells(3), 3)).toBe(true);
    expect(isTeamFull(cells(3), 4)).toBe(false);
    expect(isTeamFull(cells(5), 3)).toBe(false);
    expect(missingCount(cells(2), 5)).toBe(3);
    expect(missingCount(cells(5), 3)).toBe(0);
  });

  it('eksik uyarısı ve özet yazısı', () => {
    expect(missingMessage({ party: cells(3), enemies: cells(8) }, { party: 5, enemies: 8 })).toBe('Player team needs 2 more classes');
    expect(missingMessage({ party: cells(4), enemies: cells(7) }, { party: 5, enemies: 8 })).toBe('Player team needs 1 more class   ·   Enemy team needs 1 more class');
    expect(missingMessage({ party: cells(5), enemies: cells(5) }, { party: 5, enemies: 5 })).toBe('');
    expect(sizeSummary({ party: 5, enemies: 5 })).toBe('You: 5  Enemy: 5');
  });

  it('boyut küçülünce fazla birimler sondan çıkar; tekrar eden sınıflar serbest (12 kişi, 9 sınıf)', () => {
    const big = cells(12);
    expect(new Set(big.filter(Boolean)).size).toBeLessThan(12);
    const t = trimToSize(big, 4);
    expect(teamCount(t)).toBe(4);
    expect(t.slice(0, 4)).toEqual(big.slice(0, 4));
    expect(teamCount(trimToSize(cells(3), 8))).toBe(3);
  });

  it('doluluk elmasları 12 kişiye kadar alana sığar', () => {
    for (let n = 1; n <= 12; n++) expect(pipLayout(n, 300).width).toBeLessThanOrEqual(300 + 0.001);
    expect(pipLayout(5, 300).step).toBe(30);
  });

  it('rastgele takım seçilen boyutta ve hücrelere sığar', () => {
    for (const n of [1, 3, 8, 12]) {
      const t = content.randomCells(content.randomTeam(7, n), 7);
      expect(teamCount(t)).toBe(n);
    }
  });
});
