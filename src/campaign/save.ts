import { CONFIG, MAPS } from './data';
import { findNode } from './graph';
import { activeHeroes, stopNumber } from './state';
import { emptyEquipment, migrateRollsX2, SLOT_IDS, type ItemInstance } from '../progression/items';
import type { CampaignMode, CampaignState, Difficulty, Hero } from './types';

/**
 * Sefer kaydı (campaign.md 5.2-5.3 + madde 256): tarayıcıda tek anahtar, sürümlü JSON. Depolama dışarıdan verilir (tarayıcıda localStorage, testte bellek).
 *  - 3 SEFER YUVASI (`rules.slots`): her yuvada bir sefer (mod + zorluk sabit) ve o seferin KENDİ kayıt listesi.
 *  - Normal: zafer sonrası otomatik + sefer başında + haritada elle; yuva başına en fazla `maxSaves.normal` (5), yeni gelince en eskisi silinir.
 *  - Ironman: yalnızca zafer sonrası; yuva başına tek kayıt (`maxSaves.ironman` = 1), her kayıt öncekinin üstüne yazar.
 *  - Continue: en son oynanan yuvanın en yeni kaydı.
 * Sürüm 1 (tek liste) okunurken yuvalara taşınır (en yeni sefer Slot 1). Bozuk/eksik kayıt oyunu çökertmez: okunamayan dosya boş sayılır
 * (`corrupt` bayrağı), geçersiz tek kayıtlar atlanır.
 */

export const SAVE_KEY = 'protomedi.campaign.v1';
/** Kayıt dosyası sürümü. 3 (madde 278): sefer durumu v2 (kahraman level/XP/ekipman, torba, altın); 2 ve 1 okunurken taşınır. */
/** 4: x2 stat ölçeği (Ömer 2026-10-10): 2 ve 3 okunurken item zarlarının ölçekli statları x2 (progression > migrateRollsX2). */
export const SAVE_VERSION = 4;
export const SLOT_COUNT = CONFIG.rules.slots;

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveKind = 'auto' | 'manual' | 'start';

export interface SaveSummary {
  map: string;
  stop: number;
  stops: number;
  node: string;
  region: string;
  classes: string[];
  hp: number[];
  victories: number;
}

export interface SaveEntry {
  id: string;
  kind: SaveKind;
  savedAt: string;
  mode: CampaignMode;
  campaignId: string;
  summary: SaveSummary;
  state: CampaignState;
}

/** Bir sefer yuvası: seferin kimliği, sabit modu ve zorluğu, kayıtları (eskiden yeniye). */
export interface SlotData {
  campaignId: string;
  mode: CampaignMode;
  difficulty: Difficulty;
  startedAt: string;
  lastPlayed: string;
  saves: SaveEntry[];
}

export interface SaveFile {
  version: number;
  counter: number;
  /** En son oynanan yuva (Continue). */
  lastSlot: number | null;
  slots: Array<SlotData | null>;
}

const emptySlots = (): Array<SlotData | null> => Array.from({ length: SLOT_COUNT }, () => null);
const empty = (): SaveFile => ({ version: SAVE_VERSION, counter: 0, lastSlot: null, slots: emptySlots() });
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const maxFor = (mode: CampaignMode) => (mode === 'ironman' ? CONFIG.rules.maxSaves.ironman : CONFIG.rules.maxSaves.normal);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const isItem = (it: unknown): it is ItemInstance =>
  !!it &&
  typeof it === 'object' &&
  typeof (it as ItemInstance).uid === 'string' &&
  typeof (it as ItemInstance).id === 'string' &&
  ((it as ItemInstance).rolls === undefined || (typeof (it as ItemInstance).rolls === 'object' && (it as ItemInstance).rolls !== null));

/**
 * Sefer durumu v1 -> v2 (madde 278): kahramana level 1, XP 0, boş 6 yuva; sefere boş torba, 0 altın. v2'de eksik/bozuk alanlar da aynı
 * varsayılanlarla tamamlanır (bozuk item girdisi atılır). Diğer her şey aynen kalır.
 */
