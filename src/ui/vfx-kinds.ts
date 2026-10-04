/**
 * Skill efekti (VFX) adları (kodu src/game/vfx.ts içinde). Skill verisindeki `vfx` alanı bunlardan biri olmak zorunda; liste
 * `VFX` kaydıyla tip düzeyinde eşleşir. Phaser'a bağımlı değildir (testlerde kullanılır).
 */
export const VFX_KINDS = [
  'doublestrike',
  'charge',
  'whirlwind',
  'warcry',
  'holysword',
  'resurrect',
  'judgment',
  'fireball',
  'blizzard',
  'barrier',
  'meteor',
  'bonethrow',
  'bloodhands',
  'wail',
  'raise',
  'bonestrike',
  'arrowshot',
  'pierce',
  'arrowrain',
  'aimed',
  'thornwhip',
  'vines',
  'rejuvenate',
  'summonroots',
  'woodsmash',
  'taunt',
  'guardlink',
  'tremor',
  'fistcrush',
  'manaburn',
  'drainfield',
  'spellward',
  'voidstrike',
] as const;

export type VfxKind = (typeof VFX_KINDS)[number];
