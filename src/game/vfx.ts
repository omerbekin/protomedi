import Phaser from 'phaser';
import type { SkillDef } from '../engine';
import type { VfxKind } from '../ui/vfx-kinds';
import type { CombatantView } from './combatant-view';
import { color, slow } from './combatant-view';
import { playSfx } from './audio';
import { ensureIcon } from './icons';

/**
 * Skill efektleri (VFX): hepsi piksel art. Küçük 16x16'lık sprite'lar (ikonlar + efekt sprite'ları) tamsayı katıyla büyütülür,
 * parçacıklar kare piksellerdir ve hareketleri 4 piksellik ızgaraya oturtulur; böylece her şey tek bir piksel dilinde kalır.
 * Her efekt `VfxCtx` alır ve "vuruş anında" (hasar rakamları çıkmadan hemen önce) çözülen bir Promise döner;
 * efektin kuyruğu (sönen parçacıklar) arkada akmaya devam edebilir.
 */
export interface VfxCtx {
  scene: Phaser.Scene;
  actor: CombatantView;
  targets: CombatantView[];
  skill: SkillDef;
  /** Etkinin düştüğü tahta ('party' ya da 'enemy'). */
  board: 'party' | 'enemy';
  /** Alan/şerit skill'lerinde seçilen merkez yuva. */
  center?: number;
  /** Alan/şerit skill'inin kapsadığı hücrelerin zemin konumları (boş hücreler dahil). */
  cells: Array<{ x: number; y: number }>;
  /** Yakın dövüş: kullanıcı hedefe atılır; Promise vuruş anında çözülür (geri dönüş sürer). */
  lunge: (towardX: number) => Promise<void>;
  /** Büyü/atış hazırlığı (halka + şişme). */
  windUp: (hex: string, anim?: 'cast' | 'attack') => Promise<void>;
  /** `all_enemies` yakın dövüş skill'inde (Whirlwind): hedeflerin bulunduğu ön sıranın orta hücresinin zemin konumu. */
  rowCenter?: { x: number; y: number };
  /** Skill'in `sfx` listesindeki bir sesi çalar (listede yoksa sessiz). */
  sfx: (id: string) => void;
  /**
   * Çok vuruşlu skill'lerde (Double Strike) sonraki vuruşun animasyonunu hasar olaylarına bağlar: `skip` hasar/kaçınma olayı
   * normal akar, sonraki olaydan hemen önce `run` oynar. Vuruş gerçekleşmezse (hedef ölürse) `abort` çağrılır.
   */
  gate: (skip: number, run: () => Promise<void>, abort: () => void) => void;
}

const DEPTH = 4300;
const SNAP = 2;
/** Parçacık/çizim piksellerinin ölçeği: ikonlarla aynı ince piksel yoğunluğu (1 = eski, iri piksel). */
const PX = 0.35;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const rnd = (a: number, b: number) => Phaser.Math.FloatBetween(a, b);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;
const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((resolve) => scene.time.delayedCall(ms, resolve));
const spot = (v: CombatantView) => ({ x: v.container.x, y: v.container.y - v.h * 0.5 });
const feet = (v: CombatantView) => ({ x: v.container.x, y: v.container.y - 6 });
const avgX = (list: CombatantView[], fallback: number) => (list.length ? list.reduce((s, t) => s + t.container.x, 0) / list.length : fallback);
const dirTo = (from: CombatantView, to: { x: number }) => (to.x >= from.container.x ? 1 : -1);

/** Piksel sprite: `name` ikon ya da efekt sprite adı; `size` ekrandaki kenar uzunluğu (16'nın katı olursa keskin görünür). */
function sprite(scene: Phaser.Scene, name: string, hex: string, x: number, y: number, size: number, depth = DEPTH): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ensureIcon(scene, name, hex, false)).setDisplaySize(size, size).setDepth(depth);
}

/** Sprite'ı gerçek (displaySize ile verilen) ölçeğinin `from` katından `to` katına büyütür/küçültür. */
function grow(scene: Phaser.Scene, img: Phaser.GameObjects.Image, from: number, to: number, dur: number, ease = 'Quad.easeOut', extra: Partial<Phaser.Types.Tweens.TweenBuilderConfig> = {}): void {
  const base = img.scaleX;
  img.setScale(base * from);
  scene.tweens.add({ targets: img, scaleX: base * to, scaleY: base * to, duration: slow(dur), ease, ...extra });
}

/** Sprite'ı dikeyde yerden büyütür (kökler, el): origin altta, ölçek dikeyde `from`'dan 1'e. */
function sprout(scene: Phaser.Scene, img: Phaser.GameObjects.Image, dur: number): void {
  const base = img.scaleX;
  img.setOrigin(0.5, 1).setScale(base, base * 0.05);
  scene.tweens.add({ targets: img, scaleY: base, duration: slow(dur), ease: 'Back.easeOut' });
}

/** Bir değeri 0..1 ilerlemeyle süren sayaç (parçacık ve çizim animasyonları için). */
function counter(scene: Phaser.Scene, duration: number, onUpdate: (t: number) => void, ease: string = 'Linear'): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease,
      onUpdate: (tw) => onUpdate(tw.getValue() ?? 0),
      onComplete: () => {
        onUpdate(1);
        resolve();
      },
    });
  });
}

interface BurstOpts {
  colors: string[];
  n: number;
  speed?: [number, number];
  angle?: [number, number];
  gravity?: number;
  life?: [number, number];
  size?: [number, number];
  depth?: number;
}

/** Kare piksel parçacık patlaması (kıvılcım, toz, kan, yaprak...). */
function burst(scene: Phaser.Scene, x: number, y: number, o: BurstOpts): void {
  const count = Math.round(o.n * 1.5);
  for (let i = 0; i < count; i++) {
    const a = rnd(o.angle?.[0] ?? 0, o.angle?.[1] ?? Math.PI * 2);
    const sp = rnd(o.speed?.[0] ?? 120, o.speed?.[1] ?? 360);
    const life = slow(rnd(o.life?.[0] ?? 350, o.life?.[1] ?? 700));
    const size = Math.max(SNAP, snap(rnd(o.size?.[0] ?? 8, o.size?.[1] ?? 16) * PX));
    const g = o.gravity ?? 600;
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp;
    const r = scene.add.rectangle(x, y, size, size, color(pick(o.colors))).setDepth(o.depth ?? DEPTH + 50);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: life,
      onUpdate: (tw) => {
        const u = tw.getValue() ?? 0;
        const t = (u * life) / 1000;
        r.setPosition(snap(x + vx * t), snap(y + vy * t + 0.5 * g * t * t)).setAlpha(1 - u * u);
      },
      onComplete: () => r.destroy(),
    });
  }
}

interface RingOpts {
  r: number;
  flat?: number;
  n?: number;
  colors: string[];
  dur: number;
  size?: number;
  startR?: number;
  /** Yalnızca bu açı aralığında (yön yayı), yoksa tam halka. */
  arc?: [number, number];
}

/** Genişleyen piksel halka (ya da yön yayı); `flat` < 1 ise yere yatık elips. */
function ring(scene: Phaser.Scene, x: number, y: number, o: RingOpts): Promise<void> {
  const n = Math.round((o.n ?? 26) * 1.7);
  const size = Math.max(SNAP, (o.size ?? 10) * PX);
  const parts = Array.from({ length: n }, (_, i) => {
    const a = o.arc ? o.arc[0] + ((o.arc[1] - o.arc[0]) * i) / Math.max(1, n - 1) : (i / n) * Math.PI * 2;
    return { a, r: scene.add.rectangle(x, y, size, size, color(pick(o.colors))).setDepth(DEPTH + 20) };
  });
  return counter(
    scene,
    slow(o.dur),
    (u) => {
      const rr = (o.startR ?? 0) + (o.r - (o.startR ?? 0)) * (1 - (1 - u) ** 2);
      for (const p of parts) p.r.setPosition(snap(x + Math.cos(p.a) * rr), snap(y + Math.sin(p.a) * rr * (o.flat ?? 1))).setAlpha(1 - u * u);
      if (u >= 1) for (const p of parts) p.r.destroy();
    },
  );
}

/** Ekranı kısa süre boyayan parlama. */
function flash(scene: Phaser.Scene, hex: string, alpha: number, dur: number): void {
  const r = scene.add.rectangle(960, 540, 1920, 1080, color(hex), alpha).setDepth(DEPTH - 20);
  scene.tweens.add({ targets: r, alpha: 0, duration: slow(dur), onComplete: () => r.destroy() });
}

const shake = (scene: Phaser.Scene, ms: number, mag: number) => scene.cameras.main.shake(slow(ms), mag);

/** Bir noktaya piksel hareketle giden sprite/nesne; Promise varışta çözülür. `spin`: tur sayısı. */
function travel(scene: Phaser.Scene, obj: Phaser.GameObjects.Image, to: { x: number; y: number }, dur: number, o: { ease?: string; spin?: number; arc?: number; trail?: (x: number, y: number) => void; trailEvery?: number } = {}): Promise<void> {
  const from = { x: obj.x, y: obj.y };
  const rot0 = obj.rotation;
  let nextTrail = 0;
  return counter(
    scene,
    slow(dur),
    (u) => {
      const e = o.ease === 'in' ? u * u : o.ease === 'out' ? 1 - (1 - u) ** 2 : u;
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e - Math.sin(u * Math.PI) * (o.arc ?? 0);
      obj.setPosition(snap(x), snap(y));
      if (o.spin) obj.setRotation(rot0 + Math.round(((u * o.spin * Math.PI * 2) / (Math.PI / 8))) * (Math.PI / 8));
      if (o.trail && u * dur >= nextTrail) {
        o.trail(obj.x, obj.y);
        nextTrail += o.trailEvery ?? 35;
      }
    },
  );
}

/** Köşegen pikselli yay (kılıç darbesi); soldan sağa süpürülür. */
function arcSlash(scene: Phaser.Scene, x: number, y: number, o: { r?: number; from?: number; to?: number; dir?: number; colors?: string[]; dur?: number; size?: number }): Promise<void> {
  const g = scene.add.graphics().setDepth(DEPTH + 40);
  const r = o.r ?? 78;
  const a0 = o.from ?? -1.0;
  const a1 = o.to ?? 1.0;
  const dir = o.dir ?? 1;
  const cols = (o.colors ?? ['#ffffff', '#ffe9b0', '#ffd23f']).map(color);
  const size = (o.size ?? 12) * PX * 1.4;
  const n = 44;
  return counter(scene, slow(o.dur ?? 170), (u) => {
    g.clear();
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      if (k > u || k < u - 0.55) continue;
      const a = a0 + (a1 - a0) * k;
      const px = snap(x + dir * Math.cos(a) * r * 0.55 + dir * 6);
      const py = snap(y + Math.sin(a) * r);
      const s = size * (1 - (u - k) * 1.1);
      g.fillStyle(cols[(i + Math.floor(u * 6)) % cols.length]!, 1).fillRect(px - s / 2, py - s / 2, Math.max(2, s), Math.max(2, s));
    }
    if (u >= 1) g.destroy();
  });
}

