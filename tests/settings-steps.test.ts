import { describe, expect, it } from 'vitest';
import { VOLUME_STEPS, clampStep, readStepLevel, stepFraction, stepRecord, volumeLabel } from '../src/ui/volume-steps';
import { DEFAULT_VOLUME } from '../src/ui/settings';
import { DEFAULT_MUSIC_LEVEL } from '../src/ui/music';
import { UI_AUDIO } from '../src/ui/ui-sound';

// Settings ses kaydırıcıları (Ömer 2026-10-10): %0-100, %5'lik 20 adım; 0 = Off; eski 0-10 kayıtlar en yakın adıma (x2).
describe('Ses kaydırıcıları: 20 adım ve kayıt göçü', () => {
  it('20 adım, %5; yazı Off / 5% / 100%; oran 0..1', () => {
    expect(VOLUME_STEPS).toBe(20);
    expect(volumeLabel(0)).toBe('Off');
    expect(volumeLabel(1)).toBe('5%');
    expect(volumeLabel(13)).toBe('65%');
    expect(volumeLabel(20)).toBe('100%');
    expect(stepFraction(0)).toBe(0);
    expect(stepFraction(10)).toBe(0.5);
    expect(stepFraction(20)).toBe(1);
    expect(clampStep(-4)).toBe(0);
    expect(clampStep(25)).toBe(20);
    expect(clampStep(7.6)).toBe(8);
    expect(clampStep(NaN)).toBe(0);
  });

  it('yeni biçim aynen okunur; eski 0-10 biçimi x2 en yakın adıma; bozuk kayıt varsayılan', () => {
    expect(readStepLevel(stepRecord('volume', 13), 'volume', 14)).toBe(13);
    expect(readStepLevel(stepRecord('level', 0), 'level', 10)).toBe(0);
    expect(readStepLevel('{"volume":7}', 'volume', 14)).toBe(14); // eski Sound volume 7 -> %70
    expect(readStepLevel('{"volume":10}', 'volume', 14)).toBe(20);
    expect(readStepLevel('{"volume":0}', 'volume', 14)).toBe(0);
    expect(readStepLevel('{"level":5}', 'level', 10)).toBe(10); // eski UI sounds 5 -> %50
    expect(readStepLevel('{"level":6}', 'level', 12)).toBe(12); // eski Music 6 -> %60
    expect(readStepLevel('{"level":15}', 'level', 12)).toBe(20); // eski ölçekte aralık dışı: sınırda
    expect(readStepLevel(null, 'level', 12)).toBe(12);
    expect(readStepLevel('', 'level', 12)).toBe(12);
    expect(readStepLevel('not json', 'level', 12)).toBe(12);
    expect(readStepLevel('{"other":3}', 'level', 12)).toBe(12);
    expect(JSON.parse(stepRecord('volume', 9))).toEqual({ volume: 9, steps: 20 });
  });

  it('varsayılanlar eski ölçekteki değerlerin aynısı: Master %70, Music %60, UI sounds %50', () => {
    expect(DEFAULT_VOLUME).toBe(14);
    expect(DEFAULT_MUSIC_LEVEL).toBe(12);
    expect(UI_AUDIO.defaultLevel).toBe(10);
  });
});
