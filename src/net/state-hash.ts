import type { Battle } from '../engine';

/** FNV-1a 32 bit, 8 haneli onaltılık (saf; iki tarayıcıda aynı girdi = aynı çıktı). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Savaş durumunun kısa özeti (desync tespiti): her birimin değişen alanları (can, MP, Rage, kalkanlar, yuva/tahta, durumlar,
 * cooldown'lar, sıra sayacı, çağrı ömrü, pasif birikimi), zemin etkileri, sıradaki birim, tur sayısı ve kazanan.
 * Sayıların metne çevrilmesi ECMAScript'te tanımlı olduğundan farklı tarayıcılarda da aynı sonucu verir.
 */
export function stateHash(battle: Battle): string {
  const units = battle.combatants.map((c) => [
    c.uid,
    c.defId,
    c.hp,
    c.mp,
    c.rage ?? null,
    c.shield,
    c.magicShield,
    c.board,
    c.slot,
    c.turnCounter,
    c.lifespan ?? null,
    c.charge,
    c.empowered ?? null,
    c.statuses.map((s) => [s.kind, s.turns, s.source, s.stacks ?? null, s.amount ?? null, s.taken ?? null]),
    Object.keys(c.cooldowns)
      .sort()
      .map((k) => [k, c.cooldowns[k]]),
  ]);
  const ground = battle.ground.map((g) => [g.id, g.ground, g.board, g.slots, g.turns, g.amount]);
  return fnv1a(JSON.stringify([battle.currentUid, battle.turnsTaken, battle.winner, units, ground]));
}
