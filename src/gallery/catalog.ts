/**
 * Asset Gallery kataloğu (gallery.html): oyunun verisinden TÜM sesleri, animasyonları, karakterleri, ikonları, durumları ve
 * zeminleri türetir. Saf TypeScript: Phaser'a ve DOM'a bağımlı DEĞİL (testlenebilir). Hiçbir liste elle yazılmaz: yeni bir ses
 * (data/audio.json), ikon (ICON_KINDS), skill/class/çağrı (data/), efekt (VFX_KINDS) ya da sprite/avatar dosyası eklenince
 * galeri kendiliğinden günceller. Dosya listeleri dışarıdan verilir (sayfada `import.meta.glob`, testte fs).
 */
import layout from '../../data/battle-layout.json';
import audioData from '../../data/audio.json';
import { content, TARGET_TEXT } from '../engine';
import type { Attributes, CombatantDef, PassiveDef, SkillDef } from '../engine';
import type { Layer, SfxDef } from '../game/audio';
import { SFX } from '../game/audio';
import { PIXEL_FX } from '../game/pixel-fx';
import { ICON_KINDS } from '../ui/icon-kinds';
import { STAT_COLOR, STAT_ICON, STAT_LABEL, UI_COLOR, UI_ICON } from '../ui/stat-icons';
import { UI_ICONS } from '../ui/dom-icons';
import { BACKUP_VFX, VFX_KINDS } from '../ui/vfx-kinds';

// ---------------------------------------------------------------- ortak

export interface Owner {
  kind: 'class' | 'summon' | 'other';
  id: string;
  name: string;
}

/** Skill'in sahibi (class ya da çağrı); kimsede yoksa "Other". */
export function skillOwner(skillId: string): Owner {
  for (const def of Object.values(content.classes)) if (def.skills.includes(skillId)) return { kind: 'class', id: def.id, name: def.name };
  for (const def of Object.values(content.summons)) if (def.skills.includes(skillId)) return { kind: 'summon', id: def.id, name: def.name };
  return { kind: 'other', id: 'other', name: 'Other' };
}

export interface SkillRef {
  id: string;
  name: string;
  icon: string;
  owner: Owner;
}

const skillRef = (s: SkillDef): SkillRef => ({ id: s.id, name: s.name, icon: s.icon, owner: skillOwner(s.id) });
const allSkills = (): SkillDef[] => Object.entries(content.skills).map(([id, s]) => ({ ...s, id: s.id ?? id }));

/** Aranabilir metin: küçük harf, kısa kelime listesi. */
export const searchText = (...parts: Array<string | undefined>): string => parts.filter(Boolean).join(' ').toLowerCase();

// ---------------------------------------------------------------- sesler

export interface SoundEntry {
  id: string;
  /** "stunChime" -> "stun Chime". */
  label: string;
  gain: number;
  /** Toplam süre (sn): en geç biten katmanın bitişi. */
  duration: number;
  layerCount: number;
  /** Katman özeti: her katman için kısa bir satır. */
  layers: string[];
  /** Katman türü sayıları: "2 tone, 1 noise". */
  summary: string;
  usedBy: SkillRef[];
  /** Filtre grubu: kullanan tek class/çağrı adı, "Shared" (birden çok) ya da "Unused / UI". */
  group: string;
  def: SfxDef;
}

/** Bir katmanın başlangıç gecikmesi dahil bitiş süresi (sn). */
export function layerEnd(l: Layer): number {
  const len = l.type === 'voice' ? l.duration : l.type === 'pluck' ? l.duration : l.attack + l.decay;
  return (l.at ?? 0) + len;
}

export const sfxDuration = (def: SfxDef): number => Math.max(0, ...def.layers.map(layerEnd));

const hz = (v: number): string => `${Math.round(v)}`;

