import type { Formulas, StatusDef } from './types';

/**
 * Madde 272 (Ömer 2026-10-08: "İsabeti-kritiği bozan etkiler de boss'a işlemesin"): isabet ya da kritik düşüren debuff mı
 * (statuses.json > accuracyDelta < 0 ya da critDelta < 0: Blinded, Jinxed)? Omen'in yığın başına düşüşü (critDeltaPerStack) bu kurala girmez:
 * Omen uygulanır, yalnızca kritik düşüşü yok sayılır (ccImmunity.omenCrit). Saf.
 */
export function isAccuracyCritDebuff(d: Pick<StatusDef, 'type' | 'accuracyDelta' | 'critDelta'> | undefined): boolean {
  return !!d && d.type === 'debuff' && ((d.accuracyDelta ?? 0) < 0 || (d.critDelta ?? 0) < 0);
}

/** Boss rütbesi bu durumu yemez mi (CC ya da accuracyCrit açıkken isabet/kritik debuff'ı)? Rütbe kontrolü yapmaz (skill-info metni için). Saf. */
export function bossBlocksStatus(formulas: Pick<Formulas, 'ccImmunity'>, d: StatusDef | undefined): boolean {
  const imm = formulas.ccImmunity;
  if (!d || !imm?.tiers.includes('boss')) return false;
  return !!d.cc || (!!imm.accuracyCrit && isAccuracyCritDebuff(d));
}
