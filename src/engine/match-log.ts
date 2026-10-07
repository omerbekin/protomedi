import { unitLabel } from './ai';
import { shapeLabel } from './area-shape';
import type { AiExplanation } from './ai';
import type { Battle, BattleObserver, ObservedAction } from './battle';
import type { BattleEvent, Combatant, SkillDef, SkillEffect } from './types';

/**
 * Maç kaydı: bir savaşın her hamlesini (öncesi durum, seçilen eylem, AI karar gerekçesi, sonuç olayları, sonrası durum) kaydeder ve
 * panoya kopyalanıp başkasına yapıştırılabilen düz metne çevirir ("Warrior neden 3. turda Whirlwind yerine Double Strike kullandı?").
 * Saf TypeScript (Phaser/DOM yok). Motora YALNIZCA salt-okunur gözlemci olarak bağlanır (Battle.observer + battle.on): durumu ve RNG'yi değiştirmez.
 * Biçimin açıklaması: docs/design/match-log.md.
 */

export interface MatchLogMeta {
  /** Oyun sürümü / derleme zamanı / commit (başlık satırı; hepsi isteğe bağlı). */
  version?: string;
  builtAt?: string;
  commit?: string;
  /** Başlığa eklenen serbest not (ör. "debug: free MP on"). */
  note?: string;
}

export interface UnitSnap {
  label: string;
  cell: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  rage?: number;
  shield: number;
  magicShield: number;
  armor: number;
  magicArmor: number;
  spd: number;
  counter: number;
  speedBoost: number;
  cooldowns: Record<string, number>;
  statuses: string[];
  ground: string[];
  board: string;
  summoned: boolean;
}

