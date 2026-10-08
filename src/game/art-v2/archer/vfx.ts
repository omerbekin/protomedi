/**
 * Archer - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Ortak dil (karakter: uzun yaylı korucu, sprite'ta yay ön elde): Archer YERİNDE kalır. Her atışta yayın kirişi gerçekten GERİLİR
 * (sprite'ın yayının üstüne çizilen kiriş gez noktasına çekilir, okun kendisi gezde durur), bırakınca kiriş titreyerek geri vurur.
 * Ok gerçek balistikle uçar: uzaklıkla artan hafif kavis, burnu her an uçuş yönüne döner, arkasında ince hava izi. Değdiği yere
 * SAPLANIR (gövde + tüy dışarıda kalır, kısa titrer, sonra söner); yere düşen ok toprağa gömülür ve toz kaldırır.
 *
 *   quick_shot (Quick Shot)        -> 'arrowshot' : hızlı çekiş, tek ok, saplanır; ardından ayak dibinde hız rüzgârı (Haste).
 *   piercing_arrow (Piercing Arrow)-> 'pierce'    : sonuna kadar germe, ağır ok şerit boyunca her hedefi delip geçer (aşama aşama),
 *                                                   her delişte yavaşlar ve izi solar (falloff), sonunda yere saplanır.
 *   arrow_rain (Arrow Rain)        -> 'arrowrain' : göğe üç ok; ıslık; hedef 3x3 bloğa önce ok gölgeleri, sonra yağmur (ön sıra önce).
 *   aimed_shot (Aimed Shot)        -> 'aimed'     : yavaş tam çekiş, ekran kararır, nişan çizgisi + kapanan köşebentler, zırh zayıf
 *                                                   noktası parlar; düz ve çok hızlı ok, zırh parçalanır (zırhın yarısını yok sayar).
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: tam ekran karartma görünen alanın tamamını kaplar
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };
type Img = ReturnType<VfxKit['sprite']>;

const WOOD = ['#e3b983', '#8c5a2b', '#4a2e1a'];
const FLECK = ['#8e1f2c', '#e5463b', '#e3b983'];
const DIRT = ['#8c5a2b', '#4a2e1a', '#98a2b4', '#e3b983'];
const AIR = 0xfdfaf2;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Atış yönü (+1 sağa, -1 sola): hedef ya da alan varsa ona doğru, yoksa tarafa göre. */
function facing(c: VfxCtx): number {
  const to = c.targets[0]?.container.x ?? c.centerPos?.x ?? c.cells[0]?.x;
  if (to !== undefined && to !== c.actor.container.x) return to > c.actor.container.x ? 1 : -1;
  return c.actor.combatant.side === 'party' ? 1 : -1;
}

/** Yayın sprite üzerindeki yeri (idle.png: kavrama genişliğin ~%30 önünde, boyun ~%49'u yukarıda; uçlar %90 ve %12). */
function bowGeom(c: VfxCtx, d: number): { grip: Pt; top: Pt; bot: Pt; rest: number } {
  const v = c.actor;
  const x = v.container.x;
  const y = v.container.y;
  return {
    grip: { x: x + d * v.w * 0.3, y: y - v.h * 0.49 },
    top: { x: x + d * v.w * 0.22, y: y - v.h * 0.88 },
    bot: { x: x + d * v.w * 0.06, y: y - v.h * 0.14 },
    rest: x + d * v.w * 0.19, // kirişin dinlenme hattı
  };
}

/**
 * Kirişi gerer: sprite'ın kirişinin üstüne gerilmiş kiriş çizilir, gezde ok bekler. `pull` 0..1 (geri çekiş oranı), `ms` süre.
 * Dönen `release()` kirişi bırakır (titreşerek geri vurur) ve okun çıkış noktasını verir.
 */
