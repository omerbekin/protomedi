import { describe, expect, it } from 'vitest';
import { autoSlots, draftClassAt, emptyDraft, newDraft, placeInDraft, removeFromDraft, validSlots, type FormationDraft } from '../src/endless';

// Takım seçimi + dizilim tek ekranda (Ömer 2026-10-10): kadrodan ızgaraya sürükle, hücreler arası taşı / yer değiştir, kadroya geri sürükle
// = çıkar; dokunma önerilen hücreye ekler; takım sınırı korunur.

const SIZE = 4;
const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const ok = (d: FormationDraft) => validSlots(d.slots, d.classes.length) && d.classes.length === new Set(d.classes).size;

describe('takım seçimi dizilim taslağı', () => {
  it('dokunarak ekleme: otomatik dizilimin önerdiği hücreler', () => {
    let d = emptyDraft();
    for (const c of PARTY) d = placeInDraft(d, c, SIZE);
    expect(d.classes).toEqual(PARTY);
    expect(ok(d)).toBe(true);
    expect(d.slots[0]).toBe(autoSlots(['warrior'])[0]);
  });

  it('boş hücreye bırakma o hücreye koyar; dolu hücreye bırakma (takım dolu değil) oradakini en yakın boşa kaydırır', () => {
    let d = placeInDraft(emptyDraft(), 'mage', SIZE, 11);
    expect(draftClassAt(d, 11)).toBe('mage');
    d = placeInDraft(d, 'warrior', SIZE, 11);
    expect(draftClassAt(d, 11)).toBe('warrior');
    expect(d.classes).toContain('mage');
    expect(ok(d)).toBe(true);
  });

  it('takım dolu: boş hücreye / dokunmayla ekleme olmaz, dolu hücreye bırakma oradakinin yerine geçer', () => {
    const d = newDraft(PARTY);
    const free = [...Array(12).keys()].find((c) => !d.slots.includes(c))!;
    expect(placeInDraft(d, 'hexer', SIZE)).toBe(d);
    expect(placeInDraft(d, 'hexer', SIZE, free)).toBe(d);
    const r = placeInDraft(d, 'hexer', SIZE, d.slots[1]!);
    expect(r.classes).toEqual(['warrior', 'hexer', 'mage', 'druid']);
    expect(r.slots).toEqual(d.slots);
  });

  it('takımdaki class: hücreye bırakma taşır / yer değiştirir; çıkarma sırayı korur', () => {
    const d = newDraft(PARTY);
    const m = placeInDraft(d, 'warrior', SIZE, d.slots[3]!);
    expect(m.slots[0]).toBe(d.slots[3]);
    expect(m.slots[3]).toBe(d.slots[0]);
    expect(placeInDraft(d, 'warrior', SIZE)).toBe(d);
    const r = removeFromDraft(d, 'archer');
    expect(r.classes).toEqual(['warrior', 'mage', 'druid']);
    expect(r.slots).toEqual([d.slots[0], d.slots[2], d.slots[3]]);
    expect(removeFromDraft(r, 'archer')).toBe(r);
  });

  it('geçersiz class / hücre değiştirmez', () => {
    const d = newDraft(PARTY.slice(0, 2));
    expect(placeInDraft(d, 'nope', SIZE)).toBe(d);
    expect(placeInDraft(d, 'mage', SIZE, 12)).toBe(d);
    expect(placeInDraft(d, 'mage', SIZE, -1)).toBe(d);
  });
});
