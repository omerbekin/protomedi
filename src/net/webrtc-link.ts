/**
 * Tarayıcı bağlantı katmanı: Worker'a WebSocket (signaling) + iki tarayıcı arasında WebRTC DataChannel.
 * Kurucu teklif (offer) yapar ve kanalı açar; katılan yanıtlar. Kanal düşerse ve iki taraf da sunucudaysa kurucu yeniden dener.
 * Sunucu görüşü (biz bağlı mıyız, eş orada mı) oturuma iletilir: 60 sn kuralında kimin koptuğunu belirler.
 * Kota tasarrufu: doğrudan kanal açılınca Worker bağlantısı kapatılır ("park"); kanal düşerse yeniden açılır.
 * Röle yedeği: doğrudan kanal MAX_DIRECT_ATTEMPTS denemede kurulamazsa oyun mesajları Worker üzerinden aktarılır (yalnızca o zaman).
 * Saf olmayan (DOM/WebRTC) tek dosya; mantık ağırlıklı kısımlar session.ts / reconnect.ts içinde ve testlidir.
 */
import type { ServerView } from './reconnect';
import type { Transport } from './transport';
import type { IceServer } from './config';

export type LinkError = 'no-lobby' | 'full' | 'taken' | 'bad-request' | 'rate' | 'unreachable';

export interface LinkCallbacks {
  /** İlk başarılı sunucu bağlantısı (lobi açıldı / katılındı). */
  onWelcome(peerPresent: boolean): void;
  onServer(view: ServerView): void;
  onChannel(t: Transport, mode: 'direct' | 'relay'): void;
  /** Kalıcı hata (yeniden denenmez): taken (kurucu yeni kod dener), no-lobby, full, bad-request; unreachable: sunucuya hiç ulaşılamadı. */
  onError(code: LinkError): void;
}

/** Sunucuya canlılık ping'i (Cloudflare DO'yu uyandırmadan otomatik yanıtlanır); yalnızca Worker bağlantısı açıkken. */
const SERVER_PING_MS = 20_000;
/** Bu kadar doğrudan deneme (her biri en çok CHANNEL_WATCHDOG_MS) başarısız olursa röleye geçilir. */
const MAX_DIRECT_ATTEMPTS = 2;
/** Doğrudan kanal açıldıktan bu kadar sonra Worker bağlantısı kapatılır (signaling bitti). */
const PARK_AFTER_MS = 3000;
const PROBE_MS = 5_000;
const CHANNEL_WATCHDOG_MS = 15_000;
const MAX_SIGNAL = 7000;

/** RTCDataChannel'ı Transport arayüzüne sarar. */
class ChannelTransport implements Transport {
  private readonly msg: Array<(t: string) => void> = [];
  private readonly closers: Array<() => void> = [];
  private closed = false;
  constructor(private readonly dc: RTCDataChannel) {
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') for (const m of this.msg) m(e.data);
    };
    dc.onclose = () => this.close();
  }
  get open(): boolean {
    return !this.closed && this.dc.readyState === 'open';
  }
  send(text: string): void {
    if (this.open) this.dc.send(text);
  }
  onMessage(cb: (t: string) => void): void {
    this.msg.push(cb);
  }
  onClose(cb: () => void): void {
    this.closers.push(cb);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.dc.close();
    } catch {
      /* zaten kapalı */
    }
    for (const c of this.closers) c();
  }
}

/** Röle kanalı: oyun mesajları Worker WebSocket'i üzerinden {t:'relay', d}. */
class RelayTransport implements Transport {
  private readonly msg: Array<(t: string) => void> = [];
  private readonly closers: Array<() => void> = [];
  private closed = false;
  constructor(
    private readonly sendRaw: (text: string) => boolean,
    private readonly isUp: () => boolean,
  ) {}
  get open(): boolean {
    return !this.closed && this.isUp();
  }
  send(text: string): void {
    if (this.open) this.sendRaw(text);
  }
  deliver(text: string): void {
    if (!this.closed) for (const m of this.msg) m(text);
  }
  onMessage(cb: (t: string) => void): void {
    this.msg.push(cb);
  }
  onClose(cb: () => void): void {
    this.closers.push(cb);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.closers) c();
  }
}

