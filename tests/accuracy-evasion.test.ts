import { describe, expect, it } from 'vitest';
import { Battle, accuracyOf, chooseAction, content, describeSkill, describeStat, hitChance, hitOutcome, previewSkill, rollHitOutcome, Rng } from '../src/engine';
import type { BattleEvent, BattleMode, Combatant } from '../src/engine';

const f = content.formulas;
const teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };

const mk = (seed: number, mode: BattleMode = 'test') => new Battle(content.battleSetup('first-battle', seed, mode, teams));
const unit = (b: Battle, side: 'party' | 'enemy', defId: string): Combatant => b.combatants.find((c) => c.side === side && c.defId === defId)!;
const strikes = (events: BattleEvent[]) => events.filter((e) => e.type === 'damage' || e.type === 'dodge' || e.type === 'miss');

/** Verilen saldırı skill'ini farklı seed'lerde atar: kaç vuruş isabet etti (damage), kaç iska (dodge ya da miss). */
function tally(skill: string, actorDef: string, targetDef: string, setStats: (a: Combatant, t: Combatant) => void, n = 600) {
  let hit = 0;
  let miss = 0;
  for (let seed = 1; seed <= n; seed++) {
    const b = mk(seed);
    const a = unit(b, 'party', actorDef);
    const t = unit(b, 'enemy', targetDef);
    for (const c of b.combatants) c.stats.critChance = 0;
    t.hp = t.maxHp = 100000;
    setStats(a, t);
    const r = b.useSkill(a.uid, skill, t.uid);
    if (!r.ok) throw new Error(r.reason);
    for (const e of strikes(r.events)) (e.type === 'damage' ? hit++ : miss++);
  }
  return { hit, miss, rate: hit / (hit + miss) };
}

describe('isabet kontrolü: hit şansı = accuracy - evasion (veriye bağlı)', () => {
  it('formül formulas.json değerlerinden gelir: sınıflar arası hit şansı hesabı', () => {
    const w = content.classes.warrior!.stats;
    const d = content.classes.defender!.stats;
    const expected = Math.min(f.hit.max, Math.max(0, w.accuracy - d.evasion));
    expect(hitChance(w, d, f)).toBeCloseTo(expected, 10);
    expect(w.accuracy).toBeCloseTo(f.attributes.accuracyBase + f.attributes.accuracyPerLuck * content.classes.warrior!.attributes.luck, 10);
    const a = f.attributes;
    expect(d.evasion).toBeCloseTo(Math.min(a.evasionMax, Math.floor(content.classes.defender!.attributes.dex / a.dexPerEvasionStep) * a.evasionPerStep), 10);
  });

  it('fiziksel saldırı: gerçek isabet oranı hitChance ile uyuşur', () => {
    const r = tally('quick_shot', 'archer', 'warrior', (a, t) => {
      a.stats.accuracy = 0.9;
      t.stats.evasion = 0.3;
    });
    expect(r.rate).toBeGreaterThan(0.56);
    expect(r.rate).toBeLessThan(0.64);
    expect(r.miss).toBeGreaterThan(0); // iska = dodge ya da miss olayı
  });

  it('büyülü saldırı da isabet kontrolüne girer', () => {
    const r = tally('fire_bolt', 'mage', 'warrior', (a, t) => {
      a.stats.accuracy = 0.8;
      t.stats.evasion = 0.2;
    });
    expect(r.rate).toBeGreaterThan(0.54);
    expect(r.rate).toBeLessThan(0.66);
  });

  it('hedefin evasion\'ı arttıkça isabet düşer; saldırganın accuracy\'si arttıkça artar', () => {
    const low = tally('quick_shot', 'archer', 'warrior', (a, t) => { a.stats.accuracy = 0.9; t.stats.evasion = 0.05; }, 400).rate;
    const high = tally('quick_shot', 'archer', 'warrior', (a, t) => { a.stats.accuracy = 0.9; t.stats.evasion = 0.5; }, 400).rate;
    expect(high).toBeLessThan(low);
    const acc = tally('quick_shot', 'archer', 'warrior', (a, t) => { a.stats.accuracy = 1.0; t.stats.evasion = 0.5; }, 400).rate;
    expect(acc).toBeGreaterThan(high);
  });

  it('alt sınır YOK: accuracy evasion değerinden düşükse hit şansı %0 olur, hiç vurmaz (fiziksel ve büyülü)', () => {
    const phys = tally('quick_shot', 'archer', 'warrior', (a, t) => { a.stats.accuracy = 0; t.stats.evasion = f.attributes.evasionMax; }, 300);
    expect(phys.hit).toBe(0);
    expect(phys.miss).toBeGreaterThan(0);
    const magic = tally('fire_bolt', 'mage', 'warrior', (a, t) => { a.stats.accuracy = 0.1; t.stats.evasion = 5; }, 300);
    expect(magic.hit).toBe(0);
    const a = content.classes.warrior!.stats;
    expect(hitChance({ accuracy: 0 }, { evasion: f.attributes.evasionMax }, f)).toBe(0); // negatife düşmez
    expect(hitChance(a, { evasion: 0 }, f)).toBeGreaterThan(0);
  });

  it('accuracy hiç negatife düşmez (negatif taban verilse bile 0)', () => {
    expect(accuracyOf(0, f, -5)).toBe(0);
  });

  it('iska eden vuruşta durum etkisi (debuff) uygulanmaz', () => {
    const b = mk(1);
    b.debug.dodge = 'always';
    const undead = b.combatants.find((c) => c.side === 'party' && c.defId === 'paladin')!;
    const r = b.useSkill(undead.uid, undead.skills[0]!, unit(b, 'enemy', 'warrior').uid);
    expect(r.ok).toBe(true);
    expect(unit(b, 'enemy', 'warrior').statuses).toHaveLength(0);
  });
});