/** Küçük çarpma: kıvılcım + halka. */
function hit(scene: Phaser.Scene, x: number, y: number, colors: string[], size = 1): void {
  burst(scene, x, y, { colors, n: Math.round(10 * size), speed: [160, 420 * size], life: [260, 520], size: [8, 14] });
  void ring(scene, x, y + 40, { r: 70 * size, flat: 0.35, n: 16, colors, dur: 320, size: 8 });
}

/** Yer çatlağı: merkezden yere yayılan piksel çizgiler. */
function cracks(scene: Phaser.Scene, x: number, y: number, o: { len: number; n: number; flat?: number; dur?: number }): void {
  const g = scene.add.graphics().setDepth(DEPTH - 30);
  const lines = Array.from({ length: o.n }, (_, i) => {
    const a = (i / o.n) * Math.PI * 2 + rnd(-0.2, 0.2);
    const pts: Array<[number, number]> = [];
    let px = 0;
    let py = 0;
    for (let s = 0; s < o.len / 6; s++) {
      px += Math.cos(a + rnd(-0.5, 0.5)) * 6;
      py += Math.sin(a + rnd(-0.5, 0.5)) * 6 * (o.flat ?? 0.4);
      pts.push([snap(x + px), snap(y + py)]);
    }
    return pts;
  });
  void counter(scene, slow(o.dur ?? 700), (u) => {
    g.clear();
    for (const pts of lines) {
      const shown = Math.min(pts.length, Math.ceil(pts.length * Math.min(1, u * 3)));
      for (let i = 0; i < shown; i++) g.fillStyle(0x15101c, 1 - Math.max(0, u - 0.5) * 2).fillRect(pts[i]![0], pts[i]![1], 4, 4);
    }
    if (u >= 1) g.destroy();
  });
}

const FIRE = ['#ff4d1a', '#ff8a1f', '#ffd23f', '#ffffff'];
const ICE = ['#ffffff', '#a8ebff', '#4aa3ff'];
const HOLY = ['#ffffff', '#fff0a0', '#ffd23f'];
const VOID = ['#b872ff', '#5a2a9c', '#15101c', '#a8ebff'];
const NATURE = ['#62d04b', '#2c7a2b', '#a8f08a'];
const BONE = ['#fdfaf2', '#d7dce6', '#98a2b4'];
const BLOOD = ['#e5463b', '#8e1f2c', '#ff7a6a'];
const DUST = ['#98a2b4', '#d7dce6', '#5b6579'];
const WOOD = ['#8c5a2b', '#e3b983', '#4a2e1a'];

// ---------------------------------------------------------------------------------------------------------------------
// WARRIOR

/** Hedefin hemen yanında (kendi tarafına bakan yüzde) durulacak nokta: aynı zemin çizgisi. */
const standNear = (actor: CombatantView, target: CombatantView) => {
  const dir = dirTo(actor, target.container);
  return { x: target.container.x - dir * (target.w * 0.5 + actor.w * 0.5 + 6), y: target.container.y, dir };
};

/**
 * Yakın dövüşçü, vuracağı en yakın hedefin yanına koşar ve vuruş duruşuna geçer (vuruş anında çözülür); kısa süre sonra kendiliğinden
 * yerine döner. Tüm yakın dövüş skill'lerinin ortak hareketi (`VfxCtx.lunge`).
 */
export async function meleeApproach(scene: Phaser.Scene, actor: CombatantView, targets: CombatantView[]): Promise<void> {
  if (!targets.length) return;
  const near = targets.reduce((m, t) => (Math.abs(t.container.x - actor.container.x) < Math.abs(m.container.x - actor.container.x) ? t : m));
  const stand = standNear(actor, near);
  await actor.approach(stand.x, stand.y, 170);
  actor.play('attack');
  scene.tweens.add({ targets: actor.container, x: stand.x + stand.dir * 22, duration: slow(60), yoyo: true });
  void wait(scene, slow(330)).then(() => actor.returnHome());
}

/** Sersemletme: hedefin kafası üstünde dönen yıldızlar. */
function stunStars(scene: Phaser.Scene, t: CombatantView): void {
  const stars = Array.from({ length: 3 }, () => sprite(scene, 'spark', '#ffd23f', t.container.x, t.container.y - t.h - 10, 40, DEPTH + 50));
  void counter(scene, slow(900), (u) => {
    stars.forEach((st, i) => {
      const a = u * Math.PI * 5 + (i * Math.PI * 2) / 3;
      st.setPosition(snap(t.container.x + Math.cos(a) * 44), snap(t.container.y - t.h - 8 + Math.sin(a) * 12)).setAlpha(u > 0.8 ? (1 - u) / 0.2 : 1);
    });
    if (u >= 1) for (const st of stars) st.destroy();
  });
}

/** Double Strike: hedefin yanına koşar, kılıcı iki kez çapraz savurur; ikinci vuruş ikinci hasar rakamından hemen önce oynar. */
const doublestrike = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const stand = standNear(c.actor, t);
  c.sfx('armorRun');
  await c.actor.approach(stand.x, stand.y, 180);
  const swing = async (i: number) => {
    c.actor.play('attack');
    c.sfx('axeSwing');
    // kısa geri çekiliş (hazırlık), sonra öne atılış
    await new Promise<void>((resolve) => c.scene.tweens.add({ targets: c.actor.container, x: stand.x - stand.dir * 22, duration: slow(70), onComplete: () => resolve() }));
    c.scene.tweens.add({ targets: c.actor.container, x: stand.x + stand.dir * 26, duration: slow(60), yoyo: true });
    await wait(c.scene, slow(40));
    const p = spot(t);
    const up = i === 1;
    void arcSlash(c.scene, p.x - stand.dir * 6, p.y, { dir: stand.dir, from: up ? 1.25 : -1.25, to: up ? -1.25 : 1.25, r: up ? 128 : 112, dur: 150, size: 18, colors: up ? ['#ffffff', '#a8ebff', '#ffffff'] : ['#ffffff', '#ffe9b0', '#ffd23f'] });
    void arcSlash(c.scene, p.x - stand.dir * 6, p.y + (up ? -10 : 10), { dir: stand.dir, from: up ? 1.25 : -1.25, to: up ? -1.25 : 1.25, r: up ? 150 : 132, dur: 190, size: 8, colors: ['#ffffff'] });
    c.sfx('axeChop');
    hit(c.scene, p.x, p.y, up ? ['#ffffff', '#a8ebff', '#ffe9b0'] : ['#ffffff', '#ffe9b0', '#ffd23f'], up ? 1.4 : 1.1);
    c.scene.tweens.add({ targets: t.container, x: t.container.x + stand.dir * 16, duration: slow(50), yoyo: true });
    shake(c.scene, 90, up ? 0.004 : 0.003);
    await wait(c.scene, slow(60));
  };
  await swing(0);
  c.gate(
    1,
    async () => {
      await swing(1);
      void c.actor.returnHome();
    },
    () => void c.actor.returnHome(),
  );
};

/** Charge: hızla hedefin yanına kadar koşar (arkasında hız izi), omuzla çarpar ve sersemletir. */
const charge = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const stand = standNear(c.actor, t);
  c.sfx('armorCharge');
  const streaks = c.scene.time.addEvent({
    delay: 24,
    repeat: 20,
    callback: () => {
      const v = c.actor.container;
      for (let k = 0; k < 3; k++) {
        const len = rnd(70, 150);
        const sx = v.x - stand.dir * (len / 2 + 30);
        const line = c.scene.add.rectangle(sx, v.y - rnd(20, c.actor.h * 0.9), len, rnd(2, 4), color(pick(['#ffffff', '#ffe9b0', '#ffd23f'])), 0.9).setDepth(DEPTH + 10);
        c.scene.tweens.add({ targets: line, alpha: 0, scaleX: 0.3, duration: slow(220), onComplete: () => line.destroy() });
      }
      burst(c.scene, v.x - stand.dir * 20, v.y - 6, { colors: DUST, n: 2, speed: [20, 90], angle: [Math.PI * 1.1, Math.PI * 1.9], gravity: 90, life: [260, 480], size: [10, 20] });
    },
  });
  await c.actor.approach(stand.x, stand.y, 260, 0xffe9b0);
  streaks.remove();
  // çarpma: omuz darbesi
  c.sfx('armorCrash');
  c.sfx('stunChime');
  const p = spot(t);
  for (let i = 0; i < 3; i++) void arcSlash(c.scene, p.x, p.y + (i - 1) * 16, { dir: stand.dir, from: -0.45, to: 0.45, r: 100 + i * 16, colors: ['#ffffff', '#ffd23f'], dur: 140, size: 16 });
  hit(c.scene, p.x, p.y, ['#ffffff', '#ffd23f', '#ff8a1f'], 1.7);
  void ring(c.scene, t.container.x, t.container.y - 6, { r: 170, flat: 0.3, n: 26, colors: DUST, dur: 440, size: 12 });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + stand.dir * 18, duration: slow(60), yoyo: true });
  shake(c.scene, 150, 0.004);
  stunStars(c.scene, t);
  await wait(c.scene, slow(90));
  void c.actor.returnHome(260, 0xffe9b0);
};

