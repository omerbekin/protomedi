// Dizilimin EKRAN geometrisine göre komşuluk haritası (saf yardımcılar; layout verisi dışarıdan verilir).

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
 * Yan vuruş (splash) komşuluk haritası. Saldırı ekranda yatay (iki takım karşılıklı) geldiği için "yan" = ekranda hedefin
 * üstündeki ve altındaki birimlerdir: ayak noktaları yatayda en fazla `maxDx` (sprite genişliğinden az: sprite'lar üst üste biner)
 * uzakta, farklı yükseklikte olan hücreler. Eğik dizilim yüzünden bu, aynı sıradaki şerit komşuları ya da (yakın hücre boşsa)
 * bir önceki/sonraki sıranın çapraz hücresi olabilir. Her yönde en yakın aday önce gelir (eşitlikte küçük yuva).
 */
export function computeSideNeighbors(slots: readonly CellPoint[], maxDx: number): SideCandidates[] {
  return slots.map((a, i) => {
    const near = slots
      .map((b, j) => ({ j, dx: b.x - a.x, dy: b.y - a.y }))
      .filter((c) => c.j !== i && Math.abs(c.dx) <= maxDx && c.dy !== 0)
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
