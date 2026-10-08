import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describeSkill, explainChoice } from '../src/engine';
import type { AiConfig, BattleEvent, BattleMode } from '../src/engine';

/**
 * Rage (Warrior kaynağı): 0-max, savaş başında 0; skill ile hasar vurdukça kazanılır (isabet eden her vuruşta
 * min(perHitCap, hitBase + perHpPercent x vurulan hasarın hedefin maks canına yüzdesi); bir skill'de en yüksek tek hedef, perCastCap'li);
 * Abyssal Cry'ın bedeli Rage (MP değil). Sayılar formulas.json > rage'den okunur.
 */
const R = content.formulas.rage;
const cry = content.skills.abyssal_cry!;
const classOnly: AiConfig = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

/** Hücre listeli savaş; kritik kapalı, isabet tam, kaçınma yok (sayılar zara bağlı olmasın). */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test', hp = 100000): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells(party), enemies: cells(enemies) }, false));
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    if (c.side === 'enemy') c.hp = c.maxHp = hp;
  }
  return b;
}

function act(b: Battle, uid: string, skill: string, target?: string): BattleEvent[] {
  const r = b.useSkill(uid, skill, target);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
}

/** Bir vuruşun beklenen Rage kazancı (formül veriden). */
const hitGain = (total: number, maxHp: number) => Math.min(R.perHitCap, R.hitBase + R.perHpPercent * ((total / maxHp) * 100));

describe('Rage: veri ve başlangıç', () => {
  it('yalnızca class verisinde resource: rage olan class (Warrior) Rage barına sahip; üst sınır formulas.json > rage.max', () => {
    for (const [id, def] of Object.entries(content.classes)) {
      if (id === 'warrior') expect(def.maxRage, id).toBe(R.max);
      else expect(def.maxRage, id).toBeUndefined();
    }
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'archer' });
    expect(b.get('party-0')!.rage).toBe(0);
    expect(b.get('party-0')!.maxRage).toBe(R.max);
    expect(b.get('party-1')!.rage).toBeUndefined();
    expect(b.get('party-1')!.maxRage).toBeUndefined();
    expect(b.get('enemy-0')!.rage).toBeUndefined();
  });

  it('battleStart olayındaki birim kopyaları da Rage taşır (arayüz okur): Warrior 0/max, diğerleri tanımsız', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'warrior' });
    const start = b.log[0]!;
    expect(start.type).toBe('battleStart');
    if (start.type !== 'battleStart') return;
    const w = start.combatants.find((c) => c.uid === 'party-0')!;
    expect(w.rage).toBe(0);
    expect(w.maxRage).toBe(R.max);
    expect(start.combatants.find((c) => c.uid === 'party-1')!.maxRage).toBeUndefined();
  });

  it('Abyssal Cry maliyeti yalnızca Rage (MP değil; madde 262: can bedeli kaldırıldı); cooldown/initialCooldown aynı', () => {
    expect(cry.cost.resource).toBe('rage');
    expect(cry.cost.amount).toBeGreaterThan(0);
    expect(cry.cost.amount).toBeLessThanOrEqual(R.max);
    expect(cry.effects.some((e) => e.type === 'selfDamage')).toBe(false);
    expect(cry.cooldown).toBe(5);
    expect(cry.initialCooldown).toBeUndefined();
    // Warrior'ın diğer skill'leri MP kullanır
    for (const id of content.classes.warrior!.skills) if (id !== 'abyssal_cry') expect(content.skills[id]!.cost.resource, id).toBe('mp');
    // Rage'li bir class dışında Rage bedelli skill yok
    for (const [id, s] of Object.entries(content.skills)) if (s.cost.resource === 'rage') expect(content.classes.warrior!.skills, id).toContain(id);
  });

  it('skill açıklaması bedeli "N RAGE" olarak yazar', () => {
    const info = describeSkill(cry, content.classes.warrior!.stats, content.formulas);
    expect(info.cost).toBe(`${cry.cost.amount} RAGE`);
  });
});

