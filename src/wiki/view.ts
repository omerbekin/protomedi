/**
 * CODEX (oyun içi wiki) görünümü (DOM). Ömer 2026-10-09 taslak 1 "Codex": tam ekran bilgi ekranı, tasarım kiti dilinde
 * (src/ui/elegant.css: el-back, el-title, el-heading, el-panel, el-dia). Sol sütun: arama + bölüm menüsü; orta sütun: madde listesi
 * (class'lar portre ızgarası, diğerleri ikonlu satırlar); sağda madde paneli. Assets / Legacy bölümleri orta+sağ alanı birlikte kullanır.
 * Geri kuralı: yalnızca sol üstte "◂ Back  Esc" (onay sormaz); oyun içi Menu yok. Açıkken savaş duraklar (kapanınca devam).
 * İçerik src/wiki/catalog.ts (veriden türetilir), sütun düzeni ve küçük resim seçimi src/wiki/codex.ts (saf, testli).
 * İkonlar oyunun kendi ikonlarıdır: skill ikonları sahibinin seçili sürümüyle (v2 varsayılan), durum rozetleri art-registry > statusBadge,
 * element ikonları yüzen hasar yazısındakiyle aynı, statlar alt bar / tooltip ikonları (stat-icons.ts), item yuvaları Gear ekranı siluetleri.
 */
import { uiSound } from '../ui/ui-sound';
import layout from '../../data/battle-layout.json';
import castleHall from '../../assets/backgrounds/castle-hall.webp?url';
import { h, isolateKeys, openLightbox } from '../gallery/dom';
import { bindIcon, bindStatusIcon } from '../ui/dom-icons';
import { SHARED_KEY, ownerOfLogo, ownerOfSkill, ownerOfUnit } from '../game/asset-versions';
import { STAT_COLOR, statIconName } from '../ui/stat-icons';
import type { MiniShape } from '../ui/shape-diagram';
import { buildWiki, elementIcon } from './catalog';
import type { WikiArticle, WikiBlock, WikiCatalog, WikiElement, WikiGround, WikiSkill, WikiSkillRef, WikiStatus, WikiUnit } from './catalog';
import { CODEX_SECTIONS, WEAKNESS_TABLE_ID, codexEntries, filterEntries, groundEntryId, keepSelection, portraitOf, stepSelection } from './codex';
import type { CodexEntry, CodexSectionId, CodexThumb } from './codex';
import { WIKI_ALIASES } from './assets/nav';
import { assetSections, setNavigator, skillArt, unitArt } from './assets/sections';
import type { AssetSection } from './assets/sections';
import { wikiFiles } from './files';
import { familyGlyph, slotGlyph } from './slot-glyphs';
import { applyVariantFiles } from '../game/sprite-variants';
import './wiki.css';

export interface WikiHooks {
  /** Codex açıldı: oyun duraklatılır. */
  onOpen: () => void;
  /** Codex kapandı: oyun devam eder. */
  onClose: () => void;
}

const ELEMENT_COLOR = layout.colors.element as Record<string, string>;
const PRIMARY_COLOR = layout.colors.primaryGroup as Record<string, string>;
const GOLD = '#ffe29a';
const lineColor = (kind: string | undefined): string | undefined =>
  kind === 'shield' ? STAT_COLOR.armor : kind === 'magicShield' ? layout.colors.magicShield : kind ? ELEMENT_COLOR[kind] : undefined;

// ---------------------------------------------------------------- küçük parçalar

/**
 * Oyun ikonu (canlı sürüm bağlı: debug > Versions değişince yeniden çizilir). `owner` verilmezse class logosu sahibini, diğer adlar
 * Shared sürümünü izler (Shared v2'de olmayan ad v1'e düşer). `zoom`: tıklayınca büyütür.
 */
function pic(name: string, accent: string, cls: string, owner?: string | null, zoom = false): HTMLImageElement {
  const img: HTMLImageElement = h('img', { class: `${cls} pixelated`, attrs: { alt: '', draggable: 'false' } });
  if (zoom) {
    img.title = `${name} (click to enlarge)`;
    img.classList.add('zoom');
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(img.src, name, true);
    });
  }
  return bindIcon(img, name, accent, owner === undefined ? (ownerOfLogo(name) ?? SHARED_KEY) : owner);
}

function statusPic(id: string, icon: string, color: string, cls: string, zoom = false): HTMLImageElement {
  const img: HTMLImageElement = h('img', { class: `${cls} pixelated`, attrs: { alt: '', draggable: 'false' } });
  if (zoom) {
    img.classList.add('zoom');
    img.title = `${icon} (click to enlarge)`;
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(img.src, icon, true);
    });
  }
  return bindStatusIcon(img, id, icon, color);
}

const skillPic = (s: { id: string; icon: string }, accent: string, cls: string, zoom = false): HTMLImageElement => pic(s.icon, accent, cls, ownerOfSkill(s.id), zoom);
const elementPic = (id: string, cls: string): HTMLImageElement => pic(elementIcon(id), ELEMENT_COLOR[id] ?? '#fff', cls, SHARED_KEY);

