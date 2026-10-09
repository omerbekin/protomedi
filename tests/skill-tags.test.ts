import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { skillTags } from '../src/ui/skill-tags';
import { skillRange } from '../src/wiki/catalog';

const tags = (id: string) => skillTags(content.skills[id]!).map((t) => t.text);

describe('skill etiket satırı (hedef · element · Melee / Ranged; tek kaynak src/ui/skill-tags.ts)', () => {
  it('hasar skill’inde hedef türü, element ve menzil yan yana', () => {
    const all = Object.values(content.skills);
    const fire = all.find((s) => s.motion !== 'melee' && s.effects.some((e) => e.type === 'damage' && e.element === 'fire'))!;
    expect(tags(fire.id)).toContain('Fire');
    expect(tags(fire.id).at(-1)).toBe('Ranged');
    const melee = all.find((s) => s.motion === 'melee' && s.target === 'single_enemy')!;
    expect(tags(melee.id).at(-1)).toBe('Melee');
  });
  it('destek / kendine skill: element ve menzil yok; Codex aynı menzil kuralını kullanır', () => {
    const all = Object.values(content.skills);
    const heal = all.find((s) => s.target === 'single_ally' && !s.effects.some((e) => e.type === 'damage'))!;
    expect(tags(heal.id)).toHaveLength(1);
    for (const s of all) {
      const r = skillRange(s);
      const t = skillTags(s);
      expect(t.some((x) => x.kind === 'range')).toBe(r === 'Melee' || r === 'Ranged');
      expect(t[0]!.kind).toBe('target');
    }
  });
});
