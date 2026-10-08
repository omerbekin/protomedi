/**
 * Warrior - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter: ağır çelik zırhlı, sakallı, kızıl atkılı savaşçı; iki elle UZUN KILIÇ (assets/sprites/warrior/idle.png). v2'de kılıç
 * gerçekten görünür (SPRITES.blade) ve elinden (kabza noktası) döner; savuruşun arkasında piksel "smear" yelpazesi kalır.
 * Tüm süreler slow() ile skillSlowdown'a uyar; ayna: yön daima aktörden hedefe (dir), düşman tarafında kılıç aynalanır.
 *
 *   melee_attack (Double Strike) -> 'doublestrike'  koşar, tepeden çapraz iner + geri dönüşte yükselen kesik; hedefte X yarığı
 *   whirlwind (Whirlwind)        -> 'whirlwind'     ön sıranın ortasına koşar, kılıç yatay düzlemde 3 tur döner, son turda
 *                                                   çelik rüzgâr halkası tüm düşman tahtasına yayılır; her düşman halka değince vurulur
 *   charge (Charge)              -> 'charge'        eğilip toz kaldırır, kılıç önde mızrak gibi atılır (arka sıraya da), çarpma
 *                                                   yıldızı + geri savrulma + başında dönen sersemletme yıldızları
 *   abyssal_cry (Abyssal Cry)    -> 'warcry'        ayağının altında zemin çatlar, karanlık kızıl öz yükselir; kükrer, kılıcı ve
 *                                                   kolları kızıl öfkeyle dolar, gövdesinin çevresinde 3 öfke koru (3 saldırı yükü)
 *                                                   belirir; kılıcı öne indirince ucundan ileri kızıl iz uzanır (menzil +1). Bedel/hasar yok.
 *
 * Abyssal Fury (madde 262) yüklü saldırılar: Double Strike / Whirlwind / Charge'ta saldıranın yükü bu kullanımda harcandıysa
 * (`furious(c)`: c.usage'daki abyssal_fury yük olayları) kılıç izi ve savuruş kızıl tonlu, iz biraz daha uzun.
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: tam ekran karartma görünen alanın tamamını kaplar
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };

const STEEL = ['#ffffff', '#d7dce6', '#98a2b4'];
const SPARK = ['#ffffff', '#ffe9b0', '#ffd23f'];
const FURY = 'abyssal_fury';
/** Öfke izi renkleri (drawSmear sırası: iç çekirdek, orta bant, dış kenar). */
const FURY_SMEAR = [0xffb4a2, 0xe5463b, 0x8e1f2c];

/**
 * Bu kullanım Abyssal Fury yüküyle mi yapıldı? Motor hasar veren skill bitince yükü düşürür: `status` (cause 'charge', kalan yük) ya da
 * son yükte `statusEnd` (consumed); saldırı sırasında silindiyse de (dispel) saldırı öfkeliydi. Olaysız oynatmada (galeri) birimin
 * mevcut durumuna bakılır.
 */
function furious(c: VfxCtx): boolean {
  const uid = c.actor.combatant.uid;
  if (c.usage) return c.usage.events.some((e) => (e.type === 'status' && e.status === FURY && e.target === uid && e.cause === 'charge') || (e.type === 'statusEnd' && e.status === FURY && e.target === uid));
  return c.actor.combatant.statuses?.some((s) => s.kind === FURY) ?? false;
}

/** Hedefin yanında durulacak nokta (aynı zemin çizgisi). */
function standNear(actor: CombatantView, target: CombatantView): Pt & { dir: number } {
  const dir = target.container.x >= actor.container.x ? 1 : -1;
  return { x: target.container.x - dir * (target.w * 0.5 + actor.w * 0.5 + 6), y: target.container.y, dir };
}

/** Kılıcın tutulduğu nokta (eller): gövdenin ortasının biraz önü. */
const hands = (a: CombatantView, dir: number): Pt => ({ x: a.container.x + dir * a.w * 0.12, y: a.container.y - a.h * 0.5 });

/** Kılıç uzunluğu: karakter boyuna oranlı (sprite'taki kılıç gövdenin ~%70'i). */
const bladeLen = (a: CombatantView) => a.h * 0.78;

/**
 * Elde tutulan kılıç sprite'ı (kabzası pivotta). `ang` dünyaya göre açı (0 = ileri, dir yönünde; negatif = yukarı).
 * Düşman tarafında (dir -1) yatay aynalanır.
 */
function makeBlade(c: VfxCtx, k: VfxKit, dir: number, len: number, depth: number) {
  // blade sprite'ı: 256 kare, mantıksal 64; kılıç x=4..61 (topuz 4, kabza ~9-13) -> origin kabzanın ortası
  const size = len / (57 / 64);
  const img = k.v2Sprite(c, 'blade', '#ffe9b0', 0, 0, size, depth).setOrigin(11 / 64, 0.5);
  const set = (p: Pt, ang: number, sx = 1) => {
    img.setPosition(k.snap(p.x), k.snap(p.y));
    img.setRotation(dir > 0 ? ang : Math.PI - ang);
    img.setFlipY(dir < 0);
    img.setScale(img.scaleY * sx, img.scaleY);
  };
  return { img, set };
}

/**
 * Savuruş izi (smear): pivot çevresinde, son `tail` radyanlık açıyı kaplayan, uca doğru parlayan piksel yelpaze.
 * Her karede yeniden çizilir; `fade` 0..1 ile söner.
 */
