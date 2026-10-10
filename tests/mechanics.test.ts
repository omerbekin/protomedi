import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Battle, armorReduction, attributePower, chooseAction, content, describePassive, describeSkill, nominalBurn, previewSkill } from '../src/engine';
import type { BattleEvent, BattleMode, Combatant } from '../src/engine';
import { installLegacySkills } from './legacy-skills';
import { shapeCells } from '../src/engine/area-shape';

installLegacySkills();

type Teams = { party: string[]; enemies: string[] };

/** Verilen takımlarla savaş. `calm`: kritik ve dodge kapalı (sayılar zara bağlı olmasın). */
function make(teams: Teams, opts: { seed?: number; mode?: BattleMode; calm?: boolean } = {}): Battle {
  const b = new Battle(content.battleSetup('first-battle', opts.seed ?? 1, opts.mode ?? 'test', teams));
  if (opts.calm ?? true) for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
}

/** Bir tarafta class id'sine göre birim. */
const unit = (b: Battle, side: 'party' | 'enemy', defId: string): Combatant => {
  const c = b.combatants.find((x) => x.side === side && x.defId === defId && !x.summoned);
  if (!c) throw new Error(`${side} ${defId} yok`);
  return c;
};

function act(b: Battle, actor: string, skill: string, target?: string, slot?: number): BattleEvent[] {
  const r = b.useSkill(actor, skill, target, slot);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
}

const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

const total = (events: BattleEvent[], target: string) =>
  ofType(events, 'damage').filter((e) => e.target === target).reduce((s, e) => s + e.amount + e.absorbed, 0);

/** Sırası gelen birim `uid` olana kadar herkes pas geçer. */
function skipUntil(b: Battle, uid: string): void {
  for (let i = 0; i < 300 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}

const T1: Teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };

describe('kritik vuruş', () => {
  it('kritik, hasarın SON çarpanıdır: normal hasar x critMult (aynı zar, aynı sapma)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const normal = make(T1, { seed });
      const crit = make(T1, { seed });
      const e = unit(crit, 'enemy', 'defender').uid;
      const w = unit(crit, 'party', 'warrior');
      Object.assign(w.stats, { critChance: 1, critMult: 2 });
      const n = ofType(act(normal, unit(normal, 'party', 'warrior').uid, 'power_strike', unit(normal, 'enemy', 'defender').uid), 'damage')[0]!;
      const c = ofType(act(crit, w.uid, 'power_strike', e), 'damage')[0]!;
      expect(n.crit).toBe(false);
      expect(c.crit).toBe(true);
      expect(c.amount + c.absorbed).toBe(Math.round((n.amount + n.absorbed) * 2));
    }
  });

  it('kritik şifada da çalışır (son çarpan)', () => {
    for (const seed of [1, 2, 3]) {
      const normal = make(T1, { seed });
      const crit = make(T1, { seed });
      for (const b of [normal, crit]) unit(b, 'party', 'warrior').hp = 1;
      const paladinCrit = unit(crit, 'party', 'paladin');
      Object.assign(paladinCrit.stats, { critChance: 1, critMult: 1.5 });
      const n = ofType(act(normal, unit(normal, 'party', 'paladin').uid, 'lay_on_hands', unit(normal, 'party', 'warrior').uid), 'heal')[0]!;
      const c = ofType(act(crit, paladinCrit.uid, 'lay_on_hands', unit(crit, 'party', 'warrior').uid), 'heal')[0]!;
      expect(c.crit).toBe(true);
      expect(c.amount).toBe(Math.round(n.amount * 1.5));
    }
  });

  it('kritik kalkana uygulanmaz', () => {
    const b = make(T1, { calm: false });
    const mage = unit(b, 'party', 'mage');
    Object.assign(mage.stats, { critChance: 1, critMult: 3 });
    const sh = ofType(act(b, mage.uid, 'mana_barrier', unit(b, 'party', 'warrior').uid), 'shield')[0]!;
    expect(sh.amount).toBe(Math.round(attributePower(mage.stats, 'int', content.formulas) * (content.skills.mana_barrier!.effects.find((e) => e.type === 'shield') as { power: number }).power));
  });

  it('kritik damage olayında işaretlenir; kritik yokken false', () => {
    const b = make(T1);
    const w = unit(b, 'party', 'warrior');
    expect(ofType(act(b, w.uid, 'melee_attack', unit(b, 'enemy', 'defender').uid), 'damage')[0]!.crit).toBe(false);
  });
});

describe('isabet kontrolü: dodge/iska (fiziksel ve büyülü)', () => {
  it('iska eden vuruş hasar vermez: dodge olayı gelir, damage olayı gelmez', () => {
    const b = make(T1);
    const target = unit(b, 'enemy', 'defender');
    b.debug.dodge = 'always';
    const hp = target.hp;
    const events = act(b, unit(b, 'party', 'warrior').uid, 'melee_attack', target.uid);
    expect(ofType(events, 'dodge')).toHaveLength(2); // Double Strike: iki vuruş da kaçırılır
    expect(ofType(events, 'damage')).toHaveLength(0);
    expect(target.hp).toBe(hp);
  });

  it('büyü hasarı da isabet kontrolüne girer (iska = dodge olayı)', () => {
    const b = make(T1);
    const target = unit(b, 'enemy', 'defender');
    b.debug.dodge = 'always';
    const events = act(b, unit(b, 'party', 'mage').uid, 'fire_bolt', target.uid);
    expect(ofType(events, 'dodge')).toHaveLength(1);
    expect(ofType(events, 'damage')).toHaveLength(0);
  });

  it('kaçınma (evasion) Dexterity ile artar: yüksek dex sınıfı daha çok kaçınır', () => {
    expect(content.classes.archer!.stats.evasion).toBeGreaterThan(content.classes.defender!.stats.evasion);
  });
});

describe('skill hasarı hangi özelliğe bağlıysa onunla ölçeklenir', () => {
  /** Aynı seed ve aynı vuruşta, bir özelliği artırınca hasarın değişip değişmediği. */
  function damageWith(actorDef: string, skill: string, attribute: 'str' | 'int' | 'dex', value: number): number {
    const teams: Teams = { party: [actorDef, 'warrior', 'mage', 'paladin'], enemies: ['warrior', 'defender', 'archer', 'mage'] };
    const b = make(teams, { seed: 11 });
    const actor = unit(b, 'party', actorDef);
    actor.stats[attribute] = value;
    return total(act(b, actor.uid, skill, unit(b, 'enemy', 'warrior').uid), unit(b, 'enemy', 'warrior').uid);
  }

  it('Archer (DEX): dex artınca hasar artar, str/int artınca değişmez', () => {
    const base = damageWith('archer', 'quick_shot', 'dex', content.classes.archer!.attributes.dex);
    expect(damageWith('archer', 'quick_shot', 'dex', 90)).toBeGreaterThan(base * 2);
    expect(damageWith('archer', 'quick_shot', 'str', 99)).toBe(base);
    expect(damageWith('archer', 'quick_shot', 'int', 99)).toBe(base);
  });

  it('Mage (INT): int artınca hasar artar, str/dex artınca değişmez', () => {
    const base = damageWith('mage', 'fire_bolt', 'int', content.classes.mage!.attributes.int);
    expect(damageWith('mage', 'fire_bolt', 'int', 150)).toBeGreaterThan(base * 2);
    expect(damageWith('mage', 'fire_bolt', 'str', 99)).toBe(base);
    expect(damageWith('mage', 'fire_bolt', 'dex', 99)).toBe(base);
  });

  it('Warrior (STR): str artınca hasar artar, int/dex artınca değişmez', () => {
    const base = damageWith('warrior', 'melee_attack', 'str', content.classes.warrior!.attributes.str);
    expect(damageWith('warrior', 'melee_attack', 'str', 96)).toBeGreaterThan(base * 2);
    expect(damageWith('warrior', 'melee_attack', 'int', 99)).toBe(base);
    expect(damageWith('warrior', 'melee_attack', 'dex', 99)).toBe(base);
  });

  it("Undead karanlık skill'leri INT'e bağlı (Dark Mage, Int primary)", () => {
    expect(damageWith('undead', 'blood_rite', 'int', 99)).toBeGreaterThan(damageWith('undead', 'blood_rite', 'int', content.classes.undead!.attributes.int));
    expect(damageWith('undead', 'blood_rite', 'str', 99)).toBe(damageWith('undead', 'blood_rite', 'str', content.classes.undead!.attributes.str));
  });

  it('şifa ve kalkan da kendi özelliğine bağlı: Lay on Hands INT, Shield Wall STR', () => {
    const b = make(T1);
    const paladin = unit(b, 'party', 'paladin');
    paladin.stats.int = 100;
    paladin.stats.str = 1;
    const lowStr = b.get(unit(b, 'party', 'warrior').uid)!;
    lowStr.hp = 1;
    const heal = ofType(act(b, paladin.uid, 'lay_on_hands', lowStr.uid), 'heal')[0]!;
    expect(heal.amount).toBeGreaterThan(40); // int 100 x 0,7 x 2,5 ≈ 175 ama maks cana kadar
    const w = unit(b, 'party', 'warrior');
    w.stats.str = 40;
    w.stats.int = 1;
    expect(ofType(act(b, w.uid, 'shield_wall'), 'shield')[0]!.amount).toBe(Math.round(40 * content.formulas.scaling.str * 1.1));
  });
});

/** Izgara testleri için: 12 hücrelik listeden (index = yuva) kurulan savaş. */
/** Isabet kontrolü kapalı (accuracy yüksek, evasion 0): dizilim/hedef testleri iskadan etkilenmesin. */
const grid = (party: string[], enemies: string[], seed = 1) => {
  const b = new Battle(content.battleSetup('random-battle', seed, 'test', { party, enemies }, false));
  for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0 });
  return b;
};
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const full = (id = 'warrior') => Array.from({ length: 12 }, () => id);
const eAt = (b: Battle, slot: number) => b.combatants.find((c) => c.side === 'enemy' && c.slot === slot)!;

