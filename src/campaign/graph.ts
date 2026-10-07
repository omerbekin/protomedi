import type { CampaignMap, MapEdge, MapNode } from './types';

/**
 * Harita grafı yardımcıları (saf). Seçim noktası = çıkışı 1'den fazla; birleşme noktası = girişi 1'den fazla (veride işaretlenmez).
 * Savaşlı düğüm = `encounter` alanı olan düğüm (battle / elite / boss ve korunan hazine).
 */

export function node(map: CampaignMap, id: string): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Node not found: ${id}`);
  return n;
}

export const findNode = (map: CampaignMap, id: string): MapNode | undefined => map.nodes.find((x) => x.id === id);

export const outgoing = (map: CampaignMap, id: string): string[] => map.edges.filter((e) => e.from === id).map((e) => e.to);
export const incoming = (map: CampaignMap, id: string): string[] => map.edges.filter((e) => e.to === id).map((e) => e.from);
export const edgeBetween = (map: CampaignMap, from: string, to: string): MapEdge | undefined => map.edges.find((e) => e.from === from && e.to === to);

export const choicePoints = (map: CampaignMap): string[] => map.nodes.filter((n) => outgoing(map, n.id).length > 1).map((n) => n.id);
export const mergePoints = (map: CampaignMap): string[] => map.nodes.filter((n) => incoming(map, n.id).length > 1).map((n) => n.id);

export const isBattleNode = (n: MapNode): boolean => !!n.encounter;

/** Final düğümü (yoksa çıkışı olmayan ilk düğüm). */
export function finalNode(map: CampaignMap): string {
  return (map.nodes.find((n) => n.final) ?? map.nodes.find((n) => outgoing(map, n.id).length === 0))!.id;
}

/** Başlangıçtan finale tüm rotalar (her biri düğüm id listesi). */
export function allRoutes(map: CampaignMap): string[][] {
  const out: string[][] = [];
  const walk = (id: string, acc: string[]) => {
    const next = [...acc, id];
    const outs = outgoing(map, id);
    if (outs.length === 0) out.push(next);
    else for (const o of outs) if (!acc.includes(o)) walk(o, next);
  };
  walk(map.start, []);
  return out;
}

/** Bir rotadaki savaşsız duraklarının en uzun art arda serisi (K2). */
export function longestPeacefulRun(map: CampaignMap, route: string[]): number {
  let best = 0;
  let run = 0;
  for (const id of route) {
    run = isBattleNode(node(map, id)) ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * K1: bir seçim noktasından çıkan her dalda (birleşme noktasına kadar, birleşme hariç) en az bir savaş var.
 * Dönen liste kuralı bozan dalların açıklamasıdır (boş = kural sağlanıyor).
 */
export function k1Violations(map: CampaignMap): string[] {
  const merges = new Set(mergePoints(map));
  const bad: string[] = [];
  for (const c of choicePoints(map)) {
    for (const first of outgoing(map, c)) {
      // dal: birleşme noktasına (ya da sona) kadar ilerle; dal içinde seçim yoksa tek yol
      const branch: string[] = [];
      let cur: string | undefined = first;
      while (cur && !merges.has(cur)) {
        branch.push(cur);
        const outs = outgoing(map, cur);
        cur = outs.length === 1 ? outs[0] : undefined;
      }
      if (!branch.some((id) => isBattleNode(node(map, id)))) bad.push(`${c} -> ${branch.join(',')}`);
    }
  }
  return bad;
}

/** BFS: `from` düğümünden ileri yönde kenar sayısıyla mesafe (ulaşılamayan düğüm haritada yok). */
export function forwardDistances(map: CampaignMap, from: string): Map<string, number> {
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const o of outgoing(map, id)) {
      if (dist.has(o)) continue;
      dist.set(o, dist.get(id)! + 1);
      queue.push(o);
    }
  }
  return dist;
}

/** Verinin temel doğrulaması: kimlikler tekil, kenarlar var olan düğümlere, her düğüm başlangıçtan ulaşılır, final var. */
export function validateMap(map: CampaignMap): string[] {
  const errors: string[] = [];
  const ids = map.nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate node ids');
  for (const e of map.edges) if (!ids.includes(e.from) || !ids.includes(e.to)) errors.push(`edge ${e.from}->${e.to} points to a missing node`);
  if (!ids.includes(map.start)) errors.push('start node missing');
  const reach = forwardDistances(map, map.start);
  for (const id of ids) if (!reach.has(id)) errors.push(`node ${id} is unreachable`);
  for (const r of map.regions) if (!r.title) errors.push(`region ${r.id} has no title`);
  for (const n of map.nodes) if (!map.regions.some((r) => r.id === n.region)) errors.push(`node ${n.id} has an unknown region`);
  return errors;
}
