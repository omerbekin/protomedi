import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content, type BattleEvent } from '../src/engine';
import { elapsedTicks, startCounter, waitMs, type CounterSnap } from '../src/game/turn-wait';
import layout from '../data/battle-layout.json';

// Turlar arası görsel bekleme (Ömer 2026-10-10; yalnızca sunum, motor aynı): src/game/turn-wait.ts.
const cfg = layout.animation.turnWait;
const T = content.formulas.turn.threshold;

describe('turn-wait: oyun zamanı -> gerçek zaman', () => {
  it('hızı 20 olan birim boştan doluya 2000 ms; tavan 2,5 sn; Battle speed böler; Reduced motion kısaltır', () => {
    expect(waitMs(T / cfg.refSpd, T, cfg, 1, false)).toBe(2000);
    expect(waitMs(1, T, cfg, 1, false)).toBe(Math.round((cfg.fullMs * cfg.refSpd) / T));
    expect(waitMs(100, T, cfg, 1, false)).toBe(cfg.maxMs);
    expect(waitMs(5, T, cfg, 2, false)).toBe(waitMs(5, T, cfg, 1, false) / 2);
    expect(waitMs(5, T, cfg, 4, false)).toBe(waitMs(5, T, cfg, 1, false) / 4);
    expect(waitMs(5, T, cfg, 1, true)).toBe(Math.round(waitMs(5, T, cfg, 1, false) * cfg.reducedMotionMult));
    expect(waitMs(0, T, cfg, 1, false)).toBe(0);
    expect(startCounter(180, 20, 3)).toBe(120);
  });

  it('geçen tik: önceki aktör hariç ortak birimlerin (sayaç farkı / hız) çoğunluğu', () => {
    const prev: CounterSnap = new Map([['a', { counter: 200, spd: 30 }], ['b', { counter: 50, spd: 20 }], ['c', { counter: 10, spd: 40 }]]);
    const next: CounterSnap = new Map([['a', { counter: 90, spd: 30 }], ['b', { counter: 110, spd: 20 }], ['c', { counter: 130, spd: 40 }]]);
    expect(elapsedTicks(prev, next, 'a')).toBe(3);
    expect(elapsedTicks(prev, next, 'a', 'b')).toBe(3);
    expect(elapsedTicks(new Map(), next, 'a')).toBeNull();
  });

  it('gerçek savaşlarda: hesaplanan tik motorun ilerlettiği tikle aynı; 1x ortalama eklenen süre makul (rapor)', () => {
    let totalMs = 0;
    let waits = 0;
    let checked = 0;
    let agree = 0;
    let disagree = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const battle = new Battle(content.battleSetup(content.DEFAULT_BATTLE, 9000 + i, 'turns'));
      const snap = (): CounterSnap => new Map(battle.combatants.filter((c) => c.hp > 0 && !c.inert).map((c) => [c.uid, { counter: c.turnCounter, spd: battle.speedOf(c) }]));
      let last: CounterSnap | null = null;
      let lastActor: string | null = null;
      battle.on((e: BattleEvent) => {
        if (e.type !== 'turnStart' || e.extra) return;
        const next = snap();
        if (last) {
          const t = elapsedTicks(last, next, lastActor, e.actor) ?? 0;
          // doğrulama: önceki / yeni aktör dışındaki her birim tam olarak hız x tik ilerlemiş olmalı (motorun advanceTurn kuralı)
          for (const [uid, n] of next) {
            const p = last.get(uid);
            if (!p || uid === lastActor || uid === e.actor || n.spd <= 0) continue;
            if (n.counter - p.counter === n.spd * t) agree++;
            else disagree++;
          }
          checked++;
          totalMs += waitMs(t, T, cfg, 1, false);
          waits++;
        }
        last = next;
        lastActor = e.actor;
      });
      let guard = 0;
      while (!battle.winner && guard++ < 400) {
        const actor = battle.currentActor;
        if (!actor) break;
        const r = battle.applyChoice(actor.uid, chooseAction(battle, actor.uid, content.aiConfig));
        if (!r.ok) battle.skipTurn();
      }
    }
    const avgSec = totalMs / N / 1000;
    console.log(`turn-wait: ${N} battles, ${waits} waits, avg ${(totalMs / waits).toFixed(0)} ms/wait, avg +${avgSec.toFixed(1)} s per battle at 1x`);
    expect(checked).toBeGreaterThan(100);
    // hız ortasında değişen birim (eylem sırasında Slow / Haste) nadiren tutmaz; çoğunluk oyu yine doğru tiki verir
    expect(disagree / Math.max(1, agree + disagree)).toBeLessThan(0.05);
    expect(avgSec).toBeGreaterThan(1);
    expect(avgSec).toBeLessThan(180);
  });
});
