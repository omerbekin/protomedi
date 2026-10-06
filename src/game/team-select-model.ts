import { content } from '../engine';
import type { CombatantDef } from '../engine';

/**
 * Takım seçim ekranının saf (Phaser'sız) mantığı: arketip etiketi, sınıf kartı yerleşimi, yeni seçilen sınıfın hücresi.
 * Test edilebilsin diye sahneden ayrıdır; sınıf listesi her zaman veriden (data/classes) gelir.
 */
export const TEAM_SIZE = 5;

/** Kısa arketip etiketi (kartta). Sınıfın `role` alanı varsa o; yoksa skill verisinden türetilir. */
export function archetypeOf(def: CombatantDef): string {
  if (def.role) return def.role;
  const skills = def.skills.map((id) => content.skills[id]).filter((s): s is NonNullable<typeof s> => !!s);
  const has = (type: string) => skills.some((s) => s.effects.some((e) => e.type === type));
  if (has('summon')) return 'Summoner';
  if (has('taunt') || has('guard')) return 'Tank';
  if (has('randomStatus')) return 'Wildcard';
  if (has('manaBurn')) return 'Mana Hunter';
  if (has('heal') || has('revive')) return 'Healer';
  const dmg = skills.filter((s) => s.effects.some((e) => e.type === 'damage'));
  const count = (f: (m: string) => boolean) => dmg.filter((s) => f(s.motion)).length;
  const melee = count((m) => m === 'melee' || m === 'whip');
  const ranged = count((m) => m === 'ranged');
  const cast = count((m) => m === 'cast' || m === 'sky' || m === 'ground');
  if (ranged > melee && ranged >= cast) return 'Marksman';
  if (cast > melee) return 'Spellcaster';
  return 'Fighter';
}

/** Menzil ipucu (tooltip): yakın dövüş / menzilli / büyücü. */
export function rangeOf(def: CombatantDef): string {
  const motion = content.skills[def.skills[0] ?? '']?.motion;
  return content.isMeleeClass(def.id) ? 'Melee' : motion === 'ranged' ? 'Ranged' : 'Caster';
}

export interface RosterLayout {
  cols: number;
  rows: number;
  /** Kart ölçeği (tasarım boyutuna göre). */
  scale: number;
  cardW: number;
  cardH: number;
  gap: number;
}

/**
 * `n` sınıf kartını verilen alana sığdırır: tek satır; çok kalabalıksa iki satır. Kart sayısı sabit değildir (yeni sınıf eklenince büyür).
 */
export function rosterLayout(n: number, availW: number, availH: number, designW: number, designH: number, gap = 12, maxScale = 1.12, minScale = 0.62): RosterLayout {
  const fit = (cols: number, rows: number) => {
    const cw = (availW - (cols - 1) * gap) / cols;
    const ch = (availH - (rows - 1) * gap) / rows;
    return Math.min(cw / designW, ch / designH, maxScale);
  };
  const count = Math.max(1, n);
  let cols = count;
  let rows = 1;
  let scale = fit(cols, rows);
  while (scale < minScale && rows < count) {
    rows++;
    cols = Math.ceil(count / rows);
    scale = fit(cols, rows);
  }
  return { cols, rows, scale, cardW: designW * scale, cardH: designH * scale, gap };
}

/**
 * Yeni seçilen sınıfın gideceği hücre. Yakın dövüşçüler yalnızca ön sıradan vurabilir: yeri olan ilk sırayı alırlar;
 * diğerleri dolu son sırayın arkasına (o sıra doluysa bir sonrakine) gider.
 */
export function freeCellFor(cells: string[], id: string): number {
  const { rows: ROWS, lanes: LANES } = content.GRID;
  const rowFull = (row: number) => cells.slice(row * LANES, row * LANES + LANES).filter(Boolean).length >= LANES;
  const rowHas = (row: number) => cells.slice(row * LANES, row * LANES + LANES).some(Boolean);
  let want = 0;
  if (content.isMeleeClass(id)) {
    while (want < ROWS - 1 && rowFull(want)) want++;
  } else {
    for (let r = 0; r < ROWS; r++) if (rowHas(r)) want = r;
    if (rowFull(want) && want < ROWS - 1) want++;
  }
  const order = Array.from({ length: ROWS }, (_, r) => r).sort((x, y) => Math.abs(x - want) - Math.abs(y - want) || x - y);
  const lanes = [0, LANES - 1, ...Array.from({ length: Math.max(0, LANES - 2) }, (_, i) => i + 1)];
  for (const row of order) for (const lane of lanes) if (!cells[row * LANES + lane]) return row * LANES + lane;
  return cells.findIndex((c) => !c);
}

export const teamCount = (cells: string[]): number => cells.filter(Boolean).length;
