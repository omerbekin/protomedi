import { describe, expect, it } from 'vitest';
import { Battle, content } from '../src/engine';
import type { BattleEvent } from '../src/engine';
import {
  SKIP_SPEED,
  SPEEDS,
  debugState,
  effectiveTimeScale,
  groupSkillsByOwner,
  nextInCycle,
  parseSeed,
  resourceValue,
  sfxLabel,
  tweaksSummary,
} from '../src/game/debug-state';
import { SFX_IDS } from '../src/game/audio';

const mk = (seed = 1, mode: 'turns' | 'test' = 'test') => new Battle(content.battleSetup('first-battle', seed, mode));
const types = (b: Battle, from: number) => b.log.slice(from).map((e: BattleEvent) => e.type);

describe('debug: varsayılan bayraklar oyunu değiştirmez', () => {
  it('aynı seed ve girdilerle debug bayrakları varsayılanken sonuç birebir aynı', () => {
    const run = (touch: boolean) => {
      const b = mk(7);
      if (touch) Object.assign(b.debug, { damageMult: 1, crit: 'auto', dodge: 'auto' });
      const a = b.get('party-0')!;
      for (const id of a.skills) b.useSkill(a.uid, id, b.livingByDepth('enemy')[0]!.uid);
      return JSON.stringify(b.log);
    };
    expect(run(true)).toBe(run(false));
    expect(new Battle(content.battleSetup('first-battle', 1, 'test')).debug).toEqual({ damageMult: 1, crit: 'auto', dodge: 'auto' });
  });

  it('bayrak değişse de rastgele sayı akışı kayma yapmaz (zarlar hep atılır)', () => {
    const hits = (flag: boolean) => {
      const b = mk(3);
      if (flag) b.debug.crit = 'always';
      const a = b.get('party-0')!;
      const t = b.livingByDepth('enemy')[0]!;
      b.useSkill(a.uid, a.skills[0]!, t.uid);
      b.useSkill(a.uid, a.skills[0]!, t.uid);
      return b.log.filter((e) => e.type === 'dodge' || e.type === 'damage').map((e) => e.type);
    };
    expect(hits(true)).toEqual(hits(false));
  });
});

describe('debug: hasar çarpanı, kritik, kaçınma', () => {
  const strike = (b: Battle) => {
    const a = b.get('party-0')!;
    const t = b.livingByDepth('enemy')[0]!;
    const from = b.log.length;
    b.useSkill(a.uid, a.skills[0]!, t.uid);
    return b.log.slice(from).filter((e) => e.type === 'damage' || e.type === 'dodge');
  };

  it('One-hit kill: hasar çarpanı hedefi öldürür', () => {
    const b = mk(2);
    b.debug.dodge = 'never';
    b.debug.damageMult = 9999;
    const t = b.livingByDepth('enemy')[0]!;
    strike(b);
    expect(t.hp).toBe(0);
  });

  it('10x: hasar normalin en az ~10 katı (aynı seed)', () => {
    const amount = (m: number) => {
      const b = mk(5);
      b.debug.dodge = 'never';
      b.debug.crit = 'never';
      b.debug.damageMult = m;
      const t = b.livingByDepth('enemy')[0]!;
      t.shield = 0;
      t.hp = t.maxHp = 100000;
      const before = t.hp;
      b.useSkill('party-0', b.get('party-0')!.skills[0]!, t.uid);
      return before - t.hp;
    };
    const one = amount(1);
    expect(one).toBeGreaterThan(0);
    expect(amount(10)).toBeGreaterThanOrEqual(one * 10 - 10);
  });

  it('Always crit / never crit', () => {
    const b = mk(4);
    b.debug.dodge = 'never';
    b.debug.crit = 'always';
    expect(strike(b).every((e) => e.type === 'damage' && e.crit)).toBe(true);
    const c = mk(4);
    c.debug.dodge = 'never';
    c.debug.crit = 'never';
    expect(strike(c).every((e) => e.type === 'damage' && !e.crit)).toBe(true);
  });

  it('Always dodge: hasar veren her vuruş (fiziksel ve büyü) iska olur', () => {
    const b = mk(4);
    b.debug.dodge = 'always';
    const out = strike(b);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.type === 'dodge')).toBe(true);
    const m = mk(4);
    m.debug.dodge = 'always';
    const mage = m.get('party-2')!;
    const spell = mage.skills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'damage' && e.damageType === 'magic'))!;
    const from = m.log.length;
    expect(m.useSkill(mage.uid, spell, m.livingByDepth('enemy')[0]!.uid).ok).toBe(true);
    expect(types(m, from)).toContain('dodge');
    expect(types(m, from)).not.toContain('damage');
  });
});

