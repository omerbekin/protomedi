import { describe, expect, it } from 'vitest';
import { Battle, content, describeGlobalSkill, slotOfTileUid, tileUid } from '../src/engine';
import type { BattleEvent, BattleMode } from '../src/engine';
import { isIconKind } from '../src/ui/icon-kinds';

/**
 * Global skill'ler (Rest / Skip Turn / Move Tile): her birim kullanabilir, class'ın 4 skill'inin dışındadır (data/global-skills.json).
 * Hepsi turu bitirir; Skip yalnızca turns modunda; Move yuvaya bağlı her şeyi (ön sıra, aura, yan komşuluk, taunt/guard, çağrı) yeni yuvaya göre günceller.
 */
const G = content.globalSkills;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

/** Hücre listeli savaş; kritik kapalı, isabet tam, kaçınma yok. */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'test', seed = 1): Battle {
  const b = new Battle(content.battleSetup('random-battle', seed, mode, { party: cells(party), enemies: cells(enemies) }, false));
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
  return b;
}

/** Sırası gelene kadar pas (yalnızca turns). */
function until(b: Battle, uid: string): void {
  for (let i = 0; i < 300 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
}

describe('global skill verisi', () => {
  it('rest, skip_turn, move_tile tanımlı; class skill tablosundan (content.skills) ayrı; her class hâlâ tam 4 skill', () => {
    expect(Object.keys(G).sort()).toEqual(['move_tile', 'rest', 'skip_turn']);
    for (const id of Object.keys(G)) expect(content.skills[id], id).toBeUndefined();
    for (const [id, def] of Object.entries(content.classes)) {
      expect(def.skills, id).toHaveLength(4);
      for (const g of Object.keys(G)) expect(def.skills).not.toContain(g);
    }
  });

  it('ad, ikon (geçerli ikon türü), tür ve hedef türü: Move Tile hedefi empty_tile; Skip yalnızca turns modunda', () => {
    for (const [id, d] of Object.entries(G)) {
      expect(d.id).toBe(id);
      expect(d.name.length).toBeGreaterThan(0);
      expect(isIconKind(d.icon), `${id} ikon ${d.icon}`).toBe(true);
    }
    expect(G.move_tile!.target).toBe('empty_tile');
    expect(G.rest!.target).toBe('self');
    expect(G.skip_turn!.turnsOnly).toBe(true);
    expect(G.rest!.mp).toBeGreaterThan(0);
    expect(G.skip_turn!.maxConsecutive).toBeGreaterThanOrEqual(1);
    expect(G.skip_turn!.speedBonus).toBeGreaterThan(0);
    expect((G.skip_turn as unknown as Record<string, unknown>).counterRatio).toBeUndefined();
  });

  it('açıklama skill-info ile veriden üretilir (Rest MP miktarı, Skip üst üste sınırı, Move hedefi)', () => {
    const rest = describeGlobalSkill(G.rest!);
    expect(rest.cost).toBe('Free');
    expect(rest.lines.join(' ')).toContain(`${G.rest!.mp} MP`);
    const skip = describeGlobalSkill(G.skip_turn!);
    expect(skip.lines.join(' ')).toContain(`${G.skip_turn!.maxConsecutive} in a row`);
    expect(skip.lines.join(' ')).toContain(`+${Math.round(G.skip_turn!.speedBonus! * 100)}% speed`);
    expect(skip.summary).toContain('half the time');
    expect(skip.turnsOnly).toBe(true);
    const move = describeGlobalSkill(G.move_tile!);
    expect(move.targetBadge).toBe('Empty Cell');
    expect(move.target).toBe('Empty cell');
  });
});

describe('Rest', () => {
  it('MP kazanır (veriden), maks MP\'yi aşmaz; olaylar globalUsed + mpRegen; turu bitirir (turns)', () => {
    const b = mk({ 0: 'mage', 1: 'warrior' }, { 0: 'archer', 1: 'defender' }, 'turns');
    const actor = b.currentUid!;
    const c = b.get(actor)!;
    c.mp = Math.max(0, c.maxMp - 40);
    const before = b.turnsTaken;
    const r = b.useGlobal(actor, 'rest');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events[0]).toEqual({ type: 'globalUsed', actor, id: 'rest' });
    const regen = ofType(r.events, 'mpRegen')[0]!;
    expect(regen.amount).toBe(G.rest!.mp);
    expect(c.mp).toBe(Math.max(0, c.maxMp - 40) + G.rest!.mp!);
    expect(b.turnsTaken).toBe(before + 1);
    expect(ofType(r.events, 'turnStart').length).toBeGreaterThan(0); // sıra ilerledi
  });

  it('maks MP aşılmaz: eksik 3 ise yalnızca 3 kazanılır; MP doluysa ya da MP\'si olmayan birimde kullanılamaz', () => {
    const b = mk({ 0: 'mage' }, { 0: 'archer' }, 'test');
    const m = b.get('party-0')!;
    m.mp = m.maxMp - 3;
    const r = b.useGlobal('party-0', 'rest');
    expect(r.ok && ofType(r.events, 'mpRegen')[0]!.amount).toBe(3);
    expect(m.mp).toBe(m.maxMp);
    expect(b.canUseGlobal('party-0', 'rest')).toEqual({ ok: false, reason: 'MP is full' });
    const d = mk({ 0: 'druid' }, { 0: 'archer' }, 'test');
    d.useSkill('party-0', 'summon_treant');
    const treant = d.combatants.find((c) => c.summoned)!;
    expect(d.canUseGlobal(treant.uid, 'rest').ok).toBe(false); // çağrının MP'si yok
  });

  it('test modunda da çalışır; sıra dışı birim turns modunda kullanamaz', () => {
    const t = mk({ 0: 'mage' }, { 0: 'archer' }, 'test');
    t.get('party-0')!.mp = 0;
    expect(t.useGlobal('party-0', 'rest').ok).toBe(true);
    expect(t.get('party-0')!.mp).toBe(G.rest!.mp);
    const b = mk({ 0: 'mage', 1: 'warrior' }, { 0: 'archer', 1: 'defender' }, 'turns');
    const other = b.combatants.find((c) => c.uid !== b.currentUid)!;
    other.mp = 0;
    expect(b.canUseGlobal(other.uid, 'rest')).toEqual({ ok: false, reason: "Not this unit's turn" });
  });
});

