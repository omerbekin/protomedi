// Headless denge simülatörü raporu (Türkçe).
// Rastgele takımlı savaşlar (her seed'de farklı oyuncu/düşman kompozisyonu) iki taraf da yapay zeka ile oynanır;
// sınıf, skill, ultimate, karşılaşma ve kompozisyon bazında rapor çıkarır. Hedef bantlar data/balance.json (docs/balance.md).
// Kullanım: npm run sim -- [savaş sayısı] [ilk seed] [oyuncu boyutu] [düşman boyutu]
//   Argümansız: data/balance.json > measure (10.000 savaş x iki seed grubu, 4'e 4; tek çekirdekte birkaç dakika sürer).
//   İlk seed verilirse yalnızca o grup koşulur.
import { content } from '../engine';
import { balance, mergeResults, simulate, skillCategory, skillShare, ultRawRate, ultReadyRate, winRate, type SimResult } from './simulate';

const B = balance.bands;
const runs = Number(process.argv[2] ?? balance.measure.runs);
const seeds = process.argv[3] ? [Number(process.argv[3])] : balance.measure.seedGroups;
// Takım boyutları (isteğe bağlı): npm run sim -- 3000 1 5 5  (oyuncu, düşman; taraf başına 1..12)
const sizes: content.TeamSizes = { ...(process.argv[4] ? { partySize: Number(process.argv[4]) } : {}), ...(process.argv[5] ? { enemySize: Number(process.argv[5]) } : {}) };
const SKILL_SHARE_LIMIT = 40; // tek bir (bedelli) skill'in o sınıfın hamlelerindeki payı (eski "tek doğru hamle" uyarısı)

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const pct = (n: number, total: number) => (total === 0 ? 0 : (n / total) * 100);
const out = (band: { low: number; high: number }, v: number) => v < band.low || v > band.high;

const groups = seeds.map((s) => ({ seed: s, r: simulate(runs, s, content.DEFAULT_BATTLE, sizes) }));
const r: SimResult = groups.length === 1 ? groups[0]!.r : mergeResults(groups.map((g) => g.r));
const total = r.runs;
const size = content.battles[content.DEFAULT_BATTLE]?.random?.size;

console.log('Proto denge simülatörü');
console.log('======================');
console.log(`Savaş: ${content.DEFAULT_BATTLE} (her seed'de farklı takımlar), takım ${sizes.partySize ?? size}'e ${sizes.enemySize ?? size}. Yapay zeka vs yapay zeka (Medium).`);
console.log(`Seed grupları: ${groups.map((g) => `${g.seed}..${g.seed + runs - 1}`).join(' ve ')} (grup başına ${runs} savaş, toplam ${total}).`);
console.log('');
console.log('GENEL');
console.log(`  Oyuncu tarafı kazandı : ${r.partyWins} (%${fmt(pct(r.partyWins, total))})`);
console.log(`  Düşman tarafı kazandı : ${r.enemyWins} (%${fmt(pct(r.enemyWins, total))})`);
if (r.draws > 0) console.log(`  Bitmeyen savaş        : ${r.draws} (%${fmt(pct(r.draws, total), 2)})`);
const turns = r.totalTurns / total;
console.log(`  Ortalama savaş uzunluğu: ${fmt(turns)} tur (tüm birimlerin turları toplamı; hedef ${B.battleTurns.low}-${B.battleTurns.high})${out(B.battleTurns, turns) ? '  <-- BANT DIŞI' : ''}`);

const rows = content.randomPool.map((id) => ({ id, name: content.classes[id]!.name, s: r.classes.get(id)! }));
console.log('');
console.log(`SINIF DENGESİ (hedef kazanma oranı %${B.classWin.low}-${B.classWin.high}; sınıfın tek tarafta olduğu savaşlar)`);
console.log(`  sınıf      savaş  kazanma${groups.length > 1 ? groups.map((_, i) => `  grup${i + 1}`).join('') : ''}  ölüm  hamle  hasar  şifa  kalkan   (birim başına)`);
const warnings: string[] = [];
for (const { id, name, s } of [...rows].sort((a, b) => winRate(b.s) - winRate(a.s))) {
  const win = winRate(s);
  const per = groups.length > 1 ? groups.map((g) => `  %${fmt(winRate(g.r.classes.get(id)!)).padStart(5)}`).join('') : '';
  const bad = out(B.classWin, win) || groups.some((g) => out(B.classWin, winRate(g.r.classes.get(id)!)));
  if (bad) warnings.push(`${name} %${fmt(win)}`);
  console.log(
    `  ${name.padEnd(9)} ${String(s.games).padStart(6)}  %${fmt(win).padStart(5)}${per}  %${fmt(pct(s.deaths, s.units), 0).padStart(3)}  ${fmt(s.moves / s.units).padStart(5)}  ${fmt(s.damage / s.units, 0).padStart(5)}  ${fmt(s.heal / s.units, 0).padStart(4)}  ${fmt(s.shield / s.units, 0).padStart(5)}${bad ? '  <-- BANT DIŞI' : ''}`,
  );
}
console.log(warnings.length ? `  UYARI: hedef aralığın dışında: ${warnings.join(', ')}` : '  Tüm sınıflar hedef aralığın içinde.');

