import Phaser from 'phaser';
import { content } from '../../engine';
import {
  CONFIG,
  EVENTS,
  TREASURES,
  activeHeroes,
  autoFormation,
  canSaveManually,
  completeSimple,
  edgeVisibility,
  enemyPreview,
  farewell,
  formCompany,
  getMap,
  heroById,
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
import { campaignArtKey, hasCampaignArt, preloadCampaignArt } from '../campaign-art';
import { H, W, classCard, crown, hpBar, openModal, parchmentPlate, type Modal } from '../campaign-ui';
import { MENU_SCENE, current, markJourneyStart, save, session, setState, startCampaignBattle, storage } from '../campaign-session';
import { classAvatar, classLogoBadge, ensureGlow, goldText, makeMenuButton, serif } from '../menu-ui';
import { GOLD, SERIF, makePanel } from '../ui-frame';
import { sortByPrimary } from '../class-order';
import { debugState } from '../debug-state';
import { isSettingsOpen, setSettingsOpen } from '../../ui/settings';

/**
 * Sefer haritası (campaign.md 6): arka plan görseli, yollar (düz = tek yol, kesik = seçimli) ve altlarında boyalı toprak izi, düğüm rozetleri,
 * parşömen etiketler, bölge başlıkları, lejant, sis; lider önde, takımın silüetleri arkada yol boyunca yürür (dokununca atlanır).
 * Kurallar src/campaign/ içindedir; bu sahne yalnızca çizer ve oyuncunun seçimlerini kurallara iletir.
 * İki kamera: ana kamera haritayı (yakınlaştırma 1-1,5x, sürükleyerek kaydırma), arayüz kamerası sabit katmanı gösterir.
 */

const TYPE_COLOR: Record<NodeType, number> = { town: 0x3b5f86, battle: 0x6b4a33, elite: 0x8e2a22, event: 0x4a3f8f, treasure: 0x9a7a2a, boss: 0xa3191c };
const TYPE_LABEL: Record<NodeType, string> = { town: 'Town / City', battle: 'Battle', elite: 'Elite', event: 'Event', treasure: 'Treasure', boss: 'Boss' };
const BADGE_R = 38;
const ZOOM_MAX = 1.5;
const WALK_SPEED = 320; // px/sn
const FOLLOW_GAP = 55; // px

type Pt = { x: number; y: number };

export class CampaignMapScene extends Phaser.Scene {
  static readonly KEY = 'CampaignMapScene';

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
  private tip: Phaser.GameObjects.Container | null = null;
  private dashT = 0;
  private drag = { down: false, moved: false, x: 0, y: 0 };
  private legendOpen = true;

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
    this.tip = null;
  }

  preload(): void {
    preloadAssets(this);
    preloadCampaignArt(this);
  }

  create(): void {
    if (!current()) {
      // ?campaign=1 (geliştirme) ya da kayıtsız açılış: yeni Normal sefer
      setState(newCampaign({ mode: 'normal', seed: Math.floor(Date.now() % 1_000_000_000) }));
    }
    this.map = getMap(this.s.mapId);
    this.cameras.main.setBackgroundColor('#0b0705');
    this.world = this.add.container(0, 0);
    this.ui = this.add.container(0, 0).setDepth(1000);
    this.uiCam = this.cameras.add(0, 0, W, H);
    this.cameras.main.ignore(this.ui);
    this.uiCam.ignore(this.world);
    this.cameras.main.setBounds(0, 0, W, H);

    this.drawTerrain();
    this.dyn = this.add.container(0, 0);
    this.world.add(this.dyn);
    this.renderMap(false);
    this.placeCaravan(this.s.at);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.renderHud();
    this.bindCamera();
    if (document.documentElement.classList.contains('compact') || document.documentElement.classList.contains('short')) {
      this.cameras.main.setZoom(ZOOM_MAX);
      this.centerOn(this.s.at);
    }
    this.events.on('update', (_t: number, dt: number) => this.animateDashes(dt));
    this.mountMenuButton();
    this.input.keyboard?.on('keydown-ESC', () => this.onEscape());
    this.advance();
  }

  // ------------------------------------------------------------ oyun menüsü (sağ üst Menu düğmesi / Esc)

  /** Sağ üstteki DOM simge sırasına (tam ekran / wiki / ayarlar) hizalı "Menu" düğmesi; sahne kapanınca kaldırılır. */
  private mountMenuButton(): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    root.querySelector('.campaign-menu-toggle')?.remove();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'settings-toggle campaign-menu-toggle';
    b.textContent = 'Menu';
    b.title = 'Menu (Esc)';
    b.setAttribute('aria-label', 'Menu');
    const fs = root.querySelector<HTMLElement>('.fullscreen-toggle');
    const fsShown = !!fs && !fs.hidden && getComputedStyle(fs).display !== 'none';
    Object.assign(b.style, {
      right: `calc(${fsShown ? 176 : 120}px + var(--sar, 0px))`,
      width: 'auto',
      minWidth: '76px',
      padding: '0 14px',
      color: '#f3e4c4',
      fontFamily: SERIF,
      fontWeight: 'bold',
      fontSize: '18px',
      letterSpacing: '1px',
    });
    b.addEventListener('click', () => this.toggleMenu());
    root.append(b);
    this.events.once('shutdown', () => {
      b.remove();
      setSettingsOpen(false);
    });
  }

  private toggleMenu(): void {
    if (this.pauseMenu) this.closeMenu();
    else this.openMenu();
  }

  private closeMenu(): void {
    this.pauseMenu?.close();
    this.pauseMenu = null;
  }

  /** Resume / Save (Normal) / Settings / Back to Main Menu. */
  private openMenu(): void {
    if (this.pauseMenu || this.walking) return;
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
    items.push({ label: 'Settings', run: () => { this.closeMenu(); setSettingsOpen(true); } });
    items.push({ label: 'Back to Main Menu', run: () => this.scene.start(MENU_SCENE) });
    const m = openModal(this, this.ui, { title: 'Menu', width: 640, height: 190 + items.length * 100 });
    items.forEach((it, i) => m.root.add(makeMenuButton(this, W / 2, m.area.y + 46 + i * 100, 460, 82, it.label, it.run, { primary: !!it.primary, size: it.primary ? 32 : 28 }).container));
    this.pauseMenu = m;
  }

  /** Esc: önce açık ayarlar paneli / menü / kart / ipucu kapanır; hiçbiri yoksa menü açılır. */
  private onEscape(): void {
    if (debugState.uiPaused) return; // wiki açık: Esc wiki'nindir
    if (isSettingsOpen()) return setSettingsOpen(false);
    if (this.pauseMenu) return this.closeMenu();
    if (this.walking) return this.walking.finish();
    const step = nextStep(this.s).kind;
    // zorunlu seçim pencereleri (kahraman, aday, veda, yeni takım) Esc ile kapanmaz: menü üstlerine açılır
    if (this.modal && !['hero', 'recruit', 'volunteer', 'farewell', 'company'].includes(step)) {
      this.closeModal();
      this.renderHud();
      return;
    }
    if (this.tip && !this.modal) return this.dismissTip();
    this.openMenu();
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
    const bg = this.map.background;
    if (hasCampaignArt(this, bg)) {
      const img = this.add.image(W / 2, H / 2, campaignArtKey(bg)).setDisplaySize(W, H);
      this.world.add(img);
    } else {
      const g = this.add.graphics();
      g.fillGradientStyle(0xd9c497, 0xd9c497, 0xb59a68, 0xb59a68, 1).fillRect(0, 0, W, H);
      this.world.add(g);
    }
    // Ashen Plain: arka planda kül rengi ova yok, kodla gri-kül ton
    const ash = this.map.nodes.find((n) => n.id === '10');
    if (ash) {
      const glow = ensureGlow(this);
      const a = this.add.image(ash.pos[0] * W, ash.pos[1] * H, glow).setTint(0x8a8580).setAlpha(0.55).setScale(4.2, 3);
      this.world.add(a);
    }
    // Yumuşak kenar karartması
    const v = this.add.graphics();
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.35, 0.35, 0, 0).fillRect(0, 0, W, 90);
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.4, 0.4).fillRect(0, H - 120, W, 120);
    this.world.add(v);
    // Bölge başlıkları haritada yazılmaz (Ömer 2026-10-08); yalnızca bölge geçişinde ortada kısa bant (regionBanner).
  }

  // ------------------------------------------------------------ yollar, düğümler, sis (duruma göre yeniden çizilir)

  private renderMap(animateFog: boolean): void {
    this.dyn.removeAll(true);
    this.openEdges = [];
    const vis = nodeVisibility(this.map, this.s, session.revealFog);
    // 1) toprak izleri, 2) çizgiler
    const trails = this.add.graphics();
    const lines = this.add.graphics();
    this.dyn.add([trails, lines]);
    for (const e of this.map.edges) {
      const ev = edgeVisibility(this.map, this.s, vis, e);
      const pts = this.curve(e.from, e.to).getPoints(48).map((p) => ({ x: p.x, y: p.y }));
      const alpha = ev === 'walked' || ev === 'open' ? 1 : ev === 'visible' ? 0.85 : ev === 'closed' ? 0.28 : 0.22;
      this.trail(trails, pts, alpha);
      if (ev === 'open') {
        const g = this.add.graphics();
        this.dyn.add(g);
        this.openEdges.push({ g, pts });
        continue;
      }
      this.drawLine(lines, pts, e.style === 'solid', ev, 0);
    }
    this.animateDashes(0);
    // 3) düğümler
    const step = nextStep(this.s);
    const options = step.kind === 'move' ? step.options : [];
    for (const n of this.map.nodes) this.drawNode(n, vis[n.id]!, options.includes(n.id));
    // 4) sis bulutları
    this.updateClouds(vis, animateFog);
  }

  private trail(g: Phaser.GameObjects.Graphics, pts: Pt[], alpha: number): void {
    const path = (w: number, col: number, a: number, off: number) => {
      g.lineStyle(w, col, a * alpha);
      g.beginPath();
      pts.forEach((p, i) => {
        const j = Math.sin(i * 1.7 + off) * 1.6;
        if (i === 0) g.moveTo(p.x + j, p.y - j);
        else g.lineTo(p.x + j, p.y - j);
      });
      g.strokePath();
    };
    path(24, 0x5a3e22, 0.22, 0);
    path(14, 0x8a6a40, 0.3, 2);
  }

  private drawLine(g: Phaser.GameObjects.Graphics, pts: Pt[], solid: boolean, ev: EdgeVis, offset: number): void {
    const faded = ev === 'closed' || ev === 'fog';
    const color = faded ? 0x8a8070 : solid ? 0xf0e2c0 : 0xe0b84a;
    const alpha = ev === 'walked' || ev === 'open' ? 1 : ev === 'visible' ? 0.9 : ev === 'closed' ? 0.35 : 0.3;
    // koyu kontur + renkli çizgi
    for (const [w, col, a] of [
      [10, 0x1a1008, 0.55 * alpha],
      [6, color, alpha],
    ] as Array<[number, number, number]>) {
      g.lineStyle(w, col, a);
      if (solid) {
        g.beginPath();
        pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.strokePath();
      } else this.dashed(g, pts, 18, 12, offset);
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

  /** Gidilebilecek yollarda akan kesik çizgi. */
  private animateDashes(dt: number): void {
    if (!this.openEdges.length) return;
    this.dashT += dt * 0.04;
    for (const { g, pts } of this.openEdges) {
      g.clear();
      this.drawLine(g, pts, false, 'open', -this.dashT);
    }
  }

  private drawNode(n: MapNode, v: NodeVis, option: boolean): void {
    if (v === 'fog') return;
    const p = this.P(n.id);
    const c = this.add.container(p.x, p.y);
    this.dyn.add(c);
    const goal = v === 'goal';
    const closed = v === 'closed';
    const scale = n.final ? 1.2 : 1;
    const r = BADGE_R * scale;
    const g = this.add.graphics();
    c.add(g);
    const choice = outgoing(this.map, n.id).length > 1;
    if (v === 'current') {
      const halo = this.add.image(0, 0, ensureGlow(this)).setTint(0xffe29a).setAlpha(0.6).setScale(1.5 * scale).setBlendMode(Phaser.BlendModes.ADD);
      c.addAt(halo, 0);
      this.tweens.add({ targets: halo, alpha: { from: 0.35, to: 0.75 }, duration: 1100, yoyo: true, repeat: -1 });
    }
    g.fillStyle(0x000000, 0.35).fillCircle(3, 5, r + 4);
    if (choice) g.lineStyle(6, 0xe0b84a, goal || closed ? 0.4 : 1).strokeCircle(0, 0, r + 8);
    if (n.final) g.lineStyle(4, 0xff7a2a, goal ? 0.4 : 0.9).strokeCircle(0, 0, r + (choice ? 14 : 8));
    g.fillStyle(goal ? 0x1a1410 : TYPE_COLOR[n.type], goal ? 0.85 : 1).fillCircle(0, 0, r);
    g.fillStyle(0xffffff, goal ? 0 : 0.12).fillCircle(-r * 0.3, -r * 0.35, r * 0.45);
    g.lineStyle(4, goal ? 0x6b5a3a : 0xc9a24a, 1).strokeCircle(0, 0, r);
    g.lineStyle(1.5, 0x2a1a08, 1).strokeCircle(0, 0, r + 2);
    const icon = this.add.graphics();
    this.drawIcon(icon, n.type, goal ? 0x9a8a6a : 0xf3e4c4, scale);
    c.add(icon);
    if (n.type === 'treasure' && n.encounter) {
      // Guarded treasure: sağ altta küçük çapraz kılıç
      const gs = this.add.graphics();
      gs.fillStyle(0x6b4a33, 1).fillCircle(r * 0.72, r * 0.72, 15).lineStyle(2, 0xc9a24a, 1).strokeCircle(r * 0.72, r * 0.72, 15);
      this.drawIcon(gs, 'battle', 0xf3e4c4, 0.38, r * 0.72, r * 0.72);
      c.add(gs);
    }
    // numara rozeti (sağ üst)
    const nb = this.add.graphics();
    nb.fillStyle(0x120c07, 1).fillCircle(r * 0.78, -r * 0.78, 15).lineStyle(2, 0xc9a24a, 1).strokeCircle(r * 0.78, -r * 0.78, 15);
    c.add(nb);
    c.add(serif(this, r * 0.78, -r * 0.78, n.id, n.id.length > 2 ? 12 : 15, '#f3d9a0', { stroke: 2 }).setOrigin(0.5));
    // birleşme noktası işareti
    if (incoming(this.map, n.id).length > 1) c.add(serif(this, -r - 20, 0, '>>', 20, '#f3d9a0', { stroke: 3 }).setOrigin(0.5));
    // temizlendi: altın onay mührü
    if (v === 'cleared') {
      const seal = this.add.graphics();
      seal.fillStyle(0xc9a24a, 1).fillCircle(-r * 0.72, r * 0.72, 14).lineStyle(3, 0x2a1a08, 1);
      seal.beginPath().moveTo(-r * 0.72 - 7, r * 0.72).lineTo(-r * 0.72 - 2, r * 0.72 + 6).lineTo(-r * 0.72 + 8, r * 0.72 - 6).strokePath();
      c.add(seal);
      c.setAlpha(0.82);
    }
    if (closed) c.setAlpha(0.38);
    if (goal) c.setAlpha(0.8);
    // etiket plakası
    const showSub = v === 'near' || v === 'current' || v === 'cleared' || (closed && false);
    const name = n.name.toUpperCase();
    const t1 = serif(this, 0, 0, name, 19, '#2a1a0c', { stroke: 0, spacing: 1 }).setOrigin(0.5, 0);
    const t2 = showSub ? this.add.text(0, 0, n.subtitle, { fontFamily: SERIF, fontSize: '15px', fontStyle: 'italic', color: '#5a4126' }).setResolution(2).setOrigin(0.5, 0) : null;
    const pw = Math.max(t1.width, t2?.width ?? 0) + 26;
    const ph = t2 ? 52 : 32;
    const above = n.label === 'above';
    const top = above ? -r - 14 - ph : r + 12;
    c.add(parchmentPlate(this, 0, top, pw, ph, goal ? 0.75 : 1));
    t1.setPosition(0, top + 6);
    c.add(t1);
    if (t2) {
      t2.setPosition(0, top + 28);
      c.add(t2);
    }
    if (choice && (v === 'current' || v === 'cleared' || v === 'near')) {
      const label = `CHOICE · ${outgoing(this.map, n.id).length} ROADS`;
      const ty = above ? r + 6 : top + ph + 4;
      const ct = serif(this, 0, ty + 12, label, 14, '#f3d9a0', { spacing: 2, stroke: 2 }).setOrigin(0.5);
      const cg = this.add.graphics();
      cg.fillStyle(0x120c07, 0.95).fillRoundedRect(-ct.width / 2 - 12, ty, ct.width + 24, 24, 12).lineStyle(2, 0xc9a24a, 1).strokeRoundedRect(-ct.width / 2 - 12, ty, ct.width + 24, 24, 12);
      c.add([cg, ct]);
    }
    if (n.id === this.map.start && v !== 'current') c.add(serif(this, 0, -r - 18, 'START', 14, '#f3d9a0', { spacing: 2, stroke: 3 }).setOrigin(0.5));
    // gidilebilecek düğüm ya da üzerinde eylem bekleyen mevcut düğüm (savaş, kasaba...): nabız + dokunma
    if (option || (v === 'current' && this.actionHere())) {
      this.tweens.add({ targets: c, scale: { from: 1, to: 1.08 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const zone = this.add.zone(0, 0, 110 * scale, 110 * scale).setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Circle(55 * scale, 55 * scale, 55 * scale), hitAreaCallback: Phaser.Geom.Circle.Contains });
    zone.on('pointerup', () => {
      if (this.drag.moved || this.walking || this.modal || this.pauseMenu) return;
      this.onNodeTap(n.id, v);
    });
    c.add(zone);
  }

  /** Tür ikonları (kodla çizilir; content-designer ileride piksel art ikonlarla değiştirebilir). */
  private drawIcon(g: Phaser.GameObjects.Graphics, type: NodeType, col: number, s: number, ox = 0, oy = 0): void {
    const L = (x1: number, y1: number, x2: number, y2: number) => g.lineBetween(ox + x1 * s, oy + y1 * s, ox + x2 * s, oy + y2 * s);
    g.lineStyle(Math.max(2, 5 * s), col, 1);
    g.fillStyle(col, 1);
    switch (type) {
      case 'battle':
        L(-14, -14, 14, 14);
        L(14, -14, -14, 14);
        L(-14, 6, -6, 14);
        L(14, 6, 6, 14);
        break;
      case 'elite': {
        g.fillCircle(ox, oy - 4 * s, 15 * s);
        g.fillRect(ox - 9 * s, oy + 6 * s, 18 * s, 10 * s);
        g.fillStyle(0x2a0c08, 1).fillCircle(ox - 6 * s, oy - 5 * s, 4.5 * s).fillCircle(ox + 6 * s, oy - 5 * s, 4.5 * s);
        g.fillRect(ox - 1.5 * s, oy + 4 * s, 3 * s, 4 * s);
        g.lineStyle(2 * s, 0x2a0c08, 1);
        L(-4, 12, -4, 16);
        L(4, 12, 4, 16);
        break;
      }
      case 'boss': {
        const p = [-17, 11, -17, -9, -8, 0, 0, -15, 8, 0, 17, -9, 17, 11];
        g.fillPoints(Array.from({ length: p.length / 2 }, (_, i) => new Phaser.Math.Vector2(ox + p[i * 2]! * s, oy + p[i * 2 + 1]! * s)), true);
        break;
      }
      case 'town': {
        g.fillRect(ox - 15 * s, oy - 6 * s, 30 * s, 20 * s);
        for (const x of [-15, -5, 5]) g.fillRect(ox + x * s, oy - 12 * s, 6 * s, 6 * s);
        g.fillRect(ox + 11 * s, oy - 12 * s, 4 * s, 6 * s);
        g.fillStyle(0x1a1008, 1).fillRect(ox - 5 * s, oy + 3 * s, 10 * s, 11 * s);
        break;
      }
      case 'event': {
        g.lineStyle(Math.max(2, 5 * s), col, 1);
        g.beginPath();
        g.arc(ox, oy - 6 * s, 9 * s, Math.PI * 1.1, Math.PI * 0.45, false);
        g.strokePath();
        L(3, 2, 0, 6);
        g.fillCircle(ox, oy + 13 * s, 3 * s);
        break;
      }
      case 'treasure': {
        g.fillRect(ox - 16 * s, oy - 2 * s, 32 * s, 16 * s);
        g.fillRoundedRect(ox - 16 * s, oy - 13 * s, 32 * s, 10 * s, 5 * s);
        g.fillStyle(0x3a2608, 1).fillRect(ox - 16 * s, oy - 3 * s, 32 * s, 3 * s).fillRect(ox - 3 * s, oy - 5 * s, 6 * s, 8 * s);
        break;
      }
    }
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
      const height = i === 0 ? 110 : 110 * 0.85;
      img.setScale(height / img.height);
      if (i > 0) img.setTint(0x2a1a10).setAlpha(0.55);
      img.setPosition(p.x - 28 - i * 30, p.y - 6);
      this.world.add(img);
      this.caravan.push(img);
    });
    // lider önde (en üstte çizilir)
    this.caravan.slice().reverse().forEach((im) => this.world.bringToTop(im));
  }

  /** Kafileyi yol boyunca yürütür; dokunma ya da `finish` atlar. */
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
        im.setPosition(p.x, p.y - 6 - bob);
        if (Math.abs(ahead.x - p.x) > 0.5) im.setFlipX(ahead.x < p.x);
      });
      if (this.cameras.main.zoom > 1.01) this.cameras.main.centerOn(this.caravan[0]?.x ?? 0, this.caravan[0]?.y ?? 0);
    };
    const tween = this.tweens.add({ targets: state, d: len, duration, ease: 'Sine.easeInOut', onUpdate: place, onComplete: () => finish() });
    const skip = this.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
    this.ui.add(skip);
    const hint = serif(this, W / 2, 310, 'Tap to skip', 20, '#f3e4c4', { bold: false, stroke: 3 }).setOrigin(0.5).setAlpha(0.8);
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

  // ------------------------------------------------------------ kamera

  private bindCamera(): void {
    const cam = this.cameras.main;
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? -0.1 : 0.1));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { down: true, moved: false, x: p.x, y: p.y };
    });
    // İki parmakla sıkıştırma = yakınlaştırma (+/- düğmeleri kaldırıldı)
    this.input.addPointer(1);
    let pinch = 0;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      if (a.isDown && b.isDown) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (pinch > 0) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (d / pinch), 1, ZOOM_MAX));
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
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.drag.x = p.x;
      this.drag.y = p.y;
    });
    this.input.on('pointerup', () => {
      this.drag.down = false;
      this.time.delayedCall(0, () => (this.drag.moved = false));
    });
  }

  private zoomBy(d: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(Math.round((cam.zoom + d) * 10) / 10, 1, ZOOM_MAX));
  }

  private centerOn(id: string): void {
    const p = this.P(id);
    this.cameras.main.centerOn(p.x, p.y);
  }

  // ------------------------------------------------------------ arayüz (sabit katman)

  private renderHud(): void {
    this.hud.removeAll(true);
    const s = this.s;
    const L = this.hud;
    // Kartuş (sol üst): yalnızca harita adı (Ömer 2026-10-08). Durak/mod/zorluk/yuva Party penceresinde.
    // Çerçevesiz yazı; okunurluk için kontur + yumuşak gölge.
    L.add(goldText(this, 40, 26, this.map.title, 56, 8).setOrigin(0, 0).setShadow(3, 4, '#000000', 8, true, true));
    // Takım şeridi (üst orta)
    const team = activeHeroes(s);
    const lead = leaderOf(s);
    const cw = 96;
    const x0 = W / 2 - ((team.length - 1) * cw) / 2;
    if (team.length) L.add(makePanel(this, x0 - 64, 18, (team.length - 1) * cw + 128, 120, { top: 0x2a2017, bottom: 0x0f0a07, bevel: 3, ornaments: false, alpha: 0.9 }));
    team.forEach((h, i) => {
      const def = content.classes[h.class]!;
      const x = x0 + i * cw;
      L.add(classAvatar(this, def, x, 62, 62));
      L.add(classLogoBadge(this, def, x - 26, 84, 12)); // class logosu (seçili sanat sürümüyle)
      L.add(hpBar(this, x - 34, 98, 68, 10, h.hpRatio));
      L.add(serif(this, x, 122, session.showHp ? `${Math.round(h.hpRatio * 100)}%` : def.name, 13, '#d8c49a', { bold: false, stroke: 2 }).setOrigin(0.5));
      if (lead?.id === h.id) L.add(crown(this, x + 26, 34, 0.75));
    });
    if (team.length) {
      const pb = makeMenuButton(this, x0 + (team.length - 1) * cw + 140, 78, 130, 64, 'Party', () => !this.walking && this.openParty(), { size: 26 });
      L.add(pb.container);
    }
    // Lejant (sağ alt, katlanabilir)
    this.renderLegend();
    // Menu: sağ üstteki DOM simge sırasında (tam ekran / wiki / ayarlar ile hizalı; bkz. mountMenuButton). Save menünün içinde.
    if (session.notice) {
      const t = serif(this, W / 2, 310, session.notice, 24, '#f3e4c4', { stroke: 4 }).setOrigin(0.5);
      L.add(t);
      this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600 });
      session.notice = '';
    }
  }

  /** Mevcut düğümde dokunarak açılacak bir eylem var mı (savaş, kasaba, olay, hazine, sefer sonu). */
  private actionHere(): boolean {
    return ['battle', 'town', 'event', 'treasure', 'complete'].includes(nextStep(this.s).kind);
  }

  /** Lejant (sağ alt, katlanabilir): yalnızca 6 düğüm türü, 2 sütun (~%80 boyut). */
  private renderLegend(): void {
    const L = this.hud;
    const w = 300;
    const x = W - 24 - w;
    const open = this.legendOpen;
    const h = open ? 168 : 50;
    const y = H - 24 - h;
    L.add(makePanel(this, x, y, w, h, { top: 0x2a2017, bottom: 0x0f0a07, bevel: 3, ornaments: false, alpha: 0.92 }));
    L.add(serif(this, x + 20, y + 25, 'LEGEND', 16, '#f3d9a0', { spacing: 4 }).setOrigin(0, 0.5));
    L.add(serif(this, x + w - 20, y + 25, open ? 'Hide' : 'Show', 15, '#c9b27a', { bold: false, stroke: 2 }).setOrigin(1, 0.5));
    // dokunma alanı >= 44 px
    const hit = this.add.zone(x + w - 50, y + 25, 100, 50).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      this.legendOpen = !this.legendOpen;
      this.renderHud();
    });
    L.add(hit);
    if (!open) return;
    const types: NodeType[] = ['town', 'battle', 'elite', 'treasure', 'event', 'boss'];
    types.forEach((t, i) => {
      const cx = x + 34 + (i % 2) * 144;
      const cy = y + 66 + Math.floor(i / 2) * 36;
      const g = this.add.graphics();
      g.fillStyle(TYPE_COLOR[t], 1).fillCircle(cx, cy, 13).lineStyle(2, 0xc9a24a, 1).strokeCircle(cx, cy, 13);
      this.drawIcon(g, t, 0xf3e4c4, 0.34, cx, cy);
      L.add(g);
      L.add(serif(this, cx + 21, cy, TYPE_LABEL[t], 14, '#e8d9b8', { bold: false, stroke: 2 }).setOrigin(0, 0.5));
    });
  }

  private flash(text: string): void {
    const t = serif(this, W / 2, 310, text, 24, '#f3e4c4', { stroke: 4 }).setOrigin(0.5);
    this.ui.add(t);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 500, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------ akış

  private refresh(animateFog = true): void {
    this.renderMap(animateFog);
    this.renderHud();
  }

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
  }

  private update2(s: CampaignState): void {
    setState(s);
  }

  /** Sıradaki adıma göre ekranı kurar (pencere ya da alt düğme). */
  advance(): void {
    this.closeModal();
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
            { label: 'Party', run: () => this.openParty() },
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
        const t = TREASURES[step.treasure] ?? { title: 'Treasure', text: 'You find a chest.', reward: 'Rewards coming soon' };
        this.modal = openModal(this, this.ui, { title: 'Treasure', subtitle: t.title, text: `${t.text}\n\n${t.reward ?? ''}`, height: 500, buttons: [{ label: 'Continue', primary: true, run: () => this.commit(completeSimple(this.s, 'treasure')) }] });
        return;
      }
      case 'complete':
        this.modal = openModal(this, this.ui, {
          title: 'Valdoria Conquered',
          subtitle: 'Campaign Complete',
          text: `${CONFIG.texts.complete}\n\n${s.stats.victories} victories, ${s.stats.defeats} defeats.`,
          height: 520,
          buttons: [
            { label: 'Main Menu', primary: true, run: () => this.scene.start(MENU_SCENE) },
            { label: 'Stay on the map', run: () => this.closeModal() },
          ],
        });
        return;
      default:
        return; // battle / move: oyuncu nabız atan düğüme dokunur
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

  private showTip(): void {
    this.tip?.destroy(true);
    this.tip = null;
    const text = pendingTip(this.s);
    if (!text) return;
    const c = this.add.container(0, 0);
    this.tip = c;
    this.ui.add(c);
    // Ekranın altında, ortada (lejantın solunda); sağ üst köşede küçük X kapama düğmesi
    const w = 780;
    const body = this.add.text(0, 0, text, { fontFamily: SERIF, fontSize: '21px', fontStyle: 'italic', color: '#2a1a0c', wordWrap: { width: w - 110 } }).setResolution(2);
    const h = Math.max(84, body.height + 50);
    const x = W / 2 - w / 2;
    const y = H - 22 - h;
    c.add(parchmentPlate(this, W / 2, y, w, h));
    c.add(serif(this, x + 26, y + 12, 'TIP', 16, '#7a4a1a', { stroke: 0, spacing: 3 }));
    body.setPosition(x + 26, y + 36);
    c.add(body);
    const cx = x + w - 26;
    const cy = y + 24;
    const xg = this.add.graphics();
    xg.lineStyle(4, 0x5a3a1a, 1).lineBetween(cx - 9, cy - 9, cx + 9, cy + 9).lineBetween(cx + 9, cy - 9, cx - 9, cy + 9);
    c.add(xg);
    // dokunma alanı 64x64 (>= 44 px)
    const hit = this.add.zone(cx, cy, 64, 64).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.dismissTip());
    c.add(hit);
  }

  private dismissTip(): void {
    if (!this.tip) return;
    setState(markTipSeen(this.s));
    this.tip.destroy(true);
    this.tip = null;
  }

  private onNodeTap(id: string, v: NodeVis): void {
    const step = nextStep(this.s);
    if (step.kind === 'move' && step.options.includes(id)) {
      if (step.options.length === 1) return this.march(id);
      return this.roadCard(id);
    }
    if (id === this.s.at && step.kind === 'battle') return this.showBattleCard();
    // kasaba/olay/hazine/sefer sonu penceresi kapatıldıysa mevcut düğüme dokunmak yeniden açar
    if (id === this.s.at && this.actionHere()) return this.advance();
    // bilgi: görünür düğümün adı ve türü
    const n = node(this.map, id);
    if (v === 'fog') return;
    this.flash(v === 'goal' ? `${n.name}: your goal, hidden in the fog` : `${n.name} · ${n.subtitle}`);
  }

  private enemyLine(nodeId: string): string {
    const n = node(this.map, nodeId);
    if (!n.encounter) return '';
    const p = enemyPreview(n.encounter);
    // Lider zaten ad listesinde görünüyorsa "(led by ...)" tekrarlanmaz
    const leader = p.leader && !p.names.includes(p.leader) ? `  (led by ${p.leader})` : '';
    return `Enemies: ${p.classes.length} · ${p.names.join(', ')}${leader}`;
  }

  /** Seçim noktasında rota kartı: ad, tür, alt başlık, düşmanlar (d = 1), dalın ikinci durağı (d = 2). */
  private roadCard(id: string): void {
    const n = node(this.map, id);
    const after = outgoing(this.map, id).map((x) => node(this.map, x));
    const lines = [n.subtitle, this.enemyLine(id), after.length ? `Then: ${after.map((a) => `${a.name} (${TYPE_LABEL[a.type]})`).join(' or ')}` : ''].filter(Boolean);
    this.modal = openModal(this, this.ui, {
      title: n.name,
      text: lines.join('\n\n'),
      height: 520,
      buttons: [
        {
          label: 'Take this road',
          primary: true,
          run: () => {
            this.closeModal();
            this.modal = openModal(this, this.ui, {
              title: 'Take this road?',
              text: 'The other roads will close for this journey.',
              height: 360,
              buttons: [
                { label: 'Yes', primary: true, run: () => this.march(id) },
                { label: 'No', run: () => this.closeModal() },
              ],
            });
          },
        },
        { label: 'Back', run: () => this.closeModal() },
      ],
    });
  }

  private march(to: string): void {
    this.closeModal();
    const from = this.s.at;
    const before = node(this.map, from).region;
    this.update2(moveTo(this.s, to));
    this.tip?.destroy(true);
    this.tip = null;
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
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0, 0).fillRect(0, 0, 1, 1);
    g.fillStyle(0x0c0805, 0.75).fillRect(0, H / 2 - 80, W, 160);
    c.add(g);
    c.add(goldText(this, W / 2, H / 2 - 18, r.title.toUpperCase(), 58, 10).setOrigin(0.5));
    c.add(this.add.text(W / 2, H / 2 + 42, r.tagline, { fontFamily: SERIF, fontSize: '26px', fontStyle: 'italic', color: '#e8d9b8' }).setResolution(2).setOrigin(0.5));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 350, yoyo: true, hold: 1600, onComplete: () => c.destroy(true) });
  }

  private showBattleCard(): void {
    const step = nextStep(this.s);
    if (step.kind !== 'battle') return;
    const n = node(this.map, step.node);
    const team = activeHeroes(this.s);
    const hpNote = team.some((h) => h.hpRatio < 1) ? `\n\nYour heroes start with the health they carried from the last fight.` : '';
    this.modal = openModal(this, this.ui, {
      title: n.name,
      subtitle: n.subtitle,
      text: `${this.enemyLine(n.id)}${hpNote}`,
      height: 480,
      buttons: [
        { label: 'Fight', primary: true, run: () => startCampaignBattle(this) },
        { label: 'Party', run: () => this.openParty() },
        { label: 'Back', run: () => this.closeModal() },
      ],
    });
  }

  // ------------------------------------------------------------ pencereler: kahraman, aday, veda, yeni takım, dizilim

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
            if (!chosen) return this.flash('Pick a hero first.');
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
            if (!chosen) return this.flash('Pick one companion first.');
            this.commit(recruit(this.s, chosen));
          },
        },
      ],
    });
    this.modal = m;
    const cards = this.classGrid(step.offer, m.area, (id) => {
      chosen = id;
      cards.forEach((c, k) => c.setSelected(k === id));
    }, m.root, (id) => (isAreaClass(id) && node(this.map, step.node).recruit?.requireArea ? 'AREA ATTACKS' : undefined));
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
            if (picks.length !== size) return this.flash(`Pick ${size} heroes.`);
            this.commit(formCompany(this.s, picks, leader));
          },
        },
      ],
    });
    this.modal = m;
    const counter = serif(this, W / 2, m.area.y + m.area.h - 40, '', 24, '#f3d9a0', { stroke: 3 }).setOrigin(0.5, 0);
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
        if (picks.length >= size) return this.flash(`You already have ${size} heroes. Tap one to remove it.`);
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

  /** Party: kadro kartları + 4x3 dizilim ızgarası; bir karaktere sonra bir hücreye dokun = taşı / yer değiştir. */
  private openParty(): void {
    const reopenBattle = nextStep(this.s).kind === 'battle';
    const reopenTown = nextStep(this.s).kind === 'town';
    this.closeModal();
    const back = () => {
      this.closeModal();
      this.renderHud();
      this.placeCaravan(this.s.at);
      if (reopenTown) this.advance();
      else if (reopenBattle) this.showBattleCard();
    };
    const m = openModal(this, this.ui, {
      title: 'Party',
      subtitle: 'Tap a hero, then tap a cell to move them. The front row faces the enemy.',
      width: 1300,
      height: 820,
      y: 120,
      buttons: [
        { label: 'Auto arrange', run: () => { setState(autoFormation(this.s)); draw(); } },
        { label: 'Done', primary: true, run: back },
      ],
    });
    this.modal = m;
    let selected = '';
    const layer = this.add.container(0, 0);
    m.root.add(layer);
    const cell = 118;
    const gx = W / 2 - 2 * cell; // 4 sütun (sıra), 3 satır (şerit); ön sıra sağda
    const gy = m.area.y + 30;
    const draw = () => {
      layer.removeAll(true);
      const s = this.s;
      for (let row = 0; row < 4; row++)
        for (let lane = 0; lane < 3; lane++) {
          const slot = row * 3 + lane;
          const x = gx + (3 - row) * cell;
          const y = gy + lane * cell;
          const id = s.active[slot] ?? '';
          const g = this.add.graphics();
          g.fillStyle(row === 0 ? 0x3a2a18 : 0x221810, 0.95).fillRect(x + 4, y + 4, cell - 8, cell - 8);
          g.lineStyle(selected && id === selected ? 4 : 2, selected && id === selected ? GOLD.bright : GOLD.edge, 1).strokeRect(x + 4, y + 4, cell - 8, cell - 8);
          layer.add(g);
          const h = id ? heroById(s, id) : undefined;
          if (h) {
            layer.add(classAvatar(this, content.classes[h.class]!, x + cell / 2, y + cell / 2 - 8, 76));
            layer.add(classLogoBadge(this, content.classes[h.class]!, x + 24, y + cell - 44, 14));
            layer.add(hpBar(this, x + 16, y + cell - 24, cell - 32, 8, h.hpRatio));
            if (h.leader) layer.add(crown(this, x + cell - 24, y + 22, 0.7));
          }
          const z = this.add.zone(x + cell / 2, y + cell / 2, cell, cell).setInteractive({ useHandCursor: true });
          z.on('pointerup', () => {
            if (!selected) {
              if (id) selected = id;
            } else {
              setState(moveHero(this.s, selected, slot));
              selected = '';
            }
            draw();
          });
          layer.add(z);
        }
      layer.add(serif(this, gx + 4 * cell + 20, gy + 1.5 * cell, 'FRONT ›', 20, '#f3d9a0', { spacing: 2, stroke: 3 }).setOrigin(0, 0.5));
      layer.add(serif(this, gx - 20, gy + 1.5 * cell, 'BACK', 18, '#a8977a', { spacing: 2, stroke: 3 }).setOrigin(1, 0.5));
      const team = activeHeroes(s);
      team.forEach((h, i) => {
        const def = content.classes[h.class]!;
        const x = W / 2 + (i - (team.length - 1) / 2) * 200;
        const y = gy + 3 * cell + 70;
        layer.add(serif(this, x, y, def.name, 22, '#f3e4c4').setOrigin(0.5));
        layer.add(hpBar(this, x - 70, y + 20, 140, 12, h.hpRatio));
        layer.add(serif(this, x, y + 50, `${Math.round(h.hpRatio * 100)}% HP${h.leader ? ' · Leader' : ''}`, 16, '#b9a27a', { bold: false, stroke: 2 }).setOrigin(0.5));
      });
      // Sefer bilgisi (haritadaki kartuştan buraya taşındı): durak + mod + zorluk + yuva
      const diff = CONFIG.difficulties[s.difficulty]?.name ?? s.difficulty;
      const info = `Stop ${stopNumber(s)} / ${this.map.stopsPerRun}  ·  ${s.mode === 'ironman' ? 'IRONMAN' : 'NORMAL'}  ·  ${diff.toUpperCase()}  ·  SLOT ${s.slot + 1}`;
      layer.add(serif(this, W / 2, gy + 3 * cell + 164, info, 17, s.mode === 'ironman' ? '#e08a7a' : '#c9b27a', { bold: false, spacing: 2, stroke: 3 }).setOrigin(0.5));
    };
    draw();
  }
}

