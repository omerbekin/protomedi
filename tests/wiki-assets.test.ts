import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import audio from '../data/audio.json';
import { content } from '../src/engine';
import { buildCatalog } from '../src/gallery/catalog';
import { ASSET_NAV, WIKI_ALIASES } from '../src/wiki/assets/nav';
import { buildLegacy, legacyOfSprite, type LegacyFiles } from '../src/wiki/assets/legacy-catalog';
import { ICON_KINDS } from '../src/ui/icon-kinds';
import { BACKUP_VFX, VFX_KINDS } from '../src/ui/vfx-kinds';
import { buildWiki } from '../src/wiki/catalog';

/** assets/ altındaki .png dosyalarını sayfadaki `import.meta.glob` ile aynı şekle (yol -> yol) çevirir. */
function scan(dir: string, depth: 1 | 2): Record<string, string> {
  const root = join(__dirname, '..', 'assets', dir);
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  for (const a of readdirSync(root, { withFileTypes: true })) {
    if (depth === 1 && a.isFile() && a.name.endsWith('.png')) out[`assets/${dir}/${a.name}`] = join(root, a.name);
    if (depth === 2 && a.isDirectory()) for (const f of readdirSync(join(root, a.name))) if (f.endsWith('.png')) out[`assets/${dir}/${a.name}/${f}`] = join(root, a.name, f);
  }
  return out;
}

const files: LegacyFiles = {
  sprites: scan('sprites', 2),
  avatars: scan('avatars', 1),
  spritesOld: scan('sprites_old', 2),
  concepts: scan('concepts', 2),
  pool: scan('characters-pool', 1),
};
const catalog = buildCatalog(files);
const legacy = buildLegacy(catalog, files);
const legacyItems = legacy.groups.flatMap((g) => g.items);
const wiki = buildWiki({ sprites: files.sprites, avatars: files.avatars });

describe('Wiki > Assets: ortak katalog (src/gallery/catalog.ts)', () => {
  it('data/audio.json içindeki TÜM sesler listelenir (süre ve katman özetiyle)', () => {
    const ids = Object.keys(audio.sfx).sort();
    expect(catalog.sounds.map((s) => s.id).sort()).toEqual(ids);
    for (const s of catalog.sounds) {
      expect(s.duration, s.id).toBeGreaterThan(0);
      expect(s.layers.length, s.id).toBe(s.layerCount);
    }
    // skill'lerin sfx listesi 'kullanan skill' olarak görünür
    for (const sk of Object.values(content.skills))
      for (const k of sk.sfx ?? []) expect(catalog.sounds.find((s) => s.id === k)?.usedBy.map((u) => u.id), `${sk.id} -> ${k}`).toContain(sk.id);
  });

  it('her skill için animasyon satırı vardır; her vfx türü listelenir', () => {
    expect(catalog.animations.map((a) => a.skillId).sort()).toEqual(Object.keys(content.skills).sort());
    for (const a of catalog.animations) expect(a.vfxMissing, `${a.skillId} vfx tanımsız`).toBe(false);
    expect(catalog.vfxKinds.map((v) => v.kind)).toEqual([...VFX_KINDS]);
  });

  it('her class ve çağrının sprite ve avatar dosyası katalogda bulunur (gizli class dahil)', () => {
    const defs = [...Object.values(content.classes), ...Object.values(content.summons)];
    expect(catalog.characters.map((c) => c.id).sort()).toEqual(defs.map((d) => d.id).sort());
    for (const c of catalog.characters) {
      expect(c.idleUrl, `${c.id}: assets/sprites/${c.spriteId}/idle.png yok`).not.toBeNull();
      expect(c.avatarUrl, `${c.id}: assets/avatars/${c.spriteId}.png yok`).not.toBeNull();
      expect(c.missing, c.id).toEqual([]);
      expect(c.skills.length, c.id).toBe(content.classes[c.id]?.skills.length ?? content.summons[c.id]!.skills.length);
    }
  });

  it('gizli (hidden) class wiki class listesinde YOK ama Assets katalogunda (karakter + animasyon) hidden etiketiyle var', () => {
    const hidden = Object.values(content.classes).filter((c) => c.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const c of hidden) {
      expect(wiki.classes.some((u) => u.id === c.id), `${c.id} wiki class listesinde`).toBe(false);
      expect(catalog.characters.find((x) => x.id === c.id)?.hidden, `${c.id} karakter satırı`).toBe(true);
      for (const sk of c.skills) expect(catalog.animations.find((a) => a.skillId === sk)?.hidden, `${sk} animasyon satırı`).toBe(true);
    }
    for (const c of catalog.characters.filter((x) => !content.classes[x.id]?.hidden)) expect(c.hidden, c.id).toBe(false);
  });

  it('tüm piksel ikonlar listelenir; kullanan skill/class/stat/durum ikon satırında yazar', () => {
    expect(catalog.icons.map((i) => i.name)).toEqual([...ICON_KINDS]);
    for (const sk of Object.values(content.skills)) {
      const entry = catalog.icons.find((i) => i.name === sk.icon);
      expect(entry, `${sk.id} ikonu ${sk.icon}`).toBeDefined();
      expect(entry!.uses.some((u) => u.kind === 'skill'), `${sk.icon} skill kullanımı`).toBe(true);
    }
    for (const def of [...Object.values(content.classes), ...Object.values(content.summons)]) expect(catalog.icons.find((i) => i.name === def.logo)?.uses.some((u) => u.kind === 'logo'), def.id).toBe(true);
    for (const st of Object.values(content.statuses)) expect(catalog.icons.find((i) => i.name === st.icon), st.icon).toBeDefined();
  });

  it('tüm durumlar ve zeminler listelenir (Wiki > Statuses & Grounds ile aynı veri)', () => {
    expect(catalog.statuses.map((s) => s.id).sort()).toEqual(Object.keys(content.statuses).sort());
    expect(catalog.grounds.map((g) => g.id).sort()).toEqual(Object.keys(content.grounds).sort());
    expect(wiki.statuses.map((s) => s.id).sort()).toEqual(Object.keys(content.statuses).sort());
  });
});