export interface MoveRecord {
  /** Kayıttaki sıra numarası (1'den). */
  n: number;
  /** Savaşta o ana kadar oynanan hamle sayısı + 1 (tüm birimler). */
  turn: number;
  /** Bu birimin kaçıncı kendi hamlesi. */
  own: number;
  uid: string;
  actor: string;
  side: 'party' | 'enemy';
  /** Hamleyi kim verdi: oyuncu (arayüzden) ya da yapay zeka. */
  control: 'player' | 'ai' | 'auto';
  /** Hamleden önceki durum. */
  pre: { self: UnitSnap; foes: UnitSnap[]; allies: UnitSnap[] };
  /** Önceki hamleden bu hamleye kadar olanlar (yer hasarı, tur başı şifa, biten durumlar...). */
  startEffects: string[];
  action: { kind: 'skill' | 'global' | 'pass' | 'stunned' | 'skipped'; id?: string; name: string; targets: string[]; center?: number; cells?: number[]; slot?: number; /** area_any: alanın atıldığı tahta ('own' / 'foe'). */ board?: 'own' | 'foe' };
  ai?: AiExplanation | { none: true };
  events: string[];
  post: { self: UnitSnap; targets: UnitSnap[] };
  /** Hamleden sonra savaş bitti mi (kazanan taraf). */
  winner?: 'party' | 'enemy';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function snapshotUnit(battle: Battle, c: Combatant): UnitSnap {
  return {
    label: unitLabel(c),
    cell: c.slot,
    hp: c.hp,
    maxHp: c.maxHp,
    mp: c.mp,
    maxMp: c.maxMp,
    ...(c.maxRage !== undefined ? { rage: c.rage ?? 0 } : {}),
    shield: c.shield,
    magicShield: c.magicShield,
    armor: Math.round(battle.effectiveStats(c).armor),
    magicArmor: Math.round(battle.effectiveStats(c).magicArmor),
    spd: battle.speedOf(c),
    counter: Math.round(c.turnCounter),
    speedBoost: battle.speedBoostOf(c.uid),
    cooldowns: { ...c.cooldowns },
    statuses: c.statuses.map((s) => `${s.kind}:${s.turns}`),
    ground: battle.ground.filter((g) => g.board === c.board && g.slots.includes(c.slot)).map((g) => `${g.ground}:${g.turns}${g.sourceSide === c.side ? '(own)' : ''}`),
    board: c.board,
    summoned: c.summoned,
  };
}

/**
 * Bir olayın tek satırlık özeti (kayıtta "result" listesi). skillUsed / globalUsed eylemin kendisi olduğu için boş döner.
 * Aşamalı alan skill'inin olayları başta aşama numarasını taşır: "[stage 1] ...".
 */
export function describeEvent(battle: Battle, e: BattleEvent): string | null {
  const text = describeEventBody(battle, e);
  return text !== null && e.stage !== undefined ? `[stage ${e.stage}] ${text}` : text;
}

function describeEventBody(battle: Battle, e: BattleEvent): string | null {
  const L = (uid: string): string => {
    const c = battle.get(uid);
    return c ? unitLabel(c) : uid;
  };
  switch (e.type) {
    case 'battleStart':
    case 'skillUsed':
    case 'globalUsed':
    case 'turnStart':
      return null;
    case 'resource':
      return `${L(e.actor)} pays ${e.amount} ${e.resource} (now ${e.after})`;
    case 'rage':
      return `${L(e.actor)} rage ${e.delta >= 0 ? '+' : ''}${e.delta} (now ${e.after}/${e.max})`;
    case 'damage':
      return `${L(e.source)} -> ${L(e.target)}: ${e.amount} dmg${e.absorbed ? ` (+${e.absorbed} absorbed)` : ''}${e.crit ? ' CRIT' : ''}${e.redirected ? ' (guard redirect)' : ''}, hp ${e.hpAfter}${e.shieldAfter ? `, shield ${e.shieldAfter}` : ''}${e.magicShieldAfter ? `, mshield ${e.magicShieldAfter}` : ''}`;
    case 'dodge':
      return `${L(e.source)} -> ${L(e.target)}: DODGED`;
    case 'miss':
      return `${L(e.source)} -> ${L(e.target)}: MISSED`;
    case 'heal':
      return `${L(e.source)} heals ${L(e.target)} ${e.amount}${e.crit ? ' CRIT' : ''}, hp ${e.hpAfter}`;
    case 'shield':
      return `${L(e.source)} -> ${L(e.target)}: ${e.amount >= 0 ? '+' : ''}${e.amount} ${e.magic ? 'magic ' : ''}shield (now ${e.magic ? e.magicShieldAfter : e.shieldAfter})`;
    case 'manaBurn':
      return `${L(e.source)} burns ${e.amount} MP of ${L(e.target)} (now ${e.mpAfter})`;
    case 'status':
      return `${L(e.target)} +${e.status} ${e.turns}t (from ${L(e.source)})${e.cause ? ` [${e.cause}]` : ''}`;
    case 'statusEnd':
      return `${L(e.target)} -${e.status}${e.broken ? ' (ended early: broken / control)' : ' (expired)'}`;
    case 'summon':
      return `${L(e.actor)} summons ${unitLabel(e.combatant)}${e.empowered === true ? ' EMPOWERED (fed: corpse consumed)' : e.empowered === false ? ' unfed (no corpse to consume)' : ''} (hp ${e.combatant.hp}, str ${e.combatant.stats.str}, int ${e.combatant.stats.int}, own board cell ${e.combatant.slot})`;
    case 'corpseConsumed':
      return `${L(e.by)} consumes the corpse of ${L(e.uid)} (cell ${e.slot}): it can no longer be revived`;
    case 'despawn':
      return `${L(e.target)} despawns`;
    case 'revive':
      return `${L(e.source)} revives ${L(e.target)} (hp ${e.hpAfter}, mp ${e.mpAfter})`;
    case 'mpRegen':
      return `${L(e.actor)} +${e.amount} MP (now ${e.after})`;
    case 'moved':
      return `${L(e.actor)} moves cell ${e.from} -> ${e.to}`;
    case 'passive':
      return `${L(e.actor)} passive: ${e.name}`;
    case 'turnSkipped':
      return e.stunned ? `${L(e.actor)} is stunned: turn skipped` : e.voluntary ? `${L(e.actor)} skips the turn (speed boost +${Math.round((e.speedBoost ?? 0) * 100)}%)` : `${L(e.actor)} had nothing to do: turn passed`;
    case 'ground':
      return `ground ${e.ground} on ${e.board} cells [${e.slots.join(',')}] for ${e.turns}t`;
    case 'groundEnd':
      return `ground effect ${e.id} ended`;
    case 'death':
      return `${L(e.target)} DIED${e.corpse ? ' (leaves a revivable corpse)' : ''}`;
    case 'battleEnd':
      return `BATTLE END: ${e.winner} wins`;
  }
}

/** Skill etkisinin kompakt, okunur özeti ("damage(scale=str power=1.2 ...)"). */
export function compactEffect(e: SkillEffect): string {
  const parts = Object.entries(e)
    .filter(([k, v]) => k !== 'type' && v !== undefined)
    .map(([k, v]) => (typeof v === 'object' ? `${k}=${JSON.stringify(v)}` : `${k}=${v}`));
  return `${e.type}(${parts.join(' ')})`;
}

export interface MatchLogOptions {
  /** Metin çıktının üst sınırı (karakter); aşılırsa SONDAKİ hamleler kırpılır ve "truncated" yazılır. Varsayılan 190000. */
  maxChars?: number;
}

export const DEFAULT_MAX_CHARS = 190_000;

export class MatchLog {
  readonly moves: MoveRecord[] = [];
  private current: MoveRecord | null = null;
  private pendingAi: AiExplanation | { none: true } | null = null;
  /** Önceki eylemin bitiminden bu yana toplanan olay özetleri (tur başı etkiler). */
  private buffer: string[] = [];
  private turnStartIdx = -1;
  private turnSnap: { actor: Combatant; pre: MoveRecord['pre'] } | null = null;
  private readonly ownCount = new Map<string, number>();
  private off: (() => void) | null = null;
  private readonly dealt = new Map<string, number>();
  private readonly taken = new Map<string, number>();
  private readonly healed = new Map<string, number>();
  private rosterLines: string[] = [];

