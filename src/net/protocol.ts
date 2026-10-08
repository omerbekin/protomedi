/**
 * Eşler arası (DataChannel) oyun mesajlarının şeması ve sıkı doğrulaması (saf). Ayrıntı: docs/design/multiplayer.md bölüm 3.
 * Kural: gelen her ham metin `parseMessage`'dan geçer; şemaya birebir uymayan (fazla alan, yanlış tür, aralık dışı) mesaj null olur.
 */
export const PROTOCOL_VERSION = 1;
/** Bir mesajın en büyük boyutu (karakter). */
export const MAX_MESSAGE_CHARS = 16_384;
/** catchup mesajı başına en çok hamle. */
export const CATCHUP_CHUNK = 25;
/** Bir maçta kabul edilen en çok hamle (sonsuz döngü / şişirme koruması). */
export const MAX_MOVES = 5000;
export const CELLS = 12;

export type NetSide = 'party' | 'enemy';
export type Phase = 'lobby' | 'teams' | 'battle' | 'result';

export interface WireChoice {
  skillId: string;
  targetUid?: string;
  slot?: number;
  board?: NetSide;
  corpseUid?: string;
}

/** Bir hamle: aktör + seçim (null = pas: birimin hiçbir eylemi yok) + hamle öncesi durum özeti. */
export interface MoveRecord {
  seq: number;
  actor: string;
  choice: WireChoice | null;
  before: string;
}

export type NetMessage =
  | { t: 'hello'; v: number; build: string; match: string | null; count: number; phase: Phase; name?: string }
  | { t: 'name'; name: string }
  | { t: 'commit'; c: string }
  | { t: 'reveal'; n: string }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  | { t: 'ready'; on: boolean }
  | { t: 'phase'; to: 'lobby' | 'teams' }
  | { t: 'team'; cells: string[]; ready: boolean }
  | { t: 'start'; match: string; seed: number; host: string[]; guest: string[] }
  | ({ t: 'move'; match: string } & MoveRecord)
  | { t: 'ack'; match: string; seq: number; hash: string }
  | { t: 'catchup'; match: string; from: number; moves: MoveRecord[] }
  | { t: 'rematch'; on: boolean }
  | { t: 'ended'; match: string; winner: NetSide; reason: 'forfeit' | 'left' }
  | { t: 'desync'; match: string; seq: number }
  | { t: 'leave' };

export type MessageType = NetMessage['t'];

// --- küçük denetçiler ---
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const matches = (v: unknown, re: RegExp): v is string => typeof v === 'string' && re.test(v);
const ID_RE = /^[a-z0-9_]{1,40}$/;
const UID_RE = /^[a-z0-9:_-]{1,40}$/;
const MATCH_RE = /^[A-Za-z0-9]{1,16}$/;
const HASH_RE = /^[0-9a-f]{8}$/;
const BUILD_RE = /^[A-Za-z0-9._-]{1,64}$/;
const NAME_RE = /^[\p{L}\p{N} ]{1,16}$/u;
const COMMIT_RE = /^[0-9a-f]{64}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const isSide = (v: unknown): v is NetSide => v === 'party' || v === 'enemy';
const isPhase = (v: unknown): v is Phase => v === 'lobby' || v === 'teams' || v === 'battle' || v === 'result';
/** Nesnede yalnızca izinli anahtarlar var mı (fazla alan = reddedilir). */
const onlyKeys = (o: Obj, allowed: string[]): boolean => Object.keys(o).every((k) => allowed.includes(k));

/** Hücre listesi: tam 12 hücre, her biri '' ya da class kimliği biçiminde. (Class'ın gerçekten var olması oturumda denetlenir.) */
export function isCells(v: unknown): v is string[] {
  return Array.isArray(v) && v.length === CELLS && v.every((c) => c === '' || matches(c, ID_RE));
}

export function isChoice(v: unknown): v is WireChoice {
  if (!isObj(v) || !onlyKeys(v, ['skillId', 'targetUid', 'slot', 'board', 'corpseUid'])) return false;
  if (!matches(v.skillId, ID_RE)) return false;
  if (v.targetUid !== undefined && !matches(v.targetUid, UID_RE)) return false;
  if (v.slot !== undefined && !isInt(v.slot, 0, CELLS - 1)) return false;
  if (v.board !== undefined && !isSide(v.board)) return false;
  if (v.corpseUid !== undefined && !matches(v.corpseUid, UID_RE)) return false;
  return true;
}

function isMove(v: unknown): v is MoveRecord {
  if (!isObj(v) || !onlyKeys(v, ['seq', 'actor', 'choice', 'before'])) return false;
  return isInt(v.seq, 0, MAX_MOVES) && matches(v.actor, UID_RE) && (v.choice === null || isChoice(v.choice)) && matches(v.before, HASH_RE);
}

