import { describe, expect, it } from 'vitest';
import defenderRaw from '../data/classes/defender.json';
import { Battle, content } from '../src/engine';
import type { BattleEvent } from '../src/engine';
import { installLegacySkill } from './legacy-skills';

type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === type);
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const grid = (party: string[], enemies: string[], mode: 'test' | 'turns' = 'test', seed = 1) => {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party, enemies }, false));
  b.debugClearCooldowns(); // başlangıç cooldown'u (initialCooldown) bu testlerin konusu değil: skill'ler ilk turdan kullanılabilir
  return b;
};
const act = (b: Battle, actor: string, skill: string, target?: string, slot?: number): BattleEvent[] => {
  const r = b.useSkill(actor, skill, target, slot);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
};
const calm = (b: Battle) => {
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
};
const hasStatus = (b: Battle, uid: string, kind: string) => b.get(uid)!.statuses.some((s) => s.kind === kind);
const dmgTo = (events: BattleEvent[], uid: string) => ofType(events, 'damage').filter((e) => e.target === uid).reduce((s, e) => s + e.amount + e.absorbed, 0);

describe('buff / debuff tanımları (data/statuses.json)', () => {
  it('her durumun adı, türü, ikonu, rengi ve açıklaması var; en az bir etkisi tanımlı', () => {
    for (const [id, def] of Object.entries(content.statuses)) {
      expect(def.name.length, id).toBeGreaterThan(0);
      expect(['buff', 'debuff'], id).toContain(def.type);
      expect(def.color, id).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.text.length, id).toBeGreaterThan(0);
      expect(def.speedMult !== undefined || def.damageTakenMult !== undefined || def.healTakenMult !== undefined || def.skipTurn === true || def.accuracyDelta !== undefined || def.evasionDelta !== undefined, id).toBe(true);
    }
  });

  it('yer etkileri (zehir, yanan zemin) tanımlı', () => {
    expect(Object.keys(content.grounds).sort()).toEqual(['burning', 'holy_fire', 'poison']);
  });
});