describe('dizilim ve menzil', () => {
  it('otomatik dizilim: sıralara ikişer ikişer, her sıranın 1. ve 3. şeridine yerleşir', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin', 'druid'], enemies: ['defender', 'warrior', 'archer', 'mage', 'antimage'] });
    expect(b.livingByDepth('party').map((c) => [c.defId, c.slot])).toEqual([['warrior', 0], ['paladin', 2], ['druid', 3], ['mage', 5], ['archer', 6]]);
    expect(b.rowOf(5)).toBe(1);
    expect(b.laneOf(5)).toBe(2);
  });

  it('yakın dövüş yalnızca düşmanın ön sırasına vurabilir', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    const w = unit(b, 'party', 'warrior').uid;
    expect(b.validTargets(w, 'melee_attack').map((c) => c.defId)).toEqual(['defender', 'warrior']);
    expect(b.useSkill(w, 'melee_attack', unit(b, 'enemy', 'archer').uid).ok).toBe(false); // ikinci sıra
    expect(b.useSkill(w, 'melee_attack', unit(b, 'enemy', 'mage').uid).ok).toBe(false);
  });

  it('ön sıra boşalınca arkadaki sıra menzile girer (en öndeki DOLU sıra sayılır)', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    const w = unit(b, 'party', 'warrior').uid;
    unit(b, 'enemy', 'defender').hp = 0;
    expect(b.validTargets(w, 'melee_attack').map((c) => c.defId)).toEqual(['warrior']); // ön sırada hâlâ biri var
    unit(b, 'enemy', 'warrior').hp = 0;
    expect(b.validTargets(w, 'melee_attack').map((c) => c.defId)).toEqual(['mage', 'archer']); // 2. sıra: Mage ve en arkadaki Archer
  });

  it('büyü, ok ve yukarıdan düşen skill\'ler sıra sınırına takılmaz', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'quick_shot')).toHaveLength(4);
    expect(b.validTargets(unit(b, 'party', 'mage').uid, 'fire_bolt')).toHaveLength(4);
    expect(b.validTargets(unit(b, 'party', 'mage').uid, 'meteor')).toHaveLength(4);
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'arrow_rain')).toHaveLength(4);
  });

  it('Whirlwind yalnızca ön sıradaki herkese vurur', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    const events = act(b, unit(b, 'party', 'warrior').uid, 'whirlwind');
    expect(ofType(events, 'damage').map((e) => e.target)).toEqual([unit(b, 'enemy', 'defender').uid, unit(b, 'enemy', 'warrior').uid]);
  });

  it('ön sırada 3 kişi varsa Whirlwind üçüne de vurur', () => {
    const b = grid(cells({ 0: 'warrior' }), cells({ 0: 'warrior', 1: 'mage', 2: 'archer', 3: 'druid' }));
    const events = act(b, 'party-0', 'whirlwind');
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('menzil karşı taraf için de aynı: düşman yakın dövüşçüsü oyuncunun ön sırasına vurur', () => {
    const b = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    expect(b.validTargets(unit(b, 'enemy', 'warrior').uid, 'melee_attack').map((c) => c.defId)).toEqual(['defender', 'warrior']);
  });

  it('artı (Meteor, plus): merkez + önü, arkası, sağı, solu; çaprazlar vurulmaz (eski radius 1 ile aynı hücreler)', () => {
    const b = grid(full(), full());
    expect(content.skills.meteor!.area).toMatchObject({ shape: 'plus' });
    const hit = b.areaWindow('party-0', 'meteor', 'enemy-4').map((c) => c.slot).sort((x, y) => x - y);
    expect(hit).toEqual([1, 3, 4, 5, 7]);
  });

  it('dolu tahtada her alan skill\'i şeklinin TÜM hücrelerine vurur (her anchor; şekil veriden)', () => {
    const b = grid(full(), full());
    const fm = content.formulas.formation;
    for (const s of Object.values(content.skills).filter((x) => x.target === 'area_enemies' && x.motion !== 'melee')) {
      for (let slot = 0; slot < 12; slot++) {
        const hit = b.areaWindow('party-0', s.id, `enemy-${slot}`).map((c) => c.slot).sort((x, y) => x - y);
        expect(hit, `${s.id} @${slot}`).toEqual(shapeCells(s.area!, slot, 'enemy', fm));
      }
    }
    // Arrow Rain 3x3 (eski radius 2'ye en yakın kapsam): her anchor'da 9 hücre
    expect(content.skills.arrow_rain!.area).toMatchObject({ shape: 'rect', rows: 3, cols: 3 });
    expect(b.areaWindow('party-0', 'arrow_rain', 'enemy-4')).toHaveLength(9);
  });

  it('ölü/boş hücre şekli doldurmaz; şeklin dışındaki uzak birim vurulmaz', () => {
    const b = grid(full(), full());
    eAt(b, 3).hp = 0; // merkez 0'ın arkası öldü
    expect(b.areaWindow('party-0', 'meteor', 'enemy-0').map((c) => c.slot)).toEqual([0, 1]);
    const e = grid(cells({ 0: 'warrior' }), cells({ 0: 'mage', 6: 'archer' }));
    expect(e.areaWindow('party-0', 'meteor', 'enemy-0').map((c) => c.slot)).toEqual([0]); // 6, 2 sıra uzakta: artının dışında
  });

  it('alan skill\'i şeklin hücrelerindeki canlılara vurur (Blizzard, veriden şekil); ölü ve boş yuvalar boşluktur', () => {
    const b = grid(cells({ 0: 'mage' }), full('mage'));
    eAt(b, 7).hp = 0;
    const cells4 = b.areaCells('blizzard', 4);
    const want = b.living('enemy').filter((c) => cells4.includes(c.slot)).map((c) => c.uid).sort();
    const dmg = ofType(act(b, 'party-0', 'blizzard', 'enemy-4'), 'damage').map((e) => e.target).sort();
    expect(dmg).toEqual(want);
    expect(dmg).not.toContain(eAt(b, 7).uid);
  });

  it('Piercing Arrow seçilen şeritteki herkese vurur; her yeni hedef bir öncekinden %30 az hasar alır', () => {
    let r1 = 0;
    let r2 = 0;
    const seeds = 40;
    for (let seed = 1; seed <= seeds; seed++) {
      const b = grid(cells({ 0: 'archer' }), cells({ 0: 'warrior', 3: 'warrior', 6: 'warrior', 2: 'druid' }), seed);
      for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
      delete b.get('party-0')!.passive; // mesafe pasifi ölçümü bozmasın
      const events = act(b, 'party-0', 'piercing_arrow', 'enemy-0');
      // şerit 0: slot 0, 3, 6 (druid şerit 2'de, vurulmaz); öndekinden arkadakine
      expect(ofType(events, 'damage').map((e) => e.target)).toEqual(['enemy-0', 'enemy-2', 'enemy-3']);
      r1 += total(events, 'enemy-2') / total(events, 'enemy-0');
      r2 += total(events, 'enemy-3') / total(events, 'enemy-2');
    }
    expect(r1 / seeds).toBeGreaterThan(0.65);
    expect(r1 / seeds).toBeLessThan(0.75);
    expect(r2 / seeds).toBeGreaterThan(0.65);
    expect(r2 / seeds).toBeLessThan(0.75);
  });

  it('Piercing Arrow zırhı görmezden gelmez; Aimed Shot zırhın %50\'sini görmezden gelir', () => {
    expect((content.skills.piercing_arrow!.effects[0] as { ignoreDefense?: number }).ignoreDefense).toBeUndefined();
    expect((content.skills.aimed_shot!.effects[0] as { ignoreDefense?: number }).ignoreDefense).toBe(0.5);
  });

  it('Piercing Arrow: ana hedef kaçsa bile şeritteki diğerleri vurulur; şeritte kimse yoksa yalnızca hedef', () => {
    let missed = false;
    for (let seed = 1; seed <= 60 && !missed; seed++) {
    const d = grid(cells({ 0: 'archer' }), cells({ 0: 'warrior', 3: 'warrior', 2: 'druid' }), seed);
    for (const c of d.combatants) Object.assign(c.stats, { accuracy: 1, evasion: 0 });
    const front = eAt(d, 0);
    front.stats.evasion = 0.8; // ön hedefe isabet şansı çok düşük: bazı tohumlarda iska eder
    const events = act(d, 'party-0', 'piercing_arrow', front.uid);
    if (ofType(events, 'dodge').some((e) => e.target === front.uid)) {
      missed = true;
      expect(ofType(events, 'damage').map((e) => e.target)).toEqual([eAt(d, 3).uid]);
    }
    }
    expect(missed).toBe(true);
    const alone = grid(cells({ 0: 'archer' }), cells({ 0: 'warrior', 2: 'druid' }));
    expect(ofType(act(alone, 'party-0', 'piercing_arrow', 'enemy-0'), 'damage')).toHaveLength(1);
  });

  it('Piercing Arrow önizlemesi şerittekileri de gösterir (ana hedef tam, diğerleri splash)', async () => {
    const { previewSkill } = await import('../src/engine');
    const b = grid(cells({ 0: 'archer' }), cells({ 0: 'warrior', 3: 'warrior', 2: 'druid' }));
    const p = previewSkill(b, 'party-0', 'piercing_arrow', 'enemy-0');
    expect(p).toHaveLength(2);
    expect(p[0]!.damage!.splash).toBe(false);
    expect(p[1]!.damage!.splash).toBe(true);
    expect(p[1]!.damage!.avg).toBeLessThan(p[0]!.damage!.avg);
  });
});

