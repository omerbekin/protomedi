import { iconUrl } from './dom-icons';

/**
 * Oyun içi ayarlar: sağ üstte dişli düğmesi; şimdilik yalnızca ses seviyesi kaydırıcısı (0-10). Değer tarayıcıda saklanır.
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

export class SettingsMenu {
  private readonly panel: HTMLDivElement;
  private open = false;

  constructor(root: HTMLElement, hooks: SettingsHooks) {
    const toggle = document.createElement('button');
    toggle.className = 'settings-toggle';
    toggle.setAttribute('aria-label', 'Settings');
    toggle.title = 'Settings';
    const gear = document.createElement('img');
    gear.src = iconUrl('gear');
    gear.alt = '';
    toggle.append(gear);
    toggle.addEventListener('click', () => this.setOpen(!this.open));

    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.hidden = true;

    const title = document.createElement('div');
    title.className = 'settings-title';
    title.textContent = 'Settings';

    const row = document.createElement('label');
    row.className = 'settings-row';
    const icon = document.createElement('img');
    icon.src = iconUrl('speaker');
    icon.alt = '';
    const name = document.createElement('span');
    name.textContent = 'Sound';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '10';
    slider.step = '1';
    slider.value = String(loadVolume());
    const value = document.createElement('span');
    value.className = 'settings-value';
    value.textContent = slider.value;
    slider.addEventListener('input', () => {
      value.textContent = slider.value;
      const level = Number(slider.value);
      saveVolume(level);
      hooks.onVolume(level);
    });
    slider.addEventListener('change', () => hooks.preview());
    row.append(icon, name, slider, value);

    this.panel.append(title, row);
    root.append(toggle, this.panel);
    hooks.onVolume(Number(slider.value));
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
  }
}
