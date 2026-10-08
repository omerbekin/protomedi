import Phaser from 'phaser';
import { content } from '../engine';
import { playSfx } from './audio';
import type { CombatantView } from './combatant-view';
import type { VFX_BASE_KIT, VfxCtx } from './vfx';

/**
 * THE BRIDGE WARDEN (King's Bridge boss) efektleri: docs/design/bosses/bridge-warden.md 7.3. v1 piksel dili (vfx.ts yardımcıları `k` ile gelir;
 * bu dosya vfx.ts'i çalışma zamanında içe aktarmaz, döngüsel import yok). vfx.ts > VFX bu adları kaydeder (src/ui/vfx-kinds.ts):
 *
 *  Skill efektleri (skill.vfx):
 *   anchorsmash       Anchor Smash: zincir omuzdan savrulur, çapa yay çizip hedefe iner (taş kıymığı, toz halkası, sarsıntı).
 *   breakingspan      Breaking Span TELGRAFI: çapa Warden'ın önüne saplanır, çatlak zemin boyunca işaretli hücrelere koşar, dallanır, su püskürür.
 *   chainhook         Chain Hook: kanca zincirle uçar, saplanır, hedef çekilirken toz izi; kanca geri sarılır.
 *   ashbrand          Ash Brand: göğüs çatlağı parlar, kıvılcım kavisle hedefe uçar, göğsünde kızaran damga.
 *   fallofthebridge   Fall of King's Bridge TELGRAFI: iki zincir gerilir, ekran kararır, tahta kızıl çatlaklarla dolar, Keystone'lar altın yanar.
 *
 *  Olay efektleri (motor olaylarında sahne çağırır; aynı VfxCtx: board = vurulan tahta, slots = hücreler, targets = vurulan birimler):
 *   breakingspancollapse     Span çözülmesi: levhalar çöker, birimler düşüp sarsılır, alttan su sütunu, kalaslar döner; çapa saplı kalır (Overextended).
 *   ashbrandburst            Brand patlaması: damgalının hücresi merkezli plus'ta kor halkası + kül yağmuru (targets[0] = damgalı, varsa).
 *   fallofthebridgecollapse  Fall çözülmesi: Keystone (slots DIŞINDAKİ hücreler) hariç tüm taşlar kayar, büyük su patlaması, toz perdesi.
 *   wardenphase2             Faz II "The Ember wakes.": göğüs çatlağından kor fışkırır, gözler turuncu yanar (actor = Warden).
 *   wardenphase3             Faz III "The span fails.": sırttaki kemer taşları dökülür, çatlak genişler (actor = Warden).
 *   mooringbreak             Iron Mooring kırıldı: demir baba gıcırdayarak eğilir, zincir kopup suya düşer, Warden sendeler
 *                            (actor = Mooring, targets[0] = Warden, varsa). Sonra sahne birimi düşürür.
 *
 *  Kalıcı göstergeler (sahne çağırır, dönen nesneyi destroy() ile söndürür): telegraphCells (çatlak plaka nabzı: span / fall + Keystone / brand),
 *  brandMark (birimin göğsünde nabız atan damga). Flooded Planks zemini: vfx.ts > groundArea('flooded_planks', ...).
 *
 * Sesler (data/audio.json): chainDrag, anchorImpact, stoneCrack, timberSplinter, riverBurst, bridgeGroan, emberHiss, wardenGrowl, ironCreak.
 * Skill efektleri `c.sfx` ile çalar (skill.sfx listesinde olmalı); olay efektleri doğrudan çalar.
 */
type Kit = typeof VFX_BASE_KIT;
type Pt = { x: number; y: number };
type Board = 'party' | 'enemy';

const WATER = ['#ffffff', '#d8f2f0', '#8fcaca', '#2f6f73'];
const RUST = ['#8a4a25', '#b8682f', '#4a2e1a'];
const STONEW = ['#4a5560', '#6b7682', '#98a2b4', '#2c333a'];
const EMBER = ['#fff0c8', '#ffc46b', '#e0702a', '#ff8a1f'];
const ASH = ['#9a948a', '#6e6a63', '#c9c3b8'];
const MOSS = ['#5d6b3a', '#4d6547'];
const KEY_GOLD = 0xffd23f;

// ------------------------------------------------------------------------------------------------ küçük yardımcılar

/** Warden'ın yüzü karşı tarafa bakar: düşman tarafı sola (-1). */
const facing = (v: CombatantView) => (v.combatant.side === 'party' ? 1 : -1);
/** Çizimdeki el (çapalı el önde-altta), göğüs çatlağı ve yüz ızgarası (sağa bakan çizimde konumlar; düşmanda aynalanır). */
const handOf = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.36, y: v.container.y - v.h * 0.32 });
const chestOf = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.1, y: v.container.y - v.h * 0.56 });
const headOf = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.28, y: v.container.y - v.h * 0.72 });
const allSlots = () => Array.from({ length: content.GRID.lanes * content.GRID.rows }, (_, i) => i);
const cellsOf = (c: VfxCtx): number[] => (c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot));
const quadPoint = (q: Pt[], u: number, v: number): Pt => {
  const ax = q[0]!.x + (q[1]!.x - q[0]!.x) * u;
  const ay = q[0]!.y + (q[1]!.y - q[0]!.y) * u;
  const bx = q[3]!.x + (q[2]!.x - q[3]!.x) * u;
  const by = q[3]!.y + (q[2]!.y - q[3]!.y) * u;
  return { x: ax + (bx - ax) * v, y: ay + (by - ay) * v };
};
const shrink = (q: Pt[], s: number, dy = 0): Pt[] => {
  const cx = (q[0]!.x + q[2]!.x) / 2;
  const cy = (q[0]!.y + q[2]!.y) / 2;
  return q.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s + dy }));
};

