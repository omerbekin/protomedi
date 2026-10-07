import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { content, type SkillDef } from '../engine';
import { shapeCells } from '../engine/area-shape';
import type { VfxKind } from '../ui/vfx-kinds';
import type { CombatantView } from './combatant-view';
import { color, slow } from './combatant-view';
import { playSfx } from './audio';
import { ensureIcon } from './icons';
import { cellOutlineEdges } from './cell-style';
import { cellQuad } from './shape-geometry';

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
  /** Alan skill'inin kapsadığı TÜM hücrelerin zemin konumları (boş hücreler dahil; `slots` ile aynı sırada). */
  cells: Array<{ x: number; y: number }>;
  /** Alan skill'inin kapsadığı tüm hücrelerin yuva numaraları (hedef tahtasına göre, ayna doğru). Alan skill'i değilse boş. */
  slots?: number[];
  /**
   * Yalnızca aşamalı (area.stages) alan skill'inde: aşamalar sırayla (hücreler + o aşamada vurulacak birimler). Efekt aşama i'nin vuruş anında
   * `releaseStage(i)` çağırır: o aşamanın hasar rakamları / hit tepkileri / ölümleri o an akar. İlk aşamayı efektin Promise'i çözülmeden ÖNCE
   * (ya da çözülürken) bırakmak gerekir; hiç çağrılmazsa olaylar eskisi gibi Promise çözülünce hemen akar.
   */
  stages?: VfxStage[];
  /** Aşamalı skill'de aşama i'yi (ve öncekileri) serbest bırakır. Aşamasız skill'de etkisiz. */
  releaseStage: (i: number) => void;
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
  /**
   * requiresOpenBehind (Backstab): kullanıcının GÖRSEL olarak ışınlandığı hücrenin (hedefin hemen arkası; skillUsed.behindSlot/behindBoard)
   * zemin konumu. Gerçek yer değiştirme yok: efekt arkaya ışınlanır, vurur, evine (skillUsed.from = actor.home) döner.
   */
  behind?: { x: number; y: number };
  /** Kullanıcının karşı tarafındaki canlı birimler (hedef olmasalar da efekt onlara işaret koyabilir: Taunt'un hedef işaretleri). */
  foes?: CombatantView[];
}

/** Aşamalı alan skill'inin bir aşaması (VfxCtx.stages). */
export interface VfxStage {
  slots: number[];
  cells: Array<{ x: number; y: number }>;
  targets: CombatantView[];
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
// HÜCRE TABANLI ALAN YARDIMCILARI (tüm şekil/alan skill'leri)
//
// Alan efektleri tek bir "alan elipsi" yerine şeklin HÜCRELERİNE oturur: hücre = zemindeki eğik dörtgen (seçim plakasıyla aynı geometri:
// shape-geometry.cellQuad), komşu hücreler boşluksuz birleşir, birleşik dış hat cell-style.cellOutlineEdges ile çizilir. Oyuncu tahtası aynalı
// yuvalardan otomatik ayna olur. Zemin katmanı karakterlerin ALTINDA (FLOOR_FX), parıltılar DEPTH üstünde.

type Quad = Array<{ x: number; y: number }>;
/** Zemin efekti derinliği: hücre plakaları (40-62) ile karakterler (785+) arası. */
const FLOOR_FX = 48;
const boardSlots = (board: 'party' | 'enemy') => (board === 'party' ? layout.partySlots : layout.enemySlots) as Array<{ x: number; y: number }>;
/** Hücrenin zemin dörtgeni (köşeler: -sıra-şerit, +sıra-şerit, +sıra+şerit, -sıra+şerit); fill 1 = komşuyla bitişik. */
const quadOf = (board: 'party' | 'enemy', slot: number, fill = 1): Quad => cellQuad(boardSlots(board), content.GRID.lanes, slot, fill);
/** Hücre zemin merkezi (plakalarla aynı: ayak noktasının 4 px üstü). */
const cellMid = (board: 'party' | 'enemy', slot: number) => {
  const s = boardSlots(board)[slot] ?? { x: 0, y: 0 };
  return { x: s.x, y: s.y - 4 };
};
/** Hücre kümesinin birleşik dış hattı (kenar çiftleri). */
const outlineOf = (board: 'party' | 'enemy', slots: number[]) => cellOutlineEdges((s) => quadOf(board, s, 1), content.GRID.lanes, content.GRID.rows, slots);
/** Dörtgenin içinde rastgele nokta (`m` < 1: kenarlardan içeride). */
function inQuad(q: Quad, m = 0.8): { x: number; y: number } {
  const u = 0.5 + rnd(-m / 2, m / 2);
  const v = 0.5 + rnd(-m / 2, m / 2);
  const ax = q[0]!.x + (q[1]!.x - q[0]!.x) * u;
  const ay = q[0]!.y + (q[1]!.y - q[0]!.y) * u;
  const bx = q[3]!.x + (q[2]!.x - q[3]!.x) * u;
  const by = q[3]!.y + (q[2]!.y - q[3]!.y) * u;
  return { x: ax + (bx - ax) * v, y: ay + (by - ay) * v };
}
/** Dörtgeni merkezine göre `k` katına ölçekler. */
function scaleQuad(q: Quad, k: number): Quad {
  const cx = (q[0]!.x + q[2]!.x) / 2;
  const cy = (q[0]!.y + q[2]!.y) / 2;
  return q.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}
/** Efektin hücreleri: olaydaki yuva listesi (VfxCtx.slots); yoksa konumlardan / hedeflerden. */
function fxSlots(c: VfxCtx): number[] {
  if (c.slots?.length) return c.slots;
  const slots = boardSlots(c.board);
  if (c.cells.length) return [...new Set(c.cells.map((q) => slots.reduce((b, s, i) => (Math.hypot(s.x - q.x, s.y - q.y) < Math.hypot(slots[b]!.x - q.x, slots[b]!.y - q.y) ? i : b), 0)))];
  return c.targets.map((t) => t.combatant.slot);
}
/** Aşamalar: aşamalı skill'de VfxCtx.stages, değilse tek aşama (tüm hücreler, tüm hedefler). */
function fxStages(c: VfxCtx): VfxStage[] {
  if (c.stages?.length) return c.stages;
  const slots = fxSlots(c);
  return [{ slots, cells: slots.map((s) => cellMid(c.board, s)), targets: c.targets }];
}
/** Hedefin durduğu hücre. */
const slotOfView = (t: CombatantView) => t.combatant.slot;
/** Bir satır/sıra adımının ekrandaki vektörü (R: bir sıra derine, L: bir şerit aşağı). */
function gridSteps(board: 'party' | 'enemy'): { R: { x: number; y: number }; L: { x: number; y: number } } {
  const s = boardSlots(board);
  const lanes = content.GRID.lanes;
  return { R: { x: s[lanes]!.x - s[0]!.x, y: s[lanes]!.y - s[0]!.y }, L: { x: s[1]!.x - s[0]!.x, y: s[1]!.y - s[0]!.y } };
}
/** Hücre kümesini (birleşik dörtgenler) tek renkle doldurur ve dış hattını çizer. */
function fillCells(g: Phaser.GameObjects.Graphics, board: 'party' | 'enemy', slots: number[], o: { fill: number; fillA: number; edge?: number; edgeA?: number; edgeW?: number; k?: number }): void {
  for (const s of slots) g.fillStyle(o.fill, o.fillA).fillPoints(quadOf(board, s, o.k ?? 1), true);
  if (o.edge !== undefined && (o.edgeA ?? 1) > 0) {
    g.lineStyle(o.edgeW ?? 3, o.edge, o.edgeA ?? 1);
    for (const [a, b] of outlineOf(board, slots)) g.lineBetween(a.x, a.y, b.x, b.y);
  }
}
/**
 * Efekti arka planda oynatır; dönen Promise `hit()` çağrıldığı an (ilk vuruş: hasar rakamları akmaya başlar) ya da efekt bitince çözülür.
 * Aşamalı skill'ler böyle kurulur: ilk aşamada releaseStage(0) + hit(), sonraki aşamalar efekt sürerken kendi anlarında releaseStage(i).
 */
function playUntilHit(run: (hit: () => void) => Promise<void>): Promise<void> {
  const d = deferred();
  void run(d.resolve)
    .catch((err: unknown) => console.error('vfx', err))
    .finally(d.resolve);
  return d.promise;
}

/** Hedeflerin vuruş anları (gate zinciri: c.targets sırasıyla); `arrive(t)` hedefin efektin değdiği anda çözülen Promise'i. */
function hitsAt(c: VfxCtx, arrive: (t: CombatantView) => Promise<void>, fallback: Promise<void>): Promise<void> {
  return syncHits(c, c.targets.map(arrive), fallback);
}

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

/** Yukarıdan inen yumuşak ışık huzmesi (beamTexture); Promise yere değince çözülür, huzme titreşip söner. */
async function holyBeam(c: VfxCtx, x: number, landY: number, bw: number, fall: number, alpha = 0.95): Promise<void> {
  const top = -40;
  const beam = c.scene.add.image(x, top, beamTexture(c.scene)).setOrigin(0.5, 0).setDisplaySize(bw, landY - top).setDepth(DEPTH + 10).setAlpha(alpha);
  beam.setCrop(0, 0, 32, 1);
  await counter(c.scene, slow(fall), (u) => beam.setCrop(0, 0, 32, Math.max(1, Math.round(BEAM_TEX_H * u * u))));
  beam.setCrop();
  c.scene.tweens.add({ targets: beam, displayWidth: bw * 1.1, duration: slow(160), yoyo: true });
  c.scene.tweens.add({ targets: beam, alpha: 0, delay: slow(260), duration: slow(560), ease: 'Quad.easeIn', onComplete: () => beam.destroy() });
  for (let k = 0; k < Math.round(bw / 14); k++) {
    const m = sprite(c.scene, 'spark', '#fff0a0', x + rnd(-bw * 0.4, bw * 0.4), landY - rnd(10, 60), 24, DEPTH + 30);
    c.scene.tweens.add({ targets: m, y: m.y - rnd(160, 380), alpha: 0, duration: slow(rnd(600, 950)), onComplete: () => m.destroy() });
  }
}

/** Hücrenin zemininde yumuşak kutsal parlama (yassı, hücre boyutunda); `power` boyut/parlaklık. */
function holyCellGlow(c: VfxCtx, slot: number, power = 1): void {
  const m = cellMid(c.board, slot);
  const { R, L } = gridSteps(c.board);
  const w = (Math.abs(R.x) + Math.abs(L.x)) * 1.05 * power;
  const h = Math.abs(L.y) * 1.9 * power;
  const glow = c.scene.add.image(m.x, m.y, glowTexture(c.scene)).setDisplaySize(w, h).setDepth(FLOOR_FX + 2).setBlendMode(Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: glow, displayWidth: w * 1.35, displayHeight: h * 1.35, alpha: 0, duration: slow(700), ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
}

/**
 * Judgment (plus): seçilen MERKEZ hücreye geniş bir ışık huzmesi iner; yere değince merkez hücre parlar ve zeminde dört yöne (artının kolları,
 * tahta içindekiler) altın ışık hatları koşar; hat kolun hücresine varınca oraya daha ince bir huzme iner. Artı şeklinin hücreleri birleşik
 * altın plaka olarak bir an parlar. Kutsal ateş (Holy Fire) zemini, huzmeler indikten sonra AYNI hücrelerde doğar.
 */
const judgment = async (c: VfxCtx) => {
  await c.windUp('#fff0a0');
  c.sfx('hammerWhoosh');
  const slots = fxSlots(c);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const center = midSlot !== undefined ? cellMid(c.board, midSlot) : (c.centerPos ?? feet(c.actor));
  const { R } = gridSteps(c.board);
  // 1) merkez huzme (hücre genişliğinde)
  await holyBeam(c, center.x, center.y, Math.abs(R.x) * 0.92, 340);
  c.sfx('hammerSlam');
  flash(c.scene, '#fff7d0', 0.38, 320);
  shake(c.scene, 220, 0.007);
  if (midSlot !== undefined) holyCellGlow(c, midSlot, 1.15);
  void ring(c.scene, center.x, center.y, { r: Math.abs(R.x) * 0.55, flat: 0.32, n: 30, colors: HOLY, dur: 480, size: 12 });
  burst(c.scene, center.x, center.y - 10, { colors: HOLY, n: 26, speed: [80, 340], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 420, life: [450, 850], size: [6, 12] });
  // 2) artının birleşik plakası bir an altın parlar
  const plate = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
  fillCells(plate, c.board, slots, { fill: 0xffd23f, fillA: 0.26, edge: 0xfff0a0, edgeA: 0.95, edgeW: 4, k: 0.98 });
  plate.setAlpha(0);
  c.scene.tweens.add({ targets: plate, alpha: 1, duration: slow(140) });
  c.scene.tweens.add({ targets: plate, alpha: 0, delay: slow(520), duration: slow(520), onComplete: () => plate.destroy() });
  // 3) kollar: zeminde ışık hattı koşar, varınca ince huzme
  const arms = slots.filter((s) => s !== midSlot);
  const lines = c.scene.add.graphics().setDepth(FLOOR_FX + 3);
  const RUN = 170;
  await Promise.all(
    arms.map(async (s) => {
      const to = cellMid(c.board, s);
      await counter(c.scene, slow(RUN), (u) => {
        const n = Math.max(1, Math.floor((Math.hypot(to.x - center.x, to.y - center.y) * u) / 6));
        for (let k = 0; k <= n; k++) {
          const v = (k / n) * u;
          const x = snap(center.x + (to.x - center.x) * v);
          const y = snap(center.y + (to.y - center.y) * v);
          lines.fillStyle(0xffd23f, 0.3).fillRect(x - 7, y - 4, 14, 8);
          lines.fillStyle(k % 3 ? 0xfff0a0 : 0xffffff, 0.95).fillRect(x - 2, y - 2, 4, 4);
        }
      }, 'Quad.easeOut');
      await holyBeam(c, to.x, to.y, Math.abs(R.x) * 0.5, 150, 0.85);
      holyCellGlow(c, s, 0.9);
      burst(c.scene, to.x, to.y - 10, { colors: HOLY, n: 12, speed: [60, 260], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 420, life: [400, 700], size: [6, 10] });
    }),
  );
  if (arms.length) c.sfx('hammerSlam');
  c.scene.tweens.add({ targets: lines, alpha: 0, duration: slow(420), onComplete: () => lines.destroy() });
  void wait(c.scene, slow(160)).then(() => c.sfx('fireCrackle'));
  // Promise burada çözülür: Judgment hasarı zemindendir; Holy Fire zemini (BattleScene.addGroundView -> groundArea) hemen ardından aynı hücrelerde doğar
  await wait(c.scene, slow(60));
};

// ---------------------------------------------------------------------------------------------------------------------
// YER ETKİLERİ (ground): hücre karesini dolduran canlı piksel yüzey

/** Değer gürültüsü (yumuşak, 2B): zemin yüzeylerinin akışkan desenleri için. 0..1. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi) + (hash2(xi + 1, yi) - hash2(xi, yi)) * sx;
  const b = hash2(xi, yi + 1) + (hash2(xi + 1, yi + 1) - hash2(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}
const fbm = (x: number, y: number) => vnoise(x, y) * 0.65 + vnoise(x * 2.1 + 17, y * 2.1 + 5) * 0.35;

interface GroundLook {
  /** Desen bantları (düşükten yükseğe): [renk, alfa]. */
  bands: Array<[number, number]>;
  /** Birleşik dış hat rengi. */
  edge: number;
  /** Desen ölçeği (px başına) ve akış hızı (sn başına). */
  scale: number;
  flow: { x: number; y: number };
  /** true: damar deseni (yanık toprak: gürültünün orta bandı kızgın çatlak). */
  veins?: boolean;
}

const GROUND_LOOK: Record<string, GroundLook> = {
  // zehir: koyu yeşil sıvı/sis, açık yeşil akıntı lekeleri
  poison: { bands: [[0x1a3d18, 0.7], [0x2a6a26, 0.66], [0x3f8a30, 0.62], [0x5fb544, 0.64], [0x9de86f, 0.7]], edge: 0x8ee060, scale: 0.028, flow: { x: 0.35, y: -0.18 } },
  // kutsal ateş: kor altını-turuncu, yukarı akan ısı dalgası
  holy_fire: { bands: [[0x9a5a14, 0.36], [0xc4821a, 0.42], [0xe8a030, 0.48], [0xffc84a, 0.56], [0xfff0a0, 0.66]], edge: 0xffd23f, scale: 0.032, flow: { x: 0.1, y: -0.9 } },
  // yanık toprak: kömürleşmiş zemin, kızgın çatlak damarları
  burning: { bands: [[0x2a1a14, 0.56], [0x3e1c12, 0.58], [0x9a2a16, 0.64], [0xff6a1a, 0.72], [0xffc040, 0.8]], edge: 0xff8a1f, scale: 0.03, flow: { x: 0.12, y: -0.35 }, veins: true },
};

/** Hücre dörtgeninde bilinear nokta (u: q0->q1 kenarı, v: q0->q3 kenarı). */
function quadAt(q: Quad, u: number, v: number): { x: number; y: number } {
  const ax = q[0]!.x + (q[1]!.x - q[0]!.x) * u;
  const ay = q[0]!.y + (q[1]!.y - q[0]!.y) * u;
  const bx = q[3]!.x + (q[2]!.x - q[3]!.x) * u;
  const by = q[3]!.y + (q[2]!.y - q[3]!.y) * u;
  return { x: ax + (bx - ax) * v, y: ay + (by - ay) * v };
}

/** Aynı türden (ground + tahta) açık zemin alanları: aşama aşama bırakılan bitişik zeminlerin ortak kenarı çizilmez (tek alan gibi birleşir). */
interface GroundEntry {
  key: string;
  board: 'party' | 'enemy';
  slots: number[];
  redrawEdge: () => void;
}
const groundRegistry = new WeakMap<Phaser.Scene, GroundEntry[]>();
function groundUnionEdges(scene: Phaser.Scene, me: GroundEntry): Array<[Pt, Pt]> {
  const list = groundRegistry.get(scene) ?? [];
  const union = [...new Set(list.filter((e) => e.key === me.key).flatMap((e) => e.slots))];
  const own = me.slots.map((s) => quadOf(me.board, s, 1));
  const same = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 1.5 && Math.abs(p.y - q.y) < 1.5;
  return outlineOf(me.board, union).filter(([a, b]) =>
    own.some((q) =>
      q.some((p, i) => {
        const r = q[(i + 1) % 4]!;
        return (same(p, a) && same(r, b)) || (same(p, b) && same(r, a));
      }),
    ),
  );
}

/**
 * Yer etkisi (data/grounds.json) görseli: zemin, etkinin bırakıldığı HÜCRELERİN KARESİNİ (seçim plakasıyla aynı eğik dörtgen; shape-geometry.cellQuad)
 * kenarlarına kadar doldurur. Ömer: "daire daire görünüyor, ilgili kareyi doldursun" (madde 231). Dolgu hücre başına 12x7 küçük piksel dörtgenden
 * oluşan canlı bir yüzeydir: renk dünya koordinatındaki akan gürültüden gelir (komşu hücreler ve aşama aşama bırakılan bitişik zeminler kesintisiz
 * birleşir; ortak kenarları çizilmez), az basamaklı palet = piksel art. Poison: koyu yeşil zehirli sıvı/sis, karenin içinde şişip patlayan
 * kabarcıklar ve alçak sis. Holy Fire: kor altını yüzey, yukarı akan ısı dalgası, karenin içinden yükselen alçak altın alev dilleri. Burning
 * Ground: kömürleşmiş zemin + kızgın çatlak damarları, alev dilleri ve is dumanı. Hücreler ilk hücreden dışa doğru, her hücre kendi ortasından
 * köşelerine doğru dolar; ground süresince döngü sürer; container yok edilince (BattleScene.removeGroundView söndürür) döngü durur.
 * Tanımsız yer etkisi için null döner (eski görünüm). `delay`: önceki animasyonun bitmesini bekleme süresi.
 */
export function groundArea(scene: Phaser.Scene, groundId: string, board: 'party' | 'enemy', slots: number[], delay = 0): Phaser.GameObjects.Container | null {
  const look = GROUND_LOOK[groundId];
  if (!look || slots.length === 0) return null;
  const holy = groundId === 'holy_fire';
  const burning = groundId === 'burning';
  const NU = 12;
  const NV = 7;
  const cells = slots.map((s) => {
    const q = quadOf(board, s, 1);
    const sub: Array<{ pts: Pt[]; c: Pt; r: number }> = [];
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const pts = [quadAt(q, i / NU, j / NV), quadAt(q, (i + 1) / NU, j / NV), quadAt(q, (i + 1) / NU, (j + 1) / NV), quadAt(q, i / NU, (j + 1) / NV)];
        const cu = (i + 0.5) / NU - 0.5;
        const cv = (j + 0.5) / NV - 0.5;
        sub.push({ pts, c: quadAt(q, (i + 0.5) / NU, (j + 0.5) / NV), r: Math.max(Math.abs(cu), Math.abs(cv)) * 2 });
      }
    return { s, q, m: cellMid(board, s), sub };
  });
  const first = cells[0]!.m;
  const order = cells.map((k) => Math.hypot(k.m.x - first.x, k.m.y - first.y));
  const span = Math.max(1, ...order);
  const field = scene.add.graphics();
  const edge = scene.add.graphics();
  const box = scene.add.container(0, 0, [field, edge]).setDepth(30);
  const alive = () => box.active && box.scene !== undefined;
  let grow = 0;
  let edgeK = 0;
  let live = false;
  const t0 = scene.time.now;
  const paint = () => {
    if (!alive()) return;
    const t = (scene.time.now - t0) / 1000;
    field.clear();
    const nb = look.bands.length;
    cells.forEach((k, ci) => {
      // hücre kendi ortasından köşelerine doğru dolar (ilk hücreden dışa sırayla)
      const v = Math.max(0, Math.min(1, (grow - (order[ci]! / span) * 0.45) / 0.55));
      if (v <= 0) return;
      for (const sq of k.sub) {
        if (sq.r > v * 1.08) continue;
        let n = fbm(sq.c.x * look.scale + t * look.flow.x, sq.c.y * look.scale * 1.8 + t * look.flow.y);
        if (look.veins) n = 1 - Math.min(1, Math.abs(n - 0.5) * 3.2);
        const b = Math.max(0, Math.min(nb - 1, Math.floor(n * nb)));
        const [col, al] = look.bands[b]!;
        // dolmakta olan cephe biraz daha parlak (yayılan sıvı/kor)
        const front = v < 1 && sq.r > v * 0.8 ? 1.25 : 1;
        field.fillStyle(col, Math.min(1, al * front)).fillPoints(sq.pts, true);
      }
    });
  };
  const me: GroundEntry = {
    key: `${groundId}:${board}`,
    board,
    slots,
    redrawEdge: () => {
      if (!alive()) return;
      edge.clear();
      if (edgeK <= 0) return;
      edge.lineStyle(3, look.edge, 0.85 * edgeK);
      for (const [a, b] of groundUnionEdges(scene, me)) edge.lineBetween(a.x, a.y, b.x, b.y);
    },
  };
  const reg = groundRegistry.get(scene) ?? [];
  reg.push(me);
  groundRegistry.set(scene, reg);
  const refreshSame = () => (groundRegistry.get(scene) ?? []).filter((e) => e.key === me.key).forEach((e) => e.redrawEdge());
  refreshSame();
  const GROW = 900;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    delay: slow(delay),
    duration: slow(GROW),
    ease: 'Quad.easeOut',
    onUpdate: (tw) => {
      if (!alive()) return;
      grow = tw.getValue() ?? 0;
      edgeK = Math.max(0, (grow - 0.5) / 0.5);
      paint();
      me.redrawEdge();
    },
    onComplete: () => {
      if (!alive()) return;
      grow = 1;
      edgeK = 1;
      live = true;
      paint();
      refreshSame();
      // dolunca dış hat bir an parlar (daire halka yok: şekil kare kalır)
      edge.setAlpha(1);
      scene.tweens.add({ targets: edge, alpha: { from: 0.4, to: 1 }, duration: slow(180), yoyo: true });
    },
  });
  // yüzey akışı: düşük kare hızında yeniden boyanır (piksel art ritmi; hafif)
  const flowLoop = scene.time.addEvent({ delay: 110, loop: true, callback: () => live && paint() });
  // Süreklilik döngüsü: rastgele bir hücrenin İÇİNDE alev dili/kor (Holy Fire, Burning) ya da kabarcık/sis (Poison).
  let tick = 0;
  const loop = scene.time.addEvent({
    delay: Math.round((holy || burning ? 170 : 200) / Math.max(1, Math.min(2.2, Math.sqrt(slots.length / 2.5)))),
    loop: true,
    callback: () => {
      if (!live || !alive() || box.alpha < 0.2) return;
      tick++;
      const q = inQuad(pick(cells).q, 0.78);
      if (holy || burning) {
        const hex = holy ? (tick % 2 ? '#ff8a1f' : '#ffd23f') : tick % 3 === 0 ? '#ffd23f' : tick % 2 ? '#ff4d1a' : '#ff8a1f';
        const f = sprite(scene, 'ember', hex, q.x, q.y + 4, rnd(14, 26) * (burning ? 1.25 : 1), 31).setOrigin(0.5, 1).setAlpha(0.85);
        const sx = f.scaleX;
        f.setScale(sx * 0.4, sx * 0.3);
        scene.tweens.add({ targets: f, scaleX: sx * 0.9, scaleY: sx * (burning ? 2.1 : 1.7), y: f.y - rnd(14, 30), alpha: 0, duration: slow(rnd(520, 800)), ease: 'Quad.easeOut', onComplete: () => f.destroy() });
        if (tick % 3 === 0) {
          const k = scene.add.rectangle(snap(q.x), snap(q.y), 4, 4, color(pick(holy ? ['#ffd23f', '#fff0a0', '#ff8a1f'] : ['#ffd23f', '#ff8a1f', '#ff4d1a']))).setDepth(32);
          scene.tweens.add({ targets: k, x: snap(k.x + rnd(-10, 10)), y: snap(k.y - rnd(30, 60)), alpha: 0, duration: slow(rnd(600, 950)), onComplete: () => k.destroy() });
        }
        if (burning && tick % 4 === 0) {
          const m = sprite(scene, 'smoke', '#5b6579', q.x, q.y - 10, 26, 31).setTint(0x2a2226).setAlpha(0.4);
          scene.tweens.add({ targets: m, y: m.y - rnd(40, 70), displayWidth: 60, displayHeight: 50, alpha: 0, duration: slow(rnd(1100, 1500)), ease: 'Quad.easeOut', onComplete: () => m.destroy() });
        }
      } else {
        // alçak sis tutamı: yüzeyin hemen üstünde yayılıp söner (yükselip kareden taşmaz)
        if (tick % 3 === 0) {
          const m = sprite(scene, 'smoke', '#7ed957', q.x, q.y - 2, 24, 31).setTint(0x8ee060).setAlpha(0.28);
          scene.tweens.add({ targets: m, y: m.y - rnd(6, 14), displayWidth: 54, displayHeight: 22, alpha: 0, duration: slow(rnd(1000, 1400)), ease: 'Quad.easeOut', onComplete: () => m.destroy() });
        }
        // kabarcık: sıvının içinde şişer, patlar (piksel halka + 4 sıçrantı); yerinde kalır
        const g = scene.add.graphics().setDepth(32);
        const bx = snap(q.x);
        const by = snap(q.y);
        const big = Math.random() < 0.35;
        void counter(scene, slow(rnd(520, 820)), (u) => {
          g.clear();
          if (!alive()) return;
          if (u < 0.82) {
            const r = (big ? 3 : 2) * (0.4 + u * 0.75);
            for (let i = 0; i < 8; i++) {
              const an = (i / 8) * Math.PI * 2;
              g.fillStyle(0xc8ff9a, 0.9).fillRect(snap(bx + Math.cos(an) * r * 2) - 1, snap(by - u * 4 + Math.sin(an) * r * 1.4) - 1, 2, 2);
            }
            g.fillStyle(0xffffff, 0.8).fillRect(bx - r, by - u * 4 - r, 2, 2);
          } else {
            const k = (u - 0.82) / 0.18;
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1.4, 0.2], [1.4, 0.2]] as const) g.fillStyle(0xb8ff8a, 1 - k).fillRect(snap(bx + dx * (4 + k * 8)), snap(by - 4 + dy * (3 + k * 6)), 2, 2);
          }
        }).then(() => g.destroy());
      }
    },
  });
  box.once('destroy', () => {
    loop.remove(false);
    flowLoop.remove(false);
    scene.tweens.killTweensOf([field, edge]);
    const list = groundRegistry.get(scene) ?? [];
    const i = list.indexOf(me);
    if (i >= 0) list.splice(i, 1);
    refreshSame();
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

/** Fırtına bulutu dokusu: birkaç yumuşak topak birleşimi, üstü açık altı koyu (tint ile renklenir; kontur yok). */
const stormCloudTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:stormcloud', 64, 28, (x, y) => {
    const blobs: Array<[number, number, number, number]> = [[16, 17, 13, 10], [30, 12, 15, 11], [46, 15, 14, 10], [24, 20, 16, 7], [40, 20, 16, 7]];
    let a = 0;
    for (const [bx, by, rx, ry] of blobs) a = Math.max(a, 1 - Math.hypot((x + 0.5 - bx) / rx, (y + 0.5 - by) / ry));
    if (a <= 0) return null;
    const shade = y < 10 ? '#ffffff' : y < 17 ? '#d7dce6' : '#98a2b4';
    return { c: shade, a: Math.min(1, a * 2.2) };
  });