describe('Rage: kazanç', () => {
  it('isabet eden her vuruş min(perHitCap, hitBase + perHpPercent x hasarın hedef maks canına yüzdesi) verir; skill başına toplam rage olayı', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'defender' }, 'test', 200);
    const w = b.get('party-0')!;
    const events = act(b, 'party-0', 'melee_attack', 'enemy-0'); // Double Strike: iki vuruş, aynı hedef
    const hits = ofType(events, 'damage').filter((e) => e.target === 'enemy-0');
    expect(hits).toHaveLength(2);
    const expected = Math.round(Math.min(R.perCastCap, hits.reduce((s, h) => s + hitGain(h.amount + h.absorbed, 200), 0)));
    const rage = ofType(events, 'rage');
    expect(rage).toHaveLength(1);
    expect(rage[0]).toMatchObject({ actor: 'party-0', delta: expected, after: expected, max: R.max });
    expect(w.rage).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('küçük hedef canı: vuruş başına üst sınır perHitCap geçilmez; skill başına perCastCap geçilmez', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'mage' }, 'test', 5); // her vuruş hedef canının çok üstünde
    b.get('enemy-0')!.shield = 100000; // hedef ilk vuruşta ölmesin: iki vuruş da isabet etsin (kalkanın emdiği hasar da "vurulan hasar")
    act(b, 'party-0', 'melee_attack', 'enemy-0');
    expect(b.get('party-0')!.rage).toBe(Math.min(R.perCastCap, 2 * R.perHitCap));
  });

  it('çok hedefli skill (Whirlwind) en yüksek tek hedefin kazancını verir: hedef sayısı kazancı artırmaz', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'defender', 1: 'defender', 2: 'defender' }, 'test', 300);
    const events = act(b, 'party-0', 'whirlwind');
    const hits = ofType(events, 'damage');
    expect(new Set(hits.map((h) => h.target)).size).toBe(3);
    const perTarget = hits.map((h) => hitGain(h.amount + h.absorbed, 300));
    const delta = ofType(events, 'rage')[0]!.delta;
    expect(delta).toBe(Math.round(Math.min(R.perCastCap, Math.max(...perTarget))));
    expect(delta).toBeLessThan(Math.round(perTarget.reduce((a, c) => a + c, 0)));
  });

  it('iska eden vuruş Rage vermez (dodge ve miss); hasarsız skill da vermez', () => {
    for (const flag of ['dodge', 'miss'] as const) {
      const b = mk({ 0: 'warrior' }, { 0: 'defender' });
      b.debug[flag] = 'always';
      const events = act(b, 'party-0', 'melee_attack', 'enemy-0');
      expect(ofType(events, 'rage')).toHaveLength(0);
      expect(b.get('party-0')!.rage).toBe(0);
    }
  });

  it('Rage üst sınırı aşmaz: delta yalnızca sığan kısım', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'defender' }, 'test', 150);
    const w = b.get('party-0')!;
    w.rage = R.max - 1;
    const rage = ofType(act(b, 'party-0', 'melee_attack', 'enemy-0'), 'rage')[0]!;
    expect(w.rage).toBe(R.max);
    expect(rage.delta).toBe(1);
    // zaten doluysa olay yok
    expect(ofType(act(b, 'party-0', 'melee_attack', 'enemy-0'), 'rage')).toHaveLength(0);
  });

  it('alınan hasar Rage vermez; zamanla azalmaz; tur sonunda sıfırlanmaz (turns modu)', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'warrior', 1: 'archer' }, 'turns', 300);
    const w = b.get('party-0')!;
    w.rage = 40;
    const hp0 = w.hp;
    for (let i = 0; i < 30 && !b.winner; i++) {
      const cur = b.currentActor!;
      // yalnızca düşman Warrior/Archer ve party-1 oynar; party-0 hiç skill kullanmaz: sadece pas
      if (cur.uid === 'party-0') b.skipTurn();
      else b.applyChoice(cur.uid, chooseAction(b, cur.uid, classOnly));
    }
    expect(w.hp).toBeLessThan(hp0); // hasar aldı
    expect(w.rage).toBe(40); // ama Rage ne arttı ne azaldı
  });

  it('turns modunda da test modunda da kazanılır', () => {
    for (const mode of ['turns', 'test'] as const) {
      const b = mk({ 0: 'warrior' }, { 0: 'defender' }, mode, 300);
      while (mode === 'turns' && b.currentUid !== 'party-0') b.skipTurn();
      act(b, 'party-0', 'melee_attack', 'enemy-0');
      expect(b.get('party-0')!.rage, mode).toBeGreaterThan(0);
    }
  });

  it('Rage\'siz class\'ta Rage yok: rage olayı yok, debug ayarı reddedilir', () => {
    const b = mk({ 0: 'archer' }, { 0: 'defender' }, 'test', 300);
    const events = act(b, 'party-0', 'quick_shot', 'enemy-0');
    expect(ofType(events, 'rage')).toHaveLength(0);
    expect(b.get('party-0')!.rage).toBeUndefined();
    expect(b.debugSetResource('party-0', 'rage', 10).ok).toBe(false);
  });

  it('çağrılan birimler Rage kazanmaz (Rage yalnızca Rage\'li class birimlerinde)', () => {
    const b = mk({ 0: 'druid' }, { 0: 'defender' }, 'test', 300);
    act(b, 'party-0', 'summon_treant');
    const treant = b.combatants.find((c) => c.summoned)!;
    expect(treant.rage).toBeUndefined();
  });

  it('dirilen Warrior Rage 0 ile döner', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'defender' }, 'test', 300);
    const w = b.get('party-0')!;
    w.rage = 70;
    b.debugKill('party-0', false);
    b.get('party-1')!.mp = 100;
    act(b, 'party-1', 'resurrection', 'party-0');
    expect(w.hp).toBeGreaterThan(0);
    expect(w.rage).toBe(0);
  });
});

