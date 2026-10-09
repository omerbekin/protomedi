import { describe, expect, it } from 'vitest';
import { chooseAction, content, type Battle } from '../src/engine';
import {
  ENDLESS,
  abandonRun,
  applyOutcome,
  attachRecorder,
  battleFor,
  battleHash,
  chooseReward,
  heroOf,
  loadRun,
  newRun,
  parseRun,
  replayActions,
  restoreBattle,
  rewardOffer,
  saveRun,
  suspendedOf,
  waveSeed,
  wavePlan,
  withSuspended,
  type EndlessRun,
  type KV,
  type ReplayAction,
  type SuspendedBattle,
} from '../src/endless';
import { RARITY_IDS, type ItemDef } from '../src/progression';

// Yarım kalan savaş (Ömer 2026-10-09, madde 281 cevabı 3): seed + eylem günlüğü saklanır, devam ederken savaş yeniden kurulup günlük oynatılır.
// Ödüller (cevap 4): elit / boss sonrası daha değerli kartlar.

const fresh = (seed = 21): EndlessRun => newRun(seed, ['warrior', 'archer', 'mage', 'druid'], '2026-10-09T00:00:00.000Z');
const rngState = (b: Battle): number => (b as unknown as { rng: { getState(): number } }).rng.getState();

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

/** Bir hamleyi BattleScene'in yaptığı gibi uygular: YZ seçimi applyChoice ile, ara sıra oyuncu yolu (useSkill / useGlobal / skipTurn). */
function step(b: Battle, i: number): void {
  const actor = b.currentActor!;
  const choice = chooseAction(b, actor.uid, content.aiConfig, undefined, { difficulty: 'medium' });
  if (i % 7 === 3 && actor.side === 'party' && !actor.summoned && b.canUseGlobal(actor.uid, 'rest').ok) {
    b.useGlobal(actor.uid, 'rest');
    return;
  }
  if (i % 5 === 1 && choice) {
    const r = b.useSkill(actor.uid, choice.skillId, choice.targetUid, choice.slot, choice.board, choice.corpseUid);
    if (!r.ok) b.skipTurn();
    return;
  }
  if (!b.applyChoice(actor.uid, choice).ok) b.skipTurn();
}

/** Savaşı `turns` hamle oynar, günlüğü döner. */
function playRecorded(b: Battle, turns: number): ReplayAction[] {
  const log: ReplayAction[] = [];
  const off = attachRecorder(b, (a) => log.push(a));
  for (let i = 0; i < turns && !b.winner; i++) step(b, i);
  off();
  return log;
}

