/**
 * GÖRSEL v2 İKON dosyaları (hazır PNG): assets/icons-v2/<sahip>/<ad>.png, Vite derlemesinde taranır (elle liste yok). Kimlik '<sahip>/<ad>'
 * (ad = v1 ikon adı: skill.icon / passive.icon / logo). Sahibin v2 icons.ts dosyası `{ image: '<sahip>/<ad>' }` girdisiyle bağlar.
 * Asıllar assets/source/<sahip>-icons altında (oyuna yüklenmez); içe aktarma: `node tools/import-v2-icons.mjs`. Phaser'sız ve DOM'suz.
 */
const files = import.meta.glob('../../assets/icons-v2/*/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const idOf = (path: string): string => {
  const parts = path.split('/');
  const file = (parts.pop() ?? '').replace(/\.png$/, '');
  return `${parts.pop() ?? ''}/${file}`;
};

/** Kimlik -> URL. */
export const ICON_IMAGE_URLS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(files).map(([p, url]) => [idOf(p), url]));

/** Görsel ikonun URL'si (dosya yoksa null). */
export const iconImageUrl = (id: string): string | null => ICON_IMAGE_URLS[id] ?? null;

/** Görsel ikonların piksel boyutu (kare; içe aktarıcı 128 bekler). */
export const ICON_IMAGE_SIZE = 128;

// ---------------------------------------------------------------- STAT ikonları (boyalı PNG, Ömer 2026-10-10)

/**
 * Stat ikonları: assets/stat-icons/<stat>.png (128, DOM) + assets/stat-icons/small/<stat>.png (64, Phaser dokusu). <stat> = StatKind ya da
 * 'might'. Asıl sayfa assets/source/stat-icons/stat-sheet.png (oyuna yüklenmez); kesim: `node tools/make-stat-icons.mjs`. Tek giriş noktası
 * `statIconName(kind)` (src/ui/stat-icons.ts) -> art-registry 'stat:<kind>' adını bu dosyalara çözer; dosya yoksa kodla çizilen ikona düşer.
 */
const statFiles = import.meta.glob('../../assets/stat-icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const statSmall = import.meta.glob('../../assets/stat-icons/small/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName = (rec: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(rec).map(([p, url]) => [(p.split('/').pop() ?? '').replace(/\.png$/, ''), url]));

/** Stat -> { url (128, DOM), small (64, Phaser; yoksa url) }. */
export const STAT_IMAGE_FILES: Readonly<Record<string, { url: string; small: string }>> = (() => {
  const big = byName(statFiles);
  const small = byName(statSmall);
  return Object.fromEntries(Object.entries(big).map(([k, url]) => [k, { url, small: small[k] ?? url }]));
})();

/** Statın görsel ikonu (dosya yoksa null). */
export const statImage = (kind: string): { url: string; small: string } | null => STAT_IMAGE_FILES[kind] ?? null;

/** Phaser'daki stat dokusunun kenarı (small dosyası 64). */
export const STAT_IMAGE_TEXTURE = 64;

/** DOM'da boyalı görselin adresine eklenen işaret: style.css `img[src$='#smooth']` pixelated yerine yumuşak küçültür. */
export const SMOOTH_MARK = '#smooth';
export const smoothUrl = (url: string): string => (url.endsWith(SMOOTH_MARK) ? url : `${url}${SMOOTH_MARK}`);

// ---------------------------------------------------------------- ARAYÜZ ikonları (boyalı PNG, Ömer 2026-10-10)

/**
 * Arayüz ikonları: assets/ui-icons/<ad>.png (128, DOM) + assets/ui-icons/small/<ad>.png (64, Phaser dokusu). <ad> = UiIconKind
 * (src/ui/ui-icons.ts: rest, skip, move, cooldown, rage, luckyEscape, passive, combatLog, gold, bag, gear, formation, codex, settings,
 * fullscreen, menu). Asıl sayfa assets/source/ui-icons/ui-sheet.png; kesim `node tools/make-ui-icons.mjs`. Tek giriş `uiIconName(ad)` ->
 * art-registry 'ui:<ad>'; dosya yoksa kodla çizilen yedek (UI_ICON_FALLBACK) ya da hiç ikon.
 */
const uiFiles = import.meta.glob('../../assets/ui-icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const uiSmall = import.meta.glob('../../assets/ui-icons/small/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Arayüz ikonu -> { url (128, DOM), small (64, Phaser; yoksa url) }. */
export const UI_IMAGE_FILES: Readonly<Record<string, { url: string; small: string }>> = (() => {
  const big = byName(uiFiles);
  const small = byName(uiSmall);
  return Object.fromEntries(Object.entries(big).map(([k, url]) => [k, { url, small: small[k] ?? url }]));
})();

/** Arayüz ikonunun görseli (dosya yoksa null). */
export const uiImage = (kind: string): { url: string; small: string } | null => UI_IMAGE_FILES[kind] ?? null;