describe('isabet kontrolü yapmayan etkiler', () => {
  it('şifa, kalkan, buff, kendine etki ve yer etkisi iskalamaz (en kötü isabetle bile)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = mk(seed);
      b.debug.dodge = 'always'; // hasar vuruşlarını iska ettirir; hasarsız etkiler yine de uygulanmalı
      for (const c of b.combatants) Object.assign(c.stats, { accuracy: 0, evasion: 5 });
      const paladin = unit(b, 'party', 'paladin');
      const mage = unit(b, 'party', 'mage');
      const warrior = unit(b, 'party', 'warrior');
      warrior.hp = 5;
      const heal = paladin.skills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'heal'));
      if (heal) {
        const r = b.useSkill(paladin.uid, heal, warrior.uid);
        expect(r.ok && r.events.some((e) => e.type === 'heal')).toBe(true);
      }
      const shield = mage.skills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'shield' && e.self));
      if (shield) {
        const r = b.useSkill(mage.uid, shield);
        expect(r.ok && r.events.some((e) => e.type === 'shield')).toBe(true);
        expect(r.ok && r.events.some((e) => e.type === 'dodge')).toBe(false);
      }
    }
  });

  it('yerde kalan etki (zehir/yanan zemin) isabet kontrolü yapmaz: tick hasarı dodge olayı üretmez', () => {
    const src = Object.values(content.skills).find((s) => s.effects.some((e) => e.type === 'ground'));
    expect(src).toBeDefined();
    const b = new Battle(content.battleSetup('random-battle', 1, 'turns', { party: ['druid', '', '', '', '', '', '', '', '', '', '', ''], enemies: ['warrior', '', '', '', '', '', '', '', '', '', '', ''] }, false));
    const enemy = b.combatants.find((c) => c.side === 'enemy')!;
    b.ground.push({ id: 'gx', ground: Object.keys(content.grounds)[0]!, board: 'enemy', slots: [enemy.slot], turns: 3, source: b.combatants.find((c) => c.side === 'party')!.uid, sourceSide: 'party', amount: 5 });
    enemy.stats.evasion = 5;
    b.debug.dodge = 'always';
    const from = b.log.length;
    for (let i = 0; i < 40 && b.log.slice(from).every((e) => e.type !== 'damage'); i++) b.skipTurn();
    const events = b.log.slice(from);
    expect(events.some((e) => e.type === 'damage' && e.target === enemy.uid)).toBe(true);
    expect(events.some((e) => e.type === 'dodge')).toBe(false);
  });
});

