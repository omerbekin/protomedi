/**
 * Paladin - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Karakter: haçlı kızıl tabar, great helm, kızıl kite kalkan, haç işlemeli savaş çekici (assets/sprites/paladin/idle.png).
 * INT ile ölçeklenen kutsal büyüleri YERİNDE yapar (yakın dövüşe koşmaz): çekicini kaldırır, çekicin başı parlar; ışık hedefe
 * gökten iner. v2'nin görsel dili Paladin'in hanedanı: uçları genişleyen krem HAÇ, altın ışık, kızıl. Süreler slow() ile skillSlowdown'a uyar.
 *
 *   holy_strike (Holy Strike)   -> 'hammerfall'  hedefin üstünde ışıktan bir çekiç belirir, Paladin'in yanından kavis çizerek iner;
 *                                                çarpmada hedefte haç damgası parlar
 *   resurrection (Resurrection) -> 'resurrect'   cesedin altında haçlı mühür açılır, yumuşak huzme iner, iki kalp atışında mühür
 *                                                nabız atar, nefes (gasp) ile dost kalkar; ardından yeşil-altın şifa artıları (Regen)
 *   judgment (Judgment)         -> 'judgment'    merkeze geniş huzme iner, zeminde haç kolları boyunca ateş hatları koşar, her
 *                                                kol hücresinde kutsal alevler fışkırır (Holy Fire zemini aynı hücrelerde kalır)
 *   radiance (Radiance)         -> 'radiance'    Paladin'in başı üstünde haçlı güneş doğar; patlar: dostların üstüne yumuşak
 *                                                şifa ışığı + yükselen yeşil artılar, düşmanlara sert beyaz-altın huzme + kıvılcım
 */
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };
const HOLY = ['#ffffff', '#fff0a0', '#ffd23f'];
const HEAL = ['#a8f08a', '#62d04b', '#fff0a0', '#ffffff'];

const facing = (v: CombatantView) => (v.combatant.side === 'party' ? 1 : -1);

/** Yumuşak ışık dokuları (bir kez üretilir). */
const beamTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2pal:beam', 32, 96, (x, y) => {
    const u = Math.abs((x + 0.5) / 32 - 0.5) * 2;
    const body = (1 - u ** 1.5) ** 1.2;
    const top = Math.min(1, (y + 1) / 40);
    return { c: u < 0.25 ? '#ffffff' : u < 0.6 ? '#fff0a0' : '#ffd23f', a: body * top };
  });
const haloTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2pal:halo', 64, 64, (x, y) => {
    const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 32) / 32);
    if (d >= 1) return null;
    return { c: d < 0.28 ? '#ffffff' : d < 0.6 ? '#fff0a0' : '#ffd23f', a: (1 - d) ** 1.15 };
  });
const glowTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2pal:glow', 48, 24, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
    if (d >= 1) return null;
    return { c: d < 0.35 ? '#ffffff' : d < 0.7 ? '#fff0a0' : '#ffd23f', a: (1 - d) ** 1.2 };
  });

/** Yukarıdan inen yumuşak huzme; Promise yere değince çözülür, huzme bir an genişleyip söner. */
async function beam(c: VfxCtx, k: VfxKit, x: number, landY: number, bw: number, fall: number, alpha = 0.95, hold = 240): Promise<void> {
  const top = -40;
  const img = c.scene.add.image(x, top, beamTex(c, k)).setOrigin(0.5, 0).setDisplaySize(bw, landY - top).setDepth(k.DEPTH + 10).setAlpha(alpha).setBlendMode(k.Phaser.BlendModes.ADD);
  img.setCrop(0, 0, 32, 1);
  await k.counter(c.scene, k.slow(fall), (u) => img.setCrop(0, 0, 32, Math.max(1, Math.round(96 * u * u))));
  img.setCrop();
  c.scene.tweens.add({ targets: img, displayWidth: bw * 1.15, duration: k.slow(140), yoyo: true });
  c.scene.tweens.add({ targets: img, alpha: 0, displayWidth: bw * 0.4, delay: k.slow(hold), duration: k.slow(480), ease: 'Quad.easeIn', onComplete: () => img.destroy() });
}

