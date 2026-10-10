import { describe, expect, it } from 'vitest';
import uiData from '../data/audio-ui.json';
import { sfxDuration } from '../src/gallery/catalog';
import { loadUiSoundLevel, UI_AUDIO, UI_SFX, UI_SOUND_KINDS, UiSoundThrottle, uiSound, varySfx, type UiSoundKind } from '../src/ui/ui-sound';

describe('Arayüz sesleri: data/audio-ui.json şekli', () => {
  it('her UiSoundKind için tam bir ses var, fazlası yok', () => {
    expect(Object.keys(uiData.sfx).sort()).toEqual([...UI_SOUND_KINDS].sort());
  });

  it('her ses kısa (40-250 ms), kısık ve adı/açıklaması var', () => {
    for (const k of UI_SOUND_KINDS) {
      const d = UI_SFX[k];
      const dur = sfxDuration(d);
      expect(dur, `${k} süresi ${dur}`).toBeGreaterThanOrEqual(0.04);
      expect(dur, `${k} süresi ${dur}`).toBeLessThanOrEqual(0.25);
      expect(d.gain, k).toBeGreaterThan(0);
      expect(d.gain, k).toBeLessThanOrEqual(1);
      expect(d.label.length, k).toBeGreaterThan(0);
      expect(d.desc.length, k).toBeGreaterThan(10);
      expect(d.layers.length, k).toBeGreaterThan(0);
      for (const l of d.layers) {
        expect(['tone', 'noise', 'pluck', 'voice'], k).toContain(l.type);
        if (l.type === 'tone' || l.type === 'noise') {
          expect(l.attack, k).toBeGreaterThan(0);
          expect(l.decay, k).toBeGreaterThan(0);
          expect(l.gain, k).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(UI_AUDIO.master).toBeGreaterThan(0);
    expect(UI_AUDIO.master).toBeLessThanOrEqual(0.8); // skill seslerinden (master 0.8) fazla değil; Codex ölçümü: varsayılan seviyede ~15-20 dB daha kısık
  });

  it('çan yok: sinüs/üçgen tonlar yalnızca alçak darbe gövdesi (<= 600 Hz) ve kısa (<= 120 ms)', () => {
    for (const k of UI_SOUND_KINDS)
      for (const l of UI_SFX[k].layers)
        if (l.type === 'tone') {
          expect(Math.max(l.f0, l.f1), `${k} tonu çok tiz`).toBeLessThanOrEqual(600);
          expect(l.attack + l.decay, `${k} tonu çınlıyor`).toBeLessThanOrEqual(0.12);
          expect(l.tremHz ?? 0, `${k} titreşimli ton`).toBe(0);
        }
  });

  it('varsayılan: açık, orta seviye; kayıt yoksa o döner', () => {
    expect(UI_AUDIO.defaultLevel).toBeGreaterThan(0);
    expect(UI_AUDIO.defaultLevel).toBeLessThan(20); // 20 adım ölçeği (src/ui/volume-steps.ts)
    expect(loadUiSoundLevel()).toBe(UI_AUDIO.defaultLevel);
  });

  it('kullanıcı hareketinden önce (ve Node da) uiSound sessizce hiçbir şey yapmaz', () => {
    for (const k of UI_SOUND_KINDS) expect(() => uiSound(k)).not.toThrow();
  });
});

describe('Arayüz sesleri: seyreltme', () => {
  it('hover: fare hızla gezinse de throttleMs.hover içinde ikinci kez çalmaz', () => {
    const t = new UiSoundThrottle();
    const gap = UI_AUDIO.throttleMs['hover']!;
    let played = 0;
    for (let ms = 0; ms < 1000; ms += 10) if (t.allow('hover', ms)) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil(1000 / gap));
    expect(played).toBeGreaterThan(1);
  });

  it('aynı tür ses default aralıktan sık çalmaz; farklı türler birbirini engellemez', () => {
    const t = new UiSoundThrottle();
    const gap = UI_AUDIO.throttleMs.default;
    expect(t.allow('select', 0)).toBe(true);
    expect(t.allow('select', gap - 1)).toBe(false);
    expect(t.allow('select', gap)).toBe(true);
    expect(t.allow('open', gap)).toBe(true);
    expect(t.allow('confirm', gap + 1)).toBe(true);
  });

  it('tık/açılıştan hemen sonra hover susar, sonra yeniden çalar', () => {
    const t = new UiSoundThrottle();
    expect(t.allow('confirm', 1000)).toBe(true);
    expect(t.allow('hover', 1000 + UI_AUDIO.hoverQuietMs - 1)).toBe(false);
    expect(t.allow('hover', 1000 + UI_AUDIO.hoverQuietMs)).toBe(true);
  });

  it('hover başka bir sesi engellemez', () => {
    const t = new UiSoundThrottle();
    expect(t.allow('hover', 0)).toBe(true);
    expect(t.allow('select', 1)).toBe(true);
  });
});

describe('Arayüz sesleri: çalış başına sapma', () => {
  it('frekans ±vary.freq, kazanç en çok vary.gain kadar düşer; katman sayısı/zamanlaması aynı', () => {
    for (const k of UI_SOUND_KINDS as readonly UiSoundKind[]) {
      const d = UI_SFX[k];
      for (const r of [0, 0.5, 0.999]) {
        const v = varySfx(d, () => r);
        expect(v.layers.length).toBe(d.layers.length);
        expect(v.gain).toBeLessThanOrEqual(d.gain);
        expect(v.gain).toBeGreaterThanOrEqual(d.gain * (1 - UI_AUDIO.vary.gain) - 1e-9);
        v.layers.forEach((l, i) => {
          const o = d.layers[i]!;
          expect(l.at ?? 0).toBe(o.at ?? 0);
          if ((l.type === 'tone' || l.type === 'noise') && (o.type === 'tone' || o.type === 'noise')) {
            expect(l.f0 / o.f0).toBeGreaterThanOrEqual(1 - UI_AUDIO.vary.freq - 1e-9);
            expect(l.f0 / o.f0).toBeLessThanOrEqual(1 + UI_AUDIO.vary.freq + 1e-9);
          }
        });
      }
    }
  });
});
