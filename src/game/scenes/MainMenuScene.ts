import Phaser from 'phaser';
import { content } from '../../engine';
import { CONFIG, deleteSave, deleteSlot, getMap, latestSave, listSaves, migrateSaves, readSaves, slotSummaries, type CampaignMode, type Difficulty, type SaveEntry, type SlotSummary } from '../../campaign';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { campaignArtKey, hasCampaignArt, preloadCampaignArt } from '../campaign-art';
import { blurredTexture, edgeFillers, mapArt } from '../map-art';
import { coverShift, focusCrop, placeArt } from '../wide-map';
import layout from '../../../data/battle-layout.json';
import { onStageResize, stageView, worldXY } from '../stage';
import { FULL_W, FULL_X0, MENU_COL_X, menuColumnShift } from '../../ui/viewport';
import { H, W, crown, hpBar, openModal, type Modal } from '../campaign-ui';
import { MAP_SCENE, loadEntry, startNewCampaign, storage } from '../campaign-session';
import { classAvatar, classLogoBadge, ensureGlow, fitText, goldText, makeMenuButton, serif } from '../menu-ui';
import { GOLD, makePanel } from '../ui-frame';
import { mp, MP_SCENE } from '../mp-client';
import { addLogo, hasLogo, preloadLogo } from '../branding';
import { loadVolume, setSettingsVolume } from '../../ui/settings';
import { currentSupport, IOS_HINT, isStandalone, onFullscreenChange, toggleFullscreen } from '../../ui/fullscreen';
import { isInputLocked, lockInput, unlockInput } from '../../ui/input-lock';
import { promptCode, promptName } from '../../ui/mp-overlay';
import { normalizeLobbyCode } from '../../net/lobby-code';
import { sanitizeName } from '../../net/protocol';
import { openWiki } from '../../wiki/view';
import { BODY_FONT, DISPLAY_FONT, menuStyle } from '../../ui/menu-style';
import { menuFontsReady, whenMenuFontsReady } from '../../ui/menu-fonts';
import { EL, elButton, elDiamond, elGlow, elLink, elText, elBody } from '../elegant-ui';
import { ENDLESS_SCENE } from '../endless-session';
import { MAIN_ITEMS, backTarget, backdropFor, campaignButtons, initialView, moveSelection, type MenuItemKey, type MenuView } from '../main-menu-flow';

export interface MainMenuData {
  /** 'load': Load Game penceresi açık başlar (yenilgi sonrası "Load Game"); 'new': New Campaign penceresi. İkisi de Play kartlarının üstünde açılır. */
  open?: 'load' | 'new';
  /** Doğrudan bir görünümle aç (debug menüsü). */
  view?: MenuView;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const dateText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// --- Yerleşim (1920x1080) ---
const COL_X = MENU_COL_X; // sol sütunun yazı başlangıcı (ayarlar ekranı DOM sütunu da aynı: src/ui/viewport.ts)
const COL_W = 560; // ana menü yazı satırlarının genişliği
const PANEL_W = 760; // Settings / Multiplayer satırlarının genişliği (sağda değer/denetim)
const SHADE_W = 980; // soldan sağa açılan gölge
/**
 * Görünüm stili (src/ui/menu-style.ts): 'classic' bugünkü menü; 'elegant' ilk taslağın zarif stili (?menu=new önizleme). Onaylanınca
 * yalnızca DEFAULT_MENU_STYLE değişir; aşağıdaki ölçüler aynı kalır (önizleme = onaylanan görünüm).
 */
const ELEGANT = menuStyle === 'elegant';
const LOOK = ELEGANT
  ? {
      rowH: 92, // ince satırlar (dokunma alanı satırın tamamı)
      itemY0: 486,
      mainSize: 30, // Cinzel 600, büyük harf, harf aralığı 0,05em
      panelSize: 28,
      panelY0: 470,
      titleY: 350,
      titleSize: 52,
      valueSize: 26,
      stepSize: 34,
      backSize: 30,
      cardTitle: 40,
      cardLine: 26,
    }
  : { rowH: 112, itemY0: 486, mainSize: 50, panelSize: 38, panelY0: 470, titleY: 330, titleSize: 66, valueSize: 32, stepSize: 40, backSize: 36, cardTitle: 50, cardLine: 24 };
const ROW_H = LOOK.rowH; // satır aralığı = dokunma alanı yüksekliği (telefonda ~40-44 gerçek px)
const ITEM_Y0 = LOOK.itemY0;
/** Zarif stilde satır yazısının iç boşluğu (parıltı gölgesi kesilmesin); yazı x'i bu kadar sola alınır. */
const TPAD = ELEGANT ? 18 : 0;
const SHADOW_DARK = 'rgba(12,8,5,0.95)';
/** Quick Battle kartındaki Endless mode anahtarı (localStorage). */
const ENDLESS_TOGGLE_KEY = 'proto.qbEndless';
const SHADOW_GLOW = 'rgba(240,140,40,0.85)';
const CARD_W = 460;
const CARD_H = 640;
const CARD_GAP = 46;
const CARD_CY = 572;
const EMBER = 0xe0702a;
const TXT = '#d9c8a2';
const TXT_ON = '#f3d999';
const PIVOT = { x: W * 0.62, y: H * 0.48 }; // haritanın yaklaştığı nokta (taslaktaki transform-origin)
const EASE_SLIDE = 'Cubic.easeInOut';

/** Canvas dokusu (bir kez üretilir). */
function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return key;
  draw(t.getContext());
  t.refresh();
  return key;
}

/** Bir sütun satırı (menü maddesi ya da ayar satırı): önünde kor rengi elmas, seçilince/üstüne gelince parıltı. */
interface Row {
  root: Phaser.GameObjects.Container;
  setOn(on: boolean): void;
  run: () => void;
  /** Sol/sağ tuşu (ses kaydırıcısı). */
  adjust?: (d: number) => void;
}

/**
 * Ana menü (Ömer 2026-10-08, taslak menu-flow.html (onaydan sonra silindi), animasyon 1 "March to the map"; saf kararlar `src/game/main-menu-flow.ts`):
 *  - Menü: arkada sefer haritası + soldan sağa açılan gölge; sol sütunda logo ve kutusuz yazı listesi Play · Settings · Codex (Multiplayer Play kartlarında, 2026-10-08)
 *    (seçili satırın önünde kor rengi elmas + hafif parıltı; fare, dokunma, klavye yukarı/aşağı/Enter). Açıklama yazısı yok.
 *  - Play: harita yaklaşır, menü sola kayar, üç kart (Campaign · Quick Battle · Multiplayer) aşağıdan yükselir; sol üstte '◂ Back' / Esc.
 *    Campaign kartı: Continue (kayıt varsa) · New (yuva -> mod + zorluk) · Load (yuva -> kayıtlar; kayıt yoksa pasif).
 *  - Settings / Multiplayer: menü sola çekilir, harita kararıp bulanıklaşır, aynı sütunda satırlar belirir. Lobi kurulunca MultiplayerScene.
 *  - Görünüm stili (2026-10-09): `LOOK` / `ELEGANT` (src/ui/menu-style.ts; ?menu=new önizleme). Elegant: Cinzel satırlar + EB Garamond alt yazılar,
 *    fontlar hazır olmadan çizilmez (create bekler ve sahneyi yeniden kurar), kartlar hover'da yükselir + görsel yakınlaşır. Akış iki stilde aynı.
 */
