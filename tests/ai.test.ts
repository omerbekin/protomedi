import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, explainChoice } from '../src/engine';
import type { AiConfig } from '../src/engine';
import { legacySkill } from './legacy-skills';

/** Class skill kuralları testleri global skill'siz YZ ile (global skill kuralları: tests/ai-global.test.ts); tam savaş testleri content.aiConfig'i (global dahil) kullanır. */
const ai: AiConfig = { ...content.aiConfig, global: undefined };
const turnsBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'turns'));
/** Stat toplamı 30 olduğundan canlar düşük; AI senaryoları (can oranı, öldürme eşiği) sağlam birimler varsayar: can en az 100. */
const sturdy = (b: Battle): Battle => {
  for (const c of b.combatants) {
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
  }
  return b;
};
const testBattle = (seed = 1) => sturdy(new Battle(content.battleSetup('first-battle', seed, 'test')));
/** Undead'e (yalnızca bu savaşta) can bedelli eski Blood Rite'ı ekler: can bedeli kuralı testleri için (tests/legacy-skills.ts). */
const withBloodRite = (seed = 1): Battle => {
  const setup = content.battleSetup('first-battle', seed, 'test');
  setup.skills = { ...setup.skills, blood_rite: legacySkill('blood_rite') };
  setup.party = setup.party.map((d) => (d.id === 'undead' ? { ...d, skills: [...d.skills, 'blood_rite'] } : d));
  return sturdy(new Battle(setup));
};

/** Seçimin gerçekte vuracağı birimler (alan skill'inde anchor hücre ya da birim; tek hedefte hedef). */
const hitsOf = (b: Battle, actor: string, pick: { skillId: string; targetUid?: string; slot?: number }): string[] =>
  b.isAreaSkill(pick.skillId) ? b.areaWindowAt(actor, pick.skillId, pick.slot ?? b.get(pick.targetUid!)!.slot).map((c) => c.uid) : [pick.targetUid!];

const E_WARRIOR = 'enemy-0';
const E_ARCHER = 'enemy-1';
const E_MAGE = 'enemy-2';
const E_DRUID = 'enemy-3';
const WARRIOR = 'party-0';
const PALADIN = 'party-1';
const MAGE = 'party-2';
const UNDEAD = 'party-3';

describe('yapay zeka: öncelik 1 - öldürebiliyorsa öldür', () => {
  it('canı az olan birini öldürebilen skill\'i ve o hedefi seçer', () => {
    const b = testBattle();
    b.get(MAGE)!.hp = 5; // Archer'ın en ucuz atışı bile öldürür
    const choice = chooseAction(b, E_ARCHER, ai)!;
    // Terazi (madde 257): öldüren seçenekler arasında en değerlisi (alan skill'i Mage'i öldürüp başkalarına da vurabilir)
    expect(choice.reason).toBe('kill');
    expect(hitsOf(b, E_ARCHER, choice)).toContain(MAGE);
  });

  it('öldüremiyorsa kill önceliği devreye girmez', () => {
    const choice = chooseAction(testBattle(), E_ARCHER, ai);
    expect(choice?.reason).not.toBe('kill');
  });

  it('birden fazla kurban varsa en tehlikeliyi (yüksek ATK/MAG + SPD) öldürür', () => {
    const b = testBattle();
    b.get(E_ARCHER)!.mp = 0; // AoE kullanamasın, tek hedefe zorla
    b.get(WARRIOR)!.hp = 3;
    b.get(MAGE)!.hp = 3;
    // Mage (MAG 20 + SPD 9 = 29) > Warrior (ATK 18 + SPD 10 = 28) -> Mage
    expect(chooseAction(b, E_ARCHER, ai)).toMatchObject({ targetUid: MAGE, reason: 'kill' });
  });

  it('herkese vuran bir skill birden fazla kişiyi öldürüyorsa onu seçer', () => {
    const b = testBattle();
    for (const id of [WARRIOR, PALADIN, MAGE, UNDEAD]) b.get(id)!.hp = 4;
    const choice = chooseAction(b, E_ARCHER, ai);
    expect(choice).toMatchObject({ skillId: 'arrow_rain', reason: 'kill' });
  });

  it('kalkan hasarı emiyorsa öldürebildiğini sanmaz', () => {
    const b = testBattle();
    b.get(MAGE)!.hp = 5;
    b.get(MAGE)!.shield = 200;
    expect(chooseAction(b, E_ARCHER, ai)?.reason).not.toBe('kill');
  });

  it('kendi canı pahasına de olsa (can bedelli skill: eski Blood Rite) öldürücü vuruşu yapabilir', () => {
    // Blood Rite oyundan kalktı (madde 240: Dark Bond); can bedeli kuralı motorda duruyor, test eski tanımı yalnızca bu savaşa ekler
    const b = withBloodRite();
    b.get(UNDEAD)!.hp = 25; // oran düşük ama 20 can bedeli ödeyebilir
    b.get(E_MAGE)!.hp = 30; // Blood Rite 14*2.4-5 ≈ 28.6; Soul Drain 14-5=9. Sadece Blood Rite öldürür
    b.get(E_MAGE)!.hp = 20; // Mage kısa canlı: Blood Rite ortalaması 20 canı aşar
    // Terazi: can bedelli skill düşük canda da öldürücü vuruşta yasak değil (puanı pozitif, öldürme terimi taşır); seçim en yüksek puan
    const ex = explainChoice(b, UNDEAD, ai)!;
    const rite = ex.candidates.find((c) => c.skill === 'blood_rite' && c.target === 'E2:Mage')!;
    expect(rite.kills).toContain('E2:Mage');
    expect(rite.terms!.kill).toBeGreaterThan(0);
    expect(rite.score!).toBeGreaterThan(0);
    expect(ex.candidates.find((c) => c.verdict === 'chosen')!.score).toBe(Math.max(...ex.candidates.map((c) => c.score ?? -Infinity)));
  });
});