function drawSmear(g: Phaser.GameObjects.Graphics, k: VfxKit, p: Pt, dir: number, r0: number, r1: number, aFrom: number, aTo: number, cols: number[], alpha: number): void {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const a0 = aFrom + (aTo - aFrom) * u0;
    const a1 = aFrom + (aTo - aFrom) * u1;
    const al = alpha * (0.15 + 0.85 * u1) ** 1.6; // izin başı soluk, kılıca yakın parlak
    const pt = (a: number, r: number) => ({ x: p.x + dir * Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    // dış bant (krem), iç çekirdek (beyaz), en dış kenar (renk)
    const bands: Array<[number, number, number]> = [
      [r0 + (r1 - r0) * 0.2, r1 * 1.02, cols[2]!],
      [r0 + (r1 - r0) * 0.45, r1, cols[1]!],
      [r0 + (r1 - r0) * 0.72, r1 * 0.97, cols[0]!],
    ];
    for (const [ra, rb, col] of bands) {
      const A = pt(a0, ra);
      const B = pt(a0, rb);
      const C = pt(a1, rb);
      const D = pt(a1, ra);
      g.fillStyle(col, al).fillPoints([A, B, C, D].map((q) => ({ x: k.snap(q.x), y: k.snap(q.y) })), true);
    }
  }
}

/**
 * Bir kılıç savuruşu: kılıç a0'dan a1'e döner (ease-in, ağır kılıç ivmelenir), arkasında smear; `hitAt` (0..1) anında `onHit`.
 * Promise savuruş bitince çözülür.
 */
async function swing(c: VfxCtx, k: VfxKit, o: { pivot: () => Pt; dir: number; len: number; a0: number; a1: number; dur: number; hitAt: number; onHit: () => void; cols?: number[]; reach?: number }): Promise<void> {
  const blade = makeBlade(c, k, o.dir, o.len, k.DEPTH + 12);
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 11);
  const cols = o.cols ?? [0xffffff, 0xfff3d6, 0xc8553d];
  const tail = 1.15 * Math.sign(o.a1 - o.a0);
  let fired = false;
  await k.counter(
    c.scene,
    k.slow(o.dur),
    (u) => {
      const e = u * u * (3 - 2 * u) * 0.35 + u * u * 0.65; // ivmelenen
      const a = o.a0 + (o.a1 - o.a0) * e;
      const p = o.pivot();
      blade.set(p, a);
      g.clear();
      drawSmear(g, k, p, o.dir, o.len * 0.42, o.len * 1.02 * (o.reach ?? 1), Math.abs(a - o.a0) < Math.abs(tail) ? o.a0 : a - tail, a, cols, o.reach ? 0.78 : 0.62);
      if (!fired && u >= o.hitAt) {
        fired = true;
        o.onHit();
      }
    },
  );
  // iz ve kılıç kısa sürede söner
  c.scene.tweens.add({ targets: [g, blade.img], alpha: 0, duration: k.slow(110), onComplete: () => { g.destroy(); blade.img.destroy(); } });
}

/** Hedefte kalan kesik çizgisi (açı `ang` doğrultusunda), önce beyaz parlar sonra kızıla döner ve söner. */
function cutMark(c: VfxCtx, k: VfxKit, p: Pt, ang: number, len: number, life = 420): void {
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 30);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  void k.counter(c.scene, k.slow(life), (u) => {
    g.clear();
    const reach = Math.min(1, u * 6);
    const w = 10 * (1 - u) + 2;
    const n = Math.max(18, Math.round(len / 5));
    for (let i = 0; i <= n * reach; i++) {
      const s = i / n - 0.5;
      const taper = 1 - Math.abs(s) * 1.7;
      const x = k.snap(p.x + dx * s * len);
      const y = k.snap(p.y + dy * s * len);
      const sz = Math.max(2, k.snap(w * taper));
      g.fillStyle(0x8e1f2c, 0.85 * (1 - u)).fillRect(x - sz / 2 - 2, y - sz / 2 - 2, sz + 4, sz + 4);
      g.fillStyle(u < 0.35 ? 0xffffff : 0xe5463b, 1 - u).fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    if (u >= 1) g.destroy();
  });
}

/** Ağır zırhlı koşu: her adımda ayak dibinde küçük toz. `ms` koşu süresi (slow öncesi). */
function footfalls(c: VfxCtx, k: VfxKit, ms: number, dir: number): void {
  const steps = Math.max(2, Math.round(ms / 70));
  for (let i = 0; i < steps; i++)
    void k.wait(c.scene, k.slow(i * (ms / steps))).then(() => {
      const f = c.actor.container;
      k.burst(c.scene, f.x - dir * 14, f.y - 4, { colors: k.colors.DUST, n: 2, speed: [30, 110], angle: [Math.PI * 1.1, Math.PI * 1.9], gravity: 220, life: [220, 380], size: [10, 18] });
    });
}

