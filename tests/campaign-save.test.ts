import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  SAVE_KEY,
  SLOT_COUNT,
  autoResolve,
  battlePlan,
  canSaveManually,
  claimSlot,
  deleteSave,
  deleteSlot,
  latestSave,
  listSaves,
  markPlayed,
  memoryKV,
  migrateSaves,
  newCampaign,
  pickHero,
  readSaves,
  saveCount,
  slotSummaries,
  willReplaceOldest,
  wipeSaves,
  writeSave,
  type CampaignMode,
  type Difficulty,
} from '../src/campaign';

const start = (mode: CampaignMode, seed = 10, slot = 0, difficulty: Difficulty = 'medium') =>
  autoResolve(pickHero(newCampaign({ mode, seed, slot, difficulty, campaignId: `c${seed}` }), 'archer'));

describe('sefer kaydı: 3 yuva, yuva başına kayıtlar', () => {
  it('3 yuva; Normal yuvada en fazla 5 kayıt, en eskisi silinir; en yeni üstte; elle kayıt serbest', () => {
    expect(SLOT_COUNT).toBe(3);
    const kv = memoryKV();
    const s = start('normal');
    expect(canSaveManually(s)).toBe(true);
    for (let i = 0; i < 5; i++) expect(writeSave(kv, s, i % 2 ? 'manual' : 'auto', `2026-10-07T10:0${i}:00Z`).replaced).toEqual([]);
    expect(saveCount(kv, 0)).toBe(5);
    expect(willReplaceOldest(kv, 0, 'normal')).toBe(true);
    const r = writeSave(kv, s, 'auto', '2026-10-07T10:09:00Z');
    expect(r.replaced.map((e) => e.savedAt)).toEqual(['2026-10-07T10:00:00Z']);
    const list = listSaves(kv, 0);
    expect(list).toHaveLength(5);
    expect(list[0]!.savedAt).toBe('2026-10-07T10:09:00Z');
    expect(list[0]!.summary).toMatchObject({ map: 'VALDORIA', stop: 1, stops: 12, node: 'Mill Road', classes: ['archer'] });
  });

  it('her yuvanın kendi listesi var: bir yuvanın 5 sınırı diğerini etkilemez; Ironman yuvası tek kayıt', () => {
    const kv = memoryKV();
    const a = start('normal', 1, 0);
    const b = start('ironman', 2, 1, 'hard');
    const c = start('normal', 3, 2, 'easy');
    for (let i = 0; i < 7; i++) writeSave(kv, a, 'auto');
    expect(writeSave(kv, b, 'manual').ok).toBe(false);
    expect(writeSave(kv, b, 'start').ok).toBe(false);
    writeSave(kv, b, 'auto', '2026-10-07T10:00:00Z');
    writeSave(kv, b, 'auto', '2026-10-07T11:00:00Z');
    writeSave(kv, c, 'manual');
    expect([saveCount(kv, 0), saveCount(kv, 1), saveCount(kv, 2)]).toEqual([5, 1, 1]);
    expect(latestSave(kv, 1)!.savedAt).toBe('2026-10-07T11:00:00Z');
    const sums = slotSummaries(kv);
    expect(sums.map((x) => x && [x.mode, x.difficulty])).toEqual([
      ['normal', 'medium'],
      ['ironman', 'hard'],
      ['normal', 'easy'],
    ]);
  });

  it('Continue = en son oynanan yuvanın en yeni kaydı; yükleme durumu aynen geri verir', () => {
    const kv = memoryKV();
    const a = start('normal', 1, 0);
    const b = start('normal', 2, 2);
    writeSave(kv, a, 'auto', '2026-10-07T10:00:00Z');
    writeSave(kv, b, 'auto', '2026-10-07T11:00:00Z');
    expect(latestSave(kv)!.state).toEqual(b);
    markPlayed(kv, 0, '2026-10-07T12:00:00Z');
    expect(latestSave(kv)!.state).toEqual(a);
    expect(latestSave(kv, 2)!.state.slot).toBe(2);
  });

  it('yeni sefer yuvayı alır (eski sefer ve kayıtları silinir); kayıt silme ve yuva silme', () => {
    const kv = memoryKV();
    const a = start('normal', 1, 1);
    writeSave(kv, a, 'auto');
    writeSave(kv, a, 'manual');
    const fresh = newCampaign({ mode: 'ironman', seed: 9, slot: 1, difficulty: 'easy', campaignId: 'new' });
    claimSlot(kv, fresh);
    expect(slotSummaries(kv)[1]).toMatchObject({ campaignId: 'new', mode: 'ironman', difficulty: 'easy', saveCount: 0, latest: null });
    const b = start('normal', 4, 0);
    const e1 = writeSave(kv, b, 'auto').entry!;
    writeSave(kv, b, 'auto');
    deleteSave(kv, 0, e1.id);
    expect(saveCount(kv, 0)).toBe(1);
    deleteSlot(kv, 0);
    expect(slotSummaries(kv)[0]).toBeNull();
    wipeSaves(kv);
    expect(slotSummaries(kv)).toEqual([null, null, null]);
  });

  it('zorluk sefer boyunca sabit: kayıtta saklanır, savaş kurulumuna yapay zeka değeri olarak gider', () => {
    const kv = memoryKV();
    const s = start('normal', 5, 0, 'hard');
    writeSave(kv, s, 'auto');
    expect(latestSave(kv)!.state.difficulty).toBe('hard');
    expect(battlePlan(pickHero(newCampaign({ mode: 'normal', seed: 5, difficulty: 'easy' }), 'mage')).difficulty).toBe(CONFIG.difficulties.easy.ai);
    expect(newCampaign({ mode: 'normal', seed: 1 }).difficulty).toBe(CONFIG.defaultDifficulty);
    expect(Object.keys(CONFIG.difficulties)).toEqual(['easy', 'medium', 'hard']);
  });

  it('eski sürüm (tek liste) bozulmadan yuvalara taşınır: en yeni sefer Slot 1, zorluk Medium', () => {
    const kv = memoryKV();
    const old = (seed: number, id: string, savedAt: string) => {
      const st = start('normal', seed) as unknown as Record<string, unknown>;
      delete st.difficulty;
      delete st.slot;
      return { id, kind: 'auto', savedAt, mode: 'normal', campaignId: `c${seed}`, summary: {}, state: st };
    };
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 1, counter: 5, saves: [old(3, 's0', 't0'), old(1, 's1', 't1'), old(2, 's2', 't2'), old(1, 's3', 't3')] }));
    const r = readSaves(kv);
    expect(r.migrated).toBe(true);
    expect(r.file.slots[0]!.campaignId).toBe('c1');
    expect(r.file.slots[0]!.saves.map((e) => e.id)).toEqual(['s1', 's3']);
    expect(r.file.slots[1]!.campaignId).toBe('c2');
    expect(r.file.slots[0]!.saves[0]!.state).toMatchObject({ difficulty: 'medium', slot: 0 });
    expect(r.file.slots[1]!.saves[0]!.state.slot).toBe(1);
    expect(r.file.slots[2]!.campaignId).toBe('c3'); // en eski sefer son yuvada
    expect(migrateSaves(kv)).toBe(true);
    expect(JSON.parse(kv.getItem(SAVE_KEY)!).version).toBe(2);
    expect(latestSave(kv)!.id).toBe('s3');
  });

  it('bozuk kayıt çökertmez: okunamayan dosya boş sayılır, geçersiz tek kayıt atlanır, depolama hatası yutulur', () => {
    const kv = memoryKV();
    kv.setItem(SAVE_KEY, '{not json');
    expect(readSaves(kv)).toMatchObject({ corrupt: true });
    expect(latestSave(kv)).toBeNull();
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 99, slots: [] }));
    expect(readSaves(kv).corrupt).toBe(true);
    const good = start('normal');
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 2, counter: 2, lastSlot: 0, slots: [{ campaignId: good.campaignId, mode: 'normal', difficulty: 'medium', startedAt: 'x', lastPlayed: 'x', saves: [{ id: 'x', state: { version: 1, at: 'nowhere' } }, { id: 'y', kind: 'auto', mode: 'normal', state: good, summary: {} }] }, 'junk', null] }));
    const r = readSaves(kv);
    expect(r.corrupt).toBe(true);
    expect(r.file.slots[0]!.saves.map((e) => e.id)).toEqual(['y']);
    expect(r.file.slots[1]).toBeNull();
    writeSave(kv, good, 'auto');
    expect(readSaves(kv).corrupt).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(readSaves(broken).corrupt).toBe(true);
    expect(writeSave(broken, good, 'auto').ok).toBe(false);
    expect(() => wipeSaves(broken)).not.toThrow();
    expect(readSaves(null).file.slots).toEqual([null, null, null]);
  });
});
