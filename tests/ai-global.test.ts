import { describe, expect, it } from 'vitest';
import { Battle, chooseAction, content } from '../src/engine';
import type { AiConfig, BattleMode } from '../src/engine';

/**
 * Yapay zekanın global skill (Rest / Skip Turn / Move Tile) kuralları: her kural için "koşul sağlanınca seçilir, sağlanmazsa seçilmez",
 * saf ve belirleyici, sonsuz döngü yok. Kural değerleri veride (data/ai.json > global); karar taktik değer hesabına bağlıdır (src/engine/ai.ts).
 */
const ai = content.aiConfig;
const classOnly: AiConfig = { ...ai, global: undefined };
const g = ai.global!;
const cells = (map: Record<number, string>) => Array.from({ length: 12 }, (_, i) => map[i] ?? '');
const GLOBALS = Object.keys(content.globalSkills);

/** Hücre listeli savaş; kritik kapalı, isabet tam, kaçınma yok; canlar en az 100 (sağlam birimler: kill kuralı karışmasın). */
function mk(party: Record<number, string>, enemies: Record<number, string>, mode: BattleMode = 'turns', tweak?: (b: Battle) => void): Battle {
  const b = new Battle(content.battleSetup('random-battle', 1, mode, { party: cells(party), enemies: cells(enemies) }, false));
  b.debugClearCooldowns();
  for (const c of b.combatants) {
    Object.assign(c.stats, { critChance: 0, accuracy: 10, evasion: 0 });
    c.maxHp = Math.max(c.maxHp, 100);
    c.hp = c.maxHp;
    c.mp = c.maxMp;
  }
  tweak?.(b);
  return b;
}

/** Sırası gelene kadar pas geçer (sonra tweak ile durumu yeniden kur: pas sırasında MP/cooldown değişebilir). */
function until(b: Battle, uid: string): Battle {
  for (let i = 0; i < 300 && b.currentUid !== uid; i++) b.skipTurn();
  expect(b.currentUid).toBe(uid);
  return b;
}

const pick = (b: Battle, uid: string, cfg: AiConfig = ai) => chooseAction(b, uid, cfg);

describe('YZ global skill: ayarlar ve genel kurallar', () => {
  it('kurallar veride (data/ai.json > global) ve açık; üç skill için ayrı ayar bölümü var', () => {
    expect(g.enabled).toBe(true);
    expect(g.rest.mpBelowRatio).toBeGreaterThan(0);
    expect(g.rest.futureValueShare).toBeGreaterThan(0);
    expect(g.skip.worthlessShare).toBeGreaterThan(0);
    expect(g.move.minAvoidShare).toBeGreaterThan(0);
  });

  it('global ayarı yoksa ya da kapalıysa YZ hiçbir global skill seçmez', () => {
    const make = () => until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender' }), 'party-0');
    const b = make();
    b.get('party-0')!.mp = 0;
    expect(GLOBALS).toContain(pick(b, 'party-0')?.skillId); // açıkken Rest seçilir
    expect(GLOBALS).not.toContain(pick(b, 'party-0', classOnly)?.skillId ?? '');
    expect(GLOBALS).not.toContain(pick(b, 'party-0', { ...ai, global: { ...g, enabled: false } })?.skillId ?? '');
  });

  it('karar saf ve belirleyici: aynı durum aynı seçim; savaş durumu ve olay günlüğü değişmez', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'warrior' }), 'party-0');
    b.get('party-0')!.mp = 0;
    const before = JSON.stringify(b.combatants);
    const log = b.log.length;
    const a = pick(b, 'party-0');
    expect(pick(b, 'party-0')).toEqual(a);
    expect(JSON.stringify(b.combatants)).toBe(before);
    expect(b.log).toHaveLength(log);
  });

  it('çağrılan birimler global skill kullanmaz; test modunda Skip Turn seçilmez', () => {
    let summonedGlobal = 0;
    let testSkip = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 300 && !b.winner; i++) {
        const u = b.currentUid!;
        const choice = pick(b, u);
        if (choice && b.get(u)!.summoned && GLOBALS.includes(choice.skillId)) summonedGlobal++;
        b.applyChoice(u, choice);
      }
      const t = new Battle(content.battleSetup('random-battle', seed, 'test'));
      for (const c of t.combatants.filter((x) => x.hp > 0)) if (pick(t, c.uid)?.skillId === 'skip_turn') testSkip++;
    }
    expect(summonedGlobal).toBe(0);
    expect(testSkip).toBe(0);
  });
});