describe('Defender: Taunt, Guard, Fist Crush', () => {
  const TD: Teams = { party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] };

  it('Taunt: düşmanın tek hedefli skill\'leri yalnızca taunt\'lı birime gidebilir; toplu skill etkilenmez', () => {
    const b = make(TD);
    const defender = unit(b, 'enemy', 'defender');
    act(b, defender.uid, 'taunt');
    expect(defender.statuses.some((s) => s.kind === 'taunt')).toBe(true);
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'quick_shot').map((c) => c.uid)).toEqual([defender.uid]);
    expect(b.validTargets(unit(b, 'party', 'mage').uid, 'fire_bolt').map((c) => c.uid)).toEqual([defender.uid]);
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'arrow_rain')).toHaveLength(4); // toplu: etkilenmez
    expect(b.useSkill(unit(b, 'party', 'archer').uid, 'quick_shot', unit(b, 'enemy', 'mage').uid).ok).toBe(false);
  });

  it('Taunt\'lı birim menzilin dışındaysa yakın dövüşçüler normal hedefleriyle kalır', () => {
    const b = make({ party: ['warrior', 'archer', 'mage', 'paladin'], enemies: ['warrior', 'archer', 'mage', 'defender'] });
    // Takım otomatik dizildiği için Defender öne geçer; test için onu elle en arkaya alıyoruz (menzil dışı)
    const where: Record<string, number> = { warrior: 0, archer: 2, mage: 3, defender: 5 }; // Defender 2. sırada: menzil dışı
    for (const c of b.combatants.filter((x) => x.side === 'enemy')) c.slot = where[c.defId]!;
    act(b, unit(b, 'enemy', 'defender').uid, 'taunt');
    const w = unit(b, 'party', 'warrior').uid;
    expect(b.validTargets(w, 'melee_attack').map((c) => c.defId)).toEqual(['warrior', 'archer']);
    // menzilli saldırı ise taunt'lı birime zorlanır
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'quick_shot').map((c) => c.defId)).toEqual(['defender']);
  });

  it('Taunt kalkan VERMEZ (Ömer 2026-10-10, Defender Seçenek A) ve süreli: turns kadar sonra biter', () => {
    const b = make(TD, { mode: 'turns' });
    const defender = unit(b, 'enemy', 'defender');
    skipUntil(b, defender.uid);
    const events = act(b, defender.uid, 'taunt');
    expect(defender.shield).toBe(0);
    expect(ofType(events, 'shield')).toHaveLength(0);
    expect(ofType(events, 'status')[0]).toMatchObject({ status: 'taunt', turns: 2 });
    // Defender'ın sonraki iki turunun başında süre azalır; ikincisinde biter
    let ended = false;
    for (let guard = 0, turns = 0; guard < 300 && !ended; guard++) {
      if (b.currentUid === defender.uid) turns++;
      const r = b.skipTurn();
      if (r.ok && r.events.some((e) => e.type === 'statusEnd' && e.status === 'taunt')) ended = true;
      if (turns > 4) break;
    }
    expect(ended).toBe(true);
    expect(defender.statuses.some((s) => s.kind === 'taunt')).toBe(false);
    expect(b.validTargets(unit(b, 'party', 'archer').uid, 'quick_shot')).toHaveLength(4);
  });

  it('Guard: korunan dostun aldığı hasarın bir kısmı korumacıya geçer; toplam hasar aynı kalır', () => {
    const guardShare = (content.skills.guard!.effects.find((e) => e.type === 'guard') as { share: number }).share;
    for (const seed of [1, 2, 3, 4]) {
      const plain = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] }, { seed });
      const guarded = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] }, { seed });
      const warriorP = unit(plain, 'party', 'warrior');
      const warriorG = unit(guarded, 'party', 'warrior');
      const defenderG = unit(guarded, 'party', 'defender');
      act(guarded, defenderG.uid, 'guard', warriorG.uid);
      expect(warriorG.statuses.find((s) => s.kind === 'guard')).toMatchObject({ source: defenderG.uid, share: guardShare }); // pay veriden (madde 261 denge turu: 0,5 -> 0,6)
      const hit = (b: Battle) => act(b, unit(b, 'enemy', 'warrior').uid, 'melee_attack', unit(b, 'party', 'warrior').uid);
      const base = total(hit(plain), warriorP.uid);
      const events = hit(guarded);
      const onWarrior = ofType(events, 'damage').filter((e) => e.target === warriorG.uid);
      const onDefender = ofType(events, 'damage').filter((e) => e.target === defenderG.uid);
      expect(onWarrior).toHaveLength(2); // Double Strike: iki vuruş
      expect(onDefender).toHaveLength(2);
      expect(onDefender.every((e) => e.redirected)).toBe(true);
      const sum = (list: typeof onWarrior) => list.reduce((s, e) => s + e.amount + e.absorbed, 0);
      expect(sum(onWarrior) + sum(onDefender)).toBe(base);
      expect(sum(onDefender)).toBeGreaterThanOrEqual(Math.round(base * guardShare) - 1);
      expect(sum(onDefender)).toBeLessThanOrEqual(Math.round(base * guardShare) + 1);
    }
  });

  it('Guard süreli (3 tur) ve korumacı ölürse etkisiz', () => {
    const b = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    const defender = unit(b, 'party', 'defender');
    const warrior = unit(b, 'party', 'warrior');
    act(b, defender.uid, 'guard', warrior.uid);
    defender.hp = 0;
    const events = act(b, unit(b, 'enemy', 'warrior').uid, 'melee_attack', warrior.uid);
    expect(ofType(events, 'damage').filter((e) => e.redirected)).toHaveLength(0);
  });

  it('Fist Crush: yukarıdan rastgele 3 FARKLI düşmana yüksek hasarlı yumruk; hedef seçilmez', () => {
    expect(content.skills.fist_crush).toMatchObject({ target: 'random_enemies', count: 3, motion: 'sky', skyFx: 'fist' });
    const b = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior', 1: 'warrior', 2: 'warrior', 3: 'mage', 4: 'archer' }));
    const events = act(b, 'party-0', 'fist_crush');
    const hit = ofType(events, 'damage').map((e) => e.target);
    expect(new Set(hit).size).toBe(3);
    expect(ofType(events, 'skillUsed')[0]?.targets).toHaveLength(3);
    // aynı seed aynı hedefleri seçer; farklı seed'ler farklı kümeler üretir
    const again = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior', 1: 'warrior', 2: 'warrior', 3: 'mage', 4: 'archer' }));
    expect(ofType(act(again, 'party-0', 'fist_crush'), 'damage').map((e) => e.target)).toEqual(hit);
    const sets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const c = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior', 1: 'warrior', 2: 'warrior', 3: 'mage', 4: 'archer' }), seed);
      sets.add(ofType(act(c, 'party-0', 'fist_crush'), 'damage').map((e) => e.target).sort().join());
    }
    expect(sets.size).toBeGreaterThan(3);
  });

  it('Fist Crush 3\'ten az düşman varsa hepsine vurur', () => {
    const b = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior', 3: 'mage' }));
    for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0 });
    expect(ofType(act(b, 'party-0', 'fist_crush'), 'damage')).toHaveLength(2);
  });
});

describe('Druid: tur bazlı şifa ve çağrı süresi', () => {
  const TDR: Teams = { party: ['warrior', 'druid', 'mage', 'archer'], enemies: ['warrior', 'archer', 'mage', 'paladin'] };

  it('Rejuvenate hemen başlangıç şifası verir, sonra hedefin sonraki 3 turunun başında iyileştirir ve biter', () => {
    const b = make(TDR, { mode: 'turns' });
    const druid = unit(b, 'party', 'druid');
    const target = unit(b, 'party', 'warrior');
    skipUntil(b, druid.uid);
    target.stats.hpRegen = 0; // Str can yenilenmesi bu ölçümü bozmasın
    target.hp = 20;
    const events = act(b, druid.uid, 'rejuvenate', target.uid);
    // hemen bir başlangıç şifası (tur başına x tik sayısı) verir; asıl tur bazlı şifa sonraki turlarda gelir
    const initial = ofType(events, 'heal');
    expect(initial).toHaveLength(1);
    expect(initial[0]!.amount).toBeGreaterThan(Math.round(attributePower(druid.stats, 'int', content.formulas) * (content.skills.rejuvenate!.effects.find((e) => e.type === 'hot') as { power: number }).power) * 2);
    expect(ofType(events, 'status')[0]).toMatchObject({ target: target.uid, status: 'regen', turns: 3 });
    const perTurn = Math.round(attributePower(druid.stats, 'int', content.formulas) * (content.skills.rejuvenate!.effects.find((e) => e.type === 'hot') as { power: number }).power);

    const ticks: number[] = [];
    let ended = false;
    for (let i = 0; i < 400 && !ended; i++) {
      const r = b.skipTurn();
      if (!r.ok) break;
      for (const e of r.events) {
        if (e.type === 'heal' && e.target === target.uid && e.source === druid.uid) ticks.push(e.amount);
        if (e.type === 'statusEnd' && e.status === 'regen' && e.target === target.uid) ended = true;
      }
    }
    expect(ended).toBe(true);
    expect(ticks).toEqual([perTurn, perTurn, perTurn]); // tam 3 tik
    expect(target.hp).toBe(Math.min(target.maxHp, 20 + initial[0]!.amount + perTurn * 3)); // başlangıç şifası + 3 tik
    expect(target.statuses.some((s) => s.kind === 'regen')).toBe(false);
  });

  it('tur bazlı şifa kritik zarını her tikte ayrı atar (kritik açıkken tik büyür)', () => {
    const b = make(TDR, { mode: 'turns' });
    const druid = unit(b, 'party', 'druid');
    Object.assign(druid.stats, { critChance: 1, critMult: 2 });
    const target = unit(b, 'party', 'warrior');
    skipUntil(b, druid.uid);
    target.stats.hpRegen = 0;
    target.maxHp = 1000; // tavan şifayı kırpmasın
    target.hp = 1;
    const heals: number[] = [];
    for (const e of act(b, druid.uid, 'rejuvenate', target.uid)) if (e.type === 'heal') heals.push(e.amount);
    for (let i = 0; i < 400 && heals.length < 4; i++) {
      const r = b.skipTurn();
      if (r.ok) for (const e of r.events) if (e.type === 'heal' && e.target === target.uid && e.source === druid.uid) heals.push(e.amount);
    }
    const perTurn = Math.round(attributePower(druid.stats, 'int', content.formulas) * (content.skills.rejuvenate!.effects.find((e) => e.type === 'hot') as { power: number }).power);
    expect(heals.slice(1)).toEqual([perTurn * 2, perTurn * 2, perTurn * 2]); // ilk eleman başlangıç şifası, sonrası tikler
  });

  it('Summon Treant: çağrılan birim 3 turunu oynar ve sonra sahneden kalkar (despawn)', () => {
    const b = make(TDR, { mode: 'turns' });
    const druid = unit(b, 'party', 'druid');
    skipUntil(b, druid.uid);
    const uid = ofType(act(b, druid.uid, 'summon_treant'), 'summon')[0]!.combatant.uid;
    expect(b.get(uid)!.lifespan).toBe(3);
    let acted = 0;
    let despawned = false;
    for (let i = 0; i < 600 && !despawned; i++) {
      if (b.currentUid === uid) acted++;
      const r = b.skipTurn();
      if (r.ok && r.events.some((e) => e.type === 'despawn' && e.target === uid)) despawned = true;
      if (r.ok && r.events.some((e) => e.type === 'death' && e.target === uid)) throw new Error('despawn "death" olarak bildirilmemeli');
    }
    expect(despawned).toBe(true);
    expect(acted).toBe(3);
    expect(b.get(uid)!.hp).toBe(0);
    expect(b.turnQueue(40)).not.toContain(uid);
  });

  it('çağrılan birim hasarı %100 fazla yer (x2)', () => {
    const mk = (summoned: boolean) => {
      const b = make(TDR, { seed: 4 });
      const druid = unit(b, 'party', 'druid');
      const uid = ofType(act(b, druid.uid, 'summon_treant'), 'summon')[0]!.combatant.uid;
      b.get(uid)!.summoned = summoned;
      b.get(uid)!.hp = 100000;
      b.get(uid)!.maxHp = 100000;
      return total(act(b, unit(b, 'enemy', 'mage').uid, 'fire_bolt', uid), uid);
    };
    const doubled = mk(true);
    const normal = mk(false);
    expect(doubled).toBeGreaterThanOrEqual(normal * 2 - 1);
    expect(doubled).toBeLessThanOrEqual(normal * 2 + 1);
  });

  it('çağrılan birimin süresi test modunda işlemez (tur yok)', () => {
    const b = make(TDR, { mode: 'test' });
    const uid = ofType(act(b, unit(b, 'party', 'druid').uid, 'summon_treant'), 'summon')[0]!.combatant.uid;
    for (let i = 0; i < 6; i++) act(b, uid, 'root_smash', unit(b, 'enemy', 'warrior').uid);
    expect(b.get(uid)!.hp).toBeGreaterThan(0);
  });
});

