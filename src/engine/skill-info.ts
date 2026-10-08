import { isShapeArea, RECT_CENTER_MIN, shapeBadge } from './area-shape';
import { isRatioCost, skillCostLabel } from './cost';
import { betMultipliers, betStake } from './gamble';
import { applySummonVariant, attributePower } from './stats';
import type { AreaDef, Attribute, CombatantDef, Element, Formulas, GlobalSkillDef, GroundDef, PassiveDef, SkillDef, SkillTarget, Stats, StatusDef } from './types';

/** Skill'in oyuncuya gösterilen genel bilgileri (tooltip). Metinler İngilizce (oyun içi arayüz). */
export interface SkillInfo {
  name: string;
  target: string;
  /** Kısa hedef türü rozeti: Self / AoE / Single Target / Column / Random / ... */
  targetBadge: string;
  cost: string;
  cooldown: string;
  /** Savaş başında bu skill bekleme sayacıyla başlıyorsa tek satır ('Opens on cooldown: 3 turns'), yoksa boş. Yalnızca turns modunda gösterilir. */
  initialCooldown: string;
  /** Turn bedeli 1'den küçükse kısa etiket ('Half turn'); tam turn skill'de boş. (Açıklama satırı da lines içinde.) */
  turnCost: string;
  /** Etki satırları: hasar ölçeği, şifa, kalkan, çağrı, menzil ve ek kurallar. */
  lines: string[];
  /** `lines` ile aynı sırada: satırın rengini belirleyen element ('shield' / 'magicShield' kalkan satırları). */
  kinds: Array<Element | 'shield' | 'magicShield' | undefined>;
}

export const TARGET_TEXT: Record<SkillTarget, string> = {
  single_enemy: 'One enemy',
  all_enemies: 'All enemies',
  area_enemies: 'Area',
  area_any: 'Area (either side)',
  single_ally: 'One ally',
  dead_ally: 'One fallen ally',
  all_allies: 'All allies',
  everyone: 'Everyone',
  random_enemies: 'Random enemies',
  self: 'Self',
  empty_tile: 'Empty cell',
};

/** Sağ üst rozet için kısa hedef türü (tooltip düzeni). */
export const TARGET_BADGE: Record<SkillTarget, string> = {
  single_enemy: 'Single Target',
  all_enemies: 'All Enemies',
  area_enemies: 'AoE',
  area_any: 'AoE (any side)',
  single_ally: 'Single Ally',
  dead_ally: 'Dead Ally',
  all_allies: 'All Allies',
  everyone: 'Everyone',
  random_enemies: 'Random',
  self: 'Self',
  empty_tile: 'Empty Cell',
};

/** Rozet metni: alan skill'inde şekil ("Row", "Column", "Block 2x3", "Cross"), rastgele skill'de hedef sayısı ("Random · 3") rozette yazar, açıklamada değil. */
export function targetBadge(skill: SkillDef): string {
  if ((skill.target === 'area_enemies' || skill.target === 'area_any') && isShapeArea(skill.area)) return shapeBadge(skill.area);
  if (skill.target === 'random_enemies') return `${TARGET_BADGE.random_enemies} · ${skill.count ?? 3}`;
  return TARGET_BADGE[skill.target];
}

