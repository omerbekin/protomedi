import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describeSkill, previewSkill } from '../src/engine';
import type { AiConfig, BattleEvent, BattleMode, SkillDef, SkillEffect } from '../src/engine';

// Gambler class'ı ve onun yeni motor kuralları: çifte vuruş (repeatChance), bahis (bet), rastgele durum (randomStatus).
// Sayılar veriden okunur; zorlanan sonuçlar için skill kopyaları (winChance 0/1 gibi) yalnızca testte kullanılır.

const ai: AiConfig = { ...content.aiConfig, global: undefined }; // class skill kararları (global skill: tests/ai-global.test.ts)
const ATTRS = ['str', 'int', 'dex', 'luck'] as const;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');

/** Gambler (party slot 0) vs tek düşman (enemy slot 0, çok canlı). `skillOverrides`: id -> değiştirilmiş skill. */
function duel(opts: { seed?: number; mode?: BattleMode; enemy?: string; overrides?: Record<string, SkillDef> } = {}): Battle {
  const setup = content.battleSetup('random-battle', opts.seed ?? 1, opts.mode ?? 'test', { party: cells({ 0: 'gambler' }), enemies: cells({ 0: opts.enemy ?? 'warrior', 3: 'warrior' }) }, false);
  const b = new Battle({ ...setup, skills: { ...setup.skills, ...(opts.overrides ?? {}) } });
  for (const c of b.combatants) {
    c.hp = c.maxHp = 100000;
    Object.assign(c.stats, { accuracy: 10, evasion: 0 });
    c.stats.armor = 0;
    c.stats.surviveChance = 0;
  }
  b.debug.crit = 'never';
  return b;
}

const withEffect = (id: string, mutate: (e: SkillEffect) => SkillEffect): SkillDef => {
  const s = content.skills[id]!;
  return { ...s, effects: s.effects.map(mutate) };
};

const G = 'party-0';
const E = 'enemy-0';
const run = (b: Battle, skill: string, target = E): BattleEvent[] => {
  const r = b.useSkill(G, skill, target);
  if (!r.ok) throw new Error(r.reason);
  return r.events;
};
const dmgTo = (events: BattleEvent[], uid: string) => events.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.target === uid);
const sumDmg = (events: BattleEvent[], uid: string) => dmgTo(events, uid).reduce((s, e) => s + e.amount + e.absorbed, 0);
const passives = (events: BattleEvent[], id: string) => events.filter((e) => e.type === 'passive' && e.passive === id);

describe('Gambler: class verisi', () => {
  const g = content.classes.gambler!;

  it('class havuzunda, takım havuzunda (random-battle) ve ai profili tanımlı', () => {
    expect(g).toBeDefined();
    expect(content.battles['random-battle']!.random!.pool).toContain('gambler');
    expect(content.aiConfig.profiles[g.ai!]).toBeDefined();
    expect(g.skills).toEqual(['loaded_dice', 'high_stakes', 'card_trick', 'all_in']);
  });

  it('dört stat toplamı 30, primary luck ve en yüksek stat; Lucky Escape aktif', () => {
    const a = g.attributes;
    expect(a.str + a.int + a.dex + a.luck).toBe(30);
    expect(g.primary).toBe('luck');
    expect(a.luck).toBe(Math.max(...ATTRS.map((k) => a[k])));
    expect(g.stats.primaryActive).toBe(true);
    expect(g.stats.surviveChance).toBe(content.formulas.primaryBonus.luck.surviveChance);
  });

  it('tüm hasarlar skill\'in statıyla (luck) ölçeklenir; bahis/çifte vuruş ölçek kuralını bozmaz', () => {
    for (const id of g.skills) {
      for (const e of content.skills[id]!.effects) {
        if (e.type === 'damage' || e.type === 'ground') expect((e as { scale: string }).scale, id).toBe('luck');
        expect(['damage', 'randomStatus'], `${id}: ${e.type} bu class'ta beklenmiyor`).toContain(e.type);
      }
    }
  });

  it('skill bedelleri ve beklemeleri mevcut class\'larla aynı büyüklükte', () => {
    const others = Object.values(content.classes).filter((c) => c.id !== 'gambler').flatMap((c) => c.skills.map((s) => content.skills[s]!));
    const maxCost = Math.max(...others.map((s) => s.cost.amount));
    const maxCd = Math.max(...others.map((s) => s.cooldown ?? 0));
    for (const id of g.skills) {
      const s = content.skills[id]!;
      expect(s.cost.amount, id).toBeLessThanOrEqual(maxCost);
      expect(s.cooldown ?? 0, id).toBeLessThanOrEqual(maxCd);
      expect(s.cost.amount, id).toBeLessThanOrEqual(g.stats.mp);
    }
    expect(content.skills.loaded_dice!.cost.amount).toBe(0); // 1. skill bedava (diğer class'lar gibi)
  });
});

