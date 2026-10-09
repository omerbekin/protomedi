// Endless kalıntıları (relic; saf). Veri: data/endless.json > relics. Ömer onayı 2026-10-09 (open-questions madde 282).
// Her boss zaferinden sonra koşunun sahip olmadığı kalıntılardan `offer` tanesi seed'li sunulur; oyuncu birini seçer; koşu boyunca kalır.
// Etkiler motora yalnızca kahramanların UnitSetup'ı üzerinden girer (modifiers.critAdd / armorAdd / magicArmorAdd ve genel kancalar
// startShieldRatio / openingDamageMult / fallAllyHealRatio); zafer şifası (victoryHeal) endless'ın kendi kuralıdır. QB / MP / sefer etkilenmez.
import type { UnitSetup } from '../engine/types';
import { ENDLESS, type EndlessConfig } from './data';
import { rngFor } from './waves';

export interface RelicEffect {
  startShieldRatio?: number;
  victoryHeal?: number;
  critAdd?: number;
  openingDamageMult?: number;
  fallAllyHealRatio?: number;
  armorAdd?: number;
  magicArmorAdd?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  /** İkon türü (src/ui/icon-kinds.ts). */
  icon: string;
  color: string;
  text: string;
  effect: RelicEffect;
}

export const relicList = (cfg: EndlessConfig = ENDLESS): RelicDef[] => cfg.relics.list;
export const relicDef = (id: string, cfg: EndlessConfig = ENDLESS): RelicDef | undefined => cfg.relics.list.find((r) => r.id === id);

/** Sahip olunan kalıntıların birleşik etkisi: ekler toplanır, çarpanlar çarpılır, oranlar (kalkan, şifa) toplanır, zafer şifası en yüksek. */
export function relicEffects(ids: readonly string[] | undefined, cfg: EndlessConfig = ENDLESS): RelicEffect {
  const out: RelicEffect = {};
  const add = (k: 'startShieldRatio' | 'critAdd' | 'fallAllyHealRatio' | 'armorAdd' | 'magicArmorAdd', v?: number) => {
    if (v) out[k] = Math.round(((out[k] ?? 0) + v) * 1000) / 1000;
  };
  for (const id of ids ?? []) {
    const e = relicDef(id, cfg)?.effect;
    if (!e) continue;
    add('startShieldRatio', e.startShieldRatio);
    add('critAdd', e.critAdd);
    add('fallAllyHealRatio', e.fallAllyHealRatio);
    add('armorAdd', e.armorAdd);
    add('magicArmorAdd', e.magicArmorAdd);
    if (e.openingDamageMult) out.openingDamageMult = Math.round((out.openingDamageMult ?? 1) * e.openingDamageMult * 1000) / 1000;
    if (e.victoryHeal !== undefined) out.victoryHeal = Math.max(out.victoryHeal ?? 0, e.victoryHeal);
  }
  return out;
}

/** Kahramanın savaş kurulumuna kalıntı etkilerini ekler (item güçlendirmesiyle birleşir: düz ekler toplanır). Kalıntı yoksa kurulum aynen döner. */
export function withRelics(setup: UnitSetup, ids: readonly string[] | undefined, cfg: EndlessConfig = ENDLESS): UnitSetup {
  const e = relicEffects(ids, cfg);
  const mods = { ...(setup.modifiers ?? {}) };
  let changed = false;
  for (const k of ['critAdd', 'armorAdd', 'magicArmorAdd'] as const) {
    const v = e[k];
    if (!v) continue;
    mods[k] = Math.round(((mods[k] ?? 0) + v) * 1000) / 1000;
    changed = true;
  }
  const out: UnitSetup = { ...setup, ...(changed ? { modifiers: mods } : {}) };
  if (e.startShieldRatio) out.startShieldRatio = e.startShieldRatio;
  if (e.openingDamageMult && e.openingDamageMult !== 1) out.openingDamageMult = e.openingDamageMult;
  if (e.fallAllyHealRatio) out.fallAllyHealRatio = e.fallAllyHealRatio;
  return out;
}

/** Zafer şifası (can taşıma): kalıntı varsa onun değeri (en yüksek), yoksa carry.victoryHeal. */
export const victoryHealOf = (ids: readonly string[] | undefined, cfg: EndlessConfig = ENDLESS): number => Math.max(cfg.carry.victoryHeal, relicEffects(ids, cfg).victoryHeal ?? 0);

/** Kalıntı teklifi (seed'li): sahip olunmayanlardan en çok `offer` tane, tekrar yok; havuz biterse daha az (boşsa teklif yok). */
export function relicOffer(seed: number, cleared: number, owned: readonly string[] | undefined, cfg: EndlessConfig = ENDLESS): string[] {
  const pool = cfg.relics.list.map((r) => r.id).filter((id) => !(owned ?? []).includes(id));
  const rng = rngFor(seed, cleared, 'relic');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(0, cfg.relics.offer));
}
