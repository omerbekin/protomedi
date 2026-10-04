// Headless denge simülatörü.
// 1) Tam savaşlar: iki taraf da yapay zeka (data/ai.json) ile baştan sona oynanır, N farklı seed için.
// 2) Skill raporu: her skill'in tek kullanımdaki ortalama etkisi (test modunda, sırasız).
// Kullanım: npm run sim [savaş sayısı]
import { Battle, chooseAction, content } from '../engine';

const runs = Number(process.argv[2] ?? 500);
const battleId = 'first-battle';
const MAX_TURNS = 400; // bunu aşan savaş "berabere/kilitlenme" sayılır
const fmt = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');
const pct = (n: number, total: number) => `%${fmt((n / Math.max(1, total)) * 100, 0)}`;

interface Outcome {
  winner: 'party' | 'enemy' | null;
  turns: number;
  skipped: Map<string, number>;
  used: Map<string, number>;
  deadUnits: string[];
  partyAlive: number;
}

function playBattle(seed: number): Outcome {
  const battle = new Battle(content.battleSetup(battleId, seed, 'turns'));
  const used = new Map<string, number>();
  const skipped = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

  while (!battle.winner && battle.turnsTaken < MAX_TURNS) {
    const actor = battle.currentActor;
    if (!actor) break;
    const label = `${actor.side === 'party' ? 'Oyuncu' : 'Düşman'} ${actor.name}`;
    const choice = chooseAction(battle, actor.uid, content.aiConfig);
    const result = choice ? battle.useSkill(actor.uid, choice.skillId, choice.targetUid) : battle.skipTurn();
    if (!result.ok) break; // YZ geçersiz hamle önermemeli; olursa raporu bozmamak için dur
    if (choice) bump(used, `${label}|${content.skills[choice.skillId]?.name ?? choice.skillId}`);
    else bump(skipped, label);
  }
  return {
    winner: battle.winner,
    turns: battle.turnsTaken,
    skipped,
    used,
    deadUnits: battle.combatants.filter((c) => c.hp <= 0 && !c.summoned).map((c) => `${c.side === 'party' ? 'Oyuncu' : 'Düşman'} ${c.name}`),
    partyAlive: battle.living('party').length,
  };
}

// --- 1) Tam savaşlar (YZ vs YZ) ---
const outcomes = Array.from({ length: runs }, (_, i) => playBattle(i + 1));
const wins = outcomes.filter((o) => o.winner === 'party').length;
const losses = outcomes.filter((o) => o.winner === 'enemy').length;
const draws = outcomes.length - wins - losses;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

console.log('Proto denge simülatörü');
console.log('======================');
console.log(`Savaş: ${battleId}. İki taraf da yapay zeka ile oynandı, ${runs} savaş (seed 1..${runs}).`);
console.log('');
console.log('SONUÇLAR');
console.log(`  Oyuncu takımı kazandı : ${wins} (${pct(wins, runs)})`);
console.log(`  Düşman takımı kazandı : ${losses} (${pct(losses, runs)})`);
if (draws > 0) console.log(`  Bitmeyen/berabere     : ${draws} (${pct(draws, runs)})`);
console.log(`  Ortalama savaş uzunluğu: ${fmt(avg(outcomes.map((o) => o.turns)))} tur (tüm birimlerin turları toplamı)`);
console.log(`  Oyuncu kazanınca ortalama ${fmt(avg(outcomes.filter((o) => o.winner === 'party').map((o) => o.partyAlive)))} kişi hayatta`);

const deaths = new Map<string, number>();
for (const o of outcomes) for (const u of o.deadUnits) deaths.set(u, (deaths.get(u) ?? 0) + 1);
console.log('');
console.log('KİM ÖLÜYOR (savaşların yüzde kaçında)');
for (const [unit, n] of [...deaths].sort((a, b) => b[1] - a[1])) console.log(`  ${unit.padEnd(18)} ${pct(n, runs)}`);

