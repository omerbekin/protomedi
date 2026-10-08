/**
 * Soyut taşıma katmanı: eşler arası tek bir sıralı, güvenilir kanal (WebRTC DataChannel ya da testte bellek içi loopback).
 * Oturum (session.ts) yalnızca bu arayüzü bilir.
 */
export interface Transport {
  /** Mesaj gönder (kanal kapalıysa sessizce düşer). */
  send(text: string): void;
  onMessage(cb: (text: string) => void): void;
  /** Kanal kapandı (bir kez). */
  onClose(cb: () => void): void;
  close(): void;
  readonly open: boolean;
}

/** Zamanlayıcı (testte sahte saat verilebilir). */
export interface Timer {
  setTimeout(fn: () => void, ms: number): unknown;
}

const realTimer: Timer = { setTimeout: (fn, ms) => setTimeout(fn, ms) };

/**
 * Bellek içi loopback çifti (test + debug sahte rakip). `latencyMs` her yönde gecikme; 0 ise mesajlar senkron değil, sıradaki mikro
 * görevde teslim edilir (gerçek kanala benzer). `drop()` iki ucu da kapatır.
 */
export class LoopbackEnd implements Transport {
  peer: LoopbackEnd | null = null;
  latencyMs = 0;
  private readonly listeners: Array<(t: string) => void> = [];
  private readonly closers: Array<() => void> = [];
  private closed = false;
  /** Test: gönderilen her mesaj (gözlem). */
  readonly sent: string[] = [];

  constructor(private readonly timer: Timer = realTimer) {}

  get open(): boolean {
    return !this.closed;
  }

  send(text: string): void {
    if (this.closed || !this.peer) return;
    this.sent.push(text);
    const peer = this.peer;
    const deliver = () => {
      if (!peer.closed) for (const l of peer.listeners) l(text);
    };
    if (this.latencyMs > 0) this.timer.setTimeout(deliver, this.latencyMs);
    else void Promise.resolve().then(deliver);
  }

  onMessage(cb: (text: string) => void): void {
    this.listeners.push(cb);
  }

  onClose(cb: () => void): void {
    this.closers.push(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.closers) c();
    this.peer?.close();
  }
}

/** Birbirine bağlı iki uç. */
export function loopbackPair(timer?: Timer): [LoopbackEnd, LoopbackEnd] {
  const a = new LoopbackEnd(timer);
  const b = new LoopbackEnd(timer);
  a.peer = b;
  b.peer = a;
  return [a, b];
}
