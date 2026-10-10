import type Phaser from 'phaser';
import { content } from '../engine';
import type { Battle } from '../engine';
import { grantLegendariesRun,
  abandonRun,
  addScore,
  applyOutcome,
  attachRecorder,
  battleFor,
  battleHash,
  planKey,
  replayActions,
  restoreBattle,
  suspendedOf,
  withSuspended,
  type ReplayAction,
  loadRun,
  loadScores,
  merchantEntry,
  newRun,
  outcomeFromBattle,
  saveRun,
  saveScores,
  scoreOf,
  wavePlan,
  type EndlessRun,
  type KV,
  type ScoreEntry,
  type WavePlan,
} from '../endless';
import { pickBackground } from './battle-background';
import type { ResultAction } from './result-screen';
import type { BattleScene, BattleSceneData, CampaignBattleHooks } from './scenes/BattleScene';
import { endlessEffects } from './battle-effects';
import { newSeed } from './seed';

/**
 * Endless'ın tarayıcı tarafı (oturum): o anki koşu, localStorage, savaşa geçiş ve savaştan dönüş. Kurallar src/endless/ içinde (saf).
 * BattleScene'e seferle aynı kapıdan (`campaign` kancaları: sonuç ekranı düğmeleri + Retreat) bağlanır; BattleScene'de endless'a özel kod yok.
 */

export const ENDLESS_SCENE = 'EndlessScene';
const BATTLE_SCENE = 'BattleScene';

export function storage(): KV | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface LastScore {
  entry: ScoreEntry;
  /** Skor listesindeki sırası (0 = en iyi), listeye giremediyse -1. */
  rank: number;
}

export const endless = {
  run: null as EndlessRun | null,
  /** Biten koşunun skoru (Run over ekranı). */
  last: null as LastScore | null,
  /** Kamp ekranında bir kez gösterilecek kısa not. */
  notice: '',
};

/** Kayıtlı koşu (yoksa null). Bellektekini tazeler. */
export function savedRun(): EndlessRun | null {
  return loadRun(storage());
}

/** Yeni koşu; `slots` = koşu başı dizilimi (class'larla aynı sırada hücre; verilmezse otomatik). */
export function startRun(classIds: string[], slots?: number[]): EndlessRun {
  endless.run = newRun(newSeed(), classIds, undefined, undefined, slots);
  endless.last = null;
  saveRun(storage(), endless.run);
  return endless.run;
}

export function continueRun(): EndlessRun | null {
  endless.run = savedRun();
  endless.last = null;
  return endless.run;
}

/** Koşu durumu değişti: belleğe ve kayda yaz (bitmişse yuva boşalır). Ara vermedeyse savaş alanındaki çubuklar da güncellenir (şifa ödülü). */
export function commit(run: EndlessRun): void {
  endless.run = run;
  saveRun(storage(), run);
  if (pause?.scene.sys.isActive() && run.phase !== 'over') pause.scene.syncEndlessUnits(pauseUnits(run, pause.heroOrder));
}

// ------------------------------------------------------------ sürekli akış: ara verme (Ömer 2026-10-10, madde 300)

/**
 * Ara verme: dalga bitince savaş alanı (BattleScene) durur, ödül / Gear / tüccar / kalıntı / kamp panelleri (EndlessScene, `overlay`) üstünde açılır.
 * `heroOrder`: o savaşın 'party-i' -> kahraman eşlemesi (çubukları güncellemek için).
 */
let pause: { scene: BattleScene; heroOrder: string[] } | null = null;

/** Koşudaki kahramanların can / MP oranları, ara verme savaşının uid'leriyle. */
function pauseUnits(run: EndlessRun, heroOrder: string[]): Array<{ uid: string; hpRatio: number; mpRatio: number }> {
  const out: Array<{ uid: string; hpRatio: number; mpRatio: number }> = [];
  heroOrder.forEach((id, i) => {
    const h = id ? run.heroes.find((x) => x.id === id) : undefined;
    if (h) out.push({ uid: `party-${i}`, hpRatio: h.hpRatio, mpRatio: h.carry?.mpRatio ?? 1 });
  });
  return out;
}