/** Sarkık paslı zincir: from -> to arasında halka dizisi (`reveal` 0..1 kadarı çizilir). */
function drawChain(k: Kit, g: Phaser.GameObjects.Graphics, from: Pt, to: Pt, o: { sag?: number; reveal?: number; alpha?: number; glow?: number } = {}): void {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(4, Math.round(len / 13));
  const sag = o.sag ?? Math.min(60, len * 0.1);
  const a = o.alpha ?? 1;
  for (let i = 0; i <= n * (o.reveal ?? 1); i++) {
    const u = i / n;
    const x = k.snap(from.x + (to.x - from.x) * u);
    const y = k.snap(from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * sag);
    g.fillStyle(0x15101c, 0.65 * a).fillRect(x - 6, y - 4, 12, 9);
    if (i % 2) g.fillStyle(0x8a4a25, a).fillRect(x - 5, y - 2, 10, 4).fillStyle(0xb8682f, a).fillRect(x - 5, y - 2, 10, 2);
    else g.fillStyle(0x4a2e1a, a).fillRect(x - 3, y - 5, 6, 10).fillStyle(0x8a4a25, a).fillRect(x - 1, y - 3, 2, 6);
    if (o.glow) g.fillStyle(0xffc46b, o.glow * a).fillRect(x - 1, y - 1, 2, 2);
  }
}

/** Taş çatlağı: a'dan b'ye zikzak (koyu çekirdek + açık kenar); `glow` verilirse içinden renkli ışık sızar (su / kor). */
function crackLine(k: Kit, g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, w = 4, glow?: number, alpha = 1): Pt[] {
  const n = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14));
  const pts: Pt[] = [a];
  for (let i = 1; i < n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n + k.rnd(-7, 7), y: a.y + ((b.y - a.y) * i) / n + k.rnd(-3, 3) });
  pts.push(b);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    g.lineStyle(w + 3, 0x6b7682, 0.5 * alpha).lineBetween(p.x, p.y + 1, q.x, q.y + 1);
    g.lineStyle(w, 0x15101c, 0.95 * alpha).lineBetween(p.x, p.y, q.x, q.y);
    if (glow !== undefined) g.lineStyle(Math.max(1, w - 2), glow, 0.9 * alpha).lineBetween(p.x, p.y, q.x, q.y);
  }
  return pts;
}

/** Hücrenin içinde dallanan çatlak deseni (sabit, tohumlu değil; görsel). */
function cellCracks(k: Kit, g: Phaser.GameObjects.Graphics, q: Pt[], glow?: number, alpha = 1): void {
  const m = quadPoint(q, 0.5, 0.5);
  crackLine(k, g, m, quadPoint(q, 0.06, 0.18), 5, glow, alpha);
  crackLine(k, g, m, quadPoint(q, 0.94, 0.35), 5, glow, alpha);
  crackLine(k, g, m, quadPoint(q, 0.55, 0.96), 4, glow, alpha);
  crackLine(k, g, quadPoint(q, 0.3, 0.6), quadPoint(q, 0.08, 0.88), 3, glow, alpha);
  crackLine(k, g, quadPoint(q, 0.7, 0.42), quadPoint(q, 0.82, 0.08), 3, glow, alpha);
}

/** Alttan fışkıran su sütunu (beyaz-yeşil piksel sütun + geri düşen damlalar). */
function waterColumn(k: Kit, scene: Phaser.Scene, x: number, y: number, h: number, depth: number): void {
  const g = scene.add.graphics().setDepth(depth);
  const cols = [0xffffff, 0xd8f2f0, 0x8fcaca, 0x2f6f73];
  const drops = Array.from({ length: 26 }, () => ({ dx: k.rnd(-26, 26), ph: k.rnd(0, 1), s: k.snap(k.rnd(4, 9)), c: cols[Math.floor(k.rnd(0, 3.99))]! }));
  void k.counter(scene, k.slow(760), (u) => {
    g.clear();
    const top = h * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, u - 0.55) * 1.6);
    for (const d of drops) {
      const t = (d.ph + u * 1.4) % 1;
      const py = y - top * t;
      const spread = 1 + t * 0.6;
      g.fillStyle(d.c, (1 - u * u) * 0.95).fillRect(k.snap(x + d.dx * spread) - d.s / 2, k.snap(py), d.s, d.s * 1.4);
    }
    g.fillStyle(0xd8f2f0, 0.35 * (1 - u)).fillEllipse(x, y, 74, 18);
    if (u >= 1) g.destroy();
  });
  k.burst(scene, x, y - h * 0.6, { colors: WATER, n: 10, speed: [120, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [500, 900], size: [6, 12] });
}

/** Havada dönen kırık kalas. */
function flyingPlank(k: Kit, scene: Phaser.Scene, x: number, y: number): void {
  const p = k.sprite(scene, 'plank', '#8a4a25', x, y, k.rnd(40, 58), k.DEPTH + 30).setRotation(k.rnd(-1, 1));
  const vx = k.rnd(-160, 160);
  const vy = k.rnd(-520, -340);
  const spin = k.rnd(-8, 8);
  const life = k.slow(k.rnd(700, 950));
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: life,
    onUpdate: (tw) => {
      const t = ((tw.getValue() ?? 0) * life) / 1000;
      p.setPosition(k.snap(x + vx * t), k.snap(y + vy * t + 0.5 * 1300 * t * t));
      p.setRotation(Math.round((spin * t) / (Math.PI / 8)) * (Math.PI / 8));
      p.setAlpha(1 - Math.max(0, (tw.getValue() ?? 0) - 0.7) / 0.3);
    },
    onComplete: () => p.destroy(),
  });
}

