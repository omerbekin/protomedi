/**
 * Defender - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter: ağır plaka zırh, mavi yüzlü kule kalkanı, kalkanda beyaz kale kulesi arması (assets/sprites/defender/idle.png).
 * v2 efektleri Ömer'in hazır SPRITE SHEET paketiyle kurulur (assets/vfx/defender/<NN-ad>.png, 4x2 = 8 kare x 256 px, 10 fps; asılları
 * assets/source/defender-vfx, oyuna yüklenmez). Sheet'ler `k.sheet(...)` ile oynar; hareket (taşıma, ölçek, sarsıntı, solma, zamanlama)
 * kodla eklenir. Kareler NEAREST ile keskin; hız skillSlowdown'a uyar.
 *
 * GÖRSEL DİL: gerçekçi, ağır, yere basan. Sihirli parıltı / neon yok; çelik, pirinç, toprak ve toz. Sarsıntı kısa ve sert.
 *
 *   tremor_slam (Tremor Slam) -> 'tremor2'     sıranın başına koşar, kule kalkanını kaldırıp sivri ucuyla toprağa çakar: büyük toz
 *                                               halkası (08), yarık (05), moloz (06), toz (07); yarık sıra boyunca hücreden hücreye ilerler,
 *                                               toz dalgası sıranın üstünden yuvarlanır; her düşman dalga değince sarsılır (moloz + toz)
 *                                               ve ayağının dibine çöken toz halkası (08 tersten) onu yere bağlar: Slow okunur
 *   taunt (Taunt)             -> 'taunt2'      kalkana iki kez vurur (çelik kıvılcımı, 11), savaş çığlığı: kızıl ses yayları (09) düşmanlara
 *                                               koşar, her düşman irkilir ve başının üstünde Defender'ın arması (12) belirir; Defender'ın
 *                                               çevresinde çelik kalkan silueti (10) belirir (kalkan kazanır), başının üstünde arma (12) yükselir
 *   guard (Guard)             -> 'guard2'      kalkanını dostuna uzatır: zincir (04) Defender'dan dosta uzanır, dostun önüne (düşmana bakan
 *                                               yüzüne) yerden kule kalkanı (03) dikilir (toz 07 + 08); bağ iki kez gerilir, kalkan soluklaşıp söner
 *   fist_crush (Fist Crush)   -> 'fistcrush2'  Defender yerinde kolunu göğe kaldırır; her hedefin üstüne gökten AÇIK çelik eldiven (02)
 *                                               iner, düşerken yumruk olur (01) ve kafaya çarpar: yarık (05), moloz (06), toz halkası (08),
 *                                               toz (07), ağır sarsıntı; hedefler sırayla (olay sırası)
 *
 * OLAY EFEKTİ: 'guardshare' (src/game/event-fx.ts): Guard payı korumacıya geçtiğinde (damage.redirected) korunan dostun önünde hayalet
 * kule kalkanı + sapma kıvılcımı (11), korumacının kalkanında da kıvılcım; anında çözülür (savaşı bekletmez).
 * Bulwark Aura (pasif) için oyunda görsel kanca yok (aura sürekli; olay üretmez): v2 görseli de yok.
 *
 * Promise VURUŞ ANINDA çözülür (hasar rakamları o an); kuyruk (yarık solması, dönüş) arkada akar. Tüm süreler k.slow() ile.
 */
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };
type Spr = Phaser.GameObjects.Sprite;

/** Sheet kimlikleri (assets/vfx/defender). */
const SH = {
  fist: 'defender/01-gauntlet-fist',
  open: 'defender/02-gauntlet-open',
  tower: 'defender/03-tower-shield',
  chain: 'defender/04-chain',
  crack: 'defender/05-ground-crack',
  debris: 'defender/06-debris',
  puff: 'defender/07-dust-puff',
  wave: 'defender/08-dust-shockwave',
  cry: 'defender/09-war-cry',
  shimmer: 'defender/10-shield-shimmer',
  sparks: 'defender/11-deflect-sparks',
  crest: 'defender/12-crest',
} as const;

/**
 * Karelerin içindeki ölçüler (256'lık kare, piksel; görsellerden ölçüldü): içerik boyu ve zemine/pivota oturan nokta.
 * `origin` = sprite'ın konuma oturan noktası (0..1).
 */
