// Endless sürekli akış (Ömer 2026-10-10, open-questions madde 300): dalga sonunda oyuncu tarafının savaş durumu koşuya yazılır, sonraki dalganın
// savaşı bu durumla kurulur (saf; yalnızca motor). Taşınan: buff'lar, Rage, kalkanlar, çağrılar (sahibi, canı, ömrü), hücreler, MP oranı.
// Silinen: TÜM debuff'lar; cooldown'lar sıfırlanır; savaş başına bir kez etkiler yenilenir (her dalga yeni bir motor savaşı olduğu için kendiliğinden:
// Lucky Escape, Legendary bir kezlikleri, Mantle yenilemesi, Staff sayacı, kalıntı kalkanı / ilk eylem). Yer etkileri, telgraflar, cesetler ve sıra
// sayaçları taşınmaz (yeni düşmanlarla yeni bir sıra başlar).
//
// Kimlik: motor uid'leri her savaşta yeniden verilir (hücre sırası); kayıtta uid yerine referans tutulur: 'h:<kahraman id>' / 's:<çağrı sırası>'.
// Tek kayıt biçimi: yarım savaş kaydı (eylem günlüğü) yine planın üzerine oynatılır; plan taşınan durumu içerdiği için devam birebir aynıdır.
import type { Battle } from '../engine';
import { statuses as STATUS_DEFS, summons as SUMMON_DEFS } from '../engine/content';
import type { Combatant, ShieldHook, Status, UnitSetup } from '../engine/types';
import type { CarriedSummon, UnitCarry } from './data';

/** Savaş sonunda taşınacak durum: kahraman id'si -> durum, canlı çağrılar. */
export interface WaveCarry {
  heroes: Record<string, UnitCarry>;
  summons: CarriedSummon[];
}

export const heroRef = (id: string): string => `h:${id}`;
export const summonRef = (i: number): string => `s:${i}`;

/** Durum taşınır mı: debuff'lar silinir (statuses.json > type 'debuff'); tanımsız özel durumlar (taunt, guard, regen) olumludur. */
export const carriesStatus = (s: Status): boolean => s.turns > 0 && STATUS_DEFS[s.kind]?.type !== 'debuff';

/** Ortağı / kaynağı yoksa anlamsız olan durumlar (koruyan ya da bağlı birim taşınmadıysa düşer). */
const NEEDS_PARTNER = new Set(['guard', 'dark_bond']);

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function carryOf(c: Combatant, ref: (uid: string | undefined) => string | undefined): UnitCarry {
  const self = ref(c.uid)!;
  const out: UnitCarry = {};
  const statuses: Status[] = [];
  for (const s of c.statuses) {
    if (!carriesStatus(s)) continue;
    const src = ref(s.source);
    if (NEEDS_PARTNER.has(s.kind) && s.source !== c.uid && !src) continue;
    const st: Status = { ...s, source: src ?? self };
    if (s.partner !== undefined) {
      const p = ref(s.partner);
      if (!p) continue;
      st.partner = p;
    }
    statuses.push(st);
  }
  if (statuses.length) out.statuses = statuses;
  if (c.rage !== undefined && c.rage > 0) out.rage = c.rage;
  if (c.shield > 0) out.shield = c.shield;
  if (c.magicShield > 0) out.magicShield = c.magicShield;
  if (c.shieldHooks?.length) out.shieldHooks = c.shieldHooks.map((h): ShieldHook => ({ ...h, caster: ref(h.caster) ?? self, onAbsorb: { ...h.onAbsorb } }));
  if (c.maxMp > 0) out.mpRatio = r3(Math.max(0, Math.min(1, c.mp / c.maxMp)));
  return out;
}

/**
 * Bitmiş savaştan oyuncu tarafının taşınacak durumu. `heroOrder`: planın parti birimi sırası (dizin = 'party-i'; çağrı hücreleri '').
 * Ölü kahramanın durumu yok (dirilince temiz başlar); yalnızca canlı çağrılar taşınır.
 */