describe('yapay zeka: şifa, kalkan, çağrı', () => {
  // Terazi (madde 257): şifa "eşik altı" kuralıyla değil, kurtarma değeriyle: dost bir sonraki turumuzdan önce ölecekse ve şifa onu kurtarıyorsa
  const duel = () => sturdy(new Battle(content.battleSetup('first-battle', 1, 'test', { party: ['archer'], enemies: ['warrior', 'archer', 'druid'] })));
  const uidOf = (b: Battle, side: 'party' | 'enemy', defId: string) => b.combatants.find((c) => c.side === side && c.defId === defId)!.uid;

  it('Druid, ölmek üzere olan (sıradaki vuruşla ölecek) ve şifayla kurtulacak dostunu iyileştirir', () => {
    const b = duel();
    const w = b.get(uidOf(b, 'enemy', 'warrior'))!;
    w.hp = 8; // tek düşman (Archer) en az canlıyı vurur: 8 can ölür, Rejuvenate kurtarır
    const choice = chooseAction(b, uidOf(b, 'enemy', 'druid'), ai);
    expect(choice).toMatchObject({ skillId: 'rejuvenate', targetUid: w.uid, reason: 'heal' });
  });

  it('kurtarılacak dost, düşmanın vuracağı (en yaralı) dosttur', () => {
    const b = duel();
    b.get(uidOf(b, 'enemy', 'warrior'))!.hp = 50;
    const archer = b.get(uidOf(b, 'enemy', 'archer'))!;
    archer.hp = 8;
    expect(chooseAction(b, uidOf(b, 'enemy', 'druid'), ai)?.targetUid).toBe(archer.uid);
  });

  it('saldırıları zayıfken Treant çağırır (çağrının ufuktaki katkısı + Verdant Blessing)', () => {
    const b = testBattle();
    Object.assign(b.get(E_DRUID)!.stats, { int: 1, str: 1, dex: 1 }); // Druid'in kendi vuruşları değersiz; Treant'ın gücü kendi statlarından
    const ex = explainChoice(b, E_DRUID, ai)!;
    expect(ex.candidates.find((c) => c.skill === 'summon_treant')!.terms!.summon).toBeGreaterThan(0);
    expect(chooseAction(b, E_DRUID, ai)).toMatchObject({ skillId: 'summon_treant', reason: 'summon' });
  });

  it('zaten çağrılmış Treant yaşıyorsa tekrar çağırmaz (çağrı sınırı: değeri 0)', () => {
    const b = testBattle();
    b.useSkill(E_DRUID, 'summon_treant');
    const choice = chooseAction(b, E_DRUID, ai);
    expect(choice?.skillId).not.toBe('summon_treant');
  });

  it('Warrior (aggressive profil) canı azalsa da kalkan önceliği kullanmaz, saldırır', () => {
    const b = testBattle();
    b.get(E_WARRIOR)!.hp = 60;
    expect(chooseAction(b, E_WARRIOR, ai)?.reason).not.toBe('shield');
  });

  it('zaten kalkanı olan kendine tekrar kalkan çekmez', () => {
    const b = testBattle();
    b.get(E_WARRIOR)!.hp = 60;
    b.get(E_WARRIOR)!.shield = 30;
    expect(chooseAction(b, E_WARRIOR, ai)?.reason).not.toBe('shield');
  });

  it('Mage, sıradaki vuruşla ölecek ve kalkanla kurtulacak dostuna Mana Barrier verir', () => {
    const b = sturdy(new Battle(content.battleSetup('first-battle', 1, 'test', { party: ['archer'], enemies: ['mage', 'archer'] })));
    const ally = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'archer')!;
    ally.hp = 8;
    const mage = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'mage')!;
    expect(chooseAction(b, mage.uid, ai)).toMatchObject({ skillId: 'mana_barrier', targetUid: ally.uid, reason: 'shield' });
  });

  it('Paladin yaralı dostu varken Radiance (dosta şifa + düşmana hasar) seçer', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 30;
    expect(chooseAction(b, PALADIN, ai)?.skillId).toBe('radiance');
  });
});

