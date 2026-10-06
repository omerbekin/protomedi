import { content } from '../engine';
import { iconUrl } from '../ui/dom-icons';
import type { AnimEntry, Catalog } from './catalog';
import { applyFilter, chipBar, h, searchable, type SectionApi } from './dom';
import { playSound } from './sounds';
import { stageTeams } from './stage-teams';

type PreviewType = import('./preview').Preview;

/**
 * ANIMATIONS: her skill için bir kart + gömülü Phaser savaş sahnesi (oyunun BattleScene'i, test modu). Sahne Phaser'ı
 * (büyük paket) yüklediği için bölüm ekrana yaklaşınca ya da ilk Play'de tembel başlatılır.
 */
export function mountAnimations(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'animations' } });
  const countEl = h('span', { class: 'count' });
  const statusEl = h('div', { class: 'stage-status small muted', text: 'Preview stage loads when you scroll here or press Play.' });
  let query = '';
  let group = '';
  let preview: PreviewType | null = null;
  let loading: Promise<PreviewType> | null = null;
  const host = h('div', { class: 'stage-host' });

  const ensurePreview = (): Promise<PreviewType> => {
    loading ??= import('./preview').then(({ Preview }) => {
      statusEl.textContent = 'Loading battle stage...';
      preview = new Preview(host);
      void preview.ready.then(() => (statusEl.textContent = 'Ready. Pick a skill and press Play.'));
      return preview;
    });
    return loading;
  };
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      void ensurePreview();
      obs.disconnect();
    }
  }, { rootMargin: '300px' }).observe(root);

  const play = async (skillId: string): Promise<void> => {
    const p = await ensurePreview();
    p.slow = slow.checked;
    statusEl.textContent = `Playing ${content.skills[skillId]?.name ?? skillId}...`;
    const msg = await p.play(skillId);
    statusEl.textContent = msg || `Played ${content.skills[skillId]?.name ?? skillId}`;
  };

  // --- hedef hücre seçici ---
  const slow = h('input', { attrs: { type: 'checkbox' } });
  const reset = h('input', { attrs: { type: 'checkbox', checked: '' } });
  slow.addEventListener('change', () => preview && (preview.slow = slow.checked));
  const teams = stageTeams();
  const cellButtons: HTMLButtonElement[] = [];
  const setCell = (slot: number | null): void => {
    if (preview) preview.cell = slot;
    for (const b of cellButtons) b.classList.toggle('on', b.dataset['slot'] === String(slot ?? ''));
    cellAuto.classList.toggle('on', slot === null);
    void ensurePreview().then((p) => (p.cell = slot));
  };
  const cellAuto = h('button', { class: 'chip on', text: 'Auto', title: 'First living enemy / front cell', attrs: { type: 'button' }, on: { click: () => setCell(null) } });
  const grid = h('div', { class: 'cellgrid', style: { 'grid-template-columns': `repeat(${content.GRID.lanes}, 1fr)` } });
  for (let slot = 0; slot < content.CELL_COUNT; slot++) {
    const id = teams.enemies[slot];
    const name = id ? (content.classes[id]?.name ?? id) : '';
    const b = h('button', {
      class: `cell${id ? ' occupied' : ''}`,
      text: name ? name.slice(0, 8) : `${Math.floor(slot / content.GRID.lanes) + 1}-${(slot % content.GRID.lanes) + 1}`,
      title: `Enemy side, row ${Math.floor(slot / content.GRID.lanes) + 1}, lane ${(slot % content.GRID.lanes) + 1}${name ? ` (${name})` : ' (empty)'}. Support skills use the same cell on your side.`,
      attrs: { type: 'button' },
      data: { slot: String(slot) },
      on: { click: () => setCell(slot) },
    });
    cellButtons.push(b);
    grid.append(b);
  }
  reset.addEventListener('change', () => void import('../game/debug-state').then(({ debugState }) => (debugState.galleryReset = reset.checked)));

  const stage = h(
    'div',
    { class: 'stage-col' },
    h('div', { class: 'stage-frame' }, host),
    statusEl,
    h('div', { class: 'stage-controls' },
      h('label', { class: 'inline small' }, slow, ' Slow-motion (0.25x)'),
      h('label', { class: 'inline small', title: 'After each cast: revive the dead, remove summons, full HP/MP' }, reset, ' Reset after cast'),
    ),
    h('div', { class: 'small muted', text: 'Target cell (enemy side, row 1 = front)' }),
    h('div', { class: 'cellbar' }, cellAuto, grid),
  );

  // --- skill kartları ---
  const owners = new Map<string, AnimEntry[]>();
  for (const a of cat.animations) owners.set(a.owner.name, [...(owners.get(a.owner.name) ?? []), a]);
  const ownerOrder = [...owners.keys()].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  const chips = chipBar([{ value: '', label: 'All' }, ...ownerOrder.map((o) => ({ value: o, label: o }))], (v) => {
    group = v;
    refresh();
  });

  const list = h('div');
  for (const owner of ownerOrder) {
    const grid2 = h('div', { class: 'cards' });
    for (const a of owners.get(owner)!) {
      const vfxText = a.vfx ?? `generic (${a.motion}${a.skyFx ? `, ${a.skyFx}` : ''})`;
      const card = searchable(
        h(
          'article',
          { class: 'card anim' },
          h(
            'div',
            { class: 'row' },
            h('img', { class: 'icon pixelated', attrs: { src: iconUrl(a.icon, a.fx), alt: a.icon, width: '48', height: '48' } }),
            h('div', { class: 'grow' }, h('div', { class: 'card-title', text: a.name }), h('div', { class: 'muted small', text: `${a.owner.name} - ${a.targetText}` })),
            h('button', { class: 'btn', text: 'Play', attrs: { type: 'button' }, title: `Play ${a.name} on the stage`, on: { click: () => void play(a.skillId) } }),
          ),
          h('div', { class: 'small' }, h('span', { class: 'muted', text: 'vfx ' }), h('span', { class: a.vfx ? 'mono' : 'mono dim', text: vfxText }), a.vfx && cat.vfxKinds.find((k) => k.kind === a.vfx)?.backup ? h('span', { class: 'badge', text: 'backup' }) : null, a.vfxMissing ? h('span', { class: 'badge bad', text: 'unknown vfx' }) : null),
          h('div', { class: 'tags' }, h('span', { class: 'muted small', text: 'icon ' }), h('span', { class: 'mono small', text: a.icon }), ...a.sfx.map((s) => h('button', { class: 'tag sfx', text: `♪ ${s}`, title: `Play sound ${s}`, attrs: { type: 'button' }, on: { click: () => playSound(s) } }))),
        ),
        `${a.name} ${a.skillId} ${a.owner.name} ${a.vfx ?? 'generic'} ${a.motion} ${a.icon} ${a.sfx.join(' ')} ${a.targetText}`,
        owner,
      );
      grid2.append(card);
    }
    list.append(h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: owner }), h('span', { class: 'muted small', text: `${owners.get(owner)!.length}` })), grid2));
  }

  // --- vfx türleri (hangi skill kullanıyor) ---
  const kinds = h('div', { class: 'cards small-cards' });
  for (const k of cat.vfxKinds) {
    const first = k.usedBy[0];
    kinds.append(
      searchable(
        h(
          'article',
          { class: `card kind${k.backup ? ' spare' : ''}` },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'card-title mono', text: k.kind }), h('div', { class: 'muted small', text: k.usedBy.length ? k.usedBy.map((u) => u.name).join(', ') : 'no skill uses it' })), k.backup ? h('span', { class: 'badge', text: 'backup' }) : null, first ? h('button', { class: 'btn small-btn', text: 'Play', attrs: { type: 'button' }, title: `Play via ${first.name}`, on: { click: () => void play(first.id) } }) : null),
        ),
        `vfx ${k.kind} ${k.usedBy.map((u) => u.name).join(' ')} ${k.backup ? 'backup' : ''}`,
      ),
    );
  }

  const refresh = (): number => {
    const n = applyFilter(list, query, group);
    applyFilter(kinds, query);
    countEl.textContent = `${n} / ${cat.animations.length}`;
    return n;
  };

  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Animations (VFX)' }), countEl, h('span', { class: 'muted small', text: 'Played by the real battle scene (test mode)' })),
    chips,
    h('div', { class: 'anim-layout' }, stage, h('div', { class: 'anim-list' }, list)),
    h('h3', { class: 'sub', text: `Effect kinds (${cat.vfxKinds.length})` }),
    h('p', { class: 'note', text: 'src/ui/vfx-kinds.ts. A kind without a skill is a spare effect kept in code.' }),
    kinds,
  );

  return {
    id: 'animations',
    title: 'Animations',
    total: cat.animations.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
