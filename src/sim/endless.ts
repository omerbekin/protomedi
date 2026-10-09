// Endless simülatörü (headless): Endless koşularını baştan sona iki taraf da yapay zeka ile oynatır ve dalga eğrisini ölçer.
// npm run sim:endless (rapor: src/sim/endless-cli.ts) ve tests/endless-balance.test.ts bunu kullanır. Hedefler: data/endless.json > balance.
//
// Akış gerçek oyunun saf endless mantığıyla aynıdır (src/endless): newRun -> [dalga savaşı -> (boss sonrası kalıntı) -> ödül kartı -> (dükkân)] ...
// Oyuncu vekili ("iyi oyuncu"): takım seed'li rastgele 4 farklı sınıf; savaşta Medium YZ; ödülde canı düşükse iyileştirme, değilse item, yoksa altın;
// dükkânda parası yeten en pahalı item'leri alır; her ödül / dükkândan sonra "Equip best"; kalıntıyı seed'li rastgele seçer (kalıntı başına etki ölçülsün).
// Karşılaştırma için item'siz (`gear: 'none'`) ve kalıntısız (`relics: 'none'`) koşular da oynanabilir (aynı seed'ler).
import { battleSummary, content, Rng, type AiDifficulty } from '../engine';
import {
  ENDLESS,
  applyOutcome,
  chooseRelic,
  chooseReward,
  buyItem,
  equipBestRun,
  fightWave,
  gearScore,
  leaveShop,
  newRun,
  outcomeFromSummary,
  specialEncounter,
  waveKind,
  wavePlan,
  type EndlessConfig,
  type EndlessRun,
  type WaveKind,
} from '../endless';

export interface EndlessSimOptions {
  runs: number;
  firstSeed?: number;
  /** Oyuncu tarafının YZ'si (Medium = "iyi oyuncu"). */
  player?: AiDifficulty;
  /** 'best' = item alır ve "Equip best" yapar (varsayılan); 'none' = hiç item takmaz (item kartı/dükkân yok sayılır). */
  gear?: 'best' | 'none';
  /** 'pick' = boss sonrası kalıntı seçer (varsayılan); 'none' = kalıntı almaz. */
  relics?: 'pick' | 'none';
  /** Bu dalgayı geçen koşu "tavan" sayılır ve durdurulur (sonsuz döngü / süre güvencesi). Varsayılan 40. */
  maxWave?: number;
  cfg?: EndlessConfig;
  /**
   * Dizilim taşıma (Ömer 2026-10-09): true (varsayılan) = oyuncu vekili de oyuncu gibi önceki dalganın savaş sonu hücrelerinden başlar
   * (applyOutcome; koşu başı otomatik dizilim); false = her dalga otomatik dizilim (eski davranış; karşılaştırma için).
   */
  carryFormation?: boolean;
}

/** Tek dalganın kaydı (kısa alan adları: yüzlerce koşu JSON ile süreçler arası taşınır). */
export interface WaveRec {
  w: number;
  k: WaveKind;
  win: boolean;
  /** Savaşa giren takımın ortalama can oranı (0-1). */
  hs: number;
  /** Savaş sonu ortalama can oranı (düşen = 0). */
  he: number;
  /** Düşen kahraman sayısı. */
  d: number;
  /** Savaş süresi (tur). */
  t: number;
  /** Elit / boss dalgasının karşılaşması (data/campaign/encounters.json id). */
  e?: string;
}

export interface RunRec {
  seed: number;
  classes: string[];
  /** Koşunun bittiği dalga (kaybedilen dalga); tavana ulaştıysa maxWave + 1. */
  reached: number;
  capped: boolean;
  relics: string[];
  gearScore: number;
  waves: WaveRec[];
}

