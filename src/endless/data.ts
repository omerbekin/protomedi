// Endless Lite verisi ve türleri (saf; Phaser/DOM yok). Tasarım: docs/design/progression/roadmap.md bölüm 3, varsayımlar open-questions madde 281.
import endlessJson from '../../data/endless.json';
import encountersJson from '../../data/campaign/encounters.json';
import type { Equipment, ItemInstance, RarityId } from '../progression/items';
import type { SuspendedBattle } from './replay';
import type { RelicDef } from './relics';
import type { ShieldHook, Status, UnitModifiers, UnitTier } from '../engine/types';

export interface EndlessConfig {
  partySize: number;
  /** Torba kapasitesi (yoksa seferin items.json > bag değeri). */
  bagSize?: number;
  enemyCount: Array<{ fromWave: number; count: number }>;
  scaling: { hpPerWave: number; statPerWave: number; powerPerWave: number };
  eliteEvery: number;
  bossEvery: number;
  elites: string[];
  bosses: string[];
  /** Dalga arası taşıma (sürekli akış, madde 300): mp 'ratio' = canla aynı oran ('full' = her dalga tam), cooldowns 'clear' | 'initial'. */
  carry: { victoryHeal: number; reviveRatio: number; bossVictoryHeal: number; mp?: 'ratio' | 'full'; cooldowns?: 'carry' | 'clear' | 'initial'; fallen?: 'corpse' | 'rise' };
  /** reviveRatio: ödül ekranındaki 'Revive <kahraman>' kartının can (ve MP) oranı (carry.fallen 'corpse'). */
  rewards: { healRatio: number; goldBase: number; goldPerWave: number; reviveRatio?: number };
  special: {
    elite: SpecialRewards & { healRatio: number };
    boss: SpecialRewards & { feastHpMult: number; feastWaves: number };
  };
  items: { ilvlPerWave: number; ilvlAhead: number; window: number };
  /** Tüccar: her `every` dalgada, `size` mal, malları yenileme bedeli, bu ziyaretin geri alım listesi boyu. */
  shop: { every: number; size: number; rerollCost: number; buybackSize: number };
  /** Tüccar önizlemesi (?merchant=1): temizlenmiş dalga, altın, torbadaki item sayısı. */
  merchantPreview: { wave: number; gold: number; bagItems: number };
  /** Kalıntılar: boss sonrası teklif sayısı + liste (src/endless/relics.ts). */
  relics: { offer: number; list: RelicDef[] };
  difficulty: 'easy' | 'medium' | 'hard';
  highScores: number;
}

/** Elit / boss dalgası sonrası ödül ayarları (data/endless.json > special). */
export interface SpecialRewards {
  itemCards: number;
  minRarity: RarityId;
  ilvlBonus: number;
  goldMult: number;
}

export const ENDLESS: EndlessConfig = endlessJson as unknown as EndlessConfig;

/** Sefer karşılaşmasının endless'ın okuduğu kısmı (data/campaign/encounters.json; şema campaign-dev'indir, burada yalnızca okunur). */
export interface EncounterUnit {
  class: string;
  slot: number;
  tier?: UnitTier;
  name?: string;
  mods?: UnitModifiers;
}
export interface EncounterLike {
  name: string;
  units: EncounterUnit[];
  background?: string;
}

const RAW = encountersJson as unknown as Record<string, EncounterLike | string>;
export const encounter = (id: string): EncounterLike | undefined => {
  const e = RAW[id];
  return e && typeof e === 'object' ? e : undefined;
};

export type WaveKind = 'normal' | 'elite' | 'boss';

/** Endless kahramanı: güç katmanının (`src/progression/loadout.ts > LoadoutSource`) şekline uyar. */
export interface EndlessHero {
  id: string;
  class: string;
  /** Taşınan can oranı (0-1); 0 = düştü (sonraki zaferde reviveRatio ile kalkar). */
  hpRatio: number;
  equipment: Partial<Equipment>;
  /**
   * Kendi tahtasındaki hücre (0-11; sıra*3+şerit, 0. sıra önde). Koşu başında oyuncu dizer; her zaferde savaş sonundaki hücre yazılır
   * (src/endless/formation.ts). Eski kayıtta yok = otomatik dizilim.
   */
  slot?: number;
  /** Önceki dalgadan taşınan savaş durumu (sürekli akış, madde 300); eski kayıtta / ilk dalgada yok = tam MP, Rage 0, durum yok. */
  carry?: UnitCarry;
}

/**
 * Taşınan birim durumu. uid içeren alanlar (durum kaynağı, Dark Bond ortağı, kalkan kancası sahibi) kayıtta KİMLİK REFERANSI tutar:
 * 'h:<kahraman id>' ya da 's:<çağrı sırası>' (src/endless/carry.ts; sonraki savaşın uid'lerine wavePlan eşler).
 */
export interface UnitCarry {
  /** MP oranı (0-1; yoksa tam). */
  mpRatio?: number;
  rage?: number;
  /** Buff'lar (debuff'lar dalga arasında silinir). */
  statuses?: Status[];
  shield?: number;
  magicShield?: number;
  shieldHooks?: ShieldHook[];
  /** Kalan cooldown'lar (skill -> kendi tur sayısı; carry.cooldowns 'carry'). */
  cooldowns?: Record<string, number>;
  /** Düşmüş kahramanın cesedi Raise Dead ile tüketildiyse (savaşta Resurrection kaldıramaz; Revive kartı yine kaldırır). */
  corpse?: 'consumed';
}

