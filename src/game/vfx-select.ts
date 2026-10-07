/**
 * Skill efekti/sesi için SAF sürüm seçimi (Phaser'sız; testlenebilir). Oynatma tarafı src/game/vfx-versions.ts.
 * v2 anahtarı = skill'in v1 `vfx` adı, yoksa skill id'si (vfx'siz skill'ler, ör. Radiance).
 */
import type { SkillDef } from '../engine';
import { AUDIO_V2 } from './art-v2/audio-index';
import type { V2Vfx } from './art-v2/types';
import { VFX_V2 } from './art-v2/vfx-index';
import { ownerOfSkill, wantsV2 } from './asset-versions';

/** v2 anahtarı: skill'in vfx adı, yoksa skill id'si. */
export const v2VfxKey = (skill: Pick<SkillDef, 'id' | 'vfx'>): string => skill.vfx ?? skill.id;

/** Sahibin v2 dosyasındaki efekt (seçimden bağımsız); yoksa undefined. */
export function v2VfxOf(owner: string, skill: Pick<SkillDef, 'id' | 'vfx'>): V2Vfx | undefined {
  const file = VFX_V2[owner];
  return file ? (file[v2VfxKey(skill)] ?? file[skill.id]) : undefined;
}

/** Seçili sürüme göre: v2 efekti (varsa) ya da v1'e düşüş. */
export function selectSkillVfx(skill: Pick<SkillDef, 'id' | 'vfx'>): { owner: string | null; version: 'v1' | 'v2'; v2?: V2Vfx } {
  const owner = ownerOfSkill(skill.id);
  if (owner && wantsV2(owner, 'vfx')) {
    const v2 = v2VfxOf(owner, skill);
    if (v2) return { owner, version: 'v2', v2 };
  }
  return { owner, version: 'v1' };
}

/**
 * Efektin `c.sfx(id)` ile çalmak istediği ses çalınabilir mi: skill'in `sfx` listesinde ya da (sahibi v2 seçiliyken) sahibin v2 ses
 * dosyasında tanımlıysa (v2 efektleri yeni ses adları kullanabilsin).
 */
export function skillSfxAllowed(skill: Pick<SkillDef, 'id' | 'sfx'>, id: string, owner: string | null = ownerOfSkill(skill.id)): boolean {
  if (skill.sfx?.includes(id)) return true;
  return !!owner && wantsV2(owner, 'sfx') && !!AUDIO_V2[owner]?.sfx[id];
}
