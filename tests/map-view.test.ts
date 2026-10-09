import { describe, expect, it } from 'vitest';
import { MAP_ZOOM, canPan, clampMid, clampZoom, midLimits, wheelAction } from '../src/game/map-view';

// 21:9 harita çerçevesi (geniş görsel; eski 16:9 bölge dünyada 0-1920)
const frame = { left: -221, right: 2462, top: 0, bottom: 1080 };

describe('sefer haritası görünümü (kaydırma / yakınlaştırma)', () => {
  it('yakınlaştırma 1,0-1,4 arasında kalır', () => {
    expect(clampZoom(0.5)).toBe(MAP_ZOOM.min);
    expect(clampZoom(3)).toBe(MAP_ZOOM.max);
    expect(clampZoom(1.23)).toBe(1.23);
  });

  it('16:9 ekranda harita sağa sola kaydırılır ama çerçeveden asla çıkılmaz', () => {
    const v = { w: 1920, h: 1080 };
    const l = midLimits(frame, v);
    expect(l.minX).toBe(-221 + 960);
    expect(l.maxX).toBe(2462 - 960);
    expect(l.minY).toBe(l.maxY); // dikeyde yer yok
    expect(clampMid({ x: -5000, y: 0 }, frame, v)).toEqual({ x: l.minX, y: 540 });
    expect(clampMid({ x: 9999, y: 9999 }, frame, v)).toEqual({ x: l.maxX, y: 540 });
    expect(canPan({ x: l.minX, y: 540 }, frame, v)).toMatchObject({ left: false, right: true, up: false, down: false });
  });

  it('çerçeveden geniş görünümde (21:9 ve üstü) kaydırma yok, harita ortada', () => {
    const v = { w: 2800, h: 1080 };
    const c = clampMid({ x: 0, y: 0 }, frame, v);
    expect(c.x).toBeCloseTo((frame.left + frame.right) / 2);
    expect(canPan(c, frame, v)).toEqual({ left: false, right: false, up: false, down: false });
  });

  it('yakınlaşınca dikey kaydırma da açılır', () => {
    const v = { w: 1920 / 1.4, h: 1080 / 1.4 };
    const p = canPan({ x: 960, y: 540 }, frame, v);
    expect(p.up && p.down && p.left && p.right).toBe(true);
  });

  it('tekerlek: Ctrl = yakınlaştırma (trackpad sıkıştırması), değilse kaydırma; dikeyde yer yoksa dikey tekerlek yatay kaydırır', () => {
    expect(wheelAction({ dx: 0, dy: -50, ctrl: true }, { vertical: false })).toEqual({ zoom: MAP_ZOOM.step, panX: 0, panY: 0 });
    expect(wheelAction({ dx: 0, dy: 50, ctrl: false }, { vertical: false })).toEqual({ zoom: 0, panX: 50, panY: 0 });
    expect(wheelAction({ dx: 30, dy: 10, ctrl: false }, { vertical: true })).toEqual({ zoom: 0, panX: 30, panY: 10 });
  });
});
