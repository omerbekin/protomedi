import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { content, describePassive, describeSkill, describeStat, primaryBonusInfo } from '../../engine';
import type { CombatantDef, Teams } from '../../engine';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { ensureIcon, ensureSkillIcon } from '../icons';
import { ownerOfUnit } from '../asset-versions';
import { PRIMARY_GOLD, STAT_COLOR, STAT_ICON, STAT_LABEL } from '../../ui/stat-icons';
import { initialSizes, newSeed } from '../seed';
import { buildBackdrop, buildTip, classAvatar, ensureGlow, fitText, fx, goldText, makeMenuButton, placeTip, serif } from '../menu-ui';
import type { MenuButton, TipContent } from '../menu-ui';
import { groupColor } from '../class-order';
import { archetypeOf, clampSize, freeCellFor, isTeamFull, isTestClass, missingMessage, pipLayout, randomizePool, rangeOf, rosterGroups, rosterIds, rosterLayout, sizeSummary, stepSize, teamCount, trimToSize } from '../team-select-model';
import { skillMiniGrid } from '../../ui/shape-diagram';
import { drawQuadTile } from '../shape-draw';
import type { SideSizes } from '../team-select-model';
import { cornerOrnaments, frameRect, glowRect, GOLD, makePanel } from '../ui-frame';

const { width: W, height: H, colors } = layout;
const { rows: ROWS, lanes: LANES } = content.GRID;
const CELLS = content.CELL_COUNT;
const hexNum = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;

type Side = 'party' | 'enemies';

export interface TeamSelectData {
  teams: Teams;
  /** Takım boyutları (her taraf 1-12); yoksa takımların doluluğu, o da yoksa adres/varsayılan 5-5. */
  sizes: SideSizes;
}

/** Boyut seçicinin ayarları (START düğmesinin sağında). */
const STEPPER = { cx: { party: 1340, enemies: 1640 } as Record<Side, number>, labelY: 984, rowY: 1030, btn: 52, valueW: 64 };

// --- Yerleşim (1920x1080) ---
const PANEL_Y = 146;
const PANEL_W = 880;
const PANEL_H = 462;
const PANEL_X: Record<Side, number> = { party: 40, enemies: 1000 };
const GRID_TOP = 250;
const SLOT_W = 190;
const SLOT_H = 108;
const COL_GAP = 17;
const LANE_GAP = 14;
const ROSTER = { x: 40, y: 616, w: 1840, h: 320 };
const CARD = { w: 188, h: 270 };
/** Extra width of the divider between two primary-stat groups on the class shelf. */
const ROSTER_SEP = 14;
const PRIMARY_GROUP = colors.primaryGroup as Record<string, string>;
const SIDE_HEX: Record<Side, string> = { party: colors.partySlot, enemies: colors.enemySlot };
const SIDE_TITLE: Record<Side, string> = { party: 'PLAYER', enemies: 'ENEMY' };
const SIDE_NAME: Record<Side, string> = { party: 'Player', enemies: 'Enemy' };
const ATTRS: Array<'str' | 'dex' | 'int' | 'luck'> = ['str', 'dex', 'int', 'luck'];

/** Axis-aligned rectangle as a quad (corners clockwise) for the common cell plate. */
const rectQuad = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

interface SlotRect {
  side: Side;
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hot: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Container;
}

interface StepButton {
  setEnabled(on: boolean): void;
}

interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  key: string;
  tip: () => TipContent;
}

interface CardView {
  def: CombatantDef;
  outer: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  selected: Phaser.GameObjects.Graphics;
  gems: Record<Side, { gem: Phaser.GameObjects.Container; count: Phaser.GameObjects.Text }>;
  regions: HitRegion[];
  scale: number;
  baseY: number;
  avatarAt: { x: number; y: number };
}

/**
 * Start screen: choose 5 classes for your team and 5 for the enemy team, then start the battle.
 * Each team is a formation grid: 4 rows (depth, row 1 = front) with up to 3 characters per row. Drag a character to another cell to move or swap it.
 * A team is a cell list: index = row * 3 + lane, '' = empty cell. The class roster is read from data/classes (new classes appear automatically).
 */
export class TeamSelectScene extends Phaser.Scene {
  static readonly KEY = 'TeamSelectScene';

  private teams: Record<Side, string[]> = { party: [], enemies: [] };
  /** Seçilen takım boyutları (her taraf 1-12); START yalnızca iki takım da bu boyuta eşit olunca açılır. */
  private sizes: SideSizes = initialSizes();
  private sizeUi: Partial<Record<Side, { value: Phaser.GameObjects.Text; minus: StepButton; plus: StepButton }>> = {};
  private sizeSummaryText?: Phaser.GameObjects.Text;
  private active: Side = 'party';
  private readonly emptyCells = (): string[] => Array.from({ length: CELLS }, () => '');
  private slotLayer: Record<Side, Phaser.GameObjects.Container | undefined> = { party: undefined, enemies: undefined };
  private headLayer: Record<Side, Phaser.GameObjects.Container | undefined> = { party: undefined, enemies: undefined };
  private activeGlow: Record<Side, Phaser.GameObjects.Graphics | undefined> = { party: undefined, enemies: undefined };
  private slotRects: SlotRect[] = [];
  private cards = new Map<string, CardView>();
  private drag?: { side: Side; from: number; sx: number; sy: number; moved: boolean; ghost?: Phaser.GameObjects.Container; over: number | null };
  private cardDrag?: { id: string; sx: number; sy: number; moved: boolean; ghost?: Phaser.GameObjects.Container; over: { side: Side; i: number } | null };
  private pop?: { side: Side; cell: number; delay: number };
  private tip?: { key: string; container: Phaser.GameObjects.Container };
  private tipTimer?: Phaser.Time.TimerEvent;
  private startBtn?: MenuButton;
  private status?: Phaser.GameObjects.Text;
  private statusTween?: Phaser.Tweens.Tween;
  private starting = false;

  constructor() {
    super(TeamSelectScene.KEY);
  }

