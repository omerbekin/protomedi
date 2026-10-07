/**
 * Durumların stat'a etkisi (Blinded: isabet -%30, Shrouded: kaçınma +%20) için SAF yardımcılar: alt barda yön oku, stat tooltip'inde kaynak satırı,
 * hover önizlemesinde 'Blinded -30% hit' metni. Değerler `statuses.json > accuracyDelta/evasionDelta`; geçerli stat `battle.effectiveStats(c)`.
 */
import type { StatKind, StatusDef } from '../engine';

/** Okla gösterilen stat'lar (durum eki alabilenler). */
export type DeltaStat = 'accuracy' | 'evasion';
export const isDeltaStat = (k: StatKind): k is DeltaStat => k === 'accuracy' || k === 'evasion';

export type Dir = 'up' | 'down' | null;

/** Temel ve geçerli değer farkından yön: artan 'up' (yeşilimsi), azalan 'down' (kırmızımsı), fark yok null. Yuvarlama payı: yüzde 0,5. */
export function statDir(base: number, effective: number): Dir {
  const d = Math.round((effective - base) * 1000) / 1000;
  if (d > 0.005) return 'up';
  if (d < -0.005) return 'down';
  return null;
}

/** Durumun bu stat'a eki (yoksa 0). */
export function deltaOf(def: StatusDef | undefined, stat: DeltaStat): number {
  return (stat === 'accuracy' ? def?.accuracyDelta : def?.evasionDelta) ?? 0;
}

const signedPct = (v: number): string => `${v > 0 ? '+' : '-'}${Math.round(Math.abs(v) * 100)}%`;

/** Stat tooltip'i için kaynak satırları: bu stat'ı değiştiren aktif durumlar, ör. ['Blinded -30%']. */
export function statSources(statuses: ReadonlyArray<{ kind: string }>, defs: Record<string, StatusDef | undefined>, stat: DeltaStat): Array<{ text: string; dir: Exclude<Dir, null> }> {
  const out: Array<{ text: string; dir: Exclude<Dir, null> }> = [];
  for (const s of statuses) {
    const def = defs[s.kind];
    const d = deltaOf(def, stat);
    if (d !== 0) out.push({ text: `${def?.name ?? s.kind} ${signedPct(d)}`, dir: d > 0 ? 'up' : 'down' });
  }
  return out;
}

/** Hover önizlemesindeki durum satırı: 'Blinded 2 turns' -> 'Blinded -30% hit' (kısa; süre birim bilgisinde); ek taşımayan durum aynen kalır. */
export function previewStatusText(line: string, defs: Record<string, StatusDef | undefined>): string {
  for (const def of Object.values(defs)) {
    if (!def?.name || !line.startsWith(def.name)) continue;
    const acc = deltaOf(def, 'accuracy');
    const eva = deltaOf(def, 'evasion');
    if (acc === 0 && eva === 0) continue;
    const note = [acc !== 0 ? `${signedPct(acc)} hit` : '', eva !== 0 ? `${signedPct(eva)} dodge` : ''].filter(Boolean).join(' ');
    return `${def.name} ${note}`;
  }
  return line;
}