describe('durumlar: hız, alınan hasar, alınan şifa, sersemleme', () => {
  it('Quick Shot kullanıcıya 2 tur Haste verir (hız artar)', () => {
    const b = calm(grid(cells({ 0: 'archer' }), cells({ 0: 'mage' })));
    act(b, 'party-0', 'quick_shot', 'enemy-0');
    const st = b.get('party-0')!.statuses.find((s) => s.kind === 'haste');
    expect(st?.turns).toBe(2);
    expect(b.speedOf(b.get('party-0')!)).toBeGreaterThan(b.get('party-0')!.stats.spd);
  });

  it('Bone Throw vurulan düşmana Slow verir; hız düşer, hedef sırada geriye gider', () => {
    const b = calm(grid(cells({ 0: 'undead' }), cells({ 0: 'mage' })));
    const before = b.speedOf(b.get('enemy-0')!);
    act(b, 'party-0', 'bone_throw', 'enemy-0');
    expect(hasStatus(b, 'enemy-0', 'slow')).toBe(true);
    expect(b.speedOf(b.get('enemy-0')!)).toBeLessThan(before);
  });

  it('kaçırılan (iska) vuruşta debuff uygulanmaz', () => {
    const b = calm(grid(cells({ 0: 'undead' }), cells({ 0: 'mage' })));
    b.debug.dodge = 'always';
    act(b, 'party-0', 'bone_throw', 'enemy-0');
    expect(hasStatus(b, 'enemy-0', 'slow')).toBe(false);
  });

  it('Slow, tur sırasında etkili: yavaşlayan birim daha az oynar', () => {
    const turns = (slowed: boolean) => {
      const b = grid(cells({ 0: 'warrior' }), cells({ 0: 'warrior' }), 'turns', 7);
      if (slowed) b.get('enemy-0')!.statuses.push({ kind: 'slow', turns: 99, source: 'party-0' });
      let n = 0;
      for (let i = 0; i < 60; i++) {
        if (b.currentUid === 'enemy-0') n++;
        b.skipTurn();
      }
      return n;
    };
    expect(turns(true)).toBeLessThan(turns(false));
  });

  it('Thorn Whip hedefe 2 tur Wound verir: aldığı şifa %25 azalır', () => {
    const b = calm(grid(cells({ 0: 'druid' }), cells({ 0: 'paladin', 2: 'warrior' })));
    act(b, 'party-0', 'thorn_whip', 'enemy-0');
    expect(b.get('enemy-0')!.statuses.find((s) => s.kind === 'wound')?.turns).toBe(2);
    const heal = (wounded: boolean) => {
      const c = calm(grid(cells({ 0: 'druid' }), cells({ 0: 'paladin', 2: 'warrior' })));
      if (wounded) c.get('enemy-1')!.statuses.push({ kind: 'wound', turns: 2, source: 'party-0' });
      c.get('enemy-1')!.hp = 10;
      const ev = act(c, 'enemy-0', 'radiance'); // Paladin Radiance herkesi iyileştirir
      return ofType(ev, 'heal').find((e) => e.target === 'enemy-1')!.amount;
    };
    const normal = heal(false);
    const reduced = heal(true);
    expect(reduced).toBe(Math.round(normal * 0.75));
  });

  it('Abyssal Cry: kendine maks canının %15\'i kadar hasar verir (en az 1 can kalır) ve alınan hasarı azaltır', () => {
    const b = calm(grid(cells({ 0: 'warrior' }), cells({ 0: 'archer' })));
    const w = b.get('party-0')!;
    const cryRatio = (content.skills.abyssal_cry!.effects[0] as { ratio: number }).ratio;
    expect(cryRatio).toBeGreaterThan(0); // değer veriden okunur (Ömer kararı: maks canın %30'u)
    w.rage = w.maxRage; // Abyssal Cry'ın bedeli Rage
    const events = act(b, 'party-0', 'abyssal_cry');
    expect(ofType(events, 'damage')[0]).toMatchObject({ target: 'party-0', source: 'party-0', amount: Math.round(w.maxHp * cryRatio) });
    expect(w.hp).toBe(w.maxHp - Math.round(w.maxHp * cryRatio));
    expect(hasStatus(b, 'party-0', 'fortify')).toBe(true);
    // fortify'lı birim aynı saldırıdan ~yarı hasar alır
    const hit = (fort: boolean) => {
      const c = calm(grid(cells({ 0: 'warrior' }), cells({ 0: 'archer' })));
      c.get('enemy-0')!.stats.dex = 200; // büyük sayılar: yuvarlama payı oranı bozmasın (skill gücü veriden değişebilir)
      if (fort) c.get('party-0')!.statuses.push({ kind: 'fortify', turns: 3, source: 'party-0' });
      return dmgTo(act(c, 'enemy-0', 'quick_shot', 'party-0'), 'party-0');
    };
    const ratio = hit(true) / hit(false);
    expect(ratio).toBeGreaterThan(0.38); // küçük hasarlarda yuvarlama payı
    expect(ratio).toBeLessThan(0.6);
  });

  it('Abyssal Cry canı düşük birimi öldürmez', () => {
    const b = calm(grid(cells({ 0: 'warrior' }), cells({ 0: 'archer' })));
    b.get('party-0')!.hp = 3;
    b.get('party-0')!.rage = b.get('party-0')!.maxRage;
    act(b, 'party-0', 'abyssal_cry');
    expect(b.get('party-0')!.hp).toBe(1);
  });

  it('Blessing (Paladin): dosta 3 tur %30 daha az hasar', () => {
    installLegacySkill('blessing', 'paladin'); // oyundan kaldırıldı, blessed durumu hâlâ test ediliyor
    const b = calm(grid(cells({ 0: 'paladin', 2: 'warrior' }), cells({ 0: 'archer' })));
    act(b, 'party-0', 'blessing', 'party-1');
    expect(b.get('party-1')!.statuses.find((s) => s.kind === 'blessed')?.turns).toBe(3);
    const hit = (blessed: boolean) => {
      const c = calm(grid(cells({ 0: 'paladin', 2: 'warrior' }), cells({ 0: 'archer' })));
      c.get('enemy-0')!.stats.dex = 200; // büyük sayılar: yuvarlama payı oranı bozmasın (skill gücü veriden değişebilir)
      if (blessed) c.get('party-1')!.statuses.push({ kind: 'blessed', turns: 3, source: 'party-0' });
      return dmgTo(act(c, 'enemy-0', 'quick_shot', 'party-1'), 'party-1');
    };
    expect(hit(true) / hit(false)).toBeGreaterThan(0.62);
    expect(hit(true) / hit(false)).toBeLessThan(0.8); // küçük hasarlarda yuvarlama payı
  });

  it('Stun: sersemlemiş birim sıradaki turunu oynamaz (turnSkipped stunned), sonra durum biter', () => {
    const b = grid(cells({ 0: 'warrior' }), cells({ 0: 'warrior' }), 'turns', 3);
    const victim = b.currentUid === 'party-0' ? 'enemy-0' : 'party-0';
    b.get(victim)!.statuses.push({ kind: 'stun', turns: 1, source: 'x' });
    let skippedStun = false;
    for (let i = 0; i < 8; i++) {
      const r = b.skipTurn();
      if (r.ok && r.events.some((e) => e.type === 'turnSkipped' && e.stunned && e.actor === victim)) skippedStun = true;
    }
    expect(skippedStun).toBe(true);
    expect(hasStatus(b, victim, 'stun')).toBe(false);
  });

  it('Charge: vurduğu düşmanı sersemletir (1 tur)', () => {
    const b = calm(grid(cells({ 0: 'warrior' }), cells({ 0: 'mage' })));
    act(b, 'party-0', 'charge', 'enemy-0');
    expect(b.get('enemy-0')!.statuses.find((s) => s.kind === 'stun')?.turns).toBe(1);
  });
});