/** Gövde eğilmesi (sprite ayak noktası çevresinde döner; kap/can çubuğu etkilenmez). */
function lean(c: VfxCtx, k: VfxKit, deg: number, ms: number): void {
  c.scene.tweens.add({ targets: c.actor.sprite, angle: deg, duration: k.slow(ms), ease: 'Quad.easeOut' });
}
function unlean(c: VfxCtx, k: VfxKit, ms = 160): void {
  const s = c.actor.sprite;
  c.scene.tweens.add({ targets: s, angle: 0, duration: k.slow(ms), ease: 'Quad.easeOut' });
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Double Strike: zırh şıngırtısıyla hedefin yanına koşar; 1) kılıcı başının arkasından tepeden çapraz indirir (hedefte "\" kesik),
 * 2) ikinci hasar olayından hemen önce aşağıdan yukarı ters kesik ("/") ve hedefte kısa süre X yarığı kalır.
 * İlk vuruş ~0,42 sn (x1,2: ~0,5 sn), ikincisi kendi hasar anında.
 */
const doublestrike: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const stand = standNear(a, t);
  const dir = stand.dir;
  const len = bladeLen(a);
  const fury = furious(c);
  const furyOpt = fury ? { cols: FURY_SMEAR, reach: 1.3 } : {};
  c.sfx('armorRun');
  footfalls(c, k, 190, dir);
  await a.approach(stand.x, stand.y, 190);
  const hit = (second: boolean) => {
    const p = k.spot(t);
    c.sfx('axeChop');
    cutMark(c, k, p, second ? (dir > 0 ? -0.85 : Math.PI + 0.85) : dir > 0 ? 0.85 : Math.PI - 0.85, t.h * (fury ? 0.95 : 0.75));
    if (fury) k.burst(c.scene, p.x, p.y, { colors: ['#e5463b', '#8e1f2c', '#ff9a7a'], n: 8, speed: [120, 340], gravity: 300, life: [260, 480], size: [6, 11] });
    k.burst(c.scene, p.x, p.y, { colors: SPARK, n: second ? 12 : 9, speed: [160, 460], angle: dir > 0 ? [-1.4, 1.0] : [Math.PI - 1.0, Math.PI + 1.4], gravity: 700, life: [200, 420], size: [5, 10] });
    k.burst(c.scene, p.x, p.y + 10, { colors: k.colors.BLOOD, n: 4, speed: [80, 220], angle: dir > 0 ? [-0.8, 0.6] : [Math.PI - 0.6, Math.PI + 0.8], gravity: 900, life: [300, 520], size: [6, 10] });
    c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * (second ? 22 : 14), duration: k.slow(55), yoyo: true });
    k.shake(c.scene, second ? 120 : 90, second ? 0.005 : 0.0035);
    if (second) {
      const x = k.v2Sprite(c, 'gash', '#e5463b', p.x, p.y, Math.round(t.h * 0.62), k.DEPTH + 28).setAlpha(0.95);
      k.grow(c.scene, x, 1.25, 1, 120);
      c.scene.tweens.add({ targets: x, alpha: 0, delay: k.slow(260), duration: k.slow(320), onComplete: () => x.destroy() });
    }
  };
  // 1) tepeden çapraz iniş: kılıç başının arkasından (-2.5 rad) öne-aşağı (0.9)
  lean(c, k, -dir * 6, 80);
  c.sfx('axeSwing');
  await k.wait(c.scene, k.slow(40));
  lean(c, k, dir * 9, 120);
  c.scene.tweens.add({ targets: a.container, x: stand.x + dir * 20, duration: k.slow(90), yoyo: true });
  const first = new Promise<void>((resolve) => {
    void swing(c, k, { pivot: () => hands(a, dir), dir, len, a0: -2.5, a1: 0.95, dur: 135, hitAt: 0.76, onHit: () => { hit(false); resolve(); }, ...furyOpt });
  });
  await first;
  c.gate(
    1,
    async () => {
      // 2) ters kesik: aşağıdan yukarı
      lean(c, k, -dir * 4, 70);
      c.sfx('axeSwing');
      c.scene.tweens.add({ targets: a.container, x: stand.x + dir * 24, duration: k.slow(80), yoyo: true });
      await new Promise<void>((resolve) => {
        void swing(c, k, { pivot: () => hands(a, dir), dir, len, a0: 1.5, a1: -1.7, dur: 140, hitAt: 0.6, onHit: () => { hit(true); resolve(); }, cols: [0xffffff, 0xe6f4ff, 0xc8553d], ...furyOpt });
      });
      void k.wait(c.scene, k.slow(160)).then(() => {
        unlean(c, k);
        void a.returnHome(230);
      });
    },
    () => {
      unlean(c, k);
      void a.returnHome(230);
    },
  );
};

/**
 * Whirlwind: hedeflerin ön sırasının ortasına koşar, ayaklarını açıp kılıcı yatay tutarak 3 tur döner (kılıç önden geçerken önde,
 * arkadan geçerken arkada çizilir; gövde döndükçe aynalanır); her turda yerde toz girdabı, son turda kılıçtan çelik rüzgâr halkası kopar
 * ve tahtaya yayılır: her düşman halka kendisine değdiği an vurulur (uzaktaki biraz sonra). İlk vuruş ~0,9 sn (x1,2 ~1,1 sn; v1 ~1,1 sn).
 */