describe('çifte vuruş (damage.repeatChance)', () => {
  const dice = (chance: number) => ({ loaded_dice: withEffect('loaded_dice', (e) => (e.type === 'damage' ? { ...e, repeatChance: chance } : e)) });

  it('ihtimal 1: hedefe iki vuruş ve "Double Hit" yazısı; ihtimal 0: tek vuruş', () => {
    const two = run(duel({ overrides: dice(1) }), 'loaded_dice');
    expect(dmgTo(two, E)).toHaveLength(2);
    expect(passives(two, 'gamble_double')).toHaveLength(1);
    const one = run(duel({ overrides: dice(0) }), 'loaded_dice');
    expect(dmgTo(one, E)).toHaveLength(1);
    expect(passives(one, 'gamble_double')).toHaveLength(0);
  });

  it('gerçek veri: ihtimal skill verisinden gelir ve uzun vadede ona yakındır (seed\'li)', () => {
    const chance = (content.skills.loaded_dice!.effects[0] as { repeatChance: number }).repeatChance;
    let doubles = 0;
    const N = 600;
    for (let seed = 1; seed <= N; seed++) if (dmgTo(run(duel({ seed }), 'loaded_dice'), E).length === 2) doubles++;
    expect(doubles / N).toBeGreaterThan(chance - 0.07);
    expect(doubles / N).toBeLessThan(chance + 0.07);
  });

  it('ikinci vuruş birincinin tekrarıdır (aynı güç aralığı, ayrı zar)', () => {
    const ev = dmgTo(run(duel({ overrides: dice(1) }), 'loaded_dice'), E);
    expect(Math.abs(ev[0]!.amount - ev[1]!.amount)).toBeLessThanOrEqual(Math.ceil(Math.max(ev[0]!.amount, ev[1]!.amount) * 0.25));
  });

  it('aynı seed + aynı girdi = birebir aynı olay akışı (iki modda da)', () => {
    for (const mode of ['test', 'turns'] as const) {
      const play = () => {
        const b = duel({ seed: 7, mode });
        const actor = mode === 'turns' ? b.currentUid! : G;
        return b.useSkill(actor, 'loaded_dice', mode === 'turns' ? b.living(b.get(actor)!.side === 'party' ? 'enemy' : 'party')[0]!.uid : E);
      };
      expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
    }
  });
});

