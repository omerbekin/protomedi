import { describe, expect, it } from 'vitest';
import { Battle, content, describeStat } from '../src/engine';

/**
 * Ömer kararları (open-questions.md madde 212): tüm class'larda taban mana 30 (MP = 30 + 2 x INT), INT başına MP yenilenmesi ~0,33,
 * Aimed Shot başlangıç cooldown'u 2, Resurrection 20 MP, Tremor Slam gücü 0,6. Sayılar veriden okunur; bu testler kararların veride durduğunu kilitler.
 */
const f = content.formulas;
const a = f.attributes;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');

describe('mana ekonomisi', () => {
  it('mpBase 30; her class\'ın MP\'si mpBase + mpPerInt x INT (class bazlı MP override yok); skill bedelleri değişmedi', () => {
    expect(a.mpBase).toBe(30);
    for (const [id, def] of Object.entries(content.classes)) {
      expect(def.stats.mp, id).toBe(Math.round(a.mpBase + a.mpPerInt * def.attributes.int));
    }
    // class verisinde MP override'ı yok (yalnızca çağrılan birimlerin MP'si elle 0)
    for (const mod of Object.values(import.meta.glob('../data/classes/*.json', { eager: true }))) {
      const data = (mod as { default: { id: string; overrides?: Record<string, number> } }).default;
      expect(data.overrides?.mp, data.id).toBeUndefined();
    }
  });

  it('int başına mana artışı (mpPerInt) aynı: 2', () => {
    expect(a.mpPerInt).toBe(2);
  });

  it('INT başına MP yenilenmesi ~0,33 (eski 0,25\'ten arttı); yenilenme = round(INT x mpRegenPerInt)', () => {
    expect(a.mpRegenPerInt).toBeGreaterThan(0.3);
    expect(a.mpRegenPerInt).toBeLessThan(0.36);
    for (const [id, def] of Object.entries(content.classes)) expect(def.stats.mpRegen, id).toBe(Math.round(def.attributes.int * a.mpRegenPerInt));
  });

  it('stat tooltip\'i "Max MP = taban + int başına" yazar (sayılar veriden)', () => {
    const s = content.classes.mage!.stats;
    const mp = describeStat('mp', s, f);
    expect(mp.lines.join('\n')).toContain(`${a.mpBase} base`);
    expect(mp.lines.join('\n')).toContain(`${a.mpPerInt} per Intelligence point`);
    expect(describeStat('int', s, f).lines.join('\n')).toContain(`${a.mpBase} base + ${a.mpPerInt} per point (now ${s.mp})`);
  });

  it('Gambler\'a ayrı mana azaltması yok (genel karar: yalnızca taban 30)', () => {
    const g = content.classes.gambler!;
    expect(g.stats.mp).toBe(a.mpBase + a.mpPerInt * g.attributes.int);
  });
});

describe('skill değişiklikleri (veri)', () => {
  it('Archer Aimed Shot başlangıç cooldown\'u 2: turns modunda birimin ilk 2 turunda kullanılamaz; test modunda yok', () => {
    expect(content.skills.aimed_shot!.initialCooldown).toBe(2);
    expect(content.skills.aimed_shot!.initialCooldown!).toBeLessThanOrEqual(f.cooldown.maxInitial);
    const mk = (mode: 'turns' | 'test') => new Battle(content.battleSetup('random-battle', 1, mode, { party: cells({ 0: 'archer' }), enemies: cells({ 0: 'defender' }) }, false));
    const turns = mk('turns');
    expect(turns.get('party-0')!.cooldowns.aimed_shot).toBe(2);
    expect(turns.canUse('party-0', 'aimed_shot')).toEqual({ ok: false, reason: 'On cooldown' });
    expect(mk('test').get('party-0')!.cooldowns.aimed_shot).toBeUndefined();
  });

  it('Resurrection MP bedeli 20 (cooldown 6 aynı)', () => {
    expect(content.skills.resurrection!.cost).toEqual({ resource: 'mp', amount: 20 });
    expect(content.skills.resurrection!.cooldown).toBe(6);
  });

  it('Defender Tremor Slam hasar gücü pozitif (madde 214: 0,8; madde 261 denge turu: düşürüldü, temel saldırı payı bandı için; güncel değer veride; Slow ve diğer sayılar aynı)', () => {
    const t = content.skills.tremor_slam!;
    const dmg = t.effects.find((e) => e.type === 'damage') as { power: number };
    expect(dmg.power).toBeGreaterThan(0);
    const slow = t.effects.find((e) => e.type === 'status') as { status: string; turns: number };
    expect(slow).toMatchObject({ status: 'slow', turns: 2 });
    // Ömer (madde 230): Tremor Slam bedelsiz ve cooldown'suz
    expect(t.cost).toEqual({ resource: 'mp', amount: 0 });
    expect(t.cooldown).toBeUndefined();
  });
});