/** Whirlwind: hedefin yanına koşar ve baltasıyla 5 kez hızla döner; balta etrafında yörüngede döner, her turda halka çıkar. */
const whirlwind = async (c: VfxCtx) => {
  if (!c.targets.length) return;
  const near = c.targets.reduce((m, t) => (Math.abs(t.container.x - c.actor.container.x) < Math.abs(m.container.x - c.actor.container.x) ? t : m));
  const nearStand = standNear(c.actor, near);
  // sıranın ortasına gider: hedeflerin ön sırasının orta hücresi (yoksa en yakın hedefin yanı)
  const stand = { x: c.rowCenter?.x ?? nearStand.x, y: c.rowCenter?.y ?? nearStand.y, dir: nearStand.dir };
  c.sfx('armorRun');
  await c.actor.approach(stand.x, stand.y, 230);
  const v = c.actor.container;
  const axes = [0, Math.PI].map((o) => ({ o, s: sprite(c.scene, 'axe', '#ffe9b0', v.x, v.y, 112, DEPTH + 30) }));
  c.actor.play('attack');
  const turns = 5;
  const total = 700;
  let lastTurn = -1;
  await counter(c.scene, slow(total), (u) => {
    const ang = u * turns * Math.PI * 2;
    v.setScale(Math.cos(ang), 1);
    const cy = v.y - c.actor.h * 0.5;
    for (const a of axes) {
      const q = ang * 1.0 + a.o;
      a.s.setPosition(snap(v.x + Math.cos(q) * 96), snap(cy + Math.sin(q) * 30)).setRotation(Math.round((q + Math.PI / 2) / (Math.PI / 12)) * (Math.PI / 12)).setAlpha(u > 0.92 ? (1 - u) / 0.08 : 1);
    }
    const turn = Math.floor(u * turns);
    if (turn !== lastTurn && u < 1) {
      lastTurn = turn;
      c.sfx('axeSwing');
      void ring(c.scene, v.x, v.y - 4, { r: 130, flat: 0.32, n: 20, colors: ['#ffffff', '#ffe9b0', '#98a2b4'], dur: 260, size: 10 });
      burst(c.scene, v.x, v.y - 10, { colors: DUST, n: 4, speed: [60, 200], angle: [Math.PI * 1.05, Math.PI * 1.95], gravity: 200, life: [250, 450], size: [10, 18] });
      if (turn === 0 || turn % 2 === 0) for (const t of c.targets) hit(c.scene, t.container.x, t.container.y - t.h * 0.5, ['#ffffff', '#ffe9b0'], 0.5);
    }
    if (u >= 1) v.setScale(1);
  });
  for (const a of axes) a.s.destroy();
  c.actor.play('idle');
  c.sfx('axeChop');
  for (const t of c.targets) {
    const p = spot(t);
    void arcSlash(c.scene, p.x, p.y, { dir: stand.dir, from: -1.4, to: 1.4, r: 90, dur: 140 });
    hit(c.scene, p.x, p.y, ['#ffffff', '#ffe9b0', '#ffd23f'], 1.3);
  }
  shake(c.scene, 150, 0.004);
  void c.actor.returnHome(240);
};

const warcry = async (c: VfxCtx) => {
  c.sfx('scream');
  const p = spot(c.actor);
  c.actor.play('cast');
  const facing = c.actor.combatant.side === 'party' ? 0 : Math.PI;
  flash(c.scene, '#8e1f2c', 0.28, 520);
  for (let i = 0; i < 3; i++) {
    void wait(c.scene, slow(i * 110)).then(() => ring(c.scene, p.x, p.y, { r: 260 + i * 60, flat: 0.8, n: 20, colors: ['#e5463b', '#ff7a6a', '#ffffff'], dur: 520, size: 14, startR: 30, arc: [facing - 0.9, facing + 0.9] }));
  }
  burst(c.scene, p.x, p.y + 40, { colors: ['#e5463b', '#ff8a1f', '#ffd23f'], n: 26, speed: [60, 220], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: -120, life: [500, 900], size: [8, 16] });
  void ring(c.scene, c.actor.container.x, c.actor.container.y - 4, { r: 110, flat: 0.3, n: 24, colors: ['#e5463b', '#8e1f2c'], dur: 600, size: 12 });
  shake(c.scene, 220, 0.004);
  await wait(c.scene, slow(420));
  c.actor.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------------
// PALADIN

const holysword = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const s = sprite(c.scene, 'holystrike', '#fff0a0', p.x, -120, 192, DEPTH + 30).setRotation((3 * Math.PI) / 4);
      const trail = (x: number, y: number) => burst(c.scene, x - 40, y - 60, { colors: HOLY, n: 2, speed: [10, 60], angle: [-Math.PI, 0], gravity: 80, life: [250, 450], size: [8, 12] });
      await travel(c.scene, s, { x: p.x, y: p.y - 30 }, 330, { ease: 'in', trail, trailEvery: 28 });
      const col = c.scene.add.rectangle(p.x, p.y - 260, 96, 560, color('#fff0a0'), 0.75).setDepth(DEPTH + 10);
      const core = c.scene.add.rectangle(p.x, p.y - 260, 36, 560, 0xffffff, 0.95).setDepth(DEPTH + 11);
      c.scene.tweens.add({ targets: [col, core], alpha: 0, scaleX: 0.2, duration: slow(380), onComplete: () => { col.destroy(); core.destroy(); } });
      hit(c.scene, p.x, p.y, HOLY, 1.3);
      for (let i = 0; i < 4; i++) {
        const f = sprite(c.scene, 'plume', '#ffffff', p.x + rnd(-50, 50), p.y + rnd(-10, 40), 48, DEPTH + 40);
        c.scene.tweens.add({ targets: f, y: f.y - rnd(80, 160), x: f.x + rnd(-40, 40), alpha: 0, duration: slow(700), onComplete: () => f.destroy() });
      }
      c.scene.tweens.add({ targets: s, alpha: 0, duration: slow(260), onComplete: () => s.destroy() });
    }),
  );
};

const resurrect = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  const t = c.targets[0];
  if (!t) return;
  const f = feet(t);
  const body = spot(t);
  const base = sprite(c.scene, 'runering', '#ffd23f', f.x, f.y, 260, DEPTH - 10).setScale(1.2, 0.42).setAlpha(0.9);
  c.scene.tweens.add({ targets: base, angle: 360, duration: slow(1200), onComplete: () => base.destroy() });
  const col = c.scene.add.rectangle(f.x, f.y - 320, 120, 640, color('#fff0a0'), 0.55).setDepth(DEPTH + 10).setScale(0.1, 1);
  const core = c.scene.add.rectangle(f.x, f.y - 320, 44, 640, 0xffffff, 0.9).setDepth(DEPTH + 11).setScale(0.1, 1);
  c.scene.tweens.add({ targets: [col, core], scaleX: 1, duration: slow(220), ease: 'Quad.easeOut' });
  const ankh = sprite(c.scene, 'ankh', '#ffd23f', f.x, body.y - 60, 112, DEPTH + 40).setAlpha(0);
  c.scene.tweens.add({ targets: ankh, alpha: 1, y: body.y - 150, duration: slow(520), ease: 'Quad.easeOut', yoyo: false });
  for (let i = 0; i < 14; i++) {
    void wait(c.scene, slow(i * 40)).then(() => {
      const p = sprite(c.scene, i % 3 === 0 ? 'plume' : 'spark', '#ffd23f', f.x + rnd(-60, 60), f.y - rnd(0, 40), i % 3 === 0 ? 40 : 32, DEPTH + 30);
      c.scene.tweens.add({ targets: p, y: p.y - rnd(180, 380), alpha: 0, duration: slow(800), onComplete: () => p.destroy() });
    });
  }
  await wait(c.scene, slow(560));
  flash(c.scene, '#fff0a0', 0.35, 360);
  c.scene.tweens.add({ targets: [col, core, ankh], alpha: 0, duration: slow(380), onComplete: () => { col.destroy(); core.destroy(); ankh.destroy(); } });
};

const judgment = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  const cell = c.cells[0] ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  const cx = cell.x;
  const cy = cell.y - 50;
  const shadow = c.scene.add.ellipse(cx, cy + 36, 40, 14, 0x000000, 0.35).setDepth(DEPTH - 40);
  c.scene.tweens.add({ targets: shadow, scaleX: 5, scaleY: 3, duration: slow(520) });
  const h = sprite(c.scene, 'judgehammer', '#fff0a0', cx, -240, 320, DEPTH + 30).setRotation(Math.PI);
  await travel(c.scene, h, { x: cx, y: cy - 60 }, 520, { ease: 'in', trail: (x, y) => burst(c.scene, x, y - 120, { colors: HOLY, n: 2, speed: [10, 50], angle: [-Math.PI, 0], gravity: 0, life: [300, 500], size: [8, 14] }), trailEvery: 30 });
  flash(c.scene, '#ffffff', 0.5, 300);
  shake(c.scene, 260, 0.009);
  void ring(c.scene, cx, cy + 40, { r: 260, flat: 0.32, n: 40, colors: HOLY, dur: 560, size: 14 });
  void ring(c.scene, cx, cy + 40, { r: 150, flat: 0.32, n: 28, colors: ['#ffffff', '#ffd23f'], dur: 420, size: 12 });
  burst(c.scene, cx, cy + 20, { colors: HOLY, n: 36, speed: [140, 520], angle: [-Math.PI, 0], gravity: 700, life: [500, 900], size: [8, 18] });
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const beam = c.scene.add.rectangle(cx + Math.cos(a) * 60, cy + 20 + Math.sin(a) * 60 * 0.4, a % Math.PI === 0 ? 130 : 20, a % Math.PI === 0 ? 20 : 130, color('#fff0a0'), 0.9).setDepth(DEPTH + 35);
    c.scene.tweens.add({ targets: beam, alpha: 0, scaleX: a % Math.PI === 0 ? 2 : 1, scaleY: a % Math.PI === 0 ? 1 : 2, duration: slow(420), onComplete: () => beam.destroy() });
  }
  c.scene.tweens.add({ targets: [h, shadow], alpha: 0, duration: slow(380), onComplete: () => { h.destroy(); shadow.destroy(); } });
};

// ---------------------------------------------------------------------------------------------------------------------
// MAGE

const fireball = async (c: VfxCtx) => {
  await c.windUp('#ff7a1a');
  await Promise.all(
    c.targets.map(async (t) => {
      const a = spot(c.actor);
      const p = spot(t);
      const s = sprite(c.scene, 'fireball', '#ff7a1a', a.x + dirTo(c.actor, p) * 40, a.y, 128, DEPTH + 30);
      if (p.x < a.x) s.setFlipX(true);
      await travel(c.scene, s, p, 340, { ease: 'in', trail: (x, y) => burst(c.scene, x, y, { colors: FIRE, n: 3, speed: [20, 110], gravity: -80, life: [260, 520], size: [8, 16] }), trailEvery: 24 });
      s.destroy();
      burst(c.scene, p.x, p.y, { colors: FIRE, n: 30, speed: [120, 520], gravity: 200, life: [380, 780], size: [10, 22] });
      void ring(c.scene, p.x, p.y + 30, { r: 130, flat: 0.5, n: 26, colors: FIRE, dur: 420, size: 14 });
      const boom = sprite(c.scene, 'ember', '#ffd23f', p.x, p.y, 96, DEPTH + 45);
      c.scene.tweens.add({ targets: boom, displayWidth: 240, displayHeight: 240, alpha: 0, duration: slow(380), onComplete: () => boom.destroy() });
      shake(c.scene, 110, 0.003);
    }),
  );
};