function upgradeState(s: CampaignState): void {
  const raw = s as unknown as Record<string, unknown>;
  if (raw.version === 1) raw.version = 2;
  if (Array.isArray(s.roster))
    s.roster = s.roster.map((h) => {
      if (!h || typeof h !== 'object') return h;
      const eq = emptyEquipment();
      const old = (h as Partial<Hero>).equipment as Record<string, unknown> | undefined;
      if (old && typeof old === 'object') for (const k of SLOT_IDS) if (isItem(old[k])) eq[k] = old[k] as ItemInstance;
      return {
        ...h,
        level: Number.isInteger(h.level) && h.level >= 1 ? h.level : 1,
        xp: typeof h.xp === 'number' && h.xp >= 0 ? h.xp : 0,
        equipment: eq,
      };
    });
  s.inventory = Array.isArray(s.inventory) ? s.inventory.filter(isItem) : [];
  // Bekleyen teslim: bozuksa atılır (item'ler zaten torbada; yalnızca gösterilecek an kaybolur)
  const ho = s.pendingHandover as unknown as Record<string, unknown> | undefined;
  if (ho !== undefined && !(ho && typeof ho.node === 'string' && Array.isArray(ho.items) && ho.items.every((u) => typeof u === 'string') && Array.isArray(ho.from)))
    delete (s as { pendingHandover?: unknown }).pendingHandover;
  const ls = s.lootState as unknown as Record<string, unknown> | undefined;
  s.lootState = {
    rarePity: ls && typeof ls.rarePity === 'number' && ls.rarePity >= 0 ? ls.rarePity : 0,
    clears: ls && ls.clears && typeof ls.clears === 'object' ? Object.fromEntries(Object.entries(ls.clears as Record<string, unknown>).filter(([, v]) => typeof v === 'number')) as Record<string, number> : {},
    // Nadir düşüş sayacı (madde 297): eski kayıtta yok = 0
    rareMisses: ls && typeof ls.rareMisses === 'number' && ls.rareMisses >= 0 ? ls.rareMisses : 0,
  };
  const pl = s.pendingLoot as unknown as Record<string, unknown> | undefined;
  if (pl !== undefined && !(pl && typeof pl.node === 'string' && Array.isArray(pl.items) && typeof pl.gold === 'number' && (pl.left === undefined || (Array.isArray(pl.left) && pl.left.every((x) => typeof x === 'string')))))
    delete (s as { pendingLoot?: unknown }).pendingLoot;
  s.gold = typeof s.gold === 'number' && Number.isFinite(s.gold) && s.gold >= 0 ? s.gold : 0;
  // uid çakışmasın: sıradaki numara mevcut en büyük 'i<n>'den büyük
  const equipped = Array.isArray(s.roster) ? s.roster.flatMap((h) => (h?.equipment ? SLOT_IDS.map((k) => h.equipment[k]) : [])) : [];
  const used = [...s.inventory, ...equipped].filter(isItem).map((it) => Number(/^i(\d+)$/.exec(it.uid)?.[1] ?? 0));
  const next = Math.max(0, ...used) + 1;
  s.nextItemId = Number.isInteger(s.nextItemId) && s.nextItemId >= next ? s.nextItemId : next;
}

/** Eski kayıtlarda olmayan alanları tamamlar (zorluk: varsayılan, yuva; v1 -> v2: kahraman kaydı, torba, altın). Geçersizse null. */
export function normalizeState(x: unknown, slot?: number): CampaignState | null {
  if (!x || typeof x !== 'object') return null;
  const s = { ...(x as CampaignState) };
  const v = (s as unknown as { version: unknown }).version;
  if (v !== 1 && v !== 2) return null;
  upgradeState(s);
  if (!DIFFS.includes(s.difficulty)) s.difficulty = CONFIG.defaultDifficulty;
  if (slot !== undefined) s.slot = slot;
  else if (typeof s.slot !== 'number' || s.slot < 0 || s.slot >= SLOT_COUNT) s.slot = 0;
  return isValidState(s) ? s : null;
}

