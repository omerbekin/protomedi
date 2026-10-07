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
  | { type: 'armorAura'; pct: number; maxStacks: number }
  /** Opportunist (Cutthroat): hasar verdiği hedefin üzerinde `statuses` listesindeki durumlardan biri varsa verilen hasar x(1 + bonus) (tüm vuruşlar; kritik ayrıca son çarpan). */
  | { type: 'bonusVsStatus'; statuses: StatusKind[]; bonus: number };

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
  /** true: oyuncuya görünmez (takım seçimi ve wiki dışı; debug ve galeri yine erişir). */
  hidden?: boolean;
  /** true: test amaçlı class (AOE şekil test karakteri): rastgele takım havuzundan ve denge simülasyonundan HARİÇ; takım seçiminde/debug'da seçilebilir, wiki/galeride görünür. */
  testOnly?: boolean;
  /** Sınıfın özel kaynağı: 'rage' ise birim Rage barıyla (0-formulas.rage.max) savaşa başlar; yoksa Rage yoktur. */
  resource?: 'rage';
  armor: number;
  magicArmor: number;
  /** Sınıfa özel taban isabet (yoksa formulas.json > attributes.accuracyBase; şu an hiçbir class'ta tanımlı değil). */
  accuracyBase?: number;
  /** Türev stat'ları doğrudan ezmek için (ör. çağrılan birimin canı). */
  overrides?: Partial<Stats>;
  /** Çağrı varyantları (yalnızca çağrılar; bkz. SummonVariants): ceset tüketen çağrıda beslenmiş / beslenmemiş hâlin stat çarpanı. */
  variants?: SummonVariants;
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
  /** true: test amaçlı class (rastgele havuz ve denge simülasyonu dışı). */
  testOnly?: boolean;
  /** true: oyuncuya görünmez (takım seçimi ve wiki dışı). */
  hidden?: boolean;
  stats: Stats;
  /** Rage'li class: Rage barının üst sınırı (formulas.json > rage.max); Rage'siz class'ta tanımsız. */
  maxRage?: number;
  skills: string[];
  tags?: string[];
  ai?: string;
  passive?: PassiveDef;
  /** Çağrı varyantları (CombatantData.variants aynen). */
  variants?: SummonVariants;
}

/** Çağrı varyantı: `mult` can (maks can) ve hasar statlarına (str, int; Str'den gelen düz can yenilenmesi dahil) uygulanan çarpan. */
export interface SummonVariant {
  mult: number;
}

/**
 * Ceset tüketen çağrının (Raise Dead) iki hâli: `fed` = ceset tüketildi (beslenmiş, `empowered`), `unfed` = ceset yoktu. Birim verisindeki taban statlar
 * (overrides dahil) x mult; yuvarlama: can tam sayıya, statlar 0,1'e (Math.round). Ceset tüketmeyen çağrılarda varyant uygulanmaz (taban statlar).
 */
export interface SummonVariants {
  fed: SummonVariant;
  unfed: SummonVariant;
}

/** Ceset durumu: revivable = diriltilebilir (Resurrection), consumed = tüketildi (Raise Dead), artık diriltilemez ve yuvası rezerve değildir. */
export type CorpseState = 'revivable' | 'consumed';

/** Ölü (çağrı olmayan) birimin cesedi: `battle.corpses(side)` / `battle.corpseOf(uid)`. */
export interface Corpse {
  uid: string;
  slot: number;
  side: Side;
  state: CorpseState;
}

/**
 * Ceset tüketen çağrının (Raise Dead) seçebileceği bir düşman cesedi (`battle.corpseChoices`): `danger` = o birim diriltilirse karşı takıma vereceği
 * değer (yüksek = tüketmek daha değerli; yapay zeka en yükseğini seçer), `why` = hesabın okunur gerekçesi (maç kaydı/tooltip).
 */
export interface CorpseChoice {
  uid: string;
  slot: number;
  name: string;
  danger: number;
  why: string;
}

export type Element = 'physical' | 'fire' | 'ice' | 'holy' | 'dark' | 'nature' | 'arcane';

