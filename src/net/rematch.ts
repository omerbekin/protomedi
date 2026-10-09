/**
 * Multiplayer sonuç ekranı: rövanş düğmesinin ve durum satırının saf karar mantığı (Phaser/DOM yok; testli).
 * Kural (Ömer 2026-10-10, canlı hata: Rematch'e basınca rakip ayrıldı, Back to lobby tıklanmaz oldu):
 * - Rematch bir aç/kapa isteğidir: basınca "Cancel rematch" olur, geri alınabilir.
 * - Rakip ayrıldıysa (leave) ya da 60 sn içinde dönmediyse: "Opponent left the match", Rematch kapalı.
 * - Bağlantı geçici koptuysa: rövanş istenemez ama bekleyen istek her zaman iptal edilebilir.
 * - Back to lobby / Main Menu bu mantığa hiç bağlı değildir: her durumda çalışır.
 */

export interface RematchInput {
  /** Oturum sonuç aşamasında mı ('result'). Değilse düğme kapalı, durum boş. */
  inResult: boolean;
  /** Eşle kanal açık ve el sıkışma tamam. */
  connected: boolean;
  /** Rakip maçtan ayrıldı ya da 60 sn içinde dönmedi (bu sonuç ekranında rövanş artık mümkün değil). */
  opponentGone: boolean;
  /** Biz rövanş istedik mi / rakip istedi mi. */
  local: boolean;
  remote: boolean;
}

export interface RematchView {
  /** Sonuç ekranındaki durum satırı ('' = gösterme). İngilizce: oyun içi metin. */
  status: string;
  tone: 'info' | 'warn' | 'error';
  /** Rövanş düğmesinin yazısı. */
  label: string;
  /** Rövanş düğmesine basılabilir mi. */
  enabled: boolean;
  /** Düğmeye basınca istenecek yeni değer (true = iste, false = iptal). */
  next: boolean;
}

export const REMATCH_TEXT = {
  rematch: 'Rematch',
  cancel: 'Cancel rematch',
  gone: 'Opponent left the match',
  waiting: 'Waiting for your opponent...',
  wants: 'Your opponent wants a rematch',
  disconnected: 'Opponent disconnected',
} as const;

export function rematchView(i: RematchInput): RematchView {
  if (!i.inResult) return { status: '', tone: 'info', label: REMATCH_TEXT.rematch, enabled: false, next: true };
  if (i.opponentGone) return { status: REMATCH_TEXT.gone, tone: 'error', label: REMATCH_TEXT.rematch, enabled: false, next: true };
  if (!i.connected) {
    // Geçici kopma: bekleyen isteğimiz varsa iptal edilebilir; yeni istek gönderilemez
    return i.local
      ? { status: REMATCH_TEXT.disconnected, tone: 'warn', label: REMATCH_TEXT.cancel, enabled: true, next: false }
      : { status: REMATCH_TEXT.disconnected, tone: 'warn', label: REMATCH_TEXT.rematch, enabled: false, next: true };
  }
  if (i.local) return { status: REMATCH_TEXT.waiting, tone: 'info', label: REMATCH_TEXT.cancel, enabled: true, next: false };
  if (i.remote) return { status: REMATCH_TEXT.wants, tone: 'info', label: REMATCH_TEXT.rematch, enabled: true, next: true };
  return { status: '', tone: 'info', label: REMATCH_TEXT.rematch, enabled: true, next: true };
}
