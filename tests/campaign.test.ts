import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  activeHeroes,
  allRoutes,
  applyBattle,
  autoResolve,
  choicePoints,
  closedNodes,
  completeSimple,
  debugTeleport,
  farewell,
  formCompany,
  getMap,
  isAreaClass,
  isBattleNode,
  k1Violations,
  leaderOf,
  longestPeacefulRun,
  mergePoints,
  moveHero,
  moveTo,
  newCampaign,
  nextStep,
  node,
  nodeVisibility,
  partyCap,
  pickHero,
  recruit,
  recruitOffer,
  stopNumber,
  validateMap,
  edgeVisibility,
  pendingTip,
  markTipSeen,
  isComplete,
  type CampaignState,
} from '../src/campaign';
import { randomPool } from '../src/engine/content';

const map = getMap('valdoria');
const fresh = (seed = 1234) => newCampaign({ mode: 'normal', seed });

/** Adımları otomatik çözerek verilen düğüme kadar ilerler (yol seçimlerinde `choose` ilk uygun seçeneği verir). */
function playTo(s: CampaignState, target: string, choose: (opts: string[]) => string = (o) => o[0]!): CampaignState {
  let t = s;
  for (let guard = 0; guard < 200; guard++) {
    const step = nextStep(t);
    if (t.at === target && step.kind !== 'hero') return t;
    if (step.kind === 'complete') return t;
    if (step.kind === 'move') t = moveTo(t, step.options.length === 1 ? step.options[0]! : choose(step.options));
    else t = autoResolve(t, step);
  }
  throw new Error('guard');
}

