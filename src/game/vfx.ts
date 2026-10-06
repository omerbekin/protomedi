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
  /** Alan/şerit skill'inde oyuncunun tıkladığı MERKEZ hücrenin zemin konumu (efektin düşeceği yer). */
  centerPos?: { x: number; y: number };
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
  /** Gambler: motor olaylarından okunan sonuç (bahis kazanıldı/kaybedildi, çifte vuruş geldi). Yoksa genel animasyon. */
  result?: { bet?: 'win' | 'lose'; doubleHit?: boolean };
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
export async function meleeApproach(scene: Phaser.Scene, actor: CombatantView, targets: CombatantView[], centerPos?: { x: number; y: number }): Promise<void> {
  if (!targets.length && !centerPos) return;
  let stand: { x: number; y: number; dir: number };
  if (centerPos) {
    // Alan skill'i (Tremor Slam): oyuncunun seçtiği merkez hücreye gider (hücre boş olsa bile)
    const dir = centerPos.x >= actor.container.x ? 1 : -1;
    stand = { x: centerPos.x - dir * (actor.w * 0.5 + 70), y: centerPos.y, dir };
  } else {
    const near = targets.reduce((m, t) => (Math.abs(t.container.x - actor.container.x) < Math.abs(m.container.x - actor.container.x) ? t : m));
    stand = standNear(actor, near);
  }
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
  c.sfx('chargeRush'); // koşu ~0,31 sn = yaklaşma süresi (260 ms x skillSlowdown)
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
  c.sfx('chargeSlam');
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
  c.sfx('choirAh');
  await c.windUp('#fff0a0');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const s = sprite(c.scene, 'holystrike', '#fff0a0', p.x, -120, 192, DEPTH + 30).setRotation((3 * Math.PI) / 4);
      c.sfx('swordWhoosh');
      const trail = (x: number, y: number) => burst(c.scene, x - 40, y - 60, { colors: HOLY, n: 2, speed: [10, 60], angle: [-Math.PI, 0], gravity: 80, life: [250, 450], size: [8, 12] });
      await travel(c.scene, s, { x: p.x, y: p.y - 30 }, 330, { ease: 'in', trail, trailEvery: 28 });
      c.sfx('swordStab');
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
  c.sfx('choirAh');
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
  c.sfx('heartbeat');
  c.sfx('gasp');
  flash(c.scene, '#fff0a0', 0.35, 360);
  c.scene.tweens.add({ targets: [col, core, ankh], alpha: 0, duration: slow(380), onComplete: () => { col.destroy(); core.destroy(); ankh.destroy(); } });
};

/** Holy Strike: TEK hedefe uygun boyutta savaş çekici yukarıdan düşer (boyut hedef karakterin boyuna oranlı; alan skill'i gibi dev değil). */
const hammerfall = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  c.sfx('hammerWhoosh');
  const tgt = c.targets[0];
  const k = tgt ? Phaser.Math.Clamp(tgt.h / 240, 0.7, 1.1) : 0.9;
  const cell = tgt ? { x: tgt.container.x, y: feet(tgt).y } : c.centerPos ?? feet(c.actor);
  const cx = cell.x;
  const cy = cell.y - 50;
  const shadow = c.scene.add.ellipse(cx, cy + 36, 24 * k, 9 * k, 0x000000, 0.3).setDepth(DEPTH - 40);
  c.scene.tweens.add({ targets: shadow, scaleX: 3, scaleY: 2, duration: slow(420) });
  const size = Math.round(150 * k);
  const h = sprite(c.scene, 'hammerbit', '#fff0a0', cx, -160, size, DEPTH + 30).setRotation(Math.PI);
  const haloSize = Math.round(340 * k);
  const halo = c.scene.add.image(cx, -160, hammerHaloTexture(c.scene)).setDisplaySize(haloSize, haloSize).setDepth(DEPTH + 29).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  const haloBase = halo.scaleX;
  const headDy = 0.14 * size; // çekiç ters döndüğü için kafa, sprite merkezinin altında
  const toY = cy - 30 * k;
  const fromY = -160;
  let nextMote = 0;
  // iz yok: halo çekiçle birlikte iner, nabız gibi atar; ışık tozları haloda doğup dışa süzülür
  await counter(c.scene, slow(420), (u) => {
    const y = snap(fromY + (toY - fromY) * u * u);
    h.setPosition(cx, y);
    const pulse = 1 + 0.09 * Math.sin(u * 26);
    const grow = (0.78 + 0.3 * u) * pulse;
    halo.setPosition(cx, y + headDy).setScale(haloBase * grow).setAlpha(Math.min(1, 0.35 + u * 1.4) * (0.82 + 0.18 * Math.sin(u * 26)));
    if (u * 420 >= nextMote && u < 1) {
      nextMote += 38;
      const a = rnd(0, Math.PI * 2);
      const r = rnd(0.18, 0.4) * haloSize;
      burst(c.scene, cx + Math.cos(a) * r, y + headDy + Math.sin(a) * r, { colors: HOLY, n: 1, speed: [14, 46], angle: [a - 0.4, a + 0.4], gravity: -20, life: [380, 640], size: [5, 9] });
    }
  });
  c.sfx('hammerSlam');
  c.sfx('fireCrackle');
  shake(c.scene, 110, 0.0022);
  // çarpma: hedefte kısa, küçük bir ışık hâlesi parlar
  const hitY = cy + 8;
  const bloom = c.scene.add.image(cx, hitY, hammerHaloTexture(c.scene)).setDisplaySize(190 * k, 190 * k).setDepth(DEPTH + 28).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95);
  const bloomScale = bloom.scaleX;
  c.scene.tweens.add({ targets: bloom, scaleX: bloomScale * 1.9, scaleY: bloomScale * 1.9, alpha: 0, duration: slow(380), ease: 'Quad.easeOut', onComplete: () => bloom.destroy() });
  void ring(c.scene, cx, cy + 40, { r: 70 * k, flat: 0.32, n: 18, colors: HOLY, dur: 380, size: 8 });
  burst(c.scene, cx, hitY, { colors: HOLY, n: 9, speed: [30, 150], angle: [-Math.PI, 0], gravity: -30, life: [420, 760], size: [5, 9] });
  c.scene.tweens.add({ targets: halo, scaleX: halo.scaleX * 1.25, scaleY: halo.scaleY * 1.25, duration: slow(320), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: [h, halo, shadow], alpha: 0, duration: slow(340), onComplete: () => { h.destroy(); halo.destroy(); shadow.destroy(); } });
};

/** Yumuşak piksel dokular (bir kez üretilir): huzme sütunu ve yerdeki parlama. Düşük çözünürlük + az basamaklı alfa = yumuşak ama piksel art. */
function softTexture(scene: Phaser.Scene, key: string, w: number, h: number, shade: (x: number, y: number) => { c: string; a: number } | null): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = shade(x, y);
      if (!px || px.a <= 0) continue;
      ctx.globalAlpha = Math.round(px.a * 6) / 6;
      ctx.fillStyle = px.c;
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.globalAlpha = 1;
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

const BEAM_TEX_H = 96;

/** Holy Strike halosu: yuvarlak, yumuşak sönen altın-beyaz ışık (çekicin etrafında nabız atar; ADD karışımıyla kullanılır). */
const hammerHaloTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:hammerhalo', 96, 96, (x, y) => {
    const d = Math.hypot((x + 0.5 - 48) / 48, (y + 0.5 - 48) / 48);
    if (d >= 1) return null;
    return { c: d < 0.3 ? '#ffffff' : d < 0.6 ? '#fff0a0' : '#ffd23f', a: (1 - d) ** 1.05 };
  });

/** Işık huzmesi dokusu: ortası beyaz, kenarları altın, kenara doğru yumuşak sönen; üst uç gökyüzüne doğru erir. */
const beamTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:holybeam', 32, BEAM_TEX_H, (x, y) => {
    const u = Math.abs((x + 0.5) / 32 - 0.5) * 2; // 0 orta, 1 kenar
    const body = (1 - u ** 1.6) ** 1.1;
    const top = Math.min(1, (y + 1) / 36);
    return { c: u < 0.28 ? '#ffffff' : u < 0.6 ? '#fff0a0' : '#ffd23f', a: body * top };
  });

/** Yerdeki parlama dokusu: yassı, yumuşak altın-beyaz elips. */
const glowTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:holyglow', 48, 24, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
    if (d >= 1) return null;
    return { c: d < 0.35 ? '#ffffff' : d < 0.7 ? '#fff0a0' : '#ffd23f', a: (1 - d) ** 1.2 };
  });

/** Judgment: seçilen alanın merkezine, alan göstergesi genişliğinde TEK büyük ışık huzmesi iner; yere değince parlar (yer etkisi huzmeden sonra doğar). */
const judgment = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  c.sfx('hammerWhoosh');
  const center = c.centerPos ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  // Tek, geniş huzme: alan göstergesinin elipsine (BattleScene.showAreaMarker: bbox + 160 x bbox + 96) oturur; hücre başına ayrı huzme yok
  const pts = c.cells.length ? c.cells : [center];
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const ex = pts.length > 1 ? (minX + maxX) / 2 : center.x;
  const ey = (pts.length > 1 ? (minY + maxY) / 2 : center.y) - 4;
  const ew = maxX - minX + 160; // elipsin genişliği
  const eh = maxY - minY + 116; // elipsin yüksekliği
  const beamKey = beamTexture(c.scene);
  const glowKey = glowTexture(c.scene);
  const FALL = 340;
  const bw = ew * 0.9;
  const top = -40;
  const landY = ey;
  const beam = c.scene.add.image(ex, top, beamKey).setOrigin(0.5, 0).setDisplaySize(bw, landY - top).setDepth(DEPTH + 10).setAlpha(0.95);
  beam.setCrop(0, 0, 32, 1);
  // ışık huzmesi yukarıdan aşağı uzar (uç noktası yere doğru ilerler)
  await counter(c.scene, slow(FALL), (u) => beam.setCrop(0, 0, 32, Math.max(1, Math.round(BEAM_TEX_H * u * u))));
  beam.setCrop();
  // yere değiş (vuruş anı): alan elipsini dolduran parlama, halka, kıvılcım
  const glow = c.scene.add.image(ex, landY, glowKey).setDisplaySize(ew, eh).setDepth(DEPTH - 20).setAlpha(1);
  c.scene.tweens.add({ targets: glow, displayWidth: ew * 1.5, displayHeight: eh * 1.5, alpha: 0, duration: slow(650), ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
  void ring(c.scene, ex, landY, { r: ew * 0.5, flat: eh / ew, n: 44, colors: HOLY, dur: 540, size: 12 });
  void ring(c.scene, ex, landY, { r: ew * 0.3, flat: eh / ew, n: 28, colors: ['#ffffff', '#ffd23f'], dur: 420, size: 12 });
  burst(c.scene, ex, landY - 10, { colors: HOLY, n: 36, speed: [80, 360], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 420, life: [450, 850], size: [6, 12] });
  // huzme hafifçe titreşip söner
  c.scene.tweens.add({ targets: beam, displayWidth: bw * 1.1, duration: slow(160), yoyo: true });
  c.scene.tweens.add({ targets: beam, alpha: 0, delay: slow(260), duration: slow(560), ease: 'Quad.easeIn', onComplete: () => beam.destroy() });
  // huzme boyunca yükselen ışık tozları
  for (let k = 0; k < 14; k++) {
    const m = sprite(c.scene, 'spark', '#fff0a0', ex + rnd(-bw * 0.4, bw * 0.4), landY - rnd(10, 60), 24, DEPTH + 30);
    c.scene.tweens.add({ targets: m, y: m.y - rnd(160, 380), alpha: 0, duration: slow(rnd(600, 950)), onComplete: () => m.destroy() });
  }
  c.sfx('hammerSlam');
  flash(c.scene, '#fff7d0', 0.4, 320);
  shake(c.scene, 220, 0.007);
  void wait(c.scene, slow(240)).then(() => c.sfx('fireCrackle'));
  // Promise burada çözülür: hasar alan karakterlerin hit tepkisi huzme çarptığı anda başlar; yer etkisi (Holy Fire) hemen ardından
  // aynı hücrelerde doğar (BattleScene.addGroundView -> groundReveal)
  await wait(c.scene, slow(60));
};

/** Zehir alanı için yumuşak yeşil yassı ışıma dokusu. */
const poisonGlowTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:poisonglow', 48, 24, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
    if (d >= 1) return null;
    return { c: d < 0.35 ? '#c8ff9a' : d < 0.7 ? '#7ed957' : '#2f7a2a', a: (1 - d) ** 1.2 };
  });

