import { describe, expect, it } from 'vitest';
import layout from '../data/battle-layout.json';
import { Battle, content, describeStat, deriveStats } from '../src/engine';
import { computeSideNeighbors, pickSideNeighbors } from '../src/engine/formation';
import type { BattleEvent, CombatantDef } from '../src/engine';

// Yan vuruş komşuluğu EKRAN geometrisinden gelir: harita formulas.json > formation.sideNeighbors, layout koordinatlarından üretilir.

const f = content.formulas;
const sn = f.formation.sideNeighbors!;
const unitDef = (id: string): CombatantDef => (content.summons[id] ?? content.classes[id])!;

/** Birimleri doğrudan yuvalara koyar: uid'ler party-0.., enemy-0.. (girdi sırası). */
function arena(party: [string, number][], enemies: [string, number][]): Battle {
  const base = content.battleSetup('random-battle', 1, 'test', { party: [], enemies: [] }, false);
  const b = new Battle({ ...base, party: party.map(([id]) => unitDef(id)), partySlots: party.map(([, s]) => s), enemies: enemies.map(([id]) => unitDef(id)), enemySlots: enemies.map(([, s]) => s) });
  for (const c of b.combatants) Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0, surviveChance: 0 });
  b.debug.crit = 'never';
  return b;
}
const hits = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage').map((e) => e.target);
const cast = (b: Battle, actor: string, target: string) => {
  const r = b.useSkill(actor, 'skeleton_slash', target);
  if (!r.ok) throw new Error(r.reason);
  return hits(r.events);
};

describe('yan komşuluk haritası (veri = layout geometrisi)', () => {
  it('formulas.json haritası layout koordinatlarından üretilenle birebir aynı (layout değişirse haritayı yeniden üret)', () => {
    expect(sn.party).toEqual(computeSideNeighbors(layout.partySlots, sn.maxDx, f.formation.lanes));
    expect(sn.enemy).toEqual(computeSideNeighbors(layout.enemySlots, sn.maxDx, f.formation.lanes));
  });

  it('adaylar ekranda üstte/altta (farklı yükseklik), yatayda maxDx içinde; yakından uzağa sıralı', () => {
    for (const [board, slots] of [['party', layout.partySlots], ['enemy', layout.enemySlots]] as const) {
      sn[board].forEach((cell, i) => {
        for (const [dir, list] of [['up', cell.up], ['down', cell.down]] as const) {
          let last = 0;
          for (const j of list) {
            const dx = slots[j]!.x - slots[i]!.x;
            const dy = slots[j]!.y - slots[i]!.y;
            expect(Math.abs(dx)).toBeLessThanOrEqual(sn.maxDx);
            expect(dir === 'up' ? dy < 0 : dy > 0).toBe(true);
            const d = Math.hypot(dx, dy);
            expect(d).toBeGreaterThanOrEqual(last);
            last = d;
          }
        }
      });
    }
  });

  it('iki taraf ayna simetrik (aynı hücre numaraları)', () => {
    expect(sn.party).toEqual(sn.enemy);
  });

  it('TÜM yuvalar (oyuncu ve düşman): yan komşu listesinde hücrenin önü/arkası (aynı şeritteki başka sıra) ya da başka sıranın çapraz hücresi YOK; hepsi aynı sırada', () => {
    const lanes = f.formation.lanes;
    for (const board of ['party', 'enemy'] as const) {
      sn[board].forEach((cell, i) => {
        for (const j of [...cell.up, ...cell.down]) {
          expect(Math.floor(j / lanes), `${board} ${i} -> ${j}`).toBe(Math.floor(i / lanes)); // aynı sıra
          expect(j % lanes, `${board} ${i} -> ${j} (ön/arka aynı şerit)`).not.toBe(i % lanes);
        }
        // sıra içinde en çok iki komşu yön, toplam aday sayısı = sıradaki diğer şeritler
        expect(cell.up.length + cell.down.length).toBe(lanes - 1);
      });
    }
  });

  it('hiçbir hücre, kendi önündeki/arkasındaki hücre dolu olsa bile yan vuruş almaz (tüm yuva çiftleri taranır)', () => {
    const lanes = f.formation.lanes;
    const rows = f.formation.rows;
    for (const board of ['party', 'enemy'] as const) {
      for (let i = 0; i < rows * lanes; i++) {
        const others = (slot: number) => Math.floor(slot / lanes) !== Math.floor(i / lanes); // yalnızca diğer sıralar dolu
        expect(pickSideNeighbors(sn[board][i], others), `${board} ${i}`).toEqual([]);
      }
    }
  });

  it('en çok iki komşu (bir üst, bir alt); dolu hücre yoksa boş; ilk DOLU aday seçilir', () => {
    const map = sn.party[2]!; // sıra 0, şerit 2 (en altta): yalnızca üst komşular
    expect(pickSideNeighbors(map, () => false)).toEqual([]);
    expect(pickSideNeighbors(map, () => true)).toHaveLength(1);
    expect(pickSideNeighbors(sn.party[4]!, () => true).length).toBeLessThanOrEqual(2);
    const first = map.up[0]!;
    const second = map.up[1]!;
    expect(pickSideNeighbors(map, (s) => s !== first && s === second)).toEqual([second]);
  });
});

