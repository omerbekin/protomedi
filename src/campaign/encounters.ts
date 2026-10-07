import { CELL_COUNT, randomPool } from '../engine/content';
import { CONFIG, ENCOUNTERS, getMap } from './data';
import { node } from './graph';
import { battleSeed } from './seed';
import { activeHeroes, heroById } from './state';
import type { UnitSetup } from '../engine/types';
import type { BattleOutcome, CampaignState, Difficulty, EncounterDef } from './types';

/**
 * Karşılaşmalar ve savaş motoruna köprü (saf). Savaş kurallarına dokunmaz: mevcut giriş noktasının istediği hücre listelerini
 * (dizin = yuva, '' = boş), yuva başına birim kurulumlarını (motorun `teams.units`: güçlendirme, özel ad, rütbe, başlangıç canı) ve seed'i üretir;
 * sonucu `battleSummary(battle).units` (ya da birimlerin son canı) üzerinden okur. Motor arayüzü: docs/design/combat.md > Savaş kurulum seçenekleri.
 */
export const ENGINE_CAPS = {
  /** Motor birim bazında güçlendirme/zayıflatma + özel ad + rütbe destekliyor (engine-dev, madde 251). Kapalıysa yedek takımlar oynanır. */
  unitMods: true,
  /** Motor eksik canla başlamayı destekliyor (startHpRatio). Kapalıysa her savaş tam canla başlar. */
  startHp: true,
};

export type EngineCaps = typeof ENGINE_CAPS;

/** Oynanacak karşılaşma: motor güçlendirmeyi desteklemiyorsa ve yedeği varsa yedek. */
export function resolveEncounter(id: string, caps = ENGINE_CAPS): { id: string; def: EncounterDef; fallback: boolean } {
  const def = ENCOUNTERS[id];
  if (!def) throw new Error(`Encounter not found: ${id}`);
  if (!caps.unitMods && def.fallback && ENCOUNTERS[def.fallback]) return { id: def.fallback, def: ENCOUNTERS[def.fallback]!, fallback: true };
  return { id, def, fallback: false };
}

/** Karşılaşmanın düşman hücre listesi (sınıf id'leri). */
export function enemyCells(def: EncounterDef): string[] {
  const cells = Array.from({ length: CELL_COUNT }, () => '');
  for (const u of def.units) cells[u.slot] = u.class;
  return cells;
}

/** Aktif takımın hücre listesi (sınıf id'leri). */
export function partyCells(s: CampaignState): string[] {
  return s.active.map((id) => (id ? (heroById(s, id)?.class ?? '') : ''));
}

/** Oyuncu birimlerinin motor sırası: motor hücre listesini yuva sırasıyla okur, i. birim 'party-i' olur. */
export const partyHeroOrder = (s: CampaignState): string[] => s.active.filter((id) => id && heroById(s, id));

export interface BattlePlan {
  nodeId: string;
  seed: number;
  encounterId: string;
  encounterName: string;
  usedFallback: boolean;
  party: string[];
  enemies: string[];
  /** Hero id'leri motor sırasıyla (party-0, party-1 ...). */
  heroOrder: string[];
  /** Motorun yuva başına birim kurulumları (teams.units; anahtar = yuva). */
  units: { party: Record<number, UnitSetup>; enemies: Record<number, UnitSetup> };
  /** Genel zorluğun yapay zeka değeri (campaign.json > difficulties[x].ai): savaş kurulumuna iletilir. */
  difficulty: Difficulty;
  /** Region battle background id (content-designer: border-road, valley-field, ashen-heights; yoksa varsayılan arka plan). */
  background?: string;
}

