import type Phaser from 'phaser';

/**
 * Oyun akışı komutları (ayarlar menüsü ve sonuç ekranı ortak kullanır): "New Game" = rastgele yeni seed + rastgele takımlar, önceki
 * boyutlarla doğrudan savaş; "Team Select" = takım seçim ekranına dön. Asıl iş sahnelerin kendi metotlarındadır (BattleScene.newGame /
 * goToTeamSelect, TeamSelectScene.newGame); bu dosya yalnızca hangi sahnenin etkin olduğuna göre doğru olanı çağırır.
 */
export type FlowContext = 'battle-live' | 'battle-over' | 'team-select' | 'none';

interface FlowScene extends Phaser.Scene {
  newGame(): void;
  goToTeamSelect?(): void;
  /** Battle only: true while the battle is still undecided. */
  isBattleLive?(): boolean;
}

const KEYS = ['BattleScene', 'TeamSelectScene'] as const;
const active = (game: Phaser.Game): FlowScene | null => {
  for (const k of KEYS) if (game.scene.isActive(k)) return game.scene.getScene(k) as FlowScene;
  return null;
};

/** Pure decision: which settings buttons exist and whether they need a confirmation. */
export function flowButtons(ctx: FlowContext): { newGame: boolean; teamSelect: boolean; confirm: boolean } {
  return { newGame: ctx !== 'none', teamSelect: ctx === 'battle-live' || ctx === 'battle-over', confirm: ctx === 'battle-live' };
}

export function flowContext(game: Phaser.Game): FlowContext {
  const scene = active(game);
  if (!scene) return 'none';
  if (scene.scene.key === 'TeamSelectScene') return 'team-select';
  return scene.isBattleLive?.() ? 'battle-live' : 'battle-over';
}

export function startNewGame(game: Phaser.Game): void {
  active(game)?.newGame();
}

export function startTeamSelect(game: Phaser.Game): void {
  const scene = active(game);
  if (scene && scene.scene.key === 'BattleScene') scene.goToTeamSelect?.();
}