/** Buz plakası dokusu (bir kez): hücre zemininde donmuş yüzey; açık buz mavisi, beyaz kırağı benekleri ve ince çatlaklar. */
function frostPlate(scene: Phaser.Scene, board: 'party' | 'enemy', slots: number[]): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(FLOOR_FX);
  fillCells(g, board, slots, { fill: 0x8fd8ff, fillA: 0.42, edge: 0xffffff, edgeA: 0.9, edgeW: 3 });
  for (const s of slots) {
    const q = quadOf(board, s, 0.94);
    g.fillStyle(0xe8fbff, 0.32).fillPoints(scaleQuad(q, 0.62), true); // ortası daha açık (yansıma)
    // kırağı benekleri
    for (let k = 0; k < 14; k++) {
      const p = inQuad(q, 0.9);
      g.fillStyle(k % 3 ? 0xffffff : 0xa8ebff, 0.85).fillRect(snap(p.x), snap(p.y), k % 4 ? 2 : 4, 2);
    }
    // ince çatlaklar (buz çizikleri)
    for (let k = 0; k < 3; k++) {
      let p = inQuad(q, 0.6);
      const a = rnd(-0.5, 0.5) + (k % 2 ? Math.PI : 0);
      for (let i = 0; i < 7; i++) {
        p = { x: p.x + Math.cos(a + rnd(-0.6, 0.6)) * 8, y: p.y + Math.sin(a + rnd(-0.6, 0.6)) * 3 };
        g.fillStyle(0xffffff, 0.75).fillRect(snap(p.x), snap(p.y), 2, 2);
      }
    }
  }
  return g;
}

/**
 * Blizzard (rect 3x2): bloğun üstünde koyu bir fırtına bulutu toplanır, rüzgârla eğik kar ve buz kristalleri YALNIZCA bloğun hücrelerine yağar;
 * hücrelerin zemini sırayla donar (birleşik buz plakası, kırağı, çatlaklar). Sonra her hücreye buz sarkıtları çöker ve parçalanır (vuruş anı);
 * hedeflerin ayağında buz kabuğu çatırdar. Buz plakası bir süre kalıp erir.
 */
const blizzard = async (c: VfxCtx) => {
  c.sfx('windHowl');
  c.sfx('hailPatter');
  await c.windUp('#8fd8ff');
  const slots = fxSlots(c);
  const quads = slots.map((s) => ({ s, q: quadOf(c.board, s, 0.92), m: cellMid(c.board, s) }));
  const xs = quads.flatMap((k) => k.q.map((p) => p.x));
  const ys = quads.flatMap((k) => k.q.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const cloudY = Math.min(...ys) - 300;
  const wind = c.board === 'enemy' ? 1 : -1; // rüzgâr büyücüden uzağa eser
  // 1) fırtına bulutu: blok genişliğinde koyu, kabaran duman kümeleri
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x0a1830, 0).setDepth(DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.26, duration: slow(380) });
  // iki katman yumuşak bulut dokusu (arkada koyu, önde biraz açık ve alçak): konturlu 'duman' baloncukları yerine yumuşak piksel bulut
  const puffs: Phaser.GameObjects.Image[] = [];
  const nPuff = Math.max(4, Math.round((x1 - x0) / 90));
  for (const layer of [0, 1]) {
    for (let i = 0; i < nPuff; i++) {
      const x = x0 - 40 + ((x1 - x0 + 80) * (i + layer * 0.5)) / nPuff + rnd(-16, 16);
      const w = rnd(200, 260) * (layer ? 0.85 : 1);
      const p = c.scene.add.image(x, cloudY + (layer ? 26 : 0) + rnd(-14, 14), stormCloudTexture(c.scene)).setDisplaySize(w, w * 0.62).setTint(layer ? 0x9fb4d0 : 0x55688a).setAlpha(0).setDepth(DEPTH + 18 + layer).setFlipX(Math.random() < 0.5);
      c.scene.tweens.add({ targets: p, alpha: layer ? 0.8 : 0.95, x: p.x + wind * rnd(8, 24), duration: slow(rnd(300, 440)), delay: slow(i * 26 + layer * 60), ease: 'Quad.easeOut' });
      puffs.push(p);
    }
  }
  await wait(c.scene, slow(260));
  // 2) kar yağışı: her hücreye eğik düşen kar taneleri (hücre dörtgeninin içine konar)
  const snow = c.scene.time.addEvent({
    delay: 26,
    loop: true,
    callback: () => {
      const k = pick(quads);
      const to = inQuad(k.q, 0.9);
      const lift = rnd(20, 140);
      const fl = sprite(c.scene, 'flake', '#ffffff', to.x - wind * rnd(60, 120), cloudY + rnd(10, 40), Math.random() < 0.5 ? 16 : 24, DEPTH + 20).setAlpha(0.95);
      c.scene.tweens.add({ targets: fl, x: to.x, y: to.y - lift * 0.15, rotation: rnd(-2, 2), alpha: 0.15, duration: slow(rnd(420, 620)), ease: 'Sine.easeIn', onComplete: () => fl.destroy() });
    },
  });
  // 3) zemin hücre hücre donar (birleşik buz plakası belirir)
  const frost = frostPlate(c.scene, c.board, slots).setAlpha(0);
  c.scene.tweens.add({ targets: frost, alpha: 1, duration: slow(520), ease: 'Quad.easeOut' });
  await wait(c.scene, slow(360));
  // 4) buz sarkıtları: her hücreye bir ya da iki sarkıt çöker; ilk dalga yere değince vuruş anı
  let shattered = 0;
  const jobs = quads.flatMap((k, ci) =>
    Array.from({ length: c.targets.some((t) => slotOfView(t) === k.s) ? 2 : 1 }, async (_, i) => {
      await wait(c.scene, slow(i * 110 + (ci % 3) * 30 + rnd(0, 40)));
      const to = i === 0 ? { x: k.m.x + rnd(-12, 12), y: k.m.y - rnd(30, 70) } : inQuad(k.q, 0.7);
      const s = sprite(c.scene, 'shard', '#8fd8ff', to.x - wind * 70, cloudY + 20, 104, DEPTH + 30).setRotation(wind * 0.2);
      await travel(c.scene, s, to, 260, { ease: 'in' });
      s.destroy();
      if (shattered++ % 3 === 0) c.sfx('iceCrack');
      burst(c.scene, to.x, to.y, { colors: ICE, n: 10, speed: [100, 340], angle: [-Math.PI, 0.2], gravity: 600, life: [300, 560], size: [8, 14] });
      void ring(c.scene, k.m.x, k.m.y, { r: 70, flat: 0.32, n: 14, colors: ICE, dur: 360, size: 8 });
    }),
  );
  await Promise.race([Promise.all(jobs), wait(c.scene, slow(330))]);
  // vuruş anı: hedeflerin ayağında buz kabuğu çatırdar
  shake(c.scene, 160, 0.004);
  for (const t of c.targets) {
    const f = feet(t);
    const crust = c.scene.add.graphics().setDepth(t.container.depth + 1);
    for (let i = 0; i < 7; i++) {
      const x = f.x + (i - 3) * (t.w * 0.11) + rnd(-4, 4);
      const h = rnd(18, 38) * (1 - Math.abs(i - 3) * 0.12);
      crust.fillStyle(0x4aa3ff, 0.9).fillTriangle(x - 8, f.y + 4, x + 8, f.y + 4, x, f.y - h);
      crust.fillStyle(0xe8fbff, 0.95).fillTriangle(x - 4, f.y + 2, x + 2, f.y + 2, x - 1, f.y - h + 6);
    }
    crust.setScale(1, 0.2);
    crust.y = f.y * 0.8;
    c.scene.tweens.add({ targets: crust, scaleY: 1, y: 0, duration: slow(120), ease: 'Back.easeOut' });
    c.scene.tweens.add({ targets: crust, alpha: 0, delay: slow(650), duration: slow(380), onComplete: () => crust.destroy() });
  }
  // kuyruk: kar diner, bulut dağılır, buz plakası erir
  void Promise.all(jobs).then(async () => {
    await wait(c.scene, slow(240));
    snow.remove();
    c.scene.tweens.add({ targets: puffs, alpha: 0, y: `-=${30}`, duration: slow(520), onComplete: () => puffs.forEach((p) => p.destroy()) });
    c.scene.tweens.add({ targets: dim, alpha: 0, duration: slow(520), onComplete: () => dim.destroy() });
    c.scene.tweens.add({ targets: frost, alpha: 0, delay: slow(500), duration: slow(700), onComplete: () => frost.destroy() });
  });
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

/**
 * Meteor (plus): gökyüzü kızarır, zeminde gölge büyür; alevli meteor çapraz düşüp MERKEZ hücrede patlar (çok katmanlı ateş topu, kaya, duman).
 * Ardından artının kolları boyunca (tahta içindeki komşu hücrelere) yerden alev dalgası koşar, kolun hücresinde alev patlar; her hedefin hasarı
 * alevin ona değdiği an. Şeklin hücreleri kömürleşir; Burning Ground aynı hücrelerde doğar (groundArea).
 */
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
  void ring(c.scene, cx, cy + 44, { r: 300, flat: 0.32, n: 54, colors: FIRE, dur: 640, size: 14 });
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
  // Artı şekli: merkezden dört yöne (tahta içindeki kollar) yer boyunca alev dalgası koşar; kolun hücresine varınca alev patlar.
  // Hasar rakamları her hedefe alev değdiği anda çıkar (merkez = çarpma anı).
  const slots = fxSlots(c);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const arrive = new Map<number, ReturnType<typeof deferred>>(slots.map((s) => [s, deferred()]));
  if (midSlot !== undefined) arrive.get(midSlot)?.resolve();
  // yanık iz: şeklin hücrelerinde kömürleşmiş zemin (birleşik plaka), yavaşça söner (Burning Ground görünümü ardından gelir)
  const scorch = c.scene.add.graphics().setDepth(FLOOR_FX - 1);
  fillCells(scorch, c.board, slots, { fill: 0x15101c, fillA: 0.5, k: 0.96 });
  scorch.setAlpha(0);
  c.scene.tweens.add({ targets: scorch, alpha: 1, duration: slow(160) });
  c.scene.tweens.add({ targets: scorch, alpha: 0, duration: slow(1600), delay: slow(700), onComplete: () => scorch.destroy() });
  const arms = slots.filter((s) => s !== midSlot);
  const mid = midSlot !== undefined ? cellMid(c.board, midSlot) : { x: cx, y: cy + 44 };
  void wait(c.scene, slow(70)).then(() => {
    if (arms.length) c.sfx('fireCrackle');
    for (const s of arms) {
      const to = cellMid(c.board, s);
      let lastK = -1;
      void counter(c.scene, slow(230), (u) => {
        // alev dilleri dalganın ucunda yerden yükselir (her ~%12'de bir)
        const k = Math.floor(u * 8);
        if (k === lastK) return;
        lastK = k;
        const x = mid.x + (to.x - mid.x) * u;
        const y = mid.y + (to.y - mid.y) * u;
        const f = sprite(c.scene, 'ember', k % 2 ? '#ff8a1f' : '#ffd23f', x + rnd(-8, 8), y + 6, rnd(40, 64), y + 2).setOrigin(0.5, 1);
        const sx = f.scaleX;
        f.setScale(sx * 0.5, sx * 0.4);
        c.scene.tweens.add({ targets: f, scaleX: sx * 0.9, scaleY: sx * 2.1, y: f.y - rnd(10, 30), alpha: 0, duration: slow(rnd(380, 560)), ease: 'Quad.easeOut', onComplete: () => f.destroy() });
        burst(c.scene, x, y - 6, { colors: FIRE, n: 2, speed: [40, 160], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 300, life: [260, 480], size: [8, 14] });
      }, 'Quad.easeOut').then(() => {
        // kolun ucunda alev patlaması
        const e = sprite(c.scene, 'ember', '#ff8a1f', to.x, to.y - 40, 90, DEPTH + 44);
        grow(c.scene, e, 0.3, 2.2, 300, 'Cubic.easeOut', { alpha: 0, onComplete: () => e.destroy() });
        burst(c.scene, to.x, to.y - 30, { colors: FIRE, n: 16, speed: [120, 420], angle: [-Math.PI, 0], gravity: 600, life: [380, 760], size: [10, 18] });
        void ring(c.scene, to.x, to.y, { r: 110, flat: 0.32, n: 22, colors: FIRE, dur: 380, size: 10 });
        arrive.get(s)?.resolve();
      });
    }
  });
  await hitsAt(c, (t) => arrive.get(slotOfView(t))?.promise ?? Promise.resolve(), wait(c.scene, slow(90)));
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

const WAIL = ['#b872ff', '#5a2a9c', '#ffffff', '#a8ebff'];

/** Ağıt dalgasının bir hücreye çarpması: zeminde mor ağıt halkası (hücreye oturan), yerden yükselen hayalet ruhlar, hücredeki hedeflerin titremesi. */
function wailCell(c: VfxCtx, slot: number, victims: CombatantView[], power: number): void {
  const m = cellMid(c.board, slot);
  const { R } = gridSteps(c.board);
  const rr = Math.abs(R.x) * 0.5;
  // hücre zemininde kısa ölü-ışık plakası
  const g = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
  fillCells(g, c.board, [slot], { fill: 0x5a2a9c, fillA: 0.38, edge: 0xb872ff, edgeA: 0.9, edgeW: 3, k: 0.94 });
  g.setAlpha(0);
  c.scene.tweens.add({ targets: g, alpha: 1, duration: slow(120), yoyo: true, hold: slow(260), onComplete: () => g.destroy() });
  for (let i = 0; i < 2; i++) void wait(c.scene, slow(i * 110)).then(() => ring(c.scene, m.x, m.y, { r: rr * (1 + i * 0.25) * power, flat: 0.32, n: 22, colors: WAIL, dur: 520, size: 10, startR: 14 }));
  burst(c.scene, m.x, m.y - 16, { colors: ['#b872ff', '#a8ebff', '#5a2a9c'], n: Math.round(10 * power), speed: [40, 160], angle: [-Math.PI, 0], gravity: -160, life: [600, 1000], size: [8, 14] });
  for (let k = 0; k < 2; k++) {
    const w = sprite(c.scene, 'wisp', '#b36bff', m.x + rnd(-40, 40), m.y - 10, 56 + k * 12, DEPTH + 40).setAlpha(0.9);
    c.scene.tweens.add({ targets: w, y: w.y - rnd(130, 190), x: w.x + rnd(-20, 20), alpha: 0, duration: slow(rnd(800, 1000)), delay: slow(k * 90), onComplete: () => w.destroy() });
  }
  for (const t of victims) {
    // çığlığın titrettiği beden: hızlı sağ-sol sarsılma + mor halka
    c.scene.tweens.add({ targets: t.container, x: t.container.x + 6, duration: slow(30), yoyo: true, repeat: 3 });
    const p = spot(t);
    void ring(c.scene, p.x, p.y, { r: 70, flat: 0.9, n: 18, colors: WAIL, dur: 340, size: 8 });
  }
}

/**
 * Wail of the Dead (plus, aşamalı distance): ağlayan ruh Undead'den kavis çizerek MERKEZ hücrenin üstüne uçar ve çığlık atar; ağıt halkası
 * merkezden başlar (1. aşama: merkezdeki hedefin hasarı ve zehri), sonra zeminde mor bir dalga halka halka dışa yayılıp dört komşu hücreye
 * çarpar (2. aşama: komşuların hasarı ve zehri). Zehir bulutu her aşamanın kendi hücrelerinde, o aşamanın anında belirir.
 */
const wail = (c: VfxCtx) => playUntilHit(async (hit) => {
  c.sfx('ghostWail');
  await c.windUp('#b36bff');
  const a = spot(c.actor);
  const stages = fxStages(c);
  const midSlot = stages[0]?.slots[0] ?? c.center;
  const cell = midSlot !== undefined ? cellMid(c.board, midSlot) : (c.centerPos ?? feet(c.actor));
  const g = sprite(c.scene, 'wail', '#b36bff', a.x, a.y, 128, DEPTH + 30);
  if (cell.x < a.x) g.setFlipX(true);
  await travel(c.scene, g, { x: cell.x, y: cell.y - 110 }, 460, { arc: 90, trail: (x, y) => burst(c.scene, x, y, { colors: ['#b872ff', '#5a2a9c', '#a8ebff'], n: 3, speed: [10, 80], gravity: -40, life: [300, 560], size: [8, 16] }), trailEvery: 26 });
  // çığlık: ruh şişip titrer, sonra dağılır
  c.scene.tweens.add({ targets: g, x: g.x + 5, duration: slow(28), yoyo: true, repeat: 5 });
  c.scene.tweens.add({ targets: g, displayWidth: 240, displayHeight: 240, alpha: 0, delay: slow(160), duration: slow(460), onComplete: () => g.destroy() });
  flash(c.scene, '#5a2a9c', 0.3, 420);
  shake(c.scene, 220, 0.005);
  const { R } = gridSteps(c.board);
  for (const [si, st] of stages.entries()) {
    if (si > 0) {
      // dalga: önceki aşamanın hücrelerinden dışa doğru zeminde genişleyen mor halka; bu aşamanın hücrelerine varınca çarpar
      const reach = Math.max(...st.slots.map((s) => Math.hypot(cellMid(c.board, s).x - cell.x, cellMid(c.board, s).y - cell.y)), Math.abs(R.x));
      const startR = Math.abs(R.x) * 0.45 * si;
      const dur = 260;
      void ring(c.scene, cell.x, cell.y, { r: reach * 1.05, flat: 0.32, n: 46, colors: WAIL, dur, size: 12, startR });
      void ring(c.scene, cell.x, cell.y - 30, { r: reach * 0.95, flat: 0.45, n: 30, colors: ['#5a2a9c', '#b872ff'], dur: dur + 60, size: 8, startR: startR * 0.8 });
      if (si === 1) c.sfx('graveMoan');
      await wait(c.scene, slow(dur * 0.8));
    }
    for (const s of st.slots) wailCell(c, s, st.targets.filter((t) => slotOfView(t) === s), si === 0 ? 1.2 : 1);
    await wait(c.scene, slow(70));
    c.releaseStage(si);
    if (si === 0) hit();
    if (si < stages.length - 1) await wait(c.scene, slow(200));
  }
  await wait(c.scene, slow(300));
});

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

/**
 * Piercing Arrow (column, aşamalı row): Archer yayı sonuna kadar gerer (kiriş titrer), tek ağır atış; ok bel hizasında şerit boyunca önden
 * arkaya düz uçar ve HER hücreyi delip geçer: dolu hücrede hedefe saplanıp çıkar (kıymık + kıvılcım, hedef geri itilir; o aşamanın hasar rakamı
 * tam o an), boş hücrede uçmaya devam eder. Arkasında solan iz bırakır; son hücreyi geçip ekrandan/şeritten çıkarken söner.
 */
const pierce = (c: VfxCtx) => playUntilHit(async (hit1) => {
  c.actor.play('attack');
  const a = spot(c.actor);
  const stages = fxStages(c);
  const cells = stages.map((st) => ({ slots: st.slots, targets: st.targets, m: cellMid(c.board, st.slots[0] ?? 0) }));
  const dir = cells.length ? (cells[cells.length - 1]!.m.x >= a.x ? 1 : -1) : c.actor.combatant.side === 'party' ? 1 : -1;
  // yay gerilir: elde kısa ışık, kiriş titrer
  const draw = sprite(c.scene, 'spark', '#ffd166', a.x + dir * 34, a.y, 30, DEPTH + 30).setAlpha(0.8);
  c.scene.tweens.add({ targets: draw, displayWidth: 54, displayHeight: 54, alpha: 0.2, duration: slow(220) });
  c.scene.tweens.add({ targets: c.actor.container, x: c.actor.container.x - dir * 8, duration: slow(200), yoyo: true, hold: slow(20) });
  await wait(c.scene, slow(230));
  draw.destroy();
  c.sfx('heavyTwang');
  c.sfx('arrowWhoosh');
  burst(c.scene, a.x + dir * 40, a.y, { colors: ['#d9c9a3', '#ffffff'], n: 6, speed: [60, 160], angle: dir > 0 ? [Math.PI * 0.8, Math.PI * 1.2] : [-0.2, 0.2], gravity: 0, life: [200, 360], size: [8, 12] });
  // yol: elden ilk hücrenin bel hizasına, sonra şerit boyunca düz, son hücreyi geçince 260 px daha
  const lift = 76;
  const laneY = cells.length ? cells[0]!.m.y - lift : a.y;
  const startX = a.x + dir * 40;
  const firstX = cells.length ? cells[0]!.m.x - dir * 120 : startX + dir * 200;
  const lastX = cells.length ? cells[cells.length - 1]!.m.x + dir * 260 : startX + dir * 700;
  const path = [{ x: startX, y: a.y }, { x: firstX, y: laneY }, { x: lastX, y: laneY }];
  const total = polyLen(path);
  const at = cells.map((k) => polyLen([path[0]!, path[1]!]) + Math.abs(k.m.x - firstX));
  const arrow = sprite(c.scene, 'pierce', '#ffd166', startX, a.y, 128, DEPTH + 30);
  const trail = c.scene.add.graphics().setDepth(DEPTH + 26);
  const marks: Array<{ x: number; y: number; t: number }> = [];
  const passed = new Set<number>();
  const SPEED = 2.1; // px / ms (oyun zamanı, skillSlowdown'dan önce)
  let hitDone = false;
  await counter(c.scene, slow(total / SPEED), (u) => {
    const d = total * u;
    const p = pointAt(path, d);
    const q = pointAt(path, Math.min(total, d + 6));
    arrow.setPosition(snap(p.x), snap(p.y)).setRotation(arrowRot(Math.atan2(q.y - p.y, q.x - p.x || dir)));
    marks.push({ x: p.x, y: p.y, t: d });
    trail.clear();
    for (const m of marks) {
      const age = (d - m.t) / 260;
      if (age > 1) continue;
      trail.fillStyle(age < 0.3 ? 0xffffff : 0xffd166, (1 - age) * 0.7).fillRect(snap(m.x) - 3, snap(m.y) - 2, 6, 4);
    }
    cells.forEach((k, i) => {
      if (passed.has(i) || d < at[i]!) return;
      passed.add(i);
      // aşama i: ok bu hücreyi delip geçer
      for (const t of k.targets) {
        const tp = { x: t.container.x, y: laneY };
        c.sfx('arrowThunk');
        hit(c.scene, tp.x, tp.y, ['#ffd166', '#ffffff', '#d9c9a3'], 0.9);
        burst(c.scene, tp.x, tp.y, { colors: ['#e3b983', '#8c5a2b', '#ffffff'], n: 6, speed: [120, 320], angle: dir > 0 ? [-0.5, 0.5] : [Math.PI - 0.5, Math.PI + 0.5], gravity: 500, life: [260, 480], size: [6, 10] });
        c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 14, duration: slow(50), yoyo: true });
      }
      if (!k.targets.length) burst(c.scene, k.m.x, laneY, { colors: ['#ffd166', '#ffffff'], n: 2, speed: [20, 60], gravity: 0, life: [160, 260], size: [6, 8] });
      c.releaseStage(i);
      if (!hitDone) {
        hitDone = true;
        hit1();
      }
    });
  });
  for (let i = 0; i < cells.length; i++) c.releaseStage(i);
  c.scene.tweens.add({ targets: arrow, alpha: 0, duration: slow(120), onComplete: () => arrow.destroy() });
  c.scene.tweens.add({ targets: trail, alpha: 0, duration: slow(260), onComplete: () => trail.destroy() });
  c.actor.play('idle');
});