/** Ara verme panellerini savaş alanının üstünde aç (EndlessScene overlay). */
function openOverlay(bs: BattleScene, heroOrder: string[]): void {
  pause = { scene: bs, heroOrder };
  bs.events.once('shutdown', () => {
    if (pause?.scene === bs) pause = null;
  });
  bs.scene.launch(ENDLESS_SCENE, { overlay: true });
  bs.scene.bringToTop(ENDLESS_SCENE);
}

/** Ara verme sahnesi açık mı (EndlessScene overlay'i bunu sorar). */
export const pauseActive = (): boolean => !!pause?.scene.sys.isActive();

/**
 * Kayıttan devam / geri çekilme / tüccar kısayolu: koşu ara vermedeyse (kamp, ödül, tüccar, kalıntı) savaş alanı sıradaki dalganın kurulumuyla
 * (kahramanlar taşınan durumla, hücrelerinde; düşmanlar görünmez) açılır, paneller üstte. Koşu yoksa / bittiyse false.
 */
export function openPause(from: Phaser.Scene): boolean {
  const run = endless.run;
  if (!run || run.phase === 'over') return false;
  const plan = wavePlan(run);
  const data = battleData(from.game, plan, run, {
    intermission: true,
    onPause: (bs) => openOverlay(bs, plan.heroOrder),
    resultActions: () => [],
  });
  from.scene.start(BATTLE_SCENE, data);
  return true;
}

/** Planın BattleScene girişi (takımlar + seed + birim kurulumları + zorluk + arka plan) ve verilen kancalar. */
function battleData(game: Phaser.Game, plan: WavePlan, run: EndlessRun, hooks: CampaignBattleHooks): Partial<BattleSceneData> {
  // Doku anahtarı assets.ts > backgroundKey ile aynı ('bg:<id>'); assets.ts Phaser yüklediği için burada içe aktarılmaz (debug testleri Node'da)
  const exists = (id: string) => game.textures.exists(`bg:${id}`);
  // Sürekli akış (madde 300): savaş alanı koşu boyunca AYNI (koşu seed'iyle seçilir; boss karşılaşmasının kendi arka planı da kullanılmaz)
  const background = pickBackground('quick', run.seed, exists) ?? plan.background ?? undefined;
  return {
    seed: plan.seed,
    mode: 'turns',
    battleId: content.DEFAULT_BATTLE,
    teams: { party: plan.party, enemies: plan.enemies, units: plan.units },
    partySize: plan.party.filter(Boolean).length,
    enemySize: plan.enemies.filter(Boolean).length,
    difficulty: plan.difficulty,
    ...(background ? { background } : {}),
    campaign: { retreatLabel: 'Retreat to Camp', battleEffects: () => endlessEffects(run), ...hooks },
  };
}

/** Zafer (sürekli akış): sonuç yazılır, tek birleşik toparlanma animasyonu oynar, sonra ara verme panelleri savaş alanının üstünde açılır. */
function onVictory(game: Phaser.Game, plan: WavePlan, battle: Battle): boolean {
  if (recording?.battle === battle) stopRecording();
  const run = endless.run;
  if (!run) return false;
  const next = applyOutcome(run, plan, outcomeFromBattle(plan, battle));
  if (next === run || next.phase === 'over') return false;
  commit(next);
  const bs = game.scene.getScene(BATTLE_SCENE) as BattleScene;
  void bs.playEndlessRecovery(pauseUnits(next, plan.heroOrder)).then(() => {
    if (bs.sys.isActive()) bs.enterEndlessPause();
  });
  return true;
}

