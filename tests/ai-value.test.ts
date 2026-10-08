import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, explainChoice } from '../src/engine';
import type { AiConfig, BattleMode } from '../src/engine';
import { DEFAULT_VALUE, ValueContext } from '../src/engine/ai-value';

/**
 * YZ DEĞER TERAZİSİ (madde 254 kararları K1-K10, madde 257; docs/design/ai-priorities.md 6-7): her aday TEK sayıyla puanlanır, en büyüğü seçilir.
 * Senaryolar ai-priorities.md 3. bölümdeki "en kötü 5 karar"ın düzeldiğini kanıtlar. Sayılar veriden (skills.json, ai.json > value) okunur.
 */
const ai: AiConfig = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test'): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells(party), enemies: cells(enemies) }, false));
  b.debugClearCooldowns();
  for (const c of b.combatants) {
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    Object.assign(c.stats, { critChance: 0 });
  }
  return b;
}
const cand = (b: Battle, uid: string, skill: string, cfg: AiConfig = ai) => explainChoice(b, uid, cfg)!.candidates.filter((c) => c.skill === skill);
const top = (list: Array<{ score?: number }>) => Math.max(...list.map((c) => c.score ?? -Infinity));

describe('terazi: ayarlar ve genel kurallar', () => {
  it('ayarlar veride (ai.json > value), ufuk Ömer kararıyla 3 tur; zorluk seviyeleri tanımlı (madde 258: davranış farkı tests/ai-difficulty.test.ts)', () => {
    expect(content.aiConfig.value).toBeDefined();
    expect(content.aiConfig.value!.horizon).toBe(3);
    for (const k of Object.keys(DEFAULT_VALUE)) expect(content.aiConfig.value, k).toHaveProperty(k);
    expect(Object.keys(content.aiConfig.difficulty ?? {}).sort()).toEqual(['easy', 'hard', 'medium']);
  });

  it('zorluk girdisi verilmezse Medium (tam terazi); açık seçik en iyi hamlede üç seviye de aynı hamleyi seçer', () => {
    const b = mk({ 0: 'mage', 1: 'warrior' }, { 0: 'warrior', 1: 'warrior', 3: 'warrior' });
    const base = chooseAction(b, 'party-0', ai);
    expect(chooseAction(b, 'party-0', ai, undefined, { difficulty: 'medium' })).toEqual(base);
    for (const difficulty of ['easy', 'hard'] as const) expect(chooseAction(b, 'party-0', ai, undefined, { difficulty })?.skillId).toBeDefined();
  });

  it('seçilen aday her zaman en yüksek puanlıdır; puan terimlerin toplamıdır (açıklama ile karar aynı)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 40 && !b.winner; i++) {
        const u = b.currentUid!;
        const ex = explainChoice(b, u, ai)!;
        const chosen = ex.candidates.find((c) => c.verdict === 'chosen');
        if (chosen) {
          expect(chosen.score).toBe(top(ex.candidates.filter((c) => c.verdict !== 'blocked')));
          const sum = Object.values(chosen.terms ?? {}).reduce((a, v) => a + v, 0);
          expect(Math.abs(sum - chosen.score!)).toBeLessThan(0.2);
        }
        b.applyChoice(u, chooseAction(b, u, ai));
      }
    }
  });

  it('belirleyici: aynı durum aynı karar, savaş durumu değişmez; iki modda tam savaşlar biter', () => {
    for (const mode of ['test', 'turns'] as const) {
      const b = mk({ 0: 'warrior', 1: 'paladin', 4: 'mage' }, { 0: 'defender', 1: 'hexer', 4: 'undead' }, mode);
      const before = JSON.stringify(b.combatants);
      const u = mode === 'turns' ? b.currentUid! : 'party-0';
      expect(chooseAction(b, u, ai)).toEqual(chooseAction(b, u, ai));
      expect(JSON.stringify(b.combatants)).toBe(before);
    }
    for (let seed = 1; seed <= 8; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 800 && !b.winner; i++) {
        const u = b.currentUid!;
        expect(b.applyChoice(u, chooseAction(b, u, content.aiConfig)).ok).toBe(true);
      }
      expect(b.winner).not.toBeNull();
    }
  });

  it('öldürme ihtimali gerçek ihtimal (O2): kalkan hasarı emiyorsa öldürme terimi yok; isabet/zar yetiyorsa 1\'e yakın', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage', 1: 'warrior' });
    b.get('enemy-0')!.hp = 2;
    const sure = cand(b, 'party-0', 'quick_shot').find((c) => c.target === 'E0:Mage')!;
    expect(sure.terms!.kill).toBeGreaterThan(0);
    expect(sure.perTarget![0]!.killChance).toBeGreaterThan(0.5);
    b.get('enemy-0')!.shield = 500;
    expect(cand(b, 'party-0', 'quick_shot').find((c) => c.target === 'E0:Mage')!.terms!.kill).toBeUndefined();
  });

  it('K2: dostu öldürecek düşmanı öldürmek kurtarma değeri kazanır (save); öldürülen başka biriyse kazanmaz', () => {
    const b = mk({ 0: 'archer', 4: 'mage' }, { 0: 'warrior', 4: 'archer' });
    const mage = b.get('party-1')!;
    mage.hp = 5; // düşman Archer (en az canlıyı vurur) Mage'i öldürecek
    b.get('enemy-1')!.hp = 3; // düşman Archer
    b.get('enemy-0')!.hp = 3; // düşman Warrior (Mage'e ulaşamaz: arkada; Charge'a MP yok)
    b.get('enemy-0')!.mp = 0;
    const ex = explainChoice(b, 'party-0', ai)!;
    const killArcher = ex.candidates.find((c) => c.skill === 'quick_shot' && c.target === 'E1:Archer')!;
    const killWarrior = ex.candidates.find((c) => c.skill === 'quick_shot' && c.target === 'E0:Warrior')!;
    expect(killArcher.terms!.save).toBeGreaterThan(0);
    expect(killWarrior.terms?.save).toBeUndefined();
    expect(ex.candidates.find((c) => c.verdict === 'chosen')!.kills).toContain('E1:Archer'); // seçilen hamle tehdidi (Archer'ı) öldürür
  });

  it('K8: kontrol etkileri değere girer (Stun, Slow, Haste, Wound)', () => {
    const b = mk({ 0: 'warrior', 1: 'defender', 2: 'archer', 3: 'druid' }, { 0: 'mage', 1: 'archer', 2: 'paladin' });
    expect(cand(b, 'party-0', 'charge').some((c) => (c.terms?.control ?? 0) > 0)).toBe(true); // Stun
    expect(cand(b, 'party-1', 'tremor_slam').some((c) => (c.terms?.control ?? 0) > 0)).toBe(true); // Slow
    expect(cand(b, 'party-2', 'quick_shot').some((c) => (c.terms?.control ?? 0) > 0)).toBe(true); // Haste (kendine)
    expect(cand(b, 'party-3', 'thorn_whip').some((c) => (c.terms?.control ?? 0) > 0)).toBe(true); // Wound (düşmanda şifacı var)
    // zaten taşıdığı durumu tekrar uygulamanın değeri yok
    for (const e of b.combatants.filter((c) => c.side === 'enemy')) e.statuses.push({ kind: 'stun', turns: 9, source: 'x' });
    expect(cand(b, 'party-0', 'charge').every((c) => (c.terms?.control ?? 0) === 0)).toBe(true);
  });
});

