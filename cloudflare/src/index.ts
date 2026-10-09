/**
 * Embers of Valdoria lobi / signaling sunucusu: Cloudflare Worker + Durable Object (lobi kodu başına bir tane).
 * Yalnızca iki tarayıcıyı buluşturur (WebRTC SDP/ICE aktarımı); oyun hamleleri eşler arasında doğrudan akar.
 * Kurallar saf modülde: ./lobby-logic.ts. Kurulum: ../README.md.
 *
 * Tek Worker, tek adres (https://eov.backinn.com.tr): oyunun statik dosyaları Workers Static Assets ile sunulur (wrangler.toml > [assets];
 * yalnızca /lobby ve /lobby/* bu koda gelir, run_worker_first), geri kalan istekler doğrudan dosyadır.
 * Uç nokta: GET /lobby/<KOD>?role=host|guest&id=<16 karakter> (WebSocket yükseltmesi). GET /lobby, /lobby/health -> sağlık metni.
 * Oyundaki adres: data/multiplayer.json > signalingUrl = wss://eov.backinn.com.tr/lobby (istemci sonuna /<KOD> ekler).
 * Sunucu -> istemci: {t:'welcome', role, peer}, {t:'peer', present}, {t:'signal', data}, {t:'relay', d}, {t:'error', code}, {t:'pong'}.
 * İstemci -> sunucu: {t:'signal', data}, {t:'relay', d} (yalnızca WebRTC kurulamazsa), {t:'probe'}, {t:'leave'}, {t:'ping'} (ping'i Cloudflare DO'yu uyandırmadan yanıtlar).
 */
import { DurableObject } from 'cloudflare:workers';
import { admit, leave, LOBBY_TTL_MS, originAllowed, parseClientMessage, parseJoin, peerAlive, rateAllow, type LobbyState, type RateState, type Role } from './lobby-logic';

interface Env {
  LOBBY: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  /** Oyunun statik dosyaları (../dist). Yerel `wrangler dev` dışında her zaman vardır. */
  ASSETS?: Fetcher;
}

/** Bağlantıya iliştirilen durum (hibernation sonrası da korunur; 2 KB sınırı). */
interface Attachment {
  role: Role;
  id: string;
  since: number;
  rate: RateState;
}

const json = (ws: WebSocket, msg: unknown): void => {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* kapanmış bağlantı */
  }
};

/** Hata koduyla hemen kapanan WebSocket (tarayıcı sebebi okuyabilsin diye 101 ile döner). */
function refuse(code: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  json(server, { t: 'error', code });
  server.close(4000, code);
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/lobby' || p === '/lobby/' || p === '/lobby/health' || p === '/health') return new Response('Embers of Valdoria lobby server OK\n', { headers: { 'content-type': 'text/plain' } });
    // Lobi dışı istek (yalnızca statik dosya bulunamadığında buraya düşer): dosya sunucusuna bırakılır (404)
    if (!p.startsWith('/lobby/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    if (!originAllowed(req.headers.get('Origin'), env.ALLOWED_ORIGINS ?? '')) return new Response('Origin not allowed', { status: 403 });
    const join = parseJoin(req.url);
    if (!join) return refuse('bad-request');
    const stub = env.LOBBY.get(env.LOBBY.idFromName(join.code));
    return stub.fetch(req);
  },
};

export class Lobby extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Canlılık ping'i DO'yu uyandırmadan yanıtlanır; son yanıt zamanı getWebSocketAutoResponseTimestamp ile okunur
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private async state(): Promise<LobbyState> {
    return ((await this.ctx.storage.get('state')) as LobbyState | undefined) ?? { hostId: null, guestId: null };
  }

  private sockets(role: Role): WebSocket[] {
    return this.ctx.getWebSockets(role);
  }

  private lastSeen(ws: WebSocket): number {
    const a = ws.deserializeAttachment() as Attachment | null;
    const auto = this.ctx.getWebSocketAutoResponseTimestamp(ws);
    return Math.max(a?.since ?? 0, auto ? auto.getTime() : 0);
  }

  private present(role: Role): boolean {
    const now = Date.now();
    return this.sockets(role).some((ws) => peerAlive(this.lastSeen(ws), now));
  }

  async fetch(req: Request): Promise<Response> {
    const join = parseJoin(req.url);
    if (!join) return refuse('bad-request');
    const res = admit(await this.state(), join.role, join.id);
    if (!res.ok) return refuse(res.error);
    await this.ctx.storage.put('state', res.state);
    // Aynı rolün eski bağlantısı (aynı sekmenin kopan bağlantısı) kapatılır
    for (const old of this.sockets(join.role)) {
      try {
        old.close(4001, 'replaced');
      } catch {
        /* zaten kapalı */
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [join.role]);
    const att: Attachment = { role: join.role, id: join.id, since: Date.now(), rate: { start: Date.now(), count: 0 } };
    server.serializeAttachment(att);
    const other: Role = join.role === 'host' ? 'guest' : 'host';
    json(server, { t: 'welcome', role: join.role, peer: this.present(other) });
    for (const ws of this.sockets(other)) json(ws, { t: 'peer', present: true });
    await this.ctx.storage.setAlarm(Date.now() + LOBBY_TTL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return ws.close(4002, 'bad-state');
    const rate = rateAllow(att.rate, Date.now());
    att.rate = rate.next;
    ws.serializeAttachment(att);
    if (!rate.ok) {
      json(ws, { t: 'error', code: 'rate' });
      return;
    }
    const msg = parseClientMessage(typeof message === 'string' ? message : '');
    if (!msg) {
      json(ws, { t: 'error', code: 'bad-request' });
      return;
    }
    const other: Role = att.role === 'host' ? 'guest' : 'host';
    if (msg.t === 'signal') {
      for (const peer of this.sockets(other)) json(peer, { t: 'signal', data: msg.data });
    } else if (msg.t === 'relay') {
      // Röle yedeği: doğrudan WebRTC kurulamadıysa oyun mesajı olduğu gibi eşe aktarılır (okunmaz, saklanmaz)
      for (const peer of this.sockets(other)) json(peer, { t: 'relay', d: msg.d });
    } else if (msg.t === 'probe') {
      json(ws, { t: 'peer', present: this.present(other) });
    } else if (msg.t === 'leave') {
      await this.ctx.storage.put('state', leave(await this.state(), att.role));
      for (const peer of this.sockets(other)) {
        json(peer, { t: 'peer', present: false });
        if (att.role === 'host') {
          json(peer, { t: 'error', code: 'no-lobby' });
          peer.close(4003, 'lobby closed');
        }
      }
      ws.close(1000, 'left');
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    try {
      ws.close(1000, 'closed');
    } catch {
      /* zaten kapalı */
    }
    if (!att) return;
    const other: Role = att.role === 'host' ? 'guest' : 'host';
    // Aynı rol yeniden bağlandıysa (replaced) eşe "gitti" deme
    const stillHere = this.sockets(att.role).some((s) => s !== ws && (s.deserializeAttachment() as Attachment | null)?.id === att.id);
    if (!stillHere) for (const peer of this.sockets(other)) json(peer, { t: 'peer', present: false });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Boşta kalan lobi silinir (kimse bağlı değilse); biri bağlıysa süre uzar. */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(Date.now() + LOBBY_TTL_MS);
  }
}