/**
 * Arrow Rain (rect 3x3): Archer göğe doğru hızlı bir ok yaylımı atar (oklar ekranın üstünden çıkar); kısa bir an sonra ok yağmuru YALNIZCA
 * 3x3 bloğun hücrelerine iner: dalga ön sıradan arkaya doğru yürür, her hücreye birkaç ok eğik saplanır (toz, kıymık); hücredeki düşmana
 * gelen oklar gövdeye saplanır (hasar rakamı o hücreye ilk okun düştüğü an). Saplanan oklar bir süre yerde kalıp söner.
 */
const arrowrain = async (c: VfxCtx) => {
  c.actor.play('attack');
  c.sfx('bowTwang');
  await c.windUp('#d9c9a3', 'attack');
  const a = spot(c.actor);
  const slots = fxSlots(c);
  const dir = slots.length ? (cellMid(c.board, slots[0]!).x >= a.x ? 1 : -1) : 1;
  // 1) göğe yaylım: oklar yukarı fırlar
  for (let i = 0; i < 6; i++) {
    void wait(c.scene, slow(i * 30)).then(() => {
      const s = sprite(c.scene, 'arrow', '#d9c9a3', a.x + dir * 20, a.y - 20, 72, DEPTH + 30);
      const to = { x: a.x + dir * (120 + i * 26), y: -120 };
      s.setRotation(arrowRot(Math.atan2(to.y - s.y, to.x - s.x)));
      void travel(c.scene, s, to, 260, { ease: 'out' }).then(() => s.destroy());
    });
  }
  await wait(c.scene, slow(420));
  c.sfx('arrowShower');
  // 2) yağmur: hücre başına 3-4 ok; dalga yuva sırasıyla (ön sıra önce), hedefli hücrede bir ok gövdeye
  const lanes = content.GRID.lanes;
  const arrive = new Map<number, ReturnType<typeof deferred>>(slots.map((s) => [s, deferred()]));
  const slant = dir * 0.32; // oklar atış yönünde hafif eğik iner
  let landed = 0;
  const jobs = slots.flatMap((s) => {
    const q = quadOf(c.board, s, 0.86);
    const row = Math.floor(s / lanes);
    const lane = s % lanes;
    const base = row * 110 + lane * 30;
    const victim = c.targets.find((t) => slotOfView(t) === s);
    return Array.from({ length: victim ? 4 : 3 }, async (_, i) => {
      await wait(c.scene, slow(base + i * 70 + rnd(0, 30)));
      const body = victim && i === 0;
      const to = body ? { x: victim.container.x + rnd(-victim.w * 0.18, victim.w * 0.18), y: victim.container.y - victim.h * rnd(0.3, 0.6) } : inQuad(q, 0.9);
      const ang = Math.PI / 2 - slant; // aşağı doğru
      const from = { x: to.x - Math.cos(ang) * 620, y: to.y - Math.sin(ang) * 620 };
      const arrow = sprite(c.scene, 'arrow', '#d9c9a3', from.x, from.y, 76, body ? victim.container.depth + 1 : to.y + 1).setRotation(arrowRot(ang));
      await travel(c.scene, arrow, to, 200, { ease: 'in' });
      if (landed++ % 3 === 0) c.sfx('arrowThunk');
      if (body) {
        hit(c.scene, to.x, to.y, ['#ffffff', '#d9c9a3', '#e5463b'], 0.6);
        c.scene.tweens.add({ targets: victim.container, y: victim.container.y + 5, duration: slow(50), yoyo: true });
        arrive.get(s)?.resolve();
      } else {
        // yere saplanır: ok yarı gömülü kalır (ucu toprağın içinde: dokuda kuzeydoğudaki uç kırpılır, yalnız gövde ve tüy görünür)
        const fw = arrow.frame.width;
        const fh = arrow.frame.height;
        arrow.setCrop(0, fh * 0.3, fw * 0.7, fh * 0.7);
        burst(c.scene, to.x, to.y, { colors: DUST, n: 3, speed: [30, 120], angle: [-Math.PI, 0], gravity: 400, life: [220, 420], size: [6, 10] });
        if (!victim && i === 0) arrive.get(s)?.resolve();
      }
      c.scene.tweens.add({ targets: arrow, alpha: 0, duration: slow(420), delay: slow(body ? 260 : 700 + rnd(0, 200)), onComplete: () => arrow.destroy() });
    });
  });
  void Promise.all(jobs).then(() => {
    for (const d of arrive.values()) d.resolve();
    c.actor.play('idle');
  });
  await hitsAt(c, (t) => arrive.get(slotOfView(t))?.promise ?? Promise.resolve(), wait(c.scene, slow(420)));
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

/**
 * Yerde sürünen dikenli sarmaşık (Nature's Wrath): `from`dan `to`ya zemin boyunca kıvrılarak uzanır (Graphics, karakterlerin altında).
 * Gövde koyu kontur + iki ton yeşil kare piksel; aralıklarla yaprak ve beyaz diken; ucu kahverengi kök. Promise uç varınca çözülür; `fade()` söndürür.
 */
function creeper(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, dur: number, o: { width?: number; depth?: number } = {}): { done: Promise<void>; fade: (delay: number) => void } {
  // iki katman: koyu kontur altta, gövde üstte (aksi hâlde her yeni kontur karesi bir öncekinin gövdesini keser: noktalı görünür)
  const edge = scene.add.graphics().setDepth(o.depth ?? FLOOR_FX + 1);
  const g = scene.add.graphics().setDepth((o.depth ?? FLOOR_FX + 1) + 0.5);
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const ph = rnd(0, 6);
  const w = o.width ?? 9;
  const at = (s: number) => {
    const off = Math.sin(s / 34 + ph) * 9 * Math.min(1, s / 60, (len - s) / 40 + 0.3) + Math.sin(s / 11 + ph * 2) * 2.5;
    return { x: snap(from.x + ux * s - uy * off), y: snap(from.y + uy * s + ux * off * 0.55) };
  };
  let drawn = 0;
  let dirtAt = 0;
  const done = counter(scene, slow(dur), (u) => {
    const end = len * u;
    for (let s = drawn; s <= end; s += 2) {
      const p = at(s);
      const k = s / len;
      const th = Math.max(4, w * (1 - 0.35 * k));
      edge.fillStyle(0x1f3a14, 1).fillRect(p.x - th / 2 - 2, p.y - th / 2 - 2, th + 4, th + 4);
      g.fillStyle(Math.floor(s / 6) % 2 ? 0x62d04b : 0x3f9a34, 1).fillRect(p.x - th / 2, p.y - th / 2, th, th);
      if (Math.floor(s / 6) % 3 === 0) g.fillStyle(0xa8f08a, 1).fillRect(p.x - th / 2, p.y - th / 2, th, 2); // ışık
      if (s % 4 !== 0) continue;
      const i = Math.round(s / 4);
      if (i % 11 === 5) {
        const side = i % 22 === 5 ? 1 : -1;
        g.fillStyle(0xa8f08a, 1).fillRect(p.x - 4 - uy * side * 8, p.y - 3 + ux * side * 6, 9, 5); // yaprak
        g.fillStyle(0x2c7a2b, 1).fillRect(p.x - 1 - uy * side * 8, p.y - 1 + ux * side * 6, 3, 2);
      }
      if (i % 9 === 0) {
        const side = i % 18 === 0 ? 1 : -1;
        g.fillStyle(0xfdfaf2, 1).fillTriangle(p.x, p.y, p.x - uy * side * 10 - ux * 2, p.y + ux * side * 6 - uy * 2, p.x - uy * side * 10 + ux * 2, p.y + ux * side * 6 + uy * 2); // diken
      }
    }
    drawn = Math.max(drawn, Math.floor(end / 2) * 2 + 2);
    if (u * dur >= dirtAt && u < 1) {
      dirtAt += 45;
      const p = at(end);
      g.fillStyle(0x4a2e1a, 1).fillRect(p.x - 5, p.y - 5, 10, 10); // kök ucu
      burst(scene, p.x, p.y - 2, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 1, speed: [30, 110], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 500, life: [220, 380], size: [6, 10], depth: o.depth ?? FLOOR_FX + 2 });
    }
  });
  return { done, fade: (delay) => scene.tweens.add({ targets: [g, edge], alpha: 0, delay: slow(delay), duration: slow(420), onComplete: () => (g.destroy(), edge.destroy()) }) };
}

/**
 * Dikenli sarmaşığın bir karakteri sarması: ayaklarından beline doğru dönerek yükselen sarmal. Arkadaki kıvrımlar karakterin arkasında,
 * öndekiler önünde çizilir (iki Graphics). Büyür, vuruşta sıkar (karakter hafif ezilir), bir süre tutar, sonra çözülüp yere iner.
 */
function vineCoil(scene: Phaser.Scene, t: CombatantView, hold = 520, o: { height?: number; turns?: number; snare?: boolean } = {}): void {
  const back = scene.add.graphics().setDepth(t.container.depth - 1);
  const front = scene.add.graphics().setDepth(t.container.depth + 2);
  const cx = t.container.x;
  const base = t.container.y - 2;
  const H = t.h * (o.height ?? 0.6);
  const W = Math.max(26, t.w * 0.34);
  const turns = o.turns ?? 2.6;
  // Vine Snare (snare): dikensiz, kalın kök-sarmaşık (kahve gövde, yeşil sürgün) bacakları sarar
  const snare = !!o.snare;
  const max = turns * Math.PI * 2;
  const ph = rnd(0, Math.PI * 2);
  const draw = (grow: number, squeeze: number) => {
    back.clear();
    front.clear();
    const top = grow * max;
    for (let a = 0; a <= top; a += 0.1) {
      const k = a / max;
      const r = W * (1 - 0.18 * k) * squeeze;
      const x = snap(cx + Math.cos(a + ph) * r);
      const y = snap(base - k * H + Math.sin(a + ph) * 7);
      const isFront = Math.sin(a + ph) > 0;
      const g = isFront ? front : back;
      const th = (isFront ? 11 : 8) + (snare ? 3 : 0);
      g.fillStyle(snare ? 0x2a1a0e : 0x1f3a14, 1).fillRect(x - th / 2 - 1, y - th / 2 - 1, th + 2, th + 2);
      const body = snare ? (isFront ? (Math.round(a / 0.3) % 2 ? 0x8c5a2b : 0x6b4423) : 0x4a2e1a) : isFront ? (Math.round(a / 0.3) % 2 ? 0x62d04b : 0x3f9a34) : 0x2c6a26;
      g.fillStyle(body, 1).fillRect(x - th / 2, y - th / 2, th, th);
      const i = Math.round(a / 0.1);
      if (snare && isFront && i % 4 === 0) g.fillStyle(0x62d04b, 1).fillRect(x - th / 2, y - th / 2, th, 3); // kökü saran yeşil sürgün
      if (!snare && isFront && i % 11 === 5) g.fillStyle(0xfdfaf2, 1).fillTriangle(x, y - 4, x + (Math.cos(a + ph) > 0 ? 14 : -14), y - 8, x, y + 3); // diken
      if (isFront && i % 19 === 12) g.fillStyle(0xa8f08a, 1).fillRect(x - 7, y - 11, 14, 6).fillStyle(0x2c7a2b, 1).fillRect(x - 1, y - 9, 3, 3); // yaprak
    }
  };
  void counter(scene, slow(240), (u) => draw(u, 1), 'Quad.easeOut').then(async () => {
    // sıkma: sarmal daralır, karakter hafif ezilir
    scene.tweens.add({ targets: t.container, scaleX: 0.95, duration: slow(70), yoyo: true });
    await counter(scene, slow(140), (u) => draw(1, 1 - 0.16 * Math.sin(u * Math.PI)));
    await wait(scene, slow(hold));
    await counter(scene, slow(260), (u) => draw(1 - u, 1), 'Quad.easeIn');
    back.destroy();
    front.destroy();
  });
}

/** Bir hücrede yerden dikenli sarmaşıklar fırlar (karakterle derinlik sıralı), toprak/yaprak saçılır; hücredeki hedefler sarılır. */
function vineEruption(c: VfxCtx, slot: number, victims: CombatantView[], big: boolean): void {
  const q = quadOf(c.board, slot, 0.9);
  const mid = cellMid(c.board, slot);
  const n = big ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const p = inQuad(q, 0.85);
    const h = rnd(130, 190) * (big ? 1.1 : 1);
    const v = c.scene.add.image(snap(p.x), snap(p.y + 2), ensureIcon(c.scene, i % 3 === 2 ? 'thornspike' : 'thornvine', '#8bd06a', false)).setOrigin(0.5, 1).setDisplaySize(h * (i % 3 === 2 ? 0.42 : 0.5), h).setDepth(p.y + 1);
    v.setFlipX(Math.random() < 0.5).setRotation(rnd(-0.25, 0.25));
    const sy = v.scaleY;
    v.setScale(v.scaleX, sy * 0.05);
    c.scene.tweens.add({ targets: v, scaleY: sy, duration: slow(rnd(160, 230)), delay: slow(i * 35), ease: 'Back.easeOut' });
    c.scene.tweens.add({ targets: v, angle: v.angle + rnd(-6, 6), duration: slow(420), yoyo: true, delay: slow(240), ease: 'Sine.easeInOut' });
    c.scene.tweens.add({ targets: v, scaleY: sy * 0.1, alpha: 0, delay: slow(900 + i * 40), duration: slow(300), ease: 'Quad.easeIn', onComplete: () => v.destroy() });
    burst(c.scene, p.x, p.y, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 3, speed: [60, 220], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 650, life: [300, 600], size: [8, 14] });
  }
  // zeminde kısa çatlak ve toprak tozu
  const g = c.scene.add.graphics().setDepth(FLOOR_FX);
  for (let k = 0; k < 5; k++) {
    let x = mid.x;
    let y = mid.y;
    const a = (k / 5) * Math.PI * 2 + rnd(-0.3, 0.3);
    for (let s = 0; s < 8; s++) {
      x += Math.cos(a + rnd(-0.5, 0.5)) * 7;
      y += Math.sin(a + rnd(-0.5, 0.5)) * 3;
      g.fillStyle(0x2a1a0e, 0.85).fillRect(snap(x), snap(y), 4, 4);
    }
  }
  c.scene.tweens.add({ targets: g, alpha: 0, delay: slow(700), duration: slow(500), onComplete: () => g.destroy() });
  dustCloud(c.scene, mid.x, mid.y, { n: 3, spread: 70, rise: 40, size: [30, 54], tint: 0x8a6a3a, life: 700 });
  for (let k = 0; k < 4; k++) {
    const leaf = sprite(c.scene, 'leafbit', '#7ed957', mid.x + rnd(-50, 50), mid.y - rnd(20, 90), 34, DEPTH + 40);
    c.scene.tweens.add({ targets: leaf, y: leaf.y - rnd(40, 110), x: leaf.x + rnd(-70, 70), rotation: rnd(-4, 4), alpha: 0, duration: slow(rnd(600, 900)), onComplete: () => leaf.destroy() });
  }
  for (const t of victims) {
    vineCoil(c.scene, t);
    const p = spot(t);
    burst(c.scene, p.x, p.y, { colors: ['#62d04b', '#2c7a2b', '#fdfaf2'], n: 6, speed: [80, 260], gravity: 500, life: [300, 600], size: [6, 12] });
  }
}

/**
 * Nature's Wrath (rect 2x3, aşamalı row): Druid asasını kaldırır, ayağının dibinden dikenli sarmaşıklar zemin boyunca sürünerek ÖN sıradaki
 * (1. aşama) her hücreye ayrı dal olarak koşar; hücreye varınca yerden dikenli sarmaşıklar fırlar ve oradaki düşmanı sarar (1. aşama hasarı).
 * Sonra sarmaşık her hücreden arkadaki sıraya (2. aşama) doğru yayılır, orada da fışkırır ve sarar (2. aşama hasarı). Sesler Druid'in kendi sesleri.
 */
const vines = (c: VfxCtx) => playUntilHit(async (hit) => {
  c.sfx('rootsRumble');
  await c.windUp('#7ed957');
  c.actor.play('cast');
  const stages = fxStages(c);
  const dir = c.board === 'enemy' ? 1 : -1;
  const root = { x: c.actor.container.x + dir * 30, y: c.actor.container.y - 4 };
  const fades: Array<(d: number) => void> = [];
  let prev: number[] = [];
  let first = true;
  for (const [si, st] of stages.entries()) {
    // her hücreye bir dal: 1. aşamada Druid'in ayağından, sonrakilerde önceki aşamanın en yakın hücresinden
    const runs = st.slots.map((slot) => {
      const to = cellMid(c.board, slot);
      const fromSlot = prev.length ? prev.reduce((b, s) => (Math.hypot(cellMid(c.board, s).x - to.x, cellMid(c.board, s).y - to.y) < Math.hypot(cellMid(c.board, b).x - to.x, cellMid(c.board, b).y - to.y) ? s : b)) : null;
      const from = fromSlot === null ? root : cellMid(c.board, fromSlot);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const cr = creeper(c.scene, from, to, Math.max(200, dist / (first ? 2.3 : 1.5)), { width: first ? 10 : 8 });
      fades.push(cr.fade);
      return { slot, done: cr.done };
    });
    if (si > 0) {
      c.sfx('rootsRumble');
      c.sfx('leafRustle');
    }
    // dallar vardıkça fışkırma; aşamanın vuruş anı = son dal varınca (aşamanın tüm hücreleri sarılmış olur)
    await Promise.all(
      runs.map(async (r, i) => {
        await r.done;
        vineEruption(c, r.slot, st.targets.filter((t) => slotOfView(t) === r.slot), si === 0);
        if (i === 0) {
          c.sfx('thud');
          c.sfx('leafRustle');
          shake(c.scene, 140, si === 0 ? 0.004 : 0.003);
        }
      }),
    );
    await wait(c.scene, slow(90));
    // aşamanın hasar rakamları bu anda akar; ilk aşamada efektin Promise'i de çözülür (yayılma arkada sürer)
    c.releaseStage(si);
    if (first) {
      first = false;
      hit();
    }
    prev = st.slots;
    if (si < stages.length - 1) await wait(c.scene, slow(240));
  }
  c.actor.play('idle');
  for (const f of fades) f(500);
});

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

/**
 * Treant - Root Smash (uzak menzil, havadan; veri `motion: sky` + `skyFx: fist`): Treant YERİNDE kalır, gövdesini gerip dal-kolunu göğe kaldırır
 * (yapraklar dökülür). Hedefin tam üstünde, gökten sarkan burgulu bir kök "kolun" ucunda dev ahşap yumruk belirir (hedefin boyuna oranlı) ve
 * düşer; çarpınca hedefin ayağının dibinden kökler patlar, toprak çatlar, kıymık/yaprak/toz saçılır, hafif sarsıntı. Fist Crush'ın altın
 * yumruğundan ayrışır: kabuklu ahşap yumruk + yukarı uzanan kök kol + yerden kök patlaması (parıltı yok). Hasar çarpma anında.
 */
const rootfall = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  c.sfx('woodCreak');
  a.play('attack');
  // kol kaldırma: gövde yukarı gerilir, tepesinden yaprak ve kıymık dökülür
  c.scene.tweens.add({ targets: a.container, scaleY: 1.07, scaleX: 0.97, duration: slow(200), yoyo: true, hold: slow(160), ease: 'Quad.easeOut' });
  burst(c.scene, a.container.x, a.container.y - a.h * 0.95, { colors: ['#62d04b', '#2c7a2b', '#8c5a2b', '#e3b983'], n: 8, speed: [40, 160], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 300, life: [400, 800], size: [8, 14] });
  for (let i = 0; i < 4; i++) {
    const leaf = sprite(c.scene, 'leafbit', '#7ed957', a.container.x + rnd(-40, 40), a.container.y - a.h * rnd(0.7, 1), 30, DEPTH + 40);
    c.scene.tweens.add({ targets: leaf, y: leaf.y + rnd(60, 140), x: leaf.x + rnd(-60, 60), rotation: rnd(-4, 4), alpha: 0, duration: slow(rnd(700, 1000)), onComplete: () => leaf.destroy() });
  }
  await wait(c.scene, slow(240));
  const f = feet(t);
  const p = spot(t);
  const size = Math.max(128, Math.min(240, Math.round((t.h * 0.95) / 16) * 16));
  const landY = p.y + size * 0.08;
  // yerde büyüyen gölge
  const shadow = c.scene.add.ellipse(f.x, f.y, 30, 12, 0x000000, 0.42).setDepth(FLOOR_FX + 4);
  c.scene.tweens.add({ targets: shadow, scaleX: size / 22, scaleY: size / 44, duration: slow(420), ease: 'Quad.easeIn' });
  // yumruk + gökten sarkan kök kol
  const fist = sprite(c.scene, 'rootfist', '#8c5a2b', p.x, -size * 0.6, size, DEPTH + 40);
  const arm = c.scene.add.graphics().setDepth(DEPTH + 39);
  const ph = rnd(0, 6);
  const drawArm = (sway: number) => {
    arm.clear();
    const topY = -30;
    const endY = fist.y - size * 0.4;
    const n = Math.max(2, Math.ceil((endY - topY) / 12));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const y = topY + (endY - topY) * u;
      const x = fist.x + Math.sin(u * Math.PI * 2.2 + ph) * 14 * (1 - u) * sway + Math.sin(u * 9 + ph) * 3;
      const w = Math.round(size * 0.2 - u * size * 0.04);
      arm.fillStyle(0x2a1a0e, 1).fillRect(snap(x - w / 2 - 2), snap(y - 7), w + 4, 16);
      arm.fillStyle(i % 3 === 0 ? 0x4a2e1a : 0x6b4423, 1).fillRect(snap(x - w / 2), snap(y - 6), w, 14);
      arm.fillStyle(0x8c5a2b, 1).fillRect(snap(x - w / 2), snap(y - 6), Math.max(4, w * 0.3), 14);
      if (i % 4 === 1) arm.fillStyle(0x62d04b, 1).fillRect(snap(x + w / 2 - 2), snap(y - 4), 8, 6); // yosun/sürgün
      if (i % 5 === 3) arm.fillStyle(0xe3b983, 1).fillRect(snap(x - 3), snap(y - 2), 6, 3); // kabuk çatlağı
    }
  };
  c.sfx('leafRustle');
  await counter(
    c.scene,
    slow(380),
    (u) => {
      fist.setY(snap(-size * 0.6 + (landY + size * 0.6) * u * u));
      drawArm(1 - u * 0.6);
      if (u > 0.3 && Math.random() < 0.5) burst(c.scene, fist.x + rnd(-size * 0.3, size * 0.3), fist.y - size * 0.4, { colors: ['#8c5a2b', '#e3b983', '#62d04b'], n: 1, speed: [0, 40], gravity: 200, life: [200, 360], size: [8, 12] });
    },
  );
  shadow.destroy();
  // çarpma: kök patlaması, çatlak, toz, kıymık
  c.sfx('woodSmash');
  c.sfx('rootsRumble');
  hit(c.scene, p.x, p.y + size * 0.15, WOOD, 1.5);
  cracks(c.scene, f.x, f.y - 2, { len: 150, n: 8, dur: 700 });
  dustCloud(c.scene, f.x, f.y, { n: 7, spread: 100, rise: 50, size: [30, 56], tint: 0x8a6a3a });
  burst(c.scene, f.x, f.y - 8, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 14, speed: [120, 400], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [420, 800], size: [10, 18] });
  for (let i = 0; i < 5; i++) {
    const dx = (i - 2) * (t.w * 0.28) + rnd(-8, 8);
    const r = sprite(c.scene, i % 2 ? 'thornspike' : 'roots', i % 2 ? '#8c5a2b' : '#7ed957', f.x + dx, f.y + 6, i % 2 ? 60 : 84, f.y + 2 + (i % 2));
    r.setRotation(dx / 220);
    sprout(c.scene, r, 140);
    c.scene.tweens.add({ targets: r, scaleY: r.scaleY * 0.1, alpha: 0, duration: slow(300), delay: slow(420 + i * 30), ease: 'Quad.easeIn', onComplete: () => r.destroy() });
  }
  for (let i = 0; i < 9; i++) {
    const sp = sprite(c.scene, i % 3 === 0 ? 'leafbit' : 'splinter', i % 3 === 0 ? '#62d04b' : '#e3b983', p.x, p.y, 34, DEPTH + 45).setRotation(rnd(0, 6));
    c.scene.tweens.add({ targets: sp, x: p.x + rnd(-170, 170), y: p.y + rnd(-130, 40), rotation: sp.rotation + rnd(-4, 4), alpha: 0, duration: slow(560), onComplete: () => sp.destroy() });
  }
  c.scene.tweens.add({ targets: t.container, scaleY: 0.9, scaleX: 1.06, duration: slow(70), yoyo: true });
  shake(c.scene, 150, 0.007);
  // yumruk bir an çakılı kalır, sonra kök kol onu göğe geri çeker
  void wait(c.scene, slow(160)).then(() =>
    counter(c.scene, slow(320), (u) => {
      fist.setY(snap(landY - (landY + size) * u * u)).setAlpha(1 - u * 0.6);
      drawArm(0.4 + u * 0.6);
      arm.setAlpha(1 - u * 0.6);
    }).then(() => {
      fist.destroy();
      arm.destroy();
    }),
  );
  await wait(c.scene, slow(60));
  a.play('idle');
};

