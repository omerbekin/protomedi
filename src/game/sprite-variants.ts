/**
 * Sprite görünüm varyantları (generic): bir karakterin ek görünümü `assets/sprites/<id>/idle-<varyant>.png` +
 * `assets/avatars/<id>-<varyant>.png` dosyalarıdır (varyantsız dosyalar VARSAYILAN görünümdür). Seçim localStorage'da tutulur;
 * Phaser'a bağımlı değildir (testlenebilir). Şu an kullanan: Hexer (kapüşonsuz = varsayılan, `hood` = kapüşonlu).
 * Ayar: debug menüsü > Characters. Savaş sahnesi, takım seçimi, sıra çubuğu avatarları ve wiki seçili görünümü kullanır.
 */

const STORE_KEY = 'proto.spriteVariants';

/** Varyant adlarının ekranda görünen karşılığı (id -> varyant -> yazı); 'default' = varyantsız görünüm. Yoksa adın baş harfi büyütülür. */
const LABELS: Record<string, Record<string, string>> = {
  hexer: { default: 'Hoodless', hood: 'Hooded' },
};

export const DEFAULT_VARIANT = 'default';

/** "enemy_archer" ve "archer" aynı görünümü paylaşır. */
const kindOf = (spriteId: string): string => spriteId.replace(/^enemy_/, '');

let memory: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (memory) return memory;
  let out: Record<string, string> = {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') out = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    /* depolama yok / bozuk: varsayılan görünümler */
  }
  memory = out;
  return out;
}

/** Karakterin seçili varyantı; varsayılan görünümde null. */
export function getSpriteVariant(spriteId: string): string | null {
  const v = load()[kindOf(spriteId)];
  return v && v !== DEFAULT_VARIANT ? v : null;
}

export function setSpriteVariant(spriteId: string, variant: string | null): void {
  const all = load();
  if (variant && variant !== DEFAULT_VARIANT) all[kindOf(spriteId)] = variant;
  else delete all[kindOf(spriteId)];
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Testler için: bellekteki seçimi sıfırlar (depolamaya dokunmaz). */
export function resetSpriteVariantCache(): void {
  memory = null;
}

const slashes = (path: string): string => path.split('\\').join('/');
const baseName = (path: string): string => (slashes(path).split('/').pop() ?? '').replace(/\.[^.]+$/, '');
const dirName = (path: string): string => slashes(path).split('/').slice(-2, -1)[0] ?? '';

/** Sprite dosyalarından (yol -> url) id -> varyant adları (`idle-<v>.png`); varyantı olmayan id listede yok. */
export function variantsBySprite(spriteFiles: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const path of Object.keys(spriteFiles)) {
    const m = /^idle-(.+)$/.exec(baseName(path));
    if (m) (out[dirName(path)] ??= []).push(m[1]!);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}

export function variantLabel(spriteId: string, variant: string): string {
  return LABELS[kindOf(spriteId)]?.[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
}

/** Wiki gibi dosya-URL tablosu kullanan yerler için: seçili varyantı olan karakterlerin `idle.png` ve avatar URL'sini varyantınkiyle değiştirir. */
export function applyVariantFiles(files: { sprites: Record<string, string>; avatars: Record<string, string> }, pick: (spriteId: string) => string | null = getSpriteVariant): { sprites: Record<string, string>; avatars: Record<string, string> } {
  const sprites = { ...files.sprites };
  const avatars = { ...files.avatars };
  const byPath = (map: Record<string, string>, name: string, dir?: string): [string, string] | undefined =>
    Object.entries(map).find(([p]) => baseName(p) === name && (dir === undefined || dirName(p) === dir));
  for (const id of Object.keys(variantsBySprite(files.sprites))) {
    const v = pick(id);
    if (!v) continue;
    const idleVariant = byPath(files.sprites, `idle-${v}`, id);
    const idle = byPath(files.sprites, 'idle', id);
    if (idleVariant && idle) sprites[idle[0]] = idleVariant[1];
    const av = byPath(files.avatars, `${id}-${v}`);
    const avDefault = byPath(files.avatars, id);
    if (av && avDefault) avatars[avDefault[0]] = av[1];
  }
  return { sprites, avatars };
}

/** Diskteki varyantlar (Vite derleme sırasında assets/sprites taranır; elle liste yok): id -> varyant adları. */
export const SPRITE_VARIANTS: Record<string, string[]> = variantsBySprite(
  import.meta.glob('../../assets/sprites/*/idle-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
);
