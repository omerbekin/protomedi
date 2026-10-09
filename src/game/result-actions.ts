/**
 * Sonuç ekranı düğmelerinin saf kapısı (Phaser yok; testli: tests/mp-rematch.test.ts).
 * Ekranı terk eden düğmeler (Back to lobby, Main Menu, Continue...) yalnızca bir kez çalışır ve ilki çalışınca hepsi kapanır
 * (çift tıklama iki sahne açmasın). Tekrarlanabilir aç/kapa düğmesi (multiplayer Rematch / Cancel rematch) bu kilidi ASLA koymaz.
 * Canlı hata 2026-10-10: tüm düğmeler ortak bir "bir kez" kilidi kullanıyordu; Rematch'e basınca Back to lobby da kilitleniyordu.
 */

export interface GatedAction {
  run: () => void;
  /** Tekrar basılabilir (kilit koymaz). */
  repeatable?: boolean;
  /** Şu an basılabilir mi (yoksa hep). */
  view?: () => { enabled: boolean };
}

export interface ActionGate {
  /** i. düğmeye basıldı: kurala uygunsa çalıştırır; çalıştıysa true. */
  press(i: number): boolean;
  /** Ekranı terk eden bir düğme çalıştı mı (sonrasında hiçbir düğme çalışmaz). */
  readonly done: boolean;
  /** Dışarıdan kilit (ör. New Game / Team Select ile aynı kilidi paylaşmak için). */
  close(): boolean;
}

export function gateActions(actions: readonly GatedAction[]): ActionGate {
  let done = false;
  return {
    press(i: number): boolean {
      const a = actions[i];
      if (!a || done) return false;
      if (a.view && !a.view().enabled) return false;
      if (!a.repeatable) done = true;
      a.run();
      return true;
    },
    get done() {
      return done;
    },
    close(): boolean {
      if (done) return false;
      done = true;
      return true;
    },
  };
}