describe('sefer haritası: graf', () => {
  it('17 düğüm, geçerli bağlantılar, bölgeler, 1 başlangıç ve 1 final', () => {
    expect(map.nodes).toHaveLength(17);
    expect(validateMap(map)).toEqual([]);
    expect(map.regions.map((r) => r.id)).toEqual(['I', 'II', 'III']);
    expect(map.start).toBe('1');
    expect(map.nodes.filter((n) => n.final).map((n) => n.id)).toEqual(['12']);
    for (const n of map.nodes) {
      expect(n.pos[0], n.id).toBeGreaterThan(0);
      expect(n.pos[0], n.id).toBeLessThan(1);
      expect(n.pos[1], n.id).toBeGreaterThan(0);
      expect(n.pos[1], n.id).toBeLessThan(1);
      expect(n.name).toMatch(/^[A-Za-z' .]+$/); // oyun içi metin İngilizce
    }
  });

  it('seçim noktaları 4, 7, 10; birleşme noktaları 7, 9, 12; kenar stilleri (tek yol düz, seçimli kesik)', () => {
    expect(choicePoints(map).sort()).toEqual(['10', '4', '7']);
    expect(mergePoints(map).sort()).toEqual(['12', '7', '9']);
    for (const e of map.edges) {
      const single = map.edges.filter((x) => x.from === e.from).length === 1 && map.edges.filter((x) => x.to === e.to).length === 1;
      if (['1', '2', '3', '9'].includes(e.from)) expect(e.style, `${e.from}->${e.to}`).toBe('solid');
      if (!single) expect(e.style, `${e.from}->${e.to}`).toBe('dashed');
    }
  });

  it('12 rota, hepsi 12 durak ve finale ulaşır; alt yol 9, üst yol 10 savaş', () => {
    const routes = allRoutes(map);
    expect(routes).toHaveLength(12);
    for (const r of routes) {
      expect(r).toHaveLength(map.stopsPerRun);
      expect(r[0]).toBe('1');
      expect(r[r.length - 1]).toBe('12');
      const battles = r.filter((id) => isBattleNode(node(map, id))).length;
      expect(battles, r.join('-')).toBe(r.includes('5A') ? 9 : 10);
    }
  });

  it('K1: her dalda en az bir savaş; K2: hiçbir rotada 2den fazla savaşsız durak art arda yok', () => {
    expect(k1Violations(map)).toEqual([]);
    for (const r of allRoutes(map)) expect(longestPeacefulRun(map, r), r.join('-')).toBeLessThanOrEqual(2);
  });
});

describe('ilerleme: seçim noktası, kilitlenen yollar, birleşme', () => {
  it('başlangıç: kahraman seçimi, sonra Mill Road savaşı; tek yol ilerler', () => {
    let s = fresh();
    expect(nextStep(s)).toEqual({ kind: 'hero' });
    expect(() => moveTo(s, '2')).toThrow();
    s = pickHero(s, 'mage');
    expect(nextStep(s)).toEqual({ kind: 'battle', node: '1', encounter: 'mill_road_thugs' });
    expect(() => moveTo(s, '2')).toThrow(); // savaş bitmeden yola çıkılmaz
    s = autoResolve(s);
    expect(nextStep(s)).toEqual({ kind: 'move', options: ['2'] });
    s = moveTo(s, '2');
    expect(s.at).toBe('2');
    expect(stopNumber(s)).toBe(2);
  });

  it('seçim noktasında seçilen yol kilitlenir, diğerleri kapanır; birleşmede tek yola döner', () => {
    let s = playTo(fresh(), '4');
    s = playTo(s, '4');
    // Ashford'u bitir
    while (nextStep(s).kind !== 'move') s = autoResolve(s);
    expect(nextStep(s)).toEqual({ kind: 'move', options: ['5A', '5B'] });
    s = moveTo(s, '5B');
    expect(closedNodes(s).sort()).toEqual(['5A', '6A']);
    expect(() => moveTo(s, '5A')).toThrow();
    s = playTo(s, '7');
    expect(s.path).toEqual(['1', '2', '3', '4', '5B', '6B', '7']);
    s = playTo(s, '9', (o) => o[2]!);
    expect(s.path.slice(-2)).toEqual(['8C', '9']);
    expect(closedNodes(s)).toEqual(expect.arrayContaining(['8A', '8B', '5A', '6A']));
  });

  it('tam sefer 12 durakta biter (Valdoria Conquered)', () => {
    const s = playTo(fresh(), '12');
    const done = (() => {
      let t = s;
      while (!isComplete(t)) t = autoResolve(t);
      return t;
    })();
    expect(done.path).toHaveLength(12);
    expect(isComplete(done)).toBe(true);
    expect(done.stats.victories).toBe(9); // varsayılan seçimler alt yolu izler (5A: 9 savaş)
  });

  it('olay ve korunan hazine: hazine önce savaş, sonra sandık; olay savaşsız', () => {
    let s = playTo(fresh(), '6B', (o) => (o.includes('5B') ? '5B' : o[0]!));
    expect(nextStep(s).kind).toBe('battle');
    s = autoResolve(s);
    expect(nextStep(s)).toEqual({ kind: 'treasure', node: '6B', treasure: 'dwarven_mine' });
    s = completeSimple(s, 'treasure');
    expect(nextStep(s)).toEqual({ kind: 'move', options: ['7'] });
    let a = playTo(fresh(), '6A', (o) => o[0]!);
    expect(nextStep(a)).toEqual({ kind: 'event', node: '6A', event: 'witchs_hut' });
    a = completeSimple(a, 'event');
    expect(nextStep(a).kind).toBe('move');
  });
});

describe('sis ve görünürlük', () => {
  it('bir sonraki durak tam (near), ikinci durak tür+ad (far), ötesi sis; Castle Morvane baştan hedef olarak görünür', () => {
    const s = fresh();
    const v = nodeVisibility(map, s);
    expect(v['1']).toBe('current');
    expect(v['2']).toBe('near');
    expect(v['3']).toBe('far');
    expect(v['4']).toBe('fog');
    expect(v['9']).toBe('fog');
    expect(v['12']).toBe('goal');
    expect(map.visibility).toBe(2);
  });

  it('seçim noktasında iki dal da görünür; seçilmeyen dal kapanır, geçilenler cleared', () => {
    let s = playTo(fresh(), '4');
    let v = nodeVisibility(map, s);
    expect([v['5A'], v['5B']]).toEqual(['near', 'near']);
    expect([v['6A'], v['6B']]).toEqual(['far', 'far']);
    expect(v['7']).toBe('fog');
    while (nextStep(s).kind !== 'move') s = autoResolve(s);
    s = moveTo(s, '5A');
    v = nodeVisibility(map, s);
    expect(v['5B']).toBe('closed');
    expect(v['6B']).toBe('closed');
    expect(v['4']).toBe('cleared');
    expect(v['6A']).toBe('near');
    expect(v['7']).toBe('far');
    const e = map.edges.find((x) => x.from === '4' && x.to === '5B')!;
    expect(edgeVisibility(map, s, v, e)).toBe('closed');
    expect(edgeVisibility(map, s, v, map.edges.find((x) => x.from === '4' && x.to === '5A')!)).toBe('walked');
    expect(edgeVisibility(map, s, v, map.edges.find((x) => x.from === '5A' && x.to === '6A')!)).toBe('open');
  });

  it('sis kapatılınca (debug) ulaşılabilir her şey görünür, kapanan dallar yine kapalı', () => {
    const v = nodeVisibility(map, fresh(), true);
    expect(Object.values(v).filter((x) => x === 'fog' || x === 'goal')).toEqual([]);
  });
});

describe('tutorial takım akışı', () => {
  it('1 karakter -> Ravenwood: 3 adaydan 1 (en az biri alan saldırılı) -> Ashford: veda + serbest 3 kişilik takım (ilk seçilen lider) -> Valdren Keep çıkışı: 3 adaydan 1', () => {
    let s = pickHero(fresh(77), 'warrior');
    expect(s.roster).toHaveLength(1);
    expect(leaderOf(s)!.class).toBe('warrior');
    expect(partyCap(s)).toBe(1);
    s = autoResolve(s);
    s = moveTo(s, '2');
    const step = nextStep(s);
    expect(step.kind).toBe('recruit');
    const offer = (step as { offer: string[] }).offer;
    expect(offer).toHaveLength(3);
    expect(offer).not.toContain('warrior');
    expect(offer.some(isAreaClass)).toBe(true);
    s = recruit(s, offer[1]!);
    expect(s.roster).toHaveLength(2);
    expect(s.roster.every((h) => h.tutorial)).toBe(true);
    expect(partyCap(s)).toBe(2);
    expect(nextStep(s).kind).toBe('battle');
    s = playTo(s, '4');
    expect(nextStep(s)).toEqual({ kind: 'farewell', node: '4' });
    s = farewell(s);
    expect(s.roster).toHaveLength(0);
    expect(s.active.filter(Boolean)).toHaveLength(0);
    expect(nextStep(s)).toEqual({ kind: 'company', node: '4', size: 3 });
    expect(() => formCompany(s, ['mage', 'mage', 'archer'])).toThrow();
    expect(() => formCompany(s, ['mage', 'archer'])).toThrow();
    expect(() => formCompany(s, ['mage', 'archer', 'aoe_tester'])).toThrow();
    s = formCompany(s, ['druid', 'warrior', 'archer']); // tutorial sınıfı (warrior) yeniden seçilebilir
    expect(s.roster.map((h) => h.class)).toEqual(['druid', 'warrior', 'archer']);
    expect(leaderOf(s)!.class).toBe('druid');
    expect(s.roster.some((h) => h.tutorial)).toBe(false);
    expect(activeHeroes(s)).toHaveLength(3);
    expect(nextStep(s)).toEqual({ kind: 'town', node: '4' });
    s = completeSimple(s, 'town');
    expect(partyCap(s)).toBe(3);
    s = playTo(s, '7');
    expect(nextStep(s).kind).toBe('town');
    s = completeSimple(s, 'town');
    const vol = nextStep(s);
    expect(vol.kind).toBe('volunteer');
    const vOffer = (vol as { offer: string[] }).offer;
    expect(vOffer).toHaveLength(3);
    for (const c of ['druid', 'warrior', 'archer']) expect(vOffer).not.toContain(c);
    expect(partyCap(s)).toBe(3);
    s = recruit(s, vOffer[0]!);
    expect(s.roster).toHaveLength(4);
    expect(s.roster[3]!.tutorial).toBeUndefined();
    expect(partyCap(s)).toBe(4);
    expect(nextStep(s).kind).toBe('move');
  });

  it('lider Ashford ekranında seçilebilir; dizilim değiştirilebilir', () => {
    let s = playTo(fresh(5), '4');
    s = farewell(s);
    s = formCompany(s, ['mage', 'defender', 'gambler'], 2);
    expect(leaderOf(s)!.class).toBe('gambler');
    const mage = s.roster[0]!.id;
    const before = s.active.indexOf(mage);
    const target = s.active.findIndex((c, i) => !c && i !== before);
    s = moveHero(s, mage, target);
    expect(s.active.indexOf(mage)).toBe(target);
    expect(s.active[before]).toBe('');
  });

  it('başlangıç havuzu ve takım havuzu 11 oynanabilir sınıf (Geometer yok)', () => {
    for (const pool of [CONFIG.starterPool, CONFIG.companyPool, CONFIG.recruitPool]) {
      expect(pool).toHaveLength(11);
      expect(pool).not.toContain('aoe_tester');
      for (const c of pool) expect(randomPool).toContain(c);
    }
  });
});

describe('can taşıma', () => {
  it('zaferde hayatta kalanlar +%20, düşenler %20 ile kalkar, savaşa girmeyen değişmez', () => {
    let s = playTo(fresh(9), '3');
    const [a, b] = s.roster;
    s = applyBattle(s, { victory: true, units: [{ heroId: a!.id, hpRatio: 0.5, alive: true }, { heroId: b!.id, hpRatio: 0, alive: false }] });
    expect(s.roster[0]!.hpRatio).toBeCloseTo(0.7);
    expect(s.roster[1]!.hpRatio).toBeCloseTo(CONFIG.rules.reviveRatio);
    expect(s.roster[1]!.alive).toBe(true);
    let t = playTo(fresh(9), '3');
    t = applyBattle(t, { victory: true, units: [{ heroId: t.roster[0]!.id, hpRatio: 0.95, alive: true }] });
    expect(t.roster[0]!.hpRatio).toBe(1); // tavan 1
  });

  it('boss zaferi tam iyileştirir; kasaba varışta tam iyileştirir; yenilgi yalnızca sayaç', () => {
    let s = playTo(fresh(11), '9');
    s = applyBattle(s, { victory: true, units: s.roster.map((h) => ({ heroId: h.id, hpRatio: 0.1, alive: true })) });
    expect(s.roster.every((h) => h.hpRatio === 1)).toBe(true);
    let t = playTo(fresh(11), '3');
    t = applyBattle(t, { victory: true, units: t.roster.map((h) => ({ heroId: h.id, hpRatio: 0.1, alive: true })) });
    expect(t.roster[0]!.hpRatio).toBeCloseTo(0.3);
    const lost = applyBattle(t, { victory: false, units: [] });
    expect(lost.stats.defeats).toBe(1);
    expect(lost.roster).toEqual(t.roster);
    t = moveTo(t, '4');
    expect(t.roster.every((h) => h.hpRatio === 1)).toBe(true);
  });
});

describe('determinizm ve debug', () => {
  it('aynı seed = aynı adaylar; farklı seed çoğunlukla farklı', () => {
    const a = moveTo(autoResolve(pickHero(fresh(42), 'mage')), '2');
    const b = moveTo(autoResolve(pickHero(fresh(42), 'mage')), '2');
    expect(recruitOffer(a, '2')).toEqual(recruitOffer(b, '2'));
    const offers = new Set([1, 2, 3, 4, 5, 6].map((seed) => recruitOffer(moveTo(autoResolve(pickHero(fresh(seed), 'mage')), '2'), '2').join(',')));
    expect(offers.size).toBeGreaterThan(1);
  });

  it('ışınlanma: yol kurulur, önceki adımlar bitmiş, kadro dolu; ipucu tek seferlik', () => {
    const s = debugTeleport(fresh(3), '8B');
    expect(s.at).toBe('8B');
    expect(s.path).toEqual(['1', '2', '3', '4', '5A', '6A', '7', '8B']);
    expect(s.roster).toHaveLength(4);
    expect(nextStep(s).kind).toBe('battle');
    const t = debugTeleport(fresh(3), '1');
    expect(t.roster).toHaveLength(1);
    expect(pendingTip(t)).toMatch(/turn bar/);
    expect(pendingTip(markTipSeen(t))).toBeNull();
  });

  it('durum saf: işlemler girdiyi değiştirmez', () => {
    const s = fresh();
    const copy = JSON.stringify(s);
    pickHero(s, 'mage');
    expect(JSON.stringify(s)).toBe(copy);
  });
});
