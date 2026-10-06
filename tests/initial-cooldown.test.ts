import { describe, expect, it } from 'vitest';
import { Battle, content, describeSkill } from '../src/engine';

const MAX = content.formulas.cooldown.maxInitial;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const turnsBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'turns'));
const testBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'test'));
const withInitial = (skills: string[]) => skills.filter((id) => (content.skills[id]?.initialCooldown ?? 0) > 0);
const initialOf = (id: string) => content.skills[id]!.initialCooldown!;

/** Sırası gelene kadar pas geç. */
function skipUntil(b: Battle, uid: string): void {
  for (let i = 0; i < 200 && b.currentUid !== uid; i++) if (!b.skipTurn().ok) break;
  expect(b.currentUid).toBe(uid);
}

describe('cooldown değerleri (veriden)', () => {
  it('Ömer onayı: Aimed Shot, Meteor ve All In cooldown 3; High Stakes ve Card Trick 2; Taunt süresi (turn) değişmedi', () => {
    expect(content.skills.aimed_shot!.cooldown).toBe(3);
    expect(content.skills.meteor!.cooldown).toBe(3);
    expect(content.skills.all_in!.cooldown).toBe(3);
    expect(content.skills.high_stakes!.cooldown).toBe(2);
    expect(content.skills.card_trick!.cooldown).toBe(2);
    const taunt = content.skills.taunt!.effects.find((e) => e.type === 'taunt');
    expect(taunt).toMatchObject({ turns: 2 });
    expect(content.skills.taunt!.cooldown).toBe(4);
  });
});

describe('başlangıç cooldown\'u (initialCooldown): veri', () => {
  it('üst sınır veride (formulas.cooldown.maxInitial) ve 3', () => {
    expect(MAX).toBe(3);
  });

  it('her initialCooldown 1..max arası tam sayı', () => {
    for (const [id, s] of Object.entries(content.skills)) {
      if (s.initialCooldown === undefined) continue;
      expect(Number.isInteger(s.initialCooldown), id).toBe(true);
      expect(s.initialCooldown, id).toBeGreaterThanOrEqual(1);
      expect(s.initialCooldown, id).toBeLessThanOrEqual(MAX);
    }
  });

  it('yalnızca class\'ların 4. yuvasındaki skill\'lerde var; çağrılan birimlerin skill\'lerinde yok', () => {
    const fourth = new Set(Object.values(content.classes).map((c) => c.skills[3]));
    for (const [id, s] of Object.entries(content.skills)) if (s.initialCooldown !== undefined) expect(fourth.has(id), id).toBe(true);
    for (const u of Object.values(content.summons)) for (const id of u.skills) expect(content.skills[id]!.initialCooldown, id).toBeUndefined();
  });

  it('güçlü 4. skill\'lerin çoğunda var (gerekçeli dışarıda kalanlar: Abyssal Cry, Aimed Shot, çağrılar)', () => {
    for (const id of ['meteor', 'fist_crush', 'void_strike', 'all_in', 'radiance']) expect(initialOf(id), id).toBeGreaterThan(0);
    for (const id of ['summon_treant', 'raise_dead']) expect(content.skills[id]!.initialCooldown, id).toBeUndefined();
  });

  it('skill açıklaması (tooltip) tek satır verir: "Opens on cooldown: N turns"; yoksa boş', () => {
    const stats = content.classes.mage!.stats;
    const info = (id: string) => describeSkill(content.skills[id]!, stats, content.formulas, content.summons);
    const n = initialOf('meteor');
    expect(info('meteor').initialCooldown).toBe(`Opens on cooldown: ${n} turn${n > 1 ? 's' : ''}`);
    expect(info('fire_bolt').initialCooldown).toBe('');
  });
});