/** Portre: avatar, yoksa tam boy sprite (üstten kırpılır), o da yoksa (ya da resim yüklenemezse) class logosu. Boş kutu yok. */
function portrait(t: Extract<CodexThumb, { kind: 'portrait' }>, cls: string): HTMLElement {
  const box = h('span', { class: `cx-portrait ${cls} from-${t.from}`, style: { '--g': t.color } });
  const logo = (): HTMLImageElement => pic(t.logo, t.color, 'cx-portrait-logo', ownerOfUnit(t.unitId));
  if (t.url) {
    const img = h('img', { attrs: { src: t.url, alt: '', loading: 'lazy', draggable: 'false' } });
    img.addEventListener('error', () => {
      box.className = `cx-portrait ${cls} from-logo`;
      img.replaceWith(logo());
    });
    box.append(img);
  } else box.append(logo());
  return box;
}

function thumb(t: CodexThumb, cls: string): HTMLElement {
  if (t.kind === 'portrait') return portrait(t, cls);
  if (t.kind === 'skill') return skillPic({ id: t.skillId, icon: t.icon }, t.color, `cx-ico ${cls}`);
  if (t.kind === 'status') return statusPic(t.statusId, t.icon, t.color, `cx-ico ${cls}`);
  return pic(t.icon, t.color, `cx-ico ${cls}`, t.owner ?? undefined);
}

/** AOE şekil şeması: herhangi RxC mini ızgara (savaştaki hücre plakası diliyle); boyalı hücreler vurulur, beyaz çerçeveli hücre imlecin gösterdiği (anchor) hücredir. */
function shapeGrid(m: MiniShape): HTMLElement {
  const grid = h('div', { class: 'wk-shape', style: { '--cols': String(m.cols) }, title: `Shape preview: the painted cells are hit; the white-framed cell is the one you point at${m.cells.some((c) => c.hits && c.hits > 1) ? '; the center cell is struck twice (x2)' : ''}` }, ...m.cells.map((c) => h('span', { class: `wk-sc${c.on ? ' on' : ''}${c.on && c.stage && c.stage > 1 ? ` s${Math.min(3, c.stage)}` : ''}${c.anchor ? ' anchor' : ''}${c.hits && c.hits > 1 ? ' hits' : ''}`, ...(c.hits && c.hits > 1 ? { attrs: { 'data-hits': `x${c.hits}` } } : {}) })));
  return m.note ? h('span', { class: 'wk-shape-wrap' }, h('span', { class: 'wk-shape-note', text: m.note }), grid) : grid;
}

const heading = (text: string): HTMLElement => h('h3', { class: 'el-heading cx-h3', text });

/** Madde başlığı: büyük resim + ad + alt satır (rol, tür...). */
function articleHead(art: HTMLElement | null, title: string, ...sub: Array<Node | string | null>): HTMLElement {
  return h('header', { class: 'cx-ahead' }, art, h('div', { class: 'cx-ahead-text' }, h('h1', { text: title }), sub.some(Boolean) ? h('div', { class: 'cx-role' }, ...sub) : null));
}

const chip = (text: string, cls = ''): HTMLElement => h('span', { class: `cx-tag ${cls}`.trim(), text });

/** Element etiketi: ikon + ad, element renginde. */
const elementTag = (id: string): HTMLElement => h('span', { class: 'cx-eltag', style: { '--c': ELEMENT_COLOR[id] ?? '#fff' } }, elementPic(id, 'cx-ico tiny'), h('span', { text: id }));

// ---------------------------------------------------------------- panel

type NavInit = { id: string; title: string; icon: string; sub: boolean; total: number } & ({ kind: 'entries'; section: CodexSectionId } | { kind: 'asset'; asset: AssetSection });
type NavItem = NavInit & { row: HTMLButtonElement; count: HTMLElement };

interface ListView {
  root: HTMLElement;
  items: Map<string, HTMLElement>;
  groups: Array<{ el: HTMLElement; ids: string[] }>;
}

export class WikiPanel {
  private readonly overlay: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly listHead: HTMLElement;
  private readonly listCount: HTMLElement;
  private readonly listBody: HTMLElement;
  private readonly listCol: HTMLElement;
  private readonly articleCol: HTMLElement;
  private readonly wideCol: HTMLElement;
  private readonly nav: NavItem[] = [];
  private readonly cat: WikiCatalog;
  private readonly entries: Record<CodexSectionId, CodexEntry[]>;
  private readonly lists = new Map<CodexSectionId, ListView>();
  private readonly selected = new Map<CodexSectionId, string | null>();
  private readonly skillFilter = { owner: '', target: '', element: '' };
  private readonly filterResets: Array<() => void> = [];
  private active = 'start';
  private query = '';
  private opened = false;