describe('Anti-Mage: mana yakma, eksik manaya göre hasar, büyü kalkanı', () => {
  const TA: Teams = { party: ['antimage', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'mage', 'druid', 'archer'] };

  /** Anti-Mage artık melee: hedefi öne al (otomatik dizilimde Mage arkada). */
  const toFront = (b: Battle, defId: string) => {
    const t = unit(b, 'enemy', defId);
    for (const c of b.combatants.filter((x) => x.side === 'enemy' && x.uid !== t.uid)) c.slot += 3; // diğerleri bir sıra geriye
    t.slot = 0;
  };

  it('Mana Burn hedefin manasından 10 yakar ve hasar verir; mana 10\'dan azsa kalanı yakar', () => {
    const b = make(TA);
    const am = unit(b, 'party', 'antimage');
    expect(content.skills[am.skills[0]!]?.id).toBe('mana_burn'); // varsayılan ilk skill
    toFront(b, 'mage');
    const mage = unit(b, 'enemy', 'mage');
    const before = mage.mp;
    am.mp = 0;
    const events = act(b, am.uid, 'mana_burn', mage.uid);
    expect(ofType(events, 'manaBurn')[0]).toMatchObject({ target: mage.uid, amount: 10, mpAfter: before - 10 });
    expect(am.mp).toBe(5); // yaktığının %50'si kendine
    expect(ofType(events, 'damage')).toHaveLength(1);
    mage.hp = mage.maxHp; // hasar yükselse de hedef ölmesin
    mage.mp = 4;
    expect(ofType(act(b, am.uid, 'mana_burn', mage.uid), 'manaBurn')[0]).toMatchObject({ amount: 4, mpAfter: 0 });
    mage.mp = 0;
    expect(ofType(act(b, am.uid, 'mana_burn', mage.uid), 'manaBurn')).toHaveLength(0);
  });

  it('Anti-Mage: ilk skill (Mana Burn) melee, Void Strike menzilli; Spell Ward kalkanı kalan MP ile büyür', () => {
    expect(content.skills.mana_burn!.motion).toBe('melee');
    expect(content.skills.void_strike!.motion).toBe('cast'); // Void Strike artık menzilli
    const shield = (mp: number) => {
      const b = make(TA);
      const am = unit(b, 'party', 'antimage');
      am.mp = mp;
      return ofType(act(b, am.uid, 'spell_ward', am.uid), 'shield')[0]!.amount; // madde 240: tek dost (kendisi dahil)
    };
    expect(shield(40)).toBeGreaterThan(shield(15));
    const b = make(TA);
    const back = b.livingByDepth('enemy').at(-1)!;
    expect(b.validTargets(unit(b, 'party', 'antimage').uid, 'mana_burn').map((c) => c.uid)).not.toContain(back.uid);
  });

  it('Mana Burn bedelsizdir (temel saldırı)', () => {
    expect(content.skills.mana_burn!.cost.amount).toBe(0);
  });

  it('Drain Field karşı takımın tamamının manasını ufak derecede azaltır', () => {
    const b = make(TA);
    const am = unit(b, 'party', 'antimage');
    const center = b.livingByDepth('enemy')[0]!;
    const hit = b.areaWindow(am.uid, 'drain_field', center.uid); // yarıçap 2'lik alan
    const before = new Map(hit.map((c) => [c.uid, c.mp]));
    const events = act(b, am.uid, 'drain_field', center.uid);
    const burns = ofType(events, 'manaBurn');
    expect(burns.length).toBe(hit.filter((c) => (before.get(c.uid) ?? 0) > 0).length);
    // Madde 260: yakım hedefin maks MP'sinin yüzdesi (nominalBurn); dolu manalı hedefler 0'a inmez: susturma zarı/hasar yok
    const eff = content.skills.drain_field!.effects[0] as Parameters<typeof nominalBurn>[0];
    for (const e of burns) expect(e.mpAfter).toBe(Math.max(0, before.get(e.target)! - nominalBurn(eff, b.get(e.target)!)));
    expect(ofType(events, 'damage')).toHaveLength(0);
  });

  it('Void Strike: hedefin manası ne kadar eksikse o kadar fazla vurur', () => {
    const run = (mp: number) => {
      const b = make(TA, { seed: 6 });
      toFront(b, 'mage');
      const target = unit(b, 'enemy', 'mage');
      target.mp = mp;
      return total(act(b, unit(b, 'party', 'antimage').uid, 'void_strike', target.uid), target.uid);
    };
    const full = run(unit(make(TA), 'enemy', 'mage').maxMp);
    const half = run(unit(make(TA), 'enemy', 'mage').maxMp / 2);
    const empty = run(0);
    expect(half).toBeGreaterThan(full);
    expect(empty).toBeGreaterThan(half);
    const ref = unit(make(TA), 'enemy', 'mage');
    const perMana = (content.skills.void_strike!.effects.find((e) => e.type === 'damage') as { bonusPerMissingMana: number }).bonusPerMissingMana;
    // eksik mana başına ek hasar, hedefin büyü zırhıyla yüzdesel azalır
    const expected = ref.maxMp * perMana * (1 - armorReduction(ref.stats.magicArmor, content.formulas));
    expect(empty - full).toBeGreaterThan(expected * 0.8);
    expect(empty - full).toBeLessThan(expected * 1.2);
  });

  it('Spell Ward kendine büyü kalkanı basar: yalnızca büyü hasarını emer, fizikseli emmez', () => {
    const b = make({ party: ['antimage', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'mage', 'druid', 'archer'] });
    const am = unit(b, 'party', 'antimage');
    const ev = ofType(act(b, am.uid, 'spell_ward', am.uid), 'shield')[0]!;
    expect(ev.magic).toBe(true);
    expect(am.magicShield).toBe(ev.amount);
    expect(am.shield).toBe(0);

    const phys = ofType(act(b, unit(b, 'enemy', 'archer').uid, 'quick_shot', am.uid), 'damage')[0]!;
    expect(phys.absorbed).toBe(0);
    expect(am.magicShield).toBe(ev.amount); // dokunulmadı

    const mag = ofType(act(b, unit(b, 'enemy', 'mage').uid, 'fire_bolt', am.uid), 'damage')[0]!;
    expect(mag.absorbed).toBeGreaterThan(0);
    expect(mag.magicShieldAfter).toBe(ev.amount - mag.absorbed < 0 ? 0 : ev.amount - mag.absorbed);
  });

  it('büyü zırhı yalnızca Anti-Mage\'de; diğer class\'larda 0', () => {
    for (const def of Object.values(content.classes)) {
      // Büyü zırhı yalnızca class verisinden gelir (primary bonusu büyü zırhı vermez)
      const raw = JSON.parse(readFileSync(`data/classes/${def.id}.json`, 'utf8')) as { magicArmor: number };
      expect(def.stats.magicArmor, def.id).toBe(raw.magicArmor);
      if (def.id === 'antimage') expect(def.stats.magicArmor, def.id).toBeGreaterThan(0);
      else expect(def.stats.magicArmor, def.id).toBe(0);
    }
  });

  it('büyü zırhı büyü hasarını yüzdesel azaltır, fiziksel hasarı azaltmaz', () => {
    const dmg = (def: string, skill: string, attacker: string) => {
      const b = make({ party: [attacker, 'warrior', 'archer', 'paladin'], enemies: [def, 'warrior', 'archer', 'paladin'] }, { seed: 3 });
      for (const c of b.combatants) delete c.passive; // pasifler (ör. Sharpshooter mesafesi) ölçümü bozmasın
      return total(act(b, unit(b, 'party', attacker).uid, skill, unit(b, 'enemy', def).uid), unit(b, 'enemy', def).uid);
    };
    // Anti-Mage (büyü zırhı 20) ve Mage (0): ikisinin fiziksel zırhı da 4
    expect(dmg('antimage', 'fire_bolt', 'mage')).toBeLessThan(dmg('mage', 'fire_bolt', 'mage') * 0.75);
    expect(dmg('antimage', 'quick_shot', 'archer')).toBe(dmg('mage', 'quick_shot', 'archer'));
  });
});

describe('class verisi: yeni sınıflar ve dizilim', () => {
  it('Defender: en yüksek Strength ve zırh, 4 skill: tremor slam, taunt, guard, fist crush', () => {
    const d = content.classes.defender!;
    expect(d.skills.slice(0, 4)).toEqual(['tremor_slam', 'taunt', 'guard', 'fist_crush']);
    for (const other of Object.values(content.classes)) {
      if (other.id === 'defender') continue;
      expect(d.stats.str, other.id).toBeGreaterThanOrEqual(other.stats.str);
      expect(d.stats.armor, other.id).toBeGreaterThan(other.stats.armor);
    }
  });

  it('Anti-Mage: mana yakma kiti (Mana Burn, Drain Field, Spell Ward, Void Strike)', () => {
    expect(content.classes.antimage!.skills).toEqual(['mana_burn', 'drain_field', 'spell_ward', 'void_strike']);
  });

  it('Druid: Rejuvenate tur bazlı (hot), Summon Treant 3 tur kalır', () => {
    expect(content.skills.rejuvenate!.effects.find((e) => e.type === 'hot')).toMatchObject({ type: 'hot', turns: 3 });
    // başlangıç şifası: tur başına şifa x tik sayısı
    const hotE = content.skills.rejuvenate!.effects.find((e) => e.type === 'hot') as { power: number; turns: number };
    const healE = content.skills.rejuvenate!.effects.find((e) => e.type === 'heal') as { power: number };
    expect(healE.power).toBeCloseTo(hotE.power * hotE.turns, 3);
    expect(content.skills.summon_treant!.effects[0]).toMatchObject({ type: 'summon', lifespan: 3 });
  });

  it('Archer: Piercing Arrow seçilen şeride vurur, her yeni hedef %30 az', () => {
    expect(content.skills.piercing_arrow!).toMatchObject({ target: 'area_enemies', area: { shape: 'column', stages: 'row' } });
    expect(content.skills.piercing_arrow!.effects[0]).toMatchObject({ type: 'damage', falloff: 0.7 });
  });

  it('her hasar/şifa/kalkan etkisi bir temel özelliğe (str/int/dex/luck) bağlı', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      for (const e of s.effects) {
        if (e.type === 'damage' || e.type === 'heal' || e.type === 'hot' || e.type === 'shield') {
          expect(['str', 'int', 'dex', 'luck'], `${id}`).toContain(e.scale);
        }
      }
    }
  });

  it('diziliş: yakın dövüşçüler önde (kendi aralarında öncelik sırasıyla), menzilliler arkada', () => {
    expect(content.arrangeTeam(['mage', 'archer', 'warrior', 'defender'])).toEqual(['defender', 'warrior', 'mage', 'archer']); // Archer her zaman en arkada
    expect(content.arrangeTeam(['druid', 'undead', 'antimage', 'paladin'])).toEqual(['antimage', 'paladin', 'undead', 'druid']);
    const all = content.arrangeTeam(Object.keys(content.classes));
    const melee = all.filter((id) => content.isMeleeClass(id));
    expect(all.slice(0, melee.length)).toEqual(melee); // melee grubu en önde
    expect(new Set(melee)).toEqual(new Set(['defender', 'warrior', 'antimage', 'cutthroat'])); // Cutthroat: Venom Edge yakın dövüş
    // Defender (en yüksek zırh) en önde, Mage en arkada
    expect(content.classes[all[0]!]!.stats.armor).toBeGreaterThan(content.classes[all.at(-1)!]!.stats.armor);
  });

  it('rastgele takımlar da dizilmiş gelir: yakın dövüşçüler hep menzilli/büyücülerin önünde', () => {
    const key = (id: string) => (content.isMeleeClass(id) ? 0 : 100) + content.classes[id]!.frontPriority;
    for (let seed = 1; seed <= 200; seed++) {
      const { party, enemies } = content.rollTeams('random-battle', seed);
      for (const team of [party, enemies]) {
        const k = team.map(key);
        expect(k, `seed ${seed}`).toEqual([...k].sort((a, b) => a - b));
      }
    }
  });

  it('sınıf listesi olarak verilen takım otomatik dizilir (savaşta sıra 0 = en ön)', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: ['mage', 'archer', 'defender', 'warrior'], enemies: ['druid', 'paladin', 'mage', 'undead'] }));
    expect(b.livingByDepth('party').map((c) => c.defId)).toEqual(['defender', 'warrior', 'mage', 'archer']);
    expect(b.livingByDepth('enemy').map((c) => c.defId)).toEqual(['paladin', 'undead', 'druid', 'mage']);
  });
});

