/**
 * LEGACY kataloğu (Wiki > Legacy): oyunda kullanılmayan, yedeklenen ya da yerine yenisi konan her şey. Saf TypeScript
 * (Phaser'sız, DOM'suz, testlenebilir). HİÇBİR liste elle yazılmaz: dizin taramasından (assets/sprites_old, assets/concepts,
 * assets/characters-pool) ve oyun verisinden ("kullanılmayan" hesabı: hiçbir skill'in sfx listesinde olmayan ses, hiçbir yerde
 * gösterilmeyen ikon, hiçbir skill'in kullanmadığı efekt türü, class'sız sprite/avatar) türetilir. Her öğe 'neden legacy'
 * etiketi taşır ("Replaced by ..." bilinirse o, bilinmiyorsa "Unused ...").
 */
import { content } from '../../engine';
import type { AssetFiles, Catalog } from '../../gallery/catalog';
import { avatarMap, groupByDir } from '../../gallery/catalog';

/** Legacy bölümünün ek dosya tabloları (Vite `import.meta.glob`; testte fs). */
export interface LegacyFiles extends AssetFiles {
  /** assets/concepts/<klasör>/<dosya>.png */
  concepts: Record<string, string>;
  /** assets/characters-pool/<ad>.png */
  pool: Record<string, string>;
}

export type LegacyKind = 'oldSprite' | 'concept' | 'pool' | 'orphan' | 'icon' | 'vfx' | 'sound';

export interface LegacyItem {
  kind: LegacyKind;
  /** Benzersiz kimlik (yol ya da ad). */
  id: string;
  label: string;
  /** Görsel varsa URL. */
  url: string | null;
  /** Neden legacy: "Replaced by ..." ya da "Unused ...". */
  why: string;
  /** Kısa ek bilgi (sahip class, dosya yolu). */
  note: string;
  /** Hangi sprite kimliğine (assets/sprites/<id>) ait (varsa); wiki class kartındaki 'Old versions' için. Aynı sprite'ı paylaşan class'lar (Geometer = Mage) aynı eski sürümleri gösterir. */
  spriteId: string | null;
  search: string;
}

export interface LegacyGroup {
  kind: LegacyKind;
  title: string;
  note: string;
  items: LegacyItem[];
}

export interface LegacyCatalog {
  groups: LegacyGroup[];
  total: number;
}

const fileOf = (path: string): string => path.replace(/\\/g, '/').split('/').pop() ?? '';
const stem = (file: string): string => file.replace(/\.[^.]+$/, '');
const dirOf = (path: string): string => path.replace(/\\/g, '/').split('/').slice(-2)[0] ?? '';

const classBySprite = (spriteId: string): { id: string; name: string } | null => {
  const def = [...Object.values(content.classes), ...Object.values(content.summons)].find((d) => d.spriteId === spriteId);
  return def ? { id: def.id, name: def.name } : null;
};

const item = (kind: LegacyKind, id: string, label: string, url: string | null, why: string, note: string, spriteId: string | null): LegacyItem => ({
  kind,
  id,
  label,
  url,
  why,
  note,
  spriteId,
  search: `legacy ${kind} ${id} ${label} ${why} ${note}`.toLowerCase(),
});

export const LEGACY_TITLES: Record<LegacyKind, { title: string; note: string }> = {
  oldSprite: { title: 'Old character sprites', note: 'assets/sprites_old: earlier versions of the character art.' },
  concept: { title: 'Concept art', note: 'assets/concepts: early drawings made while designing a class.' },
  pool: { title: 'Character art pool', note: 'assets/characters-pool: finished creature art waiting for a class or summon.' },
  orphan: { title: 'Unlinked sprite and avatar files', note: 'Files in assets/sprites or assets/avatars that no class or summon points to.' },
  icon: { title: 'Spare icons', note: 'Pixel icons (src/ui/icon-kinds.ts) that no skill, class, stat, status, ground or UI button shows.' },
  vfx: { title: 'Spare animations', note: 'Effect kinds (src/ui/vfx-kinds.ts) that no skill uses. Backups can be brought back by setting a skill\'s vfx.' },
  sound: { title: 'Unused sounds', note: 'Sounds (data/audio.json) that are in no skill\'s sfx list. Some are UI sounds played from code.' },
};

