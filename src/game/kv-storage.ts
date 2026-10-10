import type { KV } from '../campaign';

/** Tarayıcı deposu; kapalıysa (gizli pencere vb.) null: kayıt yapılamaz ama oyun çökmez. (Ana menü de kullanır: hafif modül.) */
export function storage(): KV | null {
  try {
    const ls = window.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}
