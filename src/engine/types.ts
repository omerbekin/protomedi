/** 4 temel özellik: Strength (can, str skill hasarı), Intelligence (mana, int skill hasarı), Dexterity (hız, dex skill hasarı), Luck (kritik). */
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
  /** Her turun başında yenilenen MP (turns modunda): Int x mpRegenPerInt (0 Int = 0). */
  mpRegen: number;
  /** Her turun başında yenilenen düz can (turns modunda): Str x hpRegenPerStr (yuvarlanarak uygulanır). */
  hpRegen: number;
  /** Fiziksel zırh: hasarı yüzdesel azaltır (azalan getirili). */
  armor: number;
  /** Büyü zırhı: büyü hasarını yüzdesel azaltır. */
  magicArmor: number;
  /** Kritik şansı: critChanceBase + critChancePerLuck x Luck. */
  critChance: number;
  /** Kritik vuruşta hasar/şifanın SON çarpanı: SABİT (formulas.json > attributes.critMult), hiçbir statla artmaz. */
  critMult: number;
  /** İsabet (accuracy): accuracyBase + accuracyPerLuck x Luck. Hit şansı = accuracy - hedefin evasion'ı (sınırlı). */
  accuracy: number;
  /** Kaçınma (evasion): floor(Dex / dexPerEvasionStep) x evasionPerStep (tam sayı adımlı), evasionMax'ı geçmez. */
  evasion: number;
  /** Class'ın primary statı (yoksa: çağrılan birim). */
  primary?: Attribute;
  /** Primary bonusu aktif mi: primary stat class'ın en yüksek statıysa (eşitlik dahil). */
  primaryActive: boolean;
  /** Str-primary bonusu (Resilience): karaktere uygulanan her debuff bu ihtimalle 1 tur kısalır (en az 1 kalır; 0 = yok). */
  resilience: number;
  /** Dex-primary bonusu (Hunter's Mark): hedefinden daha hızlıysa hasar veren vuruşlar bu oranda fazla vurur (0 = yok). */
  hunterMark: number;
  /** Int-primary bonusu (Mana Echo): her skill kullanımından sonra bu ihtimalle MP bedelinin yarısı geri gelir (0 = yok). */
  manaEcho: number;
  /** Int ile ölçeklenen hasar/şifa/kalkan çarpanı (1 = bonus yok; şu an hiçbir bonus değiştirmez). */
  spellPowerMult: number;
  /** Luck-primary bonusu: ölümcül vuruşta bu ihtimalle 1 canla kurtulur (savaş başına bir kez; 0 = yok). */
  surviveChance: number;
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
  /** Kullanıcının KENDİ zırhının `pct` kadarı, kendine ve 1 yarıçaplı (artı şekli) komşu dostlara bonus zırh olur; bir birim en fazla `maxStacks` kaynaktan alır. */
  | { type: 'armorAura'; pct: number; maxStacks: number };

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
  /** Class'ın primary statı (toplam stat 30 kuralı ve primary bonusu yalnızca class'larda). */
  primary?: Attribute;
  armor: number;
  magicArmor: number;
  /** Sınıfa özel taban isabet (yoksa formulas.json > attributes.accuracyBase; şu an hiçbir class'ta tanımlı değil). */
  accuracyBase?: number;
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
  primary?: Attribute;
  stats: Stats;
  skills: string[];
  tags?: string[];
  ai?: string;
  passive?: PassiveDef;
}

export type Element = 'physical' | 'fire' | 'ice' | 'holy' | 'dark' | 'nature' | 'arcane';

export type SkillTarget = 'single_enemy' | 'all_enemies' | 'area_enemies' | 'column_enemies' | 'everyone' | 'random_enemies' | 'single_ally' | 'dead_ally' | 'all_allies' | 'self';

/**
 * Bahis (gamble): hasar etkisi atılmadan önce kullanıcı kaynağından (can ya da MP) bir miktarı BAHSE koyar ve bir zar atılır (seed'li RNG, skill başına bir kez).
 * Kazanırsa hasar `winMult + perStake x bahis` katı, kaybederse `loseMult` katı (varsayılan 1; 0 = iska) olur ve bahis kaybedilir (kazanırsa bahis geri kalır).
 * Bahis: `hp` ise maks canın `ratio` kadarı (en fazla canı 1 bırakır), `mp` ise kullanılan skill'in bedeli düşüldükten sonra KALAN MP'nin `ratio` kadarı.
 */
export interface BetSpec {
  resource: 'hp' | 'mp';
  ratio: number;
  winChance: number;
  winMult: number;
  loseMult?: number;
  /** Bahse konan her can/MP birimi için kazanç çarpanına eklenen miktar. */
  perStake?: number;
}

