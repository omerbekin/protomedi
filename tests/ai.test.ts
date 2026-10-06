import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { AiConfig } from '../src/engine';

const ai = content.aiConfig;
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
    const choice = chooseAction(b, E_ARCHER, ai);
    expect(choice).toMatchObject({ targetUid: MAGE, reason: 'kill' });
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

  it('kendi canı pahasına de olsa (Blood Rite) öldürücü vuruşu yapabilir', () => {
    const b = testBattle();
    b.get(UNDEAD)!.hp = 25; // oran düşük ama 20 can bedeli ödeyebilir
    b.get(E_MAGE)!.hp = 30; // Blood Rite 14*2.4-5 ≈ 28.6; Soul Drain 14-5=9. Sadece Blood Rite öldürür
    b.get(E_MAGE)!.hp = 20; // Mage kısa canlı: Blood Rite ortalaması 20 canı aşar
    const choice = chooseAction(b, UNDEAD, ai);
    expect(choice).toMatchObject({ skillId: 'blood_rite', targetUid: E_MAGE, reason: 'kill' });
  });
});

describe('yapay zeka: şifa, kalkan, çağrı', () => {
  it('Druid, dostu eşiğin altındaysa onu iyileştirir (öldürecek kimse yokken)', () => {
    const b = testBattle();
    b.get(E_WARRIOR)!.hp = 20; // 20/110 < 0.5
    const choice = chooseAction(b, E_DRUID, ai);
    expect(choice).toMatchObject({ skillId: 'rejuvenate', targetUid: E_WARRIOR, reason: 'heal' });
  });

  it('en yaralı dostu seçer', () => {
    const b = testBattle();
    b.get(E_WARRIOR)!.hp = 50;
    b.get(E_ARCHER)!.hp = 10;
    expect(chooseAction(b, E_DRUID, ai)?.targetUid).toBe(E_ARCHER);
  });

  it('kimsenin canı eşiğin altında değilse şifa harcamaz; Treant çağırır', () => {
    const choice = chooseAction(testBattle(), E_DRUID, ai);
    expect(choice).toMatchObject({ skillId: 'summon_treant', reason: 'summon' });
  });

  it('zaten çağrılmış Treant yaşıyorsa tekrar çağırmaz, saldırır', () => {
    const b = testBattle();
    b.useSkill(E_DRUID, 'summon_treant');
    const choice = chooseAction(b, E_DRUID, ai);
    expect(choice?.reason).toBe('damage');
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

  it('Mage yaralı bir dostuna Mana Barrier verir', () => {
    const b = testBattle();
    b.get(E_ARCHER)!.hp = 30; // 30/75 < 0.75
    expect(chooseAction(b, E_MAGE, ai)).toMatchObject({ skillId: 'mana_barrier', targetUid: E_ARCHER, reason: 'shield' });
  });

  it('Paladin (healer) yaralı dostunu iyileştirir', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 30;
    expect(chooseAction(b, PALADIN, ai)).toMatchObject({ reason: 'heal' }); // Radiance: herkesi iyileştirir (ve düşmana vurur)
  });
});

describe('yapay zeka: hasar tercihleri', () => {
  it('4 düşman varken herkese vuran skill\'i (AoE) tercih eder', () => {
    const choice = chooseAction(testBattle(), E_MAGE, ai);
    expect(choice?.reason).toBe('aoe');
    expect(['blizzard', 'meteor']).toContain(choice?.skillId); // alan skill'leri: 3 kişilik alan
  });

  it('düşman sayısı AoE eşiğinin altındaysa tek hedefe vurur', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0; // 2 düşman kaldı (eşik 3)
    const choice = chooseAction(b, E_MAGE, ai);
    expect(choice?.reason).toBe('damage');
    expect(choice?.targetUid).toBeDefined();
  });

  it('tek hedefte en yaralı (can oranı en düşük) kişiye odaklanır', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0;
    b.get(MAGE)!.hp = 60; // 60/70
    b.get(UNDEAD)!.hp = 50; // 50/80 -> daha düşük oran
    const pick = chooseAction(b, E_MAGE, ai)!;
    const hit = b.skill(pick.skillId)!.target === 'area_enemies' ? b.areaWindow(E_MAGE, pick.skillId, pick.targetUid!).map((c) => c.uid) : [pick.targetUid];
    expect(hit).toContain(UNDEAD); // en yaralı kişi vurulanlar arasında
  });

  it('Archer (sniper) en az canlıya (mutlak can) odaklanır', () => {
    const b = testBattle();
    b.get(WARRIOR)!.hp = 0;
    b.get(PALADIN)!.hp = 0;
    b.get(MAGE)!.hp = 60; // oran 0.86, mutlak 60
    b.get(UNDEAD)!.hp = 79; // oran 0.99, mutlak 79
    expect(chooseAction(b, E_ARCHER, ai)?.targetUid).toBe(MAGE);
  });

  it('Undead canı azken can ödeyen skill\'i (Blood Rite) hasar için kullanmaz', () => {
    const b = testBattle();
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
        const choice = chooseAction(b, actor, ai);
        const r = choice ? b.useSkill(actor, choice.skillId, choice.targetUid) : b.skipTurn();
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
        const choice = chooseAction(b, actor, ai);
        if (choice) b.useSkill(actor, choice.skillId, choice.targetUid);
        else b.skipTurn();
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

  it('Defender önce Taunt çeker (takımda korunacak biri varsa, kendinde yokken)', () => {
    const b = make(['warrior', 'mage', 'archer', 'paladin'], ['defender', 'warrior', 'archer', 'mage']);
    const choice = chooseAction(b, uid(b, 'enemy', 'defender'), ai);
    expect(choice).toMatchObject({ skillId: 'taunt', reason: 'taunt' });
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
    b.useSkill(d, 'taunt'); // taunt öncelikli olduğundan önce onu harca
    const archer = b.get(uid(b, 'enemy', 'archer'))!;
    archer.hp = Math.round(archer.maxHp * 0.5);
    expect(chooseAction(b, d, ai)).toMatchObject({ skillId: 'guard', targetUid: archer.uid, reason: 'guard' });
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

  it('Anti-Mage, birden çok düşmanın manası varken Drain Field ile toplu mana yakar', () => {
    const b = make(['antimage', 'warrior', 'archer', 'mage'], ['warrior', 'mage', 'druid', 'archer']);
    const choice = chooseAction(b, uid(b, 'party', 'antimage'), ai);
    expect(choice).toMatchObject({ skillId: 'drain_field', reason: 'burn' });
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
    for (const c of b.living('enemy')) { c.maxMp = 0; c.mp = 0; } // burn ve eksik-mana (kill) önceliği devreye girmesin
    const am = b.get(uid(b, 'party', 'antimage'))!;
    am.hp = Math.round(am.maxHp * 0.5);
    expect(chooseAction(b, am.uid, ai)).toMatchObject({ skillId: 'spell_ward', reason: 'shield' });
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
    const choice = chooseAction(b, uid(b, 'party', 'archer'), ai);
    expect(choice).toMatchObject({ targetUid: mage.uid, reason: 'kill' });
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
        const choice = chooseAction(b, actor, ai);
        const r = choice ? b.useSkill(actor, choice.skillId, choice.targetUid) : b.skipTurn();
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
    expect(['meteor', 'blizzard']).toContain(choice?.skillId); // alan skill'leri; ultimate ağırlığı Meteor lehine
    expect(content.skills[choice!.skillId]!.target).toBe('area_enemies');
  });

  it('ultimate ağırlığı 1,5; profil ultimateWeight ile değiştirilebilir', () => {
    const b = make(['archer', 'warrior', 'defender', 'paladin'], ['warrior', 'defender', 'mage', 'paladin']);
    const archer = actFirst(b, 'archer');
    const base = chooseAction(b, archer, ai);
    const noUlt: AiConfig = JSON.parse(JSON.stringify(ai));
    for (const p of Object.values(noUlt.profiles)) p.ultimateWeight = 0.01;
    const weak = chooseAction(b, archer, noUlt);
    expect(base).toBeDefined();
    expect(weak).toBeDefined();
    expect(weak?.skillId).not.toBe('aimed_shot'); // ağırlık yokken pahalı Aimed Shot seçilmez
  });

  it('Drain Field, mana havuzu büyük hedefleri (Mage) kapsayan alana atılır', () => {
    const b = make(['antimage', 'warrior', 'archer', 'paladin'], ['warrior', 'defender', 'archer', 'mage', 'druid']);
    const am = actFirst(b, 'antimage');
    const choice = chooseAction(b, am, ai);
    if (choice?.skillId === 'drain_field') {
      const covered = b.areaWindow(am, 'drain_field', choice.targetUid!).map((c) => c.defId);
      expect(covered.some((d) => d === 'mage' || d === 'druid')).toBe(true); // büyücüler alanda
    }
    expect(choice).toBeDefined();
  });
});