/** Hücre çökmesi: koyu boşluk açılır, taş levha parçaları içe düşer; `onDrop` levhanın çöktüğü an. Graphics döner (sonra söner). */
function collapseCell(k: Kit, scene: Phaser.Scene, board: Board, slot: number, delay: number, onDrop: () => void): void {
  const q = k.quadOf(board, slot, 0.96);
  const g = scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 4);
  const shards = Array.from({ length: 4 }, (_, i) => ({ u: i % 2 ? 0.27 : 0.73, v: i < 2 ? 0.28 : 0.72 }));
  let dropped = false;
  void k.wait(scene, k.slow(delay)).then(() =>
    k.counter(scene, k.slow(900), (u) => {
      g.clear();
      // boşluk (nehir görünür): koyu + alttan su parıltısı
      const open = Math.min(1, u * 3);
      g.fillStyle(0x0d1418, 0.9 * (1 - Math.max(0, u - 0.75) * 4)).fillPoints(shrink(q, 0.2 + open * 0.8), true);
      g.fillStyle(0x2f6f73, 0.5 * open * (1 - Math.max(0, u - 0.75) * 4)).fillPoints(shrink(q, (0.2 + open * 0.8) * 0.6, 4), true);
      // levha parçaları: çeyrek dörtgenler içe ve aşağı düşer, küçülür
      for (const s of shards) {
        const fall = Math.max(0, u - 0.08) * 1.4;
        if (fall >= 1) continue;
        const c = quadPoint(q, s.u, s.v);
        const sub = shrink(q, 0.48 * (1 - fall * 0.6)).map((p) => {
          const cx = (q[0]!.x + q[2]!.x) / 2;
          const cy = (q[0]!.y + q[2]!.y) / 2;
          return { x: p.x - cx + c.x, y: p.y - cy + c.y + fall * fall * 70 };
        });
        g.fillStyle(0x2c333a, 1 - fall).fillPoints(sub.map((p) => ({ x: p.x, y: p.y + 6 })), true);
        g.fillStyle(0x6b7682, 1 - fall).fillPoints(sub, true);
        g.lineStyle(2, 0x15101c, 1 - fall);
        for (let i = 0; i < 4; i++) g.lineBetween(sub[i]!.x, sub[i]!.y, sub[(i + 1) % 4]!.x, sub[(i + 1) % 4]!.y);
      }
      if (!dropped && u > 0.12) {
        dropped = true;
        onDrop();
      }
      if (u >= 1) g.destroy();
    }),
  );
}

/** Birimi kısa düşüş-sarsıntıyla oynatır (12 px aşağı-yukarı). */
const dropShake = (k: Kit, scene: Phaser.Scene, v: CombatantView) =>
  scene.tweens.add({ targets: v.container, y: v.container.y + 12, duration: k.slow(90), yoyo: true, repeat: 1, ease: 'Quad.easeOut' });

/** Çapayı Warden'ın önündeki köprüye saplar (görsel); sprite döner (sonra söndürülür). */
async function plantAnchor(k: Kit, c: VfxCtx, hold: boolean): Promise<Phaser.GameObjects.Image> {
  const a = c.actor;
  const dir = facing(a);
  const at = { x: a.container.x + dir * (a.w * 0.5 + 30), y: a.container.y + 4 };
  const an = k.sprite(c.scene, 'anchor', '#8a4a25', at.x, at.y - 220, 120, at.y + 3).setOrigin(0.5, 0.92).setRotation(-dir * 0.25);
  const chain = c.scene.add.graphics().setDepth(at.y + 2);
  const hand = handOf(a);
  a.play('attack');
  await k.counter(c.scene, k.slow(260), (u) => {
    an.setPosition(k.snap(at.x), k.snap(at.y - 220 * (1 - u * u)));
    chain.clear();
    drawChain(k, chain, hand, { x: an.x, y: an.y - 100 }, { sag: 20 });
  });
  k.shake(c.scene, 300, 0.012);
  k.burst(c.scene, at.x, at.y - 8, { colors: STONEW, n: 16, speed: [140, 420], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1000, life: [450, 850], size: [8, 16] });
  k.dustCloud(c.scene, at.x, at.y, { n: 5, spread: 70, rise: 60, size: [50, 90], life: 900, tint: 0x8a8a84 });
  void k.ring(c.scene, at.x, at.y, { r: 140, flat: 0.3, n: 26, colors: ['#ffffff', ...STONEW], dur: 420, size: 11 });
  if (!hold) {
    c.scene.tweens.add({ targets: [an, chain], alpha: 0, delay: k.slow(700), duration: k.slow(400), onComplete: () => { an.destroy(); chain.destroy(); } });
  } else {
    // Overextended: çapa saplı kalır, zincir gergin; bir süre sonra söner (durum rozeti sahnede kalır)
    c.scene.tweens.add({ targets: an, x: an.x + 2, duration: k.slow(40), yoyo: true, repeat: 5 });
    c.scene.tweens.add({ targets: [an, chain], alpha: 0, delay: k.slow(1700), duration: k.slow(500), onComplete: () => { an.destroy(); chain.destroy(); } });
  }
  return an;
}

// ------------------------------------------------------------------------------------------------ skill efektleri

/** Anchor Smash: zincir omuzdan savrulur, çapa yay çizip ön sıradaki hedefe iner. */
export async function anchorsmash(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  const t = c.targets[0];
  const dir = t ? k.dirTo(a, t.container) : facing(a);
  const land = t ? { x: t.container.x, y: t.container.y - 18 } : (c.centerPos ?? { x: a.container.x + dir * 400, y: a.container.y });
  c.sfx('chainDrag');
  a.play('attack');
  const home = a.container.x;
  c.scene.tweens.add({ targets: a.container, x: home + dir * 36, duration: k.slow(240), yoyo: true, hold: k.slow(420), ease: 'Quad.easeOut' });
  const hand = handOf(a);
  const start = { x: a.container.x - dir * a.w * 0.2, y: a.container.y - a.h * 0.95 };
  const an = k.sprite(c.scene, 'anchor', '#8a4a25', start.x, start.y, 104, k.DEPTH + 25).setRotation(-dir * 2.4);
  const chain = c.scene.add.graphics().setDepth(k.DEPTH + 24);
  // savuruş: omuz üstünden geriye kalkış, sonra ileri yay
  await k.counter(c.scene, k.slow(220), (u) => {
    an.setPosition(k.snap(start.x - dir * 30 * u), k.snap(start.y - 30 * u));
    chain.clear();
    drawChain(k, chain, hand, an, { sag: 10 });
  }, 'Quad.easeOut');
  const p0 = { x: an.x, y: an.y };
  await k.counter(c.scene, k.slow(330), (u) => {
    const e = u * u;
    an.setPosition(k.snap(p0.x + (land.x - p0.x) * e), k.snap(p0.y + (land.y - p0.y) * e - Math.sin(u * Math.PI) * 160));
    an.setRotation(-dir * 2.4 + dir * (2.4 + 0.2) * e);
    chain.clear();
    drawChain(k, chain, handOf(a), an, { sag: 30 * (1 - u) });
  });
  c.sfx('anchorImpact');
  k.shake(c.scene, 280, 0.013);
  k.burst(c.scene, land.x, land.y + 10, { colors: STONEW, n: 18, speed: [160, 460], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1000, life: [400, 800], size: [8, 16] });
  k.burst(c.scene, land.x, land.y, { colors: RUST, n: 6, speed: [80, 220], gravity: 700, life: [300, 520], size: [6, 10] });
  k.dustCloud(c.scene, land.x, land.y + 14, { n: 6, spread: 80, rise: 60, size: [44, 80], life: 900, tint: 0x8a8a84 });
  void k.ring(c.scene, land.x, land.y + 16, { r: 150, flat: 0.32, n: 28, colors: ['#ffffff', '#c9c3b8', ...STONEW], dur: 440, size: 11 });
  k.cracks(c.scene, land.x, land.y + 16, { len: 90, n: 7, dur: 900 });
  // çapa bir an yerde kalır, sonra zincirle geri sarılır
  void k.wait(c.scene, k.slow(260)).then(() =>
    k.counter(c.scene, k.slow(320), (u) => {
      const h = handOf(a);
      an.setPosition(k.snap(land.x + (h.x - land.x) * u * u), k.snap(land.y + (h.y - land.y) * u * u - Math.sin(u * Math.PI) * 60)).setAlpha(1 - u * 0.8);
      chain.clear();
      drawChain(k, chain, h, an, { sag: 20, alpha: 1 - u });
    }).then(() => {
      an.destroy();
      chain.destroy();
      a.play('idle');
    }),
  );
}

