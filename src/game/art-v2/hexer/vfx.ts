/**
 * Hexer - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md, brief docs/design/classes/hexer.md bölüm 9.3.
 *
 * Ortak dil (karakter: kapüşonsuz cadı; sprite'ta ekranın arka tarafında kemik pullu kıvrık asa, ön elinde kara mumlu demir kandil):
 * Hexer YERİNDE kalır. Büyü ışın değil NESNE ve İŞARET: asadaki kemik pullar tıkırdar, nazar gözü açılır, kandil eğilir ve çürük damlar,
 * kırmızı iplik düğümlenir, kemik mühür çatlar. Renkler: lanet ışığı #b04fa8, erik #6a2f5f, çürük yeşili #9cab3c, kemik #e9dfc4,
 * kandil kehribarı #d9a441. Kafatası/hayvan yok.
 *
 * Skill -> VFX anahtarı (v1'den ödünç adlar; Evil Eye ile Doom Mark aynı 'voidstrike' adını paylaştığı için efekt skill id'sine göre ayrılır):
 *   evil_eye (Evil Eye)              -> 'voidstrike' (evil_eye dalı)   ~1,2 sn, vuruş ~0,67 sn
 *   withering_curse (Withering Curse)-> 'wail'                         ~1,7 sn, aşama 1 ~0,85 sn
 *   jinx (Jinx)                      -> 'bonethrow'                    ~1,3 sn, vuruş ~0,8 sn
 *   doom_mark (Doom Mark)            -> 'voidstrike' (doom_mark dalı)  ~1,8 sn, vuruş ~0,9 sn
 *
 * MOTOR OLAYLARI (BattleScene henüz göstermiyor; ui-dev bağlayacak). Aynı VfxCtx biçimiyle çağrılır:
 *   'doomburst'    : otomatik Doom (omen 3'e ulaşınca ya da süre bitince). c.targets = Doom yiyen(ler); c.actor = Hexer (yoksa hedef).
 *                    Promise ışık sütunu indiğinde çözülür (DOOM hasar rakamı o an).
 *   'omentransfer' : Ill Omen geçişi. c.actor = ölen birim (kaynak), c.targets = alıcı(lar). Promise pul alıcıya oturunca çözülür.
 *   'withertick'   : Wither tiki (taşıyanın tur başı). c.targets = taşıyan(lar). Ayak dibinde 0,4 sn yeşil-gri buhar.
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: tam ekran karartma görünen alanın tamamını kaplar
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

const CURSE = '#b04fa8';
const PLUM = '#6a2f5f';
const ROT = '#9cab3c';
const BONE = '#e9dfc4';
const THREAD = '#c0203a';
const CURSE_FX = ['#b04fa8', '#e3b8de', '#6a2f5f', '#ffffff'];
const ROT_FX = ['#9cab3c', '#6f7a2a', '#c9d27a', '#4d5520'];

function facing(c: VfxCtx): number {
  const to = c.targets[0]?.container.x ?? c.centerPos?.x ?? c.cells[0]?.x;
  if (to !== undefined && to !== c.actor.container.x) return to > c.actor.container.x ? 1 : -1;
  return c.actor.combatant.side === 'party' ? 1 : -1;
}
/** idle.png (kapüşonsuz): asa ucu arkada-yukarıda, pullar asanın üst kısmında, kandil önde bel hizasında. */
const staffTip = (c: VfxCtx, d: number): Pt => ({ x: c.actor.container.x - d * c.actor.w * 0.24, y: c.actor.container.y - c.actor.h * 0.86 });
const charmsAt = (c: VfxCtx, d: number): Pt => ({ x: c.actor.container.x - d * c.actor.w * 0.2, y: c.actor.container.y - c.actor.h * 0.7 });
const lantern = (c: VfxCtx, d: number): Pt => ({ x: c.actor.container.x + d * c.actor.w * 0.27, y: c.actor.container.y - c.actor.h * 0.46 });
const chest = (t: CombatantView): Pt => ({ x: t.container.x, y: t.container.y - t.h * 0.55 });
const headTop = (t: CombatantView): Pt => ({ x: t.container.x, y: t.container.y - t.h - 18 });
const feetOf = (v: CombatantView): Pt => ({ x: v.container.x, y: v.container.y - 4 });

/** Yumuşak eflatun hale (ADD). */
const glowTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2hexer:glow', 48, 48, (x, y) => {
    const r = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    if (r >= 1) return null;
    return { c: r < 0.3 ? '#f4d8ef' : r < 0.6 ? CURSE : PLUM, a: (1 - r) ** 1.3 };
  });