/** Zeminde yassı ışık parlaması. */
function floorGlow(c: VfxCtx, k: VfxKit, p: Pt, w: number, h: number, life = 700, depth = k.FLOOR_FX + 2): Phaser.GameObjects.Image {
  const g = c.scene.add.image(p.x, p.y, glowTex(c, k)).setDisplaySize(w, h).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: g, displayWidth: w * 1.35, displayHeight: h * 1.35, alpha: 0, duration: k.slow(life), ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  return g;
}

/** Yükselen ışık tozu. */
function motes(c: VfxCtx, k: VfxKit, p: Pt, spread: number, n: number, colors = HOLY, rise: [number, number] = [120, 300]): void {
  for (let i = 0; i < n; i++) {
    const sz = k.snap(k.rnd(4, 9));
    const r = c.scene.add.rectangle(p.x + k.rnd(-spread, spread), p.y - k.rnd(0, 30), sz, sz, k.color(k.pick(colors))).setDepth(k.DEPTH + 30);
    c.scene.tweens.add({ targets: r, y: r.y - k.rnd(rise[0], rise[1]), x: r.x + k.rnd(-20, 20), alpha: 0, delay: k.slow(k.rnd(0, 160)), duration: k.slow(k.rnd(600, 950)), onComplete: () => r.destroy() });
  }
}

/** Paladin'in çekicinin başı (sprite'ta arkada, alçakta tutulur): döküm noktası. */
const hammerHead = (a: CombatantView): Pt => ({ x: a.container.x - facing(a) * a.w * 0.32, y: a.container.y - a.h * 0.22 });

/**
 * Döküm duruşu: Paladin hafifçe dikleşir, çekicinin başında ışık toplanır (halo + içe süzülen tozlar). `ms` süre (slow öncesi).
 * Promise süre dolunca çözülür; halo verilen süre sonunda kendiliğinden söner.
 */
async function invoke(c: VfxCtx, k: VfxKit, ms: number, size = 1): Promise<void> {
  const a = c.actor;
  const p = hammerHead(a);
  const halo = c.scene.add.image(p.x, p.y, haloTex(c, k)).setDisplaySize(30, 30).setDepth(k.DEPTH + 5).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0.2);
  c.scene.tweens.add({ targets: halo, displayWidth: 120 * size, displayHeight: 120 * size, alpha: 1, duration: k.slow(ms), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: halo, alpha: 0, delay: k.slow(ms), duration: k.slow(260), onComplete: () => halo.destroy() });
  c.scene.tweens.add({ targets: a.sprite, scaleY: a.sprite.scaleY * 1.03, duration: k.slow(ms * 0.6), yoyo: true, ease: 'Sine.easeInOut' });
  for (let i = 0; i < 10; i++) {
    const q = k.rnd(0, Math.PI * 2);
    const r = k.rnd(60, 110) * size;
    const sz = k.snap(k.rnd(4, 8));
    const m = c.scene.add.rectangle(p.x + Math.cos(q) * r, p.y + Math.sin(q) * r, sz, sz, k.color(k.pick(HOLY))).setDepth(k.DEPTH + 6);
    c.scene.tweens.add({ targets: m, x: p.x, y: p.y, alpha: 0.2, delay: k.slow(k.rnd(0, ms * 0.4)), duration: k.slow(ms * 0.6), ease: 'Quad.easeIn', onComplete: () => m.destroy() });
  }
  await k.wait(c.scene, k.slow(ms));
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Holy Strike (tek düşman): Paladin çekicini kaldırır (çekiç başı parlar), hedefin Paladin tarafındaki üst boşlukta ışıktan bir savaş
 * çekici belirir ve gerçek bir çekiç gibi omuz üstünden kavis çizerek hedefe iner (arkasında altın yay izi). Çarpmada hedefin göğsünde
 * Paladin'in haçı damga gibi parlayıp küçülür, ışık halkası ve kıvılcım. İlk (tek) vuruş ~0,7 sn (x1,2 ~0,84 sn; v1 ~0,84 sn).
 */
