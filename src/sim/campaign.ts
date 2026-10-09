// Sefer simülatörü (headless): Valdoria seferini baştan sona iki taraf da yapay zeka ile oynatır ve sefer dengesini ölçer.
// npm run sim:campaign (rapor: src/sim/campaign-cli.ts) ve tests/campaign-balance.test.ts bunu kullanır. Tasarım: docs/balance.md > Sefer dengesi.
//
// Akış gerçek oyunun saf sefer mantığıyla aynıdır (src/campaign): kahraman (rastgele) -> Ravenwood adayı (rastgele) -> Watchtower ->
// Ashford'da 11 sınıftan rastgele 3 kişilik yeni takım -> Valdren Keep'ten ayrılırken aday (rastgele) = 4 kişi; rota sabit bir listeden
// (koşu no % 12) seçilir, böylece 12 rota eşit sayıda oynanır. Can taşıma, zafer/boss/kasaba iyileşmesi `applyBattle` / `moveTo` ile.
// Yenilgide "son kayda dönüş" = aynı düğümün savaşı aynı durumla yeniden denenir (oyunda kayıt zaferden sonra alınır; dönüşte kasaba
// iyileşmesi vb. yeniden yaşanır, yani savaşa giren takım birebir aynıdır), yeni denemede savaş seed'i değişir (attempt sayacı).
// `maxAttempts` aşılırsa sefer o düğümde "takıldı" sayılır.
import { Battle, battleSummary, chooseAction, content, type AiDifficulty } from '../engine';
import {
  CONFIG,
  activeHeroes,
  applyBattle,
  battlePlan,
  completeSimple,
  equipBest,
  farewell,
  formCompany,
  getMap,
  newCampaign,
  nextStep,
  node,
  outcomeFrom,
  outgoing,
  pickHero,
  recruit,
  moveTo,
  rngFor,
  shuffle,
  type CampaignMap,
  type CampaignState,
  type Difficulty,
} from '../campaign';
import { MAX_TURNS } from './simulate';

export type NodeCategory = 'tutorial' | 'normal' | 'elite' | 'boss';

/** Düğümün denge kategorisi: Ashford öncesi savaşlar tutorial; elite / boss türleri; kalan savaşlar (battle, guarded treasure) normal. */
export function nodeCategory(map: CampaignMap, nodeId: string): NodeCategory {
  const n = node(map, nodeId);
  const tutorialEnd = map.nodes.find((x) => x.endsTutorial)?.id;
  // Ashford'dan (tutorial sonu) önceki düğümler: başlangıçtan Ashford'a giden tek yoldadır
  const before = new Set<string>();
  let cur: string | undefined = map.start;
  while (cur && cur !== tutorialEnd) {
    before.add(cur);
    const outs = outgoing(map, cur);
    cur = outs.length === 1 ? outs[0] : undefined;
  }
  if (before.has(nodeId)) return 'tutorial';
  if (n.type === 'boss') return 'boss';
  if (n.type === 'elite') return 'elite';
  return 'normal';
}

/** Haritadaki tüm rotalar (başlangıçtan finale; veri sırasıyla). Valdoria: 12. */
export function allRoutes(map: CampaignMap): string[][] {
  const out: string[][] = [];
  const walk = (path: string[]) => {
    const next = outgoing(map, path[path.length - 1]!);
    if (!next.length) out.push(path);
    for (const n of next) walk([...path, n]);
  };
  walk([map.start]);
  return out;
}

/** Rotanın kısa adı (seçim noktalarındaki seçimler): ör. "5A·8C·11A". */
export function routeLabel(map: CampaignMap, route: string[]): string {
  return route.filter((_, i) => i > 0 && outgoing(map, route[i - 1]!).length > 1).join('·');
}

export interface CampaignSimOptions {
  difficulty: Difficulty;
  /** Oyuncu tarafının vekili: Medium = "iyi oyuncu", Easy = "ortalama oyuncu". */
  player: AiDifficulty;
  runs: number;
  firstSeed?: number;
  /** Bir düğümde en fazla deneme (aşılırsa sefer takıldı). Varsayılan 10. */
  maxAttempts?: number;
  /** Koşu i'nin rotası: (i + routeOffset) % rota sayısı (paralel parçalar için). */
  routeOffset?: number;
  /**
   * Takılınca (maxAttempts aşıldı) sefer yine de sürsün mü: düğüm zorla geçilir (takım savaşa girdiği canla, zafer toparlanmasıyla), sefer
   * "bitmedi" sayılır ama sonraki düğümler de ölçülür. Varsayılan true (ölçüm için); false = gerçek sefer gibi orada biter.
   */
  continueOnStuck?: boolean;
  /**
   * Oyuncu vekilinin ekipman politikası (items.md 4.4): 'best' = her loot sonrası takım "Equip best" yapar (varsayılan; iyi oyuncu),
   * 'none' = hiç item takmaz (item'siz referans: düşman ölçeği yine açık, yani zorlaşır).
   */
  gear?: 'best' | 'none';
  /** Her düğümün ilk denemesinden önce durum (ayar betikleri için). */
  onBattle?: (nodeId: string, state: CampaignState) => void;
}