describe('endless: yarım savaş günlüğü ve devam', () => {
  it('günlüğü oynatmak birebir aynı durumu verir (can, MP, durumlar, sıra, RNG)', () => {
    const plan = wavePlan({ ...fresh(), wave: 4 });
    const a = battleFor(plan);
    const log = playRecorded(a, 14);
    expect(log.length).toBeGreaterThan(5);
    const b = battleFor(plan);
    expect(replayActions(b, log)).toEqual({ ok: true });
    expect(battleHash(b)).toBe(battleHash(a));
    expect(b.turnsTaken).toBe(a.turnsTaken);
    expect(b.currentUid).toBe(a.currentUid);
    expect(rngState(b)).toBe(rngState(a));
    expect(JSON.stringify(b.combatants)).toBe(JSON.stringify(a.combatants));
  });

  it('devam edilen savaş, hiç durmamış savaşla aynı şekilde biter', () => {
    const plan = wavePlan(fresh(5));
    const whole = battleFor(plan);
    for (let i = 0; i < 400 && !whole.winner; i++) step(whole, i);
    const first = battleFor(plan);
    const log = playRecorded(first, 9);
    const resumed = battleFor(plan);
    replayActions(resumed, log);
    for (let i = log.length; i < 400 && !resumed.winner; i++) step(resumed, i);
    expect(resumed.winner).toBe(whole.winner);
    expect(battleHash(resumed)).toBe(battleHash(whole));
  });

  it('iç içe çağrı tek eylem sayılır; başarısız eylem kayda girmez; sarma kaldırılınca kayıt durur', () => {
    const b = battleFor(wavePlan(fresh()));
    const log: ReplayAction[] = [];
    const off = attachRecorder(b, (x) => log.push(x));
    const actor = b.currentActor!;
    b.applyChoice(actor.uid, chooseAction(b, actor.uid, content.aiConfig, undefined, { difficulty: 'medium' })); // -> useSkill -> (useGlobal)
    expect(log).toHaveLength(1);
    expect(b.useSkill('no-such-unit', 'x').ok).toBe(false);
    expect(log).toHaveLength(1);
    off();
    b.skipTurn();
    expect(log).toHaveLength(1);
  });

  it('kayıt gidip gelir ve yüklenen günlük aynı tura döner', () => {
    const run = fresh();
    const plan = wavePlan(run);
    const a = battleFor(plan);
    const actions = playRecorded(a, 8);
    const susp: SuspendedBattle = { wave: plan.wave, seed: plan.seed, actions, turn: a.turnsTaken, hash: battleHash(a) };
    const kv = new MemKV();
    saveRun(kv, withSuspended(run, susp));
    const loaded = loadRun(kv)!;
    expect(loaded.suspended).toEqual(susp);
    expect(suspendedOf(loaded)).toEqual(susp);
    const b = battleFor(wavePlan(loaded));
    expect(restoreBattle(b, suspendedOf(loaded)!)).toBe(true);
    expect(battleHash(b)).toBe(battleHash(a));
  });

  it('tutmayan kayıt reddedilir; bozuk yarım savaş kaydı koşuyu bozmaz', () => {
    const run = fresh();
    const plan = wavePlan(run);
    const a = battleFor(plan);
    const actions = playRecorded(a, 6);
    expect(restoreBattle(battleFor(plan), { wave: 1, seed: plan.seed, actions, turn: a.turnsTaken, hash: 'deadbeef' })).toBe(false);
    expect(restoreBattle(battleFor(plan), { wave: 1, seed: plan.seed, actions: [{ k: 'use', a: 'party-0', s: 'no_such_skill' }], turn: 1, hash: battleHash(a) })).toBe(false);
    const raw = JSON.stringify({ version: 1, run: { ...run, suspended: { wave: 1, actions: 'nope' } } });
    const parsed = parseRun(raw)!;
    expect(parsed).not.toBeNull();
    expect(parsed.suspended).toBeUndefined();
  });

  it('yarım savaş yalnızca aynı dalga ve seed için geçerli; savaş bitince / vazgeçince silinir', () => {
    const run = fresh();
    const susp: SuspendedBattle = { wave: 1, seed: waveSeed(run.seed, 1), actions: [], turn: 0, hash: 'x' };
    const r = withSuspended(run, susp);
    expect(suspendedOf(r)).toEqual(susp);
    expect(suspendedOf({ ...r, wave: 2 })).toBeNull();
    expect(suspendedOf({ ...r, suspended: { ...susp, seed: 1 } })).toBeNull();
    const won = applyOutcome(r, { wave: 1 }, { victory: true, units: [], kills: 0, turns: 1 });
    expect(won.suspended).toBeUndefined();
    expect(abandonRun(r).suspended).toBeUndefined();
    expect(withSuspended(r, undefined).suspended).toBeUndefined();
  });
});

