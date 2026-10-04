import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { Battle, chooseAction, content } from '../../engine';
import type { BattleEvent, BattleMode, Combatant, SkillDef } from '../../engine';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { CombatantView, color, textStyle } from '../combatant-view';

export interface BattleSceneData {
  seed: number;
  battleId: string;
  showSlots: boolean;
  mode: BattleMode;
}

const { width: W, height: H, colors } = layout;

/**
 * Battle screen. It knows no rules: it sends actions to the engine and plays back the engine's events.
 * turns mode: order comes from SPD; player units are controlled by the player, enemies by the AI.
 * test mode: no turn order, the tester can act with any unit at any time (debug).
 */
export class BattleScene extends Phaser.Scene {
  static readonly KEY = 'BattleScene';

  seed = 1;
  battleId = 'first-battle';
  showSlots = false;
  mode: BattleMode = 'turns';
  /** turns mode: let the AI play the player's party too (debug). */
  autoPlay = false;
  /** Human-readable description of the last AI decision (debug info). */
  lastAi = '-';
  battle!: Battle;

  private views = new Map<string, CombatantView>();
  private slotLayer?: Phaser.GameObjects.Container;
  private turnBarLayer?: Phaser.GameObjects.Container;
  private commandLayer?: Phaser.GameObjects.Container;
  private announceLayer?: Phaser.GameObjects.Container;
  private hint?: Phaser.GameObjects.Text;
  /** test mode: the unit the tester is controlling. */
  private controlled: string | null = null;
  /** turns mode: whose turn the screen currently shows (lags behind the engine while animations play). */
  private uiActor: string | null = null;
  private busy = false;
  private targeting: { actor: string; skill: string } | null = null;
  private eventQueue: Promise<void> = Promise.resolve();

  constructor() {
    super(BattleScene.KEY);
  }

  init(data: Partial<BattleSceneData>): void {
    this.seed = data.seed ?? this.seed;
    this.battleId = data.battleId ?? this.battleId;
    this.showSlots = data.showSlots ?? this.showSlots;
    this.mode = data.mode ?? this.mode;
    this.views = new Map();
    this.controlled = null;
    this.uiActor = null;
    this.busy = false;
    this.targeting = null;
    this.eventQueue = Promise.resolve();
    this.lastAi = '-';
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    const def = content.battles[this.battleId];
    this.drawBackground(def?.background ?? '');
    this.drawSlots();

    this.battle = new Battle(content.battleSetup(this.battleId, this.seed, this.mode));
    for (const c of this.battle.combatants) this.addView(c);
    this.uiActor = this.battle.currentUid;
    this.renderTurnBar(this.battle.turnQueue());
    this.battle.on((e) => this.enqueue(e));

    this.hint = this.add
      .text(W / 2, layout.commandPanel.y - 60, 'Select a target  (tap empty space to cancel)', textStyle(40, colors.targetHighlight))
      .setOrigin(0.5)
      .setDepth(4400)
      .setVisible(false);

    this.drawCommandPanel();
    this.settle(); // the first unit may be an enemy: let the AI start
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
    this.clearTargeting();
    this.busy = true;
    this.refreshCommands();
    if (this.battle.skipTurn().ok) this.settle();
    else this.busy = false;
  }