async function drawBow(c: VfxCtx, k: VfxKit, d: number, o: { ms: number; pull: number; arrow: string; aim: Pt; size?: number }): Promise<{ nock: Pt; arrow: Img; release: () => void }> {
  const b = bowGeom(c, d);
  const g = c.scene.add.graphics().setDepth(c.actor.container.depth + 2);
  const size = o.size ?? 88;
  const maxPull = c.actor.w * 0.42 * o.pull;
  const arrow = k.v2Sprite(c, o.arrow, '#d9c9a3', b.grip.x, b.grip.y, size, c.actor.container.depth + 3).setAlpha(0);
  let nock: Pt = { x: b.rest, y: b.grip.y };
  const drawString = (px: number, wob = 0) => {
    g.clear();
    g.lineStyle(2, 0xd8cfb0, 0.95);
    g.beginPath().moveTo(b.top.x, b.top.y).lineTo(px + wob, b.grip.y).lineTo(b.bot.x, b.bot.y).strokePath();
  };
  c.actor.play('attack');
  await k.counter(c.scene, k.slow(o.ms), (u) => {
    const e = 1 - (1 - u) ** 2.2;
    const px = b.rest - d * maxPull * e;
    nock = { x: px, y: b.grip.y };
    drawString(px);
    const ang = Math.atan2(o.aim.y - nock.y, o.aim.x - nock.x);
    const L = size * 0.93;
    arrow.setAlpha(Math.min(1, u * 5)).setRotation(ang).setPosition(nock.x + Math.cos(ang) * L * 0.47, nock.y + Math.sin(ang) * L * 0.47);
    // tam çekişte gergin kirişin hafif titremesi
    if (u > 0.85) c.actor.container.x += 0;
  });
  const release = () => {
    // kiriş öne fırlar, dinlenme hattının ötesine geçip titreyerek durulur
    void k.counter(c.scene, k.slow(220), (u) => {
      const amp = maxPull * 0.35 * (1 - u) * Math.cos(u * Math.PI * 7);
      drawString(b.rest, d * amp);
      if (u >= 1) g.destroy();
    });
    // bilekte deri/kiriş tozu
    k.burst(c.scene, b.grip.x, b.grip.y, { colors: ['#eae3c6', '#ffffff'], n: 3, speed: [40, 120], angle: d > 0 ? [Math.PI * 0.75, Math.PI * 1.25] : [-0.4, 0.4], gravity: 0, life: [140, 260], size: [6, 9] });
  };
  return { nock, arrow, release };
}

/** Balistik uçuş: kavis yüksekliği `arc`, burun teğete döner, arkada hava izi. Promise varışta (ok son noktada) çözülür. */
function fly(c: VfxCtx, k: VfxKit, arrow: Img, from: Pt, to: Pt, ms: number, o: { arc?: number; trail?: number; trailA?: number } = {}): Promise<number> {
  const trail = c.scene.add.graphics().setDepth(k.DEPTH + 25);
  const marks: Array<Pt & { t: number }> = [];
  const arc = o.arc ?? 0;
  const L = arrow.displayWidth * 0.47;
  let ang = Math.atan2(to.y - from.y, to.x - from.x);
  const pos = (u: number): Pt => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - 4 * arc * u * (1 - u) });
  return k
    .counter(c.scene, k.slow(ms), (u) => {
      const p = pos(u);
      const q = pos(Math.min(1, u + 0.02));
      if (u < 0.99) ang = Math.atan2(q.y - p.y, q.x - p.x);
      // sprite merkezi okun ortası: uç p'de
      arrow.setPosition(p.x - Math.cos(ang) * L, p.y - Math.sin(ang) * L).setRotation(ang).setAlpha(1);
      marks.push({ x: p.x - Math.cos(ang) * L * 2, y: p.y - Math.sin(ang) * L * 2, t: u });
      trail.clear();
      for (let i = 1; i < marks.length; i++) {
        const age = (u - marks[i]!.t) / 0.35;
        if (age > 1) continue;
        trail.lineStyle(o.trail ?? 2, AIR, (1 - age) * (o.trailA ?? 0.55));
        trail.lineBetween(marks[i - 1]!.x, marks[i - 1]!.y, marks[i]!.x, marks[i]!.y);
      }
    })
    .then(() => {
      c.scene.tweens.add({ targets: trail, alpha: 0, duration: k.slow(160), onComplete: () => trail.destroy() });
      return ang;
    });
}

/** Ok bir gövdeye saplanır: uç gömülü, gövde+tüy dışarıda, kısa titrer ve söner. */
function stickInto(c: VfxCtx, k: VfxKit, at: Pt, ang: number, depth: number, size: number, hold = 520): void {
  const s = k.v2Sprite(c, 'arrowstuck', '#d9c9a3', at.x, at.y, size, depth).setOrigin(0.97, 0.5).setRotation(ang);
  c.scene.tweens.add({ targets: s, rotation: ang + 0.07, duration: k.slow(35), yoyo: true, repeat: 5 });
  c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(hold), duration: k.slow(320), onComplete: () => s.destroy() });
}

