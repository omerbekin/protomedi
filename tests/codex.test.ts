import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { buildWiki, elementIcon, skillStatusIds, type WikiFiles } from '../src/wiki/catalog';
import { CODEX_SECTIONS, codexEntries, filterEntries, groundEntryId, keepSelection, portraitOf, stepSelection, WEAKNESS_TABLE_ID } from '../src/wiki/codex';
import { SLOT_GLYPH } from '../src/wiki/slot-glyphs';
import { ICON_KINDS } from '../src/ui/icon-kinds';
import itemsJson from '../data/items.json';

// Sayfadaki import.meta.glob ile aynı biçim (yol -> url)
function files(): WikiFiles {
  const root = join(__dirname, '..', 'assets');
  const sprites: Record<string, string> = {};
  for (const dir of readdirSync(join(root, 'sprites'))) for (const f of readdirSync(join(root, 'sprites', dir)).filter((x) => x.endsWith('.png'))) sprites[`../../assets/sprites/${dir}/${f}`] = `/assets/sprites/${dir}/${f}`;
  const avatars: Record<string, string> = {};
  if (existsSync(join(root, 'avatars'))) for (const f of readdirSync(join(root, 'avatars')).filter((x) => x.endsWith('.png'))) avatars[`../../assets/avatars/${f}`] = `/assets/avatars/${f}`;
  return { sprites, avatars };
}

const wiki = buildWiki(files());
const entries = codexEntries(wiki);
const icons = new Set<string>(ICON_KINDS);

