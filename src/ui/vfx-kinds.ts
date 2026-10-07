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
  /** Yedek: Treant Root Smash'in eski (yürüyüp omzundan yumruk fırlatan) animasyonu; Root Smash artık uzaktan, gökten iner (rootfall). */
  'woodsmash',
  /** Treant - Root Smash: Treant yerinde kolunu kaldırır, hedefin üstünde gökten kök kolun ucundaki dev ahşap yumruk düşer. */
  'rootfall',
  /** Treant - Vine Snare: yere vurulan kol, toprak altından ilerleyen kökler, 2x2 hücrede fırlayan kök-sarmaşık bacakları sarar. */
  'vinesnare',
  /** Yedek: Defender'ın eski animasyonları (Taunt ünlem + yay dalga, Guard örgülü şerit, Tremor Slam zikzak çatlak, Fist Crush gökten yumruk). */
  'taunt',
  'guardlink',
  'tremor',
  'fistcrush',
  /** Defender (rework): kalkan-vuruşu + kükreme + hedef işaretleri; dostun önünde kule kalkanı hayaleti; yere çakılan kalkan + sıra boyunca kabaran taş levhalar; 3 hedefe sıralı ağır zırhlı yürüyüş (zıplama yok) + eldiven darbesi. */
  'taunt2',
  'guard2',
  'tremor2',
  'fistcrush2',
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
  /** Cutthroat: zehirli çift kesik, X çizen sıçrayış, kil duman bombası (iki tahta), arkaya ışınlanıp sırttan saplama. */
  'venomedge',
  'saltire',
  'smokebomb',
  'backstab',
] as const;

/** Kullanılmayan ama bilerek saklanan yedek efektler. */
export const BACKUP_VFX: readonly string[] = ['voidstrikespikes', 'holysword', 'woodsmash', 'taunt', 'guardlink', 'tremor', 'fistcrush'];

export type VfxKind = (typeof VFX_KINDS)[number];
