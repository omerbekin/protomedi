import type { Battle } from './battle';
import { previewForTargets } from './preview';
import { attributePower } from './stats';
import type { Combatant, SkillDef } from './types';

/**
 * YAPAY ZEKA DEĞER TERAZİSİ (docs/design/ai-priorities.md 6.1, Faz 1-3; madde 254 kararları K1-K10). Saf ve belirleyici: rastgelelik yok, motora dokunmaz.
 * Her aday (skill + hedef/alan/hücre) TEK bir can-eşdeğer sayıyla puanlanır; sabit öncelik sırası YOK. Terimler (hepsi aynı birimde):
 *  damage (beklenen hasar), pressure (hasarın hedefin kalan katkısından götürdüğü pay), kill (öldürme ihtimali x hedefin kalan katkısı), save (bir sonraki
 *  turumuzdan önce ölecek dostu kurtarma: öldürme, şifa, kalkan, Guard, Taunt, sersemletme ile), heal, shield (emilmesi beklenen kısım), revive (dirilenin
 *  ufuk içindeki katkısı; tur sayacı 0'dan başlar), control (Stun/Slow/Haste/Wound/Fortify...), protect (Taunt/Guard yönlendirme - Defender riski), summon,
 *  bond, curse, mitigation (Blinded/Shrouded/Jinxed), cleanse, burn, tempo, buff; eksi bedel (MP/can) ve cooldown bedeli (ultimate'a küçük bekleme bedeli).
 * Ufuk (data/ai.json > value.horizon, Ömer: 3 tur): "kalan katkı" = birimin tur başına değeri x ufuk içinde kaç tur oynayacağı (hız ve tur sayacından).
 */

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface AiValueConfig {
  /** Değerlendirme ufku: kullanıcının kaç kendi turu (Ömer: 3). */
  horizon: number;
  /** Birimin tur başına değeri = en iyi skill'inin ham değeri x bu pay (zırh, isabet, fazla vuruş için iskonto). */
  contributionShare: number;
  /** Öldürme terimi çarpanı (öldürme ihtimali x kalan katkı x killWeight). */
  killWeight: number;
  /** Öldürmeyen hasarın, hedefin kalan katkısından götürdüğü payın çarpanı (odak ateşi: az canlı / tehlikeli hedef daha değerli). */
  pressureShare: number;
  /** Kurtarma terimi çarpanı (kurtarılan dostun kalan katkısı + canı). */
  saveWeight: number;
  /** Diriltme terimi çarpanı (Soru P: Paladin kimliği; 1 = nötr). */
  reviveWeight: number;
  /** Dirilenin geri gelen canının değere katılan payı. */
  reviveHpShare: number;
  /** Kalkan: emilmesi beklenen hasar = min(kalkan, dosta tur başına gelecek hasar x shieldRounds). */
  shieldRounds: number;
  /** Taunt/Guard: yönlendirilen hasarın değere katılan payı (Defender daha dayanıklı; hasar yok olmaz, yer değiştirir). */
  protectShare: number;
  /** Cooldown bedeli: skill'in brüt değeri x cooldown x bu pay (ultimate'a küçük bekleme bedeli, madde 254 K5). */
  cooldownCostShare: number;
  /** Kontrol (durum) terimlerinin çarpanı. */
  controlWeight: number;
  /**
   * Madde 258: "savaş belli" sezgiseli (ValueContext.outcome) güvenlik payı: kazanan taraf rakibini ufuk içinde VE rakibin onu bitireceği sürenin en çok
   * bu payı kadar zamanda bitirmeli (0,5: en az iki kat hızlı). Savaş belliyse diriltme değeri 0.
   */
  decidedMargin: number;
  /** MP ayırma (reserveMp): ayrılan skill'in beklenen değeri = şu anki en iyi puanı x bu pay (bekleme iskontosu); değeri bunu geçen saldırı ertelenmez. */
  reserveValueShare: number;
  /** Mana yakmanın "engellenen hamle" değerinde ufuk çarpanı (MP kaybı yenilenene kadar sürer: birimin ufuktaki turu x bu). */
  manaHorizonMult: number;
}

