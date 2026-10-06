import { iconUrl } from '../ui/dom-icons';
import type { Catalog } from './catalog';
import { applyFilter, h, searchable, type SectionApi } from './dom';

/** STATUSES & GROUNDS: data/statuses.json ve data/grounds.json görselleri (ikon, renk, açıklama, kullanan skill'ler). */
export function mountStatuses(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'statuses' } });
  const countEl = h('span', { class: 'count' });
  let query = '';

  const users = (list: Array<{ name: string }>): HTMLElement => (list.length ? h('div', { class: 'small muted', text: `Used by: ${list.map((u) => u.name).join(', ')}` }) : h('div', { class: 'small muted', text: 'Not used by any skill' }));

  const statusGrid = h('div', { class: 'cards' });
  for (const s of cat.statuses)
    statusGrid.append(
      searchable(
        h(
          'article',
          { class: 'card' },
          h('div', { class: 'row' },
            h('img', { class: 'icon48 pixelated', attrs: { src: iconUrl(s.icon, s.color), alt: s.icon } }),
            h('div', { class: 'grow' }, h('div', { class: 'card-title', text: s.name, style: { color: s.color } }), h('div', { class: 'small row' }, h('span', { class: 'swatch', style: { background: s.color } }), h('span', { class: 'mono', text: s.color }))),
            h('span', { class: `badge ${s.type === 'buff' ? 'ok' : 'bad'}`, text: s.type })),
          h('div', { class: 'small', text: s.text }),
          h('div', { class: 'small muted mono', text: `id ${s.id} - icon ${s.icon}` }),
          users(s.usedBy),
        ),
        `status ${s.id} ${s.name} ${s.type} ${s.text} ${s.icon} ${s.usedBy.map((u) => u.name).join(' ')}`,
      ),
    );

  const groundGrid = h('div', { class: 'cards' });
  for (const g of cat.grounds)
    groundGrid.append(
      searchable(
        h(
          'article',
          { class: 'card' },
          h('div', { class: 'row' },
            h('img', { class: 'icon48 pixelated', attrs: { src: iconUrl(g.icon, g.color), alt: g.icon } }),
            h('div', { class: 'grow' }, h('div', { class: 'card-title', text: g.name, style: { color: g.color } }), h('div', { class: 'small row' }, h('span', { class: 'swatch', style: { background: g.color } }), h('span', { class: 'mono', text: g.color }))),
            h('span', { class: 'badge', text: g.element })),
          h('div', { class: 'small muted mono', text: `id ${g.id} - icon ${g.icon}` }),
          users(g.usedBy),
        ),
        `ground ${g.id} ${g.name} ${g.element} ${g.icon} ${g.usedBy.map((u) => u.name).join(' ')}`,
      ),
    );

  const total = cat.statuses.length + cat.grounds.length;
  const body = h('div', {}, h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: `Statuses (${cat.statuses.length})` })), statusGrid), h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: `Grounds (${cat.grounds.length})` })), groundGrid));
  root.append(h('div', { class: 'section-head' }, h('h2', { text: 'Statuses & Grounds' }), countEl, h('span', { class: 'muted small', text: 'data/statuses.json, data/grounds.json' })), body);

  const refresh = (): number => {
    const n = applyFilter(body, query);
    countEl.textContent = `${n} / ${total}`;
    return n;
  };
  return {
    id: 'statuses',
    title: 'Statuses & Grounds',
    total,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
