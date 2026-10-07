/**
 * Debug > Test Mode sekmesinin saf (Phaser/DOM'suz) mantığı: anahtarlar ve iki tarafın istenen class listeleri.
 * Durum savaş yeniden başlasa da korunur; "Start test battle" bu takımlarla test modunda yeni savaş başlatır.
 */
import { content } from '../engine';

export type TestSide = 'party' | 'enemies';

export interface TestModeState {
  /** Anahtarlar (Test Mode sekmesinde varsayılan AÇIK; Unlimited MP = BattleScene.freeMp). */
  unlimitedRage: boolean;
  noCooldowns: boolean;
  /** İstenen class'lar (sıra = ekleme sırası; savaşta otomatik dizilir). */
  teams: Record<TestSide, string[]>;
  /** Düzenlenen taraf ve o taraftaki seçili yuva (null: yeni class eklenir). */
  side: TestSide;
  slot: number | null;
  /** "Test mode" düğmesiyle ilk açılışta anahtarlar açıldı mı (sonra elle kapatılırsa bir daha zorlanmaz). Sekmeyi açmak hiçbir şeyi değiştirmez. */
  autoEnabled: boolean;
}

/** Anahtarlar genel olarak KAPALI başlar (normal oyun etkilenmez); "Test mode" düğmesi ilk kez açtığında hepsi açılır (debug-tools.ts). */
/** Varsayılan takım: oyun varsayılanı (5 + 5). */
export const DEFAULT_TEST_SIZE = 5;

/** Seçilebilir class'lar (test class'ları dahil; gizli olanlar hariç). */
export const testClassIds = (): string[] => content.selectableClasses;

export function defaultTeam(side: TestSide): string[] {
  const ids = testClassIds();
  const start = side === 'party' ? 0 : 5;
  return Array.from({ length: DEFAULT_TEST_SIZE }, (_, i) => ids[(start + i) % ids.length]!);
}

export const testMode: TestModeState = {
  unlimitedRage: false,
  noCooldowns: false,
  teams: { party: defaultTeam('party'), enemies: defaultTeam('enemies') },
  side: 'party',
  slot: null,
  autoEnabled: false,
};

export const clampTeam = (n: number): number => content.clampTeamSize(n);

/** Seçili yuvadaki class'ı değiştirir; yuva seçili değilse (ya da yuva yoksa) takımın sonuna ekler (üst sınır: tahta hücre sayısı). */
export function placeClass(team: string[], slot: number | null, classId: string): { team: string[]; slot: number | null } {
  if (slot !== null && slot >= 0 && slot < team.length) {
    const next = [...team];
    next[slot] = classId;
    return { team: next, slot };
  }
  if (team.length >= content.CELL_COUNT) return { team, slot: null };
  return { team: [...team, classId], slot: null }; // eklemeden sonra yuva seçili kalmaz: arka arkaya class eklenebilir
}

/** Yuvayı çıkarır (en az 1 birim kalır). Seçili yuva geçerli kalacak şekilde ayarlanır. */
export function removeSlot(team: string[], slot: number): { team: string[]; slot: number | null } {
  if (team.length <= 1 || slot < 0 || slot >= team.length) return { team, slot: slot < team.length ? slot : null };
  const next = team.filter((_, i) => i !== slot);
  return { team: next, slot: next.length === 0 ? null : Math.min(slot, next.length - 1) };
}

/** Takım boyutunu ayarlar: büyütünce eksikler seçili tarafın class havuzundan sırayla eklenir, küçültünce sondan kesilir. */
export function resizeTeam(team: string[], size: number): string[] {
  const n = clampTeam(size);
  if (n <= team.length) return team.slice(0, n);
  const ids = testClassIds();
  const out = [...team];
  while (out.length < n) out.push(ids[out.length % ids.length]!);
  return out;
}

/** "Start test battle" için BattleScene verisi: hücre listeleri (otomatik dizilmiş), test modu. */
export function buildTestBattleData(teams: Record<TestSide, string[]>, seed: number) {
  return {
    seed,
    mode: 'test' as const,
    teams: {
      party: content.randomCells(content.arrangeTeam(teams.party.slice(0, content.CELL_COUNT)), seed),
      enemies: content.randomCells(content.arrangeTeam(teams.enemies.slice(0, content.CELL_COUNT)), seed + 7),
    },
    partySize: teams.party.length,
    enemySize: teams.enemies.length,
  };
}

/** Test Mode anahtarlarını (Rage, cooldown) açar/kapatır. Unlimited MP BattleScene.freeMp'dir. */
export function setTestSwitches(on: boolean): void {
  testMode.unlimitedRage = on;
  testMode.noCooldowns = on;
}

/** Test Mode anahtarlarının açık olanlarının kısa özeti (debug bilgisi). */
export function testModeSummary(s: Pick<TestModeState, 'unlimitedRage' | 'noCooldowns'>): string[] {
  const parts: string[] = [];
  if (s.unlimitedRage) parts.push('unlimited Rage');
  if (s.noCooldowns) parts.push('no cooldowns');
  return parts;
}