/**
 * Hedef türleri. Eski `column_enemies` kaldırıldı (şerit = `area_enemies` + `area: { shape: 'column' }`); veride kalırsa veri doğrulaması
 * (skillAreaProblem, tests/content.test.ts) reddeder.
 */
export type SkillTarget = 'empty_tile' | 'single_enemy' | 'all_enemies' | 'area_enemies' | 'area_any' | 'everyone' | 'random_enemies' | 'single_ally' | 'dead_ally' | 'all_allies' | 'self';

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
      /** true: bu hasarın HER vuruşu kritiktir (kritik zarı atılmaz, kritik çarpanı uygulanır); isabet zarı normal atılır (iska olabilir). Backstab. */
      guaranteedCrit?: boolean;
    }
  | { type: 'heal'; scale: Attribute; power: number }
  /**
   * Düşmüş bir dostu bulunduğu yerde diriltir: maks canının/manasının bu oranlarıyla (hedef 'dead_ally').
   * `regen` (isteğe bağlı): dirilen birim sonraki `turns` turunun başında maks canının `ratio` kadarını yeniler (durum 'regen', `cause: 'revival'`;
   * miktar diriltme anında sabitlenir, kritik yok, can maks'ı aşmaz; buff olduğu için Resilience etkilemez).
   */
  | { type: 'revive'; hpRatio: number; mpRatio: number; regen?: { turns: number; ratio: number } }
  /** Tur bazlı şifa: hedefin sonraki `turns` turunun başında `power` kadar iyileştirir. */
  | { type: 'hot'; scale: Attribute; power: number; turns: number }
  | { type: 'shield'; scale: Attribute; power: number; shieldType?: 'magic'; /** Kullanıcının kalan MP'si başına eklenen kalkan. */ bonusPerMana?: number; /** true: kalkan hedefe değil kullanıcının kendisine gider (ör. Shield Bash). */ self?: boolean }
  /**
   * Birim kullanıcının KENDİ tahtasında boş bir yuvaya çağrılır (`battle.summonSlots`: ölü dostun ayrılmış yuvası hariç). `consumeCorpse`: çağırmadan önce
   * karşı taraftaki tüketilebilir (revivable, çağrı olmayan) düşman cesetlerinden SEÇİLENİ tüketir (madde 230: oyuncu `corpseUid` ile seçer, ceset varken
   * zorunlu; yapay zeka en tehlikelisini seçer, `battle.corpseChoices`); ceset `consumed` olur, artık diriltilemez. Ceset tüketildiyse birim `fed`
   * varyantıyla (beslenmiş, `empowered`), hiç ceset yoksa `unfed` varyantıyla gelir (birim tanımındaki `variants`; bkz. CombatantData.variants).
   */
  | { type: 'summon'; unit: string; lifespan?: number; consumeCorpse?: boolean }
  | { type: 'manaBurn'; amount: number; /** Yakılan mananın bu oranı kullanıcıya geri verilir. */ gainRatio?: number }
  /** Kullanıcı `turns` tur boyunca düşmanların tek hedefli skill'lerinin hedefi olmak zorunda. */
  | { type: 'taunt'; turns: number; /** Taunt'lı karakter maks canının bu oranı kadar can kaybederse taunt biter. */ breakRatio?: number; /** Taunt sürerken taunt'lı olmayan dostların aldığı hasar bu çarpanla çarpılır (ör. 0.5 = yarı hasar). */ allyDamageMult?: number }
  /** Hedef dost `turns` tur boyunca aldığı hasarın `share` kadarını kullanıcıya aktarır. */
  | { type: 'guard'; turns: number; share: number }
  /**
   * Hasar alan (hedefler arasında vurulan) birimlere ya da `self` ise kullanıcıya süreli durum (buff/debuff) verir.
   * `chance` (0-1, yoksa 1): her alıcı için BAĞIMSIZ zar (seed'li RNG; alıcı başına bir sayı). `cause`: durumun görsel nedeni, `status` olayına aynen yazılır
   * (ör. 'vines': sarmaşıkla yere bağlanma; UI 'rooted' görseli seçer).
   */
  | { type: 'status'; status: StatusKind; turns: number; self?: boolean; chance?: number; cause?: string }
  /** Vurulan (hasar yoksa tüm) hedeflerin HER BİRİNE ağırlıklı zarla seçilen tek bir durum verir (seed'li RNG). */
  | { type: 'randomStatus'; options: RandomStatusOption[] }
  /** Skill'in kapsadığı hücrelere `turns` turluk yer etkisi (zehir, yanan zemin...) bırakır. */
  | { type: 'ground'; ground: string; turns: number; scale: Attribute; power: number }
  /** Kullanıcı kendine maks canının `ratio` kadarını hasar verir (canı en az 1 kalır). */
  | { type: 'selfDamage'; ratio: number };

