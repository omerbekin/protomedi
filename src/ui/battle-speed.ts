// "Battle speed" ayarı (Ömer 2026-10-10): savaşta turlar arası görsel beklemeyi ve sırası gelen birimin öne adımını (src/game/turn-wait.ts)
// ölçekler; bekleme = süre / hız (2,5 sn tavan da 1x'te tanımlı: tavan 2,5 sn / hız). Settings'te kaydırıcı, ayrık adımlar:
// 0.25x, 0.5x, 0.75x, 1x, 2x, 4x (Sound volume / UI sounds ile aynı kaydırıcı). Varsayılan 1x. Eski kayıtlar (1 / 2 / 4) aynen okunur.
// Motor ve sıra aynı kalır; yalnızca sunum hızı. Settings ekranı (src/ui/settings.ts) ve ana menü Settings sütunu (MainMenuScene) aynı kaynak.
const KEY = 'proto.battleSpeed';
export const BATTLE_SPEEDS = [0.25, 0.5, 0.75, 1, 2, 4] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];
export const DEFAULT_SPEED: BattleSpeed = 1;
const listeners = new Set<(v: BattleSpeed) => void>();

/** Kayıtlı değeri adımlardan birine çevirir (eski 1 / 2 / 4 aynen; bozuk / bilinmeyen değer varsayılan 1x). */
export function parseBattleSpeed(raw: string | null | undefined): BattleSpeed {
  const v = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(v)) return DEFAULT_SPEED;
  return (BATTLE_SPEEDS as readonly number[]).includes(v) ? (v as BattleSpeed) : DEFAULT_SPEED;
}

export function battleSpeed(): BattleSpeed {
  try {
    return parseBattleSpeed(window.localStorage?.getItem(KEY));
  } catch {
    return DEFAULT_SPEED;
  }
}

export function setBattleSpeed(v: BattleSpeed): void {
  try {
    window.localStorage?.setItem(KEY, String(v));
  } catch {
    /* depolama yok: yalnızca bu oturum */
  }
  for (const fn of listeners) fn(v);
}

/** Kaydırıcı konumu (0-5) <-> hız. */
export const speedIndex = (v: BattleSpeed): number => Math.max(0, BATTLE_SPEEDS.indexOf(v));
export const speedAt = (i: number): BattleSpeed => BATTLE_SPEEDS[Math.min(BATTLE_SPEEDS.length - 1, Math.max(0, Math.round(i)))]!;
export const SPEED_STEPS = BATTLE_SPEEDS.length - 1;

/** Yanındaki yazı: "0.25x", "1x", "4x". */
export const battleSpeedLabel = (v: BattleSpeed): string => `${v}x`;

export function onBattleSpeedChange(fn: (v: BattleSpeed) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