const SHAPES: Record<MessageType, (o: Obj) => boolean> = {
  hello: (o) =>
    onlyKeys(o, ['t', 'v', 'build', 'match', 'count', 'phase', 'name']) &&
    isInt(o.v, 0, 1000) &&
    matches(o.build, BUILD_RE) &&
    (o.match === null || matches(o.match, MATCH_RE)) &&
    isInt(o.count, 0, MAX_MOVES) &&
    isPhase(o.phase) &&
    (o.name === undefined || matches(o.name, NAME_RE)),
  name: (o) => onlyKeys(o, ['t', 'name']) && matches(o.name, NAME_RE),
  commit: (o) => onlyKeys(o, ['t', 'c']) && matches(o.c, COMMIT_RE),
  reveal: (o) => onlyKeys(o, ['t', 'n']) && matches(o.n, NONCE_RE),
  ping: (o) => onlyKeys(o, ['t', 'n']) && isInt(o.n, 0, Number.MAX_SAFE_INTEGER),
  pong: (o) => onlyKeys(o, ['t', 'n']) && isInt(o.n, 0, Number.MAX_SAFE_INTEGER),
  ready: (o) => onlyKeys(o, ['t', 'on']) && isBool(o.on),
  phase: (o) => onlyKeys(o, ['t', 'to']) && (o.to === 'lobby' || o.to === 'teams'),
  team: (o) => onlyKeys(o, ['t', 'cells', 'ready']) && isCells(o.cells) && isBool(o.ready),
  start: (o) => onlyKeys(o, ['t', 'match', 'seed', 'host', 'guest']) && matches(o.match, MATCH_RE) && isInt(o.seed, 0, 2 ** 31 - 1) && isCells(o.host) && isCells(o.guest),
  move: (o) => {
    const { t: _t, match, ...rest } = o;
    return matches(match, MATCH_RE) && isMove(rest);
  },
  ack: (o) => onlyKeys(o, ['t', 'match', 'seq', 'hash']) && matches(o.match, MATCH_RE) && isInt(o.seq, 0, MAX_MOVES) && matches(o.hash, HASH_RE),
  catchup: (o) =>
    onlyKeys(o, ['t', 'match', 'from', 'moves']) &&
    matches(o.match, MATCH_RE) &&
    isInt(o.from, 0, MAX_MOVES) &&
    Array.isArray(o.moves) &&
    o.moves.length <= CATCHUP_CHUNK &&
    o.moves.every((m, i) => isMove(m) && m.seq === (o.from as number) + i),
  rematch: (o) => onlyKeys(o, ['t', 'on']) && isBool(o.on),
  ended: (o) => onlyKeys(o, ['t', 'match', 'winner', 'reason']) && matches(o.match, MATCH_RE) && isSide(o.winner) && (o.reason === 'forfeit' || o.reason === 'left'),
  desync: (o) => onlyKeys(o, ['t', 'match', 'seq']) && matches(o.match, MATCH_RE) && isInt(o.seq, 0, MAX_MOVES),
  leave: (o) => onlyKeys(o, ['t']),
};

/** Ham metni doğrular ve mesaja çevirir; geçersizse null (sebep bilinmez: kötü niyetli girdiye bilgi verilmez). */
export function parseMessage(raw: unknown): NetMessage | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_MESSAGE_CHARS) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.t !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPES, v.t)) return null;
  return SHAPES[v.t as MessageType](v) ? (v as unknown as NetMessage) : null;
}

export function encodeMessage(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/**
 * Oyuncu adı temizliği: yalnızca harf/rakam/boşluk, baş/son boşluk atılır, çoklu boşluk teke iner, en çok 16 karakter.
 * Boş kalırsa '' (ekranda 'Player 1/2' gösterilir).
 */
export function sanitizeName(raw: string): string {
  return Array.from(raw.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('').trim();
}

/** Motorun ChoiceLike'ını ağ biçimine çevirir (tanımsız alanlar atılır). */
export function toWireChoice(c: { skillId: string; targetUid?: string; slot?: number; board?: NetSide; corpseUid?: string } | null): WireChoice | null {
  if (!c) return null;
  const out: WireChoice = { skillId: c.skillId };
  if (c.targetUid !== undefined) out.targetUid = c.targetUid;
  if (c.slot !== undefined) out.slot = c.slot;
  if (c.board !== undefined) out.board = c.board;
  if (c.corpseUid !== undefined) out.corpseUid = c.corpseUid;
  return out;
}

/** Saniye başına mesaj sınırı (eş başına): pencere içinde `limit`'ten fazlası atılır. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly limit = 60,
    private readonly windowMs = 1000,
  ) {}
  allow(now: number): boolean {
    while (this.stamps.length && now - this.stamps[0]! >= this.windowMs) this.stamps.shift();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}
