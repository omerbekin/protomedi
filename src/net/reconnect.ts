/**
 * Kopma / yeniden bağlanma durum makinesi (saf, saat dışarıdan verilir). Ömer kararı: kopan oyuncu 60 sn içinde dönmezse kalan kazanır.
 *
 * Girdiler: eşler arası kanal açıldı/kapandı (`channelUp/channelDown`), sunucu görüşü (`server`: biz Worker'a bağlı mıyız, eş orada mı),
 * saat (`tick`). Kanal kapalıyken süre işler; süre dolunca sonuç sunucu görüşüne göre:
 *  - biz bağlıyız, eş yok  -> 'won'  (rakip terk etti)
 *  - biz bağlı değiliz     -> 'lost' (kopan bizdik)
 *  - ikimiz de bağlıyız    -> 'failed' (eşler arası kanal kurulamadı; kazanan yok)
 */
export const RECONNECT_TIMEOUT_MS = 60_000;
/** Kanal açık görünse de bu kadar süre mesaj gelmezse kopmuş sayılır (kalp atışı 2 sn'de bir). */
export const SILENCE_TIMEOUT_MS = 8_000;

export type LinkPhase = 'connected' | 'waiting' | 'won' | 'lost' | 'failed';

export interface ServerView {
  online: boolean;
  peerPresent: boolean;
}

export interface LinkStatus {
  phase: LinkPhase;
  /** waiting'de kalan süre (ms). */
  remainingMs: number;
  /** waiting'de kimin koptuğu (ekran metni için): 'peer' rakip, 'self' biz, 'unknown' ikimiz de sunucudayız. */
  who: 'peer' | 'self' | 'unknown';
}

export class ReconnectMachine {
  private phase: LinkPhase = 'connected';
  private since = 0;
  private lastHeard = 0;
  private server: ServerView = { online: true, peerPresent: true };

  constructor(
    private readonly timeoutMs = RECONNECT_TIMEOUT_MS,
    private silenceMs = SILENCE_TIMEOUT_MS,
  ) {}

  /** Sessizlik payı (röle modunda kalp atışı seyrek olduğu için geniş). */
  setSilence(ms: number): void {
    this.silenceMs = ms;
  }

  /** Kanal açıldı (ilk kez ya da yeniden): bekleme biter. Sonuçlanmış durum (won/lost/failed) değişmez. */
  channelUp(now: number): void {
    this.lastHeard = now;
    if (this.phase === 'waiting' || this.phase === 'connected') this.phase = 'connected';
  }

  /** Kanal düştü: bekleme başlar (zaten bekliyorsa saat sıfırlanmaz). */
  channelDown(now: number): void {
    if (this.phase !== 'connected') return;
    this.phase = 'waiting';
    this.since = now;
  }

  /** Eşten herhangi bir mesaj geldi (kalp atışı dahil). */
  heard(now: number): void {
    this.lastHeard = now;
  }

  setServer(view: ServerView): void {
    this.server = { ...view };
  }

  /** Süre denetimi: sessizlik -> waiting; waiting + süre doldu -> sonuç. */
  tick(now: number): LinkStatus {
    if (this.phase === 'connected' && now - this.lastHeard > this.silenceMs) this.channelDown(now);
    if (this.phase === 'waiting' && now - this.since >= this.timeoutMs) {
      this.phase = this.server.online ? (this.server.peerPresent ? 'failed' : 'won') : 'lost';
    }
    return this.status(now);
  }

  status(now: number): LinkStatus {
    const who: LinkStatus['who'] = !this.server.online ? 'self' : !this.server.peerPresent ? 'peer' : 'unknown';
    return { phase: this.phase, remainingMs: this.phase === 'waiting' ? Math.max(0, this.timeoutMs - (now - this.since)) : 0, who };
  }

  /** Yeni maç / lobiye dönüş: baştan. */
  reset(now: number): void {
    this.phase = 'connected';
    this.lastHeard = now;
    this.since = 0;
  }

  get current(): LinkPhase {
    return this.phase;
  }
}