const blizzard = async (c: VfxCtx) => {
  await c.windUp('#8fd8ff');
  const spots = c.cells.length ? c.cells : c.targets.map((t) => feet(t));
  for (const cell of spots) {
    for (let i = 0; i < 12; i++) {
      void wait(c.scene, slow(i * 28)).then(() => {
        const fl = sprite(c.scene, 'flake', '#ffffff', cell.x + rnd(-70, 70), -40, i % 2 ? 24 : 16, DEPTH + 20);
        c.scene.tweens.add({ targets: fl, y: cell.y - rnd(20, 120), x: fl.x + rnd(-60, 60), alpha: 0.2, duration: slow(rnd(380, 560)), onComplete: () => fl.destroy() });
      });
    }
  }
  const jobs: Promise<void>[] = [];
  for (const cell of spots) {
    for (let i = 0; i < 3; i++) {
      jobs.push(
        (async () => {
          await wait(c.scene, slow(i * 90 + rnd(0, 80)));
          const x = cell.x + rnd(-60, 60);
          const y = cell.y - rnd(30, 120);
          const s = sprite(c.scene, 'shard', '#8fd8ff', x + rnd(-50, 50), -100, 96, DEPTH + 30).setRotation(rnd(-0.25, 0.25));
          await travel(c.scene, s, { x, y }, 300, { ease: 'in' });
          s.destroy();
          burst(c.scene, x, y, { colors: ICE, n: 12, speed: [100, 340], gravity: 500, life: [300, 560], size: [8, 14] });
          void ring(c.scene, x, y + 30, { r: 70, flat: 0.4, n: 14, colors: ICE, dur: 360, size: 8 });
        })(),
      );
    }
  }
  await Promise.all(jobs);
};

const barrier = async (c: VfxCtx) => {
  await c.windUp('#6ec1ff');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const dome = sprite(c.scene, 'manabarrier', '#6ec1ff', p.x, p.y, 224, DEPTH + 25).setAlpha(0.85);
      const rune = sprite(c.scene, 'runering', '#9fe8ff', p.x, p.y, 256, DEPTH + 26).setAlpha(0.9);
      grow(c.scene, dome, 0.2, 1, 300, 'Back.easeOut');
      c.scene.tweens.add({ targets: rune, angle: 200, duration: slow(900) });
      burst(c.scene, p.x, p.y, { colors: ICE, n: 16, speed: [60, 200], gravity: -40, life: [500, 900], size: [8, 12] });
      void ring(c.scene, t.container.x, t.container.y - 6, { r: 100, flat: 0.3, n: 20, colors: ['#4aa3ff', '#a8ebff'], dur: 520, size: 10 });
      await wait(c.scene, slow(420));
      c.scene.tweens.add({ targets: [dome, rune], alpha: 0, duration: slow(420), onComplete: () => { dome.destroy(); rune.destroy(); } });
    }),
  );
};

const meteor = async (c: VfxCtx) => {
  await c.windUp('#ff4d1a');
  const cell = c.cells[0] ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  const cx = cell.x;
  const cy = cell.y - 30;
  // gökyüzü kızarır, zeminde gölge ve ısı halkası büyür
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x20060a, 0).setDepth(DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.32, duration: slow(420) });
  const shadow = c.scene.add.ellipse(cx, cy + 40, 40, 14, 0x000000, 0.4).setDepth(DEPTH - 40);
  const heat = c.scene.add.ellipse(cx, cy + 40, 40, 14, 0xff4d1a, 0).setStrokeStyle(4, 0xff8a1f, 0.7).setDepth(DEPTH - 39);
  c.scene.tweens.add({ targets: [shadow, heat], scaleX: 9, scaleY: 4.5, duration: slow(780) });
  // meteor: sağa bakan sprite, gidiş yönüne döndürülür; iki kare alev titremesi
  const startX = cx - 760;
  const startY = -340;
  const ang = Math.atan2(cy - startY, cx - startX);
  const m = sprite(c.scene, 'meteorbody', '#ff4d1a', startX, startY, 288, DEPTH + 30).setRotation(Math.round(ang / (Math.PI / 24)) * (Math.PI / 24));
  const flicker = c.scene.time.addEvent({ delay: slow(70), loop: true, callback: () => m.setTexture(ensureIcon(c.scene, m.texture.key.includes('meteorbody2') ? 'meteorbody' : 'meteorbody2', '#ff4d1a', false)) });
  await travel(c.scene, m, { x: cx, y: cy - 10 }, 780, {
    ease: 'in',
    trail: (x, y) => {
      burst(c.scene, x - Math.cos(ang) * 90, y - Math.sin(ang) * 90, { colors: FIRE, n: 3, speed: [10, 90], gravity: -60, life: [350, 700], size: [10, 26] });
      burst(c.scene, x - Math.cos(ang) * 140, y - Math.sin(ang) * 140, { colors: ['#3a2a2a', '#5b6579', '#98a2b4'], n: 2, speed: [10, 60], gravity: -40, life: [500, 900], size: [14, 30] });
    },
    trailEvery: 20,
  });
  flicker.remove();
  m.destroy();
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: slow(900), onComplete: () => dim.destroy() });
  shadow.destroy();
  heat.destroy();
  // çarpışma: kısa donma, beyaz parlama, çok katmanlı ateş topu
  flash(c.scene, '#fff2c0', 0.7, 300);
  shake(c.scene, 380, 0.014);
  const layers: Array<[string, string, number, number]> = [['ember', '#ff4d1a', 520, 520], ['ember', '#ff8a1f', 400, 420], ['ember', '#ffd23f', 260, 330], ['spark', '#ffffff', 300, 280]];
  for (const [name, hex, size, dur] of layers) {
    const e = sprite(c.scene, name, hex, cx, cy, 90, DEPTH + 45);
    grow(c.scene, e, 0.3, size / 90, dur, 'Cubic.easeOut', { alpha: 0, onComplete: () => e.destroy() });
  }
  void ring(c.scene, cx, cy + 44, { r: 400, flat: 0.34, n: 60, colors: FIRE, dur: 680, size: 14 });
  void ring(c.scene, cx, cy + 44, { r: 240, flat: 0.34, n: 40, colors: ['#ffffff', '#ffd23f'], dur: 480, size: 12 });
  burst(c.scene, cx, cy, { colors: FIRE, n: 56, speed: [180, 720], angle: [-Math.PI, 0], gravity: 800, life: [600, 1200], size: [10, 26] });
  burst(c.scene, cx, cy + 10, { colors: ['#3a2a2a', '#5b6579', '#98a2b4'], n: 24, speed: [40, 220], angle: [-Math.PI, 0], gravity: -90, life: [900, 1600], size: [16, 40] });
  for (let i = 0; i < 10; i++) {
    const r = sprite(c.scene, 'rock', '#98a2b4', cx, cy, 44 + (i % 3) * 14, DEPTH + 46);
    const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
    const sp = rnd(260, 620);
    const spin = rnd(-5, 5);
    void counter(c.scene, slow(1000), (u) => {
      const t = u * 1.0;
      r.setPosition(snap(cx + Math.cos(a) * sp * t), snap(cy + Math.sin(a) * sp * t + 0.5 * 950 * t * t)).setRotation(spin * u).setAlpha(1 - u * u);
      if (u >= 1) r.destroy();
    });
  }
  // yanık iz
  const scorch = c.scene.add.ellipse(cx, cy + 44, 300, 90, 0x15101c, 0.55).setDepth(DEPTH - 45);
  c.scene.tweens.add({ targets: scorch, alpha: 0, duration: slow(1800), delay: slow(400), onComplete: () => scorch.destroy() });
  await wait(c.scene, slow(90));
};

// ---------------------------------------------------------------------------------------------------------------------
// UNDEAD

const bonethrow = async (c: VfxCtx) => {
  await c.windUp('#b36bff', 'attack');
  await Promise.all(
    c.targets.map(async (t) => {
      const a = spot(c.actor);
      const p = spot(t);
      const s = sprite(c.scene, 'bonethrow', '#b36bff', a.x + dirTo(c.actor, p) * 30, a.y, 96, DEPTH + 30);
      await travel(c.scene, s, p, 360, { spin: 3, arc: 70, trail: (x, y) => burst(c.scene, x, y, { colors: ['#b872ff', '#5a2a9c', '#fdfaf2'], n: 2, speed: [10, 60], gravity: 0, life: [260, 480], size: [8, 12] }), trailEvery: 28 });
      s.destroy();
      for (let i = 0; i < 6; i++) {
        const piece = sprite(c.scene, 'splinter', '#fdfaf2', p.x, p.y, 40, DEPTH + 45).setRotation(rnd(0, Math.PI * 2));
        c.scene.tweens.add({ targets: piece, x: p.x + rnd(-110, 110), y: p.y + rnd(-90, 60), rotation: piece.rotation + rnd(-4, 4), alpha: 0, duration: slow(520), onComplete: () => piece.destroy() });
      }
      hit(c.scene, p.x, p.y, ['#fdfaf2', '#b872ff', '#d7dce6']);
    }),
  );
};

/**
 * Blood Rite: kan çemberi açılır, hedefin etrafında yerden çürümüş eller fışkırır, pençe gibi kıvrılıp hedefi tırmalar
 * (kırmızı pençe izleri + kan), sonra toprağa gömülürler.
 */
