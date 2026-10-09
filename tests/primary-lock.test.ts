import { describe, expect, it } from 'vitest';
import { applyUnitModifiers, content } from '../src/engine';
import { emptyEquipment, loadout, primaryBonusLost, primaryCheck } from '../src/progression';

// Primary bonusu ve item'ler (Ömer kararı, madde 278): item / level / ağaç statları SAYILIR; primary statını başka stat geçerse bonus normal kurala
// göre kapanır. Bunu yapacak bir değişiklik ÖNCEDEN bilinir (primaryCheck / primaryBonusLost: kuşanma ekranı ve skill ağacı uyarısı).

const f = content.formulas;
const paladin = content.classes.paladin!; // STR 12 / INT 13, primary INT (Mana Echo)

describe('primary bonusu: normal kural + önceden uyarı', () => {
  it('+2 STR alan Paladin Mana Echo kaybeder (motor kuralı değişmedi)', () => {
    expect(paladin.stats.primaryActive).toBe(true);
    const m = applyUnitModifiers(paladin, { attrAdd: { str: 2 } }, f);
    expect(m.stats.primaryActive).toBe(false);
    expect(m.stats.manaEcho).toBe(0);
  });

  it('yardımcı bunu önceden söyler: hangi stat geçiyor; eşitlikte bonus açık kalır', () => {
    const hero = { class: 'paladin', equipment: emptyEquipment() };
    const c = primaryCheck(hero, { attrDelta: { str: 2 } });
    expect(c).toMatchObject({ primary: 'int', activeNow: true, activeAfter: false, lost: true, gained: false, overtakenBy: ['str'] });
    expect(primaryBonusLost(hero, { attrDelta: { str: 1 } })).toBe(false); // 13 = 13: eşitlik açık
    expect(primaryBonusLost(hero, { attrDelta: { int: 5 } })).toBe(false);
  });

  it("item ile: DEX item'i Archer'ı bozmaz; dengeli puan bonusu korur; Gambler'a STR uyarısı", () => {
    const archer = { class: 'archer', equipment: emptyEquipment() };
    expect(primaryBonusLost(archer, { equip: { uid: 'i1', id: 'bracers_of_the_fox' } })).toBe(false);
    const broken = primaryCheck({ class: 'paladin' }, { attrDelta: { str: 3 } });
    expect(broken.lost).toBe(true);
    const back = primaryCheck({ class: 'paladin' }, { attrDelta: { str: 3, int: 3 } });
    expect(back.lost).toBe(false);
    const g = primaryCheck({ class: 'gambler' }, { attrDelta: { str: 5, luck: 0 } });
    expect([g.lost, g.overtakenBy]).toEqual([true, ['str']]);
  });

  it('güç katmanı primary için özel bayrak vermez (QB/MP/düşman kuralıyla aynı)', () => {
    expect(loadout({ class: 'paladin', equipment: { boots: { uid: 'i1', id: 'turnshoes' } } }).modifiers).toEqual({ armorAdd: 1 });
  });
});
