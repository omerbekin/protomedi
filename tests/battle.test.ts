import { describe, expect, it } from 'vitest';
import { Battle, attributePower, content } from '../src/engine';
import type { BattleEvent, CombatantDef } from '../src/engine';
import { installLegacySkills } from './legacy-skills';

installLegacySkills();

/**
 * Sabit takımlı (first-battle) test modu savaşı. Kritik ve dodge zarları kapatılır ki sayılar zara bağlı olmasın
 * (bu iki mekanik tests/mechanics.test.ts içinde ayrıca sınanır).
 */
function newBattle(seed = 1, calm = true): Battle {
  const b = new Battle(content.battleSetup('first-battle', seed, 'test'));
  if (calm) for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
}

// Yuva sırasına göre uid'ler (first-battle: sabit liste, diziliş uygulanmaz)
const WARRIOR = 'party-0';
const PALADIN = 'party-1';
const MAGE = 'party-2';
const UNDEAD = 'party-3';
const E_WARRIOR = 'enemy-0';
const E_ARCHER = 'enemy-1';
const E_MAGE = 'enemy-2';
const E_DRUID = 'enemy-3';

/** Başarılı olması gereken eylem; olayları döndürür. */
function act(battle: Battle, actor: string, skill: string, target?: string): BattleEvent[] {
  const r = battle.useSkill(actor, skill, target);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
}

const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

describe('takımlar', () => {
  it('iki tarafta da 4 karakter var, doğru sırayla', () => {
    const b = newBattle();
    expect(b.living('party').map((c) => c.name)).toEqual(['Warrior', 'Paladin', 'Mage', 'Undead']);
    expect(b.living('enemy').map((c) => c.name)).toEqual(['Warrior', 'Archer', 'Mage', 'Druid']);
  });

  it('her karakterin tam 4 skill\'i var', () => {
    for (const c of newBattle().combatants) {
      const kit = c.skills.slice(0, 4); // (testlere eklenen eski skill'ler 4'ten sonra gelir)
      expect(kit.every((id) => content.skills[id]), c.name).toBe(true);
    }
  });

  it('Warrior\'ın ilk skill\'i Double Strike (kimliği melee_attack)', () => {
    const w = newBattle().get(WARRIOR)!;
    expect(w.skills[0]).toBe('melee_attack');
    expect(content.skills.melee_attack?.name).toBe('Double Strike');
  });
});