describe('en kötü 5 karar (ai-priorities.md 3. bölüm) düzeldi', () => {
  it('#1 Mage tam canlı ekipte Mana Barrier yerine Meteor (alan 3 düşman)', () => {
    const b = mk({ 0: 'mage', 1: 'warrior', 2: 'archer' }, { 0: 'warrior', 1: 'warrior', 3: 'warrior' });
    const choice = chooseAction(b, 'party-0', ai)!;
    expect(choice.skillId).toBe('meteor');
    expect(top(cand(b, 'party-0', 'mana_barrier'))).toBeLessThan(top(cand(b, 'party-0', 'meteor')));
  });

  it('#2 Whirlwind tek düşmana atılmaz (Double Strike / Charge daha değerli); 3 ön sıra düşmanında atılır', () => {
    const one = mk({ 0: 'warrior' }, { 0: 'mage' });
    expect(chooseAction(one, 'party-0', ai)!.skillId).not.toBe('whirlwind');
    expect(top(cand(one, 'party-0', 'whirlwind'))).toBeLessThan(top(cand(one, 'party-0', 'melee_attack')));
    const three = mk({ 0: 'warrior' }, { 0: 'warrior', 1: 'warrior', 2: 'warrior' });
    three.get('party-0')!.statuses.push({ kind: 'slow', turns: 0, source: 'x' });
    for (const e of three.combatants.filter((c) => c.side === 'enemy')) e.statuses.push({ kind: 'stun', turns: 9, source: 'x' }); // Charge'ın Stun'ı değersiz
    expect(chooseAction(three, 'party-0', ai)!.skillId).toBe('whirlwind');
  });

  it('#3 Abyssal Cry (madde 262: saldırı buffı): tek düşman bu vuruşla ölecekse seçilmez; bir sonraki turundan önce ölecekse değeri 0 ya da altı', () => {
    const one = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage' });
    one.get('party-0')!.rage = one.get('party-0')!.maxRage;
    one.get('enemy-0')!.hp = 3;
    expect(chooseAction(one, 'party-0', ai)!.skillId).not.toBe('abyssal_cry');
    const low = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler' });
    low.get('party-0')!.rage = low.get('party-0')!.maxRage;
    low.get('party-0')!.hp = Math.max(1, Math.round(low.get('party-0')!.maxHp * 0.05));
    expect(top(cand(low, 'party-0', 'abyssal_cry'))).toBeLessThanOrEqual(0);
  });

  it('#4 Dark Bond değeri gerçek çalınabilir canla sınırlı: Undead tam canlıyken küçük; 3 kümeli düşmanda Wail kazanır', () => {
    const b = mk({ 0: 'warrior', 4: 'undead' }, { 0: 'warrior', 1: 'warrior', 3: 'warrior' });
    b.get('party-0')!.hp = Math.round(b.get('party-0')!.maxHp * 0.5);
    const u = b.get('party-1')!;
    u.skills = u.skills.filter((s) => s !== 'raise_dead');
    const bond = cand(b, u.uid, 'dark_bond')[0]!;
    const ratio = (content.skills.dark_bond!.effects.find((e) => e.type === 'bond') as { ratio: number }).ratio;
    // madde 258: bağ süresince Undead'in yiyeceği beklenen hasar (en çok canı kadar) da çalınabilir pay açar
    const round = new ValueContext(b, u, { ...DEFAULT_VALUE, ...content.aiConfig.value }, (c) => content.aiConfig.profiles[c.ai ?? 'aggressive']!.focus).round.get(u.uid) ?? 0;
    const room = Math.min(u.hp, round * 3);
    const cap = (u.maxHp - u.hp + room + u.maxHp * content.aiConfig.profiles.darkmage!.bondSelfFloor!) * ratio + 0.5;
    expect(bond.bond ?? 0).toBeLessThanOrEqual(cap);
    expect(chooseAction(b, u.uid, ai)!.skillId).toBe('wail_of_the_dead');
  });

  it('#5 Defender düşük canda: kimse tehlikede değilken Taunt/Guard yok; ölmek üzere olan dostu için kendini feda eder (K6)', () => {
    const big = mk({ 0: 'defender', 1: 'warrior', 2: 'archer', 4: 'mage', 5: 'paladin' }, { 0: 'warrior', 1: 'archer', 2: 'mage' });
    big.get('party-0')!.hp = Math.round(big.get('party-0')!.maxHp * 0.1);
    expect(['taunt', 'guard']).not.toContain(chooseAction(big, 'party-0', ai)!.skillId);
    const two = mk({ 0: 'defender', 4: 'mage' }, { 0: 'warrior', 1: 'archer', 2: 'cutthroat' });
    two.get('party-0')!.hp = Math.round(two.get('party-0')!.maxHp * 0.3);
    two.get('party-1')!.hp = Math.round(two.get('party-1')!.maxHp * 0.25);
    const choice = chooseAction(two, 'party-0', ai)!;
    expect(choice.skillId).toBe('taunt');
    const t = cand(two, 'party-0', 'taunt')[0]!;
    expect(t.terms!.protect).toBeGreaterThan(0);
  });
});