export interface EndlessSimResult {
  gear: 'best' | 'none';
  relics: 'pick' | 'none';
  player: AiDifficulty;
  maxWave: number;
  runs: RunRec[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Seed'li takım: rastgele havuzdan 4 farklı sınıf. */
export function simTeam(seed: number, size: number): string[] {
  const rng = new Rng(seed * 7919 + 17);
  const pool = [...content.randomPool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, size);
}

/** Oyuncu vekilinin iyileştirme eşiği: takımın ortalama canı bunun altındaysa iyileştirme kartı alınır. */
export const HEAL_BELOW = 0.7;

/**
 * Oyuncu vekilinin ödül seçimi (kart dizini). Can düşükse iyileştirme; değilse item (item'siz koşuda item kartı yok sayılır), yoksa altın.
 * Boss sonrası: item varsa item, yoksa Hero's Feast. Item'li ve item'siz koşu aynı iyileştirme eşiğini kullanır (fark yalnızca item).
 */
export function pickReward(run: EndlessRun, gear: 'best' | 'none'): number {
  const cards = run.offer ?? [];
  const hp = avg(run.heroes.map((h) => h.hpRatio));
  const low = Math.min(...run.heroes.map((h) => h.hpRatio));
  const idx = (k: string) => cards.findIndex((c) => c.kind === k);
  const heal = idx('heal');
  if (heal >= 0 && (hp < HEAL_BELOW || (low <= 0.25 && hp < HEAL_BELOW + 0.15))) return heal;
  if (gear === 'best' && idx('item') >= 0) return idx('item');
  if (gear === 'none' && idx('feast') >= 0) return idx('feast');
  if (idx('gold') >= 0) return idx('gold');
  if (idx('feast') >= 0) return idx('feast');
  return heal >= 0 ? heal : 0;
}

export function simulateEndless(o: EndlessSimOptions): EndlessSimResult {
  const cfg = o.cfg ?? ENDLESS;
  const gear = o.gear ?? 'best';
  const relics = o.relics ?? 'pick';
  const player = o.player ?? 'medium';
  const maxWave = o.maxWave ?? 40;
  const res: EndlessSimResult = { gear, relics, player, maxWave, runs: [] };
  for (let i = 0; i < o.runs; i++) {
    const seed = (o.firstSeed ?? 1) + i;
    const classes = simTeam(seed, cfg.partySize);
    const rng = new Rng(seed * 104729 + 3);
    let run = newRun(seed, classes, '2026-01-01T00:00:00.000Z', cfg);
    const waves: WaveRec[] = [];
    let capped = false;
    let guard = 0;
    while (run.phase !== 'over' && guard++ < maxWave * 10) {
      if (run.phase === 'ready') {
        if (run.wave > maxWave) {
          capped = true;
          break;
        }
        if (o.carryFormation === false) run = { ...run, heroes: run.heroes.map(({ slot: _slot, ...h }) => h) };
        const plan = wavePlan(run, cfg);
        const hs = avg(run.heroes.map((h) => h.hpRatio));
        const battle = fightWave(plan, player);
        const sum = battleSummary(battle);
        const win = battle.winner === 'party';
        const out = outcomeFromSummary(plan, win, sum.units, sum.turnsTaken);
        const enc = specialEncounter(run.seed, run.wave, cfg);
        waves.push({
          w: run.wave,
          k: waveKind(run.wave, cfg),
          win,
          hs: Math.round(hs * 1000) / 1000,
          he: Math.round(avg(out.units.map((u) => (u.alive ? u.hpRatio : 0))) * 1000) / 1000,
          d: out.units.filter((u) => !u.alive).length,
          t: sum.turnsTaken,
          ...(enc ? { e: enc } : {}),
        });
        run = applyOutcome(run, plan, out, cfg);
      } else if (run.phase === 'relic') {
        const offer = run.relicOffer ?? [];
        if (relics === 'pick' && offer.length) run = chooseRelic(run, offer[rng.int(0, offer.length - 1)]!);
        else run = { ...run, phase: run.offer ? 'reward' : 'ready', relicOffer: undefined };
      } else if (run.phase === 'reward') {
        run = chooseReward(run, pickReward(run, gear), cfg);
        if (gear === 'best' && run.phase !== 'over') run = equipBestRun(run);
      } else if (run.phase === 'shop') {
        if (gear === 'best') {
          for (;;) {
            const shop = run.shop ?? [];
            let best = -1;
            shop.forEach((e, j) => {
              if (!e.sold && e.price <= run.gold && (best < 0 || e.price > shop[best]!.price)) best = j;
            });
            if (best < 0) break;
            const next = buyItem(run, best, undefined, cfg);
            if (next === run) break;
            run = next;
          }
          run = equipBestRun(leaveShop(run));
        } else run = leaveShop(run);
      } else break;
    }
    res.runs.push({ seed, classes, reached: capped ? maxWave + 1 : run.wave, capped, relics: [...(run.relics ?? [])], gearScore: gearScore(run), waves });
  }
  return res;
}

// ------------------------------------------------------------ özet

export interface EndlessSummary {
  runs: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** Tavana (maxWave) ulaşan koşu oranı (%). */
  cappedPct: number;
  /** Dalga w'ye ulaşan koşu oranı (%), dizin = dalga. */
  survival: number[];
  /** Dalga w'yi oynayan koşularda kazanma oranı (%), dizin = dalga; oynayan yoksa NaN. */
  winRate: number[];
  fought: number[];
  /** Dalga başına ortalama giriş / çıkış canı (%; çıkış yalnızca kazanılanlarda), düşen. */
  hpStart: number[];
  hpEnd: number[];
  deaths: number[];
  turns: number[];
  /** Tür başına kazanma (%). */
  byKind: Record<WaveKind, number>;
  /** Ulaşılan dalgaya en az 30 dalga ile ulaşan (%). */
  reach30: number;
}

const pctile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]! : 0);

