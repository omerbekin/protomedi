// Ana menü müziği denetimi (hafif; menü parçasında). Beste ve ses motoru ayrı parçada: src/game/music.ts (ilk gerektiğinde dynamic import).
// Kurallar (Ömer 2026-10-10): ana menüde çalar; ilk kullanıcı hareketinden (tık/dokunma/tuş) önce ses YOK (tarayıcı autoplay kuralı), sonra
// yavaşça yükselir; menüden savaşa / sefere / Endless'a çıkarken söner, menüye dönünce kaldığı yerden (bir sonraki ölçü başından) yükselir;
// sekme gizlenince durur (bağlam askıya alınır). Seviye = Settings > Music (0-10, 0 = tamamen kapalı: motor ve düğümler bırakılır)
// x Settings > Sound volume (ana ses) x data/audio-music.json > master. Hata oyunu durdurmaz.
import musicData from '../../data/audio-music.json';

type MusicModule = typeof import('../game/music');
type Engine = InstanceType<MusicModule['MusicEngine']>;

const KEY = 'proto.music.v1';
export const DEFAULT_MUSIC_LEVEL: number = musicData.defaultLevel;
const FADE_IN = musicData.fadeInMs / 1000;
const FADE_OUT = musicData.fadeOutMs / 1000;
/** İleriye bakan zamanlayıcı: her PUMP_MS'de LOOKAHEAD sn ilerisi zamanlanır. */
const PUMP_MS = 200;
const LOOKAHEAD = 0.9;

const clampLevel = (v: number): number => Math.min(10, Math.max(0, Math.round(v)));

/** Kayıtlı müzik seviyesi 0..10 (kayıt yoksa varsayılan ~%60). */
export function loadMusicLevel(): number {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? Number((JSON.parse(raw) as { level?: number }).level) : NaN;
    return Number.isFinite(v) ? clampLevel(v) : DEFAULT_MUSIC_LEVEL;
  } catch {
    return DEFAULT_MUSIC_LEVEL;
  }
}

let level = loadMusicLevel();
/** Ana ses seviyesi 0..10 (Settings > Sound volume; src/ui/settings.ts bildirir). */
let master = 7;
let wanted = false;
let unlocked = false;
let ctx: AudioContext | null = null;
let mod: MusicModule | null = null;
let loading: Promise<MusicModule | null> | null = null;
let engine: Engine | null = null;
let songPos = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(level: number) => void>();

/** Müzik motorunun gerçek kazancı (0..1). Saf: seviye 0-10 x ana ses 0-10. */
export function musicGain(lvl: number, masterLevel: number): number {
  return (clampLevel(lvl) / 10) * (clampLevel(masterLevel) / 10);
}

export function musicLevel(): number {
  return level;
}

export function setMusicLevel(v: number): void {
  level = clampLevel(v);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ level }));
  } catch {
    /* saklama kapalı: yalnızca bu oturum */
  }
  for (const fn of listeners) fn(level);
  update();
}

/** Seviye değişince haber ver (kaldırma işlevi döner). */
export function onMusicLevelChange(fn: (level: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Settings > Sound volume değişti (0..10): müzik de onunla çarpılır. */
export function setMusicMaster(v: number): void {
  master = clampLevel(v);
  update();
}

/** Ana menü açıldı (true) / kapanıyor (false). */
export function menuMusic(on: boolean): void {
  wanted = on;
  update();
}

const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

function makeContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const C = g.AudioContext ?? g.webkitAudioContext;
    ctx = C ? new C() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

const loadModule = (): Promise<MusicModule | null> =>
  (loading ??= import('../game/music')
    .then((m) => (mod = m))
    .catch(() => {
      loading = null; // ağ hatası: bir sonraki denemede yeniden
      return null;
    }));

function startPump(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!engine || !ctx || ctx.state !== 'running') return;
    try {
      engine.pump(ctx.currentTime + LOOKAHEAD);
    } catch {
      /* ses hatası menüyü bozmasın */
    }
  }, PUMP_MS);
}

function stopPump(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Durumu uygular: çalmalı mı (menüde, kilit açık, seviye > 0, sekme görünür)? */
function update(): void {
  try {
    const gain = musicGain(level, master);
    const should = wanted && unlocked && gain > 0;
    if (engine) {
      if (!should) {
        // sön ve bırak; konum saklanır (menüye dönünce kaldığı yerden)
        songPos = engine.stop(FADE_OUT);
        engine = null;
        stopPump();
        if (suspendTimer) clearTimeout(suspendTimer);
        suspendTimer = setTimeout(() => {
          if (!engine && ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
        }, (FADE_OUT + 0.4) * 1000);
      } else engine.setLevel(gain);
      return;
    }
    if (!should) return;
    const c = makeContext();
    if (!c) return;
    if (!mod) {
      void loadModule().then((m) => m && update());
      return;
    }
    if (suspendTimer) clearTimeout(suspendTimer);
    suspendTimer = null;
    if (c.state !== 'running' && !hidden()) void c.resume().catch(() => undefined);
    const bar = mod.barSec();
    const from = Math.ceil(songPos / bar - 1e-6) * bar; // bir sonraki ölçü başından
    engine = new mod.MusicEngine(c, c.destination, gain);
    engine.start(c.currentTime + 0.12, from, FADE_IN);
    engine.pump(c.currentTime + LOOKAHEAD);
    startPump();
  } catch {
    /* ses hatası menüyü bozmasın */
  }
}

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

/** Kullanıcı hareketi: bağlam kurulur/açılır (iOS yalnızca hareket içinde açar); ilk harekette müzik başlar. */
function onGesture(): void {
  const first = !unlocked;
  unlocked = true;
  const c = makeContext();
  if (c && c.state !== 'running' && !hidden() && (engine || (wanted && level > 0))) void c.resume().catch(() => undefined);
  if (first) {
    void loadModule();
    update();
  }
}

function onVisibility(): void {
  if (!ctx) return;
  if (hidden()) void ctx.suspend().catch(() => undefined);
  else if (engine) void ctx.resume().catch(() => undefined);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  for (const ev of GESTURES) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
}

/** Durum (debug / tarayıcı denetimi). */
export function musicState(): { level: number; master: number; wanted: boolean; unlocked: boolean; playing: boolean; ctx: string; songPos: number } {
  return { level, master, wanted, unlocked, playing: !!engine, ctx: ctx?.state ?? 'none', songPos: engine ? engine.songPos() : songPos };
}
