/** 4 temel özellik: Strength (can, str skill hasarı), Intelligence (mana, int skill hasarı), Dexterity (hız, dex skill hasarı, dodge), Luck (kritik). */
export type Attribute = 'str' | 'int' | 'dex' | 'luck';

export interface Attributes {
  str: number;
  int: number;
  dex: number;
  luck: number;
}

/** Savaşta kullanılan stat'lar: temel özellikler + onlardan türeyenler (src/engine/stats.ts). */
export interface Stats extends Attributes {
  /** En yüksek can. */
  hp: number;
  /** En yüksek mana. */
  mp: number;
  spd: number;
  /** Her turun başında yenilenen MP (turns modunda). */
  mpRegen: number;
  /** Fiziksel zırh: hasarı yüzdesel azaltır (azalan getirili). */
  armor: number;
  /** Büyü zırhı: büyü hasarını yüzdesel azaltır. */
  magicArmor: number;
  critChance: number;
  /** Kritik vuruşta hasar/şifanın SON çarpanı (1,5 = %150). */
  critMult: number;
  /** Fiziksel saldırıdan kaçınma şansı. */
  dodge: number;
}

/** Pasif skill etkileri (her sınıfın 1 pasifi var; düz stat vermez, bir koşulda tetiklenir). */
export type PassiveEffect =
  /** Kullanıcının hasarı, eksik can oranıyla artar: x(1 + maxBonus * eksikCanOranı). */
  | { type: 'rage'; maxBonus: number }
  /** Kendi turunun başında en yaralı dostu (varsa) scale gücünün power katı iyileştirir. */
  | { type: 'divineLight'; power: number; scale: Attribute }
  /** Cooldown'lu bir hasar skill'i kullanınca `chance` ihtimalle o skill'in cooldown'u sıfırlanır. */
  | { type: 'spellEcho'; chance: number }
  /** Kullanıcı ile hedef arasındaki her sıra mesafesi için hasar +perRow (mesafe = kullanıcının sırası + hedefin sırası). */
  | { type: 'longshot'; perRow: number }
  /** Çağrı yapınca tüm dostlar scale gücünün power katı iyileşir. */
  | { type: 'verdantBlessing'; power: number; scale: Attribute }
  /** Verilen her hasarın `ratio` kadarı kullanıcıya şifa olur. */
  | { type: 'soulDrain'; ratio: number }
  /** Büyü zırhının engellediği büyü hasarı `threshold` birikince tüm takıma `mana` MP verilir. */
  | { type: 'manaOverflow'; threshold: number; mana: number }
  /** Kullanıcının ve 1 yarıçaplı (artı şekli) komşu dostların zırhı `armor` artar. */
  | { type: 'armorAura'; armor: number };

export interface PassiveDef {
  id: string;
  name: string;
  /** İkon türü (src/ui/icon-kinds.ts). */
  icon: string;
  /** Oyuncuya gösterilen açıklama (İngilizce). */
  text: string;
  effect: PassiveEffect;
}

/** data/classes/*.json ve data/summons/*.json şekli: elle yazılan veri (türev stat'lar yok). */
export interface CombatantData {
  id: string;
  name: string;
  spriteId: string;
  /** Çizim boyutu çarpanı (yoksa 1): büyük yaratıklar için. */
  spriteScale?: number;
  color: string;
  /** Class logosu (ikon türü, src/ui/icon-kinds.ts). */
  logo: string;
  /** Dizilimde sıra: küçük = daha önde (yakın dövüş / dayanıklı). */
  frontPriority: number;
  /** Seçim ekranında gösterilen klasman (yoksa ilk skill'in türüne göre Melee/Ranged/Caster). */
  role?: string;
  attributes: Attributes;
  armor: number;
  magicArmor: number;
  mpRegen: number;
  /** Türev stat'ları doğrudan ezmek için (ör. çağrılan birimin canı). */
  overrides?: Partial<Stats>;
  tags?: string[];
  /** data/ai.json profil adı (yapay zeka bu karakteri nasıl oynatır). */
  ai?: string;
  skills: string[];
  passive?: PassiveDef;
}

/** Çalışma zamanı tanımı: veri + türetilmiş stat'lar. */
export interface CombatantDef {
  id: string;
  name: string;
  spriteId: string;
  /** Çizim boyutu çarpanı (yoksa 1): büyük yaratıklar için. */
  spriteScale?: number;
  color: string;
  logo: string;
  frontPriority: number;
  role?: string;
  attributes: Attributes;
  stats: Stats;
  skills: string[];
  tags?: string[];
  ai?: string;
  passive?: PassiveDef;
}

export type Element = 'physical' | 'fire' | 'ice' | 'holy' | 'dark' | 'nature' | 'arcane';

