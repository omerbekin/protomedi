import { iconUrl } from './dom-icons';
import { lockInput, unlockInput } from './input-lock';
import { currentSupport, IOS_HINT, isStandalone, onFullscreenChange, toggleFullscreen } from './fullscreen';

/**
 * Ayarlar ekranı (Ömer 2026-10-08): sağ üstteki dişli ve küçük panel KALDIRILDI; ayarlar artık ekranın ortasında büyük, menü
 * stilinde (koyu deri / altın çerçeve, serif) ayrı bir ekrandır. Oyun içi menülerden açılır: sefer > Menu (Esc) > Settings, savaş /
 * takım seçimi > Menu (Esc) > Settings. (Ana menünün Settings'i 2026-10-08'den beri kendi sol sütun görünümüdür, MainMenuScene; aynı
 * değerleri `setSettingsVolume` / `loadVolume` ile kullanır.) "Back" (ya da Esc) ekranı kapatır; altta açık olan menü yeniden görünür.
 * İçerik: ses seviyesi (0-10, tarayıcıda saklanır) + tam ekran. Oyun akışı eylemleri (New Game / Team Select / Main Menu) menüdedir
 * (`src/ui/game-menu.ts`).
 */
export interface SettingsHooks {
  /** Ses seviyesi değişti (0..10). */
  onVolume: (level: number) => void;
  /** Kaydırıcı bırakıldığında duyulacak deneme sesi. */
  preview: () => void;
}

const KEY = 'proto.settings.v1';
export const DEFAULT_VOLUME = 7;

