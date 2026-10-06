/**
 * WIKI kataloğu (oyun içi sağ üst kitap simgesi): class'lar, çağrılar, skill'ler, stat/mekanik metinleri, durumlar, zeminler ve
 * elementler. Saf TypeScript: Phaser'a ve DOM'a bağımlı DEĞİL (testlenebilir). Her şey veriden / motordan türetilir
 * (data/*.json, formulas.json, skill-info.ts, stat-info.ts); sayılar elle yazılmaz. Yeni class/skill/durum/zemin eklenince wiki kendiliğinden güncellenir.
 * Elle yazılan tek şey, mekanik açıklamalarının CÜMLELERİdir (şablon): yeni mekanik/özel kural/pasif eklenince
 * Mechanics bölümündeki ilgili metin güncel mi kontrol edilmelidir (CLAUDE.md kuralı).
 */
import layout from '../../data/battle-layout.json';
import { content, describeGlobalSkill, describePassive, describeRage, describeSkill, describeStat, TARGET_TEXT } from '../engine';
import { TARGET_BADGE } from '../engine/skill-info';
import type { Attribute, CombatantDef, Element, Formulas, SkillDef, StatKind, Stats } from '../engine';
import { primaryBonusInfo, primaryBonusLines } from '../engine/stat-info';
import { buildGrounds, buildStatuses, skillOwner, searchText, avatarMap, groupByDir } from '../gallery/catalog';
import type { GroundEntry, Owner, StatusEntry } from '../gallery/catalog';
import { STAT_COLOR, STAT_ICON, STAT_LABEL } from '../ui/stat-icons';
import { shapeMiniGrid, skillMiniGrid } from '../ui/shape-diagram';
import type { MiniShape } from '../ui/shape-diagram';

const f: Formulas = content.formulas;
const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
const num = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

// ---------------------------------------------------------------- tipler

export type WikiBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

/** Sabit şablonlu ama sayıları veriden gelen metin makalesi (Getting Started, Mechanics, Elements). */
export interface WikiArticle {
  id: string;
  title: string;
  /** Alt başlık grubu (Mechanics bölümünde). */
  group: string;
  icon: string;
  accent: string;
  blocks: WikiBlock[];
  /** Küçük şekil şemaları (Area shapes makalesi): etiket + mini ızgara. */
  shapes?: Array<{ label: string; shape: MiniShape }>;
  search: string;
}

export interface WikiSkill {
  id: string;
  name: string;
  icon: string;
  accent: string;
  owner: Owner;
  target: string;
  targetBadge: string;
  targetText: string;
  /** Skill'in vurduğu/etkilediği elementler (hasar ya da yer etkisi); hiçbiri yoksa boş. */
  elements: Element[];
  cost: string;
  cooldown: string;
  initialCooldown: string;
  lines: string[];
  kinds: Array<string | undefined>;
  /** AOE şekil skill'inde küçük şekil şeması (kapsanan hücreler + anchor); diğerlerinde yok. */
  shape?: MiniShape;
  search: string;
}

export interface WikiStatRow {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: string;
}

export interface WikiUnit {
  id: string;
  kind: 'class' | 'summon';
  /** Test class'ı (ör. Geometer): rastgele takımlara girmez; wiki 'TEST' etiketi gösterir. */
  testOnly: boolean;
  name: string;
  role: string;
  color: string;
  logo: string;
  spriteUrl: string | null;
  avatarUrl: string | null;
  melee: boolean;
  primary: Attribute | null;
  primaryBonus: { name: string; detail: string; text: string } | null;
  attributes: Array<{ key: Attribute; label: string; value: number; primary: boolean; icon: string; color: string }>;
  derived: WikiStatRow[];
  passive: { name: string; icon: string; text: string } | null;
  skills: WikiSkill[];
  search: string;
}

