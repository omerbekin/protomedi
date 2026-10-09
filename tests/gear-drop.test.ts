import { describe, expect, it } from 'vitest';
import { dropAction, isDoubleTap } from '../src/ui/gear-drop';
import { mergeLine } from '../src/ui/stat-tips';

const classOf = (id: string) => ({ w: 'warrior', a: 'archer' })[id];
const axe = { kind: 'bag' as const, uid: 'u1', itemId: 'woodcutters_axe' };
const helm = { kind: 'bag' as const, uid: 'u2', itemId: 'leather_coif' };

describe('Gear sürükle-bırak / çift tıklama kararları', () => {
  it('torbadaki item uygun yuvaya ya da kahramana bırakılınca kuşanılır', () => {
    expect(dropAction(axe, { kind: 'slot', heroId: 'w', slot: 'weapon' }, classOf)).toEqual({ kind: 'equip', heroId: 'w', uid: 'u1' });
    expect(dropAction(helm, { kind: 'hero', heroId: 'a' }, classOf)).toEqual({ kind: 'equip', heroId: 'a', uid: 'u2' });
  });
  it('yanlış yuva, silah ailesi uymayan kahraman ve torbaya bırakmak geçersiz', () => {
    expect(dropAction(axe, { kind: 'slot', heroId: 'w', slot: 'helm' }, classOf).kind).toBe('none');
    expect(dropAction(axe, { kind: 'hero', heroId: 'a' }, classOf).kind).toBe('none');
    expect(dropAction(axe, { kind: 'bag' }, classOf).kind).toBe('none');
  });
  it('kuşanılmış yuvadaki item yalnızca torbaya bırakılınca çıkarılır', () => {
    const src = { kind: 'slot' as const, heroId: 'w', slot: 'weapon' as const };
    expect(dropAction(src, { kind: 'bag' }, classOf)).toEqual({ kind: 'unequip', heroId: 'w', slot: 'weapon' });
    expect(dropAction(src, { kind: 'hero', heroId: 'a' }, classOf).kind).toBe('none');
  });
  it('çift dokunma: aynı hedef, kısa aralık', () => {
    expect(isDoubleTap({ key: 'u1', at: 1000 }, 'u1', 1300)).toBe(true);
    expect(isDoubleTap({ key: 'u1', at: 1000 }, 'u1', 1500)).toBe(false);
    expect(isDoubleTap({ key: 'u1', at: 1000 }, 'u2', 1100)).toBe(false);
  });
});

describe('Gear stat açıklaması: önce → sonra', () => {
  it('yalnızca değişen sayıları birleştirir', () => {
    expect(mergeLine('Reduces physical damage taken by 28.6%', 'Reduces physical damage taken by 33.3%')).toBe('Reduces physical damage taken by 28.6% → 33.3%');
    expect(mergeLine('Armor 12', 'Armor 15')).toBe('Armor 12 → 15');
    expect(mergeLine('Same 5', 'Same 5')).toBe('Same 5');
  });
});
