import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { UI_ICON_FALLBACK, UI_ICON_KINDS, globalIconName, uiIconFallback, uiIconName } from '../src/ui/ui-icons';
import { UI_IMAGE_FILES, uiImage } from '../src/game/icon-image-files';
import { resolveSprite } from '../src/game/art-registry';
import { content } from '../src/engine';

// Boyalı arayüz ikonları (Ömer 2026-10-10): assets/ui-icons/<ad>.png (+ small/), tek kaynak uiIconName -> art-registry 'ui:<ad>'.
describe('Arayüz ikonları: her kavram boyalı görselle, kodla çizilen yedek korunur', () => {
  it('her UiIconKind için 128 ve 64 piksellik görsel var; fazladan dosya yok', () => {
    expect(UI_ICON_KINDS).toHaveLength(16);
    for (const k of UI_ICON_KINDS) {
      const f = uiImage(k);
      expect(f, `${k}: assets/ui-icons/${k}.png yok`).not.toBeNull();
      expect(f!.small, `${k}: assets/ui-icons/small/${k}.png yok`).not.toBe(f!.url);
    }
    expect(Object.keys(UI_IMAGE_FILES).sort()).toEqual([...UI_ICON_KINDS].sort());
  });

  it('uiIconName görsele çözülür (yumuşak ölçek, DOM tam boy dosya); eskiden kodla çizilen yerlerin yedeği duruyor', () => {
    for (const k of UI_ICON_KINDS) {
      const r = resolveSprite(uiIconName(k));
      expect(r.image, k).toBeTruthy();
      expect(r.smooth, k).toBe(true);
      expect(r.domImage, k).toBe(UI_IMAGE_FILES[k]!.url);
    }
    // eskiden kodla çizilen ikonların yedeği (görsel silinirse aynısı döner)
    expect(UI_ICON_FALLBACK.rage).toBe('flame');
    expect(UI_ICON_FALLBACK.cooldown).toBe('hourglass');
    for (const g of Object.values(content.globalSkills)) expect(uiIconFallback(g.kind === 'skip' ? 'skip' : g.kind), g.id).toBe(g.icon);
    // bilinmeyen ad: görsel yok, yedek yok -> çökmez, yer tutucu
    expect(resolveSprite('ui:nope').image).toBeUndefined();
  });

  it('Rest / Skip Turn / Move düğmeleri boyalı ikonu kullanır', () => {
    expect(globalIconName(content.globalSkills.rest!)).toBe(uiIconName('rest'));
    expect(globalIconName(content.globalSkills.skip_turn!)).toBe(uiIconName('skip'));
    expect(globalIconName(content.globalSkills.move_tile!)).toBe(uiIconName('move'));
  });
});

describe('Yükleme ekranı arka planı (public/loading)', () => {
  it('webp ~1600 px ve 200 KB altında; index.html satır içi bulanık yer tutucu ve ön yükleme taşıyor', () => {
    const f = 'public/loading/loading-bg.webp';
    expect(existsSync(f)).toBe(true);
    expect(statSync(f).size).toBeLessThan(200 * 1024);
    expect(existsSync('assets/source/loading/loading-bg.png')).toBe(true);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/\/\*boot-ph\*\/url\(data:image\/webp;base64,[A-Za-z0-9+/=]{40,}\)\/\*boot-ph\*\//);
    expect(html).toContain('rel="preload" as="image" type="image/webp" href="./loading/loading-bg.webp"');
    expect(html).toContain("new URL('loading/loading-bg.webp', document.baseURI)");
  });
});
