// Sefer güç bütçesi (saf): bölüm, düğüm derinliği, beklenen oyuncu gücü, düşman ölçeği ve düğümün item seviyesi.
// Veri: data/campaign/power-budget.json. Tasarım: docs/design/progression/roadmap.md 1.3, items.md 4.2-4.3.
import budgetJson from '../../data/campaign/power-budget.json';
import { getMap } from './data';
import { finalNode, forwardDistances } from './graph';
import type { DifficultyEnemyMods } from './types';

export type PowerSystem = 'item' | 'level' | 'tree';

export interface ChapterBudget {
  chapter: number;
  name: string;
  /** Bölümün haritası (henüz yapılmadıysa null). */
  map: string | null;
  ilvl: [number, number];
  /** Bölüm sonunda sistem başına beklenen güç eki (0,15 = +%15). */
  end: Record<PowerSystem, number>;
}

export interface PowerBudget {
  compensation: number;
  systems: PowerSystem[];
  activeSystems: PowerSystem[];
  enemyScaleFields: Array<'hpMult' | 'powerMult'>;
  chapters: ChapterBudget[];
  farmMax: Partial<Record<PowerSystem, number>>;
}

export const POWER_BUDGET: PowerBudget = budgetJson as unknown as PowerBudget;

/** Haritanın bölümü (power-budget.json > chapters[].map). Listede yoksa bölüm 1 sayılır (eski/deneme haritaları). */
export function chapterOf(mapId: string, budget: PowerBudget = POWER_BUDGET): ChapterBudget {
  return budget.chapters.find((c) => c.map === mapId) ?? budget.chapters[0]!;
}

/** Düğümün bölüm içindeki derinliği (0 = başlangıç, 1 = final): başlangıçtan en kısa yol / finale en kısa yol. */
export function nodeDepth(mapId: string, nodeId: string): number {
  const map = getMap(mapId);
  const dist = forwardDistances(map, map.start);
  const total = dist.get(finalNode(map)) ?? 0;
  const d = dist.get(nodeId) ?? 0;
  return total > 0 ? Math.min(1, d / total) : 0;
}

/** Bölümün başlangıç gücü = önceki bölümün sonu (bölüm 1: 0). */
function chapterStart(ch: ChapterBudget, budget: PowerBudget): Record<PowerSystem, number> {
  const prev = budget.chapters.find((c) => c.chapter === ch.chapter - 1);
  return Object.fromEntries(budget.systems.map((k) => [k, prev?.end[k] ?? 0])) as Record<PowerSystem, number>;
}

/** Bir noktada (bölüm + derinlik 0-1) sistem başına beklenen oyuncu gücü eki. */
export function expectedPowerAt(ch: ChapterBudget, depth: number, budget: PowerBudget = POWER_BUDGET): Record<PowerSystem, number> {
  const start = chapterStart(ch, budget);
  const t = Math.max(0, Math.min(1, depth));
  return Object.fromEntries(budget.systems.map((k) => [k, start[k] + (ch.end[k] - start[k]) * t])) as Record<PowerSystem, number>;
}

/** Düşman ölçek çarpanı: 1 + compensation x (açık sistemlerin beklenen gücü). `systems` verilmezse veride açık olanlar. */
export function enemyScaleAt(ch: ChapterBudget, depth: number, systems: PowerSystem[] = POWER_BUDGET.activeSystems, budget: PowerBudget = POWER_BUDGET): number {
  const e = expectedPowerAt(ch, depth, budget);
  const sum = systems.reduce((a, k) => a + (e[k] ?? 0), 0);
  return Math.round((1 + budget.compensation * sum) * 1000) / 1000;
}

/** Düğümdeki düşman ölçeği (bugün: açık sistem yok => 1). */
export const enemyScale = (mapId: string, nodeId: string, systems?: PowerSystem[]): number => enemyScaleAt(chapterOf(mapId), nodeDepth(mapId, nodeId), systems);

/**
 * Bölüm ölçeğinin düşmana eki (battlePlan bunu zorluk ekinin yanında uygular; withDifficulty ile aynı birleşme kuralı). Ölçek 1 ise undefined
 * (savaş bugünküyle birebir aynı).
 */
export function chapterEnemyMods(mapId: string, nodeId: string, systems?: PowerSystem[]): DifficultyEnemyMods | undefined {
  const k = enemyScale(mapId, nodeId, systems);
  if (k === 1) return undefined;
  return Object.fromEntries(POWER_BUDGET.enemyScaleFields.map((f) => [f, k])) as DifficultyEnemyMods;
}

/** Düğümün item seviyesi (loot için, Aşama 1): bölümün ilvl aralığında derinliğe göre. */
export function nodeIlvl(mapId: string, nodeId: string): number {
  const ch = chapterOf(mapId);
  const [a, b] = ch.ilvl;
  return Math.round(a + (b - a) * nodeDepth(mapId, nodeId));
}
