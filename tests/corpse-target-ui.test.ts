import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { Battle, content, previewSkill } from '../src/engine';
import type { BattleEvent } from '../src/engine';
import { cellKey, corpseMarkPos, corpseTip, empoweredLine, summonPreviewLine, visibleCorpseMarks } from '../src/game/corpse-marks';
import { cellCenter } from '../src/game/shape-geometry';
import { isDeltaStat, previewStatusText, statDir, statSources } from '../src/game/stat-delta';
import { areaBoards, areaHoverSpecs, areaTone, blockedTargets } from '../src/game/target-cells';
import { stageMap } from '../src/game/cell-style';
import { miniGridText, rectExampleAxis, shapeMiniGrid, skillMiniGrid } from '../src/ui/shape-diagram';
import { shapeCells } from '../src/engine/area-shape';

// Ceset işaretleri, area_any iki tahta hedefleme, Backstab geçersiz hedefler, mini şema (X x2, area_any notu, ortalı rect), stat okları (madde 222/225/226 arayüzü).
const F = content.formulas.formation;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
const eventsOf = (r: { ok: boolean; events?: BattleEvent[] }): BattleEvent[] => (r.ok && r.events ? r.events : []);

// party-0 Cutthroat(0), party-1 Undead(3), party-2 Paladin(4); enemy: Warrior(0), Defender(1), Mage(4), Archer(9)
function mk(): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat', 3: 'undead', 4: 'paladin' }), enemies: cells({ 0: 'warrior', 1: 'defender', 4: 'mage', 9: 'archer' }) }, false));
  b.freeMp = true;
  return b;
}

describe('ceset işaretleri: hangi ceset işaret taşır', () => {
  it('yalnızca diriltilebilir ceset işaretlenir; tüketilmiş ceset işaretsiz (yuva boş görünür)', () => {
    const b = mk();
    b.debugKill('enemy-0', false);
    b.debugKill('enemy-1', false);
    expect(visibleCorpseMarks(b.corpses('enemy')).map((c) => c.uid)).toEqual(['enemy-0', 'enemy-1']);
    const r = b.useSkill('party-1', 'raise_dead', undefined, undefined, undefined, 'enemy-1');
    expect(r.ok).toBe(true);
    const eaten = ofType(eventsOf(r), 'corpseConsumed')[0]!;
    expect(eaten.uid).toBe('enemy-1'); // oyuncunun seçtiği ceset (madde 230)
    expect(visibleCorpseMarks(b.corpses('enemy')).map((c) => c.uid)).toEqual(['enemy-0']);
  });

  it('çağrı ceset bırakmaz; canlı çağrı duran hücrede ceset işareti gizlenir, çağrı gidince geri gelir', () => {
    const b = mk();
    b.debugKill('party-2', false);
    const corpse = b.corpses('party');
    expect(visibleCorpseMarks(corpse).map((c) => c.uid)).toEqual(['party-2']);
    const occupied = new Set([cellKey('party', corpse[0]!.slot)]);
    expect(visibleCorpseMarks(corpse, occupied)).toEqual([]);
    expect(visibleCorpseMarks(corpse, new Set())).toHaveLength(1);
    const sk = ofType(eventsOf(b.useSkill('party-1', 'raise_dead')), 'summon')[0]!.combatant.uid;
    b.debugKill(sk, false);
    expect(b.corpseOf(sk)).toBeNull(); // çağrı ceset bırakmaz
  });

  it('dirilen birimin cesedi kalkar; Paladin tüketilmiş cesedi hedef listesinde görmez, tüketilmemişi görür', () => {
    const b = mk();
    b.debugKill('party-0', false);
    b.debugKill('party-1', false);
    expect(visibleCorpseMarks(b.corpses('party'))).toHaveLength(2);
    expect(b.validTargets('party-2', 'resurrection').map((c) => c.uid).sort()).toEqual(['party-0', 'party-1']);
    expect(b.useSkill('party-2', 'resurrection', 'party-0').ok).toBe(true);
    expect(visibleCorpseMarks(b.corpses('party')).map((c) => c.uid)).toEqual(['party-1']);
    expect(b.corpseOf('party-0')).toBeNull();
  });

  it('tüketilmiş cesedi Paladin diriltemez ve listede yok (motor)', () => {
    // düşman Paladin + oyuncu Undead: Undead düşman cesedini yer, düşman Paladin onu diriltemez
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior', 3: 'undead' }), enemies: cells({ 0: 'warrior', 3: 'paladin', 4: 'mage' }) }, false));
    b.freeMp = true;
    b.debugKill('enemy-0', false);
    expect(b.validTargets('enemy-1', 'resurrection').map((c) => c.uid)).toEqual(['enemy-0']);
    expect(b.useSkill('party-1', 'raise_dead', undefined, undefined, undefined, 'enemy-0').ok).toBe(true);
    expect(b.validTargets('enemy-1', 'resurrection')).toEqual([]);
    expect(b.reviveBlockReason('enemy-1', 'enemy-0')).toBe('Corpse was consumed');
    expect(visibleCorpseMarks(b.corpses('enemy'))).toEqual([]);
  });

  it('işaret konumu hücrenin zemin merkezi (iki tahtada)', () => {
    for (const slots of [layout.enemySlots, layout.partySlots]) {
      for (let s = 0; s < slots.length; s++) expect(corpseMarkPos(slots, s)).toEqual(cellCenter(slots, s));
    }
  });
});