/** Ok yere saplanır: ucu toprakta, gövde eğik dışarıda, toz. */
function stickGround(c: VfxCtx, k: VfxKit, at: Pt, ang: number, size: number, hold = 800): void {
  const s = k.v2Sprite(c, 'arrowstuck', '#d9c9a3', at.x, at.y, size, at.y + 1).setOrigin(0.9, 0.5).setRotation(ang);
  c.scene.tweens.add({ targets: s, rotation: ang - 0.05, duration: k.slow(40), yoyo: true, repeat: 3 });
  c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(hold), duration: k.slow(380), onComplete: () => s.destroy() });
  k.burst(c.scene, at.x, at.y, { colors: DIRT, n: 3, speed: [40, 140], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 600, life: [220, 420], size: [6, 10] });
}

/** Gövdeye isabet: kıymık/kan lekesi, hedef itilir. */
function fleshHit(c: VfxCtx, k: VfxKit, t: CombatantView, at: Pt, d: number, power = 1): void {
  k.burst(c.scene, at.x, at.y, { colors: FLECK, n: Math.round(5 * power), speed: [80, 260 * power], angle: d > 0 ? [-0.9, 0.9] : [Math.PI - 0.9, Math.PI + 0.9], gravity: 700, life: [220, 420], size: [6, 10] });
  k.burst(c.scene, at.x, at.y, { colors: ['#ffffff', '#eae3c6'], n: 3, speed: [60, 160], gravity: 0, life: [120, 220], size: [6, 8] });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 10 * power, duration: k.slow(55), yoyo: true });
}

/** Hedefin göğüs hizasında isabet noktası (biraz rastgele). */
const chest = (k: VfxKit, t: CombatantView): Pt => ({ x: t.container.x + k.rnd(-t.w * 0.08, t.w * 0.08), y: t.container.y - t.h * k.rnd(0.5, 0.6) });

/** Haste: Archer'in ayak dibinde yükselen iki rüzgâr sarmalı (hız). */
function hasteGust(c: VfxCtx, k: VfxKit): void {
  const v = c.actor.container;
  const g = c.scene.add.graphics().setDepth(v.depth + 1);
  c.sfx('hasteWhoosh');
  void k.counter(c.scene, k.slow(620), (u) => {
    g.clear();
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 14; i++) {
        const q = u * 1.4 - i * 0.04;
        if (q < 0 || q > 1) continue;
        const a = q * Math.PI * 3 + s * Math.PI;
        const r = c.actor.w * (0.55 - q * 0.15);
        const x = v.x + Math.cos(a) * r;
        const y = v.y - 10 - q * c.actor.h * 0.75 + Math.sin(a) * 10;
        g.fillStyle(i % 3 ? 0xd7f0c4 : 0xffffff, (1 - q) * (1 - i / 14) * 0.9).fillRect(Math.round(x) - 2, Math.round(y) - 2, i < 3 ? 6 : 4, 4);
      }
    }
    if (u >= 1) g.destroy();
  });
}

const polyLen = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) : 0), 0);
function pointAt(pts: Pt[], dist: number): Pt {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l || i === pts.length - 1) {
      const u = l ? Math.min(1, left / l) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    left -= l;
  }
  return pts[pts.length - 1]!;
}

// ---------------------------------------------------------------------------------------------------------------------

/** Quick Shot: hızlı çekiş (0,13 sn), hafif kavisli hızlı ok, göğse saplanır; sonra Haste rüzgârı. Vuruş ~0,42 sn (x1,2). */
const arrowshot: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  const aim = chest(k, t);
  const bow = await drawBow(c, k, d, { ms: 85, pull: 0.7, arrow: 'arrow', aim, size: 88 });
  c.sfx('bowTwang');
  c.sfx('arrowWhoosh');
  bow.release();
  const dist = Math.abs(aim.x - bow.nock.x);
  const ang = await fly(c, k, bow.arrow, { x: bow.nock.x + d * 100, y: bow.nock.y }, aim, Math.max(140, dist / 6), { arc: Math.min(130, dist * 0.1) });
  bow.arrow.destroy();
  c.sfx('arrowThunk');
  stickInto(c, k, { x: aim.x + d * 8, y: aim.y }, ang, t.container.depth + 1, 80);
  fleshHit(c, k, t, aim, d, 0.9);
  for (const extra of c.targets.slice(1)) fleshHit(c, k, extra, chest(k, extra), d, 0.7);
  void k.wait(c.scene, k.slow(120)).then(() => {
    hasteGust(c, k);
    c.actor.play('idle');
  });
};

