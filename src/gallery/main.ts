/**
 * gallery.html artık bağımsız bir sayfa DEĞİL: Asset Gallery oyun içi Wiki'ye taşındı (kitap simgesi > Assets / Legacy).
 *  - `?embed=1`: wiki'nin iframe olarak gömdüğü animasyon önizleme sahnesi (src/gallery/embed.ts).
 *  - başka türlü açılırsa: kısa bir bilgi sayfası ve oyunu wiki'nin Assets bölümünde açan derin bağlantı (`index.html?wiki=assets`).
 * Katalog (src/gallery/catalog.ts) wiki ile ortaktır.
 */
import './shell.css';

const params = new URLSearchParams(window.location.search);
const root = document.getElementById('gallery')!;

if (import.meta.env.DEV) document.title = 'ProtoMedi Gallery (dev - NOT LIVE)';

if (params.has('embed')) {
  void import('./embed').then((m) => m.mountEmbed(params));
} else {
  const link = (text: string, href: string): HTMLAnchorElement => Object.assign(document.createElement('a'), { textContent: text, href });
  const box = document.createElement('div');
  box.className = 'moved';
  const title = Object.assign(document.createElement('h1'), { textContent: 'Asset Gallery has moved' });
  const msg = Object.assign(document.createElement('p'), { textContent: 'The Asset Gallery now lives in the Wiki: open the book icon > Assets.' });
  box.append(title, msg, link('Open Wiki > Assets', './index.html?wiki=assets'), link('Open Wiki > Legacy', './index.html?wiki=legacy'), link('Back to game', './index.html'));
  root.append(box);
}
