import { iconUrl } from '../../ui/dom-icons';
import { itemIconUrl } from '../../ui/item-icon-dom';
import itemsJson from '../../../data/items.json';
import type { Catalog, IconEntry } from '../../gallery/catalog';
import { applyFilter, chipBar, h, isolateKeys, openLightbox, searchable, type SectionApi } from '../../gallery/dom';

const CATEGORY_LABEL: Record<IconEntry['category'], string> = {
  skill: 'Skill',
  logo: 'Class logo',
  passive: 'Passive',
  stat: 'Stat',
  status: 'Status',
  ground: 'Ground',
  ui: 'UI',
  spare: 'Spare',
};

/** ICONS: tüm piksel ikonlar (ICON_KINDS) + efekt sprite'ları (pixel-fx); zoom, kullanım yerleri, yedek etiketi. */
export function mountIcons(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'icons' } });
  const countEl = h('span', { class: 'count' });
  let query = '';
  let group = '';

  const zoom = h('input', { class: 'range', attrs: { type: 'range', min: '32', max: '256', step: '16', value: '96' } });
  const zoomLabel = h('span', { class: 'small', text: 'Zoom 96px' });
  const setZoom = (): void => {
    root.style.setProperty('--icon-size', `${zoom.value}px`);
    zoomLabel.textContent = `Zoom ${zoom.value}px`;
  };
  zoom.addEventListener('input', setZoom);
  isolateKeys(zoom);
  setZoom();

  const cats = ['skill', 'logo', 'passive', 'stat', 'status', 'ground', 'ui', 'spare'] as const;
  const counts = new Map<string, number>();
  for (const i of cat.icons) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const chips = chipBar(
    [{ value: '', label: 'All' }, ...cats.filter((c) => counts.has(c)).map((c) => ({ value: c, label: `${CATEGORY_LABEL[c]} (${counts.get(c)})` }))],
    (v) => {
      group = v;
      refresh();
    },
  );

  const iconCard = (i: IconEntry): HTMLElement => {
    const url = iconUrl(i.name, i.accent);
    const shown = i.uses.slice(0, 4);
    const rest = i.uses.length - shown.length;
    return searchable(
      h(
        'article',
        { class: `card icon-card${i.category === 'spare' ? ' spare' : ''}` },
        h('img', { class: 'bigicon pixelated', attrs: { src: url, alt: i.name }, title: 'Click to enlarge', on: { click: () => openLightbox(url, i.name, true) } }),
        h('div', { class: 'card-title mono', text: i.name }),
        h('div', { class: 'tags' }, i.category === 'spare' ? h('span', { class: 'badge', text: 'spare' }) : h('span', { class: 'badge ok', text: CATEGORY_LABEL[i.category] }), ...[...new Set(i.uses.map((u) => u.kind))].filter((k) => k !== i.category).map((k) => h('span', { class: 'badge', text: CATEGORY_LABEL[k] }))),
        i.uses.length
          ? h('div', { class: 'small muted', title: i.uses.map((u) => u.label).join('\n') }, shown.map((u) => u.label).join(', ') + (rest > 0 ? ` +${rest} more` : ''))
          : h('div', { class: 'small muted', text: 'Not referenced by any skill/class/stat/status. Spare icon or effect sprite.' }),
      ),
      `${i.name} ${CATEGORY_LABEL[i.category]} ${i.uses.map((u) => `${u.kind} ${u.label}`).join(' ')} ${i.category === 'spare' ? 'spare backup unused' : ''}`,
      i.category,
    );
  };

  const grid = h('div', { class: 'cards icons' }, ...cat.icons.map(iconCard));
  const fx = h('div', { class: 'cards icons' });
  for (const name of cat.fxSprites) {
    const url = iconUrl(name, '#e8c47e');
    fx.append(searchable(h('article', { class: 'card icon-card' }, h('img', { class: 'bigicon pixelated', attrs: { src: url, alt: name }, title: 'Click to enlarge', on: { click: () => openLightbox(url, name, true) } }), h('div', { class: 'card-title mono', text: name }), h('div', { class: 'small muted', text: 'effect sprite (src/game/pixel-fx.ts)' })), `fx effect sprite ${name}`));
  }

  // Item ve ödül ikonları (src/game/item-icons.ts; Gear, Spoils, Endless kartları ve Codex aynı çizimi kullanır)
  const rare = itemsJson.rarities.find((r) => r.id === 'rare')?.color ?? '#3f6fa8';
  const items = h('div', { class: 'cards icons' });
  for (const i of cat.itemIcons) {
    const url = itemIconUrl(i.name, i.group === 'item' ? rare : undefined);
    const shown = i.uses.slice(0, 4);
    const rest = i.uses.length - shown.length;
    items.append(
      searchable(
        h(
          'article',
          { class: 'card icon-card' },
          h('img', { class: 'bigicon pixelated', attrs: { src: url, alt: i.name }, title: 'Click to enlarge', on: { click: () => openLightbox(url, i.name, true) } }),
          h('div', { class: 'card-title mono', text: i.name }),
          h('div', { class: 'tags' }, h('span', { class: 'badge ok', text: i.group === 'reward' ? 'Reward' : 'Item' })),
          h('div', { class: 'small muted', text: i.label }),
          h('div', { class: 'small muted', title: i.uses.join('\n') }, shown.join(', ') + (rest > 0 ? ` +${rest} more` : '')),
        ),
        `item reward ${i.name} ${i.label} ${i.uses.join(' ')}`,
      ),
    );
  }
  // Nadirlik: aynı nesne, yalnızca taş / kenar ayrıntısı nadirlik renginde
  const tints = h('div', { class: 'cards icons' });
  for (const name of ['amulet', 'sword', 'mail']) {
    for (const r of itemsJson.rarities) {
      const url = itemIconUrl(name, r.color);
      tints.append(searchable(h('article', { class: 'card icon-card' }, h('img', { class: 'bigicon pixelated', attrs: { src: url, alt: `${name} ${r.name}` }, on: { click: () => openLightbox(url, `${name} (${r.name})`, true) } }), h('div', { class: 'card-title mono', text: name }), h('div', { class: 'small', style: { color: r.color }, text: r.name })), `item rarity ${name} ${r.name}`));
    }
  }

  const refresh = (): number => {
    const n = applyFilter(grid, query, group);
    applyFilter(fx, query);
    applyFilter(items, query);
    applyFilter(tints, query);
    countEl.textContent = `${n} / ${cat.icons.length}`;
    return n;
  };

  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Icons' }), countEl, h('span', { class: 'muted small', text: 'src/ui/icon-kinds.ts, drawn by the pixel art engine' })),
    h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, zoomLabel, zoom)),
    chips,
    grid,
    h('h3', { class: 'sub', text: `Items and rewards (${cat.itemIcons.length})` }),
    h('p', { class: 'note', text: 'Gear, Spoils, Endless reward cards and the Codex all draw these (src/game/item-icons.ts). Items show with the Rare tint here.' }),
    items,
    h('h3', { class: 'sub', text: 'Rarity tints' }),
    h('p', { class: 'note', text: 'Rarity colours only the gem, trim or band; the object keeps its own materials.' }),
    tints,
    h('h3', { class: 'sub', text: `Effect sprites (${cat.fxSprites.length})` }),
    h('p', { class: 'note', text: 'Small sprites that animations draw with (not icons).' }),
    fx,
  );

  return {
    id: 'icons',
    title: 'Icons',
    total: cat.icons.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