/** Breaking Span telgrafı: çapa köprüye saplanır; çatlak zeminden işaretli hücrelere koşar ve dallanır, çatlaklardan su püskürür. */
export async function breakingspan(c: VfxCtx, k: Kit): Promise<void> {
  const slots = cellsOf(c);
  c.sfx('chainDrag');
  const an = await plantAnchor(k, c, false);
  c.sfx('stoneCrack');
  const origin = { x: an.x, y: an.y };
  const mids = [...slots].sort((p, q) => Math.hypot(k.cellMid(c.board, p).x - origin.x, 0) - Math.hypot(k.cellMid(c.board, q).x - origin.x, 0)).map((s) => ({ s, m: k.cellMid(c.board, s) }));
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 3);
  const plates = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 2);
  // ana çatlak: çapadan en yakın işaretli hücreye zemin boyunca
  const first = mids[0]?.m ?? c.centerPos ?? origin;
  const RUN = 420;
  let drawnTo = 0;
  const path = [origin, { x: (origin.x + first.x) / 2, y: (origin.y + first.y) / 2 + 20 }, first];
  await k.counter(c.scene, k.slow(RUN), (u) => {
    const seg = Math.min(path.length - 1, Math.floor(u * (path.length - 1)) + 1);
    while (drawnTo < seg) {
      crackLine(k, g, path[drawnTo]!, path[drawnTo + 1]!, 4, 0x8fcaca);
      k.burst(c.scene, path[drawnTo + 1]!.x, path[drawnTo + 1]!.y - 4, { colors: STONEW, n: 3, speed: [80, 200], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 900, life: [300, 500], size: [6, 10] });
      drawnTo++;
    }
  });
  // işaretli hücrelerde dallanma + su püskürmesi; plaka pas turuncusu kenarla belirir
  for (const [i, { s, m }] of mids.entries()) {
    void k.wait(c.scene, k.slow(i * 70)).then(() => {
      const q = k.quadOf(c.board, s, 0.96);
      if (i > 0) crackLine(k, g, mids[i - 1]!.m, m, 3, 0x8fcaca);
      cellCracks(k, g, q, 0x8fcaca);
      k.burst(c.scene, m.x, m.y - 4, { colors: WATER, n: 8, speed: [140, 320], angle: [-Math.PI * 0.62, -Math.PI * 0.38], gravity: 1100, life: [380, 640], size: [5, 9] });
      k.shake(c.scene, 90, 0.003);
    });
  }
  await k.wait(c.scene, k.slow(mids.length * 70 + 120));
  // iki nabız: çatlak plakalar yavaşça nefes alır (kalıcı gösterge sahnenin telegraphCells'i)
  await k.counter(c.scene, k.slow(700), (u) => {
    plates.clear();
    k.fillCells(plates, c.board, slots, { fill: 0x8a4a25, fillA: 0.28 * Math.sin(u * Math.PI * 2) ** 2, edge: 0xe0702a, edgeA: 0.85, edgeW: 3 });
  });
  c.scene.tweens.add({ targets: [g, plates], alpha: 0, delay: k.slow(200), duration: k.slow(600), onComplete: () => { g.destroy(); plates.destroy(); } });
}

/** Chain Hook: kanca zincirle hedefe uçar, saplanır; hedef çekilirken toz izi, kanca geri sarılır. */
export async function chainhook(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  const t = c.targets[0];
  if (!t) return;
  c.sfx('chainDrag');
  a.play('cast');
  const hand = handOf(a);
  const hook = k.sprite(c.scene, 'hook', '#6b7682', hand.x, hand.y, 72, k.DEPTH + 26);
  const chain = c.scene.add.graphics().setDepth(k.DEPTH + 25);
  const aim = () => ({ x: t.container.x, y: t.container.y - t.h * 0.5 });
  hook.setRotation(Math.atan2(aim().y - hand.y, aim().x - hand.x) - Math.PI / 2);
  await k.counter(c.scene, k.slow(360), (u) => {
    const to = aim();
    hook.setPosition(k.snap(hand.x + (to.x - hand.x) * u), k.snap(hand.y + (to.y - hand.y) * u - Math.sin(u * Math.PI) * 70));
    chain.clear();
    drawChain(k, chain, hand, hook, { sag: 12 });
  });
  c.sfx('ironCreak');
  k.hit(c.scene, hook.x, hook.y, ['#ffffff', '#c9c3b8', '#e5463b'], 0.7);
  k.shake(c.scene, 120, 0.005);
  // çekiş: zincir gerilir, hedefin ayağında toz izi (sahne hedefi ön hücreye taşırken izler)
  const dust = c.scene.time.addEvent({
    delay: k.slow(55),
    repeat: 10,
    callback: () => k.dustCloud(c.scene, t.container.x, t.container.y, { n: 1, spread: 16, rise: 26, size: [26, 44], life: 600, tint: 0x8a8a84 }),
  });
  void k.counter(c.scene, k.slow(620), (u) => {
    const to = aim();
    hook.setPosition(k.snap(to.x), k.snap(to.y));
    chain.clear();
    drawChain(k, chain, handOf(a), to, { sag: 4 * (1 - u), glow: u < 0.5 ? 0.6 : 0 });
  }).then(() =>
    k.counter(c.scene, k.slow(300), (u) => {
      const h = handOf(a);
      const from = aim();
      hook.setPosition(k.snap(from.x + (h.x - from.x) * u), k.snap(from.y + (h.y - from.y) * u)).setAlpha(1 - u * 0.7);
      chain.clear();
      drawChain(k, chain, h, hook, { sag: 18 * u, alpha: 1 - u });
    }).then(() => {
      dust.remove(false);
      hook.destroy();
      chain.destroy();
      a.play('idle');
    }),
  );
}

