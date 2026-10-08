// Denge simülasyonunun çekirdeği: rastgele takımlı savaşları iki taraf da yapay zeka ile oynatır ve ölçümleri toplar.
// npm run sim (rapor), denge testi (tests/balance.test.ts) ve ayar betikleri bunu kullanır. Hedef bantlar data/balance.json.
import { Battle, chooseAction, content } from '../engine';
import balanceJson from '../../data/balance.json';

export const MAX_TURNS = 400; // bunu aşan savaş "bitmeyen" sayılır

/** Denge hedefleri (data/balance.json; Ömer kararı 2026-10-08). */
export const balance = balanceJson as {
  bands: {
    classWin: { low: number; high: number };
    basic: { low: number; high: number };
    normal: { low: number; high: number };
    situational: { low: number; high: number };
    ultimateUsedMin: number;
    /** Tek class'ın ultimate oranı bunun altındaysa yalnızca uyarı (çok düşük kullanılan ult). */
    ultimateLowWarn: number;
    battleTurns: { low: number; high: number };
    matchup: { crushingLow: number; crushingHigh: number; minGames: number };
  };
  situational: string[];
  measure: { runs: number; seedGroups: number[] };
  /** tests/balance*.test.ts: grup başına savaş ve seed grupları (tam ölçüm npm run sim). */
  test: { runs: number; seedGroups: number[] };
};

export type SkillCategory = 'basic' | 'normal' | 'situational' | 'ultimate';

/** Skill'in denge kategorisi: class'ın 1. skill'i temel saldırı, 4. skill'i ultimate, balance.json listesindekiler durumsal, kalanlar normal. */
export function skillCategory(classId: string, skillId: string): SkillCategory | undefined {
  const skills = content.classes[classId]?.skills ?? [];
  const i = skills.indexOf(skillId);
  if (i < 0) return undefined;
  if (balance.situational.includes(skillId)) return 'situational';
  if (i === 0) return 'basic';
  if (i === skills.length - 1) return 'ultimate';
  return 'normal';
}

export interface ClassStat {
  /** Sınıfın yalnızca tek tarafta bulunduğu savaşlar (iki tarafta da varsa etkisi nötr olduğundan sayılmaz). */
  games: number;
  wins: number;
  /** Sınıfın savaşa katılan birim sayısı ve ölenler. */
  units: number;
  deaths: number;
  damage: number;
  heal: number;
  shield: number;
  moves: number;
  skips: number;
  skillUses: Map<string, number>;
  /** Ultimate (4. skill): hayattayken en az bir kez kullanılabilir olan birimler / bunlardan en az bir kez kullananlar / tüm birimlerden kullananlar. */
  ultReady: number;
  ultUsedWhenReady: number;
  ultUsedAny: number;
}

export interface SimResult {
  runs: number;
  partyWins: number;
  enemyWins: number;
  draws: number;
  totalTurns: number;
  classes: Map<string, ClassStat>;
  comps: Map<string, { games: number; wins: number }>;
  /** Karşılaşma tablosu: anahtar `a>b` = a sınıfının b sınıfına karşı (karşı taraflarda, aynı takımda değilken) savaşları ve a'nın kazandıkları. */
  matchups: Map<string, { games: number; wins: number }>;
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);

/**
 * `sizes`: takım boyutları (taraf başına 1..12; varsayılan random-battle.json > random.size). Global skill (Rest/Skip Turn/Move Tile) kullanımları
 * `skillUses` içinde skill id'leriyle ('rest', 'skip_turn', 'move_tile') sayılır; toplam hamle sayısı `moves`.
 */
