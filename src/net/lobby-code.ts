/**
 * Lobi kodu (saf): 6 karakter, birbirine karışan harf/rakamlar yok (0/O, 1/I/L, 5/S, 2/Z, 8/B çiftleri ayıklandı).
 * Davet linki: oyunun adresi + `?lobby=KOD`. Worker aynı kuralı `cloudflare/src/lobby-logic.ts` içinde tekrarlar (test eşitliği denetler).
 */
export const LOBBY_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const LOBBY_CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${LOBBY_ALPHABET}]{${LOBBY_CODE_LENGTH}}$`);

/** Yeni kod. `rand` [0,1) üretir (tarayıcıda crypto tabanlı; testte sabit). */
export function generateLobbyCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) s += LOBBY_ALPHABET[Math.min(LOBBY_ALPHABET.length - 1, Math.floor(rand() * LOBBY_ALPHABET.length))];
  return s;
}

export const isValidLobbyCode = (code: string): boolean => CODE_RE.test(code);

/**
 * Kullanıcının yazdığı/yapıştırdığı metni koda çevirir: büyük harfe çevrilir, boşluk/tire/nokta/alt çizgi atılır. Alfabede olmayan
 * karakter varsa (ör. 0, O, 1) null. Davet linkinin tamamı yapıştırılırsa içindeki `lobby=` değeri alınır.
 */
export function normalizeLobbyCode(input: string): string | null {
  const fromLink = /[?&]lobby=([^&#\s]+)/i.exec(input);
  const raw = (fromLink ? fromLink[1]! : input).toUpperCase().replace(/[\s\-_.]/g, '');
  return isValidLobbyCode(raw) ? raw : null;
}

/** Davet linki: `base` sayfanın adresi (sorgu ve # atılır), sonuna `?lobby=KOD`. */
export function inviteLink(base: string, code: string): string {
  const clean = base.split('#')[0]!.split('?')[0]!;
  return `${clean}?lobby=${code}`;
}

/** Adres çubuğundaki `?lobby=KOD` (geçerliyse). */
export function lobbyFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get('lobby');
  return v ? normalizeLobbyCode(v) : null;
}

/** Ekranda okunur gösterim: "ACD EFG". */
export const formatLobbyCode = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Sekme kimliği (Worker'da rol sahipliği ve yeniden bağlanma için): 16 karakter [a-z0-9]. */
export function generatePeerId(rand: () => number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[Math.min(abc.length - 1, Math.floor(rand() * abc.length))];
  return s;
}

export const isValidPeerId = (id: string): boolean => /^[a-z0-9]{16}$/.test(id);
