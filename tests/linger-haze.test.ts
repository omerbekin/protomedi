import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { HAZE_MIN_LIFE_MS, HazeTracker, hazeStatuses } from '../src/game/linger-haze';

// Smoke Bomb'un kalıcı pusu: etki (Blinded/Shrouded) sürdükçe kalır, son taşıyıcıdan da düşünce biter.
describe('linger haze (Smoke Bomb)', () => {
  const statuses = hazeStatuses(content.skills['smoke_bomb'], 'smoke_bomb');

  it('smoke_bomb leaves a haze tied to its own statuses; other skills do not', () => {
    expect(statuses?.sort()).toEqual(['blinded', 'shrouded']);
    expect(hazeStatuses(content.skills['meteor'], 'meteor')).toBeNull();
  });

  it('lasts while any bound unit still carries the status, then ends', () => {
    const t = new HazeTracker();
    const h = t.cast({ skill: 'smoke_bomb', board: 'enemy', cells: [0, 1, 3, 4], targets: ['a', 'b'] }, statuses, 0)!;
    expect(h).toBeTruthy();
    const has = new Set(['a', 'b']);
    const holds = (uid: string) => has.has(uid);
    expect(t.reconcile(holds, HAZE_MIN_LIFE_MS + 10)).toEqual([]);
    has.delete('a');
    expect(t.reconcile(holds, HAZE_MIN_LIFE_MS + 20)).toEqual([]);
    has.delete('b');
    expect(t.reconcile(holds, HAZE_MIN_LIFE_MS + 30)).toEqual([h.id]);
    expect(t.list).toHaveLength(0);
  });

  it('an empty-area cast still lingers briefly, then fades', () => {
    const t = new HazeTracker();
    const h = t.cast({ skill: 'smoke_bomb', board: 'party', cells: [6, 7], targets: [] }, statuses, 1000)!;
    expect(t.reconcile(() => false, 1000 + HAZE_MIN_LIFE_MS - 1)).toEqual([]);
    expect(t.reconcile(() => false, 1000 + HAZE_MIN_LIFE_MS)).toEqual([h.id]);
  });

  it('a re-cast takes over the units of an older haze (the old one fades)', () => {
    const t = new HazeTracker();
    const old = t.cast({ skill: 'smoke_bomb', board: 'enemy', cells: [0, 1], targets: ['a'] }, statuses, 0)!;
    const neu = t.cast({ skill: 'smoke_bomb', board: 'enemy', cells: [3, 4], targets: ['a'] }, statuses, 100)!;
    expect(t.reconcile(() => true, HAZE_MIN_LIFE_MS + 50)).toEqual([old.id]);
    expect(t.list.map((x) => x.id)).toEqual([neu.id]);
  });

  it('no haze without cells/board', () => {
    expect(new HazeTracker().cast({ skill: 'smoke_bomb', targets: ['a'] }, statuses, 0)).toBeNull();
  });
});
