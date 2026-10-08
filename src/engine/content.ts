// İçerik kayıt defteri: data/ altındaki JSON'ları motor tiplerine bağlar.
// Yeni class = data/classes/<id>.json + aşağıya bir satır (skills.json ve ai.json tek dosya, satır gerekmez).
import aiJson from '../../data/ai.json';
import formulasJson from '../../data/formulas.json';
import skillsJson from '../../data/skills.json';
import globalSkillsJson from '../../data/global-skills.json';
import firstBattle from '../../data/battles/first-battle.json';
import randomBattle from '../../data/battles/random-battle.json';
import aoeTester from '../../data/classes/aoe_tester.json';
import antimage from '../../data/classes/antimage.json';
import archer from '../../data/classes/archer.json';
import cutthroat from '../../data/classes/cutthroat.json';
import defender from '../../data/classes/defender.json';
import druid from '../../data/classes/druid.json';
import gambler from '../../data/classes/gambler.json';
import hexer from '../../data/classes/hexer.json';
import mage from '../../data/classes/mage.json';
import paladin from '../../data/classes/paladin.json';
import undead from '../../data/classes/undead.json';
import warrior from '../../data/classes/warrior.json';
import skeleton from '../../data/summons/skeleton.json';
import treant from '../../data/summons/treant.json';
import groundsJson from '../../data/grounds.json';
import statusesJson from '../../data/statuses.json';
import type { AiConfig } from './ai';
import type { BattleSetup } from './battle';
import { Rng } from './rng';
import { buildDef } from './stats';
import type { BattleMode, CombatantData, CombatantDef, Formulas, GlobalSkillDef, GroundDef, SkillDef, StatusDef, UnitSetup } from './types';

export interface BattleDef {
  id: string;
  background: string;
  slots: { party: number; enemy: number };
  /** Sabit takımlar (class id'leri). */
  party?: string[];
  enemies?: string[];
  /** Rastgele takımlar: her iki taraf da havuzdan (seed'e göre) `size` farklı class alır. */
  random?: { pool: string[]; size: number };
}

export const formulas: Formulas = formulasJson as unknown as Formulas;

const classData: Record<string, CombatantData> = {
  warrior,
  paladin,
  mage,
  undead,
  archer,
  druid,
  defender,
  antimage,
  gambler,
  cutthroat,
  hexer,
  aoe_tester: aoeTester,
} as unknown as Record<string, CombatantData>;

/** Oynanabilir tüm class'lar: iki taraf da aynı havuzdan çeker, görseli sınıfa bağlıdır. */
export const classes: Record<string, CombatantDef> = Object.fromEntries(
  Object.entries(classData).map(([id, data]) => [id, buildDef(data, formulas)]),
);

/**
 * Rastgele takım havuzuna ve denge simülasyonuna giren class id'leri: `testOnly` olmayanlar. Test class'ları (ör. aoe_tester) `classes`ta ve
 * `selectableClasses`ta durur (takım seçimi, debug, wiki, galeri) ama rastgele takımlara ve sim'e girmez.
 */
export const randomPool: string[] = Object.keys(classes).filter((id) => !classes[id]!.testOnly);
/** Oyuncunun takım seçiminde seçebileceği class id'leri (test class'ları dahil; `hidden` olanlar hariç). */
export const selectableClasses: string[] = Object.keys(classes).filter((id) => !classes[id]!.hidden);

/** Class olmayan, yalnızca skill ile çağrılan birimler. */
export const summons: Record<string, CombatantDef> = {
  treant: buildDef(treant as unknown as CombatantData, formulas),
  skeleton: buildDef(skeleton as unknown as CombatantData, formulas),
};

// "_not" gibi açıklama alanlarını ayıkla; geriye yalnızca skill tanımları kalır.
export const skills = Object.fromEntries(
  Object.entries(skillsJson as unknown as Record<string, unknown>).filter(([key]) => !key.startsWith('_')),
) as unknown as Record<string, SkillDef>;

const stripNotes = <T>(o: unknown): Record<string, T> =>
  Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([key]) => !key.startsWith('_'))) as Record<string, T>;

/** Buff/debuff tanımları (data/statuses.json). */
export const statuses = stripNotes<StatusDef>(statusesJson);
/** Global skill'ler (data/global-skills.json): rest, skip_turn, move_tile. Class'ların 4 skill'inden ve `skills` tablosundan AYRIDIR. */
export const globalSkills = stripNotes<GlobalSkillDef>(globalSkillsJson);
/** Yerde kalan etki tanımları (data/grounds.json). */
export const grounds = stripNotes<GroundDef>(groundsJson);

export const aiConfig = aiJson as unknown as AiConfig;

export const battles: Record<string, BattleDef> = {
  'first-battle': firstBattle,
  'random-battle': randomBattle,
};

