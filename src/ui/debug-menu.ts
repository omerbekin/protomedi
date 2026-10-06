/**
 * Oyun içi debug menüsü (DOM üstünde, gerçek piksel ölçüsünde; dokunma hedefleri >= 44px).
 * Sekmeli: her sekmede düğme ızgaraları (register) ve özel paneller (registerPanel: galeri, ses listesi, seed...) bulunur.
 * Altta, sekmeden bağımsız hep görünen bölümlü hızlı düğme dock'u vardır (her düğme: ikon + kısa işlev yazısı + tooltip; açık/kapalı rozeti). Her yeni ekran/özellik buraya bir giriş koyar ki arayüzden test edilebilsin.
 */
import { DOCK_GROUPS, DOCK_HINT, DOCK_KEYS, dockBadge, dockTooltip, type DockGroup } from './debug-layout';
import { iconUrl } from './dom-icons';

/** Debug menüsünün altına sabitlenen hızlı düğme: ikon + kısa işlev yazısı (+ açık/kapalı rozeti), bir bölümde. */
export interface DockSpec {
  /** Bölüm (başlıklı grup) ve bölüm içi sıra. */
  group: DockGroup;
  order: number;
  /** Düğmenin yanındaki kısa işlev yazısı (1-3 kelime, İngilizce). */
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
  /** true: yalnızca dock'ta görünür (sekmedeki ızgarada tekrar edilmez). */
  dockOnly?: boolean;
  label: string | (() => string);
  /** Uzun açıklama (düğmenin üstüne gelince görünür); etiket kısa tutulur. */
  hint?: string;
  /** Açık/kapalı düğmelerde: açıkken vurgulanır. */
  on?: () => boolean;
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
  /** Küçük ikon (src/ui/icon-kinds.ts adı). */
  icon?: string;
}

