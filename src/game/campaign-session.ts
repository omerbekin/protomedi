import type Phaser from 'phaser';
import { battleSummary, content } from '../engine';
import type { Battle } from '../engine';
import {
  applyBattle,
  battlePlan,
  claimSlot,
  latestSave,
  markPlayed,
  newCampaign,
  outcomeFrom,
  writeSave,
  type BattlePlan,
  type CampaignMode,
  type CampaignState,
  type Difficulty,
  type KV,
  type SaveEntry,
  type SaveKind,
} from '../campaign';
import type { ResultAction } from './result-screen';
import type { BattleSceneData } from './scenes/BattleScene';
import { newSeed } from './seed';

/**
 * Seferin tarayıcı tarafı (oturum): o anki sefer durumu, kayıt deposu (localStorage), savaşa geçiş ve savaştan dönüş.
 * Kurallar src/campaign/ içinde (saf); burası yalnızca sahneler arası bağlantıdır.
 */

export const MAP_SCENE = 'CampaignMapScene';
export const MENU_SCENE = 'MainMenuScene';
const BATTLE_SCENE = 'BattleScene';

/** Tarayıcı deposu; kapalıysa (gizli pencere vb.) null: kayıt yapılamaz ama oyun çökmez. */
export function storage(): KV | null {
  try {
    const ls = window.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export const session = {
  state: null as CampaignState | null,
  /** Yenilgide artan yerel deneme sayacı (düğüm -> deneme): zarlar değişir, düşman aynı kalır. Kayda yazılmaz. */
  attempts: new Map<string, number>(),
  /** Hiç kayıt yokken yenilgide dönülecek durum (Ironman'ın ilk savaşı). */
  fallback: null as CampaignState | null,
  /** Debug: sis kapalı. */
  revealFog: false,
  /** Debug: haritada can taşıma ayrıntısı. */
  showHp: false,
  /** Ashford'da veda eden tutorial sınıfları ("Played in the tutorial" etiketi). */
  tutorialClasses: [] as string[],
  /** Haritada bir kez gösterilecek kısa not (ör. "Game saved (3/5)"). */
  notice: '',
};

export function current(): CampaignState | null {
  return session.state;
}

export function setState(s: CampaignState): void {
  session.state = s;
}

/** Yeni sefer: mod ve genel zorluk sabitlenir, yuvaya yerleşir (yuvadaki eski sefer silinir; onay ekranda alınır). */
export function startNewCampaign(mode: CampaignMode, difficulty: Difficulty = 'medium', slot = 0): CampaignState {
  const seed = newSeed();
  session.state = newCampaign({ mode, seed, difficulty, slot, campaignId: `c-${seed}-${Math.floor(Date.now() / 1000) % 100000}` });
  claimSlot(storage(), session.state);
  session.attempts = new Map();
  session.fallback = null;
  return session.state;
}

export function loadEntry(entry: SaveEntry): CampaignState {
  session.state = JSON.parse(JSON.stringify(entry.state)) as CampaignState;
  session.attempts = new Map();
  session.fallback = session.state;
  markPlayed(storage(), session.state.slot);
  return session.state;
}

/** Kayıt yazar (Ironman yalnızca 'auto'). Haritada gösterilecek notu da hazırlar. */
export function save(kind: SaveKind): boolean {
  const s = session.state;
  if (!s) return false;
  const r = writeSave(storage(), s, kind);
  if (r.ok && kind === 'manual') session.notice = r.replaced.length ? 'Game saved (oldest save replaced)' : 'Game saved';
  return r.ok;
}

/** Yenilgi: aynı seferin son kaydına (yoksa sefer başına) döner; düğümün deneme sayacı artar. */
export function loadLastSave(): CampaignState | null {
  const s = session.state;
  if (!s) return null;
  const last = latestSave(storage(), s.slot);
  const entry = last && last.campaignId === s.campaignId ? last : null;
  const back = entry ? (JSON.parse(JSON.stringify(entry.state)) as CampaignState) : session.fallback;
  if (!back) return null;
  back.stats.defeats = Math.max(back.stats.defeats, s.stats.defeats) + 1;
  session.attempts.set(s.at, (session.attempts.get(s.at) ?? 0) + 1);
  session.state = back;
  session.notice = entry ? 'Loaded your last save' : 'Back to the start of the journey';
  return back;
}

/**
 * Savaştan haritaya geri çekilme (Ömer 2026-10-08; savaş menüsü > Retreat to Map, onaylı): savaş sonuçsuz biter. Sefer durumu savaş
 * boyunca değişmediği için (sonuç yalnızca zaferde `applyBattle` ile yazılır) takım savaştan ÖNCEKİ haliyle aynı düğüme döner; düğüm
 * tamamlanmamış kalır, deneme sayacı ARTMAZ (sonraki girişte aynı savaş seed'i: geri çekilip seed değiştirme hilesi yok), kayıt alınmaz
 * (Normal ve Ironman aynı), boss savaşında da geçerli.
 */
export function retreatToMap(): CampaignState | null {
  const s = session.state;
  if (!s) return null;
  session.notice = 'You retreated. The battle did not count.';
  return s;
}

/** Sefer başı kaydı (Normal: listede görünür; Ironman: yalnızca bellekte, yenilgide dönüş noktası). */
export function markJourneyStart(): void {
  const s = session.state;
  if (!s) return;
  session.fallback = JSON.parse(JSON.stringify(s)) as CampaignState;
  if (s.mode === 'normal') save('start');
}

/** Bulunulan düğümün savaşını başlatır (mevcut savaş girişi: takım + düşman + seed + birim kurulumları). */
export function startCampaignBattle(scene: Phaser.Scene): BattlePlan | null {
  const s = session.state;
  if (!s) return null;
  const plan = battlePlan(s, session.attempts.get(s.at) ?? 0);
  const game = scene.game;
  const data: Partial<BattleSceneData> = {
    seed: plan.seed,
    mode: 'turns',
    battleId: content.DEFAULT_BATTLE,
    teams: { party: plan.party, enemies: plan.enemies, units: plan.units },
    partySize: plan.party.filter(Boolean).length,
    enemySize: plan.enemies.filter(Boolean).length,
    // Genel zorluk (yapay zeka): engine-dev AI girdisini hazırlıyor; BattleScene şimdilik yalnızca taşır
    difficulty: plan.difficulty,
    // Savaş arka planı (karşılaşma > düğüm > bölge; dosya yoksa savaşın varsayılanı): King's Bridge = kings-bridge
    ...(plan.background ? { background: plan.background } : {}),
    campaign: {
      resultActions: (victory, battle) => resultActions(game, plan, victory, battle),
      retreat: () => {
        retreatToMap();
        goTo(game, MAP_SCENE);
      },
    },
  };
  scene.scene.start(BATTLE_SCENE, data);
  return plan;
}

const goTo = (game: Phaser.Game, key: string, data?: object) => (game.scene.getScene(BATTLE_SCENE) as Phaser.Scene).scene.start(key, data);

/** Sefer savaşının sonuç ekranı düğmeleri. */
export function resultActions(game: Phaser.Game, plan: BattlePlan, victory: boolean, battle: Battle): ResultAction[] {
  if (victory)
    return [
      {
        label: 'Continue',
        primary: true,
        run: () => {
          const s = session.state;
          if (s && s.at === plan.nodeId) {
            session.state = applyBattle(s, outcomeFrom(plan, true, battleSummary(battle).units));
            save('auto');
          }
          goTo(game, MAP_SCENE);
        },
      },
    ];
  const out: ResultAction[] = [
    {
      label: 'Load Last Save',
      primary: true,
      run: () => {
        loadLastSave();
        goTo(game, MAP_SCENE);
      },
    },
  ];
  if (session.state?.mode === 'normal') out.push({ label: 'Load Game', run: () => goTo(game, MENU_SCENE, { open: 'load' }) });
  out.push({ label: 'Main Menu', run: () => goTo(game, MENU_SCENE) });
  return out;
}
