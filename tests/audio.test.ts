import { describe, expect, it } from 'vitest';
import audio from '../data/audio.json';
import { content } from '../src/engine';
import { SFX, SFX_IDS } from '../src/game/audio';

describe('ses efektleri (data/audio.json)', () => {
  it('skill verisindeki her ses tanımlı; tanımlı her ses en az bir skill tarafından kullanılıyor', () => {
    const used = new Set<string>();
    for (const [id, s] of Object.entries(content.skills)) for (const k of s.sfx ?? []) {
      expect(SFX_IDS, `${id} -> ${k}`).toContain(k);
      used.add(k);
    }
    // yedek: Holy Strike'ın eski (düşen kılıç) animasyonunun sesleri ve Charge'ın eski sesleri, silinmedi
    // yedek: Defender'ın eski (rework öncesi) sesleri; armorLeap: Fist Crush artık yürümüyor/sıçramıyor (madde 239)
    const backup = ['swordWhoosh', 'swordStab', 'armorCharge', 'armorCrash', 'stunChime', 'warShout', 'testudo', 'effortHah', 'armorStomp', 'punchImpact', 'armorLeap',
      // yedek: kaldırılan Blood Rite'ın sesi (Dark Bond ile değişti; Wiki > Legacy)
      'clawRake'];
    for (const k of SFX_IDS) if (!backup.includes(k)) expect(used.has(k), `kullanılmayan ses: ${k}`).toBe(true);
  });

  it('tüm sınıfların ve çağrıların skilleri seslendirilmiş', () => {
    for (const def of [...Object.values(content.classes), ...Object.values(content.summons)]) {
      for (const id of def.skills.slice(0, 4)) expect(content.skills[id]!.sfx?.length, `${def.id} ${id}`).toBeGreaterThan(0);
    }
  });

  it('her ses katmanı geçerli (tür, süre, frekans, kazanç)', () => {
    expect(audio.master).toBeGreaterThan(0);
    expect(audio.master).toBeLessThanOrEqual(1);
    for (const [id, def] of Object.entries(SFX)) {
      expect(def.gain, id).toBeGreaterThan(0);
      expect(def.layers.length, id).toBeGreaterThan(0);
      for (const l of def.layers) {
        expect(['tone', 'noise', 'voice', 'pluck'], id).toContain(l.type);
        if (l.type === 'voice') {
          expect(l.duration).toBeGreaterThan(0.2); // kısa bağırışlar (Taunt, Tremor Slam) dahil
          expect(l.duration).toBeLessThan(3);
          expect(l.volume).toBeLessThanOrEqual(1);
          expect(l.formants).toHaveLength(3);
        } else if (l.type === 'pluck') {
          expect(l.f, id).toBeGreaterThan(20);
          expect(l.fb, id).toBeGreaterThan(0);
          expect(l.fb, id).toBeLessThan(1);
          expect(l.duration, id).toBeGreaterThan(0);
          expect(l.gain, id).toBeGreaterThan(0);
        } else {
          expect(l.f0, id).toBeGreaterThan(20);
          expect(l.f1, id).toBeGreaterThan(20);
          expect(l.decay, id).toBeGreaterThan(0);
          expect(l.attack, id).toBeGreaterThanOrEqual(0);
          expect(l.gain, id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('Abyssal Cry çığlığı: cinsiyetsiz bant (erkek ~120 Hz ile kadın ~220 Hz konuşmasının üstü), boğuk ve korkunç', () => {
    expect(content.skills.abyssal_cry!.sfx).toContain('scream');
    const v = SFX.scream!.layers[0]!;
    if (v.type !== 'voice') throw new Error('çığlık voice katmanı olmalı');
    for (const f of [v.f0Start, v.f0End]) {
      expect(f).toBeGreaterThanOrEqual(200);
      expect(f).toBeLessThanOrEqual(520);
    }
    expect(v.f0Peak).toBeGreaterThan(v.f0Start);
    expect(v.f0Peak).toBeLessThanOrEqual(900);
    expect(v.growl.octave).toBeLessThan(1); // alt oktav hırıltı: korkunç
    expect(v.growl.gain).toBeGreaterThan(0);
    expect(v.lowpass).toBeLessThan(4000); // boğuk
    expect(v.raspDepth).toBeGreaterThan(0.3); // gırtlak titremesi
  });
});
