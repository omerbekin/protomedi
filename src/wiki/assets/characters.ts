import { iconUrl } from '../../ui/dom-icons';
import { ownerOfUnit } from '../../game/asset-versions';
import { variantLabel } from '../../game/sprite-variants';
import { STAT_COLOR, STAT_ICON, STAT_LABEL } from '../../ui/stat-icons';
import type { Catalog, CharacterEntry } from '../../gallery/catalog';
import { applyFilter, chipBar, h, openLightbox, searchable, type SectionApi } from '../../gallery/dom';

const ATTRS = ['str', 'int', 'dex', 'luck'] as const;
const STAT_ROWS = [
  ['hp', 'HP'],
  ['mp', 'MP'],
  ['spd', 'SPD'],
  ['evasion', 'EVA'],
  ['accuracy', 'ACC'],
  ['critChance', 'CRIT'],
  ['armor', 'ARM'],
  ['magicArmor', 'M.ARM'],
] as const;

const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** CHARACTER ART: class'lar ve çağrılar: tam boy sprite, kafa avatarı, logo, renk, statlar, skill ikonları, pasif. Gizli class'lar 'Hidden' etiketiyle. Eski sürümler Legacy bölümünde. */
export function mountCharacters(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'characters' } });
  const countEl = h('span', { class: 'count' });
  let query = '';
  let group = '';

  const img = (url: string | null, caption: string, cls: string): HTMLElement =>
    url
      ? h('img', { class: cls, attrs: { src: url, alt: caption, loading: 'lazy' }, title: `${caption} (click to enlarge)`, on: { click: () => openLightbox(url, caption) } })
      : h('div', { class: `${cls} missing`, text: 'missing' });

  const card = (c: CharacterEntry): HTMLElement => {
    const primary = c.primary;
    const bars = ATTRS.map((a) => {
      const v = c.attributes[a] ?? 0;
      return h('div', { class: `attr${a === primary ? ' primary' : ''}`, title: `${STAT_LABEL[a]} ${v}${a === primary ? ' (primary)' : ''}` },
        h('img', { class: 'tag-icon pixelated', attrs: { src: iconUrl(STAT_ICON[a], STAT_COLOR[a]), alt: '' } }),
        h('span', { class: 'attr-name', text: STAT_LABEL[a] }),
        h('span', { class: 'bar' }, h('span', { class: 'fill', style: { width: `${Math.min(100, v * 5)}%`, background: STAT_COLOR[a] } })),
        h('span', { class: 'attr-val', text: String(v) }));
    });
    const stats = STAT_ROWS.map(([k, label]) => h('span', { class: 'stat', title: label }, h('span', { class: 'muted', text: `${label} ` }), num(c.stats[k] * (k === 'critChance' || k === 'accuracy' || k === 'evasion' ? 100 : 1)) + (k === 'critChance' || k === 'accuracy' || k === 'evasion' ? '%' : '')));
    const passive = c.passive
      ? h('div', { class: 'passive' }, h('img', { class: 'icon32 pixelated', attrs: { src: iconUrl(c.passive.icon, c.color, ownerOfUnit(c.id)), alt: '' } }), h('div', {}, h('b', { text: c.passive.name }), h('div', { class: 'muted small', text: c.passive.text })))
      : h('div', { class: 'muted small', text: 'No passive' });
    return searchable(
      h(
        'article',
        { class: 'card char' },
        h('div', { class: 'char-art' }, img(c.idleUrl, `${c.name} sprite (assets/sprites/${c.spriteId}/idle.png)`, 'sprite'), h('div', { class: 'avatar-col' }, img(c.avatarUrl, `${c.name} avatar (assets/avatars/${c.spriteId}.png)`, 'avatar'), h('div', { class: 'muted small', text: 'avatar' }), h('img', { class: 'icon48 pixelated', attrs: { src: iconUrl(c.logo, c.color), alt: c.logo }, title: `logo: ${c.logo}` }), h('div', { class: 'muted small', text: 'logo' }), ...c.variants.flatMap((v) => [img(v.avatarUrl ?? v.idleUrl, `${c.name} alternative look "${variantLabel(c.spriteId, v.variant)}" (assets/sprites/${c.spriteId}/idle-${v.variant}.png)`, 'avatar'), h('div', { class: 'muted small', text: variantLabel(c.spriteId, v.variant), title: 'Alternative look: pick it in Debug > Characters' })]))),
        h('div', { class: 'char-info' },
          h('div', { class: 'row' },
            h('h3', { class: 'char-name', text: c.name, style: { color: c.color } }),
            h('span', { class: 'badge', text: c.kind === 'summon' ? 'summon' : 'class' }),
            c.testOnly ? h('span', { class: 'badge bad', text: 'TEST', title: 'Test class: left out of random teams' }) : null,
            c.hidden ? h('span', { class: 'badge bad', text: 'Hidden', title: 'Hidden developer class: not in the wiki class list or team selection; kept as an animation reference' }) : null,
            ...c.missing.map((m) => h('span', { class: 'badge bad', text: `no ${m} (placeholder)` })),
            ...c.tags.map((t) => h('span', { class: 'badge', text: t }))),
          h('div', { class: 'small row' }, h('span', { class: 'swatch', style: { background: c.color } }), h('span', { class: 'mono', text: c.color }), h('span', { class: 'muted', text: `primary: ${c.primary ? STAT_LABEL[c.primary as keyof typeof STAT_LABEL] : 'none'} - id: ${c.id}` })),
          h('div', { class: 'attrs' }, ...bars),
          h('div', { class: 'stats' }, ...stats),
          h('div', { class: 'skillrow' }, ...c.skills.map((s) => h('span', { class: 'skillchip', title: s.name }, h('img', { class: 'icon32 pixelated', attrs: { src: iconUrl(s.icon, c.color, ownerOfUnit(c.id)), alt: '' } }), h('span', { class: 'small', text: s.name })))),
          passive)),
      `${c.id} ${c.name} ${c.kind} ${c.primary ?? ''} ${c.skills.map((s) => s.name).join(' ')} ${c.passive?.name ?? ''} ${c.tags.join(' ')} ${c.hidden ? 'hidden developer' : ''}`,
      c.kind,
    );
  };

  const grid = h('div', { class: 'cards wide' }, ...cat.characters.map(card));
  const chips = chipBar([{ value: '', label: 'All' }, { value: 'class', label: 'Classes' }, { value: 'summon', label: 'Summons' }], (v) => {
    group = v;
    refresh();
  });

  const refresh = (): number => {
    const n = applyFilter(grid, query, group);
    countEl.textContent = `${n} / ${cat.characters.length}`;
    return n;
  };

  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Character art' }), countEl, h('span', { class: 'muted small', text: 'Full-body sprite, head avatar and logo of every class and summon. Old versions are in Legacy.' })),
    chips,
    grid,
  );

  return {
    id: 'characters',
    title: 'Character art',
    total: cat.characters.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