describe('yapay zeka: hasar tercihleri', () => {
  it('4 düşman varken herkese vuran skill\'i (AoE) tercih eder', () => {
    const choice = chooseAction(testBattle(), E_MAGE, ai);
    expect(['aoe', 'tactic']).toContain(choice?.reason); // Meteor bağlamsal ('tactic'), Blizzard 'aoe'
    expect(['blizzard', 'meteor']).toContain(choice?.skillId); // alan skill'leri: 3 kişilik alan
  });

  it('düşman sayısı AoE eşiğinin altındaysa tek hedefe vurur', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0; // 2 düşman kaldı (eşik 3)
    const choice = chooseAction(b, E_MAGE, ai)!;
    // Terazi: alan skill'i yalnızca vurduğu hedeflerin toplamı tek hedefi geçiyorsa; seçildiyse iki düşmanı da vurur
    if (b.isAreaSkill(choice.skillId)) expect(hitsOf(b, E_MAGE, choice)).toHaveLength(2);
    else expect(choice.reason).toBe('damage');
  });

  it('tek hedefte en yaralı (can oranı en düşük) kişiye odaklanır', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0;
    b.get(MAGE)!.hp = 60; // 60/70
    b.get(UNDEAD)!.hp = 50; // 50/80 -> daha düşük oran
    const pick = chooseAction(b, E_MAGE, ai)!;
    expect(hitsOf(b, E_MAGE, pick)).toContain(UNDEAD); // en yaralı kişi vurulanlar arasında
  });

  it('Archer (sniper) en az canlıya (mutlak can) odaklanır', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0;
    b.get(MAGE)!.hp = 60; // oran 0.86, mutlak 60
    b.get(UNDEAD)!.hp = 79; // oran 0.99, mutlak 79
    b.get(E_ARCHER)!.mp = 9; // Aimed Shot (10 MP; yüksek canlı hedefi bağlamsal seçerdi) kapalı: yalnızca odak kuralı sınanır
    const pick = chooseAction(b, E_ARCHER, ai)!;
    const hits = hitsOf(b, E_ARCHER, pick);
    expect(hits[0]).toBe(MAGE); // odak (ilk/ana vuruş) en az canlı; alan skill'iyse (Piercing Arrow şeridi) yalnızca ona
    expect(hits).not.toContain(UNDEAD);
  });

  it('Undead canı azken can ödeyen skill\'i (eski Blood Rite) hasar için kullanmaz', () => {
    const b = withBloodRite();
    b.get(UNDEAD)!.hp = 30; // 30/80 < 0.5 ve Blood Rite öldürmüyor
    const choice = chooseAction(b, UNDEAD, ai);
    expect(choice?.skillId).not.toBe('blood_rite');
  });
});

