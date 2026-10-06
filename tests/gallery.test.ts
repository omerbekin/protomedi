import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import audio from '../data/audio.json';
import { content } from '../src/engine';
import { buildCatalog, type AssetFiles } from '../src/gallery/catalog';
import { ICON_KINDS } from '../src/ui/icon-kinds';
import { VFX_KINDS } from '../src/ui/vfx-kinds';

/** assets/ altındaki dosyaları galeri sayfasının `import.meta.glob`'uyla aynı şekle (yol -> yol) çevirir. */
function scan(dir: string, depth: 1 | 2): Record<string, string> {
  const root = join(__dirname, '..', 'assets', dir);
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  for (const a of readdirSync(root, { withFileTypes: true })) {
    if (depth === 1 && a.isFile() && a.name.endsWith('.png')) out[`assets/${dir}/${a.name}`] = join(root, a.name);
    if (depth === 2 && a.isDirectory())
      for (const f of readdirSync(join(root, a.name))) if (f.endsWith('.png')) out[`assets/${dir}/${a.name}/${f}`] = join(root, a.name, f);
  }
  return out;
}

const files: AssetFiles = { sprites: scan('sprites', 2), avatars: scan('avatars', 1), spritesOld: scan('sprites_old', 2) };
const catalog = buildCatalog(files);

describe('Asset Gallery kataloğu (gallery.html)', () => {
  it('data/audio.json içindeki TÜM sesler listelenir (süre ve katman özetiyle)', () => {
    const ids = Object.keys(audio.sfx).sort();
    expect(catalog.sounds.map((s) => s.id).sort()).toEqual(ids);
    for (const s of catalog.sounds) {
      expect(s.duration, s.id).toBeGreaterThan(0);
      expect(s.layers.length, s.id).toBe(s.layerCount);
    }
    // skill'lerin sfx listesi galeride "kullanan skill" olarak görünür
    for (const sk of Object.values(content.skills))
      for (const k of sk.sfx ?? []) expect(catalog.sounds.find((s) => s.id === k)?.usedBy.map((u) => u.id), `${sk.id} -> ${k}`).toContain(sk.id);
  });

  it('her skill için animasyon satırı vardır; her vfx türü galeride yer alır', () => {
    expect(catalog.animations.map((a) => a.skillId).sort()).toEqual(Object.keys(content.skills).sort());
    for (const a of catalog.animations) expect(a.vfxMissing, `${a.skillId} vfx tanımsız`).toBe(false);
    expect(catalog.vfxKinds.map((v) => v.kind)).toEqual([...VFX_KINDS]);
  });

  it('her class ve çağrının sprite ve avatar dosyası katalogda bulunur', () => {
    const defs = [...Object.values(content.classes), ...Object.values(content.summons)];
    expect(catalog.characters.map((c) => c.id).sort()).toEqual(defs.map((d) => d.id).sort());
    for (const c of catalog.characters) {
      expect(c.idleUrl, `${c.id}: assets/sprites/${c.spriteId}/idle.png yok`).not.toBeNull();
      expect(c.avatarUrl, `${c.id}: assets/avatars/${c.spriteId}.png yok`).not.toBeNull();
      expect(c.missing, c.id).toEqual([]);
      expect(c.skills.length, c.id).toBe(content.classes[c.id]?.skills.length ?? content.summons[c.id]!.skills.length);
    }
  });

  it('diskteki hiçbir sprite/avatar kayıp kalmaz (karaktere bağlı değilse "orphans" olarak listelenir)', () => {
    const listed = new Set(catalog.characters.flatMap((c) => [...c.sprites.map((s) => s.url), ...c.oldSprites.map((s) => s.url), ...(c.avatarUrl ? [c.avatarUrl] : [])]));
    const orphanIds = catalog.orphans;
    for (const path of Object.keys({ ...files.sprites, ...files.avatars, ...files.spritesOld })) {
      const url = files.sprites[path] ?? files.avatars[path] ?? files.spritesOld[path]!;
      const id = path.split('/').slice(-2)[0] === 'avatars' ? path.split('/').pop()!.replace('.png', '') : path.split('/').slice(-2)[0]!;
      expect(listed.has(url) || [...orphanIds.sprites, ...orphanIds.avatars, ...orphanIds.old].includes(id), path).toBe(true);
    }
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

  it('tüm durumlar ve zeminler listelenir', () => {
    expect(catalog.statuses.map((s) => s.id).sort()).toEqual(Object.keys(content.statuses).sort());
    expect(catalog.grounds.map((g) => g.id).sort()).toEqual(Object.keys(content.grounds).sort());
  });
});