/** Bir katmanın tek satırlık okunur özeti. */
export function describeLayer(l: Layer): string {
  const at = l.at ? ` @${l.at.toFixed(2)}s` : '';
  switch (l.type) {
    case 'tone':
      return `tone ${l.wave} ${hz(l.f0)}${l.f1 !== l.f0 ? `>${hz(l.f1)}` : ''} Hz, ${(l.attack + l.decay).toFixed(2)}s${at}`;
    case 'noise':
      return `noise ${l.filter} ${hz(l.f0)}${l.f1 !== l.f0 ? `>${hz(l.f1)}` : ''} Hz, ${(l.attack + l.decay).toFixed(2)}s${at}`;
    case 'voice':
      return `voice ${hz(l.f0Start)}-${hz(l.f0Peak)}-${hz(l.f0End)} Hz, ${l.duration.toFixed(2)}s${at}`;
    case 'pluck':
      return `pluck string ${hz(l.f)} Hz, ${l.duration.toFixed(2)}s${at}`;
  }
}

/** Genel ses seviyesi (data/audio.json > master). */
export const MASTER_GAIN: number = audioData.master;

export const sfxLabelOf = (id: string): string => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

export function buildSounds(): SoundEntry[] {
  const users = new Map<string, SkillRef[]>();
  for (const s of allSkills()) for (const k of s.sfx ?? []) users.set(k, [...(users.get(k) ?? []), skillRef(s)]);
  return Object.entries(SFX).map(([id, def]) => {
    const usedBy = users.get(id) ?? [];
    const owners = [...new Set(usedBy.map((u) => u.owner.name))];
    const counts = new Map<string, number>();
    for (const l of def.layers) counts.set(l.type, (counts.get(l.type) ?? 0) + 1);
    return {
      id,
      label: sfxLabelOf(id),
      gain: def.gain,
      duration: sfxDuration(def),
      layerCount: def.layers.length,
      layers: def.layers.map(describeLayer),
      summary: [...counts].map(([t, n]) => `${n} ${t}`).join(', '),
      usedBy,
      group: owners.length === 0 ? 'Unused / UI' : owners.length === 1 ? owners[0]! : 'Shared',
      def,
    };
  });
}

/** Müzik / ambiyans kayıtları: data/audio.json'da `music` (ya da `soundtracks`) anahtarı olursa listelenir; yoksa boş. */
export function buildSoundtracks(): string[] {
  const raw = audioData as unknown as Record<string, unknown>;
  const tracks = raw['music'] ?? raw['soundtracks'];
  return tracks && typeof tracks === 'object' ? Object.keys(tracks as Record<string, unknown>).filter((k) => !k.startsWith('_')) : [];
}

// ---------------------------------------------------------------- animasyonlar (VFX)

export interface AnimEntry {
  skillId: string;
  name: string;
  owner: Owner;
  icon: string;
  /** Skill rengi (ikon vurgusu). */
  fx: string;
  /** vfx türü (VFX_KINDS'te var) ya da null: genel hareket (`motion`/`skyFx`) oynar. */
  vfx: string | null;
  /** `vfx` alanı verilmiş ama VFX_KINDS'te yok (hata göstergesi). */
  vfxMissing: boolean;
  motion: string;
  skyFx: string | null;
  sfx: string[];
  /** Sahibi gizli (hidden) bir class: oyuncu listesinde görünmez; yalnızca geliştirici referansı. */
  hidden: boolean;
  target: string;
  targetText: string;
  area: boolean;
}

export interface VfxKindEntry {
  kind: string;
  backup: boolean;
  usedBy: SkillRef[];
}

export function buildAnimations(): AnimEntry[] {
  return allSkills().map((s) => ({
    skillId: s.id,
    name: s.name,
    owner: skillOwner(s.id),
    icon: s.icon,
    fx: s.fx,
    vfx: s.vfx && (VFX_KINDS as readonly string[]).includes(s.vfx) ? s.vfx : null,
    vfxMissing: !!s.vfx && !(VFX_KINDS as readonly string[]).includes(s.vfx),
    motion: s.motion,
    skyFx: s.skyFx ?? null,
    sfx: s.sfx ?? [],
    hidden: !!content.classes[skillOwner(s.id).id]?.hidden,
    target: s.target,
    targetText: TARGET_TEXT[s.target],
    area: s.target === 'area_enemies',
  }));
}

