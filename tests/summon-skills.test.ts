import { describe, expect, it } from 'vitest';
import { Battle, attributePower, chooseAction, content, damageRange, damageSpecFor, describeSkill, previewSkill } from '../src/engine';
import type { Attribute, BattleEvent, BattleMode, CombatantDef } from '../src/engine';

// Çağrılan birimlerin ikinci skill'i: Skeleton - Bone Slash (hedefin yanındakilere de vurur), Treant - Thorn Shield (kalkan + dikenli yansıma).
// (Her class tam 4 skill'e sahiptir; çağrılanlar için böyle bir kural yok.) Sayılar veriden okunur.

const ai = content.aiConfig;
const f = content.formulas;
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;

type Placed = [string, number];

/** Birimleri doğrudan yuvalara koyar (çağrılanlar dahil). uid'ler: party-0.., enemy-0.. (girdi sırası). */
function arena(party: Placed[], enemies: Placed[], opts: { mode?: BattleMode; seed?: number; overrides?: Record<string, import('../src/engine').SkillDef> } = {}): Battle {
  const base = content.battleSetup('random-battle', opts.seed ?? 1, opts.mode ?? 'test', { party: [], enemies: [] }, false);
  const b = new Battle({
    ...base,
    skills: { ...base.skills, ...(opts.overrides ?? {}) },
    party: party.map(([id]) => unitDef(id)),
    partySlots: party.map(([, s]) => s),
    enemies: enemies.map(([id]) => unitDef(id)),
    enemySlots: enemies.map(([, s]) => s),
  });
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, surviveChance: 0 });
    c.hp = c.maxHp = 100000;
  }
  b.debug.crit = 'never';
  return b;
}

const act = (b: Battle, actor: string, skill: string, target?: string): BattleEvent[] => {
  const r = b.useSkill(actor, skill, target);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
};
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const hitUids = (events: BattleEvent[]) => ofType(events, 'damage').map((e) => e.target);
const skillOf = (id: string) => content.skills[id]!;

