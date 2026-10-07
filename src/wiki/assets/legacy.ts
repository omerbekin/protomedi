import { applyFilter, chipBar, h, openLightbox, searchable, type SectionApi } from '../../gallery/dom';
import type { Catalog } from '../../gallery/catalog';
import { iconUrl } from '../../ui/dom-icons';
import type { LegacyCatalog, LegacyItem } from './legacy-catalog';
import { playSound } from './sounds';

/** LEGACY: kullanılmayan / yedek / eski her şey (sprites_old, konseptler, yedek ikon-animasyon-ses) ve neden legacy olduğu. Katalog: legacy-catalog.ts. */
export function mountLegacy(_cat: Catalog, legacy: LegacyCatalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'legacy' } });
  const countEl = h('span', { class: 'count' });
  let query = '';
  let group = '';

  const card = (i: LegacyItem): HTMLElement => {
    const visual: HTMLElement | null =
      i.kind === 'icon'
        ? h('img', { class: 'bigicon pixelated', attrs: { src: iconUrl(i.id, '#e8c47e'), alt: i.id }, title: 'Click to enlarge', on: { click: () => openLightbox(iconUrl(i.id, '#e8c47e'), i.id, true) } })
        : i.url
          ? h('img', { class: 'legacy-img', attrs: { src: i.url, alt: i.label, loading: 'lazy' }, title: `${i.label} (click to enlarge)`, on: { click: () => openLightbox(i.url!, i.label) } })
          : null;
    const card: HTMLElement = h('article', { class: `card legacy spare${i.kind === 'icon' ? ' icon-card' : ''}` },
      h('div', { class: 'row' },
        i.kind === 'sound' ? h('button', { class: 'play', text: '▶', title: `Play ${i.id}`, attrs: { type: 'button', 'aria-label': `Play ${i.label}` }, on: { click: () => playSound(i.id, card) } }) : null,
        h('div', { class: 'grow' }, h('div', { class: 'card-title', text: i.label }), h('div', { class: 'muted small mono', text: i.note }))),
      visual,
      h('div', {}, h('span', { class: 'why', text: i.why })));
    return searchable(card, i.search, i.kind);
  };

  const body = h('div');
  for (const g of legacy.groups) {
    const grid = h('div', { class: `cards${g.kind === 'icon' || g.kind === 'vfx' || g.kind === 'sound' ? ' small-cards' : ''}` }, ...g.items.map(card));
    body.append(h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: g.title }), h('span', { class: 'muted small', text: String(g.items.length) })), h('p', { class: 'note', text: g.note }), grid));
  }

  const chips = chipBar([{ value: '', label: 'All' }, ...legacy.groups.map((g) => ({ value: g.kind, label: `${g.title} (${g.items.length})` }))], (v) => {
    group = v;
    refresh();
  });

  const refresh = (): number => {
    const n = applyFilter(body, query, group);
    countEl.textContent = `${n} / ${legacy.total}`;
    return n;
  };

  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Legacy' }), countEl, h('span', { class: 'muted small', text: 'Old, spare and unused things. Derived from the asset folders and game data; nothing is listed by hand.' })),
    chips,
    legacy.total ? body : h('p', { class: 'muted', text: 'Nothing is legacy right now.' }),
  );

  return {
    id: 'legacy',
    title: 'Legacy',
    total: legacy.total,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