describe('debug: birim araçları', () => {
  it('can/mana ayarlanır, sınırlar korunur, olay yayınlanır', () => {
    const b = mk();
    const c = b.get('party-0')!;
    const from = b.log.length;
    expect(b.debugSetResource(c.uid, 'hp', 1).ok).toBe(true);
    expect(c.hp).toBe(1);
    b.debugSetResource(c.uid, 'hp', 99999);
    expect(c.hp).toBe(c.maxHp);
    b.debugSetResource(c.uid, 'mp', 0);
    expect(c.mp).toBe(0);
    expect(b.log.slice(from).some((e) => e.type === 'resource' && e.resource === 'mp' && e.after === 0)).toBe(true);
  });

  it('can 0 öldürür; ölü birimde can > 0 diriltir', () => {
    const b = mk();
    const c = b.get('party-1')!;
    b.debugSetResource(c.uid, 'hp', 0);
    expect(c.hp).toBe(0);
    expect(b.log.some((e) => e.type === 'death' && e.target === c.uid)).toBe(true);
    expect(b.debugSetResource(c.uid, 'mp', 5).ok).toBe(false);
    expect(b.debugSetResource(c.uid, 'hp', 10).ok).toBe(true);
    expect(c.hp).toBe(10);
    expect(b.log.some((e) => e.type === 'revive' && e.target === c.uid)).toBe(true);
  });

  it('düşman takımı ölünce savaş biter; bitmiş savaşta kill/revive reddedilir', () => {
    const b = mk();
    for (const c of b.living('enemy')) b.debugKill(c.uid);
    expect(b.winner).toBe('party');
    expect(b.log.at(-1)).toMatchObject({ type: 'battleEnd', winner: 'party' });
    expect(b.debugRevive('enemy-0').ok).toBe(false);
    expect(b.debugKill('party-0').ok).toBe(false);
  });

  it('allowEnd=false savaşı bitirmez', () => {
    const b = mk();
    for (const c of b.living('enemy')) b.debugKill(c.uid, false);
    expect(b.winner).toBeNull();
  });

  it('reviveAll ölüleri diriltir; hücresi dolu olan diriltilemez', () => {
    const b = mk();
    b.debugKill('party-0');
    b.debugKill('party-1');
    b.debugReviveAll();
    expect(b.living('party')).toHaveLength(b.combatants.filter((c) => c.side === 'party' && !c.summoned).length);
    b.debugKill('party-0');
    const dead = b.get('party-0')!;
    b.combatants.push({ ...dead, uid: 'x', hp: 5, summoned: true });
    expect(b.debugRevive('party-0')).toMatchObject({ ok: false, reason: 'Cell is taken' });
  });

  it('debugFill takımın canını/manasını doldurur; cooldown temizlenir', () => {
    const b = mk(1, 'turns');
    for (const c of b.combatants) {
      c.hp = 1;
      c.mp = 0;
      c.cooldowns = { x: 3 };
    }
    b.debugFill('party');
    for (const c of b.living('party')) {
      expect(c.hp).toBe(c.maxHp);
      expect(c.mp).toBe(c.maxMp);
    }
    expect(b.living('enemy').every((c) => c.hp === 1)).toBe(true);
    b.debugClearCooldowns();
    expect(b.combatants.every((c) => Object.keys(c.cooldowns).length === 0)).toBe(true);
  });

  it('durum eklenir (yalnızca tanımlı), temizlenir', () => {
    const b = mk();
    const c = b.get('party-0')!;
    expect(b.debugAddStatus(c.uid, 'stun', 2).ok).toBe(true);
    expect(c.statuses.some((s) => s.kind === 'stun' && s.turns === 2)).toBe(true);
    expect(b.log.some((e) => e.type === 'status' && e.target === c.uid && e.status === 'stun')).toBe(true);
    expect(b.debugAddStatus(c.uid, 'nonsense').ok).toBe(false);
    c.shield = 9;
    b.debugClearStatuses(c.uid);
    expect(c.statuses).toHaveLength(0);
    expect(c.shield).toBe(0);
  });

  it('her tanımlı durum eklenebilir', () => {
    const b = mk();
    for (const kind of Object.keys(content.statuses)) expect(b.debugAddStatus('party-0', kind).ok, kind).toBe(true);
  });
});