export function buildVfxKinds(): VfxKindEntry[] {
  const users = new Map<string, SkillRef[]>();
  for (const s of allSkills()) if (s.vfx) users.set(s.vfx, [...(users.get(s.vfx) ?? []), skillRef(s)]);
  return VFX_KINDS.map((kind) => ({ kind, backup: BACKUP_VFX.includes(kind), usedBy: users.get(kind) ?? [] }));
}

// ---------------------------------------------------------------- dosyalar (sprite / avatar)

/** Dosya yolu -> URL tabloları (Vite `import.meta.glob`; testte dosya sisteminden aynı şekilde kurulur). */
export interface AssetFiles {
  /** assets/sprites/<id>/<anim>.png */
  sprites: Record<string, string>;
  /** assets/avatars/<id>.png */
  avatars: Record<string, string>;
  /** assets/sprites_old/<id>/<anim>.png */
  spritesOld: Record<string, string>;
}

const parts = (path: string): string[] => path.replace(/\\/g, '/').split('/');
const stem = (file: string): string => file.replace(/\.[^.]+$/, '');

/** `.../<id>/<anim>.png` yollarını id -> [{anim, url}] olarak gruplar. */
export function groupByDir(files: Record<string, string>): Record<string, Array<{ anim: string; url: string }>> {
  const out: Record<string, Array<{ anim: string; url: string }>> = {};
  for (const [path, url] of Object.entries(files)) {
    const p = parts(path);
    const file = p.pop() ?? '';
    const id = p.pop() ?? '';
    (out[id] ??= []).push({ anim: stem(file), url });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.anim.localeCompare(b.anim));
  return out;
}

/** `.../<id>.png` yollarını id -> url yapar. */
export function avatarMap(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) out[stem(parts(path).pop() ?? '')] = url;
  return out;
}

// ---------------------------------------------------------------- karakterler

export interface CharacterEntry {
  id: string;
  kind: 'class' | 'summon';
  name: string;
  spriteId: string;
  color: string;
  logo: string;
  primary: string | null;
  attributes: Attributes;
  stats: { hp: number; mp: number; spd: number; evasion: number; accuracy: number; critChance: number; armor: number; magicArmor: number; mpRegen: number; hpRegen: number };
  tags: string[];
  /** Test class'ı (ör. Geometer): rastgele takımlara girmez; galeride 'TEST' rozeti. */
  testOnly: boolean;
  /** Gizli class (ör. Geometer): oyuncu seçiminde ve wiki class listesinde yok; Assets'te 'Hidden' etiketiyle görünür. */
  hidden: boolean;
  skills: SkillRef[];
  passive: PassiveDef | null;
  /** Gerçek sprite anim dosyaları (idle, ...); boşsa oyunda placeholder çizilir. */
  sprites: Array<{ anim: string; url: string }>;
  idleUrl: string | null;
  avatarUrl: string | null;
  /** assets/sprites_old altındaki eski sürümler. */
  oldSprites: Array<{ anim: string; url: string }>;
  missing: Array<'sprite' | 'avatar'>;
}

