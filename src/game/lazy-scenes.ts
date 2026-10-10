import Phaser from 'phaser';
import { bootFinished, markBootReady, trackChunkLoad } from '../ui/boot-loader';
import { hookStageScenes } from './stage';

/**
 * Hızlı açılış (kod bölme): ana menü dışındaki sahnelerin kodu ayrı parçalarda (chunk) durur ve ilk gerektiğinde indirilir.
 * Oyuna her anahtar için küçük bir yer tutucu sahne (`LazyScene`) kaydedilir; böylece her yerdeki `scene.start('BattleScene', veri)`
 * çağrıları değişmeden çalışır. Yer tutucu başlatılınca modülü indirir (uzun sürerse kısa yükleyici: src/ui/boot-loader.ts), sonra
 * kendini aynı anahtarlı gerçek sahneyle değiştirir ve gerçek sahneyi aynı veriyle başlatır. Ana menü hazır olunca tüm sahne parçaları
 * arka planda önceden indirilir (`prefetchScenes`), yani normal oyunda geçişlerde bekleme olmaz.
 */

type SceneClass = new () => Phaser.Scene;

const LOADERS = {
  TeamSelectScene: () => import('./scenes/TeamSelectScene').then((m) => m.TeamSelectScene),
  BattleScene: () => import('./scenes/BattleScene').then((m) => m.BattleScene),
  CampaignMapScene: () => import('./scenes/CampaignMapScene').then((m) => m.CampaignMapScene),
  EndlessScene: () => import('./scenes/EndlessScene').then((m) => m.EndlessScene),
  MultiplayerScene: () => import('./scenes/MultiplayerScene').then((m) => m.MultiplayerScene),
} satisfies Record<string, () => Promise<SceneClass>>;

export type LazySceneKey = keyof typeof LOADERS;
export const LAZY_SCENE_KEYS = Object.keys(LOADERS) as LazySceneKey[];

const loaded = new Map<LazySceneKey, Promise<SceneClass>>();

/** Sahnenin modülünü indirir (bir kez; hata olursa sonraki denemede yeniden). */
export function loadSceneClass(key: LazySceneKey): Promise<SceneClass> {
  let p = loaded.get(key);
  if (!p) {
    p = LOADERS[key]();
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}

const gates = new Map<LazySceneKey, Promise<unknown>>();

/** Sahne ilk kez başlamadan önce beklenecek iş (ör. ?merchant=1: tüccar koşusu hazırlanmadan Endless sahnesi açılmaz; birden çok iş birlikte beklenir). */
export function gateScene(key: LazySceneKey, p: Promise<unknown>): void {
  const prev = gates.get(key);
  gates.set(key, prev ? Promise.all([prev, p]) : p);
}

/** Yer tutucu sahne: başlatılınca gerçek sahneyi indirip yerine koyar ve onu aynı veriyle başlatır. */
export class LazyScene extends Phaser.Scene {
  private startData: object | undefined;
  private loading = false;

  constructor(readonly target: LazySceneKey) {
    super({ key: target });
  }

  create(data?: object): void {
    this.startData = data; // yükleme sürerken yeniden başlatıldıysa en son veri kullanılır
    if (this.loading) return;
    this.loading = true;
    trackChunkLoad(Promise.all([loadSceneClass(this.target), gates.get(this.target)])).then(
      ([cls]) => swapIn(this.game, this.target, cls),
      (err: unknown) => {
        this.loading = false;
        console.error(`[lazy-scenes] ${this.target} yüklenemedi`, err);
        // ağ hatası: kullanıcı boş ekranda kalmasın; ana menüye dön (menü her zaman ilk parçadadır)
        if (this.sys.isActive()) this.scene.start('MainMenuScene');
      },
    );
  }

  /** Gerçek sahne yerine konurken: yer tutucu hâlâ açık mıydı ve hangi veriyle. */
  pendingStart(): { start: boolean; data: object | undefined } {
    return { start: this.sys.isActive() || this.sys.isPaused(), data: this.startData };
  }

  /** İndirme sürüyor mu (bu yer tutucu başlatıldı ve gerçek sahneyi bekliyor). */
  isLoading(): boolean {
    return this.loading;
  }
}

/** Anahtardaki yer tutucuyu gerçek sahneyle değiştirir (yer tutucu açıksa gerçek sahne aynı veriyle başlar). */
function swapIn(game: Phaser.Game, key: LazySceneKey, cls: SceneClass): void {
  const mgr = game.scene;
  const cur = mgr.getScene(key);
  if (!(cur instanceof LazyScene)) return; // zaten gerçek sahne
  const { start, data } = cur.pendingStart();
  const index = mgr.getIndex(key);
  mgr.remove(key);
  const real = mgr.add(key, cls, false);
  if (!real) return;
  // sahne listesindeki yeri korunur (çizim sırası değişmesin)
  const list = mgr.scenes;
  const at = list.indexOf(real);
  if (at >= 0 && index >= 0 && at !== index) list.splice(index, 0, ...list.splice(at, 1));
  hookStageScenes(game);
  // doğrudan bağlantıyla açılış (?seed=, ?campaign=1, ?endless=1, lobi linki): açılış kutusu gerçek sahne kurulunca kalkar
  if (!bootFinished()) real.events.once(Phaser.Scenes.Events.CREATE, () => markBootReady());
  if (start) mgr.start(key, data);
}

/** Phaser oyun ayarı için sahne listesi: `first` ilk (otomatik başlar), diğerleri arkasından; ana menü gerçek sahne olarak verilir. */
export function sceneList(first: LazySceneKey | 'menu', menu: SceneClass): Phaser.Types.Scenes.SceneType[] {
  const lazy = LAZY_SCENE_KEYS.map((k) => new LazyScene(k));
  if (first === 'menu') return [menu, ...lazy];
  const head = lazy.find((s) => s.target === first)!;
  return [head, menu, ...lazy.filter((s) => s !== head)];
}

/**
 * Ana menü hazır olduktan sonra: tüm sahne parçalarını sırayla arka planda indirir ve kapalı yer tutucuları gerçek sahnelerle değiştirir
 * (Quick Battle / sefer / Endless ilk açılışta beklemez). Hata sessizce yutulur (o sahne açılırken yeniden denenir).
 */
export function prefetchScenes(game: Phaser.Game): Promise<void> {
  const order: LazySceneKey[] = ['TeamSelectScene', 'BattleScene', 'CampaignMapScene', 'EndlessScene', 'MultiplayerScene'];
  let chain = Promise.resolve();
  for (const key of order) {
    chain = chain.then(() =>
      loadSceneClass(key).then(
        (cls) => {
          const cur = game.scene.getScene(key);
          if (cur instanceof LazyScene && !cur.pendingStart().start && !cur.isLoading()) swapIn(game, key, cls);
        },
        () => undefined,
      ),
    );
  }
  return chain;
}