describe('YZ Rest: MP biriktirmek taktik değer katıyorsa', () => {
  it('MP düşükken ve güçlü skill MP yüzünden yapılamıyorken (Rest onu yapılabilir kılıyorsa) Rest seçilir', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender', 1: 'defender' }), 'party-0');
    const a = b.get('party-0')!;
    a.mp = 2;
    expect(a.mp / a.maxMp).toBeLessThan(g.rest.mpBelowRatio);
    expect(pick(b, 'party-0')).toMatchObject({ skillId: 'rest', reason: 'rest' });
    expect(pick(b, 'party-0', classOnly)?.skillId).toBeDefined(); // global olmadan bedelsiz bir hamle yapardı
  });

  it('MP yeterliyse (bütün güçlü skill\'ler yapılabilir) Rest seçilmez; MP tamamen doluysa Rest zaten yok', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender', 1: 'defender' }), 'party-0');
    expect(b.get('party-0')!.mp).toBe(b.get('party-0')!.maxMp);
    expect(pick(b, 'party-0')?.skillId).not.toBe('rest');
    expect(b.canUseGlobal('party-0', 'rest').ok).toBe(false);
    b.get('party-0')!.mp = Math.round(b.get('party-0')!.maxMp * 0.8);
    expect(pick(b, 'party-0')?.skillId).not.toBe('rest');
  });

  it('öldürebiliyorsa Rest yerine öldürür (öncelik sırası bozulmaz)', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'mage', 1: 'defender' }), 'party-0');
    b.get('party-0')!.mp = 2;
    b.get('enemy-0')!.hp = 1;
    expect(pick(b, 'party-0')).toMatchObject({ reason: 'kill', targetUid: 'enemy-0' });
  });

  it('tehlikedeyken (can düşük ve gelen hasar büyük) Rest denenmez', () => {
    const calm = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender', 1: 'defender' }), 'party-0');
    calm.get('party-0')!.mp = 2;
    expect(pick(calm, 'party-0')?.skillId).toBe('rest');
    const danger = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'warrior', 1: 'mage', 2: 'archer', 4: 'gambler' }), 'party-0');
    const a = danger.get('party-0')!;
    a.mp = 2;
    a.hp = Math.max(1, Math.round(a.maxHp * (g.rest.dangerHpRatio - 0.1)));
    for (const e of danger.combatants.filter((c) => c.side === 'enemy')) Object.assign(e.stats, { str: 60, int: 60, dex: 60 }); // gelen hasar >> can
    expect(pick(danger, 'party-0')?.skillId).not.toBe('rest');
  });

  it('cooldown\'daki güçlü skill\'e MP biriktirmek için (en geç lookaheadTurns tur sonra hazır): Rest; çok uzaktaysa değil', () => {
    const mkB = (cd: number) => {
      const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender', 1: 'defender' }), 'party-0');
      const a = b.get('party-0')!;
      a.cooldowns = { aimed_shot: cd, arrow_rain: 9, piercing_arrow: 9 };
      const need = content.skills.aimed_shot!.cost.amount;
      a.mp = need - 1 - a.stats.mpRegen * 1; // bir tur sonra (yenilenme ile) yetmez; Rest ile yeter
      return b;
    };
    expect(pick(mkB(1), 'party-0')).toMatchObject({ skillId: 'rest' });
    expect(pick(mkB(g.rest.lookaheadTurns + 3), 'party-0')?.skillId).not.toBe('rest');
  });
});

