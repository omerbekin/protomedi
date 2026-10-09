// Sefer simülatörü raporu (Türkçe). Tasarım ve hedefler: docs/balance.md > Sefer dengesi.
// Kullanım: npm run sim:campaign -- [sefer sayısı] [ilk seed] [zorluk: easy|medium|hard|all] [oyuncu vekili: medium|easy|both] [--jobs=N] [--attempts=N] [--gear=best|none] [--json=dosya]
//   Varsayılan: 240 sefer (12 rotanın her biri 20 kez), seed 1, tüm zorluklar, oyuncu vekili Medium ("iyi oyuncu") ve Easy ("ortalama oyuncu"),
//   iş sayısı = çekirdek sayısı - 1 (en fazla 12). Her (zorluk, vekil) çifti ayrı ölçülür.
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG, getMap, node, type Difficulty } from '../campaign';
import { content, type AiDifficulty } from '../engine';
import { allRoutes, categoryFirstWin, mergeCampaignResults, nodeCategory, routeLabel, simulateCampaign, type CampaignSimResult, type NodeCategory } from './campaign';
import campaignBalance from '../../data/campaign/balance.json';

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const pos = args.filter((a) => !a.startsWith('--'));
const runs = Number(pos[0] ?? 240);
const firstSeed = Number(pos[1] ?? 1);
const diffs: Difficulty[] = !pos[2] || pos[2] === 'all' ? ['easy', 'medium', 'hard'] : [pos[2] as Difficulty];
const players: AiDifficulty[] = !pos[3] || pos[3] === 'both' ? ['medium', 'easy'] : [pos[3] as AiDifficulty];
const maxAttempts = Number(flag('attempts') ?? 10);
const gear = (flag('gear') ?? 'best') as 'best' | 'none'; // --gear=best|none (items.md 4.4)
const part = flag('part'); // iç kullanım: "başlangıç:bitiş" (paralel parça, JSON çıktı)
const jobs = Math.max(1, Number(flag('jobs') ?? Math.min(12, cpus().length - 1)));

const map = getMap(CONFIG.maps[0]!);
const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

function runPart(start: number, end: number): Promise<CampaignSimResult[]> {
  const script = fileURLToPath(import.meta.url);
  const childArgs = [...process.execArgv, script, String(runs), String(firstSeed), diffs.length === 1 ? diffs[0]! : 'all', players.length === 1 ? players[0]! : 'both', `--attempts=${maxAttempts}`, `--gear=${gear}`, `--part=${start}:${end}`];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.on('exit', (code) => (code === 0 ? resolve(JSON.parse(buf) as CampaignSimResult[]) : reject(new Error(`part ${start}:${end} exit ${code}`))));
  });
}

async function main() {
  const t0 = Date.now();
  let results: CampaignSimResult[];
  if (jobs <= 1 || runs < 24) {
    results = diffs.flatMap((difficulty) => players.map((player) => simulateCampaign({ difficulty, player, runs, firstSeed, maxAttempts, gear })));
  } else {
    const n = Math.min(jobs, runs);
    const bounds = Array.from({ length: n }, (_, k) => [Math.floor((runs * k) / n), Math.floor((runs * (k + 1)) / n)] as const);
    const parts = await Promise.all(bounds.map(([a, b]) => runPart(a, b)));
    results = parts[0]!.map((_, i) => mergeCampaignResults(parts.map((p) => p[i]!)));
  }
  const json = flag('json');
  if (json) writeFileSync(json, JSON.stringify(results, null, 1));
  report(results, (Date.now() - t0) / 1000);
}

const CAT_NAME: Record<NodeCategory, string> = { tutorial: 'tutorial', normal: 'normal', elite: 'elit', boss: 'boss' };
const target = campaignBalance.targets as unknown as Record<string, Record<NodeCategory, [number, number]>>;