export type SkillTarget = 'single_enemy' | 'all_enemies' | 'area_enemies' | 'column_enemies' | 'everyone' | 'random_enemies' | 'single_ally' | 'dead_ally' | 'all_allies' | 'self';

export type SkillEffectKind =
  | {
      type: 'damage';
      damageType: 'physical' | 'magic';
      /** Hasarın elementi (yalnızca renk/yazı için); yoksa fiziksel. */
      element?: Element;
      /** Hasarın hangi temel özelliğe bağlı olduğu. */
      scale: Attribute;
      power: number;
      /** 0-1: hedefin zırhının yok sayılan kısmı. */
      ignoreDefense?: number;
      /** 0-1: verilen hasarın bu kadarı kullanıcıya şifa olur. */
      lifesteal?: number;
      bonusVsTag?: { tag: string; multiplier: number };
      /** Çok hedefli vuruşta (ör. şerit skill'i) her yeni hedef bir öncekinin bu katı kadar hasar alır (hedef sırası: öndekinden arkadakine). */
      falloff?: number;
      /** Hedefin eksik mana başına eklenen hasar. */
      bonusPerMissingMana?: number;
      /** Kullanıcının kalkanından eklenen hasar (ratio) ve kalkanın tüketilip tüketilmeyeceği. */
      bonusFromShield?: { ratio: number; consume: boolean };
    }
  | { type: 'heal'; scale: Attribute; power: number }
  /** Düşmüş bir dostu bulunduğu yerde diriltir: maks canının/manasının bu oranlarıyla (hedef 'dead_ally'). */
  | { type: 'revive'; hpRatio: number; mpRatio: number }
  /** Tur bazlı şifa: hedefin sonraki `turns` turunun başında `power` kadar iyileştirir. */
  | { type: 'hot'; scale: Attribute; power: number; turns: number }
  | { type: 'shield'; scale: Attribute; power: number; shieldType?: 'magic'; /** Kullanıcının kalan MP'si başına eklenen kalkan. */ bonusPerMana?: number; /** true: kalkan hedefe değil kullanıcının kendisine gider (ör. Shield Bash). */ self?: boolean }
  | { type: 'summon'; unit: string; lifespan?: number; /** true: birim düşmanın tahtasına çağrılır (sahibi yine kullanıcının tarafı). */ onEnemyBoard?: boolean }
  | { type: 'manaBurn'; amount: number; /** Yakılan mananın bu oranı kullanıcıya geri verilir. */ gainRatio?: number }
  /** Kullanıcı `turns` tur boyunca düşmanların tek hedefli skill'lerinin hedefi olmak zorunda. */
  | { type: 'taunt'; turns: number; /** Taunt'lı karakter maks canının bu oranı kadar can kaybederse taunt biter. */ breakRatio?: number; /** Taunt sürerken taunt'lı olmayan dostların aldığı hasar bu çarpanla çarpılır (ör. 0.5 = yarı hasar). */ allyDamageMult?: number }
  /** Hedef dost `turns` tur boyunca aldığı hasarın `share` kadarını kullanıcıya aktarır. */
  | { type: 'guard'; turns: number; share: number }
  /** Hasar alan (hedefler arasında vurulan) birimlere ya da `self` ise kullanıcıya süreli durum (buff/debuff) verir. */
  | { type: 'status'; status: StatusKind; turns: number; self?: boolean }
  /** Skill'in kapsadığı hücrelere `turns` turluk yer etkisi (zehir, yanan zemin...) bırakır. */
  | { type: 'ground'; ground: string; turns: number; scale: Attribute; power: number }
  /** Kullanıcı kendine maks canının `ratio` kadarını hasar verir (canı en az 1 kalır). */
  | { type: 'selfDamage'; ratio: number };

/**
 * `side`: 'everyone' hedefli skill'lerde etkinin hangi tarafa gideceği (varsayılan: hasar/mana yakma/durum düşmana, şifa/kalkan/koruma dosta).
 */
export type SkillEffect = SkillEffectKind & { side?: 'allies' | 'enemies' };

export interface SkillCost {
  resource: 'mp' | 'hp';
  amount: number;
}

/** Görsel ipucu + menzil: melee = hedefe atılır VE yalnızca en öndeki birimlere vurur, ranged = mermi, cast = büyü hazırlığı, sky = yukarıdan düşer. */
export type SkillMotion = 'melee' | 'ranged' | 'cast' | 'sky' | 'ground' | 'whip';

/** 'sky' hareketinde yukarıdan düşen şeyin türü. */
export type SkyFx = 'arrows' | 'shards' | 'meteor' | 'void' | 'light' | 'fist';