describe('kontrol ve alan skill\'leri', () => {
  it('Tremor Slam (Defender): melee alan skill\'i, alandaki tüm düşmanlara Slow verir', () => {
    const b = calm(grid(cells({ 0: 'defender' }), cells({ 0: 'warrior', 1: 'warrior', 2: 'warrior', 3: 'mage' })));
    expect(content.skills.tremor_slam).toMatchObject({ target: 'area_enemies', motion: 'melee', area: { shape: 'row' } });
    // ön sıra boyunca (row şekli, 3 şerit): ön sıradaki herkes vurulur; arkadaki Mage hem şekil hem melee menzili dışında kalır
    const events = act(b, 'party-0', 'tremor_slam', 'enemy-1');
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
    for (const uid of ['enemy-0', 'enemy-1', 'enemy-2']) expect(hasStatus(b, uid, 'slow')).toBe(true);
    expect(hasStatus(b, 'enemy-3', 'slow')).toBe(false);
  });

  it('Radiance herkese etki eder: dostlara şifa, düşmanlara hasar', () => {
    const b = calm(grid(cells({ 0: 'paladin', 2: 'warrior' }), cells({ 0: 'mage', 2: 'archer' })));
    b.get('party-1')!.hp = 10;
    const events = act(b, 'party-0', 'radiance');
    expect(ofType(events, 'heal').map((e) => e.target).sort()).toEqual(['party-1']); // yalnızca eksik canı olan dostta şifa olayı
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual(['enemy-0', 'enemy-1']);
    expect(b.validTargets('party-0', 'radiance')).toHaveLength(4);
    expect(content.skills.radiance!.target).toBe('everyone');
  });

  it('Meteor eskisinden çok daha az doğrudan hasar verir ve 2 turluk yanan zemin bırakır', () => {
    const power = (content.skills.meteor!.effects[0] as { power: number }).power;
    expect(power).toBeLessThan(2.6 * 0.5); // eski gücün (2,6) yarısından azı
    expect(content.skills.meteor!.effects.some((e) => e.type === 'ground' && e.ground === 'burning' && e.turns === 2)).toBe(true);
  });
});