describe('YZ Skip Turn: yapılacak anlamlı hamle yokken ya da 1 tur sonra hazır olacak güçlü skill beklemeye değerse', () => {
  it('hiçbir değerli hamle yoksa ve Rest\'in faydası yoksa (MP dolu) pas yerine Skip Turn seçilir', () => {
    // Warrior arka sırada: yakın dövüş skill'leri kullanılamaz; Charge beklemede, Abyssal Cry'a Rage yok
    const b = until(mk({ 0: 'paladin', 1: 'defender', 2: 'mage', 6: 'warrior' }, { 0: 'archer' }), 'party-3');
    const w = b.get('party-3')!;
    w.cooldowns = { charge: 3 };
    expect(b.canUse('party-3', 'melee_attack').ok).toBe(false);
    expect(pick(b, 'party-3', classOnly)).toBeNull(); // global olmadan pas
    expect(pick(b, 'party-3')).toMatchObject({ skillId: expect.stringMatching(/^(skip_turn|move_tile)$/) });
  });

  it('Skip Turn üst üste sınırı: skip yapıldıktan sonra (sayaç dolu, aynı birim sırada) tekrar skip seçilmez', () => {
    const b = until(mk({ 0: 'paladin', 1: 'defender', 2: 'mage', 6: 'warrior' }, { 0: 'archer' }, 'turns', (x) => x.debugAddStatus('party-3', 'fortify', 1)), 'party-3');
    b.get('party-3')!.cooldowns = { charge: 3 };
    // Move'u devre dışı bırakıp yalnızca Skip kuralını sına
    const noMove: AiConfig = { ...ai, global: { ...g, move: { ...g.move, minAvoidShare: 1e9, minFrontGainShare: 1e9, minAuraGain: 1e9 } } };
    const first = pick(b, 'party-3', noMove);
    if (first?.skillId === 'skip_turn') {
      expect(b.applyChoice('party-3', first).ok).toBe(true);
      expect(b.currentUid).not.toBe('party-3'); // skip artık hemen tekrar oynatmaz (sonraki tur yarı sürede gelir)
      until(b, 'party-3');
      b.get('party-3')!.cooldowns = { charge: 3 };
      expect(pick(b, 'party-3', noMove)?.skillId).not.toBe('skip_turn');
    } else {
      expect(first?.skillId).toBeDefined();
    }
  });

  it('1 tur sonra hazır olacak güçlü skill (Aimed Shot) varken şimdiki hamle onunla kıyaslanınca değersizse Skip Turn', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'defender', 1: 'defender' }), 'party-0');
    const a = b.get('party-0')!;
    const aimed = content.skills.aimed_shot!;
    a.cooldowns = { aimed_shot: 1, arrow_rain: 9, piercing_arrow: 9 };
    a.mp = aimed.cost.amount - a.stats.mpRegen; // yalnızca bedelsiz Quick Shot yapılabilir; bir tur sonra Aimed Shot yetecek
    // Terazi (madde 257): Quick Shot'ın Haste'i de değerdir (Aimed Shot'a daha çabuk varır); Haste zaten üstündeyse yalnızca zayıf vuruş kalır
    a.statuses.push({ kind: 'haste', turns: 5, source: a.uid });
    expect(pick(b, 'party-0', classOnly)?.skillId).toBe('quick_shot');
    expect(pick(b, 'party-0')).toMatchObject({ skillId: 'skip_turn', reason: 'skip' });
    // skill 2+ tur sonra hazırsa beklemek değer katmaz
    a.cooldowns = { aimed_shot: 3, arrow_rain: 9, piercing_arrow: 9 };
    expect(pick(b, 'party-0')?.skillId).not.toBe('skip_turn');
  });

  it('şimdiki hamle öldürüyorsa ya da işlevselse (şifa/çağrı...) Skip seçilmez', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'mage', 1: 'defender' }), 'party-0');
    const a = b.get('party-0')!;
    a.cooldowns = { aimed_shot: 1, arrow_rain: 9, piercing_arrow: 9 };
    a.mp = content.skills.aimed_shot!.cost.amount - a.stats.mpRegen;
    b.get('enemy-0')!.hp = 1;
    expect(pick(b, 'party-0')).toMatchObject({ reason: 'kill' });
  });
});