describe('Skip Turn', () => {
  const TH = content.formulas.turn.threshold;
  /** Birimin sayacının eşiğe kaç tikte ulaşacağı (turn-order ile aynı formül; birimin güncel hızıyla). */
  const ticksToTurn = (b: Battle, uid: string) => {
    const c = b.get(uid)!;
    return Math.ceil((TH - c.turnCounter) / b.speedOf(c));
  };
  /** Aktör yavaş (spd 10), diğerleri hızlı (spd 100): skip sonrası başkalarının araya girmesi garanti (hız stat'ı sıra hesabında canlı okunur). */
  const mkSlow = (seed = 1, party: Record<number, string> = { 0: 'warrior', 1: 'mage' }, enemies: Record<number, string> = { 0: 'archer', 1: 'defender' }) => {
    const b = mk(party, enemies, 'turns', seed);
    const actor = b.currentUid!;
    for (const c of b.combatants) c.stats.spd = c.uid === actor ? 10 : 100;
    return { b, actor };
  };
  /** İlk aktör Skip yapar ya da (karşılaştırma için) Rest yapar; sonra o birim yeniden sıraya gelene kadar araya giren turların sayısı. */
  const interleaved = (skip: boolean) => {
    const { b, actor } = mkSlow(1, { 0: 'warrior', 1: 'mage' }, { 0: 'archer', 1: 'defender', 2: 'warrior' });
    b.get(actor)!.mp = 0;
    b.useGlobal(actor, skip ? 'skip_turn' : 'rest');
    let others = 0;
    while (b.currentUid !== actor && others < 60) {
      others++;
      b.skipTurn();
    }
    return others;
  };

  it('turu geçer: olaylar globalUsed + turnSkipped (voluntary, speedBoost); birim hemen tekrar oynamaz, sayaç normal düşer (doldurma yok)', () => {
    const { b, actor } = mkSlow();
    const before = b.turnsTaken;
    expect(b.get(actor)!.turnCounter).toBeGreaterThanOrEqual(TH);
    const r = b.useGlobal(actor, 'skip_turn');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events[0]).toEqual({ type: 'globalUsed', actor, id: 'skip_turn' });
    expect(ofType(r.events, 'turnSkipped')[0]).toEqual({ type: 'turnSkipped', actor, voluntary: true, speedBoost: G.skip_turn!.speedBonus });
    expect(b.turnsTaken).toBe(before + 1);
    expect(b.currentUid).not.toBe(actor); // eski davranış (sayaç %100, hemen tekrar oynar) kalktı: araya başkası girer
    expect(b.get(actor)!.turnCounter).toBeLessThan(TH);
  });

  it('hız desteği: speedBoostOf = bonus, speedOf = spd x (1 + bonus); sıradaki tur ~yarı sürede gelir (örn. 10 tik yerine 5)', () => {
    const { b, actor } = mkSlow(1, { 0: 'warrior' }, { 0: 'archer' });
    const c = b.get(actor)!;
    const bonus = G.skip_turn!.speedBonus!;
    const baseSpd = b.speedOf(c);
    expect(b.speedBoostOf(actor)).toBe(0);
    b.useGlobal(actor, 'skip_turn');
    expect(b.speedBoostOf(actor)).toBe(bonus);
    expect(b.speedOf(c)).toBe(Math.round(c.stats.spd * (1 + bonus)));
    const boosted = ticksToTurn(b, actor);
    const normal = Math.ceil((TH - c.turnCounter) / baseSpd);
    expect(boosted).toBe(Math.ceil((TH - c.turnCounter) / (baseSpd * (1 + bonus))));
    expect(boosted).toBeLessThan(normal);
    expect(boosted).toBeLessThanOrEqual(Math.ceil(normal / (1 + bonus)) + 1); // ~yarı (yuvarlama payı)
  });

  it('destek sıradaki tur başlayınca biter (yalnızca BİR tur aralığı); sonrası normal hız', () => {
    const { b, actor } = mkSlow();
    b.useGlobal(actor, 'skip_turn');
    expect(b.speedBoostOf(actor)).toBeGreaterThan(0);
    until(b, actor);
    expect(b.speedBoostOf(actor)).toBe(0);
    expect(b.speedOf(b.get(actor)!)).toBe(Math.max(1, Math.round(b.get(actor)!.stats.spd)));
  });

  it('düşman araya girer: skip eden birim hemen oynamaz, en az bir başka birim oynar; yine de skip etmemişe göre erken gelir', () => {
    const withSkip = interleaved(true);
    const without = interleaved(false);
    expect(withSkip).toBeGreaterThanOrEqual(1);
    expect(withSkip).toBeLessThanOrEqual(without);
  });

  it('sıra çubuğu tahmini desteği hesaba katar: skip eden birim kuyrukta hemen değil ama normalden önce yer alır; tahmin gerçek sırayla uyuşur', () => {
    const { b, actor } = mkSlow(4);
    b.useGlobal(actor, 'skip_turn');
    const queue = b.turnQueue(80);
    const idx = queue.indexOf(actor);
    expect(idx).toBeGreaterThan(0);
    // pasla ilerle (skipTurn destek vermez): ilk tahmin edilen sıra gerçek sırayla birebir aynıdır
    const real: string[] = [b.currentUid!];
    for (let i = 0; i < idx; i++) {
      b.skipTurn();
      real.push(b.currentUid!);
    }
    expect(real).toEqual(queue.slice(0, idx + 1));
    expect(real[idx]).toBe(actor);
    // desteksiz (Rest) tahmin: skip'li birim aynı ya da daha erken
    const { b: plain, actor: p0 } = mkSlow(4);
    plain.get(p0)!.mp = 0;
    plain.useGlobal(p0, 'rest');
    expect(idx).toBeLessThanOrEqual(plain.turnQueue(80).indexOf(p0));
  });

  it('Haste/Slow ile toplamsal: speedOf = spd x (durum çarpanı + bonus); durumsuz x2', () => {
    const { b, actor } = mkSlow();
    const c = b.get(actor)!;
    b.useGlobal(actor, 'skip_turn');
    const bonus = G.skip_turn!.speedBonus!;
    const mult = (k: string) => content.statuses[k]!.speedMult!;
    expect(b.speedOf(c)).toBe(Math.max(1, Math.round(c.stats.spd * (1 + bonus))));
    c.statuses = [{ kind: 'haste', turns: 3, source: actor }];
    expect(b.speedOf(c)).toBe(Math.max(1, Math.round(c.stats.spd * (mult('haste') + bonus))));
    c.statuses = [{ kind: 'slow', turns: 3, source: actor }];
    expect(b.speedOf(c)).toBe(Math.max(1, Math.round(c.stats.spd * (mult('slow') + bonus))));
  });

  it('cooldown ve MP yenilenmesi normal işler (birim tekrar sıraya gelince bir azalır)', () => {
    const { b, actor } = mkSlow();
    const c = b.get(actor)!;
    c.cooldowns.whirlwind = 3;
    c.cooldowns.fire_bolt = 3;
    c.mp = 0;
    b.useGlobal(actor, 'skip_turn');
    until(b, actor);
    expect(c.cooldowns.whirlwind ?? c.cooldowns.fire_bolt).toBeLessThan(3); // class'a göre biri tanımlı
    expect(c.mp).toBeGreaterThan(0);
  });

  it('üst üste en çok maxConsecutive kez (veriden); başka bir eylem sayacı sıfırlar; sonsuz skip döngüsü yok', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' }, 'turns');
    const actor = b.currentUid!;
    const max = G.skip_turn!.maxConsecutive!;
    for (let i = 0; i < max; i++) {
      expect(b.canUseGlobal(actor, 'skip_turn').ok, `skip ${i + 1}`).toBe(true);
      expect(b.useGlobal(actor, 'skip_turn').ok).toBe(true);
      until(b, actor);
    }
    expect(b.canUseGlobal(actor, 'skip_turn')).toEqual({ ok: false, reason: 'Cannot skip again' });
    expect(b.useGlobal(actor, 'skip_turn').ok).toBe(false);
    b.get(actor)!.mp = 0;
    expect(b.useGlobal(actor, 'rest').ok).toBe(true);
    until(b, actor);
    expect(b.skipStreakOf(actor)).toBe(0);
    expect(b.canUseGlobal(actor, 'skip_turn').ok).toBe(true);
  });

  it('test modunda anlamsız: kullanılamaz, destek yok', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' }, 'test');
    expect(b.canUseGlobal('party-0', 'skip_turn')).toEqual({ ok: false, reason: 'Only in turn mode' });
    expect(b.useGlobal('party-0', 'skip_turn').ok).toBe(false);
    expect(b.speedBoostOf('party-0')).toBe(0);
    expect(b.turnQueue()).toEqual([]);
  });

  it('bonus veriden: speedBonus 0,5 ise hız x1,5; 0 ise destek yok', () => {
    const mkWith = (bonus: number) => {
      const setup = content.battleSetup('random-battle', 1, 'turns', { party: cells({ 0: 'warrior', 1: 'mage' }), enemies: cells({ 0: 'archer', 1: 'defender' }) }, false);
      setup.globalSkills = { ...setup.globalSkills!, skip_turn: { ...setup.globalSkills!.skip_turn!, speedBonus: bonus } };
      const b = new Battle(setup);
      const actor = b.currentUid!;
      b.useGlobal(actor, 'skip_turn');
      return { b, actor };
    };
    const half = mkWith(0.5);
    expect(half.b.speedBoostOf(half.actor)).toBe(0.5);
    expect(half.b.speedOf(half.b.get(half.actor)!)).toBe(Math.max(1, Math.round(half.b.get(half.actor)!.stats.spd * 1.5)));
    const none = mkWith(0);
    expect(none.b.speedBoostOf(none.actor)).toBe(0);
  });

  it('aynı seed + aynı eylemler: skip içeren olay akışı birebir aynı', () => {
    const run = () => {
      const b = mk({ 0: 'warrior', 1: 'mage', 3: 'archer' }, { 0: 'defender', 1: 'paladin' }, 'turns', 9);
      for (let i = 0; i < 30 && !b.winner; i++) {
        const u = b.currentUid!;
        b.applyChoice(u, b.canUseGlobal(u, 'skip_turn').ok ? { skillId: 'skip_turn' } : null);
      }
      return JSON.stringify(b.log);
    };
    expect(run()).toBe(run());
  });
});

