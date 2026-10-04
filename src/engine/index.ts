// Saf savaş motoru. Phaser, DOM ve window'a bağımlı olamaz (tests/engine-purity.test.ts denetler).
export { Rng } from './rng';
export { Battle } from './battle';
export type { ActionResult, BattleSetup, CanUse } from './battle';
export { chooseAction } from './ai';
export type { AiChoice, AiConfig, AiPriority, AiProfile } from './ai';
export { advanceTurn, predictQueue } from './turn-order';
export type { TurnSlot } from './turn-order';
export { expectedDamage, expectedHeal, healAmount, magicDamage, physicalDamage } from './formulas';
export * as content from './content';
export type * from './types';
