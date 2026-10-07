import { describe, expect, it } from 'vitest';
import { Battle, attributePower, chooseAction, content, damageRange, damageSpecFor, describeSkill, previewSkill } from '../src/engine';
import type { Attribute, BattleEvent, BattleMode, CombatantDef } from '../src/engine';

// Çağrılan birimlerin skill'leri: Skeleton - Bone Slash (hedefin yanındakilere de vurur); Treant (madde 222) - uzak menzilli Root Smash ve
// 2x2 alan skill'i Vine Snare (hasar + her hedefe bağımsız %25 Stun şansı). Eski Thorn Shield / thorns kaldırıldı.
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
    expect(unitDef('treant').skills).toEqual(['root_smash', 'vine_snare']);
    for (const def of Object.values(content.summons)) for (const id of def.skills) expect(content.skills[id], `${def.id}:${id}`).toBeDefined();
  });

  it('class\'lar hâlâ tam 4 skill, çağrılanlar 1-4 arası (çağrılan için tam-4 kuralı yok)', () => {
    for (const def of Object.values(content.classes)) expect(def.skills, def.id).toHaveLength(4);
    for (const def of Object.values(content.summons)) {
      expect(def.skills.length).toBeGreaterThanOrEqual(1);
      expect(def.skills.length).toBeLessThanOrEqual(4);
    }
  });

  it('Treant uzak menzilli alan kontrolcüsü profilini (vinewarden) kullanır; eski thorny profili yok', () => {
    expect(unitDef('treant').ai).toBe('vinewarden');
    expect(ai.profiles.vinewarden).toBeDefined();
    expect(ai.profiles.thorny).toBeUndefined();
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

describe('Treant (madde 222): uzak menzilli doğa kontrolcüsü', () => {
  const smash = skillOf('root_smash');
  const vines = skillOf('vine_snare');
  const smashDmg = smash.effects.find((e) => e.type === 'damage')!;
  if (smashDmg.type !== 'damage') throw new Error('hasar yok');
  /** Eski Root Smash ham hasarı (Str 13,5 x güç 1,15): yeni Int ölçeği bu çıktıyı KORUMALI (Ömer kararı, madde 222). */
  const OLD_ROOT_SMASH_RAW = 13.5 * 1.15;
  const sureVines = () => ({ ...vines, effects: vines.effects.map((e) => (e.type === 'status' ? { ...e, chance: 1 } : e)) });

  it('statlar: Int ağırlıklı (en yüksek stat Int), can ve ömür korunur; Root Smash Int ölçekli ve eski ham hasarla aynı', () => {
    const t = unitDef('treant');
    const a = t.attributes;
    expect((Object.keys(a) as Attribute[]).reduce((m, k) => (a[k] > a[m] ? k : m))).toBe('int');
    expect(smashDmg.scale).toBe('int');
    expect(attributePower(t.stats, smashDmg.scale, f) * smashDmg.power).toBeCloseTo(OLD_ROOT_SMASH_RAW, 6);
    expect(t.stats.hp).toBeGreaterThanOrEqual(100); // dayanıklı ağaç
    expect(content.skills.summon_treant!.effects.find((e) => e.type === 'summon')).toMatchObject({ unit: 'treant', lifespan: 3 });
  });

  it('Root Smash uzak menzilli (havadan): melee değil, reach yok, arka sıradaki düşmana da vurur; Treant arka sıradan kullanabilir', () => {
    expect(smash.motion).not.toBe('melee');
    expect(smash.reach).toBeUndefined();
    const b = arena([['warrior', 0], ['treant', 9]], [['warrior', 0], ['mage', 9]]);
    expect(b.canUse('party-1', 'root_smash').ok).toBe(true);
    expect(b.validTargets('party-1', 'root_smash').map((c) => c.uid)).toContain('enemy-1'); // en arka sıra
    expect(hitUids(act(b, 'party-1', 'root_smash', 'enemy-1'))).toEqual(['enemy-1']);
  });

  it('Vine Snare verisi: 2x2 alan (sol-alt anchor), 0 MP, cooldown 3, Int ölçekli doğa hasarı + %25 Stun (1 tur, cause vines)', () => {
    expect(vines.target).toBe('area_enemies');
    expect(vines.area).toMatchObject({ shape: 'rect', rows: 2, cols: 2, anchor: 'bottom_left' });
    expect(vines.cost.amount).toBe(0);
    expect(vines.cooldown).toBe(3);
    expect(vines.effects.find((e) => e.type === 'damage')).toMatchObject({ scale: 'int', element: 'nature' });
    expect(vines.effects.find((e) => e.type === 'status')).toMatchObject({ status: 'stun', turns: 1, chance: 0.25, cause: 'vines' });
  });

  /** 4 düşman: Vine Snare'in anchor 0'daki 2x2 hücrelerine. */
  const vineArena = (seed: number, mode: BattleMode = 'test', overrides?: Record<string, import('../src/engine').SkillDef>) => {
    const probe = arena([['treant', 9]], [['warrior', 0]], { seed });
    const cells = probe.areaCells('vine_snare', 0, 'enemy');
    const b = arena([['treant', 9]], cells.map((s): Placed => ['mage', s]), { seed, mode, ...(overrides ? { overrides } : {}) });
    return { b, cells };
  };

  it('2x2 şekil: tam 4 hücre, şekildeki 4 düşmanın hepsi vurulur; skillUsed.cells şekil hücreleri', () => {
    const { b, cells } = vineArena(1);
    expect(cells).toHaveLength(4);
    const ev = act(b, 'party-0', 'vine_snare', 'enemy-0');
    expect(ofType(ev, 'skillUsed')[0]!.cells).toEqual(cells);
    expect(new Set(hitUids(ev)).size).toBe(4);
  });

  it('Stun zarı her hedef için BAĞIMSIZ %25: 1000 atışta hedef başına oran ~%25, iki hedefin birlikte ~%6,25; olayda cause vines', () => {
    const chance = 0.25;
    let stuns = 0;
    let both = 0;
    let causeOk = true;
    const casts = 1000;
    for (let seed = 1; seed <= casts; seed++) {
      const { b } = vineArena(seed);
      const ev = act(b, 'party-0', 'vine_snare', 'enemy-0');
      const st = ofType(ev, 'status').filter((e) => e.status === 'stun');
      if (st.some((e) => e.cause !== 'vines')) causeOk = false;
      stuns += st.length;
      const got = new Set(st.map((e) => e.target));
      if (got.has('enemy-0') && got.has('enemy-1')) both++;
    }
    expect(causeOk).toBe(true);
    const rate = stuns / (casts * 4);
    expect(rate).toBeGreaterThan(chance - 0.03);
    expect(rate).toBeLessThan(chance + 0.03);
    expect(both / casts).toBeGreaterThan(chance * chance - 0.025);
    expect(both / casts).toBeLessThan(chance * chance + 0.025);
  });

  it('iska eden hedefe Stun gelmez (yalnızca vurulanlar); şans 1 iken vurulan herkes yere bağlanır', () => {
    const { b } = vineArena(3, 'test', { vine_snare: sureVines() });
    b.debug.dodge = 'always';
    expect(ofType(act(b, 'party-0', 'vine_snare', 'enemy-0'), 'status')).toHaveLength(0);
    const t = vineArena(3, 'test', { vine_snare: sureVines() }).b;
    expect(ofType(act(t, 'party-0', 'vine_snare', 'enemy-0'), 'status').filter((e) => e.status === 'stun' && e.cause === 'vines')).toHaveLength(4);
  });

  it('Stun kuralları geçerli: taunt\'ı bozar; 1 turluk Stun Resilience ile kısalmaz (zar da atılmaz)', () => {
    const probe = arena([['treant', 9]], [['defender', 0]]);
    const cells = probe.areaCells('vine_snare', 0, 'enemy');
    const b = arena([['treant', 9]], [['defender', cells[0]!], ['warrior', cells[1]!]], { overrides: { vine_snare: sureVines() } });
    act(b, 'enemy-0', 'taunt');
    b.get('enemy-1')!.stats.resilience = 1; // her zaman tutacak Resilience
    const ev = act(b, 'party-0', 'vine_snare', 'enemy-0');
    expect(ofType(ev, 'statusEnd').some((e) => e.target === 'enemy-0' && e.status === 'taunt' && e.broken)).toBe(true);
    expect(ofType(ev, 'passive').some((e) => e.name === 'Resilience')).toBe(false);
    expect(b.get('enemy-1')!.statuses.find((s) => s.kind === 'stun')!.turns).toBe(1);
  });

  it('turns modunda cooldown (veriden); iki mod çalışır ve aynı seed = aynı olaylar', () => {
    const { b } = vineArena(4, 'turns');
    skipUntil(b, 'party-0');
    act(b, 'party-0', 'vine_snare', 'enemy-0');
    expect(b.get('party-0')!.cooldowns.vine_snare).toBe(vines.cooldown);
    for (const mode of ['test', 'turns'] as const) {
      const run = () => {
        const x = vineArena(7, mode).b;
        if (mode === 'turns') skipUntil(x, 'party-0');
        return JSON.stringify(act(x, 'party-0', 'vine_snare', 'enemy-0'));
      };
      expect(run()).toBe(run());
    }
  });

  it('önizleme ve açıklama: Stun şansı yazılır', () => {
    const { b } = vineArena(1);
    const p = previewSkill(b, 'party-0', 'vine_snare', 'enemy-0');
    expect(p).toHaveLength(4);
    expect(p[0]!.statuses!.some((s) => s.includes('25% chance'))).toBe(true);
    const info = describeSkill(vines, unitDef('treant').stats, f, content.summons, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.some((l) => l.includes('25% chance') && l.includes('Stun'))).toBe(true);
    expect(info.cooldown).toBe(`${vines.cooldown} turns`);
  });

  it('YZ (vinewarden): 2x2 en az 2 düşmanı kapsıyorsa Vine Snare; tek düşmanda Root Smash; Vine Snare cooldown\'dayken Root Smash', () => {
    const many = vineArena(2, 'turns').b;
    skipUntil(many, 'party-0');
    expect(chooseAction(many, 'party-0', ai)?.skillId).toBe('vine_snare');
    act(many, 'party-0', 'vine_snare', 'enemy-0');
    skipUntil(many, 'party-0');
    expect(chooseAction(many, 'party-0', ai)?.skillId).toBe('root_smash');
    const one = arena([['treant', 9]], [['mage', 0]], { mode: 'turns' });
    skipUntil(one, 'party-0');
    expect(chooseAction(one, 'party-0', ai)?.skillId).toBe('root_smash');
  });
});

