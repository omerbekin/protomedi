import { describe, expect, it } from 'vitest';
import { Battle, attributePower, content, describeClass, describeSkill, describeStat, nominalBurn, previewSkill } from '../src/engine';
import type { BattleEvent, SkillDef, StatKind } from '../src/engine';
import { installLegacySkills } from './legacy-skills';

installLegacySkills();

/** Test modu, kritik ve dodge kapalı: önizleme aralığı kritiksiz hasarı gösterir. */
function testBattle(seed = 1, teams?: { party: string[]; enemies: string[] }): Battle {
  const b = new Battle(content.battleSetup('first-battle', seed, 'test', teams));
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
}
// first-battle (sabit): party warrior, paladin, mage, undead; enemy warrior, archer, mage, druid
const WARRIOR = 'party-0';
const PALADIN = 'party-1';
const MAGE = 'party-2';
const UNDEAD = 'party-3';
const E_WARRIOR = 'enemy-0';
const E_ARCHER = 'enemy-1';
const E_MAGE = 'enemy-2';
const E_DRUID = 'enemy-3';

const sumBy = (events: BattleEvent[], type: 'damage' | 'heal', target: string) =>
  events
    .filter((e) => e.type === type && e.target === target)
    .reduce((s, e) => s + (e.type === 'damage' ? e.amount + e.absorbed : e.type === 'heal' ? e.amount : 0), 0);

