export interface Stats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  crit: number;
  eva: number;
  /** Her turunun başında yenilenen MP (turns modunda). */
  mpRegen: number;
}

/** data/classes/*.json ve data/enemies/*.json ortak şekli. stats.hp / stats.mp en yüksek değerlerdir. */
export interface CombatantDef {
  id: string;
  name: string;
  spriteId: string;
  color: string;
  stats: Stats;
  skills: string[];
  tags?: string[];
  /** data/ai.json profil adı (yapay zeka bu karakteri nasıl oynatır). */
  ai?: string;
}

export type SkillTarget = 'single_enemy' | 'all_enemies' | 'single_ally' | 'all_allies' | 'self';

export type SkillEffect =
  | {
      type: 'damage';
      damageType: 'physical' | 'magic';
      power: number;
      /** 0-1: hedefin savunmasının/direncinin yok sayılan kısmı. */
      ignoreDefense?: number;
      /** 0-1: verilen hasarın bu kadarı kullanıcıya şifa olur. */
      lifesteal?: number;
      bonusVsTag?: { tag: string; multiplier: number };
    }
  | { type: 'heal'; power: number }
  | { type: 'shield'; stat: 'def' | 'mag'; power: number }
  | { type: 'summon'; unit: string };

export interface SkillCost {
  resource: 'mp' | 'hp';
  amount: number;
}

/** Yalnızca görsel ipucu: melee = hedefe atılır, ranged = mermi, cast = büyü hazırlığı. */
export type SkillMotion = 'melee' | 'ranged' | 'cast';

/** data/skills.json girdisi. */
export interface SkillDef {
  id: string;
  name: string;
  target: SkillTarget;
  cost: SkillCost;
  motion: SkillMotion;
  fx: string;
  effects: SkillEffect[];
  /** Kullanıldıktan sonra kullanıcının kaç tur boyunca tekrar kullanamayacağı (yoksa 0). Yalnızca turns modunda. */
  cooldown?: number;
}

export interface Formulas {
  physicalDamage: { defenseFactor: number; variance: number; minDamage: number };
  magicDamage: { resistFactor: number; variance: number; minDamage: number };
  heal: { variance: number; minHeal: number };
  turn: { threshold: number; queueLength: number };
}

/** turns = hıza göre sıralı gerçek oyun; test = sırasız, her karakter istediği an oynar (debug). */
export type BattleMode = 'turns' | 'test';

export type Side = 'party' | 'enemy';

export interface Combatant {
  uid: string;
  defId: string;
  name: string;
  spriteId: string;
  color: string;
  side: Side;
  slot: number;
  stats: Stats;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Hasarı emen kalkan miktarı (süre sınırı yok; tükenene kadar durur). */
  shield: number;
  tags: string[];
  skills: string[];
  summoned: boolean;
  ai: string | undefined;
  /** Sıra sayacı: her tikte SPD kadar dolar, eşiğe ulaşınca oynar. */
  turnCounter: number;
  /** Beklemede olan skill'ler: skillId -> kalan tur (her kendi turunun başında 1 azalır). */
  cooldowns: Record<string, number>;
}

/** Motorun UI'a yayınladığı olay akışı. UI yalnızca bunları dinler. */
export type BattleEvent =
  | { type: 'battleStart'; seed: number; combatants: Combatant[] }
  | { type: 'skillUsed'; actor: string; skill: string; targets: string[] }
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
    }
  | { type: 'heal'; source: string; target: string; amount: number; hpAfter: number }
  | { type: 'shield'; source: string; target: string; amount: number; shieldAfter: number }
  | { type: 'summon'; actor: string; combatant: Combatant }
  | { type: 'mpRegen'; actor: string; amount: number; after: number }
  | { type: 'turnStart'; actor: string; queue: string[] }
  | { type: 'turnSkipped'; actor: string }
  | { type: 'death'; target: string }
  | { type: 'battleEnd'; winner: Side };
