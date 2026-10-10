// Skill etiket satırı (Ömer 2026-10-09): tooltip başlığının altında yan yana "SINGLE TARGET · FIRE · RANGED".
// TEK kaynak: hedef rozeti src/engine/skill-info.ts > targetBadge (açıklamalarla aynı), element skill'in hasar / zemin etkilerinden,
// menzil motorun melee kuralından (`motion === 'melee'`). Savaş HUD'ı, takım seçimi ve Codex aynı yardımcıyı kullanır.
// Element yalnızca hasar veren skill'de (destek / şifa / kendine skill'de yok); menzil yalnızca Melee / Ranged (dost ya da kendine
// hedefli skill'de hedef rozeti zaten söyler).
import layout from '../../data/battle-layout.json';
import { content } from '../engine';
import { targetBadge } from '../engine/skill-info';
import type { Element, SkillDef } from '../engine';
import { ELEMENT_ICON } from '../game/float-text';
import { paintedOr } from './misc-icons';

export type SkillRange = 'Melee' | 'Ranged' | 'Support' | 'Self';

export const ELEMENT_COLOR = layout.colors.element as Record<string, string>;

/** Element adı (Codex Elements bölümüyle aynı: id'nin baş harfi büyük). */
export const elementName = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/** Element ikonu (yüzen hasar yazısı ve Codex ile aynı): boyalı element ikonu (assets/misc-icons/element), yoksa piksel ikon; fiziksel: kılıç. */
export const elementIcon = (id: string): string => paintedOr('element', id, ELEMENT_ICON[id] ?? 'sword');

/** Menzil: motorun melee kuralı (`motion === 'melee'`); kendine = Self; dost hedefli = Support; kalanı (büyü, alan, gökten, ok) Ranged. */
export function skillRange(skill: SkillDef): SkillRange {
  if (skill.motion === 'melee') return 'Melee';
  if (skill.target === 'self') return 'Self';
  if (skill.target === 'single_ally' || skill.target === 'dead_ally' || skill.target === 'all_allies') return 'Support';
  return 'Ranged';
}

/** Skill'in hasar elementleri (hasar etkileri + bıraktığı zeminler + sıçrama). */
export function skillElements(skill: SkillDef): Element[] {
  const out: Element[] = [];
  for (const e of skill.effects) {
    if (e.type === 'damage') out.push(e.element ?? 'physical');
    else if (e.type === 'ground') out.push(content.grounds[e.ground]?.element as Element);
  }
  if (skill.splash) out.push('physical');
  return [...new Set(out.filter(Boolean))];
}

export interface SkillTag {
  kind: 'target' | 'element' | 'range';
  text: string;
  /** Elementte kendi rengi. */
  color?: string;
  /** Elementte ikon türü (src/ui/icon-kinds.ts). */
  icon?: string;
}

/** Etiket satırı: hedef türü, element(ler), Melee / Ranged. */
export function skillTags(skill: SkillDef): SkillTag[] {
  const out: SkillTag[] = [{ kind: 'target', text: targetBadge(skill) }];
  for (const el of skillElements(skill)) out.push({ kind: 'element', text: elementName(el), color: ELEMENT_COLOR[el], icon: elementIcon(el) });
  const r = skillRange(skill);
  if (r === 'Melee' || r === 'Ranged') out.push({ kind: 'range', text: r });
  return out;
}