export class MainMenuScene extends Phaser.Scene {
  static readonly KEY = 'MainMenuScene';
  private modalLayer!: Phaser.GameObjects.Container;
  private modal: Modal | null = null;
  private modalBack: (() => void) | null = null;
  private openOnStart: MainMenuData['open'];
  private startView: MenuView = 'menu';

  private view: MenuView = 'menu';
  private cameFrom: MenuView | null = null;
  private busyUntil = 0;
  private bg: Phaser.GameObjects.Image | null = null;
  private bgBase = 1;
  /** Arka plan merkezinin taban konumu (yakınlaşmasız; geniş ekranda boşluk kalmayacak kadar kaydırılmış). */
  private bgCenter = { x: W / 2, y: H / 2 };
  private bgPlace: { cx: number; cy: number; w: number } | null = null;
  private placeFillers: ((img: Phaser.GameObjects.Image) => void) | null = null;
  private vignette!: Phaser.GameObjects.Image;
  /** Sol sütunun yatay kayması: geniş ekranda sütun ekranın sol kenarına doğru kayar (16:9'da 0). */
  private colX = 0;
  private look = { zoom: 1, dark: 0, blur: 0 };
  private darkRect!: Phaser.GameObjects.Rectangle;
  private bgBlur: Phaser.GameObjects.Image | null = null;
  private lookTween: Phaser.Tweens.Tween | null = null;

  private menuCol!: Phaser.GameObjects.Container;
  private menuRows: Row[] = [];
  private menuSel = 0;
  private panel: Phaser.GameObjects.Container | null = null;
  private panelRows: Row[] = [];
  private panelSel = 0;
  private back!: Phaser.GameObjects.Container;
  private cards: Array<{ c: Phaser.GameObjects.Container; focus: (on: boolean) => void; run: () => void }> = [];
  private cardSel = 0;
  private cleanups: Array<() => void> = [];
  private promptOpen = false;

  constructor() {
    super(MainMenuScene.KEY);
  }

  private initData: MainMenuData = {};

  init(data: MainMenuData): void {
    this.initData = data ?? {};
    this.openOnStart = data?.open;
    this.startView = initialView(data?.open, data?.view);
    this.modal = null;
    this.modalBack = null;
    this.view = 'menu';
    this.cameFrom = null;
    this.menuRows = [];
    this.panel = null;
    this.panelRows = [];
    this.cards = [];
    this.menuSel = 0;
    this.cardSel = 0;
    this.busyUntil = 0;
    this.bgBlur = null;
    this.bg = null;
    this.lookTween = null;
    this.cleanups = [];
    this.promptOpen = false;
  }

  preload(): void {
    preloadAssets(this);
    preloadCampaignArt(this);
    preloadLogo(this);
  }

  create(): void {
    // Zarif stil: Phaser yazıları çizildiği andaki fontla kalır; fontlar hazır değilse bekle ve sahneyi yeniden kur (yedek fontla çizilmesin)
    if (ELEGANT && !menuFontsReady()) {
      this.cameras.main.setBackgroundColor('#0d0a07');
      void whenMenuFontsReady().then(() => {
        if (this.sys.isActive()) this.scene.restart(this.initData);
      });
      return;
    }
    migrateSaves(storage()); // eski tek-liste kayıtlar Slot 1'e taşınır
    if (mp.active) mp.leave(); // ana menüye dönmek multiplayer lobisinden ayrılmaktır
    this.buildMenuColumn();
    this.buildCards();
    this.buildBack();
    this.buildBackground(); // geniş ekran yerleşimi sütunu ve Back'i de konumlar (onStageResize)
    this.modalLayer = this.add.container(0, 0).setDepth(1000);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    // Lobi kurulmaya başlayınca (Host / Join) mevcut multiplayer ekranı devralır
    const offMp = mp.onChange(() => {
      if (this.scene.isActive() && (mp.state !== 'idle' || mp.active)) this.scene.start(MP_SCENE);
    });
    this.cleanups.push(offMp);
    this.events.once('shutdown', () => {
      for (const fn of this.cleanups) fn();
      this.cleanups = [];
      if (this.promptOpen) unlockInput('main-menu-prompt');
    });

    // Doğrudan açılış (debug görünümü ya da yenilgi sonrası Load Game): animasyonsuz
    if (this.startView !== 'menu') this.setView(this.startView, true);
    if (this.openOnStart === 'load' && slotSummaries(storage()).some((x) => x && x.saveCount > 0)) this.loadSlots();
    if (this.openOnStart === 'new') this.chooseSlot();
  }

  // ------------------------------------------------------------ arka plan

