import { iconUrl } from '../ui/dom-icons';
import { STAT_COLOR, STAT_ICON, STAT_LABEL } from '../ui/stat-icons';
import type { Catalog, CharacterEntry } from './catalog';
import { applyFilter, chipBar, h, openLightbox, searchable, type SectionApi } from './dom';

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

/** CHARACTERS: class'lar ve çağrılar: tam boy sprite, kafa avatarı, logo, renk, statlar, skill ikonları, pasif; eski sürümler altta. */
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
      ? h('div', { class: 'passive' }, h('img', { class: 'icon32 pixelated', attrs: { src: iconUrl(c.passive.icon, c.color), alt: '' } }), h('div', {}, h('b', { text: c.passive.name }), h('div', { class: 'muted small', text: c.passive.text })))
      : h('div', { class: 'muted small', text: 'No passive' });
    return searchable(
      h(
        'article',
        { class: 'card char' },
        h('div', { class: 'char-art' }, img(c.idleUrl, `${c.name} sprite (assets/sprites/${c.spriteId}/idle.png)`, 'sprite'), h('div', { class: 'avatar-col' }, img(c.avatarUrl, `${c.name} avatar (assets/avatars/${c.spriteId}.png)`, 'avatar'), h('div', { class: 'muted small', text: 'avatar' }), h('img', { class: 'icon48 pixelated', attrs: { src: iconUrl(c.logo, c.color), alt: c.logo }, title: `logo: ${c.logo}` }), h('div', { class: 'muted small', text: 'logo' }))),
        h('div', { class: 'char-info' },
          h('div', { class: 'row' },
            h('h3', { class: 'char-name', text: c.name, style: { color: c.color } }),
            h('span', { class: 'badge', text: c.kind === 'summon' ? 'summon' : 'class' }),
            ...c.missing.map((m) => h('span', { class: 'badge bad', text: `no ${m} (placeholder)` })),
            ...c.tags.map((t) => h('span', { class: 'badge', text: t }))),
          h('div', { class: 'small row' }, h('span', { class: 'swatch', style: { background: c.color } }), h('span', { class: 'mono', text: c.color }), h('span', { class: 'muted', text: `primary: ${c.primary ? STAT_LABEL[c.primary as keyof typeof STAT_LABEL] : 'none'} - id: ${c.id}` })),
          h('div', { class: 'attrs' }, ...bars),
          h('div', { class: 'stats' }, ...stats),
          h('div', { class: 'skillrow' }, ...c.skills.map((s) => h('span', { class: 'skillchip', title: s.name }, h('img', { class: 'icon32 pixelated', attrs: { src: iconUrl(s.icon, c.color), alt: '' } }), h('span', { class: 'small', text: s.name })))),
          passive)),
      `${c.id} ${c.name} ${c.kind} ${c.primary ?? ''} ${c.skills.map((s) => s.name).join(' ')} ${c.passive?.name ?? ''} ${c.tags.join(' ')}`,
      c.kind,
    );
  };

  const grid = h('div', { class: 'cards wide' }, ...cat.characters.map(card));
  const chips = chipBar([{ value: '', label: 'All' }, { value: 'class', label: 'Classes' }, { value: 'summon', label: 'Summons' }], (v) => {
    group = v;
    refresh();
  });

  // --- eski sürümler ---
  const withOld = cat.characters.filter((c) => c.oldSprites.length > 0);
  const old = h('div', { class: 'cards small-cards' });
  for (const c of withOld)
    old.append(searchable(h('article', { class: 'card' }, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'old-row' }, ...c.oldSprites.map((s) => h('figure', {}, img(s.url, `${c.name} old ${s.anim} (assets/sprites_old/${c.spriteId}/${s.anim}.png)`, 'sprite old'), h('figcaption', { class: 'small muted', text: s.anim }))))), `old ${c.id} ${c.name} previous version`));

  const orphan = cat.orphans;
  const orphanCount = orphan.sprites.length + orphan.avatars.length + orphan.old.length;

  const refresh = (): number => {
    const n = applyFilter(grid, query, group);
    applyFilter(old, query);
    countEl.textContent = `${n} / ${cat.characters.length}`;
    return n;
  };

  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Characters' }), countEl, h('span', { class: 'muted small', text: 'Classes (data/classes) and summons (data/summons)' })),
    chips,
    grid,
    h('h3', { class: 'sub', text: 'Old versions' }),
    h('p', { class: 'note', text: 'Previous sprite backups from assets/sprites_old. Not used by the game.' }),
    withOld.length ? old : h('p', { class: 'muted small', text: 'No old versions.' }),
    ...(orphanCount
      ? [h('div', {}, h('h3', { class: 'sub', text: 'Unlinked files' }), h('p', { class: 'note', text: `Files with no matching class/summon: ${[...orphan.sprites.map((s) => `sprites/${s}`), ...orphan.avatars.map((s) => `avatars/${s}.png`), ...orphan.old.map((s) => `sprites_old/${s}`)].join(', ')}` }))]
      : []),
  );

  return {
    id: 'characters',
    title: 'Characters',
    total: cat.characters.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