/** Ash Brand: göğüs çatlağı parlar, kıvılcım kavisle hedefe uçar, göğsünde kızaran damga. */
export async function ashbrand(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  const t = c.targets[0];
  a.play('cast');
  const chest = chestOf(a);
  const glow = c.scene.add.ellipse(chest.x, chest.y, 40, 70, 0xe0702a, 0).setDepth(k.DEPTH + 10).setBlendMode(Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: glow, alpha: 0.75, scaleX: 1.6, scaleY: 1.3, duration: k.slow(300), yoyo: true, hold: k.slow(160) });
  c.sfx('emberHiss');
  k.burst(c.scene, chest.x, chest.y, { colors: EMBER, n: 8, speed: [40, 140], gravity: -120, life: [400, 700], size: [5, 9] });
  await k.wait(c.scene, k.slow(320));
  if (!t) return;
  const to = { x: t.container.x, y: t.container.y - t.h * 0.55 };
  const ember = k.sprite(c.scene, 'ember', '#e0702a', chest.x, chest.y, 34, k.DEPTH + 30);
  await k.travel(c.scene, ember, to, 420, {
    arc: 120,
    trail: (x, y) => k.burst(c.scene, x, y, { colors: [...EMBER, ...ASH], n: 2, speed: [10, 60], gravity: -40, life: [260, 460], size: [5, 8] }),
    trailEvery: 24,
  });
  ember.destroy();
  c.sfx('emberHiss');
  const mark = k.sprite(c.scene, 'brandmark', '#e0702a', to.x, to.y, 44, k.DEPTH + 31).setAlpha(0.95);
  k.grow(c.scene, mark, 0.3, 1, 180, 'Back.easeOut');
  k.burst(c.scene, to.x, to.y, { colors: [...EMBER, ...ASH], n: 12, speed: [60, 220], gravity: 200, life: [360, 700], size: [5, 10] });
  t.hit(0.08);
  c.scene.tweens.add({ targets: mark, alpha: 0.4, duration: k.slow(160), yoyo: true, repeat: 2, onComplete: () => c.scene.tweens.add({ targets: mark, alpha: 0, duration: k.slow(260), onComplete: () => mark.destroy() }) });
  c.scene.tweens.add({ targets: glow, alpha: 0, duration: k.slow(300), onComplete: () => glow.destroy() });
  void k.wait(c.scene, k.slow(400)).then(() => a.play('idle'));
}

/** Fall of King's Bridge telgrafı: iki zincir gerilir, ekran kararır, tüm tahta kızıl çatlaklarla dolar, Keystone'lar altın yanar. */
export async function fallofthebridge(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  const slots = cellsOf(c);
  const keys = allSlots().filter((s) => !slots.includes(s));
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x0a0606, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.15, duration: k.slow(400) });
  c.sfx('bridgeGroan');
  c.sfx('wardenGrowl');
  a.play('cast');
  // iki zincir: Warden'ın kollarından arkadaki palamarlara gerilir, savrulur (Faz III'te kopuk)
  const chains = c.scene.add.graphics().setDepth(k.DEPTH + 20);
  const back = facing(a) * -1;
  const ends = [
    { x: a.container.x + back * 260, y: a.container.y - 30 },
    { x: a.container.x + back * 220, y: a.container.y - a.h * 0.9 },
  ];
  await k.counter(c.scene, k.slow(520), (u) => {
    chains.clear();
    const pull = Math.sin(u * Math.PI);
    for (const e of ends) drawChain(k, chains, handOf(a), { x: e.x - back * 40 * pull, y: e.y + 20 * pull }, { sag: 50 * (1 - pull), glow: pull * 0.5 });
  });
  k.shake(c.scene, 600, 0.008);
  c.sfx('stoneCrack');
  c.scene.tweens.add({ targets: chains, alpha: 0, duration: k.slow(300), onComplete: () => chains.destroy() });
  // tahta: kızıl çatlaklar hücreden hücreye yayılır (öndeki sıradan geriye)
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 3);
  const plates = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 2);
  const order = [...slots].sort((p, q) => Math.floor(p / content.GRID.lanes) - Math.floor(q / content.GRID.lanes));
  for (const [i, s] of order.entries()) {
    void k.wait(c.scene, k.slow(i * 45)).then(() => {
      const q = k.quadOf(c.board, s, 0.96);
      cellCracks(k, g, q, 0xe0702a);
      const m = k.cellMid(c.board, s);
      k.burst(c.scene, m.x, m.y - 4, { colors: STONEW, n: 3, speed: [60, 160], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 900, life: [300, 500], size: [6, 10] });
    });
  }
  // Keystone'lar: altın kemer taşı belirir, yükselir
  const keyIcons: Phaser.GameObjects.Image[] = [];
  for (const s of keys) {
    const m = k.cellMid(c.board, s);
    const ic = k.sprite(c.scene, 'keystone', '#ffd23f', m.x, m.y - 30, 56, k.DEPTH + 5).setAlpha(0);
    c.scene.tweens.add({ targets: ic, alpha: 1, y: m.y - 46, delay: k.slow(order.length * 45 + 120), duration: k.slow(360), ease: 'Back.easeOut' });
    keyIcons.push(ic);
  }
  await k.wait(c.scene, k.slow(order.length * 45 + 200));
  await k.counter(c.scene, k.slow(800), (u) => {
    plates.clear();
    const p = Math.sin(u * Math.PI * 2) ** 2;
    k.fillCells(plates, c.board, slots, { fill: 0x8e1f2c, fillA: 0.18 + 0.2 * p, edge: 0xe0702a, edgeA: 0.9, edgeW: 3 });
    if (keys.length) for (const s of keys) k.fillCells(plates, c.board, [s], { fill: KEY_GOLD, fillA: 0.22 + 0.18 * p, edge: KEY_GOLD, edgeA: 1, edgeW: 4 });
  });
  c.scene.tweens.add({ targets: [g, plates, dim, ...keyIcons], alpha: 0, delay: k.slow(150), duration: k.slow(600), onComplete: () => { g.destroy(); plates.destroy(); dim.destroy(); keyIcons.forEach((i) => i.destroy()); } });
  void k.wait(c.scene, k.slow(300)).then(() => a.play('idle'));
}