describe('seed\'li RNG ve iki mod', () => {
  const run = (seed: number, mode: BattleMode) => {
    const b = mk(seed, mode);
    const a = unit(b, 'party', 'archer');
    if (mode === 'turns') for (let i = 0; i < 200 && b.currentUid !== a.uid; i++) b.skipTurn();
    b.useSkill(a.uid, 'quick_shot', unit(b, 'enemy', 'defender').uid);
    return JSON.stringify(b.log);
  };

  for (const mode of ['turns', 'test'] as const) {
    it(`${mode} modu: aynı seed + aynı girdi = birebir aynı olay akışı (iskalar dahil)`, () => {
      for (const seed of [1, 7, 21]) expect(run(seed, mode)).toBe(run(seed, mode));
    });

    it(`${mode} modu: isabet, hedefin kaçınması (dodge) ve saldıranın iskası (miss) üç ayrı olay olarak görülür`, () => {
      const kinds = new Set<string>();
      for (let seed = 1; seed <= 400 && kinds.size < 3; seed++) {
        const b = mk(seed, mode);
        const a = unit(b, 'party', 'archer');
        if (mode === 'turns') for (let i = 0; i < 200 && b.currentUid !== a.uid; i++) b.skipTurn();
        const t = unit(b, 'enemy', 'defender');
        t.stats.evasion = 0.5;
        a.stats.accuracy = 0.8; // dodge bölgesi %50, miss bölgesi %20, isabet %30
        const r = b.useSkill(a.uid, 'quick_shot', t.uid);
        if (r.ok) for (const e of strikes(r.events)) kinds.add(e.type);
      }
      expect([...kinds].sort()).toEqual(['damage', 'dodge', 'miss']);
    });
  }

  it('her hasar vuruşu hit zarı için tam bir rastgele sayı tüketir: debug bayrağı akışı kaydırmaz', () => {
    const log = (flag: 'auto' | 'never') => {
      const b = mk(5);
      b.debug.dodge = flag;
      for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0 }); // auto da hep isabet: aynı akış
      const a = unit(b, 'party', 'archer');
      const t = unit(b, 'enemy', 'defender');
      b.useSkill(a.uid, 'quick_shot', t.uid);
      b.useSkill(a.uid, 'quick_shot', t.uid);
      return JSON.stringify(b.log);
    };
    expect(log('auto')).toBe(log('never'));
  });
});

