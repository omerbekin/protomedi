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
 *   abyssal_cry (Abyssal Cry)    -> 'warcry'        ayağının altında zemin çatlar, karanlık kızıl öz yükselir; kükrer: kendi
 *                                                   kanı fışkırır (bedel), ses dalgaları; çelik-mor levhalar üstüne kilitlenir (Fortified)
 */
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };

const STEEL = ['#ffffff', '#d7dce6', '#98a2b4'];
const SPARK = ['#ffffff', '#ffe9b0', '#ffd23f'];
const CRIMSON = ['#e5463b', '#8e1f2c', '#c0203a'];

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
async function swing(c: VfxCtx, k: VfxKit, o: { pivot: () => Pt; dir: number; len: number; a0: number; a1: number; dur: number; hitAt: number; onHit: () => void; cols?: number[] }): Promise<void> {
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
      drawSmear(g, k, p, o.dir, o.len * 0.42, o.len * 1.02, Math.abs(a - o.a0) < Math.abs(tail) ? o.a0 : a - tail, a, cols, 0.62);
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
  c.sfx('armorRun');
  footfalls(c, k, 190, dir);
  await a.approach(stand.x, stand.y, 190);
  const hit = (second: boolean) => {
    const p = k.spot(t);
    c.sfx('axeChop');
    cutMark(c, k, p, second ? (dir > 0 ? -0.85 : Math.PI + 0.85) : dir > 0 ? 0.85 : Math.PI - 0.85, t.h * 0.75);
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
    void swing(c, k, { pivot: () => hands(a, dir), dir, len, a0: -2.5, a1: 0.95, dur: 135, hitAt: 0.76, onHit: () => { hit(false); resolve(); } });
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
        void swing(c, k, { pivot: () => hands(a, dir), dir, len, a0: 1.5, a1: -1.7, dur: 140, hitAt: 0.6, onHit: () => { hit(true); resolve(); }, cols: [0xffffff, 0xe6f4ff, 0xc8553d] });
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
  const len = bladeLen(a) * 1.05;
  const blade = makeBlade(c, k, 1, len, k.DEPTH + 12);
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
      for (const [rr, col] of [[1.0, 0xfff3d6], [0.82, 0xffffff], [0.6, 0xd7dce6]] as Array<[number, number]>) {
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
      void k.ring(c.scene, f.x, f.y - 4, { r: len * 1.15, flat: 0.3, n: 22, colors: [...k.colors.DUST, '#ffffff'], dur: 320, size: 10, startR: len * 0.5 });
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
        g.fillStyle(0x5b6579, al * 0.5).fillRect(x - 7, y - 3, 14, 8);
        g.fillStyle(i % 3 ? 0xd7dce6 : 0xffffff, al).fillRect(x - 5, y - 3, 10, 5);
      }
      for (const t of c.targets) {
        if (hitSet.has(t) || dist(t) > r) continue;
        hitSet.add(t);
        const p = k.spot(t);
        cutMark(c, k, p, dir > 0 ? 0.12 : Math.PI - 0.12, t.w * 1.1, 360);
        k.burst(c.scene, p.x, p.y, { colors: STEEL, n: 6, speed: [140, 360], angle: dir > 0 ? [-1.2, 0.8] : [Math.PI - 0.8, Math.PI + 1.2], gravity: 600, life: [200, 380], size: [5, 9] });
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
  const len = bladeLen(a);
  const blade = makeBlade(c, k, dir, len, k.DEPTH + 12);
  const streaks = c.scene.time.addEvent({
    delay: 22,
    repeat: 16,
    callback: () => {
      const v = a.container;
      for (let i = 0; i < 2; i++) {
        const l = k.rnd(80, 170);
        const line = c.scene.add.rectangle(v.x - dir * (l / 2 + 40), v.y - k.rnd(20, a.h * 0.9), l, k.snap(k.rnd(2, 5)), k.color(k.pick(['#ffffff', '#ffe9b0', '#e5463b'])), 0.85).setDepth(k.DEPTH + 8);
        c.scene.tweens.add({ targets: line, alpha: 0, scaleX: 0.25, duration: k.slow(200), onComplete: () => line.destroy() });
      }
      k.burst(c.scene, v.x - dir * 24, v.y - 6, { colors: k.colors.DUST, n: 2, speed: [20, 90], angle: [Math.PI * 1.1, Math.PI * 1.9], gravity: 90, life: [240, 440], size: [10, 20] });
    },
  });
  const follow = c.scene.time.addEvent({ delay: 16, loop: true, callback: () => blade.set(hands(a, dir), 0.12) });
  blade.set(hands(a, dir), 0.12);
  const ghosts = c.scene.time.addEvent({ delay: 55, loop: true, callback: () => a.afterimage(0xc8553d, 0.32, 200) });
  await a.approach(stand.x, stand.y, 240);
  ghosts.remove();
  streaks.remove();
  follow.remove();
  blade.set(hands(a, dir), 0.12);
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
 * Abyssal Cry (kendine): ayağının altında zemin çatlar, çatlaklardan karanlık kızıl öz yükselip gövdesine çekilir (ekran kararır);
 * savaşçı geri kasılıp kükrer: göğsünden kendi kanı fışkırır (canının %30'u: bedel, hasar rakamı o an), önüne kızıl ses dalgaları,
 * çevresine halka. Sonra çelik-mor zırh pulları dört yandan gelip üstüne kilitlenir ve silueti bir an mor parlar (Fortified, -%50 hasar).
 * Kükreme (vuruş) ~0,42 sn (x1,2 ~0,5 sn); toplam ~1,3 sn.
 */
const warcry: V2Vfx = async (c, k) => {
  const a = c.actor;
  const dir = a.combatant.side === 'party' ? 1 : -1;
  const f = k.feet(a);
  const body = k.spot(a);
  c.sfx('abyssRumble');
  // 1) çatlak + karanlık
  const dark = c.scene.add.rectangle(960, 540, 1920, 1080, 0x12040a, 0).setDepth(k.DEPTH - 30);
  c.scene.tweens.add({ targets: dark, alpha: 0.42, duration: k.slow(320), yoyo: true, hold: k.slow(420), onComplete: () => dark.destroy() });
  k.cracks(c.scene, f.x, f.y, { len: 150, n: 9, flat: 0.32, dur: 1100 });
  const glow = c.scene.add.ellipse(f.x, f.y, 40, 14, 0xc0203a, 0.0).setDepth(k.FLOOR_FX + 3).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: glow, displayWidth: a.w * 1.6, displayHeight: 46, alpha: 0.75, duration: k.slow(380), yoyo: true, hold: k.slow(260), onComplete: () => glow.destroy() });
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
  // 2) kükreme
  c.sfx('scream');
  const sy0 = a.sprite.scaleY / 0.95;
  c.scene.tweens.add({ targets: a.sprite, scaleY: sy0 * 1.05, duration: k.slow(90), ease: 'Quad.easeOut', yoyo: true, hold: k.slow(300), onComplete: () => a.sprite.setScale(a.sprite.scaleX, sy0) });
  lean(c, k, -dir * 8, 90);
  k.flash(c.scene, '#8e1f2c', 0.3, 420);
  k.shake(c.scene, 300, 0.006);
  // kendi kanı: göğsünden fışkırır
  for (let i = 0; i < 9; i++) {
    const d = k.v2Sprite(c, 'blood', '#e5463b', body.x + dir * 10, body.y - 20, k.snap(k.rnd(18, 30)), k.DEPTH + 45);
    const ang = -Math.PI / 2 + k.rnd(-1.2, 1.2);
    const sp = k.rnd(160, 340);
    const vx = Math.cos(ang) * sp;
    const vy = Math.sin(ang) * sp;
    d.setRotation(ang + Math.PI / 2);
    void k.counter(c.scene, k.slow(620), (u) => {
      const s = (u * 620) / 1000;
      d.setPosition(k.snap(body.x + dir * 10 + vx * s), k.snap(body.y - 20 + vy * s + 0.5 * 1300 * s * s)).setAlpha(1 - u * u);
      if (u >= 1) d.destroy();
    });
  }
  k.burst(c.scene, body.x, body.y - 10, { colors: CRIMSON, n: 14, speed: [120, 320], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 900, life: [400, 700], size: [6, 12] });
  // ses dalgaları: önüne kızıl yaylar + çevreye halka
  const facing = dir > 0 ? 0 : Math.PI;
  const mouth = { x: a.container.x + dir * a.w * 0.2, y: a.container.y - a.h * 0.84 };
  for (let i = 0; i < 4; i++)
    void k.wait(c.scene, k.slow(i * 90)).then(() =>
      k.ring(c.scene, mouth.x, mouth.y, { r: 300 + i * 70, flat: 0.75, n: 18, colors: i % 2 ? ['#8e1f2c', '#2a0a10'] : ['#e5463b', '#ff7a6a', '#ffffff'], dur: 560, size: 14, startR: 40, arc: [facing - 0.75, facing + 0.75] }),
    );
  void k.ring(c.scene, f.x, f.y - 4, { r: 220, flat: 0.3, n: 30, colors: ['#c0203a', '#8e1f2c', '#2a0a10'], dur: 640, size: 12, startR: 30 });
  // 3) Fortified: zırh pulları gelip kilitlenir (kükremeden sonra; Promise önce çözülür: kendine hasar rakamı kükremeyle)
  void k.wait(c.scene, k.slow(380)).then(async () => {
    lean(c, k, 0, 160);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const q = (i / n) * Math.PI * 2 + 0.3;
      const from = { x: body.x + Math.cos(q) * 210, y: body.y + Math.sin(q) * 150 };
      const to = { x: body.x + Math.cos(q) * a.w * 0.28, y: body.y + Math.sin(q) * a.h * 0.32 };
      const pl = k.v2Sprite(c, 'plate', '#c58bff', from.x, from.y, 34, k.DEPTH + 40).setAlpha(0).setRotation(q + Math.PI / 2);
      c.scene.tweens.add({ targets: pl, alpha: 1, duration: k.slow(80), delay: k.slow(i * 22) });
      c.scene.tweens.add({ targets: pl, x: to.x, y: to.y, duration: k.slow(220), delay: k.slow(i * 22), ease: 'Quad.easeIn' });
      c.scene.tweens.add({ targets: pl, alpha: 0, scaleX: pl.scaleX * 0.6, scaleY: pl.scaleY * 0.6, delay: k.slow(260 + i * 22), duration: k.slow(200), onComplete: () => pl.destroy() });
    }
    await k.wait(c.scene, k.slow(250));
    c.sfx('fortifyClank');
    a.afterimage(0xc58bff, 0.7, 380);
    k.burst(c.scene, body.x, body.y, { colors: ['#c58bff', '#ffffff', '#d7dce6'], n: 10, speed: [80, 220], gravity: 200, life: [260, 460], size: [5, 9] });
    const shell = c.scene.add.ellipse(body.x, body.y, a.w * 1.05, a.h * 1.05).setStrokeStyle(6, 0xc58bff, 0.9).setDepth(k.DEPTH + 30);
    c.scene.tweens.add({ targets: shell, scaleX: 1.15, scaleY: 1.1, alpha: 0, duration: k.slow(420), ease: 'Quad.easeOut', onComplete: () => shell.destroy() });
  });
  await k.wait(c.scene, k.slow(60));
};

export const VFX: Record<string, V2Vfx> = { doublestrike, whirlwind, charge, warcry };
