import { iconUrl } from './dom-icons';
import { flowButtons, type FlowContext } from '../game/session-flow';
import { currentSupport, IOS_HINT, isStandalone, onFullscreenChange, toggleFullscreen } from './fullscreen';

/**
 * Oyun içi ayarlar: sağ üstte dişli düğmesi; şimdilik yalnızca ses seviyesi kaydırıcısı (0-10). Değer tarayıcıda saklanır.
 */
export interface SettingsHooks {
  /** Ses seviyesi değişti (0..10). */
  onVolume: (level: number) => void;
  /** Kaydırıcı bırakıldığında duyulacak deneme sesi. */
  preview: () => void;
  /** Oyun akışı düğmeleri (New Game / Team Select); verilmezse satırlar gösterilmez. */
  flow?: {
    context: () => FlowContext;
    newGame: () => void;
    teamSelect: () => void;
  };
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

    // Tam ekran satırı (Fullscreen API yoksa gizli; iPhone'da ipucu gösterir)
    const support = currentSupport();
    if (support !== 'none' && !isStandalone()) {
      const fsRow = document.createElement('div');
      fsRow.className = 'settings-row';
      const fsIcon = document.createElement('img');
      fsIcon.alt = '';
      const fsName = document.createElement('span');
      fsName.textContent = 'Fullscreen';
      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'settings-btn';
      const note = document.createElement('span');
      note.className = 'settings-note';
      fsBtn.addEventListener('click', () => {
        if (support === 'ios') note.textContent = IOS_HINT;
        else void toggleFullscreen();
      });
      onFullscreenChange((on) => {
        fsIcon.src = iconUrl(on ? 'exitfullscreen' : 'fullscreen');
        fsBtn.textContent = on ? 'Exit' : 'Enter';
      });
      fsRow.append(fsIcon, fsName, fsBtn);
      this.panel.append(fsRow, note);
    }
    if (hooks.flow) this.buildFlow(hooks.flow);
    root.append(toggle, this.panel);
    hooks.onVolume(Number(slider.value));
  }

  /** New Game / Team Select rows. An unfinished battle asks "Leave the current battle?" (Yes / No) first. */
  private buildFlow(flow: NonNullable<SettingsHooks['flow']>): void {
    const mkBtn = (label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'settings-btn';
      b.textContent = label;
      return b;
    };
    const mkRow = (icon: string, label: string, btn: HTMLButtonElement): HTMLDivElement => {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const img = document.createElement('img');
      img.src = iconUrl(icon);
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = label;
      row.append(img, name, btn);
      return row;
    };
    const newBtn = mkBtn('Start');
    const teamBtn = mkBtn('Go');
    const newRow = mkRow('dice', 'New Game', newBtn);
    const teamRow = mkRow('team', 'Team Select', teamBtn);

    const confirmBox = document.createElement('div');
    confirmBox.className = 'settings-confirm';
    confirmBox.hidden = true;
    const question = document.createElement('div');
    question.className = 'settings-confirm-text';
    question.textContent = 'Leave the current battle?';
    const answers = document.createElement('div');
    answers.className = 'settings-confirm-row';
    const yes = mkBtn('Yes');
    const no = mkBtn('No');
    answers.append(yes, no);
    confirmBox.append(question, answers);

    let pending: (() => void) | null = null;
    const hideConfirm = (): void => {
      pending = null;
      confirmBox.hidden = true;
    };
    const run = (action: () => void): void => {
      hideConfirm();
      this.setOpen(false);
      action();
    };
    const ask = (action: () => void): void => {
      if (flowButtons(flow.context()).confirm) {
        pending = action;
        confirmBox.hidden = false;
      } else run(action);
    };
    newBtn.addEventListener('click', () => ask(flow.newGame));
    teamBtn.addEventListener('click', () => ask(flow.teamSelect));
    yes.addEventListener('click', () => {
      const action = pending;
      if (action) run(action);
    });
    no.addEventListener('click', hideConfirm);

    // Buttons follow the active scene: hidden when there is no scene; Team Select is hidden on the team select screen itself
    this.refreshFlow = (): void => {
      hideConfirm();
      const f = flowButtons(flow.context());
      newRow.hidden = !f.newGame;
      teamRow.hidden = !f.teamSelect;
    };
    this.panel.append(newRow, teamRow, confirmBox);
    this.refreshFlow();
  }

  private refreshFlow: () => void = () => {};

  setOpen(open: boolean): void {
    this.open = open;
    this.panel.hidden = !open;
    if (open) this.refreshFlow();
  }
}