describe('bahis (damage.bet): can', () => {
  const hs = (winChance: number) => ({ high_stakes: withEffect('high_stakes', (e) => (e.type === 'damage' && e.bet ? { ...e, bet: { ...e.bet, winChance } } : e)) });
  const bet = (content.skills.high_stakes!.effects[0] as { bet: { ratio: number; winMult: number; loseMult: number } }).bet;

  it('kazanç: Jackpot, hasar winMult katı, can düşmez', () => {
    const win = duel({ overrides: hs(1) });
    const ev = run(win, 'high_stakes');
    expect(passives(ev, 'gamble_win')).toHaveLength(1);
    expect(win.get(G)!.hp).toBe(win.get(G)!.maxHp);
    const lose = duel({ overrides: hs(0) });
    const evL = run(lose, 'high_stakes');
    expect(sumDmg(ev, E) / sumDmg(evL, E)).toBeGreaterThan((bet.winMult / bet.loseMult) * 0.75);
    expect(sumDmg(ev, E) / sumDmg(evL, E)).toBeLessThan((bet.winMult / bet.loseMult) * 1.3);
  });

  it('kayıp: Bust, bahis (maks canın ratio\'su) kullanıcıdan düşer, hasar loseMult katı', () => {
    const b = duel({ overrides: hs(0) });
    const me = b.get(G)!;
    const before = me.hp;
    const ev = run(b, 'high_stakes');
    expect(passives(ev, 'gamble_lose')).toHaveLength(1);
    const stake = Math.round(me.maxHp * bet.ratio);
    expect(before - me.hp).toBe(stake);
    expect(dmgTo(ev, G)).toHaveLength(1); // kendine hasar olayı (UI için)
    expect(dmgTo(ev, G)[0]!.amount).toBe(stake);
  });

  it('can bahsi kullanıcıyı öldürmez: canı en az 1 kalır', () => {
    const b = duel({ overrides: hs(0) });
    const me = b.get(G)!;
    me.hp = 3;
    run(b, 'high_stakes');
    expect(me.hp).toBe(1);
    expect(me.hp).toBeGreaterThan(0);
  });

  it('turns modunda cooldown işler, test modunda cooldown yok', () => {
    const t = duel({ mode: 'turns' });
    const first = t.currentActor!;
    const me = t.combatants.find((c) => c.uid === G)!;
    while (t.currentUid !== G && !t.winner) t.skipTurn();
    me.mp = me.maxMp;
    expect(t.useSkill(G, 'high_stakes', t.living('enemy')[0]!.uid).ok).toBe(true);
    expect(me.cooldowns.high_stakes).toBe(content.skills.high_stakes!.cooldown);
    expect(first).toBeDefined();
    const x = duel({ mode: 'test' });
    run(x, 'high_stakes');
    expect(x.get(G)!.cooldowns.high_stakes).toBeUndefined();
    expect(x.canUse(G, 'high_stakes').ok).toBe(true);
  });
});

describe('bahis (damage.bet): MP', () => {
  const ai_ = (winChance: number) => ({ all_in: withEffect('all_in', (e) => (e.type === 'damage' && e.bet ? { ...e, bet: { ...e.bet, winChance } } : e)) });
  const skill = content.skills.all_in!;
  const bet = (skill.effects[0] as { bet: { winMult: number; perStake: number } }).bet;

  it('kayıp: iska (hasar yok), bedelden SONRA kalan tüm MP gider', () => {
    const b = duel({ overrides: ai_(0) });
    const me = b.get(G)!;
    me.mp = me.maxMp;
    const ev = run(b, 'all_in');
    expect(passives(ev, 'gamble_lose')).toHaveLength(1);
    expect(dmgTo(ev, E)).toHaveLength(0);
    expect(me.mp).toBe(0);
  });

  it('kazanç: hasar winMult + perStake x bahis katı, MP bedelden sonra kalan miktarda kalır; bahis büyüdükçe hasar artar', () => {
    const play = (mp: number) => {
      const b = duel({ overrides: ai_(1) });
      const me = b.get(G)!;
      me.mp = mp;
      const ev = run(b, 'all_in');
      return { dmg: sumDmg(ev, E), mpLeft: me.mp, stake: mp - skill.cost.amount };
    };
    const small = play(skill.cost.amount);
    const big = play(skill.cost.amount + 10);
    expect(small.mpLeft).toBe(small.stake);
    expect(big.mpLeft).toBe(big.stake);
    expect(big.dmg).toBeGreaterThan(small.dmg);
    const luck = content.classes.gambler!.stats.luck;
    const power = (skill.effects[0] as { power: number }).power;
    expect(small.dmg).toBeGreaterThan(luck * power * bet.winMult * 0.85);
    expect(small.dmg).toBeLessThan(luck * power * bet.winMult * 1.15);
    const expectedRatio = (bet.winMult + bet.perStake * big.stake) / (bet.winMult + bet.perStake * small.stake);
    expect(big.dmg / small.dmg).toBeGreaterThan(expectedRatio * 0.85);
    expect(big.dmg / small.dmg).toBeLessThan(expectedRatio * 1.15);
  });

  it('MP yoksa canUse reddeder (bedel); freeMp açıkken bahis 0 olsa da oynanır', () => {
    const b = duel();
    const me = b.get(G)!;
    me.mp = 0;
    expect(b.canUse(G, 'all_in').ok).toBe(false);
  });
});