/**
 * Vine Snare'in bir hücresi: yerden kalın kökler ve sarmaşıklar fırlar (dikenli Nature's Wrath dallarından ayrı: kahve kök + yeşil sürgün),
 * toprak çatlar/kabarır; hücredeki düşmanların BACAKLARINI kalın kök-sarmaşık sarar (sıkıştırır). Promise'siz; anlık.
 */
function snareEruption(c: VfxCtx, slot: number, victims: CombatantView[]): void {
  const q = quadOf(c.board, slot, 0.9);
  const mid = cellMid(c.board, slot);
  for (let i = 0; i < 4; i++) {
    const p = inQuad(q, 0.85);
    const h = rnd(110, 160);
    const vine = i % 2 === 0;
    const v = c.scene.add.image(snap(p.x), snap(p.y + 2), ensureIcon(c.scene, vine ? 'thornvine' : 'roots', vine ? '#62d04b' : '#7ed957', false)).setOrigin(0.5, 1).setDisplaySize(h * (vine ? 0.55 : 0.8), h).setDepth(p.y + 1);
    v.setFlipX(Math.random() < 0.5).setRotation(rnd(-0.3, 0.3));
    if (vine) v.setTint(0xb9a06a); // dikeni bastırılmış, kök tonlu sarmaşık
    const sy = v.scaleY;
    v.setScale(v.scaleX, sy * 0.05);
    c.scene.tweens.add({ targets: v, scaleY: sy, duration: slow(rnd(150, 210)), delay: slow(i * 30), ease: 'Back.easeOut' });
    // kamçı gibi kıvrılıp hedefe doğru eğilir
    c.scene.tweens.add({ targets: v, angle: v.angle + (Math.random() < 0.5 ? -18 : 18), duration: slow(160), yoyo: true, delay: slow(220), ease: 'Sine.easeInOut' });
    c.scene.tweens.add({ targets: v, scaleY: sy * 0.1, alpha: 0, delay: slow(780 + i * 40), duration: slow(280), ease: 'Quad.easeIn', onComplete: () => v.destroy() });
    burst(c.scene, p.x, p.y, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 3, speed: [60, 220], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 650, life: [300, 600], size: [8, 14] });
  }
  // zeminde kabaran toprak halkası
  const g = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
  fillCells(g, c.board, [slot], { fill: 0x3a2412, fillA: 0.45, edge: 0x8c5a2b, edgeA: 0.7, edgeW: 3, k: 0.86 });
  c.scene.tweens.add({ targets: g, alpha: 0, delay: slow(600), duration: slow(500), onComplete: () => g.destroy() });
  dustCloud(c.scene, mid.x, mid.y, { n: 3, spread: 70, rise: 36, size: [30, 54], tint: 0x8a6a3a, life: 700 });
  for (const t of victims) {
    vineCoil(c.scene, t, 420, { height: 0.34, turns: 2.2, snare: true });
    const p = feet(t);
    burst(c.scene, p.x, p.y - 20, { colors: ['#62d04b', '#8c5a2b', '#e3b983'], n: 6, speed: [80, 240], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 600, life: [300, 600], size: [6, 12] });
    c.scene.tweens.add({ targets: t.container, y: t.container.y + 6, duration: slow(80), yoyo: true, hold: slow(120) });
  }
}

/**
 * Treant - Vine Snare (rect 2x2; %25 yere bağlama + 1 tur Stun): Treant yerinde kalır, dal-kolunu yere vurur (çatlak, toz); kökler toprağın
 * altından alana doğru ilerler (yer kabarır, toprak sıçrar), 2x2 alanın her hücresinde yerden kalın kökler ve sarmaşıklar fırlar ve düşmanların
 * bacaklarını sarar (hasar rakamları o an). Stun'a bağlanan düşmanda (status `cause: 'vines'`) sarmaşık stun süresince bacaklarında kalır
 * (CombatantView.setVineWrap; stun bitince çözülür) ve kısa "Rooted" yazısı çıkar.
 */
const vinesnare = (c: VfxCtx) => playUntilHit(async (hit) => {
  const a = c.actor;
  const slots = fxSlots(c);
  c.sfx('woodCreak');
  a.play('attack');
  // kol yere iner: gövde öne çöker
  await new Promise<void>((resolve) => c.scene.tweens.add({ targets: a.container, scaleY: 0.92, scaleX: 1.04, y: a.container.y + 6, duration: slow(140), yoyo: true, hold: slow(80), ease: 'Quad.easeIn', onYoyo: () => resolve() }));
  const dir = c.board === 'enemy' ? 1 : -1;
  const slam = { x: a.container.x + dir * (a.w * 0.45), y: a.container.y - 4 };
  cracks(c.scene, slam.x, slam.y, { len: 110, n: 6, dur: 600 });
  dustCloud(c.scene, slam.x, slam.y, { n: 4, spread: 70, rise: 40, size: [30, 54], tint: 0x8a6a3a });
  burst(c.scene, slam.x, slam.y - 6, { colors: ['#4a2e1a', '#6b4423', '#62d04b'], n: 10, speed: [80, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 800, life: [350, 650], size: [8, 14] });
  shake(c.scene, 140, 0.005);
  // kökler yerin altından ilerler: her hücreye bir kabarma izi
  c.sfx('vineLash');
  const arrivals = slots.map(async (slot) => {
    const to = cellMid(c.board, slot);
    const dist = Math.hypot(to.x - slam.x, to.y - slam.y);
    const dur = Math.max(180, dist / 2.6);
    const ridge = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
    let lastDirt = 0;
    await counter(c.scene, slow(dur), (u) => {
      const x = slam.x + (to.x - slam.x) * u + Math.sin(u * 9) * 6;
      const y = slam.y + (to.y - slam.y) * u;
      ridge.fillStyle(0x2a1a0e, 0.75).fillRect(snap(x) - 5, snap(y) - 2, 10, 4);
      ridge.fillStyle(0x6b4423, 0.85).fillRect(snap(x) - 3, snap(y) - 4, 6, 2);
      if (u * dur - lastDirt > 40) {
        lastDirt = u * dur;
        burst(c.scene, x, y - 2, { colors: ['#4a2e1a', '#6b4423', '#8c5a2b'], n: 1, speed: [40, 140], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 600, life: [220, 400], size: [6, 10] });
      }
    });
    c.scene.tweens.add({ targets: ridge, alpha: 0, delay: slow(300), duration: slow(500), onComplete: () => ridge.destroy() });
    snareEruption(c, slot, c.targets.filter((t) => slotOfView(t) === slot));
  });
  await Promise.all(arrivals);
  c.sfx('rootGrip');
  shake(c.scene, 120, 0.004);
  await wait(c.scene, slow(140)); // sarmaşıklar sıkar: hasar rakamları o an
  hit();
  a.play('idle');
  await wait(c.scene, slow(500));
});

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

/**
 * Tremor Slam (row, melee): Defender hedef SIRANIN başına (ekranda en üstteki şeridin önüne) koşar, zırhlı yumruğunu kaldırıp yere indirir;
 * sarsıntı dalgası sıra boyunca hücreden hücreye (üst şeritten alta) ilerler: zeminde zikzak bir çatlak çizgisi uzar, her hücrede taş
 * parçaları yerden fırlar, toz kalkar, o hücredeki düşman sarsılıp havaya sıçrar (hasar rakamı dalga ona değdiği an).
 */
const tremor = async (c: VfxCtx) => {
  const slots = [...fxSlots(c)].sort((p, q) => cellMid(c.board, p).y - cellMid(c.board, q).y); // ekranda üstten alta (şerit sırası)
  const head = slots[0] !== undefined ? cellMid(c.board, slots[0]) : (c.centerPos ?? feet(c.actor));
  await meleeApproach(c.scene, c.actor, c.targets, head);
  c.sfx('effortHah');
  const dir = head.x >= c.actor.container.x ? 1 : -1;
  // zırhlı yumruk iner: Defender'ın önünde yere çakılır
  const impact = { x: c.actor.container.x + dir * (c.actor.w * 0.5 + 26), y: head.y };
  const fist = sprite(c.scene, 'fistcrush', '#ffe9b0', impact.x, impact.y - 150, 112, DEPTH + 40);
  await travel(c.scene, fist, { x: impact.x, y: impact.y - 46 }, 90, { ease: 'in' });
  c.sfx('armorStomp');
  c.scene.tweens.add({ targets: fist, alpha: 0, y: fist.y + 6, delay: slow(140), duration: slow(220), onComplete: () => fist.destroy() });
  shake(c.scene, 260, 0.009);
  void ring(c.scene, impact.x, impact.y, { r: 130, flat: 0.32, n: 26, colors: ['#ffffff', '#ffe9b0', ...DUST], dur: 420, size: 12 });
  burst(c.scene, impact.x, impact.y - 12, { colors: ['#5b6579', '#98a2b4', '#4a2e1a'], n: 16, speed: [140, 420], angle: [-Math.PI, 0], gravity: 900, life: [450, 850], size: [10, 18] });
  dustCloud(c.scene, impact.x, impact.y, { n: 4, spread: 80, rise: 50, size: [40, 70], life: 800 });
  // dalga: çarpma noktasından sıranın hücreleri boyunca (merkezden merkeze) zikzak çatlak + yerden fırlayan taşlar
  const path = [impact, ...slots.map((s) => cellMid(c.board, s))];
  const extra = slots.length ? { x: path[path.length - 1]!.x + (path[path.length - 1]!.x - path[path.length - 2]!.x) * 0.45, y: path[path.length - 1]!.y + (path[path.length - 1]!.y - path[path.length - 2]!.y) * 0.45 } : impact;
  path.push(extra);
  const crack = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
  const arrive = new Map<number, ReturnType<typeof deferred>>(slots.map((s) => [s, deferred()]));
  const reachedAt = slots.map((_, i) => polyLen(path.slice(0, i + 2))); // dalganın i. hücrenin merkezine vardığı mesafe
  const total = polyLen(path);
  const reached = new Set<number>();
  let last = 0;
  let wobble = 0;
  c.sfx('earthCrack');
  const WAVE = 120 * Math.max(1, slots.length) + 80;
  void counter(c.scene, slow(WAVE), (u) => {
    const d = total * u;
    for (let s = last; s <= d; s += 4) {
      const p = pointAt(path, s);
      wobble += rnd(-3, 3);
      wobble = Math.max(-9, Math.min(9, wobble));
      const x = snap(p.x);
      const y = snap(p.y + wobble * 0.5);
      crack.fillStyle(0x15101c, 0.95).fillRect(x - 2, y - 2, 5, 4);
      crack.fillStyle(0x4a2e1a, 0.8).fillRect(x - 3, y + 2, 6, 2);
      if (Math.random() < 0.18) {
        // yan çatlak dalı
        let bx = x;
        let by = y;
        const a = rnd(0, Math.PI * 2);
        for (let k = 0; k < 4; k++) {
          bx += Math.cos(a) * 5;
          by += Math.sin(a) * 2.5;
          crack.fillStyle(0x15101c, 0.8).fillRect(snap(bx), snap(by), 3, 3);
        }
      }
    }
    last = d;
    // dalganın ucunda yerden küçük taş fırlar
    const tip = pointAt(path, d);
    if (Math.random() < 0.6) burst(c.scene, tip.x, tip.y - 4, { colors: ['#5b6579', '#98a2b4', '#4a2e1a'], n: 2, speed: [80, 240], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 900, life: [300, 520], size: [8, 14] });
    slots.forEach((s, i) => {
      if (reached.has(s) || d < reachedAt[i]!) return;
      reached.add(s);
      const m = cellMid(c.board, s);
      // hücrede kaya parçaları yerden fırlar, toz kalkar
      for (let k = 0; k < 3; k++) {
        const p = inQuad(quadOf(c.board, s, 0.8), 0.8);
        const r = sprite(c.scene, 'rock', '#98a2b4', p.x, p.y, 34 + k * 8, p.y + 1).setOrigin(0.5, 1);
        const sy = r.scaleY;
        r.setScale(r.scaleX, sy * 0.1);
        c.scene.tweens.add({ targets: r, scaleY: sy, y: r.y - rnd(6, 16), duration: slow(90), ease: 'Back.easeOut', yoyo: true, hold: slow(140), onComplete: () => r.destroy() });
      }
      dustCloud(c.scene, m.x, m.y, { n: 3, spread: 90, rise: 50, size: [40, 70], life: 760 });
      void ring(c.scene, m.x, m.y, { r: 90, flat: 0.32, n: 18, colors: DUST, dur: 360, size: 10 });
      for (const t of c.targets.filter((v) => slotOfView(v) === s)) {
        c.scene.tweens.add({ targets: t.container, y: t.container.y - 18, duration: slow(70), yoyo: true, ease: 'Quad.easeOut' });
        hit(c.scene, t.container.x, t.container.y - t.h * 0.35, ['#ffffff', '#ffe9b0', '#98a2b4'], 0.8);
      }
      shake(c.scene, 110, 0.004);
      arrive.get(s)?.resolve();
    });
  }).then(() => {
    for (const a of arrive.values()) a.resolve();
    c.scene.tweens.add({ targets: crack, alpha: 0, delay: slow(500), duration: slow(600), onComplete: () => crack.destroy() });
  });
  await hitsAt(c, (t) => arrive.get(slotOfView(t))?.promise ?? Promise.resolve(), wait(c.scene, slow(WAVE)));
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
// DEFENDER (rework): ortak görsel dil = Defender görselindeki lacivert kule kalkanı (fx sprite 'towershield'), çelik-gümüş ve mavi-gri
// tonlar, pirinç perçin vurgusu. Büyü parıltısı yok; ağırlık hissi: kısa duraksamalar (hitstop), kamera sarsıntısı, toz, taş, kıvılcım.
// Eski animasyonlar (tauntFx, guardlink, tremor, fistcrush) yukarıda yedekte (BACKUP_VFX).

const STEELBLUE = ['#ffffff', '#d7dce6', '#a8c4e8', '#7d9cc4'];
const STONE = ['#5b6579', '#98a2b4', '#4a2e1a', '#7a6a58'];
/** Defender'ın kalkan kolu: karakterin karşı tarafa bakan yüzü (party sağa, enemy sola bakar). */
const facingOf = (v: CombatantView) => (v.combatant.side === 'party' ? 1 : -1);

/** Kule kalkanı sprite'ı (alt orta noktası x,y'de): `glow` true ise ADD karışımlı soluk mavi hayalet (kontur görünmez). */
function towerSprite(scene: Phaser.Scene, x: number, y: number, h: number, depth: number, glow = false): Phaser.GameObjects.Image {
  const img = sprite(scene, 'towershield', '#8fb0d8', x, y, h, depth).setOrigin(0.5, 1);
  if (glow) img.setBlendMode(Phaser.BlendModes.ADD);
  return img;
}

/** Hedef işareti (Taunt): başın üstünde kızıl nişangâh (piksel halka + 4 çentik + koyu gölge), düşerek oturur, bir süre durup söner. */
function tauntMark(scene: Phaser.Scene, t: CombatantView, hold: number): void {
  const g = scene.add.graphics().setDepth(DEPTH + 60);
  const x = t.container.x;
  const y = t.container.y - t.h * 0.86; // başın üstünde (can barlarının altında kalır, yüzü çerçeveler)
  const draw = (k: number, a: number) => {
    g.clear();
    const R = 18 * k;
    const sq = (px: number, py: number, s: number, col: number, al: number) => g.fillStyle(col, al).fillRect(snap(px) - s / 2, snap(py) - s / 2, s, s);
    for (const [col, off, al] of [[0x15101c, 2, 0.75], [0xe5463b, 0, 1]] as const) {
      for (let i = 0; i < 16; i++) {
        const an = (i / 16) * Math.PI * 2;
        sq(x + Math.cos(an) * R + off, y + Math.sin(an) * R + off, 4, col, al * a);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let s = 0; s < 3; s++) sq(x + dx * (R + 6 - s * 4) + off, y + dy * (R + 6 - s * 4) + off, 4, col, al * a);
    }
    sq(x, y, 4, 0xffe9b0, a);
  };
  g.setY(-40);
  draw(1.6, 0);
  void counter(scene, slow(200), (u) => {
    g.setY(-40 * (1 - u));
    draw(1.6 - 0.6 * u, Math.min(1, u * 1.6));
  }, 'Back.easeOut').then(() => {
    void counter(scene, slow(hold), (u) => draw(1 + Math.sin(u * Math.PI * 4) * 0.06, 1)).then(() =>
      counter(scene, slow(260), (u) => draw(1 + u * 0.3, 1 - u)).then(() => g.destroy()),
    );
  });
}

/**
 * Taunt (self): Defender kule kalkanına kılıç kabzasıyla iki kez vurur (kenarda çelik kıvılcımı, kalkan silueti her vuruşta soluk mavi
 * parlar), sonra göğsünü şişirip savaş çığlığı atar: önünde kule kalkanının hayalet parıltısı yükselir, zeminde ve havada karşı tarafa doğru
 * piksel ses dalgaları koşar; dalga her düşmana değdiğinde başının üstüne kızıl hedef işareti oturur ve düşman bir an Defender'a döner.
 */
const taunt2 = async (c: VfxCtx) => {
  const a = c.actor;
  const dir = facingOf(a);
  const home = { x: a.container.x, y: a.container.y };
  const rim = { x: home.x + dir * a.w * 0.34, y: home.y - a.h * 0.62 };
  c.sfx('shieldBang');
  // iki vuruş: ses kaydındaki darbelerle eş zamanlı (0 ve 200 ms; ses yavaşlatılmaz)
  const bang = (k: number) => {
    a.play('attack');
    c.scene.tweens.add({ targets: a.container, x: home.x + dir * 6, duration: 40, yoyo: true });
    burst(c.scene, rim.x, rim.y, { colors: ['#ffffff', '#ffe9b0', '#ffd23f'], n: 7 + k * 3, speed: [120, 340], angle: dir > 0 ? [-1.9, 0.4] : [Math.PI - 0.4, Math.PI + 1.9], gravity: 700, life: [180, 360], size: [5, 9] });
    const glow = towerSprite(c.scene, home.x + dir * a.w * 0.3, home.y - 4, a.h * 0.86, DEPTH + 20, true).setTintFill(0xa8c4e8).setAlpha(0.42);
    c.scene.tweens.add({ targets: glow, alpha: 0, duration: 170, onComplete: () => glow.destroy() });
    shake(c.scene, 70, 0.0025);
  };
  bang(0);
  await wait(c.scene, 200);
  bang(1);
  await wait(c.scene, slow(170));
  // savaş çığlığı
  c.sfx('battleRoar');
  a.play('cast');
  c.scene.tweens.add({ targets: a.container, scaleX: 1.06, scaleY: 1.06, duration: slow(120), yoyo: true, hold: slow(220) });
  shake(c.scene, 260, 0.004);
  const ghost = towerSprite(c.scene, home.x + dir * (a.w * 0.55), home.y - 2, a.h * 1.05, DEPTH + 25, true).setAlpha(0);
  const ghostFill = towerSprite(c.scene, ghost.x, ghost.y, a.h * 1.05, DEPTH + 24, true).setTintFill(0x7d9cc4).setAlpha(0);
  c.scene.tweens.add({ targets: ghost, alpha: 0.7, y: ghost.y - 10, duration: slow(160), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: ghostFill, alpha: 0.3, y: ghostFill.y - 10, duration: slow(160), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: [ghost, ghostFill], alpha: 0, delay: slow(520), duration: slow(380), onComplete: () => { ghost.destroy(); ghostFill.destroy(); } });
  // zeminde karşıya açılan yay dalgalar
  const facing = dir > 0 ? 0 : Math.PI;
  for (let i = 0; i < 3; i++) void wait(c.scene, slow(i * 110)).then(() => ring(c.scene, home.x + dir * 30, home.y - 4, { r: 420 + i * 90, flat: 0.3, n: 22, colors: ['#ffb066', '#e5463b', '#d7dce6'], dur: 620, size: 12, startR: 50, arc: [facing - 0.55, facing + 0.55] }));
  // havada ses dalgası cepheleri (piksel yaylar) + hedef işaretleri
  const foes = c.foes ?? [];
  const air = c.scene.add.graphics().setDepth(DEPTH + 30);
  const origin = { x: home.x + dir * a.w * 0.5, y: home.y - a.h * 0.6 };
  const far = Math.max(600, ...foes.map((f) => Math.abs(f.container.x - origin.x) + 80));
  const marked = new Set<CombatantView>();
  const WAVE = 560;
  await counter(c.scene, slow(WAVE), (u) => {
    air.clear();
    for (let k = 0; k < 3; k++) {
      const v = u - k * 0.14;
      if (v <= 0 || v >= 1) continue;
      const r = 40 + far * v;
      const al = (1 - v) * (k === 0 ? 1 : 0.6);
      for (let i = -8; i <= 8; i++) {
        const an = (i / 8) * 0.5;
        const px = origin.x + dir * Math.cos(an) * r;
        const py = origin.y + Math.sin(an) * r * 0.55;
        air.fillStyle(0x15101c, al * 0.5).fillRect(snap(px) - 4, snap(py) - 2, 10, 10);
        air.fillStyle(k === 0 ? 0xffb066 : 0xe5463b, al).fillRect(snap(px) - 4, snap(py) - 4, 8, 8);
        air.fillStyle(0xffffff, al * 0.8).fillRect(snap(px) - 1, snap(py) - 1, 2, 2);
      }
    }
    const front = 40 + far * u;
    for (const f of foes) {
      if (marked.has(f) || Math.abs(f.container.x - origin.x) > front) continue;
      marked.add(f);
      tauntMark(c.scene, f, 760);
      c.scene.tweens.add({ targets: f.container, x: f.container.x - dir * 8, duration: slow(60), yoyo: true });
    }
  }, 'Quad.easeOut');
  air.destroy();
  a.play('idle');
};

/**
 * Guard (dost hedef): Defender kalkanını dostuna doğru uzatır (bir adım atar, deri kayış + zırh sesi); kalkanından dostuna çelik-mavi bir
 * zincir bağı uzanır ve dostun ÖNÜNDE (karşı tarafa bakan yüzünde) yerden soluk mavi bir kule kalkanı hayaleti yükselir. Bağ ve hayalet
 * birlikte iki kez nabız atar (hasar paylaşımı: ikisi bağlı), sonra hayalet dostun üstüne yumuşakça oturup söner.
 */
const guard2 = async (c: VfxCtx) => {
  const a = c.actor;
  const t = c.targets[0] ?? a;
  const home = { x: a.container.x, y: a.container.y };
  const toward = t === a ? facingOf(a) : t.container.x >= home.x ? 1 : -1;
  c.sfx('shieldBrace');
  a.play('attack');
  // kalkanı uzatır: bir adım + kalkan siluetinin kısa parlaması
  c.scene.tweens.add({ targets: a.container, x: home.x + toward * 22, duration: slow(140), ease: 'Quad.easeOut' });
  const mine = towerSprite(c.scene, home.x + toward * (a.w * 0.45 + 22), home.y - 4, a.h * 0.8, DEPTH + 22, true).setTintFill(0xa8c4e8).setAlpha(0);
  c.scene.tweens.add({ targets: mine, alpha: 0.5, duration: slow(140), yoyo: true, hold: slow(80), onComplete: () => mine.destroy() });
  await wait(c.scene, slow(170));
  // dostun önündeki hayalet kalkanın yeri (karşı tarafa bakan yüz)
  const fdir = facingOf(t);
  const gx = t.container.x + fdir * (t.w * 0.42);
  const gy = t.container.y + 2;
  const gh = Math.max(150, t.h * 0.95);
  // zincir bağı
  c.sfx('chainTether');
  const from = { x: home.x + toward * (a.w * 0.45 + 22), y: home.y - a.h * 0.5 };
  const to = { x: gx, y: gy - gh * 0.5 };
  const chain = c.scene.add.graphics().setDepth(DEPTH + 26);
  const sag = Math.min(70, Math.abs(to.x - from.x) * 0.12 + 20);
  const drawChain = (reveal: number, pulse: number) => {
    chain.clear();
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(6, Math.round(len / 14));
    for (let i = 0; i <= n * reveal; i++) {
      const u = i / n;
      const x = from.x + (to.x - from.x) * u;
      const y = from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * sag;
      const glow = 0.5 + 0.5 * Math.sin(u * 9 - pulse * 10);
      chain.fillStyle(0x15101c, 0.6).fillRect(snap(x) - 5, snap(y) - 3, 10, 8);
      if (i % 2) chain.fillStyle(0x7d9cc4, 1).fillRect(snap(x) - 4, snap(y) - 2, 8, 4);
      else chain.fillStyle(0xa8c4e8, 1).fillRect(snap(x) - 2, snap(y) - 4, 4, 8);
      chain.fillStyle(0xffffff, 0.35 + 0.55 * glow * pulse).fillRect(snap(x) - 1, snap(y) - 1, 2, 2);
    }
  };
  await counter(c.scene, slow(260), (u) => drawChain(u, 0), 'Quad.easeOut');
  // hayalet kule kalkanı dostun önünde yerden yükselir
  const ghost = towerSprite(c.scene, gx, gy, gh, t.container.depth + 2, true).setAlpha(0.75);
  const fill = towerSprite(c.scene, gx, gy, gh, t.container.depth + 1, true).setTintFill(0x7d9cc4).setAlpha(0.32);
  for (const img of [ghost, fill]) {
    const sy = img.scaleY;
    img.setScale(img.scaleX, sy * 0.05);
    c.scene.tweens.add({ targets: img, scaleY: sy, duration: slow(260), ease: 'Back.easeOut' });
  }
  void ring(c.scene, gx, gy - 4, { r: 80, flat: 0.3, n: 18, colors: STEELBLUE, dur: 420, size: 9 });
  dustCloud(c.scene, gx, gy - 2, { n: 2, spread: 30, rise: 16, size: [30, 50], life: 520 });
  shake(c.scene, 90, 0.0025);
  await wait(c.scene, slow(200));
  burst(c.scene, gx, gy - gh * 0.55, { colors: STEELBLUE, n: 10, speed: [40, 160], gravity: -60, life: [400, 700], size: [5, 9] });
  // iki nabız: bağ ve hayalet birlikte parlar
  void counter(c.scene, slow(560), (u) => drawChain(1, Math.sin(u * Math.PI * 2) ** 2));
  c.scene.tweens.add({ targets: ghost, alpha: { from: 0.75, to: 0.45 }, duration: slow(140), yoyo: true, repeat: 1 });
  await wait(c.scene, slow(300));
  // söner: hayalet dostun üstüne yumuşakça oturur, adım geri
  c.scene.tweens.add({ targets: [ghost, fill], alpha: 0, scaleX: ghost.scaleX * 0.9, y: gy - 6, delay: slow(260), duration: slow(380), onComplete: () => { ghost.destroy(); fill.destroy(); } });
  c.scene.tweens.add({ targets: chain, alpha: 0, delay: slow(200), duration: slow(300), onComplete: () => chain.destroy() });
  c.scene.tweens.add({ targets: a.container, x: home.x, delay: slow(160), duration: slow(220), ease: 'Quad.easeInOut', onComplete: () => a.play('idle') });
};

/**
 * Hücre levhası: hücre dörtgeni `lift` piksel kabarmış taş levha olarak çizilir (yan yüzler koyu, üst yüz taş grisi, köşeler biraz farklı
 * kalkar); üst yüzde iki taşı ayıran derz çizgisi ve sabit taş benekleri (`specks`: dörtgen içi u,v) var.
 */
function drawSlab(g: Phaser.GameObjects.Graphics, q: Quad, lift: number, tilt: number[], alpha: number, specks: Array<[number, number, number]>): void {
  if (lift <= 0.5) return;
  const top = q.map((p, i) => ({ x: p.x, y: p.y - lift * (1 + (tilt[i] ?? 0)) }));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.fillStyle(i % 2 ? 0x2a2c33 : 0x3f424b, alpha).fillPoints([q[i]!, q[j]!, top[j]!, top[i]!], true);
  }
  g.fillStyle(0x7f8693, alpha).fillPoints(top, true);
  for (const [u, v, k] of specks) {
    const p = quadAt(top, u, v);
    g.fillStyle(k > 0.6 ? 0xb7bdc8 : k > 0.3 ? 0x98a2b4 : 0x5b6579, alpha).fillRect(snap(p.x) - 2, snap(p.y) - 1, 4, 2);
  }
  // derz: levhayı iki taşa ayıran kırık çizgi
  const m1 = quadAt(top, 0.5, 0);
  const m2 = quadAt(top, 0.45, 0.55);
  const m3 = quadAt(top, 0.55, 1);
  g.lineStyle(2, 0x2a2c33, alpha).lineBetween(m1.x, m1.y, m2.x, m2.y).lineBetween(m2.x, m2.y, m3.x, m3.y);
  g.lineStyle(2, 0x15101c, alpha * 0.9);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.lineBetween(top[i]!.x, top[i]!.y, top[j]!.x, top[j]!.y);
  }
  g.lineStyle(2, 0xd7dce6, alpha * 0.7).lineBetween(top[0]!.x, top[0]!.y, top[3]!.x, top[3]!.y);
}

