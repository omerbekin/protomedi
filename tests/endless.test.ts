import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import {
  ENDLESS,
  rewardBlockedReason,
  RUN_KEY,
  SCORES_KEY,
  abandonRun,
  addScore,
  applyOutcome,
  autoPlayWave,
  battleFor,
  buyItem,
  chooseReward,
  clearRun,
  endlessBack,
  endlessView,
  itemKindLine,
  itemStatLines,
  statLine,
  togglePick,
  combineMods,
  enemyCount,
  encounter,
  heroOf,
  leaveShop,
  loadRun,
  loadScores,
  newRun,
  outcomeFromSummary,
  parseRun,
  rewardOffer,
  saveRun,
  saveScores,
  scoreOf,
  shopStock,
  specialEncounter,
  upgradePairs,
  waveKind,
  waveMods,
  wavePlan,
  type EndlessRun,
  type KV,
  type ScoreEntry,
  type WaveOutcome,
} from '../src/endless';
import { ITEMS, canEquip, itemIP, itemValue, loadoutSetup, type ItemDef } from '../src/progression';

// Endless Lite (roadmap.md bölüm 3, open-questions madde 281): saf mantık testleri. Item kataloğu Item MVP ile değiştiği için testler
// sabit item id'lerine değil, verilen küçük bir test kataloğuna dayanır.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const fresh = (seed = 7): EndlessRun => newRun(seed, PARTY, '2026-10-09T00:00:00.000Z');

/** Test kataloğu: items.json'un şemasında, motorun bugün desteklediği statlarla. */
const CAT: ItemDef[] = [
  { id: 't_axe', name: 'Test Axe', slot: 'weapon', family: 'axes', rarity: 'common', ilvl: 1, stats: { might: 3 } },
  { id: 't_boots', name: 'Test Boots', slot: 'boots', rarity: 'common', ilvl: 2, stats: { armor: 1 } },
  { id: 't_boots2', name: 'Test Boots II', slot: 'boots', rarity: 'uncommon', ilvl: 3, stats: { armor: 3 } },
  { id: 't_far', name: 'Far Helm', slot: 'helm', rarity: 'rare', ilvl: 60, stats: { armor: 9 } },
];

/** Zafer sonucu: herkes hayatta, verilen can oranıyla. */
const win = (run: EndlessRun, hp = 0.5, dead: string[] = []): WaveOutcome => ({
  victory: true,
  units: run.heroes.map((h) => ({ heroId: h.id, hpRatio: dead.includes(h.id) ? 0 : hp, alive: !dead.includes(h.id) })),
  kills: 3,
  turns: 20,
});

class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('endless: dalga kuralları', () => {
  it('her 5. dalga elit, her 10. dalga boss', () => {
    expect([1, 2, 3, 4].map((w) => waveKind(w))).toEqual(['normal', 'normal', 'normal', 'normal']);
    expect(waveKind(5)).toBe('elite');
    expect(waveKind(10)).toBe('boss');
    expect(waveKind(15)).toBe('elite');
    expect(waveKind(20)).toBe('boss');
  });

  it('düşman sayısı: 30. dalgaya kadar 2, sonra 3 (balance-tester 2026-10-09, data/endless.json > enemyCount)', () => {
    expect([1, 2, 3, 4, 9, 30, 31, 40].map((w) => enemyCount(w))).toEqual([2, 2, 2, 2, 2, 2, 3, 3]);
  });

  it('dalga güçlenmesi: 1. dalga yok, sonra dalga başına can/stat +%1,7, güç +%1,6 (balance-tester 2026-10-09)', () => {
    expect(waveMods(1)).toBeUndefined();
    expect(waveMods(2)).toEqual({ hpMult: 1.017, statMult: 1.017, powerMult: 1.016 });
    expect(waveMods(11)).toEqual({ hpMult: 1.17, statMult: 1.17, powerMult: 1.16 });
    expect(combineMods({ hpMult: 2, spriteScale: 1.4 }, { hpMult: 1.5, powerMult: 1.1 })).toEqual({ hpMult: 3, spriteScale: 1.4, powerMult: 1.1 });
  });

  it('veri: özel dalga karşılaşmaları encounters.json içinde var; elit dalgaları elit, boss dalgaları boss rütbeli birim içerir', () => {
    for (const id of [...ENDLESS.elites, ...ENDLESS.bosses]) expect(encounter(id), id).toBeTruthy();
    for (const id of ENDLESS.elites) expect(encounter(id)!.units.some((u) => u.tier === 'elite'), id).toBe(true);
    for (const id of ENDLESS.bosses) expect(encounter(id)!.units.some((u) => u.tier === 'boss'), id).toBe(true);
    expect(specialEncounter(1, 10)).toBe(ENDLESS.bosses[0]);
    expect(specialEncounter(1, 20)).toBe(ENDLESS.bosses[1 % ENDLESS.bosses.length]);
    expect(ENDLESS.elites).toContain(specialEncounter(1, 5));
    expect(specialEncounter(1, 4)).toBeNull();
  });
});

