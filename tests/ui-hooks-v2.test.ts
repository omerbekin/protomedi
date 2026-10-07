import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Battle, content } from '../src/engine';
import type { BattleEvent, Combatant } from '../src/engine';
import { ICONS_V2 } from '../src/game/art-v2/icons-index';
import { VFX_V2 } from '../src/game/art-v2/vfx-index';
import { badgeSpriteName, statusBadge, v2SpriteName } from '../src/game/art-registry';
import { SHARED_KEY, ownerOfLogo, reloadVersions, setAllVersions, setVersion, statusOwner } from '../src/game/asset-versions';
import { EVENT_FX, eventContextSkill, eventFxOf, selectEventFx } from '../src/game/event-fx';
import { PALETTE, V2_PALETTE, accentTokens } from '../src/game/pixel-art';
import { UsageRecorder, summarizeUsage } from '../src/game/skill-usage';
import { tierStyle, unitName } from '../src/game/unit-label';
import { buildIcons } from '../src/gallery/catalog';

/**
 * v2 sanatın ve seferin arayüz bağlantıları (ui-dev, madde 259): olay efekti kancaları (çağrı doğuşu / ceset emme / çağrı ölümü, Hexer
 * Doom / Ill Omen / Wither), skill kullanım özeti (VfxCtx.usage), durum rozeti sürüm kararı, logo sahipliği, Rest ikonu, v2 paleti, ad/rütbe.
 */

const g = globalThis as { localStorage?: Storage };
function memStorage(): Storage {
  const data: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => Object.keys(data).forEach((k) => delete data[k]),
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}
beforeEach(() => {
  g.localStorage = memStorage();
  reloadVersions();
});
afterEach(() => {
  g.localStorage = undefined;
  reloadVersions();
});

const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
function mk(party: Record<number, string>, enemies: Record<number, string>): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells(party), enemies: cells(enemies) }, false));
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, manaEcho: 0, resilience: 0, surviveChance: 0 });
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
  }
  return b;
}
const at = (b: Battle, side: 'party' | 'enemy', slot: number): Combatant => b.combatants.find((c) => c.side === side && c.slot === slot && !c.summoned)!;
const used = (events: BattleEvent[]) => events.find((e): e is Extract<BattleEvent, { type: 'skillUsed' }> => e.type === 'skillUsed')!;
/** Skill'i kullanır ve kullanımın özetini döner (hata verirse test düşer). */
function useAndSummarize(b: Battle, uid: string, skill: string, target?: string) {
  const r = b.useSkill(uid, skill, target);
  if (!r.ok) throw new Error(`${skill}: ${r.reason}`);
  const u = used(r.events);
  return summarizeUsage(u, r.events.slice(r.events.indexOf(u) + 1));
}

describe('skill kullanım özeti (VfxCtx.usage)', () => {
  it('Mana Barrier: arınma bilgisi yalnızca debuff GERÇEKTEN silindiyse dolu', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'hexer' });
    const w = at(b, 'party', 0);
    const m = at(b, 'party', 1);
    const foe = at(b, 'enemy', 0);
    w.statuses.push({ kind: 'slow', turns: 2, source: foe.uid });
    const u1 = useAndSummarize(b, m.uid, 'mana_barrier', w.uid);
    expect(u1.dispelledFrom(w.uid)).toEqual(['slow']);
    expect(u1.dispelled[0]).toMatchObject({ target: w.uid, status: 'slow' });
    // ikinci kez: silinecek debuff yok -> arınma adımı oynamaz
    m.cooldowns = {};
    m.mp = m.maxMp;
    const u2 = useAndSummarize(b, m.uid, 'mana_barrier', w.uid);
    expect(u2.dispelledFrom(w.uid)).toEqual([]);
  });

  it('kayıtçı olayları skillUsed başına toplar, sonraki eylem/tur başında keser; şifa ve ceset kısayolları', () => {
    const rec = new UsageRecorder();
    const s1 = { type: 'skillUsed', actor: 'a', skill: 'vampiric_bite', targets: ['b'] } as unknown as Extract<BattleEvent, { type: 'skillUsed' }>;
    const s2 = { type: 'skillUsed', actor: 'u', skill: 'raise_dead', targets: [], slot: 4, corpseUid: 'dead1' } as unknown as Extract<BattleEvent, { type: 'skillUsed' }>;
    const evs: BattleEvent[] = [
      s1,
      { type: 'damage', source: 'a', target: 'b', amount: 10, absorbed: 0, hpAfter: 5, shieldAfter: 0, magicShieldAfter: 0, crit: false },
      { type: 'heal', source: 'a', target: 'a', amount: 4, hpAfter: 50, crit: false },
      { type: 'heal', source: 'a', target: 'c', amount: 3, hpAfter: 20, crit: false, cause: 'dark_bond' },
      { type: 'turnStart', actor: 'x', queue: [] },
      { type: 'heal', source: 'z', target: 'a', amount: 99, hpAfter: 99, crit: false },
      s2,
      { type: 'corpseConsumed', uid: 'dead1', by: 'u', slot: 2, side: 'enemy' },
    ];
    for (const e of evs) rec.push(e);
    const u1 = rec.usageOf(s1);
    expect(u1.healsOn('a')).toBe(4); // tur başından sonraki şifa bu kullanıma ait değil
    expect(u1.healsOn('c', 'dark_bond')).toBe(3);
    expect(u1.damages).toHaveLength(1);
    const u2 = rec.usageOf(s2);
    expect(u2.corpseUid).toBe('dead1');
    expect(u2.slot).toBe(4);
  });
});

