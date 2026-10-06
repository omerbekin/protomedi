/**
 * Debug menüsünün kalıcı durumu ve saf yardımcıları (Phaser/DOM yok: testlenebilir).
 * Durum savaş yeniden başlasa da korunur; varsayılan değerler oyunun normal davranışıdır.
 */
import type { CombatantDef, DebugFlags, SkillDef } from '../engine';

/** Animasyon hızı seçenekleri (1 = normal). */
export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
/** "Skip animations" açıkken zaman bu kat hızlanır (animasyonlar bir an içinde biter). */
export const SKIP_SPEED = 25;
/** Hasar çarpanı seçenekleri; 9999 = tek vuruşta öldür. */
export const DAMAGE_MULTS = [1, 10, 9999] as const;
export const STATUS_TURNS = 3;

export interface DebugState {
  speed: number;
  skipAnims: boolean;
  paused: boolean;
  /** Wiki paneli açıkken savaş otomatik durur (debug Pause'dan bağımsız; kapanınca eski haline döner). */
  uiPaused: boolean;
  hideNumbers: boolean;
  /** true: düşman sırası gelince hiçbir şey yapmadan geçer. */
  enemyAiOff: boolean;
  /** Skill galerisi: oynatma bitince birimleri eski haline getir. */
  galleryReset: boolean;
  /** Motora uygulanan bayraklar (hasar çarpanı, kritik/kaçınma zorlaması). */
  flags: DebugFlags;
}

export const debugState: DebugState = {
  speed: 1,
  skipAnims: false,
  paused: false,
  uiPaused: false,
  hideNumbers: false,
  enemyAiOff: false,
  galleryReset: true,
  flags: { damageMult: 1, crit: 'auto', dodge: 'auto' },
};

/** Phaser tween/zamanlayıcı hız çarpanı: duraklatma 0, atlama çok hızlı, aksi halde seçilen hız. */
export function effectiveTimeScale(s: Pick<DebugState, 'speed' | 'skipAnims' | 'paused'> & { uiPaused?: boolean }): number {
  if (s.paused || s.uiPaused) return 0;
  if (s.skipAnims) return SKIP_SPEED;
  return s.speed;
}

/** Listede sıradaki değer (sona gelince başa döner; listede yoksa ilki). */
export function nextInCycle<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

/** Hız etiketi: 0.5 -> "0.5x". */
export const speedLabel = (v: number): string => `${v}x`;

/** Seed yazısını sayıya çevirir (yalnızca 0 veya pozitif tam sayı; boşluk kırpılır). Geçersizse null. */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,12}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export type ResourcePreset = 'one' | 'quarter' | 'half' | 'full' | 'zero';

/** Can/mana hızlı düğmelerinin değeri: 'one' = 1, 'zero' = 0, yüzdeler yukarı yuvarlanır (en az 1; zero hariç). */
export function resourceValue(max: number, preset: ResourcePreset): number {
  switch (preset) {
    case 'zero':
      return 0;
    case 'one':
      return Math.min(1, max);
    case 'quarter':
      return Math.max(1, Math.ceil(max * 0.25));
    case 'half':
      return Math.max(1, Math.ceil(max * 0.5));
    case 'full':
      return max;
  }
}

export interface SkillGroup {
  label: string;
  skills: string[];
}

/** Skill'leri sahibine göre gruplar: önce sınıflar (kendi 4 skill'i), sonra çağrılanlar, sonra kimsede olmayanlar ("Other"). */
export function groupSkillsByOwner(classes: Record<string, CombatantDef>, summons: Record<string, CombatantDef>, skills: Record<string, SkillDef>): SkillGroup[] {
  const seen = new Set<string>();
  const groups: SkillGroup[] = [];
  const add = (label: string, ids: string[]): void => {
    const own = ids.filter((id) => skills[id] && !seen.has(id));
    for (const id of own) seen.add(id);
    if (own.length > 0) groups.push({ label, skills: own });
  };
  for (const def of Object.values(classes)) add(def.name, def.skills);
  for (const def of Object.values(summons)) add(`${def.name} (summon)`, def.skills);
  add('Other', Object.keys(skills));
  return groups;
}

/** Ses adını okunur hale getirir: "stunChime" -> "stun Chime". */
export const sfxLabel = (id: string): string => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Açık olan debug ayarlarının kısa özeti (hiçbiri açık değilse "none"). */
export function tweaksSummary(s: DebugState, freeMp: boolean): string {
  const parts: string[] = [];
  if (s.speed !== 1) parts.push(`speed ${speedLabel(s.speed)}`);
  if (s.skipAnims) parts.push('skip anims');
  if (s.paused) parts.push('paused');
  if (s.hideNumbers) parts.push('numbers hidden');
  if (s.enemyAiOff) parts.push('enemy AI off');
  if (freeMp) parts.push('free MP');
  if (s.flags.damageMult !== 1) parts.push(`damage ${s.flags.damageMult}x`);
  if (s.flags.crit !== 'auto') parts.push(`${s.flags.crit} crit`);
  if (s.flags.dodge !== 'auto') parts.push(`${s.flags.dodge} dodge`);
  return parts.join(', ') || 'none';
}