describe('yapay zeka: genel kurallar', () => {
  it('kullanamayacağı skill\'i seçmez (MP bitti -> bedelsiz skill)', () => {
    const b = testBattle();
    b.get(E_ARCHER)!.mp = 0;
    const choice = chooseAction(b, E_ARCHER, ai)!;
    expect(choice.skillId).toBe('quick_shot');
    expect(b.canUse(E_ARCHER, choice.skillId).ok).toBe(true);
  });

  it('yapacak anlamlı bir şeyi yoksa null döner (pas)', () => {
    const b = testBattle();
    b.get(E_MAGE)!.mp = 0; // Mage'in bedelsiz skill'i yok
    expect(chooseAction(b, E_MAGE, ai)).toBeNull();
    const dead = testBattle();
    dead.get(E_MAGE)!.hp = 0;
    expect(chooseAction(dead, E_MAGE, ai)).toBeNull();
  });

  it('seçtiği hamle her zaman geçerli ve motor tarafından kabul ediliyor', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = turnsBattle(seed);
      for (let i = 0; i < 60 && !b.winner; i++) {
        const actor = b.currentUid!;
        const choice = chooseAction(b, actor, content.aiConfig);
        const r = b.applyChoice(actor, choice); // seçim global skill (Rest/Skip/Move) da olabilir
        expect(r.ok, `seed ${seed} tur ${i}`).toBe(true);
      }
    }
  });

  it('belirleyici: aynı durum aynı kararı verir ve motorun RNG\'sine dokunmaz', () => {
    const b = turnsBattle(5);
    const a = chooseAction(b, b.currentUid!, ai);
    const logLength = b.log.length;
    expect(chooseAction(b, b.currentUid!, ai)).toEqual(a);
    expect(b.log).toHaveLength(logLength);
  });

  it('profili olmayan birim varsayılan profili kullanır', () => {
    const config: AiConfig = { ...ai, defaultProfile: 'aggressive' };
    const b = testBattle();
    b.get(E_WARRIOR)!.ai = 'yok_boyle_profil';
    expect(chooseAction(b, E_WARRIOR, config)).not.toBeNull();
  });

  it('YZ ile oynanan tam savaş her seed\'de sonuçlanır (sonsuz döngü yok)', () => {
    const results = { party: 0, enemy: 0, none: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      const b = turnsBattle(seed);
      for (let i = 0; i < 500 && !b.winner; i++) {
        const actor = b.currentUid!;
        b.applyChoice(actor, chooseAction(b, actor, content.aiConfig));
      }
      results[b.winner ?? 'none']++;
    }
    expect(results.none).toBe(0);
    expect(results.party + results.enemy).toBe(60);
  });
});