/** randomStatus seçeneği: `weight` ağırlıklı zarla seçilen durum. */
export interface RandomStatusOption {
  status: StatusKind;
  turns: number;
  weight: number;
}

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
      /** 0-1: her hedefe vuruştan sonra bu ihtimalle AYNI vuruş bir kez daha tekrarlanır (çifte vuruş; seed'li RNG). */
      repeatChance?: number;
      /** Bahis: kaynak harcayarak daha fazla hasar (yukarıda BetSpec). */
      bet?: BetSpec;
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
  /** Vurulan (hasar yoksa tüm) hedeflerin HER BİRİNE ağırlıklı zarla seçilen tek bir durum verir (seed'li RNG). */
  | { type: 'randomStatus'; options: RandomStatusOption[] }
  /** Skill'in kapsadığı hücrelere `turns` turluk yer etkisi (zehir, yanan zemin...) bırakır. */
  | { type: 'ground'; ground: string; turns: number; scale: Attribute; power: number }
  /** Kullanıcı kendine maks canının `ratio` kadarını hasar verir (canı en az 1 kalır). */
  | { type: 'selfDamage'; ratio: number }
  /**
   * Kullanıcıya `turns` turluk dikenli durum (thorns): kullanıcıya YAKIN DÖVÜŞ (motion 'melee') vuruşu isabet edince saldırgan,
   * scale statı x power kadar sabit fiziksel hasar alır (zırh etkiler; isabet/kritik/sapma yok). Yansıma yansımayı tetiklemez.
   */
  | { type: 'thorns'; turns: number; scale: Attribute; power: number };

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
  /**
   * target 'single_enemy': seçilen hedefe ek olarak onun yanındaki hücrelere de (`mult` x hasar, varsayılan 1) vurur.
   * pattern 'perpendicular': hedefin aynı sıradaki sol ve sağ şerit komşuları (saldırı ön-arka ekseninde geldiği için yan hücreler).
   */
  splash?: { pattern: 'perpendicular'; mult?: number };
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
    critChanceBase: number;
    critChancePerLuck: number;
    /** Kritik çarpanı: SABİT (luck artırmaz). */
    critMult: number;
    /** Her Str için tur başı düz can yenilenmesi (turns modu). */
    hpRegenPerStr: number;
    /** Her Int için tur başı MP yenilenmesi (turns modu); 0 Int = 0. */
    mpRegenPerInt: number;
    /** İsabet = accuracyBase + accuracyPerLuck x Luck. */
    accuracyBase: number;
    accuracyPerLuck: number;
    /** Kaçınma = min(evasionMax, floor(Dex / dexPerEvasionStep) x evasionPerStep): tam sayı adımlı, azalan getiri yok. */
    dexPerEvasionStep: number;
    evasionPerStep: number;
    evasionMax: number;
  };
  /** İsabet kontrolü: hit şansı = accuracy - evasion, [0, max] arasına sıkıştırılır (%0 olabilir). aiKillMin: yapay zekanın "öldürür" sayması için gereken en az hit şansı. */
  hit: { max: number; aiKillMin: number };
  /** Primary stat pasif bonusları (yalnızca class'ın en yüksek statı primary ise aktif). */
  primaryBonus: {
    str: { resilienceChance: number };
    dex: { hunterMarkMult: number };
    int: { manaEchoChance: number };
    luck: { surviveChance: number };
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
  formation: {
    rows: number;
    lanes: number;
    meleeRows: number;
    /** Yan vuruş komşuluğu (ekran geometrisinden, bkz. formation.ts): tahta başına her hücrenin üst/alt komşu adayları. Yoksa eski kural (aynı sıra, şerit farkı 1). */
    sideNeighbors?: { maxDx: number; party: { up: number[]; down: number[] }[]; enemy: { up: number[]; down: number[] }[] };
  };
  turn: { threshold: number; queueLength: number };
}

/** turns = hıza göre sıralı gerçek oyun; test = sırasız, her karakter istediği an oynar (debug). */
export type BattleMode = 'turns' | 'test';

export type Side = 'party' | 'enemy';

export type StatusKind = 'taunt' | 'guard' | 'regen' | 'slow' | 'haste' | 'wound' | 'stun' | 'fortify' | 'blessed' | 'thorns';

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
  /** Tik başına ham büyü hasarı (bırakıldığı andaki kaynak statından sabitlenir; kaynak ölse de bu kullanılır). Hedefin büyü zırhı tik anında uygulanır. */
  amount: number;
  /** Skill'in ölçek statı ve bırakıldığı andaki o statın değeri (bilgi amaçlı snapshot). */
  scale?: Attribute;
  sourceStat?: number;
  power?: number;
}

/** Karakter üzerindeki süreli durum. `turns`, taşıyıcının kendi turunun başında azalır. */
export interface Status {
  kind: StatusKind;
  turns: number;
  /** Durumu uygulayan birimin uid'si. */
  source: string;
  /** regen: tur başına iyileştirme miktarı; thorns: yansıyan sabit hasar (zırhtan önce). */
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
