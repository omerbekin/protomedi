import type { Battle } from './battle';
import { damageRange, healRange } from './formulas';
import { betMultipliers, betStake } from './gamble';
import { damageSpecFor, type DamageEffect } from './spec';
import { slotOfTileUid } from './battle';
import { attributePower, hitChance } from './stats';
import type { Combatant, Side } from './types';

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
    /** İsabet şansı (0-1): saldırganın accuracy'si - hedefin evasion'ı. min/max/avg ve hpLoss değerleri İSABET ETTİĞİNDE geçerlidir; beklenen hasar = avg x hitChance. */
    hitChance: number;
    /** Beklenen hasar: avg x hitChance (kalkan/can ayrımı yapmaz; birden çok etkide toplanır). */
    expected: number;
    /** Arkadaki birime sıçrayan kısmî hasar (ana hedef değil). */
    splash: boolean;
  };
  heal?: { min: number; max: number; avg: number; critChance: number; critMax: number };
  /** Tur bazlı şifa: tur başına miktar, tur sayısı, toplam (eksik canla sınırlı). */
  hot?: { perTurn: number; turns: number; total: number };
  shield?: { amount: number; magic: boolean };
  /**
   * Çağrı (kullanıcının girdisinde): çağrılacak birim, maks canı ve (ceset tüketen çağrıda) beslenmiş mi + tüketilecek ceset (yoksa null).
   * `empowered` yalnızca Raise Dead gibi ceset tüketen çağrılarda tanımlı (UI mor parıltı / "Empowered" yazısı).
   */
  summon?: { unit: string; name: string; hp: number; empowered?: boolean; corpse?: string | null };
  /** Yer etkisi: tik başına büyü hasarı (hedefin büyü zırhı ve element zayıflığı dahil), tur sayısı, toplam. */
  ground?: { perTick: number; turns: number; total: number };
  /** Yakılacak mana. */
  burn?: number;
  /** Uygulanacak durumlar, okunur metin (ör. "Taunt 2 turns"). */
  statuses?: string[];
}

/** Hedef(ler) için etki önizlemesi. Tek hedefli skill'de `targetUid` verilmelidir. */
export function previewSkill(battle: Battle, actorUid: string, skillId: string, targetUid?: string, slot?: number, board?: Side): TargetPreview[] {
  const actor = battle.get(actorUid);
  if (!actor || !battle.skill(skillId)) return [];
  let targets = battle.validTargets(actorUid, skillId);
  if (battle.skill(skillId)?.target === 'random_enemies') return []; // hedefler rastgele: önizleme yok
  let centerUid: string | undefined;
  if (battle.isAreaSkill(skillId)) {
    // Anchor birimi erişim dışında (arkada) da olabilir: anchor yalnızca hücreyi belirler. Hedef sırası gerçek vuruşla aynı (aşamalıda aşama sırası;
    // falloff bu sırayla), toplam hasar aşamalı/aşamasız aynı hesaplanır. area_any: tahta = anchor biriminin tahtası / `tile:<yuva>` kendi tahtası / `board`.
    const anyBoard = battle.isAnyBoardArea(skillId);
    const tileSlot = anyBoard ? slotOfTileUid(targetUid) : undefined;
    const anchored = targetUid && tileSlot === undefined ? battle.get(targetUid) : undefined;
    const b: Side = anyBoard ? (tileSlot !== undefined ? actor.side : anchored && anchored.hp > 0 ? anchored.board : (board ?? foe(actor.side))) : foe(actor.side);
    const unit = anchored && anchored.hp > 0 && anchored.board === b ? anchored : undefined;
    const center = unit ? unit.slot : (tileSlot ?? slot);
    targets = center === undefined ? [] : battle.areaWindowAt(actorUid, skillId, center, b);
    centerUid = center === undefined ? undefined : targets.find((t) => t.board === b && t.slot === center)?.uid;
  } else if (battle.needsTargetChoice(skillId)) {
    targets = targets.filter((t) => t.uid === targetUid);
    // Yan vuruşlu skill: seçilen hedefin yanındaki hücreler de vurulur (ilk giriş seçilen hedef)
    if (targets[0]) targets = [targets[0], ...battle.splashTargets(skillId, targets[0])];
  }
  return previewForTargets(battle, actor, skillId, targets, centerUid);
}

const foe = (side: Side): Side => (side === 'party' ? 'enemy' : 'party');