const hammerfall: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  const a = c.actor;
  await invoke(c, k, 260, 0.8);
  const tgt = t ? k.spot(t) : (c.centerPos ?? k.spot(a));
  const th = t?.h ?? 200;
  const dir = tgt.x >= a.container.x ? 1 : -1; // savuruş Paladin'in tarafından gelir
  const L = Phaser_clamp(th * 0.95, 150, 230); // çekiç boyu (sap + baş)
  const pivot = { x: tgt.x - dir * L * 0.82, y: tgt.y - L * 0.35 };
  const size = L / (56 / 64); // sprite: sap x=3 .. baş ucu 59 (256 / mantıksal 64)
  const ham = k.v2Sprite(c, 'lighthammer', '#fff0a0', pivot.x, pivot.y, size, k.DEPTH + 30).setOrigin(3 / 64, 0.5).setAlpha(0);
  ham.setBlendMode(k.Phaser.BlendModes.SCREEN);
  const halo = c.scene.add.image(pivot.x, pivot.y, haloTex(c, k)).setDisplaySize(L * 0.9, L * 0.9).setDepth(k.DEPTH + 29).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
  const trail = c.scene.add.graphics().setDepth(k.DEPTH + 28);
  const angAt = (u: number) => -1.95 + (0.55 + 1.95) * u; // tepeden (-1,95 rad) hedefin üstüne (+0,55)
  const set = (ang: number) => {
    ham.setPosition(k.snap(pivot.x), k.snap(pivot.y)).setRotation(dir > 0 ? ang : Math.PI - ang).setFlipY(dir < 0);
    const hx = pivot.x + dir * Math.cos(ang) * L * 0.9;
    const hy = pivot.y + Math.sin(ang) * L * 0.9;
    halo.setPosition(hx, hy);
    return { x: hx, y: hy };
  };
  set(angAt(0));
  c.sfx('hammerWhoosh');
  // belirme
  c.scene.tweens.add({ targets: ham, alpha: 1, duration: k.slow(110) });
  c.scene.tweens.add({ targets: halo, alpha: 0.85, duration: k.slow(110) });
  await k.wait(c.scene, k.slow(110));
  // iniş: ivmelenen kavis + altın iz
  const pts: Pt[] = [];
  await k.counter(c.scene, k.slow(260), (u) => {
    const e = u * u;
    const h = set(angAt(e));
    pts.push(h);
    trail.clear();
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!;
      const p1 = pts[i]!;
      const al = (i / pts.length) * 0.8;
      trail.lineStyle(Math.max(4, 26 * (i / pts.length)), 0xffd23f, al * 0.6).lineBetween(p0.x, p0.y, p1.x, p1.y);
      trail.lineStyle(Math.max(2, 10 * (i / pts.length)), 0xffffff, al).lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  });
  // çarpma
  c.sfx('hammerSlam');
  k.shake(c.scene, 130, 0.004);
  k.flash(c.scene, '#fff7d0', 0.18, 220);
  const cross = k.v2Sprite(c, 'crossflare', '#fff0a0', tgt.x, tgt.y - 6, Math.round(th * 0.75), k.DEPTH + 40).setAlpha(0.9);
  k.grow(c.scene, cross, 1.5, 0.85, 160);
  c.scene.tweens.add({ targets: cross, alpha: 0, delay: k.slow(200), duration: k.slow(320), onComplete: () => cross.destroy() });
  const bloom = c.scene.add.image(tgt.x, tgt.y, haloTex(c, k)).setDisplaySize(th * 0.6, th * 0.6).setDepth(k.DEPTH + 38).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0.55);
  c.scene.tweens.add({ targets: bloom, displayWidth: th * 1.4, displayHeight: th * 1.4, alpha: 0, duration: k.slow(340), ease: 'Quad.easeOut', onComplete: () => bloom.destroy() });
  k.burst(c.scene, tgt.x, tgt.y, { colors: HOLY, n: 14, speed: [140, 420], angle: dir > 0 ? [-2.0, 0.6] : [Math.PI - 0.6, Math.PI + 2.0], gravity: 500, life: [260, 520], size: [5, 10] });
  if (t) {
    void k.ring(c.scene, t.container.x, t.container.y - 4, { r: t.w * 0.9, flat: 0.32, n: 20, colors: HOLY, dur: 380, size: 9 });
    c.scene.tweens.add({ targets: t.container, y: t.container.y + 6, duration: k.slow(50), yoyo: true });
  }
  c.scene.tweens.add({ targets: trail, alpha: 0, duration: k.slow(200), onComplete: () => trail.destroy() });
  // çekiç ışık tozuna dönüşüp söner
  c.scene.tweens.add({ targets: [ham, halo], alpha: 0, delay: k.slow(80), duration: k.slow(260), onComplete: () => { ham.destroy(); halo.destroy(); } });
  motes(c, k, { x: tgt.x - dir * 30, y: tgt.y }, 40, 8);
};

