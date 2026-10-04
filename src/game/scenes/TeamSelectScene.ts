import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { content, describeClass } from '../../engine';
import type { CombatantDef, Teams } from '../../engine';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { color, textStyle } from '../combatant-view';
import { ensureIcon } from '../icons';
import { newSeed } from '../seed';

const { width: W, height: H, colors } = layout;
const TEAM_SIZE = 5;
const { slotWidth, slotHeight, cardWidth, cardHeight, gap } = layout.teamSelect;
const { rows: ROWS, lanes: LANES } = content.GRID;
const CELLS = content.CELL_COUNT;
const GRID_TOP = 228;
const CELL_GAP = 8;

type Side = 'party' | 'enemies';

export interface TeamSelectData {
  teams: Teams;
}

/**
 * Start screen: choose 5 classes for your team and 5 for the enemy team, then start the battle.
 * Each team is a formation grid: 4 rows (depth, row 1 = front) with up to 3 characters per row. Drag a character to another cell to move or swap it.
 * A team is a cell list: index = row * 3 + lane, '' = empty cell.
 */
export class TeamSelectScene extends Phaser.Scene {
  static readonly KEY = 'TeamSelectScene';

  private teams: Record<Side, string[]> = { party: [], enemies: [] };
  private readonly emptyCells = (): string[] => Array.from({ length: CELLS }, () => '');
  private layer?: Phaser.GameObjects.Container;
  private info?: Phaser.GameObjects.Container;
  private infoClass: string | null = null;
  /** Çizilen takım yuvalarının ekran dikdörtgenleri (sürükle-bırak için). */
  private slotRects: Array<{ side: Side; i: number; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Rectangle }> = [];
  private drag?: { side: Side; from: number; sx: number; sy: number; moved: boolean; ghost?: Phaser.GameObjects.Container; over: number | null };

  constructor() {
    super(TeamSelectScene.KEY);
  }

  init(data: Partial<TeamSelectData>): void {
    const pad = (cells: string[]) => Array.from({ length: CELLS }, (_, i) => cells[i] ?? '');
    if (data.teams) this.teams = { party: pad(data.teams.party), enemies: pad(data.teams.enemies) };
    else if (this.count('party') === 0 && this.count('enemies') === 0) this.randomize('party', false);
    if (this.count('enemies') === 0) this.randomize('enemies', false);
    this.layer = undefined;
    this.info = undefined;
    this.infoClass = null;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    const bgId = content.battles[content.DEFAULT_BATTLE]?.background ?? '';
    if (hasBackground(this, bgId)) {
      const img = this.add.image(W / 2, H / 2, backgroundKey(bgId));
      img.setScale(Math.max(W / img.width, H / img.height));
      this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0);
    } else this.cameras.main.setBackgroundColor(colors.fallbackBackground);

