/**
 * Skill efekti (VFX) ve skill sesi için SÜRÜM ÇÖZÜCÜ. BattleScene (oyun, debug cast ve wiki'nin gömülü sahnesi) skill efektini
 * buradan alır: sahibinin (class / çağıran class) v2 seçiliyse ve v2 dosyasında karşılığı varsa v2 efekti, yoksa v1 (vfx.ts VFX).
 * v2 anahtarı = skill'in v1 `vfx` adı, yoksa skill id'si (vfx'siz skill'ler, ör. Radiance). Seçim her kullanımda okunur:
 * debug > Versions'ta değiştirmek bir sonraki skill kullanımında etkilidir.
 */
import Phaser from 'phaser';
import type { SkillDef } from '../engine';
import { ownerOfSkill } from './asset-versions';
import { selectSkillVfx, v2VfxKey } from './vfx-select';
import { v2SpriteName } from './art-registry';
import type { VfxKind } from '../ui/vfx-kinds';
import { VFX, VFX_BASE_KIT, type VfxCtx } from './vfx';

/** v2 efektinin ikinci parametresi: v1 yardımcıları + v1 efektleri (`v1`) + v2 sprite yardımcıları + Phaser. */
export const VFX_KIT = {
  ...VFX_BASE_KIT,
  Phaser,
  /** v1 efektleri: v2 efekti eskisini çağırıp üstüne ekleyebilir (ör. `await k.v1.doublestrike(c)`). */
  v1: VFX as Record<string, (c: VfxCtx) => Promise<void>>,
  /** Bu skill'in sahibinin v2 SPRITES çiziminin tam adı (`k.sprite(scene, k.v2Name(c, 'ad'), ...)`). */
  v2Name: (c: VfxCtx, name: string): string => v2SpriteName(ownerOfSkill(c.skill.id) ?? 'unknown', name),
  /** Sahibin v2 sprite'ını sahneye koyar (k.sprite ile aynı imza, ad yerine v2 SPRITES adı). */
  v2Sprite: (c: VfxCtx, name: string, hex: string, x: number, y: number, size: number, depth?: number): Phaser.GameObjects.Image =>
    VFX_BASE_KIT.sprite(c.scene, v2SpriteName(ownerOfSkill(c.skill.id) ?? 'unknown', name), hex, x, y, size, depth),
};
export type VfxKit = typeof VFX_KIT;

export interface ResolvedVfx {
  run: (c: VfxCtx) => Promise<void>;
  version: 'v1' | 'v2';
  owner: string | null;
}

/** Skill'in oynayacak efekti (seçili sürüm); efekti hiç olmayan skill'de undefined (genel hareket oynar). */
export function resolveSkillVfx(skill: SkillDef): ResolvedVfx | undefined {
  const pick = selectSkillVfx(skill);
  const v2 = pick.v2;
  if (v2)
    return {
      owner: pick.owner,
      version: 'v2',
      run: async (c) => {
        try {
          await v2(c, VFX_KIT);
        } catch (err) {
          // Yarım kalan v2 efekti savaşı kilitlemesin: uyar ve devam et
          console.warn(`[art-v2] ${pick.owner}/${v2VfxKey(skill)} efekti hata verdi`, err);
        }
      },
    };
  const v1 = skill.vfx ? VFX[skill.vfx as VfxKind] : undefined;
  return v1 ? { owner: pick.owner, version: 'v1', run: v1 } : undefined;
}

export { skillSfxAllowed, v2VfxKey, v2VfxOf } from './vfx-select';