const Phaser_clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Resurrection (ölü dost): Paladin çekicini kaldırır; cesedin altında haçlı altın mühür yere yatık açılıp döner, gökten yumuşak huzme iner,
 * tüyler ve ışık tozu yükselir. Kalp atışı sesindeki iki vuruşta mühür nabız atar (halka + parlama). Nefes çekişiyle (gasp) dost
 * kalkar (Promise o an: diriliş olayı akar), ardından çevresinden yeşil-altın şifa artıları yükselir (2 tur Regen). Diriliş ~1,0 sn
 * (x1,2 ~1,2 sn; v1 ~1,0 sn); toplam ~1,9 sn.
 */
const resurrect: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  c.sfx('choirAh');
  await invoke(c, k, 260, 0.9);
  if (!t) return;
  const f = { x: t.container.x, y: t.container.y - 4 };
  const body = { x: t.container.x, y: t.container.y - t.h * 0.5 };
  // mühür
  const sig = k.v2Sprite(c, 'sigil', '#fff0a0', f.x, f.y, 300, k.FLOOR_FX + 4).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
  const base = sig.scaleX;
  sig.setScale(base * 0.4, base * 0.4 * 0.36);
  c.scene.tweens.add({ targets: sig, alpha: 1, scaleX: base, scaleY: base * 0.36, duration: k.slow(300), ease: 'Back.easeOut' });
  // huzme
  void beam(c, k, f.x, f.y, Math.max(110, t.w * 0.9), 260, 0.75, 900);
  // tüyler + toz
  for (let i = 0; i < 8; i++)
    void k.wait(c.scene, k.slow(120 + i * 70)).then(() => {
      const fe = k.v2Sprite(c, 'feather', '#fff0a0', f.x + k.rnd(-70, 70), f.y - k.rnd(140, 320), 34, k.DEPTH + 32).setRotation(k.rnd(-0.6, 0.6));
      c.scene.tweens.add({ targets: fe, y: fe.y + k.rnd(60, 120), x: fe.x + k.rnd(-40, 40), angle: fe.angle + k.rnd(-40, 40), alpha: 0, duration: k.slow(900), ease: 'Sine.easeInOut', onComplete: () => fe.destroy() });
    });
  motes(c, k, f, 60, 12);
  await k.wait(c.scene, k.slow(320));
  // iki kalp atışı (ses: 0 ve ~0,19 sn; sesler yavaşlatılmaz)
  c.sfx('heartbeat');
  const pulse = (strong: boolean) => {
    floorGlow(c, k, f, t.w * (strong ? 2 : 1.6), 60, 420);
    void k.ring(c.scene, f.x, f.y, { r: strong ? 170 : 130, flat: 0.34, n: 26, colors: HOLY, dur: 380, size: 10, startR: 40 });
    c.scene.tweens.add({ targets: sig, alpha: 1, scaleX: base * (strong ? 1.12 : 1.06), scaleY: base * 0.36 * (strong ? 1.12 : 1.06), duration: 70, yoyo: true });
  };
  pulse(false);
  await k.wait(c.scene, 190);
  pulse(true);
  await k.wait(c.scene, k.slow(240));
  // nefes + kalkış
  c.sfx('gasp');
  k.flash(c.scene, '#fff0a0', 0.22, 320);
  const bloom = c.scene.add.image(body.x, body.y, haloTex(c, k)).setDisplaySize(t.h * 0.7, t.h * 0.7).setDepth(k.DEPTH + 35).setBlendMode(k.Phaser.BlendModes.ADD);
  c.scene.tweens.add({ targets: bloom, displayWidth: t.h * 1.6, displayHeight: t.h * 1.6, alpha: 0, duration: k.slow(520), ease: 'Quad.easeOut', onComplete: () => bloom.destroy() });
  // sonrası (Promise'ten bağımsız): şifa artıları + mühür söner
  void k.wait(c.scene, k.slow(200)).then(() => {
    for (let i = 0; i < 6; i++)
      void k.wait(c.scene, k.slow(i * 90)).then(() => {
        const pl = k.v2Sprite(c, 'healplus', '#62d04b', body.x + k.rnd(-t.w * 0.45, t.w * 0.45), body.y + k.rnd(0, t.h * 0.35), 26, k.DEPTH + 40);
        c.scene.tweens.add({ targets: pl, y: pl.y - k.rnd(70, 130), alpha: 0, duration: k.slow(760), ease: 'Quad.easeOut', onComplete: () => pl.destroy() });
      });
    motes(c, k, f, 50, 10, HEAL, [80, 200]);
  });
  c.scene.tweens.add({ targets: sig, alpha: 0, delay: k.slow(300), duration: k.slow(500), onComplete: () => sig.destroy() });
};

