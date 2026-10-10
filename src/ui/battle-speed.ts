// "Battle speed" ayarı (Ömer 2026-10-10): savaşta turlar arası görsel beklemeyi (src/game/turn-wait.ts) ölçekler. 1x / 2x / 4x; varsayılan 1x.
// Motor ve sıra aynı kalır; yalnızca sunum hızı. Settings ekranı (src/ui/settings.ts) ve ana menü Settings sütunu (MainMenuScene) aynı kaynağı kullanır.
const KEY = 'proto.battleSpeed';
export const BATTLE_SPEEDS = [1, 2, 4] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];
const listeners = new Set<(v: BattleSpeed) => void>();

export function battleSpeed(): BattleSpeed {
  try {
    const v = Number(window.localStorage?.getItem(KEY));
    return (BATTLE_SPEEDS as readonly number[]).includes(v) ? (v as BattleSpeed) : 1;
  } catch {
    return 1;
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

/** Sıradaki seçenek (döngüsel; `dir` -1 geri). */
export function nextBattleSpeed(v: BattleSpeed, dir: 1 | -1 = 1): BattleSpeed {
  const i = BATTLE_SPEEDS.indexOf(v);
  return BATTLE_SPEEDS[(i + dir + BATTLE_SPEEDS.length) % BATTLE_SPEEDS.length]!;
}

export const battleSpeedLabel = (v: BattleSpeed): string => `${v}x`;

export function onBattleSpeedChange(fn: (v: BattleSpeed) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