describe('YZ Move Tile: kırılgan birimi geri çek, yakın dövüşçüyü öne al, aura komşuluğu', () => {
  it('menzilli (kırılgan) birim ön sıradayken düşman yakın dövüşçüsü büyük tehdit ise arkadaki BOŞ yuvaya çekilir (erişim dışı)', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'warrior' }), 'party-0');
    b.get('enemy-0')!.cooldowns = { charge: 3 }; // Charge menzil/ön sıra tanımaz: geri çekilmek onu engellemez, bu yüzden bekletilir
    b.get('party-0')!.hp = Math.round(b.get('party-0')!.maxHp * 0.5); // O3 (madde 254): tam canla geri çekilme yok
    const choice = pick(b, 'party-0');
    expect(choice).toMatchObject({ skillId: 'move_tile', reason: 'move' });
    expect(b.freeTiles('party-0')).toContain(choice!.slot);
    expect(b.rowRank('party-0', choice!.slot)).toBeGreaterThanOrEqual(content.formulas.formation.meleeRows); // yakın dövüş erişimi dışı
    expect(choice!.targetUid).toBe(`tile:${choice!.slot}`); // eski yol (yalnızca targetUid geçen kod) da çalışır
    const legacy = b.useSkill('party-0', choice!.skillId, choice!.targetUid);
    expect(legacy.ok).toBe(true);
    expect(b.get('party-0')!.slot).toBe(choice!.slot);
  });

  it('hareket sonrası üst üste Move seçilmez (salınım yok); birim arkadayken tekrar çekilmez', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'warrior' }), 'party-0');
    b.get('enemy-0')!.cooldowns = { charge: 3 };
    b.get('party-0')!.hp = Math.round(b.get('party-0')!.maxHp * 0.5);
    b.applyChoice('party-0', pick(b, 'party-0'));
    until(b, 'party-0');
    expect(b.lastActionOf('party-0')).toBe('move');
    expect(pick(b, 'party-0')?.skillId).not.toBe('move_tile');
  });

  it('düşmanda yakın dövüşçü yoksa (tehdit yok) geri çekilmez', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin' }, { 0: 'archer', 1: 'mage' }), 'party-0');
    expect(pick(b, 'party-0')?.skillId).not.toBe('move_tile');
  });

  it('geri çekilecek erişim dışı boş yuva yoksa Move seçilmez (arkada yer yok)', () => {
    // Arka sıraların tamamı dolu: yalnızca ön sırada boş yuva var (hepsi hâlâ erişilebilir)
    const party: Record<number, string> = { 0: 'archer', 3: 'paladin', 4: 'defender', 5: 'warrior', 6: 'mage', 7: 'druid', 8: 'undead', 9: 'gambler', 10: 'antimage', 11: 'paladin' };
    const b = until(mk(party, { 0: 'warrior' }), 'party-0');
    expect(pick(b, 'party-0')?.skillId).not.toBe('move_tile');
  });

  it('yakın dövüşçü şu an melee yapamıyorsa (ön sırada değil) ve öne boş yuva varsa öne geçer', () => {
    const b = until(mk({ 0: 'paladin', 4: 'warrior' }, { 0: 'defender', 1: 'mage' }), 'party-1');
    const w = b.get('party-1')!;
    w.cooldowns = { charge: 3 }; // Charge (ön sıra kuralından muaf) yok: yalnızca öne geçerek vurabilir
    expect(b.canUse('party-1', 'melee_attack').ok).toBe(false);
    const choice = pick(b, 'party-1');
    expect(choice).toMatchObject({ skillId: 'move_tile', reason: 'move' });
    expect(b.canMeleeFrom('party-1', choice!.slot!)).toBe(true);
    expect(b.applyChoice('party-1', choice).ok).toBe(true);
    expect(b.canUse('party-1', 'melee_attack').ok || b.currentUid !== 'party-1').toBe(true);
  });

  it('öne boş yuva yoksa öne geçme olmaz', () => {
    // Ön sıra dolu (3 birim)
    const b = until(mk({ 0: 'paladin', 1: 'defender', 2: 'druid', 4: 'warrior' }, { 0: 'defender', 1: 'mage' }), 'party-3');
    b.get('party-3')!.cooldowns = { charge: 3 };
    expect(pick(b, 'party-3')?.skillId).not.toBe('move_tile');
  });

  it('yaralı yakın dövüşçü, büyük yakın dövüş tehdidi altında erişim dışına çekilir; sağlıklıyken çekilmez', () => {
    const mkB = (ratio: number) => {
      const b = until(mk({ 0: 'warrior', 3: 'paladin' }, { 0: 'warrior' }), 'party-0');
      const w = b.get('party-0')!;
      w.hp = Math.round(w.maxHp * ratio);
      w.cooldowns = { charge: 3 }; // terazi: Charge'ın Stun'ı tek tehdidi durdurup kurtarırdı (o daha değerli); burada yalnızca kaçmak/vurmak
      Object.assign(b.get('enemy-0')!.stats, { str: 60 });
      b.get('enemy-0')!.cooldowns = { charge: 3 };
      return b;
    };
    const hurt = pick(mkB(g.move.retreatHpRatio - 0.15), 'party-0');
    expect(hurt?.skillId).toBe('move_tile');
    expect(pick(mkB(0.9), 'party-0')?.skillId).not.toBe('move_tile');
  });

  it('zırh aurası: Defender daha çok dostun bitişiğine geçmek (ve yakın dövüşü korumak) için hareket eder; kazanç yoksa etmez', () => {
    // Defender (0), dostlar 2 (aynı sıra) ve 4 (bir sıra geride): 1 numaralı yuva ikisine de bitişik. Taunt zaten açık (taunt önceliği boş kalsın)
    const mkB = (party: Record<number, string>) => {
      const b = until(mk(party, { 0: 'warrior', 1: 'mage', 2: 'archer' }), 'party-0');
      b.get('party-0')!.statuses.push({ kind: 'taunt', turns: 3, source: 'party-0' });
      // Terazi: Defender'ın saldırısı değersiz olsun (güçsüz; düşmanlar zaten yavaş) ki aura hareketi sınansın
      Object.assign(b.get('party-0')!.stats, { str: 1 });
      for (const c of b.combatants.filter((x) => x.side === 'party' && x.uid !== 'party-0')) c.statuses.push({ kind: 'guard', turns: 9, source: 'party-0' });
      for (const e of b.combatants.filter((c) => c.side === 'enemy')) e.statuses.push({ kind: 'slow', turns: 9, source: 'x' });
      return b;
    };
    const b = mkB({ 0: 'defender', 2: 'mage', 4: 'archer' });
    const choice = pick(b, 'party-0');
    expect(choice).toMatchObject({ skillId: 'move_tile', slot: 1, reason: 'move' });
    expect(b.canMeleeFrom('party-0', 1)).toBe(true); // yakın dövüş yeteneği korunur
    expect(pick(b, 'party-0', classOnly)?.skillId).not.toBe('move_tile'); // global olmadan hareket yok
    // kazanç yoksa (bitişik yuvadan bir dosta daha ulaşılamıyor) ya da dostu yoksa hareket yok
    // madde 261: tek dost (Mage, 3): hiçbir yuva daha çok dosta bitişik değil (eski 3: mage + 5: archer kurgusunda 0 -> 2 takası şeride göre
    // değişen düşman alan hasarı yüzünden küçük ama gerçek bir aura kazancı verebiliyordu)
    expect(pick(mkB({ 0: 'defender', 3: 'mage' }), 'party-0')?.skillId).not.toBe('move_tile');
    expect(pick(mkB({ 0: 'defender' }), 'party-0')?.skillId).not.toBe('move_tile');
  });

  it('Defender aura için geriye çekilmez (ön sıradaki dostlar korumasız kalmasın)', () => {
    const b = until(mk({ 0: 'defender', 4: 'paladin', 6: 'mage', 8: 'archer' }, { 0: 'warrior', 1: 'mage', 2: 'archer' }), 'party-0');
    b.get('party-0')!.statuses.push({ kind: 'taunt', turns: 3, source: 'party-0' });
    const choice = pick(b, 'party-0');
    if (choice?.skillId === 'move_tile') expect(b.rowOf(choice.slot!)).toBeLessThanOrEqual(b.rowOf(0));
    expect(choice?.skillId === 'move_tile' && b.rowOf(choice.slot!) > b.rowOf(0)).toBe(false);
  });

  it('madde 258: ölü dostun ceset hücresi de Move adayıdır; seçilen hücre her zaman geçerli', () => {
    const b = until(mk({ 0: 'archer', 3: 'paladin', 6: 'warrior' }, { 0: 'warrior' }), 'party-0');
    b.get('enemy-0')!.cooldowns = { charge: 3 };
    b.debugKill('party-2', false); // arka sıradaki Warrior düştü: yuvası (6) ceset hücresi
    b.get('party-0')!.hp = Math.round(b.get('party-0')!.maxHp * 0.5);
    expect(b.freeTiles('party-0')).toContain(6);
    const choice = pick(b, 'party-0');
    expect(choice).toMatchObject({ skillId: 'move_tile' });
    expect(b.canUseGlobal('party-0', 'move_tile', choice!.slot).ok).toBe(true);
    for (let seed = 1; seed <= 40; seed++) {
      const r = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      for (let i = 0; i < 400 && !r.winner; i++) {
        const u = r.currentUid!;
        const c = pick(r, u);
        if (c?.skillId === 'move_tile') expect(r.canUseGlobal(u, 'move_tile', c.slot).ok).toBe(true);
        r.applyChoice(u, c);
      }
    }
  });
});

