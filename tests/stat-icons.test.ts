import { describe, expect, it } from 'vitest';
import type { StatKind } from '../src/engine';
import { STAT_ICON, STAT_COLOR, statIconFallback, statIconName, type StatIconKind } from '../src/ui/stat-icons';
import { STAT_IMAGE_FILES, statImage } from '../src/game/icon-image-files';
import { resolveSprite } from '../src/game/art-registry';
import { statIcon } from '../src/ui/stat-tips';

// Boyalı stat ikonları (Ömer 2026-10-10): assets/stat-icons/<stat>.png (+ small/), tek kaynak statIconName -> art-registry.
// Tam liste: STAT_ICON Record<StatKind, ...> olduğu için TS her StatKind'ı zorunlu kılar; + Might.
const ALL: StatIconKind[] = [...(Object.keys(STAT_ICON) as StatKind[]), 'might'];

describe('Stat ikonları: her stat (+ Might) boyalı görselle', () => {
  it('her StatKind ve might için 128 ve 64 piksellik görsel var; fazladan dosya yok', () => {
    expect(ALL).toHaveLength(16);
    for (const k of ALL) {
      const f = statImage(k);
      expect(f, `${k}: assets/stat-icons/${k}.png yok`).not.toBeNull();
      expect(f!.small, `${k}: assets/stat-icons/small/${k}.png yok`).not.toBe(f!.url);
    }
    expect(Object.keys(STAT_IMAGE_FILES).sort()).toEqual([...ALL].sort());
  });

  it('statIconName görsele çözülür (yumuşak ölçek, DOM tam boy dosya); kodla çizilen yedek her stat için tanımlı', () => {
    for (const k of ALL) {
      const r = resolveSprite(statIconName(k));
      expect(r.image, k).toBeTruthy();
      expect(r.smooth, k).toBe(true);
      expect(r.domImage, k).toBe(STAT_IMAGE_FILES[k]!.url);
      expect(statIconFallback(k), k).toBeTruthy();
    }
    expect(statIconFallback('might')).toBe('v2:shared:might');
    expect(statIconFallback('hp')).toBe(STAT_ICON.hp);
    // bilinmeyen stat: görsel yok, yedek yok -> çökmez, yer tutucu (cells null)
    expect(resolveSprite('stat:nope').image).toBeUndefined();
  });

  it('Gear / Endless yardımcısı (stat-tips > statIcon) aynı kaynağı kullanır; renk kodlaması değişmez', () => {
    expect(statIcon('hp')).toEqual({ kind: statIconName('hp'), color: STAT_COLOR.hp });
    expect(statIcon('crit')).toEqual({ kind: statIconName('critChance'), color: STAT_COLOR.critChance });
    expect(statIcon('power')?.kind).toBe(statIconName('might'));
    expect(statIcon('nope')).toBeNull();
  });
});