describe('rastgele durum (randomStatus): Card Trick', () => {
  const trick = content.skills.card_trick!;
  const options = (trick.effects.find((e) => e.type === 'randomStatus') as Extract<SkillEffect, { type: 'randomStatus' }>).options;

  it('rastgele 2 farklı düşmana vurur; her vurulana seçeneklerden tam 1 durum verilir', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = duel({ seed });
      const ev = run(b, 'card_trick');
      const hit = [...new Set(dmgTo(ev, E).concat(dmgTo(ev, 'enemy-1')).map((e) => e.target))];
      expect(hit.length).toBeLessThanOrEqual(trick.count!);
      const st = ev.filter((e): e is Extract<BattleEvent, { type: 'status' }> => e.type === 'status');
      expect(st).toHaveLength(hit.length);
      for (const s of st) expect(options.map((o) => o.status)).toContain(s.status);
    }
  });

  it('seed\'e göre farklı etkiler çıkar (tümü görülür), ağırlıklara uygun; aynı seed aynı sonuç', () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const ev = run(duel({ seed }), 'card_trick');
      for (const e of ev) if (e.type === 'status') seen.set(e.status, (seen.get(e.status) ?? 0) + 1);
    }
    for (const o of options) expect(seen.get(o.status) ?? 0, o.status).toBeGreaterThan(0);
    const heaviest = [...options].sort((a, b) => b.weight - a.weight)[0]!.status;
    const lightest = [...options].sort((a, b) => a.weight - b.weight)[0]!.status;
    expect(seen.get(heaviest)!).toBeGreaterThan(seen.get(lightest)!);
    expect(JSON.stringify(run(duel({ seed: 9 }), 'card_trick'))).toBe(JSON.stringify(run(duel({ seed: 9 }), 'card_trick')));
  });

  it('turns modunda da çalışır ve Slow/Wound/Stun gerçekten uygulanır', () => {
    const b = duel({ mode: 'turns', seed: 3 });
    while (b.currentUid !== G && !b.winner) b.skipTurn();
    b.get(G)!.mp = b.get(G)!.maxMp;
    const r = b.useSkill(G, 'card_trick');
    expect(r.ok).toBe(true);
    const statuses = b.combatants.filter((c) => c.side === 'enemy').flatMap((c) => c.statuses.map((s) => s.kind));
    expect(statuses.length).toBeGreaterThan(0);
  });
});

