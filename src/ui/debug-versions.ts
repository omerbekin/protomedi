/**
 * Debug > Versions sekmesi: karakter (class) bazında görsel-işitsel sürüm seçimi (v1 = mevcut, v2 = yeni tasarım; src/game/asset-versions.ts).
 * Her class için bir satır: avatar + ad + açılır menü (v1 / "v2 (empty)" ya da "v2 · 5/9"); en üstte "All classes" toplu seçim; en altta
 * Shared (Rest/Skip/Move, durum rozetleri). Seçim localStorage'da kalır. Değişince açık savaşın alt çubuğu (skill ikonları, pasif, logo)
 * hemen yeniden çizilir; sesler ve animasyonlar bir sonraki kullanımda yeni sürümle oynar. 'Restart battle' her şeyi baştan kurar.
 */
import { content } from '../engine';
import { ASSET_VERSIONS, SHARED_KEY, allVersionsState, getVersion, inScope, setAllVersions, setVersion, versionKeys, type AssetVersion } from '../game/asset-versions';
import { v2Label, v2Progress } from '../game/art-v2/status';
import { assetFiles } from '../gallery/files';
import { debugButton, debugHeading, type DebugMenu } from './debug-menu';
import { iconUrl } from './dom-icons';

export const VERSIONS_TAB = 'Versions';

/** Debug panelinin sahneye dokunduğu tek yer (BattleScene'e bağımlı olmamak için dışarıdan verilir). */
export interface VersionsHost {
  /** Açık savaşın alt çubuğunu yeniden çizer (yoksa hiçbir şey). */
  refreshBattle: () => void;
  /** Açık savaşı aynı seed'le yeniden başlatır (yoksa false). */
  restartBattle: () => boolean;
}

const avatarOf = (spriteId: string): string | null => {
  for (const [path, url] of Object.entries(assetFiles.avatars)) if (path.replace(/\\/g, '/').endsWith(`/avatars/${spriteId}.png`)) return url;
  return null;
};

function select(options: Array<{ value: string; label: string }>, value: string, onChange: (v: string) => void, title: string): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = 'debug-select';
  el.title = title;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    el.append(opt);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

/** Bir sürüm anahtarının ekrandaki adı. */
const nameOf = (key: string): string => (key === SHARED_KEY ? 'Shared' : (content.classes[key]?.name ?? key));

/** v2 kapsamı kısıtlıysa kısa not (Defender: yalnızca sesler). */
function scopeNote(key: string): string {
  const kinds = (['icon', 'vfx', 'sfx'] as const).filter((k) => inScope(key, k));
  if (kinds.length === 3) return '';
  const label = { icon: 'icons', vfx: 'animations', sfx: 'sounds' } as const;
  return `v2 covers ${kinds.map((k) => label[k]).join(' + ')} only`;
}

export function registerVersionsPanel(debug: Pick<DebugMenu, 'registerPanel'>, host: VersionsHost): void {
  const notes: string[] = [];
  const changed = (what: string): void => {
    host.refreshBattle();
    notes.splice(0, notes.length, `${what}. Icons update now; sounds and animations on their next use.`);
  };

  debug.registerPanel({
    id: 'panel.versions',
    tab: VERSIONS_TAB,
    render: (el, refresh) => {
      el.append(debugHeading('Art & sound versions'));
      const intro = document.createElement('div');
      intro.className = 'debug-note dim';
      intro.textContent = 'Pick the icon, animation and sound set per class. v1 = current, v2 = redesign. Missing v2 items fall back to v1. Summons follow their owner (Skeleton -> Undead, Treant -> Druid).';
      el.append(intro);

      // --- toplu seçim ---
      const all = allVersionsState();
      const allRow = document.createElement('div');
      allRow.className = 'debug-version-row all';
      const allName = document.createElement('span');
      allName.className = 'debug-version-name';
      allName.textContent = 'All classes';
      allRow.append(
        allName,
        select(
          [...(all === 'mixed' ? [{ value: 'mixed', label: 'mixed' }] : []), { value: 'v1', label: 'v1 (all)' }, { value: 'v2', label: 'v2 (all)' }],
          all,
          (v) => {
            if (v !== 'v1' && v !== 'v2') return;
            setAllVersions(v);
            changed(`All classes: ${v}`);
            refresh();
          },
          'Set every class (and Shared) to the same version',
        ),
      );
      el.append(allRow);

      // --- class satırları ---
      const list = document.createElement('div');
      list.className = 'debug-version-list';
      for (const key of versionKeys()) {
        const def = content.classes[key];
        const row = document.createElement('div');
        row.className = 'debug-version-row';
        const av = def ? avatarOf(def.spriteId) : null;
        const img = document.createElement('img');
        img.className = 'debug-version-avatar pixelated';
        img.alt = '';
        img.src = av ?? iconUrl(def ? def.logo : 'frame', def?.color ?? '#e8c47e', key);
        const name = document.createElement('span');
        name.className = 'debug-version-name';
        name.textContent = nameOf(key);
        const note = scopeNote(key);
        if (note) name.title = note;
        if (def?.color) name.style.color = def.color;
        const p = v2Progress(key);
        const cur = getVersion(key);
        const sel = select(
          ASSET_VERSIONS.map((v) => ({ value: v, label: v === 'v1' ? 'v1 (current)' : v2Label(key) })),
          cur,
          (v) => {
            setVersion(key, v as AssetVersion);
            changed(`${nameOf(key)}: ${v}`);
            refresh();
          },
          `${nameOf(key)}: icons ${p.icon.ready}/${p.icon.total}, animations ${p.vfx.ready}/${p.vfx.total}, sounds ${p.sfx.ready}/${p.sfx.total}${p.extra ? `, +${p.extra} new v2 items` : ''}${note ? ` (${note})` : ''}`,
        );
        if (cur === 'v2') sel.classList.add('on');
        row.append(img, name, sel);
        list.append(row);
      }
      el.append(list);

      const tools = document.createElement('div');
      tools.className = 'debug-grid';
      tools.append(
        debugButton('Restart battle', () => {
          notes.splice(0, notes.length, host.restartBattle() ? 'Battle restarted with the selected versions.' : 'No battle is running.');
          refresh();
        }, { icon: 'restart', title: 'Restart the current battle (same seed) so every icon, sound and animation uses the selected versions' }),
        debugButton('All v1', () => {
          setAllVersions('v1');
          changed('All classes: v1');
          refresh();
        }, { icon: 'swap', on: all === 'v1', title: 'Back to the current art for everything' }),
      );
      el.append(tools);
      if (notes[0]) {
        const n = document.createElement('div');
        n.className = 'debug-note';
        n.textContent = notes[0];
        el.append(n);
      }
      const tip = document.createElement('div');
      tip.className = 'debug-note dim';
      tip.textContent = 'Saved in this browser. Wiki > Assets > Versions shows v1 and v2 side by side (icons, sounds, animations).';
      el.append(tip);
    },
  });
}