const GEO = {
  /** Kule kalkanı: içerik 93x176, alt uç y 205. */
  tower: { h: 176, origin: [0.5, 205 / 256] as [number, number] },
  /** Yarık: en geniş 204 px, orta çizgi y ~170. */
  crack: { w: 204, origin: [0.5, 170 / 256] as [number, number] },
  /** Moloz yığını: taban y ~207. */
  debris: { w: 130, origin: [0.5, 207 / 256] as [number, number] },
  /** Toz bulutu: taban y ~218, en geniş 167. */
  puff: { w: 167, origin: [0.5, 218 / 256] as [number, number] },
  /** Toz halkası (zaten basık elips): merkez y ~131, en geniş 207. */
  wave: { w: 207, origin: [0.5, 131 / 256] as [number, number] },
  /** Siluet: 96x177, ayak y 225. */
  shimmer: { h: 177, origin: [0.5, 225 / 256] as [number, number] },
  /** Arma: 93x142, orta. */
  crest: { h: 142 },
  /** Kıvılcım: çıkış noktası (sol-orta), sağa ve yukarı saçılır. */
  sparks: { w: 92, origin: [112 / 256, 146 / 256] as [number, number] },
  /** Zincir parçası: içerik 191x30 (4 halka), dikey orta y ~145. */
  chain: { w: 191, origin: [0.5, 145 / 256] as [number, number] },
  /** Yumruk (bilek üstte, boğumlar altta): içerik boyu ~136; vuruş karesinde (3) boğumların alt kenarı y 234. */
  fist: { h: 136, knuckle: 234 / 256 },
  /** Açık el (yan görünüm, parmaklar sağa): içerik 141x124. */
  open: { w: 141 },
};

const STONE = ['#5b6579', '#98a2b4', '#4a2e1a', '#7a6a58'];
const EARTH = ['#7a6a58', '#9a8a70', '#5a4a3a'];
const SPARK = ['#ffffff', '#ffe9b0', '#d9a441'];

/** Karakterin baktığı yön: oyuncu sağa (+1), düşman sola (-1). */
const face = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Sprite'ı yavaşça soldurup yok eder. */
function fadeOut(c: VfxCtx, k: VfxKit, s: Spr | null, delay: number, dur: number, extra: Record<string, unknown> = {}): void {
  if (!s) return;
  c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(delay), duration: k.slow(dur), ...extra, onComplete: () => s.destroy() });
}

/** Zemin darbesi kümesi: yarık (kalır, solar) + toz halkası + moloz + iki toz bulutu. `w` = etkinin genişliği (px). */
function groundImpact(c: VfxCtx, k: VfxKit, p: Pt, w: number, o: { depth: number; crackAngle?: number; crackHold?: number; debris?: boolean; puffs?: number } = { depth: 900 }): void {
  const crack = k.sheet(c.scene, SH.crack, p.x, p.y, { size: (256 * w) / GEO.crack.w, squashY: 0.7, origin: GEO.crack.origin, frames: [0, 1, 2, 3, 4], fps: 18, keep: true, depth: k.FLOOR_FX + 6, rotation: o.crackAngle ?? 0 });
  fadeOut(c, k, crack, o.crackHold ?? 900, 700);
  k.sheet(c.scene, SH.wave, p.x, p.y, { size: (256 * w * 1.25) / GEO.wave.w, origin: GEO.wave.origin, fps: 16, depth: k.FLOOR_FX + 8, alpha: 0.95 });
  if (o.debris !== false) k.sheet(c.scene, SH.debris, p.x, p.y + 2, { size: (256 * w * 0.6) / GEO.debris.w, origin: GEO.debris.origin, fps: 14, depth: o.depth });
  const n = o.puffs ?? 2;
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : i % 2 ? 1 : -1;
    k.sheet(c.scene, SH.puff, p.x + side * w * 0.28, p.y + 2, { size: (256 * w * 0.62) / GEO.puff.w, origin: GEO.puff.origin, fps: 12, depth: o.depth + 1, flipX: side > 0, delay: i * 40, alpha: 0.92 });
  }
}

// =====================================================================================================================
// TREMOR SLAM