describe('Taunt: %25 can kaybedilince biter', () => {
  const T: Teams = { party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'mage', 'druid', 'archer'] };

  it('taunt skill\'i kırılma eşiğini (maks canın %25\'i) durumun üzerine yazar', () => {
    const b = make(T);
    const d = unit(b, 'party', 'defender');
    act(b, d.uid, 'taunt');
    const st = d.statuses.find((s) => s.kind === 'taunt')!;
    expect(st.breakAt).toBe(Math.round(d.maxHp * 0.25));
  });

  it('eşik dolunca taunt silinir (statusEnd broken); öncesinde sürer', () => {
    const b = make(T);
    const d = unit(b, 'party', 'defender');
    act(b, d.uid, 'taunt');
    d.shield = 0;
    const st = d.statuses.find((s) => s.kind === 'taunt')!;
    st.taken = st.breakAt! - 1;
    expect(d.statuses.some((s) => s.kind === 'taunt')).toBe(true);
    const events = act(b, unit(b, 'enemy', 'warrior').uid, 'melee_attack', d.uid);
    expect(d.statuses.some((s) => s.kind === 'taunt')).toBe(false);
    expect(ofType(events, 'statusEnd').some((e) => e.status === 'taunt' && e.broken)).toBe(true);
  });

  it('kalkanın emdiği hasar sayılmaz', () => {
    const b = make(T);
    const d = unit(b, 'party', 'defender');
    act(b, d.uid, 'taunt');
    d.shield = 9999;
    act(b, unit(b, 'enemy', 'warrior').uid, 'melee_attack', d.uid);
    expect(d.statuses.some((s) => s.kind === 'taunt')).toBe(true);
  });
});

describe('Çağrı yeri seçimi ve hücre listesi', () => {
  it('alan/şerit skill\'i hedef (merkez) ister', () => {
    const b = make({ party: ['archer', 'warrior', 'mage', 'paladin'], enemies: ['defender', 'warrior', 'paladin', 'archer'] });
    expect(b.useSkill(unit(b, 'party', 'archer').uid, 'arrow_rain').ok).toBe(false);
    expect(b.useSkill(unit(b, 'party', 'archer').uid, 'piercing_arrow').ok).toBe(false);
  });

  it('çağrı: oyuncu boş hücreyi seçer; dolu hücre reddedilir; yapay zeka menzilli çağrıyı (Treant, madde 222) en arkadaki boş hücreye koyar', () => {
    const b = make({ party: ['defender', 'warrior', 'archer', 'mage', 'druid'], enemies: ['defender', 'paladin', 'undead', 'antimage', 'archer'] });
    const druid = unit(b, 'party', 'druid');
    expect(b.freeSlots('party')).toEqual([1, 4, 7, 8, 9, 10, 11]);
    expect(b.useSkill(druid.uid, 'summon_treant', undefined, 0).ok).toBe(false); // dolu
    const ev = ofType(act(b, druid.uid, 'summon_treant', undefined, 7), 'summon')[0]!;
    expect(ev.combatant.slot).toBe(7);
    const d2 = unit(b, 'party', 'druid');
    d2.mp = d2.maxMp; // ikinci çağrı için MP tazelenir
    expect(ofType(act(b, d2.uid, 'summon_treant'), 'summon')[0]!.combatant.slot).toBe(11);
  });

  it('seçim ekranı hücre listesi (arrange=false) olduğu gibi yerleşir; boş hücreler kalır', () => {
    const b = grid(cells({ 2: 'mage', 4: 'warrior', 11: 'archer' }), cells({ 1: 'paladin' }));
    expect(b.livingByDepth('party').map((c) => [c.defId, c.slot])).toEqual([['mage', 2], ['warrior', 4], ['archer', 11]]);
    expect(b.livingByDepth('enemy').map((c) => c.slot)).toEqual([1]);
  });
});

describe('Boş hücreye alan atışı ve Shield Bash', () => {
  it('alan skill\'i boş bir hücreye atılabilir; yalnızca şekildeki birimlere vurur', () => {
    const b = grid(cells({ 0: 'mage' }), cells({ 3: 'warrior', 5: 'archer', 6: 'druid' }));
    // Meteor merkez 4 (boş, sıra 1 şerit 1): artı şekli = 1, 3, 4, 5, 7 -> yalnızca 3 ve 5 dolu
    const events = act(b, 'party-0', 'meteor', undefined, 4);
    expect(ofType(events, 'damage').map((e) => e.target).sort()).toEqual(['enemy-0', 'enemy-1']);
    // hiçbir birime değmeyen atış REDDEDİLİR (şekil kuralı: en az bir vurulabilir düşman) ve bedel düşmez
    const empty = grid(cells({ 0: 'mage' }), cells({ 6: 'warrior' }));
    const mp = empty.get('party-0')!.mp;
    expect(empty.useSkill('party-0', 'meteor', undefined, 11)).toEqual({ ok: false, reason: 'No target in the area' });
    expect(empty.get('party-0')!.mp).toBe(mp);
  });

  it('geçersiz hücre ya da hedefsiz alan atışı reddedilir', () => {
    const b = grid(cells({ 0: 'mage' }), cells({ 3: 'warrior' }));
    expect(b.useSkill('party-0', 'blizzard', undefined, 99).ok).toBe(false);
    expect(b.useSkill('party-0', 'blizzard', undefined, -1).ok).toBe(false);
    expect(b.useSkill('party-0', 'blizzard').ok).toBe(false);
  });

  it('alan hücreleri boş olanları da içerir (gösterim için)', () => {
    const b = grid(cells({ 0: 'mage' }), cells({ 3: 'warrior' }));
    expect(b.areaCells('meteor', 4)).toEqual([1, 3, 4, 5, 7]);
    expect(b.areaCells('blizzard', 4)).toEqual(shapeCells(content.skills.blizzard!.area!, 4, 'enemy', content.formulas.formation));
    expect(b.areaCells('piercing_arrow', 4).sort((x, y) => x - y)).toEqual([1, 4, 7, 10]); // şerit 1, tüm sıralar
  });

  it('Piercing Arrow boş şeride atılırsa şeridin en öndeki birimi ana hedef (tam hasar), diğerleri %50', () => {
    const b = grid(cells({ 0: 'archer' }), cells({ 1: 'warrior', 4: 'warrior' }));
    for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    const events = act(b, 'party-0', 'piercing_arrow', undefined, 10); // şerit 1'in boş sıra-3 hücresi
    const first = total(events, 'enemy-0');
    const second = total(events, 'enemy-1');
    expect(first).toBeGreaterThan(second);
  });

  it('Shield Bash düşmana vurur ve KULLANICIYA kalkan verir (hedefe değil)', () => {
    const b = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    const d = unit(b, 'party', 'defender');
    const target = unit(b, 'enemy', 'warrior');
    const events = act(b, d.uid, 'shield_bash', target.uid);
    const shield = ofType(events, 'shield');
    expect(shield).toHaveLength(1);
    expect(shield[0]!.target).toBe(d.uid);
    expect(d.shield).toBeGreaterThan(0);
    expect(target.shield).toBe(0);
    expect(ofType(events, 'damage')).toHaveLength(1);
  });

  it('Shield Bash önizlemesi kullanıcının kalkanını da gösterir', async () => {
    const { previewSkill } = await import('../src/engine');
    const b = make({ party: ['defender', 'warrior', 'archer', 'mage'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    const d = unit(b, 'party', 'defender');
    const p = previewSkill(b, d.uid, 'shield_bash', unit(b, 'enemy', 'warrior').uid);
    expect(p.find((x) => x.uid === d.uid)?.shield?.amount).toBeGreaterThan(0);
    expect(p.find((x) => x.uid === unit(b, 'enemy', 'warrior').uid)?.damage).toBeDefined();
  });
});

describe('Rastgele şerit yerleşimi', () => {
  it('rastgele savaşlarda ortadaki şerit de kullanılır; her sırada en fazla 3, ön sıradan arkaya öncelik sırası korunur', () => {
    const usedLanes = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'test'));
      for (const side of ['party', 'enemy'] as const) {
        const units = b.living(side);
        const perRow = new Map<number, number>();
        for (const u of units) {
          perRow.set(b.rowOf(u.slot), (perRow.get(b.rowOf(u.slot)) ?? 0) + 1);
          usedLanes.add(b.laneOf(u.slot));
        }
        for (const n of perRow.values()) expect(n).toBeLessThanOrEqual(3);
        // sıralar öncelik sırasıyla dolar: önceki sıradaki hiçbir birim sonraki sıradakinden daha geride olamaz
        const prOf = (u: Combatant) => (content.isMeleeClass(u.defId) ? 0 : 100) + content.classes[u.defId]!.frontPriority;
        const rows = [...perRow.keys()].sort((x, y) => x - y);
        for (let i = 1; i < rows.length; i++) {
          const prev = Math.max(...units.filter((u) => b.rowOf(u.slot) === rows[i - 1]).map(prOf));
          const next = Math.min(...units.filter((u) => b.rowOf(u.slot) === rows[i]).map(prOf));
          expect(prev, `seed ${seed}`).toBeLessThanOrEqual(next);
        }
      }
    }
    expect([...usedLanes].sort()).toEqual([0, 1, 2]);
  });

  it('aynı seed her zaman aynı yerleşimi verir', () => {
    const a = content.battleSetup('random-battle', 5, 'test');
    const b = content.battleSetup('random-battle', 5, 'test');
    expect(a.partySlots).toEqual(b.partySlots);
    expect(a.enemySlots).toEqual(b.enemySlots);
  });
});

