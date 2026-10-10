// "Battle speed" ayarı (Ömer 2026-10-10): savaşta turlar arası görsel beklemeyi ve sırası gelen birimin öne adımını (src/game/turn-wait.ts)
// ölçekler; bekleme = süre / hız (2,5 sn tavan da 1x'te tanımlı: tavan 2,5 sn / hız). Settings'te kaydırıcı, 20 adım (Ömer 2026-10-10:
// tüm kaydırıcılar 20 adım): 0.25x - 4x, 1x çevresinde ince (0.1 adım), uçlarda kaba. Varsayılan 1x. Eski kayıtlar (0.25 / 0.5 / 0.75 /
// 1 / 2 / 4) en yakın adıma (logaritmik uzaklık) taşınır. Motor ve sıra aynı kalır; yalnızca sunum hızı. Settings ekranı (src/ui/settings.ts)
// ve ana menü Settings sütunu (MainMenuScene) aynı kaynak.
const KEY = 'proto.battleSpeed';
export const BATTLE_SPEEDS = [0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2, 2.25, 2.5, 3, 3.5, 4] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];
export const DEFAULT_SPEED: BattleSpeed = 1;
const listeners = new Set<(v: BattleSpeed) => void>();

/** Bir hıza en yakın adım (logaritmik uzaklık: 0.75 -> 0.8, 3 -> 3). */
export function nearestSpeed(v: number): BattleSpeed {
  let best: BattleSpeed = DEFAULT_SPEED;
  let bestD = Infinity;
  for (const s of BATTLE_SPEEDS) {
    const d = Math.abs(Math.log(s / v));
    if (d < bestD - 1e-9) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Kayıtlı değeri adımlardan birine çevirir (eski değerler en yakın adıma; bozuk / aralık dışı değer varsayılan 1x). */
export function parseBattleSpeed(raw: string | null | undefined): BattleSpeed {
  const v = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(v) || v < 0.2 || v > 5) return DEFAULT_SPEED;
  return nearestSpeed(v);
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

/** Kaydırıcı konumu (0-20) <-> hız. */
export const speedIndex = (v: number): number => Math.max(0, BATTLE_SPEEDS.indexOf(nearestSpeed(v)));
export const speedAt = (i: number): BattleSpeed => BATTLE_SPEEDS[Math.min(BATTLE_SPEEDS.length - 1, Math.max(0, Math.round(i)))]!;
export const SPEED_STEPS = BATTLE_SPEEDS.length - 1;

/** Yanındaki yazı: "0.25x", "1x", "1.25x", "4x". */
export const battleSpeedLabel = (v: number): string => `${v}x`;

export function onBattleSpeedChange(fn: (v: BattleSpeed) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
