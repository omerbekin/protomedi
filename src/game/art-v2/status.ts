/**
 * v2 İLERLEME durumu: bir sahibin (class / shared) v1 öğelerinden kaçının v2 karşılığı hazır. Debug > Versions ("v2 · 5/9")
 * ve Wiki > Assets > Versions bunu gösterir. Saf (Phaser'sız, DOM'suz).
 */
import { ownedArt, inScope, type ArtKind } from '../asset-versions';
import { AUDIO_V2 } from './audio-index';
import { ICONS_V2 } from './icons-index';
import { VFX_V2 } from './vfx-index';

export interface KindProgress {
  ready: number;
  total: number;
  /** v1 adı -> v2 hazır mı. */
  items: Array<{ name: string; ready: boolean; skillId?: string }>;
}

export interface V2Progress {
  owner: string;
  icon: KindProgress;
  vfx: KindProgress;
  sfx: KindProgress;
  ready: number;
  total: number;
  /** v1'de karşılığı olmayan yeni v2 öğeleri (efekt sprite'ları, yeni ses adları). */
  extra: number;
}

const kp = (items: KindProgress['items']): KindProgress => ({ ready: items.filter((i) => i.ready).length, total: items.length, items });
const none = (): KindProgress => kp([]);

export function v2Progress(owner: string): V2Progress {
  const own = ownedArt(owner);
  const icons = ICONS_V2[owner]?.ICONS ?? {};
  const vfx = VFX_V2[owner] ?? {};
  const sfx = AUDIO_V2[owner]?.sfx ?? {};
  const on = (k: ArtKind) => inScope(owner, k);
  const icon = on('icon') ? kp(own.icons.map((n) => ({ name: n, ready: !!icons[n] }))) : none();
  const vx = on('vfx') ? kp(own.vfx.map((v) => ({ name: v.key, skillId: v.skillId, ready: !!vfx[v.key] || !!vfx[v.skillId] }))) : none();
  const sx = on('sfx') ? kp(own.sfx.map((n) => ({ name: n, ready: !!sfx[n] }))) : none();
  const known = new Set([...own.icons, ...own.sfx]);
  const extra =
    Object.keys(ICONS_V2[owner]?.SPRITES ?? {}).length + Object.keys(icons).filter((n) => !known.has(n)).length + Object.keys(sfx).filter((n) => !known.has(n)).length;
  return { owner, icon, vfx: vx, sfx: sx, ready: icon.ready + vx.ready + sx.ready, total: icon.total + vx.total + sx.total, extra };
}

/** Kısa rozet: "v2 (empty)" ya da "v2 · 5/9". */
export function v2Label(owner: string): string {
  const p = v2Progress(owner);
  return p.ready === 0 && p.extra === 0 ? 'v2 (empty)' : `v2 · ${p.ready}/${p.total}`;
}
