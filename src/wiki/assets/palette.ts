import type { Catalog, Swatch } from '../../gallery/catalog';
import { applyFilter, h, searchable, type SectionApi } from '../../gallery/dom';

/** Play ekranı kart görselleri (assets/cards; asıllar assets/source/cards): yeni dosya konunca kendiliğinden listelenir. */
const CARD_FILES = import.meta.glob('../../../assets/cards/*.{webp,png,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** Ana menü katmanlı sahnesi (assets/menu; asıllar assets/source/menu-layers; src/game/menu-backdrop.ts). */
const MENU_FILES = import.meta.glob('../../../assets/menu/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Görsel dosya grubu (küçük resim + dosya adı). */
function imageGroup(title: string, dir: string, files: Record<string, string>, w: number, hgt: number, tag: string): HTMLElement {
  return h(
    'div',
    { class: 'group' },
    h('div', { class: 'group-head' }, h('h3', { text: title }), h('span', { class: 'muted small', text: `${Object.keys(files).length}` })),
    h(
      'div',
      { class: 'swatches' },
      ...Object.entries(files).map(([path, url]) => {
        const name = path.split('/').pop() ?? path;
        return searchable(
          h('div', { class: 'swatch-card', title: `${dir}/${name}` }, h('img', { attrs: { src: url, alt: name, loading: 'lazy' }, style: { width: `${w}px`, height: `${hgt}px`, 'object-fit': 'contain', background: '#120c07' } }), h('span', { class: 'mono small muted', text: name })),
          `${tag} ${name}`,
        );
      }),
    ),
  );
}

/** UI / PALETTE: oyunda kullanılan renkler ve yazı tipleri. Altın tonları ve serif font ui-frame.ts'den (Phaser) tembel yüklenir. */
export function mountPalette(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'palette' } });
  const countEl = h('span', { class: 'count' });
  let query = '';

  const sw = (s: Swatch, group: string): HTMLElement =>
    searchable(
      h('button', { class: 'swatch-card', attrs: { type: 'button' }, title: `${s.name} ${s.hex} (click to copy)`, on: { click: () => void navigator.clipboard?.writeText(s.hex).catch(() => undefined) } }, h('span', { class: 'swatch big', style: { background: s.hex } }), h('span', { class: 'small', text: s.name }), h('span', { class: 'mono small muted', text: s.hex })),
      `${group} ${s.name} ${s.hex}`,
    );
  const block = (title: string, list: Swatch[], group: string): HTMLElement => h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: title }), h('span', { class: 'muted small', text: `${list.length}` })), h('div', { class: 'swatches' }, ...list.map((s) => sw(s, group))));

  const goldHost = h('div', { class: 'swatches' });
  const goldBlock = h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: 'Gold frame (src/game/ui-frame.ts)' })), goldHost);
  const fontHost = h('div', { class: 'fonts' });

  const body = h(
    'div',
    {},
    block('Interface colors (data/battle-layout.json)', cat.palette.ui, 'ui layout'),
    block('Elements', cat.palette.element, 'element'),
    block('Stats', cat.palette.stat, 'stat'),
    block('Class and summon colors', cat.palette.classes, 'class color'),
    goldBlock,
    imageGroup('Play screen card art (assets/cards)', 'assets/cards', CARD_FILES, 120, 180, 'card art menu play'),
    imageGroup('Main menu scene: parallax layers and effects sheet (assets/menu)', 'assets/menu', MENU_FILES, 258, 108, 'main menu scene layer parallax effects'),
    h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: 'Fonts' })), fontHost),
  );
  root.append(h('div', { class: 'section-head' }, h('h2', { text: 'Palette & UI' }), countEl, h('span', { class: 'muted small', text: 'Click a swatch to copy its hex' })), body);

  // Gold tones and serif font: loaded lazily when the section comes close (pulls in the Phaser chunk)
  new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    obs.disconnect();
    void import('../../game/ui-frame').then(({ GOLD, SERIF }) => {
      const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
      goldHost.append(...Object.entries(GOLD).map(([name, v]) => sw({ name, hex: hex(v) }, 'gold frame')));
      fontHost.append(
        searchable(h('div', { class: 'font-card' }, h('div', { class: 'small muted', text: 'Serif (SERIF): class names, headings' }), h('div', { class: 'font-sample', style: { 'font-family': SERIF }, text: 'Paladin - Warrior - Treant 0123456789' }), h('div', { class: 'mono small muted', text: SERIF })), 'font serif heading'),
        searchable(h('div', { class: 'font-card' }, h('div', { class: 'small muted', text: 'System sans (menus, debug)' }), h('div', { class: 'font-sample', style: { 'font-family': 'system-ui, sans-serif' }, text: 'Fireball - Rejuvenate - Meteor 0123456789' }), h('div', { class: 'mono small muted', text: 'system-ui, sans-serif' })), 'font system sans menu'),
      );
      refresh();
    });
  }).observe(root);

  const refresh = (): number => {
    const n = applyFilter(body, query);
    countEl.textContent = `${n}`;
    return n;
  };
  return {
    id: 'palette',
    title: 'Palette & UI',
    total: cat.palette.ui.length + cat.palette.element.length + cat.palette.stat.length + cat.palette.classes.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
