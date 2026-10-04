import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { AiConfig } from '../src/engine';

const ai = content.aiConfig;
const turnsBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'turns'));
const testBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'test'));

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
    b.get(E_MAGE)!.hp = 25;
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
    expect(choice?.skillId).toBe('thorn_whip');
  });

  it('Warrior canı eşiğin altındaysa Shield Wall çeker, değilse saldırır', () => {
    const b = testBattle();
    expect(chooseAction(b, E_WARRIOR, ai)?.reason).not.toBe('shield');
    b.get(E_WARRIOR)!.hp = 60; // 60/110 < 0.7
    expect(chooseAction(b, E_WARRIOR, ai)).toMatchObject({ skillId: 'shield_wall', reason: 'shield' });
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
    expect(chooseAction(b, PALADIN, ai)).toMatchObject({ reason: 'heal', targetUid: WARRIOR });
  });
});

describe('yapay zeka: hasar tercihleri', () => {
  it('4 düşman varken herkese vuran skill\'i (AoE) tercih eder', () => {
    const choice = chooseAction(testBattle(), E_MAGE, ai);
    expect(choice).toMatchObject({ skillId: 'lightning_storm', reason: 'aoe' });
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
    expect(chooseAction(b, E_MAGE, ai)?.targetUid).toBe(UNDEAD);
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
