/**
 * Gömülü animasyon sahnesi (iframe): `gallery.html?embed=1` gerçek BattleScene'i TEST modunda ayrı bir sayfada çalıştırır.
 * Wiki açıkken oyunun kendi savaşı duraklatılmıştır; önizleme ayrı belgede olduğu için savaş sahnesine hiç dokunmaz.
 * İframe yalnızca 'Play animation' basılınca (tembel) yaratılır; aynı anda tek skill oynatıcısı açık kalır.
 * Protokol: üst sayfa -> iframe `{type:'wiki-play', skillId}`; iframe -> üst sayfa `{type:'gallery-height', height}`.
 */
import { h } from '../../gallery/dom';

/** Gömme sayfasının adresi (göreli: dev sunucuda ve build'de çalışır). */
export const embedUrl = (skillId?: string): string => `./gallery.html?embed=1${skillId ? `&skill=${encodeURIComponent(skillId)}` : ''}`;

export interface Player {
  el: HTMLIFrameElement;
  /** Skill'i oynatır (iframe henüz yüklenmediyse yüklenince). */
  play: (skillId: string) => void;
  destroy: () => void;
  /** Oynatıcı kapanınca (ör. başka skill'in oynatıcısı açılınca) çağrılır. */
  onDestroy?: () => void;
}

let current: Player | null = null;

/** İframe yaratır; yüksekliği içerik bildirdikçe ayarlanır. `exclusive`: açılınca öncekini kapatır. */
export function createPlayer(skillId: string | undefined, exclusive = true): Player {
  if (exclusive) current?.destroy();
  const el = h('iframe', { class: 'stage-iframe', attrs: { src: embedUrl(skillId), title: 'Animation preview', allow: 'autoplay', loading: 'lazy' } });
  let loaded = false;
  let pending: string | null = null;
  const onMessage = (e: MessageEvent): void => {
    if (e.source !== el.contentWindow || e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; height?: number } | null;
    if (d?.type === 'gallery-height' && typeof d.height === 'number') el.style.height = `${Math.ceil(d.height)}px`;
    if (d?.type === 'gallery-ready') {
      loaded = true;
      if (pending) el.contentWindow?.postMessage({ type: 'wiki-play', skillId: pending }, window.location.origin);
      pending = null;
    }
  };
  window.addEventListener('message', onMessage);
  const player: Player = {
    el,
    play: (id) => {
      if (loaded) el.contentWindow?.postMessage({ type: 'wiki-play', skillId: id }, window.location.origin);
      else pending = id;
    },
    destroy: () => {
      window.removeEventListener('message', onMessage);
      el.src = 'about:blank';
      el.remove();
      if (current === player) current = null;
      player.onDestroy?.();
    },
  };
  if (exclusive) current = player;
  return player;
}