/**
 * Judgment (artı alan, Holy Fire zemini): Paladin çekicini kaldırır; seçilen MERKEZ hücreye geniş huzme iner (yerde parlama, sarsıntı),
 * zeminde haç kolları boyunca altın ateş hatları koşar; her kol hücresinde ince bir huzme ve kutsal alev dilleri fışkırır, artının
 * birleşik plakası bir an altın yanar. Hasar zeminden gelir: Promise kollar yandıktan sonra çözülür (Holy Fire aynı hücrelerde doğar).
 */
const judgment: V2Vfx = async (c, k) => {
  await invoke(c, k, 240, 1);
  c.sfx('hammerWhoosh');
  const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
  const midSlot = c.center !== undefined && slots.includes(c.center) ? c.center : slots[0];
  const center = midSlot !== undefined ? k.cellMid(c.board, midSlot) : (c.centerPos ?? k.feet(c.actor));
  // hücre ölçüsü: komşu sıranın merkezi
  const q0 = k.quadOf(c.board, midSlot ?? 0);
  const cellW = Math.abs(q0[1]!.x - q0[0]!.x) + Math.abs(q0[3]!.x - q0[0]!.x);
  const flames = (p: Pt, n: number, big: boolean) => {
    for (let i = 0; i < n; i++) {
      const fl = k.v2Sprite(c, 'holyflame', '#ffd23f', p.x + k.rnd(-cellW * 0.3, cellW * 0.3), p.y + k.rnd(-8, 10), k.snap(k.rnd(big ? 60 : 44, big ? 96 : 70)), k.DEPTH - 5).setOrigin(0.5, 1).setAlpha(0.95);
      const s = fl.scaleX;
      fl.setScale(s * 0.6, s * 0.1);
      c.scene.tweens.add({ targets: fl, scaleY: s * k.rnd(0.9, 1.2), scaleX: s, duration: k.slow(k.rnd(120, 200)), delay: k.slow(i * 30), ease: 'Back.easeOut' });
      c.scene.tweens.add({ targets: fl, scaleY: s * 0.2, alpha: 0, y: fl.y - 20, delay: k.slow(380 + i * 40), duration: k.slow(360), onComplete: () => fl.destroy() });
    }
  };
  // 1) merkez huzme
  await beam(c, k, center.x, center.y, cellW * 0.62, 300, 0.82, 280);
  c.sfx('hammerSlam');
  k.flash(c.scene, '#fff7d0', 0.32, 300);
  k.shake(c.scene, 220, 0.007);
  floorGlow(c, k, center, cellW * 1.15, cellW * 0.42, 760);
  void k.ring(c.scene, center.x, center.y, { r: cellW * 0.6, flat: 0.32, n: 30, colors: HOLY, dur: 460, size: 12 });
  k.burst(c.scene, center.x, center.y - 10, { colors: HOLY, n: 18, speed: [80, 320], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 420, life: [420, 760], size: [6, 11] });
  flames(center, 5, true);
  // 2) artı plakası (haç) bir an altın
  const plate = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1).setAlpha(0);
  k.fillCells(plate, c.board, slots, { fill: 0xffd23f, fillA: 0.3, edge: 0xfff0a0, edgeA: 0.95, edgeW: 4, k: 0.98 });
  c.scene.tweens.add({ targets: plate, alpha: 1, duration: k.slow(140) });
  c.scene.tweens.add({ targets: plate, alpha: 0, delay: k.slow(560), duration: k.slow(520), onComplete: () => plate.destroy() });
  // 3) kollar: zeminde ateş hattı koşar, varınca ince huzme + alevler
  const arms = slots.filter((s) => s !== midSlot);
  const lines = c.scene.add.graphics().setDepth(k.FLOOR_FX + 3);
  c.sfx('fireCrackle');
  await Promise.all(
    arms.map(async (s) => {
      const to = k.cellMid(c.board, s);
      await k.counter(
        c.scene,
        k.slow(160),
        (u) => {
          const n = Math.max(1, Math.floor((Math.hypot(to.x - center.x, to.y - center.y) * u) / 6));
          for (let i = 0; i <= n; i++) {
            const v = (i / n) * u;
            const x = k.snap(center.x + (to.x - center.x) * v);
            const y = k.snap(center.y + (to.y - center.y) * v);
            lines.fillStyle(0xff8a1f, 0.35).fillRect(x - 8, y - 4, 16, 8);
            lines.fillStyle(i % 3 ? 0xffd23f : 0xffffff, 0.95).fillRect(x - 3, y - 3, 6, 6);
          }
        },
        'Quad.easeOut',
      );
      void beam(c, k, to.x, to.y, cellW * 0.34, 120, 0.85, 160);
      floorGlow(c, k, to, cellW * 0.95, cellW * 0.36, 620);
      flames(to, 3, false);
      k.burst(c.scene, to.x, to.y - 10, { colors: ['#ffffff', '#ffd23f', '#ff8a1f'], n: 10, speed: [60, 240], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 380, life: [380, 640], size: [5, 9] });
    }),
  );
  if (arms.length) c.sfx('holyIgnite');
  c.scene.tweens.add({ targets: lines, alpha: 0, duration: k.slow(420), onComplete: () => lines.destroy() });
  await k.wait(c.scene, k.slow(80));
};

