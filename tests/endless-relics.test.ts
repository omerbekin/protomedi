import { describe, expect, it } from 'vitest';
import { Battle, battleSummary, chooseAction, content } from '../src/engine';
import type { BattleEvent, UnitSetup } from '../src/engine/types';
import {
  ENDLESS,
  applyOutcome,
  battleFor,
  battleHash,
  chooseRelic,
  grantRelic,
  loadRun,
  newRun,
  planKey,
  relicEffects,
  relicOffer,
  replayActions,
  attachRecorder,
  restoreBattle,
  saveRun,
  victoryHealOf,
  wavePlan,
  withRelics,
  withSuspended,
  type EndlessRun,
  type KV,
  type ReplayAction,
} from '../src/endless';
import { isIconKind } from '../src/ui/icon-kinds';
import { stateHash } from '../src/net/state-hash';

// Endless kalıntıları (Ömer onayı 2026-10-09, madde 282): boss sonrası 2 teklif, biri seçilir, koşu boyu kalır.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const ALL = ENDLESS.relics.list.map((r) => r.id);
const fresh = (relics: string[] = [], seed = 31): EndlessRun => ({ ...newRun(seed, PARTY, '2026-10-09T00:00:00.000Z'), relics });
const heroes = (b: Battle) => b.combatants.filter((c) => c.side === 'party' && !c.summoned);

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

describe('kalıntı verisi', () => {
  it('6 onaylı kalıntı, tekil id, geçerli ikon, teklif sayısı veriden (2)', () => {
    expect(ALL).toEqual(['ember_of_valdren', 'pilgrims_bell', 'whetstone_of_ashford', 'banner_of_the_bridge', 'last_rites', 'iron_oath']);
    expect(new Set(ALL).size).toBe(ALL.length);
    for (const r of ENDLESS.relics.list) {
      expect(isIconKind(r.icon), r.id).toBe(true);
      expect(r.name && r.text, r.id).toBeTruthy();
      expect(Object.keys(r.effect).length, r.id).toBeGreaterThan(0);
    }
    expect(ENDLESS.relics.offer).toBe(2);
  });
});

describe('kalıntı teklifi', () => {
  it('tekrar yok, sahip olunanlar gelmez, belirleyici', () => {
    const o = relicOffer(5, 10, ['iron_oath']);
    expect(o).toHaveLength(2);
    expect(new Set(o).size).toBe(2);
    expect(o).not.toContain('iron_oath');
    expect(relicOffer(5, 10, ['iron_oath'])).toEqual(o);
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => relicOffer(s, 10, [])));
    expect(seen.size).toBeGreaterThan(2);
  });

  it('havuz biterken: 1 kalınca 1 teklif, hiç kalmayınca teklif yok', () => {
    expect(relicOffer(1, 10, ALL.slice(0, 5))).toEqual([ALL[5]]);
    expect(relicOffer(1, 10, ALL)).toEqual([]);
    expect(relicOffer(1, 10, [], { ...ENDLESS, relics: { ...ENDLESS.relics, offer: 3 } })).toHaveLength(3);
  });

  it('boss zaferi: önce kalıntı seçimi, sonra ödül kartları; normal dalgada yok; hepsi varken atlanır', () => {
    const win = { victory: true, units: [], kills: 0, turns: 1 };
    const atBoss = { ...fresh(), wave: 10 };
    const r = applyOutcome(atBoss, { wave: 10 }, win);
    expect(r.phase).toBe('relic');
    expect(r.relicOffer).toHaveLength(2);
    expect(r.offer?.length).toBeGreaterThan(0);
    expect(chooseRelic(r, 'no_such')).toBe(r);
    const picked = chooseRelic(r, r.relicOffer![0]!);
    expect(picked.relics).toEqual([r.relicOffer![0]]);
    expect(picked.phase).toBe('reward');
    expect(picked.relicOffer).toBeUndefined();
    expect(chooseRelic(picked, r.relicOffer![1]!)).toBe(picked); // aşama geçti
    expect(applyOutcome({ ...fresh(), wave: 9 }, { wave: 9 }, win).phase).toBe('reward');
    expect(applyOutcome({ ...fresh(ALL), wave: 10 }, { wave: 10 }, win).phase).toBe('reward');
  });

  it('kayıt: kalıntılar ve bekleyen teklif gidip gelir', () => {
    const kv = new MemKV();
    const r = applyOutcome({ ...fresh(['iron_oath']), wave: 10 }, { wave: 10 }, { victory: true, units: [], kills: 0, turns: 1 });
    saveRun(kv, r);
    const back = loadRun(kv)!;
    expect(back.relics).toEqual(['iron_oath']);
    expect(back.relicOffer).toEqual(r.relicOffer);
    expect(back.phase).toBe('relic');
  });

  it('debug Give relic: sıradaki eksik kalıntı; hepsi varken değişmez; yarım savaş kaydını siler', () => {
    const r = withSuspended(fresh(), { wave: 1, seed: 1, actions: [], turn: 0, hash: 'x' });
    const g = grantRelic(r);
    expect(g.relics).toEqual([ALL[0]]);
    expect(g.suspended).toBeUndefined();
    const full = fresh(ALL);
    expect(grantRelic(full)).toBe(full);
  });
});