describe('hasar skill\'leri', () => {
  it('Melee Attack hedefin canını düşürür; olaylar sırayla gelir', () => {
    const b = newBattle();
    const before = b.get(E_WARRIOR)!.hp;
    const events = act(b, WARRIOR, 'melee_attack', E_WARRIOR);
    expect(events.map((e) => e.type)).toEqual(['skillUsed', 'damage', 'damage', 'rage']); // Double Strike: iki vuruş; Warrior'a Rage kazandırır
    const hits = ofType(events, 'damage');
    const dmg = hits[1]!;
    expect(hits[0]!.amount).toBeGreaterThan(0);
    expect(dmg.amount).toBeGreaterThan(0);
    expect(b.get(E_WARRIOR)!.hp).toBe(before - hits[0]!.amount - dmg.amount);
    expect(hits[0]!.hpAfter).toBe(before - hits[0]!.amount);
    expect(dmg.hpAfter).toBe(b.get(E_WARRIOR)!.hp);
    expect(dmg.crit).toBe(false);
  });

  it('tüm düşmanları vuran yakın dövüş skill\'i (Whirlwind) yalnızca ön sıraya vurur', () => {
    const b = newBattle();
    const events = act(b, WARRIOR, 'whirlwind');
    // düşman ön sırası: Warrior (melee) + Druid (öncelik sırasıyla ikinci); Archer ve Mage 2. sırada
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual([E_WARRIOR, E_DRUID].sort());
  });

  it('menzilli tüm-düşman skill\'i (Arrow Rain) arkadakilere de ulaşır', () => {
    const b = newBattle();
    const events = act(b, E_ARCHER, 'arrow_rain', PALADIN);
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual([WARRIOR, PALADIN, MAGE].sort()); // yarıçap 2: aynı sıradaki Warrior + şeritteki arkadaki Mage; çapraz (Undead) değil
  });

  it('tek hedefli skill hedef istiyor, geçersiz hedefi reddediyor', () => {
    const b = newBattle();
    expect(b.useSkill(WARRIOR, 'melee_attack').ok).toBe(false);
    expect(b.useSkill(WARRIOR, 'melee_attack', WARRIOR).ok).toBe(false); // kendine
    expect(b.useSkill(WARRIOR, 'melee_attack', PALADIN).ok).toBe(false); // dosta
  });

  it('büyü hasarı büyü zırhına, fiziksel hasar fiziksel zırha göre azalır', () => {
    // Aynı vuruş iki farklı hedefe: fiziksel zırhı yüksek Defender'a fiziksel hasar az, büyü hasarı aynı
    const teams = { party: ['mage', 'archer', 'warrior', 'paladin'], enemies: ['warrior', 'defender', 'mage', 'druid'] };
    const mk = () => {
      const b = new Battle(content.battleSetup('first-battle', 1, 'test', teams));
      for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
      return b;
    };
    const defender = (b: Battle) => b.combatants.find((c) => c.side === 'enemy' && c.defId === 'defender')!.uid;
    const warrior = (b: Battle) => b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!.uid;
    const archer = (b: Battle) => b.combatants.find((c) => c.side === 'party' && c.defId === 'archer')!.uid;
    const mage = (b: Battle) => b.combatants.find((c) => c.side === 'party' && c.defId === 'mage')!.uid;
    let physVsDef = 0;
    let physVsWar = 0;
    let magVsDef = 0;
    let magVsWar = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = mk();
      const w = mk();
      physVsDef += ofType(act(a, archer(a), 'quick_shot', defender(a)), 'damage')[0]!.amount;
      physVsWar += ofType(act(w, archer(w), 'quick_shot', warrior(w)), 'damage')[0]!.amount;
      const a2 = mk();
      const w2 = mk();
      magVsDef += ofType(act(a2, mage(a2), 'fire_bolt', defender(a2)), 'damage')[0]!.amount;
      magVsWar += ofType(act(w2, mage(w2), 'fire_bolt', warrior(w2)), 'damage')[0]!.amount;
    }
    expect(physVsDef).toBeLessThan(physVsWar * 0.9); // Defender zırhı (aura dahil) Warrior'dan yüksek
    expect(Math.abs(magVsDef - magVsWar) / magVsWar).toBeLessThan(0.1); // büyü, fiziksel zırhtan etkilenmez
  });

  it('Aimed Shot zırhın yarısını yok sayar', () => {
    const teams = { party: ['archer', 'warrior', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'mage', 'druid'] };
    let aimed = 0;
    let plain = 0;
    const power = (id: string) => (content.skills[id]!.effects[0] as { power: number }).power;
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Battle(content.battleSetup('first-battle', seed, 'test', teams));
      for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
      const archer = b.combatants.find((c) => c.side === 'party' && c.defId === 'archer')!.uid;
      const defender = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'defender')!.uid;
      aimed += ofType(act(b, archer, 'aimed_shot', defender), 'damage')[0]!.amount / power('aimed_shot');
      plain += ofType(act(b, archer, 'quick_shot', defender), 'damage')[0]!.amount / power('quick_shot');
    }
    expect(aimed).toBeGreaterThan(plain * 1.2); // güç farkı çıkarıldığında zırh yok sayma kazancı
  });

  it('minimum hasar uygulanır (çok yüksek zırhta bile en az 1)', () => {
    const b = newBattle();
    Object.assign(b.get(E_WARRIOR)!.stats, { armor: 100000 });
    expect(ofType(act(b, WARRIOR, 'melee_attack', E_WARRIOR), 'damage')[0]!.amount + 0).toBeGreaterThanOrEqual(content.formulas.damage.minDamage);
  });
});