describe('Codex düzeni (sol menü + liste + madde)', () => {
  it('her bölüm katalogdaki tüm maddeleri taşır; kimlikler bölüm içinde tekil', () => {
    expect(CODEX_SECTIONS.map((s) => s.id)).toEqual(['start', 'classes', 'skills', 'mechanics', 'statuses', 'elements']);
    expect(entries.start).toHaveLength(wiki.gettingStarted.length);
    expect(entries.classes).toHaveLength(wiki.classes.length + wiki.summons.length);
    expect(entries.skills).toHaveLength(wiki.skills.length);
    expect(entries.mechanics).toHaveLength(wiki.mechanics.length);
    expect(entries.statuses).toHaveLength(wiki.statuses.length + wiki.grounds.length);
    expect(entries.elements).toHaveLength(wiki.elements.length + 1);
    expect(entries.elements[0]!.id).toBe(WEAKNESS_TABLE_ID);
    for (const s of CODEX_SECTIONS) {
      const ids = entries[s.id].map((e) => e.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
      for (const e of entries[s.id]) expect(e.title.trim(), `${s.id}/${e.id}`).not.toBe('');
    }
  });

  it('her class ve çağrı bir portre gösterir (avatar, yoksa sprite, yoksa logo); boş portre yok', () => {
    for (const e of entries.classes) {
      expect(e.thumb.kind).toBe('portrait');
      if (e.thumb.kind !== 'portrait') continue;
      expect(e.thumb.from, e.id).toBe('avatar'); // tüm class'ların avatarı var
      expect(e.thumb.url, e.id).toBeTruthy();
      expect(icons.has(e.thumb.logo), `${e.id} logo`).toBe(true);
    }
    // yedek sırası
    const u = { id: 'x', logo: 'helm', color: '#fff' };
    expect(portraitOf({ ...u, avatarUrl: 'a.png', spriteUrl: 's.png' })).toMatchObject({ from: 'avatar', url: 'a.png' });
    expect(portraitOf({ ...u, avatarUrl: null, spriteUrl: 's.png' })).toMatchObject({ from: 'sprite', url: 's.png' });
    expect(portraitOf({ ...u, avatarUrl: null, spriteUrl: null })).toMatchObject({ from: 'logo', url: null, logo: 'helm' });
  });

  it('liste ikonları tanımlı: skill, durum, zemin, element, makale', () => {
    for (const sec of CODEX_SECTIONS)
      for (const e of entries[sec.id]) {
        const t = e.thumb;
        if (t.kind === 'portrait') continue;
        expect(t.icon, `${sec.id}/${e.id}`).not.toBe('');
      }
    for (const e of wiki.elements) {
      expect(e.icon).toBe(elementIcon(e.id));
      expect(icons.has(e.icon), `${e.id} element icon ${e.icon}`).toBe(true);
    }
  });

  it('skill -> durum ve durum -> skill bağlantıları birbirini tutar (Codex çipleri)', () => {
    const statusIds = new Set(wiki.statuses.map((s) => s.id));
    const groundIds = new Set(wiki.grounds.map((g) => g.id));
    for (const s of wiki.skills) {
      for (const id of s.statuses) {
        expect(statusIds.has(id), `${s.id} -> ${id}`).toBe(true);
        expect(wiki.statuses.find((x) => x.id === id)!.usedBySkills.map((r) => r.id), `${id} <- ${s.id}`).toContain(s.id);
      }
      for (const id of s.grounds) {
        expect(groundIds.has(id), `${s.id} -> ${id}`).toBe(true);
        expect(entries.statuses.some((e) => e.id === groundEntryId(id))).toBe(true);
      }
    }
    for (const st of wiki.statuses) for (const r of st.usedBySkills) expect(wiki.skills.find((s) => s.id === r.id)!.statuses).toContain(st.id);
    // Dark Bond -> dark_bond durumu
    const bond = Object.entries(content.skills).find(([, s]) => s.effects.some((e) => e.type === 'bond'));
    if (bond) expect(skillStatusIds({ ...bond[1], id: bond[0] })).toContain('dark_bond');
    // element maddesinin skill bağlantıları gerçek skill'ler
    for (const e of wiki.elements) for (const r of e.skillRefs) expect(wiki.skills.some((s) => s.id === r.id), r.id).toBe(true);
  });

  it('Items and gear makalesi yuvaları (siluetli) ve nadirlik renklerini taşır', () => {
    const items = wiki.mechanics.find((a) => a.id === 'items');
    expect(items?.gear).toBeDefined();
    expect(items!.gear!.slots.map((s) => s.id)).toEqual(itemsJson.slots.map((s) => s.id));
    for (const s of items!.gear!.slots) expect(SLOT_GLYPH[s.id], s.id).toBeTruthy();
    expect(items!.gear!.rarities.map((r) => r.color)).toEqual(itemsJson.rarities.map((r) => r.color));
  });

  it('arama: kelimelerin hepsi geçmeli; seçim süzgeçten düşerse ilk görünen maddeye geçer', () => {
    const all = entries.classes;
    expect(filterEntries(all, '')).toHaveLength(all.length);
    const war = filterEntries(all, 'WARRIOR');
    expect(war.some((e) => e.id === 'warrior')).toBe(true);
    expect(filterEntries(all, 'warrior zzzz-none')).toHaveLength(0);
    expect(keepSelection(war, 'warrior')).toBe('warrior');
    expect(keepSelection(war, 'not-there')).toBe(war[0]!.id);
    expect(keepSelection([], 'warrior')).toBeNull();
    expect(stepSelection(all, all[0]!.id, 1)).toBe(all[1]!.id);
    expect(stepSelection(all, all[0]!.id, -1)).toBe(all[0]!.id);
    expect(stepSelection(all, all[all.length - 1]!.id, 1)).toBe(all[all.length - 1]!.id);
    expect(stepSelection(all, null, 1)).toBe(all[0]!.id);
    // bir durum adı, onu uygulayan skill'i de bulur
    const stun = wiki.statuses.find((s) => s.id === 'stun');
    if (stun?.usedBySkills[0]) expect(filterEntries(entries.statuses, stun.usedBySkills[0].name).some((e) => e.id === 'stun')).toBe(true);
  });
});
