import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENCOUNTERS,
  ENGINE_CAPS,
  battlePlan,
  battleSeed,
  debugTeleport,
  enemyPreview,
  getMap,
  newCampaign,
  outcomeFrom,
  pickHero,
  resolveEncounter,
  validateEncounters,
} from '../src/campaign';
import { Battle, battleSummary, content } from '../src/engine';

const map = getMap('valdoria');

describe('sefer karşılaşmaları', () => {
  it('veri geçerli: sınıflar oynanabilir (Geometer yok), yuvalar 0-11 tekrarsız, yedekler geçerli', () => {
    expect(validateEncounters()).toEqual([]);
  });

  it('her savaşlı düğüm var olan, yedek olmayan bir karşılaşmaya işaret eder', () => {
    for (const n of map.nodes.filter((x) => x.encounter)) {
      const e = ENCOUNTERS[n.encounter!];
      expect(e, n.id).toBeTruthy();
      expect(e!.fallbackOnly, n.id).toBeFalsy();
    }
  });

  it('motor güçlendirmeyi destekliyor: asıl takımlar oynanır; destek yoksa yedekler (Mill Road 1v1, Kings Bridge eskortlu)', () => {
    expect(ENGINE_CAPS).toEqual({ unitMods: true, startHp: true });
    const off = { unitMods: false, startHp: false };
    expect(resolveEncounter('mill_road_thugs').id).toBe('mill_road_thugs');
    expect(resolveEncounter('mill_road_thugs', off).id).toBe('mill_road_thug_solo');
    expect(resolveEncounter('bridge_warden').def.units.map((u) => u.class)).toEqual(['bridge_warden', 'iron_mooring', 'iron_mooring']);
    expect(resolveEncounter('bridge_warden', off).def.units).toHaveLength(4);
    expect(resolveEncounter('bog_ambush').fallback).toBe(false);
    expect(enemyPreview('watchtower_chief')).toMatchObject({ classes: ['warrior', 'archer', 'archer'], leader: 'Bandit Chief' });
  });

  it('elit/boss güçlendirmesi, özel ad ve rütbe motora gider; tutorial düşmanları zayıf', () => {
    const at = (node: string) => {
      const s = debugTeleport(newCampaign({ mode: 'normal', seed: 4 }), node);
      const plan = battlePlan(s);
      const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));
      return { plan, battle };
    };
    const w = at('3');
    const chief = battleSummary(w.battle).units.find((u) => u.side === 'enemy' && u.displayName === 'Bandit Chief')!;
    expect(chief.tier).toBe('elite');
    expect(chief.maxHp).toBeGreaterThan(content.classes.warrior!.stats.hp);
    const m = at('1');
    const thug = battleSummary(m.battle).units.find((u) => u.side === 'enemy' && u.classId === 'warrior')!;
    expect(thug.maxHp).toBeLessThan(content.classes.warrior!.stats.hp);
    // Arka plan önceliği: karşılaşma > düğüm > bölge; King's Bridge kendi arka planını kullanır, dosyası diskte var
    expect(at('9').plan.background).toBe('kings-bridge');
    expect(existsSync(join(__dirname, '..', 'assets', 'backgrounds', 'kings-bridge.webp'))).toBe(true);
    expect(at('3').plan.background).toBe(map.regions.find((r) => r.id === map.nodes.find((n) => n.id === '3')!.region)?.battleBackground);
    const b = at('9');
    const warden = b.battle.combatants.find((c) => c.side === 'enemy')!;
    expect(warden.tier).toBe('boss');
    expect(warden.actionsPerTurn).toBe(2);
  });

  it('can taşıma: eksik canlı karakter savaşa o oranla girer', () => {
    let s = debugTeleport(newCampaign({ mode: 'normal', seed: 6 }), '3');
    s = { ...s, roster: s.roster.map((h, i) => (i === 0 ? { ...h, hpRatio: 0.4 } : h)) };
    const plan = battlePlan(s);
    const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));
    const i = plan.heroOrder.indexOf(s.roster[0]!.id);
    const c = battle.get(`party-${i}`)!;
    expect(c.hp).toBe(Math.round(c.maxHp * 0.4));
    expect(battlePlan(s, 0, { unitMods: true, startHp: false }).units.party).toEqual({});
  });

  it('savaş planı mevcut savaş girişiyle kurulur; sonuç hero id ile geri okunur; seed belirleyici', () => {
    const s = pickHero(newCampaign({ mode: 'normal', seed: 5 }), 'paladin');
    const plan = battlePlan(s);
    expect(plan.party.filter(Boolean)).toEqual(['paladin']);
    expect(plan.seed).toBe(battleSeed(5, 'valdoria', '1', 0));
    expect(battlePlan(s, 1).seed).not.toBe(plan.seed);
    expect(battlePlan(s).seed).toBe(plan.seed);
    const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies }, false));
    const party = battle.combatants.filter((c) => c.side === 'party');
    expect(party).toHaveLength(1);
    party[0]!.hp = Math.round(party[0]!.maxHp / 2);
    const out = outcomeFrom(plan, true, battleSummary(battle).units);
    expect(out.units).toEqual([{ heroId: s.roster[0]!.id, hpRatio: party[0]!.hp / party[0]!.maxHp, alive: true }]);
  });

  it('4 kişilik takım planı: hero sırası yuva sırasıdır (party-i = i. dolu hücre)', () => {
    const s = debugTeleport(newCampaign({ mode: 'normal', seed: 8 }), '8A');
    const plan = battlePlan(s);
    expect(plan.heroOrder).toHaveLength(4);
    const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies }, false));
    plan.heroOrder.forEach((id, i) => {
      const hero = s.roster.find((h) => h.id === id)!;
      expect(battle.get(`party-${i}`)!.defId).toBe(hero.class);
    });
    expect(plan.enemies.filter(Boolean)).toHaveLength(4);
  });
});

describe('tutorial düşmanlarında ultimate yok (lockSkills), Bandit Chief ultimate\'ı geç gelir (initialCooldownBonus)', () => {
  const ULTS: Record<string, string> = Object.fromEntries(['warrior', 'cutthroat', 'archer'].map((c) => [c, content.classes[c]!.skills[3]!]));
  it('Mill Road, Ravenwood, Watchtower: normal düşmanların 4. yuva skill\'i kilitli; elit lider kilitsiz ama +1 başlangıç cooldown\'u; motora gider', () => {
    for (const [node, enc] of [['1', 'mill_road_thugs'], ['2', 'ravenwood_pack'], ['3', 'watchtower_chief']] as const) {
      for (const u of ENCOUNTERS[enc]!.units) {
        if (u.tier) {
          expect(u.lockSkills, enc).toBeUndefined();
          expect(u.initialCooldownBonus, enc).toBe(1);
        } else expect(u.lockSkills, `${enc} ${u.class}`).toEqual([ULTS[u.class]]);
      }
      const s = debugTeleport(newCampaign({ mode: 'normal', seed: 4 }), node);
      const plan = battlePlan(s);
      const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, plan.seed, 'turns', { party: plan.party, enemies: plan.enemies, units: plan.units }, false));
      for (const c of battle.combatants.filter((x) => x.side === 'enemy')) {
        if (c.tier) {
          expect(c.lockedSkills).toBeUndefined();
          expect(c.cooldowns[ULTS[c.defId]!]).toBeGreaterThanOrEqual(1);
        } else expect(c.lockedSkills, `${node} ${c.defId}`).toEqual([ULTS[c.defId]]);
      }
    }
  });
});
