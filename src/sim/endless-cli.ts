// Endless simülatörü raporu (Türkçe). Hedefler: data/endless.json > balance.
// Kullanım: npm run sim:endless -- [koşu sayısı] [ilk seed] [--compare] [--gear=best|none] [--relics=pick|none] [--max=40] [--jobs=N] [--json=dosya]
//   Varsayılan: 300 koşu, seed 1, item + kalıntı açık, oyuncu vekili Medium ("iyi oyuncu"), iş sayısı = çekirdek - 1 (en fazla 12).
//   --compare: aynı seed'lerle item'siz ve kalıntısız koşuları da oynar ve karşılaştırır.
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { content } from '../engine';
import { ENDLESS as BASE, relicDef, type EndlessConfig } from '../endless';
import { keyMetrics, mergeEndlessResults, simulateEndless, summarize, type EndlessSimResult } from './endless';

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const has = (name: string) => args.includes(`--${name}`);
const pos = args.filter((a) => !a.startsWith('--'));
const runs = Number(pos[0] ?? 300);
const firstSeed = Number(pos[1] ?? 1);
const maxWave = Number(flag('max') ?? 40);
// --cfg=dosya.json: data/endless.json üstüne yazılan deneme ayarları (yalnızca simde; ayar denemeleri için, veri dosyası değişmez)
const cfgFile = flag('cfg');
const ENDLESS: EndlessConfig = cfgFile ? { ...BASE, ...(JSON.parse(readFileSync(cfgFile, 'utf8')) as Partial<EndlessConfig>) } : BASE;
const part = flag('part'); // iç kullanım: "başlangıç:bitiş:gear:relics" (paralel parça, JSON çıktı)
const jobs = Math.max(1, Number(flag('jobs') ?? Math.min(12, cpus().length - 1)));
type Variant = { gear: 'best' | 'none'; relics: 'pick' | 'none'; label: string };
const main0: Variant = { gear: (flag('gear') ?? 'best') as 'best' | 'none', relics: (flag('relics') ?? 'pick') as 'pick' | 'none', label: 'ana' };
const variants: Variant[] = has('compare')
  ? [{ gear: 'best', relics: 'pick', label: 'item + kalıntı' }, { gear: 'none', relics: 'pick', label: 'item YOK' }, { gear: 'best', relics: 'none', label: 'kalıntı YOK' }]
  : [main0];

const fmt = (n: number, d = 1) => (Number.isNaN(n) ? '  -' : n.toFixed(d).replace('.', ','));
const bal = (ENDLESS as unknown as { balance?: { targets: Record<string, [number, number]> } }).balance?.targets ?? {};

function runPart(start: number, end: number, v: Variant): Promise<EndlessSimResult> {
  const script = fileURLToPath(import.meta.url);
  const childArgs = [...process.execArgv, script, String(runs), String(firstSeed), `--max=${maxWave}`, ...(cfgFile ? [`--cfg=${cfgFile}`] : []), `--part=${start}:${end}:${v.gear}:${v.relics}`];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.on('exit', (code) => (code === 0 ? resolve(JSON.parse(buf) as EndlessSimResult) : reject(new Error(`part ${start}:${end} exit ${code}`))));
  });
}

async function runVariant(v: Variant): Promise<EndlessSimResult> {
  if (jobs <= 1 || runs < 12) return simulateEndless({ runs, firstSeed, gear: v.gear, relics: v.relics, maxWave, cfg: ENDLESS });
  const n = Math.min(jobs, runs);
  const bounds = Array.from({ length: n }, (_, k) => [Math.floor((runs * k) / n), Math.floor((runs * (k + 1)) / n)] as const);
  return mergeEndlessResults(await Promise.all(bounds.map(([a, b]) => runPart(a, b, v))));
}

async function main() {
  const t0 = Date.now();
  const results: EndlessSimResult[] = [];
  for (const v of variants) results.push(await runVariant(v));
  const json = flag('json');
  if (json) writeFileSync(json, JSON.stringify(results));
  report(results, (Date.now() - t0) / 1000);
}

const band = (key: string, v: number) => {
  const b = bal[key];
  if (!b) return '';
  return ` (hedef ${b[0]}-${b[1]})${v < b[0] || v > b[1] ? ' !' : ''}`;
};