/** Oyunun varsayılan savaşı: her seed'de farklı takımlar. */
export const DEFAULT_BATTLE = 'random-battle';

export interface Teams {
  party: string[];
  enemies: string[];
  /** Opsiyonel birim kurulumları (güçlendirme, özel ad, başlangıç canı...); bkz. TeamUnits. Yoksa savaş birebir eskisi gibidir. */
  units?: TeamUnits;
}

/**
 * Birim kurulumları (UnitSetup) taraf başına, ANAHTAR = verilen listedeki konum: `arrange` false iken (hücre listesi; BattleScene ve sefer böyle
 * kurar) hücre/yuva numarası, `arrange` true iken sınıf listesindeki dizin (otomatik dizilimden önceki sıra). Dizi ya da { [anahtar]: UnitSetup } olabilir.
 * Yalnızca o taraf için liste VERİLMİŞSE uygulanır (seed'le çekilen tarafa uygulanmaz).
 */
export interface TeamUnits {
  party?: Record<number, UnitSetup | undefined> | (UnitSetup | undefined)[];
  enemies?: Record<number, UnitSetup | undefined> | (UnitSetup | undefined)[];
}

/**
 * Takım boyutu seçenekleri: her taraf 1..CELL_COUNT (formasyon yuva sayısı = rows x lanes = 12) birim alabilir; 4-4 varsayılandır
 * (data/battles/random-battle.json > random.size). partySize/enemySize yalnızca takım RASTGELE çekilirken kullanılır
 * (sınıf listesi verilmişse listenin uzunluğu geçerlidir). Boyut havuzdaki sınıf sayısını aşarsa sınıflar tekrar eder (ilk tur hep farklı).
 */
export interface TeamSizes {
  partySize?: number;
  enemySize?: number;
}

/** Geçerli takım boyutu (1..CELL_COUNT, tam sayı). */
export function clampTeamSize(n: number): number {
  return Math.max(1, Math.min(CELL_COUNT, Math.floor(Number.isFinite(n) ? n : 1)));
}

function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const v = table[id];
  if (!v) throw new Error(`${what} bulunamadı: ${id}`);
  return v;
}

/**
 * Takım dizilimi: dayanıklı / yakın dövüş class'lar önde, kırılgan / menzilli olanlar arkada başlar
 * (class'ın `frontPriority` değeri küçük = önde). Eşit önceliklerde verilen sıra korunur.
 * Slot 0 en öndedir; yakın dövüşün menzili ve hedeflenme sırası buna göre belirlenir.
 */
export function arrangeTeam(ids: string[]): string[] {
  return arrangeOrder(ids).map((i) => ids[i]!);
}

/** arrangeTeam'in sırası, girdi dizinleri olarak (birim kurulumlarını dizilmiş listeye taşımak için). */
function arrangeOrder(ids: string[]): number[] {
  return ids
    .map((id, i) => ({ id, i, melee: isMeleeClass(id) ? 0 : 1, p: (classes[id] ?? summons[id])?.frontPriority ?? 99 }))
    .sort((a, b) => a.melee - b.melee || a.p - b.p || a.i - b.i)
    .map((x) => x.i);
}

/**
 * Fisher-Yates karıştırma (seed'li) ve ilk `size` eleman. size havuzu aşarsa yeni bir karıştırma turuyla tamamlanır
 * (her turda sınıflar farklıdır; yinelenme ancak havuz bittikten sonra). size <= havuz için sonuç eskisiyle birebir aynıdır.
 */