  constructor(private readonly battle: Battle, private readonly meta: MatchLogMeta | (() => MatchLogMeta) = {}, private readonly opts: MatchLogOptions = {}) {
    this.rosterLines = this.buildRoster();
    this.start();
  }

  /** Gözlemciyi ve olay dinleyicisini bağlar (kurucu çağırır). */
  private start(): void {
    const b = this.battle;
    const obs: BattleObserver = {
      before: (info) => this.onBefore(info),
      after: (uid) => this.onAfter(uid),
    };
    b.observer = obs;
    this.off = b.on((e) => this.onEvent(e));
    // İlk tur, kurucuda (kayıttan önce) başlamıştı: aktör ve durumu şimdi yakala
    if (b.mode === 'turns' && b.currentActor) this.snapTurn(b.currentActor);
  }

  stop(): void {
    this.off?.();
    this.off = null;
    if (this.battle.observer) this.battle.observer = null;
  }

  /** Yapay zeka kararı: bir sonraki hamle (applyChoice'tan hemen önce çağrılır) AI olarak işaretlenir ve gerekçesi eklenir. */
  noteAi(explanation: AiExplanation | null): void {
    this.pendingAi = explanation ?? { none: true };
  }

  get moveCount(): number {
    return this.moves.length + (this.current ? 1 : 0);
  }

  private snapTurn(actor: Combatant): void {
    this.turnSnap = { actor, pre: this.preState(actor) };
    this.turnStartIdx = this.buffer.length;
  }

  private preState(actor: Combatant): MoveRecord['pre'] {
    const b = this.battle;
    const alive = b.combatants.filter((c) => c.hp > 0 && c.uid !== actor.uid);
    return {
      self: snapshotUnit(b, actor),
      foes: alive.filter((c) => c.side !== actor.side).map((c) => snapshotUnit(b, c)),
      allies: alive.filter((c) => c.side === actor.side).map((c) => snapshotUnit(b, c)),
    };
  }

  private onEvent(e: BattleEvent): void {
    const b = this.battle;
    // Sayaçlar (sonuç özeti için): çağrıların işi sahibine yazılır
    const credit = (uid: string) => {
      const c = b.get(uid);
      return c?.summoned && c.owner ? c.owner : uid;
    };
    if (e.type === 'damage' && e.amount > 0) {
      const src = credit(e.source);
      const dst = credit(e.target);
      this.taken.set(dst, (this.taken.get(dst) ?? 0) + e.amount);
      const a = b.get(src);
      const t = b.get(dst);
      if (src !== dst && a && t && a.side !== t.side) this.dealt.set(src, (this.dealt.get(src) ?? 0) + e.amount);
    } else if (e.type === 'heal' && e.amount > 0) this.healed.set(credit(e.source), (this.healed.get(credit(e.source)) ?? 0) + e.amount);

    if (e.type === 'turnStart') {
      const actor = b.get(e.actor);
      if (actor && !this.current) this.snapTurn(actor);
      return;
    }
    const text = describeEvent(b, e);
    if (text === null) return;
    (this.current ? this.current.events : this.buffer).push(text);
  }

