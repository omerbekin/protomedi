import { tileUid, type Battle } from './battle';
import { shapeLabel } from './area-shape';
import { skillCostAmount } from './cost';
import { betStake } from './gamble';
import { previewForTargets } from './preview';
import { armorReduction, attributePower, hitChance } from './stats';
import type { Combatant, CorpseChoice, Side, SkillDef } from './types';
import { DEFAULT_VALUE, ValueContext, pAtLeast, skillRawValue, type AiDifficulty, type AiDifficultyConfig, type AiValueConfig } from './ai-value';

export type { AiDifficulty, AiDifficultyConfig, AiValueConfig } from './ai-value';

/**
 * Yapay zeka: sırası gelen aktör için bir skill ve hedef seçer. Saf ve belirleyici:
 * rastgelelik kullanmaz, motorun RNG'sine dokunmaz; aynı durum = aynı karar.
 * KARAR: TEK DEĞER TERAZİSİ (ai-priorities.md 6.1, madde 254/257; src/engine/ai-value.ts): her aday tek bir can-eşdeğer puan alır, en büyüğü seçilir.
 * Profil öncelik listesi (data/ai.json > priorities) artık seçimi YÖNETMEZ; yalnızca açıklama/etiket. Skill `ai` ipuçlarında yalnızca MP ayırma kalır
 * (madde 258: reserveMp, reserveMinMpRatio). Zorluk (Easy/Medium/Hard) `opts.difficulty` ile (ai.json > difficulty).
 * Etki tahmini önizlemeyle aynı hesaptır (src/engine/preview.ts): zırh, menzil, taunt, kalkan hepsi hesaba girer.
 */
/** Profil öncelik etiketleri (artık seçimi yönetmez; terazinin baskın terimi bu adlarla etiketlenir). 'value' = terazi adımı (açıklama). */
export type AiPriority = 'kill' | 'heal' | 'tactic' | 'summon' | 'shield' | 'aoe' | 'damage' | 'taunt' | 'guard' | 'burn' | 'value';

export interface AiProfile {
  priorities: AiPriority[];
  focus: 'lowest_hp' | 'lowest_ratio';
  aoeMinTargets: number;
  healBelowRatio: number;
  shieldBelowRatio: number;
  maxSummons: number;
  mpCostWeight: number;
  hpCostWeight: number;
  minHpRatioForHpCost: number;
  /** guard: canı bu orandan düşük, korumasız dostu koru. */
  guardBelowRatio?: number;
  /** burn: en az bu kadar düşmanın yakılabilir manası varsa toplu mana yak. */
  burnMinTargets?: number;
  /**
   * summon (ceset tüketen çağrı, Raise Dead): tüketilecek düşman cesedi YOKSA çağrı beslenmemiş (unfed) gelir; o zaman yalnızca çağrının tahmini değeri
   * (birimin en iyi ham hasarı x ömür x summonValueShare) bu turun en iyi başka hamlesinin değerinden (değer - bedel) büyük ya da eşitse çağrılır.
   * Ceset varsa (beslenmiş) eski kural: en ucuz çağrı. Varsayılan 0,5.
   */
  summonValueShare?: number;
  /**
   * Debuff silen (dispel) skill seçeneğinin değeri (madde 240, Mana Barrier): silinecek her debuff için kalan tur x cleanseValuePerTurn
   * (sıra kaybettiren durumda, ör. Stun, x cleanseSkipTurnMult). Değer cleanseMinValue ve üstündeyse kalkan önceliği yaralı olmayan dosta da bakar.
   * Yoksa 0 (değer yok).
   */
  cleanseValuePerTurn?: number;
  cleanseSkipTurnMult?: number;
  cleanseMinValue?: number;
  /**
   * Hexer: yığını 3'e TAMAMLAMAYAN her eklenen Omen'in ertelenmiş değeri = ölçek statı (Luck) x powerPerStack x omenValueShare (madde Ö2 sonrası 0,85:
   * Omen süre dolunca da patlar; iskonto 1-3 tur gecikme ve fazla hasar riskini temsil eder). Wither (DoT) beklenen toplamı da bu payla sayılır. Varsayılan 0,85.
   */
  omenValueShare?: number;
  /** Dark Bond değerinin üst sınırı: bağlı dostun eksik canı, en az maks canının bu payı (dost tam canlıyken de bağ boyunca hasar yiyecek). Varsayılan 0. */
  bondHpFloor?: number;
  /** Dark Bond: kopya kullanıcının gerçek iyileşmesi kadar olduğundan değer, kullanıcının eksik canı + maks canının bu payıyla sınırlı (madde 241). Varsayılan 0. */
  bondSelfFloor?: number;
}

/**
 * Global skill (Rest / Skip Turn / Move Tile) kuralları (data/ai.json > global). Hepsi taktik DEĞER hesabına bağlıdır (skill değeri = beklenen hasar/şifa/kalkan - bedel;
 * 'şimdiki hamle' = yapay zekanın global olmadan seçeceği hamle). Çağrılan birimler global skill kullanmaz; madde 258: sabit kapı yok, kazanç class hamlesinin terazi puanıyla kıyaslanır.
 */
export interface AiGlobalConfig {
  enabled: boolean;
  rest: {
    /** Rest, MP oranı bu değerin altındayken ve skill şu an MP yüzünden yapılamıyorken (senaryo A) düşünülür. */
    mpBelowRatio: number;
    /** Cooldown'daki skill'e MP biriktirmek (senaryo B): skill en geç bu kadar kendi turu sonra hazır olmalı. */
    lookaheadTurns: number;
    /** Ertelenen güçlü skill'in değeri bu oranla çarpılır (bekleme bedeli). */
    futureValueShare: number;
    /** Rest'in net kazancı (ertelenen skill - şimdiki hamle), ertelenen skill değerinin en az bu payı olmalı. */
    minGainShare: number;
    /** Tehlike: can oranı bu değerin altında VE düşmanın bir turda vuracağı beklenen hasar canın dangerIncomingShare katından fazla ise Rest/Skip denenmez. */
    dangerHpRatio: number;
    dangerIncomingShare: number;
  };
  skip: {
    /**
     * Skip (sonraki tur %100 hızla yarı sürede gelir; birim hemen tekrar oynamaz): yapacak değerli hamle yokken ya da şimdiki hamlenin değeri,
     * 1 tur sonra hazır olacak skill'in değerinin bu payından azsa. Başka durumda seçilmez ('bedava zaman' yok: bir tur kaybedilir).
     */
    worthlessShare: number;
  };
  move: {
    /** Geri çekilme: engellenen yakın dövüş hasarı, birimin canının en az bu payı olmalı. */
    minAvoidShare: number;
    /** Menzilli/kırılgan birimin hamlesini kaybetmenin bedeli (şimdiki hamle değerinin payı); yakın dövüşçüde meleeOpportunityShare. */
    opportunityShare: number;
    meleeOpportunityShare: number;
    /** Yakın dövüşçü/Defender bu can oranının altındaysa geri çekilebilir (üstündeyse ileri atılır, geri değil). */
    retreatHpRatio: number;
    /** Öne geçme: kazanılan yakın dövüş değeri (potansiyel - şimdiki), potansiyelin en az bu payı olmalı. */
    minFrontGainShare: number;
    /** Aura komşuluğu: kazanılan beklenen hasar azalması (can-eşdeğer) en az bu kadar olmalı. */
    minAuraGain: number;
  };
}

export interface AiConfig {
  defaultProfile: string;
  profiles: Record<string, AiProfile>;
  /** Değer terazisi ayarları (yoksa DEFAULT_VALUE). */
  value?: AiValueConfig;
  /**
   * Zorluk seviyeleri (madde 256: sefer başında seçilir, değişmez; madde 258 Faz 5 UYGULANDI): Easy (ufuk 1, kurtarma/kontrol yok, yalnızca kesin öldürme,
   * en iyi 3'ten belirleyici seçim, Rest yalnızca boşta), Medium (tam terazi; sim/denge), Hard (takım odak ateşi, fazla vurmama, patlatmada fırsat bekleme).
   */
  difficulty?: Partial<Record<AiDifficulty, AiDifficultyConfig>>;
  /** Global skill kuralları; yoksa ya da enabled false ise yapay zeka hiç global skill kullanmaz. */
  global?: AiGlobalConfig;
}

export interface AiChoice {
  /** Class skill'i ya da global skill id'si (rest / skip_turn / move_tile). */
  skillId: string;
  /** Tek hedefli skill'lerde hedef; çoklu/kendine skill'lerde tanımsız. */
  targetUid?: string;
  /** move_tile: gidilecek boş yuva (targetUid de aynı yuvayı `tile:<yuva>` olarak taşır: yalnızca targetUid geçiren eski kod yolları için). Alan skill'inde anchor hücre. */
  slot?: number;
  /** area_any alan skill'inde anchor hücrenin tahtası (kendi ya da karşı taraf). */
  board?: Side;
  /** Ceset tüketen çağrı (Raise Dead): tüketilecek düşman cesedi (en tehlikeli; battle.corpseChoices). Çağrıda `slot` çağrı yuvasıdır. */
  corpseUid?: string;
  /**
   * Kararın baskın değer terimi (etiket; seçim terazisi verir): kill (öldürme), heal (şifa/diriltme/kurtarma), summon, shield, taunt, guard, burn,
   * tactic (saf self-buff / kontrol), aoe (alan hasarı), damage (tek hedef hasar); 'fallback' kullanılmıyor; rest/skip/move: global skill kuralı.
   */
  reason: AiPriority | 'fallback' | 'rest' | 'skip' | 'move';
  /** Seçilen adayın terazi puanı (can-eşdeğer); global skill kararlarında tanımsız. */
  score?: number;
}

/**
 * Karar izi (isteğe bağlı, salt yazılır): chooseAction'a verilirse seçimin gerekçesi buraya yazılır. İz seçimi ASLA etkilemez:
 * yalnızca yapılan hesapların sonuçları kopyalanır (aynı durum + iz var/yok = aynı karar; tests/match-log.test.ts kilitler).
 */
export interface AiTrace {
  options: Option[];
  reserves: Reserve[];
  /** Öncelik sırası boyunca denenen seçiciler (ilk uyan seçimi verir; sonra durulur). */
  steps: Array<{ priority: AiPriority | 'fallback'; option?: Option }>;
  /** Global skill'ler olmadan class seçimi (null: hiçbir şey seçilemedi). */
  classPick?: { option: Option; reason: AiChoice['reason'] } | null;
  global?: GlobalTrace;
  /** Kararın zorluk seviyesi (madde 258). */
  difficulty?: AiDifficulty;
}

export interface GlobalTrace {
  enabled: boolean;
  /** Global skill kararına hiç girilmediyse nedeni. */
  gate?: string;
  /** Şimdiki class hamlesinin net değeri ve ödeyeceği MP. */
  vNow?: number;
  spend?: number;
  danger?: { active: boolean; hpRatio: number; incoming: number; hp: number };
  move?: { slot: number; net: number } | null;
  moveBlocked?: string;
  restGain?: number;
  restBlocked?: string;
  skipChecks?: Array<{ skill: string; futureValue: number; nowValue: number; needBelow: number; hit: boolean }>;
  skipNote?: string;
  outcome?: string;
}

export interface Option {
  skill: SkillDef;
  targetUid?: string;
  /** Şekil skill'inde seçilen anchor hücre (boş hücre de olabilir) ve şeklin kapsadığı tüm hücreler. */
  anchorSlot?: number;
  cells?: number[];
  /** area_any (Smoke Bomb) seçeneğinde alanın atıldığı tahta (diğer alan skill'lerinde tanımsız: karşı tahta). */
  board?: Side;
  /**
   * İsabet/kaçınma durumlarının (Blinded/Shrouded) koruma değeri (can-eşdeğer): kör edilen düşmanın vuracağı beklenen hasardaki azalma ya da örtülen
   * dostun yiyeceği beklenen hasardaki azalma, kalan tur sayısıyla (statusMitigation). value() içine girer.
   */
  mitigation: number;
  targets: Combatant[];
  /** Hedeflerin canı/kalkanıyla sınırlı toplam beklenen hasar (fazla vuruş sayılmaz); arkaya sıçrayan dahil. */
  damage: number;
  kills: Combatant[];
  heal: number;
  selfHeal: number;
  shield: number;
  /** Yakılacak toplam mana ve mana yakılan hedef sayısı. */
  burn: number;
  burnTargets: number;
  /** Düşmüş bir dostu diriltir mi (diriltilen birimin maks canı değer sayılır). */
  revive: number;
  /** Mana yakmanın değeri: yakılan mana, hedefin mana havuzuyla (büyücüler) ağırlıklanır. */
  burnScore: number;
  /** Hedef başına doğrudan yakılacak MP (manaBurn) ve kalkan kancası (Spell Ward onAbsorb.burnMana): terazide "engellenen hamle" değeri (madde 258). */
  burnBy: Record<string, number>;
  /** Mana boşalma zarı (Drain Field onEmpty, madde 260): hedef başına ihtimal, yakımdan sonra kalan MP ve durumun süresi ('silence' terimi). */
  emptyBy?: Record<string, { chance: number; mpAfter: number; turns: number; status: string }>;
  wardBurn?: { amount: number; magic: boolean };
  /** Ana hedef (tek hedefli skill'lerde seçilen düşman, alan skill'lerinde merkez/ilk hedef) ve ona beklenen ortalama hasar. */
  primary?: Combatant;
  primaryAvg: number;
  /** Ana hedefe isabet şansı (hasar veriyorsa; yoksa 0). */
  primaryHit: number;
  /** bonusPerMissingMana: ana hedefe eksik mana ekinin ham hasar içindeki payı (0-1). */
  missingManaShare: number;
  /** Saf self-buff skill'i (yalnızca kendine durum + kendine hasar): net değeri (can-eşdeğer; savunma + hasar artışı - bedel - kaçırılan hamle). */
  pureBuff: boolean;
  buff: number;
  /** MP ayırma (reserveMp) yüzünden ertelendi: yalnızca başka pozitif değerli seçenek yoksa seçilir. */
  blocked: boolean;
  /** Bu saldırının bozacağı MP ayırmalarının en büyük değeri (puanı bunu geçen saldırı ertelenmez; madde 258). */
  reserveValue?: number;
  summon: boolean;
  /** Ceset tüketen çağrı: true = şu an ceset var (beslenmiş/empowered), false = ceset yok (beslenmemiş/unfed); diğer seçeneklerde tanımsız. */
  empowered?: boolean;
  /** Çağrının tahmini değeri (can-eşdeğer): çağrılacak birimin (varyantı uygulanmış) en iyi ham skill hasarı x ömür x summonValueShare; çağrı değilse 0. */
  summonValue: number;
  /** Çağrı seçeneğinde: çağrının yuvası (battle.summonSlotFor) ve (ceset tüketen çağrıda) tüketilecek ceset + tüm ceset adayları (tehlike puanlarıyla). */
  summonSlot?: number;
  corpseUid?: string;
  corpseOptions?: CorpseChoice[];
  taunt: boolean;
  guard: boolean;
  cost: number;
  /** Düşük can kuralına (minHpRatioForHpCost) tabi: sabit can bedeli ya da can bahsi. Oranlı can bedeli (Wail) false. */
  hpCost: boolean;
  /** Dost üstündeki debuff'ları silmenin değeri (can-eşdeğer; profil cleanseValuePerTurn). */
  cleanse: number;
  /** Dark Bond: bağ süresince bağlı dosta gidecek beklenen lifesteal kopyası (can-eşdeğer). */
  bond: number;
  /** Yarım turn (turnCost < 1) skill'in tempo değeri: (1 - turnCost) x bu turun en iyi tam turn hamlesinin net değeri (sıra daha erken geri gelir). */
  tempo: number;
  /** Hedef başına beklenen hasar (isabetle çarpılmış, can+kalkanla sınırlı), öldürme ihtimali, şifa, kalkan (terazi için; preview'dan). */
  dmgBy: Record<string, number>;
  killP: Record<string, number>;
  healBy: Record<string, number>;
  shieldBy: Record<string, number>;
  magicShieldBy: Record<string, number>;
  /** Diriltmede terazinin seçtiği hücre (battle.reviveSlots içinden). */
  reviveSlot?: number;
  /** Terazi: terim terim değerler ve toplam puan (scoreOption doldurur). */
  terms: Record<string, number>;
  score: number;
  /**
   * Hexer laneti ertelenmiş değeri (can-eşdeğer): yığını tamamlamayan Omen'ler (Luck x powerPerStack x omenValueShare) + Wither tiklerinin beklenen toplamı
   * (x omenValueShare), isabet ve kritik (critStacks) ihtimaliyle. Anında tetiklenen Doom'un beklenen hasarı `damage`'a (ve öldürüyorsa `kills`'e) girer.
   */
  curse: number;
  /** Maç kaydı notları (Omen/Doom/Jinx): 'omens 1->2 omenValue 5.0', 'omens 2->3 DOOM 25.2@crit 0.12', 'detonate 3 omen x1.5 = 37.8', 'omen timer 2'... */
  notes: string[];
}

