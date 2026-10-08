import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, explainChoice, previewSkill } from '../src/engine';
import type { AiConfig, BattleSetup } from '../src/engine';

/**
 * Yapay zeka bağlam testleri: her 4. skill (ve Judgment) için "değerliyse seçilir, değilse seçilmez". Madde 257'den beri karar TEK DEĞER TERAZİSİ
 * (src/engine/ai-value.ts): skill `ai` ipuçlarının requires/anyOf koşulları seçimi engellemez (yalnızca reserveMp sürer); beklentiler terazinin
 * sonucudur. Karar saf ve belirleyicidir.
 */
/** Bağlam kuralları global skill'siz YZ ile ölçülür (global skill kuralları: tests/ai-global.test.ts). */
const ai: AiConfig = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');

/** Hücre listeli takımlarla savaş (uid'ler slot sırasıyla party-0.., enemy-0..); canlar en az 100, aktörün MP'si dolu. */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: 'turns' | 'test' = 'test', tweak?: (s: BattleSetup) => void): Battle {
  const setup = content.battleSetup('random-battle', 1, mode, { party: cells(party), enemies: cells(enemies) }, false);
  tweak?.(setup);
  const b = new Battle(setup);
  b.debugClearCooldowns();
  for (const c of b.combatants) {
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    Object.assign(c.stats, { evasion: 0 });
  }
  return b;
}
const ENEMY_FRONT_TRIO = { 0: 'warrior', 3: 'warrior', 1: 'warrior' }; // yan yana + arkada: Meteor/Judgment alanı en az 2 kişiyi kapsar
const choose = (b: Battle, uid = 'party-0') => chooseAction(b, uid, ai);

describe('YZ bağlam: Mage - Meteor', () => {
  it('alan en az 2 düşmanı vuruyorsa Meteor seçilir (vurulanların toplamı en yüksek değer)', () => {
    const b = mk({ 0: 'mage' }, ENEMY_FRONT_TRIO);
    expect(choose(b)).toMatchObject({ skillId: 'meteor', reason: 'aoe' });
  });

  it('tek düşman varken (öldürmüyorsa) Meteor seçilmez', () => {
    const b = mk({ 0: 'mage' }, { 0: 'warrior' });
    const choice = choose(b);
    expect(choice?.skillId).toBeDefined();
    expect(choice?.skillId).not.toBe('meteor');
  });
});

describe('YZ bağlam: Archer - Aimed Shot', () => {
  it('zırhlı, yüksek canlı hedefe (Defender) Aimed Shot seçilir', () => {
    const b = mk({ 0: 'archer' }, { 0: 'defender' });
    expect(choose(b)).toMatchObject({ skillId: 'aimed_shot', targetUid: 'enemy-0' });
  });

  it('turns modunda ultimate\'a küçük cooldown bedeli eklenir (K5); test modunda yok', () => {
    const t = mk({ 0: 'archer' }, { 0: 'mage' }, 'turns');
    while (t.currentUid !== 'party-0') t.skipTurn();
    t.get('party-0')!.cooldowns = {};
    t.get('party-0')!.mp = t.get('party-0')!.maxMp;
    const aimed = explainChoice(t, 'party-0', ai)!.candidates.find((c) => c.skill === 'aimed_shot')!;
    expect(aimed.terms!.cooldown).toBeLessThan(0);
    const free = explainChoice(t, 'party-0', ai)!.candidates.find((c) => c.skill === 'quick_shot')!;
    expect(free.terms!.cooldown).toBeUndefined();
    const test = explainChoice(mk({ 0: 'archer' }, { 0: 'mage' }), 'party-0', ai)!.candidates.find((c) => c.skill === 'aimed_shot')!;
    expect(test.terms!.cooldown).toBeUndefined();
  });

  it('öldürebiliyorsa Aimed Shot da aday (bağlam: kill)', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage' });
    const mage = b.get('enemy-0')!;
    mage.stats.armor = 0;
    const avg = previewSkill(b, 'party-0', 'aimed_shot', 'enemy-0')[0]!.damage!.avg;
    // Yalnızca Aimed Shot'un öldürebildiği can: Quick Shot, Piercing Arrow bu canı geçemez
    const others = ['quick_shot', 'piercing_arrow'].map((id) => previewSkill(b, 'party-0', id, 'enemy-0')[0]!.damage!.avg);
    mage.hp = Math.min(avg, Math.max(...others) + 1);
    if (mage.hp > Math.max(...others) && mage.hp <= avg) expect(choose(b)).toMatchObject({ skillId: 'aimed_shot', reason: 'kill' });
  });
});