// ------------------------------------------------------------------------------------------------ olay efektleri

/** Breaking Span çözülmesi: levhalar içe çöker, birimler düşüp sarsılır, alttan su sütunu, kalaslar döner; çapa saplı kalır. */
export async function breakingspancollapse(c: VfxCtx, k: Kit): Promise<void> {
  const slots = cellsOf(c);
  playSfx(c.scene, 'stoneCrack');
  void plantAnchor(k, c, true);
  await k.wait(c.scene, k.slow(200));
  playSfx(c.scene, 'timberSplinter');
  let resolveHit!: () => void;
  const hitP = new Promise<void>((r) => (resolveHit = r));
  slots.forEach((s, i) => {
    collapseCell(k, c.scene, c.board, s, 0, () => {
      const m = k.cellMid(c.board, s);
      waterColumn(k, c.scene, m.x, m.y, 170, k.DEPTH + 15);
      flyingPlank(k, c.scene, m.x + k.rnd(-30, 30), m.y - 10);
      if (i % 2 === 0) flyingPlank(k, c.scene, m.x + k.rnd(-30, 30), m.y - 6);
      k.burst(c.scene, m.x, m.y - 6, { colors: STONEW, n: 6, speed: [100, 300], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 1000, life: [400, 700], size: [7, 13] });
      if (i === 0) {
        playSfx(c.scene, 'riverBurst');
        k.shake(c.scene, 420, 0.012);
        resolveHit();
      }
    });
  });
  for (const t of c.targets) dropShake(k, c.scene, t);
  if (!slots.length) resolveHit();
  await hitP;
}

/** Ash Brand patlaması: damga patlar; plus şeklinde kor halkası, hücrelerde kor parlaması ve kül yağmuru. */
export async function ashbrandburst(c: VfxCtx, k: Kit): Promise<void> {
  const slots = cellsOf(c);
  const carrier = c.targets[0];
  const center = carrier ? { x: carrier.container.x, y: carrier.container.y - carrier.h * 0.55 } : (c.centerPos ?? k.cellMid(c.board, slots[0] ?? 0));
  const mark = k.sprite(c.scene, 'brandmark', '#e0702a', center.x, center.y, 44, k.DEPTH + 31);
  k.grow(c.scene, mark, 1, 2.2, 220);
  c.scene.tweens.add({ targets: mark, alpha: 0, duration: k.slow(240), onComplete: () => mark.destroy() });
  playSfx(c.scene, 'emberHiss');
  playSfx(c.scene, 'anchorImpact');
  k.flash(c.scene, '#e0702a', 0.12, 220);
  k.shake(c.scene, 220, 0.008);
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 4);
  void k.counter(c.scene, k.slow(700), (u) => {
    g.clear();
    k.fillCells(g, c.board, slots, { fill: 0xe0702a, fillA: 0.55 * (1 - u), edge: 0xffc46b, edgeA: 1 - u, edgeW: 3 });
    if (u >= 1) g.destroy();
  });
  for (const s of slots) {
    const m = k.cellMid(c.board, s);
    k.burst(c.scene, m.x, m.y - 10, { colors: EMBER, n: 10, speed: [80, 260], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 300, life: [400, 700], size: [6, 11] });
    void k.ring(c.scene, m.x, m.y, { r: 70, flat: 0.32, n: 14, colors: EMBER, dur: 380, size: 9 });
    // kül yağmuru: yukarıdan yavaşça süzülen gri pullar
    k.burst(c.scene, m.x, m.y - 160, { colors: ASH, n: 6, speed: [10, 50], angle: [Math.PI * 0.3, Math.PI * 0.7], gravity: 120, life: [900, 1400], size: [5, 8] });
  }
  for (const t of c.targets) t.hit(0.1);
  await k.wait(c.scene, k.slow(120));
}

/** Fall of King's Bridge çözülmesi: Keystone dışındaki taşlar kayar, büyük su patlaması, toz perdesi; Keystone'lar sabit kalır. */
export async function fallofthebridgecollapse(c: VfxCtx, k: Kit): Promise<void> {
  const slots = cellsOf(c);
  const keys = allSlots().filter((s) => !slots.includes(s));
  playSfx(c.scene, 'bridgeGroan');
  playSfx(c.scene, 'stoneCrack');
  void plantAnchor(k, c, true);
  // Keystone'lar altın parlar (havada asılı kalmış gibi)
  const keyG = c.scene.add.graphics().setDepth(k.FLOOR_FX + 16 + 5);
  void k.counter(c.scene, k.slow(1600), (u) => {
    keyG.clear();
    k.fillCells(keyG, c.board, keys, { fill: KEY_GOLD, fillA: 0.3 * (1 - u * 0.6), edge: KEY_GOLD, edgeA: 1 - u * 0.5, edgeW: 4 });
    if (u >= 1) c.scene.tweens.add({ targets: keyG, alpha: 0, duration: k.slow(400), onComplete: () => keyG.destroy() });
  });
  await k.wait(c.scene, k.slow(260));
  playSfx(c.scene, 'timberSplinter');
  let resolveHit!: () => void;
  const hitP = new Promise<void>((r) => (resolveHit = r));
  const order = [...slots].sort((p, q) => Math.floor(p / content.GRID.lanes) - Math.floor(q / content.GRID.lanes));
  order.forEach((s, i) => {
    collapseCell(k, c.scene, c.board, s, i * 30, () => {
      const m = k.cellMid(c.board, s);
      if (i % 2 === 0) waterColumn(k, c.scene, m.x, m.y, 230, k.DEPTH + 15);
      flyingPlank(k, c.scene, m.x + k.rnd(-30, 30), m.y - 8);
      k.dustCloud(c.scene, m.x, m.y, { n: 2, spread: 50, rise: 110, size: [60, 100], life: 1300, tint: 0x9a948a });
      if (i === 0) {
        playSfx(c.scene, 'riverBurst');
        k.shake(c.scene, 700, 0.016);
        k.flash(c.scene, '#d8f2f0', 0.08, 260);
        resolveHit();
      }
    });
  });
  for (const t of c.targets) dropShake(k, c.scene, t);
  if (!order.length) resolveHit();
  await hitP;
}

