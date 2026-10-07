/**
 * Mage - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter: avucunda mavi alev, elinde mavi kristalli asa, cübbesinde altın mühürler (assets/sprites/mage/idle.png). Büyüler YERİNDE atılır:
 * ateş avuçtaki mavi çekirdekten doğar (en sıcak gaz alevi mavi-beyaz, dışı turuncu), buz ve kalkan asanın kristalinden, büyük
 * büyüler (Meteor) altın mühür geometrisiyle açılır. Ayna tarafı: karakterin bakış yönü (`face`) her konumu çevirir.
 *
 * Skill -> anahtar: fire_bolt -> 'fireball', blizzard -> 'blizzard', mana_barrier -> 'barrier', meteor -> 'meteor'
 * Promise VURUŞ ANINDA çözülür; kuyruk (sönen parçacıklar) arkada akar. Tüm süreler k.slow() ile skillSlowdown'a uyar.
 */
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

const FIRE = ['#ff4d1a', '#ff8a1f', '#ffd23f', '#fff2c0'];
const EMBER = ['#ff8a1f', '#ffd23f', '#ff4d1a'];
const ICE = ['#ffffff', '#d8f6ff', '#a8ebff', '#6ec1ff'];
const MANA = ['#ffffff', '#a8ebff', '#6ec1ff', '#4aa3ff'];

/** Karakterin baktığı yön: oyuncu sağa (+1), düşman sola (-1). */
const face = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);
/** Mage'in avucu (mavi alevli el) ve asasının kristali (sprite oranlarından). */
const handOf = (v: CombatantView): Pt => ({ x: v.container.x + face(v) * v.w * 0.38, y: v.container.y - v.h * 0.71 });
const staffOf = (v: CombatantView): Pt => ({ x: v.container.x - face(v) * v.w * 0.43, y: v.container.y - v.h * 0.92 });

/** Yumuşak radyal nokta (beyaz; tint ile renklenir, ADD ile ışık). */
const dotTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:dot', 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    return d >= 1 ? null : { c: '#ffffff', a: (1 - d) ** 1.5 };
  });
/** Duman/bulut topağı (kenarı düzensiz, beyaz; tint ile renklenir). */
const puffTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:puff', 40, 40, (x, y) => {
    const a = Math.atan2(y - 20, x - 20);
    const r = 0.82 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 7);
    const d = Math.hypot((x + 0.5 - 20) / 20, (y + 0.5 - 20) / 20) / r;
    if (d >= 1) return null;
    return { c: y < 15 ? '#ffffff' : y < 26 ? '#e6e6e6' : '#bdbdbd', a: Math.min(1, (1 - d) * 2.4) };
  });
/** Fırtına bulutu: kabarık topaklar, üstü ay ışığı açık, altı koyu (kendi renkleriyle; tint gerekmez). */
const stormTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:storm', 96, 44, (x, y) => {
    const blobs: Array<[number, number, number, number]> = [[18, 26, 16, 12], [36, 18, 18, 14], [56, 16, 17, 14], [74, 24, 16, 12], [46, 30, 30, 11], [28, 32, 18, 8], [66, 32, 18, 8]];
    let a = 0;
    let top = 1;
    for (const [bx, by, rx, ry] of blobs) {
      const d = Math.hypot((x + 0.5 - bx) / rx, (y + 0.5 - by) / ry);
      if (1 - d > a) {
        a = 1 - d;
        top = (y + 0.5 - (by - ry)) / (ry * 2); // 0 = topağın tepesi, 1 = altı
      }
    }
    if (a <= 0) return null;
    const c = top < 0.3 ? '#d4dcea' : top < 0.55 ? '#9aa8c2' : top < 0.8 ? '#64728f' : '#3c4660';
    return { c, a: Math.min(1, a * 3) };
  });
/** Kabarcık kubbe: ortası saydam, kenarı parlak (Mana Barrier). */
const bubbleTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:bubble', 64, 64, (x, y) => {
    const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 32) / 32);
    if (d >= 1) return null;
    const rim = Math.max(0, (d - 0.72) / 0.28) ** 2;
    const spec = Math.hypot((x - 20) / 10, (y - 18) / 6) < 1 ? 0.55 : 0;
    return { c: '#ffffff', a: Math.min(1, 0.1 + rim * 0.95 + spec) };
  });
/** Isı ışığı sütunu (alt kızgın, üste söner): alev sütunu/patlama gövdesi. */
const columnTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2mage:column', 24, 64, (x, y) => {
    const u = Math.abs((x + 0.5) / 24 - 0.5) * 2;
    const body = (1 - u ** 1.4) ** 1.2;
    const fade = Math.min(1, (y + 1) / 44);
    return { c: '#ffffff', a: body * fade };
  });

function glow(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, tint: number, alpha: number, depth = k.DEPTH + 40): Img {
  return c.scene.add.image(x, y, dotTex(k, c.scene)).setDisplaySize(size, size).setTint(tint).setAlpha(alpha).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
}

/** Nesneyi söndürüp yok eder. */
function fade(c: VfxCtx, k: VfxKit, obj: Phaser.GameObjects.GameObject, delay: number, dur: number, extra: Record<string, unknown> = {}): void {
  c.scene.tweens.add({ targets: obj, alpha: 0, delay: k.slow(delay), duration: k.slow(dur), ...extra, onComplete: () => obj.destroy() });
}

/** Yükselip genişleyen duman (koyu, normal karışım). */
function smoke(c: VfxCtx, k: VfxKit, x: number, y: number, o: { n: number; spread: number; size: [number, number]; rise: [number, number]; life: [number, number]; tint?: number; alpha?: number; drift?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const s = k.rnd(o.size[0], o.size[1]);
    const p = c.scene.add.image(x + k.rnd(-o.spread, o.spread), y + k.rnd(-o.spread * 0.3, o.spread * 0.3), puffTex(k, c.scene)).setDisplaySize(s * 0.5, s * 0.5).setTint(o.tint ?? 0x3a3330).setAlpha(0).setDepth(k.DEPTH + 22).setRotation(k.rnd(0, 6));
    const life = k.rnd(o.life[0], o.life[1]);
    c.scene.tweens.add({ targets: p, alpha: o.alpha ?? 0.55, duration: k.slow(life * 0.18) });
    c.scene.tweens.add({ targets: p, x: p.x + (o.drift ?? 0) * k.rnd(0.5, 1.2), y: p.y - k.rnd(o.rise[0], o.rise[1]), displayWidth: s * 1.3, displayHeight: s * 1.3, rotation: p.rotation + k.rnd(-0.8, 0.8), duration: k.slow(life), ease: 'Quad.easeOut' });
    fade(c, k, p, life * 0.4, life * 0.6);
  }
}

