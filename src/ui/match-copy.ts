/**
 * "Copy match data": maç kaydını (src/engine/match-log.ts) panoya kopyalar ve kısa bir bildirim (toast) gösterir.
 * Debug dock'taki düğme ve sonuç ekranındaki bağlantı aynı fonksiyonu kullanır. DOM kullanır (motorda DEĞİL).
 */

/** Panoya yazar: önce navigator.clipboard, olmazsa gizli textarea + execCommand('copy'). Başarılıysa true. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* izin yok / belge odakta değil: yedeğe geç */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

/** Ekranın altında kısa süre görünen bildirim (debug menüsünün de üstünde). */
export function showToast(message: string, ok = true): void {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:30000;padding:10px 18px;border-radius:6px;font:600 15px/1.2 system-ui,sans-serif;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.5);pointer-events:none;max-width:90vw;text-align:center;transition:opacity .2s';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.background = ok ? '#2f6b3a' : '#8a2f2f';
  toastEl.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0';
  }, 2800);
}

export interface MatchDataSource {
  /** Kayıt metni ve hamle sayısı; kayıt yoksa (savaş yok) null. */
  get(): { text: string; moves: number } | null;
}

/**
 * Maç kaydını panoya kopyalar ve sonucu bildirir: "Match data copied (N moves)" / başarısızsa hata. Dönen metin, pano kullanılamasa da
 * (ör. konsoldan almak için) çağırana verilir.
 */
export async function copyMatchData(source: MatchDataSource): Promise<{ ok: boolean; moves: number; text: string }> {
  const data = source.get();
  if (!data) {
    showToast('No battle running: nothing to copy', false);
    return { ok: false, moves: 0, text: '' };
  }
  const ok = await copyToClipboard(data.text);
  showToast(ok ? `Match data copied (${data.moves} moves)` : 'Copy failed: clipboard not available', ok);
  return { ok, moves: data.moves, text: data.text };
}
