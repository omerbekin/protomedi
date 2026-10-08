/**
 * Ekran yerleşimi: oyun alanı mevcut görünür alanın MAKSİMUM kısmını kullanır (16:9 oran korunur, Phaser Scale.FIT).
 * Dikey (portrait) tutulan dokunmatik cihazda oyun alanı (sahne #stage) CSS ile 90 derece döndürülüp ekranın uzun kenarına yayılır;
 * Phaser'ın dokunma/fare koordinatları döndürülmüş kapta bozulacağı için `installViewport` ScaleManager/InputManager'a küçük bir yama uygular.
 * DOM katmanları (ayarlar, wiki, debug, ipuçları) #stage içinde olduğu için aynı dönüşle çalışır; tarayıcı dokunuşu zaten doğru eşler.
 *
 * Saf yardımcılar (fitScale, shouldRotate, layoutFor, rotatedToStage, logicalWidthFor, stageMetrics) vitest ile sınanır; DOM kısmı `installViewport` içindedir.
 *
 * Geniş ekran (Ömer 2026-10-08, ultrawide 3440x1440): mantıksal yükseklik 1080 sabit; mantıksal genişlik ekran oranına göre 1920 (16:9) ile
 * `stage.maxWidth` (~21.5:9) arasında esner (16:9'dan dar ekranda 1920 + üst/alt bant, eskisi gibi). Sahne koordinatları 1920x1080 merkez
 * bölgede kalır; kamera dünyanın (960, 540) noktasını ortalar, fazladan genişlik iki yana eşit açılır (`src/game/stage.ts`).
 * Tuval ekranın GERÇEK piksel çözünürlüğündedir: tuval = mantıksal boyut x render ölçeği (>= 1, üst sınırlı), kamera yakınlaştırması = render ölçeği.
 */
import layout from '../../data/battle-layout.json';

export const GAME_W = layout.width;
export const GAME_H = layout.height;
/** En geniş mantıksal genişlik (~21.5:9); daha geniş ekranda iki yanda siyah bant kalır. */
export const MAX_GAME_W = layout.stage.maxWidth;
/**
 * Tam ekran örtüler (karartma, dokunma kalkanı, alt panel şeridi) için sabit, en geniş görünümü (+ sarsıntı payı) kaplayan yatay aralık.
 * 16:9'da fazlası ekran dışında kalır (görüntü değişmez).
 */
export const FULL_X0 = (GAME_W - MAX_GAME_W) / 2 - 60;
export const FULL_W = MAX_GAME_W + 120;

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

/** Ekran oranına göre mantıksal genişlik: 1080 yükseklikte en az 1920 (16:9), en çok MAX_GAME_W. */
export function logicalWidthFor(width: number, height: number): number {
  if (width <= 0 || height <= 0) return GAME_W;
  return Math.min(MAX_GAME_W, Math.max(GAME_W, Math.round((GAME_H * width) / height)));
}

export interface StageMetrics {
  /** Mantıksal (dünya) genişlik: 1920-MAX_GAME_W. */
  logicalW: number;
  /** Mantıksal 1 birimin ekrandaki CSS pikseli. */
  cssScale: number;
  /** Tuval piksel boyutu (gerçek piksel; render ölçeği uygulanmış). */
  canvasW: number;
  canvasH: number;
  /** Kamera yakınlaştırması = tuval yüksekliği / 1080 (>= 1). */
  zoom: number;
  /** Kameranın gösterdiği dünya genişliği (= canvasW / zoom ≈ logicalW). */
  viewW: number;
  /** Görünen dünyanın sol / sağ kenarı (16:9'da 0 / 1920; geniş ekranda iki yana eşit açılır). */
  left: number;
  right: number;
}

/** Render ölçeği 1'e bu kadar yakınsa tam 1 alınır (1920x1080 civarında yeniden örnekleme bulanıklığı olmasın). */
const RENDER_SNAP = 0.03;

/**
 * Kapsayıcı (CSS px) ve cihaz piksel oranından sahne ölçüleri. Render ölçeği = gerçek piksel / mantıksal birim, en az 1 (küçük ekranda tuval
 * 1920x1080 kalır ve tarayıcı küçültür: bugünkü davranış), en çok `maxRenderScale` ve tuval genişliği `maxRenderWidth` (performans sınırı).
 */
export function stageMetrics(width: number, height: number, dpr = 1): StageMetrics {
  const logicalW = logicalWidthFor(width, height);
  const cssScale = fitScale(width, height, logicalW, GAME_H);
  const cap = Math.min(layout.stage.maxRenderScale, layout.stage.maxRenderWidth / logicalW);
  let render = Math.max(1, Math.min(cap, cssScale * (dpr > 0 ? dpr : 1)));
  if (render - 1 < RENDER_SNAP) render = 1;
  const canvasH = Math.round(GAME_H * render);
  const zoom = canvasH / GAME_H;
  const canvasW = Math.round(logicalW * zoom);
  const viewW = canvasW / zoom;
  const left = (GAME_W - viewW) / 2;
  return { logicalW, cssScale, canvasW, canvasH, zoom, viewW, left, right: left + viewW };
}

/** Ana menü / ayarlar sol sütununun yazı başlangıcı (dünya x, 16:9'da) ve geniş ekranda sütunun kayması (görünen sol kenara doğru, kenara yapışmadan). */
export const MENU_COL_X = 140;
export const menuColumnShift = (left: number): number => Math.round(left * 0.65);

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
    setGameSize: (w: number, h: number) => void;
    width: number;
    height: number;
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
export function installViewport(game: unknown, stage: HTMLElement, initialMode: RotateMode = 'auto', onStage?: (m: StageMetrics) => void): void {
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
    // Geniş ekran + gerçek piksel: oyun kapsayıcısının (#game, çentik payları düşülmüş) oranından mantıksal genişlik ve tuval boyutu
    const parent = g.scale.parent;
    const m = stageMetrics(parent?.offsetWidth ?? layout.stageW, parent?.offsetHeight ?? layout.stageH, window.devicePixelRatio || 1);
    g.scale.getParentBounds();
    if (g.scale.width !== m.canvasW || g.scale.height !== m.canvasH) g.scale.setGameSize(m.canvasW, m.canvasH);
    else g.scale.refresh();
    // Oyun alanının kapsayıcı içindeki bantları: DOM katmanları (sağ üst düğmeler, debug) ekranın değil oyun alanının köşesine hizalanır
    const c = g.scale.canvas;
    if (parent) {
      root.style.setProperty('--game-l', `${Math.max(0, c.offsetLeft)}px`);
      root.style.setProperty('--game-t', `${Math.max(0, c.offsetTop)}px`);
      root.style.setProperty('--game-r', `${Math.max(0, parent.offsetWidth - c.offsetLeft - c.offsetWidth)}px`);
      root.style.setProperty('--game-b', `${Math.max(0, parent.offsetHeight - c.offsetTop - c.offsetHeight)}px`);
    }
    // DOM katmanları için: mantıksal 1 birimin CSS pikseli ve sol sütunun oyun alanı solundan uzaklığı (ayarlar ekranı ana menü sütunuyla hizalı)
    root.style.setProperty('--gu', `${m.cssScale}px`);
    root.style.setProperty('--menu-x', `${(MENU_COL_X + menuColumnShift(m.left) - m.left) * m.cssScale}px`);
    onStage?.(m);
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
