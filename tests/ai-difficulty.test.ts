import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, explainChoice, previewSkill } from '../src/engine';
import type { AiConfig, AiDifficulty, BattleMode } from '../src/engine';
import { DEFAULT_VALUE, ValueContext } from '../src/engine/ai-value';
import { aiNoise, difficultyRules } from '../src/engine/ai';

/**
 * Madde 258: Lucky Escape'in YZ/önizlemedeki ölüm ihtimali, "savaş belli"yken diriltme değeri 0, mana yakmanın "engellenen hamle" değeri (Faz 2),
 * Rest/Skip/Move'un sabit kapısız terazide olması (Faz 3) ve zorluk seviyeleri Easy/Medium/Hard (Faz 5). Sayılar veriden (ai.json) okunur.
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
const cand = (b: Battle, uid: string, skill: string, cfg: AiConfig = ai, difficulty: AiDifficulty = 'medium') => explainChoice(b, uid, cfg, { difficulty })!.candidates.filter((c) => c.skill === skill);
const ctxOf = (b: Battle, uid: string) => new ValueContext(b, b.get(uid)!, { ...DEFAULT_VALUE, ...content.aiConfig.value }, (c) => content.aiConfig.profiles[c.ai ?? 'aggressive']!.focus);

describe('madde 258: Lucky Escape önizleme ve YZ ölüm ihtimali', () => {
  it('kullanılmamış hak varken ölümcül vuruş "sure" değil "maybe"; önizleme şansı verir; YZ öldürme ihtimalini (1 - şans) ile çarpar', () => {
    const b = mk({ 0: 'archer' }, { 0: 'gambler', 1: 'warrior' });
    const g = b.get('enemy-0')!;
    g.hp = 1;
    const chance = content.formulas.primaryBonus.luck.surviveChance;
    expect(b.luckyEscapeChance(g.uid)).toBe(chance);
    const p = previewSkill(b, 'party-0', 'quick_shot', g.uid)[0]!.damage!;
    expect(p.lethal).toBe('maybe');
    expect(p.luckyEscape).toBe(chance);
    const kc = cand(b, 'party-0', 'quick_shot').find((c) => c.target === 'E0:Gambler')!.perTarget![0]!.killChance!;
    expect(kc).toBeLessThanOrEqual(1 - chance + 1e-9);
    expect(kc).toBeGreaterThan(0);
    // Luck primary olmayan hedefte şans 0, öldürme kesin
    const w = b.get('enemy-1')!;
    w.hp = 1;
    expect(b.luckyEscapeChance(w.uid)).toBe(0);
    expect(previewSkill(b, 'party-0', 'quick_shot', w.uid)[0]!.damage!.lethal).toBe('sure');
  });

  it('hak kullanılınca şans 0 olur (savaş başına bir kez)', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'gambler' });
    const g = b.get('enemy-0')!;
    g.stats.surviveChance = 1;
    g.hp = 3;
    b.debug.damageMult = 1000;
    expect(b.useSkill('party-0', 'charge', g.uid).ok).toBe(true);
    expect(g.hp).toBe(3);
    expect(b.luckyEscapeChance(g.uid)).toBe(0);
  });
});

describe('madde 258: savaş belliyse diriltme değeri 0', () => {
  it('kalan tek düşman zayıf (ufukta kesin ölüyor): outcome "win", Resurrection değeri yok ve seçilmez', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'archer', 4: 'mage' }, { 0: 'warrior' });
    b.debugKill('party-0', false);
    b.get('enemy-0')!.hp = 10;
    expect(ctxOf(b, 'party-1').outcome()).toBe('win');
    const res = cand(b, 'party-1', 'resurrection')[0]!;
    expect(res.terms?.revive).toBeUndefined();
    expect(res.notes?.some((n) => /already won/.test(n))).toBe(true);
    expect(chooseAction(b, 'party-1', ai)!.skillId).not.toBe('resurrection');
  });

  it('savaş açıkken diriltme değerlidir; kesin kayıpta (dirilenle bile) değeri 0', () => {
    const open = mk({ 0: 'warrior', 1: 'paladin', 2: 'archer', 4: 'mage' }, { 0: 'warrior', 1: 'paladin', 2: 'archer', 4: 'mage' });
    open.debugKill('party-0', false);
    open.debugKill('enemy-0', false); // 3'e 3: açık savaş
    expect(ctxOf(open, 'party-1').outcome()).toBeNull();
    expect(cand(open, 'party-1', 'resurrection')[0]!.terms!.revive).toBeGreaterThan(0);
    // Tek Paladin (az canlı), karşıda çok güçlü dört düşman: dirilen Archer da sonucu değiştirmez
    const lost = mk({ 1: 'paladin', 2: 'archer' }, { 0: 'warrior', 1: 'archer', 2: 'mage', 4: 'gambler' });
    lost.debugKill('party-1', false);
    lost.get('party-0')!.hp = 5;
    for (const e of lost.combatants.filter((c) => c.side === 'enemy')) e.maxHp = e.hp = 3000;
    expect(ctxOf(lost, 'party-0').outcome({ dmg: 30, hp: 20 })).toBe('loss');
    const res = cand(lost, 'party-0', 'resurrection')[0]!;
    expect(res.terms?.revive).toBeUndefined();
    expect(res.notes?.some((n) => /lost/.test(n))).toBe(true);
  });

  it('ek birim sonucu kesinleştiriyorsa (ancak dirilenle kazanılıyorsa) diriltme değeri sıfırlanmaz', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'warrior', 1: 'archer' });
    const ctx = ctxOf(b, 'party-1');
    expect(ctx.outcome()).toBeNull();
    expect(ctx.outcome({ dmg: 1e6, hp: 0 })).toBeNull(); // kazanç ek birimsiz kesin değil: "win" denmez
  });
});

describe('madde 258 Faz 2: mana yakmanın "engellenen hamle" değeri', () => {
  it('MP\'si az büyücüde yakılan MP daha çok hamle kaybettirir; MP\'si bol hedefte daha az; MP\'siz birimde 0', () => {
    const b = mk({ 0: 'antimage' }, { 0: 'mage', 1: 'warrior' }, 'turns');
    const ctx = ctxOf(b, 'party-0');
    const mage = b.get('enemy-0')!;
    const full = ctx.manaDenial(mage, 14);
    mage.mp = 10;
    const low = ctxOf(b, 'party-0').manaDenial(mage, 14);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(full);
    expect(ctxOf(b, 'party-0').manaDenial(mage, 28)).toBeGreaterThanOrEqual(low); // daha çok yakmak daha az değerli olamaz
    const w = b.get('enemy-1')!;
    w.maxMp = 0;
    w.mp = 0;
    expect(ctxOf(b, 'party-0').manaDenial(w, 14)).toBe(0);
  });

  it('Drain Field / Mana Steal adayının burn terimi engellenen hamle değeridir (MP\'si az büyücüde pozitif)', () => {
    const b = mk({ 0: 'antimage' }, { 0: 'mage', 1: 'paladin', 3: 'druid' }, 'turns');
    for (const e of b.combatants.filter((c) => c.side === 'enemy')) e.mp = 16; // Radiance (20 MP) iki kez yerine bir kez
    const df = Math.max(...cand(b, 'party-0', 'drain_field').map((c) => c.terms?.burn ?? 0));
    expect(df).toBeGreaterThan(0);
    const full = mk({ 0: 'antimage' }, { 0: 'mage', 1: 'paladin', 3: 'druid' }, 'turns');
    expect(Math.max(...cand(full, 'party-0', 'drain_field').map((c) => c.terms?.burn ?? 0))).toBeLessThan(df);
  });
});

describe('madde 258 Faz 3: Rest/Skip/Move sabit kapısız terazide', () => {
  it('öldürücü class hamlesinde de global değerlendirme yapılır (kapı yok); değerli hamle varken global seçilmez', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage', 1: 'warrior' }, 'turns');
    while (b.currentUid !== 'party-0') b.skipTurn();
    b.get('enemy-0')!.hp = 2;
    const ex = explainChoice(b, 'party-0', content.aiConfig)!;
    expect(ex.final?.reason).toBe('kill');
    expect(ex.global.gate).toBeUndefined();
    expect(ex.global.vNow).toBeGreaterThan(0);
    expect(['rest', 'skip_turn', 'move_tile']).not.toContain(ex.final!.skill);
  });
});

describe('madde 258 Faz 5: zorluk seviyeleri', () => {
  it('ayarlar veride: Easy ufuk 1, kurtarma/kontrol 0, en iyi 3 seçimi; Medium tam terazi (boş kural); Hard odak/fazla vurmama/bekleme', () => {
    const easy = difficultyRules(content.aiConfig, 'easy');
    expect(easy.horizon).toBe(1);
    expect(easy.value).toMatchObject({ saveWeight: 0, controlWeight: 0 });
    expect(easy.pickTop).toBe(3);
    expect(easy.globals).toBe('restWhenIdle');
    const med = difficultyRules(content.aiConfig, 'medium');
    for (const k of ['pickTop', 'focusFire', 'overkillShare', 'patience', 'killMinChance', 'value']) expect(med, k).not.toHaveProperty(k);
    const hard = difficultyRules(content.aiConfig, 'hard');
    expect(hard.focusFire).toBeGreaterThan(0);
    expect(hard.overkillShare).toBeLessThan(1);
    expect(hard.patience).toBeLessThan(1);
  });

  it('varsayılan Medium: difficulty verilmemesi ile medium aynı karar', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 30 && !b.winner; i++) {
        const u = b.currentUid!;
        expect(chooseAction(b, u, content.aiConfig, undefined, { difficulty: 'medium' })).toEqual(chooseAction(b, u, content.aiConfig));
        b.applyChoice(u, chooseAction(b, u, content.aiConfig));
      }
    }
  });

  it('Easy: belirleyici (aynı durum aynı karar), seçim her zaman en iyi 3 aday içinde; bazen en iyiden farklı; kurtarma ve kontrol terimi yok', () => {
    let differs = 0;
    let total = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 40 && !b.winner; i++) {
        const u = b.currentUid!;
        const e1 = chooseAction(b, u, ai, undefined, { difficulty: 'easy' });
        expect(chooseAction(b, u, ai, undefined, { difficulty: 'easy' })).toEqual(e1);
        const ex = explainChoice(b, u, ai, { difficulty: 'easy' })!;
        expect(ex.difficulty).toBe('easy');
        const ranked = ex.candidates.filter((c) => c.verdict !== 'blocked' && (c.score ?? 0) > 0).sort((a, b2) => (b2.score ?? 0) - (a.score ?? 0));
        for (const c of ex.candidates) {
          expect(c.terms?.save, `${c.skill} save`).toBeUndefined();
          expect(c.terms?.control, `${c.skill} control`).toBeUndefined();
        }
        if (e1 && ranked.length > 0) {
          const chosen = ex.candidates.find((c) => c.verdict === 'chosen')!;
          expect(ranked.slice(0, 3)).toContain(chosen);
          total++;
          if (chosen !== ranked[0]) differs++;
        }
        b.applyChoice(u, e1);
      }
    }
    expect(differs).toBeGreaterThan(0);
    expect(differs).toBeLessThan(total);
  });

  it('Easy: yalnızca kesin öldürme sayılır (öldürme ihtimali killMinChance altındaysa kill terimi yok)', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage', 1: 'warrior' });
    const mage = b.get('enemy-0')!;
    const d = previewSkill(b, 'party-0', 'aimed_shot', mage.uid)[0]!.damage!;
    expect(d.max - d.min).toBeGreaterThanOrEqual(2);
    mage.hp = Math.floor((d.min + d.max) / 2); // yarı yarıya öldürür
    const med = cand(b, 'party-0', 'aimed_shot').find((c) => c.target === 'E0:Mage')!;
    const easy = cand(b, 'party-0', 'aimed_shot', ai, 'easy').find((c) => c.target === 'E0:Mage')!;
    expect(med.perTarget![0]!.killChance!).toBeLessThan(content.aiConfig.difficulty!.easy!.killMinChance!);
    expect(med.terms!.kill).toBeGreaterThan(0);
    expect(easy.terms?.kill).toBeUndefined();
  });

  it('Easy: Move/Skip yok; yapacak hamle yokken Rest', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 300 && !b.winner; i++) {
        const u = b.currentUid!;
        const c = chooseAction(b, u, content.aiConfig, undefined, { difficulty: 'easy' });
        expect(['move_tile', 'skip_turn']).not.toContain(c?.skillId ?? '');
        expect(b.applyChoice(u, c).ok).toBe(true);
      }
    }
  });

  it('Hard fazla vurmama: tur başı Wither tikiyle zaten ölecek düşmana vurmanın değeri düşer (overkill), başka hedef seçilir', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage', 1: 'paladin' });
    const mage = b.get('enemy-0')!;
    mage.hp = 5;
    mage.statuses.push({ kind: 'wither', turns: 3, source: 'party-0', amount: 999 });
    const ctx = ctxOf(b, 'party-0');
    expect(ctx.dyingAnyway(mage)).toBe(true);
    expect(ctx.dyingAnyway(b.get('enemy-1')!)).toBe(false);
    const hard = cand(b, 'party-0', 'quick_shot', content.aiConfig, 'hard').find((c) => c.target === 'E0:Mage')!;
    expect(hard.terms!.overkill).toBeLessThan(0);
    const med = cand(b, 'party-0', 'quick_shot', content.aiConfig, 'medium').find((c) => c.target === 'E0:Mage')!;
    expect(med.terms?.overkill).toBeUndefined();
    expect(hard.score!).toBeLessThan(med.score!);
  });

  it('Hard uygun anı bekleme: Doom Mark hedefte 2 Omen yokken (öldürmüyorsa) patience bedeli alır; 2 Omen varken almaz', () => {
    const b = mk({ 0: 'hexer' }, { 0: 'warrior', 1: 'mage' });
    for (const e of b.combatants.filter((c) => c.side === 'enemy')) e.maxHp = e.hp = 2000;
    const doom = () => cand(b, 'party-0', 'doom_mark', ai, 'hard').find((c) => c.target === 'E0:Warrior')!;
    expect(doom().terms!.patience).toBeLessThan(0);
    b.get('enemy-0')!.statuses.push({ kind: 'omen', turns: 3, source: 'party-0', stacks: 2 });
    expect(doom().terms?.patience).toBeUndefined();
    expect(cand(b, 'party-0', 'doom_mark', ai, 'medium').find((c) => c.target === 'E0:Warrior')!.terms?.patience).toBeUndefined();
  });

  it('belirleyici gürültü: aynı savaş/tur/birim aynı sayı, [0,1) aralığında; motor RNG\'sine dokunmaz', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage' });
    const n = aiNoise(b, 'party-0');
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(1);
    expect(aiNoise(b, 'party-0')).toBe(n);
    const before = b.log.length;
    chooseAction(b, 'party-0', ai, undefined, { difficulty: 'easy' });
    expect(b.log.length).toBe(before);
  });

  it('üç seviyede de tam savaşlar biter ve her eylem geçerli (iki modda)', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
        for (let i = 0; i < 900 && !b.winner; i++) {
          const u = b.currentUid!;
          expect(b.applyChoice(u, chooseAction(b, u, content.aiConfig, undefined, { difficulty })).ok, `${difficulty} ${seed}`).toBe(true);
        }
        expect(b.winner, `${difficulty} seed ${seed}`).not.toBeNull();
      }
      // test modu (sırasız): her birim için geçerli bir karar
      const t = new Battle(content.battleSetup('random-battle', 1, 'test'));
      for (const c of t.combatants) {
        const ch = chooseAction(t, c.uid, content.aiConfig, undefined, { difficulty });
        if (ch) expect((t.globalDef(ch.skillId) ? t.canUseGlobal(c.uid, ch.skillId, ch.slot) : t.canUse(c.uid, ch.skillId)).ok, `${difficulty} test ${c.uid}`).toBe(true);
      }
    }
  });
});
