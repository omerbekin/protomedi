/**
 * CODEX düzeni (saf; DOM'suz, testlenebilir): wiki kataloğunu (catalog.ts) Codex ekranının üç sütununa çevirir.
 * Sol menü bölümleri -> orta sütun madde listesi (class'lar portre ızgarası, diğerleri ikonlu satır) -> sağda madde paneli.
 * Her maddenin küçük resmi (portre / skill ikonu / durum ikonu / element ikonu) burada seçilir; çizimi view.ts yapar.
 * Arama: catalog'un `search` metinleri; kelimelerin hepsi geçmeli (eski wiki ile aynı kural).
 */
import { paintedOr } from '../ui/misc-icons';
import type { WikiArticle, WikiCatalog, WikiUnit } from './catalog';

export type CodexSectionId = 'start' | 'classes' | 'skills' | 'mechanics' | 'statuses' | 'elements';

/** Maddenin küçük resmi. `portrait`: avatar -> tam boy sprite -> class logosu sırasıyla ilk bulunan (boş portre yok). */
export type CodexThumb =
  | { kind: 'portrait'; url: string | null; from: 'avatar' | 'sprite' | 'logo'; logo: string; color: string; unitId: string }
  | { kind: 'icon'; icon: string; color: string; owner: string | null }
  | { kind: 'skill'; icon: string; color: string; skillId: string }
  | { kind: 'status'; statusId: string; icon: string; color: string };

export interface CodexEntry {
  section: CodexSectionId;
  id: string;
  title: string;
  /** Satırın sağındaki kısa not (rol, sahibi, grup...). */
  sub: string;
  /** Orta sütundaki alt başlık (Classes / Summons, Basics...). */
  group: string;
  thumb: CodexThumb;
  search: string;
}

export interface CodexSectionDef {
  id: CodexSectionId;
  title: string;
  /** Sol menüdeki küçük ikon. */
  icon: string;
  /** Orta sütun: portre ızgarası ya da ikonlu liste. */
  layout: 'tiles' | 'list';
}

export const CODEX_SECTIONS: readonly CodexSectionDef[] = [
  { id: 'start', title: 'Getting Started', icon: 'sword', layout: 'list' },
  { id: 'classes', title: 'Classes', icon: 'helm', layout: 'tiles' },
  { id: 'skills', title: 'Skills', icon: 'fireball', layout: 'list' },
  { id: 'mechanics', title: 'Stats & Mechanics', icon: 'muscle', layout: 'list' },
  { id: 'statuses', title: 'Statuses & Grounds', icon: 'drop', layout: 'list' },
  { id: 'elements', title: 'Elements', icon: 'meteor', layout: 'list' },
];

/** Zemin maddelerinin kimliği (durum kimlikleriyle çakışmasın). */
export const groundEntryId = (id: string): string => `ground:${id}`;
export const WEAKNESS_TABLE_ID = 'weakness-table';

/** Portre: avatar, yoksa tam boy sprite, o da yoksa class logosu (ikon). */
export function portraitOf(u: Pick<WikiUnit, 'id' | 'avatarUrl' | 'spriteUrl' | 'logo' | 'color'>): Extract<CodexThumb, { kind: 'portrait' }> {
  if (u.avatarUrl) return { kind: 'portrait', url: u.avatarUrl, from: 'avatar', logo: u.logo, color: u.color, unitId: u.id };
  if (u.spriteUrl) return { kind: 'portrait', url: u.spriteUrl, from: 'sprite', logo: u.logo, color: u.color, unitId: u.id };
  return { kind: 'portrait', url: null, from: 'logo', logo: u.logo, color: u.color, unitId: u.id };
}

const articleEntry = (section: CodexSectionId, a: WikiArticle): CodexEntry => ({
  section,
  id: a.id,
  title: a.title,
  sub: a.group,
  group: a.group,
  thumb: { kind: 'icon', icon: a.icon, color: a.accent, owner: null },
  search: a.search,
});

const unitEntry = (u: WikiUnit, group: string): CodexEntry => ({
  section: 'classes',
  id: u.id,
  title: u.name,
  sub: u.kind === 'summon' ? 'Summon' : u.role,
  group,
  thumb: portraitOf(u),
  search: u.search,
});

/** Tüm bölümlerin maddeleri (Codex sırasıyla). */
export function codexEntries(cat: WikiCatalog): Record<CodexSectionId, CodexEntry[]> {
  return {
    start: cat.gettingStarted.map((a) => articleEntry('start', a)),
    classes: [...cat.classes.map((u) => unitEntry(u, 'Classes')), ...cat.summons.map((u) => unitEntry(u, 'Summons'))],
    skills: cat.skills.map((s) => ({
      section: 'skills',
      id: s.id,
      title: s.name,
      sub: s.owner.name,
      group: s.owner.name,
      thumb: { kind: 'skill', icon: s.icon, color: s.accent, skillId: s.id },
      search: s.search,
    })),
    mechanics: cat.mechanics.map((a) => articleEntry('mechanics', a)),
    statuses: [
      ...cat.statuses.map((s): CodexEntry => ({ section: 'statuses', id: s.id, title: s.name, sub: s.type === 'buff' ? 'Buff' : 'Debuff', group: 'Statuses', thumb: { kind: 'status', statusId: s.id, icon: s.icon, color: s.color }, search: s.search })),
      ...cat.grounds.map((g): CodexEntry => ({ section: 'statuses', id: groundEntryId(g.id), title: g.name, sub: 'Ground', group: 'Grounds', thumb: { kind: 'icon', icon: paintedOr('ground', g.id, g.icon), color: g.color, owner: 'shared' }, search: g.search })),
    ],
    elements: [
      {
        section: 'elements',
        id: WEAKNESS_TABLE_ID,
        title: 'Weakness table',
        sub: 'All elements',
        group: 'Overview',
        thumb: { kind: 'icon', icon: 'meteor', color: '#ffe29a', owner: null },
        search: `weakness table multiplier ${cat.elementTable.head.join(' ')} ${cat.elementTable.rows.flat().join(' ')}`.toLowerCase(),
      },
      ...cat.elements.map((e): CodexEntry => ({ section: 'elements', id: e.id, title: e.name, sub: e.skills.length ? `${e.skills.length} skills` : 'No skill yet', group: 'Elements', thumb: { kind: 'icon', icon: e.icon, color: e.color, owner: null }, search: e.search })),
    ],
  };
}

/** Arama: boşlukla ayrılmış kelimelerin hepsi maddenin arama metninde geçmeli (büyük/küçük harf duyarsız). */
export function matchesQuery(search: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = search.toLowerCase();
  return words.every((w) => text.includes(w));
}

export function filterEntries(list: readonly CodexEntry[], query: string): CodexEntry[] {
  return query.trim() ? list.filter((e) => matchesQuery(e.search, query)) : [...list];
}

/** Seçili madde süzgeçten düştüyse (ya da yoksa) görünen ilk madde; liste boşsa null. */
export function keepSelection(visible: readonly CodexEntry[], current: string | null): string | null {
  if (current && visible.some((e) => e.id === current)) return current;
  return visible[0]?.id ?? null;
}

/** Listede bir önceki / sonraki madde (klavye yukarı/aşağı); uçlarda durur. */
export function stepSelection(visible: readonly CodexEntry[], current: string | null, delta: number): string | null {
  if (!visible.length) return null;
  const i = visible.findIndex((e) => e.id === current);
  const next = i < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, i + delta));
  return visible[next]!.id;
}