/** Dalgadan dalgaya taşınan (oyuncu tarafı, canlı) çağrı: birim id'si, hücresi, sahibi (kahraman id), canı, kalan ömrü, beslenme hâli. */
export interface CarriedSummon extends UnitCarry {
  unit: string;
  slot: number;
  owner?: string;
  hp: number;
  lifespan?: number;
  empowered?: boolean;
}

export type RewardCard =
  /** heroId: yalnızca ipucu (bu item'den en çok kim yararlanır); item torbaya girer. */
  /** `rolls`: kartta gösterilen stat zarları (alınınca torbadaki örnek AYNEN bu değerleri taşır; eski kayıtta yok = alınırken zarlanır). */
  | { kind: 'item'; itemId: string; heroId: string; rolls?: ItemRolls }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; ratio: number }
  /** Boss sonrası: tam can + sonraki `waves` dalga boyunca maks can x hpMult. */
  | { kind: 'feast'; hpMult: number; waves: number }
  /** Düşmüş (ceset) kahramanı `ratio` canla (ve MP ile) kaldırır (carry.fallen 'corpse'; ekranda en çok bir tane: ilk düşen). */
  | { kind: 'revive'; heroId: string; ratio: number };

/** Koşu boyu geçici güçlendirme (Hero's Feast): kalan dalga sayısı kadar oyuncu birimlerinin maks canı x hpMult. */
export interface Blessing {
  hpMult: number;
  waves: number;
}

export interface ShopEntry {
  itemId: string;
  heroId: string;
  price: number;
  sold?: boolean;
  /** Tezgâhta gösterilen stat zarları (satın alınan örnek bunları taşır; eski kayıtta yok = alınırken zarlanır). */
  rolls?: ItemRolls;
}

/** Item örneğinin stat zarları (progression ItemInstance.rolls). */
export type ItemRolls = ItemInstance['rolls'];

/** Tüccarda satılan (bu ziyarette geri alınabilir) item: aynı örnek (uid korunur) + satıldığı fiyat. */
export interface BuybackEntry {
  item: ItemInstance;
  price: number;
}

export type RunPhase = 'ready' | 'relic' | 'reward' | 'shop' | 'over';

export interface RunStats {
  /** Kazanılan dalga sayısı. */
  cleared: number;
  /** Tüm savaşlarda oynanan toplam tur. */
  turns: number;
  /** Öldürülen düşman (çağrılar hariç). */
  kills: number;
}

export interface EndlessRun {
  version: 1;
  seed: number;
  /** Sıradaki (savaşılacak) dalga; 1'den başlar. Koşu bitince ölünen dalga. */
  wave: number;
  phase: RunPhase;
  heroes: EndlessHero[];
  gold: number;
  /** phase 'reward': seçilecek kartlar. */
  offer?: RewardCard[];
  /** phase 'shop': dükkân stoğu. */
  shop?: ShopEntry[];
  /** phase 'shop': bu ziyarette kaç kez mallar yenilendi (yenilemenin seed'i; ayrılınca silinir). */
  shopRerolls?: number;
  /** phase 'shop': bu ziyarette satılanlar (en yeni sonda; en çok shop.buybackSize; ayrılınca silinir). */
  buyback?: BuybackEntry[];
  stats: RunStats;
  /** Torba (Ömer 2026-10-09: item'ler önce torbaya, Gear ekranında takılır). Eski kayıtta yok = boş. */
  bag?: ItemInstance[];
  /** Item örneği uid sayacı. */
  nextItem: number;
  /** Ortak nadir düşüş (madde 297): düşüşsüz zafer sayacı (eski kayıtta yok = 0). */
  rarePity?: number;
  /** Son nadir düşüş (ödül ekranında altın-turuncu duyuru; `wave` = kazanılan dalga). */
  rareDrop?: { itemId: string; wave: number; pending?: boolean; rolls?: ItemRolls };
  startedAt: string;
  /** Koşu bitince: nasıl bitti. */
  end?: 'defeat' | 'abandoned';
  /** Sahip olunan kalıntılar (id; koşu boyunca). Eski kayıtta yok = []. */
  relics?: string[];
  /** phase 'relic': seçilecek kalıntılar. */
  relicOffer?: string[];
  /** Hero's Feast etkisi (yoksa yok). */
  blessing?: Blessing;
  /** Tüccar önizlemesi için atılır koşu (?merchant=1): kaydedilmez, en iyi koşulara yazılmaz (src/endless/merchant.ts > previewRun). */
  preview?: true;
  /** Taşınan çağrılar (sürekli akış, madde 300; eski kayıtta yok = yok). */
  summons?: CarriedSummon[];
  /** Yarıda bırakılan savaş (seed + eylem günlüğü; src/endless/replay.ts). Yalnızca 'ready' aşamasında ve aynı dalga için geçerli. */
  suspended?: SuspendedBattle;
}

/** Yerel en iyi skor listesinin bir satırı. Skor = ulaşılan dalga (eşitlikte daha az tur önde). */
export interface ScoreEntry {
  wave: number;
  cleared: number;
  turns: number;
  kills: number;
  classes: string[];
  gearScore: number;
  date: string;
}
