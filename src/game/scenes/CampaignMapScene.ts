import Phaser from 'phaser';
import { content } from '../../engine';
import {
  CONFIG,
  EVENTS,
  TREASURES,
  acknowledgeHandover,
  grantAllLegendaries,
  acknowledgeLoot,
  activeHeroes,
  autoFormation,
  canSaveManually,
  completeSimple,
  edgeVisibility,
  enemyPreview,
  farewell,
  formCompany,
  getMap,
  incoming,
  isAreaClass,
  leaderOf,
  markTipSeen,
  moveHero,
  moveTo,
  newCampaign,
  nextStep,
  node,
  nodeVisibility,
  outgoing,
  pendingTip,
  pickHero,
  recruit,
  saveCount,
  stopNumber,
  type CampaignMap,
  type CampaignState,
  type EdgeVis,
  type MapNode,
  type NextStep,
  type NodeType,
  type NodeVis,
} from '../../campaign';
import { characterTexture, preloadAssets } from '../assets';
import { preloadCampaignArt } from '../campaign-art';
import { edgeFillers, mapArt } from '../map-art';
import { placeArt } from '../wide-map';
import { onStageResize, stageView } from '../stage';
import { FULL_W, FULL_X0 } from '../../ui/viewport';
import { H, W, classCard, crown, hpBar, openModal, type Modal } from '../campaign-ui';
import { MAP_SCENE, MENU_SCENE, current, loadEntry, markJourneyStart, save, session, setState, startCampaignBattle, storage } from '../campaign-session';
import { classAvatar, classLogoBadge, ensureGlow } from '../menu-ui';
import { sortByPrimary } from '../class-order';
import { debugState } from '../debug-state';
import { isSettingsOpen, setSettingsOpen } from '../../ui/settings';
import { mountMenuToggle } from '../../ui/game-menu';
import { openGearScreen, showHandover, showSpoils } from '../../ui/gear-screen';
import { legendaryPreviewWanted } from '../../progression/items';
import { openWiki } from '../../wiki/open';
import { EL, diamondPts, elBadge, elBody, elButton, elDiamond, elGo, elIconButton, elLink, elPanel, elScreenIn, elText, elToast, fadeLine, fitW, hGradient, vGradient } from '../elegant-ui';
import { MAP_ZOOM, canPan, clampMid, clampZoom, wheelAction, type Bounds } from '../map-view';
import { drawNodeGlyph, nodeGlyphImage, openFormation, openHeroPanel } from '../campaign-panels';
import { openSlotBrowser, type SlotBrowser } from '../campaign-slots-ui';
import { ensureIcon } from '../icons';
import { hasUiImage, uiIconName, type UiIconKind } from '../../ui/ui-icons';

/**
 * Sefer haritası, "War table" (Ömer 2026-10-09, taslak 2; tasarım kiti):
 *  - Harita tam ekran; solda takım sütunu (portre + seviye + can; dokununca kahraman paneli: seviye / XP, 6 yuva, statlar -> Gear),
 *    altında Formation / Gear; sağda seçili düğümün kartı (ad, tür, düşmanlar, sonraki duraklar, March / Fight / Enter + Formation).
 *  - Üst solda harita adı + bölge, durak, mod, zorluk, altın; sağ üstte Menu (DOM, Esc): Resume / Save / Settings / Main Menu.
 *  - Düğümler: tür başına ince glif (savaş, elit, boss, kasaba, hazine, olay); durumlar geçildi / buradasın / gidilebilir (kor parıltı) / kapalı.
 *    Gidilebilir yollar akan kor çizgi, yürünmüş yol düz altın, ötesi kesik.
 *  - Kaydırma / yakınlaştırma (src/game/map-view.ts): 21:9 harita çerçevesinden asla çıkmaz; dokunma / fare sürükleme, tekerlek ve trackpad
 *    (Ctrl + tekerlek ya da sıkıştırma = yakınlaştırma), ok tuşları, + / - tuşları, alttaki ◂ ▸ − + düğmeleri. Yakınlaştırma 1,0-1,4x.
 * Kurallar src/campaign/ içindedir; bu sahne yalnızca çizer ve oyuncunun seçimlerini kurallara iletir.
 * İki kamera: ana kamera haritayı, arayüz kamerası sabit katmanı gösterir (customStageCamera; gerçek yakınlaştırma = render ölçeği x harita).
 */

const TYPE_LABEL: Record<NodeType, string> = { town: 'Town', battle: 'Battle', elite: 'Elite', event: 'Event', treasure: 'Treasure', boss: 'Boss' };
const NODE_R = 24;
const WALK_SPEED = 320; // px/sn
const FOLLOW_GAP = 55; // px
const PAN_STEP = 340;
/** Sütun genişlikleri (Ömer 2026-10-09: 16:9'da daralmasın): sol takım sütunu ve sağ düğüm sütunu aynı dilde, aynı genişlikte. */
const SIDE = { left: 48, top: 150, partyW: 420, cardW: 440 };
/** Zorunlu seçim pencereleri (Esc ile kapanmaz; Party / Formation bunların üstünde açılmaz). */
const FORCED: ReadonlyArray<NextStep['kind']> = ['hero', 'recruit', 'volunteer', 'farewell', 'company'];

type Pt = { x: number; y: number };

export class CampaignMapScene extends Phaser.Scene {
  static readonly KEY = 'CampaignMapScene';
  /** Kameraları stage.ts değil bu sahne kurar (iki kamera + harita yakınlaştırması). */
  readonly customStageCamera = true;
  /** Oyuncunun harita yakınlaştırması (MAP_ZOOM); kameranın gerçek yakınlaştırması bunun render ölçeğiyle çarpımı. */
  private mapZoom = 1;
  /** Harita görselinin dünyadaki kapsamı (21:9 çerçeve; kaydırma sınırı). */
  private frame: Bounds = { left: 0, right: W, top: 0, bottom: H };
  /** Harita kamerasının baktığı nokta (kısılmadan önce). */
  private mid: Pt = { x: W / 2, y: H / 2 };

  private map!: CampaignMap;
  private world!: Phaser.GameObjects.Container;
  private dyn!: Phaser.GameObjects.Container;
  private ui!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private curves = new Map<string, Phaser.Curves.QuadraticBezier>();
  private openEdges: Array<{ g: Phaser.GameObjects.Graphics; pts: Pt[] }> = [];
  private clouds = new Map<string, Phaser.GameObjects.Image[]>();
  private caravan: Phaser.GameObjects.Image[] = [];
  private walking: { finish: () => void } | null = null;
  private modal: Modal | null = null;
  private pauseMenu: Modal | null = null;
  /** Menu > Load: bu yuvanın kayıt listesi (src/game/campaign-slots-ui.ts "Column"). */
  private slotBrowser: SlotBrowser | null = null;
  /** Kahraman paneli ya da Formation penceresi açık (Menu düğmesi gizlenir; pencerenin kendi Close / Done'ı yeter). */
  private sideOpen = false;
  /** Sağ üstteki DOM "Menu" düğmesi. */
  private menuBtn: HTMLButtonElement | null = null;
  private tip: Phaser.GameObjects.Container | null = null;
  private dashT = 0;
  private drag = { down: false, moved: false, x: 0, y: 0 };
  private legendOpen = true;
  /** Sağdaki kartta gösterilen düğüm. */
  private sel = '';
  private panBtns: { left?: Phaser.GameObjects.Container; right?: Phaser.GameObjects.Container; minus?: Phaser.GameObjects.Container; plus?: Phaser.GameObjects.Container } = {};
  private toastFn: ((msg: string) => void) | null = null;

  constructor() {
    super(CampaignMapScene.KEY);
  }

  private get s(): CampaignState {
    return current()!;
  }

  init(): void {
    this.curves = new Map();
    this.openEdges = [];
    this.clouds = new Map();
    this.caravan = [];
    this.walking = null;
    this.modal = null;
    this.pauseMenu = null;
    this.slotBrowser = null;
    this.sideOpen = false;
    this.menuBtn = null;
    this.tip = null;
    this.mapZoom = 1;
    this.frame = { left: 0, right: W, top: 0, bottom: H };
    this.mid = { x: W / 2, y: H / 2 };
    this.sel = '';
    this.panBtns = {};
    this.toastFn = null;
    this.panTween = null;
    this.panTarget = null;
  }

  preload(): void {
    preloadAssets(this);
    preloadCampaignArt(this);
  }

  create(): void {
    elScreenIn(this); // ortak ekran geçişi (data/ui-motion.json > screen; Reduced motion = anında)
    if (!current()) {
      // ?campaign=1 (geliştirme) ya da kayıtsız açılış: yeni Normal sefer
      setState(newCampaign({ mode: 'normal', seed: Math.floor(Date.now() % 1_000_000_000) }));
    }
    this.map = getMap(this.s.mapId);
    this.cameras.main.setBackgroundColor('#0b0705');
    this.world = this.add.container(0, 0);
    this.ui = this.add.container(0, 0).setDepth(1000);
    this.uiCam = this.cameras.add(0, 0, stageView.canvasW, stageView.canvasH);
    this.cameras.main.ignore(this.ui);
    this.uiCam.ignore(this.world);

    this.drawTerrain();
    this.dyn = this.add.container(0, 0);
    this.world.add(this.dyn);
    this.renderMap(false);
    this.placeCaravan(this.s.at);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.toastFn = elToast(this, 150, this.ui); // bildirim arayüz katmanında
    this.renderHud();
    this.bindCamera();
    const compact = document.documentElement.classList.contains('compact') || document.documentElement.classList.contains('short');
    if (compact) this.mapZoom = 1.2;
    const at = this.P(this.s.at);
    this.mid = { x: at.x, y: at.y };
    this.layoutCameras(true);
    onStageResize(this, () => this.layoutCameras(false));
    this.events.on('update', (_t: number, dt: number) => {
      this.animateDashes(dt);
      this.updatePanButtons();
      this.syncOverlays();
    });
    this.mountMenuButton();
    this.input.keyboard?.on('keydown-ESC', () => this.onEscape());
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.advance();
  }

