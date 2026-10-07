/**
 * Hedef/yuva seçiminin SAF (Phaser'sız) hücre haritası: hangi tahtada hangi hücreler seçilebilir, hover'da hangi plakalar çizilir, geçersiz hedefler
 * ve nedenleri. BattleScene bunları çizer; mantık motorun API'sinden (shapeAnchorCells / shapePreviewCells / targetProblem) gelir, UI kural yazmaz.
 * area_any (Smoke Bomb gibi iki tahtaya atılabilen alan) için iki tahtayı da kapsar: düşman tahtası 'enemy', kendi tahta 'ally' tonu.
 */
import type { Battle, Side } from '../engine';
import type { CellState, CellTone } from './cell-style';

/** Çizilecek bir hücre plakası (shape-draw.CellTileSpec ile aynı biçim; Phaser'sız). */
export interface PlateSpec {
  slot: number;
  state: CellState;
  tone?: CellTone;
  stage?: number;
}

export interface BoardAnchors {
  board: Side;
  tone: CellTone;
  /** Bu tahtada seçilebilir anchor hücreler (artan sırada). */
  anchors: number[];
}

/** Alan skill'inin bir tahtadaki plaka tonu: area_any'de kendi tahta 'ally', karşı tahta 'enemy'; diğer alan skill'lerinde 'neutral' (altın). */
export function areaTone(battle: Battle, actorUid: string, skillId: string, board: Side): CellTone {
  const actor = battle.get(actorUid);
  if (!actor || !battle.isAnyBoardArea(skillId)) return 'neutral';
  return board === actor.side ? 'ally' : 'enemy';
}

/**
 * Alan skill'inin hedeflenebileceği tahtalar ve her birindeki seçilebilir anchor'lar: area_enemies'de yalnızca karşı tahta; area_any'de önce karşı sonra
 * kendi tahta. Seçilebilir anchor'ı olmayan tahta yine listelenir (anchors boş) ki imleç bölgesi iki tahtayı da kapsasın.
 */
export function areaBoards(battle: Battle, actorUid: string, skillId: string): BoardAnchors[] {
  const actor = battle.get(actorUid);
  if (!actor || !battle.isAreaSkill(skillId)) return [];
  const foe: Side = actor.side === 'party' ? 'enemy' : 'party';
  const boards: Side[] = battle.isAnyBoardArea(skillId) ? [foe, actor.side] : [foe];
  const cells = battle.shapeAnchorCells(actorUid, skillId);
  return boards.map((board) => ({ board, tone: areaTone(battle, actorUid, skillId, board), anchors: cells.filter((c) => c.board === board).map((c) => c.slot) }));
}

/**
 * Hover'daki alan plakaları: kapsanan hücreler 'affected', imlecin hücresi 'anchor' (aynı tonda); skill atılamıyorsa (valid=false) hepsi 'invalid'.
 * `stageOf`: aşamalı vuruşta hücre -> 1 tabanlı aşama numarası.
 */
export function areaHoverSpecs(info: { cells: number[]; valid: boolean }, anchorSlot: number, tone: CellTone, stageOf?: ReadonlyMap<number, number>): PlateSpec[] {
  return info.cells.map((slot) => {
    const stage = info.valid ? stageOf?.get(slot) : undefined;
    return { slot, state: !info.valid ? 'invalid' : slot === anchorSlot ? 'anchor' : 'affected', tone, ...(stage ? { stage } : {}) };
  });
}

export interface BlockedTarget {
  uid: string;
  board: Side;
  slot: number;
  /** Motorun nedeni (battle.targetProblem), ör. 'No room behind the target' / 'Target is shielded from behind' / 'Out of reach'. */
  reason: string;
}

/**
 * Tek hedefli düşman skill'inde (single_enemy) şu an SEÇİLEMEYEN canlı düşmanlar ve nedenleri (Backstab: arkası dolu / en arka sıra; melee: erişim dışı;
 * taunt). Seçilebilir hedefler dahil değildir.
 */
export function blockedTargets(battle: Battle, actorUid: string, skillId: string): BlockedTarget[] {
  const actor = battle.get(actorUid);
  const skill = battle.skill(skillId);
  if (!actor || !skill || skill.target !== 'single_enemy') return [];
  const valid = new Set(battle.validTargets(actorUid, skillId).map((c) => c.uid));
  const foe: Side = actor.side === 'party' ? 'enemy' : 'party';
  const out: BlockedTarget[] = [];
  for (const c of battle.living(foe)) {
    if (valid.has(c.uid)) continue;
    const reason = battle.targetProblem(actorUid, skillId, c.uid);
    if (reason) out.push({ uid: c.uid, board: c.board, slot: c.slot, reason });
  }
  return out;
}