function report(results: EndlessSimResult[], secs: number) {
  console.log('Embers of Valdoria endless simülatörü');
  console.log('=====================================');
  console.log(`Koşu: ${runs}, seed ${firstSeed}.., tavan dalga ${maxWave}. Oyuncu vekili Medium YZ ("iyi oyuncu"), düşman ${ENDLESS.difficulty}. Süre ${fmt(secs, 0)} sn.`);
  const r = results[0]!;
  const s = summarize(r);
  const k = keyMetrics(r, 4, ENDLESS);
  console.log('');
  console.log('HEDEFLER (data/endless.json > balance)');
  console.log(`  İlk 4 dalganın en düşük kazanma oranı  %${fmt(k.earlyMinWin)}${band('earlyMinWin', k.earlyMinWin)}`);
  console.log(`  İlk boss (dalga ${ENDLESS.bossEvery}) kazanma           %${fmt(k.firstBossWin)}${band('firstBossWin', k.firstBossWin)}`);
  console.log(`  Ulaşılan dalga ortalama / medyan       ${fmt(k.mean)} / ${k.median}${band('mean', k.mean)}${band('median', k.median)}`);
  console.log(`  30. dalgaya ulaşan                     %${fmt(k.reach30)}${band('reach30', k.reach30)}`);
  console.log(`  Dağılım p10 / p50 / p90: ${s.p10} / ${s.p50} / ${s.p90}; tavana ulaşan %${fmt(s.cappedPct)}`);
  console.log('');
  console.log('DALGALAR  (ulaşan %, oynayan, kazanma %, giriş canı %, zafer sonu can %, zaferde düşen, tur)');
  for (let w = 1; w <= r.maxWave; w++) {
    if (!s.fought[w]) break;
    const kind = w % ENDLESS.bossEvery === 0 ? 'BOSS ' : w % ENDLESS.eliteEvery === 0 ? 'elit ' : '     ';
    console.log(
      `  ${String(w).padStart(2)} ${kind} ulaşan %${fmt(s.survival[w]!).padStart(5)}  n=${String(s.fought[w]).padStart(4)}  kazanma %${fmt(s.winRate[w]!).padStart(5)}  can giriş %${fmt(s.hpStart[w]!, 0).padStart(3)} çıkış %${fmt(s.hpEnd[w]!, 0).padStart(3)}  düşen ${fmt(s.deaths[w]!, 2)}  ${fmt(s.turns[w]!, 0).padStart(3)} tur`,
    );
  }
  console.log(`  Tür başına kazanma: normal %${fmt(s.byKind.normal)}, elit %${fmt(s.byKind.elite)}, boss %${fmt(s.byKind.boss)}`);
  // Ölüm yeri
  const deathKinds = { normal: 0, elite: 0, boss: 0 };
  for (const x of r.runs) {
    const last = x.waves[x.waves.length - 1];
    if (last && !last.win) deathKinds[last.k]++;
  }
  console.log(`  Koşuların bittiği dalga türü: normal ${deathKinds.normal}, elit ${deathKinds.elite}, boss ${deathKinds.boss}`);

  console.log('  Özel dalgalar (karşılaşma x dalga: kazanma %, n):');
  const sp: Record<string, Record<number, { n: number; w: number }>> = {};
  for (const x of r.runs)
    for (const v of x.waves)
      if (v.e) {
        const a = ((sp[v.e] ??= {})[v.w] ??= { n: 0, w: 0 });
        a.n++;
        if (v.win) a.w++;
      }
  for (const [id, by] of Object.entries(sp))
    console.log(`    ${id.padEnd(20)} ${Object.entries(by).map(([w, a]) => `${w}: %${fmt((a.w / a.n) * 100, 0)} (${a.n})`).join('   ')}`);

  if (results.length > 1) {
    console.log('');
    console.log('KARŞILAŞTIRMA (aynı seed\'ler)');
    for (let i = 0; i < results.length; i++) {
      const x = results[i]!;
      const ks = keyMetrics(x, 4, ENDLESS);
      const ss = summarize(x);
      console.log(
        `  ${variants[i]!.label.padEnd(16)} ort ${fmt(ks.mean).padStart(5)}  medyan ${String(ks.median).padStart(3)}  p10/p90 ${ss.p10}/${ss.p90}  ilk4 min %${fmt(ks.earlyMinWin)}  boss10 %${fmt(ks.firstBossWin)}  30+ %${fmt(ks.reach30)}`,
      );
    }
  }

  console.log('');
  console.log('SINIFLAR  (takımda olduğu koşular: ortalama ulaşılan dalga, ilk boss geçme %)');
  const cls: Record<string, { n: number; sum: number; boss: number }> = {};
  for (const x of r.runs)
    for (const c of x.classes) {
      const a = (cls[c] ??= { n: 0, sum: 0, boss: 0 });
      a.n++;
      a.sum += x.reached;
      if (x.reached > ENDLESS.bossEvery) a.boss++;
    }
  for (const [id, a] of Object.entries(cls).sort((p, q) => q[1].sum / q[1].n - p[1].sum / p[1].n))
    console.log(`  ${(content.classes[id]?.name ?? id).padEnd(10)} n=${String(a.n).padStart(4)}  ort dalga ${fmt(a.sum / a.n).padStart(5)}  10'u geçen %${fmt((a.boss / a.n) * 100).padStart(5)}`);

  if (r.relics === 'pick') {
    console.log('');
    console.log(`KALINTILAR  (ilk boss'u geçen koşularda: o kalıntıyı ilk seçenlerin ortalama ulaşılan dalgası)`);
    const rel: Record<string, { n: number; sum: number }> = {};
    for (const x of r.runs) {
      const first = x.relics[0];
      if (!first) continue;
      const a = (rel[first] ??= { n: 0, sum: 0 });
      a.n++;
      a.sum += x.reached;
    }
    for (const [id, a] of Object.entries(rel).sort((p, q) => q[1].sum / q[1].n - p[1].sum / p[1].n))
      console.log(`  ${(relicDef(id)?.name ?? id).padEnd(22)} n=${String(a.n).padStart(4)}  ort dalga ${fmt(a.sum / a.n)}`);
  }
  console.log('');
  console.log(`Gear Score (koşu sonu) ortalama: ${fmt(r.runs.reduce((a, x) => a + x.gearScore, 0) / Math.max(1, r.runs.length))}`);
}

if (part) {
  const [a, b, g, rl] = part.split(':') as [string, string, 'best' | 'none', 'pick' | 'none'];
  const start = Number(a);
  const end = Number(b);
  process.stdout.write(JSON.stringify(simulateEndless({ runs: end - start, firstSeed: firstSeed + start, gear: g, relics: rl, maxWave, cfg: ENDLESS })));
} else {
  void main();
}