  private onBefore(info: ObservedAction): void {
    const b = this.battle;
    const actor = b.get(info.actorUid);
    if (!actor) return;
    this.current = {
      n: this.moves.length + 1,
      turn: b.turnsTaken + 1,
      own: (this.ownCount.get(actor.uid) ?? 0) + 1,
      uid: actor.uid,
      actor: unitLabel(actor),
      side: actor.side,
      control: this.pendingAi ? 'ai' : 'player',
      pre: this.preState(actor),
      startEffects: this.buffer,
      action: this.describeAction(info),
      ...(this.pendingAi ? { ai: this.pendingAi } : {}),
      events: [],
      post: { self: snapshotUnit(b, actor), targets: [] },
    };
    this.ownCount.set(actor.uid, this.current.own);
    this.pendingAi = null;
    this.buffer = [];
    this.turnSnap = null;
  }

  private describeAction(info: ObservedAction): MoveRecord['action'] {
    const b = this.battle;
    const labels = (info.targetUids ?? []).map((u) => {
      const c = b.get(u);
      return c ? unitLabel(c) : u;
    });
    if (info.kind === 'pass') return { kind: 'pass', name: 'Pass (nothing to do)', targets: [] };
    if (info.kind === 'global') return { kind: 'global', id: info.id, name: b.globalDef(info.id!)?.name ?? info.id!, targets: [], ...(info.center !== undefined ? { slot: info.center } : {}) };
    return { kind: 'skill', id: info.id, name: b.skill(info.id!)?.name ?? info.id!, targets: labels, ...(info.center !== undefined ? { center: info.center } : {}), ...(info.cells ? { cells: info.cells } : {}), ...(info.board ? { board: info.board === b.get(info.actorUid)?.side ? ('own' as const) : ('foe' as const) } : {}) };
  }

  private onAfter(uid: string): void {
    const b = this.battle;
    const actor = b.get(uid);
    if (!actor) return;
    let move = this.current;
    if (!move) {
      // Sersemlemiş birim: eylem yok, yalnızca pas (before gelmedi); turnStart'ta yakalanan durumu kullan
      const snap = this.turnSnap && this.turnSnap.actor.uid === uid ? this.turnSnap : null;
      move = {
        n: this.moves.length + 1,
        turn: b.turnsTaken,
        own: (this.ownCount.get(uid) ?? 0) + 1,
        uid,
        actor: unitLabel(actor),
        side: actor.side,
        control: 'auto',
        pre: snap?.pre ?? this.preState(actor),
        startEffects: this.buffer.slice(0, Math.max(0, this.turnStartIdx)),
        action: actor.hp <= 0 ? { kind: 'skipped', name: 'Died at turn start (turn skipped)', targets: [] } : { kind: 'stunned', name: 'Stunned (turn skipped)', targets: [] },
        events: this.buffer.slice(Math.max(0, this.turnStartIdx)),
        post: { self: snapshotUnit(b, actor), targets: [] },
      };
      this.ownCount.set(uid, move.own);
      this.buffer = [];
      this.turnSnap = null;
      this.turnStartIdx = -1;
    } else {
      this.current = null;
      move.post.self = snapshotUnit(b, actor);
    }
    // Hedeflerin sonrası: eylemde adı geçen ve olaylarda etkilenen canlı/ölü birimler
    const seen = new Set<string>();
    for (const c of b.combatants) {
      if (c.uid === uid) continue;
      const lab = unitLabel(c);
      if (move.action.targets.includes(lab) || move.events.some((t) => t.includes(`${lab}`))) seen.add(c.uid);
    }
    move.post.targets = [...seen].map((u) => snapshotUnit(b, b.get(u)!));
    if (b.winner) move.winner = b.winner;
    this.moves.push(move);
  }

