import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content } from '../src/engine';
import { CELL_STATES, cellOutlineEdges, cellStyle, stageAlpha, stageMap } from '../src/game/cell-style';
import { cellQuad } from '../src/game/shape-geometry';
import { miniGridText, shapeMiniGrid } from '../src/ui/shape-diagram';

const F = content.formulas.formation;
const slots = layout.enemySlots;
const quadOf = (slot: number) => cellQuad(slots, F.lanes, slot, 1);
const edges = (cells: number[]) => cellOutlineEdges(quadOf, F.lanes, F.rows, cells);

const r = (c: number) => (c >> 16) & 255;
const g = (c: number) => (c >> 8) & 255;
const b = (c: number) => c & 255;

describe('ortak hücre plakası: durum -> stil', () => {
  it('8 durumun hepsi için tam bir stil var', () => {
    expect(CELL_STATES).toHaveLength(8);
    for (const s of CELL_STATES) {
      const st = cellStyle(s);
      expect(st.fillAlpha, s).toBeGreaterThan(0);
      expect(st.fillAlpha, s).toBeLessThanOrEqual(1);
      expect(st.lineAlpha, s).toBeGreaterThan(0);
      expect(st.lineWidth, s).toBeGreaterThan(0);
    }
  });

  it('hover seçilebilirden belirgin; affected dolu; yalnızca anchor köşe işaretli', () => {
    expect(cellStyle('hover').fillAlpha).toBeGreaterThan(cellStyle('selectable').fillAlpha);
    expect(cellStyle('hover').lineAlpha).toBeGreaterThan(cellStyle('selectable').lineAlpha);
    expect(cellStyle('affected').fillAlpha).toBeGreaterThan(cellStyle('selectable').fillAlpha);
    expect(cellStyle('anchor').fillAlpha).toBeGreaterThanOrEqual(cellStyle('affected').fillAlpha);
    for (const s of CELL_STATES) expect(cellStyle(s).corners, s).toBe(s === 'anchor');
  });

  it('tonlar: invalid ve enemy kırmızımsı, ally yeşilimsi-mavi, move/nötr altın', () => {
    const inv = cellStyle('invalid').fill;
    expect(r(inv)).toBeGreaterThan(g(inv));
    expect(r(inv)).toBeGreaterThan(b(inv));
    expect(inv).toBe(cellStyle('invalid').line);
    const en = cellStyle('enemy').fill;
    expect(r(en)).toBeGreaterThan(g(en) + 40);
    const al = cellStyle('ally').fill;
    expect(g(al)).toBeGreaterThan(r(al));
    expect(b(al)).toBeGreaterThan(r(al));
    for (const s of ['move', 'selectable', 'affected'] as const) {
      const f = cellStyle(s).fill;
      expect(r(f), s).toBeGreaterThan(b(f)); // sıcak altın/sarı
      expect(g(f), s).toBeGreaterThan(b(f));
    }
  });

  it('ton parametresi selectable/hover/affected/anchor rengini değiştirir; ally/enemy durumları tonu sabitler', () => {
    for (const s of ['selectable', 'hover', 'affected', 'anchor'] as const) {
      expect(cellStyle(s, 'enemy').fill, s).not.toBe(cellStyle(s, 'ally').fill);
      expect(cellStyle(s, 'neutral').fill, s).not.toBe(cellStyle(s, 'enemy').fill);
    }
    expect(cellStyle('ally', 'enemy').fill).toBe(cellStyle('ally').fill);
    expect(cellStyle('enemy', 'ally').fill).toBe(cellStyle('enemy').fill);
  });
});

describe('birleşik dış hat', () => {
  it('tek hücre 4 kenar; boş küme 0', () => {
    expect(edges([4])).toHaveLength(4);
    expect(edges([])).toHaveLength(0);
  });

  it('yan yana iki hücre (aynı sıra, komşu şerit) 6 kenar: ortak kenar çizilmez', () => {
    expect(edges([3, 4])).toHaveLength(6);
    expect(edges([3, 6])).toHaveLength(6); // aynı şerit, komşu sıra
  });

  it('2x2 blok 8 kenar; 2x3 blok 10; tüm tahta (4x3) çevresi 14', () => {
    expect(edges([0, 1, 3, 4])).toHaveLength(8);
    expect(edges([0, 1, 3, 4, 6, 7])).toHaveLength(10);
    expect(edges(Array.from({ length: F.rows * F.lanes }, (_, i) => i))).toHaveLength(2 * (F.rows + F.lanes));
  });

  it('artı şekli 12 kenar; ayrık iki hücre 8 kenar', () => {
    expect(edges([1, 3, 4, 5, 7])).toHaveLength(12);
    expect(edges([0, 11])).toHaveLength(8);
  });

  it('dış hat kenarları gerçekten kümenin sınırında: her kenarın orta noktası bir kümedeki hücre dörtgenine ait', () => {
    const cells = [0, 1, 3, 4, 7];
    for (const [a, c] of edges(cells)) expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(10);
  });
});

