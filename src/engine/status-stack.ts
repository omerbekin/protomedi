// Aynı durumun yeniden uygulanması (Ömer 2026-10-10: "aynı debuff üst üste binmesin; sadece en fazla vuranınki kalsın").
// Saf yardımcılar: battle.addStatus kullanır, testler doğrudan sınar. Kural verisi statuses.json > stack (types.ts > StatusDef.stack).
import type { Status, StatusDef, StatusStackMode } from './types';

/** Durumun yığılma kipi: veride `stack` varsa o; yoksa yığınlı (maxStacks) durum 'stack', debuff 'refresh-strongest', buff 'replace'. */
export function statusStackMode(def: StatusDef | undefined): StatusStackMode {
  if (def?.stack) return def.stack;
  if (def?.maxStacks) return 'stack';
  return def?.type === 'debuff' ? 'refresh-strongest' : 'replace';
}

/** Örneğin gücü: DoT tik miktarı (`amount`); sabit büyüklüklü durumlarda (Slow, Wound...) 0, yani hepsi eşit. */
export function statusStrength(s: Pick<Status, 'amount'>): number {
  return s.amount ?? 0;
}

/**
 * 'refresh-strongest' birleştirmesi: birimdeki eski örnek `old` + yeni uygulama `incoming` (Resilience / Unyielding kısaltması uygulanmış hâli) ->
 * birimde kalacak TEK örnek. Süre max(kalan, yeni): yeniden uygulama süreyi geri uzatır ama yeni uygulamanın tam süresini aşmaz (kalan daha uzunsa
 * kalan korunur). Yeni daha GÜÇLÜYSE güç ve kaynak yeninin; eşit ya da zayıfsa eski örnek (güç, kaynak) kalır, yalnızca süre tazelenir.
 */
export function mergeRefreshStrongest(old: Status, incoming: Status): Status {
  const turns = Math.max(old.turns, incoming.turns);
  return statusStrength(incoming) > statusStrength(old) ? { ...incoming, turns } : { ...old, turns };
}
