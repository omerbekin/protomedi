import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { BattleEvent, BattleMode } from '../src/engine';

/**
 * Taunt kuralı (Ömer): "Taunt stun ya da CC yiyince silinsin." Taunt'ı olan birim, data/statuses.json'da `breaksTaunt: true` olan bir durum
 * (şu an yalnızca Stun) yediği AN taunt'ı silinir. Slow / Wound gibi diğer durumlar taunt'ı bozmaz. Guard / allyDamageMult / breakRatio mantığı aynen kalır.
 */
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T): Ev<T>[] => events.filter((e): e is Ev<T> => e.type === type);
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const grid = (party: string[], enemies: string[], mode: BattleMode = 'test', seed = 1) => {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party, enemies }, false));
  b.debugClearCooldowns();
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
};
const act = (b: Battle, actor: string, skill: string, target?: string): BattleEvent[] => {
  const r = b.useSkill(actor, skill, target);
  if (!r.ok) throw new Error(`${actor} ${skill}: ${r.reason}`);
  return r.events;
};
const has = (b: Battle, uid: string, kind: string) => b.get(uid)!.statuses.some((s) => s.kind === kind);
const allyMult = (content.skills.taunt!.effects.find((e) => e.type === 'taunt') as { allyDamageMult: number }).allyDamageMult;

