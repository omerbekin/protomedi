/**
 * Multiplayer ağ katmanının ağır kısmı (oturum + lockstep savaş motoru, WebRTC bağlantısı, debug sahte rakibi) ayrı kod parçasında
 * (hızlı açılış): mp-client.ts ilk Host / Join / yeniden bağlanmada dynamic import ile yükler.
 */
export { MpSession } from '../net/session';
export { FakeOpponent } from '../net/fake-opponent';
export { WebRtcLink } from '../net/webrtc-link';