describe('YZ bağlam: Defender - Fist Crush', () => {
  const taunting = (b: Battle) => b.get('party-0')!.statuses.push({ kind: 'taunt', turns: 3, source: 'party-0' });

  it('karşıda en az 3 düşman varsa Fist Crush seçilir (Tremor Slam\'in Slow\'u zaten varken)', () => {
    const b = mk({ 0: 'defender', 1: 'warrior' }, { 0: 'warrior', 1: 'mage', 2: 'archer', 4: 'druid' });
    taunting(b); // Taunt zaten açık
    for (const e of b.combatants.filter((c) => c.side === 'enemy')) e.statuses.push({ kind: 'slow', turns: 9, source: 'x' }); // Slow değeri yok
    expect(choose(b)).toMatchObject({ skillId: 'fist_crush' });
  });

  it('karşıda 3\'ten az düşman varsa seçilmez', () => {
    const b = mk({ 0: 'defender', 1: 'warrior' }, { 0: 'warrior', 1: 'mage' });
    taunting(b);
    expect(choose(b)?.skillId).not.toBe('fist_crush');
  });
});

describe('YZ bağlam: Paladin - Radiance / Judgment', () => {
  it('yaralı bir dost ve düşman varken Radiance seçilir', () => {
    const b = mk({ 0: 'paladin', 1: 'warrior' }, { 0: 'warrior', 1: 'mage' });
    const hurt = b.get('party-1')!;
    hurt.hp = Math.round(hurt.maxHp * 0.6); // Radiance eşiği (0,7) altında, şifa önceliği (0,55) üstünde: bağlamsal
    expect(choose(b)).toMatchObject({ skillId: 'radiance' });
  });

  it('dostlar sağlamken Radiance seçilmez', () => {
    const b = mk({ 0: 'paladin', 1: 'warrior' }, { 0: 'warrior', 1: 'mage' });
    expect(choose(b)?.skillId).not.toBe('radiance');
  });

  it('kümelenmiş düşmana (alanda en az 2) Judgment seçilir; tek düşmana seçilmez', () => {
    const many = mk({ 0: 'paladin', 1: 'warrior' }, ENEMY_FRONT_TRIO);
    expect(choose(many)).toMatchObject({ skillId: 'judgment' });
    const one = mk({ 0: 'paladin', 1: 'warrior' }, { 0: 'warrior' });
    expect(choose(one)?.skillId).not.toBe('judgment');
  });
});

