import type { Battle } from './battle';
import { damageRange, healRange } from './formulas';
import { damageSpecFor, type DamageEffect } from './spec';
import { attributePower } from './stats';
import type { Combatant } from './types';

/**
 * Bir skill'in bir hedefe tahmini etkisi. Kalkan önce emer; değerler ortalama ve [min, max] aralığıdır
 * (kritik hariç; `critMax` kritik vuruşta ulaşılabilecek en yüksek değerdir).
 * Saf ve belirleyicidir: savaşı değiştirmez, RNG kullanmaz (UI hover önizlemesi ve yapay zeka için).
 */
export interface TargetPreview {
  uid: string;
  damage?: {
    min: number;
    max: number;
    avg: number;
    /** Kalkanın emeceği ortalama miktar. */
    absorbed: number;
    /** Cana ulaşacak hasar (ortalama / en az / en çok), hedefin mevcut canıyla sınırlı. */
    hpLoss: number;
    hpLossMin: number;
    hpLossMax: number;
    /** sure: en düşük hasar bile öldürür; maybe: yalnızca yüksek zarda öldürür; null: öldürmez. */
    lethal: 'sure' | 'maybe' | null;
    critChance: number;
    critMax: number;
    /** Arkadaki birime sıçrayan kısmî hasar (ana hedef değil). */
    splash: boolean;
  };
  heal?: { min: number; max: number; avg: number; critChance: number; critMax: number };
  /** Tur bazlı şifa: tur başına miktar, tur sayısı, toplam (eksik canla sınırlı). */
  hot?: { perTurn: number; turns: number; total: number };
  shield?: { amount: number; magic: boolean };
  /** Yakılacak mana. */
  burn?: number;
  /** Uygulanacak durumlar, okunur metin (ör. "Taunt 2 turns"). */
  statuses?: string[];
}

/** Hedef(ler) için etki önizlemesi. Tek hedefli skill'de `targetUid` verilmelidir. */
export function previewSkill(battle: Battle, actorUid: string, skillId: string, targetUid?: string, slot?: number): TargetPreview[] {
  const actor = battle.get(actorUid);
  if (!actor || !battle.skill(skillId)) return [];
  let targets = battle.validTargets(actorUid, skillId);
  if (battle.skill(skillId)?.target === 'random_enemies') return []; // hedefler rastgele: önizleme yok
  if (battle.isAreaSkill(skillId)) {
    const unit = targetUid ? targets.find((t) => t.uid === targetUid) : undefined;
    const center = unit ? unit.slot : slot;
    targets = center === undefined ? [] : battle.areaWindowAt(actorUid, skillId, center);
  } else if (battle.needsTargetChoice(skillId)) targets = targets.filter((t) => t.uid === targetUid);
  return previewForTargets(battle, actor, skillId, targets);
}

