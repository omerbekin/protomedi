/**
 * Ekran yerleşimi: oyun alanı mevcut görünür alanın MAKSİMUM kısmını kullanır (16:9 oran korunur, Phaser Scale.FIT).
 * Dikey (portrait) tutulan dokunmatik cihazda oyun alanı (sahne #stage) CSS ile 90 derece döndürülüp ekranın uzun kenarına yayılır;
 * Phaser'ın dokunma/fare koordinatları döndürülmüş kapta bozulacağı için `installViewport` ScaleManager/InputManager'a küçük bir yama uygular.
 * DOM katmanları (ayarlar, wiki, debug, ipuçları) #stage içinde olduğu için aynı dönüşle çalışır; tarayıcı dokunuşu zaten doğru eşler.
 *
 * Saf yardımcılar (fitScale, shouldRotate, layoutFor, rotatedToStage) vitest ile sınanır; DOM kısmı `installViewport` içindedir.
 */
export const GAME_W = 1920;
export const GAME_H = 1080;

/** Sahne yüksekliği bu değerlerin altındaysa html'e `short` / `compact` sınıfı konur (CSS kısa ekran düzenleri). */
export const SHORT_STAGE_H = 520;
export const COMPACT_STAGE_H = 720;

export type RotateMode = 'auto' | 'on' | 'off';

/** Oranı koruyarak (FIT) oyunun ekrana sığma ölçeği. */
export function fitScale(width: number, height: number, gameW = GAME_W, gameH = GAME_H): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(width / gameW, height / gameH);
}

/** Döndürme, normal sığdırmaya göre en az bu kadar büyük bir kazanç sağlıyorsa yapılır (yatay ekranlarda hiç yapılmaz). */
export const ROTATE_MIN_GAIN = 1.15;

/**
 * Ekran döndürülmeli mi? `auto`: yalnızca dokunmatik cihazda ve dikeyde, döndürmek oyunu belirgin büyütüyorsa. `on`/`off`: elle (debug menüsü, ?rotate=).
 */
export function shouldRotate(width: number, height: number, coarse: boolean, mode: RotateMode = 'auto'): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return width > 0 && height > 0;
  if (!coarse || height <= width) return false;
  return fitScale(height, width) >= fitScale(width, height) * ROTATE_MIN_GAIN;
}

export interface StageLayout {
  rotated: boolean;
  /** Sahne (#stage) kendi koordinatlarında genişlik/yükseklik (döndürülünce görünür alanın yer değiştirmiş hali). */
  stageW: number;
  stageH: number;
  /** Oyun tuvalinin ekrandaki ölçeği (1 = 1920x1080 gerçek piksel). */
  scale: number;
}

export function layoutFor(width: number, height: number, coarse: boolean, mode: RotateMode = 'auto'): StageLayout {
  const rotated = shouldRotate(width, height, coarse, mode);
  const stageW = rotated ? height : width;
  const stageH = rotated ? width : height;
  return { rotated, stageW, stageH, scale: fitScale(stageW, stageH) };
}

/**
 * Döndürülmüş sahnede (translateX(vw) rotate(90deg)) ekran noktasını (clientX, clientY) sahne yerel koordinatına çevirir.
 * Ekran = (vw - ly, lx)  =>  lx = clientY, ly = vw - clientX.
 */
export function rotatedToStage(clientX: number, clientY: number, viewW: number): { x: number; y: number } {
  return { x: clientY, y: viewW - clientX };
}

/** Elle seçilmiş döndürme kipi (adres: ?rotate=on|off). */
export function parseRotateMode(search: string): RotateMode {
  const v = new URLSearchParams(search).get('rotate');
  return v === 'on' || v === 'off' ? v : 'auto';
}

// ---------------------------------------------------------------- DOM kısmı

let currentRotated = false;
let currentMode: RotateMode = 'auto';
let relayout: (() => void) | null = null;

export const isRotated = (): boolean => currentRotated;
export const getRotateMode = (): RotateMode => currentMode;

export function setRotateMode(mode: RotateMode): void {
  currentMode = mode;
  relayout?.();
}

