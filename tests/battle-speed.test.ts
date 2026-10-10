import { describe, expect, it } from 'vitest';
import { BATTLE_SPEEDS, DEFAULT_SPEED, SPEED_STEPS, battleSpeedLabel, nearestSpeed, parseBattleSpeed, speedAt, speedIndex } from '../src/ui/battle-speed';
import { waitMs } from '../src/game/turn-wait';
import layout from '../data/battle-layout.json';

// Settings > Battle speed kaydırıcısı (Ömer 2026-10-10): 20 adım 0.25x-4x (1x çevresinde ince), eski kayıtlar en yakın adıma,
// bekleme = süre / hız (tavan da).
describe('Battle speed kaydırıcısı', () => {
  it('20 adım, 0.25x - 4x, artan; 1x içinde ve çevresinde ince (0.1), uçlarda kaba', () => {
    expect(SPEED_STEPS).toBe(20);
    expect(BATTLE_SPEEDS.length).toBe(21);
    expect(BATTLE_SPEEDS[0]).toBe(0.25);
    expect(BATTLE_SPEEDS.at(-1)).toBe(4);
    for (let i = 1; i < BATTLE_SPEEDS.length; i++) expect(BATTLE_SPEEDS[i]!).toBeGreaterThan(BATTLE_SPEEDS[i - 1]!);
    const one = BATTLE_SPEEDS.indexOf(1);
    expect(one).toBeGreaterThan(0);
    expect(BATTLE_SPEEDS[one - 1]).toBe(0.9);
    expect(BATTLE_SPEEDS[one + 1]).toBe(1.1);
    // oran adımı 1x çevresinde uçlardan küçük (logaritmik olarak ince)
    const ratio = (i: number) => BATTLE_SPEEDS[i + 1]! / BATTLE_SPEEDS[i]!;
    expect(ratio(one)).toBeLessThan(ratio(BATTLE_SPEEDS.length - 2));
    expect(ratio(one - 1)).toBeLessThan(ratio(0));
  });

  it('konum <-> hız gidiş-dönüş tutarlı; uçlar sınırda kalır; yazı', () => {
    BATTLE_SPEEDS.forEach((v, i) => {
      expect(speedIndex(v)).toBe(i);
      expect(speedAt(i)).toBe(v);
    });
    expect(speedAt(-3)).toBe(0.25);
    expect(speedAt(99)).toBe(4);
    expect(speedAt(8.6)).toBe(1); // en yakın konum (9 = 1x)
    expect(battleSpeedLabel(0.25)).toBe('0.25x');
    expect(battleSpeedLabel(1)).toBe('1x');
    expect(battleSpeedLabel(1.25)).toBe('1.25x');
  });

  it('kayıt göçü: eski 6 adımlı değerler (0.25 / 0.5 / 0.75 / 1 / 2 / 4) en yakın yeni adıma; bozuk / aralık dışı değer varsayılan 1x', () => {
    expect(parseBattleSpeed('0.25')).toBe(0.25);
    expect(parseBattleSpeed('0.5')).toBe(0.5);
    expect(parseBattleSpeed('0.75')).toBe(0.8); // logaritmik olarak 0.8'e daha yakın
    expect(parseBattleSpeed('1')).toBe(1);
    expect(parseBattleSpeed('2')).toBe(2);
    expect(parseBattleSpeed('4')).toBe(4);
    expect(parseBattleSpeed('3')).toBe(3);
    expect(parseBattleSpeed('1.3')).toBe(nearestSpeed(1.3));
    expect([1.25, 1.4]).toContain(parseBattleSpeed('1.3'));
    expect(parseBattleSpeed(null)).toBe(DEFAULT_SPEED);
    expect(parseBattleSpeed('')).toBe(1);
    expect(parseBattleSpeed('abc')).toBe(1);
    expect(parseBattleSpeed('0')).toBe(1);
    expect(parseBattleSpeed('99')).toBe(1);
  });

  it('1x altında bekleme uzar; 2,5 sn tavan hızla ölçeklenir (tavan / hız)', () => {
    const cfg = layout.animation.turnWait;
    const T = 200;
    expect(waitMs(1, T, cfg, 0.5, false)).toBe(waitMs(1, T, cfg, 1, false) * 2);
    expect(waitMs(1000, T, cfg, 0.25, false)).toBe(cfg.maxMs * 4);
    expect(waitMs(1000, T, cfg, 2, false)).toBe(cfg.maxMs / 2);
    expect(waitMs(1000, T, cfg, 1.25, false)).toBe(Math.round(cfg.maxMs / 1.25));
  });
});