/**
 * `side`: 'everyone' hedefli skill'lerde etkinin hangi tarafa gideceği (varsayılan: hasar/mana yakma/durum düşmana, şifa/kalkan/koruma dosta).
 */
/** `area_any` hedefli skill'lerde de aynı alan: etki yalnızca alandaki o taraftaki birimlere (kullanıcıya göre dost/düşman) uygulanır (Smoke Bomb). */
export type SkillEffect = SkillEffectKind & { side?: 'allies' | 'enemies' };

export interface SkillCost {
  /** mp: mana; hp: can; rage: Rage barı (yalnızca Rage'li class'lar; yetmiyorsa kullanılamaz). */
  resource: 'mp' | 'hp' | 'rage';
  amount: number;
}

/** Görsel ipucu + menzil: melee = hedefe atılır VE yalnızca en öndeki birimlere vurur, ranged = mermi, cast = büyü hazırlığı, sky = yukarıdan düşer. */
export type SkillMotion = 'melee' | 'ranged' | 'cast' | 'sky' | 'ground' | 'whip';

/** 'sky' hareketinde yukarıdan düşen şeyin türü. */
export type SkyFx = 'arrows' | 'shards' | 'meteor' | 'void' | 'light' | 'fist';

/** Yapay zeka bağlam koşulu: içindeki tüm alanlar birlikte sağlanmalı (src/engine/ai.ts değerlendirir). */
export interface SkillAiCond {
  /** Seçenek en az bir düşmanı öldürüyor. */
  kill?: boolean;
  /** Seçenek en az bu kadar düşmana vuruyor (alan/rastgele skill'lerde hedef havuzu). */
  minTargets?: number;
  /** Sahada en az bu kadar canlı düşman var. */
  minLivingEnemies?: number;
  /** Sahada (kullanıcı dahil) en az bu kadar canlı dost var. */
  minLivingAllies?: number;
  /** Kullanıcının can oranı (şimdi) en az bu. */
  minSelfHpRatio?: number;
  /** Kullanıcının can oranı, skill'in can bedeli/kendine hasarı ödendikten SONRA en az bu. */
  minSelfHpRatioAfter?: number;
  /** Kullanıcının MP oranı (bedel ödenmeden) en az bu. */
  minSelfMpRatio?: number;
  /** Kullanıcının Rage'i (bedel ödenmeden) en az bu kadar (Rage'siz birimde sağlanmaz). */
  minSelfRage?: number;
  /** Savaşta oynanan toplam tur (tüm birimler) en az bu. */
  minBattleTurns?: number;
  /** Canı `woundedBelowRatio` altındaki en az bu kadar dost var. */
  minWoundedAllies?: number;
  woundedBelowRatio?: number;
  /** Ana hedefin fiziksel zırh azaltması (0-1) en az bu (ignoreDefense'in değer kattığı zırhlı hedef). */
  minTargetArmorReduction?: number;
  /** Ana hedefin (can + kalkan) / skill'in ortalama hasarı en az bu (yüksek canlı hedef). */
  minTargetHpToDamage?: number;
  /** Ana hedefe eksik mana ekinin ham hasar içindeki payı en az bu (bonusPerMissingMana). */
  minMissingManaShare?: number;
  /** Seçenek (area_any) en az bu kadar DOSTU kapsıyor (kendi tahtasına atılan alan). */
  minAllyTargets?: number;
  /** Ana hedefe beklenen hasar (isabet dahil) / hedefin maks canı en az bu (tek vuruşta canının büyük kısmı gider). */
  minTargetMaxHpShare?: number;
  /** Ana hedef, normal yakın dövüşün erişemediği bir sırada (ön sıranın gerisinde, korunan arka saf). */
  targetBehindFront?: boolean;
}

