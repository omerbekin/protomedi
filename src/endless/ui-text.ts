// Endless ekranının TÜM oyun içi yazıları (İngilizce) tek yerde: ekran yeniden tasarlanırken (ui-dev) metinler buradan okunur / değiştirilir.
// Sahne (src/game/scenes/EndlessScene.ts) yalnızca bu yazıları ve src/endless/format.ts'deki kart/item yazılarını kullanır.
import { ENDLESS } from './data';

const pct = (r: number) => `${Math.round(r * 100)}%`;

export const UI_TEXT = {
  back: '◂  BACK',
  yes: 'Yes',
  no: 'No',
  mainMenu: 'Main Menu',
  newRun: 'New Run',
  startRun: 'Start a Run',

  // Başlık ekranı
  title: 'Endless',
  titleSub: 'Wave after wave. A reward after every victory. How far can your company go?',
  continueRun: (wave: number) => `Continue · Wave ${wave}`,
  rules: `Elite every ${ENDLESS.eliteEvery}th wave · Boss every ${ENDLESS.bossEvery}th · Merchant after every ${ENDLESS.shop.every}th`,
  bestRuns: 'BEST RUNS',
  noRuns: 'No runs yet. How far can your company go?',
  scoreWave: (wave: number) => `WAVE ${wave}`,
  scoreTurns: (turns: number) => `${turns} turns`,
  confirmNewRun: 'Start a new run? Your current run ends and its score is recorded.',
  confirmNewRunSuspended: 'Start a new run? The suspended battle is lost, your current run ends and its score is recorded.',

  // Takım seçimi
  pickTitle: 'Choose Your Company',
  pickSub: (n: number) => `Pick ${n} heroes. They start at level 1 with no gear.`,
  pickHint: 'Tap a hero to add or remove them.',
  classInfo: (name: string, primary: string, passive?: string) => `${name} · ${primary.toUpperCase()}${passive ? ` · Passive: ${passive}` : ''}`,
  randomize: 'Randomize',
  startRunButton: 'Start Run',

  // Kamp
  campTitle: (wave: number) => `Wave ${wave}`,
  campFoes: (names: string[]) => `Foes: ${names.join(' · ')}`,
  campSpecial: (boss: boolean, name: string) => `${boss ? 'Boss' : 'Elite'} wave · ${name}`,
  campStats: (gold: number, gs: number, cleared: number) => `Gold ${gold}   ·   Gear Score ${gs}   ·   Waves cleared ${cleared}`,
  campBlessing: (hpMult: number, waves: number) => `Hero's Feast: +${pct(hpMult - 1)} max health for ${waves} more ${waves === 1 ? 'wave' : 'waves'}`,
  heroHealth: (ratio: number) => `${pct(ratio)} health`,
  emptySlot: '—',
  fightWave: (wave: number) => `Fight Wave ${wave}`,
  faceBoss: 'Face the Boss',
  abandonRun: 'Abandon Run',
  confirmAbandon: 'Abandon this run? Your score will be recorded.',

  // Ödül
  rewardTitle: 'Victory',
  rewardSub: (cleared: number, special: 'elite' | 'boss' | null) =>
    `Wave ${cleared} cleared${special === 'boss' ? ': the boss has fallen' : special === 'elite' ? ': the elite has fallen' : ''}. Choose one reward.`,
  take: 'Take',
  youHaveGold: (gold: number) => `You have ${gold} gold.`,
  healPreview: (from: number, to: number) => `${pct(from)} → ${pct(to)}`,
  forHero: (cls: string) => `For the ${cls}`,
  replacesSold: (name: string, gold: number) => `Replaces ${name} (sold for ${gold} gold)`,
  replaces: (name: string) => `Replaces ${name}`,
  fillsEmpty: 'Fills an empty slot',
  primaryWarning: "Warning: turns off this hero's primary bonus",
  primaryWarningShort: 'Turns off the primary bonus',

  // Kalıntı
  relicTitle: 'Choose a Relic',
  relicSub: 'The boss has fallen. A relic stays with your company for the whole run.',
  relicTake: 'Claim',
  relicsOwned: 'RELICS',
  relicEffectLabel: 'Whole run',

  // Dükkân
  shopTitle: 'Merchant',
  shopSub: (gold: number) => `A travelling merchant follows the company. You have ${gold} gold.`,
  sold: 'SOLD',
  buy: (price: number) => `Buy · ${price}`,
  moveOn: 'Move On',

  // Koşu sonu
  overTitle: (abandoned: boolean) => (abandoned ? 'Run Abandoned' : 'Run Over'),
  overSub: (abandoned: boolean, wave: number) => `${abandoned ? 'Abandoned' : 'Fallen'} at wave ${wave}.`,
  overStats: (cleared: number, turns: number, kills: number, gs: number) => `Waves cleared ${cleared}   ·   Turns ${turns}   ·   Foes slain ${kills}   ·   Gear Score ${gs}`,
  overRank: (rank: number) => (rank === 0 ? 'A new best run!' : rank > 0 ? `#${rank + 1} on your list of best runs.` : 'Not among your best runs this time.'),
} as const;