/** Taş çatlağı: a'dan b'ye zikzak, koyu çekirdek + açık kenar; iki yana kısa dallar. */
function stoneCrack(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, w = 4): void {
  const n = Math.max(3, Math.round(ptDist(a, b) / 14));
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p = i === n ? b : { x: a.x + (b.x - a.x) * u + rnd(-7, 7), y: a.y + (b.y - a.y) * u + rnd(-3, 3) };
    g.lineStyle(w + 2, 0x7a6a58, 0.55).lineBetween(prev.x, prev.y + 1, p.x, p.y + 1);
    g.lineStyle(w, 0x15101c, 0.95).lineBetween(prev.x, prev.y, p.x, p.y);
    if (Math.random() < 0.4) {
      const an = Math.atan2(p.y - prev.y, p.x - prev.x) + (Math.random() < 0.5 ? 1 : -1) * rnd(0.6, 1.2);
      g.lineStyle(Math.max(2, w - 2), 0x15101c, 0.85).lineBetween(p.x, p.y, p.x + Math.cos(an) * rnd(8, 16), p.y + Math.sin(an) * rnd(4, 8));
    }
    prev = p;
  }
}

/**
 * Tremor Slam (row, melee): Defender sıranın başına (ekranda en üst şeridin önüne) koşar; kule kalkanını başının üstüne kaldırır (plaka zırh
 * gıcırtısı + efor sesi), kısa bir duraksamadan sonra kalkanı sivri ucuyla toprağa çakar (çok alçak gümleme, kısa hitstop, güçlü sarsıntı).
 * Sarsıntı sıra boyunca hücreden hücreye ilerler: her hücrenin zemin levhası taş blok gibi kabarıp düşer, çevresinden toz fışkırır, levhaya
 * dallanan taş çatlakları işlenir; üstündeki düşman levhayla birlikte sarsılıp sıçrar (hasar rakamı dalga ona değdiği an). Çatlaklar bir
 * süre zeminde kalıp solar; kalkan topraktan çekilir, Defender evine döner.
 */
const tremor2 = async (c: VfxCtx) => {
  const a = c.actor;
  const slots = [...fxSlots(c)].sort((p, q) => cellMid(c.board, p).y - cellMid(c.board, q).y);
  const head = slots[0] !== undefined ? cellMid(c.board, slots[0]) : (c.centerPos ?? feet(a));
  const dir = head.x >= a.container.x ? 1 : -1;
  const stand = { x: head.x - dir * (a.w * 0.5 + 78), y: head.y + 4 };
  await a.approach(stand.x, stand.y, 190);
  // kalkanı kaldırır
  c.sfx('plateCreak');
  a.play('cast');
  const impact = { x: stand.x + dir * (a.w * 0.5 + 24), y: head.y + 6 };
  const sh = towerSprite(c.scene, impact.x, impact.y - 120, 132, impact.y + 2).setAlpha(0); // karakterlerle zemin y'sine göre sıralanır
  c.scene.tweens.add({ targets: sh, alpha: 1, y: impact.y - 150, duration: slow(220), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: a.container, y: stand.y - 12, scaleY: 1.04, duration: slow(220), ease: 'Quad.easeOut' });
  await wait(c.scene, slow(140));
  c.sfx('heaveGrunt');
  await wait(c.scene, slow(150));
  // çakış
  a.play('attack');
  c.scene.tweens.add({ targets: a.container, y: stand.y, scaleY: 0.93, duration: slow(90), ease: 'Quad.easeIn', onComplete: () => c.scene.tweens.add({ targets: a.container, scaleY: 1, duration: slow(160) }) });
  await travel(c.scene, sh, { x: impact.x, y: impact.y + 14 }, 95, { ease: 'in' });
  c.sfx('shieldPlant');
  shake(c.scene, 340, 0.012);
  flash(c.scene, '#e8eef8', 0.12, 160);
  void ring(c.scene, impact.x, impact.y, { r: 150, flat: 0.3, n: 28, colors: ['#ffffff', '#d7dce6', ...DUST], dur: 460, size: 12 });
  burst(c.scene, impact.x, impact.y - 10, { colors: STONE, n: 20, speed: [160, 460], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1000, life: [450, 900], size: [8, 18] });
  burst(c.scene, impact.x, impact.y - 30, { colors: ['#ffffff', '#ffe9b0'], n: 6, speed: [100, 260], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 600, life: [160, 300], size: [5, 8] });
  dustCloud(c.scene, impact.x, impact.y, { n: 5, spread: 70, rise: 60, size: [50, 90], life: 900 });
  // kalkan toprakta titrer
  c.scene.tweens.add({ targets: sh, x: impact.x + 3, duration: slow(30), yoyo: true, repeat: 5 });
  const crackG = c.scene.add.graphics().setDepth(FLOOR_FX + 2);
  stoneCrack(crackG, { x: impact.x, y: impact.y }, { x: impact.x - 60, y: impact.y + 10 }, 4);
  stoneCrack(crackG, { x: impact.x, y: impact.y }, { x: impact.x + dir * 30, y: impact.y - 14 }, 3);
  await wait(c.scene, slow(80)); // hitstop: ağırlık
  // sarsıntı dalgası: çarpma noktasından sıranın hücreleri boyunca
  c.sfx('groundHeave');
  const path = [impact, ...slots.map((s) => cellMid(c.board, s))];
  const reachedAt = slots.map((_, i) => polyLen(path.slice(0, i + 2)));
  const total = Math.max(1, polyLen(path));
  const STEP = 150;
  const WAVE = STEP * Math.max(1, slots.length) + 60;
  const arrive = new Map<number, ReturnType<typeof deferred>>(slots.map((s) => [s, deferred()]));
  const slabG = c.scene.add.graphics().setDepth(FLOOR_FX + 3);
  const slabs = slots.map((s) => ({ s, q: quadOf(c.board, s, 0.94), t0: -1, tilt: [rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-0.35, 0.35)], specks: Array.from({ length: 14 }, (): [number, number, number] => [rnd(0.1, 0.9), rnd(0.1, 0.9), Math.random()]) }));
  const LIFT = 420;
  const redraw = () => {
    slabG.clear();
    const now = c.scene.time.now;
    for (const sl of slabs) {
      if (sl.t0 < 0) continue;
      const k = (now - sl.t0) / slow(LIFT);
      if (k >= 1) continue;
      // hızlı kalkış, ağır iniş + küçük sekme
      const h = k < 0.18 ? (k / 0.18) * 18 : k < 0.7 ? 18 * (1 - (k - 0.18) / 0.52) : 4 * Math.sin(((k - 0.7) / 0.3) * Math.PI);
      drawSlab(slabG, sl.q, h, sl.tilt, 1, sl.specks);
    }
  };
  const ticker = () => redraw();
  c.scene.events.on('update', ticker);
  let lastTip = 0;
  void counter(c.scene, slow(WAVE), (u) => {
    const d = total * u;
    // dalganın ucunda yerden taş kırıntısı
    if (d - lastTip > 24) {
      lastTip = d;
      const tip = pointAt(path, d);
      burst(c.scene, tip.x, tip.y - 4, { colors: STONE, n: 2, speed: [80, 220], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 900, life: [300, 520], size: [7, 12] });
    }
    slabs.forEach((sl, i) => {
      if (sl.t0 >= 0 || d < reachedAt[i]!) return;
      sl.t0 = c.scene.time.now;
      const m = cellMid(c.board, sl.s);
      const q = sl.q;
      // levhanın kenarlarından toz fışkırır, levhaya çatlaklar işlenir
      for (const p of q) dustCloud(c.scene, p.x, p.y, { n: 1, spread: 10, rise: 34, size: [34, 56], life: 700 });
      stoneCrack(crackG, inQuad(q, 0.3), q[0]!, 3);
      stoneCrack(crackG, m, { x: (q[2]!.x + q[3]!.x) / 2, y: (q[2]!.y + q[3]!.y) / 2 }, 3);
      if (Math.random() < 0.7) stoneCrack(crackG, m, { x: (q[1]!.x + q[2]!.x) / 2, y: (q[1]!.y + q[2]!.y) / 2 }, 2);
      burst(c.scene, m.x, m.y - 6, { colors: STONE, n: 8, speed: [120, 360], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 1000, life: [400, 750], size: [7, 14] });
      for (const t of c.targets.filter((v) => slotOfView(v) === sl.s)) {
        c.scene.tweens.add({ targets: t.container, y: t.container.y - 22, duration: slow(80), yoyo: true, ease: 'Quad.easeOut' });
        hit(c.scene, t.container.x, t.container.y - t.h * 0.35, ['#ffffff', '#d7dce6', '#98a2b4'], 0.8);
      }
      shake(c.scene, 140, 0.005);
      arrive.get(sl.s)?.resolve();
    });
  }).then(() => {
    for (const d of arrive.values()) d.resolve();
    // levhalar otursun, sonra çatlaklar solar; kalkan topraktan çekilir, Defender döner
    void wait(c.scene, slow(LIFT)).then(() => {
      c.scene.events.off('update', ticker);
      slabG.destroy();
    });
    c.scene.tweens.add({ targets: crackG, alpha: 0, delay: slow(900), duration: slow(800), onComplete: () => crackG.destroy() });
    c.scene.tweens.add({ targets: sh, y: sh.y - 40, alpha: 0, delay: slow(120), duration: slow(260), ease: 'Quad.easeOut', onComplete: () => sh.destroy() });
    void wait(c.scene, slow(200)).then(() => a.returnHome(300));
  });
  await hitsAt(c, (t) => arrive.get(slotOfView(t))?.promise ?? Promise.resolve(), wait(c.scene, slow(WAVE)));
};

/**
 * Fist Crush (3 rastgele düşman): Defender çömelip ağır zırhıyla sıçrar; olay sırasındaki her hedefin yanına kavisli bir sıçrayışla iner ve
 * inerken çelik zırh eldiveni hedefin başına yukarıdan iner (hedef ezilir gibi basılır, çelik kıvılcımı, yerde çatlak ve toz halkası);
 * sonraki hedefe sıçrar, üçüncüden sonra evine geri sıçrar. Her hasar rakamı kendi inişiyle eş zamanlı. Gökten yumruk (eski) ve yürüyerek
 * vuruş (Warrior/Treant) yerine: ağır zırhlı bir dövüşçünün tahtada sıçrayarak dolaşması.
 */
const fistcrush2 = async (c: VfxCtx) => {
  const a = c.actor;
  const order = c.targets;
  if (!order.length) return;
  const arrive = order.map(() => deferred());
  void (async () => {
    // çömelme
    a.play('cast');
    await new Promise<void>((resolve) => c.scene.tweens.add({ targets: a.container, scaleY: 0.9, duration: slow(110), yoyo: true, onComplete: () => resolve() }));
    a.container.setDepth(3500);
    let last = 0;
    for (let i = 0; i < order.length; i++) {
      const t = order[i]!;
      const stand = standNear(a, t);
      const from = { x: a.container.x, y: a.container.y };
      const dur = i === 0 ? 300 : 250;
      const height = 120 + Math.min(80, Math.abs(stand.x - from.x) * 0.12);
      c.sfx('armorLeap');
      dustCloud(c.scene, from.x, from.y - 2, { n: 2, spread: 30, rise: 16, size: [34, 54], life: 520 });
      a.play('attack');
      const p = spot(t);
      const topY = t.container.y - t.h - 10;
      const fist = sprite(c.scene, 'gauntlet', '#8fb0d8', p.x - stand.dir * 8, topY - 120, 120, DEPTH + 45).setAlpha(0);
      if (stand.dir < 0) fist.setFlipX(true);
      await counter(c.scene, slow(dur), (u) => {
        a.container.setPosition(snap(from.x + (stand.x - from.x) * u), snap(from.y + (stand.y - from.y) * u - Math.sin(u * Math.PI) * height));
        if (c.scene.time.now - last > slow(45)) {
          last = c.scene.time.now;
          a.afterimage(0x7d9cc4, 0.4, 200);
        }
        if (u > 0.55) {
          const k = (u - 0.55) / 0.45;
          fist.setAlpha(Math.min(1, k * 2.5)).setY(snap(topY - 120 + (p.y - t.h * 0.12 - (topY - 120)) * k * k)).setRotation(-0.55 * stand.dir * (1 - k));
        }
      });
      // iniş: eldiven başa iner
      c.sfx('gauntletCrush');
      arrive[i]!.resolve();
      shake(c.scene, 160, 0.008);
      a.container.setScale(1, 0.92);
      c.scene.tweens.add({ targets: a.container, scaleY: 1, duration: slow(140) });
      c.scene.tweens.add({ targets: t.container, scaleY: 0.84, scaleX: 1.06, duration: slow(60), yoyo: true, ease: 'Quad.easeOut', onComplete: () => t.container.setScale(1) });
      hit(c.scene, p.x, p.y - t.h * 0.18, ['#ffffff', '#d7dce6', '#a8c4e8'], 1.2);
      burst(c.scene, p.x, p.y - t.h * 0.2, { colors: ['#ffffff', '#ffe9b0', '#d7dce6'], n: 10, speed: [140, 380], gravity: 700, life: [200, 380], size: [5, 9] });
      const f = feet(t);
      cracks(c.scene, f.x, f.y - 4, { len: 90, n: 5, dur: 420 });
      void ring(c.scene, f.x, f.y - 2, { r: 90, flat: 0.3, n: 18, colors: DUST, dur: 380, size: 10 });
      burst(c.scene, f.x, f.y - 8, { colors: STONE, n: 8, speed: [100, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [350, 650], size: [7, 13] });
      c.scene.tweens.add({ targets: fist, alpha: 0, y: fist.y + 8, delay: slow(90), duration: slow(200), onComplete: () => fist.destroy() });
      await wait(c.scene, slow(110));
    }
    // eve dönüş sıçrayışı
    const from = { x: a.container.x, y: a.container.y };
    const home = a.home;
    c.sfx('armorLeap');
    await counter(c.scene, slow(300), (u) => a.container.setPosition(snap(from.x + (home.x - from.x) * u), snap(from.y + (home.y - from.y) * u - Math.sin(u * Math.PI) * 110)));
    dustCloud(c.scene, home.x, home.y - 2, { n: 2, spread: 30, rise: 14, size: [34, 54], life: 520 });
    shake(c.scene, 90, 0.003);
    await a.returnHome(1);
  })().catch((err: unknown) => console.error('vfx', err));
  await hitsAt(c, (t) => arrive[order.indexOf(t)]?.promise ?? Promise.resolve(), wait(c.scene, slow(2400)));
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

/** Drain Field'ın yumuşak mor zemin ışıması (yassı elips, hücre başına). */
const voidGlowTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:voidglow', 48, 24, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
    if (d >= 1) return null;
    return { c: d < 0.3 ? '#e3ccff' : d < 0.65 ? '#b872ff' : '#7d3fb0', a: (1 - d) ** 1.25 };
  });

/** Mor sıvı sütunu dokusu: ortası açık, kenarları koyu mor; üst ucu yumuşakça erir. */
const voidSurgeTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:voidsurge', 16, 48, (x, y) => {
    const u = Math.abs((x + 0.5) / 16 - 0.5) * 2;
    const body = (1 - u ** 1.5) ** 1.1;
    const top = Math.min(1, (y + 1) / 26);
    return { c: u < 0.3 ? '#e3ccff' : u < 0.66 ? '#b872ff' : '#7d3fb0', a: body * top };
  });

/** Hücreden mor sıvının kısa bir sütun hâlinde yükselip geri çökmesi (Drain Field patlaması). */
function voidSurge(scene: Phaser.Scene, x: number, y: number, w: number): void {
  const img = scene.add.image(x, y + 4, voidSurgeTexture(scene)).setOrigin(0.5, 1).setDisplaySize(w, 120).setDepth(DEPTH + 6).setAlpha(0.85);
  const sy = img.scaleY;
  img.setScale(img.scaleX, sy * 0.1);
  scene.tweens.add({ targets: img, scaleY: sy * rnd(0.9, 1.25), duration: slow(160), ease: 'Quad.easeOut', yoyo: true, hold: slow(60), onComplete: () => img.destroy() });
  // çöken sıvıdan damlalar
  for (let i = 0; i < 3; i++) {
    const d = sprite(scene, 'manadrop', '#9b59d0', x + rnd(-w * 0.3, w * 0.3), y - rnd(60, 100), rnd(22, 32), DEPTH + 7).setRotation(Math.PI);
    scene.tweens.add({ targets: d, y: y - 4, duration: slow(rnd(260, 360)), delay: slow(200), ease: 'Quad.easeIn', onComplete: () => d.destroy() });
  }
}

/**
 * Drain Field (rect 3x3): Anti-Mage seçilen alanı büyüyle mühürler (projectile yok). Yerde, tıklanan hücreden başlayıp şeklin hücrelerine
 * sızarak yavaşça büyüyen mor sıvı alan açılır (hücre başına yumuşak mor ışıma + birleşik hücre plakası ve dış hat); dolunca her hücreden
 * mor sıvı kısa bir sütun hâlinde yükselip çöker; alandaki her karakterin bedeninden Void Strike'ın mana damlaları havaya yükselip
 * uzayarak buharlaşır ve etkilenen her karakterin silüeti sönen mor bir ışımayla kalır.
 */
const drainfield = async (c: VfxCtx) => {
  c.sfx('voidSuction');
  await c.windUp('#9b59d0');
  const slots = fxSlots(c);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const center = midSlot !== undefined ? cellMid(c.board, midSlot) : (c.centerPos ?? feet(c.actor));
  const GROW = 900; // alanın yavaşça büyüme süresi (ms)
  // 1) yerde yavaşça büyüyen mor alan, ŞEKLİN HÜCRELERİNE oturur: tıklanan hücreden başlayıp komşu hücrelere sızar (her hücre kendi
  // merkezinden büyüyen mor sıvı; komşular kaynaşınca birleşik plaka olur). Her hücrede Drain Field'ın yumuşak mor ışıması (yassı elips)
  // nabız atar; birleşik dış hat alan doldukça belirir.
  const quads = slots.map((s) => ({ s, q: quadOf(c.board, s, 1), m: cellMid(c.board, s) }));
  const dist = quads.map((k) => Math.hypot(k.m.x - center.x, k.m.y - center.y));
  const span = Math.max(1, ...dist);
  const { R, L } = gridSteps(c.board);
  const gw = (Math.abs(R.x) + Math.abs(L.x)) * 1.05;
  const gh = Math.abs(L.y) * 2.0;
  const pool = c.scene.add.graphics().setDepth(FLOOR_FX);
  const edge = c.scene.add.graphics().setDepth(FLOOR_FX + 1);
  const glows = quads.map((k) => c.scene.add.image(k.m.x, k.m.y, voidGlowTexture(c.scene)).setDisplaySize(gw, gh).setAlpha(0).setDepth(FLOOR_FX + 2).setBlendMode(Phaser.BlendModes.ADD));
  const gBase = glows.map((g) => ({ x: g.scaleX, y: g.scaleY }));
  const edges = outlineOf(c.board, slots);
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x1a0630, 0).setDepth(DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.3, duration: slow(GROW) });
  const drawPool = (u: number, hot = 0) => {
    pool.clear();
    quads.forEach((k, i) => {
      const v = Math.max(0, Math.min(1, (u - (dist[i]! / span) * 0.5) / 0.5));
      const e = 1 - (1 - v) ** 2;
      if (v > 0) {
        const wob = 1 + 0.03 * Math.sin(u * 24 + i);
        pool.fillStyle(hot ? 0xb872ff : 0x9b59d0, (0.26 + 0.34 * hot) * v).fillPoints(scaleQuad(k.q, (0.1 + 0.9 * e) * wob), true);
        pool.fillStyle(hot ? 0xe3ccff : 0x7d3fb0, (0.34 + 0.08 * Math.sin(u * 24) + 0.4 * hot) * v).fillPoints(scaleQuad(k.q, (0.1 + 0.9 * e) * 0.68 * wob), true);
      }
      glows[i]!.setAlpha((0.55 + 0.45 * hot) * v).setScale(gBase[i]!.x * (0.25 + 0.75 * e), gBase[i]!.y * (0.25 + 0.75 * e));
    });
    edge.clear().lineStyle(4, 0xb872ff, 0.9 * Math.max(0, (u - 0.45) / 0.55));
    for (const [a, b] of edges) edge.lineBetween(a.x, a.y, b.x, b.y);
  };
  await counter(
    c.scene,
    slow(GROW),
    (u) => {
      drawPool(u);
      // sıvıdan kabarcık/damla yükselir
      if (Math.random() < 0.45) {
        const p = inQuad(pick(quads).q, 0.8);
        burst(c.scene, p.x, p.y, { colors: VOIDPURPLE, n: 1, speed: [20, 70], angle: [-Math.PI, 0], gravity: -60, life: [500, 900], size: [6, 10] });
      }
    },
    'Quad.easeIn',
  );
  // 2) alan dolunca tüm hücreler birden parlar: her hücreden mor sıvı kısa bir sütun hâlinde yükselip çöker, dış hat boyunca kıvılcım koşar
  c.sfx('voidPulse');
  flash(c.scene, '#b872ff', 0.4, 380);
  shake(c.scene, 240, 0.007);
  drawPool(1, 1);
  for (const k of quads) {
    voidSurge(c.scene, k.m.x, k.m.y, Math.abs(R.x) * 0.55);
    for (let j = 0; j < 2; j++) {
      const p = inQuad(k.q, 0.85);
      burst(c.scene, p.x, p.y - 4, { colors: [...VOIDPURPLE, '#ffffff'], n: 5, speed: [120, 420], angle: [-Math.PI, 0], gravity: 500, life: [400, 800], size: [6, 12] });
    }
  }
  for (const [a, b] of edges) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    burst(c.scene, m.x, m.y, { colors: [...VOIDPURPLE, '#ffffff'], n: 2, speed: [40, 140], angle: [-Math.PI, 0], gravity: 200, life: [300, 560], size: [6, 10] });
  }
  c.scene.tweens.add({ targets: [pool, edge, ...glows], alpha: 0, duration: slow(750), ease: 'Quad.easeIn', onComplete: () => { pool.destroy(); edge.destroy(); glows.forEach((g) => g.destroy()); } });
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

// ---------------------------------------------------------------------------------------------------------------------
// GEOMETER (haritacı büyücü; AOE şekil skill'leri)
//
// Ortak dil: Geometer asasını yere vurur, ayağının dibinde küçük bir rün belirir; tebeşir-ışık kalemi zemin boyunca şeklin
// başlangıç noktasına koşar ve şeklin DIŞ HATTINI hücre kenarları boyunca çizer (zemindeki gerçek ızgara: her hücre, komşu
// yuvalara olan kaymalarla kurulan bir paralelkenardır). Sonra kapsanan her hücreye rün karosu basılır ve hücre arcane ışıkla
// dolar; patlama şekle özgüdür (süpüren cetvel, ışık mızrağı, düşen taş mühürler, artı ışınları). Hasar rakamları her hedefe
// ışığın değdiği anda çıkar (`syncHits`: ilk hedefte Promise çözülür, sonrakiler `gate` ile kendi anlarını bekler).