/**
 * Yer etkisi (data/grounds.json) görseli: Drain Field gibi seçim göstergesinin en geniş dairesine oturan TEK yassı elips alan.
 * Merkezden yavaşça büyür (iç/dış halka + ışıma), sonra ground süresince hafifçe canlı kalır: Holy Fire'da düşük şiddetli
 * alev dilleri/kor/kıvılcım, Poison'da yeşil sis ve kabarcıklar. Container yok edilince (BattleScene.removeGroundView) döngü durur.
 * Başka yer etkisi için null döner (eski karo görseli kullanılır). `delay`: önceki animasyonun (huzme) bitmesini bekleme süresi.
 */
export function groundArea(scene: Phaser.Scene, groundId: string, cells: Array<{ x: number; y: number }>, delay = 0): Phaser.GameObjects.Container | null {
  const holy = groundId === 'holy_fire';
  if ((!holy && groundId !== 'poison') || cells.length === 0) return null;
  const minX = Math.min(...cells.map((q) => q.x));
  const maxX = Math.max(...cells.map((q) => q.x));
  const minY = Math.min(...cells.map((q) => q.y));
  const maxY = Math.max(...cells.map((q) => q.y));
  const fx = (minX + maxX) / 2;
  const fy = (minY + maxY) / 2 - 4;
  const fw = maxX - minX + 160;
  const fh = maxY - minY + 116;
  const rx = fw / 2;
  const ry = fh / 2;
  const look = holy
    ? { edge: '#ffd23f', fill: '#ff9a2a', inner: '#ff7a1a', glow: glowTexture(scene), tint: 0xffa63a }
    : { edge: '#8ee060', fill: '#4a9a35', inner: '#2f7a2a', glow: poisonGlowTexture(scene), tint: 0xffffff };
  const glow = scene.add.image(fx, fy, look.glow).setDisplaySize(fw * 1.12, fh * 1.18).setAlpha(0).setTint(look.tint);
  const outer = scene.add.ellipse(fx, fy, fw, fh, color(look.fill), 0).setStrokeStyle(4, color(look.edge), 0).setScale(0.04);
  const inner = scene.add.ellipse(fx, fy, fw * 0.78, fh * 0.78, color(look.inner), 0).setStrokeStyle(2, color(look.edge), 0).setScale(0.04);
  const box = scene.add.container(0, 0, [glow, outer, inner]).setDepth(30);
  const GROW = 900;
  const alive = () => box.active && box.scene !== undefined;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    delay: slow(delay),
    duration: slow(GROW),
    ease: 'Quad.easeOut',
    onUpdate: (tw) => {
      if (!alive()) return;
      const u = tw.getValue() ?? 0;
      outer.setScale(0.04 + 0.96 * u).setFillStyle(color(look.fill), 0.2 * u).setStrokeStyle(4, color(look.edge), 0.9 * u);
      inner.setScale(0.04 + 0.96 * u).setFillStyle(color(look.inner), 0.26 * u).setStrokeStyle(2, color(look.edge), 0.5 * u);
      glow.setAlpha(0.75 * u);
    },
    onComplete: () => {
      if (!alive()) return;
      live = true;
      void ring(scene, fx, fy, { r: rx, flat: ry / rx, n: 36, colors: holy ? HOLY : ['#8ee060', '#c8ff9a', '#2f7a2a'], dur: 480, size: 10 });
      scene.tweens.add({ targets: glow, alpha: { from: 0.75, to: 0.45 }, duration: holy ? 420 : 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    },
  });
  // Süreklilik döngüsü: hafif alev dilleri/kor (Holy Fire) ya da sis/kabarcık (Poison)
  let tick = 0;
  let live = false;
  const inEllipse = (k = 0.85) => {
    const a = rnd(0, Math.PI * 2);
    const r = Math.sqrt(rnd(0, 1)) * k;
    return { x: fx + Math.cos(a) * rx * r, y: fy + Math.sin(a) * ry * r };
  };
  const loop = scene.time.addEvent({
    delay: holy ? 170 : 260,
    loop: true,
    callback: () => {
      if (!live || !alive() || box.alpha < 0.2) return;
      tick++;
      const q = inEllipse();
      if (holy) {
        // alev dili: yerden kısa yükselen küçük turuncu/altın alev
        const f = sprite(scene, 'ember', tick % 2 ? '#ff8a1f' : '#ffd23f', q.x, q.y + 4, rnd(14, 26), 31).setOrigin(0.5, 1).setAlpha(0.8);
        const sx = f.scaleX;
        f.setScale(sx * 0.4, sx * 0.3);
        scene.tweens.add({ targets: f, scaleX: sx * 0.9, scaleY: sx * 1.7, y: f.y - rnd(14, 34), alpha: 0, duration: slow(rnd(520, 800)), ease: 'Quad.easeOut', onComplete: () => f.destroy() });
        if (tick % 3 === 0) {
          const k = scene.add.rectangle(snap(q.x), snap(q.y), 4, 4, color(pick(['#ffd23f', '#fff0a0', '#ff8a1f']))).setDepth(32);
          scene.tweens.add({ targets: k, x: snap(k.x + rnd(-14, 14)), y: snap(k.y - rnd(30, 70)), alpha: 0, duration: slow(rnd(600, 950)), onComplete: () => k.destroy() });
        }
      } else {
        // sis: yavaş yükselen yeşil duman
        if (tick % 2 === 0) {
          const m = sprite(scene, 'smoke', '#7ed957', q.x, q.y, 28, 31).setTint(0x8ee060).setAlpha(0.32);
          scene.tweens.add({ targets: m, y: m.y - rnd(24, 46), displayWidth: 64, displayHeight: 50, alpha: 0, duration: slow(rnd(1100, 1600)), ease: 'Quad.easeOut', onComplete: () => m.destroy() });
        }
        // kabarcık: yükselip patlayan küçük halka
        const r = rnd(4, 8);
        const bub = scene.add.circle(snap(q.x), snap(q.y), r, color('#b8ff8a'), 0.18).setStrokeStyle(2, color('#c8ff9a'), 0.85).setDepth(32);
        scene.tweens.add({ targets: bub, y: snap(bub.y - rnd(16, 40)), x: snap(bub.x + rnd(-8, 8)), scale: 1.4, alpha: 0, duration: slow(rnd(700, 1100)), ease: 'Sine.easeOut', onComplete: () => bub.destroy() });
      }
    },
  });
  box.once('destroy', () => {
    loop.remove(false);
    scene.tweens.killTweensOf([glow, outer, inner]);
  });
  return box;
}

// ---------------------------------------------------------------------------------------------------------------------
// MAGE

const fireball = async (c: VfxCtx) => {
  c.sfx('flameIgnite');
  await c.windUp('#ff7a1a');
  await Promise.all(
    c.targets.map(async (t) => {
      c.sfx('flameRoar');
      const a = spot(c.actor);
      const p = spot(t);
      const s = sprite(c.scene, 'fireball', '#ff7a1a', a.x + dirTo(c.actor, p) * 40, a.y, 128, DEPTH + 30);
      if (p.x < a.x) s.setFlipX(true);
      await travel(c.scene, s, p, 340, { ease: 'in', trail: (x, y) => burst(c.scene, x, y, { colors: FIRE, n: 3, speed: [20, 110], gravity: -80, life: [260, 520], size: [8, 16] }), trailEvery: 24 });
      s.destroy();
      c.sfx('fireBlast');
      burst(c.scene, p.x, p.y, { colors: FIRE, n: 30, speed: [120, 520], gravity: 200, life: [380, 780], size: [10, 22] });
      void ring(c.scene, p.x, p.y + 30, { r: 130, flat: 0.5, n: 26, colors: FIRE, dur: 420, size: 14 });
      const boom = sprite(c.scene, 'ember', '#ffd23f', p.x, p.y, 96, DEPTH + 45);
      c.scene.tweens.add({ targets: boom, displayWidth: 240, displayHeight: 240, alpha: 0, duration: slow(380), onComplete: () => boom.destroy() });
      shake(c.scene, 110, 0.003);
    }),
  );
};

const blizzard = async (c: VfxCtx) => {
  c.sfx('windHowl');
  c.sfx('hailPatter');
  await c.windUp('#8fd8ff');
  let shattered = 0;
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
          if (shattered++ % 3 === 0) c.sfx('iceCrack');
          burst(c.scene, x, y, { colors: ICE, n: 12, speed: [100, 340], gravity: 500, life: [300, 560], size: [8, 14] });
          void ring(c.scene, x, y + 30, { r: 70, flat: 0.4, n: 14, colors: ICE, dur: 360, size: 8 });
        })(),
      );
    }
  }
  await Promise.all(jobs);
};

const barrier = async (c: VfxCtx) => {
  c.sfx('magicHum');
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
  c.sfx('meteorWhistle');
  const cell = c.centerPos ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
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
  c.sfx('bigBoom');
  c.sfx('fireCrackle');
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
      c.sfx('boneSpin');
      const a = spot(c.actor);
      const p = spot(t);
      const s = sprite(c.scene, 'bonethrow', '#b36bff', a.x + dirTo(c.actor, p) * 30, a.y, 96, DEPTH + 30);
      await travel(c.scene, s, p, 360, { spin: 3, arc: 70, trail: (x, y) => burst(c.scene, x, y, { colors: ['#b872ff', '#5a2a9c', '#fdfaf2'], n: 2, speed: [10, 60], gravity: 0, life: [260, 480], size: [8, 12] }), trailEvery: 28 });
      s.destroy();
      c.sfx('boneImpact');
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
  c.sfx('darkChant');
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
          if (i === 0) c.sfx('earthCrack');
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
          if (i % 2 === 0) c.sfx('clawRake');
          if (i === 3) c.sfx('bloodSplat');
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
      c.sfx('bloodSplat');
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
  c.sfx('ghostWail');
  await c.windUp('#b36bff');
  const a = spot(c.actor);
  const cell = c.centerPos ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
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
  c.sfx('graveMoan');
  await c.windUp('#b36bff');
  const f = feet(c.actor);
  const circle = sprite(c.scene, 'circle', '#b36bff', f.x, f.y, 240, DEPTH - 20).setScale(1.2, 0.44);
  c.scene.tweens.add({ targets: circle, angle: 180, alpha: 0, duration: slow(900), onComplete: () => circle.destroy() });
  burst(c.scene, f.x, f.y - 20, { colors: VOID, n: 14, speed: [40, 140], angle: [-Math.PI, 0], gravity: -100, life: [500, 900], size: [8, 14] });
};

const bonestrike = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  c.sfx('rustySlash');
  for (const t of c.targets) {
    const p = spot(t);
    void arcSlash(c.scene, p.x, p.y, { dir: dirTo(c.actor, p), colors: BONE, from: -0.9, to: 0.9 });
    hit(c.scene, p.x, p.y, BONE);
  }
};

/**
 * Geniş kemik savrulması: yandan görünümde yatay bir savrulma, ekranda `x` civarında dikey bir yay olarak `yTop` -> `yBot` süpürülür
 * (`dir` saldırı yönü, yay hedef tarafına doğru şişer). Üç paralel iz (orta en kalın) aynı anda süpürülür, kuyruk sönerek geride kalır.
 */
