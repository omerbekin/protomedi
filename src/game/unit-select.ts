/**
 * Ctrl + sol tık (Mac: Cmd; dokunmatik: uzun basma) ile birim seçimi: saf mantık (Phaser yok).
 * Seçim bilgi/inceleme ve debug Unit araçlarının hedefidir; skill hedeflemeyi ve sıra işleyişini etkilemez.
 */

/** Seçim değişince window'a gönderilen olay (debug menüsü kendini yeniler). */
export const UNIT_SELECT_EVENT = 'proto-unit-select';

/** Seçim tuşu basılı mı (Ctrl; Mac'te Cmd)? */
export const isSelectModifier = (e: { ctrlKey?: boolean; metaKey?: boolean } | null | undefined): boolean => !!e && (!!e.ctrlKey || !!e.metaKey);

/** Dokunmatikte uzun basma süresi (ms) ve parmağın bu kadar pikselden fazla oynamaması gerekir. */
export const LONG_PRESS_MS = 520;
export const LONG_PRESS_SLOP = 14;

/** Seçili birimlerin kümesi (ekleme sırası korunur; sonuncu = "ana" seçim). */
export class UnitSelection {
  private readonly set = new Set<string>();

  has(uid: string): boolean {
    return this.set.has(uid);
  }

  /** Seçimi aç/kapat; yeni durumu döner. */
  toggle(uid: string): boolean {
    if (this.set.delete(uid)) return false;
    this.set.add(uid);
    return true;
  }

  clear(): boolean {
    const had = this.set.size > 0;
    this.set.clear();
    return had;
  }

  get size(): number {
    return this.set.size;
  }

  get uids(): string[] {
    return [...this.set];
  }

  get last(): string | undefined {
    return this.uids[this.set.size - 1];
  }
}

/** Noktada (ayak merkezi x,y; kutu w x h) duran birimlerden işaretçiye en yakınını bulur. */
export function pickUnitAt(units: Array<{ uid: string; x: number; y: number; w: number; h: number }>, px: number, py: number): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const u of units) {
    const inside = px >= u.x - u.w / 2 && px <= u.x + u.w / 2 && py >= u.y - u.h && py <= u.y;
    if (!inside) continue;
    const d = Math.hypot(px - u.x, py - (u.y - u.h / 2));
    if (d < bestD) {
      bestD = d;
      best = u.uid;
    }
  }
  return best;
}