/** Paneller için ortak düğme (>= 44px). */
export function debugButton(label: string, onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `debug-action${opts.on ? ' on' : ''}${opts.className ? ` ${opts.className}` : ''}`;
  if (opts.icon) {
    const url = iconUrl(opts.icon);
    if (url) {
      const img = document.createElement('img');
      img.className = 'debug-action-icon';
      img.src = url;
      img.alt = '';
      btn.append(img);
    }
  }
  btn.append(document.createTextNode(label));
  if (opts.title) btn.title = opts.title;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Bölüm başlığı + düğme ızgarası. */
export function debugSection(title: string, ...children: HTMLElement[]): HTMLElement[] {
  const h = document.createElement('h3');
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'debug-grid';
  grid.append(...children);
  return [h, grid];
}

const SIDE_KEY = 'proto.debug.side';

export class DebugMenu {
  private readonly actions = new Map<string, DebugAction>();
  private readonly panels = new Map<string, DebugPanel>();
  private readonly infoProviders = new Map<string, DebugInfo>();
  private readonly panel: HTMLDivElement;
  private infoEl: HTMLDListElement | null = null;
  private infoTimer = 0;
  private open = false;
  private tab: string;
  private readonly scroll = new Map<string, number>();
  private body: HTMLDivElement | null = null;
  private ghost = false;
  private dockOpen = true;
  private dockScroll = 0;

  constructor(
    root: HTMLElement,
    /** Sekmelerin sırası; sonuncusu 'Info' (bilgi paneli) olmalı. */
    private readonly tabOrder: string[] = ['Battle', 'Info'],
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

    // The menu's own view controls live in the dock's "View" group
    this.register({
      id: 'view.see-through',
      tab: 'Battle',
      section: 'View',
      dockOnly: true,
      dock: { group: 'View', order: 0, icon: 'eye', short: 'See-through', on: () => this.ghost },
      label: () => (this.ghost ? 'See-through: on' : 'See-through: off'),
      hint: 'Make the menu transparent so you can watch the battle behind it (use the Solid button at the top to restore)',
      run: () => this.setGhost(!this.ghost),
    });
    this.register({
      id: 'view.side',
      tab: 'Battle',
      section: 'View',
      dockOnly: true,
      dock: { group: 'View', order: 1, icon: 'swap', short: 'Side', state: () => (this.panel.classList.contains('left') ? 'Left' : 'Right') },
      label: () => (this.panel.classList.contains('left') ? 'Side: left' : 'Side: right'),
      hint: 'Move the menu to the other side of the screen',
      run: () => this.toggleSide(),
    });

    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === '`' || e.key === 'F2') this.setOpen(!this.open);
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

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
    window.clearInterval(this.infoTimer);
    if (open) this.infoTimer = window.setInterval(() => this.fillInfo(), 400);
    this.render();
  }

  /** Belirtilen sekmeyi açar (menü kapalıysa önce açar). */
  openTab(tab: string): void {
    this.tab = tab;
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
    const used = new Set<string>(['Info']);
    for (const a of this.actions.values()) if (!a.dockOnly) used.add(a.tab);
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
    const tools = document.createElement('div');
    tools.className = 'debug-header-tools';
    if (this.ghost) {
      tools.append(debugButton('Solid', () => this.setGhost(false), { icon: 'eye', title: 'The menu is see-through. Click to make it solid again.', className: 'debug-header-btn' }));
    }
    tools.append(debugButton('Close', () => this.setOpen(false), { title: 'Close the debug menu (` or F2 also toggles it)', className: 'debug-header-btn' }));
    header.append(title, tools);
    this.panel.append(header);

    const tabs = this.tabs();
    if (!tabs.includes(this.tab)) this.tab = tabs[0] ?? 'Info';
    const bar = document.createElement('div');
    bar.className = 'debug-tabs';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = `debug-tab${t === this.tab ? ' on' : ''}`;
      b.textContent = t;
      b.addEventListener('click', () => {
        this.tab = t;
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
    this.renderDock();
    body.scrollTop = this.scroll.get(this.tab) ?? 0;
  }

  private fillBody(body: HTMLElement): void {
    const refresh = (): void => this.render();
    const sections = new Map<string, DebugAction[]>();
    for (const action of this.actions.values()) {
      if (action.dockOnly || action.tab !== this.tab) continue;
      const list = sections.get(action.section) ?? [];
      list.push(action);
      sections.set(action.section, list);
    }
    for (const [name, list] of sections) {
      const buttons = list.map((action) => {
        const label = typeof action.label === 'function' ? action.label() : action.label;
        return debugButton(
          label,
          () => {
            action.run();
            // After a scene restart the new values are ready on the next frame
            requestAnimationFrame(() => this.render());
          },
          { ...(action.hint ? { title: action.hint } : {}), on: action.on?.() ?? false },
        );
      });
      body.append(...debugSection(name, ...buttons));
    }
    for (const p of this.panels.values()) {
      if (p.tab !== this.tab) continue;
      const wrap = document.createElement('div');
      wrap.className = 'debug-block';
      p.render(wrap, refresh);
      body.append(wrap);
    }
    if (this.tab === 'Info') {
      const info = document.createElement('dl');
      info.className = 'debug-info';
      this.infoEl = info;
      this.fillInfo();
      body.append(info);
    }
  }

  /** Sık kullanılan düğmeler: menünün altına sabit, bölümlü; her düğme ikon + kısa işlev yazısı + (toggle ise) ON/OFF rozeti. */
  private renderDock(): void {
    const groups = new Map<string, DebugAction[]>();
    for (const action of this.actions.values()) {
      if (!action.dock) continue;
      const list = groups.get(action.dock.group) ?? [];
      list.push(action);
      groups.set(action.dock.group, list);
    }
    if (groups.size === 0) return;
    const dock = document.createElement('div');
    dock.className = 'debug-dock';

    const bar = document.createElement('div');
    bar.className = 'debug-dock-bar';
    const hintEl = document.createElement('span');
    hintEl.className = 'debug-dock-hint';
    const defaultHint = `${DOCK_HINT}  |  ${DOCK_KEYS}`;
    hintEl.textContent = defaultHint;
    const fold = document.createElement('button');
    fold.className = 'debug-dock-fold';
    fold.textContent = this.dockOpen ? 'Hide' : 'Quick actions';
    fold.title = this.dockOpen ? 'Hide the quick actions to see more of the tab' : 'Show the quick actions';
    fold.addEventListener('click', () => {
      this.dockOpen = !this.dockOpen;
      this.render();
    });
    bar.append(hintEl, fold);
    dock.append(bar);

    if (this.dockOpen) {
      const scroller = document.createElement('div');
      scroller.className = 'debug-dock-scroll';
      scroller.addEventListener('scroll', () => {
        this.dockScroll = scroller.scrollTop;
      });
      const names = [...DOCK_GROUPS, ...[...groups.keys()].filter((g) => !(DOCK_GROUPS as readonly string[]).includes(g))];
      for (const name of names) {
        const list = groups.get(name);
        if (!list) continue;
        const h = document.createElement('h4');
        h.className = 'debug-dock-title';
        h.textContent = name;
        const grid = document.createElement('div');
        grid.className = 'debug-dock-grid';
        for (const action of list.sort((x, y) => x.dock!.order - y.dock!.order)) grid.append(this.dockButton(action, hintEl, defaultHint));
        scroller.append(h, grid);
      }
      dock.append(scroller);
      // Restored after attach (scrollTop needs layout)
      requestAnimationFrame(() => {
        scroller.scrollTop = this.dockScroll;
      });
    }
    this.panel.append(dock);
  }

  private dockButton(action: DebugAction, hintEl: HTMLElement, defaultHint: string): HTMLButtonElement {
    const spec = action.dock!;
    const label = typeof action.label === 'function' ? action.label() : action.label;
    const badge = dockBadge(spec.on?.(), spec.state?.());
    const tip = dockTooltip(label, action.hint, badge);
    const btn = document.createElement('button');
    btn.className = 'debug-dock-btn';
    if (spec.on?.()) btn.classList.add('on');
    btn.title = tip;
    btn.setAttribute('aria-label', `${spec.short}${badge ? `: ${badge.text}` : ''}`);
    btn.addEventListener('mouseenter', () => {
      hintEl.textContent = tip;
    });
    btn.addEventListener('mouseleave', () => {
      hintEl.textContent = defaultHint;
    });

    const ic = typeof spec.icon === 'function' ? spec.icon() : { name: spec.icon };
    const iconBox = document.createElement('span');
    iconBox.className = 'debug-dock-iconbox';
    const main = document.createElement('img');
    main.className = 'debug-dock-icon';
    main.src = iconUrl(ic.name, ic.accent);
    main.alt = '';
    iconBox.append(main);
    if (ic.overlay) {
      const over = document.createElement('img');
      over.className = 'debug-dock-overlay';
      over.src = iconUrl(ic.overlay);
      over.alt = '';
      iconBox.append(over);
    }
    const text = document.createElement('span');
    text.className = 'debug-dock-text';
    const name = document.createElement('span');
    name.className = 'debug-dock-label';
    name.textContent = spec.short;
    text.append(name);
    if (badge) {
      const b = document.createElement('span');
      b.className = `debug-dock-badge ${badge.kind}`;
      b.textContent = badge.text;
      text.append(b);
    }
    btn.append(iconBox, text);
    btn.addEventListener('click', () => {
      action.run();
      requestAnimationFrame(() => this.render());
    });
    return btn;
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