/**
 * Piercing Arrow (sütun, aşamalı önden arkaya): yay sonuna kadar gerilir (0,26 sn), ağır ok bel hizasında şerit boyunca düz uçar;
 * her dolu hücrede hedefi DELİP çıkar (çıkış yüzünden kıymık + kan, hedef itilir, o aşamanın hasarı o an) ve %18 yavaşlar, izi incelir;
 * son hücreyi geçince yere dalıp saplanır.
 */
const pierce: V2Vfx = (c, k) =>
  k.playUntilHit(async (firstHit) => {
    const d = facing(c);
    const stages = c.stages?.length ? c.stages : [{ slots: c.slots ?? [], cells: c.cells, targets: c.targets }];
    const mids = stages.map((st) => st.cells[0] ?? (st.targets[0] ? { x: st.targets[0].container.x, y: st.targets[0].container.y } : c.centerPos ?? { x: c.actor.container.x + d * 400, y: c.actor.container.y }));
    const lift = c.actor.h * 0.48;
    const laneY = (mids[0]?.y ?? c.actor.container.y) - lift;
    const aim = { x: mids[0]?.x ?? c.actor.container.x + d * 300, y: laneY };
    const bow = await drawBow(c, k, d, { ms: 260, pull: 1, arrow: 'arrowheavy', aim, size: 100 });
    c.sfx('heavyTwang');
    c.sfx('arrowWhoosh');
    bow.release();
    void k.ring(c.scene, bow.nock.x + d * 120, bow.nock.y, { r: 46, flat: 1.4, n: 14, colors: ['#ffffff', '#eae3c6'], dur: 220, size: 7, arc: d > 0 ? [-1.2, 1.2] : [Math.PI - 1.2, Math.PI + 1.2] });
    // yol: gezden ilk hücrenin bel hizasına, sonra hücre hücre (izometrik kayma), son hücreden sonra yere dalış
    const start = { x: bow.nock.x + d * 120, y: bow.nock.y };
    const lanePts = mids.map((m) => ({ x: m.x, y: m.y - lift }));
    const last = lanePts[lanePts.length - 1] ?? aim;
    const beyond = { x: last.x + d * 230, y: last.y + lift * 0.55 };
    const entry = { x: (lanePts[0]?.x ?? aim.x) - d * 110, y: laneY };
    const over = { x: (start.x + entry.x) / 2, y: Math.min(start.y, entry.y) - 40 }; // dostların üstünden geçer
    const path = [start, over, entry, ...lanePts, beyond];
    const total = polyLen(path);
    const atDist = lanePts.map((_, i) => polyLen(path.slice(0, i + 4)));
    // hız profili: her delinen hedef sonrası yavaşla
    const segs: Array<{ from: number; v: number }> = [{ from: 0, v: 2.6 }];
    let v = 2.6;
    stages.forEach((st, i) => {
      if (st.targets.length) {
        v *= 0.82;
        segs.push({ from: atDist[i]!, v });
      }
    });
    const times: number[] = [];
    let T = 0;
    segs.forEach((s, i) => {
      times.push(T);
      const end = segs[i + 1]?.from ?? total;
      T += (end - s.from) / s.v;
    });
    const distAt = (time: number) => {
      let i = segs.length - 1;
      while (i > 0 && times[i]! > time) i--;
      return Math.min(total, segs[i]!.from + (time - times[i]!) * segs[i]!.v);
    };
    const arrow = bow.arrow;
    const L = arrow.displayWidth * 0.47;
    const trail = c.scene.add.graphics().setDepth(k.DEPTH + 25);
    const marks: Array<Pt & { t: number; w: number }> = [];
    const passed = new Set<number>();
    let width = 4;
    let ang = 0;
    let hitDone = false;
    await k.counter(c.scene, k.slow(T), (u) => {
      const dist = distAt(u * T);
      const p = pointAt(path, dist);
      const q = pointAt(path, Math.min(total, dist + 8));
      if (dist < total - 2) ang = Math.atan2(q.y - p.y, q.x - p.x);
      arrow.setPosition(p.x - Math.cos(ang) * L, p.y - Math.sin(ang) * L).setRotation(ang).setAlpha(1).setDepth(k.DEPTH + 30);
      marks.push({ x: p.x - Math.cos(ang) * L * 2, y: p.y - Math.sin(ang) * L * 2, t: u * T, w: width });
      trail.clear();
      for (let i = 1; i < marks.length; i++) {
        const age = (u * T - marks[i]!.t) / 300;
        if (age > 1) continue;
        trail.lineStyle(marks[i]!.w, AIR, (1 - age) * 0.6).lineBetween(marks[i - 1]!.x, marks[i - 1]!.y, marks[i]!.x, marks[i]!.y);
      }
      stages.forEach((st, i) => {
        if (passed.has(i) || dist < atDist[i]!) return;
        passed.add(i);
        for (const tv of st.targets) {
          const at = { x: tv.container.x, y: laneY + (lanePts[i]!.y - laneY) };
          c.sfx('arrowThunk');
          fleshHit(c, k, tv, at, d, 1.1);
          // çıkış yüzünden kıymık
          k.burst(c.scene, at.x + d * tv.w * 0.25, at.y, { colors: WOOD, n: 5, speed: [140, 340], angle: d > 0 ? [-0.35, 0.35] : [Math.PI - 0.35, Math.PI + 0.35], gravity: 500, life: [240, 420], size: [6, 10] });
          width = Math.max(1.5, width * 0.7);
        }
        c.releaseStage(i);
        if (!hitDone && (st.targets.length || i === stages.length - 1)) {
          hitDone = true;
          firstHit();
        }
      });
    });
    for (let i = 0; i < stages.length; i++) c.releaseStage(i);
    firstHit();
    arrow.destroy();
    c.sfx('arrowGround');
    stickGround(c, k, beyond, ang, 92);
    c.scene.tweens.add({ targets: trail, alpha: 0, duration: k.slow(260), onComplete: () => trail.destroy() });
    c.actor.play('idle');
  });