/** Altın mühür halkası: yassı (yere/havaya yatık) açılır, döner, söner. */
function sigil(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, flat: number, o: { open?: number; hold?: number; spin?: number; depth?: number; tint?: string; flatX?: number } = {}): Img {
  const s = k.v2Sprite(c, 'sigilring', o.tint ?? '#ffd23f', x, y, size, o.depth ?? k.DEPTH + 24).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
  const base = s.scaleX;
  const fx = o.flatX ?? 1;
  s.setScale(base * 0.2 * fx, base * 0.2 * flat);
  c.scene.tweens.add({ targets: s, scaleX: base * fx, scaleY: base * flat, alpha: 1, duration: k.slow(o.open ?? 220), ease: 'Back.easeOut' });
  // yatık elipste dönüş: dokuyu döndürmek elipsi bozar, bu yüzden yalnızca düz (flat=1, flatX=1) halkada açı döner
  if (flat === 1 && fx === 1) c.scene.tweens.add({ targets: s, angle: (o.spin ?? 90) * (Math.random() < 0.5 ? 1 : -1), duration: k.slow((o.open ?? 220) + (o.hold ?? 400) + 300) });
  else {
    // yatık halkada dönüş hissi: parlaklık nabzı
    c.scene.tweens.add({ targets: s, alpha: 0.65, delay: k.slow(o.open ?? 220), duration: k.slow(140), yoyo: true, repeat: 1 });
  }
  fade(c, k, s, (o.open ?? 220) + (o.hold ?? 400), 300);
  return s;
}

/** Avuç alevi kabarır: mavi çekirdek + içe çekilen mavi kıvılcımlar (Fire Bolt, Meteor hazırlığı). */
function palmFlare(c: VfxCtx, k: VfxKit, p: Pt, dur: number, tint = 0x4aa3ff): void {
  const outer = glow(c, k, p.x, p.y, 40, tint, 0.0);
  const core = glow(c, k, p.x, p.y, 20, 0xd8f6ff, 0.0);
  c.scene.tweens.add({ targets: outer, alpha: 0.95, displayWidth: 120, displayHeight: 120, duration: k.slow(dur), ease: 'Quad.easeIn' });
  c.scene.tweens.add({ targets: core, alpha: 1, displayWidth: 54, displayHeight: 54, duration: k.slow(dur), ease: 'Quad.easeIn' });
  fade(c, k, outer, dur, 160);
  fade(c, k, core, dur, 120);
  // içe çekilen kıvılcımlar
  for (let i = 0; i < 12; i++) {
    const a = k.rnd(0, Math.PI * 2);
    const r = k.rnd(60, 110);
    const sp = c.scene.add.rectangle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 4, 4, k.color(k.pick(MANA))).setDepth(k.DEPTH + 42);
    c.scene.tweens.add({ targets: sp, x: p.x, y: p.y, duration: k.slow(k.rnd(dur * 0.5, dur)), delay: k.slow(k.rnd(0, dur * 0.3)), ease: 'Quad.easeIn', onComplete: () => sp.destroy() });
  }
}

/** Asanın kristali parlar (buz/kalkan büyüleri). */
function staffFlare(c: VfxCtx, k: VfxKit, dur: number, tint: number): Pt {
  const p = staffOf(c.actor);
  const g1 = glow(c, k, p.x, p.y, 30, tint, 0);
  const g2 = glow(c, k, p.x, p.y, 16, 0xffffff, 0);
  c.scene.tweens.add({ targets: g1, alpha: 0.9, displayWidth: 130, displayHeight: 130, duration: k.slow(dur), ease: 'Sine.easeOut' });
  c.scene.tweens.add({ targets: g2, alpha: 1, displayWidth: 40, displayHeight: 40, duration: k.slow(dur), ease: 'Sine.easeOut' });
  fade(c, k, g1, dur, 260);
  fade(c, k, g2, dur, 200);
  for (let i = 0; i < 4; i++) {
    const ray = c.scene.add.rectangle(p.x, p.y, 3, 70, tint, 0.7).setDepth(k.DEPTH + 41).setRotation((i * Math.PI) / 4).setBlendMode(k.Phaser.BlendModes.ADD).setScale(1, 0.1);
    c.scene.tweens.add({ targets: ray, scaleY: 1, alpha: 0, duration: k.slow(dur + 160), ease: 'Quad.easeOut', onComplete: () => ray.destroy() });
  }
  return p;
}