describe('kalıntı etkileri', () => {
  it('kalıntısız kurulum aynen kalır (bugünkü savaş)', () => {
    expect(withRelics({ startHpRatio: 0.5 }, [])).toEqual({ startHpRatio: 0.5 });
    expect(wavePlan(fresh()).units.party).toEqual({});
  });

  it('Ember of Valdren: dalga başında her kahramana maks canın %8i kalkan', () => {
    const b = battleFor(wavePlan(fresh(['ember_of_valdren'])));
    for (const c of heroes(b)) expect(c.shield).toBe(Math.round(c.maxHp * 0.08));
    for (const c of b.combatants.filter((x) => x.side === 'enemy')) expect(c.shield).toBe(0);
    for (const c of heroes(battleFor(wavePlan(fresh())))) expect(c.shield).toBe(0);
  });

  it("Pilgrim's Bell: zafer şifası %20 yerine %30", () => {
    expect(victoryHealOf([])).toBe(0.2);
    expect(victoryHealOf(['pilgrims_bell'])).toBe(0.3);
    const run = fresh(['pilgrims_bell']);
    const next = applyOutcome(run, { wave: 1 }, { victory: true, units: run.heroes.map((h) => ({ heroId: h.id, hpRatio: 0.5, alive: true })), kills: 0, turns: 1 });
    for (const h of next.heroes) expect(h.hpRatio).toBeCloseTo(0.8);
  });

  it('Whetstone of Ashford: kritik şansı +%5', () => {
    const a = heroes(battleFor(wavePlan(fresh())));
    const b = heroes(battleFor(wavePlan(fresh(['whetstone_of_ashford']))));
    a.forEach((c, i) => expect(b[i]!.stats.critChance).toBeCloseTo(c.stats.critChance + 0.05));
  });

  it('Iron Oath: zırh ve büyü zırhı +2 (item zırhıyla toplanır)', () => {
    const a = heroes(battleFor(wavePlan(fresh())));
    const b = heroes(battleFor(wavePlan(fresh(['iron_oath']))));
    a.forEach((c, i) => {
      expect(b[i]!.stats.armor).toBe(c.stats.armor + 2);
      expect(b[i]!.stats.magicArmor).toBe(c.stats.magicArmor + 2);
    });
    expect(withRelics({ modifiers: { armorAdd: 3 } }, ['iron_oath']).modifiers).toEqual({ armorAdd: 5, magicArmorAdd: 2 });
  });

  it('Banner of the Bridge: her kahramanın ilk eyleminde hasar x1,15; sonra normal', () => {
    // Aynı seed, aynı hamleler: yalnızca kalıntı farkı. İlk kahraman eyleminin hasar olayları ~%15 büyük.
    const plain = battleFor(wavePlan(fresh()));
    const banner = battleFor(wavePlan(fresh(['banner_of_the_bridge'])));
    expect(heroes(banner).every((c) => c.openingDamageMult === 1.15)).toBe(true);
    const dmg = (b: Battle, ev: BattleEvent[]) => ev.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && b.get(e.source)?.side === 'party').reduce((s, e) => s + e.amount + e.absorbed, 0);
    let compared = false;
    for (let i = 0; i < 40 && !plain.winner && !compared; i++) {
      const actor = plain.currentActor!;
      const choice = chooseAction(plain, actor.uid, content.aiConfig, undefined, { difficulty: 'medium' });
      const pr = plain.applyChoice(actor.uid, choice);
      const br = banner.applyChoice(actor.uid, choice);
      if (!pr.ok || !br.ok) break;
      if (actor.side === 'party' && dmg(plain, pr.events) > 0) {
        expect(dmg(banner, br.events)).toBeGreaterThan(dmg(plain, pr.events));
        expect(dmg(banner, br.events)).toBeLessThanOrEqual(Math.ceil(dmg(plain, pr.events) * 1.15) + 3);
        expect(banner.get(actor.uid)!.openingDamageMult).toBeUndefined(); // ilk eylemden sonra kalkar
        compared = true;
      }
    }
    expect(compared).toBe(true);
  });

  it('Last Rites: kahraman düşünce canlı dostlar maks canın %15i kadar iyileşir', () => {
    const b = battleFor(wavePlan(fresh(['last_rites'])));
    const [victim, ...rest] = heroes(b);
    for (const c of rest) c.hp = Math.round(c.maxHp / 2);
    const before = rest.map((c) => c.hp);
    const events: BattleEvent[] = [];
    b.on((e) => events.push(e));
    b.debugKill(victim!.uid);
    rest.forEach((c, i) => expect(c.hp).toBe(Math.min(c.maxHp, before[i]! + Math.round(c.maxHp * 0.15))));
    expect(events.filter((e) => e.type === 'heal' && e.cause === 'last_rites')).toHaveLength(rest.length);
    // kalıntısız: şifa yok
    const p = battleFor(wavePlan(fresh()));
    const [v2, ...r2] = heroes(p);
    for (const c of r2) c.hp = Math.round(c.maxHp / 2);
    p.debugKill(v2!.uid);
    for (const c of r2) expect(c.hp).toBe(Math.round(c.maxHp / 2));
  });

  it('kalıntılar birleşir: ekler toplanır, zafer şifası en yüksek', () => {
    expect(relicEffects(ALL)).toEqual({ startShieldRatio: 0.08, victoryHeal: 0.3, critAdd: 0.05, openingDamageMult: 1.15, fallAllyHealRatio: 0.15, armorAdd: 2, magicArmorAdd: 2 });
  });
});

