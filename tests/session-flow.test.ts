import { describe, expect, it } from 'vitest';
import { flowButtons } from '../src/game/session-flow';

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
});