describe('ceset ve çağrı tooltip metinleri', () => {
  it("'Fallen: <ad> (can be revived)'; tüketilmiş: nedeni (reviveBlockReason) yazar", () => {
    expect(corpseTip('Warrior', 'revivable', false, null).title).toBe('Fallen: Warrior (can be revived)');
    expect(corpseTip('Warrior', 'revivable', true, null).rows[0]).toEqual({ text: 'Click to revive', tone: 'good' });
    const eaten = corpseTip('Warrior', 'consumed', true, 'Corpse was consumed');
    expect(eaten.title).toContain('corpse consumed');
    expect(eaten.rows[0]).toEqual({ text: 'Corpse was consumed', tone: 'bad' });
  });

  it("Raise Dead önizleme satırı: ceset varsa 'Consumes <ad>'s corpse: empowered Skeleton (HP N)', yoksa 'No corpse: unfed Skeleton (HP N)'", () => {
    const b = mk();
    const none = b.summonPreview('party-1', 'raise_dead');
    const noneLine = summonPreviewLine(none, null)!;
    expect(noneLine.tone).toBe('unfed');
    expect(noneLine.text).toBe(`No corpse: unfed Skeleton (HP ${none.unit!.stats.hp})`);
    b.debugKill('enemy-1', false);
    const sp = b.summonPreview('party-1', 'raise_dead');
    expect(sp.corpse?.uid).toBe('enemy-1');
    const fed = summonPreviewLine(sp, b.get('enemy-1')!.name)!;
    expect(fed.tone).toBe('empowered');
    expect(fed.text).toBe(`Consumes Defender's corpse: empowered Skeleton (HP ${sp.unit!.stats.hp})`);
    expect(sp.unit!.stats.hp).toBeGreaterThan(none.unit!.stats.hp);
    expect(summonPreviewLine(b.summonPreview('party-0', 'venom_edge'), null)).toBeNull(); // ceset tüketmeyen skill
  });

  it('beslenmiş / beslenmemiş Skeleton satırı birim bilgisinde', () => {
    expect(empoweredLine(true)).toEqual({ text: 'Empowered (fed on a corpse)', tone: 'empowered' });
    expect(empoweredLine(false)).toEqual({ text: 'Unfed', tone: 'unfed' });
    expect(empoweredLine(undefined)).toBeNull();
    const b = mk();
    b.debugKill('enemy-1', false);
    const sk = ofType(eventsOf(b.useSkill('party-1', 'raise_dead', undefined, undefined, undefined, 'enemy-1')), 'summon')[0]!.combatant;
    expect(sk.empowered).toBe(true);
    const c = mk();
    const sk2 = ofType(eventsOf(c.useSkill('party-1', 'raise_dead')), 'summon')[0]!.combatant;
    expect(sk2.empowered).toBe(false);
    expect(sk.maxHp).toBeGreaterThan(sk2.maxHp);
  });
});

