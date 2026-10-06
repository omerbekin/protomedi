// Headless denge simülatörü raporu (Türkçe).
// Rastgele takımlı savaşlar (her seed'de farklı oyuncu/düşman kompozisyonu) iki taraf da yapay zeka ile oynanır;
// sınıf, skill ve kompozisyon bazında rapor çıkarır. Hedefler docs/balance.md içindedir.
// Kullanım: npm run sim -- [savaş sayısı] [ilk seed]
import { content } from '../engine';
import { simulate, winRate } from './simulate';

const runs = Number(process.argv[2] ?? 3000);
const firstSeed = Number(process.argv[3] ?? 1);
// Takım boyutları (isteğe bağlı): npm run sim -- 3000 1 5 5  (oyuncu, düşman; taraf başına 1..12)
const sizes: content.TeamSizes = { ...(process.argv[4] ? { partySize: Number(process.argv[4]) } : {}), ...(process.argv[5] ? { enemySize: Number(process.argv[5]) } : {}) };
const WIN_LOW = 40; // sınıf kazanma oranı hedef aralığı (balance.md: ±%10)
const WIN_HIGH = 60;
const SKILL_SHARE_LIMIT = 40; // tek bir (bedelli) skill'in o sınıfın hamlelerindeki payı

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const pct = (n: number, total: number) => (total === 0 ? 0 : (n / total) * 100);

const r = simulate(runs, firstSeed, content.DEFAULT_BATTLE, sizes);

console.log('Proto denge simülatörü');
console.log('======================');
console.log(`Savaş: ${content.DEFAULT_BATTLE} (her seed'de farklı takımlar). Yapay zeka vs yapay zeka, ${runs} savaş (seed ${firstSeed}..${firstSeed + runs - 1}).`);
console.log('');
console.log('GENEL');
console.log(`  Oyuncu tarafı kazandı : ${r.partyWins} (%${fmt(pct(r.partyWins, runs))})`);
console.log(`  Düşman tarafı kazandı : ${r.enemyWins} (%${fmt(pct(r.enemyWins, runs))})`);
if (r.draws > 0) console.log(`  Bitmeyen savaş        : ${r.draws} (%${fmt(pct(r.draws, runs))})`);
console.log(`  Ortalama savaş uzunluğu: ${fmt(r.totalTurns / runs)} tur (tüm birimlerin turları toplamı)`);
console.log('  (İki taraf simetrik; eşit hızda önce oynayan taraf seed\'e göre değişir. Beklenen: %50 civarı.)');

const rows = content.randomPool.map((id) => ({ id, name: content.classes[id]!.name, s: r.classes.get(id)! }));
console.log('');
console.log(`SINIF DENGESİ (hedef kazanma oranı %${WIN_LOW}-${WIN_HIGH}; sınıfın tek tarafta olduğu savaşlar)`);
console.log('  sınıf     savaş  kazanma  ölüm   hasar  şifa  kalkan   (savaş başına, o sınıfın birimi)');
const warnings: string[] = [];
for (const { name, s } of [...rows].sort((a, b) => winRate(b.s) - winRate(a.s))) {
  const win = winRate(s);
  const flag = win < WIN_LOW || win > WIN_HIGH ? '  <-- DENGESİZ' : '';
  if (flag) warnings.push(`${name} %${fmt(win, 0)}`);
  console.log(
    `  ${name.padEnd(8)} ${String(s.games).padStart(6)}  %${fmt(win).padStart(5)}  %${fmt(pct(s.deaths, s.units), 0).padStart(3)}  ${fmt(s.damage / s.units, 0).padStart(5)}  ${fmt(s.heal / s.units, 0).padStart(4)}  ${fmt(s.shield / s.units, 0).padStart(5)}${flag}`,
  );
}
console.log(warnings.length ? `  UYARI: hedef aralığın dışında: ${warnings.join(', ')}` : '  Tüm sınıflar hedef aralığın içinde.');

console.log('');
console.log('KOMPOZİSYONLAR (takım olarak kazanma oranı; 4 sınıflı 15 farklı takım)');
const comps = [...r.comps].map(([key, c]) => ({ key, ...c })).sort((a, b) => winRate(b) - winRate(a));
for (const c of comps) {
  const win = winRate(c);
  const names = c.key.split('+').map((id) => content.classes[id]?.name ?? id).join(' + ');
  console.log(`  %${fmt(win).padStart(5)}  (${String(c.games).padStart(4)} savaş)  ${names}${win < 30 || win > 70 ? '  <-- uç değer' : ''}`);
}

console.log('');
console.log(`SKILL KULLANIMI (sınıfın hamlelerinin yüzde kaçı; bedelli bir skill %${SKILL_SHARE_LIMIT}'ı aşmamalı)`);
const skillWarnings: string[] = [];
for (const { name, s } of rows) {
  const total = [...s.skillUses.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${name}  (savaşa katılan birim başına ${fmt(s.moves / s.units)} hamle, ${fmt(s.skips / s.units)} pas)`);
  for (const [skillId, n] of [...s.skillUses].sort((a, b) => b[1] - a[1])) {
    const skill = content.skills[skillId] ?? (content.globalSkills[skillId] ? { name: content.globalSkills[skillId]!.name, cost: { amount: 0 } } : undefined);
    const share = pct(n, total);
    const paid = (skill?.cost.amount ?? 0) > 0;
    const flag = paid && share > SKILL_SHARE_LIMIT ? '  <-- baskın' : '';
    if (flag) skillWarnings.push(`${name} ${skill?.name} %${fmt(share, 0)}`);
    console.log(`      ${(skill?.name ?? skillId).padEnd(18)} %${fmt(share, 0).padStart(3)}${paid ? '' : '  (bedelsiz)'}${flag}`);
  }
}
console.log(skillWarnings.length ? `  UYARI: baskın skill: ${skillWarnings.join(', ')}` : '  Baskın (tek doğru hamle) skill yok.');

console.log('');
console.log("GLOBAL SKILL KULLANIMI (Rest / Skip Turn / Move Tile; hamlelerin yüzde kaçı)");
const globalIds = Object.keys(content.globalSkills);
let allMoves = 0;
const allGlobal = new Map<string, number>();
for (const { name, s } of rows) {
  const total = [...s.skillUses.values()].reduce((a, b) => a + b, 0);
  allMoves += total;
  const parts = globalIds.map((id) => {
    const n = s.skillUses.get(id) ?? 0;
    allGlobal.set(id, (allGlobal.get(id) ?? 0) + n);
    return `${content.globalSkills[id]!.name} %${fmt(pct(n, total), 1)}`;
  });
  console.log(`  ${name.padEnd(10)} ${parts.join('   ')}`);
}
console.log(`  TOPLAM     ${globalIds.map((id) => `${content.globalSkills[id]!.name} %${fmt(pct(allGlobal.get(id) ?? 0, allMoves), 1)}`).join('   ')}`);