  // ------------------------------------------------------------ oyun menüsü (sağ üst Menu düğmesi / Esc)

  /** Sağ üstteki DOM simge sırasına (Menu / tam ekran / wiki) hizalı "Menu" düğmesi (savaştaki ile aynı: mountMenuToggle); sahne kapanınca kaldırılır. */
  private mountMenuButton(): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    root.querySelector('.campaign-menu-toggle')?.remove();
    const b = mountMenuToggle(root, () => this.toggleMenu(), 'campaign-menu-toggle');
    this.menuBtn = b;
    this.events.once('shutdown', () => {
      b.remove();
      this.menuBtn = null;
      setSettingsOpen(false);
    });
  }

  /**
   * Katman düzeni (her karede): açık bir pencere / menü / yuva ekranı / Gear varken alttaki ipucu kartı gizlenir (pencerelerin üstüne
   * çizilmesin); yuva ekranı, kahraman paneli, Formation ve Gear açıkken sağ üstteki Menu düğmesi de gizlenir (Geri / Menu kuralı:
   * o ekranların kendi Back / Close / Done'ı yeter).
   */
  private syncOverlays(): void {
    const gear = !!document.querySelector('#ui-root .gr-overlay');
    const cover = !!this.slotBrowser || this.sideOpen || gear;
    if (this.menuBtn && this.menuBtn.hidden !== cover) this.menuBtn.hidden = cover;
    if (this.tip) {
      const show = !cover && !this.pauseMenu && !this.modal;
      if (this.tip.visible !== show) this.tip.setVisible(show);
    }
  }

  private toggleMenu(): void {
    if (this.slotBrowser || this.sideOpen) return;
    if (this.pauseMenu) this.closeMenu();
    else this.openMenu();
  }

  private closeMenu(): void {
    this.pauseMenu?.close();
    this.pauseMenu = null;
  }

  /** Resume / Save / Load (Normal) / Codex / Settings / Main Menu (Ömer 2026-10-09; tasarım kiti: openModal + kit düğmeleri). */
  private openMenu(): void {
    if (this.pauseMenu || this.walking || this.slotBrowser) return;
    const s = this.s;
    const items: Array<{ label: string; run: () => void; primary?: boolean }> = [{ label: 'Resume', primary: true, run: () => this.closeMenu() }];
    if (canSaveManually(s) && !this.modal)
      items.push({
        label: `Save  ${saveCount(storage(), s.slot)}/${CONFIG.rules.maxSaves.normal}`,
        run: () => {
          save('manual');
          this.closeMenu();
          this.renderHud(); // "Game saved" bildirimi
        },
      });
    if (s.mode === 'normal') items.push({ label: 'Load', run: () => (this.closeMenu(), this.openLoad()) });
    // Codex (sağ üst kitap düğmesi kaldırıldı): menüden açılır; her bağlamda Settings'in hemen üstünde
    items.push({ label: 'Codex', run: () => (this.closeMenu(), openWiki()) });
    // Ayarlar sütunu açıkken menü penceresi gizlenir (ana menü sütun görünümü); Back / Esc ile geri gelir
    items.push({
      label: 'Settings',
      run: () => {
        m.root.setVisible(false);
        setSettingsOpen(true, () => m.root.active && m.root.setVisible(true));
      },
    });
    items.push({ label: 'Main Menu', run: () => elGo(this, MENU_SCENE) });
    const m = openModal(this, this.ui, { title: 'Menu', width: 620, height: 170 + items.length * 88, onDismiss: () => this.closeMenu() });
    items.forEach((it, i) => {
      const b = elButton(this, it.label, it.run, { kind: it.primary ? 'primary' : 'secondary', w: 440, h: it.primary ? 70 : 60, size: it.primary ? 24 : 19, ready: true });
      b.root.setPosition(W / 2, m.area.y + 40 + i * 88);
      m.root.add(b.root);
    });
    this.pauseMenu = m;
  }

  /** Menu > Load: bu yuvanın kayıtları; Back menüye döner, bir kayıt yüklenince harita o kayıtla yeniden kurulur. */
  private openLoad(): void {
    this.slotBrowser = openSlotBrowser(this, this.ui, {
      flow: 'load',
      slot: this.s.slot,
      onlySlot: true,
      onClose: () => {
        this.slotBrowser = null;
        this.openMenu();
      },
      onLoad: (e) => {
        loadEntry(e);
        this.scene.start(MAP_SCENE);
      },
    });
  }

  /** Esc: önce açık ayarlar paneli / menü / kart / ipucu kapanır; hiçbiri yoksa menü açılır. */
  private onEscape(): void {
    if (debugState.uiPaused) return; // wiki açık: Esc wiki'nindir
    if (isSettingsOpen()) return setSettingsOpen(false);
    if (this.slotBrowser) return this.slotBrowser.back();
    if (this.pauseMenu) return this.closeMenu();
    if (this.walking) return this.walking.finish();
    const step = nextStep(this.s).kind;
    // zorunlu seçim pencereleri (kahraman, aday, veda, yeni takım) Esc ile kapanmaz: menü üstlerine açılır
    if (this.modal && !FORCED.includes(step)) {
      this.closeModal();
      this.renderHud();
      return;
    }
    if (this.tip && !this.modal) return this.dismissTip();
    this.openMenu();
  }

  /** Ok tuşları = kaydırma, + / - = yakınlaştırma (pencere / menü açıkken değil). */
  private onKey(e: KeyboardEvent): void {
    if (this.modal || this.pauseMenu || debugState.uiPaused || isSettingsOpen()) return;
    if (e.key === 'ArrowLeft') this.panBy(-PAN_STEP, 0);
    else if (e.key === 'ArrowRight') this.panBy(PAN_STEP, 0);
    else if (e.key === 'ArrowUp') this.panBy(0, -PAN_STEP * 0.6);
    else if (e.key === 'ArrowDown') this.panBy(0, PAN_STEP * 0.6);
    else if (e.key === '+' || e.key === '=') this.setMapZoom(this.mapZoom + MAP_ZOOM.step);
    else if (e.key === '-' || e.key === '_') this.setMapZoom(this.mapZoom - MAP_ZOOM.step);
  }

  // ------------------------------------------------------------ geometri

  private P(id: string): Pt {
    const n = node(this.map, id);
    return { x: n.pos[0] * W, y: n.pos[1] * H };
  }

  /** Kenarın eğrisi: hafif kavisli (kavis yönü kimliklerden belirleyici). */
  private curve(from: string, to: string): Phaser.Curves.QuadraticBezier {
    const key = `${from}>${to}`;
    let c = this.curves.get(key);
    if (c) return c;
    const a = this.P(from);
    const b = this.P(to);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const bend = (h % 2 ? 1 : -1) * len * 0.1;
    c = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(mx + (-dy / len) * bend, my + (dx / len) * bend), new Phaser.Math.Vector2(b.x, b.y));
    this.curves.set(key, c);
    return c;
  }

  // ------------------------------------------------------------ arazi (sabit)

  private drawTerrain(): void {
    const art = mapArt(this, this.map);
    if (art) {
      const img = this.add.image(0, 0, art.key).setOrigin(0, 0);
      // Eski 16:9 haritanın bölgesi dünyada 0-1920 x 0-1080'e oturur (düğüm konumları bu bölgeye göre)
      const p = placeArt(img.width, img.height, art.region, { x: 0, y: 0, w: W, h: H });
      img.setPosition(p.x, p.y).setScale(p.scale);
      this.frame = { left: Math.min(0, p.left), right: Math.max(W, p.right), top: Math.min(0, p.top), bottom: Math.max(H, p.bottom) };
      const fill = edgeFillers(this, art.key, 0);
      fill.place(img);
      this.world.add([...fill.items, img]);
    } else {
      const g = this.add.graphics();
      g.fillGradientStyle(0xd9c497, 0xd9c497, 0xb59a68, 0xb59a68, 1).fillRect(FULL_X0, 0, FULL_W, H);
      this.world.add(g);
    }
    // Ashen Plain: arka planda kül rengi ova yok, kodla gri-kül ton
    const ash = this.map.nodes.find((n) => n.id === '10');
    if (ash) {
      const a = this.add.image(ash.pos[0] * W, ash.pos[1] * H, ensureGlow(this)).setTint(0x8a8580).setAlpha(0.55).setScale(4.2, 3);
      this.world.add(a);
    }
  }

  // ------------------------------------------------------------ yollar, düğümler, sis (duruma göre yeniden çizilir)

  private renderMap(animateFog: boolean): void {
    this.dyn.removeAll(true);
    this.openEdges = [];
    const vis = nodeVisibility(this.map, this.s, session.revealFog);
    const step = nextStep(this.s);
    const options = step.kind === 'move' ? step.options : [];
    // 1) yollar (altta koyu iz: harita üstünde okunur kalsın), gidilebilenler ayrı katmanda akar
    const lines = this.add.graphics();
    this.dyn.add(lines);
    for (const e of this.map.edges) {
      const ev = edgeVisibility(this.map, this.s, vis, e);
      const pts = this.curve(e.from, e.to).getPoints(48).map((p) => ({ x: p.x, y: p.y }));
      if (ev === 'open') {
        const g = this.add.graphics();
        this.dyn.add(g);
        this.openEdges.push({ g, pts });
        continue;
      }
      this.drawRoad(lines, pts, ev, 0);
    }
    this.animateDashes(0);
    // 2) düğümler
    for (const n of this.map.nodes) this.drawNode(n, vis[n.id]!, options.includes(n.id));
    // 3) sis bulutları
    this.updateClouds(vis, animateFog);
  }

  /** Yol: yürünmüş = düz altın; gidilebilir = akan kor (parıltı altlığıyla); görünür = kesik altın; kapalı / sis = soluk kesik. */
  private drawRoad(g: Phaser.GameObjects.Graphics, pts: Pt[], ev: EdgeVis, offset: number): void {
    const stroke = (w: number, col: number, a: number, dashed: boolean, dash = 14, gap = 10) => {
      g.lineStyle(w, col, a);
      if (!dashed) {
        g.beginPath();
        pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.strokePath();
      } else this.dashed(g, pts, dash, gap, offset);
    };
    switch (ev) {
      case 'walked':
        stroke(7, 0x0c0805, 0.4, false);
        stroke(3, EL.GOLD, 0.85, false);
        break;
      case 'open':
        stroke(12, EL.EMBER, 0.18, false);
        stroke(7, 0x0c0805, 0.45, false);
        stroke(3.5, EL.EMBER2, 1, true, 16, 10);
        break;
      case 'visible':
        stroke(6, 0x0c0805, 0.35, false);
        stroke(2.5, EL.GOLD, 0.6, true);
        break;
      default:
        stroke(2, 0x8a8070, 0.28, true, 8, 10);
    }
  }

  /** Kesik çizgi (yay uzunluğuna göre); `offset` akış animasyonu. */
  private dashed(g: Phaser.GameObjects.Graphics, pts: Pt[], dash: number, gap: number, offset: number): void {
    const period = dash + gap;
    let dist = -((offset % period) + period) % period;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      let t = 0;
      while (t < seg) {
        const phase = (((dist + t) % period) + period) % period;
        const inDash = phase < dash;
        const left = inDash ? dash - phase : period - phase;
        const t2 = Math.min(seg, t + left);
        if (inDash) g.lineBetween(a.x + ((b.x - a.x) * t) / seg, a.y + ((b.y - a.y) * t) / seg, a.x + ((b.x - a.x) * t2) / seg, a.y + ((b.y - a.y) * t2) / seg);
        t = t2 + 0.001;
      }
      dist += seg;
    }
  }

  /** Gidilebilecek yollarda akan kor çizgi. */
  private animateDashes(dt: number): void {
    if (!this.openEdges.length) return;
    this.dashT += dt * 0.035;
    for (const { g, pts } of this.openEdges) {
      g.clear();
      this.drawRoad(g, pts, 'open', -this.dashT);
    }
  }

  /**
   * Düğüm: küçük madalyon + tür glifi. Durumlar: buradasın (kor dolgu + nabız), gidilebilir (açık altın halka + kor parıltı),
   * geçildi (soluk altın dolgu), ileride (koyu, altın halka), kapalı (çok soluk), hedef (sisli siluet). Ad Cinzel, alt yazı italik.
   */
  private drawNode(n: MapNode, v: NodeVis, option: boolean): void {
    if (v === 'fog') return;
    const p = this.P(n.id);
    const c = this.add.container(p.x, p.y);
    this.dyn.add(c);
    const big = n.final || n.type === 'boss';
    const r = NODE_R * (big ? 1.25 : 1);
    const here = v === 'current';
    const done = v === 'cleared';
    const goal = v === 'goal';
    const closed = v === 'closed';
    const selected = this.sel === n.id;
    const actionable = option || (here && this.actionHere());
    if (actionable) {
      const glow = this.add.image(0, 0, ensureGlow(this)).setTint(EL.EMBER).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(r * 5.5, r * 5.5).setAlpha(0.5);
      c.add(glow);
      this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.85 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const g = this.add.graphics();
    c.add(g);
    g.fillStyle(0x000000, 0.4).fillCircle(2, 4, r + 3);
    const fill = here ? EL.EMBER : done ? 0x6e5a34 : 0x140e09;
    g.fillStyle(fill, goal ? 0.6 : 0.95).fillCircle(0, 0, r);
    const ring = here ? EL.EMBER2 : option ? EL.ON_N : EL.GOLD;
    g.lineStyle(here || option ? 2 : 1.5, ring, goal ? 0.35 : here || option ? 1 : done ? 0.6 : 0.7).strokeCircle(0, 0, r);
    if (big && !goal) g.lineStyle(1, EL.EMBER2, 0.7).strokeCircle(0, 0, r + 6);
    if (selected) {
      g.lineStyle(1, EL.ON_N, 0.9).strokeCircle(0, 0, r + 10);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) g.fillStyle(EL.ON_N, 1).fillPoints(diamondPts(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10), 3.5), true);
    }
    const glyphCol = here ? 0x1a0f06 : done ? 0x1e150c : goal ? 0x7d705a : closed ? 0x7d705a : option ? EL.ON_N : 0xd9c8a2;
    // boyalı düğüm ikonu (assets/misc-icons/node), yoksa ince çizgili glif; hedef (sisli siluet) koyu ve soluk
    const art = nodeGlyphImage(this, n.type, 0, 0, r * 1.84);
    if (art) {
      if (goal) art.setTint(0x6a5e4c).setAlpha(0.6);
      c.add(art);
    } else drawNodeGlyph(g, n.type, glyphCol, big ? 1.25 : 1);
    if (n.type === 'treasure' && n.encounter) {
      // Korumalı hazine: sağ altta küçük çapraz kılıç madalyonu
      const gb = this.add.graphics();
      gb.fillStyle(0x140e09, 1).fillCircle(r * 0.8, r * 0.8, 11).lineStyle(1, EL.GOLD, 0.8).strokeCircle(r * 0.8, r * 0.8, 11);
      c.add(gb);
      const guard = nodeGlyphImage(this, 'battle', r * 0.8, r * 0.8, 20);
      if (guard) c.add(guard);
      else drawNodeGlyph(gb, 'battle', 0xd9c8a2, 0.45, r * 0.8, r * 0.8);
    }
    // Ad + alt yazı
    const above = n.label === 'above';
    const nameCol = closed || goal ? EL.DIM : here || option || selected ? EL.ON : EL.TXT;
    const name = elText(this, 0, 0, n.name, 15, nameCol, { em: 0.06 }).setOrigin(0.5, above ? 1 : 0).setShadow(0, 2, 'rgba(8,5,3,1)', 6, false, true);
    name.y = above ? -r - 12 : r + 10;
    // Okunurluk: yazının arkasında yumuşak koyu leke (harita üstünde)
    const back = this.add.image(0, name.y + (above ? -12 : 12), ensureGlow(this)).setTint(0x000000).setDisplaySize(name.width + 70, 54).setAlpha(closed || goal ? 0.25 : 0.55);
    c.add([back, name]);
    const showSub = here || option || v === 'near' || done;
    if (showSub) {
      const choice = outgoing(this.map, n.id).length > 1 && !done ? '  ·  choice' : '';
      const sub = elBody(this, 0, 0, `${n.subtitle}${choice}`, 15, EL.MUTED).setOrigin(0.5, above ? 1 : 0).setShadow(0, 2, 'rgba(8,5,3,1)', 6, false, true);
      sub.y = above ? name.y - 22 : name.y + 22;
      c.add(sub);
    }
    if (n.id === this.map.start && !here && !done) c.add(elText(this, 0, -r - (above ? 60 : 16), 'Start', 12, EL.MUTED, { em: 0.2 }).setOrigin(0.5, 1));
    if (incoming(this.map, n.id).length > 1 && !done) c.add(elText(this, -r - 14, 0, '›', 18, EL.MUTED, { em: 0 }).setOrigin(0.5));
    if (closed) c.setAlpha(0.45);
    else if (done) c.setAlpha(0.85);
    else if (goal) c.setAlpha(0.75);
    if (here && this.actionHere()) this.tweens.add({ targets: g, scale: { from: 1, to: 1.08 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const zone = this.add.zone(0, 0, 96, 96).setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Circle(48, 48, 48), hitAreaCallback: Phaser.Geom.Circle.Contains });
    zone.on('pointerup', () => {
      if (this.drag.moved || this.walking || this.modal || this.pauseMenu) return;
      this.onNodeTap(n.id, v);
    });
    c.add(zone);
  }

  private updateClouds(vis: Record<string, NodeVis>, animate: boolean): void {
    const want = new Map<string, number>();
    for (const n of this.map.nodes) {
      const v = vis[n.id];
      if (v === 'fog' || v === 'goal') want.set(n.id, v === 'goal' ? 0.45 : 0.78);
      else if (v === 'closed') want.set(n.id, 0.3);
    }
    for (const [id, imgs] of this.clouds) {
      if (want.has(id)) continue;
      this.clouds.delete(id);
      for (const im of imgs) {
        if (animate) this.tweens.add({ targets: im, alpha: 0, duration: 600, onComplete: () => im.destroy() });
        else im.destroy();
      }
    }
    const tex = this.cloudTexture();
    for (const [id, a] of want) {
      const existing = this.clouds.get(id);
      if (existing) {
        existing.forEach((im) => im.setAlpha(a));
        continue;
      }
      const p = this.P(id);
      let h = 0;
      for (const ch of id) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
      const imgs = [0, 1, 2].map((k) => {
        const im = this.add.image(p.x + ((h >> k) % 50) - 25 + (k - 1) * 40, p.y + 20 + (k - 1) * 18, tex).setAlpha(a).setScale(1.1 + k * 0.25, 0.9 + k * 0.15).setTint(0xeeeae2);
        this.tweens.add({ targets: im, x: im.x + (k % 2 ? 26 : -26), duration: 9000 + k * 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.world.add(im);
        return im;
      });
      this.clouds.set(id, imgs);
    }
  }

  private cloudTexture(): string {
    const key = 'cmap-cloud';
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, 256, 160);
    if (!tex) return key;
    const ctx = tex.getContext();
    let seed = 4242;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 12; i++) {
      const x = 50 + rnd() * 156;
      const y = 50 + rnd() * 60;
      const r = 30 + rnd() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 160);
    }
    tex.refresh();
    return key;
  }

  // ------------------------------------------------------------ kafile (lider + silüetler)

  private placeCaravan(at: string): void {
    this.caravan.forEach((c) => c.destroy());
    this.caravan = [];
    const team = activeHeroes(this.s);
    const lead = leaderOf(this.s);
    const order = lead ? [lead, ...team.filter((h) => h.id !== lead.id)] : team;
    const p = this.P(at);
    order.forEach((h, i) => {
      const def = content.classes[h.class];
      if (!def) return;
      const tex = characterTexture(this, def.spriteId, def.color);
      const img = this.add.image(p.x, p.y, tex.key, tex.real && this.textures.get(tex.key).has('0') ? '0' : undefined).setOrigin(0.5, 1);
      const height = i === 0 ? 96 : 96 * 0.85;
      img.setScale(height / img.height);
      if (i > 0) img.setTint(0x2a1a10).setAlpha(0.55);
      img.setPosition(p.x - 34 - i * 28, p.y - 4);
      this.world.add(img);
      this.caravan.push(img);
    });
    // lider önde (en üstte çizilir)
    this.caravan.slice().reverse().forEach((im) => this.world.bringToTop(im));
  }

  /** Kafileyi yol boyunca yürütür; dokunma ya da `finish` atlar. Kamera kafileyi izler (çerçeve içinde). */
  private walk(from: string, to: string, done: () => void): void {
    const c = this.curve(from, to);
    const len = c.getLength();
    const duration = (len / WALK_SPEED) * 1000;
    const state = { d: 0 };
    let finished = false;
    const pointAt = (d: number): Pt => {
      if (d <= 0) {
        // kafilenin arkası henüz başlangıç düğümünde: önceki yolun sonundan geriye uzanır
        const a = this.P(from);
        return { x: a.x + d * 0.6, y: a.y };
      }
      const pt = c.getPointAt(Math.min(1, d / len));
      return { x: pt.x, y: pt.y };
    };
    const place = () => {
      this.caravan.forEach((im, i) => {
        const d = state.d - i * FOLLOW_GAP;
        const p = pointAt(d);
        const ahead = pointAt(d + 4);
        const bob = Math.abs(Math.sin((state.d / 26) * Math.PI + i * 0.8)) * 4;
        im.setPosition(p.x, p.y - 4 - bob);
        if (Math.abs(ahead.x - p.x) > 0.5) im.setFlipX(ahead.x < p.x);
      });
      const lead = this.caravan[0];
      if (lead) this.setMid({ x: lead.x, y: lead.y });
    };
    const tween = this.tweens.add({ targets: state, d: len, duration, ease: 'Sine.easeInOut', onUpdate: place, onComplete: () => finish() });
    const skip = this.add.zone(FULL_X0, 0, FULL_W, H).setOrigin(0, 0).setInteractive();
    this.ui.add(skip);
    const hint = elBody(this, W / 2, 1030, 'Tap to skip', 20, EL.NOTE).setOrigin(0.5).setAlpha(0.85);
    this.ui.add(hint);
    const finish = () => {
      if (finished) return;
      finished = true;
      tween.stop();
      skip.destroy();
      hint.destroy();
      this.walking = null;
      this.placeCaravan(to);
      done();
    };
    skip.on('pointerdown', finish);
    this.walking = { finish };
  }

  // ------------------------------------------------------------ kamera: kaydırma + yakınlaştırma (21:9 çerçevede)

  private bindCamera(): void {
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      if (this.modal || this.pauseMenu) return;
      const ev = p.event as WheelEvent | undefined;
      // birkaç piksellik dikey pay tekerleği yutmasın: dikey kaydırma yalnızca belirgin yer varsa
      const a = wheelAction({ dx, dy, ctrl: !!ev?.ctrlKey }, { vertical: this.frame.bottom - this.frame.top - this.viewSize().h > 150 });
      if (a.zoom) this.setMapZoom(this.mapZoom + a.zoom * 0.5);
      if (a.panX || a.panY) this.setMid({ x: this.mid.x + a.panX / this.camZoom(), y: this.mid.y + a.panY / this.camZoom() });
    });
    // Ctrl + tekerlek (trackpad sıkıştırması) tarayıcıyı yakınlaştırmasın
    const canvas = this.game.canvas;
    const stopZoom = (e: WheelEvent) => {
      if (e.ctrlKey && this.sys.isActive()) e.preventDefault();
    };
    canvas.addEventListener('wheel', stopZoom, { passive: false });
    this.events.once('shutdown', () => canvas.removeEventListener('wheel', stopZoom));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { down: !this.modal && !this.pauseMenu, moved: false, x: p.x, y: p.y };
    });
    // İki parmakla sıkıştırma = yakınlaştırma
    this.input.addPointer(1);
    let pinch = 0;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (pinch > 0 && !this.modal) this.setMapZoom(this.mapZoom * (d / pinch), true);
        pinch = d;
        this.drag.moved = true;
        this.drag.x = p.x;
        this.drag.y = p.y;
        return;
      }
      pinch = 0;
      if (!this.drag.down || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 10) return;
      this.drag.moved = true;
      this.setMid({ x: this.mid.x - dx / this.camZoom(), y: this.mid.y - dy / this.camZoom() });
      this.drag.x = p.x;
      this.drag.y = p.y;
    });
    this.input.on('pointerup', () => {
      this.drag.down = false;
      this.time.delayedCall(0, () => (this.drag.moved = false));
    });
  }

  private camZoom(): number {
    return stageView.zoom * this.mapZoom;
  }

  /** Görünen dünya alanı (tuval / gerçek yakınlaştırma). */
  private viewSize(): { w: number; h: number } {
    const z = this.camZoom();
    return { w: (stageView.canvasW || W) / z, h: (stageView.canvasH || H) / z };
  }

  /** Kamera ortasını ayarlar (çerçeveye kısılır). */
  private setMid(p: Pt): void {
    this.mid = clampMid(p, this.frame, this.viewSize());
    this.cameras.main.centerOn(this.mid.x, this.mid.y);
  }

  /** Düğmeler / ok tuşları: yumuşak kaydırma (art arda basışlar hedefe eklenir). */
  private panBy(dx: number, dy: number): void {
    const base = this.panTween?.isPlaying() && this.panTarget ? this.panTarget : this.mid;
    const from = { ...this.mid };
    const to = clampMid({ x: base.x + dx, y: base.y + dy }, this.frame, this.viewSize());
    this.panTarget = to;
    this.panTween?.stop();
    const o = { t: 0 };
    this.panTween = this.tweens.add({ targets: o, t: 1, duration: 280, ease: EL.EASE, onUpdate: () => this.setMid({ x: from.x + (to.x - from.x) * o.t, y: from.y + (to.y - from.y) * o.t }) });
  }
  private panTween: Phaser.Tweens.Tween | null = null;
  private panTarget: Pt | null = null;

  private setMapZoom(z: number, raw = false): void {
    this.mapZoom = raw ? Math.min(MAP_ZOOM.max, Math.max(MAP_ZOOM.min, z)) : clampZoom(z);
    this.cameras.main.setZoom(this.camZoom());
    this.setMid(this.mid);
  }

  /** ◂ ▸ düğmeleri yalnızca o yöne gidilebiliyorsa etkin; − + sınırlarda soluk. */
  private updatePanButtons(): void {
    const b = this.panBtns;
    if (!b.left) return;
    const can = canPan(this.mid, this.frame, this.viewSize());
    b.left.setAlpha(can.left ? 1 : 0.3);
    b.right?.setAlpha(can.right ? 1 : 0.3);
    b.minus?.setAlpha(this.mapZoom > MAP_ZOOM.min + 0.001 ? 1 : 0.3);
    b.plus?.setAlpha(this.mapZoom < MAP_ZOOM.max - 0.001 ? 1 : 0.3);
  }

  /**
   * Kameralar (kurulumda ve ekran boyutu değişince): tuval boyutu, render ölçeği; harita kamerası baktığı noktayı korur (çerçeveye kısılı);
   * arayüz kamerası 1920x1080 arayüzü ortalar, sütunlar görünen alanın kenarlarına yeniden yerleşir.
   */
  private layoutCameras(first: boolean): void {
    const cam = this.cameras.main;
    cam.setSize(stageView.canvasW, stageView.canvasH);
    cam.setZoom(this.camZoom());
    this.setMid(this.mid);
    this.uiCam.setSize(stageView.canvasW, stageView.canvasH);
    this.uiCam.setZoom(stageView.zoom);
    this.uiCam.centerOn(W / 2, H / 2);
    if (!first) this.renderHud();
  }

  private uiPoint(p: Phaser.Input.Pointer): Pt {
    const v = this.uiCam.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  // ------------------------------------------------------------ arayüz (sabit katman): War table

  private renderHud(): void {
    this.hud.removeAll(true);
    this.panBtns = {};
    const s = this.s;
    const L = this.hud;
    const left = stageView.left;
    const right = stageView.right;
    // Kenar gölgeleri: sütunların altı okunur, orta harita açık (taslaktaki yatay degrade)
    const shade = this.add.graphics();
    hGradient(shade, left, 0, 620, H, 0x080604, [
      [0, 0.92],
      [0.7, 0.7],
      [1, 0],
    ]);
    hGradient(shade, right - 640, 0, 640, H, 0x080604, [
      [0, 0],
      [0.22, 0.72],
      [1, 0.93],
    ]);
    vGradient(shade, left, 0, right - left, 120, 0x080604, [
      [0, 0.85],
      [1, 0],
    ]);
    L.add(shade);
    // Üst sol: harita adı + bölge, durak, mod, zorluk, altın (Menu sağ üstte DOM)
    const title = elText(this, left + SIDE.left, 40, this.map.title, 30, '#ffffff', { em: 0.12 }).setOrigin(0, 0.5).setTint(0xfbe7b0, 0xfbe7b0, 0xc7984f, 0xc7984f);
    L.add(title);
    const region = this.map.regions.find((r) => r.id === node(this.map, s.at).region);
    const diff = CONFIG.difficulties[s.difficulty]?.name ?? s.difficulty;
    const info = `${region ? region.title : ''}  ·  Stop ${stopNumber(s)} / ${this.map.stopsPerRun}  ·  ${s.mode === 'ironman' ? 'Ironman' : 'Normal'}  ·  ${diff}`;
    L.add(elBody(this, title.x + title.width + 4, 42, info, 19, s.mode === 'ironman' ? EL.BAD : EL.MUTED).setOrigin(0, 0.5));
    // Altın
    L.add(this.coin(left + SIDE.left + 8, 86)); // boyalı altın yığını (assets/ui-icons/gold.png), yoksa kodla çizilen sikke
    L.add(elText(this, left + SIDE.left + 24, 86, `${s.gold}`, 19, EL.ON, { em: 0.04 }).setOrigin(0, 0.5));
    L.add(elBody(this, left + SIDE.left + 24 + String(s.gold).length * 14 + 12, 87, 'gold', 16, EL.MUTED).setOrigin(0, 0.5));
    // Küçük ekranda sağ üstteki DOM simgeleri (Menu, tam ekran, codex) görece büyür: kart onların altından başlar
    const compact = this.compact();
    this.renderParty(left + SIDE.left, SIDE.top);
    this.renderNodeCard(right - SIDE.left - SIDE.cardW, compact ? 215 : SIDE.top, SIDE.cardW);
    this.renderControls();
    this.renderLegend();
    if (session.notice) {
      this.toast(session.notice);
      session.notice = '';
    }
  }

  /** Kısa / dar ekran (telefon yatay): dokunma hedefleri büyür, kart DOM simgelerinin altına iner. */
  private compact(): boolean {
    const c = document.documentElement.classList;
    return c.contains('compact') || c.contains('short');
  }

  /** Bağlantı düğmesinin ikonu (boyalı arayüz ikonu varsa doku anahtarı; yoksa ikonsuz). */
  private linkIcon(k: UiIconKind): { icon?: string } {
    return hasUiImage(k) ? { icon: ensureIcon(this, uiIconName(k), '#e8c47e', false) } : {};
  }

  private coin(x: number, y: number): Phaser.GameObjects.GameObject {
    if (hasUiImage('gold')) return this.add.image(x + 2, y, ensureIcon(this, uiIconName('gold'), '#e8c47e', false)).setDisplaySize(26, 26);
    const g = this.add.graphics();
    g.fillStyle(0x3a2a10, 1).fillCircle(x, y, 8);
    g.fillStyle(0xc8902e, 1).fillCircle(x, y, 7);
    g.fillStyle(0xffe9a8, 0.9).fillCircle(x - 2, y - 2, 3);
    return g;
  }

  /** Sol sütun: "Your party · n / 4", kahraman satırları (dokun = kahraman paneli), Formation · Gear. */
  private renderParty(x: number, y: number): void {
    const L = this.hud;
    const team = activeHeroes(this.s);
    const lead = leaderOf(this.s);
    const w = SIDE.partyW;
    L.add(elText(this, x, y, `Your party · ${team.length}`, 14, 'rgba(217,178,106,0.85)', { em: 0.24 }).setOrigin(0, 0.5));
    const ln = this.add.graphics();
    fadeLine(ln, x, x + w, y + 18, EL.GOLD, 0.45, 'out');
    L.add(ln);
    team.forEach((h, i) => {
      const def = content.classes[h.class];
      if (!def) return;
      const ry = y + 44 + i * 112;
      const row = this.add.container(x, ry);
      const pic = this.add.graphics();
      pic.fillStyle(0x120c08, 1).fillRect(0, 0, 92, 92);
      const frame = this.add.graphics();
      const drawFrame = (on: boolean) => {
        frame.clear();
        frame.lineStyle(1, on ? EL.ON_N : EL.GOLD, on ? 1 : EL.LINE.a3).strokeRect(0.5, 0.5, 91, 91);
      };
      drawFrame(false);
      const face = classAvatar(this, def, 46, 46, 90);
      const badge = elBadge(this, 'gold', 13);
      badge.c.setPosition(90, 88);
      badge.set(h.level, false);
      const name = fitW(elText(this, 112, 18, def.name, 19, EL.ON, { em: 0.05 }).setOrigin(0, 0.5), w - 120);
      const role = fitW(elBody(this, 112, 44, `${def.role ?? ''}${lead?.id === h.id ? ' · Leader' : ''}`, 16, EL.MUTED).setOrigin(0, 0.5), w - 120);
      const bar = hpBar(this, 112, 64, w - 130, 6, h.hpRatio);
      const hp = elBody(this, 112, 82, session.showHp ? `${Math.round(h.hpRatio * 100)}% health` : '', 14, EL.DIM).setOrigin(0, 0.5);
      row.add([pic, face, frame, badge.c, name, role, bar, hp]);
      if (lead?.id === h.id) row.add(crown(this, 14, 14, 0.55));
      const zone = this.add.zone(w / 2, 46, w + 8, 104).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        drawFrame(true);
        this.tweens.add({ targets: row, x: x + 6, duration: 180, ease: EL.EASE });
      });
      zone.on('pointerout', () => {
        drawFrame(false);
        this.tweens.add({ targets: row, x, duration: 180, ease: EL.EASE });
      });
      zone.on('pointerup', () => !this.drag.moved && this.openHero(h.id));
      row.add(zone);
      L.add(row);
    });
    const ly = y + 44 + team.length * 112 + 16;
    if (team.length) {
      const f = elLink(this, 'Formation', () => this.openFormationFromHud(), { size: 19, ...this.linkIcon('formation') });
      f.root.setPosition(x - 6, ly);
      const sep = elText(this, x - 6 + f.width + 8, ly, '◆', 12, 'rgba(217,178,106,0.35)', { em: 0 }).setOrigin(0.5);
      const g = elLink(this, 'Gear', () => this.canOpenSide() && this.openGear(), { size: 19, ...this.linkIcon('gear') });
      g.root.setPosition(x - 6 + f.width + 16, ly);
      L.add([f.root, sep, g.root]);
      L.add(elBody(this, x, ly + 40, 'Tap a hero for level, gear and stats.', 16, EL.DIM).setOrigin(0, 0.5));
    }
  }

  /**
   * Sağ sütun (sol takım sütununun aynası, Ömer 2026-10-09): aynı başlık ("You are here" + ince çizgi), düğüm satırı (92 px glif karosu +
   * Cinzel ad + Garamond alt yazı, kahraman satırı gibi), düşmanlar, "Then" satırı ve eylemler kutusuz yazı düğmeleri: birincil eylem
   * (March / Fight / Enter) büyük, kor elmaslı ve açık altın; Formation sol sütundaki gibi küçük yazı düğmesi.
   */
  private renderNodeCard(x: number, y: number, w: number): void {
    const L = this.hud;
    const s = this.s;
    const step = nextStep(s);
    this.ensureSelection(step);
    const id = this.sel;
    L.add(elText(this, x, y, id === s.at ? 'You are here' : 'Selected road', 14, 'rgba(217,178,106,0.85)', { em: 0.24 }).setOrigin(0, 0.5));
    const ln = this.add.graphics();
    fadeLine(ln, x, x + w, y + 18, EL.GOLD, 0.45, 'out');
    L.add(ln);
    if (!id) return;
    const n = node(this.map, id);
    const vis = nodeVisibility(this.map, s, session.revealFog)[id];
    const option = step.kind === 'move' && step.options.includes(id);
    // Düğüm satırı: kahraman satırıyla aynı ölçüler (92 px karo, ad 19, alt yazı 16)
    let cy = y + 44;
    const tile = this.add.graphics();
    tile.fillStyle(0x120c08, 1).fillRect(x, cy, 92, 92).lineStyle(1, EL.GOLD, EL.LINE.a3).strokeRect(x + 0.5, cy + 0.5, 91, 91);
    tile.fillStyle(0x140e09, 0.95).fillCircle(x + 46, cy + 46, 30).lineStyle(1, EL.GOLD, 0.7).strokeCircle(x + 46, cy + 46, 30);
    L.add(tile);
    const tileArt = nodeGlyphImage(this, n.type, x + 46, cy + 46, 56);
    if (tileArt) L.add(tileArt);
    else drawNodeGlyph(tile, n.type, EL.ON_N, 1.25, x + 46, cy + 46);
    L.add(fitW(elText(this, x + 112, cy + 18, n.name, 19, EL.ON, { em: 0.05 }).setOrigin(0, 0.5), w - 120));
    const state = id === s.at ? 'You are here' : vis === 'cleared' ? 'Cleared' : option ? 'Reachable' : vis === 'closed' ? 'Road closed' : vis === 'goal' ? 'Your goal' : 'Ahead';
    L.add(fitW(elBody(this, x + 112, cy + 44, n.subtitle || TYPE_LABEL[n.type], 16, EL.MUTED).setOrigin(0, 0.5), w - 120));
    L.add(fitW(elBody(this, x + 112, cy + 70, state, 16, id === s.at || option ? EL.NOTE : EL.DIM).setOrigin(0, 0.5), w - 120));
    cy += 112;
    // Düşmanlar (avatar sırası + adlar)
    if (n.encounter && vis !== 'goal') {
      const p = enemyPreview(n.encounter);
      const faces = p.classes.map((c) => content.classes[c]).filter((d): d is NonNullable<typeof d> => !!d).slice(0, 6);
      if (faces.length) {
        L.add(elText(this, x, cy + 4, 'Foes', 13, 'rgba(217,178,106,0.85)', { em: 0.22 }).setOrigin(0, 0.5));
        cy += 22;
      }
      faces.forEach((d, i) => {
        const fx = x + i * 62;
        const fr = this.add.graphics();
        fr.fillStyle(0x120c08, 1).fillRect(fx, cy, 54, 54).lineStyle(1, EL.GOLD, EL.LINE.a2).strokeRect(fx + 0.5, cy + 0.5, 53, 53);
        L.add(fr);
        L.add(classAvatar(this, d, fx + 27, cy + 27, 52, true));
      });
      if (faces.length) cy += 66;
      const leader = p.leader && !p.names.includes(p.leader) ? `  (led by ${p.leader})` : '';
      const t = elBody(this, x, cy, `${p.names.join(', ')}${leader}`, 17, EL.NOTE, true, w);
      L.add(t);
      cy += t.height + 12;
    } else if (vis !== 'goal') {
      const blurb = n.type === 'town' ? 'Rest, recruit and trade. Your heroes recover here.' : n.type === 'treasure' ? 'A cache of gear and gold.' : n.type === 'event' ? 'A crossroads encounter.' : '';
      if (blurb) {
        const t = elBody(this, x, cy, blurb, 17, EL.NOTE, true, w);
        L.add(t);
        cy += t.height + 12;
      }
    }
    // Sonraki duraklar
    const after = outgoing(this.map, id).map((a) => node(this.map, a));
    if (after.length && vis !== 'goal') {
      const row = this.add.graphics();
      fadeLine(row, x, x + w, cy + 2, EL.GOLD, EL.LINE.a2, 'out');
      L.add(row);
      L.add(elText(this, x, cy + 22, 'Then', 13, 'rgba(217,178,106,0.85)', { em: 0.22 }).setOrigin(0, 0.5));
      const t = elBody(this, x + 70, cy + 12, after.map((a) => `${a.name} (${TYPE_LABEL[a.type]})`).join(' or '), 17, EL.TXT, false, w - 70);
      L.add(t);
      cy += Math.max(30, t.height) + 22;
    }
    // Eylemler: kutusuz yazı düğmeleri (sol sütundaki Formation · Gear dili); birincil eylem büyük, kor elmaslı
    const busy = () => !!this.modal || !!this.pauseMenu || !!this.walking || this.drag.moved;
    let primary: { label: string; run: () => void } | null = null;
    if (option) primary = { label: 'March', run: () => this.chooseRoad(id) };
    else if (id === s.at && step.kind === 'battle') primary = { label: 'Fight', run: () => startCampaignBattle(this) };
    else if (id === s.at && this.actionHere()) primary = { label: step.kind === 'complete' ? 'Campaign end' : 'Enter', run: () => this.advance() };
    const formation = (option || (id === s.at && step.kind === 'battle')) && activeHeroes(s).length > 0;
    let by = cy + 26;
    if (primary) {
      const run = primary.run;
      const pl = elLink(this, primary.label, () => !busy() && run(), { size: 28, isBusy: busy });
      pl.root.setPosition(x - 6, by);
      pl.text.setColor(EL.ON);
      pl.text.setShadow(0, 0, EL.SH_GLOW, 12, false, true);
      const dia = elDiamond(this, 7).setPosition(x - 6 + 11, by);
      const under = this.add.graphics();
      fadeLine(under, x, x + Math.max(pl.width + 30, 200), by + 28, EL.EMBER2, 0.55, 'out');
      L.add([under, pl.root, dia]);
      by += 64;
    }
    if (formation) {
      const f = elLink(this, 'Formation', () => !busy() && this.openFormationFromHud(), { size: 19, isBusy: busy, ...this.linkIcon('formation') });
      f.root.setPosition(x - 6, by);
      L.add(f.root);
      by += 46;
    }
    if (id === s.at && step.kind === 'battle' && activeHeroes(s).some((h) => h.hpRatio < 1)) {
      L.add(elBody(this, x, by - 4, 'Your heroes start with the health they carried from the last fight.', 16, EL.DIM, true, w));
    }
  }

  /** Kartta gösterilecek düğüm: geçerli seçim korunur; yoksa (mevcut düğümde eylem varsa) mevcut düğüm, yoksa ilk gidilebilir yol. */
  private ensureSelection(step: NextStep): void {
    const vis = nodeVisibility(this.map, this.s, session.revealFog);
    if (this.sel && vis[this.sel] && vis[this.sel] !== 'fog') {
      const stale = this.sel !== this.s.at && step.kind !== 'move' && vis[this.sel] !== 'cleared' && vis[this.sel] !== 'goal';
      if (!stale) return;
    }
    if (step.kind === 'move') this.sel = step.options[0] ?? this.s.at;
    else this.sel = this.s.at;
  }

  /** Alt orta: ◂ ▸ (kaydır) − + (yakınlaştır); dokunma alanı >= 56 px. */
  private renderControls(): void {
    // Telefonda dokunma hedefi >= 44 gerçek px: düğmeler büyür
    const size = this.compact() ? 92 : 52;
    const step = size + 12;
    const y = H - 18 - size / 2;
    const mk = (label: string, x: number, run: () => void) => {
      const b = elIconButton(this, { label }, () => !this.modal && !this.pauseMenu && run(), { size });
      b.root.setPosition(x, y);
      this.hud.add(b.root);
      return b.root;
    };
    this.panBtns.left = mk('◂', W / 2 - 60 - step, () => this.panBy(-PAN_STEP, 0));
    this.panBtns.right = mk('▸', W / 2 - 60, () => this.panBy(PAN_STEP, 0));
    this.panBtns.minus = mk('−', W / 2 + 60, () => this.setMapZoom(this.mapZoom - MAP_ZOOM.step));
    this.panBtns.plus = mk('+', W / 2 + 60 + step, () => this.setMapZoom(this.mapZoom + MAP_ZOOM.step));
    this.hud.add(elText(this, W / 2, y, 'Map', 12, EL.DIM, { em: 0.24 }).setOrigin(0.5));
    this.updatePanButtons();
  }

  /** Mevcut düğümde dokunarak açılacak bir eylem var mı (savaş, kasaba, olay, hazine, sefer sonu). */
  private actionHere(): boolean {
    return ['battle', 'town', 'event', 'treasure', 'complete'].includes(nextStep(this.s).kind);
  }

  /** Lejant (sağ alt, katlanabilir): 6 düğüm türü, kit paneli. */
  private renderLegend(): void {
    const L = this.hud;
    const w = 300;
    const x = stageView.right - SIDE.left - w; // sağ alt (Ömer 2026-10-09; görünür DEBUG düğmesi yok)
    const open = this.legendOpen;
    const h = open ? 156 : 48;
    const y = H - 24 - h;
    L.add(elPanel(this, x, y, w, h, { alpha: 0.88 }));
    L.add(elText(this, x + 18, y + 24, 'Legend', 14, 'rgba(217,178,106,0.85)', { em: 0.24 }).setOrigin(0, 0.5));
    L.add(elBody(this, x + w - 18, y + 24, open ? 'hide' : 'show', 16, EL.MUTED).setOrigin(1, 0.5));
    const hit = this.add.zone(x + w / 2, y + 24, w, 52).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      this.legendOpen = !this.legendOpen;
      this.renderHud();
    });
    L.add(hit);
    if (!open) return;
    const types: NodeType[] = ['battle', 'elite', 'boss', 'town', 'treasure', 'event'];
    types.forEach((t, i) => {
      const cx = x + 32 + (i % 2) * 140;
      const cy = y + 64 + Math.floor(i / 2) * 32;
      const g = this.add.graphics();
      g.fillStyle(0x140e09, 1).fillCircle(cx, cy, 12).lineStyle(1, EL.GOLD, 0.7).strokeCircle(cx, cy, 12);
      L.add(g);
      const legendArt = nodeGlyphImage(this, t, cx, cy, 26);
      if (legendArt) L.add(legendArt);
      else drawNodeGlyph(g, t, 0xd9c8a2, 0.5, cx, cy);
      L.add(elBody(this, cx + 20, cy, TYPE_LABEL[t], 17, EL.TXT, false).setOrigin(0, 0.5));
    });
  }

  private toast(text: string): void {
    this.toastFn?.(text);
  }

  // ------------------------------------------------------------ akış

  private refresh(animateFog = true): void {
    this.renderMap(animateFog);
    this.renderHud();
  }

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
    this.sideOpen = false;
  }

  private update2(s: CampaignState): void {
    setState(s);
  }

  /** Gear ekranını açar (kahraman paneli / takım sütunu / kasaba / Spoils / teslim kartından). Kapanınca HUD yenilenir, `after` çağrılır. */
  openGear(hero?: string, tutorial = false, after?: () => void): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    if (legendaryPreviewWanted()) setState(grantAllLegendaries(this.s)); // ?legendary=1 önizlemesi (madde 296)
    openGearScreen(root, {
      get: () => this.s,
      set: (s) => setState(s),
      ...(hero ? { hero } : {}),
      tutorial,
      onClose: () => {
        this.renderHud();
        after?.();
      },
    });
  }

  /**
   * Bekleyen kartlar (madde 280): önce "Spoils" (zafer / sandık loot'u), sonra Ashford teslimi (yeni bölük kurulduktan sonra; item takma
   * tutorial'ı). Bir kart açıldıysa true: kart kapanınca advance yeniden çağrılır.
   */
  private showPendingCards(): boolean {
    const root = document.getElementById('ui-root');
    if (!root) return false;
    const s = this.s;
    if (s.pendingLoot) {
      showSpoils(root, {
        get: () => this.s,
        set: (x) => setState(x),
        // Geride kalan yoksa kart kapanır; varsa Gear'dan dönünce kart yeniden açılır (yer açıp almak için; madde 280)
        gear: () => {
          if (!this.s.pendingLoot?.left?.length) setState(acknowledgeLoot(this.s));
          this.openGear(undefined, false, () => this.advance());
        },
        done: () => {
          setState(acknowledgeLoot(this.s));
          this.advance();
        },
      });
      return true;
    }
    if (s.pendingHandover && !FORCED.includes(nextStep(s).kind)) {
      showHandover(root, s, {
        equip: () => {
          setState(acknowledgeHandover(this.s));
          this.openGear(undefined, true, () => this.advance());
        },
        later: () => {
          setState(acknowledgeHandover(this.s));
          this.advance();
        },
      });
      return true;
    }
    return false;
  }

  /** Sıradaki adıma göre ekranı kurar (pencere ya da sağdaki düğüm kartı). */
  advance(): void {
    this.closeModal();
    if (this.showPendingCards()) return;
    const s = this.s;
    const step = nextStep(s);
    // İpucu kartı yalnızca pencere açılmayan adımlarda (savaş / yol seçimi); diğerlerinde pencere kapanınca gelir
    if (step.kind === 'battle' || step.kind === 'move') this.showTip();
    else {
      this.tip?.destroy(true);
      this.tip = null;
    }
    switch (step.kind) {
      case 'hero':
        return this.pickHeroModal();
      case 'recruit':
      case 'volunteer':
        return this.recruitModal(step);
      case 'farewell':
        this.modal = openModal(this, this.ui, {
          title: 'Farewell',
          text: CONFIG.texts.farewell,
          height: 520,
          buttons: [
            {
              label: 'Continue',
              primary: true,
              run: () => {
                session.tutorialClasses = this.s.roster.filter((h) => h.tutorial).map((h) => h.class);
                this.commit(farewell(this.s));
              },
            },
          ],
        });
        this.addFarewellFaces();
        return;
      case 'company':
        return this.companyModal(step.size);
      case 'town':
        this.modal = openModal(this, this.ui, {
          title: node(this.map, step.node).name,
          subtitle: node(this.map, step.node).subtitle,
          text: CONFIG.texts.townRest,
          height: 460,
          buttons: [
            { label: 'Formation', run: () => this.openFormation() },
            { label: 'Gear', run: () => this.openGear() },
            { label: 'Leave', primary: true, run: () => this.commit(completeSimple(this.s, 'town')) },
          ],
        });
        return;
      case 'event': {
        const e = EVENTS[step.event] ?? { title: node(this.map, step.node).name, text: 'Nothing happens.' };
        this.modal = openModal(this, this.ui, { title: e.title, subtitle: node(this.map, step.node).subtitle, text: e.text, height: 500, buttons: [{ label: 'Continue', primary: true, run: () => this.commit(completeSimple(this.s, 'event')) }] });
        return;
      }
      case 'treasure': {
        const t = TREASURES[step.treasure] ?? { title: 'Treasure', text: 'You find a chest.', reward: 'Open the chest to claim its gear and gold.' };
        this.modal = openModal(this, this.ui, { title: 'Treasure', subtitle: t.title, text: `${t.text}\n\n${t.reward ?? ''}`, height: 500, buttons: [{ label: 'Open the chest', primary: true, run: () => this.commit(completeSimple(this.s, 'treasure')) }] });
        return;
      }
      case 'complete':
        this.modal = openModal(this, this.ui, {
          title: 'Valdoria Conquered',
          subtitle: 'Campaign Complete',
          text: `${CONFIG.texts.complete}\n\n${s.stats.victories} victories, ${s.stats.defeats} defeats.`,
          height: 520,
          buttons: [
            { label: 'Stay on the map', run: () => this.closeModal() },
            { label: 'Main Menu', primary: true, run: () => elGo(this, MENU_SCENE) },
          ],
        });
        return;
      default:
        // battle / move: sağdaki düğüm kartı (Fight / March) ve nabız atan düğüm
        this.renderHud();
        return;
    }
  }

  /** Yeni durumu kaydeder, haritayı yeniler, sonraki adıma geçer. */
  private commit(s: CampaignState): void {
    this.update2(s);
    this.closeModal();
    this.placeCaravan(s.at);
    this.refresh(true);
    this.advance();
  }

  /** İpucu kartı (kit paneli; alt ortada, harita düğmelerinin üstünde; sağ üstte kapama). */
  private showTip(): void {
    this.tip?.destroy(true);
    this.tip = null;
    const text = pendingTip(this.s);
    if (!text) return;
    const c = this.add.container(0, 0);
    this.tip = c;
    this.ui.add(c);
    const w = 760;
    const body = elBody(this, 0, 0, text, 20, EL.NOTE, true, w - 110);
    const h = Math.max(84, body.height + 52);
    const x = W / 2 - w / 2;
    const y = H - (this.compact() ? 140 : 96) - h;
    c.add(elPanel(this, x, y, w, h, { alpha: 0.92 }));
    c.add(elText(this, x + 24, y + 22, 'Tip', 13, 'rgba(217,178,106,0.85)', { em: 0.24 }).setOrigin(0, 0.5));
    body.setPosition(x + 24, y + 38);
    c.add(body);
    const close = elLink(this, '×', () => this.dismissTip(), { size: 22 });
    close.root.setPosition(x + w - 58, y + 24);
    c.add(close.root);
  }

  private dismissTip(): void {
    if (!this.tip) return;
    setState(markTipSeen(this.s));
    this.tip.destroy(true);
    this.tip = null;
  }

  /**
   * Düğüme dokunma: kartta gösterilir. Seçili gidilebilir düğüme ya da eylem bekleyen mevcut düğüme ikinci dokunuş = kartın ana eylemi
   * (March / Fight / Enter); telefonda kısayol. Sisli düğüm yok sayılır.
   */
  private onNodeTap(id: string, v: NodeVis): void {
    if (v === 'fog') return;
    const step = nextStep(this.s);
    const again = this.sel === id;
    this.sel = id;
    this.renderMap(false);
    this.renderHud();
    if (!again) return;
    if (step.kind === 'move' && step.options.includes(id)) return this.chooseRoad(id);
    if (id === this.s.at && step.kind === 'battle') return void startCampaignBattle(this);
    if (id === this.s.at && this.actionHere()) return this.advance();
  }

  /** Yol seçimi: tek yol ise doğrudan yürür; seçim noktasında onay sorar (diğer yollar kapanır). */
  private chooseRoad(id: string): void {
    const step = nextStep(this.s);
    if (step.kind !== 'move' || !step.options.includes(id)) return;
    if (step.options.length === 1) return this.march(id);
    this.modal = openModal(this, this.ui, {
      title: 'Take this road?',
      text: `${node(this.map, id).name}. The other roads will close for this journey.`,
      fit: true,
      buttons: [
        { label: 'No', run: () => this.closeModal() },
        { label: 'Yes', primary: true, run: () => this.march(id) },
      ],
      onDismiss: () => this.closeModal(), // onay: zemin = No
    });
  }

  private march(to: string): void {
    this.closeModal();
    const from = this.s.at;
    const before = node(this.map, from).region;
    this.update2(moveTo(this.s, to));
    this.tip?.destroy(true);
    this.tip = null;
    this.sel = to;
    this.walk(from, to, () => {
      this.refresh(true);
      const region = node(this.map, to).region;
      if (region !== before) this.regionBanner(region);
      this.advance();
    });
  }

  private regionBanner(regionId: string): void {
    const r = this.map.regions.find((x) => x.id === regionId);
    if (!r) return;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    const g = this.add.graphics();
    hGradient(g, FULL_X0, H / 2 - 80, FULL_W, 160, 0x0a0705, [
      [0, 0],
      [0.3, 0.85],
      [0.7, 0.85],
      [1, 0],
    ]);
    fadeLine(g, W / 2 - 420, W / 2, H / 2 - 80, EL.GOLD, 0.5, 'in');
    fadeLine(g, W / 2, W / 2 + 420, H / 2 - 80, EL.GOLD, 0.5, 'out');
    fadeLine(g, W / 2 - 420, W / 2, H / 2 + 80, EL.GOLD, 0.5, 'in');
    fadeLine(g, W / 2, W / 2 + 420, H / 2 + 80, EL.GOLD, 0.5, 'out');
    c.add(g);
    c.add(elText(this, W / 2, H / 2 - 18, r.title, 50, '#ffffff', { em: 0.12 }).setOrigin(0.5).setTint(0xfbe7b0, 0xfbe7b0, 0xc7984f, 0xc7984f));
    c.add(elBody(this, W / 2, H / 2 + 38, r.tagline, 24, EL.NOTE).setOrigin(0.5));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 350, yoyo: true, hold: 1600, onComplete: () => c.destroy(true) });
  }

  // ------------------------------------------------------------ kahraman paneli ve dizilim

  /** Yan panel açılabilir mi: yürürken, menü açıkken ya da zorunlu bir seçim penceresi varken açılmaz. */
  private canOpenSide(): boolean {
    if (this.walking || this.pauseMenu) return false;
    if (this.modal && FORCED.includes(nextStep(this.s).kind)) return false;
    return true;
  }

  private openHero(heroId: string): void {
    if (!this.canOpenSide()) return;
    this.closeModal();
    this.sideOpen = true;
    this.modal = openHeroPanel(this, this.ui, heroId, {
      get: () => this.s,
      gear: (id) => {
        this.closeModal();
        this.openGear(id, false, () => this.openHero(id));
      },
      formation: () => this.openFormation(),
      close: () => {
        this.closeModal();
        this.renderHud();
      },
    });
  }

  private openFormationFromHud(): void {
    if (!this.canOpenSide()) return;
    this.openFormation();
  }

  /** Dizilim penceresi (sürükle ya da dokun-dokun; Auto arrange). Kapanınca harita kalır (önceki kart yeniden açılmaz). */
  private openFormation(): void {
    this.closeModal();
    this.sideOpen = true;
    this.modal = openFormation(this, this.ui, {
      get: () => this.s,
      move: (heroId, cell) => setState(moveHero(this.s, heroId, cell)),
      auto: () => setState(autoFormation(this.s)),
      done: () => {
        this.closeModal();
        this.renderHud();
        this.placeCaravan(this.s.at);
      },
      toUi: (p) => this.uiPoint(p),
      heroPanel: (id) => this.openHero(id),
    });
  }

  // ------------------------------------------------------------ pencereler: kahraman, aday, veda, yeni takım

  private classGrid(ids: string[], area: { x: number; y: number; w: number; h: number }, onTap: (id: string) => void, root: Phaser.GameObjects.Container, tag?: (id: string) => string | undefined) {
    const cols = Math.min(ids.length, 6);
    const rows = Math.ceil(ids.length / cols);
    const cw = Math.min(190, (area.w - 20) / cols - 14);
    const ch = Math.min(230, (area.h - 10) / rows - 14);
    const cards = new Map<string, ReturnType<typeof classCard>>();
    ids.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, ids.length - r * cols);
      const col = i % cols;
      const x = W / 2 + (col - (inRow - 1) / 2) * (cw + 14);
      const y = area.y + ch / 2 + r * (ch + 14);
      const card = classCard(this, x, y, cw, ch, id, { tag: tag?.(id), onTap: () => onTap(id) });
      root.add(card.container);
      cards.set(id, card);
    });
    return cards;
  }

  private sorted(pool: string[]): string[] {
    return sortByPrimary(pool.map((id) => ({ id, name: content.classes[id]?.name ?? id, primary: content.classes[id]?.primary }))).map((c) => c.id);
  }

  private pickHeroModal(): void {
    let chosen = '';
    const m = openModal(this, this.ui, {
      title: 'Choose your hero',
      text: CONFIG.texts.intro,
      width: 1500,
      height: 900,
      y: 90,
      buttons: [
        {
          label: 'Begin the journey',
          primary: true,
          run: () => {
            if (!chosen) return this.toast('Pick a hero first.');
            this.update2(pickHero(this.s, chosen));
            markJourneyStart();
            this.commit(this.s);
          },
        },
      ],
    });
    this.modal = m;
    const cards = this.classGrid(this.sorted(CONFIG.starterPool), m.area, (id) => {
      chosen = id;
      cards.forEach((c, k) => {
        c.setSelected(k === id);
        c.setLeader(k === id);
      });
    }, m.root);
  }

  private recruitModal(step: Extract<NextStep, { kind: 'recruit' | 'volunteer' }>): void {
    let chosen = '';
    const m = openModal(this, this.ui, {
      title: step.kind === 'volunteer' ? 'A Volunteer' : 'A New Companion',
      text: step.kind === 'volunteer' ? CONFIG.texts.volunteer : CONFIG.texts.recruitBefore,
      width: 1100,
      height: 660,
      buttons: [
        {
          label: 'Join us',
          primary: true,
          run: () => {
            if (!chosen) return this.toast('Pick one companion first.');
            this.commit(recruit(this.s, chosen));
          },
        },
      ],
    });
    this.modal = m;
    const cards = this.classGrid(step.offer, m.area, (id) => {
      chosen = id;
      cards.forEach((c, k) => c.setSelected(k === id));
    }, m.root, (id) => (isAreaClass(id) && node(this.map, step.node).recruit?.requireArea ? 'Area attacks' : undefined));
  }

  private addFarewellFaces(): void {
    if (!this.modal) return;
    const team = activeHeroes(this.s);
    team.forEach((h, i) => {
      const def = content.classes[h.class]!;
      const x = W / 2 + (i - (team.length - 1) / 2) * 120;
      this.modal!.root.add(classAvatar(this, def, x, this.modal!.area.y + 70, 96));
      this.modal!.root.add(classLogoBadge(this, def, x - 36, this.modal!.area.y + 106, 14));
    });
  }

  private companyModal(size: number): void {
    const picks: string[] = [];
    let leader = 0;
    // Tutorial'da oynanan sınıflar (veda ettiler; yine seçilebilir): "Played in the tutorial" etiketi
    const tutorialClasses = new Set(session.tutorialClasses);
    const m = openModal(this, this.ui, {
      title: 'Form your company',
      subtitle: `Choose ${size} heroes. The first one you pick leads the company (tap a chosen hero again to make them the leader).`,
      width: 1500,
      height: 900,
      y: 90,
      buttons: [
        {
          label: 'Set out',
          primary: true,
          run: () => {
            if (picks.length !== size) return this.toast(`Pick ${size} heroes.`);
            this.commit(formCompany(this.s, picks, leader));
          },
        },
      ],
    });
    this.modal = m;
    const counter = elBody(this, W / 2, m.area.y + m.area.h - 40, '', 22, EL.ON).setOrigin(0.5, 0);
    m.root.add(counter);
    const update = () => {
      cards.forEach((c, k) => {
        c.setSelected(picks.includes(k));
        c.setLeader(picks[leader] === k);
      });
      counter.setText(`${picks.length} / ${size} chosen${picks.length ? `  ·  Leader: ${content.classes[picks[leader]!]?.name}` : ''}`);
    };
    const cards = this.classGrid(this.sorted(CONFIG.companyPool), { ...m.area, h: m.area.h - 20 }, (id) => {
      const i = picks.indexOf(id);
      if (i < 0) {
        if (picks.length >= size) return this.toast(`You already have ${size} heroes. Tap one to remove it.`);
        picks.push(id);
      } else if (i !== leader) leader = i; // seçili ama lider değil: lider yap
      else {
        picks.splice(i, 1); // liderse: çıkar
        leader = 0;
      }
      update();
    }, m.root, (id) => (tutorialClasses.has(id) ? 'Played in the tutorial' : undefined));
    update();
  }
}
