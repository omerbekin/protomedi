import { describe, expect, it } from 'vitest';
import { content, describeStat } from '../src/engine';
import type { StatKind } from '../src/engine';
import { statName } from '../src/ui/stat-name';

describe('stat adı (değer ayrı sütunda; karakter sayfası ve Codex)', () => {
  it('describeStat başlığından değer atılır', () => {
    expect(statName('Strength 5')).toBe('Strength');
    expect(statName('Crit chance 7.5%')).toBe('Crit chance');
    expect(statName('Crit damage x1.5')).toBe('Crit damage');
    expect(statName('Armor 5')).toBe('Armor');
  });
  it('her statın başlığında sayı kalmaz', () => {
    const stats = Object.values(content.classes)[0]!.stats;
    const kinds: StatKind[] = ['hp', 'mp', 'str', 'int', 'dex', 'luck', 'spd', 'critChance', 'critMult', 'accuracy', 'evasion', 'armor', 'magicArmor', 'hpRegen', 'mpRegen'];
    for (const k of kinds) expect(statName(describeStat(k, stats, content.formulas).title), k).not.toMatch(/\d/);
  });
});