/** Kaydedilmiş bir durum oyunda kullanılabilir mi (harita, düğüm, kadro ve dizilim tutarlı)? */
export function isValidState(x: unknown): x is CampaignState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<CampaignState>;
  if (s.version !== 2 || typeof s.seed !== 'number' || typeof s.mapId !== 'string' || typeof s.at !== 'string') return false;
  if (s.mode !== 'normal' && s.mode !== 'ironman') return false;
  if (!DIFFS.includes(s.difficulty as Difficulty) || typeof s.slot !== 'number') return false;
  const map = MAPS[s.mapId];
  if (!map || !findNode(map, s.at)) return false;
  if (!Array.isArray(s.path) || !s.path.every((id) => typeof id === 'string' && findNode(map, id))) return false;
  if (!Array.isArray(s.done) || !Array.isArray(s.tipsSeen) || !Array.isArray(s.active) || !Array.isArray(s.roster)) return false;
  if (!s.roster.every((h) => h && typeof h.id === 'string' && typeof h.class === 'string' && typeof h.hpRatio === 'number')) return false;
  if (!s.roster.every((h) => typeof h.level === 'number' && typeof h.xp === 'number' && !!h.equipment && SLOT_IDS.every((k) => h.equipment[k] === null || isItem(h.equipment[k])))) return false;
  if (!Array.isArray(s.inventory) || !s.inventory.every(isItem) || typeof s.gold !== 'number' || typeof s.nextItemId !== 'number') return false;
  if (!s.lootState || typeof s.lootState.rarePity !== 'number' || typeof s.lootState.clears !== 'object') return false;
  if (!s.stats || typeof s.stats.victories !== 'number' || typeof s.nextHeroId !== 'number' || typeof s.campaignId !== 'string') return false;
  return true;
}

/** Bir kaydı doğrular/tamamlar (geçersizse null). */
function cleanEntry(e: unknown, slot: number): SaveEntry | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as SaveEntry;
  if (typeof x.id !== 'string') return null;
  const state = normalizeState(x.state, slot);
  if (!state) return null;
  return { ...x, state, mode: state.mode, campaignId: state.campaignId };
}

/** Sürüm 1 (tek liste) -> yuvalar: seferler en yeni kaydına göre sıralanır, en yeni sefer Slot 1; her yuvada en yeni kayıtlar (sınır kadar). */
function migrateV1(saves: unknown[], counter: number): { file: SaveFile; dropped: boolean } {
  const file = empty();
  file.counter = counter;
  const groups = new Map<string, SaveEntry[]>();
  /** Seferin eski listedeki en yeni kaydının sırası (eski liste eskiden yeniye). */
  const newest = new Map<string, number>();
  let dropped = false;
  saves.forEach((raw, i) => {
    const e = cleanEntry(raw, 0);
    if (!e) {
      dropped = true;
      return;
    }
    groups.set(e.campaignId, [...(groups.get(e.campaignId) ?? []), e]);
    newest.set(e.campaignId, i);
  });
  const order = [...groups.entries()].sort((a, b) => newest.get(b[0])! - newest.get(a[0])!);
  order.slice(0, SLOT_COUNT).forEach(([campaignId, list], slot) => {
    const mode = list[list.length - 1]!.mode;
    const kept = list.slice(-maxFor(mode)).map((e) => ({ ...e, state: { ...e.state, slot } }));
    file.slots[slot] = { campaignId, mode, difficulty: kept[0]!.state.difficulty, startedAt: kept[0]!.savedAt, lastPlayed: kept[kept.length - 1]!.savedAt, saves: kept };
  });
  if (order.length) file.lastSlot = 0;
  return { file, dropped: dropped || order.length > SLOT_COUNT };
}