/** data/skills.json girdisi. */
export interface SkillDef {
  id: string;
  name: string;
  target: SkillTarget;
  cost: SkillCost;
  motion: SkillMotion;
  /** motion 'sky' ise düşen şeyin türü. */
  skyFx?: SkyFx;
  /** Placeholder ikon türü (src/ui/icon-kinds.ts). */
  icon: string;
  fx: string;
  effects: SkillEffect[];
  /** Kullanıldıktan sonra kullanıcının kaç tur boyunca tekrar kullanamayacağı (yoksa 0). Yalnızca turns modunda. */
  cooldown?: number;
  /** true: yakın dövüş skill'i olsa da kullanıcının ön sırada olma şartı aranmaz (ileride dash/charge gibi skill'ler için). */
  ignoreFrontRow?: boolean;
  /** true: yakın dövüş skill'i menzil sınırı olmadan (ön sıra kuralı olmadan) herhangi bir düşmana gider (charge/dash). */
  ignoreReach?: boolean;
  /** Yakın dövüş menzili bonusu (satır): kullanıcı ön sıranın bu kadar gerisinden de vurabilir ve düşmanın bu kadar fazla ön sırasına ulaşır. */
  reach?: number;
  /** Animasyonun çaldığı ses efektleri (data/audio.json adları); vfx yalnızca bu listedekileri çalar. */
  sfx?: string[];
  /** Skill efekti (animasyon) adı: src/ui/vfx-kinds.ts; yoksa `motion`/`skyFx` genel animasyonu oynar. */
  vfx?: string;
  /** target 'random_enemies': kaç (farklı) rastgele düşmana gider. */
  count?: number;
  /** true: yukarıdan düşen etki her hedefe ayrı değil, seçilen alanın merkezine TEK büyük olarak düşer. */
  skyCenter?: boolean;
  /** Yukarıdan düşen etki hedeflere sırayla, rastgele sırada ve bu kadar ms arayla başlar (öncekinin bitmesi beklenmez). */
  skyStagger?: number;
  /** target 'area_enemies': oyuncu merkez birimi seçer. radius 1: merkez + önü/arkası/sağı/solu (artı şekli); radius 2: öne/arkaya/sağa/sola 2'şer + çaprazlara 1'er. */
  area?: { radius: 1 | 2 };
}

export interface Formulas {
  attributes: {
    hpBase: number;
    hpPerStr: number;
    mpBase: number;
    mpPerInt: number;
    spdBase: number;
    spdPerDex: number;
    dodgePerDex: number;
    critChanceBase: number;
    critChancePerLuck: number;
    critMultBase: number;
    critMultPerLuck: number;
  };
  /** Özellik başına skill gücü katsayısı (hasar, şifa, kalkan). */
  scaling: Record<Attribute, number>;
  /** Zırh azalması = armor / (armor + k). */
  armor: { k: number };
  damage: { variance: number; minDamage: number };
  heal: { variance: number; minHeal: number };
  summon: { damageTakenMultiplier: number };
  /** Tür etiketine (tags) göre element hassasiyeti: weaknesses[etiket][element] = alınan hasar çarpanı. */
  weaknesses: Record<string, Partial<Record<Element, number>>>;
  /** Dizilim: `rows` sıra (derinlik, 0 = en önde) x `lanes` şerit; yuva = sıra * lanes + şerit. Yakın dövüş en öndeki `meleeRows` dolu sıraya vurabilir. */
  formation: { rows: number; lanes: number; meleeRows: number };
  turn: { threshold: number; queueLength: number };
}

/** turns = hıza göre sıralı gerçek oyun; test = sırasız, her karakter istediği an oynar (debug). */
export type BattleMode = 'turns' | 'test';

export type Side = 'party' | 'enemy';

export type StatusKind = 'taunt' | 'guard' | 'regen' | 'slow' | 'haste' | 'wound' | 'stun' | 'fortify' | 'blessed';

/** data/statuses.json girişi: veriyle tanımlı buff/debuff. */
export interface StatusDef {
  name: string;
  type: 'buff' | 'debuff';
  icon: string;
  color: string;
  text: string;
  speedMult?: number;
  damageTakenMult?: number;
  healTakenMult?: number;
  skipTurn?: boolean;
}

/** data/grounds.json girişi: yerde kalan etki türü. */
export interface GroundDef {
  name: string;
  color: string;
  /** Birimin can çubuğu yanındaki rozetin ikon türü. */
  icon: string;
  element: Element;
}

/** Yerde bırakılmış, süreli bir etki. */
export interface GroundEffect {
  id: string;
  ground: string;
  /** Hangi tahtanın hücrelerinde. */
  board: Side;
  slots: number[];
  turns: number;
  source: string;
  /** Etkiyi bırakanın tarafı (kendi tarafındaki birimler zarar görmez). */
  sourceSide: Side;
  /** Tik başına büyü hasarı (bırakıldığı andaki güçten sabitlenir). */
  amount: number;
}

