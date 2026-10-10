import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
import { ITEM_ICON_NAMES, REWARD_ICON } from '../src/game/item-icons';
import { inScope, versionKeys } from '../src/game/asset-versions';
import { VFX_SHEET_FILES } from '../src/game/vfx-sheet-files';
import { buildVersions } from '../src/wiki/assets/versions-catalog';

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

  it('data/audio-ui.json içindeki TÜM menü sesleri Sounds sayfasında (UI grubu) listelenir', async () => {
    const ui = (await import('../data/audio-ui.json')).default as { sfx: Record<string, unknown> };
    expect(catalog.uiSounds.map((s) => s.id).sort()).toEqual(Object.keys(ui.sfx).sort());
    for (const s of catalog.uiSounds) {
      expect(s.duration, s.id).toBeGreaterThan(0);
      expect(s.desc?.length, s.id).toBeGreaterThan(0);
    }
  });

  it('her skill için animasyon satırı vardır; her vfx türü listelenir', () => {
    expect(catalog.animations.map((a) => a.skillId).sort()).toEqual(Object.keys(content.skills).sort());
    for (const a of catalog.animations) expect(a.vfxMissing, `${a.skillId} vfx tanımsız`).toBe(false);
    expect(catalog.vfxKinds.map((v) => v.kind)).toEqual([...VFX_KINDS]);
  });

  it('her class ve çağrının sprite ve avatar dosyası katalogda bulunur (gizli class dahil)', () => {
    const defs = [...Object.values(content.classes), ...Object.values(content.summons), ...Object.values(content.bosses)]; // boss tanımları (data/bosses) da
    expect(catalog.characters.map((c) => c.id).sort()).toEqual(defs.map((d) => d.id).sort());
    for (const c of catalog.characters) {
      expect(c.idleUrl, `${c.id}: assets/sprites/${c.spriteId}/idle.png yok`).not.toBeNull();
      expect(c.avatarUrl, `${c.id}: assets/avatars/${c.spriteId}.png yok`).not.toBeNull();
      expect(c.missing, c.id).toEqual([]);
      expect(c.skills.length, c.id).toBe((content.classes[c.id] ?? content.summons[c.id] ?? content.bosses[c.id])!.skills.length);
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

  it('tüm item / ödül ikonları (src/game/item-icons.ts) Icons bölümünde listelenir; her biri bir yerde kullanılır', () => {
    expect(catalog.itemIcons.map((i) => i.name)).toEqual([...ITEM_ICON_NAMES]);
    for (const n of Object.values(REWARD_ICON)) expect(catalog.itemIcons.find((i) => i.name === n)?.group, n).toBe('reward');
    for (const i of catalog.itemIcons) expect(i.uses.length, `${i.name} kullanılmıyor`).toBeGreaterThan(0);
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
  it('Assets genel bakış + Sounds, Animations, Icons, Character art, Palette, Versions ve Legacy bölümleri tanımlı', () => {
    expect(ASSET_NAV.map((n) => n.id)).toEqual(['assets', 'sounds', 'animations', 'icons', 'art', 'palette', 'versions', 'legacy']);
    for (const n of ASSET_NAV) {
      expect(n.title.length, n.id).toBeGreaterThan(0);
      expect(ICON_KINDS as readonly string[], `${n.id} ikonu`).toContain(n.icon);
    }
    for (const target of Object.values(WIKI_ALIASES)) expect(ASSET_NAV.map((n) => n.id) as string[]).toContain(target);
  });
});

describe('Play kartı görselleri (assets/cards)', () => {
  it('her kart görseli bağlı: odak verisi var (battle-layout.json > backgrounds.cardFocus) ve aslı assets/source/cards altında', async () => {
    const layout = (await import('../data/battle-layout.json')).default as unknown as { backgrounds: { cardFocus: Record<string, unknown> } };
    for (const f of readdirSync('assets/cards')) {
      const id = f.replace(/\.[^.]+$/, '');
      expect(layout.backgrounds.cardFocus[id], `${f}: odak yok`).toBeTruthy();
      expect(existsSync(`assets/source/cards/${f}`), `${f}: aslı yok`).toBe(true);
    }
  });
});

describe('Sprite sheet efektleri (assets/vfx) bağlı; assets/source yalnızca kaynak', () => {
  const vfxRoot = join(__dirname, '..', 'assets', 'vfx');
  const onDisk = existsSync(vfxRoot)
    ? readdirSync(vfxRoot).filter((d) => statSync(join(vfxRoot, d)).isDirectory()).flatMap((owner) => readdirSync(join(vfxRoot, owner)).filter((f) => f.endsWith('.png')).map((f) => ({ owner, name: f.replace(/\.png$/, ''), id: `${owner}/${f.replace(/\.png$/, '')}` })))
    : [];

  it('assets/vfx altındaki her .png bağlı: metası var, oyunun sheet listesinde, sahibinin v2 animasyonunda kullanılıyor ve Codex > Versions da listeleniyor', () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(VFX_SHEET_FILES.map((f) => f.id).sort()).toEqual(onDisk.map((f) => f.id).sort());
    const rows = buildVersions();
    for (const f of onDisk) {
      const metaPath = join(vfxRoot, f.owner, `${f.name}.json`);
      expect(existsSync(metaPath), `${f.id}: .json metası yok`).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { frames: number; frame_size: [number, number]; fps: number };
      const png = readFileSync(join(vfxRoot, f.owner, `${f.name}.png`));
      const [w, hgt] = [png.readUInt32BE(16), png.readUInt32BE(20)]; // PNG IHDR
      expect(Math.floor(w / meta.frame_size[0]) * Math.floor(hgt / meta.frame_size[1]), `${f.id}: kare sayısı sheet'e sığmıyor`).toBeGreaterThanOrEqual(meta.frames);
      expect(meta.fps, f.id).toBeGreaterThan(0);
      expect(versionKeys(), `${f.id}: sahibi bir sürüm anahtarı değil`).toContain(f.owner);
      expect(inScope(f.owner, 'vfx'), `${f.id}: sahibinin v2 animasyonu kapsam dışı`).toBe(true);
      const src = readFileSync(join(__dirname, '..', 'src/game/art-v2', f.owner, 'vfx.ts'), 'utf8');
      expect(src.includes(`'${f.id}'`), `${f.id}: ${f.owner}/vfx.ts kullanmıyor (bağlantısız)`).toBe(true);
      expect(rows.find((r) => r.key === f.owner)?.sheets.map((x) => x.id), `${f.id}: Codex > Versions da yok`).toContain(f.id);
    }
  });

  it('assets/source kaynak/asıl dosyalardır: oyun kodu yüklemez, Legacy / bağlantısız listesine düşmez; her sheet sahibinin aslı assets/source/<sahip>-vfx altında', () => {
    const srcRoot = join(__dirname, '..', 'src');
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.ts$/.test(e.name) ? [join(d, e.name)] : []));
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/import\.meta\.glob\(\s*['"]([^'"]+)['"]/g)) expect(m[1], `${file} assets/source yüklüyor`).not.toMatch(/assets\/source/);
      for (const m of text.matchAll(/^\s*import[^;]*from\s*['"]([^'"]+)['"]/gm)) expect(m[1], `${file} assets/source içe aktarıyor`).not.toMatch(/assets\/source/);
    }
    expect(legacyItems.some((i) => /assets\/(source|vfx)\//.test(`${i.id} ${i.label}`)), 'Legacy de assets/source ya da assets/vfx dosyası').toBe(false);
    for (const owner of new Set(onDisk.map((f) => f.owner))) expect(existsSync(join(__dirname, '..', 'assets', 'source', `${owner}-vfx`)), `assets/source/${owner}-vfx yok`).toBe(true);
  });

  it('görsel v2 ikonları (assets/icons-v2/<sahip>) bağlı; asılları assets/source/<sahip>-icons altında kaynak olarak durur (Defender)', () => {
    const iconsRoot = join(__dirname, '..', 'assets', 'icons-v2');
    const owners = existsSync(iconsRoot) ? readdirSync(iconsRoot) : [];
    expect(owners).toContain('defender');
    for (const owner of owners) {
      expect(existsSync(join(__dirname, '..', 'assets', 'source', `${owner}-icons`)), `assets/source/${owner}-icons yok`).toBe(true);
      const src = readFileSync(join(__dirname, '..', 'src/game/art-v2', owner, 'icons.ts'), 'utf8');
      for (const f of readdirSync(join(iconsRoot, owner)).filter((x) => x.endsWith('.png'))) expect(src.includes(`'${owner}/${f.replace(/\.png$/, '')}'`), `${owner}/${f}: ${owner}/icons.ts bağlamıyor`).toBe(true);
    }
    expect(legacyItems.some((i) => /assets\/(icons-v2|source)\//.test(`${i.id} ${i.label}`))).toBe(false);
  });
});

describe('Ana menü katmanlı sahnesi (assets/menu)', () => {
  it('her dosya kullanılıyor (data/menu-scene.json katmanları + efekt sayfası), asılları assets/source/menu-layers altında, konumlar görselin içinde', async () => {
    const cfg = (await import('../data/menu-scene.json')).default as unknown as { layers: string[]; fire: { flames: Array<{ x: number; y: number }>; glow: { x: number; y: number } }; smoke: { origin: { x: number; y: number } }; frames: Record<string, unknown> };
    const used = new Set([...cfg.layers, 'fx']);
    for (const f of readdirSync('assets/menu')) expect(used.has(f.replace(/\.[^.]+$/, '')), `${f} bağlantısız`).toBe(true);
    for (const n of used) expect(existsSync(`assets/menu/${n}.webp`), `${n}.webp yok`).toBe(true);
    expect(readdirSync('assets/source/menu-layers').filter((f) => f.endsWith('.png'))).toHaveLength(5);
    for (const p of [...cfg.fire.flames, cfg.fire.glow, cfg.smoke.origin]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(2580);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(1080);
    }
    for (const [k, r] of Object.entries(cfg.frames)) {
      if (k.startsWith('_')) continue;
      const [x, y, w, h] = r as number[];
      expect(x! >= 0 && y! >= 0 && x! + w! <= 1024 && y! + h! <= 512, `${k} sayfanın dışında`).toBe(true);
    }
  });
});

describe('Item ikon görselleri (assets/items) bağlı; asılları assets/source/item-icons', () => {
  it('assets/items altındaki her görsel bir item e ait, oyunun listesinde ve Codex > Icons ta; görseli olmayan item piksel ikona düşer', async () => {
    const { ITEM_IMAGE_FILES, itemImageUrl } = await import('../src/game/item-icon-files');
    const items = (await import('../data/items.json')).default.items as Array<{ id: string }>;
    const onDisk = readdirSync('assets/items').filter((f) => /\.(webp|png)$/.test(f)).map((f) => f.replace(/\.[^.]+$/, '')).sort();
    expect(onDisk.length).toBeGreaterThan(0);
    expect(Object.keys(ITEM_IMAGE_FILES).sort()).toEqual(onDisk);
    for (const id of onDisk) expect(items.some((d) => d.id === id), `${id}: items.json da böyle bir item yok`).toBe(true);
    expect(catalog.itemArt.art.map((a) => a.itemId).sort()).toEqual(onDisk);
    for (const a of catalog.itemArt.art) expect(a.name, a.itemId).not.toBe('');
    expect(itemImageUrl({ id: 'no_such_item' })).toBeNull();
    expect(existsSync('assets/source/item-icons'), 'assets/source/item-icons yok').toBe(true);
    expect(existsSync('tools/make-item-icons.mjs')).toBe(true);
  });
});

describe('Stat ikonu görselleri (assets/stat-icons) bağlı; asılları assets/source/stat-icons', () => {
  it('her dosya bir stat a ait ve Codex > Icons > Stat icons ta; small/ eşleri var; asıl sayfa ve kesim aracı duruyor', () => {
    const onDisk = readdirSync('assets/stat-icons').filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort();
    expect(onDisk.length).toBe(16);
    const small = readdirSync('assets/stat-icons/small').filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort();
    expect(small).toEqual(onDisk);
    const rows = catalog.statArt;
    expect(rows.filter((r) => r.unlinked).map((r) => r.stat), 'stat e ait olmayan dosya').toEqual([]);
    expect(rows.filter((r) => r.url).map((r) => r.stat).sort()).toEqual(onDisk);
    expect(legacyItems.some((i) => /assets\/stat-icons\//.test(`${i.id} ${i.label}`))).toBe(false);
    expect(existsSync('assets/source/stat-icons/stat-sheet.png'), 'assets/source/stat-icons yok').toBe(true);
    expect(existsSync('tools/make-stat-icons.mjs')).toBe(true);
  });
});

describe('Arayüz ikonu görselleri (assets/ui-icons) bağlı; asılları assets/source/ui-icons', () => {
  it('her dosya bir arayüz ikonuna ait ve Codex > Icons > UI icons ta; small/ eşleri var; asıl sayfa ve kesim aracı duruyor', () => {
    const onDisk = readdirSync('assets/ui-icons').filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort();
    expect(onDisk.length).toBe(16);
    const small = readdirSync('assets/ui-icons/small').filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')).sort();
    expect(small).toEqual(onDisk);
    const rows = catalog.uiArt;
    expect(rows.filter((r) => r.unlinked).map((r) => r.name), 'arayüz ikonuna ait olmayan dosya').toEqual([]);
    expect(rows.filter((r) => r.url).map((r) => r.name).sort()).toEqual(onDisk);
    expect(legacyItems.some((i) => /assets\/ui-icons\//.test(`${i.id} ${i.label}`))).toBe(false);
    expect(existsSync('assets/source/ui-icons/ui-sheet.png'), 'assets/source/ui-icons yok').toBe(true);
    expect(existsSync('tools/make-ui-icons.mjs')).toBe(true);
  });
});

describe('Oyun ikonu görselleri (assets/misc-icons) bağlı; asılları assets/source/misc-icons', () => {
  it('her dosya beklenen bir ikon ve Codex > Icons > Game icons ta; small/ eşleri var; asıl sayfalar ve kesim aracı duruyor', () => {
    const onDisk = readdirSync('assets/misc-icons').flatMap((g) => readdirSync(`assets/misc-icons/${g}`).filter((f) => f.endsWith('.png')).map((f) => `${g}:${f.replace(/\.png$/, '')}`)).sort();
    expect(onDisk.length).toBe(60);
    const small = readdirSync('assets/misc-icons').flatMap((g) => readdirSync(`assets/misc-icons/${g}/small`).filter((f) => f.endsWith('.png')).map((f) => `${g}:${f.replace(/\.png$/, '')}`)).sort();
    expect(small).toEqual(onDisk);
    const rows = catalog.miscArt;
    expect(rows.filter((r) => r.unlinked).map((r) => r.id), 'beklenmeyen dosya').toEqual([]);
    expect(rows.filter((r) => r.url).map((r) => r.id).sort()).toEqual(onDisk);
    expect(legacyItems.some((i) => /assets\/misc-icons\//.test(`${i.id} ${i.label}`))).toBe(false);
    for (const f of ['status-sheet.png', 'world-sheet.png', 'class-node-sheet.png']) expect(existsSync(`assets/source/misc-icons/${f}`), f).toBe(true);
    expect(existsSync('tools/make-misc-icons.mjs')).toBe(true);
  });
});
