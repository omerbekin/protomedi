import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  autoDraft,
  autoSlots,
  carrySlots,
  heroSlots,
  loadRun,
  moveInDraft,
  nearestFree,
  newDraft,
  newRun,
  outcomeFromSummary,
  parseRun,
  planKey,
  saveRun,
  wavePlan,
  type EndlessRun,
  type KV,
} from '../src/endless';

// Endless dizilimi (Ömer 2026-10-09): koşu başında tek seferlik dizilim; her zaferde savaş sonundaki hücreler taşınır; düşen son hücresine
// (doluysa en yakın boşa) döner; eski kayıt = otomatik dizilim.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const AT = '2026-10-09T00:00:00.000Z';

class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const cellsOf = (run: EndlessRun) => wavePlan(run).party;

describe('endless dizilim: koşu başı', () => {
  it('seçilen dizilim uygulanır; verilmezse / geçersizse otomatik', () => {
    const slots = [11, 0, 5, 7];
    const run = newRun(1, PARTY, AT, undefined, slots);
    expect(run.heroes.map((h) => h.slot)).toEqual(slots);
    const party = cellsOf(run);
    expect(party[11]).toBe('warrior');
    expect(party[0]).toBe('archer');
    expect(party[5]).toBe('mage');
    expect(party[7]).toBe('druid');
    expect(newRun(1, PARTY, AT).heroes.map((h) => h.slot)).toEqual(autoSlots(PARTY));
    expect(newRun(1, PARTY, AT, undefined, [0, 0, 1, 2]).heroes.map((h) => h.slot)).toEqual(autoSlots(PARTY)); // çakışma
    expect(newRun(1, PARTY, AT, undefined, [0, 1, 2, 99]).heroes.map((h) => h.slot)).toEqual(autoSlots(PARTY)); // tahta dışı
  });

  it('taslak: taşı (doluysa yer değiştir) ve Auto arrange', () => {
    const d = newDraft(PARTY);
    expect(d.slots).toEqual(autoSlots(PARTY));
    const target = d.slots[2]!;
    const m = moveInDraft(d, 0, target);
    expect(m.slots[0]).toBe(target);
    expect(m.slots[2]).toBe(d.slots[0]);
    const free = [...Array(12).keys()].find((c) => !d.slots.includes(c))!;
    expect(moveInDraft(d, 1, free).slots[1]).toBe(free);
    expect(moveInDraft(d, 1, 12)).toBe(d);
    expect(autoDraft(m).slots).toEqual(autoSlots(PARTY));
  });
});

describe('endless dizilim: dalgadan dalgaya', () => {
  const won = (run: EndlessRun, units: Array<{ i: number; slot: number; hp: number }>) => {
    const plan = wavePlan(run);
    const sum = units.map((u) => ({ uid: `party-${u.i}`, side: 'party', summoned: false, hp: u.hp, maxHp: 100, slot: u.slot }));
    // çağrı taşınmaz
    sum.push({ uid: 'party-9', side: 'party', summoned: true, hp: 50, maxHp: 50, slot: 3 });
    return { plan, next: applyOutcome(run, plan, outcomeFromSummary(plan, true, sum, 10)) };
  };

  it('savaş sonundaki hücreler (Move dahil) sonraki dalgaya taşınır', () => {
    const run = newRun(2, PARTY, AT, undefined, [0, 3, 6, 9]);
    // motor sırası = hücre sırası: party-0 warrior(0), party-1 archer(3), party-2 mage(6), party-3 druid(9)
    const { next } = won(run, [
      { i: 0, slot: 1, hp: 80 },
      { i: 1, slot: 4, hp: 80 },
      { i: 2, slot: 6, hp: 80 },
      { i: 3, slot: 10, hp: 80 },
    ]);
    expect(next.heroes.map((h) => h.slot)).toEqual([1, 4, 6, 10]);
    const party = cellsOf({ ...next, phase: 'ready' });
    expect(party[1]).toBe('warrior');
    expect(party[10]).toBe('druid');
    expect(party[3]).toBe(''); // çağrının hücresi taşınmadı
  });

  it('düşen kahraman son hücresine döner; doluysa en yakın boş hücreye (belirleyici)', () => {
    const run = newRun(3, PARTY, AT, undefined, [0, 3, 6, 9]);
    // warrior (0) düştü; archer onun cesedinin hücresine (0) geçti
    const { next } = won(run, [
      { i: 0, slot: 0, hp: 0 },
      { i: 1, slot: 0, hp: 60 },
      { i: 2, slot: 6, hp: 60 },
      { i: 3, slot: 9, hp: 60 },
    ]);
    const [w, a, m, d] = next.heroes;
    expect(a!.slot).toBe(0);
    expect(m!.slot).toBe(6);
    expect(d!.slot).toBe(9);
    expect(w!.slot).toBe(nearestFree(0, new Set([0, 6, 9]))); // 0'a en yakın boş: 1
    expect(w!.slot).toBe(1);
    expect(w!.hpRatio).toBe(0); // Endless kuralı (2026-10-10 takip): düşen kahraman ceset olarak kalır (Revive kartı kaldırır)
    // boşsa kendi hücresine döner
    const { next: n2 } = won(run, [
      { i: 0, slot: 0, hp: 0 },
      { i: 1, slot: 3, hp: 60 },
      { i: 2, slot: 6, hp: 60 },
      { i: 3, slot: 9, hp: 60 },
    ]);
    expect(n2.heroes[0]!.slot).toBe(0);
  });

  it('carrySlots: hücre bilgisi gelmeyen kahraman eski hücresini korur', () => {
    const heroes = newRun(4, PARTY, AT, undefined, [0, 3, 6, 9]).heroes;
    const m = carrySlots(heroes, [{ heroId: 'h1', alive: true, slot: 2 }]);
    expect([...m.entries()].sort()).toEqual([['h1', 2], ['h2', 3], ['h3', 6], ['h4', 9]]);
  });

  it('dizilim değişince savaş kurulumunun parmak izi de değişir (yarım savaş tutarlılığı)', () => {
    const a = newRun(5, PARTY, AT, undefined, [0, 3, 6, 9]);
    const b = newRun(5, PARTY, AT, undefined, [1, 3, 6, 9]);
    expect(planKey(wavePlan(a))).not.toBe(planKey(wavePlan(b)));
  });
});

describe('endless dizilim: kayıt', () => {
  it('hücreler kaydedilip aynen yüklenir; eski kayıt (hücre yok) otomatik dizilir; bozuk hücre atılır', () => {
    const run = newRun(6, PARTY, AT, undefined, [2, 5, 8, 11]);
    const kv = new MemKV();
    saveRun(kv, run);
    const back = loadRun(kv)!;
    expect(back).toEqual(run);
    expect(wavePlan(back).party).toEqual(wavePlan(run).party);
    const old = { ...run, heroes: run.heroes.map(({ slot: _s, ...h }) => h) };
    const parsed = parseRun(JSON.stringify({ version: 1, run: old }))!;
    expect(heroSlots(parsed.heroes)).toEqual(autoSlots(PARTY));
    const bad = parseRun(JSON.stringify({ version: 1, run: { ...run, heroes: run.heroes.map((h, i) => (i === 0 ? { ...h, slot: 40 } : h)) } }))!;
    expect(bad.heroes[0]!.slot).toBeUndefined();
    expect(heroSlots(bad.heroes)).toEqual(autoSlots(PARTY)); // eksik hücre: tüm takım otomatik
  });
});