const whirlwind: V2Vfx = async (c, k) => {
  if (!c.targets.length) return;
  const a = c.actor;
  const near = c.targets.reduce((m, t) => (Math.abs(t.container.x - a.container.x) < Math.abs(m.container.x - a.container.x) ? t : m));
  const ns = standNear(a, near);
  const dir = ns.dir;
  const stand = { x: c.rowCenter ? c.rowCenter.x - dir * (a.w * 0.5 + 40) : ns.x, y: c.rowCenter?.y ?? ns.y };
  c.sfx('armorRun');
  footfalls(c, k, 210, dir);
  await a.approach(stand.x, stand.y, 210);
  const fury = furious(c);
  const len = bladeLen(a) * 1.05;
  const blade = makeBlade(c, k, 1, len, k.DEPTH + 12);
  const smearCols: Array<[number, number]> = fury ? [[1.12, 0x8e1f2c], [0.92, 0xe5463b], [0.66, 0xffb4a2]] : [[1.0, 0xfff3d6], [0.82, 0xffffff], [0.6, 0xd7dce6]];
  const smear = c.scene.add.graphics().setDepth(k.DEPTH + 10);
  const back = c.scene.add.graphics().setDepth(a.container.depth - 2);
  const baseSx = a.sprite.scaleX;
  const TURNS = 3;
  const SPIN = 560;
  let lastTurn = -1;
  const center = () => ({ x: a.container.x, y: a.container.y - a.h * 0.56 });
  const FLAT = 0.26;
  await k.counter(c.scene, k.slow(SPIN), (u) => {
    const e = u * u * 0.4 + u * 0.6; // hızlanan dönüş
    const ph = e * TURNS * Math.PI * 2;
    const p = center();
    // gövde döner: sprite yatayda cos ile daralır/aynalanır
    a.sprite.setScale(baseSx * (Math.abs(Math.cos(ph)) < 0.18 ? 0.18 * Math.sign(Math.cos(ph) || 1) : Math.cos(ph)), a.sprite.scaleY);
    // kılıç: yatay düzlemde döner -> ekranda ileri/geri uzunluğu cos, derinliği sin
    const cx = Math.cos(ph * 1 + Math.PI * 0.15);
    const sy = Math.sin(ph * 1 + Math.PI * 0.15);
    blade.img.setDepth(sy > 0 ? k.DEPTH + 12 : a.container.depth - 1);
    blade.img.setPosition(k.snap(p.x), k.snap(p.y + sy * 10));
    blade.img.setRotation(cx >= 0 ? sy * FLAT * 0.6 : Math.PI - sy * FLAT * 0.6);
    blade.img.setFlipY(cx < 0);
    blade.img.setScale(blade.img.scaleY * Math.max(0.12, Math.abs(cx)), blade.img.scaleY);
    // yatık elips smear: kılıç ucunun son ~1,4 radyanlık yolu
    smear.clear();
    back.clear();
    const n = 22;
    for (let i = 0; i < n; i++) {
      const q0 = ph + Math.PI * 0.15 - 1.4 * (1 - i / n);
      const q1 = ph + Math.PI * 0.15 - 1.4 * (1 - (i + 1) / n);
      const al = 0.95 * ((i + 1) / n) ** 1.2 * Math.min(1, u * 5);
      for (const [rr, col] of smearCols) {
        const P = (q: number, r: number) => ({ x: k.snap(p.x + Math.cos(q) * len * r), y: k.snap(p.y + Math.sin(q) * len * r * FLAT + 6) });
        const gfx = Math.sin((q0 + q1) / 2) > 0 ? smear : back;
        gfx.fillStyle(col, al).fillPoints([P(q0, rr * 0.86), P(q0, rr), P(q1, rr), P(q1, rr * 0.86)], true);
      }
    }
    const turn = Math.floor(e * TURNS);
    if (turn !== lastTurn && u < 1) {
      lastTurn = turn;
      c.sfx('axeSwing');
      const f = a.container;
      void k.ring(c.scene, f.x, f.y - 4, { r: len * 1.15, flat: 0.3, n: 22, colors: fury ? ['#8e1f2c', '#e5463b', ...k.colors.DUST] : [...k.colors.DUST, '#ffffff'], dur: 320, size: 10, startR: len * 0.5 });
      k.burst(c.scene, f.x, f.y - 8, { colors: k.colors.DUST, n: 6, speed: [80, 240], angle: [Math.PI * 1.05, Math.PI * 1.95], gravity: 160, life: [260, 480], size: [10, 20] });
    }
  });
  a.sprite.setScale(baseSx, a.sprite.scaleY);
  smear.destroy();
  back.destroy();
  c.scene.tweens.add({ targets: blade.img, alpha: 0, duration: k.slow(160), onComplete: () => blade.img.destroy() });
  // çelik rüzgâr halkası: aktörden tahtaya yayılır; hedefe değdiği an vuruş
  c.sfx('spinGale');
  k.shake(c.scene, 160, 0.004);
  const origin = { x: a.container.x, y: a.container.y - 4 };
  const FLATR = 0.36;
  const dist = (t: CombatantView) => Math.hypot(t.container.x - origin.x, (t.container.y - origin.y) / FLATR);
  const far = Math.max(300, ...c.targets.map((t) => dist(t) + 80));
  const WAVE = Math.min(420, 120 + far * 0.32);
  const g = c.scene.add.graphics().setDepth(k.DEPTH - 25);
  const arrivals = new Map<CombatantView, () => void>();
  const arrive = (t: CombatantView) => new Promise<void>((r) => arrivals.set(t, r));
  const done = k.hitsAt(c, arrive, k.wait(c.scene, k.slow(WAVE)));
  const hitSet = new Set<CombatantView>();
  void k.counter(
    c.scene,
    k.slow(WAVE),
    (u) => {
      const r = 40 + (far - 40) * u;
      g.clear();
      for (let i = 0; i < 64; i++) {
        const q = (i / 64) * Math.PI * 2;
        const x = k.snap(origin.x + Math.cos(q) * r);
        const y = k.snap(origin.y + Math.sin(q) * r * FLATR);
        const al = (1 - u) * (Math.sin(q) > 0 ? 1 : 0.6);
        g.fillStyle(fury ? 0x5a0f1c : 0x5b6579, al * 0.5).fillRect(x - 7, y - 3, 14, 8);
        g.fillStyle(fury ? (i % 3 ? 0xe5463b : 0xffb4a2) : i % 3 ? 0xd7dce6 : 0xffffff, al).fillRect(x - 5, y - 3, 10, 5);
      }
      for (const t of c.targets) {
        if (hitSet.has(t) || dist(t) > r) continue;
        hitSet.add(t);
        const p = k.spot(t);
        cutMark(c, k, p, dir > 0 ? 0.12 : Math.PI - 0.12, t.w * 1.1, 360);
        k.burst(c.scene, p.x, p.y, { colors: fury ? ['#ffb4a2', '#e5463b', '#8e1f2c'] : STEEL, n: 6, speed: [140, 360], angle: dir > 0 ? [-1.2, 0.8] : [Math.PI - 0.8, Math.PI + 1.2], gravity: 600, life: [200, 380], size: [5, 9] });
        k.burst(c.scene, t.container.x, t.container.y - 6, { colors: k.colors.DUST, n: 5, speed: [60, 200], angle: [Math.PI * 1.05, Math.PI * 1.95], gravity: 260, life: [260, 460], size: [10, 18] });
        arrivals.get(t)?.();
      }
      if (u >= 1) {
        g.destroy();
        for (const t of c.targets) arrivals.get(t)?.();
      }
    },
    'Quad.easeOut',
  );
  void k.wait(c.scene, k.slow(WAVE + 120)).then(() => void a.returnHome(240));
  await done;
};