describe('endless: dalga planı -> savaş', () => {
  it('1. dalga: item\'siz takım hiçbir kurulum almaz (bugünkü birimle aynı), enemyCount(1) farklı rastgele havuz düşmanı', () => {
    const plan = wavePlan(fresh());
    expect(plan.kind).toBe('normal');
    expect(plan.units.party).toEqual({});
    expect(plan.units.enemies).toEqual({});
    const foes = plan.enemies.filter(Boolean);
    expect(foes).toHaveLength(enemyCount(1));
    expect(new Set(foes).size).toBe(enemyCount(1));
    for (const c of foes) expect(content.randomPool).toContain(c);
    expect(plan.party.filter(Boolean).sort()).toEqual([...PARTY].sort());
    expect(plan.heroOrder).toHaveLength(4);
    const battle = battleFor(plan);
    expect(battle.combatants.filter((c) => c.side === 'party')).toHaveLength(4);
    expect(battle.combatants.filter((c) => c.side === 'enemy')).toHaveLength(enemyCount(1));
    // motor sırası: party-i = heroOrder[i]
    plan.heroOrder.forEach((id, i) => expect(battle.combatants.find((c) => c.uid === `party-${i}`)!.defId).toBe(heroOf(fresh(), id)!.class));
  });

  it('belirleyici: aynı koşu = aynı plan; farklı koşu seed\'i farklı düşman', () => {
    expect(wavePlan(fresh(7))).toEqual(wavePlan(fresh(7)));
    const plans = [1, 2, 3, 4, 5, 6].map((s) => wavePlan(fresh(s)).enemies.join());
    expect(new Set(plans).size).toBeGreaterThan(1);
  });

  it('sonraki dalgalarda düşmanlar güçlenir; takılı item ve taşınan can kuruluma girer', () => {
    const run = { ...fresh(), wave: 4 };
    run.heroes = run.heroes.map((h, i) => (i === 0 ? { ...h, hpRatio: 0.6, equipment: { weapon: { uid: 'e1', id: ITEMS.items.find((d) => canEquip('warrior', d))?.id ?? 'x' } } } : h));
    const plan = wavePlan(run);
    expect(plan.enemies.filter(Boolean)).toHaveLength(enemyCount(4));
    for (const u of Object.values(plan.units.enemies)) expect(u.modifiers).toEqual(waveMods(4));
    const slot = plan.party.indexOf('warrior');
    const setup = plan.units.party[slot]!;
    expect(setup.startHpRatio).toBe(0.6);
    expect(setup.modifiers).toEqual(loadoutSetup(run.heroes[0]!).modifiers);
    expect(() => battleFor(plan)).not.toThrow();
  });

  it('elit ve boss dalgası karşılaşma birimlerini rütbe/özel adla ve dalga çarpanıyla kurar', () => {
    const elite = wavePlan({ ...fresh(3), wave: 5 });
    expect(elite.kind).toBe('elite');
    const units = Object.values(elite.units.enemies);
    expect(units.some((u) => u.tier === 'elite')).toBe(true);
    expect(() => battleFor(elite)).not.toThrow();
    const boss = wavePlan({ ...fresh(3), wave: 10 });
    expect(boss.kind).toBe('boss');
    expect(Object.values(boss.units.enemies).some((u) => u.tier === 'boss')).toBe(true);
    const b = battleFor(boss);
    expect(b.combatants.some((c) => c.side === 'enemy' && c.tier === 'boss')).toBe(true);
  });
});

