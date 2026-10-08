import { MENU_LABELS, menuItems, type FlowContext, type MenuItemId } from '../game/session-flow';
import { isSettingsOpen, setSettingsOpen } from './settings';
import { lockInput, unlockInput } from './input-lock';

/**
 * Oyun içi Menu (Ömer 2026-10-08): sağ üstte "Menu" düğmesi (tam ekran ve wiki simgelerinin solunda, aynı sıra) + Esc.
 * Savaş (hızlı / sefer / multiplayer), takım seçimi ve multiplayer ekranlarında görünür; ana menüde yok, sefer haritası kendi menüsünü
 * kullanır (aynı düğme: `mountMenuToggle`). İçerik `menuItems(ctx)` (saf, `src/game/session-flow.ts`): Resume / Settings / New Game /
 * Team Select / Back to Main Menu; devam eden savaştan çıkış onay ister. Menü açıkken savaş durur (wiki gibi).
 */

/** Sağ üst simge sırasındaki "Menu" düğmesi (wiki ve tam ekranın solunda). */
export function mountMenuToggle(root: HTMLElement, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `settings-toggle menu-toggle ${cls}`.trim();
  b.textContent = 'Menu';
  b.title = 'Menu (Esc)';
  b.setAttribute('aria-label', 'Menu');
  b.addEventListener('click', onClick);
  b.addEventListener('mouseup', (e) => e.preventDefault()); // bırakma alttaki Phaser sahnesine gitmesin
  placeMenuToggle(root, b);
  root.append(b);
  return b;
}

/** Tam ekran düğmesi yoksa (iPhone ana ekran / API yok) Menu bir adım sağa kayar. */
function placeMenuToggle(root: HTMLElement, b: HTMLElement): void {
  const fs = root.querySelector<HTMLElement>('.fullscreen-toggle');
  const fsShown = !!fs && !fs.hidden && getComputedStyle(fs).display !== 'none';
  b.classList.toggle('no-fs', !fsShown);
}