/**
 * Radiance (herkes: dostlara şifa, düşmanlara kutsal hasar): Paladin çekicini göğe kaldırır; başının üstünde haçlı güneş doğar,
 * ışınları dönerek büyür (ışık kabarması). Güneş patlar (koro): tüm sahaya yayılan ışık halkası ve AYNI ANDA her karaktere ışık iner:
 * dostlara yumuşak, yarı saydam şifa ışığı + yükselen yeşil artılar; düşmanlara sert, dar beyaz-altın huzme + kıvılcım ve yanık
 * közleri. Tüm rakamlar huzmeler indiği an (~0,72 sn; x1,2 ~0,86 sn).
 */
const radiance: V2Vfx = async (c, k) => {
  const a = c.actor;
  const side = a.combatant.side;
  c.sfx('lightSwell');
  const sunP = { x: a.container.x, y: a.container.y - a.h - 70 };
  const halo = c.scene.add.image(sunP.x, sunP.y, haloTex(c, k)).setDisplaySize(20, 20).setDepth(k.DEPTH + 20).setBlendMode(k.Phaser.BlendModes.ADD);
  const raysImg = k.v2Sprite(c, 'sunrays', '#fff0a0', sunP.x, sunP.y, 220, k.DEPTH + 21).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
  const rBase = raysImg.scaleX;
  raysImg.setScale(rBase * 0.2);
  const crossI = k.v2Sprite(c, 'crossflare', '#fff0a0', sunP.x, sunP.y, 70, k.DEPTH + 22).setAlpha(0);
  // çekiç başından güneşe ışık sütunu (kaldırılmış çekiç)
  const head = hammerHead(a);
  const rod = c.scene.add.graphics().setDepth(k.DEPTH + 19);
  c.scene.tweens.add({ targets: a.sprite, scaleY: a.sprite.scaleY * 1.04, duration: k.slow(260), yoyo: true, hold: k.slow(260) });
  await k.counter(c.scene, k.slow(520), (u) => {
    halo.setDisplaySize(30 + 190 * u, 30 + 190 * u).setAlpha(0.4 + 0.6 * u);
    raysImg.setScale(rBase * (0.2 + 0.85 * u)).setAlpha(u).setRotation(u * 1.2);
    crossI.setAlpha(Math.max(0, u * 1.4 - 0.4));
    rod.clear();
    rod.lineStyle(10, 0xffd23f, 0.35 * u).lineBetween(head.x, head.y, sunP.x, sunP.y);
    rod.lineStyle(4, 0xffffff, 0.6 * u).lineBetween(head.x, head.y, sunP.x, sunP.y);
  }, 'Quad.easeIn');
  // patlama
  c.sfx('choirAh');
  c.sfx('radianceBurst');
  k.flash(c.scene, '#fff7d0', 0.26, 380);
  k.shake(c.scene, 160, 0.003);
  rod.destroy();
  c.scene.tweens.add({ targets: [halo], displayWidth: 900, displayHeight: 900, alpha: 0, duration: k.slow(520), ease: 'Quad.easeOut', onComplete: () => halo.destroy() });
  c.scene.tweens.add({ targets: raysImg, scaleX: rBase * 2.4, scaleY: rBase * 2.4, alpha: 0, rotation: 2, duration: k.slow(520), ease: 'Quad.easeOut', onComplete: () => raysImg.destroy() });
  c.scene.tweens.add({ targets: crossI, alpha: 0, scaleX: crossI.scaleX * 2, scaleY: crossI.scaleY * 2, duration: k.slow(360), onComplete: () => crossI.destroy() });
  void k.ring(c.scene, a.container.x, a.container.y - 6, { r: 1500, flat: 0.3, n: 60, colors: HOLY, dur: 520, size: 12, startR: 60 });
  // herkese ışık: aynı anda iner
  const allies = c.targets.filter((t) => t.combatant.side === side);
  const foes = c.targets.filter((t) => t.combatant.side !== side);
  const lands: Array<Promise<void>> = [];
  for (const t of allies) {
    const f = { x: t.container.x, y: t.container.y - 4 };
    lands.push(
      beam(c, k, f.x, f.y, Math.max(64, t.w * 0.55), 170, 0.32, 260).then(() => {
        floorGlow(c, k, f, t.w * 1.4, 44, 620);
        for (let i = 0; i < 3; i++) {
          const pl = k.v2Sprite(c, 'healplus', '#62d04b', f.x + k.rnd(-t.w * 0.4, t.w * 0.4), f.y - k.rnd(t.h * 0.2, t.h * 0.7), 22, k.DEPTH + 40);
          c.scene.tweens.add({ targets: pl, y: pl.y - k.rnd(60, 110), alpha: 0, delay: k.slow(i * 80), duration: k.slow(700), ease: 'Quad.easeOut', onComplete: () => pl.destroy() });
        }
        motes(c, k, f, t.w * 0.4, 5, HEAL, [60, 160]);
      }),
    );
  }
  for (const t of foes) {
    const f = { x: t.container.x, y: t.container.y - 4 };
    lands.push(
      beam(c, k, f.x, f.y, Math.max(40, t.w * 0.34), 170, 0.85, 160).then(() => {
        const p = k.spot(t);
        k.burst(c.scene, p.x, p.y, { colors: ['#ffffff', '#fff0a0', '#ffd23f'], n: 9, speed: [140, 380], gravity: 600, life: [220, 440], size: [5, 9] });
        k.burst(c.scene, f.x, f.y - 10, { colors: ['#ff8a1f', '#ffd23f', '#5b6579'], n: 6, speed: [40, 140], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: -60, life: [500, 800], size: [4, 7] });
        const cr = k.v2Sprite(c, 'crossflare', '#fff0a0', p.x, p.y, Math.round(t.h * 0.5), k.DEPTH + 40).setBlendMode(k.Phaser.BlendModes.ADD);
        c.scene.tweens.add({ targets: cr, alpha: 0, scaleX: cr.scaleX * 0.6, scaleY: cr.scaleY * 0.6, duration: k.slow(360), onComplete: () => cr.destroy() });
      }),
    );
  }
  if (lands.length) await Promise.race(lands);
};

export const VFX: Record<string, V2Vfx> = { hammerfall, resurrect, judgment, radiance };