/** Koşu bitti: skoru yerel listeye yaz (bir kez; çağıran koşunun yeni bittiğinden emin olur). */
export function recordScore(run: EndlessRun): void {
  if (run.preview) return; // tüccar önizlemesi en iyi koşulara yazılmaz
  const res = addScore(loadScores(storage()), scoreOf(run));
  saveScores(storage(), res.list);
  endless.last = { entry: res.list[res.rank] ?? scoreOf(run), rank: res.rank };
}

/** Kamp ekranı > Abandon Run (onaylı). */
export function abandon(): void {
  stopRecording();
  const run = endless.run;
  if (!run) return;
  const over = abandonRun(run);
  commit(over);
  recordScore(over);
}

export const scores = (): ScoreEntry[] => loadScores(storage());

const goTo = (game: Phaser.Game, key: string, data?: object) => (game.scene.getScene(BATTLE_SCENE) as Phaser.Scene).scene.start(key, data);

/**
 * Tüccar kısayolu (?merchant=1, debug > Open merchant): bellekteki / kayıtlı gerçek koşu kampta bekliyorsa onda tüccar açılır (kaydedilir),
 * tüccardaysa o; yoksa kayda DOKUNMAYAN atılır önizleme koşusu (src/endless/merchant.ts > merchantEntry / previewRun). Dönen: açılan koşu.
 */
export function prepareMerchant(): EndlessRun {
  const mem = endless.run && !endless.run.preview && endless.run.phase !== 'over' ? endless.run : null;
  const e = merchantEntry(mem ?? savedRun(), newSeed());
  endless.run = e.run;
  endless.last = null;
  if (e.save) saveRun(storage(), e.run);
  return e.run;
}

/** Tüccarı aç (debug): etkin sahne ne olursa olsun Endless sahnesi tüccar görünümüyle açılır. */
export function openMerchant(game: Phaser.Game): void {
  prepareMerchant();
  const active = game.scene.getScenes(true)[0];
  if (active) active.scene.start(ENDLESS_SCENE);
  else game.scene.start(ENDLESS_SCENE);
}

/** Ana menü (Play > Endless mode) ve debug için tek giriş: etkin sahne ne olursa olsun Endless başlık ekranını açar. */
export function openEndless(game: Phaser.Game): void {
  const active = game.scene.getScenes(true)[0];
  if (active) active.scene.start(ENDLESS_SCENE, { view: 'title' });
  else game.scene.start(ENDLESS_SCENE, { view: 'title' });
}

// ------------------------------------------------------------ yarım kalan savaş (kayıt + devam)

/** Kayıt tutulan savaş: her başarılı eylemden sonra koşunun `suspended` alanı yazılır (sekme kapansa da o tura dönülür). */
let recording: { battle: Battle; stop: () => void } | null = null;

function stopRecording(): void {
  recording?.stop();
  recording = null;
}

/** Savaşa günlük tutucuyu bağlar; günlük `actions` ile (devam ediliyorsa önceki eylemlerle) başlar. */
function startRecording(battle: Battle, plan: WavePlan, actions: ReplayAction[]): void {
  stopRecording();
  const log = [...actions];
  let active = true;
  const off = attachRecorder(battle, (a) => {
    const run = endless.run;
    if (!active || !run || run.phase !== 'ready' || run.wave !== plan.wave) return;
    log.push(a);
    commit(withSuspended(run, { wave: plan.wave, seed: plan.seed, actions: [...log], turn: battle.turnsTaken, hash: battleHash(battle), setup: planKey(plan) }));
  });
  recording = {
    battle,
    stop: () => {
      active = false;
      off();
    },
  };
}

/** Yarım savaşı sil (geri çekilme: savaş sayılmaz). */
function dropSuspended(): void {
  const run = endless.run;
  if (run?.suspended) commit(withSuspended(run, undefined));
}