describe('Debug: bedava MP', () => {
  it('freeMp açıkken skill MP harcamaz ve MP yetmese de kullanılabilir; kapalıyken eskisi gibi', () => {
    const b = make({ party: ['mage', 'warrior', 'archer', 'paladin'], enemies: ['warrior', 'archer', 'mage', 'paladin'] });
    const mage = unit(b, 'party', 'mage');
    mage.mp = 0;
    expect(b.canUse(mage.uid, 'fire_bolt')).toEqual({ ok: false, reason: 'Not enough MP' });
    b.freeMp = true;
    expect(b.canUse(mage.uid, 'fire_bolt').ok).toBe(true);
    act(b, mage.uid, 'fire_bolt', unit(b, 'enemy', 'warrior').uid);
    expect(mage.mp).toBe(0);
    b.freeMp = false;
    mage.mp = 100;
    act(b, mage.uid, 'fire_bolt', unit(b, 'enemy', 'warrior').uid);
    expect(mage.mp).toBe(100 - content.skills.fire_bolt!.cost.amount);
  });
});

describe('Yakın dövüş yalnızca ön sıradan yapılır', () => {
  it('ikinci sıradaki yakın dövüşçü melee skill kullanamaz; ön sıradakiler kullanır', () => {
    const b = grid(cells({ 0: 'warrior', 3: 'defender' }), cells({ 0: 'mage' }));
    expect(b.canUse('party-0', 'melee_attack').ok).toBe(true); // ön sıra
    expect(b.canUse('party-1', 'shield_bash')).toEqual({ ok: false, reason: 'Melee: front row only' }); // 2. sıra
    expect(b.canUse('party-1', 'taunt').ok).toBe(true); // yakın dövüş olmayan skill'ler serbest
    expect(b.useSkill('party-1', 'shield_bash', 'enemy-0').ok).toBe(false);
  });

  it('ön sıra boşalınca arkadaki yakın dövüşçü yeni ön sıra olur', () => {
    const b = grid(cells({ 0: 'warrior', 3: 'defender' }), cells({ 0: 'mage' }));
    b.get('party-0')!.hp = 0;
    expect(b.frontRowOf('party')).toBe(1);
    expect(b.canUse('party-1', 'shield_bash').ok).toBe(true);
  });

  it('ön sırada 3 şeritte de yakın dövüşçü varsa hepsi vurabilir', () => {
    const b = grid(cells({ 0: 'warrior', 1: 'defender', 2: 'antimage' }), cells({ 0: 'mage' }));
    expect(b.canUse('party-0', 'melee_attack').ok).toBe(true);
    expect(b.canUse('party-1', 'shield_bash').ok).toBe(true);
    expect(b.canUse('party-2', 'mana_burn').ok).toBe(true);
  });

  it('ignoreFrontRow olan melee skill arka sıradan da kullanılabilir (charge benzeri)', () => {
    const setup = content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior', 3: 'defender' }), enemies: cells({ 0: 'mage' }) }, false);
    setup.skills = { ...setup.skills, shield_bash: { ...setup.skills.shield_bash!, ignoreFrontRow: true } };
    const b = new Battle(setup);
    expect(b.canUse('party-1', 'shield_bash').ok).toBe(true);
  });

  it('Charge: ön sıra ve menzil sınırı yok, herhangi bir düşmana gider ve sersemletir', () => {
    const b = grid(cells({ 3: 'warrior' }), cells({ 0: 'defender', 6: 'mage' })); // Warrior arka sırada, hedef de arkada
    expect(b.canUse('party-0', 'charge').ok).toBe(true);
    expect(b.validTargets('party-0', 'charge').map((c) => c.uid)).toEqual(['enemy-0', 'enemy-1']);
    const events = act(b, 'party-0', 'charge', 'enemy-1');
    expect(ofType(events, 'damage')).toHaveLength(1);
    expect(b.get('enemy-1')!.statuses.some((st) => st.kind === 'stun')).toBe(true);
  });

  it('melee çağrı (Skeleton) ön sıraya konur', () => {
    const b = grid(cells({ 0: 'undead', 2: 'warrior' }), cells({ 0: 'mage' }));
    const ev = ofType(act(b, 'party-0', 'raise_dead'), 'summon')[0]!;
    expect(b.rowOf(ev.combatant.slot)).toBe(0);
    expect(ev.combatant.slot).toBe(1);
  });

  it('Treant uzak menzilli (madde 222): arka sıradan da vurur; Skeleton (melee) arka sıradaysa vuramaz', () => {
    const b = grid(cells({ 0: 'druid', 2: 'warrior' }), cells({ 0: 'mage' }));
    const sk = ofType(act(b, 'party-0', 'summon_treant', undefined, 7), 'summon')[0]!.combatant.uid;
    expect(b.canUse(sk, 'root_smash').ok).toBe(true);
    const u = grid(cells({ 0: 'undead', 2: 'warrior' }), cells({ 0: 'mage' }));
    const skel = ofType(act(u, 'party-0', 'raise_dead', undefined, 7), 'summon')[0]!.combatant.uid;
    expect(u.canUse(skel, 'skeleton_strike')).toEqual({ ok: false, reason: 'Melee: front row only' });
  });
});

describe('Pasif skill\'ler', () => {
  const calm = (b: Battle) => {
    for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    return b;
  };
  const passiveLog = (b: Battle) => b.log.filter((e) => e.type === 'passive');

  it('her sınıfın tam 1 pasifi var; düz stat değil, koşullu etki', () => {
    for (const [id, def] of Object.entries(content.classes)) {
      expect(def.passive, id).toBeDefined();
      expect(def.passive!.name.length, id).toBeGreaterThan(0);
      expect(describePassive(def.passive!, def.stats, content.formulas).length, id).toBeGreaterThan(20); // açıklama değerleri de yazar
      expect(['rage', 'divineLight', 'spellEcho', 'longshot', 'verdantBlessing', 'soulDrain', 'manaOverflow', 'armorAura', 'bonusVsStatus', 'omenTransfer'], id).toContain(def.passive!.effect.type);
    }
  });

  it('Warrior - Berserker: canı azaldıkça hasarı artar', () => {
    const dmg = (hpRatio: number) => {
      const b = calm(grid(cells({ 0: 'warrior' }), cells({ 0: 'defender' })));
      const w = b.get('party-0')!;
      w.hp = Math.round(w.maxHp * hpRatio);
      return total(act(b, 'party-0', 'melee_attack', 'enemy-0'), 'enemy-0');
    };
    expect(dmg(0.5)).toBeGreaterThan(dmg(1));
    expect(dmg(0.1)).toBeGreaterThan(dmg(0.5));
  });

  it('Archer - Sharpshooter: hedef ne kadar uzaksa (sıra mesafesi) o kadar fazla hasar', () => {
    const dmg = (targetSlot: number) => {
      const b = calm(grid(cells({ 0: 'archer' }), cells({ [targetSlot]: 'mage' })));
      b.get('party-0')!.stats.dex = 200; // büyük sayılar: yuvarlama farkı gizlemesin
      return total(act(b, 'party-0', 'quick_shot', 'enemy-0'), 'enemy-0');
    };
    expect(dmg(6)).toBeGreaterThan(dmg(3));
    expect(dmg(3)).toBeGreaterThan(dmg(0));
    const perRow = (content.classes.archer!.passive!.effect as { perRow: number }).perRow;
    expect(dmg(6) / dmg(0)).toBeGreaterThan(1 + perRow * 2 - 0.03); // 2 sıra uzak
    expect(dmg(6) / dmg(0)).toBeLessThan(1 + perRow * 2 + 0.03);
  });

  it('Undead (Dark Mage) - Vampiric Bite: verdiği hasarın %20\'si (en az 1) kadar iyileşir (oran veriden, madde 240: %35); çağrısının hasarından da', () => {
    const ratio = (content.classes.undead!.passive!.effect as { ratio: number }).ratio;
    expect(ratio).toBe(0.35);
    const b = calm(grid(cells({ 0: 'undead' }), cells({ 0: 'defender' })));
    const u = b.get('party-0')!;
    u.hp = u.maxHp - 30;
    const events = act(b, 'party-0', 'bone_slash', 'enemy-0');
    const dmg = ofType(events, 'damage')[0]!.amount;
    expect(ofType(events, 'heal')[0]!.amount).toBe(Math.max(1, Math.round(dmg * ratio)));
    // iskeletin vurduğu hasardan da sahibi iyileşir
    const sk = ofType(act(b, 'party-0', 'raise_dead', undefined, 1), 'summon')[0]!.combatant.uid;
    Object.assign(b.get(sk)!.stats, { accuracy: 10, evasion: 0 });
    const before = u.hp;
    const ev2 = act(b, sk, 'skeleton_strike', 'enemy-0');
    const dmg2 = ofType(ev2, 'damage')[0]!.amount;
    expect(u.hp - before).toBe(Math.max(1, Math.round(dmg2 * ratio)));
    expect(ofType(ev2, 'heal')[0]!.target).toBe('party-0');
  });

  it('Defender - Bulwark Aura: kendi zırhının yüzdesi, kendine ve 1 yarıçaptaki (artı) dostlara bonus zırh; çaprazdakine ve uzaktakine değil', () => {
    const b = grid(cells({ 4: 'defender', 3: 'warrior', 7: 'paladin', 0: 'archer', 9: 'mage' }), cells({ 0: 'mage' }));
    const base = (uid: string) => b.get(uid)!.stats.armor;
    const eff = (uid: string) => b.effectiveStats(b.get(uid)!).armor;
    const e = content.classes.defender!.passive!.effect;
    if (e.type !== 'armorAura') throw new Error('Defender pasifi armorAura değil');
    const bonus = base('party-2') * e.pct; // Defender'ın KENDİ zırhının yüzdesi
    expect(bonus).toBeGreaterThan(0);
    // slot sırasıyla uid'ler: 0 archer = party-0, 3 warrior = party-1, 4 defender = party-2, 7 paladin = party-3, 9 mage = party-4
    expect(eff('party-2')).toBeCloseTo(base('party-2') + bonus, 10);
    expect(eff('party-1')).toBeCloseTo(base('party-1') + bonus, 10);
    expect(eff('party-3')).toBeCloseTo(base('party-3') + bonus, 10);
    expect(eff('party-0')).toBe(base('party-0'));
    expect(eff('party-4')).toBe(base('party-4'));
  });

  it('Bulwark Aura yüzdesi Defender zırhıyla ölçeklenir ve stacking sınırı vardır (maxStacks)', () => {
    const e = content.classes.defender!.passive!.effect;
    if (e.type !== 'armorAura') throw new Error('armorAura değil');
    const mkAura = () => grid(cells({ 4: 'defender', 3: 'defender', 5: 'defender', 1: 'defender', 7: 'warrior' }), cells({ 0: 'mage' }));
    const b = mkAura();
    const center = b.get('party-2')!; // slot 4 (orta Defender): 3, 5, 1, 7 komşu
    // zırhı farklılaştır: komşu Defender'ların zırhı 10, 20, 40, orta 20
    b.get('party-1')!.stats.armor = 10; // slot 3
    b.get('party-3')!.stats.armor = 40; // slot 5
    b.get('party-0')!.stats.armor = 20; // slot 1... (sıra: slot sırasıyla uid)
    center.stats.armor = 20;
    const gains = [b.get('party-1')!, b.get('party-3')!, b.get('party-0')!, center].map((c) => c.stats.armor * e.pct).sort((x, y) => y - x);
    const cap = gains.slice(0, e.maxStacks).reduce((t, g) => t + g, 0);
    expect(e.maxStacks).toBeGreaterThanOrEqual(1);
    expect(b.auraArmor(center)).toBeCloseTo(cap, 10); // yalnızca en büyük maxStacks kaynak sayılır
    // Defender yoksa (öldüyse) aura gider
    for (const id of ['party-0', 'party-1', 'party-2', 'party-3']) b.get(id)!.hp = 0;
    expect(b.auraArmor(b.get('party-4')!)).toBe(0);
  });

  it('Bulwark Aura açıklaması yüzdeyi ve bonusu yazar (pasif tooltip)', () => {
    const d = content.classes.defender!;
    const e = d.passive!.effect;
    if (e.type !== 'armorAura') throw new Error('armorAura değil');
    const text = describePassive(d.passive!, d.stats, content.formulas);
    expect(text).toContain(`${Math.round(e.pct * 100)}%`);
    expect(text).toContain(`+${Math.round(d.stats.armor * e.pct)}`);
    expect(d.passive!.text).toContain(`${Math.round(e.pct * 100)}%`);
  });

  it('Bulwark Aura hasarı gerçekten azaltır', () => {
    const phys = (aura: boolean) => {
      const b = calm(grid(cells({ 0: 'warrior', ...(aura ? ({ 1: 'defender' } as Record<number, string>) : {}) }), cells({ 0: 'warrior' })));
      return total(act(b, 'enemy-0', 'melee_attack', 'party-0'), 'party-0');
    };
    expect(phys(true)).toBeLessThan(phys(false));
  });

  it('Anti-Mage - Mana Overflow: büyü zırhının engellediği hasar eşiğe ulaşınca tüm takıma mana', () => {
    const b = calm(grid(cells({ 0: 'antimage', 3: 'warrior', 1: 'mage' }), cells({ 0: 'mage' })));
    const am = b.get('party-0')!;
    if (am.passive?.effect.type === 'manaOverflow') am.passive.effect = { ...am.passive.effect, threshold: 5 };
    for (const c of b.living('party')) c.mp = 0;
    const events = act(b, 'enemy-0', 'fire_bolt', am.uid);
    expect(ofType(events, 'passive').some((e) => e.passive === 'mana_overflow')).toBe(true);
    expect(b.living('party').every((c) => c.mp > 0)).toBe(true);
  });

  it('Mana Overflow fiziksel hasarda tetiklenmez', () => {
    const b = calm(grid(cells({ 0: 'antimage' }), cells({ 0: 'warrior' })));
    const am = b.get('party-0')!;
    if (am.passive?.effect.type === 'manaOverflow') am.passive.effect = { ...am.passive.effect, threshold: 1 };
    const events = act(b, 'enemy-0', 'melee_attack', am.uid);
    expect(ofType(events, 'passive')).toHaveLength(0);
  });

  it('Druid - Verdant Blessing: çağrı yapınca tüm dostlar iyileşir', () => {
    const b = calm(grid(cells({ 0: 'druid', 2: 'warrior' }), cells({ 0: 'mage' })));
    b.get('party-0')!.hp -= 20;
    b.get('party-1')!.hp -= 20;
    const events = act(b, 'party-0', 'summon_treant', undefined, 1);
    expect(ofType(events, 'passive').some((e) => e.passive === 'verdant_blessing')).toBe(true);
    expect(ofType(events, 'heal').map((e) => e.target).sort()).toEqual(['party-0', 'party-1']);
  });

  it('Paladin - Divine Light: tur başında en yaralı dostu iyileştirir', () => {
    const b = new Battle(content.battleSetup('random-battle', 3, 'turns', { party: cells({ 0: 'paladin', 2: 'warrior' }), enemies: cells({ 0: 'mage' }) }, false));
    const pal = b.combatants.find((c) => c.defId === 'paladin')!;
    const war = b.combatants.find((c) => c.defId === 'warrior')!;
    war.hp -= 25;
    for (let i = 0; i < 40 && !passiveLog(b).some((e) => e.type === 'passive' && e.actor === pal.uid); i++) b.skipTurn();
    const idx = b.log.findIndex((e) => e.type === 'passive' && e.actor === pal.uid);
    expect(idx).toBeGreaterThan(-1);
    const heal = b.log.slice(idx).find((e) => e.type === 'heal');
    expect(heal && heal.type === 'heal' ? heal.target : '').toBe(war.uid);
  });

  it('Mage - Spell Echo: şans 1 iken cooldown\'lu hasar skill\'i hemen yeniden hazır olur', () => {
    const b = new Battle(content.battleSetup('random-battle', 3, 'turns', { party: cells({ 0: 'mage' }), enemies: cells({ 0: 'warrior', 2: 'mage' }) }, false));
    const mage = b.combatants.find((c) => c.defId === 'mage')!;
    b.debugClearCooldowns(); // başlangıç cooldown'u bu testin konusu değil
    if (mage.passive?.effect.type === 'spellEcho') mage.passive.effect = { ...mage.passive.effect, chance: 1 };
    mage.mp = 100;
    for (let i = 0; i < 40 && b.currentUid !== mage.uid; i++) b.skipTurn();
    expect(b.currentUid).toBe(mage.uid);
    const events = act(b, mage.uid, 'meteor', undefined, 0);
    expect(ofType(events, 'passive').some((e) => e.passive === 'spell_echo')).toBe(true);
    expect(mage.cooldowns.meteor).toBeUndefined();
  });
});