describe('durum rozeti sürüm kararı', () => {
  it('sınıfa özgü durumların sahibi: Omen/Wither/Jinxed -> Hexer, Dark Bond -> Undead; ortak durum (Stun, Slow) sahipsiz', () => {
    expect(statusOwner('omen')).toBe('hexer');
    expect(statusOwner('wither')).toBe('hexer');
    expect(statusOwner('jinxed')).toBe('hexer');
    expect(statusOwner('dark_bond')).toBe('undead');
    expect(statusOwner('stun')).toBeNull();
  });

  it('v1: Shared + statuses.json ikonu; Hexer v2: badge_<id> çizimi; Shared v2 ortak durumu kendi dosyasından çözer', () => {
    const omenIcon = content.statuses.omen!.icon;
    expect(statusBadge('omen', omenIcon)).toEqual({ name: omenIcon, owner: SHARED_KEY });
    setVersion('hexer', 'v2');
    for (const id of ['omen', 'wither', 'jinxed']) {
      const has = !!(ICONS_V2.hexer!.SPRITES[badgeSpriteName(id)] || ICONS_V2.hexer!.ICONS[badgeSpriteName(id)]);
      const icon = content.statuses[id]!.icon;
      expect(statusBadge(id, icon)).toEqual(has ? { name: v2SpriteName('hexer', badgeSpriteName(id)), owner: 'hexer' } : { name: icon, owner: SHARED_KEY });
    }
    expect(statusBadge('stun', 'bash')).toEqual({ name: 'bash', owner: SHARED_KEY });
    // ayrı rozeti olmayan sınıf durumu: ikon adı o class'ın v2 ikonuysa onu kullanır (Dark Bond -> Undead), yoksa Shared
    const bondIcon = content.statuses.dark_bond!.icon;
    const undeadHas = !!ICONS_V2.undead!.ICONS[bondIcon] && !ICONS_V2.undead!.SPRITES[badgeSpriteName('dark_bond')] && !ICONS_V2.undead!.ICONS[badgeSpriteName('dark_bond')];
    setVersion('undead', 'v2');
    if (undeadHas) expect(statusBadge('dark_bond', bondIcon)).toEqual({ name: bondIcon, owner: 'undead' });
    setVersion('undead', 'v1');
    expect(statusBadge('dark_bond', bondIcon)).toEqual({ name: bondIcon, owner: SHARED_KEY });
  });
});

