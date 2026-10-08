import { describe, expect, it } from 'vitest';
import { flowButtons, menuItems, MENU_LABELS, RETREAT_CONFIRM } from '../src/game/session-flow';

describe('ayarlar menüsü: New Game / Team Select düğmeleri', () => {
  it('devam eden savaşta ikisi de var ve onay ister', () => {
    expect(flowButtons('battle-live')).toEqual({ newGame: true, teamSelect: true, confirm: true });
  });
  it('biten savaşta onaysız; takım seçiminde yalnızca New Game (onaysız)', () => {
    expect(flowButtons('battle-over')).toEqual({ newGame: true, teamSelect: true, confirm: false });
    expect(flowButtons('team-select')).toEqual({ newGame: true, teamSelect: false, confirm: false });
  });
  it('etkin sahne yoksa düğme yok', () => {
    expect(flowButtons('none')).toEqual({ newGame: false, teamSelect: false, confirm: false });
  });
  it('multiplayer: New Game / Team Select yok; canlı savaştan çıkış onay ister (ayrılmak = yenilgi)', () => {
    expect(flowButtons('mp-live')).toEqual({ newGame: false, teamSelect: false, confirm: true });
    expect(flowButtons('mp')).toEqual({ newGame: false, teamSelect: false, confirm: false });
  });
});

describe('oyun içi Menu (sağ üst Menu düğmesi / Esc): içerik bağlama göre', () => {
  it('hızlı savaş: Resume / Settings / New Game / Team Select / Back to Main Menu; canlıyken çıkışlar onaylı', () => {
    const m = menuItems('battle-live')!;
    expect(m.items).toEqual(['resume', 'settings', 'newGame', 'teamSelect', 'mainMenu']);
    expect(Object.keys(m.confirm).sort()).toEqual(['mainMenu', 'newGame', 'teamSelect']);
    expect(menuItems('battle-over')!.confirm).toEqual({});
  });
  it('takım seçimi: Resume / Settings / New Game / Back to Main Menu (onaysız)', () => {
    expect(menuItems('team-select')).toEqual({ items: ['resume', 'settings', 'newGame', 'mainMenu'], confirm: {} });
  });
  it('sefer savaşı: Resume / Settings / Retreat to Map / Back to Main Menu; ikisi de onaylı; bitmiş savaşta Retreat yok', () => {
    const m = menuItems('campaign-battle-live')!;
    expect(m.items).toEqual(['resume', 'settings', 'retreat', 'mainMenu']);
    expect(m.confirm.retreat).toBe(RETREAT_CONFIRM);
    expect(m.confirm.mainMenu).toMatch(/main menu/i);
    expect(menuItems('campaign-battle-over')!.items).toEqual(['resume', 'settings', 'mainMenu']);
    expect(MENU_LABELS.retreat).toBe('Retreat to Map');
  });
  it('multiplayer: Back to Main Menu = maçı terk (canlıyken onaylı)', () => {
    expect(menuItems('mp-live')).toEqual({ items: ['resume', 'settings', 'mainMenu'], confirm: { mainMenu: 'Leave the match? Leaving counts as a loss.' } });
    expect(menuItems('mp')!.confirm).toEqual({});
  });
  it('ana menüde ve sefer haritasında bu menü yok (ana menüde Settings satırı, haritada kendi Menu penceresi)', () => {
    expect(menuItems('main-menu')).toBeNull();
    expect(menuItems('campaign')).toBeNull();
    expect(menuItems('none')).toBeNull();
  });
});