/** Kara ışık sütunu: ortası neredeyse siyah erik, kenarları eflatun; üstte erir (Radiance sütununun karanlık eşi). */
const doomBeamTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2hexer:doombeam', 32, 96, (x, y) => {
    const u = Math.abs((x + 0.5) / 32 - 0.5) * 2;
    const body = (1 - u ** 1.7) ** 1.1;
    const top = Math.min(1, (y + 1) / 40);
    return { c: u < 0.25 ? '#1c0a1a' : u < 0.55 ? '#3d1638' : u < 0.8 ? PLUM : CURSE, a: body * top * 0.95 };
  });
/** Yumuşak buhar topağı (Wither). */
const vaporTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2hexer:vapor', 32, 32, (x, y) => {
    const r = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 16) / 16);
    if (r >= 1) return null;
    return { c: r < 0.5 ? '#aeb68a' : '#6f7656', a: (1 - r) ** 1.6 * 0.8 };
  });

function glow(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, ms: number, depth = k.DEPTH + 15): Img {
  const g = c.scene.add.image(x, y, glowTex(c, k)).setDisplaySize(size, size).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
  c.scene.tweens.add({ targets: g, alpha: 0.9, duration: k.slow(ms * 0.3), yoyo: true, hold: k.slow(ms * 0.4), onComplete: () => g.destroy() });
  return g;
}

