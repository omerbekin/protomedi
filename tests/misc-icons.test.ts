import { describe, expect, it } from 'vitest';
import { MISC_GROUPS, MISC_ICONS, classLogoName, miscIconName, paintedOr } from '../src/ui/misc-icons';
import { MISC_IMAGE_FILES } from '../src/game/icon-image-files';
import { resolveSprite, statusBadge } from '../src/game/art-registry';
import { damageIconKind, damagePaintedIcon } from '../src/game/float-text';
import { elementIcon } from '../src/ui/skill-tags';
import { content } from '../src/engine';

// Boyalı oyun ikonları (Ömer 2026-10-10; 60 ikon, skill ikonları hariç): assets/misc-icons/<grup>/<ad>.png, ad '<grup>:<ad>' -> art-registry.
describe('Oyun ikonları: 60 boyalı görsel, eski kodla çizilen yedek korunur', () => {
  it('beklenen her ikonun 128 ve 64 piksellik dosyası var; fazladan dosya yok', () => {
    const ids = MISC_GROUPS.flatMap((g) => MISC_ICONS[g].map((n) => miscIconName(g, n)));
    expect(ids).toHaveLength(60);
    for (const id of ids) {
      expect(MISC_IMAGE_FILES[id], `${id} yok`).toBeTruthy();
      expect(MISC_IMAGE_FILES[id]!.small, `${id}: small/ yok`).not.toBe(MISC_IMAGE_FILES[id]!.url);
    }
    expect(Object.keys(MISC_IMAGE_FILES).sort()).toEqual([...ids].sort());
  });

  it('ad boyalı görsele çözülür (yumuşak ölçek); görseli olmayan ad yer tutucu, paintedOr eskiye düşer', () => {
    const r = resolveSprite('status:slow');
    expect(r.image).toBeTruthy();
    expect(r.smooth).toBe(true);
    expect(resolveSprite('status:nope').image).toBeUndefined();
    expect(paintedOr('status', 'nope', 'eye')).toBe('eye');
    expect(paintedOr('relic', 'iron_oath', 'shield')).toBe('relic:iron_oath');
  });

  it('durum rozetleri: statuses.json daki her durumun boyalı rozeti var ve sürümün önünde gelir; Doom kendi ikonunu taşır', () => {
    for (const id of Object.keys(content.statuses).filter((k) => MISC_ICONS.status.includes(k))) expect(statusBadge(id, 'eye').name, id).toBe(`status:${id}`);
    for (const id of Object.keys(content.statuses)) if (!MISC_ICONS.status.includes(id)) expect(statusBadge(id, 'roar').name, id).not.toMatch(/^status:/);
    expect(MISC_ICONS.status).toContain('doom');
    expect(MISC_IMAGE_FILES['status:doom']!.url).not.toBe(MISC_IMAGE_FILES['status:omen']!.url);
  });

  it('element, zemin, kritik: yüzen yazı ve skill etiketleri boyalı ikonu, damageIconKind eski piksel adını verir', () => {
    expect(damagePaintedIcon({ element: 'fire' })).toBe('element:fire');
    expect(damageIconKind({ element: 'fire' })).toBe('flame');
    expect(damagePaintedIcon({ origin: 'ground', ground: 'holy_fire', element: 'holy' })).toBe('ground:holy_fire');
    expect(damagePaintedIcon({ origin: 'status', statusId: 'wound' })).toBe('status:wound');
    expect(damagePaintedIcon({ element: 'physical' })).toBeNull();
    for (const el of MISC_ICONS.element) expect(elementIcon(el)).toBe(`element:${el}`);
    expect(elementIcon('physical')).toBe('sword');
  });

  it('sınıf logoları: her seçilebilir sınıfın (Geometer hariç) boyalı amblemi; çağrılar verideki logoyu korur', () => {
    for (const def of Object.values(content.classes)) {
      if (def.id === 'aoe_tester') expect(classLogoName(def)).toBe(def.logo);
      else expect(classLogoName(def), def.id).toBe(`class:${def.id}`);
    }
    for (const def of Object.values(content.summons)) expect(classLogoName(def)).toBe(def.logo);
    expect(classLogoName({ id: 'enemy_warrior', logo: 'helm' })).toBe('class:warrior');
  });
});