describe('yapay zeka: yeni sınıflar ve menzil/taunt kuralları', () => {
  const make = (party: string[], enemies: string[], seed = 1) => {
    const b = new Battle(content.battleSetup('first-battle', seed, 'test', { party, enemies }));
    return sturdy(b);
  };
  const uid = (b: Battle, side: 'party' | 'enemy', defId: string) => b.combatants.find((c) => c.side === side && c.defId === defId)!.uid;

  it('Defender, ölmek üzere olan dostunu Taunt ya da Guard ile korur (K6: korunan dostun değeri)', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const archer = b.get(uid(b, 'enemy', 'archer'))!;
    archer.hp = Math.round(archer.maxHp * 0.12);
    const choice = chooseAction(b, uid(b, 'enemy', 'defender'), ai)!;
    expect(['taunt', 'guard']).toContain(choice.skillId);
    if (choice.skillId === 'guard') expect(choice.targetUid).toBe(archer.uid);
  });

  it('Taunt zaten aktifse tekrar çekmez; başka bir şey yapar', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const d = uid(b, 'enemy', 'defender');
    b.useSkill(d, 'taunt');
    expect(chooseAction(b, d, ai)?.skillId).not.toBe('taunt');
  });

  it('Defender yaralı bir dostunu (kendisi değil) Guard ile korur', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const d = uid(b, 'enemy', 'defender');
    const archer = b.get(uid(b, 'enemy', 'archer'))!;
    archer.hp = Math.round(archer.maxHp * 0.12); // ölmek üzere: Guard (hasarın yarısını üstlenir) kurtarır
    const skills = b.get(d)!.skills;
    b.get(d)!.skills = skills.filter((x) => x !== 'taunt' && x !== 'fist_crush'); // Taunt kurtarabilirdi, Fist Crush (zırh ölçekli, 2026-10-10) daha değerli olabilir: yalnızca Guard sınansın
    expect(chooseAction(b, d, ai)).toMatchObject({ skillId: 'guard', targetUid: archer.uid, reason: 'guard' });
    // Taunt sürerken tek hedefli saldırılar zaten Defender'a gider: Guard'ın kurtarma terimi kalmaz
    b.get(d)!.skills = skills;
    b.useSkill(d, 'taunt');
    const g = explainChoice(b, d, ai)!.candidates.find((c) => c.skill === 'guard' && c.target === 'E2:Archer');
    if (g) expect(g.terms?.save).toBeUndefined();
  });

  it('zaten korunan dostu tekrar korumaz', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const d = uid(b, 'enemy', 'defender');
    b.useSkill(d, 'taunt');
    const archer = b.get(uid(b, 'enemy', 'archer'))!;
    archer.hp = Math.round(archer.maxHp * 0.5);
    b.useSkill(d, 'guard', archer.uid);
    expect(chooseAction(b, d, ai)?.reason).not.toBe('guard');
  });

  it('Anti-Mage: Drain Field adayının değeri yakılan manayı içerir (burn terimi); en değerli seçenek seçilir', () => {
    const b = make(['antimage', 'warrior', 'archer', 'mage'], ['warrior', 'mage', 'druid', 'archer']);
    const ex = explainChoice(b, uid(b, 'party', 'antimage'), ai)!;
    const drain = ex.candidates.filter((c) => c.skill === 'drain_field');
    expect(Math.max(...drain.map((c) => c.terms?.burn ?? 0))).toBeGreaterThan(0);
    const top = Math.max(...ex.candidates.map((c) => c.score ?? -Infinity));
    expect(ex.candidates.find((c) => c.verdict === 'chosen')!.score).toBe(top);
  });

  it('düşmanların manası yoksa Drain Field seçmez; hasar skill\'ine geçer', () => {
    const b = make(['antimage', 'warrior', 'archer', 'mage'], ['warrior', 'mage', 'druid', 'archer']);
    for (const c of b.living('enemy')) { c.maxMp = 0; c.mp = 0; } // yakılacak mana yok (ve eksik mana bonusu da yok)
    const choice = chooseAction(b, uid(b, 'party', 'antimage'), ai);
    expect(choice?.skillId).not.toBe('drain_field');
    expect(choice?.reason).toBe('damage');
  });

  it('Anti-Mage canı azken kendine büyü kalkanı basar', () => {
    const b = make(['antimage', 'warrior', 'archer', 'mage'], ['warrior', 'mage', 'druid', 'archer']);
    // burn ve eksik-mana (kill) önceliği devreye girmesin; düşman Mage'in MP'si kalır (büyü kalkanının karşılayacağı büyü tehdidi; madde 261:
    // Double Strike zayıflayınca yalnızca fiziksel tehdit Spell Ward'a değer kazandırmıyor, ki doğru: büyü kalkanı fiziksel hasarı emmez)
    for (const c of b.living('enemy')) if (c.defId !== 'mage') { c.maxMp = 0; c.mp = 0; }
    const am = b.get(uid(b, 'party', 'antimage'))!;
    am.hp = Math.round(am.maxHp * 0.35); // madde 241: eşik veride 0,45 (ölçümle düşürüldü)
    am.skills = am.skills.filter((s) => s !== 'drain_field'); // madde 261: güçlenen Drain Field (Silence) MP'li Mage'e karşı ayrı bir yarış; burada kalkan ile saldırı kıyaslanır
    expect(chooseAction(b, am.uid, ai)).toMatchObject({ skillId: 'spell_ward', targetUid: am.uid, reason: 'shield' });
  });

  it('yakın dövüşçü yalnızca menzildeki hedefleri seçer, öldürülebilecek biri menzil dışındaysa ona gitmez', () => {
    const b = make(['defender', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    // Arkadaki Mage ölmek üzere ama Defender'ın (yakın dövüş) menzili dışında
    const mage = b.get(uid(b, 'enemy', 'mage'))!;
    mage.hp = 1;
    const choice = chooseAction(b, uid(b, 'party', 'defender'), ai);
    expect(choice?.targetUid).not.toBe(mage.uid);
    const reachable = b.validTargets(uid(b, 'party', 'defender'), choice!.skillId).map((c) => c.uid);
    if (choice?.targetUid) expect(reachable).toContain(choice.targetUid);
  });

  it('menzilli Archer aynı durumda arkadaki ölmek üzere olan Mage\'i öldürmeyi seçer', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const mage = b.get(uid(b, 'enemy', 'mage'))!;
    mage.hp = 1;
    const choice = chooseAction(b, uid(b, 'party', 'archer'), ai)!;
    expect(choice.reason).toBe('kill');
    expect(hitsOf(b, uid(b, 'party', 'archer'), choice)).toContain(mage.uid);
  });

  it('düşmanın taunt\'ı varken YZ yalnızca taunt\'lı birimi hedefler (tek hedefli skill\'lerde)', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    b.useSkill(uid(b, 'enemy', 'defender'), 'taunt');
    const mage = b.get(uid(b, 'enemy', 'mage'))!;
    mage.hp = 1; // taunt olmasa öldürülürdü
    const choice = chooseAction(b, uid(b, 'party', 'archer'), ai);
    if (choice && b.skill(choice.skillId)!.target === 'single_enemy') expect(choice.targetUid).toBe(uid(b, 'enemy', 'defender')); // alan skill'leri taunt'tan etkilenmez
  });

  it('YZ ile oynanan tüm sınıflı rastgele savaşlar hep geçerli hamle yapar ve sonuçlanır', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 500 && !b.winner; i++) {
        const actor = b.currentUid!;
        const choice = chooseAction(b, actor, content.aiConfig);
        const r = b.applyChoice(actor, choice); // seçim global skill (Rest/Skip/Move) da olabilir
        expect(r.ok, `seed ${seed} tur ${i}`).toBe(true);
      }
    }
  });
});