describe('Rage: harcama (Abyssal Cry)', () => {
  it('Rage yetmezse kullanılamaz ("Not enough rage"); MP bol olsa bile', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'archer' });
    const w = b.get('party-0')!;
    w.mp = w.maxMp;
    w.rage = cry.cost.amount - 1;
    expect(b.canUse('party-0', 'abyssal_cry')).toEqual({ ok: false, reason: 'Not enough rage' });
    w.rage = cry.cost.amount;
    expect(b.canUse('party-0', 'abyssal_cry').ok).toBe(true);
  });

  it('kullanılınca Rage düşer (rage olayı delta -bedel), MP ve can harcanmaz, Abyssal Fury uygulanır (madde 262)', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'archer' });
    const w = b.get('party-0')!;
    w.rage = R.max;
    const mp0 = w.mp;
    const hp0 = w.hp;
    const events = act(b, 'party-0', 'abyssal_cry');
    expect(ofType(events, 'rage')).toEqual([{ type: 'rage', actor: 'party-0', delta: -cry.cost.amount, after: R.max - cry.cost.amount, max: R.max }]);
    expect(ofType(events, 'resource')).toHaveLength(0); // MP/can 'resource' olayı yok
    expect(ofType(events, 'damage')).toHaveLength(0); // can bedeli yok (madde 262)
    expect(w.rage).toBe(R.max - cry.cost.amount);
    expect(w.mp).toBe(mp0);
    expect(w.hp).toBe(hp0);
    expect(w.statuses.some((s) => s.kind === 'abyssal_fury')).toBe(true);
  });

  it('Rage bedeli freeMp (debug) ile bedavalaşmaz; test modunda da çalışır', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'archer' });
    b.freeMp = true;
    expect(b.canUse('party-0', 'abyssal_cry').ok).toBe(false);
    b.debugSetResource('party-0', 'rage', 80);
    expect(b.canUse('party-0', 'abyssal_cry').ok).toBe(true);
  });

  it('YZ yetmeyen Rage ile Abyssal Cry seçmez; Rage yeterliyse ve koşullar uygunsa seçer', () => {
    const foes = { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler', 4: 'antimage' };
    const setup = () => {
      const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, foes);
      b.debugClearCooldowns();
      for (const c of b.combatants) {
        c.maxHp = Math.max(c.maxHp, 100);
        c.hp = c.maxHp;
        c.mp = c.maxMp;
      }
      return b;
    };
    const poor = setup();
    poor.get('party-0')!.rage = cry.cost.amount - 1;
    expect(chooseAction(poor, 'party-0', classOnly)?.skillId).not.toBe('abyssal_cry');
    const rich = setup();
    rich.get('party-0')!.rage = cry.cost.amount;
    expect(chooseAction(rich, 'party-0', classOnly)).toMatchObject({ skillId: 'abyssal_cry', reason: 'tactic' });
  });

  it('düşük Rage seçimi engellemez (terazi, madde 257; madde 258: skill ipuçlarında koşul yok); seçim en yüksek puandır', () => {
    const setup = content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior', 1: 'paladin' }), enemies: cells({ 0: 'archer', 1: 'mage' }) }, false);
    const c = new Battle(setup);
    for (const u of c.combatants) Object.assign(u.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    c.get('party-0')!.mp = 100;
    c.get('party-0')!.skills = c.get('party-0')!.skills.filter((s) => s !== 'abyssal_cry'); // Abyssal Cry ile yarışmasın
    c.get('party-0')!.rage = 10;
    const ex = explainChoice(c, 'party-0', classOnly)!;
    expect(ex.candidates.filter((x) => x.skill === 'whirlwind').every((x) => x.verdict !== 'blocked')).toBe(true);
    c.get('party-0')!.skills = c.get('party-0')!.skills.filter((s) => s !== 'charge');
    const choice = chooseAction(c, 'party-0', classOnly)!;
    expect(choice.score).toBe(Math.max(...explainChoice(c, 'party-0', classOnly)!.candidates.map((x) => x.score ?? -Infinity)));
  });
});

describe('Rage: debug ve determinizm', () => {
  it('debugSetResource rage ayarlar (sınırlı) ve rage olayı yayınlar', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' });
    expect(b.debugSetResource('party-0', 'rage', 999).ok).toBe(true);
    expect(b.get('party-0')!.rage).toBe(R.max);
    expect(b.log.filter((e) => e.type === 'rage')).toHaveLength(1);
  });

  it('aynı seed + aynı girdi: Rage dahil olay akışı birebir aynı', () => {
    const run = () => {
      const b = new Battle(content.battleSetup('random-battle', 7, 'turns', { party: ['warrior', 'paladin', 'mage'], enemies: ['archer', 'defender', 'undead'] }));
      for (let i = 0; i < 80 && !b.winner; i++) b.applyChoice(b.currentUid!, chooseAction(b, b.currentUid!, content.aiConfig));
      return JSON.stringify(b.log);
    };
    expect(run()).toBe(run());
  });
});
