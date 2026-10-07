/**
 * Anti-Mage - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter (assets/sprites/antimage/idle.png): zırhlı büyü avcısı; mor rünlü kılıç, kaldırdığı çelik eldivenin çevresinde süzülen kırık
 * RÜN TABLETLERİ. Görsel dil: düşmanın MAVİ manası sökülür, onun MOR boşluğuna dönüşür; tabletler mühür/kalkan kurar, kırılır.
 * Ayna tarafı: karakterin bakış yönü (`face`) konumları çevirir.
 *
 * Skill -> anahtar: mana_burn -> 'manasteal', drain_field -> 'drainfield', spell_ward -> 'spellward', void_strike -> 'voidstrike'
 * Promise VURUŞ ANINDA çözülür; tüm süreler k.slow() ile skillSlowdown'a uyar.
 */
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

const VIOLET = ['#e3ccff', '#b872ff', '#9b59d0', '#7d3fb0'];
const ACCENT = '#9b59d0';

const face = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);
/** Kaldırılmış eldiven (tabletlerin döndüğü el) ve kılıcın ortası. */
const handOf = (v: CombatantView): Pt => ({ x: v.container.x + face(v) * v.w * 0.36, y: v.container.y - v.h * 0.72 });

const dotTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2am:dot', 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    return d >= 1 ? null : { c: '#ffffff', a: (1 - d) ** 1.5 };
  });
/** Boşluk küresi: kara çekirdek, mor-beyaz ince kenar (ADD olmadan normal karışım). */
const voidTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2am:void', 64, 64, (x, y) => {
    const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 32) / 32);
    if (d >= 1) return null;
    if (d < 0.62) return { c: '#0b0712', a: 1 };
    if (d < 0.74) return { c: '#e3ccff', a: 1 };
    return { c: '#7d3fb0', a: (1 - d) / 0.26 };
  });

function glow(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, tint: number, alpha: number, depth = k.DEPTH + 40): Img {
  return c.scene.add.image(x, y, dotTex(k, c.scene)).setDisplaySize(size, size).setTint(tint).setAlpha(alpha).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
}
function fade(c: VfxCtx, k: VfxKit, obj: Phaser.GameObjects.GameObject, delay: number, dur: number, extra: Record<string, unknown> = {}): void {
  c.scene.tweens.add({ targets: obj, alpha: 0, delay: k.slow(delay), duration: k.slow(dur), ...extra, onComplete: () => obj.destroy() });
}

/** Eldivenin çevresinde dönen rün tabletleri (sprite'taki halka). Döndürür: tabletler + durdurucu. */
function handTablets(c: VfxCtx, k: VfxKit, n: number, r: number): { list: Img[]; stop: () => void; at: (i: number) => Pt } {
  const hand = handOf(c.actor);
  const list = Array.from({ length: n }, () => k.v2Sprite(c, 'tablet', ACCENT, hand.x, hand.y, 30, k.DEPTH + 34).setAlpha(0));
  let ang = 0;
  const pos = (i: number): Pt => {
    const a = ang + (i / n) * Math.PI * 2;
    return { x: hand.x + Math.cos(a) * r, y: hand.y + Math.sin(a) * r * 0.9 };
  };
  const ev = c.scene.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => {
      ang += 0.09;
      list.forEach((t, i) => {
        if (!t.getData('free')) {
          const p = pos(i);
          t.setPosition(k.snap(p.x), k.snap(p.y)).setRotation(ang + (i / n) * Math.PI * 2 + Math.PI / 2);
        }
      });
    },
  });
  list.forEach((t, i) => c.scene.tweens.add({ targets: t, alpha: 1, duration: k.slow(120), delay: k.slow(i * 25) }));
  const g = glow(c, k, hand.x, hand.y, 50, 0xb872ff, 0.0, k.DEPTH + 33);
  c.scene.tweens.add({ targets: g, alpha: 0.8, displayWidth: 110, displayHeight: 110, duration: k.slow(200) });
  fade(c, k, g, 260, 200);
  return { list, stop: () => ev.remove(), at: pos };
}