function wideBoneSlash(scene: Phaser.Scene, x: number, yTop: number, yBot: number, dir: number, o: { reverse?: boolean; dur?: number; bulge?: number } = {}): Promise<void> {
  const g = scene.add.graphics().setDepth(DEPTH + 40);
  const bulge = o.bulge ?? 44;
  const layers = [
    { dx: -dir * 34, size: 26, cols: ['#98a2b4', '#d7dce6'], lag: 0.12 },
    { dx: 0, size: 44, cols: ['#fdfaf2', '#fdfaf2', '#eae3c6', '#d7dce6'], lag: 0 },
    { dx: dir * 34, size: 26, cols: ['#8c5a2b', '#d7dce6', '#98a2b4'], lag: 0.2 },
  ].map((l) => ({ ...l, c: l.cols.map(color) }));
  const n = 64;
  return counter(scene, slow(o.dur ?? 210), (u) => {
    g.clear();
    for (const l of layers) {
      const head = Math.min(1, Math.max(0, (u - l.lag) / (1 - l.lag)));
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        if (k > head || k < head - 0.5) continue;
        const kk = o.reverse ? 1 - k : k;
        const s = l.size * PX * 1.4 * Math.max(0.25, 1 - (head - k) * 1.5) * (0.55 + 0.45 * Math.sin(Math.PI * k));
        const px = snap(x + l.dx + dir * Math.sin(Math.PI * kk) * bulge);
        const py = snap(yTop + (yBot - yTop) * kk);
        g.fillStyle(l.c[(i + Math.floor(u * 7)) % l.c.length]!, 1).fillRect(px - s / 2, py - s / 2, Math.max(2, s), Math.max(2, s));
      }
    }
    if (u >= 1) g.destroy();
  });
}

/** Kemik kesme anı: hedefte kıymıklar fırlar, kuru toz ve kıvılcım, hafif geri savrulma. */
function boneCut(scene: Phaser.Scene, t: CombatantView, dir: number, size = 1): void {
  const p = spot(t);
  hit(scene, p.x, p.y, BONE, 1.15 * size);
  burst(scene, p.x, p.y, { colors: ['#e3b983', '#fdfaf2', '#8c5a2b'], n: 8, speed: [120, 380], angle: [-Math.PI, 0.3], gravity: 760, life: [320, 640], size: [6, 10] });
  for (let i = 0; i < 4; i++) {
    const sp = sprite(scene, 'bonesliver', '#d9d4c0', p.x, p.y, 40 * size, DEPTH + 55).setRotation(rnd(0, 6));
    scene.tweens.add({ targets: sp, x: p.x + dir * rnd(20, 140) + rnd(-50, 50), rotation: sp.rotation + rnd(-5, 5), alpha: 0, duration: slow(rnd(380, 620)), ease: 'Cubic.easeIn', onComplete: () => sp.destroy() });
    scene.tweens.add({ targets: sp, y: p.y - rnd(30, 90), duration: slow(170), ease: 'Quad.easeOut', onComplete: () => scene.tweens.add({ targets: sp, y: p.y + rnd(40, 110), duration: slow(360), ease: 'Quad.easeIn' }) });
  }
  scene.tweens.add({ targets: t.container, x: t.container.x + dir * 14, duration: slow(50), yoyo: true });
}

/**
 * Skeleton - Bone Slash: iskelet hedefe koşar, kemik palayı geri çekip geniş savurur; yay hedefin ve iki yanındaki hücrelerin hepsini süpürür.
 * Ana hedefin kesimi hemen, yan hedeflerin kesimi (ikinci vuruş) kendi hasar rakamlarından hemen önce oynar (VfxCtx.gate).
 */
const boneslash = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const stand = standNear(c.actor, t);
  const dir = stand.dir;
  const sides = c.targets.slice(1);
  await c.actor.approach(stand.x, stand.y, 170);
  c.actor.play('attack');
  // hazırlık: pala geri çekilir
  await new Promise<void>((resolve) => c.scene.tweens.add({ targets: c.actor.container, x: stand.x - dir * 24, duration: slow(80), onComplete: () => resolve() }));
  c.sfx('boneSlashWhoosh');
  c.scene.tweens.add({ targets: c.actor.container, x: stand.x + dir * 28, duration: slow(70), yoyo: true });
  const spots = c.targets.map((u) => spot(u));
  const pad = sides.length ? 80 : 100;
  const yTop = Math.min(...spots.map((q) => q.y)) - pad;
  const yBot = Math.max(...spots.map((q) => q.y)) + pad;
  const cx = spots.reduce((s, q) => s + q.x, 0) / spots.length;
  void wideBoneSlash(c.scene, cx - dir * 6, yTop, yBot, dir);
  // ana hedefe yay ulaşınca
  await wait(c.scene, slow(sides.length ? 55 : 80));
  c.sfx('boneSlashHit');
  boneCut(c.scene, t, dir, 1.15);
  shake(c.scene, 110, 0.0035);
  void wait(c.scene, slow(70)).then(() => c.sfx('boneSlashCrack'));
  if (!sides.length) {
    void wait(c.scene, slow(140)).then(() => c.actor.returnHome());
    return;
  }
  c.gate(
    1,
    async () => {
      // ikinci vuruş: ters yönde geri savurma, yan hedeflerde kesim
      c.sfx('boneSlashHit');
      void wideBoneSlash(c.scene, cx - dir * 6, yTop, yBot, dir, { reverse: true, dur: 170 });
      c.actor.play('attack');
      c.scene.tweens.add({ targets: c.actor.container, x: stand.x + dir * 24, duration: slow(60), yoyo: true });
      for (const s of sides) boneCut(c.scene, s, dir, 1);
      shake(c.scene, 110, 0.0035);
      await wait(c.scene, slow(60));
      void c.actor.returnHome();
    },
    () => void c.actor.returnHome(),
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// ARCHER

/** 16x16 ok ikonu kuzeydoğuya bakar; verilen yöne (radyan) döndürmek için eklenecek açı. */
const arrowRot = (angle: number) => Math.round((angle + Math.PI / 4) / (Math.PI / 8)) * (Math.PI / 8);

const arrowshot = async (c: VfxCtx) => {
  c.actor.play('attack');
  c.sfx('bowTwang');
  const wind = c.actor.container;
  burst(c.scene, wind.x, wind.y - 80, { colors: ['#d9c9a3', '#ffffff'], n: 6, speed: [60, 160], angle: [Math.PI * 0.8, Math.PI * 1.2], gravity: 0, life: [200, 360], size: [8, 12] });
  await Promise.all(
    c.targets.map(async (t) => {
      c.sfx('arrowWhoosh');
      const a = spot(c.actor);
      const p = spot(t);
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      const s = sprite(c.scene, 'arrow', '#d9c9a3', a.x, a.y, 96, DEPTH + 30).setRotation(arrowRot(ang));
      await travel(c.scene, s, p, 210, { trail: (x, y) => burst(c.scene, x, y, { colors: ['#ffffff', '#d9c9a3'], n: 1, speed: [0, 20], gravity: 0, life: [150, 260], size: [8, 8] }), trailEvery: 22 });
      s.destroy();
      c.sfx('arrowThunk');
      hit(c.scene, p.x, p.y, ['#ffffff', '#d9c9a3', '#ffd23f'], 0.8);
    }),
  );
  c.actor.play('idle');
};

const pierce = async (c: VfxCtx) => {
  c.actor.play('attack');
  await wait(c.scene, slow(220)); // yayı geri çeker
  c.sfx('heavyTwang');
  c.sfx('arrowWhoosh');
  const a = spot(c.actor);
  const far = c.targets.length ? c.targets.reduce((m, t) => (Math.abs(t.container.x - a.x) > Math.abs(m.container.x - a.x) ? t : m)) : undefined;
  // Şerit skill'i: ok, tıklanan şeridin en uzak hücresine uçar (şeritte kimse olmasa da orayı gösterir)
  const farCell = c.cells.length ? c.cells.reduce((m, q) => (Math.abs(q.x - a.x) > Math.abs(m.x - a.x) ? q : m)) : undefined;
  const end = farCell ? { x: farCell.x, y: farCell.y - 70 } : far ? spot(far) : { x: a.x + 600, y: a.y };
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
    void wait(c.scene, slow(dur * 0.1 * (1 - frac))).then(() => {
      c.sfx('arrowThunk');
      hit(c.scene, p.x, p.y, ['#ffd166', '#ffffff'], 1);
    });
  }
  c.actor.play('idle');
};

const arrowrain = async (c: VfxCtx) => {
  c.actor.play('attack');
  c.sfx('bowTwang');
  await c.windUp('#d9c9a3', 'attack');
  c.sfx('arrowShower');
  let landed = 0;
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
          if (landed++ % 4 === 0) c.sfx('arrowThunk');
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
  c.sfx('bowDraw');
  const a = spot(c.actor);
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const reticle = sprite(c.scene, 'aimedshot', '#ff5a4a', p.x, p.y, 256, DEPTH + 35).setAlpha(0.95);
      c.scene.tweens.add({ targets: reticle, displayWidth: 112, displayHeight: 112, angle: 90, duration: slow(420), ease: 'Quad.easeIn' });
      await wait(c.scene, slow(440));
      flash(c.scene, '#ffffff', 0.18, 140);
      c.sfx('heavyTwang');
      c.sfx('arrowWhoosh');
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      const s = sprite(c.scene, 'arrow', '#ffd166', a.x, a.y, 128, DEPTH + 40).setRotation(arrowRot(ang));
      await travel(c.scene, s, p, 150, { trail: (x, y) => burst(c.scene, x, y, { colors: ['#ffd166', '#ffffff'], n: 3, speed: [10, 60], gravity: 0, life: [200, 340], size: [8, 14] }), trailEvery: 14 });
      s.destroy();
      reticle.destroy();
      c.sfx('arrowThunk');
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

/**
 * Treant - Root Smash: Treant hedefin yanına gider, kökten kolunu geri çeker ve devasa kök yumruğu KENDİ omzundan düşmana doğru yatay fırlatır
 * (gökten inmez). Kol, omuzdan yumruğa uzanan kıvrık kök parçalarıdır; yumruk hedefin boyuna oranlıdır. Çarpmada toprak/kök patlaması,
 * kıymık ve yaprak, yer çatlağı, hafif sarsıntı; hedef geri savrulur. Hasar animasyon bitince (çarpma anında) işlenir.
 */
const woodsmash = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const stand = standNear(a, t);
  const dir = stand.dir;
  await a.approach(stand.x, stand.y, 170);
  // geri çekiliş (hazırlık): gövde geriye eğilir, omuzda yaprak/kıymık
  a.play('attack');
  c.sfx('woodCreak');
  const shoulder = () => ({ x: a.container.x + dir * a.w * 0.22, y: a.container.y - a.h * 0.55 });
  const fistSize = Math.max(96, Math.min(208, Math.round((t.h * 0.6) / 16) * 16));
  const fist = sprite(c.scene, 'rootsmash', '#8a6a3a', shoulder().x, shoulder().y, fistSize, DEPTH + 40).setRotation(dir * (Math.PI / 2));
  const arm = c.scene.add.graphics().setDepth(DEPTH + 38);
  const drawArm = () => {
    arm.clear();
    const s = shoulder();
    const dx = fist.x - dir * fistSize * 0.3 - s.x;
    const dy = fist.y - s.y;
    const n = Math.max(2, Math.ceil(Math.abs(dx) / 14));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const w = Math.round(30 - 12 * u);
      const x = s.x + dx * u;
      const y = s.y + dy * u + Math.sin(u * Math.PI * 2.4) * 7;
      arm.fillStyle(color(i % 3 === 0 ? '#4a2e1a' : '#6b4423'), 1).fillRect(snap(x - w / 2), snap(y - w / 2), w, w);
      arm.fillStyle(color('#8c5a2b'), 1).fillRect(snap(x - w / 2), snap(y - w / 2), w, 4);
      if (i % 4 === 2) arm.fillStyle(color('#62d04b'), 1).fillRect(snap(x - 4), snap(y - w / 2 - 6), 8, 8);
    }
  };
  const back = shoulder().x - dir * 34;
  fist.setPosition(back, shoulder().y);
  drawArm();
  c.scene.tweens.add({ targets: a.container, x: stand.x - dir * 20, duration: slow(190), ease: 'Quad.easeOut' });
  burst(c.scene, back, shoulder().y, { colors: ['#62d04b', '#8c5a2b', '#e3b983'], n: 5, speed: [30, 110], angle: [-Math.PI, 0], gravity: 140, life: [260, 520], size: [8, 14] });
  await wait(c.scene, slow(210));
  // yumruk fırlar: omuzdan hedefin gövdesine, yatay
  const p = spot(t);
  const hitX = p.x - dir * (fistSize * 0.34 + t.w * 0.18);
  const from = { x: fist.x, y: fist.y };
  const to = { x: hitX, y: p.y };
  c.scene.tweens.add({ targets: a.container, x: stand.x + dir * 26, duration: slow(110), ease: 'Quad.easeIn' });
  await counter(
    c.scene,
    slow(120),
    (u) => {
      const e = u * u;
      fist.setPosition(snap(from.x + (to.x - from.x) * e), snap(from.y + (to.y - from.y) * e));
      drawArm();
      if (u > 0.25 && u < 0.95) burst(c.scene, fist.x - dir * fistSize * 0.3, fist.y, { colors: ['#e3b983', '#8c5a2b'], n: 1, speed: [0, 30], gravity: 0, life: [140, 240], size: [8, 12] });
    },
  );
  // çarpma
  c.sfx('woodSmash');
  c.sfx('rootsRumble');
  c.sfx('leafRustle');
  const f = feet(t);
  hit(c.scene, p.x - dir * t.w * 0.15, p.y, WOOD, 1.5);
  cracks(c.scene, f.x, f.y - 2, { len: 130, n: 7, dur: 600 });
  dustCloud(c.scene, f.x, f.y, { n: 6, spread: 90, rise: 40, size: [30, 54], tint: 0x8a6a3a });
  burst(c.scene, f.x, f.y - 8, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 12, speed: [120, 380], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [420, 800], size: [10, 18] });
  for (let i = 0; i < 3; i++) {
    const sp = sprite(c.scene, 'thornspike', '#8c5a2b', f.x + (i - 1) * 34 + dir * 10, f.y + 4, 64, DEPTH - 5);
    sprout(c.scene, sp, 120);
    c.scene.tweens.add({ targets: sp, alpha: 0, duration: slow(240), delay: slow(260), onComplete: () => sp.destroy() });
  }
  for (let i = 0; i < 8; i++) {
    const sp = sprite(c.scene, i % 2 ? 'splinter' : 'leafbit', i % 2 ? '#e3b983' : '#62d04b', p.x, p.y, 36, DEPTH + 45).setRotation(rnd(0, 6));
    c.scene.tweens.add({ targets: sp, x: p.x + dir * rnd(10, 150) + rnd(-40, 40), y: p.y + rnd(-110, 50), rotation: sp.rotation + rnd(-4, 4), alpha: 0, duration: slow(540), onComplete: () => sp.destroy() });
  }
  c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 18, duration: slow(60), yoyo: true });
  shake(c.scene, 130, 0.005);
  c.scene.tweens.add({ targets: [fist, arm], alpha: 0, duration: slow(260), delay: slow(120), onComplete: () => { fist.destroy(); arm.destroy(); } });
  await wait(c.scene, slow(90));
  void wait(c.scene, slow(200)).then(() => a.returnHome());
};

