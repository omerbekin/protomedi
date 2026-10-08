import { describe, expect, it } from 'vitest';
import { MAIN_ITEMS, backTarget, backdropFor, campaignButtons, initialView, moveSelection } from '../src/game/main-menu-flow';

describe('ana menü akışı (taslak menu-flow.html, animasyon 1)', () => {
  it('ana menü: Play · Settings · Codex (bu sırayla; Multiplayer Play kartlarında)', () => {
    expect(MAIN_ITEMS.map((i) => i.label)).toEqual(['Play', 'Settings', 'Codex']);
  });

  it('Play: harita ~1,18 yaklaşır ve hafif kararır; Settings / Multiplayer: kararır ve bulanıklaşır; menü: sade', () => {
    expect(backdropFor('menu')).toEqual({ zoom: 1, dark: 0, blur: 0 });
    expect(backdropFor('play').zoom).toBeCloseTo(1.18);
    expect(backdropFor('play').blur).toBe(0);
    for (const v of ['settings', 'mp'] as const) {
      expect(backdropFor(v).dark).toBeGreaterThan(backdropFor('play').dark);
      expect(backdropFor(v).blur).toBeGreaterThan(0);
    }
  });

  it('klavye seçimi uçlarda sarar', () => {
    expect(moveSelection(0, -1, 4)).toBe(3);
    expect(moveSelection(3, 1, 4)).toBe(0);
    expect(moveSelection(1, 1, 4)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(0);
  });

  it('Back / Esc: menüde yok; kartlardan açılan Multiplayer kartlara, diğerleri menüye döner', () => {
    expect(backTarget('menu', null)).toBeNull();
    expect(backTarget('play', 'menu')).toBe('menu');
    expect(backTarget('settings', 'menu')).toBe('menu');
    expect(backTarget('mp', 'menu')).toBe('menu');
    expect(backTarget('mp', 'play')).toBe('play');
  });

  it('Campaign kartı: kayıt varsa Continue birincil; yoksa New birincil ve Load pasif', () => {
    expect(campaignButtons(true, true)).toEqual([
      { id: 'continue', label: 'Continue', primary: true, enabled: true },
      { id: 'new', label: 'New', primary: false, enabled: true },
      { id: 'load', label: 'Load', primary: false, enabled: true },
    ]);
    expect(campaignButtons(false, false)).toEqual([
      { id: 'new', label: 'New', primary: true, enabled: true },
      { id: 'load', label: 'Load', primary: false, enabled: false },
    ]);
  });

  it('dışarıdan açılış: Load Game / New Campaign penceresi Play kartlarının üstünde açılır', () => {
    expect(initialView(undefined, undefined)).toBe('menu');
    expect(initialView('load', undefined)).toBe('play');
    expect(initialView('new', 'settings')).toBe('play');
    expect(initialView(undefined, 'mp')).toBe('mp');
  });
});