  /** test mode: pick the unit to control. */
  selectActor(uid: string): void {
    const c = this.battle.get(uid);
    if (this.battle.mode !== 'test' || !c || c.hp <= 0 || this.busy) return;
    this.clearTargeting();
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

  /** A skill button was pressed. */
  chooseSkill(skillId: string): void {
    const actor = this.activeActor;
    if (!actor || !this.playerCanAct) return;
    if (!this.battle.canUse(actor.uid, skillId).ok) return;
    const targets = this.battle.validTargets(actor.uid, skillId);
    if (targets.length === 0) return;
    if (!this.battle.needsTargetChoice(skillId) || targets.length === 1) {
      this.perform(actor.uid, skillId, targets[0]!.uid);
      return;
    }
    // Several possible targets: the player taps one
    this.clearTargeting();
    this.targeting = { actor: actor.uid, skill: skillId };
    for (const t of targets) this.views.get(t.uid)?.setHighlight(true);
    this.hint?.setVisible(true);
  }

  private perform(actor: string, skill: string, target: string): void {
    this.clearTargeting();
    if (!this.battle.useSkill(actor, skill, target).ok) return;
    this.busy = true;
    this.refreshCommands();
    this.settle();
  }

  private onCombatantTap(view: CombatantView): void {
    if (this.targeting) {
      const valid = this.battle.validTargets(this.targeting.actor, this.targeting.skill);
      if (valid.some((c) => c.uid === view.combatant.uid)) {
        this.perform(this.targeting.actor, this.targeting.skill, view.combatant.uid);
      }
      return;
    }
    if (this.battle.mode === 'test' && view.combatant.side === 'party') this.selectActor(view.combatant.uid);
  }

  private clearTargeting(): void {
    this.targeting = null;
    this.hint?.setVisible(false);
    for (const v of this.views.values()) v.setHighlight(false);
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
      this.busy = false;
      this.refreshCommands();
      if (battle.mode !== 'turns' || battle.winner) return;
      const actor = battle.currentActor;
      if (!actor) return;
      const aiTurn = actor.side === 'enemy' || this.autoPlay;
      if (!aiTurn && battle.hasUsableSkill(actor.uid)) return; // the player's move
      this.busy = true;
      this.refreshCommands();
      await this.wait(layout.animation.aiThinkMs);
      if (battle !== this.battle || !this.scene.isActive()) return;
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

  private enqueue(e: BattleEvent): void {
    // If the scene restarts, queued events of the old battle must not touch the new characters
    const battle = this.battle;
    this.eventQueue = this.eventQueue.then(() => (battle === this.battle ? this.playEvent(e) : undefined));
  }

  private async playEvent(e: BattleEvent): Promise<void> {
    if (!this.scene.isActive()) return;
    switch (e.type) {
      case 'skillUsed': {
        const actor = this.battle.get(e.actor);
        const skill = content.skills[e.skill];
        if (actor && skill) this.announce(`${actor.side === 'enemy' ? 'Enemy ' : ''}${actor.name} uses ${skill.name}`);
        return this.playSkillMotion(e.actor, e.skill, e.targets);
      }
      case 'resource': {
        const view = this.views.get(e.actor);
        if (e.resource === 'mp') view?.setMp(e.after);
        else view?.setHp(e.after);
        return;
      }
      case 'damage': {
        const target = this.views.get(e.target);
        target?.hit();
        target?.floatText(String(e.amount), colors.damage);
        target?.setHp(e.hpAfter);
        target?.setShield(e.shieldAfter);
        await this.wait(90);
        return;
      }
      case 'heal': {
        const target = this.views.get(e.target);
        target?.floatText(`+${e.amount}`, colors.heal);
        target?.ring(colors.heal);
        target?.setHp(e.hpAfter);
        await this.wait(90);
        return;
      }
      case 'shield': {
        const target = this.views.get(e.target);
        target?.floatText(`+${e.amount}`, colors.shield);
        target?.ring(colors.shield);
        target?.setShield(e.shieldAfter);
        await this.wait(90);
        return;
      }
      case 'summon': {
        const view = this.addView(e.combatant);
        view?.fadeIn();
        await this.wait(400);
        return;
      }
      case 'mpRegen': {
        const view = this.views.get(e.actor);
        view?.setMp(e.after);
        view?.floatText(`+${e.amount} MP`, colors.mpFill, 40);
        return;
      }
      case 'turnStart':
        this.uiActor = e.actor;
        this.renderTurnBar(e.queue);
        this.refreshCommands();
        return;
      case 'turnSkipped': {
        const actor = this.battle.get(e.actor);
        this.views.get(e.actor)?.floatText('Skipped', colors.turnCell, 48);
        if (actor) this.announce(`${actor.side === 'enemy' ? 'Enemy ' : ''}${actor.name} has nothing to cast and skips the turn`);
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

  /** The skill's motion: melee = lunge, ranged/cast = wind-up + projectile, support = ring. */
  private async playSkillMotion(actorUid: string, skillId: string, targetUids: string[]): Promise<void> {
    const skill = content.skills[skillId];
    const actor = this.views.get(actorUid);
    const targets = targetUids.flatMap((uid) => this.views.get(uid) ?? []);
    if (!skill || !actor || targets.length === 0) return;

    const offensive = skill.effects.some((ef) => ef.type === 'damage');
    if (skill.motion === 'melee') {
      const avgX = targets.reduce((sum, t) => sum + t.container.x, 0) / targets.length;
      await new Promise<void>((resolve) => void actor.lunge(avgX, resolve));
      return;
    }
    await actor.windUp(skill.fx, skill.motion === 'ranged' ? 'attack' : 'cast');
    if (offensive) await Promise.all(targets.map((t) => this.fly(actor, t, skill)));
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
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: () => {
          orb.destroy();
          resolve();
        },
      });
    });
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
    // Tapping empty space cancels target selection
    this.add
      .zone(0, 0, W, H)
      .setOrigin(0, 0)
      .setDepth(-100)
      .setInteractive()
      .on('pointerdown', () => {
        if (this.targeting) this.clearTargeting();
      });
  }

  /** Turn order bar: the current unit first, then the next ones (mini portraits). */
  private renderTurnBar(queue: string[]): void {
    this.turnBarLayer?.destroy();
    const { y, cells, cellSize, gap } = layout.turnBar;
    const total = cells * cellSize + (cells - 1) * gap;
    const x = (W - total) / 2;
    const items: Phaser.GameObjects.GameObject[] = [];

    if (this.battle?.mode === 'test') {
      items.push(
        this.add.rectangle(W / 2, y + cellSize / 2, total, cellSize, 0x000000, 0.55).setStrokeStyle(4, color(colors.targetHighlight)),
        this.add
          .text(W / 2, y + cellSize / 2, 'TEST MODE  -  no turn order, any unit can act', textStyle(34, colors.targetHighlight))
          .setOrigin(0.5),
      );
    } else {
      items.push(this.add.text(x - 24, y + cellSize / 2, 'TURN ORDER', textStyle(34)).setOrigin(1, 0.5));
      for (let i = 0; i < cells; i++) {
        const cx = x + i * (cellSize + gap);
        const unit = queue[i] ? this.battle.get(queue[i]!) : undefined;
        const border = i === 0 ? colors.targetHighlight : unit?.side === 'party' ? colors.partySlot : colors.enemySlot;
        items.push(
          this.add.rectangle(cx, y, cellSize, cellSize, 0x000000, 0.55).setOrigin(0, 0).setStrokeStyle(i === 0 ? 7 : 4, color(border)),
        );
        const view = unit ? this.views.get(unit.uid) : undefined;
        if (view) {
          const img = this.add.image(cx + cellSize / 2, y + cellSize / 2, view.sprite.texture.key, view.sprite.frame.name);
          img.setScale((cellSize - 14) / img.frame.height);
          if (unit?.side === 'enemy') img.setFlipX(true);
          items.push(img);
        }
        if (i === 0 && unit) items.push(this.add.text(cx + cellSize / 2, y + cellSize + 6, 'NOW', textStyle(26, colors.targetHighlight)).setOrigin(0.5, 0));
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
      delay: layout.animation.announceMs,
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
    const slots = c.side === 'party' ? layout.partySlots : layout.enemySlots;
    const slot = slots[c.slot];
    if (!slot) return undefined;
    const view = new CombatantView(this, c, slot.x, slot.y);
    view.makeTappable(() => this.onCombatantTap(view));
    this.views.set(c.uid, view);
    return view;
  }

  private drawCommandPanel(): void {
    const p = layout.commandPanel;
    this.add.rectangle(0, p.y, W, H - p.y, color(colors.panel), 0.82).setOrigin(0, 0).setDepth(4500);
    this.refreshCommands();
  }

  private refreshCommands(): void {
    this.commandLayer?.destroy();
    const p = layout.commandPanel;
    const actor = this.activeActor;
    for (const v of this.views.values()) v.setActive(v.combatant.uid === actor?.uid && !this.battle.winner);

    const items: Phaser.GameObjects.GameObject[] = [];
    if (actor) {
      // Combatant is a live object, so hp/mp are read fresh on every refresh
      const by = p.y + (H - p.y - p.buttonHeight) / 2;
      const cy = by + p.buttonHeight / 2;
      const enemy = actor.side === 'enemy';
      const nameColor = enemy ? colors.hpFillEnemy : colors.text;
      items.push(
        this.add.text(p.padding, cy - 42, actor.name, textStyle(44, nameColor)).setOrigin(0, 0.5),
        this.add.text(p.padding, cy + 2, `HP ${actor.hp}/${actor.maxHp}   MP ${actor.mp}/${actor.maxMp}`, textStyle(26)).setOrigin(0, 0.5),
        this.add.text(p.padding, cy + 36, `SPD ${actor.stats.spd}  MP+${actor.stats.mpRegen}  -  ${this.turnLabel(actor)}`, textStyle(24, colors.turnCell)).setOrigin(0, 0.5),
      );
      let x = p.padding + p.infoWidth;
      for (const skillId of actor.skills) {
        const skill = content.skills[skillId];
        if (!skill) continue;
        const enabled = this.playerCanAct && this.battle.canUse(actor.uid, skillId).ok;
        items.push(...this.button(x, by, skill.name, this.skillSubLabel(actor, skill), enabled, () => this.chooseSkill(skillId)));
        x += p.buttonWidth + p.gap;
      }
    }
    this.commandLayer = this.add.container(0, 0, items).setDepth(4600);
  }

  /** Under the skill name: cost and cooldown (turns mode), or the remaining wait while cooling down. */
  private skillSubLabel(actor: Combatant, skill: SkillDef): string {
    const turns = this.battle.mode === 'turns';
    const remaining = turns ? (actor.cooldowns[skill.id] ?? 0) : 0;
    if (remaining > 0) return `Ready in ${remaining} turn${remaining > 1 ? 's' : ''}`;
    const parts = [costLabel(skill)];
    if (turns && (skill.cooldown ?? 0) > 0) parts.push(`CD ${skill.cooldown}`);
    return parts.filter(Boolean).join('  -  ');
  }

  private turnLabel(actor: Combatant): string {
    if (this.battle.mode === 'test') return 'Test mode';
    if (actor.side === 'enemy') return 'Enemy turn';
    return this.autoPlay ? 'Auto (AI)' : 'Your turn';
  }

  private button(
    x: number,
    y: number,
    label: string,
    sub: string,
    enabled: boolean,
    onTap: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const { buttonWidth: bw, buttonHeight: bh } = layout.commandPanel;
    const bg = this.add
      .rectangle(x, y, bw, bh, color(colors.button))
      .setOrigin(0, 0)
      .setStrokeStyle(5, color(colors.buttonBorder))
      .setAlpha(enabled ? 1 : 0.45);
    const text = this.add
      .text(x + bw / 2, y + bh / 2 - (sub ? 18 : 0), label, textStyle(40))
      .setOrigin(0.5)
      .setAlpha(enabled ? 1 : 0.6);
    if (text.width > bw - 24) text.setScale((bw - 24) / text.width); // long names must fit the button
    const items: Phaser.GameObjects.GameObject[] = [bg, text];
    if (sub) {
      items.push(
        this.add
          .text(x + bw / 2, y + bh / 2 + 30, sub, textStyle(28, colors.damage))
          .setOrigin(0.5)
          .setAlpha(enabled ? 1 : 0.6),
      );
    }
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => bg.setFillStyle(color(colors.buttonPressed)));
      bg.on('pointerout', () => bg.setFillStyle(color(colors.button)));
      bg.on('pointerup', () => {
        bg.setFillStyle(color(colors.button));
        onTap();
      });
    }
    return items;
  }

  private showResult(victory: boolean): void {
    const overlay = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0, 0).setDepth(6000);
    const title = this.add
      .text(W / 2, H / 2 - 80, victory ? 'Victory!' : 'Defeat', textStyle(140, victory ? colors.damage : colors.hpFillEnemy))
      .setOrigin(0.5)
      .setDepth(6001)
      .setAlpha(0);
    const items = this.button(W / 2 - layout.commandPanel.buttonWidth / 2, H / 2 + 40, 'Play again', '', true, () =>
      this.scene.restart({ seed: Math.floor(Date.now() % 1_000_000_000) }),
    );
    for (const item of items) (item as Phaser.GameObjects.Components.Depth & Phaser.GameObjects.GameObject).setDepth(6002);
    this.tweens.add({ targets: overlay, fillAlpha: 0.55, duration: 300 });
    this.tweens.add({ targets: title, alpha: 1, duration: 300 });
  }
}

function costLabel(skill: SkillDef): string {
  return skill.cost.amount > 0 ? `${skill.cost.amount} ${skill.cost.resource.toUpperCase()}` : '';
}
