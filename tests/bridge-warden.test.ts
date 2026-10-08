import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { BattleEvent, BattleMode, Combatant, Teams } from '../src/engine';
import { ENCOUNTERS, validateEncounters } from '../src/campaign';

// The Bridge Warden (King's Bridge boss; docs/design/bosses/bridge-warden.md, M1-M14): telgraf, adalet kuralı, Iron Mooring (inert, zırh, Stagger, iptal),
// fazlar ve faz kilidi, Fall of King's Bridge + Keystone, Chain Hook çekmesi, Ash Brand + dispel, Unyielding, Overextended, YZ kaçışı, determinizm.

const W = content.bosses.bridge_warden!;
const M = content.bosses.iron_mooring!;
const S = content.skills;
const cells = (units: Record<number, string>): string[] => Array.from({ length: content.CELL_COUNT }, (_, i) => units[i] ?? '');
const TEAMS: Teams = {
  party: cells({ 0: 'warrior', 3: 'mage', 5: 'paladin', 7: 'archer' }),
  enemies: cells({ 1: 'bridge_warden', 3: 'iron_mooring', 5: 'iron_mooring' }),
  units: { enemies: { 1: { tier: 'boss', displayName: 'The Bridge Warden', modifiers: { actionsPerTurn: 2 } } } },
};
const make = (seed = 3, mode: BattleMode = 'turns', teams: Teams = TEAMS) => new Battle(content.battleSetup(content.DEFAULT_BATTLE, seed, mode, teams, false));
const warden = (b: Battle) => b.combatants.find((c) => c.defId === 'bridge_warden')!;
const moorings = (b: Battle) => b.combatants.filter((c) => c.defId === 'iron_mooring');
/** Sıra Warden'a gelene kadar diğerleri pas geçer (durum değiştirmeden). */
function toWarden(b: Battle): void {
  for (let i = 0; i < 60 && b.currentUid !== warden(b).uid && !b.winner; i++) expect(b.skipTurn().ok).toBe(true);
  expect(b.currentUid).toBe(warden(b).uid);
}
const since = (b: Battle, n: number): BattleEvent[] => b.log.slice(n);
const hpAt = (c: Combatant, at: number) => Math.round(c.maxHp * at);

describe('veri ve karşılaşma (M1)', () => {
  it('boss tanımları gizli: rastgele havuz, takım seçimi ve class listesi dışında; King\'s Bridge = Warden + 2 Mooring', () => {
    expect(content.randomPool).not.toContain('bridge_warden');
    expect(content.selectableClasses).not.toContain('bridge_warden');
    expect(content.classes.bridge_warden).toBeUndefined();
    expect(M.inert).toBe(true);
    expect(validateEncounters()).toEqual([]);
    const enc = ENCOUNTERS.bridge_warden!;
    expect(enc.units.map((u) => [u.class, u.slot])).toEqual([['bridge_warden', 1], ['iron_mooring', 3], ['iron_mooring', 5]]);
    for (const id of ['anchor_smash', 'breaking_span', 'chain_hook', 'ash_brand', 'fall_of_kings_bridge']) expect(W.skills).toContain(id);
    // Ömer: kamp yok -> can belgedeki 480'in %10 eksiği
    expect(W.stats.hp).toBe(432);
  });

  it('Iron Mooring sıra almaz, şifa/kalkan almaz; Warden her canlı Mooring için zırh ekler (Anchored)', () => {
    const b = make();
    const w = warden(b);
    expect(b.turnQueue(30)).not.toContain(moorings(b)[0]!.uid);
    const a = W.boss!.anchor!;
    expect(b.effectiveStats(w).armor).toBe(w.stats.armor + 2 * a.armorAdd);
    expect(b.effectiveStats(w).magicArmor).toBe(w.stats.magicArmor + 2 * a.magicArmorAdd);
    expect(w.statuses.find((s) => s.kind === 'anchored')?.stacks).toBe(2);
  });
});