/**
 * Arrow Rain (3x3): Archer göğe art arda üç ok atar (oklar ekrandan çıkar). Islık başlar, hedef bloğun hücrelerine dağınık ok gölgeleri
 * düşer ve küçülür; sonra yağmur iner: dalga ön sıradan arkaya, hücre başına 3-4 ok, dik açıyla toprağa saplanır; hücredeki düşmana bir
 * ok gövdeden saplanır (hasar rakamı o an). Blok bir an gölgede kalır, saplanmış oklar biraz bekleyip söner.
 */
const arrowrain: V2Vfx = async (c, k) => {
  const d = facing(c);
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const lanes = 3;
  // 1) göğe üç ok
  for (let i = 0; i < 3; i++) {
    const up = { x: c.actor.container.x + d * (260 + i * 70), y: -160 };
    const bow = await drawBow(c, k, d, { ms: i === 0 ? 170 : 90, pull: 0.85, arrow: 'arrow', aim: up, size: 86 });
    c.sfx('bowTwang');
    bow.release();
    void fly(c, k, bow.arrow, { x: bow.nock.x, y: bow.nock.y }, up, 300, { arc: 0 }).then(() => bow.arrow.destroy());
  }
  c.actor.play('idle');
  c.sfx('arrowShower');
  // 2) gölge: blok kararır, hücrelerde ok gölgeleri belirip küçülür
  const shade = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1);
  k.fillCells(shade, c.board, slots, { fill: 0x15101c, fillA: 0.28, k: 0.98 });
  shade.setAlpha(0);
  c.scene.tweens.add({ targets: shade, alpha: 1, duration: k.slow(260) });
  const plan = slots.map((s) => {
    const q = k.quadOf(c.board, s, 0.86);
    const victim = c.targets.find((t) => t.combatant.slot === s);
    const n = victim ? 4 : 3;
    const spots = Array.from({ length: n }, (_, i) => (victim && i === 0 ? null : k.inQuad(q, 0.85)));
    return { s, victim, spots, row: Math.floor(s / lanes), lane: s % lanes };
  });
  const shadows: Img[] = [];
  for (const p of plan)
    for (const sp of p.spots) {
      if (!sp) continue;
      const e = c.scene.add.ellipse(sp.x, sp.y, 34, 10, 0x000000, 0.0).setDepth(k.FLOOR_FX + 2) as unknown as Img;
      c.scene.tweens.add({ targets: e, alpha: 0.35, scaleX: 0.45, scaleY: 0.45, duration: k.slow(360) });
      shadows.push(e);
    }
  await k.wait(c.scene, k.slow(280));
  // 3) yağmur
  const arrive = new Map(slots.map((s) => [s, deferred()]));
  const minRow = Math.min(...plan.map((p) => p.row));
  let thunks = 0;
  const ANG = Math.PI / 2 - d * 0.42; // atış yönünde eğik iner
  const jobs = plan.flatMap((p) =>
    p.spots.map(async (sp, i) => {
      await k.wait(c.scene, k.slow((p.row - minRow) * 95 + p.lane * 28 + i * 55 + k.rnd(0, 25)));
      const body = !sp && p.victim;
      const to = body ? chest(k, p.victim!) : sp!;
      const from = { x: to.x - Math.cos(ANG) * 640, y: to.y - Math.sin(ANG) * 640 };
      const a = k.v2Sprite(c, 'arrow', '#d9c9a3', from.x, from.y, 84, body ? p.victim!.container.depth + 1 : k.DEPTH + 20).setRotation(ANG);
      const L = a.displayWidth * 0.47;
      a.setPosition(from.x - Math.cos(ANG) * L, from.y - Math.sin(ANG) * L);
      await k.travel(c.scene, a, { x: to.x - Math.cos(ANG) * L, y: to.y - Math.sin(ANG) * L }, 170, { ease: 'in' });
      a.destroy();
      if (body) {
        c.sfx('arrowThunk');
        stickInto(c, k, { x: to.x + Math.cos(ANG) * 8, y: to.y + Math.sin(ANG) * 8 }, ANG, p.victim!.container.depth + 1, 76, 380);
        fleshHit(c, k, p.victim!, to, d, 0.8);
        c.scene.tweens.add({ targets: p.victim!.container, y: p.victim!.container.y + 6, duration: k.slow(50), yoyo: true });
        arrive.get(p.s)?.resolve();
      } else {
        if (thunks++ % 3 === 0) c.sfx('arrowGround');
        stickGround(c, k, to, ANG, 76, 700 + k.rnd(0, 250));
        if (!p.victim && i === 0) arrive.get(p.s)?.resolve();
      }
    }),
  );
  void Promise.all(jobs).then(() => {
    for (const x of arrive.values()) x.resolve();
    for (const e of shadows) e.destroy();
    c.scene.tweens.add({ targets: shade, alpha: 0, duration: k.slow(500), onComplete: () => shade.destroy() });
  });
  await k.hitsAt(c, (t) => arrive.get(t.combatant.slot)?.promise ?? Promise.resolve(), k.wait(c.scene, k.slow(400)));
};