const used = new Map<string, number>();
const skipped = new Map<string, number>();
for (const o of outcomes) {
  for (const [k, v] of o.used) used.set(k, (used.get(k) ?? 0) + v);
  for (const [k, v] of o.skipped) skipped.set(k, (skipped.get(k) ?? 0) + v);
}
const owners = [...new Set([...used.keys()].map((k) => k.split('|')[0]!))];
console.log('');
console.log('SKILL KULLANIMI (o karakterin hamlelerinin yüzde kaçı) ve pas geçme');
for (const owner of owners) {
  const entries = [...used].filter(([k]) => k.startsWith(`${owner}|`));
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const skips = skipped.get(owner) ?? 0;
  console.log(`  ${owner}  (savaş başına ${fmt(total / runs)} hamle, ${fmt(skips / runs)} pas)`);
  for (const [k, v] of entries.sort((a, b) => b[1] - a[1])) console.log(`      ${k.split('|')[1]!.padEnd(16)} ${pct(v, total)}`);
}
console.log('');
console.log('Not: balance.md hedefleri (ör. tek skill %40 üstü olmasın) bu rakamlara göre okunur. Pas geçme sayısı yüksekse karakterin MP\'si çabuk bitiyor demektir.');

// --- 2) Skill raporu (tek kullanım, test modu) ---
interface Row {
  owner: string;
  skill: string;
  cost: string;
  damage: number;
  heal: number;
  shield: number;
  targets: number;
  summons: boolean;
}

const rows: Row[] = [];
const roster = new Battle(content.battleSetup(battleId, 1, 'test')).combatants.filter((c) => !c.summoned);
const skillRuns = Math.min(runs, 300);

for (const who of roster) {
  for (const skillId of who.skills) {
    const skill = content.skills[skillId]!;
    let damage = 0;
    let heal = 0;
    let shield = 0;
    let targets = 0;
    for (let seed = 1; seed <= skillRuns; seed++) {
      const battle = new Battle(content.battleSetup(battleId, seed, 'test'));
      // Şifa ölçülebilsin diye herkesin canı yarıya indirilir (yalnızca simülasyonda)
      if (skill.effects.some((e) => e.type === 'heal')) for (const c of battle.combatants) c.hp = Math.round(c.maxHp / 2);
      const choices = battle.validTargets(who.uid, skillId);
      const r = battle.useSkill(who.uid, skillId, choices[0]?.uid);
      if (!r.ok) continue;
      for (const e of r.events) {
        if (e.type === 'damage') damage += e.amount + e.absorbed;
        if (e.type === 'heal') heal += e.amount;
        if (e.type === 'shield') shield += e.amount;
        if (e.type === 'skillUsed') targets = e.targets.length;
      }
    }
    rows.push({
      owner: `${who.side === 'party' ? 'Oyuncu' : 'Düşman'} ${who.name}`,
      skill: skill.name,
      cost: `${skill.cost.amount > 0 ? `${skill.cost.amount} ${skill.cost.resource.toUpperCase()}` : 'bedelsiz'}${skill.cooldown ? `, bekleme ${skill.cooldown} tur` : ''}`,
      damage: damage / skillRuns,
      heal: heal / skillRuns,
      shield: shield / skillRuns,
      targets,
      summons: skill.effects.some((e) => e.type === 'summon'),
    });
  }
}

console.log('');
console.log('SKILL ETKİLERİ (tek kullanımda ortalama, toplam)');
let lastOwner = '';
for (const r of rows) {
  if (r.owner !== lastOwner) {
    console.log(`  ${r.owner}`);
    lastOwner = r.owner;
  }
  const effects = [
    r.damage > 0 ? `hasar ${fmt(r.damage)}` : '',
    r.heal > 0 ? `şifa ${fmt(r.heal)}` : '',
    r.shield > 0 ? `kalkan ${fmt(r.shield)}` : '',
    r.summons ? 'Treant çağırır' : '',
    r.targets > 1 ? `${r.targets} hedef` : '',
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`      ${r.skill.padEnd(16)} ${r.cost.padEnd(24)} ${effects || '-'}`);
}
