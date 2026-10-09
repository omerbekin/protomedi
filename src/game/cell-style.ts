/**
 * Ortak hücre plakası dilinin SAF (Phaser'sız) kısmı: durum -> stil, birleşik dış hat, aşama (stage) haritası.
 * Yuva/hedef seçiminin her yeri (Move Tile, tek hedef, dost hedef, diriltme, şekil/alan skill'leri, takım seçimi slotları) aynı stilleri kullanır;
 * çizim `shape-draw.ts` > `drawCellTiles` içindedir. Yeni bir seçim türü eklenince burada yeni durum açma, mevcut durumu kullan.
 */

/** selectable = seçilebilir (hafif); hover = imleç üstünde; affected = şekil kapsamı; anchor = imlecin hücresi; invalid = geçersiz; ally/enemy = dost/düşman hedef; move = yürünebilir. */
export type CellState = 'selectable' | 'hover' | 'affected' | 'anchor' | 'invalid' | 'ally' | 'enemy' | 'move';
/** Ton: nötr (altın), dost (yeşilimsi-mavi), düşman (kırmızı-turuncu). selectable/hover/affected/anchor tonlanabilir. */
export type CellTone = 'neutral' | 'ally' | 'enemy';

export interface CellStyle {
  fill: number;
  fillAlpha: number;
  line: number;
  lineAlpha: number;
  lineWidth: number;
  /** Köşe işaretleri (anchor). */
  corners: boolean;
}

export const CELL_STATES: readonly CellState[] = ['selectable', 'hover', 'affected', 'anchor', 'invalid', 'ally', 'enemy', 'move'];

/**
 * Ton paleti (tasarım kiti, Ömer 2026-10-09): base = dolgu/çizgi, hi = parlak çerçeve. Nötr = kitin altını (EL.GOLD / EL.ON), düşman = kor
 * kırmızısı, dost = soluk yeşil-mavi. Çizgiler ince, dolgu hafif; vurgu yumuşak ışıma ile (shape-draw.ts).
 */
export const CELL_HUE = {
  neutral: { base: 0xe2b766, hi: 0xf8e3a8 }, // kit altını (Phaser'sız kalsın diye elegant-ui'den ayrı)
  ally: { base: 0x63c7ab, hi: 0xc8f4e4 },
  enemy: { base: 0xe2643e, hi: 0xffc29a },
} as const;

const INVALID = 0xb45a52;
const MOVE = 0xecd08e;

/** Durum (+ ton) -> çizim stili. Saf: aynı girdi aynı çıktı. */
export function cellStyle(state: CellState, tone: CellTone = 'neutral'): CellStyle {
  switch (state) {
    case 'selectable': {
      const h = CELL_HUE[tone];
      return { fill: h.base, fillAlpha: 0.08, line: h.base, lineAlpha: 0.55, lineWidth: 1.5, corners: false };
    }
    case 'hover': {
      const h = CELL_HUE[tone];
      return { fill: h.base, fillAlpha: 0.3, line: h.hi, lineAlpha: 1, lineWidth: 2.5, corners: false };
    }
    case 'affected': {
      const h = CELL_HUE[tone];
      return { fill: h.base, fillAlpha: 0.3, line: h.base, lineAlpha: 0.95, lineWidth: 2, corners: false };
    }
    case 'anchor': {
      const h = CELL_HUE[tone];
      return { fill: h.base, fillAlpha: 0.42, line: h.hi, lineAlpha: 1, lineWidth: 2.5, corners: true };
    }
    case 'invalid':
      return { fill: INVALID, fillAlpha: 0.14, line: INVALID, lineAlpha: 0.65, lineWidth: 1.5, corners: false };
    case 'ally': {
      const h = CELL_HUE.ally;
      return { fill: h.base, fillAlpha: 0.3, line: h.hi, lineAlpha: 1, lineWidth: 2.5, corners: false };
    }
    case 'enemy': {
      const h = CELL_HUE.enemy;
      return { fill: h.base, fillAlpha: 0.3, line: h.hi, lineAlpha: 1, lineWidth: 2.5, corners: false };
    }
    case 'move':
      return { fill: MOVE, fillAlpha: 0.18, line: MOVE, lineAlpha: 0.9, lineWidth: 2, corners: false };
  }
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Hücre kümesinin BİRLEŞİK dış hattı: yalnızca kümenin dışına bakan kenarlar (komşusu da kümede olan kenarlar atlanır).
 * Hücreler `quadOf(slot)` ile aynı sırada dört köşe verir: [-sıra-şerit, +sıra-şerit, +sıra+şerit, -sıra+şerit]
 * (kenar 0: şerit-1 komşusu, 1: sıra+1, 2: şerit+1, 3: sıra-1). Çıktı: [başlangıç, bitiş] çiftleri.
 */
export function cellOutlineEdges(quadOf: (slot: number) => Pt[], lanes: number, rows: number, cells: number[]): Array<[Pt, Pt]> {
  const set = new Set(cells);
  const out: Array<[Pt, Pt]> = [];
  for (const slot of set) {
    const row = Math.floor(slot / lanes);
    const lane = slot % lanes;
    if (row < 0 || row >= rows || lane < 0 || lane >= lanes) continue;
    const q = quadOf(slot);
    const nb: Array<number | null> = [lane > 0 ? slot - 1 : null, row < rows - 1 ? slot + lanes : null, lane < lanes - 1 ? slot + 1 : null, row > 0 ? slot - lanes : null];
    for (let e = 0; e < 4; e++) {
      const n = nb[e];
      if (n == null || !set.has(n)) out.push([q[e]!, q[(e + 1) % 4]!]);
    }
  }
  return out;
}

/**
 * Aşamalı vuruş (area.stages / önizleme `stages`): her aşama bir hücre listesidir ([[1. aşama hücreleri], [2. aşama hücreleri], ...]);
 * `{ cells: number[] }` biçimi de kabul edilir. Hücre -> aşama numarası (1 tabanlı; bir hücre birden çok aşamadaysa ilki). Tanınmayan girdi = boş harita.
 */
export function stageMap(stages: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!Array.isArray(stages)) return out;
  stages.forEach((st, i) => {
    const list: unknown = Array.isArray(st) ? st : (st as { cells?: unknown } | null)?.cells;
    if (!Array.isArray(list)) return;
    for (const c of list) if (typeof c === 'number' && !out.has(c)) out.set(c, i + 1);
  });
  return out;
}

/** Aşama parlaklık çarpanı: 1. aşama tam, sonrakiler giderek soluk. */
export const stageAlpha = (stage: number): number => (stage <= 1 ? 1 : Math.max(0.35, 1 - 0.42 * (stage - 1)));
