/**
 * WIKI görünümü (DOM): sağ üstte kitap düğmesi + oyunun üstünde tam ekrana yakın modal. İçerik src/wiki/catalog.ts'den gelir
 * (veriden türetilir). Esc ve X ile kapanır; açıkken savaş duraklar (kapanınca devam), klavye kısayolları oyuna gitmez.
 */
import layout from '../../data/battle-layout.json';
import { applyFilter, chipBar, h, isolateKeys, openLightbox, searchable } from '../gallery/dom';
import { bindIcon, bindStatusIcon, iconUrl } from '../ui/dom-icons';
import { SHARED_KEY, ownerOfSkill, ownerOfUnit } from '../game/asset-versions';
import { STAT_COLOR } from '../ui/stat-icons';
import type { MiniShape } from '../ui/shape-diagram';
import { buildWiki } from './catalog';
import type { WikiArticle, WikiBlock, WikiCatalog, WikiElement, WikiGround, WikiSkill, WikiStatus, WikiUnit } from './catalog';
import { WIKI_ALIASES } from './assets/nav';
import { assetSections, setNavigator, skillArt, unitArt } from './assets/sections';
import { wikiFiles } from './files';
import { applyVariantFiles } from '../game/sprite-variants';
import './wiki.css';

export interface WikiHooks {
  /** Wiki açıldı: oyun duraklatılır. */
  onOpen: () => void;
  /** Wiki kapandı: oyun devam eder. */
  onClose: () => void;
}

const ELEMENT_COLOR = layout.colors.element as Record<string, string>;
const lineColor = (kind: string | undefined): string | undefined =>
  kind === 'shield' ? STAT_COLOR.armor : kind === 'magicShield' ? layout.colors.magicShield : kind ? ELEMENT_COLOR[kind] : undefined;

/**
 * Wiki ikonu: `owner` (class id / 'shared') verilirse o sahibin SEÇİLİ sürümüyle (debug > Versions) çizilir ve seçim değişince sayfa
 * yenilenmeden güncellenir (bindIcon); verilmezse class logoları yine sahibini izler, diğer adlar v1.
 */
const icon = (name: string, accent: string, cls = 'wk-icon', owner?: string | null): HTMLImageElement => {
  const img: HTMLImageElement = h('img', { class: `${cls} pixelated`, attrs: { alt: '' }, on: { click: (e) => { e.stopPropagation(); openLightbox(img.src, name, true); } }, title: `${name} (click to enlarge)` });
  return bindIcon(img, name, accent, owner);
};
/** Durum rozeti: sınıfa özgü durum (Omen, Wither, Jinxed...) sahibinin sürümünü izler, ortak durum Shared (src/game/art-registry.ts > statusBadge). */
const statusIcon = (id: string, iconName: string, accent: string, cls: string): HTMLImageElement => {
  const img: HTMLImageElement = h('img', { class: `${cls} pixelated`, attrs: { alt: '' }, on: { click: (e) => { e.stopPropagation(); openLightbox(img.src, iconName, true); } }, title: `${iconName} (click to enlarge)` });
  return bindStatusIcon(img, id, iconName, accent);
};

const art = (url: string | null, caption: string, cls: string): HTMLElement =>
  url ? h('img', { class: cls, attrs: { src: url, alt: caption, loading: 'lazy' }, title: `${caption} (click to enlarge)`, on: { click: () => openLightbox(url, caption) } }) : h('div', { class: `${cls} missing`, text: 'no art' });

interface Section {
  id: string;
  title: string;
  icon: string;
  total: number;
  root: HTMLElement;
  setQuery: (q: string) => number;
  /** Bölüm açılınca çağrılır (Assets: ağır parçaları tembel kurar). */
  onShow?: () => void;
  /** Sol menüde girintili alt bölüm (Assets altındakiler). */
  sub?: boolean;
}

// ---------------------------------------------------------------- parçalar