/**
 * Zorluk seviyesi kuralları (madde 258, Faz 5; data/ai.json > difficulty.<seviye>; ai-priorities.md 6.7). Medium = tam terazi (boş kural). Hepsi belirleyici:
 * Easy'nin "hatası" savaş seed'i + tur + birimden türeyen sabit sayıdır (motorun RNG'sine dokunmaz).
 */
export interface AiDifficultyConfig {
  /** Değerlendirme ufku (kendi turu); yoksa value.horizon. */
  horizon?: number;
  /** Terazi ayarlarının bu seviyedeki üzerine yazılanları (Easy: saveWeight 0 = kurtarma yok, controlWeight 0 = kontrol değeri yok). */
  value?: Partial<AiValueConfig>;
  /** Öldürme (ve öldürmeyle kurtarma) terimi yalnızca öldürme ihtimali bu ve üstündeyse (Easy: yalnızca kesin öldürme). */
  killMinChance?: number;
  /** Seçim katmanı: puanı pozitif en iyi `pickTop` aday (puanı en iyinin en az `pickWithin` payı olanlar) arasından `pickWeights` ağırlıklı belirleyici seçim. */
  pickTop?: number;
  pickWeights?: number[];
  pickWithin?: number;
  /** Global eylemler: 'all' (terazi) ya da 'restWhenIdle' (yalnızca yapacak hamle yokken Rest; Move/Skip yok). */
  globals?: 'all' | 'restWhenIdle';
  /** Takım odak ateşi: aynı düşmana yönelmesi tahmin edilen her dost için baskı (pressure) terimine bu pay eklenir. */
  focusFire?: number;
  /** Fazla vurmama: zaten ölecek hedefe (tur başı DoT/zemin tiki ya da ondan önce oynayacak dostlarımızın tahmini vuruşları) hasar/öldürme/baskı değerinin kalan payı. */
  overkillShare?: number;
  /** Uygun anı bekleme: yığın patlatan (detonate) skill'i, öldürmeden ve yığın dolmaya 1 kala değilken kullanmanın değer payı. */
  patience?: number;
  /** Telgraf terazisi ayarlarının bu seviyedeki üzerine yazılanları (ai.ts > AiTelegraphConfig; Easy: hookCombo 0). */
  telegraph?: Partial<{ hitShare: number; denyShare: number; hookCombo: number; dodgeOpportunityShare: number; anchorShare: number }>;
  note?: string;
}

