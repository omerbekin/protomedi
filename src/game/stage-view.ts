import { GAME_H, GAME_W } from '../ui/viewport';

/** Güncel sahne ölçüleri (Phaser'sız; debug bilgisi ve testler de okur). Güncelleyen: `src/game/stage.ts > setStageMetrics`. */
export const stageView = { zoom: 1, viewW: GAME_W, left: 0, right: GAME_W, canvasW: GAME_W, canvasH: GAME_H };
