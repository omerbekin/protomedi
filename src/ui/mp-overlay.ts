/**
 * Multiplayer DOM katmanı (sahneden bağımsız): üstte bağlantı şeridi (kopma geri sayımı, desync), kısa bildirimler,
 * lobi kodu giriş kutusu (yapıştırma desteği için gerçek <input>) ve panoya kopyalama. Metinler İngilizce.
 */
const root = (): HTMLElement => document.getElementById('ui-root') ?? document.body;

let banner: HTMLDivElement | null = null;
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

/** Üst şerit: metin boşsa gizlenir. `kind` rengi belirler. */
export function setBanner(text: string, kind: 'warn' | 'error' | 'info' = 'warn'): void {
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'mp-banner';
    banner.setAttribute('role', 'status');
    root().appendChild(banner);
  }
  banner.textContent = text;
  banner.dataset.kind = kind;
  banner.hidden = !text;
}

/** Kısa bildirim (birkaç saniye). */
export function toast(text: string, ms = 3500): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'mp-toast';
    root().appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl && (toastEl.hidden = true), ms);
}

/** Panoya kopyala (eski tarayıcıda gizli textarea yedeği). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Lobi kodu giriş kutusu: kod ya da davet linki yazılır/yapıştırılır. `validate` geçerli kodu döner (geçersizse null).
 * Join'e basınca geçerli kod döner; Cancel / Esc null.
 */
export function promptCode(validate: (text: string) => string | null): Promise<string | null> {
  return promptText({ title: 'Join lobby', hint: 'Enter the 6-letter lobby code (or paste the invite link)', placeholder: 'ABC DEF', button: 'Join', maxLength: 200, code: true, error: 'That is not a valid lobby code', validate });
}

/** Oyuncu adı kutusu: harf/rakam/boşluk, 16 karakter; boş bırakılırsa ad silinir ('Player 1/2'). */
export function promptName(initial: string, clean: (text: string) => string): Promise<string | null> {
  return promptText({ title: 'Your name', hint: 'Shown only to your opponent (letters, numbers and spaces, up to 16)', placeholder: 'Player', button: 'Save', maxLength: 16, initial, error: '', validate: (t) => clean(t), allowEmpty: true });
}

interface PromptOptions {
  title: string;
  hint: string;
  placeholder: string;
  button: string;
  maxLength: number;
  error: string;
  validate: (text: string) => string | null;
  initial?: string;
  /** Kod kutusu görünümü (büyük harf, geniş aralık). */
  code?: boolean;
  /** Boş sonuç geçerli ('' döner). */
  allowEmpty?: boolean;
}

function promptText(o: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'mp-modal';
    const box = document.createElement('div');
    box.className = 'mp-modal-box';
    const title = document.createElement('div');
    title.className = 'mp-modal-title';
    title.textContent = o.title;
    const hint = document.createElement('div');
    hint.className = 'mp-modal-hint';
    hint.textContent = o.hint;
    const input = document.createElement('input');
    input.className = o.code ? 'mp-code-input' : 'mp-code-input mp-name-input';
    input.value = o.initial ?? '';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = o.maxLength;
    input.placeholder = o.placeholder;
    if (o.code) input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('aria-label', o.title);
    const err = document.createElement('div');
    err.className = 'mp-modal-err';
    const row = document.createElement('div');
    row.className = 'mp-modal-row';
    const join = document.createElement('button');
    join.className = 'mp-btn primary';
    join.textContent = o.button;
    const cancel = document.createElement('button');
    cancel.className = 'mp-btn';
    cancel.textContent = 'Cancel';
    row.append(cancel, join);
    box.append(title, hint, input, err, row);
    wrap.appendChild(box);
    root().appendChild(wrap);
    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    const submit = () => {
      const v = o.validate(input.value);
      if (v || (o.allowEmpty && v === '')) done(v ?? '');
      else err.textContent = o.error;
    };
    join.onclick = submit;
    cancel.onclick = () => done(null);
    input.onkeydown = (e) => {
      e.stopPropagation(); // oyun kısayolları (debug ` / F2, Enter) çalışmasın
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') done(null);
    };
    input.oninput = () => (err.textContent = '');
    window.setTimeout(() => input.focus(), 30);
  });
}