/** Şekil skill'inin sade açıklaması (hedef satırı). */
function shapeText(area: AreaDef): string {
  switch (area.shape) {
    case 'row':
      return 'Hits the whole row of the target';
    case 'column':
      return 'Hits the whole column';
    case 'plus':
      return 'Hits a cross: the target and the 4 cells next to it';
    case 'x':
      return `Hits an X: the target cell and the 4 diagonal cells around it${(area.hitsAtCenter ?? 1) > 1 ? `; the center is struck ${area.hitsAtCenter} times` : ''}`;
    default: {
      // Rect anchor kuralı (area-shape.ts > rectAxisStart): boyutu 3+ olan eksende fare hücresi ortada, diğerlerinde sol-alt köşe
      const h = area.rows ?? 1; // ekranda yatay (sıra sayısı)
      const v = area.cols ?? 1; // ekranda dikey (şerit sayısı)
      const size = `Hits a ${h}x${v} block`;
      if (h < RECT_CENTER_MIN && v < RECT_CENTER_MIN) return `${size}; your cursor cell is its bottom-left corner`;
      const across = h >= RECT_CENTER_MIN ? 'centered left to right on your cursor cell' : 'starting at your cursor cell on the left';
      const up = v >= RECT_CENTER_MIN ? 'centered top to bottom' : 'with your cursor cell at the bottom';
      return `${size}, ${across} and ${up} (near an edge it starts at your cell or slides inside)`;
    }
  }
}

/** Aşamalı vuruşun sade açıklaması (etki satırı): 'Sweeps row by row, front row first'. Aşamasızsa boş. */
export function stageText(area: AreaDef | undefined): string {
  if (!area?.stages) return '';
  switch (area.stages) {
    case 'row':
      return `Sweeps row by row, ${area.reverse ? 'back row first' : 'front row first'}`;
    case 'column':
      return `Sweeps lane by lane, ${area.reverse ? 'bottom lane first' : 'top lane first'}`;
    case 'distance':
      return area.reverse ? 'Closes in wave by wave, outer cells first, the anchor cell last' : 'Spreads wave by wave from the anchor cell outward';
  }
}

export const ATTRIBUTE_NAME: Record<Attribute, string> = { str: 'STR', int: 'INT', dex: 'DEX', luck: 'LUCK' };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Buff/debuff ve yer etkisi adlarını metinlere çevirmek için tanımlar (data/statuses.json, data/grounds.json). */
export interface EffectDefs {
  statuses?: Record<string, StatusDef>;
  grounds?: Record<string, GroundDef>;
}

/** Pasifin oyuncuya gösterilen açıklaması; değerler sahibinin stat'larından hesaplanır. */
export function describePassive(passive: PassiveDef, stats: Stats, formulas: Formulas): string {
  const e = passive.effect;
  const val = (scale: Attribute, power: number) => Math.round(attributePower(stats, scale, formulas) * power);
  switch (e.type) {
    case 'rage':
      return `The lower your HP, the harder you hit: up to +${pct(e.maxBonus)} damage at the brink of death.`;
    case 'divineLight':
      return `At the start of your turn, heal the most wounded ally for ${val(e.scale, e.power)} (${pct(e.power)} of ${ATTRIBUTE_NAME[e.scale]}).`;
    case 'spellEcho':
      return `Damaging spells with a cooldown have a ${pct(e.chance)} chance to be ready again immediately.`;
    case 'longshot':
      return `Deal +${pct(e.perRow)} damage for every row of distance between you and your target (your row + their row).`;
    case 'verdantBlessing':
      return `Whenever you summon, all wounded allies are healed for ${val(e.scale, e.power)} (${pct(e.power)} of ${ATTRIBUTE_NAME[e.scale]}).`;
    case 'soulDrain':
      return `Heal for ${pct(e.ratio)} of all damage you deal (damage dealt by your summons counts too).`;
    case 'manaOverflow':
      return `Magic damage blocked by your magic armor builds up; every ${e.threshold} blocked, your whole team gains ${e.mana} MP.`;
    case 'armorAura':
      return `You and the allies right next to you (front, back, left, right) gain bonus armor equal to ${pct(e.pct)} of your own armor (+${Math.round(stats.armor * e.pct)} now). A unit benefits from at most ${e.maxStacks} such auras.`;
    case 'bonusVsStatus': {
      const names = e.statuses.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? '');
      return `Deal +${pct(e.bonus)} damage to targets suffering from ${list} (every hit, crits included).`;
    }
    case 'omenTransfer':
      return `When an enemy carrying your Omens dies, its Omens pass to the nearest enemy (at most ${e.maxOnArrival} arrive; if Doom killed it, ${e.onDoomKill} passes; a kill by a skill that detonates Omens passes none). Passed Omens keep the time they had left and never trigger Doom. Works only while you live.`;
  }
}