/** Köşebentli nişangâh (dört köşe), hedefin çevresinde kapanır. */
function reticle(c: VfxCtx, k: VfxKit, t: CombatantView, ms: number): Phaser.GameObjects.Graphics {
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 35);
  const cx = t.container.x;
  const cy = t.container.y - t.h * 0.55;
  void k.counter(c.scene, k.slow(ms), (u) => {
    const e = 1 - (1 - u) ** 3;
    const w = t.w * (1.6 - 0.95 * e) * 0.5;
    const h = t.h * (1.1 - 0.62 * e) * 0.5;
    const L = 18;
    g.clear();
    g.lineStyle(4, 0xffd166, 0.35 + 0.65 * u);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx! * w;
      const y = cy + sy! * h;
      g.beginPath().moveTo(x - sx! * L, y).lineTo(x, y).lineTo(x, y - sy! * L).strokePath();
    }
    g.lineStyle(2, 0xffffff, 0.5 * u);
    g.lineBetween(cx - 10, cy, cx + 10, cy).lineBetween(cx, cy - 10, cx, cy + 10);
  });
  return g;
}

/**
 * Aimed Shot: yavaş, tam çekiş (0,5 sn; bowDraw gıcırtısı), ekran %20 kararır, gezden hedefe kesik nişan çizgisi uzar, köşebentler
 * hedefin göğsüne kapanır, zırhın zayıf noktası parlar. Bırakış: hava halkası, dümdüz ve çok hızlı ağır ok (0,1 sn), zırh parçalanır
 * (çelik kırıkları saçılır: savunmanın yarısı yok sayılır), ok saplanır, kamera sarsılır. Vuruş ~0,74 sn (x1,2).
 */