export function snapshotCarry(battle: Battle, heroOrder: readonly string[]): WaveCarry {
  const refs = new Map<string, string>();
  const party = battle.combatants.filter((c) => c.side === 'party' && !c.inert);
  for (const c of party) {
    if (c.summoned) continue;
    const m = /^party-(\d+)$/.exec(c.uid);
    const id = m ? heroOrder[Number(m[1])] : undefined;
    if (id) refs.set(c.uid, heroRef(id));
  }
  const live = party.filter((c) => c.summoned && c.hp > 0 && SUMMON_DEFS[c.defId]);
  live.forEach((c, i) => refs.set(c.uid, summonRef(i)));
  const ref = (uid: string | undefined) => (uid ? refs.get(uid) : undefined);
  const heroes: Record<string, UnitCarry> = {};
  for (const c of party) {
    const r = refs.get(c.uid);
    if (c.summoned || !r || c.hp <= 0) continue;
    heroes[r.slice(2)] = carryOf(c, ref);
  }
  const summons = live.map((c): CarriedSummon => {
    const owner = ref(c.owner);
    return {
      unit: c.defId,
      slot: c.slot,
      hp: c.hp,
      ...(owner?.startsWith('h:') ? { owner: owner.slice(2) } : {}),
      ...(c.lifespan !== undefined ? { lifespan: c.lifespan } : {}),
      ...(c.empowered !== undefined ? { empowered: c.empowered } : {}),
      ...carryOf(c, ref),
    };
  });
  return { heroes, summons };
}

/** Taşınan durum -> sonraki savaşın birim kurulumu (referanslar `uidOf` ile bu savaşın uid'lerine; bilinmeyen kaynak = birimin kendisi). */
export function carrySetup(carry: UnitCarry | undefined, selfUid: string, uidOf: (ref: string) => string | undefined): UnitSetup {
  if (!carry) return {};
  const out: UnitSetup = {};
  const statuses: Status[] = [];
  for (const s of carry.statuses ?? []) {
    if (NEEDS_PARTNER.has(s.kind) && !uidOf(s.source)) continue;
    const st: Status = { ...s, source: uidOf(s.source) ?? selfUid };
    if (s.partner !== undefined) {
      const p = uidOf(s.partner);
      if (!p) continue;
      st.partner = p;
    }
    statuses.push(st);
  }
  if (statuses.length) out.startStatuses = statuses;
  if (carry.rage) out.startRage = carry.rage;
  if (carry.shield) out.startShield = carry.shield;
  if (carry.magicShield) out.startMagicShield = carry.magicShield;
  if (carry.shieldHooks?.length) out.startShieldHooks = carry.shieldHooks.map((h) => ({ ...h, caster: uidOf(h.caster) ?? selfUid, onAbsorb: { ...h.onAbsorb } }));
  if (carry.mpRatio !== undefined && carry.mpRatio < 1) out.startMpRatio = carry.mpRatio;
  return out;
}

/** Kayıttaki taşınan durum biçimce geçerli mi (bozuk alanlar atılır; dönen: temizlenmiş kopya ya da undefined). */
export function cleanCarry(v: unknown): UnitCarry | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as UnitCarry;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const out: UnitCarry = {};
  if (num(c.mpRatio)) out.mpRatio = Math.min(1, c.mpRatio);
  if (num(c.rage)) out.rage = c.rage;
  if (num(c.shield)) out.shield = c.shield;
  if (num(c.magicShield)) out.magicShield = c.magicShield;
  if (Array.isArray(c.statuses)) {
    const st = c.statuses.filter((s) => s && typeof s.kind === 'string' && num(s.turns) && typeof s.source === 'string');
    if (st.length) out.statuses = st;
  }
  if (Array.isArray(c.shieldHooks)) {
    const hk = c.shieldHooks.filter((h) => h && typeof h.skill === 'string' && typeof h.caster === 'string' && num(h.amount) && h.onAbsorb && typeof h.onAbsorb === 'object');
    if (hk.length) out.shieldHooks = hk;
  }
  return out;
}