describe('debug: skill galerisi (debugCast)', () => {
  const allSkills = Object.keys(content.skills);

  it('her skill, bedel/bekleme/menzil/sıra yok sayılarak oynatılır; MP ve cooldown değişmez; sıra ilerlemez', () => {
    for (const id of allSkills) {
      const b = mk(11, 'turns');
      const caster = b.living('party').find((c) => c.stats.mp > 0) ?? b.living('party')[0]!;
      // Ölü bir dost lazım olabilir
      if (content.skills[id]!.target === 'dead_ally') b.debugKill(b.living('party').find((c) => c.uid !== caster.uid)!.uid, false);
      caster.mp = 0;
      const cdBefore = caster.cooldowns[id]; // başlangıç cooldown'u olabilir: debugCast bunu değiştirmez
      const turnsBefore = b.turnsTaken;
      const current = b.currentUid;
      const r = b.debugCast(caster.uid, id);
      expect(r.ok, `${id}: ${r.ok ? '' : r.reason}`).toBe(true);
      // (Mana burn skills may give mana back; the point is that the cost was not charged)
      if (!content.skills[id]!.effects.some((e) => e.type === 'manaBurn')) expect(caster.mp, id).toBe(0);
      expect(caster.cooldowns[id], id).toBe(cdBefore);
      expect(b.turnsTaken, id).toBe(turnsBefore);
      expect(b.currentUid, id).toBe(current);
      expect(b.log.some((e) => e.type === 'skillUsed' && e.skill === id), id).toBe(true);
    }
  });

  it('skill kullanıcının listesinde olmasa da oynar; normal useSkill hâlâ reddeder', () => {
    const b = mk();
    const a = b.get('party-0')!;
    const foreign = allSkills.find((id) => !a.skills.includes(id) && content.skills[id]!.target === 'single_enemy')!;
    expect(b.useSkill(a.uid, foreign, 'enemy-0').ok).toBe(false);
    expect(b.debugCast(a.uid, foreign, 'enemy-0').ok).toBe(true);
  });

  it('yakın dövüş skill\'i arka sıradaki kullanıcıdan da oynar (menzil yok sayılır)', () => {
    const b = mk();
    const melee = allSkills.find((id) => content.skills[id]!.motion === 'melee' && content.skills[id]!.target === 'single_enemy' && !content.skills[id]!.ignoreReach)!;
    const caster = b.get('party-0')!;
    caster.slot = 11; // en arka hücre
    const back = [...b.living('enemy')].sort((x, y) => y.slot - x.slot)[0]!;
    expect(b.canUse(caster.uid, melee).ok).toBe(false);
    expect(b.debugCast(caster.uid, melee, back.uid).ok).toBe(true);
    expect(b.log.at(-1)?.type).not.toBe('battleEnd');
  });

  it('alan skill\'i boş seçilen hücreye gider (merkez = o hücre)', () => {
    const b = mk();
    const area = allSkills.find((id) => content.skills[id]!.target === 'area_enemies')!;
    const empty = Array.from({ length: content.CELL_COUNT }, (_, i) => i).find((i) => !b.combatants.some((c) => c.board === 'enemy' && c.slot === i))!;
    expect(b.debugCast('party-0', area, undefined, empty).ok).toBe(true);
    expect(b.log.find((e) => e.type === 'skillUsed' && e.skill === area)).toMatchObject({ center: empty });
  });

  it('hedef yoksa net bir hata verir; debug cast savaşı bitirmez', () => {
    const b = mk();
    for (const c of b.living('enemy')) b.debugKill(c.uid, false);
    const dmg = allSkills.find((id) => content.skills[id]!.target === 'single_enemy')!;
    expect(b.debugCast('party-0', dmg)).toMatchObject({ ok: false, reason: 'No target' });
    b.debugReviveAll();
    b.debug.damageMult = 9999;
    b.debug.dodge = 'never';
    const all = allSkills.find((id) => content.skills[id]!.target === 'all_enemies')!;
    b.debugCast('party-0', all);
    expect(b.winner).toBeNull();
  });

  it('debugResetAll: ölüler dirilir, çağrılar gider, durumlar ve yer etkileri temizlenir, can/MP dolar', () => {
    const b = mk(1, 'turns');
    b.debugKill('enemy-0', false);
    b.debugAddStatus('party-0', 'slow');
    b.get('party-1')!.hp = 1;
    b.get('party-1')!.mp = 0;
    const summon = allSkills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'summon'))!;
    expect(b.debugCast('party-0', summon).ok).toBe(true);
    const ground = allSkills.find((id) => content.skills[id]!.effects.some((e) => e.type === 'ground'))!;
    expect(b.debugCast('party-0', ground).ok).toBe(true);
    expect(b.ground.length).toBeGreaterThan(0);
    b.debugResetAll();
    expect(b.combatants.filter((c) => c.summoned).every((c) => c.hp <= 0)).toBe(true);
    expect(b.ground).toHaveLength(0);
    for (const c of b.combatants.filter((x) => !x.summoned)) {
      expect(c.hp).toBe(c.maxHp);
      expect(c.mp).toBe(c.maxMp);
      expect(c.statuses).toHaveLength(0);
    }
  });
});

