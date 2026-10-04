import { content } from '../src/engine';
import type { SkillDef } from '../src/engine';

/**
 * Oyundan kaldırılan eski skill'ler. Motor mekaniklerini (kritik, kalkan, şifa, melee menzili...) ölçen testler
 * hâlâ bu skill'lere ihtiyaç duyuyor; bu dosya yalnızca TEST sürecinde onları kayda ve ilgili sınıflara ekler.
 * (Vitest her test dosyasını ayrı modül örneğiyle çalıştırır; oyun verisi etkilenmez.)
 */
const LEGACY: Record<string, SkillDef> = {
  power_strike: {
    id: 'power_strike', name: 'Power Strike', icon: 'bigsword', target: 'single_enemy', cost: { resource: 'mp', amount: 10 }, cooldown: 2,
    motion: 'melee', fx: '#ffe9b0', effects: [{ type: 'damage', damageType: 'physical', scale: 'str', power: 2.0 }],
  },
  shield_wall: {
    id: 'shield_wall', name: 'Shield Wall', icon: 'barrier', target: 'self', cost: { resource: 'mp', amount: 12 }, cooldown: 4,
    motion: 'cast', fx: '#ffe9b0', effects: [{ type: 'shield', scale: 'str', power: 1.1 }],
  },
  lay_on_hands: {
    id: 'lay_on_hands', name: 'Lay on Hands', icon: 'cross', target: 'single_ally', cost: { resource: 'mp', amount: 12 }, cooldown: 3,
    motion: 'cast', fx: '#fff0a0', effects: [{ type: 'heal', scale: 'int', power: 2.5 }],
  },
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', icon: 'bash', target: 'single_enemy', cost: { resource: 'mp', amount: 0 },
    motion: 'melee', fx: '#ffe9b0', effects: [{ type: 'damage', damageType: 'physical', scale: 'str', power: 1.0 }, { type: 'shield', scale: 'str', power: 0.5, self: true }],
  },
  bone_slash: {
    id: 'bone_slash', name: 'Bone Slash', icon: 'bone', target: 'single_enemy', cost: { resource: 'mp', amount: 0 },
    motion: 'melee', fx: '#d9d4c0', effects: [{ type: 'damage', damageType: 'physical', scale: 'str', power: 1.1 }],
  },
  soul_drain: {
    id: 'soul_drain', name: 'Soul Drain', icon: 'drain', target: 'single_enemy', cost: { resource: 'mp', amount: 10 },
    motion: 'cast', fx: '#b36bff', effects: [{ type: 'damage', damageType: 'magic', scale: 'str', power: 1.3, element: 'dark', lifesteal: 1.0 }],
  },
};

const GIVE: Record<string, string[]> = {
  warrior: ['power_strike', 'shield_wall'],
  paladin: ['lay_on_hands'],
  defender: ['shield_bash'],
  undead: ['bone_slash', 'soul_drain'],
};

/** Eski skill'leri kayda ve sınıfların skill listesine ekler. */
export function installLegacySkills(): void {
  Object.assign(content.skills, LEGACY);
  for (const [cls, ids] of Object.entries(GIVE)) {
    const def = content.classes[cls]!;
    for (const id of ids) if (!def.skills.includes(id)) def.skills.push(id);
  }
}
