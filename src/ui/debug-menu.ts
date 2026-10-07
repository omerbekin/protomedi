/**
 * Oyun içi debug menüsü (DOM üstünde, gerçek piksel ölçüsünde; dokunma hedefleri >= 44px).
 * TEK yapı: sekmeler; her sekmede İKONLU düğmeler (ikon + kısa etiket + ON/OFF ya da değer rozeti). Ayrı yazı-düğme grubu ve ayrı dock yoktur.
 * İlk sekme 'Quick': en sık kullanılan eylemler (`dock` alanı olanlar) aynı ikonlu görünümde. Sekmelerde ayrıca özel paneller
 * (registerPanel: birim araçları, skill cast, seed, test takımı...) bulunur. Her yeni ekran/özellik buraya bir giriş koyar ki arayüzden test edilebilsin.
 */
import { DEFAULT_ACTION_ICON, DOCK_GROUPS, DOCK_HINT, DOCK_KEYS, QUICK_TAB, SECTION_ICONS, TAB_ICONS, dockBadge, dockTooltip, labelBadge, labelBase, type DockBadge, type DockGroup } from './debug-layout';
import { iconUrl } from './dom-icons';

/** Sekme çubuğundaki kısa etiketler (dar ızgara hücresine sığsın; tam ad düğmenin ipucunda). */
const TAB_LABELS: Record<string, string> = { 'Speed & View': 'View', 'Test Mode': 'Test', Characters: 'Chars', Versions: 'Ver' };

/** Quick sekmesine girecek eylemin bölümü ve sırası (sekmedeki asıl yeri `tab`/`section` olarak kalır). */
export interface DockSpec {
  /** Quick sekmesindeki bölüm ve bölüm içi sıra. */
  group: DockGroup;
  order: number;
  /** Düğmenin kısa işlev yazısı (1-3 kelime, İngilizce). */
  short: string;
  /** Seçili değer rozeti (ör. hız "2x"); yoksa `on` varsa ON/OFF gösterilir. */
  state?: () => string;
  /** İkon adı (src/ui/icon-kinds.ts) ya da dinamik ikon (ör. sıradaki birimin logosu + küçük ok). */
  icon: string | (() => { name: string; accent?: string; overlay?: string });
  /** Açık/kapalı durumu (açıkken vurgulanır). */
  on?: () => boolean;
}

export interface DebugAction {
  id: string;
  /** Sekme adı (ör. 'Battle', 'Unit'). */
  tab: string;
  /** Sekme içindeki bölüm başlığı. */
  section: string;
  dock?: DockSpec;
  /** true: yalnızca Quick sekmesinde görünür (kendi sekmesinde tekrar edilmez). */
  dockOnly?: boolean;
  label: string | (() => string);
  /** Uzun açıklama (düğmenin üstüne gelince görünür); etiket kısa tutulur. */
  hint?: string;
  /** Açık/kapalı düğmelerde: açıkken vurgulanır. */
  on?: () => boolean;
  /** Düğme ikonu (dock ikonu yoksa); her düğmenin bir ikonu olur. */
  icon?: string;
  run: () => void;
}

/** Özel içerikli panel: `render` her yenilemede içeriği baştan kurar; `refresh` menüyü yeniden çizer. */
export interface DebugPanel {
  id: string;
  tab: string;
  render: (el: HTMLElement, refresh: () => void) => void;
}

export type DebugInfo = () => Record<string, string>;

export interface ButtonOpts {
  title?: string;
  on?: boolean;
  className?: string;
  /** Küçük ikon (src/ui/icon-kinds.ts adı). Verilirse düğme ikonlu görünümde çizilir. */
  icon?: string;
  /** İkonun rengi (ör. sınıf rengi). */
  accent?: string;
  /** Sağ üstte küçük ikinci ikon (ör. "sıradaki" oku). */
  overlay?: string;
  badge?: DockBadge | null;
}

function iconImg(name: string, cls: string, accent?: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = iconUrl(name, accent);
  img.alt = '';
  return img;
}

