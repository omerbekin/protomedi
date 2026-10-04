/**
 * Placeholder ikon türleri (Phaser'a bağımlı değil; çizimleri src/game/icons.ts yapar).
 * Üç kullanım alanı: skill ikonları, class logoları ve stat ikonları.
 */
export const ICON_KINDS = [
  // skill ikonları
  'sword',
  'bigsword',
  'swirl',
  'shield',
  'holy',
  'cross',
  'burst',
  'hammer',
  'flame',
  'snow',
  'meteor',
  'barrier',
  'bone',
  'drain',
  'drop',
  'wail',
  'arrow',
  'pierce',
  'arrows',
  'target',
  'thorn',
  'leaf',
  'tree',
  'leaves',
  'fist',
  'bash',
  'roar',
  'guardian',
  'crush',
  'manaburn',
  'drainfield',
  'void',
  'rune',
  // class logoları
  'helm',
  'wizhat',
  'skull',
  'bow',
  'bulwark',
  'nullsphere',
  // stat ikonları
  'muscle',
  'wand',
  'feather',
  'clover',
  'boot',
  'blast',
  'heart',
  'droplet',
  'hourglass',
  'finger',
] as const;

export type IconKind = (typeof ICON_KINDS)[number];

export const isIconKind = (v: string): v is IconKind => (ICON_KINDS as readonly string[]).includes(v);