  // ------------------------------------------------------------ metin çıktı

  private buildRoster(): string[] {
    const b = this.battle;
    const lines: string[] = [];
    for (const c of b.combatants) {
      const s = c.stats;
      const prim = s.primary ? `${s.primary}${s.primaryActive ? ' (active)' : ' (inactive)'}${s.resilience ? ` resilience ${s.resilience}` : ''}${s.hunterMark ? ` hunterMark ${s.hunterMark}` : ''}${s.manaEcho ? ` manaEcho ${s.manaEcho}` : ''}${s.surviveChance ? ` surviveChance ${s.surviveChance}` : ''}` : 'none';
      lines.push(
        `${unitLabel(c)} [${c.defId}] cell ${c.slot}${c.summoned ? ' (summon)' : ''} | STR ${s.str} INT ${s.int} DEX ${s.dex} LUCK ${s.luck} | maxHP ${c.maxHp} maxMP ${c.maxMp}${c.maxRage !== undefined ? ` maxRage ${c.maxRage}` : ''} spd ${s.spd} armor ${s.armor} marmor ${s.magicArmor} evasion ${r1(s.evasion * 100)}% accuracy ${r1(s.accuracy * 100)}% crit ${r1(s.critChance * 100)}% x${s.critMult} | regen hp ${s.hpRegen} mp ${s.mpRegen} | primary ${prim} | passive ${c.passive ? `${c.passive.name} ${JSON.stringify(c.passive.effect)}` : 'none'} | ai ${c.ai ?? 'default'} tags [${c.tags.join(',')}]`,
      );
      for (const id of c.skills) {
        const sk = b.skill(id);
        if (!sk) continue;
        lines.push(`    ${skillLine(sk)}`);
      }
    }
    return lines;
  }

  private header(truncatedNote: string): string[] {
    const b = this.battle;
    const m = typeof this.meta === 'function' ? this.meta() : this.meta;
    const party = b.combatants.filter((c) => c.side === 'party' && !c.summoned).length;
    const enemy = b.combatants.filter((c) => c.side === 'enemy' && !c.summoned).length;
    const lines = [
      '# MATCH LOG (format v1; see docs/design/match-log.md)',
      `game: ${[m.version && `v${m.version}`, m.builtAt && `built ${m.builtAt}`, m.commit && `commit ${m.commit}`].filter(Boolean).join(', ') || 'unknown build'}`,
      `seed: ${b.seed} | mode: ${b.mode} | teams: party ${party} vs enemy ${enemy} | turn threshold ${b.formulas.turn.threshold}${m.note ? ` | ${m.note}` : ''}`,
      `status: ${b.winner ? `finished, winner ${b.winner}` : 'in progress'} | moves recorded: ${this.moves.length}${truncatedNote}`,
      'legend: P0/E3 = side + team index, name after ":"; cN = formation cell (row*3+lane, 0 = front); ar = armor; cd = cooldown in own turns; ctr = turn counter (acts at threshold); st = statuses name:turns. AI candidates: dmg = expected damage x hit chance summed over ALL hit foes; net = value - cost; score = the own score of the winning priority rule; * chosen, - not chosen, x blocked by an ai hint / MP reserve',
      '',
      '## ROSTER (start of match; derived stats already include attributes/primary/passives)',
      ...this.rosterLines,
    ];
    return lines;
  }

  /** Metin kaydı: başlık + kadrolar + her hamle + savaş sonu özeti. Üst sınır aşılırsa SONDAKİ hamleler kırpılır. */
  serialize(): string {
    const max = this.opts.maxChars ?? DEFAULT_MAX_CHARS;
    const summary = this.summary();
    const headerBase = this.header('').join('\n');
    // Boyut kademeleri: önce tam ayrıntı; sığmazsa sıkıştırılmış (adaylar kısaltılır, dost/düşman yalnızca can); yine sığmazsa sondaki hamleler kırpılır
    let compact = false;
    let blocks = this.moves.map((mv) => this.formatMove(mv, false));
    if (headerBase.length + summary.length + 400 + blocks.reduce((a, bl) => a + bl.length + 1, 0) > max) {
      compact = true;
      blocks = this.moves.map((mv) => this.formatMove(mv, true));
    }
    let used = headerBase.length + summary.length + 400;
    let shown = 0;
    for (const bl of blocks) {
      if (used + bl.length + 1 > max) break;
      used += bl.length + 1;
      shown++;
    }
    const omitted = blocks.length - shown;
    const head = this.header(omitted > 0 ? ` | TRUNCATED: showing first ${shown} of ${blocks.length} moves (size limit ${max} chars)${compact ? ', compact detail' : ''}` : compact ? ' | compact detail (log was large: fewer AI candidates, foes/allies as hp only)' : '').join('\n');
    const out = [head, '', '## MOVES', ...blocks.slice(0, shown)];
    if (omitted > 0) out.push(`[truncated: ${omitted} later move(s) omitted to stay under ${max} characters]`);
    out.push('', summary);
    return out.join('\n');
  }