/** Yeşil-gri buhar: ayaklardan yükselen yumuşak topaklar. */
function vapor(c: VfxCtx, k: VfxKit, v: CombatantView, n = 5, ms = 700): void {
  const f = feetOf(v);
  for (let i = 0; i < n; i++) {
    const p = c.scene.add.image(f.x + k.rnd(-v.w * 0.3, v.w * 0.3), f.y - k.rnd(0, 20), vaporTex(c, k)).setDisplaySize(36, 36).setDepth(v.container.depth + 1).setAlpha(0);
    c.scene.tweens.add({ targets: p, alpha: 0.75, duration: k.slow(140), delay: k.slow(i * 70) });
    c.scene.tweens.add({ targets: p, y: p.y - k.rnd(60, v.h * 0.7), displayWidth: 70, displayHeight: 70, alpha: 0, duration: k.slow(ms), delay: k.slow(i * 70 + 140), ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

/** Asadaki pullar sallanır (sprite'ın pullarının üstüne üç küçük kemik pul). */
function rattleCharms(c: VfxCtx, k: VfxKit, d: number, ms: number): void {
  const at = charmsAt(c, d);
  for (let i = 0; i < 3; i++) {
    const s = k.v2Sprite(c, 'charm', CURSE, at.x + (i - 1) * 9, at.y + i * 10, 16, c.actor.container.depth + 1).setOrigin(0.5, 0.1);
    c.scene.tweens.add({ targets: s, rotation: 0.6 * (i % 2 ? 1 : -1), duration: k.slow(60), yoyo: true, repeat: Math.round(ms / 120), onComplete: () => s.destroy() });
  }
}

/** Omen pulu hedefin başının üstüne "pıt" diye oturur, kısa durur ve söner. */
function seatOmen(c: VfxCtx, k: VfxKit, t: CombatantView, delay = 0): void {
  void k.wait(c.scene, k.slow(delay)).then(() => {
    const h = headTop(t);
    const s = k.v2Sprite(c, 'charm', CURSE, h.x, h.y - 60, 26, k.DEPTH + 60).setAlpha(0);
    c.scene.tweens.add({ targets: s, alpha: 1, y: h.y, duration: k.slow(180), ease: 'Bounce.easeOut' });
    void k.wait(c.scene, k.slow(170)).then(() => {
      c.sfx('omenSet');
      k.burst(c.scene, h.x, h.y, { colors: CURSE_FX, n: 4, speed: [30, 90], gravity: 0, life: [180, 300], size: [4, 7] });
    });
    c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(700), duration: k.slow(300), onComplete: () => s.destroy() });
  });
}

/** Doom Mark / Doom: zemine yatık mühür (seal sprite, dikey ölçek 0,34). */
function groundSeal(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, name = 'seal', hex = CURSE): Img {
  const s = k.v2Sprite(c, name, hex, x, y, size, k.FLOOR_FX + 4);
  s.setScale(s.scaleX, s.scaleY * 0.34);
  return s;
}

/** Kara sütun: yukarıdan iner (Promise yere değince), titrer ve söner. */
async function doomBeam(c: VfxCtx, k: VfxKit, x: number, groundY: number, w: number, fall: number, hold = 380): Promise<void> {
  const top = -40;
  const b = c.scene.add.image(x, top, doomBeamTex(c, k)).setOrigin(0.5, 0).setDisplaySize(w, groundY - top).setDepth(k.DEPTH + 12);
  b.setCrop(0, 0, 32, 1);
  await k.counter(c.scene, k.slow(fall), (u) => b.setCrop(0, 0, 32, Math.max(1, Math.round(96 * u * u))));
  b.setCrop();
  c.scene.tweens.add({ targets: b, displayWidth: w * 1.15, duration: k.slow(120), yoyo: true, repeat: 1 });
  c.scene.tweens.add({ targets: b, alpha: 0, delay: k.slow(hold), duration: k.slow(420), ease: 'Quad.easeIn', onComplete: () => b.destroy() });
  for (let i = 0; i < 6; i++) {
    const m = c.scene.add.rectangle(x + k.rnd(-w * 0.35, w * 0.35), groundY - k.rnd(0, 40), 4, 4, k.color(i % 2 ? CURSE : '#1c0a1a')).setDepth(k.DEPTH + 30);
    c.scene.tweens.add({ targets: m, y: m.y - k.rnd(140, 300), alpha: 0, duration: k.slow(k.rnd(500, 800)), onComplete: () => m.destroy() });
  }
}

/** Pul patlaması: çatlamış pul bir an görünür, kemik kıymıkları + yeşil toz. */
function burstCharm(c: VfxCtx, k: VfxKit, x: number, y: number): void {
  const s = k.v2Sprite(c, 'charmcracked', CURSE, x, y, 24, k.DEPTH + 50);
  c.scene.tweens.add({ targets: s, alpha: 0, scale: s.scale * 1.4, duration: k.slow(200), onComplete: () => s.destroy() });
  for (let i = 0; i < 3; i++) {
    const sh = k.v2Sprite(c, 'boneshard', BONE, x, y, 14, k.DEPTH + 51).setRotation(k.rnd(0, 6));
    c.scene.tweens.add({ targets: sh, x: x + k.rnd(-60, 60), y: y + k.rnd(-50, 40), rotation: sh.rotation + k.rnd(-4, 4), alpha: 0, duration: k.slow(420), onComplete: () => sh.destroy() });
  }
  k.burst(c.scene, x, y, { colors: ROT_FX, n: 5, speed: [40, 140], gravity: 120, life: [260, 460], size: [4, 7] });
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Evil Eye: pullar tıkırdar ve fısıltı başlar; asanın ucunda kirpiksiz bir insan gözü eflatun halede açılır (0-0,3 sn). Bakış hattı:
 * yerde sürünen sönük duman çizgisi + havada kesik kesik parıltılar hedefe uzanır (0,3-0,56). Hedefin göğsünde aynı göz belirir (vuruş)
 * ve kapanır; çürük yeşili küçük halka. Ardından başının üstüne bir Omen pulu "pıt" diye oturur.
 */
const evilEye: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  c.actor.play('cast');
  c.sfx('hexWhisper');
  c.sfx('boneCharmRattle');
  rattleCharms(c, k, d, 360);
  const tip = staffTip(c, d);
  glow(c, k, tip.x, tip.y, 90, 620);
  const eye = k.v2Sprite(c, 'eye_closed', CURSE, tip.x, tip.y, 46, k.DEPTH + 30);
  for (const [ms, f] of [[90, 'eye_half'], [170, 'eye_open']] as Array<[number, string]>) {
    void k.wait(c.scene, k.slow(ms)).then(() => {
      if (!eye.active) return;
      const n = k.v2Sprite(c, f, CURSE, -999, -999, 46);
      eye.setTexture(n.texture.key);
      n.destroy();
    });
  }
  await k.wait(c.scene, k.slow(290));
  // bakış hattı
  const p = chest(t);
  const fa = feetOf(c.actor);
  const ft = feetOf(t);
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 3);
  await k.counter(c.scene, k.slow(260), (u) => {
    g.clear();
    const n = 34;
    for (let i = 0; i <= n * u; i++) {
      const v = i / n;
      const x = fa.x + (ft.x - fa.x) * v;
      const y = fa.y + (ft.y - fa.y) * v + Math.sin(v * 20 + u * 6) * 3;
      g.fillStyle(0x3d1638, 0.5 * (1 - v * 0.4)).fillRect(Math.round(x) - 4, Math.round(y) - 2, 8, 4);
    }
    // havada kesik parıltılar
    for (let j = 0; j < 2; j++) {
      const v = Math.random() * u;
      const x = tip.x + (p.x - tip.x) * v;
      const y = tip.y + (p.y - tip.y) * v;
      const r = c.scene.add.rectangle(x, y, 5, 5, k.color(Math.random() < 0.5 ? CURSE : '#f4d8ef')).setDepth(k.DEPTH + 25);
      c.scene.tweens.add({ targets: r, alpha: 0, duration: k.slow(140), onComplete: () => r.destroy() });
    }
  });
  c.scene.tweens.add({ targets: [g, eye], alpha: 0, duration: k.slow(300), onComplete: () => { g.destroy(); eye.destroy(); } });
  // hedefin göğsünde göz açılıp kapanır (vuruş)
  const e2 = k.v2Sprite(c, 'eye_open', CURSE, p.x, p.y, 44, t.container.depth + 2);
  glow(c, k, p.x, p.y, 120, 420);
  for (const [ms, f] of [[110, 'eye_half'], [170, 'eye_closed']] as Array<[number, string]>) {
    void k.wait(c.scene, k.slow(ms)).then(() => {
      if (!e2.active) return;
      const n = k.v2Sprite(c, f, CURSE, -999, -999, 44);
      e2.setTexture(n.texture.key);
      n.destroy();
    });
  }
  c.scene.tweens.add({ targets: e2, alpha: 0, delay: k.slow(230), duration: k.slow(140), onComplete: () => e2.destroy() });
  k.burst(c.scene, p.x, p.y, { colors: CURSE_FX, n: 10, speed: [80, 240], gravity: 200, life: [240, 420], size: [5, 9] });
  void k.ring(c.scene, ft.x, ft.y, { r: t.w * 0.55, flat: 0.32, n: 18, colors: ROT_FX, dur: 380, size: 7 });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 6, duration: k.slow(50), yoyo: true });
  seatOmen(c, k, t, 160);
  c.actor.play('idle');
};

