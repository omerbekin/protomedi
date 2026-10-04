// İçerik kayıt defteri: data/ altındaki JSON'ları motor tiplerine bağlar.
// Yeni class/düşman = yeni JSON + aşağıya bir satır (skills.json ve ai.json tek dosya, satır gerekmez).
import aiJson from '../../data/ai.json';
import formulasJson from '../../data/formulas.json';
import skillsJson from '../../data/skills.json';
import firstBattle from '../../data/battles/first-battle.json';
import mage from '../../data/classes/mage.json';
import paladin from '../../data/classes/paladin.json';
import undead from '../../data/classes/undead.json';
import warrior from '../../data/classes/warrior.json';
import enemyArcher from '../../data/enemies/enemy_archer.json';
import enemyDruid from '../../data/enemies/enemy_druid.json';
import enemyMage from '../../data/enemies/enemy_mage.json';
import enemyWarrior from '../../data/enemies/enemy_warrior.json';
import treant from '../../data/enemies/treant.json';
import type { AiConfig } from './ai';
import type { BattleSetup } from './battle';
import type { BattleMode, CombatantDef, Formulas, SkillDef } from './types';

export interface BattleDef {
  id: string;
  background: string;
  slots: { party: number; enemy: number };
  party: string[];
  enemies: string[];
}

export const classes: Record<string, CombatantDef> = {
  warrior,
  paladin,
  mage,
  undead,
};

export const enemies: Record<string, CombatantDef> = {
  enemy_warrior: enemyWarrior,
  enemy_archer: enemyArcher,
  enemy_mage: enemyMage,
  enemy_druid: enemyDruid,
  treant,
};

// "_not" gibi açıklama alanlarını ayıkla; geriye yalnızca skill tanımları kalır.
export const skills = Object.fromEntries(
  Object.entries(skillsJson as unknown as Record<string, unknown>).filter(([key]) => !key.startsWith('_')),
) as unknown as Record<string, SkillDef>;

export const formulas: Formulas = formulasJson;

export const aiConfig = aiJson as unknown as AiConfig;

export const battles: Record<string, BattleDef> = {
  'first-battle': firstBattle,
};

function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const v = table[id];
  if (!v) throw new Error(`${what} bulunamadı: ${id}`);
  return v;
}

export function battleSetup(battleId: string, seed: number, mode: BattleMode = 'turns'): BattleSetup {
  const def = lookup(battles, battleId, 'Savaş');
  return {
    seed,
    mode,
    party: def.party.map((id) => lookup(classes, id, 'Class')),
    enemies: def.enemies.map((id) => lookup(enemies, id, 'Düşman')),
    skills,
    formulas,
    units: { ...classes, ...enemies },
    maxSlots: def.slots,
  };
}