describe('telgraf: Breaking Span (M2, M3)', () => {
  it('kullanılınca hasar gelmez; Warden\'ın SONRAKİ tur başında işaretli hücrelere çözülür, zemin + Overextended', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    const n = b.log.length;
    expect(b.useSkill(w.uid, 'breaking_span', undefined, 3).ok).toBe(true); // party tahtası sıra 1 (yuva 3,4,5): Mage + Paladin
    const ev = since(b, n);
    expect(ev.some((e) => e.type === 'damage' && e.source === w.uid)).toBe(false);
    const tg = ev.find((e) => e.type === 'telegraph')!;
    expect(tg).toMatchObject({ skill: 'breaking_span', kind: 'area', board: 'party', cells: [3, 4, 5] });
    expect(b.telegraphs).toHaveLength(1);
    // aynı turda ikinci telgraf yok, ikinci alan telgrafı da yok
    expect(b.canUse(w.uid, 'breaking_span')).toMatchObject({ ok: false });
    const mage = b.get('party-1')!;
    const pal = b.get('party-2')!;
    const hp = [mage.hp, pal.hp];
    b.skipTurn(); // Warden'ın ikinci eylemi
    const m2 = b.log.length;
    toWarden(b);
    const res = since(b, m2);
    const r = res.find((e) => e.type === 'telegraphResolve')!;
    expect(r).toMatchObject({ skill: 'breaking_span' });
    expect((r as { hit: string[] }).hit.sort()).toEqual([mage.uid, pal.uid].sort());
    // çözülme Warden'ın turnStart'ından ÖNCE
    const iRes = res.indexOf(r);
    const iTurn = res.findIndex((e) => e.type === 'turnStart' && e.actor === w.uid);
    expect(iRes).toBeLessThan(iTurn);
    expect(mage.hp).toBeLessThan(hp[0]!);
    expect(pal.hp).toBeLessThan(hp[1]!);
    expect(b.ground.some((g) => g.ground === 'flooded_planks' && g.board === 'party')).toBe(true);
    expect(w.statuses.some((s) => s.kind === 'overextended')).toBe(true);
    expect(b.damageTakenMult(w)).toBeCloseTo(content.statuses.overextended!.damageTakenMult!, 5);
  });

  it('kaçan birim vurulmaz (avoided); çözülme isabet zarı atmaz', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    b.useSkill(w.uid, 'breaking_span', undefined, 3);
    b.skipTurn(); // Warden'ın ikinci eylemi
    // Mage kendi turunda işaretli sıradan çıkar
    for (let i = 0; i < 20 && b.currentUid !== 'party-1'; i++) b.skipTurn();
    expect(b.act('party-1', { kind: 'global', id: 'move_tile', slot: 6 }).ok).toBe(true);
    const n = b.log.length;
    toWarden(b);
    const r = since(b, n).find((e) => e.type === 'telegraphResolve') as { hit: string[]; avoided: string[] };
    expect(r.avoided).toContain('party-1');
    expect(r.hit).not.toContain('party-1');
    expect(since(b, n).some((e) => (e.type === 'dodge' || e.type === 'miss') && e.source === w.uid)).toBe(false);
  });

  it('adalet kuralı: karşı taraftaki her birim en az bir kez oynamadan çözülmez (ertelenir)', () => {
    const b = make();
    const archer = b.get('party-3')!;
    archer.stats.spd = 1; // Warden'dan çok yavaş
    toWarden(b);
    const w = warden(b);
    b.useSkill(w.uid, 'breaking_span', undefined, 3);
    expect(b.telegraphs[0]!.waitFor).toContain(archer.uid);
    b.skipTurn();
    let delayed = false;
    for (let i = 0; i < 40 && !delayed; i++) {
      const n = b.log.length;
      if (b.currentUid === w.uid) b.skipTurn();
      else b.skipTurn();
      delayed = since(b, n).some((e) => e.type === 'telegraphDelay');
      if (since(b, n).some((e) => e.type === 'telegraphResolve')) break;
    }
    expect(delayed).toBe(true);
  });
});

