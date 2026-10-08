/**
 * Wiki > Assets > VERSIONS: her class için v1 (mevcut) ve v2 (yeni tasarım) yan yana: ikonlar (v1 | v2), sesler (▶ v1 / ▶ v2),
 * animasyonlar (Play v1 / Play v2 gömülü sahnede, yalnızca o oynatıcıda o sürüm). Üstteki seçici oyunun seçimini değiştirir
 * (debug > Versions ile aynı, localStorage). v2'si olmayan öğe "—" görünür (oyunda v1'e düşer).
 */
import { setVersion, type AssetVersion } from '../../game/asset-versions';
import { v2SpriteName } from '../../game/art-registry';
import { SFX, playSfxDef, sfxV2Of } from '../../game/audio';
import type { Catalog } from '../../gallery/catalog';
import { applyFilter, h, openLightbox, searchable, type SectionApi } from '../../gallery/dom';
import { iconUrl } from '../../ui/dom-icons';
import { createPlayer, type Player } from './player';
import { audioContext } from './sounds';
import { buildVersions, type VersionRow } from './versions-catalog';

const dash = (): HTMLElement => h('span', { class: 'ver-missing muted', text: '—', title: 'No v2 yet: the game uses v1' });

function iconImg(name: string, accent: string, label: string): HTMLElement {
  const url = iconUrl(name, accent);
  return url ? h('img', { class: 'ver-icon pixelated', attrs: { src: url, alt: label }, title: `${label} (click to enlarge)`, on: { click: () => openLightbox(url, label, true) } }) : dash();
}

