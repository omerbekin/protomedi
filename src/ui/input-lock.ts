/**
 * Oyun girişi kilidi: bir DOM katmanı (ayarlar ekranı, oyun içi Menu, wiki) açıkken alttaki Phaser sahnesi tıklama ALMAZ.
 * Neden: Phaser fare bırakmayı (mouseup) window üzerinden de dinler; DOM düğmesine yapılan tıklamanın bırakması, altta aynı yerde duran
 * Phaser düğmesini de tetikliyordu (ör. Settings > Back -> alttaki 'Continue Campaign'). Kilit nedenlere göre sayılır (birden fazla
 * katman üst üste açık olabilir); son neden kalkınca giriş bir sonraki görev adımında geri açılır (kapatan tıklamanın kendisi sızmasın).
 * Bağlantı main.ts'de: `onInputLockChange((locked) => game.input.enabled = !locked)`.
 */
const reasons = new Set<string>();
const listeners = new Set<(locked: boolean) => void>();
let applied = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function emit(locked: boolean): void {
  if (locked === applied) return;
  applied = locked;
  for (const fn of listeners) fn(locked);
}

/** Bir neden için kilitler (hemen). */
export function lockInput(reason: string): void {
  reasons.add(reason);
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  emit(true);
}

/** Nedeni kaldırır; başka neden kalmadıysa kilit kısa bir gecikmeyle açılır (kapatan dokunuşun bırakması sahneye geçmesin). */
export function unlockInput(reason: string, delayMs = 60): void {
  reasons.delete(reason);
  if (reasons.size > 0) return;
  if (timer !== undefined) clearTimeout(timer);
  if (delayMs <= 0) return emit(false);
  timer = setTimeout(() => {
    timer = undefined;
    if (reasons.size === 0) emit(false);
  }, delayMs);
}

/** Etkin kilit (nedenlerden biri var ya da açılma gecikmesi sürüyor). */
export function isInputLocked(): boolean {
  return applied;
}

export function lockReasons(): string[] {
  return [...reasons];
}

export function onInputLockChange(fn: (locked: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