describe('endless: savaş sonucu ve can taşıma', () => {
  it('zafer: canlılar +%20, düşen ceset olarak kalır (Revive kartı), dalga +1, ödül kartları açılır', () => {
    const run = fresh();
    const plan = wavePlan(run);
    const next = applyOutcome(run, plan, win(run, 0.5, ['h2']));
    expect(next.wave).toBe(2);
    expect(next.phase).toBe('reward');
    expect(next.stats).toEqual({ cleared: 1, turns: 20, kills: 3 });
    expect(heroOf(next, 'h1')!.hpRatio).toBeCloseTo(0.7);
    expect(heroOf(next, 'h2')!.hpRatio).toBe(0);
    expect(next.offer).toHaveLength(4);
    expect(next.offer![3]).toEqual({ kind: 'revive', heroId: 'h2', ratio: ENDLESS.rewards.reviveRatio });
    // aynı sonuç ikinci kez yazılmaz (sonuç ekranı tekrar kurulsa da)
    expect(applyOutcome(next, plan, win(run))).toBe(next);
    expect(run.wave).toBe(1); // girdi değişmez
  });

  it('boss zaferi yaşayanları tam iyileştirir; ceseti kaldırmaz', () => {
    const run = { ...fresh(), wave: 10 };
    const next = applyOutcome(run, { wave: 10 }, win(run, 0.1, ['h3']));
    for (const h of next.heroes) expect(h.hpRatio).toBe(h.id === 'h3' ? 0 : 1);
  });

  it('yenilgi: koşu biter, skor yazılabilir', () => {
    const run = { ...fresh(), wave: 6, stats: { cleared: 5, turns: 100, kills: 17 } };
    const over = applyOutcome(run, { wave: 6 }, { victory: false, units: [], kills: 1, turns: 9 });
    expect(over.phase).toBe('over');
    expect(over.end).toBe('defeat');
    const score = scoreOf(over, 'd');
    expect(score).toMatchObject({ wave: 6, cleared: 5, turns: 109, kills: 18, classes: PARTY });
  });

  it('motor özetinden sonuç: party-i -> heroOrder[i], çağrılar sayılmaz, öldürülen düşman sayılır', () => {
    const out = outcomeFromSummary({ heroOrder: ['h3', 'h1'] }, true, [
      { uid: 'party-0', side: 'party', summoned: false, hp: 50, maxHp: 100 },
      { uid: 'party-1', side: 'party', summoned: false, hp: 0, maxHp: 80 },
      { uid: 'party-s1', side: 'party', summoned: true, hp: 10, maxHp: 10 },
      { uid: 'enemy-0', side: 'enemy', summoned: false, hp: 0, maxHp: 90 },
      { uid: 'enemy-s0', side: 'enemy', summoned: true, hp: 0, maxHp: 9 },
    ], 33);
    expect(out).toEqual({ victory: true, units: [{ heroId: 'h3', hpRatio: 0.5, alive: true }, { heroId: 'h1', hpRatio: 0, alive: false }], kills: 1, turns: 33 });
  });

  it('vazgeçmek koşuyu bitirir', () => {
    const r = abandonRun(fresh());
    expect(r.phase).toBe('over');
    expect(r.end).toBe('abandoned');
  });
});

