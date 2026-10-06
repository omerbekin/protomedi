/** Galeri sayfası için küçük DOM yardımcıları (Phaser'dan bağımsız). */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  data?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, v] of Object.entries(props.style ?? {})) el.style.setProperty(k, v);
  for (const [k, v] of Object.entries(props.data ?? {})) el.dataset[k] = v;
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn as EventListener);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Aranabilir öğe: `data-search` metni (küçük harf) sayfadaki arama kutusuyla eşleşir. */
export const searchable = <T extends HTMLElement>(el: T, text: string, group?: string): T => {
  el.dataset['search'] = text.toLowerCase();
  if (group) el.dataset['group'] = group;
  return el;
};

/**
 * Arama + grup süzgeci uygular: `[data-search]` öğeleri gizler/gösterir; içinde görünen öğe kalmayan `.group` kapsayıcılarını gizler.
 * Görünen öğe sayısını döndürür.
 */
export function applyFilter(root: HTMLElement, query: string, group = ''): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const el of root.querySelectorAll<HTMLElement>('[data-search]')) {
    const text = el.dataset['search'] ?? '';
    const ok = words.every((w) => text.includes(w)) && (!group || el.dataset['group'] === group);
    el.hidden = !ok;
    if (ok) shown++;
  }
  for (const g of root.querySelectorAll<HTMLElement>('.group')) g.hidden = !g.querySelector('[data-search]:not([hidden])');
  return shown;
}

/** Tek seçimli düğme şeridi (süzgeç çipleri). `''` = hepsi. */
export function chipBar(options: Array<{ value: string; label: string }>, onChange: (value: string) => void, initial = ''): HTMLElement {
  const bar = h('div', { class: 'chips' });
  const buttons: HTMLButtonElement[] = [];
  const set = (value: string): void => {
    for (const b of buttons) b.classList.toggle('on', b.dataset['value'] === value);
    onChange(value);
  };
  for (const o of options) {
    const b = h('button', { class: 'chip', text: o.label, data: { value: o.value }, attrs: { type: 'button' }, on: { click: () => set(o.value) } });
    buttons.push(b);
    bar.append(b);
  }
  for (const b of buttons) b.classList.toggle('on', b.dataset['value'] === initial);
  return bar;
}

/** Görseli büyük gösteren basit ışık kutusu. */
export function openLightbox(src: string, caption: string, pixelated = false): void {
  const box = h(
    'div',
    { class: 'lightbox', on: { click: () => box.remove() } },
    h('img', { attrs: { src, alt: caption }, class: pixelated ? 'pixelated' : '' }),
    h('div', { class: 'lightbox-cap', text: caption }),
  );
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      box.remove();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  document.body.append(box);
}

export const fmtSec = (s: number): string => `${s.toFixed(2)}s`;

/** Giriş kutusundaki tuşların oyun kısayollarına (1-4) gitmemesi için. */
export const isolateKeys = (el: HTMLElement): void => el.addEventListener('keydown', (e) => e.stopPropagation());

export interface SectionApi {
  id: string;
  title: string;
  total: number;
  /** Arama metni değişince çağrılır; görünen öğe sayısını döndürür. */
  setQuery: (q: string) => number;
  root: HTMLElement;
}