/** Global skill'in (Rest / Skip Turn / Move) oyuncuya gösterilen bilgisi; sayılar data/global-skills.json'dan. Metinler İngilizce. */
export interface GlobalSkillInfo {
  id: string;
  name: string;
  icon: string;
  /** Hedef türü metni ve rozeti ('Self' / 'Empty cell'). */
  target: string;
  targetBadge: string;
  /** Hep bedelsiz: 'Free'. */
  cost: string;
  /** Kısa özet (data'daki text). */
  summary: string;
  lines: string[];
  /** Yalnızca turns modunda kullanılabilir mi (Skip Turn). */
  turnsOnly: boolean;
}

export function describeGlobalSkill(def: GlobalSkillDef, _formulas?: Formulas): GlobalSkillInfo {
  const lines: string[] = [];
  if (def.kind === 'rest') {
    lines.push(`Restores ${def.mp ?? 0} MP (never above your maximum)`, 'Ends your turn');
  } else if (def.kind === 'skip') {
    const bonus = def.speedBonus ?? 1;
    lines.push(
      `Pass the turn: +${pct(bonus)} speed until your next turn${bonus === 1 ? ' (the speed meter fills twice as fast)' : ''}`,
      'Enemies can still act in between',
      'Cooldowns, regeneration and effects tick as usual',
      `At most ${def.maxConsecutive ?? 1} in a row`,
      'Turn mode only',
    );
  } else {
    lines.push(
      'Move to an empty cell of your own side (a cell with no living unit) and end your turn',
      'Your row decides who can hit you in melee and whether you can use melee skills',
      'Auras, side neighbors and taunt/guard follow your new cell',
    );
  }
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    target: TARGET_TEXT[def.target === 'empty_tile' ? 'empty_tile' : 'self'],
    targetBadge: TARGET_BADGE[def.target === 'empty_tile' ? 'empty_tile' : 'self'],
    cost: 'Free',
    summary: def.text,
    lines,
    turnsOnly: !!def.turnsOnly,
  };
}

/** Rage kaynağının açıklaması (class kartı, tooltip ve wiki): kazanç formülü ve üst sınır formulas.json > rage'den. */
export function describeRage(f: Formulas): string[] {
  const r = f.rage;
  const n = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
  return [
    `Rage: a bar from 0 to ${r.max}; you start every battle with 0`,
    `Every damaging hit that lands with a skill gives ${n(r.hitBase)} Rage plus ${n(r.perHpPercent)} per 1% of the target's max HP it takes (at most ${n(r.perHitCap)} per hit)`,
    `A skill that hits several targets gives the Rage of the best single target, never more than ${n(r.perCastCap)} per cast`,
    'Rage never fades and is not gained from damage you take; skills that cost Rage need enough of it',
  ];
}

