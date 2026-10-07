/**
 * Bir skill KULLANIMININ olay özeti (saf; Phaser'sız, testlenebilir). Motor bir skill'i kullanınca olaylarını hemen yayar; animasyon sonra
 * oynar. BattleScene her `skillUsed` olayından sonra gelen olayları (bir sonraki skillUsed / globalUsed / turnStart'a kadar) toplar ve efekte
 * `VfxCtx.usage` olarak verir: efekt sahnenin iç alanlarını (battle.log, views) okumadan "bu kullanımda gerçekte ne oldu"yu bilir.
 *
 * Örnekler: Mana Barrier'ın arınma adımı yalnızca `dispelledFrom(hedef)` boş değilse; Vampiric Bite'ın can çalma şifası `healsOn(kullanıcı)`;
 * Raise Dead'in tüketilen cesedi `corpseUid`, çağrının geldiği yuva `slot`; Dark Bond kopyası `heals.filter(h => h.cause === 'dark_bond')`.
 */
import type { BattleEvent, StatusKind } from '../engine';

type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;

export interface SkillUsage {
  /** Kullanımın kendisi (skillUsed olayı). */
  used: Ev<'skillUsed'>;
  /** Bu kullanımın ardından gelen tüm olaylar (sırayla; skillUsed hariç). */
  events: readonly BattleEvent[];
  /** Kullanımda silinen durumlar (statusEnd.dispelled): Mana Barrier'ın sildiği debuff'lar, Spell Ward'ın sildiği buff... */
  dispelled: Array<{ target: string; status: StatusKind; cause?: string }>;
  /** Kullanımda uygulanan durumlar (status olayı). */
  statuses: Array<{ target: string; status: StatusKind; turns: number; cause?: string }>;
  /** Şifalar (heal olayı): can çalma (kaynak = hedef = kullanıcı), Dark Bond kopyası (cause 'dark_bond')... */
  heals: Array<{ source: string; target: string; amount: number; crit: boolean; cause?: string }>;
  /** Hasarlar (damage olayı; tutar 0 olabilir: kalkan emdi). */
  damages: Array<{ target: string; amount: number; absorbed: number; crit: boolean }>;
  /** Raise Dead: tüketilen cesedin uid'si (yoksa beslenmemiş çağrı). */
  corpseUid?: string;
  /** Çağrı skill'inde çağrının geldiği yuva. */
  slot?: number;
  /** Çağrılan birimlerin uid'leri (summon olayı). */
  summoned: string[];
  /** Ölenler (death olayı). */
  deaths: string[];
  /** Kısayol: hedefin bu kullanımda silinen durumları. */
  dispelledFrom: (uid: string) => StatusKind[];
  /** Kısayol: hedefe gelen toplam şifa (cause verilirse yalnızca o nedenden). */
  healsOn: (uid: string, cause?: string) => number;
}

/** Kullanımı bitiren olaylar: sonraki eylem ya da tur başı. */
const ENDS: ReadonlySet<BattleEvent['type']> = new Set(['skillUsed', 'globalUsed', 'turnStart', 'battleEnd']);

/** Bir skillUsed olayından sonra gelen olaylardan kullanımın özetini çıkarır (yalnızca kullanıma ait olanları alır). */
export function summarizeUsage(used: Ev<'skillUsed'>, after: readonly BattleEvent[]): SkillUsage {
  const events: BattleEvent[] = [];
  for (const e of after) {
    if (ENDS.has(e.type)) break;
    events.push(e);
  }
  const dispelled: SkillUsage['dispelled'] = [];
  const statuses: SkillUsage['statuses'] = [];
  const heals: SkillUsage['heals'] = [];
  const damages: SkillUsage['damages'] = [];
  const summoned: string[] = [];
  const deaths: string[] = [];
  let corpseUid = used.corpseUid;
  for (const e of events) {
    if (e.type === 'statusEnd' && e.dispelled) dispelled.push({ target: e.target, status: e.status, ...(e.cause ? { cause: e.cause } : {}) });
    else if (e.type === 'status') statuses.push({ target: e.target, status: e.status, turns: e.turns, ...(e.cause ? { cause: e.cause } : {}) });
    else if (e.type === 'heal') heals.push({ source: e.source, target: e.target, amount: e.amount, crit: e.crit, ...(e.cause ? { cause: e.cause } : {}) });
    else if (e.type === 'damage') damages.push({ target: e.target, amount: e.amount, absorbed: e.absorbed, crit: e.crit });
    else if (e.type === 'summon') summoned.push(e.combatant.uid);
    else if (e.type === 'death') deaths.push(e.target);
    else if (e.type === 'corpseConsumed' && !corpseUid) corpseUid = e.uid;
  }
  return {
    used,
    events,
    dispelled,
    statuses,
    heals,
    damages,
    ...(corpseUid ? { corpseUid } : {}),
    ...(used.slot !== undefined ? { slot: used.slot } : {}),
    summoned,
    deaths,
    dispelledFrom: (uid) => dispelled.filter((d) => d.target === uid).map((d) => d.status),
    healsOn: (uid, cause) => heals.filter((h) => h.target === uid && (cause === undefined || h.cause === cause)).reduce((s, h) => s + h.amount, 0),
  };
}

/**
 * Canlı toplayıcı: motor olayları geldikçe beslenir (`push`), son skillUsed'un özetini verir. BattleScene bunu kullanır; testler de.
 * Her skillUsed yeni bir kayıt açar; özet tembel hesaplanır (efekt çağırdığında o ana kadar gelen olaylarla).
 */
export class UsageRecorder {
  private readonly lists = new WeakMap<object, BattleEvent[]>();
  private current: Ev<'skillUsed'> | null = null;

  push(e: BattleEvent): void {
    if (e.type === 'skillUsed') {
      this.current = e;
      this.lists.set(e, []);
      return;
    }
    if (!this.current) return;
    if (ENDS.has(e.type)) {
      this.current = null;
      return;
    }
    this.lists.get(this.current)?.push(e);
  }

  /** Bu skillUsed olayının kullanım özeti (kayıt yoksa olaysız özet). */
  usageOf(used: Ev<'skillUsed'>): SkillUsage {
    return summarizeUsage(used, this.lists.get(used) ?? []);
  }
}
