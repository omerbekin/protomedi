import { describe, expect, it } from 'vitest';
import { Battle, Rng, content, magicDamage, physicalDamage } from '../src/engine';
import type { BattleEvent, CombatantDef } from '../src/engine';

const newBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'test'));

// Yuva sırasına göre uid'ler
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

  it('her karakterin tam 3 skill\'i var', () => {
    for (const c of newBattle().combatants) expect(c.skills, c.name).toHaveLength(3);
  });

  it('Warrior\'ın ilk skill\'i Melee Attack', () => {
    const w = newBattle().get(WARRIOR)!;
    expect(w.skills[0]).toBe('melee_attack');
    expect(content.skills.melee_attack?.name).toBe('Melee Attack');
  });
});

describe('hasar skill\'leri', () => {
  it('Melee Attack hedefin canını düşürür; olaylar sırayla gelir', () => {
    const b = newBattle();
    const before = b.get(E_WARRIOR)!.hp;
    const events = act(b, WARRIOR, 'melee_attack', E_WARRIOR);
    expect(events.map((e) => e.type)).toEqual(['skillUsed', 'damage']);
    const dmg = ofType(events, 'damage')[0]!;
    expect(dmg.amount).toBeGreaterThan(0);
    expect(b.get(E_WARRIOR)!.hp).toBe(before - dmg.amount);
    expect(dmg.hpAfter).toBe(b.get(E_WARRIOR)!.hp);
  });

  it('tüm düşmanları vuran skill (Whirlwind) 4 hasar olayı üretir', () => {
    const b = newBattle();
    const events = act(b, WARRIOR, 'whirlwind');
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual([E_WARRIOR, E_ARCHER, E_MAGE, E_DRUID].sort());
  });

  it('tek hedefli skill hedef istiyor, geçersiz hedefi reddediyor', () => {
    const b = newBattle();
    expect(b.useSkill(WARRIOR, 'melee_attack').ok).toBe(false);
    expect(b.useSkill(WARRIOR, 'melee_attack', WARRIOR).ok).toBe(false); // kendine
    expect(b.useSkill(WARRIOR, 'melee_attack', PALADIN).ok).toBe(false); // dosta
  });

  it('büyü hasarı MAG ve RES ile hesaplanır (Mage > Warrior büyüde)', () => {
    const b = newBattle();
    const fire = ofType(act(b, MAGE, 'fire_bolt', E_WARRIOR), 'damage')[0]!;
    const b2 = newBattle();
    const bolt = ofType(act(b2, WARRIOR, 'melee_attack', E_MAGE), 'damage')[0]!;
    expect(fire.amount).toBeGreaterThan(15); // MAG 20 x 1.3 - RES 5 x 0.5 ≈ 23
    expect(bolt.amount).toBeGreaterThan(0);
  });

  it('Archer\'ın Piercing Arrow\'u savunmanın yarısını yok sayar', () => {
    const stats = (atk: number, def: number) => ({ hp: 1, mp: 0, atk, def, mag: 0, res: 0, spd: 0, mpRegen: 0, crit: 0, eva: 0 });
    const f = content.formulas;
    const plain = Array.from({ length: 200 }, (_, i) => physicalDamage(stats(20, 20), stats(0, 20), 1, f, new Rng(i)));
    const pierce = Array.from({ length: 200 }, (_, i) => physicalDamage(stats(20, 20), stats(0, 20), 1, f, new Rng(i), 0.5));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(pierce)).toBeGreaterThan(avg(plain) + 3);
  });

  it('minimum hasar uygulanır', () => {
    const stats = (atk: number, def: number) => ({ hp: 1, mp: 0, atk, def, mag: atk, res: def, spd: 0, mpRegen: 0, crit: 0, eva: 0 });
    expect(physicalDamage(stats(1, 0), stats(0, 999), 1, content.formulas, new Rng(1))).toBe(content.formulas.physicalDamage.minDamage);
    expect(magicDamage(stats(1, 0), stats(0, 999), 1, content.formulas, new Rng(1))).toBe(content.formulas.magicDamage.minDamage);
  });
});