export interface WikiElement {
  id: string;
  name: string;
  color: string;
  /** Bu elementi kullanan skill adları. */
  skills: string[];
  /** "Undead takes x1.5 damage" gibi satırlar. */
  weakTo: Array<{ tag: string; mult: number; units: string[] }>;
  search: string;
}

export interface WikiStatus {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  icon: string;
  color: string;
  text: string;
  usedBy: string[];
  search: string;
}

export interface WikiGround extends Omit<GroundEntry, 'usedBy'> {
  usedBy: string[];
  text: string;
  search: string;
}

export interface WikiCatalog {
  gettingStarted: WikiArticle[];
  classes: WikiUnit[];
  summons: WikiUnit[];
  skills: WikiSkill[];
  mechanics: WikiArticle[];
  statuses: WikiStatus[];
  grounds: WikiGround[];
  elements: WikiElement[];
  elementTable: { head: string[]; rows: string[][] };
}

/** Wiki'nin kullandığı görsel dosyaları (id -> url); sayfada `import.meta.glob`, testte fs. */
export interface WikiFiles {
  sprites: Record<string, string>;
  avatars: Record<string, string>;
}

// ---------------------------------------------------------------- skill'ler

const allSkills = (): SkillDef[] => Object.entries(content.skills).map(([id, s]) => ({ ...s, id: s.id ?? id }));
const unitDefs = (): Record<string, CombatantDef> => ({ ...content.classes, ...content.summons });
const effectDefs = () => ({ statuses: content.statuses, grounds: content.grounds });

/** Skill'in sahibine ait stat (açıklamadaki "(123)" gibi hesaplanmış sayılar için); sahibi yoksa ilk class. */
function statsFor(skill: SkillDef): Stats {
  const owner = skillOwner(skill.id);
  const def = unitDefs()[owner.id] ?? Object.values(content.classes)[0]!;
  return def.stats;
}

export function skillElements(skill: SkillDef): Element[] {
  const out: Element[] = [];
  for (const e of skill.effects) {
    if (e.type === 'damage') out.push(e.element ?? 'physical');
    else if (e.type === 'ground') out.push(content.grounds[e.ground]?.element as Element);
    else if (e.type === 'thorns') out.push('physical');
  }
  if (skill.splash) out.push('physical');
  return [...new Set(out.filter(Boolean))];
}

export function buildSkill(skill: SkillDef): WikiSkill {
  const owner = skillOwner(skill.id);
  const def = unitDefs()[owner.id];
  const info = describeSkill(skill, statsFor(skill), f, unitDefs(), effectDefs());
  const elements = skillElements(skill);
  return {
    id: skill.id,
    name: skill.name,
    icon: skill.icon,
    accent: skill.fx || def?.color || '#e8c47e',
    owner,
    target: skill.target,
    targetBadge: info.targetBadge,
    targetText: info.target,
    elements,
    cost: info.cost,
    cooldown: info.cooldown,
    initialCooldown: info.initialCooldown,
    lines: info.lines,
    kinds: info.kinds,
    ...(skillMiniGrid(skill, f.formation) ? { shape: skillMiniGrid(skill, f.formation)! } : {}),
    search: searchText(skill.name, owner.name, info.targetBadge, info.target, info.cost, ...info.lines, ...elements, TARGET_BADGE[skill.target], TARGET_TEXT[skill.target]),
  };
}

export function buildSkills(): WikiSkill[] {
  return allSkills().map(buildSkill);
}

// ---------------------------------------------------------------- birimler (class + çağrı)

const ATTRS: Attribute[] = ['str', 'int', 'dex', 'luck'];

