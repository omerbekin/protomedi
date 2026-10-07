/**
 * Ceset işaretlerinin SAF (Phaser'sız) mantığı: hangi cesedin yuvasında işaret görünür, işaretin konumu ve tooltip metinleri.
 * Kural (madde 222): çağrı olmayan her ölü birim ceset bırakır; DİRİLTİLEBİLİR ceset (`revivable`) yuvasında küçük bir ankh + kuru kafa işareti taşır,
 * TÜKETİLMİŞ (`consumed`) ceset işaretsizdir (yuva boş görünür); dirilen birimin işareti kalkar; çağrılar ceset bırakmaz.
 * Çizim: `corpse-marker.ts`; BattleScene olay akışına göre (ölüm animasyonu bittikten sonra) işareti koyar/kaldırır.
 */
import type { Corpse, CorpseState, Side } from '../engine';
import { FLOOR_LIFT } from './shape-geometry';
import type { Pt } from './shape-geometry';

export type { CorpseState } from '../engine';

/** Bir hücrenin anahtarı (tahta + yuva): yuvada canlı çağrı var mı denetimi için. */
export const cellKey = (board: Side, slot: number): string => `${board}:${slot}`;

/**
 * Ekranda işaret gösterilecek cesetler: yalnızca diriltilebilir olanlar ve yuvasında şu an canlı bir birim (ör. cesedin üstüne çağrılan Skeleton)
 * durmayanlar (üstte duran birimin altında işaret çizilmez; birim gidince işaret geri gelir). Tüketilmiş ceset işaretsizdir.
 */
export function visibleCorpseMarks(corpses: readonly Corpse[], occupied: ReadonlySet<string> = new Set()): Corpse[] {
  return corpses.filter((c) => c.state === 'revivable' && !occupied.has(cellKey(c.side, c.slot)));
}

/** İşaretin zemindeki konumu: hücrenin ayak noktası (plakanın merkezi). */
export function corpseMarkPos(slots: readonly Pt[], slot: number): Pt {
  const s = slots[slot] ?? { x: 0, y: 0 };
  return { x: s.x, y: s.y - FLOOR_LIFT };
}

/** Tooltip satırının rengi: good = yeşil, bad = kırmızı, muted = sönük. */
export type TipTone = 'good' | 'bad' | 'muted';

export interface CorpseTip {
  title: string;
  rows: Array<{ text: string; tone: TipTone }>;
}

/**
 * Cesedin üstüne gelince tooltip: 'Fallen: <ad> (can be revived)'; tüketilmişse 'Fallen: <ad> (corpse consumed)'.
 * `blockReason` (reviveBlockReason: 'Corpse was consumed' / 'Cell is taken' ...) yalnızca bir diriltme skill'i seçiliyken (`reviving`) verilir ve
 * hedef seçilemiyorsa nedeni yazar; seçilebiliyorsa 'Click to revive'.
 */
export function corpseTip(name: string, state: CorpseState, reviving: boolean, blockReason: string | null): CorpseTip {
  const title = `Fallen: ${name} (${state === 'revivable' ? 'can be revived' : 'corpse consumed'})`;
  const rows: CorpseTip['rows'] = [];
  if (reviving) rows.push(blockReason ? { text: blockReason, tone: 'bad' } : { text: 'Click to revive', tone: 'good' });
  else if (state === 'revivable') rows.push({ text: 'A revive skill can bring this unit back; some summons devour it', tone: 'muted' });
  else rows.push({ text: 'Devoured: it can never be revived', tone: 'muted' });
  return { title, rows };
}

/**
 * Ceset tüketen çağrının (Raise Dead) skill tooltip'i satırı (summonPreview): 'Consumes <ad>'s corpse: empowered Skeleton (HP 105)' ya da
 * 'No corpse: unfed Skeleton (HP 70)'. Ceset tüketmeyen çağrıda (empowered tanımsız) null.
 */
export function summonPreviewLine(preview: { unit: { name: string; stats: { hp: number } } | null; empowered: boolean | undefined }, corpseName: string | null): { text: string; tone: 'empowered' | 'unfed' } | null {
  if (!preview.unit || preview.empowered === undefined) return null;
  const hp = preview.unit.stats.hp;
  return preview.empowered ? { text: `Consumes ${corpseName ?? 'a fallen foe'}'s corpse: empowered ${preview.unit.name} (HP ${hp})`, tone: 'empowered' } : { text: `No corpse: unfed ${preview.unit.name} (HP ${hp})`, tone: 'unfed' };
}

/** Birim bilgi tooltip'indeki besleme satırı: 'Empowered (fed on a corpse)' / 'Unfed'; ceset tüketmeyen birimde null. */
export function empoweredLine(empowered: boolean | undefined): { text: string; tone: 'empowered' | 'unfed' } | null {
  if (empowered === undefined) return null;
  return empowered ? { text: 'Empowered (fed on a corpse)', tone: 'empowered' } : { text: 'Unfed', tone: 'unfed' };
}
