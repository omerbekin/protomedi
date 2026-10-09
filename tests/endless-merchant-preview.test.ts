import { describe, expect, it } from 'vitest';
import { ENDLESS, RUN_KEY, chooseReward, heroSlots, autoSlots, loadRun, merchantEntry, newRun, parseRun, previewRun, saveRun, type EndlessRun, type KV } from '../src/endless';

// Tüccar kısayolu (?merchant=1 / debug > Open merchant; Ömer 2026-10-10): gerçek koşu kampta bekliyorsa onda tüccar; yoksa atılır önizleme
// koşusu. Önizleme ASLA kaydedilmez (gerçek kaydı ezmez / silmez) ve skor listesine girmez.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const AT = '2026-10-10T00:00:00.000Z';

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

describe('tüccar önizleme koşusu', () => {
  it('otomatik takım + otomatik dizilim, orta dalga, altın, torbada item, tüccar açık, önizleme işaretli', () => {
    const p = ENDLESS.merchantPreview;
    const run = previewRun(9, ENDLESS, undefined, AT);
    expect(run.preview).toBe(true);
    expect(run.phase).toBe('shop');
    expect(run.shop!.length).toBeGreaterThan(0);
    expect(run.heroes).toHaveLength(ENDLESS.partySize);
    expect(heroSlots(run.heroes)).toEqual(autoSlots(run.heroes.map((h) => h.class)));
    expect(run.stats.cleared).toBe(p.wave);
    expect(run.wave).toBe(p.wave + 1);
    expect(run.gold).toBe(p.gold);
    expect(run.bag).toHaveLength(p.bagItems);
    expect(new Set(run.bag!.map((i) => i.id)).size).toBe(p.bagItems);
    expect(previewRun(9, ENDLESS, undefined, AT)).toEqual(run); // seed'li
  });

  it('önizleme koşusu kaydedilmez: gerçek kayıt ne ezilir ne silinir (koşu bitse de)', () => {
    const kv = new MemKV();
    const real = newRun(1, PARTY, AT);
    saveRun(kv, real);
    const before = kv.getItem(RUN_KEY);
    const prev = previewRun(2);
    expect(saveRun(kv, prev)).toBe(false);
    expect(saveRun(kv, { ...prev, phase: 'over', end: 'abandoned' })).toBe(false); // bitmiş önizleme kaydı silmez
    expect(kv.getItem(RUN_KEY)).toBe(before);
    expect(loadRun(kv)).toEqual(real);
    // elle yazılmış bir önizleme kaydı bile yüklenmez
    expect(parseRun(JSON.stringify({ version: 1, run: prev }))).toBeNull();
  });

  it('merchantEntry: kayıt yoksa önizleme (kaydetme yok); kampta bekleyen gerçek koşuda tüccar (kaydedilir); tüccardaysa aynen', () => {
    const none = merchantEntry(null, 5);
    expect(none.save).toBe(false);
    expect(none.run.preview).toBe(true);
    const camp: EndlessRun = { ...newRun(3, PARTY, AT), wave: 6, stats: { cleared: 5, turns: 0, kills: 0 } };
    const e = merchantEntry(camp, 5);
    expect(e.save).toBe(true);
    expect(e.run.preview).toBeUndefined();
    expect(e.run.phase).toBe('shop');
    expect(e.run.heroes).toEqual(camp.heroes);
    const again = merchantEntry(e.run, 5);
    expect(again).toEqual({ run: e.run, save: false });
  });

  it('merchantEntry: ödül seçimi ya da yarım savaş varken gerçek koşuya dokunmaz, önizleme açar', () => {
    const reward: EndlessRun = { ...newRun(4, PARTY, AT), wave: 2, phase: 'reward', stats: { cleared: 1, turns: 0, kills: 0 }, offer: [{ kind: 'gold', amount: 5 }] };
    const e = merchantEntry(reward, 6);
    expect(e.save).toBe(false);
    expect(e.run.preview).toBe(true);
    expect(chooseReward(reward, 0).phase).not.toBe('shop'); // gerçek koşu aynen duruyor
    const susp: EndlessRun = { ...newRun(4, PARTY, AT), suspended: { wave: 1, seed: 1, actions: [], turn: 0, hash: '' } };
    expect(merchantEntry(susp, 6).run.preview).toBe(true);
  });
});
