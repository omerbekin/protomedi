import { describe, expect, it } from 'vitest';
import { iceServersFor, resolveSignalingUrl } from '../src/net/config';

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
});
