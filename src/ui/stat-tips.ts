// Stat açıklamaları (savaş HUD'ı ile AYNI kaynak: src/engine/stat-info.ts > describeStat, değerler formulas.json): Gear ekranının stat paneli
// ve item kartı satırları için. Motorda karşılığı tek stat olmayan "Might" (item'lerin skill gücü eki = Stats.spellPowerMult) burada anlatılır.
import { content, describeStat } from '../engine';
import type { StatKind, Stats } from '../engine';
import { iconUrl } from './dom-icons';
import { MIGHT_COLOR, STAT_COLOR, statIconName } from './stat-icons';

export interface StatTip {
  title: string;
  lines: string[];
}

/** Gear paneli / item stat kimliği -> motor statı ('might' ayrı). */
const KIND: Record<string, StatKind | 'might'> = {
  hp: 'hp',
  mp: 'mp',
  str: 'str',
  dex: 'dex',
  int: 'int',
  luck: 'luck',
  power: 'might',
  might: 'might',
  armor: 'armor',
  magicArmor: 'magicArmor',
  crit: 'critChance',
  critMult: 'critMult',
  critDmg: 'critMult',
  accuracy: 'accuracy',
  evasion: 'evasion',
  spd: 'spd',
  hpRegen: 'hpRegen',
  mpRegen: 'mpRegen',
};

const NUM = /[-−+]?\d+(?:\.\d+)?%?/g;

/** İki açıklama satırını birleştirir: yalnızca sayıları farklıysa "28.6% → 33.3%"; yapı farklıysa sonraki satır. */
export function mergeLine(before: string, after: string): string {
  if (before === after) return before;
  const nb = before.match(NUM) ?? [];
  const na = after.match(NUM) ?? [];
  const tb = before.split(NUM);
  const ta = after.split(NUM);
  if (nb.length !== na.length || tb.join('|') !== ta.join('|')) return after;
  let out = tb[0] ?? '';
  nb.forEach((n, i) => {
    out += n === na[i] ? n : `${n} → ${na[i]}`;
    out += tb[i + 1] ?? '';
  });
  return out;
}

/**
 * Statın açıklaması (birimin o anki statlarıyla); bilinmeyen kimlikte null. `after` verilirse (Gear: seçili item takılırsa) başlık ve
 * hesaplanan değerler "önce → sonra" gösterilir (savaşta fark yok; aynı describeStat kaynağı).
 */
export function statTip(id: string, stats: Stats, after?: Stats | null): StatTip | null {
  const now = statTipBase(id, stats);
  if (!now || !after) return now;
  const next = statTipBase(id, after);
  if (!next) return now;
  const lines = now.lines.map((l, i) => mergeLine(l, next.lines[i] ?? l));
  for (let i = now.lines.length; i < next.lines.length; i++) lines.push(next.lines[i]!);
  return { title: mergeLine(now.title, next.title), lines };
}

function statTipBase(id: string, stats: Stats): StatTip | null {
  const kind = KIND[id];
  if (!kind) return null;
  if (kind === 'might') {
    const pct = Math.round(((stats.spellPowerMult ?? 1) - 1) * 1000) / 10;
    return { title: `Might ${pct}%`, lines: [`Skill power: all damage, healing and shields from skills +${pct}%.`, 'Stacks additively across items.'] };
  }
  const info = describeStat(kind, stats, content.formulas);
  // Gear bağlamı: item'ler kritik çarpanını artırır (loadout critMultAdd), "herkes için sabit" satırı burada yanlış olur
  const lines = kind === 'critMult' ? [...info.lines.filter((l) => !l.startsWith('Fixed for every unit')), 'Items raise it: each +1% Crit damage adds 0.01 to the multiplier'] : [...info.lines];
  return { title: info.bonus ? `${info.title} · ${info.bonus.name}` : info.title, lines };
}

/**
 * Statın ikonu (savaş HUD'ı / karakter sayfası / alt çubuk / Codex ile AYNI kaynak: src/ui/stat-icons.ts > statIconName -> boyalı PNG
 * assets/stat-icons/<stat>.png, yoksa kodla çizilen yedek). Gear paneli ve item stat kimlikleri kabul edilir (Might dahil).
 * Phaser ekranları (Endless ödül / tüccar kartları) aynı `kind` + `color` ile `ensureIcon(scene, kind, color)` çağırır.
 */
export function statIcon(id: string): { kind: string; color: string } | null {
  const kind = KIND[id];
  if (!kind) return null;
  return { kind: statIconName(kind), color: kind === 'might' ? MIGHT_COLOR : STAT_COLOR[kind] };
}

/** DOM için ikon resmi (data URL; önbellekli). Bilinmeyen kimlikte ''. */
export function statIconUrl(id: string): string {
  const i = statIcon(id);
  return i ? iconUrl(i.kind, i.color) : '';
}
