/**
 * OLAY EFEKTLERİ için v2 kancası (saf seçim; Phaser'sız, testlenebilir). Skill kullanımına bağlı OLMAYAN görseller (çağrı doğuşu, ceset emme,
 * çağrı ölümü / süresi dolup kaybolması, Hexer'ın Doom / Ill Omen geçişi / Wither tiki) da sahibinin v2 vfx dosyasından çözülür:
 * sahibi v2 seçiliyse ve `src/game/art-v2/<sahip>/vfx.ts > VFX` içinde aşağıdaki ADLA bir efekt varsa o oynar, yoksa v1 (vfx.ts summonFx /
 * corpseDrainFx, CombatantView.die / vanish) ya da BattleScene'in basit efekti. Oynatma BattleScene.runEventFx (VfxCtx + `k` kiti, `c.event`).
 *
 * Adlar (kılavuz: docs/design/art-v2.md > Olay efektleri):
 *   summon_<çağrıId>       çağrı doğuşu (summon_skeleton -> undead, summon_treant -> druid)
 *   corpsedrain            Raise Dead ceset emme (undead)
 *   summondeath_<çağrıId>  çağrı öldü (ceset bırakmaz)
 *   summonvanish_<çağrıId> çağrının süresi doldu (despawn)
 *   doomburst / omentransfer / withertick   Hexer motor olayları (hexer)
 */
import { content, type SkillDef } from '../engine';
import type { V2Vfx } from './art-v2/types';
import { VFX_V2 } from './art-v2/vfx-index';
import { ownerOfSkill, wantsV2 } from './asset-versions';

const base = (unitId: string): string => unitId.replace(/^enemy_/, '');

export const EVENT_FX = {
  summon: (unitId: string): string => `summon_${base(unitId)}`,
  summonDeath: (unitId: string): string => `summondeath_${base(unitId)}`,
  summonVanish: (unitId: string): string => `summonvanish_${base(unitId)}`,
  corpseDrain: 'corpsedrain',
  doom: 'doomburst',
  omenTransfer: 'omentransfer',
  witherTick: 'withertick',
} as const;

/** Sahibin v2 dosyasındaki olay efekti (seçimden bağımsız; wiki/test için). */
export function eventFxOf(owner: string | null | undefined, key: string): V2Vfx | undefined {
  return owner ? VFX_V2[owner]?.[key] : undefined;
}

/** Seçili sürüme göre olay efekti: sahibi v2 (vfx) seçiliyse ve efekt varsa o; yoksa undefined (çağıran v1'e düşer). */
export function selectEventFx(owner: string | null | undefined, key: string): V2Vfx | undefined {
  return owner && wantsV2(owner, 'vfx') ? eventFxOf(owner, key) : undefined;
}

/**
 * Olay efektinin bağlam skill'i (VfxCtx.skill zorunlu; `k.v2Sprite` ve `c.sfx` sahibi skill'den bulur): çağrı olaylarında çağrıyı yapan
 * skill (Raise Dead, Summon Treant), diğerlerinde verilen skill ya da sahibin ilk skill'i.
 */
export function eventContextSkill(owner: string, o: { unitId?: string; skillId?: string } = {}): SkillDef | undefined {
  if (o.skillId && content.skills[o.skillId] && ownerOfSkill(o.skillId) === owner) return content.skills[o.skillId];
  const cls = content.classes[owner];
  if (!cls) return undefined;
  if (o.unitId) {
    const unit = base(o.unitId);
    for (const sid of cls.skills) if (content.skills[sid]?.effects.some((ef) => ef.type === 'summon' && ef.unit === unit)) return content.skills[sid];
  }
  return content.skills[cls.skills[0] ?? ''];
}