function skipUntil(b: Battle, uid: string): void {
  for (let i = 0; i < 400 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}

describe('çağrılanların skill listesi (şema)', () => {
  it('Skeleton ve Treant ikişer skill taşır; skill\'ler kayıtlıdır', () => {
    expect(unitDef('skeleton').skills).toEqual(['skeleton_strike', 'skeleton_slash']);
    expect(unitDef('treant').skills).toEqual(['root_smash', 'thorn_shield']);
    for (const def of Object.values(content.summons)) for (const id of def.skills) expect(content.skills[id], `${def.id}:${id}`).toBeDefined();
  });

  it('class\'lar hâlâ tam 4 skill, çağrılanlar 1-4 arası (çağrılan için tam-4 kuralı yok)', () => {
    for (const def of Object.values(content.classes)) expect(def.skills, def.id).toHaveLength(4);
    for (const def of Object.values(content.summons)) {
      expect(def.skills.length).toBeGreaterThanOrEqual(1);
      expect(def.skills.length).toBeLessThanOrEqual(4);
    }
  });

  it('Treant yeni YZ profilini (thorny) kullanır, profil tanımlıdır', () => {
    expect(unitDef('treant').ai).toBe('thorny');
    expect(ai.profiles.thorny!.priorities).toContain('thorns');
  });
});

describe('Skeleton - Bone Slash (yan vuruş)', () => {
  const slash = skillOf('skeleton_slash');

  it('veri: tek düşman hedefi + dik komşulara yan vuruş, melee, cooldown\'lu, hasar skeleton\'ın en yüksek statıyla ölçeklenir', () => {
    expect(slash.target).toBe('single_enemy');
    expect(slash.motion).toBe('melee');
    expect(slash.splash).toMatchObject({ pattern: 'perpendicular' });
    expect(slash.cooldown ?? 0).toBeGreaterThan(0);
    const a = unitDef('skeleton').attributes;
    const top = (Object.keys(a) as Attribute[]).reduce((m, k) => (a[k] > a[m] ? k : m));
    const dmg = slash.effects.filter((e) => e.type === 'damage');
    expect(dmg.length).toBeGreaterThan(0);
    for (const e of dmg) if (e.type === 'damage') expect(e.scale).toBe(top);
  });

  // Düşman tarafı: yuva = sıra*3 + şerit. Ön sıra 0,1,2; ikinci sıra 3,4,5.
  const front = (slots: number[]): Placed[] => slots.map((s) => ['warrior', s]);

  it('ortadaki hedefe vurunca aynı sıradaki sol ve sağ komşu da vurulur; arkadaki sıra vurulmaz', () => {
    const b = arena([['skeleton', 1]], [...front([0, 1, 2, 4])]);
    // enemy-0 slot 0, enemy-1 slot 1, enemy-2 slot 2, enemy-3 slot 4
    const ev = act(b, 'party-0', 'skeleton_slash', 'enemy-1');
    expect(ofType(ev, 'skillUsed')[0]!.targets).toEqual(['enemy-1', 'enemy-0', 'enemy-2']);
    expect(hitUids(ev).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('kenar hedefte yalnızca tek yan komşu vurulur (boş hücre atlanır)', () => {
    const b = arena([['skeleton', 1]], front([0, 1, 2]));
    expect(hitUids(act(b, 'party-0', 'skeleton_slash', 'enemy-0')).sort()).toEqual(['enemy-0', 'enemy-1']);
    const c = arena([['skeleton', 1]], front([0, 1, 2]));
    expect(hitUids(act(c, 'party-0', 'skeleton_slash', 'enemy-2')).sort()).toEqual(['enemy-1', 'enemy-2']);
  });

  it('komşu hücre boşsa yalnızca ana hedef (ve varsa öbür yan) vurulur; ölü komşu vurulmaz', () => {
    const b = arena([['skeleton', 1]], front([1, 2]));
    expect(hitUids(act(b, 'party-0', 'skeleton_slash', 'enemy-0'))).toEqual(['enemy-0', 'enemy-1']);
    const lone = arena([['skeleton', 1]], front([1]));
    expect(hitUids(act(lone, 'party-0', 'skeleton_slash', 'enemy-0'))).toEqual(['enemy-0']);
    const dead = arena([['skeleton', 1]], front([0, 1, 2]));
    dead.debugKill('enemy-0', false);
    expect(hitUids(act(dead, 'party-0', 'skeleton_slash', 'enemy-1')).sort()).toEqual(['enemy-1', 'enemy-2']);
  });

  it('ikinci sıradaki hedefe (ön sıra boşken / reach ile) vurunca o sıranın yan komşuları vurulur, öndeki ve arkadaki sıralar değil', () => {
    const b = arena([['skeleton', 1]], front([3, 4, 5, 7]));
    expect(hitUids(act(b, 'party-0', 'skeleton_slash', 'enemy-1')).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('düşman Skeleton\'ı da aynı kuralla oyuncu tarafına vurur (iki taraf)', () => {
    const b = arena(front([0, 1, 2, 3]), [['skeleton', 4]]);
    // party-0..3: slotlar 0,1,2,3; skeleton enemy-0
    const ev = act(b, 'enemy-0', 'skeleton_slash', 'party-0');
    expect(hitUids(ev).sort()).toEqual(['party-0', 'party-1']);
    const ev2 = act(arena(front([0, 1, 2, 3]), [['skeleton', 4]]), 'enemy-0', 'skeleton_slash', 'party-1');
    expect(hitUids(ev2).sort()).toEqual(['party-0', 'party-1', 'party-2']);
  });

  it('hasar: ana hedef ve yan hedefler skill gücünün (ve yan vuruş çarpanının) hasar aralığındadır; skeleton\'ın Str\'siyle ölçeklenir', () => {
    const b = arena([['skeleton', 1]], front([0, 1, 2]));
    const actor = b.get('party-0')!;
    const effect = slash.effects[0]!;
    if (effect.type !== 'damage') throw new Error('hasar etkisi yok');
    const ev = act(b, 'party-0', 'skeleton_slash', 'enemy-1');
    for (const e of ofType(ev, 'damage')) {
      const target = b.get(e.target)!;
      const isMain = e.target === 'enemy-1';
      const range = damageRange(actor.stats, target.stats, damageSpecFor(actor, target, effect, f, isMain ? 1 : slash.splash!.mult ?? 1, isMain), f);
      expect(e.amount + e.absorbed, e.target).toBeGreaterThanOrEqual(range.min);
      expect(e.amount + e.absorbed, e.target).toBeLessThanOrEqual(range.max);
    }
    // Str ikiye katlanınca hasar yaklaşık iki katı
    const strong = arena([['skeleton', 1]], front([0, 1, 2]));
    strong.get('party-0')!.stats.str *= 2;
    const dmg = (evs: BattleEvent[]) => ofType(evs, 'damage').filter((e) => e.target === 'enemy-1').reduce((s, e) => s + e.amount, 0);
    const weak = dmg(ev);
    const big = dmg(act(strong, 'party-0', 'skeleton_slash', 'enemy-1'));
    expect(big / weak).toBeGreaterThan(1.7);
    expect(big / weak).toBeLessThan(2.3);
  });

  it('yan vuruş çarpanı (mult) veriden okunur: yan hedefler çarpanla azalır', () => {
    const half = { ...slash, splash: { pattern: 'perpendicular' as const, mult: 0.5 } };
    const full = arena([['skeleton', 1]], front([0, 1, 2]), { seed: 5 });
    const halved = arena([['skeleton', 1]], front([0, 1, 2]), { seed: 5, overrides: { skeleton_slash: half } });
    const a = ofType(act(full, 'party-0', 'skeleton_slash', 'enemy-1'), 'damage');
    const h = ofType(act(halved, 'party-0', 'skeleton_slash', 'enemy-1'), 'damage');
    const get = (l: typeof a, u: string) => l.find((e) => e.target === u)!.amount;
    expect(get(h, 'enemy-1')).toBe(get(a, 'enemy-1')); // ana hedef değişmez
    expect(get(h, 'enemy-0')).toBeLessThan(get(a, 'enemy-0') * 0.6);
    expect(get(h, 'enemy-0')).toBeGreaterThan(get(a, 'enemy-0') * 0.4);
  });

  it('menzil kuralı aynı: yalnızca ön sıradaki hedef seçilebilir; taunt\'lı hedef varsa o seçilir, yanlar yine vurulur', () => {
    const b = arena([['skeleton', 1]], front([0, 1, 2, 4]));
    expect(b.validTargets('party-0', 'skeleton_slash').map((c) => c.uid).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
    const t = arena([['skeleton', 1]], [['defender', 0], ['warrior', 1], ['warrior', 2]]);
    act(t, 'enemy-0', 'taunt');
    expect(t.validTargets('party-0', 'skeleton_slash').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(hitUids(act(t, 'party-0', 'skeleton_slash', 'enemy-0')).sort()).toEqual(['enemy-0', 'enemy-1']);
  });

  it('turns modunda cooldown konur ve biter', () => {
    const b = arena([['skeleton', 1]], front([0, 1, 2]), { mode: 'turns' });
    skipUntil(b, 'party-0');
    act(b, 'party-0', 'skeleton_slash', 'enemy-1');
    skipUntil(b, 'party-0');
    expect(b.canUse('party-0', 'skeleton_slash')).toEqual({ ok: false, reason: 'On cooldown' });
    expect(b.canUse('party-0', 'skeleton_strike').ok).toBe(true);
    for (let i = 0; i < slash.cooldown!; i++) {
      b.skipTurn();
      skipUntil(b, 'party-0');
    }
    expect(b.canUse('party-0', 'skeleton_slash').ok).toBe(true);
  });

  it('iki modda da (turns/test) üç hedefe vurur; aynı seed = birebir aynı olaylar', () => {
    for (const mode of ['test', 'turns'] as const) {
      const run = () => {
        const b = arena([['skeleton', 1]], front([0, 1, 2]), { mode, seed: 9 });
        if (mode === 'turns') skipUntil(b, 'party-0');
        return act(b, 'party-0', 'skeleton_slash', 'enemy-1');
      };
      const a = run();
      expect(hitUids(a)).toHaveLength(3);
      expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
    }
  });

  it('önizleme: ana hedef + yan hedefler (yan olanlar splash işaretli), hasar hesapla aynı', () => {
    const b = arena([['skeleton', 1]], front([0, 1, 2, 4]));
    const p = previewSkill(b, 'party-0', 'skeleton_slash', 'enemy-1');
    expect(p.map((x) => x.uid)).toEqual(['enemy-1', 'enemy-0', 'enemy-2']);
    expect(p[0]!.damage!.splash).toBe(false);
    expect(p[1]!.damage!.splash).toBe(true);
    expect(p[2]!.damage!.splash).toBe(true);
    expect(p[1]!.damage!.avg).toBeGreaterThan(0);
    // kenar hedef: tek yan
    expect(previewSkill(b, 'party-0', 'skeleton_slash', 'enemy-0').map((x) => x.uid)).toEqual(['enemy-0', 'enemy-1']);
  });

  it('skill açıklaması yan vuruşu söyler', () => {
    const info = describeSkill(slash, unitDef('skeleton').stats, f, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.some((l) => l.includes('beside the target'))).toBe(true);
    expect(info.cooldown).toBe(`${slash.cooldown} turns`);
  });

  it('YZ: birden çok hedef varken Bone Slash\'ı tercih eder; tek hedefte Bone Strike (daha güçlü tek vuruş); cooldown\'dayken Strike', () => {
    const many = arena([['skeleton', 1]], front([0, 1, 2]), { mode: 'turns' });
    skipUntil(many, 'party-0');
    expect(chooseAction(many, 'party-0', ai)?.skillId).toBe('skeleton_slash');
    const one = arena([['skeleton', 1]], front([1]), { mode: 'turns' });
    skipUntil(one, 'party-0');
    expect(chooseAction(one, 'party-0', ai)?.skillId).toBe('skeleton_strike');
    act(many, 'party-0', 'skeleton_slash', 'enemy-1');
    skipUntil(many, 'party-0');
    expect(chooseAction(many, 'party-0', ai)?.skillId).toBe('skeleton_strike');
  });
});

describe('Treant - Thorn Shield (dikenli kalkan)', () => {
  const shieldSkill = skillOf('thorn_shield');
  const thorns = shieldSkill.effects.find((e) => e.type === 'thorns')!;
  if (thorns.type !== 'thorns') throw new Error('thorns etkisi yok');
  const shieldEffect = shieldSkill.effects.find((e) => e.type === 'shield')!;
  if (shieldEffect.type !== 'shield') throw new Error('shield etkisi yok');

  /** Warrior'ın yakın dövüş skill'i (veriden). */
  const meleeId = content.classes.warrior!.skills.find((id) => skillOf(id).motion === 'melee' && skillOf(id).target === 'single_enemy')!;
  const rangedId = content.classes.archer!.skills.find((id) => skillOf(id).motion === 'ranged' && skillOf(id).target === 'single_enemy')!;

  /** Beklenen yansıma hasarı: Treant'ın stat'ı x power, saldırganın zırhıyla. */
  const expectedReflect = (b: Battle, holder: string, attacker: string) => {
    const h = b.get(holder)!;
    const a = b.get(attacker)!;
    const amount = Math.round(attributePower(h.stats, thorns.scale, f) * thorns.power);
    return damageRange(h.stats, b.effectiveStats(a), { damageType: 'physical', scale: 'str', power: 0, extra: amount, takenMultiplier: (a.summoned ? f.summon.damageTakenMultiplier : 1) }, f).avg;
  };

  const setup = () => arena([['treant', 1]], [['warrior', 1]]);

  it('veri: kendine, kalkan + thorns, aynı stat (Str), süreli ve cooldown\'lu', () => {
    expect(shieldSkill.target).toBe('self');
    expect(shieldEffect.self).toBe(true);
    expect(shieldEffect.scale).toBe(thorns.scale);
    expect(thorns.turns).toBeGreaterThan(0);
    expect(shieldSkill.cooldown ?? 0).toBeGreaterThan(0);
    expect(content.statuses.thorns).toBeDefined();
    const a = unitDef('treant').attributes;
    expect(thorns.scale).toBe((Object.keys(a) as Attribute[]).reduce((m, k) => (a[k] > a[m] ? k : m)));
  });

  it('kullanınca Treant\'a Str\'sine bağlı kalkan ve thorns durumu gelir', () => {
    const b = setup();
    const ev = act(b, 'party-0', 'thorn_shield');
    const t = b.get('party-0')!;
    expect(ofType(ev, 'shield')[0]!.amount).toBe(Math.round(attributePower(t.stats, shieldEffect.scale, f) * shieldEffect.power));
    expect(t.shield).toBeGreaterThan(0);
    const st = t.statuses.find((s) => s.kind === 'thorns')!;
    expect(st.turns).toBe(thorns.turns);
    expect(st.amount).toBe(Math.round(attributePower(t.stats, thorns.scale, f) * thorns.power));
    expect(ofType(ev, 'status').some((e) => e.status === 'thorns' && e.target === 'party-0')).toBe(true);
  });

  it('yakın dövüş vuruşu saldırgana sabit hasar yansıtır (Thorns olayı + hasar olayı); kalkan emse de', () => {
    const b = setup();
    act(b, 'party-0', 'thorn_shield');
    const w = b.get('enemy-0')!;
    const want = expectedReflect(b, 'party-0', 'enemy-0');
    expect(want).toBeGreaterThan(0);
    const ev = act(b, 'enemy-0', meleeId, 'party-0');
    // Her isabet eden vuruş (Warrior'ın skill'i çok vuruşlu olabilir) kendi yansımasını doğurur
    const hits = ofType(ev, 'damage').filter((d) => d.target === 'party-0').length;
    expect(hits).toBeGreaterThan(0);
    expect(ofType(ev, 'passive').filter((p) => p.name === 'Thorns')).toHaveLength(hits);
    const backs = ofType(ev, 'damage').filter((d) => d.source === 'party-0' && d.target === 'enemy-0');
    expect(backs).toHaveLength(hits);
    for (const back of backs) {
      expect(back.amount).toBe(want);
      expect(back.crit).toBe(false);
    }
    expect(w.hp).toBe(w.maxHp - want * hits);
  });

  it('yansıma isabet/kritik zarı atmaz: ıskalayan vuruş yansıtmaz, rastgele sayı akışı değişmez', () => {
    const b = setup();
    act(b, 'party-0', 'thorn_shield');
    b.debug.dodge = 'always';
    const ev = act(b, 'enemy-0', meleeId, 'party-0');
    expect(ofType(ev, 'dodge').length).toBeGreaterThan(0);
    expect(ofType(ev, 'passive').some((p) => p.name === 'Thorns')).toBe(false);
    // aynı seed + aynı eylemler = aynı olaylar (determinizm)
    const run = () => {
      const x = setup();
      act(x, 'party-0', 'thorn_shield');
      act(x, 'enemy-0', meleeId, 'party-0');
      return JSON.stringify(x.log);
    };
    expect(run()).toBe(run());
  });

  it('yalnızca YAKIN DÖVÜŞ yansıtılır: menzilli vuruş yansıtmaz', () => {
    const b = arena([['treant', 1]], [['archer', 1]]);
    act(b, 'party-0', 'thorn_shield');
    const ev = act(b, 'enemy-0', rangedId, 'party-0');
    expect(ofType(ev, 'passive').some((p) => p.name === 'Thorns')).toBe(false);
    expect(b.get('enemy-0')!.hp).toBe(b.get('enemy-0')!.maxHp);
  });

  it('yansıma yansımayı tetiklemez: iki Treant da dikenliyken tek yansıma olur', () => {
    const b = arena([['treant', 1]], [['treant', 1]]);
    act(b, 'party-0', 'thorn_shield');
    act(b, 'enemy-0', 'thorn_shield');
    const ev = act(b, 'party-0', 'root_smash', 'enemy-0');
    const thornEvents = ofType(ev, 'passive').filter((p) => p.name === 'Thorns');
    expect(thornEvents).toHaveLength(1);
    expect(thornEvents[0]!.actor).toBe('enemy-0');
    expect(ofType(ev, 'damage').filter((d) => d.target === 'enemy-0')).toHaveLength(1); // ana vuruş
    expect(ofType(ev, 'damage').filter((d) => d.target === 'party-0')).toHaveLength(1); // yansıma (kendi kalkanı emer ya da can düşer)
  });

  it('yansıyan hasar Treant\'ın Str\'siyle ölçeklenir', () => {
    const reflected = (mult: number) => {
      const b = setup();
      b.get('party-0')!.stats.str *= mult;
      b.get('enemy-0')!.stats.armor = 0;
      act(b, 'party-0', 'thorn_shield');
      const ev = act(b, 'enemy-0', meleeId, 'party-0');
      return ofType(ev, 'damage').find((d) => d.target === 'enemy-0')!.amount;
    };
    const a = reflected(1);
    const c = reflected(2);
    expect(c / a).toBeGreaterThan(1.8);
    expect(c / a).toBeLessThan(2.2);
  });

  it('yansıma saldırganı öldürebilir (ölüm olayı gelir, savaş tutarlı)', () => {
    const b = setup();
    const w = b.get('enemy-0')!;
    act(b, 'party-0', 'thorn_shield');
    w.hp = 1;
    const ev = act(b, 'enemy-0', meleeId, 'party-0');
    expect(w.hp).toBe(0);
    expect(ofType(ev, 'death').some((d) => d.target === 'enemy-0')).toBe(true);
    expect(b.winner).toBe('party');
  });

  it('turns modunda süre biter: thorns, Treant\'ın kendi turlarıyla sayılır ve statusEnd gelir; sonra yansıtmaz', () => {
    const b = arena([['treant', 1]], [['warrior', 1]], { mode: 'turns', seed: 3 });
    skipUntil(b, 'party-0');
    act(b, 'party-0', 'thorn_shield');
    let ownTurns = 0;
    let ended = false;
    for (let i = 0; i < 400 && !ended; i++) {
      const r = b.skipTurn();
      if (!r.ok) break;
      for (const e of r.events) {
        if (e.type === 'turnStart' && e.actor === 'party-0') ownTurns++;
        if (e.type === 'statusEnd' && e.target === 'party-0' && e.status === 'thorns') ended = true;
      }
    }
    expect(ended).toBe(true);
    expect(ownTurns).toBe(thorns.turns);
    expect(b.get('party-0')!.statuses.some((s) => s.kind === 'thorns')).toBe(false);
    skipUntil(b, 'enemy-0');
    const ev = act(b, 'enemy-0', meleeId, 'party-0');
    expect(ofType(ev, 'passive').some((p) => p.name === 'Thorns')).toBe(false);
  });

  it('test modunda da çalışır (durum süresi turlarla azalmaz, yansıma işler)', () => {
    const b = setup();
    act(b, 'party-0', 'thorn_shield');
    const ev = act(b, 'enemy-0', meleeId, 'party-0');
    expect(ofType(ev, 'passive').some((p) => p.name === 'Thorns')).toBe(true);
    expect(b.mode).toBe('test');
  });

  it('önizleme: kalkan miktarı ve thorns (yansıma + süre) gösterilir', () => {
    const b = setup();
    const p = previewSkill(b, 'party-0', 'thorn_shield', 'party-0')[0]!;
    const t = b.get('party-0')!;
    expect(p.shield!.amount).toBe(Math.round(attributePower(t.stats, shieldEffect.scale, f) * shieldEffect.power));
    expect(p.thorns).toEqual({ amount: Math.round(attributePower(t.stats, thorns.scale, f) * thorns.power), turns: thorns.turns });
  });

  it('skill açıklaması thorns\'u söyler', () => {
    const info = describeSkill(shieldSkill, unitDef('treant').stats, f, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.some((l) => l.startsWith('Thorns'))).toBe(true);
    expect(info.lines.some((l) => l.startsWith('Shield'))).toBe(true);
    expect(info.cooldown).toBe(`${shieldSkill.cooldown} turns`);
  });

  it('YZ: karşıda yakın dövüşçü varken dikenli kalkanı açar; zaten açıksa/cooldown\'dayken ya da yalnızca menzilli düşman varken açmaz', () => {
    const melee = arena([['warrior', 1]], [['treant', 1]], { mode: 'turns' });
    skipUntil(melee, 'enemy-0');
    expect(chooseAction(melee, 'enemy-0', ai)).toMatchObject({ skillId: 'thorn_shield', reason: 'thorns' });
    act(melee, 'enemy-0', 'thorn_shield');
    skipUntil(melee, 'enemy-0');
    expect(chooseAction(melee, 'enemy-0', ai)?.skillId).toBe('root_smash');

    // yalnızca menzilli düşmanlar: dikenli kalkan boşa gider
    for (const id of ['archer', 'mage']) expect(content.classes[id]!.skills.some((s) => skillOf(s).motion === 'melee'), id).toBe(false);
    const ranged = arena([['archer', 1], ['mage', 4]], [['treant', 1]], { mode: 'turns' });
    skipUntil(ranged, 'enemy-0');
    expect(chooseAction(ranged, 'enemy-0', ai)?.skillId).not.toBe('thorn_shield');
  });
});
