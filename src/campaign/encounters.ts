import { bosses, CELL_COUNT, classes, randomPool } from '../engine/content';
import { CONFIG, ENCOUNTERS, getMap } from './data';
import { node } from './graph';
import { battleSeed } from './seed';
import { chapterEnemyMods } from './power';
import { loadoutSetup } from '../progression/loadout';
import { activeHeroes, heroById } from './state';
import type { UnitSetup } from '../engine/types';
import type { BattleOutcome, CampaignState, Difficulty, DifficultyEnemyMods, EncounterDef, UnitMods } from './types';

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

/**
 * Karşılaşma birimi güçlendirmesi + genel zorluğun düşman güçlendirmesi (campaign.json > difficulties[x].enemy):
 * çarpanlar (hpMult, statMult, powerMult) çarpılır, düz ekler (armorAdd, magicArmorAdd) toplanır. İkisi de yoksa undefined.
 */
export function withDifficulty(mods: UnitMods | undefined, diff: DifficultyEnemyMods | undefined): UnitMods | undefined {
  if (!diff || !Object.keys(diff).length) return mods ? { ...mods } : undefined;
  const out: UnitMods = { ...(mods ?? {}) };
  for (const k of ['hpMult', 'statMult', 'powerMult'] as const)
    if (diff[k] !== undefined && diff[k] !== 1) out[k] = Math.round((out[k] ?? 1) * diff[k]! * 1000) / 1000;
  for (const k of ['armorAdd', 'magicArmorAdd'] as const) if (diff[k]) out[k] = (out[k] ?? 0) + diff[k]!;
  return Object.keys(out).length ? out : undefined;
}

export function battlePlan(s: CampaignState, attempt = 0, caps = ENGINE_CAPS): BattlePlan {
  const map = getMap(s.mapId);
  const n = node(map, s.at);
  if (!n.encounter) throw new Error(`No battle at ${n.id}`);
  const enc = resolveEncounter(n.encounter, caps);
  const party: Record<number, UnitSetup> = {};
  const enemies: Record<number, UnitSetup> = {};
  s.active.forEach((id, cell) => {
    const h = id ? heroById(s, id) : undefined;
    if (!h) return;
    // Güç toplama katmanı (temel + item; ileride level/ağaç): hiçbir şey takılı değilse boş => birim bugünküyle aynı
    const setup: UnitSetup = caps.unitMods ? loadoutSetup(h) : {};
    // Can taşıma: eksik canlı karakter o oranla başlar (motor en az 1 can verir)
    if (CONFIG.rules.carryHp && caps.startHp && h.hpRatio < 1) setup.startHpRatio = h.hpRatio;
    if (Object.keys(setup).length) party[cell] = setup;
  });
  // Bölüm ölçeği (data/campaign/power-budget.json): açık ilerleme sistemi yokken 1 => düşmanlar bugünküyle aynı
  const chapterMods = chapterEnemyMods(s.mapId, n.id);
  if (caps.unitMods)
    for (const u of enc.def.units) {
      const diff = CONFIG.difficulties[s.difficulty];
      // noTierMods: rütbe eki (enemyTier) bu birime uygulanmaz (The Bridge Warden: fazları/telgrafları zaten zor; sim ölçümü, open-questions)
      const mods = withDifficulty(withDifficulty(withDifficulty(u.mods, chapterMods), diff?.enemy), u.tier && !u.noTierMods ? diff?.enemyTier?.[u.tier] : undefined);
      const setup: UnitSetup = {
        ...(mods ? { modifiers: mods } : {}),
        ...(u.name ? { displayName: u.name } : {}),
        ...(u.tier ? { tier: u.tier } : {}),
        ...(u.lockSkills?.length ? { lockSkills: [...u.lockSkills] } : {}),
        ...(u.initialCooldownBonus ? { initialCooldownBonus: u.initialCooldownBonus } : {}),
      };
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
    // Arka plan önceliği: karşılaşma > düğüm > bölge (dosya yoksa sahne varsayılan arka plana düşer)
    background: enc.def.background ?? n.battleBackground ?? map.regions.find((r) => r.id === n.region)?.battleBackground,
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

/** Karşılaşma verisinin doğrulaması: sınıflar rastgele havuzda (test class'ı yok), yuvalar 0..11 ve tekrarsız, yedek geçerli, kilitli skill'ler sınıfın skill'i. */
export function validateEncounters(): string[] {
  const errors: string[] = [];
  for (const [id, def] of Object.entries(ENCOUNTERS)) {
    if (!def.name) errors.push(`${id}: no name`);
    if (!def.units.length) errors.push(`${id}: no units`);
    const slots = def.units.map((u) => u.slot);
    if (new Set(slots).size !== slots.length) errors.push(`${id}: duplicate slots`);
    for (const u of def.units) {
      // Boss tanımları (data/bosses: The Bridge Warden, Iron Mooring) istisna: oynanabilir class değiller ama karşılaşmada kullanılır
      if (!randomPool.includes(u.class) && !bosses[u.class]) errors.push(`${id}: class ${u.class} is not a playable class`);
      if (!Number.isInteger(u.slot) || u.slot < 0 || u.slot >= CELL_COUNT) errors.push(`${id}: slot ${u.slot} out of range`);
      for (const sk of u.lockSkills ?? []) if (!classes[u.class]?.skills.includes(sk)) errors.push(`${id}: ${u.class} has no skill ${sk} to lock`);
      if (u.initialCooldownBonus !== undefined && (!Number.isInteger(u.initialCooldownBonus) || u.initialCooldownBonus < 0)) errors.push(`${id}: bad initialCooldownBonus`);
    }
    if (def.fallback && (!ENCOUNTERS[def.fallback] || ENCOUNTERS[def.fallback]!.fallback)) errors.push(`${id}: bad fallback ${def.fallback}`);
  }
  return errors;
}

/** Birimin oyuncuya görünen adı: karşılaşmadaki özel ad > class adı > boss adı > id. */
function unitDisplayName(u: { class: string; name?: string }): string {
  return u.name ?? classes[u.class]?.name ?? bosses[u.class]?.name ?? u.class;
}

/**
 * Bir düğümün düşman önizlemesi (ön sıradan arkaya). `names`: görünen adlar, aynı ad tekrarı birleşik ("2× Iron Mooring");
 * `classes`: sınıf id'leri (ikon/logo için).
 */
export function enemyPreview(encounterId: string, caps = ENGINE_CAPS): { name: string; classes: string[]; names: string[]; leader?: string } {
  const enc = resolveEncounter(encounterId, caps);
  const units = [...enc.def.units].sort((a, b) => a.slot - b.slot);
  const counts = new Map<string, number>();
  for (const u of units) counts.set(unitDisplayName(u), (counts.get(unitDisplayName(u)) ?? 0) + 1);
  const names = [...counts].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n));
  return { name: enc.def.name, classes: units.map((u) => u.class), names, leader: units.find((u) => u.tier)?.name };
}

export const partySize = (s: CampaignState): number => activeHeroes(s).length;
