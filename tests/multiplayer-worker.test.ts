import { describe, expect, it } from 'vitest';
import { admit, isValidCode, leave, LOBBY_ALPHABET as WORKER_ALPHABET, LOBBY_CODE_LENGTH as WORKER_LEN, MAX_CLIENT_MESSAGE, MAX_RELAY, originAllowed, parseClientMessage, parseJoin, peerAlive, PEER_IDLE_MS, rateAllow, RATE_LIMIT, RATE_WINDOW_MS } from '../cloudflare/src/lobby-logic';
import { generateLobbyCode, LOBBY_ALPHABET, LOBBY_CODE_LENGTH } from '../src/net/lobby-code';

const H = 'a'.repeat(16);
const G = 'b'.repeat(16);
const X = 'c'.repeat(16);

describe('lobi sunucusu (Cloudflare Worker) saf kuralları', () => {
  it('oyunla aynı kod alfabesi ve uzunluğu', () => {
    expect(WORKER_ALPHABET).toBe(LOBBY_ALPHABET);
    expect(WORKER_LEN).toBe(LOBBY_CODE_LENGTH);
    expect(isValidCode(generateLobbyCode(() => 0.42))).toBe(true);
  });

  it('bağlanma adresi çözümü: kod, rol, sekme kimliği zorunlu ve biçimli', () => {
    expect(parseJoin(`wss://x.workers.dev/lobby/ACDEFG?role=host&id=${H}`)).toEqual({ code: 'ACDEFG', role: 'host', id: H });
    expect(parseJoin(`wss://x/lobby/acdefg?role=host&id=${H}`)).toBeNull();
    expect(parseJoin(`wss://x/lobby/ACDEF0?role=host&id=${H}`)).toBeNull();
    expect(parseJoin(`wss://x/lobby/ACDEFG?role=admin&id=${H}`)).toBeNull();
    expect(parseJoin(`wss://x/lobby/ACDEFG?role=guest&id=short`)).toBeNull();
    expect(parseJoin('not a url')).toBeNull();
  });

  it('köken izni: GitHub Pages ve localhost (her port); diğerleri ve kökensiz istek reddedilir', () => {
    const allowed = 'https://omerbekin.github.io,http://localhost:*,http://127.0.0.1:*';
    expect(originAllowed('https://omerbekin.github.io', allowed)).toBe(true);
    expect(originAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(originAllowed('http://127.0.0.1:4173', allowed)).toBe(true);
    expect(originAllowed('https://omerbekin.github.io.evil.com', allowed)).toBe(false);
    expect(originAllowed('http://localhost.evil.com', allowed)).toBe(false);
    expect(originAllowed('http://localhost:5173x', allowed)).toBe(false);
    expect(originAllowed(null, allowed)).toBe(false);
  });

  it('rol sahipliği: kurucu ilk gelir; katılan kurucusuz giremez; kilitlenen kimlikler; üçüncü kişi giremez; aynı kimlik geri dönebilir', () => {
    const empty = { hostId: null, guestId: null };
    expect(admit(empty, 'guest', G)).toEqual({ ok: false, error: 'no-lobby' });
    const s1 = admit(empty, 'host', H);
    if (!s1.ok) throw new Error('host');
    expect(admit(s1.state, 'host', X)).toEqual({ ok: false, error: 'taken' });
    expect(admit(s1.state, 'guest', H)).toEqual({ ok: false, error: 'full' });
    const s2 = admit(s1.state, 'guest', G);
    if (!s2.ok) throw new Error('guest');
    expect(admit(s2.state, 'guest', X)).toEqual({ ok: false, error: 'full' });
    expect(admit(s2.state, 'guest', G).ok).toBe(true); // yeniden bağlanma
    expect(admit(s2.state, 'host', H).ok).toBe(true);
    // Katılan bilerek çıkarsa yeri boşalır; kurucu çıkarsa lobi kapanır
    expect(admit(leave(s2.state, 'guest'), 'guest', X).ok).toBe(true);
    expect(admit(leave(s2.state, 'host'), 'guest', G)).toEqual({ ok: false, error: 'no-lobby' });
  });

  it('istemci mesajı doğrulaması ve hız sınırı', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'signal', data: { sdp: 'x' } }))).toEqual({ t: 'signal', data: { sdp: 'x' } });
    expect(parseClientMessage('{"t":"probe"}')).toEqual({ t: 'probe' });
    expect(parseClientMessage('{"t":"leave"}')).toEqual({ t: 'leave' });
    expect(parseClientMessage(JSON.stringify({ t: 'relay', d: '{"t":"ping","n":1}' }))).toEqual({ t: 'relay', d: '{"t":"ping","n":1}' });
    expect(parseClientMessage(JSON.stringify({ t: 'relay', d: '' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'relay', d: 5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'relay', d: 'x'.repeat(MAX_RELAY + 1) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'relay', d: 'x', extra: 1 }))).toBeNull();
    for (const bad of ['', 'x', '[]', '{"t":"signal","data":[1]}', '{"t":"signal","data":{},"x":1}', '{"t":"probe","x":1}', '{"t":"admin"}', 'x'.repeat(MAX_CLIENT_MESSAGE + 1)]) expect(parseClientMessage(bad), bad.slice(0, 40)).toBeNull();
    let r = { start: 0, count: 0 };
    let okCount = 0;
    for (let i = 0; i < RATE_LIMIT + 20; i++) {
      const a = rateAllow(r, 100);
      r = a.next;
      if (a.ok) okCount++;
    }
    expect(okCount).toBe(RATE_LIMIT);
    expect(rateAllow(r, RATE_WINDOW_MS + 1).ok).toBe(true);
    expect(peerAlive(0, PEER_IDLE_MS - 1)).toBe(true);
    expect(peerAlive(0, PEER_IDLE_MS)).toBe(false);
  });
});