/** Kayıt dosyasını okur. Hiç kayıt yoksa boş; okunamazsa boş + corrupt. Eski sürüm yuvalara taşınır (`migrated`). */
export function readSaves(kv: KV | null): { file: SaveFile; corrupt: boolean; migrated: boolean } {
  let raw: string | null = null;
  try {
    raw = kv?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { file: empty(), corrupt: true, migrated: false };
  }
  if (!raw) return { file: empty(), corrupt: false, migrated: false };
  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile> & { saves?: unknown[] };
    if (!parsed || typeof parsed !== 'object') return { file: empty(), corrupt: true, migrated: false };
    const counter = typeof parsed.counter === 'number' ? parsed.counter : 0;
    if (parsed.version === 1 && Array.isArray(parsed.saves)) {
      const m = migrateV1(parsed.saves, counter);
      return { file: m.file, corrupt: m.dropped, migrated: true };
    }
    // Sürüm 2 (yuvalar, sefer durumu v1) ile 3 aynı dosya düzeni; 2'nin durumları cleanEntry > normalizeState ile v2'ye taşınır
    if ((parsed.version !== SAVE_VERSION && parsed.version !== 2 && parsed.version !== 3) || !Array.isArray(parsed.slots)) return { file: empty(), corrupt: true, migrated: false };
    const fromV2 = parsed.version === 2;
    // x2 stat ölçeği (sürüm 4): eski kayıttaki item zarları (STR/DEX/INT/LUCK, zırh, hız) x2
    const scaled = parsed.version !== SAVE_VERSION;
    if (scaled) migrateRollsX2(parsed.slots);
    const file = empty();
    file.counter = counter;
    let corrupt = false;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sd = parsed.slots[i] as SlotData | null | undefined;
      if (!sd) continue;
      if (typeof sd !== 'object' || !Array.isArray(sd.saves) || typeof sd.campaignId !== 'string' || (sd.mode !== 'normal' && sd.mode !== 'ironman')) {
        corrupt = true;
        continue;
      }
      const saves = sd.saves.map((e) => cleanEntry(e, i)).filter((e): e is SaveEntry => !!e);
      if (saves.length !== sd.saves.length) corrupt = true;
      file.slots[i] = { ...sd, difficulty: DIFFS.includes(sd.difficulty) ? sd.difficulty : CONFIG.defaultDifficulty, saves };
    }
    file.lastSlot = typeof parsed.lastSlot === 'number' && file.slots[parsed.lastSlot] ? parsed.lastSlot : null;
    return { file, corrupt, migrated: fromV2 || scaled };
  } catch {
    return { file: empty(), corrupt: true, migrated: false };
  }
}

function write(kv: KV | null, file: SaveFile): boolean {
  try {
    kv?.setItem(SAVE_KEY, JSON.stringify(file));
    return !!kv;
  } catch {
    return false;
  }
}

/** Eski sürüm okunduysa yeni biçimde geri yazar (açılışta bir kez çağrılır). */
export function migrateSaves(kv: KV | null): boolean {
  const r = readSaves(kv);
  return r.migrated ? write(kv, r.file) : false;
}

export function summarize(s: CampaignState): SaveSummary {
  const map = MAPS[s.mapId]!;
  const n = findNode(map, s.at)!;
  const team = activeHeroes(s);
  return {
    map: map.title,
    stop: stopNumber(s),
    stops: map.stopsPerRun,
    node: n.name,
    region: map.regions.find((r) => r.id === n.region)?.title ?? '',
    classes: team.map((h) => h.class),
    hp: team.map((h) => h.hpRatio),
    victories: s.stats.victories,
  };
}

/** Elle kayıt yalnızca Normal modda. */
export const canSaveManually = (s: CampaignState): boolean => s.mode === 'normal';

/**
 * Yeni bir seferi yuvaya yerleştirir (yuvadaki eski sefer ve kayıtları silinir: çağıran onay almış olmalı).
 * Kayıt yazmaz (Normal'de ardından 'start' kaydı yazılır; Ironman ilk zafere kadar kayıtsız).
 */
export function claimSlot(kv: KV | null, s: CampaignState, now: string = new Date().toISOString()): boolean {
  const { file } = readSaves(kv);
  file.slots[s.slot] = { campaignId: s.campaignId, mode: s.mode, difficulty: s.difficulty, startedAt: now, lastPlayed: now, saves: [] };
  file.lastSlot = s.slot;
  return write(kv, file);
}

/**
 * Kayıt yazar (seferin yuvasına). Ironman yalnızca 'auto' (zafer sonrası) kabul eder ve tek kayıt tutar. Yuvada başka bir sefer varsa
 * yerine bu sefer geçer. Dönen `replaced`: silinen en eski kayıt(lar).
 */
