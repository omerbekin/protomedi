// Alan şekilleri (saf): bir ANCHOR hücreden bir hücre kümesi üretir. Phaser/DOM yok; ekran uzayı bilgisi formulas.json > formation.screenGrid'den gelir.
//
// Terimler: SIRA (row) = aynı derinlik (yuva = sıra*şerit sayısı + şerit; 0 = en önde); ŞERİT (column / lane) = aynı şeritteki tüm sıralar.
//  - row:    anchor'ın SIRASINDAKİ tüm hücreler (şerit sayısı kadar).
//  - column: anchor'ın ŞERİDİNDEKİ tüm hücreler (sıra sayısı kadar).
//  - plus:   anchor + 4 yön komşusu (sıra±1 aynı şerit, şerit±1 aynı sıra); tahta dışındakiler atlanır (kenarda kırpılır).
//  - rect:   `rows` sıra x `cols` şerit dikdörtgen; anchor dikdörtgenin EKRANDAKİ sol-alt köşesidir (ekranda en solda ve en altta). Dikdörtgen anchor'dan
//            sağa (ekranda sağa) ve yukarı uzanır. Tahta dışına taşarsa BOYUT KORUNARAK tahtaya KAYDIRILIR (clamp): her anchor için geçerli bir dikdörtgen vardır.
//            Oyuncu ve düşman tarafı aynalı olduğundan ekranda "sol" iki tarafta farklı sıra yönüne denk gelir; bu yüzden hesap ekran ızgarasındadır.
import type { AreaDef, AreaShapeKind, Formulas, ScreenCell, Side } from './types';

/** Şekil hesabı için gereken dizilim verisi (formulas.json > formation). */
export type ShapeFormation = Pick<Formulas['formation'], 'rows' | 'lanes'> & { screenGrid?: Formulas['formation']['screenGrid'] };

export const isShapeArea = (area: AreaDef | undefined): area is AreaDef & { shape: AreaShapeKind } => !!area?.shape;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Yuvanın ekran konumu (screenGrid yoksa: sütun = sıra, satır = şerit; yani ayna yok). */
export function screenCellOf(formation: ShapeFormation, board: Side, slot: number): ScreenCell {
  const g = formation.screenGrid?.[board]?.[slot];
  return g ?? { col: Math.floor(slot / formation.lanes), row: slot % formation.lanes };
}

/** Şeklin anchor hücreye göre kapsadığı hücreler (yuva numaraları, artan sırada; boş hücreler dahil). Geçersiz anchor = []. */
export function shapeCells(area: AreaDef, anchorSlot: number, board: Side, formation: ShapeFormation): number[] {
  const { rows, lanes } = formation;
  if (!area.shape || !Number.isInteger(anchorSlot) || anchorSlot < 0 || anchorSlot >= rows * lanes) return [];
  const row = Math.floor(anchorSlot / lanes);
  const lane = anchorSlot % lanes;
  const all = Array.from({ length: rows * lanes }, (_, i) => i);
  switch (area.shape) {
    case 'row':
      return all.filter((i) => Math.floor(i / lanes) === row);
    case 'column':
      return all.filter((i) => i % lanes === lane);
    case 'plus':
      return all.filter((i) => {
        const dr = Math.abs(Math.floor(i / lanes) - row);
        const dl = Math.abs((i % lanes) - lane);
        return dr + dl <= 1;
      });
    case 'rect': {
      const h = clamp(Math.floor(area.rows ?? 1), 1, rows); // ekranda yatay genişlik (derinlik ekseni: sıra sayısı)
      const v = clamp(Math.floor(area.cols ?? 1), 1, lanes); // ekranda dikey yükseklik (şerit sayısı)
      const a = screenCellOf(formation, board, anchorSlot);
      // sol-alt köşe: sağa h sütun, yukarı v satır. Taşarsa kaydır (boyut korunur).
      const left = clamp(a.col, 0, rows - h);
      const top = clamp(a.row - v + 1, 0, lanes - v);
      return all.filter((i) => {
        const c = screenCellOf(formation, board, i);
        return c.col >= left && c.col < left + h && c.row >= top && c.row < top + v;
      });
    }
  }
}

/** Şeklin kısa adı (rozet / kayıt): 'Row', 'Column', 'Cross', 'Block 2x3'. */
export function shapeBadge(area: AreaDef): string {
  switch (area.shape) {
    case 'row':
      return 'Row';
    case 'column':
      return 'Column';
    case 'plus':
      return 'Cross';
    case 'rect':
      return `Block ${area.rows ?? 1}x${area.cols ?? 1}`;
    default:
      return 'Area';
  }
}

/** Maç kaydı için: 'rect 2x3', 'row', 'column', 'plus'. */
export function shapeLabel(area: AreaDef): string {
  return area.shape === 'rect' ? `rect ${area.rows ?? 1}x${area.cols ?? 1}` : (area.shape ?? `radius ${area.radius ?? 1}`);
}