/** Hedef üstünde yükselen alev dilleri (origin altta). */
function tongues(c: VfxCtx, k: VfxKit, x: number, y: number, n: number, w: number, h: [number, number], hex = '#ff7a1a', depth = k.DEPTH + 36): void {
  for (let i = 0; i < n; i++) {
    const t = k.v2Sprite(c, 'tongue', hex, x + k.rnd(-w / 2, w / 2), y + k.rnd(-4, 6), k.rnd(h[0], h[1]), depth).setOrigin(0.5, 1);
    const sx = t.scaleX;
    const wide = k.rnd(1.1, 1.6);
    t.setScale(sx * wide, sx * 0.12).setFlipX(Math.random() < 0.5).setRotation(k.rnd(-0.15, 0.15));
    const d = k.rnd(320, 540);
    // yükselir, bir kez titreyip (alev dili kopar) incelerek söner
    c.scene.tweens.add({ targets: t, scaleY: sx * k.rnd(0.8, 1.05), duration: k.slow(d * 0.3), delay: k.slow(i * 24), ease: 'Quad.easeOut' });
    c.scene.tweens.add({ targets: t, scaleX: sx * wide * 0.8, rotation: t.rotation + k.rnd(-0.2, 0.2), duration: k.slow(d * 0.18), delay: k.slow(i * 24 + d * 0.3), yoyo: true });
    c.scene.tweens.add({ targets: t, scaleX: sx * 0.25, scaleY: sx * 0.5, y: t.y - k.rnd(24, 54), alpha: 0, delay: k.slow(i * 24 + d * 0.55), duration: k.slow(d * 0.45), ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }
}

/** Yanık izi: ayakta yassı koyu leke, yavaş söner. */
function scorch(c: VfxCtx, k: VfxKit, x: number, y: number, w: number): void {
  const s = c.scene.add.ellipse(x, y, w, w * 0.28, 0x15101c, 0.45).setDepth(k.FLOOR_FX + 1);
  const e = c.scene.add.ellipse(x, y, w * 0.8, w * 0.2, 0xff4d1a, 0.35).setDepth(k.FLOOR_FX + 2).setBlendMode(k.Phaser.BlendModes.ADD);
  fade(c, k, e, 200, 700);
  fade(c, k, s, 600, 900);
}

// =====================================================================================================================
// FIRE BOLT

/**
 * Fire Bolt: avuçtaki mavi alev kabarır, önünde küçük altın mühür halkası açılır (hedefe bakan, yandan görünen elips); alev
 * mühürden geçerek ateş okuna dönüşür (mavi-beyaz çekirdek, turuncu manto, iki kare titreyen kuyruk), hafif yayla uçar; arkasında kıvılcım,
 * ışık ve yükselen duman bırakır. Çarpınca: beyaz-turuncu ışık patlaması, gövdede yükselen alev dilleri, düşen kor, duman, yerde yanık izi.
 * İlk hasar ~0,67 sn (v1 ~0,74 sn).
 */
const fireball: V2Vfx = async (c, k) => {
  const f = face(c.actor);
  const hand = handOf(c.actor);
  c.actor.play('cast');
  c.sfx('flameIgnite');
  palmFlare(c, k, hand, 260);
  // önünde mühür: hedefe bakan, kenardan görünen halka
  sigil(c, k, hand.x + f * 46, hand.y, 96, 1, { open: 200, hold: 220, flatX: 0.32 }); // elips (yandan görünen halka)
  await k.wait(c.scene, k.slow(270));
  c.actor.play('idle');
  await Promise.all(
    c.targets.map(async (t) => {
      c.sfx('flameRoar');
      const from = { x: hand.x + f * 46, y: hand.y };
      const to = k.spot(t);
      const dir = to.x >= from.x ? 1 : -1;
      const b1 = k.v2Sprite(c, 'bolt', '#ff7a1a', from.x, from.y, 150, k.DEPTH + 32).setFlipX(dir < 0);
      const b2 = k.v2Sprite(c, 'bolt2', '#ff7a1a', from.x, from.y, 150, k.DEPTH + 32).setFlipX(dir < 0).setVisible(false);
      const halo = glow(c, k, from.x, from.y, 150, 0xff8a1f, 0.55, k.DEPTH + 31);
      const arc = Math.min(60, Math.abs(to.x - from.x) * 0.06);
      let lastTrail = -1;
      await k.counter(c.scene, k.slow(300), (u) => {
        const e = u * u * 0.4 + u * 0.6;
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * arc;
        const e2 = Math.min(1, e + 0.02);
        const nx = from.x + (to.x - from.x) * e2;
        const ny = from.y + (to.y - from.y) * e2 - Math.sin(e2 * Math.PI) * arc;
        const rot = Math.atan2(ny - y, (nx - x) * dir) * dir;
        const flick = Math.floor(u * 14) % 2 === 0;
        for (const b of [b1, b2]) b.setPosition(k.snap(x), k.snap(y)).setRotation(rot);
        b1.setVisible(flick);
        b2.setVisible(!flick);
        halo.setPosition(x, y).setAlpha(0.45 + 0.15 * Math.sin(u * 40));
        const step = Math.floor(u * 16);
        if (step !== lastTrail) {
          lastTrail = step;
          k.burst(c.scene, x - dir * 40, y, { colors: EMBER, n: 2, speed: [20, 90], gravity: 160, life: [240, 480], size: [6, 12] });
          const tr = glow(c, k, x - dir * 30, y, 70, 0xff6a1a, 0.4, k.DEPTH + 30);
          c.scene.tweens.add({ targets: tr, alpha: 0, displayWidth: 24, displayHeight: 24, duration: k.slow(220), onComplete: () => tr.destroy() });
          if (step % 3 === 0) smoke(c, k, x - dir * 60, y, { n: 1, spread: 6, size: [26, 40], rise: [30, 60], life: [500, 700], alpha: 0.35 });
        }
      });
      b1.destroy();
      b2.destroy();
      halo.destroy();
      // ÇARPMA
      c.sfx('fireBlast');
      k.flash(c.scene, '#ff8a1f', 0.12, 200);
      k.shake(c.scene, 120, 0.004);
      const core = glow(c, k, to.x, to.y, 60, 0xffffff, 1, k.DEPTH + 46);
      const body = glow(c, k, to.x, to.y, 80, 0xff8a1f, 0.9, k.DEPTH + 45);
      c.scene.tweens.add({ targets: core, displayWidth: 170, displayHeight: 170, alpha: 0, duration: k.slow(260), ease: 'Quad.easeOut', onComplete: () => core.destroy() });
      c.scene.tweens.add({ targets: body, displayWidth: 300, displayHeight: 300, alpha: 0, duration: k.slow(420), ease: 'Quad.easeOut', onComplete: () => body.destroy() });
      k.burst(c.scene, to.x, to.y, { colors: FIRE, n: 22, speed: [140, 480], gravity: 420, life: [380, 760], size: [8, 18] });
      k.burst(c.scene, to.x, to.y, { colors: EMBER, n: 10, speed: [60, 200], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: -60, life: [600, 1000], size: [4, 8] });
      void k.ring(c.scene, to.x, to.y, { r: 110, flat: 0.75, n: 22, colors: FIRE, dur: 320, size: 10 });
      tongues(c, k, to.x, t.container.y - t.h * 0.12, 6, t.w * 0.6, [50, 95]);
      const lg = glow(c, k, to.x, t.container.y - t.h * 0.35, t.w * 1.6, 0xff6a1a, 0.45, k.DEPTH + 20);
      fade(c, k, lg, 220, 520);
      smoke(c, k, to.x, to.y - 20, { n: 5, spread: 30, size: [50, 90], rise: [70, 140], life: [800, 1200], alpha: 0.45, drift: -dir * 20 });
      scorch(c, k, t.container.x, t.container.y - 4, t.w * 0.9);
    }),
  );
};

// =====================================================================================================================
// BLIZZARD

/** Blizzard'ın buz plakası: hücreleri sırayla (merkezden dışa) donan zemin; kırağı benekleri ve kristal çizgiler. */
function frostFloor(c: VfxCtx, k: VfxKit, slots: number[], center: Pt): { g: Phaser.GameObjects.Graphics; draw: (u: number) => void } {
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX);
  const cells = slots.map((s) => {
    const q = k.quadOf(c.board, s, 0.97);
    const m = k.cellMid(c.board, s);
    const specks = Array.from({ length: 16 }, () => ({ p: k.inQuad(q, 0.9), w: Math.random() < 0.3 ? 4 : 2 }));
    const veins = Array.from({ length: 3 }, () => {
      let p = k.inQuad(q, 0.55);
      const a = k.rnd(-0.4, 0.4) + (Math.random() < 0.5 ? Math.PI : 0);
      return Array.from({ length: 8 }, () => (p = { x: p.x + Math.cos(a + k.rnd(-0.7, 0.7)) * 9, y: p.y + Math.sin(a + k.rnd(-0.7, 0.7)) * 3.5 }));
    });
    return { q, m, specks, veins, d: Math.hypot(m.x - center.x, m.y - center.y) };
  });
  const span = Math.max(1, ...cells.map((x) => x.d));
  const shrink = (q: Pt[], s: number) => {
    const cx = (q[0]!.x + q[2]!.x) / 2;
    const cy = (q[0]!.y + q[2]!.y) / 2;
    return q.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
  };
  const draw = (u: number) => {
    g.clear();
    for (const cl of cells) {
      const v = Math.max(0, Math.min(1, (u - (cl.d / span) * 0.45) / 0.55));
      if (v <= 0) continue;
      const e = 1 - (1 - v) ** 2;
      g.fillStyle(0x8fd8ff, 0.38 * e).fillPoints(shrink(cl.q, 0.3 + 0.7 * e), true);
      g.fillStyle(0xe8fbff, 0.3 * e).fillPoints(shrink(cl.q, (0.3 + 0.7 * e) * 0.55), true);
      g.lineStyle(2, 0xffffff, 0.75 * e).strokePoints(shrink(cl.q, 0.3 + 0.7 * e), true);
      const nS = Math.floor(cl.specks.length * e);
      for (let i = 0; i < nS; i++) g.fillStyle(i % 3 ? 0xffffff : 0xa8ebff, 0.9).fillRect(k.snap(cl.specks[i]!.p.x), k.snap(cl.specks[i]!.p.y), cl.specks[i]!.w, 2);
      for (const vein of cl.veins) {
        const n = Math.floor(vein.length * e);
        for (let i = 0; i < n; i++) g.fillStyle(0xffffff, 0.7).fillRect(k.snap(vein[i]!.x), k.snap(vein[i]!.y), 2, 2);
      }
    }
  };
  return { g, draw };
}

/**
 * Blizzard (rect 3x2): asanın kristali buz mavisi parlar, kristalden yükselen kırağı zerreleri; alanın üstünde rüzgârla yuvarlanarak gelen koyu
 * fırtına bulutu toplanır, büyücüden uzağa esen rüzgâr çizgileri alanı süpürür, eğik kar YALNIZCA alanın hücrelerine yağar, hücreler
 * merkezden dışa doğru donar (kırağı, kristal damarlar). Sonra buz sarkıtları dalga dalga çakılır ve parçalanır (kırıklar sekip yere
 * düşer, buz sisi); ilk dalga yere değince hasar. Hedeflerin ayağında buz kabuğu sivrilir. İlk hasar ~1,15 sn (v1 ~1,4 sn).
 */
const blizzard: V2Vfx = async (c, k) => {
  c.sfx('windHowl');
  c.actor.play('cast');
  const crystalAt = staffFlare(c, k, 300, 0x8fd8ff);
  k.burst(c.scene, crystalAt.x, crystalAt.y, { colors: ICE, n: 8, speed: [30, 120], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: -120, life: [500, 800], size: [4, 8] });
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const cells = slots.map((s) => ({ s, q: k.quadOf(c.board, s, 0.92), m: k.cellMid(c.board, s) }));
  const xs = cells.flatMap((x) => x.q.map((p) => p.x));
  const ys = cells.flatMap((x) => x.q.map((p) => p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yTop = Math.min(...ys);
  const center = c.centerPos ?? { x: (x0 + x1) / 2, y: (yTop + Math.max(...ys)) / 2 };
  const cloudY = yTop - 290;
  const wind = c.board === 'enemy' ? 1 : -1; // büyücüden uzağa
  // 1) karartma + bulut (iki katman topak, rüzgârla yuvarlanarak gelir)
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x081830, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.3, duration: k.slow(360) });
  const puffs: Img[] = [];
  const span = x1 - x0 + 160;
  const nCloud = Math.max(3, Math.round(span / 190));
  for (const layer of [0, 1]) {
    for (let i = 0; i < nCloud + layer; i++) {
      const x = x0 - 80 + (span * (i + 0.5 - layer * 0.5)) / nCloud + k.rnd(-20, 20);
      const w = k.rnd(260, 340) * (layer ? 0.8 : 1);
      const p = c.scene.add.image(x - wind * 200, cloudY + (layer ? 34 : 0) + k.rnd(-10, 10), stormTex(k, c.scene)).setDisplaySize(w, w * 0.46).setAlpha(0).setDepth(k.DEPTH + 16 + layer).setFlipX(Math.random() < 0.5);
      if (layer) p.setTint(0xb0bccf);
      c.scene.tweens.add({ targets: p, x, alpha: layer ? 0.85 : 0.97, duration: k.slow(k.rnd(360, 460)), delay: k.slow(i * 24 + layer * 60), ease: 'Quad.easeOut' });
      // yavaş kabarma (bulut nefes alır)
      c.scene.tweens.add({ targets: p, scaleY: p.scaleY * 1.06, duration: k.slow(k.rnd(500, 700)), yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
      puffs.push(p);
    }
  }
  // rüzgâr çizgileri (alan boyunca)
  const gust = c.scene.time.addEvent({
    delay: 45,
    loop: true,
    callback: () => {
      const y = k.rnd(cloudY + 60, Math.max(...ys) - 10);
      const len = k.rnd(70, 150);
      const ln = c.scene.add.rectangle(wind > 0 ? x0 - 120 : x1 + 120, y, len, 2, 0xe8fbff, 0.0).setDepth(k.DEPTH + 19);
      c.scene.tweens.add({ targets: ln, x: ln.x + wind * k.rnd(380, 560), alpha: { from: 0.55, to: 0 }, duration: k.slow(k.rnd(280, 380)), ease: 'Sine.easeIn', onComplete: () => ln.destroy() });
    },
  });
  await k.wait(c.scene, k.slow(240));
  c.actor.play('idle');
  // 2) kar: hücrelere eğik yağar, salınarak
  const snow = c.scene.time.addEvent({
    delay: 22,
    loop: true,
    callback: () => {
      const cl = k.pick(cells);
      const to = k.inQuad(cl.q, 0.92);
      const size = k.rnd(14, 26);
      const fl = k.v2Sprite(c, 'flake', '#ffffff', to.x - wind * k.rnd(90, 150), cloudY + k.rnd(30, 60), size, k.DEPTH + 20).setAlpha(0.95);
      const ph = k.rnd(0, 6);
      const sx = fl.x;
      const sy = fl.y;
      void k.counter(c.scene, k.slow(k.rnd(420, 600)), (u) => {
        fl.setPosition(sx + (to.x - sx) * u + Math.sin(u * 9 + ph) * 8, sy + (to.y - 6 - sy) * u).setRotation(u * 4).setAlpha(u > 0.85 ? (1 - u) / 0.15 : 0.95);
        if (u >= 1) fl.destroy();
      });
    },
  });
  c.sfx('hailPatter');
  // 3) zemin donar
  const frost = frostFloor(c, k, slots, center);
  void k.counter(c.scene, k.slow(520), (u) => frost.draw(u), 'Quad.easeOut');
  await k.wait(c.scene, k.slow(300));
  // 4) buz sarkıtları dalga dalga çakılır
  let landed = 0;
  let firstLanded: () => void = () => undefined;
  const first = new Promise<void>((r) => (firstLanded = r));
  const jobs = cells.flatMap((cl, ci) =>
    Array.from({ length: c.targets.some((t) => t.combatant.slot === cl.s) ? 3 : 2 }, async (_, i) => {
      await k.wait(c.scene, k.slow(i * 120 + (ci % 3) * 26 + k.rnd(0, 40)));
      const to = i === 0 ? { x: cl.m.x + k.rnd(-10, 10), y: cl.m.y - k.rnd(26, 50) } : k.inQuad(cl.q, 0.75);
      const size = i === 0 ? 120 : k.rnd(70, 100);
      const ic = k.v2Sprite(c, 'icicle', '#8fd8ff', to.x - wind * 90, cloudY + 30, size, k.DEPTH + 30).setRotation(-wind * 0.28);
      await k.travel(c.scene, ic, to, 230, { ease: 'in' });
      ic.destroy();
      if (landed++ === 0) firstLanded();
      if (landed % 3 === 1) c.sfx('iceCrack');
      // parçalanma: kırıklar sekip düşer, buz sisi
      for (let j = 0; j < 6; j++) {
        const ch = k.v2Sprite(c, 'chip', '#8fd8ff', to.x, to.y, k.rnd(14, 26), k.DEPTH + 33);
        const a = k.rnd(-Math.PI * 0.95, -Math.PI * 0.05);
        const sp = k.rnd(120, 300);
        const spin = k.rnd(-8, 8);
        void k.counter(c.scene, k.slow(k.rnd(380, 560)), (u) => {
          const tt = u * 0.5;
          ch.setPosition(k.snap(to.x + Math.cos(a) * sp * tt), k.snap(to.y + Math.sin(a) * sp * tt + 0.5 * 1400 * tt * tt)).setRotation(spin * u).setAlpha(1 - u * u);
          if (u >= 1) ch.destroy();
        });
      }
      const mist = c.scene.add.image(to.x, to.y - 6, puffTex(k, c.scene)).setDisplaySize(40, 30).setTint(0xe8fbff).setAlpha(0.7).setDepth(k.DEPTH + 26);
      c.scene.tweens.add({ targets: mist, displayWidth: 130, displayHeight: 70, alpha: 0, y: mist.y - 20, duration: k.slow(520), ease: 'Quad.easeOut', onComplete: () => mist.destroy() });
      void k.ring(c.scene, cl.m.x, cl.m.y, { r: 60, flat: 0.32, n: 12, colors: ICE, dur: 320, size: 7 });
    }),
  );
  await Promise.race([first, k.wait(c.scene, k.slow(420))]);
  // vuruş anı: hedeflerin ayağında buz kabuğu sivrilir
  k.shake(c.scene, 150, 0.004);
  for (const t of c.targets) {
    const fp = k.feet(t);
    for (let i = 0; i < 6; i++) {
      const x = fp.x + (i - 2.5) * t.w * 0.13 + k.rnd(-5, 5);
      const h = k.rnd(40, 76) * (1 - Math.abs(i - 2.5) * 0.12);
      const sp = k.v2Sprite(c, 'icicle', '#8fd8ff', x, fp.y + 6, h, t.container.depth + 1).setRotation(Math.PI + k.rnd(-0.25, 0.25)).setOrigin(0.5, 0);
      const sy = sp.scaleY;
      sp.setScale(sp.scaleX, sy * 0.1);
      c.scene.tweens.add({ targets: sp, scaleY: sy, duration: k.slow(110), delay: k.slow(i * 14), ease: 'Back.easeOut' });
      fade(c, k, sp, 650, 380);
    }
  }
  // kuyruk: kar diner, bulut dağılır, buz erir
  void Promise.all(jobs).then(async () => {
    await k.wait(c.scene, k.slow(200));
    snow.remove();
    gust.remove();
    c.scene.tweens.add({ targets: puffs, alpha: 0, x: `+=${wind * 60}`, duration: k.slow(560), onComplete: () => puffs.forEach((p) => p.destroy()) });
    c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(560), onComplete: () => dim.destroy() });
    c.scene.tweens.add({ targets: frost.g, alpha: 0, delay: k.slow(450), duration: k.slow(800), onComplete: () => frost.g.destroy() });
  });
};

// =====================================================================================================================
// MANA BARRIER

/**
 * Mana Barrier (tek dost): asanın kristali parlar, kristalden dosta mavi mana akar; dostun ayağında altın mühür açılır. ARINMA: altın-beyaz bir
 * halka ayaklardan başa yükselir, geçtiği yerden kara lanet kırıkları kopup savrulur ve beyaz kıvılcımla yanar (tüm debuff'lar silinir).
 * Sonra on iki altıgen cam faset dışarıdan uçup dostun çevresinde KİLİTLENİR ve birleşip parlak kenarlı mavi kubbe olur (kalkan);
 * kubbenin içinde üç mana damlası döner (kalkan her darbeyi emdiğinde taşıyana MP verir). Kalkan rakamı kubbe kapanınca çıkar (~1,0 sn).
 */
const barrier: V2Vfx = async (c, k) => {
  c.sfx('magicHum');
  c.actor.play('cast');
  const crystalAt = staffFlare(c, k, 260, 0x6ec1ff);
  await Promise.all(
    c.targets.map(async (t) => {
      const fp = k.feet(t);
      const mid = k.spot(t);
      // kristalden dosta mana akıntısı (kendine atınca kısa)
      if (t !== c.actor) {
        for (let i = 0; i < 10; i++) {
          const d = k.v2Sprite(c, 'manadrop', '#6ec1ff', crystalAt.x, crystalAt.y, k.rnd(14, 22), k.DEPTH + 34);
          void k.wait(c.scene, k.slow(i * 22)).then(() => k.travel(c.scene, d, { x: mid.x + k.rnd(-20, 20), y: mid.y + k.rnd(-30, 30) }, 260, { ease: 'in', arc: 70 + i * 4 }).then(() => d.destroy()));
        }
      }
      sigil(c, k, fp.x, fp.y - 2, Math.max(150, t.w * 1.3), 0.3, { open: 240, hold: 700, spin: 120, depth: k.FLOOR_FX + 3 });
      await k.wait(c.scene, k.slow(200));
      c.actor.play('idle');
      // ARINMA: yalnızca bu dostun debuff'ı GERÇEKTEN silindiyse (c.usage: motor olayları; olaysız önizlemede hep oynar)
      const cleansed = !c.usage || c.usage.dispelledFrom(t.combatant.uid).length > 0;
      if (cleansed) {
        // ARINMA: yükselen halka + kopan lanet kırıkları
        c.sfx('cleanseSweep');
        const band = c.scene.add.ellipse(fp.x, fp.y, t.w * 1.05, 26).setStrokeStyle(5, 0xfff0a0, 0.95).setDepth(t.container.depth + 2).setBlendMode(k.Phaser.BlendModes.ADD);
        const bandGlow = glow(c, k, fp.x, fp.y, t.w * 1.1, 0xfff0a0, 0.35, t.container.depth + 1);
        bandGlow.setDisplaySize(t.w * 1.2, 40);
        await k.counter(c.scene, k.slow(300), (u) => {
          const y = fp.y - t.h * 1.02 * u;
          band.setPosition(fp.x, y).setScale(1 - 0.25 * u, 1);
          bandGlow.setPosition(fp.x, y);
          if (Math.random() < 0.5) k.burst(c.scene, fp.x + k.rnd(-t.w * 0.4, t.w * 0.4), y, { colors: ['#ffffff', '#fff0a0'], n: 1, speed: [20, 70], gravity: -40, life: [300, 500], size: [4, 6] });
        }, 'Sine.easeInOut');
        fade(c, k, band, 0, 160);
        fade(c, k, bandGlow, 0, 160);
        for (let i = 0; i < 5; i++) {
          const s = k.v2Sprite(c, 'hexshard', '#5a2a9c', mid.x + k.rnd(-t.w * 0.25, t.w * 0.25), mid.y + k.rnd(-t.h * 0.35, t.h * 0.3), k.rnd(18, 28), k.DEPTH + 35);
          const a = k.rnd(-Math.PI, 0);
          c.scene.tweens.add({ targets: s, x: s.x + Math.cos(a) * k.rnd(70, 130), y: s.y + Math.sin(a) * k.rnd(50, 110), rotation: k.rnd(-4, 4), duration: k.slow(360), ease: 'Quad.easeOut' });
          c.scene.tweens.add({ targets: s, alpha: 0, displayWidth: 4, displayHeight: 4, delay: k.slow(240), duration: k.slow(140), onComplete: () => { k.burst(c.scene, s.x, s.y, { colors: ['#ffffff', '#fff0a0'], n: 3, speed: [40, 120], gravity: 0, life: [200, 360], size: [4, 6] }); s.destroy(); } });
        }
      }
      // KUBBE: altıgen fasetler uçup kilitlenir
      const R = Math.max(t.w, t.h) * 0.55;
      const n = 12;
      const facets = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.2;
        const end = { x: mid.x + Math.cos(a) * R * 0.92, y: mid.y + Math.sin(a) * R };
        const st = { x: mid.x + Math.cos(a) * R * 2.4, y: mid.y + Math.sin(a) * R * 2.2 };
        const f = k.v2Sprite(c, 'facet', '#6ec1ff', st.x, st.y, 34, k.DEPTH + 27).setAlpha(0).setRotation(a);
        return { f, st, end, a };
      });
      const dome = c.scene.add.image(mid.x, mid.y, bubbleTex(k, c.scene)).setDisplaySize(R * 2.1, R * 2.15).setTint(0x6ec1ff).setAlpha(0).setDepth(k.DEPTH + 26);
      await k.counter(c.scene, k.slow(260), (u) => {
        const e = 1 - (1 - u) ** 3;
        for (const p of facets) {
          const sw = Math.sin(u * Math.PI) * 0.35;
          const x = p.st.x + (p.end.x - p.st.x) * e + Math.cos(p.a + Math.PI / 2) * sw * 40;
          const y = p.st.y + (p.end.y - p.st.y) * e + Math.sin(p.a + Math.PI / 2) * sw * 40;
          p.f.setPosition(k.snap(x), k.snap(y)).setAlpha(Math.min(1, u * 3)).setRotation(p.a + (1 - e) * 3);
        }
      });
      c.sfx('domeLock');
      // kilitlenme: kubbe belirir, fasetler içine erir, parlama yayı kubbeyi süpürür
      c.scene.tweens.add({ targets: dome, alpha: 0.95, duration: k.slow(120) });
      for (const p of facets) c.scene.tweens.add({ targets: p.f, alpha: 0, displayWidth: 46, displayHeight: 46, duration: k.slow(220), onComplete: () => p.f.destroy() });
      const flashG = glow(c, k, mid.x, mid.y, R * 2.4, 0xa8ebff, 0.6, k.DEPTH + 28);
      fade(c, k, flashG, 0, 300);
      void k.ring(c.scene, mid.x, mid.y, { r: R * 1.3, flat: 1, n: 30, colors: MANA, dur: 360, size: 7 });
      const sweep = c.scene.add.rectangle(mid.x - R, mid.y, 10, R * 2, 0xffffff, 0.55).setDepth(k.DEPTH + 29).setBlendMode(k.Phaser.BlendModes.ADD).setRotation(0.35);
      c.scene.tweens.add({ targets: sweep, x: mid.x + R, alpha: 0, duration: k.slow(300), ease: 'Sine.easeInOut', onComplete: () => sweep.destroy() });
      // içeride dönen mana damlaları (emdikçe MP)
      const orbit = Array.from({ length: 3 }, (_, i) => k.v2Sprite(c, 'manadrop', '#6ec1ff', mid.x, mid.y, 22, k.DEPTH + 30).setAlpha(0.95).setData('ph', (i / 3) * Math.PI * 2));
      void k.counter(c.scene, k.slow(900), (u) => {
        for (const d of orbit) {
          const a = (d.getData('ph') as number) + u * Math.PI * 3;
          d.setPosition(k.snap(mid.x + Math.cos(a) * R * 0.55), k.snap(mid.y + Math.sin(a) * R * 0.2 + R * 0.25)).setAlpha(u > 0.7 ? (1 - u) / 0.3 : 0.95);
        }
        if (u >= 1) orbit.forEach((d) => d.destroy());
      });
      c.scene.tweens.add({ targets: dome, alpha: 0.35, delay: k.slow(260), duration: k.slow(300) });
      fade(c, k, dome, 640, 360);
    }),
  );
};