const ratio = (c: Combatant) => c.hp / c.maxHp;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const BURN_WEIGHT = 0.6;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Kararlı sıralama: eşitlikte seçenek sırası (skill sırası, hedef sırası) korunur. */
const best = <T>(items: T[], score: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((top, item) => (top === undefined || score(item) > score(top) ? item : top), undefined);

/**
 * `opts.difficulty`: Easy / Medium / Hard (varsayılan medium; madde 258 Faz 5, data/ai.json > difficulty). Medium = tam terazi (sim ve denge bununla).
 * Easy: ufuk 1, kurtarma ve kontrol değeri yok, yalnızca kesin öldürme, en iyi 3 adaydan belirleyici seçim (seed + tur + birim), Rest yalnızca boşta.
 * Hard: takım odak ateşi, zaten ölecek hedefe fazla vurmama, yığın patlatmada uygun anı bekleme. Hepsi saf ve belirleyici.
 */
export function chooseAction(battle: Battle, actorUid: string, config: AiConfig, trace?: AiTrace, opts?: { difficulty?: AiDifficulty }): AiChoice | null {
  // hitLoss önbelleği yalnızca bu karar boyunca yaşar (durum değişmez); iç içe çağrıda dıştaki korunur
  const outer = hitLossCache;
  hitLossCache = outer ?? new Map();
  const outerCtx = activeCtx;
  try {
    return chooseActionInner(battle, actorUid, config, trace, opts?.difficulty ?? 'medium');
  } finally {
    hitLossCache = outer;
    activeCtx = outerCtx;
  }
}

/** Bu karar boyunca değer bağlamı (global skill kararları da aynı teraziyle puanlar); karar bitince temizlenir. */
let activeCtx: ValueContext | null = null;

/** statusMitigation hesabında tekrar eden (saldıran, kurban, ek) sonuçları: tek bir chooseAction çağrısı süresince (saf; seçimi değiştirmez). */
let hitLossCache: Map<string, number> | null = null;

/** Zorluk kuralları (ai.json > difficulty.<seviye>); Medium ya da tanımsız = boş (tam terazi). */
export function difficultyRules(config: AiConfig, difficulty: AiDifficulty = 'medium'): AiDifficultyConfig {
  return config.difficulty?.[difficulty] ?? {};
}

function chooseActionInner(battle: Battle, actorUid: string, config: AiConfig, trace: AiTrace | undefined, difficulty: AiDifficulty): AiChoice | null {
  const actor = battle.get(actorUid);
  if (!actor || actor.hp <= 0) return null;
  const profile = config.profiles[actor.ai ?? config.defaultProfile] ?? config.profiles[config.defaultProfile];
  if (!profile) return null;

  // Değer bağlamı (düşman tahmini, katkılar) karar boyunca bir kez kurulur; seçenek değerleri (buff dahil) ve global kararlar onu kullanır
  const rules = difficultyRules(config, difficulty);
  const vc = { ...DEFAULT_VALUE, ...(config.value ?? {}), ...(rules.value ?? {}), ...(rules.horizon !== undefined ? { horizon: rules.horizon } : {}) };
  const focusOf = (c: Combatant) => (config.profiles[c.ai ?? config.defaultProfile] ?? config.profiles[config.defaultProfile])?.focus ?? 'lowest_ratio';
  activeCtx = new ValueContext(battle, actor, vc, focusOf);
  activeCtx.diff = rules;
  const options = buildOptions(battle, actor, profile, trace);
  const pick = options.length === 0 ? null : pickClassOption(actor, profile, options, activeCtx, trace, battle);
  if (trace) {
    trace.options = options;
    trace.classPick = pick;
    trace.difficulty = difficulty;
  }
  const g = config.global;
  if (g?.enabled && !actor.summoned && battle.globalSkillIds().length > 0) {
    const gt: GlobalTrace | undefined = trace ? { enabled: true } : undefined;
    if (trace) trace.global = gt;
    if (rules.globals === 'restWhenIdle') {
      // Easy: Move/Skip yok; yalnızca yapacak hamle yokken Rest (MP biriktir)
      if (gt) gt.gate = `difficulty ${difficulty}: only Rest when there is nothing to do`;
      if (!pick && battle.canUseGlobal(actor.uid, 'rest').ok) {
        if (gt) gt.outcome = 'rest: no move to make (easy)';
        return { skillId: 'rest', reason: 'rest' };
      }
    } else {
      const choice = chooseGlobal(battle, actor, profile, g, pick, gt);
      if (choice) return choice;
    }
  } else if (trace) {
    trace.global = { enabled: false, gate: !g?.enabled ? 'global skills disabled in ai.json' : actor.summoned ? 'summoned units cannot use global skills' : 'no global skills' };
  }
  return pick ? toChoice(pick.option, pick.reason) : null;
}

/** Belirleyici "zar" [0, 1): savaş seed'i + oynanan tur + birim kimliğinden (motorun RNG'sine dokunmaz; aynı savaş = aynı hata). */
export function aiNoise(battle: Battle, actorUid: string): number {
  let h = (battle.seed ^ 0x9e3779b9) >>> 0;
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  };
  mix(battle.turnsTaken);
  for (let i = 0; i < actorUid.length; i++) mix(actorUid.charCodeAt(i));
  return h / 4294967296;
}

/**
 * Class skill'leri arasından (global skill'ler olmadan) seçim: TEK DEĞER TERAZİSİ. Her adayın puanı (scoreOption) hesaplanır; puanı > 0 olan en büyük
 * seçilir (eşitlikte aday sırası: skill sırası, hedef sırası). MP ayırma (reserveMp) yüzünden engellenen saldırılar yalnızca başka hiçbir şey yoksa.
 * Easy (pickTop): puanı en iyinin pickWithin payı içindeki en iyi pickTop aday arasından pickWeights ağırlıklı belirleyici seçim (aiNoise).
 * Hiçbir aday pozitif değilse null (global skill / pas).
 */
function pickClassOption(actor: Combatant, profile: AiProfile, options: Option[], ctx: ValueContext, trace: AiTrace | undefined, battle: Battle): { option: Option; reason: AiChoice['reason'] } | null {
  for (const o of options) {
    scoreOption(ctx, profile, o);
    // MP ayırma yalnızca ayrılan skill'in değeri bu saldırıdan büyükse erteler (madde 258)
    if (o.blocked && o.score >= (o.reserveValue ?? 0)) o.blocked = false;
  }
  const pool = (list: Option[]) => best(list.filter((o) => o.score > 0), (o) => o.score);
  let pick = pool(options.filter((o) => !o.blocked)) ?? pool(options);
  const rules = ctx.diff;
  if (pick && (rules.pickTop ?? 1) > 1) {
    const ranked = options.filter((o) => !o.blocked && o.score > 0 && o.score >= pick!.score * (rules.pickWithin ?? 0)).sort((a, b) => b.score - a.score).slice(0, rules.pickTop);
    const w = (rules.pickWeights ?? []).slice(0, ranked.length);
    const total = w.reduce((a, b) => a + b, 0);
    if (ranked.length > 1 && total > 0) {
      let r = aiNoise(battle, actor.uid) * total;
      let i = 0;
      while (i < w.length - 1 && r >= w[i]!) r -= w[i++]!;
      pick = ranked[i] ?? pick;
    }
  }
  trace?.steps.push({ priority: 'value', ...(pick ? { option: pick } : {}) });
  return pick ? { option: pick, reason: reasonOf(pick) } : null;
}

/** Seçilen adayın baskın terimi (etiket; maç kaydı ve global skill kapısı için). */
function reasonOf(o: Option): AiChoice['reason'] {
  const t = o.terms;
  const v = (k: string) => t[k] ?? 0;
  if (o.revive > 0) return 'heal';
  if (o.summon) return 'summon';
  if (o.taunt) return 'taunt';
  if (o.guard) return 'guard';
  if (o.kills.length > 0 && v('kill') >= Math.max(v('heal'), v('shield'), v('control'))) return 'kill';
  const support = v('heal') + (o.heal > 0 ? v('save') : 0);
  const prot = v('shield') + (o.shield > 0 ? v('save') : 0) + v('cleanse');
  const attack = v('damage') + v('pressure') + v('curse');
  if (support > 0 && support >= prot && support >= attack) return 'heal';
  if (prot > 0 && prot >= attack) return 'shield';
  if (o.burn > 0 && v('burn') + v('silence') >= attack) return 'burn';
  if (o.pureBuff || (attack <= 0 && (v('control') > 0 || v('mitigation') > 0 || v('bond') > 0))) return 'tactic';
  if (o.skill.target === 'area_enemies' || o.skill.target === 'all_enemies') return 'aoe';
  return 'damage';
}

function toChoice(option: Option, reason: AiChoice['reason']): AiChoice {
  return {
    skillId: option.skill.id,
    ...(option.targetUid ? { targetUid: option.targetUid } : {}),
    ...(option.anchorSlot !== undefined ? { slot: option.anchorSlot } : option.summonSlot !== undefined ? { slot: option.summonSlot } : option.reviveSlot !== undefined ? { slot: option.reviveSlot } : {}),
    ...(option.board ? { board: option.board } : {}),
    ...(option.corpseUid ? { corpseUid: option.corpseUid } : {}),
    reason,
    score: r1(option.score),
  };
}

const value = (o: Option) => o.damage + o.heal + o.selfHeal + o.shield * 0.5 + o.burn * BURN_WEIGHT + Math.max(0, o.buff) + o.mitigation + o.cleanse + o.bond + o.tempo + o.curse;

function buildOptions(battle: Battle, actor: Combatant, profile: AiProfile, trace?: AiTrace): Option[] {
  const options: Option[] = [];
  for (const skillId of actor.skills) {
    if (!battle.canUse(actor.uid, skillId).ok) continue;
    options.push(...skillOptions(battle, actor, skillId, profile));
  }
  // İkinci geçiş: saf self-buff'ların net değeri (diğer seçeneklerin değeri bilinmeli) ve skill'in bağlam ipucu
  const attackScore = (o: Option) => value(o) - o.cost;
  const attacks = options.filter((x) => !x.pureBuff);
  for (const o of options) {
    if (!o.pureBuff) continue;
    const alt = Math.max(0, ...attacks.map(attackScore));
    const free = attacks.filter((x) => x.skill.cost.amount === 0).map((x) => x.damage);
    const basic = free.length > 0 ? Math.max(...free) : Math.max(0, ...attacks.map((x) => x.damage));
    // Terazi kıyaslamayı kendisi yapar: buff değerinden "kaçırılan saldırı" düşülmez (alt = 0; madde 254 K1)
    void alt;
    o.buff = buffValue(battle, actor, o, 0, basic, profile);
  }
  // Dark Bond (madde 240): bağın değeri, kullanıcının TEK HEDEFLİ en iyi saldırısının beklenen hasarından (lifesteal kopyası; alan toplamı değil: ai-priorities K10)
  const singles = options.filter((x) => x.damage > 0 && x.anchorSlot === undefined && x.targets.length === 1);
  const bestHit = Math.max(0, ...(singles.length > 0 ? singles : options.filter((x) => x.damage > 0)).map((x) => (singles.length > 0 ? x.damage : x.damage / Math.max(1, x.targets.length))));
  for (const o of options) if (o.skill.effects.some((e) => e.type === 'bond')) o.bond = bondValue(battle, actor, o, bestHit, profile);
  // Yarım turn (turnCost < 1): sıra (1 - turnCost) kadar erken geri gelir; o kadar "bedava" tam turn hamlesi değeri eklenir (skill kendi değer üretiyorsa)
  if (battle.mode === 'turns') {
    const full = options.filter((x) => battle.turnCostOf(x.skill.id) >= 1);
    const fullBest = Math.max(0, ...full.map((x) => (x.pureBuff ? x.buff : value(x)) - x.cost));
    for (const o of options) {
      const tc = battle.turnCostOf(o.skill.id);
      if (tc < 1 && (o.pureBuff ? o.buff : value(o)) > 0) o.tempo = (1 - tc) * fullBest;
    }
  }
  const reserve = reservedMp(battle, actor, profile);
  if (trace) trace.reserves = reserve;
  // Madde 258: skill ipuçlarında bağlam koşulu yok; yalnızca MP ayırma (puanlama sonrası, pickClassOption değerle kıyaslar)
  for (const o of options) {
    const hit = spentReserves(actor, o, reserve);
    o.blocked = hit.length > 0;
    o.reserveValue = Math.max(0, ...hit.map((r) => r.value));
  }
  return options;
}

/** Bir skill'in gereken MP'si (MP ayırma, Rest, Skip): bedeli ve (varsa) ai.reserveMinMpRatio x maks MP. */
function mpNeedOf(sk: SkillDef, actor: Combatant): number {
  return Math.max(sk.cost.amount, Math.ceil((sk.ai?.reserveMinMpRatio ?? 0) * actor.maxMp));
}

/**
 * MP ayırma: `reserveMp: N` ipuçlu bir skill (ör. Aimed Shot, Meteor) hazırsa ya da en geç N tur sonra hazır olacaksa, şu an (bekleme yok sayılarak)
 * pozitif değerli bir seçeneği varsa ve o zamana kadar yenilenmeyle MP'si ona yetebilecekse, onu yetersiz bırakacak SALDIRI harcamaları ertelenir;
 * madde 258'den beri yalnızca saldırının puanı, ayrılan skill'in beklenen değerinden (en iyi puanı x value.reserveValueShare) düşükse.
 * Şifa, kalkan, çağrı gibi işlevsel skill'ler ve MP ayıran skill'lerin kendisi etkilenmez.
 */
export interface Reserve {
  /** Ayrılan skill'in id'si (yalnızca açıklama için). */
  skill: string;
  need: number;
  /** Hazır olmasına kalan tur (0 = hazır, 1..N). */
  turns: number;
  /** Ayrılan skill'in beklenen değeri (şu anki en iyi puanı x reserveValueShare); bundan değerli saldırı ertelenmez. */
  value: number;
}

function reservedMp(battle: Battle, actor: Combatant, profile: AiProfile): Reserve[] {
  if (battle.mode !== 'turns') return [];
  const out: Reserve[] = [];
  for (const id of actor.skills) {
    const sk = battle.skill(id);
    const turns = actor.cooldowns[id] ?? 0;
    if (!sk?.ai?.reserveMp || sk.cost.resource !== 'mp' || turns > sk.ai.reserveMp) continue;
    const need = mpNeedOf(sk, actor);
    if (actor.mp + actor.stats.mpRegen * turns < need) continue;
    // Yalnızca skill'in şu an (bekleme yok sayılarak) değerli bir seçeneği varsa ayır: değersizken MP boşuna bekletilmez
    const share = activeCtx?.vc.reserveValueShare ?? DEFAULT_VALUE.reserveValueShare;
    const value = activeCtx ? Math.max(0, ...skillOptions(battle, actor, id, profile).map((o) => (scoreOption(activeCtx!, profile, o), o.score))) * share : 0;
    if (value > 0) out.push({ skill: id, need, turns, value });
  }
  return out;
}