/**
 * Doom Mark: ekran kararır, ters nefes (doomBreath); Hexer asasını yere vurur, ayağının dibinde kemik beyazı yedi köşeli mühür parlar,
 * kandil alevi kararır. Hedefin altında aynı mühür belirir, başındaki Omen pulları mühre çekilir. Mühür ortadan çatlar (kıymıklar):
 * kara-mor ışık sütunu iner (vuruş + Doom). Sütunun içinde pullar tek tek patlar, kısa sarsıntı; karanlık çekilir, çatlak mühür izi solar.
 */
const doomMark: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  c.actor.play('cast');
  c.sfx('doomBreath');
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x0c0410, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.3, duration: k.slow(420) });
  // asa vuruşu + ayak mührü + kandil kararır
  const fa = feetOf(c.actor);
  c.scene.tweens.add({ targets: c.actor.container, y: c.actor.container.y + 6, duration: k.slow(70), yoyo: true, delay: k.slow(120) });
  void k.wait(c.scene, k.slow(170)).then(() => {
    c.sfx('staffKnock');
    k.burst(c.scene, fa.x - d * c.actor.w * 0.24, fa.y, { colors: ['#98a2b4', '#5b6579'], n: 5, speed: [40, 140], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 400, life: [240, 420], size: [6, 9] });
  });
  const s0 = groundSeal(c, k, fa.x, fa.y, 150);
  s0.setAlpha(0);
  c.scene.tweens.add({ targets: s0, alpha: 0.95, duration: k.slow(200), delay: k.slow(170) });
  c.scene.tweens.add({ targets: s0, alpha: 0, delay: k.slow(900), duration: k.slow(400), onComplete: () => s0.destroy() });
  const lan = lantern(c, d);
  const smoke = c.scene.add.circle(lan.x, lan.y, 12, 0x15101c, 0.0).setDepth(c.actor.container.depth + 2);
  c.scene.tweens.add({ targets: smoke, alpha: 0.75, radius: 20, duration: k.slow(240), yoyo: true, hold: k.slow(300), onComplete: () => smoke.destroy() });
  await k.wait(c.scene, k.slow(380));
  // hedefin mührü + pulların çekilmesi
  const ft = feetOf(t);
  const s1 = groundSeal(c, k, ft.x, ft.y, 190);
  const base = s1.scaleX;
  s1.setAlpha(0).setScale(base * 0.6, base * 0.6 * 0.34);
  c.scene.tweens.add({ targets: s1, alpha: 1, scaleX: base, scaleY: base * 0.34, duration: k.slow(240), ease: 'Back.easeOut' });
  const stacks = Math.max(1, Math.min(3, t.combatant.statuses.find((s) => s.kind === 'omen')?.stacks ?? 1));
  const h = headTop(t);
  const pips = Array.from({ length: stacks }, (_, i) => k.v2Sprite(c, 'charm', CURSE, h.x + (i - (stacks - 1) / 2) * 26, h.y, 22, k.DEPTH + 55));
  await k.counter(c.scene, k.slow(320), (u) => {
    const e = u * u;
    pips.forEach((pp, i) => pp.setPosition(h.x + (i - (stacks - 1) / 2) * 26 * (1 - e), h.y + (ft.y - 30 - h.y) * e).setRotation(u * 4));
  });
  // çatlama + sütun
  const cracked = groundSeal(c, k, ft.x, ft.y, 190, 'sealcracked', CURSE);
  s1.destroy();
  c.sfx('ceramicCrack');
  for (let i = 0; i < 7; i++) {
    const sh = k.v2Sprite(c, 'boneshard', BONE, ft.x + k.rnd(-50, 50), ft.y - 6, 16, k.DEPTH + 50).setRotation(k.rnd(0, 6));
    const vx = k.rnd(-260, 260);
    const vy = k.rnd(-420, -200);
    void k.counter(c.scene, k.slow(560), (u) => {
      const tt = u * 0.56;
      sh.setPosition(ft.x + vx * tt, ft.y - 6 + vy * tt + 0.5 * 1500 * tt * tt).setAlpha(1 - u * u);
      if (u >= 1) sh.destroy();
    });
  }
  await doomBeam(c, k, t.container.x, ft.y + 4, Math.max(90, t.w * 0.95), 120, 520);
  c.sfx('doomThud');
  k.shake(c.scene, 220, 0.008);
  k.flash(c.scene, '#3d1638', 0.3, 260);
  c.scene.tweens.add({ targets: t.container, y: t.container.y + 6, duration: k.slow(60), yoyo: true });
  pips.forEach((pp, i) => {
    void k.wait(c.scene, k.slow(80 + i * 120)).then(() => {
      burstCharm(c, k, pp.x, pp.y - i * 30);
      if (i) c.sfx('ceramicCrack');
      pp.destroy();
    });
  });
  k.burst(c.scene, t.container.x, ft.y - 10, { colors: [...CURSE_FX, '#1c0a1a'], n: 18, speed: [120, 380], angle: [-Math.PI, 0], gravity: 500, life: [400, 700], size: [6, 10] });
  c.scene.tweens.add({ targets: cracked, alpha: 0, delay: k.slow(700), duration: k.slow(500), onComplete: () => cracked.destroy() });
  c.scene.tweens.add({ targets: dim, alpha: 0, delay: k.slow(300), duration: k.slow(500), onComplete: () => dim.destroy() });
  c.actor.play('idle');
};