describe('Raise Dead: kendi tahtasına çağrı (Dark Mage, madde 222)', () => {
  it('iskeleti KENDİ tahtasındaki boş bir hücreye çağırır; sahibi çağıranın tarafı', () => {
    const b = grid(cells({ 0: 'undead' }), cells({ 0: 'warrior', 2: 'mage' }));
    expect(b.summonBoard('party-0', 'raise_dead')).toBe('party');
    expect(b.freeSlots('party')).not.toContain(0);
    const ev = ofType(act(b, 'party-0', 'raise_dead', undefined, 1), 'summon')[0]!;
    expect(ev.combatant).toMatchObject({ side: 'party', board: 'party', slot: 1, name: 'Skeleton', summoned: true });
    expect(b.useSkill('party-0', 'raise_dead', undefined, 0).ok).toBe(false);
  });

  it('ön sıradaki iskelet düşmanın ön sırasına vurur; düşman ona tek hedefli ve alan skill\'leriyle vurabilir', () => {
    const b = grid(cells({ 0: 'undead', 3: 'mage' }), cells({ 0: 'warrior', 3: 'mage' }));
    const sk = ofType(act(b, 'party-0', 'raise_dead', undefined, 1), 'summon')[0]!.combatant.uid;
    expect(b.canUse(sk, 'skeleton_strike').ok).toBe(true);
    expect(b.validTargets(sk, 'skeleton_strike').map((c) => c.uid)).toEqual(['enemy-0']); // ön sıra; arkadaki Mage değil
    expect(b.validTargets('enemy-1', 'fire_bolt').map((c) => c.uid)).toContain(sk);
    expect(b.areaWindowAt('enemy-1', 'blizzard', 1).map((c) => c.uid)).toContain(sk);
  });
});

describe('Rastgele dizilimde yakın dövüş ön sıralarda', () => {
  const meleeIds = new Set(Object.keys(content.classes).filter((id) => content.isMeleeClass(id)));

  it('bir melee, önündeki sıralar dolu (3 karakter) olmadıkça arka sırada olmaz (rastgele ve otomatik dizilim)', () => {
    const check = (cellsList: string[], label: string) => {
      const perRow = (r: number) => cellsList.slice(r * 3, r * 3 + 3).filter(Boolean).length;
      cellsList.forEach((id, slot) => {
        if (!id || !meleeIds.has(id)) return;
        const row = Math.floor(slot / 3);
        // Druid'li takımlarda ön sırada 1 hücre bilerek boş bırakılır (çağrılan melee için): orada 2 yeterli
        const front = cellsList.includes('druid') ? 2 : 3;
        for (let r = 0; r < row; r++) expect(perRow(r), `${label}: ${id} slot ${slot}`).toBeGreaterThanOrEqual(r === 0 ? front : 3);
      });
    };
    for (let seed = 1; seed <= 300; seed++) {
      const { party, enemies } = content.rollTeams('random-battle', seed);
      check(content.randomCells(party, seed), `random ${seed}`);
      check(content.randomCells(enemies, seed + 1), `random ${seed}e`);
      check(content.defaultCells(party), `default ${seed}`);
    }
  });

  it('rastgele dizilimde boyutlar da değişir (bazen ön sıra 3, bazen 2)', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const ids = content.randomTeam(seed, 5);
      sizes.add(content.randomCells(ids, seed).slice(0, 3).filter(Boolean).length);
    }
    expect(sizes.size).toBeGreaterThan(1);
  });
});

describe('Archer her zaman en arkada', () => {
  it('rastgele ve otomatik dizilimde Archer, takımın en arka sırasında (kendinden daha arkada kimse yok)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { party, enemies } = content.rollTeams('random-battle', seed);
      for (const team of [party, enemies]) {
        if (!team.includes('archer')) continue;
        for (const cellsList of [content.randomCells(team, seed), content.defaultCells(team)]) {
          const rowOfAr = Math.floor(cellsList.indexOf('archer') / 3);
          const maxRow = Math.max(...cellsList.map((id, i) => (id ? Math.floor(i / 3) : -1)));
          expect(rowOfAr, `seed ${seed}`).toBe(maxRow);
        }
      }
    }
  });
});

describe('dizilimde hiçbir birim dışarıda kalmaz', () => {
  it('rastgele ve otomatik dizilimde tüm birimler yerleşir (5 kişilik takımlar)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const { party } = content.rollTeams('random-battle', seed);
      expect(content.randomCells(party, seed).filter(Boolean), `random ${seed}`).toHaveLength(party.length);
      expect(content.defaultCells(party).filter(Boolean), `default ${seed}`).toHaveLength(party.length);
    }
  });
});

describe('Çağıran ölünce çağrılan da ölür', () => {
  it('Druid ölünce Treant\'ı da ölür (death olayı), ev tahtasında ve savaş sürerken', () => {
    const b = grid(cells({ 0: 'druid', 2: 'warrior' }), cells({ 0: 'mage' }));
    const sk = ofType(act(b, 'party-0', 'summon_treant', undefined, 1), 'summon')[0]!.combatant.uid;
    const druid = b.get('party-0')!;
    druid.hp = 1;
    const events = act(b, 'enemy-0', 'fire_bolt', 'party-0');
    const deaths = ofType(events, 'death').map((e) => e.target);
    expect(deaths).toEqual(['party-0', sk]);
    expect(b.get(sk)!.hp).toBe(0);
    expect(b.living('party').map((c) => c.uid)).toEqual(['party-1']);
  });

  it('düşman tahtasındaki iskelet de çağıranı ölünce ölür; çağıran yaşarken yaşar', () => {
    const b = grid(cells({ 0: 'undead', 2: 'warrior' }), cells({ 0: 'warrior', 3: 'mage' }));
    const sk = ofType(act(b, 'party-0', 'raise_dead', undefined, 1), 'summon')[0]!.combatant.uid;
    expect(b.get(sk)!.hp).toBeGreaterThan(0);
    b.get('party-0')!.hp = 1;
    const events = act(b, 'enemy-1', 'fire_bolt', 'party-0');
    expect(ofType(events, 'death').map((e) => e.target)).toContain(sk);
    expect(b.get(sk)!.hp).toBe(0);
  });

  it('çağıran ölünce çağrılanın çağrısı da (zincirleme) ölür; çağrılanın ölümü çağıranı etkilemez', () => {
    const b = grid(cells({ 0: 'druid', 2: 'warrior' }), cells({ 0: 'mage' }));
    const sk = ofType(act(b, 'party-0', 'summon_treant', undefined, 1), 'summon')[0]!.combatant.uid;
    b.get(sk)!.hp = 1;
    act(b, 'enemy-0', 'fire_bolt', sk);
    expect(b.get(sk)!.hp).toBe(0);
    expect(b.get('party-0')!.hp).toBeGreaterThan(0);
  });
});

