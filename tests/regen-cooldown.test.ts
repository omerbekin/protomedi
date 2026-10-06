import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { BattleEvent } from '../src/engine';

const turnsBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'turns'));
const testBattle = (seed = 1) => new Battle(content.battleSetup('first-battle', seed, 'test'));

/** Sırası gelen aktör verilen uid olana kadar pas geçer. */
function skipUntil(b: Battle, uid: string): void {
  for (let i = 0; i < 200 && b.currentUid !== uid; i++) {
    if (!b.skipTurn().ok) break;
  }
  expect(b.currentUid).toBe(uid);
}

const lastEvents = (b: Battle, n: number) => b.log.slice(-n);

describe('MP yenilenmesi', () => {
  it('her karakterin mpRegen değeri var ve küçük (maks MP\'nin %15\'inden az)', () => {
    for (const def of [...Object.values(content.classes), ...Object.values(content.summons)]) {
      expect(def.stats.mpRegen, def.id).toBeGreaterThanOrEqual(0);
      if (def.stats.mp > 0) expect(def.stats.mpRegen / def.stats.mp, def.id).toBeLessThan(0.15);
    }
  });

  it('kendi turunun başında MP yenilenir ve mpRegen olayı turnStart\'tan önce gelir', () => {
    const b = turnsBattle();
    const archer = b.get('enemy-1')!;
    b.skipTurn(); // Archer pas geçti
    archer.mp = 10;
    skipUntil(b, archer.uid);
    expect(archer.mp).toBe(10 + archer.stats.mpRegen);
    const events = lastEvents(b, 2);
    expect(events[0]).toMatchObject({ type: 'mpRegen', actor: archer.uid, amount: archer.stats.mpRegen, after: archer.mp });
    expect(events[1]).toMatchObject({ type: 'turnStart', actor: archer.uid });
  });

  it('maksimum MP\'yi aşmaz; dolu MP\'de olay üretmez', () => {
    const b = turnsBattle();
    const mage = b.get('party-2')!;
    mage.mp = mage.maxMp - 1;
    skipUntil(b, mage.uid);
    expect(mage.mp).toBe(mage.maxMp);
    expect(lastEvents(b, 2)[0]).toMatchObject({ type: 'mpRegen', amount: 1 });
    // dolu iken bir tur daha
    b.skipTurn();
    skipUntil(b, mage.uid);
    const mpEvents = b.log.filter((e): e is Extract<BattleEvent, { type: 'mpRegen' }> => e.type === 'mpRegen' && e.actor === mage.uid);
    expect(mpEvents).toHaveLength(1);
  });

  it('MP bitince bile birkaç turda yeniden skill kullanılabilir hale gelir', () => {
    const b = turnsBattle();
    const mage = b.get('party-2')!;
    mage.mp = 0;
    expect(b.hasUsableSkill(mage.uid)).toBe(false);
    skipUntil(b, mage.uid);
    expect(mage.mp).toBe(mage.stats.mpRegen);
    const cost = content.skills.fire_bolt!.cost.amount;
    expect(b.canUse(mage.uid, 'fire_bolt').ok).toBe(mage.stats.mpRegen >= cost);
    // her kendi turunda mpRegen kadar daha: yeterli MP birikince skill yeniden kullanılabilir
    const turnsNeeded = Math.ceil(cost / mage.stats.mpRegen);
    for (let i = 1; i < turnsNeeded; i++) {
      b.skipTurn();
      skipUntil(b, mage.uid);
    }
    expect(mage.mp).toBe(Math.min(mage.maxMp, mage.stats.mpRegen * turnsNeeded));
    expect(b.canUse(mage.uid, 'fire_bolt').ok).toBe(true);
  });

  it('SPD ile oynayan hızlı karakter daha çok MP toplar ama tur başına miktar sabit', () => {
    const b = turnsBattle();
    for (const c of b.combatants) c.mp = 0;
    for (let i = 0; i < 60; i++) b.skipTurn();
    const regen = (uid: string) => b.log.filter((e) => e.type === 'mpRegen' && e.actor === uid).length;
    expect(regen('enemy-1')).toBeGreaterThan(regen('party-3')); // Archer (SPD 12) > Undead (SPD 6)
  });

  it('test modunda MP yenilenmez', () => {
    const b = testBattle();
    b.get('party-2')!.mp = 0;
    b.useSkill('party-0', 'melee_attack', 'enemy-0');
    expect(b.get('party-2')!.mp).toBe(0);
    expect(b.log.some((e) => e.type === 'mpRegen')).toBe(false);
  });
});