describe('başlangıç cooldown\'u: savaşta', () => {
  it('turns modunda savaş başında sayaç veriden gelir; initialCooldown\'suz skill\'ler ve çağrılar yok', () => {
    const b = turnsBattle();
    for (const c of b.combatants) {
      const expected = Object.fromEntries(withInitial(c.skills).map((id) => [id, Math.min(MAX, initialOf(id))]));
      expect(c.cooldowns, c.uid).toEqual(expected);
    }
    expect(b.get('party-2')!.cooldowns.meteor).toBe(initialOf('meteor')); // Mage
  });

  it('test modunda cooldown yok: başlangıç cooldown\'u da yok, skill\'ler ilk andan kullanılabilir', () => {
    const b = testBattle();
    for (const c of b.combatants) expect(c.cooldowns, c.uid).toEqual({});
    expect(b.canUse('party-2', 'meteor').ok).toBe(true);
    expect(b.useSkill('party-2', 'meteor', 'enemy-0').ok).toBe(true);
  });

  it('birim, KENDİ ilk N turunda skill\'i kullanamaz; ilk turunda sayaç N gösterir; N+1. turunda hazırdır', () => {
    const n = initialOf('meteor');
    const b = turnsBattle();
    const mage = b.get('party-2')!;
    delete mage.passive; // Spell Echo karışmasın
    mage.mp = mage.maxMp;
    // Başlangıçtaki sayaç = N; ilk turun başı bunu azaltmaz
    for (let turn = 1; turn <= n; turn++) {
      skipUntil(b, 'party-2');
      expect(mage.cooldowns.meteor, `tur ${turn}`).toBe(n - turn + 1);
      expect(b.canUse('party-2', 'meteor'), `tur ${turn}`).toEqual({ ok: false, reason: 'On cooldown' });
      expect(b.useSkill('party-2', 'meteor', 'enemy-0').ok).toBe(false);
      b.skipTurn();
    }
    skipUntil(b, 'party-2');
    expect(mage.cooldowns.meteor).toBeUndefined();
    expect(b.canUse('party-2', 'meteor').ok).toBe(true);
  });

  it('başlangıç cooldown\'u birim başınadır: bir birimin turları öbürünün sayacını azaltmaz', () => {
    const b = turnsBattle();
    skipUntil(b, 'party-2');
    // Mage kendi ilk turunda: sayaç sabit; diğer Mage'in (düşman) sayacı da henüz oynamadığı için değişmedi
    expect(b.get('party-2')!.cooldowns.meteor).toBe(initialOf('meteor'));
    expect(b.get('enemy-2')!.cooldowns.meteor).toBe(initialOf('meteor'));
    b.skipTurn();
    skipUntil(b, 'party-2');
    expect(b.get('party-2')!.cooldowns.meteor ?? 0).toBe(initialOf('meteor') - 1);
  });

  it('veri üst sınırı aşarsa kod sınırlar (en çok formulas.cooldown.maxInitial)', () => {
    const setup = content.battleSetup('first-battle', 1, 'turns');
    setup.skills = { ...setup.skills, meteor: { ...setup.skills.meteor!, initialCooldown: 99 } };
    const b = new Battle(setup);
    expect(b.get('party-2')!.cooldowns.meteor).toBe(MAX);
    const lower = content.battleSetup('first-battle', 1, 'turns');
    lower.formulas = { ...lower.formulas, cooldown: { maxInitial: 1 } };
    lower.skills = { ...lower.skills, meteor: { ...lower.skills.meteor!, initialCooldown: 3 } };
    expect(new Battle(lower).get('party-2')!.cooldowns.meteor).toBe(1);
  });

  it('çağrılan birimler başlangıç cooldown\'u almaz', () => {
    const b = new Battle(content.battleSetup('random-battle', 3, 'turns', { party: cells({ 0: 'undead' }), enemies: cells({ 0: 'warrior' }) }, false));
    b.debugClearCooldowns();
    const undead = b.combatants.find((c) => c.defId === 'undead')!;
    undead.mp = 100;
    skipUntil(b, undead.uid);
    expect(b.useSkill(undead.uid, 'raise_dead').ok).toBe(true);
    const skeleton = b.combatants.find((c) => c.summoned)!;
    expect(skeleton.cooldowns).toEqual({});
  });

  it('debugClearCooldowns başlangıç cooldown\'unu da temizler', () => {
    const b = turnsBattle();
    b.debugClearCooldowns('party-2');
    skipUntil(b, 'party-2');
    expect(b.canUse('party-2', 'meteor').ok).toBe(true);
  });
});