describe('Rest ve çağrılar: kilitlenen davranışlar', () => {
  it('Rest, MP doluyken kapalı kalır (turns modunda da)', () => {
    const b = mk({ 0: 'mage', 1: 'warrior' }, { 0: 'archer', 1: 'defender' }, 'turns');
    const actor = b.currentUid!;
    const c = b.get(actor)!;
    c.mp = c.maxMp;
    expect(b.canUseGlobal(actor, 'rest')).toEqual({ ok: false, reason: 'MP is full' });
    expect(b.listActions(actor).find((a) => a.id === 'rest')).toMatchObject({ ok: false, reason: 'MP is full' });
  });

  it('çağrılan birimler hiçbir global skill kullanamaz (Rest, Skip Turn, Move); legalActions içinde de yok', () => {
    const b = mk({ 0: 'druid', 1: 'warrior' }, { 0: 'archer' }, 'test');
    b.useSkill('party-0', 'summon_treant');
    const treant = b.combatants.find((c) => c.summoned && c.side === 'party')!;
    expect(treant).toBeDefined();
    treant.mp = 0;
    for (const id of Object.keys(G)) expect(b.canUseGlobal(treant.uid, id).ok, id).toBe(false);
    expect(b.legalActions(treant.uid).some((a) => a.kind === 'global')).toBe(false);
    expect(b.useGlobal(treant.uid, 'move_tile', 11).ok).toBe(false);
  });
});

