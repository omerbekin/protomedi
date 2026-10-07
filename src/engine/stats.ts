import type { Attribute, Attributes, CombatantData, CombatantDef, Formulas, Stats, SummonVariants } from './types';

/** Primary bonusu aktif mi: primary stat, dört statın en yükseğine eşit veya üstündeyse (eşitlik dahil). */
export function isPrimaryActive(attrs: Attributes, primary: Attribute | undefined): boolean {
  if (!primary) return false;
  return attrs[primary] >= Math.max(attrs.str, attrs.int, attrs.dex, attrs.luck);
}

/** Kaçınma (evasion): tam sayı adımlı (her dexPerEvasionStep Dex = +evasionPerStep), evasionMax üst sınırlı. */
export function evasionOf(dex: number, formulas: Formulas): number {
  const a = formulas.attributes;
  const steps = Math.floor(Math.max(0, dex) / a.dexPerEvasionStep);
  // Tam sayı yüzde adımı: kayan nokta artığı olmasın
  return Math.min(a.evasionMax, Math.round(steps * a.evasionPerStep * 10000) / 10000);
}

/** İsabet (accuracy): taban + Luck başına artış; negatife düşmez. */
export function accuracyOf(luck: number, formulas: Formulas, base?: number): number {
  const a = formulas.attributes;
  return Math.max(0, (base ?? a.accuracyBase) + a.accuracyPerLuck * luck);
}

/** Bir vuruşun isabet şansı (0-1): saldırganın accuracy'si - hedefin evasion'ı, [0, hit.max] arasında (alt sınır yok: %0 olabilir). */
export function hitChance(attacker: Pick<Stats, 'accuracy'>, defender: Pick<Stats, 'evasion'>, formulas: Formulas): number {
  return Math.min(formulas.hit.max, Math.max(0, attacker.accuracy - defender.evasion));
}

/**
 * Bir vuruşun üç sonucu, TEK zardan (r): r < hit şansı = 'hit'; hit şansı <= r < accuracy = 'dodge' (hedefin kaçınması yüzünden: accuracy yeterdi,
 * evasion düşürdü); r >= accuracy = 'miss' (saldıranın isabeti yetmedi). Olasılıklar: dodge = accuracy - hit şansı, miss = 1 - accuracy.
 */
export type HitOutcome = 'hit' | 'dodge' | 'miss';

export function hitOutcome(attacker: Pick<Stats, 'accuracy'>, defender: Pick<Stats, 'evasion'>, formulas: Formulas, roll: number): HitOutcome {
  const hit = hitChance(attacker, defender, formulas);
  if (roll < hit) return 'hit';
  const accuracy = Math.min(formulas.hit.max, Math.max(0, attacker.accuracy));
  return roll < accuracy ? 'dodge' : 'miss';
}

/** Temel özelliklerden türev stat'ları hesaplar (can, mana, hız, yenilenmeler, kritik, isabet, kaçınma, primary bonusu). */
export function deriveStats(data: CombatantData, formulas: Formulas): Stats {
  const a = formulas.attributes;
  const { str, int, dex, luck } = data.attributes;
  const active = isPrimaryActive(data.attributes, data.primary);
  const bonus = formulas.primaryBonus;
  const derived: Stats = {
    str,
    int,
    dex,
    luck,
    hp: Math.round(a.hpBase + a.hpPerStr * str),
    mp: Math.round(a.mpBase + a.mpPerInt * int),
    spd: Math.max(1, Math.round(a.spdBase + a.spdPerDex * dex)),
    mpRegen: Math.round(a.mpRegenPerInt * int),
    hpRegen: a.hpRegenPerStr * str,
    armor: data.armor,
    magicArmor: data.magicArmor,
    critChance: a.critChanceBase + a.critChancePerLuck * luck,
    critMult: a.critMult,
    accuracy: accuracyOf(luck, formulas, data.accuracyBase),
    evasion: evasionOf(dex, formulas),
    ...(data.primary ? { primary: data.primary } : {}),
    primaryActive: active,
    resilience: active && data.primary === 'str' ? bonus.str.resilienceChance : 0,
    hunterMark: active && data.primary === 'dex' ? bonus.dex.hunterMarkMult : 0,
    manaEcho: active && data.primary === 'int' ? bonus.int.manaEchoChance : 0,
    spellPowerMult: 1,
    surviveChance: active && data.primary === 'luck' ? bonus.luck.surviveChance : 0,
  };
  return { ...derived, ...(data.overrides ?? {}) };
}

/** Veriden çalışma zamanı tanımı üretir. */
export function buildDef(data: CombatantData, formulas: Formulas): CombatantDef {
  return {
    id: data.id,
    name: data.name,
    spriteId: data.spriteId,
    ...(data.spriteScale ? { spriteScale: data.spriteScale } : {}),
    color: data.color,
    logo: data.logo,
    frontPriority: data.frontPriority,
    ...(data.role ? { role: data.role } : {}),
    attributes: { ...data.attributes },
    ...(data.primary ? { primary: data.primary } : {}),
    ...(data.testOnly ? { testOnly: true } : {}),
    ...(data.hidden ? { hidden: true } : {}),
    stats: deriveStats(data, formulas),
    ...(data.resource === 'rage' ? { maxRage: formulas.rage.max } : {}),
    skills: [...data.skills],
    ...(data.tags ? { tags: [...data.tags] } : {}),
    ...(data.ai ? { ai: data.ai } : {}),
    ...(data.passive ? { passive: data.passive } : {}),
    ...(data.variants ? { variants: { fed: { ...data.variants.fed }, unfed: { ...data.variants.unfed } } } : {}),
  };
}

/** Çağrı varyantının stat çarpanı (varyant yoksa 1). */
export function variantMult(def: CombatantDef, variant: keyof SummonVariants | undefined): number {
  return variant ? (def.variants?.[variant].mult ?? 1) : 1;
}

/**
 * Çağrı varyantı uygulanmış tanım (saf): maks can (tam sayıya yuvarlanır), hasar statları str ve int (0,1'e yuvarlanır) ve Str'e bağlı düz can
 * yenilenmesi `mult` ile çarpılır; diğer her şey (zırh, hız, isabet, skill'ler, hasar azaltma) aynen kalır. mult 1 ise tanım aynen döner.
 * Motor (çağrı anı), skill açıklaması, wiki ve maç kaydı bu tek fonksiyonu kullanır.
 */
export function applySummonVariant(def: CombatantDef, variant: keyof SummonVariants | undefined): CombatantDef {
  const mult = variantMult(def, variant);
  if (mult === 1) return def;
  const r1 = (v: number) => Math.round(v * mult * 10) / 10;
  const stats: Stats = { ...def.stats, hp: Math.max(1, Math.round(def.stats.hp * mult)), str: r1(def.stats.str), int: r1(def.stats.int), hpRegen: def.stats.hpRegen * mult };
  return { ...def, attributes: { ...def.attributes, str: stats.str, int: stats.int }, stats };
}

/** Bir özelliğin skill gücü: değer x katsayı (hasar, şifa ve kalkan için). */
export const attributePower = (stats: Stats, scale: Attribute, formulas: Formulas): number => stats[scale] * formulas.scaling[scale] * (stats.spellPowerMult ?? 1);

/** Zırhın hasarı yüzdesel azaltma oranı (0-1): armor / (armor + k). Artan zırhta getiri azalır. */
export function armorReduction(armor: number, formulas: Formulas): number {
  return armor <= 0 ? 0 : armor / (armor + formulas.armor.k);
}