/** Karakter üzerindeki süreli durum. `turns`, taşıyıcının kendi turunun başında azalır. */
export interface Status {
  kind: StatusKind;
  turns: number;
  /** Durumu uygulayan birimin uid'si. */
  source: string;
  /** regen: tur başına iyileştirme miktarı. */
  amount?: number;
  /** taunt: taunt'lı olmayan dostların aldığı hasarın çarpanı (taunt sürerken). */
  allyMult?: number;
  /** taunt: bu kadar can kaybedilirse (`taken` toplamı) taunt silinir. */
  breakAt?: number;
  taken?: number;
  /** guard: hasarın korumacıya aktarılan oranı. */
  share?: number;
  /** regen: iyileştirenin kritik değerleri (her tikte kritik zarı atılır). */
  critChance?: number;
  critMult?: number;
}

export interface Combatant {
  uid: string;
  defId: string;
  name: string;
  spriteId: string;
  /** Çizim boyutu çarpanı (yoksa 1): büyük yaratıklar için. */
  spriteScale?: number;
  color: string;
  logo: string;
  side: Side;
  /** Hangi tarafın tahtasında durduğu (çoğu zaman side; düşman tahtasına çağrılan birimlerde karşı taraf). */
  board: Side;
  slot: number;
  stats: Stats;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Her türlü hasarı emen kalkan (süre sınırı yok; tükenene kadar durur). */
  shield: number;
  /** Yalnızca büyü hasarını emen kalkan. */
  magicShield: number;
  statuses: Status[];
  tags: string[];
  skills: string[];
  summoned: boolean;
  /** Çağrılan birimin kalan tur sayısı (kendi turları). */
  lifespan: number | undefined;
  ai: string | undefined;
  passive?: PassiveDef;
  /** Bu birimi çağıran birim (çağrılanlarda). */
  owner?: string;
  /** Pasifin biriktirdiği değer (ör. manaOverflow'da engellenen büyü hasarı). */
  charge: number;
  /** Sıra sayacı: her tikte SPD kadar dolar, eşiğe ulaşınca oynar. */
  turnCounter: number;
  /** Beklemede olan skill'ler: skillId -> kalan tur (her kendi turunun başında 1 azalır). */
  cooldowns: Record<string, number>;
}

/** Motorun UI'a yayınladığı olay akışı. UI yalnızca bunları dinler. */
export type BattleEvent =
  | { type: 'battleStart'; seed: number; combatants: Combatant[] }
  | { type: 'skillUsed'; actor: string; skill: string; targets: string[]; /** Alan/şerit skill'inde seçilen merkez hücre. */ center?: number }
  | { type: 'resource'; actor: string; resource: 'mp' | 'hp'; amount: number; after: number }
  | {
      type: 'damage';
      source: string;
      target: string;
      /** Canı düşüren hasar (kalkanın emdiği hariç). */
      amount: number;
      absorbed: number;
      hpAfter: number;
      shieldAfter: number;
      magicShieldAfter: number;
      crit: boolean;
      /** Guard ile korumacıya aktarılan hasar. */
      redirected?: boolean;
    }
  | { type: 'dodge'; source: string; target: string }
  | { type: 'heal'; source: string; target: string; amount: number; hpAfter: number; crit: boolean }
  /** amount negatifse kalkan tüketildi (ör. Shield Crush). */
  | { type: 'shield'; source: string; target: string; amount: number; shieldAfter: number; magicShieldAfter: number; magic: boolean }
  | { type: 'manaBurn'; source: string; target: string; amount: number; mpAfter: number }
  | { type: 'status'; target: string; status: StatusKind; turns: number; source: string }
  | { type: 'statusEnd'; target: string; status: StatusKind; broken?: boolean }
  | { type: 'summon'; actor: string; combatant: Combatant }
  | { type: 'despawn'; target: string }
  /** Düşmüş bir birim olduğu yerde dirildi. */
  | { type: 'revive'; source: string; target: string; hpAfter: number; mpAfter: number }
  | { type: 'mpRegen'; actor: string; amount: number; after: number }
  /** Bir pasif tetiklendi (UI kısa bir yazı gösterir). */
  | { type: 'passive'; actor: string; passive: string; name: string }
  | { type: 'turnStart'; actor: string; queue: string[] }
  | { type: 'turnSkipped'; actor: string; stunned?: boolean }
  /** Yerde kalan bir etki bırakıldı / bitti. */
  | { type: 'ground'; id: string; ground: string; board: Side; slots: number[]; turns: number }
  | { type: 'groundEnd'; id: string }
  | { type: 'death'; target: string }
  | { type: 'battleEnd'; winner: Side };