describe('area_any (Smoke Bomb): iki tahtada hücre seçimi', () => {
  it('iki tahta listelenir: karşı tahta enemy tonu, kendi tahta ally tonu; anchor listesi motorun shapeAnchorCells listesiyle aynı', () => {
    const b = mk();
    const boards = areaBoards(b, 'party-0', 'smoke_bomb');
    expect(boards.map((g) => g.board)).toEqual(['enemy', 'party']);
    expect(boards.map((g) => g.tone)).toEqual(['enemy', 'ally']);
    for (const g of boards) expect(g.anchors.length).toBeGreaterThan(0);
    expect(areaTone(b, 'party-0', 'smoke_bomb', 'enemy')).toBe('enemy');
    expect(areaTone(b, 'party-0', 'smoke_bomb', 'party')).toBe('ally');
    const all = b.shapeAnchorCells('party-0', 'smoke_bomb');
    expect(boards.flatMap((g) => g.anchors.map((slot) => `${g.board}:${slot}`)).sort()).toEqual(all.map((c) => `${c.board}:${c.slot}`).sort());
  });

  it('düşman Cutthroat oynarsa tahtalar ters', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior', 4: 'mage' }), enemies: cells({ 0: 'cutthroat', 3: 'archer' }) }, false));
    b.freeMp = true;
    const boards = areaBoards(b, 'enemy-0', 'smoke_bomb');
    expect(boards.map((g) => g.board)).toEqual(['party', 'enemy']);
    expect(boards.map((g) => g.tone)).toEqual(['enemy', 'ally']);
  });

  it("diğer alan skill'lerinde tek tahta ve altın (neutral) ton; alan olmayan skill için boş", () => {
    const b = mk();
    const one = areaBoards(b, 'party-0', 'x_cut');
    expect(one.map((g) => g.board)).toEqual(['enemy']);
    expect(one[0]!.tone).toBe('neutral');
    expect(areaBoards(b, 'party-0', 'venom_edge')).toEqual([]);
  });

  it('hover plakaları: kapsanan hücreler affected, imleç hücresi anchor (ton korunur); atılamıyorsa hepsi invalid; aşama numaraları', () => {
    const b = mk();
    for (const board of ['enemy', 'party'] as const) {
      const anchor = b.shapeAnchors('party-0', 'smoke_bomb', board)[0]!;
      const info = b.shapePreviewCells('party-0', 'smoke_bomb', anchor, board);
      expect(info.valid).toBe(true);
      const specs = areaHoverSpecs(info, anchor, areaTone(b, 'party-0', 'smoke_bomb', board));
      expect(specs.map((s) => s.slot).sort()).toEqual([...info.cells].sort());
      expect(specs.filter((s) => s.state === 'anchor').map((s) => s.slot)).toEqual([anchor]);
      expect(specs.every((s) => s.tone === (board === 'enemy' ? 'enemy' : 'ally'))).toBe(true);
      expect([...info.cells].sort()).toEqual(shapeCells(content.skills.smoke_bomb!.area!, anchor, board, F).sort());
    }
    const inv = areaHoverSpecs({ cells: [10, 11], valid: false }, 11, 'ally');
    expect(inv.every((s) => s.state === 'invalid')).toBe(true);
    const staged = areaHoverSpecs({ cells: [1, 2], valid: true }, 1, 'neutral', stageMap([[1], [2]]));
    expect(staged.map((s) => s.stage)).toEqual([1, 2]);
  });

  it('boş hücre anchor olabilir; hedefsiz hücre geçersiz ve neden yazar (kendi tahta: No ally in the area)', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat' }), enemies: cells({ 0: 'warrior' }) }, false));
    b.freeMp = true;
    const empty = b.shapePreviewCells('party-0', 'smoke_bomb', 11, 'party');
    expect(empty.valid).toBe(false);
    expect(empty.reason).toBe('No ally in the area');
    expect(b.shapePreviewCells('party-0', 'smoke_bomb', 11, 'enemy').reason).toBe('No enemy in the area');
  });

  it('iki tahtada da gerçek cast: düşman tahtasında Blinded, kendi tahtada Shrouded; olayın board alanı (önizleme = gerçek hedefler)', () => {
    const b = mk();
    const foeAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'enemy')[0]!;
    const foeInfo = b.shapePreviewCells('party-0', 'smoke_bomb', foeAnchor, 'enemy');
    const r = b.useSkill('party-0', 'smoke_bomb', undefined, foeAnchor, 'enemy');
    expect(r.ok).toBe(true);
    expect(ofType(eventsOf(r), 'skillUsed')[0]!.board).toBe('enemy');
    expect(foeInfo.targets.every((uid) => b.get(uid)!.statuses.some((s) => s.kind === 'blinded'))).toBe(true);
    const ownAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'party')[0]!;
    const ownInfo = b.shapePreviewCells('party-0', 'smoke_bomb', ownAnchor, 'party');
    const r2 = b.useSkill('party-0', 'smoke_bomb', undefined, ownAnchor, 'party');
    expect(r2.ok).toBe(true);
    expect(ofType(eventsOf(r2), 'skillUsed')[0]!.board).toBe('party');
    expect(ownInfo.targets.every((uid) => b.get(uid)!.statuses.some((s) => s.kind === 'shrouded'))).toBe(true);
  });
});

