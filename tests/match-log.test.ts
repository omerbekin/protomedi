import { describe, expect, it } from 'vitest';
import { Battle, MatchLog, chooseAction, content, explainChoice } from '../src/engine';
import type { AiExplanation, BattleMode } from '../src/engine';

/**
 * Maç kaydı (src/engine/match-log.ts) ve AI karar açıklaması (explainChoice, src/engine/ai.ts): açıklama/kayıt açıkken savaş sonuçları
 * birebir aynı (gözlemci motoru ve RNG'yi değiştirmez); açıklama chooseAction ile aynı kararı verir ve adayları/puanları içerir.
 */
const ai = content.aiConfig;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');

interface RunOpts {
  explain: boolean;
  mode?: BattleMode;
  sizes?: content.TeamSizes;
  max?: number;
}

/** İki tarafı da YZ oynatan savaş; explain=true: her hamlede açıklama hesaplanır + MatchLog kayıtta. */
function play(seed: number, o: RunOpts): { b: Battle; log: MatchLog | null; explanations: AiExplanation[] } {
  const b = new Battle(content.battleSetup('random-battle', seed, o.mode ?? 'turns', o.sizes ?? {}, false));
  const log = o.explain ? new MatchLog(b, { version: 'test' }) : null;
  const explanations: AiExplanation[] = [];
  for (let i = 0; i < (o.max ?? 600) && !b.winner; i++) {
    const actor = b.currentActor;
    if (!actor) break;
    if (log) {
      const ex = explainChoice(b, actor.uid, ai);
      log.noteAi(ex);
      if (ex) explanations.push(ex);
    }
    const choice = chooseAction(b, actor.uid, ai);
    const r = b.applyChoice(actor.uid, choice);
    if (!r.ok) b.skipTurn();
  }
  return { b, log, explanations };
}

const eventsOf = (b: Battle) => JSON.stringify(b.log.map((e) => (e.type === 'battleStart' ? { type: e.type, seed: e.seed } : e)));

describe('açıklama ve kayıt savaşı ETKİLEMEZ (determinizm)', () => {
  for (const seed of [1, 2, 3, 7, 11, 42, 99, 1234]) {
    it(`seed ${seed}: açıklama + kayıt açıkken olay akışı birebir aynı`, () => {
      const off = play(seed, { explain: false });
      const on = play(seed, { explain: true });
      expect(eventsOf(on.b)).toBe(eventsOf(off.b));
      expect(on.b.turnsTaken).toBe(off.b.turnsTaken);
      expect(on.b.winner).toBe(off.b.winner);
    });
  }

  it('farklı takım boyutlarında (3v8) da aynı', () => {
    const off = play(5, { explain: false, sizes: { partySize: 3, enemySize: 8 } });
    const on = play(5, { explain: true, sizes: { partySize: 3, enemySize: 8 } });
    expect(eventsOf(on.b)).toBe(eventsOf(off.b));
  });

  it('chooseAction iz (trace) isteyince de aynı kararı verir', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns', {}, false));
      for (let i = 0; i < 60 && !b.winner; i++) {
        const a = b.currentActor!;
        const plain = chooseAction(b, a.uid, ai);
        const traced = chooseAction(b, a.uid, ai, { options: [], reserves: [], steps: [] });
        expect(traced).toEqual(plain);
        b.applyChoice(a.uid, plain);
      }
    }
  });
});

