import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { archetypeOf, freeCellFor, rosterLayout, TEAM_SIZE } from '../src/game/team-select-model';

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
