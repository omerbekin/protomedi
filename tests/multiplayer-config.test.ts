import { describe, expect, it } from 'vitest';
import cfg from '../data/multiplayer.json';
import { iceServersFor, lobbySocketUrl, resolveSignalingUrl } from '../src/net/config';

describe('multiplayer yapılandırması (Worker adresi)', () => {
  it('adres yoksa null (Server not configured); wss zorunlu', () => {
    expect(resolveSignalingUrl('omerbekin.github.io', '', '')).toBeNull();
    expect(resolveSignalingUrl('omerbekin.github.io', '', 'wss://protomedi-lobby.x.workers.dev/')).toBe('wss://protomedi-lobby.x.workers.dev');
    expect(resolveSignalingUrl('omerbekin.github.io', '', 'ws://protomedi-lobby.x.workers.dev')).toBeNull();
    expect(resolveSignalingUrl('omerbekin.github.io', '', 'https://x.workers.dev')).toBeNull();
  });
  it('?mpserver= yalnızca localhost sayfasında geçerli (yayındaki davet linkiyle yabancı sunucu dayatılamaz)', () => {
    expect(resolveSignalingUrl('localhost', '?mpserver=ws://127.0.0.1:8787', '')).toBe('ws://127.0.0.1:8787');
    expect(resolveSignalingUrl('omerbekin.github.io', '?mpserver=wss://evil.example', '')).toBeNull();
    expect(resolveSignalingUrl('localhost', '?mpserver=javascript:alert(1)', '')).toBeNull();
  });
  it('yerel sunucuda dış STUN kullanılmaz', () => {
    expect(iceServersFor('ws://127.0.0.1:8787')).toEqual([]);
    expect(iceServersFor('wss://x.workers.dev').length).toBeGreaterThan(0);
  });
  it('yayın adresi: oyun ve lobi tek alan adında, lobi /lobby altında', () => {
    expect(resolveSignalingUrl('eov.backinn.com.tr', '')).toBe('wss://eov.backinn.com.tr/lobby');
    expect(resolveSignalingUrl('omerbekin.github.io', '')).toBe('wss://eov.backinn.com.tr/lobby');
    expect(cfg.signalingUrl).toBe('wss://eov.backinn.com.tr/lobby');
  });
  it('lobi WebSocket adresi: /lobby kökü tekrarlanmaz; kökü olmayan (yerel) adrese /lobby eklenir', () => {
    expect(lobbySocketUrl('wss://eov.backinn.com.tr/lobby', 'ABC123', 'host', 'a'.repeat(16))).toBe(`wss://eov.backinn.com.tr/lobby/ABC123?role=host&id=${'a'.repeat(16)}`);
    expect(lobbySocketUrl('wss://eov.backinn.com.tr/lobby/', 'ABC123', 'guest', 'b'.repeat(16))).toBe(`wss://eov.backinn.com.tr/lobby/ABC123?role=guest&id=${'b'.repeat(16)}`);
    expect(lobbySocketUrl('ws://127.0.0.1:8787', 'ABC123', 'host', 'c'.repeat(16))).toBe(`ws://127.0.0.1:8787/lobby/ABC123?role=host&id=${'c'.repeat(16)}`);
  });
});