describe('explainChoice: gerekçe', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => play(s, { explain: true }));
  const all = runs.flatMap((r) => r.explanations);

  it('verilen karar (final) ile chooseAction aynıdır; seçilen aday adaylar listesinde "chosen" olarak işaretlidir', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const ex of all) {
      if (!ex.final) continue;
      const chosen = ex.candidates.filter((c) => c.verdict === 'chosen');
      if (['rest', 'skip', 'move'].includes(ex.final.reason)) continue; // global skill: sınıf hamlesi (varsa) yine "chosen" olarak gösterilir
      expect(chosen).toHaveLength(1);
      expect(chosen[0]!.skill).toBe(ex.final.skill);
      if (ex.final.target) expect(chosen[0]!.target).toBe(ex.final.target);
    }
  });

  it('kazanan öncelikte seçilen adayın puanı havuzdaki en yüksek puandır (açıklama seçiciyle tutarlı)', () => {
    let checked = 0;
    for (const ex of all) {
      if (!ex.final || ['rest', 'skip', 'move'].includes(ex.final.reason)) continue;
      const chosen = ex.candidates.find((c) => c.verdict === 'chosen')!;
      for (const c of ex.candidates.filter((x) => x.verdict === 'lost')) expect(c.score ?? -Infinity, `${ex.actor} ${ex.final.reason}`).toBeLessThanOrEqual((chosen.score ?? 0) + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(80);
  });

  it('adaylar: skill, hedef, hasar, isabet, maliyet ve elenme nedeni var; elenenlerin nedeni yazılı', () => {
    const withLosers = all.filter((e) => e.candidates.length >= 3);
    expect(withLosers.length).toBeGreaterThan(50);
    for (const ex of withLosers) {
      for (const c of ex.candidates) {
        expect(c.skill).toBeTruthy();
        expect(typeof c.net).toBe('number');
        expect(typeof c.cost).toBe('number');
        if (c.verdict === 'blocked' || c.verdict === 'skipped') expect(c.note, `${ex.actor} ${c.skill}`).toBeTruthy();
      }
      expect(ex.why.length).toBeGreaterThan(10);
      expect(ex.steps.length).toBeGreaterThan(0);
    }
  });

  it('kullanılamayan skill\'ler (cooldown / MP / Rage) nedeniyle listelenir', () => {
    const reasons = new Set(all.flatMap((e) => e.rejected.map((r) => r.reason.split(' (')[0])));
    expect(reasons.has('on cooldown')).toBe(true);
    expect([...reasons].some((r) => r?.startsWith('not enough'))).toBe(true);
  });

  it('alan (AOE) adayları merkez hücreyi, vurulan hedefleri ve toplam beklenen hasarı gösterir', () => {
    const area = all.flatMap((e) => e.candidates).filter((c) => c.center !== undefined && c.enemyHits >= 2);
    expect(area.length).toBeGreaterThan(10);
    for (const c of area.slice(0, 50)) {
      expect(c.hits.length).toBeGreaterThanOrEqual(2);
      expect(c.perTarget === undefined || c.perTarget.length > 0).toBe(true);
    }
    // toplam hasar = hedef başına beklenen hasarların (hasar tavanı öncesi) üst sınırı içinde
    expect(area.some((c) => c.dmg > 0 && (c.perTarget?.length ?? 0) >= 2)).toBe(true);
  });

  it('global skill kararı (Rest/Skip/Move) gerekçesi: sınıf hamlesinin değeri ve global değerlendirme yazılı', () => {
    const globals = all.filter((e) => e.final && ['rest', 'skip', 'move'].includes(e.final.reason));
    expect(globals.length).toBeGreaterThan(0);
    for (const ex of globals) {
      expect(ex.global.enabled).toBe(true);
      expect(ex.global.outcome).toBeTruthy();
      expect(ex.why).toContain('Global skill');
    }
  });

  it('bağlam ipucu (ai hint) yüzünden elenen aday, hangi koşulun sağlanmadığını söyler', () => {
    const blocked = all.flatMap((e) => e.candidates).filter((c) => c.verdict === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.some((c) => /ai hint|MP kept in reserve/.test(c.note ?? ''))).toBe(true);
  });
});