const bloodhands = async (c: VfxCtx) => {
  await c.windUp('#c0203a', 'cast');
  await Promise.all(
    c.targets.map(async (t) => {
      const x = t.container.x;
      const y = t.container.y;
      const p = spot(t);
      const circle = sprite(c.scene, 'circle', '#e5463b', x, y - 6, 240, DEPTH - 30).setScale(1.3, 0.46).setAlpha(0);
      c.scene.tweens.add({ targets: circle, alpha: 0.95, angle: 60, duration: slow(600) });
      const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x20060a, 0).setDepth(DEPTH - 25);
      c.scene.tweens.add({ targets: dim, alpha: 0.28, duration: slow(300) });
      burst(c.scene, x, y - 10, { colors: ['#8e1f2c', '#e5463b'], n: 10, speed: [20, 90], angle: [-Math.PI, 0], gravity: -50, life: [600, 1000], size: [10, 18] });
      const spots = [-92, -58, -22, 22, 58, 92, 0].map((dx, i) => ({ dx, dy: [-10, 8, -4, -2, 10, -8, 14][i]!, lean: dx === 0 ? 0 : Math.sign(dx) * -0.18 }));
      const hands: Phaser.GameObjects.Image[] = [];
      // 1) eller toprak yarıp çıkar
      await Promise.all(
        spots.map(async (sp, i) => {
          await wait(c.scene, slow(i * 55));
          const hx = x + sp.dx;
          const hy = y + sp.dy;
          cracks(c.scene, hx, hy, { len: 70, n: 5, dur: 600 });
          burst(c.scene, hx, hy, { colors: ['#4a2e1a', '#8c5a2b', '#5b6579'], n: 9, speed: [60, 240], angle: [-Math.PI, 0], gravity: 700, life: [350, 650], size: [8, 16] });
          const hand = sprite(c.scene, 'undeadhand', '#8e1f2c', hx, hy + 6, 168, y + sp.dy + 3).setRotation(sp.lean);
          sprout(c.scene, hand, 260);
          hands.push(hand);
          const mound = sprite(c.scene, 'dust', '#5b6579', hx, hy + 4, 44, y + sp.dy + 4);
          c.scene.tweens.add({ targets: mound, alpha: 0, duration: slow(700), onComplete: () => mound.destroy() });
        }),
      );
      shake(c.scene, 120, 0.003);
      await wait(c.scene, slow(180));
      // 2) pençe: eller kıvrılır ve hedefi tırmalar
      hands.forEach((h, i) => {
        void wait(c.scene, slow(i * 70)).then(() => {
          h.setTexture(ensureIcon(c.scene, 'undeadhand2', '#8e1f2c', false));
          const toward = Math.sign(x - h.x) || 1;
          c.scene.tweens.add({ targets: h, x: h.x + toward * 26, y: h.y - 24, rotation: toward * 0.7, duration: slow(80), yoyo: true, ease: 'Quad.easeOut' });
          const q = { x: p.x + rnd(-10, 10), y: p.y + rnd(-26, 26) };
          for (let k = 0; k < 3; k++) void arcSlash(c.scene, q.x, q.y + (k - 1) * 12, { dir: toward, from: -0.8, to: 0.8, r: 74, colors: ['#ffffff', '#e5463b', '#8e1f2c'], dur: 110, size: 12 });
          burst(c.scene, q.x, q.y, { colors: BLOOD, n: 14, speed: [100, 380], gravity: 700, life: [400, 800], size: [8, 16] });
          c.scene.tweens.add({ targets: t.container, x: t.container.x + toward * 8, duration: slow(40), yoyo: true });
        });
      });
      await wait(c.scene, slow(hands.length * 70 + 120));
      shake(c.scene, 160, 0.005);
      flash(c.scene, '#8e1f2c', 0.22, 300);
      // 3) eller toprağa gömülür
      for (const h of hands) {
        c.scene.tweens.add({ targets: h, scaleY: 0.02, alpha: 0, duration: slow(420), delay: slow(160), ease: 'Quad.easeIn', onComplete: () => h.destroy() });
      }
      c.scene.tweens.add({ targets: [circle, dim], alpha: 0, duration: slow(520), delay: slow(200), onComplete: () => { circle.destroy(); dim.destroy(); } });
    }),
  );
};

const wail = async (c: VfxCtx) => {
  await c.windUp('#b36bff');
  const a = spot(c.actor);
  const cell = c.cells[0] ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  const g = sprite(c.scene, 'wail', '#b36bff', a.x, a.y, 128, DEPTH + 30);
  if (cell.x < a.x) g.setFlipX(true);
  await travel(c.scene, g, { x: cell.x, y: cell.y - 90 }, 460, { arc: 90, trail: (x, y) => burst(c.scene, x, y, { colors: ['#b872ff', '#5a2a9c', '#a8ebff'], n: 3, speed: [10, 80], gravity: -40, life: [300, 560], size: [8, 16] }), trailEvery: 26 });
  c.scene.tweens.add({ targets: g, displayWidth: 260, displayHeight: 260, alpha: 0, duration: slow(420), onComplete: () => g.destroy() });
  flash(c.scene, '#5a2a9c', 0.3, 420);
  shake(c.scene, 220, 0.005);
  for (const q of c.cells.length ? c.cells : [cell]) {
    void ring(c.scene, q.x, q.y - 40, { r: 150, flat: 0.5, n: 28, colors: ['#b872ff', '#5a2a9c', '#ffffff'], dur: 620, size: 12, startR: 20 });
    burst(c.scene, q.x, q.y - 20, { colors: ['#b872ff', '#a8ebff', '#5a2a9c'], n: 12, speed: [40, 160], angle: [-Math.PI, 0], gravity: -160, life: [600, 1000], size: [8, 14] });
    const w = sprite(c.scene, 'wisp', '#b36bff', q.x + rnd(-30, 30), q.y - 20, 64, DEPTH + 40);
    c.scene.tweens.add({ targets: w, y: w.y - 160, alpha: 0, duration: slow(900), onComplete: () => w.destroy() });
  }
};

const raise = async (c: VfxCtx) => {
  await c.windUp('#b36bff');
  const f = feet(c.actor);
  const circle = sprite(c.scene, 'circle', '#b36bff', f.x, f.y, 240, DEPTH - 20).setScale(1.2, 0.44);
  c.scene.tweens.add({ targets: circle, angle: 180, alpha: 0, duration: slow(900), onComplete: () => circle.destroy() });
  burst(c.scene, f.x, f.y - 20, { colors: VOID, n: 14, speed: [40, 140], angle: [-Math.PI, 0], gravity: -100, life: [500, 900], size: [8, 14] });
};

const bonestrike = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  for (const t of c.targets) {
    const p = spot(t);
    void arcSlash(c.scene, p.x, p.y, { dir: dirTo(c.actor, p), colors: BONE, from: -0.9, to: 0.9 });
    hit(c.scene, p.x, p.y, BONE);
  }
};

// ---------------------------------------------------------------------------------------------------------------------
// ARCHER

/** 16x16 ok ikonu kuzeydoğuya bakar; verilen yöne (radyan) döndürmek için eklenecek açı. */
const arrowRot = (angle: number) => Math.round((angle + Math.PI / 4) / (Math.PI / 8)) * (Math.PI / 8);

const arrowshot = async (c: VfxCtx) => {
  c.actor.play('attack');
  const wind = c.actor.container;
  burst(c.scene, wind.x, wind.y - 80, { colors: ['#d9c9a3', '#ffffff'], n: 6, speed: [60, 160], angle: [Math.PI * 0.8, Math.PI * 1.2], gravity: 0, life: [200, 360], size: [8, 12] });
  await Promise.all(
    c.targets.map(async (t) => {
      const a = spot(c.actor);
      const p = spot(t);
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      const s = sprite(c.scene, 'arrow', '#d9c9a3', a.x, a.y, 96, DEPTH + 30).setRotation(arrowRot(ang));
      await travel(c.scene, s, p, 210, { trail: (x, y) => burst(c.scene, x, y, { colors: ['#ffffff', '#d9c9a3'], n: 1, speed: [0, 20], gravity: 0, life: [150, 260], size: [8, 8] }), trailEvery: 22 });
      s.destroy();
      hit(c.scene, p.x, p.y, ['#ffffff', '#d9c9a3', '#ffd23f'], 0.8);
    }),
  );
  c.actor.play('idle');
};

const pierce = async (c: VfxCtx) => {
  c.actor.play('attack');
  const a = spot(c.actor);
  const far = c.targets.length ? c.targets.reduce((m, t) => (Math.abs(t.container.x - a.x) > Math.abs(m.container.x - a.x) ? t : m)) : undefined;
  const end = far ? spot(far) : { x: a.x + 600, y: a.y };
  const ang = Math.atan2(end.y - a.y, end.x - a.x);
  const s = sprite(c.scene, 'pierce', '#ffd166', a.x, a.y, 128, DEPTH + 30).setRotation(arrowRot(ang));
  const total = Math.hypot(end.x - a.x, end.y - a.y) || 1;
  const done = new Set<CombatantView>();
  const dur = 460;
  await travel(c.scene, s, { x: end.x + Math.cos(ang) * 60, y: end.y + Math.sin(ang) * 60 }, dur, {
    trail: (x, y) => burst(c.scene, x, y, { colors: ['#ffd166', '#ffffff'], n: 2, speed: [0, 40], gravity: 0, life: [220, 380], size: [8, 12] }),
    trailEvery: 20,
  });
  for (const t of c.targets) done.add(t);
  s.destroy();
  for (const t of c.targets) {
    const p = spot(t);
    const frac = Math.hypot(p.x - a.x, p.y - a.y) / total;
    void wait(c.scene, slow(dur * 0.1 * (1 - frac))).then(() => hit(c.scene, p.x, p.y, ['#ffd166', '#ffffff'], 1));
  }
  c.actor.play('idle');
};

const arrowrain = async (c: VfxCtx) => {
  c.actor.play('attack');
  await c.windUp('#d9c9a3', 'attack');
  const spots = c.cells.length ? c.cells : c.targets.map((t) => feet(t));
  const jobs: Promise<void>[] = [];
  for (const cell of spots) {
    for (let i = 0; i < 4; i++) {
      jobs.push(
        (async () => {
          await wait(c.scene, slow(rnd(0, 380)));
          const x = cell.x + rnd(-62, 62);
          const y = cell.y - rnd(10, 110);
          const s = sprite(c.scene, 'arrow', '#d9c9a3', x - 60, -90, 80, DEPTH + 30).setRotation(arrowRot(Math.atan2(y + 90, 60)));
          await travel(c.scene, s, { x, y }, 260, { ease: 'in' });
          burst(c.scene, x, y + 10, { colors: DUST, n: 4, speed: [30, 140], angle: [-Math.PI, 0], gravity: 400, life: [250, 450], size: [6, 10] });
          c.scene.tweens.add({ targets: s, alpha: 0, duration: slow(380), delay: slow(120), onComplete: () => s.destroy() });
        })(),
      );
    }
  }
  await Promise.all(jobs);
  c.actor.play('idle');
};

const aimed = async (c: VfxCtx) => {
  c.actor.play('attack');
  const a = spot(c.actor);
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const reticle = sprite(c.scene, 'aimedshot', '#ff5a4a', p.x, p.y, 256, DEPTH + 35).setAlpha(0.95);
      c.scene.tweens.add({ targets: reticle, displayWidth: 112, displayHeight: 112, angle: 90, duration: slow(420), ease: 'Quad.easeIn' });
      await wait(c.scene, slow(440));
      flash(c.scene, '#ffffff', 0.18, 140);
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      const s = sprite(c.scene, 'arrow', '#ffd166', a.x, a.y, 128, DEPTH + 40).setRotation(arrowRot(ang));
      await travel(c.scene, s, p, 150, { trail: (x, y) => burst(c.scene, x, y, { colors: ['#ffd166', '#ffffff'], n: 3, speed: [10, 60], gravity: 0, life: [200, 340], size: [8, 14] }), trailEvery: 14 });
      s.destroy();
      reticle.destroy();
      hit(c.scene, p.x, p.y, ['#ffffff', '#ffd166', '#ff8a1f'], 1.8);
      const sp = sprite(c.scene, 'spark', '#ffd23f', p.x, p.y, 160, DEPTH + 50);
      c.scene.tweens.add({ targets: sp, displayWidth: 280, displayHeight: 280, alpha: 0, angle: 45, duration: slow(360), onComplete: () => sp.destroy() });
      shake(c.scene, 170, 0.006);
    }),
  );
  c.actor.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------------
// DRUID

