import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, previewSkill } from '../src/engine';
import type { AiConfig, BattleSetup } from '../src/engine';

/**
 * Yapay zeka bağlam testleri: her 4. skill (ve Judgment) için "koşul sağlanınca seçilir, sağlanmayınca seçilmez".
 * Bağlam kuralları veride (data/skills.json > skill.ai); karar saf ve belirleyicidir.
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
  it('alan en az 2 düşmanı vuruyorsa Meteor seçilir (bağlamsal; "tactic")', () => {
    const b = mk({ 0: 'mage' }, ENEMY_FRONT_TRIO);
    expect(choose(b)).toMatchObject({ skillId: 'meteor', reason: 'tactic' });
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
    expect(choose(b)).toMatchObject({ skillId: 'aimed_shot', targetUid: 'enemy-0', reason: 'tactic' });
  });

  it('zırhsız ve (hasara göre) az canlı hedefe seçilmez', () => {
    const b = mk({ 0: 'archer' }, { 0: 'mage' });
    const mage = b.get('enemy-0')!;
    mage.stats.armor = 0;
    const avg = previewSkill(b, 'party-0', 'aimed_shot', 'enemy-0')[0]!.damage!.avg;
    mage.hp = Math.round(avg * 1.5); // öldürmez, ama can/hasar < hint eşiği
    expect(mage.hp).toBeGreaterThan(avg);
    expect(choose(b)?.skillId).not.toBe('aimed_shot');
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

  it('karşıda en az 3 düşman varsa Fist Crush seçilir', () => {
    const b = mk({ 0: 'defender', 1: 'warrior' }, { 0: 'warrior', 1: 'mage', 2: 'archer', 4: 'druid' });
    taunting(b); // taunt önceliği kapalı: yalnızca bağlam sınanır
    expect(choose(b)).toMatchObject({ skillId: 'fist_crush', reason: 'tactic' });
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
    expect(choose(many)).toMatchObject({ skillId: 'judgment', reason: 'tactic' });
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
    expect(choose(b)).toMatchObject({ skillId: 'raise_dead', reason: 'summon' });
    expect(b.useSkill('party-0', 'raise_dead').ok).toBe(true);
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
  const longBattle = (hint = content.skills.all_in!.ai!) => (hint.anyOf?.find((c) => c.minBattleTurns !== undefined)?.minBattleTurns ?? 0) + 1;

  it('MP yüksek ve savaş uzadıysa All In seçilir', () => {
    expect(choose(gambler(1, longBattle()))).toMatchObject({ skillId: 'all_in', reason: 'tactic' });
  });

  it('MP düşükken seçilmez (bahis küçük kalır)', () => {
    const low = (content.skills.all_in!.ai!.requires!.minSelfMpRatio ?? 0.6) - 0.2;
    expect(choose(gambler(low, longBattle()))?.skillId).not.toBe('all_in');
  });

  it('savaşın başında ve hedef öldürülemiyorsa seçilmez', () => {
    expect(choose(gambler(1, 0))?.skillId).not.toBe('all_in');
  });
});

describe('YZ bağlam: Anti-Mage - Void Strike', () => {
  it('hedefin manası eksikse (mana yakılmış) Void Strike seçilir; mana doluyken seçilmez', () => {
    const drained = mk({ 0: 'antimage' }, { 0: 'mage' });
    drained.get('enemy-0')!.hp = drained.get('enemy-0')!.maxHp = 5000; // mana yakılmış hedef öldürülmesin: bağlam "tactic" olarak sınanır
    drained.get('enemy-0')!.mp = 0;
    expect(choose(drained)).toMatchObject({ skillId: 'void_strike', reason: 'tactic' });
    const full = mk({ 0: 'antimage' }, { 0: 'mage' });
    full.get('enemy-0')!.hp = full.get('enemy-0')!.maxHp = 5000;
    expect(choose(full)?.skillId).not.toBe('void_strike');
  });
});

describe('YZ bağlam: Warrior - Abyssal Cry (can bedeli + %50 hasar azaltma)', () => {
  const FOES = { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler', 4: 'antimage' };
  const war = (tweak?: (b: Battle) => void) => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, FOES);
    b.get('party-0')!.rage = b.get('party-0')!.maxRage; // Abyssal Cry Rage ister (bedel: rage)
    tweak?.(b);
    return b;
  };
  const cry = content.skills.abyssal_cry!;
  const cost = () => (cry.effects.find((e) => e.type === 'selfDamage') as { ratio: number }).ratio;

  it('mevcut mantık: yeterli canda ve tehdit varken seçilir (kill/aoe\'dan önce, "tactic")', () => {
    expect(choose(war())).toMatchObject({ skillId: 'abyssal_cry', reason: 'tactic' });
  });

  it('düşük canda ASLA seçilmez (can bedelinden sonra güvenli eşiğin altına düşecekse)', () => {
    const min = cry.ai!.requires!.minSelfHpRatioAfter!;
    for (const ratio of [0.2, 0.4, min + cost() - 0.05]) {
      const b = war((x) => (x.get('party-0')!.hp = Math.round(x.get('party-0')!.maxHp * ratio)));
      expect(choose(b)?.skillId, `can oranı ${ratio}`).not.toBe('abyssal_cry');
    }
  });

  it('bedeli ödeyip eşiğin üstünde kalacak kadar yüksek canda seçilir', () => {
    const min = cry.ai!.requires!.minSelfHpRatioAfter!;
    const b = war((x) => (x.get('party-0')!.hp = Math.ceil(x.get('party-0')!.maxHp * (min + cost() + 0.1))));
    expect(choose(b)?.skillId).toBe('abyssal_cry');
  });

  it('tek başına (başka canlı dost yok) seçilmez', () => {
    const b = war((x) => {
      x.get('party-1')!.hp = 0;
      x.get('party-2')!.hp = 0;
    });
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('karşıda tek düşman varsa (tehdit yok) seçilmez', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage' });
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('zaten Fortified iken tekrar seçilmez (yığılmaz)', () => {
    const b = war((x) => x.debugAddStatus('party-0', 'fortify', 3));
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('düşmanlar zayıf ya da etkisizse (MP\'siz büyücüler, tehdit düşük) seçilmez', () => {
    const b = war((x) => {
      for (const c of x.combatants.filter((u) => u.side === 'enemy')) {
        c.mp = 0; // yalnızca bedelsiz saldırılar kaldı
        c.stats.str = 1;
        c.stats.int = 1;
        c.stats.dex = 1;
        c.stats.luck = 1;
      }
    });
    expect(choose(b)?.skillId).not.toBe('abyssal_cry');
  });

  it('öldürebiliyorsa önce öldürür (öncelik sırası bozulmadı)', () => {
    const b = war((x) => (x.get('enemy-0')!.hp = 1));
    expect(choose(b)).toMatchObject({ reason: 'kill' });
  });

  it('seçilirse gerçekten oynanır: can bedeli ödenir ve Fortified verilir', () => {
    const b = war();
    const w = b.get('party-0')!;
    const hp0 = w.hp;
    expect(b.useSkill('party-0', 'abyssal_cry').ok).toBe(true);
    expect(w.hp).toBe(hp0 - Math.round(hp0 * 0 + w.maxHp * cost()));
    expect(w.statuses.some((s) => s.kind === 'fortify')).toBe(true);
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
    expect(choose(free)?.skillId).toBe('piercing_arrow');
  });

  it('karar saf ve belirleyici: aynı durumda aynı seçim, savaş durumunu değiştirmez', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler' });
    const before = JSON.stringify(b.combatants);
    const a = choose(b);
    const c = choose(b);
    expect(a).toEqual(c);
    expect(JSON.stringify(b.combatants)).toBe(before);
  });

  it('tüm 4. skill\'lerde ve Judgment\'ta bağlam ipucu (ai) tanımlı; yuva ağırlığı kalmadı', () => {
    for (const cl of Object.values(content.classes).filter((c) => !c.testOnly)) {
      const id = cl.skills[3]!;
      if (cl.id === 'druid' || cl.id === 'undead') continue; // çağrılar: "summon" önceliği bağlamı verir (maxSummons, boş yer, MP)
      expect(content.skills[id]!.ai, id).toBeDefined();
    }
    expect(content.skills.judgment!.ai).toBeDefined();
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