describe('önizleme (preview) ve yapay zeka isabeti bilir', () => {
  it('önizleme hit şansını verir: hitChance ve beklenen hasar = ortalama x hitChance', () => {
    const b = mk(1);
    const a = unit(b, 'party', 'archer');
    const t = unit(b, 'enemy', 'defender');
    const p = previewSkill(b, a.uid, 'quick_shot', t.uid)[0]!.damage!;
    expect(p.hitChance).toBeCloseTo(hitChance(a.stats, t.stats, f), 10);
    expect(p.hitChance).toBeLessThanOrEqual(f.hit.max);
    expect(p.hitChance).toBeGreaterThanOrEqual(0);
    expect(p.expected).toBeCloseTo(p.avg * p.hitChance, 8);
    // min/max/avg isabet ettiğinde geçerlidir: evasion yükselince hitChance düşer, avg değişmez
    t.stats.evasion = Math.min(0.6, t.stats.evasion + 0.3);
    const p2 = previewSkill(b, a.uid, 'quick_shot', t.uid)[0]!.damage!;
    expect(p2.hitChance).toBeLessThan(p.hitChance);
    expect(p2.avg).toBe(p.avg);
    expect(p2.expected).toBeLessThan(p.expected);
  });

  it('hit şansı %0 iken önizleme beklenen hasarı 0 verir (hasar aralığı isabet ettiğindeki değerdir)', () => {
    const b = mk(1);
    const a = unit(b, 'party', 'archer');
    const t = unit(b, 'enemy', 'warrior');
    a.stats.accuracy = 0;
    t.stats.evasion = f.attributes.evasionMax;
    const p = previewSkill(b, a.uid, 'quick_shot', t.uid)[0]!.damage!;
    expect(p.hitChance).toBe(0);
    expect(p.expected).toBe(0);
    expect(p.avg).toBeGreaterThan(0);
  });

  it('önizlemenin hitChance değeri gerçek vuruş oranıyla tutarlıdır', () => {
    const b0 = mk(1);
    const a0 = unit(b0, 'party', 'archer');
    const t0 = unit(b0, 'enemy', 'warrior');
    t0.stats.evasion = 0.25;
    const predicted = previewSkill(b0, a0.uid, 'quick_shot', t0.uid)[0]!.damage!.hitChance;
    const r = tally('quick_shot', 'archer', 'warrior', (_a, t) => { t.stats.evasion = 0.25; }, 600);
    expect(Math.abs(r.rate - predicted)).toBeLessThan(0.06);
  });

  it('kalkan/şifa önizlemesinde hit şansı yoktur (yalnızca hasar)', () => {
    const b = mk(1);
    const mage = unit(b, 'party', 'mage');
    const shield = mage.skills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'shield' && e.self));
    if (shield) {
      const p = previewSkill(b, mage.uid, shield, mage.uid);
      expect(p.every((x) => x.damage === undefined)).toBe(true);
    }
  });

  it('yapay zeka: aynı hasarı veren iki hedeften isabet şansı yüksek olanı seçer (beklenen hasar isabetle çarpılır)', () => {
    const b = mk(1);
    for (const c of b.combatants) c.hp = c.maxHp = 1000;
    const enemyAct = unit(b, 'enemy', 'archer');
    const [p1, p2] = [unit(b, 'party', 'warrior'), unit(b, 'party', 'paladin')];
    // iki hedef de aynı can/zırh/yuva derinliğinde; yalnızca evasion farklı
    for (const t of [p1, p2]) Object.assign(t.stats, { armor: 0, magicArmor: 0 });
    p1.hp = p2.hp = 400;
    p1.stats.evasion = 0.6;
    p2.stats.evasion = 0;
    const choice = chooseAction(b, enemyAct.uid, content.aiConfig);
    expect(choice).not.toBeNull();
    const target = choice!.targetUid ? b.get(choice!.targetUid) : undefined;
    // evasion'ı yüksek hedefe vurmak beklenen hasarı düşürür: AI evasion'ı sıfır olana yönelir ya da alan skill'i seçer
    if (target && choice!.reason === 'damage') expect(target.uid).not.toBe(p1.uid);
  });

  it('yapay zeka: isabet şansı hit.aiKillMin altındaysa "öldürür" saymaz', () => {
    const b = mk(1);
    for (const c of b.combatants) c.hp = c.maxHp = 1000;
    const victim = unit(b, 'party', 'mage');
    victim.hp = 1;
    const archer = unit(b, 'enemy', 'archer');
    victim.stats.evasion = 0; // isabet yüksek: öldürür
    expect(chooseAction(b, archer.uid, content.aiConfig)).toMatchObject({ reason: 'kill', targetUid: victim.uid });
    archer.stats.accuracy = 0; // isabet %0
    victim.stats.evasion = 0.6;
    expect(hitChance(archer.stats, victim.stats, f)).toBe(0);
    expect(hitChance(archer.stats, victim.stats, f)).toBeLessThan(f.hit.aiKillMin);
    expect(chooseAction(b, archer.uid, content.aiConfig)?.reason).not.toBe('kill');
  });
});

