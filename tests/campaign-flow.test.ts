import { describe, expect, it } from 'vitest';
import { flowButtons, mainMenuButton } from '../src/game/session-flow';
import { buildMechanics } from '../src/wiki/catalog';

describe('sefer akışı: ayarlar menüsü ve wiki', () => {
  it('sefer savaşında New Game / Team Select yok; devam eden sefer savaşından çıkış onay ister; Main Menu ana menü dışında her yerde', () => {
    expect(flowButtons('campaign-battle-live')).toEqual({ newGame: false, teamSelect: false, confirm: true });
    expect(flowButtons('campaign-battle-over')).toEqual({ newGame: false, teamSelect: false, confirm: false });
    expect(flowButtons('campaign')).toEqual({ newGame: false, teamSelect: false, confirm: false });
    expect(flowButtons('main-menu')).toEqual({ newGame: false, teamSelect: false, confirm: false });
    for (const ctx of ['battle-live', 'battle-over', 'team-select', 'campaign', 'campaign-battle-live', 'campaign-battle-over'] as const) expect(mainMenuButton(ctx), ctx).toBe(true);
    expect(mainMenuButton('main-menu')).toBe(false);
    expect(mainMenuButton('none')).toBe(false);
  });

  it('wiki Mechanics bölümünde Campaign makalesi var; oranlar veriden', () => {
    const a = buildMechanics().find((x) => x.id === 'campaign');
    expect(a).toBeTruthy();
    const text = a!.blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : [])).join(' ');
    expect(text).toMatch(/20% of their maximum HP/);
    expect(text).toMatch(/up to 5 saves/);
    expect(text).toMatch(/3 campaign slots/);
    expect(text).toMatch(/Easy, Medium or Hard/);
    expect(text).toMatch(/17 stops/);
  });
});