export function loadVolume(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? Number((JSON.parse(raw) as { volume?: number }).volume) : NaN;
    return Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v))) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function saveVolume(volume: number): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ volume }));
  } catch {
    // saklama kapalıysa (gizli pencere vb.) sessizce geç
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class SettingsScreen {
  private readonly overlay: HTMLDivElement;
  private open = false;
  private onBack: (() => void) | undefined;
  /** Ses seviyesini uygular (kaydırıcı, saklama, ses motoru); ana menünün Settings sütunu da bunu kullanır. */
  readonly applyVolume: (level: number, preview: boolean) => void;

  constructor(root: HTMLElement, hooks: SettingsHooks) {
    this.overlay = el('div', 'st-overlay');
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Settings');
    const modal = el('div', 'st-modal');
    const head = el('div', 'st-head');
    const gear = el('img', 'st-headicon');
    gear.src = iconUrl('gear');
    gear.alt = '';
    head.append(gear, el('div', 'st-title', 'Settings'));
    const body = el('div', 'st-body');

    // --- Audio: ses seviyesi (0-10); - / + düğmeleri dokunmatikte ince ayar için ---
    const audio = el('section', 'st-section');
    audio.append(el('div', 'st-section-title', 'Audio'));
    const row = el('div', 'st-row');
    const icon = el('img', 'st-icon');
    icon.src = iconUrl('speaker');
    icon.alt = '';
    const name = el('span', 'st-label', 'Sound volume');
    const minus = el('button', 'st-btn st-step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Lower volume');
    const slider = el('input', 'st-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '10';
    slider.step = '1';
    slider.value = String(loadVolume());
    slider.setAttribute('aria-label', 'Sound volume');
    const plus = el('button', 'st-btn st-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Raise volume');
    const value = el('span', 'st-value', slider.value);
    const apply = (this.applyVolume = (level: number, preview: boolean): void => {
      const v = Math.min(10, Math.max(0, level));
      slider.value = String(v);
      value.textContent = String(v);
      saveVolume(v);
      hooks.onVolume(v);
      if (preview) hooks.preview();
    });
    slider.addEventListener('input', () => apply(Number(slider.value), false));
    slider.addEventListener('change', () => hooks.preview());
    minus.addEventListener('click', () => apply(Number(slider.value) - 1, true));
    plus.addEventListener('click', () => apply(Number(slider.value) + 1, true));
    const control = el('div', 'st-control');
    control.append(minus, slider, plus, value);
    row.append(icon, name, control);
    audio.append(row);
    body.append(audio);

    // --- Display: tam ekran (Fullscreen API yoksa satır yok; iPhone'da ipucu) ---
    const support = currentSupport();
    if (support !== 'none' && !isStandalone()) {
      const display = el('section', 'st-section');
      display.append(el('div', 'st-section-title', 'Display'));
      const fsRow = el('div', 'st-row');
      const fsIcon = el('img', 'st-icon');
      fsIcon.alt = '';
      const fsBtn = el('button', 'st-btn st-wide');
      fsBtn.type = 'button';
      const note = el('div', 'st-note');
      fsBtn.addEventListener('click', () => {
        if (support === 'ios') note.textContent = IOS_HINT;
        else void toggleFullscreen();
      });
      onFullscreenChange((on) => {
        fsIcon.src = iconUrl(on ? 'exitfullscreen' : 'fullscreen');
        fsBtn.textContent = on ? 'Exit fullscreen' : 'Enter fullscreen';
      });
      const fsControl = el('div', 'st-control');
      fsControl.append(fsBtn);
      fsRow.append(fsIcon, el('span', 'st-label', 'Fullscreen'), fsControl);
      display.append(fsRow, note);
      body.append(display);
    }

    const foot = el('div', 'st-foot');
    const back = el('button', 'st-btn st-back', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => this.setOpen(false));
    foot.append(back);
    modal.append(head, body, foot);
    this.overlay.append(modal);
    // Boş zemine dokunmak bir şey yapmaz (yanlışlıkla kapanmasın); kapatma: Back ya da Esc
    root.append(this.overlay);
    // Fare bırakması alttaki Phaser sahnesine gitmesin (Phaser window mouseup'ı dinler, defaultPrevented olanı yok sayar); asıl güvence giriş kilidi
    this.overlay.addEventListener('mouseup', (e) => e.preventDefault());

    // Esc: açıkken ekranı kapatır; oyunun kendi Esc işleyicilerine (Phaser, savaş kısayolları) gitmez
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || e.key === '`' || e.key === 'F2') return; // debug menüsü kısayolu çalışmaya devam eder
        e.stopImmediatePropagation(); // diğer kısayollar oyuna gitmez (kaydırıcının ok tuşları varsayılan davranışla çalışır)
        if (e.key !== 'Escape') return;
        e.preventDefault();
        this.setOpen(false);
      },
      true,
    );
    hooks.onVolume(Number(slider.value));
    registerSettingsScreen(this);
  }

  /** Açar (isteğe bağlı: kapanınca çağrılacak geri dönüş) ya da kapatır. */
  setOpen(open: boolean, onBack?: () => void): void {
    if (open) this.onBack = onBack;
    const was = this.open;
    this.open = open;
    this.overlay.hidden = !open;
    if (open) lockInput('settings');
    else if (was) unlockInput('settings');
    if (was && !open) {
      const cb = this.onBack;
      this.onBack = undefined;
      cb?.();
    }
  }

  get isOpen(): boolean {
    return this.open;
  }
}

/** Sahnelerden (ana menü, sefer menüsü, savaş menüsü) ayarlar ekranını açıp kapatmak için tek örnek. */
let instance: SettingsScreen | null = null;
export function registerSettingsScreen(screen: SettingsScreen): void {
  instance = screen;
}
/** Ayarlar ekranını aç / kapat; `onBack` ekran kapanınca (Back, Esc) çağrılır. */
export function setSettingsOpen(open: boolean, onBack?: () => void): void {
  instance?.setOpen(open, onBack);
}
/** Ses seviyesini değiştir (0-10; ana menü Settings sütunu); `preview` true ise deneme sesi çalar. Ekran yoksa yalnızca saklar. */
export function setSettingsVolume(level: number, preview = false): void {
  if (instance) instance.applyVolume(level, preview);
  else saveVolume(Math.min(10, Math.max(0, Math.round(level))));
}
export function isSettingsOpen(): boolean {
  return instance?.isOpen ?? false;
}
