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

  constructor(
    readonly battle: Battle,
    readonly actor: Combatant,
    readonly vc: AiValueConfig,
    focusOf: (c: Combatant) => 'lowest_hp' | 'lowest_ratio',
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

  /** Kurtarma değeri: dostun kalan katkısı + canı (x saveWeight). */
  save(a: Combatant): number {
    return this.vc.saveWeight * (this.contribution(a) + a.hp);
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
