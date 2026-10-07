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
}

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
  start: string;
  stopsPerRun: number;
  visibility: number;
  alwaysVisible: string[];
  regions: MapRegion[];
  nodes: MapNode[];
  edges: MapEdge[];
}

import type { UnitModifiers, UnitTier } from '../engine/types';

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
}

export interface EncounterDef {
  name: string;
  units: EncounterUnit[];
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
}

/**
 * Bir düğümdeki adımlar (sırayla): recruit-before -> farewell -> company -> battle -> treasure -> event -> town -> recruit-leave.
 * Hepsi bitince düğüm temizlenmiş sayılır ve yola çıkılır (move).
 */
export type StepKind = 'hero' | 'recruit' | 'farewell' | 'company' | 'battle' | 'treasure' | 'event' | 'town' | 'volunteer';

export interface CampaignState {
  version: 1;
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
