/**
 * Sefer (campaign) tipleri. Saf TypeScript: Phaser/DOM yok, Node'da test edilir (docs/design/campaign/campaign.md).
 */

export type NodeType = 'battle' | 'elite' | 'boss' | 'town' | 'event' | 'treasure';
export type EdgeStyle = 'solid' | 'dashed';
export type CampaignMode = 'normal' | 'ironman';
/** Genel zorluk: sefer başında seçilir, sonra değişmez. */
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyDef {
  name: string;
  /** Yapay zeka zorluğu (savaş kurulumuna iletilir). */
  ai: Difficulty;
  text: string;
  /**
   * Seferdeki TÜM düşman birimlerine eklenen güçlendirme/zayıflatma (karşılaşmanın kendi `mods`'u ile birleşir: çarpanlar çarpılır, düz ekler toplanır).
   * Yalnızca güç alanları: hpMult, statMult, powerMult, armorAdd, magicArmorAdd. Yoksa düşmanlar veride yazıldığı gibi.
   */
  enemy?: DifficultyEnemyMods;
  /** Rütbeli birimlere (elit lider / boss) `enemy`'nin ÜSTÜNE eklenen güçlendirme (aynı birleşme kuralı). */
  enemyTier?: Partial<Record<UnitTier, DifficultyEnemyMods>>;
  /** Bu zorlukta sefer kurallarının üstüne yazılanlar (ör. zafer sonrası toparlanma `victoryHeal`). Yoksa campaign.json > rules. */
  rules?: Partial<Pick<CampaignRules, 'victoryHeal' | 'reviveRatio' | 'bossVictoryHeal'>>;
}

export type DifficultyEnemyMods = Pick<UnitModifiers, 'hpMult' | 'statMult' | 'powerMult' | 'armorAdd' | 'magicArmorAdd'>;

export interface RecruitDef {
  offer: number;
  pick: number;
  /** before = düğüme varınca (savaştan önce); leave = düğümden ayrılırken. */
  when: 'before' | 'leave';
  /** Adaylardan en az biri alan saldırılı sınıf olsun (Ravenwood: alan saldırılarını öğretir). */
  requireArea?: boolean;
}

export interface MapNode {
  id: string;
  type: NodeType;
  name: string;
  subtitle: string;
  region: string;
  /** Arka planın oranı (x, y), rozet merkezi. */
  pos: [number, number];
  /** Etiket plakasının yeri (varsayılan rozetin altı). */
  label?: 'above' | 'below';
  encounter?: string;
  /** Düğümün savaş arka planı (bölgeninkini ezer; karşılaşmanınki bunu ezer). */
  battleBackground?: string;
  event?: string;
  treasure?: string;
  recruit?: RecruitDef;
  /** Varınca iyileşme oranı (kasaba: 1 = tam). */
  heal?: number;
  endsTutorial?: boolean;
  newCompany?: { size: number; leader: 'firstPick' };
  partyCap?: number;
  city?: boolean;
  final?: boolean;
  teaches?: string;
}

export interface MapEdge {
  from: string;
  to: string;
  style: EdgeStyle;
  path?: Array<[number, number]>;
}

export interface MapRegion {
  id: string;
  title: string;
  tagline: string;
  label: [number, number];
  battleBackground?: string;
}

export interface CampaignMap {
  id: string;
  title: string;
  subtitle: string;
  blurb: string;
  background: string;
  /** Geniş (21:9) harita görseli; region = eski 16:9 haritanın bu görseldeki kesir dikdörtgeni [x0, y0, x1, y1] (src/game/wide-map.ts). */
  backgroundWide?: { image: string; region: [number, number, number, number] };
  start: string;
  stopsPerRun: number;
  visibility: number;
  alwaysVisible: string[];
  regions: MapRegion[];
  nodes: MapNode[];
  edges: MapEdge[];
}

import type { UnitModifiers, UnitTier } from '../engine/types';
import type { Equipment, ItemInstance } from '../progression/items';

/** Birim bazında güçlendirme/zayıflatma: motorun UnitModifiers'ı (hpMult, statMult, powerMult, spriteScale, actionsPerTurn...). */
export type UnitMods = UnitModifiers;

export interface EncounterUnit {
  class: string;
  slot: number;
  /** Özel ad (motor: displayName). */
  name?: string;
  /** Rütbe (motor: tier): elit lider / boss. */
  tier?: UnitTier;
  boss?: string;
  mods?: UnitMods;
  /** true: zorluğun rütbe eki (campaign.json > difficulties[x].enemyTier) bu birime uygulanmaz; genel `enemy` eki uygulanır. */
  noTierMods?: boolean;
  /** Bu karşılaşmada kullanamayacağı skill'ler (motor: UnitSetup.lockSkills; ör. tutorial düşmanında ultimate yok). */
  lockSkills?: string[];
  /** Başlangıç cooldown'u eki (motor: UnitSetup.initialCooldownBonus; cooldown'lu her skill'e, maxInitial'ı aşabilir). */
  initialCooldownBonus?: number;
}

export interface EncounterDef {
  name: string;
  units: EncounterUnit[];
  /** Savaş arka planı (assets/backgrounds/<ad>.webp|png|jpg); öncelik: karşılaşma > düğüm > bölge > varsayılan. */
  background?: string;
  fallback?: string;
  fallbackOnly?: boolean;
}

export interface CampaignRules {
  carryHp: boolean;
  victoryHeal: number;
  reviveRatio: number;
  bossVictoryHeal: number;
  maxSaves: { normal: number; ironman: number };
  /** Sefer yuvası sayısı (3). */
  slots: number;
}