function draw(pool: string[], size: number, rng: Rng): string[] {
  const out: string[] = [];
  if (pool.length === 0) return out;
  while (out.length < size) {
    const items = [...pool];
    for (let i = items.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    out.push(...items.slice(0, size - out.length));
  }
  return out;
}

/** Verilen class listesinden rastgele (seed'li) farklı `size` class seçer ve dizer. Takım seçim ekranının "Randomize" düğmesi. */
export function randomTeam(seed: number, size = 4, pool: string[] = randomPool): string[] {
  return arrangeTeam(draw(pool, clampTeamSize(size), new Rng((seed ^ 0x51ed270b) >>> 0)));
}

/**
 * Bir savaşın takımları. Sabit savaşta listeler aynen döner; rastgele savaşta seed'e göre,
 * her taraf kendi içinde farklı class'lardan oluşur (iki tarafta aynı class olabilir) ve dizilir.
 * Savaşın kendi rastgeleliğinden bağımsızdır (ayrı bir RNG akışı kullanır).
 */
export function rollTeams(battleId: string, seed: number, sizes: TeamSizes = {}): Teams {
  const def = lookup(battles, battleId, 'Savaş');
  if (!def.random) return { party: [...(def.party ?? [])], enemies: [...(def.enemies ?? [])] };
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const partySize = clampTeamSize(sizes.partySize ?? def.random.size);
  const enemySize = clampTeamSize(sizes.enemySize ?? def.random.size);
  return {
    party: arrangeTeam(draw(def.random.pool, partySize, rng)),
    enemies: arrangeTeam(draw(def.random.pool, enemySize, rng)),
  };
}

/** Dizilim ızgarası: `rows` sıra x `lanes` şerit. Yuva numarası = sıra * lanes + şerit (sıra 0 = en önde). */
export const GRID = { rows: formulas.formation.rows, lanes: formulas.formation.lanes };
export const CELL_COUNT = GRID.rows * GRID.lanes;

/** Yakın dövüş sınıfı mı (ilk skill'i melee)? Melee yalnızca ön sıradan vurabildiği için dizilimde önce onlar yerleşir. */
export function isMeleeClass(id: string): boolean {
  const def = classes[id] ?? summons[id];
  return skills[def?.skills[0] ?? '']?.motion === 'melee';
}

/**
 * Dizilim planı: her birimin hücresini (girdiyle aynı sırada) verir. Birimler önce öncelik sırasına (frontPriority) dizilir,
 * sonra sıra sıra doldurulur. Kural: bir yakın dövüşçü, ön sıralar DOLU (3 karakter) olmadıkça arka sırada olmaz; bu yüzden bir sıranın
 * boyutu en az geride kalan melee sayısı (en çok 3) kadardır. `pickSize(min, max)` sıra boyutunu, `pickLanes(k)` şeritleri seçer.
 */
function planCells(ids: string[], pickSize: (min: number, max: number) => number, pickLanes: (k: number) => number[]): number[] {
  const order = ids
    .map((id, i) => ({ id, i, melee: isMeleeClass(id) ? 0 : 1, p: (classes[id] ?? summons[id])?.frontPriority ?? 99 }))
    .sort((x, y) => x.melee - y.melee || x.p - y.p || x.i - y.i);
  const slots: number[] = Array.from({ length: ids.length }, () => -1);
  let at = 0;
  for (let row = 0; row < GRID.rows && at < order.length; row++) {
    const rest = order.slice(at);
    const meleeLeft = rest.filter((u) => isMeleeClass(u.id)).length;
    const max = Math.min(GRID.lanes, rest.length);
    // en az: kalan melee sayısı; ayrıca kalan birimler kalan sıralara sığmalı (hiçbir birim dışarıda kalmaz)
    const mustFit = rest.length - GRID.lanes * (GRID.rows - row - 1);
    const min = Math.max(1, Math.min(meleeLeft, max), Math.min(mustFit, max));
    const k = Math.max(min, Math.min(max, pickSize(min, max)));
    const lanes = pickLanes(k);
    for (let j = 0; j < k; j++) slots[rest[j]!.i] = row * GRID.lanes + lanes[j]!;
    at += k;
  }
  return slots;
}

/** Sıra boyutunun varsayılanı: ikişer (3 yakın dövüşçü kalmışsa üç). Şeritler: 1 -> [0], 2 -> [0, 2], 3 -> [0, 1, 2]. */
const defaultLanes = (k: number): number[] => (k === 1 ? [0] : k === 2 ? [0, GRID.lanes - 1] : Array.from({ length: k }, (_, l) => l));

/** Girdi sırasında her birimin otomatik dizilim hücresi (melee kuralına uygun). */
export function defaultSlots(ids: string[]): number[] {
  return planCells(ids, (min, max) => Math.min(max, Math.max(min, 2)), defaultLanes);
}

/**
 * Otomatik dizilim: dönen liste hücre listesidir (dizin = yuva, '' = boş). Yakın dövüşçüler ön sıraları doldurur
 * (bkz. planCells); varsayılan sıra boyutu 2, ön sıradaki 3 melee varsa 3.
 */
export function defaultCells(ids: string[]): string[] {
  const cells: string[] = Array.from({ length: CELL_COUNT }, () => '');
  defaultSlots(ids).forEach((slot, i) => {
    if (slot >= 0) cells[slot] = ids[i]!;
  });
  return cells;
}

/** Rastgele dizilimin her birimin hücresi (girdiyle aynı sırada): sıra boyutları ve şeritler seed'li rastgele, melee kuralı korunur. */
export function randomSlots(ids: string[], seed: number): number[] {
  const rng = new Rng((seed ^ 0x2545f491) >>> 0);
  const pickLanes = (k: number) => {
    const lanes = Array.from({ length: GRID.lanes }, (_, l) => l);
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
    }
    return lanes.slice(0, k);
  };
  return planCells(ids, (min, max) => rng.int(min, max), pickLanes);
}