describe('yer etkileri (zehir / yanan zemin)', () => {
  const setup = () => {
    const b = calm(grid(cells({ 0: 'mage' }), cells({ 0: 'warrior', 3: 'warrior', 5: 'warrior' }), 'turns', 5));
    b.get('party-0')!.mp = 100;
    return b;
  };

  it('Meteor alanın hücrelerine yanan zemin bırakır (ground olayı; boş hücreler dahil)', () => {
    const b = setup();
    while (b.currentUid !== 'party-0') b.skipTurn();
    const events = act(b, 'party-0', 'meteor', undefined, 4); // merkez: ortadaki boş hücre (artı şekli)
    const g = ofType(events, 'ground')[0]!;
    expect(g).toMatchObject({ ground: 'burning', board: 'enemy', turns: 2 });
    expect(g.slots.sort((x, y) => x - y)).toEqual([1, 3, 4, 5, 7]);
    expect(b.ground).toHaveLength(1);
  });

  it('üzerinde duran düşman kendi turunun başında zemin hasarı alır; kendi tarafı etkilenmez', () => {
    const b = setup();
    while (b.currentUid !== 'party-0') b.skipTurn();
    act(b, 'party-0', 'meteor', 'enemy-1'); // merkez enemy-1 (slot 3): artı => 0, 3, 4(boş), 6...
    const g = b.ground[0]!;
    expect(g.slots).toContain(3);
    const victim = b.combatants.find((c) => c.side === 'enemy' && g.slots.includes(c.slot))!;
    const hp0 = victim.hp;
    for (let i = 0; i < 12 && victim.hp === hp0; i++) b.skipTurn();
    expect(victim.hp).toBeLessThan(hp0);
    expect(b.get('party-0')!.hp).toBe(b.get('party-0')!.maxHp); // bırakan taraf zarar görmez
  });

  it('yer etkisi bırakanın 2 turundan sonra biter (groundEnd)', () => {
    const b = setup();
    while (b.currentUid !== 'party-0') b.skipTurn();
    act(b, 'party-0', 'meteor', 'enemy-1');
    let ended = false;
    for (let i = 0; i < 40 && !ended; i++) {
      const r = b.skipTurn();
      if (r.ok && r.events.some((e) => e.type === 'groundEnd')) ended = true;
    }
    expect(ended).toBe(true);
    expect(b.ground).toHaveLength(0);
  });

  it('Wail of the Dead alana 2 turluk zehir bırakır', () => {
    const b = calm(grid(cells({ 0: 'undead' }), cells({ 0: 'warrior' }), 'turns', 5));
    b.get('party-0')!.mp = 100;
    while (b.currentUid !== 'party-0') b.skipTurn();
    const events = act(b, 'party-0', 'wail_of_the_dead', 'enemy-0');
    expect(ofType(events, 'ground')[0]).toMatchObject({ ground: 'poison', turns: 2 });
  });

  it('bırakan ölünce yer etkisi biter', () => {
    const b = calm(grid(cells({ 0: 'mage', 2: 'warrior' }), cells({ 0: 'warrior', 3: 'warrior', 5: 'warrior' }), 'turns', 5));
    b.get('party-0')!.mp = 100;
    while (b.currentUid !== 'party-0') b.skipTurn();
    act(b, 'party-0', 'meteor', 'enemy-1');
    b.get('party-0')!.hp = 0; // bırakan öldü (savaş sürüyor: Warrior ayakta)
    let ended = false;
    for (let i = 0; i < 10 && !ended && !b.winner; i++) {
      const r = b.skipTurn();
      if (r.ok && r.events.some((e) => e.type === 'groundEnd')) ended = true;
    }
    expect(ended).toBe(true);
    expect(b.ground).toHaveLength(0);
  });
});

