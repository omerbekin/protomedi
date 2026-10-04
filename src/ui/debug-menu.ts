/**
 * Oyun içi debug menüsü (DOM üstünde, gerçek piksel ölçüsünde; dokunma hedefleri >= 44px).
 * Sahneler ve özellikler kendi düğmelerini register() ile ekler. Her yeni ekran/özellik
 * buraya bir giriş koyar ki arayüzden test edilebilsin.
 */
export interface DebugAction {
  id: string;
  section: string;
  label: string | (() => string);
  run: () => void;
}

export type DebugInfo = () => Record<string, string>;

export class DebugMenu {
  private readonly actions = new Map<string, DebugAction>();
  private readonly infoProviders = new Map<string, DebugInfo>();
  private readonly panel: HTMLDivElement;
  private infoEl: HTMLDListElement | null = null;
  private infoTimer = 0;
  private open = false;

  constructor(root: HTMLElement) {
    const toggle = document.createElement('button');
    toggle.className = 'debug-toggle';
    toggle.textContent = 'DEBUG';
    toggle.setAttribute('aria-label', 'Toggle debug menu');
    toggle.addEventListener('click', () => this.setOpen(!this.open));

    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;

    root.append(toggle, this.panel);

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === 'F2') this.setOpen(!this.open);
    });
  }

  register(action: DebugAction): void {
    this.actions.set(action.id, action);
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

  render(): void {
    if (!this.open) return;
    this.panel.replaceChildren();

    const header = document.createElement('div');
    header.className = 'debug-header';
    const title = document.createElement('span');
    title.textContent = 'Debug menu';
    const close = document.createElement('button');
    close.className = 'debug-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.setOpen(false));
    header.append(title, close);
    this.panel.append(header);

    const sections = new Map<string, DebugAction[]>();
    for (const action of this.actions.values()) {
      const list = sections.get(action.section) ?? [];
      list.push(action);
      sections.set(action.section, list);
    }
    for (const [name, list] of sections) {
      const h = document.createElement('h3');
      h.textContent = name;
      this.panel.append(h);
      for (const action of list) {
        const btn = document.createElement('button');
        btn.className = 'debug-action';
        btn.textContent = typeof action.label === 'function' ? action.label() : action.label;
        btn.addEventListener('click', () => {
          action.run();
          // After a scene restart the new values are ready on the next frame
          requestAnimationFrame(() => this.render());
        });
        this.panel.append(btn);
      }
    }

    const infoTitle = document.createElement('h3');
    infoTitle.textContent = 'Info';
    const info = document.createElement('dl');
    info.className = 'debug-info';
    this.infoEl = info;
    this.fillInfo();
    this.panel.append(infoTitle, info);
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