describe('önizleme ve açıklama', () => {
  it('önizleme: bahis/çifte vuruş en az-en çok-ortalama aralığını verir; ölümcül hesap en çok değere bakar', () => {
    const b = duel();
    const me = b.get(G)!;
    me.mp = me.maxMp;
    const dice = previewSkill(b, G, 'loaded_dice', E)[0]!.damage!;
    expect(dice.max).toBeGreaterThan(dice.avg);
    expect(dice.avg).toBeGreaterThan(dice.min);
    const stakes = previewSkill(b, G, 'high_stakes', E)[0]!.damage!;
    expect(stakes.max).toBeGreaterThan(stakes.avg);
    expect(stakes.min).toBeGreaterThan(0);
    const allIn = previewSkill(b, G, 'all_in', E)[0]!.damage!;
    expect(allIn.min).toBe(0); // iska ihtimali
    expect(allIn.max).toBeGreaterThan(allIn.avg);
    expect(previewSkill(b, G, 'card_trick')).toEqual([]); // hedefler rastgele: önizleme yok
  });

  it('önizleme ve gerçek vuruş tutarlı: gerçek hasar önizleme aralığının içinde', () => {
    for (const skill of ['loaded_dice', 'high_stakes', 'all_in']) {
      for (let seed = 1; seed <= 30; seed++) {
        const b = duel({ seed });
        b.get(G)!.mp = b.get(G)!.maxMp;
        const p = previewSkill(b, G, skill, E)[0]!.damage!;
        const d = sumDmg(run(b, skill), E);
        expect(d, `${skill} seed ${seed}`).toBeGreaterThanOrEqual(p.min);
        expect(d, `${skill} seed ${seed}`).toBeLessThanOrEqual(p.max + 1);
      }
    }
  });

  it('skill-info: her skill\'in açıklaması yeni kuralı sade İngilizceyle anlatır', () => {
    const stats = content.classes.gambler!.stats;
    const info = (id: string) => describeSkill(content.skills[id]!, stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info('loaded_dice').lines.join('\n')).toMatch(/chance to hit twice/);
    expect(info('high_stakes').lines.join('\n')).toMatch(/Bet .*max HP/);
    expect(info('all_in').lines.join('\n')).toMatch(/Bet all your remaining MP/);
    expect(info('all_in').lines.join('\n')).toMatch(/you miss/);
    expect(info('card_trick').lines.join('\n')).toMatch(/Random effect/);
    expect(info('card_trick').targetBadge).toMatch(/Random/);
    for (const id of content.classes.gambler!.skills) {
      const i = info(id);
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.lines.length).toBeGreaterThan(0);
    }
  });
});

describe('yapay zeka ve simülasyon', () => {
  it('YZ Gambler\'ı oynatır: her zaman geçerli hamle, hedef türleri ve bedeller yasalara uyar', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns', { party: ['gambler', 'warrior', 'mage', 'archer', 'druid'], enemies: ['gambler', 'defender', 'paladin', 'undead', 'antimage'] }));
      for (let i = 0; i < 500 && !b.winner; i++) {
        const actor = b.currentUid!;
        const choice = chooseAction(b, actor, ai);
        const r = b.applyChoice(actor, choice);
        expect(r.ok, `seed ${seed} tur ${i}`).toBe(true);
      }
      expect(b.winner, `seed ${seed}`).not.toBeNull();
    }
  });

  it('YZ düşük canda can bahsi (High Stakes) oynamaz; yeterli canda oynayabilir', () => {
    const b = duel({ mode: 'turns' });
    // Gambler'ın sırasını bekle
    for (let i = 0; i < 200 && b.currentUid !== G; i++) b.skipTurn();
    const me = b.get(G)!;
    me.mp = me.maxMp;
    me.hp = Math.round(me.maxHp * 0.3);
    for (const e of b.living('enemy')) {
      e.hp = e.maxHp = 100000;
    }
    const low = chooseAction(b, G, ai);
    expect(low?.skillId).not.toBe('high_stakes');
  });

  it('YZ Gambler\'ın tüm skill\'lerini (denemelerde) kullanır', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns', { party: ['gambler', 'warrior', 'mage', 'archer', 'druid'], enemies: ['gambler', 'defender', 'paladin', 'undead', 'antimage'] }));
      for (let i = 0; i < 500 && !b.winner; i++) {
        const actor = b.currentUid!;
        const c = b.get(actor)!;
        const choice = chooseAction(b, actor, ai);
        if (c.defId === 'gambler' && choice) used.add(choice.skillId);
        const r = b.applyChoice(actor, choice);
        expect(r.ok).toBe(true);
      }
    }
    for (const id of content.classes.gambler!.skills) expect(used.has(id), id).toBe(true);
  });
});