function buildUnit(kind: WikiUnit['kind'], def: CombatantDef, files: WikiFiles): WikiUnit {
  const st = def.stats;
  const sprite = groupByDir(files.sprites)[def.spriteId]?.find((s) => s.anim === 'idle')?.url ?? null;
  const avatar = avatarMap(files.avatars)[def.spriteId] ?? null;
  const row = (key: StatKind | 'mpRegen' | 'hpRegen', label: string, value: string): WikiStatRow => ({
    key,
    label,
    icon: key === 'mpRegen' ? STAT_ICON.mp : key === 'hpRegen' ? STAT_ICON.hp : STAT_ICON[key],
    color: key === 'mpRegen' ? STAT_COLOR.mp : key === 'hpRegen' ? STAT_COLOR.hp : STAT_COLOR[key],
    value,
  });
  const derived: WikiStatRow[] = [
    row('hp', 'HP', String(st.hp)),
    row('mp', 'MP', String(st.mp)),
    row('spd', 'SPD', String(st.spd)),
    row('evasion', 'Evasion', pct(st.evasion)),
    row('accuracy', 'Accuracy', pct(st.accuracy)),
    row('critChance', 'Crit', pct(st.critChance, 1)),
    row('armor', 'Armor', num(st.armor)),
    row('magicArmor', 'Magic armor', num(st.magicArmor)),
    row('hpRegen', 'HP regen / turn', String(Math.round(st.hpRegen))),
    row('mpRegen', 'MP regen / turn', String(st.mpRegen)),
  ];
  const primary = def.primary ?? null;
  const bonus = primary ? primaryBonusInfo(primary, f, !!st.primaryActive) : null;
  const passive = def.passive ? { name: def.passive.name, icon: def.passive.icon, text: describePassive(def.passive, st, f) } : null;
  const skills = def.skills.flatMap((id) => (content.skills[id] ? [buildSkill({ ...content.skills[id]!, id })] : []));
  const bonusText = primary ? primaryBonusLines(primary, f).join(' ') : '';
  return {
    id: def.id,
    kind,
    testOnly: !!def.testOnly,
    name: def.name,
    role: def.role ?? (kind === 'summon' ? 'Summon' : ''),
    color: def.color,
    logo: def.logo,
    spriteUrl: sprite,
    avatarUrl: avatar,
    melee: content.skills[def.skills[0] ?? '']?.motion === 'melee',
    primary,
    primaryBonus: primary && bonus ? { name: bonus.name, detail: bonus.detail, text: bonusText } : null,
    attributes: ATTRS.map((a) => ({ key: a, label: STAT_LABEL[a], value: def.attributes[a] ?? 0, primary: a === primary, icon: STAT_ICON[a], color: STAT_COLOR[a] })),
    derived,
    passive,
    skills,
    search: searchText(def.name, def.role, kind, bonus?.name, bonusText, passive?.name, passive?.text, ...skills.map((s) => `${s.name} ${s.search}`), ...(def.tags ?? [])),
  };
}

export function buildClasses(files: WikiFiles): WikiUnit[] {
  return Object.values(content.classes).map((d) => buildUnit('class', d, files));
}

export function buildSummons(files: WikiFiles): WikiUnit[] {
  return Object.values(content.summons).map((d) => buildUnit('summon', d, files));
}

// ---------------------------------------------------------------- makaleler

const GOLD = '#e8c47e';
const ELEMENT_COLOR = layout.colors.element as Record<string, string>;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function article(id: string, group: string, title: string, icon: string, blocks: WikiBlock[], accent = GOLD, shapes?: WikiArticle['shapes']): WikiArticle {
  const text = blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : [...b.head, ...b.rows.flat()]));
  return { id, group, title, icon, accent, blocks, ...(shapes?.length ? { shapes } : {}), search: searchText(title, group, ...text) };
}

