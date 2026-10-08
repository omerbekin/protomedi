import { describe, expect, it } from 'vitest';
import { battlePlan, newCampaign } from '../src/campaign';
import { retreatToMap, session } from '../src/game/campaign-session';

describe('sefer: savaştan haritaya geri çekilme (Retreat to Map)', () => {
  it('durum değişmez, deneme sayacı artmaz: sonraki giriş aynı seed ve aynı kurulumla', () => {
    const s = newCampaign({ mode: 'ironman', seed: 4242, difficulty: 'medium', slot: 0, campaignId: 'c-test' });
    session.state = s;
    session.attempts = new Map();
    const before = JSON.stringify(s);
    const plan1 = battlePlan(s, session.attempts.get(s.at) ?? 0);
    const after = retreatToMap();
    expect(after).toBe(s);
    expect(JSON.stringify(session.state)).toBe(before);
    expect(session.attempts.get(s.at) ?? 0).toBe(0);
    const plan2 = battlePlan(session.state!, session.attempts.get(s.at) ?? 0);
    expect(plan2.seed).toBe(plan1.seed);
    expect(plan2).toEqual(plan1);
    expect(session.notice).toMatch(/retreated/i);
  });
});
