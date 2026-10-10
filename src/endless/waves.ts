// Endless dalga üretici (saf, seed'li; Math.random yok). Dalga -> motorun mevcut savaş girişi (hücre listeleri + yuva başına UnitSetup + seed).
import { CELL_COUNT, bosses, classes, randomCells, randomPool, summons } from '../engine/content';
import { Rng } from '../engine/rng';
import type { UnitModifiers, UnitSetup } from '../engine/types';
import { loadoutSetup } from '../progression/loadout';
import { ITEMS } from '../progression/items';
import { ENDLESS, encounter, type EndlessConfig, type EndlessRun, type WaveKind } from './data';
import { withRelics } from './relics';
import { heroSlots } from './formation';
import { carrySetup, heroRef, summonRef } from './carry';

/** FNV-1a + karıştırma: parçalardan seed (sefer seed.ts ile aynı yöntem; endless kendi kopyasını taşır, sefer modülüne bağlanmaz). */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = `${p}|`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 1_000_000_000;
}

export const rngFor = (seed: number, ...parts: Array<string | number>): Rng => new Rng(hashSeed(seed, ...parts));

/** Dalga türü: her bossEvery'de boss, her eliteEvery'de elit, diğerleri normal. */
export function waveKind(wave: number, cfg: EndlessConfig = ENDLESS): WaveKind {
  if (cfg.bossEvery > 0 && wave % cfg.bossEvery === 0) return 'boss';
  if (cfg.eliteEvery > 0 && wave % cfg.eliteEvery === 0) return 'elite';
  return 'normal';
}

