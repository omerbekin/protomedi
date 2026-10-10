import Phaser from 'phaser';
import type { UiSoundKind } from '../../ui/ui-sound';
import layout from '../../../data/battle-layout.json';
import { skillTags } from '../../ui/skill-tags';
import { content, describePassive, describeSkill, describeStat, primaryBonusInfo } from '../../engine';
import type { CombatantDef, Teams } from '../../engine';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { ensureIcon, ensureSkillIcon } from '../icons';
import { ownerOfUnit } from '../asset-versions';
import { PRIMARY_GOLD, STAT_COLOR, STAT_LABEL, statIconName } from '../../ui/stat-icons';
import { initialSizes, newSeed } from '../seed';
import { classAvatar, ensureGlow } from '../menu-ui';
import { groupColor } from '../class-order';
import {
  archetypeOf,
  clampSize,
  classCounts,
  freeCellFor,
  infoClassAfter,
  isTeamFull,
  isTestClass,
  missingMessage,
  moveMember,
  moveToSide,
  randomizePool,
  rangeOf,
  rosterGroups,
  rosterIds,
  stepSize,
  stripLayout,
  teamCount,
  trimToSize,
} from '../team-select-model';
import type { SideSizes, TeamSide } from '../team-select-model';
import { skillMiniGrid } from '../../ui/shape-diagram';
import type { MpTeamHooks } from '../mp-hooks';
import { debugState } from '../debug-state';
import { onStageResize, stageView, worldXY } from '../stage';
import { FULL_W, FULL_X0 } from '../../ui/viewport';
import { menuFontsReady, whenMenuFontsReady } from '../../ui/menu-fonts';
import { startMainMenu } from '../session-flow';
import {
  BADGE_LABEL,
  EL,
  diamondPts,
  elBack,
  elGo,
  elScreenIn,
  elBadge,
  elBody,
  elButton,
  elConfirm,
  elConfirmOpen,
  elDiamond,
  elGlow,
  elHeading,
  elLink,
  elText,
  elTip,
  elToast,
  fadeLine,
  placeElTip,
  vGradient,
  type ElButton,
  type ElTipSpec,
} from '../elegant-ui';

const { width: W, height: H, colors } = layout;
const { rows: ROWS, lanes: LANES } = content.GRID;
const CELLS = content.CELL_COUNT;
const hexNum = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;

type Side = TeamSide;
const SIDES: readonly Side[] = ['party', 'enemies'];
const NAME: Record<Side, string> = { party: 'Player', enemies: 'Enemy' };
const ATTRS: Array<'str' | 'dex' | 'int' | 'luck'> = ['str', 'dex', 'int', 'luck'];
const PRIMARY_GROUP = colors.primaryGroup as Record<string, string>;

export interface TeamSelectData {
  teams: Teams;
  /** Takım boyutları (her taraf 1-12); yoksa takımların doluluğu, o da yoksa adres/varsayılan 4-4. */
  sizes: SideSizes;
  /** Multiplayer (src/game/mp-client.ts): yalnızca kendi tarafını seçer, 4'e 4 sabit, START yerine READY; rakibin takımı savaşa kadar gizli. */
  mp?: MpTeamHooks;
}

// --- Taslak paleti (qb-mockups.html taslak 1 'Twin Formations', Ömer 2026-10-09; taslak uygulandıktan sonra silindi) ---
const { TXT, ON, MUTED, DIM, NOTE, PRI, EMBER, GOLD: GOLDC, ON_N: ONC, INK, PAD, LINE, HIT, EASE: easeOut } = EL;
const PRI_SMALL = '#e9c062';

// --- Yerleşim (1080 mantıksal yükseklik; kenara yaslananlar stageView.left/right'a göre) ---
const MID_TOP = 146;
const SIDE_INSET = 84;
const CELL = 120;
const CELL_GAP = 12;
const GRID_W = ROWS * CELL + (ROWS - 1) * CELL_GAP; // 516
const GRID_H = LANES * CELL + (LANES - 1) * CELL_GAP; // 384
const SIDE_W = GRID_W;
const SIDE_H = 560;
const HEAD_CY = 30;
const GRID_Y = 106;
const ACTS_CY = GRID_Y + GRID_H + 10 + 30;
const CENTER_CY = MID_TOP + 270;
const INFO = { top: 724, h: 92, maxW: 1760 };
const STRIP_TOP = 846;
const START = { h: 84, cy: 990, right: 48, pad: 56, size: 30 };
const RANDOM_BOTH = { h: 56, gap: 14 };


type TipSpec = ElTipSpec;

interface CellView {
  side: Side;
  i: number;
  /** Yuvanın taraf kutusundaki yerel sol üst köşesi. */
  lx: number;
  ly: number;
  body: Phaser.GameObjects.Container;
  hot: Phaser.GameObjects.Container;
}

interface TileView {
  id: string;
  root: Phaser.GameObjects.Container;
  lift: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Graphics;
  img: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  badges: Record<Side, ReturnType<typeof elBadge>>;
  size: number;
  hover: boolean;
}

interface SideView {
  root: Phaser.GameObjects.Container;
  title: Phaser.GameObjects.Text;
  dia: Phaser.GameObjects.Graphics;
  count?: Phaser.GameObjects.Text;
  grow: Phaser.GameObjects.Graphics;
  stepper?: { root: Phaser.GameObjects.Container; value: Phaser.GameObjects.Text; minus: (on: boolean) => void; plus: (on: boolean) => void };
  cells: Phaser.GameObjects.Container;
  cover?: Phaser.GameObjects.Container;
}

/**
 * Hızlı savaş takım seçimi: "Twin Formations" (Ömer 2026-10-09 taslak 1; kutusuz zarif menü dili: Cinzel + EB Garamond, ince altın çizgiler, kor elmas).
 * - Solda Player, sağda Enemy dizilimi (4 sıra x 3 şerit; ön sıra ortaya bakar), başlıkta takım boyutu seçici (1-12), altında Random · Clear.
 * - Ortada VS + durum yazısı + Random both; START BATTLE sağ alt köşede (geniş ekranda sahnenin sağ kenarına göre).
 * - Altta bilgi satırı (en son üstüne gelinen / eklenen class'ın statları + skill'leri; fare çekilince kalır) ve STR/DEX/INT/LUCK gruplu class rafı.
 *   Portre köşelerindeki mavi / kırmızı yuvarlak sayı = o class'tan Player / Enemy takımında kaç tane var (yalnızca varken görünür).
 * - Tıkla = etkin takıma ekle; sürükle = yuvaya bırak; yuvadaki birim sürüklenince takas / diğer takıma taşıma; tıkla = çıkar.
 * - Multiplayer: yalnızca kendi tarafı; rakip paneli örtülü, START yerine READY / NOT READY; boyut 4 sabit.
 * Takım = hücre listesi (dizin = sıra * 3 + şerit, '' = boş). Class listesi veriden (yeni class rafta kendiliğinden görünür).
 */
export class TeamSelectScene extends Phaser.Scene {
  static readonly KEY = 'TeamSelectScene';

  private teams: Record<Side, string[]> = { party: [], enemies: [] };
  /** Seçilen takım boyutları (her taraf 1-12); START yalnızca iki takım da bu boyuta eşit olunca açılır. */
  private sizes: SideSizes = initialSizes();
  private active: Side = 'party';
  /** Raftaki seçili (en son eklenen / tıklanan) class. */
  private sel = '';
  /** Alt bilgi satırında gösterilen class (en son üstüne gelinen ya da eklenen; fare çekilince kalır). */
  private infoId = '';
  private readonly emptyCells = (): string[] => Array.from({ length: CELLS }, () => '');
  private sides = {} as Record<Side, SideView>;
  private cellViews: CellView[] = [];
  private tiles = new Map<string, TileView>();
  private stripRoot?: Phaser.GameObjects.Container;
  private stripGroups: Phaser.GameObjects.Container[] = [];
  private infoRoot?: Phaser.GameObjects.Container;
  private infoLines?: Phaser.GameObjects.Graphics;
  private menuLink?: Phaser.GameObjects.Container;
  private toastFn?: (msg: string, sound?: UiSoundKind | null) => void;
  private center?: Phaser.GameObjects.Container;
  private actions?: Phaser.GameObjects.Container;
  private status?: Phaser.GameObjects.Text;
  private statusTween?: Phaser.Tweens.Tween;
  private startUi?: ElButton;
  private bg?: { img?: Phaser.GameObjects.Image };
  private drag?: { kind: 'class' | 'cell'; id: string; side?: Side; from?: number; sx: number; sy: number; moved: boolean; ghost?: Phaser.GameObjects.Container; over: { side: Side; i: number } | null };
  private pop?: { side: Side; cell: number };
  private tip?: { key: string; container: Phaser.GameObjects.Container };
  private tipTimer?: Phaser.Time.TimerEvent;
  private starting = false;
  private built = false;
  /** Multiplayer kancaları (yoksa tek oyunculu Quick Battle). */
  mp: MpTeamHooks | undefined = undefined;
  private mpOff: (() => void) | null = null;
  private mpSent = '';
  private mpSyncing = false;