/** Faz II: göğüs çatlağından kor ışığı fışkırır, gözler turuncuya döner. */
export async function wardenphase2(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  playSfx(c.scene, 'bridgeGroan');
  playSfx(c.scene, 'wardenGrowl');
  a.play('cast');
  const chest = chestOf(a);
  const head = headOf(a);
  const glow = c.scene.add.ellipse(chest.x, chest.y, 50, 110, 0xe0702a, 0).setDepth(k.DEPTH + 10).setBlendMode(Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: glow, alpha: 0.85, scaleX: 2.2, scaleY: 1.4, duration: k.slow(420), yoyo: true, hold: k.slow(500), onComplete: () => glow.destroy() });
  const eyes = [-1, 1].map((s) => c.scene.add.rectangle(head.x + s * 8, head.y, 8, 6, 0xffc46b, 0).setDepth(k.DEPTH + 12));
  c.scene.tweens.add({ targets: eyes, alpha: 1, duration: k.slow(200), delay: k.slow(250), hold: k.slow(900), yoyo: true, onComplete: () => eyes.forEach((e) => e.destroy()) });
  await k.wait(c.scene, k.slow(250));
  k.shake(c.scene, 500, 0.006);
  for (let i = 0; i < 3; i++)
    void k.wait(c.scene, k.slow(i * 160)).then(() => k.burst(c.scene, chest.x, chest.y, { colors: EMBER, n: 14, speed: [80, 320], gravity: -60, life: [500, 900], size: [6, 12] }));
  void k.ring(c.scene, a.container.x, a.container.y, { r: 220, flat: 0.32, n: 34, colors: EMBER, dur: 600, size: 11 });
  await k.wait(c.scene, k.slow(900));
  a.play('idle');
}

/** Faz III: sırttaki kemer taşları dökülür (taş parçacıkları), göğüs çatlağı genişler. */
export async function wardenphase3(c: VfxCtx, k: Kit): Promise<void> {
  const a = c.actor;
  playSfx(c.scene, 'wardenGrowl');
  playSfx(c.scene, 'stoneCrack');
  playSfx(c.scene, 'bridgeGroan');
  a.play('hit');
  k.shake(c.scene, 800, 0.012);
  const top = { x: a.container.x - facing(a) * a.w * 0.1, y: a.container.y - a.h * 0.92 };
  for (let i = 0; i < 6; i++) {
    void k.wait(c.scene, k.slow(i * 110)).then(() => {
      const r = k.sprite(c.scene, 'rock', '#4a5560', top.x + k.rnd(-a.w * 0.35, a.w * 0.35), top.y + k.rnd(-10, 20), k.rnd(28, 46), k.DEPTH + 20);
      const groundY = a.container.y - k.rnd(0, 12);
      void k.travel(c.scene, r, { x: r.x + k.rnd(-90, 90), y: groundY }, k.rnd(420, 560), { ease: 'in', spin: k.rnd(-1, 1), arc: 30 }).then(() => {
        k.burst(c.scene, r.x, groundY, { colors: [...STONEW, ...MOSS], n: 6, speed: [60, 200], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 900, life: [300, 520], size: [6, 10] });
        k.dustCloud(c.scene, r.x, groundY, { n: 1, spread: 20, rise: 30, size: [30, 50], life: 700, tint: 0x8a8a84 });
        c.scene.tweens.add({ targets: r, alpha: 0, delay: k.slow(500), duration: k.slow(400), onComplete: () => r.destroy() });
      });
    });
  }
  // çatlak genişler: göğüste dikey kor yarığı uzar
  const chest = chestOf(a);
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 11);
  void k.counter(c.scene, k.slow(900), (u) => {
    g.clear();
    const h = a.h * 0.32 * Math.min(1, u * 1.5);
    g.fillStyle(0xe0702a, 0.7 * (1 - Math.max(0, u - 0.6) * 2.5)).fillRect(chest.x - 4, chest.y - h / 2, 8, h);
    g.fillStyle(0xffc46b, 0.9 * (1 - Math.max(0, u - 0.6) * 2.5)).fillRect(chest.x - 2, chest.y - h / 2, 4, h);
    if (u >= 1) g.destroy();
  });
  k.burst(c.scene, chest.x, chest.y, { colors: [...EMBER, ...ASH], n: 18, speed: [80, 300], gravity: 100, life: [500, 900], size: [6, 12] });
  await k.wait(c.scene, k.slow(1000));
  a.play('idle');
}