export interface CampaignConfig {
  maps: string[];
  rules: CampaignRules;
  starterPool: string[];
  companyPool: string[];
  recruitPool: string[];
  texts: Record<string, string>;
  tips: Record<string, string>;
  defaultDifficulty: Difficulty;
  difficulties: Record<Difficulty, DifficultyDef>;
}

/** Kadrodaki bir karakter. hpRatio 0-1 (savaştan savaşa taşınır). */
export interface Hero {
  id: string;
  class: string;
  hpRatio: number;
  alive: boolean;
  leader?: boolean;
  /** Tutorial takımından mı (Ashford'da ayrılır). */
  tutorial?: boolean;
  /** Kalıcı kahraman kaydı (roadmap 1.4, aşama 0). Level sistemi Aşama 2'de; şimdilik hep 1. */
  level: number;
  /** Deneyim puanı (Aşama 2 için hazır; şimdilik 0). */
  xp: number;
  /** Takılı item'ler: 6 yuva (weapon, helm, armor, gloves, boots, trinket), boş = null. Güce çevrimi: src/progression/loadout.ts. */
  equipment: Equipment;
}

/**
 * Bir düğümdeki adımlar (sırayla): recruit-before -> farewell -> company -> battle -> treasure -> event -> town -> recruit-leave.
 * Hepsi bitince düğüm temizlenmiş sayılır ve yola çıkılır (move).
 */
export type StepKind = 'hero' | 'recruit' | 'farewell' | 'company' | 'battle' | 'treasure' | 'event' | 'town' | 'volunteer';

/** Sefer durumunun şema sürümü (2: kahraman level/XP/ekipman, torba, altın; eski 1 okunurken tamamlanır: save.ts > normalizeState). */
export const STATE_VERSION = 2;

export interface CampaignState {
  version: 2;
  /** Seferin kimliği (aynı seferin kayıtları buna bakar). */
  campaignId: string;
  mode: CampaignMode;
  /** Genel zorluk (sefer boyunca sabit). */
  difficulty: Difficulty;
  /** Sefer yuvası (0..slots-1). */
  slot: number;
  mapId: string;
  seed: number;
  roster: Hero[];
  /** Aktif takımın dizilimi: 12 hücre (dizin = yuva = sıra*3+şerit), değer = hero id ya da ''. */
  active: string[];
  /** Bulunulan düğüm. */
  at: string;
  /** Geçilen düğümler (başlangıç dahil, sırayla). */
  path: string[];
  /** Tamamlanan adımlar: '<düğüm>:<adım>' (ör. '2:recruit', '2:battle'). */
  done: string[];
  /** Görülen tutorial ipuçları (düğüm id). */
  tipsSeen: string[];
  stats: { victories: number; defeats: number };
  nextHeroId: number;
  /** Sefer torbası (takılı olmayan item'ler; kapasite items.json > bag = 30). */
  inventory: ItemInstance[];
  /** Altın (Aşama 1'de loot/tüccar). */
  gold: number;
  /** Sıradaki item örneği numarası (uid 'i<n>'). */
  nextItemId: number;
  /**
   * Bekleyen teslim (Ashford vedası, items.md karar 7): ayrılan tutorial takımının item'leri torbaya konmuştur; arayüz (Aşama 1) bu kaydı
   * "eski takım bunları size bıraktı" anı olarak gösterip onaylatır (`acknowledgeHandover`). Yoksa ya da onaylandıysa yok.
   */
  pendingHandover?: Handover;
  /** Loot sayaçları (items.md 3.3-3.4): Rare pity, düğüm başına zafer sayısı ('<düğüm>:battle' | '<düğüm>:treasure'; tekrar oynamada azalan ödül). */
  lootState: { rarePity: number; clears: Record<string, number> };
  /** Son düşüş: haritada "Spoils" kartı olarak gösterilir, onaylanınca silinir (`acknowledgeLoot`). */
  pendingLoot?: LootDrop;
}

/**
 * Bir düğümün düşüşü (kart için): torbaya giren item uid'leri, altın; `left` = torba dolu olduğu için sığmayan item'ler (id). Ömer, madde 280:
 * sığmayan item altına çevrilmez; kart açıkken oyuncu yer açıp alabilir (`takeLeftover`), kart kapanınca (`acknowledgeLoot`) kaybolur.
 */
export interface LootDrop {
  node: string;
  kind: 'battle' | 'elite' | 'boss' | 'treasure';
  items: string[];
  gold: number;
  left?: string[];
}

/** Teslim kaydı: kimden (ayrılan kahramanlar), hangi item'ler (torbadaki uid'ler), hangi düğümde. */
export interface Handover {
  node: string;
  from: Array<{ heroId: string; class: string }>;
  items: string[];
}

/** Bir savaşın sonucu (oyuncu birimleri hero id ile). */
export interface BattleOutcome {
  victory: boolean;
  units: Array<{ heroId: string; hpRatio: number; alive: boolean }>;
}

export type NextStep =
  | { kind: 'hero' }
  | { kind: 'recruit'; node: string; offer: string[] }
  | { kind: 'volunteer'; node: string; offer: string[] }
  | { kind: 'farewell'; node: string }
  | { kind: 'company'; node: string; size: number }
  | { kind: 'battle'; node: string; encounter: string }
  | { kind: 'treasure'; node: string; treasure: string }
  | { kind: 'event'; node: string; event: string }
  | { kind: 'town'; node: string }
  | { kind: 'move'; options: string[] }
  | { kind: 'complete' };
