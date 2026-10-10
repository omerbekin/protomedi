import { describe, expect, it } from 'vitest';
import { SAVE_KEY, addItem, memoryKV, migrateSaves, newCampaign, pickHero, readSaves, writeSave } from '../src/campaign';
import { content } from '../src/engine';
import { newRun, parseRun, saveRun, SAVE_VERSION as ENDLESS_SAVE_VERSION, SCORES_VERSION, loadScores, RUN_KEY, SCORES_KEY } from '../src/endless';
import { instanceStats, migrateRollsX2, SCALED_ITEM_STATS } from '../src/progression/items';

// x2 stat ölçeği (Ömer onayı 2026-10-10): eski kayıtlardaki item zarlarının ölçekli statları (STR/DEX/INT/LUCK, zırh, büyü zırhı, hız) x2'ye taşınır;
// diğer zarlar (can, MP, kritik...) aynı kalır. Sefer kaydı sürüm 4, Endless koşu kaydı sürüm 2; skor listesi etkilenmez.

describe('x2 stat ölçeği: veri ve kayıt göçü', () => {
  it('veri: statScale 2, katsayılar yarı, zırh k ve sıra eşiği iki kat', () => {
    const f = content.formulas;
    expect(f.statScale).toBe(2);
    expect(f.armor.k).toBe(60);
    expect(f.turn.threshold).toBe(200);
    expect(f.attributes.hpPerStr).toBe(3);
    expect(f.attributes.mpPerInt).toBe(1);
    expect(f.attributes.dexPerEvasionStep).toBe(10);
    expect(f.scaling).toEqual({ str: 1, dex: 1, int: 1, luck: 1 }); // skill güçleri veride yarıya indi, ölçek çarpanı aynı
  });

  it('migrateRollsX2: yalnızca ölçekli stat zarları x2; iç içe her item örneği; sayı döner', () => {
    const tree = { a: { uid: 'u1', id: 'riveted_mail', rolls: { armor: 2, hp: 3 } }, list: [{ uid: 'u2', id: 'arming_sword', rolls: { str: 1, crit: 1 } }, { uid: 'u3', id: 'turnshoes' }] };
    expect(migrateRollsX2(tree)).toBe(2);
    expect(tree.a.rolls).toEqual({ armor: 4, hp: 3 });
    expect(tree.list[0]!.rolls).toEqual({ str: 2, crit: 1 });
    expect(SCALED_ITEM_STATS).toEqual(['str', 'dex', 'int', 'luck', 'armor', 'magicArmor', 'spd']);
    // göç sonrası zar güncel aralıkta: eskiden ortadaki (katalog) değer olan zar yine katalog değeri
    expect(instanceStats({ id: 'riveted_mail', rolls: tree.a.rolls }).armor).toBe(4);
  });

  it('sefer kaydı v3 -> v4: item zarları x2 (bir kez), geri yazılınca sürüm 4', () => {
    const kv = memoryKV();
    let s = pickHero(newCampaign({ mode: 'normal', seed: 9, campaignId: 'm1' }), 'warrior');
    s = addItem(s, 'riveted_mail').state;
    writeSave(kv, s, 'manual', 't');
    // eski (v3, x1 ölçek) kaydı taklit et: dosya sürümü 3, zarlar eski ölçekte
    const raw = JSON.parse(kv.getItem(SAVE_KEY)!);
    raw.version = 3;
    raw.slots[0].saves[0].state.inventory[0].rolls = { armor: 2, hp: 3 };
    kv.setItem(SAVE_KEY, JSON.stringify(raw));
    const r = readSaves(kv);
    expect(r.migrated).toBe(true);
    expect(r.file.slots[0]!.saves[0]!.state.inventory[0]!.rolls).toEqual({ armor: 4, hp: 3 });
    expect(migrateSaves(kv)).toBe(true);
    expect(JSON.parse(kv.getItem(SAVE_KEY)!).version).toBe(4);
    const again = readSaves(kv);
    expect(again.migrated).toBe(false);
    expect(again.file.slots[0]!.saves[0]!.state.inventory[0]!.rolls).toEqual({ armor: 4, hp: 3 }); // ikinci kez çarpılmaz
  });

  it('Endless koşu kaydı v1 -> v2: zarlar x2, yarım savaş atılır; v2 aynen okunur; skor listesi sürüm 1 kalır', () => {
    expect(ENDLESS_SAVE_VERSION).toBe(2);
    expect(SCORES_VERSION).toBe(1);
    const run = newRun(5, ['warrior', 'mage', 'archer', 'paladin'], '2026-10-10T00:00:00.000Z');
    const legacy = { ...run, bag: [{ uid: 'b1', id: 'riveted_mail', rolls: { armor: 3, hp: 4 } }], suspended: { wave: 1, seed: 1, actions: [], turn: 0, hash: 'x' } };
    const back = parseRun(JSON.stringify({ version: 1, run: legacy }))!;
    expect(back.bag![0]!.rolls).toEqual({ armor: 6, hp: 4 });
    expect(back.suspended).toBeUndefined();
    const kv = memoryKV();
    saveRun(kv, back);
    expect(JSON.parse(kv.getItem(RUN_KEY)!).version).toBe(2);
    expect(parseRun(kv.getItem(RUN_KEY))!.bag![0]!.rolls).toEqual({ armor: 6, hp: 4 }); // v2: göç yok
    kv.setItem(SCORES_KEY, JSON.stringify({ version: 1, scores: [] }));
    expect(loadScores(kv)).toEqual([]);
  });
});