describe('cooldown (bekleme süresi)', () => {
  it('güçlü skill\'lerin cooldown değeri var, bedelsiz temel saldırıların yok', () => {
    for (const id of ['meteor', 'rejuvenate', 'charge', 'whirlwind', 'radiance', 'summon_treant']) {
      expect(content.skills[id]?.cooldown, id).toBeGreaterThan(0);
    }
    for (const id of ['melee_attack', 'quick_shot', 'bone_throw', 'thorn_whip', 'root_smash']) {
      expect(content.skills[id]?.cooldown ?? 0, id).toBe(0);
    }
  });

  /** Mage'in sırası gelene kadar ilerlet, Meteor'u kullan. */
  function castMeteor(b: Battle): void {
    skipUntil(b, 'party-2');
    const r = b.useSkill('party-2', 'meteor', 'enemy-0');
    expect(r.ok).toBe(true);
  }

  it('kullanılan skill bir sonraki turlarda reddedilir, sonra tekrar açılır (Meteor: 4 tur)', () => {
    const b = turnsBattle();
    delete b.get('party-2')!.passive; // Spell Echo cooldown'u rastgele sıfırlamasın
    const cooldown = content.skills.meteor!.cooldown!;
    expect(cooldown).toBe(4);
    castMeteor(b);
    const mage = b.get('party-2')!;
    mage.mp = mage.maxMp; // MP engel olmasın
    expect(mage.cooldowns.meteor).toBe(cooldown);

    // Sonraki (cooldown - 1) turunda kullanılamaz
    for (let turn = 1; turn < cooldown; turn++) {
      skipUntil(b, 'party-2');
      expect(b.canUse('party-2', 'meteor')).toEqual({ ok: false, reason: 'On cooldown' });
      expect(mage.cooldowns.meteor).toBe(cooldown - turn);
      expect(b.useSkill('party-2', 'meteor', 'enemy-0').ok).toBe(false);
      b.skipTurn();
    }
    // cooldown. turunda hazır
    skipUntil(b, 'party-2');
    expect(mage.cooldowns.meteor).toBeUndefined();
    expect(b.canUse('party-2', 'meteor').ok).toBe(true);
  });

  it('cooldown yalnızca o karakterin kendi turlarında azalır (diğerlerinin turu sayılmaz)', () => {
    const b = turnsBattle();
    castMeteor(b);
    const mage = b.get('party-2')!;
    const before = mage.cooldowns.meteor;
    // Mage dışındakiler oynasın
    let others = 0;
    while (b.currentUid !== 'party-2') {
      b.skipTurn();
      others++;
    }
    expect(others).toBeGreaterThan(0);
    // Mage'in turu geldi: tam 1 azaldı (diğerlerinin turları saymadı)
    expect(mage.cooldowns.meteor).toBe(before! - 1);
  });

  it('cooldown karakter başınadır: aynı skill\'e sahip başka birimi etkilemez', () => {
    const b = turnsBattle();
    castMeteor(b);
    // Düşman Mage'in Frost Bolt'u (farklı skill) etkilenmez
    expect(b.get('enemy-2')!.cooldowns).toEqual({});
  });

  it('cooldown\'daki skill için YZ başka bir skill seçer', () => {
    const b = turnsBattle();
    skipUntil(b, 'party-2');
    b.get('enemy-3')!.hp = 0; // hedefler azalsın, AoE yerine tek hedef Meteor cazip olsun
    b.get('enemy-1')!.hp = 0;
    b.useSkill('party-2', 'meteor', 'enemy-0');
    skipUntil(b, 'party-2');
    b.get('party-2')!.mp = 60;
    const choice = chooseAction(b, 'party-2', content.aiConfig);
    expect(choice?.skillId).not.toBe('meteor');
  });

  it('test modunda cooldown yok: arka arkaya kullanılabilir', () => {
    const b = testBattle();
    for (let i = 0; i < 2; i++) expect(b.useSkill('party-2', 'meteor', 'enemy-0').ok).toBe(true);
    expect(b.get('party-2')!.cooldowns).toEqual({});
  });

  it('Druid\'in şifası (Rejuvenate) kullanıldıktan sonra beklemeye girer', () => {
    const b = turnsBattle();
    skipUntil(b, 'enemy-3');
    b.get('enemy-0')!.hp = 20;
    expect(b.useSkill('enemy-3', 'rejuvenate', 'enemy-0').ok).toBe(true);
    expect(b.get('enemy-3')!.cooldowns.rejuvenate).toBe(content.skills.rejuvenate!.cooldown);
    skipUntil(b, 'enemy-3');
    expect(b.canUse('enemy-3', 'rejuvenate')).toEqual({ ok: false, reason: 'On cooldown' });
  });

  it('olay akışındaki karakter kopyaları cooldown bilgisini taşır', () => {
    const b = turnsBattle();
    const start = b.log[0]!;
    expect(start.type).toBe('battleStart');
    if (start.type === 'battleStart') for (const c of start.combatants) expect(c.cooldowns).toEqual({});
  });
});
