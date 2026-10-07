import { describe, expect, it, vi } from 'vitest';
import { ICON_KINDS, isIconKind } from '../src/ui/icon-kinds';
import {
  DOCK_GROUPS,
  DOCK_HINT,
  DEFAULT_ACTION_ICON,
  QUICK_TAB,
  SECTION_ICONS,
  SHORT_MAX_WORDS,
  TAB_ICONS,
  labelBadge,
  dockBadge,
  dockTooltip,
  labelBase,
  wordCount,
} from '../src/ui/debug-layout';
import { DEBUG_INFO_TAB, DEBUG_TABS, registerDebugTools } from '../src/ui/debug-tools';
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
  onTabOpen: () => undefined,
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

  it('her sekme en az bir eylem ya da panel içerir (Quick hariç: o, dock alanı olan eylemlerden türer)', () => {
    for (const tab of DEBUG_TABS.filter((t) => t !== QUICK_TAB)) {
      const has = actions.some((a) => !a.dockOnly && a.tab === tab) || panels.some((p) => p.tab === tab);
      expect(has, tab).toBe(true);
    }
  });

  it('dock düğmeleri: bilinen bölümde, ikonu geçerli, kısa yazısı 1-3 kelime, açıklaması (hint) var', () => {
    const docked = actions.filter((a) => a.dock);
    expect(docked.length).toBeGreaterThan(14);
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
    expect(a.tab).toBe('Data');
    expect(a.hint).toMatch(/clipboard/i);
    expect(wordCount(a.dock!.short)).toBeLessThanOrEqual(SHORT_MAX_WORDS);
  });

  it('wikide bulunan bilgi/galeri öğeleri debug menüsünde yok (Sounds sekmesi, assets/wiki düğmeleri, ses listesi)', () => {
    expect(DEBUG_TABS).not.toContain('Sounds');
    expect(DEBUG_TABS).toEqual(['Quick', 'Battle', 'Unit', 'Skills', 'Rolls', 'Speed & View', 'Setup', 'Campaign', 'Test Mode', 'Characters', 'Versions', 'Data']);
    expect(DEBUG_INFO_TAB).toBe('Data');
    const ids = [...actions.map((a) => a.id), ...panels.map((p) => p.id)];
    for (const gone of ['tools.sounds', 'tools.assets-wiki', 'ui.wiki', 'panel.sounds', 'panel.assets-wiki-link']) expect(ids, gone).not.toContain(gone);
    expect(panels.some((p) => p.tab === 'Sounds')).toBe(false);
    expect(actions.some((a) => a.tab === 'Sounds')).toBe(false);
  });

  it('Skills sekmesi yalnızca savaşı değiştiren cast aracıdır; dock kısayolu "Cast skill"', () => {
    expect(panels.some((p) => p.id === 'panel.gallery' && p.tab === 'Skills')).toBe(true);
    const a = actions.find((x) => x.id === 'tools.skills')!;
    expect(a.dock).toMatchObject({ group: 'Tools', short: 'Cast skill' });
  });

  it('eylem etiketi ve dock kısayolları ikon listesiyle tutarlı (yeni ikonlar kayıtlı)', () => {
    for (const k of ['restart', 'eye', 'swap', 'info', 'frame', 'clipboard', 'speaker']) expect(ICON_KINDS as readonly string[]).toContain(k);
  });
});