describe('endless: elit ve boss sonrası daha değerli ödüller', () => {
  const CAT: ItemDef[] = [
    { id: 'c_boots', name: 'C Boots', slot: 'boots', rarity: 'common', ilvl: 3, stats: { armor: 1 } },
    { id: 'u_helm', name: 'U Helm', slot: 'helm', rarity: 'uncommon', ilvl: 5, stats: { armor: 2 } },
    { id: 'r_helm', name: 'R Helm', slot: 'helm', rarity: 'rare', ilvl: 10, stats: { armor: 4 } },
    { id: 'r_armor', name: 'R Armor', slot: 'armor', rarity: 'rare', ilvl: 11, stats: { armor: 5 } },
    { id: 'e_armor', name: 'E Armor', slot: 'armor', rarity: 'epic', ilvl: 18, stats: { armor: 9 } },
    { id: 'e_trinket', name: 'E Trinket', slot: 'trinket', rarity: 'epic', ilvl: 19, stats: { magicArmor: 9 } },
  ];
  const after = (cleared: number): EndlessRun => ({ ...fresh(), wave: cleared + 1, phase: 'reward', stats: { cleared, turns: 0, kills: 0 } });
  const rank = (id: string) => RARITY_IDS.indexOf(CAT.find((d) => d.id === id)!.rarity);
  const items = (cards: ReturnType<typeof rewardOffer>) => cards.filter((c): c is Extract<typeof c, { kind: 'item' }> => c.kind === 'item');

  it('normal dalga: 1 item + altın + %40 iyileştirme', () => {
    const offer = rewardOffer(after(4), ENDLESS, CAT);
    expect(offer.map((c) => c.kind)).toEqual(['item', 'gold', 'heal']);
  });

  it('elit (5. dalga): 2 farklı item, en az Rare; x2 altın; %60 iyileştirme', () => {
    const offer = rewardOffer(after(5), ENDLESS, CAT);
    const its = items(offer);
    expect(its).toHaveLength(ENDLESS.special.elite.itemCards);
    expect(new Set(its.map((c) => c.itemId)).size).toBe(its.length);
    for (const c of its) expect(rank(c.itemId)).toBeGreaterThanOrEqual(RARITY_IDS.indexOf('rare'));
    const gold = offer.find((c) => c.kind === 'gold');
    const normalGold = rewardOffer(after(4), ENDLESS, CAT).find((c) => c.kind === 'gold');
    expect(gold && gold.kind === 'gold' && gold.amount).toBe(Math.round((ENDLESS.rewards.goldBase + ENDLESS.rewards.goldPerWave * 5) * ENDLESS.special.elite.goldMult));
    expect(gold!.kind === 'gold' && normalGold!.kind === 'gold' && gold!.amount > normalGold!.amount).toBe(true);
    expect(offer.find((c) => c.kind === 'heal')).toEqual({ kind: 'heal', ratio: ENDLESS.special.elite.healRatio });
  });

  it("boss (10. dalga): en az Epic item'ler, x3 altın, Hero's Feast", () => {
    const offer = rewardOffer(after(10), ENDLESS, CAT);
    for (const c of items(offer)) expect(rank(c.itemId)).toBeGreaterThanOrEqual(RARITY_IDS.indexOf('epic'));
    expect(offer.some((c) => c.kind === 'heal')).toBe(false);
    expect(offer.find((c) => c.kind === 'feast')).toEqual({ kind: 'feast', hpMult: ENDLESS.special.boss.feastHpMult, waves: ENDLESS.special.boss.feastWaves });
  });

  it('istenen nadirlikte item yoksa mevcut en yüksek nadirlik gelir (kart boş kalmaz)', () => {
    const offer = rewardOffer(after(10), ENDLESS, CAT.filter((d) => d.rarity !== 'epic'));
    for (const c of items(offer)) expect(rank(c.itemId)).toBe(RARITY_IDS.indexOf('rare'));
  });

  it("Hero's Feast: tam can, sonraki dalgalarda maks can çarpanı, her zaferde bir hak düşer", () => {
    const base = after(10);
    base.heroes[0]!.hpRatio = 0.3;
    const run = { ...base, offer: [{ kind: 'feast' as const, hpMult: 1.15, waves: 2 }] };
    const fed = chooseReward(run, 0, ENDLESS, CAT);
    expect(fed.heroes.every((h) => h.hpRatio === 1)).toBe(true);
    expect(fed.blessing).toEqual({ hpMult: 1.15, waves: 2 });
    const ready = { ...fed, phase: 'ready' as const, shop: undefined };
    const plan = wavePlan(ready);
    for (const h of ready.heroes) expect(plan.units.party[plan.party.indexOf(h.class)]!.modifiers!.hpMult).toBe(1.15);
    const unbuffed = battleFor(wavePlan({ ...ready, blessing: undefined })).combatants.find((c) => c.uid === 'party-0')!;
    const buffed = battleFor(plan).combatants.find((c) => c.uid === 'party-0')!;
    expect(buffed.maxHp).toBeGreaterThan(unbuffed.maxHp);
    const w1 = applyOutcome(ready, plan, { victory: true, units: [], kills: 0, turns: 1 });
    expect(w1.blessing).toEqual({ hpMult: 1.15, waves: 1 });
    const w2 = applyOutcome({ ...w1, phase: 'ready', offer: undefined }, { wave: w1.wave }, { victory: true, units: [], kills: 0, turns: 1 });
    expect(w2.blessing).toBeUndefined();
    expect(heroOf(w2, 'h1')).toBeTruthy();
  });
});

describe('endless: devam düğmesi yazısı', () => {
  it('"Resume Battle · Wave N, Turn T" (T = oynanan hamle + 1)', async () => {
    const { resumeLabel } = await import('../src/endless');
    expect(resumeLabel(3, 11)).toBe('Resume Battle · Wave 3, Turn 12');
  });
});