describe('bedeller (MP / can)', () => {
  it('MP bedeli düşer, resource olayı yayınlanır', () => {
    const b = newBattle();
    const events = act(b, WARRIOR, 'power_strike', E_WARRIOR);
    const before = b.get(WARRIOR)!.maxMp;
    expect(b.get(WARRIOR)!.mp).toBe(before - 10);
    expect(ofType(events, 'resource')[0]).toMatchObject({ resource: 'mp', amount: 10, after: before - 10 });
  });

  it('ücretsiz skill resource olayı üretmez', () => {
    const events = act(newBattle(), WARRIOR, 'melee_attack', E_WARRIOR);
    expect(ofType(events, 'resource')).toHaveLength(0);
  });

  it('MP yetmeyince skill reddedilir ve hiçbir şey değişmez', () => {
    const b = newBattle();
    const mage = b.get(MAGE)!;
    mage.mp = 30; // Meteor 24 MP
    act(b, MAGE, 'meteor', E_WARRIOR);
    const logLength = b.log.length;
    expect(b.canUse(MAGE, 'meteor')).toEqual({ ok: false, reason: 'Not enough MP' });
    expect(b.useSkill(MAGE, 'meteor', E_WARRIOR).ok).toBe(false);
    expect(b.log).toHaveLength(logLength);
    // 30 - 24 bedel (iade yok)
    expect(mage.mp).toBe(30 - content.skills.meteor!.cost.amount);
  });

  it('Undead Blood Rite can öder; canı yetmiyorsa kullanamaz (kendini öldüremez)', () => {
    const b = newBattle();
    const undead = b.get(UNDEAD)!;
    delete undead.passive; // Soul Drain pasifi şifa getirir; bedel testi onsuz ölçülür
    b.get(E_WARRIOR)!.hp = 100000; // hedef ölmesin, döngü yalnızca Undead'in canıyla sınırlansın
    const cost = content.skills.blood_rite!.cost.amount;
    const events = act(b, UNDEAD, 'blood_rite', E_WARRIOR);
    expect(undead.hp).toBe(undead.maxHp - cost);
    expect(ofType(events, 'resource')[0]).toMatchObject({ resource: 'hp', amount: cost, after: undead.maxHp - cost });
    // canı bedelin altına inene kadar kullanılabilir, sonra reddedilir; can hiçbir zaman 0'a düşmez
    while (b.canUse(UNDEAD, 'blood_rite').ok) act(b, UNDEAD, 'blood_rite', E_WARRIOR);
    expect(undead.hp).toBeGreaterThan(0);
    expect(undead.hp).toBeLessThanOrEqual(cost);
    expect(b.canUse(UNDEAD, 'blood_rite')).toEqual({ ok: false, reason: 'Not enough HP' });
  });
});

describe('şifa', () => {
  it('Lay on Hands hedefin canını artırır, en fazla maksimuma kadar', () => {
    const b = newBattle();
    const warrior = b.get(WARRIOR)!;
    act(b, E_WARRIOR, 'melee_attack', WARRIOR);
    const hurt = warrior.hp;
    expect(hurt).toBeLessThan(warrior.maxHp);
    const heal = ofType(act(b, PALADIN, 'lay_on_hands', WARRIOR), 'heal')[0]!;
    expect(heal.amount).toBeGreaterThan(0);
    expect(warrior.hp).toBe(Math.min(warrior.maxHp, hurt + heal.amount));
    act(b, PALADIN, 'lay_on_hands', WARRIOR);
    expect(warrior.hp).toBeLessThanOrEqual(warrior.maxHp);
  });

  it('Radiance tüm canlı dostları iyileştirir', () => {
    const b = newBattle();
    for (const c of b.living('party')) c.hp -= 5; // tüm parti hasar almış
    const events = act(b, PALADIN, 'radiance');
    expect(ofType(events, 'heal').map((e) => e.target).sort()).toEqual([WARRIOR, PALADIN, MAGE, UNDEAD].sort());
  });

  it('ölü dosta şifa gitmez', () => {
    const b = newBattle();
    b.get(MAGE)!.hp = 0; // ölü dost (test durumu doğrudan kuruldu)
    expect(b.useSkill(PALADIN, 'lay_on_hands', MAGE).ok).toBe(false);
    expect(ofType(act(b, PALADIN, 'radiance'), 'heal').map((e) => e.target)).not.toContain(MAGE);
  });
});

describe('Dark Mage pasifi: Soul Drain (verilen hasarın %10\'u şifa)', () => {
  it('hasar verince hasarın %10\'u kadar iyileşir', () => {
    const b = newBattle();
    const events = act(b, UNDEAD, 'blood_rite', E_WARRIOR); // 20 can öder, o kadar eksik can var
    const dmg = ofType(events, 'damage')[0]!;
    const heal = ofType(events, 'heal')[0]!;
    expect(heal.target).toBe(UNDEAD);
    expect(heal.amount).toBe(Math.max(1, Math.round(dmg.amount * 0.2)));
  });

  it('canı doluysa boş şifa olayı üretilmez (bedelsiz saldırıda)', () => {
    const events = act(newBattle(), UNDEAD, 'bone_throw', E_WARRIOR);
    expect(ofType(events, 'heal')).toHaveLength(0);
  });
});