export function describeSkill(skill: SkillDef, stats: Stats, formulas: Formulas, units: Record<string, CombatantDef> = {}, defs: EffectDefs = {}): SkillInfo {
  const lines: string[] = [];
  const kinds: SkillInfo['kinds'] = [];
  const add = (text: string, kind?: SkillInfo['kinds'][number]) => {
    lines.push(text);
    kinds.push(kind);
  };
  // Aynı etki art arda tekrar ediyorsa (Double Strike: iki vuruş) tek satır + 'x2'
  const effects: Array<{ e: SkillDef['effects'][number]; times: number }> = [];
  for (const e of skill.effects) {
    const last = effects[effects.length - 1];
    if (last && JSON.stringify(last.e) === JSON.stringify(e) && e.type === 'damage') last.times++;
    else effects.push({ e, times: 1 });
  }
  for (const { e, times } of effects) {
    const who = skill.target === 'area_any' ? (e.side === 'allies' ? ' (on your side: allies)' : e.side === 'enemies' ? ' (on the enemy side: enemies)' : '') : skill.target === 'everyone' ? ((e.side ?? (e.type === 'heal' || e.type === 'hot' || e.type === 'shield' || e.type === 'guard' ? 'allies' : 'enemies')) === 'allies' ? ' (allies)' : ' (enemies)') : '';
    const raw = (scale: Attribute, power: number) => Math.round(attributePower(stats, scale, formulas) * power);
    if (e.type === 'damage') {
      const element = e.element ?? 'physical';
      add(`Damage ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${times > 1 ? ` x${times}` : ''}${who}`, element);
      if (e.ignoreDefense) add(`Ignores ${pct(e.ignoreDefense)} of armor`);
      if (e.lifesteal) add(`Heals you for ${pct(e.lifesteal)} of damage dealt`);
      if (e.bonusVsTag) add(`x${e.bonusVsTag.multiplier} vs ${e.bonusVsTag.tag}`);
      if (e.falloff) add(`Each target hit takes ${pct(1 - e.falloff)} less damage than the previous one`);
      if (e.bonusPerMissingMana) add(`+${e.bonusPerMissingMana} per missing mana of the target`, element);
      if (e.repeatChance) add(`${pct(e.repeatChance)} chance to hit twice`, element);
      if (e.critBonus && !e.guaranteedCrit) add(`+${pct(e.critBonus)} crit chance`, element);
      if (e.bet) {
        const b = e.bet;
        const stake = betStake(b, stats.hp, stats.hp, Math.max(0, stats.mp - (skill.cost.resource === 'mp' ? skill.cost.amount : 0)));
        const m = betMultipliers(b, stake);
        const what = b.resource === 'hp' ? `${pct(b.ratio)} of your max HP (${stake})` : b.ratio >= 1 ? 'all your remaining MP' : `${pct(b.ratio)} of your remaining MP`;
        const win = b.perStake ? `x${(b.winMult).toFixed(1).replace(/.0$/, '')} damage, +${b.perStake} per ${b.resource.toUpperCase()} bet` : `x${m.win.toFixed(1).replace(/.0$/, '')} damage`;
        const lose = m.lose <= 0 ? 'you miss' : `x${m.lose.toFixed(1).replace(/.0$/, '')} damage`;
        add(`Bet ${what}: ${pct(b.winChance)} chance for ${win}; otherwise ${lose} and you lose the bet`, element);
      }
      if (e.bonusFromShield) add(`+${pct(e.bonusFromShield.ratio)} of your shield${e.bonusFromShield.consume ? ' (consumed)' : ''}`, element);
    } else if (e.type === 'heal') {
      add(`Heal ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${who}`);
    } else if (e.type === 'revive') {
      add(`Choose a fallen ally, then choose an empty cell on your side: it rises there with ${pct(e.hpRatio)} HP and ${pct(e.mpRatio)} MP (even if something now stands on its corpse)`);
      add('Needs at least one empty cell on your side; the revived ally starts with an empty turn bar');
      if (e.regen && e.regen.turns > 0 && e.regen.ratio > 0) add(`Then regenerates ${pct(e.regen.ratio)} of its max HP at the start of each of its next ${e.regen.turns} turns`);
    } else if (e.type === 'hot') {
      add(`Heal ${raw(e.scale, e.power)} per turn for ${e.turns} turns`);
    } else if (e.type === 'shield') {
      const magic = e.shieldType === 'magic';
      add(`${magic ? 'Magic shield' : 'Shield'} ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)})${e.self ? ' on you' : ''}`, magic ? 'magicShield' : 'shield');
      if (e.bonusPerMana) add(`+${e.bonusPerMana} per MP left after casting`, magic ? 'magicShield' : 'shield');
      const hook = e.onAbsorb;
      if (hook?.burnMana) add(`Every hit the shield absorbs burns ${hook.burnMana} MP from the attacker`, magic ? 'magicShield' : 'shield');
      if (hook?.dispelChance) add(`Every hit the shield absorbs has a ${pct(hook.dispelChance)} chance to remove a random buff from the attacker`, magic ? 'magicShield' : 'shield');
      if (hook?.giveMana) add(`Every hit the shield absorbs gives the shielded unit ${hook.giveMana} MP`, magic ? 'magicShield' : 'shield');
      if (hook?.burnMana || hook?.dispelChance) add('Only direct attacks trigger it (not ground effects)');
    } else if (e.type === 'summon') {
      const unit = units[e.unit];
      const life = e.lifespan ? ` for ${e.lifespan} turns` : '';
      if (e.consumeCorpse && unit) {
        // Ceset tüketen çağrı (Raise Dead): iki hâlin can ve hasar statı veriden (applySummonVariant)
        const fed = applySummonVariant(unit, 'fed');
        const unfed = applySummonVariant(unit, 'unfed');
        const statOf = (d: CombatantDef) => (d.stats.int > d.stats.str ? `INT ${d.stats.int}` : `STR ${d.stats.str}`);
        const boost = unfed.stats.hp > 0 ? Math.round(((fed.stats.hp / unfed.stats.hp - 1) * 100) / 5) * 5 : 0;
        add(`Choose a fallen foe to consume, then choose where the ${unit.name} rises (on your side${life}). The consumed corpse can no longer be revived and the ${unit.name} is empowered (+${boost}%). With no fallen foe, you only choose the cell.`);
        add(`Empowered: HP ${fed.stats.hp}, ${statOf(fed)} · Without a corpse: HP ${unfed.stats.hp}, ${statOf(unfed)}`);
      } else {
        add(unit ? `Summons ${unit.name} (HP ${unit.stats.hp})${life}` : `Summons ${e.unit}${life}`);
      }
      add(`Summons take x${formulas.summon.damageTakenMultiplier} damage`);
    } else if (e.type === 'manaBurn') {
      // Madde 260: sabit miktar ya da hedefin maks MP'sinin yüzdesi (pctMax)
      const what = e.pctMax !== undefined ? `${pct(e.pctMax)} of each target's max MP` : `${e.amount ?? 0} MP`;
      add(e.gainRatio ? `Steals ${what}: you gain ${pct(e.gainRatio)} of it` : `Burns ${what}`);
      const em = e.onEmpty;
      if (em) {
        const def = defs.statuses?.[em.status];
        const el = em.damage.element ?? 'physical';
        if (def?.cc && formulas.ccImmunity?.tiers.includes('boss')) add(`Bosses are immune to ${def.name} (crowd control); they still take the damage`);
        add(`Each target left with 0 MP (or already at 0) has a ${pct(em.chance)} chance (rolled separately) to be ${def?.name ?? em.status} for ${em.turns} turn${em.turns > 1 ? 's' : ''}${def ? ` (${def.text})` : ''} and take ${pct(em.damage.power)} ${ATTRIBUTE_NAME[em.damage.scale]} (${raw(em.damage.scale, em.damage.power)}) ${el} damage; it cannot miss but can crit`, el);
      }
    } else if (e.type === 'taunt') {
      add(`Taunt ${e.turns} turns: enemies must target you${e.breakRatio ? ` (ends after losing ${pct(e.breakRatio)} HP)` : ''}`);
      const cc = Object.values(defs.statuses ?? {}).filter((d) => d.breaksTaunt).map((d) => d.name);
      if (cc.length > 0) add(`Ends at once if you get ${cc.join(' or ')}`);
      if (e.allyDamageMult !== undefined) add(`Your allies take ${pct(1 - e.allyDamageMult)} less damage while it lasts`);
    } else if (e.type === 'status') {
      const def = defs.statuses?.[e.status];
      const how = e.cause === 'vines' ? ' (rooted by vines)' : '';
      if (def?.attackCharges) {
        // Yüklü durum (Abyssal Fury, madde 262): tur değil saldırı sayar; menzil ve bonus stat veriden
        const parts: string[] = [];
        if (def.reachBonus) parts.push(`melee reach +${def.reachBonus} row${def.reachBonus > 1 ? 's' : ''} (can hit one row deeper and strike from one row further back)`);
        for (const [k, v] of Object.entries(def.attackAttrPct ?? {}) as Array<[Attribute, number]>) if (v) parts.push(`+${pct(v)} ${ATTRIBUTE_NAME[k]} (+${Math.round(stats[k] * v)}) for damage only`);
        add(`${e.self ? 'You gain' : 'Applies'} ${def.name} for your next ${def.attackCharges} attacks: ${parts.join(', ')}`, undefined);
        add('Each damaging skill you use spends 1 charge (a multi-hit or area skill counts as one attack)');
        continue;
      }
      if (e.chance !== undefined && e.chance < 1) add(`${pct(e.chance)} chance per target hit (rolled separately) to apply ${def?.name ?? e.status} for ${e.turns} turn${e.turns > 1 ? 's' : ''}${how}${def ? `: ${def.text}` : ''}`, undefined);
      else add(`${e.self ? 'You gain' : 'Applies'} ${def?.name ?? e.status}${skill.target === 'area_any' ? who : ''} for ${e.turns} turn${e.turns > 1 ? 's' : ''}${how}${def ? `: ${def.text}` : ''}`, undefined);
      if (def?.cc && !e.self && formulas.ccImmunity?.tiers.includes('boss')) add(`Bosses are immune to ${def.name} (crowd control)`);
    } else if (e.type === 'randomStatus') {
      const total = e.options.reduce((a, o) => a + o.weight, 0);
      add(`Random effect on each target hit: ${e.options.map((o) => `${defs.statuses?.[o.status]?.name ?? o.status} ${o.turns} turn${o.turns > 1 ? 's' : ''} (${pct(o.weight / total)})`).join(', ')}`);
      const ccNames = e.options.map((o) => defs.statuses?.[o.status]).filter((d) => d?.cc).map((d) => d!.name);
      if (ccNames.length > 0 && formulas.ccImmunity?.tiers.includes('boss')) add(`Bosses are immune to ${ccNames.join(' and ')} (crowd control)`);
    } else if (e.type === 'ground') {
      const g = defs.grounds?.[e.ground];
      add(`Leaves ${g?.name ?? e.ground} on the area for ${e.turns} turns: ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)}) damage at the start of each enemy turn there`, g?.element);
    } else if (e.type === 'selfDamage') {
      add(`Costs you ${pct(e.ratio)} of your max HP`);
    } else if (e.type === 'guard') {
      add(`Guard ${e.turns} turns: take ${pct(e.share)} of the damage ally takes`);
      if (skill.excludeSelf) add('Cannot target yourself');
    } else if (e.type === 'dispel') {
      const names = Object.values(defs.statuses ?? {}).filter((d) => d.type === e.status && d.dispellable !== false).map((d) => d.name);
      const what = e.status === 'debuff' ? 'debuff' : 'buff';
      add(`${e.count ? `Removes the ${e.count} longest-lasting ${what}${e.count > 1 ? 's' : ''}` : `Removes every ${what}`} from the target${names.length ? ` (${names.join(', ')})` : ''}`);
    } else if (e.type === 'omen') {
      const kind = e.status ?? 'omen';
      const def = defs.statuses?.[kind];
      const name = def?.name ?? 'Bad Omen';
      const doom = def?.doom;
      const crit = e.critStacks !== undefined && e.critStacks !== e.stacks ? ` (${e.critStacks} on a critical hit)` : '';
      const detonates = skill.effects.some((x) => x.type === 'detonate' && x.status === kind);
      add(`Adds ${e.stacks} ${name}${crit} to every enemy hit`, 'dark');
      if (doom && def?.maxStacks && !detonates) add(`At ${def.maxStacks} Omens, Doom strikes at once: ${pct(doom.powerPerStack)} ${ATTRIBUTE_NAME[doom.scale]} (${raw(doom.scale, doom.powerPerStack)}) ${doom.element} damage per Omen; it cannot miss but can crit`, doom.element);
      if (doom && def?.maxStacks && !detonates && e.critDoomOnCrit) add(`A critical ${skill.name} that completes ${def.maxStacks} Omens makes the Doom a critical hit`, doom.element);
      if (def?.burstOnExpire && def.duration && !detonates) add(def.refreshOnStack ? `Each new Omen resets the ${def.duration}-turn timer; when it runs out, the Omens burst into Doom` : `After ${def.duration} turns the Omens burst into Doom (new Omens do not extend the timer)`);
    } else if (e.type === 'detonate') {
      const def = defs.statuses?.[e.status];
      const doom = def?.doom;
      if (doom) add(`Then Doom strikes at once with every Omen on the target, x${e.mult}: ${pct(doom.powerPerStack * e.mult)} ${ATTRIBUTE_NAME[doom.scale]} (${raw(doom.scale, doom.powerPerStack * e.mult)}) ${doom.element} damage per Omen; it cannot miss but can crit`, doom.element);
      else add(`Detonates ${e.status} x${e.mult}`);
      add('On a miss nothing happens: the Omens stay');
      if (e.noTransferOnKill) add('Every Omen on the target is spent; if this kills it, nothing passes on (Ill Omen does not trigger)');
    } else if (e.type === 'dot') {
      const def = defs.statuses?.[e.status];
      add(`${def?.name ?? e.status} for ${e.turns} turns: ${pct(e.power)} ${ATTRIBUTE_NAME[e.scale]} (${raw(e.scale, e.power)}) ${def?.dot?.element ?? ''} damage at the start of each of its turns (cannot miss or crit; recasting renews it)`.replace('  ', ' '), def?.dot?.element);
    } else if (e.type === 'bond') {
      const name = defs.statuses?.dark_bond?.name ?? 'Dark Bond';
      add(`${name} for ${e.turns} of your turns: whenever you heal from life steal, the bonded ally heals ${e.ratio === 1 ? 'the same amount' : `${pct(e.ratio)} of it`} (you still heal fully; at full HP you steal nothing, so nothing is shared)`);
      add('One bond at a time: a new bond breaks the old one; it ends if either of you falls');
      if (skill.excludeSelf) add('Cannot target yourself');
    }
  }
  // Boss skill kuralları (The Bridge Warden): çekme, telgraf (gecikmeli saldırı), faz ve yardımcı şartları
  if (skill.effects.some((e) => e.type === 'pull')) add('Drags the target to the front-most empty cell of its own lane');
  const tg = skill.telegraph;
  if (tg) {
    if (tg.kind === 'brand') add(`Delayed: brands the target now; at the start of your next turn the brand bursts on the branded unit and everyone right next to it (${tg.area?.shape === 'plus' ? 'a cross around it' : 'around it'}). Dispel or death removes it`);
    else if (tg.wholeBoard) add(`Delayed: cracks the whole enemy board except ${tg.keystones?.perLane ?? 1} Keystone cell per lane; it collapses at the start of your next turn`);
    else add('Delayed: marks the cells now; they collapse at the start of your next turn');
    add('Every enemy gets at least one turn before it lands; it cannot miss. One area warning and one brand at a time, at most one new warning per turn');
  }
  for (const [ph, area] of Object.entries(skill.areaByPhase ?? {})) add(`From phase ${ph}: ${shapeText(area).replace(/^Hits/, 'hits').replace(/; your cursor cell.*$/, '')}`);
  if (skill.minPhase && skill.minPhase > 1) add(`Only from phase ${skill.minPhase}`);
  if (skill.requiresAlly) add(`Needs a standing ${units[skill.requiresAlly]?.name ?? skill.requiresAlly}`);
  const turnCost = skill.turnCost !== undefined && skill.turnCost > 0 && skill.turnCost < 1 ? skill.turnCost : 1;
  if (turnCost < 1) add(turnCost === 0.5 ? 'Takes half a turn: your next turn comes in half the usual time' : `Takes ${pct(turnCost)} of a turn: your next turn comes sooner`);
  const waves = skill.target === 'area_enemies' || skill.target === 'area_any' ? stageText(skill.area) : '';
  if (waves) add(waves);
  if (skill.splash && skill.target === 'single_enemy') add(`Also hits the units beside the target (the neighbors above and below it on screen) for ${pct(skill.splash.mult ?? 1)} damage`, 'physical');
  if ((skill.target === 'area_enemies' || skill.target === 'area_any') && (skill.area?.hitsAtCenter ?? 1) > 1 && skill.area?.shape !== 'x') add(`The unit on the anchor cell is hit ${skill.area!.hitsAtCenter} times (each hit rolls on its own)`);
  if (skill.area?.shape === 'x' && (skill.area.hitsAtCenter ?? 1) > 1) add(`The blade crosses the center twice: the unit on the anchor cell is hit ${skill.area.hitsAtCenter} times, each hit rolls on its own`);
  if (skill.target === 'area_any') add('Throw it on the enemy side or on your own side: only the units on that side of the cloud are affected');
  if (skill.effects.some((e) => e.type === 'damage' && e.guaranteedCrit)) add(`Always a critical hit (x${formulas.attributes.critMult}); it can still miss`, 'physical');
  if (skill.requiresOpenBehind) add('Only targets with an empty cell right behind them (a living unit there blocks it; a corpse does not); never a unit in the back row');
  if (skill.motion === 'melee' && skill.target !== 'self') add(skill.requiresOpenBehind ? 'Slips behind any enemy, strikes, and returns' : skill.ignoreReach ? 'Charges at any enemy' : skill.reach ? `Melee: front ${skill.reach + 1} rows only (reach +${skill.reach})` : 'Melee: front row only');
  if (skill.advanceToFront) add('If you are not in the front row, you then step into the front row: the front cell of your own lane, or the nearest empty front cell if that one is taken (you stay put if the front row is full)');
  // Oranlı bedel (Wail of the Dead: mevcut canın %20'si): açıklama satırı; başlık skillCostLabel
  if (isRatioCost(skill.cost)) add(`Costs ${pct(skill.cost.ofCurrent!)} of current ${skill.cost.resource.toUpperCase()} (rounded, at least 1)${skill.cost.resource === 'hp' ? ': it can never bring you below 1 HP' : ''}`);
  const initialTurns = Math.min(formulas.cooldown?.maxInitial ?? 0, Math.floor(skill.initialCooldown ?? 0));
  return {
    name: skill.name,
    target: (skill.target === 'area_enemies' || skill.target === 'area_any') && isShapeArea(skill.area) ? shapeText(skill.area) : skill.target === 'random_enemies' ? `${skill.count ?? 3} random enemies` : TARGET_TEXT[skill.target],
    targetBadge: targetBadge(skill),
    cost: skillCostLabel(skill.cost),
    cooldown: (skill.cooldown ?? 0) > 0 ? `${skill.cooldown} turns` : 'None',
    initialCooldown: initialTurns > 0 ? `Opens on cooldown: ${initialTurns} turn${initialTurns > 1 ? 's' : ''}` : '',
    turnCost: turnCost < 1 ? (turnCost === 0.5 ? 'Half turn' : `${pct(turnCost)} turn`) : '',
    lines,
    kinds,
  };
}