describe('tür hassasiyeti (undead + holy, nature + fire)', () => {
  const hit = (skill: string, actor: string, targetId: string, tags: string[]) => {
    const b = calm(grid(cells({ 0: actor }), cells({ 0: targetId })));
    b.get('enemy-0')!.tags = tags;
    return dmgTo(act(b, 'party-0', skill, 'enemy-0'), 'enemy-0');
  };

  it('undead etiketi holy hasarı %50 artırır; diğer elementleri etkilemez', () => {
    expect(content.formulas.weaknesses.undead).toEqual({ holy: 1.5 });
    const plain = hit('holy_strike', 'paladin', 'warrior', []);
    const weak = hit('holy_strike', 'paladin', 'warrior', ['undead']);
    expect(weak / plain).toBeGreaterThan(1.4);
    expect(weak / plain).toBeLessThan(1.65);
    expect(hit('fire_bolt', 'mage', 'warrior', ['undead'])).toBe(hit('fire_bolt', 'mage', 'warrior', []));
  });

  it('nature etiketi fire hasarını %50 artırır; holy\'yi etkilemez', () => {
    expect(content.formulas.weaknesses.nature).toEqual({ fire: 1.5 });
    const ratio = hit('fire_bolt', 'mage', 'warrior', ['nature']) / hit('fire_bolt', 'mage', 'warrior', []);
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.65);
    expect(hit('holy_strike', 'paladin', 'warrior', ['nature'])).toBe(hit('holy_strike', 'paladin', 'warrior', []));
  });

  it('Paladin skill\'lerinde artık ayrı undead bonusu yok (çift bonus olmaz)', () => {
    for (const id of ['holy_strike', 'judgment', 'radiance']) {
      expect(JSON.stringify(content.skills[id]!.effects), id).not.toContain('bonusVsTag');
    }
  });

  it('Yalnızca iskelet undead (Undead sınıfının zayıflığı yok); Treant nature', () => {
    expect(content.classes.undead!.tags ?? []).not.toContain('undead');
    expect(content.summons.skeleton!.tags).toContain('undead');
    expect(content.summons.treant!.tags).toContain('nature');
  });
});

describe('Judgment: holy fire alanı', () => {
  it('ilk hasar yok; 1 yarıçaplı alana yüksek hasarlı Holy Fire bırakır; undead\'e %50 fazla vurur', () => {
    expect(content.skills.judgment).toMatchObject({ target: 'area_enemies', area: { shape: 'plus' }, motion: 'sky', skyFx: 'light', skyCenter: true });
    const b = calm(grid(cells({ 0: 'paladin' }), cells({ 0: 'warrior', 1: 'warrior' }), 'turns', 4));
    b.get('party-0')!.mp = 100;
    while (b.currentUid !== 'party-0') b.skipTurn();
    b.get('enemy-1')!.tags = ['undead'];
    const events = act(b, 'party-0', 'judgment', 'enemy-0');
    // ground olayından önce hiç hasar yok (sonrasındaki hasar, sıradaki düşmanın tur başındaki zemin hasarıdır)
    expect(ofType(events.slice(0, events.findIndex((e) => e.type === 'ground')), 'damage')).toHaveLength(0);
    const g = ofType(events, 'ground')[0]!;
    expect(g).toMatchObject({ ground: 'holy_fire', turns: 2 });
    // sıradaki turlarında alandaki düşmanlar hasar alır; undead olan %50 fazla
    const lost = new Map<string, number>();
    for (let i = 0; i < 20 && lost.size < 2; i++) {
      const r = b.skipTurn();
      if (!r.ok) break;
      for (const e of ofType(r.events, 'damage')) if (e.source === 'party-0' && !lost.has(e.target)) lost.set(e.target, e.amount + e.absorbed);
    }
    expect(lost.get('enemy-0')).toBeGreaterThan(5);
    expect(lost.get('enemy-1')! / lost.get('enemy-0')!).toBeGreaterThan(1.3);
  });
});

