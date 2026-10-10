import { describe, expect, it } from 'vitest';
import { flowButtons, menuItems, MENU_LABELS, RETREAT_CONFIRM } from '../src/game/session-flow';

describe('ayarlar menüsü: New Game / Team Select düğmeleri', () => {
  it('devam eden savaşta ikisi de var ve onay ister', () => {
    expect(flowButtons('battle-live')).toEqual({ newGame: true, teamSelect: true, confirm: true });
  });
  it('biten savaşta onaysız; takım seçiminde Menu yok (◂ Back)', () => {
    expect(flowButtons('battle-over')).toEqual({ newGame: true, teamSelect: true, confirm: false });
    expect(flowButtons('team-select')).toEqual({ newGame: false, teamSelect: false, confirm: false });
  });
  it('etkin sahne yoksa düğme yok', () => {
    expect(flowButtons('none')).toEqual({ newGame: false, teamSelect: false, confirm: false });
  });
  it('multiplayer: New Game / Team Select yok; canlı savaştan çıkış onay ister (ayrılmak = yenilgi)', () => {
    expect(flowButtons('mp-live')).toEqual({ newGame: false, teamSelect: false, confirm: true });
    expect(flowButtons('mp')).toEqual({ newGame: false, teamSelect: false, confirm: false });
  });
});

describe('oyun içi Menu (sağ üst Menu düğmesi / Esc): içerik bağlama göre; Codex her yerde Settings in hemen üstünde', () => {
  it('hızlı savaş: Resume / Codex / Settings / Leave / Main Menu (New Game yok); canlıyken çıkışlar onaylı', () => {
    const m = menuItems('battle-live')!;
    expect(m.items).toEqual(['resume', 'codex', 'settings', 'teamSelect', 'mainMenu']);
    expect(m.items.map((id) => m.labels?.[id] ?? MENU_LABELS[id])).toEqual(['Resume', 'Codex', 'Settings', 'Leave', 'Main Menu']);
    expect(Object.keys(m.confirm).sort()).toEqual(['mainMenu', 'teamSelect']);
    expect(menuItems('battle-over')!.confirm).toEqual({});
    expect(menuItems('battle-over')!.items).toEqual(['resume', 'codex', 'settings', 'teamSelect', 'mainMenu']);
  });
  it('kurulum ekranlarında (takım seçimi, multiplayer lobisi / takım seçimi) Menu yok: sol üstte ◂ Back (Geri / Menu kuralı)', () => {
    expect(menuItems('team-select')).toBeNull();
    expect(menuItems('mp-setup')).toBeNull();
  });
  it('sefer / endless savaşı: Resume / Codex / Settings / Retreat / Main Menu; ikisi de onaylı; bitmiş savaşta Retreat yok', () => {
    const m = menuItems('campaign-battle-live')!;
    expect(m.items).toEqual(['resume', 'codex', 'settings', 'retreat', 'mainMenu']);
    expect(m.confirm.retreat).toBe(RETREAT_CONFIRM);
    expect(m.confirm.mainMenu).toMatch(/main menu/i);
    expect(menuItems('campaign-battle-over')!.items).toEqual(['resume', 'codex', 'settings', 'mainMenu']);
    expect(MENU_LABELS.retreat).toBe('Retreat to Map');
  });
  it('multiplayer: Resume / Codex / Settings / Leave (= maçı terk, canlıyken onaylı)', () => {
    const m = menuItems('mp-live')!;
    expect(m.items).toEqual(['resume', 'codex', 'settings', 'mainMenu']);
    expect(m.labels).toEqual({ mainMenu: 'Leave' });
    expect(m.confirm).toEqual({ mainMenu: 'Leave the match? Leaving counts as a loss.' });
    expect(menuItems('mp')!.confirm).toEqual({});
  });
  it('ana menüde ve sefer haritasında bu menü yok (ana menüde Settings satırı, haritada kendi Menu penceresi)', () => {
    expect(menuItems('main-menu')).toBeNull();
    expect(menuItems('campaign')).toBeNull();
    expect(menuItems('none')).toBeNull();
  });
});

describe('sefer haritası Menu: savaştakiyle aynı ortak bileşen (Ömer 2026-10-10)', () => {
  it('Resume / Save / Load / Codex / Settings / Main Menu; Save yazısı sahneden; Load yalnızca Normal; gizliyken menü yok; onay yok', () => {
    expect(menuItems('campaign')).toBeNull();
    expect(menuItems('campaign', { available: false, save: 'Save  1/5', load: true })).toBeNull();
    const m = menuItems('campaign', { available: true, save: 'Save  1/5', load: true })!;
    expect(m.items).toEqual(['resume', 'save', 'load', 'codex', 'settings', 'mainMenu']);
    expect(m.labels?.save).toBe('Save  1/5');
    expect(m.confirm).toEqual({});
    expect(menuItems('campaign', { available: true, save: null, load: false })!.items).toEqual(['resume', 'codex', 'settings', 'mainMenu']);
    expect(MENU_LABELS.load).toBe('Load');
  });
});