/** `thorns` durumundaki birimin saldırgana yansıttığı diken: saldırganın üstünde kısa yeşil-kahve diken kıvılcımı ve ufak sarsıntı. */
export function thornReflectFx(scene: Phaser.Scene, victim: CombatantView, holder: CombatantView): void {
  const p = spot(victim);
  const dir = victim.container.x >= holder.container.x ? 1 : -1;
  playSfx(scene, 'thornStab');
  // diken uçları holder tarafından saldırganın gövdesine saplanır (uçları saldırgana bakar)
  for (let i = 0; i < 4; i++) {
    const off = rnd(-0.55, 0.55);
    const sp = sprite(scene, 'thornspike', '#8bd06a', p.x - dir * 70, p.y + (i - 1.5) * 26 + rnd(-8, 8), 56, DEPTH + 55).setRotation(dir * (Math.PI / 2) + off);
    const to = { x: p.x - dir * rnd(0, 18), y: sp.y + off * 24 };
    void travel(scene, sp, to, 80, { ease: 'out' }).then(() => scene.tweens.add({ targets: sp, alpha: 0, duration: slow(200), delay: slow(60), onComplete: () => sp.destroy() }));
  }
  burst(scene, p.x, p.y, { colors: ['#62d04b', '#2c7a2b', '#8c5a2b', '#e3b983'], n: 7, speed: [100, 300], angle: [-Math.PI * 0.95, -0.1], gravity: 700, life: [260, 520], size: [6, 10] });
  scene.tweens.add({ targets: victim.container, x: victim.container.x + dir * 9, duration: slow(45), yoyo: true, repeat: 1 });
  shake(scene, 80, 0.002);
}

/**
 * Treant - Thorn Shield: Treant'ın çevresinde yerden ahşap dikenler ve dikenli kökler fırlar, çevresini kaplayıp kalkan olur (doğal, yeşil-kahve; parıltı yok).
 * Dikenler arkada/önde elips boyunca dizilir; sonra iner ve yerini `thorns` durumunun kalıcı diken kabuğu alır (CombatantView.setThornShell).
 */
const thornshield = async (c: VfxCtx) => {
  const a = c.actor;
  c.sfx('thornCreak');
  a.play('cast');
  const f = feet(a);
  const rx = a.w * 0.58;
  const ry = 30;
  const spikes: Phaser.GameObjects.Image[] = [];
  cracks(c.scene, f.x, f.y, { len: 150, n: 8, dur: 900 });
  dustCloud(c.scene, f.x, f.y, { n: 6, spread: 100, rise: 70, size: [34, 60], tint: 0x9a7c52 });
  await wait(c.scene, slow(260));
  c.sfx('thornSprout');
  const N = 12;
  for (let i = 0; i < N; i++) {
    void wait(c.scene, slow(i * 36)).then(() => {
      const th = (i / N) * Math.PI * 2 + 0.2;
      const side = Math.cos(th);
      const x = f.x + side * rx;
      const y = f.y + Math.sin(th) * ry;
      const back = Math.sin(th) < 0;
      const h = 72 + Math.abs(side) * 48 + (back ? 16 : -8) + rnd(0, 18);
      const sp = c.scene.add.image(snap(x), snap(y), ensureIcon(c.scene, 'thornspike', '#8bd06a', false)).setOrigin(0.5, 1).setDisplaySize(h * 0.46, h).setRotation(side * 0.42 + rnd(-0.1, 0.1)).setDepth(back ? a.container.depth - 1 : DEPTH - 40);
      const sy = sp.scaleY;
      sp.setScale(sp.scaleX, sy * 0.05);
      c.scene.tweens.add({ targets: sp, scaleY: sy, duration: slow(190), ease: 'Back.easeOut' });
      spikes.push(sp);
      burst(c.scene, x, y, { colors: ['#4a2e1a', '#8c5a2b', '#e3b983'], n: 3, speed: [40, 190], angle: [-Math.PI, 0], gravity: 560, life: [260, 520], size: [6, 10] });
    });
  }
  // dikenli kökler iki yanda yükselip gövdeye sarılır
  for (const sgn of [-1, 1]) {
    void wait(c.scene, slow(150 + (sgn > 0 ? 70 : 0))).then(() => {
      const v = c.scene.add.image(snap(f.x + sgn * rx * 0.72), snap(f.y + 4), ensureIcon(c.scene, 'thornvine', '#8bd06a', false)).setOrigin(0.5, 1).setDisplaySize(84, 170).setDepth(DEPTH - 41);
      v.setFlipX(sgn < 0);
      const by = v.scaleY;
      v.setScale(v.scaleX, by * 0.05);
      c.scene.tweens.add({ targets: v, scaleY: by, duration: slow(300), ease: 'Back.easeOut' });
      c.scene.tweens.add({ targets: v, angle: sgn * 5, duration: slow(520), yoyo: true, ease: 'Sine.easeInOut' });
      spikes.push(v);
    });
  }
  shake(c.scene, 220, 0.0035);
  await wait(c.scene, slow(N * 36 + 160));
  // tutundukları an: hafif bir sarsılma, sonra dikenler iner (kabuk devralır)
  c.scene.tweens.add({ targets: a.container, scaleX: 1.025, scaleY: 0.98, duration: slow(90), yoyo: true });
  for (const sp of spikes) c.scene.tweens.add({ targets: sp, scaleY: sp.scaleY * 0.45, alpha: 0, duration: slow(440), delay: slow(380), ease: 'Quad.easeIn', onComplete: () => sp.destroy() });
};

// ---------------------------------------------------------------------------------------------------------------------
// DEFENDER