export function battlePlan(s: CampaignState, attempt = 0, caps = ENGINE_CAPS): BattlePlan {
  const map = getMap(s.mapId);
  const n = node(map, s.at);
  if (!n.encounter) throw new Error(`No battle at ${n.id}`);
  const enc = resolveEncounter(n.encounter, caps);
  const party: Record<number, UnitSetup> = {};
  const enemies: Record<number, UnitSetup> = {};
  // Can taşıma: eksik canlı karakter o oranla başlar (motor en az 1 can verir)
  if (CONFIG.rules.carryHp && caps.startHp)
    s.active.forEach((id, cell) => {
      const h = id ? heroById(s, id) : undefined;
      if (h && h.hpRatio < 1) party[cell] = { startHpRatio: h.hpRatio };
    });
  if (caps.unitMods)
    for (const u of enc.def.units) {
      const setup: UnitSetup = { ...(u.mods ? { modifiers: { ...u.mods } } : {}), ...(u.name ? { displayName: u.name } : {}), ...(u.tier ? { tier: u.tier } : {}) };
      if (Object.keys(setup).length) enemies[u.slot] = setup;
    }
  return {
    nodeId: n.id,
    seed: battleSeed(s.seed, s.mapId, n.id, attempt),
    encounterId: enc.id,
    encounterName: enc.def.name,
    usedFallback: enc.fallback,
    party: partyCells(s),
    enemies: enemyCells(enc.def),
    heroOrder: partyHeroOrder(s),
    units: { party, enemies },
    difficulty: CONFIG.difficulties[s.difficulty]?.ai ?? CONFIG.defaultDifficulty,
    background: map.regions.find((r) => r.id === n.region)?.battleBackground,
  };
}

/** Motorun birim görünümü (yalnızca okunur alanlar). */
export interface CombatantLike {
  uid: string;
  side: string;
  summoned: boolean;
  hp: number;
  maxHp: number;
}

/** Savaş sonu özeti: 'party-i' birimi heroOrder[i] karakteridir. Çağrılar sayılmaz. */
export function outcomeFrom(plan: Pick<BattlePlan, 'heroOrder'>, victory: boolean, combatants: CombatantLike[]): BattleOutcome {
  const units = combatants
    .filter((c) => c.side === 'party' && !c.summoned && /^party-\d+$/.test(c.uid))
    .map((c) => {
      const i = Number(c.uid.slice('party-'.length));
      return { heroId: plan.heroOrder[i] ?? '', hpRatio: Math.max(0, Math.min(1, c.hp / Math.max(1, c.maxHp))), alive: c.hp > 0 };
    })
    .filter((u) => u.heroId);
  return { victory, units };
}

/** Karşılaşma verisinin doğrulaması: sınıflar rastgele havuzda (test class'ı yok), yuvalar 0..11 ve tekrarsız, yedek geçerli. */
export function validateEncounters(): string[] {
  const errors: string[] = [];
  for (const [id, def] of Object.entries(ENCOUNTERS)) {
    if (!def.name) errors.push(`${id}: no name`);
    if (!def.units.length) errors.push(`${id}: no units`);
    const slots = def.units.map((u) => u.slot);
    if (new Set(slots).size !== slots.length) errors.push(`${id}: duplicate slots`);
    for (const u of def.units) {
      if (!randomPool.includes(u.class)) errors.push(`${id}: class ${u.class} is not a playable class`);
      if (!Number.isInteger(u.slot) || u.slot < 0 || u.slot >= CELL_COUNT) errors.push(`${id}: slot ${u.slot} out of range`);
    }
    if (def.fallback && (!ENCOUNTERS[def.fallback] || ENCOUNTERS[def.fallback]!.fallback)) errors.push(`${id}: bad fallback ${def.fallback}`);
  }
  return errors;
}

/** Bir düğümün düşman önizlemesi (sınıf id'leri, ön sıradan arkaya). */
export function enemyPreview(encounterId: string, caps = ENGINE_CAPS): { name: string; classes: string[]; leader?: string } {
  const enc = resolveEncounter(encounterId, caps);
  const units = [...enc.def.units].sort((a, b) => a.slot - b.slot);
  return { name: enc.def.name, classes: units.map((u) => u.class), leader: units.find((u) => u.tier)?.name };
}

export const partySize = (s: CampaignState): number => activeHeroes(s).length;
