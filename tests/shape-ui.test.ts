import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content } from '../src/engine';
import { shapeCells } from '../src/engine/area-shape';
import { bottomLeftSlot, cellCenter, cellQuad, pickCell, pointInPoly, shapeMarks } from '../src/game/shape-geometry';
import { isTestClass, randomizePool, rosterIds } from '../src/game/team-select-model';
import { miniGridText, shapeMiniGrid, skillMiniGrid } from '../src/ui/shape-diagram';
import { buildWiki } from '../src/wiki/catalog';

const F = content.formulas.formation;
const LANES = F.lanes;
const enemy = layout.enemySlots;
const party = layout.partySlots;

describe('şekil hedefleme geometrisi: hücre -> ekran', () => {
  it('her hücrenin zemin dörtgeni 4 köşeli, merkezini içerir ve komşuyla örtüşmeden bitişik döşenir', () => {
    for (const slots of [enemy, party]) {
      for (let slot = 0; slot < slots.length; slot++) {
        const quad = cellQuad(slots, LANES, slot, 1);
        expect(quad).toHaveLength(4);
        const c = cellCenter(slots, slot);
        expect(pointInPoly(quad, c.x, c.y)).toBe(true);
        // başka hiçbir hücrenin merkezi bu dörtgenin içinde değil
        for (let o = 0; o < slots.length; o++) if (o !== slot) expect(pointInPoly(quad, cellCenter(slots, o).x, cellCenter(slots, o).y), `${slot} içinde ${o}`).toBe(false);
      }
    }
  });

  it('imleç hücre merkezinde o hücreyi bulur (düşman ve oyuncu tarafı); tahta dışında null', () => {
    for (const slots of [enemy, party]) {
      for (let slot = 0; slot < slots.length; slot++) {
        const c = cellCenter(slots, slot);
        expect(pickCell(slots, LANES, c.x, c.y)).toBe(slot);
      }
      expect(pickCell(slots, LANES, 5, 5)).toBeNull();
    }
  });

  it('karakter gövdesinin üstü de (ayak noktasının yukarısı) o hücreyi seçer; öndeki gövde kazanır', () => {
    const body = { w: layout.spriteBox.width, h: layout.spriteBox.height };
    const s = enemy[4]!; // sıra 1, şerit 1
    expect(pickCell(enemy, LANES, s.x, s.y - 150, body)).toBe(4);
    expect(pickCell(enemy, LANES, s.x, s.y - 150)).toBeNull(); // gövde bilgisi yoksa yalnızca zemin
    // iki şeridin gövdeleri çakışan noktada ayak noktası daha aşağıda olan (öndeki şerit) seçilir
    const a = enemy[3]!; // şerit 0
    const b = enemy[4]!; // şerit 1 (aşağıda)
    const x = (a.x + b.x) / 2;
    const y = a.y - 80;
    expect(pickCell(enemy, LANES, x, y, body)).toBe(4);
  });

  it('ayna: oyuncu tarafında sıra yönü ters (ön sıra sağda); düşmanda ön sıra solda', () => {
    expect(enemy[3]!.x).toBeGreaterThan(enemy[0]!.x);
    expect(party[3]!.x).toBeLessThan(party[0]!.x);
    // dörtgen sağ-sol genişliği iki tarafta eşit
    const w = (q: { x: number }[]) => Math.max(...q.map((p) => p.x)) - Math.min(...q.map((p) => p.x));
    expect(w(cellQuad(enemy, LANES, 4))).toBeCloseTo(w(cellQuad(party, LANES, 4)), 5);
  });
});

describe('rect kayması: gerçek sol-alt köşe işareti', () => {
  const rect = content.skills.shape_rect!.area!;

  it('tahtaya sığan rect: fare hücresi = sol-alt köşe, kayma yok', () => {
    // düşman tarafı, ekranda sütun 1, alt satır (şerit 2): slot 3*1+2 = 5
    const cells = shapeCells(rect, 5, 'enemy', F);
    const m = shapeMarks(true, cells, 5, 'enemy', F);
    expect(m.corner).toBe(5);
    expect(m.shifted).toBe(false);
  });

  it('düşman tarafı: en arka sıradaki hücre (ekranda sağ kenar) kayar; köşe fare hücresinden farklı, fare hücresi yine kapsanır', () => {
    for (const anchor of [9, 10, 11]) {
      const cells = shapeCells(rect, anchor, 'enemy', F);
      expect(cells).toHaveLength(6);
      expect(cells).toContain(anchor);
      const m = shapeMarks(true, cells, anchor, 'enemy', F);
      expect(m.shifted, `anchor ${anchor}`).toBe(true);
      expect(m.corner).toBe(bottomLeftSlot(cells, 'enemy', F));
    }
  });

  it('oyuncu tarafı: ön sıra (ekranda sağ kenar) kayar', () => {
    const cells = shapeCells(rect, 0, 'party', F);
    expect(cells).toContain(0);
    expect(shapeMarks(true, cells, 0, 'party', F).shifted).toBe(true);
    expect(shapeMarks(true, shapeCells(rect, 11, 'party', F), 11, 'party', F).shifted).toBe(false); // ekranda sol-alt hücre: kaymaz
    expect(shapeMarks(true, shapeCells(rect, 9, 'party', F), 9, 'party', F).shifted).toBe(true); // 3 şeritli tahtada üst satırdaki fare hücresi dikeyde kayar
  });

  it('rect dışı şekillerde köşe/kayma yok', () => {
    const m = shapeMarks(false, [3, 4, 5], 4, 'enemy', F);
    expect(m).toEqual({ anchor: 4, corner: null, shifted: false });
  });
});