describe('önizleme: hasar', () => {
  const cases: Array<[string, string, string]> = [
    [WARRIOR, 'power_strike', E_DRUID], // yakın dövüş, ön sırada (Warrior + Druid)
    [MAGE, 'meteor', E_WARRIOR],
    [E_ARCHER, 'piercing_arrow', MAGE],
    [PALADIN, 'holy_strike', E_WARRIOR],
    [UNDEAD, 'blood_rite', E_WARRIOR],
    [E_MAGE, 'fire_bolt', UNDEAD],
  ];

  it('gerçek hasar her zaman önizlenen [min, max] aralığının içinde', () => {
    for (const [actor, skill, target] of cases) {
      for (let seed = 1; seed <= 60; seed++) {
        const b = testBattle(seed);
        const p = previewSkill(b, actor, skill, target).find((x) => x.uid === target)!.damage!;
        const events = (b.useSkill(actor, skill, target) as { events: BattleEvent[] }).events;
        const actual = sumBy(events, 'damage', target);
        expect(actual, `${skill} seed ${seed}`).toBeGreaterThanOrEqual(p.min);
        expect(actual, `${skill} seed ${seed}`).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('ortalama aralığın ortasında; min <= avg <= max; kritik üst sınırı max\'tan büyük', () => {
    const b = testBattle();
    for (const [actor, skill, target] of cases) {
      const d = previewSkill(b, actor, skill, target).find((x) => x.uid === target)!.damage!;
      expect(d.min).toBeLessThanOrEqual(d.avg);
      expect(d.avg).toBeLessThanOrEqual(d.max);
      expect(d.critMax).toBeGreaterThan(d.max);
    }
  });

  it('kritik üst sınırı kullanıcının kritik çarpanına göre', () => {
    const b = testBattle();
    const w = b.get(WARRIOR)!;
    w.stats.critMult = 3;
    const d = previewSkill(b, WARRIOR, 'power_strike', E_DRUID)[0]!.damage!;
    expect(d.critMax).toBe(Math.round(d.max * 3));
  });

  it('menzildeki tüm düşmanlar için önizleme döner (Whirlwind: ön sıra; Arrow Rain: şeklindeki herkes)', () => {
    const w = previewSkill(testBattle(), WARRIOR, 'whirlwind');
    expect(w.map((x) => x.uid).sort()).toEqual([E_WARRIOR, E_DRUID].sort());
    for (const x of w) expect(x.damage?.avg).toBeGreaterThan(0);
    const b = testBattle();
    const rain = previewSkill(b, E_ARCHER, 'arrow_rain', PALADIN);
    const cells = b.areaCells('arrow_rain', b.get(PALADIN)!.slot, 'party'); // şekil veriden (3x3)
    expect(rain.map((x) => x.uid).sort()).toEqual(b.living('party').filter((c) => cells.includes(c.slot)).map((c) => c.uid).sort());
  });

  it('tek hedefli skill yalnızca seçilen hedef için önizleme döndürür; menzil dışı/geçersiz hedefte boş', () => {
    const p = previewSkill(testBattle(), WARRIOR, 'power_strike', E_DRUID);
    expect(p).toHaveLength(1);
    expect(p[0]!.uid).toBe(E_DRUID);
    expect(previewSkill(testBattle(), WARRIOR, 'power_strike', WARRIOR)).toHaveLength(0); // dost
    expect(previewSkill(testBattle(), WARRIOR, 'power_strike', E_MAGE)).toHaveLength(0); // menzil dışı (3. sıra)
  });

  it('kalkan hasarı önce emer: cana ulaşan hasar azalır; büyü kalkanı yalnızca büyüyü emer', () => {
    const b = testBattle();
    const bare = previewSkill(b, WARRIOR, 'power_strike', E_WARRIOR)[0]!.damage!;
    const soak = Math.max(1, Math.floor(bare.avg / 2));
    b.get(E_WARRIOR)!.shield = soak;
    const shielded = previewSkill(b, WARRIOR, 'power_strike', E_WARRIOR)[0]!.damage!;
    expect(shielded.avg).toBe(bare.avg);
    expect(shielded.absorbed).toBe(soak);
    expect(shielded.hpLoss).toBe(bare.hpLoss - soak);
    b.get(E_WARRIOR)!.shield = 1000;
    const wall = previewSkill(b, WARRIOR, 'power_strike', E_WARRIOR)[0]!.damage!;
    expect(wall.hpLoss).toBe(0);
    expect(wall.lethal).toBeNull();

    const c = testBattle();
    c.get(E_WARRIOR)!.magicShield = 1000;
    expect(previewSkill(c, MAGE, 'meteor', E_WARRIOR)[0]!.damage!.hpLoss).toBe(0); // büyü: emilir
    expect(previewSkill(c, WARRIOR, 'power_strike', E_WARRIOR)[0]!.damage!.hpLoss).toBeGreaterThan(0); // fiziksel: emilmez
  });

  it('öldürücülük: düşük canda "sure", sınırda "maybe", yüksek canda yok', () => {
    const b = testBattle();
    const t = b.get(E_DRUID)!;
    const d = previewSkill(b, WARRIOR, 'power_strike', E_DRUID)[0]!.damage!;
    t.hp = 1;
    expect(previewSkill(b, WARRIOR, 'power_strike', E_DRUID)[0]!.damage!.lethal).toBe('sure');
    t.hp = d.max; // en yüksek zarda öldürür, en düşükte öldürmez
    expect(d.min).toBeLessThan(d.max);
    expect(previewSkill(b, WARRIOR, 'power_strike', E_DRUID)[0]!.damage!.lethal).toBe('maybe');
    t.hp = t.maxHp;
    expect(previewSkill(b, WARRIOR, 'power_strike', E_DRUID)[0]!.damage!.lethal).toBeNull();
  });

  it('hasar hedefin mevcut canıyla sınırlı (fazla vuruş cana yazılmaz)', () => {
    const b = testBattle();
    b.get(E_ARCHER)!.hp = 3;
    const d = previewSkill(b, MAGE, 'meteor', E_ARCHER).find((x) => x.uid === E_ARCHER)!.damage!;
    expect(d.hpLoss).toBe(3);
    expect(d.avg).toBeGreaterThan(3);
  });

  it('undead\'e karşı bonus önizlemeye yansır', () => {
    const b = testBattle();
    const plain = previewSkill(b, PALADIN, 'holy_strike', E_WARRIOR)[0]!.damage!.avg;
    b.get(E_WARRIOR)!.tags.push('undead');
    const undead = previewSkill(b, PALADIN, 'holy_strike', E_WARRIOR)[0]!.damage!.avg;
    expect(undead).toBeGreaterThan(plain * 1.3);
  });

  it('zırh önizlemeye yansır: yüksek zırhlı hedefe daha az, yüzdesel olarak', () => {
    const teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] };
    const b = testBattle(1, teams);
    const defender = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'defender')!;
    const warrior = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    const w = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    const vsDef = previewSkill(b, w.uid, 'melee_attack', defender.uid)[0]!.damage!.avg;
    const vsWar = previewSkill(b, w.uid, 'melee_attack', warrior.uid)[0]!.damage!.avg;
    expect(vsDef).toBeLessThan(vsWar);
  });

  it('çağrılan birime önizleme %100 fazla hasar gösterir', () => {
    const b = testBattle();
    act(b, E_DRUID, 'summon_treant');
    const treant = b.combatants.find((c) => c.summoned)!;
    treant.hp = treant.maxHp = 100000;
    const asSummon = previewSkill(b, MAGE, 'fire_bolt', treant.uid)[0]!.damage!.avg;
    treant.summoned = false;
    const asNormal = previewSkill(b, MAGE, 'fire_bolt', treant.uid)[0]!.damage!.avg;
    expect(asSummon).toBeGreaterThanOrEqual(asNormal * 2 - 1);
    expect(asSummon).toBeLessThanOrEqual(asNormal * 2 + 1);
  });

  it('önizleme savaşı değiştirmez ve RNG\'ye dokunmaz (önizlemeli ve önizlemesiz savaş birebir aynı)', () => {
    const a = testBattle(7);
    const b = testBattle(7);
    for (let i = 0; i < 5; i++) previewSkill(a, WARRIOR, 'whirlwind');
    previewSkill(a, MAGE, 'meteor', E_WARRIOR);
    expect(a.log).toHaveLength(b.log.length);
    a.useSkill(WARRIOR, 'whirlwind');
    b.useSkill(WARRIOR, 'whirlwind');
    expect(a.log).toEqual(b.log);
  });
});

function act(b: Battle, actor: string, skill: string, target?: string): BattleEvent[] {
  const r = b.useSkill(actor, skill, target);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
}

describe('önizleme: şifa, kalkan, tur bazlı şifa, mana yakma, durumlar', () => {
  it('şifa eksik canla sınırlı ve gerçek şifa aralığın içinde', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = testBattle(seed);
      b.get(WARRIOR)!.hp = 50;
      const p = previewSkill(b, PALADIN, 'lay_on_hands', WARRIOR)[0]!.heal!;
      const events = (b.useSkill(PALADIN, 'lay_on_hands', WARRIOR) as { events: BattleEvent[] }).events;
      const actual = sumBy(events, 'heal', WARRIOR);
      expect(actual, `seed ${seed}`).toBeGreaterThanOrEqual(p.min);
      expect(actual, `seed ${seed}`).toBeLessThanOrEqual(p.max);
    }
  });

  it('canı dolu hedefe şifa önizlemesi 0', () => {
    expect(previewSkill(testBattle(), PALADIN, 'lay_on_hands', WARRIOR)[0]!.heal!.avg).toBe(0);
  });

  it('Radiance herkese etki eder: her canlı dosta şifa, her canlı düşmana hasar önizlemesi', () => {
    const p = previewSkill(testBattle(), PALADIN, 'radiance');
    expect(p.filter((x) => x.heal)).toHaveLength(4);
    expect(p.filter((x) => x.damage)).toHaveLength(4);
    expect(p.filter((x) => x.heal).every((x) => x.uid.startsWith('party'))).toBe(true);
    expect(p.filter((x) => x.damage).every((x) => x.uid.startsWith('enemy'))).toBe(true);
  });

  it('kalkan önizlemesi gerçek kalkanla birebir aynı (kritik uygulanmaz); büyü kalkanı işaretlenir', () => {
    const b = testBattle();
    const p = previewSkill(b, E_MAGE, 'mana_barrier', E_ARCHER)[0]!.shield!;
    expect(p.magic).toBe(false);
    b.useSkill(E_MAGE, 'mana_barrier', E_ARCHER);
    expect(b.get(E_ARCHER)!.shield).toBe(p.amount);
    const self = previewSkill(b, E_WARRIOR, 'shield_wall')[0]!;
    expect(self.uid).toBe(E_WARRIOR);
    b.useSkill(E_WARRIOR, 'shield_wall');
    expect(b.get(E_WARRIOR)!.shield).toBe(self.shield!.amount);

    const am = testBattle(1, { party: ['antimage', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'druid'] });
    const amUid = am.combatants.find((c) => c.side === 'party' && c.defId === 'antimage')!.uid;
    expect(previewSkill(am, amUid, 'spell_ward', amUid)[0]!.shield!.magic).toBe(true); // madde 240: tek dost (kendisi dahil)
  });

  it('tur bazlı şifa (Rejuvenate): tur başına miktar, tur sayısı ve eksik canla sınırlı toplam', () => {
    const b = testBattle(1, { party: ['warrior', 'druid', 'mage', 'archer'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    const druid = b.combatants.find((c) => c.side === 'party' && c.defId === 'druid')!;
    const warrior = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    warrior.hp = warrior.maxHp - 5;
    const p = previewSkill(b, druid.uid, 'rejuvenate', warrior.uid)[0]!;
    expect(p.hot).toBeDefined();
    expect(p.heal?.avg).toBe(5); // başlangıç şifası da var (eksik canla sınırlı)
    expect(p.hot!.turns).toBe(3);
    expect(p.hot!.perTurn).toBe(Math.round(attributePower(druid.stats, 'int', content.formulas) * (content.skills.rejuvenate!.effects.find((e) => e.type === 'hot') as { power: number }).power));
    expect(p.hot!.total).toBe(5); // eksik can 5 ile sınırlı
  });

  it('mana yakma önizlemesi hedefin elindeki manayla sınırlı', () => {
    const teams = { party: ['antimage', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'druid'] };
    const b = testBattle(1, teams);
    const am = b.combatants.find((c) => c.side === 'party' && c.defId === 'antimage')!.uid;
    const target = b.combatants.find((c) => c.side === 'enemy' && c.defId === 'warrior')!;
    expect(previewSkill(b, am, 'mana_burn', target.uid)[0]!.burn).toBe(10);
    target.mp = 3;
    expect(previewSkill(b, am, 'mana_burn', target.uid)[0]!.burn).toBe(3);
    const center = b.livingByDepth('enemy')[0]!;
    const field = previewSkill(b, am, 'drain_field', center.uid);
    expect(field).toHaveLength(b.areaWindow(am, 'drain_field', center.uid).length);
    // Madde 260: yakım hedefin maks MP'sinin yüzdesi (nominalBurn), mevcut manayla sınırlı
    const eff = content.skills.drain_field!.effects[0] as Parameters<typeof nominalBurn>[0];
    for (const x of field) expect(x.burn ?? 0).toBe(Math.min(b.get(x.uid)!.mp, nominalBurn(eff, b.get(x.uid)!)));
  });

  it('taunt ve guard durum metni verir', () => {
    const b = testBattle(1, { party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'druid'] });
    const d = b.combatants.find((c) => c.side === 'party' && c.defId === 'defender')!;
    const w = b.combatants.find((c) => c.side === 'party' && c.defId === 'warrior')!;
    expect(previewSkill(b, d.uid, 'taunt')[0]!.statuses).toEqual(['Taunt 2 turns']);
    expect(previewSkill(b, d.uid, 'guard', w.uid)[0]!.statuses).toEqual(['Guard 3 turns']);
    expect(previewSkill(b, d.uid, 'taunt')[0]!.shield!.amount).toBeGreaterThan(0); // taunt kalkan da verir
  });

  it('Fist Crush rastgele hedefli: önizleme yok', () => {
    const teams = { party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'druid'] };
    const b = testBattle(1, teams);
    const d = b.combatants.find((c) => c.side === 'party' && c.defId === 'defender')!;
    expect(previewSkill(b, d.uid, 'fist_crush')).toEqual([]);
  });
});