/**
 * Verilen hedef listesi için etkiyi hesaplar; arkaya sıçrayan hasar ayrı bir giriş olarak döner.
 * `centerUid`: alan skill'inde anchor hücredeki birim (area.hitsAtCenter > 1 ise hasar etkileri ona o kadar kez uygulanır: X şekli).
 */
export function previewForTargets(battle: Battle, actor: Combatant, skillId: string, targets: Combatant[], centerUid?: string): TargetPreview[] {
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
    const stats = battle.effectiveStats(target);
    const range = (mult: number) => damageRange(actor.stats, stats, damageSpecFor(actor, target, effect, f, powerMult * mult, !splash, battle.damageTakenMult(target), battle.hunterMarkMult(actor, target)), f);
    // Bahis: en az (kayıp), en çok (kazanç) ve beklenen çarpan (güce uygulanır, gerçek vuruşla aynı yuvarlama); çifte vuruş: en çok 2 vuruş, beklenen 1 + ihtimal
    let lo = 1;
    let hi = 1;
    let ex = 1;
    if (effect.bet) {
      const mpLeft = skill.cost.resource === 'mp' && !battle.freeMp ? actor.mp - skill.cost.amount : actor.mp;
      const m = betMultipliers(effect.bet, betStake(effect.bet, actor.maxHp, actor.hp, mpLeft));
      lo = m.lose;
      hi = Math.max(m.win, m.lose);
      ex = m.expected;
    }
    const again = effect.repeatChance ?? 0;
    // Garantili kritik (Backstab): her vuruş kritik; aralık kritik çarpanıyla verilir (critChance 1)
    const sure = effect.guaranteedCrit ? actor.stats.critMult : 1;
    const r = { min: lo <= 0 ? 0 : Math.round(range(lo).min * sure), max: Math.round(range(hi).max * sure) * (again > 0 ? 2 : 1), avg: Math.round(range(ex).avg * sure * (1 + again)) };
    // İsabet: durum ekleri (Blinded/Shrouded) dahil geçerli stat'lar, gerçek vuruşla aynı
    const hit = hitChance(battle.effectiveStats(actor), stats, f);
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
      critChance: effect.guaranteedCrit ? 1 : actor.stats.critChance,
      critMax: (prev?.critMax ?? 0) + (effect.guaranteedCrit ? r.max : Math.round(r.max * actor.stats.critMult)),
      hitChance: hit,
      expected: (prev?.expected ?? 0) + r.avg * hit,
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
        const chance = effect.chance !== undefined && effect.chance < 1 ? ` (${Math.round(effect.chance * 100)}% chance)` : '';
        e.statuses = [...(e.statuses ?? []), `${def?.name ?? effect.status} ${effect.turns} turns${chance}`];
      } else if (effect.type === 'damage') {
        // Çok hedefli (alan) vuruşta her yeni hedef bir öncekinin falloff katı hasar alır (hedef sırası = vuruş sırası)
        const idx = effect.falloff || skill.splash ? targets.indexOf(target) : 0;
        const side = !!skill.splash && idx > 0; // yan vuruş: ana hedefin yanındaki hücre
        const times = centerUid !== undefined && target.uid === centerUid ? Math.max(1, skill.area?.hitsAtCenter ?? 1) : 1; // X şekli: merkez çift vuruş
        for (let k = 0; k < times; k++) addDamage(target, effect, (effect.falloff ? Math.pow(effect.falloff, idx) : 1) * (side ? skill.splash!.mult ?? 1 : 1), idx > 0 || k > 0);
      } else if (effect.type === 'randomStatus') {
        const e = entry(target.uid);
        e.statuses = [...(e.statuses ?? []), `Random: ${effect.options.map((o) => battle.statusDef(o.status)?.name ?? o.status).join(' / ')}`];
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
      } else if (effect.type === 'summon') {
        const sp = battle.summonPreview(actor.uid, skill.id);
        if (sp.unit) entry(actor.uid).summon = { unit: sp.unit.id, name: sp.unit.name, hp: sp.unit.stats.hp, ...(sp.empowered !== undefined ? { empowered: sp.empowered, corpse: sp.corpse?.uid ?? null } : {}) };
      } else if (effect.type === 'ground') {
        const perTick = battle.groundTickDamage(effect.ground, Math.round(attributePower(actor.stats, effect.scale, f) * effect.power), target);
        const e = entry(target.uid);
        e.ground = { perTick: (e.ground?.perTick ?? 0) + perTick, turns: effect.turns, total: (e.ground?.total ?? 0) + perTick * effect.turns };
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