/** Skill'in YZ bağlamı: `requires` hepsi, `anyOf` (doluysa) en az biri sağlanmalı; sağlanmazsa skill yalnızca öldürücü vuruşta seçilebilir. */
export interface SkillAiHint {
  requires?: SkillAiCond;
  anyOf?: SkillAiCond[];
  /** Saf self-buff skill'inde: düşman takımının kullanıcıya vurma payı (0-1), savunma değeri hesabında. Varsayılan 0,4. */
  incomingShare?: number;
  /** Saf self-buff skill'inde: buff turu yerine yapılabilecek en iyi saldırının değerinin, buff'ın bedeline eklenecek payı (0-1). Varsayılan 0,5. */
  opportunityShare?: number;
  /** N: bu skill en geç N tur sonra hazır olacaksa ve MP'si yetebilecekse, ona yetecek MP'yi tüketecek saldırı skill'leri ertelenir (MP ayırma; yoksa ayırma yok). */
  reserveMp?: number;
}

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
  /**
   * Savaş başında bu skill zaten bu kadar tur bekleme sayacıyla başlar ("hazır değil"). Sayaç `cooldown` sayacıyla aynıdır
   * (kullanıcının kendi turlarında azalır). Yalnızca turns modunda ve class birimlerinde işler (çağrılanlarda ve test modunda yok).
   * Üst sınır: formulas.json > cooldown.maxInitial (3).
   */
  initialCooldown?: number;
  /** Yapay zeka bağlam ipucu: skill ne zaman EFEKTİF kullanılır (bkz. SkillAiHint). Yoksa yalnızca beklenen değere göre seçilir. */
  ai?: SkillAiHint;
  /** true (target 'single_ally'): kullanıcı KENDİNİ hedefleyemez (Guard: 'Cannot guard yourself'). */
  excludeSelf?: boolean;
  /** true: yakın dövüş skill'i olsa da kullanıcının ön sırada olma şartı aranmaz (ileride dash/charge gibi skill'ler için). */
  ignoreFrontRow?: boolean;
  /**
   * true (Backstab): yalnızca ARKASI BOŞ hedef seçilebilir: hedefin hemen arkasındaki hücre (bir sıra daha derin, aynı şerit, hedefin tahtasında)
   * tahtanın içinde olmalı ve üzerinde CANLI birim olmamalı (ceset / ölü dostun ayrılmış yuvası engel sayılmaz). Hedef en arka sıradaysa kullanılamaz.
   * skillUsed olayı `behindSlot`/`behindBoard` (görsel ışınlanma hücresi) ve `from` (kullanıcının dönüş hücresi) taşır; gerçek yer değiştirme yok.
   */
  requiresOpenBehind?: boolean;
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
  /**
   * target 'area_enemies' / 'area_any' (zorunlu): oyuncu bir ANCHOR hücre seçer (boş hücre de olabilir); şekil (hücre kümesi, bkz. area-shape.ts) row | column | rect | plus | x.
   * 'area_any': anchor KENDİ ya da KARŞI tahtada olabilir (Smoke Bomb); etkiler `side` ile dost/düşmana ayrılır.
   * İsteğe bağlı `stages`: şeklin hücreleri aşamalara bölünür, vuruşlar aşama sırasıyla gelir (olaylarda `stage`).
   */
  area?: AreaDef;
}

/**
 * Alan şekilleri (area-shape.ts): row = hedefin SIRASI (aynı derinlik), column = hedefin ŞERİDİ, rect = rows x cols dikdörtgen (boyutu 3+ olan eksende
 * fare hücresi ortada, diğer eksenlerde sol-alt köşe), plus = hedef + 4 yön komşusu, x = hedef + 4 ÇAPRAZ komşu.
 */
export type AreaShapeKind = 'row' | 'column' | 'rect' | 'plus' | 'x';

