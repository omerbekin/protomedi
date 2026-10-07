import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import type { Attribute } from '../src/engine';

// KURAL (docs/design/combat.md > "Hasar ölçekleme kuralı"): tüm hasarlar, aksi açıkça belirtilmedikçe,
// skill'in kendi statıyla (effect.scale) ölçeklenir ve bir skill'in tüm ölçekli etkileri aynı statı kullanır.
// Aksi belirtilen (ölçeksiz) hasar benzeri etkiler AÇIKÇA burada gerekçeyle listelenir.
const SCALE_EXCEPTIONS: { skill: string; effect: string; reason: string }[] = [
  { skill: 'abyssal_cry', effect: 'selfDamage', reason: 'Kullanıcının maks canının yüzdesi (bedel); stat ile ölçeklenmez.' },
  { skill: 'mana_burn', effect: 'manaBurn', reason: 'Sabit MP yakma/çalma; can hasarı değil, kaynak etkisi.' },
  { skill: 'drain_field', effect: 'manaBurn', reason: 'Sabit MP yakma; can hasarı değil, kaynak etkisi.' },
];

// Ölçek alanı taşıması gereken hasar türü etkiler; ölçeksiz hasar benzerleri istisna listesinde olmalı.
const DAMAGE_LIKE = new Set(['damage', 'ground', 'selfDamage', 'manaBurn']);
const isException = (skill: string, type: string) => SCALE_EXCEPTIONS.some((x) => x.skill === skill && x.effect === type);
const scaleOf = (e: unknown): Attribute | undefined => (e as { scale?: Attribute }).scale;

describe('hasar ölçekleme kuralı (veri)', () => {
  it('her hasar/yer etkisi bir scale taşır; ölçeksiz hasar benzerleri yalnızca bilinen istisnalardadır', () => {
    for (const [id, skill] of Object.entries(content.skills)) {
      for (const e of skill.effects) {
        if (!DAMAGE_LIKE.has(e.type)) continue;
        if (scaleOf(e) === undefined) expect(isException(id, e.type), `${id}: ${e.type} ölçeksiz ve istisna listesinde yok`).toBe(true);
        else expect(isException(id, e.type), `${id}: ${e.type} ölçekli ama istisna listesinde`).toBe(false);
      }
    }
  });

  it('istisna listesindeki her giriş gerçek bir skill etkisine karşılık gelir (bayat giriş yok)', () => {
    for (const x of SCALE_EXCEPTIONS) {
      const skill = content.skills[x.skill];
      expect(skill, x.skill).toBeDefined();
      expect(skill!.effects.some((e) => e.type === x.effect), `${x.skill}:${x.effect}`).toBe(true);
      expect(x.reason.length).toBeGreaterThan(0);
    }
  });

  it('bir skill\'in tüm ölçekli etkileri (hasar, yer etkisi, şifa, kalkan) aynı statı kullanır', () => {
    for (const [id, skill] of Object.entries(content.skills)) {
      const scales = skill.effects.map(scaleOf).filter((s): s is Attribute => s !== undefined);
      expect(new Set(scales).size, `${id}: karışık stat ${[...new Set(scales)].join('/')}`).toBeLessThanOrEqual(1);
    }
  });

  it('çağrılan birimlerin hasar skill\'i, biriminin kendi en yüksek statıyla ölçeklenir', () => {
    for (const [uid, unit] of Object.entries(content.summons)) {
      const a = unit.attributes;
      const top = (Object.keys(a) as Attribute[]).reduce((m, k) => (a[k] > a[m] ? k : m));
      for (const sid of unit.skills) {
        for (const e of content.skills[sid]!.effects) {
          if (e.type === 'damage' || e.type === 'ground') expect(scaleOf(e), `${uid}:${sid}`).toBe(top);
        }
      }
    }
  });
});
