/**
 * SPRITE SHEET efektleri (Phaser tarafı): assets/vfx/<sahip>/<NN-ad>.png dosyalarını Phaser spritesheet'i olarak yükler, kare
 * animasyonlarını kaydeder ve sahneye "oynayan sprite" koyar. v2 efektleri bunu `k.sheet(...)` ile kullanır (src/game/vfx-versions.ts).
 *
 *  - Yükleme: BattleScene.preload `preloadVfxSheets` (hepsi, ~1,8 MB); yüklenmemişse `ensureVfxSheets` efekt başında tembel yükler.
 *  - Keskinlik: doku NEAREST filtreyle çizilir (pixel art).
 *  - Hız: sheet'in fps'i `slow()` ile skillSlowdown'a uyar (efektin geri kalanıyla aynı yavaşlık); `fps` seçeneği bunu ezer.
 *  - Kare alt kümesi: `frames: [1, 2, 3]` yalnızca o kareleri sırayla oynar; `frame: 3` animasyonsuz tek kare.
 *  - Sprite animasyon bitince kendini yok eder (`keep: true` değilse); `loop: true` döngü (çağıran yok eder).
 */
import Phaser from 'phaser';
import { slow } from './combatant-view';
import { VFX_SHEET_FILES, vfxSheetFile } from './vfx-sheet-files';

export const vfxSheetKey = (id: string): string => `vfxsheet:${id}`;

const frameSize = (id: string): [number, number] => vfxSheetFile(id)?.meta.frame_size ?? [256, 256];

/** preload() içinde: (verilen ya da tüm) sheet'leri kuyruğa ekler; dokusu olan atlanır. */
export function preloadVfxSheets(scene: Phaser.Scene, ids: readonly string[] = VFX_SHEET_FILES.map((f) => f.id)): number {
  let n = 0;
  for (const id of ids) {
    const f = vfxSheetFile(id);
    if (!f || scene.textures.exists(vfxSheetKey(id))) continue;
    const [fw, fh] = f.meta.frame_size;
    scene.load.spritesheet(vfxSheetKey(id), f.url, { frameWidth: fw, frameHeight: fh, endFrame: f.meta.frames - 1 });
    n++;
  }
  return n;
}

/** Eksik sheet'leri çalışan sahnede yükler (en çok `timeout` ms bekler; yüklenemeyen sheet efekti sessizce atlanır). */
export function ensureVfxSheets(scene: Phaser.Scene, ids: readonly string[], timeout = 4000): Promise<void> {
  const missing = ids.filter((id) => vfxSheetFile(id) && !scene.textures.exists(vfxSheetKey(id)));
  if (!missing.length) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    preloadVfxSheets(scene, missing);
    scene.load.once(Phaser.Loader.Events.COMPLETE, finish);
    scene.time.delayedCall(timeout, finish);
    if (!scene.load.isLoading()) scene.load.start();
  });
}

/** Kare listesine göre animasyon anahtarı (yoksa kaydeder). */
function animFor(scene: Phaser.Scene, id: string, frames: readonly number[] | undefined): string {
  const f = vfxSheetFile(id)!;
  const list = frames ?? Array.from({ length: f.meta.frames }, (_, i) => i);
  const key = `${vfxSheetKey(id)}#${list.join(',')}`;
  if (!scene.anims.exists(key)) scene.anims.create({ key, frames: list.map((frame) => ({ key: vfxSheetKey(id), frame })), frameRate: f.meta.fps, repeat: 0 });
  return key;
}

export interface SheetOpts {
  /** Karenin ekrandaki kenar uzunluğu (256'lık kare bu boyuta ölçeklenir; içerik karenin ~%40-80'i). Varsayılan 256. */
  size?: number;
  /** Dikey ölçek çarpanı (zemin perspektifi için basık: 0,5 gibi). */
  squashY?: number;
  /** Sabit kare (animasyonsuz). */
  frame?: number;
  /** Oynanacak kareler (varsayılan hepsi). */
  frames?: number[];
  /** Saniyedeki kare (varsayılan: sheet fps'i; ikisi de slow() ile yavaşlar). */
  fps?: number;
  /** Döngü (çağıran yok eder). */
  loop?: boolean;
  /** Animasyon bitince yok etme (son karede kalır). */
  keep?: boolean;
  depth?: number;
  /** Doku içindeki dayanak noktası (0..1); varsayılan sheet pivotu (orta). Zemine oturan efektlerde alt kenar. */
  origin?: [number, number];
  flipX?: boolean;
  rotation?: number;
  alpha?: number;
  tint?: number;
  blend?: Phaser.BlendModes;
  /** Başlangıç gecikmesi (ms, slow() ile): sprite o ana kadar görünmez. */
  delay?: number;
}

/**
 * Sahneye oynayan bir sheet sprite'ı koyar; doku yoksa null (efekt çökmez). Dönen sprite'a tween uygulanabilir (taşıma, ölçek, solma).
 */
export function vfxSheet(scene: Phaser.Scene, id: string, x: number, y: number, o: SheetOpts = {}): Phaser.GameObjects.Sprite | null {
  const f = vfxSheetFile(id);
  const key = vfxSheetKey(id);
  if (!f || !scene.textures.exists(key)) return null;
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  const [fw] = frameSize(id);
  const pivot = f.meta.pivot ?? [fw / 2, f.meta.frame_size[1] / 2];
  const spr = scene.add.sprite(x, y, key, o.frame ?? o.frames?.[0] ?? 0);
  const k = (o.size ?? fw) / fw;
  spr.setOrigin(o.origin?.[0] ?? pivot[0] / fw, o.origin?.[1] ?? pivot[1] / f.meta.frame_size[1]);
  spr.setScale(k, k * (o.squashY ?? 1));
  spr.setDepth(o.depth ?? 4300);
  if (o.flipX) spr.setFlipX(true);
  if (o.rotation) spr.setRotation(o.rotation);
  if (o.alpha !== undefined) spr.setAlpha(o.alpha);
  if (o.tint !== undefined) spr.setTint(o.tint);
  if (o.blend !== undefined) spr.setBlendMode(o.blend);
  const start = () => {
    if (!spr.active) return;
    spr.setVisible(true);
    if (o.frame !== undefined) return;
    const fps = (o.fps ?? f.meta.fps) / (slow(1000) / 1000);
    spr.play({ key: animFor(scene, id, o.frames), frameRate: fps, repeat: o.loop ? -1 : 0 });
    if (!o.loop && !o.keep) spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
  };
  if (o.delay && o.delay > 0) {
    spr.setVisible(false);
    scene.time.delayedCall(slow(o.delay), start);
  } else start();
  return spr;
}

/** Sheet sprite'ının animasyonu bitince (ya da yok edilince) çözülür; null için hemen. */
export function sheetDone(spr: Phaser.GameObjects.Sprite | null): Promise<void> {
  if (!spr || !spr.active) return Promise.resolve();
  return new Promise<void>((resolve) => {
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => resolve());
    spr.once(Phaser.GameObjects.Events.DESTROY, () => resolve());
  });
}