/**
 * Aşamalı vuruş (staged): şeklin hücreleri hangi eksende aşamalara bölünür.
 * row = sıra sıra (aynı derinlik bir aşama; varsayılan ön sıradan arkaya, yani saldırgandan uzağa);
 * column = şerit şerit (varsayılan ekranda yukarıdan aşağıya); distance = anchor hücreye uzaklık halkaları (varsayılan merkezden dışarı).
 */
export type AreaStageKind = 'row' | 'column' | 'distance';

export interface AreaDef {
  shape: AreaShapeKind;
  /** rect: dikdörtgenin sıra (derinlik) sayısı, 1..formation.rows. */
  rows?: number;
  /** rect: dikdörtgenin şerit sayısı, 1..formation.lanes. */
  cols?: number;
  /** rect: fare hücresinin dikdörtgendeki köşesi (şimdilik yalnızca ekranda sol-alt). */
  anchor?: 'bottom_left';
  /** Aşamalı vuruş ekseni (yoksa tüm hücreler aynı anda, tek aşama). */
  stages?: AreaStageKind;
  /** true: aşama sırası ters (row: arkadan öne; column: aşağıdan yukarı; distance: dıştan merkeze). */
  reverse?: boolean;
  /**
   * Anchor (merkez) hücredeki birim hasar etkilerinden bu kadar KEZ vurulur (varsayılan 1; her vuruş ayrı isabet/hasar/kritik zarı).
   * X şekli: "X çizilirken ortadan iki kez geçilir" = 2. Hasar dışı etkiler (durum vb.) bir kez uygulanır.
   */
  hitsAtCenter?: number;
}

/** Bir hücrenin ekran konumu (dizin, 0 tabanlı): col = soldan sağa (derinlik ekseni), row = yukarıdan aşağıya (şerit ekseni). */
export interface ScreenCell {
  col: number;
  row: number;
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
  /**
   * Rage (Warrior): her hasar veren ve İSABET eden vuruşta kazanç = min(perHitCap, hitBase + perHpPercent x vurulan hasarın hedefin maks canına yüzdesi).
   * Bir skill kullanımında (tüm vuruşlar bittikten sonra) toplam kazanç: her hedefe yapılan vuruşların kazancı toplanır, EN YÜKSEK hedefin toplamı alınır
   * (çok hedefli skill'de hedef sayısı kazancı artırmaz), perCastCap'i geçemez. Rage zamanla azalmaz; yalnızca skill hasarıyla kazanılır (alınan hasarla DEĞİL).
   */
  rage: { max: number; hitBase: number; perHpPercent: number; perHitCap: number; perCastCap: number };
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
    /**
     * Ekran ızgarası (layout koordinatlarından, formation.ts > computeScreenGrid): tahta başına her yuvanın EKRANDAKİ sütun (soldan sağa) ve satır (yukarıdan aşağıya) dizini.
     * 'rect' şeklinin "sol-alt" köşesi bu uzayda tanımlıdır; oyuncu ve düşman tarafı aynalı olduğu için aynı yuvanın ekran sütunu iki tarafta farklıdır. Yoksa rect şekli çalışmaz.
     */
    screenGrid?: { party: ScreenCell[]; enemy: ScreenCell[] };
  };
  turn: { threshold: number; queueLength: number };
  /** Cooldown kuralları: `maxInitial` = bir skill'in savaş başı başlangıç cooldown'unun (initialCooldown) üst sınırı. */
  cooldown: { maxInitial: number };
  /** Raise Dead ceset tehlikesi katsayıları (madde 230; battle.corpseChoices). Yoksa varsayılan hpRef 100, çarpanlar 1,5. */
  corpseDanger?: { hpRef: number; reviverMult: number; revivableMult: number };
}

/** Hasar olayının kaynağı (BattleEvent 'damage' > origin). */
export type DamageOrigin = 'skill' | 'ground' | 'status' | 'self';

/** turns = hıza göre sıralı gerçek oyun; test = sırasız, her karakter istediği an oynar (debug). */
export type BattleMode = 'turns' | 'test';

