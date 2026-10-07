import { content } from '../../engine';
import { bindIcon } from '../../ui/dom-icons';
import { ownerOfSkill } from '../../game/asset-versions';
import type { AnimEntry, Catalog } from '../../gallery/catalog';
import { applyFilter, chipBar, h, searchable, type SectionApi } from '../../gallery/dom';
import { createPlayer, type Player } from './player';
import { playSound } from './sounds';

/**
 * ANIMATIONS: her skill için bir kart + gömülü animasyon sahnesi. Sahne (iframe: gallery.html?embed=1) oyunun kendi BattleScene'ini
 * test modunda çalıştırır; Phaser'ı yüklediği için bölüme girilince (onShow) ya da ilk Play'de tembel başlatılır.
 */
export function mountAnimations(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'animations' } });
  const countEl = h('span', { class: 'count' });
  let query = '';
  let group = '';
  let player: Player | null = null;
  const stageHost = h('div', { class: 'stage-frame-host' });
  const statusEl = h('div', { class: 'stage-status small muted', text: 'The preview stage loads when you open this section or press Play.' });

  const ensurePlayer = (skillId?: string): Player => {
    if (!player) {
      player = createPlayer(skillId, false);
      stageHost.append(player.el);
      statusEl.textContent = 'Pick a skill and press Play (slow motion, target cell and reset are on the stage).';
    }
    return player;
  };
  const play = (skillId: string): void => {
    const fresh = !player;
    const p = ensurePlayer(skillId);
    if (!fresh) p.play(skillId);
    statusEl.textContent = `Playing ${content.skills[skillId]?.name ?? skillId}...`;
  };

  const stage = h('div', { class: 'stage-col' }, stageHost, statusEl);

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
            bindIcon(h('img', { class: 'icon pixelated', attrs: { alt: a.icon, width: '48', height: '48' } }), a.icon, a.fx, ownerOfSkill(a.skillId)),
            h('div', { class: 'grow' }, h('div', { class: 'card-title', text: a.name }), h('div', { class: 'muted small', text: `${a.owner.name} - ${a.targetText}` })),
            a.hidden ? h('span', { class: 'badge bad', text: 'Hidden', title: 'Hidden developer class: not in the player\'s class list; kept as an animation reference' }) : null,
            h('button', { class: 'btn', text: 'Play', attrs: { type: 'button' }, title: `Play ${a.name} on the stage`, on: { click: () => play(a.skillId) } }),
          ),
          h('div', { class: 'small' }, h('span', { class: 'muted', text: 'vfx ' }), h('span', { class: a.vfx ? 'mono' : 'mono dim', text: vfxText }), a.vfx && cat.vfxKinds.find((k) => k.kind === a.vfx)?.backup ? h('span', { class: 'badge', text: 'backup' }) : null, a.vfxMissing ? h('span', { class: 'badge bad', text: 'unknown vfx' }) : null),
          h('div', { class: 'tags' }, h('span', { class: 'muted small', text: 'icon ' }), h('span', { class: 'mono small', text: a.icon }), ...a.sfx.map((s) => h('button', { class: 'tag sfx', text: `♪ ${s}`, title: `Play sound ${s}`, attrs: { type: 'button' }, on: { click: () => playSound(s) } }))),
        ),
        `${a.name} ${a.skillId} ${a.owner.name} ${a.vfx ?? 'generic'} ${a.motion} ${a.icon} ${a.sfx.join(' ')} ${a.targetText} ${a.hidden ? 'hidden developer' : ''}`,
        owner,
      );
      grid2.append(card);
    }
    list.append(h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: owner }), h('span', { class: 'muted small', text: `${owners.get(owner)!.length}` }), owners.get(owner)![0]!.hidden ? h('span', { class: 'badge bad', text: 'Hidden' }) : null), grid2));
  }

  // --- efekt türleri (hangi skill kullanıyor) ---
  const kinds = h('div', { class: 'cards small-cards' });
  for (const k of cat.vfxKinds) {
    const first = k.usedBy[0];
    kinds.append(
      searchable(
        h(
          'article',
          { class: `card kind${k.backup || k.usedBy.length === 0 ? ' spare' : ''}` },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'card-title mono', text: k.kind }), h('div', { class: 'muted small', text: k.usedBy.length ? k.usedBy.map((u) => u.name).join(', ') : 'no skill uses it (see Legacy)' })), k.backup ? h('span', { class: 'badge', text: 'backup' }) : null, first ? h('button', { class: 'btn small-btn', text: 'Play', attrs: { type: 'button' }, title: `Play via ${first.name}`, on: { click: () => play(first.id) } }) : null),
        ),
        `vfx effect kind ${k.kind} ${k.usedBy.map((u) => u.name).join(' ')} ${k.backup ? 'backup' : ''}`,
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
    h('div', { class: 'section-head' }, h('h2', { text: 'Animations' }), countEl, h('span', { class: 'muted small', text: 'Played by the real battle scene (test mode), in its own embedded page' })),
    chips,
    h('div', { class: 'anim-layout' }, stage, h('div', { class: 'anim-list' }, list)),
    h('h3', { class: 'sub', text: `Effect kinds (${cat.vfxKinds.length})` }),
    h('p', { class: 'note', text: 'src/ui/vfx-kinds.ts. A kind without a skill is a spare effect kept in code (also listed in Legacy).' }),
    kinds,
  );

  return {
    id: 'animations',
    title: 'Animations',
    total: cat.animations.length,
    root,
    onShow: () => {
      ensurePlayer();
    },
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
