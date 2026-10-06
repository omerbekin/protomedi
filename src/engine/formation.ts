// Dizilimin EKRAN geometrisine göre komşuluk haritası (saf yardımcılar; layout verisi dışarıdan verilir).
import type { ScreenCell } from './types';

export interface CellPoint {
  x: number;
  y: number;
}

/** Bir hücrenin ekrandaki dik (üst/alt) komşu adayları, yakından uzağa. Çalışma zamanında her yönün ilk DOLU adayı vurulur. */
export interface SideCandidates {
  up: number[];
  down: number[];
}

/**
 * Yan vuruş (splash) komşuluk haritası. Saldırı ekranda yatay (iki takım karşılıklı) geldiği için "yan" = hedefle AYNI SIRADA
 * (aynı yatay hizada) ekranda hedefin üstündeki ve altındaki şerit komşularıdır. Eğik dizilim yüzünden komşu sıranın bazı hücreleri
 * (hedefin ARKASINDAKİ ya da ÖNÜNDEKİ çapraz hücreler) ekranda yakın görünür ve eskiden yanlışlıkla aday olurdu (boş yakın şerit
 * yüzünden arkadaki hücre seçiliyordu); artık yalnızca aynı sıradaki (`lanes` hücre/sıra) hücreler aday olur: ön/arka ASLA.
 * Ayrıca ayak noktaları yatayda en fazla `maxDx` uzakta, farklı yükseklikte olmalı. Her yönde en yakın aday önce gelir (eşitlikte küçük yuva).
 */
export function computeSideNeighbors(slots: readonly CellPoint[], maxDx: number, lanes: number): SideCandidates[] {
  return slots.map((a, i) => {
    const near = slots
      .map((b, j) => ({ j, dx: b.x - a.x, dy: b.y - a.y }))
      .filter((c) => c.j !== i && Math.floor(c.j / lanes) === Math.floor(i / lanes) && Math.abs(c.dx) <= maxDx && c.dy !== 0)
      .map((c) => ({ ...c, d: Math.hypot(c.dx, c.dy) }))
      .sort((p, q) => p.d - q.d || p.j - q.j);
    return { up: near.filter((c) => c.dy < 0).map((c) => c.j), down: near.filter((c) => c.dy > 0).map((c) => c.j) };
  });
}

/** Haritadan, hedef hücrenin dolu (`isOccupied`) en yakın üst ve alt komşusu (slot sırasıyla). */
export function pickSideNeighbors(map: SideCandidates | undefined, isOccupied: (slot: number) => boolean): number[] {
  if (!map) return [];
  const out: number[] = [];
  for (const list of [map.up, map.down]) {
    const hit = list.find(isOccupied);
    if (hit !== undefined) out.push(hit);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Ekran ızgarası: her yuvanın EKRANDAKİ sütun (soldan sağa) ve satır (yukarıdan aşağıya) dizini (layout ayak noktalarından).
 * Dizilim paralelkenar olduğu için eksenler ayrışır: sütun = sıranın (derinliğin) ortalama x'inin sıralaması, satır = şeridin ortalama y'sinin sıralaması.
 * Oyuncu tarafında derin sıra ekranda solda, düşman tarafında önde sıra solda olur (ayna); "sol-alt" köşe bu uzayda tanımlanır (area-shape.ts).
 */
export function computeScreenGrid(slots: readonly CellPoint[], rows: number, lanes: number): ScreenCell[] {
  const mean = (idx: number[], f: (p: CellPoint) => number) => idx.reduce((t, i) => t + f(slots[i]!), 0) / idx.length;
  const rank = (keys: number[]): number[] => keys.map((k, i) => keys.filter((o, j) => o < k || (o === k && j < i)).length);
  const colRank = rank(Array.from({ length: rows }, (_, r) => mean(Array.from({ length: lanes }, (_, l) => r * lanes + l), (p) => p.x)));
  const rowRank = rank(Array.from({ length: lanes }, (_, l) => mean(Array.from({ length: rows }, (_, r) => r * lanes + l), (p) => p.y)));
  return slots.slice(0, rows * lanes).map((_, i) => ({ col: colRank[Math.floor(i / lanes)]!, row: rowRank[i % lanes]! }));
}
