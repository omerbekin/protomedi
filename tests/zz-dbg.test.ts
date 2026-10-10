import { it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
it('dbg', () => {
  const keys = new Map<string, Set<string>>();
  const walk = (t: string, o: any, pre = '') => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const p = pre + k; if (!keys.has(t)) keys.set(t, new Set()); keys.get(t)!.add(p); if (v && typeof v === 'object' && !Array.isArray(v) && pre.split('.').length < 2) walk(t, v, p + '.'); } };
  for (let seed = 1; seed <= 40; seed++) {
    const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
    while (!b.winner && b.turnsTaken < 400) { const u = b.currentUid!; const r = b.applyChoice(u, chooseAction(b, u, content.aiConfig)); if (r.ok) for (const e of r.events) walk(e.type, e); }
  }
  for (const [t, s] of keys) console.log('K', t, [...s].join(','));
}, 120000);