const tauntFx = async (c: VfxCtx) => {
  const p = spot(c.actor);
  c.sfx('warShout');
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

/**
 * Guard: "ittifak kalkanı". Defender büyük kalkanını önüne kaldırır, kalkanından dostuna örgülü bir ışık şeridi akar ve dostunun
 * gövdesini aynı biçimde bir kalkan kuşatır; iki kalkan birlikte parlar (hasar paylaşımı: ikisi bağlıdır), sonra söner.
 */
const guardlink = async (c: VfxCtx) => {
  c.sfx('testudo');
  c.actor.play('cast');
  const a = spot(c.actor);
  for (const t of c.targets) {
    const p = spot(t);
    const dir = dirTo(c.actor, p);
    // 1) Defender kalkanını önüne kaldırır
    const mine = sprite(c.scene, 'bulwark', '#6ec1ff', a.x + dir * 64, a.y + 6, 176, DEPTH + 35).setAlpha(0);
    grow(c.scene, mine, 0.35, 1, 240, 'Back.easeOut', { alpha: 0.95 });
    void ring(c.scene, c.actor.container.x, c.actor.container.y - 4, { r: 110, flat: 0.3, n: 22, colors: ['#4aa3ff', '#a8ebff', '#ffffff'], dur: 480, size: 10 });
    c.scene.tweens.add({ targets: c.actor.container, x: c.actor.container.x + dir * 10, duration: slow(80), yoyo: true });
    await wait(c.scene, slow(240));
    // 2) kalkandan dosta akan örgülü ışık şeridi
    const g = c.scene.add.graphics().setDepth(DEPTH + 30);
    const from = { x: a.x + dir * 64, y: a.y + 6 };
    const to = { x: p.x, y: p.y };
    const ribbon = (reveal: number, phase: number) => {
      g.clear();
      const n = 40;
      for (let strand = 0; strand < 2; strand++) {
        for (let i = 0; i <= n * reveal; i++) {
          const u = i / n;
          const w = Math.sin(u * Math.PI * 4 + phase + strand * Math.PI) * 16 * Math.sin(u * Math.PI);
          const x = snap(from.x + (to.x - from.x) * u);
          const y = snap(from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * 38 + w);
          g.fillStyle(strand ? 0xa8ebff : 0x4aa3ff, 1).fillRect(x - 4, y - 4, 8, 8);
          g.fillStyle(0xffffff, 0.9).fillRect(x - 2, y - 2, 4, 4);
        }
      }
    };
    await counter(c.scene, slow(320), (u) => ribbon(u, u * 6), 'Quad.easeOut');
    // 3) dostun gövdesini aynı kalkan kuşatır
    const theirs = sprite(c.scene, 'bulwark', '#6ec1ff', p.x, p.y, 200, DEPTH + 28).setAlpha(0);
    grow(c.scene, theirs, 0.4, 1, 260, 'Back.easeOut', { alpha: 0.7 });
    void ring(c.scene, t.container.x, t.container.y - 6, { r: 100, flat: 0.3, n: 22, colors: ['#4aa3ff', '#a8ebff', '#ffffff'], dur: 480, size: 10 });
    burst(c.scene, p.x, p.y, { colors: ['#a8ebff', '#ffffff', '#4aa3ff'], n: 12, speed: [60, 220], gravity: 0, life: [350, 650], size: [8, 12] });
    // 4) iki kalkan birlikte parlar (bağlılar), sonra sönerler
    const phaseDone = counter(c.scene, slow(520), (u) => ribbon(1, 6 + u * 10));
    c.scene.tweens.add({ targets: [mine, theirs], alpha: { from: 0.95, to: 0.35 }, duration: slow(130), yoyo: true, repeat: 1 });
    await phaseDone;
    c.scene.tweens.add({ targets: [mine, theirs], alpha: 0, duration: slow(300), onComplete: () => { mine.destroy(); theirs.destroy(); g.destroy(); } });
  }
  await wait(c.scene, slow(150));
};

const tremor = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  c.sfx('effortHah');
  c.sfx('armorStomp');
  const cell = c.centerPos ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  cracks(c.scene, cell.x, cell.y - 8, { len: 220, n: 9 });
  void ring(c.scene, cell.x, cell.y - 8, { r: 260, flat: 0.32, n: 36, colors: DUST, dur: 600, size: 14 });
  void ring(c.scene, cell.x, cell.y - 8, { r: 150, flat: 0.32, n: 26, colors: ['#ffffff', '#ffd23f'], dur: 420, size: 12 });
  burst(c.scene, cell.x, cell.y - 20, { colors: ['#5b6579', '#98a2b4', '#4a2e1a'], n: 22, speed: [160, 460], angle: [-Math.PI, 0], gravity: 900, life: [500, 950], size: [10, 20] });
  for (const q of c.cells.filter((x) => x !== c.centerPos)) burst(c.scene, q.x, q.y - 10, { colors: DUST, n: 8, speed: [40, 160], angle: [-Math.PI, 0], gravity: 500, life: [300, 600], size: [8, 14] });
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
      c.sfx('fistWhoosh');
      await travel(c.scene, fist, { x: p.x, y: p.y - 10 }, 400, { ease: 'in', trail: (x, y) => burst(c.scene, x, y - 90, { colors: ['#ffd166', '#ffffff'], n: 1, speed: [0, 20], gravity: 0, life: [200, 300], size: [8, 12] }), trailEvery: 30 });
      shadow.destroy();
      c.sfx('punchImpact');
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

const VOIDPURPLE = ['#b872ff', '#9b59d0', '#7d3fb0', '#e3ccff'];

/**
 * Mana Steal (eski Mana Burn): Anti-Mage hedefin yanına gidip boşluk gücüyle vurur; hedefin bedeninden mana damlaları fışkırır
 * (Void Strike'ın damlaları), uzayan iplikler hâlinde Anti-Mage'e doğru kıvrılarak çekilir ve onun bedenine emilir (çalınan mana).
 */
const manasteal = async (c: VfxCtx) => {
  await c.lunge(avgX(c.targets, c.actor.container.x));
  c.sfx('manaSizzle');
  c.sfx('energySlurp');
  for (const t of c.targets) {
    const p = spot(t);
    const dir = dirTo(c.actor, p);
    void arcSlash(c.scene, p.x, p.y, { dir, colors: [...VOIDPURPLE, '#ffffff'], from: -0.9, to: 0.9, r: 92, dur: 150, size: 16 });
    void ring(c.scene, p.x, p.y, { r: 110, flat: 0.8, n: 24, colors: [...VOIDPURPLE, '#ffffff'], dur: 320, size: 8 });
    burst(c.scene, p.x, p.y, { colors: VOIDPURPLE, n: 16, speed: [140, 380], gravity: 300, life: [260, 480], size: [6, 12] });
    flash(c.scene, '#2a0a4a', 0.2, 260);
    const N = 11;
    type Drop = { s: Phaser.GameObjects.Image; base: number; start: { x: number; y: number }; vx: number; vy: number; burstT: number; pull: number; delay: number; size: number; apex: { x: number; y: number } | null; ctrlOff: number; done: boolean };
    const drops: Drop[] = Array.from({ length: N }, () => {
      const th = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rnd(260, 520);
      const size = rnd(34, 60);
      const s = sprite(c.scene, 'manadrop', '#9b59d0', p.x, p.y, size, DEPTH + 34).setAlpha(0);
      return { s, base: s.scaleX, start: { x: p.x + rnd(-t.w * 0.25, t.w * 0.25), y: p.y + rnd(-t.h * 0.2, t.h * 0.25) }, vx: Math.cos(th) * sp, vy: Math.sin(th) * sp, burstT: rnd(0.14, 0.22), pull: rnd(0.34, 0.5), delay: rnd(0, 0.16), size, apex: null, ctrlOff: rnd(60, 150), done: false };
    });
    const total = Math.max(...drops.map((d) => d.delay + d.burstT + d.pull)) + 0.05;
    const G = 700;
    let frame = 0;
    const stream = counter(c.scene, slow(total * 1000), (u) => {
      const ts = u * total;
      frame++;
      const a = spot(c.actor); // Anti-Mage'in o anki konumu (yerine dönerken değişir)
      for (const d of drops) {
        if (d.done) continue;
        const l = ts - d.delay;
        if (l < 0) continue;
        let x: number;
        let y: number;
        let rot: number;
        let sx: number;
        let sy: number;
        if (l <= d.burstT) {
          // 1) hedeften fışkırma (kısa balistik yay, yuvarlak baş önde)
          x = d.start.x + d.vx * l;
          y = d.start.y + d.vy * l + 0.5 * G * l * l;
          rot = Math.atan2(-(d.vy + G * l), -d.vx) + Math.PI / 2;
          sx = 1;
          sy = 1.2;
          d.apex = { x, y };
        } else if (d.apex) {
          // 2) çekilme: Anti-Mage'e doğru kıvrılan eğri; damla uzayan bir ipliğe dönüşür
          const k = Math.min(1, (l - d.burstT) / d.pull);
          const e = k * k * (3 - 2 * k) * 0.6 + k * k * 0.4;
          const ctrl = { x: (d.apex.x + a.x) / 2, y: Math.min(d.apex.y, a.y) - d.ctrlOff };
          const bx = (u1: number) => (1 - u1) * (1 - u1) * d.apex!.x + 2 * (1 - u1) * u1 * ctrl.x + u1 * u1 * a.x;
          const by = (u1: number) => (1 - u1) * (1 - u1) * d.apex!.y + 2 * (1 - u1) * u1 * ctrl.y + u1 * u1 * a.y;
          x = bx(e);
          y = by(e);
          const e2 = Math.min(1, e + 0.03);
          rot = Math.atan2(-(by(e2) - y), -(bx(e2) - x)) + Math.PI / 2; // baş önde, kuyruk geride
          sx = 1 - 0.5 * k;
          sy = 1.3 + 2.3 * k;
          if (k >= 1) {
            d.done = true;
            d.s.destroy();
            // emilme: Anti-Mage'in bedeninde küçük dalgalanma ve parıltı
            void ring(c.scene, a.x, a.y, { r: 60, flat: 0.9, n: 14, colors: [...VOIDPURPLE, '#ffffff'], dur: 240, size: 6 });
            burst(c.scene, a.x, a.y, { colors: VOIDPURPLE, n: 4, speed: [60, 200], gravity: 0, life: [200, 380], size: [4, 8] });
            continue;
          }
        } else continue;
        d.s.setPosition(snap(x), snap(y)).setRotation(rot).setScale(d.base * sx, d.base * sy).setAlpha(Math.min(1, l * 14));
        if (frame % 3 === 0) {
          const tr = sprite(c.scene, 'manadrop', '#9b59d0', x, y, d.size * 0.35, DEPTH + 30).setRotation(rot).setAlpha(0.4);
          c.scene.tweens.add({ targets: tr, alpha: 0, displayWidth: d.size * 0.12, displayHeight: d.size * 0.45, duration: slow(140), onComplete: () => tr.destroy() });
        }
      }
    });
    void stream.then(() => {
      for (const d of drops) if (!d.done) d.s.destroy();
      c.actor.ring('#9b59d0', 1);
    });
  }
  await wait(c.scene, slow(300));
};

/**
 * Drain Field: Anti-Mage seçilen alanı büyüyle mühürler (projectile yok). Yerde, seçilen merkezden başlayarak yavaşça büyüyen mor
 * bir alan açılır, dolunca patlar; alandaki her karakterin bedeninden Void Strike'ın mana damlaları havaya yükselip uzayarak
 * buharlaşır ve etkilenen her karakterin çevresinde sönen mor bir çerçeve kalır.
 */
const drainfield = async (c: VfxCtx) => {
  c.sfx('voidSuction');
  await c.windUp('#9b59d0');
  const center = c.centerPos ?? (c.targets[0] ? feet(c.targets[0]) : feet(c.actor));
  const cells = (c.cells.length ? c.cells : [center]).slice().sort((p, q) => Math.hypot(p.x - center.x, p.y - center.y) - Math.hypot(q.x - center.x, q.y - center.y));
  const GROW = 900; // alanın yavaşça büyüme süresi (ms)
  // 1) yerde yavaşça büyüyen TEK mor alan: hücre hücre değil, genel alan göstergesinin en geniş dairesi (yassı elips) kadar
  // Seçim sırasında zeminde görünen alan göstergesiyle AYNI elips: kapsanan hücrelerin sınır kutusuna oturur; ızgara kenarında
  // kesilen alanlarda küçülür/kayar, bu yüzden her seferinde aynı olmaz.
  const minX = Math.min(...cells.map((q) => q.x));
  const maxX = Math.max(...cells.map((q) => q.x));
  const minY = Math.min(...cells.map((q) => q.y));
  const maxY = Math.max(...cells.map((q) => q.y));
  const fx = (minX + maxX) / 2;
  const fy = (minY + maxY) / 2 - 4;
  const fw = maxX - minX + 160;
  const fh = maxY - minY + 96 + 20;
  const rx = fw / 2;
  const ry = fh / 2;
  const outer = c.scene.add.ellipse(fx, fy, fw * 1.08, fh * 1.12, color('#9b59d0'), 0).setStrokeStyle(4, color('#b872ff'), 0).setDepth(DEPTH - 28).setScale(0.04);
  const inner = c.scene.add.ellipse(fx, fy, fw, fh, color('#7d3fb0'), 0).setDepth(DEPTH - 27).setScale(0.04);
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x1a0630, 0).setDepth(DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.3, duration: slow(GROW) });
  await counter(
    c.scene,
    slow(GROW),
    (u) => {
      const e = 1 - (1 - u) ** 2;
      outer.setScale(0.04 + 0.96 * e).setFillStyle(color('#9b59d0'), 0.26 * u).setStrokeStyle(4, color('#b872ff'), 0.9 * u);
      inner.setScale(0.04 + 0.96 * e).setFillStyle(color('#7d3fb0'), (0.34 + 0.08 * Math.sin(u * 24)) * u);
      if (Math.random() < 0.3) burst(c.scene, fx + rnd(-rx, rx) * 0.8, fy + rnd(-ry, ry) * 0.8, { colors: VOIDPURPLE, n: 1, speed: [20, 70], angle: [-Math.PI, 0], gravity: -60, life: [500, 900], size: [6, 10] });
    },
    'Quad.easeIn',
  );
  // 2) alan dolunca tüm alan birden parlayıp patlar
  c.sfx('voidPulse');
  flash(c.scene, '#b872ff', 0.4, 380);
  shake(c.scene, 240, 0.007);
  void ring(c.scene, fx, fy, { r: rx + 70, flat: ry / rx, n: 56, colors: [...VOIDPURPLE, '#ffffff'], dur: 560, size: 14 });
  outer.setFillStyle(color('#b872ff'), 0.6);
  inner.setFillStyle(color('#b872ff'), 0.85);
  c.scene.tweens.add({ targets: [outer, inner], alpha: 0, duration: slow(750), ease: 'Quad.easeIn', onComplete: () => { outer.destroy(); inner.destroy(); } });
  for (let k = 0; k < 14; k++) {
    const ang = rnd(0, Math.PI * 2);
    const rr = Math.sqrt(rnd(0, 1));
    burst(c.scene, fx + Math.cos(ang) * rx * rr * 0.9, fy + Math.sin(ang) * ry * rr * 0.9, { colors: [...VOIDPURPLE, '#ffffff'], n: 8, speed: [120, 420], angle: [-Math.PI, 0], gravity: 500, life: [400, 800], size: [6, 12] });
  }
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: slow(800), onComplete: () => dim.destroy() });
  await wait(c.scene, slow(200));
  c.sfx('energySlurp');
  // 3) alandaki karakterlerin bedeninden mana damlaları havaya yükselip buharlaşır
  for (const t of c.targets) {
    const p = spot(t);
    void ring(c.scene, t.container.x, t.container.y - 6, { r: 90, flat: 0.3, n: 20, colors: [...VOIDPURPLE, '#ffffff'], dur: 480, size: 8 });
    // etkilenen karakterin çevresinde sönen mor çerçeve
    // etkilenen karakterin çizimini saran, yavaşça sönen mor ışıma (dikdörtgen çerçeve değil: silüeti izler)
    const fx = t.sprite.postFX?.addGlow(color('#b872ff'), 10, 0, false, 0.1, 18);
    if (fx) {
      c.scene.tweens.add({
        targets: fx,
        outerStrength: 0,
        duration: slow(1250),
        delay: slow(150),
        ease: 'Quad.easeIn',
        onComplete: () => t.sprite.postFX?.remove(fx),
      });
    }
    const M = 9;
    for (let i = 0; i < M; i++) {
      void wait(c.scene, slow(i * 70 + rnd(0, 60))).then(() => {
        const size = rnd(34, 60);
        const sx0 = p.x + rnd(-t.w * 0.3, t.w * 0.3);
        const sy0 = p.y + rnd(-t.h * 0.15, t.h * 0.3);
        const s = sprite(c.scene, 'manadrop', '#9b59d0', sx0, sy0, size, DEPTH + 34);
        const base = s.scaleX;
        const rise = rnd(170, 300);
        const sway = rnd(14, 30);
        const ph = rnd(0, 6);
        let puffAt = 0;
        void counter(c.scene, slow(rnd(900, 1250)), (u) => {
          const e = 1 - (1 - u) ** 2;
          const x = sx0 + Math.sin(u * 7 + ph) * sway * u;
          const y = sy0 - rise * e;
          // buharlaşma: yukarı çıkarken damla uzar, incelir, sivrilir ve silinir
          s.setPosition(snap(x), snap(y)).setRotation(Math.sin(u * 7 + ph) * 0.18).setScale(base * (1 - 0.65 * u), base * (1 + 1.6 * u)).setAlpha(1 - u * u);
          if (u * 1000 >= puffAt) {
            puffAt += 110;
            const pf = c.scene.add.image(x, y, ensureIcon(c.scene, 'smoke', '#98a2b4', false)).setDisplaySize(26, 26).setTint(0xb872ff).setAlpha(0.45).setDepth(DEPTH + 28);
            c.scene.tweens.add({ targets: pf, y: pf.y - 40, displayWidth: 70, displayHeight: 70, alpha: 0, duration: slow(520), onComplete: () => pf.destroy() });
          }
          if (u >= 1) s.destroy();
        });
      });
    }
  }
  await wait(c.scene, slow(520));
  c.actor.ring('#9b59d0', 1);
};