describe('arayüz bilgisi: skill ve stat tooltip', () => {
  it('skill açıklamasında accuracy satırı yoktur (hasar, şifa, kalkan); accuracy yalnızca stat tooltip\'inde', () => {
    const w = content.classes.warrior!.stats;
    const dmg = Object.values(content.skills).find((s) => s.effects.every((e) => e.type === 'damage'))!;
    expect(describeSkill(dmg, w, f).lines.join('\n')).not.toMatch(/Accuracy/);
    const heal = Object.values(content.skills).find((s) => s.effects.length > 0 && s.effects.every((e) => e.type === 'heal' || e.type === 'hot' || e.type === 'shield'))!;
    expect(describeSkill(heal, w, f).lines.join('\n')).not.toMatch(/Accuracy/);
  });

  it('accuracy/evasion stat tooltip\'leri veriden: Luck accuracy, Dex evasion; kritik çarpanı sabit ve ayrı stat değil', () => {
    const s = content.classes.archer!.stats;
    const acc = describeStat('accuracy', s, f);
    expect(acc.title).toContain(`${Math.round(s.accuracy * 100)}%`);
    expect(acc.lines.join('\n')).toContain('Luck');
    const eva = describeStat('evasion', s, f);
    expect(eva.lines.join('\n')).toContain(`${f.attributes.dexPerEvasionStep} Dex = +${Math.round(f.attributes.evasionPerStep * 100)}% evasion`);
    expect(eva.lines.join('\n')).toContain(`${Math.round(f.attributes.evasionMax * 100)}%`);
    expect(describeStat('critChance', s, f).lines.join('\n')).toContain(`fixed x${f.attributes.critMult}`);
  });
});

