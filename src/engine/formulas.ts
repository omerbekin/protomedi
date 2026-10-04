import type { Rng } from './rng';
import type { Formulas, Stats } from './types';

const varied = (value: number, variance: number, rng: Rng) => value * (1 + (rng.next() * 2 - 1) * variance);

const physicalBase = (attacker: Stats, defender: Stats, power: number, formulas: Formulas, ignoreDefense: number) =>
  attacker.atk * power - defender.def * (1 - ignoreDefense) * formulas.physicalDamage.defenseFactor;

const magicBase = (attacker: Stats, defender: Stats, power: number, formulas: Formulas, ignoreDefense: number) =>
  attacker.mag * power - defender.res * (1 - ignoreDefense) * formulas.magicDamage.resistFactor;

/** Fiziksel hasar. Tüm katsayılar data/formulas.json'dan gelir. */
export function physicalDamage(
  attacker: Stats,
  defender: Stats,
  power: number,
  formulas: Formulas,
  rng: Rng,
  ignoreDefense = 0,
): number {
  const { variance, minDamage } = formulas.physicalDamage;
  return Math.max(minDamage, Math.round(varied(physicalBase(attacker, defender, power, formulas, ignoreDefense), variance, rng)));
}

/** Büyü hasarı: MAG x güç - RES x katsayı. */
export function magicDamage(
  attacker: Stats,
  defender: Stats,
  power: number,
  formulas: Formulas,
  rng: Rng,
  ignoreDefense = 0,
): number {
  const { variance, minDamage } = formulas.magicDamage;
  return Math.max(minDamage, Math.round(varied(magicBase(attacker, defender, power, formulas, ignoreDefense), variance, rng)));
}

/** Şifa miktarı: MAG x güç. */
export function healAmount(caster: Stats, power: number, formulas: Formulas, rng: Rng): number {
  const { variance, minHeal } = formulas.heal;
  return Math.max(minHeal, Math.round(varied(caster.mag * power, variance, rng)));
}

// --- Yapay zekanın tahminleri: rastgelelik kullanmaz, motorun RNG'sine dokunmaz ---

/** Beklenen (sapmasız) hasar. */
export function expectedDamage(
  type: 'physical' | 'magic',
  attacker: Stats,
  defender: Stats,
  power: number,
  formulas: Formulas,
  ignoreDefense = 0,
): number {
  const base =
    type === 'physical'
      ? physicalBase(attacker, defender, power, formulas, ignoreDefense)
      : magicBase(attacker, defender, power, formulas, ignoreDefense);
  const min = type === 'physical' ? formulas.physicalDamage.minDamage : formulas.magicDamage.minDamage;
  return Math.max(min, Math.round(base));
}

/** Beklenen (sapmasız) şifa. */
export function expectedHeal(caster: Stats, power: number, formulas: Formulas): number {
  return Math.max(formulas.heal.minHeal, Math.round(caster.mag * power));
}