  private summary(): string {
    const b = this.battle;
    const lines = ['## RESULT', b.winner ? `winner: ${b.winner} | total moves: ${b.turnsTaken}` : `battle still in progress | moves so far: ${b.turnsTaken}`];
    lines.push('per unit (damage dealt to enemies / damage taken / healing done; summons credited to owner):');
    for (const c of b.combatants.filter((x) => !x.summoned)) {
      lines.push(`  ${unitLabel(c)}: dealt ${this.dealt.get(c.uid) ?? 0}, taken ${this.taken.get(c.uid) ?? 0}, healed ${this.healed.get(c.uid) ?? 0}, hp ${c.hp}/${c.maxHp}${c.hp <= 0 ? ' (dead)' : ''}`);
    }
    return lines.join('\n');
  }

  private formatMove(m: MoveRecord, compact: boolean): string {
    const out: string[] = [];
    const tgt = m.action.targets.length > 0 ? ` -> ${m.action.targets.length > 3 ? `${m.action.targets.slice(0, 3).join(', ')} +${m.action.targets.length - 3}` : m.action.targets.join(', ')}` : '';
    out.push(`### #${m.n} | turn ${m.turn} | ${m.actor} (own move ${m.own}) | ${m.control === 'ai' ? 'AI' : m.control === 'auto' ? 'AUTO' : 'PLAYER'} | ${m.action.name}${tgt}${m.action.center !== undefined ? ` (center cell ${m.action.center}${m.action.board ? ` on ${m.action.board} side` : ''}${m.action.cells ? ` -> cells [${m.action.cells.join(',')}]` : ''})` : ''}${m.action.kind === 'global' && m.action.slot !== undefined ? ` (to cell ${m.action.slot})` : ''}`);
    out.push(`before: ${unitText(m.pre.self, true)}`);
    const side = compact ? afterText : (u: UnitSnap) => unitText(u, false);
    if (m.pre.foes.length > 0) out.push(`  foes: ${m.pre.foes.map(side).join(' ; ')}`);
    if (m.pre.allies.length > 0) out.push(`  allies: ${m.pre.allies.map(side).join(' ; ')}`);
    if (m.startEffects.length > 0) out.push(`  between moves (turn-start effects, debug actions): ${m.startEffects.join(' | ')}`);
    if (m.ai) out.push(...formatAi(m.ai, compact));
    out.push(`result: ${m.events.length > 0 ? m.events.join(' | ') : '(no events)'}`);
    out.push(`after: ${unitText(m.post.self, true)}${m.post.targets.length > 0 ? ` ;; ${m.post.targets.map(afterText).join(' ; ')}` : ''}${m.winner ? ` ;; BATTLE OVER: ${m.winner} wins` : ''}`);
    return out.join('\n');
  }
}

function afterText(u: UnitSnap): string {
  return `${u.label} hp ${u.hp}/${u.maxHp}${u.shield ? ` sh ${u.shield}` : ''}${u.statuses.length > 0 ? ` st[${u.statuses.join(',')}]` : ''}${u.hp <= 0 ? ' DEAD' : ''}`;
}

function unitText(u: UnitSnap, detailed: boolean): string {
  const cd = Object.entries(u.cooldowns).map(([k, v]) => `${k}:${v}`);
  const base = `${u.label} c${u.cell} hp ${u.hp}/${u.maxHp}${u.shield ? ` sh ${u.shield}` : ''}${u.magicShield ? ` msh ${u.magicShield}` : ''}`;
  const mid = `${u.maxMp > 0 ? ` mp ${u.mp}/${u.maxMp}` : ''}${u.rage !== undefined ? ` rage ${u.rage}` : ''}`;
  const extra = `${u.statuses.length > 0 ? ` st[${u.statuses.join(',')}]` : ''}${u.ground.length > 0 ? ` ground[${u.ground.join(',')}]` : ''}`;
  if (!detailed) return `${base}${mid} ar ${u.armor}${extra}`;
  return `${base}${mid} spd ${u.spd}${u.speedBoost > 0 ? ` boost +${Math.round(u.speedBoost * 100)}%` : ''} ctr ${u.counter} armor ${u.armor}/${u.magicArmor} cd[${cd.join(',') || '-'}]${extra || ' st[-]'}${u.board !== (u.label.startsWith('P') ? 'party' : 'enemy') ? ` board ${u.board}` : ''}${u.summoned ? ' (summon)' : ''}`;
}

const MAX_CANDIDATES = 8;

function formatAi(ai: AiExplanation | { none: true }, compact: boolean): string[] {
  if ('none' in ai) return ['ai: (no explanation available)'];
  const out: string[] = [];
  out.push(`ai: profile ${ai.profile} | priorities ${ai.priorities.join(' > ')} | focus ${ai.focusRule}`);
  out.push(`  WHY: ${ai.why}`);
  out.push(`  steps: ${ai.steps.map((s) => `${s.priority}=${s.result === 'picked' ? `PICKED ${s.detail}` : `none (${s.detail})`}`).join(' ; ')}`);
  out.push('  candidates:');
  // Seçilen ve havuzdaki (puanlı) adaylar tam satır; havuz dışı olanlar skill + gerekçe başına tek satırda gruplanır (boyut)
  const full = ai.candidates.filter((c) => c.verdict === 'chosen' || c.verdict === 'lost');
  const cap = compact ? 4 : MAX_CANDIDATES;
  full.slice(0, cap).forEach((c, i) => out.push(`    ${candidateLine(c, !compact && i < 3)}`));
  if (full.length > cap) out.push(`    ... ${full.length - cap} more scored: ${full.slice(cap).map((c) => `${c.name}${c.target ? `->${c.target}` : ''} ${c.score ?? c.net}`).join('; ')}`);
  const groups = new Map<string, AiExplanation['candidates']>();
  for (const c of ai.candidates.filter((x) => x.verdict === 'skipped' || x.verdict === 'blocked')) {
    const key = `${c.verdict === 'blocked' ? 'x' : '-'} ${c.name} [${c.verdict}${c.note ? `: ${c.note}` : ''}]`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, list] of groups) out.push(`    ${key} ${compact ? `${list.length} option(s), best net ${Math.max(...list.map((c) => c.net))}` : list.map((c) => `${c.target ?? 'self'} dmg ${c.dmg} net ${c.net}${c.kills.length > 0 ? ` kills[${c.kills.join(',')}]` : ''}`).join(' ; ')}`);
  if (ai.rejected.length > 0) out.push(`  unavailable: ${ai.rejected.map((r) => `${r.name} (${r.reason})`).join('; ')}`);
  if (ai.reserves.length > 0) out.push(`  mp reserve: ${ai.reserves.map((r) => `${r.skill} needs ${r.needMp} MP in ${r.inTurns} turn(s)`).join('; ')}`);
  out.push(`  global skills: ${globalText(ai.global)}`);
  return out;
}