/** Yol uzunluğu ve yol üstünde mesafeye göre nokta. */
const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
function pathLen(path: Pt[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist(path[i - 1]!, path[i]!);
  return s;
}
function pointAt(path: Pt[], d: number): Pt & { ang: number } {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = dist(a, b);
    if (d <= l || i === path.length - 1) {
      const u = l ? Math.min(1, Math.max(0, d / l)) : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    d -= l;
  }
  const p = path[0] ?? { x: 0, y: 0 };
  return { ...p, ang: 0 };
}
/** Düz bir yarığı yatay simetrisi bozulmadan yol yönüne çevirir (ters dönmesin: açı -90..90). */
const lineAngle = (a: number): number => (a > Math.PI / 2 ? a - Math.PI : a < -Math.PI / 2 ? a + Math.PI : a);

/** Tremor Slam ritmi (ms; k.slow ile): kalkan kaldırma, çakış, hitstop, dalganın hücre başına süresi. */
const SLAM_RAISE = 300;
const SLAM_DROP = 95;
const SLAM_STOP = 80;
const SLAM_STEP = 170;
/** Tremor Slam kamera sarsıntısı (Ömer 2026-10-10: eskisinin %25'i): çakış ve hücre başı. Fist Crush'ınki ayrı. */
const SLAM_SHAKE = 0.003;
const SLAM_CELL_SHAKE = 0.00125;

const tremor2: V2Vfx = async (c, k) => {
  await k.sheetsReady(c.scene, [SH.tower, SH.crack, SH.wave, SH.debris, SH.puff]);
  const a = c.actor;
  const slotList = c.slots?.length ? [...c.slots] : c.targets.map((t) => t.combatant.slot);
  const slots = [...new Set(slotList)].sort((p, q) => k.cellMid(c.board, p).y - k.cellMid(c.board, q).y);
  const head = slots.length ? k.cellMid(c.board, slots[0]!) : (c.centerPos ?? k.feet(a));
  const dir = head.x >= a.container.x ? 1 : -1;
  const stand = { x: head.x - dir * (a.w * 0.5 + 78), y: head.y + 4 };
  await a.approach(stand.x, stand.y, 190);

  // 1) kalkanı başının üstüne kaldırır (gövde ayaktan dikleşir; Defender zıplamaz)
  c.sfx('plateCreak');
  a.play('cast');
  const impact = { x: stand.x + dir * (a.w * 0.5 + 24), y: head.y + 6 };
  const shH = Math.max(120, a.h * 0.72);
  const shSize = (256 * shH) / GEO.tower.h;
  const shield = k.sheet(c.scene, SH.tower, impact.x, impact.y - 150, { size: shSize, origin: GEO.tower.origin, frame: 0, depth: impact.y + 2, flipX: dir < 0, alpha: 0 });
  if (shield) c.scene.tweens.add({ targets: shield, alpha: 1, y: impact.y - 170, duration: k.slow(220), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: a.container, scaleY: 1.04, duration: k.slow(220), ease: 'Quad.easeOut' });
  await k.wait(c.scene, k.slow(140));
  c.sfx('heaveGrunt');
  await k.wait(c.scene, k.slow(SLAM_RAISE - 140));

  // 2) çakış: kalkan sivri ucuyla toprağa
  a.play('attack');
  c.scene.tweens.add({ targets: a.container, y: stand.y, scaleY: 0.93, duration: k.slow(90), ease: 'Quad.easeIn', onComplete: () => c.scene.tweens.add({ targets: a.container, scaleY: 1, duration: k.slow(160) }) });
  if (shield) await new Promise<void>((r) => c.scene.tweens.add({ targets: shield, y: impact.y + 12, duration: k.slow(SLAM_DROP), ease: 'Quad.easeIn', onComplete: () => r() }));
  else await k.wait(c.scene, k.slow(SLAM_DROP));
  c.sfx('shieldPlant');
  k.shake(c.scene, 340, SLAM_SHAKE);
  groundImpact(c, k, impact, 210, { depth: impact.y + 4, crackHold: 1400, puffs: 2 });
  k.burst(c.scene, impact.x, impact.y - 10, { colors: STONE, n: 14, speed: [160, 440], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1000, life: [420, 820], size: [7, 15] });
  k.burst(c.scene, impact.x + dir * 10, impact.y - shH * 0.4, { colors: SPARK, n: 5, speed: [90, 240], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 600, life: [140, 260], size: [4, 7] });
  // kalkan toprakta titrer (sheet'in sallanma kareleri) ve ayakta kalır
  if (shield) {
    shield.setFrame(2);
    c.scene.tweens.add({ targets: shield, x: impact.x + 3, duration: k.slow(30), yoyo: true, repeat: 4, onComplete: () => shield.setFrame(0) });
  }
  await k.wait(c.scene, k.slow(SLAM_STOP)); // hitstop: ağırlık

  // 3) yarık ve toz dalgası sıra boyunca
  c.sfx('groundHeave');
  const path: Pt[] = [impact, ...slots.map((s) => k.cellMid(c.board, s))];
  const total = Math.max(1, pathLen(path));
  const reachedAt = slots.map((_, i) => pathLen(path.slice(0, i + 2)));
  const WAVE = SLAM_STEP * Math.max(1, slots.length) + 60;
  const arrive = new Map(slots.map((s) => [s, deferred()]));
  const cellW = slots.length ? Math.max(90, Math.abs(k.quadOf(c.board, slots[0]!, 1)[1]!.x - k.quadOf(c.board, slots[0]!, 1)[3]!.x)) : 110;
  const CRACK_STEP = 80;
  let nextCrack = 30;
  const reached = new Set<number>();
  // yuvarlanan toz dalgası: yolun ucunda ilerleyen toz bulutu (sheet döngüde, ileri taşınır)
  const roller = k.sheet(c.scene, SH.puff, impact.x, impact.y, { size: 150, origin: GEO.puff.origin, frames: [2, 3, 4, 3], fps: 14, loop: true, depth: k.DEPTH - 30, alpha: 0.85 });
  void k
    .counter(c.scene, k.slow(WAVE), (u) => {
      const d = total * u;
      const tip = pointAt(path, d);
      roller?.setPosition(k.snap(tip.x), k.snap(tip.y + 4)).setFlipX(dir < 0);
      // yarık yol boyunca hücreden hücreye işlenir
      while (d >= nextCrack && nextCrack < total) {
        const p = pointAt(path, nextCrack);
        const cr = k.sheet(c.scene, SH.crack, p.x, p.y + 2, { size: 170, squashY: 0.7, origin: GEO.crack.origin, frames: [0, 1, 2, 3, 4], fps: 22, keep: true, depth: k.FLOOR_FX + 5, rotation: lineAngle(p.ang) * 0.55 });
        fadeOut(c, k, cr, 1100, 700);
        k.burst(c.scene, p.x, p.y - 4, { colors: STONE, n: 2, speed: [80, 220], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 900, life: [300, 520], size: [6, 11] });
        nextCrack += CRACK_STEP;
      }
      slots.forEach((s, i) => {
        if (reached.has(s) || d < reachedAt[i]!) return;
        reached.add(s);
        const m = k.cellMid(c.board, s);
        k.sheet(c.scene, SH.wave, m.x, m.y, { size: (256 * cellW * 1.5) / GEO.wave.w, origin: GEO.wave.origin, fps: 16, depth: k.FLOOR_FX + 8 });
        k.shake(c.scene, 140, SLAM_CELL_SHAKE);
        for (const t of c.targets.filter((v) => v.combatant.slot === s)) {
          const f = k.feet(t);
          // moloz ve toz birimin ayağında; birim sarsılır
          k.sheet(c.scene, SH.debris, f.x, f.y + 4, { size: (256 * t.w * 0.9) / GEO.debris.w, origin: GEO.debris.origin, fps: 14, depth: t.container.depth + 1 });
          k.sheet(c.scene, SH.puff, f.x - t.w * 0.3, f.y + 4, { size: (256 * t.w * 0.6) / GEO.puff.w, origin: GEO.puff.origin, fps: 12, depth: t.container.depth + 2, alpha: 0.8 });
          k.sheet(c.scene, SH.puff, f.x + t.w * 0.32, f.y + 4, { size: (256 * t.w * 0.5) / GEO.puff.w, origin: GEO.puff.origin, fps: 12, depth: t.container.depth + 2, flipX: true, delay: 50, alpha: 0.75 });
          c.scene.tweens.add({ targets: t.container, y: t.container.y - 20, duration: k.slow(80), yoyo: true, ease: 'Quad.easeOut' });
          k.hit(c.scene, t.container.x, t.container.y - t.h * 0.35, ['#ffffff', '#d7dce6', '#98a2b4'], 0.7);
          slowBind(c, k, t);
        }
        arrive.get(s)?.resolve();
      });
    })
    .then(() => {
      for (const d of arrive.values()) d.resolve();
      if (roller) fadeOut(c, k, roller, 0, 260);
      // kalkan topraktan çekilir, Defender döner
      if (shield) fadeOut(c, k, shield, 140, 260, { y: shield.y - 40 });
      void k.wait(c.scene, k.slow(220)).then(() => a.returnHome(300));
    });
  await k.hitsAt(c, (t) => arrive.get(t.combatant.slot)?.promise ?? Promise.resolve(), k.wait(c.scene, k.slow(WAVE)));
};

/**
 * Slow okunsun: vurulan birimin ayağının dibine toz halkası TERSTEN çöker (toz ayağa yapışır), birim bir an ağırlaşıp çöker
 * (ayaktan basılır) ve ayağında ağır, yavaş bir toz bulutu kalır.
 */
function slowBind(c: VfxCtx, k: VfxKit, t: CombatantView): void {
  const f = k.feet(t);
  k.sheet(c.scene, SH.wave, f.x, f.y + 2, { size: (256 * t.w * 1.5) / GEO.wave.w, origin: GEO.wave.origin, frames: [5, 4, 3, 2, 1, 0], fps: 9, depth: t.container.depth + 3, delay: 220, alpha: 0.85, tint: 0xb8b0a0 });
  k.sheet(c.scene, SH.puff, f.x, f.y + 6, { size: (256 * t.w * 0.9) / GEO.puff.w, origin: GEO.puff.origin, frames: [3, 4, 5, 6, 7], fps: 5, depth: t.container.depth + 2, delay: 360, alpha: 0.6 });
  void k.wait(c.scene, k.slow(260)).then(() => {
    if (!t.container.active) return;
    c.scene.tweens.add({ targets: t.container, scaleY: 0.93, scaleX: 1.03, duration: k.slow(140), yoyo: true, hold: k.slow(260), ease: 'Quad.easeOut', onComplete: () => t.container.setScale(1) });
  });
}

// =====================================================================================================================
// TAUNT

/** Düşmanın başının üstüne düşen Defender arması (küçük; sallanma kareleriyle oturur, durup söner). */
function crestMark(c: VfxCtx, k: VfxKit, t: CombatantView, hold: number): void {
  const x = t.container.x;
  const y = t.container.y - t.h * 0.92;
  const s = k.sheet(c.scene, SH.crest, x, y - 34, { size: (256 * 46) / GEO.crest.h, fps: 12, keep: true, depth: k.DEPTH + 60, alpha: 0 });
  if (!s) return;
  c.scene.tweens.add({ targets: s, y, alpha: 1, duration: k.slow(180), ease: 'Quad.easeIn' });
  fadeOut(c, k, s, hold, 280, { y: y - 10 });
}

const taunt2: V2Vfx = async (c, k) => {
  await k.sheetsReady(c.scene, [SH.sparks, SH.cry, SH.shimmer, SH.crest]);
  const a = c.actor;
  const dir = face(a);
  const home = { x: a.container.x, y: a.container.y };
  const rim = { x: home.x + dir * a.w * 0.34, y: home.y - a.h * 0.6 };

  // 1) kılıç kabzasıyla kalkana iki vuruş (ses kaydındaki darbelerle eş: 0 ve 200 ms, ses yavaşlatılmaz)
  c.sfx('shieldBang');
  const bang = (i: number) => {
    a.play('attack');
    c.scene.tweens.add({ targets: a.container, x: home.x + dir * 6, duration: 40, yoyo: true });
    k.sheet(c.scene, SH.sparks, rim.x, rim.y, { size: 150 + i * 30, origin: GEO.sparks.origin, flipX: dir < 0, fps: 18, depth: k.DEPTH + 20, rotation: (dir > 0 ? -0.25 : 0.25) * (i ? -1 : 1) });
    k.shake(c.scene, 70, 0.0025);
  };
  bang(0);
  await k.wait(c.scene, 200);
  bang(1);
  await k.wait(c.scene, k.slow(170));

  // 2) savaş çığlığı: gövde şişer, kızıl ses yayları karşıya koşar
  c.sfx('battleRoar');
  a.play('cast');
  c.scene.tweens.add({ targets: a.container, scaleX: 1.05, scaleY: 1.06, duration: k.slow(120), yoyo: true, hold: k.slow(260) });
  k.shake(c.scene, 280, 0.004);
  const mouth = { x: home.x + dir * a.w * 0.28, y: home.y - a.h * 0.8 };
  const foes = c.foes ?? [];
  const far = Math.max(520, ...foes.map((f) => Math.abs(f.container.x - mouth.x) + 90));
  const RUN = 640;
  for (let i = 0; i < 3; i++) {
    const s = k.sheet(c.scene, SH.cry, mouth.x + dir * 30, mouth.y + (i - 1) * 6, { size: 190, flipX: dir < 0, fps: 8000 / RUN, keep: true, depth: k.DEPTH + 30, delay: i * 120, alpha: i ? 0.75 : 1 });
    if (!s) continue;
    c.scene.tweens.add({ targets: s, x: mouth.x + dir * far, y: mouth.y + 40, scaleX: s.scaleX * 2.1, scaleY: s.scaleY * 2.4, delay: k.slow(i * 120), duration: k.slow(RUN), ease: 'Quad.easeOut', onComplete: () => s.destroy() });
  }
  // 3) çelik kalkan silueti Defender'ın çevresinde belirir (kalkan kazanır), arma başının üstünde yükselir
  const shim = k.sheet(c.scene, SH.shimmer, home.x, home.y + 2, { size: (256 * a.h * 1.08) / GEO.shimmer.h, origin: GEO.shimmer.origin, fps: 9, depth: a.container.depth + 2, delay: 160, tint: 0xd7e4f5 });
  const crest = k.sheet(c.scene, SH.crest, home.x, home.y - a.h * 1.0, { size: (256 * 64) / GEO.crest.h, fps: 10, keep: true, depth: k.DEPTH + 40, delay: 120, alpha: 0 });
  if (crest) {
    c.scene.tweens.add({ targets: crest, alpha: 1, y: home.y - a.h * 1.14, delay: k.slow(120), duration: k.slow(260), ease: 'Quad.easeOut' });
    fadeOut(c, k, crest, 1000, 360, { y: home.y - a.h * 1.2 });
  }
  // dalga cephesi düşmana değince: irkilme (Defender'dan geri) + başının üstüne arma
  const marked = new Set<CombatantView>();
  await k.counter(
    c.scene,
    k.slow(RUN),
    (u) => {
      const front = 30 + far * u;
      for (const f of foes) {
        if (marked.has(f) || Math.abs(f.container.x - mouth.x) > front) continue;
        marked.add(f);
        c.scene.tweens.add({ targets: f.container, x: f.container.x + dir * 10, duration: k.slow(70), yoyo: true, ease: 'Quad.easeOut' });
        f.play('hit');
        void k.wait(c.scene, k.slow(260)).then(() => f.container.active && f.play('idle'));
        crestMark(c, k, f, 760);
      }
    },
    'Quad.easeOut',
  );
  void k.sheetDone(shim).then(() => a.play('idle'));
};

// =====================================================================================================================
// GUARD

/** Zincirde en az kaç parça (04) olur (Ömer 2026-10-10: Defender ile dost yan yanayken de en az 3). */
const CHAIN_MIN_SEGS = 3;
/** Kısa mesafede parça küçülür ama bu ölçeğin altına inmez (halka kalınlığı okunur kalsın). */
const CHAIN_MIN_SCALE = 0.22;

/**
 * İki nokta arasında sarkık zincir: parçalar (04) eğri boyunca, yerel teğete döndürülmüş; `reveal` ms içinde uçtan uca açılır.
 * Uzun mesafede `o.scale` boyunda parçalar döşenir; kısa mesafede (yan yana duranlar) en az CHAIN_MIN_SEGS parça sığsın diye parça küçülür.
 */
function chainLink(c: VfxCtx, k: VfxKit, from: Pt, to: Pt, o: { reveal: number; scale: number; depth: number; sag: number; alpha?: number }): Spr[] {
  // sarkık eğri: yay boyuna göre eşit aralıklı noktalar (parçalar eşit boyda olsun)
  const curve = (u: number): Pt => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * o.sag });
  const STEPS = 48;
  const pts = Array.from({ length: STEPS + 1 }, (_, i) => curve(i / STEPS));
  const len = Math.max(1, pathLen(pts));
  const fit = len / (CHAIN_MIN_SEGS * GEO.chain.w * 0.88);
  const scale = Math.max(CHAIN_MIN_SCALE, Math.min(o.scale, fit));
  const pitch = GEO.chain.w * scale * 0.88; // parça uçları yarım halka bindirir (döşeme kesintisiz değil)
  const n = Math.max(CHAIN_MIN_SEGS, Math.ceil(len / pitch));
  const step = len / n; // gerçek parça aralığı (pitch'e yakın; kısa mesafede biraz sıkışır)
  const out: Spr[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pointAt(pts, step * i);
    const p1 = pointAt(pts, step * (i + 1));
    const mid = pointAt(pts, step * (i + 0.5));
    const s = k.sheet(c.scene, SH.chain, mid.x, mid.y, { size: 256 * scale * (step / pitch), squashY: pitch / step, origin: GEO.chain.origin, rotation: Math.atan2(p1.y - p0.y, p1.x - p0.x), fps: 10, loop: true, depth: o.depth, delay: (o.reveal * i) / n, alpha: o.alpha ?? 1 });
    if (s) out.push(s);
  }
  return out;
}

