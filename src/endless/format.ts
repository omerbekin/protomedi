// Endless ekranının yazıları (saf; İngilizce oyun içi metin). Sahne: src/game/scenes/EndlessScene.ts.
import { classes } from '../engine/content';
import { ITEMS, rarityDef, slotDef, type ItemDef, type ItemStatId } from '../progression/items';
import { effectLine } from '../progression/item-text';
import { ENDLESS, type RewardCard } from './data';

/** Item statı satırı: "+3% Might", "+1 Armor", "+1 DEX". */
export function statLine(k: ItemStatId, v: number): string {
  const sd = ITEMS.stats[k];
  const num = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  return `+${num}${sd?.percent ? '%' : ''} ${sd?.name ?? k}`;
}

export const itemStatLines = (d: ItemDef): string[] => {
  const lines = (Object.entries(d.stats) as Array<[ItemStatId, number]>).filter(([, v]) => v).map(([k, v]) => statLine(k, v));
  const fx = effectLine(d); // Epic etkisi (madde 292)
  return fx ? [...lines, fx] : lines;
};

/** "Boots · Common" */
export const itemKindLine = (d: ItemDef): string => `${slotDef(d.slot)?.name ?? d.slot} · ${rarityDef(d.rarity)?.name ?? d.rarity}`;

export const rarityColor = (d: ItemDef): string => rarityDef(d.rarity)?.color ?? '#8a8a84';

/** Kamp / başlık ekranındaki yarım savaş düğmesi: "Resume Battle · Wave 3, Turn 12" (tur = o ana kadar oynanan hamle + 1). */
export const resumeLabel = (wave: number, turnsTaken: number): string => `Resume Battle · Wave ${wave}, Turn ${turnsTaken + 1}`;

export const className = (id: string): string => classes[id]?.name ?? id;

/** Ödül kartının başlığı (item kartında item adı ayrıca yazılır). */
export function cardTitle(c: RewardCard): string {
  if (c.kind === 'gold') return `${c.amount} Gold`;
  if (c.kind === 'heal') return c.ratio >= 0.6 ? 'Field Surgeon' : 'Tend the Wounded';
  if (c.kind === 'feast') return "Hero's Feast";
  if (c.kind === 'revive') return 'Revive';
  return 'Spoils';
}

export function cardText(c: RewardCard): string {
  if (c.kind === 'gold') return `Coin for the merchant who comes after every ${ENDLESS.shop.every}th wave.`;
  if (c.kind === 'heal') return `Every hero recovers ${Math.round(c.ratio * 100)}% of their health.`;
  if (c.kind === 'revive') return `The fallen hero rises with ${Math.round(c.ratio * 100)}% of their health and mana.`;
  if (c.kind === 'feast') return `Every hero is fully healed and has +${Math.round((c.hpMult - 1) * 100)}% max health for the next ${c.waves} waves.`;
  return '';
}