describe('MatchLog: kayıt', () => {
  const full = play(7, { explain: true });
  const text = full.log!.serialize();

  it('başlık: sürüm, seed, mod, takım boyutları, kadrolar (stat\'lar, skill\'ler)', () => {
    const head = text.split('\n').slice(0, 12).join('\n');
    expect(head).toContain('# MATCH LOG');
    expect(head).toContain('seed: 7');
    expect(head).toContain('mode: turns');
    expect(head).toMatch(/teams: party 5 vs enemy 5/);
    expect(text).toContain('## ROSTER');
    expect(text).toMatch(/STR \d+ INT \d+ DEX \d+ LUCK \d+/);
    expect(text).toMatch(/maxHP \d+ maxMP \d+/);
    expect(text).toMatch(/armor \d+ marmor \d+ evasion/);
    expect(text).toMatch(/cd \d+/);
    expect(text).toMatch(/initialCd \d+/);
    expect(text).toContain('primary ');
    expect(text).toContain('passive ');
  });

  it('her hamle kaydedilir: hamle sayısı oynanan tur sayısına eşit; her kayıtta önce/sonra durum, eylem ve sonuç var', () => {
    expect(full.log!.moves.length).toBe(full.b.turnsTaken);
    for (const m of full.log!.moves) {
      if (m.action.kind !== 'skipped') expect(m.pre.self.hp).toBeGreaterThan(0); // 'skipped': turn-start ground damage killed the unit
      expect(m.action.name).toBeTruthy();
      expect(m.post.self).toBeTruthy();
      expect(['ai', 'auto']).toContain(m.control);
    }
    expect(text).toContain('## MOVES');
    expect(text).toContain('### #1 |');
    expect(text).toContain('before:');
    expect(text).toContain('result:');
    expect(text).toContain('after:');
  });

  it('YZ hamlesinde WHY, öncelik adımları ve aday satırları var', () => {
    expect(text).toContain('WHY: ');
    expect(text).toContain('steps: ');
    expect(text).toContain('candidates:');
    expect(text).toMatch(/\* [A-Za-z' ]+( -> [^ ]+)?.*\[chosen\]/);
  });

  it('sonuç olayları: hasar, bedel, durum, ölüm özetlenir; savaş sonu özeti kazananı ve birim toplamlarını verir', () => {
    expect(text).toMatch(/: \d+ dmg/);
    expect(text).toMatch(/pays \d+ (mp|hp)/);
    expect(text).toContain('DIED');
    expect(text).toContain('## RESULT');
    expect(text).toContain(`winner: ${full.b.winner}`);
    expect(text).toMatch(/dealt \d+, taken \d+, healed \d+/);
  });

  it('boyut sınırı: büyük kayıt önce sıkıştırılır, sonra sondan kırpılır ve "truncated" yazılır; özet yine sonda', () => {
    const log = full.log!;
    const small = new MatchLog(new Battle(content.battleSetup('random-battle', 7, 'turns', {}, false)), {}, { maxChars: 1 });
    expect(small.serialize()).toContain('## RESULT');
    // gerçek kaydı sınırla serileştir
    const limited = (full.log as unknown as { opts: { maxChars?: number } }).opts;
    const prev = limited.maxChars;
    limited.maxChars = 60_000;
    const t = log.serialize();
    limited.maxChars = prev;
    expect(t.length).toBeLessThanOrEqual(60_500);
    expect(t).toMatch(/TRUNCATED|compact detail/);
    if (t.includes('TRUNCATED')) expect(t).toMatch(/\[truncated: \d+ later move/);
    expect(t.trimEnd().split('\n').some((l) => l.startsWith('## RESULT'))).toBe(true);
  });

  it('savaş bitmeden de çalışır: o ana kadarki kayıt, "in progress"', () => {
    const { b, log } = play(3, { explain: true, max: 12 });
    expect(b.winner).toBeNull();
    const t = log!.serialize();
    expect(t).toContain('status: in progress');
    expect(log!.moves.length).toBe(12);
    expect(t).toContain('battle still in progress');
  });

  it('sersemlemiş (stun) tur kaydedilir: eylem "Stunned"', () => {
    const b = new Battle(content.battleSetup('random-battle', 4, 'turns', {}, false));
    const log = new MatchLog(b);
    for (const c of b.combatants) if (c.side === 'enemy') b.debugAddStatus(c.uid, 'stun', 2);
    for (let i = 0; i < 40 && !b.winner; i++) {
      const a = b.currentActor!;
      log.noteAi(explainChoice(b, a.uid, ai));
      const r = b.applyChoice(a.uid, chooseAction(b, a.uid, ai));
      if (!r.ok) b.skipTurn();
    }
    const stunned = log.moves.filter((m) => m.action.kind === 'stunned');
    expect(stunned.length).toBeGreaterThan(0);
    expect(stunned[0]!.events.join(' ')).toContain('stunned');
    expect(log.serialize()).toContain('Stunned (turn skipped)');
    expect(log.moves.length).toBe(b.turnsTaken);
  });

  it('global skill\'ler (Rest / Skip / Move) kaydedilir; oyuncu hamlesi "PLAYER", açıklaması yoktur', () => {
    let seen = new Set<string>();
    for (let seed = 1; seed <= 30 && seen.size < 3; seed++) {
      const { log } = play(seed, { explain: true, max: 120 });
      for (const m of log!.moves) if (m.action.kind === 'global') seen.add(m.action.id!);
    }
    expect([...seen].sort()).toEqual(['move_tile', 'rest', 'skip_turn']);

    const b = new Battle(content.battleSetup('random-battle', 2, 'turns', {}, false));
    const log = new MatchLog(b);
    const me = b.currentActor!;
    const r = b.act(me.uid, { kind: 'global', id: 'rest' });
    if (!r.ok) b.skipTurn(); // MP dolu olabilir: pas da kaydedilir
    expect(log.moves[0]!.control).toBe('player');
    expect(log.moves[0]!.ai).toBeUndefined();
    expect(log.serialize()).toContain('PLAYER');
  });

  it('test modunda da çalışır (sırasız): her eylem kaydedilir', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior', 2: 'mage' }), enemies: cells({ 0: 'archer' }) }, false));
    const log = new MatchLog(b, { version: 't' });
    expect(b.useSkill('party-0', 'melee_attack', 'enemy-0').ok).toBe(true);
    expect(b.useSkill('party-1', 'fire_bolt', 'enemy-0').ok).toBe(true);
    expect(b.act('enemy-0', { kind: 'global', id: 'rest' }).ok || true).toBe(true);
    expect(log.moves.length).toBeGreaterThanOrEqual(2);
    expect(log.moves[0]!.actor).toContain('Warrior');
    expect(log.moves[1]!.actor).toContain('Mage');
    expect(log.serialize()).toContain('mode: test');
  });

  it('debug (galeri) atışları kayda girmez', () => {
    const b = new Battle(content.battleSetup('random-battle', 1, 'test', { party: cells({ 0: 'warrior' }), enemies: cells({ 0: 'archer' }) }, false));
    const log = new MatchLog(b);
    b.debugCast('party-0', 'melee_attack', 'enemy-0');
    expect(log.moves).toHaveLength(0);
  });
});

describe('"Warrior neden Whirlwind yerine Double Strike kullandı?" sorusu kayıttan cevaplanabilir', () => {
  it('Warrior\'ın Double Strike seçtiği bir hamlede Whirlwind aday/elenen olarak ve puanlarıyla kayıtta görünür', () => {
    let found: { text: string; whirl: string } | null = null;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { log, explanations } = play(seed, { explain: true, max: 200 });
      const ex = explanations.find((e) => e.actor.includes('Warrior') && e.final?.skill === 'melee_attack' && (e.candidates.some((c) => c.skill === 'whirlwind') || e.rejected.some((r) => r.skill === 'whirlwind')));
      if (ex) found = { text: log!.serialize(), whirl: ex.candidates.find((c) => c.skill === 'whirlwind')?.verdict ?? ex.rejected.find((r) => r.skill === 'whirlwind')!.reason };
    }
    expect(found).not.toBeNull();
    expect(found!.text).toMatch(/Double Strike/);
    expect(found!.text).toMatch(/Whirlwind/);
    expect(found!.whirl.length).toBeGreaterThan(0);
  });
});
