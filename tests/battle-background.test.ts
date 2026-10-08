import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { backgroundOffsetY, backgroundPool, battleBackground, pickBackground, poolIndex } from '../src/game/battle-background';

const has = (id: string) => ['webp', 'png', 'jpg'].some((e) => existsSync(`assets/backgrounds/${id}.${e}`));

describe('savaş arka planı havuzları', () => {
  it('Quick Battle: 3 Proving Grounds, multiplayer: 3 Duelling Ring; dosyaları var', () => {
    expect(backgroundPool('quick')).toEqual(['proving-grounds-sunny-afternoon', 'proving-grounds-sunset', 'proving-grounds-rain']);
    expect(backgroundPool('multiplayer')).toEqual(['duelling-ring-moon', 'duelling-ring-storm', 'duelling-ring-snow']);
    for (const id of [...backgroundPool('quick'), ...backgroundPool('multiplayer')]) expect(has(id), id).toBe(true);
  });
  it('seçim yalnızca seedden türer (iki oyuncu aynı seed = aynı arka plan) ve havuzun hepsi çıkar', () => {
    for (const seed of [1, 7, 123, 99999, -5]) expect(pickBackground('multiplayer', seed)).toBe(pickBackground('multiplayer', seed));
    const seen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) seen.add(poolIndex(seed, 3));
    expect(seen.size).toBe(3);
  });
  it('sefer kendi arka planını verir (varsa); yoksa savaşın varsayılanı; havuzda dosya yoksa varsayılan', () => {
    const exists = (id: string) => id !== 'missing';
    expect(battleBackground({ explicit: 'border-road', pool: null, seed: 3, fallback: 'castle-hall', exists })).toBe('border-road');
    expect(battleBackground({ explicit: 'missing', pool: null, seed: 3, fallback: 'castle-hall', exists })).toBe('castle-hall');
    expect(backgroundPool('quick')).toContain(battleBackground({ pool: 'quick', seed: 3, fallback: 'castle-hall', exists }));
    expect(battleBackground({ pool: 'quick', seed: 3, fallback: 'castle-hall', exists: () => false })).toBe('castle-hall');
  });
  it('dikey ofset verilmeyen arka planda 0', () => {
    expect(backgroundOffsetY('duelling-ring-storm')).toBe(0);
  });
});
