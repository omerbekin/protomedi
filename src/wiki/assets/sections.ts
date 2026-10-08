/**
 * Wiki > ASSETS ve LEGACY bölümleri + wiki'nin class/skill kartlarına eklenen "Art & sounds", "Old versions" ve "Play animation"
 * parçaları. Eski Asset Gallery buraya taşındı (gallery.html artık yalnızca gömülü animasyon sahnesi + yönlendirme).
 * Katalog saftır ve gallery ile ORTAKTIR (src/gallery/catalog.ts, src/wiki/assets/legacy-catalog.ts): her şey veriden/dizinlerden
 * türetilir. Ağır DOM (ses kartları, ikon ızgarası, animasyon sahnesi) bölüme girilince tembel kurulur.
 */
import { buildCatalog, type Catalog } from '../../gallery/catalog';
import { h, openLightbox, type SectionApi } from '../../gallery/dom';
import { mountAnimations } from './animations';
import { mountCharacters } from './characters';
import { legacyFiles } from './files';
import { mountIcons } from './icons';
import { assetNav, type AssetSectionId } from './nav';
import { buildLegacy, legacyOfSprite, type LegacyCatalog } from './legacy-catalog';
import { mountLegacy } from './legacy';
import { mountPalette } from './palette';
import { createPlayer, type Player } from './player';
import { mountSounds, playSound } from './sounds';
import { mountVersions } from './versions';
import { versionKeys } from '../../game/asset-versions';
import './assets.css';

// ---------------------------------------------------------------- ortak veri

let catalogMemo: Catalog | null = null;
let legacyMemo: LegacyCatalog | null = null;
/** Ortak katalog (bir kez kurulur; Phaser'sız, DOM'suz). */
export const assetCatalog = (): Catalog => (catalogMemo ??= buildCatalog(legacyFiles));
export const legacyCatalog = (): LegacyCatalog => (legacyMemo ??= buildLegacy(assetCatalog(), legacyFiles));

/** Wiki panelinin bölüm geçişi (kartlardaki 'See all' düğmeleri için): bölüm + arama metni. */
let navigator: (sectionId: string, query: string) => void = () => undefined;
export const setNavigator = (fn: (sectionId: string, query: string) => void): void => {
  navigator = fn;
};

const mmss = (s: number): string => `${s.toFixed(2)}s`;

// ---------------------------------------------------------------- skill ve class kartı parçaları

/** Skill satırının altı: 'Play animation' (gömülü sahne, tembel) + efekt türü + ses çipleri (tıklayınca çalar). */
export function skillArt(skillId: string): HTMLElement | null {
  const a = assetCatalog().animations.find((x) => x.skillId === skillId);
  if (!a) return null;
  const slot = h('div', { class: 'wk-playslot', attrs: { hidden: '' } });
  let player: Player | null = null;
  const close = h('button', { class: 'wk-chip wk-closeplay', text: 'Close preview', attrs: { type: 'button' }, on: { click: () => player?.destroy() } });
  const btn = h('button', { class: 'wk-playbtn', text: 'Play animation', attrs: { type: 'button' }, title: `Play ${a.name} on a small battle stage (slow motion and target cell are on the stage)`, on: { click: () => {
    if (player) {
      player.play(skillId);
      return;
    }
    const p = createPlayer(skillId);
    player = p;
    p.onDestroy = () => {
      if (player === p) player = null;
      slot.hidden = true;
      slot.replaceChildren();
    };
    slot.replaceChildren(close, p.el);
    slot.hidden = false;
  } } });
  const vfx = a.vfx ?? `generic (${a.motion}${a.skyFx ? `, ${a.skyFx}` : ''})`;
  return h('div', { class: 'wk-art-row wk-assets' },
    h('div', { class: 'wk-art-line' },
      btn,
      h('span', { class: 'muted small', text: `vfx ${vfx}` }),
      ...a.sfx.map((s) => h('button', { class: 'wk-chip wk-sfx', text: `♪ ${s}`, title: `Play sound ${s}`, attrs: { type: 'button' }, on: { click: () => playSound(s) } }))),
    slot);
}

/** Class/çağrı kartının altı: 'Art & sounds' (dosyalar, sesler, Assets bağlantıları) ve varsa 'Old versions' (yalnızca bu class'a ait eski çizimler). */
export function unitArt(unitId: string): HTMLElement | null {
  const cat = assetCatalog();
  const c = cat.characters.find((x) => x.id === unitId);
  if (!c) return null;
  const skillIds = new Set(c.skills.map((s) => s.id));
  const soundIds = [...new Set(cat.animations.filter((a) => skillIds.has(a.skillId)).flatMap((a) => a.sfx))];
  const old = legacyOfSprite(legacyCatalog(), c.spriteId);

  const art = h('details', { class: 'wk-fold' }, h('summary', { text: `Art & sounds (${soundIds.length} sounds)` }));
  let built = false;
  art.addEventListener('toggle', () => {
    if (!art.open || built) return;
    built = true;
    const go = (label: string, section: string): HTMLElement => h('button', { class: 'wk-chip', text: label, attrs: { type: 'button' }, on: { click: () => navigator(section, c.name) } });
    art.append(
      h('div', { class: 'wk-fold-body' },
        h('div', { class: 'muted small', text: `Files: assets/sprites/${c.spriteId}/idle.png, assets/avatars/${c.spriteId}.png, logo icon "${c.logo}", color ${c.color}` }),
        h('div', { class: 'muted small', text: 'Skill animations: use "Play animation" under each skill. Sounds (click to play):' }),
        soundIds.length
          ? h('div', { class: 'wk-art-line' }, ...soundIds.map((id) => h('button', { class: 'wk-chip wk-sfx', text: `♪ ${id} ${mmss(cat.sounds.find((s) => s.id === id)?.duration ?? 0)}`, attrs: { type: 'button' }, on: { click: () => playSound(id) } })))
          : h('div', { class: 'muted small', text: 'No sounds.' }),
        h('div', { class: 'wk-art-line' }, go('All its sounds', 'sounds'), go('All its animations', 'animations'), go('Art sheet', 'art'))));
  });

  const folds: HTMLElement[] = [art];
  if (old.length) {
    const oldFold = h('details', { class: 'wk-fold' }, h('summary', { text: `Old versions (${old.length})` }));
    let oldBuilt = false;
    oldFold.addEventListener('toggle', () => {
      if (!oldFold.open || oldBuilt) return;
      oldBuilt = true;
      oldFold.append(h('div', { class: 'wk-fold-body wk-old' }, ...old.map((i) => h('figure', {}, i.url ? h('img', { class: 'legacy-img', attrs: { src: i.url, alt: i.label, loading: 'lazy' }, title: `${i.label} (click to enlarge)`, on: { click: () => openLightbox(i.url!, i.label) } }) : null, h('figcaption', { class: 'muted small', text: i.why })))));
    });
    folds.push(oldFold);
  }
  return h('div', { class: 'wk-folds wk-assets' }, ...folds);
}

