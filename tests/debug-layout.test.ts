import { describe, expect, it, vi } from 'vitest';
import { ICON_KINDS, isIconKind } from '../src/ui/icon-kinds';
import {
  DOCK_GROUPS,
  DOCK_HINT,
  SHORT_MAX_WORDS,
  dockBadge,
  dockTooltip,
  labelBase,
  wordCount,
} from '../src/ui/debug-layout';
import { DEBUG_TABS, registerDebugTools } from '../src/ui/debug-tools';
import type { DebugAction, DebugPanel } from '../src/ui/debug-menu';

// BattleScene Phaser ister (node'da yok): yalnızca statik alanları kullanılır
vi.mock('../src/game/scenes/BattleScene', () => ({ BattleScene: { KEY: 'BattleScene', freeMp: false } }));

const actions: DebugAction[] = [];
const panels: DebugPanel[] = [];
const fakeMenu = {
  register: (a: DebugAction) => void actions.push(a),
  registerPanel: (p: DebugPanel) => void panels.push(p),
  registerInfo: () => undefined,
  openTab: () => undefined,
  refresh: () => undefined,
};
const fakeGame = { scene: { isActive: () => false, getScene: () => null } };
registerDebugTools({ game: fakeGame as never, debug: fakeMenu as never });

const text = (v: string | (() => string)): string => (typeof v === 'function' ? v() : v);

describe('debug menüsü: bölümlü yapı', () => {
  it('her eylemin kimliği tekil, sekmesi, bölümü ve etiketi dolu', () => {
    expect(actions.length).toBeGreaterThan(20);
    expect(new Set(actions.map((a) => a.id)).size).toBe(actions.length);
    for (const a of actions) {
      expect(a.tab, a.id).toBeTruthy();
      expect(a.section, a.id).toBeTruthy();
      expect(text(a.label).trim(), a.id).not.toBe('');
      // sekmesi olan eylem tanınan bir sekmede olmalı (dockOnly: kısayol hedefi de sekmedir)
      expect(DEBUG_TABS, a.id).toContain(a.tab);
    }
  });

  it('her sekme en az bir eylem ya da panel içerir (Info hariç: bilgi paneli)', () => {
    for (const tab of DEBUG_TABS) {
      if (tab === 'Info') continue;
      const has = actions.some((a) => !a.dockOnly && a.tab === tab) || panels.some((p) => p.tab === tab);
      expect(has, tab).toBe(true);
    }
  });

  it('dock düğmeleri: bilinen bölümde, ikonu geçerli, kısa yazısı 1-3 kelime, açıklaması (hint) var', () => {
    const docked = actions.filter((a) => a.dock);
    expect(docked.length).toBeGreaterThan(20);
    for (const a of docked) {
      const d = a.dock!;
      expect(DOCK_GROUPS as readonly string[], a.id).toContain(d.group);
      expect(d.short.trim(), a.id).not.toBe('');
      expect(wordCount(d.short), `${a.id} kısa yazı`).toBeLessThanOrEqual(SHORT_MAX_WORDS);
      expect(a.hint, `${a.id} hint`).toBeTruthy();
      if (typeof d.icon === 'string') expect(isIconKind(d.icon), `${a.id} ikon ${d.icon}`).toBe(true);
    }
  });

  it('her dock bölümünde en az bir düğme var; bölüm içinde sıra numaraları tekil', () => {
    for (const g of DOCK_GROUPS) {
      const inGroup = actions.filter((a) => a.dock?.group === g);
      // "View" bölümünün See-through/Side düğmeleri DebugMenu içinde kayıtlıdır (DOM gerekir), buradaki sayım yine > 0
      expect(inGroup.length, g).toBeGreaterThan(0);
      const orders = inGroup.map((a) => a.dock!.order);
      expect(new Set(orders).size, `${g} sıraları`).toBe(orders.length);
    }
  });

  it('aynı eylem iki yerde farklı adla görünmez: dock kısa yazısı etiketin başı ile aynı', () => {
    for (const a of actions.filter((x) => x.dock)) {
      const base = labelBase(text(a.label));
      const short = a.dock!.short;
      // Döngü düğmeleri ("Speed: 1x") ve kısayollar ("Info") aynı kökü taşır
      expect(base.toLowerCase(), a.id).toBe(short.toLowerCase());
    }
  });

  it('açık/kapalı (toggle) dock düğmeleri ON/OFF rozeti, döngü düğmeleri değer rozeti gösterir', () => {
    for (const a of actions.filter((x) => x.dock?.on)) {
      const d = a.dock!;
      const badge = dockBadge(d.on!(), d.state?.());
      expect(badge, a.id).not.toBeNull();
      if (!d.state) expect(['ON', 'OFF'], a.id).toContain(badge!.text);
    }
    const speed = actions.find((a) => a.id === 'tweak.speed-cycle')!;
    expect(dockBadge(speed.dock!.on!(), speed.dock!.state!())).toEqual({ text: '1x', kind: 'val' });
  });

  it('Tools bölümünde "Copy match data" düğmesi var (maç kaydı panoya): ikon + kısa yazı + açıklama', () => {
    const a = actions.find((x) => x.id === 'tools.copy-match')!;
    expect(a).toBeTruthy();
    expect(a.dock).toMatchObject({ group: 'Tools', icon: 'clipboard', short: 'Copy match data' });
    expect(a.hint).toMatch(/clipboard/i);
    expect(wordCount(a.dock!.short)).toBeLessThanOrEqual(SHORT_MAX_WORDS);
  });

  it('Sounds sekmesinde başta "Open Asset Gallery" paneli var', () => {
    const soundPanels = panels.filter((p) => p.tab === 'Sounds');
    expect(soundPanels.length).toBeGreaterThanOrEqual(2);
    expect(soundPanels[0]!.id).toBe('panel.asset-gallery-link');
  });

  it('eylem etiketi ve dock kısayolları ikon listesiyle tutarlı (yeni ikonlar kayıtlı)', () => {
    for (const k of ['restart', 'eye', 'swap', 'info', 'frame', 'clipboard']) expect(ICON_KINDS as readonly string[]).toContain(k);
  });
});

