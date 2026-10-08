import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { Battle, MatchLog, chooseAction, isRatioCost, skillCostAmount, skillCostLabel, content, explainChoice, describeGlobalSkill, describePassive, describeRage, describeSkill, describeStat, previewSkill, armorReduction } from '../../engine';
import type { AreaStage, BattleEvent, BattleMode, Combatant, SkillDef, StatKind, Teams, TargetPreview } from '../../engine';
import { type DamageTags } from '../float-text';
import { ATTACK_STATS, DEFENSE_STATS, MAIN_STATS, rowCenters, statBlockMetrics, statRowText } from '../stat-columns';
import { PRIMARY_GOLD, RAGE_COLOR, RAGE_ICON, STAT_COLOR, STAT_ICON, STAT_LABEL, UI_COLOR, UI_ICON } from '../../ui/stat-icons';
import { avatarTexture, backgroundKey, characterTexture, hasBackground, preloadAssets } from '../assets';
import { CombatantView, color, slow, textStyle } from '../combatant-view';
import { ensureIcon, ensureSkillIcon } from '../icons';
import { initialSeed, initialSizes, newSeed } from '../seed';
import { clampSize } from '../team-select-model';
import { GOLD, SERIF, cornerOrnaments, ensureGrain, frameRect, glowRect, gradientRect, makeBadge, makePanel } from '../ui-frame';
import { playSfx } from '../audio';
import { BattleStats, showResultScreen } from '../result-screen';
import type { ResultAction, ResultScreen } from '../result-screen';
import { debugState, effectiveTimeScale, tweaksSummary } from '../debug-state';
import { testMode, testModeSummary } from '../test-mode';
import { LONG_PRESS_MS, LONG_PRESS_SLOP, UNIT_SELECT_EVENT, UnitSelection, isSelectModifier, pickUnitAt } from '../unit-select';
import { corpseDrainFx, groundArea, meleeApproach, summonFx, WARDEN_EVENT_FX, wardenBrandMark, wardenTelegraphCells } from '../vfx';
import { VFX_KIT, resolveSkillVfx, skillSfxAllowed } from '../vfx-versions';
import { CODE_SFX, SHARED_KEY, onVersionsChange, ownerOfSkill, ownerOfUnit, statusOwner } from '../asset-versions';
import { statusBadge } from '../art-registry';
import { EVENT_FX, eventContextSkill, selectEventFx } from '../event-fx';
import { UsageRecorder, type SkillUsage } from '../skill-usage';
import type { VfxCtx } from '../vfx';
import { unitName, tierStyle } from '../unit-label';
import { skillMiniGrid } from '../../ui/shape-diagram';
import type { MiniShape } from '../../ui/shape-diagram';
import { drawCellTiles, drawMiniShape, miniShapeSize } from '../shape-draw';
import type { CellTileSpec } from '../shape-draw';
import { stageMap } from '../cell-style';
import type { CellTone } from '../cell-style';
import { boardBounds, cellCenter } from '../shape-geometry';
import { alphaOpaque, pickCellAt, type PickSprite } from '../pick-cell';
import type { Pt } from '../shape-geometry';
import { cellKey, corpseMarkPos, corpseTip, empoweredLine, summonPreviewLine, visibleCorpseMarks } from '../corpse-marks';
import type { CorpseState } from '../corpse-marks';
import { createCorpseMarker } from '../corpse-marker';
import { backRaiseFlow, corpseHoverTip, pickCorpse, pickSlot, raiseFlowHint, reconcileRaiseFlow, reviveCorpseTip, reviveFlowHint, reviveSlotTip, slotHoverTip, startRaiseFlow } from '../raise-dead-flow';
import type { RaiseFlow, RaiseInputs } from '../raise-dead-flow';
import type { CorpseMarker } from '../corpse-marker';
import { isDeltaStat, previewStatusText, statDir, statSources } from '../stat-delta';
import { areaBoards, areaHoverSpecs, areaTone, blockedTargets } from '../target-cells';
import type { MpBattleHooks, MpResultInfo } from '../mp-hooks';

export interface BattleSceneData {
  seed: number;
  battleId: string;
  showSlots: boolean;
  mode: BattleMode;
  /** Takım seçim ekranından gelen takımlar; yoksa seed'e göre rastgele. */
  teams: Teams | undefined;
  /** Rastgele takım boyutları (1-12); yoksa önceki savaşın / adresin boyutu (varsayılan 4-4). */
  partySize: number;
  enemySize: number;
  /** Sefer savaşı (campaign-dev): sonuç ekranı düğmeleri seferden gelir; yoksa hızlı savaş (Quick Battle). */
  campaign?: CampaignBattleHooks;
  /** Sefer genel zorluğu (yapay zeka): TODO(engine-dev) AI girdisi gelince motora iletilecek; şimdilik yalnızca saklanır. */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Savaş arka planı (assets/backgrounds/<ad>): sefer karşılaşma/düğüm/bölge seçimi; dosya yoksa savaşın varsayılan arka planı. */
  background?: string;
  /** Multiplayer savaşı (src/game/mp-client.ts): savaş lockstep'ten gelir, yalnızca yerel taraf oynanır, YZ yok. */
  mp?: MpBattleHooks;
}

/** Sefer bağlamı: savaş bitince sonuç ekranının düğmeleri (Continue / Load Last Save / Load Game / Main Menu). src/game/campaign-session.ts */
export interface CampaignBattleHooks {
  resultActions(victory: boolean, battle: Battle): ResultAction[];
}

/** Üç küçük global eylem düğmesinin (Rest / Skip Turn / Move) sütunu: 4 skill düğmesinin hemen sağında, tooltip plaketinin solunda. */
const GLOBAL_BTN = { w: 64, h: 44, gap: 2 };
/** Kalkan kancası tetiklenince çalan kilit sesi (yalnızca sahibinin v2 ses dosyasında tanımlıysa çalar: Anti-Mage / Mage v2). */
const SHIELD_LOCK_SFX: Record<string, string> = { spell_ward: 'wardLock', mana_barrier: 'domeLock' };
/** Global eylem düğmelerinin ikon rengi. */
const GLOBAL_ACCENT: Record<string, string> = { rest: '#9cc4ff', skip: '#e8dcc0', move: '#e8c47e' };

const { width: W, height: H, colors } = layout;

/** A chip in the first row of the info plaque (cost, cooldown). */
interface InfoMeta {
  icon?: string;
  text: string;
  hex: string;
}

interface Tip {
  container: Phaser.GameObjects.Container;
  width: number;
  height: number;
}

/**
 * Battle screen. It knows no rules: it sends actions to the engine and plays back the engine's events.
 * turns mode: order comes from SPD; player units are controlled by the player, enemies by the AI.
 * test mode: no turn order, the tester can act with any unit at any time (debug).
 * Each turn the acting player unit's first usable skill comes pre-selected; nothing happens until the player confirms.
 */
export class BattleScene extends Phaser.Scene {
  static readonly KEY = 'BattleScene';

  seed = initialSeed();
  battleId: string = content.DEFAULT_BATTLE;
  showSlots = false;
  /** Debug: free MP survives battle restarts. */
  static freeMp = false;
  mode: BattleMode = 'turns';
  teams: Teams | undefined = undefined;
  /** Sefer savaşı bağlamı (yalnızca sefer haritasından başlatılınca; her başlatmada verilmezse temizlenir). */
  campaign: CampaignBattleHooks | undefined = undefined;
  /** Sefer genel zorluğu (yalnızca sefer savaşında; bkz. BattleSceneData.difficulty). */
  difficulty: 'easy' | 'medium' | 'hard' | undefined = undefined;
  /** Sefer savaş arka planı (BattleSceneData.background). */
  background: string | undefined = undefined;
  /** Multiplayer kancaları (yoksa tek oyunculu). */
  mp: MpBattleHooks | undefined = undefined;
  /** Bu ekranda oynayan insanın tarafı: tek oyunculuda daima 'party'; multiplayer'da katılan 'enemy' (sağ). */
  localSide: 'party' | 'enemy' = 'party';
  private mpOff: Array<() => void> = [];
  /** Takım boyutları (rastgele takım çekilirken; savaş başlayınca gerçek boyuttan okunur). */
  partySize = initialSizes().party;
  enemySize = initialSizes().enemies;
  /** turns mode: let the AI play the player's party too (debug). */
  autoPlay = false;
  /** Human-readable description of the last AI decision (debug info). */
  lastAi = '-';
  battle!: Battle;

  private views = new Map<string, CombatantView>();
  private slotLayer?: Phaser.GameObjects.Container;
  private turnBarLayer?: Phaser.GameObjects.Container;
  /** Units that already played (oldest first), shown faded on the left of the turn bar. UI-side list built from turnStart events. */
  private playedUids: string[] = [];
  private commandLayer?: Phaser.GameObjects.Container;
  private announceLayer?: Phaser.GameObjects.Container;
  /** Skill ve stat tooltip'leri: alt barın sağındaki boşlukta. */
  private infoTip?: Tip;
  private statHitsOn = true;
  private areaMarker?: Phaser.GameObjects.Container;
  /** Hover plate parts that must sit above the units (the reason plaque of an invalid cell). */
  private areaTop?: Phaser.GameObjects.Container;
  /** Cell picking (every slot / target choice): one pointer zone per target board and the cell under the pointer. */
  private cellZones: Phaser.GameObjects.Zone[] = [];
  private cellHover: { board: 'party' | 'enemy'; slot: number } | null = null;
  private groundViews = new Map<string, Phaser.GameObjects.Container>();
  /** Bekleyen telgrafların (Bridge Warden) kalıcı göstergeleri: telgraf id -> çatlak hücreler + (damgada) birim üstü işaret. */
  private telegraphViews = new Map<string, { cells?: { destroy(): void }; mark?: { destroy(): void }; kind: 'span' | 'fall' | 'brand' }>();
  private badgeKeys = new Map<string, string>();
  /** Skill kullanımlarının olay özeti (VfxCtx.usage; src/game/skill-usage.ts): olaylar motor yayarken kaydedilir, efekt oynarken okunur. */
  private usageRec = new UsageRecorder();
  /** Oynayan skillUsed olayının kullanım özeti (efekt bağlamına verilir). */
  private currentUsage: SkillUsage | undefined;
  /** Son turnStart bir ek eylem miydi (actionsPerTurn > 1: sıra çubuğunda "2nd"). */
  private extraAction = false;
  /** Sıra çubuğunun son kuyruğu (sürüm değişince yeniden çizmek için). */
  private lastQueue: string[] = [];
  private slotMarkers?: Phaser.GameObjects.Container;
  private hoverView?: CombatantView;
  /** Ctrl+sol tık (Mac Cmd, dokunmatik uzun basma) ile seçilen birimler: bilgi/inceleme ve debug Unit araçlarının hedefi. */
  private unitSel = new UnitSelection();
  /** Dokunmatik uzun basma sayacı ve 'bu basış seçim jestiydi' bayrağı (bırakınca skill seçmesin). */
  private pressTimer?: Phaser.Time.TimerEvent;
  private longPressFired = false;
  private unitTipKey = '';
  private hint?: Phaser.GameObjects.Text;
  /** test mode: the unit the tester is controlling. */
  private controlled: string | null = null;
  /** turns mode: whose turn the screen currently shows (lags behind the engine while animations play). */
  private uiActor: string | null = null;
  private busy = false;
  /** The pre-selected / chosen skill of the acting player unit (waits for a target tap or confirmation). */
  private selected: { actor: string; skill: string } | null = null;
  private eventQueue: Promise<void> = Promise.resolve();
  private stats!: BattleStats;
  /** Maç kaydı (hamleler + AI gerekçeleri; Debug > Copy match data ve sonuç ekranı kullanır). */
  private matchLog?: MatchLog;
  private resultScreen?: ResultScreen;
  /** Move Tile seçimi açık mı (altın hücre vurguları gösteriliyor)? */
  private moveMode: { actor: string } | null = null;
  /** Global düğmelerin nesneleri (birim tooltip'i açıkken gizlenir). */
  private globalItems: Phaser.GameObjects.GameObject[] = [];
  /** Rage barının ekranda gösterilen değeri (olaylar oynatıldıkça animasyonla güncellenir; motor değerinin gerisinde kalabilir). */
  private rageShown = new Map<string, number>();
  private rageBar?: { uid: string; redraw: () => void };
  /** Ceset işaretleri (madde 222): ekrandaki ankh + kuru kafa işaretleri (uid -> işaret). */
  private corpseMarkers = new Map<string, CorpseMarker>();
  /** Ekranın bildiği ceset durumları (olaylar oynatıldıkça güncellenir; motor durumunun gerisinde kalabilir): uid -> revivable | consumed. */
  private uiCorpses = new Map<string, CorpseState>();
  /** Yuvasında canlı çağrı duran hücreler ('board:slot'): üstte birim varken ceset işareti gizlenir. */
  private uiOccupied = new Set<string>();

  constructor() {
    super(BattleScene.KEY);
  }

  init(data: Partial<BattleSceneData>): void {
    this.seed = data.seed ?? this.seed;
    this.battleId = data.battleId ?? this.battleId;
    this.showSlots = data.showSlots ?? this.showSlots;
    this.mode = data.mode ?? this.mode;
    if ('teams' in data) this.teams = data.teams;
    this.campaign = data.campaign;
    this.difficulty = data.difficulty;
    this.background = data.background;
    this.mp = data.mp;
    this.localSide = data.mp?.localSide ?? 'party';
    for (const off of this.mpOff) off();
    this.mpOff = [];
    if (this.mp) this.autoPlay = false;
    if (data.partySize !== undefined) this.partySize = clampSize(data.partySize);
    if (data.enemySize !== undefined) this.enemySize = clampSize(data.enemySize);
    this.moveMode = null;
    this.globalItems = [];
    this.rageShown = new Map();
    this.rageBar = undefined;
    this.corpseMarkers = new Map();
    this.uiCorpses = new Map();
    this.uiOccupied = new Set();
    this.views = new Map();
    this.lastSkill = new Map();
    this.controlled = null;
    this.uiActor = null;
    this.playedUids = [];
    this.busy = false;
    this.selected = null;
    this.hoverView = undefined;
    this.unitSel = new UnitSelection();
    this.pressTimer = undefined;
    this.longPressFired = false;
    this.infoTip = undefined;
    this.slotMarkers = undefined;
    this.areaMarker = undefined;
    this.areaTop = undefined;
    this.cellZones = [];
    this.cellHover = null;
    this.groundViews = new Map();
    this.telegraphViews = new Map();
    this.badgeKeys = new Map();
    this.usageRec = new UsageRecorder();
    this.currentUsage = undefined;
    this.lastQueue = [];
    this.unitTipKey = '';
    this.eventQueue = Promise.resolve();
    this.lastAi = '-';
    this.galleryCaster = null;
    this.debugUnitUid = null;
    debugState.paused = false; // a new battle never starts frozen
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    const def = content.battles[this.battleId];
    // Sefer arka planı (varsa ve dosyası yüklüyse), yoksa savaşın varsayılanı (castle-hall)
    this.drawBackground(this.background && hasBackground(this, this.background) ? this.background : (def?.background ?? ''));
    this.drawSlots();

    // Multiplayer: savaş iki istemcide aynı kurulan lockstep savaşıdır (src/net/lockstep.ts)
    this.battle = this.mp ? this.mp.battle : new Battle(content.battleSetup(this.battleId, this.seed, this.mode, this.teams ? { ...this.teams } : { partySize: this.partySize, enemySize: this.enemySize }, false));
    // Gerçek boyutlar (takım seçiminden gelen hücre listeleri dahil): "New Game" ve Team Select bunları korur
    this.partySize = this.battle.combatants.filter((c) => c.side === 'party' && !c.summoned).length || this.partySize;
    this.enemySize = this.battle.combatants.filter((c) => c.side === 'enemy' && !c.summoned).length || this.enemySize;
    for (const c of this.battle.combatants) if (c.maxRage !== undefined) this.rageShown.set(c.uid, c.rage ?? 0);
    // Debug/Test Mode switches never leak into campaign or multiplayer battles (normal costs and cooldowns there; multiplayer would desync)
    if (!this.mp) {
      this.battle.freeMp = !this.campaign && BattleScene.freeMp;
      this.battle.freeRage = !this.campaign && testMode.unlimitedRage;
      this.battle.noCooldowns = !this.campaign && testMode.noCooldowns;
      Object.assign(this.battle.debug, debugState.flags);
    }
    this.applyDebugTiming();
    this.bindSkillHotkeys();
    this.bindUnitSelect();
    for (const c of this.battle.combatants) this.addView(c);
    this.syncCorpsesNow();
    this.uiActor = this.battle.currentUid;
    this.renderTurnBar(this.battle.turnQueue());
    this.stats = new BattleStats(this.battle);
    this.matchLog?.stop();
    this.matchLog = debugState.matchLog
      ? new MatchLog(this.battle, () => {
          const tweaks = tweaksSummary(debugState, BattleScene.freeMp, testModeSummary(testMode));
          return {
            version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
            builtAt: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : undefined,
            commit: typeof __GIT_COMMIT__ === 'string' && __GIT_COMMIT__ ? __GIT_COMMIT__ : undefined,
            ...(tweaks !== 'none' ? { note: `debug tweaks: ${tweaks}` } : {}),
          };
        })
      : undefined;
    this.resultScreen = undefined;
    this.battle.on((e) => {
      this.stats.record(e);
      this.enqueue(e);
    });

    this.hint = this.add.text(W / 2, layout.commandPanel.y - 60, '', textStyle(38, colors.selected)).setOrigin(0.5).setDepth(4400).setVisible(false);

    this.drawCommandPanel();
    if (this.mp) this.bindMultiplayer(this.mp);
    this.settle(); // the first unit may be an enemy: let the AI start
    // Sanat sürümü değişince (debug > Versions) ikonlar, logolar ve durum rozetleri hemen yeni sürümle çizilir
    const offVersions = onVersionsChange(() => this.onVersionsChanged());
    this.events.once('shutdown', offVersions);
  }

  /** Multiplayer: rakibin hamlesi gelince olaylar oynatılır ve sıra devredilir; savaş dışı bitiş (kopma, ayrılma, desync) sonuç ekranını açar. */
  private bindMultiplayer(mp: MpBattleHooks): void {
    this.mpOff.push(
      mp.onRemote(() => {
        if (!this.scene.isActive()) return;
        this.clearSelection();
        this.busy = true;
        this.refreshCommands();
        this.settle();
      }),
    );
    // Bağlantı koptu / geri geldi: panel yazısı ve giriş kilidi tazelenir (dönüşte eylemi olmayan birim için pas da gider)
    this.mpOff.push(
      mp.onStatus(() => {
        if (this.scene.isActive() && !this.busy) this.settle();
      }),
    );
    this.mpOff.push(
      mp.onEnded((info) => {
        if (!this.scene.isActive()) return;
        this.eventQueue = this.eventQueue.then(() => this.showMpResult(info));
      }),
    );
    this.events.once('shutdown', () => {
      for (const off of this.mpOff) off();
      this.mpOff = [];
    });
    const done = mp.result();
    if (done && !this.battle.winner) this.eventQueue = this.eventQueue.then(() => this.showMpResult(done));
  }

  private showMpResult(info: MpResultInfo): void {
    if (!this.scene.isActive()) return;
    this.clearSelection();
    this.refreshCommands();
    this.showResult(info.victory, false, info);
  }

  /** Per-unit badge refresh (statuses, ground effects underfoot, armor from auras): cheap, only redraws when something changed. */
  private refreshBadges(): void {
    for (const view of this.views.values()) {
      const c = this.battle.get(view.combatant.uid);
      if (!c || c.hp <= 0) continue;
      const list: Array<{ icon: string; owner?: string; color: string; text: string; debuff: boolean; turns: boolean }> = [];
      let seals: { stacks: number; max: number; turns: number; color: string } | null = null;
      for (const st of c.statuses) {
        const def = content.statuses[st.kind];
        const fallback = { taunt: ['finger', '#ff9f43'], guard: ['guardian', '#6ec1ff'], regen: ['leaf', '#7dff9b'] }[st.kind as 'taunt' | 'guard' | 'regen'] ?? ['roar', '#ffffff'];
        // Rozet sürümü: sınıfa özgü durum sahibinin v2 badge_<id> çizimini izler, ortak durum Shared (art-registry > statusBadge)
        const art = statusBadge(st.kind, def?.icon ?? fallback[0]!);
        const max = (def as { maxStacks?: number } | undefined)?.maxStacks ?? 0;
        // Yığılan durum (Omen): rozet "x2"; kalan tur ve yığın can çubuğunun solundaki mühür yuvalarında (hexer.md bölüm 8)
        if (max > 1 && st.stacks) seals = { stacks: st.stacks, max, turns: st.turns, color: def?.color ?? '#b04fa8' };
        // Yüklü durum (Abyssal Fury, madde 262): rozet kalan saldırı yükünü gösterir ("x3"; `turns` alanında tutulur, tur saymaz)
        const charged = !!def?.attackCharges;
        list.push({ icon: art.name, owner: art.owner, color: def?.color ?? fallback[1]!, text: max > 1 && st.stacks ? `x${st.stacks}` : charged ? `x${st.turns}` : String(st.turns), debuff: def?.type === 'debuff', turns: !(max > 1 && st.stacks) && !charged });
      }
      for (const g of this.battle.ground) {
        if (g.board !== c.board || !g.slots.includes(c.slot) || g.sourceSide === c.side) continue;
        const def = content.grounds[g.ground];
        list.push({ icon: def?.icon ?? 'flame', color: def?.color ?? '#ffffff', text: String(g.turns), debuff: true, turns: true });
      }
      const bonus = this.battle.effectiveStats(c).armor - c.stats.armor;
      if (Math.round(bonus) > 0) list.push({ icon: 'shield', color: '#c9d1dc', text: `+${Math.round(bonus)}`, debuff: false, turns: false });
      const key = JSON.stringify([list, seals]);
      if (this.badgeKeys.get(c.uid) === key) continue;
      this.badgeKeys.set(c.uid, key);
      view.setBadges(list);
      view.setSeals(seals);
    }
  }

  /** Sanat sürümü değişti (debug > Versions): rozetler, sıra çubuğu logoları ve alt çubuk (skill ikonları, pasif, logo) hemen yeniden çizilir. */
  private onVersionsChanged(): void {
    if (!this.battle || !this.scene.isActive()) return;
    this.badgeKeys.clear();
    if (this.lastQueue.length || this.battle.mode === 'test') this.renderTurnBar(this.lastQueue);
    this.refreshCommands();
  }

  /**
   * OLAY EFEKTİ (v2 kancası, src/game/event-fx.ts): sahibin v2'si seçili ve dosyasında `key` efekti varsa onu VfxCtx ile oynatır ve true döner;
   * yoksa false (çağıran v1 efektini oynar). `actor` efektin çıkış birimi, `targets` etkilenenler; `at` yer noktası (ceset hücresi gibi).
   * Efekt hata verirse uyarı basılır ve savaş sürer (true döner: v1 tekrar oynamaz).
   */
  private async runEventFx(owner: string | null, key: string, o: { actor: CombatantView | undefined; targets?: CombatantView[]; at?: { x: number; y: number }; event: BattleEvent; skillId?: string; unitId?: string; usage?: SkillUsage }): Promise<boolean> {
    const fx = selectEventFx(owner, key);
    const actor = o.actor ?? o.targets?.[0];
    if (!fx || !owner || !actor) return false;
    const skill = eventContextSkill(owner, { ...(o.skillId ? { skillId: o.skillId } : {}), ...(o.unitId ? { unitId: o.unitId } : {}) });
    if (!skill) return false;
    const targets = o.targets ?? [];
    const ctx: VfxCtx = {
      scene: this,
      actor,
      targets,
      skill,
      board: (targets[0] ?? actor).combatant.board,
      ...(o.at ? { centerPos: o.at } : {}),
      cells: o.at ? [o.at] : [],
      slots: [],
      releaseStage: () => undefined,
      lunge: () => meleeApproach(this, actor, targets),
      windUp: (hex, anim = 'cast') => actor.windUp(hex, anim),
      sfx: (id) => {
        if (skillSfxAllowed(skill, id, owner) || CODE_SFX[owner]?.includes(id)) playSfx(this, id, owner);
      },
      gate: () => undefined,
      foes: [...this.views.values()].filter((v) => v.combatant.side !== actor.combatant.side && v.combatant.hp > 0),
      ...(o.usage ? { usage: o.usage } : {}),
      viewOf: (uid) => this.views.get(uid),
      event: o.event,
    };
    try {
      await fx(ctx, VFX_KIT);
    } catch (err) {
      console.warn(`[art-v2] ${owner}/${key} olay efekti hata verdi`, err);
    }
    return true;
  }