/**
 * Thorn Whip: gerçek bir kırbaç hareketi. Dikenli sarmaşık önce kafanın arkasına doğru kıvrılır (geri savurma), sonra tepeden
 * hedefe doğru ileri fırlar; gövde bir Bézier eğrisi olarak çizilir, uç hedefe varınca gerilir ve "şaklar" (parlama, çarpma
 * halkası, yeşil kırbaç izi, yaprak/diken parçacıkları) ve geri çekilir.
 */
const thornwhip = async (c: VfxCtx) => {
  c.actor.play('attack');
  c.sfx('whipWind');
  await Promise.all(
    c.targets.map(async (t) => {
      const dir = dirTo(c.actor, t.container);
      const H = { x: c.actor.container.x + dir * 30, y: c.actor.container.y - c.actor.h * 0.58 };
      const P = spot(t);
      const B = { x: H.x - dir * 120, y: H.y - 190 }; // geri savurmada uç noktası (kafanın arkası, yukarıda)
      const g = c.scene.add.graphics().setDepth(DEPTH + 30);
      const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
      const draw = (tip: { x: number; y: number }, ctrl: { x: number; y: number }, ripple: number, alpha = 1) => {
        g.clear();
        const n = 56;
        const pts: Array<{ x: number; y: number; nx: number; ny: number }> = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const x = (1 - u) * (1 - u) * H.x + 2 * (1 - u) * u * ctrl.x + u * u * tip.x;
          const y = (1 - u) * (1 - u) * H.y + 2 * (1 - u) * u * ctrl.y + u * u * tip.y;
          const dx = 2 * (1 - u) * (ctrl.x - H.x) + 2 * u * (tip.x - ctrl.x);
          const dy = 2 * (1 - u) * (ctrl.y - H.y) + 2 * u * (tip.y - ctrl.y);
          const len = Math.hypot(dx, dy) || 1;
          const w = Math.sin(u * 14 - ripple * 12) * 9 * ripple * (1 - u * 0.4);
          pts.push({ x: snap(x + (-dy / len) * w), y: snap(y + (dx / len) * w), nx: -dy / len, ny: dx / len });
        }
        pts.forEach((q, i) => {
          const thick = 11 - (i / n) * 4;
          g.fillStyle(0x1f4d1c, alpha).fillRect(q.x - thick / 2 - 1, q.y - thick / 2 - 1, thick + 2, thick + 2);
          g.fillStyle(i % 2 ? 0x62d04b : 0x2c7a2b, alpha).fillRect(q.x - thick / 2, q.y - thick / 2, thick, thick);
          if (i % 7 === 3) {
            // diken: gövdeye dik beyaz sivri uç
            g.fillStyle(0xfdfaf2, alpha);
            g.fillTriangle(q.x, q.y, q.x + q.nx * 16 - q.ny * 3, q.y + q.ny * 16 + q.nx * 3, q.x + q.nx * 16 + q.ny * 3, q.y + q.ny * 16 - q.nx * 3);
          }
          if (i % 11 === 6) g.fillStyle(0xa8f08a, alpha).fillRect(q.x - 9, q.y - 3, 18, 6); // yaprak ucu
        });
        const e = pts[pts.length - 1]!;
        g.fillStyle(0x15101c, alpha).fillRect(e.x - 8, e.y - 8, 16, 16);
        g.fillStyle(0xfdfaf2, alpha).fillRect(e.x - 5, e.y - 5, 10, 10); // diken topuzu
      };
      // 1) geri savurma: sarmaşık kafanın arkasında kıvrılır
      await counter(
        c.scene,
        slow(260),
        (u) => {
          const tip = { x: lerp(H.x + dir * 12, B.x, u), y: lerp(H.y - 70, B.y, u) };
          draw(tip, { x: lerp(H.x + dir * 20, H.x - dir * 70, u), y: lerp(H.y - 90, H.y - 230, u) }, 0.3 * (1 - u));
        },
        'Quad.easeOut',
      );
      await wait(c.scene, slow(50));
      // 2) ileri fırlama: uç tepeden hedefe yay çizer, gövde geriden gelir
      await counter(
        c.scene,
        slow(170),
        (u) => {
          const e = u * u;
          const tip = { x: lerp(B.x, P.x, e), y: lerp(B.y, P.y, e) - Math.sin(e * Math.PI) * 120 };
          const mid = { x: (H.x + tip.x) / 2, y: (H.y + tip.y) / 2 };
          const backCtrl = { x: H.x - dir * 70, y: H.y - 230 };
          const k = Math.min(1, u * 1.35);
          draw(tip, { x: lerp(backCtrl.x, mid.x, k), y: lerp(backCtrl.y, mid.y - 30 * (1 - u), k) }, 0.25 * u);
        },
        'Quad.easeIn',
      );
      // 3) şak: gerilmiş sarmaşık + patlama
      c.sfx('whipCrack');
      draw(P, { x: (H.x + P.x) / 2, y: (H.y + P.y) / 2 + 4 }, 0);
      const crack = sprite(c.scene, 'spark', '#ffffff', P.x, P.y, 120, DEPTH + 60);
      grow(c.scene, crack, 0.4, 1.8, 220, 'Quad.easeOut', { alpha: 0, onComplete: () => crack.destroy() });
      void ring(c.scene, P.x, P.y, { r: 120, flat: 0.8, n: 26, colors: ['#ffffff', '#a8f08a', '#62d04b'], dur: 300, size: 10 });
      for (let i = 0; i < 3; i++) void arcSlash(c.scene, P.x, P.y + (i - 1) * 14, { dir, from: -0.9, to: 0.9, r: 100 + i * 14, colors: ['#ffffff', '#a8f08a', '#62d04b'], dur: 130, size: 14 });
      hit(c.scene, P.x, P.y, NATURE, 1.2);
      burst(c.scene, P.x, P.y, { colors: ['#62d04b', '#2c7a2b', '#fdfaf2'], n: 10, speed: [120, 380], gravity: 500, life: [400, 750], size: [8, 14] });
      for (let i = 0; i < 4; i++) {
        const leaf = sprite(c.scene, 'leafbit', '#7ed957', P.x + rnd(-20, 20), P.y + rnd(-20, 20), 36, DEPTH + 55);
        c.scene.tweens.add({ targets: leaf, x: leaf.x + rnd(-120, 120), y: leaf.y + rnd(-90, 60), rotation: rnd(-5, 5), alpha: 0, duration: slow(620), onComplete: () => leaf.destroy() });
      }
      c.sfx('leafRustle');
      shake(c.scene, 110, 0.004);
      c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 14, duration: slow(50), yoyo: true });
      await wait(c.scene, slow(70));
      // 4) geri çekilme: sarmaşık elin yanına toplanır
      void counter(
        c.scene,
        slow(200),
        (u) => {
          const tip = { x: lerp(P.x, H.x + dir * 12, u), y: lerp(P.y, H.y - 20, u) };
          draw(tip, { x: lerp((H.x + P.x) / 2, H.x, u), y: lerp((H.y + P.y) / 2 + 40, H.y - 40, u) }, 0.15 * u, 1 - u);
          if (u >= 1) g.destroy();
        },
        'Quad.easeIn',
      );
    }),
  );
  c.actor.play('idle');
};

const vines = async (c: VfxCtx) => {
  c.sfx('rootsRumble');
  await c.windUp('#7ed957');
  const spots = c.cells.length ? c.cells : c.targets.map((t) => feet(t));
  await Promise.all(
    spots.map(async (q, i) => {
      await wait(c.scene, slow(i * 60));
      const r = sprite(c.scene, 'roots', '#7ed957', q.x, q.y + 20, 192, DEPTH + 25);
      sprout(c.scene, r, 280);
      if (i === 0) {
        c.sfx('thud');
        c.sfx('leafRustle');
      }
      burst(c.scene, q.x, q.y, { colors: [...NATURE, '#8c5a2b'], n: 14, speed: [60, 260], angle: [-Math.PI, 0], gravity: 500, life: [400, 800], size: [8, 14] });
      void ring(c.scene, q.x, q.y, { r: 80, flat: 0.35, n: 16, colors: NATURE, dur: 400, size: 10 });
      await wait(c.scene, slow(380));
      for (let k = 0; k < 3; k++) {
        const leaf = sprite(c.scene, 'leafbit', '#7ed957', q.x + rnd(-40, 40), q.y - rnd(40, 120), 40, DEPTH + 40);
        c.scene.tweens.add({ targets: leaf, y: leaf.y - rnd(40, 100), x: leaf.x + rnd(-60, 60), rotation: rnd(-3, 3), alpha: 0, duration: slow(700), onComplete: () => leaf.destroy() });
      }
      c.scene.tweens.add({ targets: r, alpha: 0, duration: slow(300), onComplete: () => r.destroy() });
    }),
  );
};

const rejuvenate = async (c: VfxCtx) => {
  c.sfx('chimeHeal');
  c.sfx('leafRustle');
  await c.windUp('#7dff9b');
  await Promise.all(
    c.targets.map(async (t) => {
      const f = feet(t);
      const body = spot(t);
      const circle = sprite(c.scene, 'runering', '#7dff9b', f.x, f.y, 220, DEPTH - 10).setScale(1.1, 0.4);
      c.scene.tweens.add({ targets: circle, angle: 180, alpha: 0, duration: slow(900), onComplete: () => circle.destroy() });
      const flower = sprite(c.scene, 'rejuvenate', '#7dff9b', f.x, f.y - 20, 80, DEPTH + 30).setAlpha(0);
      c.scene.tweens.add({ targets: flower, alpha: 1, y: body.y - 80, duration: slow(700), ease: 'Quad.easeOut', onComplete: () => c.scene.tweens.add({ targets: flower, alpha: 0, duration: slow(300), onComplete: () => flower.destroy() }) });
      for (let i = 0; i < 16; i++) {
        void wait(c.scene, slow(i * 36)).then(() => {
          const a = (i / 16) * Math.PI * 4;
          const leaf = sprite(c.scene, i % 2 ? 'leafbit' : 'spark', i % 2 ? '#7ed957' : '#a8f08a', f.x + Math.cos(a) * 56, f.y - 10, i % 2 ? 36 : 24, DEPTH + 35);
          c.scene.tweens.add({ targets: leaf, y: f.y - 150 - rnd(0, 60), x: f.x + Math.cos(a + 1.4) * 46, alpha: 0, rotation: rnd(-2, 2), duration: slow(860), onComplete: () => leaf.destroy() });
        });
      }
      await wait(c.scene, slow(560));
    }),
  );
};

const summonroots = async (c: VfxCtx) => {
  c.sfx('rootsRumble');
  await c.windUp('#7ed957');
  const f = feet(c.actor);
  const circle = sprite(c.scene, 'runering', '#7ed957', f.x, f.y, 220, DEPTH - 10).setScale(1.1, 0.4);
  c.scene.tweens.add({ targets: circle, angle: 120, alpha: 0, duration: slow(800), onComplete: () => circle.destroy() });
  burst(c.scene, f.x, f.y - 30, { colors: NATURE, n: 10, speed: [30, 120], angle: [-Math.PI, 0], gravity: -60, life: [500, 900], size: [8, 12] });
};