/** Ortak ikonlu düğme: [ikon] etiket (+ rozet). Sekmelerdeki tüm düğmeler bu görünümdedir. */
export function iconButton(label: string, onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `debug-action debug-ibtn${opts.on ? ' on' : ''}${opts.className ? ` ${opts.className}` : ''}`;
  if (opts.icon) {
    const box = document.createElement('span');
    box.className = 'debug-ibtn-iconbox';
    box.append(iconImg(opts.icon, 'debug-ibtn-icon', opts.accent));
    if (opts.overlay) box.append(iconImg(opts.overlay, 'debug-ibtn-overlay'));
    btn.append(box);
  }
  const text = document.createElement('span');
  text.className = 'debug-ibtn-text';
  const name = document.createElement('span');
  name.className = 'debug-ibtn-label';
  name.textContent = label;
  text.append(name);
  if (opts.badge) {
    const b = document.createElement('span');
    b.className = `debug-ibtn-badge ${opts.badge.kind}`;
    b.textContent = opts.badge.text;
    text.append(b);
  }
  btn.append(text);
  if (opts.title) btn.title = opts.title;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Paneller için ortak düğme (>= 44px). İkon verilirse ikonlu görünüm; verilmezse sade yazı (yalnızca hücre ızgarası gibi seçiciler). */
export function debugButton(label: string, onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  if (opts.icon) return iconButton(label, onClick, opts);
  const btn = document.createElement('button');
  btn.className = `debug-action${opts.on ? ' on' : ''}${opts.className ? ` ${opts.className}` : ''}`;
  btn.append(document.createTextNode(label));
  if (opts.title) btn.title = opts.title;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Bölüm başlığı (varsa ikonlu). */
export function debugHeading(title: string): HTMLElement {
  const h = document.createElement('h3');
  const icon = SECTION_ICONS[title];
  if (icon) h.append(iconImg(icon, 'debug-h-icon'));
  h.append(document.createTextNode(title));
  return h;
}

/** Bölüm başlığı + düğme ızgarası. */
export function debugSection(title: string, ...children: HTMLElement[]): HTMLElement[] {
  const grid = document.createElement('div');
  grid.className = 'debug-grid';
  grid.append(...children);
  return [debugHeading(title), grid];
}

const SIDE_KEY = 'proto.debug.side';

export class DebugMenu {
  private readonly actions = new Map<string, DebugAction>();
  private readonly panels = new Map<string, DebugPanel>();
  private readonly infoProviders = new Map<string, DebugInfo>();
  private readonly tabHooks = new Map<string, () => void>();
  private readonly panel: HTMLDivElement;
  private infoEl: HTMLDListElement | null = null;
  private infoTimer = 0;
  private open = false;
  private tab: string;
  private readonly scroll = new Map<string, number>();
  private body: HTMLDivElement | null = null;
  private ghost = false;

  constructor(
    root: HTMLElement,
    /** Sekmelerin sırası; sonuncusu 'Info' (bilgi paneli) olmalı. */
    private readonly tabOrder: string[] = [QUICK_TAB, 'Battle', 'Info'],
    /** Canlı bilgi panelinin (Info) gösterildiği sekme. */
    private readonly infoTab: string = 'Info',
  ) {
    this.tab = tabOrder[0] ?? 'Battle';
    const toggle = document.createElement('button');
    toggle.className = 'debug-toggle';
    toggle.textContent = 'DEBUG';
    toggle.setAttribute('aria-label', 'Toggle debug menu');
    toggle.addEventListener('click', () => this.setOpen(!this.open));

    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;
    try {
      if (window.localStorage.getItem(SIDE_KEY) === 'left') this.panel.classList.add('left');
    } catch {
      /* storage unavailable: default side */
    }

    root.append(toggle, this.panel);

    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === '`' || e.key === 'F2') this.setOpen(!this.open);
    });
  }

  /** Menünün kendi görünüm düğmeleri (See-through, Side): 'Speed & View' sekmesinin 'Menu' bölümü + Quick; araçlar kaydedildikten sonra çağrılır. */
  registerMenuControls(): void {
    this.register({
      id: 'view.see-through',
      tab: 'Speed & View',
      section: 'Menu',
      dock: { group: 'Speed & View', order: 3, icon: 'eye', short: 'See-through', on: () => this.ghost },
      label: () => (this.ghost ? 'See-through: on' : 'See-through: off'),
      hint: 'Make the menu transparent so you can watch the battle behind it (use the Solid button at the top to restore)',
      run: () => this.setGhost(!this.ghost),
    });
    this.register({
      id: 'view.side',
      tab: 'Speed & View',
      section: 'Menu',
      dock: { group: 'Speed & View', order: 4, icon: 'swap', short: 'Side', state: () => (this.panel.classList.contains('left') ? 'Left' : 'Right') },
      label: () => (this.panel.classList.contains('left') ? 'Side: left' : 'Side: right'),
      hint: 'Move the menu to the other side of the screen',
      run: () => this.toggleSide(),
    });
  }

  register(action: DebugAction): void {
    this.actions.set(action.id, action);
    this.render();
  }

  registerPanel(panel: DebugPanel): void {
    this.panels.set(panel.id, panel);
    this.render();
  }

  registerInfo(id: string, provider: DebugInfo): void {
    this.infoProviders.set(id, provider);
    this.render();
  }

  /** Bir sekme açıldığında (başka sekmeden geçilince ya da openTab ile) çalışır; menü yeniden çizilmeden önce. */
  onTabOpen(tab: string, fn: () => void): void {
    this.tabHooks.set(tab, fn);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
    window.clearInterval(this.infoTimer);
    if (open) this.infoTimer = window.setInterval(() => this.fillInfo(), 400);
    this.render();
  }

  private setTab(tab: string): void {
    const changed = tab !== this.tab;
    this.tab = tab;
    if (changed) this.tabHooks.get(tab)?.();
  }

  /** Belirtilen sekmeyi açar (menü kapalıysa önce açar). */
  openTab(tab: string): void {
    this.setTab(tab);
    if (!this.open) this.setOpen(true);
    else this.render();
  }

  private setGhost(on: boolean): void {
    this.ghost = on;
    this.render();
  }

  private toggleSide(): void {
    const left = this.panel.classList.toggle('left');
    try {
      window.localStorage.setItem(SIDE_KEY, left ? 'left' : 'right');
    } catch {
      /* ignore */
    }
  }

  /** Menüyü şimdi yeniden çizer (kaydırma ve sekme korunur). */
  refresh(): void {
    this.render();
  }

  private tabs(): string[] {
    const used = new Set<string>([this.infoTab]);
    for (const a of this.actions.values()) {
      if (!a.dockOnly) used.add(a.tab);
      if (a.dock) used.add(QUICK_TAB);
    }
    for (const p of this.panels.values()) used.add(p.tab);
    const ordered = this.tabOrder.filter((t) => used.has(t));
    return [...ordered, ...[...used].filter((t) => !ordered.includes(t))];
  }

  private render(): void {
    if (!this.open) return;
    if (this.body) this.scroll.set(this.tab, this.body.scrollTop);
    this.panel.replaceChildren();
    this.panel.classList.toggle('ghost', this.ghost);

    const header = document.createElement('div');
    header.className = 'debug-header';
    const title = document.createElement('span');
    title.textContent = 'Debug menu';
    title.title = `${DOCK_HINT}  |  ${DOCK_KEYS}`;
    const tools = document.createElement('div');
    tools.className = 'debug-header-tools';
    if (this.ghost) {
      tools.append(debugButton('Solid', () => this.setGhost(false), { icon: 'eye', title: 'The menu is see-through. Click to make it solid again.', className: 'debug-header-btn' }));
    }
    tools.append(debugButton('Close', () => this.setOpen(false), { title: 'Close the debug menu (` or F2 also toggles it)', className: 'debug-header-btn' }));
    header.append(title, tools);
    this.panel.append(header);

    const tabs = this.tabs();
    if (!tabs.includes(this.tab)) this.tab = tabs[0] ?? this.infoTab;
    const bar = document.createElement('div');
    bar.className = 'debug-tabs';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = `debug-tab${t === this.tab ? ' on' : ''}`;
      const ic = TAB_ICONS[t];
      if (ic) b.append(iconImg(ic, 'debug-tab-icon'));
      const label = document.createElement('span');
      label.className = 'debug-tab-label';
      label.textContent = TAB_LABELS[t] ?? t;
      b.title = t;
      b.append(label);
      b.addEventListener('click', () => {
        this.setTab(t);
        this.render();
      });
      bar.append(b);
    }
    this.panel.append(bar);

    const body = document.createElement('div');
    body.className = 'debug-body';
    this.body = body;
    this.infoEl = null;
    this.fillBody(body);
    this.panel.append(body);
    body.scrollTop = this.scroll.get(this.tab) ?? 0;
  }

  private fillBody(body: HTMLElement): void {
    const refresh = (): void => this.render();
    const sections = new Map<string, DebugAction[]>();
    if (this.tab === QUICK_TAB) {
      // Quick: dock alanı olan eylemler, dock bölümlerine göre
      const docked = [...this.actions.values()].filter((a) => a.dock);
      const names = [...DOCK_GROUPS, ...docked.map((a) => a.dock!.group).filter((g) => !(DOCK_GROUPS as readonly string[]).includes(g))];
      for (const name of names) {
        const list = docked.filter((a) => a.dock!.group === name).sort((x, y) => x.dock!.order - y.dock!.order);
        if (list.length > 0 && !sections.has(name)) sections.set(name, list);
      }
    } else {
      for (const action of this.actions.values()) {
        if (action.dockOnly || action.tab !== this.tab) continue;
        const list = sections.get(action.section) ?? [];
        list.push(action);
        sections.set(action.section, list);
      }
    }
    for (const [name, list] of sections) body.append(...debugSection(name, ...list.map((a) => this.actionButton(a))));
    for (const p of this.panels.values()) {
      if (p.tab !== this.tab) continue;
      const wrap = document.createElement('div');
      wrap.className = 'debug-block';
      p.render(wrap, refresh);
      body.append(wrap);
    }
    if (this.tab === this.infoTab) {
      const info = document.createElement('dl');
      info.className = 'debug-info';
      this.infoEl = info;
      this.fillInfo();
      body.append(info);
    }
  }

  /** Bir eylemin ikonlu düğmesi: [ikon] kısa etiket (+ ON/OFF ya da değer rozeti), açıklama tooltip'te. */
  private actionButton(action: DebugAction): HTMLButtonElement {
    const spec = action.dock;
    const label = typeof action.label === 'function' ? action.label() : action.label;
    const badge = spec ? dockBadge(spec.on?.(), spec.state?.()) : labelBadge(label);
    const text = spec?.short ?? labelBase(label);
    const ic = spec ? (typeof spec.icon === 'function' ? spec.icon() : { name: spec.icon }) : { name: action.icon ?? DEFAULT_ACTION_ICON };
    const on = spec?.on?.() ?? action.on?.() ?? false;
    const isValueBtn = !spec && !badge; // "2x", "Always crit": etiketin kendisi değer
    return iconButton(
      isValueBtn ? label : text,
      () => {
        action.run();
        // After a scene restart the new values are ready on the next frame
        requestAnimationFrame(() => this.render());
      },
      { icon: ic.name, ...(ic.accent ? { accent: ic.accent } : {}), ...(ic.overlay ? { overlay: ic.overlay } : {}), badge, on, title: dockTooltip(isValueBtn ? label : text, action.hint, badge) },
    );
  }

  /** Only the info block is refreshed periodically (buttons stay untouched so taps are never lost). */
  private fillInfo(): void {
    if (!this.infoEl) return;
    const rows: HTMLElement[] = [];
    for (const provider of this.infoProviders.values()) {
      for (const [key, value] of Object.entries(provider())) {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = value;
        rows.push(dt, dd);
      }
    }
    this.infoEl.replaceChildren(...rows);
  }
}