function report(results: CampaignSimResult[], secs: number) {
  console.log('Embers of Valdoria sefer simülatörü (Valdoria)');
  console.log('=================================');
  console.log(`Sefer: ${runs} (12 rota eşit), seed ${firstSeed}.., düğüm başına en fazla ${maxAttempts} deneme, ekipman ${gear}. Süre ${fmt(secs, 0)} sn.`);
  console.log('Oyuncu vekili: Medium YZ = "iyi oyuncu", Easy YZ = "ortalama oyuncu". Düşman: zorluğun YZ\'si + zorluğun düşman çarpanları.');
  console.log('');
  console.log('KATEGORİ x ZORLUK: ilk denemede kazanma (%; hedef bant Medium vekil için data/campaign/balance.json)');
  console.log(`  ${'zorluk/vekil'.padEnd(16)} ${(['tutorial', 'normal', 'elite', 'boss'] as NodeCategory[]).map((c) => CAT_NAME[c].padStart(16)).join('')}   bitirme  yenilgi/sefer`);
  for (const r of results) {
    const cat = categoryFirstWin(r, map);
    const cells = (['tutorial', 'normal', 'elite', 'boss'] as NodeCategory[]).map((c) => {
      const band = r.player === 'medium' ? target[r.difficulty]?.[c] : undefined;
      const bad = band && (cat[c] < band[0] || cat[c] > band[1]);
      return `${fmt(cat[c]).padStart(6)}${band ? ` (${band[0]}-${band[1]})${bad ? '!' : ' '}` : '         '}`.padStart(16);
    });
    console.log(`  ${`${r.difficulty}/${r.player}`.padEnd(16)} ${cells.join('')}   %${fmt(pct(r.completed, r.runs)).padStart(5)}  ${fmt(r.defeats / r.runs, 2).padStart(6)}`);
  }
  for (const r of results) {
    console.log('');
    console.log(`---- ${r.difficulty.toUpperCase()} / oyuncu vekili ${r.player} ----`);
    console.log('  DÜĞÜMLER  (ilk deneme kazanma, ort. deneme, başlangıç canı, zafer sonu can, zaferde düşen, savaş süresi tur)');
    const ids = map.nodes.filter((n) => r.nodes[n.id]).map((n) => n.id);
    const rows = ids.map((id) => {
      const a = r.nodes[id]!;
      return { id, a, first: pct(a.firstWins, a.reached) };
    });
    for (const { id, a, first } of rows) {
      const n = node(map, id);
      console.log(
        `  ${id.padEnd(4)} ${n.name.padEnd(18)} ${CAT_NAME[nodeCategory(map, id)].padEnd(8)} n=${String(a.reached).padStart(4)}  ilk %${fmt(first).padStart(5)}  deneme ${fmt(a.attemptsToClear / Math.max(1, a.cleared), 2)}  can giriş %${fmt((a.hpStartSum / a.reached) * 100, 0).padStart(3)} çıkış %${fmt((a.hpEndSum / Math.max(1, a.wins)) * 100, 0).padStart(3)}  düşen ${fmt(a.deathsOnWin / Math.max(1, a.wins), 2)}  ${fmt(a.turnsSum / a.battles, 0).padStart(3)} tur${a.stuck ? `  TAKILDI ${a.stuck}` : ''}`,
      );
    }
    const sorted = [...rows].filter((x) => nodeCategory(map, x.id) !== 'tutorial').sort((x, y) => x.first - y.first);
    console.log(`  En zor: ${sorted.slice(0, 3).map((x) => `${x.id} %${fmt(x.first)}`).join(', ')}; en kolay: ${sorted.slice(-3).reverse().map((x) => `${x.id} %${fmt(x.first)}`).join(', ')}`);
    console.log('  ROTALAR  (bitirme %, sefer başına yenilgi)');
    for (const route of allRoutes(map)) {
      const label = routeLabel(map, route);
      const ra = r.routes[label];
      if (!ra) continue;
      const elites = route.filter((id) => node(map, id).type === 'elite').length;
      const battles = route.filter((id) => node(map, id).encounter).length;
      console.log(`  ${label.padEnd(12)} savaş ${battles} elit ${elites}  n=${String(ra.runs).padStart(3)}  bitirme %${fmt(pct(ra.completed, ra.runs)).padStart(5)}  yenilgi ${fmt(ra.defeats / ra.runs, 2)}`);
    }
    console.log('  SINIFLAR  (asıl takımda iken: bitirme %, sefer başına yenilgi; tutorial kahramanı iken Mill Road ilk deneme)');
    const cls = Object.entries(r.classes).sort((x, y) => x[1].defeats / Math.max(1, x[1].runs) - y[1].defeats / Math.max(1, y[1].runs));
    for (const [id, c] of cls)
      console.log(
        `  ${(content.classes[id]?.name ?? id).padEnd(10)} n=${String(c.runs).padStart(4)}  bitirme %${fmt(pct(c.completed, c.runs)).padStart(5)}  yenilgi ${fmt(c.defeats / Math.max(1, c.runs), 2)}   kahraman n=${String(c.heroRuns).padStart(3)} Mill Road ilk %${fmt(pct(c.heroFirstWins, c.heroRuns)).padStart(5)}`,
      );
  }
}

if (part) {
  const [start, end] = part.split(':').map(Number) as [number, number];
  const out = diffs.flatMap((difficulty) =>
    players.map((player) => simulateCampaign({ difficulty, player, runs: end - start, firstSeed: firstSeed + start, routeOffset: start, maxAttempts, gear })),
  );
  process.stdout.write(JSON.stringify(out));
} else {
  void main();
}