/** Phaser'ın yama için kullandığımız iç alanlarının asgari şekli (Phaser tipine bağımlı kalmamak için). */
interface PhaserLike {
  scale: {
    parent: HTMLElement | null;
    canvas: HTMLCanvasElement;
    parentSize: { width: number; height: number; setSize: (w: number, h: number) => void };
    canvasBounds: { x: number; y: number; width: number; height: number };
    getParentBounds: () => boolean;
    updateBounds: () => void;
    updateCenter: () => void;
    refresh: () => void;
  };
  input: {
    transformPointer: (pointer: unknown, pageX: number, pageY: number, wasMove: boolean) => void;
  };
}

/**
 * Sahneyi görünür alana oturtur (visualViewport: adres çubuğu açılıp kapanınca da), gerekirse döndürür, Phaser ölçeğini yeniler.
 * Phaser kapsayıcı boyutunu getBoundingClientRect (dönüşten etkilenir) yerine offsetWidth/Height ile okur; döndürülmüşken tuval sınırları
 * ve dokunma eşlemesi sahne yerel koordinatlarında hesaplanır.
 */
export function installViewport(game: unknown, stage: HTMLElement, initialMode: RotateMode = 'auto'): void {
  const g = game as PhaserLike;
  currentMode = initialMode;
  const root = document.documentElement;
  const coarse = (): boolean => (window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false);

  // 1) Phaser kapsayıcı boyutu: dönüşten bağımsız (layout) ölçü
  g.scale.getParentBounds = function (this: PhaserLike['scale']): boolean {
    const p = this.parent;
    if (!p) return false;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    if (this.parentSize.width !== w || this.parentSize.height !== h) {
      this.parentSize.setSize(w, h);
      return true;
    }
    return false;
  };

  // 2) Tuval sınırları: döndürülmüşken sahne yerel (dönmemiş) ölçüler
  const origUpdateBounds = g.scale.updateBounds.bind(g.scale);
  g.scale.updateBounds = function (this: PhaserLike['scale']): void {
    if (!currentRotated) return origUpdateBounds();
    const c = this.canvas;
    const b = this.canvasBounds;
    b.x = c.offsetLeft;
    b.y = c.offsetTop;
    b.width = c.offsetWidth;
    b.height = c.offsetHeight;
  };

  // 2b) Ortalama (autoCenter): döndürülmüşken sahne yerel ölçülerle
  const origUpdateCenter = g.scale.updateCenter.bind(g.scale);
  g.scale.updateCenter = function (this: PhaserLike['scale']): void {
    if (!currentRotated) return origUpdateCenter();
    const c = this.canvas;
    c.style.marginLeft = `${Math.floor((this.parentSize.width - c.offsetWidth) / 2)}px`;
    c.style.marginTop = `${Math.floor((this.parentSize.height - c.offsetHeight) / 2)}px`;
  };

  // 3) Dokunma/fare: ekran koordinatı -> sahne yerel koordinatı
  const origTransform = g.input.transformPointer.bind(g.input);
  g.input.transformPointer = (pointer, pageX, pageY, wasMove) => {
    if (!currentRotated) return origTransform(pointer, pageX, pageY, wasMove);
    const p = rotatedToStage(pageX, pageY, stage.offsetHeight);
    return origTransform(pointer, p.x, p.y, wasMove);
  };

  let queued = false;
  const apply = (): void => {
    queued = false;
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    const layout = layoutFor(w, h, coarse(), currentMode);
    currentRotated = layout.rotated;
    root.classList.toggle('rotated', layout.rotated);
    // @media fiziksel görünümü ölçer; döndürülmüş sahnede doğru boyut sınıflarını biz veririz
    root.classList.toggle('short', layout.stageH <= SHORT_STAGE_H);
    root.classList.toggle('compact', layout.stageH <= COMPACT_STAGE_H);
    root.style.setProperty('--view-w', `${w}px`);
    root.style.setProperty('--view-h', `${h}px`);
    root.style.setProperty('--stage-w', `${layout.stageW}px`);
    root.style.setProperty('--stage-h', `${layout.stageH}px`);
    g.scale.getParentBounds();
    g.scale.refresh();
  };
  relayout = apply;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(apply);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', schedule);
  apply();
}