/** Iron Mooring kırılması: demir baba gıcırdayarak eğilir, zincir kopup suya düşer (sıçrama); Warden sendeler. */
export async function mooringbreak(c: VfxCtx, k: Kit): Promise<void> {
  const m = c.actor;
  const warden = c.targets[0];
  playSfx(c.scene, 'ironCreak');
  const base = { x: m.container.x, y: m.container.y };
  // gıcırtı titremesi + eğilme
  c.scene.tweens.add({ targets: m.container, x: base.x + 3, duration: k.slow(35), yoyo: true, repeat: 6 });
  await k.wait(c.scene, k.slow(260));
  c.scene.tweens.add({ targets: m.container, angle: facing(m) * 14, duration: k.slow(260), ease: 'Back.easeIn' });
  await k.wait(c.scene, k.slow(220));
  // zincir kopar: halkalar savrulup düşer, suya sıçrar
  const top = { x: base.x, y: base.y - m.h * 0.55 };
  for (let i = 0; i < 5; i++) {
    const l = k.sprite(c.scene, 'chainlink', '#8a4a25', top.x + k.rnd(-30, 30), top.y + k.rnd(-10, 10), k.rnd(24, 34), k.DEPTH + 22);
    void k.travel(c.scene, l, { x: l.x + k.rnd(-120, 120), y: base.y + 6 }, k.rnd(380, 520), { ease: 'in', spin: k.rnd(-1.5, 1.5), arc: k.rnd(40, 90) }).then(() => {
      k.burst(c.scene, l.x, base.y, { colors: WATER, n: 5, speed: [80, 200], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 1000, life: [300, 520], size: [5, 9] });
      l.destroy();
    });
  }
  k.burst(c.scene, top.x, top.y, { colors: RUST, n: 10, speed: [100, 300], gravity: 900, life: [300, 600], size: [5, 9] });
  k.shake(c.scene, 200, 0.006);
  await k.wait(c.scene, k.slow(420));
  playSfx(c.scene, 'riverBurst');
  waterColumn(k, c.scene, base.x, base.y, 130, k.DEPTH + 15);
  void k.ring(c.scene, base.x, base.y, { r: 110, flat: 0.32, n: 22, colors: WATER, dur: 420, size: 9 });
  // Warden sendeler (Stagger): geriye silkinme
  if (warden) {
    const wx = warden.container.x;
    warden.play('hit');
    c.scene.tweens.add({ targets: warden.container, x: wx - facing(warden) * 26, duration: k.slow(110), yoyo: true, repeat: 1, ease: 'Quad.easeOut', onComplete: () => warden.play('idle') });
    k.burst(c.scene, warden.container.x, warden.container.y - warden.h * 0.5, { colors: STONEW, n: 8, speed: [60, 200], gravity: 700, life: [300, 520], size: [6, 10] });
  }
  await k.wait(c.scene, k.slow(200));
}

// ------------------------------------------------------------------------------------------------ kalıcı göstergeler

/**
 * Bekleyen telgrafın hücre göstergesi (ortak hücre plakası dilinde): çatlak taş plaka + yavaş nabız.
 *  'span'  : pas turuncusu kenar, su sızan çatlaklar (Breaking Span).
 *  'fall'  : kızıl dolgu + kor çatlakları; `keystones` hücreleri altın kemer taşı (Fall of King's Bridge).
 *  'brand' : kor turuncusu, merkez (slots[0]) daha parlak, komşular soluk (Ash Brand'in plus alanı; damgalı yer değiştirince yeniden çağrılır).
 * Container döner; söndürmek için destroy().
 */
export function telegraphCells(k: Kit, scene: Phaser.Scene, kind: 'span' | 'fall' | 'brand', board: Board, slots: number[], keystones: number[] = []): Phaser.GameObjects.Container {
  const plate = scene.add.graphics();
  const crack = scene.add.graphics();
  const keys: Phaser.GameObjects.Image[] = [];
  const glow = kind === 'span' ? 0x8fcaca : 0xe0702a;
  for (const s of slots) if (kind !== 'brand' || s === slots[0]) cellCracks(k, crack, k.quadOf(board, s, 0.94), glow, 0.85);
  for (const s of keystones) {
    const m = k.cellMid(board, s);
    keys.push(k.sprite(scene, 'keystone', '#ffd23f', m.x, m.y - 40, 48, 60));
  }
  const box = scene.add.container(0, 0, [plate, crack, ...keys]).setDepth(k.FLOOR_FX + 2);
  const draw = () => {
    if (!box.active) return;
    const p = 0.5 + 0.5 * Math.sin(scene.time.now / 420);
    plate.clear();
    if (kind === 'span') k.fillCells(plate, board, slots, { fill: 0x8a4a25, fillA: 0.16 + 0.14 * p, edge: 0xe0702a, edgeA: 0.55 + 0.4 * p, edgeW: 3 });
    else if (kind === 'fall') k.fillCells(plate, board, slots, { fill: 0x8e1f2c, fillA: 0.16 + 0.14 * p, edge: 0xe0702a, edgeA: 0.5 + 0.4 * p, edgeW: 3 });
    else {
      k.fillCells(plate, board, slots, { fill: 0xe0702a, fillA: 0.08 + 0.08 * p, edge: 0xe0702a, edgeA: 0.35 + 0.3 * p, edgeW: 2 });
      if (slots[0] !== undefined) k.fillCells(plate, board, [slots[0]], { fill: 0xffc46b, fillA: 0.18 + 0.18 * p });
    }
    if (keystones.length) k.fillCells(plate, board, keystones, { fill: KEY_GOLD, fillA: 0.14 + 0.12 * p, edge: KEY_GOLD, edgeA: 0.8 + 0.2 * p, edgeW: 4 });
    keys.forEach((ic, i) => ic.setY(k.cellMid(board, keystones[i]!).y - 40 - 4 * p));
  };
  draw();
  const loop = scene.time.addEvent({ delay: 50, loop: true, callback: draw });
  box.once('destroy', () => loop.remove(false));
  return box;
}

/** Ash Brand damgası: birimin göğsünde nabız atan kızgın damga (birimle birlikte hareket eder). destroy() ile söner. */
export function brandMark(k: Kit, scene: Phaser.Scene, v: CombatantView): Phaser.GameObjects.Image {
  const mark = k.sprite(scene, 'brandmark', '#e0702a', 0, -v.h * 0.55, 30);
  v.container.add(mark);
  scene.tweens.add({ targets: mark, alpha: { from: 1, to: 0.45 }, scale: mark.scale * 1.12, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  const spark = scene.time.addEvent({
    delay: 380,
    loop: true,
    callback: () => mark.active && k.burst(scene, v.container.x + k.rnd(-6, 6), v.container.y - v.h * 0.55, { colors: [...EMBER, ...ASH], n: 1, speed: [10, 40], gravity: -60, life: [300, 500], size: [4, 6] }),
  });
  mark.once('destroy', () => spark.remove(false));
  return mark;
}