describe('debug-layout yardımcıları', () => {
  it('dockBadge', () => {
    expect(dockBadge(true, undefined)).toEqual({ text: 'ON', kind: 'on' });
    expect(dockBadge(false, undefined)).toEqual({ text: 'OFF', kind: 'off' });
    expect(dockBadge(undefined, undefined)).toBeNull();
    expect(dockBadge(true, '2x')).toEqual({ text: '2x', kind: 'val' });
  });

  it('dockTooltip: bir cümle + durum', () => {
    expect(dockTooltip('Pause', 'Freeze everything', { text: 'ON', kind: 'on' })).toBe('Pause: Freeze everything. Now: ON');
    expect(dockTooltip('Info', undefined, null)).toBe('Info');
    expect(dockTooltip('A', 'Does a thing.', null)).toBe('A: Does a thing.');
  });

  it('labelBase / wordCount / ipucu çubuğu', () => {
    expect(labelBase('Skip anims: on')).toBe('Skip anims');
    expect(labelBase('Team select')).toBe('Team select');
    expect(wordCount('  Clear all cooldowns ')).toBe(3);
    expect(DOCK_HINT).toBe('Hover a button for details');
  });

  it('Test AOE shapes: Battle flow bölümünde, ikonlu, kısa yazılı ve açıklamalı hızlı düğme (Geometer test savaşı)', () => {
    const a = actions.find((x) => x.id === 'battle.test-aoe')!;
    expect(a).toBeDefined();
    expect(a.dock!.group).toBe('Battle flow');
    expect(a.dock!.short).toBe('Test AOE shapes');
    expect(isIconKind(a.dock!.icon as string)).toBe(true);
    expect(a.hint).toMatch(/Geometer/);
  });
});