/** 'voidstrike' adı Evil Eye ve Doom Mark'ta ortak (v1 yer tutucu): skill'e göre ayrılır. */
const voidstrike: V2Vfx = (c, k) => (c.skill.id === 'doom_mark' ? doomMark(c, k) : evilEye(c, k));

/** Bir hücre içinde dallanan çürük damarları (graphics), girişten (from) içeri. */
function veinsIn(c: VfxCtx, k: VfxKit, g: Phaser.GameObjects.Graphics, q: Pt[], from: Pt, ms: number): Promise<void> {
  const mid = { x: (q[0]!.x + q[2]!.x) / 2, y: (q[0]!.y + q[2]!.y) / 2 };
  const branches = Array.from({ length: 4 }, () => {
    const to = k.inQuad(q as Array<{ x: number; y: number }>, 0.95);
    const pts: Pt[] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const base = { x: from.x + (mid.x - from.x) * Math.min(1, u * 2), y: from.y + (mid.y - from.y) * Math.min(1, u * 2) };
      const v = Math.max(0, u * 2 - 1);
      pts.push({ x: base.x + (to.x - mid.x) * v + k.rnd(-5, 5), y: base.y + (to.y - mid.y) * v + k.rnd(-2, 2) });
    }
    return pts;
  });
  return k.counter(c.scene, k.slow(ms), (u) => {
    for (const pts of branches) {
      const m = Math.floor(u * (pts.length - 1));
      for (let i = 0; i < m; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        g.lineStyle(5, 0x3a4020, 0.9).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(2, 0xc9d27a, 0.95).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  });
}

/**
 * Withering Curse (2x3, aşamalı önden arkaya): Hexer kara kandilini eğer, kandil alevi titreyip kısılır, kandilden yere üç damla
 * sarı-yeşil çürük düşer (mum sönme "pof"u). Çürük damarı zemin boyunca ön sıranın hücrelerine sürünür; hücreler grileşip zeytin
 * rengine döner, damarlar dallanır, yerden küçük kara mum alevleri fışkırıp söner (aşama 1 hasarı + Omen). Damarlar arka sıraya
 * geçer (aşama 2). Vurulanların ayaklarından yeşil-gri buhar yükselir (Wither). Zemin izi kalmaz: 0,5 sn'de solar.
 */
const witheringCurse: V2Vfx = (c, k) =>
  k.playUntilHit(async (firstHit) => {
    const d = facing(c);
    c.actor.play('cast');
    c.sfx('candleGutter');
    const lan = lantern(c, d);
    // kandil eğilir: kehribar alev titrer, sönükleşir
    const amber = c.scene.add.circle(lan.x, lan.y, 10, k.color('#d9a441'), 0.7).setDepth(c.actor.container.depth + 2).setBlendMode(k.Phaser.BlendModes.ADD);
    c.scene.tweens.add({ targets: amber, alpha: 0.15, radius: 6, duration: k.slow(60), yoyo: true, repeat: 3, onComplete: () => amber.destroy() });
    c.scene.tweens.add({ targets: c.actor.container, angle: d * 3, duration: k.slow(160), yoyo: true, hold: k.slow(140) });
    const fa = feetOf(c.actor);
    const dropX = lan.x + d * 6;
    await Promise.all(
      [0, 1, 2].map(async (i) => {
        await k.wait(c.scene, k.slow(i * 70));
        const r = c.scene.add.rectangle(dropX, lan.y + 18, 5, 7, k.color(ROT)).setDepth(k.DEPTH + 20);
        await k.counter(c.scene, k.slow(200), (u) => r.setPosition(dropX + d * i * 4, lan.y + 18 + (fa.y - lan.y - 18) * u * u));
        r.destroy();
        k.burst(c.scene, dropX + d * i * 4, fa.y, { colors: ROT_FX, n: 3, speed: [30, 90], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 300, life: [200, 340], size: [4, 6] });
      }),
    );
    // damar: Hexer'in ayağından ilk aşamanın hücrelerine
    c.sfx('rotSeep');
    const stages = c.stages?.length ? c.stages : [{ slots: c.slots ?? [], cells: c.cells, targets: c.targets }];
    const floor = c.scene.add.graphics().setDepth(k.FLOOR_FX + 2);
    const veinG = c.scene.add.graphics().setDepth(k.FLOOR_FX + 3);
    const firstMid = stages[0]?.cells.length ? { x: stages[0].cells.reduce((s, p) => s + p.x, 0) / stages[0].cells.length, y: stages[0].cells.reduce((s, p) => s + p.y, 0) / stages[0].cells.length } : c.centerPos ?? feetOf(c.targets[0] ?? c.actor);
    const start = { x: dropX, y: fa.y };
    const path: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      path.push({ x: start.x + (firstMid.x - start.x) * u, y: start.y + (firstMid.y - start.y) * u + Math.sin(u * 13) * 6 });
    }
    await k.counter(c.scene, k.slow(220), (u) => {
      const m = Math.floor(u * (path.length - 1));
      for (let i = 0; i < m; i++) {
        veinG.lineStyle(6, 0x3a4020, 0.85).lineBetween(path[i]!.x, path[i]!.y, path[i + 1]!.x, path[i + 1]!.y);
        veinG.lineStyle(2, 0xc9d27a, 0.95).lineBetween(path[i]!.x, path[i]!.y, path[i + 1]!.x, path[i + 1]!.y);
      }
    });
    let entry: Pt = firstMid;
    for (let si = 0; si < stages.length; si++) {
      const st = stages[si]!;
      k.fillCells(floor, c.board, st.slots, { fill: 0x3a4020, fillA: 0.58, edge: 0x9cab3c, edgeA: 0.75, edgeW: 3, k: 0.97 });
      const jobs = st.slots.map((slot) => veinsIn(c, k, veinG, k.quadOf(c.board, slot, 0.95), entry, 200));
      // kara mum alevleri
      for (const slot of st.slots) {
        const q = k.quadOf(c.board, slot, 0.8);
        for (let j = 0; j < 2; j++) {
          const at = k.inQuad(q, 0.7);
          void k.wait(c.scene, k.slow(80 + j * 90)).then(() => {
            const f = k.v2Sprite(c, 'blackflame', PLUM, at.x, at.y + 4, 34, at.y + 1).setOrigin(0.5, 1);
            k.sprout(c.scene, f, 120);
            c.scene.tweens.add({ targets: f, scaleY: 0.05, alpha: 0, delay: k.slow(200), duration: k.slow(200), onComplete: () => f.destroy() });
          });
        }
      }
      await Promise.all(jobs);
      for (const v of st.targets) {
        vapor(c, k, v, 4, 760);
        k.burst(c.scene, v.container.x, v.container.y - v.h * 0.4, { colors: ROT_FX, n: 6, speed: [40, 160], gravity: -40, life: [300, 520], size: [5, 8] });
        c.scene.tweens.add({ targets: v.container, y: v.container.y + 4, duration: k.slow(60), yoyo: true });
      }
      c.releaseStage(si);
      if (si === 0) firstHit();
      entry = st.cells.length ? { x: st.cells.reduce((s, p) => s + p.x, 0) / st.cells.length, y: st.cells.reduce((s, p) => s + p.y, 0) / st.cells.length } : entry;
      if (si < stages.length - 1) {
        c.sfx('rotSeep');
        await k.wait(c.scene, k.slow(110));
      }
    }
    firstHit();
    c.actor.play('idle');
    c.scene.tweens.add({ targets: [floor, veinG], alpha: 0, delay: k.slow(250), duration: k.slow(500), onComplete: () => { floor.destroy(); veinG.destroy(); } });
  });

