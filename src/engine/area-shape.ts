// Alan şekilleri (saf): bir ANCHOR hücreden bir hücre kümesi üretir. Phaser/DOM yok; ekran uzayı bilgisi formulas.json > formation.screenGrid'den gelir.
//
// Terimler: SIRA (row) = aynı derinlik (yuva = sıra*şerit sayısı + şerit; 0 = en önde); ŞERİT (column / lane) = aynı şeritteki tüm sıralar.
//  - row:    anchor'ın SIRASINDAKİ tüm hücreler (şerit sayısı kadar).
//  - column: anchor'ın ŞERİDİNDEKİ tüm hücreler (sıra sayısı kadar).
//  - plus:   anchor + 4 yön komşusu (sıra±1 aynı şerit, şerit±1 aynı sıra); tahta dışındakiler atlanır (kenarda kırpılır).
//  - x:      anchor + 4 ÇAPRAZ komşu (sıra±1 ve şerit±1 birlikte); tahta dışındakiler atlanır. `hitsAtCenter: 2` ile merkez iki kez vurulur.
//  - rect:   `rows` sıra x `cols` şerit dikdörtgen; EKSEN EKSEN (ekran uzayında, Ömer kuralı): boyutu 3 ve üstü olan eksende fare hücresi alanın ORTASIdır
//            (çift boyutta orta-sol); ortalanamıyorsa (tahta kenarı) o eksende SOLDAN referans (fare hücresi alanın başlangıcı), o da taşarsa kaydırılır.
//            Boyutu 1-2 olan eksende eski kural: fare hücresi EKRANDAKİ sol-alt köşe (yatayda en sol, dikeyde en alt); dikdörtgen sağa ve yukarı uzanır.
//            Tahta dışına taşarsa BOYUT KORUNARAK tahtaya KAYDIRILIR (clamp): her anchor için geçerli bir dikdörtgen vardır.
//            Oyuncu ve düşman tarafı aynalı olduğundan ekranda "sol" iki tarafta farklı sıra yönüne denk gelir; bu yüzden hesap ekran ızgarasındadır.
//            Geçerli boyutlar: rows 1..formation.rows (4), cols 1..formation.lanes (3) (1x1 .. 4x3). Tahtayı aşan / tam sayı olmayan boyut VERİ HATASIDIR
//            (areaDefProblem, tests/content.test.ts); çalışma zamanında yine de güvenlik için tahtaya kısılır.
// Aşamalı vuruş (area.stages): shapeStages hücreleri aşamalara böler (row: derinlik, ön sıra önce; column: ekran satırı, üst önce; distance: anchor'a
// uzaklık, merkez önce; reverse ters çevirir). Aşamasız şekil tek aşamadır.
import type { AreaDef, AreaShapeKind, AreaStageKind, Formulas, ScreenCell, Side, SkillDef } from './types';

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
    case 'x':
      // anchor + 4 çapraz komşu (sıra±1 VE şerit±1); tahta dışı atlanır (kenarda/köşede kırpılır)
      return all.filter((i) => {
        const dr = Math.abs(Math.floor(i / lanes) - row);
        const dl = Math.abs((i % lanes) - lane);
        return (dr === 0 && dl === 0) || (dr === 1 && dl === 1);
      });
    case 'rect': {
      const h = clamp(Math.floor(area.rows ?? 1), 1, rows); // ekranda yatay genişlik (derinlik ekseni: sıra sayısı)
      const v = clamp(Math.floor(area.cols ?? 1), 1, lanes); // ekranda dikey yükseklik (şerit sayısı)
      const a = screenCellOf(formation, board, anchorSlot);
      // Eksen eksen (ekran uzayında): boyut >= 3 ise fare hücresi ORTADA; ortalanamazsa soldan (düşük koordinat) referans; o da taşarsa kaydır.
      // Boyut < 3 ise sol-alt köşe kuralı (yatayda fare en solda, dikeyde en altta); taşarsa kaydır (boyut korunur).
      const left = rectAxisStart(a.col, h, rows, 'low');
      const top = rectAxisStart(a.row, v, lanes, 'high');
      return all.filter((i) => {
        const c = screenCellOf(formation, board, i);
        return c.col >= left && c.col < left + h && c.row >= top && c.row < top + v;
      });
    }
  }
}