describe('kalıntılar ve motor / devam tutarlılığı', () => {
  it('kanca alanları verilmezse savaş birebir aynı (Quick Battle / MP etkilenmez)', () => {
    const setup = (units?: Record<number, UnitSetup>) =>
      new Battle(content.battleSetup(content.DEFAULT_BATTLE, 77, 'turns', { party: ['warrior', 'mage'], enemies: ['archer', 'druid'], ...(units ? { units: { party: units } } : {}) }));
    const a = setup();
    const b = setup({ 0: { startShieldRatio: 0, openingDamageMult: 1, fallAllyHealRatio: 0 } });
    for (let i = 0; i < 30 && !a.winner; i++) {
      const actor = a.currentActor!;
      const ch = chooseAction(a, actor.uid, content.aiConfig, undefined, { difficulty: 'medium' });
      a.applyChoice(actor.uid, ch);
      b.applyChoice(actor.uid, ch);
    }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(JSON.stringify(battleSummary(b))).toBe(JSON.stringify(battleSummary(a)));
  });

  it('kalıntılı yarım savaş aynı tura döner; kalıntı değişince kurulum parmak izi değişir', () => {
    const run = fresh(['banner_of_the_bridge', 'last_rites', 'ember_of_valdren']);
    const plan = wavePlan(run);
    const a = battleFor(plan);
    const log: ReplayAction[] = [];
    const off = attachRecorder(a, (x) => log.push(x));
    for (let i = 0; i < 10 && !a.winner; i++) {
      const actor = a.currentActor!;
      if (!a.applyChoice(actor.uid, chooseAction(a, actor.uid, content.aiConfig, undefined, { difficulty: 'medium' })).ok) a.skipTurn();
    }
    off();
    const susp = { wave: 1, seed: plan.seed, actions: log, turn: a.turnsTaken, hash: battleHash(a), setup: planKey(plan) };
    const b = battleFor(wavePlan(run));
    expect(restoreBattle(b, susp)).toBe(true);
    expect(battleHash(b)).toBe(battleHash(a));
    expect(planKey(wavePlan(run))).toBe(susp.setup);
    expect(planKey(wavePlan(grantRelic(run, 'iron_oath')))).not.toBe(susp.setup);
    const c = battleFor(plan);
    expect(replayActions(c, log)).toEqual({ ok: true });
  });
});