// ---------------------------------------------------------------- bölümler

export interface AssetSection {
  id: string;
  title: string;
  icon: string;
  total: number;
  root: HTMLElement;
  setQuery: (q: string) => number;
  onShow?: () => void;
  /** Sol menüde Assets altında girintili alt bölüm. */
  sub?: boolean;
}

/** Tembel bölüm: ilk gösterimde ya da ilk aramada kurulur; o zamana dek yalnızca boş kabuk. */
function lazySection(id: AssetSectionId, total: number, mount: () => SectionApi): AssetSection {
  const { title, icon } = assetNav(id);
  const root = h('section', { class: 'wk-section wk-assets', attrs: { id: `wiki-${id}`, hidden: '' } });
  let api: SectionApi | null = null;
  let lastQuery = '';
  const ensure = (): SectionApi => {
    if (!api) {
      api = mount();
      api.setQuery(lastQuery);
      root.append(api.root);
    }
    return api;
  };
  return {
    id, title, icon, total, root, sub: true,
    setQuery: (q) => {
      lastQuery = q;
      return q === '' && !api ? total : ensure().setQuery(q);
    },
    onShow: () => ensure().onShow?.(),
  };
}

function overview(sections: AssetSection[]): AssetSection {
  const cat = assetCatalog();
  const desc: Record<string, string> = {
    sounds: 'Every sound effect: play it, see its length, layers and which skills use it. Peak level check.',
    animations: 'Every skill animation on a real battle stage, plus the list of effect kinds.',
    icons: 'All pixel icons, zoomable, with where each one is used.',
    art: 'Full-body sprite, head avatar and logo of every class and summon (hidden developer classes too).',
    palette: 'Interface, element, stat and class colors, plus the fonts.',
    versions: 'Art and sound versions per class: v1 (old) and v2 (redesign, default) side by side; pick which one the game uses.',
    legacy: 'Old, spare and unused things: old sprites, concept art, spare icons, effects and sounds, each with why it is legacy.',
  };
  const root = h('section', { class: 'wk-section wk-assets', attrs: { id: 'wiki-assets', hidden: '' } },
    h('h2', {}, h('span', { text: 'ASSETS' })),
    h('p', { class: 'muted', text: 'The game\'s art and sound library (this used to be the separate Asset Gallery). Everything here is generated from the game data and the asset folders, so new sounds, icons, skills and sprites show up by themselves. Class and skill cards in this wiki also have their own "Art & sounds" and "Play animation" parts.' }),
    h('div', { class: 'hub' }, ...sections.filter((s) => s.id !== 'assets').map((s) => h('button', { class: 'wk-card wk-hubcard', attrs: { type: 'button' }, on: { click: () => navigator(s.id, '') } }, h('b', { text: `${s.title} (${s.total})` }), h('span', { class: 'muted small', text: desc[s.id] ?? '' })))),
    h('p', { class: 'muted small', text: `Status and ground icons are in STATUSES & GROUNDS; classes, summons and skills are in CLASSES and SKILLS. ${cat.sounds.length} sounds, ${cat.animations.length} skill animations, ${cat.icons.length} icons, ${cat.characters.length} characters.` }));
  return { id: 'assets', title: assetNav('assets').title, icon: assetNav('assets').icon, total: sections.filter((s) => s.id !== 'legacy' && s.id !== 'versions').reduce((n, s) => n + s.total, 0), root, setQuery: () => 0 };
}

/** Assets (genel bakış + 5 alt bölüm) ve Legacy bölümleri; wiki sol menüsünde bu sırayla. */
export function assetSections(): AssetSection[] {
  const cat = assetCatalog();
  const legacy = legacyCatalog();
  const paletteTotal = cat.palette.ui.length + cat.palette.element.length + cat.palette.stat.length + cat.palette.classes.length;
  const subs: AssetSection[] = [
    lazySection('sounds', cat.sounds.length, () => mountSounds(cat)),
    lazySection('animations', cat.animations.length, () => mountAnimations(cat)),
    lazySection('icons', cat.icons.length, () => mountIcons(cat)),
    lazySection('art', cat.characters.length, () => mountCharacters(cat)),
    lazySection('palette', paletteTotal, () => mountPalette(cat)),
    lazySection('versions', versionKeys().length, () => mountVersions(cat)),
    lazySection('legacy', legacy.total, () => mountLegacy(cat, legacy)),
  ];
  return [overview(subs), ...subs];
}
