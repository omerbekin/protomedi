/**
 * Kalıcı alan pusu (Ömer 2026-10-09: "Cutthroat'ın dumanı atıldığı alanın üstünde çok hafif kalsın"): bazı alan skill'leri zemin (ground) bırakmaz,
 * alandaki birimlere süreli durum verir (Smoke Bomb: Blinded / Shrouded). Etki sürerken alanın hücrelerinde soluk bir pus görünür; pus, o atışın
 * durumunu taşıyan son birimden de durum düşünce (süre doldu, dispel, ölüm, debug temizliği) söner.
 *
 * Bu dosya SAF (Phaser'sız) yaşam döngüsüdür; çizim `linger-haze-view.ts`. v1 dosyalarına (vfx.ts vb.) dokunulmaz: cast animasyonu aynı kalır,
 * pus BattleScene'in kalıcı katmanına (zemin efektlerinin hemen üstü, seçim plakalarının ve birimlerin altı) eklenir.
 */

/** Pus bırakan skill'ler (skill id -> görünüm). Durum listesi skill'in kendi `status` etkilerinden türetilir. */
export const LINGER_HAZE: Readonly<Record<string, { look: 'smoke' }>> = {
  smoke_bomb: { look: 'smoke' },
};

/** Boş alana atılan (ya da hiç durum tutmayan) pus, cast'tan sonra en az bu kadar kalır, sonra söner (ms). */
export const HAZE_MIN_LIFE_MS = 2200;

export interface Haze {
  id: string;
  skill: string;
  board: 'party' | 'enemy';
  cells: number[];
  statuses: string[];
  /** Bu atışın durumunu taşıyan (ve henüz kaybetmemiş) birimler. */
  units: Set<string>;
  born: number;
}

export interface HazeCast {
  skill: string;
  board?: 'party' | 'enemy';
  cells?: number[];
  targets: string[];
}

/** Skill'in pus bırakıp bırakmadığı ve bırakıyorsa hangi durumlara bağlı olduğu. */
export function hazeStatuses(skill: { id?: string; effects?: Array<{ type: string; status?: string }> } | undefined, skillId: string): string[] | null {
  if (!skill || !LINGER_HAZE[skillId]) return null;
  return [...new Set((skill.effects ?? []).filter((e) => e.type === 'status' && e.status).map((e) => e.status!))];
}

export class HazeTracker {
  private hazes = new Map<string, Haze>();
  private seq = 0;

  get list(): Haze[] {
    return [...this.hazes.values()];
  }

  /**
   * Pus bırakan skill kullanıldı: yeni pus kaydı. Hedefler (alanda etkinin uygulandığı birimler) bu puse bağlanır; daha eski bir pusa bağlıysalar
   * oradan alınır (durumları yenilendi, artık yeni dumana aittirler). Pus bırakmayan skill'de null.
   */
  cast(e: HazeCast, statuses: string[] | null, now: number): Haze | null {
    if (!statuses || !e.board || !e.cells || e.cells.length === 0) return null;
    for (const h of this.hazes.values()) for (const uid of e.targets) h.units.delete(uid);
    const haze: Haze = { id: `haze:${++this.seq}`, skill: e.skill, board: e.board, cells: [...e.cells], statuses, units: new Set(e.targets), born: now };
    this.hazes.set(haze.id, haze);
    return haze;
  }

  /**
   * Canlı durumla eşitle: `holds(uid, statuses)` birim yaşıyor ve bu durumlardan birini taşıyor mu? Taşımayan birim pustan düşer; birimi kalmayan
   * ve en kısa ömrünü doldurmuş pus biter. Biten pusların id'leri döner.
   */
  reconcile(holds: (uid: string, statuses: string[]) => boolean, now: number): string[] {
    const ended: string[] = [];
    for (const h of this.hazes.values()) {
      for (const uid of [...h.units]) if (!holds(uid, h.statuses)) h.units.delete(uid);
      if (h.units.size === 0 && now - h.born >= HAZE_MIN_LIFE_MS) ended.push(h.id);
    }
    for (const id of ended) this.hazes.delete(id);
    return ended;
  }

  /** Hepsini bitir (sahne/savaş sıfırlanınca). */
  clear(): string[] {
    const ids = [...this.hazes.keys()];
    this.hazes.clear();
    return ids;
  }
}