/**
 * Rastgele dizilim: karakterler 3 şeritten rastgele seçilir (ortadaki şerit de kullanılır). Yakın dövüşçüler ön sıraları doldurur:
 * bir melee, önündeki sıra dolmadıkça (3 karakter) arka sırada olmaz. Dönen liste hücre listesidir.
 */
export function randomCells(ids: string[], seed: number): string[] {
  const cells: string[] = Array.from({ length: CELL_COUNT }, () => '');
  randomSlots(ids, seed).forEach((slot, i) => {
    if (slot >= 0) cells[slot] = ids[i]!;
  });
  return cells;
}

/**
 * `teams` verilirse onlar kullanılır (taraf başına 1..12 birim, uzunluk serbest; yalnızca bir taraf verilirse diğeri seed'e göre çekilir);
 * verilmezse seed'e göre belirlenir (`partySize`/`enemySize` ile boyut seçilir, varsayılan 4-4). `arrange` true: liste sınıf id'leridir (otomatik dizilir);
 * false: liste hücre listesidir (dizin = yuva, '' = boş).
 */
export function battleSetup(battleId: string, seed: number, mode: BattleMode = 'turns', teams?: Partial<Teams> & TeamSizes, arrange = true): BattleSetup {
  const def = lookup(battles, battleId, 'Savaş');
  // Her taraf için {birim listesi, her birimin yuvası}. Birim sırası (uid'ler) girdi sırasıdır.
  // keys: her birimin verilen listedeki konumu (hücre listesinde yuva, sınıf listesinde dizin): birim kurulumları (teams.units) bununla eşlenir
  type Built = { ids: string[]; slots: number[]; keys?: number[] };
  const layout = (ids: string[], slots: number[], keys?: number[]): Built => ({
    ids: ids.filter((_, i) => slots[i]! >= 0),
    slots: slots.filter((s) => s >= 0),
    ...(keys ? { keys: keys.filter((_, i) => slots[i]! >= 0) } : {}),
  });
  const fromCells = (cells: string[]): Built => {
    const ids: string[] = [];
    const slots: number[] = [];
    cells.forEach((id, slot) => {
      if (id) {
        ids.push(id);
        slots.push(slot);
      }
    });
    return { ids, slots, keys: [...slots] };
  };
  const random = !!def.random;
  const rolled = teams?.party && teams.enemies ? undefined : rollTeams(battleId, seed, { partySize: teams?.partySize, enemySize: teams?.enemySize });
  const build = (given: string[] | undefined, rolledIds: string[] | undefined, mix: number): Built => {
    if (given) {
      if (!arrange) return fromCells(given); // hücre listesi (oyuncunun seçim ekranında elle dizdiği; dizin = yuva, '' = boş)
      // sınıf listesi: önce önceliğe göre sıralanır, sonra otomatik dizilir
      const list = given.slice(0, CELL_COUNT);
      const order = arrangeOrder(list);
      const a = order.map((i) => list[i]!);
      return layout(a, defaultSlots(a), order);
    }
    const ids = rolledIds ?? [];
    return layout(ids, random ? randomSlots(ids, seed ^ mix) : defaultSlots(ids));
  };
  const party = build(teams?.party, rolled?.party, 0x1111);
  const enemies = build(teams?.enemies, rolled?.enemies, 0x2222);
  // Sınıf ya da (hazır çağrı olarak) data/summons birimi
  const unitDef = (id: string): CombatantDef => classes[id] ?? lookup(summons, id, 'Class');
  // Birim kurulumları: verilen kurulum + çağrı id'leri için summoned bayrağı. Hiçbir birimde kurulum yoksa alan hiç yazılmaz (eski davranış).
  const unitsFor = (b: Built, given: TeamUnits['party']): (UnitSetup | undefined)[] | undefined => {
    const out = b.ids.map((id, i) => {
      const key = b.keys?.[i];
      const u = key !== undefined && given ? (given as Record<number, UnitSetup | undefined>)[key] : undefined;
      if (!classes[id] && summons[id]) return { summoned: true, ...(u ?? {}) };
      return u;
    });
    return out.some((u) => u !== undefined) ? out : undefined;
  };
  const partyUnits = unitsFor(party, teams?.units?.party);
  const enemyUnits = unitsFor(enemies, teams?.units?.enemies);
  return {
    seed,
    mode,
    party: party.ids.map(unitDef),
    enemies: enemies.ids.map(unitDef),
    partySlots: party.slots,
    enemySlots: enemies.slots,
    ...(partyUnits ? { partyUnits } : {}),
    ...(enemyUnits ? { enemyUnits } : {}),
    skills,
    globalSkills,
    statuses,
    grounds,
    formulas,
    units: { ...classes, ...summons },
    maxSlots: def.slots,
  };
}
