/**
 * Lobi sunucusunun saf kuralları (Cloudflare'e bağımlı değil; oyunun testleri Node'da sınar: tests/multiplayer-worker.test.ts).
 * Worker yalnızca buluşmayı (signaling) yapar: iki eş arasında SDP/ICE mesajlarını aktarır. Oyun verisi buradan geçmez.
 */

/** Oyunla aynı alfabe ve uzunluk (src/net/lobby-code.ts; test eşitliği denetler). */
export const LOBBY_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const LOBBY_CODE_LENGTH = 6;
/** İstemci mesajının en büyük boyutu (SDP ~3-6 KB; röle mesajı oyunun 16 KB sınırının JSON kaçışlı hali için biraz geniş). */
export const MAX_CLIENT_MESSAGE = 24_576;
/** Röle (yedek) oyun mesajının en büyük boyutu (oyun tarafı MAX_MESSAGE_CHARS ile aynı). */
export const MAX_RELAY = 16_384;
/** Eş başına hız sınırı: RATE_WINDOW_MS içinde en çok RATE_LIMIT mesaj. */
export const RATE_LIMIT = 100;
export const RATE_WINDOW_MS = 10_000;
/** Bu kadar süredir ping atmayan eş "yok" sayılır (istemci 20 sn'de bir ping atar). */
export const PEER_IDLE_MS = 50_000;
/** Boşta kalan lobi bu süre sonra silinir. */
export const LOBBY_TTL_MS = 2 * 60 * 60 * 1000;

export type Role = 'host' | 'guest';

export const isValidCode = (code: string): boolean => new RegExp(`^[${LOBBY_ALPHABET}]{${LOBBY_CODE_LENGTH}}$`).test(code);
export const isValidPeerId = (id: string): boolean => /^[a-z0-9]{16}$/.test(id);

/** `/lobby/<KOD>?role=host|guest&id=<sekme kimliği>` adresini çözer. */
export function parseJoin(url: string): { code: string; role: Role; id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^\/lobby\/([A-Z0-9]+)\/?$/.exec(u.pathname);
  const role = u.searchParams.get('role');
  const id = u.searchParams.get('id') ?? '';
  if (!m || !isValidCode(m[1]!) || (role !== 'host' && role !== 'guest') || !isValidPeerId(id)) return null;
  return { code: m[1]!, role, id };
}

/**
 * İzinli köken mi? Liste virgülle ayrılır; bir giriş tam köken ("https://omerbekin.github.io") ya da port joker'li
 * ("http://localhost:*") olabilir. Köken yoksa (tarayıcı dışı istemci) reddedilir.
 */
export function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return false;
  return allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((entry) => (entry.endsWith(':*') ? origin.startsWith(entry.slice(0, -1)) && /^\d{1,5}$/.test(origin.slice(entry.length - 1)) : origin === entry));
}

/** Lobinin kalıcı durumu: ilk gelen kurucu ve katılanın sekme kimlikleri (rol sahipliği; kodu sonradan bulan üçüncü kişi giremez). */
export interface LobbyState {
  hostId: string | null;
  guestId: string | null;
}

export type AdmitError = 'taken' | 'full' | 'no-lobby';

/** Bağlanma isteğini değerlendirir; kabul edilirse yeni durum döner. Aynı kimlik yeniden bağlanabilir (eski bağlantının yerini alır). */
export function admit(state: LobbyState, role: Role, id: string): { ok: true; state: LobbyState } | { ok: false; error: AdmitError } {
  if (role === 'host') {
    if (state.hostId && state.hostId !== id) return { ok: false, error: 'taken' };
    if (state.guestId === id) return { ok: false, error: 'taken' };
    return { ok: true, state: { ...state, hostId: id } };
  }
  if (!state.hostId) return { ok: false, error: 'no-lobby' };
  if (state.hostId === id) return { ok: false, error: 'full' };
  if (state.guestId && state.guestId !== id) return { ok: false, error: 'full' };
  return { ok: true, state: { ...state, guestId: id } };
}

/** Bilerek ayrılma: katılan çıkarsa yeri boşalır (başka biri katılabilir); kurucu çıkarsa lobi kapanır. */
export function leave(state: LobbyState, role: Role): LobbyState {
  return role === 'guest' ? { ...state, guestId: null } : { hostId: null, guestId: null };
}

export type ClientMessage = { t: 'signal'; data: Record<string, unknown> } | { t: 'relay'; d: string } | { t: 'probe' } | { t: 'leave' };

/** İstemci mesajını doğrular (boyut, tür, alanlar). Geçersizse null. */
export function parseClientMessage(text: unknown): ClientMessage | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_CLIENT_MESSAGE) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (o.t === 'probe' || o.t === 'leave') return keys.length === 1 ? { t: o.t } : null;
  if (o.t === 'relay') return keys.length === 2 && typeof o.d === 'string' && o.d.length > 0 && o.d.length <= MAX_RELAY ? { t: 'relay', d: o.d } : null;
  if (o.t === 'signal' && keys.length === 2 && typeof o.data === 'object' && o.data !== null && !Array.isArray(o.data)) return { t: 'signal', data: o.data as Record<string, unknown> };
  return null;
}

/** Kayan pencere hız sınırı (bağlantıya iliştirilen küçük durum; saf). */
export interface RateState {
  start: number;
  count: number;
}

export function rateAllow(r: RateState, now: number): { ok: boolean; next: RateState } {
  if (now - r.start >= RATE_WINDOW_MS) return { ok: true, next: { start: now, count: 1 } };
  if (r.count >= RATE_LIMIT) return { ok: false, next: r };
  return { ok: true, next: { start: r.start, count: r.count + 1 } };
}

/** Eş canlı mı (son ping ya da bağlanma anı PEER_IDLE_MS'ten yeni mi)? */
export const peerAlive = (lastSeen: number, now: number): boolean => now - lastSeen < PEER_IDLE_MS;