export class WebRtcLink {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private transport: ChannelTransport | null = null;
  private relayT: RelayTransport | null = null;
  /** Röle seçildi (bu lobide doğrudan kanal kurulamadı): yeniden bağlanmada da röle kullanılır. */
  private relayMode = false;
  private attempts = 0;
  /** Doğrudan kanal açık, Worker bağlantısı bilerek kapalı. */
  private parked = false;
  private parkTimer = 0;
  private epoch = 0;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private stopped = false;
  private welcomed = false;
  private everOnline = false;
  private failures = 0;
  private view: ServerView = { online: false, peerPresent: false };
  private timers: number[] = [];
  private retryTimer = 0;
  private watchdog = 0;
  /** Kota ölçümü: Worker'a açılan bağlantı sayısı ve gönderilen mesaj sayısı (ping dahil; Cloudflare gelen mesajları sayar). */
  readonly stats = { connects: 0, sent: 0, relaySent: 0 };
  /** Debug: tüm gelen/giden signaling + kanal mesajlarını geciktir (ms). */
  latencyMs = 0;

  constructor(
    private readonly url: string,
    private readonly code: string,
    private readonly role: 'host' | 'guest',
    private readonly peerId: string,
    private readonly iceServers: IceServer[],
    private readonly cb: LinkCallbacks,
    private readonly opts: { forceRelay?: boolean } = {},
  ) {}

  /** Şu anki kanal türü (yoksa null). */
  get mode(): 'direct' | 'relay' | null {
    return this.transport?.open ? 'direct' : this.relayT?.open ? 'relay' : null;
  }

  private channelOpen(): boolean {
    return !!this.transport?.open || !!this.relayT?.open;
  }

  start(): void {
    this.stopped = false;
    this.connectSocket();
    this.timers.push(window.setInterval(() => this.sendServer({ t: 'ping' }), SERVER_PING_MS));
    this.timers.push(window.setInterval(() => !this.channelOpen() && this.view.online && this.sendServer({ t: 'probe' }), PROBE_MS));
  }