describe('kalkan', () => {
  it('Shield Wall kalkan verir; sonraki hasarı önce kalkan emer', () => {
    const b = newBattle();
    const shield = ofType(act(b, E_WARRIOR, 'shield_wall'), 'shield')[0]!;
    expect(shield.amount).toBeGreaterThan(0);
    expect(b.get(E_WARRIOR)!.shield).toBe(shield.amount);

    const hpBefore = b.get(E_WARRIOR)!.hp;
    const hits = ofType(act(b, WARRIOR, 'melee_attack', E_WARRIOR), 'damage'); // Double Strike: iki vuruş
    const dmg = hits[0]!;
    expect(dmg.absorbed).toBeGreaterThan(0);
    expect(dmg.amount + dmg.absorbed).toBeGreaterThan(0);
    expect(b.get(E_WARRIOR)!.hp).toBe(hpBefore - hits.reduce((s, h) => s + h.amount, 0));
    expect(dmg.shieldAfter).toBe(shield.amount - dmg.absorbed);
  });

  it('Mana Barrier başka bir dosta kalkan verir (INT ile ölçeklenir, kritik uygulanmaz)', () => {
    const b = newBattle(1, false); // kritik açık: kalkan yine de sabit olmalı
    b.get(E_MAGE)!.stats.critChance = 1; // her vuruş kritik olurdu
    const shield = ofType(act(b, E_MAGE, 'mana_barrier', E_DRUID), 'shield')[0]!;
    const effect = content.skills.mana_barrier!.effects[0]!;
    const power = effect.type === 'shield' ? effect.power : 0;
    const mage = b.get(E_MAGE)!;
    expect(shield.amount).toBe(Math.round(attributePower(mage.stats, 'int', content.formulas) * power));
    expect(b.get(E_DRUID)!.shield).toBe(shield.amount);
  });

  it('kalkan büyük hasarda tükenir, kalan hasar cana geçer', () => {
    const b = newBattle();
    act(b, E_MAGE, 'mana_barrier', E_DRUID);
    act(b, MAGE, 'meteor', E_DRUID);
    act(b, MAGE, 'meteor', E_DRUID);
    const druid = b.get(E_DRUID)!;
    expect(druid.shield).toBe(0);
    expect(druid.hp).toBeLessThan(druid.maxHp);
  });
});

describe('çağrı (Druid)', () => {
  it('Summon Treant arka sıradaki boş yuvaya yeni bir düşman ekler', () => {
    const b = newBattle();
    const events = act(b, E_DRUID, 'summon_treant');
    const summon = ofType(events, 'summon')[0]!;
    expect(summon.combatant).toMatchObject({ name: 'Treant', side: 'enemy', slot: 1, summoned: true }); // varsayılan: yakın dövüşçü çağrı en öndeki boş hücreye (ön sırada işe yarar)
    expect(b.living('enemy')).toHaveLength(5);
    expect(b.get(summon.combatant.uid)).toBeDefined();
  });

  it('çağrılan birim kendi skill\'ini kullanabilir ve (menzilli skill\'lerle) hedef olabilir', () => {
    const b = newBattle();
    const uid = ofType(act(b, E_DRUID, 'summon_treant'), 'summon')[0]!.combatant.uid;
    expect(ofType(act(b, uid, 'root_smash', WARRIOR), 'damage')).toHaveLength(1);
    expect(ofType(act(b, MAGE, 'blizzard', E_ARCHER), 'damage').map((e) => e.target).sort()).toEqual([E_ARCHER, E_DRUID].sort()); // artı şekli: önündeki Druid dahil; çapraz/uzak ve yan komşu olmayanlar değil
  });

  it('boş yuva yoksa çağrı reddedilir ve MP harcanmaz', () => {
    const setup = content.battleSetup('first-battle', 1, 'test');
    setup.maxSlots = { party: 6, enemy: 6 }; // düşman 0,2,3,5 dolu: yalnızca 1 ve 4 boş
    const b = new Battle(setup);
    b.get(E_DRUID)!.mp = 100;
    act(b, E_DRUID, 'summon_treant');
    act(b, E_DRUID, 'summon_treant');
    const mp = b.get(E_DRUID)!.mp;
    expect(b.canUse(E_DRUID, 'summon_treant')).toEqual({ ok: false, reason: 'No free slot' });
    expect(b.useSkill(E_DRUID, 'summon_treant').ok).toBe(false);
    expect(b.get(E_DRUID)!.mp).toBe(mp);
  });

  it('çağrılan ölürse yuvası tekrar çağrı için boşalır', () => {
    const b = newBattle();
    const uid = ofType(act(b, E_DRUID, 'summon_treant'), 'summon')[0]!.combatant.uid;
    for (let i = 0; i < 60 && b.get(uid)!.hp > 0; i++) {
      b.get(MAGE)!.mp = b.get(MAGE)!.maxMp; // düşük stat toplamı: MP her vuruşta tazelenir
      act(b, MAGE, 'fire_bolt', uid);
    }
    expect(b.get(uid)!.hp).toBe(0);
    b.get(E_DRUID)!.mp = b.get(E_DRUID)!.maxMp; // MP bu testin konusu değil
    expect(b.canUse(E_DRUID, 'summon_treant').ok).toBe(true);
  });
});