  /** Sahibine göre: olay efektinin sahibi (birimin class'ı / çağıranı). */
  private ownerOfView(v: CombatantView | undefined): string | null {
    return v ? ownerOfUnit(v.combatant.defId) : null;
  }

  /** SPEED bars under the mana bars: turn counter / threshold from the engine (read-only). Hidden in test mode. */
  private refreshSpeedBars(): void {
    for (const view of this.views.values()) view.setSpeed(this.battle.turnProgressOf(view.combatant.uid));
  }

  update(): void {
    this.refreshBadges();
    this.refreshSpeedBars();
    // The unit tooltip shows live values: re-render it when what it shows changes (damage, regen, ...)
    if (this.hoverView && this.unitTipKey !== this.unitTipLines(this.hoverView.combatant).join('|')) this.showUnitTip(this.hoverView);
  }

  /** Keys 1-4 pick the acting unit's skills (the same as clicking the button; pressing it again confirms a no-target skill). */
  private bindSkillHotkeys(): void {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Escape' && this.moveMode) {
        this.cancelMove();
        return;
      }
      if (e.key === 'Escape' && this.raiseFlow && this.selected) {
        this.raiseBack();
        return;
      }
      if (e.key === 'Escape' && this.clearUnitSelection()) return;
      const n = '1234'.indexOf(e.key) + 1;
      if (n === 0) return;
      const skillId = this.activeActor?.skills[n - 1];
      if (skillId) this.onSkillClick(skillId);
    };
    window.addEventListener('keydown', onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));
  }

  // --- Global unit selection: Ctrl + left click (Mac: Cmd; touch: long press) toggles any unit, friend or foe ---

  /** Pointer handlers for the selection gesture; ordinary clicks (skill targeting, turn flow) are never touched. */
  private bindUnitSelect(): void {
    const panelTop = layout.commandPanel.y;
    const cancelPress = (): void => {
      this.pressTimer?.remove(false);
      this.pressTimer = undefined;
    };
    const unitAt = (x: number, y: number): string | undefined =>
      pickUnitAt(
        [...this.views.values()].filter((v) => v.alive && v.container.visible && v.container.alpha >= 0.3).map((v) => ({ uid: v.combatant.uid, x: v.container.x, y: v.container.y, w: v.w, h: v.h })),
        x,
        y,
      );
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.longPressFired = false;
      cancelPress();
      if (p.y >= panelTop) return;
      if (isSelectModifier(p.event as MouseEvent | undefined)) {
        const uid = unitAt(p.x, p.y);
        if (uid) this.toggleUnitSelect(uid);
        return;
      }
      if (p.wasTouch) {
        const sx = p.x;
        const sy = p.y;
        this.pressTimer = this.time.delayedCall(LONG_PRESS_MS, () => {
          this.pressTimer = undefined;
          if (!p.isDown || Math.hypot(p.x - sx, p.y - sy) > LONG_PRESS_SLOP) return;
          const uid = unitAt(sx, sy);
          if (!uid) return;
          this.longPressFired = true;
          this.toggleUnitSelect(uid);
        });
        return;
      }
      // Ordinary click on empty ground clears the selection (a click on a unit never does: it may be a skill target)
      if (this.unitSel.size > 0 && !unitAt(p.x, p.y)) this.clearUnitSelection();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pressTimer && p.isDown && Math.hypot(p.x - p.downX, p.y - p.downY) > LONG_PRESS_SLOP) cancelPress();
    });
    this.input.on('pointerup', cancelPress);
    this.events.once('shutdown', cancelPress);
  }

  /** Was this pointer event part of a selection gesture (Ctrl/Cmd held, or a finished long press)? Then it must not also pick a target. */
  private isSelectGesture(p: Phaser.Input.Pointer): boolean {
    return isSelectModifier(p.event as MouseEvent | undefined) || this.longPressFired;
  }

  private applySelectionFrames(): void {
    for (const v of this.views.values()) v.setSelected(this.unitSel.has(v.combatant.uid));
    window.dispatchEvent(new Event(UNIT_SELECT_EVENT)); // an open Debug > Unit tab redraws its selection list
  }

  /** Toggle the selection of a unit (Ctrl+click); the newest selection is also the Debug > Unit target. */
  toggleUnitSelect(uid: string): void {
    if (!this.battle.get(uid)) return;
    if (this.unitSel.toggle(uid)) this.debugUnitUid = uid;
    this.applySelectionFrames();
  }

  /** Clear the selection (Esc, click on empty ground). Returns whether anything was selected. */
  clearUnitSelection(): boolean {
    const had = this.unitSel.clear();
    if (had) this.applySelectionFrames();
    return had;
  }

  get selectedUids(): string[] {
    return this.unitSel.uids;
  }

  /** The units Debug > Unit tools act on: every selected unit, or the single picked one. */
  debugTargets(): Combatant[] {
    const picked = this.unitSel.uids.map((uid) => this.battle.get(uid)).filter((c): c is Combatant => !!c);
    if (picked.length > 0) return picked;
    const one = this.debugUnit;
    return one ? [one] : [];
  }

  /** The unit whose command panel is shown. */
  get activeActor(): Combatant | undefined {
    if (this.battle.mode === 'turns') return this.uiActor ? this.battle.get(this.uiActor) : undefined;
    const chosen = this.controlled ? this.battle.get(this.controlled) : undefined;
    if (chosen && chosen.hp > 0) return chosen;
    return this.battle.living('party')[0];
  }

  /** May the human give a command right now? */
  get playerCanAct(): boolean {
    if (this.busy || this.battle.winner) return false;
    if (this.battle.mode === 'test') return true;
    const actor = this.battle.currentActor;
    return !!actor && actor.side === this.localSide && !this.autoPlay && actor.uid === this.uiActor && (!this.mp || this.mp.canAct());
  }

  /** The currently selected skill (for the debug panel and tests). */
  get selectedSkill(): string | null {
    return this.selected?.skill ?? null;
  }

  setSlotsVisible(visible: boolean): void {
    this.showSlots = visible;
    this.slotLayer?.setVisible(visible);
  }

  /** Debug: toggle AI control of the player's party (turns mode). */
  toggleAutoPlay(): void {
    if (this.mp) return; // multiplayer: YZ yok
    this.autoPlay = !this.autoPlay;
    this.refreshCommands();
    this.settle();
  }

  /** Debug: skip the current unit's turn (turns mode). */
  skipCurrentTurn(): void {
    if (this.mp || this.battle.mode !== 'turns' || this.busy || this.battle.winner) return;
    this.clearSelection();
    this.busy = true;
    this.refreshCommands();
    if (this.battle.skipTurn().ok) this.settle();
    else this.busy = false;
  }

  /** test mode: pick the unit to control. */
  selectActor(uid: string): void {
    const c = this.battle.get(uid);
    if (this.battle.mode !== 'test' || !c || c.hp <= 0 || this.busy) return;
    this.clearSelection();
    this.controlled = uid;
    this.refreshCommands();
  }

  /** test mode: switch control to the next living unit (enemies included). */
  cycleActor(): void {
    const all = [...this.battle.living('party'), ...this.battle.living('enemy')];
    if (all.length === 0) return;
    const i = all.findIndex((c) => c.uid === this.activeActor?.uid);
    this.selectActor(all[(i + 1) % all.length]!.uid);
  }

  // --- Debug araçları (debug menüsü): birim araçları, skill galerisi, hız ---

  /** Skill galerisinde oynatan birimin uid'si (yoksa seçili/aktif birim). */
  galleryCaster: string | null = null;
  /** Galeri hedef hücresi (yuva); null = ilk düşman / otomatik. */
  galleryCell: number | null = null;
  /** Birim araçlarının uygulandığı birim (yoksa aktif birim). */
  debugUnitUid: string | null = null;

  /** Debug: animasyon hızı / atlama / duraklatma (tween ve zamanlayıcılar). */
  applyDebugTiming(): void {
    const scale = effectiveTimeScale(debugState);
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
  }

  /** Debug: savaştaki tüm birimler (önce oyuncu tarafı). */
  debugUnits(): Combatant[] {
    return [...this.battle.combatants.filter((c) => c.side === 'party'), ...this.battle.combatants.filter((c) => c.side === 'enemy')];
  }

  /** Debug: birim araçlarının hedef birimi. */
  get debugUnit(): Combatant | undefined {
    const sel = this.unitSel.last ? this.battle.get(this.unitSel.last) : undefined;
    const chosen = sel ?? (this.debugUnitUid ? this.battle.get(this.debugUnitUid) : undefined);
    return chosen ?? this.activeActor ?? this.battle.living('party')[0];
  }

  /** Debug: galeride oynatan birim. */
  get galleryActor(): Combatant | undefined {
    const chosen = this.galleryCaster ? this.battle.get(this.galleryCaster) : undefined;
    if (chosen && chosen.hp > 0) return chosen;
    const a = this.activeActor;
    return a && a.hp > 0 ? a : this.battle.living('party')[0];
  }

  /** Debug: birim değişikliğinden sonra ekranı ve (turns modunda) sırayı toparlar. */
  debugAfterChange(): void {
    const b = this.battle;
    if (b.winner) return;
    const cur = b.currentActor;
    if (b.mode === 'turns' && cur && cur.hp <= 0) {
      // The unit whose turn it was is gone: move on
      this.clearSelection();
      this.busy = true;
      b.skipTurn();
      this.settle();
      return;
    }
    this.eventQueue = this.eventQueue.then(() => {
      if (b === this.battle && this.scene.isActive()) this.refreshCommands();
    });
  }

  /** Debug: bir skill'i (animasyon + ses dahil) kuralları yok sayarak oynatır. Hata varsa kısa mesaj döner, yoksa ''. */
  debugCastSkill(skillId: string): string {
    const b = this.battle;
    const skill = content.skills[skillId];
    const caster = this.galleryActor;
    if (!skill || !caster) return 'No caster';
    if (b.winner) return 'Battle is over';
    const ally = skill.target === 'self' || skill.target === 'single_ally' || skill.target === 'all_allies' || skill.target === 'dead_ally';
    const targetBoard = ally ? caster.side : caster.side === 'party' ? 'enemy' : 'party';
    if (skill.target === 'dead_ally') {
      // Needs a fallen ally: make one if there is none
      if (b.validTargets(caster.uid, skillId).length === 0) {
        const victim = b.living(caster.side).find((c) => c.uid !== caster.uid && !c.summoned);
        if (!victim) return 'No ally to revive';
        b.debugKill(victim.uid, false);
      }
    } else if (!ally && b.living(targetBoard).length === 0) b.debugReviveAll();
    const at = this.galleryCell !== null ? b.combatants.find((c) => c.board === targetBoard && c.slot === this.galleryCell && c.hp > 0) : undefined;
    const target = at ?? (skill.target === 'self' ? caster : b.livingByDepth(targetBoard)[0]);
    let slot: number | undefined;
    if (this.galleryCell !== null && (b.isAreaSkill(skillId) || b.needsSlotChoice(skillId))) slot = this.galleryCell;
    if (b.needsSlotChoice(skillId) && slot !== undefined && !b.freeSlots(b.summonBoard(caster.uid, skillId)).includes(slot)) slot = undefined;
    const aimUid = b.isAreaSkill(skillId) && !at && slot !== undefined ? undefined : target?.uid; // empty chosen cell: aim at the cell itself
    const result = b.debugCast(caster.uid, skillId, aimUid, slot);
    if (!result.ok) return result.reason;
    if (debugState.galleryReset) {
      this.eventQueue = this.eventQueue.then(() => this.wait(700)).then(() => {
        if (b === this.battle && !b.winner) b.debugResetAll();
      });
    }
    return '';
  }

  /** True while the battle is undecided (no winner yet); the settings menu asks for confirmation only then. */
  isBattleLive(): boolean {
    return !!this.battle && !this.battle.winner && !this.mp?.result();
  }

  /** New Game: fresh random seed and random teams of the same sizes, skips team select (result screen and settings menu share this). */
  newGame(): void {
    if (this.mp) return;
    this.scene.restart({ seed: newSeed(), teams: undefined, partySize: this.partySize, enemySize: this.enemySize });
  }

  /** Back to the team selection screen. */
  goToTeamSelect(): void {
    if (this.mp) return;
    // Cell lists (index = slot, '' = empty) so the formation survives the round trip
    const ids = (side: 'party' | 'enemy') => {
      const cells: string[] = Array.from({ length: content.CELL_COUNT }, () => '');
      for (const c of this.battle.combatants) if (c.side === side && !c.summoned && c.slot < cells.length) cells[c.slot] = c.defId;
      return cells;
    };
    this.scene.start('TeamSelectScene', { teams: { party: ids('party'), enemies: ids('enemy') }, sizes: { party: this.partySize, enemies: this.enemySize } });
  }

  // --- Skill selection: the first usable skill comes pre-selected; the player confirms with a tap ---

  /** Makes sure the acting player unit has a valid selected skill (the first usable one by default). */
  private ensureSelection(): void {
    const actor = this.activeActor;
    if (this.moveMode) {
      // Move Tile seçimi açıkken skill ön seçimi yapılmaz; geçersizleştiyse (sıra değişti, hamle bitti) kapanır
      if (actor && actor.uid === this.moveMode.actor && this.playerCanAct && this.battle.canUseGlobal(actor.uid, 'move_tile').ok) return;
      this.cancelMoveQuiet();
    }
    if (!actor || !this.playerCanAct) {
      if (this.selected) this.clearSelection();
      return;
    }
    if (this.selected && this.selected.actor === actor.uid && this.battle.canUse(actor.uid, this.selected.skill).ok) return;
    if (!this.selected && this.suppressAutoSelect === actor.uid) return; // Raise Dead was cancelled with Esc: nothing re-selects until the player picks a skill
    // Test modunda her karakter son kullandığı/seçtiği skill'de kalır (her seferinde ilk skill'e dönmez)
    const remembered = this.battle.mode === 'test' ? this.lastSkill.get(actor.uid) : undefined;
    const first = remembered && this.battle.canUse(actor.uid, remembered).ok ? remembered : actor.skills.find((id) => this.battle.canUse(actor.uid, id).ok);
    if (first) this.applySelection(actor.uid, first);
    else this.clearSelection();
  }

  private applySelection(actor: string, skill: string): void {
    this.suppressAutoSelect = null;
    this.selected = { actor, skill };
    for (const v of this.views.values()) v.clearPreview();
    this.clearSlotMarkers();
    this.clearAreaMarker();
    this.refreshGlows();
    if (this.battle.needsSlotChoice(skill) || this.battle.isReviveSkill(skill)) this.showSlotMarkers(actor, skill); // Raise Dead / Resurrection: two-step flow
    else if (this.battle.needsTargetChoice(skill)) this.showTargetCells(actor, skill);
    // Skills without a target choice (all enemies, self, ...) show their effect on everyone affected right away
    else {
      this.showPreviews(previewSkill(this.battle, actor, skill));
      const sk = this.battle.skill(skill);
      if (sk?.target === 'all_enemies' && sk.motion === 'melee') this.showFrontRowBand(actor, skill);
      else this.showAffectedPlates(actor, skill);
    }
    this.refreshConsumeHint();
    this.updateHint();
  }

  /** Does the skill hurt what it touches (damage, mana burn, a debuff on others)? Decides red vs green. */
  private isHarmful(skill: SkillDef): boolean {
    return skill.effects.some((e) => e.type === 'damage' || e.type === 'manaBurn' || (e.type === 'status' && !e.self && content.statuses[e.status]?.type === 'debuff'));
  }

  /**
   * One common look for everything a skill can touch: a glow around each unit's drawing, green for helpful effects and red for
   * harmful ones. Units the effect will hit (hovered target, covered area, or everyone for no-choice skills) glow strongly;
   * units that can merely be chosen glow softly.
   */
  private refreshGlows(hit: string[] = []): void {
    const sel = this.selected;
    const skill = sel ? this.battle.skill(sel.skill) : undefined;
    if (!sel || !skill || !this.playerCanAct) {
      for (const v of this.views.values()) v.setGlow(null);
      return;
    }
    const kind = this.isHarmful(skill) ? 'bad' : 'good';
    const valid = new Set(this.battle.validTargets(sel.actor, sel.skill).map((c) => c.uid));
    const choice = this.battle.needsTargetChoice(sel.skill);
    const area = this.battle.isAreaSkill(sel.skill);
    const slotSkill = this.battle.needsSlotChoice(sel.skill);
    const actorSide = this.battle.get(sel.actor)?.side;
    for (const v of this.views.values()) {
      const uid = v.combatant.uid;
      if (skill.target === 'everyone') {
        // allies glow green, enemies red (e.g. Radiance heals one side and hurts the other)
        if (valid.has(uid)) v.setGlow(v.combatant.side === actorSide ? 'good' : 'bad', true);
        else v.setGlow(null);
        continue;
      }
      if (hit.includes(uid)) v.setGlow(skill.target === 'area_any' ? (v.combatant.side === actorSide ? 'good' : 'bad') : kind, true); // either-side areas: allies green, foes red
      else if (slotSkill || area) v.setGlow(null);
      else if (skill.target === 'random_enemies' && valid.has(uid)) v.setGlow(kind, false); // targets are random: only a hint
      else if (!choice && valid.has(uid)) v.setGlow(kind, true);
      else if (choice && valid.has(uid)) v.setGlow(kind, false);
      else v.setGlow(null);
    }
  }

  // --- ONE common cell-selection look (CellTile, shape-draw.ts): every slot / target choice and hover uses the same floor plates ---
  // selectable (faint) under everything that can be picked, hover / ally / enemy for the hovered target, affected + anchor for area
  // cells, invalid for what cannot be used, move for walkable cells. No rings, plus signs, boots or diamonds.

  /** Screen position (feet) of a formation cell on a side. */
  private cellPos(side: 'party' | 'enemy', slot: number): { x: number; y: number } {
    const slots = side === 'party' ? layout.partySlots : layout.enemySlots;
    return slots[slot] ?? { x: 0, y: 0 };
  }

  private targetSide(actorUid: string): 'party' | 'enemy' {
    return this.battle.get(actorUid)?.side === 'party' ? 'enemy' : 'party';
  }

  private slotsOf(side: 'party' | 'enemy'): Pt[] {
    return side === 'party' ? layout.partySlots : layout.enemySlots;
  }

  /** Plate tone of a skill's single target: red-orange for harmful effects, green-teal for helpful ones. */
  private toneOf(skill: SkillDef | undefined): CellTone {
    return skill && this.isHarmful(skill) ? 'enemy' : 'ally';
  }

  /** The always-on layer under a choice: faint plates (and quiet 'affected' plates for no-choice skills). Lives until the selection changes. */
  private showBasePlates(groups: Array<{ board: 'party' | 'enemy'; specs: CellTileSpec[] }>): void {
    const items: Phaser.GameObjects.GameObject[] = [];
    for (const { board, specs } of groups) {
      if (specs.length === 0) continue;
      const g = this.add.graphics();
      items.push(g, ...drawCellTiles(this, g, this.slotsOf(board), content.GRID.lanes, specs));
    }
    this.slotMarkers = this.add.container(0, 0, items).setDepth(40);
  }

  /** The hover layer: the hovered cell(s) as plates (pulses softly); an optional reason plaque floats above a cell. */
  private showPlates(board: 'party' | 'enemy', specs: CellTileSpec[], reason?: { slot: number; text: string }): void {
    this.clearAreaMarker();
    if (specs.length === 0) return;
    const slots = this.slotsOf(board);
    const g = this.add.graphics();
    const labels = drawCellTiles(this, g, slots, content.GRID.lanes, specs);
    this.areaMarker = this.add.container(0, 0, [g, ...labels]).setDepth(60);
    if (reason) {
      const c = cellCenter(slots, reason.slot);
      this.areaTop = this.add.container(0, 0, [this.shapeLabel(c.x, c.y - 130, reason.text, 0xf2a0a0)]).setDepth(3550);
    }
    this.tweens.add({ targets: this.areaMarker, alpha: 0.82, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /**
   * One pointer zone per target board resolves the cell under the pointer (floor plate first, then the unit's body), so empty cells, dead allies
   * and unreachable units all behave the same. Mouse: hover previews, click picks. Touch: `twoTap` (area skills) = first tap previews, second tap
   * on the same cell picks; otherwise a tap picks at once.
   */
  private bindCellZones(boards: Array<'party' | 'enemy'>, h: { twoTap: boolean; canPick: (board: 'party' | 'enemy', slot: number) => boolean; onHover: (board: 'party' | 'enemy', slot: number | null) => void; onPick: (board: 'party' | 'enemy', slot: number) => void }): void {
    const lanes = content.GRID.lanes;
    const body = { w: layout.spriteBox.width, h: layout.spriteBox.height };
    let downWasHover = false;
    const setHover = (board: 'party' | 'enemy', slot: number | null): void => {
      if (slot === null) {
        if (this.cellHover) {
          this.cellHover = null;
          h.onHover(board, null);
        }
        this.input.setDefaultCursor('default');
        return;
      }
      if (this.cellHover && this.cellHover.board === board && this.cellHover.slot === slot) return;
      this.cellHover = { board, slot };
      h.onHover(board, slot);
      this.input.setDefaultCursor(h.canPick(board, slot) ? 'pointer' : 'default');
    };
    for (const board of boards) {
      const slots = this.slotsOf(board);
      const bodyMax = this.boardBody(board, body);
      const b = boardBounds(slots, bodyMax);
      const y1 = Math.min(b.y1, layout.commandPanel.y - 2);
      const zone = this.add.zone(b.x0, b.y0, b.x1 - b.x0, y1 - b.y0).setOrigin(0, 0).setDepth(3600).setInteractive();
      // The unit's DRAWING picks its cell first (head, body, weapon), then the floor plate; the sprite list is rebuilt per event (<= 24 units)
      const at = (p: Phaser.Input.Pointer) => pickCellAt(slots, lanes, p.x, p.y, this.pickSprites(board), body);
      zone.on('pointermove', (p: Phaser.Input.Pointer) => setHover(board, at(p)));
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (isSelectModifier(p.event as MouseEvent | undefined)) return; // Ctrl/Cmd+click selects a unit (bindUnitSelect), it never picks
        const cell = at(p);
        downWasHover = cell !== null && this.cellHover?.board === board && this.cellHover.slot === cell;
        setHover(board, cell);
      });
      zone.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.isSelectGesture(p)) return;
        const cell = at(p);
        if (cell === null) return;
        if (p.wasTouch && h.twoTap && !downWasHover) return; // touch: the first tap only previews
        if (!h.canPick(board, cell)) return;
        h.onPick(board, cell);
      });
      zone.on('pointerout', (p: Phaser.Input.Pointer) => {
        if (!p.wasTouch) setHover(board, null); // touch keeps its preview after the finger lifts
      });
      this.cellZones.push(zone);
    }
  }

  /** Visible living units of a board as pick rectangles (feet + fitted drawing size, alpha-aware); fallen/hidden units have no sprite to hit. */
  private pickSprites(board: 'party' | 'enemy'): PickSprite[] {
    const out: PickSprite[] = [];
    for (const v of this.views.values()) {
      const c = v.combatant;
      if (c.board !== board || c.hp <= 0 || !v.container.visible || v.container.alpha < 0.3) continue;
      const rect = { x: v.container.x, y: v.container.y, w: v.w, h: v.h };
      const sp = v.sprite;
      const key = sp.texture.key;
      const frame = sp.frame.name;
      const alphaAt = (u: number, w: number): number | null => {
        try {
          return this.textures.getPixelAlpha(u, w, key, frame);
        } catch {
          return null;
        }
      };
      out.push({ slot: c.slot, ...rect, opaque: alphaOpaque(rect, sp.frame.width, sp.frame.height, sp.flipX, alphaAt) });
    }
    return out;
  }

  /** Largest drawing box on a board (a scaled-up unit is taller than the layout's spriteBox): sizes the interaction zone. */
  private boardBody(board: 'party' | 'enemy', base: { w: number; h: number }): { w: number; h: number } {
    let w = base.w;
    let h = base.h;
    for (const v of this.views.values()) {
      if (v.combatant.board !== board) continue;
      w = Math.max(w, v.w);
      h = Math.max(h, v.h);
    }
    return { w, h };
  }

  /**
   * Unit tooltip for the living unit standing on a hovered cell. A revivable corpse shows 'Fallen: <name> (can be revived)'; while a revive skill is
   * being aimed (`reviveBy` = the caster) even a consumed corpse's cell explains why it cannot be picked. Empty cells show none.
   */
  private hoverUnitTip(board: 'party' | 'enemy', slot: number | null, reviveBy?: string): void {
    const c = slot === null ? undefined : this.battle.combatants.find((u) => u.board === board && u.slot === slot && u.hp > 0);
    const view = c ? this.views.get(c.uid) : undefined;
    if (view) {
      this.hoverView = view;
      this.showUnitTip(view);
    } else {
      this.hoverView = undefined;
      this.hideUnitTip();
      const corpse = slot === null ? undefined : this.corpseAt(board, slot, !!reviveBy);
      if (corpse) this.showCorpseTip(corpse, reviveBy);
    }
  }

  // --- Corpse marks (madde 222): a revivable corpse = small ankh + skull on its cell; consumed = nothing; summons leave none ---

  /** The corpse (uid) lying on a cell, as far as the screen knows (consumed ones only when asked: while aiming a revive skill). */
  private corpseAt(board: 'party' | 'enemy', slot: number, includeConsumed: boolean): string | undefined {
    let found: string | undefined;
    for (const [uid, state] of this.uiCorpses) {
      const c = this.battle.get(uid);
      if (!c || c.board !== board || c.slot !== slot) continue;
      if (state === 'revivable' || includeConsumed) found = uid;
    }
    return found;
  }

  /** Corpse tooltip in the info plaque (see corpse-marks.ts > corpseTip). */
  private showCorpseTip(uid: string, reviveBy?: string): void {
    const c = this.battle.get(uid);
    if (!c) return;
    const tip = corpseTip(unitName(c), this.uiCorpses.get(uid) ?? 'revivable', !!reviveBy, reviveBy ? this.battle.reviveBlockReason(reviveBy, uid) : null);
    const hex = { good: colors.heal, bad: colors.lethal, muted: colors.muted };
    this.hideInfoTip();
    this.unitTipKey = `corpse:${uid}`;
    this.placeInfoTip(this.makeInfo(tip.title, colors.text, ensureIcon(this, 'ankh', '#c9a853', true), tip.rows.map((r): [string, string] => [r.text, hex[r.tone]]), 'Corpse'));
  }

  /** Brings the on-screen corpse marks in line with the corpse states the screen knows (events update them in play order). */
  private refreshCorpseMarks(fadeIn = true): void {
    const refs = [...this.uiCorpses].flatMap(([uid, state]) => {
      const c = this.battle.get(uid);
      return c ? [{ uid, slot: c.slot, side: c.side, state }] : [];
    });
    const want = new Map(visibleCorpseMarks(refs, this.uiOccupied).map((c) => [c.uid, c]));
    for (const [uid, marker] of this.corpseMarkers) {
      if (want.has(uid)) continue;
      marker.remove();
      this.corpseMarkers.delete(uid);
      this.flowMarks.delete(uid);
    }
    for (const [uid, c] of want) {
      if (this.corpseMarkers.has(uid)) continue;
      this.corpseMarkers.set(
        uid,
        createCorpseMarker(this, corpseMarkPos(this.slotsOf(c.side), c.slot), {
          fadeIn,
          onOver: () => this.showCorpseTip(uid),
          onOut: () => this.hideUnitTip(),
        }),
      );
    }
    this.refreshConsumeHint();
  }

  /** At battle start / load: dead units are already gone from the field and their corpse marks stand on the right cells. */
  private syncCorpsesNow(): void {
    for (const side of ['party', 'enemy'] as const) for (const c of this.battle.corpses(side)) this.uiCorpses.set(c.uid, c.state);
    for (const c of this.battle.combatants) {
      if (c.hp <= 0) this.views.get(c.uid)?.markFallen();
      else if (c.summoned) this.uiOccupied.add(cellKey(c.board, c.slot));
    }
    this.refreshCorpseMarks(false);
  }

  // --- Raise Dead (madde 230): TWO-STEP choice. Step 1: which foe corpse to consume; step 2: where the summon rises. No corpse = step 2 only. ---
  // The state machine is pure (raise-dead-flow.ts); this part only draws it. Mouse and touch: one click / tap per step (no two-tap confirm: a step
  // can be undone with Esc, the 'Back' chip, or by clicking the chosen corpse again, and nothing is spent before the cell is picked).

  private raiseFlow: RaiseFlow | null = null;
  private raiseCtx?: { actor: string; skill: string };
  private flowStrip?: Phaser.GameObjects.Container;
  private flowMarks = new Map<string, 'hint' | 'selected'>();
  private suppressAutoSelect: string | null = null;

  private raiseInputs(actor: string, skill: string): RaiseInputs {
    // Resurrection (madde 257): step 1 = a fallen ALLY (its cell may be taken), step 2 = an empty cell of your side
    if (this.battle.isReviveSkill(skill)) {
      return { choices: this.battle.validTargets(actor, skill).map((c) => ({ uid: c.uid, slot: c.slot, name: unitName(c), danger: 0, why: '' })), slots: this.battle.reviveSlots(actor, skill) };
    }
    return { choices: this.battle.corpseChoices(actor, skill), slots: this.battle.summonSlots(actor, skill) };
  }

  /** Corpse marks: step 1 = every pickable corpse pulses softly; step 2 = the chosen corpse is big and pulses, the rest rest. */
  private refreshConsumeHint(): void {
    const want = new Map<string, 'hint' | 'selected'>();
    const ctx = this.raiseCtx;
    const flow = this.raiseFlow;
    if (ctx && flow?.twoStep && this.selected && this.playerCanAct) {
      for (const c of this.raiseInputs(ctx.actor, ctx.skill).choices) {
        if (flow.step === 'corpse') want.set(c.uid, 'hint');
        else if (c.uid === flow.corpseUid) want.set(c.uid, 'selected');
      }
    }
    for (const [uid, mode] of [...this.flowMarks]) {
      if (want.get(uid) === mode) continue;
      this.corpseMarkers.get(uid)?.setConsumeHint(false);
      this.flowMarks.delete(uid);
    }
    for (const [uid, mode] of want) {
      if (this.flowMarks.get(uid) === mode) continue;
      const marker = this.corpseMarkers.get(uid);
      if (!marker) continue;
      if (mode === 'selected') marker.setSelected(true);
      else marker.setConsumeHint(true);
      this.flowMarks.set(uid, mode);
    }
  }

  /** Summon skills: starts the choice (corpse step first when there is a corpse, otherwise the cell step directly). */
  private showSlotMarkers(actorUid: string, skillId: string): void {
    this.raiseCtx = { actor: actorUid, skill: skillId };
    this.raiseFlow = startRaiseFlow(this.raiseInputs(actorUid, skillId));
    if (!this.raiseFlow) return; // no free slot: the button is pale (canUse says 'No free slot') and nothing opens
    this.renderRaiseFlow();
  }

  /** Esc / 'Back': a chosen corpse goes back to step 1; otherwise the skill choice is cancelled (nothing re-selects by itself). */
  private raiseBack(): void {
    const flow = this.raiseFlow;
    const ctx = this.raiseCtx;
    if (!flow || !ctx) return;
    const res = backRaiseFlow(flow);
    if (res.kind === 'state') {
      this.raiseFlow = res.flow;
      this.renderRaiseFlow();
      return;
    }
    const actor = ctx.actor;
    this.hideInfoTip();
    this.hideUnitTip();
    this.clearSelection();
    this.suppressAutoSelect = actor;
    this.refreshCommands();
  }

  /** Draws the current step: plates, pointer zones, marks and the hint strip. */
  private renderRaiseFlow(): void {
    const ctx = this.raiseCtx;
    const actor = ctx ? this.battle.get(ctx.actor) : undefined;
    if (!ctx || !actor || !this.raiseFlow) return;
    const inp = this.raiseInputs(ctx.actor, ctx.skill);
    const flow = reconcileRaiseFlow(this.raiseFlow, inp);
    if (!flow) {
      this.clearSelection();
      return;
    }
    this.raiseFlow = flow;
    this.clearSlotMarkers();
    this.clearAreaMarker();
    this.hideInfoTip();
    if (this.battle.isReviveSkill(ctx.skill)) {
      this.renderReviveFlow(ctx, flow, inp);
      return;
    }
    const own = this.battle.summonBoard(ctx.actor, ctx.skill);
    const foe: 'party' | 'enemy' = own === 'party' ? 'enemy' : 'party';
    const ownTone: CellTone = 'ally';
    const skill = content.skills[ctx.skill];
    // Madde 257: a fallen ally's cell is no longer reserved for summons (they may rise on the corpse), so this list is normally empty
    const reserved = this.battle.fallenSlots(own).filter((s) => this.battle.freeSlots(own).includes(s) && !inp.slots.includes(s));
    const chosen = flow.corpseUid ? inp.choices.find((c) => c.uid === flow.corpseUid) : undefined;
    const consumed = new Set([...this.uiCorpses].filter(([, st]) => st === 'consumed').map(([uid]) => uid));
    const info = (title: string, rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }>, icon: string, badge: string): void => {
      const hex = { info: colors.selected, good: '#c58bff', muted: colors.muted, bad: colors.lethal };
      this.hideInfoTip();
      this.placeInfoTip(this.makeInfo(title, colors.text, icon === 'skill' && skill ? ensureSkillIcon(this, skill) : ensureIcon(this, 'ankh', '#c9a853', true), rows.map((r): [string, string] => [r.text, hex[r.tone]]), badge));
    };
    const previewOf = (corpseUid?: string, slot?: number) => this.battle.summonPreview(ctx.actor, ctx.skill, corpseUid, slot);
    const unitName = previewOf().unit?.name ?? 'Skeleton';
    const badge = raiseFlowHint(flow, unitName).step || 'Raise';

    if (flow.step === 'corpse') {
      // STEP 1: the pickable corpses of the foe board are enemy-tone plates; consumed corpses are pale
      const consumedHere = [...consumed].flatMap((uid) => {
        const c = this.battle.get(uid);
        return c && c.board === foe ? [c.slot] : [];
      });
      this.showBasePlates([
        {
          board: foe,
          specs: [
            ...inp.choices.map((c) => ({ slot: c.slot, state: 'selectable' as const, tone: 'enemy' as const })),
            ...consumedHere.filter((s) => !inp.choices.some((c) => c.slot === s)).map((slot) => ({ slot, state: 'invalid' as const })),
          ],
        },
      ]);
      this.bindCellZones([foe], {
        twoTap: false,
        canPick: (_b, slot) => inp.choices.some((c) => c.slot === slot),
        onHover: (b, slot) => {
          const c = slot === null ? undefined : inp.choices.find((x) => x.slot === slot);
          if (c) {
            this.showPlates(b, [{ slot: c.slot, state: 'enemy' }]);
            const sp = previewOf(c.uid);
            const tip = corpseHoverTip(c, sp.unit ? { unitName: sp.unit.name, hp: sp.unit.stats.hp } : null);
            info(tip.title, tip.rows, 'corpse', badge);
          } else if (slot !== null && consumedHere.includes(slot)) {
            this.showPlates(b, [{ slot, state: 'invalid' }]);
            const gone = [...consumed].map((uid) => this.battle.get(uid)).find((u) => u && u.board === b && u.slot === slot);
            info(`Fallen: ${gone?.name ?? 'Unit'} (corpse consumed)`, [{ text: 'Corpse was consumed', tone: 'bad' }], 'corpse', badge);
          } else {
            this.clearAreaMarker();
            this.hideInfoTip();
          }
        },
        onPick: (_b, slot) => {
          const c = inp.choices.find((x) => x.slot === slot);
          if (!c) return;
          const res = pickCorpse(flow, inp, c.uid, consumed);
          if (res.kind === 'state') {
            this.raiseFlow = res.flow;
            this.renderRaiseFlow();
          }
        },
      });
    } else {
      // STEP 2: your free cells are ally-tone plates; the chosen corpse keeps a bright framed plate on the foe board (clicking it undoes the choice)
      const groups: Array<{ board: 'party' | 'enemy'; specs: CellTileSpec[] }> = [
        { board: own, specs: [...inp.slots.map((slot) => ({ slot, state: 'selectable' as const, tone: ownTone })), ...reserved.map((slot) => ({ slot, state: 'invalid' as const }))] },
      ];
      if (chosen) groups.push({ board: foe, specs: [{ slot: chosen.slot, state: 'anchor', tone: 'enemy' }, ...inp.choices.filter((c) => c.uid !== chosen.uid).map((c) => ({ slot: c.slot, state: 'selectable' as const, tone: 'enemy' as const }))] });
      this.showBasePlates(groups);
      this.bindCellZones(chosen ? [foe, own] : [own], {
        twoTap: false,
        canPick: (b, slot) => (b === own ? inp.slots.includes(slot) : inp.choices.some((c) => c.slot === slot)),
        onHover: (b, slot) => {
          if (slot === null) {
            this.clearAreaMarker();
            this.hideInfoTip();
            return;
          }
          if (b === own) {
            const free = inp.slots.includes(slot);
            const isReserved = reserved.includes(slot);
            if (!free && !isReserved) {
              this.clearAreaMarker();
              this.hideInfoTip();
              return;
            }
            const sp = previewOf(flow.corpseUid, slot);
            this.showPlates(b, [{ slot, state: free ? 'hover' : 'invalid', tone: ownTone }]);
            const tip = slotHoverTip({ unitName: sp.unit?.name ?? unitName, hp: sp.unit?.stats.hp ?? 0, empowered: sp.empowered, corpseName: chosen?.name ?? null, row: this.battle.rowOf(slot), reserved: isReserved && !free });
            info(tip.title, tip.rows, 'skill', badge);
            return;
          }
          const c = inp.choices.find((x) => x.slot === slot);
          this.clearAreaMarker();
          if (c) info(c.uid === chosen?.uid ? `Chosen: ${c.name}'s corpse` : `Consume ${c.name}'s corpse instead (danger ${c.danger})`, [{ text: c.uid === chosen?.uid ? 'Click to take it back and choose again' : 'Click to switch to this corpse', tone: 'info' }], 'corpse', badge);
          else this.hideInfoTip();
        },
        onPick: (b, slot) => {
          if (b === own) {
            const res = pickSlot(flow, inp, slot);
            if (res.kind === 'cast') this.perform(ctx.actor, ctx.skill, '', res.slot, undefined, res.corpseUid);
            return;
          }
          const c = inp.choices.find((x) => x.slot === slot);
          if (!c) return;
          const res = pickCorpse(flow, inp, c.uid, consumed);
          if (res.kind === 'state') {
            this.raiseFlow = res.flow;
            this.renderRaiseFlow();
          }
        },
      });
    }
    this.drawFlowStrip(flow, unitName);
    this.refreshConsumeHint();
  }

  /**
   * Resurrection (madde 257), same feel as Raise Dead: STEP 1 = your fallen allies are ally-tone plates (a cell taken by a summon is still pickable: the
   * ally will rise elsewhere); STEP 2 = your empty cells are ally-tone plates, the chosen ally's corpse keeps a bright framed plate. Esc / 'Back' undoes.
   */
  private renderReviveFlow(ctx: { actor: string; skill: string }, flow: RaiseFlow, inp: RaiseInputs): void {
    const own = this.battle.get(ctx.actor)!.side;
    const skill = content.skills[ctx.skill];
    const revive = skill?.effects.find((e) => e.type === 'revive');
    const chosen = flow.corpseUid ? inp.choices.find((c) => c.uid === flow.corpseUid) : undefined;
    const hint = reviveFlowHint(flow, chosen?.name);
    const info = (title: string, rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }>): void => {
      const hex = { info: colors.selected, good: colors.heal, muted: colors.muted, bad: colors.lethal };
      this.hideInfoTip();
      this.placeInfoTip(this.makeInfo(title, colors.text, skill ? ensureSkillIcon(this, skill) : ensureIcon(this, 'ankh', '#c9a853', true), rows.map((r): [string, string] => [r.text, hex[r.tone]]), hint.step || 'Revive'));
    };
    const standing = (slot: number) => this.battle.combatants.find((u) => u.hp > 0 && u.board === own && u.slot === slot);
    if (flow.step === 'corpse') {
      this.showBasePlates([{ board: own, specs: inp.choices.map((c) => ({ slot: c.slot, state: 'selectable' as const, tone: 'ally' as const })) }]);
      this.bindCellZones([own], {
        twoTap: false,
        canPick: (_b, slot) => inp.choices.some((c) => c.slot === slot),
        onHover: (b, slot) => {
          const c = slot === null ? undefined : inp.choices.find((x) => x.slot === slot);
          if (!c) {
            this.clearAreaMarker();
            this.hideInfoTip();
            return;
          }
          this.showPlates(b, [{ slot: c.slot, state: 'ally' }]);
          const u = this.battle.get(c.uid);
          const hp = u && revive?.type === 'revive' ? Math.max(1, Math.round(u.maxHp * revive.hpRatio)) : 0;
          const mp = u && revive?.type === 'revive' ? Math.round(u.maxMp * revive.mpRatio) : 0;
          const tip = reviveCorpseTip({ name: c.name, hp, mp, taken: standing(c.slot)?.name ?? null });
          info(tip.title, tip.rows);
        },
        onPick: (_b, slot) => {
          const c = inp.choices.find((x) => x.slot === slot);
          if (!c) return;
          const res = pickCorpse(flow, inp, c.uid);
          if (res.kind === 'state') {
            this.raiseFlow = res.flow;
            this.renderRaiseFlow();
          }
        },
      });
    } else {
      const corpseCell = chosen && !inp.slots.includes(chosen.slot) ? [{ slot: chosen.slot, state: 'anchor' as const, tone: 'ally' as const }] : [];
      this.showBasePlates([{ board: own, specs: [...inp.slots.map((slot) => ({ slot, state: (chosen?.slot === slot ? 'anchor' : 'selectable') as 'anchor' | 'selectable', tone: 'ally' as const })), ...corpseCell] }]);
      this.bindCellZones([own], {
        twoTap: false,
        canPick: (_b, slot) => inp.slots.includes(slot),
        onHover: (b, slot) => {
          if (slot === null || !inp.slots.includes(slot)) {
            this.clearAreaMarker();
            if (slot !== null && chosen && slot === chosen.slot) info(`Chosen: ${chosen.name}`, [{ text: `${standing(slot)?.name ?? 'Someone'} stands on the corpse: choose an empty cell`, tone: 'muted' }, { text: 'Esc / Back to choose another ally', tone: 'info' }]);
            else this.hideInfoTip();
            return;
          }
          this.showPlates(b, [{ slot, state: 'hover', tone: 'ally' }]);
          const tip = reviveSlotTip({ name: chosen?.name ?? 'The ally', row: this.battle.rowOf(slot), ownCell: chosen?.slot === slot });
          info(tip.title, tip.rows);
        },
        onPick: (_b, slot) => {
          const res = pickSlot(flow, inp, slot);
          if (res.kind === 'cast' && res.corpseUid) this.perform(ctx.actor, ctx.skill, res.corpseUid, res.slot);
        },
      });
    }
    this.drawFlowStrip(flow, '', hint);
    this.refreshConsumeHint();
  }

  /** The hint strip under the turn bar: 'Step 1/2  Choose a corpse to consume' (step 2 also has a 'Back' chip for touch). */
  private drawFlowStrip(flow: RaiseFlow, unitName: string, given?: { step: string; text: string }): void {
    this.flowStrip?.destroy(true);
    const hint = given ?? raiseFlowHint(flow, unitName);
    const items: Phaser.GameObjects.GameObject[] = [];
    const style = { fontFamily: SERIF, fontSize: '26px', fontStyle: 'bold', stroke: '#0c0805', strokeThickness: 3 };
    const stepTxt = hint.step ? this.add.text(0, 0, hint.step, { ...style, color: '#f2b84a' }).setOrigin(0, 0.5) : undefined;
    const msg = this.add.text(0, 0, hint.text, { ...style, color: '#f1e6cf' }).setOrigin(0, 0.5);
    const back = flow.twoStep && flow.step === 'slot' ? this.add.text(0, 0, 'Back (Esc)', { ...style, fontSize: '22px', color: '#c4fbe8' }).setOrigin(0, 0.5) : undefined;
    const gap = 18;
    const parts = [stepTxt, msg, back].filter((t): t is Phaser.GameObjects.Text => !!t);
    const total = parts.reduce((w, t) => w + t.width, 0) + gap * (parts.length - 1) + 40;
    const h = 48;
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0805, 0.92).fillRoundedRect(-total / 2, -h / 2, total, h, 10);
    bg.lineStyle(2, 0xf2b84a, 0.9).strokeRoundedRect(-total / 2, -h / 2, total, h, 10);
    items.push(bg);
    let x = -total / 2 + 20;
    for (const t of parts) {
      t.setX(x);
      x += t.width + gap;
      items.push(t);
    }
    if (back) {
      back.setInteractive({ useHandCursor: true });
      back.on('pointerdown', () => this.raiseBack());
    }
    this.flowStrip = this.add.container(W / 2, 205, items).setDepth(3700);
  }

  /**
   * Every choice skill (single enemy, single ally, resurrection, area, column, shapes) is aimed at CELLS: valid ones show as faint plates, the
   * hovered cell lights up (single target: ally / enemy tone; area: affected plates with the pointer cell as anchor). Click casts there.
   * Either-side areas (area_any, Smoke Bomb) are aimed on BOTH boards (enemy board red-orange, own board green-teal; one pointer zone per board).
   * Single-target skills whose back targets are pale (Backstab: no room behind) show those units as invalid plates with the engine's reason on hover.
   */
  private showTargetCells(actorUid: string, skillId: string): void {
    const skill = content.skills[skillId];
    const actor = this.battle.get(actorUid);
    if (!skill || !actor) return;
    const area = this.battle.isAreaSkill(skillId); // tüm alan skill'leri şekillidir (isAreaSkill = isShapeSkill)
    const tone = this.toneOf(skill);
    const valid = this.battle.validTargets(actorUid, skillId);
    const areaGroups = area ? areaBoards(this.battle, actorUid, skillId) : [];
    const boards: Array<'party' | 'enemy'> = area ? areaGroups.map((g) => g.board) : [...new Set(valid.map((c) => c.board))];
    if (boards.length === 0) boards.push(skill.target === 'single_enemy' ? this.targetSide(actorUid) : actor.side);
    // Backstab: units that cannot be picked show as pale invalid plates (the reason shows on hover); other single-target skills only on hover
    const blocked = skill.target === 'single_enemy' ? blockedTargets(this.battle, actorUid, skillId) : [];
    const pale = skill.requiresOpenBehind ? blocked : [];
    for (const b of pale) if (!boards.includes(b.board)) boards.push(b.board);
    this.showBasePlates(
      boards.map((board) => ({
        board,
        specs: [
          ...(area
            ? (areaGroups.find((g) => g.board === board)?.anchors ?? []).map((slot) => ({ slot, state: 'selectable' as const, tone: areaTone(this.battle, actorUid, skillId, board) }))
            : valid.filter((c) => c.board === board).map((c) => ({ slot: c.slot, state: 'selectable' as const, tone }))),
          ...pale.filter((b) => b.board === board).map((b) => ({ slot: b.slot, state: 'invalid' as const })),
        ],
      })),
    );
    const targetAt = (board: 'party' | 'enemy', slot: number) => valid.find((c) => c.board === board && c.slot === slot);
    this.bindCellZones(boards, {
      twoTap: area,
      canPick: (board, slot) => (area ? this.battle.shapePreviewCells(actorUid, skillId, slot, board).valid : !!targetAt(board, slot)),
      onHover: (board, slot) => this.onTargetHover(actorUid, skillId, board, slot, targetAt),
      onPick: (board, slot) => {
        if (area) this.perform(actorUid, skillId, '', slot, board);
        else {
          const t = targetAt(board, slot);
          if (t) this.perform(actorUid, skillId, t.uid);
        }
      },
    });
  }

  /** The pointer moved to another cell (or off the board): refresh the preview numbers, the hover plates and the unit tooltip. */
  private onTargetHover(actorUid: string, skillId: string, board: 'party' | 'enemy', slot: number | null, targetAt: (b: 'party' | 'enemy', s: number) => Combatant | undefined): void {
    const skill = content.skills[skillId];
    this.hoverUnitTip(board, slot, skill?.target === 'dead_ally' ? actorUid : undefined);
    if (slot === null) {
      this.endAreaPreview();
      return;
    }
    if (!skill) return;
    if (this.battle.isAreaSkill(skillId)) {
      const info = this.battle.shapePreviewCells(actorUid, skillId, slot, board);
      const ok = info.valid;
      const previews = ok ? previewSkill(this.battle, actorUid, skillId, undefined, slot, board) : [];
      this.showPreviews(previews);
      this.refreshGlows(previews.map((p) => p.uid));
      const staged = this.battle.areaStageCells(skillId, slot, board);
      const stages = staged.length > 1 ? stageMap(staged) : new Map<number, number>(); // numbers only for staged shapes
      const specs = areaHoverSpecs(info, slot, areaTone(this.battle, actorUid, skillId, board), stages);
      this.showPlates(board, specs, !ok && info.reason ? { slot, text: info.reason } : undefined);
      return;
    }
    const t = targetAt(board, slot);
    if (t) {
      const previews = previewSkill(this.battle, actorUid, skillId, t.uid);
      this.showPreviews(previews);
      this.refreshGlows(previews.map((p) => p.uid));
      this.showPlates(board, [{ slot, state: this.toneOf(skill) === 'enemy' ? 'enemy' : 'ally' }]);
      return;
    }
    // A unit stands there but the skill cannot reach it (melee to the back row, Backstab without room behind...): pale red plate + the engine's reason
    this.clearPreviewsOnly();
    this.refreshGlows();
    const here = this.battle.combatants.find((u) => u.board === board && u.slot === slot && u.hp > 0);
    if (here) {
      const reason = skill.target === 'single_enemy' && here.side !== this.battle.get(actorUid)?.side ? this.battle.targetProblem(actorUid, skillId, here.uid) : null;
      this.showPlates(board, [{ slot, state: 'invalid' }], reason ? { slot, text: reason } : undefined);
    } else if (skill.target === 'dead_ally' && this.corpseAt(board, slot, true)) this.showPlates(board, [{ slot, state: 'invalid' }]); // a consumed corpse: pale plate, the tooltip says why
    else this.clearAreaMarker();
  }

  private endAreaPreview(): void {
    this.clearPreviewsOnly();
    this.clearAreaMarker();
    this.refreshGlows();
  }

  /** Skills without a target choice: quiet 'affected' plates under everything they will touch (a hint, not a choice). */
  private showAffectedPlates(actorUid: string, skillId: string): void {
    const skill = content.skills[skillId];
    const actor = this.battle.get(actorUid);
    if (!skill || !actor) return;
    const hint = skill.target === 'random_enemies';
    const groups = new Map<'party' | 'enemy', CellTileSpec[]>();
    for (const c of this.battle.validTargets(actorUid, skillId)) {
      const tone: CellTone = skill.target === 'everyone' ? (c.side === actor.side ? 'ally' : 'enemy') : this.toneOf(skill);
      const list = groups.get(c.board) ?? [];
      list.push({ slot: c.slot, state: hint ? 'selectable' : 'affected', tone });
      groups.set(c.board, list);
    }
    this.showBasePlates([...groups.entries()].map(([board, specs]) => ({ board, specs })));
  }

  /**
   * Shape of the hit as it flashes while a shape skill plays (events carry the covered cells): the covered plates fade in softly as a telegraph,
   * then `hit()` (the moment the effect lands, the same moment the damage numbers start) flashes them once and fades them out.
   */
  private beginShapeFlash(board: 'party' | 'enemy', cells: number[]): { hit: () => void } | null {
    if (cells.length === 0) return null;
    const g = this.add.graphics();
    drawCellTiles(this, g, this.slotsOf(board), content.GRID.lanes, cells.map((slot) => ({ slot, state: 'hover' as const })));
    g.setDepth(62).setAlpha(0);
    const lead = this.tweens.add({ targets: g, alpha: 0.35, duration: slow(220), ease: 'Sine.easeOut' });
    let done = false;
    return {
      hit: () => {
        if (done) return;
        done = true;
        lead.stop();
        if (!g.active) return;
        g.setAlpha(0.9);
        this.tweens.add({ targets: g, alpha: 0, duration: slow(460), ease: 'Quad.easeOut', onComplete: () => g.destroy() });
      },
    };
  }

  /** A small dark plaque with a line of text (reason / hint) above the board. */
  private shapeLabel(x: number, y: number, text: string, hex: number): Phaser.GameObjects.Container {
    const t = this.add.text(0, 0, text, { fontFamily: layout.fontFamily, fontSize: '22px', fontStyle: 'bold', color: `#${hex.toString(16).padStart(6, '0')}`, stroke: '#0c0805', strokeThickness: 3 }).setOrigin(0.5);
    const w = t.width + 24;
    const h = t.height + 10;
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0805, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, hex, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const px = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
    return this.add.container(px, y, [bg, t]);
  }

  /** Whirlwind-like skills (melee, everyone in reach): the front row the skill will sweep is shown as affected plates. */
  private showFrontRowBand(actorUid: string, skillId: string): void {
    const skill = content.skills[skillId];
    if (!skill || skill.target !== 'all_enemies' || skill.motion !== 'melee') return;
    const first = this.battle.validTargets(actorUid, skillId)[0];
    if (!first) return;
    const row = this.battle.rowOf(first.slot);
    this.showBasePlates([{ board: this.targetSide(actorUid), specs: Array.from({ length: content.GRID.lanes }, (_, l) => ({ slot: row * content.GRID.lanes + l, state: 'affected' as const, tone: 'enemy' as const })) }]);
  }

  private clearAreaMarker(): void {
    if (this.areaMarker) this.tweens.killTweensOf(this.areaMarker);
    this.areaMarker?.destroy();
    this.areaMarker = undefined;
    this.areaTop?.destroy();
    this.areaTop = undefined;
  }

  private clearSlotMarkers(): void {
    if (this.cellZones.length > 0) {
      const hadHover = this.cellHover !== null;
      for (const z of this.cellZones) z.destroy();
      this.cellZones = [];
      this.cellHover = null;
      this.input.setDefaultCursor('default');
      if (hadHover) this.hideUnitTip();
      this.hoverView = undefined;
    }
    this.flowStrip?.destroy(true);
    this.flowStrip = undefined;
    if (!this.slotMarkers) return;
    this.slotMarkers.destroy(true);
    this.slotMarkers = undefined;
  }

  private clearSelection(): void {
    this.raiseFlow = null;
    this.raiseCtx = undefined;
    this.clearSlotMarkers();
    this.clearAreaMarker();
    this.selected = null;
    for (const v of this.views.values()) {
      v.setGlow(null);
      v.clearPreview();
    }
    this.refreshConsumeHint();
    this.updateHint();
  }

  /** The bottom hint text was removed on purpose (no explanatory text when a skill is selected). */
  private updateHint(): void {
    this.hint?.setVisible(false);
  }

  /** A skill button was pressed: select it; pressing the selected no-target skill again confirms it. */
  private onSkillClick(skillId: string): void {
    const actor = this.activeActor;
    if (!actor || !this.playerCanAct || !this.battle.canUse(actor.uid, skillId).ok) return;
    this.cancelMoveQuiet();
    if (this.selected?.skill === skillId && this.selected.actor === actor.uid && this.battle.needsSlotChoice(skillId)) return;
    if (this.selected?.skill === skillId && this.selected.actor === actor.uid && !this.battle.needsTargetChoice(skillId)) {
      const first = this.battle.validTargets(actor.uid, skillId)[0];
      if (first) this.perform(actor.uid, skillId, first.uid);
      return;
    }
    this.applySelection(actor.uid, skillId);
    if (this.battle.mode === 'test') this.lastSkill.set(actor.uid, skillId);
    this.refreshCommands();
  }

  /** Test modu: her karakterin son kullandığı/seçtiği skill (kullanınca seçim sıfırlanmasın). */
  private lastSkill = new Map<string, string>();

  private perform(actor: string, skill: string, target: string, slot?: number, board?: 'party' | 'enemy', corpseUid?: string): void {
    this.suppressAutoSelect = null;
    if (this.battle.mode === 'test') this.lastSkill.set(actor, skill);
    this.cancelMoveQuiet();
    this.clearSelection();
    this.hideInfoTip();
    this.hideUnitTip();
    if (this.mp) {
      // Multiplayer: hamle lockstep'ten geçer (sınanır, uygulanır, rakibe gider)
      if (!this.mp.submit({ skillId: skill, ...(target ? { targetUid: target } : {}), ...(slot !== undefined ? { slot } : {}), ...(board ? { board } : {}), ...(corpseUid ? { corpseUid } : {}) })) return;
    } else if (!this.battle.useSkill(actor, skill, target || undefined, slot, board, corpseUid).ok) return;
    this.busy = true;
    this.refreshCommands();
    this.settle();
  }

  // --- Global actions: Rest, Skip Turn, Move Tile (small buttons at the right end of the command panel) ---

  /** A global action button was pressed: Rest and Skip act at once; Move opens the empty-cell picker (press again or Esc cancels). */
  private onGlobalClick(id: string): void {
    const actor = this.activeActor;
    const def = this.battle.globalDef(id);
    if (!actor || !def || !this.playerCanAct || !this.battle.canUseGlobal(actor.uid, id).ok) return;
    if (def.kind === 'move') {
      if (this.moveMode) this.cancelMove();
      else this.startMove(actor);
      return;
    }
    this.performGlobal(actor.uid, id);
  }

  private performGlobal(actor: string, id: string, slot?: number): void {
    this.cancelMoveQuiet();
    this.clearSelection();
    this.hideInfoTip();
    this.hideUnitTip();
    const ok = this.mp ? this.mp.submit({ skillId: id, ...(slot !== undefined ? { slot } : {}) }) : this.battle.useGlobal(actor, id, slot).ok;
    if (!ok) {
      this.refreshCommands();
      return;
    }
    this.busy = true;
    this.refreshCommands();
    this.settle();
  }

  private startMove(actor: Combatant): void {
    this.clearSelection();
    this.moveMode = { actor: actor.uid };
    this.refreshCommands();
    this.showMoveMarkers(actor);
  }

  /** Leaves Move selection (no redraw): used right before something else takes over. */
  private cancelMoveQuiet(): void {
    if (!this.moveMode) return;
    this.moveMode = null;
    this.clearSlotMarkers();
    this.clearAreaMarker();
  }

  private cancelMove(): void {
    if (!this.moveMode) return;
    this.cancelMoveQuiet();
    this.hideInfoTip();
    this.refreshCommands();
  }

  /** Move Tile: every empty cell of the actor's side is a 'move' plate; a fallen ally's cell is a pale 'invalid' plate (moving there blocks the revive). */
  private showMoveMarkers(actor: Combatant): void {
    const free = this.battle.freeTiles(actor.uid);
    const fallen = this.battle.fallenSlots(actor.side).filter((slot) => !free.includes(slot));
    this.showBasePlates([{ board: actor.side, specs: [...free.map((slot) => ({ slot, state: 'move' as const })), ...fallen.map((slot) => ({ slot, state: 'invalid' as const }))] }]);
    this.bindCellZones([actor.side], {
      twoTap: false,
      canPick: (_b, slot) => free.includes(slot),
      onHover: (board, slot) => {
        if (slot !== null && free.includes(slot)) {
          this.showPlates(board, [{ slot, state: 'hover' }]);
          this.showMoveTip(actor, slot, false);
        } else if (slot !== null && fallen.includes(slot)) {
          this.showPlates(board, [{ slot, state: 'invalid' }]);
          this.showMoveTip(actor, slot, true);
        } else {
          this.clearAreaMarker();
          this.hideInfoTip();
        }
      },
      onPick: (_b, slot) => this.performGlobal(actor.uid, 'move_tile', slot),
    });
  }

  /** Tooltip over an empty cell while choosing where to move: its row and what it means for melee; warns about a fallen ally's cell. */
  private showMoveTip(actor: Combatant, slot: number, warn: boolean): void {
    this.hideInfoTip();
    const rows: Array<[string, string?]> = [[`Row ${this.battle.rowOf(slot) + 1}${this.battle.rowOf(slot) === 0 ? ' (front)' : ''}`]];
    const hasMelee = actor.skills.some((id) => content.skills[id]?.motion === 'melee' && content.skills[id]?.target !== 'self');
    if (hasMelee) rows.push(this.battle.canMeleeFrom(actor.uid, slot) ? ['Melee skills usable from here', colors.heal] : ['Too far back for melee skills', colors.targetHighlight]);
    if (warn) {
      const fallenUnit = this.battle.combatants.find((c) => c.side === actor.side && c.board === c.side && c.hp <= 0 && !c.summoned && c.slot === slot);
      rows.push([`${fallenUnit ? unitName(fallenUnit) : 'A fallen ally'} fell here: the cell is reserved for their resurrection`, colors.lethal]);
    }
    rows.push([warn ? 'You cannot move here' : 'Click to move here and end your turn', colors.muted]);
    this.placeInfoTip(this.makeInfo(warn ? 'Reserved cell' : 'Move here', warn ? colors.lethal : colors.selected, ensureIcon(this, warn ? 'skull' : 'boot', warn ? colors.lethal : colors.selected, true), rows, warn ? 'Reserved' : 'Empty cell'));
  }

  private showGlobalTip(actor: Combatant, id: string): void {
    const def = this.battle.globalDef(id);
    if (!def) return;
    this.hideInfoTip();
    const info = describeGlobalSkill(def, content.formulas);
    const detail = info.lines.filter((l) => !(def.kind === 'skip' && l.includes('speed meter')) && !(def.kind === 'move' && l.startsWith('Move to an empty')));
    const rows: Array<[string, string?]> = [[info.summary, colors.text], ...(def.kind === 'skip' ? [['Next turn arrives in half the time', colors.heal] as [string, string]] : []), ...detail.map((l): [string, string?] => [l, colors.muted])];
    const can = this.battle.canUseGlobal(actor.uid, id);
    const reason = !can.ok ? can.reason : !this.playerCanAct ? 'Not your turn' : '';
    if (reason) rows.push([reason, colors.lethal]);
    else if (def.kind === 'move') rows.push(['Click, then pick an empty cell (Esc cancels)', colors.targetHighlight]);
    this.placeInfoTip(this.makeInfo(info.name, colors.text, ensureIcon(this, def.icon, GLOBAL_ACCENT[def.kind === 'skip' ? 'skip' : def.kind] ?? '#e8c47e', true, SHARED_KEY), rows, info.targetBadge, [{ text: info.cost, hex: colors.muted }]));
  }

  /** The three small global buttons: a column at the right end of the command panel (they never touch the 4 skill buttons). */
  private globalButtons(actor: Combatant): Phaser.GameObjects.GameObject[] {
    const p = layout.commandPanel;
    const { w, h, gap } = GLOBAL_BTN;
    const x = this.globalX();
    const out: Phaser.GameObjects.GameObject[] = [];
    this.battle.globalSkillIds().forEach((id, i) => {
      const def = this.battle.globalDef(id)!;
      const can = this.battle.canUseGlobal(actor.uid, id);
      const enabled = this.playerCanAct && can.ok;
      const active = def.kind === 'move' && this.moveMode?.actor === actor.uid;
      const y = p.y + 12 + i * (h + gap);
      const frame = this.add.graphics();
      const paint = (pressed: boolean): void => {
        frame.clear();
        const hot = pressed || active;
        const [top, bottom] = hot ? [0x6e4f33, 0x2f2012] : [0x3b2b1d, 0x1a110b];
        const a = enabled ? 1 : 0.45;
        if (active) glowRect(frame, x, y, w, h, GOLD.bright, 0.9, 7);
        gradientRect(frame, x, y, w, h, top, bottom, a);
        frameRect(frame, x, y, w, h, { edge: active ? GOLD.bright : GOLD.edge, light: active ? 0xfff0c0 : GOLD.light, alpha: a, bevel: 3 });
      };
      paint(false);
      const accent = GLOBAL_ACCENT[def.kind === 'skip' ? 'skip' : def.kind] ?? '#e8c47e';
      const icon = this.add.image(x + w / 2, y + h / 2, ensureIcon(this, def.icon, accent, false, SHARED_KEY)).setDisplaySize(34, 34).setAlpha(enabled ? 1 : 0.35);
      const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: enabled });
      bg.on('pointerover', () => this.showGlobalTip(actor, id));
      bg.on('pointerout', () => {
        this.hideInfoTip();
        paint(false);
      });
      if (enabled) {
        bg.on('pointerdown', () => paint(true));
        bg.on('pointerup', () => {
          paint(false);
          this.onGlobalClick(id);
        });
      }
      out.push(frame, icon, bg);
    });
    this.globalItems = out;
    return out;
  }

  private setGlobalVisible(on: boolean): void {
    for (const o of this.globalItems) if (o.active) (o as Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }).setVisible(on);
  }

  /** Çok vuruşlu skill'in sıradaki vuruş animasyonu (VfxCtx.gate): ilgili hasar olayından hemen önce oynar. */
  private hitGate: { skip: number; run: () => Promise<void>; abort: () => void } | null = null;

  private abortHitGate(): void {
    const g = this.hitGate;
    this.hitGate = null;
    g?.abort();
  }

  private async passHitGate(): Promise<void> {
    const g = this.hitGate;
    if (!g) return;
    if (g.skip > 0) {
      g.skip--;
      return;
    }
    this.hitGate = null;
    await g.run();
  }

  /**
   * Aşamalı alan skill'i (area.stages) için aşama kapısı. Vfx `VfxCtx.releaseStage(i)` çağırınca kapı "sahiplenilir": artık `stage` numaralı
   * olaylar (hasar, dodge/miss, status, ground, ölüm...) kendi aşaması serbest bırakılana kadar bekler. Vfx hiç çağırmazsa (aşamadan habersiz
   * efekt) olaylar eskisi gibi hemen akar. Güvenlik: bekleme en çok `STAGE_WAIT_MS` (x skillSlowdown) sürer; sonraki skill / tur başı / olayların
   * bitişi kapıyı tamamen açar.
   */
  private stageGate: { claimed: boolean; released: number; waiters: Array<{ stage: number; go: () => void }>; onRelease: (i: number) => void } | null = null;
  private static readonly STAGE_WAIT_MS = 2600;

  private openStageGate(onRelease: (i: number) => void = () => undefined): (i: number) => void {
    this.closeStageGate();
    const gate = { claimed: false, released: -1, waiters: [] as Array<{ stage: number; go: () => void }>, onRelease };
    this.stageGate = gate;
    return (i: number) => {
      if (this.stageGate !== gate) return;
      gate.claimed = true;
      if (i <= gate.released) return;
      gate.released = i;
      gate.onRelease(i);
      const ready = gate.waiters.filter((w) => w.stage <= i);
      gate.waiters = gate.waiters.filter((w) => w.stage > i);
      for (const w of ready) w.go();
    };
  }

  /** Kapıyı tamamen açar (bekleyen tüm aşamalar akar) ve kaldırır. */
  private closeStageGate(): void {
    const g = this.stageGate;
    this.stageGate = null;
    if (!g) return;
    g.onRelease(Number.MAX_SAFE_INTEGER);
    for (const w of g.waiters) w.go();
    g.waiters = [];
  }

  /** `stage` numaralı bir olay oynamadan önce: aşaması serbest bırakılmadıysa (ve vfx kapıyı sahiplendiyse) bekler. */
  private async awaitStage(stage: number): Promise<void> {
    const g = this.stageGate;
    if (!g || !g.claimed || stage <= g.released) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        resolve();
      };
      g.waiters.push({ stage, go });
      this.time.delayedCall(slow(BattleScene.STAGE_WAIT_MS), go); // vfx aşamayı hiç açmazsa takılma
    });
  }

  private onCombatantTap(view: CombatantView): void {
    if (this.selected && this.playerCanAct) {
      const { actor, skill } = this.selected;
      // Resurrection (madde 257) is aimed with its two-step cell flow only (the cell is part of the choice)
      if (!this.battle.isReviveSkill(skill) && this.battle.validTargets(actor, skill).some((c) => c.uid === view.combatant.uid)) {
        this.perform(actor, skill, view.combatant.uid);
        return;
      }
    }
    if (this.battle.mode === 'test' && view.combatant.side === 'party') this.selectActor(view.combatant.uid);
  }

  // --- Hover: unit info, skill/stat info and effect previews ---

  private onUnitOver(view: CombatantView): void {
    // Target hover (previews, plates) is handled by the cell zones (bindCellZones); here only the unit tooltip
    this.hoverView = view;
    this.showUnitTip(view);
  }

  private onUnitOut(view: CombatantView): void {
    if (this.hoverView === view) this.hoverView = undefined;
    this.hideUnitTip();
  }

  private showPreviews(list: TargetPreview[]): void {
    this.clearPreviewsOnly();
    // Stat-changing statuses say what they do on the unit ('Blinded -30% hit 2 turns', 'Shrouded +20% dodge 2 turns')
    for (const p of list) this.views.get(p.uid)?.showPreview(p.statuses ? { ...p, statuses: p.statuses.map((t) => previewStatusText(t, content.statuses)) } : p);
  }

  private clearPreviewsOnly(): void {
    for (const v of this.views.values()) v.clearPreview();
  }

  /**
   * Hover info: it fills the free space at the right end of the bottom bar (always the same place, never next
   * to the mouse). First row: icon + title (+ cost / cooldown chips), the badge sits at the top right. Below it the
   * description rows: the font shrinks (and long content flows into a second column) until everything fits.
   */
  private makeInfo(title: string, titleColor: string, iconKey: string | undefined, rows: Array<[string, string?]>, badge?: string, meta: InfoMeta[] = [], shape?: MiniShape | null): Tip {
    const p = layout.commandPanel;
    const x = this.infoTipX();
    const width = W - 24 - x;
    const top = p.y + 12;
    const maxY = H - 12;
    const iconSize = 44;
    const items: Phaser.GameObjects.GameObject[] = [];
    // Recessed plaque behind the whole info area
    items.push(...makePanel(this, -12, -8, width + 24, maxY - top + 16, { top: 0x1a130d, bottom: 0x0b0806, bevel: 3, grain: 0.5, ornaments: false }));

    // --- First row ---
    let left = 0;
    if (iconKey) {
      const g = this.add.graphics();
      gradientRect(g, 0, 0, iconSize, iconSize, 0x33261a, 0x120c08);
      frameRect(g, 0, 0, iconSize, iconSize, { bevel: 3, shadow: 0.2 });
      items.push(g, this.add.image(iconSize / 2, iconSize / 2, iconKey).setDisplaySize(iconSize - 8, iconSize - 8));
      left = iconSize + 12;
    }
    const badgeObjs = badge ? makeBadge(this, width, 0, badge, 14) : [];
    const badgeW = badgeObjs.length ? (badgeObjs[1] as Phaser.GameObjects.Text).width + 20 : 0;
    // AOE shape diagram (mini grid: covered cells painted, anchor marked) left of the badge
    const shapeSize = shape ? miniShapeSize(shape) : { w: 0, h: 0 };
    const shapeW = shape ? shapeSize.w + 10 : 0;
    if (shape) items.push(drawMiniShape(this, width - badgeW - shapeW, 0, shape));
    // meta chips (cost, cooldown) right after the title
    const isz = 18;
    const metaTexts = meta.map((m) => this.add.text(0, 0, m.text, { fontFamily: layout.fontFamily, fontSize: '17px', fontStyle: 'bold', color: m.hex, stroke: '#0c0805', strokeThickness: 3 }).setOrigin(0, 0.5));
    const metaW = meta.reduce((w, m, i) => w + (m.icon ? isz + 4 : 0) + metaTexts[i]!.width + 18, 0);
    const titleText = this.add.text(left, iconSize / 2, title, { fontFamily: SERIF, fontSize: '25px', fontStyle: 'bold', color: titleColor, stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0, 0.5);
    const room = width - left - badgeW - shapeW - metaW - 20;
    if (titleText.width > room) titleText.setScale(Math.max(0.6, room / titleText.width));
    items.push(titleText);
    let mx = left + titleText.displayWidth + 18;
    meta.forEach((m, i) => {
      if (m.icon) {
        items.push(this.add.image(mx + isz / 2, iconSize / 2, m.icon).setDisplaySize(isz, isz));
        mx += isz + 4;
      }
      metaTexts[i]!.setPosition(mx, iconSize / 2);
      items.push(metaTexts[i]!);
      mx += metaTexts[i]!.width + 18;
    });
    items.push(...badgeObjs);
    // Fine gold rule under the first row
    const rule = this.add.graphics();
    rule.lineStyle(1, GOLD.edge, 0.7).lineBetween(0, iconSize + 5, width, iconSize + 5);
    rule.fillStyle(GOLD.light, 0.9).fillPoints([{ x: width / 2, y: iconSize + 2 }, { x: width / 2 + 4, y: iconSize + 5 }, { x: width / 2, y: iconSize + 8 }, { x: width / 2 - 4, y: iconSize + 5 }], true);
    items.push(rule);

    // --- Description rows: shrink the font until it fits ---
    const startY = iconSize + 12;
    const avail = maxY - top - startY;
    const build = (size: number, cols: number): { objs: Phaser.GameObjects.Text[]; fits: boolean } => {
      const objs: Phaser.GameObjects.Text[] = [];
      const colW = cols === 1 ? width : (width - 28) / 2;
      let col = 0;
      let y = 0;
      let fits = true;
      for (const [text, hex] of rows) {
        const row = this.add.text(0, 0, text, { fontFamily: layout.fontFamily, fontSize: `${size}px`, color: hex ?? colors.text, stroke: '#0c0805', strokeThickness: 2, wordWrap: { width: colW }, lineSpacing: 1 }).setOrigin(0, 0);
        if (y + row.height > avail && col === 0 && cols === 2) {
          col = 1;
          y = 0;
        }
        row.setPosition(col * (colW + 28), startY + y);
        if (y + row.height > avail) fits = false;
        objs.push(row);
        y += row.height + 2;
      }
      return { objs, fits };
    };
    let chosen: Phaser.GameObjects.Text[] = [];
    outer: for (let size = 16; size >= 12; size--) {
      for (const cols of [1, 2]) {
        const r = build(size, cols);
        if (r.fits || (size === 12 && cols === 2)) {
          chosen = r.objs;
          break outer;
        }
        for (const o of r.objs) o.destroy();
      }
    }
    items.push(...chosen);
    const container = this.add.container(x, top, items).setDepth(4700);
    return { container, width, height: maxY - top };
  }

  private placeInfoTip(tip: Tip): void {
    this.infoTip = tip;
  }

  /** The 4 skill buttons are centered horizontally on the screen. */
  private skillsLeft(): number {
    const p = layout.commandPanel;
    return (W - (4 * p.buttonWidth + 3 * p.gap)) / 2;
  }

  private infoTipX(): number {
    return this.globalX() + GLOBAL_BTN.w + 14; // right after the global action column
  }

  /** Left edge of the small global action column (right after the 4 skills). */
  private globalX(): number {
    const p = layout.commandPanel;
    return this.skillsLeft() + 4 * (p.buttonWidth + p.gap) + 10;
  }

  private showSkillTip(actor: Combatant, skill: SkillDef): void {
    this.hideInfoTip();
    const info = describeSkill(skill, actor.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    const kindColor = (k: (typeof info.kinds)[number]): string | undefined =>
      k === 'shield' ? colors.shield : k === 'magicShield' ? colors.magicShield : k ? colors.element[k] : undefined;
    const rows: Array<[string, string?]> = info.lines.map((l, i): [string, string?] => [l, kindColor(info.kinds[i])]);
    const meta: InfoMeta[] = [];
    const costNow = skillCostAmount(skill.cost, actor); // proportional costs (Wail of the Dead: 20% of current HP) show the real amount right now
    const ratio = isRatioCost(skill.cost);
    if (skill.cost.resource === 'rage' && costNow > 0) {
      meta.push({ icon: ensureIcon(this, RAGE_ICON, RAGE_COLOR, false), text: `RAGE ${costNow}${ratio ? ` (${skillCostLabel(skill.cost)})` : ''}`, hex: RAGE_COLOR });
    } else if (costNow > 0) {
      const kind = skill.cost.resource === 'mp' ? 'mp' : 'hp';
      meta.push({ icon: ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), text: ratio ? `${costNow} ${skill.cost.resource.toUpperCase()} (${skillCostLabel(skill.cost)})` : info.cost, hex: colors.text });
    } else meta.push({ text: info.cost, hex: colors.muted });
    if (this.battle.mode === 'turns' && (skill.cooldown ?? 0) > 0) meta.push({ icon: ensureIcon(this, UI_ICON.hourglass, UI_COLOR, false), text: info.cooldown, hex: colors.muted });
    if (this.battle.mode === 'turns' && info.initialCooldown && !actor.summoned) rows.push([info.initialCooldown, colors.muted]);
    const wait = this.battle.mode === 'turns' ? (actor.cooldowns[skill.id] ?? 0) : 0;
    if (wait > 0) rows.push([`Ready in ${wait} turn${wait > 1 ? 's' : ''}`, colors.targetHighlight]);
    else {
      // Why the button is pale (turn / battle state reasons are obvious and stay silent): no MP, out of reach, 'No target with room behind it' (Backstab), 'No fallen ally' / 'Corpse was consumed' ...
      const can = this.battle.canUse(actor.uid, skill.id);
      if (!can.ok && can.reason !== "Not this unit's turn" && can.reason !== 'Battle is over' && can.reason !== 'Unit is dead' && can.reason !== 'On cooldown') rows.push([can.reason, colors.lethal]);
    }
    // Raise Dead: which corpse it would eat right now, and what comes out (the summon appears on your own side: no target to pick)
    const sp = this.battle.summonPreview(actor.uid, skill.id);
    const summonLine = summonPreviewLine(sp, sp.corpse ? (this.battle.get(sp.corpse.uid)?.name ?? null) : null);
    if (this.battle.needsCorpseChoice(actor.uid, skill.id) && sp.unit) rows.push([`You choose the corpse to consume: empowered ${sp.unit.name} (HP ${sp.unit.stats.hp})`, '#c58bff'], ['Step 1: pick a corpse, step 2: pick the cell (Esc goes back)', colors.muted]);
    else if (summonLine) rows.push([summonLine.text, summonLine.tone === 'empowered' ? '#c58bff' : colors.muted]);
    this.placeInfoTip(this.makeInfo(info.name, colors.text, ensureSkillIcon(this, skill), rows, info.targetBadge, meta, skillMiniGrid(skill, content.formulas.formation)));
  }

  private showStatTip(kind: StatKind, actor: Combatant): void {
    this.hideInfoTip();
    // Accuracy / evasion show the CURRENT value (Blinded, Shrouded...) and say where the change comes from
    const stats = isDeltaStat(kind) ? this.battle.effectiveStats(actor) : actor.stats;
    const info = describeStat(kind, stats, content.formulas);
    const rows = info.lines.map((l): [string, string?] => [l]);
    if (isDeltaStat(kind)) {
      const sources = statSources(actor.statuses, content.statuses, kind);
      if (sources.length > 0) {
        rows.unshift(...sources.map((src): [string, string] => [src.text, src.dir === 'up' ? colors.heal : colors.lethal]));
        rows.splice(sources.length, 0, [`Base ${Math.round(actor.stats[kind] * 100)}%`, colors.muted]);
      }
    }
    this.placeInfoTip(this.makeInfo(info.bonus ? `${info.title} — ${info.bonus.name}` : info.title, info.primary ? PRIMARY_GOLD : STAT_COLOR[kind], ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), rows));
  }

  private hideInfoTip(): void {
    this.infoTip?.container.destroy();
    this.infoTip = undefined;
    this.setGlobalVisible(true);
  }

  private unitTipLines(c: Combatant): string[] {
    const f = content.formulas;
    const pct = (a: number) => `${Math.round(armorReduction(a, f) * 100)}%`;
    const lines = [`HP ${c.hp} / ${c.maxHp}`];
    if (c.maxMp > 0) lines.push(`MP ${c.mp} / ${c.maxMp}`);
    if (c.maxRage !== undefined) lines.push(`Rage ${c.rage ?? 0} / ${c.maxRage}`);
    if (c.shield > 0) lines.push(`Shield ${c.shield}`);
    if (c.magicShield > 0) lines.push(`Magic shield ${c.magicShield}`);
    if (c.statuses.length > 0) lines.push(`Status: ${c.statuses.map((s) => `${s.kind} ${s.turns}`).join(', ')}`);
    lines.push(`STR ${c.stats.str}   DEX ${c.stats.dex}   INT ${c.stats.int}   LCK ${c.stats.luck}`);
    if (c.stats.primary) lines.push(`Primary: ${c.stats.primary.toUpperCase()}${c.stats.primaryActive ? '' : ' (inactive)'}`);
    const eff = this.battle.effectiveStats(c);
    lines.push(`SPD ${c.stats.spd}   ACC ${Math.round(eff.accuracy * 100)}%   EVA ${Math.round(eff.evasion * 100)}%`);
    lines.push(`Regen: +${Math.round(c.stats.hpRegen)} HP${c.stats.mpRegen > 0 ? `, +${c.stats.mpRegen} MP` : ''} per turn`);
    lines.push(`Armor ${c.stats.armor} (${pct(c.stats.armor)})${c.stats.magicArmor > 0 ? `   Magic armor ${c.stats.magicArmor} (${pct(c.stats.magicArmor)})` : ''}`);
    if (c.summoned && c.lifespan !== undefined) lines.push(`Leaves after ${c.lifespan} more turn${c.lifespan === 1 ? '' : 's'}`);
    const cds = Object.entries(c.cooldowns).filter(([, n]) => n > 0);
    if (this.battle.mode === 'turns' && cds.length > 0) lines.push(`Cooldown: ${cds.map(([id, n]) => `${content.skills[id]?.name ?? id} ${n}`).join(', ')}`);
    return lines;
  }

  private showUnitTip(view: CombatantView): void {
    this.hideUnitTip();
    const c = view.combatant;
    const lines = this.unitTipLines(c);
    this.unitTipKey = lines.join('|');
    this.hideInfoTip();
    this.placeInfoTip(this.makeUnitInfo(c));
    this.setGlobalVisible(false); // the unit info is wider than the plaque: the global buttons step aside while it shows
  }

  /**
   * Hover info for any unit: the same layout as the acting unit's block in the bottom bar (class logo, name, HP/MP,
   * attributes, secondary stats), plus its skills and what is on it (shields, statuses, cooldowns), in the right-hand area.
   */
  private makeUnitInfo(c: Combatant): Tip {
    const p = layout.commandPanel;
    const x0 = this.globalX() - 12; // the unit info is wide: it covers the global column (the buttons hide while it shows)
    this.statHitsOn = false;
    const items = this.drawStatsBlock(c, x0);
    this.statHitsOn = true;

    // Skills (2 x 2 icons) next to the block
    const sx = statBlockMetrics(x0).right + 8;
    c.skills.slice(0, 4).forEach((id, i) => {
      const skill = content.skills[id];
      if (!skill) return;
      const cd = this.battle.mode === 'turns' ? (c.cooldowns[id] ?? 0) : 0;
      const ix = sx + (i % 2) * 40;
      const iy = p.y + 10 + Math.floor(i / 2) * 40;
      items.push(this.add.image(ix + 18, iy + 18, ensureSkillIcon(this, skill)).setDisplaySize(36, 36).setAlpha(cd > 0 ? 0.4 : 1));
      if (cd > 0) items.push(this.add.text(ix + 18, iy + 18, String(cd), textStyle(22, colors.targetHighlight)).setOrigin(0.5));
    });

    // The passive next to the skills
    if (c.passive) {
      const px = sx + 84;
      items.push(
        this.add.circle(px + 20, p.y + 30, 20, color(colors.button)).setStrokeStyle(3, color(colors.tooltipBorder)),
        this.add.image(px + 20, p.y + 30, ensureIcon(this, c.passive.icon, c.color, false, ownerOfUnit(c.defId))).setDisplaySize(26, 26),
        this.add.text(px + 20, p.y + 54, c.passive.name, { ...textStyle(13, colors.muted), strokeThickness: 3, wordWrap: { width: 64 }, align: 'center' }).setOrigin(0.5, 0),
      );
    }

    // What is on the unit
    const extra: Array<[string, string]> = [];
    if (c.shield > 0) extra.push([`Shield ${c.shield}`, colors.shield]);
    if (c.magicShield > 0) extra.push([`M.Shield ${c.magicShield}`, colors.magicShield]);
    const fed = empoweredLine(c.empowered); // Raise Dead's Skeleton: fed on a corpse or not
    if (fed) extra.push([fed.text, fed.tone === 'empowered' ? '#c58bff' : colors.muted]);
    for (const st of c.statuses) extra.push([`${content.statuses[st.kind]?.name ?? st.kind[0]!.toUpperCase() + st.kind.slice(1)} ${st.turns}`, content.statuses[st.kind]?.color ?? colors.targetHighlight]);
    for (const tag of c.tags) for (const [el, m] of Object.entries(content.formulas.weaknesses[tag] ?? {})) extra.push([`Weak to ${el} +${Math.round((m - 1) * 100)}%`, colors.element[el as keyof typeof colors.element] ?? colors.muted]);
    if (c.summoned && c.lifespan !== undefined) extra.push([`Leaves in ${c.lifespan}`, colors.muted]);
    extra.slice(0, 3).forEach(([text, hex], i) => items.push(this.add.text(sx, p.y + 100 + i * 18, text, textStyle(15, hex)).setOrigin(0, 0)));

    return { container: this.add.container(0, 0, items).setDepth(4700), width: W - x0, height: H - p.y };
  }

  private hideUnitTip(): void {
    if (this.unitTipKey) this.hideInfoTip();
    this.unitTipKey = '';
  }

  // --- Turn flow: after every action, wait for the animations, then hand control over ---

  /**
   * Queued after each action. Once all its events have played: if it is an enemy's turn (or
   * auto-play is on, or the unit has no usable skill) the AI acts; otherwise the player gets control.
   */
  private settle(): void {
    const battle = this.battle;
    this.eventQueue = this.eventQueue.then(async () => {
      if (battle !== this.battle || !this.scene.isActive()) return;
      this.abortHitGate(); // olaylar bitti: oynanmamış vuruş animasyonu kaldıysa (hedef ilk vuruşta öldü) karakter yerine dönsün
      this.closeStageGate();
      this.busy = false;
      this.refreshCommands();
      if (battle.mode !== 'turns' || battle.winner) return;
      const actor = battle.currentActor;
      if (!actor) return;
      if (this.mp) {
        // Multiplayer: YZ yok. Rakibin sırasında beklenir (onRemote); kendi birimimizin hiçbir eylemi yoksa otomatik pas gönderilir.
        if (actor.side !== this.localSide || !this.mp.canAct()) return;
        if (actor.summoned ? battle.hasUsableSkill(actor.uid) : battle.legalActions(actor.uid).length > 0) return;
        if (this.mp.submit(null)) {
          this.busy = true;
          this.refreshCommands();
          this.settle();
        }
        return;
      }
      const idle = actor.side === 'enemy' && debugState.enemyAiOff && !this.autoPlay; // debug: enemies do nothing
      const aiTurn = actor.side === 'enemy' || this.autoPlay;
      if (!aiTurn && (actor.summoned ? battle.hasUsableSkill(actor.uid) : battle.legalActions(actor.uid).length > 0)) return; // the player's move (class skills or Rest / Skip / Move)
      this.busy = true;
      this.refreshCommands();
      await this.wait(layout.animation.aiThinkMs);
      if (battle !== this.battle || !this.scene.isActive()) return;
      if (idle) {
        this.lastAi = `Enemy ${unitName(actor)}: AI off, skipped`;
        this.matchLog?.noteAi(null);
        this.battle.skipTurn();
        this.settle();
        return;
      }
      this.runAi(actor);
    });
  }

  private runAi(actor: Combatant): void {
    // Difficulty (item 258): the campaign passes it in; quick battles default to Medium. Only the enemy side plays by it (an AI-driven party stays Medium).
    const aiOpts = { difficulty: actor.side === 'enemy' ? (this.difficulty ?? 'medium') : 'medium' } as const;
    const choice = chooseAction(this.battle, actor.uid, content.aiConfig, undefined, aiOpts);
    this.matchLog?.noteAi(explainChoice(this.battle, actor.uid, content.aiConfig, aiOpts)); // match record: why this move (does not change the decision)
    const who = `${actor.side === 'enemy' ? 'Enemy ' : 'Player '}${unitName(actor)}`;
    if (choice) {
      const skill = content.skills[choice.skillId];
      const globalName = this.battle.globalDef(choice.skillId)?.name;
      const target = choice.targetUid && !choice.targetUid.startsWith('tile:') ? this.battle.get(choice.targetUid) : undefined;
      const targetName = target ? `${target.side === 'enemy' ? 'Enemy ' : 'Player '}${unitName(target)}` : '';
      const where = choice.slot !== undefined ? ` to cell ${choice.slot + 1}` : '';
      this.lastAi = `${who}: ${skill?.name ?? globalName ?? choice.skillId}${target ? ` on ${targetName}` : ''}${where} (${choice.reason})`;
    } else {
      this.lastAi = `${who}: no useful action, skipped`;
    }
    const result = this.battle.applyChoice(actor.uid, choice);
    if (!result.ok) this.battle.skipTurn(); // safety net: never get stuck on an invalid choice
    this.settle();
  }

  // --- Event playback: animates the engine's events in order ---

  /** Gambler: bir skill kullanımının bahis sonucu ve çifte vuruşu (olaylar motorda hemen yayılır; animasyon sonra oynar). */
  private skillResults = new WeakMap<object, { bet?: 'win' | 'lose'; doubleHit?: boolean }>();
  private lastSkillUsed: object | null = null;

  private enqueue(e: BattleEvent): void {
    this.usageRec.push(e);
    if (e.type === 'skillUsed') this.lastSkillUsed = e;
    else if (e.type === 'passive' && this.lastSkillUsed) {
      const r = this.skillResults.get(this.lastSkillUsed) ?? {};
      if (e.passive === 'gamble_win') r.bet = 'win';
      else if (e.passive === 'gamble_lose') r.bet = 'lose';
      else if (e.passive === 'gamble_double') r.doubleHit = true;
      this.skillResults.set(this.lastSkillUsed, r);
    }
    // If the scene restarts, queued events of the old battle must not touch the new characters
    const battle = this.battle;
    this.eventQueue = this.eventQueue.then(() => (battle === this.battle ? this.playEvent(e) : undefined));
  }

  /** Extra damage tags for the floating number (engine fields, all optional): element, origin (skill/ground/status/self), ground type. */
  private damageTags(e: BattleEvent & { type: 'damage' }): DamageTags {
    return { ...(e.element ? { element: e.element } : {}), ...(e.origin ? { origin: e.origin } : {}), ...(e.ground ? { ground: e.ground } : {}), ...(e.status ? { statusId: e.status } : {}) };
  }

  private async playEvent(e: BattleEvent): Promise<void> {
    if (!this.scene.isActive()) return;
    // Aşamalı alan skill'i: aşama olayları vfx o aşamayı açana kadar bekler (vfx aşamadan habersizse beklemez)
    if (e.stage !== undefined) await this.awaitStage(e.stage);
    switch (e.type) {
      case 'skillUsed': {
        this.abortHitGate();
        this.closeStageGate();
        const actor = this.battle.get(e.actor);
        const skill = content.skills[e.skill];
        if (actor && skill) this.announce(`${actor.side !== this.localSide ? 'Enemy ' : ''}${unitName(actor)} uses ${skill.name}`);
        this.currentUsage = this.usageRec.usageOf(e); // efekt bu kullanımda gerçekte ne olduğunu bilsin (VfxCtx.usage)
        // Backstab: the cell behind the target the vfx teleports into (visual only; the formation does not change)
        this.skillBehind = e.behindSlot !== undefined && e.behindBoard ? this.cellPos(e.behindBoard, e.behindSlot) : undefined;
        return this.playSkillMotion(e.actor, e.skill, e.targets, e.anchor ?? e.center, this.skillResults.get(e), e.cells, e.stages, e.board);
      }
      case 'resource': {
        const view = this.views.get(e.actor);
        if (e.resource === 'mp') view?.setMp(e.after);
        else view?.setHp(e.after);
        return;
      }
      case 'damage': {
        await this.passHitGate();
        const target = this.views.get(e.target);
        // Wither tiki (durum hasarı, taşıyanın tur başı): v2'de Hexer'ın 'withertick' efekti, v1'de ayak dibinde kısa çürük buharı; rakam küçük
        const witherTick = e.origin === 'status' && e.status === 'wither';
        if (target && witherTick) {
          const owner = statusOwner('wither') ?? this.ownerOfView(this.views.get(e.source));
          if (!(await this.runEventFx(owner, EVENT_FX.witherTick, { actor: this.views.get(e.source) ?? target, targets: [target], event: e })))
            VFX_KIT.burst(this, target.container.x, target.container.y - 10, { colors: ['#9cab3c', '#6f7a2a', '#c9d27a'], n: 8, speed: [20, 70], angle: [-Math.PI, 0], gravity: -60, life: [400, 700], size: [6, 10] });
        }
        if (target && witherTick && e.amount > 0) {
          const ratio = e.amount / target.combatant.maxHp;
          target.hit(ratio * 0.5);
          target.floatText(String(e.amount), content.statuses['wither']?.color ?? '#9cab3c', 38, false, { kind: 'damage', rightIcon: 'poison' });
          target.setHp(e.hpAfter, true, ratio);
          target.setShield(e.shieldAfter, e.magicShieldAfter);
        } else if (target) {
          // The bigger the hit relative to max HP, the stronger the reaction (shake, flash, number size, bar drain)
          const ratio = e.amount / target.combatant.maxHp;
          if (e.luckyEscape) {
            // Lucky Escape: the killing blow is ignored completely (no HP change); no "0" here, the passive event that follows names it
            target.ring(colors.primaryGroup?.luck ?? '#2fcfa0');
          } else if (e.amount === 0 && e.absorbed > 0) {
            target.ring(e.magicShieldAfter > 0 || e.shieldAfter === 0 ? colors.magicShield : colors.shield);
            target.floatText('Blocked', colors.shield, 46, false, { kind: 'shield' });
          } else {
            target.hit(ratio);
            target.damageText(e.amount, ratio, e.crit, this.damageTags(e));
          }
          if (e.redirected) target.ring(colors.shield, 0.8); // guarded damage taken for an ally
          target.setHp(e.hpAfter, true, ratio);
          target.setShield(e.shieldAfter, e.magicShieldAfter);
        }
        await this.wait(slow(90));
        return;
      }
      case 'dodge':
        // Evasion: the TARGET slips away ("Dodge" above the target); no hit reaction, no number
        await this.passHitGate();
        this.views.get(e.target)?.dodge();
        await this.wait(slow(90));
        return;
      case 'miss':
        // Accuracy: the ATTACKER misses (pale "MISS" above the attacker); the target does not react
        await this.passHitGate();
        this.views.get(e.source)?.missText();
        await this.wait(slow(90));
        return;
      case 'rage': {
        const view = this.views.get(e.actor);
        if (e.delta !== 0) view?.floatText(`${e.delta > 0 ? '+' : ''}${e.delta} Rage`, colors.rage, e.delta > 0 ? 38 : 44, false, { kind: 'resource' });
        this.tweenRage(e.actor, e.after);
        await this.wait(slow(60));
        return;
      }
      case 'globalUsed': {
        const actor = this.battle.get(e.actor);
        const view = this.views.get(e.actor);
        const def = this.battle.globalDef(e.id);
        if (actor && def) {
          const who = `${actor.side !== this.localSide ? 'Enemy ' : ''}${unitName(actor)}`;
          this.announce(def.kind === 'rest' ? `${who} uses Rest` : def.kind === 'skip' ? `${who} skips the turn` : `${who} moves`);
        }
        if (def?.kind === 'rest') {
          playSfx(this, 'gasp', SHARED_KEY);
          view?.ring(colors.mpFill, 0.9);
        } else if (def?.kind === 'skip') playSfx(this, 'fistWhoosh', SHARED_KEY);
        await this.wait(slow(120));
        return;
      }
      case 'moved': {
        const view = this.views.get(e.actor);
        const c = this.battle.get(e.actor);
        if (view && c) {
          const to = this.cellPos(c.board, e.to);
          playSfx(this, 'armorRun', SHARED_KEY);
          await view.moveTo(to.x, to.y);
        }
        this.refreshBrandCells(e.actor); // damgalı birim taşındı: Ash Brand hücreleri onu izler
        this.refreshCommands();
        return;
      }
      case 'heal': {
        const target = this.views.get(e.target);
        if (e.crit) target?.floatText(`+${e.amount}`, colors.crit, 70, true, { kind: 'crit', leftIcon: 'burst' });
        else target?.floatText(`+${e.amount}`, colors.heal, 64, false, { kind: 'heal' });
        target?.ring(colors.heal);
        target?.setHp(e.hpAfter);
        await this.wait(slow(90));
        return;
      }
      case 'shield': {
        const target = this.views.get(e.target);
        const hex = e.magic ? colors.magicShield : colors.shield;
        if (e.amount >= 0) {
          target?.floatText(`+${e.amount}`, hex, 60, false, { kind: 'shield' });
          target?.ring(hex);
        } else target?.floatText(`${e.amount} shield`, hex, 44, false, { kind: 'shield' });
        target?.setShield(e.shieldAfter, e.magicShieldAfter);
        await this.wait(slow(90));
        return;
      }
      case 'manaBurn': {
        const target = this.views.get(e.target);
        target?.floatText(`-${e.amount} MP`, colors.burn, 44, false, { kind: 'resource' });
        target?.ring(colors.burn, 0.8);
        target?.setMp(e.mpAfter);
        await this.wait(slow(60));
        return;
      }
      case 'status':
      case 'statusEnd': {
        if (e.type === 'statusEnd' && e.broken) {
          this.views.get(e.target)?.floatText('Taunt broken', colors.targetHighlight, 40);
          this.views.get(e.target)?.ring(colors.targetHighlight, 0.8);
        }
        // Vine Snare: a unit rooted by vines keeps a light root-vine wrap on its legs while the stun lasts
        if (e.type === 'status' && e.cause === 'vines') {
          this.views.get(e.target)?.setVineWrap(true);
          this.views.get(e.target)?.floatText('Rooted', '#8bd06a', 36);
        } else if (e.type === 'statusEnd' && e.status === 'stun') this.views.get(e.target)?.setVineWrap(false);
        // Silence (Drain Field, madde 260): MP bedelli skill'leri kilitleyen durum: "Silenced" yazısı (rozet genel durum gösteriminden gelir)
        if (e.type === 'status' && content.statuses[e.status]?.blocksMpSkills) {
          const def = content.statuses[e.status];
          this.views.get(e.target)?.floatText(def?.name ?? 'Silenced', def?.color ?? '#9b59d0', 38, false, { kind: 'resource' });
          await this.wait(slow(60));
        }
        // Dispel (Mana Barrier dostun debuff'ını, Spell Ward saldıranın buff'ını sildi): kısa parlama + "Dispelled: Haste"
        if (e.type === 'statusEnd' && e.dispelled) {
          const v = this.views.get(e.target);
          const def = content.statuses[e.status];
          v?.floatText(`Dispelled: ${def?.name ?? e.status}`, def?.color ?? colors.targetHighlight, 34, false, { kind: 'resource' });
          v?.ring('#fff0a0', 0.7);
          await this.wait(slow(80));
        }
        return;
      }
      case 'omen': {
        // Hexer: Omen yığını; "+1 Omen" (kritikte "+2 Omen!"), Ill Omen geçişinde alıcıda "Omen x2 (Ill Omen)"
        const v = this.views.get(e.target);
        const hex = content.statuses['omen']?.color ?? '#b04fa8';
        if (e.cause === 'transfer') v?.floatText(`Omen x${e.stacks} (Ill Omen)`, hex, 34, false, { kind: 'resource' });
        else if (e.delta > 0) v?.floatText(`+${e.delta} Omen${e.crit ? '!' : ''}`, e.crit ? colors.crit : hex, e.crit ? 42 : 34, e.crit, { kind: 'resource' });
        await this.wait(slow(60));
        return;
      }
      case 'doom': {
        // Doom patlaması (ardından normal hasar olayı gelir): büyük "DOOM"; otomatik Doom'da (yığın doldu / süre bitti) v2 Hexer 'doomburst',
        // v1'de basit kara-mor çöküş. Doom Mark (detonate) kendi skill efektinin içinde patlar: yalnızca yazı.
        const v = this.views.get(e.target);
        v?.setSeals(null); // mühürler çatladı: yuvalar boşalır (rozet bir sonraki tazelemede gelir/gider)
        v?.floatText('DOOM', '#e9dfc4', 72, true, { kind: 'crit' });
        if (v && e.cause !== 'detonate') {
          const source = this.views.get(e.source);
          const owner = statusOwner('omen') ?? this.ownerOfView(source);
          if (!(await this.runEventFx(owner, EVENT_FX.doom, { actor: source ?? v, targets: [v], event: e }))) {
            const f = { x: v.container.x, y: v.container.y };
            void VFX_KIT.ring(this, f.x, f.y - 4, { r: 120, flat: 0.34, n: 26, colors: ['#b04fa8', '#6a2f5f', '#e9dfc4'], dur: 420, size: 10 });
            VFX_KIT.burst(this, f.x, f.y - v.h * 0.55, { colors: ['#b04fa8', '#6a2f5f', '#e3b8de', '#1c0a1a'], n: 14, speed: [80, 260], gravity: 300, life: [360, 640], size: [6, 10] });
            VFX_KIT.shake(this, 160, 0.005);
            await this.wait(slow(220));
          }
        } else await this.wait(slow(120));
        return;
      }
      case 'omenTransfer': {
        // Ill Omen: ölen birimin Omen'leri en yakın dostuna geçer; v2 Hexer 'omentransfer' (eflatun iplik), v1'de kısa mor iz
        const from = this.views.get(e.from);
        const to = this.views.get(e.to);
        if (!from || !to) return;
        const owner = statusOwner('omen') ?? this.ownerOfView(this.views.get(e.source));
        if (!(await this.runEventFx(owner, EVENT_FX.omenTransfer, { actor: from, targets: [to], event: e }))) {
          const w = VFX_KIT.sprite(this, 'wisp', '#b04fa8', from.container.x, from.container.y - from.h * 0.55, 40, VFX_KIT.DEPTH + 30);
          await VFX_KIT.travel(this, w, { x: to.container.x, y: to.container.y - to.h - 10 }, 420, { arc: 90, ease: 'in' });
          w.destroy();
          to.ring('#b04fa8', 0.8);
        }
        return;
      }
      case 'shieldTrigger': {
        // Kalkan kancası (Spell Ward / Mana Barrier) bir darbeyi emdi: taşıyanda kısa parlama + kalkanın kilit sesi (v2 seçiliyse Anti-Mage
        // 'wardLock' / Mage 'domeLock'). Yazılar ardından gelen manaBurn ('-8 MP'), statusEnd ('Dispelled: Haste'), mpRegen ('+3 MP') olaylarında.
        const bearer = this.views.get(e.bearer);
        const owner = ownerOfSkill(e.skill);
        const magic = content.skills[e.skill]?.effects.some((ef) => ef.type === 'shield' && ef.shieldType === 'magic');
        const hex = magic ? colors.magicShield : colors.shield;
        bearer?.ring(hex, 1);
        if (bearer) VFX_KIT.burst(this, bearer.container.x, bearer.container.y - bearer.h * 0.55, { colors: [hex, '#ffffff'], n: 8, speed: [60, 180], gravity: 0, life: [220, 380], size: [5, 8] });
        const lock = SHIELD_LOCK_SFX[e.skill];
        if (lock && owner && skillSfxAllowed(content.skills[e.skill] ?? { id: e.skill }, lock, owner)) playSfx(this, lock, owner);
        await this.wait(slow(90));
        return;
      }
      case 'summon': {
        this.uiOccupied.add(cellKey(e.combatant.board, e.combatant.slot)); // a corpse under the new unit hides its mark until the unit is gone
        this.refreshCorpseMarks();
        const view = this.addView(e.combatant);
        if (view) {
          view.container.setAlpha(0);
          // Raise Dead: fed (corpse consumed) = purple birth + lasting aura; unfed = pale birth
          const caster = this.views.get(e.actor);
          // v2 kancası: sahibin (Undead/Druid) v2 dosyasında 'summon_<çağrı>' varsa o; yoksa v1 summonFx. v2 efekt birimi görünür yapmalı.
          const owner = ownerOfUnit(e.combatant.defId);
          const used = await this.runEventFx(owner, EVENT_FX.summon(e.combatant.defId), { actor: caster ?? view, targets: [view], event: e, unitId: e.combatant.defId, ...(this.currentUsage ? { usage: this.currentUsage } : {}) });
          if (used) {
            if (e.empowered) view.setEmpowered(true);
            if (view.container.alpha < 1) this.tweens.add({ targets: view.container, alpha: 1, duration: slow(200) }); // efekt unuttuysa birim yine görünür
          } else await summonFx(this, e.combatant.defId, view, { ...(e.empowered !== undefined ? { empowered: e.empowered } : {}), ...(caster ? { caster } : {}) });
        }
        return;
      }
      case 'revive':
        this.uiCorpses.delete(e.target); // revived: its corpse mark is gone
        this.refreshCorpseMarks();
        if (this.rageShown.has(e.target)) this.setRageShown(e.target, 0);
        {
          // Madde 257: Resurrection may raise the ally on another (empty) cell than its corpse
          const back = this.battle.get(e.target);
          const moved = e.slot !== undefined && e.from !== undefined && e.slot !== e.from && back;
          this.views.get(e.target)?.revive(e.hpAfter, e.mpAfter, moved ? this.cellPos(back.side, e.slot!) : undefined);
        }
        await this.wait(slow(500));
        this.refreshCommands();
        return;
      case 'despawn': {
        {
          // Süresi dolan çağrı: v2 kancası 'summonvanish_<çağrı>' (sahibin dosyasında varsa) üstte oynar, ardından birim solar
          const v = this.views.get(e.target);
          if (v) await this.runEventFx(ownerOfUnit(v.combatant.defId), EVENT_FX.summonVanish(v.combatant.defId), { actor: v, targets: [v], event: e, unitId: v.combatant.defId });
        }
        await this.views.get(e.target)?.vanish();
        const gone = this.battle.get(e.target);
        if (gone) this.uiOccupied.delete(cellKey(gone.board, gone.slot));
        this.refreshCorpseMarks();
        this.refreshCommands();
        return;
      }
      case 'corpseConsumed':
        // Raise Dead: bone dust at the corpse and a purple soul rope into the Undead (vfx), then the mark fades
        // v2 kancası: Undead v2 dosyasında 'corpsedrain' varsa o (c.centerPos = ceset hücresi, c.actor = Undead, c.event.uid = ceset); yoksa v1
        if (!(await this.runEventFx(this.ownerOfView(this.views.get(e.by)), EVENT_FX.corpseDrain, { actor: this.views.get(e.by), targets: [], at: this.cellPos(e.side, e.slot), event: e, ...(this.currentUsage ? { usage: this.currentUsage } : {}) })))
          await corpseDrainFx(this, this.cellPos(e.side, e.slot), this.views.get(e.by));
        this.uiCorpses.set(e.uid, 'consumed'); // devoured: the mark fades and the cell looks empty (the effect itself is the vfx's job)
        this.refreshCorpseMarks();
        return;
      case 'ground': {
        this.addGroundView(e);
        return;
      }
      case 'groundEnd': {
        this.removeGroundView(e.id);
        return;
      }
      case 'passive': {
        const view = this.views.get(e.actor);
        view?.floatText(e.name, colors.targetHighlight, 34);
        view?.ring(colors.targetHighlight, 0.9);
        await this.wait(120);
        return;
      }
      case 'mpRegen': {
        const view = this.views.get(e.actor);
        view?.setMp(e.after);
        view?.floatText(`+${e.amount} MP`, colors.mpFill, 40, false, { kind: 'resource' });
        return;
      }
      case 'turnStart':
        this.abortHitGate();
        this.closeStageGate();
        this.extraAction = !!e.extra;
        if (this.uiActor && this.uiActor !== e.actor) this.playedUids.push(this.uiActor);
        this.uiActor = e.actor;
        this.renderTurnBar(e.queue);
        this.refreshSpeedBars();
        this.refreshCommands();
        return;
      case 'turnSkipped': {
        const actor = this.battle.get(e.actor);
        this.views.get(e.actor)?.floatText(e.stunned ? 'Stunned' : 'Skipped', e.stunned ? colors.targetHighlight : colors.turnCell, 48);
        if (e.voluntary) {
          await this.wait(slow(320)); // chosen skip: already announced by globalUsed
          return;
        }
        if (actor) this.announce(`${actor.side !== this.localSide ? 'Enemy ' : ''}${unitName(actor)} ${e.stunned ? 'is stunned and loses the turn' : 'has nothing to cast and skips the turn'}`);
        await this.wait(500);
        return;
      }
      case 'death': {
        {
          // Çağrının ölümü: v2 kancası 'summondeath_<çağrı>' (sahibin dosyasında varsa) üstte oynar, ardından birim düşer
          const v = this.views.get(e.target);
          if (v?.combatant.summoned) await this.runEventFx(ownerOfUnit(v.combatant.defId), EVENT_FX.summonDeath(v.combatant.defId), { actor: v, targets: [v], event: e, unitId: v.combatant.defId });
        }
        await this.views.get(e.target)?.die();
        // The corpse mark appears once the death animation is over; a summon leaves none (and frees its cell for a corpse beneath it)
        const dead = this.battle.get(e.target);
        if (e.corpse) this.uiCorpses.set(e.target, 'revivable');
        else if (dead?.summoned) this.uiOccupied.delete(cellKey(dead.board, dead.slot));
        this.refreshCorpseMarks();
        this.refreshCommands();
        return;
      }
      // --- Boss (The Bridge Warden): telgraf göstergeleri, çözülme/faz/Mooring efektleri (src/game/vfx-warden.ts) ---
      case 'telegraph':
        this.showTelegraph(e.id, e.skill, e.kind, e.board, e.cells, e.safeCells, e.bound);
        await this.wait(slow(200));
        return;
      case 'telegraphCancel':
        this.clearTelegraph(e.id);
        if (e.cause === 'anchor' || e.cause === 'dispel') this.announce(`${content.skills[e.skill]?.name ?? e.skill} is cancelled`);
        return;
      case 'telegraphDelay':
        return;
      case 'telegraphResolve': {
        const kind = this.telegraphViews.get(e.id)?.kind;
        this.clearTelegraph(e.id);
        const tg = content.skills[e.skill]?.telegraph;
        const key = tg?.kind === 'brand' ? 'ashbrandburst' : tg?.wholeBoard || kind === 'fall' ? 'fallofthebridgecollapse' : 'breakingspancollapse';
        await this.runWardenFx(key, { actor: this.views.get(e.source), targets: e.hit.flatMap((u) => this.views.get(u) ?? []), board: e.board, slots: e.cells, event: e, skillId: e.skill });
        return;
      }
      case 'phase':
        this.announce(e.banner);
        await this.runWardenFx(e.phase >= 3 ? 'wardenphase3' : 'wardenphase2', { actor: this.views.get(e.actor), targets: [], event: e, skillId: 'anchor_smash' });
        return;
      case 'anchorBroken': {
        const w = this.views.get(e.owner);
        await this.runWardenFx('mooringbreak', { actor: this.views.get(e.anchor), targets: w ? [w] : [], event: e, skillId: 'chain_hook' });
        return;
      }
      case 'staggered': {
        const actor = this.battle.get(e.actor);
        this.views.get(e.actor)?.floatText('Staggered', colors.targetHighlight, 44);
        if (actor) this.announce(`${actor.side === 'enemy' ? 'Enemy ' : ''}${unitName(actor)} is staggered and loses an action`);
        await this.wait(slow(400));
        return;
      }
      case 'battleEnd':
        this.showResult(e.winner === this.localSide);
        return;
      case 'battleStart':
        return;
    }
  }

  /** Sets the displayed Rage right away (no animation) and redraws the bar if it belongs to the acting unit. */
  private setRageShown(uid: string, value: number): void {
    this.rageShown.set(uid, value);
    if (this.rageBar?.uid === uid) this.rageBar.redraw();
  }

  /** Animates the Rage bar of a unit to a new value (events are played in order, so the bar follows the log, not the engine). */
  private tweenRage(uid: string, to: number): void {
    const from = this.rageShown.get(uid) ?? to;
    this.tweens.addCounter({
      from,
      to,
      duration: 380,
      ease: 'Quad.easeOut',
      onUpdate: (t) => this.setRageShown(uid, t.getValue() ?? to),
      onComplete: () => this.setRageShown(uid, to),
    });
  }

  /**
   * Thin RAGE bar under the 4th skill button (red-orange, value written on it); only for classes with a Rage resource.
   * Hover explains the resource. `x`, `y`, `w` follow the skill button above it.
   */
  private rageBarItems(actor: Combatant, x: number, y: number, w: number): Phaser.GameObjects.GameObject[] {
    const max = actor.maxRage ?? 0;
    const h = 14;
    const g = this.add.graphics();
    const label = this.add.text(x + w / 2, y + h / 2 - 1, '', { fontFamily: layout.fontFamily, fontSize: '13px', fontStyle: 'bold', color: '#fff3dc', stroke: '#2a0a02', strokeThickness: 3 }).setOrigin(0.5);
    const icon = this.add.image(x + 9, y + h / 2, ensureIcon(this, RAGE_ICON, RAGE_COLOR, false)).setDisplaySize(15, 15);
    const redraw = (): void => {
      if (!g.active) return;
      const v = Math.max(0, Math.min(max, this.rageShown.get(actor.uid) ?? actor.rage ?? 0));
      const frac = max > 0 ? v / max : 0;
      g.clear();
      g.fillStyle(0x050302, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle(color(colors.rageDark), 1).fillRect(x, y, w, h);
      if (frac > 0) {
        g.fillGradientStyle(0xffa23a, 0xffa23a, 0xd8341c, 0xd8341c, 1).fillRect(x, y, Math.max(2, w * frac), h);
        g.fillStyle(0xffffff, 0.2).fillRect(x, y, Math.max(2, w * frac), 3);
      }
      frameRect(g, x - 1, y - 1, w + 2, h + 2, { bevel: 1, edge: GOLD.dark, light: GOLD.edge, shadow: 0.2 });
      label.setText(`${Math.round(v)}/${max}`);
    };
    redraw();
    this.rageBar = { uid: actor.uid, redraw };
    const hit = this.add.rectangle(x, y, w, h, 0x000000, 0.001).setOrigin(0, 0).setInteractive();
    hit.on('pointerover', () => {
      this.hideInfoTip();
      this.placeInfoTip(this.makeInfo('Rage', RAGE_COLOR, ensureIcon(this, RAGE_ICON, RAGE_COLOR, true), [[`Rage ${Math.round(this.rageShown.get(actor.uid) ?? actor.rage ?? 0)} / ${max}`, colors.text], ...describeRage(content.formulas).map((l): [string, string?] => [l, colors.muted])], 'Resource'));
    });
    hit.on('pointerout', () => this.hideInfoTip());
    return [g, icon, label, hit];
  }

  /** The skill's motion: melee = lunge, ranged/cast = wind-up + projectile, sky = falls from above, support = ring. */
  /** Backstab (requiresOpenBehind): ground position of the cell behind the target, from the last skillUsed event (vfx-only teleport). */
  private skillBehind: { x: number; y: number } | undefined;

  private async playSkillMotion(actorUid: string, skillId: string, targetUids: string[], center?: number, result?: { bet?: 'win' | 'lose'; doubleHit?: boolean }, eventCells?: number[], stages?: AreaStage[], areaBoard?: 'party' | 'enemy'): Promise<void> {
    // Shape skills: the covered floor cells flash quietly while the effect plays and once more the moment it lands. Staged skills flash stage by
    // stage: each stage's plates flash when the vfx releases that stage (VfxCtx.releaseStage), the rest when the effect resolves / the gate closes.
    const board = areaBoard ?? this.targetSide(actorUid); // either-side areas (Smoke Bomb) carry the board they landed on
    const shape = center !== undefined && this.battle.isShapeSkill(skillId);
    const groups = shape ? (stages && stages.length > 1 ? stages.map((s) => s.cells) : [eventCells ?? this.battle.areaCells(skillId, center!, board)]) : [];
    const flashes = groups.map((cells) => this.beginShapeFlash(board, cells));
    const staged = !!stages && stages.length > 1;
    const release = staged ? this.openStageGate((i) => flashes.forEach((f, k) => k <= i && f?.hit())) : undefined;
    try {
      await this.playSkillMotionCore(actorUid, skillId, targetUids, center, result, eventCells, stages, release, board);
    } finally {
      // Aşamadan habersiz efekt (kapıyı sahiplenmedi): tüm plakalar vuruş anında parlar; sahiplendiyse yalnızca ilk aşama (diğerleri releaseStage ile)
      if (!staged || !this.stageGate?.claimed) flashes.forEach((f) => f?.hit());
      else flashes[0]?.hit();
    }
  }

  private async playSkillMotionCore(actorUid: string, skillId: string, targetUids: string[], center?: number, result?: { bet?: 'win' | 'lose'; doubleHit?: boolean }, eventCells?: number[], stages?: AreaStage[], releaseStage?: (i: number) => void, areaBoard?: 'party' | 'enemy'): Promise<void> {
    const skill = content.skills[skillId];
    const actor = this.views.get(actorUid);
    const targets = targetUids.flatMap((uid) => this.views.get(uid) ?? []);
    if (!skill || !actor) return;
    const board = areaBoard ?? this.targetSide(actorUid);
    const offensive = skill.effects.some((ef) => ef.type === 'damage' || ef.type === 'manaBurn' || ef.type === 'ground');
    // Area skills can be cast on empty cells: they still play (the effect lands on the chosen cell)
    if (targets.length === 0 && !(center !== undefined && offensive)) return;

    // Piksel art skill efekti (src/game/vfx.ts): varsa genel hareket yerine o oynar
    // Sürüm farkında (debug > Versions): sahibinin v2'si seçiliyse ve karşılığı varsa v2 efekti/sesleri, yoksa v1 (src/game/vfx-versions.ts)
    const resolved = resolveSkillVfx(skill);
    const owner = resolved?.owner ?? ownerOfSkill(skill.id);
    const vfx = resolved?.run;
    if (!vfx) for (const id of skill.sfx ?? []) playSfx(this, id, owner); // efekti kodda olmayan skill'in sesleri başta çalar (Radiance)
    if (vfx) {
      const area = center !== undefined && this.battle.isAreaSkill(skillId);
      // Kapsanan hücreler hedef tahtasına göre (oyuncu tahtasında ayna doğru): olaydaki liste, yoksa tahtayla hesap
      const slots = area ? (eventCells ?? this.battle.areaCells(skillId, center!, board)) : [];
      const cells = slots.map((slot) => this.cellPos(board, slot));
      const vfxStages = area && stages && stages.length > 1 ? stages.map((s) => ({ slots: s.cells, cells: s.cells.map((slot) => this.cellPos(board, slot)), targets: s.targets.flatMap((uid) => this.views.get(uid) ?? []) })) : undefined;
      // Whirlwind gibi tüm düşmanlara vuran yakın dövüş: hedeflerin ön sırasının orta hücresi
      let rowCenter: { x: number; y: number } | undefined;
      if (skill.target === 'all_enemies' && skill.motion === 'melee' && targets.length > 0) {
        const row = Math.min(...targets.map((t) => this.battle.rowOf(t.combatant.slot)));
        rowCenter = this.cellPos(board, row * content.GRID.lanes + 1);
      }
      await vfx({
        scene: this,
        actor,
        targets,
        skill,
        board,
        ...(center !== undefined ? { center } : {}),
        ...(rowCenter ? { rowCenter } : {}),
        ...(area ? { centerPos: this.cellPos(board, center!) } : {}),
        cells,
        slots,
        ...(vfxStages ? { stages: vfxStages } : {}),
        releaseStage: (i) => releaseStage?.(i),
        ...(result ? { result } : {}),
        ...(this.skillBehind ? { behind: this.skillBehind } : {}),
        foes: [...this.views.values()].filter((v) => v.combatant.side !== actor.combatant.side && v.combatant.hp > 0),
        ...(this.currentUsage && this.currentUsage.used.actor === actorUid && this.currentUsage.used.skill === skillId ? { usage: this.currentUsage } : {}),
        viewOf: (uid) => this.views.get(uid),
        lunge: () => meleeApproach(this, actor, targets, area ? this.cellPos(board, center!) : undefined),
        windUp: (hex, anim = 'cast') => actor.windUp(hex, anim),
        sfx: (id) => {
          if (skillSfxAllowed(skill, id, owner)) playSfx(this, id, owner);
        },
        gate: (skip, run, abort) => {
          this.abortHitGate();
          this.hitGate = { skip, run, abort };
        },
      });
      return;
    }

    if (skill.motion === 'melee') {
      const avgX = targets.reduce((sum, t) => sum + t.container.x, 0) / targets.length;
      await new Promise<void>((resolve) => void actor.lunge(avgX, resolve));
      return;
    }
    await actor.windUp(skill.fx, skill.motion === 'ranged' || skill.motion === 'whip' ? 'attack' : 'cast');
    if (!offensive) return;
    const spotOf = (t: CombatantView) => ({ x: t.container.x, y: t.container.y - t.h * 0.45, w: t.w });
    if (skill.motion === 'sky') {
      if (skill.skyCenter && center !== undefined) {
        // One big effect on the chosen area (e.g. a single huge meteor, a pillar of light)
        const q = this.cellPos(board, center);
        await this.skyFall({ x: q.x, y: q.y - 50, w: 114 }, skill, true);
      } else if (skill.skyStagger) {
        // One after another in random order; an effect does not wait for the previous one to finish
        const order = Phaser.Utils.Array.Shuffle([...targets]);
        await Promise.all(order.map((t, i) => this.wait(slow(i * skill.skyStagger!)).then(() => this.skyFall(spotOf(t), skill))));
      } else await Promise.all(targets.map((t) => this.skyFall(spotOf(t), skill)));
    } else if (skill.motion === 'ground') await Promise.all(targets.map((t) => this.maw(t)));
    else if (skill.motion === 'whip') await Promise.all(targets.map((t) => this.whip(actor, t, skill)));
    else await Promise.all(targets.map((t) => this.fly(actor, t, skill)));
  }

  /** A whip: a thorny vine arcs from the caster to the target, then snaps tight. */
  private whip(from: CombatantView, to: CombatantView, skill: SkillDef): Promise<void> {
    const g = this.add.graphics().setDepth(4300);
    const dir = to.container.x > from.container.x ? 1 : -1;
    const sx = from.container.x + dir * 34;
    const sy = from.container.y - from.h * 0.55;
    const ex = to.container.x;
    const ey = to.container.y - to.h * 0.5;
    const hex = color(skill.fx);
    const draw = (reach: number, flat: number) => {
      g.clear();
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= 28; i++) {
        const u = (i / 28) * reach;
        pts.push({
          x: sx + (ex - sx) * u,
          y: sy + (ey - sy) * u - Math.sin(u * Math.PI) * 110 * (1 - flat) + Math.sin(u * 16) * 7 * (1 - flat),
        });
      }
      g.lineStyle(9, 0x2f4d17, 1).beginPath().moveTo(pts[0]!.x, pts[0]!.y);
      for (const q of pts) g.lineTo(q.x, q.y);
      g.strokePath();
      g.lineStyle(5, hex, 1).beginPath().moveTo(pts[0]!.x, pts[0]!.y);
      for (const q of pts) g.lineTo(q.x, q.y);
      g.strokePath();
      // thorns
      g.lineStyle(3, 0xf4ede1, 1);
      pts.forEach((q, i) => {
        if (i % 3 !== 1 || i === 0) return;
        g.beginPath().moveTo(q.x, q.y).lineTo(q.x + dir * 4, q.y - 11).strokePath();
      });
    };
    return new Promise((resolve) => {
      const state = { reach: 0, flat: 0 };
      this.tweens.add({
        targets: state,
        reach: 1,
        duration: slow(190),
        ease: 'Quad.easeOut',
        onUpdate: () => draw(state.reach, 0),
        onComplete: () => {
          // the snap: the arc pulls straight and the target is hit
          this.tweens.add({
            targets: state,
            flat: 1,
            duration: slow(90),
            onUpdate: () => draw(1, state.flat),
            onComplete: () => {
              this.impact(ex, ey, hex, 0.5);
              this.tweens.add({ targets: g, alpha: 0, duration: slow(160), onComplete: () => { g.destroy(); resolve(); } });
            },
          });
        },
      });
    });
  }

  /** A huge maw bursts out of the ground under the target, snaps shut around it and sinks back with it. */
  private maw(target: CombatantView): Promise<void> {
    const x = target.container.x;
    const y = target.container.y;
    const w = target.w * 1.7;
    const h = target.h * 1.05;
    const hole = this.add.ellipse(x, y - 2, 12, 5, 0x000000, 0.9).setDepth(y + 1);
    const gullet = this.add.rectangle(x, y - h * 0.5, w * 0.86, h, 0x3a0710, 0.92).setDepth(y - 1).setScale(1, 0.05);
    const makeJaw = (up: boolean) => {
      const g = this.add.graphics();
      g.fillStyle(0xa0182e).fillRoundedRect(-w / 2, up ? -34 : 0, w, 34, 12);
      g.fillStyle(0xf4ede1);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const tx = -w / 2 + (w / n) * (i + 0.5);
        if (up) g.fillTriangle(tx - 11, 0, tx + 11, 0, tx, 26);
        else g.fillTriangle(tx - 11, 0, tx + 11, 0, tx, -26);
      }
      return g;
    };
    const upper = makeJaw(true);
    const lower = makeJaw(false);
    const jaws = this.add.container(x, y, [upper, lower]).setDepth(y + 2);
    upper.y = -20;
    lower.y = 70;
    jaws.setAlpha(0);
    return new Promise((resolve) => {
      this.tweens.add({ targets: hole, scaleX: (w / 12) * 1.1, scaleY: 2.6, duration: slow(150) });
      this.tweens.add({ targets: gullet, scaleY: 1, duration: slow(260), delay: slow(90) });
      this.tweens.add({ targets: jaws, alpha: 1, duration: slow(90), delay: slow(90) });
      this.tweens.add({ targets: lower, y: 0, duration: slow(240), delay: slow(90), ease: 'Back.easeOut' });
      this.tweens.add({
        targets: upper,
        y: -h,
        duration: slow(260),
        delay: slow(90),
        ease: 'Back.easeOut',
        onComplete: () => {
          // snap shut around the target
          this.tweens.add({
            targets: upper,
            y: -2,
            duration: slow(130),
            delay: slow(130),
            ease: 'Quad.easeIn',
            onComplete: () => {
              this.cameras.main.shake(150, 0.004);
              target.container.setAlpha(0);
              this.tweens.add({ targets: gullet, scaleY: 0.05, duration: slow(120) });
              this.tweens.add({
                targets: jaws,
                y: y + h * 0.9,
                alpha: 0,
                duration: slow(260),
                delay: slow(160),
                ease: 'Quad.easeIn',
                onComplete: () => {
                  target.container.setAlpha(1);
                  hole.destroy();
                  gullet.destroy();
                  jaws.destroy();
                  resolve();
                },
              });
            },
          });
        },
      });
    });
  }

  /** A projectile flying from the caster to the target. */
  private fly(from: CombatantView, to: CombatantView, skill: SkillDef): Promise<void> {
    const midY = -from.h / 2;
    const orb = this.add
      .circle(from.container.x, from.container.y + midY, skill.motion === 'ranged' ? 10 : 22, color(skill.fx))
      .setStrokeStyle(4, 0xffffff)
      .setDepth(4300);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: orb,
        x: to.container.x,
        y: to.container.y + midY,
        duration: slow(260),
        ease: 'Quad.easeIn',
        onComplete: () => {
          orb.destroy();
          resolve();
        },
      });
    });
  }

  /** Arrows, ice shards or a meteor falling from above the screen onto the target. */
  /** Ground effects (poison, burning ground...): flat tiles on the covered cells that stay until the effect ends. */
  private addGroundView(e: { id: string; ground: string; board: 'party' | 'enemy'; slots: number[]; turns: number }): void {
    const def = content.grounds[e.ground];
    const hex = color(def?.color ?? '#ffffff');
    // Holy Fire / Poison / Burning: zeminin bırakıldığı hücrelerin karesini kenarlarına kadar dolduran yumuşak, yarı saydam dolgu (vfx.groundArea);
    // hafif nefes alma efektin içinde (yalnız dolgu, abartısız), burada ayrıca alfa titreşimi yok
    const area = groundArea(this, e.ground, e.board, e.slots, 120);
    if (area) {
      this.groundViews.set(e.id, area);
      return;
    }
    const items: Phaser.GameObjects.GameObject[] = [];
    for (const slot of e.slots) {
      const q = this.cellPos(e.board, slot);
      items.push(this.add.ellipse(q.x, q.y - 4, 124, 46, hex, 0.28).setStrokeStyle(3, hex, 0.85), this.add.ellipse(q.x, q.y - 4, 70, 26, hex, 0.3));
    }
    const container = this.add.container(0, 0, items).setDepth(30);
    this.tweens.add({ targets: container, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.groundViews.set(e.id, container);
  }

  /** Telgraf göstergesi: Span çatlak plakaları, Fall (+ Keystone'lar), Ash Brand (damgalının göğsünde işaret + artı hücreleri). */
  private showTelegraph(id: string, skillId: string, kind: 'area' | 'brand', board: 'party' | 'enemy', cells: number[], safe?: number[], bound?: string): void {
    const vk: 'span' | 'fall' | 'brand' = kind === 'brand' ? 'brand' : content.skills[skillId]?.telegraph?.wholeBoard ? 'fall' : 'span';
    this.clearTelegraph(id);
    const entry: { cells?: { destroy(): void }; mark?: { destroy(): void }; kind: 'span' | 'fall' | 'brand' } = { kind: vk };
    try {
      entry.cells = wardenTelegraphCells(this, vk, board, cells.filter((c) => !safe?.includes(c)), safe ?? []);
      const v = bound ? this.views.get(bound) : undefined;
      if (v) entry.mark = wardenBrandMark(this, v);
    } catch (err) {
      console.warn('[warden] telgraf göstergesi çizilemedi', err);
    }
    this.telegraphViews.set(id, entry);
  }

  private clearTelegraph(id: string): void {
    const t = this.telegraphViews.get(id);
    if (!t) return;
    t.cells?.destroy();
    t.mark?.destroy();
    this.telegraphViews.delete(id);
  }

  /** Damgalı birim hareket edince (Move, Chain Hook) damganın artı hücreleri yeni hücresine taşınır. */
  private refreshBrandCells(uid: string): void {
    for (const t of this.battle.telegraphs) {
      const view = t.bound === uid ? this.telegraphViews.get(t.id) : undefined;
      if (!view) continue;
      view.cells?.destroy();
      try {
        view.cells = wardenTelegraphCells(this, 'brand', t.board, this.battle.telegraphCells(t));
      } catch {
        view.cells = undefined;
      }
    }
  }

  /** Warden olay efekti (vfx.ts > WARDEN_EVENT_FX): VfxCtx board = vurulan tahta, slots = hücreler, targets = vurulan birimler. Hata savaşı durdurmaz. */
  private async runWardenFx(key: string, o: { actor: CombatantView | undefined; targets: CombatantView[]; board?: 'party' | 'enemy'; slots?: number[]; event: BattleEvent; skillId: string }): Promise<void> {
    const fx = WARDEN_EVENT_FX[key];
    const actor = o.actor ?? o.targets[0];
    const skill = content.skills[o.skillId];
    if (!fx || !actor || !skill) return;
    const board = o.board ?? (o.targets[0] ?? actor).combatant.board;
    const ctx: VfxCtx = {
      scene: this,
      actor,
      targets: o.targets,
      skill,
      board,
      cells: (o.slots ?? []).map((sl) => this.cellPos(board, sl)),
      slots: o.slots ?? [],
      releaseStage: () => undefined,
      lunge: () => meleeApproach(this, actor, o.targets),
      windUp: (hex, anim = 'cast') => actor.windUp(hex, anim),
      sfx: (id) => playSfx(this, id, SHARED_KEY),
      gate: () => undefined,
      foes: [...this.views.values()].filter((v) => v.combatant.side !== actor.combatant.side && v.combatant.hp > 0),
      viewOf: (uid) => this.views.get(uid),
      event: o.event,
    };
    try {
      await fx(ctx);
    } catch (err) {
      console.warn(`[warden] ${key} efekti hata verdi`, err);
    }
  }

  private removeGroundView(id: string): void {
    const c = this.groundViews.get(id);
    if (!c) return;
    this.tweens.killTweensOf(c);
    this.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() });
    this.groundViews.delete(id);
  }

  private skyFall(spot: { x: number; y: number; w: number }, skill: SkillDef, big = false): Promise<void> {
    const kind = skill.skyFx ?? 'arrows';
    const hex = color(skill.fx);
    const cx = spot.x;
    const landY = spot.y;
    if (kind === 'light') {
      // A beam of light falling from above (big: a wide pillar over a whole area)
      const bw = big ? 230 : 90;
      const h = landY + 120;
      const beam = this.add.rectangle(cx, landY - h / 2 + 40, bw, h, hex, 0.55).setDepth(4300).setScale(0.15, 1);
      const core = this.add.rectangle(cx, landY - h / 2 + 40, bw * 0.38, h, 0xffffff, 0.9).setDepth(4301).setScale(0.15, 1);
      return new Promise((resolve) => {
        this.tweens.add({
          targets: [beam, core],
          scaleX: 1,
          duration: slow(big ? 260 : 180),
          ease: 'Quad.easeOut',
          onComplete: () => {
            this.impact(cx, landY, hex, big ? 1.8 : 1);
            this.tweens.add({ targets: [beam, core], alpha: 0, scaleX: 0.3, duration: slow(300), onComplete: () => { beam.destroy(); core.destroy(); resolve(); } });
          },
        });
      });
    }
    const count = kind === 'meteor' || kind === 'fist' ? 1 : kind === 'arrows' ? 7 : 10;
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      const single = kind === 'meteor' || kind === 'fist';
      const offset = single ? 0 : Phaser.Math.Between(-spot.w * 0.5, spot.w * 0.5);
      const endX = cx + offset;
      const endY = landY + (single ? 0 : Phaser.Math.Between(-45, 45));
      const startX = kind === 'meteor' ? cx - (big ? 520 : 340) : endX + (kind === 'shards' ? Phaser.Math.Between(-60, 60) : kind === 'void' ? Phaser.Math.Between(-30, 30) : 0);
      const startY = kind === 'fist' ? -160 : -90;
      let item: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth;
      if (kind === 'arrows') {
        item = this.add.rectangle(startX, startY, 7, 58, hex).setStrokeStyle(2, 0x5a3e2b);
      } else if (kind === 'void') {
        const orb = this.add.circle(startX, startY, 18, hex, 0.9).setStrokeStyle(4, 0xffffff);
        item = orb;
      } else if (kind === 'fist') {
        // A huge fist: a block with four knuckles and a thumb
        const palm = this.add.rectangle(0, 0, 96, 84, hex).setStrokeStyle(6, 0x3a2a10);
        const knuckles = [-36, -12, 12, 36].map((kx) => this.add.circle(kx, 40, 16, hex).setStrokeStyle(5, 0x3a2a10));
        const thumb = this.add.ellipse(-52, 4, 30, 54, hex).setStrokeStyle(5, 0x3a2a10);
        const fist = this.add.container(startX, startY, [thumb, palm, ...knuckles]);
        fist.setScale(1.5);
        item = fist;
      } else if (kind === 'shards') {
        const shard = this.add.triangle(startX, startY, 0, 0, 16, 0, 8, 36, hex).setStrokeStyle(2, 0xffffff);
        shard.rotation = Phaser.Math.FloatBetween(-0.25, 0.25) + Math.atan2(endY - startY, endX - startX) - Math.PI / 2;
        item = shard;
      } else {
        // meteor (big: one huge meteor on the chosen area)
        const tail = this.add.triangle(0, 0, 0, 0, big ? -300 : -150, big ? -50 : -26, big ? -300 : -150, big ? 50 : 26, hex, 0.55);
        const core = this.add.circle(0, 0, big ? 78 : 40, hex).setStrokeStyle(big ? 9 : 6, 0xffffff);
        const meteor = this.add.container(startX, startY, [tail, core]);
        meteor.rotation = Math.atan2(endY - startY, endX - startX);
        item = meteor;
      }
      item.setDepth(4300);
      jobs.push(
        new Promise((resolve) => {
          this.tweens.add({
            targets: item,
            x: endX,
            y: endY,
            delay: slow(i * 70),
            duration: slow(kind === 'meteor' ? (big ? 620 : 480) : kind === 'fist' ? 420 : 340),
            ease: 'Quad.easeIn',
            onComplete: () => {
              item.destroy();
              this.impact(endX, endY, hex, kind === 'meteor' ? (big ? 2 : 1) : kind === 'fist' ? 1.2 : 0.35);
              resolve();
            },
          });
        }),
      );
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /** A short burst where a falling object lands. */
  private impact(x: number, y: number, hex: number, size: number): void {
    const burst = this.add.circle(x, y, 40 * size + 10, hex, 0.8).setStrokeStyle(4, 0xffffff).setDepth(4350);
    this.tweens.add({
      targets: burst,
      scale: 2.4,
      alpha: 0,
      duration: slow(260 + 200 * size),
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
    if (size >= 1) this.cameras.main.shake(180, 0.004);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  // --- Drawing ---

  private drawBackground(id: string): void {
    if (hasBackground(this, id)) {
      const img = this.add.image(W / 2, H / 2, backgroundKey(id));
      // Cover the screen (overflowing edges are cropped)
      img.setScale(Math.max(W / img.width, H / img.height));
    } else {
      this.cameras.main.setBackgroundColor(colors.fallbackBackground);
    }
  }

  /** The avatar: the head of a unit (cropped from its sprite). Used by the turn bar and the bottom-left stats block. */
  private avatarImage(unit: Combatant, cx: number, cy: number, size: number): Phaser.GameObjects.Image {
    const headKey = avatarTexture(this, unit.spriteId);
    if (headKey) {
      // Dedicated head avatar (assets/avatars/<id>.png, square, faces right); enemies are mirrored like their sprites
      const head = this.add.image(cx, cy, headKey);
      head.setScale(size / head.width);
      if (unit.side === 'enemy') head.setFlipX(true);
      return head;
    }
    const view = this.views.get(unit.uid);
    const tex = view ? { key: view.sprite.texture.key, frame: view.sprite.frame.name } : { key: characterTexture(this, unit.spriteId, unit.color).key, frame: '__BASE' };
    const img = this.add.image(cx, cy, tex.key, tex.frame);
    const fw = img.frame.width;
    const fh = img.frame.height;
    const cw = fw * 0.72;
    const ch = Math.min(fh * 0.34, cw);
    const cropX = (fw - cw) / 2;
    const cropY = fh * 0.03;
    img.setCrop(cropX, cropY, cw, ch);
    img.setOrigin((cropX + cw / 2) / fw, (cropY + ch / 2) / fh);
    img.setScale(size / Math.max(cw, ch));
    if (unit.side === 'enemy') img.setFlipX(true);
    return img;
  }

  /** Turn order bar: the current unit first, then the next ones (mini portraits). */
  private renderTurnBar(queue: string[]): void {
    this.lastQueue = queue;
    this.turnBarLayer?.destroy();
    const { y, cellSize, gap } = layout.turnBar;
    const pastCells = layout.turnBar.pastCells;
    const cells = pastCells + layout.turnBar.cells; // past ones on the left, the current unit in the middle, upcoming ones on the right
    const total = cells * cellSize + (cells - 1) * gap;
    const x = (W - total) / 2;
    const items: Phaser.GameObjects.GameObject[] = [];
    // Carved plaque behind the whole order bar
    items.push(...makePanel(this, x - 22, y - 12, total + 44, cellSize + 52, { top: 0x261c13, bottom: 0x0e0906, bevel: 3, grain: 0.6, alpha: 0.93 }));

    if (this.battle?.mode === 'test') {
      items.push(
        this.add.rectangle(W / 2, y + cellSize / 2, total, cellSize, 0x000000, 0.55).setStrokeStyle(4, color(colors.targetHighlight)),
        this.add
          .text(W / 2, y + cellSize / 2, 'TEST MODE  -  no turn order, any unit can act', textStyle(34, colors.targetHighlight))
          .setOrigin(0.5),
      );
    } else {
      const past = this.playedUids.slice(-pastCells);
      for (let i = 0; i < cells; i++) {
        const cx = x + i * (cellSize + gap);
        const isNow = i === pastCells;
        const isPast = i < pastCells;
        const uid = isPast ? past[past.length - (pastCells - i)] : queue[i - pastCells];
        const unit = uid ? this.battle.get(uid) : undefined;
        const border = isNow ? colors.targetHighlight : unit?.side === 'party' ? colors.partySlot : colors.enemySlot;
        const cell = this.add.graphics();
        gradientRect(cell, cx, y, cellSize, cellSize, 0x2c2218, 0x0c0806);
        items.push(cell);
        const view = unit ? this.views.get(unit.uid) : undefined;
        if (view && unit) {
          // Avatar (head only) of the unit; units that already played this round are faded
          const head = this.avatarImage(unit, cx + cellSize / 2, y + cellSize / 2, cellSize - 10);
          const r = 17;
          const badge = [
            this.add.circle(cx + cellSize - r + 2, y + cellSize - r + 2, r, 0x000000, 0.8).setStrokeStyle(2, color(unit.color)),
            this.add.image(cx + cellSize - r + 2, y + cellSize - r + 2, ensureIcon(this, unit.logo, unit.color, false, ownerOfUnit(unit.defId))).setDisplaySize(r * 1.4, r * 1.4),
          ];
          if (isPast) {
            head.setAlpha(0.38).setTint(0x8a8a8a);
            for (const b of badge) b.setAlpha(0.45);
          }
          items.push(head, ...badge);
        }
        // Frame on top of the portrait: bronze edge; the inner line shows the side (blue ally, red enemy), gold for the current unit.
        // Elite / boss (sefer): the inner line is the rank color (gold / crimson) with a small rank tag on the top edge.
        const tier = tierStyle(unit?.tier);
        const fr = this.add.graphics();
        if (isNow) glowRect(fr, cx, y, cellSize, cellSize, GOLD.bright, 0.8, 7);
        frameRect(fr, cx, y, cellSize, cellSize, { edge: isNow ? GOLD.bright : GOLD.dark, light: color(tier ? tier.hex : border), bevel: 3, shadow: 0.3, alpha: isPast ? 0.5 : 1 });
        if (tier && !isPast) fr.lineStyle(3, color(tier.hex), 0.95).strokeRect(cx + 5, y + 5, cellSize - 10, cellSize - 10);
        items.push(fr);
        if (unit && tier) items.push(...this.miniTag(cx + cellSize / 2, y + 2, tier.label, tier.hex, isPast));
        // Tur başına birden çok eylem (actionsPerTurn): sol altta "x2"; şu an ek eylemindeyse ortadaki hücrede "2nd"
        const actions = unit?.actionsPerTurn ?? 1;
        if (unit && actions > 1) items.push(...this.miniTag(cx + 18, y + cellSize - 14, isNow && this.extraAction ? '2nd' : `x${actions}`, '#ffe29a', isPast));
        if (isNow && unit) {
          // Small gold arrow under the current unit, pointing up at it
          const ax = cx + cellSize / 2;
          const ay = y + cellSize + 8;
          items.push(this.add.triangle(0, 0, ax - 14, ay + 18, ax + 14, ay + 18, ax, ay, GOLD.bright).setOrigin(0, 0).setStrokeStyle(2, 0x0c0805));
        }
      }
    }
    this.turnBarLayer = this.add.container(0, 0, items).setDepth(4000);
  }

  /** Small pill label on the turn bar (rank tag, extra actions). */
  private miniTag(cx: number, cy: number, text: string, hex: string, faded = false): Phaser.GameObjects.GameObject[] {
    const label = this.add.text(cx, cy, text, { fontFamily: layout.fontFamily, fontSize: '13px', fontStyle: 'bold', color: '#1a0f08' }).setOrigin(0.5);
    const bg = this.add.rectangle(cx, cy, label.width + 10, label.height + 2, color(hex)).setStrokeStyle(2, 0x1a0f08);
    if (faded) for (const o of [label, bg]) o.setAlpha(0.5);
    return [bg, label];
  }

  /** A short banner under the turn bar: who used what. */
  private announce(text: string): void {
    this.announceLayer?.destroy();
    const label = this.add.text(W / 2, 168, text, textStyle(40)).setOrigin(0.5);
    const bg = this.add.rectangle(W / 2, 168, label.width + 70, 66, 0x000000, 0.6).setStrokeStyle(3, color(colors.turnCell));
    const layer = this.add.container(0, 0, [bg, label]).setDepth(4100);
    this.announceLayer = layer;
    this.tweens.add({
      targets: layer,
      alpha: 0,
      delay: slow(layout.animation.announceMs),
      duration: 300,
      onComplete: () => layer.destroy(),
    });
  }

  private drawSlots(): void {
    const { width: cw, height: ch } = layout.spriteBox;
    const g = this.add.graphics();
    const labels: Phaser.GameObjects.Text[] = [];
    const draw = (slots: { x: number; y: number }[], hexColor: string, prefix: string) =>
      slots.forEach((s, i) => {
        g.lineStyle(4, color(hexColor), 0.8).strokeRect(s.x - cw / 2, s.y - ch, cw, ch);
        labels.push(this.add.text(s.x, s.y - ch / 2, `${prefix}${i + 1}`, textStyle(32, hexColor)).setOrigin(0.5));
      });
    draw(layout.partySlots, colors.partySlot, 'P');
    draw(layout.enemySlots, colors.enemySlot, 'E');
    this.slotLayer = this.add.container(0, 0, [g, ...labels]).setDepth(3000).setVisible(this.showSlots);
  }

  private addView(c: Combatant): CombatantView | undefined {
    const slots = c.board === 'party' ? layout.partySlots : layout.enemySlots; // units summoned onto the enemy board stand there
    const slot = slots[c.slot];
    if (!slot) return undefined;
    const view = new CombatantView(this, c, slot.x, slot.y);
    view.makeTappable(
      (p?: Phaser.Input.Pointer) => {
        if (!p || !this.isSelectGesture(p)) this.onCombatantTap(view);
      },
      () => this.onUnitOver(view),
      () => this.onUnitOut(view),
    );
    this.views.set(c.uid, view);
    if (this.unitSel.has(c.uid)) view.setSelected(true);
    return view;
  }

  private drawCommandPanel(): void {
    const p = layout.commandPanel;
    // Dark leather/stone slab with a carved gold edge on top
    const bg = this.add.graphics().setDepth(4500);
    gradientRect(bg, 0, p.y, W, H - p.y, 0x2a1f16, 0x0d0906, 0.96);
    this.add.tileSprite(0, p.y, W, H - p.y, ensureGrain(this)).setOrigin(0, 0).setAlpha(0.8).setDepth(4500);
    const edge = this.add.graphics().setDepth(4500);
    edge.fillStyle(0x050302, 1).fillRect(0, p.y - 2, W, 2);
    edge.fillStyle(GOLD.edge, 1).fillRect(0, p.y, W, 3);
    edge.fillStyle(GOLD.light, 0.85).fillRect(0, p.y + 3, W, 1);
    edge.fillStyle(0x000000, 0.45).fillRect(0, p.y + 4, W, 5);
    edge.fillStyle(0x000000, 0.2).fillRect(0, p.y + 9, W, 6);
    edge.fillStyle(GOLD.dark, 0.9).fillRect(0, H - 3, W, 3);
    // Vertical gold dividers between the stats block, the skills and the info plaque
    for (const dx of [this.skillsLeft() - 104, this.globalX() - 7, this.infoTipX() - 7]) {
      edge.fillGradientStyle(GOLD.edge, GOLD.edge, GOLD.dark, GOLD.dark, 0.9).fillRect(dx, p.y + 12, 2, H - p.y - 24);
    }
    this.refreshCommands();
  }

  /** Debug: redraw the bottom bar (e.g. after toggling free MP). */
  refreshCommandsNow(): void {
    this.refreshCommands();
  }

  private refreshCommands(): void {
    this.commandLayer?.destroy();
    this.hideInfoTip();
    this.ensureSelection();
    const p = layout.commandPanel;
    const actor = this.activeActor;
    for (const v of this.views.values()) v.setActive(v.combatant.uid === actor?.uid && !this.battle.winner);

    const items: Phaser.GameObjects.GameObject[] = [];
    if (actor) {
      items.push(...this.drawStatsBlock(actor));
      const label = this.add.text(W / 2, p.y - 8, this.turnLabel(actor), { fontFamily: SERIF, fontSize: '24px', fontStyle: 'bold', color: colors.turnCell, stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0.5, 1);
      const plaque = this.add.graphics();
      const pw = label.width + 70;
      gradientRect(plaque, W / 2 - pw / 2, p.y - 42, pw, 40, 0x2a1f16, 0x120c08, 0.96);
      frameRect(plaque, W / 2 - pw / 2, p.y - 42, pw, 40, { bevel: 3, shadow: 0.25 });
      items.push(plaque, label);
      let x = this.skillsLeft();
      const hasRage = actor.maxRage !== undefined;
      const btnY = p.y + (H - p.y - p.buttonHeight) / 2;
      const btnH = hasRage ? p.buttonHeight - 18 : p.buttonHeight; // Rage classes: the buttons give up 18px so the Rage bar fits under the 4th
      this.rageBar = undefined;
      for (const [idx, skillId] of actor.skills.entries()) {
        const skill = content.skills[skillId];
        if (!skill) continue;
        const enabled = this.playerCanAct && this.battle.canUse(actor.uid, skillId).ok;
        items.push(...this.skillButton(x, btnY, actor, skill, enabled, idx === 3, idx + 1, btnH));
        if (hasRage && idx === 3) items.push(...this.rageBarItems(actor, x, btnY + btnH + 6, p.buttonWidth));
        x += p.buttonWidth + p.gap;
      }
      if (!actor.summoned) items.push(...this.globalButtons(actor)); // summons never use global actions
      else this.globalItems = [];
      if (actor.passive) items.push(...this.passiveBadge(this.skillsLeft() - 92, p.y + (H - p.y) / 2, actor));
    }
    this.commandLayer = this.add.container(0, 0, items).setDepth(4600);
  }

  /** The class passive: a round badge just left of the skill buttons (not clickable; hover explains it). */
  private passiveBadge(x: number, cy: number, actor: Combatant): Phaser.GameObjects.GameObject[] {
    const passive = actor.passive!;
    const r = 36;
    const bg = this.add.circle(x + r, cy - 8, r, color(colors.button)).setStrokeStyle(4, color(colors.tooltipBorder));
    const icon = this.add.image(x + r, cy - 8, ensureIcon(this, passive.icon, actor.color, false, ownerOfUnit(actor.defId))).setDisplaySize(44, 44);
    const caption = this.add.text(x + r, cy + r - 2, 'PASSIVE', textStyle(14, colors.muted)).setOrigin(0.5, 0);
    bg.setInteractive();
    bg.on('pointerover', () => this.showPassiveTip(actor));
    bg.on('pointerout', () => this.hideInfoTip());
    return [bg, icon, caption];
  }

  private showPassiveTip(actor: Combatant): void {
    this.hideInfoTip();
    const passive = actor.passive;
    if (!passive) return;
    this.placeInfoTip(this.makeInfo(passive.name, colors.targetHighlight, ensureIcon(this, passive.icon, actor.color, false, ownerOfUnit(actor.defId)), [[describePassive(passive, actor.stats, content.formulas)]], 'Passive'));
  }

  /**
   * Left part of the bottom bar, three columns. 1: the avatar (1:1 head portrait) with class logo + name, HP and MP written on it.
   * 2: the 4 primary attributes (the primary one in gold; its bonus name and text show only in the hover tooltip).
   * 3: derived stats (speed, crit, armor). Every stat explains itself on hover.
   */
  private drawStatsBlock(actor: Combatant, x0: number = layout.commandPanel.padding): Phaser.GameObjects.GameObject[] {
    const p = layout.commandPanel;
    const items: Phaser.GameObjects.GameObject[] = [];
    const s = this.battle.effectiveStats(actor); // armor includes auras (Bulwark Aura)
    const top = p.y;
    const enemy = actor.side === 'enemy';

    // --- Column 1: the avatar (1:1, the unit's head, same look as the turn bar). Name/logo, HP and MP are written on top of it, no backing plates ---
    const av = 142;
    const avX = x0;
    const avY = top + (H - top - av) / 2;
    const frame = this.add.graphics();
    gradientRect(frame, avX, avY, av, av, 0x33261a, 0x120c08);
    items.push(frame);
    const face = this.avatarImage(actor, avX + av / 2, avY + av / 2, av);
    items.push(face);
    // Info layout switch: data/battle-layout.json > commandPanel.avatarInfoStyle ("overlayCompact" = default thin text/bars at the edges, "overlayClassic" = old bigger text + thick bars)
    const compact = (p as { avatarInfoStyle?: string }).avatarInfoStyle !== 'overlayClassic';
    if (compact) {
      const shade = this.add.graphics(); // very thin top/bottom darkening for legibility (gradient, not a plate)
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0.45, 0, 0).fillRect(avX, avY, av, 22);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.5, 0.5).fillRect(avX, avY + av - 26, av, 26);
      items.push(shade);
      const frameEdge = this.add.graphics();
      frameRect(frameEdge, avX, avY, av, av, { bevel: 3, shadow: 0.2 });
      items.push(frameEdge);

      const nameY = avY + 11;
      const logo = this.add.image(avX + 11, nameY, ensureIcon(this, actor.logo, actor.color, false, ownerOfUnit(actor.defId))).setDisplaySize(15, 15);
      const nameText = this.add.text(avX + 22, nameY, unitName(actor), { fontFamily: SERIF, fontSize: '15px', fontStyle: 'bold', color: tierStyle(actor.tier)?.hex ?? (enemy ? colors.hpFillEnemy : '#f6e7c4'), stroke: '#0c0805', strokeThickness: 3 }).setOrigin(0, 0.5);
      if (nameText.width > av - 28) nameText.setScale((av - 28) / nameText.width);
      items.push(logo, nameText);

      // HP bottom-left, MP bottom-right, one text row; thin bars on the very bottom edge (inside the frame bevel)
      const half = (av - 6) / 2;
      const yBar = avY + av - 7;
      const yText = avY + av - 16;
      const part = (kind: 'hp' | 'mp', x: number, value: number, max: number, fill: string, right: boolean) => {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.75).fillRect(x, yBar, half - 2, 4);
        if (max > 0) g.fillStyle(color(fill), 1).fillRect(x, yBar, (half - 2) * Math.max(0, Math.min(1, value / max)), 4);
        const label = this.add.text(right ? x + half - 4 : x + 14, yText, `${value}/${max}`, textStyle(13)).setOrigin(right ? 1 : 0, 0.5);
        const iconX = right ? x + half - 4 - label.width - 8 : x + 6;
        items.push(g, this.add.image(iconX, yText, ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false)).setDisplaySize(11, 11), label, this.statHit(x - 2, yText - 9, half, 20, kind, actor));
      };
      part('hp', avX + 4, actor.hp, actor.maxHp, enemy ? colors.hpFillEnemy : colors.hpFill, false);
      part('mp', avX + 4 + half + 2, actor.mp, actor.maxMp, colors.mpFill, true);
    } else {
      const shade = this.add.graphics(); // soft bottom/top darkening for legibility (gradient, not a plate)
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0).fillRect(avX, avY, av, 34);
      shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.6, 0.6).fillRect(avX, avY + av - 62, av, 62);
      items.push(shade);
      const frameEdge = this.add.graphics();
      frameRect(frameEdge, avX, avY, av, av, { bevel: 3, shadow: 0.2 });
      items.push(frameEdge);

      const nameY = avY + 17;
      const logo = this.add.image(avX + 18, nameY, ensureIcon(this, actor.logo, actor.color, false, ownerOfUnit(actor.defId))).setDisplaySize(24, 24);
      const nameText = this.add.text(avX + 34, nameY, unitName(actor), { fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: tierStyle(actor.tier)?.hex ?? (enemy ? colors.hpFillEnemy : '#f6e7c4'), stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0, 0.5);
      if (nameText.width > av - 40) nameText.setScale((av - 40) / nameText.width);
      items.push(logo, nameText);

      const bar = (kind: 'hp' | 'mp', yText: number, value: number, max: number, fill: string) => {
        const h = 8;
        const yBar = yText + 11;
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.7).fillRect(avX + 6, yBar - 1, av - 12, h + 2);
        g.fillStyle(color(colors.hpBack), 0.9).fillRect(avX + 7, yBar, av - 14, h);
        if (max > 0) g.fillStyle(color(fill), 1).fillRect(avX + 7, yBar, (av - 14) * Math.max(0, Math.min(1, value / max)), h);
        const label = this.add.text(avX + 26, yText, `${value}/${max}`, textStyle(17)).setOrigin(0, 0.5);
        items.push(
          g,
          this.add.image(avX + 15, yText, ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false)).setDisplaySize(16, 16),
          label,
          this.statHit(avX + 4, yText - 11, av - 8, 25, kind, actor),
        );
      };
      bar('hp', avY + av - 52, actor.hp, actor.maxHp, enemy ? colors.hpFillEnemy : colors.hpFill);
      bar('mp', avY + av - 24, actor.mp, actor.maxMp, colors.mpFill);

    }

    // --- Columns 2-4: stat rows (2: main attributes, 3: ATTACK stats, 4: DEFENSE stats) ---
    const column = (kinds: StatKind[], x: number, y0: number, step: number, icon: number, font: number, w: number) =>
      kinds.forEach((k, i) => {
        const cy = y0 + i * step;
        if (i < kinds.length - 1) {
          const hl = this.add.graphics();
          hl.fillStyle(GOLD.edge, 0.22).fillRect(x, cy + step / 2, w - 8, 1);
          items.push(hl);
        }
        // ACC / EVA with a status on them (Blinded, Shrouded): reddish when lowered, greenish when raised, with a small arrow
        const dir = isDeltaStat(k) ? statDir(actor.stats[k], s[k]) : null;
        const tint = dir === 'down' ? '#ff9a8a' : dir === 'up' ? '#9ee6a8' : undefined;
        const label = this.add.text(x + icon + 6, cy, this.statText(k, s), textStyle(font, tint ?? (s.primary === k ? PRIMARY_GOLD : undefined))).setOrigin(0, 0.5);
        items.push(this.add.image(x + icon / 2, cy, ensureIcon(this, STAT_ICON[k], STAT_COLOR[k], false)).setDisplaySize(icon, icon), label);
        if (dir) {
          const ax = label.x + label.width + 9;
          const hh = Math.round(font * 0.32);
          const arrow = this.add.triangle(ax, cy, 0, dir === 'up' ? hh * 2 : 0, hh * 2, dir === 'up' ? hh * 2 : 0, hh, dir === 'up' ? 0 : hh * 2, color(tint!)).setStrokeStyle(2, 0x0c0805).setOrigin(0.5);
          items.push(arrow);
        }
        items.push(this.statHit(x - 2, cy - step / 2, w, step, k, actor));
      });
    const m = statBlockMetrics(x0);
    column(MAIN_STATS, m.mainX, top + 36, 32, 24, 22, m.mainW);
    // Attack and defense columns share the same top/bottom; rows are spread evenly (4 attack rows, 5 defense rows), at least 16px text
    const sTop = top + 12;
    const sH = H - top - 24;
    const rowsOf = (kinds: StatKind[]) => rowCenters(kinds.length, sTop, sH);
    const atkRows = rowsOf(ATTACK_STATS);
    const defRows = rowsOf(DEFENSE_STATS);
    column(ATTACK_STATS, m.attackX, atkRows[0]!, atkRows[1]! - atkRows[0]!, 20, 17, m.attackW);
    column(DEFENSE_STATS, m.defenseX, defRows[0]!, defRows[1]! - defRows[0]!, 20, 17, m.defenseW);
    return items;
  }

  private statText(k: StatKind, s: Combatant['stats']): string {
    return statRowText(k, s, STAT_LABEL);
  }

  /** An invisible hover area that explains a stat in the tooltip space. */
  private statHit(x: number, y: number, w: number, h: number, kind: StatKind, actor: Combatant): Phaser.GameObjects.Rectangle {
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0);
    if (!this.statHitsOn) return zone; // hover info of another unit: not interactive
    zone.setInteractive();
    zone.on('pointerover', () => this.showStatTip(kind, actor));
    zone.on('pointerout', () => this.hideInfoTip());
    return zone;
  }

  /** Under the skill name: cost (MP drop / HP heart icon) and cooldown (hourglass), or the remaining wait while cooling down. */
  private skillSubItems(actor: Combatant, skill: SkillDef, cx: number, cy: number, alpha: number): Phaser.GameObjects.GameObject[] {
    const turns = this.battle.mode === 'turns';
    const remaining = turns ? (actor.cooldowns[skill.id] ?? 0) : 0;
    const parts: Array<{ icon?: string; text: string; hex: string; px?: number }> = [];
    const hourglass = ensureIcon(this, UI_ICON.hourglass, UI_COLOR, false);
    if (remaining > 0) parts.push({ icon: hourglass, text: String(remaining), hex: colors.targetHighlight });
    else {
      const costNow = skillCostAmount(skill.cost, actor); // proportional costs (Wail of the Dead) show the real amount for the current resource
      if (costNow > 0 && skill.cost.resource === 'rage') {
        parts.push({ icon: ensureIcon(this, RAGE_ICON, RAGE_COLOR, false), text: `RAGE ${costNow}`, hex: RAGE_COLOR, px: 15 });
      } else if (costNow > 0) {
        const kind = skill.cost.resource === 'mp' ? 'mp' : 'hp';
        parts.push({ icon: ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), text: String(costNow), hex: colors.text });
      }
      if (turns && (skill.cooldown ?? 0) > 0) parts.push({ icon: hourglass, text: String(skill.cooldown), hex: colors.muted });
    }
    const isz = 18;
    const texts = parts.map((pt) => this.add.text(0, cy, pt.text, textStyle(pt.px ?? 17, pt.hex)).setOrigin(0, 0.5));
    const gapBetween = parts.some((pt) => pt.px) ? 6 : 10; // Rage cost text is long: tighter spacing so it fits the button
    const total = parts.reduce((w, _pt, i) => w + isz + 3 + texts[i]!.width, 0) + Math.max(0, parts.length - 1) * gapBetween;
    let x = cx - total / 2;
    const out: Phaser.GameObjects.GameObject[] = [];
    parts.forEach((pt, i) => {
      out.push(this.add.image(x + isz / 2, cy, pt.icon!).setDisplaySize(isz, isz).setAlpha(alpha));
      texts[i]!.setPosition(x + isz + 3, cy).setAlpha(alpha);
      out.push(texts[i]!);
      x += isz + 3 + texts[i]!.width + gapBetween;
    });
    return out;
  }

  private turnLabel(actor: Combatant): string {
    if (this.battle.mode === 'test') return 'Test mode';
    if (this.mp) return actor.side === this.localSide ? (this.mp.canAct() ? 'Your turn' : 'Waiting for connection') : `${this.mp.names().remote}'s turn`;
    if (actor.side === 'enemy') return 'Enemy turn';
    return this.autoPlay ? 'Auto (AI)' : 'Your turn';
  }

  /** A compact skill button: icon, name and cost. Hovering shows details; disabled buttons still show them. */
  private skillButton(x: number, y: number, actor: Combatant, skill: SkillDef, enabled: boolean, ultimate = false, hotkey = 0, height?: number): Phaser.GameObjects.GameObject[] {
    const { buttonWidth: bw, buttonHeight: bhFull, iconSize } = layout.commandPanel;
    const bh = height ?? bhFull;
    const chosen = this.selected?.actor === actor.uid && this.selected.skill === skill.id && this.playerCanAct;
    const dim = enabled ? 1 : 0.45;
    // Carved frame: dark leather gradient, bronze/gold edge; the strong 4th skill is richer, the chosen one glows
    const frame = this.add.graphics();
    const paint = (pressed: boolean): void => {
      frame.clear();
      const hot = pressed || chosen;
      const [top, bottom] = hot ? [0x6e4f33, 0x2f2012] : ultimate ? [0x7a5a1c, 0x2e1d06] : [0x3b2b1d, 0x1a110b];
      const a = enabled ? 1 : 0.5;
      if (chosen) glowRect(frame, x, y, bw, bh, GOLD.bright, 0.9, 9);
      gradientRect(frame, x, y, bw, bh, top, bottom, a);
      if (ultimate) {
        frame.fillStyle(0xffe9a0, enabled ? 0.14 : 0.05).fillRect(x + 6, y + 6, bw - 12, bh * 0.34);
        frame.fillStyle(0x000000, 0.18).fillRect(x + 6, y + bh * 0.66, bw - 12, bh * 0.34 - 6);
      }
      frameRect(frame, x, y, bw, bh, { edge: chosen ? GOLD.bright : ultimate ? 0xc79a3e : GOLD.edge, light: chosen ? 0xfff0c0 : GOLD.light, alpha: a, bevel: 4 });
      cornerOrnaments(frame, x, y, bw, bh, ultimate || chosen ? 5 : 4, enabled ? 1 : 0.5);
    };
    paint(false);
    const bg = this.add.rectangle(x, y, bw, bh, 0x000000, 0.001).setOrigin(0, 0);
    const shine: Phaser.GameObjects.GameObject[] = [];
    const icon = this.add.image(x + bw / 2, y + 8 + iconSize / 2, ensureSkillIcon(this, skill)).setDisplaySize(iconSize, iconSize).setAlpha(dim);
    const name = this.add.text(x + bw / 2, y + 8 + iconSize + 16, skill.name, { fontFamily: SERIF, fontSize: '20px', fontStyle: 'bold', color: colors.text, stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0.5).setAlpha(enabled ? 1 : 0.6);
    if (name.width > bw - 10) name.setScale((bw - 10) / name.width); // long names must fit the button
    const sub = this.skillSubItems(actor, skill, x + bw / 2, y + bh - 16, enabled ? 1 : 0.6);
    bg.setInteractive({ useHandCursor: enabled });
    bg.on('pointerover', () => this.showSkillTip(actor, skill));
    bg.on('pointerout', () => {
      this.hideInfoTip();
      paint(false);
    });
    if (enabled) {
      bg.on('pointerdown', () => paint(true));
      bg.on('pointerup', () => {
        paint(false);
        this.onSkillClick(skill.id);
      });
    }
    // Hotkey hint in the top-left corner (keys 1-4)
    const key = hotkey > 0 ? this.add.text(x + 10, y + 6, String(hotkey), textStyle(18, colors.muted)).setOrigin(0, 0).setAlpha(enabled ? 0.9 : 0.5) : undefined;
    return [frame, bg, ...shine, icon, name, ...sub, ...(key ? [key] : [])];
  }

  /** Match record text (all moves so far, with AI reasons) and the move count; null if recording is off. Works mid-battle. */
  matchLogData(): { text: string; moves: number } | null {
    return this.matchLog ? { text: this.matchLog.serialize(), moves: this.matchLog.moveCount } : null;
  }

  /** End-of-battle screen (src/game/result-screen.ts). `preview` = debug: shows it without ending the battle. */
  showResult(victory: boolean, preview = false, mpInfo?: MpResultInfo): void {
    this.resultScreen?.destroy();
    const mp = this.mp && !preview ? this.mp : undefined;
    const info = mpInfo ?? (mp ? mp.result() : null);
    this.resultScreen = showResultScreen(this, {
      victory,
      ...(mp ? { localSide: this.localSide, headings: mp.names(), actions: mp.resultActions(), ...(info?.title ? { title: info.title } : {}), ...(info?.subtitle ? { subtitle: info.subtitle } : {}) } : {}),
      battle: this.battle,
      stats: this.stats,
      avatar: (unit, cx, cy, size) => this.avatarImage(unit, cx, cy, size),
      onNewGame: () => this.newGame(),
      onTeamSelect: () => this.goToTeamSelect(),
      matchData: () => this.matchLogData(),
      preview,
      ...(mp ? {} : { actions: this.campaign && !preview ? this.campaign.resultActions(victory, this.battle) : undefined }),
    });
  }
}
