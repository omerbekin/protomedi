// Koşu boyu etkiler (battle HUD > Battle info > Effects; saf, Phaser'sız). Oturum (sefer / Endless) savaşı başlatırken
// `CampaignBattleHooks.battleEffects` kancasıyla bu listeyi verir; ileride yeni sistemler (kutsamalar, lanetler, olaylar) aynı listeye eklenir.
import { CONFIG, chapterEnemyMods, type CampaignState, type DifficultyEnemyMods } from '../campaign';
import { relicDef, type EndlessRun } from '../endless';

export interface BattleEffect {
  name: string;
  text: string;
  /** İkon türü (src/ui/icon-kinds.ts) ve rengi; yoksa kor elmas. */
  icon?: string;
  color?: string;
  /** Başlık grubu ('Relics', 'Enemy scaling'...). */
  group?: string;
}

const pctUp = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;

/** Düşman güçlendirmesinin okunur hali: "+12% HP, +5% damage". Etkisizse boş. */
export function enemyModsText(m: DifficultyEnemyMods | undefined): string {
  if (!m) return '';
  const out: string[] = [];
  if (m.hpMult !== undefined && m.hpMult !== 1) out.push(`${pctUp(m.hpMult)} HP`);
  if (m.statMult !== undefined && m.statMult !== 1) out.push(`${pctUp(m.statMult)} stats`);
  if (m.powerMult !== undefined && m.powerMult !== 1) out.push(`${pctUp(m.powerMult)} damage`);
  if (m.armorAdd) out.push(`+${m.armorAdd} armor`);
  if (m.magicArmorAdd) out.push(`+${m.magicArmorAdd} magic armor`);
  return out.join(', ');
}

/** Sefer savaşının etkileri: genel zorluk (düşman güçlendirmesiyle) ve bölüm ölçeği. */
export function campaignEffects(s: CampaignState): BattleEffect[] {
  const out: BattleEffect[] = [];
  const diff = CONFIG.difficulties[s.difficulty];
  if (diff) {
    const enemy = enemyModsText(diff.enemy);
    const tiers = Object.entries(diff.enemyTier ?? {})
      .map(([tier, m]) => {
        const t = enemyModsText(m);
        return t ? `${tier === 'boss' ? 'Bosses' : 'Elites'} a further ${t}` : '';
      })
      .filter(Boolean);
    out.push({ name: `${diff.name} difficulty`, text: [diff.text, enemy ? `Enemies ${enemy}.` : '', ...tiers.map((t) => `${t}.`)].filter(Boolean).join(' '), group: 'Enemy scaling', color: '#ffb0a0', icon: 'skull' });
  }
  const chapter = enemyModsText(chapterEnemyMods(s.mapId, s.at));
  if (chapter) out.push({ name: 'Chapter strength', text: `Enemies grow stronger deeper into the journey: ${chapter}.`, group: 'Enemy scaling', color: '#ffb0a0', icon: 'muscle' });
  return out;
}

/** Endless savaşının etkileri: koşunun kalıntıları. */
export function endlessEffects(run: Pick<EndlessRun, 'relics'>): BattleEffect[] {
  return (run.relics ?? [])
    .map((id) => relicDef(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ name: r.name, text: r.text, icon: r.icon, color: r.color, group: 'Relics' }));
}
