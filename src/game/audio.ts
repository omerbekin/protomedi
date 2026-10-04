import type Phaser from 'phaser';
import audioData from '../../data/audio.json';

/**
 * Ses efektleri: dosya kullanılmaz, WebAudio ile kodla sentezlenir. Her ses, `data/audio.json` içinde katmanlardan oluşur
 * (tone = osilatör, noise = filtreli gürültü, voice = formant sentezli insan sesi). Sentez fonksiyonları `BaseAudioContext` ile
 * çalışır (tarayıcıda gerçek, test/analiz için offline).
 */
export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  q: number;
}

interface LayerBase {
  at?: number;
}

export interface ToneLayer extends LayerBase {
  type: 'tone';
  wave: OscillatorType;
  f0: number;
  f1: number;
  attack: number;
  decay: number;
  gain: number;
  filter?: FilterSpec;
  tremHz?: number;
  tremDepth?: number;
}

export interface NoiseLayer extends LayerBase {
  type: 'noise';
  filter: 'bandpass' | 'lowpass' | 'highpass';
  f0: number;
  f1: number;
  q: number;
  attack: number;
  decay: number;
  gain: number;
  tremHz?: number;
  tremDepth?: number;
}

export interface Formant {
  f: number;
  q: number;
  g: number;
}

export interface VoiceLayer extends LayerBase {
  type: 'voice';
  duration: number;
  attack: number;
  release: number;
  volume: number;
  f0Start: number;
  f0Peak: number;
  f0End: number;
  peakAt: number;
  vibratoHz: number;
  vibratoDepth: number;
  jitterHz: number;
  jitterDepth: number;
  formants: Formant[];
  formantRise: number;
  growl: { octave: number; gain: number; detune: number };
  noise: { gain: number; center: number; q: number };
  drive: number;
  raspHz: number;
  raspDepth: number;
  lowpass: number;
  echo: { delay: number; feedback: number; mix: number };
}

export type Layer = ToneLayer | NoiseLayer | VoiceLayer;

export interface SfxDef {
  gain: number;
  layers: Layer[];
}

export const SFX = audioData.sfx as unknown as Record<string, SfxDef>;
export const SFX_IDS = Object.keys(SFX);