const spellward = async (c: VfxCtx) => {
  const p = spot(c.actor);
  c.sfx('wardHum');
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

/**
 * YEDEK (Ömer'in beğendiği ilk sürüm): hedefin kendi bedeninden mana dışarı püskürür, püsküren mana sivrilip mızraklara (boşluk
 * iğneleri) dönüşür ve hepsi birden hedefin içine saplanır. Geri dönmek için skill verisinde `vfx: "voidstrikespikes"` yapılır.
 */
const voidstrikespikes = async (c: VfxCtx) => {
  await c.windUp('#7d3fb0');
  c.sfx('voidPulse');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const n = 9;
      const R = 150;
      // 1) hedeften mana dışarı püskürür
      void ring(c.scene, p.x, p.y, { r: 130, flat: 0.8, n: 26, colors: ['#b872ff', '#5a2a9c', '#a8ebff'], dur: 320, size: 10 });
      burst(c.scene, p.x, p.y, { colors: ['#b872ff', '#5a2a9c', '#a8ebff', '#ffffff'], n: 34, speed: [160, 520], gravity: 0, life: [300, 560], size: [8, 16] });
      flash(c.scene, '#2a0a4a', 0.25, 300);
      const spikes = Array.from({ length: n }, (_, i) => {
        const th = (i / n) * Math.PI * 2 + rnd(-0.18, 0.18);
        const s = sprite(c.scene, 'voidspike', '#7d3fb0', p.x, p.y, 64, DEPTH + 35).setAlpha(0);
        const base = s.scaleX;
        const d = { x: -Math.cos(th), y: -Math.sin(th) }; // uç, hedefe bakar
        s.setRotation(Math.atan2(d.y, d.x) + Math.PI / 2);
        return { th, s, base };
      });
      c.sfx('implode');
      // mana akışı: hedeften dışarı akan küçük ruhlar
      for (let i = 0; i < 14; i++) {
        void wait(c.scene, slow(i * 16)).then(() => {
          const a = rnd(0, Math.PI * 2);
          const w = sprite(c.scene, 'wisp', '#b36bff', p.x, p.y, rnd(28, 52), DEPTH + 30).setRotation(a + Math.PI / 2);
          c.scene.tweens.add({ targets: w, x: p.x + Math.cos(a) * rnd(110, 190), y: p.y + Math.sin(a) * rnd(80, 150), alpha: 0, duration: slow(380), onComplete: () => w.destroy() });
        });
      }
      // 2) püsken mana sivrilir: kısa kütlelerden uzun, sivri iğnelere
      await counter(
        c.scene,
        slow(300),
        (u) => {
          for (const k of spikes) {
            const e = 1 - (1 - u) ** 2;
            k.s.setPosition(snap(p.x + Math.cos(k.th) * R * e), snap(p.y + Math.sin(k.th) * R * 0.8 * e)).setAlpha(Math.min(1, u * 2.5));
            k.s.setScale(k.base * (0.4 + 0.5 * e), k.base * (0.5 + 1.8 * e)); // incelir/uzar: sivrilme
          }
        },
        'Quad.easeOut',
      );
      await wait(c.scene, slow(90));
      // 3) hepsi hedefe saplanır
      await counter(
        c.scene,
        slow(130),
        (u) => {
          const e = u * u;
          for (const k of spikes) k.s.setPosition(snap(p.x + Math.cos(k.th) * R * (1 - e) + Math.cos(k.th) * 14), snap(p.y + Math.sin(k.th) * R * 0.8 * (1 - e) + Math.sin(k.th) * 8));
        },
        'Quad.easeIn',
      );
      void ring(c.scene, p.x, p.y, { r: 170, flat: 0.8, n: 32, colors: ['#b872ff', '#5a2a9c', '#15101c', '#ffffff'], dur: 480, size: 14 });
      burst(c.scene, p.x, p.y, { colors: VOID, n: 28, speed: [120, 480], gravity: 100, life: [380, 760], size: [8, 16] });
      flash(c.scene, '#7d3fb0', 0.3, 260);
      shake(c.scene, 160, 0.005);
      c.scene.tweens.add({ targets: t.container, x: t.container.x + 6, duration: slow(40), yoyo: true, repeat: 2 });
      // iğneler hedefin içinde kalır, sonra erir
      c.scene.tweens.add({ targets: spikes.map((k) => k.s), alpha: 0, duration: slow(380), delay: slow(120), onComplete: () => { for (const k of spikes) k.s.destroy(); } });
    }),
  );
};

const angleLerp = (a: number, b: number, k: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

/**
 * Void Strike (gerçekçi sürüm): hedefin bedeninden mana SIVI damlaları olarak fışkırır (yerçekimli balistik yaylar). Her damla
 * yayın tepe noktasında havada DURUR; durduğu yerde yuvarlak damladan sivri bir iğneye dönüşür (ucu hedefe çevrilir, titreyerek
 * parlar) ve sonra doğrudan hedefin bedenine saplanır; her saplanma sıçrama, dalgalanma ve emilme gösterir.
 */
const voidstrike = async (c: VfxCtx) => {
  await c.windUp('#9b59d0');
  c.sfx('voidPulse');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = spot(t);
      const G = 1500; // piksel/sn^2
      const N = 20;
      const PURPLE = ['#b872ff', '#9b59d0', '#7d3fb0', '#e3ccff'];
      // hedefin bedeninde mana kabarır
      const glow = sprite(c.scene, 'ember', '#9b59d0', p.x, p.y, 120, DEPTH + 20).setAlpha(0.8);
      grow(c.scene, glow, 0.4, 2.2, 520, 'Quad.easeOut', { alpha: 0, onComplete: () => glow.destroy() });
      void ring(c.scene, p.x, p.y + 30, { r: 120, flat: 0.4, n: 24, colors: [...PURPLE, '#ffffff'], dur: 380, size: 8 });
      burst(c.scene, p.x, p.y, { colors: [...PURPLE, '#ffffff'], n: 22, speed: [140, 420], angle: [-Math.PI, 0], gravity: 1400, life: [300, 520], size: [6, 12] });
      type Drop = { s: Phaser.GameObjects.Image; base: number; start: { x: number; y: number }; vx: number; vy: number; delay: number; up: number; hold: number; dive: number; target: { x: number; y: number }; size: number; landed: boolean; apex: { x: number; y: number; rot: number } | null; sparked: boolean };
      const drops: Drop[] = Array.from({ length: N }, () => {
        const th = rnd(-Math.PI * 0.9, -Math.PI * 0.1);
        const sp = rnd(430, 780);
        const size = rnd(40, 72);
        const s = sprite(c.scene, 'manadrop', '#9b59d0', p.x, p.y, size, DEPTH + 34).setAlpha(0);
        const vy = Math.sin(th) * sp;
        return {
          s,
          base: s.scaleX,
          start: { x: p.x + rnd(-t.w * 0.25, t.w * 0.25), y: p.y + rnd(-t.h * 0.2, t.h * 0.3) },
          vx: Math.cos(th) * sp,
          vy,
          delay: rnd(0, 0.1),
          up: -vy / G, // tam tepe noktası: orada durur
          hold: rnd(0.28, 0.36), // havada asılı kalıp sivrilme süresi
          dive: rnd(0.12, 0.18), // doğrudan saplanma
          target: { x: p.x + rnd(-t.w * 0.2, t.w * 0.2), y: p.y + rnd(-t.h * 0.28, t.h * 0.28) },
          size,
          landed: false,
          apex: null,
          sparked: false,
        };
      });
      const total = Math.max(...drops.map((d) => d.delay + d.up + d.hold + d.dive)) + 0.1;
      void wait(c.scene, slow(1000 * (Math.min(...drops.map((d) => d.up)) + 0.05))).then(() => c.sfx('implode'));
      let frame = 0;
      const impact = (d: Drop) => {
        d.landed = true;
        d.s.destroy();
        const q = d.target;
        // emilme: küçük dalgalanma halkası, geri sıçrayan ince damlalar, kısa parlama
        void ring(c.scene, q.x, q.y, { r: 46 + d.size * 0.5, flat: 0.9, n: 18, colors: [...PURPLE, '#ffffff'], dur: 280, size: 6 });
        burst(c.scene, q.x, q.y, { colors: PURPLE, n: 7, speed: [120, 330], angle: [-Math.PI * 1.1, Math.PI * 0.1], gravity: 1500, life: [250, 480], size: [4, 8] });
        const f = sprite(c.scene, 'spark', '#e3ccff', q.x, q.y, 44, DEPTH + 45);
        grow(c.scene, f, 0.5, 1.4, 200, 'Quad.easeOut', { alpha: 0, onComplete: () => f.destroy() });
        c.scene.tweens.add({ targets: t.container, x: t.container.x + rnd(-5, 5), duration: slow(30), yoyo: true });
      };
      await counter(c.scene, slow(total * 1000), (u) => {
        const ts = u * total;
        frame++;
        for (const d of drops) {
          if (d.landed) continue;
          const l = ts - d.delay;
          if (l < 0) continue;
          let x: number;
          let y: number;
          let rot: number;
          let sx: number;
          let sy: number;
          if (l <= d.up) {
            // 1) fışkırma: balistik yay; yuvarlak baş önde, kuyruk geride; hıza göre hafifçe uzar
            x = d.start.x + d.vx * l;
            y = d.start.y + d.vy * l + 0.5 * G * l * l;
            const vyNow = d.vy + G * l;
            rot = Math.atan2(-vyNow, -d.vx) + Math.PI / 2;
            sx = 1;
            sy = 1 + Math.hypot(d.vx, vyNow) / 1300;
            d.apex = { x, y, rot };
          } else if (l <= d.up + d.hold && d.apex) {
            // 2) tepe noktasında havada DURUR: yuvarlak damla, durduğu yerde sivri iğneye dönüşür ve ucu hedefe döner
            const k = (l - d.up) / d.hold;
            const e = k * k * (3 - 2 * k);
            const aim = Math.atan2(d.target.y - d.apex.y, d.target.x - d.apex.x) + Math.PI / 2;
            x = d.apex.x + Math.sin(l * 90) * 1.5 * e; // gerilme titremesi
            y = d.apex.y + Math.cos(l * 110) * 1.5 * e;
            rot = angleLerp(d.apex.rot, aim, Math.min(1, k * 1.6));
            sx = 1 - 0.55 * e;
            sy = 1.35 + 1.9 * e;
            if (!d.sparked && k > 0.55) {
              d.sparked = true;
              // sivrilme anında uçta kısa parıltı
              const tip = { x: x + Math.cos(aim - Math.PI / 2) * d.size * 1.3, y: y + Math.sin(aim - Math.PI / 2) * d.size * 1.3 };
              const sp = sprite(c.scene, 'spark', '#e3ccff', tip.x, tip.y, 34, DEPTH + 40);
              grow(c.scene, sp, 0.3, 1.2, 180, 'Quad.easeOut', { alpha: 0, onComplete: () => sp.destroy() });
            }
          } else if (d.apex) {
            // 3) doğrudan hedefe saplanır
            const k = Math.min(1, (l - d.up - d.hold) / d.dive);
            const e = k * k;
            const aim = Math.atan2(d.target.y - d.apex.y, d.target.x - d.apex.x) + Math.PI / 2;
            x = d.apex.x + (d.target.x - d.apex.x) * e;
            y = d.apex.y + (d.target.y - d.apex.y) * e;
            rot = aim;
            sx = 0.45 - 0.08 * k;
            sy = 3.25 + 0.9 * k;
            if (k >= 1) {
              impact(d);
              continue;
            }
          } else continue;
          d.s.setPosition(snap(x), snap(y)).setRotation(rot).setScale(d.base * sx, d.base * sy).setAlpha(Math.min(1, l * 14));
          if (frame % 2 === 0 && l <= d.up) {
            const tr = sprite(c.scene, 'manadrop', '#9b59d0', x, y, d.size * 0.4, DEPTH + 30).setRotation(rot).setAlpha(0.45);
            c.scene.tweens.add({ targets: tr, alpha: 0, displayWidth: d.size * 0.15, displayHeight: d.size * 0.5, duration: slow(150), onComplete: () => tr.destroy() });
          }
        }
      });
      for (const d of drops) if (!d.landed) impact(d);
      // son: toplu emilme parlaması
      void ring(c.scene, p.x, p.y, { r: 150, flat: 0.9, n: 30, colors: [...PURPLE, '#ffffff'], dur: 460, size: 10 });
      flash(c.scene, '#7d3fb0', 0.28, 280);
      shake(c.scene, 150, 0.005);
    }),
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// GAMBLER