  constructor() {
    super(TeamSelectScene.KEY);
  }

  /** Multiplayer'da düzenlenebilen taraf (yalnızca kendi tarafı); tek oyunculuda iki taraf da. */
  private editable(side: Side): boolean {
    return !this.mp || this.mp.localSide === side;
  }

  init(data: Partial<TeamSelectData>): void {
    const pad = (cells: string[]) => Array.from({ length: CELLS }, (_, i) => cells[i] ?? '');
    this.mp = data.mp;
    this.mpOff?.();
    this.mpOff = null;
    this.mpSent = '';
    this.sides = {} as Record<Side, SideView>;
    this.cellViews = [];
    this.tiles = new Map();
    this.stripGroups = [];
    this.drag = undefined;
    this.pop = undefined;
    this.tip = undefined;
    this.tipTimer = undefined;
    this.starting = false;
    this.built = false;
    const first = rosterIds()[0] ?? '';
    this.sel = first;
    this.infoId = first;
    if (this.mp) {
      // Multiplayer: 4'e 4 sabit; kendi takımımız (rövanşta önceki seçim, yoksa rastgele), rakibinki gizli (boş)
      const local = this.mp.localSide;
      this.sizes = { party: 4, enemies: 4 };
      this.teams = { party: this.emptyCells(), enemies: this.emptyCells() };
      if (this.mp.initial) this.teams[local] = trimToSize(pad(this.mp.initial), 4);
      else this.randomize(local, false);
      this.active = local;
      return;
    }
    // Sizes: given by the caller, else the size of the given teams, else the page address (?party=3&enemies=8) / default 4-4
    if (data.sizes) this.sizes = { party: clampSize(data.sizes.party), enemies: clampSize(data.sizes.enemies) };
    else if (data.teams) this.sizes = { party: clampSize(teamCount(data.teams.party) || this.sizes.party), enemies: clampSize(teamCount(data.teams.enemies) || this.sizes.enemies) };
    else this.sizes = initialSizes();
    if (data.teams) this.teams = { party: trimToSize(pad(data.teams.party), this.sizes.party), enemies: trimToSize(pad(data.teams.enemies), this.sizes.enemies) };
    else if (this.count('party') === 0 && this.count('enemies') === 0) this.randomize('party', false);
    if (this.count('enemies') === 0) this.randomize('enemies', false);
    this.active = this.count('party') < this.sizes.party || this.count('enemies') >= this.sizes.enemies ? 'party' : 'enemies';
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0a07');
    // Yazılar Cinzel / EB Garamond ile çizilir: fontlar hazır olmadan çizilen yazı yedek fontla kalırdı (src/ui/menu-fonts.ts)
    if (!menuFontsReady()) {
      void whenMenuFontsReady().then(() => this.sys.isActive() && !this.built && this.build());
    } else this.build();

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.onDragMove(worldXY(this, ptr)));
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => this.onDragEnd(worldXY(this, ptr), false));
    this.input.on('pointerupoutside', (ptr: Phaser.Input.Pointer) => this.onDragEnd(worldXY(this, ptr), true));
    this.input.keyboard?.on('keydown-ENTER', () => this.built && !elConfirmOpen(this) && this.start());
    // Esc: Menu (Resume / Settings / New Game / Back to Main Menu; src/ui/game-menu.ts)
    this.input.keyboard?.on('keydown-ESC', () => !debugState.uiPaused && !elConfirmOpen(this) && this.built && this.goBack());
    if (this.mp) {
      this.mpOff = this.mp.onChange(() => !this.mpSyncing && this.scene.isActive() && this.built && this.refresh());
      this.events.once('shutdown', () => {
        this.mpOff?.();
        this.mpOff = null;
      });
    }
  }

  private build(): void {
    this.built = true;
    this.buildBackground();
    this.buildHeader();
    for (const side of SIDES) this.buildSide(side);
    this.buildCenter();
    this.buildStart();
    this.buildActions();
    this.buildInfo();
    this.refresh();
    this.layout(); // class rafı burada kurulur (genişliğe göre)
    onStageResize(this, () => this.layout());
    this.playEntrance();
    elScreenIn(this); // ortak ekran geçişi (data/ui-motion.json > screen)
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
    if (this.mp) return isTeamFull(this.teams[this.mp.localSide], 4);
    return isTeamFull(this.teams.party, this.sizes.party) && isTeamFull(this.teams.enemies, this.sizes.enemies);
  }

  private other(side: Side): Side {
    return side === 'party' ? 'enemies' : 'party';
  }

  private setActive(side: Side): void {
    if (this.active === side || !this.editable(side)) return;
    this.active = side;
    this.refresh();
  }

  private start(): void {
    if (this.starting) return;
    if (!this.ready()) {
      this.startUi?.shake();
      this.toast(this.missingText());
      this.setStatus(this.missingText(), colors.lethal, true);
      return;
    }
    if (this.mp) {
      // READY / NOT READY: ikisi de hazır olunca kurucu savaşı başlatır (mp-client sahneyi değiştirir)
      const cells = [...this.teams[this.mp.localSide]];
      this.mpSent = cells.join(',');
      this.mp.setTeam(cells, !this.mp.myReady());
      if (this.scene.isActive()) this.refresh();
      return;
    }
    this.starting = true;
    this.hideTip(true);
    elGo(this, 'BattleScene', {
      seed: newSeed(),
      mode: 'turns',
      battleId: content.DEFAULT_BATTLE,
      partySize: this.sizes.party,
      enemySize: this.sizes.enemies,
      teams: { party: [...this.teams.party], enemies: [...this.teams.enemies] } satisfies Teams, // cell lists (index = slot)
    });
  }

  /** New Game from the settings menu: random teams of the chosen sizes, straight into a battle (same as the result screen's New Game). */
  newGame(): void {
    if (this.starting || this.mp) return;
    this.starting = true;
    this.hideTip(true);
    this.scene.start('BattleScene', { seed: newSeed(), mode: 'turns', battleId: content.DEFAULT_BATTLE, partySize: this.sizes.party, enemySize: this.sizes.enemies, teams: undefined });
  }

  private missingText(): string {
    const msg = missingMessage(this.teams, this.sizes);
    if (!this.mp) return msg;
    // Multiplayer: rakibin (gizli) takımı sayılmaz; yalnızca kendi eksiğimiz
    const own = msg.split(/\s+·\s+/).find((p) => p.startsWith(`${NAME[this.mp!.localSide]} team`));
    return own ? own.replace(/^\w+ team/, 'Your team') : '';
  }

  /** Changes the size of one team (1-12); extra members are dropped from the back cells, missing ones must be picked (or randomized). */
  private setSize(side: Side, n: number): void {
    const next = clampSize(n);
    if (next === this.sizes[side]) return;
    this.sizes[side] = next;
    this.teams[side] = trimToSize(this.teams[side], next);
    if (this.count(side) < next) this.active = side;
    this.refresh();
  }

  /** Adds a class to a team: the active one (cell by the formation rule) or the given cell (drag). */
  private addClass(id: string, cell?: { side: Side; i: number } | { side: Side; i: null }): boolean {
    if (!content.classes[id]) return false;
    let side = cell?.side ?? this.active;
    let i = cell?.i ?? -1;
    if (!this.editable(side)) {
      this.toast('You can only pick your own team');
      return false;
    }
    const replacing = i >= 0 && !!this.teams[side][i];
    if (!replacing && this.count(side) >= this.sizes[side]) {
      this.toast(`${NAME[side]} team is full (${this.sizes[side]} / ${this.sizes[side]})`, 'error');
      return false;
    }
    if (i < 0) i = freeCellFor(this.teams[side], id);
    if (i < 0) return false;
    this.teams[side][i] = id;
    this.pop = { side, cell: i };
    this.sel = id;
    this.infoId = id;
    // Dolan taraftan eksik olan diğer tarafa geç
    if (this.count(side) >= this.sizes[side] && this.count(this.other(side)) < this.sizes[this.other(side)] && this.editable(this.other(side))) side = this.other(side);
    this.active = side;
    this.refresh();
    return true;
  }

  // --- Text helpers (taslak tipografisi) ---

  // Kit kısayolları (src/game/elegant-ui.ts)
  private cz(x: number, y: number, text: string, size: number, color: string, em = 0.05, o: { pad?: boolean; weight?: string } = {}): Phaser.GameObjects.Text {
    return elText(this, x, y, text, size, color, { em, ...o });
  }

  private gar(x: number, y: number, text: string, size: number, color: string, italic = true): Phaser.GameObjects.Text {
    return elBody(this, x, y, text, size, color, italic);
  }

  private glow(t: Phaser.GameObjects.Text, on: boolean): void {
    elGlow(t, on);
  }

  private diamond(r: number, hollow = false): Phaser.GameObjects.Graphics {
    return elDiamond(this, r, hollow);
  }

  private lnk(label: string, run: () => void, o: { size?: number; small?: string } = {}) {
    return elLink(this, label, run, { ...o, isBusy: () => !!this.drag?.moved });
  }

  /** Sol üst ◂ Back / Esc: kurulum ekranı, onaysız ana menünün Play kartlarına döner. Multiplayer'da lobiden ayrılmak onay ister. */
  private goBack(): void {
    if (this.starting) return;
    if (this.mp) {
      elConfirm(this, { title: 'Leave the match?', text: 'You will leave the lobby and your opponent will be disconnected.', yes: 'Leave', no: 'Stay', onYes: () => startMainMenu(this.game) });
      return;
    }
    this.starting = true;
    this.hideTip(true);
    elGo(this, 'MainMenuScene', { view: 'play' });
  }

  // --- Scenery ---

  private buildBackground(): void {
    const want = ['proving-grounds-sunny-afternoon', content.battles[content.DEFAULT_BATTLE]?.background ?? ''];
    const id = want.find((b) => b && hasBackground(this, b));
    const img = id ? this.add.image(W / 2, H / 2, backgroundKey(id)).setDepth(0) : undefined;
    this.bg = { img };
    // Taslaktaki koyulaştırma: linear-gradient(180deg, .82 0%, .66 30%, .72 60%, .94 70%, .97 100%)
    const shade = this.add.graphics().setDepth(1);
    vGradient(shade, FULL_X0, 0, FULL_W, H, INK, [
      [0, 0.82],
      [0.3, 0.66],
      [0.6, 0.72],
      [0.7, 0.94],
      [1, 0.97],
    ]);
  }

  /** Arka plan görseli görünen alanı kaplar (background-size: cover; background-position: center 60%). */
  private layoutBackground(): void {
    const img = this.bg?.img;
    if (!img) return;
    const vw = stageView.viewW || W;
    const k = Math.max(vw / img.width, H / img.height);
    img.setScale(k);
    const h = img.height * k;
    img.setPosition(W / 2, (H - h) * 0.6 + h / 2);
  }

  private buildHeader(): void {
    this.menuLink = elBack(this, () => this.goBack(), { isBusy: () => !!this.drag?.moved }).root;
    this.titleRoot = elHeading(this, W / 2, 58, 'Quick Battle', 40).setDepth(20);
  }
  private titleRoot?: Phaser.GameObjects.Container;

  private buildSide(side: Side): void {
    const root = this.add.container(0, MID_TOP).setDepth(12);
    const enemy = side === 'enemies';
    // Başlık satırı: [elmas + PLAYER] [n / boyut] [çizgi] [< 4 >]  (Enemy'de ayna)
    const dia = this.diamond(7.8).setScale(0.4).setAlpha(0);
    const title = this.cz(0, HEAD_CY, NAME[side], 32, TXT, 0.1, { pad: true }).setOrigin(0, 0.5);
    const tw = title.width - PAD * 2;
    const titleW = 11 + 14 + tw;
    const tx0 = enemy ? SIDE_W - titleW : 0; // başlık bloğunun sol kenarı
    dia.setPosition(tx0 + 5.5, HEAD_CY);
    title.x = tx0 + 25 - PAD;
    const tzone = this.add.zone(tx0 + titleW / 2, HEAD_CY, titleW + 20, HIT).setInteractive({ useHandCursor: this.editable(side) });
    tzone.on('pointerup', () => !this.drag?.moved && this.setActive(side));
    const grow = this.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [grow, dia, title, tzone];
    let count: Phaser.GameObjects.Text | undefined;
    const showCount = this.editable(side) || !this.mp;
    if (showCount) {
      count = this.gar(0, HEAD_CY + 1, '', 22, MUTED).setOrigin(enemy ? 1 : 0, 0.5);
      count.x = enemy ? tx0 - 16 : titleW + 16;
      parts.push(count);
    }
    const view: SideView = { root, title, dia, count, grow, cells: this.add.container(0, 0) };
    if (!this.mp) {
      view.stepper = this.makeStepper(side);
      view.stepper.root.setPosition(enemy ? 0 : SIDE_W - 168, HEAD_CY);
      parts.push(view.stepper.root);
    }
    // FRONT etiketi (ön sıra ortaya bakar: Player'da sağ sütun, Enemy'de sol)
    const front = this.cz(enemy ? CELL / 2 : SIDE_W - CELL / 2, GRID_Y - 30 + 8, 'Front', 13, 'rgba(217,178,106,0.7)', 0.24).setOrigin(0.5);
    parts.push(front, view.cells);
    // Random · Clear (yalnızca düzenlenebilen taraf)
    if (this.editable(side)) {
      const r = this.lnk('Random', () => {
        this.active = side;
        this.randomize(side);
      });
      const c = this.lnk('Clear', () => {
        this.teams[side] = this.emptyCells();
        this.active = side;
        this.refresh();
      });
      const sep = this.cz(0, ACTS_CY, '◆', 14, 'rgba(217,178,106,0.35)', 0).setOrigin(0.5);
      const total = r.width + 6 + 14 + 6 + c.width;
      const x0 = enemy ? SIDE_W - total : 0;
      r.root.setPosition(x0, ACTS_CY);
      sep.x = x0 + r.width + 6 + 7;
      c.root.setPosition(x0 + r.width + 6 + 14 + 6, ACTS_CY);
      parts.push(r.root, sep, c.root);
    }
    root.add(parts);
    this.sides[side] = view;
  }

  /** Başlık çizgisi (sayının bittiği yerden boyut seçiciye kadar). Sayı yazısı değişince yeniden çizilir. */
  private drawGrow(side: Side): void {
    const v = this.sides[side];
    const enemy = side === 'enemies';
    const titleW = 25 + v.title.width - PAD * 2;
    const countW = v.count ? v.count.width + 16 : 0;
    const stepW = v.stepper ? 168 + 16 : 0;
    const a = enemy ? stepW : titleW + countW + 16;
    const b = enemy ? SIDE_W - titleW - countW - 16 : SIDE_W - stepW;
    v.grow.clear();
    if (b > a) v.grow.lineStyle(1, GOLDC, LINE.a1).lineBetween(a, HEAD_CY, b, HEAD_CY);
  }

  /** `< 4 >` boyut seçici: altın ok düğmeleri (60 px; dokunma alanı 72) + değer. Kök (0, 0) = sol kenar, dikey orta. */
  private makeStepper(side: Side): NonNullable<SideView['stepper']> {
    const root = this.add.container(0, 0);
    const mk = (cx: number, sign: -1 | 1) => {
      const g = this.add.graphics();
      let enabled = true;
      let hover = false;
      const draw = () => {
        g.clear();
        const col = !enabled ? GOLDC : hover ? ONC : GOLDC;
        const a = enabled ? 1 : 0.22;
        g.lineStyle(5, 0x000000, a * 0.45);
        const pts = sign < 0 ? [{ x: 3, y: -7 }, { x: -4, y: 0 }, { x: 3, y: 7 }] : [{ x: -3, y: -7 }, { x: 4, y: 0 }, { x: -3, y: 7 }];
        g.strokePoints(pts.map((p) => ({ x: p.x, y: p.y + 1 })), false);
        g.lineStyle(2, col, a).strokePoints(pts, false);
      };
      draw();
      const c = this.add.container(cx, 0, [g]);
      const zone = this.add.zone(0, 0, HIT, HIT).setInteractive({ useHandCursor: true });
      c.add(zone);
      zone.on('pointerover', () => {
        hover = true;
        draw();
      });
      zone.on('pointerout', () => {
        hover = false;
        draw();
        this.tweens.add({ targets: c, scale: 1, duration: 120 });
      });
      zone.on('pointerdown', () => enabled && this.tweens.add({ targets: c, scale: 0.9, duration: 80, ease: easeOut }));
      zone.on('pointerup', () => {
        this.tweens.add({ targets: c, scale: 1, duration: 120, ease: easeOut });
        if (enabled) this.setSize(side, stepSize(this.sizes[side], sign));
      });
      root.add(c);
      return (on: boolean) => {
        enabled = on;
        draw();
      };
    };
    const minus = mk(30, -1);
    const value = this.cz(84, 1, '4', 34, ON, 0).setOrigin(0.5);
    root.add(value);
    const plus = mk(138, 1);
    return { root, value, minus, plus };
  }

  /** Ortada yalnızca VS (iki yanında saydamlaşan çizgiler). */
  private buildCenter(): void {
    const c = this.add.container(W / 2, 0).setDepth(14);
    const vs = this.cz(54 * 0.05, CENTER_CY, 'VS', 54, 'rgba(243,217,153,0.85)', 0.1).setOrigin(0.5);
    const vw = vs.width - 54 * 0.1;
    const lines = this.add.graphics();
    fadeLine(lines, -vw / 2 - 18 - 70, -vw / 2 - 18, CENTER_CY + 1, GOLDC, LINE.a3, 'in');
    fadeLine(lines, vw / 2 + 18 + 70, vw / 2 + 18, CENTER_CY + 1, GOLDC, LINE.a3, 'in');
    c.add([lines, vs]);
    this.center = c;
  }

  /**
   * Sağ alttaki eylem bloğu (START'ın üstü): Random both (START'la aynı genişlikte, ikincil stil; multiplayer'da yok) ve onun üstünde
   * sağa yaslı durum yazısı (hazır / eksik sınıf; her uyarı ayrı satır). Kök x = START'ın ortası.
   */
  private buildActions(): void {
    const w = this.startUi?.w ?? 380;
    const root = this.add.container(0, 0).setDepth(30);
    let top = START.cy - START.h / 2;
    if (!this.mp) {
      const rb = elButton(
        this,
        'Random both',
        () => {
          this.randomize('party', false);
          this.randomize('enemies');
        },
        { kind: 'secondary', w, h: RANDOM_BOTH.h, isBusy: () => !!this.drag?.moved },
      );
      const cy = top - RANDOM_BOTH.gap - RANDOM_BOTH.h / 2;
      rb.root.setY(cy);
      root.add(rb.root);
      top = cy - RANDOM_BOTH.h / 2;
    }
    // Durum yazısı: bloğun sağ kenarına yaslı, alttan yukarı büyür (iki uyarı iki satır)
    this.status = this.gar(w / 2 + 2, top - 12, '', 20, NOTE).setOrigin(1, 1).setAlign('right').setLineSpacing(-2);
    root.add(this.status);
    this.actions = root;
  }

  /** START BATTLE (multiplayer: READY): kitin primary düğmesi, sağ alt köşe. */
  private buildStart(): void {
    const b = elButton(this, this.mp ? 'Ready' : 'Start Battle', () => !this.drag?.moved && this.start(), { kind: 'primary', minLabel: this.mp ? 'Not ready' : undefined, h: START.h, size: START.size, isBusy: () => !!this.drag?.moved });
    b.root.setY(START.cy).setDepth(30);
    this.startUi = b;
    this.toastFn = elToast(this);
  }

  /** Kısa bildirim (üst ortada): takım dolu, eksik sınıf... */
  private toast(msg: string, sound: UiSoundKind | null = 'toast'): void {
    this.toastFn?.(msg, sound);
  }

  private setStatus(text: string, hex: string, pulse = false): void {
    if (!this.status) return;
    // Her uyarı ayrı satır (dar sağ alt blokta okunur kalsın)
    this.status.setText(text.split(/\s+·\s+/).join('\n')).setColor(hex);
    if (pulse) {
      this.statusTween?.stop();
      this.status.setScale(1.1);
      this.statusTween = this.tweens.add({ targets: this.status, scale: 1, duration: 360, ease: 'Back.easeOut' });
    }
  }

  // --- Info line (alt bilgi satırı) ---

  private buildInfo(): void {
    this.infoLines = this.add.graphics().setDepth(14);
    this.infoRoot = this.add.container(0, INFO.top + INFO.h / 2).setDepth(15);
  }

  private infoBox(): { x0: number; w: number } {
    const vw = stageView.viewW || W;
    const w = Math.min(INFO.maxW, vw - 168);
    return { x0: W / 2 - w / 2, w };
  }

  /** Bilgi satırını çizer: avatar · ad + rol · 4 stat · 4 skill + pasif · ipucu. */
  private renderInfo(): void {
    const root = this.infoRoot;
    if (!root || !this.infoLines) return;
    const def = content.classes[this.infoId];
    root.removeAll(true);
    const { x0, w } = this.infoBox();
    this.infoLines.clear();
    this.infoLines.lineStyle(1, GOLDC, LINE.a1).lineBetween(x0, INFO.top, x0 + w, INFO.top).lineBetween(x0, INFO.top + INFO.h, x0 + w, INFO.top + INFO.h);
    if (!def) return;
    let x = x0 + 12;
    // Avatar (üstüne gelince class özeti: türev statlar, pasif, skill'ler)
    const av = this.add.graphics();
    av.fillStyle(0x120c08, 1).fillRect(x, -36, 72, 72);
    const img = classAvatar(this, def, x + 36, 0, 72);
    const avb = this.add.graphics();
    avb.lineStyle(2, GOLDC, LINE.a3).strokeRect(x, -36, 72, 72);
    root.add([av, img, avb]);
    x += 72 + 26;
    const nm = this.cz(x, -12, def.name, 30, ON, 0.06).setOrigin(0, 0.5);
    const rl = this.gar(x, 20, archetypeOf(def), 20, MUTED).setOrigin(0, 0.5);
    root.add([nm, rl]);
    const nameW = Math.max(nm.width, rl.width);
    const czone = this.add.zone(x0 + 12 + (72 + 26 + nameW) / 2, 0, 72 + 26 + nameW, 80).setInteractive();
    czone.on('pointerover', () => !this.drag?.moved && this.showTip(`class:${def.id}`, this.classTip(def), { x: x0 + 12, y: INFO.top + 6, w: 72 + 26 + nameW, h: 80 }));
    czone.on('pointerout', () => this.hideTip());
    root.add(czone);
    x += Math.max(nameW, 210) + 26;
    // Statlar: ikon + kısa ad + değer (primary altın)
    for (const k of ATTRS) {
      const pri = def.primary === k;
      const sx = x;
      const ic = this.add.image(x + 11, 0, ensureIcon(this, statIconName(k), STAT_COLOR[k], false)).setDisplaySize(22, 22);
      x += 22 + 6;
      const lb = this.cz(x, 1, STAT_LABEL[k], 12, pri ? PRI_SMALL : MUTED, 0.12).setOrigin(0, 0.5);
      x += lb.width + 6;
      const v = this.cz(x, 0, String(def.stats[k]), 19, pri ? PRI : TXT, 0).setOrigin(0, 0.5);
      x += v.width;
      const zw = x - sx;
      const z = this.add.zone(sx + zw / 2, 0, zw + 12, 60).setInteractive();
      z.on('pointerover', () => !this.drag?.moved && this.showTip(`stat:${def.id}:${k}`, this.statTip(def, k), { x: sx, y: INFO.top + 20, w: zw, h: 50 }));
      z.on('pointerout', () => this.hideTip());
      root.add([ic, lb, v, z]);
      x += 18;
    }
    x += 26 - 18;
    // Skill'ler (48 px kutular) + pasif
    const boxes: Array<{ key: string; icon: string; tip: () => TipSpec }> = def.skills
      .map((sid) => content.skills[sid])
      .filter((sk): sk is NonNullable<typeof sk> => !!sk)
      .map((sk) => ({ key: `skill:${def.id}:${sk.id}`, icon: ensureSkillIcon(this, sk), tip: () => this.skillTip(def, sk.id) }));
    if (def.passive) {
      const p = def.passive;
      boxes.push({
        key: `passive:${def.id}`,
        icon: ensureIcon(this, p.icon, def.color, false, ownerOfUnit(def.id)),
        tip: () => ({ icon: ensureIcon(this, p.icon, def.color, false, ownerOfUnit(def.id)), title: p.name, badge: 'Passive', lines: [[describePassive(p, def.stats, content.formulas)]] }),
      });
    }
    boxes.forEach((b, k) => {
      const bx = x;
      const box = this.add.container(bx + 24, 0);
      const g = this.add.graphics();
      const passive = def.passive && k === boxes.length - 1;
      const drawBox = (hov: boolean) => {
        g.clear();
        g.fillStyle(INK, 0.55).fillRect(-24, -24, 48, 48);
        if (passive) g.lineStyle(1, hov ? ONC : GOLDC, hov ? 1 : LINE.a2).strokeCircle(0, 0, 23);
        else g.lineStyle(1, hov ? ONC : GOLDC, hov ? 1 : LINE.a2).strokeRect(-24, -24, 48, 48);
      };
      drawBox(false);
      const ic = this.add.image(0, 0, b.icon).setDisplaySize(passive ? 34 : 48, passive ? 34 : 48);
      const z = this.add.zone(0, 0, 58, 64).setInteractive();
      box.add([g, ic, z]);
      z.on('pointerover', () => {
        if (this.drag?.moved) return;
        drawBox(true);
        this.tweens.add({ targets: box, y: -2, duration: 180, ease: easeOut });
        this.showTip(b.key, b.tip(), { x: bx, y: INFO.top + 22, w: 48, h: 48 });
      });
      z.on('pointerout', () => {
        drawBox(false);
        this.tweens.add({ targets: box, y: 0, duration: 180, ease: easeOut });
        this.hideTip();
      });
      root.add(box);
      x += 48 + 10;
    });
    // İpucu (sağa yaslı, iki satır; etkin takımın adı vurgulu)
    const right = x0 + w - 12;
    if (right - x > 260) {
      const l1 = this.mp
        ? ([['Click to add to ', DIM, true], ['your', ON, false], [' team, or drag onto a slot.', DIM, true]] as const)
        : ([['Click to add to the ', DIM, true], [NAME[this.active], ON, false], [' team, or drag onto a slot.', DIM, true]] as const);
      let rx = right;
      for (let k = l1.length - 1; k >= 0; k--) {
        const [s, col, it] = l1[k]!;
        const t = this.gar(rx, -11, s, 19, col, it).setOrigin(1, 0.5);
        root.add(t);
        rx -= t.width;
      }
      root.add(this.gar(right, 12, 'Click a placed hero to remove it.', 19, DIM).setOrigin(1, 0.5));
    }
  }

  /** Bilgi satırındaki class'ı değiştirir (fare çekilince geri dönmez). */
  private showInfo(id: string | null): void {
    const next = infoClassAfter(this.infoId, id);
    if (next === this.infoId) return;
    this.infoId = next;
    this.renderInfo();
  }

  // --- Class strip (raf) ---

  private buildStrip(): void {
    this.stripRoot?.destroy();
    this.tiles = new Map();
    this.stripGroups = [];
    const root = this.add.container(0, STRIP_TOP).setDepth(16);
    this.stripRoot = root;
    const groups = rosterGroups();
    const avail = this.startLeft() - 40 - (stageView.left + 48);
    const lay = stripLayout(
      groups.map((g) => g.items.length),
      avail,
    );
    let x = 0;
    groups.forEach((g) => {
      const gc = this.add.container(x, 0);
      const col = groupColor(PRIMARY_GROUP, g.stat);
      const colN = hexNum(col);
      const gw = g.items.length * lay.tile + (g.items.length - 1) * lay.gap;
      // Grup etiketi: elmas + STR + saydamlaşan çizgi
      const gl = this.add.graphics();
      gl.fillStyle(colN, 0.85).fillPoints(diamondPts(4, 10, 5.6), true);
      const label = this.cz(18, 10, g.test ? 'Test' : (g.stat ?? 'other'), 14, col, 0.26).setOrigin(0, 0.5);
      const lx = 18 + label.width + 10;
      fadeLine(gl, lx, gw, 10, colN, 0.45, 'out');
      gc.add([gl, label]);
      g.items.forEach((c, k) => {
        const tv = this.buildTile(c.id, k * (lay.tile + lay.gap), 20 + 12, lay.tile, col);
        gc.add(tv.root);
        this.tiles.set(c.id, tv);
      });
      root.add(gc);
      this.stripGroups.push(gc);
      x += gw + lay.groupGap;
    });
    const width = x - lay.groupGap;
    // Sahnenin ortasında; START'la çakışırsa sola kayar (ama sol kenardan taşmaz)
    const right = this.startLeft() - 40;
    root.x = Math.max(stageView.left + 48, Math.min(W / 2 - width / 2, right - width));
    this.updateTiles(false);
  }

  private buildTile(id: string, x: number, y: number, size: number, groupHex: string): TileView {
    const def = content.classes[id]!;
    const root = this.add.container(x, y);
    const lift = this.add.container(0, 0);
    const shadow = this.add.graphics().setAlpha(0);
    shadow.fillStyle(0x000000, 0.18).fillRect(-4, 8, size + 8, size + 6).fillStyle(0x000000, 0.22).fillRect(0, 10, size, size);
    const bg = this.add.graphics();
    vGradient(bg, 0, 0, size, size, 0x281d13, [
      [0, 0.7],
      [1, 0.7],
    ]);
    bg.fillGradientStyle(0x0a0705, 0x0a0705, 0x0a0705, 0x0a0705, 0, 0, 0.85, 0.85).fillRect(0, 0, size, size);
    const img = classAvatar(this, def, size / 2, size / 2, size);
    const accent = this.add.graphics();
    accent.fillStyle(hexNum(groupHex), 0.55).fillRect(0, 0, size, 2);
    const frame = this.add.graphics();
    const name = fitWidth(this.cz(size / 2, size + 8 + 10, def.name, 15, TXT, 0.06).setOrigin(0.5), size + 14);
    const parts: Phaser.GameObjects.GameObject[] = [shadow, bg, img, accent];
    if (isTestClass(def)) {
      const tg = this.add.graphics();
      tg.fillStyle(0xffb347, 1).fillRect(size - 44, size - 18, 40, 14);
      parts.push(tg, this.cz(size - 24, size - 11, 'Test', 10, '#2a1405', 0.06).setOrigin(0.5).setShadow(0, 0, 'rgba(0,0,0,0)', 0));
    }
    // Takım rozetleri: sol üst mavi (Player), sağ üst kırmızı (Enemy); yalnızca o class takımda varken
    const badges = { party: elBadge(this, 'party'), enemies: elBadge(this, 'enemies') };
    badges.party.c.setPosition(17, 17);
    badges.enemies.c.setPosition(size - 17, 17);
    lift.add([...parts, frame, badges.party.c, badges.enemies.c, name]);
    const zone = this.add.zone(size / 2, (size + 30) / 2, size + 10, size + 34).setInteractive({ useHandCursor: true });
    root.add([lift, zone]);
    const tv: TileView = { id, root, lift, frame, shadow, img, name, badges, size, hover: false };
    zone.on('pointerover', () => {
      if (this.drag?.moved) return;
      tv.hover = true;
      this.styleTile(tv);
      this.tweens.add({ targets: lift, y: -6, duration: 250, ease: easeOut });
      this.tweens.add({ targets: shadow, alpha: 1, duration: 250 });
      this.zoomImg(img, 1.06, size);
      this.showInfo(id);
    });
    zone.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (this.drag?.moved) return;
      // Rozetin üstünde: anlamını söyleyen küçük ipucu
      const p = worldXY(this, ptr);
      const m = root.getWorldTransformMatrix();
      const lx = p.x - m.tx;
      const ly = p.y - m.ty + 6;
      for (const side of SIDES) {
        const b = badges[side];
        if (b.n > 0 && Math.hypot(lx - b.c.x, ly - b.c.y) <= 16) {
          this.showTip(`badge:${id}:${side}`, { title: `${NAME[side]} team`, titleHex: BADGE_LABEL[side], lines: [[`${b.n} ${def.name}${b.n > 1 ? 's' : ''} in the ${NAME[side]} team`]], width: 340 }, { x: m.tx + b.c.x - 14, y: m.ty - 6 + b.c.y - 14, w: 28, h: 28 });
          return;
        }
      }
      if (this.tip?.key.startsWith('badge:')) this.hideTip(true);
    });
    zone.on('pointerout', () => {
      tv.hover = false;
      this.styleTile(tv);
      this.tweens.add({ targets: lift, y: 0, duration: 250, ease: easeOut });
      this.tweens.add({ targets: shadow, alpha: 0, duration: 250 });
      this.zoomImg(img, 1, size);
      if (this.tip?.key.startsWith('badge:')) this.hideTip();
    });
    zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const p = worldXY(this, ptr);
      this.drag = { kind: 'class', id, sx: p.x, sy: p.y, moved: false, over: null };
    });
    this.styleTile(tv);
    return tv;
  }

  /** Raf portresinin çerçevesi ve ad rengi: hover altın, seçili 2 px açık altın. */
  private styleTile(tv: TileView): void {
    const s = tv.size;
    const sel = this.sel === tv.id;
    tv.frame.clear();
    if (sel) tv.frame.lineStyle(2, ONC, 1).strokeRect(1, 1, s - 2, s - 2);
    else tv.frame.lineStyle(1, GOLDC, tv.hover ? 1 : LINE.a2).strokeRect(0.5, 0.5, s - 1, s - 1);
    tv.name.setColor(tv.hover || sel ? ON : TXT);
  }

  /**
   * Görseli kendi kutusu içinde yakınlaştırır (CSS'teki overflow:hidden + scale(1.06)): kırpma bölgesi merkezde daralır, ölçek aynı oranda büyür.
   * `box` = kutunun kenarı (dünya pikseli).
   */
  private zoomImg(img: Phaser.GameObjects.Image, to: number, box: number): void {
    const st = (img.getData('zoom') as number | undefined) ?? 1;
    const fw = img.frame.width;
    const fh = img.frame.height;
    const base = (img.getData('base') as number | undefined) ?? box / Math.max(fw, fh);
    img.setData('base', base);
    const flip = img.flipX;
    const apply = (z: number) => {
      img.setData('zoom', z);
      const cw = fw / z;
      const ch = fh / z;
      img.setCrop((fw - cw) / 2, (fh - ch) / 2, cw, ch);
      img.setScale(base * z);
      img.setFlipX(flip);
    };
    const o = { z: st };
    this.tweens.add({ targets: o, z: to, duration: 350, ease: easeOut, onUpdate: () => apply(o.z) });
  }

  /** Rozet sayıları ve seçili çerçeve takımları izler. */
  private updateTiles(animate = true): void {
    for (const tv of this.tiles.values()) {
      const n = classCounts(this.teams, tv.id);
      for (const side of SIDES) {
        const b = tv.badges[side];
        const v = this.mp && !this.editable(side) ? 0 : n[side];
        b.set(v, animate);
      }
      this.styleTile(tv);
    }
  }

  // --- Teams ---

  private sideX(side: Side): number {
    return side === 'party' ? stageView.left + SIDE_INSET : stageView.right - SIDE_INSET - SIDE_W;
  }

  /** START düğmesinin sol kenarı (dünya x). */
  private startLeft(): number {
    return stageView.right - START.right - (this.startUi?.w ?? 380);
  }

  /** Yuvanın taraf kutusundaki yerel konumu: Player'ın ön sırası sağda, Enemy'ninki solda; şerit = satır. */
  private cellLocal(side: Side, i: number): { lx: number; ly: number } {
    const row = Math.floor(i / LANES);
    const lane = i % LANES;
    const col = side === 'party' ? ROWS - 1 - row : row;
    return { lx: col * (CELL + CELL_GAP), ly: GRID_Y + lane * (CELL + CELL_GAP) };
  }

  private refresh(): void {
    if (!this.built) return;
    this.hideTip(true);
    for (const side of SIDES) this.drawTeam(side);
    this.updateHeads();
    this.updateTiles();
    this.renderInfo();
    const ok = this.ready();
    if (this.mp) {
      this.refreshMp();
      const me = this.mp.myReady();
      this.startUi?.setLabel(me ? 'Not ready' : 'Ready');
      this.startUi?.setReady(ok);
      if (!ok) this.setStatus(this.missingText(), colors.lethal);
      else if (me) this.setStatus(this.mp.opponentReady() ? 'Both ready - starting...' : 'Waiting for your opponent to be ready', ON);
      else this.setStatus('Your team is complete - press READY', ON);
    } else {
      this.startUi?.setReady(ok);
      if (ok) this.setStatus('Both teams are ready', ON);
      else this.setStatus(this.missingText(), NOTE);
    }
    this.pop = undefined;
  }

  private updateHeads(): void {
    for (const side of SIDES) {
      const v = this.sides[side];
      const on = this.active === side;
      v.title.setColor(on ? ON : TXT);
      this.glow(v.title, on);
      this.tweens.killTweensOf(v.dia);
      this.tweens.add({ targets: v.dia, alpha: on ? 1 : 0, scale: on ? 1 : 0.4, duration: 200, ease: easeOut });
      v.count?.setText(`${this.count(side)} / ${this.sizes[side]}`);
      if (v.stepper) {
        v.stepper.value.setText(String(this.sizes[side]));
        v.stepper.minus(this.sizes[side] > 1);
        v.stepper.plus(this.sizes[side] < CELLS);
      }
      this.drawGrow(side);
      if (!v.root.getData('entering')) {
        this.tweens.killTweensOf(v.root);
        this.tweens.add({ targets: v.root, alpha: on ? 1 : 0.78, duration: 300 });
      }
    }
  }

  /** Multiplayer: rakip dizilimin örtüsü (takımı gizli; yalnızca hazır durumu); takım değiştiyse hazır bozulur. */
  private refreshMp(): void {
    const m = this.mp;
    if (!m) return;
    const cells = this.teams[m.localSide];
    const key = cells.join(',');
    if (key !== this.mpSent) {
      this.mpSent = key;
      // takım değişti: yeniden hazır olunmalı (gönderimin olayı bu sahneyi iç içe yeniden çizmesin)
      this.mpSyncing = true;
      m.setTeam([...cells], false);
      this.mpSyncing = false;
    }
    const v = this.sides[this.other(m.localSide)];
    v.cover?.destroy();
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(INK, 0.8).fillRect(-6, GRID_Y - 6, GRID_W + 12, GRID_H + 12);
    g.lineStyle(1, GOLDC, LINE.a2).strokeRect(-6, GRID_Y - 6, GRID_W + 12, GRID_H + 12);
    const ready = m.opponentReady();
    const cy = GRID_Y + GRID_H / 2;
    const dia = this.diamond(7).setPosition(GRID_W / 2, cy - 56);
    if (!ready) dia.setAlpha(0.35);
    c.add([g, dia]);
    c.add(fitWidth(this.cz(GRID_W / 2, cy - 14, ready ? 'Opponent is ready' : 'Opponent is choosing...', 28, ready ? ON : TXT, 0.08, { pad: true }).setOrigin(0.5), GRID_W - 20));
    c.add(fitWidth(this.gar(GRID_W / 2, cy + 30, `${m.opponentName()}'s team is revealed when the battle starts`, 20, MUTED).setOrigin(0.5), GRID_W - 30));
    v.root.add(c);
    v.cover = c;
  }

  private drawTeam(side: Side): void {
    const v = this.sides[side];
    for (const ch of v.cells.list) this.tweens.killTweensOf(ch);
    v.cells.removeAll(true);
    this.cellViews = this.cellViews.filter((c) => c.side !== side);
    const team = this.teams[side];
    for (let i = 0; i < CELLS; i++) {
      const { lx, ly } = this.cellLocal(side, i);
      const row = Math.floor(i / LANES);
      const id = this.mp && !this.editable(side) ? '' : team[i];
      const def = id ? content.classes[id] : undefined;
      const body = this.drawCell(side, i, lx, ly, def, row === 0);
      const hot = this.add.container(lx + CELL / 2, ly + CELL / 2).setVisible(false);
      const hg = this.add.graphics();
      hg.lineStyle(2, EMBER, 1).strokeRect(-CELL / 2 + 1, -CELL / 2 + 1, CELL - 2, CELL - 2);
      hg.lineStyle(1, EMBER, 0.8).strokeRect(-CELL / 2 + 3, -CELL / 2 + 3, CELL - 6, CELL - 6);
      const hglow = this.add.image(0, 0, ensureGlow(this)).setTint(EMBER).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(CELL * 1.6, CELL * 1.6).setAlpha(0.38);
      hot.add([hglow, hg]);
      v.cells.add([body, hot]);
      this.cellViews.push({ side, i, lx, ly, body, hot });
      if (this.pop && this.pop.side === side && this.pop.cell === i) {
        body.setScale(0.8).setAlpha(0);
        this.tweens.add({ targets: body, scale: 1, alpha: 1, duration: 420, ease: easeOut });
      }
    }
  }

  /** Bir dizilim yuvası (merkezli kap): boşken ince çerçeve + ortada içi boş elmas; doluyken avatar + ad + (hover'da) ×. */
  private drawCell(side: Side, i: number, lx: number, ly: number, def: CombatantDef | undefined, front: boolean): Phaser.GameObjects.Container {
    const h = CELL / 2;
    const body = this.add.container(lx + h, ly + h);
    const g = this.add.graphics();
    body.add(g);
    if (!def) {
      g.fillStyle(INK, 0.38).fillRect(-h, -h, CELL, CELL);
      const warm = this.add.image(0, h * 0.4, ensureGlow(this)).setTint(GOLDC).setDisplaySize(CELL * 1.1, CELL * 0.9).setAlpha(0.09);
      const frame = this.add.graphics();
      frame.lineStyle(1, GOLDC, front ? 0.42 : LINE.a2).strokeRect(-h + 0.5, -h + 0.5, CELL - 1, CELL - 1);
      frame.lineStyle(1, GOLDC, 0.22).strokePoints(diamondPts(0, 0, 6.4), true);
      body.add([warm, frame]);
      const z = this.add.zone(0, 0, CELL, CELL).setInteractive();
      z.on('pointerup', () => !this.drag?.moved && this.editable(side) && this.setActive(side));
      body.add(z);
      return body;
    }
    vGradient(g, -h, -h, CELL, CELL, 0x2e2115, [
      [0, 0.75],
      [1, 0.75],
    ]);
    g.fillGradientStyle(0x0a0705, 0x0a0705, 0x0a0705, 0x0a0705, 0, 0, 0.9, 0.9).fillRect(-h, -h, CELL, CELL);
    const img = classAvatar(this, def, 0, 0, CELL - 4, side === 'enemies');
    const shade = this.add.graphics();
    vGradient(shade, -h, h - 40, CELL, 40, 0x080604, [
      [0, 0],
      [1, 0.92],
    ]);
    const name = fitWidth(this.cz(0, h - 13, def.name, 13, ON, 0.06).setOrigin(0.5), CELL - 8);
    const x = this.cz(h - 12, -h + 13, '×', 16, ON, 0).setOrigin(0.5).setAlpha(0);
    const frame = this.add.graphics();
    const drawFrame = (hov: boolean) => {
      frame.clear();
      frame.lineStyle(2, hov ? ONC : GOLDC, hov ? 1 : 0.62).strokeRect(-h + 1, -h + 1, CELL - 2, CELL - 2);
    };
    drawFrame(false);
    body.add([img, shade, name, x, frame]);
    if (isTestClass(def)) {
      const tg = this.add.graphics();
      tg.fillStyle(0xffb347, 1).fillRect(-h + 4, -h + 4, 34, 13);
      body.add([tg, this.cz(-h + 21, -h + 10.5, 'Test', 9, '#2a1405', 0.04).setOrigin(0.5).setShadow(0, 0, 'rgba(0,0,0,0)', 0)]);
    }
    const zone = this.add.zone(0, 0, CELL, CELL).setInteractive({ useHandCursor: this.editable(side) });
    body.add(zone);
    zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const p = worldXY(this, ptr);
      if (this.editable(side)) this.drag = { kind: 'cell', id: def.id, side, from: i, sx: p.x, sy: p.y, moved: false, over: null };
    });
    zone.on('pointerover', () => {
      if (this.drag?.moved) return;
      drawFrame(true);
      this.tweens.add({ targets: x, alpha: 0.9, duration: 180 });
      this.zoomImg(img, 1.06, CELL - 4);
      this.showInfo(def.id);
    });
    zone.on('pointerout', () => {
      drawFrame(false);
      this.tweens.add({ targets: x, alpha: 0, duration: 180 });
      this.zoomImg(img, 1, CELL - 4);
    });
    return body;
  }

  // --- Layout (geniş ekran) ---

  private layout(): void {
    if (!this.built) return;
    this.hideTip(true);
    this.layoutBackground();
    this.menuLink?.setX(stageView.left + 48);
    for (const side of SIDES) this.sides[side].root.setX(this.sideX(side));
    const ax = stageView.right - START.right - (this.startUi?.w ?? 0) / 2;
    this.startUi?.root.setX(ax);
    this.actions?.setX(ax);
    this.renderInfo();
    if (!this.drag) {
      const entering = this.stripGroups.some((g) => g.getData('entering'));
      if (!entering) this.buildStrip();
    }
  }

  // --- Entrance animation (taslağın .fu / .fi geçişleri) ---

  private playEntrance(): void {
    const fu = (o: Phaser.GameObjects.Container, delay: number, alpha = 1) => {
      const y = o.y;
      o.setData('entering', true);
      o.setAlpha(0).setY(y + 24);
      this.tweens.add({ targets: o, alpha, y, duration: 700, delay, ease: easeOut, onComplete: () => o.setData('entering', false) });
    };
    const fi = (o: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics, delay: number) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 900, delay, ease: 'Sine.easeInOut' });
    };
    if (this.titleRoot) fi(this.titleRoot, 0);
    if (this.menuLink) fi(this.menuLink, 100);
    fu(this.sides.party.root, 150, this.active === 'party' ? 1 : 0.78);
    fu(this.sides.enemies.root, 250, this.active === 'enemies' ? 1 : 0.78);
    if (this.center) fu(this.center, 300);
    if (this.startUi) fu(this.startUi.root, 300);
    if (this.actions) fu(this.actions, 300);
    if (this.infoRoot) fi(this.infoRoot, 300);
    if (this.infoLines) fi(this.infoLines, 300);
    this.stripGroups.forEach((g, gi) => fu(g, 350 + gi * 70));
  }

  // --- Tooltips (taslaktaki #tip) ---

  private statTip(def: CombatantDef, kind: (typeof ATTRS)[number]): TipSpec {
    const info = describeStat(kind, def.stats, content.formulas);
    return {
      icon: ensureIcon(this, statIconName(kind), STAT_COLOR[kind], false),
      iconSize: 40,
      title: info.title,
      titleHex: info.primary ? PRI : STAT_COLOR[kind],
      badge: info.bonus ? `Primary · ${info.bonus.name}` : undefined,
      lines: info.lines.map((l): [string] => [l]),
    };
  }

  private skillTip(def: CombatantDef, skillId: string): TipSpec {
    const skill = content.skills[skillId];
    if (!skill) return { title: skillId, lines: [] };
    const info = describeSkill(skill, def.stats, content.formulas, content.summons, { statuses: content.statuses, grounds: content.grounds });
    const kc = (k: (typeof info.kinds)[number]): string => (k === 'shield' ? colors.shield : k === 'magicShield' ? colors.magicShield : k ? (colors.element as Record<string, string>)[k] ?? TXT : TXT);
    const lines: Array<[string, string?]> = info.lines.map((l, i) => [l, kc(info.kinds[i])]);
    if (info.initialCooldown) lines.push([info.initialCooldown, MUTED]);
    const shape = skillMiniGrid(skill, content.formulas.formation);
    // Hedef türü · element · Melee / Ranged (ortak kaynak src/ui/skill-tags.ts; savaş HUD'ı ve Codex ile aynı)
    const tags = skillTags(skill).map((g) => ({ text: g.text, ...(g.color ? { color: g.color } : {}), ...(g.icon ? { icon: ensureIcon(this, g.icon, g.color ?? '#e8e2d0', false) } : {}) }));
    return { icon: ensureSkillIcon(this, skill), title: info.name, tags, meta: `Cost ${info.cost}   ·   Cooldown ${info.cooldown}`, shape, lines };
  }

  private classTip(def: CombatantDef): TipSpec {
    const f = content.formulas;
    const s = def.stats;
    const lines: Array<[string, string?]> = [];
    if (isTestClass(def)) lines.push(['Test class: left out of random teams, add it by hand', '#ffb347']);
    if (def.primary) {
      const b = primaryBonusInfo(def.primary, f, true);
      lines.push([`Primary ${def.primary.toUpperCase()} - ${b.name}: ${b.detail}`, PRIMARY_GOLD]);
    }
    lines.push([`HP ${s.hp}   ·   MP ${s.mp}   ·   SPD ${s.spd}`]);
    lines.push([`Armor ${s.armor}${s.magicArmor > 0 ? `   ·   Magic armor ${s.magicArmor}` : ''}   ·   Crit ${(s.critChance * 100).toFixed(1).replace(/\.0$/, '')}% x${s.critMult.toFixed(2)}`]);
    if (def.passive) lines.push([`${def.passive.name}: ${describePassive(def.passive, s, f)}`, NOTE]);
    return { icon: ensureIcon(this, def.logo, def.color, false, ownerOfUnit(def.id)), title: def.name, badge: `${archetypeOf(def)} · ${rangeOf(def)}`, lines };
  }

  /** Zarif tooltip: koyu degrade kutu, ince altın çerçeve, Cinzel başlık + EB Garamond satırlar; yukarı kayarak belirir. */
  private showTip(key: string, spec: TipSpec, anchor: { x: number; y: number; w: number; h: number }): void {
    this.tipTimer?.remove();
    if (this.tip?.key === key) return;
    this.hideTip(true);
    const t = elTip(this, spec);
    placeElTip(this, t, anchor, 'above');
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

  // --- Drag & drop (raf -> yuva; yuva -> yuva; yuva -> diğer takım) ---

  private slotAt(x: number, y: number): CellView | undefined {
    return this.cellViews.find((c) => {
      const sx = this.sideX(c.side) + c.lx;
      const sy = MID_TOP + c.ly;
      return x >= sx && x <= sx + CELL && y >= sy && y <= sy + CELL && this.editable(c.side);
    });
  }

  /** Taraf kutusu (yuvaya değil panelin boş yerine bırakma = o takıma otomatik yerleştir). */
  private sideAt(x: number, y: number): Side | null {
    for (const side of SIDES) {
      const sx = this.sideX(side);
      if (x >= sx && x <= sx + SIDE_W && y >= MID_TOP && y <= MID_TOP + SIDE_H && this.editable(side)) return side;
    }
    return null;
  }

  private makeGhost(def: CombatantDef, flip: boolean, p: { x: number; y: number }): Phaser.GameObjects.Container {
    const s = 112;
    const glow = this.add.image(0, 0, ensureGlow(this)).setTint(EMBER).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(s * 1.7, s * 1.7).setAlpha(0.4);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRect(-s / 2 + 4, -s / 2 + 12, s, s);
    g.fillStyle(0x120c08, 1).fillRect(-s / 2, -s / 2, s, s);
    const img = classAvatar(this, def, 0, 0, s, flip);
    const f = this.add.graphics();
    f.lineStyle(2, ONC, 1).strokeRect(-s / 2, -s / 2, s, s);
    return this.add.container(p.x, p.y, [glow, g, img, f]).setDepth(6000);
  }

  private onDragMove(p: { x: number; y: number }): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 8) {
      d.moved = true;
      this.hideTip(true);
      const def = content.classes[d.id]!;
      d.ghost = this.makeGhost(def, d.kind === 'cell' && d.side === 'enemies', p);
      if (d.kind === 'cell') this.cellViews.find((c) => c.side === d.side && c.i === d.from)?.body.setAlpha(0.3);
    }
    if (!d.moved) return;
    d.ghost?.setPosition(p.x, p.y);
    const s = this.slotAt(p.x, p.y);
    const over = s && !(d.kind === 'cell' && s.side === d.side && s.i === d.from) ? { side: s.side, i: s.i } : null;
    if (over?.side !== d.over?.side || over?.i !== d.over?.i) {
      d.over = over;
      for (const c of this.cellViews) c.hot.setVisible(!!over && c.side === over.side && c.i === over.i);
    }
  }

  private onDragEnd(p: { x: number; y: number }, outside: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    d.ghost?.destroy();
    for (const c of this.cellViews) c.hot.setVisible(false);
    if (!d.moved) {
      if (outside) return;
      if (d.kind === 'class') {
        // tıkla = etkin takıma ekle
        if (!this.addClass(d.id)) this.refresh();
      } else if (d.side !== undefined && d.from !== undefined) {
        // tıkla = çıkar
        this.teams[d.side][d.from] = '';
        this.active = d.side;
        this.refresh();
      }
      return;
    }
    if (outside) return this.refresh();
    const slot = this.slotAt(p.x, p.y);
    const side = slot ? slot.side : this.sideAt(p.x, p.y);
    if (d.kind === 'class') {
      if (slot) this.addClass(d.id, { side: slot.side, i: slot.i });
      else if (side) this.addClass(d.id, { side, i: null });
      else this.refresh();
      return;
    }
    if (d.side === undefined || d.from === undefined) return this.refresh();
    const from = { side: d.side, i: d.from };
    if (slot) {
      const r = moveMember(this.teams, this.sizes, from, { side: slot.side, i: slot.i });
      if (r.ok) {
        this.teams = r.teams;
        this.pop = { side: slot.side, cell: slot.i };
      } else if (r.reason === 'full') this.toast(`${NAME[slot.side]} team is full`, 'error');
    } else if (side && side !== d.side) {
      const r = moveToSide(this.teams, this.sizes, from, side);
      if (r.ok) {
        this.teams = r.teams;
        this.pop = { side, cell: r.cell };
      } else if (r.reason === 'full') this.toast(`${NAME[side]} team is full`, 'error');
    }
    this.refresh();
  }
}

/** Yazı `maxW`'dan genişse oranı koruyarak küçültür. */
function fitWidth(t: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  if (t.width > maxW) t.setScale(maxW / t.width);
  return t;
}
