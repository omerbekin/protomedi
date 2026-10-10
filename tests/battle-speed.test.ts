import { describe, expect, it } from 'vitest';
import { BATTLE_SPEEDS, DEFAULT_SPEED, SPEED_STEPS, battleSpeedLabel, parseBattleSpeed, speedAt, speedIndex } from '../src/ui/battle-speed';
import { waitMs } from '../src/game/turn-wait';
import layout from '../data/battle-layout.json';

// Settings > Battle speed kaydırıcısı (Ömer 2026-10-10): ayrık adımlar, eski kayıtlar, bekleme = süre / hız (tavan da).
describe('Battle speed kaydırıcısı', () => {
  it('adımlar 0.25x, 0.5x, 0.75x, 1x, 2x, 4x; konum <-> hız eşleşmesi gidiş-dönüş tutarlı; uçlar sınırda kalır', () => {
    expect([...BATTLE_SPEEDS]).toEqual([0.25, 0.5, 0.75, 1, 2, 4]);
    expect(SPEED_STEPS).toBe(5);
    BATTLE_SPEEDS.forEach((v, i) => {
      expect(speedIndex(v)).toBe(i);
      expect(speedAt(i)).toBe(v);
    });
    expect(speedAt(-3)).toBe(0.25);
    expect(speedAt(99)).toBe(4);
    expect(speedAt(2.6)).toBe(1); // en yakın adım (konum 3 = 1x)
    expect(battleSpeedLabel(0.25)).toBe('0.25x');
    expect(battleSpeedLabel(1)).toBe('1x');
  });

  it('kayıt göçü: eski 1 / 2 / 4 aynen; yeni adımlar okunur; boş / bozuk / bilinmeyen değer varsayılan 1x', () => {
    expect(parseBattleSpeed('1')).toBe(1);
    expect(parseBattleSpeed('2')).toBe(2);
    expect(parseBattleSpeed('4')).toBe(4);
    expect(parseBattleSpeed('0.5')).toBe(0.5);
    expect(parseBattleSpeed('0.75')).toBe(0.75);
    expect(parseBattleSpeed(null)).toBe(DEFAULT_SPEED);
    expect(parseBattleSpeed('')).toBe(1);
    expect(parseBattleSpeed('abc')).toBe(1);
    expect(parseBattleSpeed('3')).toBe(1);
  });

  it('1x altında bekleme uzar; 2,5 sn tavan hızla ölçeklenir (tavan / hız)', () => {
    const cfg = layout.animation.turnWait;
    const T = 200;
    expect(waitMs(1, T, cfg, 0.5, false)).toBe(waitMs(1, T, cfg, 1, false) * 2);
    expect(waitMs(1000, T, cfg, 0.25, false)).toBe(cfg.maxMs * 4);
    expect(waitMs(1000, T, cfg, 2, false)).toBe(cfg.maxMs / 2);
  });
});