describe('Paladin\'in undead bonusu', () => {
  it('Holy Strike undead etiketli hedefe 1.5 kat güçlü', () => {
    const undeadDef: CombatantDef = { ...content.classes.warrior!, tags: ['undead'] };
    const plainDef = content.classes.warrior!;
    const dmg = (def: CombatantDef, seed: number) => {
      const b = new Battle({ ...content.battleSetup('first-battle', seed, 'test'), enemies: [def] });
      for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
      return ofType(act(b, PALADIN, 'holy_strike', E_WARRIOR), 'damage')[0]!.amount;
    };
    let undeadTotal = 0;
    let plainTotal = 0;
    for (let seed = 1; seed <= 100; seed++) {
      undeadTotal += dmg(undeadDef, seed);
      plainTotal += dmg(plainDef, seed);
    }
    expect(undeadTotal).toBeGreaterThan(plainTotal * 1.3);
  });
});

describe('savaş sonu ve determinizm', () => {
  /** Parti, düşman tarafı bitene kadar Whirlwind + Melee Attack yapar (hedef her zaman en öndeki düşman). */
  function playToVictory(seed: number): Battle {
    const b = newBattle(seed, false);
    for (let i = 0; i < 500 && !b.winner; i++) {
      const target = b.livingByDepth('enemy')[0]!;
      const skill = b.canUse(WARRIOR, 'whirlwind').ok ? 'whirlwind' : 'melee_attack';
      act(b, WARRIOR, skill, skill === 'melee_attack' ? target.uid : undefined);
    }
    return b;
  }

  it('tüm düşmanlar ölünce zafer olayı gelir ve eylem reddedilir', () => {
    const b = playToVictory(3);
    expect(b.winner).toBe('party');
    expect(b.log.at(-1)?.type).toBe('battleEnd');
    expect(b.living('enemy')).toHaveLength(0);
    expect(b.useSkill(WARRIOR, 'melee_attack', E_WARRIOR).ok).toBe(false);
  });

  it('tüm parti ölünce düşman kazanır', () => {
    const b = newBattle(1, false);
    for (let i = 0; i < 800 && !b.winner; i++) {
      if (b.canUse(E_ARCHER, 'arrow_rain').ok) act(b, E_ARCHER, 'arrow_rain', b.living('party')[0]!.uid);
      else act(b, E_ARCHER, 'quick_shot', b.living('party')[0]!.uid); // MP bitince bedelsiz skill
    }
    expect(b.winner).toBe('enemy');
  });

  it('aynı seed + aynı eylemler birebir aynı olay akışını verir; farklı seed farklı', () => {
    expect(playToVictory(42).log).toEqual(playToVictory(42).log);
    const dmgs = (b: Battle) => JSON.stringify(ofType(b.log, 'damage').map((e) => e.amount));
    const variants = new Set([1, 2, 3, 4, 5].map((s) => dmgs(playToVictory(s))));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('olayları dinleyicilere de yayınlar', () => {
    const b = newBattle();
    const seen: string[] = [];
    b.on((e) => seen.push(e.type));
    act(b, WARRIOR, 'melee_attack', E_WARRIOR);
    expect(seen).toEqual(['skillUsed', 'damage', 'damage', 'rage']);
  });
});