/** Tablet kırılır: çelik-mor kırıklar sekip düşer. */
function shatter(c: VfxCtx, k: VfxKit, x: number, y: number, n = 5): void {
  for (let i = 0; i < n; i++) {
    const s = k.v2Sprite(c, 'shard', ACCENT, x, y, k.rnd(12, 20), k.DEPTH + 36);
    const a = k.rnd(-Math.PI, 0);
    const sp = k.rnd(80, 220);
    const spin = k.rnd(-9, 9);
    void k.counter(c.scene, k.slow(k.rnd(360, 520)), (u) => {
      const t = u * 0.5;
      s.setPosition(k.snap(x + Math.cos(a) * sp * t), k.snap(y + Math.sin(a) * sp * t + 0.5 * 1300 * t * t)).setRotation(spin * u).setAlpha(1 - u * u);
      if (u >= 1) s.destroy();
    });
  }
}

/** Bedenden sökülen mavi mana: damlalar fışkırır, sonra eğriyle `to()` noktasına çekilir; yolda mora döner. */
function ripMana(c: VfxCtx, k: VfxKit, from: CombatantView, to: () => Pt, o: { n: number; dur: number; onAbsorb?: () => void; down?: boolean }): Promise<void> {
  const p = k.spot(from);
  const drops = Array.from({ length: o.n }, () => {
    const s = k.v2Sprite(c, 'bluedrop', ACCENT, p.x, p.y, k.rnd(22, 36), k.DEPTH + 34).setAlpha(0);
    const a = k.rnd(-Math.PI * 0.95, -Math.PI * 0.05);
    const out = k.rnd(60, 130);
    return { s, base: s.scaleX, start: { x: p.x + k.rnd(-from.w * 0.25, from.w * 0.25), y: p.y + k.rnd(-from.h * 0.2, from.h * 0.25) }, a, out, delay: k.rnd(0, 0.22), ctrl: k.rnd(50, 140), done: false };
  });
  const thread = c.scene.add.graphics().setDepth(k.DEPTH + 32).setBlendMode(k.Phaser.BlendModes.ADD);
  let absorbed = 0;
  return k.counter(c.scene, k.slow(o.dur), (u) => {
    thread.clear();
    const dst = to();
    for (const d of drops) {
      if (d.done) continue;
      const l = Math.max(0, (u - d.delay) / (1 - d.delay));
      if (l <= 0) continue;
      let x: number;
      let y: number;
      let rot: number;
      const burstK = 0.28;
      if (l < burstK) {
        const e = 1 - (1 - l / burstK) ** 2;
        x = d.start.x + Math.cos(d.a) * d.out * e;
        y = d.start.y + Math.sin(d.a) * d.out * e * 0.8;
        rot = d.a + Math.PI / 2;
      } else {
        const kk = (l - burstK) / (1 - burstK);
        const e = kk * kk;
        const ax = d.start.x + Math.cos(d.a) * d.out;
        const ay = d.start.y + Math.sin(d.a) * d.out * 0.8;
        const cx = (ax + dst.x) / 2;
        const cy = o.down ? Math.max(ay, dst.y) + d.ctrl * 0.3 : Math.min(ay, dst.y) - d.ctrl;
        const bx = (t: number) => (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * dst.x;
        const by = (t: number) => (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * dst.y;
        x = bx(e);
        y = by(e);
        const e2 = Math.min(1, e + 0.04);
        rot = Math.atan2(by(e2) - y, bx(e2) - x) - Math.PI / 2;
        // iplik: damladan geriye ince ışık
        const e0 = Math.max(0, e - 0.18);
        thread.lineStyle(3, kk > 0.5 ? 0xb872ff : 0x6ec1ff, 0.6 * (1 - kk * 0.5)).lineBetween(bx(e0), by(e0), x, y);
        d.s.setScale(d.base * (1 - 0.45 * kk), d.base * (1 + 1.4 * kk));
        if (kk > 0.5) d.s.setTint(0xc9a0ff);
        if (kk >= 1) {
          d.done = true;
          d.s.destroy();
          if (absorbed++ % 3 === 0) {
            void k.ring(c.scene, dst.x, dst.y, { r: 46, flat: 0.8, n: 12, colors: VIOLET, dur: 220, size: 6 });
            o.onAbsorb?.();
          }
          continue;
        }
      }
      d.s.setPosition(k.snap(x), k.snap(y)).setRotation(rot).setAlpha(Math.min(1, l * 8));
    }
    if (u >= 1) {
      for (const d of drops) if (!d.done) d.s.destroy();
      thread.destroy();
    }
  });
}

// =====================================================================================================================
// MANA STEAL

/**
 * Mana Steal (yakın dövüş, tek hedef): Anti-Mage mor hayalet izler bırakarak hedefin yanına atılır, rünlü kılıcıyla çapraz keser (mor-beyaz
 * yay, kesik boyunca yanan rün kıvılcımları; vuruş anı = hasar). Kesikten hedefin MAVİ manası damlalar hâlinde fışkırır, ışık iplikleriyle
 * geri dönen Anti-Mage'e çekilir; yolda MORA döner ve onun bedenine emilir (çalınan mana). İlk hasar ~0,34 sn.
 */
const manasteal: V2Vfx = async (c, k) => {
  const t0 = c.targets[0];
  if (!t0) return;
  c.sfx('swordWhoosh');
  const dir = t0.container.x >= c.actor.container.x ? 1 : -1;
  const stand = { x: t0.container.x - dir * (t0.w * 0.5 + c.actor.w * 0.5 + 6), y: t0.container.y };
  await c.actor.approach(stand.x, stand.y, 170, 0x9b59d0);
  c.actor.play('attack');
  c.scene.tweens.add({ targets: c.actor.container, x: stand.x + dir * 24, duration: k.slow(60), yoyo: true });
  c.sfx('manaSizzle');
  for (const t of c.targets) {
    const p = k.spot(t);
    void k.arcSlash(c.scene, p.x, p.y, { dir, colors: ['#ffffff', '#e3ccff', '#b872ff', '#9b59d0'], from: -1.1, to: 1.0, r: 110, dur: 150, size: 18 });
    void k.arcSlash(c.scene, p.x - dir * 8, p.y + 6, { dir, colors: ['#7d3fb0', '#5a2a9c'], from: -1.0, to: 0.9, r: 96, dur: 170, size: 10 });
    // kesik boyunca yanan rünler
    for (let i = 0; i < 5; i++) {
      const a = -1 + i * 0.5;
      const rx = p.x + dir * Math.cos(a) * 60 + dir * 6;
      const ry = p.y + Math.sin(a) * 110;
      const rn = k.v2Sprite(c, 'tablet', ACCENT, rx, ry, 22, k.DEPTH + 42).setAlpha(0).setBlendMode(k.Phaser.BlendModes.ADD);
      c.scene.tweens.add({ targets: rn, alpha: 1, duration: k.slow(60), delay: k.slow(i * 24) });
      fade(c, k, rn, i * 24 + 140, 220, { y: ry - 20 });
    }
    const fl = glow(c, k, p.x, p.y, 90, 0xb872ff, 0.9);
    c.scene.tweens.add({ targets: fl, displayWidth: 220, displayHeight: 220, alpha: 0, duration: k.slow(260), onComplete: () => fl.destroy() });
    k.burst(c.scene, p.x, p.y, { colors: [...VIOLET, '#ffffff'], n: 12, speed: [140, 380], gravity: 300, life: [260, 480], size: [6, 12] });
    k.flash(c.scene, '#2a0a4a', 0.16, 220);
  }
  // geri dönüş + mana sökümü (arka planda)
  void k.wait(c.scene, k.slow(200)).then(() => c.actor.returnHome(260, 0x9b59d0));
  void k.wait(c.scene, k.slow(90)).then(() => {
    c.sfx('energySlurp');
    for (const t of c.targets)
      void ripMana(c, k, t, () => k.spot(c.actor), { n: 10, dur: 700, onAbsorb: () => k.burst(c.scene, c.actor.container.x, c.actor.container.y - c.actor.h * 0.5, { colors: VIOLET, n: 3, speed: [40, 160], gravity: 0, life: [200, 360], size: [4, 8] }) }).then(() => {
        const a = k.spot(c.actor);
        const g = glow(c, k, a.x, a.y, c.actor.w * 1.2, 0x9b59d0, 0.6, k.DEPTH + 20);
        fade(c, k, g, 60, 360);
        c.actor.afterimage(0xb872ff, 0.5, 300);
      });
  });
  await k.wait(c.scene, k.slow(40));
};

// =====================================================================================================================
// DRAIN FIELD

/**
 * Drain Field (rect 3x3, yalnızca MP yakar): Anti-Mage eldivenini kaldırır, çevresinde rün tabletleri döner; tabletler alanın köşelerine ve
 * merkezine uçup yere ÇAKILIR (mühür kazıkları). Kazıkların arasında alanın dış hattı mor rün çizgisiyle çizilir, hücreler merkezden dışa
 * koyu mor boşluğa döner (her hücrede rün kazıması + yumuşak ışıma). Sonra alandaki her karakterin MAVİ manası bedeninden sökülüp
 * aşağı, mühre doğru çekilerek yutulur (MP yanma rakamları o an). Sonunda tabletler kırılır, mühür söner. MP yanması ~1,4 sn.
 */
const drainfield: V2Vfx = async (c, k) => {
  c.sfx('voidSuction');
  c.actor.play('cast');
  const tabs = handTablets(c, k, 5, 46);
  c.sfx('tabletClack');
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const center = midSlot !== undefined ? k.cellMid(c.board, midSlot) : (c.centerPos ?? k.feet(c.actor));
  const quads = slots.map((s) => ({ s, q: k.quadOf(c.board, s, 1), m: k.cellMid(c.board, s) }));
  // alanın 4 köşesi (tüm hücre köşelerinin en uç olanları) + merkez
  const pts = quads.flatMap((x) => x.q);
  const pick = (f: (p: Pt) => number) => pts.reduce((b, p) => (f(p) > f(b) ? p : b));
  const stakes: Pt[] = [pick((p) => -p.x - p.y * 0.3), pick((p) => p.x - p.y * 0.3), pick((p) => p.x + p.y * 0.3), pick((p) => -p.x + p.y * 0.3), center];
  await k.wait(c.scene, k.slow(220));
  tabs.stop();
  // tabletler kazık olarak uçar
  const land = tabs.list.map(async (t, i) => {
    t.setData('free', true);
    const to = stakes[i % stakes.length]!;
    await k.travel(c.scene, t, { x: to.x, y: to.y - 18 }, 240, { ease: 'in', arc: 90, spin: 1 });
    t.setRotation(0);
    c.scene.tweens.add({ targets: t, y: to.y - 8, duration: k.slow(60) });
    k.burst(c.scene, to.x, to.y, { colors: ['#98a2b4', '#d7dce6', '#b872ff'], n: 5, speed: [60, 180], angle: [-Math.PI, 0], gravity: 500, life: [240, 420], size: [4, 8] });
    const g = glow(c, k, to.x, to.y - 10, 70, 0xb872ff, 0.9, k.DEPTH + 30);
    fade(c, k, g, 0, 300);
  });
  await Promise.all(land);
  c.actor.play('idle');
  c.sfx('tabletClack');
  // mühür: dış hat + hücre boşluğu
  const floor = c.scene.add.graphics().setDepth(k.FLOOR_FX);
  const dist = quads.map((x) => Math.hypot(x.m.x - center.x, x.m.y - center.y));
  const span = Math.max(1, ...dist);
  const glows = quads.map((x) => glow(c, k, x.m.x, x.m.y, 1, 0x9b59d0, 0, k.FLOOR_FX + 2));
  const shrink = (q: Pt[], s: number) => {
    const cx = (q[0]!.x + q[2]!.x) / 2;
    const cy = (q[0]!.y + q[2]!.y) / 2;
    return q.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
  };
  const draw = (u: number, hot = 0) => {
    floor.clear();
    quads.forEach((x, i) => {
      const v = Math.max(0, Math.min(1, (u - (dist[i]! / span) * 0.5) / 0.5));
      if (v <= 0) return;
      const e = 1 - (1 - v) ** 2;
      floor.fillStyle(0x1a0830, 0.7 * e).fillPoints(shrink(x.q, 0.98), true);
      floor.fillStyle(hot ? 0xb872ff : 0x5a2a9c, (0.5 + 0.3 * hot) * e).fillPoints(shrink(x.q, 0.7 * e), true);
      // rün kazıması: iç eşkenar dörtgen + köşegen çizgiler
      const iq = shrink(x.q, 0.55);
      floor.lineStyle(2, 0xe3ccff, 0.75 * e).strokePoints(iq, true);
      floor.lineBetween(iq[0]!.x, iq[0]!.y, iq[2]!.x, iq[2]!.y);
      floor.lineStyle(3, 0xb872ff, 0.9 * e).strokePoints(shrink(x.q, 0.98), true);
      glows[i]!.setAlpha((0.45 + 0.45 * hot) * e).setDisplaySize(160 * e, 70 * e);
    });
  };
  await k.counter(c.scene, k.slow(420), (u) => draw(u), 'Quad.easeOut');
  c.sfx('voidPulse');
  draw(1, 1);
  k.flash(c.scene, '#3a0a5a', 0.22, 300);
  k.shake(c.scene, 180, 0.005);
  // mana sökümü: her hedeften mana aşağı, mühre
  c.sfx('energySlurp');
  let release: () => void = () => undefined;
  const firstSink = new Promise<void>((r) => (release = r));
  for (const t of c.targets) {
    const fp = k.feet(t);
    void ripMana(c, k, t, () => ({ x: fp.x, y: fp.y }), { n: 8, dur: 620, down: true, onAbsorb: () => {
      release();
      const sp = glow(c, k, fp.x, fp.y - 4, 60, 0xb872ff, 0.9, k.FLOOR_FX + 3);
      c.scene.tweens.add({ targets: sp, displayWidth: 120, displayHeight: 40, alpha: 0, duration: k.slow(260), onComplete: () => sp.destroy() });
    } });
    const fx = t.sprite.postFX?.addGlow(k.color('#b872ff'), 8, 0, false, 0.1, 16);
    if (fx) c.scene.tweens.add({ targets: fx, outerStrength: 0, duration: k.slow(1100), delay: k.slow(300), onComplete: () => t.sprite.postFX?.remove(fx) });
  }
  if (!c.targets.length) release();
  // kuyruk: tabletler kırılır, mühür söner
  void k.wait(c.scene, k.slow(720)).then(() => {
    for (const t of tabs.list) {
      shatter(c, k, t.x, t.y, 4);
      t.destroy();
    }
    c.scene.tweens.add({ targets: [floor, ...glows], alpha: 0, duration: k.slow(600), onComplete: () => { floor.destroy(); glows.forEach((g) => g.destroy()); } });
  });
  await Promise.race([firstSink, k.wait(c.scene, k.slow(500))]);
};

// =====================================================================================================================
// SPELL WARD

/**
 * Spell Ward (tek dost ya da kendisi): Anti-Mage eldivenini kaldırır, tabletler eldivenin çevresinde döner; sonra dosta uçar (kendine
 * atınca yerinde kalır) ve dostun çevresinde dönen bir rün halkası kurar. Tabletler KİLİTLENİNCE altıgen mor büyü kalkanı kapanır;
 * altıgenin köşelerinden dışa doğru dikenler fırlayıp geri çekilir (kalkana vuranın manasını yakar, bir buff'ını söker: misilleme).
 * Kalkan rakamı kilitlenince (~0,95 sn). Tabletler bir süre dönüp söner.
 */
const spellward: V2Vfx = async (c, k) => {
  c.sfx('wardHum');
  c.actor.play('cast');
  const tabs = handTablets(c, k, 6, 50);
  await k.wait(c.scene, k.slow(190));
  c.actor.play('idle');
  await Promise.all(
    c.targets.map(async (t, ti) => {
      const mid = k.spot(t);
      const R = Math.max(t.w * 0.62, t.h * 0.5);
      const mine = ti === 0 ? tabs.list : tabs.list.map((x) => k.v2Sprite(c, 'tablet', ACCENT, x.x, x.y, 30, k.DEPTH + 34));
      if (ti === 0) tabs.stop();
      // tabletler dostun çevresine
      const n = mine.length;
      await Promise.all(
        mine.map(async (tb, i) => {
          tb.setData('free', true);
          const a = (i / n) * Math.PI * 2;
          await k.travel(c.scene, tb, { x: mid.x + Math.cos(a) * R, y: mid.y + Math.sin(a) * R * 0.85 }, t === c.actor ? 120 : 220, { ease: 'out', arc: 60, spin: 0.5 });
        }),
      );
      // halka döner ve kilitlenir
      let ang = 0;
      const orbit = c.scene.time.addEvent({ delay: 16, loop: true, callback: () => {
        ang += 0.05;
        mine.forEach((tb, i) => {
          const a = ang + (i / n) * Math.PI * 2;
          tb.setPosition(k.snap(mid.x + Math.cos(a) * R), k.snap(mid.y + Math.sin(a) * R * 0.85)).setRotation(a + Math.PI / 2);
        });
      } });
      await k.wait(c.scene, k.slow(90));
      c.sfx('wardLock');
      // altıgen kalkan kapanır
      const hex = c.scene.add.graphics().setDepth(k.DEPTH + 26);
      const hexPts = (r: number, rot: number) => Array.from({ length: 6 }, (_, i) => ({ x: mid.x + Math.cos(rot + (i / 6) * Math.PI * 2) * r, y: mid.y + Math.sin(rot + (i / 6) * Math.PI * 2) * r * 0.95 }));
      void k.counter(c.scene, k.slow(200), (u) => {
        const e = 1 - (1 - u) ** 3;
        hex.clear();
        hex.fillStyle(0x7d3fb0, 0.22 * e).fillPoints(hexPts(R * 0.95 * e, Math.PI / 6), true);
        hex.lineStyle(5, 0xe3ccff, 0.95 * e).strokePoints(hexPts(R * 0.95 * e, Math.PI / 6), true);
        hex.lineStyle(3, 0xb872ff, 0.8 * e).strokePoints(hexPts(R * 0.78 * e, Math.PI / 6), true);
      });
      const fl = glow(c, k, mid.x, mid.y, R * 2.6, 0xb872ff, 0.55, k.DEPTH + 25);
      fade(c, k, fl, 60, 320);
      // misilleme dikenleri: köşelerden dışa
      for (const p of hexPts(R * 0.95, Math.PI / 6)) {
        const a = Math.atan2(p.y - mid.y, p.x - mid.x);
        const sp = k.v2Sprite(c, 'needle', ACCENT, p.x, p.y, 44, k.DEPTH + 37).setRotation(a + Math.PI / 2).setAlpha(0);
        c.scene.tweens.add({ targets: sp, x: p.x + Math.cos(a) * 34, y: p.y + Math.sin(a) * 34, alpha: 1, duration: k.slow(110), delay: k.slow(120), ease: 'Back.easeOut', yoyo: true, hold: k.slow(90), onComplete: () => sp.destroy() });
      }
      void k.ring(c.scene, mid.x, mid.y, { r: R * 1.4, flat: 0.95, n: 28, colors: VIOLET, dur: 360, size: 7 });
      // kuyruk: kalkan solar, tabletler bir süre döner ve söner
      c.scene.tweens.add({ targets: hex, alpha: 0.35, delay: k.slow(300), duration: k.slow(300) });
      fade(c, k, hex, 700, 300);
      void k.wait(c.scene, k.slow(800)).then(() => {
        orbit.remove();
        for (const tb of mine) fade(c, k, tb, 0, 240, { displayWidth: 8, displayHeight: 8 });
      });
      await k.wait(c.scene, k.slow(120));
    }),
  );
};

// =====================================================================================================================
// VOID STRIKE

/**
 * Void Strike (tek hedef, kayıp mana kadar güçlü): Anti-Mage kılıcını hedefe doğrultur, rünler parlar. Hedefin göğsünde kara bir BOŞLUK
 * TEKİLLİĞİ açılır (kara çekirdek, mor-beyaz olay ufku); hedefin geri kalan mavi manası girdap gibi içine çekilir (yoksunluk gücü).
 * Çevresinde sekiz mor iğne belirir, titreyerek gerilir ve hepsi aynı anda merkeze saplanır: tekillik ÇÖKER (kısa içe çekilme), sonra
 * dışa şok halkası, beyaz parlama, iğne kırıkları (vuruş anı). İlk hasar ~1,0 sn (v1 ~1,6 sn).
 */
const voidstrike: V2Vfx = async (c, k) => {
  c.sfx('voidPulse');
  c.actor.play('cast');
  const hand = handOf(c.actor);
  const hg = glow(c, k, hand.x, hand.y, 40, 0x9b59d0, 0.9, k.DEPTH + 33);
  c.scene.tweens.add({ targets: hg, displayWidth: 120, displayHeight: 120, alpha: 0, duration: k.slow(320), onComplete: () => hg.destroy() });
  c.actor.afterimage(0xb872ff, 0.45, 260);
  await k.wait(c.scene, k.slow(160));
  c.actor.play('idle');
  await Promise.all(
    c.targets.map(async (t) => {
      const p = k.spot(t);
      const v = c.scene.add.image(p.x, p.y, voidTex(k, c.scene)).setDisplaySize(10, 10).setDepth(k.DEPTH + 30);
      const halo = glow(c, k, p.x, p.y, 40, 0x7d3fb0, 0.8, k.DEPTH + 29);
      const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x10041c, 0).setDepth(k.DEPTH - 25);
      c.scene.tweens.add({ targets: dim, alpha: 0.32, duration: k.slow(300) });
      c.scene.tweens.add({ targets: v, displayWidth: 86, displayHeight: 86, duration: k.slow(320), ease: 'Quad.easeOut' });
      c.scene.tweens.add({ targets: halo, displayWidth: 240, displayHeight: 240, alpha: 0.6, duration: k.slow(320) });
      // kalan mana girdapla içine
      void ripMana(c, k, t, () => ({ x: p.x, y: p.y }), { n: 9, dur: 520 });
      // iğneler halkada belirir, gerilir
      const N = 8;
      const R = Math.max(t.w, t.h) * 0.62;
      const needles = Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2 + 0.2;
        const s = k.v2Sprite(c, 'needle', ACCENT, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R * 0.85, 70, k.DEPTH + 35).setRotation(a - Math.PI / 2).setAlpha(0);
        return { s, a, base: s.scaleX };
      });
      await k.counter(c.scene, k.slow(380), (u) => {
        for (const n of needles) {
          const r = R * (1 + 0.15 * u);
          const j = u > 0.5 ? Math.sin(u * 90 + n.a * 7) * 2 : 0;
          n.s.setPosition(k.snap(p.x + Math.cos(n.a) * r + j), k.snap(p.y + Math.sin(n.a) * r * 0.85 + j)).setAlpha(Math.min(1, u * 3)).setScale(n.base * (0.6 + 0.4 * u), n.base * (0.5 + 0.7 * u));
        }
      });
      c.sfx('implode');
      // saplanma + çöküş
      await k.counter(c.scene, k.slow(110), (u) => {
        const e = u * u;
        for (const n of needles) n.s.setPosition(k.snap(p.x + Math.cos(n.a) * R * 1.15 * (1 - e)), k.snap(p.y + Math.sin(n.a) * R * 0.98 * (1 - e)));
        v.setDisplaySize(86 * (1 - 0.8 * e), 86 * (1 - 0.8 * e));
      });
      needles.forEach((n) => n.s.destroy());
      v.destroy();
      halo.destroy();
      // patlama
      k.flash(c.scene, '#e3ccff', 0.35, 220);
      k.shake(c.scene, 180, 0.007);
      const core = glow(c, k, p.x, p.y, 40, 0xffffff, 1, k.DEPTH + 45);
      c.scene.tweens.add({ targets: core, displayWidth: 200, displayHeight: 200, alpha: 0, duration: k.slow(260), onComplete: () => core.destroy() });
      const wave = c.scene.add.ellipse(p.x, p.y, 40, 40).setStrokeStyle(8, 0xb872ff, 1).setDepth(k.DEPTH + 44);
      c.scene.tweens.add({ targets: wave, displayWidth: R * 4, displayHeight: R * 3.4, alpha: 0, duration: k.slow(380), ease: 'Cubic.easeOut', onComplete: () => wave.destroy() });
      void k.ring(c.scene, p.x, p.y, { r: R * 1.7, flat: 0.9, n: 32, colors: [...VIOLET, '#ffffff'], dur: 440, size: 10 });
      k.burst(c.scene, p.x, p.y, { colors: [...VIOLET, '#0b0712'], n: 26, speed: [140, 460], gravity: 200, life: [380, 720], size: [8, 16] });
      shatter(c, k, p.x, p.y, 8);
      c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(500), onComplete: () => dim.destroy() });
    }),
  );
};

export const VFX: Record<string, V2Vfx> = { manasteal, drainfield, spellward, voidstrike };
