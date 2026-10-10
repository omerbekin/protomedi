import Phaser from 'phaser';
import { GAME_H, GAME_W, type StageMetrics } from '../ui/viewport';

/**
 * Geniş ekran sahnesi (Phaser tarafı; ölçü hesabı saf: `src/ui/viewport.ts > stageMetrics`).
 * - Sahneler 1920x1080 koordinatlarında çizer; her sahnenin ana kamerası render ölçeğiyle yakınlaşır ve dünyanın (960, 540) noktasını ortalar.
 *   16:9 ekranda görünen dünya 0-1920 (bugünkü görüntü); geniş ekranda iki yana eşit açılır (`stageView.left` < 0, `stageView.right` > 1920).
 * - Kendi kamerasını yöneten sahne `customStageCamera = true` der (sefer haritası) ve `onStageResize` ile kendisi kurar.
 * - Boyut değişince (tam ekran, pencere) sahne yeniden KURULMAZ: kameralar güncellenir, `onStageResize` dinleyicileri (arka plan, köşe
 *   öğeleri) yeniden yerleşir; savaş durumu olduğu gibi kalır.
 * - Yazılar (Phaser Text) render ölçeğinde çizilir (bulanık olmasın).
 * - Dokunma/fare: `pointer.x/y` tuval pikselidir; dünya noktası için `worldXY(scene, pointer)`.
 */
export { stageView } from './stage-view';
import { stageView } from './stage-view';

const RESIZE = 'stage-resize';

let gameRef: Phaser.Game | null = null;

/** Sahnenin ana kamerasını sahne ölçüsüne getirir: yakınlaştırma = render ölçeği x `extraZoom`, (cx, cy) ortada. */
export function fitCamera(cam: Phaser.Cameras.Scene2D.Camera, extraZoom = 1, cx = GAME_W / 2, cy = GAME_H / 2): void {
  cam.setSize(stageView.canvasW, stageView.canvasH);
  cam.setZoom(stageView.zoom * extraZoom);
  cam.centerOn(cx, cy);
}

/** Ekran boyutu değişince (ve sahne kurulunca bir kez) çağrılır; sahne kapanınca kendiliğinden kaldırılır. */
export function onStageResize(scene: Phaser.Scene, fn: () => void): void {
  scene.events.on(RESIZE, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(RESIZE, fn));
}

/** İşaretçinin dünya (sahne) koordinatı (ana kamera; yakınlaştırma ve kaydırma hesaba katılır). */
export function worldXY(scene: Phaser.Scene, p: { x: number; y: number }): { x: number; y: number } {
  const v = scene.cameras.main.getWorldPoint(p.x, p.y);
  return { x: v.x, y: v.y };
}

/** Yazı çözünürlüğü: en az render ölçeği (setResolution(2) verilmiş yazılar daha yüksekte kalır). */
function sharpenText(obj: Phaser.GameObjects.GameObject): void {
  if (!(obj instanceof Phaser.GameObjects.Text)) return;
  const want = Math.ceil(stageView.zoom * 4) / 4; // 0,25 adımlarla (her küçük boyut değişiminde yeniden çizilmesin)
  if ((obj.style.resolution || 1) < want) obj.setResolution(want);
}

function sharpenAll(list: Phaser.GameObjects.GameObject[]): void {
  for (const o of list) {
    sharpenText(o);
    if (o instanceof Phaser.GameObjects.Container) sharpenAll(o.list);
  }
}

function applyScene(scene: Phaser.Scene): void {
  if (!(scene as { customStageCamera?: boolean }).customStageCamera) fitCamera(scene.cameras.main);
  if (stageView.zoom > 1) sharpenAll(scene.sys.displayList.list);
  scene.events.emit(RESIZE);
}

/** Viewport yeni ölçüleri bildirince: tüm açık sahneler güncellenir. */
export function setStageMetrics(m: StageMetrics): void {
  Object.assign(stageView, { zoom: m.zoom, viewW: m.viewW, left: m.left, right: m.right, canvasW: m.canvasW, canvasH: m.canvasH });
  for (const s of gameRef?.scene.getScenes(false) ?? []) if (s.sys.isActive() || s.sys.isPaused()) applyScene(s);
}

/** main.ts: her sahne kurulunca (create sonrası) kamera + yazı keskinliği + ilk yerleşim. */
export function installStage(game: Phaser.Game): void {
  gameRef = game;
  const hook = (): void => hookStageScenes(game);
  if (game.isBooted && game.scene.scenes.length) hook();
  game.events.once(Phaser.Core.Events.READY, hook);
}

/** Henüz bağlanmamış sahnelere kancaları takar (açılışta; sonradan eklenen sahneler için src/game/lazy-scenes.ts da çağırır). */
export function hookStageScenes(game: Phaser.Game): void {
  for (const scene of game.scene.scenes) {
    const ev = scene.sys.events;
    if ((ev as unknown as { __stage?: boolean }).__stage) continue;
    (ev as unknown as { __stage?: boolean }).__stage = true;
    ev.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj: Phaser.GameObjects.GameObject) => {
      if (stageView.zoom > 1) sharpenText(obj);
    });
    ev.on(Phaser.Scenes.Events.CREATE, () => applyScene(scene));
    if (scene.sys.isActive()) applyScene(scene); // önyüklemede create'i bu kancadan önce bitmiş sahne
  }
}