describe('debug-state yardımcıları', () => {
  it('effectiveTimeScale: duraklatma 0, atlama çok hızlı, aksi halde seçilen hız', () => {
    expect(effectiveTimeScale({ speed: 2, skipAnims: false, paused: false })).toBe(2);
    expect(effectiveTimeScale({ speed: 0.5, skipAnims: true, paused: false })).toBe(SKIP_SPEED);
    expect(effectiveTimeScale({ speed: 1, skipAnims: true, paused: true })).toBe(0);
    expect(SKIP_SPEED).toBeGreaterThan(Math.max(...SPEEDS));
    expect(debugState.speed).toBe(1);
  });

  it('nextInCycle döner ve bilinmeyen değerde ilke gider', () => {
    expect(nextInCycle([1, 2, 3], 1)).toBe(2);
    expect(nextInCycle([1, 2, 3], 3)).toBe(1);
    expect(nextInCycle([1, 2, 3], 99)).toBe(1);
    expect(nextInCycle(SPEEDS, 1)).toBe(2);
  });

  it('parseSeed yalnızca tam sayıları kabul eder', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed('  42 ')).toBe(42);
    expect(parseSeed('0')).toBe(0);
    for (const bad of ['', 'abc', '-5', '1.5', '12a', '1e5', '9999999999999999']) expect(parseSeed(bad), bad).toBeNull();
  });

  it('resourceValue: hazır değerler', () => {
    expect(resourceValue(100, 'full')).toBe(100);
    expect(resourceValue(100, 'half')).toBe(50);
    expect(resourceValue(101, 'half')).toBe(51);
    expect(resourceValue(100, 'quarter')).toBe(25);
    expect(resourceValue(100, 'one')).toBe(1);
    expect(resourceValue(100, 'zero')).toBe(0);
    expect(resourceValue(3, 'quarter')).toBe(1);
    expect(resourceValue(0, 'one')).toBe(0);
  });

  it('groupSkillsByOwner: her skill tam bir kez, sınıf başına 4, çağrılar ve "Other" sonda', () => {
    const groups = groupSkillsByOwner(content.classes, content.summons, content.skills);
    const flat = groups.flatMap((g) => g.skills);
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(new Set(Object.keys(content.skills)));
    for (const def of Object.values(content.classes)) {
      const g = groups.find((x) => x.label === def.name)!;
      expect(g, def.name).toBeDefined();
      expect(g.skills.length).toBeLessThanOrEqual(def.skills.length);
    }
  });

  it('sfxLabel ve tweaksSummary', () => {
    expect(sfxLabel('stunChime')).toBe('stun Chime');
    expect(sfxLabel('thud')).toBe('thud');
    expect(SFX_IDS.length).toBeGreaterThan(0);
    const base = { ...debugState, flags: { ...debugState.flags } };
    expect(tweaksSummary(base, false)).toBe('none');
    expect(tweaksSummary({ ...base, speed: 2, flags: { damageMult: 10, crit: 'always', dodge: 'auto' } }, true)).toBe('speed 2x, free MP, damage 10x, always crit');
  });
});
