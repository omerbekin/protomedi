import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MENU_STYLE, menuStyleFromSearch } from '../src/ui/menu-style';

describe('menu style preview switch (src/ui/menu-style.ts)', () => {
  it('?menu=new shows the elegant style, ?menu=old the current one', () => {
    expect(menuStyleFromSearch('?menu=new')).toBe('elegant');
    expect(menuStyleFromSearch('?menu=elegant')).toBe('elegant');
    expect(menuStyleFromSearch('?menu=NEW&seed=1')).toBe('elegant');
    expect(menuStyleFromSearch('?menu=old', 'elegant')).toBe('classic');
    expect(menuStyleFromSearch('?menu=classic', 'elegant')).toBe('classic');
  });

  it('no or unknown parameter falls back to the default', () => {
    expect(menuStyleFromSearch('')).toBe(DEFAULT_MENU_STYLE);
    expect(menuStyleFromSearch('?menu=xyz')).toBe(DEFAULT_MENU_STYLE);
    expect(menuStyleFromSearch('', 'elegant')).toBe('elegant');
  });

  it('every @font-face in style.css points at a bundled local font file (works offline), latin and latin-ext', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'style.css'), 'utf8');
    const urls = [...css.matchAll(/@font-face\s*\{[^}]*url\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(urls.length).toBe(6);
    for (const u of urls) {
      expect(u.startsWith('../assets/fonts/')).toBe(true);
      expect(existsSync(join(__dirname, '..', 'src', u))).toBe(true);
    }
    for (const f of ['Cinzel', 'EBGaramond']) {
      expect(urls.some((u) => u.includes(`${f}-normal-latin.woff2`))).toBe(true);
      expect(urls.some((u) => u.includes(`${f}-normal-latin-ext.woff2`))).toBe(true);
    }
  });
});