console.log('');
console.log(`SKILL KULLANIMI (sınıfın TÜM hamlelerinin yüzdesi; bantlar: temel %${B.basic.low}-${B.basic.high}, normal %${B.normal.low}-${B.normal.high}, durumsal %${B.situational.low}-${B.situational.high}; ultimate ayrı tabloda)`);
const skillWarnings: string[] = [];
for (const { name, id, s } of rows) {
  console.log(`  ${name}  (birim başına ${fmt(s.moves / s.units)} hamle, ${fmt(s.skips / s.units)} pas)`);
  for (const skillId of content.classes[id]!.skills) {
    const skill = content.skills[skillId]!;
    const cat = skillCategory(id, skillId)!;
    const share = skillShare(s, skillId);
    const band = cat === 'ultimate' ? undefined : B[cat];
    const label = { basic: 'temel', normal: 'normal', situational: 'durumsal', ultimate: 'ultimate' }[cat];
    let flag = band && out(band, share) ? '  <-- BANT DIŞI' : '';
    const paid = skill.cost.amount > 0 || (skill.cost.ofCurrent ?? 0) > 0;
    if (!flag && paid && share > SKILL_SHARE_LIMIT) flag = '  <-- baskın';
    if (flag) skillWarnings.push(`${name} ${skill.name} %${fmt(share)}`);
    console.log(`      ${skill.name.padEnd(18)} %${fmt(share).padStart(4)}  ${label}${flag}`);
  }
}
console.log(skillWarnings.length ? `  UYARI: ${skillWarnings.join(', ')}` : '  Tüm skill\'ler bandında.');

console.log('');
console.log(`ULTIMATE (4. skill) KULLANIMI (hazır = birim hayattayken en az bir turunda kullanılabilirdi; hedef: class ortalaması >= %${B.ultimateUsedMin}; tek class %${B.ultimateLowWarn} altıysa uyarı)`);
let ultSum = 0;
for (const { name, id, s } of rows) {
  const ready = ultReadyRate(s);
  ultSum += ready;
  console.log(`  ${name.padEnd(9)} ${content.skills[content.classes[id]!.skills.at(-1)!]!.name.padEnd(15)} hazır olanlardan en az 1 kez: %${fmt(ready, 0).padStart(3)}   ham (tüm birimler): %${fmt(ultRawRate(s), 0).padStart(3)}${ready < B.ultimateLowWarn ? '  <-- ÇOK DÜŞÜK (%' + B.ultimateLowWarn + ' altı)' : ''}`);
}
const ultAvg = ultSum / rows.length;
console.log(`  Class ortalaması: %${fmt(ultAvg)}${ultAvg < B.ultimateUsedMin ? '  <-- BANT DIŞI' : ''}`);

console.log('');
console.log(`KARŞILAŞMA TABLOSU (satırdaki class'ın sütundaki class'a karşı kazanma oranı; aynı takımda olmadıkları savaşlar; eşitlik hedeflenmez, yalnızca < %${B.matchup.crushingLow} / > %${B.matchup.crushingHigh} işaretlenir)`);
const short = (id: string) => content.classes[id]!.name.slice(0, 5);
console.log(`  ${''.padEnd(9)}${rows.map((x) => short(x.id).padStart(6)).join('')}`);
const crushing: string[] = [];
for (const a of rows) {
  const cells = rows.map((b) => {
    if (a.id === b.id) return '     -';
    const m = r.matchups.get(`${a.id}>${b.id}`);
    if (!m || m.games === 0) return '     ?';
    const w = winRate(m);
    const mark = m.games >= B.matchup.minGames && (w > B.matchup.crushingHigh || w < B.matchup.crushingLow);
    if (mark && w > B.matchup.crushingHigh) crushing.push(`${a.name} > ${content.classes[b.id]!.name} %${fmt(w, 0)} (${m.games} savaş)`);
    return `${fmt(w, 0)}${mark ? '!' : ' '}`.padStart(6);
  });
  console.log(`  ${a.name.padEnd(9)}${cells.join('')}`);
}
console.log(crushing.length ? `  EZİCİ EŞLEŞME: ${crushing.join(', ')}` : '  Ezici eşleşme yok.');

console.log('');
console.log('KOMPOZİSYONLAR (takım olarak kazanma oranı; en iyi ve en kötü 8, en az 30 savaş)');
const comps = [...r.comps].map(([key, c]) => ({ key, ...c })).filter((c) => c.games >= 30).sort((a, b) => winRate(b) - winRate(a));
const showComp = (c: (typeof comps)[number]) => {
  const win = winRate(c);
  const names = c.key.split('+').map((id) => content.classes[id]?.name ?? id).join(' + ');
  console.log(`  %${fmt(win).padStart(5)}  (${String(c.games).padStart(4)} savaş)  ${names}${win < 30 || win > 70 ? '  <-- uç değer' : ''}`);
};
comps.slice(0, 8).forEach(showComp);
console.log('  ...');
comps.slice(-8).forEach(showComp);

console.log('');
console.log("GLOBAL SKILL KULLANIMI (Rest / Skip Turn / Move Tile; hamlelerin yüzde kaçı)");
const globalIds = Object.keys(content.globalSkills);
let allMoves = 0;
const allGlobal = new Map<string, number>();
for (const { name, s } of rows) {
  allMoves += s.moves;
  const parts = globalIds.map((gid) => {
    const n = s.skillUses.get(gid) ?? 0;
    allGlobal.set(gid, (allGlobal.get(gid) ?? 0) + n);
    return `${content.globalSkills[gid]!.name} %${fmt(pct(n, s.moves), 1)}`;
  });
  console.log(`  ${name.padEnd(10)} ${parts.join('   ')}`);
}
console.log(`  TOPLAM     ${globalIds.map((gid) => `${content.globalSkills[gid]!.name} %${fmt(pct(allGlobal.get(gid) ?? 0, allMoves), 1)}`).join('   ')}`);
