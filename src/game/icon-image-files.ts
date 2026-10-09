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
