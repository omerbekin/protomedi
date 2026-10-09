import Phaser from 'phaser';
import cfg from '../../data/menu-scene.json';
import { worldXY } from './stage';

/**
 * Ana menünün katmanlı, canlı arka planı (Ömer 2026-10-10): alacakaranlıkta Valdoria; sağda yanan kale, ortada yıkık gözcü kulesi ve
 * kırık köprü, SOL üçte birde koyu sisli çamlar (logo ve menü sütunu orada). Görseller assets/menu (asıllar assets/source/menu-layers),
 * konumlar ve ayarlar data/menu-scene.json.
 *  - Paralaks: masaüstünde fare konumuyla katmanlar hafifçe kayar (gök ~0, uzak az, orta daha çok, ön en çok; yumuşatılmış);
 *    dokunmatikte / faresiz çok yavaş otomatik salınım. Sahne 16:9'dan 21:9'a boşluksuz dolar (hafif taşma: overscan).
 *  - Ortam: kuleden yükselip sağa süzülen duman, kule tepesinde titreyen alev + nabız gibi ılık ışık, seyrek kor ve kül (menü sütununun
 *    sağında), 20-40 sn'de bir gökyüzünden geçen karga sürüsü.
 *  - Azaltılmış hareket: paralaks ve parçacık yok, yalnızca sabit görüntü (alev ilk karede, ışık sabit).
 *  - Başarım: parçacıklar baştan kurulur ve yeniden kullanılır (kare başına nesne üretilmez); sekme gizliyken Phaser döngüsü durur.
 */

