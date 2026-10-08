/**
 * Gömülü animasyon sahnesi (gallery.html?embed=1): wiki bunu iframe olarak yükler. Oyunun kendi BattleScene'i TEST modunda
 * (sırasız) çalışır; skill'ler `debugCastSkill` ile oynatılır (aynı animasyon ve ses kodu). Parametre: `skill=<id>` açılınca
 * bir kez oynatır. Üst sayfa `{type:'wiki-play', skillId}` mesajıyla başka skill oynattırabilir. Phaser'ı yüklediği için
 * yalnızca embed modunda (dinamik import) çağrılır.
 */
import { content } from '../engine';
import { screenCellOf, shapeStages } from '../engine/area-shape';
import { skillOwner } from './catalog';
import { h } from './dom';
import { Preview } from './preview';
import { stageTeams } from './stage-teams';
import { debugState } from '../game/debug-state';
import { getVersion, ownerOfSkill, setAllVersions, setVersion, type AssetVersion } from '../game/asset-versions';
import '../wiki/assets/assets.css';
import './shell.css';

export function mountEmbed(params: URLSearchParams): void {
  document.body.classList.add('embed');
  const root = document.getElementById('gallery')!;
  const host = h('div', { class: 'stage-host' });
  const status = h('div', { class: 'small muted', text: 'Loading battle stage...' });
  const preview = new Preview(host);

  // --- skill seçici (class'a göre gruplu) ---
  const select = h('select', { class: 'skill-select', attrs: { 'aria-label': 'Skill' } });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const [id, s] of Object.entries(content.skills)) {
    const owner = skillOwner(id);
    let g = groups.get(owner.name);
    if (!g) {
      g = h('optgroup', { attrs: { label: owner.name } });
      groups.set(owner.name, g);
      select.append(g);
    }
    g.append(h('option', { text: s.name, attrs: { value: id } }));
  }
  const first = params.get('skill');
  if (first && content.skills[first]) select.value = first;

  // --- sürüm (v1 mevcut / v2 yeni tasarım; src/game/asset-versions.ts): `ver=v1|v2` tüm class'ları yalnızca bu sayfada o sürüme çeker;
  // seçici seçili skill'in sahibinin sürümünü (yalnızca bu sayfada, kaydetmeden) değiştirir
  const verParam = params.get('ver');
  if (verParam === 'v1' || verParam === 'v2') setAllVersions(verParam, false);
  const verSel = h('select', { class: 'skill-select', attrs: { 'aria-label': 'Art version' }, title: 'Art and sound version of the class of this skill (only on this stage; debug > Versions saves it for the game)' });
  for (const v of ['v1', 'v2'] as const) verSel.append(h('option', { text: v === 'v1' ? 'v1 (old)' : 'v2 (redesign)', attrs: { value: v } }));
  const syncVer = (): void => {
    verSel.value = getVersion(ownerOfSkill(select.value));
  };
  verSel.addEventListener('change', () => {
    const owner = ownerOfSkill(select.value);
    if (owner) setVersion(owner, verSel.value as AssetVersion, false);
  });
  select.addEventListener('change', syncVer);
  syncVer();

  const slow = h('input', { attrs: { type: 'checkbox' } });
  const reset = h('input', { attrs: { type: 'checkbox', checked: '' } });
  reset.addEventListener('change', () => (debugState.galleryReset = reset.checked));

  const play = async (skillId: string): Promise<void> => {
    select.value = skillId;
    syncVer();
    paintShape(hoverCell ?? chosenCell);
    preview.slow = slow.checked;
    status.textContent = `Playing ${content.skills[skillId]?.name ?? skillId}...`;
    const msg = await preview.play(skillId);
    status.textContent = msg || `Played ${content.skills[skillId]?.name ?? skillId}`;
    reportHeight();
  };

  // --- hedef hücre seçici ---
  const teams = stageTeams();
  const cellButtons: HTMLButtonElement[] = [];
  // Seçili skill bir alan (şekil) skill'iyse imleçteki / seçili hücreye göre kapsanan hücreler boyanır (anchor beyaz çerçeveli; aşamalı
  // skill'de etikette aşama numarası). Izgara ekrandaki gibi dizilir: düşman tarafı, ön sıra solda, şeritler yukarıdan aşağı.
  let hoverCell: number | null = null;
  let chosenCell: number | null = null;
  const paintShape = (slot: number | null): void => {
    const area = content.skills[select.value]?.area;
    const stages = area?.shape && slot !== null ? shapeStages(area, slot, 'enemy', content.formulas.formation) : [];
    for (const b of cellButtons) {
      const s = Number(b.dataset['slot']);
      const st = stages.findIndex((list) => list.includes(s));
      const on = st >= 0;
      b.style.background = on ? '#5a3c10' : '';
      b.style.borderColor = on ? '#f2b84a' : '';
      b.style.borderStyle = on ? 'solid' : '';
      b.style.color = on ? '#fff' : '';
      b.style.outline = on && s === slot ? '2px solid #fff' : '';
      b.style.outlineOffset = on && s === slot ? '-3px' : '';
      b.textContent = (on && stages.length > 1 ? `${st + 1}: ` : '') + (b.dataset['label'] ?? '');
    }
  };
  const setCell = (slot: number | null): void => {
    chosenCell = slot;
    preview.cell = slot;
    for (const b of cellButtons) b.classList.toggle('on', b.dataset['slot'] === String(slot ?? ''));
    cellAuto.classList.toggle('on', slot === null);
    paintShape(hoverCell ?? slot);
  };
  select.addEventListener('change', () => paintShape(hoverCell ?? chosenCell));
  const cellAuto = h('button', { class: 'chip on', text: 'Auto', title: 'First living enemy / front cell', attrs: { type: 'button' }, on: { click: () => setCell(null) } });
  const grid = h('div', { class: 'cellgrid', style: { 'grid-template-columns': `repeat(${content.GRID.rows}, 1fr)` } });
  grid.addEventListener('mouseleave', () => {
    hoverCell = null;
    paintShape(chosenCell);
  });
  for (let slot = 0; slot < content.CELL_COUNT; slot++) {
    const id = teams.enemies[slot];
    const name = id ? (content.classes[id]?.name ?? id) : '';
    const label = name ? name.slice(0, 8) : `${Math.floor(slot / content.GRID.lanes) + 1}-${(slot % content.GRID.lanes) + 1}`;
    const b = h('button', {
      class: `cell${id ? ' occupied' : ''}`,
      text: label,
      title: `Enemy side, row ${Math.floor(slot / content.GRID.lanes) + 1}, lane ${(slot % content.GRID.lanes) + 1}${name ? ` (${name})` : ' (empty)'}. Support skills use the same cell on your side.`,
      attrs: { type: 'button' },
      data: { slot: String(slot), label },
      on: {
        click: () => setCell(slot),
        mouseenter: () => {
          hoverCell = slot;
          paintShape(slot);
        },
      },
    });
    // ekrandaki yerleşim (formation.screenGrid): sütun = sıra (ön sıra solda), satır = şerit
    const sc = screenCellOf(content.formulas.formation, 'enemy', slot);
    b.style.gridColumn = String(sc.col + 1);
    b.style.gridRow = String(sc.row + 1);
    cellButtons.push(b);
    grid.append(b);
  }

  // Üst sayfaya yükseklik bildir (iframe içeriği kadar uzasın)
  const reportHeight = (): void => window.parent?.postMessage({ type: 'gallery-height', height: root.getBoundingClientRect().height + 2 }, window.location.origin);
  const playBtn = h('button', { class: 'btn', text: 'Play', attrs: { type: 'button' }, on: { click: () => void play(select.value) } });
  root.className = 'wk-assets embed-root';
  root.append(
    h('div', { class: 'stage-frame' }, host),
    h('div', { class: 'embed-bar' }, select, verSel, playBtn, h('label', { class: 'inline small' }, slow, ' Slow-motion (0.25x)'), h('label', { class: 'inline small', title: 'After each cast: revive the dead, remove summons, full HP/MP' }, reset, ' Reset after cast')),
    status,
    h('div', { class: 'small muted', text: 'Target cell (enemy side as on screen: front row on the left). Area skills: hover a cell to see the shape (numbers = hit stages).' }),
    h('div', { class: 'cellbar' }, cellAuto, grid),
  );

  new ResizeObserver(reportHeight).observe(root);
  // Sahne alanı iframe yüklenirken henüz ölçülmemiş olabilir: boyut değişince Phaser'a yeniden ölçtür
  new ResizeObserver(() => preview.game.scale.refresh()).observe(host);

  void preview.ready.then(() => {
    status.textContent = 'Ready. Pick a skill and press Play.';
    window.parent?.postMessage({ type: 'gallery-ready' }, window.location.origin);
    reportHeight();
    if (first && content.skills[first]) void play(first);
  });
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; skillId?: string } | null;
    if (d?.type === 'wiki-play' && d.skillId && content.skills[d.skillId]) void play(d.skillId);
  });
  // Giriş kutularındaki tuşlar oyun kısayollarına gitmesin
  root.addEventListener('keydown', (e) => e.stopPropagation());
}