/**
 * Charge: eğilip (gövde öne) ayağıyla toz kaldırır, kılıç önde mızrak gibi; kızıl hayalet izleri ve hız çizgileriyle hedefin dibine
 * kadar atılır (arka sıradaki hedefe de). Çarpma: dev çarpma yıldızı, ileri koni toz dalgası, hedef geri savrulur, başında 3 sersemletme
 * yıldızı ~1 sn döner (Stun). İlk vuruş ~0,36 sn (x1,2 ~0,44 sn; v1 ~0,31 sn).
 */
const charge: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const stand = standNear(a, t);
  const dir = stand.dir;
  // hazırlık: öne eğilir, ayağının dibinde toz
  c.sfx('chargeRush');
  lean(c, k, dir * 14, 70);
  k.burst(c.scene, a.container.x - dir * 20, a.container.y - 6, { colors: k.colors.DUST, n: 8, speed: [80, 260], angle: dir > 0 ? [Math.PI * 1.05, Math.PI * 1.35] : [Math.PI * 1.65, Math.PI * 1.95], gravity: 200, life: [300, 520], size: [12, 22] });
  await k.wait(c.scene, k.slow(70));
  const fury = furious(c);
  const len = bladeLen(a);
  const blade = makeBlade(c, k, dir, len, k.DEPTH + 12);
  // öfkeli hücum: kılıcın önünde ve arkasında kızıl iz (menzil +1)
  const furyTrail = fury ? c.scene.add.graphics().setDepth(k.DEPTH + 11) : null;
  const streaks = c.scene.time.addEvent({
    delay: 22,
    repeat: 16,
    callback: () => {
      const v = a.container;
      for (let i = 0; i < 2; i++) {
        const l = k.rnd(80, 170);
        const line = c.scene.add.rectangle(v.x - dir * (l / 2 + 40), v.y - k.rnd(20, a.h * 0.9), l, k.snap(k.rnd(2, 5)), k.color(k.pick(fury ? ['#ffb4a2', '#e5463b', '#8e1f2c'] : ['#ffffff', '#ffe9b0', '#e5463b'])), 0.85).setDepth(k.DEPTH + 8);
        c.scene.tweens.add({ targets: line, alpha: 0, scaleX: 0.25, duration: k.slow(200), onComplete: () => line.destroy() });
      }
      k.burst(c.scene, v.x - dir * 24, v.y - 6, { colors: k.colors.DUST, n: 2, speed: [20, 90], angle: [Math.PI * 1.1, Math.PI * 1.9], gravity: 90, life: [240, 440], size: [10, 20] });
    },
  });
  const follow = c.scene.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => {
      const h = hands(a, dir);
      blade.set(h, 0.12);
      if (furyTrail) drawFuryLance(furyTrail, k, h, dir, 0.12, len, len * 0.45, 0.9);
    },
  });
  blade.set(hands(a, dir), 0.12);
  const ghosts = c.scene.time.addEvent({ delay: 55, loop: true, callback: () => a.afterimage(0xc8553d, 0.32, 200) });
  await a.approach(stand.x, stand.y, 240);
  ghosts.remove();
  streaks.remove();
  follow.remove();
  blade.set(hands(a, dir), 0.12);
  if (furyTrail) c.scene.tweens.add({ targets: furyTrail, alpha: 0, duration: k.slow(220), onComplete: () => furyTrail.destroy() });
  // çarpma
  c.sfx('chargeSlam');
  const p = k.spot(t);
  const star = k.v2Sprite(c, 'impact', '#ffe9b0', p.x - dir * t.w * 0.2, p.y, Math.round(t.h * 0.9), k.DEPTH + 40);
  k.grow(c.scene, star, 0.4, 1.15, 140);
  c.scene.tweens.add({ targets: star, alpha: 0, angle: dir * 20, delay: k.slow(90), duration: k.slow(220), onComplete: () => star.destroy() });
  k.flash(c.scene, '#fff3d6', 0.22, 160);
  k.burst(c.scene, p.x, p.y, { colors: SPARK, n: 16, speed: [200, 560], angle: dir > 0 ? [-1.0, 1.0] : [Math.PI - 1.0, Math.PI + 1.0], gravity: 600, life: [240, 480], size: [6, 12] });
  void k.ring(c.scene, t.container.x, t.container.y - 6, { r: 190, flat: 0.3, n: 26, colors: k.colors.DUST, dur: 460, size: 12, arc: dir > 0 ? [-1.2, 1.2] : [Math.PI - 1.2, Math.PI + 1.2], startR: 30 });
  k.shake(c.scene, 180, 0.0065);
  // hedef geri savrulur, sonra yerine
  const tx = t.container.x;
  c.scene.tweens.add({ targets: t.container, x: tx + dir * 46, duration: k.slow(90), ease: 'Quad.easeOut', yoyo: true, hold: k.slow(80) });
  // sersemletme: başının üstünde dönen yıldızlar + soluk sarsıntı halkası
  const head = () => ({ x: t.container.x, y: t.container.y - t.h - 6 });
  const stars = [0, 1, 2].map(() => k.v2Sprite(c, 'daze', '#ffe9b0', head().x, head().y, 30, k.DEPTH + 50));
  void k.counter(c.scene, k.slow(1000), (u) => {
    const h = head();
    stars.forEach((s, i) => {
      const q = u * Math.PI * 5 + (i * Math.PI * 2) / 3;
      const front = Math.sin(q) > 0;
      s.setPosition(k.snap(h.x + Math.cos(q) * 40), k.snap(h.y + Math.sin(q) * 11)).setDisplaySize(front ? 30 : 24, front ? 30 : 24).setDepth(front ? k.DEPTH + 50 : t.container.depth - 1).setAlpha(u > 0.8 ? (1 - u) / 0.2 : 1);
    });
    if (u >= 1) stars.forEach((s) => s.destroy());
  });
  void k.ring(c.scene, head().x, head().y + 4, { r: 52, flat: 0.3, n: 16, colors: ['#ffd23f', '#ffffff'], dur: 420, size: 8 });
  await k.wait(c.scene, k.slow(90));
  c.scene.tweens.add({ targets: blade.img, alpha: 0, duration: k.slow(160), onComplete: () => blade.img.destroy() });
  void k.wait(c.scene, k.slow(140)).then(() => {
    unlean(c, k);
    void a.returnHome(260);
  });
};