/** Varsayılan (ai.json'da value bloğu yoksa; testlerde de aynısı ai.json'da durur). */
export const DEFAULT_VALUE: AiValueConfig = {
  horizon: 3,
  contributionShare: 0.6,
  killWeight: 1,
  pressureShare: 0.25,
  saveWeight: 1,
  reviveWeight: 1,
  reviveHpShare: 0.5,
  shieldRounds: 2,
  protectShare: 0.5,
  cooldownCostShare: 0.03,
  controlWeight: 1,
  decidedMargin: 0.5,
  reserveValueShare: 0.85,
  manaHorizonMult: 2,
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (c: Combatant) => (c.maxHp > 0 ? c.hp / c.maxHp : 0);
const foeSideOf = (c: Combatant) => (c.side === 'party' ? 'enemy' : 'party');
const ATTACK_TARGETS = ['single_enemy', 'area_enemies', 'all_enemies', 'random_enemies', 'everyone'];

/** Skill'in tek kullanımlık HAM değeri (zırhsız, kritiksiz): hasar/şifa stat x güç toplamı, tur şifası x tur, kalkan x 0,5. */
export function skillRawValue(battle: Battle, stats: Combatant['stats'], skill: SkillDef): number {
  let v = 0;
  for (const e of skill.effects) {
    if (e.type === 'damage' || e.type === 'heal') v += attributePower(stats, e.scale, battle.formulas) * e.power;
    else if (e.type === 'hot') v += attributePower(stats, e.scale, battle.formulas) * e.power * e.turns;
    else if (e.type === 'shield') v += attributePower(stats, e.scale, battle.formulas) * e.power * 0.5;
  }
  return v;
}

/** Bir düşmanın tahmini hamlesi: kime vuracağı (kendi YZ odak kuralıyla) ve beklenen hasarı. */
export interface FoeIntent {
  foe: string;
  target: string;
  hit: number;
  magic: boolean;
  /** Bir sonraki turumuzdan ÖNCE mi oynayacak (turns modunda sıra tahmini; test modunda hep evet). */
  before: boolean;
  /** Ulaşabildiği birimlerimiz (tur dolusu hasar dağılımı için). */
  reach: string[];
  /** Odak kuralında eşit (berabere) adaylar: tahmin belirsiz, vuruş aralarında eşit bölünür (`target` ilki). */
  focus: string[];
}

/** Bir düşman vuruşunun bir birimimize düşen payı (eşitlikte bölünmüş). */
export interface FoeHit {
  foe: string;
  target: string;
  hit: number;
  before: boolean;
}

/**
 * Tek bir karar boyunca değer bağlamı (önbellekli). `focusOf`: düşmanın YZ profilinin odak kuralı (lowest_hp | lowest_ratio).
 */
export class ValueContext {
  private readonly tv = new Map<string, number>();
  readonly intents: FoeIntent[];
  /** intents, odak eşitliklerinde bölünmüş payları ile (kurtarma/sersemletme/taunt hesapları bunu kullanır). */
  readonly hits: FoeHit[];
  /** Dosta bir tur dolusu (tüm düşmanlar) ve bir sonraki turumuzdan önce gelecek beklenen hasar. */
  readonly round = new Map<string, number>();
  readonly roundMagic = new Map<string, number>();
  readonly before = new Map<string, number>();
  private readonly ticks: number;
  /** Zorluk kuralları (chooseAction doldurur; Medium = boş). */
  diff: AiDifficultyConfig = {};

  constructor(
    readonly battle: Battle,
    readonly actor: Combatant,
    readonly vc: AiValueConfig,
    readonly focusOf: (c: Combatant) => 'lowest_hp' | 'lowest_ratio',
  ) {
    const thr = battle.formulas.turn.threshold;
    this.ticks = (vc.horizon * thr) / Math.max(1, battle.speedOf(actor));
    this.intents = predictFoes(battle, actor, focusOf);
    this.hits = this.intents.flatMap((i) => i.focus.map((t) => ({ foe: i.foe, target: t, hit: i.hit / i.focus.length, before: i.before })));
    // before: odak hedefine yoğun (tehlike: "sıradaki Archer kimi vuracak"); round (kalkan/Fortify/Taunt miktarları): yarısı odak hedefe, yarısı ulaşabildiği
    // birimlere eşit (tahmin kaba; eşitlikte herkesin aynı birime yığılmasını yumuşatır)
    for (const i of this.intents) {
      const addTo = (uid: string, v: number) => {
        this.round.set(uid, (this.round.get(uid) ?? 0) + v);
        if (i.magic) this.roundMagic.set(uid, (this.roundMagic.get(uid) ?? 0) + v);
      };
      for (const u of i.focus) addTo(u, (i.hit * 0.5) / i.focus.length);
      for (const u of i.reach) addTo(u, (i.hit * 0.5) / Math.max(1, i.reach.length));
    }
    for (const h of this.hits) if (h.before) this.before.set(h.target, (this.before.get(h.target) ?? 0) + h.hit);
  }

  /** Birimin tur başına değeri (en iyi skill'inin ham değeri x contributionShare). */
  turnValue(u: Combatant): number {
    let v = this.tv.get(u.uid);
    if (v === undefined) {
      // Yalnızca bedeli (yakında) ödenebilen skill'ler: MP'si bir tur yenilenmeyle yetmeyen pahalı skill o birimin tur değerini şişirmez
      const mpSoon = u.mp + (this.battle.mode === 'turns' ? u.stats.mpRegen : 0);
      v = Math.max(0, ...u.skills.map((id) => {
        const sk = this.battle.skill(id);
        if (!sk) return 0;
        // (ölü birim: diriltme sonrası MP'si belirsiz; süzgeç yok)
        if (u.hp > 0 && sk.cost.resource === 'mp' && !this.battle.freeMp && sk.cost.amount > mpSoon) return 0;
        if (u.hp > 0 && sk.cost.resource === 'rage' && !this.battle.freeRage && (u.rage ?? 0) < sk.cost.amount) return 0;
        return skillRawValue(this.battle, u.stats, sk);
      })) * this.vc.contributionShare;
      this.tv.set(u.uid, v);
    }
    return v;
  }

  /**
   * Ufuk içinde (kullanıcının `horizon` kendi turu kadar zaman) birimin kaç tur oynayacağı: (tur sayacı + hız x zaman) / eşik. Tur sayacı dolu olan
   * yakında oynar (Ömer: şifa/kurtarma değeri daha yüksek); dirilen 0 sayaçla başlar (`counter` = 0). Test modunda sıra yok: ufuk kadar. Çağrıda kalan ömürle sınırlı.
   */
  turnsWithin(u: Combatant, counter = u.turnCounter): number {
    const H = this.vc.horizon;
    let n = this.battle.mode === 'turns' ? (Math.max(0, counter) + Math.max(1, this.battle.speedOf(u)) * this.ticks) / this.battle.formulas.turn.threshold : H;
    if (u.uid === this.actor.uid) n = H;
    if (u.lifespan !== undefined) n = Math.min(n, Math.max(0, u.lifespan));
    return Math.max(0, Math.min(n, H * 3));
  }

  /** Varsayımsal birim (çağrı): hızı `spd`, sayacı 0 iken ufukta kaç tur oynar (en çok `cap`: çağrının ömrü). */
  turnsForSpeed(spd: number, cap = Infinity): number {
    const H = this.vc.horizon;
    const n = this.battle.mode === 'turns' ? (Math.max(1, spd) * this.ticks) / this.battle.formulas.turn.threshold : H;
    return Math.max(0, Math.min(n, cap, H * 3));
  }

  /** Kalan katkı: tur başına değer x ufuk içindeki tur sayısı. */
  contribution(u: Combatant, counter?: number): number {
    return this.turnValue(u) * this.turnsWithin(u, counter);
  }

  /** Dostun bir sonraki turumuzdan önce gelecek beklenen hasarı canını + kalkanını geçiyor mu (tehlike, K2)? */
  inDanger(a: Combatant): boolean {
    const t = this.before.get(a.uid) ?? 0;
    return t > 0 && t >= a.hp + a.shield + a.magicShield;
  }

  /** Kurtarma değeri: dostun kalan katkısı + canı (x saveWeight), dostun ölüm ihtimaliyle (Lucky Escape hakkı varsa x (1 - şans); madde 258). */
  save(a: Combatant): number {
    return this.vc.saveWeight * (this.contribution(a) + a.hp) * (1 - this.battle.luckyEscapeChance(a.uid));
  }

  /**
   * Savaşın sonucu ufuk içinde belli mi (madde 258, Ömer: "diriltme savaşın galibini değiştirmeyecekse değeri 0")? Basit sezgisel: iki tarafın
   * "bitirme süresi" (tur):
   *  - hız = her canlı birimin tahmini hamlesi (düşman tahminiyle aynı model: odak kuralı + en iyi beklenen vuruş, isabet dahil) x ufukta oynayacağı
   *    tur / ufuk; can = canlı birimlerin can + kalkan toplamı. tUs = düşmanın canı / bizim hız, tThem = bizim can / düşmanın hızı.
   *  - 'win': tUs <= ufuk VE tUs <= decidedMargin x tThem (kalan düşmanlar ufukta ölüyor ve biz onları, onların bizi bitireceğinden en az 1/margin kat
   *    hızlı bitiriyoruz). Ek birim HESABA KATILMAZ (dirilenle ancak kesinleşiyorsa diriltme sonucu değiştiriyordur).
   *  - 'loss': aynısı ters yönde, `extra` (ör. dirilecek birimin ufuk katkısı ve canı) BİZE EKLENMİŞKEN de geçerliyse (dirilen bunu değiştirmiyor).
   *  - aksi halde null (savaş açık). Şifa, ölümle azalan hız ve sıra ayrıntısı yok sayılır (kaba ama belirleyici; güvenlik payı decidedMargin).
   */
  outcome(extra?: { dmg: number; hp: number }): 'win' | 'loss' | null {
    const m = this.vc.decidedMargin;
    const H = Math.max(1, this.vc.horizon);
    const pool = (side: Combatant['side']) => sum(this.battle.living(side).map((c) => c.hp + c.shield + c.magicShield));
    const ourHp = pool(this.actor.side);
    const foeHp = pool(foeSideOf(this.actor));
    if (foeHp <= 0) return 'win';
    // Tur başına (bir kendi turumuz kadar zamanda) beklenen hasar: her birimin tahmini vuruşu x ufukta oynayacağı tur / ufuk
    const foeRate = sum(this.intents.map((i) => i.hit * this.turnsWithin(this.battle.get(i.foe)!))) / H;
    const ourRate = sum(this.ownIntents().map((i) => i.hit * this.turnsWithin(this.battle.get(i.foe)!))) / H;
    // Bitirme süreleri (tur): biz onları / onlar bizi
    const tUs = ourRate > 0 ? foeHp / ourRate : Infinity;
    const tThem = foeRate > 0 ? ourHp / foeRate : Infinity;
    // Kazanç ek birim OLMADAN da kesinse 'win' (ek birim kazancı kesinleştiriyorsa sonucu değiştiriyordur: null)
    if (ourHp > 0 && tUs <= H && tUs <= m * tThem) return 'win';
    // Kayıp ek birimle BİRLİKTE de kesinse 'loss'
    const ourHpX = ourHp + (extra?.hp ?? 0);
    const ourRateX = ourRate + (extra?.dmg ?? 0) / H;
    const tUsX = ourRateX > 0 ? foeHp / ourRateX : Infinity;
    const tThemX = foeRate > 0 ? ourHpX / foeRate : Infinity;
    if (ourHpX <= 0 || (tThemX <= H && tThemX <= m * tUsX)) return 'loss';
    return null;
  }

  /**
   * Mana yakmanın "engellenen hamle" değeri (madde 258, Faz 2; Drain Field, Mana Steal, Spell Ward kancası): düşman `f`'nin `amount` MP'si giderse ufukta
   * kaç MP'li skill kullanımı kaybeder x o skill'in bedelsiz (ya da MP'siz) en iyi hamlesine göre fazladan değeri. Ufuktaki MP havuzu = MP + yenilenme x tur;
   * kullanım sayısı turla ve cooldown'la sınırlı; sürekli (kesirli) sayım. MP'li skill'leri arasında en çok değer kaybettireni alınır. MP'siz birimde 0.
   */
  manaDenial(f: Combatant, amount: number): number {
    if (amount <= 0 || f.hp <= 0 || f.maxMp <= 0) return 0;
    // Skill'in tek kullanımlık değeri: ham değer + zemin etkisi (güç x tur x 0,7), alan skill'inde x vurabileceği hedef (en çok 3; karşı tarafın canlı sayısı)
    const opp = Math.min(3, this.battle.living(f.side === 'party' ? 'enemy' : 'party').length);
    const raw = (sk: SkillDef) => {
      let v = skillRawValue(this.battle, f.stats, sk);
      for (const e of sk.effects) if (e.type === 'ground') v += attributePower(f.stats, e.scale, this.battle.formulas) * e.power * e.turns * 0.7;
      return v * (this.battle.isAreaSkill(sk.id) && ATTACK_TARGETS.includes(sk.target) ? Math.max(1, opp) : 1);
    };
    const skills = f.skills.map((id) => this.battle.skill(id)).filter((sk): sk is SkillDef => !!sk);
    const free = Math.max(0, ...skills.filter((sk) => sk.cost.resource !== 'mp' || sk.cost.amount <= 0).map(raw));
    // MP etkisi kalıcıdır (yenilenene kadar): mana ufku = birimin ufuktaki turu x manaHorizonMult (tam tur)
    const T = Math.max(1, Math.round(this.turnsWithin(f) * this.vc.manaHorizonMult));
    const pool = f.mp + (this.battle.mode === 'turns' ? f.stats.mpRegen * T : 0);
    // MP'li her skill: bedelsiz en iyi hamleye göre fazladan değeri, en çok kullanım (tur ve cooldown); en iyi kullanım planı tam sayılı arama ile
    // (tur ve MP iki kısıt; skill başına birkaç kullanım: küçük arama). Yakılan MP'nin değeri = planın değer kaybı.
    const uses = skills
      .filter((sk) => sk.cost.resource === 'mp' && sk.cost.amount > 0)
      .map((sk) => {
        const cd = this.battle.mode === 'turns' ? (sk.cooldown ?? 0) : 0;
        return { cost: sk.cost.amount, delta: (raw(sk) - free) * this.vc.contributionShare, cap: cd > 0 ? Math.ceil(T / (cd + 1)) : T };
      })
      .filter((u) => u.delta > 0);
    const worth = (mp: number): number => {
      let best = 0;
      const rec = (i: number, turns: number, left: number, v: number) => {
        if (i === uses.length) {
          best = Math.max(best, v);
          return;
        }
        const u = uses[i]!;
        const max = Math.floor(Math.min(u.cap, turns, left / u.cost) + 1e-9);
        for (let n = 0; n <= max; n++) rec(i + 1, turns - n, left - n * u.cost, v + n * u.delta);
      };
      rec(0, T, Math.max(0, mp), 0);
      return best;
    };
    return Math.max(0, worth(pool) - worth(pool - amount));
  }

  /**
   * Susturmanın "engellenen hamle" değeri (madde 260, Silence: MP bedelli skill kullanılamaz): düşman `f` susturulduğu turlarda (`turns`, ufuktaki turuyla
   * sınırlı) MP'li en iyi hamlesi yerine bedelsiz en iyisini yapar. Her tur için: o tur ödenebilecek (MP = `mpAfter` + tur başı yenilenmeler; bir
   * sonraki turda hâlâ cooldown'da olmayan) MP'li skill'lerin en iyisinin bedelsiz en iyiye göre fazlası x contributionShare. MP'siz birimde 0.
   */
  silenceDenial(f: Combatant, mpAfter: number, turns: number): number {
    if (f.hp <= 0 || f.maxMp <= 0 || turns <= 0) return 0;
    const opp = Math.min(3, this.battle.living(f.side === 'party' ? 'enemy' : 'party').length);
    const raw = (sk: SkillDef) => {
      let v = skillRawValue(this.battle, f.stats, sk);
      for (const e of sk.effects) if (e.type === 'ground') v += attributePower(f.stats, e.scale, this.battle.formulas) * e.power * e.turns * 0.7;
      return v * (this.battle.isAreaSkill(sk.id) && ATTACK_TARGETS.includes(sk.target) ? Math.max(1, opp) : 1);
    };
    const skills = f.skills.map((id) => this.battle.skill(id)).filter((sk): sk is SkillDef => !!sk);
    const free = Math.max(0, ...skills.filter((sk) => sk.cost.resource !== 'mp' || sk.cost.amount <= 0).map(raw));
    const regen = this.battle.mode === 'turns' ? f.stats.mpRegen : 0;
    const n = Math.min(turns, Math.max(1, Math.ceil(this.turnsWithin(f) - 1e-9)));
    let v = 0;
    for (let k = 1; k <= n; k++) {
      const mp = this.battle.freeMp ? Infinity : Math.min(f.maxMp, Math.max(0, mpAfter) + regen * k);
      const best = Math.max(0, ...skills.filter((sk) => sk.cost.resource === 'mp' && sk.cost.amount > 0 && sk.cost.amount <= mp && (this.battle.mode !== 'turns' || (f.cooldowns[sk.id] ?? 0) <= k)).map(raw));
      v += Math.max(0, best - free) * this.vc.contributionShare;
    }
    return v;
  }

  private readonly dying = new Map<string, boolean>();
  /**
   * Hard "fazla vurmama": düşman `f` bizim müdahalemiz olmadan bir sonraki turunun başında ya da önce ölecek mi? Tur başı DoT (Wither) ve üstünde durduğu
   * düşman zemin etkisi (zehir/yanma/holy fire) tikleri + (turns modunda) sıra çubuğunda ondan ÖNCE oynayacak dostlarımızın (bizden başka) ona yönelmesi
   * tahmin edilen vuruşları, canını + kalkanını geçiyorsa evet.
   */
  dyingAnyway(f: Combatant): boolean {
    let v = this.dying.get(f.uid);
    if (v !== undefined) return v;
    const b = this.battle;
    let dmg = 0;
    for (const st of f.statuses) if (b.statusDef(st.kind)?.dot) dmg += b.dotTickDamage(st.kind, st.amount ?? 0, f);
    for (const g of b.ground) if (g.board === f.board && g.slots.includes(f.slot) && g.sourceSide !== f.side) dmg += b.groundTickDamage(g.ground, g.amount, f);
    if (b.mode === 'turns') {
      const q = b.turnQueue();
      const start = q[0] === this.actor.uid ? 1 : 0;
      const at = q.indexOf(f.uid, start);
      const first = new Set(q.slice(start, at < 0 ? q.length : at).filter((u) => u !== this.actor.uid));
      for (const i of this.ownIntents()) if (first.has(i.foe) && i.focus.includes(f.uid)) dmg += i.hit / i.focus.length;
    }
    v = dmg >= f.hp + f.shield + f.magicShield;
    this.dying.set(f.uid, v);
    return v;
  }

  /** Hard odak ateşi: `f`'ye yönelmesi tahmin edilen dostlarımızın (bizden başka) sayısı (eşitlikte bölünmüş pay). */
  alliesOn(f: Combatant): number {
    return sum(this.ownIntents().filter((i) => i.foe !== this.actor.uid && i.focus.includes(f.uid)).map((i) => 1 / i.focus.length));
  }

  private own?: FoeIntent[];
  /** Bizim tarafın tahmini hamleleri (predictFoes'un ayna kullanımı: düşman gözünden "düşmanları" biziz). */
  ownIntents(): FoeIntent[] {
    if (!this.own) {
      const foe = this.battle.living(foeSideOf(this.actor))[0];
      this.own = foe ? predictFoes(this.battle, foe, this.focusOf) : [];
    }
    return this.own;
  }

  /** `extra` ek can/kalkanla (ya da `less` kadar az tehditle) dost tehlikeden çıkıyor mu? */
  rescued(a: Combatant, extra: number, less = 0): boolean {
    if (!this.inDanger(a)) return false;
    return (this.before.get(a.uid) ?? 0) - less < a.hp + a.shield + a.magicShield + extra;
  }

  /** Birimin hücreden vurabilecek durumda olup olmadığı (yakın dövüş skill'leri ön sıradan; menzilli her yerden). Varsayımsal hücre (dirilme/çağrı). */
  usefulAt(u: Combatant | { uid: string; skills: string[] }, side: Combatant['side'], slot: number): number {
    const skills = u.skills.map((id) => this.battle.skill(id)).filter((s): s is SkillDef => !!s && s.effects.some((e) => e.type === 'damage' || e.type === 'heal' || e.type === 'hot' || e.type === 'shield'));
    if (skills.length === 0) return 1;
    const front = Math.min(this.battle.rowOf(slot), ...this.battle.living(side).filter((c) => c.board === side && c.uid !== u.uid).map((c) => this.battle.rowOf(c.slot)));
    const ok = skills.filter((s) => s.motion !== 'melee' || s.target === 'self' || s.ignoreFrontRow || s.ignoreReach || this.battle.rowOf(slot) <= front + (s.reach ?? 0));
    return ok.length === skills.length ? 1 : ok.length === 0 ? 0 : 0.5;
  }
}

/**
 * Düşmanların bir sonraki hamlesi tahmini (K2, Ömer: "sıradaki Archer kimi vuracak"): her düşman, ulaşabildiği birimlerimizden kendi odak kuralına göre
 * birini seçer (lowest_hp: en az can+kalkan; lowest_ratio: en düşük can oranı) ve o hedefe en çok beklenen hasarı veren (bedeli yeten, cooldown'da olmayan)
 * saldırısını yapar. Sersem (skipTurn) düşman oynamaz. `before`: turns modunda sıra tahmininde kullanıcının bir sonraki turundan önce mi.
 */
function predictFoes(battle: Battle, actor: Combatant, focusOf: (c: Combatant) => 'lowest_hp' | 'lowest_ratio'): FoeIntent[] {
  const out: FoeIntent[] = [];
  let beforeSet: Set<string> | null = null;
  if (battle.mode === 'turns') {
    const q = battle.turnQueue();
    const start = q[0] === actor.uid ? 1 : 0;
    const next = q.indexOf(actor.uid, start);
    beforeSet = new Set(q.slice(start, next < 0 ? q.length : next));
  }
  for (const foe of battle.living(foeSideOf(actor))) {
    if (foe.statuses.some((s) => battle.statusDef(s.kind)?.skipTurn && s.turns > 0)) continue;
    const usable = foe.skills
      .map((id) => battle.skill(id))
      .filter((sk): sk is SkillDef => !!sk && ATTACK_TARGETS.includes(sk.target) && sk.effects.some((e) => e.type === 'damage'))
      .filter((sk) => !(battle.mode === 'turns' && (foe.cooldowns[sk.id] ?? 0) > 0))
      .filter((sk) => !(sk.cost.resource === 'mp' && !battle.freeMp && foe.mp < sk.cost.amount) && !(sk.cost.resource === 'rage' && (foe.rage ?? 0) < sk.cost.amount));
    const reach = new Map<string, Combatant>();
    for (const sk of usable) for (const c of battle.validTargets(foe.uid, sk.id)) if (c.side === actor.side) reach.set(c.uid, c);
    const cands = [...reach.values()].sort((a, b) => a.slot - b.slot);
    if (cands.length === 0) continue;
    const focus = focusOf(foe);
    const k = (x: Combatant) => (focus === 'lowest_hp' ? x.hp + x.shield + x.magicShield : ratio(x));
    const min = Math.min(...cands.map(k));
    const tied = cands.filter((c) => k(c) <= min + (focus === 'lowest_hp' ? 0.5 : 0.005));
    const target = tied[0]!;
    let hit = 0;
    let magic = false;
    for (const sk of usable) {
      // (eşitlikteki adaylar benzer: vuruş ilk adaya göre ölçülür)
      if (!battle.validTargets(foe.uid, sk.id).some((c) => c.uid === target.uid)) continue;
      const d = previewForTargets(battle, foe, sk.id, [target]).find((p) => p.uid === target.uid)?.damage;
      if (!d) continue;
      const v = d.avg * d.hitChance;
      if (v > hit) {
        hit = v;
        magic = sk.effects.some((e) => e.type === 'damage' && e.damageType === 'magic');
      }
    }
    if (hit > 0) out.push({ foe: foe.uid, target: target.uid, hit, magic, before: beforeSet ? beforeSet.has(foe.uid) : true, reach: cands.map((c) => c.uid), focus: tied.map((c) => c.uid) });
  }
  return out;
}

/** Sayı x için U[lo, hi] dağılımında P(x >= e). */
export function pAtLeast(lo: number, hi: number, e: number): number {
  if (e <= lo) return 1;
  if (e > hi) return 0;
  if (hi <= lo) return hi >= e ? 1 : 0;
  return Math.max(0, Math.min(1, (hi - e) / (hi - lo)));
}

/** Toplam sum (yardımcı, ai.ts kullanır). */
export const total = sum;