describe('endless: ödül kartları ve dükkân', () => {
  const afterWave = (cleared: number, seed = 7): EndlessRun => ({ ...fresh(seed), wave: cleared + 1, phase: 'reward', stats: { cleared, turns: 0, kills: 0 } });

  it('3 kart: item (takımda yükseltme, kahraman takabilir), altın, iyileştirme', () => {
    const run = afterWave(1);
    const offer = rewardOffer(run, ENDLESS, CAT);
    expect(offer.map((c) => c.kind)).toEqual(['item', 'gold', 'heal']);
    const card = offer[0]!;
    if (card.kind !== 'item') throw new Error('item card expected');
    const def = CAT.find((d) => d.id === card.itemId)!;
    expect(canEquip(heroOf(run, card.heroId)!.class, def)).toBe(true);
    // seviye tavanı: 1 dalgadan sonra ilvl 60 düşmez
    expect(card.itemId).not.toBe('t_far');
  });

  it('item yoksa ilk kart daha büyük bir altın kartı', () => {
    const offer = rewardOffer(afterWave(1), ENDLESS, []);
    expect(offer.map((c) => c.kind)).toEqual(['gold', 'gold', 'heal']);
  });

  it('yükseltme kuralı: takılı item\'den zayıf ya da aynı item önerilmez; silah yalnızca ailesine izinli class\'a', () => {
    const run = afterWave(3);
    for (const h of run.heroes) h.equipment = { boots: { uid: `b${h.id}`, id: 't_boots2' } };
    const pairs = upgradePairs(run, 3, [], ENDLESS, CAT);
    expect(pairs.some((p) => p.def.slot === 'boots')).toBe(false);
    for (const p of pairs.filter((x) => x.def.slot === 'weapon')) expect(canEquip(heroOf(run, p.heroId)!.class, p.def)).toBe(true);
    expect(pairs.filter((p) => p.def.id === 't_axe').map((p) => heroOf(run, p.heroId)!.class)).toEqual(['warrior']);
  });

  it('kart seçimi: altın eklenir, iyileştirme +%40 (en çok tam can), sonra kamp', () => {
    const run = { ...afterWave(1), offer: [{ kind: 'gold' as const, amount: 25 }, { kind: 'heal' as const, ratio: 0.4 }] };
    run.heroes[0]!.hpRatio = 0.3;
    run.heroes[1]!.hpRatio = 0.9;
    const g = chooseReward(run, 0);
    expect(g.gold).toBe(25);
    expect(g.phase).toBe('ready');
    expect(g.offer).toBeUndefined();
    const h = chooseReward(run, 1);
    expect(h.heroes[0]!.hpRatio).toBeCloseTo(0.7);
    expect(h.heroes[1]!.hpRatio).toBe(1);
    expect(chooseReward(run, 5)).toBe(run); // geçersiz kart
  });

  it("item kartı item'i TORBAYA koyar (takmaz); torba doluysa item kartı SEÇİLEMEZ (altına çevirme yok, Ömer 2026-10-10)", () => {
    const run = afterWave(1);
    const d = ITEMS.items[0]!;
    run.offer = [{ kind: 'item', itemId: d.id, heroId: run.heroes[0]!.id }];
    const next = chooseReward(run, 0);
    expect(next.bag).toMatchObject([{ uid: `e${run.nextItem}`, id: d.id }]);
    expect(next.bag![0]!.rolls).toBeDefined(); // stat zarları koşu seed'inden (2026-10-10)
    expect(next.heroes).toEqual(run.heroes); // kimseye takılmadı
    expect(next.nextItem).toBe(run.nextItem + 1);
    const full = { ...run, bag: Array.from({ length: ENDLESS.bagSize! }, (_, i) => ({ uid: `x${i}`, id: d.id })) };
    expect(rewardBlockedReason(full, full.offer![0]!)).toBe('Bag full: discard an item first');
    expect(rewardBlockedReason(run, run.offer[0]!)).toBeNull();
    expect(rewardBlockedReason(full, { kind: 'gold', amount: 5 })).toBeNull(); // item olmayan ödül seçilebilir
    expect(chooseReward(full, 0)).toBe(full);
    const freed = { ...full, bag: full.bag.slice(1) }; // Gear'dan bir item atıldı
    expect(chooseReward(freed, 0).bag).toHaveLength(ENDLESS.bagSize!);
  });

  it('her 5 dalgada ödülden sonra dükkân; satın alma altın düşer, yetmezse olmaz', () => {
    const run = { ...afterWave(5), offer: [{ kind: 'gold' as const, amount: 10 }] };
    const stock = shopStock(run, ENDLESS, CAT);
    expect(stock.length).toBeGreaterThan(0);
    expect(new Set(stock.map((e) => e.itemId)).size).toBe(stock.length);
    for (const e of stock) expect(e.price).toBe(itemValue(CAT.find((d) => d.id === e.itemId)!));
    // gerçek katalogla akış: ödül -> dükkân (stok varsa) ya da kamp
    const next = chooseReward(run, 0, ENDLESS, CAT);
    expect(next.phase).toBe('shop');
    const poor = { ...next, gold: 0 };
    expect(buyItem(poor, 0)).toBe(poor);
    const rich = { ...next, gold: 1000 };
    const bought = buyItem(rich, 0, CAT);
    expect(bought.gold).toBe(1000 - rich.shop![0]!.price);
    expect(bought.shop![0]!.sold).toBe(true);
    expect(bought.bag?.map((i) => i.id)).toEqual([rich.shop![0]!.itemId]); // torbaya girdi
    expect(buyItem(bought, 0, CAT)).toBe(bought); // iki kez satılmaz
    expect(leaveShop(next).phase).toBe('ready');
    // dükkân dalgası değilse doğrudan kamp
    expect(chooseReward({ ...afterWave(4), offer: [{ kind: 'gold', amount: 1 }] }, 0, ENDLESS, CAT).phase).toBe('ready');
  });
});