/** Toplanabilir (paralel parçalar birleştirilebilir) sayaçlar. */
export interface NodeAgg {
  /** Düğüme ulaşan seferler (ilk deneme sayısı). */
  reached: number;
  firstWins: number;
  /** Tüm savaşlar (denemeler) ve kazanılanlar. */
  battles: number;
  wins: number;
  /** Temizlenen seferlerin toplam deneme sayısı. */
  cleared: number;
  attemptsToClear: number;
  /** Kazanılan savaşlarda: oyuncu karakterlerinin ortalama kalan can oranı (düşen = 0) toplamı, düşen karakter sayısı. */
  hpEndSum: number;
  deathsOnWin: number;
  /** Savaşa giren takımın ortalama başlangıç can oranı toplamı (ilk denemede). */
  hpStartSum: number;
  turnsSum: number;
  stuck: number;
}

export interface RouteAgg {
  runs: number;
  completed: number;
  defeats: number;
}

export interface ClassAgg {
  /** Sınıfın asıl takımda (Ashford + Valdren gönüllüsü) olduğu seferler. */
  runs: number;
  completed: number;
  defeats: number;
  /** Tutorial kahramanı olarak: Mill Road ilk deneme. */
  heroRuns: number;
  heroFirstWins: number;
}

export interface CampaignSimResult {
  difficulty: Difficulty;
  player: AiDifficulty;
  runs: number;
  completed: number;
  defeats: number;
  nodes: Record<string, NodeAgg>;
  routes: Record<string, RouteAgg>;
  classes: Record<string, ClassAgg>;
}

const emptyNode = (): NodeAgg => ({ reached: 0, firstWins: 0, battles: 0, wins: 0, cleared: 0, attemptsToClear: 0, hpEndSum: 0, deathsOnWin: 0, hpStartSum: 0, turnsSum: 0, stuck: 0 });
const emptyClass = (): ClassAgg => ({ runs: 0, completed: 0, defeats: 0, heroRuns: 0, heroFirstWins: 0 });

/** Tek savaşı yapay zeka ile oynatır: oyuncu tarafı `player`, düşman tarafı zorluğun YZ'si. */
export function fightPlan(plan: ReturnType<typeof battlePlan>, player: AiDifficulty): Battle {
  const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));
  while (!battle.winner && battle.turnsTaken < MAX_TURNS) {
    const actor = battle.currentActor;
    if (!actor) break;
    const choice = chooseAction(battle, actor.uid, content.aiConfig, undefined, { difficulty: actor.side === 'enemy' ? plan.difficulty : player });
    if (!battle.applyChoice(actor.uid, choice).ok) break;
  }
  return battle;
}