describe('Iron Mooring kırılması (M8)', () => {
  it('Warden Stagger alır (sıradaki eylemini kaybeder), bekleyen Span iptal, zırh düşer; faz kopuşunda Stagger yok', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    b.useSkill(w.uid, 'breaking_span', undefined, 3);
    const m = moorings(b)[0]!;
    const n = b.log.length;
    b.debugKill(m.uid);
    const ev = since(b, n);
    expect(ev.find((e) => e.type === 'anchorBroken')).toMatchObject({ anchor: m.uid, owner: w.uid, stagger: true, left: 1 });
    expect(ev.find((e) => e.type === 'telegraphCancel')).toMatchObject({ skill: 'breaking_span', cause: 'anchor' });
    expect(b.telegraphs).toHaveLength(0);
    expect(w.statuses.some((s) => s.kind === 'staggered')).toBe(true);
    expect(b.effectiveStats(w).armor).toBe(w.stats.armor + W.boss!.anchor!.armorAdd);
    expect(ev.some((e) => e.type === 'death' && e.target === m.uid && e.corpse)).toBe(false); // ceset bırakmaz
    // Warden'ın kalan eylemi yanar (Stagger tek eylem)
    b.skipTurn();
    const n2 = b.log.length;
    toWarden(b);
    expect(since(b, n2).some((e) => e.type === 'staggered' && e.actor === w.uid)).toBe(true);
    expect(w.statuses.some((s) => s.kind === 'staggered')).toBe(false);
  });

  it('Chain Hook en az bir Mooring ister; ikisi de kırılınca kullanılamaz', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    expect(b.canUse(w.uid, 'chain_hook').ok).toBe(true);
    for (const m of moorings(b)) b.debugKill(m.uid);
    expect(b.canUse(w.uid, 'chain_hook')).toEqual({ ok: false, reason: `Needs a standing ${M.name}` });
  });

  it('Warden ölünce Mooring\'ler de çöker; savaş biter (inert birimler savaşın bitişinde sayılmaz)', () => {
    const b = make();
    b.debugKill(warden(b).uid);
    expect(moorings(b).every((m) => m.hp <= 0)).toBe(true);
    expect(b.winner).toBe('party');
  });
});

describe('fazlar ve faz kilidi (M7)', () => {
  it('tek eylem tek eşik: büyük vuruş Faz II\'de durur (Faz III eşiğinin 1 üstü); sonraki eylem Faz III\'e geçer ama öldüremez', () => {
    const b = make();
    const w = warden(b);
    b.debug.damageMult = 1000;
    b.debug.dodge = 'never';
    const first = b.currentActor!;
    const sk = first.skills.find((id) => b.canUse(first.uid, id).ok && b.validTargets(first.uid, id).some((t) => t.uid === w.uid) && S[id]!.effects.some((e) => e.type === 'damage'))!;
    b.useSkill(first.uid, sk, w.uid, w.slot);
    const ph = W.boss!.phases!;
    expect(w.phase).toBe(2);
    expect(w.hp).toBe(hpAt(w, ph[1]!.at) + 1);
    expect(b.log.filter((e) => e.type === 'phase')).toHaveLength(1);
    expect(b.canUse(w.uid, 'ash_brand').ok || b.currentUid !== w.uid).toBe(true);
    // ikinci vuruş: Faz III, can 1'in altına inmez (Fall atlatılamaz)
    for (let i = 0; i < 20; i++) {
      const a = b.currentActor!;
      if (a.side === 'party') {
        const id = a.skills.find((x) => b.canUse(a.uid, x).ok && b.validTargets(a.uid, x).some((t) => t.uid === w.uid) && S[x]!.effects.some((e) => e.type === 'damage'));
        if (id) {
          b.useSkill(a.uid, id, w.uid, w.slot);
          break;
        }
      }
      b.skipTurn();
    }
    expect(w.phase).toBe(3);
    expect(w.hp).toBeGreaterThanOrEqual(1);
    expect(w.actionsPerTurn).toBe(ph[1]!.actionsPerTurn);
    // Mooring'ler kopar (Stagger yok), Fall telgrafı anında: şerit başına 1 Keystone, üçü aynı sırada değil
    expect(moorings(b).every((m) => m.hp <= 0)).toBe(true);
    expect(b.log.filter((e) => e.type === 'anchorBroken').every((e) => e.type === 'anchorBroken' && !e.stagger)).toBe(true);
    expect(w.statuses.some((s) => s.kind === 'staggered')).toBe(false);
    const fall = b.telegraphs.find((t) => t.skill === 'fall_of_kings_bridge')!;
    expect(fall.safeCells).toHaveLength(content.formulas.formation.lanes);
    expect(new Set(fall.safeCells!.map((s) => s % 3)).size).toBe(3);
    expect(new Set(fall.safeCells!.map((s) => Math.floor(s / 3))).size).toBeGreaterThan(1);
    expect(fall.cells).toHaveLength(content.CELL_COUNT);
    expect(w.cooldowns.fall_of_kings_bridge).toBe(S.fall_of_kings_bridge!.cooldown);
  });

  it('faza göre alan: Breaking Span Faz I\'de sıra (3 hücre), Faz II\'de 2x3; Ash Brand yalnızca Faz II+', () => {
    const b = make();
    const w = warden(b);
    expect(b.areaCells('breaking_span', 4, 'party', w.uid)).toHaveLength(3);
    expect(b.canUse(w.uid, 'ash_brand')).toMatchObject({ ok: false });
    w.hp = hpAt(w, W.boss!.phases![0]!.at) + 1;
    b.debug.damageMult = 1;
    // doğrudan faz geçişi: küçük hasar eşiği geçirir
    const n = b.log.length;
    b.debugSetResource(w.uid, 'hp', w.hp); // değişiklik yok
    w.phase = 2;
    expect(b.areaCells('breaking_span', 4, 'party', w.uid)).toHaveLength(6);
    toWarden(b);
    expect(b.canUse(w.uid, 'ash_brand').ok).toBe(true);
    expect(n).toBeGreaterThan(0);
  });
});

