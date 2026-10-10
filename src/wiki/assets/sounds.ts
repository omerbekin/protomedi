import { audioSettings, playSfxOn, synthSfx } from '../../game/audio';
import { iconUrl } from '../../ui/dom-icons';
import { MASTER_GAIN, UI_SOUND_GROUP, type Catalog, type SoundEntry } from '../../gallery/catalog';
import { previewUiSound, UI_AUDIO, type UiSoundKind } from '../../ui/ui-sound';
import { applyFilter, chipBar, fmtSec, h, isolateKeys, searchable, type SectionApi } from '../../gallery/dom';

/** Galerinin tek AudioContext'i: ilk tıklamada başlar (tarayıcı kilidi). */
let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  void ctx.resume();
  return ctx;
}

/** Bir sesi çalar (oyunun kendi sentezi) ve kartı kısa süre vurgular. */
export function playSound(id: string, card?: HTMLElement | null): void {
  playSfxOn(audioContext(), id);
  if (!card) return;
  card.classList.add('playing');
  const dur = (Number(card.dataset['dur']) || 0.5) * 1000;
  window.setTimeout(() => card.classList.remove('playing'), Math.min(dur, 2500));
}

const isUi = (s: SoundEntry): boolean => s.group === UI_SOUND_GROUP;

/** Codex kartındaki ▶: arayüz sesi ui-sound üzerinden (seyreltmesiz, UI seviyesi kapalı olsa da duyulur), diğerleri oyunun skill sesi. */
function playEntry(s: SoundEntry, card?: HTMLElement | null): void {
  if (!isUi(s)) return playSound(s.id, card);
  previewUiSound(s.id as UiSoundKind, audioContext(), true);
  if (!card) return;
  card.classList.add('playing');
  window.setTimeout(() => card.classList.remove('playing'), Math.max(200, s.duration * 1000));
}

