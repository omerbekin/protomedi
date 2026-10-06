// Denge simülasyonunun çekirdeği: rastgele takımlı savaşları iki taraf da yapay zeka ile oynatır ve ölçümleri toplar.
// npm run sim (rapor), denge testi (tests/balance.test.ts) ve ayar betikleri bunu kullanır.
import { Battle, chooseAction, content } from '../engine';

export const MAX_TURNS = 400; // bunu aşan savaş "bitmeyen" sayılır

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
}

export interface SimResult {
  runs: number;
  partyWins: number;
  enemyWins: number;
  draws: number;
  totalTurns: number;
  classes: Map<string, ClassStat>;
  comps: Map<string, { games: number; wins: number }>;
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);

/**
 * `sizes`: takım boyutları (taraf başına 1..12; varsayılan 5-5). Global skill (Rest/Skip Turn/Move Tile) kullanımları `skillUses` içinde
 * skill id'leriyle ('rest', 'skip_turn', 'move_tile') sayılır; toplam hamle sayısı `moves`.
 */
export function simulate(runs: number, firstSeed = 1, battleId: string = content.DEFAULT_BATTLE, sizes: content.TeamSizes = {}): SimResult {
  const classes = new Map<string, ClassStat>();
  const stat = (id: string): ClassStat => {
    let s = classes.get(id);
    if (!s) {
      s = { games: 0, wins: 0, units: 0, deaths: 0, damage: 0, heal: 0, shield: 0, moves: 0, skips: 0, skillUses: new Map() };
      classes.set(id, s);
    }
    return s;
  };
  for (const id of content.randomPool) stat(id);
  const comps = new Map<string, { games: number; wins: number }>();
  const result: SimResult = { runs, partyWins: 0, enemyWins: 0, draws: 0, totalTurns: 0, classes, comps };

  for (let i = 0; i < runs; i++) {
    const setup = content.battleSetup(battleId, firstSeed + i, 'turns', sizes);
    const battle = new Battle(setup);
    const idOf = (uid: string) => battle.get(uid)?.defId ?? '?';

    while (!battle.winner && battle.turnsTaken < MAX_TURNS) {
      const actor = battle.currentActor;
      if (!actor) break;
      const choice = chooseAction(battle, actor.uid, content.aiConfig);
      const r = battle.applyChoice(actor.uid, choice); // seçim yoksa pas; global skill (rest/skip_turn/move_tile) de buradan geçer
      if (!r.ok) break; // YZ geçersiz hamle önermemeli; olursa raporu bozmamak için dur
      const s = stat(actor.defId);
      s.moves++;
      if (!choice) s.skips++;
      else bump(s.skillUses, choice.skillId);
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
      for (const id of mine) {
        if (theirs.includes(id)) continue;
        const s = stat(id);
        s.games++;
        if (battle.winner === side) s.wins++;
      }
    }
    for (const c of battle.combatants) {
      if (c.summoned) continue;
      const s = stat(c.defId);
      s.units++;
      if (c.hp <= 0) s.deaths++;
    }
  }
  return result;
}

export const winRate = (s: { games: number; wins: number }): number => (s.games === 0 ? 0 : (s.wins / s.games) * 100);
