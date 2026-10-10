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
import { SHARED_KEY, statusOwner, wantsV2 } from './asset-versions';
import { ICONS_V2 } from './art-v2/icons-index';
import { V2_DEFAULT_SIZE, isV2Image, type V2Sprite, type V2SpriteEntry } from './art-v2/types';
import { ICON_IMAGE_SIZE, STAT_IMAGE_TEXTURE, iconImageUrl, statImage } from './icon-image-files';
import { STAT_ICON_PREFIX, statIconFallback } from '../ui/stat-icons';

export interface ResolvedSprite {
  /** Doku/önbellek anahtarı parçası: v1'de çıplak ad (eski anahtarlar aynen), v2'de `v2:<sahip>:<ad>`. */
  key: string;
  version: 'v1' | 'v2';
  /** Kenar uzunluğu (ince piksel): v1 = 64, v2 = çizimin boyutu (varsayılan 128). */
  size: number;
  /** Hücreler (ışık seviyeleriyle); bilinmeyen adda ve GÖRSEL ikonda null. */
  cells: () => Cell[][] | null;
  /** GÖRSEL v2 ikonu (hazır PNG, art-v2 `{ image }`): dosyanın URL'si. Varsa çizim yerine bu resim kullanılır (cells null). */
  image?: string;
  /**
   * Boyalı (yumuşak ölçeklenen) görsel: stat ikonları. Phaser dokusu yumuşatmayla (LINEAR) çizilir, DOM tam boy dosyayı (`domImage`)
   * `#smooth` ekiyle alır (style.css: pixelated yerine tarayıcı küçültmesi). Defender v2 ikonları gibi piksel görseller NEAREST kalır.
   */
  smooth?: boolean;
  /** DOM'da kullanılacak dosya (verilmezse `image`). */
  domImage?: string;
}

/** v2 efekt sprite'ının tam adı: `sprite()` / `ensureIcon` / `iconUrl` bu adı doğrudan çözer. */
export const v2SpriteName = (owner: string, name: string): string => `v2:${owner}:${name}`;

const spriteMemo = new WeakMap<object, V2Sprite>();
/** Girdiyi uzun yazıma çevirir (aynı girdi için aynı nesne: çizim önbelleği girdinin kimliğine bağlıdır). Görsel girdi buraya gelmez. */
const asSprite = (e: Exclude<V2SpriteEntry, { image: string }>): V2Sprite => {
  if (typeof e !== 'function') return e;
  let s = spriteMemo.get(e);
  if (!s) spriteMemo.set(e, (s = { draw: e }));
  return s;
};

/** Sahibin v2 ikon dosyasında bu ad var mı (ICONS). */
export const hasV2Icon = (owner: string | null | undefined, name: string): boolean => !!owner && !!ICONS_V2[owner]?.ICONS[name];

/** Sahibin v2 dosyasındaki girdi: ICONS (v1 adıyla) ya da SPRITES (v2 efekt sprite'ı). Görsel girdi `{ url }` döner (dosyası yoksa null: v1'e düşer). */
function v2Entry(owner: string, name: string, sprites: boolean): V2Sprite | { url: string } | null {
  const file = ICONS_V2[owner];
  if (!file) return null;
  const e = sprites ? (file.SPRITES[name] ?? file.ICONS[name]) : file.ICONS[name];
  if (!e) return null;
  if (isV2Image(e)) {
    const url = iconImageUrl(e.image);
    return url ? { url } : null;
  }
  return asSprite(e);
}

/** v2 girdisinden çözüm (çizim ya da görsel). */
function fromEntry(key: string, e: V2Sprite | { url: string }): ResolvedSprite {
  if ('url' in e) return { key, version: 'v2', size: ICON_IMAGE_SIZE, cells: () => null, image: e.url };
  return { key, version: 'v2', size: sizeOf(e), cells: () => drawV2(key, e) };
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
  if (name.startsWith(STAT_ICON_PREFIX)) {
    // stat ikonu: boyalı PNG (assets/stat-icons), yoksa kodla çizilen yedek (STAT_ICON / v2:shared:might; doku anahtarı eskisiyle aynı)
    const kind = name.slice(STAT_ICON_PREFIX.length);
    const img = statImage(kind);
    if (img) return { key: name, version: 'v2', size: STAT_IMAGE_TEXTURE, cells: () => null, image: img.small, domImage: img.url, smooth: true };
    const fb = statIconFallback(kind);
    return fb ? resolveSprite(fb) : { key: name, version: 'v1', size: GRID, cells: () => null };
  }
  if (name.startsWith('v2:')) {
    const [, o = '', n = ''] = name.split(':');
    const e = v2Entry(o, n, true);
    if (e) return fromEntry(name, e);
    return { key: name, version: 'v1', size: GRID, cells: () => null };
  }
  if (owner && wantsV2(owner, 'icon')) {
    const e = v2Entry(owner, name, false);
    if (e) return fromEntry(v2SpriteName(owner, name), e);
  }
  return { key: name, version: 'v1', size: GRID, cells: () => spriteCells(name) };
}

/** Durum rozetinin v2 çizim adı (sınıfa özgü durumda, sahibin v2 dosyasında `badge_<durumId>`; SPRITES ya da ICONS). */
export const badgeSpriteName = (statusId: string): string => `badge_${statusId}`;

/**
 * DURUM ROZETİ çözümü (savaşta can çubuğunun yanı, wiki Statuses): `{ name, owner }` ensureIcon/iconUrl'e aynen verilir.
 * Karar (madde 259): durum TEK bir class'a aitse (statusOwner: yalnızca onun skill'leri uygular; ör. Omen/Wither/Jinxed -> Hexer) rozet o
 * class'ın sürümünü izler: o class v2 seçiliyken v2 dosyasında `badge_<durumId>` varsa o çizim, yoksa durumun ikon adı o class'ın v2 ICONS'unda
 * varsa o (ör. Dark Bond -> 'darkbond'). Aksi halde (ortak durum, class v1, ya da class'ın v2'sinde karşılık yok) Shared sürümüyle statuses.json'daki
 * ikon adı (Shared v2 seçiliyse shared/icons.ts çizimi).
 */
export function statusBadge(statusId: string, icon: string): { name: string; owner: string } {
  const owner = statusOwner(statusId);
  if (owner && wantsV2(owner, 'icon')) {
    const file = ICONS_V2[owner];
    const n = badgeSpriteName(statusId);
    if (file && (file.SPRITES[n] || file.ICONS[n])) return { name: v2SpriteName(owner, n), owner };
    // Ayrı rozet çizimi yoksa: durumun ikon adı o class'ın kendi v2 ikonuysa (ör. dark_bond -> 'darkbond' = Dark Bond skill ikonu) o
    if (file?.ICONS[icon]) return { name: icon, owner };
  }
  return { name: icon, owner: SHARED_KEY };
}

/** Sahibin v2 ikonunu seçimden BAĞIMSIZ çözer (wiki'deki v1 | v2 karşılaştırması); yoksa null. */
export function v2IconOf(owner: string, name: string): ResolvedSprite | null {
  const e = v2Entry(owner, name, false);
  return e ? fromEntry(v2SpriteName(owner, name), e) : null;
}
