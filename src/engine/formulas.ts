import type { Rng } from './rng';
import { armorReduction, attributePower, hitChance, hitOutcome, type HitOutcome } from './stats';
import type { Attribute, Formulas, Stats } from './types';

/** Bir hasar etkisinin hesap girdisi (skill etkisi + hedefe özel ekler). */
export interface DamageSpec {
  damageType: 'physical' | 'magic';
  scale: Attribute;
  power: number;
  ignoreDefense?: number;
  /** Zırhtan ÖNCE eklenen düz miktar (eksik mana, tüketilen kalkan gibi). */
  extra?: number;
  /** Hedefin aldığı hasar çarpanı (çağrılan birimler için 2). */
  takenMultiplier?: number;
}

export interface Range {
  min: number;
  max: number;
  avg: number;
}

/**
 * Sapmasız, kritiksiz hasar: (özellik x katsayı x güç + ekler) x (1 - zırh azalması) x alınan hasar çarpanı.
 * Zırh YÜZDESEL düşürür; zırh arttıkça azalma artışı yavaşlar (armor / (armor + k)).
 */
function baseDamage(attacker: Stats, defender: Stats, spec: DamageSpec, formulas: Formulas): number {
  const armor = (spec.damageType === 'physical' ? defender.armor : defender.magicArmor) * (1 - (spec.ignoreDefense ?? 0));
  const raw = attributePower(attacker, spec.scale, formulas) * spec.power + (spec.extra ?? 0);
  return raw * (1 - armorReduction(armor, formulas)) * (spec.takenMultiplier ?? 1);
}

/** Hasarın alabileceği en düşük, en yüksek ve ortalama değer (kritik hariç). Rastgelelik kullanmaz. */
export function damageRange(attacker: Stats, defender: Stats, spec: DamageSpec, formulas: Formulas): Range {
  const { variance, minDamage } = formulas.damage;
  const base = baseDamage(attacker, defender, spec, formulas);
  const clamp = (v: number) => Math.max(minDamage, Math.round(v));
  return { min: clamp(base * (1 - variance)), max: clamp(base * (1 + variance)), avg: clamp(base) };
}

/** Zar atılmış hasar (±sapma, kritik HARİÇ; kritik ayrıca rollCrit ile son çarpan olarak uygulanır). */
export function rollDamage(attacker: Stats, defender: Stats, spec: DamageSpec, formulas: Formulas, rng: Rng): number {
  const { variance, minDamage } = formulas.damage;
  const base = baseDamage(attacker, defender, spec, formulas);
  return Math.max(minDamage, Math.round(base * (1 + (rng.next() * 2 - 1) * variance)));
}

/** Kritik zarı: her çağrıda bir sayı tüketir. Hasarın/şifanın SON çarpanını döndürür (kritik yoksa 1). */
export function rollCrit(stats: Pick<Stats, 'critChance' | 'critMult'>, rng: Rng): { crit: boolean; mult: number } {
  const crit = rng.next() < stats.critChance;
  return { crit, mult: crit ? stats.critMult : 1 };
}

/** İsabet zarı: her çağrıda bir sayı tüketir. true = vurdu (şans = hitChance: saldırganın accuracy'si - hedefin evasion'ı). */
export function rollHit(attacker: Pick<Stats, 'accuracy'>, defender: Pick<Stats, 'evasion'>, formulas: Formulas, rng: Rng): boolean {
  return rng.next() < hitChance(attacker, defender, formulas);
}

/** İsabet zarı, üç sonuçlu: 'hit' / 'dodge' (hedef kaçındı) / 'miss' (saldıran isabet ettiremedi). rollHit ile AYNI tek zarı tüketir (vuruş başına bir rng.next). */
export function rollHitOutcome(attacker: Pick<Stats, 'accuracy'>, defender: Pick<Stats, 'evasion'>, formulas: Formulas, rng: Rng): HitOutcome {
  return hitOutcome(attacker, defender, formulas, rng.next());
}

/** Şifa miktarının aralığı (kritik hariç). */
export function healRange(caster: Stats, scale: Attribute, power: number, formulas: Formulas): Range {
  const { variance, minHeal } = formulas.heal;
  const raw = attributePower(caster, scale, formulas) * power;
  const clamp = (v: number) => Math.max(minHeal, Math.round(v));
  return { min: clamp(raw * (1 - variance)), max: clamp(raw * (1 + variance)), avg: clamp(raw) };
}

/** Zar atılmış şifa (kritik hariç). */
export function rollHeal(caster: Stats, scale: Attribute, power: number, formulas: Formulas, rng: Rng): number {
  const { variance, minHeal } = formulas.heal;
  const raw = attributePower(caster, scale, formulas) * power;
  return Math.max(minHeal, Math.round(raw * (1 + (rng.next() * 2 - 1) * variance)));
}

/** Kalkan miktarı: sabit (sapma ve kritik YOK). */
export function shieldAmount(caster: Stats, scale: Attribute, power: number, formulas: Formulas): number {
  return Math.round(attributePower(caster, scale, formulas) * power);
}