describe('miss / dodge ayrımı: tek zardan üç sonuç', () => {
  it('hitOutcome: r < hit şansı = isabet; hit şansı <= r < accuracy = dodge (hedef kaçındı); r >= accuracy = miss (saldıran isabet ettiremedi)', () => {
    const atk = { accuracy: 0.8 };
    const def = { evasion: 0.3 }; // hit şansı 0.5
    expect(hitChance(atk, def, f)).toBeCloseTo(0.5, 10);
    expect(hitOutcome(atk, def, f, 0)).toBe('hit');
    expect(hitOutcome(atk, def, f, 0.4999)).toBe('hit');
    expect(hitOutcome(atk, def, f, 0.5)).toBe('dodge');
    expect(hitOutcome(atk, def, f, 0.7999)).toBe('dodge');
    expect(hitOutcome(atk, def, f, 0.8)).toBe('miss');
    expect(hitOutcome(atk, def, f, 0.9999)).toBe('miss');
  });

  it('evasion yok: iska yalnızca miss (accuracy yetmedi); accuracy >= %100 ise hiç miss yok; evasion accuracy\'yi aşarsa hit şansı 0 ama dodge yine accuracy ile sınırlı', () => {
    expect(hitOutcome({ accuracy: 0.8 }, { evasion: 0 }, f, 0.79)).toBe('hit');
    expect(hitOutcome({ accuracy: 0.8 }, { evasion: 0 }, f, 0.8)).toBe('miss');
    expect(hitOutcome({ accuracy: 1.1 }, { evasion: 0 }, f, 0.9999)).toBe('hit');
    expect(hitOutcome({ accuracy: 0.5 }, { evasion: 0.9 }, f, 0.4)).toBe('dodge'); // hit şansı 0: accuracy'nin tuttuğu bölge dodge
    expect(hitOutcome({ accuracy: 0.5 }, { evasion: 0.9 }, f, 0.6)).toBe('miss');
  });

  it('rollHitOutcome vuruş başına TAM BİR rastgele sayı tüketir (RNG akışı eski haliyle aynı)', () => {
    const a = new Rng(11);
    const b = new Rng(11);
    rollHitOutcome({ accuracy: 0.8 }, { evasion: 0.1 }, f, a);
    b.next();
    expect(a.next()).toBe(b.next());
  });

  it('olasılık dağılımı tek zardan gelir: hit = accuracy - evasion, dodge = evasion, miss = 1 - accuracy', () => {
    let hit = 0;
    let dodge = 0;
    let miss = 0;
    const N = 3000;
    for (let seed = 1; seed <= N; seed++) {
      const b = mk(seed);
      const a = unit(b, 'party', 'archer');
      const t = unit(b, 'enemy', 'warrior');
      for (const c of b.combatants) c.stats.critChance = 0;
      t.hp = t.maxHp = 100000;
      a.stats.accuracy = 0.8;
      t.stats.evasion = 0.3;
      const r = b.useSkill(a.uid, 'quick_shot', t.uid);
      if (!r.ok) throw new Error(r.reason);
      for (const e of strikes(r.events)) {
        if (e.type === 'damage') hit++;
        else if (e.type === 'dodge') dodge++;
        else miss++;
      }
    }
    const total = hit + dodge + miss;
    expect(hit / total).toBeGreaterThan(0.46);
    expect(hit / total).toBeLessThan(0.54);
    expect(dodge / total).toBeGreaterThan(0.26);
    expect(dodge / total).toBeLessThan(0.34);
    expect(miss / total).toBeGreaterThan(0.16);
    expect(miss / total).toBeLessThan(0.24);
  });

  it('olay şeması: dodge ve miss ikisinde de source = saldıran, target = hedef; hasar/etki uygulanmaz', () => {
    for (const [flag, type] of [['dodge', 'dodge'], ['miss', 'miss']] as const) {
      const b = mk(1);
      if (flag === 'dodge') b.debug.dodge = 'always';
      else b.debug.miss = 'always';
      const a = unit(b, 'party', 'archer');
      const t = unit(b, 'enemy', 'warrior');
      const hp = t.hp;
      const r = b.useSkill(a.uid, 'quick_shot', t.uid);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const ev = r.events.filter((e) => e.type === 'dodge' || e.type === 'miss' || e.type === 'damage');
      expect(ev.length).toBeGreaterThan(0);
      for (const e of ev) expect(e).toMatchObject({ type, source: a.uid, target: t.uid });
      expect(t.hp).toBe(hp);
    }
  });

  it('debug: dodge always dodge olayı üretir (miss always ile birlikteyse dodge kazanır); never her ikisini de kapatır', () => {
    const kinds = (set: (b: Battle) => void) => {
      const b = mk(2);
      set(b);
      for (const c of b.combatants) Object.assign(c.stats, { accuracy: 0, evasion: 0.9 }); // auto iken hep iska
      const a = unit(b, 'party', 'archer');
      const r = b.useSkill(a.uid, 'quick_shot', unit(b, 'enemy', 'warrior').uid);
      return r.ok ? [...new Set(strikes(r.events).map((e) => e.type))] : [];
    };
    expect(kinds(() => {})).toEqual(['miss']); // accuracy 0: accuracy yüzünden iska
    expect(kinds((b) => (b.debug.dodge = 'always'))).toEqual(['dodge']);
    expect(kinds((b) => { b.debug.dodge = 'always'; b.debug.miss = 'always'; })).toEqual(['dodge']);
    expect(kinds((b) => (b.debug.miss = 'always'))).toEqual(['miss']);
    expect(kinds((b) => (b.debug.dodge = 'never'))).toEqual(['damage']);
  });

  it('çok vuruşlu skill (Double Strike): her vuruş kendi zarını atar; iska olan vuruş için ayrı miss/dodge olayı gelir', () => {
    const b = mk(1);
    b.debug.miss = 'always';
    const w = unit(b, 'party', 'warrior');
    const r = b.useSkill(w.uid, 'melee_attack', unit(b, 'enemy', 'warrior').uid);
    expect(r.ok && r.events.filter((e) => e.type === 'miss')).toHaveLength(2);
  });
});