/** Normal dalganın düşman sayısı. */
export function enemyCount(wave: number, cfg: EndlessConfig = ENDLESS): number {
  let n = cfg.enemyCount[0]?.count ?? 4;
  for (const r of cfg.enemyCount) if (wave >= r.fromWave) n = r.count;
  return Math.max(1, Math.min(CELL_COUNT, n));
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Dalganın düşman güçlenmesi (1. dalga: yok). */
export function waveMods(wave: number, cfg: EndlessConfig = ENDLESS): UnitModifiers | undefined {
  const k = Math.max(0, wave - 1);
  if (!k) return undefined;
  return { hpMult: r3(1 + cfg.scaling.hpPerWave * k), statMult: r3(1 + cfg.scaling.statPerWave * k), powerMult: r3(1 + cfg.scaling.powerPerWave * k) };
}

/** İki güçlendirmenin birleşimi: çarpanlar çarpılır, kalan alanlar (spriteScale, actionsPerTurn, ekler) karşılaşmadan gelir. */
export function combineMods(base: UnitModifiers | undefined, extra: UnitModifiers | undefined): UnitModifiers | undefined {
  if (!extra) return base ? { ...base } : undefined;
  const out: UnitModifiers = { ...(base ?? {}) };
  for (const k of ['hpMult', 'statMult', 'powerMult'] as const) if (extra[k] !== undefined) out[k] = r3((out[k] ?? 1) * extra[k]!);
  return out;
}

/** Özel dalganın karşılaşması: elit koşu seed'ine göre seçilir, boss'lar sırayla döner (10: ilk boss, 20: ikinci ...). */
export function specialEncounter(seed: number, wave: number, cfg: EndlessConfig = ENDLESS): string | null {
  const kind = waveKind(wave, cfg);
  const pick = (list: string[], i: number) => {
    const ok = list.filter((id) => encounter(id));
    return ok.length ? ok[((i % ok.length) + ok.length) % ok.length]! : null;
  };
  if (kind === 'boss') return pick(cfg.bosses, wave / cfg.bossEvery - 1);
  if (kind === 'elite') return pick(cfg.elites, hashSeed(seed, wave, 'elite'));
  return null;
}

export interface WavePlan {
  wave: number;
  kind: WaveKind;
  /** Ekranda gösterilen ad ('Wave 7', 'The Bandit Chief'...). */
  name: string;
  seed: number;
  /** Hücre listeleri (dizin = yuva, '' = boş): BattleScene'in `teams` girişi. */
  party: string[];
  enemies: string[];
  /** Kahraman id'leri motor sırasıyla (party-0, party-1 ...); taşınan çağrının hücresi ''. */
  heroOrder: string[];
  units: { party: Record<number, UnitSetup>; enemies: Record<number, UnitSetup> };
  difficulty: EndlessConfig['difficulty'];
  /** Karşılaşmanın kendi arka planı (boss); yoksa ekran havuzdan seçer. */
  background?: string;
  /** Düşman önizlemesi (ön sıradan arkaya; özel ad > class adı). */
  enemyNames: string[];
}

const unitName = (cls: string, name?: string) => name ?? classes[cls]?.name ?? bosses[cls]?.name ?? cls;

/** Savaşın seed'i: koşu seed'i + dalga (deneme yok: yenilgide koşu biter; geri çekilmek aynı savaşı verir). */
export const waveSeed = (seed: number, wave: number): number => hashSeed(seed, wave, 'battle');

/** Dalganın savaş planı (saf; aynı koşu durumu = aynı plan). */
export function wavePlan(run: EndlessRun, cfg: EndlessConfig = ENDLESS): WavePlan {
  const wave = run.wave;
  const kind = waveKind(wave, cfg);
  const seed = waveSeed(run.seed, wave);
  // Oyuncu: koşunun dizilimi (koşu başında seçilen, sonra her zaferde savaş sonundaki hücreler; eski kayıt = otomatik); motor hücreleri yuva sırasıyla okur
  const party = Array.from({ length: CELL_COUNT }, () => '');
  const partyUnits: Record<number, UnitSetup> = {};
  const live = run.heroes.filter((h) => classes[h.class]);
  const slots = heroSlots(live);
  const placed: Array<{ id: string; slot: number }> = [];
  // Sürekli akış (madde 300): taşınan çağrılar hücrelerine (kahraman hücresiyle çakışan / bilinmeyen çağrı düşer); motor uid'i = hücre sırası
  const heroCells = new Set(live.map((_, i) => slots[i]!));
  const summonCells = new Map<number, number>();
  (run.summons ?? []).forEach((x, k) => {
    if (summons[x.unit] && x.slot >= 0 && x.slot < CELL_COUNT && !heroCells.has(x.slot) && !summonCells.has(x.slot)) summonCells.set(x.slot, k);
  });
  const occupied = [...new Set([...heroCells, ...summonCells.keys()])].filter((c) => c >= 0).sort((a, b) => a - b);
  const uidAt = new Map(occupied.map((c, i) => [c, `party-${i}`]));
  const refUid = new Map<string, string>();
  live.forEach((h, i) => slots[i]! >= 0 && refUid.set(heroRef(h.id), uidAt.get(slots[i]!)!));
  for (const [cell, k] of summonCells) refUid.set(summonRef(k), uidAt.get(cell)!);
  const uidOf = (ref: string) => refUid.get(ref);
  // Dalga arası cooldown: 'carry' (varsayılan) kaldığı yerden, 'clear' sıfır, 'initial' her dalga savaş başı gibi; ilk dalga hep savaş başı
  const cdMode = cfg.carry.cooldowns ?? 'carry';
  const skipInitial = wave > 1 && cdMode !== 'initial';
  const keepCd = { cooldowns: cdMode === 'carry' };
  const corpses = (cfg.carry.fallen ?? 'corpse') === 'corpse';
  live.forEach((h, i) => {
    const slot = slots[i]!;
    if (slot < 0) return;
    party[slot] = h.class;
    placed.push({ id: h.id, slot });
    // Güç katmanı (item; ileride level/ağaç) + can taşıma
    // Güç: item (loadout) + kalıntılar (koşu boyu; kalkan / ilk eylem / düşünce şifa kancaları + kritik / zırh ekleri)
    const setup: UnitSetup = withRelics({ ...loadoutSetup(h, { effects: ITEMS.effectRules.endless }) }, run.relics, cfg); // Epic etkileri: madde 292 (c)
    // Hero's Feast (boss ödülü): kalan dalgalarda maks can çarpanı (item güçlendirmesiyle birleşir)
    if (run.blessing && run.blessing.waves > 0 && run.blessing.hpMult !== 1)
      setup.modifiers = { ...(setup.modifiers ?? {}), hpMult: r3((setup.modifiers?.hpMult ?? 1) * run.blessing.hpMult) };
    if (h.hpRatio < 1) setup.startHpRatio = Math.max(0, h.hpRatio);
    // Taşınan durum (MP oranı, buff'lar, Rage, kalkan, cooldown'lar) + dalga arası cooldown kuralı
    Object.assign(setup, carrySetup(h.carry, uidAt.get(slot)!, uidOf, keepCd));
    if (skipInitial) setup.skipInitialCooldown = true;
    // Önceki dalgada düşen kahraman bu savaşa CESET olarak girer (hücresinde; Resurrection / Revive kartı kaldırır)
    if (corpses && h.hpRatio <= 0) {
      setup.startDead = h.carry?.corpse ?? 'revivable';
      delete setup.startHpRatio;
    }
    if (Object.keys(setup).length) partyUnits[slot] = setup;
  });
  for (const [cell, k] of summonCells) {
    const x = run.summons![k]!;
    party[cell] = x.unit;
    const owner = x.owner ? uidOf(heroRef(x.owner)) : undefined;
    partyUnits[cell] = {
      ...carrySetup(x, uidAt.get(cell)!, uidOf, keepCd),
      startHp: x.hp,
      ...(owner ? { owner } : {}),
      ...(x.lifespan !== undefined ? { lifespan: x.lifespan } : {}),
      ...(x.empowered !== undefined ? { empowered: x.empowered } : {}),
    };
  }
  // Motor sırası (dizin = 'party-i'): kahraman id'si, çağrı hücresi ''
  const heroAt = new Map(placed.map((p) => [p.slot, p.id]));
  const heroOrder = occupied.map((c) => heroAt.get(c) ?? '');

  const enemyUnits: Record<number, UnitSetup> = {};
  const scale = waveMods(wave, cfg);
  let enemies: string[];
  let name = `Wave ${wave}`;
  let background: string | undefined;
  let enemyNames: string[];
  const encId = specialEncounter(run.seed, wave, cfg);
  const enc = encId ? encounter(encId) : undefined;
  if (enc) {
    name = enc.name;
    background = enc.background;
    enemies = Array.from({ length: CELL_COUNT }, () => '');
    for (const u of enc.units) {
      enemies[u.slot] = u.class;
      const mods = combineMods(u.mods, scale);
      const setup: UnitSetup = { ...(mods ? { modifiers: mods } : {}), ...(u.name ? { displayName: u.name } : {}), ...(u.tier ? { tier: u.tier } : {}) };
      if (Object.keys(setup).length) enemyUnits[u.slot] = setup;
    }
    enemyNames = [...enc.units].sort((a, b) => a.slot - b.slot).map((u) => unitName(u.class, u.name));
  } else {
    // Normal dalga: rastgele havuzdan farklı class'lar (Geometer gibi test class'ları havuzda yok), seed'li rastgele dizilim
    const rng = rngFor(run.seed, wave, 'enemies');
    const pool = [...randomPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const ids = pool.slice(0, Math.min(pool.length, enemyCount(wave, cfg)));
    enemies = randomCells(ids, hashSeed(run.seed, wave, 'cells'));
    if (scale) enemies.forEach((c, slot) => c && (enemyUnits[slot] = { modifiers: { ...scale } }));
    enemyNames = enemies.filter(Boolean).map((c) => unitName(c));
  }
  return {
    wave,
    kind,
    name,
    seed,
    party,
    enemies,
    heroOrder,
    units: { party: partyUnits, enemies: enemyUnits },
    difficulty: cfg.difficulty,
    ...(background ? { background } : {}),
    enemyNames,
  };
}
