// Endless ekranının saf akış kararları (Phaser'sız; tests/endless.test.ts). Sahne: src/game/scenes/EndlessScene.ts.
import type { EndlessRun } from './data';

/** Ekran görünümleri: title (Continue / New Run / en iyi koşular), pick (takım seçimi), camp (sıradaki dalga), reward (3 kart), shop, over (skor). */
export type EndlessView = 'title' | 'pick' | 'camp' | 'reward' | 'shop' | 'over';

/** Açılış görünümü: istenen başlık/seçim ekranı önceliklidir; yoksa bellekteki koşunun aşaması; koşu yoksa başlık. */
export function endlessView(run: EndlessRun | null, requested?: 'title' | 'pick'): EndlessView {
  if (requested) return requested;
  if (!run) return 'title';
  switch (run.phase) {
    case 'ready':
      return 'camp';
    case 'reward':
      return 'reward';
    case 'shop':
      return 'shop';
    default:
      return 'over';
  }
}

/** Back / Esc hedefi: başlık ve kamp ana menüye (koşu kayıtlı), seçim ve skor ekranı başlığa; ödül ve dükkânda geri yok (seçim zorunlu). */
export function endlessBack(view: EndlessView): 'menu' | 'title' | null {
  if (view === 'title' || view === 'camp') return 'menu';
  if (view === 'pick' || view === 'over') return 'title';
  return null;
}

/** Takım seçimi: dokunulan class listede yoksa eklenir (dolu değilse), varsa çıkarılır. Sıra korunur. */
export function togglePick(picked: string[], id: string, size: number): string[] {
  if (picked.includes(id)) return picked.filter((c) => c !== id);
  return picked.length >= size ? picked : [...picked, id];
}