describe('Wiki > Legacy: kullanılmayan / eski her şey OTOMATİK türetilir', () => {
  const ofKind = (kind: string): string[] => legacy.groups.find((g) => g.kind === kind)?.items.map((i) => i.id) ?? [];

  it('hiçbir skill sfx listesinde olmayan her ses Legacy de; kullanılan hiçbir ses orada değil', () => {
    const used = new Set(Object.values(content.skills).flatMap((s) => s.sfx ?? []));
    const unused = Object.keys(audio.sfx).filter((id) => !used.has(id)).sort();
    expect(ofKind('sound').sort()).toEqual(unused);
  });

  it('hiçbir yerde gösterilmeyen (spare) her ikon Legacy de', () => {
    const spare = catalog.icons.filter((i) => i.uses.length === 0).map((i) => i.name).sort();
    expect(ofKind('icon').sort()).toEqual(spare);
  });

  it('hiçbir skill in kullanmadığı her efekt türü (yedekler dahil) Legacy de; yedekler Backup etiketli', () => {
    const used = new Set(Object.values(content.skills).flatMap((s) => (s.vfx ? [s.vfx] : [])));
    const unused = VFX_KINDS.filter((k) => !used.has(k)).sort();
    expect(ofKind('vfx').sort()).toEqual(unused);
    for (const k of BACKUP_VFX) if (!used.has(k)) expect(legacyItems.find((i) => i.kind === 'vfx' && i.id === k)?.why, k).toMatch(/^Backup/);
  });

  it('assets/sprites_old, assets/concepts, assets/characters-pool altındaki her .png Legacy de listelenir', () => {
    expect(Object.keys(files.spritesOld).length).toBeGreaterThan(0);
    expect(Object.keys(files.concepts).length).toBeGreaterThan(0);
    expect(ofKind('oldSprite').sort()).toEqual(Object.keys(files.spritesOld).sort());
    expect(ofKind('concept').sort()).toEqual(Object.keys(files.concepts).sort());
    expect(ofKind('pool').sort()).toEqual(Object.keys(files.pool).sort());
  });

  it('diskte class/çağrıya bağlı olmayan sprite/avatar dosyası listelenir; her görsel ya karakterde ya Legacy de', () => {
    const shown = new Set(catalog.characters.flatMap((c) => [...c.sprites.map((s) => s.url), ...(c.avatarUrl ? [c.avatarUrl] : []), ...c.variants.flatMap((v) => (v.avatarUrl ? [v.avatarUrl] : []))]));
    const orphanPaths = new Set(ofKind('orphan'));
    for (const [path, url] of [...Object.entries(files.sprites), ...Object.entries(files.avatars)]) expect(shown.has(url) || orphanPaths.has(path), `${path} bağlantısız`).toBe(true);
  });

  it('her Legacy öğesi neden legacy etiketi taşır (Replaced by / Unused / Backup / Early concept)', () => {
    expect(legacy.total).toBe(legacyItems.length);
    for (const i of legacyItems) {
      expect(i.why, i.id).toMatch(/^(Replaced by|Unused|Backup|Early concept)/);
      expect(i.label, i.id).not.toBe('');
    }
  });

  it('eski sprite sürümü olan class için Old versions kendi eski dosyalarını bulur (başka sprite ın değil; Geometer Mage ile aynı sprite ı paylaşır)', () => {
    for (const c of catalog.characters.filter((x) => x.oldSprites.length > 0)) {
      const mine = legacyOfSprite(legacy, c.spriteId);
      expect(mine.length, c.id).toBeGreaterThanOrEqual(c.oldSprites.length);
      for (const i of mine) expect(i.spriteId).toBe(c.spriteId);
    }
  });
});

describe('Wiki sol menüsü: Assets ve Legacy bölümleri', () => {
  it('Assets genel bakış + Sounds, Animations, Icons, Character art, Palette ve Legacy bölümleri tanımlı', () => {
    expect(ASSET_NAV.map((n) => n.id)).toEqual(['assets', 'sounds', 'animations', 'icons', 'art', 'palette', 'legacy']);
    for (const n of ASSET_NAV) {
      expect(n.title.length, n.id).toBeGreaterThan(0);
      expect(ICON_KINDS as readonly string[], `${n.id} ikonu`).toContain(n.icon);
    }
    for (const target of Object.values(WIKI_ALIASES)) expect(ASSET_NAV.map((n) => n.id) as string[]).toContain(target);
  });
});
