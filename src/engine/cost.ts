import type { Combatant, SkillCost } from './types';

/**
 * Skill bedelinin GERÇEK miktarı. Sabit bedelde `amount`; `ofCurrent` (0-1) varsa kullanıcının o anki kaynağının bu oranı eklenir:
 * amount + round(mevcut x ofCurrent), en az 1 (Wail of the Dead: mevcut canın %20'si). Yuvarlama: en yakın tam sayı (0,5 yukarı).
 * Kullanıcı verilmezse (tooltip/wiki: savaş dışı) sabit kısım döner. Motor (canUse, ödeme), YZ, önizleme ve maç kaydı bu fonksiyonu kullanır.
 */
export function skillCostAmount(cost: SkillCost, user?: Pick<Combatant, 'hp' | 'mp' | 'rage'>): number {
  const ratio = cost.ofCurrent ?? 0;
  if (ratio <= 0) return cost.amount;
  if (!user) return cost.amount;
  const current = cost.resource === 'hp' ? user.hp : cost.resource === 'mp' ? user.mp : (user.rage ?? 0);
  return Math.max(1, cost.amount + Math.round(current * ratio));
}

/** Bedelin kısa, okunur etiketi (İngilizce; tooltip başlığı, wiki): '5 MP', '50 RAGE', '20% of current HP', 'Free'. */
export function skillCostLabel(cost: SkillCost): string {
  const res = cost.resource.toUpperCase();
  if ((cost.ofCurrent ?? 0) > 0) return `${cost.amount > 0 ? `${cost.amount} + ` : ''}${Math.round(cost.ofCurrent! * 100)}% of current ${res}`;
  return cost.amount > 0 ? `${cost.amount} ${res}` : 'Free';
}

/** Bedel kullanıcının mevcut kaynağına oranlı mı (ofCurrent)? */
export const isRatioCost = (cost: SkillCost): boolean => (cost.ofCurrent ?? 0) > 0;