export type Side = 'party' | 'enemy';

/**
 * Durum türleri. 'thorns' (eski Thorn Shield) motorda ve veride KALDIRILDI (madde 222); ad yalnızca src/game/scenes/BattleScene.ts eski bir
 * `e.status === 'thorns'` karşılaştırması yaptığı için tür listesinde duruyor (ui-dev silince buradan da silinecek). Hiçbir skill/durum tanımı onu üretmez.
 */
export type StatusKind = 'taunt' | 'guard' | 'regen' | 'slow' | 'haste' | 'wound' | 'stun' | 'fortify' | 'blessed' | 'thorns' | 'blinded' | 'shrouded';

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
  /** true: bu durum bir birime uygulandığı AN o birimin kendi taunt'ı silinir (kontrol/CC durumu; şu an yalnızca Stun). Yeni durum eklemek tek satır. */
  breaksTaunt?: boolean;
  /** İsabete (accuracy) eklenen miktar (ör. Blinded -0,30). battle.effectiveStats uygular; hit şansı yine [0, hit.max] arasına sıkıştırılır. */
  accuracyDelta?: number;
  /** Kaçınmaya (evasion) eklenen miktar (ör. Shrouded +0,20; Dex'in evasionMax sınırı bu eke uygulanmaz). */
  evasionDelta?: number;
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
  /** Görsel/kaynak nedeni (status olayındaki `cause` ile aynı): ör. 'revival' = Resurrection sonrası yenilenme. */
  cause?: string;
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
  /** Ceset tüketen çağrıda: true = beslenmiş (ceset tüketildi, `fed` varyantı; UI mor parıltı), false = beslenmemiş (`unfed`). Diğer birimlerde tanımsız. */
  empowered?: boolean;
  /** Pasifin biriktirdiği değer (ör. manaOverflow'da engellenen büyü hasarı). */
  charge: number;
  /** Sıra sayacı: her tikte SPD kadar dolar, eşiğe ulaşınca oynar. */
  turnCounter: number;
  /** Beklemede olan skill'ler: skillId -> kalan tur (her kendi turunun başında 1 azalır). */
  cooldowns: Record<string, number>;
  /** Rage (yalnızca Rage'li class'ta; diğerlerinde tanımsız): mevcut değer ve üst sınır. Savaş başında 0. */
  rage?: number;
  maxRage?: number;
}

/** Aşamalı alan skill'inin bir aşaması (skillUsed.stages): o aşamanın hücreleri (boşlar dahil) ve vurulacak birimler. Dizin = aşama numarası. */
export interface AreaStage {
  cells: number[];
  targets: string[];
}

/**
 * Motorun UI'a yayınladığı olay akışı. UI yalnızca bunları dinler.
 * `stage`: aşamalı (area.stages) alan skill'inde, o aşamanın vuruşu sırasında çıkan HER olay (damage, dodge, miss, status, ground, ölüm,
 * lifesteal şifası, pasif...) aşama numarasını taşır (0 = ilk aşama). Olaylar aşama sırasıyla gelir; aşama gecikmesi/animasyonu UI işidir.
 */
export type BattleEvent = BattleEventBody & { stage?: number };

