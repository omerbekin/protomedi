// Savaş günlüğü (battle HUD > Battle info > Combat log; saf, Phaser'sız): oynatılan savaş olaylarından okunur satırlar üretir.
// Bir eylem (skill / global) tek satırdır: "Cutthroat used Venom Edge on Hexer · 9"; alan skill'inde hedefler virgülle sıralanır.
// Eylem dışı olaylar (zemin / Wither tiki, düşme, sersemleme, Lucky Escape) kendi satırını alır. Tur sayacı da buradadır:
// "turn" = her tur başı (ek eylem hariç), "round" = sıradaki birim bu round'da zaten oynadıysa yeni round başlar.
import type { BattleEvent } from '../engine';
import type { HudLogEntry, LogPart } from '../ui/battle-hud';

export interface LogNames {
  /** Birimin adı ve tarafı (yoksa undefined: satır atlanır). */
  unit(uid: string): { name: string; side: 'party' | 'enemy' } | undefined;
  skill(id: string): string;
  status(id: string): string;
  ground(id: string): string;
  /** Global eylemin türü (rest | skip | move). */
  globalKind(id: string): string;
}

interface Hit {
  uid: string;
  dmg: number;
  crit: boolean;
  heal: number;
  miss?: 'miss' | 'dodge';
  statuses: string[];
  ko: boolean;
  escaped: boolean;
}

interface Action {
  round: number;
  actor: string;
  verb: LogPart[];
  hits: Hit[];
  notes: string[];
}

const MAX = 80;

export class CombatLog {
  round = 1;
  turn = 0;
  private acted = new Set<string>();
  private done: Array<HudLogEntry | Action> = [];
  private cur: Action | null = null;

  constructor(
    private readonly names: LogNames,
    private readonly localSide: 'party' | 'enemy' = 'party',
  ) {}

  /** Savaşın ilk turu (olay akışı sahne kurulmadan başladıysa): sayaç 1. tur, bu birim oynamış sayılır. */
  begin(uid: string | null | undefined): void {
    if (this.turn > 0 || !uid) return;
    this.turn = 1;
    this.acted.add(uid);
  }

  /** Bir olayı işler (ekranda oynatıldığı sırayla). Satır listesi değiştiyse true. */
  push(e: BattleEvent): boolean {
    switch (e.type) {
      case 'turnStart': {
        this.close();
        if (e.extra) return false;
        this.turn++;
        if (this.acted.has(e.actor)) {
          this.round++;
          this.acted.clear();
        }
        this.acted.add(e.actor);
        return true;
      }
      case 'skillUsed': {
        this.close();
        this.cur = { round: this.round, actor: e.actor, verb: [{ t: ' used ' }, { t: this.names.skill(e.skill), k: 'sk' }], hits: [], notes: [] };
        this.done.push(this.cur);
        return true;
      }
      case 'globalUsed': {
        this.close();
        const kind = this.names.globalKind(e.id);
        const verb = kind === 'rest' ? ' rested' : kind === 'skip' ? ' skipped the turn' : kind === 'move' ? ' moved' : ` used ${e.id}`;
        this.cur = { round: this.round, actor: e.actor, verb: [{ t: verb }], hits: [], notes: [] };
        this.done.push(this.cur);
        return true;
      }
      case 'damage': {
        if (e.luckyEscape) {
          if (this.cur) this.hit(e.target).escaped = true;
          else this.line([this.who(e.target), { t: ' escaped a lethal blow by luck', k: 'n' }]);
          return true;
        }
        if (e.origin === 'ground' || (e.origin === 'status' && !this.cur)) {
          const src = e.origin === 'ground' ? this.names.ground(e.ground ?? '') : this.names.status(e.status ?? '');
          this.line([this.who(e.target), { t: ' took ' }, { t: String(e.amount + e.absorbed), k: 'dm' }, { t: ` from ${src}` }]);
          return true;
        }
        if (e.origin === 'self') return false;
        if (!this.cur) return false;
        const h = this.hit(e.target);
        h.dmg += e.amount + e.absorbed;
        h.crit ||= e.crit;
        return true;
      }
      case 'dodge':
      case 'miss': {
        if (!this.cur) return false;
        this.hit(e.target).miss = e.type;
        return true;
      }
      case 'heal': {
        if (e.amount <= 0) return false;
        if (this.cur && e.cause !== 'dark_bond') this.hit(e.target).heal += e.amount;
        else this.line([this.who(e.target), { t: ' healed ' }, { t: `+${e.amount}`, k: 'hl' }, ...(e.cause === 'dark_bond' ? [{ t: ' (Dark Bond)' }] : [])]);
        return true;
      }
      case 'status': {
        if (!this.cur) return false;
        const h = this.hit(e.target);
        const name = this.names.status(e.status);
        if (!h.statuses.includes(name)) h.statuses.push(name);
        return true;
      }
      case 'death': {
        if (this.cur && this.cur.hits.some((h) => h.uid === e.target)) this.hit(e.target).ko = true;
        else this.line([this.who(e.target), { t: ' fell', k: 'ko' }]);
        return true;
      }
      case 'revive': {
        const p: LogPart[] = [this.who(e.source), { t: ' revived ' }, this.who(e.target)];
        if (this.cur && this.cur.actor === e.source) this.cur.notes.push(`${this.names.unit(e.target)?.name ?? ''} rises`);
        else this.line(p);
        return true;
      }
      case 'summon': {
        const name = e.combatant.name + (e.empowered ? ' (fed)' : e.empowered === false ? ' (unfed)' : '');
        if (this.cur && this.cur.actor === e.actor) this.cur.notes.push(`${name} rises`);
        else this.line([this.who(e.actor), { t: ` summoned ${name}` }]);
        return true;
      }
      case 'turnSkipped': {
        if (!e.stunned) return false;
        this.close();
        this.line([this.who(e.actor), { t: ' is stunned and loses the turn', k: 'n' }]);
        return true;
      }
      case 'battleEnd':
        this.close();
        this.line([{ t: e.winner === this.localSide ? 'Victory' : 'Defeat', k: 'n' }]);
        return true;
      default:
        return false;
    }
  }