describe('YZ bağlam: Druid - Summon Treant, Undead - Raise Dead (çağrı)', () => {
  it('Druid: Treant yokken ve MP yeterliyken çağırır; varken çağırmaz', () => {
    const b = mk({ 0: 'druid', 1: 'warrior' }, { 0: 'warrior', 1: 'mage' });
    expect(choose(b)).toMatchObject({ skillId: 'summon_treant', reason: 'summon' });
    expect(b.useSkill('party-0', 'summon_treant').ok).toBe(true);
    b.get('party-0')!.mp = b.get('party-0')!.maxMp;
    expect(choose(b)?.skillId).not.toBe('summon_treant');
  });

  it('Druid: MP yetmiyorsa çağırmaz', () => {
    const b = mk({ 0: 'druid', 1: 'warrior' }, { 0: 'warrior', 1: 'mage' });
    b.get('party-0')!.mp = content.skills.summon_treant!.cost.amount - 1;
    expect(choose(b)?.skillId).not.toBe('summon_treant');
  });

  it('Undead: iskelet yokken, tüketilecek düşman cesedi ve kendi tahtasında boş yer varsa Raise Dead; iskelet varken ya da boş yer yokken değil (madde 222)', () => {
    const b = mk({ 0: 'undead', 1: 'warrior' }, { 0: 'warrior', 1: 'mage', 2: 'archer' });
    b.debugKill('enemy-2', false); // tüketilebilir düşman cesedi -> beslenmiş çağrı
    expect(choose(b)).toMatchObject({ skillId: 'raise_dead', reason: 'summon', corpseUid: 'enemy-2' });
    expect(b.applyChoice('party-0', choose(b)).ok).toBe(true); // YZ seçimi ceseti ve yuvayı taşır (madde 230)
    b.get('party-0')!.mp = b.get('party-0')!.maxMp;
    expect(choose(b)?.skillId).not.toBe('raise_dead');
    // Kendi tahtası dolu: iskelet açılamaz (artık kendi tarafına çağrılıyor)
    const full = mk(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, i === 0 ? 'undead' : 'warrior'])), { 0: 'warrior', 1: 'mage' });
    expect(full.canUse('party-0', 'raise_dead')).toEqual({ ok: false, reason: 'No free slot' });
    expect(choose(full)?.skillId).not.toBe('raise_dead');
  });
});

describe('YZ bağlam: Gambler - All In', () => {
  const gambler = (mpRatio: number, turns: number, enemies: Record<number, string> = { 0: 'defender', 1: 'warrior' }) => {
    const b = mk({ 0: 'gambler', 1: 'warrior' }, enemies);
    const g = b.get('party-0')!;
    g.mp = Math.round(g.maxMp * mpRatio);
    b.turnsTaken = turns;
    return b;
  };
  const longBattle = () => 11; // (eski minBattleTurns 10 ipucu madde 258'de silindi; terazi savaş turuna bakmaz)

  it('MP yüksek ve savaş uzadıysa All In seçilir', () => {
    expect(choose(gambler(1, longBattle()))).toMatchObject({ skillId: 'all_in' });
  });

  it('MP düşükken seçilmez (bahis küçük kalır)', () => {
    const low = (content.skills.all_in!.ai!.reserveMinMpRatio ?? 0.6) - 0.2;
    expect(choose(gambler(low, longBattle()))?.skillId).not.toBe('all_in');
  });

  it('MP bahsinin beklenen kaybı bedele eklenir (terazi: bahis değeri kendinden; savaş turu koşulu yok)', () => {
    const ex = explainChoice(gambler(1, 0), 'party-0', ai)!;
    const allIn = ex.candidates.find((c) => c.skill === 'all_in')!;
    expect(allIn.cost).toBeGreaterThan(content.skills.all_in!.cost.amount * ai.profiles.gambler!.mpCostWeight);
  });
});

describe('YZ bağlam: Anti-Mage - Void Strike', () => {
  it('hedefin manası eksikse (mana yakılmış) Void Strike seçilir; mana doluyken seçilmez', () => {
    const drained = mk({ 0: 'antimage' }, { 0: 'mage' });
    drained.get('enemy-0')!.hp = drained.get('enemy-0')!.maxHp = 5000; // mana yakılmış hedef öldürülmesin: bağlam "tactic" olarak sınanır
    drained.get('enemy-0')!.mp = 0;
    expect(choose(drained)).toMatchObject({ skillId: 'void_strike' });
    const full = mk({ 0: 'antimage' }, { 0: 'mage' });
    full.get('enemy-0')!.hp = full.get('enemy-0')!.maxHp = 5000;
    // madde 258: eski minMissingManaShare ipucu silindi; terazide mana doluyken Void Strike'ın değeri belirgin düşük (eksik mana eki yok)
    const vs = (b: Battle) => Math.max(...explainChoice(b, 'party-0', ai)!.candidates.filter((c) => c.skill === 'void_strike').map((c) => c.score ?? 0));
    expect(vs(full)).toBeLessThan(vs(drained) * 0.6);
  });
});

