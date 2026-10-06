/**
 * Debug menüsü dock'unun bölüm yapısı ve saf yardımcıları (DOM yok: testlenebilir).
 * Her dock düğmesi bir bölümde durur (başlıklı grup), ikon + kısa işlev yazısı + açıklama (tooltip) taşır.
 */

/** Dock bölümleri (bu sırayla gösterilir). Yeni bir debug eylemi bu bölümlerden birine konur. */
export const DOCK_GROUPS = ['Battle flow', 'Units', 'Combat tweaks', 'View', 'Tools'] as const;
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