const GOLD = ['#fff2b0', '#ffd23f', '#e0a020', '#ffffff'];
const BETRED = ['#e5463b', '#8e1f2c', '#ff7a6a'];
const CARDFX = ['#ffffff', '#d7dce6', '#e5463b'];

/** Altın para yağmuru: yukarıdan düşen, zıplayan, dönen paralar (jackpot). */
function coinRain(scene: Phaser.Scene, x: number, groundY: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const size = rnd(36, 56);
    const s = sprite(scene, 'coin', '#ffd23f', x + rnd(-230, 230), groundY - rnd(380, 620), size, DEPTH + 55).setAlpha(0);
    const base = s.scaleX;
    const land = groundY + rnd(-30, 36);
    scene.tweens.add({ targets: s, scaleX: base * 0.18, yoyo: true, repeat: 6, duration: slow(80), delay: slow(i * 28) });
    scene.tweens.add({
      targets: s,
      y: land,
      duration: slow(rnd(620, 900)),
      delay: slow(i * 28),
      ease: 'Bounce.easeOut',
      onStart: () => s.setAlpha(1),
      onComplete: () => {
        s.setScale(base);
        burst(scene, s.x, s.y, { colors: GOLD, n: 1, speed: [40, 140], angle: [-Math.PI, 0], gravity: 500, life: [220, 380], size: [8, 12] });
        scene.tweens.add({ targets: s, alpha: 0, duration: slow(380), delay: slow(380), onComplete: () => s.destroy() });
      },
    });
  }
}

/** Loaded Dice: zar yükseğe fırlar, dönerek hedefe düşer ve masadaki gibi sekerek durur; çifte vuruşta ikinci zar. */
const loadeddice = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const throwDie = async (second: boolean) => {
    const a = spot(c.actor);
    const p = spot(t);
    const f = feet(t);
    const dir = dirTo(c.actor, p);
    c.sfx('diceShake');
    const s = sprite(c.scene, 'die', '#e8d9a8', a.x + dir * 30, a.y - 10, 84, DEPTH + 30);
    const trail = (x: number, y: number) => burst(c.scene, x, y, { colors: second ? GOLD : BONE, n: 1, speed: [10, 50], gravity: 0, life: [220, 380], size: [6, 10] });
    await travel(c.scene, s, { x: p.x + (second ? 14 : -6), y: p.y + 6 }, second ? 560 : 640, { spin: second ? 3 : 4, arc: second ? 300 : 360, trail, trailEvery: 36 });
    c.sfx('diceTable');
    hit(c.scene, p.x, p.y, second ? GOLD : ['#fdfaf2', '#d7dce6', '#e8d9a8'], second ? 1.2 : 1);
    c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 8, duration: slow(45), yoyo: true });
    // zar hedeften sekip yere düşer, masadaki gibi yuvarlanıp durur
    const hop = { x: f.x + dir * rnd(-30, 50), y: f.y + 8 };
    c.scene.tweens.add({ targets: s, x: hop.x, y: hop.y, rotation: s.rotation + rnd(2, 4), duration: slow(460), ease: 'Bounce.easeOut' });
    c.scene.tweens.add({ targets: s, alpha: 0, duration: slow(260), delay: slow(620), onComplete: () => s.destroy() });
    if (second) {
      for (let i = 0; i < 5; i++) {
        const g = sprite(c.scene, 'spark', '#ffd23f', p.x + rnd(-30, 30), p.y + rnd(-20, 20), 32, DEPTH + 50);
        c.scene.tweens.add({ targets: g, y: g.y - rnd(40, 90), alpha: 0, duration: slow(520), onComplete: () => g.destroy() });
      }
    }
  };
  await c.windUp('#e8d9a8', 'attack');
  await throwDie(false);
  if (c.result?.doubleHit) c.gate(1, () => throwDie(true), () => undefined);
};

/** High Stakes: can damlası ve altın para bahse konur, düello kılıcı çekilip kesilir; kazanınca altın parıltı, kaybedince bahis sönüp düşer. */
const duelbet = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const a = spot(c.actor);
  const f = feet(c.actor);
  const p = spot(t);
  const dir = dirTo(c.actor, p);
  const won = c.result?.bet === 'win';
  const lost = c.result?.bet === 'lose';
  c.sfx('duelDraw');
  await c.windUp('#c0203a', 'cast');
  // 1) bahis: kafanın üstünde kan damlası ve altın para birbirinin etrafında döner, zeminde kırmızı-altın halka
  const top = { x: a.x, y: a.y - c.actor.h * 0.5 - 36 };
  const coin = sprite(c.scene, 'coin', '#ffd23f', top.x, top.y, 52, DEPTH + 40).setAlpha(0);
  const drop = sprite(c.scene, 'blooddrop', '#c0203a', top.x, top.y, 56, DEPTH + 41).setAlpha(0);
  void ring(c.scene, f.x, f.y, { r: 120, flat: 0.34, n: 22, colors: [...BETRED, '#ffd23f'], dur: 520, size: 10 });
  await counter(c.scene, slow(520), (u) => {
    const ang = u * Math.PI * 3;
    const rr = 34 * Math.min(1, u * 3) * (1 - Math.max(0, u - 0.8) * 3);
    coin.setPosition(snap(top.x + Math.cos(ang) * rr), snap(top.y + Math.sin(ang) * rr * 0.5)).setAlpha(Math.min(1, u * 4));
    drop.setPosition(snap(top.x - Math.cos(ang) * rr), snap(top.y - Math.sin(ang) * rr * 0.5)).setAlpha(Math.min(1, u * 4));
    if (u > 0.2 && Math.random() < 0.3) burst(c.scene, top.x, top.y, { colors: [...BETRED, '#ffd23f'], n: 1, speed: [20, 80], gravity: 120, life: [250, 420], size: [6, 10] });
  });
  // 2) düello kılıcı: elde parlar, hedefe atılır
  const hand = { x: a.x + dir * 44, y: a.y - 10 };
  const ang = Math.atan2(p.y - hand.y, p.x - hand.x);
  const sword = sprite(c.scene, 'duelsword', '#d7dce6', hand.x, hand.y, 120, DEPTH + 38).setRotation(ang + Math.PI / 4).setAlpha(0);
  c.scene.tweens.add({ targets: sword, alpha: 1, duration: slow(80) });
  const glint = sprite(c.scene, 'spark', '#ffffff', hand.x + Math.cos(ang) * 40, hand.y + Math.sin(ang) * 40, 40, DEPTH + 50);
  c.scene.tweens.add({ targets: glint, scale: glint.scale * 1.8, alpha: 0, duration: slow(220), onComplete: () => glint.destroy() });
  await wait(c.scene, slow(150));
  c.sfx('duelCut');
  c.scene.tweens.add({ targets: [coin, drop], x: p.x, y: p.y, alpha: 0, duration: slow(160), ease: 'Quad.easeIn' });
  await travel(c.scene, sword, { x: p.x - dir * 18, y: p.y }, 140, { ease: 'in' });
  void arcSlash(c.scene, p.x, p.y, { dir, from: -1.3, to: 1.3, r: 118, dur: 150, size: 18, colors: ['#ffffff', '#ff7a6a', '#ffd23f'] });
  void arcSlash(c.scene, p.x, p.y + 8, { dir, from: -1.3, to: 1.3, r: 138, dur: 190, size: 8, colors: ['#ffffff'] });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 16, duration: slow(50), yoyo: true });
  c.scene.tweens.add({ targets: sword, alpha: 0, duration: slow(220), onComplete: () => sword.destroy() });
  if (won) {
    // kazanç: altın parıltı, havaya saçılan paralar
    hit(c.scene, p.x, p.y, GOLD, 1.7);
    burst(c.scene, p.x, p.y, { colors: GOLD, n: 26, speed: [160, 520], angle: [-Math.PI, 0], gravity: 800, life: [450, 800], size: [8, 16] });
    flash(c.scene, '#ffd23f', 0.32, 340);
    shake(c.scene, 200, 0.007);
    for (let i = 0; i < 6; i++) {
      const k = sprite(c.scene, 'coin', '#ffd23f', p.x, p.y - rnd(40, 140), 40, DEPTH + 55);
      const base = k.scaleX;
      c.scene.tweens.add({ targets: k, scaleX: base * 0.2, yoyo: true, repeat: 4, duration: slow(70) });
      c.scene.tweens.add({
        targets: k,
        x: p.x + rnd(-120, 120),
        y: p.y + rnd(60, 110),
        duration: slow(640),
        ease: 'Bounce.easeOut',
        onComplete: () => c.scene.tweens.add({ targets: k, alpha: 0, duration: slow(240), onComplete: () => k.destroy() }),
      });
    }
  } else if (lost) {
    // kayıp: kırmızı kıvılcımlar sönüp aşağı düşer, bahis kararır
    hit(c.scene, p.x, p.y, ['#8e1f2c', '#e5463b', '#5b6579'], 0.9);
    burst(c.scene, p.x, p.y, { colors: ['#8e1f2c', '#5b6579', '#e5463b'], n: 14, speed: [60, 240], gravity: 900, life: [400, 700], size: [8, 14] });
    for (let i = 0; i < 3; i++) {
      const k = sprite(c.scene, 'coin', '#ffd23f', f.x, top.y, 36, DEPTH + 40).setTint(0x555555);
      c.scene.tweens.add({ targets: k, y: f.y + 14, x: f.x + rnd(-40, 40), alpha: 0, duration: slow(700), ease: 'Quad.easeIn', delay: slow(i * 60), onComplete: () => k.destroy() });
    }
  } else {
    hit(c.scene, p.x, p.y, ['#ffffff', '#ff7a6a', '#ffd23f'], 1.3);
    burst(c.scene, p.x, p.y, { colors: [...BETRED, '#ffd23f'], n: 16, speed: [120, 420], gravity: 700, life: [400, 700], size: [8, 14] });
    shake(c.scene, 120, 0.004);
  }
  coin.destroy();
  drop.destroy();
};