const woodsmash = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  for (const t of c.targets) {
    const p = spot(t);
    const fist = sprite(c.scene, 'rootsmash', '#8a6a3a', p.x, p.y - 220, 128, DEPTH + 40);
    void travel(c.scene, fist, p, 140, { ease: 'in' }).then(() => {
      c.scene.tweens.add({ targets: fist, alpha: 0, duration: slow(200), onComplete: () => fist.destroy() });
      hit(c.scene, p.x, p.y, WOOD, 1.4);
      for (let i = 0; i < 6; i++) {
        const sp = sprite(c.scene, i % 2 ? 'splinter' : 'leafbit', i % 2 ? '#e3b983' : '#62d04b', p.x, p.y, 36, DEPTH + 45).setRotation(rnd(0, 6));
        c.scene.tweens.add({ targets: sp, x: p.x + rnd(-120, 120), y: p.y + rnd(-110, 50), rotation: sp.rotation + rnd(-4, 4), alpha: 0, duration: slow(540), onComplete: () => sp.destroy() });
      }
      shake(c.scene, 120, 0.004);
    });
  }
  await wait(c.scene, slow(150));
};

// ---------------------------------------------------------------------------------------------------------------------
// DEFENDER

const tauntFx = async (c: VfxCtx) => {
  const p = spot(c.actor);
  c.actor.play('cast');
  const facing = c.actor.combatant.side === 'party' ? 0 : Math.PI;
  const mark = sprite(c.scene, 'exclaim', '#ff5a4a', p.x, p.y - c.actor.h * 0.55 - 50, 96, DEPTH + 40);
  grow(c.scene, mark, 0.2, 1, 220, 'Back.easeOut');
  for (let i = 0; i < 3; i++) {
    void wait(c.scene, slow(i * 120)).then(() => ring(c.scene, p.x, p.y, { r: 300 + i * 70, flat: 0.7, n: 18, colors: ['#ff9f43', '#e5463b', '#ffffff'], dur: 560, size: 14, startR: 40, arc: [facing - 0.7, facing + 0.7] }));
  }
  void ring(c.scene, c.actor.container.x, c.actor.container.y - 4, { r: 120, flat: 0.3, n: 24, colors: ['#ff9f43', '#e5463b'], dur: 600, size: 12 });
  c.scene.tweens.add({ targets: c.actor.container, x: c.actor.container.x + 8, duration: 40, yoyo: true, repeat: 4 });
  shake(c.scene, 160, 0.003);
  await wait(c.scene, slow(520));
  c.scene.tweens.add({ targets: mark, alpha: 0, y: mark.y - 30, duration: slow(300), onComplete: () => mark.destroy() });
  c.actor.play('idle');
};

const guardlink = async (c: VfxCtx) => {
  await c.windUp('#6ec1ff');
  const a = spot(c.actor);
  for (const t of c.targets) {
    const p = spot(t);
    const n = 24;
    const dots: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i <= n; i++) {
      await wait(c.scene, slow(11));
      const k = i / n;
      dots.push(c.scene.add.rectangle(snap(a.x + (p.x - a.x) * k), snap(a.y + (p.y - a.y) * k - Math.sin(k * Math.PI) * 40), 6, 6, color(i % 2 ? '#a8ebff' : '#4aa3ff')).setDepth(DEPTH + 30));
    }
    const icon = sprite(c.scene, 'guard', '#6ec1ff', p.x, p.y - t.h * 0.55 - 20, 96, DEPTH + 40);
    grow(c.scene, icon, 0.3, 1, 240, 'Back.easeOut');
    void ring(c.scene, t.container.x, t.container.y - 6, { r: 100, flat: 0.3, n: 20, colors: ['#4aa3ff', '#a8ebff'], dur: 520, size: 10 });
    c.scene.tweens.add({ targets: [...dots, icon], alpha: 0, duration: slow(420), delay: slow(260), onComplete: () => { for (const d of dots) d.destroy(); icon.destroy(); } });
  }
  await wait(c.scene, slow(200));
};

const tremor = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  const cell = c.cells[0] ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  cracks(c.scene, cell.x, cell.y - 8, { len: 220, n: 9 });
  void ring(c.scene, cell.x, cell.y - 8, { r: 260, flat: 0.32, n: 36, colors: DUST, dur: 600, size: 14 });
  void ring(c.scene, cell.x, cell.y - 8, { r: 150, flat: 0.32, n: 26, colors: ['#ffffff', '#ffd23f'], dur: 420, size: 12 });
  burst(c.scene, cell.x, cell.y - 20, { colors: ['#5b6579', '#98a2b4', '#4a2e1a'], n: 22, speed: [160, 460], angle: [-Math.PI, 0], gravity: 900, life: [500, 950], size: [10, 20] });
  for (const q of c.cells.slice(1)) burst(c.scene, q.x, q.y - 10, { colors: DUST, n: 8, speed: [40, 160], angle: [-Math.PI, 0], gravity: 500, life: [300, 600], size: [8, 14] });
  shake(c.scene, 240, 0.008);
};