describe('bedeller (MP / can)', () => {
  it('MP bedeli düşer, resource olayı yayınlanır', () => {
    const b = newBattle();
    const events = act(b, WARRIOR, 'power_strike', E_WARRIOR);
    expect(b.get(WARRIOR)!.mp).toBe(20);
    expect(ofType(events, 'resource')[0]).toMatchObject({ resource: 'mp', amount: 10, after: 20 });
  });

  it('ücretsiz skill resource olayı üretmez', () => {
    const events = act(newBattle(), WARRIOR, 'melee_attack', E_WARRIOR);
    expect(ofType(events, 'resource')).toHaveLength(0);
  });

  it('MP yetmeyince skill reddedilir ve hiçbir şey değişmez', () => {
    const b = newBattle();
    act(b, MAGE, 'meteor', E_WARRIOR); // 60 -> 36
    act(b, MAGE, 'meteor', E_WARRIOR); // 36 -> 12
    const logLength = b.log.length;
    expect(b.canUse(MAGE, 'meteor')).toEqual({ ok: false, reason: 'Not enough MP' });
    expect(b.useSkill(MAGE, 'meteor', E_WARRIOR).ok).toBe(false);
    expect(b.log).toHaveLength(logLength);
    expect(b.get(MAGE)!.mp).toBe(12);
  });

  it('Undead Blood Rite can öder; canı yetmiyorsa kullanamaz (kendini öldüremez)', () => {
    const b = newBattle();
    const undead = b.get(UNDEAD)!;
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
    act(b, E_WARRIOR, 'slash', WARRIOR);
    const hurt = b.get(WARRIOR)!.hp;
    expect(hurt).toBeLessThan(120);
    const heal = ofType(act(b, PALADIN, 'lay_on_hands', WARRIOR), 'heal')[0]!;
    expect(heal.amount).toBeGreaterThan(0);
    expect(b.get(WARRIOR)!.hp).toBe(Math.min(120, hurt + heal.amount));
    act(b, PALADIN, 'lay_on_hands', WARRIOR);
    expect(b.get(WARRIOR)!.hp).toBeLessThanOrEqual(120);
  });

  it('Radiance tüm canlı dostları iyileştirir', () => {
    const b = newBattle();
    act(b, E_ARCHER, 'arrow_rain'); // tüm parti hasar alır
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

describe('can emme (Undead)', () => {
  it('Soul Drain verdiği hasar kadar kullanıcıyı iyileştirir', () => {
    const b = newBattle();
    act(b, E_WARRIOR, 'slash', UNDEAD);
    const before = b.get(UNDEAD)!.hp;
    const events = act(b, UNDEAD, 'soul_drain', E_WARRIOR);
    const dmg = ofType(events, 'damage')[0]!;
    const heal = ofType(events, 'heal')[0]!;
    expect(heal.target).toBe(UNDEAD);
    expect(heal.amount).toBe(Math.min(dmg.amount, b.get(UNDEAD)!.maxHp - before));
    expect(b.get(UNDEAD)!.hp).toBe(before + heal.amount);
  });

  it('canı dolu Undead için boş şifa olayı üretilmez', () => {
    const events = act(newBattle(), UNDEAD, 'soul_drain', E_WARRIOR);
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
    const dmg = ofType(act(b, WARRIOR, 'melee_attack', E_WARRIOR), 'damage')[0]!;
    expect(dmg.absorbed).toBeGreaterThan(0);
    expect(dmg.amount + dmg.absorbed).toBeGreaterThan(0);
    expect(b.get(E_WARRIOR)!.hp).toBe(hpBefore - dmg.amount);
    expect(dmg.shieldAfter).toBe(shield.amount - dmg.absorbed);
  });

  it('Mana Barrier başka bir dosta kalkan verir (MAG ile ölçeklenir)', () => {
    const b = newBattle();
    const shield = ofType(act(b, E_MAGE, 'mana_barrier', E_DRUID), 'shield')[0]!;
    expect(shield.amount).toBe(Math.round(18 * 2.5));
    expect(b.get(E_DRUID)!.shield).toBe(shield.amount);
  });

  it('kalkan büyük hasarda tükenir, kalan hasar cana geçer', () => {
    const b = newBattle();
    act(b, E_MAGE, 'mana_barrier', E_DRUID); // 45 kalkan
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
    expect(summon.combatant).toMatchObject({ name: 'Treant', side: 'enemy', slot: 4, summoned: true });
    expect(b.living('enemy')).toHaveLength(5);
    expect(b.get(summon.combatant.uid)).toBeDefined();
  });

  it('çağrılan birim kendi skill\'ini kullanabilir ve hedef olabilir', () => {
    const b = newBattle();
    const uid = ofType(act(b, E_DRUID, 'summon_treant'), 'summon')[0]!.combatant.uid;
    expect(ofType(act(b, uid, 'root_smash', WARRIOR), 'damage')).toHaveLength(1);
    expect(ofType(act(b, WARRIOR, 'whirlwind'), 'damage')).toHaveLength(5);
  });

  it('boş yuva yoksa çağrı reddedilir ve MP harcanmaz', () => {
    const b = newBattle();
    act(b, E_DRUID, 'summon_treant');
    const mp = b.get(E_DRUID)!.mp;
    expect(b.canUse(E_DRUID, 'summon_treant')).toEqual({ ok: false, reason: 'No free slot' });
    expect(b.useSkill(E_DRUID, 'summon_treant').ok).toBe(false);
    expect(b.get(E_DRUID)!.mp).toBe(mp);
  });

  it('çağrılan ölürse yuvası tekrar çağrı için boşalır', () => {
    const b = newBattle();
    const uid = ofType(act(b, E_DRUID, 'summon_treant'), 'summon')[0]!.combatant.uid;
    for (let i = 0; i < 30 && b.get(uid)!.hp > 0; i++) act(b, MAGE, 'fire_bolt', uid);
    // MP biter, bu yüzden Warrior ile bitir
    for (let i = 0; i < 30 && b.get(uid)!.hp > 0; i++) act(b, WARRIOR, 'melee_attack', uid);
    expect(b.get(uid)!.hp).toBe(0);
    expect(b.canUse(E_DRUID, 'summon_treant').ok).toBe(true);
  });
});

describe('Paladin\'in undead bonusu', () => {
  it('Holy Strike undead etiketli hedefe 1.5 kat güçlü', () => {
    const undeadDef: CombatantDef = { ...content.enemies.enemy_warrior!, tags: ['undead'] };
    const plainDef = content.enemies.enemy_warrior!;
    const dmg = (def: CombatantDef, seed: number) => {
      const b = new Battle({ ...content.battleSetup('first-battle', seed, 'test'), enemies: [def] });
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
  /** Parti, düşman tarafı bitene kadar Whirlwind + Melee Attack yapar. */
  function playToVictory(seed: number): Battle {
    const b = newBattle(seed);
    for (let i = 0; i < 500 && !b.winner; i++) {
      const target = b.living('enemy')[0]!;
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
    const b = newBattle();
    for (let i = 0; i < 500 && !b.winner; i++) {
      if (b.canUse(E_ARCHER, 'arrow_rain').ok) act(b, E_ARCHER, 'arrow_rain');
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
    expect(seen).toEqual(['skillUsed', 'damage']);
  });
});