function candidateLine(c: AiExplanation['candidates'][number], withPer: boolean): string {
  const mark = c.verdict === 'chosen' ? '*' : c.verdict === 'blocked' ? 'x' : '-';
  const where = c.shape ? ` shape ${c.shape} @cell ${c.center}${c.board ? ` (${c.board} side)` : ''} -> cells [${(c.cells ?? []).join(',')}]` : c.center !== undefined ? ` (center cell ${c.center})` : '';
  const parts = [`${mark} ${c.name}${c.target ? ` -> ${c.target}` : ''}${where}`];
  const showPer = withPer && c.perTarget && c.perTarget.length > 1;
  if (c.shape && c.board === 'own') parts.push(`covers ${c.hits.length} unit(s)${c.hits.length > 0 ? ` [${c.hits.join(',')}]` : ''}`);
  else if (c.shape) parts.push(`hits ${c.enemyHits} foe(s)${c.hits.length > 0 ? ` [${c.hits.join(',')}]` : ''}`);
  else if (c.hits.length > 1 && !showPer) parts.push(`hits ${c.enemyHits} foe(s) [${c.hits.join(',')}]`);
  else if (c.hits.length > 1) parts.push(`hits ${c.enemyHits} foe(s)`);
  if (c.dmg) parts.push(`dmg ${c.dmg}${c.hit !== undefined ? ` hit ${c.hit}` : ''}`);
  if (showPer) parts.push(`per [${c.perTarget!.map((t) => `${t.unit} ${t.avg}@${t.hit}${t.lethal ? ' LETHAL' : ''}`).join(', ')}]`);
  if (c.kills.length > 0) parts.push(`kills [${c.kills.join(',')}]`);
  if (c.heal) parts.push(`heal ${c.heal}`);
  if (c.selfHeal) parts.push(`selfheal ${c.selfHeal}`);
  if (c.shield) parts.push(`shield ${c.shield}`);
  if (c.burn) parts.push(`burn ${c.burn}`);
  if (c.buff) parts.push(`buff ${c.buff}`);
  if (c.mitigation) parts.push(`mitigation ${c.mitigation}`);
  if (c.revive) parts.push(`revive ${c.revive}`);
  if (c.summonValue !== undefined) parts.push(`summonValue ${c.summonValue}`);
  parts.push(`cost ${c.cost} net ${c.net}`);
  if (c.score !== undefined) parts.push(`score ${c.score}`);
  if (c.tags.length > 0) parts.push(`{${c.tags.join(',')}}`);
  parts.push(`[${c.verdict}${c.note ? `: ${c.note}` : ''}]`);
  return parts.join(' ');
}