/** Rect ekseninde fare hücresinin ORTADA olduğu en küçük boyut (Ömer kuralı: 3 ve üstü). */
export const RECT_CENTER_MIN = 3;

/**
 * Rect'in bir ekran eksenindeki başlangıç koordinatı. size >= RECT_CENTER_MIN: fare hücresi alanın ortası (tek boyutta tam orta; çift boyutta orta-sol,
 * yani başlangıçtan floor((size-1)/2) uzakta); ortalanmış alan tahtayı aşarsa SOLDAN (düşük koordinat) referans: fare hücresi alanın başlangıcı; o da
 * taşarsa boyut korunarak tahtaya kaydırılır. size < 3: eski kural, fare hücresi `smallAt` ucunda (yatay: 'low' = en sol, dikey: 'high' = en alt).
 */
export function rectAxisStart(a: number, size: number, max: number, smallAt: 'low' | 'high'): number {
  if (size >= RECT_CENTER_MIN) {
    const centered = a - Math.floor((size - 1) / 2);
    if (centered >= 0 && centered + size <= max) return centered;
    return clamp(a, 0, max - size);
  }
  return clamp(smallAt === 'low' ? a : a - size + 1, 0, max - size);
}

/**
 * Şeklin hücreleri aşamalara bölünmüş hali (her aşama yuva sırasıyla; boş hücreler dahil). Aşamasız şekil = tek aşama [tüm hücreler].
 * row: aynı derinlik (sıra) bir aşama, ön sıra (saldırgana en yakın) önce. column: aynı şerit bir aşama, ekranda üstteki önce.
 * distance: anchor hücreye uzaklık (sıra farkı + şerit farkı) halkaları, anchor önce. `reverse` sırayı ters çevirir.
 */
export function shapeStages(area: AreaDef, anchorSlot: number, board: Side, formation: ShapeFormation): number[][] {
  const cells = shapeCells(area, anchorSlot, board, formation);
  if (!area.stages || cells.length === 0) return cells.length ? [cells] : [];
  const key = stageKey(area.stages, anchorSlot, board, formation);
  const keys = [...new Set(cells.map(key))].sort((a, b) => (area.reverse ? b - a : a - b));
  return keys.map((k) => cells.filter((c) => key(c) === k));
}

function stageKey(kind: AreaStageKind, anchorSlot: number, board: Side, formation: ShapeFormation): (slot: number) => number {
  const { lanes } = formation;
  switch (kind) {
    case 'row':
      return (s) => Math.floor(s / lanes);
    case 'column':
      return (s) => screenCellOf(formation, board, s).row;
    case 'distance':
      return (s) => Math.abs(Math.floor(s / lanes) - Math.floor(anchorSlot / lanes)) + Math.abs((s % lanes) - (anchorSlot % lanes));
  }
}

/** Hücrenin aşama numarası (aşamalarda yoksa -1). */
export function stageOfCell(stages: number[][], slot: number): number {
  return stages.findIndex((s) => s.includes(slot));
}

const SHAPES: readonly AreaShapeKind[] = ['row', 'column', 'rect', 'plus', 'x'];
/** hitsAtCenter üst sınırı (veri doğrulaması). */
export const MAX_HITS_AT_CENTER = 5;
/** Alan hedefli hedef türleri (şekil zorunlu). */
export const AREA_TARGETS: readonly string[] = ['area_enemies', 'area_any'];
const STAGE_KINDS: readonly AreaStageKind[] = ['row', 'column', 'distance'];