describe('endless: kayıt ve skor listesi', () => {
  it('koşu kaydı gidip gelir; bitmiş koşu yuvayı boşaltır', () => {
    const kv = new MemKV();
    const run = fresh();
    expect(saveRun(kv, run)).toBe(true);
    expect(loadRun(kv)).toEqual(run);
    expect(saveRun(kv, abandonRun(run))).toBe(true);
    expect(kv.getItem(RUN_KEY)).toBeNull();
    saveRun(kv, run);
    clearRun(kv);
    expect(loadRun(kv)).toBeNull();
  });

  it('bozuk / eski kayıt oyunu çökertmez', () => {
    expect(parseRun('{nope')).toBeNull();
    expect(parseRun(JSON.stringify({ version: 99, run: fresh() }))).toBeNull();
    expect(parseRun(JSON.stringify({ version: 1, run: { ...fresh(), heroes: [{ id: 'h1', class: 'no_such_class', hpRatio: 1, equipment: {} }] } }))).toBeNull();
    expect(parseRun(JSON.stringify({ version: 1, run: { ...fresh(), phase: 'reward' } }))).toBeNull(); // kartsız ödül aşaması
    expect(loadRun(null)).toBeNull();
    const kv = new MemKV();
    kv.setItem(SCORES_KEY, 'garbage');
    expect(loadScores(kv)).toEqual([]);
  });

  it('skor listesi: çok dalga önde, eşitse az tur; ilk 10', () => {
    const e = (cleared: number, turns: number, date = 'a'): ScoreEntry => ({ wave: cleared + 1, cleared, turns, kills: 0, classes: [], gearScore: 0, date });
    let list: ScoreEntry[] = [];
    for (let i = 0; i < 12; i++) list = addScore(list, e(i, 10)).list;
    expect(list).toHaveLength(ENDLESS.highScores);
    expect(list[0]!.cleared).toBe(11);
    const r = addScore(list, e(11, 5));
    expect(r.rank).toBe(0);
    expect(addScore(r.list, e(0, 1)).rank).toBe(-1);
    const kv = new MemKV();
    saveScores(kv, r.list);
    expect(loadScores(kv)).toEqual(r.list);
  });
});

describe('endless: başsız dalga (YZ vs YZ)', () => {
  it('ilk dalga baştan sona oynanır ve sonuç koşuya yazılır', () => {
    const run = fresh(11);
    const next = autoPlayWave(run);
    expect(['reward', 'over']).toContain(next.phase);
    expect(next.stats.turns).toBeGreaterThan(0);
    if (next.phase === 'reward') expect(next.wave).toBe(2);
  });

  it("item gücü savaşa girer: item'li takımın birimi item'siz halinden güçlü", () => {
    const weapon = ITEMS.items.find((d) => d.slot === 'weapon' && canEquip('warrior', d) && itemIP(d) > 0);
    if (!weapon) return;
    const base = fresh();
    const geared = { ...fresh(), heroes: fresh().heroes.map((h) => (h.class === 'warrior' ? { ...h, equipment: { weapon: { uid: 'e1', id: weapon.id } } } : h)) };
    const unit = (r: EndlessRun) => battleFor(wavePlan(r)).combatants.find((c) => c.defId === 'warrior' && c.side === 'party')!;
    expect(JSON.stringify(unit(geared).stats)).not.toBe(JSON.stringify(unit(base).stats));
  });
});

describe('endless: ekran akışı ve yazılar', () => {
  it('açılış görünümü: istenen > koşunun aşaması > başlık', () => {
    expect(endlessView(null)).toBe('title');
    expect(endlessView(fresh())).toBe('camp');
    expect(endlessView(fresh(), 'title')).toBe('title');
    expect(endlessView({ ...fresh(), phase: 'reward', offer: [] })).toBe('reward');
    expect(endlessView({ ...fresh(), phase: 'shop', shop: [] })).toBe('shop');
    expect(endlessView(abandonRun(fresh()))).toBe('over');
  });

  it('Back / Esc: ödül ve dükkânda geri yok (seçim zorunlu)', () => {
    expect(endlessBack('title')).toBe('menu');
    expect(endlessBack('camp')).toBe('menu');
    expect(endlessBack('pick')).toBe('title');
    expect(endlessBack('over')).toBe('title');
    expect(endlessBack('reward')).toBeNull();
    expect(endlessBack('shop')).toBeNull();
  });

  it('takım seçimi: dokun ekle / çıkar, en çok 4', () => {
    let p: string[] = [];
    for (const c of ['warrior', 'archer', 'mage', 'druid', 'hexer']) p = togglePick(p, c, 4);
    expect(p).toEqual(['warrior', 'archer', 'mage', 'druid']);
    expect(togglePick(p, 'archer', 4)).toEqual(['warrior', 'mage', 'druid']);
  });

  it('item yazıları: stat satırı yüzde/düz, tür satırı', () => {
    expect(statLine('might', 3)).toBe('+3% Might');
    expect(statLine('armor', 1)).toBe('+1 Armor');
    expect(statLine('dex', 1)).toBe('+1 DEX');
    expect(itemStatLines(CAT[0]!)).toEqual(['+3% Might']);
    expect(itemKindLine(CAT[1]!)).toBe('Boots · Common');
  });
});
