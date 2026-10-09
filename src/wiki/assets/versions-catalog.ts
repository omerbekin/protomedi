/**
 * Wiki > Assets > VERSIONS kataloğu: her sürüm anahtarı (class / Shared) için v1 ve v2 öğeleri yan yana. Saf (Phaser'sız, DOM'suz).
 * v1 öğeleri v2 seçilse de "kullanılmayan/legacy" sayılmaz: Legacy hesabı veriden (skill'lerin icon/vfx/sfx adlarından) yapılır,
 * sürüm seçiminden değil. Buradaki her öğe 'versioned' etiketlidir (v1 ve v2 karşılıkları birlikte yaşar).
 */
import { content } from '../../engine';
import { getVersion, inScope, ownedArt, SHARED_KEY, versionKeys, type AssetVersion } from '../../game/asset-versions';
import { v2Progress, type V2Progress } from '../../game/art-v2/status';
import { AUDIO_V2 } from '../../game/art-v2/audio-index';
import { ICONS_V2 } from '../../game/art-v2/icons-index';
import { VFX_SHEET_FILES } from '../../game/vfx-sheet-files';

export interface VersionedIcon {
  name: string;
  hasV2: boolean;
  tag: 'versioned';
}
export interface VersionedSound {
  id: string;
  hasV1: boolean;
  hasV2: boolean;
  tag: 'versioned';
}
export interface VersionedVfx {
  skillId: string;
  skillName: string;
  key: string;
  hasV2: boolean;
  tag: 'versioned';
}

export interface VersionRow {
  key: string;
  name: string;
  color: string;
  logo: string;
  selected: AssetVersion;
  progress: V2Progress;
  /** v2 kapsamı (Defender: animasyon + ses; ikonlar henüz yok). */
  scope: { icon: boolean; vfx: boolean; sfx: boolean };
  icons: VersionedIcon[];
  vfx: VersionedVfx[];
  sounds: VersionedSound[];
  /** v2'nin v1 karşılığı olmayan yeni öğeleri (efekt sprite'ları, yeni ses adları). */
  extraSprites: string[];
  extraSounds: string[];
  /** v2 animasyonlarının kullandığı hazır sprite sheet'ler (assets/vfx/<anahtar>/*.png). */
  sheets: Array<{ id: string; name: string; title: string; url: string; frames: number; fps: number }>;
  search: string;
}

export function buildVersions(): VersionRow[] {
  return versionKeys().map((key) => {
    const def = content.classes[key];
    const own = ownedArt(key);
    const progress = v2Progress(key);
    const icons = progress.icon.items.map((i) => ({ name: i.name, hasV2: i.ready, tag: 'versioned' as const }));
    const vfx = progress.vfx.items.map((i) => ({ skillId: i.skillId!, skillName: content.skills[i.skillId!]?.name ?? i.skillId!, key: i.name, hasV2: i.ready, tag: 'versioned' as const }));
    const v2Sounds = AUDIO_V2[key]?.sfx ?? {};
    const sounds = progress.sfx.items.map((i) => ({ id: i.name, hasV1: true, hasV2: i.ready, tag: 'versioned' as const }));
    const known = new Set([...own.icons, ...own.sfx]);
    const extraSprites = [...Object.keys(ICONS_V2[key]?.SPRITES ?? {}), ...Object.keys(ICONS_V2[key]?.ICONS ?? {}).filter((n) => !known.has(n))];
    const extraSounds = Object.keys(v2Sounds).filter((n) => !known.has(n));
    const name = key === SHARED_KEY ? 'Shared' : (def?.name ?? key);
    const sheets = VFX_SHEET_FILES.filter((f) => f.owner === key).map((f) => ({ id: f.id, name: f.name, title: f.meta.title ?? f.name, url: f.url, frames: f.meta.frames, fps: f.meta.fps }));
    return {
      key,
      name,
      color: def?.color ?? '#e8c47e',
      logo: def?.logo ?? 'swap',
      selected: getVersion(key),
      progress,
      scope: { icon: inScope(key, 'icon'), vfx: inScope(key, 'vfx'), sfx: inScope(key, 'sfx') },
      icons,
      vfx,
      sounds,
      extraSprites,
      extraSounds,
      sheets,
      search: `versions ${key} ${name} ${own.icons.join(' ')} ${own.sfx.join(' ')} ${vfx.map((v) => `${v.skillName} ${v.key}`).join(' ')} ${sheets.map((x) => x.name).join(' ')}`.toLowerCase(),
    };
  });
}