const fistcrush = async (c: VfxCtx) => {
  const order = Phaser.Utils.Array.Shuffle([...c.targets]);
  const gap = c.skill.skyStagger ?? 130;
  await Promise.all(
    order.map(async (t, i) => {
      await wait(c.scene, slow(i * gap));
      const f = feet(t);
      const p = spot(t);
      const shadow = c.scene.add.ellipse(f.x, f.y, 30, 12, 0x000000, 0.4).setDepth(DEPTH - 40);
      c.scene.tweens.add({ targets: shadow, scaleX: 5, scaleY: 3, duration: slow(380) });
      const fist = sprite(c.scene, 'fistcrush', '#ffd166', p.x, -200, 256, DEPTH + 40);
      await travel(c.scene, fist, { x: p.x, y: p.y - 10 }, 400, { ease: 'in', trail: (x, y) => burst(c.scene, x, y - 90, { colors: ['#ffd166', '#ffffff'], n: 1, speed: [0, 20], gravity: 0, life: [200, 300], size: [8, 12] }), trailEvery: 30 });
      shadow.destroy();
      cracks(c.scene, f.x, f.y - 4, { len: 120, n: 6, dur: 500 });
      hit(c.scene, p.x, p.y, ['#ffffff', '#ffd166', '#ff8a1f'], 1.6);
      burst(c.scene, f.x, f.y - 10, { colors: ['#5b6579', '#98a2b4'], n: 10, speed: [120, 380], angle: [-Math.PI, 0], gravity: 800, life: [400, 800], size: [8, 16] });
      shake(c.scene, 130, 0.006);
      c.scene.tweens.add({ targets: fist, alpha: 0, duration: slow(240), onComplete: () => fist.destroy() });
    }),
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// ANTI-MAGE

const manaburnFx = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  const a = spot(c.actor);
  for (const t of c.targets) {
    const p = spot(t);
    const flame = sprite(c.scene, 'manaburn', '#9b59d0', p.x, p.y - 10, 112, DEPTH + 40);
    grow(c.scene, flame, 0.3, 1.6, 520, 'Quad.easeOut', { alpha: 0, onComplete: () => flame.destroy() });
    void arcSlash(c.scene, p.x, p.y, { dir: dirTo(c.actor, p), colors: ['#9b59d0', '#4aa3ff', '#ffffff'], from: -0.8, to: 0.8 });
    for (let i = 0; i < 9; i++) {
      void wait(c.scene, slow(i * 40)).then(() => {
        const s = sprite(c.scene, 'ember', i % 2 ? '#4aa3ff' : '#b872ff', p.x + rnd(-30, 30), p.y + rnd(-40, 40), 28, DEPTH + 45);
        void travel(c.scene, s, { x: a.x, y: a.y }, 420, { arc: rnd(-60, 60) }).then(() => {
          s.destroy();
          burst(c.scene, a.x, a.y, { colors: ['#4aa3ff', '#a8ebff'], n: 2, speed: [20, 80], gravity: 0, life: [200, 340], size: [6, 10] });
        });
      });
    }
  }
  c.actor.ring('#4aa3ff', 0.9);
  await wait(c.scene, slow(180));
};

const drainfield = async (c: VfxCtx) => {
  await c.windUp('#9b59d0');
  const a = spot(c.actor);
  const cell = c.cells[0] ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  const rune = sprite(c.scene, 'circle', '#9b59d0', cell.x, cell.y - 10, 480, DEPTH - 30).setScale(1, 0.4).setAlpha(0);
  c.scene.tweens.add({ targets: rune, alpha: 0.95, angle: 180, duration: slow(900) });
  c.scene.tweens.add({ targets: rune, alpha: 0, duration: slow(300), delay: slow(900), onComplete: () => rune.destroy() });
  flash(c.scene, '#2a0a4a', 0.25, 700);
  const orbs: Promise<void>[] = [];
  for (const t of c.targets) {
    const p = spot(t);
    void ring(c.scene, t.container.x, t.container.y - 6, { r: 90, flat: 0.3, n: 18, colors: ['#9b59d0', '#4aa3ff'], dur: 480, size: 10 });
    for (let i = 0; i < 5; i++) {
      orbs.push(
        (async () => {
          await wait(c.scene, slow(240 + i * 70));
          const s = sprite(c.scene, 'droplet', '#4aa3ff', p.x + rnd(-24, 24), p.y + rnd(-30, 30), 40, DEPTH + 45);
          await travel(c.scene, s, a, 460, { arc: rnd(-90, 90), ease: 'in', trail: (x, y) => burst(c.scene, x, y, { colors: ['#4aa3ff', '#b872ff'], n: 1, speed: [0, 30], gravity: 0, life: [200, 340], size: [6, 10] }), trailEvery: 30 });
          s.destroy();
          burst(c.scene, a.x, a.y, { colors: ['#4aa3ff', '#a8ebff'], n: 3, speed: [30, 110], gravity: 0, life: [200, 360], size: [6, 10] });
        })(),
      );
    }
  }
  await Promise.all(orbs);
  c.actor.ring('#4aa3ff', 1);
};

const spellward = async (c: VfxCtx) => {
  const p = spot(c.actor);
  c.actor.play('cast');
  const r1 = sprite(c.scene, 'runering', '#b36bff', p.x, p.y, 280, DEPTH + 25).setAlpha(0.95);
  const r2 = sprite(c.scene, 'runering', '#9fe8ff', p.x, p.y, 200, DEPTH + 26).setAlpha(0.9);
  const core = sprite(c.scene, 'spellward', '#b36bff', p.x, p.y, 112, DEPTH + 27).setAlpha(0);
  const coreBase = core.scaleX;
  core.setScale(coreBase * 0.3);
  c.scene.tweens.add({ targets: r1, angle: 180, duration: slow(900) });
  c.scene.tweens.add({ targets: r2, angle: -240, duration: slow(900) });
  c.scene.tweens.add({ targets: core, scaleX: coreBase * 1.5, scaleY: coreBase * 1.5, alpha: 0.9, duration: slow(380), ease: 'Back.easeOut', yoyo: true, hold: slow(120) });
  burst(c.scene, p.x, p.y, { colors: ['#b872ff', '#a8ebff', '#ffffff'], n: 18, speed: [40, 200], gravity: -40, life: [500, 900], size: [8, 12] });
  await wait(c.scene, slow(560));
  c.scene.tweens.add({ targets: [r1, r2, core], alpha: 0, duration: slow(360), onComplete: () => { r1.destroy(); r2.destroy(); core.destroy(); } });
  c.actor.play('idle');
};

const voidstrike = async (c: VfxCtx) => {
  await c.windUp('#7d3fb0');
  await Promise.all(
    c.targets.map(async (t) => {
      const a = spot(c.actor);
      const p = spot(t);
      const orb = sprite(c.scene, 'voidstrike', '#7d3fb0', a.x + dirTo(c.actor, p) * 40, a.y, 112, DEPTH + 30);
      const sats = Array.from({ length: 4 }, () => c.scene.add.rectangle(orb.x, orb.y, 6, 6, color(pick(VOID))).setDepth(DEPTH + 31));
      let phase = 0;
      await travel(c.scene, orb, p, 380, {
        trail: (x, y) => {
          phase += 0.8;
          sats.forEach((s, i) => s.setPosition(snap(x + Math.cos(phase + (i * Math.PI) / 2) * 44), snap(y + Math.sin(phase + (i * Math.PI) / 2) * 44)));
          burst(c.scene, x, y, { colors: VOID, n: 1, speed: [0, 30], gravity: 0, life: [220, 380], size: [8, 12] });
        },
        trailEvery: 22,
      });
      orb.destroy();
      for (const s of sats) s.destroy();
      // içe çöküş sonra patlama
      for (let i = 0; i < 24; i++) {
        const a2 = (i / 24) * Math.PI * 2;
        const q = c.scene.add.rectangle(snap(p.x + Math.cos(a2) * 90), snap(p.y + Math.sin(a2) * 90), 6, 6, color(pick(VOID))).setDepth(DEPTH + 40);
        c.scene.tweens.add({ targets: q, x: p.x, y: p.y, alpha: 0.2, duration: slow(220), onComplete: () => q.destroy() });
      }
      await wait(c.scene, slow(230));
      void ring(c.scene, p.x, p.y, { r: 160, flat: 0.8, n: 30, colors: ['#b872ff', '#5a2a9c', '#15101c'], dur: 460, size: 14 });
      burst(c.scene, p.x, p.y, { colors: VOID, n: 22, speed: [120, 460], gravity: 100, life: [380, 720], size: [8, 16] });
      shake(c.scene, 130, 0.004);
    }),
  );
};

export const VFX: Record<VfxKind, (c: VfxCtx) => Promise<void>> = {
  doublestrike,
  charge,
  whirlwind,
  warcry,
  holysword,
  resurrect,
  judgment,
  fireball,
  blizzard,
  barrier,
  meteor,
  bonethrow,
  bloodhands,
  wail,
  raise,
  bonestrike,
  arrowshot,
  pierce,
  arrowrain,
  aimed,
  thornwhip,
  vines,
  rejuvenate,
  summonroots,
  woodsmash,
  taunt: tauntFx,
  guardlink,
  tremor,
  fistcrush,
  manaburn: manaburnFx,
  drainfield,
  spellward,
  voidstrike,
};

/** Yerden yükselen toz bulutu: kabaran, yükselen, sönen gri-kahve dumanlar. */
function dustCloud(scene: Phaser.Scene, x: number, y: number, o: { n: number; spread: number; rise: number; size?: [number, number]; tint?: number; life?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const size = rnd(o.size?.[0] ?? 56, o.size?.[1] ?? 110);
    const puff = scene.add
      .image(x + rnd(-o.spread * 0.4, o.spread * 0.4), y - rnd(0, 14), ensureIcon(scene, i % 2 ? 'smoke' : 'dust', '#98a2b4', false))
      .setDisplaySize(size, size)
      .setTint(o.tint ?? 0xb5a58c)
      .setAlpha(0.8)
      .setDepth(DEPTH + 25);
    const life = slow(o.life ?? rnd(900, 1500));
    scene.tweens.add({
      targets: puff,
      x: puff.x + rnd(-o.spread, o.spread),
      y: puff.y - rnd(o.rise * 0.3, o.rise),
      displayWidth: size * rnd(1.9, 2.8),
      displayHeight: size * rnd(1.6, 2.4),
      alpha: 0,
      duration: life,
      delay: slow(rnd(0, 160)),
      ease: 'Cubic.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

/** Çağrılan birim sahneye girerken oynayan efekt; birim görünür olunca (giriş bitince) Promise çözülür. İskelet mezardan, Treant topraktan çıkar. */
export async function summonFx(scene: Phaser.Scene, unitId: string, view: CombatantView): Promise<void> {
  const f = feet(view);
  if (unitId === 'skeleton') {
    // 1) zemin çatlar, mor ölü ışığı sızar, yer titrer
    const dim = scene.add.rectangle(960, 540, 1920, 1080, 0x10061a, 0).setDepth(DEPTH - 25);
    scene.tweens.add({ targets: dim, alpha: 0.4, duration: slow(500) });
    const glow = scene.add.ellipse(f.x, f.y, 40, 14, 0xb36bff, 0.5).setDepth(DEPTH - 35);
    scene.tweens.add({ targets: glow, scaleX: 5, scaleY: 3, alpha: 0.85, duration: slow(900), yoyo: true });
    const circle = sprite(scene, 'circle', '#b36bff', f.x, f.y, 260, DEPTH - 36).setScale(1.2, 0.42).setAlpha(0.9);
    scene.tweens.add({ targets: circle, angle: 120, alpha: 0, duration: slow(1500), onComplete: () => circle.destroy() });
    cracks(scene, f.x, f.y, { len: 240, n: 12, dur: 1500 });
    shake(scene, 700, 0.004);
    playSfx(scene, 'rootsRumble');
    burst(scene, f.x, f.y - 6, { colors: ['#b872ff', '#5a2a9c', '#a8ebff'], n: 14, speed: [20, 90], angle: [-Math.PI, 0], gravity: -90, life: [700, 1200], size: [10, 18] });
    dustCloud(scene, f.x, f.y, { n: 6, spread: 90, rise: 70, size: [40, 70] });
    await wait(scene, slow(520));
    // 2) toprak patlar: büyük toz bulutu, taş parçaları, çürük eller kenarlardan tırmanır
    dustCloud(scene, f.x, f.y, { n: 16, spread: 170, rise: 190 });
    burst(scene, f.x, f.y - 10, { colors: ['#4a2e1a', '#8c5a2b', '#5b6579', '#98a2b4'], n: 26, speed: [140, 480], angle: [-Math.PI, 0], gravity: 900, life: [500, 1000], size: [10, 22] });
    void ring(scene, f.x, f.y, { r: 220, flat: 0.34, n: 40, colors: ['#b872ff', '#5a2a9c', '#98a2b4'], dur: 560, size: 12 });
    shake(scene, 260, 0.008);
    const hands: Phaser.GameObjects.Image[] = [];
    for (const dx of [-62, 58, -26, 30]) {
      const h = sprite(scene, 'undeadhand', '#b36bff', f.x + dx, f.y + 6, 150, view.container.depth + 2).setRotation(dx < 0 ? 0.25 : -0.25);
      sprout(scene, h, 280);
      hands.push(h);
    }
    await wait(scene, slow(300));
    for (const h of hands) {
      h.setTexture(ensureIcon(scene, 'undeadhand2', '#b36bff', false));
      scene.tweens.add({ targets: h, y: h.y - 14, rotation: h.rotation * -1, duration: slow(160), yoyo: true });
    }
    // 3) iskelet yerden fırlar: titreyerek yükselir, yer boyunca toz akar
    const dustTick = scene.time.addEvent({ delay: slow(110), repeat: 8, callback: () => dustCloud(scene, f.x, f.y, { n: 3, spread: 120, rise: 90, size: [36, 70], life: 800 }) });
    playSfx(scene, 'thud');
    await view.riseFromGround(900, 5);
    dustTick.remove();
    flash(scene, '#b36bff', 0.28, 380);
    void ring(scene, f.x, f.y, { r: 170, flat: 0.34, n: 30, colors: ['#ffffff', '#b872ff'], dur: 480, size: 12 });
    dustCloud(scene, f.x, f.y, { n: 10, spread: 150, rise: 140 });
    shake(scene, 200, 0.006);
    scene.tweens.add({ targets: hands, scaleY: 0.02, alpha: 0, duration: slow(380), onComplete: () => { for (const h of hands) h.destroy(); } });
    scene.tweens.add({ targets: [dim, glow], alpha: 0, duration: slow(700), onComplete: () => { dim.destroy(); glow.destroy(); } });
    await wait(scene, slow(120));
  } else if (unitId === 'treant') {
    playSfx(scene, 'woodCreak');
    for (const dx of [-70, -34, 0, 34, 70]) {
      const r = sprite(scene, 'roots', '#7ed957', f.x + dx, f.y + 14, 132, DEPTH + 20);
      sprout(scene, r, 300);
      scene.tweens.add({ targets: r, alpha: 0, duration: slow(300), delay: slow(700), onComplete: () => r.destroy() });
    }
    void ring(scene, f.x, f.y, { r: 150, flat: 0.34, n: 26, colors: NATURE, dur: 560, size: 12 });
    burst(scene, f.x, f.y - 10, { colors: [...NATURE, '#8c5a2b'], n: 24, speed: [60, 280], angle: [-Math.PI, 0], gravity: 600, life: [450, 900], size: [8, 16] });
    dustCloud(scene, f.x, f.y, { n: 12, spread: 140, rise: 150, tint: 0x9a7c52 });
    shake(scene, 300, 0.005);
    await wait(scene, slow(260));
    playSfx(scene, 'thud');
    await view.riseFromGround(700, 3);
    dustCloud(scene, f.x, f.y, { n: 8, spread: 120, rise: 110, tint: 0x9a7c52 });
    shake(scene, 160, 0.005);
  } else {
    view.fadeIn();
    burst(scene, f.x, f.y - 40, { colors: ['#ffffff', '#a8ebff'], n: 10, speed: [40, 160], gravity: -50, life: [400, 700], size: [8, 12] });
    await wait(scene, slow(400));
  }
}