export interface GameMenuHooks {
  context: () => FlowContext;
  newGame: () => void;
  teamSelect: () => void;
  mainMenu: () => void;
  /** Sefer savaşından haritaya geri çekil (savaş sayılmaz). */
  retreat: () => void;
  /** Menü (ya da üstündeki ayarlar ekranı) açıldı / kapandı: savaşı durdur / sürdür. */
  onOpen?: () => void;
  onClose?: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class GameMenu {
  private readonly overlay: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly confirmBox: HTMLDivElement;
  private readonly confirmText: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private open = false;
  private pending: (() => void) | null = null;
  private lastCtx: FlowContext | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: GameMenuHooks,
  ) {
    this.toggle = mountMenuToggle(root, () => this.setOpen(!this.open), 'game-menu-toggle');
    this.toggle.hidden = true;
    this.overlay = el('div', 'gm-overlay');
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Menu');
    const box = el('div', 'gm-box');
    box.append(el('div', 'gm-title', 'Menu'));
    this.list = el('div', 'gm-list');
    this.confirmBox = el('div', 'gm-confirm');
    this.confirmBox.hidden = true;
    this.confirmText = el('div', 'gm-confirm-text');
    const answers = el('div', 'gm-confirm-row');
    const yes = this.button('Yes', true);
    const no = this.button('No');
    yes.addEventListener('click', () => {
      const action = this.pending;
      if (action) this.run(action);
    });
    no.addEventListener('click', () => this.hideConfirm());
    answers.append(yes, no);
    this.confirmBox.append(this.confirmText, answers);
    box.append(this.list, this.confirmBox);
    this.overlay.append(box);
    // Boş zemine dokunmak menüyü kapatır (Resume ile aynı)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.setOpen(false);
    });
    root.append(this.overlay);
    this.overlay.addEventListener('mouseup', (e) => e.preventDefault()); // bırakma alttaki Phaser düğmelerine gitmesin (+ giriş kilidi)

    // Esc: açık menüde önce onay kutusu, sonra menü kapanır; savaşın kendi Esc kısayollarına gitmez (ayarlar ekranı kendi Esc'ini önce alır)
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || isSettingsOpen()) return;
        if (e.key === '`' || e.key === 'F2') return; // debug menüsü kısayolu çalışmaya devam eder
        e.stopImmediatePropagation(); // diğer kısayollar (1-4, Enter...) menü açıkken oyuna gitmez
        if (e.key !== 'Escape') return;
        e.preventDefault();
        if (!this.confirmBox.hidden) this.hideConfirm();
        else this.setOpen(false);
      },
      true,
    );
    // Düğme etkin sahneyi izler (sahne değişince göster / gizle; açık menü sahne değişince kapanır)
    window.setInterval(() => this.sync(), 250);
    this.sync();
    registerGameMenu(this);
  }

  private button(label: string, primary = false): HTMLButtonElement {
    const b = el('button', `gm-btn${primary ? ' primary' : ''}`, label);
    b.type = 'button';
    return b;
  }

  /** Etkin sahneye göre Menu düğmesini göster / gizle. */
  sync(): void {
    const ctx = this.hooks.context();
    const has = !!menuItems(ctx);
    this.toggle.hidden = !has;
    if (has) placeMenuToggle(this.root, this.toggle);
    const sceneChanged = this.lastCtx !== null && sceneOf(this.lastCtx) !== sceneOf(ctx);
    this.lastCtx = ctx;
    if (this.open && (!has || sceneChanged)) this.setOpen(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Esc'in sahnelerden çağrılan yolu: menü yoksa açar, varsa kapatır. Menü bu bağlamda yoksa false. */
  toggleOpen(): boolean {
    if (!menuItems(this.hooks.context())) return false;
    this.setOpen(!this.open);
    return true;
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    const spec = open ? menuItems(this.hooks.context()) : null;
    if (open && !spec) return;
    this.open = open;
    this.overlay.hidden = !open;
    if (open) lockInput('game-menu');
    else unlockInput('game-menu');
    this.hideConfirm();
    if (spec) this.build(spec);
    if (!open && isSettingsOpen()) setSettingsOpen(false);
    if (open) this.hooks.onOpen?.();
    else this.hooks.onClose?.();
  }

  private build(spec: NonNullable<ReturnType<typeof menuItems>>): void {
    this.list.replaceChildren();
    for (const id of spec.items) {
      const b = this.button(MENU_LABELS[id], id === 'resume');
      b.dataset.item = id;
      b.addEventListener('click', () => this.pick(id, spec.confirm[id]));
      this.list.append(b);
    }
  }

  private pick(id: MenuItemId, confirm: string | undefined): void {
    switch (id) {
      case 'resume':
        return this.setOpen(false);
      case 'settings':
        // Ayarlar ekranı menünün üstünde açılır; Back / Esc onu kapatınca menü yeniden görünür (savaş durmaya devam eder)
        return setSettingsOpen(true);
      case 'newGame':
        return this.ask(this.hooks.newGame, confirm);
      case 'teamSelect':
        return this.ask(this.hooks.teamSelect, confirm);
      case 'retreat':
        return this.ask(this.hooks.retreat, confirm);
      case 'mainMenu':
        return this.ask(this.hooks.mainMenu, confirm);
    }
  }

  private ask(action: () => void, confirm: string | undefined): void {
    if (!confirm) return this.run(action);
    this.pending = action;
    this.confirmText.textContent = confirm;
    this.list.hidden = true;
    this.confirmBox.hidden = false;
  }

  private hideConfirm(): void {
    this.pending = null;
    this.confirmBox.hidden = true;
    this.list.hidden = false;
  }

  private run(action: () => void): void {
    this.setOpen(false);
    action();
  }
}

/** Bağlamın ait olduğu sahne (canlı -> bitti geçişi sahne değişimi sayılmaz). */
function sceneOf(ctx: FlowContext): string {
  if (ctx.startsWith('battle')) return 'battle';
  if (ctx.startsWith('campaign-battle')) return 'campaign-battle';
  if (ctx === 'mp-live') return 'mp';
  return ctx;
}

let instance: GameMenu | null = null;
function registerGameMenu(menu: GameMenu): void {
  instance = menu;
}
/** Sahnelerin Esc işleyicisi: kendi Esc işi yoksa menüyü aç / kapat. */
export function toggleGameMenu(): boolean {
  return instance?.toggleOpen() ?? false;
}
export function isGameMenuOpen(): boolean {
  return instance?.isOpen ?? false;
}
export function setGameMenuOpen(open: boolean): void {
  instance?.setOpen(open);
}
