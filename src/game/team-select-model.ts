import { content } from '../engine';
import type { CombatantDef } from '../engine';
import { groupByPrimary, sortByPrimary } from './class-order';

/**
 * Takım seçim ekranının saf (Phaser'sız) mantığı: arketip etiketi, sınıf kartı yerleşimi, yeni seçilen sınıfın hücresi.
 * Test edilebilsin diye sahneden ayrıdır; sınıf listesi her zaman veriden (data/classes) gelir.
 */
/** Varsayılan takım boyutu (random-battle.json > random.size ile aynı); ekranda her taraf 1..CELL_COUNT arası ayarlanabilir. */
export const TEAM_SIZE = 4;

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

/** Test class'ı mı (ör. Geometer)? Kartta 'TEST' rozeti taşır, rastgele takımlara girmez ama elle eklenebilir. */
export const isTestClass = (def: CombatantDef): boolean => !!def.testOnly;

/**
 * Sınıf kartlarının sırası: primary statına göre STR - DEX - INT - LUCK grupları (grup içi ada göre), primary'siz olanlar
 * ardından, test class'ları SONDA. Sıra veriden (`class.primary`) türer; yeni class kendi grubuna girer (`class-order.ts`).
 */
export function rosterIds(): string[] {
  return sortByPrimary(content.selectableClasses.map((id) => content.classes[id]!)).map((c) => c.id);
}

/** Raf grupları (ayraç ve renk için): her grup ardışık kartlardır. */
export const rosterGroups = () => groupByPrimary(content.selectableClasses.map((id) => content.classes[id]!));

/** Randomize / `?seed=` akışının havuzu: test class'ları HARİÇ (content.randomPool). */
export const randomizePool = (): string[] => content.randomPool;

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
  // Smallest row count whose scale reaches minScale; if none does, the row count with the largest scale (cards never collapse)
  let rows = 1;
  let cols = count;
  let scale = fit(cols, rows);
  let best = { rows, cols, scale };
  while (scale < minScale && rows < count) {
    rows++;
    cols = Math.ceil(count / rows);
    scale = fit(cols, rows);
    if (scale > best.scale) best = { rows, cols, scale };
  }
  if (scale < minScale) ({ rows, cols, scale } = best);
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

// --- Takım boyutu (her taraf 1..12; oyuncu ve düşman ayrı) ---

export interface SideSizes {
  party: number;
  enemies: number;
}

/** Geçerli takım boyutu (1..CELL_COUNT, tam sayı); motorun `clampTeamSize` kuralı. */
export const clampSize = (n: number): number => content.clampTeamSize(n);

/** Varsayılan boyut: savaş verisindeki random.size (yoksa 4). */
export function defaultTeamSize(): number {
  const size = content.battles[content.DEFAULT_BATTLE]?.random?.size;
  return clampSize(typeof size === 'number' ? size : TEAM_SIZE);
}

/** Adres parametresi ("3", "12", "99", "abc") -> boyut; geçersizse `fallback`; aralık dışı kısılır. */
export function parseSizeParam(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clampSize(n) : fallback;
}

/** Adresteki `?party=3&enemies=8` boyutları (yoksa varsayılan 4-4). */
export function sizesFromSearch(search: string, fallback: number = defaultTeamSize()): SideSizes {
  const q = new URLSearchParams(search);
  return { party: parseSizeParam(q.get('party'), fallback), enemies: parseSizeParam(q.get('enemies'), fallback) };
}

/** Seçicinin + / - adımı (sınırlarda durur). */
export const stepSize = (current: number, delta: number): number => clampSize(current + delta);

/** Durum yazısı: "You: 5  Enemy: 5". */
export const sizeSummary = (s: SideSizes): string => `You: ${s.party}  Enemy: ${s.enemies}`;

/** Takımda eksik kalan kişi sayısı (fazlaysa 0). */
export const missingCount = (cells: string[], size: number): number => Math.max(0, size - teamCount(cells));

/** Takım seçilen boyuta tam eşit mi? (START için her iki taraf da dolu olmalı.) */
export const isTeamFull = (cells: string[], size: number): boolean => size >= 1 && teamCount(cells) === size;

/** START uyarısı: "Player team needs 2 more classes   ·   Enemy team needs 1 more class" (hepsi doluysa boş). */
export function missingMessage(teams: { party: string[]; enemies: string[] }, sizes: SideSizes): string {
  const parts: string[] = [];
  for (const [side, name] of [['party', 'Player'], ['enemies', 'Enemy']] as const) {
    const n = missingCount(teams[side], sizes[side]);
    if (n > 0) parts.push(`${name} team needs ${n} more ${n === 1 ? 'class' : 'classes'}`);
  }
  return parts.join('   ·   ');
}

/** Boyut küçülünce fazla birimleri sondan (en yüksek hücre numarasından) çıkarır; yeni liste döner. */
export function trimToSize(cells: string[], size: number): string[] {
  const out = [...cells];
  let n = teamCount(out);
  for (let i = out.length - 1; i >= 0 && n > size; i--) {
    if (out[i]) {
      out[i] = '';
      n--;
    }
  }
  return out;
}

/** Üst bardaki doluluk elmasları: n elmas `maxWidth` içine sığacak şekilde adım (en çok `maxStep`) ve ilk elmasın kaydırması. */
export function pipLayout(n: number, maxWidth: number, maxStep = 30): { step: number; width: number } {
  const count = Math.max(1, n);
  const step = Math.min(maxStep, count > 1 ? maxWidth / count : maxStep);
  return { step, width: step * count };
}
