import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content } from '../src/engine';
import { alphaOpaque, inSpriteRect, pickCellAt, type PickSprite } from '../src/game/pick-cell';
import { cellCenter } from '../src/game/shape-geometry';

const LANES = content.formulas.formation.lanes;
const enemy = layout.enemySlots;
const party = layout.partySlots;
const W = layout.spriteBox.width;
const H = layout.spriteBox.height;
const spriteAt = (slots: typeof enemy, slot: number, extra: Partial<PickSprite> = {}): PickSprite => ({ slot, x: slots[slot]!.x, y: slots[slot]!.y, w: W, h: H, ...extra });

describe('hücre seçimi: karakter çizimi önce', () => {
  it('imleç birimin başında/gövdesinde/kılıcında: o birimin hücresi (zemin dörtgeni başka hücreyi gösterse de)', () => {
    // ön şerit (şerit 2) birimi: başı arkadaki şeritlerin zemin dörtgenlerinin üstüne biner
    const slot = 2; // sıra 0, şerit 2 (en önde)
    const s = enemy[slot]!;
    const sprites = [spriteAt(enemy, slot)];
    for (const dy of [10, 80, 170, 185]) expect(pickCellAt(enemy, LANES, s.x, s.y - dy, sprites), `dy ${dy}`).toBe(slot);
    // aynı noktada çizim yoksa zemin dörtgeni arkadaki hücreyi bulurdu: hata buydu
    const wrong = pickCellAt(enemy, LANES, s.x, s.y - 100, []);
    expect(wrong).not.toBe(slot);
  });

  it('çizimin dışı: zemin dörtgeni (boş hücre) ya da null', () => {
    const sprites = [spriteAt(enemy, 0)];
    const c = cellCenter(enemy, 4);
    expect(pickCellAt(enemy, LANES, c.x, c.y, sprites)).toBe(4);
    expect(pickCellAt(enemy, LANES, 5, 5, sprites)).toBeNull();
  });

  it('örtüşen iki çizim: ayağı en aşağıdaki (öndeki) birim kazanır, sprite listesi sırası fark etmez', () => {
    const back = spriteAt(enemy, 0); // şerit 0
    const front = spriteAt(enemy, 1); // şerit 1 (aşağıda)
    const x = (back.x + front.x) / 2;
    const y = back.y - 60; // ikisinin de dikdörtgeninde
    expect(inSpriteRect(back, x, y) && inSpriteRect(front, x, y)).toBe(true);
    expect(pickCellAt(enemy, LANES, x, y, [back, front])).toBe(1);
    expect(pickCellAt(enemy, LANES, x, y, [front, back])).toBe(1);
    // yalnızca arkadakinin üstünde (ön birimin başının üstü): arkadaki
    expect(pickCellAt(enemy, LANES, back.x, back.y - H + 5, [back, front])).toBe(0);
  });

  it('şeffaf kenar boşluğu komşuyu engellemez: öndeki sprite o noktada şeffafsa arkadaki kazanır', () => {
    const back = spriteAt(enemy, 0);
    const front = spriteAt(enemy, 1, { opaque: () => false });
    const x = (back.x + front.x) / 2;
    const y = back.y - 60;
    expect(pickCellAt(enemy, LANES, x, y, [back, front])).toBe(0);
    // ikisi de şeffafsa çizim sayılmaz: zemin/gövde yedeği
    const none = [spriteAt(enemy, 0, { opaque: () => false }), front];
    expect(pickCellAt(enemy, LANES, 5, 5, none)).toBeNull();
  });

  it('boş hücre / ceset hücresi (sprite yok): yalnızca zemin', () => {
    const c = cellCenter(party, 7);
    expect(pickCellAt(party, LANES, c.x, c.y, [spriteAt(party, 6)])).toBe(7);
  });

  it('iki taraf: oyuncu tahtasında da çizim hücre verir', () => {
    const s = party[3]!;
    expect(pickCellAt(party, LANES, s.x, s.y - 120, [spriteAt(party, 3)])).toBe(3);
  });

  it('her yuvada, çizimin her yerinde (tek birim) tıklama o yuvayı verir', () => {
    for (const slots of [enemy, party]) {
      for (let slot = 0; slot < slots.length; slot++) {
        const s = slots[slot]!;
        for (const [dx, dy] of [[0, 5], [0, 100], [0, 185], [50, 120], [-50, 120]] as const) {
          expect(pickCellAt(slots, LANES, s.x + dx, s.y - dy, [spriteAt(slots, slot)])).toBe(slot);
        }
      }
    }
  });
});

describe('alphaOpaque: doku alfasından', () => {
  const box = { x: 100, y: 200, w: 100, h: 100 }; // x 50..150, y 100..200
  // 10x10 kare çerçeve: yalnızca sol sütun (u=0) dolu
  const alphaAt = (u: number): number => (u === 0 ? 255 : 0);

  it('dolu piksel: opak; boş bölge: şeffaf (ince çizgiye tolerans yarıçapı dışında)', () => {
    const op = alphaOpaque(box, 10, 10, false, alphaAt);
    expect(op(55, 150)).toBe(true);
    expect(op(140, 150)).toBe(false);
  });

  it('yatay çevrilmiş sprite: dolu sütun sağda', () => {
    const op = alphaOpaque(box, 10, 10, true, alphaAt);
    expect(op(145, 150)).toBe(true);
    expect(op(139, 150)).toBe(true); // dolu sütunun hemen yanı: tolerans yarıçapı içinde
    expect(op(60, 150)).toBe(false);
    expect(op(100, 150)).toBe(false);
  });

  it('alfa okunamazsa (null) dikdörtgen yeter', () => {
    expect(alphaOpaque(box, 10, 10, false, () => null)(100, 150)).toBe(true);
  });
});
