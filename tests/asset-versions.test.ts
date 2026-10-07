import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import audio from '../data/audio.json';
import { content } from '../src/engine';
import { AUDIO_V2 } from '../src/game/art-v2/audio-index';
import { ICONS_V2 } from '../src/game/art-v2/icons-index';
import { v2Label, v2Progress } from '../src/game/art-v2/status';
import { V2_DEFAULT_SIZE } from '../src/game/art-v2/types';
import { VFX_V2 } from '../src/game/art-v2/vfx-index';
import { resolveSprite, v2IconOf, v2SpriteName } from '../src/game/art-registry';
import {
  SHARED_KEY,
  VERSION_EXCLUDED,
  VERSIONS_STORAGE_KEY,
  allVersionsState,
  getVersion,
  inScope,
  ownedArt,
  ownerOfSkill,
  ownerOfUnit,
  reloadVersions,
  setAllVersions,
  setVersion,
  versionKeys,
  wantsV2,
} from '../src/game/asset-versions';
import { resolveSfx, SFX } from '../src/game/audio';
import { GRID, PIXEL_FX, PIXEL_ICONS, PxGrid, spriteRows } from '../src/game/pixel-art';
import { selectSkillVfx, skillSfxAllowed } from '../src/game/vfx-select';
import { buildCatalog } from '../src/gallery/catalog';
import { buildLegacy } from '../src/wiki/assets/legacy-catalog';
import { buildVersions } from '../src/wiki/assets/versions-catalog';

/** Bellek içi localStorage taklidi (ya da bozuk/erişilemez depolama). */
function fakeStorage(init: Record<string, string> = {}, opts: { throwGet?: boolean; throwSet?: boolean } = {}): Storage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    clear: () => Object.keys(data).forEach((k) => delete data[k]),
    key: (i: number) => Object.keys(data)[i] ?? null,
    getItem: (k: string) => {
      if (opts.throwGet) throw new Error('SecurityError');
      return data[k] ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throwSet) throw new Error('QuotaExceeded');
      data[k] = v;
    },
    removeItem: (k: string) => void delete data[k],
  };
}

const g = globalThis as { localStorage?: Storage };
const useStorage = (s: Storage | undefined): void => {
  g.localStorage = s;
  reloadVersions();
};

beforeEach(() => useStorage(fakeStorage()));
afterEach(() => useStorage(undefined));

const ROOT = join(__dirname, '..');

/**
 * Geçici v2 içeriği enjekte eder (testler content-designer'ların gerçek içeriğine ya da örneğe bağlı kalmasın): verilen anahtarları
 * koyar, `fn` bitince eski hallerine döndürür. `null` değer o adı geçici olarak SİLER (v1'e düşüşü denemek için).
 */
function withV2(owner: string, add: { icons?: Record<string, unknown>; sprites?: Record<string, unknown>; vfx?: Record<string, unknown>; sfx?: Record<string, unknown> }, fn: () => void): void {
  const targets: Array<[Record<string, unknown> | undefined, Record<string, unknown> | undefined]> = [
    [ICONS_V2[owner]?.ICONS as Record<string, unknown> | undefined, add.icons],
    [ICONS_V2[owner]?.SPRITES as Record<string, unknown> | undefined, add.sprites],
    [VFX_V2[owner] as Record<string, unknown> | undefined, add.vfx],
    [AUDIO_V2[owner]?.sfx as Record<string, unknown> | undefined, add.sfx],
  ];
  const undo: Array<() => void> = [];
  for (const [obj, entries] of targets) {
    if (!obj || !entries) continue;
    for (const [k, v] of Object.entries(entries)) {
      const had = k in obj;
      const old = obj[k];
      if (v === null) delete obj[k];
      else obj[k] = v;
      undo.push(() => {
        if (had) obj[k] = old;
        else delete obj[k];
      });
    }
  }
  try {
    fn();
  } finally {
    for (const u of undo.reverse()) u();
  }
}

const NOISE = { gain: 0.5, layers: [{ type: 'noise' as const, filter: 'lowpass' as const, f0: 800, f1: 200, q: 0.7, attack: 0.001, decay: 0.1, gain: 0.5 }] };
const DRAW = (p: PxGrid): void => void p.rect(6, 6, 20, 20, 'a');
const VFX_FN = async (): Promise<void> => undefined;