const FILES = import.meta.glob('../../assets/menu/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const key = (name: string) => `menu:${name}`;
const H = 1080;
const IMG_W = 2580;
const IMG_H = 1080;

export function preloadMenuLayers(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(FILES)) {
    const name = (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    if (!scene.textures.exists(key(name))) scene.load.image(key(name), url);
  }
}

/** Dört katman ve efekt sayfası yüklü mü (değilse menü eski harita arka planına düşer). */
export function hasMenuLayers(scene: Phaser.Scene): boolean {
  return [...cfg.layers, 'fx'].every((n) => scene.textures.exists(key(n)));
}

/** Efekt sayfasının adlı karelerini bir kez ekler. */
function ensureFrames(scene: Phaser.Scene): void {
  const tex = scene.textures.get(key('fx'));
  for (const [name, r] of Object.entries(cfg.frames)) {
    if (name.startsWith('_') || !Array.isArray(r) || tex.has(name)) continue;
    tex.add(name, 0, r[0]!, r[1]!, r[2]!, r[3]!);
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const FLAMES = ['flame0', 'flame1', 'flame2', 'flame3'];

interface Mote {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  base: number;
  ember: boolean;
}

export class MenuBackdrop {
  readonly root: Phaser.GameObjects.Container;
  private readonly layers: Phaser.GameObjects.Container[] = [];
  private readonly crowLayer: Phaser.GameObjects.Container;
  private readonly moteLayer: Phaser.GameObjects.Container;
  private readonly flames: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly smoke: Phaser.GameObjects.Image[] = [];
  private readonly motes: Mote[] = [];
  private readonly crows: Phaser.GameObjects.Image[] = [];
  /** Katman görselinin dünya konumu (sol üst) ve ölçeği. */
  private left = cfg.anchorLeft;
  private top = 0;
  private scale = cfg.overscan;
  private view = { left: 0, right: 1920 };
  private zoom = 1;
  /** Ön katmanın ek yakınlaşması ve o yakınlaşmanın konumu (pivot etrafında). */
  private fgScale = 1;
  private fgBase = { x: 0, y: 0 };
  private reduced = false;
  private time = 0;
  /** Paralaks: hedef ve yumuşatılmış konum (-1..1). */
  private target = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private mouse = false;
  private nextCrow = 0;
  private crowRun: { t0: number; y: number; n: number; dur: number } | null = null;
  private flickerAt = 0;
  private flameFrame = 0;

  constructor(scene: Phaser.Scene) {
    ensureFrames(scene);
    this.root = scene.add.container(0, 0).setDepth(0);
    // sıra: gök, kargalar (dağların önünde değil, gökte), uzak (+ alev, ışık, duman), orta, kor / kül, ön
    const mk = () => scene.add.container(0, 0);
    const sky = mk();
    this.crowLayer = mk();
    const far = mk();
    const middle = mk();
    this.moteLayer = mk();
    const fg = mk();
    this.layers.push(sky, far, middle, fg);
    this.root.add([sky, this.crowLayer, far, middle, this.moteLayer, fg]);
    cfg.layers.forEach((n, i) => this.layers[i]!.add(scene.add.image(0, 0, key(n)).setOrigin(0, 0)));

    // Duman (uzak katmanda, kulenin arkasında değil önünde: katmanın üstüne)
    for (let i = 0; i < cfg.smoke.count; i++) this.smoke.push(scene.add.image(0, 0, key('fx'), i % 2 ? 'curl' : 'smoke').setAlpha(0));
    this.glow = scene.add.image(0, 0, key('fx'), 'glow').setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < cfg.fire.flames.length; i++) this.flames.push(scene.add.image(0, 0, key('fx'), FLAMES[i % 4]!).setOrigin(0.5, 1));
    far.add([this.glow, ...this.flames, ...this.smoke]);

    // Kor ve kül (havuz)
    const n = cfg.particles.embers + cfg.particles.ash;
    for (let i = 0; i < n; i++) {
      const ember = i < cfg.particles.embers;
      const img = scene.add.image(0, 0, key('fx'), ember ? (i % 3 ? 'ember' : 'embers') : 'ash').setAlpha(0);
      if (ember) img.setBlendMode(Phaser.BlendModes.ADD);
      this.moteLayer.add(img);
      this.motes.push({ img, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, base: 1, ember });
    }
    for (let i = 0; i < cfg.crows.count[1]!; i++) {
      const c = scene.add.image(0, 0, key('fx'), 'crow0').setScale(cfg.crows.scale).setVisible(false);
      this.crows.push(c);
      this.crowLayer.add(c);
    }

    // Fare: paralaks fareyi izler (ilk hareketten sonra); dokunmatikte otomatik salınım
    const onMove = (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.mouse = true;
      const w = worldXY(scene, p);
      const cx = (this.view.left + this.view.right) / 2;
      const hw = Math.max(1, (this.view.right - this.view.left) / 2);
      this.target.x = Phaser.Math.Clamp((w.x - cx) / hw, -1, 1);
      this.target.y = Phaser.Math.Clamp((w.y - H / 2) / (H / 2), -1, 1);
    };
    scene.input.on('pointermove', onMove);
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', () => {
      scene.input.off('pointermove', onMove);
      scene.events.off('update', this.update, this);
    });
    this.nextCrow = rand(cfg.crows.everyMs[0]! * 0.4, cfg.crows.everyMs[1]! * 0.6);
    for (const m of this.motes) this.spawn(m, true);
    this.placeStatic();
  }

  /** Görünen alan değişti (geniş ekran): katmanı boşluksuz kaplayacak yere oturt. */
  layout(view: { left: number; right: number }): void {
    this.view = { left: view.left, right: view.right };
    this.scale = cfg.overscan;
    const w = IMG_W * this.scale;
    const margin = Math.max(...cfg.parallax.x) + 2;
    // tercih edilen yer (16:9'da yanan kule görünür, sol üçte bir koyu çamlar), ama görünür alan her kaymada dolu kalsın
    this.left = Phaser.Math.Clamp(cfg.anchorLeft, view.right + margin - w, view.left - margin);
    this.top = H / 2 - (IMG_H * this.scale) / 2;
    this.placeStatic();
  }

  /** Play görünümüne geçişte hafif yakınlaşma (1 = yok); pivot dünya noktası. */
  setZoom(z: number, pivot: { x: number; y: number }): void {
    this.zoom = 1 + (z - 1) * cfg.pushIn.scale;
    this.root.setScale(this.zoom).setPosition(pivot.x * (1 - this.zoom), pivot.y * (1 - this.zoom));
    // ön katman biraz daha yakınlaşır (derinlik hissi); kökün yerel koordinatında pivot aynı nokta
    this.fgScale = 1 + (this.zoom - 1) * cfg.pushIn.depth * 10;
    this.fgBase = { x: pivot.x * (1 - this.fgScale), y: pivot.y * (1 - this.fgScale) };
    this.applyParallax();
  }

  setReduced(on: boolean): void {
    this.reduced = on;
    this.cur = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.moteLayer.setVisible(!on);
    this.crowLayer.setVisible(!on);
    for (const s of this.smoke) s.setVisible(!on);
    this.flames.forEach((f) => f.setFrame(FLAMES[0]!));
    this.glow.setAlpha((cfg.fire.glow.alpha[0]! + cfg.fire.glow.alpha[1]!) / 2);
    this.applyParallax();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  // ------------------------------------------------------------------ iç

  /** Görsel pikselini katman içindeki dünya konumuna çevirir. */
  private px(x: number): number {
    return this.left + x * this.scale;
  }
  private py(y: number): number {
    return this.top + y * this.scale;
  }

  private placeStatic(): void {
    for (const l of this.layers) {
      const img = l.list[0] as Phaser.GameObjects.Image;
      img.setPosition(this.left, this.top).setScale(this.scale);
    }
    cfg.fire.flames.forEach((f, i) => this.flames[i]?.setPosition(this.px(f.x), this.py(f.y)).setScale(f.scale * this.scale));
    const g = cfg.fire.glow;
    this.glow.setPosition(this.px(g.x), this.py(g.y)).setScale(g.scale * this.scale);
  }

  private applyParallax(): void {
    const ax = cfg.parallax.x;
    const ay = cfg.parallax.y;
    this.layers.forEach((l, i) => {
      if (i === 3) return;
      l.setPosition(-this.cur.x * ax[i]!, -this.cur.y * ay[i]!);
    });
    // ön katman: kendi yakınlaşmasının üstüne paralaks
    this.layers[3]!.setScale(this.fgScale).setPosition(this.fgBase.x - this.cur.x * ax[3]!, this.fgBase.y - this.cur.y * ay[3]!);
    this.crowLayer.setPosition(this.layers[0]!.x, this.layers[0]!.y);
    this.moteLayer.setPosition(this.layers[2]!.x, this.layers[2]!.y);
  }

  private update(_t: number, dtMs: number): void {
    if (!this.root.active || !this.root.visible) return;
    const dt = Math.min(dtMs, 100);
    this.time += dt;
    if (this.reduced) return;
    // Paralaks hedefi: faresizse çok yavaş salınım
    if (!this.mouse) {
      const w = (this.time / 1000 / cfg.parallax.swaySeconds) * Math.PI * 2;
      this.target.x = Math.sin(w);
      this.target.y = Math.sin(w * 0.7) * 0.5;
    }
    const k = 1 - Math.pow(1 - cfg.parallax.ease, dt / 16.67);
    this.cur.x += (this.target.x - this.cur.x) * k;
    this.cur.y += (this.target.y - this.cur.y) * k;
    this.applyParallax();

    // Alev titremesi + ılık ışık nabzı
    if (this.time >= this.flickerAt) {
      this.flickerAt = this.time + cfg.fire.flickerMs * rand(0.7, 1.4);
      this.flameFrame = (this.flameFrame + 1 + (Math.random() < 0.3 ? 1 : 0)) % 4;
      this.flames.forEach((f, i) => f.setFrame(FLAMES[(this.flameFrame + i * 2) % 4]!));
    }
    const g = cfg.fire.glow;
    const pulse = 0.5 + 0.5 * Math.sin((this.time / g.pulseMs) * Math.PI * 2) * (0.85 + 0.15 * Math.sin(this.time / 97));
    this.glow.setAlpha(g.alpha[0]! + (g.alpha[1]! - g.alpha[0]!) * pulse);

    // Duman: her parça kendi evresinde yükselir, sağa süzülür, büyür ve söner
    const sm = cfg.smoke;
    const n = this.smoke.length;
    for (let i = 0; i < n; i++) {
      const s = this.smoke[i]!;
      const p = ((this.time + (i * sm.lifeMs) / n) % sm.lifeMs) / sm.lifeMs;
      const x = sm.origin.x + sm.drift * Math.pow(p, 1.3) + Math.sin(p * 6 + i) * 12;
      const y = sm.origin.y - sm.rise * p;
      s.setPosition(this.px(x), this.py(y));
      s.setScale((sm.scale[0]! + (sm.scale[1]! - sm.scale[0]!) * p) * this.scale);
      s.setAlpha(sm.alpha * Math.sin(Math.PI * p) * (i % 2 ? 0.8 : 1));
      s.setRotation(p * 0.6 + i);
    }

    // Kor ve kül
    const sec = dt / 1000;
    for (const m of this.motes) {
      m.age += dt;
      if (m.age >= m.life) {
        this.spawn(m, false);
        continue;
      }
      m.x += m.vx * sec;
      m.y += m.vy * sec;
      m.vx += Math.sin((this.time + m.base * 1000) / 900) * 2 * sec;
      const p = m.age / m.life;
      const fade = Math.min(1, p * 5, (1 - p) * 4);
      const flick = m.ember ? 0.75 + 0.25 * Math.sin(this.time / 70 + m.base * 9) : 1;
      m.img.setPosition(m.x, m.y).setAlpha(fade * flick * (m.ember ? 0.9 : 0.55));
      if (!m.ember) m.img.setRotation(m.img.rotation + sec * 0.6);
    }

    // Karga sürüsü
    if (!this.crowRun && this.time >= this.nextCrow) {
      this.crowRun = { t0: this.time, y: rand(cfg.crows.y[0]!, cfg.crows.y[1]!), n: Math.round(rand(cfg.crows.count[0]!, cfg.crows.count[1]!)), dur: cfg.crows.crossMs * rand(0.85, 1.2) };
      this.nextCrow = this.time + rand(cfg.crows.everyMs[0]!, cfg.crows.everyMs[1]!);
    }
    if (this.crowRun) {
      const r = this.crowRun;
      const p = (this.time - r.t0) / r.dur;
      const x0 = cfg.particles.minX - 80;
      const x1 = this.view.right + 140;
      this.crows.forEach((c, i) => {
        if (i >= r.n || p >= 1.15) return void c.setVisible(false);
        const q = p - i * 0.035;
        const x = x0 + (x1 - x0) * q;
        const y = r.y + Math.sin(q * 9 + i * 1.7) * 10 + (i % 2 ? 18 : -6) * Math.min(1, i);
        const flap = Math.floor((this.time + i * 60) / cfg.crows.flapMs) % 2;
        c.setVisible(q > 0 && q < 1).setPosition(x, y).setFrame(flap ? 'crow1' : 'crow0').setAlpha(Math.min(1, q * 6, (1 - q) * 6) * 0.9);
      });
      if (p >= 1.15) this.crowRun = null;
    }
  }

  /** Bir kor / kül parçasını sahnenin sağ kısmında yeniden doğurur (`first`: başlangıçta ömrün ortasından başlasın). */
  private spawn(m: Mote, first: boolean): void {
    const pc = cfg.particles;
    const minX = Math.max(pc.minX, this.view.left + 700);
    m.x = rand(minX, this.view.right + 40);
    m.y = m.ember ? rand(H * 0.45, H * 1.02) : rand(H * 0.1, H * 0.9);
    m.vx = m.ember ? rand(6, 22) : rand(10, 30);
    m.vy = m.ember ? rand(-34, -14) : rand(-10, 8);
    m.life = rand(pc.lifeMs[0]!, pc.lifeMs[1]!);
    m.age = first ? rand(0, m.life * 0.8) : 0;
    m.base = Math.random();
    m.img.setScale(m.ember ? rand(0.12, 0.22) : rand(0.1, 0.18)).setRotation(rand(0, 6.28)).setAlpha(0);
  }
}