export function simulate(runs: number, firstSeed = 1, battleId: string = content.DEFAULT_BATTLE, sizes: content.TeamSizes = {}): SimResult {
  const classes = new Map<string, ClassStat>();
  const stat = (id: string): ClassStat => {
    let s = classes.get(id);
    if (!s) {
      s = { games: 0, wins: 0, units: 0, deaths: 0, damage: 0, heal: 0, shield: 0, moves: 0, skips: 0, skillUses: new Map(), ultReady: 0, ultUsedWhenReady: 0, ultUsedAny: 0 };
      classes.set(id, s);
    }
    return s;
  };
  for (const id of content.randomPool) stat(id);
  const comps = new Map<string, { games: number; wins: number }>();
  const matchups = new Map<string, { games: number; wins: number }>();
  const result: SimResult = { runs, partyWins: 0, enemyWins: 0, draws: 0, totalTurns: 0, classes, comps, matchups };

  for (let i = 0; i < runs; i++) {
    const setup = content.battleSetup(battleId, firstSeed + i, 'turns', sizes);
    const battle = new Battle(setup);
    const idOf = (uid: string) => battle.get(uid)?.defId ?? '?';
    /** Birim başına ultimate durumu: hazır gördü mü, kullandı mı. */
    const ult = new Map<string, { ready: boolean; used: boolean }>();

    while (!battle.winner && battle.turnsTaken < MAX_TURNS) {
      const actor = battle.currentActor;
      if (!actor) break;
      const ultId = actor.summoned ? undefined : actor.skills[actor.skills.length - 1];
      if (ultId) {
        const u = ult.get(actor.uid) ?? { ready: false, used: false };
        if (!u.ready && battle.canUse(actor.uid, ultId).ok) u.ready = true;
        ult.set(actor.uid, u);
      }
      const choice = chooseAction(battle, actor.uid, content.aiConfig);
      const r = battle.applyChoice(actor.uid, choice); // seçim yoksa pas; global skill (rest/skip_turn/move_tile) de buradan geçer
      if (!r.ok) break; // YZ geçersiz hamle önermemeli; olursa raporu bozmamak için dur
      const s = stat(actor.defId);
      s.moves++;
      if (!choice) s.skips++;
      else bump(s.skillUses, choice.skillId);
      if (ultId && choice?.skillId === ultId) ult.get(actor.uid)!.used = true;
      for (const e of r.events) {
        if (e.type === 'damage') stat(idOf(e.source)).damage += e.amount + e.absorbed;
        if (e.type === 'heal') stat(idOf(e.source)).heal += e.amount;
        if (e.type === 'shield') stat(idOf(e.source)).shield += e.amount;
      }
    }

    result.totalTurns += battle.turnsTaken;
    if (battle.winner === 'party') result.partyWins++;
    else if (battle.winner === 'enemy') result.enemyWins++;
    else result.draws++;

    const partyIds = setup.party.map((d) => d.id);
    const enemyIds = setup.enemies.map((d) => d.id);
    for (const [side, mine, theirs] of [
      ['party', partyIds, enemyIds],
      ['enemy', enemyIds, partyIds],
    ] as const) {
      const key = [...mine].sort().join('+');
      const c = comps.get(key) ?? { games: 0, wins: 0 };
      c.games++;
      if (battle.winner === side) c.wins++;
      comps.set(key, c);
      const won = battle.winner === side;
      for (const id of new Set(mine)) {
        if (theirs.includes(id)) continue;
        const s = stat(id);
        s.games++;
        if (won) s.wins++;
        for (const foe of new Set(theirs)) {
          if (mine.includes(foe)) continue;
          const m = matchups.get(`${id}>${foe}`) ?? { games: 0, wins: 0 };
          m.games++;
          if (won) m.wins++;
          matchups.set(`${id}>${foe}`, m);
        }
      }
    }
    for (const c of battle.combatants) {
      if (c.summoned) continue;
      const s = stat(c.defId);
      s.units++;
      if (c.hp <= 0) s.deaths++;
      const u = ult.get(c.uid);
      if (u?.used) s.ultUsedAny++;
      if (u?.ready) {
        s.ultReady++;
        if (u.used) s.ultUsedWhenReady++;
      }
    }
  }
  return result;
}

/** Aynı ölçümün birden çok parçasını (ör. iki seed grubu ya da paralel işler) tek sonuçta toplar. */
export function mergeResults(parts: SimResult[]): SimResult {
  const out: SimResult = { runs: 0, partyWins: 0, enemyWins: 0, draws: 0, totalTurns: 0, classes: new Map(), comps: new Map(), matchups: new Map() };
  const addWin = (m: Map<string, { games: number; wins: number }>, k: string, v: { games: number; wins: number }) => {
    const c = m.get(k) ?? { games: 0, wins: 0 };
    c.games += v.games;
    c.wins += v.wins;
    m.set(k, c);
  };
  for (const p of parts) {
    out.runs += p.runs;
    out.partyWins += p.partyWins;
    out.enemyWins += p.enemyWins;
    out.draws += p.draws;
    out.totalTurns += p.totalTurns;
    for (const [k, v] of p.comps) addWin(out.comps, k, v);
    for (const [k, v] of p.matchups) addWin(out.matchups, k, v);
    for (const [id, s] of p.classes) {
      const o = out.classes.get(id) ?? { games: 0, wins: 0, units: 0, deaths: 0, damage: 0, heal: 0, shield: 0, moves: 0, skips: 0, skillUses: new Map(), ultReady: 0, ultUsedWhenReady: 0, ultUsedAny: 0 };
      for (const key of ['games', 'wins', 'units', 'deaths', 'damage', 'heal', 'shield', 'moves', 'skips', 'ultReady', 'ultUsedWhenReady', 'ultUsedAny'] as const) o[key] += s[key];
      for (const [sk, n] of s.skillUses) bump(o.skillUses, sk, n);
      out.classes.set(id, o);
    }
  }
  return out;
}

export const winRate = (s: { games: number; wins: number }): number => (s.games === 0 ? 0 : (s.wins / s.games) * 100);

/** Skill'in, sınıfın TÜM hamleleri (global eylemler ve pas dahil) içindeki yüzdesi. */
export const skillShare = (s: ClassStat, skillId: string): number => (s.moves === 0 ? 0 : ((s.skillUses.get(skillId) ?? 0) / s.moves) * 100);

/** Ultimate'ı hazır gören birimlerin en az bir kez kullanma oranı (%) ve ham oran (tüm birimler). */
export const ultReadyRate = (s: ClassStat): number => (s.ultReady === 0 ? 0 : (s.ultUsedWhenReady / s.ultReady) * 100);
export const ultRawRate = (s: ClassStat): number => (s.units === 0 ? 0 : (s.ultUsedAny / s.units) * 100);