/**
 * Öfke mızrağı: kılıç boyunca kızıl-karanlık öfke parıltısı (kabzadan `upto` uzaklığa kadar) ve ucun ötesine `ext` kadar uzanıp incelen
 * kızıl iz (menzil +1). Kılıcın altına (depth) çizilir: çelik ağız üstte kalır, parıltı çevresinde. Her karede yeniden çizilir.
 */
function drawFuryLance(g: Phaser.GameObjects.Graphics, k: VfxKit, p: Pt, dir: number, ang: number, len: number, ext: number, alpha: number, upto = len + ext, top?: Phaser.GameObjects.Graphics): void {
  g.clear();
  top?.clear();
  const dx = dir * Math.cos(ang);
  const dy = Math.sin(ang);
  const end = Math.min(upto, len + ext);
  const t = (g.scene?.time.now ?? 0) * 0.02;
  for (let d = len * 0.2; d <= end; d += 6) {
    const on = d <= len;
    const beyond = on ? 0 : (d - len) / Math.max(1, ext);
    const w = on ? 26 + 6 * Math.sin(d * 0.08 + t) : 18 * (1 - beyond) + 2;
    const x = k.snap(p.x + dx * d);
    const y = k.snap(p.y + dy * d);
    const al = alpha * (on ? 0.42 : 0.95 - beyond * 0.55);
    g.fillStyle(0x2a0a10, al * 0.45).fillRect(x - w / 2 - 3, y - w / 2 - 3, w + 6, w + 6);
    g.fillStyle(0x8e1f2c, al).fillRect(x - w / 2, y - w / 2, w, w);
    const cw = Math.max(2, k.snap(w * (on ? 0.3 : 0.42)));
    if (!on) g.fillStyle(0xe5463b, Math.min(1, al * 1.4)).fillRect(x - cw / 2, y - cw / 2, cw, cw);
    // kılıcın ağzında (üstte) kızgın öfke damarı: oluk boyunca titreyen kızıl çizgi
    else if (top) top.fillStyle((Math.floor(d / 12 + t) & 1) ? 0xff6a5a : 0xe5463b, Math.min(1, alpha * 0.9)).fillRect(x - 3, y - 3, 6, 6);
  }
}

