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
    expect(sn.party).toEqual(computeSideNeighbors(layout.partySlots, sn.maxDx));
    expect(sn.enemy).toEqual(computeSideNeighbors(layout.enemySlots, sn.maxDx));
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
  it('(a) oyuncu tarafı: ön sıra şerit 2 Defender, arkasında şerit 0 Archer çapraz komşudur; Skeleton Archer\'a vurunca Defender da vurulur', () => {
    const b = arena([['defender', 2], ['archer', 3], ['gambler', 5]], [['skeleton', 0]]);
    const archer = b.get('party-1')!;
    const alive = b.living('party');
    const near = pickSideNeighbors(sn.party[archer.slot], (s) => alive.some((c) => c.slot === s)).map((s) => alive.find((c) => c.slot === s)!.defId);
    expect(near).toContain('defender');
    // Archer arka sırada (melee ulaşamaz) ama geometrik komşuluk: Defender vurulacak aday
    expect(b.splashTargets('skeleton_slash', archer).map((c) => c.uid)).toEqual(['party-0']);
    // Defender'a vurunca da arkasındaki çapraz komşu Archer yan vuruş alır (slot 1 boş: bir sonraki aday slot 3)
    expect(cast(b, 'enemy-0', 'party-0').sort()).toEqual(['party-0', 'party-1']);
  });

  it('(a2) seed 1 dizilimi: Archer orta şeritte (slot 4); Defender (slot 2) ve Gambler (slot 3) yan komşu (geometri)', () => {
    const b = arena([['defender', 2], ['gambler', 3], ['archer', 4]], [['skeleton', 0]]);
    expect(b.splashTargets('skeleton_slash', b.get('party-2')!).map((c) => c.uid).sort()).toEqual(['party-0', 'party-1']);
  });

  it('(b) düşman tarafı: ortadaki Warrior\'a vurunca Defender ve Gambler de vurulur (bozulmadı)', () => {
    const b = arena([['skeleton', 0]], [['defender', 0], ['warrior', 1], ['gambler', 2], ['mage', 5], ['archer', 4]]);
    expect(cast(b, 'party-0', 'enemy-1').sort()).toEqual(['enemy-0', 'enemy-1', 'enemy-2']);
  });

  it('(b2) aynı sıradaki yakın komşu doluysa daha uzaktaki çapraz hücreye bakılmaz', () => {
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
    const b = arena([['defender', 2], ['archer', 3]], [['skeleton', 0]]);
    expect(b.splashTargets('skeleton_slash', b.get('party-1')!).map((c) => c.uid)).toEqual(['party-0']);
  });
});

describe('stat tooltip metinleri (veriden)', () => {
  const lines = (kind: Parameters<typeof describeStat>[0]) => describeStat(kind, content.classes.archer!.stats, f).lines.join('\n');
  it('Dex: kaçınma adımı ve üst sınır veriden yazılır ("3 Dex = +1% evasion")', () => {
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
  it('hiçbir class dex 0 değil (en az 2); çevik olmayanlar az dex taşır; çeviklerin evasion adımı daha yüksek; toplam 30', () => {
    for (const c of classes) expect(c.attributes.dex, c.id).toBeGreaterThanOrEqual(2);
    for (const id of LOW_DEX) {
      const c = content.classes[id]!;
      expect(c.attributes.dex, id).toBeLessThanOrEqual(3);
      expect(c.stats.evasion, id).toBeLessThanOrEqual(f.attributes.evasionPerStep); // en çok tek adım (%1)
    }
    for (const id of ['archer', 'gambler', 'antimage']) expect(content.classes[id]!.attributes.dex, id).toBeGreaterThanOrEqual(5);
    expect(content.classes.archer!.stats.evasion).toBeGreaterThan(content.classes.warrior!.stats.evasion);
    for (const c of classes) {
      const a = c.attributes;
      expect(a.str + a.int + a.dex + a.luck, c.id).toBe(30);
      expect(a[c.primary!], c.id).toBe(Math.max(a.str, a.int, a.dex, a.luck));
    }
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
