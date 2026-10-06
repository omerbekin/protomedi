/**
 * Skill efekti (VFX) adları (kodu src/game/vfx.ts içinde). Skill verisindeki `vfx` alanı bunlardan biri olmak zorunda; liste
 * `VFX` kaydıyla tip düzeyinde eşleşir. Phaser'a bağımlı değildir (testlerde kullanılır).
 */
export const VFX_KINDS = [
  'doublestrike',
  'charge',
  'whirlwind',
  'warcry',
  'resurrect',
  'judgment',
  /** Holy Strike: dev savaş çekici düşer (Judgment'ın eski animasyonu). */
  'hammerfall',
  'fireball',
  'blizzard',
  'barrier',
  'meteor',
  'bonethrow',
  'bloodhands',
  'wail',
  'raise',
  'bonestrike',
  /** Skeleton - Bone Slash: hedef ve yanındakileri kesen geniş kemik savrulması. */
  'boneslash',
  'arrowshot',
  'pierce',
  'arrowrain',
  'aimed',
  'thornwhip',
  'vines',
  'rejuvenate',
  'summonroots',
  'woodsmash',
  /** Treant - Thorn Shield: yerden diken ve kök fırlayıp kalkan olur. */
  'thornshield',
  'taunt',
  'guardlink',
  'tremor',
  'fistcrush',
  'manasteal',
  'drainfield',
  'spellward',
  'voidstrike',
  /** Yedek: Void Strike'ın ilk (iğneli) sürümü; kullanılmıyor, `vfx` verisiyle geri dönülebilir. */
  'voidstrikespikes',
  /** Yedek: Holy Strike'ın eski (düşen kılıç) animasyonu. */
  'holysword',
  /** Gambler: zar fırlatma, düello bahsi, kart fırlatma, All In. */
  'loadeddice',
  'duelbet',
  'cardfan',
  'allin',
  /** Geometer (AOE şekilleri): tebeşir-ışık kalemi şeklin dış hattını çizer; süpüren cetvel, ışık mızrağı, taş mühürler, artı ışınları. */
  'shaperow',
  'shapecolumn',
  'shaperect',
  'shapeplus',
] as const;

/** Kullanılmayan ama bilerek saklanan yedek efektler. */
export const BACKUP_VFX: readonly string[] = ['voidstrikespikes', 'holysword'];

export type VfxKind = (typeof VFX_KINDS)[number];