/**
 * Jinx: Hexer kırmızı ipliği iki eli (asa ve kandil) arasında gerer, ortada seramik boncuk (0,18 sn, iplik gıcırtısı). İpliği fırlatır:
 * boncuk önde, iplik arkasında dalgalanarak uçar (0,26 sn). Hedefin gövdesine üç tur sarılır ve daralır (0,24 sn), düğüm sıkılınca boncuk
 * "tık" diye çatlar (vuruş). Küçük kırmızı düğüm rozeti başının üstünde bir süre kalır.
 */
const jinx: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  c.actor.play('cast');
  c.sfx('threadCinch');
  const A = charmsAt(c, d);
  const B = lantern(c, d);
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 28);
  const red = k.color(THREAD);
  const bead = k.v2Sprite(c, 'bead', '#b87a4a', (A.x + B.x) / 2, (A.y + B.y) / 2, 18, k.DEPTH + 30);
  // 1) gerilen iplik
  await k.counter(c.scene, k.slow(180), (u) => {
    g.clear().lineStyle(2, red, 1);
    const sag = 18 * (1 - u);
    const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + sag };
    g.beginPath().moveTo(A.x, A.y).lineTo(m.x, m.y).lineTo(B.x, B.y).strokePath();
    bead.setPosition(m.x, m.y);
  });
  // 2) fırlatma: boncuk önde, iplik dalgalı
  const p = chest(t);
  const from = { x: bead.x, y: bead.y };
  await k.counter(c.scene, k.slow(260), (u) => {
    const x = from.x + (p.x - from.x) * u;
    const y = from.y + (p.y - from.y) * u - Math.sin(u * Math.PI) * 50;
    bead.setPosition(x, y).setRotation(u * 8);
    g.clear().lineStyle(2, red, 1).beginPath().moveTo(B.x, B.y);
    const n = 20;
    for (let i = 1; i <= n; i++) {
      const v = i / n;
      const wave = Math.sin(v * Math.PI * 3 - u * 12) * 10 * (1 - v) * (1 - u * 0.5);
      g.lineTo(B.x + (x - B.x) * v, B.y + (y - B.y) * v + wave);
    }
    g.strokePath();
  });
  // 3) üç tur sarılma, daralma
  const cx = t.container.x;
  const cy = t.container.y - t.h * 0.5;
  await k.counter(c.scene, k.slow(240), (u) => {
    g.clear().lineStyle(2, red, 1);
    g.lineBetween(B.x, B.y, cx - d * t.w * 0.3, cy);
    const loops = 3 * u;
    const rx = t.w * (0.55 - 0.18 * u);
    const steps = Math.max(2, Math.floor(loops * 24));
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy - 20 + (i / 72) * 40 + Math.sin(a) * rx * 0.28;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    bead.setPosition(cx + Math.cos(loops * Math.PI * 2) * rx, cy - 20 + (loops / 3) * 40 + Math.sin(loops * Math.PI * 2) * rx * 0.28);
  });
  // düğüm: boncuk çatlar (vuruş)
  c.sfx('ceramicCrack');
  bead.destroy();
  for (let i = 0; i < 5; i++) {
    const sh = k.v2Sprite(c, 'beadshard', '#b87a4a', cx, cy, 12, k.DEPTH + 45).setRotation(k.rnd(0, 6));
    c.scene.tweens.add({ targets: sh, x: cx + k.rnd(-70, 70), y: cy + k.rnd(-60, 40), rotation: sh.rotation + k.rnd(-5, 5), alpha: 0, duration: k.slow(420), onComplete: () => sh.destroy() });
  }
  k.burst(c.scene, cx, cy, { colors: ['#c0203a', '#e5463b', '#e9dfc4'], n: 8, speed: [80, 220], gravity: 400, life: [220, 380], size: [5, 8] });
  c.scene.tweens.add({ targets: t.container, scaleX: 0.96, duration: k.slow(60), yoyo: true });
  c.scene.tweens.add({ targets: g, alpha: 0, delay: k.slow(260), duration: k.slow(300), onComplete: () => g.destroy() });
  const h = headTop(t);
  const knot = k.v2Sprite(c, 'badge_jinxed', THREAD, h.x, h.y, 28, k.DEPTH + 60).setAlpha(0);
  c.scene.tweens.add({ targets: knot, alpha: 1, y: h.y - 6, duration: k.slow(160) });
  c.scene.tweens.add({ targets: knot, alpha: 0, delay: k.slow(800), duration: k.slow(300), onComplete: () => knot.destroy() });
  seatOmen(c, k, t, 220);
  c.actor.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------------
