/**
 * Debug menüsü dock'unun bölüm yapısı ve saf yardımcıları (DOM yok: testlenebilir).
 * Her dock düğmesi bir bölümde durur (başlıklı grup), ikon + kısa işlev yazısı + açıklama (tooltip) taşır.
 */

/** Dock bölümleri (bu sırayla gösterilir). Yeni bir debug eylemi bu bölümlerden birine konur. */
export const DOCK_GROUPS = ['Battle', 'Rolls', 'Speed & View', 'Tools'] as const;
export type DockGroup = (typeof DOCK_GROUPS)[number];

/** Dock'un en üstündeki ipucu çubuğu (tek satır). */
export const DOCK_HINT = 'Hover a button for details';
export const DOCK_KEYS = '` or F2: open / close menu';

/** Düğme etiketi en çok bu kadar kelime olur (kısa işlev yazısı). */
export const SHORT_MAX_WORDS = 3;

export interface DockBadge {
  text: string;
  /** 'on' | 'off': açık/kapalı rozeti; 'val': seçili değer (ör. "2x"). */
  kind: 'on' | 'off' | 'val';
}

/** Düğmenin sağındaki durum rozeti: değer varsa değer, açık/kapalı düğmelerde ON/OFF, aksi halde yok. */
export function dockBadge(on: boolean | undefined, state: string | null | undefined): DockBadge | null {
  if (state) return { text: state, kind: 'val' };
  if (on === undefined) return null;
  return on ? { text: 'ON', kind: 'on' } : { text: 'OFF', kind: 'off' };
}

/** Hover açıklaması: "Etiket: ne yaptığı. Now: ON". */
export function dockTooltip(label: string, hint: string | undefined, badge: DockBadge | null): string {
  const base = hint ? `${label}: ${hint.replace(/\.$/, '')}.` : label;
  if (!badge) return base;
  return `${base} Now: ${badge.text}`;
}

/** Etiketteki durum ekini atar: "Skip anims: on" -> "Skip anims". */
export const labelBase = (label: string): string => label.split(':')[0]!.trim();

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

// --- Tek yapı: sekmeler + her sekmede ikonlu düğmeler (ayrı yazı-düğme grubu ve ayrı dock yok) ---

/** İlk sekme: en sık kullanılan eylemler (`dock` alanı olanlar) bölüm bölüm, diğer sekmelerle aynı ikonlu görünümde. */
export const QUICK_TAB = 'Quick';

/** Sekme başlıklarının ikonu (src/ui/icon-kinds.ts). */
export const TAB_ICONS: Record<string, string> = {
  Quick: 'burst',
  Battle: 'sword',
  Unit: 'muscle',
  Skills: 'wand',
  Rolls: 'dice',
  'Speed & View': 'hourglass',
  Setup: 'gear',
  Campaign: 'boot',
  'Test Mode': 'flask',
  Characters: 'team',
  Versions: 'swap',
  Data: 'clipboard',
};

/** Bölüm başlıklarının ikonu (yoksa başlık ikonsuz kalır; düğmelerin hepsi ikonludur). */
export const SECTION_ICONS: Record<string, string> = {
  ...TAB_ICONS,
  Flow: 'next',
  Rules: 'gear',
  Team: 'team',
  Tools: 'wand',
  Map: 'boot',
  Progress: 'next',
  Saves: 'clipboard',
  Menu: 'frame',
  Display: 'eye',
  'Battle setup': 'restart',
  'Test battles': 'flask',
  Multiplayer: 'team',
  'Result screens': 'helm',
  'Animation speed': 'hourglass',
  'Match record': 'clipboard',
  'Damage dealt (both sides)': 'sword',
  'Critical hits': 'burst',
  'Dodging (physical hits)': 'feather',
  'Misses (attacker misses)': 'arrow',
  Switches: 'freemp',
  Health: 'heart',
  Mana: 'droplet',
  Rage: 'flame',
  Life: 'ankh',
  'Add status': 'poison',
};

/** İkonu verilmemiş bir düğmenin yedek ikonu. */
export const DEFAULT_ACTION_ICON = 'gear';

/** Etiketin sonundaki durumu rozete çevirir: "Skip anims: on" -> ON, "Rotate view: auto" -> değer rozeti; iki noktası yoksa rozet yok. */
export function labelBadge(label: string): DockBadge | null {
  const i = label.indexOf(':');
  if (i < 0) return null;
  const v = label.slice(i + 1).trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (low === 'on') return { text: 'ON', kind: 'on' };
  if (low === 'off') return { text: 'OFF', kind: 'off' };
  return { text: v, kind: 'val' };
}