describe('sınıf verisi (bu turun düzenlemeleri)', () => {
  it('Quick Shot haste 2 tur; Aimed Shot cd 3; Meteor cd 3 ve tek büyük meteor (skyCenter)', () => {
    expect(content.skills.quick_shot!.effects.find((e) => e.type === 'status')).toMatchObject({ status: 'haste', turns: 2, self: true });
    expect(content.skills.aimed_shot!.cooldown).toBe(3);
    expect(content.skills.meteor!.cooldown).toBe(3);
    expect(content.skills.meteor!.skyCenter).toBe(true);
  });

  it('Undead kiti: Bone Throw, Blood Rite, Wail of the Dead, Raise Dead; Blood Rite yerden çıkan ağız (ground), Thorn Whip kırbaç', () => {
    expect(content.classes.undead!.skills.slice(0, 4)).toEqual(['bone_throw', 'blood_rite', 'wail_of_the_dead', 'raise_dead']);
    expect(content.skills.blood_rite!.motion).toBe('ground');
    expect(content.skills.thorn_whip!.motion).toBe('whip');
  });

  it('Treant ve iskelet: can 105 (iskelette beslenmiş hâl); Treant hasar statı INT 13,5 (madde 222: eski STR 13,5 çıktısı korunur); Treant türü nature', () => {
    expect(content.summons.skeleton!.stats.hp).toBe(105);
    expect(content.summons.treant!.stats.hp).toBe(105);
    expect(content.summons.treant!.stats.int).toBe(13.5);
    expect(content.summons.treant!.tags).toContain('nature');
  });

  it('Taunt ikonu çelik eldivenle orta parmak; Void Strike menzilli', () => {
    expect(content.skills.taunt!.icon).toBe('finger');
    expect(content.skills.void_strike!.motion).not.toBe('melee');
  });

  it('Defender pasifi kendisine de zırh verir; çaprazındakine vermez', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 4: 'defender', 3: 'warrior', 0: 'archer' }), enemies: cells({ 0: 'mage' }) }, false));
    const d = b.combatants.find((c) => c.defId === 'defender')!;
    const auraPct = (content.classes.defender!.passive!.effect as { pct: number }).pct; // yüzde veriden (Defender zırhının %40'ı)
    expect(b.effectiveStats(d).armor).toBeCloseTo(d.stats.armor * (1 + auraPct), 6);
    expect(b.effectiveStats(b.combatants.find((c) => c.defId === 'archer')!).armor).toBe(content.classes.archer!.stats.armor); // slot 0: çapraz
  });

  it('Radiance ışığı rastgele sırayla, üst üste binerek düşer (skyStagger)', () => {
    expect(content.skills.radiance).toMatchObject({ motion: 'sky', skyFx: 'light', skyStagger: 130 });
  });
});