  private buildBackground(): void {
    this.cameras.main.setBackgroundColor('#0d0a07');
    // Geniş (21:9) harita görseli varsa o (eski 16:9 haritanın bölgesi eski yerine oturur; geniş ekranda yanları görünür), yoksa 16:9 görsel
    const art = mapArt(this, getMap('valdoria'));
    if (art) {
      this.bg = this.add.image(W / 2, H / 2, art.key).setDepth(0);
      // Eski kural: 16:9 harita ekranı %4 taşarak kaplar. Aynı dikdörtgen geniş görselin bölgesine uygulanır.
      const [x0, y0, x1, y1] = art.region;
      const rw = (x1 - x0) * this.bg.width;
      const rh = (y1 - y0) * this.bg.height;
      const k = Math.max(W / rw, H / rh) * 1.04; // taslaktaki -%4 taşma
      const p = placeArt(this.bg.width, this.bg.height, art.region, { x: W / 2 - (rw * k) / 2, y: H / 2 - (rh * k) / 2, w: rw * k, h: rh * k });
      this.bgBase = p.scale;
      this.bgPlace = { cx: (p.left + p.right) / 2, cy: (p.top + p.bottom) / 2, w: p.right - p.left };
      this.placeFillers = edgeFillers(this, art.key, 0).place;
      this.bg.setScale(this.bgBase);
      // Bulanıklık: önceden bulanıklaştırılmış kopya üstte, saydamlığı 'blur' ile (WebGL preFX büyük görselde kayık/kırpık çiziyordu)
      this.bgBlur = this.add.image(W / 2, H / 2, blurredTexture(this, art.key, 6)).setDepth(0).setAlpha(0);
    }
    const vign = canvasTex(this, 'mm-vign', 480, 270, (ctx) => {
      const g = ctx.createRadialGradient(288, 135, 0, 288, 135, 300);
      g.addColorStop(0, 'rgba(20,14,8,0.25)');
      g.addColorStop(1, 'rgba(8,6,4,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 480, 270);
    });
    this.vignette = this.add.image(W / 2, H / 2, vign).setDisplaySize(W, H).setDepth(1);
    this.darkRect = this.add.rectangle(FULL_X0, 0, FULL_W, H, 0x000000, 0).setOrigin(0, 0).setDepth(2);
    onStageResize(this, () => this.layoutStage());
  }

  /** Geniş ekran yerleşimi (sahne kurulunca ve ekran boyutu değişince): arka plan kayması, vinyet, sol sütun ve Back konumu. */
  private layoutStage(): void {
    const { left, right, viewW } = stageView;
    if (this.bgPlace) {
      const half = this.bgPlace.w / 2;
      const dx = coverShift({ left: this.bgPlace.cx - half, right: this.bgPlace.cx + half }, left, right);
      this.bgCenter = { x: this.bgPlace.cx + dx, y: this.bgPlace.cy };
    }
    this.vignette.setDisplaySize(viewW, H);
    this.colX = menuColumnShift(left); // sütun ekranın soluna yaklaşır ama kenara yapışmaz (16:9'da 0)
    if (!this.tweens.isTweening(this.menuCol)) this.menuCol.setX(this.view === 'menu' ? this.colX : this.hiddenColX());
    if (this.panel && !this.tweens.isTweening(this.panel)) this.panel.setX(this.colX);
    this.back.setX(left + 48);
    this.applyLook();
  }

  /** Gizli sütun konumu: gölgesiyle birlikte görünen alanın solunda. */
  private hiddenColX(): number {
    return stageView.left - (SHADE_W + 40);
  }

  private applyLook(): void {
    const { zoom, dark, blur } = this.look;
    if (this.bg) {
      this.bg.setScale(this.bgBase * zoom);
      this.bg.setPosition(PIVOT.x + (this.bgCenter.x - PIVOT.x) * zoom, PIVOT.y + (this.bgCenter.y - PIVOT.y) * zoom);
      this.placeFillers?.(this.bg);
      this.bgBlur?.setPosition(this.bg.x, this.bg.y).setDisplaySize(this.bg.displayWidth, this.bg.displayHeight).setAlpha(blur);
    }
    this.darkRect.setFillStyle(0x000000, dark);
  }

  private tweenLook(view: MenuView, instant: boolean): void {
    const to = backdropFor(view);
    this.lookTween?.stop();
    if (instant) {
      this.look = { ...to };
      this.applyLook();
      return;
    }
    const from = { ...this.look };
    this.lookTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        this.look = { zoom: from.zoom + (to.zoom - from.zoom) * k, dark: from.dark + (to.dark - from.dark) * k, blur: from.blur + (to.blur - from.blur) * k };
        this.applyLook();
      },
    });
  }

  // ------------------------------------------------------------ sol sütun: ana menü

  /** Sütunun arkasındaki gölge: solda koyu, sağa doğru açılır (sütunla birlikte kayar). */
  private columnShade(): Phaser.GameObjects.Graphics {
    // Köşe renkli dolgu (doku değil): eski 256 px doku gölgenin bittiği yerde ince koyu bir çizgi bırakıyordu
    const g = this.add.graphics();
    const c = 0x080604;
    const mid = Math.round(SHADE_W * 0.7);
    g.fillGradientStyle(c, c, c, c, 0.85, 0.55, 0.85, 0.55).fillRect(0, 0, mid, H);
    g.fillGradientStyle(c, c, c, c, 0.55, 0, 0.55, 0).fillRect(mid, 0, SHADE_W - mid, H);
    return g;
  }

  /** Gölgenin sola uzantısı (geniş ekranda sütun sağa kayınca sol kenara kadar aynı koyuluk; 16:9'da ekran dışı). */
  private shadeExtension(): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(-800, 0, 800, H, 0x080604, 0.85).setOrigin(0, 0);
  }

  // ------------------------------------------------------------ yazı stilleri (classic / elegant)

  /** Satır yazısı (menü maddesi, ayar satırı): classic kalın serif + kontur; elegant Cinzel 600, büyük harf, 0,05em, koyu gölge (seçilince kor parıltısı). */
  private rowText(x: number, y: number, label: string, size: number, color: string): Phaser.GameObjects.Text {
    if (!ELEGANT) return serif(this, x, y, label, size, color, { spacing: 2, stroke: 3 });
    return serif(this, x - TPAD, y, label.toUpperCase(), size, color, { font: DISPLAY_FONT, weight: '600', spacing: size * 0.05, stroke: 0 })
      .setPadding(TPAD, TPAD, TPAD, TPAD)
      .setShadow(0, 2, SHADOW_DARK, 4, false, true);
  }

  /** Sağdaki değer yazısı (ses, Enter/Exit, ad, Host/Join). Elegant: Cinzel 600 (küçük harfler Cinzel'de küçük büyük harftir). */
  private valueText(x: number, y: number, text: string, color: string, size = LOOK.valueSize): Phaser.GameObjects.Text {
    if (!ELEGANT) return serif(this, x, y, text, size, color, { stroke: 3 });
    return serif(this, x, y, text, size, color, { font: DISPLAY_FONT, weight: '600', spacing: size * 0.05, stroke: 0 }).setShadow(0, 2, SHADOW_DARK, 4, false, true);
  }

  /** Açıklama / alt yazı: classic ince serif; elegant EB Garamond. */
  private noteText(x: number, y: number, text: string, size: number, color: string): Phaser.GameObjects.Text {
    if (!ELEGANT) return serif(this, x, y, text, size, color, { bold: false, stroke: 2 });
    return serif(this, x, y, text, size + 2, color, { font: BODY_FONT, weight: 'normal', stroke: 0 }).setShadow(0, 1, SHADOW_DARK, 3, false, true);
  }

  /** Altın başlık (Settings / Multiplayer sütunu, kart başlıkları). */
  private titleText(x: number, y: number, text: string, size: number, spacing: number, weight = '600'): Phaser.GameObjects.Text {
    if (!ELEGANT) return goldText(this, x, y, text, size, spacing);
    return goldText(this, x, y, text.toUpperCase(), size, size * 0.05, { font: DISPLAY_FONT, weight, stroke: Math.max(2, Math.round(size / 16)) });
  }

  /** Kutusuz yazı satırı: elmas + yazı (+ isteğe bağlı sağ taraf) + ince ayırıcı çizgi. Dokunma alanı satırın tamamı. */
  private makeRow(y: number, label: string, size: number, run: () => void, o: { right?: Phaser.GameObjects.GameObject[]; enabled?: boolean; onHover?: () => void; width?: number } = {}): Row {
    const rw = o.width ?? COL_W;
    const enabled = o.enabled !== false;
    const root = this.add.container(COL_X, y);
    const glow = this.add.image(0, 0, ensureGlow(this)).setTint(0xf08c28).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const text = this.rowText(34, 0, label, size, enabled ? TXT : '#7d705a').setOrigin(0, 0.5);
    glow.setDisplaySize(text.width * 1.5 + 80, size * 2.2).setPosition(text.x + text.width / 2, 0);
    const diamond = this.add.graphics();
    const line = this.add.graphics();
    line.lineStyle(1, 0xd9b26a, 0.16).lineBetween(0, ROW_H / 2 - 2, rw, ROW_H / 2 - 2);
    const zone = this.add.zone(rw / 2 - 20, 0, rw + 40, ROW_H).setInteractive({ useHandCursor: enabled });
    root.add([glow, line, diamond, text, ...(o.right ?? []), zone]);
    // Sağ taraftaki etkileşimli parçalar (kaydırıcı, düğme) satırın dokunma alanının üstünde kalsın
    if (o.right) for (const r of o.right) root.bringToTop(r);
    let isOn: boolean | null = null;
    const setOn = (v: boolean): void => {
      diamond.clear();
      if (v) {
        diamond.fillStyle(EMBER, 1).fillPoints([{ x: 10, y: -8 }, { x: 18, y: 0 }, { x: 10, y: 8 }, { x: 2, y: 0 }], true);
        diamond.lineStyle(2, 0xffb35a, 0.9).strokePoints([{ x: 10, y: -8 }, { x: 18, y: 0 }, { x: 10, y: 8 }, { x: 2, y: 0 }], true);
      }
      text.setColor(!enabled ? '#7d705a' : v ? TXT_ON : TXT);
      this.tweens.killTweensOf(glow);
      this.tweens.add({ targets: glow, alpha: v && enabled ? 0.22 : 0, duration: 150 });
      if (!ELEGANT) {
        text.x = v ? 44 : 34;
        glow.x = text.x + text.width / 2;
        return;
      }
      // Elegant: seçili satır hafif sağa kayar (taslaktaki padding-left geçişi) + kor parıltısı (yazı gölgesi)
      if (isOn !== v) text.setShadow(0, v && enabled ? 0 : 2, v && enabled ? SHADOW_GLOW : SHADOW_DARK, v && enabled ? 14 : 4, false, true);
      const first = isOn === null;
      isOn = v;
      const to = (v ? 46 : 34) - TPAD;
      this.tweens.killTweensOf(text);
      if (first) text.x = to;
      else this.tweens.add({ targets: text, x: to, duration: 180, ease: 'Cubic.easeOut', onUpdate: () => (glow.x = text.x + text.width / 2) });
      glow.x = text.x + text.width / 2;
    };
    setOn(false);
    zone.on('pointerover', () => o.onHover?.());
    zone.on('pointerup', () => {
      if (!this.ready() || !enabled) return;
      run();
    });
    return { root, setOn, run: () => enabled && run() };
  }

  private buildMenuColumn(): void {
    const col = (this.menuCol = this.add.container(0, 0).setDepth(20));
    col.add([this.shadeExtension(), this.columnShade()]);
    if (hasLogo(this)) col.add(addLogo(this, COL_X + 300, 290, 600, 210)); // assets/branding/logo.png
    else col.add(fitText(this.titleText(COL_X + 300, 290, 'EMBERS OF VALDORIA', 64, 4).setOrigin(0.5), 600));
    MAIN_ITEMS.forEach((it, i) => {
      const row = this.makeRow(ITEM_Y0 + i * ROW_H, it.label, LOOK.mainSize, () => this.pickMain(it.key), { onHover: () => this.selectMain(i) });
      col.add(row.root);
      this.menuRows.push(row);
    });
    if (readSaves(storage()).corrupt) col.add(this.noteText(COL_X, H - 60, 'A damaged save file was ignored.', 22, '#d88a7e').setOrigin(0, 0.5));
    this.selectMain(0);
  }

  private selectMain(i: number): void {
    this.menuSel = i;
    this.menuRows.forEach((r, k) => r.setOn(k === i));
  }

  private pickMain(key: MenuItemKey): void {
    if (this.view !== 'menu') return;
    if (key === 'play') this.setView('play');
    else if (key === 'settings') this.setView('settings');
    else if (key === 'mp') this.setView('mp');
    else openWiki(); // Codex = wiki (sağ üstteki kitap simgesiyle aynı pencere)
  }

  // ------------------------------------------------------------ görünüm geçişleri

  /** Kısa geçiş kilidi (çift dokunma / geçiş sırasında tıklama yeni geçiş başlatmasın). */
  private ready(): boolean {
    return this.time.now >= this.busyUntil && !this.modal && !isInputLocked();
  }

  private setView(next: MenuView, instant = false): void {
    const prev = this.view;
    if (prev === next && !instant) return;
    if (next !== 'menu' && next !== 'play') this.cameFrom = prev;
    this.view = next;
    this.busyUntil = this.time.now + (instant ? 0 : 450);
    this.tweenLook(next, instant);
    this.slideMenu(next === 'menu', instant);
    this.showCards(next === 'play', instant);
    this.showPanel(next === 'settings' || next === 'mp' ? next : null, instant);
    this.showBack(next !== 'menu', instant);
    if (next === 'menu') this.selectMain(this.menuSel);
  }

  private goBack(): void {
    const to = backTarget(this.view, this.cameFrom);
    if (!to) return;
    if (to === 'menu') this.cameFrom = null;
    this.setView(to);
  }

  private slideMenu(shown: boolean, instant: boolean): void {
    this.tweens.killTweensOf(this.menuCol);
    const x = shown ? this.colX : this.hiddenColX();
    if (shown) this.menuCol.setVisible(true);
    if (instant) {
      this.menuCol.setPosition(x, 0).setAlpha(shown ? 1 : 0).setVisible(shown);
      return;
    }
    this.tweens.add({
      targets: this.menuCol,
      x,
      alpha: shown ? 1 : 0.4,
      duration: 700,
      delay: shown ? 150 : 0,
      ease: EASE_SLIDE,
      onComplete: () => this.menuCol.setVisible(shown),
    });
  }

  private showBack(shown: boolean, instant: boolean): void {
    this.tweens.killTweensOf(this.back);
    if (shown) this.back.setVisible(true);
    if (instant) {
      this.back.setAlpha(shown ? 1 : 0).setVisible(shown);
      return;
    }
    this.tweens.add({ targets: this.back, alpha: shown ? 1 : 0, duration: shown ? 400 : 200, delay: shown ? 500 : 0, onComplete: () => this.back.setVisible(shown) });
  }

  /** Sol üst "◂ Back  Esc" (tasarım kiti: src/game/elegant-ui.ts > elLink; geri / menu kuralı CLAUDE.md). */
  private buildBack(): void {
    const l = elLink(this, '◂ Back', () => this.ready() && this.goBack(), { small: 'Esc' });
    this.back = l.root.setPosition(stageView.left + 48, 56).setDepth(40).setAlpha(0).setVisible(false);
  }

  /** Quick Battle kartının altındaki "Endless mode" anahtarı (açıkken kart Endless'ı açar); seçim tarayıcıda saklanır. */
  private endlessOn(): boolean {
    try {
      return window.localStorage?.getItem(ENDLESS_TOGGLE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private setEndlessOn(on: boolean): void {
    try {
      window.localStorage?.setItem(ENDLESS_TOGGLE_KEY, on ? '1' : '0');
    } catch {
      /* depolama yok: yalnızca bu oturum */
    }
  }

  /** Kit dilinde açma / kapama satırı: elmas (açık = kor, kapalı = içi boş) + yazı + italik durum. Kök (0, 0) = satırın ortası. */
  private makeToggle(label: string, get: () => boolean, set: (on: boolean) => void, onChange: () => void): Phaser.GameObjects.Container {
    const root = this.add.container(0, 0);
    const on = elDiamond(this, 7);
    const off = elDiamond(this, 7, true);
    const text = elText(this, 0, 0, label, 20, EL.TXT, { em: 0.08, pad: true }).setOrigin(0, 0.5);
    const state = elBody(this, 0, 1, '', 19, EL.MUTED).setOrigin(0, 0.5);
    const zone = this.add.zone(0, 0, 10, EL.HIT).setInteractive({ useHandCursor: true });
    root.add([on, off, text, state, zone]);
    const draw = (hover: boolean) => {
      const v = get();
      on.setVisible(v);
      off.setVisible(!v);
      state.setText(v ? 'on' : 'off').setColor(v ? EL.ON : EL.MUTED);
      text.setColor(hover || v ? EL.ON : EL.TXT);
      elGlow(text, hover);
      const tw = text.width - EL.PAD * 2;
      const total = 14 + 14 + tw + 12 + state.width;
      const x0 = -total / 2;
      on.setPosition(x0 + 7, 0);
      off.setPosition(x0 + 7, 0);
      text.setX(x0 + 28 - EL.PAD);
      state.setX(x0 + 28 + tw + 12);
      zone.setSize(total + 40, EL.HIT);
    };
    draw(false);
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerup', () => {
      if (!this.ready()) return;
      set(!get());
      draw(true);
      onChange();
    });
    return root;
  }

  // ------------------------------------------------------------ Play: üç kart

  private buildCards(): void {
    const latest = latestSave(storage());
    const anySaves = slotSummaries(storage()).some((x) => x && x.saveCount > 0);
    const campaignArt = hasCampaignArt(this, 'valdoria-bg') ? campaignArtKey('valdoria-bg') : null;
    // Kart görselleri (Ömer 2026-10-08): Quick Battle = Proving Grounds (öğleden sonra), Multiplayer = Duelling Ring (ay ışığı); yoksa eskileri
    const art = (id: string) => (hasBackground(this, id) ? backgroundKey(id) : null);
    const camp = campaignButtons(!!latest, anySaves);
    const runCamp = (id: 'continue' | 'new' | 'load') => (id === 'continue' && latest ? this.loadSave(latest) : id === 'new' ? this.chooseSlot() : this.loadSlots());
    const focusOf = (key: string | null): readonly [number, number] | null => {
      const id = key?.startsWith('bg:') ? key.slice(3) : null;
      return (id && (layout.backgrounds.cardFocus as unknown as Record<string, [number, number]>)[id]) || null;
    };
    const specs: Array<{ name: string; art: string | null; line?: string; endless?: boolean; buttons?: typeof camp; run: () => void }> = [
      { name: 'Campaign', art: campaignArt, buttons: camp, run: () => runCamp(camp[0]!.id) },
      { name: 'Quick Battle', art: art('proving-grounds-sunny-afternoon') ?? art('castle-hall'), line: 'Pick two teams', endless: true, run: () => (this.endlessOn() ? this.scene.start(ENDLESS_SCENE) : this.scene.start('TeamSelectScene')) },
      { name: 'Multiplayer', art: art('duelling-ring-moon') ?? art('kings-bridge'), line: 'Fight a friend online', run: () => this.setView('mp') },
    ];
    specs.forEach((s, i) => {
      const cx = W / 2 + (i - 1) * (CARD_W + CARD_GAP);
      const outer = this.add.container(cx, CARD_CY).setDepth(30).setAlpha(0).setVisible(false);
      // Elegant: kart içeriği iç kapta (hover'da hafif yükselir); classic'te doğrudan dış kap
      const c = ELEGANT ? this.add.container(0, 0) : outer;
      if (ELEGANT) outer.add(c);
      const hw = CARD_W / 2;
      const hh = CARD_H / 2;
      const base = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x241a11, 1);
      c.add(base);
      /** Görsel yakınlaşması (elegant hover): kırpma bölgesi merkezde daralır, ölçek aynı oranda büyür (kart dışına taşmaz). */
      let zoomImg: ((k: number) => void) | null = null;
      if (s.art) {
        const img = this.add.image(0, 0, s.art).setAlpha(0.6);
        // Odak noktası (veri: battle-layout.json > backgrounds.cardFocus) kartın tam ortasında; kart boşluksuz dolar
        const fc = focusCrop(img.width, img.height, CARD_W, CARD_H, focusOf(s.art));
        img.setCrop(fc.cropX, fc.cropY, fc.cropW, fc.cropH).setScale(fc.scale);
        img.setOrigin((fc.cropX + fc.cropW / 2) / img.width, (fc.cropY + fc.cropH / 2) / img.height);
        c.add(img);
        zoomImg = (k) => {
          const w = fc.cropW / k;
          const h = fc.cropH / k;
          img.setCrop(fc.cropX + (fc.cropW - w) / 2, fc.cropY + (fc.cropH - h) / 2, w, h).setScale(fc.scale * k);
        };
      }
      const shadeKey = canvasTex(this, 'mm-cardshade', 4, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.3, 'rgba(10,7,4,0)');
        g.addColorStop(1, 'rgba(10,7,4,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 256);
      });
      c.add(this.add.image(0, 0, shadeKey).setDisplaySize(CARD_W, CARD_H));
      const glow = this.add.image(0, 0, ensureGlow(this)).setTint(0xf0a040).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDisplaySize(CARD_W * 1.5, CARD_H * 1.3);
      c.addAt(glow, 0);
      const frame = this.add.graphics();
      const drawFrame = (on: boolean) => {
        frame.clear();
        if (ELEGANT) {
          // Tasarım kiti: 1 px ince altın çerçeve (odakta açık altın) + içte ince koyu çizgi
          frame.lineStyle(1, 0x1b120a, 0.9).strokeRect(-hw + 2.5, -hh + 2.5, CARD_W - 5, CARD_H - 5);
          frame.lineStyle(1, on ? EL.ON_N : EL.GOLD, on ? 1 : EL.LINE.a3).strokeRect(-hw + 0.5, -hh + 0.5, CARD_W - 1, CARD_H - 1);
          return;
        }
        frame.lineStyle(4, 0x1b120a, 1).strokeRect(-hw + 4, -hh + 4, CARD_W - 8, CARD_H - 8);
        frame.lineStyle(on ? 4 : 2, on ? GOLD.bright : 0xd9b26a, 1).strokeRect(-hw, -hh, CARD_W, CARD_H);
      };
      drawFrame(false);
      c.add(frame);
      c.add(this.titleText(0, hh - (s.buttons ? 130 : 112), s.name, LOOK.cardTitle, 2, '700').setOrigin(0.5));
      const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: !s.buttons });
      c.add(zone);
      let lineText: Phaser.GameObjects.Text | null = null;
      if (s.line) c.add((lineText = (ELEGANT ? this.noteText(0, hh - 52, s.line, LOOK.cardLine - 2, '#cdb88d') : serif(this, 0, hh - 50, s.line, 24, '#cdb88d', { bold: false, stroke: 3 })).setOrigin(0.5)));
      if (s.endless) {
        // Endless mode anahtarı (kartın altında; açıkken kart Endless dalga koşusunu açar: src/game/endless-session.ts)
        const lineFor = () => (this.endlessOn() ? 'Endless waves - how far can you go?' : s.line!);
        lineText?.setText(lineFor());
        const tg = this.makeToggle('Endless mode', () => this.endlessOn(), (v) => this.setEndlessOn(v), () => lineText?.setText(lineFor()));
        tg.setY(hh + 46);
        outer.add(tg);
      }
      if (s.buttons) {
        const gap = 22; // kit düğmelerinin yan elmasları birbirine değmesin
        const widths = s.buttons.map((b) => (b.id === 'continue' ? 168 : s.buttons!.length > 2 ? 112 : 160));
        let bx = -(widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
        s.buttons.forEach((b, k) => {
          const bw = widths[k]!;
          // Tasarım kiti düğmesi (primary = Continue / ilk eylem, diğerleri secondary); pasif düğme soluk, dokununca sallanır
          const btn = elButton(this, b.label, () => {
            if (!this.ready()) return;
            if (!b.enabled) return btn.shake();
            runCamp(b.id);
          }, { kind: b.primary ? 'primary' : 'secondary', w: bw - 8, h: b.primary ? 60 : 52, size: b.primary ? 20 : 17, ready: b.enabled });
          btn.root.setPosition(bx + bw / 2, hh - 58);
          bx += bw + gap;
          c.add(btn.root);
        });
      }
      const look = { lift: 0, zoom: 1 };
      let lookTw: Phaser.Tweens.Tween | null = null;
      const focus = (on: boolean) => {
        drawFrame(on);
        this.tweens.killTweensOf(glow);
        this.tweens.add({ targets: glow, alpha: on ? 0.12 : 0, duration: 160 });
        if (!ELEGANT) return;
        // Elegant: odaklanan kart hafif yükselir, görseli hafif yakınlaşır
        lookTw?.stop();
        const from = { ...look };
        const to = { lift: on ? -10 : 0, zoom: on ? 1.04 : 1 };
        lookTw = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 260,
          ease: 'Cubic.easeOut',
          onUpdate: (tw) => {
            if (!c.active) return void tw.stop(); // kartlar yenilendi (kayıt silindi)
            const t = tw.getValue() ?? 1;
            look.lift = from.lift + (to.lift - from.lift) * t;
            look.zoom = from.zoom + (to.zoom - from.zoom) * t;
            c.y = look.lift;
            zoomImg?.(look.zoom);
          },
        });
      };
      zone.on('pointerover', () => this.focusCard(i));
      if (!s.buttons) zone.on('pointerup', () => this.ready() && s.run());
      this.cards.push({ c: outer, focus, run: s.run });
    });
  }

  private focusCard(i: number): void {
    this.cardSel = i;
    this.cards.forEach((k, j) => k.focus(j === i));
  }

  private showCards(shown: boolean, instant: boolean): void {
    this.cards.forEach(({ c }, i) => {
      this.tweens.killTweensOf(c);
      if (shown) c.setVisible(true);
      if (instant) {
        c.setPosition(c.x, CARD_CY).setScale(1).setAlpha(shown ? 1 : 0).setVisible(shown);
        return;
      }
      if (shown) {
        c.setPosition(c.x, CARD_CY + 60).setScale(0.96).setAlpha(0);
        this.tweens.add({ targets: c, y: CARD_CY, scale: 1, alpha: 1, duration: 650, delay: 350 + i * 140, ease: 'Cubic.easeOut' });
      } else if (c.visible) {
        this.tweens.add({ targets: c, y: CARD_CY + 60, scale: 0.96, alpha: 0, duration: 320, delay: (this.cards.length - 1 - i) * 70, ease: 'Cubic.easeIn', onComplete: () => c.setVisible(false) });
      }
    });
    if (shown) this.focusCard(this.cardSel);
  }

  // ------------------------------------------------------------ Settings / Multiplayer sütunu

  private showPanel(kind: 'settings' | 'mp' | null, instant: boolean): void {
    const old = this.panel;
    this.panel = null;
    this.panelRows = [];
    if (old) {
      this.tweens.killTweensOf(old);
      if (instant) old.destroy(true);
      else this.tweens.add({ targets: old, alpha: 0, x: old.x - 30, duration: 220, onComplete: () => old.destroy(true) });
    }
    if (!kind) return;
    const p = (this.panel = this.add.container(this.colX, 0).setDepth(25));
    p.add([this.shadeExtension(), this.columnShade()]);
    p.add(this.titleText(COL_X, LOOK.titleY, kind === 'settings' ? 'Settings' : 'Multiplayer', LOOK.titleSize, 3).setOrigin(0, 0.5));
    if (kind === 'settings') this.buildSettings(p);
    else this.buildMultiplayer(p);
    this.panelSel = 0;
    this.selectPanel(0);
    if (instant) return;
    p.setAlpha(0).setX(this.colX - 30);
    this.tweens.add({ targets: p, alpha: 1, x: this.colX, duration: 450, delay: 250, ease: 'Cubic.easeOut' });
  }

  private selectPanel(i: number): void {
    this.panelSel = i;
    this.panelRows.forEach((r, k) => r.setOn(k === i));
  }

  private addPanelRow(p: Phaser.GameObjects.Container, label: string, run: () => void, o: { right?: Phaser.GameObjects.GameObject[]; enabled?: boolean; adjust?: (d: number) => void } = {}): Row {
    const i = this.panelRows.length;
    const row = this.makeRow(LOOK.panelY0 + i * ROW_H, label, LOOK.panelSize, run, { ...o, width: PANEL_W, onHover: () => this.selectPanel(i) });
    row.adjust = o.adjust;
    p.add(row.root);
    this.panelRows.push(row);
    return row;
  }

  /** Ayarlar: mevcut ayar ekranındakilerin aynısı (ses seviyesi 0-10, tam ekran); değer aynı yerde saklanır. */
  private buildSettings(p: Phaser.GameObjects.Container): void {
    // --- Sound volume: − [kaydırıcı] + değer ---
    let level = loadVolume();
    const trackX = 440;
    const trackW = 200;
    const g = this.add.graphics();
    const value = this.valueText(PANEL_W - 6, 0, String(level), TXT_ON).setOrigin(1, 0.5);
    const draw = () => {
      g.clear();
      g.fillStyle(0x120c07, 0.9).fillRect(trackX, -5, trackW, 10);
      g.fillStyle(0xd9b26a, 1).fillRect(trackX, -5, (trackW * level) / 10, 10);
      g.lineStyle(1, GOLD.edge, 1).strokeRect(trackX - 0.5, -5.5, trackW + 1, 11);
      g.fillStyle(0xf3d999, 1).fillCircle(trackX + (trackW * level) / 10, 0, 13);
      g.lineStyle(2, 0x5a3a10, 1).strokeCircle(trackX + (trackW * level) / 10, 0, 13);
      value.setText(String(level));
    };
    const set = (v: number, preview: boolean) => {
      const n = Math.min(10, Math.max(0, Math.round(v)));
      if (n === level && !preview) return;
      level = n;
      setSettingsVolume(n, preview);
      draw();
    };
    const step = (label: string, x: number, d: number) => {
      const t = this.valueText(x, 0, label, TXT_ON, LOOK.stepSize).setOrigin(0.5);
      const z = this.add.zone(x, 0, 64, ROW_H - 8).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => set(level + d, true));
      return [t, z];
    };
    const track = this.add.zone(trackX + trackW / 2, 0, trackW + 40, ROW_H - 8).setInteractive({ useHandCursor: true });
    const fromPointer = (ptr: Phaser.Input.Pointer) => {
      const root = track.parentContainer;
      const lx = worldXY(this, ptr).x - (root?.x ?? 0) - (root?.parentContainer?.x ?? 0) - trackX;
      set((lx / trackW) * 10, false);
    };
    let dragging = false;
    track.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      dragging = true;
      fromPointer(ptr);
    });
    track.on('pointermove', (ptr: Phaser.Input.Pointer) => dragging && ptr.isDown && fromPointer(ptr));
    const stopDrag = () => {
      if (dragging) setSettingsVolume(level, true); // bırakınca deneme sesi
      dragging = false;
    };
    track.on('pointerup', stopDrag);
    track.on('pointerout', stopDrag);
    draw();
    this.addPanelRow(p, 'Sound volume', () => undefined, { right: [g, ...step('−', trackX - 46, -1), track, ...step('+', trackX + trackW + 42, 1), value], adjust: (d) => set(level + d, true) });

    // --- Fullscreen (API yoksa satır yok; iPhone'da ipucu) ---
    const support = currentSupport();
    if (support !== 'none' && !isStandalone()) {
      const state = this.valueText(PANEL_W - 6, 0, 'Enter', TXT_ON).setOrigin(1, 0.5);
      const note = this.noteText(COL_X, LOOK.panelY0 + 2 * ROW_H - 10, '', 22, '#cdb88d').setOrigin(0, 0.5);
      p.add(note);
      this.cleanups.push(onFullscreenChange((on) => state.active && state.setText(on ? 'Exit' : 'Enter')));
      this.addPanelRow(p, 'Fullscreen', () => {
        if (support === 'ios') note.setText(IOS_HINT);
        else void toggleFullscreen();
      }, { right: [state] });
    }
  }

  /** Multiplayer: mevcut lobi akışının ilk adımı (ad, Host, kodla Join). Lobi kurulmaya başlayınca MultiplayerScene devralır. */
  private buildMultiplayer(p: Phaser.GameObjects.Container): void {
    const ok = !!mp.serverUrl();
    const name = this.valueText(PANEL_W - 6, 0, mp.names().local, TXT_ON).setOrigin(1, 0.5);
    fitText(name, 260);
    this.addPanelRow(p, 'Your name', () => void this.askName(name), { right: [name] });
    this.addPanelRow(p, 'Host a lobby', () => mp.host(), { enabled: ok, right: [this.valueText(PANEL_W - 6, 0, 'Host', ok ? TXT_ON : '#7d705a').setOrigin(1, 0.5)] });
    this.addPanelRow(p, 'Join with code', () => void this.askCode(), { enabled: ok, right: [this.valueText(PANEL_W - 6, 0, 'Join', ok ? TXT_ON : '#7d705a').setOrigin(1, 0.5)] });
    if (!ok) {
      p.add(this.valueText(COL_X, LOOK.panelY0 + 3 * ROW_H, 'Server not configured', '#e08a7a', ELEGANT ? 26 : 30).setOrigin(0, 0.5));
      p.add(this.noteText(COL_X, LOOK.panelY0 + 3 * ROW_H + 44, 'The multiplayer server address has not been set up yet.', 20, '#a8977a').setOrigin(0, 0.5));
    }
  }

  /** DOM giriş kutusu açıkken sahne tıklama/tuş almaz. */
  private async withPrompt<T>(ask: () => Promise<T>): Promise<T> {
    this.promptOpen = true;
    lockInput('main-menu-prompt');
    try {
      return await ask();
    } finally {
      this.promptOpen = false;
      unlockInput('main-menu-prompt');
    }
  }

  private async askName(label: Phaser.GameObjects.Text): Promise<void> {
    const n = await this.withPrompt(() => promptName(mp.session?.localName ?? '', sanitizeName));
    if (n !== null && this.scene.isActive()) {
      mp.setName(n);
      if (label.active) fitText(label.setScale(1).setText(mp.names().local), 260);
    }
  }

  private async askCode(): Promise<void> {
    if (!mp.serverUrl()) return;
    const code = await this.withPrompt(() => promptCode(normalizeLobbyCode));
    if (code && this.scene.isActive()) mp.join(code);
  }

  // ------------------------------------------------------------ klavye

  private onKey(e: KeyboardEvent): void {
    if (isInputLocked() || this.promptOpen) return; // ayarlar ekranı, wiki, giriş kutusu açık
    const k = e.key;
    if (k === 'Escape') {
      if (this.modal) this.modalBack?.();
      else if (this.time.now >= this.busyUntil) this.goBack();
      return;
    }
    if (this.modal || this.time.now < this.busyUntil) return;
    const enter = k === 'Enter' || k === ' ';
    const up = k === 'ArrowUp' || k === 'w' || k === 'W';
    const down = k === 'ArrowDown' || k === 's' || k === 'S';
    const left = k === 'ArrowLeft' || k === 'a' || k === 'A';
    const right = k === 'ArrowRight' || k === 'd' || k === 'D';
    if (this.view === 'menu') {
      if (up || down) this.selectMain(moveSelection(this.menuSel, up ? -1 : 1, this.menuRows.length));
      else if (enter) this.pickMain(MAIN_ITEMS[this.menuSel]!.key);
    } else if (this.view === 'play') {
      if (left || right || up || down) this.focusCard(moveSelection(this.cardSel, left || up ? -1 : 1, this.cards.length));
      else if (enter) this.cards[this.cardSel]?.run();
    } else {
      const row = this.panelRows[this.panelSel];
      if (up || down) this.selectPanel(moveSelection(this.panelSel, up ? -1 : 1, this.panelRows.length));
      else if ((left || right) && row?.adjust) row.adjust(left ? -1 : 1);
      else if (enter) row?.run();
    }
  }

  // ------------------------------------------------------------ kayıt pencereleri (eski akış aynen)

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
    this.modalBack = null;
  }

  private openWindow(o: Parameters<typeof openModal>[2], back: () => void): Modal {
    this.modal = openModal(this, this.modalLayer, o);
    this.modalBack = back;
    return this.modal;
  }

  private loadSave(entry: SaveEntry): void {
    loadEntry(entry);
    this.scene.start(MAP_SCENE);
  }

  /** Yuva kartı: mod, zorluk, durak, takım avatarları + can, tarih, kayıt sayısı. Boşsa "Empty slot". */
  private slotCard(root: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, i: number, sum: SlotSummary | null, buttons: Array<{ label: string; run: () => void; primary?: boolean }>): void {
    root.add(makePanel(this, x, y, w, h, { top: 0x2a2017, bottom: 0x150e09, bevel: 3, ornaments: false, alpha: 0.95 }));
    root.add(serif(this, x + 24, y + 26, `SLOT ${i + 1}`, 22, '#f3d9a0', { spacing: 3 }));
    if (!sum) {
      root.add(serif(this, x + 24, y + 66, 'Empty slot', 26, '#a8977a', { bold: false }));
    } else {
      const diff = CONFIG.difficulties[sum.difficulty]?.name ?? sum.difficulty;
      root.add(serif(this, x + 150, y + 30, `${sum.mode === 'ironman' ? 'IRONMAN' : 'NORMAL'} · ${diff.toUpperCase()}`, 17, sum.mode === 'ironman' ? '#e08a7a' : '#9cc4ff', { spacing: 2 }));
      const l = sum.latest;
      root.add(serif(this, x + 24, y + 64, l ? `${l.summary.map} · Stop ${l.summary.stop}/${l.summary.stops} · ${l.summary.node}` : 'Journey started, not saved yet', 24, '#f3e4c4'));
      root.add(serif(this, x + 24, y + 98, `${l ? `${l.summary.victories} victories  ·  ` : ''}${sum.saveCount} save${sum.saveCount === 1 ? '' : 's'}  ·  last played ${dateText(sum.lastPlayed)}`, 17, '#a8977a', { bold: false, stroke: 2 }));
      l?.summary.classes.forEach((cls, k) => {
        const def = content.classes[cls];
        if (!def) return;
        const ax = x + 720 + k * 74;
        root.add(classAvatar(this, def, ax, y + 52, 56));
        root.add(classLogoBadge(this, def, ax - 22, y + 72, 11));
        root.add(hpBar(this, ax - 28, y + 86, 56, 8, l.summary.hp[k] ?? 1));
        if (l.state.roster.find((h) => h.class === cls)?.leader) root.add(crown(this, ax + 22, y + 26, 0.7));
      });
    }
    buttons.forEach((b, k) => root.add(makeMenuButton(this, x + w - 90 - (buttons.length - 1 - k) * 170, y + h / 2, 150, 64, b.label, b.run, { primary: !!b.primary, size: 24 }).container));
  }

  // ------------------------------------------------------------ New Campaign: yuva -> mod + zorluk

  private chooseSlot(): void {
    this.closeModal();
    const sums = slotSummaries(storage());
    const rowH = 150;
    const back = () => this.closeModal();
    const { root, area } = this.openWindow({ title: 'New Campaign', subtitle: 'Choose a slot for your journey', width: 1400, height: 250 + sums.length * rowH, buttons: [{ label: 'Back', run: back }] }, back);
    sums.forEach((sum, i) => {
      const pick = () => (sum ? this.confirmOverwrite(i, sum) : this.chooseOptions(i));
      this.slotCard(root, W / 2 - 660, area.y + i * rowH, 1320, rowH - 14, i, sum, [{ label: sum ? 'Overwrite' : 'Choose', primary: !sum, run: pick }]);
    });
  }

  private confirmOverwrite(slot: number, sum: SlotSummary): void {
    this.closeModal();
    const back = () => this.chooseSlot();
    this.openWindow({
      title: `Overwrite slot ${slot + 1}?`,
      text: `The journey in this slot (${sum.mode === 'ironman' ? 'Ironman' : 'Normal'}, ${sum.latest ? `stop ${sum.latest.summary.stop}, ${sum.latest.summary.node}` : 'not saved yet'}) and all of its ${sum.saveCount} saves will be deleted. This cannot be undone.`,
      height: 440,
      buttons: [
        { label: 'Delete and start', primary: true, run: () => this.chooseOptions(slot) },
        { label: 'Cancel', run: back },
      ],
    }, back);
  }

  private chooseOptions(slot: number): void {
    this.closeModal();
    let mode: CampaignMode = 'normal';
    let diff: Difficulty = CONFIG.defaultDifficulty;
    const back = () => this.chooseSlot();
    const { root, area } = this.openWindow({
      title: 'New Campaign',
      subtitle: `Slot ${slot + 1} · Mode and difficulty cannot be changed later`,
      width: 1300,
      height: 760,
      buttons: [
        {
          label: 'Start',
          primary: true,
          run: () => {
            startNewCampaign(mode, diff, slot);
            this.scene.start(MAP_SCENE);
          },
        },
        { label: 'Back', run: back },
      ],
    }, back);
    const layer = this.add.container(0, 0);
    root.add(layer);
    const draw = () => {
      layer.removeAll(true);
      const pickRow = <T extends string>(y: number, title: string, opts: Array<{ id: T; name: string; lines: string[] }>, cur: T, set: (v: T) => void) => {
        layer.add(serif(this, W / 2, y, title, 22, '#c9b27a', { spacing: 4, stroke: 2 }).setOrigin(0.5, 0));
        const bw = Math.min(360, 1180 / opts.length - 20);
        opts.forEach((o, i) => {
          const x = W / 2 + (i - (opts.length - 1) / 2) * (bw + 20);
          const on = o.id === cur;
          layer.add(makeMenuButton(this, x, y + 74, bw, 70, o.name, () => { set(o.id); draw(); }, { primary: on, size: on ? 32 : 28 }).container);
          o.lines.forEach((l, k) => layer.add(serif(this, x, y + 124 + k * 26, l, 18, on ? '#f3e4c4' : '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5, 0)));
        });
      };
      pickRow(area.y, 'MODE', [
        { id: 'normal' as CampaignMode, name: 'Normal', lines: ['Autosave after every victory', 'Save on the map at any time', 'Up to 5 saves in this slot'] },
        { id: 'ironman' as CampaignMode, name: 'Ironman', lines: ['Saved only after a victory', 'No manual saves', 'A single save, always overwritten'] },
      ], mode, (v) => (mode = v));
      pickRow(area.y + 250, 'DIFFICULTY', DIFFS.map((d) => ({ id: d, name: CONFIG.difficulties[d].name, lines: [CONFIG.difficulties[d].text] })), diff, (v) => (diff = v));
    };
    draw();
  }

  // ------------------------------------------------------------ Load Game: yuva -> kayıtlar

  private loadSlots(): void {
    this.closeModal();
    const sums = slotSummaries(storage());
    const rowH = 150;
    const back = () => this.closeModal();
    const { root, area } = this.openWindow({ title: 'Load Game', subtitle: 'Choose a slot', width: 1400, height: 250 + sums.length * rowH, buttons: [{ label: 'Back', run: back }] }, back);
    sums.forEach((sum, i) => {
      const buttons = sum
        ? [
            { label: 'Delete', run: () => this.confirmDeleteSlot(i, sum) },
            { label: 'Open', primary: true, run: () => (sum.saveCount ? this.loadGame(i) : undefined) },
          ]
        : [];
      this.slotCard(root, W / 2 - 660, area.y + i * rowH, 1320, rowH - 14, i, sum, buttons);
    });
  }

  private confirmDeleteSlot(slot: number, sum: SlotSummary): void {
    this.closeModal();
    const back = () => this.loadSlots();
    this.openWindow({
      title: `Delete slot ${slot + 1}?`,
      text: `The whole journey (${sum.mode === 'ironman' ? 'Ironman' : 'Normal'}) and all of its ${sum.saveCount} saves will be lost. This cannot be undone.`,
      height: 420,
      buttons: [
        {
          label: 'Delete',
          primary: true,
          run: () => {
            deleteSlot(storage(), slot);
            this.refreshCards();
            this.loadSlots();
          },
        },
        { label: 'Cancel', run: back },
      ],
    }, back);
  }

  private loadGame(slot: number): void {
    this.closeModal();
    const saves = listSaves(storage(), slot);
    const rows = Math.max(1, saves.length);
    const rowH = 118;
    const back = () => this.loadSlots();
    const { root, area } = this.openWindow({
      title: `Load Game · Slot ${slot + 1}`,
      width: 1400,
      height: Math.min(1000, 210 + rows * rowH + 40),
      buttons: [{ label: 'Back to slots', run: back }],
    }, back);
    if (!saves.length) root.add(serif(this, W / 2, area.y + 40, 'No saved games in this slot.', 26, '#c9b48a', { bold: false }).setOrigin(0.5, 0));
    saves.forEach((e, i) => {
      const y = area.y + i * rowH;
      const x = W / 2 - 660;
      root.add(makePanel(this, x, y, 1320, rowH - 12, { top: 0x2a2017, bottom: 0x150e09, bevel: 3, ornaments: false, alpha: 0.95 }));
      root.add(serif(this, x + 24, y + 18, `${e.kind === 'manual' ? 'MANUAL' : e.kind === 'start' ? 'START' : 'AUTO'} · ${i === 0 ? 'NEWEST' : ''}`.replace(/ · $/, ''), 16, '#9cc4ff', { spacing: 2 }));
      root.add(serif(this, x + 24, y + 44, `${e.summary.map} · Stop ${e.summary.stop}/${e.summary.stops} · ${e.summary.node}`, 24, '#f3e4c4'));
      root.add(serif(this, x + 24, y + 76, `${e.summary.region}  ·  ${e.summary.victories} victories  ·  ${dateText(e.savedAt)}`, 17, '#a8977a', { bold: false, stroke: 2 }));
      e.summary.classes.forEach((cls, k) => {
        const def = content.classes[cls];
        if (!def) return;
        const ax = x + 720 + k * 74;
        root.add(classAvatar(this, def, ax, y + 40, 56));
        root.add(classLogoBadge(this, def, ax - 22, y + 60, 11));
        root.add(hpBar(this, ax - 28, y + 74, 56, 8, e.summary.hp[k] ?? 1));
      });
      root.add(makeMenuButton(this, x + 1110, y + 52, 150, 64, 'Load', () => this.loadSave(e), { primary: true, size: 26 }).container);
      const del = makeMenuButton(this, x + 1250, y + 52, 110, 64, 'Delete', () => {
        this.closeModal();
        const backDel = () => this.loadGame(slot);
        this.openWindow({
          title: 'Delete save?',
          text: `${e.summary.node}, stop ${e.summary.stop}. This cannot be undone.`,
          height: 400,
          buttons: [
            {
              label: 'Delete',
              primary: true,
              run: () => {
                deleteSave(storage(), slot, e.id);
                this.refreshCards();
                this.loadGame(slot);
              },
            },
            { label: 'Cancel', run: backDel },
          ],
        }, backDel);
      }, { size: 22 });
      root.add(del.container);
    });
  }

  /** Kayıt silinince Campaign kartındaki Continue / Load durumu yenilensin. */
  private refreshCards(): void {
    const shown = this.view === 'play';
    for (const { c } of this.cards) c.destroy(true);
    this.cards = [];
    this.buildCards();
    this.showCards(shown, true);
  }
}
