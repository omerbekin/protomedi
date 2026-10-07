import { forwardDistances } from './graph';
import type { CampaignMap, MapEdge } from './types';

/**
 * Sis ve görünürlük (campaign.md 2.1). Mesafe = bulunulan düğümden ileri yönde kenar sayısı.
 *  - d = 1 ('near'): ad, alt başlık, tür ve (savaşsa) düşman önizlemesi.
 *  - 2 <= d <= visibility ('far'): yalnızca tür rozeti + ad.
 *  - daha uzak: sis ('fog'); `alwaysVisible` düğümleri (Castle Morvane) sis altında adıyla/silüetiyle ('goal').
 *  - geçilen düğümler 'cleared', bulunulan 'current'; artık ulaşılamayan (kapanan dal) düğümler 'closed'.
 */
export type NodeVis = 'current' | 'cleared' | 'near' | 'far' | 'fog' | 'goal' | 'closed';
export type EdgeVis = 'walked' | 'open' | 'visible' | 'fog' | 'closed';

export interface FogInput {
  at: string;
  path: string[];
}

export function nodeVisibility(map: CampaignMap, s: FogInput, revealAll = false): Record<string, NodeVis> {
  const dist = forwardDistances(map, s.at);
  const out: Record<string, NodeVis> = {};
  for (const n of map.nodes) {
    if (n.id === s.at) out[n.id] = 'current';
    else if (s.path.includes(n.id)) out[n.id] = 'cleared';
    else if (!dist.has(n.id)) out[n.id] = 'closed';
    else {
      const d = dist.get(n.id)!;
      if (revealAll || d === 1) out[n.id] = 'near';
      else if (d <= map.visibility) out[n.id] = 'far';
      else out[n.id] = map.alwaysVisible.includes(n.id) ? 'goal' : 'fog';
    }
  }
  return out;
}

/** Kenarın görünümü: yürünmüş, bulunulan yerden açık, görünür, sisli ya da kapanmış. */
export function edgeVisibility(_map: CampaignMap, s: FogInput, vis: Record<string, NodeVis>, e: MapEdge): EdgeVis {
  const i = s.path.indexOf(e.from);
  if (i >= 0 && s.path[i + 1] === e.to) return 'walked';
  const a = vis[e.from];
  const b = vis[e.to];
  if (a === 'closed' || b === 'closed' || (a === 'cleared' && b !== 'cleared')) return 'closed';
  if (e.from === s.at && b === 'near') return 'open';
  const seen = (v: NodeVis | undefined) => v === 'current' || v === 'cleared' || v === 'near' || v === 'far';
  return seen(a) && seen(b) ? 'visible' : 'fog';
}

/** Düşman önizlemesi gösterilir mi (yalnızca d = 1, ya da sis kapalıyken). */
export const showsEnemies = (v: NodeVis | undefined): boolean => v === 'near' || v === 'current';
/** Ad ve tür rozeti görünür mü? */
export const showsName = (v: NodeVis | undefined): boolean => v !== 'fog' && v !== undefined;