// =====================================================================================================================
// METEOR

/**
 * Meteor (plus): büyücü asayı kaldırır, kristal kızıl parlar; gökyüzü kızarır ve hedef alanın üstünde, gökte dev bir ALTIN MÜHÜR açılır (yatık elips,
 * döner). Meteor mührün içinden doğar: önce küçük, yaklaştıkça büyür (perspektif), erimiş çatlaklı kaya iki kare kızgınlıkla titrer, arkasında
 * alev dilleri, kor ve duman kuyruğu; yerde gölgesi ve ısı halkası büyür, ıslık sesi. Çarpma: beyaz parlama, katmanlı ışık patlaması, yükselen
 * alev sütunu, toz-şok halkası, savrulan kaya parçaları, mantar duman. Ardından artının KOLLARI boyunca yerden alev dalgası koşar, kolun
 * hücresinde alev sütunu fışkırır; her hedefin hasarı alev ona değdiği an (merkez = çarpma). Hücreler kömürleşir (Burning Ground ardından gelir).
 * İlk hasar ~1,22 sn (v1 ~1,27 sn).
 */
const meteor: V2Vfx = async (c, k) => {
  const f = face(c.actor);
  c.actor.play('cast');
  const crystalAt = staffFlare(c, k, 260, 0xff6a1a);
  palmFlare(c, k, handOf(c.actor), 240, 0xff6a1a);
  void crystalAt;
  const cell = c.centerPos ?? (c.targets[0] ? k.feet(c.targets[0]) : k.feet(c.actor));
  const cx = cell.x;
  const cy = cell.y - 30;
  // gök kızarır, mühür açılır
  const dim = c.scene.add.rectangle(960, 540, 1920, 1080, 0x220608, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.36, duration: k.slow(380) });
  const skyX = cx - f * 300;
  const skyY = 215;
  c.sfx('sigilOpen');
  const sky = sigil(c, k, skyX, skyY, 300, 0.42, { open: 260, hold: 520, spin: 140, depth: k.DEPTH + 12 });
  const skyGlow = glow(c, k, skyX, skyY, 360, 0xff6a1a, 0, k.DEPTH + 11);
  skyGlow.setDisplaySize(380, 160);
  c.scene.tweens.add({ targets: skyGlow, alpha: 0.6, duration: k.slow(260) });
  fade(c, k, skyGlow, 700, 400);
  void sky;
  // gölge ve ısı halkası
  const shadow = c.scene.add.ellipse(cx, cy + 40, 30, 10, 0x000000, 0.4).setDepth(k.DEPTH - 40);
  const heat = c.scene.add.ellipse(cx, cy + 40, 30, 10, 0xff4d1a, 0).setStrokeStyle(4, 0xff8a1f, 0.7).setDepth(k.DEPTH - 39);
  c.scene.tweens.add({ targets: [shadow, heat], scaleX: 10, scaleY: 5.5, duration: k.slow(950) });
  await k.wait(c.scene, k.slow(320));
  c.actor.play('idle');
  // meteor mühürden doğar ve yaklaşarak düşer
  c.sfx('meteorWhistle');
  const end = { x: cx, y: cy - 6 };
  const ang = Math.atan2(end.y - skyY, end.x - skyX);
  const mantles = [k.v2Sprite(c, 'mantle', '#ff4d1a', skyX, skyY, 560, k.DEPTH + 30), k.v2Sprite(c, 'mantle2', '#ff4d1a', skyX, skyY, 560, k.DEPTH + 30)];
  const mBase = mantles[0]!.scaleX;
  const rocks = [k.v2Sprite(c, 'rock', '#ff4d1a', skyX, skyY, 230, k.DEPTH + 31), k.v2Sprite(c, 'rock2', '#ff4d1a', skyX, skyY, 230, k.DEPTH + 31)];
  const rBase = rocks[0]!.scaleX;
  const halo = glow(c, k, skyX, skyY, 260, 0xff6a1a, 0.8, k.DEPTH + 29);
  let lastStep = -1;
  await k.counter(c.scene, k.slow(620), (u) => {
    const e = u * u;
    const x = skyX + (end.x - skyX) * e;
    const y = skyY + (end.y - skyY) * e;
    const sc = 0.25 + 0.75 * e;
    const flick = Math.floor(u * 18) % 2 === 0;
    rocks.forEach((r, i) => r.setPosition(k.snap(x), k.snap(y)).setScale(rBase * sc).setRotation(ang - Math.PI / 4 + u * 0.8).setVisible(flick === (i === 0)));
    // manto: başı kayanın üstünde, kuyruğu geriye (manto dokusunun başı merkezden 0,25 boy önde)
    const mx = x - Math.cos(ang) * 560 * sc * 0.25;
    const my = y - Math.sin(ang) * 560 * sc * 0.25;
    mantles.forEach((m, i) => m.setPosition(k.snap(mx), k.snap(my)).setScale(mBase * sc).setRotation(ang).setVisible(flick !== (i === 0)));
    halo.setPosition(x, y).setDisplaySize(320 * sc, 320 * sc);
    const step = Math.floor(u * 30);
    if (step !== lastStep) {
      lastStep = step;
      const back = { x: x - Math.cos(ang) * 200 * sc, y: y - Math.sin(ang) * 200 * sc };
      k.burst(c.scene, back.x, back.y, { colors: EMBER, n: 3, speed: [20, 140], gravity: -40, life: [300, 600], size: [8, 18] });
      if (step % 2 === 0) smoke(c, k, x - Math.cos(ang) * 300 * sc, y - Math.sin(ang) * 300 * sc, { n: 1, spread: 14, size: [80 * sc + 30, 130 * sc + 40], rise: [10, 40], life: [700, 1000], alpha: 0.55 });
    }
  });
  rocks.forEach((r) => r.destroy());
  mantles.forEach((m) => m.destroy());
  halo.destroy();
  shadow.destroy();
  heat.destroy();
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(900), onComplete: () => dim.destroy() });
  // ÇARPMA
  c.sfx('bigBoom');
  c.sfx('fireCrackle');
  k.flash(c.scene, '#fff2c0', 0.7, 300);
  k.shake(c.scene, 400, 0.015);
  for (const [size, tint, dur] of [[620, 0xff4d1a, 640], [480, 0xff8a1f, 520], [320, 0xffd23f, 400], [200, 0xffffff, 300]] as Array<[number, number, number]>) {
    const e = glow(c, k, cx, cy, 80, tint, 1, k.DEPTH + 45);
    c.scene.tweens.add({ targets: e, displayWidth: size, displayHeight: size * 0.8, alpha: 0, duration: k.slow(dur), ease: 'Cubic.easeOut', onComplete: () => e.destroy() });
  }
  // alev sütunu
  const col = c.scene.add.image(cx, cy + 44, columnTex(k, c.scene)).setOrigin(0.5, 1).setDisplaySize(140, 20).setTint(0xff8a1f).setDepth(k.DEPTH + 40).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: col, displayHeight: 420, displayWidth: 110, duration: k.slow(220), ease: 'Quad.easeOut' });
  fade(c, k, col, 200, 420);
  tongues(c, k, cx, cy + 44, 10, 200, [120, 220], '#ff4d1a');
  // şok/toz halkası
  void k.ring(c.scene, cx, cy + 44, { r: 330, flat: 0.3, n: 56, colors: ['#98a2b4', '#d7dce6', '#ff8a1f'], dur: 640, size: 14 });
  void k.ring(c.scene, cx, cy + 44, { r: 250, flat: 0.32, n: 40, colors: ['#ffffff', '#ffd23f'], dur: 460, size: 12 });
  k.burst(c.scene, cx, cy, { colors: FIRE, n: 50, speed: [180, 720], angle: [-Math.PI, 0], gravity: 820, life: [600, 1200], size: [10, 24] });
  smoke(c, k, cx, cy - 30, { n: 10, spread: 70, size: [110, 190], rise: [160, 300], life: [1100, 1600], alpha: 0.55 });
  for (let i = 0; i < 9; i++) {
    const r = k.v2Sprite(c, 'debris', '#ff4d1a', cx, cy, k.rnd(30, 56), k.DEPTH + 46);
    const a = k.rnd(-Math.PI * 0.95, -Math.PI * 0.05);
    const sp = k.rnd(260, 640);
    const spin = k.rnd(-6, 6);
    let tick = 0;
    void k.counter(c.scene, k.slow(1000), (u) => {
      r.setPosition(k.snap(cx + Math.cos(a) * sp * u), k.snap(cy + Math.sin(a) * sp * u + 0.5 * 950 * u * u)).setRotation(spin * u).setAlpha(1 - u * u);
      if (tick++ % 4 === 0) k.burst(c.scene, r.x, r.y, { colors: EMBER, n: 1, speed: [5, 30], gravity: -30, life: [200, 360], size: [4, 8] });
      if (u >= 1) r.destroy();
    });
  }
  // artının kolları: yerden alev dalgası
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const arrive = new Map<number, { p: Promise<void>; r: () => void }>();
  for (const s of slots) {
    let r: () => void = () => undefined;
    const p = new Promise<void>((res) => (r = res));
    arrive.set(s, { p, r });
  }
  if (midSlot !== undefined) arrive.get(midSlot)?.r();
  const sc = c.scene.add.graphics().setDepth(k.FLOOR_FX - 1);
  k.fillCells(sc, c.board, slots, { fill: 0x15101c, fillA: 0.55, k: 0.96 });
  for (const s of slots) {
    const q = k.quadOf(c.board, s, 0.9);
    for (let i = 0; i < 10; i++) {
      const p = k.inQuad(q, 0.9);
      sc.fillStyle(i % 2 ? 0xff4d1a : 0xffd23f, 0.8).fillRect(k.snap(p.x), k.snap(p.y), 4, 2);
    }
  }
  sc.setAlpha(0);
  c.scene.tweens.add({ targets: sc, alpha: 1, duration: k.slow(140) });
  c.scene.tweens.add({ targets: sc, alpha: 0, duration: k.slow(1600), delay: k.slow(700), onComplete: () => sc.destroy() });
  const mid = midSlot !== undefined ? k.cellMid(c.board, midSlot) : { x: cx, y: cy + 44 };
  const arms = slots.filter((s) => s !== midSlot);
  void k.wait(c.scene, k.slow(60)).then(() => {
    for (const s of arms) {
      const to = k.cellMid(c.board, s);
      let lastK = -1;
      void k.counter(c.scene, k.slow(220), (u) => {
        const kk = Math.floor(u * 9);
        if (kk === lastK) return;
        lastK = kk;
        const x = mid.x + (to.x - mid.x) * u;
        const y = mid.y + (to.y - mid.y) * u;
        tongues(c, k, x, y + 4, 1, 16, [60, 100], '#ff4d1a', y + 2);
        k.burst(c.scene, x, y - 6, { colors: FIRE, n: 2, speed: [40, 160], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 300, life: [260, 480], size: [8, 14] });
      }, 'Quad.easeOut').then(() => {
        tongues(c, k, to.x, to.y + 6, 6, 90, [110, 170], '#ff4d1a');
        const e = glow(c, k, to.x, to.y - 40, 60, 0xff8a1f, 0.95, k.DEPTH + 44);
        c.scene.tweens.add({ targets: e, displayWidth: 220, displayHeight: 200, alpha: 0, duration: k.slow(320), onComplete: () => e.destroy() });
        k.burst(c.scene, to.x, to.y - 30, { colors: FIRE, n: 14, speed: [120, 420], angle: [-Math.PI, 0], gravity: 600, life: [380, 760], size: [10, 18] });
        void k.ring(c.scene, to.x, to.y, { r: 100, flat: 0.32, n: 20, colors: FIRE, dur: 360, size: 10 });
        arrive.get(s)?.r();
      });
    }
  });
  await k.hitsAt(c, (t) => arrive.get(t.combatant.slot)?.p ?? Promise.resolve(), k.wait(c.scene, k.slow(90)));
};

export const VFX: Record<string, V2Vfx> = { fireball, blizzard, barrier, meteor };