/**
 * Bilinen tıkanmalar (global skill kilidi DEĞİL; her eylem geçerli): seed 12 sonunda Undead'e karşı Undead kalır; iki taraf da lifesteal + Dark Bond +
 * MP/can yenilenmesi + sürekli Raise Dead ile hasarı karşılar (Bone Throw büyü/dark oldu, 2026-10-10; Undead'e hasarı fiilen aynı: eskiden 1,12 x zırh
 * 8 ~ 0,89, şimdi 0,90). `npm run sim` 2000 savaşta bitmeyen oranı %0,10 -> %0,15. Ayrı YZ işi (Undead aynası odak): open-questions madde 289.
 */
const KNOWN_STALLS = new Set([12]);

describe('YZ global skill: tam savaşlar (kilitlenme yok, sınırlar korunur)', () => {
  it('60 rastgele savaş biter; her eylem geçerli; hiçbir birim üst üste maxConsecutive\'den fazla skip ya da iki kez Move yapmaz; üç global de kullanılır', () => {
    const used = new Map<string, number>();
    const maxSkip = content.globalSkills.skip_turn!.maxConsecutive!;
    for (let seed = 1; seed <= 60; seed++) {
      const b = new Battle(content.battleSetup('random-battle', seed, 'turns'));
      const run = new Map<string, number>();
      const lastMove = new Map<string, boolean>();
      for (let i = 0; i < 600 && !b.winner; i++) {
        const u = b.currentUid!;
        const choice = pick(b, u);
        const r = b.applyChoice(u, choice);
        expect(r.ok, `seed ${seed} tur ${i} ${choice?.skillId}`).toBe(true);
        const id = choice?.skillId ?? '';
        if (GLOBALS.includes(id)) used.set(id, (used.get(id) ?? 0) + 1);
        const skip = id === 'skip_turn';
        run.set(u, skip ? (run.get(u) ?? 0) + 1 : 0);
        expect(run.get(u)!, `seed ${seed} ${u} üst üste skip`).toBeLessThanOrEqual(maxSkip);
        expect(id === 'move_tile' && lastMove.get(u), `seed ${seed} ${u} üst üste move`).toBeFalsy();
        lastMove.set(u, id === 'move_tile');
      }
      if (KNOWN_STALLS.has(seed)) continue; // eylemler geçerli olmalı (yukarıda denetlendi); savaşın bitmesi beklenmez
      expect(b.winner, `seed ${seed}`).not.toBeNull();
    }
    for (const id of GLOBALS) expect(used.get(id) ?? 0, id).toBeGreaterThan(0);
  });

  it('farklı takım boyutlarında da kilitlenme yok (1v1, 3v7, 12v12)', () => {
    for (const [p, e] of [[1, 1], [3, 7], [12, 12]] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const b = new Battle(content.battleSetup('random-battle', seed, 'turns', { partySize: p, enemySize: e }));
        for (let i = 0; i < 1500 && !b.winner; i++) {
          const u = b.currentUid!;
          const r = b.applyChoice(u, pick(b, u));
          expect(r.ok, `${p}v${e} seed ${seed} tur ${i}`).toBe(true);
        }
        expect(b.winner, `${p}v${e} seed ${seed}`).not.toBeNull();
      }
    }
  });
});
