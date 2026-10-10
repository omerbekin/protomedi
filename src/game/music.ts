import musicData from '../../data/audio-music.json';

/**
 * Ana menü müziği (Ömer 2026-10-10): dosya yok, WebAudio ile kodla bestelenir ve çalınır. Ayrı kod parçasındadır (src/ui/music.ts
 * ilk gerektiğinde dynamic import ile indirir). İki katman:
 *  1) Beste (SAF, testli): `composeCycle(k)` k. döngünün olay listesini üretir (lavta/arp, bas, akor pedi, davul, flüt ezgisi).
 *     Akorlar ve temalar `data/audio-music.json`'dan; döngü numarası tohumdur: süslemeler, üretilen ezgiler, insan eli sapmaları
 *     her döngüde farklı ama belirleyici (aynı k = aynı müzik).
 *  2) Ses (WebAudio): telli çalgı Karplus-Strong ile JS'te örneklenir (`pluckSamples`; DelayNode döngüsü 128 örnekten kısa gecikme
 *     yapamadığı için tiz teller JS'te), flüt ve davul da JS örneği; drone ve ped osilatör + alçak geçiren; yankı ConvolverNode
 *     (üretilmiş impuls); en sonda yumuşak kırpıcı (tanh) tepe 1'i asla geçmesin. `MusicEngine` olayları ileriye bakarak zamanlar.
 */

// ---------------------------------------------------------------- veri

export interface MusicVoices {
  harp: { gain: number; decay: number; bassDecay: number; bassGain: number; bright: number; pick: number; pan: number };
  flute: { gain: number; attack: number; release: number; vibratoHz: number; vibratoCents: number; vibratoDelay: number; h2: number; h3: number; breath: number; chiff: number; pan: number; lowGain: number };
  pad: { gain: number; attack: number; release: number; detuneCents: number; cutoff: number; octave: number };
  drone: { gain: number; notes: string[]; cutoff: number; lfoHz: number; lfoDepth: number; attack: number };
  drum: { gain: number; dumAt: number; pan: number };
}

export interface SectionDef {
  chords: string[];
  harp: string;
  bass?: boolean;
  pad?: number;
  drum?: string | null;
  drumLast?: string;
  /** null = ezgi yok; 'theme:<ad>' = elle yazılmış tema; 'gen:high' / 'gen:low' = döngüye özgü üretilen ezgi. */
  melody?: string | null;
  /** Temaya süsleme olasılığı (0..1; dönüş, geçiş notası). */
  ornament?: number;
}

export interface MusicConfig {
  bpm: number;
  beatsPerBar: number;
  tonic: string;
  mode: 'dorian' | 'aeolian';
  master: number;
  defaultLevel: number;
  fadeInMs: number;
  fadeOutMs: number;
  humanize: { timingMs: number; velocity: number };
  reverb: { seconds: number; decay: number; damp: number; wet: number; dry: number };
  softClip: number;
  voices: MusicVoices;
  harpPatterns: Record<string, Array<number | null>>;
  drumPatterns: Record<string, number[]>;
  themes: Record<string, string[]>;
  melodyRange: Record<'high' | 'low', [string, string]>;
  rhythms: Record<'high' | 'low' | 'cadence', number[][]>;
  sections: Record<string, SectionDef>;
  form: string[];
  cycles: Array<Record<string, Partial<SectionDef>>>;
}

export const MUSIC = musicData as unknown as MusicConfig;

// ---------------------------------------------------------------- nota / akor yardımcıları (saf)

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MODES: Record<MusicConfig['mode'], number[]> = { dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10] };