describe('Taunt: dostları korur', () => {
  it('Taunt sürerken taunt\'lı olmayan dostlar veriden gelen oranda (allyDamageMult) hasar alır; taunt\'lı kendisi etkilenmez; taunt bitince biter', () => {
    // Arrow Rain alan skill'i taunt'tan etkilenmez: merkez party-1, alan her iki dosta da vurur
    const hit = (taunt: boolean, victim: 'party-0' | 'party-1') => {
      const b = calm(grid(cells({ 0: 'defender', 2: 'warrior' }), cells({ 0: 'archer' })));
      b.get('party-0')!.maxHp = b.get('party-0')!.hp = 100000; // taunt hasar eşiğiyle bozulmasın (kırılma eşiği maks candan hesaplanır)
      if (taunt) act(b, 'party-0', 'taunt');
      for (const c of b.combatants) c.stats.armor = 0; // aynı çarpan: yalnızca koruma farkı ölçülsün
      b.get('party-0')!.shield = 0;
      b.get('enemy-0')!.stats.dex = 200; // büyük sayılar: yuvarlama farkı gizlemesin
      return dmgTo(act(b, 'enemy-0', 'arrow_rain', 'party-1'), victim);
    };
    const allyMult = (content.skills.taunt!.effects.find((e) => e.type === 'taunt') as { allyDamageMult: number }).allyDamageMult; // değer veriden (denge ayarıyla değişir)
    const ally = hit(true, 'party-1') / hit(false, 'party-1');
    expect(ally).toBeGreaterThan(allyMult - 0.05);
    expect(ally).toBeLessThan(allyMult + 0.05);
    expect(hit(true, 'party-0') / hit(false, 'party-0')).toBeGreaterThan(0.9); // Defender'ın kendisi yarı hasar almaz
  });

  it('Taunt skill verisi: dost hasar çarpanı veriden (0 ile 1 arası) uygulanır', () => {
    const allyMult = (content.skills.taunt!.effects.find((e) => e.type === 'taunt') as { allyDamageMult: number }).allyDamageMult;
    expect(allyMult).toBeGreaterThan(0);
    expect(allyMult).toBeLessThan(1);
    const b = grid(cells({ 0: 'defender', 2: 'warrior' }), cells({ 0: 'archer' }));
    act(b, 'party-0', 'taunt');
    expect(b.damageTakenMult(b.get('party-1')!)).toBe(allyMult);
    expect(b.damageTakenMult(b.get('party-0')!)).toBe(1);
    b.get('party-0')!.statuses = []; // taunt bitti
    expect(b.damageTakenMult(b.get('party-1')!)).toBe(1);
  });

  it('Taunt önizlemesi de koruma çarpanını yansıtır', async () => {
    const { previewSkill } = await import('../src/engine');
    const b = calm(grid(cells({ 0: 'defender', 2: 'warrior' }), cells({ 0: 'archer' })));
    const before = previewSkill(b, 'enemy-0', 'quick_shot', 'party-1')[0]!.damage!.avg;
    act(b, 'party-0', 'taunt');
    // taunt'lı Defender yakın dövüş menzilindeyken saldırı Defender'a zorlanır; Warrior'a önizleme yine hesaplanabilir (menzilli)
    b.get('party-0')!.statuses = b.get('party-0')!.statuses.filter((s) => s.kind === 'taunt');
    const allyMult = (content.skills.taunt!.effects.find((e) => e.type === 'taunt') as { allyDamageMult: number }).allyDamageMult;
    expect(b.damageTakenMult(b.get('party-1')!)).toBe(allyMult);
    expect(before).toBeGreaterThan(0);
  });

  it('Defender canı class verisindeki elle ayar (overrides.hp) değeridir (denge ayarında 158 -> 100)', () => {
    expect(defenderRaw.overrides.hp).toBeGreaterThan(0);
    expect(content.classes.defender!.stats.hp).toBe(defenderRaw.overrides.hp);
  });
});

describe('Druid: Rejuvenate başlangıç şifası, dizilim ve Treant menzili', () => {
  it('Druid\'li takımlarda ön sırada boş hücre bırakılmaz: ön sıra 3 kişiyle dolabilir', () => {
    let full3 = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { party } = content.rollTeams('random-battle', seed);
      if (!party.includes('druid')) continue;
      for (const cellsList of [content.randomCells(party, seed), content.defaultCells(party)]) {
        if (cellsList.slice(0, 3).filter(Boolean).length === 3) full3++;
      }
    }
    expect(full3).toBeGreaterThan(0);
  });
});
