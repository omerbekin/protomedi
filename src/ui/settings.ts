import { lockInput, unlockInput } from './input-lock';
import { SPEED_STEPS, battleSpeed, battleSpeedLabel, onBattleSpeedChange, setBattleSpeed, speedAt, speedIndex, type BattleSpeed } from './battle-speed';
import './motion';
import { onReducedMotionChange, reducedMotion, setReducedMotion } from './motion-pref';
import { openDebugMenu } from './debug-entry';
import { loadUiSoundLevel, onUiSoundLevelChange, previewUiSound, setUiSoundLevel } from './ui-sound';
import { loadMusicLevel, onMusicLevelChange, setMusicLevel, setMusicMaster } from './music';
import { currentSupport, IOS_HINT, isStandalone, onFullscreenChange, toggleFullscreen } from './fullscreen';

/**
 * Oyun içi ayarlar ekranı (sefer > Menu (Esc) > Settings, savaş / takım seçimi > Menu (Esc) > Settings). Ömer 2026-10-08: ana menünün SOL
 * SÜTUN görünümüyle aynı (MainMenuScene > Settings): arkadaki sahne kararıp bulanıklaşır, soldan sağa açılan gölge, altın "Settings" başlığı,
 * kutusuz serif satırlar (seçili satırın önünde kor rengi elmas + hafif parıltı), sağda değer/denetim, sol üstte "◂ Back".
 * Ölçüler oyun birimiyle (--gu: 1 mantıksal birimin CSS pikseli) ve sütun konumu ana menüyle aynı (--menu-x; src/ui/viewport.ts).
 * Klavye: yukarı/aşağı satır, sol/sağ ses, Enter seçer, Esc / Back kapatır; altta açık olan menü yeniden görünür. Açıkken sahne girişi kilitli.
 * İçerik: ses seviyesi (0-10, tarayıcıda saklanır), Music (ana menü müziği 0-10, 0 = kapalı), UI sounds (menü sesleri 0-10, 0 = kapalı), Reduced motion + tam ekran. Oyun akışı eylemleri menüdedir (`src/ui/game-menu.ts`).
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

interface SettingsRow {
  root: HTMLElement;
  run: () => void;
  adjust?: (d: number) => void;
}

export class SettingsScreen {
  private readonly overlay: HTMLDivElement;
  private open = false;
  private onBack: (() => void) | undefined;
  private rows: SettingsRow[] = [];
  private sel = 0;
  /** Ses seviyesini uygular (kaydırıcı, saklama, ses motoru); ana menünün Settings sütunu da bunu kullanır. */
  readonly applyVolume: (level: number, preview: boolean) => void;

  constructor(root: HTMLElement, hooks: SettingsHooks) {
    this.overlay = el('div', 'st-overlay el-modal'); // ortak pencere hareketi (elegant.css > .el-modal)
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Settings');
    const col = el('div', 'st-col el-modal-panel');
    col.append(el('div', 'st-title', 'Settings'));

    // --- Sound volume: − [kaydırıcı] + değer (ana menüdeki satırın aynısı) ---
    const minus = el('button', 'st-step', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Lower volume');
    const slider = el('input', 'st-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '10';
    slider.step = '1';
    slider.value = String(loadVolume());
    slider.setAttribute('aria-label', 'Sound volume');
    const plus = el('button', 'st-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Raise volume');
    const value = el('span', 'st-value', slider.value);
    const paintSlider = (): void => slider.style.setProperty('--fill', `${Number(slider.value) * 10}%`);
    const apply = (this.applyVolume = (level: number, preview: boolean): void => {
      const v = Math.min(10, Math.max(0, level));
      slider.value = String(v);
      value.textContent = String(v);
      paintSlider();
      saveVolume(v);
      hooks.onVolume(v);
      setMusicMaster(v); // müzik ana ses seviyesiyle çarpılır (src/ui/music.ts)
      if (preview) hooks.preview();
    });
    paintSlider();
    slider.addEventListener('input', () => apply(Number(slider.value), false));
    slider.addEventListener('change', () => hooks.preview());
    minus.addEventListener('click', () => apply(Number(slider.value) - 1, true));
    plus.addEventListener('click', () => apply(Number(slider.value) + 1, true));
    this.addRow(col, 'Sound volume', () => undefined, [minus, slider, plus, value], (d) => apply(Number(slider.value) + d, true));

    // --- Music: ana menü müziği 0-10 (0 = tamamen kapalı; src/ui/music.ts, data/audio-music.json). Ana ses seviyesiyle çarpılır; menüde canlı duyulur ---
    const muMinus = el('button', 'st-step', '−');
    muMinus.type = 'button';
    muMinus.setAttribute('aria-label', 'Lower music');
    const muSlider = el('input', 'st-slider');
    muSlider.type = 'range';
    muSlider.min = '0';
    muSlider.max = '10';
    muSlider.step = '1';
    muSlider.setAttribute('aria-label', 'Music volume');
    const muPlus = el('button', 'st-step', '+');
    muPlus.type = 'button';
    muPlus.setAttribute('aria-label', 'Raise music');
    const muValue = el('span', 'st-value');
    const paintMu = (v: number): void => {
      muSlider.value = String(v);
      muValue.textContent = v === 0 ? 'Off' : String(v);
      muSlider.style.setProperty('--fill', `${v * 10}%`);
    };
    paintMu(loadMusicLevel());
    onMusicLevelChange(paintMu);
    muSlider.addEventListener('input', () => setMusicLevel(Number(muSlider.value)));
    muMinus.addEventListener('click', () => setMusicLevel(Number(muSlider.value) - 1));
    muPlus.addEventListener('click', () => setMusicLevel(Number(muSlider.value) + 1));
    this.addRow(col, 'Music', () => undefined, [muMinus, muSlider, muPlus, muValue], (d) => setMusicLevel(Number(muSlider.value) + d));

    // --- UI sounds: menü sesleri (deri, parşömen, ahşap tık; src/ui/ui-sound.ts, data/audio-ui.json). 0 = kapalı; ana ses seviyesiyle çarpılır ---
    const uiMinus = el('button', 'st-step', '−');
    uiMinus.type = 'button';
    uiMinus.setAttribute('aria-label', 'Lower UI sounds');
    const uiSlider = el('input', 'st-slider');
    uiSlider.type = 'range';
    uiSlider.min = '0';
    uiSlider.max = '10';
    uiSlider.step = '1';
    uiSlider.value = String(loadUiSoundLevel());
    uiSlider.setAttribute('aria-label', 'UI sounds volume');
    const uiPlus = el('button', 'st-step', '+');
    uiPlus.type = 'button';
    uiPlus.setAttribute('aria-label', 'Raise UI sounds');
    const uiValue = el('span', 'st-value');
    const paintUi = (v: number): void => {
      uiSlider.value = String(v);
      uiValue.textContent = v === 0 ? 'Off' : String(v);
      uiSlider.style.setProperty('--fill', `${v * 10}%`);
    };
    paintUi(Number(uiSlider.value));
    onUiSoundLevelChange(paintUi);
    const applyUi = (lvl: number, preview: boolean): void => {
      setUiSoundLevel(lvl);
      if (preview) previewUiSound('select');
    };
    uiSlider.addEventListener('input', () => applyUi(Number(uiSlider.value), false));
    uiSlider.addEventListener('change', () => previewUiSound('select'));
    uiMinus.addEventListener('click', () => applyUi(Number(uiSlider.value) - 1, true));
    uiPlus.addEventListener('click', () => applyUi(Number(uiSlider.value) + 1, true));
    this.addRow(col, 'UI sounds', () => undefined, [uiMinus, uiSlider, uiPlus, uiValue], (d) => applyUi(Number(uiSlider.value) + d, true));

    // --- Reduced motion (ana menü sahnesi: paralaks ve parçacık yok; kayıt yoksa işletim sistemi tercihi; src/ui/motion-pref.ts) ---
    const motion = el('span', 'st-value', reducedMotion() ? 'On' : 'Off');
    onReducedMotionChange((on) => (motion.textContent = on ? 'On' : 'Off'));
    this.addRow(col, 'Reduced motion', () => setReducedMotion(!reducedMotion()), [motion]);

    // --- Battle speed: kaydırıcı, ayrık adımlar 0.25x-4x (Sound volume / UI sounds ile aynı bileşen; src/ui/battle-speed.ts, src/game/turn-wait.ts) ---
    const bsMinus = el('button', 'st-step', '−');
    bsMinus.type = 'button';
    bsMinus.setAttribute('aria-label', 'Slower battle');
    const bsSlider = el('input', 'st-slider');
    bsSlider.type = 'range';
    bsSlider.min = '0';
    bsSlider.max = String(SPEED_STEPS);
    bsSlider.step = '1';
    bsSlider.setAttribute('aria-label', 'Battle speed');
    const bsPlus = el('button', 'st-step', '+');
    bsPlus.type = 'button';
    bsPlus.setAttribute('aria-label', 'Faster battle');
    const bsValue = el('span', 'st-value');
    const paintBs = (v: BattleSpeed): void => {
      const i = speedIndex(v);
      bsSlider.value = String(i);
      bsValue.textContent = battleSpeedLabel(v);
      bsSlider.style.setProperty('--fill', `${(i / SPEED_STEPS) * 100}%`);
    };
    paintBs(battleSpeed());
    onBattleSpeedChange(paintBs);
    const applyBs = (i: number): void => setBattleSpeed(speedAt(i));
    bsSlider.addEventListener('input', () => applyBs(Number(bsSlider.value)));
    bsMinus.addEventListener('click', () => applyBs(speedIndex(battleSpeed()) - 1));
    bsPlus.addEventListener('click', () => applyBs(speedIndex(battleSpeed()) + 1));
    this.addRow(col, 'Battle speed', () => undefined, [bsMinus, bsSlider, bsPlus, bsValue], (d) => applyBs(speedIndex(battleSpeed()) + d));

    // --- Fullscreen (Fullscreen API yoksa satır yok; iPhone'da ipucu) ---
    const support = currentSupport();
    if (support !== 'none' && !isStandalone()) {
      const state = el('span', 'st-value', 'Enter');
      const note = el('div', 'st-note');
      onFullscreenChange((on) => (state.textContent = on ? 'Exit' : 'Enter'));
      this.addRow(col, 'Fullscreen', () => {
        if (support === 'ios') note.textContent = IOS_HINT;
        else void toggleFullscreen();
      }, [state]);
      col.append(note);
    }

    // Gizli debug girişinin yedeği (src/ui/debug-gesture.ts): en altta küçük, soluk "Developer tools" satırı
    const dev = el('button', 'st-dev', 'Developer tools');
    dev.type = 'button';
    dev.addEventListener('click', () => {
      this.setOpen(false);
      openDebugMenu();
    });
    col.append(dev);

    // Geri standardı (CLAUDE.md > Geri / Menu kuralı): her yerde aynı sol üst "◂ Back  Esc" (src/ui/elegant.css > .el-back)
    const back = el('button', 'el-back st-back');
    back.append(el('span', '', '◂ Back'), el('small', '', 'Esc'));
    back.type = 'button';
    back.addEventListener('click', () => this.setOpen(false));
    this.overlay.append(col, back);
    // Boş zemine dokunmak bir şey yapmaz (yanlışlıkla kapanmasın); kapatma: Back ya da Esc
    root.append(this.overlay);
    // Fare bırakması alttaki Phaser sahnesine gitmesin (Phaser window mouseup'ı dinler, defaultPrevented olanı yok sayar); asıl güvence giriş kilidi
    this.overlay.addEventListener('mouseup', (e) => e.preventDefault());

    // Klavye: açıkken oyunun kısayollarına gitmez; yukarı/aşağı satır, sol/sağ ayar, Enter seçer, Esc kapatır
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || e.key === '`' || e.key === 'F2') return; // debug menüsü kısayolu çalışmaya devam eder
        e.stopImmediatePropagation();
        const k = e.key;
        const row = this.rows[this.sel];
        if (k === 'Escape') {
          e.preventDefault();
          this.setOpen(false);
        } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 's' || k === 'W' || k === 'S') {
          e.preventDefault();
          const d = k === 'ArrowUp' || k === 'w' || k === 'W' ? -1 : 1;
          this.select((this.sel + d + this.rows.length) % this.rows.length);
        } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && row?.adjust) {
          e.preventDefault();
          row.adjust(k === 'ArrowLeft' ? -1 : 1);
        } else if ((k === 'Enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          row?.run();
        }
      },
      true,
    );
    hooks.onVolume(Number(slider.value));
    setMusicMaster(Number(slider.value));
    registerSettingsScreen(this);
  }

  /** Kutusuz satır: elmas + yazı + sağda denetim + ince ayırıcı; satıra dokunmak/üstüne gelmek seçer. */
  private addRow(col: HTMLElement, label: string, run: () => void, right: HTMLElement[], adjust?: (d: number) => void): void {
    const i = this.rows.length;
    const root = el('div', 'st-row');
    const name = el('button', 'st-label', label);
    name.type = 'button';
    name.addEventListener('click', () => run());
    const control = el('div', 'st-control');
    control.append(...right);
    root.append(el('span', 'st-diamond'), name, control);
    root.addEventListener('pointerenter', () => this.select(i));
    root.addEventListener('pointerdown', () => this.select(i));
    col.append(root);
    this.rows.push({ root, run, adjust });
  }

  private select(i: number): void {
    this.sel = i;
    this.rows.forEach((r, k) => r.root.classList.toggle('on', k === i));
  }

  /** Açar (isteğe bağlı: kapanınca çağrılacak geri dönüş) ya da kapatır. */
  setOpen(open: boolean, onBack?: () => void): void {
    if (open) this.onBack = onBack;
    const was = this.open;
    this.open = open;
    this.overlay.hidden = !open;
    if (open && !was) this.select(0);
    document.documentElement.classList.toggle('settings-open', open);
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
  else {
    saveVolume(Math.min(10, Math.max(0, Math.round(level))));
    setMusicMaster(level);
  }
}
export function isSettingsOpen(): boolean {
  return instance?.isOpen ?? false;
}