/**
 * Sıradaki dalganın savaşını başlatır (mevcut savaş girişi: takımlar + seed + birim kurulumları + zorluk + arka plan).
 * `resume`: yarım kalan savaş günlüğü önce başsız bir savaşta oynatılıp doğrulanır; tutarsa sahnedeki savaş da aynı günlükle o tura getirilir.
 * Tutmazsa (veri değişmiş, kayıt bozuk) kayıt atılır ve dalga baştan başlar (kampta not gösterilir).
 */
export function startWave(scene: Phaser.Scene, resume = false): WavePlan | null {
  const run = endless.run;
  if (!run || run.phase !== 'ready') return null;
  const plan = wavePlan(run);
  let susp = resume ? suspendedOf(run) : null;
  if (susp && ((susp.setup !== undefined && susp.setup !== planKey(plan)) || !restoreBattle(battleFor(plan), susp))) {
    susp = null;
    endless.notice = 'The suspended battle could not be restored. The wave starts over.';
  }
  if (!susp) dropSuspended();
  const replay = susp?.actions ?? [];
  const game = scene.game;
  const data = battleData(game, plan, run, {
    // Sürekli akış: dalga ekran geçişsiz başlar, "WAVE X" bandı + düşman girişi; yarım savaşa dönüşte bant yok (savaş sürüyor)
    ...(resume ? {} : { seamless: true, intro: { title: `Wave ${plan.wave}`, ...(plan.kind !== 'normal' ? { subtitle: plan.name } : {}) } }),
    // Sahne savaşı kurar kurmaz (çizimden önce): devam ise günlük oynatılır, sonra kayıt başlar
    prepareBattle: (battle) => {
      if (replay.length) replayActions(battle, replay);
      startRecording(battle, plan, replay);
    },
    resultActions: (victory, battle) => resultActions(game, plan, victory, battle),
    onVictory: (battle) => onVictory(game, plan, battle),
    onPause: (bs) => openOverlay(bs, plan.heroOrder),
    retreat: () => {
      stopRecording();
      dropSuspended();
      endless.notice = 'You retreated. The battle did not count.';
      // Savaş sayılmaz: savaş alanı dalga başı haliyle ara vermeye döner (paneller üstte)
      const bs = game.scene.getScene(BATTLE_SCENE) as Phaser.Scene;
      if (!openPause(bs)) goTo(game, ENDLESS_SCENE);
    },
  });
  scene.scene.start(BATTLE_SCENE, data);
  return plan;
}

/**
 * Sonuç ekranı düğmeleri. Sonuç, düğmeler kurulurken (savaş biter bitmez) koşuya yazılır ve kaydedilir: sekme kapansa da yenilgi geri alınamaz
 * (Ironman gibi). applyOutcome aynı dalgayı iki kez yazmaz; yarım savaş kaydını da siler.
 */
export function resultActions(game: Phaser.Game, plan: WavePlan, victory: boolean, battle: Battle): ResultAction[] {
  if (recording?.battle === battle) stopRecording();
  const run = endless.run;
  if (run) {
    const next = applyOutcome(run, plan, outcomeFromBattle(plan, battle));
    if (next !== run) {
      commit(next);
      if (next.phase === 'over') recordScore(next);
    }
  }
  if (victory) return [{ label: 'Claim Reward', primary: true, run: () => goTo(game, ENDLESS_SCENE) }];
  return [
    { label: 'Run Summary', primary: true, run: () => goTo(game, ENDLESS_SCENE) },
    { label: 'Main Menu', run: () => goTo(game, 'MainMenuScene') },
  ];
}

/** ?legendary=1 önizlemesi (madde 296): bekleyen / kayıtlı koşunun torbasına 10 Legendary (yoksa yeni bir koşu açılır). */
export function applyLegendaryPreview(): EndlessRun {
  const run = endless.run && endless.run.phase !== 'over' ? endless.run : (continueRun() ?? startRun(['warrior', 'archer', 'mage', 'druid']));
  commit(grantLegendariesRun(run));
  return endless.run!;
}
