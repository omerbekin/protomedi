import type Phaser from 'phaser';

/**
 * Oyun akışı komutları (ayarlar menüsü ve sonuç ekranı ortak kullanır): "New Game" = rastgele yeni seed + rastgele takımlar, önceki
 * boyutlarla doğrudan savaş; "Team Select" = takım seçim ekranına dön; "Main Menu" = ana menü (sefer ilerlemesi son kayıttadır).
 * Asıl iş sahnelerin kendi metotlarındadır (BattleScene.newGame / goToTeamSelect, TeamSelectScene.newGame); bu dosya yalnızca hangi
 * sahnenin etkin olduğuna göre doğru olanı çağırır. Sefer savaşında (BattleScene.campaign) New Game / Team Select yoktur, yalnızca Main Menu.
 */
export type FlowContext = 'battle-live' | 'battle-over' | 'team-select' | 'campaign-battle-live' | 'campaign-battle-over' | 'campaign' | 'mp-live' | 'mp' | 'main-menu' | 'none';

interface FlowScene extends Phaser.Scene {
  newGame?(): void;
  goToTeamSelect?(): void;
  /** Battle only: true while the battle is still undecided. */
  isBattleLive?(): boolean;
  /** Battle only: set when the battle was started from the campaign map. */
  campaign?: unknown;
  /** Multiplayer (savaş ya da takım seçimi): yalnızca Main Menu; canlı savaşta onay (ayrılmak = yenilgi). */
  mp?: unknown;
}

const KEYS = ['BattleScene', 'TeamSelectScene', 'CampaignMapScene', 'MainMenuScene', 'MultiplayerScene'] as const;
const active = (game: Phaser.Game): FlowScene | null => {
  for (const k of KEYS) if (game.scene.isActive(k)) return game.scene.getScene(k) as FlowScene;
  return null;
};

/** Pure decision: which settings buttons exist and whether they need a confirmation. */
export function flowButtons(ctx: FlowContext): { newGame: boolean; teamSelect: boolean; confirm: boolean } {
  return {
    newGame: ctx === 'battle-live' || ctx === 'battle-over' || ctx === 'team-select',
    teamSelect: ctx === 'battle-live' || ctx === 'battle-over',
    confirm: ctx === 'battle-live' || ctx === 'campaign-battle-live' || ctx === 'mp-live',
  };
}

/** Pure decision: the settings "Main Menu" row is shown everywhere except on the main menu itself. */
export const mainMenuButton = (ctx: FlowContext): boolean => ctx !== 'none' && ctx !== 'main-menu';

export function flowContext(game: Phaser.Game): FlowContext {
  const scene = active(game);
  if (!scene) return 'none';
  const key = scene.scene.key;
  if (key === 'MultiplayerScene') return 'mp';
  if (scene.mp) return key === 'BattleScene' && scene.isBattleLive?.() ? 'mp-live' : 'mp';
  if (key === 'TeamSelectScene') return 'team-select';
  if (key === 'MainMenuScene') return 'main-menu';
  if (key === 'CampaignMapScene') return 'campaign';
  const live = !!scene.isBattleLive?.();
  if (scene.campaign) return live ? 'campaign-battle-live' : 'campaign-battle-over';
  return live ? 'battle-live' : 'battle-over';
}

export function startNewGame(game: Phaser.Game): void {
  active(game)?.newGame?.();
}

export function startTeamSelect(game: Phaser.Game): void {
  const scene = active(game);
  if (scene && scene.scene.key === 'BattleScene') scene.goToTeamSelect?.();
}

export function startMainMenu(game: Phaser.Game): void {
  const scene = active(game);
  if (scene && scene.scene.key !== 'MainMenuScene') scene.scene.start('MainMenuScene');
}