/** Card Trick: iki kart bilekten iki hedefe dönerek bıçak gibi uçar, saplanır, durum kıvılcımı saçar. */
const cardfan = async (c: VfxCtx) => {
  await c.windUp('#f2f2f2', 'attack');
  c.sfx('cardFlick');
  const a = spot(c.actor);
  await Promise.all(
    c.targets.map(async (t, i) => {
      await wait(c.scene, slow(i * 140));
      const p = spot(t);
      const dir = dirTo(c.actor, p);
      const from = { x: a.x + dir * 30, y: a.y - 14 };
      const angle = Math.atan2(p.y - from.y, p.x - from.x);
      const s = sprite(c.scene, 'card', '#ffffff', from.x, from.y, 76, DEPTH + 30);
      const trail = (x: number, y: number) => burst(c.scene, x, y, { colors: CARDFX, n: 1, speed: [10, 50], gravity: 0, life: [180, 320], size: [6, 10] });
      await travel(c.scene, s, { x: p.x - dir * 10, y: p.y }, 300, { spin: 5, arc: 36 - i * 72, trail, trailEvery: 30 });
      // saplanır: bıçak gibi, ucu hedefe dönük, titrer
      c.sfx('cardSlice');
      const stuck = angle + Math.PI / 2 + (i ? -0.12 : 0.12);
      s.setRotation(stuck).setPosition(snap(p.x - dir * 4), snap(p.y));
      hit(c.scene, p.x, p.y, ['#ffffff', '#d7dce6', '#e5463b'], 0.8);
      c.scene.tweens.add({ targets: s, rotation: stuck + 0.1, duration: slow(40), yoyo: true, repeat: 4 });
      c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 8, duration: slow(45), yoyo: true });
      c.scene.tweens.add({ targets: s, alpha: 0, duration: slow(280), delay: slow(480), onComplete: () => s.destroy() });
      // durum kıvılcımı: başının üstünde renkli yıldızlar (slow mavi, wound kırmızı, stun sarı)
      ['#a8ebff', '#e5463b', '#ffd23f'].forEach((hex, k) => {
        const sp = sprite(c.scene, 'spark', hex, p.x + (k - 1) * 26, p.y - t.h * 0.45, 30, DEPTH + 50);
        c.scene.tweens.add({ targets: sp, y: sp.y - rnd(40, 80), x: sp.x + (k - 1) * 18, alpha: 0, duration: slow(640), delay: slow(k * 60), onComplete: () => sp.destroy() });
      });
    }),
  );
};

/** All In: kalp atışı hızlanırken büyük altın zar ve paralar havaya yükselir; zar yuvarlanıp vurur. Jackpot: parlama + altın yağmuru, iska: sönük düşüş. */
const allin = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const a = spot(c.actor);
  const p = spot(t);
  const f = feet(t);
  const dir = dirTo(c.actor, p);
  const won = c.result?.bet === 'win';
  const lost = c.result?.bet === 'lose';
  await c.windUp('#ffd166');
  c.sfx('heartbeatRise');
  // 1) yükseliş: büyük altın zar ve etrafında dönen paralar; kalp atışlarıyla zar şişer
  const top = { x: a.x, y: a.y - c.actor.h * 0.5 - 70 };
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x1a1204, 0).setDepth(DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.34, duration: slow(500) });
  const die = sprite(c.scene, 'diegold', '#ffd166', top.x, top.y + 50, 150, DEPTH + 40).setAlpha(0);
  const dieBase = die.scaleX;
  const coins = Array.from({ length: 5 }, () => sprite(c.scene, 'coin', '#ffd23f', top.x, top.y, 50, DEPTH + 39).setAlpha(0));
  const beats = [0, 0.17, 0.62, 0.77, 1.0, 1.13, 1.3, 1.41, 1.52];
  beats.forEach((b) => {
    void wait(c.scene, slow(b * 1000)).then(() => {
      if (!die.active) return;
      die.setScale(dieBase * 1.14);
      c.scene.tweens.add({ targets: die, scaleX: dieBase, scaleY: dieBase, duration: slow(140) });
      burst(c.scene, top.x, top.y, { colors: GOLD, n: 2, speed: [60, 200], gravity: 0, life: [260, 420], size: [6, 10] });
    });
  });
  await counter(c.scene, slow(1560), (u) => {
    const rise = 1 - (1 - Math.min(1, u * 2)) ** 2;
    die.setPosition(snap(top.x + Math.sin(u * 40) * u * 3), snap(top.y + 50 * (1 - rise))).setAlpha(Math.min(1, u * 4));
    coins.forEach((k, i) => {
      const ang = u * Math.PI * 4 + (i * Math.PI * 2) / coins.length;
      const rr = 96 * Math.min(1, u * 2.5);
      k.setPosition(snap(top.x + Math.cos(ang) * rr), snap(top.y + Math.sin(ang) * rr * 0.4)).setAlpha(Math.min(1, u * 3));
      k.setDepth(Math.sin(ang) > 0 ? DEPTH + 41 : DEPTH + 38);
    });
  });
  // 2) zar savrulur: yayla hedefin önüne düşer ve yuvarlanır
  for (const k of coins) c.scene.tweens.add({ targets: k, alpha: 0, scale: k.scale * 0.4, duration: slow(240), onComplete: () => k.destroy() });
  const dest = lost ? { x: f.x - dir * 90, y: f.y + 6 } : { x: f.x - dir * 50, y: f.y + 6 };
  die.setDepth(DEPTH + 42);
  await travel(c.scene, die, dest, 420, { spin: 4, arc: 260, trail: (x, y) => burst(c.scene, x, y, { colors: GOLD, n: 2, speed: [10, 60], gravity: 0, life: [260, 460], size: [6, 10] }), trailEvery: 26 });
  c.sfx('diceRoll');
  void ring(c.scene, dest.x, dest.y + 6, { r: 70, flat: 0.34, n: 16, colors: GOLD, dur: 320, size: 8 });
  burst(c.scene, dest.x, dest.y, { colors: DUST, n: 5, speed: [60, 200], angle: [Math.PI * 1.05, Math.PI * 1.95], gravity: 200, life: [250, 450], size: [10, 16] });
  if (lost) {
    // iska: zar kısa yuvarlanır, sönükleşir, duman olup kaybolur
    c.scene.tweens.add({ targets: die, x: dest.x - dir * 50, rotation: die.rotation + dir * 5, duration: slow(520), ease: 'Quad.easeOut' });
    await wait(c.scene, slow(260));
    die.setTint(0x6b6558);
    dustCloud(c.scene, die.x, die.y, { n: 3, spread: 40, rise: 40, size: [30, 50], tint: 0x6b6558, life: 700 });
    c.scene.tweens.add({ targets: die, alpha: 0, duration: slow(460), onComplete: () => die.destroy() });
    c.scene.tweens.add({ targets: dim, alpha: 0, duration: slow(500), onComplete: () => dim.destroy() });
    await wait(c.scene, slow(360));
    return;
  }
  // zar yere çarpıp zıplayarak hedefe doğru yuvarlanır, sonra hedefe çarpar
  await travel(c.scene, die, { x: p.x - dir * 14, y: p.y + 10 }, 360, { spin: 3, arc: 70 });
  c.sfx('allInSlam');
  die.destroy();
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: slow(420), onComplete: () => dim.destroy() });
  hit(c.scene, p.x, p.y, GOLD, won ? 2.1 : 1.5);
  shake(c.scene, won ? 300 : 200, won ? 0.011 : 0.007);
  c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 22, duration: slow(70), yoyo: true });
  const bigDie = sprite(c.scene, 'diegold', '#ffd166', p.x, p.y, 170, DEPTH + 44);
  grow(c.scene, bigDie, 0.8, 1.7, 360, 'Quad.easeOut', { alpha: 0, onComplete: () => bigDie.destroy() });
  void ring(c.scene, p.x, p.y + 30, { r: won ? 280 : 200, flat: 0.36, n: 36, colors: GOLD, dur: 520, size: 14 });
  burst(c.scene, p.x, p.y, { colors: GOLD, n: won ? 40 : 22, speed: [160, 560], angle: [-Math.PI, 0], gravity: 800, life: [500, 900], size: [8, 18] });
  if (won) {
    // jackpot: parlama, ışık huzmesi ve altın yağmuru
    c.sfx('coinSpill');
    flash(c.scene, '#ffd23f', 0.45, 420);
    const col = c.scene.add.rectangle(p.x, p.y - 260, 110, 560, color('#fff2b0'), 0.6).setDepth(DEPTH + 10);
    c.scene.tweens.add({ targets: col, alpha: 0, scaleX: 0.2, duration: slow(520), onComplete: () => col.destroy() });
    coinRain(c.scene, p.x, f.y, 34);
    for (let i = 0; i < 8; i++) {
      const sp = sprite(c.scene, 'plume', '#ffd23f', p.x + rnd(-120, 120), p.y + rnd(-40, 50), 40, DEPTH + 56);
      c.scene.tweens.add({ targets: sp, y: sp.y - rnd(100, 220), alpha: 0, duration: slow(800), delay: slow(i * 40), onComplete: () => sp.destroy() });
    }
    await wait(c.scene, slow(300));
  }
};

export const VFX: Record<VfxKind, (c: VfxCtx) => Promise<void>> = {
  doublestrike,
  charge,
  whirlwind,
  warcry,
  holysword,
  resurrect,
  judgment,
  hammerfall,
  fireball,
  blizzard,
  barrier,
  meteor,
  bonethrow,
  bloodhands,
  wail,
  raise,
  bonestrike,
  boneslash,
  arrowshot,
  pierce,
  arrowrain,
  aimed,
  thornwhip,
  vines,
  rejuvenate,
  summonroots,
  woodsmash,
  thornshield,
  taunt: tauntFx,
  guardlink,
  tremor,
  fistcrush,
  manasteal,
  drainfield,
  spellward,
  voidstrike,
  voidstrikespikes,
  loadeddice,
  duelbet,
  cardfan,
  allin,
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
    playSfx(scene, 'earthCrack');
    playSfx(scene, 'graveMoan');
    burst(scene, f.x, f.y - 6, { colors: ['#b872ff', '#5a2a9c', '#a8ebff'], n: 14, speed: [20, 90], angle: [-Math.PI, 0], gravity: -90, life: [700, 1200], size: [10, 18] });
    dustCloud(scene, f.x, f.y, { n: 6, spread: 90, rise: 70, size: [40, 70] });
    await wait(scene, slow(520));
    // 2) toprak patlar: büyük toz bulutu, taş parçaları, çürük eller kenarlardan tırmanır
    dustCloud(scene, f.x, f.y, { n: 16, spread: 170, rise: 190 });
    burst(scene, f.x, f.y - 10, { colors: ['#4a2e1a', '#8c5a2b', '#5b6579', '#98a2b4'], n: 26, speed: [140, 480], angle: [-Math.PI, 0], gravity: 900, life: [500, 1000], size: [10, 22] });
    void ring(scene, f.x, f.y, { r: 220, flat: 0.34, n: 40, colors: ['#b872ff', '#5a2a9c', '#98a2b4'], dur: 560, size: 12 });
    shake(scene, 260, 0.008);
    playSfx(scene, 'boneClatter');
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