const aimed: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  const aim = { x: t.container.x - d * t.w * 0.05, y: t.container.y - t.h * 0.55 };
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x0a0812, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.22, duration: k.slow(380) });
  c.sfx('bowDraw');
  const ret = reticle(c, k, t, 480);
  const sight = c.scene.add.graphics().setDepth(k.DEPTH + 24);
  const bowP = drawBow(c, k, d, { ms: 480, pull: 1, arrow: 'arrowheavy', aim, size: 100 });
  const b = bowGeom(c, d);
  void k.counter(c.scene, k.slow(460), (u) => {
    sight.clear();
    const n = 26;
    for (let i = 0; i < n * u; i++) {
      if (i % 2) continue;
      const x = b.grip.x + ((aim.x - b.grip.x) * i) / n;
      const y = b.grip.y + ((aim.y - b.grip.y) * i) / n;
      sight.fillStyle(0xffd166, 0.55).fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
    }
  });
  const glint = k.sprite(c.scene, 'spark', '#ffffff', aim.x, aim.y, 26, k.DEPTH + 36).setAlpha(0);
  c.scene.tweens.add({ targets: glint, alpha: 1, displayWidth: 54, displayHeight: 54, angle: 45, delay: k.slow(300), duration: k.slow(170), yoyo: true });
  const bow = await bowP;
  c.sfx('heavyTwang');
  c.sfx('arrowWhoosh');
  bow.release();
  void k.ring(c.scene, bow.nock.x + d * 130, bow.nock.y, { r: 60, flat: 1.5, n: 18, colors: ['#ffffff', '#ffd166'], dur: 240, size: 8, arc: d > 0 ? [-1.3, 1.3] : [Math.PI - 1.3, Math.PI + 1.3] });
  const ang = await fly(c, k, bow.arrow, { x: bow.nock.x + d * 120, y: bow.nock.y }, aim, 115, { arc: Math.min(90, Math.abs(aim.x - bow.nock.x) * 0.07), trail: 5, trailA: 0.9 });
  bow.arrow.destroy();
  sight.destroy();
  ret.destroy();
  glint.destroy();
  // zırh parçalanır
  c.sfx('plateBreak');
  c.sfx('arrowThunk');
  k.flash(c.scene, '#ffffff', 0.22, 140);
  k.shake(c.scene, 180, 0.007);
  stickInto(c, k, { x: aim.x + d * 12, y: aim.y }, ang, t.container.depth + 1, 92, 600);
  fleshHit(c, k, t, aim, d, 1.6);
  for (let i = 0; i < 7; i++) {
    const s = k.v2Sprite(c, 'plateshard', '#98a2b4', aim.x, aim.y, k.rnd(22, 38), k.DEPTH + 45).setRotation(k.rnd(0, 6));
    const a = (d > 0 ? 0 : Math.PI) + k.rnd(-1.3, 1.3);
    const sp = k.rnd(180, 420);
    void k.counter(c.scene, k.slow(620), (u) => {
      const tt = u * 0.62;
      s.setPosition(aim.x + Math.cos(a) * sp * tt, aim.y + Math.sin(a) * sp * tt + 0.5 * 1400 * tt * tt).setRotation(s.rotation + 0.2).setAlpha(1 - u * u);
      if (u >= 1) s.destroy();
    });
  }
  k.burst(c.scene, aim.x, aim.y, { colors: ['#ffffff', '#ffd166', '#ff8a1f'], n: 14, speed: [200, 520], angle: d > 0 ? [-1, 1] : [Math.PI - 1, Math.PI + 1], gravity: 300, life: [200, 380], size: [6, 10] });
  void k.ring(c.scene, aim.x, aim.y, { r: 90, flat: 1, n: 24, colors: ['#ffffff', '#ffd166'], dur: 300, size: 8 });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 22, duration: k.slow(70), yoyo: true });
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(420), onComplete: () => dim.destroy() });
  c.actor.play('idle');
};

export const VFX: Record<string, V2Vfx> = { arrowshot, pierce, arrowrain, aimed };