/**
 * Abyssal Cry (kendine; madde 262: bedel yok, yalnızca 30 Rage): ayağının altında zemin çatlar, çatlaklardan karanlık kızıl öz yükselip
 * gövdesine çekilir (ekran kararır). Savaşçı kükrer (önüne kızıl ses dalgaları) ve kılıcını yukarı-ileri kaldırır; kızıl öz kollarından
 * kılıcına akar, kılıç kabzadan uca kızıl-karanlık öfkeyle dolar (uğultu + çelik gerilmesi). Gövdesinin çevresinde sırayla 3 öfke koru
 * (rün halkalı kor = 3 saldırı yükü) belirip döner; Promise üçüncü kor belirince çözülür (rozet x3 o an). Sonra kılıcı öne indirir ve ucundan
 * ileri bir sıra boyu kızıl iz uzanır (menzil +1); korlar gövdesine çekilip söner. Hasar olayı yok: efekt yalnızca zamana bağlı.
 * Rozet ~1,1 sn (x1,2 ~1,3 sn); toplam ~1,9 sn.
 */
const warcry: V2Vfx = async (c, k) => {
  const a = c.actor;
  const dir = a.combatant.side === 'party' ? 1 : -1;
  const f = k.feet(a);
  const body = k.spot(a);
  const len = bladeLen(a);
  c.sfx('abyssRumble');
  // 1) çatlak + karanlık
  const dark = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x12040a, 0).setDepth(k.DEPTH - 30);
  c.scene.tweens.add({ targets: dark, alpha: 0.42, duration: k.slow(320), yoyo: true, hold: k.slow(900), onComplete: () => dark.destroy() });
  k.cracks(c.scene, f.x, f.y, { len: 150, n: 9, flat: 0.32, dur: 1300 });
  const glow = c.scene.add.ellipse(f.x, f.y, 40, 14, 0xc0203a, 0.0).setDepth(k.FLOOR_FX + 3).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: glow, displayWidth: a.w * 1.6, displayHeight: 46, alpha: 0.75, duration: k.slow(380), yoyo: true, hold: k.slow(700), onComplete: () => glow.destroy() });
  lean(c, k, -dir * 4, 200);
  c.scene.tweens.add({ targets: a.sprite, scaleY: a.sprite.scaleY * 0.95, duration: k.slow(260), ease: 'Quad.easeOut' });
  // öz: zeminden yükselen koyu kızıl kareler gövdeye çekilir
  for (let i = 0; i < 26; i++)
    void k.wait(c.scene, k.slow(i * 13)).then(() => {
      const sx = f.x + k.rnd(-a.w * 0.9, a.w * 0.9);
      const sz = k.snap(k.rnd(6, 12));
      const r = c.scene.add.rectangle(sx, f.y - k.rnd(0, 14), sz, sz, k.color(k.pick(['#8e1f2c', '#c0203a', '#2a0a10', '#e5463b']))).setDepth(k.DEPTH + 5);
      c.scene.tweens.add({ targets: r, x: body.x + k.rnd(-14, 14), y: body.y + k.rnd(-20, 20), alpha: 0.2, duration: k.slow(k.rnd(260, 360)), ease: 'Quad.easeIn', onComplete: () => r.destroy() });
    });
  await k.wait(c.scene, k.slow(360));

  // 2) kükreme: gövde kabarır, önüne kızıl ses dalgaları; kılıç yukarı-ileri kalkar
  c.sfx('scream');
  const sy0 = a.sprite.scaleY / 0.95;
  c.scene.tweens.add({ targets: a.sprite, scaleY: sy0 * 1.05, duration: k.slow(90), ease: 'Quad.easeOut', yoyo: true, hold: k.slow(420), onComplete: () => a.sprite.setScale(a.sprite.scaleX, sy0) });
  lean(c, k, -dir * 8, 90);
  k.flash(c.scene, '#8e1f2c', 0.26, 420);
  k.shake(c.scene, 280, 0.0055);
  const facing = dir > 0 ? 0 : Math.PI;
  const mouth = { x: a.container.x + dir * a.w * 0.2, y: a.container.y - a.h * 0.84 };
  for (let i = 0; i < 3; i++)
    void k.wait(c.scene, k.slow(i * 90)).then(() =>
      k.ring(c.scene, mouth.x, mouth.y, { r: 260 + i * 60, flat: 0.75, n: 16, colors: i % 2 ? ['#8e1f2c', '#2a0a10'] : ['#e5463b', '#ff7a6a', '#ffffff'], dur: 520, size: 13, startR: 40, arc: [facing - 0.7, facing + 0.7] }),
    );
  void k.ring(c.scene, f.x, f.y - 4, { r: 200, flat: 0.3, n: 28, colors: ['#c0203a', '#8e1f2c', '#2a0a10'], dur: 600, size: 12, startR: 30 });
  const pivot = () => hands(a, dir);
  const blade = makeBlade(c, k, dir, len, k.DEPTH + 12);
  const aura = c.scene.add.graphics().setDepth(k.DEPTH + 11);
  const vein = c.scene.add.graphics().setDepth(k.DEPTH + 13);
  let ang = -1.15;
  blade.set(pivot(), ang);
  blade.img.setAlpha(0);
  c.scene.tweens.add({ targets: blade.img, alpha: 1, duration: k.slow(90) });

  // 3) öfke dolumu: kızıl öz kollarından kılıca akar, kılıç kabzadan uca dolar
  await k.wait(c.scene, k.slow(60));
  c.sfx('furyCharge');
  for (let i = 0; i < 4; i++) void k.wait(c.scene, k.slow(i * 90)).then(() => a.afterimage(0xc0203a, 0.42, 260));
  for (let i = 0; i < 16; i++)
    void k.wait(c.scene, k.slow(i * 18)).then(() => {
      const q = k.rnd(0, Math.PI * 2);
      const r0 = k.rnd(a.w * 0.5, a.w * 0.9);
      const sz = k.snap(k.rnd(6, 10));
      const sq = c.scene.add.rectangle(body.x + Math.cos(q) * r0, body.y + Math.sin(q) * r0 * 0.7, sz, sz, k.color(k.pick(['#8e1f2c', '#e5463b', '#2a0a10']))).setDepth(k.DEPTH + 13);
      const h = pivot();
      c.scene.tweens.add({ targets: sq, x: h.x, y: h.y, alpha: 0.3, duration: k.slow(200), ease: 'Quad.easeIn', onComplete: () => sq.destroy() });
    });
  await k.counter(c.scene, k.slow(380), (u) => {
    const h = pivot();
    blade.set(h, ang);
    drawFuryLance(aura, k, h, dir, ang, len, 0, 0.55 + 0.45 * u, len * (0.25 + 0.8 * u), vein);
  });

  // 4) üç öfke koru (yük) gövdenin çevresinde sırayla belirir ve döner
  const ORBIT = 1050;
  const orbitT0 = c.scene.time.now;
  const cores = [0, 1, 2].map(() => k.v2Sprite(c, 'furycore', '#e5463b', body.x, body.y, Math.max(40, Math.round(a.h * 0.26)), k.DEPTH + 40).setVisible(false));
  const placeCores = () => {
    const el = (c.scene.time.now - orbitT0) / k.slow(ORBIT);
    cores.forEach((s, i) => {
      const q = el * Math.PI * 2.2 + (i * Math.PI * 2) / 3 - Math.PI / 2;
      const front = Math.sin(q) > 0;
      s.setPosition(k.snap(body.x + Math.cos(q) * a.w * 0.72), k.snap(body.y + Math.sin(q) * a.h * 0.17)).setDepth(front ? k.DEPTH + 40 : a.container.depth - 1);
    });
  };
  const orbit = c.scene.time.addEvent({ delay: 16, loop: true, callback: placeCores });
  const glowTick = c.scene.time.addEvent({ delay: 16, loop: true, callback: () => drawFuryLance(aura, k, pivot(), dir, ang, len, 0, 0.8 + 0.2 * Math.sin(c.scene.time.now * 0.03), undefined, vein) });
  placeCores();
  for (let i = 0; i < 3; i++) {
    if (i) await k.wait(c.scene, k.slow(110));
    const s = cores[i]!;
    s.setVisible(true);
    k.grow(c.scene, s, 0.2, 1, 140);
    k.burst(c.scene, s.x, s.y, { colors: ['#ffd23f', '#e5463b', '#8e1f2c'], n: 7, speed: [60, 200], gravity: 120, life: [220, 420], size: [5, 9] });
  }

  // 5) (arka planda) kılıç öne iner, ucundan ileri kızıl iz uzanır (menzil +1); korlar gövdeye çekilip söner
  void (async () => {
    await k.wait(c.scene, k.slow(120));
    glowTick.remove();
    lean(c, k, dir * 6, 120);
    const a0 = ang;
    await k.counter(c.scene, k.slow(140), (u) => {
      ang = a0 + (0.04 - a0) * (u * u);
      drawFuryLance(aura, k, pivot(), dir, ang, len, 0, 1, undefined, vein);
      blade.set(pivot(), ang);
    });
    c.sfx('axeSwing');
    const reach = Math.max(200, a.w * 1.7);
    await k.counter(
      c.scene,
      k.slow(240),
      (u) => {
        blade.set(pivot(), ang);
        drawFuryLance(aura, k, pivot(), dir, ang, len, reach * u, 1, undefined, vein);
      },
      'Quad.easeOut',
    );
    const h = pivot();
    const tip = { x: h.x + dir * Math.cos(ang) * (len + reach), y: h.y + Math.sin(ang) * (len + reach) };
    k.burst(c.scene, tip.x, tip.y, { colors: ['#ffb4a2', '#e5463b', '#8e1f2c'], n: 9, speed: [80, 260], angle: dir > 0 ? [-0.7, 0.7] : [Math.PI - 0.7, Math.PI + 0.7], gravity: 200, life: [240, 440], size: [5, 10] });
    // korlar gövdeye çekilir
    orbit.remove();
    cores.forEach((s, i) =>
      c.scene.tweens.add({ targets: s, x: body.x, y: body.y + 6, scaleX: s.scaleX * 0.3, scaleY: s.scaleY * 0.3, alpha: 0, delay: k.slow(i * 50), duration: k.slow(260), ease: 'Quad.easeIn', onComplete: () => s.destroy() }),
    );
    void k.wait(c.scene, k.slow(330)).then(() => a.afterimage(0xc0203a, 0.5, 300));
    c.scene.tweens.add({ targets: [aura, vein, blade.img], alpha: 0, delay: k.slow(120), duration: k.slow(260), onComplete: () => { aura.destroy(); vein.destroy(); blade.img.destroy(); } });
    unlean(c, k, 200);
  })();
};

export const VFX: Record<string, V2Vfx> = { doublestrike, whirlwind, charge, warcry };
