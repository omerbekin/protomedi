import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { describePassive, describeSkill, passiveNumbers, skillNumbers } from '../src/engine/skill-info';
import { ITEMS, SLOT_IDS, canEquip, heroStats, type Equipment, type ItemDef } from '../src/progression';
import { compareNumbers, gearSkillRows, passiveTip, skillDiff, skillTip } from '../src/ui/gear-skills';
import { diffText } from '../src/ui/stat-tips';

// Gear ekranının Skills bölümü (Ömer 2026-10-10): sayılar savaş tooltip'iyle (skill-info) AYNI olmalı; item karşılaştırması fark biçimi stat açıklamalarıyla aynı.

const f = content.formulas;
const defs = { statuses: content.statuses, grounds: content.grounds };
const emptyEq = (): Equipment => Object.fromEntries(SLOT_IDS.map((k) => [k, null])) as unknown as Equipment;
const hero = (cls: string, items: ItemDef[] = []) => {
  const equipment = emptyEq();
  items.forEach((d, i) => (equipment[d.slot] = { uid: `t${i}`, id: d.id }));
  return { id: 'h', class: cls, level: 1, equipment };
};
/** Sınıfa uyan, verilen stat'ı veren en güçlü item (yuva başına bir). */
const strongItem = (cls: string, stat: string): ItemDef | undefined =>
  ITEMS.items.filter((d) => canEquip(cls, d) && (d.stats as Record<string, number | undefined>)[stat]).sort((a, b) => b.ilvl - a.ilvl)[0];
const classes = Object.values(content.classes).filter((c) => c.skills.length > 0);

describe('Gear skill numbers equal skill-info output', () => {
  it('every scaled number appears in the battle tooltip line, with and without an item', () => {
    let checked = 0;
    for (const c of classes) {
      const might = strongItem(c.id, 'might');
      const attr = strongItem(c.id, c.primary ?? 'str');
      const loadouts = [hero(c.id), hero(c.id, [might, attr].filter((d, i, a): d is ItemDef => !!d && a.findIndex((x) => x?.slot === d.slot) === i))];
      for (const h of loadouts) {
        const st = heroStats(h)!;
        for (const id of c.skills) {
          const skill = content.skills[id]!;
          const text = describeSkill(skill, st, f, content.summons, defs).lines.join('\n');
          for (const n of skillNumbers(skill, st, f, defs, content.summons).filter((x) => x.scaled)) {
            // tooltip satırındaki sayı: "(24)" ya da HoT'ta "Heal 7 per turn"
            expect(text, `${c.id} ${id} ${n.label}`).toMatch(new RegExp(`\\(${n.text}\\)|Heal ${n.text} per turn`));
            checked++;
          }
        }
        if (c.passive) {
          const text = describePassive(c.passive, st, f);
          for (const n of passiveNumbers(c.passive, st, f).filter((x) => x.scaled)) expect(text).toMatch(new RegExp(`\\b${n.text}\\b`));
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('Gear rows show the current numbers (no item) and before / after with an item, as skill-info computes them', () => {
    for (const c of classes) {
      const item = strongItem(c.id, 'might') ?? strongItem(c.id, c.primary ?? 'str');
      if (!item) continue;
      const before = heroStats(hero(c.id))!;
      const after = heroStats(hero(c.id, [item]))!;
      const plain = gearSkillRows(c.id, before);
      const cmp = gearSkillRows(c.id, before, after);
      expect(plain.length).toBe(c.skills.length + (c.passive ? 1 : 0));
      c.skills.forEach((id, i) => {
        const skill = content.skills[id]!;
        const now = skillNumbers(skill, before, f, defs, content.summons);
        const next = skillNumbers(skill, after, f, defs, content.summons);
        expect(plain[i]!.name).toBe(skill.name);
        expect(plain[i]!.numbers.map((n) => n.text)).toEqual(now.map((n) => n.text));
        expect(plain[i]!.numbers.every((n) => n.after === undefined && n.diff === undefined)).toBe(true);
        cmp[i]!.numbers.forEach((n, k) => {
          expect(n.text).toBe(now[k]!.text);
          if (n.scaled && now[k]!.text !== next[k]!.text) {
            expect(n.after).toBe(next[k]!.text);
            expect(n.diff).toBe(diffText(now[k]!.text, next[k]!.text));
          } else expect(n.after).toBeUndefined();
        });
      });
    }
  });

  it('a Might item raises a damage number and the row shows it in green', () => {
    const item = strongItem('mage', 'might')!;
    const rows = gearSkillRows('mage', heroStats(hero('mage'))!, heroStats(hero('mage', [item]))!);
    const up = rows.flatMap((r) => r.numbers).filter((n) => n.dir === 'up');
    expect(up.length).toBeGreaterThan(0);
    for (const n of up) expect(Number(n.after)).toBeGreaterThan(Number(n.text));
  });

  it('tooltip lines are the battle tooltip lines; with an item the changed number reads "a → b (+d)"', () => {
    const skill = content.skills[content.classes.mage!.skills[0]!]!;
    const before = heroStats(hero('mage'))!;
    const after = heroStats(hero('mage', [strongItem('mage', 'might')!]))!;
    const plain = skillTip(skill, before);
    expect(plain.rows.slice(0, describeSkill(skill, before, f, content.summons, defs).lines.length).map((r) => r.text)).toEqual(describeSkill(skill, before, f, content.summons, defs).lines);
    const cmp = skillTip(skill, before, after);
    expect(cmp.rows.some((r) => /\d+ → \d+ \(\+\d+\)/.test(r.text))).toBe(true);
    const p = content.classes.paladin?.passive ?? Object.values(content.classes).find((c) => c.passive)!.passive!;
    expect(passiveTip(p, before).rows[0]!.text).toBe(describePassive(p, before, f));
  });
});

describe('Skill diff sign and format (same rules as stat tips)', () => {
  it('increase is green "+", decrease red "-", zero hidden', () => {
    expect(skillDiff('24', '30')).toEqual({ text: '+6', dir: 'up' });
    expect(skillDiff('30', '24')).toEqual({ text: '-6', dir: 'down' });
    expect(skillDiff('24', '24')).toBeNull();
  });
  it('keeps the unit and precision of the value', () => {
    expect(skillDiff('6.5%', '7%')).toEqual({ text: '+0.5%', dir: 'up' });
    expect(skillDiff('12.5', '10')).toEqual({ text: '-2.5', dir: 'down' });
    expect(skillDiff('2 turns', '2 turns')).toBeNull();
  });
  it('fixed numbers (status chance / duration) never show a diff', () => {
    const now = [{ label: 'Burn', text: '2 turns', scaled: false }, { label: 'Damage', text: '20', value: 20, scaled: true }];
    const after = [{ label: 'Burn', text: '3 turns', scaled: false }, { label: 'Damage', text: '18', value: 18, scaled: true }];
    const out = compareNumbers(now, after);
    expect(out[0]!.after).toBeUndefined();
    expect(out[1]).toMatchObject({ after: '18', diff: '-2', dir: 'down' });
  });
});