describe('YZ bağlam: Warrior - Abyssal Cry (madde 262: sonraki 3 saldırı için menzil +1 ve bonus STR; bedel yalnızca Rage)', () => {
  const FOES = { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler', 4: 'antimage' };
  const war = (foes: Record<number, string> = FOES, tweak?: (b: Battle) => void) => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, foes);
    b.get('party-0')!.rage = b.get('party-0')!.maxRage; // Abyssal Cry Rage ister (bedel: rage)
    b.get('party-0')!.mp = 0; // Charge (Stun) / Whirlwind yok: Abyssal Cry yalnızca bedelsiz Double Strike ile yarışsın
    tweak?.(b);
    return b;
  };

  it('kalabalık düşmanda (3 saldırının bonusu bu turun saldırısından büyük) seçilir', () => {
    expect(choose(war())).toMatchObject({ skillId: 'abyssal_cry', reason: 'tactic' });
  });

  it('arka sıraya yalnızca buff ile ulaşılıyorsa seçilir (ön sırada tek Defender)', () => {
    expect(choose(war({ 0: 'defender', 3: 'mage', 4: 'archer' }))?.skillId).toBe('abyssal_cry');
  });

  it('bir sonraki turundan önce ölecekse seçilmez (buff boşa gider)', () => {
    for (const ratio of [0.05, 0.1]) {
      const b = war(FOES, (x) => (x.get('party-0')!.hp = Math.max(1, Math.round(x.get('party-0')!.maxHp * ratio))));
      expect(choose(b)?.skillId, `can oranı ${ratio}`).not.toBe('abyssal_cry');
    }
  });

  it('tek düşman bu vuruşla ölecekse seçilmez', () => {
    const b = war({ 0: 'mage' }, (x) => (x.get('enemy-0')!.hp = 3));
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('zaten Abyssal Fury varken tekrar seçilmez (yığılmaz)', () => {
    const b = war(FOES, (x) => x.debugAddStatus('party-0', 'abyssal_fury', 3));
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('öldürme seçeneği öldürme terimini taşır; seçim en yüksek puandır (sabit "önce öldür" yok, K1)', () => {
    const b = war(FOES, (x) => (x.get('enemy-1')!.hp = 1));
    const ex = explainChoice(b, 'party-0', ai)!;
    const killer = ex.candidates.find((c) => c.kills.includes('E1:Archer'))!;
    expect(killer.terms!.kill).toBeGreaterThan(0);
    expect(ex.candidates.find((c) => c.verdict === 'chosen')!.score).toBe(Math.max(...ex.candidates.map((c) => c.score ?? -Infinity)));
  });

  it('seçilirse gerçekten oynanır: can harcanmaz, Abyssal Fury verilir', () => {
    const b = war();
    const w = b.get('party-0')!;
    const hp0 = w.hp;
    expect(b.useSkill('party-0', 'abyssal_cry').ok).toBe(true);
    expect(w.hp).toBe(hp0);
    expect(w.statuses.some((s) => s.kind === 'abyssal_fury')).toBe(true);
  });
});

describe('YZ bağlam: MP ayırma ve genel özellikler', () => {
  it('hazır olmasına 1 tur kalan, bağlamı mevcut skill için MP ayrılır: o MP\'yi tüketecek saldırı skill\'i ertelenir (Archer)', () => {
    const b = mk({ 0: 'archer' }, { 0: 'defender' }, 'turns');
    const archer = b.get('party-0')!;
    const need = content.skills.aimed_shot!.cost.amount;
    archer.cooldowns.aimed_shot = 1;
    // Piercing Arrow harcanınca Aimed Shot'a yetmeyecek kadar MP
    const piercing = content.skills.piercing_arrow!.cost.amount;
    archer.mp = need + piercing - 1 - archer.stats.mpRegen;
    while (b.currentUid !== 'party-0') b.skipTurn();
    archer.cooldowns.aimed_shot = 1;
    archer.mp = need + piercing - 1 - archer.stats.mpRegen;
    const choice = choose(b);
    expect(choice?.skillId).not.toBe('piercing_arrow');
    // MP ayırma ipucu kaldırılırsa (reserveMp yok) Piercing Arrow yeniden serbest
    const free = mk({ 0: 'archer' }, { 0: 'defender' }, 'turns', (s) => {
      s.skills = { ...s.skills, aimed_shot: { ...s.skills.aimed_shot!, ai: { ...s.skills.aimed_shot!.ai!, reserveMp: undefined } } };
    });
    const a2 = free.get('party-0')!;
    while (free.currentUid !== 'party-0') free.skipTurn();
    a2.cooldowns.aimed_shot = 1;
    a2.mp = need + piercing - 1 - a2.stats.mpRegen;
    const pierce = explainChoice(free, 'party-0', ai)!.candidates.filter((c) => c.skill === 'piercing_arrow');
    expect(pierce.length).toBeGreaterThan(0);
    expect(pierce.every((c) => c.verdict !== 'blocked')).toBe(true); // ayırma yoksa engel yok (terazi seçer)
    expect(explainChoice(b, 'party-0', ai)!.candidates.filter((c) => c.skill === 'piercing_arrow').every((c) => c.verdict === 'blocked')).toBe(true);
  });

  it('karar saf ve belirleyici: aynı durumda aynı seçim, savaş durumunu değiştirmez', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler' });
    const before = JSON.stringify(b.combatants);
    const a = choose(b);
    const c = choose(b);
    expect(a).toEqual(c);
    expect(JSON.stringify(b.combatants)).toBe(before);
  });

  it('madde 258: skill ai ipuçlarında yalnızca MP ayırma alanları kalır (reserveMp, reserveMinMpRatio); bağlam koşulu yok; yuva ağırlığı kalmadı', () => {
    const allowed = new Set(['reserveMp', 'reserveMinMpRatio']);
    for (const sk of Object.values(content.skills)) {
      if (!sk.ai) continue;
      for (const k of Object.keys(sk.ai)) expect(allowed.has(k), `${sk.id}.ai.${k}`).toBe(true);
      expect(sk.ai.reserveMp, sk.id).toBeGreaterThan(0);
    }
    for (const id of ['meteor', 'aimed_shot', 'void_strike', 'all_in', 'doom_mark']) expect(content.skills[id]!.ai?.reserveMp, id).toBeDefined();
    expect(content.skills.judgment!.ai).toBeUndefined();
    for (const p of Object.values(ai.profiles)) expect(p).not.toHaveProperty('ultimateWeight');
  });

  it('YZ ile oynanan rastgele savaşlar (turns) hep geçerli hamle yapar ve biter; başlangıç cooldown\'u hesaba girer', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 600 && !b.winner; i++) {
        const actor = b.currentUid!;
        const choice = chooseAction(b, actor, content.aiConfig);
        if (choice) expect((b.globalDef(choice.skillId) ? b.canUseGlobal(actor, choice.skillId, choice.slot) : b.canUse(actor, choice.skillId)).ok, `seed ${seed}: ${choice.skillId}`).toBe(true);
        const r = b.applyChoice(actor, choice);
        expect(r.ok, `seed ${seed} tur ${i}`).toBe(true);
      }
    }
  });
});