describe('Move Tile', () => {
  it('kendi tarafındaki boş yuvaya geçer: olaylar globalUsed + moved {from, to}; yuva güncellenir; turns modunda turu bitirir', () => {
    const b = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage', 1: 'defender' }, 'test');
    const r = b.useGlobal('party-1', 'move_tile', 7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events[0]).toEqual({ type: 'globalUsed', actor: 'party-1', id: 'move_tile' });
    expect(ofType(r.events, 'moved')).toEqual([{ type: 'moved', actor: 'party-1', from: 3, to: 7 }]);
    expect(b.get('party-1')!.slot).toBe(7);
    expect(b.freeTiles('party-1')).toContain(3);
    expect(b.freeTiles('party-1')).not.toContain(7);

    const t = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage' }, 'turns');
    const actor = t.currentUid!;
    const free = t.freeTiles(actor);
    const before = t.turnsTaken;
    expect(t.useGlobal(actor, 'move_tile', free[free.length - 1]!).ok).toBe(true);
    expect(t.turnsTaken).toBe(before + 1);
  });

  it('geçersiz yuva reddedilir: dolu, aralık dışı, tam sayı değil, yuva seçilmemiş; düşman tahtasına sızmış birim hareket edemez', () => {
    const b = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage' }, 'test');
    expect(b.canUseGlobal('party-1', 'move_tile', 0)).toEqual({ ok: false, reason: 'Invalid cell' }); // dolu
    expect(b.canUseGlobal('party-1', 'move_tile', 3)).toEqual({ ok: false, reason: 'Invalid cell' }); // kendi yuvası dolu sayılır
    expect(b.canUseGlobal('party-1', 'move_tile', 12).ok).toBe(false);
    expect(b.canUseGlobal('party-1', 'move_tile', -1).ok).toBe(false);
    expect(b.canUseGlobal('party-1', 'move_tile', 1.5).ok).toBe(false);
    expect(b.useGlobal('party-1', 'move_tile')).toEqual({ ok: false, reason: 'Pick an empty cell' });
    expect(b.get('party-1')!.slot).toBe(3);
    // Raise Dead iskeleti düşman tahtasına çağrılır: orada hareket yok
    const u = mk({ 0: 'undead' }, { 0: 'warrior' }, 'test');
    u.get('party-0')!.mp = 1000;
    expect(u.useSkill('party-0', 'raise_dead', undefined, 4).ok).toBe(true);
    const skeleton = u.combatants.find((c) => c.summoned && c.board !== c.side)!;
    expect(skeleton).toBeDefined();
    expect(u.canUseGlobal(skeleton.uid, 'move_tile').ok).toBe(false); // çağrı + düşman tahtası: hareket yok
  });

  it('ölü dostun yuvasına geçiş YASAK: freeTiles içermez, fallenSlots (UI için) ayrı verir; hata mesajı; diriltme korunur', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin', 3: 'archer' }, { 0: 'mage' }, 'test');
    b.debugKill('party-0', false);
    expect(b.fallenSlots('party')).toEqual([0]);
    expect(b.freeTiles('party-2')).not.toContain(0);
    expect(b.freeTiles('party-2')).toContain(2); // gerçekten boş hücreler duruyor
    expect(b.freeSlots('party')).toContain(0); // çağrı yerleşimi kuralı değişmedi
    const reason = 'That cell is reserved for a fallen ally';
    expect(b.canUseGlobal('party-2', 'move_tile', 0)).toEqual({ ok: false, reason });
    expect(b.useGlobal('party-2', 'move_tile', 0)).toEqual({ ok: false, reason });
    expect(b.act('party-2', { kind: 'global', id: 'move_tile', slot: 0 })).toEqual({ ok: false, reason });
    expect(b.useSkill('party-2', 'move_tile', tileUid(0))).toEqual({ ok: false, reason });
    expect(b.get('party-2')!.slot).toBe(3);
    expect(b.listActions('party-2').find((a) => a.id === 'move_tile')!.slots).not.toContain(0);
    expect(b.validTargets('party-1', 'resurrection').map((c) => c.uid)).toEqual(['party-0']); // diriltilebilir kalır
  });

  it('tüm boş yuvalar ölü dost yuvasıysa Move "No empty cell" verir', () => {
    const b = mk({ 0: 'warrior', 1: 'paladin' }, { 0: 'mage' }, 'test');
    const all: Record<number, string> = {};
    for (let i = 0; i < 12; i++) all[i] = i === 0 ? 'warrior' : i === 1 ? 'paladin' : 'archer';
    const f = mk(all, { 0: 'mage' }, 'test');
    for (let i = 2; i < 12; i++) f.debugKill(`party-${i}`, false);
    expect(f.freeTiles('party-0')).toEqual([]);
    expect(f.canUseGlobal('party-0', 'move_tile')).toEqual({ ok: false, reason: 'No empty cell' });
    expect(b.freeTiles('party-0').length).toBeGreaterThan(0);
  });

  it('yakın dövüş ön sıra kuralı yeni yuvaya göre: geri çekilen yakın dövüşçü melee yapamaz, öne dönünce yapar', () => {
    const b = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'defender' }, 'test');
    expect(b.canUse('party-0', 'melee_attack').ok).toBe(true);
    expect(b.useGlobal('party-0', 'move_tile', 9).ok).toBe(true); // arka sıra
    expect(b.canUse('party-0', 'melee_attack')).toEqual({ ok: false, reason: 'Melee: front row only' });
    expect(b.canMeleeFrom('party-0', 0)).toBe(true);
    expect(b.useGlobal('party-0', 'move_tile', 0).ok).toBe(true);
    expect(b.canUse('party-0', 'melee_attack').ok).toBe(true);
  });

  it('düşmanın yakın dövüşü sıra sıralamasına göre: öndeki geri çekilince arkadaki hedeflenebilir olur', () => {
    const b = mk({ 0: 'paladin', 3: 'archer' }, { 0: 'warrior' }, 'test');
    expect(b.validTargets('enemy-0', 'melee_attack').map((c) => c.uid)).toEqual(['party-0']);
    expect(b.useGlobal('party-0', 'move_tile', 9).ok).toBe(true);
    expect(b.validTargets('enemy-0', 'melee_attack').map((c) => c.uid)).toEqual(['party-1']);
    expect(b.rowRank('party-0')).toBe(1);
    expect(b.rowRank('party-1')).toBe(0);
  });

  it('zırh aurası yeni komşuluğa göre: Defender taşındıkça aura bitişik dostlara geçer / kesilir', () => {
    const b = mk({ 0: 'defender', 1: 'mage', 6: 'archer' }, { 0: 'warrior' }, 'test');
    const mage = b.get('party-1')!;
    const archer = b.get('party-2')!;
    expect(b.auraArmor(mage)).toBeGreaterThan(0); // aynı sırada bitişik
    expect(b.auraArmor(archer)).toBe(0); // 2 sıra geride
    expect(b.useGlobal('party-0', 'move_tile', 3).ok).toBe(true); // Defender bir sıra geriye: mage artık çapraz, bitişik değil
    expect(b.auraArmor(mage)).toBe(0);
    expect(b.useGlobal('party-0', 'move_tile', 7).ok).toBe(true); // Archer'ın (6) şerit komşusu: artık aura alıyor
    expect(b.auraArmor(archer)).toBeGreaterThan(0);
  });

  it('yan komşuluk (Bone Slash yan vuruşu) yeni yuvaya göre: aynı sıradaki komşu ayrılınca yan vuruş azalır', () => {
    const b = mk({ 0: 'undead' }, { 0: 'warrior', 1: 'mage', 2: 'archer' }, 'test');
    const mage = b.get('enemy-1')!;
    expect(b.splashTargets('skeleton_slash', mage).map((c) => c.uid).sort()).toEqual(['enemy-0', 'enemy-2']);
    expect(b.useGlobal('enemy-0', 'move_tile', 3).ok).toBe(true); // Warrior başka sıraya geçti
    expect(b.splashTargets('skeleton_slash', mage).map((c) => c.uid)).toEqual(['enemy-2']);
  });

  it('taunt ve guard birime bağlı kalır: taşınan taunt\'lı birim hâlâ zorunlu hedef', () => {
    const b = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'defender', 1: 'archer' }, 'test');
    b.useSkill('enemy-0', 'taunt');
    expect(b.validTargets('party-0', 'melee_attack').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(b.useGlobal('enemy-0', 'move_tile', 3).ok).toBe(true);
    expect(b.get('enemy-0')!.statuses.some((s) => s.kind === 'taunt')).toBe(true);
    expect(b.validTargets('party-1', 'fire_bolt').map((c) => c.uid)).toEqual(['enemy-0']);
  });

  it('çağrı yerleşimi: taşınan birimin eski yuvası çağrı için boş sayılır, yeni yuvası dolu', () => {
    const b = mk({ 0: 'druid', 1: 'warrior' }, { 0: 'archer' }, 'test');
    expect(b.freeSlots('party')).not.toContain(0);
    expect(b.useGlobal('party-0', 'move_tile', 11).ok).toBe(true);
    expect(b.freeSlots('party')).toContain(0);
    expect(b.freeSlots('party')).not.toContain(11);
    expect(b.useSkill('party-0', 'summon_treant', undefined, 0).ok).toBe(true);
    expect(b.combatants.find((c) => c.summoned)!.slot).toBe(0);
  });

  it('sıra (tahmin) hesabı yeni yuvayı kullanır: eşit sayaçta düşük yuva önce (turnSlots)', () => {
    const a = mk({ 0: 'warrior', 1: 'mage' }, { 0: 'archer' }, 'turns', 3);
    const first = a.currentUid!;
    const queueBefore = a.turnQueue();
    expect(queueBefore[0]).toBe(first);
    const mover = a.get(first)!;
    const free = a.freeTiles(first);
    expect(a.useGlobal(first, 'move_tile', free[free.length - 1]!).ok).toBe(true);
    expect(mover.slot).toBe(free[free.length - 1]);
    expect(a.turnQueue()).toHaveLength(content.formulas.turn.queueLength); // kuyruk yeniden hesaplanır, bozulmaz
  });
});