describe('Backstab: geçersiz hedefler ve nedenleri', () => {
  it('en arka sıradaki ve arkası dolu hedefler engelli; neden motorun metni; geçerli hedef listede yok', () => {
    // enemy: Warrior(0, arkası Defender), Defender(3), Mage(4), Archer(9: en arka sıra)
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat' }), enemies: cells({ 0: 'warrior', 3: 'defender', 4: 'mage', 9: 'archer' }) }, false));
    b.freeMp = true;
    const valid = b.validTargets('party-0', 'backstab').map((c) => c.slot);
    const blocked = blockedTargets(b, 'party-0', 'backstab');
    const reasonOf = (slot: number) => blocked.find((x) => x.slot === slot)?.reason;
    expect(reasonOf(0)).toBe('Target is shielded from behind');
    expect(reasonOf(9)).toBe('No room behind the target');
    for (const slot of valid) expect(reasonOf(slot)).toBeUndefined();
    expect(blocked.length + valid.length).toBe(b.living('enemy').length);
    expect(valid).toEqual(expect.arrayContaining([3, 4]));
  });

  it('hiç hedef yoksa skill kullanılamaz ve neden yazar (düğme soluk + tooltip)', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat' }), enemies: cells({ 9: 'archer', 10: 'mage' }) }, false));
    b.freeMp = true;
    const can = b.canUse('party-0', 'backstab');
    expect(can.ok).toBe(false);
    if (!can.ok) expect(can.reason).toBe('No target with room behind it');
    expect(blockedTargets(b, 'party-0', 'backstab').every((x) => x.reason === 'No room behind the target')).toBe(true);
  });

  it('menzil: melee ile arkadaki düşman engelli ve neden Out of reach; alan skill için boş', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'cutthroat' }), enemies: cells({ 0: 'warrior', 6: 'mage' }) }, false));
    const blocked = blockedTargets(b, 'party-0', 'venom_edge');
    expect(blocked.map((x) => [x.slot, x.reason])).toEqual([[6, 'Out of reach']]);
    expect(blockedTargets(b, 'party-0', 'x_cut')).toEqual([]);
  });
});

describe('mini şema: X çift vuruş, area_any notu, ortalı rect', () => {
  it("Saltire Cut (X): merkez 'x2' işaretli ve metin gösteriminde 'X'", () => {
    const grid = skillMiniGrid(content.skills.x_cut!, F)!;
    expect(miniGridText(grid)).toEqual(['#.#.', '.X..', '#.#.']);
    const center = grid.cells.find((c) => c.anchor)!;
    expect(center.hits).toBe(content.skills.x_cut!.area!.hitsAtCenter);
    expect(grid.cells.filter((c) => c.hits).length).toBe(1);
    expect(grid.note).toBeUndefined();
  });

  it('merkezi tek vuruşlu şekillerde hits yok', () => {
    expect(shapeMiniGrid({ shape: 'plus' }, F)!.cells.every((c) => c.hits === undefined)).toBe(true);
  });

  it("Smoke Bomb (area_any): şema 2x2 + 'either side' notu; area_enemies skill'inde not yok", () => {
    const grid = skillMiniGrid(content.skills.smoke_bomb!, F)!;
    expect(grid.note).toBe('either side');
    expect(grid.cells.filter((c) => c.on)).toHaveLength(4);
    expect(skillMiniGrid(content.skills.blizzard!, F)!.note).toBeUndefined();
  });

  it('rect örnek anchor: 3 ve üstü eksende anchor alanın ORTASINDA, 1-2 boyutta sol-alt köşe (madde 226)', () => {
    for (let R = 1; R <= F.rows; R++) {
      for (let C = 1; C <= F.lanes; C++) {
        const m = shapeMiniGrid({ shape: 'rect', rows: R, cols: C }, F)!;
        const on = m.cells.filter((c) => c.on);
        const a = m.cells.find((c) => c.anchor)!;
        expect(a.on, `${R}x${C}`).toBe(true);
        expect(on, `${R}x${C}`).toHaveLength(R * C);
        const colMin = Math.min(...on.map((c) => c.col));
        const rowMin = Math.min(...on.map((c) => c.row));
        const rowMax = Math.max(...on.map((c) => c.row));
        // sıra ekseni (ekranda yatay): 3+ ise ortada (4'te orta-sol), değilse alanın en solu
        if (R >= 3) expect(a.col - colMin, `${R}x${C} yatay`).toBe(Math.floor((R - 1) / 2));
        else expect(a.col, `${R}x${C} yatay`).toBe(colMin);
        // şerit ekseni (ekranda dikey): 3+ ise ortada, değilse alanın en altı
        if (C >= 3) expect(a.row - rowMin, `${R}x${C} dikey`).toBe(Math.floor((C - 1) / 2));
        else expect(a.row, `${R}x${C} dikey`).toBe(rowMax);
      }
    }
    expect(rectExampleAxis(3, 4, 'low')).toBe(1);
    expect(rectExampleAxis(4, 4, 'low')).toBe(1);
    expect(rectExampleAxis(3, 3, 'high')).toBe(1);
    expect(rectExampleAxis(2, 3, 'high')).toBe(2);
    expect(rectExampleAxis(1, 4, 'low')).toBe(1);
  });

  it("Arrow Rain 3x3 şeması merkezli anchor çizer (migrasyon tablosu skill'i)", () => {
    const a = skillMiniGrid(content.skills.arrow_rain!, F)!.cells.find((c) => c.anchor)!;
    expect(a.col).toBe(1);
    expect(a.row).toBe(1);
  });
});