  /** Satırlar, en yeni önce. */
  entries(): HudLogEntry[] {
    const out: HudLogEntry[] = [];
    for (let i = this.done.length - 1; i >= 0; i--) {
      const d = this.done[i]!;
      out.push('actor' in d ? this.render(d) : d);
    }
    return out;
  }

  private close(): void {
    this.cur = null;
    if (this.done.length > MAX) this.done.splice(0, this.done.length - MAX);
  }

  private line(parts: LogPart[]): void {
    if (parts.some((p) => p.t === '')) return;
    this.done.push({ round: this.round, parts });
  }

  private who(uid: string): LogPart {
    const u = this.names.unit(uid);
    if (!u) return { t: '' };
    return { t: u.name, k: u.side === this.localSide ? 'p' : 'e' };
  }

  private hit(uid: string): Hit {
    const cur = this.cur!;
    let h = cur.hits.find((x) => x.uid === uid);
    if (!h) {
      h = { uid, dmg: 0, crit: false, heal: 0, statuses: [], ko: false, escaped: false };
      cur.hits.push(h);
    }
    return h;
  }

  private render(a: Action): HudLogEntry {
    const parts: LogPart[] = [this.who(a.actor), ...a.verb];
    const self = a.hits.length === 1 && a.hits[0]!.uid === a.actor;
    a.hits.forEach((h, i) => {
      if (i === 0 && !self) parts.push({ t: ' on ' });
      else if (i > 0) parts.push({ t: ', ' });
      if (!(self && i === 0)) parts.push(this.who(h.uid));
      if (h.miss) parts.push({ t: h.miss === 'dodge' ? ' (dodged)' : ' (missed)' });
      if (h.dmg > 0) parts.push({ t: ' · ' }, { t: h.crit ? `${h.dmg} crit` : String(h.dmg), k: h.crit ? 'cr' : 'dm' });
      if (h.heal > 0) parts.push({ t: ' · ' }, { t: `+${h.heal}`, k: 'hl' });
      if (h.statuses.length) parts.push({ t: ` · ${h.statuses.join(', ')}` });
      if (h.escaped) parts.push({ t: ' · escaped by luck', k: 'n' });
      if (h.ko) parts.push({ t: ' · ' }, { t: 'KO', k: 'ko' });
    });
    if (a.notes.length) parts.push({ t: ` · ${a.notes.join(', ')}` });
    return { round: a.round, parts: parts.filter((p) => p.t !== '') };
  }
}