type Pt = { x: number; y: number };
interface GridCell extends Pt {
  slot: number;
  r: number;
  l: number;
}
interface Survey {
  /** Kapsanan hücreler (yuva sırasıyla); konum = zemindeki hücre merkezi. */
  cells: GridCell[];
  /** Bir sıra (R) / bir şerit (L) ilerleyince ekrandaki kayma: hücre paralelkenarının kenar vektörleri. */
  R: Pt;
  L: Pt;
  /** Şeklin dış hattı (kapalı çokgen, köşeler sırayla). */
  loop: Pt[];
  /** İç (iki kapsanan hücrenin paylaştığı) kenarlar. */
  inner: Array<[Pt, Pt]>;
  /** Anchor (tıklanan) hücre; yoksa ilk hücre. */
  anchor: GridCell;
}

const GEO_CHALK = ['#ffffff', '#f4ecff', '#e3ccff'];
const GEO_ARCANE = ['#ffffff', '#e3ccff', '#c9a8ff', '#b07cff'];
/** Zemin katmanları: karakterlerin (derinlik = ayak y'si, 785+) ALTINDA; efekt parıltıları DEPTH üstünde. */
const FLOOR = { fill: 43, glow: 44, core: 45, rune: 46, bar: 47 };
const CHALK_STEP = 4;

const ptDist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const polyLen = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + ptDist(pts[i - 1]!, p) : 0), 0);

/** Açık çoklu çizgide `d` mesafesindeki nokta. */
function pointAt(pts: Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = ptDist(a, b);
    if (left <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

/** `p`'nin a->b doğrusu üzerindeki ilerlemesi (0 = a, 1 = b). */
const along = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1);
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Şeklin zemindeki ızgarası. Hücreler motorun şekil hesabından (`shapeCells`, hedef tahtasına göre ayna dahil) gelir; yoksa
 * `VfxCtx.cells` konumlarından yuvaya eşlenir. Konumlar `battle-layout.json` yuvalarından okunur (BattleScene.cellPos ile aynı).
 */
function survey(c: VfxCtx): Survey {
  const slots = (c.board === 'party' ? layout.partySlots : layout.enemySlots) as Pt[];
  const { rows, lanes } = content.GRID;
  const at = (slot: number): GridCell => ({ slot, r: Math.floor(slot / lanes), l: slot % lanes, x: slots[slot]?.x ?? 0, y: (slots[slot]?.y ?? 0) - 4 });
  let list: number[] = c.slots?.length ? [...c.slots] : [];
  if (!list.length && c.skill.area?.shape && c.center !== undefined) list = shapeCells(c.skill.area, c.center, c.board, content.formulas.formation);
  if (!list.length && c.cells.length)
    list = c.cells.map((q) => slots.reduce((best, s, i) => (ptDist(s, q) < ptDist(slots[best]!, q) ? i : best), 0));
  if (!list.length) list = c.targets.map((t) => t.combatant.slot);
  list = [...new Set(list)].sort((a, b) => a - b);
  const cells = list.map(at);
  const R = { x: slots[lanes]!.x - slots[0]!.x, y: slots[lanes]!.y - slots[0]!.y };
  const L = { x: slots[1]!.x - slots[0]!.x, y: slots[1]!.y - slots[0]!.y };
  const corner = (q: GridCell, dr: number, dl: number): Pt => ({ x: q.x + (dr * R.x) / 2 + (dl * L.x) / 2, y: q.y + (dr * R.y) / 2 + (dl * L.y) / 2 });
  const has = (r: number, l: number) => r >= 0 && r < rows && l >= 0 && l < lanes && list.includes(r * lanes + l);
  const outer: Array<[Pt, Pt]> = [];
  const inner: Array<[Pt, Pt]> = [];
  for (const q of cells) {
    const edges: Array<[number, number, Pt, Pt]> = [
      [q.r - 1, q.l, corner(q, -1, -1), corner(q, -1, 1)],
      [q.r + 1, q.l, corner(q, 1, -1), corner(q, 1, 1)],
      [q.r, q.l - 1, corner(q, -1, -1), corner(q, 1, -1)],
      [q.r, q.l + 1, corner(q, -1, 1), corner(q, 1, 1)],
    ];
    for (const [nr, nl, a, b] of edges) {
      if (!has(nr, nl)) outer.push([a, b]);
      else if (nr * lanes + nl > q.slot) inner.push([a, b]); // paylaşılan kenar bir kez
    }
  }
  // dış kenarları uç uca ekleyip kapalı çokgen kur (yuva aralıkları 59/60 px gibi 1 px oynayabilir: uçlar yakınlıkla eşlenir)
  const near = (a: Pt, b: Pt) => ptDist(a, b) < 4;
  const loop: Pt[] = [];
  if (outer.length) {
    const used = new Set<number>();
    let cur = outer[0]![1];
    loop.push(outer[0]![0]);
    used.add(0);
    while (used.size < outer.length) {
      loop.push(cur);
      const i = outer.findIndex((e, k) => !used.has(k) && (near(e[0], cur) || near(e[1], cur)));
      if (i < 0) break;
      used.add(i);
      const e = outer[i]!;
      cur = near(e[0], cur) ? e[1] : e[0];
    }
  }
  const anchor = cells.find((q) => q.slot === c.center) ?? cells[0] ?? at(0);
  return { cells, R, L, loop, inner, anchor };
}

/** Kapalı çokgeni `start` noktasından başlayan (ve orada biten) açık çoklu çizgiye çevirir. */
function loopFrom(loop: Pt[], start: Pt): Pt[] {
  if (loop.length < 2) return [start, start];
  let best = 0;
  let bestD = Infinity;
  let proj = start;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const k = Math.max(0, Math.min(1, along(start, a, b)));
    const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const d = ptDist(p, start);
    if (d < bestD) {
      bestD = d;
      best = i;
      proj = p;
    }
  }
  const out: Pt[] = [proj];
  for (let k = 1; k <= loop.length; k++) out.push(loop[(best + k) % loop.length]!);
  out.push(proj);
  return out;
}

/**
 * Tebeşir-ışık mürekkebi: zemine 4 piksellik tebeşir taneleri basar (açık mor/beyaz, arada küçük boşluklu: tebeşir dokusu),
 * altında yumuşak arcane ışıma. Hepsi iki Graphics'te birikir (kare başına yeniden çizim yok).
 */
class ChalkInk {
  readonly glow: Phaser.GameObjects.Graphics;
  readonly core: Phaser.GameObjects.Graphics;
  private n = 0;
  constructor(
    private scene: Phaser.Scene,
    private hex: string,
    private strength = 1,
  ) {
    this.glow = scene.add.graphics().setDepth(FLOOR.glow);
    this.core = scene.add.graphics().setDepth(FLOOR.core);
  }
  dot(p: Pt): void {
    const i = this.n++;
    const x = snap(p.x);
    const y = snap(p.y);
    if (i % 2 === 0) this.glow.fillStyle(color(this.hex), 0.42 * this.strength).fillRect(x - 10, y - 6, 20, 12);
    if (i % 4 === 0) this.glow.fillStyle(color(this.hex), 0.16 * this.strength).fillRect(x - 16, y - 10, 32, 20);
    if ((i * 37) % 23 < 2) return; // tebeşir tanesi boşluğu
    this.core.fillStyle(color(GEO_CHALK[(i * 7) % 3]!), (0.8 + ((i * 13) % 5) * 0.05) * this.strength).fillRect(x - 3, y - 3, 6, 6);
    if (i % 3 === 0) this.core.fillStyle(color(this.hex), 0.9 * this.strength).fillRect(x - 3 + ((i * 5) % 3) * 2, y + 3, 2, 2);
  }
  /** a -> b doğrusunu tek seferde basar. */
  line(a: Pt, b: Pt): void {
    const len = ptDist(a, b);
    for (let s = 0; s <= len; s += CHALK_STEP) this.dot({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len });
  }
  clear(): void {
    this.glow.clear();
    this.core.clear();
    this.n = 0;
  }
  fade(delay: number, dur: number): void {
    this.scene.tweens.add({ targets: [this.glow, this.core], alpha: 0, delay: slow(delay), duration: slow(dur), onComplete: () => (this.glow.destroy(), this.core.destroy()) });
  }
}

/** Çoklu çizgi boyunca ilerleyen kalem: `to(d)` aradaki yolu mürekkeple basar, kalemin ucunu döndürür. */
class ChalkPen {
  readonly len: number;
  private done = -CHALK_STEP;
  constructor(
    private pts: Pt[],
    private ink: ChalkInk,
    private step = CHALK_STEP,
  ) {
    this.len = polyLen(pts);
  }
  to(d: number): Pt {
    const end = Math.min(this.len, d);
    for (let s = this.done + this.step; s <= end; s += this.step) {
      this.ink.dot(pointAt(this.pts, s));
      this.done = s;
    }
    return pointAt(this.pts, end);
  }
}

/** Kısa, yumuşak arcane ışık sütunu (hücre parlaması): yerden yükselir, söner. */
const arcanePillarTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:arcanepillar', 16, 64, (x, y) => {
    const u = Math.abs((x + 0.5) / 16 - 0.5) * 2;
    const body = (1 - u ** 1.6) ** 1.1;
    const top = Math.min(1, (y + 1) / 44);
    return { c: u < 0.3 ? '#ffffff' : u < 0.66 ? '#e3ccff' : '#b07cff', a: body * top };
  });

function arcanePillar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, dur = 520): void {
  const img = scene.add.image(x, y, arcanePillarTexture(scene)).setOrigin(0.5, 1).setDisplaySize(w, h).setDepth(DEPTH + 8).setAlpha(0);
  const sy = img.scaleY;
  img.setScale(img.scaleX, sy * 0.25);
  scene.tweens.add({ targets: img, alpha: 0.8, scaleY: sy, duration: slow(110), ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: img, alpha: 0, scaleX: img.scaleX * 0.4, delay: slow(130), duration: slow(dur), ease: 'Quad.easeIn', onComplete: () => img.destroy() });
}

/** Hücre dolguları ve rün karoları (zemine basılı); `flare` hücreyi parlatır (vuruş anı). */
class SurveyMarks {
  private fills = new Map<number, Phaser.GameObjects.Graphics>();
  private runes = new Map<number, Phaser.GameObjects.Image>();
  private all: Phaser.GameObjects.GameObject[] = [];
  constructor(
    private c: VfxCtx,
    private s: Survey,
    private hex: string,
  ) {}
  private runeW(): number {
    return Math.min(Math.abs(this.s.R.x) || 160, 160) * 0.62;
  }
  /** Hücreyi arcane ışıkla doldurur ve rün karosunu basar. */
  stamp(q: GridCell, delay = 0): void {
    const scene = this.c.scene;
    void wait(scene, slow(delay)).then(() => {
      const k = 0.84;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dr, dl]) => new Phaser.Math.Vector2(q.x + (dr! * this.s.R.x * k) / 2 + (dl! * this.s.L.x * k) / 2, q.y + (dr! * this.s.R.y * k) / 2 + (dl! * this.s.L.y * k) / 2));
      const g = scene.add.graphics().setDepth(FLOOR.fill).setAlpha(0);
      g.fillStyle(color(this.hex), 1).fillPoints(pts, true);
      scene.tweens.add({ targets: g, alpha: 0.4, duration: slow(160) });
      const rune = sprite(scene, 'gridrune', this.hex, q.x, q.y, this.runeW(), FLOOR.rune).setAlpha(0);
      const base = rune.scaleX;
      rune.setScale(base * 1.4, base * 1.4 * 0.42);
      scene.tweens.add({ targets: rune, scaleX: base, scaleY: base * 0.42, alpha: 1, duration: slow(170), ease: 'Back.easeOut' });
      burst(scene, q.x, q.y - 4, { colors: GEO_ARCANE, n: 3, speed: [40, 130], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 200, life: [300, 520], size: [6, 10] });
      this.fills.set(q.slot, g);
      this.runes.set(q.slot, rune);
      this.all.push(g, rune);
    });
  }
  /** Vuruş anı: hücre beyaza yakın parlar, rün sıçrar, ışık sütunu ve kıvılcımlar yükselir. */
  flare(q: GridCell, power = 1): void {
    const scene = this.c.scene;
    const g = this.fills.get(q.slot);
    const rune = this.runes.get(q.slot);
    if (g) scene.tweens.add({ targets: g, alpha: { from: 0.75, to: 0.34 }, duration: slow(380), ease: 'Quad.easeOut' });
    if (rune) {
      rune.setTintFill(0xffffff);
      void wait(scene, slow(90)).then(() => rune.active && rune.clearTint());
    }
    arcanePillar(scene, q.x, q.y + 6, 70 * power, 190 * power);
    burst(scene, q.x, q.y - 8, { colors: GEO_ARCANE, n: Math.round(8 * power), speed: [90, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 520, life: [320, 640], size: [6, 12] });
    void ring(scene, q.x, q.y, { r: Math.abs(this.s.R.x) * 0.42 * power, flat: 0.32, n: 18, colors: GEO_ARCANE, dur: 360, size: 8 });
  }
  fade(delay: number, dur = 520): void {
    const list = this.all;
    this.c.scene.tweens.add({ targets: list, alpha: 0, delay: slow(delay), duration: slow(dur), onComplete: () => list.forEach((o) => o.destroy()) });
  }
}

/** Hedeflerin hasar olayları `c.targets` sırasıyla gelir: ilk hedefin vuruş anında çözülür; sonrakiler `gate` ile kendi anını bekler. */
function syncHits(c: VfxCtx, arrivals: Array<Promise<void>>, fallback: Promise<void>): Promise<void> {
  const chain = (i: number) => {
    if (i >= arrivals.length) return;
    c.gate(
      i === 1 ? 1 : 0,
      async () => {
        await arrivals[i];
        chain(i + 1);
      },
      () => undefined,
    );
  };
  return (arrivals[0] ?? fallback).then(() => chain(1));
}

/** Hedefin bulunduğu hücre (yoksa en yakın kapsanan hücre). */
const cellOf = (s: Survey, t: CombatantView): GridCell =>
  s.cells.find((q) => q.slot === t.combatant.slot) ?? s.cells.reduce((m, q) => (ptDist(q, feet(t)) < ptDist(m, feet(t)) ? q : m), s.cells[0] ?? s.anchor);

/**
 * Ortak açılış: Geometer asasını yere vurur (cast), ayağının dibinde küçük bir rün belirir; kalem ucu zemin boyunca şeklin
 * başlangıç noktasına koşar (soluk kesikli iz bırakır).
 */
async function geoOpen(c: VfxCtx, hex: string, start: Pt): Promise<void> {
  c.sfx('chalkDraw');
  const f = feet(c.actor);
  const dir = dirTo(c.actor, start);
  const sig = sprite(c.scene, 'gridrune', hex, f.x + dir * 40, f.y - 2, 76, FLOOR.rune).setAlpha(0.95);
  const base = sig.scaleX;
  sig.setScale(base * 0.2, base * 0.08);
  c.scene.tweens.add({ targets: sig, scaleX: base, scaleY: base * 0.42, duration: slow(200), ease: 'Back.easeOut' });
  c.scene.tweens.add({ targets: sig, alpha: 0, delay: slow(1100), duration: slow(500), onComplete: () => sig.destroy() });
  await c.windUp(hex);
  c.actor.play('cast');
  const from = { x: sig.x, y: sig.y };
  const trail = new ChalkInk(c.scene, hex, 0.5);
  const pen = new ChalkPen([from, start], trail, 12);
  const head = sprite(c.scene, 'gridspark', hex, from.x, from.y, 30, DEPTH + 20);
  await counter(c.scene, slow(220), (u) => {
    const p = pen.to(pen.len * u);
    head.setPosition(snap(p.x), snap(p.y));
  }, 'Quad.easeIn');
  head.destroy();
  trail.fade(150, 420);
}

/** Dış hattı iki kalemle çizer: `start`tan iki yöne ayrılıp karşı noktada buluşurlar (uçlarından tebeşir tozu düşer). */
async function traceOutline(c: VfxCtx, s: Survey, ink: ChalkInk, start: Pt, ms: number, hex: string): Promise<void> {
  const path = loopFrom(s.loop, start);
  const half = polyLen(path) / 2;
  const pens = [new ChalkPen(path, ink), new ChalkPen([...path].reverse(), ink)];
  const heads = pens.map(() => sprite(c.scene, 'gridspark', hex, start.x, start.y, 34, DEPTH + 20));
  let dustAt = 0;
  await counter(c.scene, slow(ms), (u) => {
    pens.forEach((p, i) => {
      const q = p.to(half * u);
      heads[i]!.setPosition(snap(q.x), snap(q.y)).setRotation(u * 6);
      if (u * ms >= dustAt) burst(c.scene, q.x, q.y - 2, { colors: GEO_CHALK, n: 1, speed: [20, 90], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 320, life: [220, 400], size: [6, 9] });
    });
    if (u * ms >= dustAt) dustAt += 40;
  }, 'Sine.easeInOut');
  const meet = heads[0]!;
  burst(c.scene, meet.x, meet.y - 4, { colors: GEO_ARCANE, n: 6, speed: [60, 200], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 400, life: [300, 520], size: [6, 10] });
  for (const h of heads) c.scene.tweens.add({ targets: h, alpha: 0, scale: h.scaleX * 1.8, duration: slow(160), onComplete: () => h.destroy() });
}

/** İç kenarlar (hücreleri ayıran çizgiler) bir anda belirir: ızgara "oturur". */
function snapInner(c: VfxCtx, s: Survey, hex: string): ChalkInk {
  const ink = new ChalkInk(c.scene, hex, 0.6);
  for (const [a, b] of s.inner) ink.line(a, b);
  ink.core.setAlpha(0);
  ink.glow.setAlpha(0);
  c.scene.tweens.add({ targets: [ink.core, ink.glow], alpha: 1, duration: slow(120) });
  return ink;
}

/**
 * Row Sweep: kalem SIRANIN üst ucundan (ilk şerit) iki yana ayrılıp dış hattı çizer; rünler yukarıdan aşağı basılır; sonra
 * hattın üstünde ışıklı bir cetvel (sıra genişliğinde yatay ışık çubuğu) sırayı yukarıdan aşağı süpürür, değdiği hücre parlar.
 */
const shaperow = async (c: VfxCtx) => {
  const hex = c.skill.fx;
  const s = survey(c);
  const byLane = [...s.cells].sort((a, b) => a.l - b.l);
  const first = byLane[0] ?? s.anchor;
  const last = byLane[byLane.length - 1] ?? s.anchor;
  const start = { x: first.x - s.L.x / 2, y: first.y - s.L.y / 2 };
  const end = { x: last.x + s.L.x / 2, y: last.y + s.L.y / 2 };
  await geoOpen(c, hex, start);
  const ink = new ChalkInk(c.scene, hex);
  await traceOutline(c, s, ink, start, 460, hex);
  const inner = snapInner(c, s, hex);
  const marks = new SurveyMarks(c, s, hex);
  c.sfx('runeFlare');
  byLane.forEach((q, i) => marks.stamp(q, i * 70));
  await wait(c.scene, slow(byLane.length * 70 + 110));
  // süpüren cetvel
  c.sfx('ruleSnap');
  const arrivals = c.targets.map(() => deferred());
  const tAt = c.targets.map((t) => along(cellOf(s, t), start, end));
  const passed = new Set<number>();
  const done = deferred();
  const hits = syncHits(c, arrivals.map((a) => a.promise), done.promise);
  const bar = c.scene.add.graphics().setDepth(FLOOR.bar);
  const half = Math.abs(s.R.x) * 0.5 + 16;
  const SWEEP = 420;
  void counter(c.scene, slow(SWEEP), (u) => {
    bar.clear();
    for (let k = 3; k >= 0; k--) {
      const v = u - k * 0.05;
      if (v < 0) continue;
      const p = { x: start.x + (end.x - start.x) * v, y: start.y + (end.y - start.y) * v };
      const a = k ? 0.12 * (4 - k) : 1;
      bar.fillStyle(color(hex), 0.3 * a).fillRect(snap(p.x - half - 8), snap(p.y - 8), snap(half * 2 + 16), 16);
      if (!k) {
        bar.fillStyle(color('#e3ccff'), 0.95).fillRect(snap(p.x - half), snap(p.y - 3), snap(half * 2), 6);
        bar.fillStyle(0xffffff, 1).fillRect(snap(p.x - half + 10), snap(p.y - 1), snap(half * 2 - 20), 2);
      }
    }
    const head = { x: start.x + (end.x - start.x) * u, y: start.y + (end.y - start.y) * u };
    if (Math.random() < 0.6) burst(c.scene, head.x + rnd(-half, half), head.y - 4, { colors: GEO_CHALK, n: 1, speed: [40, 140], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 260, life: [260, 460], size: [6, 10] });
    for (const q of byLane) {
      if (passed.has(q.slot) || along(q, start, end) > u) continue;
      passed.add(q.slot);
      marks.flare(q);
    }
    tAt.forEach((t, i) => {
      if (t <= u) arrivals[i]!.resolve();
    });
  }, 'Sine.easeInOut').then(() => {
    for (const a of arrivals) a.resolve();
    done.resolve();
    c.scene.tweens.add({ targets: bar, alpha: 0, duration: slow(200), onComplete: () => bar.destroy() });
    c.actor.play('idle');
    ink.fade(250, 520);
    inner.fade(250, 520);
    marks.fade(300, 560);
  });
  await hits;
};

/**
 * Column Spear: kalem ŞERİDİN ön ucundan (Geometer'e en yakın sıra) arka ucuna iki kenar boyunca çizer; rünler önden arkaya
 * basılır; sonra bel hizasında bir ışık mızrağı şeridi önden arkaya deler, geçtiği her hücrede ışık sütunu yükselir.
 */
const shapecolumn = async (c: VfxCtx) => {
  const hex = c.skill.fx;
  const s = survey(c);
  const byRow = [...s.cells].sort((a, b) => a.r - b.r);
  const near = byRow[0] ?? s.anchor;
  const far = byRow[byRow.length - 1] ?? s.anchor;
  const start = { x: near.x - s.R.x / 2, y: near.y - s.R.y / 2 };
  const end = { x: far.x + s.R.x / 2, y: far.y + s.R.y / 2 };
  await geoOpen(c, hex, start);
  const ink = new ChalkInk(c.scene, hex);
  await traceOutline(c, s, ink, start, 520, hex);
  const inner = snapInner(c, s, hex);
  const marks = new SurveyMarks(c, s, hex);
  c.sfx('runeFlare');
  byRow.forEach((q, i) => marks.stamp(q, i * 50));
  await wait(c.scene, slow(byRow.length * 50 + 110));
  // ışık mızrağı
  c.sfx('ruleSnap');
  const dir = Math.sign(end.x - start.x) || 1;
  const lift = 74;
  const from = { x: start.x - dir * 150, y: start.y - lift };
  const to = { x: end.x + dir * 190, y: end.y - lift };
  const spear = sprite(c.scene, 'lightspear', hex, from.x, from.y, 240, DEPTH + 30).setFlipX(dir < 0);
  burst(c.scene, from.x + dir * 90, from.y, { colors: GEO_ARCANE, n: 10, speed: [80, 260], gravity: 0, life: [220, 420], size: [6, 10] });
  const arrivals = c.targets.map(() => deferred());
  const tAt = c.targets.map((t) => along({ x: cellOf(s, t).x, y: 0 }, { x: from.x, y: 0 }, { x: to.x, y: 0 }));
  const passed = new Set<number>();
  const done = deferred();
  const hits = syncHits(c, arrivals.map((a) => a.promise), done.promise);
  const trail = c.scene.add.graphics().setDepth(DEPTH + 26);
  const FLY = 360;
  void counter(c.scene, slow(FLY), (u) => {
    const x = from.x + (to.x - from.x) * u;
    const y = from.y + (to.y - from.y) * u;
    spear.setPosition(snap(x), snap(y));
    // iz: mızrağın arkasında incelen ışık çizgisi (en çok 520 px)
    const back = Math.min(Math.abs(x - from.x), 520);
    const bx0 = dir > 0 ? x - 90 - back : x + 90;
    trail.clear();
    trail.fillStyle(color(hex), 0.28).fillRect(snap(bx0), snap(y - 8), snap(back), 16);
    trail.fillStyle(color('#e3ccff'), 0.85).fillRect(snap(dir > 0 ? bx0 + back * 0.35 : bx0), snap(y - 2), snap(back * 0.65), 4);
    for (const q of byRow) {
      if (passed.has(q.slot) || along({ x: q.x, y: 0 }, { x: from.x, y: 0 }, { x: to.x, y: 0 }) > u) continue;
      passed.add(q.slot);
      marks.flare(q, 0.9);
      burst(c.scene, q.x, y, { colors: GEO_ARCANE, n: 6, speed: [120, 320], angle: dir > 0 ? [-0.6, 0.6] : [Math.PI - 0.6, Math.PI + 0.6], gravity: 300, life: [240, 460], size: [6, 10] });
    }
    tAt.forEach((t, i) => {
      if (t <= u) {
        if (!passed.has(-1 - i)) {
          passed.add(-1 - i);
          const tv = c.targets[i]!;
          hit(c.scene, tv.container.x, y, GEO_ARCANE, 0.8);
          c.scene.tweens.add({ targets: tv.container, x: tv.container.x + dir * 12, duration: slow(50), yoyo: true });
        }
        arrivals[i]!.resolve();
      }
    });
  }).then(() => {
    for (const a of arrivals) a.resolve();
    done.resolve();
    c.scene.tweens.add({ targets: [spear, trail], alpha: 0, duration: slow(180), onComplete: () => (spear.destroy(), trail.destroy()) });
    shake(c.scene, 120, 0.003);
    c.actor.play('idle');
    ink.fade(250, 520);
    inner.fade(250, 520);
    marks.fade(300, 560);
  });
  await hits;
};

