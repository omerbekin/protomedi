import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, describeSkill, explainChoice, previewSkill } from '../src/engine';
import type { AiConfig, BattleEvent, BattleMode, StatusDef } from '../src/engine';
import { describeEvent } from '../src/engine/match-log';

/**
 * Madde 262 (Ömer isteği 2026-10-08):
 * 1) Abyssal Cry yeniden tasarım: Fortified (hasar azaltma) KALDIRILDI; yerine Abyssal Fury: Warrior'ın sonraki N (attackCharges) SALDIRISI için
 *    yakın dövüş menzili +reachBonus sıra ve STR'nin attackAttrPct'si kadar bonus STR (yalnızca hasarda). Bedeller aynı (Rage + maks can %15).
 * 2) Guard yarım turn (turnCost 0,5). Sayılar veriden okunur.
 */
const ai: AiConfig = { ...content.aiConfig, global: undefined };
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const cry = content.skills.abyssal_cry!;
const furyEffect = cry.effects.find((e) => e.type === 'status') as Extract<(typeof cry.effects)[number], { type: 'status' }>;
const FURY = furyEffect.status;
const def = content.statuses[FURY] as StatusDef;
const strPct = def.attackAttrPct!.str!;

/** Hücre listeli savaş; kritik/kaçınma kapalı, isabet tam; canlar en az 100. Warrior party-0 (yuva 0) ve Rage'i dolu. */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test', seed = 1): Battle {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party: cells(party), enemies: cells(enemies) }, false));
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, manaEcho: 0, resilience: 0, surviveChance: 0 });
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    if (c.maxRage !== undefined) c.rage = c.maxRage;
  }
  b.debugClearCooldowns();
  return b;
}
function act(b: Battle, uid: string, skill: string, target?: string): BattleEvent[] {
  const r = b.useSkill(uid, skill, target);
  if (!r.ok) throw new Error(`${uid} ${skill}: ${r.reason}`);
  return r.events;
}
function until(b: Battle, uid: string): void {
  for (let i = 0; i < 400 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}
const fury = (b: Battle, uid = 'party-0') => b.get(uid)!.statuses.find((s) => s.kind === FURY);
/** Ön sırada Defender (yuva 0), arkasında Mage (yuva 3, sıra 1) ve Archer (yuva 4). */
const TWO_ROWS = { 0: 'defender', 3: 'mage', 4: 'archer' };

describe('Abyssal Cry verisi (madde 262)', () => {
  it('bedel yalnızca 30 Rage (Ömer: can bedeli kaldırıldı), Fortified yok; yerine kendine Abyssal Fury', () => {
    expect(cry.cost).toEqual({ resource: 'rage', amount: 30 });
    expect(cry.effects.some((e) => e.type === 'selfDamage')).toBe(false);
    expect(cry.effects.some((e) => e.type === 'status' && e.status === 'fortify')).toBe(false);
    expect(furyEffect).toMatchObject({ self: true });
    expect(def).toMatchObject({ type: 'buff', attackCharges: 3, reachBonus: 1 });
    expect(strPct).toBeGreaterThan(0);
  });
});

describe('Abyssal Fury: yük, menzil, bonus STR', () => {
  for (const mode of ['test', 'turns'] as const) {
    it(`[${mode}] uygulanınca ${def.attackCharges} yük; her hasar skill'i (Double Strike iki vuruşu, Whirlwind alanı) TEK yük düşürür; bitince durum kalkar`, () => {
      const b = mk({ 0: 'warrior' }, { 0: 'defender', 1: 'warrior', 3: 'mage' }, mode);
      for (const c of b.combatants.filter((x) => x.side === 'enemy')) c.maxHp = c.hp = 5000;
      if (mode === 'turns') until(b, 'party-0');
      const ev = act(b, 'party-0', 'abyssal_cry');
      expect(ofType(ev, 'status').find((e) => e.status === FURY)?.turns).toBe(def.attackCharges);
      expect(fury(b)?.turns).toBe(def.attackCharges);
      const attacks = ['melee_attack', 'whirlwind', 'melee_attack'];
      for (let i = 0; i < attacks.length; i++) {
        if (mode === 'turns') {
          until(b, 'party-0');
          b.debugClearCooldowns('party-0');
        }
        const e2 = act(b, 'party-0', attacks[i]!, attacks[i] === 'whirlwind' ? undefined : 'enemy-0');
        const left = def.attackCharges! - 1 - i;
        if (left > 0) {
          expect(fury(b)?.turns).toBe(left);
          expect(ofType(e2, 'status').find((e) => e.status === FURY)).toMatchObject({ cause: 'charge', turns: left });
        } else {
          expect(fury(b)).toBeUndefined();
          expect(ofType(e2, 'statusEnd').find((e) => e.status === FURY)).toMatchObject({ consumed: true });
        }
      }
    });
  }

  it('tur geçince yük AZALMAZ (turns modu); Move / Rest gibi hasarsız eylemler yük harcamaz', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'defender' }, 'turns', 3);
    until(b, 'party-0');
    act(b, 'party-0', 'abyssal_cry');
    for (let k = 0; k < 3; k++) {
      b.skipTurn();
      until(b, 'party-0');
    }
    expect(fury(b)?.turns).toBe(def.attackCharges);
    expect(b.useGlobal('party-0', 'move_tile', 6).ok).toBe(true);
    expect(fury(b)?.turns).toBe(def.attackCharges);
  });

  it('yeniden uygulanınca yük tazelenir (yığılmaz)', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'defender' });
    act(b, 'party-0', 'abyssal_cry');
    act(b, 'party-0', 'melee_attack', 'enemy-0');
    expect(fury(b)?.turns).toBe(def.attackCharges! - 1);
    b.get('party-0')!.rage = b.get('party-0')!.maxRage;
    act(b, 'party-0', 'abyssal_cry');
    expect(b.get('party-0')!.statuses.filter((s) => s.kind === FURY)).toHaveLength(1);
    expect(fury(b)?.turns).toBe(def.attackCharges);
  });

  it('menzil +1: yakın dövüş ön sıranın arkasındaki sıraya da ulaşır (hedefleme, neden, önizleme); Whirlwind iki sırayı vurur', () => {
    const b = mk({ 0: 'warrior' }, TWO_ROWS);
    const mage = b.combatants.find((c) => c.side === 'enemy' && c.slot === 3)!;
    expect(b.validTargets('party-0', 'melee_attack').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(b.targetProblem('party-0', 'melee_attack', mage.uid)).toBe('Out of reach');
    expect(b.reachOf('party-0', content.skills.melee_attack!)).toBe(0);
    act(b, 'party-0', 'abyssal_cry');
    expect(b.reachOf('party-0', content.skills.melee_attack!)).toBe(def.reachBonus);
    expect(b.validTargets('party-0', 'melee_attack').map((c) => c.uid).sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
    expect(b.targetProblem('party-0', 'melee_attack', mage.uid)).toBeNull();
    expect(previewSkill(b, 'party-0', 'melee_attack', mage.uid)[0]?.damage).toBeDefined();
    expect([...new Set(ofType(act(b, 'party-0', 'whirlwind'), 'damage').map((e) => e.target))].sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('menzil +1 kendi sırası için de geçerli: önünde dost varken (2. sıra) yakın dövüş yapabilir; yük bitince yine yapamaz', () => {
    const b = mk({ 0: 'paladin', 3: 'warrior' }, { 0: 'defender' });
    const w = b.combatants.find((c) => c.side === 'party' && c.slot === 3)!;
    w.rage = w.maxRage!;
    expect(b.canUse(w.uid, 'melee_attack')).toEqual({ ok: false, reason: 'Melee: front row only' });
    act(b, w.uid, 'abyssal_cry');
    for (let i = 0; i < def.attackCharges!; i++) {
      expect(b.canUse(w.uid, 'melee_attack').ok).toBe(true);
      act(b, w.uid, 'melee_attack', 'enemy-0');
    }
    expect(b.canUse(w.uid, 'melee_attack')).toEqual({ ok: false, reason: 'Melee: front row only' });
  });

  it('bonus STR yalnızca hasarda: önizleme ve gerçek vuruş ~(1 + oran) kat; can, kritik, STR stat\'ı ve şifa değişmez', () => {
    const base = mk({ 0: 'warrior' }, { 0: 'defender' });
    const buffed = mk({ 0: 'warrior' }, { 0: 'defender' });
    for (const b of [base, buffed]) for (const c of b.combatants.filter((x) => x.side === 'enemy')) c.maxHp = c.hp = 5000;
    // vuruş başına hasar küçükken tam sayıya yuvarlama oranı bozar (Double Strike gücü veriden; 0,8'de vuruş ~6): STR'yi iki savaşta da büyüt
    for (const b of [base, buffed]) b.get('party-0')!.stats.str *= 4;
    const w = buffed.get('party-0')!;
    const before = { maxHp: w.maxHp, str: w.stats.str, crit: w.stats.critChance, armor: w.stats.armor };
    act(buffed, 'party-0', 'abyssal_cry');
    buffed.get('party-0')!.hp = base.get('party-0')!.hp; // Berserker (eksik cana bağlı bonus) iki tarafta aynı olsun
    expect({ maxHp: w.maxHp, str: w.stats.str, crit: w.stats.critChance, armor: w.stats.armor }).toEqual(before);
    expect(buffed.attackStats(w).str).toBeCloseTo(w.stats.str * (1 + strPct), 6);
    expect(base.attackStats(base.get('party-0')!)).toBe(base.get('party-0')!.stats);
    const pv = (b: Battle) => previewSkill(b, 'party-0', 'melee_attack', 'enemy-0')[0]!.damage!.avg;
    expect(pv(buffed) / pv(base)).toBeGreaterThan(1 + strPct - 0.1);
    expect(pv(buffed) / pv(base)).toBeLessThan(1 + strPct + 0.1);
    const dealt = (b: Battle) => ofType(act(b, 'party-0', 'melee_attack', 'enemy-0'), 'damage').reduce((s, e) => s + e.amount + e.absorbed, 0);
    // iki savaşın RNG akışı Abyssal Cry'da aynı sayıda zar tüketmediyse oran yine (1 + oran) civarı kalır (±%10 sapma)
    const ratio = dealt(buffed) / dealt(base);
    expect(ratio).toBeGreaterThan((1 + strPct) * 0.8);
    expect(ratio).toBeLessThan((1 + strPct) * 1.25);
  });

  it('belirleyici: aynı seed + aynı girdi = aynı olaylar', () => {
    const run = () => {
      const b = mk({ 0: 'warrior' }, TWO_ROWS, 'turns', 11);
      until(b, 'party-0');
      const out = [...act(b, 'party-0', 'abyssal_cry')];
      until(b, 'party-0');
      out.push(...act(b, 'party-0', 'melee_attack', 'enemy-1'));
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });
});

describe('Abyssal Fury: YZ, açıklama, maç kaydı', () => {
  it('arka sıra ancak buff ile ulaşılabiliyorsa Abyssal Cry seçilir; terazi notu buff\'lı / buff\'sız 3 saldırıyı gösterir', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, TWO_ROWS);
    expect(chooseAction(b, 'party-0', ai)?.skillId).toBe('abyssal_cry');
    const c = explainChoice(b, 'party-0', ai)!.candidates.find((x) => x.skill === 'abyssal_cry')!;
    expect(c.terms!.buff).toBeGreaterThan(0);
    expect(JSON.stringify(c)).toContain(def.name);
  });

  it('zaten Abyssal Fury varken tekrar seçilmez; bir sonraki turundan önce ölecekse değeri 0 ya da altı', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, TWO_ROWS);
    b.debugAddStatus('party-0', FURY, 3);
    expect(chooseAction(b, 'party-0', ai)?.skillId).not.toBe('abyssal_cry');
    const low = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage', 1: 'archer', 2: 'undead', 3: 'gambler', 4: 'antimage' });
    low.get('party-0')!.hp = Math.max(1, Math.round(low.get('party-0')!.maxHp * 0.05));
    const score = explainChoice(low, 'party-0', ai)!.candidates.find((x) => x.skill === 'abyssal_cry')!.score!;
    expect(score).toBeLessThanOrEqual(0);
    expect(chooseAction(low, 'party-0', ai)?.skillId).not.toBe('abyssal_cry');
  });

  it('tek düşman bu saldırıyla ölecekse saldırı seçilir (buff ufkunun değeri öldürmeyi geçmez)', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, { 0: 'mage' });
    b.get('enemy-0')!.hp = 5;
    expect(chooseAction(b, 'party-0', ai)?.skillId).not.toBe('abyssal_cry');
  });

  it('karar savaşı değiştirmez (buff geçici eklenip geri alınır)', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 2: 'druid' }, TWO_ROWS);
    const before = JSON.stringify(b.combatants);
    chooseAction(b, 'party-0', ai);
    explainChoice(b, 'party-0', ai);
    expect(JSON.stringify(b.combatants)).toBe(before);
  });

  it('skill açıklaması yükü, menzili ve bonus STR\'yi veriden yazar; maç kaydı yük harcamasını gösterir', () => {
    const b = mk({ 0: 'warrior' }, TWO_ROWS);
    const w = b.get('party-0')!;
    const text = describeSkill(cry, w.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds }).lines.join('\n');
    expect(text).toContain(`next ${def.attackCharges} attacks`);
    expect(text).toContain(`reach +${def.reachBonus}`);
    expect(text).toContain(`+${Math.round(strPct * 100)}% STR (+${Math.round(w.stats.str * strPct)})`);
    expect(text).not.toMatch(/Damage taken|max HP/);
    act(b, 'party-0', 'abyssal_cry');
    const ev = act(b, 'party-0', 'melee_attack', 'enemy-0');
    const line = ofType(ev, 'status').map((e) => describeEvent(b, e)).find((l) => l?.includes(FURY));
    expect(line).toContain(`${def.attackCharges! - 1} left`);
  });
});