const guard2: V2Vfx = async (c, k) => {
  await k.sheetsReady(c.scene, [SH.chain, SH.tower, SH.puff, SH.wave, SH.sparks]);
  const a = c.actor;
  const t = c.targets[0] ?? a;
  const home = { x: a.container.x, y: a.container.y };
  const toward = t === a ? face(a) : t.container.x >= home.x ? 1 : -1;
  // 1) kalkanını dostuna uzatır: bir adım
  c.sfx('shieldBrace');
  a.play('attack');
  c.scene.tweens.add({ targets: a.container, x: home.x + toward * 22, duration: k.slow(140), ease: 'Quad.easeOut' });
  await k.wait(c.scene, k.slow(170));

  // dostun önündeki kalkanın yeri (düşmana bakan yüz)
  const fdir = face(t);
  const gx = t.container.x + fdir * (t.w * 0.46);
  const gy = t.container.y + 4;
  const gH = Math.max(130, t.h * 0.82);

  // 2) zincir Defender'ın kalkanından dosta uzanır
  c.sfx('chainTether');
  const from = { x: home.x + toward * (a.w * 0.42 + 22), y: home.y - a.h * 0.5 };
  const to = { x: gx - fdir * 6, y: gy - gH * 0.55 };
  const REVEAL = 280;
  const links = chainLink(c, k, from, to, { reveal: REVEAL, scale: 0.42, depth: k.DEPTH + 26, sag: Math.min(70, Math.abs(to.x - from.x) * 0.12 + 22) });
  await k.wait(c.scene, k.slow(REVEAL + 40));
  k.sheet(c.scene, SH.sparks, to.x, to.y, { size: 110, origin: GEO.sparks.origin, flipX: to.x < from.x, fps: 18, depth: k.DEPTH + 28 });

  // 3) kule kalkanı dostun önünde yerden dikilir
  const shield = k.sheet(c.scene, SH.tower, gx, gy, { size: (256 * gH) / GEO.tower.h, origin: GEO.tower.origin, frames: [0, 1, 0, 3, 0, 5, 6, 7], fps: 7, loop: true, depth: t.container.depth + 2, flipX: fdir < 0 });
  if (shield) {
    const sy = shield.scaleY;
    shield.setScale(shield.scaleX, sy * 0.05);
    c.scene.tweens.add({ targets: shield, scaleY: sy, duration: k.slow(260), ease: 'Back.easeOut' });
  }
  k.sheet(c.scene, SH.wave, gx, gy, { size: (256 * t.w * 1.2) / GEO.wave.w, origin: GEO.wave.origin, fps: 16, depth: k.FLOOR_FX + 8 });
  k.sheet(c.scene, SH.puff, gx - fdir * 10, gy + 2, { size: (256 * t.w * 0.7) / GEO.puff.w, origin: GEO.puff.origin, fps: 13, depth: t.container.depth + 3, flipX: fdir < 0, alpha: 0.9 });
  k.shake(c.scene, 90, 0.0025);
  await k.wait(c.scene, k.slow(220));

  // 4) bağ iki kez gerilir (zincir uçtan uca parlar), kalkan bağla birlikte nabız atar
  links.forEach((s, i) => c.scene.tweens.add({ targets: s, alpha: 0.55, delay: k.slow(i * 24), duration: k.slow(110), yoyo: true, repeat: 1 }));
  if (shield) c.scene.tweens.add({ targets: shield, alpha: 0.7, duration: k.slow(130), yoyo: true, repeat: 1 });
  await k.wait(c.scene, k.slow(300));

  // söner: kalkan soluklaşıp dostun önünde iner, zincir solar, Defender adımını geri alır
  fadeOut(c, k, shield, 260, 380, { y: gy + 6 });
  for (const s of links) fadeOut(c, k, s, 200, 300);
  c.scene.tweens.add({ targets: a.container, x: home.x, delay: k.slow(160), duration: k.slow(220), ease: 'Quad.easeInOut', onComplete: () => a.play('idle') });
};