describe('debug menüsü: toparlanmış düzen', () => {
  it("hızlı düğme dock'u en sık kullanılanlarla sınırlı", () => {
    expect(DOCK_GROUPS).toEqual(['Battle', 'Rolls', 'Speed & View', 'Tools']);
    // Speed & View dock'una See-through/Side DebugMenu içinde (DOM) eklenir: burada 3 hız düğmesi
    expect(actions.filter((a) => a.dock).length).toBeLessThanOrEqual(20);
  });

  it('aynı sekmede aynı etiketli iki eylem yok (tekrar/ölü girdi yok); dockOnly yalnızca kısayol ve döngü düğmeleri', () => {
    const seen = new Set<string>();
    for (const a of actions.filter((x) => !x.dockOnly)) {
      const key = `${a.tab}|${text(a.label).split(':')[0]}`;
      if (a.id.startsWith('tweak.speed.') || a.id.startsWith('tweak.damage.') || /^tweak\.(crit|dodge|miss)\./.test(a.id)) continue; // değer düğmeleri
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    for (const a of actions.filter((x) => x.dockOnly)) expect(a.dock, a.id).toBeTruthy();
  });

  it('gruplar: Rolls (hasar/kritik/kaçınma/iska), Speed & View, Setup (takım/seed), Data (maç kaydı), Characters (görünüm varyantları)', () => {
    const inTab = (tab: string): string[] => actions.filter((a) => a.tab === tab).map((a) => a.id);
    for (const id of ['tweak.damage-ohk', 'tweak.crit.always', 'tweak.dodge.always', 'tweak.miss.always']) expect(inTab('Rolls'), id).toContain(id);
    for (const id of ['tweak.speed-cycle', 'tweak.skip', 'tweak.pause', 'tweak.numbers', 'battle.slots', 'screen.fps', 'screen.portrait', 'tools.fullscreen']) expect(inTab('Speed & View'), id).toContain(id);
    for (const id of ['battle.random', 'battle.restart-same', 'battle.rematch', 'scene.team-select', 'mode.toggle', 'battle.test-aoe', 'battle.test-cutthroat']) expect(inTab('Setup'), id).toContain(id);
    expect(panels.some((p) => p.id === 'panel.seed' && p.tab === 'Setup')).toBe(true);
    expect(inTab('Data')).toContain('tools.copy-match');
    expect(panels.some((p) => p.id === 'panel.characters' && p.tab === 'Characters')).toBe(true);
    for (const id of ['unit.heal-team', 'unit.heal-enemies', 'unit.revive-all', 'unit.kill-enemies', 'unit.kill-party', 'unit.clear-cooldowns', 'battle.skip-turn', 'battle.autoplay', 'battle.free-mp', 'tweak.enemy-ai', 'tools.result-victory', 'tools.result-defeat']) expect(inTab('Battle'), id).toContain(id);
  });
});

describe('debug menüsü: tek yapı (sekmeler + ikonlu düğmeler)', () => {
  it('her düğmenin geçerli bir ikonu var (dock ikonu ya da icon); yedek ikon da geçerli', () => {
    expect(isIconKind(DEFAULT_ACTION_ICON)).toBe(true);
    for (const a of actions) {
      const ic = a.dock ? (typeof a.dock.icon === 'string' ? a.dock.icon : 'next') : a.icon;
      expect(ic, `${a.id} ikonu`).toBeTruthy();
      expect(isIconKind(ic!), `${a.id} ikon ${ic}`).toBe(true);
    }
  });

  it('her sekmenin ve bölüm başlığının ikonu geçerli; ayrı yazı-düğme grubu/dock yok (ilk sekme Quick)', () => {
    expect(DEBUG_TABS[0]).toBe(QUICK_TAB);
    for (const t of DEBUG_TABS) expect(isIconKind(TAB_ICONS[t] ?? ''), `sekme ${t}`).toBe(true);
    for (const [name, ic] of Object.entries(SECTION_ICONS)) expect(isIconKind(ic), `bölüm ${name}`).toBe(true);
  });

  it('labelBadge: "Etiket: on/off/değer" -> rozet; iki nokta yoksa rozet yok', () => {
    expect(labelBadge('Skip anims: on')).toEqual({ text: 'ON', kind: 'on' });
    expect(labelBadge('Free MP: off')).toEqual({ text: 'OFF', kind: 'off' });
    expect(labelBadge('Rotate view: auto')).toEqual({ text: 'auto', kind: 'val' });
    expect(labelBadge('Always crit')).toBeNull();
    expect(labelBadge('2x')).toBeNull();
  });

  it('Test Mode sekmesi: Enable + 3 anahtar (MP, Rage, cooldown) + takım seçici paneli', () => {
    const ids = actions.filter((a) => a.tab === 'Test Mode').map((a) => a.id);
    for (const id of ['test.enable', 'test.unlimited-mp', 'test.unlimited-rage', 'test.no-cooldowns']) expect(ids, id).toContain(id);
    expect(panels.some((p) => p.id === 'panel.test-teams' && p.tab === 'Test Mode')).toBe(true);
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

  it('Test AOE shapes: Setup > Test battles bölümünde, açıklamalı (Geometer test savaşı)', () => {
    const a = actions.find((x) => x.id === 'battle.test-aoe')!;
    expect(a).toBeDefined();
    expect(a.tab).toBe('Setup');
    expect(a.section).toBe('Test battles');
    expect(a.hint).toMatch(/Geometer/);
  });
});