type BattleEventBody =
  | { type: 'battleStart'; seed: number; combatants: Combatant[] }
  | {
      type: 'skillUsed';
      actor: string;
      skill: string;
      targets: string[];
      /** Alan skill'inde seçilen merkez (anchor) hücre. */
      center?: number;
      /** Alan skill'inde seçilen anchor hücre (center ile aynı). */
      anchor?: number;
      /** Alan skill'inde kapsanan TÜM hücreler (boş olanlar dahil, yuva sırasıyla; hedef tahtasında). */
      cells?: number[];
      /** Yalnızca aşamalı alan skill'inde: aşamalar sırayla (dizin = sonraki olaylardaki `stage`); her aşamanın hücreleri ve hedefleri. */
      stages?: AreaStage[];
      /** area_any skill'inde alanın atıldığı tahta (kendi ya da karşı taraf); diğer alan skill'lerinde hep karşı tahta (alan yok). */
      board?: Side;
      /**
       * requiresOpenBehind (Backstab): kullanıcının GÖRSEL olarak ışınlandığı hücre (hedefin hemen arkası) ve tahtası; `from` kullanıcının
       * kendi (dönüş) hücresi. Görsel: arkaya ışınlan, vur, geri dön. Gerçek yer değiştirme YOK (formasyon değişmez).
       */
      behindSlot?: number;
      behindBoard?: Side;
      from?: number;
      /** Çağrı skill'inde: çağrının geleceği (kullanıcının kendi tahtasındaki) yuva. */
      slot?: number;
      /** Ceset tüketen çağrıda (Raise Dead): tüketilen cesedin uid'si (ceset yoksa tanımsız). */
      corpseUid?: string;
    }
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
      /**
       * Hasarın kaynağı (UI yazı/ikon için): 'skill' = skill vuruşu (guard aktarımı dahil), 'ground' = yer etkisi tiki (zehir/yanma/holy fire;
       * `ground` türü + `groundId` örneği), 'status' = durum kaynaklı tik (şu an yok; ileride DoT), 'self' = kendine hasar (selfDamage, kaybedilen can bahsi).
       */
      origin?: DamageOrigin;
      /** Hasarın elementi (skill etkisinin `element`'i ya da yer etkisinin elementi; yoksa 'physical'). */
      element?: Element;
      /** Fiziksel / büyü (zırh türü). */
      damageType?: 'physical' | 'magic';
      /** origin 'ground': yer etkisi türü (data/grounds.json anahtarı: poison | burning | holy_fire) ve örnek kimliği (ground olayındaki id). */
      ground?: string;
      groundId?: string;
    }
  /**
   * İska (tek zardan ayrıştırılır): 'dodge' = hedefin KAÇINMASI yüzünden vurulamadı (UI: hedefin üstünde "Dodge");
   * 'miss' = saldıranın İSABETİ (accuracy) yetmediği için vurulamadı (UI: saldıranın üstünde "MISS"). İkisinde de `source` saldıran, `target` hedef.
   */
  | { type: 'dodge'; source: string; target: string }
  | { type: 'miss'; source: string; target: string }
  | { type: 'heal'; source: string; target: string; amount: number; hpAfter: number; crit: boolean }
  /** amount negatifse kalkan tüketildi (ör. Shield Crush). */
  | { type: 'shield'; source: string; target: string; amount: number; shieldAfter: number; magicShieldAfter: number; magic: boolean }
  | { type: 'manaBurn'; source: string; target: string; amount: number; mpAfter: number }
  /** `cause`: skill etkisinin görsel nedeni (ör. 'vines' = sarmaşıkla yere bağlandı; UI 'rooted' görseli). Yoksa sıradan durum. */
  | { type: 'status'; target: string; status: StatusKind; turns: number; source: string; cause?: string }
  | { type: 'statusEnd'; target: string; status: StatusKind; broken?: boolean }
  /** `empowered`: yalnızca ceset tüketen çağrıda (Raise Dead): true = ceset tüketildi, beslenmiş (fed) çağrı; false = beslenmemiş (unfed). `combatant.empowered` aynı. */
  | { type: 'summon'; actor: string; combatant: Combatant; empowered?: boolean }
  /** Bir ceset tüketildi (Raise Dead): `uid` ölü birim, `by` tüketen, `slot` cesedin yuvası, `side` cesedin tarafı. Ceset artık `consumed`: diriltilemez, yuvası rezerve değil. */
  | { type: 'corpseConsumed'; uid: string; by: string; slot: number; side: Side }
  | { type: 'despawn'; target: string }
  /** Düşmüş bir birim olduğu yerde dirildi. */
  | { type: 'revive'; source: string; target: string; hpAfter: number; mpAfter: number }
  | { type: 'mpRegen'; actor: string; amount: number; after: number }
  /** Rage değişimi (yalnızca Rage'li birim): delta + = kazanç (skill hasar verince), - = bedel (Abyssal Cry); after = yeni değer, max = üst sınır. */
  | { type: 'rage'; actor: string; delta: number; after: number; max: number }
  /** Global skill kullanıldı (rest / skip_turn / move_tile); ayrıntı olayları (mpRegen, turnSkipped, moved) hemen arkasından gelir. */
  | { type: 'globalUsed'; actor: string; id: string }
  /** Birim kendi tarafındaki boş yuvaya geçti (Move Tile); yeni yuva Combatant.slot'ta da güncellenir. */
  | { type: 'moved'; actor: string; from: number; to: number }
  /** Bir pasif tetiklendi (UI kısa bir yazı gösterir). */
  | { type: 'passive'; actor: string; passive: string; name: string }
  | { type: 'turnStart'; actor: string; queue: string[] }
  /** stunned: sersemlediği için oynayamadı; voluntary: Skip Turn global skill'i ile isteyerek geçti (speedBoost: sonraki tura kadar hız desteği, 1 = +%100; `battle.speedBoostOf(uid)` aynı değeri verir); ikisi de yoksa: yapacak hamlesi olmadığı için pas. */
  | { type: 'turnSkipped'; actor: string; stunned?: boolean; voluntary?: boolean; speedBoost?: number }
  /** Yerde kalan bir etki bırakıldı / bitti. */
  | { type: 'ground'; id: string; ground: string; board: Side; slots: number[]; turns: number }
  | { type: 'groundEnd'; id: string }
  /** `corpse`: true = ölen birim ceset bıraktı (çağrı değil; `battle.corpseOf(uid)` durumu 'revivable'); çağrının ölümünde false. */
  | { type: 'death'; target: string; corpse?: boolean }
  | { type: 'battleEnd'; winner: Side };

