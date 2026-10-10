import { describe, expect, it } from 'vitest';
import {
  MUSIC,
  barSec,
  chordScale,
  composeCycle,
  cycleSec,
  drumSamples,
  fluteSamples,
  midiFreq,
  noteMidi,
  parseBar,
  parseChord,
  pluckSamples,
  reverbImpulse,
  type MusicEvent,
} from '../src/game/music';
import { DEFAULT_MUSIC_LEVEL, loadMusicLevel, musicGain } from '../src/ui/music';

const SR = 44100;
const pc = (m: number) => ((m % 12) + 12) % 12;
const peakOf = (d: Float32Array) => d.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
const allFinite = (d: Float32Array) => d.every((x) => Number.isFinite(x));

describe('Ana menü müziği: veri ve beste (data/audio-music.json, src/game/music.ts)', () => {
  it('nota ve akor çözümleme', () => {
    expect(noteMidi('A4')).toBe(69);
    expect(noteMidi('D5')).toBe(74);
    expect(noteMidi('C#5')).toBe(73);
    expect(noteMidi('Bb4')).toBe(70);
    expect(midiFreq(69)).toBeCloseTo(440);
    expect(parseChord('Dm').pcs).toEqual([2, 5, 9]);
    expect(parseChord('Bb').pcs).toEqual([10, 2, 5]);
    // Dorian (B doğal); Bb akorunda Aeolian rengi (B -> Bb); A majörde C#
    expect(chordScale('Dm')).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(chordScale('Bb')).toContain(10);
    expect(chordScale('Bb')).not.toContain(11);
    expect(chordScale('A')).toContain(1);
  });

  it('her bölümün akorları geçerli, tema ölçüleri tam 3 vuruş ve akor ölçeğinin içinde', () => {
    for (const [name, sec] of Object.entries(MUSIC.sections)) {
      for (const c of sec.chords) expect(() => parseChord(c), `${name}: ${c}`).not.toThrow();
      expect(MUSIC.harpPatterns[sec.harp], `${name} arp kalıbı`).toBeDefined();
      if (sec.drum) expect(MUSIC.drumPatterns[sec.drum], `${name} davul`).toBeDefined();
      if (sec.melody?.startsWith('theme:')) {
        const bars = MUSIC.themes[sec.melody.slice(6)]!;
        expect(bars.length, `${name} tema ölçü sayısı`).toBe(sec.chords.length);
        bars.forEach((b, i) => {
          const notes = parseBar(b);
          expect(notes.reduce((s, n) => s + n.beats, 0), `${name} ölçü ${i + 1}`).toBeCloseTo(MUSIC.beatsPerBar);
          for (const n of notes) expect(chordScale(sec.chords[i]!), `${name} ölçü ${i + 1} ${b}`).toContain(pc(n.midi));
        });
      }
    }
    for (const f of MUSIC.form) expect(MUSIC.sections[f], f).toBeDefined();
  });

  it('döngü 60-90 sn sürer; seviye varsayılanı ~%60', () => {
    expect(cycleSec()).toBeGreaterThanOrEqual(60);
    expect(cycleSec()).toBeLessThanOrEqual(90);
    expect(DEFAULT_MUSIC_LEVEL).toBe(12); // 20 adımda %60
    expect(loadMusicLevel()).toBe(12); // node: localStorage yok -> varsayılan
    expect(musicGain(0, 7)).toBe(0); // 0 = tamamen kapalı
    expect(musicGain(12, 0)).toBe(0); // ana ses kapalıysa müzik de
    expect(musicGain(20, 20)).toBe(1);
    expect(musicGain(12, 14)).toBeCloseTo(0.6 * 0.7);
  });

  it('beste belirleyici, sıralı, sonlu; flüt notaları akor ölçeğinde ve aralıkta; çalgıların hepsi var', () => {
    const L = cycleSec();
    const bar = barSec();
    const chordAt = (t: number): string => {
      let b = Math.floor(t / bar + 1e-6);
      for (const f of MUSIC.form) {
        const n = MUSIC.sections[f]!.chords.length;
        if (b < n) return MUSIC.sections[f]!.chords[b]!;
        b -= n;
      }
      return MUSIC.sections[MUSIC.form.at(-1)!]!.chords.at(-1)!;
    };
    for (let k = 0; k < 6; k++) {
      const ev = composeCycle(k);
      expect(composeCycle(k)).toEqual(ev);
      const kinds = new Set(ev.map((e) => e.kind));
      for (const want of ['harp', 'pad', 'flute', 'drum']) expect(kinds.has(want as MusicEvent['kind']), `döngü ${k}: ${want}`).toBe(true);
      let last = -1;
      for (const e of ev) {
        expect(Number.isFinite(e.t)).toBe(true);
        expect(e.t).toBeGreaterThanOrEqual(last);
        expect(e.t).toBeLessThan(L);
        last = e.t;
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1.2);
        if (e.kind === 'flute') {
          expect(e.dur).toBeGreaterThan(0);
          expect(e.midi).toBeGreaterThanOrEqual(noteMidi('D4') - 1);
          expect(e.midi).toBeLessThanOrEqual(noteMidi('A5') + 2);
          expect(chordScale(chordAt(e.t + 0.02)), `döngü ${k} t=${e.t.toFixed(2)} midi ${e.midi}`).toContain(pc(e.midi));
        }
        if (e.kind === 'harp') expect(e.midi).toBeGreaterThanOrEqual(36);
      }
    }
  });

  it('döngüler birbirinin aynısı değil (çeşitleme)', () => {
    const mel = (k: number) => composeCycle(k).filter((e) => e.kind === 'flute').map((e) => (e.kind === 'flute' ? e.midi : 0)).join(',');
    const set = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(mel));
    expect(set.size).toBe(8);
  });
});