    this.add.text(W / 2, 56, 'Choose your teams', textStyle(68)).setOrigin(0.5);
    this.add
      .text(W / 2, 112, 'Pick 5 classes per side and arrange them: up to 3 per row. Drag to move or swap.', textStyle(28, colors.muted))
      .setOrigin(0.5);
    this.render();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onDragMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onDragEnd(p, false));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onDragEnd(p, true));
  }

  private randomize(side: Side, redraw = true): void {
    const seed = newSeed() + (side === 'party' ? 1 : 977);
    this.teams[side] = content.randomCells(content.randomTeam(seed, TEAM_SIZE), seed);
    if (redraw) this.render();
  }

  private count(side: Side): number {
    return (this.teams[side] ?? []).filter(Boolean).length;
  }

  private ready(): boolean {
    return this.count('party') === TEAM_SIZE && this.count('enemies') === TEAM_SIZE;
  }

  /**
   * Where a newly picked class goes. Melee classes can only attack from the front row, so they take the first row that still has
   * room; everyone else goes behind the last occupied row (or the next one if that row is full).
   */
  private freeCellFor(side: Side, id: string): number {
    const cells = this.teams[side];
    const rowFull = (row: number) => cells.slice(row * LANES, row * LANES + LANES).filter(Boolean).length >= LANES;
    const rowHas = (row: number) => cells.slice(row * LANES, row * LANES + LANES).some(Boolean);
    let want = 0;
    if (content.isMeleeClass(id)) {
      while (want < ROWS - 1 && rowFull(want)) want++;
    } else {
      for (let r = 0; r < ROWS; r++) if (rowHas(r)) want = r;
      if (rowFull(want) && want < ROWS - 1) want++;
    }
    const order = Array.from({ length: ROWS }, (_, r) => r).sort((x, y) => Math.abs(x - want) - Math.abs(y - want) || x - y);
    const lanes = [0, LANES - 1, ...Array.from({ length: LANES - 2 }, (_, i) => i + 1)];
    for (const row of order) for (const lane of lanes) if (!cells[row * LANES + lane]) return row * LANES + lane;
    return cells.findIndex((c) => !c);
  }

  private start(): void {
    if (!this.ready()) return;
    this.scene.start('BattleScene', {
      seed: newSeed(),
      mode: 'turns',
      battleId: content.DEFAULT_BATTLE,
      teams: { party: [...this.teams.party], enemies: [...this.teams.enemies] } satisfies Teams, // cell lists (index = slot)
    });
  }

  // --- Drawing ---

  private render(): void {
    this.layer?.destroy();
    this.slotRects = [];
    const items: Phaser.GameObjects.GameObject[] = [];
    this.panel(items, 'party', 'YOUR TEAM', 480, colors.partySlot);
    this.panel(items, 'enemies', 'ENEMY TEAM', 1440, colors.enemySlot);

    // Randomize both + start
    items.push(...this.button(W / 2 - 700, 972, 420, 80, 'Randomize both', () => {
      this.randomize('party', false);
      this.randomize('enemies');
    }, true));
    const ok = this.ready();
    items.push(...this.button(W / 2 - 190, 965, 380, 95, ok ? 'START BATTLE' : 'Pick 5 + 5', () => this.start(), ok, 54));
    if (!ok) items.push(this.add.text(W / 2, 1066, 'Each team needs exactly 5 classes', textStyle(22, colors.lethal)).setOrigin(0.5));
    this.layer = this.add.container(0, 0, items);
    this.showInfo(this.infoClass);
  }

  private panel(items: Phaser.GameObjects.GameObject[], side: Side, title: string, cx: number, hex: string): void {
    const gridW = ROWS * slotWidth + (ROWS - 1) * gap;
    const pw = gridW + 60;
    items.push(
      this.add.rectangle(cx, 455, pw, 640, 0x000000, 0.45).setStrokeStyle(4, color(hex)),
      this.add.text(cx, 160, title, textStyle(44, hex)).setOrigin(0.5),
    );

    // Formation grid: row 1 (front) nearest the middle of the screen; lanes stacked top to bottom
    const team = this.teams[side];
    const left = cx - gridW / 2;
    for (let row = 0; row < ROWS; row++) {
      const x = left + (side === 'party' ? ROWS - 1 - row : row) * (slotWidth + gap);
      const tag = row === 0 ? 'ROW 1 - FRONT' : row === ROWS - 1 ? `ROW ${row + 1} - BACK` : `ROW ${row + 1}`;
      items.push(this.add.text(x + slotWidth / 2, GRID_TOP - 12, tag, textStyle(16, colors.muted)).setOrigin(0.5, 1));
      for (let lane = 0; lane < LANES; lane++) {
        const i = row * LANES + lane;
        const y = GRID_TOP + lane * (slotHeight + CELL_GAP);
        const id = team[i];
        const def = id ? content.classes[id] : undefined;
        const box = this.add.rectangle(x, y, slotWidth, slotHeight, 0x1a1410, def ? 0.9 : 0.35).setOrigin(0, 0).setStrokeStyle(4, color(def ? hex : colors.turnCell), def ? 1 : 0.3);
        items.push(box);
        this.slotRects.push({ side, i, x, y, w: slotWidth, h: slotHeight, box });
        if (def) {
          items.push(
            this.add.image(x + 34, y + slotHeight / 2, ensureIcon(this, def.logo, def.color, false)).setDisplaySize(46, 46),
            this.add.text(x + 66, y + slotHeight / 2, def.name, textStyle(24)).setOrigin(0, 0.5),
          );
          box.setInteractive({ useHandCursor: true });
          box.on('pointerdown', (p: Phaser.Input.Pointer) => {
            this.drag = { side, from: i, sx: p.x, sy: p.y, moved: false, over: null };
          });
          box.on('pointerover', () => this.showInfo(def.id));
          box.on('pointerout', () => this.showInfo(null));
        }
      }
    }

    // Class cards (8 classes: 2 rows x 4)
    const cardsTop = GRID_TOP + LANES * (slotHeight + CELL_GAP) + 12;
    const ids = Object.keys(content.classes);
    const full = this.count(side) >= TEAM_SIZE;
    ids.forEach((id, i) => {
      const def = content.classes[id]!;
      const x = left + (i % 4) * (cardWidth + gap);
      const y = cardsTop + Math.floor(i / 4) * (cardHeight + 8);
      const n = team.filter((t) => t === id).length;
      const card = this.add.rectangle(x, y, cardWidth, cardHeight, color(colors.button), full ? 0.45 : 1).setOrigin(0, 0).setStrokeStyle(4, color(colors.buttonBorder), full ? 0.4 : 1);
      items.push(
        card,
        this.add.image(x + cardWidth / 2, y + 28, ensureIcon(this, def.logo, def.color, false)).setDisplaySize(44, 44).setAlpha(full ? 0.5 : 1),
        this.add.text(x + cardWidth / 2, y + 62, def.name, textStyle(24)).setOrigin(0.5).setAlpha(full ? 0.5 : 1),
        this.add.text(x + cardWidth / 2, y + 82, this.role(def), textStyle(16, colors.muted)).setOrigin(0.5),
      );
      if (n > 0) items.push(this.add.text(x + cardWidth - 10, y + 6, `x${n}`, textStyle(22, hex)).setOrigin(1, 0));
      card.setInteractive({ useHandCursor: !full });
      card.on('pointerup', () => {
        if (this.count(side) >= TEAM_SIZE) return;
        const cell = this.freeCellFor(side, id);
        if (cell < 0) return;
        this.teams[side][cell] = id;
        this.render();
      });
      card.on('pointerover', () => this.showInfo(id));
      card.on('pointerout', () => this.showInfo(null));
    });

    // Re-roll (dice) and clear (cross) this team, under the class cards
    const btnY = cardsTop + 2 * (cardHeight + 8) + 4;
    items.push(
      ...this.iconButton(cx - 38, btnY, 'dice', () => this.randomize(side)),
      ...this.iconButton(cx + 38, btnY, 'cross', () => {
        this.teams[side] = this.emptyCells();
        this.render();
      }),
    );
  }

  private slotAt(side: Side, x: number, y: number): number | null {
    const r = this.slotRects.find((s) => s.side === side && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    return r ? r.i : null;
  }

  private onDragMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 14) {
      d.moved = true;
      const id = this.teams[d.side][d.from]!;
      const def = content.classes[id]!;
      const bg = this.add.rectangle(0, 0, slotWidth, slotHeight, 0x1a1410, 0.95).setStrokeStyle(5, color(colors.targetHighlight));
      const icon = this.add.image(-slotWidth / 2 + 34, 0, ensureIcon(this, def.logo, def.color, false)).setDisplaySize(46, 46);
      const name = this.add.text(-slotWidth / 2 + 66, 0, def.name, textStyle(24)).setOrigin(0, 0.5);
      d.ghost = this.add.container(p.x, p.y, [bg, icon, name]).setDepth(1000).setAlpha(0.9);
      this.slotRects.find((s) => s.side === d.side && s.i === d.from)?.box.setAlpha(0.35);
    }
    if (!d.moved) return;
    d.ghost?.setPosition(p.x, p.y);
    const over = this.slotAt(d.side, p.x, p.y);
    if (over !== d.over) {
      d.over = over;
      for (const s of this.slotRects) {
        if (s.side !== d.side) continue;
        const hot = over !== null && s.i === over && s.i !== d.from;
        const filled = !!this.teams[s.side][s.i];
        s.box.setStrokeStyle(hot ? 8 : 4, color(hot ? colors.targetHighlight : filled ? (s.side === 'party' ? colors.partySlot : colors.enemySlot) : colors.turnCell), hot || filled ? 1 : 0.3);
      }
    }
  }

  private onDragEnd(p: Phaser.Input.Pointer, outside: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    d.ghost?.destroy();
    const team = this.teams[d.side];
    if (!d.moved) {
      if (!outside) team[d.from] = ''; // tap = remove
    } else {
      const to = outside ? null : this.slotAt(d.side, p.x, p.y);
      if (to !== null && to !== d.from) [team[d.from], team[to]] = [team[to]!, team[d.from]!]; // move into an empty cell or swap
    }
    this.render();
  }

  private role(def: CombatantDef): string {
    if (def.role) return def.role;
    const motion = content.skills[def.skills[0] ?? '']?.motion;
    return motion === 'melee' ? 'Melee' : motion === 'ranged' ? 'Ranged' : 'Caster';
  }

  /** Class details (attributes, derived stats, skills) in the middle of the screen while hovering a class. */
  private showInfo(classId: string | null): void {
    this.infoClass = classId;
    this.info?.destroy();
    this.info = undefined;
    const def = classId ? content.classes[classId] : undefined;
    if (!def) {
      this.info = this.add.container(0, 0, [
        this.add.text(W / 2, 850, 'Hover a class to see its stats and skills', textStyle(28, colors.muted)).setOrigin(0.5),
      ]);
      return;
    }
    const d = describeClass(def, content.skills, content.formulas);
    const w = 1180;
    const x = (W - w) / 2;
    const bg = this.add.rectangle(x, 788, w, 172, color(colors.tooltipBg), 0.95).setOrigin(0, 0).setStrokeStyle(4, color(colors.tooltipBorder));
    const title = this.add.text(x + 20, 798, `${d.title} - ${this.role(def)}`, textStyle(32)).setOrigin(0, 0);
    const lines = this.add.text(x + 20, 838, d.lines.join('\n'), { ...textStyle(21), wordWrap: { width: w - 40 }, lineSpacing: 2 }).setOrigin(0, 0);
    this.info = this.add.container(0, 0, [bg, title, lines]);
  }

  /** A square button with a drawn dice or cross symbol (centered at cx). */
  private iconButton(cx: number, y: number, kind: 'dice' | 'cross', onTap: () => void): Phaser.GameObjects.GameObject[] {
    const size = 52;
    const x = cx - size / 2;
    const bg = this.add.rectangle(x, y, size, size, color(colors.button)).setOrigin(0, 0).setStrokeStyle(5, color(colors.buttonBorder));
    const g = this.add.graphics();
    const mx = cx;
    const my = y + size / 2;
    if (kind === 'dice') {
      g.fillStyle(color(colors.text)).fillRoundedRect(mx - 17, my - 17, 34, 34, 6);
      g.fillStyle(color(colors.panel));
      for (const [dx, dy] of [[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]] as const) g.fillCircle(mx + dx, my + dy, 3.5);
    } else {
      g.lineStyle(9, color(colors.lethal)).lineBetween(mx - 14, my - 14, mx + 14, my + 14).lineBetween(mx + 14, my - 14, mx - 14, my + 14);
    }
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => bg.setFillStyle(color(colors.buttonPressed)));
    bg.on('pointerout', () => bg.setFillStyle(color(colors.button)));
    bg.on('pointerup', onTap);
    return [bg, g];
  }

  private button(x: number, y: number, w: number, h: number, label: string, onTap: () => void, enabled: boolean, font = 36): Phaser.GameObjects.GameObject[] {
    const bg = this.add
      .rectangle(x, y, w, h, color(colors.button), enabled ? 1 : 0.4)
      .setOrigin(0, 0)
      .setStrokeStyle(5, color(enabled ? colors.buttonBorder : colors.turnCell), enabled ? 1 : 0.4);
    const text = this.add.text(x + w / 2, y + h / 2, label, textStyle(font)).setOrigin(0.5).setAlpha(enabled ? 1 : 0.55);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => bg.setFillStyle(color(colors.buttonPressed)));
      bg.on('pointerout', () => bg.setFillStyle(color(colors.button)));
      bg.on('pointerup', onTap);
    }
    return [bg, text];
  }
}