/** Genel ses ayarı (debug menüsünden açılıp kapanır). */
export const audioSettings = {
  enabled: true,
  /** Ana ses seviyesi 0..1 (ayarlar panelindeki 0-10 kaydırıcı / 10). */
  volume: 0.7,
};

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 1);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** Genlik zarfı: attack'te yükselir, decay boyunca üstel olarak söner. */
function envelope(ctx: BaseAudioContext, t: number, attack: number, decay: number, gain: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Titreşim (tremolo): zarfın önüne hızlı genlik dalgalanması ekler. */
function tremolo(ctx: BaseAudioContext, t: number, stop: number, hz: number | undefined, depth: number | undefined): GainNode | null {
  if (!hz || !depth) return null;
  const g = ctx.createGain();
  g.gain.value = 1 - depth / 2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  const d = ctx.createGain();
  d.gain.value = depth / 2;
  lfo.connect(d).connect(g.gain);
  lfo.start(t);
  lfo.stop(stop);
  return g;
}

function synthTone(ctx: BaseAudioContext, dest: AudioNode, l: ToneLayer, t: number): number {
  const total = l.attack + l.decay;
  const osc = ctx.createOscillator();
  osc.type = l.wave;
  osc.frequency.setValueAtTime(l.f0, t);
  if (l.f1 !== l.f0) osc.frequency.exponentialRampToValueAtTime(l.f1, t + total);
  let node: AudioNode = osc;
  if (l.filter) {
    const f = ctx.createBiquadFilter();
    f.type = l.filter.type;
    f.frequency.value = l.filter.f;
    f.Q.value = l.filter.q;
    node = node.connect(f);
  }
  const trem = tremolo(ctx, t, t + total + 0.05, l.tremHz, l.tremDepth);
  if (trem) node = node.connect(trem);
  node.connect(envelope(ctx, t, l.attack, l.decay, l.gain)).connect(dest);
  osc.start(t);
  osc.stop(t + total + 0.05);
  return total;
}

function synthNoise(ctx: BaseAudioContext, dest: AudioNode, l: NoiseLayer, t: number): number {
  const total = l.attack + l.decay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = l.filter;
  f.Q.value = l.q;
  f.frequency.setValueAtTime(l.f0, t);
  if (l.f1 !== l.f0) f.frequency.exponentialRampToValueAtTime(l.f1, t + total);
  let node: AudioNode = src.connect(f);
  const trem = tremolo(ctx, t, t + total + 0.05, l.tremHz, l.tremDepth);
  if (trem) node = node.connect(trem);
  node.connect(envelope(ctx, t, l.attack, l.decay, l.gain)).connect(dest);
  src.start(t);
  src.stop(t + total + 0.05);
  return total;
}

/**
 * Çığlık: formant sentezi. Testere dalgası (gırtlak) + bir oktav aşağıdan hırıltı -> 3 bant geçiren (ünlü 'a') -> doyum ->
 * alçak geçiren (boğukluk) -> gırtlak titremesi -> yankı. Süreyi (sn) döndürür.
 */
function synthVoice(ctx: BaseAudioContext, dest: AudioNode, p: VoiceLayer, t: number): number {
  const end = t + p.duration;
  const tPeak = t + p.duration * p.peakAt;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(p.volume, t + p.attack);
  out.gain.setValueAtTime(p.volume * 0.92, Math.max(t + p.attack, end - p.release));
  out.gain.linearRampToValueAtTime(0.0001, end);

  const src = ctx.createGain();
  const meanF0 = (p.f0Start + p.f0Peak + p.f0End) / 3;
  const makeOsc = (mult: number, detuneCents: number, gain: number) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = detuneCents;
    osc.frequency.setValueAtTime(p.f0Start * mult, t);
    osc.frequency.linearRampToValueAtTime(p.f0Peak * mult, tPeak);
    osc.frequency.linearRampToValueAtTime(p.f0End * mult, end);
    const vib = ctx.createOscillator();
    vib.frequency.value = p.vibratoHz;
    const vg = ctx.createGain();
    vg.gain.value = meanF0 * mult * p.vibratoDepth;
    vib.connect(vg).connect(osc.frequency);
    const jit = ctx.createOscillator();
    jit.type = 'square';
    jit.frequency.value = p.jitterHz;
    const jg = ctx.createGain();
    jg.gain.value = meanF0 * mult * p.jitterDepth * 0.5;
    jit.connect(jg).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(src);
    const stopAt = end + 0.8;
    for (const n of [osc, vib, jit]) {
      n.start(t);
      n.stop(stopAt);
    }
  };
  makeOsc(1, 0, 1);
  makeOsc(p.growl.octave, p.growl.detune, p.growl.gain);

  const mix = ctx.createGain();
  for (const fm of p.formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = fm.q;
    bp.frequency.setValueAtTime(fm.f, t);
    bp.frequency.linearRampToValueAtTime(fm.f * (1 + p.formantRise), tPeak);
    bp.frequency.linearRampToValueAtTime(fm.f * (1 + p.formantRise * 0.4), end);
    const g = ctx.createGain();
    g.gain.value = fm.g;
    src.connect(bp).connect(g).connect(mix);
  }

  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * p.drive);
  shaper.curve = curve;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = p.lowpass;
  lp.Q.value = 0.8;
  mix.connect(shaper).connect(lp);

  const rasp = ctx.createGain();
  rasp.gain.value = 1 - p.raspDepth / 2;
  const raspLfo = ctx.createOscillator();
  raspLfo.frequency.value = p.raspHz;
  const raspDepth = ctx.createGain();
  raspDepth.gain.value = p.raspDepth / 2;
  raspLfo.connect(raspDepth).connect(rasp.gain);
  lp.connect(rasp).connect(out);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = p.noise.center;
  nbp.Q.value = p.noise.q;
  const ng = ctx.createGain();
  ng.gain.value = p.noise.gain;
  noise.connect(nbp).connect(ng).connect(out);

  const dry = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = p.echo.delay;
  const fb = ctx.createGain();
  fb.gain.value = p.echo.feedback;
  const wet = ctx.createGain();
  wet.gain.value = p.echo.mix;
  out.connect(dry).connect(dest);
  out.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(dest);

  for (const n of [raspLfo, noise]) {
    n.start(t);
    n.stop(end + 0.8);
  }
  return p.duration;
}

/** Bir sesi verilen bağlamda çalar; sesin süresini (sn) döndürür. */
export function synthSfx(ctx: BaseAudioContext, dest: AudioNode, def: SfxDef, t0 = ctx.currentTime): number {
  const out = ctx.createGain();
  out.gain.value = def.gain;
  out.connect(dest);
  let longest = 0;
  for (const layer of def.layers) {
    const t = t0 + (layer.at ?? 0);
    const d = layer.type === 'tone' ? synthTone(ctx, out, layer, t) : layer.type === 'noise' ? synthNoise(ctx, out, layer, t) : synthVoice(ctx, out, layer, t);
    longest = Math.max(longest, (layer.at ?? 0) + d);
  }
  return longest;
}

/** Bir ses efektini çalar (Phaser'ın ses yöneticisinin AudioContext'ini kullanır; tarayıcı kilidini Phaser açar). */
export function playSfx(scene: Phaser.Scene, id: string): void {
  playSfxOn((scene.sound as unknown as { context?: AudioContext }).context, id);
}

/** Ham AudioContext üzerinden çalar (ayarlar panelinin deneme sesi de bunu kullanır). */
export function playSfxOn(ctx: AudioContext | undefined, id: string): void {
  if (!audioSettings.enabled || audioSettings.volume <= 0) return;
  const def = SFX[id];
  if (!def || !ctx) return;
  void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = audioData.master * audioSettings.volume;
  master.connect(ctx.destination);
  synthSfx(ctx, master, def);
}