describe('Ana menü müziği: çalgı örnekleri (saf JS sentez)', () => {
  it('Karplus-Strong tel: sonlu, tepe <= 1, sönüyor, perde doğru', () => {
    for (const midi of [38, 50, 62, 74]) {
      const f = midiFreq(midi);
      const d = pluckSamples(f, SR, 2.4, 0.55, 0.18, midi);
      expect(allFinite(d)).toBe(true);
      expect(peakOf(d)).toBeLessThanOrEqual(1.0001);
      expect(peakOf(d)).toBeGreaterThan(0.5);
      const head = peakOf(d.subarray(0, SR * 0.2));
      const tail = peakOf(d.subarray(Math.floor(SR * 2.0), Math.floor(SR * 2.3)));
      expect(tail).toBeLessThan(head * 0.1);
      // perde: öz ilinti (0,3 sn'den 4096 örnek); en iyi gecikme periyoda yakın
      const seg = d.subarray(Math.floor(SR * 0.3), Math.floor(SR * 0.3) + 4096);
      const P = SR / f;
      let best = 0;
      let bestLag = 0;
      for (let lag = Math.floor(P * 0.6); lag <= Math.ceil(P * 1.4); lag++) {
        let c = 0;
        for (let i = 0; i + lag < seg.length; i++) c += seg[i]! * seg[i + lag]!;
        if (c > best) {
          best = c;
          bestLag = lag;
        }
      }
      expect(Math.abs(bestLag - P), `midi ${midi}`).toBeLessThan(Math.max(1.5, P * 0.02));
    }
  });

  it('flüt, davul, yankı impulsu: sonlu ve tepe < 1', () => {
    const fl = fluteSamples(midiFreq(74), 1.2, SR, MUSIC.voices.flute, 3);
    expect(allFinite(fl)).toBe(true);
    expect(peakOf(fl)).toBeLessThan(1.2);
    expect(peakOf(fl)).toBeGreaterThan(0.5);
    for (const hit of ['dum', 'tek'] as const) {
      const d = drumSamples(hit, SR);
      expect(allFinite(d)).toBe(true);
      expect(peakOf(d)).toBeLessThanOrEqual(1.0001);
    }
    const [l, r] = reverbImpulse(SR, MUSIC.reverb.seconds, MUSIC.reverb.decay, MUSIC.reverb.damp);
    expect(allFinite(l) && allFinite(r)).toBe(true);
    expect(l.length).toBe(Math.round(SR * MUSIC.reverb.seconds));
    expect(peakOf(l.subarray(l.length - 100))).toBeLessThan(0.01);
  });

  it('kuru karışım (arp + flüt + davul, en yüksek seviye): tepe < 1, NaN yok, sessiz değil', () => {
    // Tarayıcıdaki tam grafiğin (ped, drone, yankı, kırpıcı) denetimi renderMusicCheck ile; burada JS örnekleriyle kuru toplam
    const secs = 24;
    const out = new Float32Array(SR * secs);
    const v = MUSIC.voices;
    const cache = new Map<string, Float32Array>();
    const get = (k: string, make: () => Float32Array) => cache.get(k) ?? (cache.set(k, make()), cache.get(k)!);
    for (const e of composeCycle(1).filter((x) => x.t < secs)) {
      let d: Float32Array | null = null;
      let g = 0;
      if (e.kind === 'harp') {
        d = get(`h${e.midi}${e.bass}`, () => pluckSamples(midiFreq(e.midi), SR, e.bass ? v.harp.bassDecay : v.harp.decay, v.harp.bright, v.harp.pick, e.midi));
        g = e.bass ? v.harp.bassGain * e.vel : v.harp.gain * e.vel;
      } else if (e.kind === 'flute') {
        d = get(`f${e.midi}${e.dur}`, () => fluteSamples(midiFreq(e.midi), e.dur, SR, v.flute, e.midi));
        g = v.flute.gain * e.vel;
      } else if (e.kind === 'drum') {
        d = get(e.hit, () => drumSamples(e.hit, SR));
        g = v.drum.gain * e.vel;
      }
      if (!d) continue;
      const at = Math.round(e.t * SR);
      for (let i = 0; i < d.length && at + i < out.length; i++) out[at + i]! += d[i]! * g * MUSIC.master;
    }
    expect(allFinite(out)).toBe(true);
    const pk = peakOf(out);
    expect(pk).toBeLessThan(1);
    expect(pk).toBeGreaterThan(0.05);
    let active = 0;
    for (const x of out) if (Math.abs(x) > 0.001) active++;
    expect(active / out.length).toBeGreaterThan(0.5);
  });
});
