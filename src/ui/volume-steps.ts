// Ses seviyesi kaydırıcılarının ortak ölçeği (Ömer 2026-10-10): Settings'teki TÜM ses kaydırıcıları (Master Volume, Music, UI sounds)
// 0-100% arası %5'lik 20 adım; 0 = kapalı ("Off"). Kayıtlar `{ <alan>: 0..20, steps: 20 }`; `steps` alanı olmayan eski kayıtlar 0-10
// ölçeğindedir ve en yakın yeni adıma (x2) taşınır. Saf; testli (tests/settings-steps.test.ts).

export const VOLUME_STEPS = 20;

/** 0..20 aralığına, tam adıma. */
export const clampStep = (v: number): number => Math.min(VOLUME_STEPS, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));

/** Kazanç oranı 0..1. */
export const stepFraction = (n: number): number => clampStep(n) / VOLUME_STEPS;

/** Yanındaki yazı: "Off", "5%", ... "100%". */
export const volumeLabel = (n: number): string => (clampStep(n) <= 0 ? 'Off' : `${clampStep(n) * (100 / VOLUME_STEPS)}%`);

/** Kayıttan seviye (göçlü): yeni biçim `steps: 20`, eski biçim 0-10 (x2). Bozuk/boş kayıtta `fallback` (adım). */
export function readStepLevel(raw: string | null | undefined, field: string, fallback: number): number {
  if (!raw) return fallback;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const v = Number(o[field]);
    if (!Number.isFinite(v)) return fallback;
    return o.steps === VOLUME_STEPS ? clampStep(v) : clampStep(Math.min(10, Math.max(0, v)) * 2);
  } catch {
    return fallback;
  }
}

/** Kayıt metni (yeni biçim). */
export const stepRecord = (field: string, n: number): string => JSON.stringify({ [field]: clampStep(n), steps: VOLUME_STEPS });