/** Veride kullanılan her şekil için bir örnek şema (aynı rozetli skill'ler tek kez): etiket = rozet (Row, Column, Block 2x3, Cross). */
function shapeExamples(): NonNullable<WikiArticle['shapes']> {
  const seen = new Map<string, MiniShape>();
  for (const s of allSkills()) {
    const shape = shapeMiniGrid(s.area, f.formation);
    const badge = shape ? describeSkill(s, statsFor(s), f, unitDefs(), effectDefs()).targetBadge : '';
    if (shape && !seen.has(badge)) seen.set(badge, shape);
  }
  return [...seen].map(([label, shape]) => ({ label, shape }));
}
const p = (text: string): WikiBlock => ({ kind: 'p', text });
const list = (...items: string[]): WikiBlock => ({ kind: 'list', items });

const teamSize = (): number => content.battles[content.DEFAULT_BATTLE]?.random?.size ?? 5;

export function buildGettingStarted(): WikiArticle[] {
  const a = f.attributes;
  const rows = f.formation.rows;
  const lanes = f.formation.lanes;
  const pool = content.battles[content.DEFAULT_BATTLE]?.random?.pool.length ?? Object.keys(content.classes).length;
  return [
    article('goal', 'Basics', 'The goal', 'sword', [
      p(`Pick a team of ${teamSize()} different classes (${pool} classes to choose from) and fight an enemy team that is picked the same way. Teams do not have to be this size: a side can field anywhere from 1 to ${f.formation.rows * f.formation.lanes} units. Defeat every enemy unit to win; if your whole team falls, you lose.`),
      p('You control your own team; the enemy team is played by the computer. Pick a skill, then pick its target (hover a target to preview the expected result).'),
    ]),
    article('turns', 'Basics', 'Turn order and the SPD counter', 'hourglass', [
      p(`Every unit has a SPD (speed) stat: ${num(a.spdBase)} + ${num(a.spdPerDex)} per point of Dexterity. Each tick, every unit's action counter fills by its SPD; the first one to reach ${f.turn.threshold} acts, then its counter restarts.`),
      p(`Faster units therefore act more often, not just first. The bar at the top shows the next ${f.turn.queueLength} units in order, and it updates live when speed changes (for example Haste or Slow).`),
      p('A stunned unit skips its next turn. Status durations count down on the turns of the unit that carries them.'),
    ]),
    article('formation', 'Basics', 'Formation and rows', 'team', [
      p(`Each side stands on a ${rows} x ${lanes} grid: ${rows} rows deep and ${lanes} lanes wide (${rows * lanes} cells). A normal team of ${teamSize()} leaves cells empty; a side of ${rows * lanes} fills the whole grid. Empty cells matter: a unit can step onto one with the Move action (see Actions in the Mechanics section).`),
      p(`Melee skills can only reach the first ${f.formation.meleeRows === 1 ? 'occupied row' : `${f.formation.meleeRows} occupied rows`} of the enemy team, so the units in front shield the ones behind them. Ranged and magic skills reach anyone. Some melee skills say they charge or reach further; their description tells you.`),
      p('Melee classes are placed in front. A melee unit only stands in a back row once the rows before it are full, so fighters in front, archers and mages behind is the normal picture.'),
      p('Area skills hit a group of cells around the cell you pick, in a fixed shape (a whole row, a whole column, a block or a cross; see Area shapes in the Mechanics section). You can pick an empty cell too, as long as the shape still covers an enemy. Older area skills hit the chosen unit and its neighbours in a plus shape; column skills hit the whole lane of the chosen unit.'),
    ]),
    article('mana', 'Basics', 'MP and cooldowns', 'droplet', [
      p(`Skills cost MP. Every unit has ${a.mpBase} base MP (the same for all classes) plus ${a.mpPerInt} per point of Intelligence. At the start of its own turn, every unit regains MP equal to Intelligence x ${num(a.mpRegenPerInt)} (rounded; 0 Intelligence regains nothing) and HP equal to Strength x ${num(a.hpRegenPerStr)}. The Rest action restores extra MP on demand.`),
      p('Strong skills also have a cooldown: after you use one, you cannot use it again for that many of your own turns. The skill button shows the turns left.'),
      p(`Some powerful skills (usually the fourth one) start the battle on cooldown: they are not ready until the unit has taken up to ${f.cooldown.maxInitial} turns. The skill description says "Opens on cooldown" for these. Summoned units do not have this delay.`),
    ]),
    article('screen', 'Basics', 'Reading the screen', 'info', [
      list(
        'Hover a unit to see its stats; hover a skill to see its description and cost.',
        'Keys 1-4 pick the acting unit\'s skills.',
        'The settings button (gear) controls the volume; this wiki (book) pauses the battle while it is open.',
      ),
    ]),
  ];
}

