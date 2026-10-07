import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { content, describeStat } from '../src/engine';
import { ATTACK_STATS, DEFENSE_STATS, MAIN_STATS, rowCenters, statBlockMetrics, statRowText } from '../src/game/stat-columns';
import { STAT_COLOR, STAT_ICON, STAT_LABEL } from '../src/ui/stat-icons';

const stats = Object.values(content.classes)[0]!.stats;

describe('alt bar stat sütunları', () => {
  it('ana sütun aynı; atak ve defans sütunları istenen statlar', () => {
    expect(MAIN_STATS).toEqual(['str', 'dex', 'int', 'luck']);
    expect(ATTACK_STATS).toEqual(['critChance', 'critMult', 'accuracy', 'spd']);
    expect(DEFENSE_STATS).toEqual(['armor', 'magicArmor', 'evasion', 'hpRegen', 'mpRegen']);
  });

  it('her satırın ikonu, rengi, etiketi ve tooltip metni var', () => {
    for (const k of [...ATTACK_STATS, ...DEFENSE_STATS]) {
      expect(STAT_ICON[k], k).toBeTruthy();
      expect(STAT_COLOR[k], k).toMatch(/^#/);
      expect(STAT_LABEL[k], k).toBeTruthy();
      expect(describeStat(k, stats, content.formulas).lines.length, k).toBeGreaterThan(0);
    }
  });

  it('satır yazıları: crit damage çarpanı ve tur başı yenilenmeler', () => {
    const s = { ...stats, critMult: 1.5, hpRegen: 3.3, mpRegen: 5 };
    expect(statRowText('critMult', s, STAT_LABEL)).toBe('CDMG x1.5');
    expect(statRowText('hpRegen', s, STAT_LABEL)).toBe('HP+3/t');
    expect(statRowText('mpRegen', s, STAT_LABEL)).toBe('MP+5/t');
    expect(statRowText('critChance', { ...s, critChance: 0.05 }, STAT_LABEL)).toBe('CRIT 5%');
    expect(statRowText('critMult', { ...s, critMult: 2 }, STAT_LABEL)).toBe('CDMG x2');
  });

  it('tooltip: crit damage x çarpanı ve regen açıklaması', () => {
    const s = { ...stats, critMult: 1.5, hpRegen: 3, mpRegen: 5 };
    expect(describeStat('critMult', s, content.formulas).lines[0]).toBe('Critical hits deal x1.5 damage');
    expect(describeStat('hpRegen', s, content.formulas).lines[0]).toBe('Restores 3 HP at the start of each of its own turns');
    expect(describeStat('mpRegen', s, content.formulas).lines[0]).toBe('Restores 5 MP at the start of each of its own turns');
  });

  it('düzen: alt bar ayırıcı çizgisine (577 px) taşmaz, sütunlar yan yana ve çakışmaz', () => {
    const p = layout.commandPanel;
    const m = statBlockMetrics(p.padding);
    expect(m.mainX).toBeGreaterThanOrEqual(m.avatarX + m.avatar);
    expect(m.attackX).toBeGreaterThanOrEqual(m.mainX + m.mainW);
    expect(m.defenseX).toBeGreaterThanOrEqual(m.attackX + m.attackW);
    const skillsLeft = (layout.width - (4 * p.buttonWidth + 3 * p.gap)) / 2;
    expect(m.right).toBeLessThan(skillsLeft - 104);
  });

  it('satır orta noktaları eşit aralıklı ve alanın içinde; 5 satırda >= 24 px aralık', () => {
    const p = layout.commandPanel;
    const h = layout.height - p.y - 24;
    const rows = rowCenters(5, p.y + 12, h);
    expect(rows).toHaveLength(5);
    for (let i = 1; i < rows.length; i++) expect(rows[i]! - rows[i - 1]!).toBeCloseTo(h / 5, 5);
    expect(h / 5).toBeGreaterThanOrEqual(24);
    expect(rows[4]!).toBeLessThan(layout.height);
  });

  it('hover bilgi kutusu: blok + beceri/pasif alanı ekrana sığar', () => {
    const p = layout.commandPanel;
    const skillsLeft = (layout.width - (4 * p.buttonWidth + 3 * p.gap)) / 2;
    const x0 = skillsLeft + 4 * (p.buttonWidth + p.gap) + 10 - 12;
    expect(statBlockMetrics(x0).right + 8 + 84 + 20 + 32).toBeLessThanOrEqual(layout.width);
  });
});