describe('skill açıklaması (tooltip)', () => {
  const stats = content.classes.warrior!.stats;
  const f = content.formulas;
  const info = (id: string, s = stats) => describeSkill(content.skills[id]!, s, f, content.summons);
  const text = (id: string) => info(id).lines.join('\n');

  it('hedef biçimi, bedel ve bekleme süresi okunur metin olarak gelir', () => {
    expect(info('power_strike')).toMatchObject({ name: 'Power Strike', target: 'One enemy', cost: '10 MP', cooldown: '2 turns' });
    expect(info('whirlwind').target).toBe('All enemies');
    expect(info('lay_on_hands').target).toBe('One ally');
    expect(info('radiance').target).toBe('Everyone');
    expect(info('shield_wall').target).toBe('Self');
    expect(info('melee_attack')).toMatchObject({ cost: 'Free', cooldown: 'None' });
    expect(info('blood_rite').cost).toBe('20 HP');
  });

  it('hasar ölçeği hangi özelliğe bağlı olduğunu, yüzdeyi ve ham değeri yazar', () => {
    expect(text('power_strike')).toContain('Damage 200% STR');
    expect(text('power_strike')).toContain(`(${Math.round(stats.str * f.scaling.str * 2)})`);
    expect(text('fire_bolt')).not.toContain('Magic'); // damage tipi yazılmaz, renk verir
    expect(text('fire_bolt')).toContain('% INT');
    expect(text('quick_shot')).toContain('% DEX');
    expect(text('blood_rite')).toContain('% INT'); // Dark Mage'in karanlık skill'i INT'e bağlı
  });

  it('özel kurallar: zırh yok sayma, arkaya sıçrama, can emme, undead bonusu, eksik mana, tüketilen kalkan', () => {
    expect(text('aimed_shot')).toContain('Ignores 50% of armor');
    expect(text('piercing_arrow')).not.toContain('Ignores');
    expect(text('piercing_arrow')).toContain('30% less damage than the previous one');
    expect(text('judgment')).toContain('Leaves');
    expect(text('void_strike')).toContain('missing mana of the target');
  });

  it('şifa, tur bazlı şifa, kalkan, büyü kalkanı, çağrı, taunt, guard, mana yakma açıklanır', () => {
    expect(text('lay_on_hands')).toContain('Heal 250% INT');
    expect(text('rejuvenate')).toContain('per turn for 3 turns');
    expect(text('shield_wall')).toContain('Shield 110% STR');
    expect(text('spell_ward')).toContain('Magic shield');
    expect(text('summon_treant')).toContain('Summons Treant');
    expect(text('summon_treant')).toContain('for 3 turns');
    expect(text('summon_treant')).toContain('Summons take x2 damage');
    expect(text('taunt')).toContain('must target you');
    expect(text('guard')).toContain(`take ${Math.round((content.skills.guard!.effects.find((e) => e.type === 'guard') as { share: number }).share * 100)}% of the damage`);
    expect(text('mana_burn')).toContain('Steals 10 MP'); // Mana Steal: kısmen kendine geçer
  });

  it('yakın dövüş skill\'leri menzil kuralını söyler; menzilli olanlar söylemez', () => {
    expect(text('melee_attack')).toContain('Melee: front row only');
    expect(text('whirlwind')).toContain('Melee: front row only');
    expect(text('fire_bolt')).not.toContain('Melee:');
    expect(text('shield_wall')).not.toContain('Melee:'); // kendine skill
  });

  it('skill tooltip\'inde kritik ve accuracy bilgisi yazılmaz (stat tooltip\'inde kalır)', () => {
    for (const id of ['melee_attack', 'lay_on_hands', 'rejuvenate', 'shield_wall', 'spell_ward']) {
      expect(text(id)).not.toContain('Crit ');
      expect(text(id)).not.toContain('Accuracy');
    }
  });

  it('her skill için en az bir açıklama satırı var', () => {
    for (const [id, skill] of Object.entries(content.skills)) {
      expect(describeSkill(skill, stats, f, content.summons).lines.length, id).toBeGreaterThan(0);
    }
  });
});