function rowCard(r: VersionRow, refreshAll: () => void): HTMLElement {
  const sel = h('select', { class: 'ver-select', attrs: { 'aria-label': `${r.name} version` }, title: 'Version used in the game (same as debug > Versions)' });
  for (const v of ['v1', 'v2'] as const) sel.append(h('option', { text: v === 'v1' ? 'v1 (old)' : `v2 · ${r.progress.ready}/${r.progress.total}`, attrs: { value: v } }));
  sel.value = r.selected;
  sel.addEventListener('change', () => {
    setVersion(r.key, sel.value as AssetVersion);
    refreshAll();
  });

  const parts: HTMLElement[] = [];
  if (r.scope.icon && r.icons.length) {
    parts.push(
      h('h4', { text: `Icons (${r.progress.icon.ready}/${r.progress.icon.total} in v2)` }),
      h('div', { class: 'ver-pairs' }, ...r.icons.map((i) =>
        h('figure', { class: 'ver-pair' },
          h('div', { class: 'ver-two' }, iconImg(i.name, r.color, `${i.name} v1`), i.hasV2 ? iconImg(v2SpriteName(r.key, i.name), r.color, `${i.name} v2`) : dash()),
          h('figcaption', { class: 'small mono', text: i.name })))),
    );
  }
  if (r.scope.vfx && r.vfx.length) {
    const slot = h('div', { class: 'wk-playslot', attrs: { hidden: '' } });
    let player: Player | null = null;
    const play = (skillId: string, ver: 'v1' | 'v2'): void => {
      player?.destroy();
      const p = createPlayer(skillId, true, ver);
      player = p;
      p.onDestroy = () => {
        if (player === p) player = null;
        slot.hidden = true;
        slot.replaceChildren();
      };
      slot.replaceChildren(h('button', { class: 'wk-chip wk-closeplay', text: `Close preview (${ver})`, attrs: { type: 'button' }, on: { click: () => p.destroy() } }), p.el);
      slot.hidden = false;
    };
    parts.push(
      h('h4', { text: `Animations (${r.progress.vfx.ready}/${r.progress.vfx.total} in v2)` }),
      h('div', { class: 'ver-list' }, ...r.vfx.map((v) =>
        h('div', { class: 'ver-line' },
          h('span', { class: 'ver-label', text: `${v.skillName}`, title: `vfx key '${v.key}'` }),
          h('button', { class: 'wk-chip', text: 'Play v1', attrs: { type: 'button' }, on: { click: () => play(v.skillId, 'v1') } }),
          v.hasV2 ? h('button', { class: 'wk-chip on', text: 'Play v2', attrs: { type: 'button' }, on: { click: () => play(v.skillId, 'v2') } }) : dash()))),
      slot,
    );
  }
  if (r.scope.sfx && (r.sounds.length || r.extraSounds.length)) {
    const playV1 = (id: string) => playSfxDef(audioContext(), SFX[id]);
    const playV2 = (id: string) => playSfxDef(audioContext(), sfxV2Of(r.key, id));
    parts.push(
      h('h4', { text: `Sounds (${r.progress.sfx.ready}/${r.progress.sfx.total} in v2)` }),
      h('div', { class: 'ver-list' },
        ...r.sounds.map((s) =>
          h('div', { class: 'ver-line' },
            h('span', { class: 'ver-label mono', text: s.id }),
            h('button', { class: 'wk-chip wk-sfx', text: '♪ v1', attrs: { type: 'button' }, on: { click: () => playV1(s.id) } }),
            s.hasV2 ? h('button', { class: 'wk-chip wk-sfx on', text: '♪ v2', attrs: { type: 'button' }, on: { click: () => playV2(s.id) } }) : dash())),
        ...r.extraSounds.map((id) =>
          h('div', { class: 'ver-line' }, h('span', { class: 'ver-label mono', text: `${id} (new in v2)` }), dash(), h('button', { class: 'wk-chip wk-sfx on', text: '♪ v2', attrs: { type: 'button' }, on: { click: () => playV2(id) } })))),
    );
  }
  if (r.extraSprites.length)
    parts.push(
      h('h4', { text: `New v2 effect sprites (${r.extraSprites.length})` }),
      h('div', { class: 'ver-pairs' }, ...r.extraSprites.map((n) => h('figure', { class: 'ver-pair' }, iconImg(v2SpriteName(r.key, n), r.color, `${n} v2`), h('figcaption', { class: 'small mono', text: n })))),
    );
  const scopeNote = !r.scope.icon || !r.scope.vfx ? h('div', { class: 'small muted', text: `v2 covers ${[r.scope.icon && 'icons', r.scope.vfx && 'animations', r.scope.sfx && 'sounds'].filter(Boolean).join(', ')} only.` }) : null;
  return searchable(
    h('article', { class: 'card ver-card' },
      h('div', { class: 'ver-head' },
        h('img', { class: 'ver-logo pixelated', attrs: { src: iconUrl(r.logo, r.color), alt: '' } }),
        h('b', { class: 'ver-name', text: r.name, style: { color: r.color } }),
        h('span', { class: `badge${r.selected === 'v2' ? ' ok' : ''}`, text: `in game: ${r.selected}` }),
        sel),
      scopeNote,
      ...parts),
    r.search,
  );
}

/** VERSIONS bölümü. */
export function mountVersions(_cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'versions' } });
  const countEl = h('span', { class: 'count' });
  const grid = h('div', { class: 'ver-cards' });
  let query = '';
  const rebuild = (): void => {
    grid.replaceChildren(...buildVersions().map((r) => rowCard(r, rebuild)));
    applyFilter(grid, query);
  };
  rebuild();
  const total = (): number => buildVersions().length;
  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Versions' }), countEl, h('span', { class: 'muted small', text: 'v1 = current art and sound, v2 = redesign (src/game/art-v2, data/audio-v2). Left = v1, right = v2.' })),
    h('p', { class: 'note', text: 'Pick which version the game uses per class (also in debug > Versions). Items without a v2 yet show "—" and the game falls back to v1. Both versions are kept: v1 never moves to Legacy when v2 is selected.' }),
    grid,
  );
  return {
    id: 'versions',
    title: 'Versions',
    total: total(),
    root,
    setQuery: (q) => {
      query = q;
      const n = applyFilter(grid, q);
      countEl.textContent = `${n} / ${total()}`;
      return n;
    },
  };
}