function globalText(g: AiExplanation['global']): string {
  if (!g.enabled) return g.gate ?? 'off';
  if (g.gate) return g.gate;
  const bits: string[] = [];
  if (g.vNow !== undefined) bits.push(`class move value ${r1(g.vNow)}`);
  if (g.danger) bits.push(`danger ${g.danger.active ? 'YES' : 'no'} (hp ${r1(g.danger.hpRatio * 100)}% incoming ${r1(g.danger.incoming)} vs hp ${g.danger.hp})`);
  if (g.move) bits.push(`move to cell ${g.move.slot} net ${g.move.net}`);
  else if (g.moveBlocked) bits.push(`move: ${g.moveBlocked}`);
  if (g.restGain) bits.push(`rest gain ${r1(g.restGain)}`);
  else if (g.restBlocked) bits.push(`rest: ${g.restBlocked}`);
  if (g.skipChecks && g.skipChecks.length > 0) bits.push(`skip: ${g.skipChecks.map((s) => `${s.skill} next-turn value ${r1(s.futureValue)} vs now ${r1(s.nowValue)} (needs now < ${r1(s.needBelow)}) ${s.hit ? 'YES' : 'no'}`).join('; ')}`);
  else if (g.skipNote) bits.push(`skip: ${g.skipNote}`);
  if (g.outcome) bits.push(`=> ${g.outcome}`);
  return bits.join(' | ') || 'not evaluated';
}

function skillLine(sk: SkillDef): string {
  const cost = `${sk.cost.resource.toUpperCase()} ${sk.cost.amount}`;
  const extra = [
    sk.cooldown ? `cd ${sk.cooldown}` : '',
    sk.initialCooldown ? `initialCd ${sk.initialCooldown}` : '',
    sk.motion === 'melee' ? 'melee' : sk.motion,
    sk.reach ? `reach ${sk.reach}` : '',
    sk.area ? `area shape ${shapeLabel(sk.area)}` : '',
    sk.splash ? 'splash' : '',
    sk.count ? `count ${sk.count}` : '',
  ].filter(Boolean);
  return `${sk.id} "${sk.name}" [${sk.target}] ${cost} ${extra.join(' ')} :: ${sk.effects.map(compactEffect).join(' + ')}${sk.ai ? ` :: aiHint ${JSON.stringify(sk.ai)}` : ''}`;
}