describe('aşama haritası', () => {
  it('hücre listesi dizisi: hücre -> 1 tabanlı aşama; ilk geçen kazanır', () => {
    const m = stageMap([[0, 3], [3, 6], [7]]);
    expect(m.get(0)).toBe(1);
    expect(m.get(3)).toBe(1);
    expect(m.get(6)).toBe(2);
    expect(m.get(7)).toBe(3);
    expect(m.has(1)).toBe(false);
  });

  it('{ cells } biçimi kabul edilir; tanınmayan girdi boş harita', () => {
    expect(stageMap([{ cells: [2] }, { cells: [5] }]).get(5)).toBe(2);
    expect(stageMap(undefined).size).toBe(0);
    expect(stageMap('row').size).toBe(0);
    expect(stageMap([null, 4]).size).toBe(0);
  });

  it('aşama parlaklığı: 1. tam, sonrakiler giderek soluk ama okunur', () => {
    expect(stageAlpha(1)).toBe(1);
    expect(stageAlpha(2)).toBeLessThan(stageAlpha(1));
    expect(stageAlpha(3)).toBeLessThan(stageAlpha(2));
    expect(stageAlpha(9)).toBeGreaterThanOrEqual(0.35);
  });
});

describe('mini şema: herhangi RxC', () => {
  const count = (rows: number, cols: number, extra: object = {}) => {
    const m = shapeMiniGrid({ shape: 'rect', rows, cols, ...extra }, F)!;
    return { m, on: m.cells.filter((c) => c.on).length, anchors: m.cells.filter((c) => c.anchor).length };
  };

  it('rect R sıra x C şerit (1..4 x 1..3): kapsanan hücre sayısı R*C, tek anchor, ızgara formasyon boyutunda', () => {
    for (let R = 1; R <= F.rows; R++) {
      for (let C = 1; C <= F.lanes; C++) {
        const { m, on, anchors } = count(R, C);
        expect(on, `${R}x${C}`).toBe(R * C);
        expect(anchors, `${R}x${C}`).toBe(1);
        expect(m.cols).toBe(F.rows);
        expect(m.rows).toBe(F.lanes);
        expect(m.cells).toHaveLength(F.rows * F.lanes);
        // kapsanan hücreler ekranda tek bir dikdörtgen oluşturur
        const cs = m.cells.filter((c) => c.on);
        const w = Math.max(...cs.map((c) => c.col)) - Math.min(...cs.map((c) => c.col)) + 1;
        const h = Math.max(...cs.map((c) => c.row)) - Math.min(...cs.map((c) => c.row)) + 1;
        expect(w * h, `${R}x${C} dikdörtgen`).toBe(R * C);
      }
    }
  });

  it('rect anchor hücresi kapsananın içinde: 1-2 boyutlu eksenlerde sol-alt köşe, 3+ boyutlu eksende orta (madde 226)', () => {
    const { m } = count(2, 2);
    const a = m.cells.find((c) => c.anchor)!;
    expect(a.on).toBe(true);
    const cs = m.cells.filter((c) => c.on);
    expect(a.col).toBe(Math.min(...cs.map((c) => c.col)));
    expect(a.row).toBe(Math.max(...cs.map((c) => c.row)));
    // 2x3: şerit ekseni 3 -> anchor dikeyde ortada, sıra ekseni 2 -> en solda
    const { m: tall } = count(2, 3);
    const t = tall.cells.find((c) => c.anchor)!;
    const tc = tall.cells.filter((c) => c.on);
    expect(t.col).toBe(Math.min(...tc.map((c) => c.col)));
    expect(t.row).toBe(1);
  });

  it('metin gösterimi satır sayısı = şerit sayısı; row/column/plus hâlâ doğru', () => {
    expect(miniGridText(shapeMiniGrid({ shape: 'rect', rows: 4, cols: 3 }, F)!)).toEqual(['####', '#A##', '####']);
    expect(miniGridText(shapeMiniGrid({ shape: 'plus' }, F)!)).toEqual(['.#..', '#A#.', '.#..']);
  });

  it('aşamalı şekilde hücrelerde aşama numarası var; aşamasızda yok', () => {
    const staged = shapeMiniGrid({ shape: 'rect', rows: 3, cols: 2, stages: 'row' }, F)!;
    const nums = new Set(staged.cells.filter((c) => c.on).map((c) => c.stage));
    expect(nums.has(undefined)).toBe(false);
    expect(Math.max(...(nums as Set<number>))).toBe(3);
    const plain = shapeMiniGrid({ shape: 'rect', rows: 3, cols: 2 }, F)!;
    expect(plain.cells.every((c) => c.stage === undefined)).toBe(true);
  });
});