export function simulateCampaign(o: CampaignSimOptions): CampaignSimResult {
  const map = getMap(CONFIG.maps[0]!);
  const routes = allRoutes(map);
  const maxAttempts = o.maxAttempts ?? 10;
  const res: CampaignSimResult = { difficulty: o.difficulty, player: o.player, runs: 0, completed: 0, defeats: 0, nodes: {}, routes: {}, classes: {} };
  const nodeAgg = (id: string) => (res.nodes[id] ??= emptyNode());
  const classAgg = (id: string) => (res.classes[id] ??= emptyClass());

  for (let i = 0; i < o.runs; i++) {
    const seed = (o.firstSeed ?? 1) + i;
    const route = routes[(i + (o.routeOffset ?? 0)) % routes.length]!;
    const label = routeLabel(map, route);
    const ra = (res.routes[label] ??= { runs: 0, completed: 0, defeats: 0 });
    const rng = rngFor(seed, 'campaign-sim');
    let s: CampaignState = newCampaign({ mode: 'normal', seed, difficulty: o.difficulty });
    let defeats = 0;
    let stuck = false;
    let hero = '';
    const company: string[] = [];
    let mill: boolean | undefined;
    while (true) {
      if (stuck && !(o.continueOnStuck ?? true)) break;
      const step = nextStep(s);
      if (step.kind === 'complete') break;
      switch (step.kind) {
        case 'hero':
          hero = CONFIG.starterPool[rng.int(0, CONFIG.starterPool.length - 1)]!;
          s = pickHero(s, hero);
          break;
        case 'recruit':
        case 'volunteer': {
          const pick = step.offer[rng.int(0, step.offer.length - 1)]!;
          s = recruit(s, pick);
          if (step.kind === 'volunteer') company.push(pick);
          break;
        }
        case 'farewell':
          s = farewell(s);
          break;
        case 'company': {
          const picks = shuffle(CONFIG.companyPool, rng).slice(0, step.size);
          company.push(...picks);
          s = formCompany(s, picks);
          break;
        }
        case 'battle': {
          const agg = nodeAgg(step.node);
          agg.reached++;
          if ((o.gear ?? 'best') === 'best') s = equipBest(s);
          const party = activeHeroes(s);
          o.onBattle?.(step.node, s);
          agg.hpStartSum += party.reduce((a, h) => a + h.hpRatio, 0) / Math.max(1, party.length);
          let won = false;
          for (let attempt = 0; attempt < maxAttempts && !won; attempt++) {
            const plan = battlePlan(s, attempt);
            const battle = fightPlan(plan, o.player);
            const victory = battle.winner === 'party';
            agg.battles++;
            agg.turnsSum += battle.turnsTaken;
            if (attempt === 0 && step.node === map.start) mill = victory;
            if (victory) {
              won = true;
              agg.wins++;
              if (attempt === 0) agg.firstWins++;
              agg.cleared++;
              agg.attemptsToClear += attempt + 1;
              const out = outcomeFrom(plan, true, battleSummary(battle).units);
              agg.hpEndSum += out.units.reduce((a, u) => a + (u.alive ? u.hpRatio : 0), 0) / Math.max(1, out.units.length);
              agg.deathsOnWin += out.units.filter((u) => !u.alive).length;
              s = applyBattle(s, out);
            } else {
              defeats++;
            }
          }
          if (!won) {
            agg.stuck++;
            stuck = true;
            if (o.continueOnStuck ?? true) s = applyBattle(s, { victory: true, units: party.map((h) => ({ heroId: h.id, hpRatio: h.hpRatio, alive: true })) });
          }
          break;
        }
        case 'treasure':
        case 'event':
        case 'town':
          s = completeSimple(s, step.kind);
          break;
        case 'move': {
          const next = route[s.path.length];
          s = moveTo(s, next && step.options.includes(next) ? next : step.options[0]!);
          break;
        }
      }
    }
    res.runs++;
    ra.runs++;
    ra.defeats += defeats;
    res.defeats += defeats;
    if (!stuck) {
      res.completed++;
      ra.completed++;
    }
    for (const c of new Set(company)) {
      const ca = classAgg(c);
      ca.runs++;
      ca.defeats += defeats;
      if (!stuck) ca.completed++;
    }
    if (hero) {
      const ca = classAgg(hero);
      ca.heroRuns++;
      if (mill) ca.heroFirstWins++;
    }
  }
  return res;
}

/** Paralel parçaların sonuçlarını toplar (aynı zorluk ve oyuncu vekili). */
export function mergeCampaignResults(parts: CampaignSimResult[]): CampaignSimResult {
  const out: CampaignSimResult = { difficulty: parts[0]!.difficulty, player: parts[0]!.player, runs: 0, completed: 0, defeats: 0, nodes: {}, routes: {}, classes: {} };
  const add = <T extends object>(into: Record<string, T>, from: Record<string, T>, empty: () => T) => {
    for (const [k, v] of Object.entries(from)) {
      const t = (into[k] ??= empty()) as Record<string, number>;
      for (const [f, n] of Object.entries(v as Record<string, number>)) t[f] = (t[f] ?? 0) + n;
    }
  };
  for (const p of parts) {
    out.runs += p.runs;
    out.completed += p.completed;
    out.defeats += p.defeats;
    add(out.nodes, p.nodes, emptyNode);
    add(out.routes, p.routes, () => ({ runs: 0, completed: 0, defeats: 0 }));
    add(out.classes, p.classes, emptyClass);
  }
  return out;
}

/** Kategori bazında ilk deneme kazanma oranı (%; düğümlerin ilk denemeleri toplanarak). */
export function categoryFirstWin(r: CampaignSimResult, map: CampaignMap = getMap(CONFIG.maps[0]!)): Record<NodeCategory, number> {
  const sum: Record<NodeCategory, { n: number; w: number }> = { tutorial: { n: 0, w: 0 }, normal: { n: 0, w: 0 }, elite: { n: 0, w: 0 }, boss: { n: 0, w: 0 } };
  for (const [id, a] of Object.entries(r.nodes)) {
    const c = nodeCategory(map, id);
    sum[c].n += a.reached;
    sum[c].w += a.firstWins;
  }
  const pct = (x: { n: number; w: number }) => (x.n ? (x.w / x.n) * 100 : 0);
  return { tutorial: pct(sum.tutorial), normal: pct(sum.normal), elite: pct(sum.elite), boss: pct(sum.boss) };
}