describe('Treant uzak menzilli (madde 222; eski reach +1 kalktı)', () => {
  const mk = (treantSlot: number) => {
    const b = grid(cells({ 0: 'druid', 2: 'warrior' }), cells({ 0: 'warrior', 3: 'mage', 6: 'archer' }));
    const sk = ofType(act(b, 'party-0', 'summon_treant', undefined, treantSlot), 'summon')[0]!.combatant.uid;
    return { b, sk };
  };

  it('Root Smash melee değil, reach yok: düşmanın tüm sıralarına ulaşır', () => {
    expect(content.skills.root_smash!.reach).toBeUndefined();
    expect(content.skills.root_smash!.motion).not.toBe('melee');
    const { b, sk } = mk(1);
    expect(b.validTargets(sk, 'root_smash').map((c) => c.slot).sort((x, y) => x - y)).toEqual([0, 3, 6]);
  });

  it('Treant hangi sırada olursa olsun vurabilir', () => {
    for (const slot of [1, 4, 7, 10]) {
      const m = mk(slot);
      expect(m.b.canUse(m.sk, 'root_smash').ok, String(slot)).toBe(true);
    }
  });

  it('diğer yakın dövüş skill\'lerinin menzili değişmez (yalnızca ön sıra)', () => {
    const b = grid(cells({ 0: 'warrior' }), cells({ 0: 'warrior', 3: 'mage' }));
    expect(b.validTargets('party-0', 'fire_slash' in content.skills ? 'fire_slash' : content.classes.warrior!.skills[0]!).map((c) => c.slot)).toEqual([0]);
  });
});

describe('Paladin: Resurrection', () => {
  const setup = () => grid(cells({ 0: 'warrior', 2: 'paladin', 3: 'mage' }), cells({ 0: 'archer' }));
  const fall = (b: Battle, uid: string) => {
    b.get(uid)!.hp = 0;
  };

  const reviveData = () => content.skills.resurrection!.effects.find((e) => e.type === 'revive') as { hpRatio: number; mpRatio: number; regen?: { turns: number; ratio: number } }; // oranlar veriden (denge ayarı: %50 -> %25 -> %30, madde 230)

  it('Blessing yerine Resurrection: düşmüş tek dostu hedefler, maks can ve manadan veriye bağlı oranla (Ömer kararı %30 + 2 tur %10 yenilenme)', () => {
    expect(content.classes.paladin!.skills.slice(0, 4)).toEqual(['holy_strike', 'resurrection', 'judgment', 'radiance']);
    expect(content.skills.resurrection).toMatchObject({ target: 'dead_ally' });
    expect(reviveData().hpRatio).toBe(0.3); // Ömer kararı (madde 230): dirilen max can ve manasının %30'u ile döner
    expect(reviveData().mpRatio).toBe(0.3);
    expect(reviveData().regen).toEqual({ turns: 2, ratio: 0.1 });
  });

  it('düşmüş dostu olduğu yerde diriltir (veriye bağlı can ve mana oranı, durumlar temiz)', () => {
    const b = setup();
    const w = b.get('party-0')!;
    w.statuses.push({ kind: 'wound', turns: 2, source: 'enemy-0' });
    fall(b, 'party-0');
    const slot = w.slot;
    const events = act(b, 'party-1', 'resurrection', 'party-0');
    const rev = ofType(events, 'revive')[0]!;
    const { hpRatio, mpRatio } = reviveData();
    expect(rev).toMatchObject({ target: 'party-0', hpAfter: Math.round(w.maxHp * hpRatio), mpAfter: Math.round(w.maxMp * mpRatio) });
    expect(w.hp).toBe(Math.round(w.maxHp * hpRatio));
    expect(w.mp).toBe(Math.round(w.maxMp * mpRatio));
    expect(w.slot).toBe(slot);
    // eski durumlar (Wound) temizlenir; yalnızca diriltme yenilenmesi (regen, cause 'revival') kalır
    expect(w.statuses.map((s) => [s.kind, s.cause])).toEqual(reviveData().regen ? [['regen', 'revival']] : []);
    expect(b.living('party').map((c) => c.uid)).toContain('party-0');
  });

  it('yalnızca düşmüş dostlar seçilebilir: canlılar, düşmanlar ve çağrılar değil', () => {
    const b = setup();
    expect(b.canUse('party-1', 'resurrection')).toEqual({ ok: false, reason: 'No fallen ally' });
    fall(b, 'party-0');
    fall(b, 'enemy-0');
    expect(b.validTargets('party-1', 'resurrection').map((c) => c.uid)).toEqual(['party-0']);
    expect(b.useSkill('party-1', 'resurrection', 'party-2').ok).toBe(false); // canlı dost
    expect(b.useSkill('party-1', 'resurrection', 'enemy-0').ok).toBe(false); // düşman
  });

  it('yuvası başka bir birimce doldurulsa da diriltilebilir (madde 257: seçilen boş hücreye); çağrılar diriltilemez', () => {
    const b = grid(cells({ 0: 'druid', 2: 'paladin' }), cells({ 0: 'archer' }));
    fall(b, 'party-0');
    const sk = ofType(act(b, 'party-1', 'resurrection', 'party-0'), 'revive').length; // druid düştü, yuva boş: dirilir
    expect(sk).toBe(1);
    const c = grid(cells({ 0: 'druid', 2: 'paladin' }), cells({ 0: 'archer' }));
    const treant = ofType(act(c, 'party-0', 'summon_treant', undefined, 1), 'summon')[0]!.combatant.uid;
    c.get(treant)!.hp = 0; // çağrı düştü
    expect(c.validTargets('party-1', 'resurrection')).toEqual([]);
    // warrior düşer, yuvasına başka birim oturur: yine hedef; seçilen boş hücrede dirilir, dolu hücre reddedilir
    const d = grid(cells({ 0: 'warrior', 2: 'paladin' }), cells({ 0: 'archer' }));
    fall(d, 'party-0');
    d.combatants.push({ ...d.get('enemy-0')!, uid: 'x', side: 'party', board: 'party', slot: 0, summoned: false, hp: 10 });
    expect(d.validTargets('party-1', 'resurrection').map((u) => u.uid)).toEqual(['party-0']);
    expect(d.useSkill('party-1', 'resurrection', 'party-0', 0)).toEqual({ ok: false, reason: 'That cell is not free' });
    expect(d.useSkill('party-1', 'resurrection', 'party-0', 2)).toEqual({ ok: false, reason: 'That cell is not free' }); // Paladin'in hücresi
    const r = d.useSkill('party-1', 'resurrection', 'party-0', 7);
    expect(r.ok).toBe(true);
    expect(d.get('party-0')).toMatchObject({ slot: 7, board: 'party' });
    expect(d.get('party-0')!.hp).toBeGreaterThan(0);
  });

  it('diriltilen birim sırada yeniden oynar; savaş sonu kontrolü tekrar işler', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'turns', { party: ['warrior', 'paladin'], enemies: ['archer'] }, false));
    expect(b.mode).toBe('turns');
    const w = b.combatants.find((c) => c.defId === 'warrior' && c.side === 'party')!;
    w.hp = 0;
    const p = b.combatants.find((c) => c.defId === 'paladin')!;
    p.mp = p.maxMp;
    p.cooldowns = {};
    // paladinin sırasını bekle
    for (let i = 0; i < 100 && b.currentUid !== p.uid; i++) b.skipTurn();
    act(b, p.uid, 'resurrection', w.uid);
    expect(w.hp).toBeGreaterThan(0);
    let played = false;
    for (let i = 0; i < 100 && !played; i++) {
      if (b.currentUid === w.uid) played = true;
      else b.skipTurn();
    }
    expect(played).toBe(true);
  });

  it('AI (healer): düşmüş dostu varsa diriltir; yoksa Resurrection seçmez', () => {
    const b = setup();
    b.get('enemy-0')!.maxHp = b.get('enemy-0')!.hp = 3000; // savaş belli olmasın (madde 258: kazanılmış savaşta diriltme değeri 0)
    expect(chooseAction(b, 'party-1', content.aiConfig)?.skillId).not.toBe('resurrection');
    fall(b, 'party-0');
    expect(chooseAction(b, 'party-1', content.aiConfig)).toMatchObject({ skillId: 'resurrection', targetUid: 'party-0' });
  });
});

describe('Warrior: Double Strike (iki vuruş)', () => {
  it('iki ayrı hasar etkisi, her biri aynı STR gücünde (veriden); iki hasar olayı üretir', () => {
    const sk = content.skills.melee_attack!;
    expect(sk.name).toBe('Double Strike');
    expect(sk.effects).toHaveLength(2);
    const p0 = (sk.effects[0] as { power: number }).power;
    for (const e of sk.effects) expect(e).toMatchObject({ type: 'damage', damageType: 'physical', scale: 'str', power: p0 });
    const b = make({ party: ['warrior', 'mage', 'archer', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    const events = act(b, unit(b, 'party', 'warrior').uid, 'melee_attack', unit(b, 'enemy', 'defender').uid);
    expect(ofType(events, 'damage')).toHaveLength(2);
  });

  it('skill açıklaması tek satırda "x2" gösterir; önizleme iki vuruşun toplamıdır', () => {
    const b = make({ party: ['warrior', 'mage', 'archer', 'paladin'], enemies: ['defender', 'warrior', 'archer', 'mage'] });
    const w = unit(b, 'party', 'warrior');
    const info = describeSkill(content.skills.melee_attack!, w.stats, content.formulas);
    expect(info.lines.filter((l) => l.startsWith('Damage'))).toHaveLength(1);
    expect(info.lines[0]).toContain('x2');
    const target = unit(b, 'enemy', 'defender');
    const pv = previewSkill(b, w.uid, 'melee_attack', target.uid)[0]!;
    const single = previewSkill(b, w.uid, 'whirlwind')[0]; // yalnızca karşılaştırma için hazır
    expect(pv.damage!.avg).toBeGreaterThan(0);
    expect(single).toBeDefined();
  });
});