function spentReserves(actor: Combatant, o: Option, reserves: Reserve[]): Reserve[] {
  const pureAttack = o.damage > 0 && o.heal === 0 && o.shield === 0 && o.burn === 0 && !o.summon && !o.taunt && !o.guard;
  if (reserves.length === 0 || o.skill.ai?.reserveMp || !pureAttack || o.skill.cost.resource !== 'mp' || o.skill.cost.amount <= 0) return [];
  return reserves.filter((r) => actor.mp - o.skill.cost.amount + actor.stats.mpRegen * r.turns < r.need);
}

/** Bir skill'in tüm (hedef/alan) seçenekleri. Bekleme ve MP denetimi YAPMAZ (çağıran denetler). */
function skillOptions(battle: Battle, actor: Combatant, skillId: string, profile: AiProfile): Option[] {
  const skill = battle.skill(skillId)!;
  const candidates = battle.validTargets(actor.uid, skillId);
  if (candidates.length === 0) return [];
  if (battle.isAreaSkill(skillId)) {
    // Alan (şekil) skill'i: her seçilebilir anchor hücre (boş hücre dahil) bir aday; aynı hücre kümesini veren anchor'lar tek aday (en küçük yuva).
    // Aşamalı skill de aynı: değerlendirme toplam hasar / hedef sayısı üzerinden (aşama sırası sonucu değiştirmez; falloff sırası gerçek vuruşla aynı).
    // area_any (Smoke Bomb): her iki tahtanın anchor'ları ayrı aday (tahta anahtarın parçası).
    const out: Option[] = [];
    const seen = new Set<string>();
    const anyBoard = battle.isAnyBoardArea(skillId);
    for (const { board, slot } of battle.shapeAnchorCells(actor.uid, skillId)) {
      const cells = battle.areaCells(skillId, slot, board);
      const key = `${board}:${cells.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const targets = battle.areaWindowAt(actor.uid, skillId, slot, board);
      const occupant = battle.combatants.find((c) => c.hp > 0 && c.board === board && c.slot === slot);
      // X şekli: anchor'daki birim hitsAtCenter kez vurulur (önizleme/değer buna göre)
      const center = targets.find((c) => c.board === board && c.slot === slot);
      const o = evaluate(battle, actor, skill, targets, occupant?.uid, profile, board === foeSide(actor) ? cells : undefined, center?.uid);
      o.anchorSlot = slot;
      o.cells = cells;
      if (anyBoard) o.board = board;
      out.push(o);
    }
    return out;
  }
  // Yan vuruşlu (splash) tek hedef skill'inde grup = seçilen hedef + yanındakiler (ilk eleman seçilen hedeftir)
  const groups = battle.needsTargetChoice(skillId) ? candidates.map((t) => [t, ...battle.splashTargets(skillId, t)]) : [candidates];
  return groups.map((targets) => evaluate(battle, actor, skill, targets, battle.needsTargetChoice(skillId) ? targets[0]!.uid : undefined, profile));
}

const foeSide = (actor: Combatant) => (actor.side === 'party' ? 'enemy' : 'party');

/** Saf self-buff skill'i mi: yalnızca kendine durum ve kendine hasar etkileri var (Abyssal Cry gibi). */
function isPureBuff(skill: SkillDef): boolean {
  return skill.target === 'self' && skill.effects.some((e) => e.type === 'status' && e.self) && skill.effects.every((e) => (e.type === 'status' && e.self) || e.type === 'selfDamage');
}

/** Skill'in kullanıcıya vereceği can kaybı (can bedeli + kendine hasar); canı en az 1 bırakır. */
function selfHpCost(actor: Combatant, skill: SkillDef): number {
  const hpCost = skill.cost.resource === 'hp' ? skillCostAmount(skill.cost, actor) : 0; // oranlı bedel: mevcut canın oranı
  const self = sum(skill.effects.map((e) => (e.type === 'selfDamage' ? e.ratio * actor.maxHp : 0)));
  return Math.max(0, Math.min(actor.hp - 1, hpCost + self));
}

/**
 * Düşman takımının, kullanıcıya TEK bir tur dolusu vurabileceği beklenen toplam hasar: her düşman, kullanabileceği
 * (MP'si yeten) en çok hasar veren skill'iyle (isabet şansı, zırh ve durum çarpanı dahil; önizleme formülü).
 */
function incomingDamage(battle: Battle, actor: Combatant): number {
  const attacking = ['single_enemy', 'area_enemies', 'all_enemies', 'random_enemies', 'everyone'];
  let total = 0;
  for (const foe of battle.living(foeSide(actor))) {
    let top = 0;
    for (const id of foe.skills) {
      const sk = battle.skill(id);
      if (!sk || !attacking.includes(sk.target)) continue;
      if (sk.cost.resource === 'mp' && foe.mp < sk.cost.amount) continue;
      if (sk.cost.resource === 'rage' && (foe.rage ?? 0) < sk.cost.amount) continue;
      const d = previewForTargets(battle, foe, id, [actor]).find((p) => p.uid === actor.uid)?.damage;
      if (d) top = Math.max(top, d.avg * d.hitChance);
    }
    total += top;
  }
  return total;
}

/**
 * Saf self-buff'ın net değeri (can-eşdeğer): savunma (alınan hasarı azaltan durum x düşmanın bana vuracak payı x süre)
 * + hasar artışı (Berserker gibi eksik cana bağlı pasif: kendine hasarla artan bonus x temel saldırı x süre)
 * - can bedeli - bu tur başka bir saldırı yapmamanın bedeli (alt x opportunityShare). Aynı durum zaten üzerindeyse değeri 0'dır.
 */
function buffValue(battle: Battle, actor: Combatant, o: Option, alt: number, basicDamage: number, profile: AiProfile): number {
  const own = o.skill.effects.filter((e): e is Extract<typeof e, { type: 'status' }> => e.type === 'status' && !!e.self);
  if (own.some((e) => actor.statuses.some((s) => s.kind === e.status && s.turns > 0))) return 0; // zaten aktif: yığılmaz
  const turns = Math.max(0, ...own.map((e) => e.turns));
  let mitigation = 0;
  for (const e of own) mitigation = Math.max(mitigation, 1 - (battle.statusDef(e.status)?.damageTakenMult ?? 1));
  // Terazi (madde 257): bana gelecek hasar = düşman tahmininde bana yönelen vuruşlar ile takım içinde eşit payın büyüğü; süre ufukla sınırlı
  const ctx = activeCtx;
  const share = ctx ? (ctx.round.get(actor.uid) ?? 0) : incomingDamage(battle, actor) * 0.4;
  const span = ctx ? Math.min(turns, ctx.vc.horizon) : turns;
  const defend = mitigation > 0 ? mitigation * share * span : 0;
  const pe = actor.passive?.effect;
  const rage = pe?.type === 'rage' ? pe.maxBonus : 0;
  const lost = selfHpCost(actor, o.skill);
  const offense = rage * (actor.maxHp > 0 ? lost / actor.maxHp : 0) * basicDamage * turns;
  // Kendine hasar beni bir sonraki turumdan önce öldürülebilir yapıyorsa (hasar azaltmasıyla bile): kurtarma değerim kadar bedel
  // Hasar azaltmasıyla bile bir sonraki turumdan önce ölüyorsam buff boşa gider (yalnızca bedel); bedeli ödemeseydim yaşayacak idiysem kurtarma değerim de kaybedilir
  if (ctx) {
    const threat = ctx.before.get(actor.uid) ?? 0;
    const aliveAfter = threat * (1 - mitigation) < actor.hp - lost + actor.shield;
    if (!aliveAfter) return -lost * profile.hpCostWeight - (threat < actor.hp + actor.shield ? ctx.save(actor) : 0);
  }
  return defend + offense - lost * profile.hpCostWeight - alt * 0.5;
}

/** Birimin lifesteal oranı: soulDrain pasifi + skill'lerindeki en yüksek damage.lifesteal (Dark Bond değeri için kaba ölçü). */
function lifestealRatio(battle: Battle, actor: Combatant): number {
  const pe = actor.passive?.effect;
  const passive = pe?.type === 'soulDrain' ? pe.ratio : 0;
  let skill = 0;
  for (const id of actor.skills) for (const e of battle.skill(id)?.effects ?? []) if (e.type === 'damage') skill = Math.max(skill, e.lifesteal ?? 0);
  return passive + skill;
}

/**
 * Dark Bond seçeneğinin değeri (can-eşdeğer): bağ süresince kullanıcının beklenen lifesteal kazancı (bu turun en iyi saldırısının beklenen hasarı x
 * lifesteal oranı x bağ oranı x tur) bağlı dosta gider; dostun eksik canıyla (en az maks canın profile.bondHpFloor payı) sınırlı. Kullanıcının
 * 1 turdan fazla sürecek geçerli bir bağı varsa 0 (bağ bitmek üzereyken yenilenir).
 */
function bondValue(battle: Battle, actor: Combatant, o: Option, bestHit: number, profile: AiProfile): number {
  const e = o.skill.effects.find((x) => x.type === 'bond');
  const target = o.targets[0];
  if (!e || e.type !== 'bond' || !target || target.uid === actor.uid || target.hp <= 0) return 0;
  const own = actor.statuses.find((s) => s.kind === 'dark_bond' && s.source === actor.uid);
  if (own && battle.bondPartnerOf(actor.uid) && own.turns > 1) return 0;
  // Madde 241: canı doluyken can çalınmaz, kopya yalnızca kullanıcının GERÇEKTEN iyileştiği kadar: kullanıcının eksik canı (+ bağ boyunca yiyeceği
  // hasar için maks canının bondSelfFloor payı) üst sınırdır; Undead tam canlıyken değer düşük
  const steal = bestHit * lifestealRatio(battle, actor) * e.turns;
  // Madde 258 (Faz 2 düzeltmesi): bağ süresince ikisinin de yiyeceği beklenen hasar (düşman tahmini, tur başı x süre) iyileşme payı açar; eskiden
  // yalnızca şu anki eksik can sayılıyordu (tam canlı Undead'in bağı neredeyse hep 0'dı, gerçekte bağ süresince hasar yiyip çalıyor)
  const span = activeCtx ? Math.min(e.turns, activeCtx.vc.horizon) : 0;
  const room = (c: Combatant) => (activeCtx ? Math.min(c.hp, (activeCtx.round.get(c.uid) ?? 0) * span) : 0);
  const selfCap = actor.maxHp - actor.hp + room(actor) + actor.maxHp * (profile.bondSelfFloor ?? 0);
  const cap = Math.max(target.maxHp - target.hp + room(target), target.maxHp * (profile.bondHpFloor ?? 0));
  return Math.max(0, Math.min(Math.min(steal, selfCap) * e.ratio, cap));
}

/** Birimin büyü hasarı veren bir skill'i var mı (Spell Ward'ın emebileceği saldırgan)? */
function hasMagicAttack(battle: Battle, c: Combatant): boolean {
  return c.skills.some((id) => battle.skill(id)?.effects.some((e) => e.type === 'damage' && e.damageType === 'magic'));
}

/** Birimin herhangi bir hasar skill'i var mı? */
function hasAttack(battle: Battle, c: Combatant): boolean {
  return c.skills.some((id) => battle.skill(id)?.effects.some((e) => e.type === 'damage'));
}

function evaluate(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[], targetUid: string | undefined, profile: AiProfile, areaCells?: number[], centerUid?: string): Option {
  const previews = previewForTargets(battle, actor, skill.id, targets, centerUid);
  const o: Option = {
    skill,
    ...(targetUid ? { targetUid } : {}),
    ...(targets[0] ? { primary: targets[0] } : {}),
    targets,
    mitigation: statusMitigation(battle, actor, skill, targets),
    primaryHit: 0,
    damage: 0,
    kills: [],
    heal: 0,
    selfHeal: 0,
    shield: 0,
    burn: 0,
    burnTargets: 0,
    revive: 0,
    burnScore: 0,
    burnBy: {},
    primaryAvg: 0,
    missingManaShare: 0,
    pureBuff: isPureBuff(skill),
    buff: 0,
    blocked: false,
    summon: skill.effects.some((e) => e.type === 'summon'),
    taunt: skill.effects.some((e) => e.type === 'taunt'),
    guard: skill.effects.some((e) => e.type === 'guard'),
    summonValue: 0,
    cleanse: 0,
    bond: 0,
    tempo: 0,
    curse: 0,
    notes: [],
    dmgBy: {},
    killP: {},
    healBy: {},
    shieldBy: {},
    magicShieldBy: {},
    terms: {},
    score: 0,
    // Rage bedeli skora yansımaz (Rage yalnızca harcanmak için birikir; bedel koşulu canUse + skill'in ai bağlamıyla sağlanır).
    // Oranlı bedel (Wail: mevcut canın %20'si) şu anki kaynaktan hesaplanır (skillCostAmount).
    cost: skillCostAmount(skill.cost, actor) * (skill.cost.resource === 'mp' ? profile.mpCostWeight : skill.cost.resource === 'hp' ? profile.hpCostWeight : 0),
    // Düşük can kuralı (minHpRatioForHpCost) yalnızca SABİT can bedeline ve can bahsine uygulanır. Oranlı can bedeli
    // (cost.ofCurrent; Wail of the Dead: mevcut canın %20'si) muaf: bedel can azaldıkça kendiliğinden küçülür (Ömer kararı, madde 247).
    hpCost: (skill.cost.resource === 'hp' && !(skill.cost.ofCurrent ?? 0) && skillCostAmount(skill.cost, actor) > 0) || skill.effects.some((e) => e.type === 'damage' && e.bet?.resource === 'hp'),
  };
  // Bahis: kaybedilirse gidecek MP, bedele beklenen olarak eklenir (MP bahsi); can bahsi hpCost kuralıyla (düşük canda oynanmaz) sınırlanır
  for (const e of skill.effects) {
    if (e.type === 'damage' && e.bet?.resource === 'mp') {
      const mpLeft = skill.cost.resource === 'mp' && !battle.freeMp ? actor.mp - skill.cost.amount : actor.mp;
      o.cost += (1 - e.bet.winChance) * betStake(e.bet, actor.maxHp, actor.hp, mpLeft) * profile.mpCostWeight;
    }
  }
  // Çağrı: beslenmiş/beslenmemiş hâli ve tahmini değeri (varyantı uygulanmış birimin en iyi ham hasarı x ömür x summonValueShare)
  const summonEffect = skill.effects.find((e) => e.type === 'summon');
  if (summonEffect && summonEffect.type === 'summon') {
    // Yuva: mevcut çağrı yuvası kuralı (summonSlotFor); ceset: karşı takımda diriltilmesi EN TEHLİKELİ olan (battle.corpseToConsume)
    const sp = battle.summonPreview(actor.uid, skill.id);
    if (sp.empowered !== undefined) o.empowered = sp.empowered;
    if (sp.slot !== null) o.summonSlot = sp.slot;
    if (sp.corpse) o.corpseUid = sp.corpse.uid;
    if (summonEffect.consumeCorpse) o.corpseOptions = battle.corpseChoices(actor.uid, skill.id);
    if (sp.unit) o.summonValue = summonRawDamage(battle, sp.unit.stats, sp.unit.skills) * (summonEffect.lifespan ?? 3) * (profile.summonValueShare ?? 0.5);
  }
  const manaEffect = skill.effects.find((e) => e.type === 'damage' && e.bonusPerMissingMana);
  const first = targets[0];
  if (manaEffect && manaEffect.type === 'damage' && first) {
    const extra = Math.max(0, first.maxMp - first.mp) * (manaEffect.bonusPerMissingMana ?? 0);
    const base = attributePower(actor.stats, manaEffect.scale, battle.formulas) * manaEffect.power;
    o.missingManaShare = extra + base > 0 ? extra / (extra + base) : 0;
  }
  const lifesteal = Math.max(0, ...skill.effects.map((e) => (e.type === 'damage' ? (e.lifesteal ?? 0) : 0)));
  for (const p of previews) {
    const target = battle.get(p.uid);
    if (!target) continue;
    if (p.damage) {
      if (target === targets[0]) {
        o.primaryAvg = p.damage.avg;
        o.primaryHit = p.damage.hitChance;
      }
      // Beklenen hasar isabet şansıyla çarpılır. Öldürme İHTİMALİ (O2): isabet x P(hasar zarı >= can + emecek kalkan), kritik dalı dahil
      const exp = (p.damage.hpLoss + p.damage.absorbed) * p.damage.hitChance;
      o.damage += exp;
      o.dmgBy[target.uid] = (o.dmgBy[target.uid] ?? 0) + exp;
      if (target.side !== actor.side) {
        const magic = skill.effects.some((e) => e.type === 'damage' && e.damageType === 'magic');
        const need = target.hp + target.shield + (magic ? target.magicShield : 0);
        const d = p.damage;
        const cm = actor.stats.critMult;
        const c = Math.max(0, Math.min(1, d.critChance));
        const pk = d.critChance >= 1 ? pAtLeast(d.min, d.max, need) : (1 - c) * pAtLeast(d.min, d.max, need) + c * pAtLeast(d.min * cm, d.critMax, need);
        // Madde 258: hedefin kullanılmamış Lucky Escape hakkı ölümcül vuruşu o şansla tamamen yok sayar
        o.killP[target.uid] = Math.max(o.killP[target.uid] ?? 0, d.hitChance * pk * (1 - battle.luckyEscapeChance(target.uid)));
        if (o.killP[target.uid]! >= 0.5) o.kills.push(target);
      }
      if (lifesteal > 0 && !p.damage.splash) o.selfHeal += p.damage.hpLoss * p.damage.hitChance * lifesteal;
    }
    if (p.heal) {
      o.heal += p.heal.avg;
      o.healBy[p.uid] = (o.healBy[p.uid] ?? 0) + p.heal.avg;
    }
    if (skill.effects.some((e) => e.type === 'revive')) o.revive += target.maxHp;
    if (p.hot) {
      o.heal += p.hot.total;
      o.healBy[p.uid] = (o.healBy[p.uid] ?? 0) + p.hot.total;
    }
    // Saldırı skill'inin kendine verdiği kalkan (Shield Bash) kalkan önceliğini tetiklemez
    if (p.shield && !['single_enemy', 'all_enemies', 'area_enemies'].includes(skill.target)) {
      o.shield += p.shield.amount;
      const magicOnly = skill.effects.some((e) => e.type === 'shield' && e.shieldType === 'magic');
      if (magicOnly) o.magicShieldBy[p.uid] = (o.magicShieldBy[p.uid] ?? 0) + p.shield.amount;
      else o.shieldBy[p.uid] = (o.shieldBy[p.uid] ?? 0) + p.shield.amount;
    }
    if (p.burn) {
      o.burn += p.burn;
      o.burnScore += p.burn * Math.max(0.5, target.maxMp / 30); // mana havuzu büyük (büyücü) hedefte mana yakmak daha değerli
      o.burnTargets++;
      o.burnBy[target.uid] = (o.burnBy[target.uid] ?? 0) + p.burn;
    }
    // Drain Field onEmpty (madde 260): ihtimal x hasarın beklenen can kaybı (isabet zarı yok; kritik beklentisi dahil, kalan canla sınırlı) `damage`'a;
    // susturmanın engellediği hamle değeri burnValue'da ('silence' terimi)
    if (p.emptyProc && target.side !== actor.side) {
      const ep = p.emptyProc;
      const left = Math.max(0, target.hp - (p.damage?.hpLoss ?? 0));
      const exp = ep.chance * Math.min(left + target.shield + target.magicShield, ep.damage.avg * (1 + ep.damage.critChance * (actor.stats.critMult - 1)));
      o.damage += exp; // (dmgBy'a yazılmaz: isabet zarı olmadığından burn/silence değeri isabet şansıyla çarpılmamalı)
      (o.emptyBy ??= {})[target.uid] = { chance: ep.chance, mpAfter: target.mp - (p.burn ?? 0), turns: ep.turns, status: ep.status };
      if (o.notes.length < 6) o.notes.push(`${unitLabel(target)}: mana empty -> ${Math.round(ep.chance * 100)}% ${ep.statusName} ${ep.turns}t + ${ep.damage.avg} dmg`);
    }
  }
  // Yerde kalan etki (zehir, yanan zemin, holy fire): alandaki (şeklin TÜM hücreleri; boş anchor dahil) düşmanların turlar boyunca alacağı beklenen hasar
  if (areaCells) {
    const cells = new Set(areaCells);
    for (const e of skill.effects) {
      if (e.type !== 'ground') continue;
      const amount = Math.round(attributePower(actor.stats, e.scale, battle.formulas) * e.power);
      const standing = battle.living(foeSide(actor)).filter((c) => c.board === foeSide(actor) && cells.has(c.slot)).length;
      o.damage += amount * e.turns * standing * 0.7;
    }
  }
  // Debuff silme (Mana Barrier, madde 240): silinecek her debuff'ın kalan turu x profil değeri (sıra kaybettiren durum x cleanseSkipTurnMult)
  const perTurn = profile.cleanseValuePerTurn ?? 0;
  if (perTurn > 0) {
    for (const e of skill.effects) {
      if (e.type !== 'dispel' || e.status !== 'debuff') continue;
      for (const t of targets) {
        if (t.hp <= 0 || t.side !== actor.side) continue;
        for (const s of battle.dispelCandidates(t, 'debuff').slice(0, e.count ?? Infinity)) o.cleanse += s.turns * perTurn * (battle.statusDef(s.kind)?.skipTurn ? (profile.cleanseSkipTurnMult ?? 1) : 1);
      }
    }
  }
  // Kalkan kancası (Spell Ward onAbsorb.burnMana): kalkanın emebileceği saldırganlardan (büyü kalkanı: büyü hasarlı düşmanlar) en çok yakılabilecek MP
  for (const e of skill.effects) {
    if (e.type !== 'shield' || !e.onAbsorb?.burnMana) continue;
    const burn = Math.max(0, ...battle.living(foeSide(actor)).filter((f) => (e.shieldType === 'magic' ? hasMagicAttack(battle, f) : hasAttack(battle, f))).map((f) => Math.min(f.mp, e.onAbsorb!.burnMana!)));
    o.burn += burn;
    o.wardBurn = { amount: e.onAbsorb.burnMana, magic: e.shieldType === 'magic' };
  }
  curseValue(battle, actor, skill, previews, o, profile);
  // Rastgele hedefli skill: hedefler önceden bilinmez; beklenen hasar hedef sayısına oranlanır, öldürme garanti değildir
  if (skill.target === 'random_enemies' && targets.length > 0) {
    const share = Math.min(skill.count ?? 3, targets.length) / targets.length;
    o.damage *= share;
    for (const k of Object.keys(o.dmgBy)) o.dmgBy[k]! *= share;
    for (const k of Object.keys(o.killP)) o.killP[k]! *= share;
    o.kills = [];
  }
  o.selfHeal = Math.min(Math.round(o.selfHeal), actor.maxHp - actor.hp);
  return o;
}

/**
 * Hexer laneti (Omen / Doom / Wither) değeri, yapay ağırlık YOK (docs/design/classes/hexer.md 6). Hedef başına, isabet şansı (h) ve kritik lanet
 * ihtimaliyle (c: kullanıcının geçerli kritik şansı; kritikte critStacks):
 * - Hamle yığını doldurursa (ya da detonate) Doom'un beklenen can kaybı (kritik beklentisiyle, kalan canla sınırlı) ANINDA `damage`'a eklenir; kritiksiz
 *   dalda bile vuruş + Doom hedefin canını bitiriyorsa (h >= aiKillMin) `kills`'e girer.
 * - Doldurmazsa eklenen her Omen = ölçek statı x powerPerStack x omenValueShare ertelenmiş değer (`curse`).
 * - Wither: tik x tur toplamı (vuruştan sonra kalan canla sınırlı) x omenValueShare, isabet şansıyla (`curse`).
 */
function curseValue(battle: Battle, actor: Combatant, skill: SkillDef, previews: ReturnType<typeof previewForTargets>, o: Option, profile: AiProfile): void {
  const share = profile.omenValueShare ?? 0.85;
  const baseCrit = battle.effectiveStats(actor).critChance;
  const cm = actor.stats.critMult;
  const killMin = battle.formulas.hit.aiKillMin;
  for (const p of previews) {
    const target = battle.get(p.uid);
    if (!target || target.side === actor.side) continue;
    // Kritik lanet ihtimali = bu vuruşun kritik şansı (skill'in critBonus'u dahil: Jinx; madde 260)
    const crit = p.damage ? p.damage.critChance : baseCrit;
    const h = p.damage ? p.damage.hitChance : 1;
    const left = Math.max(0, target.hp - (p.damage?.hpLoss ?? 0));
    const label = unitLabel(target);
    if (p.omen) {
      const om = p.omen;
      const def = battle.statusDef(om.status);
      const per = def?.doom ? attributePower(actor.stats, def.doom.scale, battle.formulas) * def.doom.powerPerStack * share : 0;
      const doomExp = (d: NonNullable<typeof om.doom>) => Math.min(left, d.hpLoss * (1 + d.critChance * (cm - 1)));
      const branch = (after: number, d: typeof om.doom) => (d ? { now: doomExp(d), later: 0 } : { now: 0, later: Math.max(0, after - om.before) * per });
      const nc = branch(om.after, om.doom);
      const cr = om.afterCrit !== om.after ? branch(om.afterCrit, om.doomOnCrit) : nc;
      o.damage += h * ((1 - crit) * nc.now + crit * cr.now);
      o.curse += h * ((1 - crit) * nc.later + crit * cr.later);
      const hk = h * (1 - battle.luckyEscapeChance(target.uid)); // madde 258
      if (om.doom && p.damage && (p.damage.hpLoss + om.doom.hpLoss >= target.hp) && hk >= killMin && !o.kills.includes(target)) {
        o.kills.push(target);
        o.killP[target.uid] = Math.max(o.killP[target.uid] ?? 0, hk);
      }
      if (o.notes.length < 6) {
        if (om.doom && om.doom.cause === 'detonate') o.notes.push(`${label}: omens ${om.before}->${om.after} detonate ${om.doom.omens} omen x${om.doom.mult} = ${r1(om.doom.avg)}@crit ${r2(om.doom.critChance)}`);
        else if (om.doom) o.notes.push(`${label}: omens ${om.before}->${om.after} DOOM ${r1(om.doom.avg)}@crit ${r2(om.doom.critChance)}`);
        else o.notes.push(`${label}: omens ${om.before}->${om.after} omenValue ${r1(nc.later)}${om.doomOnCrit ? ` (crit -> ${om.afterCrit}: DOOM ${r1(om.doomOnCrit.avg)})` : ''} omen timer ${om.turnsLeft}`);
      }
    }
    if (p.dot) {
      const v = Math.min(left, p.dot.total) * share * h;
      o.curse += v;
      if (o.notes.length < 6 && v > 0) o.notes.push(`${label}: wither ${p.dot.perTick}x${p.dot.turns} value ${r1(v)}`);
    }
  }
  // Jinx gibi kritik cezası veren durum: koruma değeri notu (statusMitigation hesapladı)
  for (const e of skill.effects) {
    if (e.type !== 'status' || e.self) continue;
    const def = battle.statusDef(e.status);
    if (def?.critDelta && o.mitigation > 0) o.notes.push(`mitigation ${r1(o.mitigation)} (${e.status}: acc ${def.accuracyDelta ? `${Math.round(def.accuracyDelta * 100)}%` : '0'}, crit ${def.critDelta <= -1 ? '0' : `${Math.round(def.critDelta * 100)}%`}${def.endsOnOwnAttack ? ', next attack only' : ''})`);
  }
}

const ATTACK_TARGETS = ['single_enemy', 'area_enemies', 'all_enemies', 'random_enemies', 'everyone'];

/**
 * `attacker` -> `victim` en iyi saldırısının (MP/Rage'i yeten) beklenen hasarındaki AZALMA, saldıranın isabetine `accDelta` ya da kurbanın
 * kaçınmasına `evaDelta` eklenince: max(skill) [ortalama hasar x (hit şansı - yeni hit şansı)]. Önizleme formülü (zırh, durumlar, kalkan dahil).
 */
function hitLoss(battle: Battle, attacker: Combatant, victim: Combatant, accDelta: number, evaDelta: number): number {
  const key = `${attacker.uid}|${victim.uid}|${accDelta}|${evaDelta}`;
  const cached = hitLossCache?.get(key);
  if (cached !== undefined) return cached;
  const v = hitLossRaw(battle, attacker, victim, accDelta, evaDelta);
  hitLossCache?.set(key, v);
  return v;
}

function hitLossRaw(battle: Battle, attacker: Combatant, victim: Combatant, accDelta: number, evaDelta: number): number {
  const f = battle.formulas;
  const a = battle.effectiveStats(attacker);
  const v = battle.effectiveStats(victim);
  const after = hitChance({ accuracy: Math.max(0, a.accuracy + accDelta) }, { evasion: Math.max(0, v.evasion + evaDelta) }, f);
  let top = 0;
  for (const id of attacker.skills) {
    const sk = battle.skill(id);
    if (!sk || !ATTACK_TARGETS.includes(sk.target)) continue;
    if (sk.cost.resource === 'mp' && attacker.mp < sk.cost.amount) continue;
    if (sk.cost.resource === 'rage' && (attacker.rage ?? 0) < sk.cost.amount) continue;
    const d = previewForTargets(battle, attacker, id, [victim]).find((p) => p.uid === victim.uid)?.damage;
    if (d) top = Math.max(top, d.avg * Math.max(0, d.hitChance - after));
  }
  return top;
}

/**
 * `attacker` -> `victim` en iyi saldırısının beklenen hasarındaki AZALMA, saldıranın isabetine `accDelta` ve kritik şansına `critDelta` eklenince (Jinxed):
 * max(skill) [ort. hasar x (hit x (1 + kritik x (çarpan - 1)) - yeni hit x (1 + yeni kritik x (çarpan - 1)))]. Garantili kritik (Backstab) kritiği korur.
 */
function hitCritLoss(battle: Battle, attacker: Combatant, victim: Combatant, accDelta: number, critDelta: number): number {
  const key = `hc|${attacker.uid}|${victim.uid}|${accDelta}|${critDelta}`;
  const cached = hitLossCache?.get(key);
  if (cached !== undefined) return cached;
  const f = battle.formulas;
  const a = battle.effectiveStats(attacker);
  const after = hitChance({ accuracy: Math.max(0, a.accuracy + accDelta) }, battle.effectiveStats(victim), f);
  const cm = attacker.stats.critMult;
  let top = 0;
  for (const id of attacker.skills) {
    const sk = battle.skill(id);
    if (!sk || !ATTACK_TARGETS.includes(sk.target)) continue;
    if (sk.cost.resource === 'mp' && attacker.mp < skillCostAmount(sk.cost, attacker)) continue;
    if (sk.cost.resource === 'rage' && (attacker.rage ?? 0) < sk.cost.amount) continue;
    const d = previewForTargets(battle, attacker, id, [victim]).find((p) => p.uid === victim.uid)?.damage;
    if (!d) continue;
    const sure = d.critChance >= 1; // garantili kritik: Jinxed bozmaz (madde Ö5)
    const avg = sure ? d.avg / cm : d.avg; // önizleme ortalaması garantili kritikte çarpanı içerir
    const cBefore = d.critChance;
    const cAfter = sure ? 1 : Math.max(0, Math.min(1, cBefore + critDelta));
    const before = avg * d.hitChance * (1 + cBefore * (cm - 1));
    const now = avg * after * (1 + cAfter * (cm - 1));
    top = Math.max(top, before - now);
  }
  hitLossCache?.set(key, top);
  return top;
}

/**
 * İsabet/kaçınma durumlarının (statuses.json > accuracyDelta / evasionDelta: Blinded, Shrouded) koruma değeri, can-eşdeğer, yapay ağırlık YOK:
 * - Düşmana isabet cezası (Blinded): o düşmanın bizim canlı birimlerimize yapabileceği en iyi saldırının beklenen hasar azalması, birimlerimizin ORTALAMASI
 *   (her turda birine vurur) x yeni eklenen tur sayısı (zaten varsa yalnızca uzayan kısım).
 * - Dosta kaçınma bonusu (Shrouded): her düşmanın o dosta en iyi saldırısındaki beklenen hasar azalmasının toplamı / canlı dost sayısı
 *   (her düşman birimlerimizden birine vurur) x yeni eklenen tur sayısı.
 */
function statusMitigation(battle: Battle, actor: Combatant, skill: SkillDef, targets: Combatant[]): number {
  let total = 0;
  for (const e of skill.effects) {
    if (e.type !== 'status' || e.self) continue;
    const def = battle.statusDef(e.status);
    const acc = def?.accuracyDelta ?? 0;
    const eva = def?.evasionDelta ?? 0;
    const critD = def?.critDelta ?? 0;
    if (acc >= 0 && eva <= 0 && critD >= 0) continue;
    const chance = (e as { chance?: number }).chance ?? 1;
    for (const t of targets) {
      if (t.hp <= 0 || !battle.effectAppliesTo(skill, e, t, actor)) continue;
      const has = t.statuses.find((s) => s.kind === e.status);
      // endsOnOwnAttack (Jinxed): yalnızca hedefin SONRAKİ saldırısı etkilenir (1 tur değer; zaten taşıyorsa 0)
      const turns = def?.endsOnOwnAttack ? (has ? 0 : 1) : Math.max(0, e.turns - (has?.turns ?? 0));
      if (turns <= 0) continue;
      if ((acc < 0 || critD < 0) && t.side !== actor.side) {
        const victims = battle.living(actor.side);
        // Kritik cezası varsa isabet+kritik birlikte (hitCritLoss); yoksa eski isabet hesabı (Blinded değerleri değişmez)
        if (victims.length > 0) total += (sum(victims.map((v) => (critD < 0 ? hitCritLoss(battle, t, v, acc, critD) : hitLoss(battle, t, v, acc, 0)))) / victims.length) * turns * chance;
      }
      if (eva > 0 && t.side === actor.side) {
        const allies = Math.max(1, battle.living(actor.side).length);
        total += (sum(battle.living(foeSide(actor)).map((foe) => hitLoss(battle, foe, t, 0, eva))) / allies) * turns * chance;
      }
    }
  }
  return total;
}

/** Bir birimin skill'leri arasında tek kullanımlık en yüksek HAM hasar (zırhsız, kritiksiz; yan vuruş dahil değil): stat x güç toplamı. */
function summonRawDamage(battle: Battle, stats: Combatant['stats'], skills: string[]): number {
  let top = 0;
  for (const id of skills) {
    const sk = battle.skill(id);
    if (!sk) continue;
    const raw = sum(sk.effects.map((e) => (e.type === 'damage' ? attributePower(stats, e.scale, battle.formulas) * e.power : 0)));
    top = Math.max(top, raw);
  }
  return top;
}

// ---------------------------------------------------------------- değer terazisi (madde 254 K1-K10, madde 257)

/**
 * Bir adayın terazi puanı (can-eşdeğer; ai-value.ts). Terimler o.terms'e yazılır (maç kaydı her birini ayrı gösterir). Saf self-buff'ta (Abyssal Cry)
 * buff değeri (savunma + hasar artışı - can bedeli) diğer terimlerin yerine geçer.
 */
function scoreOption(ctx: ValueContext, profile: AiProfile, o: Option): void {
  const battle = ctx.battle;
  const actor = ctx.actor;
  const vc = ctx.vc;
  const t: Record<string, number> = {};
  const add = (k: string, v: number) => {
    if (v !== 0 && Number.isFinite(v)) t[k] = (t[k] ?? 0) + v;
  };
  const get = (uid: string) => battle.get(uid);
  if (o.pureBuff) {
    add('buff', o.buff);
  } else {
    add('damage', o.damage);
    add('selfHeal', o.selfHeal);
    const rules = ctx.diff;
    // Hard "fazla vurmama" (madde 258 Faz 5): zaten ölecek hedefe (DoT/zemin tiki, ondan önce oynayacak dostlarımız) hasar/öldürme/baskı değerinin yalnızca bir payı
    const keep = (f: Combatant) => (rules.overkillShare !== undefined && f.side !== actor.side && ctx.dyingAnyway(f) ? rules.overkillShare : 1);
    if (rules.overkillShare !== undefined) {
      for (const [uid, d] of Object.entries(o.dmgBy)) {
        const f = get(uid);
        if (f && keep(f) < 1) add('overkill', -d * (1 - keep(f)));
      }
    }
    // Öldürme: ihtimal x hedefin kalan katkısı (ufuk); öldürülen düşman tehlikedeki bir dostu öldürecek olandıysa kurtarma değeri de (K2)
    for (const [uid, p] of Object.entries(o.killP)) {
      const f = get(uid);
      if (!f || p <= 0) continue;
      if (rules.killMinChance !== undefined && p < rules.killMinChance) continue; // Easy: yalnızca kesin öldürme
      add('kill', p * vc.killWeight * ctx.contribution(f) * keep(f));
      for (const i of ctx.hits) {
        if (i.foe !== uid || !i.before) continue;
        const a = get(i.target);
        if (a && ctx.rescued(a, 0, i.hit)) add('save', p * ctx.save(a) * keep(f));
      }
    }
    // Baskı: öldürmeyen hasarın hedefin kalan katkısından götürdüğü pay (odak ateşi: yaralı ve tehlikeli hedef daha değerli)
    // Hard: dostlarımızın da yöneleceği hedefe ek pay (takım odak ateşi)
    for (const [uid, d] of Object.entries(o.dmgBy)) {
      const f = get(uid);
      if (!f || f.side === actor.side || d <= 0) continue;
      const left = 1 - (o.killP[uid] ?? 0);
      const focus = 1 + (rules.focusFire ?? 0) * (rules.focusFire ? ctx.alliesOn(f) : 0);
      add('pressure', left * vc.pressureShare * ctx.contribution(f) * Math.min(1, d / Math.max(1, f.hp + f.shield + f.magicShield)) * focus * keep(f));
    }
    // Şifa (fazla şifa sayılmaz: önizleme eksik canla sınırlar) + tehlikedeki dostu kurtarma
    add('heal', o.heal);
    for (const [uid, h] of Object.entries(o.healBy)) {
      const a = get(uid);
      if (a && a.side === actor.side && ctx.rescued(a, h)) add('save', ctx.save(a));
    }
    // Kalkan: emilmesi beklenen kısım (dosta tur başına gelecek hasar x shieldRounds; büyü kalkanı yalnızca büyü hasarı) + kurtarma
    for (const [uid, sh] of [...Object.entries(o.shieldBy).map(([u, v]) => [u, v, false] as const), ...Object.entries(o.magicShieldBy).map(([u, v]) => [u, v, true] as const)].map(([u, v, m]) => [u, { v, m }] as const)) {
      const a = get(uid);
      if (!a || a.side !== actor.side) continue;
      const incoming = (sh.m ? ctx.roundMagic.get(uid) : ctx.round.get(uid)) ?? 0;
      add('shield', Math.min(sh.v, incoming * vc.shieldRounds));
      if (ctx.rescued(a, sh.m ? Math.min(sh.v, ctx.roundMagic.get(uid) ?? 0) : sh.v)) add('save', ctx.save(a));
    }
    // Diriltme (Soru P varsayılanı + Ömer 3 tur ufku): dirilenin ufuktaki katkısı (tur sayacı 0'dan başlar) x hücrede işe yararlığı + dönen can payı
    if (o.revive > 0) reviveTerm(ctx, o, add);
    // Kontrol etkileri (K8): Stun / Slow / Haste / Wound / Fortify ...
    add('control', vc.controlWeight * controlValue(ctx, o));
    // Taunt / Guard (K6): yönlendirilen hasar + kurtarma - Defender'ın ölme riski
    if (o.taunt || o.guard) add('protect', protectValue(ctx, o));
    // Çağrı (K7): vurabileceği bir yuva yoksa değeri 0; çağrı sınırı (maxSummons)
    if (o.summon) {
      // Çağrı değeri: ufukta (ömrüyle sınırlı) yapacakları x yuvada işe yararlık (K7: yakın dövüşçü vuramayacağı yuvada 0) + düşman saldırılarını üstüne
      // çekmesi (canı, protectShare) + çağırma yan etkisi (Verdant Blessing: tüm dostlara şifa, eksik canla sınırlı)
      const alive = battle.combatants.filter((c) => c.side === actor.side && c.summoned && c.hp > 0).length;
      const unit = battle.summonPreview(actor.uid, o.skill.id, o.corpseUid, o.summonSlot).unit;
      const eff = o.skill.effects.find((e) => e.type === 'summon');
      const life = eff && eff.type === 'summon' ? (eff.lifespan ?? 3) : 3;
      let v = 0;
      if (unit && o.summonSlot !== undefined && alive < Math.max(1, profile.maxSummons)) {
        const useful = ctx.usefulAt({ uid: '__summon__', skills: unit.skills }, actor.side, o.summonSlot);
        const tv = Math.max(0, ...unit.skills.map((id) => {
          const sk = battle.skill(id);
          return sk ? skillRawValue(battle, unit.stats, sk) : 0;
        })) * vc.contributionShare;
        const turns = ctx.turnsForSpeed(unit.stats.spd, life);
        const allies = Math.max(1, battle.living(actor.side).length);
        const totalRound = [...ctx.round.values()].reduce((a, b) => a + b, 0);
        const decoy = useful > 0 ? Math.min(unit.stats.hp, (totalRound * turns) / (allies + 1)) * vc.protectShare : 0;
        v = tv * turns * useful + decoy;
      }
      const pe = actor.passive?.effect;
      if (pe?.type === 'verdantBlessing' && unit) {
        const amount = attributePower(actor.stats, pe.scale, battle.formulas) * pe.power;
        v += sum(battle.living(actor.side).map((a) => Math.min(amount, a.maxHp - a.hp)));
      }
      o.summonValue = v;
      add('summon', v);
    }
    add('bond', o.bond);
    add('curse', o.curse);
    add('mitigation', o.mitigation);
    add('cleanse', cleanseValue(ctx, profile, o));
    add('burn', burnValue(ctx, o));
    add('silence', silenceValue(ctx, o));
    add('tempo', o.tempo);
  }
  const gross = Object.values(t).reduce((a, b) => a + b, 0);
  // Hard "uygun anı bekleme": yığın patlatan skill (Doom Mark) öldürmüyorsa ve hedefte yığın dolmaya 1 kala değilse değerinin yalnızca bir payı
  // (bir sonraki turda Evil Eye / Withering Curse ile yığın büyüyünce patlatmak daha değerli)
  const patience = ctx.diff.patience;
  if (patience !== undefined && gross > 0 && o.kills.length === 0) {
    const det = o.skill.effects.find((e) => e.type === 'detonate');
    const target = o.targets[0];
    if (det && det.type === 'detonate' && target) {
      const max = battle.statusDef(det.status)?.maxStacks ?? 3;
      const stacks = target.statuses.find((s) => s.kind === det.status)?.stacks ?? 0;
      if (stacks < max - 1) add('patience', -gross * (1 - patience));
    }
  }
  add('cost', -o.cost);
  // Ultimate'a küçük bekleme bedeli (K5): brüt değer x cooldown x pay (aynı işi bedava skill de yapıyorsa o kazanır)
  const cd = battle.mode === 'turns' && !battle.noCooldowns ? (o.skill.cooldown ?? 0) : 0;
  if (cd > 0 && gross > 0) add('cooldown', -gross * cd * vc.cooldownCostShare);
  // Sabit can bedeli / can bahsi: canı düşükken (minHpRatioForHpCost altı) yalnızca öldürüyorsa
  if (o.hpCost && ratio(actor) < profile.minHpRatioForHpCost && o.kills.length === 0) t.cost = (t.cost ?? 0) - gross;
  o.terms = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, r2(v)]));
  o.score = Object.values(t).reduce((a, b) => a + b, 0);
}

/** Diriltme terimi ve hücre seçimi: her boş hücre için işe yararlık (yakın dövüşçü ön sırada, menzilli/şifacı arkada güvende); en iyisi o.reviveSlot. */
function reviveTerm(ctx: ValueContext, o: Option, add: (k: string, v: number) => void): void {
  const battle = ctx.battle;
  const d = o.targets[0];
  const e = o.skill.effects.find((x) => x.type === 'revive');
  if (!d || d.hp > 0 || !e || e.type !== 'revive') return;
  const slots = battle.reviveSlots(ctx.actor.uid, o.skill.id);
  if (slots.length === 0) return;
  const meleeRows = battle.formulas.formation.meleeRows;
  const hasMelee = d.skills.some((id) => battle.skill(id)?.motion === 'melee');
  const hp = Math.max(1, Math.round(d.maxHp * e.hpRatio));
  const avgHit = ctx.intents.length > 0 ? ctx.intents.reduce((a, i) => a + i.hit, 0) / ctx.intents.length : 0;
  const rankOf = (slot: number) => {
    const rows = new Set(battle.living(d.side).filter((c) => c.board === d.side).map((c) => battle.rowOf(c.slot)));
    rows.add(battle.rowOf(slot));
    return [...rows].sort((a, b) => a - b).indexOf(battle.rowOf(slot));
  };
  const dist = (s: number) => Math.abs(battle.rowOf(s) - battle.rowOf(d.slot)) + Math.abs(battle.laneOf(s) - battle.laneOf(d.slot));
  let bestSlot = slots[0]!;
  let bestFit = -1;
  for (const s of slots) {
    const useful = ctx.usefulAt(d, d.side, s);
    const exposed = rankOf(s) < meleeRows;
    // Az canla dirilen, yakın dövüşe açık hücrede bir sonraki darbede ölebilir: hayatta kalma payı
    const survive = exposed && !hasMelee ? (hp > avgHit * 2 ? 0.9 : 0.7) : exposed && hp <= avgHit ? 0.8 : 1;
    const fit = useful * survive - dist(s) * 0.001 - s * 0.00001;
    if (fit > bestFit) {
      bestFit = fit;
      bestSlot = s;
    }
  }
  o.reviveSlot = bestSlot;
  const fit = Math.max(0, bestFit);
  const future = ctx.turnValue(d) * ctx.turnsWithin(d, 0) * fit;
  // Madde 258 (Ömer): diriltme savaşın galibini değiştirmeyecekse değeri 0 (savaş zaten kazanılmış ya da dirilenle bile kaybediliyor)
  const decided = ctx.outcome({ dmg: future, hp });
  if (decided) {
    o.notes.push(decided === 'win' ? 'revive 0: battle already won within the horizon' : 'revive 0: battle lost within the horizon even with the revived ally');
    return;
  }
  add('revive', ctx.vc.reviveWeight * (future + ctx.vc.reviveHpShare * hp));
}

/** Kontrol etkilerinin değeri (K8; can-eşdeğer): hedefin kaybettiği / dostun kazandığı tur payı x tur değeri, Wound: engellenen şifa, Fortify: önlenen hasar. */
function controlValue(ctx: ValueContext, o: Option): number {
  const battle = ctx.battle;
  const actor = ctx.actor;
  let v = 0;
  const hitOf = (t: Combatant) => {
    const d = previewHitChance(o, t);
    return d;
  };
  const statusEffects: Array<{ status: string; turns: number; chance: number; self?: boolean }> = [];
  for (const e of o.skill.effects) {
    if (e.type === 'status') statusEffects.push({ status: e.status, turns: e.turns, chance: (e as { chance?: number }).chance ?? 1, ...(e.self ? { self: true } : {}) });
    if (e.type === 'randomStatus') {
      const w = e.options.reduce((a, x) => a + x.weight, 0) || 1;
      for (const x of e.options) statusEffects.push({ status: x.status, turns: x.turns, chance: x.weight / w });
    }
  }
  for (const se of statusEffects) {
    const def = battle.statusDef(se.status);
    if (!def) continue;
    const recips = se.self ? [actor] : o.targets.filter((t) => t.hp > 0 && o.skill.effects.some((e) => (e.type === 'status' || e.type === 'randomStatus') && battle.effectAppliesTo(o.skill, e, t, actor)));
    for (const t of recips) {
      const has = t.statuses.find((s) => s.kind === se.status);
      const turns = Math.max(0, se.turns - (has?.turns ?? 0));
      if (turns <= 0) continue;
      const p = se.chance * (t.side === actor.side ? 1 : hitOf(t)) * (1 - (o.killP[t.uid] ?? 0));
      if (p <= 0) continue;
      const own = Math.min(turns, ctx.turnsWithin(t));
      const tv = ctx.turnValue(t);
      if (def.skipTurn && t.side !== actor.side) {
        // Sersemletme: hedefin kaçırdığı hamle(ler) + o hamle tehlikedeki bir dostu öldürecek idiyse kurtarma
        let val = Math.min(1, own) * tv + Math.max(0, own - 1) * tv * 0.5;
        for (const i of ctx.hits) {
          const a = i.foe === t.uid && i.before ? battle.get(i.target) : undefined;
          if (a && ctx.rescued(a, 0, i.hit)) val += ctx.save(a);
        }
        v += p * val;
      }
      if (def.speedMult !== undefined && def.speedMult !== 1) {
        const delta = Math.abs(def.speedMult - 1) * own * tv;
        if ((def.speedMult < 1) === (t.side !== actor.side)) v += p * delta; // düşmanı yavaşlatmak / dostu hızlandırmak
      }
      if (def.healTakenMult !== undefined && def.healTakenMult < 1 && t.side !== actor.side) {
        // Wound: düşman takımının bu süre içinde hedefe yapacağı beklenen şifanın azalması (şifacıların tur başı ham şifası / düşman sayısı)
        const foes = battle.living(t.side);
        const healPerTurn = foes.reduce((a, f) => a + Math.max(0, ...f.skills.map((id) => {
          const sk = battle.skill(id);
          return sk ? sum(sk.effects.map((e) => (e.type === 'heal' ? attributePower(f.stats, e.scale, battle.formulas) * e.power : e.type === 'hot' ? attributePower(f.stats, e.scale, battle.formulas) * e.power * e.turns : 0))) : 0;
        })), 0) / Math.max(1, foes.length);
        v += p * (1 - def.healTakenMult) * healPerTurn * own * ctx.vc.contributionShare;
      }
      if (def.damageTakenMult !== undefined && def.damageTakenMult < 1 && t.side === actor.side && !se.self) {
        v += p * (1 - def.damageTakenMult) * (ctx.round.get(t.uid) ?? 0) * Math.min(turns, ctx.vc.horizon);
      }
    }
  }
  return v;
}

/**
 * Debuff silme değeri (Mana Barrier; K8 ile aynı ölçü): sıra kaybettiren durum (Stun) = dostun kaçıracağı tur(lar) x tur değeri; Slow = kaybedeceği tur payı
 * x tur değeri; diğerleri profilin cleanseValuePerTurn x kalan tur. o.cleanse (profil formülü) bağlam yoksa kullanılır.
 */
function cleanseValue(ctx: ValueContext, profile: AiProfile, o: Option): number {
  const battle = ctx.battle;
  let v = 0;
  for (const e of o.skill.effects) {
    if (e.type !== 'dispel' || e.status !== 'debuff') continue;
    for (const t of o.targets) {
      if (t.hp <= 0 || t.side !== ctx.actor.side) continue;
      for (const st of battle.dispelCandidates(t, 'debuff').slice(0, e.count ?? Infinity)) {
        const def = battle.statusDef(st.kind);
        const own = Math.min(st.turns, ctx.turnsWithin(t));
        if (def?.skipTurn) v += ctx.turnValue(t) * Math.min(1, own) + ctx.turnValue(t) * Math.max(0, own - 1) * 0.5;
        else if (def?.speedMult !== undefined && def.speedMult < 1) v += (1 - def.speedMult) * own * ctx.turnValue(t);
        else v += st.turns * (profile.cleanseValuePerTurn ?? 0);
      }
    }
  }
  return v;
}

/**
 * Mana yakmanın değeri (madde 258, Faz 2: "engellenen hamle"; eski sabit "yakılan MP x 0,6" yerine): doğrudan yakılan MP (Drain Field, Mana Steal) için
 * hedefin ufukta kaybedeceği MP'li hamlelerin değeri (ValueContext.manaDenial), vuruşa bağlıysa isabet şansıyla. Spell Ward kancası: korunan dosta
 * bir sonraki turumuzdan önce saldıracağı tahmin edilen (büyü kalkanında: büyü vuran) her düşmanın, kanca kadar MP kaybıyla engellenen hamlesi.
 */
function burnValue(ctx: ValueContext, o: Option): number {
  const battle = ctx.battle;
  let v = 0;
  for (const [uid, x] of Object.entries(o.burnBy)) {
    const f = battle.get(uid);
    if (!f || f.side === ctx.actor.side) continue;
    v += ctx.manaDenial(f, x) * previewHitChance(o, f);
  }
  if (o.wardBurn) {
    const covered = new Set([...Object.keys(o.shieldBy), ...Object.keys(o.magicShieldBy)]);
    for (const i of ctx.intents) {
      if (o.wardBurn.magic && !i.magic) continue;
      const share = i.focus.filter((u) => covered.has(u)).length / Math.max(1, i.focus.length);
      const f = battle.get(i.foe);
      if (!f || share <= 0) continue;
      v += ctx.manaDenial(f, Math.min(f.mp, o.wardBurn.amount)) * share;
    }
  }
  return v;
}

/**
 * Susturmanın değeri (Drain Field onEmpty, madde 260; "engellenen hamle" modeli): her hedef için zar ihtimali x ValueContext.silenceDenial (susturulduğu
 * turlarda MP'li en iyi hamlesi yerine bedelsiz en iyi hamlesini yapmasının değer kaybı; yakımdan sonraki MP + yenilenmeyle ödenebilenler). Hasar payı
 * `damage` teriminde (evaluate).
 */
function silenceValue(ctx: ValueContext, o: Option): number {
  let v = 0;
  for (const [uid, x] of Object.entries(o.emptyBy ?? {})) {
    const f = ctx.battle.get(uid);
    if (!f || f.side === ctx.actor.side || !ctx.battle.statusDef(x.status)?.blocksMpSkills) continue;
    v += x.chance * (1 - (o.killP[uid] ?? 0)) * ctx.silenceDenial(f, x.mpAfter, x.turns);
  }
  return v;
}

/** Hedefe isabet şansı (adayın önizlemesinden; hasar vermeyen skill'de 1). */
function previewHitChance(o: Option, t: Combatant): number {
  if (o.dmgBy[t.uid] === undefined) return 1;
  return t === o.primary ? o.primaryHit || 1 : 0.85;
}

/**
 * Taunt / Guard değeri (K6, ai-priorities 6.5): korunan dostlardan Defender'a yönlenen beklenen hasar x protectShare x süre (ufukla sınırlı) + tehlikedeki
 * dostu kurtarıyorsa kurtarma değeri - Defender'ın bu yüzden ölme riski x Defender'ın kurtarma değeri. Sabit can kapısı YOK: fedakârlık mümkün.
 */
function protectValue(ctx: ValueContext, o: Option): number {
  const battle = ctx.battle;
  const actor = ctx.actor;
  const vc = ctx.vc;
  const defHp = actor.hp + actor.shield + actor.magicShield + (o.shieldBy[actor.uid] ?? 0);
  const selfThreat = ctx.round.get(actor.uid) ?? 0;
  let redirected = 0;
  let saves = 0;
  let turns = 1;
  if (o.taunt) {
    if (actor.statuses.some((s) => s.kind === 'taunt' && s.turns > 1)) return 0;
    const e = o.skill.effects.find((x) => x.type === 'taunt');
    turns = Math.min(e && e.type === 'taunt' ? e.turns : 1, vc.horizon);
    const pulled = new Map<string, number>();
    for (const i of ctx.hits) {
      if (i.target === actor.uid) continue;
      const foe = battle.get(i.foe);
      // Yalnızca tek hedefli saldırıyla gelen hasar yönlenir; alan skill'i olan düşmanın payı yarım sayılır
      const single = foe?.skills.some((id) => battle.skill(id)?.target === 'single_enemy') ? 1 : 0.5;
      redirected += i.hit * single;
      if (i.before) pulled.set(i.target, (pulled.get(i.target) ?? 0) + i.hit * single);
    }
    // Kurtarma: dosta bir sonraki turumuzdan önce gelecek ve Defender'a yönlenecek TOPLAM vuruş düşülünce dost yaşıyor mu
    for (const [uid, less] of pulled) {
      const a = battle.get(uid);
      if (a && ctx.rescued(a, 0, less)) saves += ctx.save(a);
    }
  } else {
    const a = o.targets[0];
    const e = o.skill.effects.find((x) => x.type === 'guard');
    if (!a || a.uid === actor.uid || !e || e.type !== 'guard' || a.statuses.some((s) => s.kind === 'guard')) return 0;
    turns = Math.min(e.turns, vc.horizon);
    redirected = (ctx.round.get(a.uid) ?? 0) * e.share;
    if (ctx.rescued(a, 0, (ctx.before.get(a.uid) ?? 0) * e.share)) saves += ctx.save(a);
  }
  if (redirected <= 0 && saves <= 0) return 0;
  // Defender riski: bir tur dolusu kendi + yönlenen hasar canını + kalkanını geçiyorsa
  const load = selfThreat + redirected;
  const risk = load >= defHp ? Math.min(1, load / Math.max(1, defHp)) * (ctx.contribution(actor) + actor.hp) : 0;
  return redirected * vc.protectShare * turns + saves - risk;
}

// ---------------------------------------------------------------- global skill'ler (Rest / Skip Turn / Move Tile)

/** Class hamlesinin değeri (can-eşdeğer): beklenen hasar/şifa/kalkan/buff - bedel; hamle yoksa 0. */
const optionNet = (o: Option | undefined): number => (o ? Math.max(0, o.score) : 0);

/**
 * Skill'in bedeli ve bekleme dışında (hedef, menzil/ön sıra, boş yer) kullanılabilir olup olmadığı: Rest/Skip kararlarında
 * "şu an MP/cooldown yüzünden yapılamayan ama bekleyince yapılabilecek" skill'leri bulmak için.
 */
function usableIgnoringCost(battle: Battle, actor: Combatant, skill: SkillDef): boolean {
  if (skill.motion === 'melee' && skill.target !== 'self' && !skill.ignoreFrontRow && !skill.ignoreReach && actor.board === actor.side && !battle.canMeleeFrom(actor.uid, actor.slot, skill.reach ?? 0)) return false;
  if (skill.effects.some((e) => e.type === 'summon') && battle.summonSlots(actor.uid, skill.id).length === 0) return false;
  return battle.validTargets(actor.uid, skill.id).length > 0;
}

/** Skill'in şu anki en değerli (bağlamı sağlanan) seçeneğinin net değeri; MP/cooldown denetlenmez. `mp`: bağlamdaki MP oranı koşulu için varsayılan MP. */
function bestSkillValue(battle: Battle, actor: Combatant, skill: SkillDef, profile: AiProfile, mp: number): number {
  if (!usableIgnoringCost(battle, actor, skill)) return 0;
  void mp;
  let top = 0;
  for (const o of skillOptions(battle, actor, skill.id, profile)) {
    // Terazi puanı (aynı karar bağlamı); bağlam yoksa (doğrudan çağrı) eski net değer
    if (activeCtx) scoreOption(activeCtx, profile, o);
    top = Math.max(top, activeCtx ? o.score : value(o) - o.cost);
  }
  return top;
}

/** Rest'in "ek MP ile yapılabilecek" en değerli skill'e kazandıracağı net değer (ertelenen skill değeri - şimdiki hamle); 0 = fayda yok. */
function restGain(battle: Battle, actor: Combatant, profile: AiProfile, g: AiGlobalConfig, mpGain: number, vNow: number, spend: number): number {
  const turnsMode = battle.mode === 'turns';
  const regen = turnsMode ? actor.stats.mpRegen : 0;
  let top = 0;
  for (const id of actor.skills) {
    const sk = battle.skill(id);
    if (!sk || sk.cost.resource !== 'mp' || sk.cost.amount <= 0) continue;
    const cd = turnsMode ? (actor.cooldowns[id] ?? 0) : 0;
    const wait = Math.max(1, cd);
    if (wait > g.rest.lookaheadTurns) continue;
    const need = mpNeedOf(sk, actor);
    if (need > actor.maxMp) continue;
    const without = Math.min(actor.maxMp, actor.mp - spend + regen * wait);
    const mid = Math.min(actor.maxMp, actor.mp + mpGain);
    const withRest = Math.min(actor.maxMp, mid + regen * wait);
    if (without >= need || withRest < need) continue; // Rest, skill'i yapılabilir yapan şey olmalı
    if (cd === 0 && actor.mp / Math.max(1, actor.maxMp) >= g.rest.mpBelowRatio) continue; // şu an hazır ama MP az: yalnızca MP düşükken
    const v = bestSkillValue(battle, actor, sk, profile, withRest) * g.rest.futureValueShare;
    const net = v - vNow;
    if (v > 0 && net >= g.rest.minGainShare * v) top = Math.max(top, net);
  }
  return top;
}

/** Düşman takımının, birimin `slot` yuvasındayken ona yakın dövüşle vurabileceği beklenen hasar (tek turluk; hedef paylaşımı dahil). */
function meleeIncoming(battle: Battle, actor: Combatant, slot: number): number {
  const foes = battle.living(foeSide(actor));
  const meleeRows = battle.formulas.formation.meleeRows;
  const exposed = battle.living(actor.side).filter((c) => c.board === actor.board && battle.rowRank(c.uid) < meleeRows).length;
  let total = 0;
  for (const foe of foes) {
    if (foe.board !== foe.side) continue; // tahtamıza sızmış çağrılar (yalnızca bitişik): bu hesabın dışında
    let top = 0;
    for (const id of foe.skills) {
      const sk = battle.skill(id);
      if (!sk || sk.motion !== 'melee' || sk.target === 'self') continue;
      if (battle.get(foe.uid)?.cooldowns[id]) continue;
      if (sk.cost.resource === 'mp' && foe.mp < sk.cost.amount) continue;
      if (sk.cost.resource === 'rage' && (foe.rage ?? 0) < sk.cost.amount) continue;
      if (!sk.ignoreFrontRow && !sk.ignoreReach && !battle.canMeleeFrom(foe.uid, foe.slot, sk.reach ?? 0)) continue; // saldıran kendi ön sırasında değil
      if (!sk.ignoreReach && battle.rowRank(actor.uid, slot) >= meleeRows + (sk.reach ?? 0)) continue; // hedef erişim dışında
      const d = previewForTargets(battle, foe, id, [actor]).find((p) => p.uid === actor.uid)?.damage;
      if (!d) continue;
      const share = sk.target === 'single_enemy' && !sk.ignoreReach ? 1 / Math.max(1, exposed) : 1; // tek hedefli: dikkat erişilebilir birimler arasında bölünür
      top = Math.max(top, d.avg * d.hitChance * share);
    }
    total += top;
  }
  return total;
}

/** Bir yuvadaki birimin bitişik (artı şekli) canlı dostlarının zırh aurasından beklenen hasar azalması (can-eşdeğer). */
function auraBenefit(battle: Battle, actor: Combatant, slot: number, pct: number, incoming: Map<string, number>): number {
  let total = 0;
  for (const ally of battle.living(actor.side)) {
    if (ally.uid === actor.uid || ally.board !== actor.board) continue;
    const dr = Math.abs(battle.rowOf(ally.slot) - battle.rowOf(slot));
    const dl = Math.abs(battle.laneOf(ally.slot) - battle.laneOf(slot));
    if (dr + dl > 1) continue;
    const armor = battle.effectiveStats(ally).armor;
    const gain = armorReduction(armor + actor.stats.armor * pct, battle.formulas) - armorReduction(armor, battle.formulas);
    let inc = incoming.get(ally.uid);
    if (inc === undefined) incoming.set(ally.uid, (inc = incomingDamage(battle, ally)));
    total += gain * inc;
  }
  return total;
}

interface MovePlan {
  slot: number;
  net: number;
}

/** Move Tile için en iyi plan (yoksa null): geri çekilme (kırılgan/yaralı), öne geçme (yakın dövüşçü), aura komşuluğu. Üst üste hareket yok. */
function bestMove(battle: Battle, actor: Combatant, g: AiGlobalConfig, vNow: number): MovePlan | null {
  const free = battle.freeTiles(actor.uid);
  if (free.length === 0 || battle.lastActionOf(actor.uid) === 'move') return null;
  const meleeSkills = actor.skills.map((id) => battle.skill(id)).filter((s): s is SkillDef => !!s && s.motion === 'melee' && s.target !== 'self' && !s.ignoreFrontRow && !s.ignoreReach);
  // O3 (madde 254): "kırılgan" = yakın dövüş skill'i yok VE canı eksik (tam canla geri çekilme yok: retreatHpRatio x 2'nin üstünde değil)
  const fragile = !actor.skills.some((id) => battle.skill(id)?.motion === 'melee') && ratio(actor) < Math.min(1, g.move.retreatHpRatio * 2);
  const wounded = ratio(actor) < g.move.retreatHpRatio;
  const meleeRows = battle.formulas.formation.meleeRows;
  const pickSlot = (slots: number[], adj: (slot: number) => number): number => {
    // Bitişik dost sayısı (aura/komşuluk) çok olan, sonra öne yakın, sonra küçük yuva (madde 258: ölü dostun ceset hücresi de aday)
    return [...slots].sort((a, b) => adj(b) - adj(a) || battle.rowOf(a) - battle.rowOf(b) || a - b)[0]!;
  };
  const neighbors = (slot: number) => battle.living(actor.side).filter((c) => c.uid !== actor.uid && c.board === actor.board && Math.abs(battle.rowOf(c.slot) - battle.rowOf(slot)) + Math.abs(battle.laneOf(c.slot) - battle.laneOf(slot)) <= 1).length;
  const plans: MovePlan[] = [];

  // 1) Geri çekilme: menzilli/kırılgan birim (ya da yaralı yakın dövüşçü) yakın dövüşe açıkken, düşmanın yakın dövüş tehdidi büyükse erişim dışına
  if ((fragile || wounded) && battle.rowRank(actor.uid) < meleeRows) {
    const now = meleeIncoming(battle, actor, actor.slot);
    if (now >= g.move.minAvoidShare * actor.hp) {
      const safe = free.filter((s) => battle.rowRank(actor.uid, s) >= meleeRows && meleeIncoming(battle, actor, s) < now);
      if (safe.length > 0) {
        const slot = pickSlot(safe, neighbors);
        const avoided = now - meleeIncoming(battle, actor, slot);
        const cost = vNow * (fragile ? g.move.opportunityShare : g.move.meleeOpportunityShare);
        // Terazi (Faz 3): geri çekilmek birimi bir sonraki turumuzdan önce ölmekten kurtarıyorsa kurtarma değeri de eklenir
        const saved = activeCtx && activeCtx.rescued(actor, 0, avoided) ? activeCtx.save(actor) : 0;
        if (avoided >= g.move.minAvoidShare * actor.hp && avoided + saved > cost) plans.push({ slot, net: avoided + saved - cost });
      }
    }
  }

  // 2) Öne geçme: yakın dövüşçü şu an ön sırada olmadığı için melee yapamıyor; öne boş yuva varsa potansiyel melee değeri kazanılır
  if (meleeSkills.length > 0 && !wounded && !meleeSkills.some((s) => battle.canMeleeFrom(actor.uid, actor.slot, s.reach ?? 0))) {
    const front = free.filter((s) => meleeSkills.some((sk) => battle.canMeleeFrom(actor.uid, s, sk.reach ?? 0)));
    if (front.length > 0) {
      const foes = battle.livingByDepth(foeSide(actor));
      let potential = 0;
      for (const sk of meleeSkills) {
        if ((actor.cooldowns[sk.id] ?? 0) > 0 && battle.mode === 'turns') continue;
        if (sk.cost.resource === 'mp' && !battle.freeMp && actor.mp < sk.cost.amount) continue;
        if (sk.cost.resource === 'rage' && (actor.rage ?? 0) < sk.cost.amount) continue;
        const home = foes.filter((c) => c.board === c.side);
        const rows = [...new Set(home.map((c) => battle.rowOf(c.slot)))].slice(0, meleeRows + (sk.reach ?? 0));
        const reachable = foes.filter((c) => c.board !== c.side || rows.includes(battle.rowOf(c.slot)));
        const exp = (uid: string) => {
          const p = previewForTargets(battle, actor, sk.id, [reachable.find((c) => c.uid === uid)!])[0];
          return p?.damage ? p.damage.avg * p.damage.hitChance : 0;
        };
        const single = Math.max(0, ...reachable.map((c) => exp(c.uid)));
        const total = sk.target === 'single_enemy' ? single : reachable.reduce((a, c) => a + exp(c.uid), 0);
        potential = Math.max(potential, total - (sk.cost.resource === 'mp' ? sk.cost.amount * 0.5 : 0));
      }
      const net = potential * 0.9 - vNow;
      if (potential > 0 && net >= g.move.minFrontGainShare * potential) plans.push({ slot: pickSlot(front, neighbors), net });
    }
  }

  // 3) Aura komşuluğu: zırh aurası taşıyan birim, daha çok dostun bitişiğine geçerek ve melee yeteneğini koruyarak beklenen hasarı azaltır
  const aura = actor.passive?.effect;
  if (aura?.type === 'armorAura' && battle.living(actor.side).length > 1) {
    const incoming = new Map<string, number>();
    const here = auraBenefit(battle, actor, actor.slot, aura.pct, incoming);
    const canMeleeNow = meleeSkills.some((s) => battle.canMeleeFrom(actor.uid, actor.slot, s.reach ?? 0));
    let top: MovePlan | null = null;
    for (const s of free) {
      if (canMeleeNow && !meleeSkills.some((sk) => battle.canMeleeFrom(actor.uid, s, sk.reach ?? 0))) continue; // melee yeteneğini kaybetme
      if (battle.rowOf(s) > battle.rowOf(actor.slot)) continue; // geriye çekilme: ön sıradaki dostlar korumasız kalır
      const gain = auraBenefit(battle, actor, s, aura.pct, incoming) - here;
      const net = gain - vNow * g.move.opportunityShare;
      if (gain >= g.move.minAuraGain && net > 0 && (!top || net > top.net || (net === top.net && s < top.slot))) top = { slot: s, net };
    }
    if (top) plans.push(top);
  }

  return plans.length ? plans.reduce((a, b) => (b.net > a.net ? b : a)) : null;
}

/**
 * Global skill kararı (Rest / Skip Turn / Move Tile); null = class hamlesi (ya da pas) kalır.
 * Madde 258 (Faz 3): sabit kapı yok; kazançlar class hamlesinin terazi puanıyla (öldürme, kurtarma, şifa terimleri dahil) kıyaslanır.
 * Tehlikede (can düşük ve gelen hasar büyük) dinlenme/bekleme denenmez; yalnızca geri çekilme (Move) olabilir.
 */
function chooseGlobal(battle: Battle, actor: Combatant, profile: AiProfile, g: AiGlobalConfig, pick: { option: Option; reason: AiChoice['reason'] } | null, trace?: GlobalTrace): AiChoice | null {
  // Madde 258 (Faz 3): sabit kapı YOK (eskiden öldürücü/işlevsel class hamlesinde global hiç denenmezdi). Rest/Skip/Move aynı terazide: kazançları
  // class hamlesinin puanıyla (vNow: öldürme, kurtarma, şifa... terimleri dahil) kıyaslanır; değerli hamle varken kendiliğinden kaybederler.
  const vNow = optionNet(pick?.option);
  const spend = pick && pick.option.skill.cost.resource === 'mp' && !battle.freeMp ? pick.option.skill.cost.amount : 0;
  const lowHp = ratio(actor) < g.rest.dangerHpRatio;
  const incoming = trace || lowHp ? incomingDamage(battle, actor) : 0;
  const danger = lowHp && incoming >= actor.hp * g.rest.dangerIncomingShare;
  if (trace) {
    trace.vNow = vNow;
    trace.spend = spend;
    trace.danger = { active: danger, hpRatio: ratio(actor), incoming, hp: actor.hp };
  }

  const canMove = battle.canUseGlobal(actor.uid, 'move_tile');
  const canRest = battle.canUseGlobal(actor.uid, 'rest');
  const move = canMove.ok ? bestMove(battle, actor, g, vNow) : null;
  const rest = canRest.ok && !danger ? restGain(battle, actor, profile, g, battle.globalDef('rest')?.mp ?? 0, vNow, spend) : 0;
  if (trace) {
    trace.move = move;
    if (!canMove.ok) trace.moveBlocked = canMove.reason;
    else if (!move) trace.moveBlocked = 'no profitable move (retreat / step forward / aura adjacency all fail their thresholds)';
    trace.restGain = rest;
    if (!canRest.ok) trace.restBlocked = canRest.reason;
    else if (danger) trace.restBlocked = 'danger: low HP and high incoming damage';
    else if (rest <= 0) trace.restBlocked = 'no skill becomes affordable with extra MP (or gain below minGainShare)';
  }
  const best = [
    ...(move && move.net > 0 ? [{ net: move.net, choice: { skillId: 'move_tile', slot: move.slot, targetUid: tileUid(move.slot), reason: 'move' } as AiChoice }] : []),
    ...(rest > 0 ? [{ net: rest, choice: { skillId: 'rest', reason: 'rest' } as AiChoice }] : []),
  ].sort((a, b) => b.net - a.net)[0];
  if (best) {
    if (trace) trace.outcome = `${best.choice.skillId} (net ${r2(best.net)} beats the class move value ${r2(vNow)})`;
    return best.choice;
  }
  if (danger) {
    if (trace) trace.outcome = 'danger: no rest/skip; class move stands';
    return null;
  }

  // Skip Turn: yapılacak değerli hamle yok; ya da 1 tur sonra hazır olacak güçlü skill'e kıyasla şimdiki hamle değersiz.
  // Skip artık sonraki turu yarı sürede getirir (hız x2, düşman araya girebilir): cooldown/MP bir azalma sonraki turda yine işler, yani skill hazır olur.
  if (trace) trace.skipChecks = [];
  const canSkip = battle.canUseGlobal(actor.uid, 'skip_turn');
  if (trace && !canSkip.ok) trace.skipNote = canSkip.reason;
  if (canSkip.ok) {
    if (!pick) {
      if (trace) trace.outcome = 'skip_turn: nothing worthwhile to do';
      return { skillId: 'skip_turn', reason: 'skip' };
    }
    const regen = actor.stats.mpRegen;
    for (const id of actor.skills) {
      const sk = battle.skill(id);
      if (!sk || (actor.cooldowns[id] ?? 0) !== 1) continue;
      const need = sk.cost.resource === 'mp' ? mpNeedOf(sk, actor) : 0;
      if (sk.cost.resource === 'mp' && !battle.freeMp && Math.min(actor.maxMp, actor.mp + regen) < need) continue;
      if (sk.cost.resource === 'rage' && (actor.rage ?? 0) < sk.cost.amount) continue;
      const v = bestSkillValue(battle, actor, sk, profile, Math.min(actor.maxMp, actor.mp + regen)) * g.rest.futureValueShare;
      const hit = v > 0 && vNow < g.skip.worthlessShare * v;
      trace?.skipChecks?.push({ skill: id, futureValue: v, nowValue: vNow, needBelow: g.skip.worthlessShare * v, hit });
      if (hit) {
        if (trace) trace.outcome = `skip_turn: ${id} is ready next turn (value ${r2(v)}) and the current move is worth only ${r2(vNow)}`;
        return { skillId: 'skip_turn', reason: 'skip' };
      }
    }
  }
  // Yapılacak değerli hamle yok, Skip da yok (üst üste sınırı) ama MP eksik: Rest hiç değilse MP biriktirir
  if (!pick && canRest.ok && !danger) {
    if (trace) trace.outcome = 'rest: no move to make, at least accumulate MP';
    return { skillId: 'rest', reason: 'rest' };
  }
  if (trace) trace.outcome = 'no global skill is worth it: class move stands';
  return null;
}

// ---------------------------------------------------------------- karar açıklaması (maç kaydı için)

/** Birimin kısa, okunur etiketi: "P0:Warrior" (P/E = taraf, sayı = takım içi sıra) - maç kaydı ve açıklama bunu kullanır. */
export function unitLabel(c: Pick<Combatant, 'uid' | 'side' | 'name' | 'displayName'>): string {
  // Özel adlı birim (savaş kurulumu: UnitSetup.displayName): sınıf adının yanında tırnak içinde
  return `${c.side === 'party' ? 'P' : 'E'}${c.uid.split('-').pop()}:${c.name}${c.displayName ? ` "${c.displayName}"` : ''}`;
}

/** Açıklamadaki tek bir aday (skill + hedef/alan) ve puanları. */
export interface AiCandidate {
  skill: string;
  name: string;
  /** Hedef birim (tek hedefli skill) ya da alan skill'inin merkez birimi; kendine/herkese skill'lerde tanımsız. */
  target?: string;
  /** Alan/şerit skill'inde merkez hücre (yuva numarası, 0 tabanlı). */
  center?: number;
  /** Şekil skill'inde: şekil adı ('rect 2x3', 'row', 'column', 'plus') ve kapsadığı tüm hücreler (match-log). */
  shape?: string;
  cells?: number[];
  /** area_any (Smoke Bomb): alanın atıldığı tahta ('own' = kendi tarafı, 'foe' = karşı taraf). */
  board?: 'own' | 'foe';
  /** İsabet/kaçınma durumlarının (Blinded/Shrouded) koruma değeri (can-eşdeğer; 0 ise yazılmaz). */
  mitigation?: number;
  /** Vurulan/etkilenen tüm birimler (alan, yan vuruş, herkes) ve bunların kaçı düşman. */
  hits: string[];
  enemyHits: number;
  /** Hedeflerin canı/kalkanıyla sınırlı toplam beklenen hasar (isabet şansıyla çarpılmış; alan skill'inde TÜM hedeflerin toplamı). */
  dmg: number;
  kills: string[];
  heal: number;
  selfHeal: number;
  shield: number;
  burn: number;
  buff: number;
  revive: number;
  /** MP/can bedelinin skora yansıyan ağırlıklı değeri (ai.json mpCostWeight/hpCostWeight). */
  cost: number;
  /** Genel değer - bedel (yedek seçim ve global kararlar bunu kullanır). */
  net: number;
  /** Ana hedefe isabet şansı (hasar veriyorsa). */
  hit?: number;
  /** Hedef başına beklenen hasar (en çok 8): ortalama hasar, isabet şansı, bu vuruşla öldürür mü. */
  perTarget?: Array<{ unit: string; avg: number; hit: number; lethal: boolean; killChance?: number }>;
  /** Çağrı adayında tahmini çağrı değeri (birimin en iyi ham hasarı x ömür x summonValueShare). */
  summonValue?: number;
  /** Çağrı adayında çağrı yuvası (kendi tahtası). */
  summonSlot?: number;
  /** Ceset tüketen çağrı adayında: tüketilecek ceset (tehlike puanı + gerekçe) ve seçilmeyen diğer cesetler. */
  corpse?: { unit: string; danger: number; why: string };
  otherCorpses?: Array<{ unit: string; danger: number }>;
  /** Etiketler: summon, empowered (ceset tüketilecek), unfed (ceset yok), taunt, guard, selfBuff, hpCost (düşük can kuralına tabi; oranlı can bedeli (Wail) taşımaz), reserve (skill MP ayırır: ai.reserveMp). */
  tags: string[];
  /** Debuff silme değeri (Mana Barrier), Dark Bond değeri ve yarım turn tempo değeri (0 ise yazılmaz). */
  cleanse?: number;
  bond?: number;
  tempo?: number;
  /** Skill'in turn bedeli 1'den küçükse (yarım turn). */
  turnCost?: number;
  /** Hexer laneti ertelenmiş değeri (Omen + Wither; 0 ise yazılmaz) ve Omen/Doom/Jinx notları. */
  curse?: number;
  notes?: string[];
  /** Terazi puanı (can-eşdeğer; tüm adaylarda) ve terim terim dökümü (damage, kill, save, heal, shield, revive, control, protect, summon, ... cost, cooldown). */
  score?: number;
  terms?: Record<string, number>;
  /** Diriltme adayında terazinin seçtiği boş hücre. */
  reviveSlot?: number;
  /** chosen: seçildi; lost: pozitif puanlı ama daha düşük; blocked: MP ayırma yüzünden elendi; skipped: puanı pozitif değil. */
  verdict: 'chosen' | 'lost' | 'blocked' | 'skipped';
  /** blocked/skipped nedeni ya da kısa not. */
  note?: string;
}

export interface AiExplanation {
  uid: string;
  actor: string;
  profile: string;
  /** Kararın zorluk seviyesi (madde 258; Medium = tam terazi). */
  difficulty: AiDifficulty;
  priorities: string[];
  focusRule: string;
  /** Verilen karar (chooseAction ile birebir aynı); null = hiçbir şey yapılamadı (tur pas). */
  final: { skill: string; name: string; target?: string; slot?: number; board?: 'own' | 'foe'; corpse?: string; reason: string } | null;
  /** Tek cümlelik özet: hangi kural/öncelik neden bu kararı verdirdi. */
  why: string;
  /** Öncelik sırası boyunca her seçici: picked (seçti) / none (uymadı) ve gerekçe. */
  steps: Array<{ priority: string; result: 'picked' | 'none'; detail: string }>;
  /** Kazanan önceliğin seçim kuralı (puan formülü). */
  winnerRule?: string;
  candidates: AiCandidate[];
  /** Kullanılamayan skill'ler ve nedeni (cooldown, MP, Rage, menzil, hedef yok...). */
  rejected: Array<{ skill: string; name: string; reason: string }>;
  /** MP ayırma (reserveMp): ertelenen saldırıların nedeni. */
  reserves: Array<{ skill: string; needMp: number; inTurns: number }>;
  /** Global skill (Rest / Skip / Move) değerlendirmesi. */
  global: GlobalTrace;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Yapay zeka kararının açıklaması: aynı durumda chooseAction'ın verdiği kararı (final) ve değerlendirilen TÜM adayları, puanlarını,
 * elenme nedenlerini ve global skill değerlendirmesini verir. Saf ve belirleyici; motora ve RNG'ye dokunmaz, seçimi etkilemez:
 * karar chooseAction ile hesaplanır, açıklama o hesabın izinden (AiTrace) okunur. Yeni karar kuralı/öncelik eklenince burası da güncellenir.
 */
export function explainChoice(battle: Battle, actorUid: string, config: AiConfig, opts?: { difficulty?: AiDifficulty }): AiExplanation | null {
  const actor = battle.get(actorUid);
  if (!actor || actor.hp <= 0) return null;
  const profileName = config.profiles[actor.ai ?? config.defaultProfile] ? (actor.ai ?? config.defaultProfile) : config.defaultProfile;
  const profile = config.profiles[profileName];
  if (!profile) return null;
  const trace: AiTrace = { options: [], reserves: [], steps: [] };
  const difficulty = opts?.difficulty ?? 'medium';
  const choice = chooseAction(battle, actorUid, config, trace, { difficulty });
  const pick = trace.classPick ?? null;
  const skillName = (id: string) => battle.skill(id)?.name ?? battle.globalDef(id)?.name ?? id;
  const termText = (t: Record<string, number>) => Object.entries(t).map(([k, v]) => `${k} ${r1(v)}`).join(' + ');

  const steps: AiExplanation['steps'] = [
    pick
      ? { priority: 'value', result: 'picked', detail: `${skillName(pick.option.skill.id)}${pick.option.targetUid ? ` -> ${labelOf(battle, pick.option.targetUid)}` : ''} score ${r1(pick.option.score)} (${pick.reason})` }
      : { priority: 'value', result: 'none', detail: 'no option has a positive value' },
  ];
  const candidates: AiCandidate[] = trace.options.map((o) => {
    const centerUid = o.anchorSlot !== undefined ? o.targets.find((t) => t.board === (o.board ?? foeSide(actor)) && t.slot === o.anchorSlot)?.uid : undefined;
    const previews = previewForTargets(battle, actor, o.skill.id, o.targets, centerUid);
    const perTarget = previews
      .filter((p) => p.damage)
      .slice(0, 8)
      .map((p) => ({ unit: labelOf(battle, p.uid), avg: r1(p.damage!.avg), hit: r2(p.damage!.hitChance), lethal: p.damage!.hpLoss >= (battle.get(p.uid)?.hp ?? Infinity), ...(o.killP[p.uid] ? { killChance: r2(o.killP[p.uid]!) } : {}) }));
    const firstHit = previews.find((p) => p.damage)?.damage;
    const c: AiCandidate = {
      skill: o.skill.id,
      name: o.skill.name,
      ...(o.targetUid ? { target: labelOf(battle, o.targetUid) } : {}),
      ...(o.anchorSlot !== undefined ? { center: o.anchorSlot, shape: shapeLabel(o.skill.area!), cells: o.cells ?? [] } : {}),
      hits: o.targets.map((t) => unitLabel(t)),
      enemyHits: o.targets.filter((t) => t.side !== actor.side).length,
      dmg: r1(o.damage),
      kills: o.kills.map(unitLabel),
      heal: r1(o.heal),
      selfHeal: r1(o.selfHeal),
      shield: r1(o.shield),
      burn: r1(o.burn),
      buff: r1(o.buff),
      ...(o.board ? { board: o.board === actor.side ? ('own' as const) : ('foe' as const) } : {}),
      ...(o.mitigation > 0 ? { mitigation: r1(o.mitigation) } : {}),
      ...(o.cleanse > 0 ? { cleanse: r1(o.cleanse) } : {}),
      ...(o.bond > 0 ? { bond: r1(o.bond) } : {}),
      ...(o.tempo > 0 ? { tempo: r1(o.tempo) } : {}),
      ...(o.curse > 0 ? { curse: r1(o.curse) } : {}),
      ...(o.notes.length > 0 ? { notes: [...o.notes] } : {}),
      ...(battle.turnCostOf(o.skill.id) < 1 ? { turnCost: battle.turnCostOf(o.skill.id) } : {}),
      revive: r1(o.revive),
      ...(o.reviveSlot !== undefined ? { reviveSlot: o.reviveSlot } : {}),
      cost: r1(o.cost),
      net: r1(o.score),
      score: r1(o.score),
      terms: { ...o.terms },
      ...(firstHit ? { hit: r2(firstHit.hitChance) } : {}),
      ...(perTarget.length > 0 ? { perTarget } : {}),
      ...(o.summon ? { summonValue: r1(o.summonValue) } : {}),
      ...(o.summonSlot !== undefined ? { summonSlot: o.summonSlot } : {}),
      ...corpseInfo(battle, o),
      tags: [o.summon && 'summon', o.empowered === true && 'empowered', o.empowered === false && 'unfed', o.taunt && 'taunt', o.guard && 'guard', o.pureBuff && 'selfBuff', o.hpCost && 'hpCost', o.skill.ai?.reserveMp && 'reserve'].filter((t): t is string => !!t),
      verdict: 'skipped',
    };
    if (pick && o === pick.option) c.verdict = 'chosen';
    else if (o.blocked) {
      c.verdict = 'blocked';
      c.note = blockedReason(battle, actor, o, trace.reserves);
    } else if (o.score > 0) c.verdict = 'lost';
    else c.note = 'no positive value';
    return c;
  });
  // Okunurluk: seçilen en üstte, sonra puanı yüksek olanlar, sonra elenenler
  const order = { chosen: 0, lost: 1, skipped: 2, blocked: 3 } as const;
  candidates.sort((a, b) => order[a.verdict] - order[b.verdict] || (b.score ?? b.net) - (a.score ?? a.net));

  const rejected: AiExplanation['rejected'] = [];
  for (const id of actor.skills) {
    const can = battle.canUse(actor.uid, id);
    if (!can.ok) rejected.push({ skill: id, name: skillName(id), reason: describeCanUse(battle, actor, id, can.reason) });
    else if (!trace.options.some((o) => o.skill.id === id)) rejected.push({ skill: id, name: skillName(id), reason: 'no valid target' });
  }

  const final = choice ? { skill: choice.skillId, name: skillName(choice.skillId), ...(choice.targetUid ? { target: labelOf(battle, choice.targetUid) } : {}), ...(choice.slot !== undefined ? { slot: choice.slot } : {}), ...(choice.board ? { board: choice.board === actor.side ? ('own' as const) : ('foe' as const) } : {}), ...(choice.corpseUid ? { corpse: labelOf(battle, choice.corpseUid) } : {}), reason: choice.reason } : null;
  const chosen = candidates.find((c) => c.verdict === 'chosen');
  const runnerUp = candidates.find((c) => c.verdict === 'lost');
  const tag = (c: AiCandidate) => `${c.name}${c.target ? ` -> ${c.target}` : ''}${c.reviveSlot !== undefined ? ` @cell ${c.reviveSlot}` : ''}`;
  let why: string;
  if (!choice) why = 'No usable action: the turn is passed.';
  else if (choice.reason === 'rest' || choice.reason === 'skip' || choice.reason === 'move') {
    why = `Global skill "${skillName(choice.skillId)}": ${trace.global?.outcome ?? choice.reason}. ${chosen ? `The class move would have been ${tag(chosen)} (score ${chosen.score}).` : 'No class move was available.'}`;
  } else {
    why = `Highest value (${choice.reason}): ${chosen ? `${tag(chosen)} score ${chosen.score} = ${termText(chosen.terms ?? {})}` : skillName(choice.skillId)}${runnerUp ? `; next best ${tag(runnerUp)} score ${runnerUp.score} = ${termText(runnerUp.terms ?? {})}` : ''}.`;
    if (trace.global?.gate) why += ` Global skills: ${trace.global.gate}.`;
    else if (trace.global?.outcome) why += ` Global skills: ${trace.global.outcome}.`;
  }
  const g = trace.global ?? { enabled: false };
  const rules = difficultyRules(config, difficulty);
  const vc = { ...DEFAULT_VALUE, ...(config.value ?? {}), ...(rules.value ?? {}), ...(rules.horizon !== undefined ? { horizon: rules.horizon } : {}) };
  return {
    uid: actor.uid,
    actor: unitLabel(actor),
    profile: profileName,
    difficulty,
    priorities: profile.priorities,
    focusRule: profile.focus,
    final,
    why,
    steps,
    winnerRule: `value scale (difficulty ${difficulty}, horizon ${vc.horizon} turns): score = damage + pressure + kill + save + heal + shield + revive + control + protect + summon + bond + curse + mitigation + cleanse + burn + silence + tempo (+ buff for self-buffs) - overkill - patience - cost - cooldown; ${rules.pickTop && rules.pickTop > 1 ? `picks among the best ${rules.pickTop} (deterministic, seed + turn + unit)` : 'highest wins'}`,
    candidates,
    rejected,
    reserves: trace.reserves.map((r) => ({ skill: r.skill, needMp: r.need, inTurns: r.turns })),
    global: { ...g, ...(g.move ? { move: { slot: g.move.slot, net: r1(g.move.net) } } : {}) },
  };
}

/** Çağrı adayının ceset bilgisi (açıklama): tüketilecek ceset (tehlike + gerekçe) ve seçilmeyen diğer cesetler. */
function corpseInfo(battle: Battle, o: Option): Pick<AiCandidate, 'corpse' | 'otherCorpses'> {
  const list = o.corpseOptions ?? [];
  const chosen = list.find((c) => c.uid === o.corpseUid);
  if (!chosen) return {};
  const others = list.filter((c) => c !== chosen).sort((a, b) => b.danger - a.danger || a.slot - b.slot);
  return {
    corpse: { unit: labelOf(battle, chosen.uid), danger: chosen.danger, why: chosen.why },
    ...(others.length > 0 ? { otherCorpses: others.map((c) => ({ unit: labelOf(battle, c.uid), danger: c.danger })) } : {}),
  };
}

function labelOf(battle: Battle, uid: string): string {
  const tile = /^tile:(\d+)$/.exec(uid);
  if (tile) return `cell ${tile[1]}`;
  const c = battle.get(uid);
  return c ? unitLabel(c) : uid;
}

/** Bir seçeneğin neden "blocked" olduğu (MP ayrıldı ve ayrılan skill daha değerli). */
function blockedReason(battle: Battle, actor: Combatant, o: Option, reserves: Reserve[]): string {
  const r = reserves.find((x) => actor.mp - o.skill.cost.amount + actor.stats.mpRegen * x.turns < x.need);
  if (r) return `MP kept in reserve for ${battle.skill(r.skill)?.name ?? r.skill} (needs ${r.need} MP in ${r.turns} turn(s); would leave ${actor.mp - o.skill.cost.amount}; its value ${r1(r.value)} beats this attack)`;
  return 'blocked';
}

function describeCanUse(battle: Battle, actor: Combatant, id: string, reason: string): string {
  const sk = battle.skill(id);
  if (reason === 'On cooldown') return `on cooldown (${actor.cooldowns[id] ?? 0} own turn(s) left)`;
  if (reason === 'Not enough MP' && sk) return `not enough MP (needs ${sk.cost.amount}, has ${actor.mp})`;
  if (reason === 'Not enough rage' && sk) return `not enough Rage (needs ${sk.cost.amount}, has ${actor.rage ?? 0})`;
  if (reason === 'Not enough HP' && sk) return `not enough HP (cost ${skillCostAmount(sk.cost, actor)}, has ${actor.hp})`;
  return reason.charAt(0).toLowerCase() + reason.slice(1);
}