// MOTOR OLAYLARI (ui-dev bağlayacak)

/** Otomatik Doom: üç pul başın üstünde birbirine yapışıp çatlar, kısa kara sütun iner (Promise yere değince), kıymık + yeşil toz. */
const doomburst: V2Vfx = async (c, k) => {
  c.sfx('ceramicCrack');
  await Promise.all(
    c.targets.map(async (t) => {
      const h = headTop(t);
      const pips = [-1, 0, 1].map((i) => k.v2Sprite(c, 'charm', CURSE, h.x + i * 28, h.y, 22, k.DEPTH + 55));
      await k.counter(c.scene, k.slow(200), (u) => pips.forEach((pp, i) => pp.setPosition(h.x + (i - 1) * 28 * (1 - u), h.y).setRotation(u * 2 * (i - 1))));
      for (const pp of pips) pp.destroy();
      burstCharm(c, k, h.x, h.y);
      await doomBeam(c, k, t.container.x, feetOf(t).y + 4, Math.max(70, t.w * 0.8), 110, 260);
      c.sfx('doomThud');
      k.shake(c.scene, 160, 0.006);
      k.burst(c.scene, t.container.x, feetOf(t).y - 10, { colors: [...CURSE_FX, '#1c0a1a'], n: 12, speed: [100, 300], angle: [-Math.PI, 0], gravity: 500, life: [360, 600], size: [5, 9] });
    }),
  );
};

