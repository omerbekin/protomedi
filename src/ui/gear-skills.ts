/**
 * Gear ekranının "Skills" bölümü (saf model; DOM yok, testli: tests/gear-skills.test.ts). Seçili kahramanın 4 skill'i + pasifi, o anki
 * statlarıyla (temel + item'ler: progression > heroStats) hesaplanan anahtar sayılar ve karşılaştırma (seçili / sürüklenen item takılırsa
 * "24 → 30 (+6)"). Sayılar ve tooltip metni savaş tooltip'iyle AYNI kaynaktan: src/engine/skill-info.ts (describeSkill / skillNumbers /
 * describePassive / passiveNumbers). Fark biçimi stat açıklamalarıyla aynı (src/ui/stat-tips.ts > diffText / mergeLine).
 * Epic / Legendary item etkileri (items.json > effects) skill sayılarını değiştiremez (skill-info yalnızca statları bilir): karşılaştırmaya girmez.
 */
import { content } from '../engine';
import { describePassive, describeSkill, passiveNumbers, skillNumbers, type SkillInfo, type SkillNumber } from '../engine/skill-info';
import type { PassiveDef, SkillDef, Stats } from '../engine';
import { diffText, mergeLine } from './stat-tips';

/** Ekranda gösterilen sayı: şimdiki değer, item takılırsa yeni değer ve fark (fark 0 ise after / diff yok). */
export interface GearSkillNumber extends SkillNumber {
  after?: string;
  diff?: string;
  dir?: 'up' | 'down';
}

export interface GearSkillRow {
  /** Skill id ya da 'passive'. */
  id: string;
  name: string;
  passive: boolean;
  skill?: SkillDef;
  passiveDef?: PassiveDef;
  /** Bedel etiketi ('12 MP', 'Free', '30 Rage'); pasifte ''. */
  cost: string;
  /** Bekleme ('3 turns') ya da ''. */
  cooldown: string;
  numbers: GearSkillNumber[];
}

const effectDefs = () => ({ statuses: content.statuses, grounds: content.grounds });

/** Fark yazısı ve yönü (stat açıklamalarıyla aynı biçim: aynı birim ve hassasiyet, artış '+', azalış '-'); fark yoksa null. */
export function skillDiff(now: string, after: string): { text: string; dir: 'up' | 'down' } | null {
  const d = diffText(now, after);
  return d ? { text: d, dir: d.startsWith('+') ? 'up' : 'down' } : null;
}

/** İki sayı listesini (aynı skill, önce / sonra) birleştirir: yalnızca statla ölçeklenen ve değişen sayılarda after + diff. */
export function compareNumbers(now: SkillNumber[], after: SkillNumber[] | null): GearSkillNumber[] {
  return now.map((n, i) => {
    const a = after?.[i];
    if (!n.scaled || !a || a.label !== n.label) return { ...n };
    const d = skillDiff(n.text, a.text);
    return d ? { ...n, after: a.text, diff: d.text, dir: d.dir } : { ...n };
  });
}

/** Sınıfın skill'leri (veri sırası) ve pasifi. */
export function classSkills(classId: string): { skills: SkillDef[]; passive?: PassiveDef } {
  const def = content.classes[classId];
  if (!def) return { skills: [] };
  return { skills: def.skills.map((id) => content.skills[id]).filter((s): s is SkillDef => !!s), ...(def.passive ? { passive: def.passive } : {}) };
}

/** Bir skill'in Gear satırı (`after`: item takılırsa statlar; yoksa fark yok). */
export function skillRow(skill: SkillDef, stats: Stats, after: Stats | null = null): GearSkillRow {
  const f = content.formulas;
  const info = describeSkill(skill, stats, f, content.summons, effectDefs());
  const now = skillNumbers(skill, stats, f, effectDefs(), content.summons);
  return {
    id: skill.id,
    name: skill.name,
    passive: false,
    skill,
    cost: info.cost,
    cooldown: (skill.cooldown ?? 0) > 0 ? info.cooldown : '',
    numbers: compareNumbers(now, after ? skillNumbers(skill, after, f, effectDefs(), content.summons) : null),
  };
}

/** Pasifin Gear satırı. */
export function passiveRow(passive: PassiveDef, stats: Stats, after: Stats | null = null): GearSkillRow {
  const f = content.formulas;
  return {
    id: 'passive',
    name: passive.name,
    passive: true,
    passiveDef: passive,
    cost: '',
    cooldown: '',
    numbers: compareNumbers(passiveNumbers(passive, stats, f), after ? passiveNumbers(passive, after, f) : null),
  };
}

/** Kahramanın tüm skill satırları: 4 skill + pasif (varsa, en sonda). */
export function gearSkillRows(classId: string, stats: Stats, after: Stats | null = null): GearSkillRow[] {
  const { skills, passive } = classSkills(classId);
  const rows = skills.map((s) => skillRow(s, stats, after));
  if (passive) rows.push(passiveRow(passive, stats, after));
  return rows;
}

/** Tooltip satırı: metin + renk ipucu (element / kalkan; savaş tooltip'iyle aynı `kinds`). */
export interface GearSkillTipRow {
  text: string;
  kind?: SkillInfo['kinds'][number];
}

/** Skill / pasif tooltip'i (savaştaki skill tooltip'iyle aynı satırlar); `after` verilirse değişen sayılar "24 → 30 (+6)". */
export interface GearSkillTip {
  title: string;
  /** Sağdaki etiket: hedef türü rozeti ya da 'Passive'. */
  badge: string;
  /** Bedel / bekleme / ilk bekleme (savaş tooltip'inin meta satırı). */
  meta: string[];
  rows: GearSkillTipRow[];
}

export function skillTip(skill: SkillDef, stats: Stats, after: Stats | null = null): GearSkillTip {
  const f = content.formulas;
  const now = describeSkill(skill, stats, f, content.summons, effectDefs());
  const next = after ? describeSkill(skill, after, f, content.summons, effectDefs()) : null;
  const rows = now.lines.map((l, i): GearSkillTipRow => ({ text: next ? mergeLine(l, next.lines[i] ?? l, true) : l, ...(now.kinds[i] ? { kind: now.kinds[i] } : {}) }));
  if (now.initialCooldown) rows.push({ text: now.initialCooldown });
  const meta = [now.cost, ...((skill.cooldown ?? 0) > 0 ? [`Cooldown ${now.cooldown}`] : []), ...(now.turnCost ? [now.turnCost] : [])];
  return { title: now.name, badge: now.targetBadge, meta, rows };
}

export function passiveTip(passive: PassiveDef, stats: Stats, after: Stats | null = null): GearSkillTip {
  const f = content.formulas;
  const now = describePassive(passive, stats, f);
  const text = after ? mergeLine(now, describePassive(passive, after, f), true) : now;
  return { title: passive.name, badge: 'Passive', meta: [], rows: [{ text }] };
}
