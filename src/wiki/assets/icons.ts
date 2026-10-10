import { iconUrl } from '../../ui/dom-icons';
import { statIconName, type StatIconKind } from '../../ui/stat-icons';
import { uiIconName, type UiIconKind } from '../../ui/ui-icons';
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
  // Item görselleri (assets/items/<id>.webp): görseli olan item'de piksel ikonun yerine geçer
  const art = h('div', { class: 'cards icons' });
  for (const a of cat.itemArt.art)
    art.append(
      searchable(
        h(
          'article',
          { class: 'card icon-card' },
          h('img', { class: 'bigicon', attrs: { src: a.url, alt: a.itemId, loading: 'lazy' }, title: 'Click to enlarge', on: { click: () => openLightbox(a.url, a.name || a.itemId, false) } }),
          h('div', { class: 'card-title mono', text: a.itemId }),
          h('div', { class: 'tags' }, h('span', { class: a.name ? 'badge ok' : 'badge', text: a.name ? 'Item art' : 'Unlinked' })),
          h('div', { class: 'small muted', text: a.name ? `${a.name} (${a.slot})` : 'no item with this id in data/items.json' }),
        ),
        `item art image ${a.itemId} ${a.name} ${a.slot}`,
      ),
    );

  // Boyalı stat ikonları (assets/stat-icons/<stat>.png): HUD, Gear, Endless, takım seçimi ve Codex'teki TÜM stat ikonları (tek kaynak statIconName)
  const stats = h('div', { class: 'cards icons' });
  for (const a of cat.statArt) {
    const url = a.url ? iconUrl(statIconName(a.stat as StatIconKind), a.color) : a.fallback ? iconUrl(a.fallback, a.color) : '';
    stats.append(
      searchable(
        h(
          'article',
          { class: 'card icon-card' },
          h('img', { class: a.url ? 'bigicon' : 'bigicon pixelated', attrs: { src: url, alt: a.stat, loading: 'lazy' }, title: 'Click to enlarge', on: { click: () => openLightbox(url, a.label, !a.url) } }),
          h('div', { class: 'card-title mono', text: a.stat }),
          h('div', { class: 'tags' }, h('span', { class: a.unlinked ? 'badge' : a.url ? 'badge ok' : 'badge', text: a.unlinked ? 'Unlinked' : a.url ? 'Stat art' : 'Pixel fallback' })),
          h('div', { class: 'small', style: { color: a.color }, text: a.label }),
          h('div', { class: 'small muted', text: a.unlinked ? 'no stat with this name' : a.url ? `fallback: ${a.fallback}` : 'no image yet: code-drawn icon' }),
        ),
        `stat art image ${a.stat} ${a.label}`,
      ),
    );
  }

  // Boyalı arayüz ikonları (assets/ui-icons/<ad>.png): Rest / Skip / Move, cooldown, Rage, Lucky Escape, Combat log, altın, torba, Gear, Formation...
  const uis = h('div', { class: 'cards icons' });
  for (const a of cat.uiArt) {
    const url = a.url ? iconUrl(uiIconName(a.name as UiIconKind)) : a.fallback ? iconUrl(a.fallback, '#e8c47e') : '';
    uis.append(
      searchable(
        h(
          'article',
          { class: 'card icon-card' },
          url ? h('img', { class: a.url ? 'bigicon' : 'bigicon pixelated', attrs: { src: url, alt: a.name, loading: 'lazy' }, title: 'Click to enlarge', on: { click: () => openLightbox(url, a.name, !a.url) } }) : h('div', { class: 'bigicon' }),
          h('div', { class: 'card-title mono', text: a.name }),
          h('div', { class: 'tags' }, h('span', { class: a.unlinked ? 'badge' : a.url ? 'badge ok' : 'badge', text: a.unlinked ? 'Unlinked' : a.url ? 'UI art' : a.fallback ? 'Pixel fallback' : 'No icon' })),
          h('div', { class: 'small', text: a.label }),
          h('div', { class: 'small muted', text: a.unlinked ? 'no UI icon with this name' : a.url ? (a.fallback ? `fallback: ${a.fallback}` : 'no fallback: hidden without the image') : 'no image yet' }),
        ),
        `ui art image ${a.name} ${a.label}`,
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
    applyFilter(art, query);
    applyFilter(stats, query);
    applyFilter(uis, query);
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
    h('h3', { class: 'sub', text: `Stat icons (${cat.statArt.filter((a) => a.url).length} / ${cat.statArt.filter((a) => !a.unlinked).length})` }),
    h('p', { class: 'note', text: 'Painted stat icons (assets/stat-icons, cut by tools/make-stat-icons.mjs from assets/source/stat-icons). The battle HUD, Gear, Endless cards, team select and the Codex all show these; a stat without an image falls back to its pixel icon (Stat chip above).' }),
    stats,
    h('h3', { class: 'sub', text: `UI icons (${cat.uiArt.filter((a) => a.url).length} / ${cat.uiArt.filter((a) => !a.unlinked).length})` }),
    h('p', { class: 'note', text: 'Painted UI icons (assets/ui-icons, cut by tools/make-ui-icons.mjs from assets/source/ui-icons). Battle HUD actions, cooldown and Rage chips, the Lucky Escape pip, the Combat log toggle, gold and bag counters, and the Gear / Formation buttons use these; without an image they fall back to the pixel icon or show no icon.' }),
    uis,
    h('h3', { class: 'sub', text: `Item art (${cat.itemArt.art.length})` }),
    h('p', { class: 'note', text: `Painted item icons (assets/items, cut by tools/make-item-icons.mjs from assets/source/item-icons). An item with art shows it everywhere; the rest fall back to the pixel icons above${cat.itemArt.missing.length ? ` (still pixel: ${cat.itemArt.missing.join(', ')})` : ''}.` }),
    art,
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