describe('Chain Hook çekmesi (M6) ve Ash Brand (M4)', () => {
  it('Chain Hook isabet edince hedefi kendi şeridinin en öndeki boş hücresine çeker; Warden çekilemez', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    b.debug.dodge = 'never';
    const archer = b.get('party-3')!; // yuva 7 (sıra 2, şerit 1); şeridin önü: 1 boş, 4 boş
    const n = b.log.length;
    expect(b.useSkill(w.uid, 'chain_hook', archer.uid).ok).toBe(true);
    expect(since(b, n).find((e) => e.type === 'moved')).toMatchObject({ actor: archer.uid, from: 7, to: 1, cause: 'chain_hook', by: w.uid });
    expect(archer.slot).toBe(1);
    expect(b.pullDestination(w)).toBeNull();
  });

  it('Ash Brand damgalar; çözülmede damgalının O ANKİ hücresi merkezli artı vurulur; Mana Barrier dispel iptal eder', () => {
    const b = make();
    const w = warden(b);
    w.phase = 2;
    toWarden(b);
    const mage = b.get('party-1')!; // yuva 3; komşular 0 (Warrior), 4, 6
    expect(b.useSkill(w.uid, 'ash_brand', mage.uid).ok).toBe(true);
    expect(mage.statuses.some((s) => s.kind === 'ash_brand')).toBe(true);
    expect(b.telegraphThreat('party-0').length).toBe(1); // Warrior (yuva 0) komşu
    expect(b.telegraphThreat('party-2').length).toBe(0); // Paladin (yuva 5) değil
    b.skipTurn();
    const n = b.log.length;
    toWarden(b);
    const r = since(b, n).find((e) => e.type === 'telegraphResolve') as { hit: string[] };
    expect(r.hit.sort()).toEqual(['party-0', 'party-1']);
    expect(mage.statuses.some((s) => s.kind === 'ash_brand')).toBe(false);
    // dispel
    const b2 = make();
    const w2 = warden(b2);
    w2.phase = 2;
    toWarden(b2);
    b2.useSkill(w2.uid, 'ash_brand', 'party-1');
    b2.skipTurn();
    for (let i = 0; i < 20 && b2.currentUid !== 'party-1'; i++) b2.skipTurn();
    const m2 = b2.log.length;
    expect(b2.useSkill('party-1', 'mana_barrier', 'party-1').ok).toBe(true);
    expect(since(b2, m2).find((e) => e.type === 'telegraphCancel')).toMatchObject({ skill: 'ash_brand', cause: 'dispel' });
    expect(b2.telegraphs).toHaveLength(0);
  });
});

