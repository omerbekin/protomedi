import type { IconKind } from './icon-kinds';
import { uiImage } from '../game/icon-image-files';

/**
 * ARAYÜZ İKONLARI (boyalı PNG, Ömer 2026-10-10): assets/ui-icons/<ad>.png (128, DOM) + small/<ad>.png (64, Phaser). Asıl sayfa
 * assets/source/ui-icons/ui-sheet.png, kesim `node tools/make-ui-icons.mjs`. Stat ikonlarıyla aynı yol: `ensureIcon(scene, uiIconName(k), renk,
 * false)` / `iconUrl(uiIconName(k))` adı art-registry > resolveSprite üzerinden görsele çözer (yumuşak ölçek, DOM `#smooth`). Dosya yoksa
 * UI_ICON_FALLBACK'teki kodla çizilen ikon (null = eskiden ikon yoktu: çağıran `hasUiImage` ile ikonsuz düzene döner).
 */
export const UI_ICON_KINDS = ['rest', 'skip', 'move', 'cooldown', 'rage', 'luckyEscape', 'passive', 'combatLog', 'gold', 'bag', 'gear', 'formation', 'codex', 'settings', 'fullscreen', 'menu'] as const;
export type UiIconKind = (typeof UI_ICON_KINDS)[number];

/** Görsel yoksa kodla çizilen yedek (eski ikon); null = eskiden bu yerde ikon yoktu. */
export const UI_ICON_FALLBACK: Record<UiIconKind, IconKind | null> = {
  rest: 'rest',
  skip: 'hourglass',
  move: 'boot',
  cooldown: 'hourglass',
  rage: 'flame',
  luckyEscape: null,
  passive: null,
  combatLog: null,
  gold: null,
  bag: null,
  gear: null,
  formation: null,
  codex: null,
  settings: null,
  fullscreen: null,
  menu: null,
};

/** Nerede kullanıldığı (Codex > Assets > Icons > UI icons satırı). */
export const UI_ICON_LABEL: Record<UiIconKind, string> = {
  rest: 'Rest (battle HUD global action)',
  skip: 'Skip Turn (battle HUD global action)',
  move: 'Move (battle HUD global action)',
  cooldown: 'Cooldown (skill buttons, tooltips)',
  rage: 'Rage (Warrior resource, skill costs)',
  luckyEscape: 'Lucky Escape pip (Luck primary)',
  passive: 'Passive (fallback when a class has no passive icon)',
  combatLog: 'Combat log toggle (battle HUD)',
  gold: 'Gold (Gear, campaign map, Endless camp / merchant)',
  bag: 'Bag counter (Gear, Endless camp / merchant)',
  gear: 'Gear button (campaign map, Endless camp)',
  formation: 'Formation button (campaign map)',
  codex: 'Codex (not used yet: menus are text-only)',
  settings: 'Settings (not used yet: menus are text-only)',
  fullscreen: 'Fullscreen (not used: top-right keeps the thin line icon)',
  menu: 'Menu (not used: top-right keeps the text button)',
};

export const UI_ICON_PREFIX = 'ui:';
export const uiIconName = (kind: UiIconKind): string => `${UI_ICON_PREFIX}${kind}`;

/** Görseli olmayan arayüz ikonunun kodla çizilen yedeği (bilinmeyen / yedeksiz türde null). */
export function uiIconFallback(kind: string): string | null {
  return (UI_ICON_FALLBACK as Record<string, IconKind | null | undefined>)[kind] ?? null;
}

/** Bu arayüz ikonunun boyalı görseli var mı (yedeği olmayan yerler ikonsuz düzene döner). */
export const hasUiImage = (kind: UiIconKind): boolean => uiImage(kind) !== null;

/** Bu arayüz ikonu gösterilebilir mi (görsel ya da kodla çizilen yedek). */
export const canShowUiIcon = (kind: UiIconKind): boolean => hasUiImage(kind) || UI_ICON_FALLBACK[kind] !== null;

/** Global eylemin (Rest / Skip Turn / Move) arayüz ikonu: türüne göre boyalı görsel; görsel de yedeği de yoksa verideki ikon adı. */
const GLOBAL_UI: Record<string, UiIconKind> = { rest: 'rest', skip: 'skip', move: 'move' };
export function globalIconName(def: { kind: string; icon?: string }): string {
  const k = GLOBAL_UI[def.kind];
  if (k && hasUiImage(k)) return uiIconName(k);
  return def.icon ?? (k ? uiIconName(k) : '');
}