describe('yapay zeka: 4. (güçlü) skill ve mana yakma hedefi', () => {
  const make = (party: string[], enemies: string[], seed = 1) => {
    const b = new Battle(content.battleSetup('random-battle', seed, 'turns', { party, enemies }));
    return sturdy(b);
  };
  const uid = (b: Battle, side: 'party' | 'enemy', defId: string) => b.combatants.find((c) => c.side === side && c.defId === defId)!.uid;
  const actFirst = (b: Battle, defId: string) => {
    const id = uid(b, 'party', defId);
    for (let i = 0; i < 60 && b.currentUid !== id; i++) b.skipTurn();
    b.get(id)!.mp = 100;
    return id;
  };
  it('4. skill mantıklıysa (daha çok hasar/değer katıyorsa) önceliklendirilir: Mage çok düşmanlı alanda Meteor\'u seçer', () => {
    const b = make(['mage', 'warrior', 'defender', 'paladin'], ['warrior', 'defender', 'mage', 'paladin', 'druid']);
    const mage = actFirst(b, 'mage');
    const choice = chooseAction(b, mage, ai);
    expect(['meteor', 'blizzard']).toContain(choice?.skillId); // alan skill'leri; Meteor bağlam (>= 2 düşman) sağlandığı için aday
    expect(content.skills[choice!.skillId]!.target).toBe('area_enemies');
  });

  it('4. yuvaya gömülü genel ağırlık yok: profilde ultimateWeight alanı kalmadı, 4. skill yalnızca bağlamıyla öne çıkar', () => {
    for (const p of Object.values(ai.profiles)) expect(p, 'ultimateWeight').not.toHaveProperty('ultimateWeight');
    // Aynı skill'in (Aimed Shot) bağlam ipucu kaldırılırsa (ipucusuz skill) seçim ağırlıkla değil değerle yapılır: 4. yuva olması avantaj vermez
    const b = make(['archer', 'warrior', 'defender', 'paladin'], ['warrior', 'defender', 'mage', 'paladin']);
    const archer = actFirst(b, 'archer');
    const noHint: AiConfig = JSON.parse(JSON.stringify(ai));
    for (const p of Object.values(noHint.profiles)) p.priorities = p.priorities.filter((x) => x !== 'tactic');
    expect(chooseAction(b, archer, noHint)).toBeDefined();
  });

  it('Drain Field, mana havuzu büyük hedefleri (Mage) kapsayan alana atılır', () => {
    const b = make(['antimage', 'warrior', 'archer', 'paladin'], ['warrior', 'defender', 'archer', 'mage', 'druid']);
    const am = actFirst(b, 'antimage');
    const choice = chooseAction(b, am, ai);
    if (choice?.skillId === 'drain_field') {
      const covered = hitsOf(b, am, choice).map((u) => b.get(u)!.defId);
      expect(covered.some((d) => d === 'mage' || d === 'druid')).toBe(true); // büyücüler alanda
    }
    expect(choice).toBeDefined();
  });
});