  /** Kapat: `leave` true ise sunucuya bilerek ayrıldığımızı bildir (katılanın yeri boşalır / kurucunun lobisi kapanır). */
  stop(leave: boolean): void {
    if (leave) this.sendServer({ t: 'leave' });
    this.stopped = true;
    this.parked = false;
    for (const t of this.timers) window.clearInterval(t);
    this.timers = [];
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.watchdog);
    window.clearTimeout(this.parkTimer);
    this.closePeer();
    this.relayT?.close();
    const ws = this.ws;
    this.ws = null;
    if (ws) window.setTimeout(() => ws.close(), leave ? 150 : 0);
    this.setView({ online: false, peerPresent: this.view.peerPresent });
  }

  /** Debug: eşler arası kanalı koparır (sunucu bağlantısı durur); kurucu kısa süre sonra yeniden kurar. */
  dropChannel(): void {
    this.transport?.close();
    this.relayT?.close();
    this.closePeer();
    if (this.role === 'host') this.scheduleRenegotiate(3000);
  }

  get serverView(): ServerView {
    return { ...this.view };
  }

  // ------------------------------------------------------------ signaling (WebSocket)

  private connectSocket(): void {
    if (this.stopped) return;
    const u = `${this.url}/lobby/${this.code}?role=${this.role}&id=${this.peerId}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(u);
    } catch {
      this.cb.onError('unreachable');
      return;
    }
    this.ws = ws;
    this.stats.connects++;
    ws.onmessage = (e) => this.later(() => this.onServerMessage(typeof e.data === 'string' ? e.data : ''));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.parked) return; // bilerek kapatıldı: doğrudan kanal açık
      this.relayT?.close(); // röle bu bağlantıdan geçiyordu
      this.setView({ online: false, peerPresent: this.view.peerPresent });
      if (this.stopped) return;
      this.failures++;
      if (!this.everOnline && this.failures >= 3) {
        this.cb.onError('unreachable');
        return;
      }
      this.retryTimer = window.setTimeout(() => this.connectSocket(), Math.min(5000, 800 * this.failures));
    };
  }

  private sendServer(msg: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    this.stats.sent++;
    if ((msg as { t?: string }).t === 'relay') this.stats.relaySent++;
    return true;
  }

  private setView(v: ServerView): void {
    this.view = v;
    this.cb.onServer({ ...v });
  }

  private later(fn: () => void): void {
    if (this.latencyMs > 0) window.setTimeout(fn, this.latencyMs);
    else fn();
  }

  private onServerMessage(text: string): void {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': {
        this.failures = 0;
        this.everOnline = true;
        const peer = m.peer === true;
        this.setView({ online: true, peerPresent: peer });
        if (!this.welcomed) {
          this.welcomed = true;
          this.cb.onWelcome(peer);
        }
        if (peer && this.role === 'host' && !this.channelOpen()) this.connectPeer();
        return;
      }
      case 'peer': {
        const present = m.present === true;
        this.setView({ online: true, peerPresent: present });
        // Eş (yeniden) geldi ve kanal yok: kurucu yeni bağlantı kurar (eski, yarı ölü bağlantı varsa kapatılır)
        if (present && this.role === 'host' && !this.channelOpen()) this.connectPeer();
        return;
      }
      case 'relay':
        if (typeof m.d === 'string') this.relayT?.deliver(m.d);
        return;
      case 'signal':
        if (m.data && typeof m.data === 'object') void this.onSignal(m.data as Record<string, unknown>);
        return;
      case 'error': {
        const code = String(m.code) as LinkError;
        if (code === 'rate') return;
        this.stopped = true; // kalıcı: yeniden bağlanma yok
        this.cb.onError(code);
        return;
      }
    }
  }

  // ------------------------------------------------------------ WebRTC

  private closePeer(): void {
    window.clearTimeout(this.watchdog);
    const pc = this.pc;
    this.pc = null;
    this.pendingCandidates = [];
    if (pc) {
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch {
        /* zaten kapalı */
      }
    }
  }

  private newPeer(epoch: number): RTCPeerConnection {
    this.closePeer();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers as RTCIceServer[] });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate && this.pc === pc) this.sendServer({ t: 'signal', data: { e: epoch, cand: e.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.transport?.close();
        if (this.role === 'host') this.scheduleRenegotiate(2000);
      }
    };
    // Kanal belli sürede açılmazsa (ağ engeli) kurucu yeniden dener
    this.watchdog = window.setTimeout(() => {
      if (this.pc === pc && !this.channelOpen() && this.role === 'host' && this.view.peerPresent) this.negotiate();
    }, CHANNEL_WATCHDOG_MS);
    return pc;
  }

  /** Kurucu: kanal yoksa doğrudan dene ya da (röle seçildiyse) röleyi aç. */
  private connectPeer(): void {
    if (this.relayMode) this.startRelay();
    else this.negotiate();
  }

  /** Kurucu: röleye geç ve katılana haber ver (signal {relay:true}); sonra iki taraf mesajları Worker'dan aktarır. */
  private startRelay(): void {
    if (this.role !== 'host' || this.stopped) return;
    this.relayMode = true;
    this.closePeer();
    if (!this.sendServer({ t: 'signal', data: { relay: true } })) return;
    this.openRelay();
  }

  private openRelay(): void {
    this.relayT?.close();
    const t = new RelayTransport(
      (text) => this.sendServer({ t: 'relay', d: text }),
      () => this.ws?.readyState === WebSocket.OPEN,
    );
    this.relayT = t;
    t.onClose(() => {
      if (this.relayT === t) this.relayT = null;
    });
    this.cb.onChannel(t, 'relay');
  }

  /** Doğrudan kanal açık: signaling bitti, Worker bağlantısını kapat (lobide boşta bekleme kota yemesin). */
  private park(): void {
    window.clearTimeout(this.parkTimer);
    this.parkTimer = window.setTimeout(() => {
      if (this.stopped || !this.transport?.open || this.parked) return;
      this.parked = true;
      this.setView({ online: true, peerPresent: true }); // kanal açık = ikimiz de buradayız
      const ws = this.ws;
      this.ws = null;
      ws?.close(1000, 'parked');
    }, PARK_AFTER_MS);
  }

  /** Doğrudan kanal düştü: Worker bağlantısını yeniden aç (kim koptu bilgisi ve yeniden bağlanma için). */
  private unpark(): void {
    window.clearTimeout(this.parkTimer);
    if (!this.parked || this.stopped) return;
    this.parked = false;
    this.setView({ online: false, peerPresent: false });
    this.connectSocket();
  }

  private wireChannel(dc: RTCDataChannel): void {
    dc.onopen = () => {
      const t = new ChannelTransport(dc);
      const prev = this.transport;
      this.transport = t;
      prev?.close();
      this.attempts = 0;
      t.onClose(() => {
        if (this.transport === t) this.transport = null;
        if (this.parked) this.unpark();
        else if (this.role === 'host' && !this.stopped) this.scheduleRenegotiate(2000);
      });
      // Debug gecikmesi: gelen mesajlar geciktirilir (giden zaten karşıda geciktirilir)
      const wrapped: Transport = {
        send: (text) => t.send(text),
        onMessage: (cb) => t.onMessage((x) => this.later(() => cb(x))),
        onClose: (cb) => t.onClose(cb),
        close: () => t.close(),
        get open() {
          return t.open;
        },
      };
      this.cb.onChannel(wrapped, 'direct');
      this.park();
    };
  }

  private scheduleRenegotiate(ms: number): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (!this.stopped && this.view.online && this.view.peerPresent && !this.channelOpen()) this.connectPeer();
    }, ms);
  }

  /** Kurucu: yeni bağlantı + kanal + teklif. */
  private negotiate(): void {
    if (this.role !== 'host' || this.stopped) return;
    // Doğrudan bağlantı tekrar tekrar kurulamadı (sıkı ağ / NAT): röle yedeği
    if (this.opts.forceRelay || this.attempts >= MAX_DIRECT_ATTEMPTS) {
      this.startRelay();
      return;
    }
    this.attempts++;
    const epoch = ++this.epoch;
    const pc = this.newPeer(epoch);
    this.wireChannel(pc.createDataChannel('game', { ordered: true }));
    void pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (this.pc === pc && pc.localDescription) this.sendServer({ t: 'signal', data: { e: epoch, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } } });
      })
      .catch(() => this.scheduleRenegotiate(3000));
  }

  /** Eşten gelen signaling verisi (güvenilmez girdi: biçim ve boyut denetlenir). */
  private async onSignal(d: Record<string, unknown>): Promise<void> {
    if (d.relay === true && this.role === 'guest') {
      // Kurucu röleye geçti: doğrudan bağlantı denemesi bırakılır
      this.relayMode = true;
      this.closePeer();
      this.openRelay();
      return;
    }
    const e = typeof d.e === 'number' && Number.isInteger(d.e) ? d.e : -1;
    const sdp = d.sdp as { type?: unknown; sdp?: unknown } | undefined;
    if (sdp && typeof sdp === 'object') {
      if ((sdp.type !== 'offer' && sdp.type !== 'answer') || typeof sdp.sdp !== 'string' || sdp.sdp.length > MAX_SIGNAL) return;
      if (sdp.type === 'offer' && this.role === 'guest') {
        this.epoch = e;
        const pc = this.newPeer(e);
        pc.ondatachannel = (ev) => this.wireChannel(ev.channel);
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: sdp.sdp });
          await this.flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (this.pc === pc && pc.localDescription) this.sendServer({ t: 'signal', data: { e, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } } });
        } catch {
          /* bozuk teklif: kurucu yeniden dener */
        }
      } else if (sdp.type === 'answer' && this.role === 'host' && e === this.epoch && this.pc) {
        try {
          await this.pc.setRemoteDescription({ type: 'answer', sdp: sdp.sdp });
          await this.flushCandidates(this.pc);
        } catch {
          this.scheduleRenegotiate(3000);
        }
      }
      return;
    }
    const cand = d.cand as RTCIceCandidateInit | undefined;
    if (cand && typeof cand === 'object' && typeof cand.candidate === 'string' && cand.candidate.length < 1000 && e === this.epoch) {
      const pc = this.pc;
      if (pc?.remoteDescription) await pc.addIceCandidate(cand).catch(() => undefined);
      else if (this.pendingCandidates.length < 50) this.pendingCandidates.push(cand);
    }
  }

  private async flushCandidates(pc: RTCPeerConnection): Promise<void> {
    const list = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of list) await pc.addIceCandidate(c).catch(() => undefined);
  }
}