describe('logo sahipliği ve Rest ikonu', () => {
  it('class logosu sahibini, çağrı logosu çağıranını verir; logo olmayan ad null', () => {
    for (const c of Object.values(content.classes)) if (ownerOfLogo(c.logo) !== null) expect(ownerOfLogo(c.logo)).toBe(c.id);
    expect(ownerOfLogo(content.classes.warrior!.logo)).toBe('warrior');
    expect(ownerOfLogo('gear')).toBeNull();
  });

  it('global eylem ikonları (Rest) kullanılıyor sayılır; Shared v2 Rest ICONS içinde', () => {
    const rest = buildIcons().find((i) => i.name === content.globalSkills.rest!.icon)!;
    expect(rest.category).not.toBe('spare');
    expect(ICONS_V2[SHARED_KEY]!.ICONS['rest']).toBeDefined();
    expect(ICONS_V2[SHARED_KEY]!.SPRITES['rest']).toBeUndefined();
  });
});

describe('olay efekti kancaları (event-fx)', () => {
  it('adlar ve bağlam skill i: Skeleton doğuşu Undead Raise Dead, Treant Druid', () => {
    expect(EVENT_FX.summon('enemy_skeleton')).toBe('summon_skeleton');
    expect(EVENT_FX.summonDeath('treant')).toBe('summondeath_treant');
    expect(eventContextSkill('undead', { unitId: 'skeleton' })?.id).toBe('raise_dead');
    const treantSkill = eventContextSkill('druid', { unitId: 'treant' })!;
    expect(treantSkill.effects.some((e) => e.type === 'summon' && e.unit === 'treant')).toBe(true);
    expect(eventContextSkill('hexer', { skillId: 'doom_mark' })?.id).toBe('doom_mark');
    expect(eventContextSkill('hexer')?.id).toBe(content.classes.hexer!.skills[0]);
  });

  it('v1 seçiliyken hiç v2 olay efekti oynamaz; v2 de varsa oynar, yoksa (v1 e düşüş) undefined', () => {
    const fake = async (): Promise<void> => undefined;
    const file = VFX_V2.undead as Record<string, unknown>;
    const had = 'summon_skeleton' in file;
    const old = file['summon_skeleton'];
    file['summon_skeleton'] = fake;
    try {
      expect(selectEventFx('undead', EVENT_FX.summon('skeleton'))).toBeUndefined();
      setVersion('undead', 'v2');
      expect(selectEventFx('undead', EVENT_FX.summon('skeleton'))).toBe(fake);
      expect(selectEventFx('undead', 'summon_no_such')).toBeUndefined();
    } finally {
      if (had) file['summon_skeleton'] = old;
      else delete file['summon_skeleton'];
    }
    // Hexer motor olayları v2 dosyasında hazır (doomburst / omentransfer / withertick)
    for (const k of [EVENT_FX.doom, EVENT_FX.omenTransfer, EVENT_FX.witherTick]) expect(typeof eventFxOf('hexer', k)).toBe('function');
    setAllVersions('v1');
    expect(selectEventFx('hexer', EVENT_FX.doom)).toBeUndefined();
  });
});

describe('v2 geniş paleti ve birim adı', () => {
  it('v2 jetonları v1 paletiyle ve vurgu jetonlarıyla çakışmaz (v1 çıktıları değişmez)', () => {
    const accent = Object.keys(accentTokens('#ffffff'));
    for (const t of Object.keys(V2_PALETTE)) {
      expect(t).toHaveLength(1);
      expect(t in PALETTE, t).toBe(false);
      expect(accent.includes(t), t).toBe(false);
      expect(t).not.toBe('.');
    }
  });

  it('özel ad varsa o, yoksa class adı; rütbe rozeti elite altın, boss kızıl', () => {
    expect(unitName({ name: 'Warrior', displayName: 'Bandit Chief' })).toBe('Bandit Chief');
    expect(unitName({ name: 'Warrior' })).toBe('Warrior');
    expect(tierStyle('elite')?.label).toBe('ELITE');
    expect(tierStyle('boss')?.label).toBe('BOSS');
    expect(tierStyle(undefined)).toBeNull();
    const b = new Battle(content.battleSetup('random-battle', 1, 'turns', { party: cells({ 0: 'warrior' }), enemies: cells({ 1: 'warrior' }), units: { enemies: { 1: { displayName: 'Bandit Chief', tier: 'elite' } } } }, false));
    const chief = b.combatants.find((c) => c.side === 'enemy')!;
    expect(unitName(chief)).toBe('Bandit Chief');
    expect(chief.tier).toBe('elite');
  });
});
