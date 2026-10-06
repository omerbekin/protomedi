import type { DamageSpec } from './formulas';
import type { Combatant, Formulas, SkillEffect } from './types';

export type DamageEffect = Extract<SkillEffect, { type: 'damage' }>;

/**
 * Bir hasar etkisinin belirli bir hedefe karşı hesap girdisi: etiket bonusu, eksik mana ve kalkan ekleri,
 * çağrılan birimlerin fazla hasar yemesi. Gerçek vuruş, önizleme ve yapay zeka aynı belirtimi kullanır.
 * `powerMult`: arkadaki birime sıçrayan hasar gibi kısmi vuruşlar için; `extras` false ise düz ekler uygulanmaz.
 */
export function damageSpecFor(
  actor: Combatant,
  target: Combatant,
  effect: DamageEffect,
  formulas: Formulas,
  powerMult = 1,
  extras = true,
  extraTaken = 1,
  /** Saldıranın verdiği hasar çarpanı (Dex-primary Hunter's Mark: hedefinden hızlıysa 1 + hunterMark). */
  dealtMult = 1,
): DamageSpec {
  // Tür hassasiyeti: ör. undead + holy, nature + fire
  const element = effect.element ?? 'physical';
  let weak = 1;
  for (const tag of target.tags) weak *= formulas.weaknesses?.[tag]?.[element] ?? 1;
  const tagBonus = effect.bonusVsTag && target.tags.includes(effect.bonusVsTag.tag) ? effect.bonusVsTag.multiplier : 1;
  let extra = 0;
  if (extras && effect.bonusPerMissingMana) extra += Math.max(0, target.maxMp - target.mp) * effect.bonusPerMissingMana;
  if (extras && effect.bonusFromShield) extra += actor.shield * effect.bonusFromShield.ratio;
  // Pasifler: rage (eksik cana göre) ve openingShot (canı dolu hedefe)
  let passiveMult = 1;
  const pe = actor.passive?.effect;
  if (pe?.type === 'rage') passiveMult *= 1 + pe.maxBonus * (1 - actor.hp / actor.maxHp);
  if (pe?.type === 'longshot') {
    const lanes = formulas.formation.lanes;
    passiveMult *= 1 + pe.perRow * (Math.floor(actor.slot / lanes) + Math.floor(target.slot / lanes));
  }
  return {
    damageType: effect.damageType,
    scale: effect.scale,
    power: effect.power * tagBonus * weak * powerMult * passiveMult,
    ...(effect.ignoreDefense ? { ignoreDefense: effect.ignoreDefense } : {}),
    extra,
    takenMultiplier: (target.summoned ? formulas.summon.damageTakenMultiplier : 1) * extraTaken * dealtMult, // Hunter's Mark tüm vuruşu (eklerle birlikte) çarpar
  };
}