describe('stat okları: Blinded / Shrouded (effectiveStats)', () => {
  it('yön: azalan down, artan up, değişmeyen null', () => {
    expect(statDir(0.7, 0.4)).toBe('down');
    expect(statDir(0.05, 0.25)).toBe('up');
    expect(statDir(0.7, 0.7)).toBeNull();
    expect(statDir(0.7, 0.7001)).toBeNull();
    expect(isDeltaStat('accuracy')).toBe(true);
    expect(isDeltaStat('armor')).toBe(false);
  });

  it("Blinded hedefte ACC düşer, kaynak satırı 'Blinded -30%'; Shrouded dostta EVA artar, 'Shrouded +20%'", () => {
    const b = mk();
    const foe = b.get('enemy-0')!;
    const own = b.get('party-0')!;
    const foeAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'enemy').find((s) => b.shapePreviewCells('party-0', 'smoke_bomb', s, 'enemy').targets.includes('enemy-0'))!;
    expect(b.useSkill('party-0', 'smoke_bomb', undefined, foeAnchor, 'enemy').ok).toBe(true);
    expect(statDir(foe.stats.accuracy, b.effectiveStats(foe).accuracy)).toBe('down');
    expect(statDir(foe.stats.evasion, b.effectiveStats(foe).evasion)).toBeNull();
    expect(statSources(foe.statuses, content.statuses, 'accuracy')).toEqual([{ text: 'Blinded -30%', dir: 'down' }]);
    expect(statSources(foe.statuses, content.statuses, 'evasion')).toEqual([]);
    const ownAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'party').find((s) => b.shapePreviewCells('party-0', 'smoke_bomb', s, 'party').targets.includes('party-0'))!;
    expect(b.useSkill('party-0', 'smoke_bomb', undefined, ownAnchor, 'party').ok).toBe(true);
    expect(statDir(own.stats.evasion, b.effectiveStats(own).evasion)).toBe('up');
    expect(statSources(own.statuses, content.statuses, 'evasion')).toEqual([{ text: 'Shrouded +20%', dir: 'up' }]);
  });

  it("önizleme durum metni: 'Blinded 2 turns' -> 'Blinded -30% hit', 'Shrouded +20% dodge'; diğer durumlar aynen", () => {
    expect(previewStatusText('Blinded 2 turns', content.statuses)).toBe('Blinded -30% hit');
    expect(previewStatusText('Shrouded 2 turns', content.statuses)).toBe('Shrouded +20% dodge');
    expect(previewStatusText('Wound 2 turns', content.statuses)).toBe('Wound 2 turns');
    expect(previewStatusText('Taunt 2 turns', content.statuses)).toBe('Taunt 2 turns');
  });

  it('Smoke Bomb önizlemesi her iki tahtada da durum satırı taşır ve metne çevrilir', () => {
    const b = mk();
    const foeAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'enemy')[0]!;
    const fp = previewSkill(b, 'party-0', 'smoke_bomb', undefined, foeAnchor, 'enemy');
    expect(fp.length).toBeGreaterThan(0);
    expect(fp.flatMap((p) => p.statuses ?? []).map((t) => previewStatusText(t, content.statuses))).toContain('Blinded -30% hit');
    const ownAnchor = b.shapeAnchors('party-0', 'smoke_bomb', 'party')[0]!;
    const op = previewSkill(b, 'party-0', 'smoke_bomb', undefined, ownAnchor, 'party');
    expect(op.flatMap((p) => p.statuses ?? []).map((t) => previewStatusText(t, content.statuses))).toContain('Shrouded +20% dodge');
  });
});
