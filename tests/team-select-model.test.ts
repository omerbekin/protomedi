import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { archetypeOf, clampSize, classCounts, defaultTeamSize, freeCellFor, infoClassAfter, isTeamFull, missingCount, missingMessage, moveMember, moveToSide, parseSizeParam, rosterIds, sizesFromSearch, stepSize, stripLayout, teamCount, TEAM_SIZE, trimToSize } from '../src/game/team-select-model';

const ids = Object.keys(content.classes);

describe('takım seçimi (veriden)', () => {
  it('havuz en az takım boyutu kadar sınıf içerir', () => {
    expect(ids.length).toBeGreaterThanOrEqual(TEAM_SIZE);
  });

  it('her sınıf kartı için gereken veri var: ad, logo, 4 stat, skiller, arketip', () => {
    for (const id of ids) {
      const def = content.classes[id]!;
      expect(def.name).toBeTruthy();
      expect(def.logo).toBeTruthy();
      expect(def.skills.length).toBeGreaterThan(0);
      for (const s of def.skills) expect(content.skills[s], `${id}: ${s}`).toBeDefined();
      for (const k of ['str', 'dex', 'int', 'luck'] as const) expect(typeof def.stats[k]).toBe('number');
      expect(archetypeOf(def).length).toBeGreaterThan(0);
    }
  });

  it('yeni seçilen sınıf boş bir hücre bulur; yakın dövüşçü ön sıraya gider', () => {
    const cells = Array.from({ length: content.CELL_COUNT }, () => '');
    const melee = ids.find((id) => content.isMeleeClass(id));
    if (melee) expect(Math.floor(freeCellFor(cells, melee) / content.GRID.lanes)).toBe(0);
    const team: string[] = [...cells];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const cell = freeCellFor(team, ids[i % ids.length]!);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(team[cell]).toBe('');
      team[cell] = ids[i % ids.length]!;
    }
  });
});

describe('takım boyutu (saf mantık)', () => {
  const cells = (n: number) => Array.from({ length: content.CELL_COUNT }, (_, i) => (i < n ? ids[i % ids.length]! : ''));

  it('boyut 1..12 aralığına kısılır; varsayılan 4 (Ömer kararı 2026-10-08)', () => {
    expect(clampSize(0)).toBe(1);
    expect(clampSize(99)).toBe(content.CELL_COUNT);
    expect(clampSize(7.9)).toBe(7);
    expect(defaultTeamSize()).toBe(4);
    expect(stepSize(12, 1)).toBe(12);
    expect(stepSize(1, -1)).toBe(1);
    expect(stepSize(5, 1)).toBe(6);
  });

  it('adres parametreleri: ?party=3&enemies=8; geçersiz ve eksik değer varsayılana düşer', () => {
    expect(sizesFromSearch('?seed=7&party=3&enemies=8')).toEqual({ party: 3, enemies: 8 });
    expect(sizesFromSearch('?seed=7')).toEqual({ party: 4, enemies: 4 });
    expect(sizesFromSearch('?party=abc&enemies=50')).toEqual({ party: 4, enemies: 12 });
    expect(parseSizeParam('', 5)).toBe(5);
  });

  it('doluluk: START yalnızca iki takım da seçilen boyuta eşitken', () => {
    expect(isTeamFull(cells(3), 3)).toBe(true);
    expect(isTeamFull(cells(3), 4)).toBe(false);
    expect(isTeamFull(cells(5), 3)).toBe(false);
    expect(missingCount(cells(2), 5)).toBe(3);
    expect(missingCount(cells(5), 3)).toBe(0);
  });

  it('eksik uyarısı', () => {
    expect(missingMessage({ party: cells(3), enemies: cells(8) }, { party: 5, enemies: 8 })).toBe('Player team needs 2 more classes');
    expect(missingMessage({ party: cells(4), enemies: cells(7) }, { party: 5, enemies: 8 })).toBe('Player team needs 1 more class   ·   Enemy team needs 1 more class');
    expect(missingMessage({ party: cells(5), enemies: cells(5) }, { party: 5, enemies: 5 })).toBe('');
  });

  it('boyut küçülünce fazla birimler sondan çıkar; tekrar eden sınıflar serbest (12 kişi, 9 sınıf)', () => {
    // 9 sınıflık döngü: 12 kişide sınıflar tekrar eder (class sayısı 12'ye ulaştığı için cells(12) artık tekrarsız; Hexer eklenince)
    const big = Array.from({ length: content.CELL_COUNT }, (_, i) => ids[i % 9]!);
    expect(new Set(big.filter(Boolean)).size).toBeLessThan(12);
    const t = trimToSize(big, 4);
    expect(teamCount(t)).toBe(4);
    expect(t.slice(0, 4)).toEqual(big.slice(0, 4));
    expect(teamCount(trimToSize(cells(3), 8))).toBe(3);
  });

  it('rastgele takım seçilen boyutta ve hücrelere sığar', () => {
    for (const n of [1, 3, 8, 12]) {
      const t = content.randomCells(content.randomTeam(7, n), 7);
      expect(teamCount(t)).toBe(n);
    }
  });
});

