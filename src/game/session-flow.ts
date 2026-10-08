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

/** Pure decision: the "Back to Main Menu" entry is shown everywhere except on the main menu itself. */
export const mainMenuButton = (ctx: FlowContext): boolean => ctx !== 'none' && ctx !== 'main-menu';

export type MenuItemId = 'resume' | 'settings' | 'newGame' | 'teamSelect' | 'retreat' | 'mainMenu';

export interface MenuSpec {
  items: MenuItemId[];
  /** Onay isteyen girişler: giriş -> soru metni (Yes / No). */
  confirm: Partial<Record<MenuItemId, string>>;
}

export const RETREAT_CONFIRM = 'Retreat? This battle will not count.';

/**
 * Pure decision (Ömer 2026-10-08): the in-game Menu (top right "Menu" button / Esc) of the battle, team select and multiplayer screens.
 * Quick battle: Resume / Settings / New Game / Team Select / Back to Main Menu; team select: Resume / Settings / New Game / Back to Main Menu;
 * campaign battle (undecided): Resume / Settings / Retreat to Map / Back to Main Menu (retreat: the battle does not count, same node and
 * seed next time; `retreatToMap` in campaign-session); multiplayer: Resume / Settings / Back to Main Menu (= leave the match).
 * Leaving an undecided battle asks first. No menu (null) on the main menu and the campaign map (it has its own Menu).
 */
export function menuItems(ctx: FlowContext): MenuSpec | null {
  const f = flowButtons(ctx);
  const leave = ctx === 'campaign-battle-live' ? 'Leave the battle and return to the main menu? Progress since your last save will be lost.' : ctx === 'mp-live' ? 'Leave the match? Leaving counts as a loss.' : 'Leave the current battle?';
  switch (ctx) {
    case 'battle-live':
    case 'battle-over':
    case 'team-select':
    case 'campaign-battle-live':
    case 'campaign-battle-over':
    case 'mp-live':
    case 'mp': {
      const items: MenuItemId[] = ['resume', 'settings'];
      if (f.newGame) items.push('newGame');
      if (f.teamSelect) items.push('teamSelect');
      if (ctx === 'campaign-battle-live') items.push('retreat');
      items.push('mainMenu');
      const confirm: MenuSpec['confirm'] = {};
      if (f.confirm) for (const id of ['newGame', 'teamSelect', 'mainMenu'] as const) if (items.includes(id)) confirm[id] = leave;
      if (items.includes('retreat')) confirm.retreat = RETREAT_CONFIRM;
      return { items, confirm };
    }
    default:
      return null;
  }
}

export const MENU_LABELS: Record<MenuItemId, string> = {
  resume: 'Resume',
  settings: 'Settings',
  newGame: 'New Game',
  teamSelect: 'Team Select',
  retreat: 'Retreat to Map',
  mainMenu: 'Back to Main Menu',
};

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
