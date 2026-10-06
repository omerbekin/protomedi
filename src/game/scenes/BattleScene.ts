import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { Battle, chooseAction, content, describePassive, describeSkill, describeStat, previewSkill, armorReduction } from '../../engine';
import type { BattleEvent, BattleMode, Combatant, SkillDef, StatKind, Teams, TargetPreview } from '../../engine';
import { PRIMARY_GOLD, STAT_COLOR, STAT_ICON, STAT_LABEL, UI_COLOR, UI_ICON } from '../../ui/stat-icons';
import { avatarTexture, backgroundKey, characterTexture, hasBackground, preloadAssets } from '../assets';
import { CombatantView, color, slow, textStyle } from '../combatant-view';
import { ensureIcon, ensureSkillIcon } from '../icons';
import { initialSeed, newSeed } from '../seed';
import { GOLD, SERIF, cornerOrnaments, ensureGrain, frameRect, glowRect, gradientRect, makeBadge, makePanel } from '../ui-frame';
import { playSfx } from '../audio';
import { debugState, effectiveTimeScale } from '../debug-state';
import { VFX, groundArea, meleeApproach, summonFx, thornReflectFx } from '../vfx';
import type { VfxKind } from '../../ui/vfx-kinds';

export interface BattleSceneData {
  seed: number;
  battleId: string;
  showSlots: boolean;
  mode: BattleMode;
  /** Takım seçim ekranından gelen takımlar; yoksa seed'e göre rastgele. */
  teams: Teams | undefined;
}

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
  private groundViews = new Map<string, Phaser.GameObjects.Container>();
  private badgeKeys = new Map<string, string>();
  private slotMarkers?: Phaser.GameObjects.Container;
  private hoverView?: CombatantView;
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

  constructor() {
    super(BattleScene.KEY);
  }

  init(data: Partial<BattleSceneData>): void {
    this.seed = data.seed ?? this.seed;
    this.battleId = data.battleId ?? this.battleId;
    this.showSlots = data.showSlots ?? this.showSlots;
    this.mode = data.mode ?? this.mode;
    if ('teams' in data) this.teams = data.teams;
    this.views = new Map();
    this.lastSkill = new Map();
    this.controlled = null;
    this.uiActor = null;
    this.playedUids = [];
    this.busy = false;
    this.selected = null;
    this.hoverView = undefined;
    this.infoTip = undefined;
    this.slotMarkers = undefined;
    this.areaMarker = undefined;
    this.groundViews = new Map();
    this.badgeKeys = new Map();
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
    this.drawBackground(def?.background ?? '');
    this.drawSlots();

    this.battle = new Battle(content.battleSetup(this.battleId, this.seed, this.mode, this.teams, false));
    this.battle.freeMp = BattleScene.freeMp;
    Object.assign(this.battle.debug, debugState.flags);
    this.applyDebugTiming();
    this.bindSkillHotkeys();
    for (const c of this.battle.combatants) this.addView(c);
    this.uiActor = this.battle.currentUid;
    this.renderTurnBar(this.battle.turnQueue());
    this.battle.on((e) => this.enqueue(e));

    this.hint = this.add.text(W / 2, layout.commandPanel.y - 60, '', textStyle(38, colors.selected)).setOrigin(0.5).setDepth(4400).setVisible(false);

    this.drawCommandPanel();
    this.settle(); // the first unit may be an enemy: let the AI start
  }

  /** Per-unit badge refresh (statuses, ground effects underfoot, armor from auras): cheap, only redraws when something changed. */
  private refreshBadges(): void {
    for (const view of this.views.values()) {
      const c = this.battle.get(view.combatant.uid);
      if (!c || c.hp <= 0) continue;
      const list: Array<{ icon: string; color: string; text: string; debuff: boolean; turns: boolean }> = [];
      for (const st of c.statuses) {
        const def = content.statuses[st.kind];
        const fallback = { taunt: ['finger', '#ff9f43'], guard: ['guardian', '#6ec1ff'], regen: ['leaf', '#7dff9b'] }[st.kind as 'taunt' | 'guard' | 'regen'] ?? ['roar', '#ffffff'];
        list.push({ icon: def?.icon ?? fallback[0]!, color: def?.color ?? fallback[1]!, text: String(st.turns), debuff: def?.type === 'debuff', turns: true });
      }
      for (const g of this.battle.ground) {
        if (g.board !== c.board || !g.slots.includes(c.slot) || g.sourceSide === c.side) continue;
        const def = content.grounds[g.ground];
        list.push({ icon: def?.icon ?? 'flame', color: def?.color ?? '#ffffff', text: String(g.turns), debuff: true, turns: true });
      }
      const bonus = this.battle.effectiveStats(c).armor - c.stats.armor;
      if (bonus > 0) list.push({ icon: 'shield', color: '#c9d1dc', text: `+${bonus}`, debuff: false, turns: false });
      const key = JSON.stringify(list);
      if (this.badgeKeys.get(c.uid) === key) continue;
      this.badgeKeys.set(c.uid, key);
      view.setBadges(list);
    }
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
      const n = '1234'.indexOf(e.key) + 1;
      if (n === 0) return;
      const skillId = this.activeActor?.skills[n - 1];
      if (skillId) this.onSkillClick(skillId);
    };
    window.addEventListener('keydown', onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));
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
    return !!actor && actor.side === 'party' && !this.autoPlay && actor.uid === this.uiActor;
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
    this.autoPlay = !this.autoPlay;
    this.refreshCommands();
    this.settle();
  }

  /** Debug: skip the current unit's turn (turns mode). */
  skipCurrentTurn(): void {
    if (this.battle.mode !== 'turns' || this.busy || this.battle.winner) return;
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
    const chosen = this.debugUnitUid ? this.battle.get(this.debugUnitUid) : undefined;
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

  /** Back to the team selection screen. */
  goToTeamSelect(): void {
    // Cell lists (index = slot, '' = empty) so the formation survives the round trip
    const ids = (side: 'party' | 'enemy') => {
      const cells: string[] = Array.from({ length: content.CELL_COUNT }, () => '');
      for (const c of this.battle.combatants) if (c.side === side && !c.summoned && c.slot < cells.length) cells[c.slot] = c.defId;
      return cells;
    };
    this.scene.start('TeamSelectScene', { teams: { party: ids('party'), enemies: ids('enemy') } });
  }

  // --- Skill selection: the first usable skill comes pre-selected; the player confirms with a tap ---

  /** Makes sure the acting player unit has a valid selected skill (the first usable one by default). */
  private ensureSelection(): void {
    const actor = this.activeActor;
    if (!actor || !this.playerCanAct) {
      if (this.selected) this.clearSelection();
      return;
    }
    if (this.selected && this.selected.actor === actor.uid && this.battle.canUse(actor.uid, this.selected.skill).ok) return;
    // Test modunda her karakter son kullandığı/seçtiği skill'de kalır (her seferinde ilk skill'e dönmez)
    const remembered = this.battle.mode === 'test' ? this.lastSkill.get(actor.uid) : undefined;
    const first = remembered && this.battle.canUse(actor.uid, remembered).ok ? remembered : actor.skills.find((id) => this.battle.canUse(actor.uid, id).ok);
    if (first) this.applySelection(actor.uid, first);
    else this.clearSelection();
  }

  private applySelection(actor: string, skill: string): void {
    this.selected = { actor, skill };
    for (const v of this.views.values()) v.clearPreview();
    this.clearSlotMarkers();
    this.clearAreaMarker();
    this.refreshGlows();
    if (this.battle.needsSlotChoice(skill)) this.showSlotMarkers(actor, skill);
    else if (this.battle.isAreaSkill(skill)) this.showTargetCells(actor, skill);
    // Skills without a target choice (all enemies, self, ...) show their effect on everyone affected right away
    else if (!this.battle.needsTargetChoice(skill)) {
      this.showPreviews(previewSkill(this.battle, actor, skill));
      this.showFrontRowBand(actor, skill);
    }
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
    const area = skill.target === 'area_enemies' || skill.target === 'column_enemies';
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
      if (hit.includes(uid)) v.setGlow(kind, true);
      else if (slotSkill || area) v.setGlow(null);
      else if (skill.target === 'random_enemies' && valid.has(uid)) v.setGlow(kind, false); // targets are random: only a hint
      else if (!choice && valid.has(uid)) v.setGlow(kind, true);
      else if (choice && valid.has(uid)) v.setGlow(kind, false);
      else v.setGlow(null);
    }
  }

  /** Summon skills: clickable markers on the free slots of the caster's side (the player picks where the unit appears). */
  private showSlotMarkers(actorUid: string, skillId: string): void {
    const actor = this.battle.get(actorUid);
    if (!actor) return;
    const board = this.battle.summonBoard(actorUid, skillId);
    const slots = board === 'party' ? layout.partySlots : layout.enemySlots;
    const items: Phaser.GameObjects.GameObject[] = [];
    for (const slot of this.battle.freeSlots(board)) {
      const pos = slots[slot];
      if (!pos) continue;
      const ring = this.add.circle(pos.x, pos.y - 60, 46, color(colors.selected), 0.18).setStrokeStyle(5, color(colors.selected));
      const plus = this.add.text(pos.x, pos.y - 62, '+', textStyle(64, colors.selected)).setOrigin(0.5);
      ring.setInteractive({ useHandCursor: true });
      ring.on('pointerover', () => ring.setFillStyle(color(colors.selected), 0.45));
      ring.on('pointerout', () => ring.setFillStyle(color(colors.selected), 0.18));
      ring.on('pointerup', () => this.perform(actorUid, skillId, actorUid, slot));
      this.tweens.add({ targets: [ring, plus], scale: 1.12, duration: 520, yoyo: true, repeat: -1 });
      items.push(ring, plus);
    }
    this.slotMarkers = this.add.container(0, 0, items).setDepth(4200);
  }

  /** Screen position (feet) of a formation cell on a side. */
  private cellPos(side: 'party' | 'enemy', slot: number): { x: number; y: number } {
    const slots = side === 'party' ? layout.partySlots : layout.enemySlots;
    return slots[slot] ?? { x: 0, y: 0 };
  }

  private targetSide(actorUid: string): 'party' | 'enemy' {
    return this.battle.get(actorUid)?.side === 'party' ? 'enemy' : 'party';
  }

  /**
   * Area and column skills can be aimed at any cell, also an empty one: every empty cell of the target side gets a round target.
   * Hovering it previews the area; clicking casts the skill there.
   */
  private showTargetCells(actorUid: string, skillId: string): void {
    const side = this.targetSide(actorUid);
    const skill = content.skills[skillId];
    const hex = skill && this.isHarmful(skill) ? colors.glowBad : colors.glowGood;
    const occupied = new Set(this.battle.living(side).map((c) => c.slot));
    const items: Phaser.GameObjects.GameObject[] = [];
    for (let slot = 0; slot < content.CELL_COUNT; slot++) {
      if (occupied.has(slot)) continue;
      const pos = this.cellPos(side, slot);
      // Lies flat on the floor (parallel to it), like a target painted on the stones
      const ring = this.add.ellipse(pos.x, pos.y - 4, 112, 40, color(hex), 0.12).setStrokeStyle(4, color(hex), 0.6);
      const dot = this.add.ellipse(pos.x, pos.y - 4, 18, 7, color(hex), 0.7);
      ring.setInteractive({ useHandCursor: true });
      ring.on('pointerover', () => {
        ring.setFillStyle(color(hex), 0.4).setStrokeStyle(6, color(hex), 1);
        this.previewAreaAt(actorUid, skillId, slot);
      });
      ring.on('pointerout', () => {
        ring.setFillStyle(color(hex), 0.12).setStrokeStyle(4, color(hex), 0.6);
        this.endAreaPreview();
      });
      ring.on('pointerup', () => this.perform(actorUid, skillId, '', slot));
      items.push(ring, dot);
    }
    this.slotMarkers = this.add.container(0, 0, items).setDepth(40);
  }

  /** Preview of an area/column skill centered on a cell (occupied or empty). */
  private previewAreaAt(actorUid: string, skillId: string, slot: number, anchorUid?: string): void {
    const previews = previewSkill(this.battle, actorUid, skillId, anchorUid, slot);
    this.showPreviews(previews);
    this.refreshGlows(previews.map((p) => p.uid));
    const skill = content.skills[skillId];
    if (!skill) return;
    const hex = this.isHarmful(skill) ? colors.glowBad : colors.glowGood;
    this.showAreaMarker(this.targetSide(actorUid), this.battle.areaCells(skillId, slot), skill.target === 'column_enemies' ? 'lane' : 'area', slot, hex);
  }

  private endAreaPreview(): void {
    this.clearPreviewsOnly();
    this.clearAreaMarker();
    this.refreshGlows();
  }

  /** Whirlwind-like skills (melee, everyone in reach): the front row the skill will sweep is shown as a vertical band. */
  private showFrontRowBand(actorUid: string, skillId: string): void {
    const skill = content.skills[skillId];
    if (!skill || skill.target !== 'all_enemies' || skill.motion !== 'melee') return;
    const side = this.targetSide(actorUid);
    const first = this.battle.validTargets(actorUid, skillId)[0];
    if (!first) return;
    const row = this.battle.rowOf(first.slot);
    const cells = Array.from({ length: content.GRID.lanes }, (_, l) => row * content.GRID.lanes + l);
    this.showAreaMarker(side, cells, 'row', first.slot, colors.glowBad);
  }

  /**
   * The area of an area/column/row skill drawn on the floor. Area: a soft glowing ellipse. Column (lane) and row: a rounded band
   * with a dot on every cell it covers (also the empty ones). The covered units themselves glow via refreshGlows.
   */
  private showAreaMarker(side: 'party' | 'enemy', cells: number[], shape: 'area' | 'lane' | 'row', centerSlot: number, hex: string): void {
    this.clearAreaMarker();
    if (cells.length === 0) return;
    const c = color(hex);
    const pts = cells.map((i) => this.cellPos(side, i));
    const minX = Math.min(...pts.map((q) => q.x));
    const maxX = Math.max(...pts.map((q) => q.x));
    const minY = Math.min(...pts.map((q) => q.y));
    const maxY = Math.max(...pts.map((q) => q.y));
    const items: Phaser.GameObjects.GameObject[] = [];
    if (shape === 'area') {
      // The glowing ellipse (three layers, brighter towards the middle) with flat floor tiles on every covered cell
      const left = minX - 80;
      const w = maxX - minX + 160;
      const cy = (minY + maxY) / 2 - 4;
      const h = maxY - minY + 96;
      for (const [scale, alpha] of [[1, 0.1], [0.82, 0.14], [0.62, 0.2]] as const) {
        items.push(this.add.ellipse(left + w / 2, cy, w * scale, h * scale + 20, c, alpha));
      }
      items.push(this.add.ellipse(left + w / 2, cy, w, h + 20).setStrokeStyle(4, c, 0.55));
    } else {
      // Lane / row: a thin flat strip lying on the floor through the covered cells (the row strip follows the slant of the row)
      const g = this.add.graphics();
      const first = pts.reduce((m, q) => (q.y < m.y || (q.y === m.y && q.x < m.x) ? q : m));
      const last = pts.reduce((m, q) => (q.y > m.y || (q.y === m.y && q.x > m.x) ? q : m));
      for (const [width, alpha] of [[60, 0.18], [44, 0.26], [28, 0.38]] as const) {
        g.lineStyle(width, c, alpha).beginPath().moveTo(first.x, first.y - 4).lineTo(last.x, last.y - 4).strokePath();
      }
      items.push(g);
    }
    // Flat tiles on the floor, one per covered cell (empty cells too); the center one is outlined in white
    cells.forEach((cell, k) => {
      const q = pts[k]!;
      const isCenter = cell === centerSlot;
      const strong = shape !== 'area'; // lane / row tiles are the only floor cue of those skills: make them stand out
      items.push(this.add.ellipse(q.x, q.y - 4, 124, 46, c, isCenter ? 0.55 : strong ? 0.42 : 0.24).setStrokeStyle(isCenter ? 5 : strong ? 4 : 3, isCenter ? 0xffffff : c, isCenter ? 1 : strong ? 1 : 0.8));
    });
    // A small marker above the center cell
    const mid = this.cellPos(side, centerSlot);
    if (shape !== 'row') items.push(this.add.triangle(mid.x, mid.y - 205, 0, 0, 30, 0, 15, 24, c, 0.95).setStrokeStyle(3, 0xffffff, 0.9));
    this.areaMarker = this.add.container(0, 0, items).setDepth(60);
    this.tweens.add({ targets: this.areaMarker, alpha: shape === 'area' ? 0.72 : 0.85, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private clearAreaMarker(): void {
    if (this.areaMarker) this.tweens.killTweensOf(this.areaMarker);
    this.areaMarker?.destroy();
    this.areaMarker = undefined;
  }

  private clearSlotMarkers(): void {
    if (!this.slotMarkers) return;
    this.tweens.killTweensOf(this.slotMarkers.list);
    this.slotMarkers.destroy();
    this.slotMarkers = undefined;
  }

  private clearSelection(): void {
    this.clearSlotMarkers();
    this.clearAreaMarker();
    this.selected = null;
    for (const v of this.views.values()) {
      v.setGlow(null);
      v.clearPreview();
    }
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

  private perform(actor: string, skill: string, target: string, slot?: number): void {
    if (this.battle.mode === 'test') this.lastSkill.set(actor, skill);
    this.clearSelection();
    this.hideInfoTip();
    this.hideUnitTip();
    if (!this.battle.useSkill(actor, skill, target || undefined, slot).ok) return;
    this.busy = true;
    this.refreshCommands();
    this.settle();
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

  private onCombatantTap(view: CombatantView): void {
    if (this.selected && this.playerCanAct) {
      const { actor, skill } = this.selected;
      if (this.battle.validTargets(actor, skill).some((c) => c.uid === view.combatant.uid)) {
        this.perform(actor, skill, view.combatant.uid);
        return;
      }
    }
    if (this.battle.mode === 'test' && view.combatant.side === 'party') this.selectActor(view.combatant.uid);
  }

  // --- Hover: unit info, skill/stat info and effect previews ---

  private onUnitOver(view: CombatantView): void {
    this.hoverView = view;
    this.showUnitTip(view);
    if (!this.selected || !this.playerCanAct || !this.battle.needsTargetChoice(this.selected.skill)) return;
    const { actor, skill } = this.selected;
    if (!this.battle.validTargets(actor, skill).some((c) => c.uid === view.combatant.uid)) return;
    // Area / column skills: the hovered unit's cell is the center of the area
    if (this.battle.isAreaSkill(skill)) {
      this.previewAreaAt(actor, skill, view.combatant.slot, view.combatant.uid);
      return;
    }
    // Hovering a single target previews the effect on it
    const previews = previewSkill(this.battle, actor, skill, view.combatant.uid);
    this.showPreviews(previews);
    this.refreshGlows(previews.map((p) => p.uid));
  }

  private onUnitOut(view: CombatantView): void {
    if (this.hoverView === view) this.hoverView = undefined;
    this.hideUnitTip();
    if (this.selected && this.battle.needsTargetChoice(this.selected.skill)) this.endAreaPreview();
  }

  private showPreviews(list: TargetPreview[]): void {
    this.clearPreviewsOnly();
    for (const p of list) this.views.get(p.uid)?.showPreview(p);
  }

  private clearPreviewsOnly(): void {
    for (const v of this.views.values()) v.clearPreview();
  }

  /**
   * Hover info: it fills the free space at the right end of the bottom bar (always the same place, never next
   * to the mouse). First row: icon + title (+ cost / cooldown chips), the badge sits at the top right. Below it the
   * description rows: the font shrinks (and long content flows into a second column) until everything fits.
   */
  private makeInfo(title: string, titleColor: string, iconKey: string | undefined, rows: Array<[string, string?]>, badge?: string, meta: InfoMeta[] = []): Tip {
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
    // meta chips (cost, cooldown) right after the title
    const isz = 18;
    const metaTexts = meta.map((m) => this.add.text(0, 0, m.text, { fontFamily: layout.fontFamily, fontSize: '17px', fontStyle: 'bold', color: m.hex, stroke: '#0c0805', strokeThickness: 3 }).setOrigin(0, 0.5));
    const metaW = meta.reduce((w, m, i) => w + (m.icon ? isz + 4 : 0) + metaTexts[i]!.width + 18, 0);
    const titleText = this.add.text(left, iconSize / 2, title, { fontFamily: SERIF, fontSize: '25px', fontStyle: 'bold', color: titleColor, stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0, 0.5);
    const room = width - left - badgeW - metaW - 20;
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
    const p = layout.commandPanel;
    return this.skillsLeft() + 4 * (p.buttonWidth + p.gap) + 10; // right after the 4 skills
  }

  private showSkillTip(actor: Combatant, skill: SkillDef): void {
    this.hideInfoTip();
    const info = describeSkill(skill, actor.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    const kindColor = (k: (typeof info.kinds)[number]): string | undefined =>
      k === 'shield' ? colors.shield : k === 'magicShield' ? colors.magicShield : k ? colors.element[k] : undefined;
    const rows: Array<[string, string?]> = info.lines.map((l, i): [string, string?] => [l, kindColor(info.kinds[i])]);
    const meta: InfoMeta[] = [];
    if (skill.cost.amount > 0) {
      const kind = skill.cost.resource === 'mp' ? 'mp' : 'hp';
      meta.push({ icon: ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), text: info.cost, hex: colors.text });
    } else meta.push({ text: info.cost, hex: colors.muted });
    if (this.battle.mode === 'turns' && (skill.cooldown ?? 0) > 0) meta.push({ icon: ensureIcon(this, UI_ICON.hourglass, UI_COLOR, false), text: info.cooldown, hex: colors.muted });
    const wait = this.battle.mode === 'turns' ? (actor.cooldowns[skill.id] ?? 0) : 0;
    if (wait > 0) rows.push([`Ready in ${wait} turn${wait > 1 ? 's' : ''}`, colors.targetHighlight]);
    else {
      const can = this.battle.canUse(actor.uid, skill.id);
      if (!can.ok && (can.reason.startsWith('Not enough') || can.reason === 'No target in reach' || can.reason.startsWith('Melee'))) rows.push([can.reason, colors.lethal]);
    }
    this.placeInfoTip(this.makeInfo(info.name, colors.text, ensureSkillIcon(this, skill), rows, info.targetBadge, meta));
  }

  private showStatTip(kind: StatKind, actor: Combatant): void {
    this.hideInfoTip();
    const info = describeStat(kind, actor.stats, content.formulas);
    const rows = info.lines.map((l): [string, string?] => [l]);
    this.placeInfoTip(this.makeInfo(info.bonus ? `${info.title} — ${info.bonus.name}` : info.title, info.primary ? PRIMARY_GOLD : STAT_COLOR[kind], ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), rows));
  }

  private hideInfoTip(): void {
    this.infoTip?.container.destroy();
    this.infoTip = undefined;
  }

  private unitTipLines(c: Combatant): string[] {
    const f = content.formulas;
    const pct = (a: number) => `${Math.round(armorReduction(a, f) * 100)}%`;
    const lines = [`HP ${c.hp} / ${c.maxHp}`];
    if (c.maxMp > 0) lines.push(`MP ${c.mp} / ${c.maxMp}`);
    if (c.shield > 0) lines.push(`Shield ${c.shield}`);
    if (c.magicShield > 0) lines.push(`Magic shield ${c.magicShield}`);
    if (c.statuses.length > 0) lines.push(`Status: ${c.statuses.map((s) => `${s.kind} ${s.turns}`).join(', ')}`);
    lines.push(`STR ${c.stats.str}   DEX ${c.stats.dex}   INT ${c.stats.int}   LCK ${c.stats.luck}`);
    if (c.stats.primary) lines.push(`Primary: ${c.stats.primary.toUpperCase()}${c.stats.primaryActive ? '' : ' (inactive)'}`);
    lines.push(`SPD ${c.stats.spd}   ACC ${Math.round(c.stats.accuracy * 100)}%   EVA ${Math.round(c.stats.evasion * 100)}%`);
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
  }

  /**
   * Hover info for any unit: the same layout as the acting unit's block in the bottom bar (class logo, name, HP/MP,
   * attributes, secondary stats), plus its skills and what is on it (shields, statuses, cooldowns), in the right-hand area.
   */
  private makeUnitInfo(c: Combatant): Tip {
    const p = layout.commandPanel;
    const x0 = this.infoTipX();
    this.statHitsOn = false;
    const items = this.drawStatsBlock(c, x0);
    this.statHitsOn = true;

    // Skills (2 x 2 icons) next to the block
    const sx = x0 + 480;
    c.skills.slice(0, 4).forEach((id, i) => {
      const skill = content.skills[id];
      if (!skill) return;
      const cd = this.battle.mode === 'turns' ? (c.cooldowns[id] ?? 0) : 0;
      const ix = sx + (i % 2) * 48;
      const iy = p.y + 12 + Math.floor(i / 2) * 48;
      items.push(this.add.image(ix + 20, iy + 20, ensureSkillIcon(this, skill)).setDisplaySize(40, 40).setAlpha(cd > 0 ? 0.4 : 1));
      if (cd > 0) items.push(this.add.text(ix + 20, iy + 20, String(cd), textStyle(24, colors.targetHighlight)).setOrigin(0.5));
    });

    // The passive next to the skills
    if (c.passive) {
      const px = sx + 104;
      items.push(
        this.add.circle(px + 22, p.y + 32, 24, color(colors.button)).setStrokeStyle(3, color(colors.tooltipBorder)),
        this.add.image(px + 22, p.y + 32, ensureIcon(this, c.passive.icon, c.color, false)).setDisplaySize(30, 30),
        this.add.text(px + 22, p.y + 60, c.passive.name, { ...textStyle(14, colors.muted), wordWrap: { width: 110 }, align: 'center' }).setOrigin(0.5, 0),
      );
    }

    // What is on the unit
    const extra: Array<[string, string]> = [];
    if (c.shield > 0) extra.push([`Shield ${c.shield}`, colors.shield]);
    if (c.magicShield > 0) extra.push([`M.Shield ${c.magicShield}`, colors.magicShield]);
    for (const st of c.statuses) extra.push([`${content.statuses[st.kind]?.name ?? st.kind[0]!.toUpperCase() + st.kind.slice(1)} ${st.turns}`, content.statuses[st.kind]?.color ?? colors.targetHighlight]);
    for (const tag of c.tags) for (const [el, m] of Object.entries(content.formulas.weaknesses[tag] ?? {})) extra.push([`Weak to ${el} +${Math.round((m - 1) * 100)}%`, colors.element[el as keyof typeof colors.element] ?? colors.muted]);
    if (c.summoned && c.lifespan !== undefined) extra.push([`Leaves in ${c.lifespan}`, colors.muted]);
    extra.slice(0, 3).forEach(([text, hex], i) => items.push(this.add.text(sx, p.y + 102 + i * 17, text, textStyle(16, hex)).setOrigin(0, 0)));

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
      this.busy = false;
      this.refreshCommands();
      if (battle.mode !== 'turns' || battle.winner) return;
      const actor = battle.currentActor;
      if (!actor) return;
      const idle = actor.side === 'enemy' && debugState.enemyAiOff && !this.autoPlay; // debug: enemies do nothing
      const aiTurn = actor.side === 'enemy' || this.autoPlay;
      if (!aiTurn && battle.hasUsableSkill(actor.uid)) return; // the player's move
      this.busy = true;
      this.refreshCommands();
      await this.wait(layout.animation.aiThinkMs);
      if (battle !== this.battle || !this.scene.isActive()) return;
      if (idle) {
        this.lastAi = `Enemy ${actor.name}: AI off, skipped`;
        this.battle.skipTurn();
        this.settle();
        return;
      }
      this.runAi(actor);
    });
  }

  private runAi(actor: Combatant): void {
    const choice = chooseAction(this.battle, actor.uid, content.aiConfig);
    const who = `${actor.side === 'enemy' ? 'Enemy ' : 'Player '}${actor.name}`;
    if (choice) {
      const skill = content.skills[choice.skillId];
      const target = choice.targetUid ? this.battle.get(choice.targetUid) : undefined;
      const targetName = target ? `${target.side === 'enemy' ? 'Enemy ' : 'Player '}${target.name}` : '';
      this.lastAi = `${who}: ${skill?.name ?? choice.skillId}${target ? ` on ${targetName}` : ''} (${choice.reason})`;
    } else {
      this.lastAi = `${who}: no useful action, skipped`;
    }
    const result = choice ? this.battle.useSkill(actor.uid, choice.skillId, choice.targetUid) : this.battle.skipTurn();
    if (!result.ok) this.battle.skipTurn(); // safety net: never get stuck on an invalid choice
    this.settle();
  }

  // --- Event playback: animates the engine's events in order ---

  /** Gambler: bir skill kullanımının bahis sonucu ve çifte vuruşu (olaylar motorda hemen yayılır; animasyon sonra oynar). */
  private skillResults = new WeakMap<object, { bet?: 'win' | 'lose'; doubleHit?: boolean }>();
  private lastSkillUsed: object | null = null;
  /** Set by a "Thorns" passive event until the reflected damage event (source = this unit) is played. */
  private thornsHolder: string | null = null;

  private enqueue(e: BattleEvent): void {
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

  private async playEvent(e: BattleEvent): Promise<void> {
    if (!this.scene.isActive()) return;
    switch (e.type) {
      case 'skillUsed': {
        this.abortHitGate();
        const actor = this.battle.get(e.actor);
        const skill = content.skills[e.skill];
        if (actor && skill) this.announce(`${actor.side === 'enemy' ? 'Enemy ' : ''}${actor.name} uses ${skill.name}`);
        return this.playSkillMotion(e.actor, e.skill, e.targets, e.center, this.skillResults.get(e));
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
        if (target) {
          // The bigger the hit relative to max HP, the stronger the reaction (shake, flash, number size, bar drain)
          const ratio = e.amount / target.combatant.maxHp;
          if (e.amount === 0 && e.absorbed > 0) {
            target.ring(e.magicShieldAfter > 0 || e.shieldAfter === 0 ? colors.magicShield : colors.shield);
            target.floatText('Blocked', colors.shield, 46);
          } else {
            target.hit(ratio);
            target.damageText(e.amount, ratio, e.crit);
          }
          if (e.redirected) target.ring(colors.shield, 0.8); // guarded damage taken for an ally
          target.setHp(e.hpAfter, true, ratio);
          target.setShield(e.shieldAfter, e.magicShieldAfter);
          // Thorns reflection: the "Thorns" passive event is followed by this damage event (source = the thorny unit, target = the attacker)
          const holder = this.thornsHolder === e.source ? this.views.get(e.source) : undefined;
          this.thornsHolder = null;
          if (holder && holder !== target) thornReflectFx(this, target, holder);
        }
        await this.wait(slow(90));
        return;
      }
      case 'dodge':
        await this.passHitGate();
        this.views.get(e.target)?.dodge();
        await this.wait(slow(90));
        return;
      case 'heal': {
        const target = this.views.get(e.target);
        if (e.crit) {
          target?.floatText(`+${e.amount}`, colors.crit, 70, true);
          target?.floatText('CRIT', colors.crit, 34);
        } else target?.floatText(`+${e.amount}`, colors.heal);
        target?.ring(colors.heal);
        target?.setHp(e.hpAfter);
        await this.wait(slow(90));
        return;
      }
      case 'shield': {
        const target = this.views.get(e.target);
        const hex = e.magic ? colors.magicShield : colors.shield;
        if (e.amount >= 0) {
          target?.floatText(`+${e.amount}`, hex);
          target?.ring(hex);
        } else target?.floatText(`${e.amount} shield`, hex, 44);
        target?.setShield(e.shieldAfter, e.magicShieldAfter);
        await this.wait(slow(90));
        return;
      }
      case 'manaBurn': {
        const target = this.views.get(e.target);
        target?.floatText(`-${e.amount} MP`, colors.burn, 44);
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
        // Thorns: a light shell of thorns around the unit for as long as the status lasts (animation order: after Thorn Shield's VFX)
        if (e.status === 'thorns') this.views.get(e.target)?.setThornShell(e.type === 'status');
        return;
      }
      case 'summon': {
        const view = this.addView(e.combatant);
        if (view) {
          view.container.setAlpha(0);
          await summonFx(this, e.combatant.defId, view);
        }
        return;
      }
      case 'revive':
        this.views.get(e.target)?.revive(e.hpAfter, e.mpAfter);
        await this.wait(slow(500));
        this.refreshCommands();
        return;
      case 'despawn':
        await this.views.get(e.target)?.vanish();
        this.refreshCommands();
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
        if (e.passive === 'thorns') this.thornsHolder = e.actor;
        view?.floatText(e.name, colors.targetHighlight, 34);
        view?.ring(colors.targetHighlight, 0.9);
        await this.wait(120);
        return;
      }
      case 'mpRegen': {
        const view = this.views.get(e.actor);
        view?.setMp(e.after);
        view?.floatText(`+${e.amount} MP`, colors.mpFill, 40);
        return;
      }
      case 'turnStart':
        this.abortHitGate();
        if (this.uiActor && this.uiActor !== e.actor) this.playedUids.push(this.uiActor);
        this.uiActor = e.actor;
        this.renderTurnBar(e.queue);
        this.refreshSpeedBars();
        this.refreshCommands();
        return;
      case 'turnSkipped': {
        const actor = this.battle.get(e.actor);
        this.views.get(e.actor)?.floatText(e.stunned ? 'Stunned' : 'Skipped', e.stunned ? colors.targetHighlight : colors.turnCell, 48);
        if (actor) this.announce(`${actor.side === 'enemy' ? 'Enemy ' : ''}${actor.name} ${e.stunned ? 'is stunned and loses the turn' : 'has nothing to cast and skips the turn'}`);
        await this.wait(500);
        return;
      }
      case 'death':
        await this.views.get(e.target)?.die();
        this.refreshCommands();
        return;
      case 'battleEnd':
        this.showResult(e.winner === 'party');
        return;
      case 'battleStart':
        return;
    }
  }

  /** The skill's motion: melee = lunge, ranged/cast = wind-up + projectile, sky = falls from above, support = ring. */
  private async playSkillMotion(actorUid: string, skillId: string, targetUids: string[], center?: number, result?: { bet?: 'win' | 'lose'; doubleHit?: boolean }): Promise<void> {
    const skill = content.skills[skillId];
    const actor = this.views.get(actorUid);
    const targets = targetUids.flatMap((uid) => this.views.get(uid) ?? []);
    if (!skill || !actor) return;
    const board = this.targetSide(actorUid);
    const offensive = skill.effects.some((ef) => ef.type === 'damage' || ef.type === 'manaBurn' || ef.type === 'ground');
    // Area skills can be cast on empty cells: they still play (the effect lands on the chosen cell)
    if (targets.length === 0 && !(center !== undefined && offensive)) return;

    // Piksel art skill efekti (src/game/vfx.ts): varsa genel hareket yerine o oynar
    const vfx = skill.vfx ? VFX[skill.vfx as VfxKind] : undefined;
    if (!vfx) for (const id of skill.sfx ?? []) playSfx(this, id); // efekti kodda olmayan skill'in sesleri başta çalar (Radiance)
    if (vfx) {
      const cells = center !== undefined && this.battle.isAreaSkill(skillId) ? this.battle.areaCells(skillId, center).map((slot) => this.cellPos(board, slot)) : [];
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
        ...(center !== undefined && this.battle.isAreaSkill(skillId) ? { centerPos: this.cellPos(board, center) } : {}),
        cells,
        ...(result ? { result } : {}),
        lunge: () => meleeApproach(this, actor, targets, center !== undefined && this.battle.isAreaSkill(skillId) ? this.cellPos(board, center) : undefined),
        windUp: (hex, anim = 'cast') => actor.windUp(hex, anim),
        sfx: (id) => {
          if (skill.sfx?.includes(id)) playSfx(this, id);
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
    // Holy Fire / Poison: seçim göstergesine oturan TEK yassı elips alan (Drain Field tarzı), ground süresince hafif canlı
    const area = groundArea(this, e.ground, e.slots.map((slot) => this.cellPos(e.board, slot)), 120);
    if (area) {
      this.tweens.add({ targets: area, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
            this.add.image(cx + cellSize - r + 2, y + cellSize - r + 2, ensureIcon(this, unit.logo, unit.color, false)).setDisplaySize(r * 1.4, r * 1.4),
          ];
          if (isPast) {
            head.setAlpha(0.38).setTint(0x8a8a8a);
            for (const b of badge) b.setAlpha(0.45);
          }
          items.push(head, ...badge);
        }
        // Frame on top of the portrait: bronze edge; the inner line shows the side (blue ally, red enemy), gold for the current unit
        const fr = this.add.graphics();
        if (isNow) glowRect(fr, cx, y, cellSize, cellSize, GOLD.bright, 0.8, 7);
        frameRect(fr, cx, y, cellSize, cellSize, { edge: isNow ? GOLD.bright : GOLD.dark, light: color(border), bevel: 3, shadow: 0.3, alpha: isPast ? 0.5 : 1 });
        items.push(fr);
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
      () => this.onCombatantTap(view),
      () => this.onUnitOver(view),
      () => this.onUnitOut(view),
    );
    this.views.set(c.uid, view);
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
    for (const dx of [this.skillsLeft() - 104, this.infoTipX() - 7]) {
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
      for (const [idx, skillId] of actor.skills.entries()) {
        const skill = content.skills[skillId];
        if (!skill) continue;
        const enabled = this.playerCanAct && this.battle.canUse(actor.uid, skillId).ok;
        items.push(...this.skillButton(x, p.y + (H - p.y - p.buttonHeight) / 2, actor, skill, enabled, idx === 3, idx + 1));
        x += p.buttonWidth + p.gap;
      }
      if (actor.passive) items.push(...this.passiveBadge(this.skillsLeft() - 92, p.y + (H - p.y) / 2, actor));
    }
    this.commandLayer = this.add.container(0, 0, items).setDepth(4600);
  }

  /** The class passive: a round badge just left of the skill buttons (not clickable; hover explains it). */
  private passiveBadge(x: number, cy: number, actor: Combatant): Phaser.GameObjects.GameObject[] {
    const passive = actor.passive!;
    const r = 36;
    const bg = this.add.circle(x + r, cy - 8, r, color(colors.button)).setStrokeStyle(4, color(colors.tooltipBorder));
    const icon = this.add.image(x + r, cy - 8, ensureIcon(this, passive.icon, actor.color, false)).setDisplaySize(44, 44);
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
    this.placeInfoTip(this.makeInfo(passive.name, colors.targetHighlight, ensureIcon(this, passive.icon, actor.color, false), [[describePassive(passive, actor.stats, content.formulas)]], 'Passive'));
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
      const logo = this.add.image(avX + 11, nameY, ensureIcon(this, actor.logo, actor.color, false)).setDisplaySize(15, 15);
      const nameText = this.add.text(avX + 22, nameY, actor.name, { fontFamily: SERIF, fontSize: '15px', fontStyle: 'bold', color: enemy ? colors.hpFillEnemy : '#f6e7c4', stroke: '#0c0805', strokeThickness: 3 }).setOrigin(0, 0.5);
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
      const logo = this.add.image(avX + 18, nameY, ensureIcon(this, actor.logo, actor.color, false)).setDisplaySize(24, 24);
      const nameText = this.add.text(avX + 34, nameY, actor.name, { fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: enemy ? colors.hpFillEnemy : '#f6e7c4', stroke: '#0c0805', strokeThickness: 4 }).setOrigin(0, 0.5);
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

    // --- Columns 2 and 3: stat rows ---
    const column = (kinds: StatKind[], x: number, y0: number, step: number, icon: number, font: number, w: number) =>
      kinds.forEach((k, i) => {
        const cy = y0 + i * step;
        if (i < kinds.length - 1) {
          const hl = this.add.graphics();
          hl.fillStyle(GOLD.edge, 0.22).fillRect(x, cy + step / 2, w - 10, 1);
          items.push(hl);
        }
        const label = this.add.text(x + icon + 6, cy, this.statText(k, s), textStyle(font, s.primary === k ? PRIMARY_GOLD : undefined)).setOrigin(0, 0.5);
        items.push(this.add.image(x + icon / 2, cy, ensureIcon(this, STAT_ICON[k], STAT_COLOR[k], false)).setDisplaySize(icon, icon), label);
        items.push(this.statHit(x - 2, cy - step / 2, w, step, k, actor));
      });
    const c2 = x0 + av + 16;
    const c2w = 168;
    column(['str', 'dex', 'int', 'luck'], c2, top + 36, 32, 24, 22, c2w);
    column(['spd', 'critChance', 'accuracy', 'evasion', 'armor', 'magicArmor'], c2 + c2w + 4, top + 31, 21, 18, 16, 170);
    return items;
  }

  private statText(k: StatKind, s: Combatant['stats']): string {
    switch (k) {
      case 'str': case 'int': case 'dex': case 'luck': return `${STAT_LABEL[k]} ${s[k]}`;
      case 'spd': return `SPD ${s.spd}`;
      case 'critChance': return `CRIT ${(s.critChance * 100).toFixed(1).replace(/\.0$/, '')}%`;
      case 'accuracy': return `ACC ${Math.round(s.accuracy * 100)}%`;
      case 'evasion': return `EVA ${Math.round(s.evasion * 100)}%`;
      case 'armor': return `ARM ${Number(s.armor.toFixed(1))}`;
      case 'magicArmor': return `M.ARM ${Number(s.magicArmor.toFixed(1))}`;
      default: return '';
    }
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
    const parts: Array<{ icon?: string; text: string; hex: string }> = [];
    const hourglass = ensureIcon(this, UI_ICON.hourglass, UI_COLOR, false);
    if (remaining > 0) parts.push({ icon: hourglass, text: String(remaining), hex: colors.targetHighlight });
    else {
      if (skill.cost.amount > 0) {
        const kind = skill.cost.resource === 'mp' ? 'mp' : 'hp';
        parts.push({ icon: ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false), text: String(skill.cost.amount), hex: colors.text });
      }
      if (turns && (skill.cooldown ?? 0) > 0) parts.push({ icon: hourglass, text: String(skill.cooldown), hex: colors.muted });
    }
    const isz = 18;
    const texts = parts.map((pt) => this.add.text(0, cy, pt.text, textStyle(17, pt.hex)).setOrigin(0, 0.5));
    const total = parts.reduce((w, _pt, i) => w + isz + 3 + texts[i]!.width, 0) + Math.max(0, parts.length - 1) * 10;
    let x = cx - total / 2;
    const out: Phaser.GameObjects.GameObject[] = [];
    parts.forEach((pt, i) => {
      out.push(this.add.image(x + isz / 2, cy, pt.icon!).setDisplaySize(isz, isz).setAlpha(alpha));
      texts[i]!.setPosition(x + isz + 3, cy).setAlpha(alpha);
      out.push(texts[i]!);
      x += isz + 3 + texts[i]!.width + 10;
    });
    return out;
  }

  private turnLabel(actor: Combatant): string {
    if (this.battle.mode === 'test') return 'Test mode';
    if (actor.side === 'enemy') return 'Enemy turn';
    return this.autoPlay ? 'Auto (AI)' : 'Your turn';
  }

  /** A compact skill button: icon, name and cost. Hovering shows details; disabled buttons still show them. */
  private skillButton(x: number, y: number, actor: Combatant, skill: SkillDef, enabled: boolean, ultimate = false, hotkey = 0): Phaser.GameObjects.GameObject[] {
    const { buttonWidth: bw, buttonHeight: bh, iconSize } = layout.commandPanel;
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

  private plainButton(x: number, y: number, w: number, h: number, label: string, onTap: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, w, h, color(colors.button)).setOrigin(0, 0).setStrokeStyle(5, color(colors.buttonBorder));
    const text = this.add.text(x + w / 2, y + h / 2, label, textStyle(44)).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => bg.setFillStyle(color(colors.buttonPressed)));
    bg.on('pointerout', () => bg.setFillStyle(color(colors.button)));
    bg.on('pointerup', () => {
      bg.setFillStyle(color(colors.button));
      onTap();
    });
    return [bg, text];
  }

  private showResult(victory: boolean): void {
    const overlay = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0, 0).setDepth(6000);
    const title = this.add
      .text(W / 2, H / 2 - 110, victory ? 'Victory!' : 'Defeat', textStyle(140, victory ? colors.damage : colors.hpFillEnemy))
      .setOrigin(0.5)
      .setDepth(6001)
      .setAlpha(0);
    const buttons = [
      ...this.plainButton(W / 2 - 400, H / 2 + 20, 380, 120, 'Rematch', () => this.scene.restart({ seed: newSeed(), teams: this.teams })),
      ...this.plainButton(W / 2 + 20, H / 2 + 20, 380, 120, 'Change teams', () => this.goToTeamSelect()),
    ];
    for (const item of buttons) (item as Phaser.GameObjects.Components.Depth & Phaser.GameObjects.GameObject).setDepth(6002);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 300 });
    this.tweens.add({ targets: title, alpha: 1, duration: 300 });
  }
}