describe('stat açıklaması (tooltip)', () => {
  const f = content.formulas;
  const w = content.classes.warrior!.stats;
  const text = (k: StatKind) => {
    const i = describeStat(k, w, f);
    return `${i.title}\n${i.lines.join('\n')}`;
  };

  it('her stat türü bir başlık ve en az bir açıklama satırı verir', () => {
    const kinds: StatKind[] = ['hp', 'mp', 'str', 'int', 'dex', 'luck', 'spd', 'critChance', 'accuracy', 'evasion', 'armor', 'magicArmor'];
    for (const k of kinds) {
      const i = describeStat(k, w, f);
      expect(i.title.length, k).toBeGreaterThan(0);
      expect(i.lines.length, k).toBeGreaterThan(0);
    }
  });

  it('Strength: can ve STR skill hasarı', () => {
    expect(text('str')).toContain(`Strength ${w.str}`);
    expect(text('str')).toContain(`+${f.attributes.hpPerStr} per point (now ${w.hp})`);
    expect(text('str')).toContain('Strength skills');
  });

  it('Intelligence: mana ve INT skill gücü', () => {
    expect(text('int')).toContain(`${f.attributes.mpBase} base + ${f.attributes.mpPerInt} per point (now ${w.mp})`);
    expect(text('int')).toContain('Intelligence skills');
  });

  it('Dexterity: hız, kaçınma (evasion) ve DEX skill hasarı', () => {
    expect(text('dex')).toContain('Speed');
    expect(text('dex')).toContain('Evasion');
    expect(text('dex')).toContain(`max ${Math.round(f.attributes.evasionMax * 100)}%`);
    expect(text('dex')).toContain('Dexterity skills');
  });

  it('Luck: kritik şansı ve accuracy; kritik hasar SABİT (luck artırmaz); kritik hasar/şifada, kalkanda değil', () => {
    expect(text('luck')).toContain('Crit chance');
    expect(text('luck')).toContain('Accuracy');
    expect(text('luck')).toContain(`fixed at x${f.attributes.critMult}`);
    expect(text('luck')).not.toMatch(/Crit damage: +/);
    expect(text('luck')).toContain('never of shields');
  });

  it('Armor: yüzdesel azaltma ve azalan getiri; büyü zırhı yoksa bunu söyler', () => {
    expect(text('armor')).toContain('Reduces physical damage taken by');
    expect(text('armor')).toContain('Diminishing returns');
    expect(text('magicArmor')).toContain('No magic armor');
    const am = content.classes.antimage!.stats;
    expect(describeStat('magicArmor', am, f).lines.join('\n')).toContain('Reduces magic damage taken by');
  });

  it('class özeti: özellikler, türev stat\'lar, zırh ve skill isimleri', () => {
    const i = describeClass(content.classes.defender!, content.skills, f);
    const t = i.lines.join('\n');
    expect(i.title).toBe('Defender');
    expect(t).toContain(`STR ${content.classes.defender!.attributes.str}`);
    expect(t).toContain('Skills: Tremor Slam, Taunt, Guard, Fist Crush');
    expect(t).toContain(`Armor ${content.classes.defender!.stats.armor}`);
    expect(describeClass(content.classes.antimage!, content.skills, f).lines.join('\n')).toContain(`Magic armor ${content.classes.antimage!.stats.magicArmor}`);
  });
});

