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

// --- Takım seçimi ekranı ("Twin Formations", Ömer 2026-10-09): saf yardımcılar ---

export type TeamSide = 'party' | 'enemies';
export type SideCells = Record<TeamSide, string[]>;

/** Bir class'tan her takımda kaç tane var (raf portresindeki mavi / kırmızı sayı rozetleri; 0 = rozet yok). */
export function classCounts(teams: SideCells, id: string): Record<TeamSide, number> {
  return { party: teams.party.filter((c) => c === id).length, enemies: teams.enemies.filter((c) => c === id).length };
}

/**
 * Alt bilgi satırında gösterilen class: fare bir class'ın (raf portresi ya da yuvadaki birim) üstüne gelince o; fare çekilince
 * (hovered = null) EN SON gösterilen kalır (eskiden hep listedeki ilk class'a dönüyordu).
 */
export const infoClassAfter = (current: string, hovered: string | null | undefined): string => hovered || current;

/**
 * Sürükle-bırak: bir yuvadaki birimi başka bir yuvaya taşır (aynı takımda yer değiştirme / takas; diğer takıma taşıma).
 * Hedef yuva doluysa iki birim yer değiştirir (takım sayıları değişmez); boşsa ve hedef takım doluysa taşınmaz ('full').
 * Yeni takım listeleri döner (girdiler değişmez).
 */
export function moveMember(teams: SideCells, sizes: SideSizes, from: { side: TeamSide; i: number }, to: { side: TeamSide; i: number }): { teams: SideCells; ok: boolean; reason?: 'full' | 'same' | 'empty' } {
  const out: SideCells = { party: [...teams.party], enemies: [...teams.enemies] };
  if (from.side === to.side && from.i === to.i) return { teams: out, ok: false, reason: 'same' };
  const unit = out[from.side][from.i];
  if (!unit) return { teams: out, ok: false, reason: 'empty' };
  const target = out[to.side][to.i] ?? '';
  if (from.side !== to.side && !target && teamCount(out[to.side]) >= sizes[to.side]) return { teams: out, ok: false, reason: 'full' };
  out[from.side][from.i] = target;
  out[to.side][to.i] = unit;
  return { teams: out, ok: true };
}

/** Birimi diğer takımın paneline (yuva seçmeden) bırakma: dizilim kuralıyla (freeCellFor) boş bir yuvaya geçer; takım doluysa 'full'. */
export function moveToSide(teams: SideCells, sizes: SideSizes, from: { side: TeamSide; i: number }, side: TeamSide): { teams: SideCells; ok: boolean; cell: number; reason?: 'full' | 'same' | 'empty' } {
  const out: SideCells = { party: [...teams.party], enemies: [...teams.enemies] };
  const unit = out[from.side][from.i];
  if (!unit) return { teams: out, ok: false, cell: -1, reason: 'empty' };
  if (from.side === side) return { teams: out, ok: false, cell: -1, reason: 'same' };
  if (teamCount(out[side]) >= sizes[side]) return { teams: out, ok: false, cell: -1, reason: 'full' };
  const cell = freeCellFor(out[side], unit);
  if (cell < 0) return { teams: out, ok: false, cell: -1, reason: 'full' };
  out[from.side][from.i] = '';
  out[side][cell] = unit;
  return { teams: out, ok: true, cell };
}

export interface StripLayout {
  /** Portre kenarı (dünya pikseli). */
  tile: number;
  /** Aynı gruptaki portreler arası boşluk. */
  gap: number;
  /** STR / DEX / INT / LUCK grupları arası boşluk. */
  groupGap: number;
  /** Rafın toplam genişliği. */
  width: number;
}

/**
 * Alttaki class rafının ölçüsü: taslaktaki 124 px portre, 12 px boşluk, 46 px grup aralığı; `availW`'a sığmazsa önce grup aralığı
 * daralır, sonra hepsi aynı oranda küçülür (en az `minTile`; dokunma hedefi). `groups` = her gruptaki class sayısı (veriden; yeni class rafı büyütür).
 */
export function stripLayout(groups: number[], availW: number, o: { tile?: number; gap?: number; groupGap?: number; minTile?: number } = {}): StripLayout {
  const base = { tile: o.tile ?? 124, gap: o.gap ?? 12, groupGap: o.groupGap ?? 46 };
  const minTile = o.minTile ?? 72;
  const n = groups.reduce((a, b) => a + b, 0);
  const inner = groups.reduce((a, g) => a + Math.max(0, g - 1), 0);
  const seps = Math.max(0, groups.filter((g) => g > 0).length - 1);
  const width = (tile: number, gap: number, groupGap: number) => n * tile + inner * gap + seps * groupGap;
  let groupGap = base.groupGap;
  if (width(base.tile, base.gap, groupGap) > availW) groupGap = Math.max(26, base.groupGap - (width(base.tile, base.gap, groupGap) - availW) / Math.max(1, seps));
  let k = Math.min(1, availW / width(base.tile, base.gap, groupGap));
  k = Math.max(minTile / base.tile, k);
  let tile = Math.floor(base.tile * k);
  const gap = Math.max(6, Math.floor(base.gap * k));
  const gg = Math.floor(groupGap * Math.max(k, 0.7));
  while (tile > minTile && width(tile, gap, gg) > availW) tile--; // yuvarlama taşırmasın
  return { tile, gap, groupGap: gg, width: width(tile, gap, gg) };
}