/**
 * Block Slam: kalem dikdörtgeni ekrandaki SOL-ALT köşesinden (anchor köşesi) iki yöne çizer, iç ızgara oturur, tüm hücrelere
 * rün basılır; sonra her hücrenin üstünden kare taş mühür AYNI ANDA zemine çöker (gölgeleri büyür), ezer, toz kalkar.
 */
const shaperect = async (c: VfxCtx) => {
  const hex = c.skill.fx;
  const s = survey(c);
  const maxY = Math.max(...s.loop.map((p) => p.y));
  const start = s.loop.filter((p) => Math.abs(p.y - maxY) < 1).reduce((m, p) => (p.x < m.x ? p : m), s.loop[0] ?? s.anchor);
  await geoOpen(c, hex, start);
  const ink = new ChalkInk(c.scene, hex);
  await traceOutline(c, s, ink, start, 500, hex);
  const inner = snapInner(c, s, hex);
  const marks = new SurveyMarks(c, s, hex);
  c.sfx('runeFlare');
  s.cells.forEach((q, i) => marks.stamp(q, (i % 3) * 25));
  await wait(c.scene, slow(200));
  // gölgeler büyür, mühürler düşer
  const size = Math.min(Math.abs(s.R.x) || 160, 170) * 0.82;
  const seals = s.cells.map((q) => {
    const shadow = c.scene.add.ellipse(q.x, q.y + 2, size * 0.3, size * 0.1, 0x000000, 0.35).setDepth(FLOOR.bar);
    c.scene.tweens.add({ targets: shadow, scaleX: 2.6, scaleY: 2.6, duration: slow(300), ease: 'Quad.easeIn' });
    const img = sprite(c.scene, 'gridseal', hex, q.x, q.y - 560, size, q.y + 3).setOrigin(0.5, 29 / 32);
    return { q, img, shadow, delay: rnd(0, 0.08) };
  });
  const FALL = 300;
  await counter(c.scene, slow(FALL), (u) => {
    for (const k of seals) {
      const v = Math.max(0, Math.min(1, (u - k.delay) / (1 - k.delay)));
      k.img.setPosition(k.q.x, snap(k.q.y + 4 - 560 * (1 - v * v)));
    }
  });
  // çarpma
  c.sfx('stampSlam');
  flash(c.scene, hex, 0.2, 260);
  shake(c.scene, 280, 0.01);
  for (const k of seals) {
    k.shadow.destroy();
    marks.flare(k.q, 0.8);
    dustCloud(c.scene, k.q.x, k.q.y + 4, { n: 3, spread: size * 0.7, rise: 60, size: [64, 104], tint: 0xd8cbb6, life: 760 });
    burst(c.scene, k.q.x, k.q.y - 6, { colors: [...DUST, '#e3ccff'], n: 6, speed: [80, 260], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 700, life: [300, 600], size: [8, 14] });
    const base = k.img.scaleY;
    c.scene.tweens.add({ targets: k.img, scaleY: base * 0.86, duration: slow(60), yoyo: true });
    c.scene.tweens.add({ targets: k.img, y: k.img.y + 14, alpha: 0, delay: slow(220), duration: slow(340), ease: 'Quad.easeIn', onComplete: () => k.img.destroy() });
  }
  for (const t of c.targets) c.scene.tweens.add({ targets: t.container, y: t.container.y + 8, duration: slow(60), yoyo: true });
  void wait(c.scene, slow(200)).then(() => {
    c.actor.play('idle');
    ink.fade(300, 520);
    inner.fade(300, 520);
    marks.fade(350, 560);
  });
  await wait(c.scene, slow(40));
};

/**
 * Cross Burst: artı şeklinin dış hattı MERKEZ hücreden dışa doğru büyüyerek çizilir; merkeze rün basılır ve parlar, sonra
 * merkezden dört yöne ışık ışınları kollara fırlar; ışının değdiği her kol hücresi parlar.
 */
const shapeplus = async (c: VfxCtx) => {
  const hex = c.skill.fx;
  const s = survey(c);
  const mid = s.anchor;
  await geoOpen(c, hex, mid);
  // artı hattı merkezden dışa büyür (her karede yeniden basılır)
  const ink = new ChalkInk(c.scene, hex);
  const grow = sprite(c.scene, 'gridspark', hex, mid.x, mid.y, 40, DEPTH + 20);
  await counter(c.scene, slow(440), (u) => {
    const e = 1 - (1 - u) ** 2;
    ink.clear();
    const pts = s.loop.map((p) => ({ x: mid.x + (p.x - mid.x) * e, y: mid.y + (p.y - mid.y) * e }));
    for (let i = 0; i < pts.length; i++) ink.line(pts[i]!, pts[(i + 1) % pts.length]!);
    grow.setRotation(u * 5);
  }, 'Linear');
  grow.destroy();
  const inner = snapInner(c, s, hex);
  const marks = new SurveyMarks(c, s, hex);
  // merkez rünü
  c.sfx('runeFlare');
  marks.stamp(mid);
  await wait(c.scene, slow(170));
  const arms = s.cells.filter((q) => q.slot !== mid.slot);
  const arrivals = c.targets.map(() => deferred());
  const tArm = c.targets.map((t) => cellOf(s, t));
  const done = deferred();
  const hits = syncHits(c, arrivals.map((a) => a.promise), done.promise);
  marks.flare(mid, 1.15);
  void ring(c.scene, mid.x, mid.y, { r: Math.abs(s.R.x) * 0.6, flat: 0.32, n: 30, colors: GEO_ARCANE, dur: 420, size: 10 });
  tArm.forEach((q, i) => q.slot === mid.slot && arrivals[i]!.resolve());
  await wait(c.scene, slow(90));
  // dört yöne ışınlar
  c.sfx('ruleSnap');
  for (const q of arms) marks.stamp(q);
  const beams = c.scene.add.graphics().setDepth(FLOOR.bar);
  const heads = arms.map(() => sprite(c.scene, 'gridspark', hex, mid.x, mid.y, 30, DEPTH + 20));
  const reached = new Set<number>();
  const SHOOT = 200;
  void counter(c.scene, slow(SHOOT), (u) => {
    beams.clear();
    arms.forEach((q, i) => {
      // ışın hücre merkezini biraz geçip kolun dış kenarına kadar uzanır
      const tip = { x: mid.x + (q.x - mid.x) * 1.45 * u, y: mid.y + (q.y - mid.y) * 1.45 * u };
      const len = ptDist(mid, tip);
      const n = Math.max(1, Math.floor(len / 6));
      for (let k = 0; k <= n; k++) {
        const p = { x: mid.x + ((tip.x - mid.x) * k) / n, y: mid.y + ((tip.y - mid.y) * k) / n };
        beams.fillStyle(color(hex), 0.28).fillRect(snap(p.x - 8), snap(p.y - 6), 16, 12);
        beams.fillStyle(color(k % 3 ? '#e3ccff' : '#ffffff'), 0.95).fillRect(snap(p.x - 3), snap(p.y - 3), 6, 6);
      }
      heads[i]!.setPosition(snap(tip.x), snap(tip.y));
      if (!reached.has(q.slot) && u * 1.45 >= 1) {
        reached.add(q.slot);
        marks.flare(q, 0.9);
        tArm.forEach((t, j) => t.slot === q.slot && arrivals[j]!.resolve());
      }
    });
  }, 'Quad.easeOut').then(() => {
    for (const a of arrivals) a.resolve();
    done.resolve();
    for (const h of heads) c.scene.tweens.add({ targets: h, alpha: 0, duration: slow(160), onComplete: () => h.destroy() });
    c.scene.tweens.add({ targets: beams, alpha: 0, duration: slow(300), onComplete: () => beams.destroy() });
    shake(c.scene, 140, 0.004);
    c.actor.play('idle');
    ink.fade(250, 520);
    inner.fade(250, 520);
    marks.fade(300, 560);
  });
  await hits;
};

// ---------------------------------------------------------------------------------------------------------------------
// CUTTHROAT (medieval haydut-suikastçı): kısa hançer, zehir, kil duman bombası, gölge adımı. Renk dili kömür/kül grisi + turuncu vurgu +
// zehir yeşili; Backstab'de kızıl. Parıltılı büyü yok: çelik, duman, kan.

const VENOM = ['#62d04b', '#2c7a2b', '#a8f08a', '#7fbf3f'];
const STEEL = ['#ffffff', '#d7dce6', '#98a2b4'];
const EMBERCUT = ['#ffffff', '#ffe9b0', '#ff8a1f', '#ffd23f'];
const SOOT = 0x3a3f47;
/** Saltire Cut ritmi: Ömer isteğiyle %15 yavaş (madde 231). */
const SALTIRE_PACE = 1.15;

/** Yumuşak duman yumağı dokusu: tırtıklı kenarlı, sol-üstten ışık alan gri-kömür top (Smoke Bomb, gölge adımı). */
const smokeTexture = (scene: Phaser.Scene) =>
  softTexture(scene, 'fx:smokeball', 40, 40, (x, y) => {
    const dx = x + 0.5 - 20;
    const dy = y + 0.5 - 20;
    const ang = Math.atan2(dy, dx);
    const edge = 0.8 + 0.12 * Math.sin(ang * 5 + 0.7) + 0.07 * Math.sin(ang * 9 + 2.1);
    const d = Math.hypot(dx, dy) / 20 / edge;
    if (d >= 1) return null;
    const lit = (-dx - dy) / 40; // sol-üst aydınlık
    const c = lit > 0.28 ? '#d7dce6' : lit > -0.05 ? '#aab2bc' : lit > -0.35 ? '#7d8691' : '#59616c';
    return { c, a: (1 - d ** 2.2) * 0.95 };
  });

/** Duman pufu: verilen noktada kabaran, hafif yükselen ve sönen yumuşak duman topları. `depthAt` verilirse o zemin y'sine göre karakterlerle sıralanır. */
function smokePuffs(scene: Phaser.Scene, x: number, y: number, o: { n: number; spread: number; size: [number, number]; rise?: number; life?: number; hold?: number; alpha?: number; tint?: number; depth?: number; grow?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const s = rnd(o.size[0], o.size[1]);
    const px = x + rnd(-o.spread, o.spread);
    const py = y + rnd(-o.spread * 0.3, o.spread * 0.3);
    const puff = scene.add.image(px, py, smokeTexture(scene)).setDisplaySize(s * 0.35, s * 0.3).setAlpha(0).setTint(o.tint ?? 0xffffff).setDepth(o.depth ?? DEPTH + 20);
    puff.setRotation(rnd(-0.4, 0.4)).setFlipX(Math.random() < 0.5);
    const grow = o.grow ?? 1;
    scene.tweens.add({ targets: puff, displayWidth: s * grow, displayHeight: s * 0.86 * grow, alpha: o.alpha ?? 0.9, duration: slow(rnd(160, 260)), delay: slow(rnd(0, 70)), ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: puff, y: py - (o.rise ?? 30) * rnd(0.6, 1.2), x: px + rnd(-14, 14), duration: slow((o.life ?? 900) + (o.hold ?? 0)), ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: puff, alpha: 0, displayWidth: s * grow * 1.25, displayHeight: s * grow * 1.1, delay: slow((o.hold ?? 0) + (o.life ?? 900) * 0.45), duration: slow((o.life ?? 900) * 0.55), ease: 'Quad.easeIn', onComplete: () => puff.destroy() });
  }
}

/**
 * Kapüşonlu siluetin dumana dönüşüp çözülmesi (gölge adımı): kısa duman pufu, karakter koyu hayalet izleri bırakarak saydamlaşır, kömür
 * kıvılcımları yükselir. `appear` true ise tersine: dumanın içinden belirir. Promise geçiş bitince çözülür.
 */
async function shadowStepFx(scene: Phaser.Scene, v: CombatantView, appear: boolean, ms = 150): Promise<void> {
  const f = feet(v);
  smokePuffs(scene, f.x, f.y - v.h * 0.3, { n: 6, spread: v.w * 0.35, size: [70, 120], rise: 40, life: 640, depth: v.container.depth + 1, alpha: 0.85 });
  smokePuffs(scene, f.x, f.y - 4, { n: 3, spread: v.w * 0.4, size: [60, 90], rise: 10, life: 520, depth: v.container.depth - 1, alpha: 0.8 });
  burst(scene, f.x, f.y - v.h * 0.5, { colors: ['#3a3f47', '#59616c', '#15101c', '#ff8a1f'], n: 8, speed: [40, 160], angle: [-Math.PI, 0], gravity: -120, life: [300, 600], size: [6, 12] });
  if (!appear) {
    for (let i = 0; i < 3; i++) void wait(scene, slow(i * 40)).then(() => v.afterimage(SOOT, 0.6 - i * 0.15, 260));
    await new Promise<void>((resolve) => scene.tweens.add({ targets: v.container, alpha: 0, scaleX: 0.86, duration: slow(ms), ease: 'Quad.easeIn', onComplete: () => resolve() }));
    v.container.setScale(1);
  } else {
    v.container.setAlpha(0).setScale(1.08, 1);
    await new Promise<void>((resolve) => scene.tweens.add({ targets: v.container, alpha: 1, scaleX: 1, duration: slow(ms), ease: 'Quad.easeOut', onComplete: () => resolve() }));
  }
}

/** Düz kesik izi (havada): a'dan b'ye uçtan sivri, ortası kalın, kuyruğu sönen piksel şerit. Promise iz bitince çözülür; `onPass(k)` uç ilerledikçe. */
function lineSlash(scene: Phaser.Scene, a: Pt, b: Pt, o: { dur: number; size: number; colors: string[]; depth?: number; onPass?: (k: number) => void }): Promise<void> {
  const g = scene.add.graphics().setDepth(o.depth ?? DEPTH + 40);
  const cols = o.colors.map(color);
  const n = Math.max(24, Math.round(ptDist(a, b) / 6));
  return counter(scene, slow(o.dur), (u) => {
    g.clear();
    const head = Math.min(1, u * 1.35);
    o.onPass?.(head);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      if (k > head || k < head - 0.6) continue;
      const fade = 1 - (head - k) / 0.6;
      const s = Math.max(2, o.size * PX * 1.4 * fade * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.1))));
      const x = snap(a.x + (b.x - a.x) * k);
      const y = snap(a.y + (b.y - a.y) * k);
      g.fillStyle(cols[(i + Math.floor(u * 6)) % cols.length]!, Math.min(1, fade * 1.4)).fillRect(x - s / 2, y - s / 2, s, s);
    }
    if (u >= 1) g.destroy();
  });
}

/**
 * Zemindeki kesik izi: a'dan b'ye uçtan uca yanan beyaz çekirdek + turuncu kenar + koyu yanık; kısa süre parlar, sonra altında ince koyu bir
 * kesik çizgisi bir süre zeminde kalıp solar (Saltire'nin X'i hücre köşelerini birleştiren iki çapraz iz olarak okunsun; madde 231).
 */
function groundScar(scene: Phaser.Scene, a: Pt, b: Pt, dur: number): void {
  const g = scene.add.graphics().setDepth(FLOOR_FX + 3);
  const cut = scene.add.graphics().setDepth(FLOOR_FX + 2);
  const len = ptDist(a, b) || 1;
  let drawn = 0;
  void counter(scene, slow(dur), (u) => {
    const end = len * Math.min(1, u * 1.3);
    for (let s = drawn; s <= end; s += 3) {
      const x = snap(a.x + ((b.x - a.x) * s) / len);
      const y = snap(a.y + ((b.y - a.y) * s) / len);
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, s / len)));
      const w = 5 + 8 * taper;
      cut.fillStyle(0x2a1810, 0.85).fillRect(x - w / 2 - 1, y - 2, w + 2, 4);
      g.fillStyle(0x8a3a10, 0.75).fillRect(x - w / 2 - 3, y - 4, w + 6, 8);
      g.fillStyle(0xff8a1f, 0.95).fillRect(x - w / 2, y - 2, w, 5);
      g.fillStyle(0xffffff, 1).fillRect(x - w / 4, y - 1, Math.max(2, w / 2), 2);
    }
    drawn = Math.max(drawn, end);
  }).then(() => {
    scene.tweens.add({ targets: g, alpha: 0, delay: slow(480), duration: slow(700), onComplete: () => g.destroy() });
    scene.tweens.add({ targets: cut, alpha: 0, delay: slow(1100), duration: slow(900), onComplete: () => cut.destroy() });
  });
}

/**
 * Venom Edge (tek hedef, yakın dövüş): Cutthroat hançerini çekip hedefin yanına süzülür, iki hızlı kesik atar (çelik + zehir yeşili iz);
 * hançerin kenarından yeşil zehir damlaları yere damlar, yaradan yeşil sızıntı akar, birkaç kan kıymığı (Wound) saçılır. Tek hasar rakamı
 * ikinci kesikte.
 */
const venomedge = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const stand = standNear(c.actor, t);
  const dir = stand.dir;
  c.sfx('daggerDraw');
  // hançer çekilirken elde kısa çelik parıltısı
  const hand = { x: c.actor.container.x + dir * c.actor.w * 0.3, y: c.actor.container.y - c.actor.h * 0.5 };
  burst(c.scene, hand.x, hand.y, { colors: STEEL, n: 4, speed: [40, 120], gravity: 0, life: [160, 280], size: [6, 10] });
  await c.actor.approach(stand.x, stand.y, 170, SOOT);
  const p = spot(t);
  c.actor.play('attack');
  c.sfx('twinSlice');
  const cut = (i: number) => {
    const up = i === 1;
    c.scene.tweens.add({ targets: c.actor.container, x: stand.x + dir * 22, duration: slow(45), yoyo: true });
    void arcSlash(c.scene, p.x - dir * 4, p.y + (up ? -16 : 10), { dir, from: up ? 1.15 : -1.15, to: up ? -1.15 : 1.15, r: 96, dur: 100, size: 16, colors: up ? ['#ffffff', '#a8f08a', '#d7dce6'] : STEEL });
    void arcSlash(c.scene, p.x - dir * 4, p.y + (up ? -10 : 16), { dir, from: up ? 1.15 : -1.15, to: up ? -1.15 : 1.15, r: 112, dur: 130, size: 9, colors: ['#62d04b', '#2c7a2b', '#a8f08a'] });
    hit(c.scene, p.x, p.y, ['#ffffff', '#a8f08a', '#62d04b'], 0.7);
    burst(c.scene, p.x, p.y, { colors: BLOOD, n: 3, speed: [120, 300], angle: [dir > 0 ? -0.6 : Math.PI - 0.4, dir > 0 ? 0.4 : Math.PI + 0.6], gravity: 800, life: [260, 480], size: [6, 10] });
    c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 10, duration: slow(40), yoyo: true });
  };
  // kesikler ses kayıtlarıyla eş zamanlı (twinSlice: 75 ms ve 225 ms; ses yavaşlatılmaz)
  await wait(c.scene, 75);
  cut(0);
  await wait(c.scene, 150);
  cut(1);
  shake(c.scene, 90, 0.003);
  // zehir: bıçak kenarından damlalar yere düşer, yaradan yeşil sızıntı akar, ayak dibinde küçük zehir lekesi
  const f = feet(t);
  for (let k = 0; k < 5; k++) {
    const d = sprite(c.scene, 'blooddrop', '#62d04b', p.x + rnd(-18, 18), p.y + rnd(-10, 14), 18, DEPTH + 45).setTint(0x7fdc5a);
    c.scene.tweens.add({ targets: d, y: f.y - 4, duration: slow(rnd(280, 420)), delay: slow(k * 50), ease: 'Quad.easeIn', onComplete: () => {
      burst(c.scene, d.x, f.y - 4, { colors: VENOM, n: 2, speed: [30, 90], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 500, life: [160, 300], size: [4, 8] });
      d.destroy();
    } });
  }
  for (let k = 0; k < 6; k++) {
    const seep = c.scene.add.rectangle(snap(p.x + rnd(-t.w * 0.18, t.w * 0.18)), snap(p.y + rnd(-12, 10)), 4, 6, color(pick(VENOM))).setDepth(t.container.depth + 1);
    c.scene.tweens.add({ targets: seep, y: seep.y + rnd(30, 70), scaleY: 2.2, alpha: 0, duration: slow(rnd(600, 900)), delay: slow(80 + k * 40), ease: 'Sine.easeIn', onComplete: () => seep.destroy() });
  }
  const stain = c.scene.add.ellipse(f.x, f.y - 2, 30, 8, 0x2c7a2b, 0.55).setDepth(FLOOR_FX + 3);
  c.scene.tweens.add({ targets: stain, scaleX: 2.6, scaleY: 1.8, duration: slow(380), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: stain, alpha: 0, delay: slow(500), duration: slow(500), onComplete: () => stain.destroy() });
  void wait(c.scene, slow(200)).then(() => c.actor.returnHome(220, SOOT));
};

/**
 * Saltire Cut (x şekli, merkez hücre 2 vuruş): Cutthroat gölge adımıyla anchor hücrenin üstüne sıçrar ve havada iki hızlı kesikle X'i çizer:
 * her kesik bir çapraz boyunca hem havada (beyaz-turuncu iz) hem zeminde (yanık kesik izi) hücre köşelerini birleştirerek koşar; ucun değdiği
 * hücredeki düşman vurulur. Merkez her iki kesikte de vurulur (iki ayrı hasar rakamı). İkinci kesik, olay sırasında ona düşen ilk vuruştan
 * hemen önce oynar (VfxCtx.gate); çaprazı tahta dışına taşan kol merkez hücrenin köşesinde biter.
 */
const saltire = (c: VfxCtx) => playUntilHit(async (release0) => {
  const slots = fxSlots(c);
  const lanes = content.GRID.lanes;
  const center = c.center ?? slots[0];
  if (center === undefined) return;
  const C = cellMid(c.board, center);
  const { R, L } = gridSteps(c.board);
  const inX = (dr: number, dl: number) => {
    const row = Math.floor(center / lanes) + dr;
    const lane = (center % lanes) + dl;
    return row >= 0 && row < content.GRID.rows && lane >= 0 && lane < lanes && slots.includes(row * lanes + lane);
  };
  // çaprazlar: A = (+sıra,+şerit) yönü, B = (+sıra,-şerit) yönü; uçlar hücre köşelerinde (komşu yoksa merkez hücrenin köşesi)
  const diag = (sl: number) => {
    const v = { x: R.x + sl * L.x, y: R.y + sl * L.y };
    const e1 = inX(-1, -sl) ? 1.5 : 0.5;
    const e2 = inX(1, sl) ? 1.5 : 0.5;
    const p1 = { x: C.x - v.x * e1, y: C.y - v.y * e1 };
    const p2 = { x: C.x + v.x * e2, y: C.y + v.y * e2 };
    return p1.y <= p2.y ? [p1, p2] as const : [p2, p1] as const; // yukarıdan aşağı kesilir
  };
  const lineOf = (t: CombatantView): 'A' | 'B' | 'C' => {
    const s = slotOfView(t);
    if (s === center) return 'C';
    const dr = Math.floor(s / lanes) - Math.floor(center / lanes);
    const dl = (s % lanes) - (center % lanes);
    return dr === dl ? 'A' : 'B';
  };
  // olay sırası (c.targets sırası; merkezdeki birim art arda iki kez): B kesiğine düşen ilk vuruşun sırası
  const owners = c.targets.flatMap((t) => (lineOf(t) === 'C' ? ['A', 'B'] : [lineOf(t)]));
  const firstB = owners.indexOf('B');
  const a = c.actor;
  const dir = C.x >= a.container.x ? 1 : -1;
  // sıçrayış: anchor hücrenin önüne-üstüne (havada)
  c.sfx('shadowStep');
  a.play('attack');
  a.container.setDepth(3500);
  const air = { x: C.x - dir * (Math.abs(R.x) * 0.55), y: C.y - 70 };
  const from = { x: a.container.x, y: a.container.y };
  for (let i = 0; i < 3; i++) void wait(c.scene, slow(i * 58 * SALTIRE_PACE)).then(() => a.afterimage(SOOT, 0.45, 250));
  await counter(c.scene, slow(220 * SALTIRE_PACE), (u) => {
    const e = 1 - (1 - u) ** 2;
    a.container.setPosition(snap(from.x + (air.x - from.x) * e), snap(from.y + (air.y - from.y) * e - Math.sin(u * Math.PI) * 60));
  });
  const slash = async (which: 'A' | 'B', onCenter?: () => void) => {
    const [p1, p2] = diag(which === 'A' ? 1 : -1);
    const lift = 64;
    c.sfx('swordWhoosh');
    a.play('attack');
    c.scene.tweens.add({ targets: a.container, x: air.x + dir * 18, y: air.y + (which === 'A' ? 10 : -10), duration: slow(60 * SALTIRE_PACE), yoyo: true });
    groundScar(c.scene, p1, p2, 150 * SALTIRE_PACE);
    let centered = false;
    const victims = c.targets.filter((t) => lineOf(t) === which || lineOf(t) === 'C');
    const struck = new Set<CombatantView>();
    await lineSlash(c.scene, { x: p1.x, y: p1.y - lift }, { x: p2.x, y: p2.y - lift }, {
      dur: 150 * SALTIRE_PACE,
      size: 27,
      colors: EMBERCUT,
      onPass: (k) => {
        const hx = p1.x + (p2.x - p1.x) * k;
        const hy = p1.y + (p2.y - p1.y) * k;
        // hasar rakamı: kesiğin ucu merkezden geçtiği an (ilk kesikte efektin Promise'i, ikincide gate)
        if (!centered && onCenter && Math.hypot(C.x - hx, C.y - hy) <= Math.abs(L.y) * 0.8) {
          centered = true;
          onCenter();
        }
        for (const t of victims) {
          if (struck.has(t) || Math.hypot(t.container.x - hx, t.container.y - hy) > Math.abs(L.y) * 0.8) continue;
          struck.add(t);
          const q = spot(t);
          hit(c.scene, q.x, q.y, ['#ffffff', '#ffe9b0', '#ff8a1f'], lineOf(t) === 'C' ? 1.1 : 0.85);
          burst(c.scene, q.x, q.y, { colors: BLOOD, n: 4, speed: [120, 320], gravity: 800, life: [260, 480], size: [6, 10] });
          c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 12, duration: slow(45), yoyo: true });
        }
      },
    });
    if (!centered) onCenter?.();
    c.sfx('duelCut');
    shake(c.scene, 90, 0.0035);
  };
  const land = () => {
    void wait(c.scene, slow(120 * SALTIRE_PACE)).then(() => a.returnHome(260 * SALTIRE_PACE, SOOT));
  };
  if (firstB <= 0) {
    // B kesiğine düşen vuruş A'dan önce gelmiyorsa ya da yoksa: iki kesik de çizilir, sonra rakamlar akar
    await slash('A');
    await wait(c.scene, slow(50 * SALTIRE_PACE));
    await slash('B');
    release0();
    land();
    return;
  }
  // İkinci kesik gate ile: A'nın rakamları aktıktan sonra B'ye düşen ilk vuruştan hemen önce oynar; o rakam B'nin ucu merkezden geçtiği an akar.
  // Gate, A'nın rakamları akmaya başlamadan (hit) ÖNCE kurulur.
  const aDone = deferred();
  c.gate(
    firstB,
    () =>
      new Promise<void>((release) => {
        void aDone.promise
          .then(() => wait(c.scene, slow(50 * SALTIRE_PACE)))
          .then(() => slash('B', release))
          .then(() => {
            release();
            land();
          });
      }),
    () => {
      void aDone.promise.then(() => land());
    },
  );
  await slash('A', release0);
  aDone.resolve();
});