/** 'C#5' / 'Bb4' -> MIDI numarası. */
export function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Bad note: ${name}`);
  return PC[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

export const midiFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const pcOf = (m: number): number => ((m % 12) + 12) % 12;

/** 'Dm' / 'Bb' / 'C#m' -> kök perde sınıfı + akor perde sınıfları (kök, üçlü, beşli). */
export function parseChord(name: string): { root: number; pcs: number[]; minor: boolean } {
  const m = /^([A-G])(#|b)?(m)?$/.exec(name);
  if (!m) throw new Error(`Bad chord: ${name}`);
  const root = pcOf(PC[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
  const minor = m[3] === 'm';
  return { root, minor, pcs: [root, pcOf(root + (minor ? 3 : 4)), pcOf(root + 7)] };
}

/** Akorun ölçeği: kip ölçeği; akorda ölçek dışı bir perde varsa (Bb, C#) AYNI HARFLİ ölçek basamağının yerine geçer (B -> Bb, C -> C#). Sıralı perde sınıfları. */
export function chordScale(chord: string, cfg: MusicConfig = MUSIC): number[] {
  const L = 'CDEFGAB';
  const tonicLetter = L.indexOf(cfg.tonic[0]!);
  const tonic = pcOf(PC[cfg.tonic[0]!]! + (cfg.tonic[1] === '#' ? 1 : cfg.tonic[1] === 'b' ? -1 : 0));
  const scale = MODES[cfg.mode].map((d) => pcOf(tonic + d));
  const rootLetter = L.indexOf(chord[0]!);
  parseChord(chord).pcs.forEach((p, i) => {
    if (scale.includes(p)) return;
    const letter = (rootLetter + i * 2) % 7; // kök, üçlü (+2 harf), beşli (+4 harf)
    scale[(letter - tonicLetter + 7) % 7] = p;
  });
  return scale.sort((a, b) => a - b);
}

/** Tema ölçüsü 'A4:1 D5:1.5' -> [{midi, beats}]. */
export function parseBar(bar: string): Array<{ midi: number; beats: number }> {
  return bar
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, b] = tok.split(':');
      return { midi: noteMidi(n!), beats: Number(b) };
    });
}

/** Belirleyici rastgele (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- beste (saf)

export type MusicEvent =
  | { kind: 'harp'; t: number; midi: number; vel: number; bass?: boolean }
  | { kind: 'flute'; t: number; midi: number; dur: number; vel: number; low?: boolean }
  | { kind: 'drum'; t: number; hit: 'dum' | 'tek'; vel: number }
  | { kind: 'pad'; t: number; midis: number[]; dur: number; vel: number };

export const beatSec = (cfg: MusicConfig = MUSIC): number => 60 / cfg.bpm;
export const barSec = (cfg: MusicConfig = MUSIC): number => beatSec(cfg) * cfg.beatsPerBar;
export const cycleBars = (cfg: MusicConfig = MUSIC): number => cfg.form.reduce((n, s) => n + cfg.sections[s]!.chords.length, 0);
/** Bir döngünün süresi (sn). */
export const cycleSec = (cfg: MusicConfig = MUSIC): number => cycleBars(cfg) * barSec(cfg);

/** k. döngüde bölümün geçerli tanımı (bölüm + döngü değişikliği). */
export function sectionFor(name: string, k: number, cfg: MusicConfig = MUSIC): SectionDef {
  const over = cfg.cycles.length ? cfg.cycles[k % cfg.cycles.length]?.[name] : undefined;
  return { ...cfg.sections[name]!, ...(over ?? {}) };
}

/** Kök + kip: akorun ses yerleşimi (arp kalıbı dizinleri 0-5). */
function harpVoicing(chord: string): number[] {
  const { root, pcs } = parseChord(chord);
  const r3 = 48 + root; // C3..B3
  const third = pcs[1]!;
  const up = (pc: number, from: number) => from + pcOf(pc - from);
  return [r3, up(pcs[2]!, r3 + 1), r3 + 12, up(third, r3 + 13), up(pcs[2]!, r3 + 13), r3 + 24];
}

/** Bir notanın ölçek içinde `step` adım ötesi (akor ölçeğiyle). */
function scaleStep(midi: number, step: number, scale: number[]): number {
  let m = midi;
  const dir = Math.sign(step);
  for (let n = 0; n < Math.abs(step); n++) {
    do {
      m += dir;
    } while (!scale.includes(pcOf(m)));
  }
  return m;
}

const nearestIn = (target: number, pcs: number[], lo: number, hi: number, r: () => number): number => {
  let best: number[] = [];
  let bestD = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (!pcs.includes(pcOf(m))) continue;
    const d = Math.abs(m - target);
    if (d < bestD - 0.01) {
      bestD = d;
      best = [m];
    } else if (Math.abs(d - bestD) < 0.01) best.push(m);
  }
  return best.length ? best[Math.floor(r() * best.length)]! : target;
};

/** Döngüye özgü ezgi (saf): güçlü vuruşta bir önceki notaya en yakın akor notası, diğerlerinde ölçek içinde adım; 4 ölçülük cümle sonunda uzun kök/üçlü. */
export function generateMelody(chords: string[], register: 'high' | 'low', r: () => number, cfg: MusicConfig = MUSIC): Array<Array<{ midi: number; beats: number }>> {
  const [loN, hiN] = cfg.melodyRange[register];
  const lo = noteMidi(loN);
  const hi = noteMidi(hiN);
  let prev = Math.round((lo + hi) / 2);
  return chords.map((chord, i) => {
    const { pcs, root } = parseChord(chord);
    const scale = chordScale(chord, cfg);
    const cadence = i % 4 === 3;
    const pool = cadence ? cfg.rhythms.cadence : cfg.rhythms[register];
    const rhythm = pool[Math.floor(r() * pool.length)]!;
    return rhythm.map((beats, j) => {
      let m: number;
      if (j === 0 || (cadence && j === rhythm.length - 1)) {
        const want = cadence && j === rhythm.length - 1 ? [root, pcs[1]!] : pcs;
        m = nearestIn(prev + (r() < 0.5 ? -1 : 1), want, lo, hi, r);
      } else {
        const dir = prev > hi - 3 ? -1 : prev < lo + 3 ? 1 : r() < 0.5 ? -1 : 1;
        m = scaleStep(prev, dir * (r() < 0.75 ? 1 : 2), scale);
        if (m > hi || m < lo) m = scaleStep(prev, -dir, scale);
      }
      prev = m;
      return { midi: m, beats };
    });
  });
}

/** Temaya süsleme (saf): uzun notada dönüş (üst komşu), üçlü sıçramada geçiş notası. Ölçü süresi aynı kalır. */
export function ornament(bars: Array<Array<{ midi: number; beats: number }>>, chords: string[], amount: number, r: () => number, cfg: MusicConfig = MUSIC): Array<Array<{ midi: number; beats: number }>> {
  if (amount <= 0) return bars;
  return bars.map((bar, bi) => {
    const scale = chordScale(chords[bi]!, cfg);
    const out: Array<{ midi: number; beats: number }> = [];
    bar.forEach((n, i) => {
      const next = bar[i + 1];
      const last = bi === bars.length - 1 && i === bar.length - 1;
      if (!last && n.beats >= 2 && r() < amount) {
        // dönüş: nota (kısalır) - üst komşu - nota
        out.push({ midi: n.midi, beats: n.beats - 1 }, { midi: scaleStep(n.midi, 1, scale), beats: 0.5 }, { midi: n.midi, beats: 0.5 });
      } else if (next && n.beats >= 1 && Math.abs(next.midi - n.midi) >= 3 && Math.abs(next.midi - n.midi) <= 4 && r() < amount) {
        // geçiş notası (üçlü sıçramanın ortası)
        out.push({ midi: n.midi, beats: n.beats - 0.5 }, { midi: scaleStep(n.midi, Math.sign(next.midi - n.midi), scale), beats: 0.5 });
      } else out.push(n);
    });
    return out;
  });
}

/** k. döngünün olayları (saf, belirleyici): t döngü başından saniye, olaylar zamana göre sıralı. */
export function composeCycle(k: number, cfg: MusicConfig = MUSIC): MusicEvent[] {
  const r = rng(0x9e3779b1 ^ Math.imul(k + 1, 2654435761));
  const beat = beatSec(cfg);
  const bar = barSec(cfg);
  const eighth = beat / 2;
  const jit = () => (r() * 2 - 1) * (cfg.humanize.timingMs / 1000);
  const vel = (base: number) => Math.max(0.05, Math.min(1, base * (1 - r() * cfg.humanize.velocity)));
  const ev: MusicEvent[] = [];
  let barIdx = 0;
  for (const name of cfg.form) {
    const sec = sectionFor(name, k, cfg);
    const t0 = barIdx * bar;
    // ezgi
    let melody: Array<Array<{ midi: number; beats: number }>> | null = null;
    let low = false;
    if (sec.melody?.startsWith('theme:')) {
      melody = cfg.themes[sec.melody.slice(6)]!.map(parseBar);
      melody = ornament(melody, sec.chords, sec.ornament ?? 0, r, cfg);
    } else if (sec.melody?.startsWith('gen:')) {
      low = sec.melody === 'gen:low';
      melody = generateMelody(sec.chords, low ? 'low' : 'high', r, cfg);
    }
    sec.chords.forEach((chord, i) => {
      const tb = t0 + i * bar;
      const voicing = harpVoicing(chord);
      // ped: akor notaları (oktav 4 çevresinde), bir sonraki ölçüye taşar (yumuşak geçiş)
      if (sec.pad) {
        const base = 12 * (cfg.voices.pad.octave + 1);
        const { pcs } = parseChord(chord);
        const midis = pcs.map((p) => base + pcOf(p - base)).sort((a, b) => a - b);
        ev.push({ kind: 'pad', t: tb, midis, dur: bar, vel: sec.pad });
      }
      // bas: ölçü başında kök (oktav 2)
      if (sec.bass) ev.push({ kind: 'harp', t: tb + Math.abs(jit()) * 0.5, midi: voicing[0]! - 12, vel: vel(0.95), bass: true });
      // arp: 6 sekizlik, iki ölçülük kalıp dönüşümlü
      const pat = cfg.harpPatterns[sec.harp] ?? [];
      for (let s = 0; s < cfg.beatsPerBar * 2; s++) {
        const idx = pat[((i % 2) * cfg.beatsPerBar * 2 + s) % Math.max(1, pat.length)];
        if (idx === null || idx === undefined) continue;
        const accent = s === 0 ? 1 : s % 2 === 0 ? 0.82 : 0.66;
        ev.push({ kind: 'harp', t: Math.max(0, tb + s * eighth + jit()), midi: voicing[idx]!, vel: vel(accent) });
      }
      // davul
      const dp = cfg.drumPatterns[(i === sec.chords.length - 1 && sec.drumLast) || sec.drum || ''];
      if (sec.drum && dp)
        dp.forEach((p, s) => {
          if (p > 0) ev.push({ kind: 'drum', t: Math.max(0, tb + s * eighth + jit() * 0.6), hit: p >= cfg.voices.drum.dumAt ? 'dum' : 'tek', vel: vel(p) });
        });
      // ezgi notaları
      if (melody) {
        let b = 0;
        for (const n of melody[i] ?? []) {
          ev.push({ kind: 'flute', t: Math.max(0, tb + b * beat + jit() * 0.5), midi: n.midi, dur: n.beats * beat, vel: vel(b === 0 ? 0.95 : 0.85), ...(low ? { low } : {}) });
          b += n.beats;
        }
      }
    });
    barIdx += sec.chords.length;
  }
  return ev.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- çalgı örnekleri (saf JS; testli)

/** Telli çalgı (lavta / arp): Karplus-Strong + kesirli gecikme için tüm geçiren + koparma noktası tarağı. Tepe ~1. */
export function pluckSamples(freq: number, sampleRate: number, decay: number, bright: number, pick: number, seed = 1): Float32Array {
  const len = Math.ceil(sampleRate * (decay + 0.05));
  const out = new Float32Array(len);
  const period = sampleRate / freq;
  const n = Math.max(2, Math.floor(period - 0.5 - 1e-6));
  const frac = period - 0.5 - n;
  const c = (1 - frac) / (1 + frac);
  const buf = new Float32Array(n);
  const r = rng(seed);
  // uyarım: gürültü, parlaklığa göre yumuşatılır, koparma noktası tarağı (nazal lavta rengi)
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += (r() * 2 - 1 - lp) * (0.25 + bright * 0.75);
    buf[i] = lp;
  }
  const pd = Math.max(1, Math.round(n * pick));
  const ex = Float32Array.from(buf);
  for (let i = 0; i < n; i++) buf[i] = ex[i]! - 0.6 * ex[(i - pd + n) % n]!;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i]!;
  mean /= n;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    buf[i]! -= mean;
    peak = Math.max(peak, Math.abs(buf[i]!));
  }
  for (let i = 0; i < n; i++) buf[i]! /= peak;
  const loss = Math.pow(0.001, period / (decay * sampleRate)); // her tur (bir periyot) başına; ~decay sn'de -60 dB
  const blend = 0.5 + (1 - bright) * 0.1; // daha az parlak = daha çok yumuşatma
  let prev = 0;
  let apX = 0;
  let apY = 0;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx]!;
    out[i] = cur;
    const avg = (blend * cur + (1 - blend) * prev) * loss;
    prev = cur;
    const ap = c * avg + apX - c * apY;
    apX = avg;
    apY = ap;
    buf[idx] = ap;
    idx = (idx + 1) % n;
  }
  // tık olmasın: kısa giriş ve son 40 ms sönüş
  const fadeIn = Math.min(len, Math.round(sampleRate * 0.002));
  for (let i = 0; i < fadeIn; i++) out[i]! *= i / fadeIn;
  const tail = Math.min(len, Math.round(sampleRate * 0.04));
  for (let i = 0; i < tail; i++) out[len - 1 - i]! *= i / tail;
  let pk = 1e-9;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]!));
  for (let i = 0; i < len; i++) out[i]! /= pk;
  return out;
}

/** Blok flüt (recorder): temel + zayıf 2./3. harmonik, gecikmeli vibrato, nefes gürültüsü ve kısa "chiff" girişi. Süre + release. */
export function fluteSamples(freq: number, dur: number, sampleRate: number, p: MusicVoices['flute'], seed = 1): Float32Array {
  const len = Math.ceil(sampleRate * (dur + p.release + 0.02));
  const out = new Float32Array(len);
  const r = rng(seed);
  const norm = 1 / (1 + p.h2 + p.h3);
  let ph = 0;
  let nLp = 0;
  let nHp = 0;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const vibAmt = Math.min(1, Math.max(0, (t - p.vibratoDelay) / 0.3));
    const f = freq * 2 ** ((p.vibratoCents * vibAmt * Math.sin(twoPi * p.vibratoHz * t)) / 1200);
    ph += (twoPi * f) / sampleRate;
    if (ph > twoPi) ph -= twoPi;
    let env: number;
    if (t < p.attack) env = t / p.attack;
    else if (t < dur) env = 1 - 0.12 * Math.min(1, (t - p.attack) / Math.max(0.2, dur));
    else env = (1 - 0.12 * Math.min(1, (dur - p.attack) / Math.max(0.2, dur))) * Math.exp((-(t - dur) * 5) / p.release);
    const tone = (Math.sin(ph) + p.h2 * Math.sin(2 * ph) + p.h3 * Math.sin(3 * ph)) * norm;
    // nefes: bant sınırlı gürültü (yüksek geçiren - alçak geçiren), girişte kısa patlama
    const w = r() * 2 - 1;
    nLp += (w - nLp) * 0.35;
    nHp += (nLp - nHp) * 0.02;
    const chiff = t < p.attack * 1.6 ? p.chiff * (1 - t / (p.attack * 1.6)) : 0;
    out[i] = env * tone + (nLp - nHp) * (p.breath * env + chiff);
  }
  const tail = Math.min(len, Math.round(sampleRate * 0.015));
  for (let i = 0; i < tail; i++) out[len - 1 - i]! *= i / tail;
  return out;
}

/** Çerçeve davul (bodhrán): 'dum' = gergin derinin alçak gövdesi + boğuk tokmak; 'tek' = kenara hafif vuruş. */
export function drumSamples(hit: 'dum' | 'tek', sampleRate: number, seed = 1): Float32Array {
  const dur = hit === 'dum' ? 0.55 : 0.16;
  const len = Math.ceil(sampleRate * dur);
  const out = new Float32Array(len);
  const r = rng(seed);
  let ph = 0;
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.002);
    if (hit === 'dum') {
      const f = 52 + 48 * Math.exp(-t * 22);
      ph += (2 * Math.PI * f) / sampleRate;
      const body = Math.sin(ph) * Math.exp(-t * 7.5);
      const w = r() * 2 - 1;
      lp += (w - lp) * 0.08;
      const thud = lp * Math.exp(-t * 38) * 2.2;
      out[i] = attack * (body * 0.85 + thud);
    } else {
      const f = 180 * (1 + 0.15 * Math.exp(-t * 60));
      ph += (2 * Math.PI * f) / sampleRate;
      const w = r() * 2 - 1;
      lp += (w - lp) * 0.45;
      lp2 += (lp - lp2) * 0.12;
      const snap = (lp - lp2) * Math.exp(-t * 55) * 1.6;
      out[i] = attack * (snap + Math.sin(ph) * Math.exp(-t * 30) * 0.3);
    }
  }
  let pk = 1e-9;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]!));
  const target = hit === 'dum' ? 1 : 0.55;
  for (let i = 0; i < len; i++) out[i]! *= target / pk;
  const tail = Math.min(len, Math.round(sampleRate * 0.02));
  for (let i = 0; i < tail; i++) out[len - 1 - i]! *= i / tail;
  return out;
}

/** Yankı impulsu (stereo): üstel sönen gürültü, zamanla koyulaşan alçak geçiren (taş salon). */
export function reverbImpulse(sampleRate: number, seconds: number, decay: number, damp: number, seed = 7): [Float32Array, Float32Array] {
  const len = Math.max(1, Math.round(sampleRate * seconds));
  const chans: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  chans.forEach((ch, c) => {
    const r = rng(seed + c * 101);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const a = 1 - damp * x * 0.9; // ileride daha boğuk
      lp += (r() * 2 - 1 - lp) * Math.max(0.05, a);
      const pre = Math.min(1, i / (sampleRate * 0.012)); // ~12 ms ön gecikme yumuşaklığı
      ch[i] = lp * Math.pow(1 - x, decay) * pre;
    }
  });
  return chans;
}

// ---------------------------------------------------------------- çalıcı (WebAudio)

const toBuffer = (ctx: BaseAudioContext, data: Float32Array): AudioBuffer => {
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
};

/**
 * Müziği bir bağlamda çalar (gerçek AudioContext ya da OfflineAudioContext). Zaman: bağlam saati = şarkı saati + offset.
 * `start` -> `pump(ileri)` düzenli çağrılır (ileriye bakan zamanlayıcı) -> `stop(fade)` söner ve düğümleri bırakır.
 */
export class MusicEngine {
  private readonly fade: GainNode;
  private readonly level: GainNode;
  private readonly mix: GainNode;
  private readonly buses: Record<'harp' | 'flute' | 'drum' | 'pad', AudioNode>;
  private readonly bufs = new Map<string, AudioBuffer>();
  private readonly drone: AudioScheduledSourceNode[] = [];
  private offset = 0;
  private cycle = 0;
  private idx = 0;
  private events: MusicEvent[] = [];
  private stopped = false;
  private noteSeed = 1;

  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
    levelValue: number,
    private readonly cfg: MusicConfig = MUSIC,
  ) {
    this.level = ctx.createGain();
    this.level.gain.value = levelValue;
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    // yumuşak kırpıcı: küçük sinyalde doğrusal, tepe asla 1'e ulaşmaz
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * cfg.softClip) * 0.98;
    clip.curve = curve;
    this.mix = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = cfg.reverb.dry;
    const wet = ctx.createGain();
    wet.gain.value = cfg.reverb.wet;
    const conv = ctx.createConvolver();
    const [l, r] = reverbImpulse(ctx.sampleRate, cfg.reverb.seconds, cfg.reverb.decay, cfg.reverb.damp);
    const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
    ir.getChannelData(0).set(l);
    ir.getChannelData(1).set(r);
    conv.buffer = ir;
    const sum = ctx.createGain();
    sum.gain.value = cfg.master;
    this.mix.connect(dry).connect(sum);
    this.mix.connect(conv).connect(wet).connect(sum);
    sum.connect(this.fade).connect(this.level).connect(clip).connect(dest);
    const bus = (pan: number): AudioNode => {
      const g = ctx.createGain();
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p).connect(this.mix);
      } else g.connect(this.mix);
      return g;
    };
    const v = cfg.voices;
    this.buses = { harp: bus(v.harp.pan), flute: bus(v.flute.pan), drum: bus(v.drum.pan), pad: bus(0) };
  }

  /** Şarkı konumu (sn; döngüler boyunca artar). */
  songPos(): number {
    return this.ctx.currentTime - this.offset;
  }

  /** `at` bağlam saatinde `fromSong` şarkı konumundan başlar; `fadeSec` boyunca yükselir. */
  start(at: number, fromSong = 0, fadeSec = 0): void {
    const L = cycleSec(this.cfg);
    this.offset = at - fromSong;
    this.cycle = Math.floor(fromSong / L);
    this.events = composeCycle(this.cycle, this.cfg);
    const within = fromSong - this.cycle * L;
    this.idx = this.events.findIndex((e) => e.t >= within - 1e-6);
    if (this.idx < 0) this.idx = this.events.length;
    const g = this.fade.gain;
    g.cancelScheduledValues(at);
    // doğrusal yükseliş: üstel rampa (0.0001'den) ilk yarısında neredeyse sessiz kalıyordu ("geç başlıyor", Ömer 2026-10-10)
    g.setValueAtTime(fadeSec > 0 ? 0 : 1, at);
    if (fadeSec > 0) g.linearRampToValueAtTime(1, at + fadeSec);
    this.startDrone(at);
  }

  /** Seviye (0..1); yumuşak geçişle. */
  setLevel(v: number): void {
    this.level.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.08);
  }

  /** Bağlam saatinde `until`'e kadar olan olayları zamanlar. */
  pump(until: number): void {
    if (this.stopped) return;
    const L = cycleSec(this.cfg);
    const now = this.ctx.currentTime;
    for (let guard = 0; guard < 4000; guard++) {
      if (this.idx >= this.events.length) {
        this.cycle++;
        this.events = composeCycle(this.cycle, this.cfg);
        this.idx = 0;
      }
      const e = this.events[this.idx]!;
      const when = e.t + this.cycle * L + this.offset;
      if (when > until) break;
      this.idx++;
      if (when < now - 0.03) continue; // gecikmiş (sekme takıldı): atla
      this.play(e, Math.max(when, now));
    }
  }

  /** `fadeSec` içinde söner, sonra tüm düğümleri bırakır. Şarkı konumunu döndürür. */
  stop(fadeSec: number): number {
    const pos = this.songPos();
    if (this.stopped) return pos;
    this.stopped = true;
    const now = this.ctx.currentTime;
    const g = this.fade.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, fadeSec));
    for (const n of this.drone) n.stop(now + fadeSec + 0.05);
    setTimeout(() => {
      try {
        this.level.disconnect();
      } catch {
        /* zaten bağlı değil */
      }
    }, (fadeSec + 0.2) * 1000);
    return pos;
  }

  private buf(key: string, make: () => Float32Array): AudioBuffer {
    let b = this.bufs.get(key);
    if (!b) {
      b = toBuffer(this.ctx, make());
      this.bufs.set(key, b);
    }
    return b;
  }

  private shot(buffer: AudioBuffer, bus: AudioNode, at: number, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start(at);
    src.onended = () => g.disconnect();
  }

  private play(e: MusicEvent, at: number): void {
    const v = this.cfg.voices;
    const sr = this.ctx.sampleRate;
    if (e.kind === 'harp') {
      // aynı perdenin iki koparılışı biraz farklı (tohum dönüşümlü 3 örnek)
      const variant = this.noteSeed++ % 3;
      const decay = e.bass ? v.harp.bassDecay : v.harp.decay;
      const b = this.buf(`h${e.midi}:${e.bass ? 1 : 0}:${variant}`, () => pluckSamples(midiFreq(e.midi), sr, decay, e.bass ? v.harp.bright * 0.6 : v.harp.bright, v.harp.pick, e.midi * 7 + variant + 1));
      this.shot(b, this.buses.harp, at, (e.bass ? v.harp.bassGain : v.harp.gain) * e.vel);
    } else if (e.kind === 'flute') {
      const d = Math.round(e.dur * 100) / 100;
      const b = this.buf(`f${e.midi}:${d}`, () => fluteSamples(midiFreq(e.midi), d, sr, v.flute, e.midi));
      this.shot(b, this.buses.flute, at, v.flute.gain * e.vel * (e.low ? v.flute.lowGain : 1));
    } else if (e.kind === 'drum') {
      const b = this.buf(`d${e.hit}`, () => drumSamples(e.hit, sr, e.hit === 'dum' ? 3 : 5));
      this.shot(b, this.buses.drum, at, v.drum.gain * e.vel);
    } else this.playPad(e, at);
  }

  /** Akor pedi: her nota iki hafif ayrık testere -> alçak geçiren -> yavaş zarf; bir sonraki ölçünün içine taşar. */
  private playPad(e: Extract<MusicEvent, { kind: 'pad' }>, at: number): void {
    const p = this.cfg.voices.pad;
    const ctx = this.ctx;
    const end = at + e.dur + p.release;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.5;
    const env = ctx.createGain();
    const peak = p.gain * e.vel;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(peak, at + p.attack);
    env.gain.setValueAtTime(peak, at + e.dur);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(env).connect(this.buses.pad);
    for (const m of e.midis)
      for (const d of [-p.detuneCents, p.detuneCents]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiFreq(m);
        o.detune.value = d;
        o.connect(lp);
        o.start(at);
        o.stop(end + 0.05);
      }
    setTimeout(() => {
      try {
        env.disconnect();
      } catch {
        /* */
      }
    }, Math.max(0, (end - ctx.currentTime + 0.3) * 1000));
  }

  /** Drone: D2 + A2 açık beşli, yavaş nefes alan alçak geçiren (LFO). */
  private startDrone(at: number): void {
    const d = this.cfg.voices.drone;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = d.cutoff;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = d.lfoHz;
    const lfoG = ctx.createGain();
    lfoG.gain.value = d.lfoDepth;
    lfo.connect(lfoG).connect(lp.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(d.gain, at + d.attack);
    lp.connect(env).connect(this.mix);
    lfo.start(at);
    this.drone.push(lfo);
    for (const n of d.notes)
      for (const [wave, g, det] of [['sawtooth', 0.7, -4], ['triangle', 1, 3]] as const) {
        const o = ctx.createOscillator();
        o.type = wave;
        o.frequency.value = midiFreq(noteMidi(n));
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(lp);
        o.start(at);
        this.drone.push(o);
      }
  }
}

// ---------------------------------------------------------------- denetim (tarayıcı: OfflineAudioContext)

export interface MusicCheck {
  seconds: number;
  sampleRate: number;
  peak: number;
  rms: number;
  nan: number;
  /** Sessiz olmayan (|x| > 0.001) örneklerin oranı. */
  active: number;
}

/**
 * Müziğin bir parçasını çevrimdışı çizer ve ölçer (dinlenemediği için sayısal denetim: sessiz değil, tepe < 1, NaN yok).
 * Seviye en yüksek (Music %100 x Master Volume %100). Tarayıcı konsolu: `(await import('/src/game/music.ts')).renderMusicCheck(20)`.
 */
export async function renderMusicCheck(seconds = 20, fromSong = 0, sampleRate = 44100): Promise<MusicCheck> {
  const ctx = new OfflineAudioContext(2, Math.round(sampleRate * seconds), sampleRate);
  const eng = new MusicEngine(ctx, ctx.destination, 1);
  eng.start(0, fromSong, 0);
  eng.pump(seconds + 1);
  const buf = await ctx.startRendering();
  let peak = 0;
  let sq = 0;
  let nan = 0;
  let active = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const x = d[i]!;
      if (!Number.isFinite(x)) {
        nan++;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      if (a > 0.001) active++;
      sq += x * x;
    }
  }
  const n = buf.length * buf.numberOfChannels;
  return { seconds, sampleRate, peak, rms: Math.sqrt(sq / n), nan, active: active / n };
}
