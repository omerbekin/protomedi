import type { BetSpec } from './types';

/**
 * Bahis hesabı (saf; savaş, önizleme ve yapay zeka aynı formülü kullanır).
 * `mpLeft`: skill'in MP bedeli düşüldükten sonra kalan MP.
 */
export function betStake(bet: BetSpec, maxHp: number, hp: number, mpLeft: number): number {
  if (bet.resource === 'hp') return Math.max(0, Math.min(hp - 1, Math.round(maxHp * bet.ratio)));
  return Math.max(0, Math.round(mpLeft * bet.ratio));
}

/** Bahsin hasar çarpanları: kazanç, kayıp ve beklenen (olasılıkla ağırlıklı) çarpan. */
export function betMultipliers(bet: BetSpec, stake: number): { win: number; lose: number; expected: number } {
  const win = bet.winMult + (bet.perStake ?? 0) * stake;
  const lose = bet.loseMult ?? 1;
  return { win, lose, expected: bet.winChance * win + (1 - bet.winChance) * lose };
}