/**
 * Smoke Bomb (rect 2x2, area_any: iki tahtaya atılabilir; ctx.board): Cutthroat fitili yanan kil bombayı yay çizerek alanın ortasına atar;
 * bomba çatlayıp kırılır, gri-kömür duman bulutu hücreleri kaplar (karakterlerin önünde ve arkasında kabaran yumuşak duman).
 * Düşman tahtasında: düşmanların gözlerinin önünden koyu duman şeridi geçer (Blinded), öksürür gibi sarsılırlar. Kendi tahtasında: dostların
 * çevresinde yumuşak duman perdesi döner, siluetleri bir an soluklaşır (Shrouded: savunma). Kalıcı görsel yok: süre rozetle görünür.
 */
const smokebomb = (c: VfxCtx) => playUntilHit(async (hit) => {
  const a = c.actor;
  const slots = fxSlots(c);
  const own = c.board === a.combatant.side;
  const mids = slots.map((s) => cellMid(c.board, s));
  const aim = mids.length ? { x: mids.reduce((s, m) => s + m.x, 0) / mids.length, y: mids.reduce((s, m) => s + m.y, 0) / mids.length } : (c.centerPos ?? feet(a));
  a.play('attack');
  c.sfx('fistWhoosh');
  const dir = aim.x >= a.container.x ? 1 : -1;
  c.scene.tweens.add({ targets: a.container, x: a.container.x - dir * 14, duration: slow(90), yoyo: true });
  await wait(c.scene, slow(90));
  // bomba: elden alanın ortasına yay çizerek uçar; fitilinden kıvılcım ve ince duman izi
  const hand = { x: a.container.x + dir * a.w * 0.3, y: a.container.y - a.h * 0.7 };
  const bomb = sprite(c.scene, 'claybomb', '#8c5a2b', hand.x, hand.y, 56, DEPTH + 45);
  const dist = Math.hypot(aim.x - hand.x, aim.y - hand.y);
  await travel(c.scene, bomb, { x: aim.x, y: aim.y - 14 }, Math.max(380, Math.min(560, dist * 0.6)), {
    arc: own ? 150 : 200,
    spin: 1.25 * dir,
    trail: (x, y) => {
      burst(c.scene, x, y - 18, { colors: ['#ffd23f', '#ff8a1f'], n: 1, speed: [10, 60], gravity: 80, life: [120, 240], size: [4, 8] });
      smokePuffs(c.scene, x, y - 20, { n: 1, spread: 2, size: [16, 26], rise: 10, life: 360, alpha: 0.55 });
    },
    trailEvery: 30,
  });
  // kırılma: kil kırıkları, kısa parlama, duman patlaması
  bomb.destroy();
  c.sfx('smokePuff');
  for (let i = 0; i < 7; i++) {
    const chip = sprite(c.scene, 'claychip', '#8c5a2b', aim.x, aim.y - 14, rnd(16, 26), DEPTH + 46).setRotation(rnd(0, 6));
    c.scene.tweens.add({ targets: chip, x: aim.x + rnd(-120, 120), rotation: chip.rotation + rnd(-6, 6), duration: slow(rnd(380, 560)), onComplete: () => chip.destroy() });
    c.scene.tweens.add({ targets: chip, y: aim.y - rnd(40, 110), duration: slow(160), ease: 'Quad.easeOut', onComplete: () => c.scene.tweens.add({ targets: chip, y: aim.y + rnd(0, 20), alpha: 0, duration: slow(260), ease: 'Quad.easeIn' }) });
  }
  burst(c.scene, aim.x, aim.y - 14, { colors: ['#ffffff', '#ffd23f', '#ff8a1f'], n: 6, speed: [80, 220], gravity: 200, life: [140, 260], size: [6, 10] });
  void ring(c.scene, aim.x, aim.y, { r: Math.abs(gridSteps(c.board).R.x) * 0.9, flat: 0.32, n: 28, colors: ['#d7dce6', '#98a2b4', '#5b6579'], dur: 420, size: 12 });
  shake(c.scene, 110, 0.003);
  // zeminde koyu duman gölgesi (hücrelere oturur)
  const floor = c.scene.add.graphics().setDepth(FLOOR_FX + 2).setAlpha(0);
  fillCells(floor, c.board, slots, { fill: 0x2a2f36, fillA: 0.5, edge: 0x98a2b4, edgeA: 0.45, edgeW: 3, k: 1 });
  c.scene.tweens.add({ targets: floor, alpha: 1, duration: slow(160) });
  c.scene.tweens.add({ targets: floor, alpha: 0, delay: slow(1400), duration: slow(700), onComplete: () => floor.destroy() });
  // duman bulutu: her hücrede karakterlerin önünde ve arkasında kabaran yumaklar (bomba noktasından hücreye doğru kısa gecikme)
  const cellW = Math.abs(gridSteps(c.board).R.x);
  for (const s of slots) {
    const m = cellMid(c.board, s);
    const lag = Math.hypot(m.x - aim.x, m.y - aim.y) / 3;
    void wait(c.scene, slow(lag)).then(() => {
      const q = quadOf(c.board, s, 0.95);
      for (let k = 0; k < 4; k++) {
        const p = inQuad(q, 0.9);
        smokePuffs(c.scene, p.x, p.y - 10, { n: 1, spread: 6, size: [cellW * 0.8, cellW * 1.15], rise: 24, life: 1300, hold: 500, alpha: 0.88, depth: p.y + (k % 2 ? 2 : -2) });
      }
      smokePuffs(c.scene, m.x, m.y - 90, { n: 2, spread: cellW * 0.3, size: [cellW * 0.7, cellW * 1.0], rise: 50, life: 1300, hold: 300, alpha: 0.5 });
    });
  }
  await wait(c.scene, slow(220));
  // durum görselleri
  for (const t of c.targets) {
    const head = { x: t.container.x, y: t.container.y - t.h * 0.86 };
    if (!own) {
      // Blinded: gözlerin önünden geçen koyu duman şeridi + öksürük sarsıntısı
      const band = c.scene.add.image(head.x - dirTo(a, t.container) * 40, head.y, smokeTexture(c.scene)).setDisplaySize(t.w * 0.3, 18).setTint(0x30353c).setAlpha(0).setDepth(t.container.depth + 3);
      c.scene.tweens.add({ targets: band, x: head.x, displayWidth: t.w * 0.85, displayHeight: 30, alpha: 0.95, duration: slow(220), ease: 'Quad.easeOut' });
      c.scene.tweens.add({ targets: band, alpha: 0, displayWidth: t.w * 1.1, y: head.y - 16, delay: slow(820), duration: slow(420), onComplete: () => band.destroy() });
      smokePuffs(c.scene, head.x, head.y, { n: 2, spread: t.w * 0.2, size: [30, 46], rise: 30, life: 900, hold: 200, alpha: 0.7, tint: 0x8a929c, depth: t.container.depth + 3 });
      c.scene.tweens.add({ targets: t.container, x: t.container.x + 5, duration: slow(45), yoyo: true, repeat: 3, delay: slow(160) });
    } else {
      // Shrouded: çevresinde dönen yumuşak duman perdesi; silueti bir an soluklaşır
      const body = spot(t);
      for (let k = 0; k < 4; k++) {
        const veil = c.scene.add.image(body.x, body.y, smokeTexture(c.scene)).setDisplaySize(t.w * 0.7, t.h * 0.45).setAlpha(0).setDepth(t.container.depth + (k % 2 ? 1 : -1));
        void counter(c.scene, slow(1000), (u) => {
          const ang = u * Math.PI * 2.2 + (k * Math.PI) / 2;
          veil.setPosition(snap(body.x + Math.cos(ang) * t.w * 0.38), snap(body.y + Math.sin(ang) * 14 + (k - 1.5) * t.h * 0.12));
          veil.setDepth(t.container.depth + (Math.sin(ang) > 0 ? 1 : -1));
          veil.setAlpha(Math.sin(u * Math.PI) * 0.6);
        }).then(() => veil.destroy());
      }
      c.scene.tweens.add({ targets: t.container, alpha: 0.5, duration: slow(260), yoyo: true, hold: slow(380), ease: 'Sine.easeInOut', onComplete: () => t.container.setAlpha(1) });
    }
  }
  hit();
  await wait(c.scene, slow(600));
});

/**
 * Backstab (garantili kritik): Cutthroat dumana dönüşüp kaybolur (kapüşonlu siluet çözülür), hedefin ARKASINDAKİ hücrede (ctx.behind)
 * duman patlamasıyla belirir ve hedefe dönük, hançerini sırtına gömer: kızıl-beyaz şok halkası, kan, sert sarsıntı ve çok kısa donma (hitstop).
 * Sonra yine dumanla kaybolup kendi hücresinde belirir. Tahta/ayna: arka hücre konumu olaydan gelir; sprite yönü vuruş anında hedefe çevrilir.
 */
const backstab = async (c: VfxCtx) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const away = t.container.x >= a.container.x ? 1 : -1;
  const behind = c.behind ?? { x: t.container.x + away * Math.abs(gridSteps(c.board).R.x), y: t.container.y };
  const face = t.container.x >= behind.x ? 1 : -1; // arkadan hedefe bakış yönü
  // 1) kaybolma
  c.sfx('shadowStep');
  a.play('cast');
  await shadowStepFx(c.scene, a, false, 150);
  await wait(c.scene, slow(60));
  // 2) arkada belirme (hedefe dönük)
  a.container.setPosition(behind.x, behind.y).setDepth(t.container.depth + 1);
  a.sprite.setFlipX(face < 0);
  await shadowStepFx(c.scene, a, true, 110);
  // 3) saplama
  a.play('attack');
  // arka hücreden hedefin sırtına tek adımda atılır (çömelip fırlama), saplar, geri sekip arka hücrede durur
  const reach = t.container.x - face * (t.w * 0.3 + a.w * 0.22);
  await new Promise<void>((resolve) => c.scene.tweens.add({ targets: a.container, x: behind.x - face * 14, duration: slow(60), ease: 'Quad.easeOut', onComplete: () => resolve() }));
  c.scene.tweens.add({ targets: a.container, x: reach, duration: slow(70), ease: 'Quad.easeIn', yoyo: true, hold: slow(170) });
  for (let i = 0; i < 2; i++) void wait(c.scene, slow(20 + i * 25)).then(() => a.afterimage(SOOT, 0.4, 200));
  await wait(c.scene, slow(40));
  const p = { x: t.container.x - face * t.w * 0.16, y: t.container.y - t.h * 0.56 };
  const knife = sprite(c.scene, 'duelsword', '#c0203a', p.x - face * 70, p.y - 30, 72, t.container.depth + 2).setRotation(face > 0 ? Math.PI / 4 + 0.35 : -Math.PI / 4 - 0.35).setFlipX(face < 0);
  void travel(c.scene, knife, { x: p.x - face * 18, y: p.y - 6 }, 50, { ease: 'in' }).then(() => c.scene.tweens.add({ targets: knife, alpha: 0, delay: slow(160), duration: slow(200), onComplete: () => knife.destroy() }));
  await wait(c.scene, slow(50));
  c.sfx('backstabThud');
  c.sfx('bloodSplat');
  void ring(c.scene, p.x, p.y, { r: 110, flat: 0.95, n: 26, colors: ['#ffffff', '#ff7a6a', '#e5463b'], dur: 340, size: 12, startR: 10 });
  void ring(c.scene, p.x, p.y, { r: 170, flat: 0.95, n: 20, colors: ['#e5463b', '#8e1f2c'], dur: 460, size: 8, startR: 30 });
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    const len = rnd(60, 110);
    const line = c.scene.add.rectangle(p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 30, len, 4, k % 2 ? 0xffffff : 0xe5463b).setRotation(ang).setDepth(DEPTH + 50);
    c.scene.tweens.add({ targets: line, x: p.x + Math.cos(ang) * 90, y: p.y + Math.sin(ang) * 90, scaleX: 0.2, alpha: 0, duration: slow(220), onComplete: () => line.destroy() });
  }
  burst(c.scene, p.x, p.y, { colors: BLOOD, n: 18, speed: [160, 440], angle: face > 0 ? [-1.1, 0.5] : [Math.PI - 0.5, Math.PI + 1.1], gravity: 900, life: [400, 800], size: [8, 14] });
  flash(c.scene, '#8e1f2c', 0.28, 260);
  shake(c.scene, 220, 0.012);
  // hitstop: ikisi de bir an donar (hedef beyaza kesilir), sonra hasar akar
  t.sprite.setTintFill(0xffffff);
  await wait(c.scene, 70);
  t.sprite.clearTint();
  c.scene.tweens.add({ targets: t.container, x: t.container.x + face * 20, duration: slow(70), yoyo: true });
  // 4) dönüş: dumanla kaybol, evinde belir
  void (async () => {
    await wait(c.scene, slow(320));
    a.play('cast');
    await shadowStepFx(c.scene, a, false, 120);
    a.container.setPosition(a.home.x, a.home.y).setDepth(a.home.y);
    a.sprite.setFlipX(a.combatant.side === 'enemy');
    await shadowStepFx(c.scene, a, true, 120);
    a.play('idle');
  })();
};

// ---------------------------------------------------------------------------------------------------------------------
// UNDEAD: ceset tüketimi (Raise Dead, olay corpseConsumed)

/**
 * Ceset tüketimi: düşman cesedinin yuvasında kemik tozu kalkar, kemik kıymıkları sıçrar; cesetten Undead'in göğsüne kıvrılarak akan mor ruh
 * ipi (iki iplik + ruh pırıltıları) çekilir, Undead mor halkayla emer. Promise ip Undead'e varınca çözülür (çağrı efekti arkadan gelir).
 */
export async function corpseDrainFx(scene: Phaser.Scene, corpse: { x: number; y: number }, caster: CombatantView | undefined): Promise<void> {
  playSfx(scene, 'soulDrain');
  // kemik tozu ve kıymıklar
  dustCloud(scene, corpse.x, corpse.y, { n: 6, spread: 70, rise: 60, size: [34, 60], tint: 0xd9d4c0, life: 1000 });
  for (let i = 0; i < 5; i++) {
    const sp = sprite(scene, 'bonesliver', '#d9d4c0', corpse.x + rnd(-30, 30), corpse.y - 10, 30, DEPTH + 40).setRotation(rnd(0, 6));
    scene.tweens.add({ targets: sp, y: sp.y - rnd(40, 90), x: sp.x + rnd(-40, 40), rotation: sp.rotation + rnd(-4, 4), alpha: 0, duration: slow(rnd(500, 750)), onComplete: () => sp.destroy() });
  }
  burst(scene, corpse.x, corpse.y - 20, { colors: ['#b872ff', '#5a2a9c', '#e3ccff'], n: 10, speed: [30, 120], angle: [-Math.PI, 0], gravity: -140, life: [500, 900], size: [8, 12] });
  const glow = scene.add.ellipse(corpse.x, corpse.y - 2, 120, 34, 0x5a2a9c, 0.5).setDepth(FLOOR_FX + 3);
  scene.tweens.add({ targets: glow, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: slow(900), ease: 'Quad.easeIn', onComplete: () => glow.destroy() });
  if (!caster) {
    await wait(scene, slow(500));
    return;
  }
  const to = spot(caster);
  const from = { x: corpse.x, y: corpse.y - 40 };
  const g = scene.add.graphics().setDepth(DEPTH + 30);
  const draw = (head: number, tail: number, phase: number) => {
    g.clear();
    const n = 46;
    for (let strand = 0; strand < 2; strand++) {
      for (let i = Math.floor(n * tail); i <= n * head; i++) {
        const u = i / n;
        const w = Math.sin(u * Math.PI * 3 + phase + strand * Math.PI) * 14 * Math.sin(u * Math.PI);
        const x = snap(from.x + (to.x - from.x) * u);
        const y = snap(from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * 90 + w);
        g.fillStyle(strand ? 0x5a2a9c : 0xb872ff, 0.9).fillRect(x - 4, y - 4, 8, 8);
        if (i % 3 === 0) g.fillStyle(0xe3ccff, 1).fillRect(x - 2, y - 2, 4, 4);
      }
    }
  };
  await counter(scene, slow(520), (u) => draw(u, 0, u * 8), 'Quad.easeIn');
  // ruh pırıltıları ip boyunca Undead'e akar
  for (let k = 0; k < 4; k++) {
    const w = sprite(scene, 'wisp', '#b36bff', from.x, from.y, 40, DEPTH + 35).setAlpha(0.9);
    void travel(scene, w, to, 420, { arc: 90, ease: 'in' }).then(() => w.destroy());
    await wait(scene, slow(60));
  }
  void ring(scene, caster.container.x, caster.container.y - 4, { r: 110, flat: 0.32, n: 24, colors: ['#b872ff', '#5a2a9c', '#e3ccff'], dur: 480, size: 10 });
  caster.ring('#b872ff', 0.8);
  void counter(scene, slow(320), (u) => draw(1, u, 8 + u * 6)).then(() => g.destroy());
  await wait(scene, slow(200));
}

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
  rootfall,
  vinesnare,
  taunt: tauntFx,
  guardlink,
  tremor,
  fistcrush,
  taunt2,
  guard2,
  tremor2,
  fistcrush2,
  manasteal,
  drainfield,
  spellward,
  voidstrike,
  voidstrikespikes,
  loadeddice,
  duelbet,
  cardfan,
  allin,
  shaperow,
  shapecolumn,
  shaperect,
  shapeplus,
  venomedge,
  saltire,
  smokebomb,
  backstab,
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

/**
 * Çağrılan birim sahneye girerken oynayan efekt; birim görünür olunca (giriş bitince) Promise çözülür. İskelet mezardan, Treant topraktan çıkar.
 * Skeleton (Raise Dead, kendi tahtasında): `empowered` true = ceset tüketildi (beslenmiş): Undead'den çağrı yerine mor ruh ipi akar, mor ölü
 * ışığı, el/toz patlaması ve sonunda mor parlamayla doğar, gözleri mor yanar ve ömrü boyunca hafif mor aura taşır (CombatantView.setEmpowered).
 * `empowered` false = ceset yoktu (beslenmemiş): soluk, gri-kahve tozlu, daha zayıf ve titrek doğuş; parlama ve aura yok.
 */
export async function summonFx(scene: Phaser.Scene, unitId: string, view: CombatantView, o: { empowered?: boolean; caster?: CombatantView } = {}): Promise<void> {
  const f = feet(view);
  if (unitId === 'skeleton') {
    const fed = o.empowered !== false;
    const glowHex = fed ? 0xb36bff : 0x8a7f96;
    if (o.empowered) view.setEmpowered(false); // aura doğuşun sonunda "yanar"
    // 0) beslenmiş: Undead'den çağrı yerine akan mor ruh (cesetten emilen güç)
    if (o.empowered && o.caster) {
      const s = spot(o.caster);
      const w = sprite(scene, 'wisp', '#b36bff', s.x, s.y, 64, DEPTH + 35).setAlpha(0.95);
      await travel(scene, w, { x: f.x, y: f.y - 30 }, 420, { arc: 110, ease: 'in', trail: (x, y) => burst(scene, x, y, { colors: ['#b872ff', '#5a2a9c', '#e3ccff'], n: 2, speed: [10, 60], gravity: -40, life: [300, 520], size: [8, 12] }), trailEvery: 26 });
      w.destroy();
      void ring(scene, f.x, f.y, { r: 120, flat: 0.34, n: 26, colors: ['#e3ccff', '#b872ff'], dur: 380, size: 10 });
    }
    // 1) zemin çatlar, ölü ışığı sızar, yer titrer (beslenmemişte soluk ve kısa)
    const dim = scene.add.rectangle(960, 540, 1920, 1080, 0x10061a, 0).setDepth(DEPTH - 25);
    scene.tweens.add({ targets: dim, alpha: fed ? 0.4 : 0.2, duration: slow(500) });
    const glow = scene.add.ellipse(f.x, f.y, 40, 14, glowHex, fed ? 0.5 : 0.3).setDepth(DEPTH - 35);
    scene.tweens.add({ targets: glow, scaleX: fed ? 5 : 3.6, scaleY: fed ? 3 : 2.2, alpha: fed ? 0.85 : 0.4, duration: slow(900), yoyo: true });
    const circle = sprite(scene, 'circle', fed ? '#b36bff' : '#8a7f96', f.x, f.y, 260, DEPTH - 36).setScale(1.2, 0.42).setAlpha(fed ? 0.9 : 0.45);
    scene.tweens.add({ targets: circle, angle: 120, alpha: 0, duration: slow(1500), onComplete: () => circle.destroy() });
    cracks(scene, f.x, f.y, { len: fed ? 240 : 150, n: fed ? 12 : 7, dur: 1500 });
    shake(scene, fed ? 700 : 400, fed ? 0.004 : 0.0025);
    playSfx(scene, 'earthCrack');
    playSfx(scene, 'graveMoan');
    if (fed) burst(scene, f.x, f.y - 6, { colors: ['#b872ff', '#5a2a9c', '#a8ebff'], n: 14, speed: [20, 90], angle: [-Math.PI, 0], gravity: -90, life: [700, 1200], size: [10, 18] });
    else burst(scene, f.x, f.y - 6, { colors: ['#8a7f96', '#5b6579'], n: 6, speed: [20, 70], angle: [-Math.PI, 0], gravity: -60, life: [600, 1000], size: [8, 14] });
    dustCloud(scene, f.x, f.y, { n: fed ? 6 : 4, spread: 90, rise: 70, size: [40, 70] });
    await wait(scene, slow(fed ? 520 : 420));
    // 2) toprak patlar: toz bulutu, taş parçaları, çürük eller kenarlardan tırmanır
    dustCloud(scene, f.x, f.y, { n: fed ? 16 : 9, spread: 170, rise: fed ? 190 : 120, ...(fed ? {} : { tint: 0x9a8f80 }) });
    burst(scene, f.x, f.y - 10, { colors: ['#4a2e1a', '#8c5a2b', '#5b6579', '#98a2b4'], n: fed ? 26 : 14, speed: [140, fed ? 480 : 320], angle: [-Math.PI, 0], gravity: 900, life: [500, 1000], size: [10, 22] });
    void ring(scene, f.x, f.y, { r: fed ? 220 : 150, flat: 0.34, n: 40, colors: fed ? ['#b872ff', '#5a2a9c', '#98a2b4'] : ['#98a2b4', '#5b6579'], dur: 560, size: 12 });
    shake(scene, 260, fed ? 0.008 : 0.005);
    playSfx(scene, 'boneClatter');
    const hands: Phaser.GameObjects.Image[] = [];
    for (const dx of fed ? [-62, 58, -26, 30] : [-50, 44]) {
      const h = sprite(scene, 'undeadhand', fed ? '#b36bff' : '#8a7f96', f.x + dx, f.y + 6, 150, view.container.depth + 2).setRotation(dx < 0 ? 0.25 : -0.25);
      sprout(scene, h, 280);
      hands.push(h);
    }
    await wait(scene, slow(300));
    for (const h of hands) {
      h.setTexture(ensureIcon(scene, 'undeadhand2', fed ? '#b36bff' : '#8a7f96', false));
      scene.tweens.add({ targets: h, y: h.y - 14, rotation: h.rotation * -1, duration: slow(160), yoyo: true });
    }
    // 3) iskelet yerden çıkar: beslenmiş hızlı ve güçlü, beslenmemiş yavaş ve titrek
    const dustTick = scene.time.addEvent({ delay: slow(110), repeat: 8, callback: () => dustCloud(scene, f.x, f.y, { n: 3, spread: 120, rise: 90, size: [36, 70], life: 800 }) });
    playSfx(scene, 'thud');
    await view.riseFromGround(fed ? 900 : 1100, fed ? 5 : 8);
    dustTick.remove();
    if (fed) {
      flash(scene, '#b36bff', 0.28, 380);
      void ring(scene, f.x, f.y, { r: 170, flat: 0.34, n: 30, colors: ['#ffffff', '#b872ff'], dur: 480, size: 12 });
      if (o.empowered) {
        // beslenmiş: göz ve aura yanar (mor ışık patlaması gövdeden yükselir)
        view.setEmpowered(true);
        const b = spot(view);
        burst(scene, b.x, b.y, { colors: ['#e3ccff', '#b872ff', '#5a2a9c'], n: 16, speed: [60, 220], gravity: -120, life: [500, 900], size: [8, 14] });
        view.ring('#b872ff', 1);
      }
    } else {
      // beslenmemiş: sönük, gri bir halka; parlama yok
      void ring(scene, f.x, f.y, { r: 120, flat: 0.34, n: 20, colors: ['#98a2b4', '#5b6579'], dur: 420, size: 10 });
    }
    dustCloud(scene, f.x, f.y, { n: fed ? 10 : 6, spread: 150, rise: 140 });
    shake(scene, 200, fed ? 0.006 : 0.003);
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