describe('Unyielding (M9)', () => {
  it('madde 271: Warden CC\'ye bağışık (Stun/Slow/Silence işlemez, Stagger de olmaz); diğer debuff\'lar 1 tur kısa (en az 1)', () => {
    const b = make();
    const w = warden(b);
    for (const k of ['stun', 'slow', 'silence']) {
      b.debugAddStatus(w.uid, k, 3);
      expect(w.statuses.some((s) => s.kind === k)).toBe(false);
    }
    expect(w.statuses.some((s) => s.kind === 'staggered')).toBe(false);
    b.debugAddStatus(w.uid, 'wound', 3);
    expect(w.statuses.find((s) => s.kind === 'wound')?.turns).toBe(3 + W.boss!.unyielding!.debuffDurationDelta);
    // madde 272: Blinded (isabet cezası) artık hiç işlemez; en az 1 kuralı başka bir debuff'la (Overextended) denenir
    b.debugAddStatus(w.uid, 'blinded', 1);
    expect(w.statuses.some((s) => s.kind === 'blinded')).toBe(false);
    b.debugAddStatus(w.uid, 'overextended', 1);
    expect(w.statuses.find((s) => s.kind === 'overextended')?.turns).toBe(1);
  });

  it('madde 271: rütbesiz kurulan Warden da (boss tanımı) bağışık', () => {
    const b = make(3, 'turns', { ...TEAMS, units: { enemies: { 1: { displayName: 'The Bridge Warden' } } } });
    const w = warden(b);
    expect(w.tier).toBeUndefined();
    b.debugAddStatus(w.uid, 'stun', 2);
    expect(w.statuses.some((s) => s.kind === 'stun' || s.kind === 'staggered')).toBe(false);
  });
});

describe('YZ (M11, M12) ve determinizm (M14)', () => {
  it('oyuncu vekili: işaretli hücredeki birim, güvenli boş hücre varsa Move ile kaçar', () => {
    const b = make();
    toWarden(b);
    const w = warden(b);
    b.useSkill(w.uid, 'breaking_span', undefined, 3);
    b.skipTurn();
    for (let i = 0; i < 20 && b.currentUid !== 'party-1'; i++) b.skipTurn();
    b.get('party-1')!.mp = 0; // değerli büyü yok
    // Kaçış planı terazide (trace.global.move): önlenen hasar - şimdiki hamle bedeli; güvenli hücreye. Seçim yine terazinin (Rest daha değerliyse Rest).
    const trace = { options: [], reserves: [], steps: [] } as unknown as Parameters<typeof chooseAction>[3] & { global?: { move?: { slot: number; net: number } | null } };
    const c = chooseAction(b, 'party-1', content.aiConfig, trace);
    const plan = trace!.global?.move;
    expect(plan).toBeTruthy();
    expect([3, 4, 5]).not.toContain(plan!.slot);
    expect(plan!.net).toBeGreaterThan(0);
    // tehlikeli hücrede kalmanın bedeli = telgrafın beklenen hasarı (önizleme): telegraphThreat
    expect(b.telegraphThreat('party-1')[0]!.avg).toBeGreaterThan(0);
    expect(b.telegraphThreat('party-1', plan!.slot)).toEqual([]);
    if (c?.skillId === 'move_tile') expect(c.slot).toBe(plan!.slot);
  });

  it('Warden YZ telgraflı skill\'leri seçer ve maç tamamlanır; aynı seed = aynı savaş (turns ve test modu)', () => {
    const play = (mode: BattleMode) => {
      const b = make(11, mode);
      let i = 0;
      for (let n = 0; n < 600 && !b.winner; n++) {
        const uid = mode === 'turns' ? b.currentActor?.uid : b.combatants.filter((c) => c.hp > 0 && !c.inert)[i++ % b.combatants.filter((c) => c.hp > 0 && !c.inert).length]?.uid;
        if (!uid) break;
        const r = b.applyChoice(uid, chooseAction(b, uid, content.aiConfig));
        if (!r.ok && mode === 'turns') break;
      }
      return b;
    };
    for (const mode of ['turns', 'test'] as BattleMode[]) {
      const a = play(mode);
      expect(JSON.stringify(a.log)).toBe(JSON.stringify(play(mode).log));
      expect(a.log.some((e) => e.type === 'telegraph')).toBe(true);
      expect(a.log.some((e) => e.type === 'telegraphResolve' || e.type === 'telegraphCancel')).toBe(true);
    }
    expect(play('turns').winner).not.toBeNull();
  });
});