/** Veri doğrulaması: alan tanımı geçersizse sorunun açıklaması (Türkçe), geçerliyse null. rect: rows 1..formation.rows, cols 1..formation.lanes (tam sayı). */
export function areaDefProblem(area: unknown, formation: Pick<ShapeFormation, 'rows' | 'lanes'>): string | null {
  if (!area || typeof area !== 'object') return 'area tanımı yok';
  const a = area as Record<string, unknown>;
  if ('radius' in a) return 'area.radius kaldırıldı: shape kullanın (row | column | rect | plus)';
  if (!SHAPES.includes(a.shape as AreaShapeKind)) return `geçersiz area.shape: ${String(a.shape)}`;
  if (a.shape === 'rect') {
    const ok = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
    if (!ok(a.rows, formation.rows)) return `rect rows 1..${formation.rows} tam sayı olmalı (verilen ${String(a.rows)})`;
    if (!ok(a.cols, formation.lanes)) return `rect cols 1..${formation.lanes} tam sayı olmalı (verilen ${String(a.cols)})`;
    if (a.anchor !== undefined && a.anchor !== 'bottom_left') return `geçersiz rect anchor: ${String(a.anchor)}`;
  } else if (a.rows !== undefined || a.cols !== undefined || a.anchor !== undefined) {
    return `rows/cols/anchor yalnızca rect şeklinde kullanılır (${String(a.shape)})`;
  }
  if (a.stages !== undefined && !STAGE_KINDS.includes(a.stages as AreaStageKind)) return `geçersiz area.stages: ${String(a.stages)}`;
  if (a.reverse !== undefined && (typeof a.reverse !== 'boolean' || a.stages === undefined)) return 'area.reverse yalnızca stages ile (true/false)';
  if (a.hitsAtCenter !== undefined && !(Number.isInteger(a.hitsAtCenter) && (a.hitsAtCenter as number) >= 1 && (a.hitsAtCenter as number) <= MAX_HITS_AT_CENTER)) {
    return `area.hitsAtCenter 1..${MAX_HITS_AT_CENTER} tam sayı olmalı (verilen ${String(a.hitsAtCenter)})`;
  }
  return null;
}

/**
 * Skill düzeyinde alan doğrulaması (veri testi): area_enemies'in geçerli bir şekli olmalı; başka hedef türünde area olmamalı; eski column_enemies yasak;
 * aşamalı skill'de yalnızca hedef başına işleyen etkiler olabilir (damage (bahis/kalkan tüketme yok), status (self değil), randomStatus, ground),
 * çünkü aşamalı skill etkilerini her aşamada ayrı uygular. Sorun yoksa null.
 */
export function skillAreaProblem(skill: SkillDef, formation: Pick<ShapeFormation, 'rows' | 'lanes'>): string | null {
  if ((skill.target as string) === 'column_enemies') return 'column_enemies kaldırıldı: area_enemies + area {shape: "column"} kullanın';
  if (!AREA_TARGETS.includes(skill.target)) return skill.area ? `area yalnızca area_enemies / area_any hedefinde kullanılır (${skill.target})` : null;
  const p = areaDefProblem(skill.area, formation);
  if (p) return p;
  if (skill.target === 'area_any') {
    // İki tahtaya da atılabilen alan: her etki `side` ile hangi tarafa gittiğini söylemeli; hasar/mana yakma yok (dost tahtasına atılınca anlamsız)
    for (const e of skill.effects) {
      if (e.side !== 'allies' && e.side !== 'enemies') return `area_any skill'inde her etkinin side alanı olmalı (allies | enemies): ${e.type}`;
      if (e.type !== 'status' || e.self) return `area_any skill'inde şimdilik yalnızca status etkisi desteklenir: ${e.type}`;
    }
  }
  if (skill.area?.stages) {
    for (const e of skill.effects) {
      // Hedef başı etkiler: hasar, durum, DoT (Wither), yığın (Omen) ve patlatma her aşamada o aşamanın hedeflerine uygulanır
      const ok = (e.type === 'damage' && !e.bet && !e.bonusFromShield) || (e.type === 'status' && !e.self) || e.type === 'randomStatus' || e.type === 'ground' || e.type === 'dot' || e.type === 'omen' || e.type === 'detonate';
      if (!ok) return `aşamalı (stages) skill'de desteklenmeyen etki: ${e.type}`;
    }
  }
  return null;
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
    case 'x':
      return 'X';
    case 'rect':
      return `Block ${area.rows ?? 1}x${area.cols ?? 1}`;
    default:
      return 'Area';
  }
}

/** Maç kaydı için: 'rect 2x3', 'row', 'column', 'plus'; aşamalıysa ' staged row' / ' staged row reverse' eki. */
export function shapeLabel(area: AreaDef): string {
  const shape = area.shape === 'rect' ? `rect ${area.rows ?? 1}x${area.cols ?? 1}` : area.shape;
  const base = (area.hitsAtCenter ?? 1) > 1 ? `${shape} center x${area.hitsAtCenter}` : shape;
  return area.stages ? `${base} staged ${area.stages}${area.reverse ? ' reverse' : ''}` : base;
}
