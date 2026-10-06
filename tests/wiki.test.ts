import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { buildWiki, stripNow, type WikiBlock, type WikiFiles } from '../src/wiki/catalog';
import { UI_ICONS } from '../src/ui/dom-icons';
import { ICON_KINDS } from '../src/ui/icon-kinds';

function scan(dir: string, depth: 1 | 2): Record<string, string> {
  const root = join(__dirname, '..', 'assets', dir);
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  for (const a of readdirSync(root, { withFileTypes: true })) {
    if (depth === 1 && a.isFile() && a.name.endsWith('.png')) out[`assets/${dir}/${a.name}`] = join(root, a.name);
    if (depth === 2 && a.isDirectory()) for (const f of readdirSync(join(root, a.name))) if (f.endsWith('.png')) out[`assets/${dir}/${a.name}/${f}`] = join(root, a.name, f);
  }
  return out;
}
const files: WikiFiles = { sprites: scan('sprites', 2), avatars: scan('avatars', 1) };
const wiki = buildWiki(files);
const blockText = (b: WikiBlock): string[] => (b.kind === 'p' ? [b.text] : b.kind === 'list' ? b.items : [...b.head, ...b.rows.flat()]);

describe('Wiki kataloğu (sağ üst kitap simgesi)', () => {
  it('kitap ikonu tanımlı ve arayüz ikonu olarak kullanılıyor', () => {
    expect(ICON_KINDS as readonly string[]).toContain('book');
    expect(UI_ICONS as readonly string[]).toContain('book');
  });

  it('tüm class ve çağrılar kartlarıyla, sprite/avatar/logo/skill/pasifleriyle yer alır', () => {
    expect(wiki.classes.map((c) => c.id).sort()).toEqual(Object.keys(content.classes).sort());
    expect(wiki.summons.map((c) => c.id).sort()).toEqual(Object.keys(content.summons).sort());
    for (const u of [...wiki.classes, ...wiki.summons]) {
      const def = content.classes[u.id] ?? content.summons[u.id]!;
      expect(u.spriteUrl, `${u.id} sprite`).not.toBeNull();
      expect(u.avatarUrl, `${u.id} avatar`).not.toBeNull();
      expect(u.logo).toBe(def.logo);
      expect(u.skills.map((s) => s.id), u.id).toEqual(def.skills);
      expect(u.derived.map((d) => d.key)).toEqual(expect.arrayContaining(['hp', 'mp', 'spd', 'evasion', 'accuracy', 'critChance', 'armor', 'magicArmor', 'hpRegen', 'mpRegen']));
      expect(u.attributes).toHaveLength(4);
      if (u.kind === 'class') {
        expect(u.role, `${u.id} role`).not.toBe('');
        expect(u.primaryBonus, `${u.id} primary bonus`).not.toBeNull();
        expect(u.primaryBonus!.name.length).toBeGreaterThan(0);
        expect(u.primaryBonus!.text.length).toBeGreaterThan(10);
      }
      if (def.passive) expect(u.passive?.text.length, `${u.id} passive`).toBeGreaterThan(10);
    }
    for (const c of wiki.classes) expect(c.skills).toHaveLength(4);
  });

  it('tüm skill listelenir; ad, hedef rozeti, bedel, cooldown ve açıklaması boş değildir', () => {
    expect(wiki.skills.map((s) => s.id).sort()).toEqual(Object.keys(content.skills).sort());
    for (const s of wiki.skills) {
      expect(s.name, s.id).not.toBe('');
      expect(s.targetBadge, s.id).not.toBe('');
      expect(s.cost, s.id).not.toBe('');
      expect(s.cooldown, s.id).not.toBe('');
      expect(s.lines.length, `${s.id} açıklaması`).toBeGreaterThan(0);
      for (const l of s.lines) expect(l.trim(), s.id).not.toBe('');
      expect(s.owner.kind, `${s.id} sahipsiz`).not.toBe('other');
    }
  });

  it('tüm durumlar ve zeminler ikon, renk ve açıklamayla listelenir', () => {
    expect(wiki.statuses.map((s) => s.id).sort()).toEqual(Object.keys(content.statuses).sort());
    expect(wiki.grounds.map((g) => g.id).sort()).toEqual(Object.keys(content.grounds).sort());
    for (const s of wiki.statuses) {
      expect(s.icon).not.toBe('');
      expect(s.color).toMatch(/^#/);
      expect(s.text.trim(), s.id).not.toBe('');
    }
    for (const g of wiki.grounds) {
      expect(g.icon).not.toBe('');
      expect(g.text.trim(), g.id).not.toBe('');
    }
  });

  it('Mechanics: her stat, her primary bonus ve ana mekanikler var; boş metin ve şimdiki değer sızıntısı yok', () => {
    const ids = wiki.mechanics.map((a) => a.id);
    for (const k of ['str', 'int', 'dex', 'luck', 'hp', 'mp', 'spd', 'critChance', 'accuracy', 'evasion', 'armor', 'magicArmor']) expect(ids, k).toContain(`stat-${k}`);
    for (const k of ['str', 'dex', 'int', 'luck']) expect(ids).toContain(`bonus-${k}`);
    for (const k of ['damage-formula', 'hit-chance', 'ground', 'gamble', 'thorns', 'summons', 'revive', 'rage', 'actions', 'area-shapes']) expect(ids, k).toContain(k);
    for (const name of ['Resilience', "Hunter's Mark", 'Mana Echo', 'Lucky Escape']) expect(wiki.mechanics.some((a) => a.title === name), name).toBe(true);
    for (const a of [...wiki.mechanics, ...wiki.gettingStarted]) {
      expect(a.blocks.length, a.id).toBeGreaterThan(0);
      for (const t of a.blocks.flatMap(blockText)) {
        expect(t.trim(), `${a.id} boş metin`).not.toBe('');
        expect(t, `${a.id} şimdiki değer sızdı`).not.toMatch(/\(now |, now |undefined|NaN/);
      }
    }
  });

  it('Rage, global eylemler (Rest/Skip/Move) ve miss/dodge ayrımı Mechanics içinde yazılıdır; sayılar veriden', () => {
    const text = (id: string) => wiki.mechanics.find((a) => a.id === id)!.blocks.flatMap(blockText).join(' ');
    const r = content.formulas.rage;
    expect(text('rage')).toContain(`0 to ${r.max}`);
    expect(text('rage')).toContain(String(r.perHitCap));
    expect(text('rage')).toContain(content.skills.abyssal_cry!.name);
    for (const d of Object.values(content.globalSkills)) expect(text('actions'), d.id).toContain(d.name);
    expect(text('actions')).toContain(`${content.globalSkills.rest!.mp} MP`);
    expect(text('actions')).toContain('next turn arrives in half the time');
    const hit = text('hit-chance');
    expect(hit).toContain('Dodge');
    expect(hit).toContain('MISS');
    expect(wiki.gettingStarted.flatMap((a) => a.blocks.flatMap(blockText)).join(' ')).toContain(`${content.formulas.attributes.mpBase} base MP`);
  });

  it('bahis (gamble) skilleri Mechanics içinde yazılıdır', () => {
    const gamble = wiki.mechanics.find((a) => a.id === 'gamble')!;
    const text = gamble.blocks.flatMap(blockText).join('\n');
    for (const s of Object.values(content.skills)) if (s.effects.some((e) => e.type === 'damage' && e.bet)) expect(text, s.name).toContain(s.name);
  });

  it('sayılar formulas.json içinden gelir (eşik, dizilim, evasion adımı, zırh k, zayıflıklar)', () => {
    const f = content.formulas;
    const start = wiki.gettingStarted.flatMap((a) => a.blocks.flatMap(blockText)).join('\n');
    expect(start).toContain(String(f.turn.threshold));
    expect(start).toContain(`${f.formation.rows} x ${f.formation.lanes}`);
    const mech = wiki.mechanics.flatMap((a) => a.blocks.flatMap(blockText)).join('\n');
    expect(mech).toContain(`armor + ${f.armor.k}`);
    expect(mech).toContain(`${f.attributes.dexPerEvasionStep} Dexterity`);
    const head = wiki.elementTable.head.map((x) => x.toLowerCase());
    for (const [tag, m] of Object.entries(f.weaknesses))
      for (const [el, mult] of Object.entries(m)) expect(wiki.elementTable.rows.find((r) => r[0]!.toLowerCase() === tag)?.[head.indexOf(el)]).toBe(`x${mult}`);
  });

  it('Getting Started: tur sırası, takım, dizilim, MP ve cooldown başlıkları var; test modundan söz edilmez', () => {
    const ids = wiki.gettingStarted.map((a) => a.id);
    for (const k of ['goal', 'turns', 'formation', 'mana']) expect(ids).toContain(k);
    expect(wiki.gettingStarted.flatMap((a) => a.blocks.flatMap(blockText)).join(' ').toLowerCase()).not.toContain('test mode');
  });

  it('elementler: her element rengiyle yer alır, zayıflık verisi tabloda', () => {
    expect(wiki.elements.map((e) => e.id).sort()).toEqual(['arcane', 'dark', 'fire', 'holy', 'ice', 'nature', 'physical']);
    for (const e of wiki.elements) expect(e.color).toMatch(/^#/);
    expect(wiki.elementTable.rows.length).toBe(Object.keys(content.formulas.weaknesses).length);
  });

  it('stripNow: şimdiki değer parçalarını atar', () => {
    expect(stripNow('Max MP: +2 per point (now 40)')).toBe('Max MP: +2 per point');
    expect(stripNow('Accuracy: +1% per point (base 80%, now 90%); misses')).toBe('Accuracy: +1% per point; misses');
  });
});

describe('Wiki: test class\'ı ve alan şekilleri', () => {
  it('testOnly class (Geometer) wiki\'de görünür ve testOnly işaretlidir; diğerleri değil', () => {
    const t = wiki.classes.find((c) => c.id === 'aoe_tester')!;
    expect(t.testOnly).toBe(true);
    expect(t.skills.map((s) => s.id)).toEqual(['shape_row', 'shape_column', 'shape_rect', 'shape_plus']);
    for (const c of wiki.classes.filter((x) => x.id !== 'aoe_tester')) expect(c.testOnly, c.id).toBe(false);
  });

  it('Mechanics: "Area shapes" makalesi row/column/block/cross kurallarını anlatır', () => {
    const text = wiki.mechanics.find((a) => a.id === 'area-shapes')!.blocks.flatMap(blockText).join(' ');
    for (const w of ['Row', 'Column', 'Block', 'Cross', 'bottom-left', 'slides', 'empty']) expect(text, w).toContain(w);
  });
});