function blocks(list: WikiBlock[]): HTMLElement[] {
  return list.map((b) => {
    if (b.kind === 'p') return h('p', { text: b.text });
    if (b.kind === 'list') return h('ul', {}, ...b.items.map((t) => h('li', { text: t })));
    return table(b.head, b.rows);
  });
}

function table(head: string[], rows: string[][]): HTMLElement {
  return h('div', { class: 'wk-tablewrap' }, h('table', { class: 'wk-table' }, h('thead', {}, h('tr', {}, ...head.map((c) => h('th', { text: c })))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', { text: c })))))));
}

/** AOE şekil şeması: herhangi RxC mini ızgara (savaştaki hücre plakası diliyle); boyalı hücreler vurulur, beyaz çerçeveli hücre imlecin gösterdiği (anchor) hücredir. */
function shapeGrid(m: MiniShape): HTMLElement {
  const grid = h('div', { class: 'wk-shape', style: { '--cols': String(m.cols) }, title: `Shape preview: the painted cells are hit; the white-framed cell is the one you point at${m.cells.some((c) => c.hits && c.hits > 1) ? '; the center cell is struck twice (x2)' : ''}` }, ...m.cells.map((c) => h('span', { class: `wk-sc${c.on ? ' on' : ''}${c.on && c.stage && c.stage > 1 ? ` s${Math.min(3, c.stage)}` : ''}${c.anchor ? ' anchor' : ''}${c.hits && c.hits > 1 ? ' hits' : ''}`, ...(c.hits && c.hits > 1 ? { attrs: { 'data-hits': `x${c.hits}` } } : {}) })));
  // Either-side skills (area_any: Smoke Bomb) carry a short note next to the grid
  return m.note ? h('span', { class: 'wk-shape-wrap' }, h('span', { class: 'wk-shape-note', text: m.note }), grid) : grid;
}

function articleCard(a: WikiArticle): HTMLElement {
  const shapes = a.shapes?.length
    ? h('div', { class: 'wk-shapes' }, ...a.shapes.map((s) => h('figure', {}, shapeGrid(s.shape), h('figcaption', { text: s.label }))))
    : null;
  return searchable(h('article', { class: 'wk-card wk-article', style: { '--accent': a.accent } }, h('h3', {}, icon(a.icon, a.accent, 'wk-icon', null), h('span', { text: a.title })), ...blocks(a.blocks), shapes), a.search);
}

/** Başlıkları gruplayan makale listesi (Mechanics, Getting Started). */
function articleGroups(list: WikiArticle[]): HTMLElement[] {
  const groups = new Map<string, WikiArticle[]>();
  for (const a of list) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
  return [...groups].map(([name, items]) => h('div', { class: 'group' }, h('h3', { class: 'wk-group', text: name }), h('div', { class: 'wk-grid' }, ...items.map(articleCard))));
}

function skillBlock(s: WikiSkill): HTMLElement {
  const meta = h('div', { class: 'wk-meta' },
    h('span', { class: 'wk-chip', text: s.range, title: 'Melee: reaches the front rows only. Ranged: reaches anyone. Support: targets an ally. Self: only the caster.' }),
    h('span', { class: 'wk-badge', text: s.targetBadge, title: s.targetText }),
    s.shape ? shapeGrid(s.shape) : null,
    h('span', { class: 'wk-chip', text: `Cost: ${s.cost}` }),
    h('span', { class: 'wk-chip', text: `Cooldown: ${s.cooldown}` }),
    s.initialCooldown ? h('span', { class: 'wk-chip warn', text: s.initialCooldown }) : null);
  return h('div', { class: 'wk-skill', style: { '--accent': s.accent } },
    icon(s.icon, s.accent, 'wk-icon big', ownerOfSkill(s.id)),
    h('div', { class: 'wk-skill-body' },
      h('div', { class: 'wk-skill-name' }, h('b', { text: s.slot ? `${s.slot}. ${s.name}` : s.name }), ...s.elements.map((e) => h('span', { class: 'wk-el', text: e, style: { color: ELEMENT_COLOR[e] ?? '#fff', 'border-color': ELEMENT_COLOR[e] ?? '#fff' } }))),
      meta,
      h('ul', { class: 'wk-lines' }, ...s.lines.map((t, i) => h('li', { text: t, style: lineColor(s.kinds[i]) ? { color: lineColor(s.kinds[i])! } : {} }))),
      skillArt(s.id)));
}

function unitCard(u: WikiUnit): HTMLElement {
  const attrs = u.attributes.map((a) =>
    h('div', { class: `wk-attr${a.primary ? ' primary' : ''}`, title: a.primary ? `${a.label} ${a.value} (primary)` : `${a.label} ${a.value}` },
      icon(a.icon, a.color, 'wk-icon small', null),
      h('span', { class: 'wk-attr-name', text: a.label }),
      h('span', { class: 'wk-bar' }, h('span', { class: 'wk-fill', style: { width: `${Math.min(100, a.value * 5)}%`, background: a.color } })),
      h('span', { class: 'wk-attr-val', text: String(a.value) })));
  const derived = u.derived.map((d) => h('span', { class: 'wk-stat' }, icon(d.icon, d.color, 'wk-icon tiny', null), h('span', { class: 'muted', text: d.label }), h('b', { text: d.value })));
  return searchable(
    h('article', { class: 'wk-card wk-unit', style: { '--accent': u.color } },
      h('div', { class: 'wk-unit-art' },
        art(u.spriteUrl, `${u.name} (full body)`, 'wk-sprite'),
        h('div', { class: 'wk-unit-mini' }, art(u.avatarUrl, `${u.name} avatar`, 'wk-avatar'), icon(u.logo, u.color, 'wk-icon logo', ownerOfUnit(u.id)))),
      h('div', { class: 'wk-unit-main' },
        h('h3', { class: 'wk-unit-name' }, h('span', { text: u.name }), u.role ? h('span', { class: 'wk-role', text: u.role }) : null, u.testOnly ? h('span', { class: 'wk-chip test', text: 'TEST', title: 'Test class: left out of random teams; add it by hand in team selection' }) : null, u.kind === 'class' ? h('span', { class: 'wk-chip', text: u.melee ? 'Melee' : 'Ranged' }) : h('span', { class: 'wk-chip', text: 'Summon' })),
        u.primary && u.primaryBonus
          ? h('div', { class: 'wk-primary' }, h('b', { text: `Primary ${u.attributes.find((a) => a.primary)?.label ?? ''}: ${u.primaryBonus.name}` }), h('span', { class: 'muted', text: ` ${u.primaryBonus.detail}` }), h('div', { class: 'muted small', text: u.primaryBonus.text }))
          : null,
        h('div', { class: 'wk-attrs' }, ...attrs),
        h('div', { class: 'wk-stats' }, ...derived),
        u.passive ? h('div', { class: 'wk-passive' }, icon(u.passive.icon, u.color, 'wk-icon big', ownerOfUnit(u.id)), h('div', {}, h('b', { text: `Passive: ${u.passive.name}` }), h('div', { class: 'muted', text: u.passive.text }))) : h('div', { class: 'muted small', text: 'No passive' }),
        h('div', { class: 'wk-skills' }, ...u.skills.map(skillBlock)),
        unitArt(u.id))),
    u.search,
  );
}

// ---------------------------------------------------------------- bölümler

function sectionShell(id: string, title: string, iconName: string, ...children: Array<HTMLElement | null>): { root: HTMLElement; countEl: HTMLElement } {
  const countEl = h('span', { class: 'wk-count' });
  const root = h('section', { class: 'wk-section', attrs: { id: `wiki-${id}`, hidden: '' } }, h('h2', {}, icon(iconName, '#ffe29a', 'wk-icon head', null), h('span', { text: title }), countEl), ...children);
  return { root, countEl };
}

function simpleSection(id: string, title: string, iconName: string, total: number, content: Array<HTMLElement | null>): Section {
  const { root, countEl } = sectionShell(id, title, iconName, ...content);
  const setQuery = (q: string): number => {
    const shown = applyFilter(root, q);
    countEl.textContent = q ? `${shown} / ${total}` : String(total);
    return shown;
  };
  setQuery('');
  return { id, title, icon: iconName, total, root, setQuery };
}

function classesSection(cat: WikiCatalog): Section {
  const classes = cat.classes.map(unitCard);
  const summons = cat.summons.map(unitCard);
  return simpleSection('classes', 'CLASSES', 'helm', cat.classes.length + cat.summons.length, [
    h('div', { class: 'group' }, h('div', { class: 'wk-grid units' }, ...classes)),
    h('div', { class: 'group' }, h('h3', { class: 'wk-group', text: 'SUMMONS' }), h('p', { class: 'muted', text: 'Called by skills; they are not part of the chosen team.' }), h('div', { class: 'wk-grid units' }, ...summons)),
  ]);
}

function skillsSection(cat: WikiCatalog): Section {
  const owners = [...new Map(cat.skills.map((s) => [s.owner.id, s.owner.name])).entries()];
  const targets = [...new Set(cat.skills.map((s) => s.targetBadge.split(' · ')[0]!))];
  const elements = [...new Set(cat.skills.flatMap((s) => s.elements))];
  const filters = { owner: '', target: '', element: '' };
  const cards = cat.skills.map((s) =>
    searchable(h('div', { class: 'wk-card wk-skillcard', data: { owner: s.owner.id, target: s.targetBadge.split(' · ')[0]!, element: s.elements.join(' ') } }, h('div', { class: 'wk-skill-owner muted small', text: s.owner.name }), skillBlock(s)), s.search));
  const grid = h('div', { class: 'wk-grid skills' }, ...cards);
  const { root, countEl } = sectionShell(
    'skills', 'SKILLS', 'fireball',
    h('div', { class: 'wk-filters' },
      h('div', {}, h('span', { class: 'muted small', text: 'Class' }), chipBar([{ value: '', label: 'All' }, ...owners.map(([v, label]) => ({ value: v, label }))], (v) => { filters.owner = v; refresh(); })),
      h('div', {}, h('span', { class: 'muted small', text: 'Target' }), chipBar([{ value: '', label: 'All' }, ...targets.map((t) => ({ value: t, label: t }))], (v) => { filters.target = v; refresh(); })),
      h('div', {}, h('span', { class: 'muted small', text: 'Element' }), chipBar([{ value: '', label: 'All' }, ...elements.map((e) => ({ value: e, label: e }))], (v) => { filters.element = v; refresh(); }))),
    grid,
  );
  let query = '';
  function refresh(): number {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const el of cards) {
      const ok = words.every((w) => (el.dataset['search'] ?? '').includes(w)) && (!filters.owner || el.dataset['owner'] === filters.owner) && (!filters.target || el.dataset['target'] === filters.target) && (!filters.element || (el.dataset['element'] ?? '').split(' ').includes(filters.element));
      el.hidden = !ok;
      if (ok) shown++;
    }
    countEl.textContent = shown === cat.skills.length ? String(cat.skills.length) : `${shown} / ${cat.skills.length}`;
    return shown;
  }
  refresh();
  return { id: 'skills', title: 'SKILLS', icon: 'fireball', total: cat.skills.length, root, setQuery: (q) => { query = q; return refresh(); } };
}

const statusCard = (s: WikiStatus): HTMLElement =>
  searchable(h('article', { class: 'wk-card wk-status', style: { '--accent': s.color } }, statusIcon(s.id, s.icon, s.color, 'wk-icon big'), h('div', {}, h('b', { text: s.name, style: { color: s.color } }), h('span', { class: `wk-chip ${s.type}`, text: s.type }), h('div', { text: s.text }), s.usedBy.length ? h('div', { class: 'muted small', text: `Used by: ${s.usedBy.join(', ')}` }) : null)), s.search);

const groundCard = (g: WikiGround): HTMLElement =>
  searchable(h('article', { class: 'wk-card wk-status', style: { '--accent': g.color } }, icon(g.icon, g.color, 'wk-icon big', SHARED_KEY), h('div', {}, h('b', { text: g.name, style: { color: g.color } }), h('span', { class: 'wk-chip', text: g.element }), h('div', { text: g.text }), g.usedBy.length ? h('div', { class: 'muted small', text: `Used by: ${g.usedBy.join(', ')}` }) : null)), g.search);

function statusesSection(cat: WikiCatalog): Section {
  return simpleSection('statuses', 'STATUSES & GROUNDS', 'drop', cat.statuses.length + cat.grounds.length, [
    h('div', { class: 'group' }, h('h3', { class: 'wk-group', text: 'STATUSES (buffs and debuffs)' }), h('div', { class: 'wk-grid' }, ...cat.statuses.map(statusCard))),
    h('div', { class: 'group' }, h('h3', { class: 'wk-group', text: 'GROUNDS (effects left on the floor)' }), h('div', { class: 'wk-grid' }, ...cat.grounds.map(groundCard))),
  ]);
}

const elementCard = (e: WikiElement): HTMLElement =>
  searchable(
    h('article', { class: 'wk-card wk-element', style: { '--accent': e.color } },
      h('h3', { text: e.name, style: { color: e.color } }),
      e.weakTo.length ? h('ul', {}, ...e.weakTo.map((w) => h('li', { text: `${w.tag.charAt(0).toUpperCase() + w.tag.slice(1)} units take x${w.mult} damage (${w.units.join(', ') || 'no unit yet'})` }))) : h('p', { class: 'muted', text: 'No unit type is weak to it.' }),
      h('div', { class: 'muted small', text: e.skills.length ? `Skills: ${e.skills.join(', ')}` : 'No skill uses it yet.' })),
    e.search,
  );

function elementsSection(cat: WikiCatalog): Section {
  const total = cat.elements.length;
  return simpleSection('elements', 'ELEMENTS', 'meteor', total, [
    searchable(h('div', { class: 'wk-card wk-article' }, h('h3', { text: 'Weakness table' }), h('p', { text: 'Damage multiplier by target type and element (x1 = no weakness). Armor and crits apply on top.' }), table(cat.elementTable.head, cat.elementTable.rows)), `weakness table multiplier ${cat.elementTable.head.join(' ')} ${cat.elementTable.rows.flat().join(' ')}`),
    h('div', { class: 'wk-grid' }, ...cat.elements.map(elementCard)),
  ]);
}

// ---------------------------------------------------------------- panel

export class WikiPanel {
  private readonly overlay: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly content: HTMLElement;
  private readonly sections: Section[];
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private readonly navCounts = new Map<string, HTMLElement>();
  private active = '';
  private query = '';
  private opened = false;

  constructor(root: HTMLElement, private readonly hooks: WikiHooks) {
    const toggle = h('button', { class: 'settings-toggle wiki-toggle', title: 'Wiki', attrs: { 'aria-label': 'Wiki', type: 'button' }, on: { click: () => this.toggle() } }, h('img', { attrs: { src: iconUrl('book'), alt: '' } }));

    const cat = buildWiki(applyVariantFiles(wikiFiles));
    this.sections = [
      simpleSection('start', 'GETTING STARTED', 'sword', cat.gettingStarted.length, articleGroups(cat.gettingStarted)),
      classesSection(cat),
      skillsSection(cat),
      simpleSection('mechanics', 'STATS & MECHANICS', 'muscle', cat.mechanics.length, articleGroups(cat.mechanics)),
      statusesSection(cat),
      elementsSection(cat),
      ...assetSections(),
    ];

    this.search = h('input', { class: 'wk-search', attrs: { type: 'search', placeholder: 'Search the wiki (class, skill, status...)', 'aria-label': 'Search the wiki', autocomplete: 'off' } });
    isolateKeys(this.search);
    let timer = 0;
    this.search.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.query = this.search.value.trim();
        this.refresh();
      }, 100);
    });

    const nav = h('nav', { class: 'wk-nav' });
    for (const s of this.sections) {
      const count = h('span', { class: 'wk-navcount' });
      const b = h('button', { class: `wk-navbtn${s.sub ? ' sub' : ''}`, attrs: { type: 'button' }, on: { click: () => this.show(s.id) } }, h('img', { class: 'pixelated', attrs: { src: iconUrl(s.icon, '#ffe29a'), alt: '' } }), h('span', { class: 'wk-navtitle', text: s.title }), count);
      this.navButtons.set(s.id, b);
      this.navCounts.set(s.id, count);
      nav.append(b);
    }
    this.content = h('main', { class: 'wk-content' }, ...this.sections.map((s) => s.root));

    const close = h('button', { class: 'wk-close', title: 'Close (Esc)', text: '×', attrs: { 'aria-label': 'Close wiki', type: 'button' }, on: { click: () => this.setOpen(false) } });
    const modal = h('div', { class: 'wk-modal', attrs: { role: 'dialog', 'aria-label': 'Wiki' } },
      h('header', { class: 'wk-head' }, h('img', { class: 'pixelated wk-headicon', attrs: { src: iconUrl('book'), alt: '' } }), h('span', { class: 'wk-title', text: 'WIKI' }), this.search, close),
      h('div', { class: 'wk-body' }, nav, this.content));
    this.overlay = h('div', { class: 'wk-overlay', attrs: { hidden: '' }, on: { pointerdown: (e) => { if (e.target === this.overlay) this.setOpen(false); } } }, modal);
    root.append(toggle, this.overlay);

    window.addEventListener('keydown', (e) => this.onKey(e), true);
    setNavigator((id, q) => {
      this.search.value = q;
      this.query = q;
      this.refresh();
      this.show(id);
    });
    this.show('start');
    this.refresh();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  toggle(): void {
    this.setOpen(!this.opened);
  }

  setOpen(open: boolean): void {
    if (open === this.opened) return;
    this.opened = open;
    this.overlay.hidden = !open;
    if (open) this.hooks.onOpen();
    else this.hooks.onClose();
  }

  /** Bölüme geç (id: start, classes, skills, mechanics, statuses, elements, assets, sounds, animations, icons, art, palette, legacy; 'gallery' = assets). Bilinmeyen id: başlangıç. */
  show(id: string): void {
    id = WIKI_ALIASES[id] ?? id;
    if (!this.sections.some((s) => s.id === id)) id = 'start';
    this.active = id;
    for (const s of this.sections) s.root.hidden = s.id !== id;
    for (const [k, b] of this.navButtons) b.classList.toggle('active', k === id);
    this.content.scrollTop = 0;
    this.sections.find((s) => s.id === id)?.onShow?.();
  }

  private refresh(): void {
    for (const s of this.sections) {
      const shown = s.setQuery(this.query);
      const el = this.navCounts.get(s.id)!;
      el.textContent = this.query ? `${shown}/${s.total}` : String(s.total);
      this.navButtons.get(s.id)!.classList.toggle('empty', this.query !== '' && shown === 0);
    }
    // Arama sırasında geçerli bölümde sonuç yoksa sonuç içeren ilk bölüme geç
    if (this.query) {
      const cur = this.sections.find((s) => s.id === this.active);
      if (cur && this.navButtons.get(cur.id)!.classList.contains('empty')) {
        const first = this.sections.find((s) => !this.navButtons.get(s.id)!.classList.contains('empty'));
        if (first) this.show(first.id);
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened) return;
    if (e.key === 'Escape') {
      if (document.querySelector('.lightbox')) return; // önce büyütülmüş görsel kapanır
      e.stopPropagation();
      this.setOpen(false);
      return;
    }
    // Savaş/takım seçimi kısayolları (1-4, Enter, F2...) wiki açıkken oyuna gitmesin; arama kutusuna yazı yazılabilsin
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.stopPropagation();
  }
}