/** Sesi çevrimdışı çalıp tepe genliğini ölçer (0..1, ana ses dahil; arayüz seslerinde UI master x varsayılan seviye). */
async function measurePeak(entry: SoundEntry): Promise<number> {
  const rate = 44100;
  const off = new OfflineAudioContext(1, Math.ceil((entry.duration + 0.4) * rate), rate);
  const master = off.createGain();
  master.gain.value = isUi(entry) ? UI_AUDIO.master * (UI_AUDIO.defaultLevel / 10) : MASTER_GAIN;
  master.connect(off.destination);
  synthSfx(off, master, entry.def, 0);
  const buf = await off.startRendering();
  let peak = 0;
  for (const v of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
  return peak;
}

const db = (v: number): string => (v <= 0 ? '-inf dB' : `${(20 * Math.log10(v)).toFixed(1)} dB`);

export function mountSounds(cat: Catalog): SectionApi {
  const root = h('section', { class: 'section', attrs: { id: 'sounds' } });
  const status = h('span', { class: 'muted small' });
  let group = '';
  let query = '';
  let stopToken = 0;
  const cards = new Map<string, HTMLElement>();
  const peakEls = new Map<string, HTMLElement>();

  const all = [...cat.sounds, ...cat.uiSounds];
  const groups = new Map<string, SoundEntry[]>();
  for (const s of all) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  // Önce arayüz (menü) sesleri, sonra class/çağrı grupları (alfabetik), sonra Shared, en sonda kullanılmayanlar
  const order = [...groups.keys()].sort((a, b) => {
    const rank = (g: string): number => (g === UI_SOUND_GROUP ? -1 : g === 'Unused / UI' ? 2 : g === 'Shared' ? 1 : 0);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  // --- araç çubuğu ---
  const vol = h('input', { attrs: { type: 'range', min: '0', max: '10', step: '1', value: String(Math.round(audioSettings.volume * 10)) }, class: 'range' });
  const volLabel = h('span', { class: 'small', text: `Volume ${vol.value}/10` });
  vol.addEventListener('input', () => {
    audioSettings.volume = Number(vol.value) / 10;
    volLabel.textContent = `Volume ${vol.value}/10`;
  });
  isolateKeys(vol);
  const measure = h('button', { class: 'btn', text: 'Measure peak levels', attrs: { type: 'button' }, title: 'Renders every sound offline and shows its peak level' });
  measure.addEventListener('click', async () => {
    measure.disabled = true;
    let i = 0;
    for (const s of all) {
      status.textContent = `Measuring ${++i}/${all.length}...`;
      const peak = await measurePeak(s);
      const el = peakEls.get(s.id);
      if (el) {
        el.textContent = `peak ${db(peak)}`;
        el.classList.toggle('warn', peak > 0.99);
        el.title = `Peak amplitude ${peak.toFixed(3)} (after master gain ${MASTER_GAIN})${peak > 0.99 ? ' - clipping' : ''}`;
      }
      await new Promise((r) => setTimeout(r));
    }
    status.textContent = 'Peak levels measured';
    measure.disabled = false;
  });
  const chips = chipBar(
    [{ value: '', label: 'All' }, ...order.map((g) => ({ value: g, label: g }))],
    (v) => {
      group = v;
      refresh();
    },
  );

  const countEl = h('span', { class: 'count' });
  root.append(
    h('div', { class: 'section-head' }, h('h2', { text: 'Sounds' }), countEl, h('span', { class: 'muted small', text: 'WebAudio synthesis from data/audio.json (menu sounds: data/audio-ui.json)' })),
    h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, volLabel, vol), measure, status),
    chips,
  );

  // --- gruplar ---
  const body = h('div');
  for (const g of order) {
    const list = groups.get(g)!;
    const playAll = h('button', { class: 'btn small-btn', text: 'Play all in group', attrs: { type: 'button' } });
    playAll.addEventListener('click', async () => {
      if (playAll.dataset['running']) {
        stopToken++;
        return;
      }
      const token = ++stopToken;
      playAll.dataset['running'] = '1';
      playAll.textContent = 'Stop';
      for (const s of list) {
        if (token !== stopToken) break;
        const card = cards.get(s.id);
        if (card?.hidden) continue; // süzgeçle gizlenen ses atlanır
        playEntry(s, card);
        await new Promise((r) => setTimeout(r, Math.min(s.duration, 2.5) * 1000 + 250));
      }
      delete playAll.dataset['running'];
      playAll.textContent = 'Play all in group';
    });
    const grid = h('div', { class: 'cards' });
    for (const s of list) {
      const peak = h('span', { class: 'peak muted small', text: 'peak -' });
      peakEls.set(s.id, peak);
      const users = isUi(s)
        ? [h('span', { class: 'muted small', text: `Menu sound: ${s.desc ?? ''}` })]
        : s.usedBy.length
        ? s.usedBy.map((u) => h('span', { class: 'tag', title: `${u.name} (${u.owner.name})` }, h('img', { class: 'tag-icon pixelated', attrs: { src: iconUrl(u.icon, '#e8c47e'), alt: '' } }), `${u.name}`))
        : [h('span', { class: 'muted small', text: 'Not used by any skill (backup / UI)' })];
      const card = searchable(
        h(
          'article',
          { class: 'card sound', data: { dur: String(s.duration) } },
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'play', text: '▶', title: `Play ${s.id}`, attrs: { type: 'button', 'aria-label': `Play ${s.label}` }, on: { click: () => playEntry(s, card) } }),
            h('div', { class: 'grow' }, h('div', { class: 'card-title', text: s.label }), h('div', { class: 'muted small mono', text: s.id })),
            h('div', { class: 'right small' }, h('div', { text: fmtSec(s.duration) }), peak),
          ),
          h('div', { class: 'muted small', text: `gain ${s.gain} - ${s.layerCount} layers (${s.summary})` }),
          h('div', { class: 'tags' }, ...users),
          h('details', {}, h('summary', { text: 'Layers' }), h('ul', { class: 'small mono' }, ...s.layers.map((l) => h('li', { text: l })))),
        ),
        `${s.id} ${s.label} ${s.group} ${s.usedBy.map((u) => `${u.name} ${u.owner.name}`).join(' ')}`,
        s.group,
      );
      cards.set(s.id, card);
      grid.append(card);
    }
    body.append(h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', { text: g }), h('span', { class: 'muted small', text: `${list.length}` }), playAll), grid));
  }
  root.append(body);

  // --- müzik / ambiyans ---
  root.append(
    h('h3', { class: 'sub', text: 'Soundtracks' }),
    cat.soundtracks.length
      ? h('div', { class: 'tags' }, ...cat.soundtracks.map((t) => h('span', { class: 'tag', text: t })))
      : h('p', { class: 'note', text: 'No music yet. Only synthesized sound effects exist; when a music/ambience entry is added to data/audio.json it will be listed here.' }),
  );

  const refresh = (): number => {
    const n = applyFilter(body, query, group);
    countEl.textContent = `${n} / ${all.length}`;
    return n;
  };
  return {
    id: 'sounds',
    title: 'Sounds',
    total: all.length,
    root,
    setQuery: (q) => {
      query = q;
      return refresh();
    },
  };
}
