import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { ELEMENT_ICON, FLOAT_SERIF, damageIconKind, damageSourceKind, floatStyle, floatTimes, lighten, placeFloat, rowLayout } from '../src/game/float-text';
import { isIconKind } from '../src/ui/icon-kinds';

describe('yüzen yazı stili', () => {
  it('serif ailesi, kalın kontur ve gölge; miss/dodge italik', () => {
    const dmg = floatStyle('damage', 80, '#ffe066');
    expect(dmg.fontFamily).toBe(FLOAT_SERIF);
    expect(dmg.fontStyle).toBe('bold');
    expect(dmg.strokeThickness).toBeGreaterThanOrEqual(5);
    expect(dmg.shadow.offsetY).toBeGreaterThan(0);
    expect(floatStyle('miss', 46, '#cfc7a0').fontStyle).toContain('italic');
    expect(floatStyle('dodge', 46, '#9ad1ff').fontStyle).toContain('italic');
  });

  it('puntoyu korur, çok küçükte 14 px altına inmez', () => {
    expect(floatStyle('heal', 64, '#7dff9b').fontSize).toBe('64px');
    expect(floatStyle('info', 5, '#fff').fontSize).toBe('14px');
  });

  it('üst ışık rengi tabandan açık; miss düz renk', () => {
    expect(floatStyle('heal', 64, '#336699').topLight).toBe(lighten('#336699', 0.55));
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(floatStyle('miss', 46, '#cfc7a0').topLight).toBeNull();
  });
});

describe('yüzen yazı süresi', () => {
  it('veriden: en az 2 sn (eskisinden +0,5 sn), son 200 ms solar', () => {
    expect(layout.animation.damageNumberMs).toBeGreaterThanOrEqual(2000);
    expect(layout.animation.floatFadeMs).toBe(200);
    const t = floatTimes(layout.animation.damageNumberMs, layout.animation.floatFadeMs);
    expect(t.fade).toBe(200);
    expect(t.fadeDelay + t.fade).toBe(t.total);
  });
  it('solma süresi toplamı aşmaz', () => expect(floatTimes(100, 200)).toEqual({ total: 100, fadeDelay: 0, fade: 100 }));
});

describe('şerit yığınlama (üst üste binmez)', () => {
  it('ilk yazı şerit 0, ofset 0; sonrakiler üste dizilir', () => {
    const lanes: Array<number | undefined> = [];
    expect(placeFloat(lanes)).toEqual({ lane: 0, offset: 0 });
    lanes[0] = 100;
    const b = placeFloat(lanes);
    expect(b.lane).toBe(1);
    expect(b.offset).toBeCloseTo(95, 5);
  });
  it('biten şerit yeniden kullanılır; yaşayan şeritle çakışmaz', () => {
    const c = placeFloat([undefined, 60]);
    expect(c.lane).toBe(0);
    expect(c.offset).toBe(0);
    const d = placeFloat([70, undefined, 50]);
    expect(d.lane).toBe(1);
    expect(d.offset).toBeCloseTo(70 * 0.95, 5);
  });
});

describe('rakam + ikon satırı', () => {
  it('parçalar tek satırda ortalanır', () => {
    const { lefts, total } = rowLayout([40, 100, 30], 6);
    expect(total).toBe(182);
    expect(lefts[0]).toBe(-91);
    expect(lefts[1]).toBe(-91 + 46);
    expect(lefts[2]! + 30).toBe(91);
  });
});

describe('hasar ikonu (element / kaynak)', () => {
  it('fiziksel ve elementsiz hasarda ikon yok', () => {
    expect(damageIconKind({ element: 'physical' })).toBeNull();
    expect(damageIconKind({})).toBeNull();
  });
  it('element ikonları: ateş, buz, kutsal, arcane, doğa', () => {
    expect(damageIconKind({ element: 'fire' })).toBe('flame');
    expect(damageIconKind({ element: 'ice' })).toBe('blizzard');
    expect(damageIconKind({ element: 'holy' })).toBe('holy');
    expect(damageIconKind({ element: 'arcane' })).toBe('rune');
    expect(damageIconKind({ element: 'nature' })).toBe('leaf');
  });
  it('zemin tiki: zehir -> zehir damlası, yanma -> alev (element ne olursa olsun)', () => {
    expect(damageIconKind({ origin: 'ground', ground: 'poison', element: 'nature' })).toBe('poison');
    expect(damageIconKind({ origin: 'ground', ground: 'burning', element: 'fire' })).toBe('flame');
    expect(damageIconKind({ origin: 'ground', ground: 'holy_fire', element: 'holy' })).toBe('holy');
  });
  it('durum tiki: yara/kanama -> kan damlası; kendine hasar -> ikon yok', () => {
    expect(damageIconKind({ origin: 'status', statusId: 'wound' })).toBe('drop');
    expect(damageIconKind({ origin: 'self', element: 'fire' })).toBeNull();
    expect(damageSourceKind({ origin: 'self' })).toBe('self');
  });
  it('kullanılan tüm ikon adları gerçek piksel ikonlar', () => {
    for (const k of [...Object.values(ELEMENT_ICON), 'poison', 'flame', 'drop', 'burst']) expect(isIconKind(k), k).toBe(true);
  });
});