describe('skill şekil şeması (mini ızgara 4x3)', () => {
  it('row / column / rect / plus şemaları: boyut, kapsanan hücre sayısı ve tek anchor', () => {
    const grid = (id: string) => skillMiniGrid(content.skills[id]!, F)!;
    const expected: Record<string, number> = { shape_row: 3, shape_column: 4, shape_rect: 6, shape_plus: 5 };
    for (const [id, n] of Object.entries(expected)) {
      const m = grid(id);
      expect(m.cols).toBe(4);
      expect(m.rows).toBe(3);
      expect(m.cells).toHaveLength(12);
      expect(m.cells.filter((c) => c.on)).toHaveLength(n);
      expect(m.cells.filter((c) => c.anchor)).toHaveLength(1);
      expect(m.cells.find((c) => c.anchor)!.on, id).toBe(true);
    }
  });

  it('düz metin görünümü: şekilleri ekrandaki gibi çizer', () => {
    const t = (id: string) => miniGridText(skillMiniGrid(content.skills[id]!, F)!);
    // motor terimleri: 'row' = aynı derinlik (ekranda DİKEY şerit), 'column' = şerit/lane (ekranda YATAY şerit)
    expect(t('shape_row')).toEqual(['.#..', '.A..', '.#..']);
    expect(t('shape_column')).toEqual(['....', '#A##', '....']);
    expect(t('shape_plus')).toEqual(['.#..', '#A#.', '.#..']);
    // rect: 2 sütun x 3 satır, anchor sol-alt köşe
    expect(t('shape_rect')).toEqual(['.##.', '.##.', '.A#.']);
  });

  it('şekil olmayan skill / alan olmayan skill için şema yok', () => {
    expect(skillMiniGrid(content.skills.judgment!, F)).toBeNull(); // eski radius tabanlı alan skill'i
    expect(skillMiniGrid(Object.values(content.skills).find((s) => s.target === 'single_enemy')!, F)).toBeNull();
    expect(shapeMiniGrid(undefined, F)).toBeNull();
    expect(shapeMiniGrid({ radius: 1 }, F)).toBeNull();
  });
});

describe('takım seçimi: test class kartı', () => {
  it('Geometer kart listesinde (seçilebilir), testOnly olarak işaretli ve test kartları SONDA', () => {
    const ids = rosterIds();
    expect(ids).toContain('aoe_tester');
    expect(isTestClass(content.classes.aoe_tester!)).toBe(true);
    expect(ids).toHaveLength(content.selectableClasses.length);
    const firstTest = ids.findIndex((id) => content.classes[id]!.testOnly);
    expect(ids.slice(firstTest).every((id) => content.classes[id]!.testOnly)).toBe(true);
    for (const id of ids.filter((x) => x !== 'aoe_tester')) expect(isTestClass(content.classes[id]!), id).toBe(false);
  });

  it('randomize havuzu test class\'ını içermez; rastgele takımlar ve ?seed= akışı (rollTeams) Geometer çıkarmaz', () => {
    expect(randomizePool()).not.toContain('aoe_tester');
    for (let seed = 1; seed <= 40; seed++) {
      expect(content.randomTeam(seed, 12, randomizePool())).not.toContain('aoe_tester');
      const t = content.rollTeams(content.DEFAULT_BATTLE, seed, { partySize: 12, enemySize: 12 });
      expect([...t.party, ...t.enemies]).not.toContain('aoe_tester');
    }
  });

  it('elle eklenen Geometer\'li takımla savaş kurulur ve çalışır (5 + 5, test modu dahil)', () => {
    const party = content.arrangeTeam(['aoe_tester', ...content.randomTeam(3, 4)]);
    const enemies = content.randomTeam(11, 5);
    for (const mode of ['turns', 'test'] as const) {
      const setup = content.battleSetup(content.DEFAULT_BATTLE, 3, mode, { party, enemies });
      expect(setup).toBeDefined();
    }
  });
});

describe('wiki: şekil şeması ve TEST rozeti verisi', () => {
  const wiki = buildWiki({ sprites: {}, avatars: {} });

  it('şekil skill\'lerinde shape şeması var, diğerlerinde yok', () => {
    const shapeSkills = wiki.skills.filter((s) => s.shape);
    expect(shapeSkills.map((s) => s.id).sort()).toEqual(['shape_column', 'shape_plus', 'shape_rect', 'shape_row']);
    for (const s of wiki.skills.filter((x) => !x.shape)) expect(content.skills[s.id]?.area?.shape, s.id).toBeUndefined();
  });

  it('Area shapes makalesi her şekil için bir şema taşır (Row, Column, Block 2x3, Cross)', () => {
    const a = wiki.mechanics.find((x) => x.id === 'area-shapes')!;
    expect(a.shapes!.map((x) => x.label).sort()).toEqual(['Block 2x3', 'Column', 'Cross', 'Row']);
  });
});