/**
 * Global skill: her birimin class skill'lerine EK kullanabildiği ortak eylemler (data/global-skills.json). Skill listesinde (class'ın 4 skill'i) yer almaz.
 * kind: rest (MP kazan), skip (turu geç, sonraki tura kadar %100 hız desteği), move (kendi tarafındaki boş yuvaya geç; target 'empty_tile').
 */
export interface GlobalSkillDef {
  id: string;
  name: string;
  /** İkon türü (src/ui/icon-kinds.ts). */
  icon: string;
  kind: 'rest' | 'skip' | 'move';
  /** self: hedef yok; empty_tile: kendi tarafındaki boş (canlı olmayan) bir yuva seçilir. */
  target: 'self' | 'empty_tile';
  /** rest: kazanılan MP (maks MP'yi aşmaz). */
  mp?: number;
  /** skip: bir sonraki tura kadar hız desteği (1 = +%100: sayaç iki kat hızlı dolar; Haste/Slow ile toplamsal). */
  speedBonus?: number;
  /** skip: üst üste en çok kaç kez kullanılabilir (sonra normal bir eylem gerekir). */
  maxConsecutive?: number;
  /** true: yalnızca turns modunda anlamlı (test modunda devre dışı). */
  turnsOnly?: boolean;
  /** Oyuncuya gösterilen kısa açıklama (İngilizce); sayılar skill-info tarafından veriden eklenir. */
  text: string;
}

/** Bir birimin yapabileceği tek bir eylem (battle.act girdisi; yapay zeka seçimi de bu şekle çevrilir). */
export type BattleAction =
  | { kind: 'skill'; skillId: string; targetUid?: string; slot?: number; /** area_any: anchor hücrenin tahtası (yoksa karşı taraf; `targetUid` canlı birimse onun tahtası, `tile:<yuva>` ise kendi tahtası). */ board?: Side; /** Ceset tüketen çağrı (Raise Dead): tüketilecek düşman cesedi (ceset varken zorunlu). */ corpseUid?: string }
  | { kind: 'global'; id: string; slot?: number; /** Move Tile: slot yerine `tile:<yuva>` kimliği de kabul edilir. */ targetUid?: string };

/** battle.listActions satırı: bir eylem ve şu an kullanılabilir olup olmadığı. */
export interface ActionInfo {
  kind: 'skill' | 'global';
  id: string;
  ok: boolean;
  reason?: string;
  /** Yalnızca Move Tile: seçilebilecek boş yuvalar (küçükten büyüğe). */
  slots?: number[];
}