/** Ill Omen geçişi: ölenin yerinden eflatun duman ipliği kavisle alıcıya akar, pul alıcının başına oturur. */
const omentransfer: V2Vfx = async (c, k) => {
  const src = chest(c.actor);
  c.sfx('hexWhisper');
  await Promise.all(
    c.targets.map(async (t) => {
      const h = headTop(t);
      const g = c.scene.add.graphics().setDepth(k.DEPTH + 26);
      const pip = k.v2Sprite(c, 'charm', CURSE, src.x, src.y, 22, k.DEPTH + 56);
      const lift = Math.min(220, Math.abs(h.x - src.x) * 0.4 + 60);
      const at = (u: number): Pt => ({ x: src.x + (h.x - src.x) * u, y: src.y + (h.y - src.y) * u - 4 * lift * u * (1 - u) });
      await k.counter(c.scene, k.slow(520), (u) => {
        g.clear();
        const n = 26;
        for (let i = 0; i < n * u; i++) {
          const v = i / n;
          const p = at(v);
          const w = 7 * (1 - v * 0.6) * (0.6 + 0.4 * Math.sin(v * 18 + u * 10));
          g.fillStyle(k.color(i % 3 ? CURSE : '#e3b8de'), 0.55 * (1 - Math.max(0, u - v) * 1.4)).fillRect(Math.round(p.x - w / 2), Math.round(p.y - w / 2), Math.max(2, w), Math.max(2, w));
        }
        const p = at(u);
        pip.setPosition(p.x, p.y).setRotation(u * 6);
      }, 'Quad.easeInOut');
      c.scene.tweens.add({ targets: g, alpha: 0, duration: k.slow(260), onComplete: () => g.destroy() });
      c.sfx('omenSet');
      glow(c, k, h.x, h.y, 70, 360);
      c.scene.tweens.add({ targets: pip, y: h.y + 4, duration: k.slow(90), yoyo: true });
      c.scene.tweens.add({ targets: pip, alpha: 0, delay: k.slow(500), duration: k.slow(260), onComplete: () => pip.destroy() });
    }),
  );
};

/** Wither tiki: taşıyanın ayak dibinde kısa yeşil-gri buhar (tik hasarı ile aynı an). */
const withertick: V2Vfx = async (c, k) => {
  c.sfx('candleGutterSoft');
  for (const t of c.targets) {
    vapor(c, k, t, 3, 400);
    const s = k.v2Sprite(c, 'badge_wither', ROT, t.container.x, t.container.y - t.h - 16, 22, k.DEPTH + 60);
    c.scene.tweens.add({ targets: s, alpha: 0, y: s.y - 14, duration: k.slow(480), onComplete: () => s.destroy() });
  }
  await k.wait(c.scene, k.slow(120));
};

export const VFX: Record<string, V2Vfx> = { voidstrike, wail: witheringCurse, bonethrow: jinx, doomburst, omentransfer, withertick };

// Doğrudan adıyla da erişilsin (bağlayan kod skill/v1 adı yerine anlamlı ad kullanabilsin)
export const HEXER_FX = { evilEye, witheringCurse, jinx, doomMark, doomburst, omentransfer, withertick };