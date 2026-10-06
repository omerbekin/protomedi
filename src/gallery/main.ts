/**
 * ASSET GALLERY (gallery.html): oyunun tüm sesleri, animasyonları, karakterleri, ikonları, durumları ve renkleri tek sayfada.
 * Her şey veriden / dizinlerden otomatik türetilir (src/gallery/catalog.ts); elle liste YOK. Yeni ses/ikon/skill/class/sprite
 * eklenince burada kendiliğinden görünür. Giriş: dev'de http://localhost:5173/gallery.html, build'de ./gallery.html.
 */
import { mountAnimations } from './animations';
import { buildCatalog } from './catalog';
import { mountCharacters } from './characters';
import { h, isolateKeys, type SectionApi } from './dom';
import { assetFiles } from './files';
import { mountIcons } from './icons';
import { mountPalette } from './palette';
import { mountSounds } from './sounds';
import { mountStatuses } from './statuses';
import './gallery.css';

if (import.meta.env.DEV) document.title = 'ProtoMedi Gallery (dev - NOT LIVE)';

const catalog = buildCatalog(assetFiles);
const sections: SectionApi[] = [mountSounds(catalog), mountAnimations(catalog), mountCharacters(catalog), mountIcons(catalog), mountStatuses(catalog), mountPalette(catalog)];

const app = document.getElementById('gallery')!;
const tabs = new Map<string, HTMLAnchorElement>();
const tabCounts = new Map<string, HTMLElement>();
let query = '';

const search = h('input', { class: 'search', attrs: { type: 'search', placeholder: 'Search everything (name, skill, class, sound...)', 'aria-label': 'Search' } });
isolateKeys(search);
const nav = h('nav', { class: 'tabs' });
for (const s of sections) {
  const count = h('span', { class: 'tab-count', text: String(s.total) });
  const a = h('a', { class: 'tab', attrs: { href: `#${s.id}` } }, s.title, count);
  tabs.set(s.id, a);
  tabCounts.set(s.id, count);
  nav.append(a);
}

app.append(
  h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'title', text: 'ASSET GALLERY' }), h('a', { class: 'back', text: 'Back to game', attrs: { href: './index.html' } })), nav, search),
  h('main', {}, ...sections.map((s) => s.root)),
  h('footer', { class: 'foot muted small', text: `Generated from data and asset folders. ${catalog.sounds.length} sounds, ${catalog.animations.length} skills, ${catalog.characters.length} characters, ${catalog.icons.length} icons.` }),
);

function refreshAll(): void {
  for (const s of sections) {
    const shown = s.setQuery(query);
    const el = tabCounts.get(s.id)!;
    el.textContent = query ? `${shown}/${s.total}` : String(s.total);
    tabs.get(s.id)!.classList.toggle('empty', query !== '' && shown === 0);
  }
}
let timer = 0;
search.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    query = search.value.trim();
    refreshAll();
  }, 120);
});
refreshAll();

// Scroll-spy: the tab of the section in view lights up
const spy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) for (const [id, a] of tabs) a.classList.toggle('active', id === e.target.id);
  },
  { rootMargin: '-30% 0px -60% 0px' },
);
for (const s of sections) spy.observe(s.root);