const toEntry = (kind: CharacterEntry['kind'], def: CombatantDef, files: AssetFiles): CharacterEntry => {
  const sprites = groupByDir(files.sprites)[def.spriteId] ?? [];
  const old = groupByDir(files.spritesOld)[def.spriteId] ?? [];
  const avatar = avatarMap(files.avatars)[def.spriteId] ?? null;
  const idle = sprites.find((s) => s.anim === 'idle')?.url ?? null;
  const st = def.stats;
  return {
    id: def.id,
    kind,
    name: def.name,
    spriteId: def.spriteId,
    color: def.color,
    logo: def.logo,
    primary: def.primary ?? null,
    attributes: def.attributes,
    stats: { hp: st.hp, mp: st.mp, spd: st.spd, evasion: st.evasion, accuracy: st.accuracy, critChance: st.critChance, armor: st.armor, magicArmor: st.magicArmor, mpRegen: st.mpRegen, hpRegen: st.hpRegen },
    tags: def.tags ?? [],
    testOnly: !!def.testOnly,
    hidden: !!def.hidden,
    skills: def.skills.flatMap((id) => (content.skills[id] ? [skillRef({ ...content.skills[id]!, id })] : [])),
    passive: def.passive ?? null,
    sprites,
    idleUrl: idle,
    avatarUrl: avatar,
    oldSprites: old,
    missing: [...(idle ? [] : (['sprite'] as const)), ...(avatar ? [] : (['avatar'] as const))],
  };
};

export function buildCharacters(files: AssetFiles): CharacterEntry[] {
  return [...Object.values(content.classes).map((d) => toEntry('class', d, files)), ...Object.values(content.summons).map((d) => toEntry('summon', d, files))];
}

/** Hiçbir class/çağrıya bağlı olmayan sprite klasörleri ve avatar dosyaları (id listesi). */
export function orphanAssets(files: AssetFiles): { sprites: string[]; avatars: string[]; old: string[] } {
  const known = new Set([...Object.values(content.classes), ...Object.values(content.summons)].map((d) => d.spriteId));
  const outside = (ids: string[]) => ids.filter((id) => !known.has(id)).sort();
  return { sprites: outside(Object.keys(groupByDir(files.sprites))), avatars: outside(Object.keys(avatarMap(files.avatars))), old: outside(Object.keys(groupByDir(files.spritesOld))) };
}

// ---------------------------------------------------------------- ikonlar

export type IconUseKind = 'skill' | 'logo' | 'passive' | 'stat' | 'status' | 'ground' | 'ui';

export interface IconUse {
  kind: IconUseKind;
  label: string;
  /** İkonun gösterildiği vurgu rengi (class / durum / stat rengi). */
  accent?: string;
}

export interface IconEntry {
  name: string;
  uses: IconUse[];
  /** İlk kullanım türü; hiç kullanılmıyorsa 'spare' (yedek / yalnızca efekt sprite'ı olarak). */
  category: IconUseKind | 'spare';
  /** Önizleme vurgu rengi (ilk kullanımdan; yoksa altın). */
  accent: string;
}

export function buildIcons(): IconEntry[] {
  const uses = new Map<string, IconUse[]>();
  const add = (icon: string, kind: IconUseKind, label: string, accent?: string): void => {
    uses.set(icon, [...(uses.get(icon) ?? []), { kind, label, ...(accent ? { accent } : {}) }]);
  };
  const colorOf = (owner: Owner): string | undefined => (content.classes[owner.id] ?? content.summons[owner.id])?.color;
  for (const s of allSkills()) {
    const owner = skillOwner(s.id);
    add(s.icon, 'skill', `${s.name} (${owner.name})`, s.fx || colorOf(owner));
  }
  for (const def of [...Object.values(content.classes), ...Object.values(content.summons)]) {
    add(def.logo, 'logo', `${def.name} logo`, def.color);
    if (def.passive) add(def.passive.icon, 'passive', `${def.name}: ${def.passive.name}`, def.color);
  }
  for (const [stat, icon] of Object.entries(STAT_ICON)) add(icon, 'stat', STAT_LABEL[stat as keyof typeof STAT_LABEL], STAT_COLOR[stat as keyof typeof STAT_COLOR]);
  for (const [id, st] of Object.entries(content.statuses)) add(st.icon, 'status', st.name || id, st.color);
  for (const [id, g] of Object.entries(content.grounds)) add(g.icon, 'ground', g.name || id, g.color);
  for (const icon of UI_ICONS) add(icon, 'ui', 'UI (debug dock / settings)', UI_COLOR);
  add(UI_ICON.hourglass, 'ui', 'Cooldown badge', UI_COLOR);
  return ICON_KINDS.map((name) => {
    const list = uses.get(name) ?? [];
    return { name, uses: list, category: list[0]?.kind ?? 'spare', accent: list.find((u) => u.accent)?.accent ?? '#e8c47e' };
  });
}