describe('global skill API: act, listActions, legalActions, applyChoice', () => {
  it('listActions: 4 class skill\'i + 3 global skill; kullanılamayanın nedeni; Move için boş yuvalar; legalActions yalnızca kullanılabilirler', () => {
    const b = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage' }, 'test');
    b.get('party-0')!.mp = 0;
    const list = b.listActions('party-0');
    expect(list.filter((a) => a.kind === 'skill').map((a) => a.id)).toEqual(content.classes.warrior!.skills);
    expect(list.filter((a) => a.kind === 'global').map((a) => a.id).sort()).toEqual(['move_tile', 'rest', 'skip_turn']);
    expect(list.find((a) => a.id === 'whirlwind')).toMatchObject({ ok: false, reason: 'Not enough MP' });
    expect(list.find((a) => a.id === 'skip_turn')).toMatchObject({ ok: false, reason: 'Only in turn mode' });
    expect(list.find((a) => a.id === 'rest')).toMatchObject({ ok: true });
    expect(list.find((a) => a.id === 'move_tile')!.slots).toEqual(b.freeTiles('party-0'));
    expect(b.legalActions('party-0').every((a) => a.ok)).toBe(true);
    expect(b.legalActions('party-0').map((a) => a.id)).toContain('rest');
    const turns = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage' }, 'turns');
    expect(turns.legalActions(turns.currentUid!).map((a) => a.id)).toContain('skip_turn');
  });

  it('act({kind:global}) ve useSkill(global id) aynı sonucu verir; applyChoice global seçimi uygular; null seçim = pas', () => {
    const fresh = () => {
      const b = mk({ 0: 'mage' }, { 0: 'archer' }, 'test');
      b.get('party-0')!.mp = 10;
      return b;
    };
    const a = fresh();
    const b2 = fresh();
    const c = fresh();
    const ra = a.act('party-0', { kind: 'global', id: 'rest' });
    const rb = b2.useSkill('party-0', 'rest');
    const rc = c.applyChoice('party-0', { skillId: 'rest' });
    expect(ra.ok && rb.ok && rc.ok).toBe(true);
    expect(a.get('party-0')!.mp).toBe(10 + G.rest!.mp!);
    expect(b2.get('party-0')!.mp).toBe(a.get('party-0')!.mp);
    expect(c.get('party-0')!.mp).toBe(a.get('party-0')!.mp);
    const mv = mk({ 0: 'mage' }, { 0: 'archer' }, 'test');
    expect(mv.applyChoice('party-0', { skillId: 'move_tile', slot: 5 }).ok).toBe(true);
    expect(mv.get('party-0')!.slot).toBe(5);
    expect(mv.act('party-0', { kind: 'skill', skillId: 'fire_bolt', targetUid: 'enemy-0' }).ok).toBe(true);
    const turns = mk({ 0: 'mage' }, { 0: 'archer' }, 'turns');
    const n = turns.turnsTaken;
    expect(turns.applyChoice(turns.currentUid!, null).ok).toBe(true);
    expect(turns.turnsTaken).toBe(n + 1);
  });

  it('boş yuva kimliği tile:<yuva>: slot yerine targetUid olarak da kabul edilir (eski kod yolları: useSkill(actor, id, targetUid))', () => {
    expect(tileUid(7)).toBe('tile:7');
    expect(slotOfTileUid('tile:7')).toBe(7);
    expect(slotOfTileUid('party-0')).toBeUndefined();
    const b = mk({ 0: 'warrior', 3: 'archer' }, { 0: 'mage' }, 'test');
    expect(b.useSkill('party-1', 'move_tile', tileUid(8)).ok).toBe(true);
    expect(b.get('party-1')!.slot).toBe(8);
    expect(b.act('party-1', { kind: 'global', id: 'move_tile', targetUid: tileUid(9) }).ok).toBe(true);
    expect(b.get('party-1')!.slot).toBe(9);
    expect(b.useSkill('party-1', 'move_tile', 'party-0').ok).toBe(false);
  });

  it('bilinmeyen global id ve ölü birim reddedilir; savaş bitince kullanılamaz', () => {
    const b = mk({ 0: 'warrior' }, { 0: 'archer' }, 'test');
    expect(b.canUseGlobal('party-0', 'dance')).toEqual({ ok: false, reason: 'Unknown action' });
    b.debugKill('enemy-0'); // savaş biter
    expect(b.winner).toBe('party');
    expect(b.canUseGlobal('party-0', 'rest')).toEqual({ ok: false, reason: 'Battle is over' });
  });

  it('aynı seed + aynı eylemler: olay akışı birebir aynı (global skill\'ler dahil)', () => {
    const run = () => {
      const b = mk({ 0: 'warrior', 1: 'mage', 3: 'archer' }, { 0: 'defender', 1: 'paladin' }, 'turns', 5);
      for (let i = 0; i < 24 && !b.winner; i++) {
        const u = b.currentUid!;
        const actions = b.legalActions(u);
        const globals = actions.filter((a) => a.kind === 'global');
        const g = globals[i % globals.length]!;
        b.applyChoice(u, g.id === 'move_tile' ? { skillId: g.id, slot: g.slots![0]! } : { skillId: g.id });
      }
      return JSON.stringify(b.log);
    };
    expect(run()).toBe(run());
  });
});