export function buildLegacy(cat: Catalog, files: LegacyFiles): LegacyCatalog {
  const groups: LegacyGroup[] = [];
  const add = (kind: LegacyKind, items: LegacyItem[]): void => {
    groups.push({ kind, ...LEGACY_TITLES[kind], items });
  };
  const current = new Set(Object.keys(groupByDir(files.sprites)));

  // --- eski sprite'lar: assets/sprites_old/<id>/<anim>.png ---
  add('oldSprite', Object.entries(files.spritesOld).map(([path, url]) => {
    const spriteId = dirOf(path);
    const anim = stem(fileOf(path));
    const owner = classBySprite(spriteId);
    const now = groupByDir(files.sprites)[spriteId]?.some((s) => s.anim === anim);
    const why = now ? `Replaced by assets/sprites/${spriteId}/${anim}.png` : `Unused: no current ${anim} sprite for ${spriteId}`;
    return item('oldSprite', path, `${owner?.name ?? spriteId} (${anim})`, url, why, `assets/sprites_old/${spriteId}/${anim}.png`, spriteId);
  }).sort((a, b) => a.label.localeCompare(b.label)));

  // --- konsept çizimleri: assets/concepts/<klasör>/<dosya>.png ---
  add('concept', Object.entries(files.concepts).map(([path, url]) => {
    const dir = dirOf(path);
    const base = dir.split('_')[0]!;
    const owner = classBySprite(base);
    const version = dir.includes('_') ? ` ${dir.split('_').slice(1).join(' ')}` : '';
    const why = owner ? `Early concept of ${owner.name}${version}; the game now uses assets/sprites/${base}` : current.has(base) ? `Replaced by assets/sprites/${base}` : 'Unused: concept art with no class behind it';
    return item('concept', path, `${dir} / ${stem(fileOf(path))}`, url, why, `assets/concepts/${dir}/${fileOf(path)}`, owner ? base : null);
  }).sort((a, b) => a.id.localeCompare(b.id)));

  // --- hazır yaratık sanatı havuzu: assets/characters-pool/<ad>.png ---
  add('pool', Object.entries(files.pool).map(([path, url]) => {
    const name = stem(fileOf(path));
    const owner = classBySprite(name);
    const why = current.has(name) || owner ? `Replaced by assets/sprites/${name}` : 'Unused: no class or summon uses it yet';
    return item('pool', path, name, url, why, `assets/characters-pool/${fileOf(path)}`, null);
  }).sort((a, b) => a.label.localeCompare(b.label)));

  // --- class'sız sprite klasörleri / avatarlar ---
  const orphans: LegacyItem[] = [];
  for (const [path, url] of Object.entries(files.sprites)) {
    const id = dirOf(path);
    if (cat.orphans.sprites.includes(id)) orphans.push(item('orphan', path, `${id} (${stem(fileOf(path))})`, url, 'Unused: no class or summon points to this sprite folder', `assets/sprites/${id}/${fileOf(path)}`, null));
  }
  for (const [path, url] of Object.entries(files.avatars)) {
    const id = stem(fileOf(path));
    if (cat.orphans.avatars.includes(id) && avatarMap(files.avatars)[id]) orphans.push(item('orphan', path, `${id} avatar`, url, 'Unused: no class or summon points to this avatar', `assets/avatars/${fileOf(path)}`, null));
  }
  add('orphan', orphans);

  // --- yedek ikonlar ---
  add('icon', cat.icons.filter((i) => i.category === 'spare').map((i) =>
    item('icon', i.name, i.name, null, cat.fxSprites.includes(i.name) ? 'Unused: no skill, class, stat or status shows it (an animation may still draw it as an effect sprite)' : 'Unused: nothing shows it', 'src/ui/icon-kinds.ts', null)));

  // --- yedek animasyon türleri ---
  add('vfx', cat.vfxKinds.filter((k) => k.usedBy.length === 0).map((k) =>
    item('vfx', k.kind, k.kind, null, k.backup ? 'Backup: kept in code, no skill uses it' : 'Unused: no skill uses it', 'src/ui/vfx-kinds.ts', null)));

  // --- kullanılmayan sesler ---
  add('sound', cat.sounds.filter((s) => s.usedBy.length === 0).map((s) =>
    item('sound', s.id, s.label, null, 'Unused: no skill plays it (UI sound or spare)', 'data/audio.json', null)));

  const kept = groups.filter((g) => g.items.length > 0);
  return { groups: kept, total: kept.reduce((n, g) => n + g.items.length, 0) };
}

/** Bir sprite kimliğinin (class'ın spriteId'si) eski sürümleri (sprites_old + concepts) — wiki class kartındaki 'Old versions' için. */
export const legacyOfSprite = (legacy: LegacyCatalog, spriteId: string): LegacyItem[] =>
  legacy.groups.filter((g) => g.kind === 'oldSprite' || g.kind === 'concept').flatMap((g) => g.items).filter((i) => i.spriteId === spriteId);
