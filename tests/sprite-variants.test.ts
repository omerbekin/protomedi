import { beforeEach, describe, expect, it } from 'vitest';
import { buildCharacters, orphanAssets } from '../src/gallery/catalog';
import { applyVariantFiles, getSpriteVariant, resetSpriteVariantCache, setSpriteVariant, variantLabel, variantsBySprite } from '../src/game/sprite-variants';

const files = {
  sprites: { '../../assets/sprites/hexer/idle.png': '/h.png', '../../assets/sprites/hexer/idle-hood.png': '/hh.png', '../../assets/sprites/mage/idle.png': '/m.png' },
  avatars: { '../../assets/avatars/hexer.png': '/ha.png', '../../assets/avatars/hexer-hood.png': '/hha.png', '../../assets/avatars/mage.png': '/ma.png' },
};

describe('sprite görünüm varyantları', () => {
  beforeEach(() => {
    resetSpriteVariantCache();
  });

  it('idle-<varyant>.png dosyalarından varyantlar bulunur; varyantsız karakter listede yok', () => {
    expect(variantsBySprite(files.sprites)).toEqual({ hexer: ['hood'] });
    expect(variantLabel('hexer', 'hood')).toBe('Hooded');
    expect(variantLabel('hexer', 'default')).toBe('Hoodless');
    expect(variantLabel('mage', 'dark')).toBe('Dark');
  });

  it('seçim yoksa varsayılan (null); depolama yoksa da çökmez', () => {
    expect(getSpriteVariant('hexer')).toBeNull();
    expect(() => setSpriteVariant('hexer', 'hood')).not.toThrow();
    expect(getSpriteVariant('hexer')).toBe('hood');
    expect(getSpriteVariant('enemy_hexer')).toBe('hood');
    setSpriteVariant('hexer', null);
    expect(getSpriteVariant('hexer')).toBeNull();
  });

  it('applyVariantFiles seçili varyantın sprite ve avatarını varsayılanın yerine koyar', () => {
    expect(applyVariantFiles(files, () => null)).toEqual(files);
    const out = applyVariantFiles(files, (id) => (id === 'hexer' ? 'hood' : null));
    expect(out.sprites['../../assets/sprites/hexer/idle.png']).toBe('/hh.png');
    expect(out.avatars['../../assets/avatars/hexer.png']).toBe('/hha.png');
    expect(out.sprites['../../assets/sprites/mage/idle.png']).toBe('/m.png');
    expect(files.sprites['../../assets/sprites/hexer/idle.png']).toBe('/h.png');
  });

  it('varyant dosyaları Legacy/orphan sayılmaz: sahibi olan karakterin alternatif görünümü olarak listelenir', () => {
    const f = {
      sprites: { '../../assets/sprites/mage/idle.png': '/m.png', '../../assets/sprites/mage/idle-hood.png': '/mh.png', '../../assets/sprites/nobody/idle-hood.png': '/n.png' },
      avatars: { '../../assets/avatars/mage.png': '/ma.png', '../../assets/avatars/mage-hood.png': '/mha.png', '../../assets/avatars/mage-dark.png': '/x.png' },
      spritesOld: {},
    };
    const o = orphanAssets(f);
    expect(o.avatars).toEqual(['mage-dark']); // idle-dark.png yok: sahipsiz
    expect(o.sprites).toEqual(['nobody']);
    const mage = buildCharacters(f).find((c) => c.spriteId === 'mage')!;
    expect(mage.variants).toEqual([{ variant: 'hood', idleUrl: '/mh.png', avatarUrl: '/mha.png' }]);
    expect(mage.idleUrl).toBe('/m.png');
  });
});