/**
 * OLAY: Guard payı korumacıya geçti. Korunan dostun önünde hayalet kule kalkanı bir an belirir, darbe ona çarpıp sapma kıvılcımı (11) saçar;
 * korumacının kalkanında da kıvılcım. Anında çözülür (hasar akışını bekletmez).
 */
const guardshare: V2Vfx = async (c, k) => {
  void k.sheetsReady(c.scene, [SH.tower, SH.sparks]);
  const g = c.actor;
  const ally = c.targets[0];
  if (ally) {
    const fdir = face(ally);
    const gx = ally.container.x + fdir * (ally.w * 0.46);
    const gy = ally.container.y + 4;
    const gH = Math.max(120, ally.h * 0.78);
    const ghost = k.sheet(c.scene, SH.tower, gx, gy, { size: (256 * gH) / GEO.tower.h, origin: GEO.tower.origin, frame: 3, depth: ally.container.depth + 2, flipX: fdir < 0, alpha: 0 });
    if (ghost) {
      c.scene.tweens.add({ targets: ghost, alpha: 0.7, duration: k.slow(60) });
      fadeOut(c, k, ghost, 120, 260);
    }
    k.sheet(c.scene, SH.sparks, gx + fdir * 6, gy - gH * 0.6, { size: 170, origin: GEO.sparks.origin, flipX: fdir < 0, fps: 18, depth: k.DEPTH + 30 });
  }
  const gdir = face(g);
  k.sheet(c.scene, SH.sparks, g.container.x + gdir * g.w * 0.34, g.container.y - g.h * 0.58, { size: 130, origin: GEO.sparks.origin, flipX: gdir < 0, fps: 18, depth: k.DEPTH + 30, rotation: gdir * 0.3 });
};