/** stat-info.ts metnini "şu anki değer" kısımlarından arındırır (wiki genel kural anlatır, belirli bir birimi değil). */
export function stripNow(line: string): string {
  return line
    .replace(/\s*\(now [^)]*\)/g, '')
    .replace(/,\s*now [^)]*\)/g, ')')
    .replace(/\s*\((?:base [^)]*)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const statTitle = (title: string): string => title.replace(/\s[\d.]+%?$/, '');

/** Genel stat açıklaması: motorun stat-info metinleri, ilk class'ın statlarıyla üretilir ve sayı içeren "şimdi" kısımları atılır. */
function statArticle(kind: StatKind, group: string, only?: number[]): WikiArticle {
  const sample = Object.values(content.classes)[0]!.stats;
  const info = describeStat(kind, { ...sample, primary: undefined, primaryActive: false }, f);
  const lines = info.lines.filter((_, i) => !only || only.includes(i)).map(stripNow);
  return article(`stat-${kind}`, group, statTitle(info.title), STAT_ICON[kind], [list(...lines)], STAT_COLOR[kind]);
}

function bonusArticle(kind: Attribute): WikiArticle {
  const b = primaryBonusInfo(kind, f, true);
  const names: Record<Attribute, string> = { str: 'Strength', int: 'Intelligence', dex: 'Dexterity', luck: 'Luck' };
  const holders = Object.values(content.classes)
    .filter((c) => c.primary === kind)
    .map((c) => c.name);
  return article(`bonus-${kind}`, 'Primary bonuses', b.name, STAT_ICON[kind], [
    p(`Primary stat: ${names[kind]}. ${b.detail}.`),
    ...primaryBonusLines(kind, f).map(p),
    p(`The bonus only works while the primary stat is also the unit's highest stat (a tie counts).${holders.length ? ` Primary ${STAT_LABEL[kind]} classes: ${holders.join(', ')}.` : ''}`),
  ], STAT_COLOR[kind]);
}

function betLines(): Array<{ skill: WikiSkill; text: string }> {
  const out: Array<{ skill: WikiSkill; text: string }> = [];
  for (const s of allSkills()) {
    if (!s.effects.some((e) => e.type === 'damage' && e.bet)) continue;
    const ws = buildSkill(s);
    for (const line of ws.lines) if (line.startsWith('Bet ')) out.push({ skill: ws, text: `${ws.name}: ${line}` });
  }
  return out;
}

function skillsWith(pred: (e: SkillDef['effects'][number]) => boolean): string[] {
  return allSkills().filter((s) => s.effects.some(pred)).map((s) => s.name);
}

export function buildMechanics(): WikiArticle[] {
  const a = f.attributes;
  const k = f.armor.k;
  const out: WikiArticle[] = [];
  // Özellikler
  for (const kind of ['str', 'int', 'dex', 'luck'] as const) out.push(statArticle(kind, 'Attributes'));
  // Türetilmiş stat'lar
  out.push(statArticle('hp', 'Derived stats', [0]));
  out.push(statArticle('mp', 'Derived stats', [0]));
  out.push(statArticle('spd', 'Derived stats'));
  out.push(statArticle('critChance', 'Derived stats'));
  out.push(statArticle('accuracy', 'Derived stats'));
  out.push(statArticle('evasion', 'Derived stats'));
  out.push(statArticle('armor', 'Derived stats', [1]));
  out.push(statArticle('magicArmor', 'Derived stats', [1]));
  // Primary bonuslar
  for (const kind of ['str', 'dex', 'int', 'luck'] as const) out.push(bonusArticle(kind));
  // Hasar ve isabet
  const wk = Object.entries(f.weaknesses).flatMap(([tag, m]) => Object.entries(m).map(([el, mult]) => `${cap(tag)} units take x${num(mult)} ${el} damage.`));
  out.push(
    article('damage-formula', 'Damage', 'Damage formula', 'sword', [
      p('Damage = skill power x attribute x scaling, plus any extra the skill adds, then reduced by armor, then multiplied by weakness, then by the crit.'),
      list(
        `Power and attribute: every skill names the attribute it scales with (STR, INT, DEX or LUCK). A power of 120% with 20 INT is 24 base damage. Scaling per attribute: ${(['str', 'int', 'dex', 'luck'] as const).map((s) => `${STAT_LABEL[s]} x${num(f.scaling[s])}`).join(', ')}.`,
        `Variance: every hit rolls within plus or minus ${pct(f.damage.variance)}; damage is never below ${f.damage.minDamage}.`,
        `Armor: physical damage is reduced by Armor, every other element by Magic armor. Reduction = armor / (armor + ${k}), so ${k} armor blocks 50% and more armor gives less and less. Some skills ignore a share of armor (the description says so).`,
        `Weaknesses: ${wk.join(' ')} See the Elements section.`,
        `Crit: a crit multiplies the final damage by x${num(a.critMult)} (chance ${pct(a.critChanceBase)} + ${pct(a.critChancePerLuck, 1)} per Luck). The multiplier never changes; Luck only adds chance. Crits also apply to healing, never to shields.`,
        `Summoned units take x${num(f.summon.damageTakenMultiplier)} damage.`,
      ),
    ]),
    article('hit-chance', 'Damage', 'Accuracy, evasion and hit chance', 'blast', [
      p(`Every damaging hit (physical and magic) first rolls to hit: hit chance = attacker accuracy - target evasion, never above ${pct(f.hit.max)}. It can drop to 0%. One roll decides the outcome: a hit, a Dodge or a Miss.`),
      list(
        `Accuracy = ${pct(a.accuracyBase)} + ${pct(a.accuracyPerLuck, 1)} per Luck.`,
        `Evasion = ${pct(a.evasionPerStep)} for every ${a.dexPerEvasionStep} Dexterity, in whole steps only (maximum ${pct(a.evasionMax)}).`,
        'Dodge: the attacker\'s accuracy was good enough but the target\'s evasion made the hit fail. "Dodge" shows above the target.',
        'Miss: the attacker\'s own accuracy was not enough, no matter the evasion. "MISS" shows above the attacker.',
        'A dodged or missed hit deals no damage and applies none of the skill\'s effects.',
        'Heals, shields, buffs, effects on yourself and ground effects (poison, fire on the ground) never miss.',
      ),
    ]),
    article('ground', 'Damage', 'Ground effects', 'flame', [
      p('Some skills leave an effect on the ground of the target area (see Statuses & Grounds). Enemy units standing there take magic damage at the start of each of their own turns.'),
      p('The damage is fixed when the effect is created, cannot crit and cannot be dodged. The duration counts the caster\'s turns, and the effect ends if the caster falls.'),
    ], '#ff7a1a'),
  );
  // Özel mekanikler
  const bets = betLines();
  out.push(
    article('gamble', 'Special rules', 'Bets (Gambler)', 'dice', [
      p('A bet skill puts part of the caster\'s HP or MP at stake before the hit, then rolls a die. On a win the hit is multiplied (and may grow with the stake); on a loss the hit is weaker or misses, and the stake is lost. A won bet keeps the stake.'),
      list(...bets.map((b) => b.text)),
    ], '#b8892e'),
    article('rage', 'Special rules', 'Rage', 'rage', [
      p(`Some classes have a Rage bar next to their HP and MP: ${Object.values(content.classes).filter((c) => c.maxRage !== undefined).map((c) => c.name).join(', ') || 'none yet'}.`),
      list(...describeRage(f)),
      p(`Skills that cost Rage: ${allSkills().filter((s) => s.cost.resource === 'rage').map((s) => `${s.name} (${s.cost.amount})`).join(', ') || 'none yet'}.`),
    ], '#c0392b'),
    article('area-shapes', 'Special rules', 'Area shapes', 'blast', [
      p('Some skills hit a shape made of cells instead of one target. You pick an anchor cell (it may be empty); every living enemy standing inside the shape is hit. Row means the same depth (all lanes of one row); column means one lane across all rows.'),
      list(
        'Row: the whole row of the anchor cell.',
        'Column: the whole lane of the anchor cell, across every row.',
        'Block (for example 2x3): that many rows by that many lanes. The anchor cell is the bottom-left corner of the block as seen on screen, so the block extends to the right and upwards. If it would stick out of the grid it slides back inside (its size never shrinks), so every cell is a valid anchor. Your side and the enemy side are mirrored, so "left" is the front row on the enemy side and the back row on your side.',
        'Cross: the anchor cell and the 4 cells next to it (one row in front or behind, one lane above or below). Cells outside the grid are skipped.',
      ),
      p('Melee skills with a shape only hit enemies that melee can reach (the front rows); enemies in the shape but out of reach are not hit. A shape is valid only if it covers at least one enemy that can be hit. Shape skills ignore taunt. Test classes such as the Geometer carry one skill per shape; they never appear in random teams.'),
    ], '#c9a0ff', shapeExamples()),
    article('actions', 'Special rules', 'Actions: Rest, Skip Turn and Move', 'boot', [
      p('Besides its four skills, every unit can use three global actions. They cost nothing and each ends the turn.'),
      list(...Object.values(content.globalSkills).map((d) => {
        const info = describeGlobalSkill(d, f);
        return `${info.name}: ${[info.summary, ...info.lines].map((s) => s.replace(/\.$/, '')).join('. ')}.`;
      })),
      p('The enemy team uses these actions too: it rests when a strong skill is out of MP, waits when nothing useful can be done, and moves fragile units out of melee reach.'),
    ], '#9ec5e8'),
    article('echo', 'Special rules', 'Ready again immediately', 'echo', [
      p('Some passives let a damaging skill with a cooldown be ready again right after it is cast, with a set chance. Classes with such a passive: ' + Object.values(content.classes).filter((c) => c.passive?.effect.type === 'spellEcho').map((c) => `${c.name} (${c.passive!.name})`).join(', ') + '.'),
    ]),
    article('thorns', 'Special rules', 'Thorns and reflected damage', 'thornshield', [
      p('A thorns effect returns a fixed amount of damage to every melee attacker for a few turns. Armor applies, it never misses, and reflected damage is not reflected again.'),
      p(`Skills with thorns: ${skillsWith((e) => e.type === 'thorns').join(', ') || 'none yet'}.`),
    ]),
    article('summons', 'Special rules', 'Summons', 'treant', [
      p(`Summoned units fight on your side but are not part of the chosen team. They take x${num(f.summon.damageTakenMultiplier)} damage, may only exist for a number of turns, and fall as soon as their summoner falls.`),
      p(`Skills that summon: ${skillsWith((e) => e.type === 'summon').join(', ') || 'none yet'}. Damage dealt by a summon still counts for its owner's passives.`),
    ]),
    article('revive', 'Special rules', 'Resurrection', 'ankh', [
      p('A revive skill brings a fallen ally back on the cell where it fell, with a share of its max HP and MP. It cannot target living units.'),
      p(`Skills that revive: ${skillsWith((e) => e.type === 'revive').join(', ') || 'none yet'}.`),
    ]),
    article('shields', 'Special rules', 'Shields', 'shield', [
      p('A shield soaks damage before HP. A normal shield absorbs any damage; a magic shield only absorbs magic damage. Shield amounts are fixed (no variance, no crit).'),
      p(`Skills that shield: ${skillsWith((e) => e.type === 'shield').join(', ') || 'none yet'}.`),
    ]),
    article('control', 'Special rules', 'Taunt, guard and mana burn', 'guardian', [
      p(`Taunt forces enemies to target the taunting unit for some turns (it can end early if the unit loses enough HP, or at once if the unit is hit by a control status: ${Object.values(content.statuses).filter((d) => d.breaksTaunt).map((d) => d.name).join(', ') || 'none'}). Guard makes a protector take a share of the damage dealt to an ally. Mana burn removes MP from a target (and may give some of it to the caster) without hurting its HP.`),
      p(`Taunt: ${skillsWith((e) => e.type === 'taunt').join(', ') || 'none'}. Guard: ${skillsWith((e) => e.type === 'guard').join(', ') || 'none'}. Mana burn: ${skillsWith((e) => e.type === 'manaBurn').join(', ') || 'none'}.`),
    ]),
  );
  return out;
}

// ---------------------------------------------------------------- durumlar, zeminler, elementler

export function buildWikiStatuses(): WikiStatus[] {
  return buildStatuses().map((s: StatusEntry) => ({ id: s.id, name: s.name, type: s.type, icon: s.icon, color: s.color, text: s.text, usedBy: s.usedBy.map((u) => u.name), search: searchText(s.name, s.type, s.text, ...s.usedBy.map((u) => u.name)) }));
}

export function buildWikiGrounds(): WikiGround[] {
  return buildGrounds().map((g) => {
    const text = `Leaves ${g.name} on the area. Enemies standing there take ${g.element} (magic) damage at the start of each of their turns.`;
    return { ...g, usedBy: g.usedBy.map((u) => u.name), text, search: searchText(g.name, g.element, text, ...g.usedBy.map((u) => u.name)) };
  });
}

export function buildElements(): WikiElement[] {
  const users = new Map<string, string[]>();
  for (const s of allSkills()) for (const el of skillElements(s)) users.set(el, [...(users.get(el) ?? []), s.name]);
  return Object.keys(ELEMENT_COLOR).map((id) => {
    const weakTo = Object.entries(f.weaknesses).flatMap(([tag, m]) => {
      const mult = (m as Record<string, number>)[id];
      return mult === undefined ? [] : [{ tag, mult, units: Object.values(unitDefs()).filter((d) => d.tags?.includes(tag)).map((d) => d.name) }];
    });
    const skills = users.get(id) ?? [];
    return { id, name: cap(id), color: ELEMENT_COLOR[id]!, skills, weakTo, search: searchText(id, ...skills, ...weakTo.map((w) => w.tag)) };
  });
}

export function buildElementTable(): { head: string[]; rows: string[][] } {
  const tags = Object.keys(f.weaknesses);
  const els = Object.keys(ELEMENT_COLOR);
  return { head: ['Target type', ...els.map(cap)], rows: tags.map((t) => [cap(t), ...els.map((e) => `x${num((f.weaknesses[t] as Record<string, number> | undefined)?.[e] ?? 1)}`)]) };
}

// ---------------------------------------------------------------- hepsi

export function buildWiki(files: WikiFiles): WikiCatalog {
  return {
    gettingStarted: buildGettingStarted(),
    classes: buildClasses(files),
    summons: buildSummons(files),
    skills: buildSkills(),
    mechanics: buildMechanics(),
    statuses: buildWikiStatuses(),
    grounds: buildWikiGrounds(),
    elements: buildElements(),
    elementTable: buildElementTable(),
  };
}