  // Katalog sözlükleri (bağlantılar ve madde çizimi için)
  private readonly units = new Map<string, WikiUnit>();
  private readonly skills = new Map<string, WikiSkill>();
  private readonly statuses = new Map<string, WikiStatus>();
  private readonly grounds = new Map<string, WikiGround>();
  private readonly elements = new Map<string, WikiElement>();
  private readonly articles = new Map<string, WikiArticle>();

  constructor(root: HTMLElement, private readonly hooks: WikiHooks) {
    // Sağ üst kitap düğmesi KALDIRILDI (Ömer 2026-10-09): Codex ana menüden (Codex satırı) ve oyun içi Menu'den (Codex) açılır.

    this.cat = buildWiki(applyVariantFiles(wikiFiles));
    this.entries = codexEntries(this.cat);
    for (const u of [...this.cat.classes, ...this.cat.summons]) this.units.set(u.id, u);
    for (const s of this.cat.skills) this.skills.set(s.id, s);
    for (const s of this.cat.statuses) this.statuses.set(s.id, s);
    for (const g of this.cat.grounds) this.grounds.set(groundEntryId(g.id), g);
    for (const e of this.cat.elements) this.elements.set(e.id, e);
    for (const a of [...this.cat.gettingStarted, ...this.cat.mechanics]) this.articles.set(a.id, a);

    // --- sol sütun: arama + bölüm menüsü ---
    this.search = h('input', { class: 'cx-search-input', attrs: { type: 'search', placeholder: 'Search the Codex…', 'aria-label': 'Search the Codex', autocomplete: 'off', spellcheck: 'false' } });
    isolateKeys(this.search);
    let timer = 0;
    this.search.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.query = this.search.value.trim();
        this.refresh();
      }, 100);
    });
    const searchBox = h('label', { class: 'cx-search' }, this.searchGlyph(), this.search);

    const navEl = h('nav', { class: 'cx-nav', attrs: { 'aria-label': 'Codex sections' } });
    const addNav = (item: NavInit): void => {
      const count = h('small', { class: 'cx-navcount' });
      const row = h('button', { class: `cx-navrow${item.sub ? ' sub' : ''}`, attrs: { type: 'button' }, on: { click: () => (uiSound('tab'), this.show(item.id)) } },
        h('i', { class: 'el-dia' }),
        pic(item.icon, GOLD, 'cx-navicon', SHARED_KEY),
        h('span', { class: 'cx-navtitle', text: item.title }),
        count);
      navEl.append(row);
      this.nav.push({ ...item, row, count });
    };
    for (const s of CODEX_SECTIONS) addNav({ kind: 'entries', section: s.id, id: s.id, title: s.title, icon: s.icon, sub: false, total: this.entries[s.id].length });
    for (const a of assetSections()) addNav({ kind: 'asset', asset: a, id: a.id, title: titleCase(a.title), icon: a.icon, sub: !!a.sub, total: a.total });

    // --- orta sütun: liste; sağ: madde; geniş alan (Assets) ---
    this.listCount = h('small', { class: 'cx-listcount' });
    this.listHead = h('div', { class: 'el-heading cx-listhead' });
    this.listBody = h('div', { class: 'cx-listbody' });
    this.listCol = h('section', { class: 'cx-list' }, h('div', { class: 'cx-listtop' }, this.listHead, this.listCount), this.listBody);
    this.articleCol = h('article', { class: 'el-panel corners cx-article', attrs: { 'aria-live': 'polite' } });
    this.wideCol = h('div', { class: 'el-panel cx-wide', attrs: { hidden: '' } }, ...this.nav.flatMap((n) => (n.kind === 'asset' ? [n.asset.root] : [])));

    const back = h('button', { class: 'el-back cx-back', attrs: { type: 'button', 'aria-label': 'Back (Esc)' }, on: { click: () => this.setOpen(false) } }, h('span', { text: '◂ Back' }), h('small', { text: 'Esc' }));
    const body = h('div', { class: 'cx-body' }, h('aside', { class: 'cx-side' }, searchBox, navEl), this.listCol, this.articleCol, this.wideCol);
    this.overlay = h('div', { class: 'wk-overlay cx', attrs: { hidden: '', role: 'dialog', 'aria-label': 'Codex' } },
      h('div', { class: 'cx-bg', style: { 'background-image': `url("${castleHall}")` } }),
      back,
      h('div', { class: 'el-title cx-title', text: 'Codex' }),
      body);
    root.append(this.overlay);

    window.addEventListener('keydown', (e) => this.onKey(e), true);
    setNavigator((id, q) => {
      this.search.value = q;
      this.query = q;
      this.refresh();
      this.show(id);
    });
    this.show('start');
    this.refresh();
    wikiInstance = this;
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

  /**
   * Bölüme geç (id: start, classes, skills, mechanics, statuses, elements, assets, sounds, animations, icons, art, palette, versions, legacy;
   * 'gallery' = assets). `bölüm:madde` biçimi o maddeyi seçer (ör. 'classes:warrior'). Bilinmeyen id: başlangıç.
   */
  show(id: string): void {
    const [secRaw = '', entry] = id.split(/:(.*)/s);
    let sec = WIKI_ALIASES[secRaw] ?? secRaw;
    if (!this.nav.some((n) => n.id === sec)) sec = 'start';
    this.active = sec;
    const item = this.nav.find((n) => n.id === sec)!;
    for (const n of this.nav) n.row.classList.toggle('on', n.id === sec);
    if (item.kind === 'asset') {
      this.listCol.hidden = true;
      this.articleCol.hidden = true;
      this.wideCol.hidden = false;
      for (const n of this.nav) if (n.kind === 'asset') n.asset.root.hidden = n.id !== sec;
      this.wideCol.scrollTop = 0;
      item.asset.onShow?.();
      return;
    }
    this.listCol.hidden = false;
    this.articleCol.hidden = false;
    this.wideCol.hidden = true;
    if (entry) this.selected.set(item.section, entry);
    this.renderList(item.section, true);
  }

  // ---------------------------------------------------------------- liste

  private visible(sec: CodexSectionId): CodexEntry[] {
    let list = filterEntries(this.entries[sec], this.query);
    if (sec === 'skills') {
      const f = this.skillFilter;
      list = list.filter((e) => {
        const s = this.skills.get(e.id)!;
        return (!f.owner || s.owner.id === f.owner) && (!f.target || s.targetBadge.split(' · ')[0] === f.target) && (!f.element || s.elements.includes(f.element as never));
      });
    }
    return list;
  }

  private listView(sec: CodexSectionId): ListView {
    const hit = this.lists.get(sec);
    if (hit) return hit;
    const def = CODEX_SECTIONS.find((s) => s.id === sec)!;
    const items = new Map<string, HTMLElement>();
    const groups: ListView['groups'] = [];
    const byGroup = new Map<string, CodexEntry[]>();
    for (const e of this.entries[sec]) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
    const root = h('div', { class: `cx-items ${def.layout}` });
    if (sec === 'skills') root.append(this.skillFilters());
    for (const [name, list] of byGroup) {
      const els = list.map((e) => {
        const el = def.layout === 'tiles'
          ? h('button', { class: 'cx-tile', attrs: { type: 'button' }, style: { '--g': e.thumb.kind === 'portrait' ? this.primaryColor(e.id) : GOLD }, title: e.sub, on: { click: () => this.select(sec, e.id) } }, thumb(e.thumb, 'cx-tilepic'), h('span', { class: 'cx-tilename', text: e.title }))
          : h('button', { class: 'cx-row', attrs: { type: 'button' }, on: { click: () => this.select(sec, e.id) } }, thumb(e.thumb, 'cx-rowpic'), h('b', { text: e.title }), h('small', { text: e.sub === name ? '' : e.sub }));
        items.set(e.id, el);
        return el;
      });
      const grid = h('div', { class: def.layout === 'tiles' ? 'cx-tilegrid' : 'cx-rowlist' }, ...els);
      const g = h('div', { class: 'cx-group' }, byGroup.size > 1 && name.toLowerCase() !== def.title.toLowerCase() ? h('div', { class: 'cx-groupname', text: name }) : null, grid);
      groups.push({ el: g, ids: list.map((e) => e.id) });
      root.append(g);
    }
    const view = { root, items, groups };
    this.lists.set(sec, view);
    return view;
  }

  /** Skills: sınıf / hedef / element süzgeçleri (kit dilinde küçük yazı çipleri; element çipleri ikonlu). */
  private skillFilters(): HTMLElement {
    const owners = [...new Map(this.cat.skills.map((s) => [s.owner.id, s.owner.name])).entries()];
    const targets = [...new Set(this.cat.skills.map((s) => s.targetBadge.split(' · ')[0]!))];
    const elements = [...new Set(this.cat.skills.flatMap((s) => s.elements))];
    const bar = (label: string, key: keyof WikiPanel['skillFilter'], options: Array<{ value: string; label: string; icon?: () => HTMLElement }>): HTMLElement => {
      const buttons: HTMLButtonElement[] = [];
      const set = (v: string): void => {
        this.skillFilter[key] = v;
        for (const b of buttons) b.classList.toggle('on', b.dataset['value'] === v);
      };
      for (const o of [{ value: '', label: 'All' }, ...options] as Array<{ value: string; label: string; icon?: () => HTMLElement }>) {
        const b = h('button', { class: 'cx-chip', data: { value: o.value }, attrs: { type: 'button' }, on: { click: () => { set(o.value); this.renderList('skills'); } } }, o.icon ? o.icon() : null, h('span', { text: o.label }));
        buttons.push(b);
      }
      set('');
      this.filterResets.push(() => set(''));
      return h('div', { class: 'cx-filter' }, h('span', { class: 'cx-filterlabel', text: label }), h('div', { class: 'cx-chips' }, ...buttons));
    };
    return h('details', { class: 'cx-filters' }, h('summary', { text: 'Filters' }),
      bar('Class', 'owner', owners.map(([value, label]) => ({ value, label, icon: () => { const u = this.units.get(value); return u ? portrait(portraitOf(u), 'cx-chippic') : h('span'); } }))),
      bar('Target', 'target', targets.map((t) => ({ value: t, label: t }))),
      bar('Element', 'element', elements.map((e) => ({ value: e, label: e, icon: () => elementPic(e, 'cx-ico tiny') }))));
  }

  private primaryColor(unitId: string): string {
    const u = this.units.get(unitId);
    return (u?.primary && PRIMARY_COLOR[u.primary]) || u?.color || GOLD;
  }

  /** Orta sütunu süzgece göre günceller; seçim süzgeçten düştüyse görünen ilk maddeye geçer ve madde panelini çizer. */
  private renderList(sec: CodexSectionId, force = false): void {
    const view = this.listView(sec);
    if (this.listBody.firstChild !== view.root) this.listBody.replaceChildren(view.root);
    const def = CODEX_SECTIONS.find((s) => s.id === sec)!;
    this.listHead.textContent = def.title;
    const vis = this.visible(sec);
    const ids = new Set(vis.map((e) => e.id));
    for (const [id, el] of view.items) el.hidden = !ids.has(id);
    for (const g of view.groups) g.el.hidden = !g.ids.some((id) => ids.has(id));
    this.listCount.textContent = vis.length === this.entries[sec].length ? String(vis.length) : `${vis.length} / ${this.entries[sec].length}`;
    const before = this.selected.get(sec) ?? null;
    const cur = keepSelection(vis, before);
    this.selected.set(sec, cur);
    for (const [id, el] of view.items) el.classList.toggle('on', id === cur);
    if (force || cur !== before || this.articleCol.dataset['key'] !== `${sec}:${cur}`) this.renderArticle(sec, cur);
  }

  private select(sec: CodexSectionId, id: string): void {
    this.selected.set(sec, id);
    this.renderList(sec);
    const el = this.lists.get(sec)?.items.get(id);
    el?.scrollIntoView({ block: 'nearest' });
  }

  /** Madde bağlantısı (skill -> durum, durum -> skill, skill -> class...): hedef süzgeçte gizliyse arama ve süzgeçler temizlenir. */
  private go(sec: CodexSectionId, id: string): void {
    if (!this.entries[sec].some((e) => e.id === id)) return;
    if (!this.visible(sec).some((e) => e.id === id)) {
      if (this.query) {
        this.query = '';
        this.search.value = '';
      }
      for (const r of this.filterResets) r();
      this.skillFilter.owner = this.skillFilter.target = this.skillFilter.element = '';
      this.refresh();
    }
    this.selected.set(sec, id);
    this.show(sec);
    this.lists.get(sec)?.items.get(id)?.scrollIntoView({ block: 'nearest' });
  }

  private refresh(): void {
    for (const n of this.nav) {
      const shown = n.kind === 'entries' ? (n.section === 'skills' ? filterEntries(this.entries.skills, this.query).length : this.visible(n.section).length) : n.asset.setQuery(this.query);
      n.count.textContent = this.query ? `${shown}/${n.total}` : String(n.total);
      n.row.classList.toggle('empty', this.query !== '' && shown === 0);
    }
    // Arama sırasında geçerli bölümde sonuç yoksa sonuç içeren ilk bölüme geç
    const cur = this.nav.find((n) => n.id === this.active);
    if (this.query && cur?.row.classList.contains('empty')) {
      const first = this.nav.find((n) => !n.row.classList.contains('empty'));
      if (first) {
        this.show(first.id);
        return;
      }
    }
    if (cur?.kind === 'entries') this.renderList(cur.section);
  }

  // ---------------------------------------------------------------- madde paneli

  private renderArticle(sec: CodexSectionId, id: string | null): void {
    this.articleCol.dataset['key'] = `${sec}:${id}`;
    this.articleCol.scrollTop = 0;
    if (!id) {
      this.articleCol.replaceChildren(h('div', { class: 'cx-empty' }, h('i', { class: 'el-dia hollow' }), h('span', { text: this.query ? `Nothing in this section matches "${this.query}".` : 'Nothing here yet.' })));
      return;
    }
    let body: HTMLElement | null = null;
    if (sec === 'classes') body = this.unitArticle(this.units.get(id)!);
    else if (sec === 'skills') body = this.skillArticle(this.skills.get(id)!);
    else if (sec === 'statuses') body = this.grounds.has(id) ? this.groundArticle(this.grounds.get(id)!) : this.statusArticle(this.statuses.get(id)!);
    else if (sec === 'elements') body = id === WEAKNESS_TABLE_ID ? this.weaknessArticle() : this.elementArticle(this.elements.get(id)!);
    else body = this.textArticle(this.articles.get(id)!);
    this.articleCol.replaceChildren(h('div', { class: 'cx-art cx-fade' }, body));
  }

  private blocks(list: WikiBlock[]): HTMLElement[] {
    return list.map((b) => {
      if (b.kind === 'p') return h('p', { text: b.text });
      if (b.kind === 'list') return h('ul', { class: 'cx-ul' }, ...b.items.map((t) => h('li', { text: t })));
      return this.table(b.head, b.rows);
    });
  }

  /** Tablo hücresi: skill adı, class adı ya da element adıysa önünde küçük ikonu (Area shapes, Weakness table). */
  private cell(tag: 'th' | 'td', text: string): HTMLElement {
    const key = text.toLowerCase();
    const skill = this.cat.skills.find((s) => s.name === text);
    const unit = [...this.units.values()].find((u) => u.name === text);
    const icon = ELEMENT_COLOR[key] ? elementPic(key, 'cx-ico tiny') : skill ? skillPic(skill, skill.accent, 'cx-ico tiny') : unit ? pic(unit.logo, unit.color, 'cx-ico tiny', ownerOfUnit(unit.id)) : null;
    return h(tag, {}, icon ? h('span', { class: 'cx-cell' }, icon, h('span', { text })) : text);
  }

  private table(head: string[], rows: string[][]): HTMLElement {
    return h('div', { class: 'cx-tablewrap' }, h('table', { class: 'cx-table' }, h('thead', {}, h('tr', {}, ...head.map((c) => this.cell('th', c)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => this.cell('td', c)))))));
  }

  /** Skill bağlantı çipi (ikon + ad). */
  private skillRef(r: WikiSkillRef): HTMLElement {
    const s = this.skills.get(r.id);
    return h('button', { class: 'cx-ref', attrs: { type: 'button' }, title: s ? `${r.name} (${s.owner.name})` : r.name, on: { click: () => this.go('skills', r.id) } }, skillPic(r, s?.accent ?? GOLD, 'cx-ico small'), h('span', { text: r.name }));
  }

  private statusRef(id: string): HTMLElement | null {
    const s = this.statuses.get(id);
    if (!s) return null;
    return h('button', { class: `cx-ref ${s.type}`, attrs: { type: 'button' }, style: { '--c': s.color }, title: s.text, on: { click: () => this.go('statuses', id) } }, statusPic(s.id, s.icon, s.color, 'cx-ico small'), h('span', { text: s.name }));
  }

  private groundRef(id: string): HTMLElement | null {
    const g = this.grounds.get(groundEntryId(id));
    if (!g) return null;
    return h('button', { class: 'cx-ref', attrs: { type: 'button' }, style: { '--c': g.color }, title: g.text, on: { click: () => this.go('statuses', groundEntryId(id)) } }, pic(g.icon, g.color, 'cx-ico small', SHARED_KEY), h('span', { text: g.name }));
  }

  private unitRef(id: string): HTMLElement | null {
    const u = this.units.get(id);
    if (!u) return null;
    return h('button', { class: 'cx-ref unit', attrs: { type: 'button' }, on: { click: () => this.go('classes', id) } }, portrait(portraitOf(u), 'cx-refpic'), h('span', { text: u.name }));
  }

  private elementRef(id: string): HTMLElement {
    return h('button', { class: 'cx-ref', attrs: { type: 'button' }, style: { '--c': ELEMENT_COLOR[id] ?? '#fff' }, on: { click: () => this.go('elements', id) } }, elementPic(id, 'cx-ico small'), h('span', { text: id.charAt(0).toUpperCase() + id.slice(1) }));
  }

  private textArticle(a: WikiArticle): HTMLElement {
    const shapes = a.shapes?.length ? h('div', { class: 'wk-shapes' }, ...a.shapes.map((s) => h('figure', {}, shapeGrid(s.shape), h('figcaption', { text: s.label })))) : null;
    const gear = a.gear
      ? h('div', { class: 'cx-gear' },
          heading('Slots'),
          h('div', { class: 'cx-slots' }, ...a.gear.slots.map((s) => h('div', { class: 'cx-slot' }, h('span', { class: 'cx-slotbox' }, slotGlyph(s.id, '#d9b26a')), h('span', { text: s.name })))),
          ...(a.gear.families?.length
            ? [heading('Weapon families'), h('div', { class: 'cx-slots' }, ...a.gear.families.map((f) => h('div', { class: 'cx-slot' }, h('span', { class: 'cx-slotbox' }, familyGlyph(f.id, '#d9b26a')), h('span', { text: f.name }))))]
            : []),
          heading('Rarity'),
          h('div', { class: 'cx-rarities' }, ...a.gear.rarities.map((r) => h('div', { class: 'cx-rarity', style: { '--c': r.color } }, h('span', { class: 'cx-slotbox' }, slotGlyph('trinket', r.color)), h('span', { text: r.name })))))
      : null;
    return h('div', {}, articleHead(pic(a.icon, a.accent, 'cx-ico head', undefined, true), a.title, a.group), gear, ...this.blocks(a.blocks), shapes);
  }

  private skillBody(s: WikiSkill, withName: boolean): HTMLElement {
    const meta = h('div', { class: 'cx-meta' },
      h('span', { class: 'cx-tag', text: s.range, title: 'Melee: reaches the front rows only. Ranged: reaches anyone. Support: targets an ally. Self: only the caster.' }),
      h('span', { class: 'cx-tag strong', text: s.targetBadge, title: s.targetText }),
      s.shape ? shapeGrid(s.shape) : null,
      h('span', { class: 'cx-tag', text: `Cost ${s.cost}` }),
      h('span', { class: 'cx-tag', text: `Cooldown ${s.cooldown}` }),
      s.initialCooldown ? h('span', { class: 'cx-tag warn', text: s.initialCooldown }) : null);
    const applies = [...s.statuses.map((id) => this.statusRef(id)), ...s.grounds.map((id) => this.groundRef(id))].filter((x): x is HTMLElement => !!x);
    return h('div', { class: 'cx-skill-body' },
      withName
        ? h('div', { class: 'cx-skill-name' }, h('button', { class: 'cx-skill-link', attrs: { type: 'button' }, title: 'Open in Skills', on: { click: () => this.go('skills', s.id) } }, h('b', { text: s.slot ? `${s.slot}. ${s.name}` : s.name })), ...s.elements.map(elementTag))
        : s.elements.length ? h('div', { class: 'cx-skill-name' }, ...s.elements.map(elementTag)) : null,
      meta,
      h('ul', { class: 'cx-lines' }, ...s.lines.map((t, i) => h('li', { text: t, style: lineColor(s.kinds[i]) ? { color: lineColor(s.kinds[i])! } : {} }))),
      applies.length ? h('div', { class: 'cx-applies' }, h('span', { class: 'cx-label', text: 'Applies' }), ...applies) : null);
  }

  private unitArticle(u: WikiUnit): HTMLElement {
    const pri = u.primary ? h('span', { class: 'cx-pri', style: { color: PRIMARY_COLOR[u.primary] ?? GOLD }, text: u.primary.toUpperCase() }) : null;
    const sprite = u.spriteUrl ? h('img', { class: 'cx-fullsprite', attrs: { src: u.spriteUrl, alt: `${u.name} (full body)`, loading: 'lazy', draggable: 'false' }, title: `${u.name} (click to enlarge)`, on: { click: () => openLightbox(u.spriteUrl!, `${u.name} (full body)`) } }) : null;
    const head = h('div', { class: 'cx-unithead' },
      articleHead(portrait(portraitOf(u), 'cx-bigportrait'), u.name,
        u.role || (u.kind === 'summon' ? 'Summon' : ''), pri ? ' · ' : null, pri,
        h('span', { class: 'cx-headtags' }, pic(u.logo, u.color, 'cx-ico small', ownerOfUnit(u.id), true), chip(u.kind === 'class' ? (u.melee ? 'Melee' : 'Ranged') : 'Summon'), u.testOnly ? h('span', { class: 'cx-tag test', text: 'Test', title: 'Test class: left out of random teams; add it by hand in team selection' }) : null)),
      sprite);
    const attrs = h('div', { class: 'cx-attrs' }, ...u.attributes.map((a) =>
      h('div', { class: `cx-attr${a.primary ? ' primary' : ''}`, title: a.primary ? `${a.label} ${a.value} (primary)` : `${a.label} ${a.value}` }, pic(a.icon, a.color, 'cx-ico small'), h('small', { text: a.label }), h('b', { text: String(a.value) }))));
    const bonus = u.primary && u.primaryBonus
      ? h('div', { class: 'cx-bonus' }, pic(statIconName(u.primary), STAT_COLOR[u.primary], 'cx-ico small'), h('div', {}, h('b', { text: `${u.primaryBonus.name}` }), h('span', { class: 'cx-dim', text: ` ${u.primaryBonus.detail}` }), h('div', { class: 'cx-note', text: u.primaryBonus.text })))
      : null;
    const stats = h('div', { class: 'cx-stats' }, ...u.derived.map((d) => h('div', { class: 'cx-stat' }, pic(d.icon, d.color, 'cx-ico tiny'), h('span', { text: d.label }), d.sub ? h('b', { class: 'multi' }, h('i', { text: d.value }), h('small', { text: d.sub })) : h('b', { text: d.value }))));
    const passive = u.passive
      ? h('div', { class: 'cx-passive' }, pic(u.passive.icon, u.color, 'cx-ico big', ownerOfUnit(u.id), true), h('div', {}, h('b', { text: u.passive.name }), h('div', { class: 'cx-note', text: u.passive.text })))
      : h('div', { class: 'cx-dim', text: 'No passive.' });
    const skills = u.skills.map((s) => h('div', { class: 'cx-skill', style: { '--accent': s.accent } }, skillPic(s, s.accent, 'cx-ico big', true), this.skillBody(s, true)));
    return h('div', { class: 'cx-unit', style: { '--g': this.primaryColor(u.id) } },
      head, attrs, bonus,
      heading('Stats'), stats,
      heading('Passive'), passive,
      heading('Skills'), ...skills,
      unitArt(u.id));
  }

  private skillArticle(s: WikiSkill): HTMLElement {
    return h('div', { class: 'cx-skillart', style: { '--accent': s.accent } },
      articleHead(skillPic(s, s.accent, 'cx-ico head', true), s.name, s.slot ? `Skill ${s.slot} of ` : '', this.unitRef(s.owner.id) ?? s.owner.name, ` · ${s.range}`),
      this.skillBody(s, false),
      skillArt(s.id));
  }

  private statusArticle(s: WikiStatus): HTMLElement {
    return h('div', {},
      articleHead(statusPic(s.id, s.icon, s.color, 'cx-ico head', true), s.name, h('span', { class: `cx-kind ${s.type}`, text: s.type === 'buff' ? 'Buff' : 'Debuff' }), ' · Status'),
      h('p', { text: s.text }),
      heading('Applied by'),
      s.usedBySkills.length ? h('div', { class: 'cx-refs' }, ...s.usedBySkills.map((r) => this.skillRef(r))) : h('p', { class: 'cx-dim', text: 'No skill applies it directly (it comes from a passive or a special rule).' }));
  }

  private groundArticle(g: WikiGround): HTMLElement {
    return h('div', {},
      articleHead(pic(g.icon, g.color, 'cx-ico head', SHARED_KEY, true), g.name, 'Ground · ', elementTag(g.element)),
      h('p', { text: g.text }),
      heading('Element'), h('div', { class: 'cx-refs' }, this.elementRef(g.element)),
      heading('Left by'),
      g.usedBySkills.length ? h('div', { class: 'cx-refs' }, ...g.usedBySkills.map((r) => this.skillRef(r))) : h('p', { class: 'cx-dim', text: 'No skill uses it yet.' }));
  }

  private elementArticle(e: WikiElement): HTMLElement {
    return h('div', {},
      articleHead(elementPic(e.id, 'cx-ico head'), e.name, h('span', { style: { color: e.color }, text: 'Element' })),
      heading('Weaknesses'),
      e.weakTo.length
        ? h('ul', { class: 'cx-ul' }, ...e.weakTo.map((w) => h('li', { text: `${w.tag.charAt(0).toUpperCase() + w.tag.slice(1)} units take x${w.mult} damage (${w.units.join(', ') || 'no unit yet'})` })))
        : h('p', { class: 'cx-dim', text: 'No unit type is weak to it.' }),
      heading('Skills'),
      e.skillRefs.length ? h('div', { class: 'cx-refs' }, ...e.skillRefs.map((r) => this.skillRef(r))) : h('p', { class: 'cx-dim', text: 'No skill uses it yet.' }));
  }

  private weaknessArticle(): HTMLElement {
    return h('div', {},
      articleHead(pic('meteor', GOLD, 'cx-ico head', SHARED_KEY), 'Weakness table', 'Elements'),
      h('p', { text: 'Damage multiplier by target type and element (x1 = no weakness). Armor and crits apply on top.' }),
      this.table(this.cat.elementTable.head, this.cat.elementTable.rows),
      heading('Elements'),
      h('div', { class: 'cx-refs' }, ...this.cat.elements.map((e) => this.elementRef(e.id))));
  }

  private searchGlyph(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle cx="8" cy="8" r="6"/><path d="M13 13 L18 18"/>';
    return svg;
  }

  // ---------------------------------------------------------------- klavye

  private onKey(e: KeyboardEvent): void {
    if (!this.opened) return;
    if (e.key === 'Escape') {
      if (document.querySelector('.lightbox')) return; // önce büyütülmüş görsel kapanır
      e.stopImmediatePropagation(); // savaşın / menülerin kendi Esc işleyicileri (aynı window üzerinde) bu tuşu görmesin
      this.setOpen(false);
      return;
    }
    // Yukarı / aşağı: listede önceki / sonraki madde (arama kutusundayken de)
    const cur = this.nav.find((n) => n.id === this.active);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && cur?.kind === 'entries') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const next = stepSelection(this.visible(cur.section), this.selected.get(cur.section) ?? null, e.key === 'ArrowDown' ? 1 : -1);
      if (next) this.select(cur.section, next);
      return;
    }
    // Savaş/takım seçimi kısayolları (1-4, Enter, F2...) Codex açıkken oyuna gitmesin; arama kutusuna yazı yazılabilsin
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.stopPropagation();
  }
}

/** "PALETTE & UI" -> "Palette & UI" (Assets bölüm adları; kit menüsü büyük harfi CSS ile verir). */
function titleCase(s: string): string {
  return s.split(' ').map((w) => (w.length <= 2 && w === w.toUpperCase() && w !== '&' ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

let wikiInstance: WikiPanel | null = null;
/** Codex'i sahnelerden aç (ana menü > Codex); `section` verilirse o bölümde (ya da 'bölüm:madde') açılır. */
export function openWiki(section?: string): void {
  if (!wikiInstance) return;
  if (section) wikiInstance.show(section);
  wikiInstance.setOpen(true);
}