/** Sırası gelene kadar pas geçer (turns modu). */
function until(b: Battle, uid: string): void {
  for (let i = 0; i < 300 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}

describe('Taunt: kontrol (CC) durumu taunt\'ı siler', () => {
  it('veri: breaksTaunt yalnızca Stun\'da (slow, haste, wound, bufflar yok)', () => {
    const flagged = Object.entries(content.statuses).filter(([, d]) => d.breaksTaunt).map(([id]) => id);
    expect(flagged).toEqual(['stun']);
    expect(content.statuses.slow!.breaksTaunt).toBeUndefined();
    expect(content.statuses.wound!.breaksTaunt).toBeUndefined();
  });

  for (const mode of ['test', 'turns'] as const) {
    describe(`mod: ${mode}`, () => {
      const setup = () => {
        const b = grid(cells({ 0: 'defender', 2: 'archer' }), cells({ 0: 'warrior' }), mode);
        if (mode === 'turns') until(b, 'party-0');
        act(b, 'party-0', 'taunt');
        expect(has(b, 'party-0', 'taunt')).toBe(true);
        if (mode === 'turns') until(b, 'enemy-0');
        return b;
      };

      it('taunter Stun yer (Charge) -> taunt anında silinir, "taunt broken" olayı yayınlanır, dost koruması biter', () => {
        const b = setup();
        const events = act(b, 'enemy-0', 'charge', 'party-0');
        expect(has(b, 'party-0', 'stun')).toBe(true);
        expect(has(b, 'party-0', 'taunt')).toBe(false);
        expect(ofType(events, 'statusEnd').some((e) => e.target === 'party-0' && e.status === 'taunt' && e.broken === true)).toBe(true);
        // olay sırası: önce stun uygulanır, sonra taunt biter
        const kinds = events.filter((e) => (e.type === 'status' && e.status === 'stun') || (e.type === 'statusEnd' && e.status === 'taunt')).map((e) => e.type);
        expect(kinds).toEqual(['status', 'statusEnd']);
        expect(b.damageTakenMult(b.get('party-1')!)).toBe(1); // dostun korumasi (allyDamageMult) de bitti
      });

      it('taunt silinince düşman hedef seçiminde serbest: taunter dışındaki dostlar da hedeflenebilir', () => {
        const b = setup();
        expect(b.validTargets('enemy-0', 'quick_shot').map((c) => c.uid)).toEqual(['party-0']); // taunt varken yalnızca taunter
        b.debugAddStatus('party-0', 'stun', 2);
        const targets = b.validTargets('enemy-0', 'quick_shot').map((c) => c.uid);
        expect(targets).toContain('party-1');
      });

      it('YZ: taunt silinince düşman YZ hedefi serbest (taunter dışı hedef seçebilir)', () => {
        const b = setup();
        b.get('party-1')!.hp = 1; // taunt olmasa en kolay hedef
        const withTaunt = chooseAction(b, 'enemy-0', content.aiConfig);
        if (withTaunt && b.skill(withTaunt.skillId)!.target === 'single_enemy') expect(withTaunt.targetUid).toBe('party-0');
        b.debugAddStatus('party-0', 'stun', 2);
        const free = b.validTargets('enemy-0', 'melee_attack').map((c) => c.uid);
        expect(free.length).toBeGreaterThan(0);
        const after = chooseAction(b, 'enemy-0', content.aiConfig);
        expect(after).not.toBeNull();
      });

      it('Slow ve Wound taunt\'ı bozmaz (yalnızca breaksTaunt bayraklı durumlar)', () => {
        const b = setup();
        b.debugAddStatus('party-0', 'slow', 2);
        b.debugAddStatus('party-0', 'wound', 2);
        expect(has(b, 'party-0', 'taunt')).toBe(true);
        expect(b.validTargets('enemy-0', 'quick_shot').map((c) => c.uid)).toEqual(['party-0']);
        expect(b.damageTakenMult(b.get('party-1')!)).toBe(allyMult);
      });
    });
  }

  it('Stun uygulanınca taunt, durum süresi Resilience ile kısalsa da 1 tur olsa da silinir', () => {
    const b = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior' }));
    b.get('party-0')!.stats.resilience = 1; // her debuff 1 tur kısalır (süre > 1 ise)
    act(b, 'party-0', 'taunt');
    const events = b.debugAddStatus('party-0', 'stun', 3);
    expect(events.ok).toBe(true);
    expect(b.get('party-0')!.statuses.find((s) => s.kind === 'stun')!.turns).toBe(2); // Resilience süreyi kısalttı
    expect(has(b, 'party-0', 'taunt')).toBe(false); // ama taunt yine silindi

    const c = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior' }));
    act(c, 'party-0', 'taunt');
    c.debugAddStatus('party-0', 'stun', 1);
    expect(c.get('party-0')!.statuses.find((s) => s.kind === 'stun')!.turns).toBe(1);
    expect(has(c, 'party-0', 'taunt')).toBe(false);
  });

  it('taunt olmayan birim stun yiyince hiçbir taunt olayı yayınlanmaz (başkasının taunt\'ı etkilenmez)', () => {
    const b = grid(cells({ 0: 'defender', 2: 'archer' }), cells({ 0: 'warrior' }));
    act(b, 'party-0', 'taunt');
    const log: BattleEvent[] = [];
    b.on((e) => log.push(e));
    b.debugAddStatus('party-1', 'stun', 2); // taunter değil, dost
    expect(ofType(log, 'statusEnd')).toHaveLength(0);
    expect(has(b, 'party-0', 'taunt')).toBe(true);
  });

  it('Guard bağlantısı: taunter stun yiyince taunt gider ama taunter\'ın başkasına koyduğu guard sürer; taunt\'ın guard payı (allyDamageMult) gider', () => {
    const b = grid(cells({ 0: 'defender', 2: 'archer', 3: 'warrior' }), cells({ 0: 'warrior' }));
    act(b, 'party-0', 'taunt');
    act(b, 'party-0', 'guard', 'party-1');
    expect(has(b, 'party-1', 'guard')).toBe(true);
    expect(b.damageTakenMult(b.get('party-2')!)).toBe(allyMult);
    b.debugAddStatus('party-0', 'stun', 2);
    expect(has(b, 'party-0', 'taunt')).toBe(false);
    expect(has(b, 'party-1', 'guard')).toBe(true); // guard ayrı bir durum: CC taunt'a özgü
    expect(b.damageTakenMult(b.get('party-2')!)).toBe(1);
  });

  it('mevcut taunt mantığı bozulmadı: breakRatio ile hasarla kırılma hâlâ çalışır', () => {
    const b = grid(cells({ 0: 'defender' }), cells({ 0: 'warrior' }));
    act(b, 'party-0', 'taunt');
    const d = b.get('party-0')!;
    d.shield = 0;
    d.hp = d.maxHp; // kırılma eşiği maks candan
    const events: BattleEvent[] = [];
    b.on((e) => events.push(e));
    b.get('enemy-0')!.stats.str = 400;
    for (let i = 0; i < 6 && has(b, 'party-0', 'taunt') && d.hp > 0; i++) act(b, 'enemy-0', 'melee_attack', 'party-0');
    if (d.hp > 0) expect(ofType(events, 'statusEnd').some((e) => e.status === 'taunt' && e.broken)).toBe(true);
  });

  it('deterministik: aynı seed + aynı eylemler = aynı olay akışı (taunt -> stun senaryosu)', () => {
    const run = () => {
      const b = grid(cells({ 0: 'defender', 2: 'archer' }), cells({ 0: 'warrior' }), 'turns', 5);
      until(b, 'party-0');
      act(b, 'party-0', 'taunt');
      until(b, 'enemy-0');
      act(b, 'enemy-0', 'charge', 'party-0');
      return JSON.stringify(b.log.map((e) => (e.type === 'battleStart' ? e.type : e)));
    };
    expect(run()).toBe(run());
  });
});

describe('Taunt metinleri (skill-info / wiki) CC kuralını söyler', () => {
  it('Taunt skill açıklaması "ends at once if you get Stun" satırını veriden üretir', async () => {
    const { describeSkill } = await import('../src/engine');
    const info = describeSkill(content.skills.taunt!, content.classes.defender!.stats, content.formulas, {}, { statuses: content.statuses, grounds: content.grounds });
    expect(info.lines.join(' | ')).toMatch(/Ends at once if you get Stun/);
  });
});
