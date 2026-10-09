import { describe, expect, it } from 'vitest';
import {
  ENDLESS,
  bagOf,
  chooseReward,
  discardFromBag,
  endlessBagSize,
  equipBestRun,
  equipFromBag,
  loadRun,
  newRun,
  parseRun,
  planKey,
  saveRun,
  unequipToBag,
  wavePlan,
  withSuspended,
  waveSeed,
  type EndlessRun,
  type KV,
} from '../src/endless';
import { BAG_SIZE, ITEMS, canEquip, itemDef, loadoutSetup } from '../src/progression';
import { endlessGearSource } from '../src/game/endless-gear';
import { campaignGearSource } from '../src/ui/gear-screen';
import { addItem, equipItem, newCampaign, pickHero, type CampaignState } from '../src/campaign';

// Endless torba modeli (Ömer 2026-10-09): ödül / dükkân item'leri torbaya girer, kampta Gear ekranında istenen kahramana takılır.

const PARTY = ['warrior', 'archer', 'mage', 'druid'];
const fresh = (): EndlessRun => newRun(41, PARTY, '2026-10-09T00:00:00.000Z');
const withBag = (run: EndlessRun, ids: string[]): EndlessRun => ({ ...run, bag: ids.map((id, i) => ({ uid: `b${i}`, id })), nextItem: ids.length + 1 });
const weaponFor = (cls: string) => ITEMS.items.find((d) => d.slot === 'weapon' && canEquip(cls, d))!;
const weaponNotFor = (cls: string) => ITEMS.items.find((d) => d.slot === 'weapon' && !canEquip(cls, d))!;
const armorItems = ITEMS.items.filter((d) => d.slot === 'armor');

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

describe('endless torbası', () => {
  it('torba boyutu veriden (30, seferle aynı)', () => {
    expect(ENDLESS.bagSize).toBe(30);
    expect(endlessBagSize()).toBe(BAG_SIZE);
  });

  it('takma: torbadan kahramana; yuvadaki eski item torbaya aynı yere döner; güç katmanına girer', () => {
    const [a1, a2] = armorItems;
    let r = withBag(fresh(), [a1!.id, a2!.id]);
    r = equipFromBag(r, 'h1', 'b0');
    expect(r.heroes[0]!.equipment.armor?.id).toBe(a1!.id);
    expect(bagOf(r).map((i) => i.id)).toEqual([a2!.id]);
    r = equipFromBag(r, 'h1', 'b1');
    expect(r.heroes[0]!.equipment.armor?.id).toBe(a2!.id);
    expect(bagOf(r).map((i) => i.id)).toEqual([a1!.id]); // yer değiştirme
    expect(wavePlan(r).units.party[wavePlan(r).party.indexOf('warrior')]?.modifiers).toEqual(loadoutSetup(r.heroes[0]!).modifiers);
  });

  it('silah ailesi kuralı seferle aynı; bilinmeyen item / kahraman hata verir', () => {
    const bad = weaponNotFor('warrior');
    const r = withBag(fresh(), [bad.id]);
    expect(() => equipFromBag(r, 'h1', 'b0')).toThrow(/cannot use/);
    expect(() => equipFromBag(r, 'h1', 'nope')).toThrow(/not in the bag/);
    expect(() => equipFromBag(r, 'zz', 'b0')).toThrow(/Unknown hero/);
  });

  it('çıkarma, kahramanlar arası takas (torba üzerinden), atma; torba doluyken çıkarılamaz', () => {
    const helm = ITEMS.items.find((d) => d.slot === 'helm')!;
    let r = equipFromBag(withBag(fresh(), [helm.id]), 'h1', 'b0');
    r = unequipToBag(r, 'h1', 'helm');
    expect(r.heroes[0]!.equipment.helm).toBeFalsy();
    r = equipFromBag(r, 'h3', bagOf(r)[0]!.uid); // başka kahramana
    expect(r.heroes[2]!.equipment.helm?.id).toBe(helm.id);
    const full = { ...r, bag: Array.from({ length: 30 }, (_, i) => ({ uid: `f${i}`, id: helm.id })) };
    expect(() => unequipToBag(full, 'h3', 'helm')).toThrow(/Bag is full/);
    const d = discardFromBag(full, 'f0');
    expect(bagOf(d)).toHaveLength(29);
    expect(() => discardFromBag(d, 'f0')).toThrow();
  });

  it('Equip best: kullanılabilir en iyi item\'leri takar, silah ailesine uyar', () => {
    const wW = weaponFor('warrior');
    const wM = weaponFor('mage');
    let r = withBag(fresh(), [wW.id, wM.id, ...armorItems.slice(0, 2).map((d) => d.id)]);
    r = equipBestRun(r);
    expect(r.heroes[0]!.equipment.weapon?.id).toBe(wW.id);
    expect(r.heroes[2]!.equipment.weapon && canEquip('mage', itemDef(r.heroes[2]!.equipment.weapon.id)!)).toBe(true);
    for (const h of r.heroes) for (const inst of Object.values(h.equipment)) if (inst) expect(canEquip(h.class, itemDef(inst.id)!)).toBe(true);
    expect(bagOf(r).length).toBeLessThan(4);
  });

  it('yarım savaş varken ve kalıntı seçiminde kuşanma kilitli (devam eden savaşın kurulumu değişmez)', () => {
    const helm = ITEMS.items.find((d) => d.slot === 'helm')!;
    const r = withBag(fresh(), [helm.id]);
    const susp = withSuspended(r, { wave: 1, seed: waveSeed(r.seed, 1), actions: [], turn: 0, hash: 'x', setup: planKey(wavePlan(r)) });
    expect(() => equipFromBag(susp, 'h1', 'b0')).toThrow(/suspended battle/);
    expect(() => equipBestRun(susp)).toThrow();
    expect(() => equipFromBag({ ...r, phase: 'relic', relicOffer: ['iron_oath'] }, 'h1', 'b0')).toThrow(/relic/);
    // kilit yokken kurulum değişir (parmak izi de): devam eden savaş olmadığı için sorun değil
    expect(planKey(wavePlan(equipFromBag(r, 'h1', 'b0')))).not.toBe(planKey(wavePlan(r)));
  });

  it('kayıt: torba gidip gelir; torbasız eski kayıt yüklenir, takılı item\'ler takılı kalır', () => {
    const kv = new MemKV();
    const helm = ITEMS.items.find((d) => d.slot === 'helm')!;
    const r = withBag(fresh(), [helm.id]);
    saveRun(kv, r);
    expect(loadRun(kv)!.bag).toEqual(r.bag);
    const legacy = { ...fresh(), heroes: fresh().heroes.map((h, i) => (i === 0 ? { ...h, equipment: { helm: { uid: 'e1', id: helm.id } } } : h)) } as EndlessRun;
    delete (legacy as { bag?: unknown }).bag;
    const back = parseRun(JSON.stringify({ version: 1, run: legacy }))!;
    expect(back).not.toBeNull();
    expect(bagOf(back)).toEqual([]);
    expect(back.heroes[0]!.equipment.helm?.id).toBe(helm.id);
    // bozuk torba satırları atılır, koşu bozulmaz
    const dirty = parseRun(JSON.stringify({ version: 1, run: { ...r, bag: [{ uid: 'ok', id: helm.id }, null, { nope: 1 }] } }))!;
    expect(dirty.bag).toEqual([{ uid: 'ok', id: helm.id }]);
  });

  it('ödül item kartı torbaya koyar; sonra Gear ile takılır', () => {
    const d = ITEMS.items.find((x) => x.slot === 'boots')!;
    const run = { ...fresh(), wave: 2, phase: 'reward' as const, stats: { cleared: 1, turns: 0, kills: 0 }, offer: [{ kind: 'item' as const, itemId: d.id, heroId: 'h2' }] };
    let r = chooseReward(run, 0);
    expect(r.heroes.every((h) => !h.equipment.boots)).toBe(true);
    r = equipFromBag(r, 'h4', bagOf(r)[0]!.uid);
    expect(r.heroes[3]!.equipment.boots?.id).toBe(d.id);
  });
});

