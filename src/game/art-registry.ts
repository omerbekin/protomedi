/**
 * İkon/efekt sprite'ı ÇÖZÜCÜ (sürüm farkında): bir adın hangi çizimle (v1 pixel-icons/pixel-fx ya da v2 art-v2/<class>/icons.ts)
 * ve hangi çözünürlükte üretileceğine karar verir. Phaser'a ve DOM'a bağımlı değildir (testlenebilir). Doku üretimi icons.ts
 * (Phaser) ve dom-icons.ts (DOM) bunu kullanır.
 *
 * Kurallar:
 *  - Sahibi verilen (owner) çağrı: o sahip v2 seçiliyse ve v2 ikon dosyasında AYNI ADLA bir çizim varsa v2; yoksa v1.
 *  - Sahipsiz (çıplak ad) çağrı daima v1'dir (arayüz ikonları, ortak sprite'lar aynı adı paylaşabildiği için sızma olmasın).
 *  - `v2:<sahip>:<ad>` biçimli ad: doğrudan o sahibin v2 SPRITES (ya da ICONS) çizimi (v2 efektlerinin kendi sprite'ları; seçimden bağımsız).
 * Çizimler ilk istendiğinde üretilir ve önbelleğe alınır (tembel).
 */
import { GRID, PxGrid, spriteCells, type Cell } from './pixel-art';
import { wantsV2 } from './asset-versions';
import { ICONS_V2 } from './art-v2/icons-index';
import { V2_DEFAULT_SIZE, type V2Sprite, type V2SpriteEntry } from './art-v2/types';

export interface ResolvedSprite {
  /** Doku/önbellek anahtarı parçası: v1'de çıplak ad (eski anahtarlar aynen), v2'de `v2:<sahip>:<ad>`. */
  key: string;
  version: 'v1' | 'v2';
  /** Kenar uzunluğu (ince piksel): v1 = 64, v2 = çizimin boyutu (varsayılan 128). */
  size: number;
  /** Hücreler (ışık seviyeleriyle); bilinmeyen adda null. */
  cells: () => Cell[][] | null;
}

/** v2 efekt sprite'ının tam adı: `sprite()` / `ensureIcon` / `iconUrl` bu adı doğrudan çözer. */
export const v2SpriteName = (owner: string, name: string): string => `v2:${owner}:${name}`;

const spriteMemo = new WeakMap<object, V2Sprite>();
/** Girdiyi uzun yazıma çevirir (aynı girdi için aynı nesne: çizim önbelleği girdinin kimliğine bağlıdır). */
const asSprite = (e: V2SpriteEntry): V2Sprite => {
  if (typeof e !== 'function') return e;
  let s = spriteMemo.get(e);
  if (!s) spriteMemo.set(e, (s = { draw: e }));
  return s;
};

/** Sahibin v2 ikon dosyasında bu ad var mı (ICONS). */
export const hasV2Icon = (owner: string | null | undefined, name: string): boolean => !!owner && !!ICONS_V2[owner]?.ICONS[name];

/** Sahibin v2 dosyasındaki girdi: ICONS (v1 adıyla) ya da SPRITES (v2 efekt sprite'ı). */
function v2Entry(owner: string, name: string, sprites: boolean): V2Sprite | null {
  const file = ICONS_V2[owner];
  if (!file) return null;
  const e = sprites ? (file.SPRITES[name] ?? file.ICONS[name]) : file.ICONS[name];
  return e ? asSprite(e) : null;
}

/** Çizim önbelleği: girdi nesnesine bağlı (dosya değişip girdi yenilenince eski çizim kullanılmaz). */
const cellMemo = new WeakMap<V2Sprite, Cell[][] | null>();

/** Bir v2 girdisini çizer (kontur + ışık); önbellekli. Çizim hata verirse null (oyun çökmez, v1/yer tutucuya düşer). */
function drawV2(key: string, e: V2Sprite): Cell[][] | null {
  if (cellMemo.has(e)) return cellMemo.get(e)!;
  let out: Cell[][] | null = null;
  try {
    const g = new PxGrid(e.size ?? V2_DEFAULT_SIZE, e.logical);
    e.draw(g);
    if (e.outline !== false) g.outline();
    out = g.lit();
  } catch (err) {
    console.warn(`[art-v2] ${key} çizilemedi`, err);
  }
  cellMemo.set(e, out);
  return out;
}

const sizeOf = (e: V2Sprite): number => Math.max(8, Math.round(e.size ?? V2_DEFAULT_SIZE));

/**
 * Adı (ve isteğe bağlı sahibini) seçili sürüme göre çözer. Bilinmeyen ad v1 olarak döner (cells() null: çağıran yer tutucu çizer).
 */
export function resolveSprite(name: string, owner?: string | null): ResolvedSprite {
  if (name.startsWith('v2:')) {
    const [, o = '', n = ''] = name.split(':');
    const e = v2Entry(o, n, true);
    if (e) return { key: name, version: 'v2', size: sizeOf(e), cells: () => drawV2(name, e) };
    return { key: name, version: 'v1', size: GRID, cells: () => null };
  }
  if (owner && wantsV2(owner, 'icon')) {
    const e = v2Entry(owner, name, false);
    if (e) {
      const key = v2SpriteName(owner, name);
      return { key, version: 'v2', size: sizeOf(e), cells: () => drawV2(key, e) };
    }
  }
  return { key: name, version: 'v1', size: GRID, cells: () => spriteCells(name) };
}

/** Sahibin v2 ikonunu seçimden BAĞIMSIZ çözer (wiki'deki v1 | v2 karşılaştırması); yoksa null. */
export function v2IconOf(owner: string, name: string): ResolvedSprite | null {
  const e = v2Entry(owner, name, false);
  if (!e) return null;
  const key = v2SpriteName(owner, name);
  return { key, version: 'v2', size: sizeOf(e), cells: () => drawV2(key, e) };
}