describe('takım seçimi ekranı: Twin Formations (saf yardımcılar)', () => {
  const empty = () => Array.from({ length: content.CELL_COUNT }, () => '');
  const [a, b, c] = rosterIds() as [string, string, string];

  it("alt bilgi satırı: fare çekilince son gösterilen class kalır (ilk class'a dönmez)", () => {
    let shown = rosterIds()[0]!;
    shown = infoClassAfter(shown, b);
    expect(shown).toBe(b);
    shown = infoClassAfter(shown, null);
    expect(shown).toBe(b);
    shown = infoClassAfter(shown, undefined);
    expect(shown).toBe(b);
    expect(infoClassAfter(shown, c)).toBe(c);
  });

  it("rozet sayıları: bir class'tan her takımda kaç tane var", () => {
    const party = empty();
    const enemies = empty();
    party[0] = a;
    party[4] = a;
    enemies[2] = a;
    enemies[3] = b;
    expect(classCounts({ party, enemies }, a)).toEqual({ party: 2, enemies: 1 });
    expect(classCounts({ party, enemies }, c)).toEqual({ party: 0, enemies: 0 });
  });

  it('sürükle-bırak: aynı takımda boş yuvaya taşıma ve takas', () => {
    const party = empty();
    party[0] = a;
    party[1] = b;
    const sizes = { party: 4, enemies: 4 };
    const moved = moveMember({ party, enemies: empty() }, sizes, { side: 'party', i: 0 }, { side: 'party', i: 5 });
    expect(moved.ok).toBe(true);
    expect(moved.teams.party[0]).toBe('');
    expect(moved.teams.party[5]).toBe(a);
    expect(party[0]).toBe(a); // girdi değişmez
    const swapped = moveMember({ party, enemies: empty() }, sizes, { side: 'party', i: 0 }, { side: 'party', i: 1 });
    expect(swapped.teams.party.slice(0, 2)).toEqual([b, a]);
  });

  it('sürükle-bırak: takımlar arası taşıma; dolu takıma boş yuvaya taşınamaz, takas olur', () => {
    const party = empty();
    const enemies = empty();
    party[0] = a;
    enemies[0] = b;
    const full = { party: 4, enemies: 1 };
    expect(moveMember({ party, enemies }, full, { side: 'party', i: 0 }, { side: 'enemies', i: 3 })).toMatchObject({ ok: false, reason: 'full' });
    const swap = moveMember({ party, enemies }, full, { side: 'party', i: 0 }, { side: 'enemies', i: 0 });
    expect(swap.ok).toBe(true);
    expect(swap.teams.party[0]).toBe(b);
    expect(swap.teams.enemies[0]).toBe(a);
    const free = moveMember({ party, enemies }, { party: 4, enemies: 4 }, { side: 'party', i: 0 }, { side: 'enemies', i: 3 });
    expect(free.ok).toBe(true);
    expect(teamCount(free.teams.party)).toBe(0);
    expect(teamCount(free.teams.enemies)).toBe(2);
    const toSide = moveToSide({ party, enemies }, { party: 4, enemies: 4 }, { side: 'party', i: 0 }, 'enemies');
    expect(toSide.ok).toBe(true);
    expect(toSide.teams.enemies[toSide.cell]).toBe(a);
    expect(moveToSide({ party, enemies }, full, { side: 'party', i: 0 }, 'enemies')).toMatchObject({ ok: false, reason: 'full' });
  });

  it("class rafı: 1920 genişlikte START'a yer bırakarak sığar; geniş ekranda taslak ölçüsü (124 px)", () => {
    const groups = [2, 2, 5, 2];
    const wide = stripLayout(groups, 2000);
    expect(wide.tile).toBe(124);
    expect(wide.width).toBeLessThanOrEqual(2000);
    for (const avail of [1400, 1300, 1200]) {
      const l = stripLayout(groups, avail);
      expect(l.width, `avail ${avail}`).toBeLessThanOrEqual(avail + 1);
      expect(l.tile).toBeGreaterThanOrEqual(72);
    }
    // çok kalabalık rafta bile portre dokunma hedefi altına inmez
    expect(stripLayout([10, 10, 10, 10], 1200).tile).toBe(72);
  });
});