describe('Bone Slash yan hedefleri ekran komşuluğuna göre (Ömer örnekleri)', () => {
  it('(a) oyuncu tarafı: Archer (sıra 1) arkasındaki/önündeki Defender yan vuruş ALMAZ (eski hata: çapraz hücre yan sayılıyordu)', () => {
    // Defender slot 2 (sıra 0, şerit 2), Archer slot 3 (sıra 1, şerit 0): ekranda yakın ama biri diğerinin önü/arkası
    const b = arena([['defender', 2], ['archer', 3], ['gambler', 5]], [['skeleton', 0]]);
    const archer = b.get('party-1')!;
    expect(b.splashTargets('skeleton_slash', archer).map((c) => c.uid)).toEqual(['party-2']); // yalnızca aynı sıradaki Gambler
    // Defender'a vurunca arkasındaki Archer vurulmaz (slot 0/1 boş)
    expect(cast(b, 'enemy-0', 'party-0')).toEqual(['party-0']);
  });

  it('(a2) seed 1 dizilimi (Ömer örneği): Archer orta şeritte (slot 4); aynı sıradaki Gambler (slot 3) ve Defender (slot 5) yan komşu; önündeki sıra 0 hücresi (slot 2) DEĞİL', () => {
    const b = arena([['defender', 5], ['gambler', 3], ['archer', 4]], [['skeleton', 0]]);
    expect(b.splashTargets('skeleton_slash', b.get('party-2')!).map((c) => c.uid).sort()).toEqual(['party-0', 'party-1']);
    // Defender önceki örnekte slot 2'deydi (Archer'ın önünde-çaprazında): artık yan sayılmaz
    const c = arena([['defender', 2], ['gambler', 3], ['archer', 4]], [['skeleton', 0]]);
    expect(c.splashTargets('skeleton_slash', c.get('party-2')!).map((x) => x.uid)).toEqual(['party-1']);
  });

  it('(b) düşman tarafı: ortadaki Warrior\'a vurunca Defender ve Gambler de vurulur (bozulmadı)', () => {
    const b = arena([['skeleton', 0]], [['defender', 0], ['warrior', 1], ['gambler', 2], ['mage', 5], ['archer', 4]]);
    expect(cast(b, 'party-0', 'enemy-1').sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('(b2) arkadaki sıra (slot 3) dolu olsa da yan vuruşa girmez', () => {
    const b = arena([['skeleton', 0]], [['defender', 2], ['warrior', 1], ['gambler', 0], ['archer', 3]]);
    expect(cast(b, 'party-0', 'enemy-1').sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('boş şerit atlanır: 1. ve 3. şerit doluysa (ortası boş) birbirinin yanıdır', () => {
    const b = arena([['skeleton', 0]], [['warrior', 0], ['archer', 2]]);
    expect(cast(b, 'party-0', 'enemy-0').sort()).toEqual(['enemy-0', 'enemy-1']);
  });

  it('ölü komşu atlanır', () => {
    const b = arena([['skeleton', 0]], [['defender', 0], ['warrior', 1], ['gambler', 2]]);
    b.get('enemy-2')!.hp = 0;
    expect(cast(b, 'party-0', 'enemy-1').sort()).toEqual(['enemy-0', 'enemy-1']);
  });

  it('önizleme/YZ\'nin kullandığı splashTargets aynı komşulukları verir', () => {
    const b = arena([['defender', 4], ['archer', 3]], [['skeleton', 0]]);
    expect(b.splashTargets('skeleton_slash', b.get('party-1')!).map((c) => c.uid)).toEqual(['party-0']);
  });
});

describe('stat tooltip metinleri (veriden)', () => {
  const lines = (kind: Parameters<typeof describeStat>[0]) => describeStat(kind, content.classes.archer!.stats, f).lines.join('\n');
  it('Dex: kaçınma adımı ve üst sınır veriden yazılır (örn. "5 Dex = +2% evasion")', () => {
    const a = f.attributes;
    const step = `${a.dexPerEvasionStep} Dex = +${Math.round(a.evasionPerStep * 100)}% evasion`;
    expect(lines('evasion')).toContain(step);
    expect(lines('evasion')).toContain(`max ${Math.round(a.evasionMax * 100)}%`);
    expect(lines('dex')).toContain(`+${Math.round(a.evasionPerStep * 100)}% per ${a.dexPerEvasionStep} Dex`);
    expect(lines('dex')).toContain(`max ${Math.round(a.evasionMax * 100)}%`);
  });
  it('Luck: puan başına isabet ve kritik şansı yazar', () => {
    expect(lines('luck')).toContain(`Accuracy: +${(f.attributes.accuracyPerLuck * 100).toFixed(1)}% per point`);
    expect(lines('luck')).toContain(`Crit chance: +${(f.attributes.critChancePerLuck * 100).toFixed(1)}% per point`);
  });
  it('Str/Int: yenilenme sayıları veriden', () => {
    expect(lines('str')).toContain(`+${f.attributes.hpRegenPerStr} per point`);
    expect(lines('int')).toContain(`+${f.attributes.mpRegenPerInt} per point`);
  });
});

describe('stat dağılımı ve taban isabet', () => {
  const classes = Object.values(content.classes);
  const LOW_DEX = ['warrior', 'defender', 'paladin', 'mage', 'undead', 'druid']; // çevik olmayanlar: az ama sıfır olmayan dex
  it('taban isabet %80 (global), sınıf override alanı varsayılan olarak yok', () => {
    expect(f.attributes.accuracyBase).toBe(0.8);
    for (const c of Object.values(content.classes)) expect('accuracyBase' in c).toBe(false);
  });
  it('hiçbir class dex 0 değil (en az 1); toplam 30; primary en yüksek', () => {
    for (const c of classes) expect(c.attributes.dex, c.id).toBeGreaterThanOrEqual(1);
    for (const c of classes) {
      const a = c.attributes;
      expect(a.str + a.int + a.dex + a.luck, c.id).toBe(30);
      expect(a[c.primary!], c.id).toBe(Math.max(a.str, a.int, a.dex, a.luck));
    }
  });
  it('dex dağılımı doğal: çevik olmayan altı class aynı dex değerini paylaşmaz (en az 4 farklı değer); çevikler (archer, gambler, antimage) en yüksek', () => {
    const dexes = LOW_DEX.map((id) => content.classes[id]!.attributes.dex);
    expect(new Set(dexes).size).toBeGreaterThanOrEqual(4);
    const maxLow = Math.max(...dexes);
    for (const id of ['archer', 'gambler', 'antimage']) expect(content.classes[id]!.attributes.dex, id).toBeGreaterThan(maxLow);
    expect(content.classes.archer!.stats.evasion).toBeGreaterThan(content.classes.warrior!.stats.evasion);
  });
  it('evasion = floor(dex / adım) x yüzde; her class için veriden hesaplanan değere eşit', () => {
    const a = f.attributes;
    for (const c of classes) expect(c.stats.evasion, c.id).toBeCloseTo(Math.min(a.evasionMax, Math.floor(c.attributes.dex / a.dexPerEvasionStep) * a.evasionPerStep), 10);
  });
  it('hız aralığı: hiçbir sınıf spdBase altında değil; en yavaş sınıf en hızlının yarısından yavaş değil', () => {
    const spds = classes.map((c) => c.stats.spd);
    expect(Math.min(...spds)).toBeGreaterThanOrEqual(f.attributes.spdBase);
    expect(Math.min(...spds) * 2).toBeGreaterThanOrEqual(Math.max(...spds));
  });
});

describe('sınıfa özel taban isabet (accuracyBase override, varsayılan yok)', () => {
  it('data.accuracyBase verilirse o sınıf için global tabanın yerine geçer; luck başına artış aynı', () => {
    const data = { ...content.classes.warrior!, accuracyBase: 0.7 } as never;
    const withOverride = deriveStats(data, f);
    expect(withOverride.accuracy).toBeCloseTo(0.7 + f.attributes.accuracyPerLuck * content.classes.warrior!.attributes.luck, 10);
    expect(content.classes.warrior!.stats.accuracy).toBeCloseTo(f.attributes.accuracyBase + f.attributes.accuracyPerLuck * content.classes.warrior!.attributes.luck, 10);
  });
});
