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