export function summarize(r: EndlessSimResult): EndlessSummary {
  const n = r.runs.length;
  const top = r.maxWave + 1;
  const reached = r.runs.map((x) => x.reached).sort((a, b) => a - b);
  const survival: number[] = [];
  const winRate: number[] = [];
  const fought: number[] = [];
  const hpStart: number[] = [];
  const hpEnd: number[] = [];
  const deaths: number[] = [];
  const turns: number[] = [];
  const kind: Record<WaveKind, { n: number; w: number }> = { normal: { n: 0, w: 0 }, elite: { n: 0, w: 0 }, boss: { n: 0, w: 0 } };
  for (let w = 1; w <= top; w++) {
    survival[w] = n ? (r.runs.filter((x) => x.reached >= w).length / n) * 100 : 0;
    const recs = r.runs.flatMap((x) => x.waves.filter((v) => v.w === w));
    fought[w] = recs.length;
    const wins = recs.filter((v) => v.win);
    winRate[w] = recs.length ? (wins.length / recs.length) * 100 : NaN;
    hpStart[w] = avg(recs.map((v) => v.hs)) * 100;
    hpEnd[w] = avg(wins.map((v) => v.he)) * 100;
    deaths[w] = avg(wins.map((v) => v.d));
    turns[w] = avg(recs.map((v) => v.t));
    for (const v of recs) {
      kind[v.k].n++;
      if (v.win) kind[v.k].w++;
    }
  }
  const kp = (k: WaveKind) => (kind[k].n ? (kind[k].w / kind[k].n) * 100 : NaN);
  return {
    runs: n,
    mean: avg(reached),
    p10: pctile(reached, 10),
    p50: pctile(reached, 50),
    p90: pctile(reached, 90),
    cappedPct: n ? (r.runs.filter((x) => x.capped).length / n) * 100 : 0,
    survival,
    winRate,
    fought,
    hpStart,
    hpEnd,
    deaths,
    turns,
    byKind: { normal: kp('normal'), elite: kp('elite'), boss: kp('boss') },
    reach30: n ? (r.runs.filter((x) => x.reached >= 30).length / n) * 100 : 0,
  };
}

/** Hedef kontrolü için ana ölçüler: ilk N dalganın en düşük kazanma oranı, ilk boss kazanma oranı, medyan / ortalama ulaşılan dalga, 30. dalgaya ulaşma. */
export interface EndlessKeyMetrics {
  earlyMinWin: number;
  firstBossWin: number;
  mean: number;
  median: number;
  reach30: number;
}

export function keyMetrics(r: EndlessSimResult, earlyWaves = 4, cfg: EndlessConfig = ENDLESS): EndlessKeyMetrics {
  const s = summarize(r);
  const early = Array.from({ length: earlyWaves }, (_, i) => s.winRate[i + 1]!).filter((v) => !Number.isNaN(v));
  const boss = s.winRate[cfg.bossEvery];
  return { earlyMinWin: early.length ? Math.min(...early) : 0, firstBossWin: boss === undefined || Number.isNaN(boss) ? 0 : boss, mean: s.mean, median: s.p50, reach30: s.reach30 };
}

/** Paralel parçaları birleştirir (aynı ayarlar). */
export function mergeEndlessResults(parts: EndlessSimResult[]): EndlessSimResult {
  return { ...parts[0]!, runs: parts.flatMap((p) => p.runs).sort((a, b) => a.seed - b.seed) };
}
