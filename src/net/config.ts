/**
 * Multiplayer yapılandırması: Worker (signaling) adresi tek bir değerde durur: data/multiplayer.json > signalingUrl.
 * Geliştirme/yerel test: sayfa localhost'tan açıldıysa `?mpserver=ws://localhost:8787` adresi geçersiz kılar (yayındaki sayfada
 * davet linkine gömülü yabancı sunucu adresi kabul edilmez: oyuncunun IP'si başkasının sunucusuna gitmesin).
 */
import cfg from '../../data/multiplayer.json';

export interface IceServer {
  urls: string | string[];
}

const isLocalHost = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
const WS_RE = /^wss?:\/\/[A-Za-z0-9.\-[\]:]+(\/[A-Za-z0-9._\-/]*)?$/;

/**
 * Kullanılacak signaling adresi (sonunda / yok) ya da null (yapılandırılmamış). Saf: sayfa adresi parametre olarak verilir.
 * `pageHost`: sayfanın açıldığı makine adı; `search`: adres çubuğu sorgusu; `configured`: veri dosyasındaki değer.
 */
export function resolveSignalingUrl(pageHost: string, search: string, configured: string = cfg.signalingUrl): string | null {
  const override = new URLSearchParams(search).get('mpserver');
  if (override && isLocalHost(pageHost) && WS_RE.test(override)) return override.replace(/\/+$/, '');
  const c = (configured ?? '').trim();
  return c && WS_RE.test(c) && (c.startsWith('wss://') || isLocalHost(new URL(c.replace(/^ws/, 'http')).hostname)) ? c.replace(/\/+$/, '') : null;
}

/** WebRTC ICE sunucuları: signaling localhost'taysa (yerel test) hiç dış sunucu kullanılmaz. */
export function iceServersFor(signalingUrl: string): IceServer[] {
  const host = new URL(signalingUrl.replace(/^ws/, 'http')).hostname;
  return isLocalHost(host) ? [] : (cfg.iceServers as IceServer[]);
}