  init(data: Partial<TeamSelectData>): void {
    const pad = (cells: string[]) => Array.from({ length: CELLS }, (_, i) => cells[i] ?? '');
    // Sizes: given by the caller, else the size of the given teams, else the page address (?party=3&enemies=8) / default 5-5
    if (data.sizes) this.sizes = { party: clampSize(data.sizes.party), enemies: clampSize(data.sizes.enemies) };
    else if (data.teams) this.sizes = { party: clampSize(teamCount(data.teams.party) || this.sizes.party), enemies: clampSize(teamCount(data.teams.enemies) || this.sizes.enemies) };
    else this.sizes = initialSizes();
    this.sizeUi = {};
    this.sizeSummaryText = undefined;
    if (data.teams) this.teams = { party: trimToSize(pad(data.teams.party), this.sizes.party), enemies: trimToSize(pad(data.teams.enemies), this.sizes.enemies) };
    else if (this.count('party') === 0 && this.count('enemies') === 0) this.randomize('party', false);
    if (this.count('enemies') === 0) this.randomize('enemies', false);
    this.active = this.count('party') < this.sizes.party || this.count('enemies') >= this.sizes.enemies ? 'party' : 'enemies';
    this.slotLayer = { party: undefined, enemies: undefined };
    this.headLayer = { party: undefined, enemies: undefined };
    this.activeGlow = { party: undefined, enemies: undefined };
    this.slotRects = [];
    this.cards = new Map();
    this.drag = undefined;
    this.cardDrag = undefined;
    this.pop = undefined;
    this.tip = undefined;
    this.tipTimer = undefined;
    this.starting = false;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    const bgId = content.battles[content.DEFAULT_BATTLE]?.background ?? '';
    buildBackdrop(this, W, H, hasBackground(this, bgId) ? backgroundKey(bgId) : null);
    this.buildLogo();
    for (const side of ['party', 'enemies'] as const) this.buildPanel(side);
    this.buildVersus();
    this.buildRoster();
    this.buildFooter();
    this.refresh();
    this.cameras.main.fadeIn(380, 6, 3, 1);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.onDragMove(p);
      this.onCardDragMove(p);
      this.onCardHover(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.onDragEnd(p, false);
      this.onCardDragEnd(p, false);
    });
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      this.onDragEnd(p, true);
      this.onCardDragEnd(p, true);
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.start());
  }

  // --- State ---

  private randomize(side: Side, redraw = true): void {
    const seed = newSeed() + (side === 'party' ? 1 : 977);
    this.teams[side] = content.randomCells(content.randomTeam(seed, this.sizes[side], randomizePool()), seed);
    if (redraw) this.refresh();
  }

  private count(side: Side): number {
    return teamCount(this.teams[side] ?? []);
  }

  private ready(): boolean {
    return isTeamFull(this.teams.party, this.sizes.party) && isTeamFull(this.teams.enemies, this.sizes.enemies);
  }

  private other(side: Side): Side {
    return side === 'party' ? 'enemies' : 'party';
  }

  private setActive(side: Side): void {
    if (this.active === side) return;
    this.active = side;
    this.updateActiveVisuals();
    this.updateCards();
  }

  private start(): void {
    if (this.starting) return;
    if (!this.ready()) {
      this.startBtn?.shake();
      this.setStatus(this.missingText(), colors.lethal, true);
      return;
    }
    this.starting = true;
    this.hideTip(true);
    this.cameras.main.fadeOut(300, 6, 3, 1);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('BattleScene', {
        seed: newSeed(),
        mode: 'turns',
        battleId: content.DEFAULT_BATTLE,
        partySize: this.sizes.party,
        enemySize: this.sizes.enemies,
        teams: { party: [...this.teams.party], enemies: [...this.teams.enemies] } satisfies Teams, // cell lists (index = slot)
      });
    });
  }

  /** New Game from the settings menu: random teams of the chosen sizes, straight into a battle (same as the result screen's New Game). */
  newGame(): void {
    if (this.starting) return;
    this.starting = true;
    this.hideTip(true);
    this.scene.start('BattleScene', { seed: newSeed(), mode: 'turns', battleId: content.DEFAULT_BATTLE, partySize: this.sizes.party, enemySize: this.sizes.enemies, teams: undefined });
  }

  private missingText(): string {
    return missingMessage(this.teams, this.sizes);
  }

  /** Changes the size of one team (1-12); extra members are dropped from the back cells, missing ones must be picked (or randomized). */
  private setSize(side: Side, n: number): void {
    const next = clampSize(n);
    if (next === this.sizes[side]) return;
    this.sizes[side] = next;
    this.teams[side] = trimToSize(this.teams[side], next);
    this.active = this.count(side) < next ? side : this.active;
    this.refresh();
  }

  /** Adds a class to the active team (cell chosen by the formation rule); `from` is the card avatar position for the fly animation. */
  private addClass(id: string, cell?: { side: Side; i: number }): void {
    const def = content.classes[id];
    if (!def) return;
    let side = cell?.side ?? this.active;
    let i = cell?.i ?? -1;
    const replacing = cell !== undefined && !!this.teams[side][i];
    if (!replacing && this.count(side) >= this.sizes[side]) {
      this.setStatus(this.ready() ? 'Both teams are full. Tap a champion to remove it, or drag to rearrange.' : `${SIDE_NAME[side]} team is full (${this.sizes[side]}). Change the size below, or tap a champion to remove it.`, colors.lethal, true);
      this.pulseActive(side);
      return;
    }
    if (i < 0) i = freeCellFor(this.teams[side], id);
    if (i < 0) return;
    this.teams[side][i] = id;
    const card = this.cards.get(id);
    if (card) this.flyAvatar(card, side, i);
    this.pop = { side, cell: i, delay: card && !cell ? 230 : 0 };
    if (this.count(side) >= this.sizes[side] && this.count(this.other(side)) < this.sizes[this.other(side)]) side = this.other(side);
    this.active = side;
    this.refresh();
  }

  // --- Static scenery ---

  private buildLogo(): void {
    const cx = W / 2;
    const w = 640;
    const h = 86;
    const x = cx - w / 2;
    const y = 12;
    // Fading gold rules left and right of the plaque
    const rules = this.add.graphics().setDepth(20);
    for (const dir of [-1, 1]) {
      const start = cx + dir * (w / 2 + 20);
      const len = 560;
      const steps = 56;
      for (let s = 0; s < steps; s++) {
        const a = 1 - s / steps;
        const x0 = start + dir * (s * len / steps);
        rules.lineStyle(2, GOLD.light, a * 0.8).lineBetween(x0, y + h / 2, x0 + dir * (len / steps + 1), y + h / 2);
        rules.lineStyle(1, GOLD.edge, a * 0.6).lineBetween(x0, y + h / 2 + 7, x0 + dir * (len / steps + 1), y + h / 2 + 7);
        rules.lineStyle(1, GOLD.edge, a * 0.6).lineBetween(x0, y + h / 2 - 7, x0 + dir * (len / steps + 1), y + h / 2 - 7);
      }
      const tipX = start + dir * 6;
      rules.fillStyle(0x1a1008, 1).fillPoints([{ x: tipX, y: y + h / 2 - 8 }, { x: tipX + 8, y: y + h / 2 }, { x: tipX, y: y + h / 2 + 8 }, { x: tipX - 8, y: y + h / 2 }], true);
      rules.lineStyle(2, GOLD.bright, 1).strokePoints([{ x: tipX, y: y + h / 2 - 8 }, { x: tipX + 8, y: y + h / 2 }, { x: tipX, y: y + h / 2 + 8 }, { x: tipX - 8, y: y + h / 2 }], true);
    }
    this.add.image(cx, y + h / 2, ensureGlow(this)).setDepth(19).setTint(0xffb860).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w * 1.3, h * 2.4).setAlpha(fx(0.3)); // sabit, nabızsız
    const plate = makePanel(this, x, y, w, h, { top: 0x33261a, bottom: 0x120b07, bevel: 5, grain: 0.8 });
    for (const o of plate) (o as Phaser.GameObjects.Components.Depth & Phaser.GameObjects.GameObject).setDepth?.(21);
    const swordL = this.add.image(x + 56, y + h / 2, ensureIcon(this, 'sword', '#e8c47e', false)).setDisplaySize(50, 50).setDepth(22);
    const swordR = this.add.image(x + w - 56, y + h / 2, ensureIcon(this, 'sword', '#e8c47e', false)).setDisplaySize(50, 50).setDepth(22).setFlipX(true);
    swordL.setAngle(-8);
    swordR.setAngle(8);
    const shadow = serif(this, cx + 2, y + h / 2 + 4, 'ProtoMedi', 66, '#000000', { stroke: 0 }).setOrigin(0.5).setDepth(22).setAlpha(0.55);
    const title = goldText(this, cx, y + h / 2 + 1, 'ProtoMedi', 66, 3).setOrigin(0.5).setDepth(23);
    void shadow;
    // Light sweep across the plaque
    const shine = this.add.graphics().setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
    shine.fillStyle(0xffe6a8, fx(0.3)).fillPoints([{ x: 0, y: y }, { x: 46, y: y }, { x: 18, y: y + h }, { x: -28, y: y + h }], true);
    const maskG = this.make.graphics({ x: 0, y: 0 });
    maskG.fillRect(x + 6, y + 6, w - 12, h - 12);
    shine.setMask(maskG.createGeometryMask());
    shine.setX(x - 80);
    this.tweens.add({ targets: shine, x: x + w + 60, duration: 1500, ease: 'Sine.easeInOut', repeat: -1, repeatDelay: 16000, delay: 4000 });
    void title;
    serif(this, cx, y + h + 22, 'ASSEMBLE YOUR CHAMPIONS', 19, '#b9a27a', { spacing: 5, stroke: 3 }).setOrigin(0.5).setDepth(22);
  }

  private buildVersus(): void {
    const cx = W / 2;
    const cy = PANEL_Y + PANEL_H / 2;
    const g = this.add.graphics().setDepth(20);
    g.lineStyle(2, GOLD.edge, 0.55).lineBetween(cx, PANEL_Y + 20, cx, cy - 44).lineBetween(cx, cy + 44, cx, PANEL_Y + PANEL_H - 20);
    g.fillStyle(0x140d08, 1).fillCircle(cx, cy, 38);
    g.lineStyle(4, GOLD.edge, 1).strokeCircle(cx, cy, 38);
    g.lineStyle(1.5, GOLD.light, 0.9).strokeCircle(cx, cy, 31);
    g.fillStyle(GOLD.light, 1);
    for (const [dx, dy] of [[0, -44], [0, 44]] as const) g.fillPoints([{ x: cx + dx, y: cy + dy - 6 }, { x: cx + dx + 5, y: cy + dy }, { x: cx + dx, y: cy + dy + 6 }, { x: cx + dx - 5, y: cy + dy }], true);
    goldText(this, cx, cy + 1, 'VS', 30, 1).setOrigin(0.5).setDepth(21);
  }

  private buildPanel(side: Side): void {
    const px = PANEL_X[side];
    const hex = hexNum(SIDE_HEX[side]);
    const panel = makePanel(this, px, PANEL_Y, PANEL_W, PANEL_H, { top: 0x2a2018, bottom: 0x0d0806, bevel: 5, grain: 0.75, alpha: 0.96 });
    for (const o of panel) (o as Phaser.GameObjects.Components.Depth & Phaser.GameObjects.GameObject).setDepth?.(10);
    // Side-coloured banner tint along the header
    const tint = this.add.graphics().setDepth(11);
    tint.fillGradientStyle(hex, hex, hex, hex, 0.24, 0.0, 0.1, 0).fillRect(px + 8, PANEL_Y + 8, PANEL_W - 16, 66);
    tint.lineStyle(1, GOLD.edge, 0.7).lineBetween(px + 22, PANEL_Y + 76, px + PANEL_W - 22, PANEL_Y + 76);
    tint.fillStyle(GOLD.light, 0.9).fillPoints([{ x: px + PANEL_W / 2, y: PANEL_Y + 72 }, { x: px + PANEL_W / 2 + 5, y: PANEL_Y + 76 }, { x: px + PANEL_W / 2, y: PANEL_Y + 80 }, { x: px + PANEL_W / 2 - 5, y: PANEL_Y + 76 }], true);
    // Crest + title
    const crest = this.add.graphics().setDepth(12);
    const cx0 = px + 56;
    const cy0 = PANEL_Y + 42;
    crest.fillStyle(0x120c07, 1).fillPoints([{ x: cx0, y: cy0 - 26 }, { x: cx0 + 22, y: cy0 - 8 }, { x: cx0 + 16, y: cy0 + 20 }, { x: cx0, y: cy0 + 28 }, { x: cx0 - 16, y: cy0 + 20 }, { x: cx0 - 22, y: cy0 - 8 }], true);
    crest.lineStyle(3, GOLD.edge, 1).strokePoints([{ x: cx0, y: cy0 - 26 }, { x: cx0 + 22, y: cy0 - 8 }, { x: cx0 + 16, y: cy0 + 20 }, { x: cx0, y: cy0 + 28 }, { x: cx0 - 16, y: cy0 + 20 }, { x: cx0 - 22, y: cy0 - 8 }], true);
    crest.fillStyle(hex, 0.95).fillPoints([{ x: cx0, y: cy0 - 18 }, { x: cx0 + 15, y: cy0 - 5 }, { x: cx0 + 11, y: cy0 + 15 }, { x: cx0, y: cy0 + 21 }, { x: cx0 - 11, y: cy0 + 15 }, { x: cx0 - 15, y: cy0 - 5 }], true);
    crest.fillStyle(0xffffff, 0.22).fillPoints([{ x: cx0, y: cy0 - 18 }, { x: cx0 + 15, y: cy0 - 5 }, { x: cx0, y: cy0 + 2 }, { x: cx0 - 15, y: cy0 - 5 }], true);
    goldText(this, px + 96, cy0 - 2, SIDE_TITLE[side], 40, 3).setOrigin(0, 0.5).setDepth(12);

    // Active (picking) glow around the whole panel
    const glow = this.add.graphics().setDepth(13);
    glowRect(glow, px, PANEL_Y, PANEL_W, PANEL_H, GOLD.bright, 0.85, 6);
    glow.setAlpha(0);
    this.activeGlow[side] = glow;
    const hdr = this.add.zone(px, PANEL_Y, PANEL_W, 80).setOrigin(0, 0).setDepth(14).setInteractive({ useHandCursor: true });
    hdr.on('pointerup', () => this.setActive(side));
    this.add.zone(px, PANEL_Y + 80, PANEL_W, PANEL_H - 80).setOrigin(0, 0).setDepth(9).setInteractive().on('pointerup', () => this.setActive(side));

    // Column labels: row 1 (front) faces the middle of the screen
    for (let c = 0; c < ROWS; c++) {
      const row = side === 'party' ? ROWS - 1 - c : c;
      const x = px + 34 + c * (SLOT_W + COL_GAP) + SLOT_W / 2;
      const label = row === 0 ? 'FRONT' : row === ROWS - 1 ? 'BACK' : `ROW ${row + 1}`;
      const t = serif(this, x, PANEL_Y + 96, label, 15, row === 0 ? '#ffe29a' : '#a8946f', { spacing: 3, stroke: 2 }).setOrigin(0.5).setDepth(12);
      if (row === 0) {
        const tg = this.add.graphics().setDepth(12).fillStyle(GOLD.bright, 0.95);
        const tx = side === 'party' ? x + t.width / 2 + 14 : x - t.width / 2 - 14;
        const d = side === 'party' ? 1 : -1;
        tg.fillPoints([{ x: tx - d * 5, y: PANEL_Y + 90 }, { x: tx + d * 5, y: PANEL_Y + 96 }, { x: tx - d * 5, y: PANEL_Y + 102 }], true);
      }
    }
    // Dice / clear
    const bx = px + PANEL_W - 34;
    this.iconButton(bx - 26, PANEL_Y + 40, 'cross', 'Clear team', () => {
      this.teams[side] = this.emptyCells();
      this.active = side;
      this.refresh();
    });
    this.iconButton(bx - 26 - 66, PANEL_Y + 40, 'dice', 'Randomize team', () => {
      this.active = side;
      this.randomize(side);
    });
  }

  private buildFooter(): void {
    this.startBtn = makeMenuButton(this, W / 2, 1018, 500, 88, 'START BATTLE', () => this.start(), { primary: true, size: 42 });
    this.startBtn.container.setDepth(30);
    const rand = makeMenuButton(
      this,
      380,
      1018,
      360,
      66,
      'Randomize both',
      () => {
        this.randomize('party', false);
        this.randomize('enemies');
      },
      { size: 28 },
    );
    rand.container.setDepth(30);
    this.status = serif(this, W / 2, 957, '', 22, colors.muted, { stroke: 3 }).setOrigin(0.5).setDepth(30);
    // Team sizes: two small steppers (- value +) right of START, plus a one-line summary
    this.sizeSummaryText = serif(this, (STEPPER.cx.party + STEPPER.cx.enemies) / 2, 957, '', 22, '#ffe29a', { stroke: 3 }).setOrigin(0.5).setDepth(30);
    for (const side of ['party', 'enemies'] as const) this.buildStepper(side);
  }

  /** `- 5 +` size picker for one team (44px+ touch targets). */
  private buildStepper(side: Side): void {
    const { cx: cxs, labelY, rowY, btn, valueW } = STEPPER;
    const cx = cxs[side];
    const hex = hexNum(SIDE_HEX[side]);
    serif(this, cx, labelY, `${SIDE_NAME[side]} size`, 18, '#b9a27a', { spacing: 2, stroke: 3 }).setOrigin(0.5).setDepth(30);
    const gap = 10;
    const mk = (dx: number, sign: -1 | 1): StepButton => {
      const g = this.add.graphics();
      let enabled = true;
      const draw = (hover: boolean): void => {
        g.clear();
        g.fillGradientStyle(hover && enabled ? 0x7a5532 : 0x5c4128, hover && enabled ? 0x7a5532 : 0x5c4128, 0x24170d, 0x24170d, enabled ? 1 : 0.55).fillRect(-btn / 2, -btn / 2, btn, btn);
        frameRect(g, -btn / 2, -btn / 2, btn, btn, { bevel: 3, alpha: enabled ? 1 : 0.5 });
        g.lineStyle(7, enabled ? 0xf3e4c4 : 0x7d6f62, 1).lineBetween(-11, 0, 11, 0);
        if (sign > 0) g.lineBetween(0, -11, 0, 11);
      };
      draw(false);
      const c = this.add.container(cx + dx, rowY, [g]).setDepth(30);
      const zone = this.add.zone(0, 0, btn + 6, btn + 6).setInteractive({ useHandCursor: true });
      c.add(zone);
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerdown', () => enabled && this.tweens.add({ targets: c, scale: 0.92, duration: 60 }));
      zone.on('pointerup', () => {
        this.tweens.add({ targets: c, scale: 1, duration: 80 });
        this.setSize(side, stepSize(this.sizes[side], sign));
      });
      return {
        setEnabled: (on: boolean) => {
          enabled = on;
          draw(false);
        },
      };
    };
    const half = valueW / 2 + gap + btn / 2;
    const minus = mk(-half, -1);
    const plus = mk(half, 1);
    const plate = this.add.graphics().setDepth(30);
    plate.fillStyle(0x0c0806, 0.85).fillRect(cx - valueW / 2, rowY - 24, valueW, 48);
    frameRect(plate, cx - valueW / 2, rowY - 24, valueW, 48, { bevel: 3, edge: GOLD.edge, light: hex });
    const value = goldText(this, cx, rowY + 1, String(this.sizes[side]), 34, 1).setOrigin(0.5).setDepth(31);
    this.sizeUi[side] = { value, minus, plus };
  }

  private setStatus(text: string, hex: string, pulse = false): void {
    if (!this.status) return;
    this.status.setText(text).setColor(hex);
    if (pulse) {
      this.statusTween?.stop();
      this.status.setScale(1.14);
      this.statusTween = this.tweens.add({ targets: this.status, scale: 1, duration: 360, ease: 'Back.easeOut' });
    }
  }

  private iconButton(cx: number, cy: number, kind: 'dice' | 'cross', hint: string, onTap: () => void): void {
    const size = 52;
    const g = this.add.graphics();
    const draw = (hover: boolean) => {
      g.clear();
      g.fillGradientStyle(hover ? 0x7a5532 : 0x5c4128, hover ? 0x7a5532 : 0x5c4128, 0x24170d, 0x24170d, 1).fillRect(-size / 2, -size / 2, size, size);
      frameRect(g, -size / 2, -size / 2, size, size, { bevel: 3 });
      if (kind === 'dice') {
        g.fillStyle(0xf3e4c4, 1).fillRoundedRect(-14, -14, 28, 28, 5);
        g.fillStyle(0x2a1a0e, 1);
        for (const [dx, dy] of [[-7, -7], [7, -7], [0, 0], [-7, 7], [7, 7]] as const) g.fillCircle(dx, dy, 3);
      } else {
        g.lineStyle(7, 0xd9584a, 1).lineBetween(-11, -11, 11, 11).lineBetween(11, -11, -11, 11);
        g.lineStyle(2, 0xffb0a0, 0.8).lineBetween(-11, -13, 11, 9);
      }
    };
    draw(false);
    const c = this.add.container(cx, cy, [g]).setDepth(15);
    const zone = this.add.zone(0, 0, size + 6, size + 6).setInteractive({ useHandCursor: true });
    c.add(zone);
    zone.on('pointerover', () => {
      draw(true);
      this.tweens.add({ targets: c, scale: 1.08, duration: 100 });
      this.showTip(`btn:${kind}:${cx}`, { title: hint, rows: [], width: 230 }, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'below');
    });
    zone.on('pointerout', () => {
      draw(false);
      this.tweens.add({ targets: c, scale: 1, duration: 120 });
      this.hideTip();
    });
    zone.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 60 }));
    zone.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1.08, duration: 80 });
      this.hideTip(true);
      onTap();
    });
  }

  // --- Roster (class cards) ---

  private buildRoster(): void {
    const { x, y, w, h } = ROSTER;
    for (const o of makePanel(this, x, y, w, h, { top: 0x2a2018, bottom: 0x0d0806, bevel: 5, grain: 0.75, alpha: 0.96 })) (o as Phaser.GameObjects.Components.Depth & Phaser.GameObjects.GameObject).setDepth?.(10);
    const head = this.add.graphics().setDepth(11);
    head.lineStyle(1, GOLD.edge, 0.7).lineBetween(x + 22, y + 48, x + w - 22, y + 48);
    head.fillStyle(GOLD.light, 0.9).fillPoints([{ x: x + w / 2, y: y + 44 }, { x: x + w / 2 + 5, y: y + 48 }, { x: x + w / 2, y: y + 52 }, { x: x + w / 2 - 5, y: y + 48 }], true);
    goldText(this, x + 36, y + 24, 'CLASSES', 26, 4).setOrigin(0, 0.5).setDepth(12);
    serif(this, x + w - 36, y + 25, 'Tap a class to add it to the glowing team  -  or drag it onto a slot', 18, '#a8946f', { bold: false, stroke: 2 }).setOrigin(1, 0.5).setDepth(12);

    const ids = rosterIds();
    const groupOf = new Map<string, number>();
    rosterGroups().forEach((g, gi) => g.items.forEach((c) => groupOf.set(c.id, gi)));
    const groupCount = new Set(groupOf.values()).size;
    // Extra room for the thin coloured dividers between STR / DEX / INT / LCK groups (worst case: all of them in one row)
    const area = { x: x + 24, y: y + 62, w: w - 48, h: h - 62 - 12 };
    const lay = rosterLayout(ids.length, area.w - Math.max(0, groupCount - 1) * ROSTER_SEP, area.h, CARD.w, CARD.h);
    const rowIds = (r: number) => ids.slice(r * lay.cols, (r + 1) * lay.cols);
    const breaks = (arr: string[], k: number) => k > 0 && groupOf.get(arr[k]!) !== groupOf.get(arr[k - 1]!);
    const rowsWidth = (r: number) => {
      const arr = rowIds(r);
      return arr.length * lay.cardW + (arr.length - 1) * lay.gap + arr.reduce((n, _, k) => n + (breaks(arr, k) ? ROSTER_SEP : 0), 0);
    };
    const dividers = this.add.graphics().setDepth(12);
    const blockH = lay.rows * lay.cardH + (lay.rows - 1) * lay.gap;
    for (let r = 0; r < lay.rows; r++) {
      const arr = rowIds(r);
      let cursor = area.x + (area.w - rowsWidth(r)) / 2;
      const cy = area.y + r * (lay.cardH + lay.gap) + lay.cardH / 2 + (area.h - blockH) / 2;
      arr.forEach((id, k) => {
        if (breaks(arr, k)) {
          const col = hexNum(groupColor(PRIMARY_GROUP, content.classes[id]?.primary));
          const lx = cursor + (ROSTER_SEP - lay.gap) / 2; // middle of the gap between the two cards
          dividers.lineStyle(2, col, 0.75).lineBetween(lx, cy - lay.cardH / 2 + 6, lx, cy + lay.cardH / 2 - 6);
          cursor += ROSTER_SEP;
        }
        this.cards.set(id, this.buildCard(content.classes[id]!, cursor + lay.cardW / 2, cy, lay.scale));
        cursor += lay.cardW + lay.gap;
      });
    }
  }

  private statCell(def: CombatantDef, kind: (typeof ATTRS)[number]): TipContent {
    const info = describeStat(kind, def.stats, content.formulas);
    return {
      title: info.bonus ? `${info.title} - ${info.bonus.name}` : info.title,
      titleHex: info.primary ? PRIMARY_GOLD : STAT_COLOR[kind],
      icon: ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false),
      rows: info.lines.map((l): [string] => [l]),
      width: 400,
    };
  }

  private skillTip(def: CombatantDef, skillId: string): TipContent | null {
    const skill = content.skills[skillId];
    if (!skill) return null;
    const info = describeSkill(skill, def.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    const elementHex = (k: (typeof info.kinds)[number]): string | undefined => (k === 'shield' ? colors.shield : k === 'magicShield' ? colors.magicShield : k ? colors.element[k] : undefined);
    const rows: Array<[string, string?]> = [[`Cost: ${info.cost}     Cooldown: ${info.cooldown}`, colors.muted]];
    info.lines.forEach((l, i) => rows.push([l, elementHex(info.kinds[i])]));
    if (info.initialCooldown) rows.push([info.initialCooldown, colors.muted]);
    const shape = skillMiniGrid(skill, content.formulas.formation);
    return { title: info.name, titleHex: '#f4ede1', icon: ensureSkillIcon(this, skill), badge: info.targetBadge, ...(shape ? { shape } : {}), rows, width: 450 };
  }

  private classTip(def: CombatantDef): TipContent {
    const f = content.formulas;
    const s = def.stats;
    const rows: Array<[string, string?]> = [];
    if (isTestClass(def)) rows.push(['Test class: left out of random teams, add it by hand', '#ffb347']);
    if (def.primary) {
      const b = primaryBonusInfo(def.primary, f, true);
      rows.push([`Primary stat ${def.primary.toUpperCase()} - ${b.name}: ${b.detail}`, PRIMARY_GOLD]);
    }
    rows.push([`HP ${s.hp}    MP ${s.mp}    SPD ${s.spd}`]);
    rows.push([`Armor ${s.armor}${s.magicArmor > 0 ? `    Magic armor ${s.magicArmor}` : ''}    Crit ${(s.critChance * 100).toFixed(1).replace(/\.0$/, '')}% x${s.critMult.toFixed(2)}`]);
    if (def.passive) {
      rows.push([`Passive - ${def.passive.name}`, '#ffe29a']);
      rows.push([describePassive(def.passive, s, f), '#cdbf9f']);
    }
    rows.push(['Skills', '#ffe29a']);
    for (const id of def.skills) {
      const sk = content.skills[id];
      if (!sk) continue;
      const info = describeSkill(sk, s, f, content.summons, { statuses: content.statuses, grounds: content.grounds });
      rows.push([`${info.name}  -  ${info.cost}${(sk.cooldown ?? 0) > 0 ? `, cd ${sk.cooldown}` : ''}`, '#cdbf9f']);
    }
    return { title: def.name, titleHex: '#ffe29a', icon: ensureIcon(this, def.logo, def.color, false, ownerOfUnit(def.id)), badge: `${archetypeOf(def)} - ${rangeOf(def)}`, rows, width: 470 };
  }

  private buildCard(def: CombatantDef, cx: number, cy: number, scale: number): CardView {
    const col = hexNum(def.color);
    const inner = this.add.container(-CARD.w / 2, -CARD.h / 2);
    const glow = this.add.image(0, 0, ensureGlow(this)).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(CARD.w * 1.4, CARD.h * 1.2).setAlpha(0);
    const outer = this.add.container(cx, cy, [glow, inner]).setScale(scale).setDepth(15);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (inner.add(o), o);

    makePanel(this, 0, 0, CARD.w, CARD.h, { top: 0x2f241a, bottom: 0x0f0a07, bevel: 3, ornaments: false, grain: 0.65 }).forEach((o) => {
      inner.add(o);
    });
    const tint = add(this.add.graphics());
    tint.fillGradientStyle(col, col, col, col, 0.3, 0.3, 0, 0).fillRect(5, 5, CARD.w - 10, 150);
    cornerOrnaments(tint, 0, 0, CARD.w, CARD.h, 3);

    // Primary-stat group accent: coloured top strip + inner outline, and an icon + letters badge straddling the top edge (colour-blind safe)
    const grp = def.primary ? hexNum(groupColor(PRIMARY_GROUP, def.primary)) : null;
    if (grp !== null && def.primary) {
      const accent = add(this.add.graphics());
      accent.fillStyle(grp, 0.9).fillRect(5, 5, CARD.w - 10, 4);
      accent.lineStyle(1.5, grp, 0.55).strokeRect(4, 4, CARD.w - 8, CARD.h - 8);
    }

    // Avatar (head portrait) in a framed plate
    const px = 44;
    const py = 14;
    const ps = 100;
    const plate = add(this.add.graphics());
    plate.fillGradientStyle(0x1b130d, 0x1b130d, 0x0a0705, 0x0a0705, 1).fillRect(px, py, ps, ps);
    add(this.add.image(px + ps / 2, py + ps / 2, ensureGlow(this)).setTint(col).setDisplaySize(ps * 1.1, ps * 1.1).setAlpha(fx(0.55)).setBlendMode(Phaser.BlendModes.ADD));
    const head = add(classAvatar(this, def, px + ps / 2, py + ps / 2 + 1, ps - 6));
    head.setDepth(1);
    const plateFrame = add(this.add.graphics());
    frameRect(plateFrame, px, py, ps, ps, { bevel: 3, edge: GOLD.edge, light: GOLD.light });
    // Class logo medallion on the plate corner
    const medal = add(this.add.graphics());
    medal.fillStyle(0x120c07, 1).fillCircle(px + 4, py + ps - 6, 19);
    medal.lineStyle(3, GOLD.edge, 1).strokeCircle(px + 4, py + ps - 6, 19);
    medal.lineStyle(1, GOLD.light, 0.8).strokeCircle(px + 4, py + ps - 6, 15);
    add(this.add.image(px + 4, py + ps - 6, ensureIcon(this, def.logo, def.color, false, ownerOfUnit(def.id))).setDisplaySize(26, 26));

    // TEST ribbon for test classes (bottom-right corner of the avatar plate)
    if (isTestClass(def)) {
      const tg = add(this.add.graphics());
      tg.fillStyle(0x1a0f06, 1).fillRoundedRect(px + ps - 46, py + ps - 12, 54, 22, 5);
      tg.fillStyle(0xffb347, 1).fillRoundedRect(px + ps - 44, py + ps - 10, 50, 18, 4);
      add(serif(this, px + ps - 19, py + ps - 1, 'TEST', 14, '#2a1405', { spacing: 1, stroke: 0 }).setOrigin(0.5));
    }

    // Selection marks (gems in the top corners)
    const gems = {} as CardView['gems'];
    for (const side of ['party', 'enemies'] as const) {
      const gx = side === 'party' ? 16 : CARD.w - 16;
      const g = this.add.graphics();
      const hex = hexNum(SIDE_HEX[side]);
      g.fillStyle(0x120c07, 1).fillPoints([{ x: 0, y: -13 }, { x: 11, y: 0 }, { x: 0, y: 13 }, { x: -11, y: 0 }], true);
      g.fillStyle(hex, 1).fillPoints([{ x: 0, y: -9 }, { x: 7, y: 0 }, { x: 0, y: 9 }, { x: -7, y: 0 }], true);
      g.fillStyle(0xffffff, 0.35).fillPoints([{ x: 0, y: -9 }, { x: 7, y: 0 }, { x: 0, y: 0 }], true);
      g.lineStyle(2, GOLD.light, 1).strokePoints([{ x: 0, y: -13 }, { x: 11, y: 0 }, { x: 0, y: 13 }, { x: -11, y: 0 }], true);
      const count = serif(this, 0, 22, '', 15, SIDE_HEX[side]).setOrigin(0.5);
      const gem = this.add.container(gx, 24, [g, count]).setVisible(false);
      add(gem);
      gems[side] = { gem, count };
    }

    if (grp !== null && def.primary) {
      const bw = 62;
      const bh = 20;
      const bx = CARD.w / 2 - bw / 2;
      const by = -8;
      const badge = add(this.add.graphics());
      badge.fillStyle(0x120c07, 1).fillRoundedRect(bx, by, bw, bh, 6);
      badge.fillStyle(grp, 0.28).fillRoundedRect(bx, by, bw, bh, 6);
      badge.lineStyle(2, grp, 1).strokeRoundedRect(bx, by, bw, bh, 6);
      add(this.add.image(bx + 15, by + bh / 2, ensureIcon(this, STAT_ICON[def.primary], groupColor(PRIMARY_GROUP, def.primary), false)).setDisplaySize(15, 15));
      add(serif(this, bx + 25, by + bh / 2 + 1, STAT_LABEL[def.primary], 13, '#f6ead0', { spacing: 1, stroke: 2 }).setOrigin(0, 0.5));
    }

    // Name + archetype pill
    const name = fitText(add(serif(this, CARD.w / 2, 136, def.name, 26, '#f6ead0')).setOrigin(0.5), CARD.w - 22);
    void name;
    const tagText = serif(this, 0, 0, archetypeOf(def).toUpperCase(), 13, '#f0dcb0', { spacing: 2, stroke: 2 }).setOrigin(0.5);
    const tw = Math.min(CARD.w - 24, tagText.width + 22);
    const pill = add(this.add.graphics());
    pill.fillStyle(col, 0.28).fillRoundedRect(CARD.w / 2 - tw / 2, 152, tw, 22, 11);
    pill.lineStyle(1.5, col, 0.9).strokeRoundedRect(CARD.w / 2 - tw / 2, 152, tw, 22, 11);
    tagText.setPosition(CARD.w / 2, 163);
    fitText(tagText, tw - 10);
    add(tagText);
    const rule = add(this.add.graphics());
    rule.lineStyle(1, GOLD.edge, 0.7).lineBetween(14, 183, CARD.w - 14, 183);

    // Stats 2 x 2 (primary in gold)
    const regions: HitRegion[] = [];
    ATTRS.forEach((kind, i) => {
      const sx = 12 + (i % 2) * 86;
      const sy = 190 + Math.floor(i / 2) * 22;
      const primary = def.primary === kind;
      if (primary) {
        const hl = add(this.add.graphics());
        hl.fillStyle(0xffd700, 0.14).fillRoundedRect(sx - 3, sy - 1, 82, 20, 4);
        hl.lineStyle(1, 0xffd700, 0.5).strokeRoundedRect(sx - 3, sy - 1, 82, 20, 4);
      }
      add(this.add.image(sx + 8, sy + 9, ensureIcon(this, STAT_ICON[kind], STAT_COLOR[kind], false)).setDisplaySize(15, 15));
      add(serif(this, sx + 19, sy + 9, STAT_LABEL[kind], 12, primary ? PRIMARY_GOLD : '#b5a27e', { stroke: 2 }).setOrigin(0, 0.5));
      add(serif(this, sx + 76, sy + 9, String(def.stats[kind]), 17, primary ? PRIMARY_GOLD : '#f3e4c4', { stroke: 2 }).setOrigin(1, 0.5));
      regions.push({ x: sx - 3, y: sy - 1, w: 82, h: 20, key: `stat:${def.id}:${kind}`, tip: () => this.statCell(def, kind) });
    });

    // Skill icon strip + passive crest
    const strip = [...def.skills.map((id) => ({ skill: id })), ...(def.passive ? [{ passive: true as const }] : [])];
    const iconSize = 30;
    const gap = 5;
    const total = strip.length * iconSize + (strip.length - 1) * gap;
    let ix = (CARD.w - total) / 2;
    const iy = 237;
    for (const item of strip) {
      if ('skill' in item) {
        const sk = content.skills[item.skill];
        if (sk) add(this.add.image(ix + iconSize / 2, iy + iconSize / 2, ensureSkillIcon(this, sk)).setDisplaySize(iconSize, iconSize));
        regions.push({ x: ix, y: iy, w: iconSize, h: iconSize, key: `skill:${def.id}:${item.skill}`, tip: () => this.skillTip(def, item.skill) ?? { title: item.skill, rows: [] } });
      } else if (def.passive) {
        const p = def.passive;
        const pg = add(this.add.graphics());
        pg.fillStyle(0x1a1008, 1).fillCircle(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2);
        pg.lineStyle(2, GOLD.light, 1).strokeCircle(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2 - 1);
        add(this.add.image(ix + iconSize / 2, iy + iconSize / 2, ensureIcon(this, p.icon, def.color, false, ownerOfUnit(def.id))).setDisplaySize(21, 21));
        regions.push({
          x: ix,
          y: iy,
          w: iconSize,
          h: iconSize,
          key: `passive:${def.id}`,
          tip: () => ({ title: p.name, titleHex: '#ffe29a', icon: ensureIcon(this, p.icon, def.color, false, ownerOfUnit(def.id)), badge: 'Passive', rows: [[describePassive(p, def.stats, content.formulas)]], width: 420 }),
        });
      }
      ix += iconSize + gap;
    }

    // Selected overlay (bright gold frame + glow), toggled by state
    const selected = add(this.add.graphics()).setVisible(false);
    glowRect(selected, 0, 0, CARD.w, CARD.h, GOLD.bright, fx(0.9), 4);
    frameRect(selected, 0, 0, CARD.w, CARD.h, { bevel: 4, edge: GOLD.light, light: GOLD.bright });

    const zone = this.add.zone(cx, cy, CARD.w * scale, CARD.h * scale).setDepth(16).setInteractive({ useHandCursor: true });
    const view: CardView = { def, outer, glow, selected, gems, regions, scale, baseY: cy, avatarAt: { x: px + ps / 2, y: py + ps / 2 } };
    zone.on('pointerover', (p: Phaser.Input.Pointer) => {
      this.tweens.add({ targets: outer, y: view.baseY - 8, scale: scale * 1.045, duration: 140, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: glow, alpha: fx(0.5), duration: 160 });
      outer.setDepth(17);
      this.showTip(`class:${def.id}`, this.classTip(def), this.cardRect(view), 'above');
      this.onCardHover(p);
    });
    zone.on('pointerout', () => {
      this.tweens.add({ targets: outer, y: view.baseY, scale, duration: 160, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: 220 });
      outer.setDepth(15);
      this.hideTip();
    });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.tweens.add({ targets: outer, scale: scale * 0.97, duration: 70 });
      this.cardDrag = { id: def.id, sx: p.x, sy: p.y, moved: false, over: null };
    });
    zone.on('pointerup', () => this.tweens.add({ targets: outer, scale: scale * 1.045, duration: 90 }));
    zone.setData('card', view);
    return view;
  }

  private cardRect(c: CardView): { x: number; y: number; w: number; h: number } {
    const w = CARD.w * c.scale;
    const h = CARD.h * c.scale;
    return { x: c.outer.x - w / 2, y: c.baseY - h / 2, w, h };
  }

  /** Moving over a card: stat cells and skill icons get their own tooltip. */
  private onCardHover(p: Phaser.Input.Pointer): void {
    if (this.cardDrag?.moved || this.drag?.moved) return;
    for (const c of this.cards.values()) {
      const r = this.cardRect(c);
      if (p.x < r.x || p.x > r.x + r.w || p.y < r.y - 12 || p.y > r.y + r.h + 4) continue;
      const lx = (p.x - c.outer.x) / c.outer.scaleX + CARD.w / 2;
      const ly = (p.y - c.outer.y) / c.outer.scaleY + CARD.h / 2;
      const hit = c.regions.find((q) => lx >= q.x && lx <= q.x + q.w && ly >= q.y && ly <= q.y + q.h);
      if (hit) {
        this.showTip(hit.key, hit.tip(), r, 'above');
      } else this.showTip(`class:${c.def.id}`, this.classTip(c.def), r, 'above');
      return;
    }
  }

  /** Card visuals follow the teams: gems for membership, gold frame for classes in the active team. */
  private updateCards(): void {
    for (const c of this.cards.values()) {
      const inTeam: Record<Side, number> = { party: 0, enemies: 0 };
      for (const side of ['party', 'enemies'] as const) inTeam[side] = this.teams[side].filter((t) => t === c.def.id).length;
      for (const side of ['party', 'enemies'] as const) {
        const g = c.gems[side];
        g.gem.setVisible(inTeam[side] > 0);
        g.count.setText(inTeam[side] > 1 ? `x${inTeam[side]}` : '');
      }
      const sel = inTeam[this.active] > 0;
      c.selected.setVisible(sel);
      c.outer.setAlpha(this.count(this.active) >= this.sizes[this.active] && !sel ? 0.72 : 1);
    }
  }

  // --- Teams ---

  private updateActiveVisuals(): void {
    for (const side of ['party', 'enemies'] as const) {
      const g = this.activeGlow[side];
      if (!g) continue;
      this.tweens.killTweensOf(g);
      // Aktif takım: eskiden hızlı nabız (0,35-0,9 / 900ms); şimdi sabite yakın, çok yavaş.
      if (side === this.active) this.tweens.add({ targets: g, alpha: { from: fx(1.2), to: fx(1.5) }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      else this.tweens.add({ targets: g, alpha: 0, duration: 200 });
    }
  }

  private pulseActive(side: Side): void {
    const g = this.activeGlow[side];
    if (!g) return;
    this.tweens.add({ targets: this.headLayer[side], x: { from: 8, to: 0 }, duration: 260, ease: 'Bounce.easeOut' });
  }

  private refresh(): void {
    this.hideTip(true);
    this.slotRects = [];
    for (const side of ['party', 'enemies'] as const) this.drawTeam(side);
    this.updateActiveVisuals();
    this.updateCards();
    for (const side of ['party', 'enemies'] as const) {
      const ui = this.sizeUi[side];
      if (!ui) continue;
      ui.value.setText(String(this.sizes[side]));
      ui.minus.setEnabled(this.sizes[side] > 1);
      ui.plus.setEnabled(this.sizes[side] < CELLS);
    }
    this.sizeSummaryText?.setText(sizeSummary(this.sizes));
    const ok = this.ready();
    this.startBtn?.setEnabled(ok);
    if (ok) this.setStatus('Both teams are ready - the battle awaits', '#ffe29a');
    else this.setStatus(this.missingText(), colors.lethal);
    this.pop = undefined;
  }

  private drawTeam(side: Side): void {
    const px = PANEL_X[side];
    for (const l of [this.slotLayer[side], this.headLayer[side]]) {
      if (!l) continue;
      for (const ch of l.list) this.tweens.killTweensOf(ch);
      l.destroy();
    }
    const head = this.add.container(0, 0).setDepth(12);
    this.headLayer[side] = head;
    const hex = hexNum(SIDE_HEX[side]);
    // Member count: one diamond per place of the chosen team size + "n/size"
    const n = this.count(side);
    const size = this.sizes[side];
    const full = n >= size;
    const pip = pipLayout(size, 300);
    const pg = this.add.graphics();
    const pipsX = px + 330;
    const pipsY = PANEL_Y + 42;
    for (let k = 0; k < size; k++) {
      const x = pipsX + k * pip.step;
      const pts = [{ x, y: pipsY - 11 }, { x: x + 9, y: pipsY }, { x, y: pipsY + 11 }, { x: x - 9, y: pipsY }];
      pg.fillStyle(0x120c07, 1).fillPoints(pts, true);
      if (k < n) {
        pg.fillStyle(hex, 1).fillPoints([{ x, y: pipsY - 8 }, { x: x + 6, y: pipsY }, { x, y: pipsY + 8 }, { x: x - 6, y: pipsY }], true);
        pg.fillStyle(0xffffff, 0.35).fillPoints([{ x, y: pipsY - 8 }, { x: x + 6, y: pipsY }, { x, y: pipsY }], true);
      }
      pg.lineStyle(2, k < n ? GOLD.light : GOLD.dark, 1).strokePoints(pts, true);
    }
    head.add(pg);
    head.add(serif(this, pipsX + pip.width - pip.step / 2 + 14, pipsY, `${n}/${size}`, 24, full ? '#ffe29a' : '#b9a27a').setOrigin(0, 0.5));

    const layer = this.add.container(0, 0).setDepth(12);
    this.slotLayer[side] = layer;
    const team = this.teams[side];
    for (let c = 0; c < ROWS; c++) {
      const row = side === 'party' ? ROWS - 1 - c : c;
      for (let lane = 0; lane < LANES; lane++) {
        const i = row * LANES + lane;
        const cx = px + 34 + c * (SLOT_W + COL_GAP) + SLOT_W / 2;
        const cy = GRID_TOP + lane * (SLOT_H + LANE_GAP) + SLOT_H / 2;
        const def = team[i] ? content.classes[team[i]!] : undefined;
        const body = this.drawSlot(side, i, cx, cy, def, side === 'enemies');
        if (!def && full) body.setAlpha(0.4); // team is full: free cells cannot take a new champion
        layer.add(body);
        const hot = this.add.graphics();
        drawQuadTile(hot, rectQuad(cx - SLOT_W / 2, cy - SLOT_H / 2, SLOT_W, SLOT_H), 'anchor', 'neutral'); // drop target: same plate as the battle floor's anchor
        hot.setVisible(false);
        layer.add(hot);
        this.slotRects.push({ side, i, x: cx - SLOT_W / 2, y: cy - SLOT_H / 2, w: SLOT_W, h: SLOT_H, hot, body });
        if (this.pop && this.pop.side === side && this.pop.cell === i) {
          body.setScale(0.7).setAlpha(0);
          this.tweens.add({ targets: body, scale: 1, alpha: 1, duration: 260, delay: this.pop.delay, ease: 'Back.easeOut' });
          const flash = this.add.image(cx, cy, ensureGlow(this)).setTint(0xffe29a).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(SLOT_W * 1.2, SLOT_H * 1.5).setAlpha(0);
          layer.add(flash);
          this.tweens.add({ targets: flash, alpha: { from: fx(0.8), to: 0 }, duration: 300, delay: this.pop.delay + 60, onComplete: () => flash.destroy() });
        }
      }
    }
  }

  /** One formation cell (centered at cx, cy): a recess when empty, a framed class plate when filled. */
  private drawSlot(side: Side, i: number, cx: number, cy: number, def: CombatantDef | undefined, flip: boolean): Phaser.GameObjects.Container {
    const hex = hexNum(SIDE_HEX[side]);
    const hw = SLOT_W / 2;
    const hh = SLOT_H / 2;
    const g = this.add.graphics();
    const body = this.add.container(cx, cy, [g]);
    if (!def) {
      // Empty cell: the common cell plate ('selectable', toned by side), same look as the battle floor
      g.fillStyle(0x070403, 0.5).fillRect(-hw, -hh, SLOT_W, SLOT_H);
      drawQuadTile(g, rectQuad(-hw, -hh, SLOT_W, SLOT_H), 'selectable', side === 'party' ? 'ally' : 'enemy');
      return body;
    }
    const col = hexNum(def.color);
    g.fillGradientStyle(hex, hex, 0x0c0806, 0x0c0806, 0.34, 0.34, 1, 1).fillRect(-hw, -hh, SLOT_W, SLOT_H);
    g.fillGradientStyle(0x2a2017, 0x2a2017, 0x120b07, 0x120b07, 0.78, 0.78, 0.78, 0.78).fillRect(-hw, -hh, SLOT_W, SLOT_H);
    g.fillGradientStyle(hex, hex, hex, hex, 0.3, 0.0, 0.12, 0).fillRect(-hw + 3, -hh + 3, SLOT_W - 6, SLOT_H - 6);
    frameRect(g, -hw, -hh, SLOT_W, SLOT_H, { bevel: 4, edge: hex === 0 ? GOLD.edge : GOLD.edge, light: GOLD.light });
    cornerOrnaments(g, -hw, -hh, SLOT_W, SLOT_H, 3);
    // Avatar plate
    const ax = -hw + 10;
    const ay = -hh + 14;
    const as = SLOT_H - 28;
    g.fillGradientStyle(0x1b130d, 0x1b130d, 0x0a0705, 0x0a0705, 1).fillRect(ax, ay, as, as);
    body.add(this.add.image(ax + as / 2, ay + as / 2, ensureGlow(this)).setTint(col).setDisplaySize(as * 1.1, as * 1.1).setAlpha(fx(0.5)).setBlendMode(Phaser.BlendModes.ADD));
    body.add(classAvatar(this, def, ax + as / 2, ay + as / 2 + 1, as - 4, flip));
    const pf = this.add.graphics();
    frameRect(pf, ax, ay, as, as, { bevel: 3, edge: hex, light: GOLD.light });
    body.add(pf);
    if (isTestClass(def)) {
      const tg = this.add.graphics();
      tg.fillStyle(0x1a0f06, 1).fillRoundedRect(ax + as - 40, ay + as - 14, 44, 18, 4);
      tg.fillStyle(0xffb347, 1).fillRoundedRect(ax + as - 38, ay + as - 12, 40, 14, 3);
      body.add([tg, serif(this, ax + as - 18, ay + as - 5, 'TEST', 11, '#2a1405', { spacing: 1, stroke: 0 }).setOrigin(0.5)]);
    }
    // Name, archetype, logo
    const colX = ax + as + 12 + (hw * 2 - (ax + hw) - as - 12 - 8) / 2;
    const colW = hw * 2 - (ax + hw) - as - 12 - 8;
    body.add(fitText(serif(this, colX, -hh + 32, def.name, 22, '#f6ead0').setOrigin(0.5), colW));
    body.add(fitText(serif(this, colX, -hh + 52, archetypeOf(def).toUpperCase(), 12, '#b9a27a', { spacing: 1, stroke: 2 }).setOrigin(0.5), colW));
    const medal = this.add.graphics();
    medal.fillStyle(0x120c07, 1).fillCircle(colX, hh - 26, 16);
    medal.lineStyle(2, GOLD.edge, 1).strokeCircle(colX, hh - 26, 16);
    body.add(medal);
    body.add(this.add.image(colX, hh - 26, ensureIcon(this, def.logo, def.color, false, ownerOfUnit(def.id))).setDisplaySize(22, 22));
    // Hover glow + remove mark
    const hov = this.add.graphics().setAlpha(0);
    drawQuadTile(hov, rectQuad(-hw, -hh, SLOT_W, SLOT_H), 'hover', side === 'party' ? 'ally' : 'enemy');
    const x = this.add.graphics().setAlpha(0);
    x.fillStyle(0x120c07, 0.95).fillCircle(hw - 14, -hh + 14, 11);
    x.lineStyle(2, GOLD.edge, 1).strokeCircle(hw - 14, -hh + 14, 11);
    x.lineStyle(3, 0xe0685a, 1).lineBetween(hw - 18, -hh + 10, hw - 10, -hh + 18).lineBetween(hw - 10, -hh + 10, hw - 18, -hh + 18);
    body.add([hov, x]);
    const zone = this.add.zone(0, 0, SLOT_W, SLOT_H).setInteractive({ useHandCursor: true });
    body.add(zone);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { side, from: i, sx: p.x, sy: p.y, moved: false, over: null };
    });
    zone.on('pointerover', () => {
      this.tweens.add({ targets: [hov, x], alpha: 1, duration: 120 });
      if (!this.drag?.moved && !this.cardDrag?.moved) this.showTip(`class:${def.id}`, this.classTip(def), { x: cx - hw, y: cy - hh, w: SLOT_W, h: SLOT_H }, 'below');
    });
    zone.on('pointerout', () => {
      this.tweens.add({ targets: [hov, x], alpha: 0, duration: 160 });
      this.hideTip();
    });
    return body;
  }

  // --- Tooltips ---

  private showTip(key: string, content: TipContent, anchor: { x: number; y: number; w: number; h: number }, prefer: 'above' | 'below'): void {
    this.tipTimer?.remove();
    if (this.tip?.key === key) return;
    this.hideTip(true);
    const t = buildTip(this, content);
    placeTip(t, anchor, prefer, W, H);
    t.container.setAlpha(0);
    this.tweens.add({ targets: t.container, alpha: 1, duration: 110 });
    this.tip = { key, container: t.container };
  }

  private hideTip(now = false): void {
    this.tipTimer?.remove();
    const kill = () => {
      this.tip?.container.destroy();
      this.tip = undefined;
    };
    if (now) kill();
    else this.tipTimer = this.time.delayedCall(70, kill);
  }

  // --- Drag: moving characters inside a team ---

  private slotAt(x: number, y: number, side?: Side): SlotRect | undefined {
    return this.slotRects.find((s) => (!side || s.side === side) && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
  }

  private makeGhost(def: CombatantDef, side: Side | null, p: Phaser.Input.Pointer): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x120c07, 0.95).fillRect(-72, -50, 144, 100);
    frameRect(g, -72, -50, 144, 100, { bevel: 3 });
    const head = classAvatar(this, def, 0, -8, 68, side === 'enemies');
    const name = fitText(serif(this, 0, 36, def.name, 20).setOrigin(0.5), 130);
    return this.add.container(p.x, p.y, [g, head, name]).setDepth(6000).setAlpha(0.92).setScale(1.05);
  }

  private onDragMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 14) {
      d.moved = true;
      this.hideTip(true);
      d.ghost = this.makeGhost(content.classes[this.teams[d.side][d.from]!]!, d.side, p);
      this.slotRects.find((s) => s.side === d.side && s.i === d.from)?.body.setAlpha(0.3);
    }
    if (!d.moved) return;
    d.ghost?.setPosition(p.x, p.y);
    const over = this.slotAt(p.x, p.y, d.side)?.i ?? null;
    if (over !== d.over) {
      d.over = over;
      for (const s of this.slotRects) if (s.side === d.side) s.hot.setVisible(over !== null && s.i === over && s.i !== d.from);
    }
  }

  private onDragEnd(p: Phaser.Input.Pointer, outside: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    d.ghost?.destroy();
    const team = this.teams[d.side];
    if (!d.moved) {
      if (!outside) {
        team[d.from] = ''; // tap = remove
        this.active = d.side;
      }
    } else {
      const to = outside ? null : (this.slotAt(p.x, p.y, d.side)?.i ?? null);
      if (to !== null && to !== d.from) {
        [team[d.from], team[to]] = [team[to]!, team[d.from]!]; // move into an empty cell or swap
        this.pop = { side: d.side, cell: to, delay: 0 };
      }
    }
    this.refresh();
  }

  // --- Drag: from a class card onto a slot ---

  private onCardDragMove(p: Phaser.Input.Pointer): void {
    const d = this.cardDrag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 14) {
      d.moved = true;
      this.hideTip(true);
      d.ghost = this.makeGhost(content.classes[d.id]!, null, p);
    }
    if (!d.moved) return;
    d.ghost?.setPosition(p.x, p.y);
    const s = this.slotAt(p.x, p.y);
    const over = s ? { side: s.side, i: s.i } : null;
    if (over?.side !== d.over?.side || over?.i !== d.over?.i) {
      d.over = over;
      for (const r of this.slotRects) r.hot.setVisible(!!over && r.side === over.side && r.i === over.i);
    }
  }

  private onCardDragEnd(p: Phaser.Input.Pointer, outside: boolean): void {
    const d = this.cardDrag;
    if (!d) return;
    this.cardDrag = undefined;
    d.ghost?.destroy();
    const card = this.cards.get(d.id);
    if (card) this.tweens.add({ targets: card.outer, scale: card.scale, duration: 100 });
    if (!d.moved) {
      if (!outside) this.addClass(d.id);
      return;
    }
    for (const r of this.slotRects) r.hot.setVisible(false);
    if (outside) return;
    const s = this.slotAt(p.x, p.y);
    if (s) this.addClass(d.id, { side: s.side, i: s.i });
  }

  /** A copy of the card's avatar flies into the team slot it was added to. */
  private flyAvatar(card: CardView, side: Side, cell: number): void {
    const row = Math.floor(cell / LANES);
    const lane = cell % LANES;
    const c = side === 'party' ? ROWS - 1 - row : row;
    const tx = PANEL_X[side] + 34 + c * (SLOT_W + COL_GAP) + 10 + (SLOT_H - 28) / 2;
    const ty = GRID_TOP + lane * (SLOT_H + LANE_GAP) + SLOT_H / 2;
    const fromX = card.outer.x - (CARD.w / 2 - card.avatarAt.x) * card.scale;
    const fy = card.outer.y - (CARD.h / 2 - card.avatarAt.y) * card.scale;
    const img = classAvatar(this, card.def, fromX, fy, 96 * card.scale, side === 'enemies').setDepth(5500);
    const trail = this.add.image(fromX, fy, ensureGlow(this)).setTint(hexNum(card.def.color)).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(110, 110).setDepth(5499).setAlpha(fx(0.7));
    const to = { x: tx, y: ty };
    this.tweens.add({ targets: [img, trail], x: to.x, y: to.y, duration: 240, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: img, scale: img.scale * 0.86, duration: 240 });
    this.tweens.add({
      targets: [img, trail],
      alpha: 0,
      delay: 200,
      duration: 80,
      onComplete: () => {
        img.destroy();
        trail.destroy();
      },
    });
  }
}