describe('Guard yarım turn (madde 262)', () => {
  it('Guard turnCost 0,5; cooldown yarım turn kuralına (>= 2) uyuyor', () => {
    const g = content.skills.guard!;
    expect(g.turnCost).toBe(0.5);
    expect(g.cooldown ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('turns modunda Guard sayaçtan eşiğin YARISINI düşer; skillUsed.turnCost 0,5; sıra tahmini ile aynı', () => {
    const b = mk({ 0: 'defender', 1: 'mage' }, { 0: 'warrior' }, 'turns', 2);
    until(b, 'party-0');
    const d = b.get('party-0')!;
    const other = b.combatants.find((c) => c.uid !== d.uid && c.hp > 0)!;
    const [c0, o0, spd, ospd] = [d.turnCounter, other.turnCounter, b.speedOf(d), b.speedOf(other)];
    const half = b.turnQueueAfter('guard');
    const ev = act(b, 'party-0', 'guard', 'party-1');
    const ticks = (other.turnCounter - o0) / ospd;
    expect(c0 + spd * ticks - d.turnCounter).toBeCloseTo(content.formulas.turn.threshold * 0.5, 6);
    expect(ofType(ev, 'skillUsed')[0]!.turnCost).toBe(0.5);
    expect(b.turnQueue().slice(0, half.length - 1)).toEqual(half.slice(1));
  });

  it('test modunda Guard normal çalışır (sıra yok)', () => {
    const b = mk({ 0: 'defender', 1: 'mage' }, { 0: 'warrior' });
    act(b, 'party-0', 'guard', 'party-1');
    expect(b.get('party-1')!.statuses.some((s) => s.kind === 'guard')).toBe(true);
  });
});