describe('skill rozeti ve primary bonus adı (UI)', () => {
  const f = content.formulas;
  const st = content.classes.warrior!.stats;

  it('alan rozeti şekli (Row / Column / Block RxC / Cross), Random rozeti sayıyı taşır; açıklama satırlarında tekrarlanmaz', () => {
    const badge = (a: NonNullable<SkillDef['area']>) => (a.shape === 'rect' ? `Block ${a.rows}x${a.cols}` : { row: 'Row', column: 'Column', plus: 'Cross', x: 'X' }[a.shape]);
    for (const area of Object.values(content.skills).filter((s) => s.target === 'area_enemies' || s.target === 'area_any')) {
      const info = describeSkill(area, st, f);
      expect(info.targetBadge, area.id).toBe(badge(area.area!));
      expect(info.lines.join('\n')).not.toMatch(/radius|Block \d/i);
    }
    const rnd = Object.values(content.skills).find((s) => s.target === 'random_enemies')!;
    const info2 = describeSkill(rnd, st, f);
    expect(info2.targetBadge).toBe(`Random · ${rnd.count ?? 3}`);
    expect(info2.lines.join('\n')).not.toMatch(/random enemies/i);
    const single = Object.values(content.skills).find((s) => s.target === 'single_enemy')!;
    expect(describeSkill(single, st, f).targetBadge).toBe('Single Target');
  });

  it("primary stat bonus adı: str Resilience, dex Hunter's Mark, int Mana Echo, luck Lucky Escape; pasifse soluk (active=false)", () => {
    const names = { str: 'Resilience', dex: "Hunter's Mark", int: 'Mana Echo', luck: 'Lucky Escape' } as const;
    for (const k of ['str', 'dex', 'int', 'luck'] as const) {
      const on = describeStat(k, { ...st, primary: k, primaryActive: true }, f);
      expect(on.bonus?.name).toBe(names[k]);
      expect(on.bonus?.active).toBe(true);
      const off = describeStat(k, { ...st, primary: k, primaryActive: false }, f);
      expect(off.bonus?.active).toBe(false);
      expect(off.lines.join('\n')).toContain('Inactive');
      const other = describeStat(k, { ...st, primary: undefined, primaryActive: false }, f);
      expect(other.bonus).toBeUndefined();
    }
  });

  it('stat tooltip\'leri statın vermediği şeyi söylemez (dex: dodge yok notu kalktı)', () => {
    for (const k of ['str', 'dex', 'int', 'luck', 'hp', 'mp', 'spd', 'armor', 'magicArmor'] as const) {
      const t = describeStat(k, { ...st, primary: undefined }, f).lines.join('\n');
      expect(t, k).not.toMatch(/gives no|rare, few/i);
    }
    // Str/Int regen satırları veriden gelir; Luck evasion/dodge vermez
    expect(describeStat('luck', { ...st, primary: undefined }, f).lines.join('\n')).not.toMatch(/evasion|dodge/i);
    expect(describeStat('str', { ...st, primary: undefined }, f).lines.join('\n')).toContain(`+${f.attributes.hpRegenPerStr} per point`);
    expect(describeStat('int', { ...st, primary: undefined }, f).lines.join('\n')).toContain(`+${f.attributes.mpRegenPerInt} per point`);
  });
});