/** Verilen hedef listesi için etkiyi hesaplar; arkaya sıçrayan hasar ayrı bir giriş olarak döner. */
export function previewForTargets(battle: Battle, actor: Combatant, skillId: string, targets: Combatant[]): TargetPreview[] {
  const skill = battle.skill(skillId);
  if (!skill) return [];
  const f = battle.formulas;
  const out = new Map<string, TargetPreview>();
  const entry = (uid: string) => {
    let e = out.get(uid);
    if (!e) out.set(uid, (e = { uid }));
    return e;
  };

  // Her hedef için sıralı etkiler (kalkan ve hasar birbirini etkiler)
  const pools = new Map<string, { hp: number; shield: number; magicShield: number }>();
  const pool = (c: Combatant) => {
    let p = pools.get(c.uid);
    if (!p) pools.set(c.uid, (p = { hp: c.hp, shield: c.shield, magicShield: c.magicShield }));
    return p;
  };

  const addDamage = (target: Combatant, effect: DamageEffect, powerMult: number, splash: boolean) => {
    const r = damageRange(actor.stats, battle.effectiveStats(target), damageSpecFor(actor, target, effect, f, powerMult, !splash, battle.damageTakenMult(target)), f);
    const p = pool(target);
    // Bu hasarı emebilecek havuz: büyü hasarını iki kalkan da, fizikseli yalnızca genel kalkan emer
    const soak = effect.damageType === 'magic' ? p.magicShield + p.shield : p.shield;
    const loss = (v: number) => Math.min(p.hp, Math.max(0, v - soak));
    const hpLoss = loss(r.avg);
    const absorbed = Math.min(soak, r.avg);
    const e = entry(target.uid);
    const prev = e.damage;
    e.damage = {
      min: (prev?.min ?? 0) + r.min,
      max: (prev?.max ?? 0) + r.max,
      avg: (prev?.avg ?? 0) + r.avg,
      absorbed: (prev?.absorbed ?? 0) + absorbed,
      hpLoss: (prev?.hpLoss ?? 0) + hpLoss,
      hpLossMin: (prev?.hpLossMin ?? 0) + loss(r.min),
      hpLossMax: (prev?.hpLossMax ?? 0) + loss(r.max),
      lethal: null,
      critChance: actor.stats.critChance,
      critMax: (prev?.critMax ?? 0) + Math.round(r.max * actor.stats.critMult),
      splash: prev ? prev.splash && splash : splash,
    };
    // Sonraki etkiler için havuzları güncelle (magic: önce büyü kalkanı)
    let rest = r.avg;
    if (effect.damageType === 'magic') {
      const a = Math.min(p.magicShield, rest);
      p.magicShield -= a;
      rest -= a;
    }
    const b = Math.min(p.shield, rest);
    p.shield -= b;
    rest -= b;
    p.hp = Math.max(0, p.hp - rest);
  };

  const selfShieldDone = new Set<unknown>();
  for (const target of targets) {
    for (const effect of skill.effects) {
      if (!battle.effectAppliesTo(skill, effect, target, actor)) continue;
      if (effect.type === 'status') {
        if (effect.self) continue;
        const def = battle.statusDef(effect.status);
        const e = entry(target.uid);
        e.statuses = [...(e.statuses ?? []), `${def?.name ?? effect.status} ${effect.turns} turns`];
      } else if (effect.type === 'damage') {
        // Çok hedefli (şerit) vuruşta her yeni hedef bir öncekinin falloff katı hasar alır
        const idx = effect.falloff ? targets.indexOf(target) : 0;
        addDamage(target, effect, effect.falloff ? Math.pow(effect.falloff, idx) : 1, idx > 0);
      } else if (effect.type === 'heal') {
        const r = healRange(actor.stats, effect.scale, effect.power, f);
        const missing = target.maxHp - target.hp;
        entry(target.uid).heal = {
          min: Math.min(r.min, missing),
          max: Math.min(r.max, missing),
          avg: Math.min(r.avg, missing),
          critChance: actor.stats.critChance,
          critMax: Math.min(Math.round(r.max * actor.stats.critMult), missing),
        };
      } else if (effect.type === 'revive') {
        const e = entry(target.uid);
        e.statuses = [...(e.statuses ?? []), `Revived: ${Math.max(1, Math.round(target.maxHp * effect.hpRatio))} HP, ${Math.round(target.maxMp * effect.mpRatio)} MP`];
      } else if (effect.type === 'hot') {
        const perTurn = Math.round(attributePower(actor.stats, effect.scale, f) * effect.power);
        entry(target.uid).hot = {
          perTurn,
          turns: effect.turns,
          total: Math.min(perTurn * effect.turns, target.maxHp - target.hp),
        };
      } else if (effect.type === 'shield') {
        if (effect.self) {
          if (selfShieldDone.has(effect)) continue; // kendine kalkan: hedef sayısından bağımsız bir kez
          selfShieldDone.add(effect);
        }
        const recipient = effect.self ? actor : target;
        const mpLeft = skill.cost.resource === 'mp' ? actor.mp - skill.cost.amount : actor.mp;
        const amount = Math.round(attributePower(actor.stats, effect.scale, f) * effect.power) + Math.round((effect.bonusPerMana ?? 0) * mpLeft);
        entry(recipient.uid).shield = { amount, magic: effect.shieldType === 'magic' };
      } else if (effect.type === 'manaBurn') {
        const e = entry(target.uid);
        e.burn = (e.burn ?? 0) + Math.min(target.mp, effect.amount);
      } else if (effect.type === 'taunt') {
        const e = entry(target.uid);
        e.statuses = [...(e.statuses ?? []), `Taunt ${effect.turns} turns`];
      } else if (effect.type === 'guard') {
        const e = entry(target.uid);
        e.statuses = [...(e.statuses ?? []), `Guard ${effect.turns} turns`];
      }
    }
  }

  for (const e of out.values()) {
    if (!e.damage) continue;
    const target = battle.get(e.uid);
    if (!target) continue;
    e.damage.lethal = e.damage.hpLossMin >= target.hp ? 'sure' : e.damage.hpLossMax >= target.hp ? 'maybe' : null;
  }
  return [...out.values()];
}
