import type { Battle } from './battle';
import type { BattleSummary, UnitSummary } from './types';

/**
 * Savaş sonu özeti (saf; savaşı değiştirmez, rastgelelik kullanmaz): kazanan, oynanan tur ve HER birimin (çağrılar `summoned: true` ile işaretli)
 * kalan canı / maks canı, MP'si, hayatta olup olmadığı ve cesedinin durumu. Sefer (src/campaign) can taşırken bunu okur:
 * `battleSummary(battle).units.filter((u) => u.side === 'party' && !u.summoned)`. Savaş sürerken de çağrılabilir (winner null).
 */
export function battleSummary(battle: Battle): BattleSummary {
  const units: UnitSummary[] = battle.combatants.map((c) => {
    const alive = c.hp > 0;
    const corpse = !alive && !c.summoned ? battle.corpseOf(c.uid)?.state : undefined;
    return {
      uid: c.uid,
      side: c.side,
      classId: c.defId,
      name: c.name,
      ...(c.displayName ? { displayName: c.displayName } : {}),
      ...(c.tier ? { tier: c.tier } : {}),
      slot: c.slot,
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      hpRatio: c.maxHp > 0 ? Math.max(0, c.hp) / c.maxHp : 0,
      mp: c.mp,
      maxMp: c.maxMp,
      alive,
      summoned: c.summoned,
      ...(corpse ? { corpse } : {}),
    };
  });
  return { winner: battle.winner, turnsTaken: battle.turnsTaken, units };
}