describe('destek değerleri: ufuk 3 tur ve tur sayacı (Ömer, madde 257)', () => {
  it('dirilen 0 sayaçla başlar: ufuktaki tur sayısı dolu sayaçlı yaşayan dosttan az', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'archer' }, { 0: 'warrior' }, 'turns');
    const actor = b.get('party-1')!;
    const ctx = new ValueContext(b, actor, DEFAULT_VALUE, () => 'lowest_ratio');
    const w = b.get('party-0')!;
    w.turnCounter = content.formulas.turn.threshold - 1;
    expect(ctx.turnsWithin(w, 0)).toBeLessThan(ctx.turnsWithin(w));
    expect(ctx.contribution(w, 0)).toBeLessThan(ctx.contribution(w));
  });

  it('düşmanın sıradaki hamlesi tahmin edilir (odak kuralıyla): en az canlı dosta vuracak Archer tehlike yaratır', () => {
    const b = mk({ 0: 'warrior', 4: 'mage', 5: 'paladin' }, { 0: 'archer' });
    b.get('party-1')!.hp = 6;
    const ctx = new ValueContext(b, b.get('party-2')!, DEFAULT_VALUE, (c) => content.aiConfig.profiles[c.ai ?? 'aggressive']!.focus);
    expect(ctx.intents[0]!.target).toBe('party-1');
    expect(ctx.inDanger(b.get('party-1')!)).toBe(true);
    expect(ctx.inDanger(b.get('party-0')!)).toBe(false);
  });

  it('K7 / Faz 4: Skeleton\'ın vurabileceği yuva yoksa (ön sıra dolu) Raise Dead\'in çağrı değeri 0; ön sıradaki dost ölünce cesedinin üstüne çağrılır', () => {
    const b = mk({ 0: 'warrior', 1: 'defender', 2: 'paladin', 4: 'undead' }, { 0: 'warrior', 1: 'archer' });
    b.debugKill('enemy-1', false);
    const raise = cand(b, 'party-3', 'raise_dead')[0]!;
    expect(raise.terms?.summon ?? 0).toBe(0);
    expect(chooseAction(b, 'party-3', ai)!.skillId).not.toBe('raise_dead');
    b.debugKill('party-0', false); // ön sıradaki Warrior düştü: cesedinin hücresi (0) çağrıya açık
    const after = cand(b, 'party-3', 'raise_dead')[0]!;
    expect(after.summonSlot).toBe(0);
    expect(after.terms!.summon).toBeGreaterThan(0);
  });
});