describe('sürüm kaydı: her class için dosyalar ve tek satırlık kayıt', () => {
  it('sürüm anahtarları = kapsamdaki tüm class lar (Cutthroat hariç) + shared', () => {
    const expected = [...Object.keys(content.classes).filter((id) => id !== 'cutthroat'), SHARED_KEY].sort();
    expect(versionKeys().sort()).toEqual(expected);
    expect(VERSION_EXCLUDED).toContain('cutthroat');
  });

  it('kapsamdaki her anahtarın ikon / vfx / ses kaydı ve diskte kendi dosyası var', () => {
    for (const key of versionKeys()) {
      if (inScope(key, 'icon')) {
        expect(ICONS_V2[key], `${key} ikon kaydı`).toBeDefined();
        expect(existsSync(join(ROOT, 'src/game/art-v2', key, 'icons.ts')), `${key}/icons.ts`).toBe(true);
      } else expect(ICONS_V2[key], `${key} ikon kapsam dışı`).toBeUndefined();
      if (inScope(key, 'vfx')) {
        expect(VFX_V2[key], `${key} vfx kaydı`).toBeDefined();
        expect(existsSync(join(ROOT, 'src/game/art-v2', key, 'vfx.ts')), `${key}/vfx.ts`).toBe(true);
      } else expect(VFX_V2[key], `${key} vfx kapsam dışı`).toBeUndefined();
      expect(AUDIO_V2[key], `${key} ses kaydı`).toBeDefined();
      expect(existsSync(join(ROOT, 'data/audio-v2', `${key}.json`)), `data/audio-v2/${key}.json`).toBe(true);
    }
    // Defender: yalnızca sesleri; Cutthroat hiç yok
    expect(inScope('defender', 'icon')).toBe(false);
    expect(inScope('defender', 'vfx')).toBe(false);
    expect(inScope('defender', 'sfx')).toBe(true);
    expect(ICONS_V2['cutthroat']).toBeUndefined();
    expect(AUDIO_V2['cutthroat']).toBeUndefined();
  });

  it('class v2 dosyaları Phaser ı ve v1 vfx.ts yi çalışma zamanında içe aktarmaz (yalnızca import type)', () => {
    for (const key of versionKeys())
      for (const f of ['icons.ts', 'vfx.ts']) {
        const path = join(ROOT, 'src/game/art-v2', key, f);
        if (!existsSync(path)) continue;
        const src = readFileSync(path, 'utf8');
        for (const line of src.split('\n').filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l))) {
          expect(line, `${key}/${f}`).not.toMatch(/['"]phaser['"]/);
          expect(line, `${key}/${f}`).not.toMatch(/['"]\.\.\/\.\.\/vfx(-versions)?['"]/);
        }
      }
  });

  it('v2 ses dosyalarının katmanları geçerli (data/audio.json ile aynı şema)', () => {
    for (const [key, file] of Object.entries(AUDIO_V2))
      for (const [id, def] of Object.entries(file.sfx)) {
        const tag = `${key}/${id}`;
        expect(def.gain, tag).toBeGreaterThan(0);
        expect(def.layers.length, tag).toBeGreaterThan(0);
        for (const l of def.layers) {
          expect(['tone', 'noise', 'voice', 'pluck'], tag).toContain(l.type);
          if (l.type === 'tone' || l.type === 'noise') {
            expect(l.f0, tag).toBeGreaterThan(20);
            expect(l.f1, tag).toBeGreaterThan(20);
            expect(l.decay, tag).toBeGreaterThan(0);
            expect(l.gain, tag).toBeGreaterThan(0);
          }
        }
      }
  });

  it('v2 ikon/sprite çizimleri hatasız üretilir (hata veren çizim null döner, oyun çökmez)', () => {
    for (const [key, file] of Object.entries(ICONS_V2)) {
      for (const n of Object.keys(file.ICONS)) expect(v2IconOf(key, n)?.cells(), `${key} ikon ${n}`).not.toBeNull();
      for (const n of Object.keys(file.SPRITES)) expect(resolveSprite(v2SpriteName(key, n)).cells(), `${key} sprite ${n}`).not.toBeNull();
    }
  });
});

describe('sürüm çözümleme', () => {
  const ds = content.skills.melee_attack!; // Warrior'ın ilk skill'i
  const whirl = content.skills.whirlwind!;

  it('varsayılan v1; v2 seçilince sahibin ikonu v2 (yüksek çözünürlük), çıplak ad daima v1', () => {
    withV2('warrior', { icons: { [ds.icon]: DRAW } }, () => {
      expect(getVersion('warrior')).toBe('v1');
      expect(resolveSprite(ds.icon, 'warrior')).toMatchObject({ version: 'v1', key: ds.icon, size: GRID });
      setVersion('warrior', 'v2');
      expect(wantsV2('warrior', 'icon')).toBe(true);
      const r = resolveSprite(ds.icon, 'warrior');
      expect(r).toMatchObject({ version: 'v2', key: v2SpriteName('warrior', ds.icon), size: V2_DEFAULT_SIZE });
      const cells = r.cells()!;
      expect(cells).toHaveLength(V2_DEFAULT_SIZE);
      for (const row of cells) expect(row).toHaveLength(V2_DEFAULT_SIZE);
      // sahipsiz (arayüz) çağrı v2'ye sızmaz; başka class'ın seçimi etkilemez
      expect(resolveSprite(ds.icon)).toMatchObject({ version: 'v1', key: ds.icon });
      expect(resolveSprite(ds.icon, 'paladin').version).toBe('v1');
    });
  });

  it('v2 karşılığı olmayan öğe v1 e düşer (karışık sürüm çökmez)', () => {
    const v2Icons = { [ds.icon]: DRAW, [whirl.icon]: null };
    const v2Vfx = { [ds.vfx!]: VFX_FN, [whirl.vfx!]: null, [whirl.id]: null };
    withV2('warrior', { icons: v2Icons, vfx: v2Vfx, sfx: { axeChop: NOISE, chargeRush: null } }, () => {
      setAllVersions('v2');
      expect(resolveSprite(whirl.icon, 'warrior')).toMatchObject({ version: 'v1', key: whirl.icon });
      expect(resolveSprite(whirl.icon, 'warrior').cells()).not.toBeNull();
      expect(selectSkillVfx(whirl)).toMatchObject({ version: 'v1', owner: 'warrior' });
      expect(resolveSfx('chargeRush', 'warrior')).toBe(SFX.chargeRush);
      // var olan v2 öğeleri v2
      expect(selectSkillVfx(ds)).toMatchObject({ version: 'v2', v2: VFX_FN });
      expect(resolveSfx('axeChop', 'warrior')).toBe(NOISE);
      // v1 seçilince yine v1
      setVersion('warrior', 'v1');
      expect(selectSkillVfx(ds).version).toBe('v1');
      expect(resolveSfx('axeChop', 'warrior')).toBe(SFX.axeChop);
      // bilinmeyen ad: v1 (cells null: çağıran yer tutucu çizer)
      expect(resolveSprite('no_such_icon', 'warrior').cells()).toBeNull();
    });
  });

  it('vfx i olmayan skill de (Radiance gibi) v2 efekti skill id siyle eşlenir', () => {
    const plain = Object.values(content.skills).find((s) => !s.vfx && ownerOfSkill(s.id) && inScope(ownerOfSkill(s.id)!, 'vfx'));
    if (!plain) return;
    const owner = ownerOfSkill(plain.id)!;
    withV2(owner, { vfx: { [plain.id]: VFX_FN } }, () => {
      setVersion(owner, 'v2');
      expect(selectSkillVfx(plain)).toMatchObject({ version: 'v2', v2: VFX_FN });
    });
  });

  it('v2 efektinin yeni ses adı yalnızca sahibi v2 iken çalınabilir', () => {
    withV2('warrior', { sfx: { testOnlyNewSound: NOISE } }, () => {
      expect(skillSfxAllowed(ds, ds.sfx![0]!)).toBe(true);
      expect(skillSfxAllowed(ds, 'testOnlyNewSound')).toBe(false);
      setVersion('warrior', 'v2');
      expect(skillSfxAllowed(ds, 'testOnlyNewSound')).toBe(true);
      expect(skillSfxAllowed(ds, 'nonexistent')).toBe(false);
    });
  });

  it('çağrılar sahibinin sürümünü izler (Skeleton -> Undead, Treant -> Druid)', () => {
    expect(ownerOfUnit('skeleton')).toBe('undead');
    expect(ownerOfUnit('treant')).toBe('druid');
    expect(ownerOfUnit('enemy_archer')).toBe('archer');
    for (const sid of content.summons.skeleton!.skills) expect(ownerOfSkill(sid)).toBe('undead');
    for (const sid of content.summons.treant!.skills) expect(ownerOfSkill(sid)).toBe('druid');
    expect(ownedArt('undead').icons).toContain(content.summons.skeleton!.logo);
    const sk = content.skills[content.summons.skeleton!.skills[0]!]!;
    const id = sk.sfx![0]!;
    withV2('undead', { sfx: { [id]: NOISE }, icons: { [sk.icon]: DRAW } }, () => {
      expect(resolveSfx(id, ownerOfUnit('skeleton'))).toBe(SFX[id]);
      setVersion('undead', 'v2');
      expect(resolveSfx(id, ownerOfUnit('skeleton'))).toBe(NOISE);
      expect(resolveSprite(sk.icon, ownerOfSkill(sk.id)).version).toBe('v2');
      expect(resolveSfx(id)).toBe(SFX[id]); // sahipsiz: v1
    });
  });

  it('kapsam: Cutthroat seçilemez, Defender ikon/vfx v2 olmaz ama sesi olur', () => {
    setVersion('cutthroat', 'v2');
    expect(getVersion('cutthroat')).toBe('v1');
    setVersion('defender', 'v2');
    expect(wantsV2('defender', 'icon')).toBe(false);
    expect(wantsV2('defender', 'vfx')).toBe(false);
    expect(wantsV2('defender', 'sfx')).toBe(true);
  });

  it('toplu seçim ve karışık durum', () => {
    expect(allVersionsState()).toBe('v1');
    setVersion('mage', 'v2');
    expect(allVersionsState()).toBe('mixed');
    setAllVersions('v2');
    expect(allVersionsState()).toBe('v2');
    for (const k of versionKeys()) expect(getVersion(k)).toBe('v2');
  });
});

describe('seçim kalıcılığı (localStorage)', () => {
  it('seçim depoya yazılır ve yeniden okununca geri gelir', () => {
    const s = fakeStorage();
    useStorage(s);
    setVersion('archer', 'v2');
    expect(JSON.parse(s.data[VERSIONS_STORAGE_KEY]!)).toEqual({ archer: 'v2' });
    reloadVersions();
    expect(getVersion('archer')).toBe('v2');
    setVersion('archer', 'v1');
    expect(JSON.parse(s.data[VERSIONS_STORAGE_KEY]!)).toEqual({});
  });

  it('bozuk JSON, geçersiz değerler, okuma/yazma hatası ve depolama yokluğu çökertmez (hepsi v1)', () => {
    useStorage(fakeStorage({ [VERSIONS_STORAGE_KEY]: '{bozuk json' }));
    expect(getVersion('warrior')).toBe('v1');
    useStorage(fakeStorage({ [VERSIONS_STORAGE_KEY]: JSON.stringify({ warrior: 'v9', mage: 42, archer: 'v2' }) }));
    expect(getVersion('warrior')).toBe('v1');
    expect(getVersion('mage')).toBe('v1');
    expect(getVersion('archer')).toBe('v2');
    useStorage(fakeStorage({ [VERSIONS_STORAGE_KEY]: '[1,2]' }));
    expect(getVersion('warrior')).toBe('v1');
    useStorage(fakeStorage({}, { throwGet: true, throwSet: true }));
    expect(getVersion('warrior')).toBe('v1');
    expect(() => setVersion('warrior', 'v2')).not.toThrow();
    expect(getVersion('warrior')).toBe('v2'); // yalnızca bu oturum
    useStorage(undefined);
    expect(getVersion('warrior')).toBe('v1');
    expect(() => setVersion('warrior', 'v2')).not.toThrow();
  });

  it('persist=false (gömülü sahne ?ver=) depoya yazmaz', () => {
    const s = fakeStorage();
    useStorage(s);
    setAllVersions('v2', false);
    expect(getVersion('druid')).toBe('v2');
    expect(s.data[VERSIONS_STORAGE_KEY]).toBeUndefined();
  });
});

describe('yüksek çözünürlük (piksel art motoru)', () => {
  it('PxGrid boyutu parametreli: 128 lik ızgarada mantıksal koordinat 4 ince piksel, kontur 2 piksel', () => {
    const p = new PxGrid(128);
    expect(p.size).toBe(128);
    expect(p.k).toBe(4);
    p.rect(8, 8, 16, 16, 'r').outline();
    const rows = p.rows();
    expect(rows).toHaveLength(128);
    expect(rows[32]![30]).toBe('o');
    expect(rows[32]![31]).toBe('o');
    expect(rows[32]![32]).toBe('r');
    expect(rows[32]![29]).toBe('.');
    // ham piksel uzayı
    const raw = new PxGrid(96, 96);
    raw.set(10, 10, 'w');
    expect(raw.rows()[10]![10]).toBe('w');
    expect(raw.rows()[10]![11]).toBe('.');
  });

  it('v2 ikon boyutu istenen boyut (varsayılan 128, { size } ile 96); karşılaştırma için seçimden bağımsız çözülür', () => {
    const logo = content.classes.mage!.logo;
    withV2('mage', { icons: { [logo]: DRAW }, sprites: { test_spark: { size: 96, outline: false, draw: DRAW } } }, () => {
      expect(v2IconOf('mage', logo)?.size).toBe(128);
      const spark = resolveSprite(v2SpriteName('mage', 'test_spark'));
      expect(spark).toMatchObject({ version: 'v2', size: 96 });
      expect(spark.cells()).toHaveLength(96);
      expect(v2IconOf('mage', 'no_such')).toBeNull();
    });
  });

  it('v1 dondurulmuştur: var olan ikon/efekt sprite/ses parmak izleri değişmedi (yeni ad eklemek serbest)', () => {
    const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/v1-art-hashes.json'), 'utf8')) as Record<'icons' | 'fx' | 'sfx', Record<string, string>>;
    const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
    for (const [n, h] of Object.entries(fx.icons)) expect(PIXEL_ICONS[n] ? sha(spriteRows(n)) : 'silindi', `v1 ikon ${n}`).toBe(h);
    for (const [n, h] of Object.entries(fx.fx)) expect(PIXEL_FX[n] ? sha(spriteRows(n)) : 'silindi', `v1 efekt sprite ${n}`).toBe(h);
    const sfx = audio.sfx as Record<string, unknown>;
    for (const [n, h] of Object.entries(fx.sfx)) expect(sfx[n] ? sha(sfx[n]) : 'silindi', `v1 ses ${n}`).toBe(h);
  });
});

describe('ilerleme ve wiki karşılaştırması', () => {
  it('v2 ilerleme sayıları ve etiket: boşsa "v2 (empty)", değilse "v2 · hazır/toplam"', () => {
    for (const k of versionKeys()) {
      const p = v2Progress(k);
      expect(p.total, k).toBe(p.icon.total + p.vfx.total + p.sfx.total);
      expect(v2Label(k), k).toBe(p.ready === 0 && p.extra === 0 ? 'v2 (empty)' : `v2 · ${p.ready}/${p.total}`);
    }
    const ds = content.skills.melee_attack!;
    withV2('warrior', { icons: { [ds.icon]: DRAW }, sfx: { [ds.sfx![0]!]: NOISE } }, () => {
      const p = v2Progress('warrior');
      expect(p.icon.items.find((i) => i.name === ds.icon)?.ready).toBe(true);
      expect(p.sfx.items.find((i) => i.name === ds.sfx![0])?.ready).toBe(true);
      expect(v2Label('warrior')).toMatch(/^v2 · \d+\/\d+$/);
    });
    expect(v2Progress('defender').icon.total).toBe(0); // kapsam dışı
    expect(v2Progress('defender').sfx.total).toBeGreaterThan(0);
  });

  it('Wiki > Versions: her anahtar için satır; öğeler versioned etiketli; v2 ye özgü yeni ses ayrı listelenir', () => {
    withV2('warrior', { sfx: { testOnlyNewSound: NOISE } }, () => {
      const rows = buildVersions();
      expect(rows.map((r) => r.key).sort()).toEqual(versionKeys().sort());
      for (const r of rows) for (const i of [...r.icons, ...r.vfx, ...r.sounds]) expect(i.tag).toBe('versioned');
      expect(rows.find((r) => r.key === 'warrior')!.extraSounds).toContain('testOnlyNewSound');
    });
  });

  it('v2 seçmek Legacy yi değiştirmez: v1 öğeleri kullanılmayan/legacy e düşmez', () => {
    const files = { sprites: {}, avatars: {}, spritesOld: {}, concepts: {}, pool: {} };
    const pick = () => buildLegacy(buildCatalog(files), files).groups.filter((x) => ['icon', 'vfx', 'sound'].includes(x.kind)).map((x) => [x.kind, x.items.map((i) => i.id).sort()] as const);
    const before = pick();
    const ds = content.skills.melee_attack!;
    withV2('warrior', { icons: { [ds.icon]: DRAW }, sfx: { [ds.sfx![0]!]: NOISE } }, () => {
      setAllVersions('v2');
      expect(pick()).toEqual(before);
      const legacyIds = new Set(before.flatMap(([, ids]) => ids));
      // sürümlü (v2 karşılığı olan) hiçbir v1 öğesi legacy de değil
      for (const r of buildVersions()) {
        for (const i of r.icons.filter((x) => x.hasV2)) expect(legacyIds.has(i.name), i.name).toBe(false);
        for (const s of r.sounds.filter((x) => x.hasV2)) expect(legacyIds.has(s.id), s.id).toBe(false);
      }
    });
  });
});