/** Piksel art motorundaki efekt sprite'ları (pixel-fx.ts): VFX'ler çizer. */
export const fxSpriteNames = (): string[] => Object.keys(PIXEL_FX);

// ---------------------------------------------------------------- durumlar ve zeminler

export interface StatusEntry {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  icon: string;
  color: string;
  text: string;
  usedBy: SkillRef[];
}

export function buildStatuses(): StatusEntry[] {
  const users = new Map<string, SkillRef[]>();
  for (const s of allSkills())
    for (const e of s.effects) {
      const ids = e.type === 'status' ? [e.status] : e.type === 'randomStatus' ? e.options.map((o) => o.status) : [];
      for (const id of ids) if (!(users.get(id) ?? []).some((r) => r.id === s.id)) users.set(id, [...(users.get(id) ?? []), skillRef(s)]);
    }
  return Object.entries(content.statuses).map(([id, st]) => ({ id, name: st.name, type: st.type, icon: st.icon, color: st.color, text: st.text, usedBy: users.get(id) ?? [] }));
}

export interface GroundEntry {
  id: string;
  name: string;
  color: string;
  element: string;
  icon: string;
  usedBy: SkillRef[];
}

export function buildGrounds(): GroundEntry[] {
  const users = new Map<string, SkillRef[]>();
  for (const s of allSkills()) for (const e of s.effects) if (e.type === 'ground') users.set(e.ground, [...(users.get(e.ground) ?? []), skillRef(s)]);
  return Object.entries(content.grounds).map(([id, g]) => ({ id, name: g.name, color: g.color, element: g.element, icon: g.icon, usedBy: users.get(id) ?? [] }));
}

// ---------------------------------------------------------------- palet

export interface Swatch {
  name: string;
  hex: string;
}

export interface PaletteGroups {
  ui: Swatch[];
  element: Swatch[];
  stat: Swatch[];
  classes: Swatch[];
}

export function buildPalette(): PaletteGroups {
  const colors = layout.colors as unknown as Record<string, string | Record<string, string>>;
  const ui = Object.entries(colors).flatMap(([name, v]) => (typeof v === 'string' ? [{ name, hex: v }] : []));
  const element = Object.entries(layout.colors.element).map(([name, hex]) => ({ name, hex }));
  const stat = Object.entries(STAT_COLOR).map(([name, hex]) => ({ name, hex }));
  const classes = [...Object.values(content.classes), ...Object.values(content.summons)].map((d) => ({ name: d.name, hex: d.color }));
  return { ui, element, stat, classes };
}

// ---------------------------------------------------------------- hepsi

export interface Catalog {
  sounds: SoundEntry[];
  soundtracks: string[];
  animations: AnimEntry[];
  vfxKinds: VfxKindEntry[];
  characters: CharacterEntry[];
  orphans: ReturnType<typeof orphanAssets>;
  icons: IconEntry[];
  fxSprites: string[];
  statuses: StatusEntry[];
  grounds: GroundEntry[];
  palette: PaletteGroups;
}

export function buildCatalog(files: AssetFiles): Catalog {
  return {
    sounds: buildSounds(),
    soundtracks: buildSoundtracks(),
    animations: buildAnimations(),
    vfxKinds: buildVfxKinds(),
    characters: buildCharacters(files),
    orphans: orphanAssets(files),
    icons: buildIcons(),
    fxSprites: fxSpriteNames(),
    statuses: buildStatuses(),
    grounds: buildGrounds(),
    palette: buildPalette(),
  };
}