// =====================================================================================================================
// FIST CRUSH

/** Fist Crush ritmi (ms; k.slow ile): kol kaldırma, düşüş, hedefler arası aralık. */
const FIST_RAISE = 320;
const FIST_FALL = 300;
const FIST_GAP = 70;

/**
 * Tek düşüş: hedefin ayağında büyüyen gölge, gökten AÇIK eldiven (02, parmaklar aşağı) iner, düşüşün sonunda yumruk olur (01: hazırlık ->
 * iniş -> en alt kare çarpma anında) ve kafaya çarpar (`onHit`: hasar rakamı). Zeminde yarık + toz halkası + moloz + toz, ağır sarsıntı.
 */
async function dropFist(c: VfxCtx, k: VfxKit, t: CombatantView, onHit: () => void): Promise<void> {
  const f = k.feet(t);
  const dir = face(c.actor);
  const fistH = Math.max(130, t.h * 1.1); // eldivenin ekrandaki boyu (bilekten boğuma): hedef boyunun %110'u (Ömer 2026-10-10)
  const size = (256 * fistH) / GEO.fist.h;
  const headY = t.container.y - t.h * 0.93; // kafanın üstü (boğumlar biraz gömülür)
  const startY = Math.min(headY - 420, -size * 0.3);
  // açık el: dönme merkezi karenin ortası; parmaklar aşağı (90 derece)
  const openSize = (256 * fistH * 1.05) / GEO.open.w;
  const openY = (y: number) => y - fistH * 0.45; // açık elin merkezi, boğumların biraz üstü
  const shadow = c.scene.add.ellipse(f.x, f.y, 20, 8, 0x000000, 0.4).setDepth(k.FLOOR_FX + 4);
  c.sfx('gauntletDrop');
  const open = k.sheet(c.scene, SH.open, t.container.x, openY(startY), { size: openSize, frames: [0, 1, 2, 3, 4], fps: 5000 / FIST_FALL, keep: true, depth: k.DEPTH + 41, rotation: dir > 0 ? Math.PI / 2 : -Math.PI / 2, flipX: dir < 0 });
  const fist = k.sheet(c.scene, SH.fist, t.container.x, startY, { size, origin: [0.5, GEO.fist.knuckle], frame: 0, depth: k.DEPTH + 41, flipX: dir < 0, alpha: 0 });
  const trail = c.scene.add.graphics().setDepth(k.DEPTH + 39);
  const yAt = (u: number) => k.snap(startY + (headY - startY) * u * u);
  let clenched = false;
  await k.counter(c.scene, k.slow(FIST_FALL), (u) => {
    const y = yAt(u);
    open?.setY(openY(y));
    fist?.setY(y);
    // son çeyrekte el kapanır: açık el kaybolur, yumruk hazırlık karesinde belirir
    if (!clenched && u >= 0.72) {
      clenched = true;
      open?.destroy();
      if (fist) {
        fist.setAlpha(1).setFrame(1);
        c.scene.tweens.add({ targets: fist, scaleX: fist.scaleX * 1.08, duration: k.slow(40), yoyo: true });
      }
    }
    if (clenched && u >= 0.9) fist?.setFrame(2);
    shadow.setSize(20 + (t.w * 0.9 - 20) * u, 8 + (t.w * 0.26 - 8) * u).setAlpha(0.15 + 0.3 * u);
    trail.clear();
    if (u < 1) {
      const top = yAt(Math.max(0, u - 0.3)) - fistH * 1.1;
      const bottom = y - fistH * 0.9;
      for (const dx of [-0.3, -0.08, 0.14, 0.32]) trail.fillStyle(0xd7e4f5, 0.3).fillRect(k.snap(t.container.x + dx * fistH), k.snap(top), 4, k.snap(Math.max(0, bottom - top)));
    }
  });
  trail.destroy();
  open?.destroy();
  // çarpma: en alt kare, hasar rakamı şimdi
  fist?.setAlpha(1).setFrame(3);
  c.sfx('gauntletCrush');
  onHit();
  k.shake(c.scene, 200, 0.011);
  c.scene.tweens.add({ targets: t.container, scaleY: 0.8, scaleX: 1.08, duration: k.slow(70), yoyo: true, hold: k.slow(70), ease: 'Quad.easeOut', onComplete: () => t.container.setScale(1) });
  k.hit(c.scene, t.container.x, headY + 6, ['#ffffff', '#d7dce6', '#98a2b4'], 1.0);
  k.burst(c.scene, t.container.x, headY + 6, { colors: SPARK, n: 8, speed: [150, 380], angle: [-Math.PI, 0], gravity: 800, life: [160, 300], size: [4, 7] });
  groundImpact(c, k, f, Math.max(150, t.w * 1.3), { depth: t.container.depth + 2, crackHold: 900, puffs: 2 });
  k.burst(c.scene, f.x, f.y - 8, { colors: [...STONE, ...EARTH], n: 8, speed: [100, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [350, 650], size: [6, 12] });
  c.scene.tweens.add({ targets: shadow, alpha: 0, duration: k.slow(260), onComplete: () => shadow.destroy() });
  // eldiven sekip (geri tepme karesi) yükselir ve söner
  if (fist) {
    void k.wait(c.scene, k.slow(90)).then(() => fist.active && fist.setFrame(4));
    c.scene.tweens.add({ targets: fist, y: headY - 26, delay: k.slow(80), duration: k.slow(140), ease: 'Quad.easeOut' });
    fadeOut(c, k, fist, 200, 200, { y: headY - 60 });
  }
}

const fistcrush2: V2Vfx = async (c, k) => {
  const a = c.actor;
  const order = c.targets;
  if (!order.length) return;
  await k.sheetsReady(c.scene, [SH.fist, SH.open, SH.crack, SH.wave, SH.debris, SH.puff]);
  const arrive = order.map(() => deferred());
  void (async () => {
    // 1) kol göğe: gövde ayaktan dikleşir (Defender yerinden kıpırdamaz), zırh gıcırdar
    c.sfx('plateCreak');
    a.play('cast');
    c.scene.tweens.add({ targets: a.container, scaleY: 1.06, scaleX: 0.98, duration: k.slow(200), ease: 'Quad.easeOut' });
    await k.wait(c.scene, k.slow(130));
    c.sfx('heaveGrunt');
    await k.wait(c.scene, k.slow(FIST_RAISE - 130));
    // 2) hedeflere sırayla
    const drops: Array<Promise<void>> = [];
    for (let i = 0; i < order.length; i++) {
      drops.push(dropFist(c, k, order[i]!, () => arrive[i]!.resolve()));
      if (i < order.length - 1) await k.wait(c.scene, k.slow(FIST_FALL + FIST_GAP));
    }
    await Promise.all(drops);
    // 3) kol iner
    c.scene.tweens.add({ targets: a.container, scaleX: 1, scaleY: 1, duration: k.slow(180), ease: 'Quad.easeInOut' });
    await k.wait(c.scene, k.slow(180));
    a.container.setScale(1);
    a.play('idle');
  })()
    .catch((err: unknown) => console.error('vfx', err))
    .finally(() => {
      for (const d of arrive) d.resolve();
    });
  await k.hitsAt(c, (t) => arrive[order.indexOf(t)]?.promise ?? Promise.resolve(), k.wait(c.scene, k.slow(2000)));
};

export const VFX: Record<string, V2Vfx> = {
  tremor2,
  taunt2,
  guard2,
  fistcrush2,
  guardshare,
};
