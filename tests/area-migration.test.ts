import { describe, expect, it } from 'vitest';
import { Battle, MatchLog, chooseAction, content, describeSkill } from '../src/engine';
import type { AiTrace, BattleEvent, CombatantDef, SkillDef } from '../src/engine';
import { screenCellOf, shapeCells, shapeStages } from '../src/engine/area-shape';
import { previewSkill } from '../src/engine/preview';
import { buildWiki } from '../src/wiki/catalog';

// Tüm alan skill'lerinin şekil modeline geçişi (open-questions.md madde 220): genel rect (1x1..4x3), aşamalı vuruş (area.stages),
// migre edilen skill'lerin şekilleri, önizleme = gerçek vuruş, AI ve determinizm. Sayılar (güç/MP/cooldown) DEĞİŞMEDİ; yalnızca hücre kümeleri.

const fm = content.formulas.formation;
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;
type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) => events.filter((e): e is Ev<T> => e.type === type);

function arena(party: [string, number][], enemies: [string, number][], skills: Record<string, SkillDef> = {}, seed = 1, mode: 'test' | 'turns' = 'test'): Battle {
  const base = content.battleSetup('random-battle', seed, mode, { party: [], enemies: [] }, false);
  const b = new Battle({ ...base, skills: { ...base.skills, ...skills }, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
  b.freeMp = true;
  return b;
}
const sure = (b: Battle) => {
  for (const c of b.combatants) Object.assign(c.stats, { accuracy: 10, evasion: 0, surviveChance: 0 });
  for (const c of b.combatants) c.hp = c.maxHp = 5000;
  return b;
};
const WAR = (...slots: number[]): [string, number][] => slots.map((s) => ['warrior', s]);
const FULL = WAR(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);

/** Migrasyon tablosu (karar: open-questions.md madde 220). Değişirse burası ve tablo birlikte güncellenir. */
const MIGRATED: Record<string, { owner: string; area: Record<string, unknown> }> = {
  natures_wrath: { owner: 'druid', area: { shape: 'rect', rows: 2, cols: 3, stages: 'row' } },
  blizzard: { owner: 'mage', area: { shape: 'rect', rows: 3, cols: 2 } },
  meteor: { owner: 'mage', area: { shape: 'plus' } },
  judgment: { owner: 'paladin', area: { shape: 'plus' } },
  wail_of_the_dead: { owner: 'undead', area: { shape: 'plus', stages: 'distance' } },
  tremor_slam: { owner: 'defender', area: { shape: 'row' } },
  piercing_arrow: { owner: 'archer', area: { shape: 'column', stages: 'row' } },
  arrow_rain: { owner: 'archer', area: { shape: 'rect', rows: 3, cols: 3 } },
  drain_field: { owner: 'antimage', area: { shape: 'rect', rows: 3, cols: 3 } },
};

/** Madde 220'den sonra doğrudan şekil modeliyle eklenen alan skill'leri (migrasyon değil): Cutthroat Saltire Cut (x) ve Smoke Bomb (area_any), Druid Vine Snare. */
const ADDED_LATER = ['x_cut', 'smoke_bomb', 'vine_snare'];

describe('rect: tüm boyutlar 1x1 .. 4x3 (rows = sıra, cols = şerit), iki tahta, her anchor', () => {
  for (let R = 1; R <= fm.rows; R++)
    for (let C = 1; C <= fm.lanes; C++) {
      it(`${R}x${C}: R*C hücre, ekranda R sütun x C satır dikdörtgen; boyutu 3+ eksende fare ortada (olmazsa soldan, o da olmazsa kaydır), 1-2 eksende sol-alt köşe`, () => {
        const area = { shape: 'rect' as const, rows: R, cols: C, anchor: 'bottom_left' as const };
        for (const board of ['party', 'enemy'] as const)
          for (let a = 0; a < fm.rows * fm.lanes; a++) {
            const cells = shapeCells(area, a, board, fm);
            const sc = cells.map((s) => screenCellOf(fm, board, s));
            const cols = [...new Set(sc.map((c) => c.col))].sort((x, y) => x - y);
            const rows = [...new Set(sc.map((c) => c.row))].sort((x, y) => x - y);
            expect(cells, `${board} @${a}`).toHaveLength(R * C);
            expect(cols).toHaveLength(R);
            expect(rows).toHaveLength(C);
            expect(cols[cols.length - 1]! - cols[0]!).toBe(R - 1); // bitişik
            expect(rows[rows.length - 1]! - rows[0]!).toBe(C - 1);
            expect(cells).toContain(a); // fare hücresi her zaman şeklin içinde
            const g = screenCellOf(fm, board, a);
            // Ömer kuralı (madde 226), eksen eksen ekran uzayında: boyut >= 3 -> fare ortada (çift boyutta orta-sol: başlangıçtan floor((n-1)/2));
            // ortalanmış alan taşarsa soldan (fare = başlangıç); o da taşarsa kaydır. Boyut 1-2 -> eski kural: yatayda fare en solda, dikeyde en altta (taşarsa kaydır).
            const clampTo = (v: number, max: number) => Math.max(0, Math.min(max, v));
            const expectStart = (p: number, n: number, max: number, smallAt: 'low' | 'high') => {
              if (n >= 3) {
                const c = p - Math.floor((n - 1) / 2);
                return c >= 0 && c + n <= max ? c : clampTo(p, max - n);
              }
              return clampTo(smallAt === 'low' ? p : p - n + 1, max - n);
            };
            expect(cols[0], `${board} @${a} yatay`).toBe(expectStart(g.col, R, fm.rows, 'low'));
            expect(rows[0], `${board} @${a} dikey`).toBe(expectStart(g.row, C, fm.lanes, 'high'));
            if (R < 3 && g.col + R <= fm.rows) expect(cols[0], `${board} @${a} sol`).toBe(g.col); // eski kural: anchor = sol
            if (C < 3 && g.row - C + 1 >= 0) expect(rows[rows.length - 1], `${board} @${a} alt`).toBe(g.row); // eski kural: anchor = alt
            if (R === 3 && g.col >= 1 && g.col + 1 < fm.rows) expect(cols[1], `${board} @${a} orta`).toBe(g.col); // 3 genişlik: fare tam ortada
            if (R === 4) expect(cols[0]).toBe(0); // 4 = tüm derinlik
          }
      });
    }

  it('özel boyutlar: 1x1 = tek hücre, 1x3 = row, 4x1 = column, 4x3 = tüm tahta', () => {
    for (const board of ['party', 'enemy'] as const)
      for (let a = 0; a < 12; a++) {
        expect(shapeCells({ shape: 'rect', rows: 1, cols: 1 }, a, board, fm)).toEqual([a]);
        expect(shapeCells({ shape: 'rect', rows: 1, cols: 3 }, a, board, fm)).toEqual(shapeCells({ shape: 'row' }, a, board, fm));
        expect(shapeCells({ shape: 'rect', rows: 4, cols: 1 }, a, board, fm)).toEqual(shapeCells({ shape: 'column' }, a, board, fm));
        expect(shapeCells({ shape: 'rect', rows: 4, cols: 3 }, a, board, fm)).toHaveLength(12);
      }
  });

  it('örnekler (düşman tahtası; ekranda sol = ön sıra, alt = büyük şerit no): 3x2 ve 2x2 kayma', () => {
    // 3x2, anchor 5 (sıra 1, şerit 2 = ekranda alt): sıra ekseni 3 -> fare ORTADA (sıra 0,1,2); şerit ekseni 2 -> fare altta (şerit 1,2)
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 2 }, 5, 'enemy', fm)).toEqual([1, 2, 4, 5, 7, 8]);
    // 3x2, anchor 3 (sıra 1, şerit 0 = en üst): ortada (sıra 0..2); şerit ekseni 2: altta olamaz (yukarı taşar) -> kaydır (şerit 0,1)
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 2 }, 3, 'enemy', fm)).toEqual([0, 1, 3, 4, 6, 7]);
    // 3x3 anchor 4 (sıra 1): ortalanır -> sıra 0..2 (eski kuralda 1..3 idi); anchor 7 (sıra 2) -> sıra 1..3
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 3 }, 4, 'enemy', fm)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 3 }, 7, 'enemy', fm)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 2x2 (Vine Snare gibi) eski kural aynen: anchor 4 (sıra 1, şerit 1) -> sıra 1,2 x şerit 0,1
    expect(shapeCells({ shape: 'rect', rows: 2, cols: 2 }, 4, 'enemy', fm)).toEqual([3, 4, 6, 7]);
    // 2x3: şerit ekseni 3 = tüm şeritler (her anchor aynı), sıra ekseni 2 = sol-alt kuralı: anchor 4 -> sıra 1,2
    expect(shapeCells({ shape: 'rect', rows: 2, cols: 3 }, 4, 'enemy', fm)).toEqual([3, 4, 5, 6, 7, 8]);
    // 3x2, anchor 9 (en arka sıra, şerit 0 = en üst): sağa taşar -> sıra 1..3; yukarı taşar -> şerit 0,1
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 2 }, 9, 'enemy', fm)).toEqual([3, 4, 6, 7, 9, 10]);
    // 3x3 her anchor'da 3 sıra x tüm şeritler
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 3 }, 0, 'enemy', fm)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(shapeCells({ shape: 'rect', rows: 3, cols: 3 }, 11, 'enemy', fm)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('aşamalı vuruş: shapeStages (saf)', () => {
  const r23 = { shape: 'rect' as const, rows: 2, cols: 3 };
  it('row: sıra sıra, ön sıra (saldırgana yakın) önce; reverse arkadan öne; iki tahtada aynı (derinlik)', () => {
    for (const board of ['party', 'enemy'] as const) {
      expect(shapeStages({ ...r23, stages: 'row' }, 0, board, fm)).toEqual([[0, 1, 2], [3, 4, 5]]);
      expect(shapeStages({ ...r23, stages: 'row', reverse: true }, 0, board, fm)).toEqual([[3, 4, 5], [0, 1, 2]]);
      expect(shapeStages({ shape: 'column', stages: 'row' }, 4, board, fm)).toEqual([[1], [4], [7], [10]]);
    }
  });

  it('distance: anchor önce, sonra uzaklık halkaları; column: ekranda üst şerit önce', () => {
    expect(shapeStages({ shape: 'plus', stages: 'distance' }, 4, 'enemy', fm)).toEqual([[4], [1, 3, 5, 7]]);
    expect(shapeStages({ shape: 'plus', stages: 'distance', reverse: true }, 4, 'enemy', fm)).toEqual([[1, 3, 5, 7], [4]]);
    const col = shapeStages({ ...r23, stages: 'column' }, 0, 'enemy', fm);
    expect(col).toHaveLength(3);
    const top = col.map((st) => screenCellOf(fm, 'enemy', st[0]!).row);
    expect(top).toEqual([...top].sort((x, y) => x - y));
  });

  it('aşamalar ayrık ve birleşimleri şeklin hücreleri; aşamasız şekil tek aşama', () => {
    for (const stages of ['row', 'column', 'distance'] as const)
      for (const area of [{ ...r23, stages }, { shape: 'plus' as const, stages }, { shape: 'rect' as const, rows: 4, cols: 3, stages }])
        for (const board of ['party', 'enemy'] as const)
          for (let a = 0; a < 12; a++) {
            const st = shapeStages(area, a, board, fm);
            expect(st.flat().sort((x, y) => x - y)).toEqual(shapeCells(area, a, board, fm));
            expect(new Set(st.flat()).size).toBe(st.flat().length);
          }
    expect(shapeStages(r23, 4, 'enemy', fm)).toEqual([shapeCells(r23, 4, 'enemy', fm)]);
  });
});

describe('aşamalı vuruş: savaşta olay akışı', () => {
  it("Nature's Wrath (2x3, row): önce ön sıranın 3 hücresi, sonra 2. sıra; olaylar aşama sırasıyla ve stage numaralı", () => {
    const b = sure(arena([['druid', 0]], WAR(0, 1, 2, 3, 5, 9)));
    const expected = b.areaStages('party-0', 'natures_wrath', 0);
    expect(expected.map((s) => s.cells)).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(expected.map((s) => s.targets)).toEqual([['enemy-0', 'enemy-1', 'enemy-2'], ['enemy-3', 'enemy-4']]);
    const r = b.useSkill('party-0', 'natures_wrath', undefined, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used = ofType(r.events, 'skillUsed')[0]!;
    expect(used.stages).toEqual(expected);
    expect(used.stage).toBeUndefined();
    const dmg = ofType(r.events, 'damage');
    expect(dmg.map((e) => e.stage)).toEqual([0, 0, 0, 1, 1]);
    expect(dmg.map((e) => e.target)).toEqual(['enemy-0', 'enemy-1', 'enemy-2', 'enemy-3', 'enemy-4']);
    // aşama numaraları azalmaz (sonraki aşamanın olayı öncekinin olayından önce gelmez)
    const stages = r.events.filter((e) => e.stage !== undefined).map((e) => e.stage!);
    expect(stages).toEqual([...stages].sort((x, y) => x - y));
  });

  it('aşamalı = aşamasız: aynı seed, aynı hedefler, hedef başına AYNI hasar (toplam değişmez); önizleme de aynı', () => {
    for (const [id, anchor] of [['natures_wrath', 0], ['natures_wrath', 4], ['piercing_arrow', 7], ['wail_of_the_dead', 4]] as const) {
      const sk = content.skills[id]!;
      const flat: SkillDef = { ...sk, area: { ...sk.area!, stages: undefined } };
      const owner = MIGRATED[id]!.owner;
      for (let seed = 1; seed <= 15; seed++) {
        const mk = (s?: SkillDef) => {
          const b = arena([[owner, 0]], WAR(0, 1, 3, 4, 5, 7, 10), s ? { [id]: s } : {}, seed);
          for (const c of b.combatants) c.hp = c.maxHp = 5000;
          return b;
        };
        const a = mk();
        const f = mk(flat);
        const pa = previewSkill(a, 'party-0', id, undefined, anchor);
        const pf = previewSkill(f, 'party-0', id, undefined, anchor);
        expect(pa.map((p) => [p.uid, p.damage?.avg, p.ground?.total]).sort(), `${id} preview`).toEqual(pf.map((p) => [p.uid, p.damage?.avg, p.ground?.total]).sort());
        const ra = a.useSkill('party-0', id, undefined, anchor);
        const rf = f.useSkill('party-0', id, undefined, anchor);
        expect(ra.ok && rf.ok).toBe(true);
        if (!ra.ok || !rf.ok) continue;
        const hp = (b: Battle) => b.combatants.filter((c) => c.side === 'enemy').map((c) => [c.uid, c.hp]);
        // Nature's Wrath / Piercing Arrow: aşama sırası = derinlik sırası, zarlar aynı sırayla atılır -> hasar birebir aynı
        if (id !== 'wail_of_the_dead') expect(hp(a), `${id} seed ${seed}`).toEqual(hp(f));
        // Wail: aşama sırası (merkez önce) farklı olduğu için zarlar farklı hedefe düşer; vurulanlar ve zemin hücreleri aynı
        expect(ofType(ra.events, 'skillUsed')[0]!.targets.slice().sort()).toEqual(ofType(rf.events, 'skillUsed')[0]!.targets.slice().sort());
        expect(ofType(ra.events, 'ground').flatMap((g) => g.slots).sort()).toEqual(ofType(rf.events, 'ground').flatMap((g) => g.slots).sort());
      }
    }
  });

  it('Piercing Arrow (column, row aşamalı): falloff öndekinden arkadakine sürer (aşamalar boyunca)', () => {
    let r1 = 0;
    const seeds = 30;
    for (let seed = 1; seed <= seeds; seed++) {
      const b = sure(arena([['archer', 0]], WAR(1, 4, 10), {}, seed));
      for (const c of b.combatants) c.stats.critChance = 0;
      delete b.get('party-0')!.passive;
      const r = b.useSkill('party-0', 'piercing_arrow', undefined, 7);
      if (!r.ok) throw new Error(r.reason);
      const d = ofType(r.events, 'damage');
      expect(d.map((e) => [e.target, e.stage])).toEqual([['enemy-0', 0], ['enemy-1', 1], ['enemy-2', 3]]); // boş hücre 7 = aşama 2 (vuruş yok)
      r1 += d[1]!.amount / d[0]!.amount;
    }
    const fall = (content.skills.piercing_arrow!.effects[0] as { falloff: number }).falloff;
    expect(r1 / seeds).toBeGreaterThan(fall - 0.06);
    expect(r1 / seeds).toBeLessThan(fall + 0.06);
  });

  it('Wail of the Dead (plus, distance): merkez önce; zemin (zehir) her aşamanın hücrelerine ayrı bırakılır ve aşama numarası taşır', () => {
    const b = sure(arena([['undead', 0]], WAR(1, 3, 4, 5)));
    const r = b.useSkill('party-0', 'wail_of_the_dead', undefined, 4);
    if (!r.ok) throw new Error(r.reason);
    expect(ofType(r.events, 'damage').map((e) => [e.target, e.stage])).toEqual([['enemy-2', 0], ['enemy-0', 1], ['enemy-1', 1], ['enemy-3', 1]]);
    const g = ofType(r.events, 'ground');
    expect(g.map((x) => [x.slots, x.stage])).toEqual([[[4], 0], [[1, 3, 5, 7], 1]]);
    expect(new Set(g.map((x) => x.id)).size).toBe(2);
  });

  it('aşamasız skill olaylarında stage alanı yok', () => {
    const b = sure(arena([['mage', 0]], WAR(0, 1, 3, 4)));
    const r = b.useSkill('party-0', 'meteor', undefined, 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.events.every((e) => e.stage === undefined)).toBe(true);
    expect(ofType(r.events, 'skillUsed')[0]!.stages).toBeUndefined();
  });

  it('maç kaydı: aşamalı olaylar "[stage N]" önekiyle, aday satırı "staged row" yazar', () => {
    const b = sure(arena([['druid', 0]], WAR(0, 1, 2, 3, 5)));
    b.combatants[0]!.skills = ['natures_wrath'];
    const log = new MatchLog(b, { version: 'test' });
    expect(b.applyChoice('party-0', chooseAction(b, 'party-0', content.aiConfig)).ok).toBe(true);
    const text = log.serialize();
    expect(text).toContain('[stage 0]');
    expect(text).toContain('[stage 1]');
    expect(text).toContain('area shape rect 2x3 staged row');
  });
});

describe('migre edilen alan skill\'leri', () => {
  it('her biri tabloda yazan şekilde; sayılar (güç, MP, cooldown) eski yerinde (yalnızca target/area değişti)', () => {
    for (const [id, m] of Object.entries(MIGRATED)) {
      const s = content.skills[id]!;
      expect(s.target, id).toBe('area_enemies');
      expect(s.area, id).toMatchObject(m.area);
      expect(content.classes[m.owner]!.skills, id).toContain(id);
    }
    // tüm alan skill'leri ya tabloda ya Geometer (test class'ı) skill'i ya da madde 220'den SONRA şekil modeliyle eklenen skill (ADDED_LATER)
    const area = Object.values(content.skills).filter((s) => s.target === 'area_enemies' || s.target === 'area_any').map((s) => s.id);
    for (const id of area) expect(id in MIGRATED || content.classes.aoe_tester!.skills.includes(id) || ADDED_LATER.includes(id), id).toBe(true);
  });

  it('dokunulmayan hedef-seçim türleri: Whirlwind (all_enemies), Radiance (everyone), Fist Crush / Card Trick (random_enemies)', () => {
    expect(content.skills.whirlwind!.target).toBe('all_enemies');
    expect(content.skills.radiance!.target).toBe('everyone');
    expect(content.skills.fist_crush!.target).toBe('random_enemies');
    expect(content.skills.card_trick!.target).toBe('random_enemies');
    for (const id of ['whirlwind', 'radiance', 'fist_crush', 'card_trick']) expect(content.skills[id]!.area, id).toBeUndefined();
  });

  it('açıklama ve rozet şekilden: Block 2x3 + "Sweeps row by row, front row first" (aşamalı), Cross, Row, Column', () => {
    const info = (id: string) => describeSkill(content.skills[id]!, content.classes[MIGRATED[id]!.owner]!.stats, content.formulas);
    expect(info('natures_wrath').targetBadge).toBe('Block 2x3');
    expect(info('natures_wrath').lines).toContain('Sweeps row by row, front row first');
    expect(info('wail_of_the_dead').lines).toContain('Spreads wave by wave from the anchor cell outward');
    expect(info('blizzard').targetBadge).toBe('Block 3x2');
    expect(info('meteor').targetBadge).toBe('Cross');
    expect(info('tremor_slam').targetBadge).toBe('Row');
    expect(info('piercing_arrow').targetBadge).toBe('Column');
    expect(info('arrow_rain').targetBadge).toBe('Block 3x3');
    expect(info('meteor').lines.join(' ')).not.toMatch(/Sweeps|wave by wave/);
  });

  it('wiki Area shapes makalesi: hangi skill hangi şekli kullanıyor tablosu veriden (Geometer hariç), dalga sütunu', () => {
    const art = buildWiki({ sprites: {}, avatars: {} }).mechanics.find((x) => x.id === 'area-shapes')!;
    const tbl = art.blocks.find((x) => x.kind === 'table') as { head: string[]; rows: string[][] };
    expect(tbl.head).toEqual(['Skill', 'Class', 'Shape', 'Waves']);
    const listed = Object.values(content.skills).filter((s) => (s.target === 'area_enemies' || s.target === 'area_any') && !content.classes.aoe_tester!.skills.includes(s.id));
    expect(tbl.rows.map((r) => r[0]).sort()).toEqual(listed.map((s) => s.name).sort());
    for (const id of Object.keys(MIGRATED)) expect(tbl.rows.map((r) => r[0])).toContain(content.skills[id]!.name);
    expect(tbl.rows.find((r) => r[0] === "Nature's Wrath")).toEqual(["Nature's Wrath", 'Druid', 'Block 2x3', 'row by row']);
    expect(tbl.rows.find((r) => r[0] === 'Meteor')).toEqual(['Meteor', 'Mage', 'Cross', '-']);
  });

  it('önizleme = gerçek vuruş: her migre skill, her anchor, iki taraf, birkaç dizilim (hedefler ve skillUsed.cells)', () => {
    const boards: [string, number][][] = [FULL, WAR(0, 2, 3, 5, 6), WAR(1, 4, 7, 10), WAR(3, 4, 5, 9)];
    for (const [id, m] of Object.entries(MIGRATED))
      for (const foes of boards)
        for (const actorSide of ['party', 'enemy'] as const)
          for (let anchor = 0; anchor < 12; anchor++) {
            const b = actorSide === 'party' ? arena([[m.owner, 0]], foes) : arena(foes, [[m.owner, 0]]);
            const actor = actorSide === 'party' ? 'party-0' : 'enemy-0';
            const pv = b.shapePreviewCells(actor, id, anchor);
            const prev = previewSkill(b, actor, id, undefined, anchor).map((p) => p.uid).sort();
            const tag = `${id} ${actorSide} @${anchor}`;
            expect(prev, tag).toEqual([...pv.targets].sort());
            const r = b.useSkill(actor, id, undefined, anchor);
            expect(r.ok, tag).toBe(pv.valid);
            if (!r.ok) continue;
            const used = ofType(r.events, 'skillUsed')[0]!;
            expect(used.cells, tag).toEqual(pv.cells);
            expect([...used.targets].sort(), tag).toEqual([...pv.targets].sort());
            const touched = new Set([...ofType(r.events, 'damage'), ...ofType(r.events, 'dodge'), ...ofType(r.events, 'miss'), ...ofType(r.events, 'manaBurn')].filter((e) => e.source === actor).map((e) => e.target));
            for (const t of touched) expect(pv.targets, tag).toContain(t);
          }
  });

  it('Tremor Slam (melee row): yalnızca ön sıra; ön sıra boşalınca sıradaki dolu sıra', () => {
    const b = arena([['defender', 0]], WAR(0, 2, 3, 4, 5));
    expect(b.shapeAnchors('party-0', 'tremor_slam')).toEqual([0, 1, 2]);
    expect(b.shapePreviewCells('party-0', 'tremor_slam', 0).targets).toEqual(['enemy-0', 'enemy-1']);
    expect(b.shapePreviewCells('party-0', 'tremor_slam', 4)).toMatchObject({ valid: false, reason: 'No target in reach' });
    b.get('enemy-0')!.hp = 0;
    b.get('enemy-1')!.hp = 0;
    expect(b.shapeAnchors('party-0', 'tremor_slam')).toEqual([3, 4, 5]);
  });
});

describe('AI: migre şekil skill\'leri', () => {
  const ai = content.aiConfig;

  it("aday her farklı hücre kümesi için bir tane; Nature's Wrath en çok hedefi kapsayan anchor'a atılır (aşamalı değerlendirme = toplam)", () => {
    const b = arena([['druid', 0]], WAR(3, 4, 5, 6, 10));
    b.combatants[0]!.skills = ['natures_wrath'];
    const trace: AiTrace = { options: [], reserves: [], steps: [] };
    const choice = chooseAction(b, 'party-0', ai, trace)!;
    expect(choice.skillId).toBe('natures_wrath');
    const sets = new Set(b.shapeAnchors('party-0', 'natures_wrath').map((a) => b.areaCells('natures_wrath', a).join(',')));
    expect(trace.options.filter((o) => o.skill.id === 'natures_wrath')).toHaveLength(sets.size);
    const best = Math.max(...b.shapeAnchors('party-0', 'natures_wrath').map((a) => b.areaWindowAt('party-0', 'natures_wrath', a).length));
    expect(b.areaWindowAt('party-0', 'natures_wrath', choice.slot ?? b.get(choice.targetUid!)!.slot)).toHaveLength(best);
    expect(best).toBe(4); // sıra 1 + sıra 2 (3,4,5,6)
  });

  it('zemin değeri boş anchor\'da da sayılır (Judgment: yalnız zemin; iki düşmanın ortak boş komşusu)', () => {
    const b = arena([['paladin', 0]], WAR(0, 4));
    b.combatants[0]!.skills = ['judgment'];
    const choice = chooseAction(b, 'party-0', ai)!;
    expect(choice.skillId).toBe('judgment');
    expect(b.areaWindowAt('party-0', 'judgment', choice.slot ?? b.get(choice.targetUid!)!.slot)).toHaveLength(2);
  });

  for (const mode of ['turns', 'test'] as const) {
    it(`determinizm + iki mod (${mode}): migre class'larla tam AI savaşı aynı seed'de birebir aynı, aşamalı olaylar görülür`, () => {
      const run = () => {
        const b = new Battle(content.battleSetup('random-battle', 21, mode, { party: ['druid', 'undead', 'archer', 'mage', 'defender'], enemies: ['paladin', 'antimage', 'archer', 'druid', 'undead'] }));
        for (let i = 0; i < 400 && !b.winner; i++) {
          const actor = mode === 'turns' ? b.currentUid! : b.living('party').concat(b.living('enemy'))[i % b.living('party').concat(b.living('enemy')).length]!.uid;
          const choice = chooseAction(b, actor, ai);
          if (!choice && mode === 'test') continue; // test modunda pas (sıra) yok
          const r = b.applyChoice(actor, choice);
          expect(r.ok, `hamle ${i} ${JSON.stringify(choice)} ${r.ok ? '' : r.reason}`).toBe(true);
        }
        return b.log;
      };
      const a = run();
      expect(JSON.stringify(run())).toBe(JSON.stringify(a));
      expect(a.some((e) => e.type === 'skillUsed' && content.skills[e.skill]?.target === 'area_enemies')).toBe(true);
    });
  }
});