describe('Gear ekranı kaynağı (adaptör)', () => {
  it('endless kaynağı: kahramanlar 6 yuvalı, işlemler koşuya yazılır', () => {
    const helm = ITEMS.items.find((d) => d.slot === 'helm')!;
    let run = withBag(fresh(), [helm.id]);
    const src = endlessGearSource(() => run, (r) => (run = r));
    expect(src.bagSize).toBe(30);
    expect(src.heroes()).toHaveLength(4);
    expect(Object.keys(src.heroes()[0]!.equipment).sort()).toEqual(['armor', 'boots', 'gloves', 'helm', 'trinket', 'weapon']);
    src.equip('h2', 'b0');
    expect(run.heroes[1]!.equipment.helm?.id).toBe(helm.id);
    src.unequip('h2', 'helm');
    expect(bagOf(run)).toHaveLength(1);
    src.discard(bagOf(run)[0]!.uid);
    expect(bagOf(run)).toHaveLength(0);
    expect(() => src.equip('h1', 'nope')).toThrow();
  });

  it('sefer kaynağı: eski davranışla birebir (equipItem ile aynı durum)', () => {
    let s: CampaignState = pickHero(newCampaign({ mode: 'normal', seed: 3 }), 'warrior');
    const helm = ITEMS.items.find((d) => d.slot === 'helm')!;
    const added = addItem(s, helm.id);
    s = added.state;
    const heroId = s.active.find(Boolean)!;
    const expected = equipItem(s, heroId, added.item.uid);
    let got = s;
    const src = campaignGearSource(() => got, (x) => (got = x));
    src.equip(heroId, added.item.uid);
    expect(got).toEqual(expected);
    expect(src.bagSize).toBe(BAG_SIZE);
    expect(src.heroes()[0]!.id).toBe(heroId);
  });
});