export function writeSave(kv: KV | null, s: CampaignState, kind: SaveKind, now: string = new Date().toISOString()): { entry: SaveEntry | null; replaced: SaveEntry[]; ok: boolean } {
  if (s.mode === 'ironman' && kind !== 'auto') return { entry: null, replaced: [], ok: false };
  if (s.slot < 0 || s.slot >= SLOT_COUNT) return { entry: null, replaced: [], ok: false };
  const { file } = readSaves(kv);
  let slot = file.slots[s.slot];
  if (!slot || slot.campaignId !== s.campaignId) slot = { campaignId: s.campaignId, mode: s.mode, difficulty: s.difficulty, startedAt: now, lastPlayed: now, saves: [] };
  const entry: SaveEntry = { id: `s${++file.counter}`, kind, savedAt: now, mode: s.mode, campaignId: s.campaignId, summary: summarize(s), state: clone(s) };
  slot.saves.push(entry);
  slot.lastPlayed = now;
  const replaced: SaveEntry[] = [];
  while (slot.saves.length > maxFor(s.mode)) replaced.push(slot.saves.shift()!);
  file.slots[s.slot] = slot;
  file.lastSlot = s.slot;
  return { entry, replaced, ok: write(kv, file) };
}

/** Yuvanın kayıtları en yeni üstte. */
export const listSaves = (kv: KV | null, slot: number): SaveEntry[] => [...(readSaves(kv).file.slots[slot]?.saves ?? [])].reverse();

/** Yuva özetleri (Load Game / New Campaign ekranı): boşsa null. */
export interface SlotSummary {
  slot: number;
  campaignId: string;
  mode: CampaignMode;
  difficulty: Difficulty;
  lastPlayed: string;
  saveCount: number;
  latest: SaveEntry | null;
}

export function slotSummaries(kv: KV | null): Array<SlotSummary | null> {
  const { file } = readSaves(kv);
  return file.slots.map((sd, slot) =>
    sd ? { slot, campaignId: sd.campaignId, mode: sd.mode, difficulty: sd.difficulty, lastPlayed: sd.lastPlayed, saveCount: sd.saves.length, latest: sd.saves[sd.saves.length - 1] ?? null } : null,
  );
}

/** En yeni kayıt: yuva verilirse o yuvanın; verilmezse en son oynanan yuvanın (Continue). */
export function latestSave(kv: KV | null, slot?: number): SaveEntry | null {
  const { file } = readSaves(kv);
  const pick = (i: number | null | undefined) => (i === null || i === undefined ? null : (file.slots[i]?.saves.at(-1) ?? null));
  if (slot !== undefined) return pick(slot);
  const last = pick(file.lastSlot);
  if (last) return last;
  // yedek: kaydı olan yuvalardan en son oynanan
  const best = file.slots
    .map((sd, i) => ({ sd, i }))
    .filter((x) => x.sd?.saves.length)
    .sort((a, b) => (b.sd!.lastPlayed > a.sd!.lastPlayed ? 1 : -1))[0];
  return best ? pick(best.i) : null;
}

/** Bir yuvayı "son oynanan" yapar (yükleme / Continue). */
export function markPlayed(kv: KV | null, slot: number, now: string = new Date().toISOString()): void {
  const { file } = readSaves(kv);
  const sd = file.slots[slot];
  if (!sd) return;
  sd.lastPlayed = now;
  file.lastSlot = slot;
  write(kv, file);
}

export function deleteSave(kv: KV | null, slot: number, id: string): void {
  const { file } = readSaves(kv);
  const sd = file.slots[slot];
  if (!sd) return;
  sd.saves = sd.saves.filter((e) => e.id !== id);
  write(kv, file);
}

/** Yuvayı tamamen boşaltır (sefer ve tüm kayıtları). */
export function deleteSlot(kv: KV | null, slot: number): void {
  const { file } = readSaves(kv);
  file.slots[slot] = null;
  if (file.lastSlot === slot) file.lastSlot = null;
  write(kv, file);
}

export function wipeSaves(kv: KV | null): void {
  try {
    kv?.removeItem(SAVE_KEY);
  } catch {
    /* depolama kapalı */
  }
}

/** Yuvadaki kayıt sayısı. */
export const saveCount = (kv: KV | null, slot: number): number => readSaves(kv).file.slots[slot]?.saves.length ?? 0;

/** Yeni kayıt yuvadaki en eskiyi silecek mi (Normal: "Oldest save will be replaced")? */
export function willReplaceOldest(kv: KV | null, slot: number, mode: CampaignMode): boolean {
  return saveCount(kv, slot) >= maxFor(mode);
}

/** Bellekte depolama (testler ve localStorage kapalıyken). */
export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
