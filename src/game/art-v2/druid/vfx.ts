/**
 * Druid - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Görsel dil (assets/sprites/druid/idle.png): budaklı meşe asası (dikenli sarmaşık asanın tepesinden doğar), avuçta ışıyan yeşil yaprak
 * (şifa), meşe yaprağı, toprak/kök. Treant (assets/sprites/treant/idle.png): yosunlu meşe gövdesi, kalın kök parmaklar, kehribar gözler;
 * vuruşları topraktan gelir (kök yumruğu yerin altından fırlar, kök halkaları bacakları sarar). Diken (Thorn Whip, Nature's Wrath) Druid'in,
 * kalın kök (Root Smash, Vine Snare) Treant'ın imzası.
 *
 * Bu class'ın skill'leri -> VFX anahtarları:
 *   thorn_whip (Thorn Whip) -> 'thornwhip'
 *   natures_wrath (Nature's Wrath) -> 'vines'
 *   rejuvenate (Rejuvenate) -> 'rejuvenate'
 *   summon_treant (Summon Treant) -> 'summonroots'
 *   root_smash (Root Smash) -> 'rootfall'
 *   vine_snare (Vine Snare) -> 'vinesnare'
 * Phaser'ı ve ../../vfx'i ÇALIŞMA ZAMANINDA içe aktarma (yalnızca import type); her şey k üzerinden gelir.
 */
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------------------------------------------- renkler

const LEAF = ['#a8f08a', '#62d04b', '#2c7a2b'];
const SOIL = ['#4a2e1a', '#6b4423', '#8c5a2b'];
const BARK = ['#8c5a2b', '#6b4423', '#e3b983'];
const HEAL = ['#e8ffe0', '#a8f08a', '#7dff9b', '#62d04b'];
const BLOOD = ['#e5463b', '#8e1f2c'];

// ---------------------------------------------------------------------------------------------------------------- ortak yardımcılar

interface SceneLike {
  battle?: { log?: Array<Record<string, unknown>> };
  views?: Map<string, CombatantView>;
}
const sceneOf = (c: VfxCtx): SceneLike => c.scene as unknown as SceneLike;

/** Bu skill kullanımının motor olayları (aynı kullanıcının son skillUsed olayından sonrakiler) + skillUsed'un kendisi. */
function useEvents(c: VfxCtx): { used: Record<string, unknown> | null; after: Array<Record<string, unknown>> } {
  const log = sceneOf(c).battle?.log ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e['type'] === 'skillUsed' && e['actor'] === c.actor.combatant.uid && e['skill'] === c.skill.id) return { used: e, after: log.slice(i + 1) };
  }
  return { used: null, after: [] };
}

const facing = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);
const spriteW = (v: CombatantView): number => Math.abs(v.sprite.displayWidth * v.container.scaleX) || v.w * 0.6;
/** Druid asasının tepesi (arkadaki el; meyve-küre). */
const staffTop = (v: CombatantView): Pt => ({ x: v.container.x - facing(v) * spriteW(v) * 0.36, y: v.container.y - v.h * 0.94 });
/** Druid'in yaprak tutan öndeki avucu. */
const leafHand = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * spriteW(v) * 0.38, y: v.container.y - v.h * 0.64 });

/** Yumuşak yeşil ışıma dokusu (ADD). */
const greenGlowTex = (c: VfxCtx, k: VfxKit): string =>
  k.softTexture(c.scene, 'v2druid:glow', 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    if (d >= 1) return null;
    return { c: d < 0.25 ? '#f0ffe8' : d < 0.55 ? '#a8f08a' : '#4fb83a', a: (1 - d) ** 1.4 };
  });

/** Yükselen yumuşak şifa sütunu dokusu (alt geniş, üst erir). */
const healColumnTex = (c: VfxCtx, k: VfxKit): string =>
  k.softTexture(c.scene, 'v2druid:healcol', 24, 64, (x, y) => {
    const u = Math.abs((x + 0.5) / 24 - 0.5) * 2;
    const body = (1 - u ** 1.6) ** 1.2;
    const top = Math.min(1, (y + 1) / 40);
    return { c: u < 0.3 ? '#f0ffe8' : u < 0.65 ? '#a8f08a' : '#62d04b', a: body * top * 0.85 };
  });

function glowAt(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, life: number, depth = k.DEPTH + 30, tint?: number): Phaser.GameObjects.Image {
  const img = c.scene.add.image(x, y, greenGlowTex(c, k)).setDisplaySize(size, size).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
  if (tint !== undefined) img.setTint(tint);
  c.scene.tweens.add({ targets: img, alpha: 0, scaleX: img.scaleX * 1.4, scaleY: img.scaleY * 1.4, duration: k.slow(life), ease: 'Quad.easeOut', onComplete: () => img.destroy() });
  return img;
}

/** Yere yatık meşe mührü. */
function runeAt(c: VfxCtx, k: VfxKit, p: Pt, size: number, hex: string, life: number, alpha = 0.9): Phaser.GameObjects.Image {
  const s = k.v2Sprite(c, 'groverune', hex, p.x, p.y, size, k.FLOOR_FX + 4).setAlpha(0);
  s.setDisplaySize(size, size * 0.36);
  const sx = s.scaleX;
  const sy = s.scaleY;
  s.setScale(sx * 0.3, sy * 0.3);
  c.scene.tweens.add({ targets: s, scaleX: sx, scaleY: sy, alpha, duration: k.slow(240), ease: 'Back.easeOut' });
  c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(life), duration: k.slow(360), onComplete: () => s.destroy() });
  return s;
}

/** Dökülen / savrulan yapraklar. */
function leafSpray(c: VfxCtx, k: VfxKit, p: Pt, n: number, o: { spread?: number; up?: number; hex?: string; dry?: boolean; size?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const s = k.v2Sprite(c, o.dry ? 'dryleaf' : 'oakleaf', o.hex ?? '#62d04b', p.x + k.rnd(-12, 12), p.y + k.rnd(-12, 12), (o.size ?? 24) * k.rnd(0.75, 1.2), k.DEPTH + 45).setRotation(k.rnd(0, 6));
    const sp = o.spread ?? 120;
    const tx = p.x + k.rnd(-sp, sp);
    const ty = p.y - k.rnd(10, o.up ?? 90);
    c.scene.tweens.add({ targets: s, x: tx, y: ty, rotation: s.rotation + k.rnd(-4, 4), duration: k.slow(k.rnd(260, 380)), ease: 'Quad.easeOut' });
    c.scene.tweens.add({ targets: s, y: ty + k.rnd(60, 140), x: tx + k.rnd(-40, 40), alpha: 0, rotation: s.rotation + k.rnd(-6, 6), delay: k.slow(300), duration: k.slow(k.rnd(600, 900)), ease: 'Sine.easeIn', onComplete: () => s.destroy() });
  }
}

/** Toprak topakları ve toz (kök patlaması). */
function soilBurst(c: VfxCtx, k: VfxKit, p: Pt, power = 1): void {
  for (let i = 0; i < Math.round(5 * power); i++) {
    const s = k.v2Sprite(c, 'clod', '#6b4423', p.x + k.rnd(-14, 14), p.y - 4, k.rnd(14, 24) * power, k.DEPTH + 40).setRotation(k.rnd(0, 6));
    const tx = p.x + k.rnd(-90, 90) * power;
    c.scene.tweens.add({ targets: s, x: tx, rotation: s.rotation + k.rnd(-5, 5), duration: k.slow(520), ease: 'Linear' });
    c.scene.tweens.add({ targets: s, y: p.y - k.rnd(50, 120) * power, duration: k.slow(200), ease: 'Quad.easeOut', onComplete: () => c.scene.tweens.add({ targets: s, y: p.y + k.rnd(0, 16), duration: k.slow(280), ease: 'Quad.easeIn', onComplete: () => c.scene.tweens.add({ targets: s, alpha: 0, duration: k.slow(260), onComplete: () => s.destroy() }) }) });
  }
  k.burst(c.scene, p.x, p.y - 4, { colors: SOIL, n: Math.round(8 * power), speed: [80, 300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 800, life: [300, 640], size: [6, 12] });
  k.dustCloud(c.scene, p.x, p.y, { n: Math.round(3 * power), spread: 60, rise: 40, size: [28, 50], tint: 0x8a6a3a, life: 700 });
}

/**
 * Toprak altında ilerleyen kök: zeminde kabaran sırt (koyu çizgi + kalkan toprak), arada topak sıçrar. Promise uç varınca çözülür;
 * dönen `fade` sırtı söndürür.
 */
function rootRidge(c: VfxCtx, k: VfxKit, from: Pt, to: Pt, dur: number, w = 10): { done: Promise<void>; fade: (delay: number) => void } {
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1);
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = -(to.y - from.y) / len;
  const ny = (to.x - from.x) / len;
  const ph = k.rnd(0, 6);
  let drawn = 0;
  let dirt = 0;
  const at = (s: number): Pt => {
    const off = Math.sin(s / 38 + ph) * 8 * Math.min(1, s / 50);
    return { x: from.x + ((to.x - from.x) * s) / len + nx * off, y: from.y + ((to.y - from.y) * s) / len + ny * off * 0.5 };
  };
  const done = k.counter(c.scene, k.slow(dur), (u) => {
    const end = len * u;
    for (let s = drawn; s <= end; s += 3) {
      const p = at(s);
      const th = Math.max(4, w * (1 - 0.4 * (s / len)));
      g.fillStyle(0x2a1a0e, 0.85).fillRect(k.snap(p.x - th / 2), k.snap(p.y - th / 4), th, Math.max(2, th / 2));
      g.fillStyle(0x6b4423, 0.9).fillRect(k.snap(p.x - th / 2 + 2), k.snap(p.y - th / 4 - 2), Math.max(2, th - 4), 2);
      if (Math.floor(s / 9) % 5 === 0) g.fillStyle(0x8c5a2b, 1).fillRect(k.snap(p.x - 2), k.snap(p.y - th / 2 - 2), 4, 3);
    }
    drawn = Math.max(drawn, end);
    if (u * dur > dirt && u < 1) {
      dirt += 55;
      const p = at(end);
      k.burst(c.scene, p.x, p.y - 2, { colors: SOIL, n: 1, speed: [40, 150], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 650, life: [220, 420], size: [6, 10] });
    }
  });
  return { done, fade: (delay) => c.scene.tweens.add({ targets: g, alpha: 0, delay: k.slow(delay), duration: k.slow(500), onComplete: () => g.destroy() }) };
}

/** Yerden fışkıran dikey sprite (kök ucu / dikenli filiz): origin altta, Back ile uzar, `hold` sonra toprağa geri çekilir. */
function erupt(c: VfxCtx, k: VfxKit, name: string, hex: string, x: number, y: number, w: number, h: number, delay: number, hold: number, lean = 0): Phaser.GameObjects.Image {
  const s = k.v2Sprite(c, name, hex, x, y + 2, h, y + 1).setOrigin(0.5, 1);
  s.setDisplaySize(w, h).setRotation(lean);
  if (Math.random() < 0.5) s.setFlipX(true);
  const sy = s.scaleY;
  s.setScale(s.scaleX, sy * 0.05);
  c.scene.tweens.add({ targets: s, scaleY: sy, duration: k.slow(k.rnd(140, 200)), delay: k.slow(delay), ease: 'Back.easeOut' });
  c.scene.tweens.add({ targets: s, angle: s.angle + k.rnd(-5, 5), duration: k.slow(360), yoyo: true, delay: k.slow(delay + 220), ease: 'Sine.easeInOut' });
  c.scene.tweens.add({ targets: s, scaleY: sy * 0.05, alpha: 0, delay: k.slow(delay + hold), duration: k.slow(260), ease: 'Quad.easeIn', onComplete: () => s.destroy() });
  return s;
}

/**
 * Kalın kök-sarmaşık halkası bir birimin bacaklarını sarar (Vine Snare). Arka kıvrımlar birimin arkasında, öndekiler önünde; uzanır, sıkar
 * (birim hafif ezilir), `hold` tutar, çözülür. `rooted` ise daha sıkı ve yapraklı.
 */
function rootCoil(c: VfxCtx, k: VfxKit, t: CombatantView, hold: number, rooted: boolean): void {
  const back = c.scene.add.graphics().setDepth(t.container.depth - 1);
  const front = c.scene.add.graphics().setDepth(t.container.depth + 2);
  const cx = t.container.x;
  const base = t.container.y - 2;
  const H = t.h * 0.36;
  const W = Math.max(24, spriteW(t) * 0.34);
  const turns = rooted ? 2.6 : 2.1;
  const max = turns * Math.PI * 2;
  const ph = k.rnd(0, Math.PI * 2);
  const draw = (grow: number, squeeze: number) => {
    back.clear();
    front.clear();
    for (let a = 0; a <= grow * max; a += 0.09) {
      const kk = a / max;
      const r = W * (1 - 0.15 * kk) * squeeze;
      const x = k.snap(cx + Math.cos(a + ph) * r);
      const y = k.snap(base - kk * H + Math.sin(a + ph) * 6);
      const isFront = Math.sin(a + ph) > 0;
      const g = isFront ? front : back;
      const th = isFront ? 13 : 9;
      g.fillStyle(0x2a1a0e, 1).fillRect(x - th / 2 - 1, y - th / 2 - 1, th + 2, th + 2);
      g.fillStyle(isFront ? (Math.round(a / 0.36) % 2 ? 0x8c5a2b : 0x6b4423) : 0x4a2e1a, 1).fillRect(x - th / 2, y - th / 2, th, th);
      const i = Math.round(a / 0.09);
      if (isFront && i % 5 === 0) g.fillStyle(0xb9894f, 1).fillRect(x - th / 2, y - th / 2, th, 3);
      if (isFront && i % 11 === 4) g.fillStyle(0x62d04b, 1).fillRect(x - 3, y - th / 2 - 4, 7, 5);
      if (rooted && isFront && i % 17 === 9) g.fillStyle(0xa8f08a, 1).fillRect(x - 7, y - 11, 14, 6).fillStyle(0x2c7a2b, 1).fillRect(x - 1, y - 9, 3, 3);
    }
  };
  void k.counter(c.scene, k.slow(220), (u) => draw(u, 1), 'Quad.easeOut').then(async () => {
    c.scene.tweens.add({ targets: t.container, scaleX: 0.94, scaleY: 0.97, duration: k.slow(80), yoyo: true });
    await k.counter(c.scene, k.slow(150), (u) => draw(1, 1 - (rooted ? 0.22 : 0.15) * Math.sin(u * Math.PI)));
    await k.wait(c.scene, k.slow(hold));
    await k.counter(c.scene, k.slow(240), (u) => draw(1 - u, 1), 'Quad.easeIn');
    back.destroy();
    front.destroy();
  });
}

// ---------------------------------------------------------------------------------------------------------------- THORN WHIP

/**
 * Thorn Whip (tek hedef, doğa büyüsü + Wound 2 tur): Druid asasını geriye savurur; asanın meşe tepesinden dikenli bir sarmaşık fışkırıp
 * başının arkasında kıvrılır, sonra tepeden hedefe şaklar (gövde Bézier, kalın üç tonlu yeşil, beyaz dikenler, meşe yaprakları). Şakta
 * hava patlaması, yaprak ve diken parçaları; Wound tuttuysa dikenler hedefin gövdesine saplı kalır ve aralarından kan damlar (şifa alımı
 * düşer: kanayan yara). Sarmaşık geri çekilip asaya sarılır.
 */
const thornwhip: V2Vfx = async (c, k) => {
  const a = c.actor;
  a.play('attack');
  c.sfx('whipWind');
  const { after } = useEvents(c);
  await Promise.all(
    c.targets.map(async (t) => {
      const dir = t.container.x >= a.container.x ? 1 : -1;
      const H0 = staffTop(a);
      const P = k.spot(t);
      const B = { x: H0.x - dir * 110, y: H0.y - 150 };
      const g = c.scene.add.graphics().setDepth(k.DEPTH + 30);
      const lerp = (p: number, q: number, u: number) => p + (q - p) * u;
      const draw = (tip: Pt, ctrl: Pt, ripple: number, alpha = 1) => {
        g.clear();
        const H = staffTop(a);
        const n = 60;
        const pts: Array<Pt & { nx: number; ny: number }> = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const x = (1 - u) ** 2 * H.x + 2 * (1 - u) * u * ctrl.x + u * u * tip.x;
          const y = (1 - u) ** 2 * H.y + 2 * (1 - u) * u * ctrl.y + u * u * tip.y;
          const dx = 2 * (1 - u) * (ctrl.x - H.x) + 2 * u * (tip.x - ctrl.x);
          const dy = 2 * (1 - u) * (ctrl.y - H.y) + 2 * u * (tip.y - ctrl.y);
          const l = Math.hypot(dx, dy) || 1;
          const w = Math.sin(u * 13 - ripple * 12) * 8 * ripple * (1 - u * 0.4);
          pts.push({ x: k.snap(x + (-dy / l) * w), y: k.snap(y + (dx / l) * w), nx: -dy / l, ny: dx / l });
        }
        pts.forEach((q, i) => {
          const th = 12 - (i / n) * 6;
          g.fillStyle(0x173a12, alpha).fillRect(q.x - th / 2 - 2, q.y - th / 2 - 2, th + 4, th + 4);
        });
        pts.forEach((q, i) => {
          const th = 12 - (i / n) * 6;
          g.fillStyle(i % 3 === 0 ? 0x2c7a2b : 0x3f9a34, alpha).fillRect(q.x - th / 2, q.y - th / 2, th, th);
          g.fillStyle(0x7ed957, alpha).fillRect(q.x - th / 2, q.y - th / 2, th, Math.max(2, th / 3)); // üst ışık
          if (i % 6 === 3) {
            const s = i % 12 === 3 ? 1 : -1;
            g.fillStyle(0xfdfaf2, alpha).fillTriangle(q.x + q.nx * s * th * 0.4, q.y + q.ny * s * th * 0.4, q.x + q.nx * s * (th + 11), q.y + q.ny * s * (th + 11), q.x + q.nx * s * th * 0.4 + (pts[i + 1]?.x ?? q.x) - q.x, q.y + q.ny * s * th * 0.4 + (pts[i + 1]?.y ?? q.y) - q.y);
          }
          if (i % 14 === 8) {
            const s = i % 28 === 8 ? 1 : -1;
            g.fillStyle(0x62d04b, alpha).fillEllipse(q.x + q.nx * s * 14, q.y + q.ny * s * 14, 16, 9);
            g.fillStyle(0xa8f08a, alpha).fillEllipse(q.x + q.nx * s * 13, q.y + q.ny * s * 12, 8, 4);
          }
        });
        const e = pts[pts.length - 1]!;
        g.fillStyle(0x173a12, alpha).fillRect(e.x - 7, e.y - 7, 14, 14);
        g.fillStyle(0xfdfaf2, alpha).fillTriangle(e.x - 6, e.y - 4, e.x + dir * 14, e.y, e.x - 6, e.y + 4);
      };
      // asadan doğuş + geri savurma
      glowAt(c, k, H0.x, H0.y, 70, 360);
      leafSpray(c, k, H0, 3, { spread: 50, up: 40, size: 20 });
      await k.counter(c.scene, k.slow(230), (u) => draw({ x: lerp(H0.x + dir * 10, B.x, u), y: lerp(H0.y - 40, B.y, u) }, { x: lerp(H0.x + dir * 18, H0.x - dir * 60, u), y: lerp(H0.y - 60, H0.y - 200, u) }, 0.3 * (1 - u)), 'Quad.easeOut');
      await k.wait(c.scene, k.slow(40));
      // ileri şaklama
      await k.counter(
        c.scene,
        k.slow(150),
        (u) => {
          const e = u * u;
          const tip = { x: lerp(B.x, P.x, e), y: lerp(B.y, P.y, e) - Math.sin(e * Math.PI) * 110 };
          const mid = { x: (H0.x + tip.x) / 2, y: (H0.y + tip.y) / 2 };
          const back = { x: H0.x - dir * 60, y: H0.y - 200 };
          const kk = Math.min(1, u * 1.35);
          draw(tip, { x: lerp(back.x, mid.x, kk), y: lerp(back.y, mid.y - 30 * (1 - u), kk) }, 0.25 * u);
        },
        'Quad.easeIn',
      );
      // şak
      c.sfx('whipCrack');
      draw(P, { x: (H0.x + P.x) / 2, y: (H0.y + P.y) / 2 + 6 }, 0);
      glowAt(c, k, P.x, P.y, 120, 260, k.DEPTH + 55, 0xffffff);
      void k.ring(c.scene, P.x, P.y, { r: 100, flat: 0.75, n: 24, colors: ['#ffffff', '#a8f08a', '#62d04b'], dur: 280, size: 9 });
      k.hit(c.scene, P.x, P.y, LEAF, 1.1);
      leafSpray(c, k, P, 5, { spread: 130, up: 80 });
      k.shake(c.scene, 100, 0.004);
      c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 14, duration: k.slow(50), yoyo: true });
      const wounded = after.some((e) => e['type'] === 'status' && e['status'] === 'wound' && e['target'] === t.combatant.uid);
      if (wounded) {
        c.sfx('thornPierce');
        const barbs: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < 4; i++) {
          const bx = P.x + k.rnd(-spriteW(t) * 0.22, spriteW(t) * 0.22);
          const by = P.y + k.rnd(-t.h * 0.2, t.h * 0.18);
          const b = k.v2Sprite(c, 'thornbarb', '#62d04b', bx - dir * 30, by - 10, 30, t.container.depth + 3).setRotation(dir > 0 ? 0.15 : Math.PI - 0.15).setFlipY(dir < 0);
          c.scene.tweens.add({ targets: b, x: bx, y: by, duration: k.slow(70), delay: k.slow(i * 30), ease: 'Quad.easeIn' });
          barbs.push(b);
        }
        // kan damlaları (Wound): saplı dikenlerden aşağı süzülür
        for (let i = 0; i < 6; i++) {
          void k.wait(c.scene, k.slow(140 + i * 110)).then(() => {
            const b = barbs[i % barbs.length]!;
            k.burst(c.scene, b.x, b.y + 4, { colors: BLOOD, n: 1, speed: [10, 30], angle: [Math.PI * 0.4, Math.PI * 0.6], gravity: 500, life: [400, 600], size: [5, 8] });
          });
        }
        c.scene.tweens.add({ targets: barbs, alpha: 0, delay: k.slow(900), duration: k.slow(300), onComplete: () => barbs.forEach((b) => b.destroy()) });
      }
      c.sfx('leafRustle');
      await k.wait(c.scene, k.slow(60));
      // geri çekilme
      void k.counter(
        c.scene,
        k.slow(220),
        (u) => {
          const H = staffTop(a);
          draw({ x: lerp(P.x, H.x + dir * 6, u), y: lerp(P.y, H.y - 10, u) }, { x: lerp((H.x + P.x) / 2, H.x, u), y: lerp((H.y + P.y) / 2 + 40, H.y - 40, u) }, 0.15 * u, 1 - u * 0.8);
          if (u >= 1) g.destroy();
        },
        'Quad.easeIn',
      );
    }),
  );
  a.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------- NATURE'S WRATH

/** Bir hücrede yerin yarılıp kalın köklerin ve dikenli filizlerin fışkırması; hücredeki düşmanlar havaya kalkar ve dikenlenir. */
function wrathCell(c: VfxCtx, k: VfxKit, slot: number, victims: CombatantView[], big: boolean): void {
  const q = k.quadOf(c.board, slot, 0.9);
  const mid = k.cellMid(c.board, slot);
  // zemin yarılır: koyu çatlak + toprak kabuğu plakası
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1);
  k.fillCells(g, c.board, [slot], { fill: 0x2a1a0e, fillA: 0.5, edge: 0x6b4423, edgeA: 0.8, edgeW: 3, k: 0.86 });
  c.scene.tweens.add({ targets: g, alpha: 0, delay: k.slow(700), duration: k.slow(500), onComplete: () => g.destroy() });
  k.cracks(c.scene, mid.x, mid.y, { len: 80, n: 6, dur: 700 });
  const n = big ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const p = k.inQuad(q, 0.85);
    const thorny = i % 2 === 1;
    const h = k.rnd(110, 160) * (big ? 1.1 : 1);
    erupt(c, k, thorny ? 'thornshoot' : 'rootspike', '#7ed957', k.snap(p.x), k.snap(p.y), h * (thorny ? 0.55 : 0.62), h, i * 30, 760 + i * 30, k.rnd(-0.25, 0.25));
  }
  soilBurst(c, k, mid, big ? 1.1 : 0.9);
  leafSpray(c, k, { x: mid.x, y: mid.y - 50 }, 3, { spread: 70, up: 70, hex: '#7ed957' });
  for (const t of victims) {
    c.scene.tweens.add({ targets: t.container, y: t.container.y - 16, duration: k.slow(110), yoyo: true, ease: 'Quad.easeOut' });
    const p = k.spot(t);
    k.burst(c.scene, p.x, p.y, { colors: ['#62d04b', '#2c7a2b', '#fdfaf2'], n: 6, speed: [80, 260], gravity: 500, life: [300, 600], size: [6, 10] });
  }
}

/**
 * Nature's Wrath (rect 2x3, aşamalı row; doğa büyüsü): Druid asasını toprağa vurur (ayağında meşe mührü parlar); köklü sırtlar zeminin
 * altından ön sıranın her hücresine ayrı ayrı koşar. Hücreye varınca toprak yarılır, kalın kökler ve dikenli filizler fışkırır, oradaki düşman
 * havaya kalkar (1. aşama). Ardından sırtlar her hücreden arka sıraya ilerler ve orada da fışkırır (2. aşama). Kökler bir süre sonra toprağa çekilir.
 */
const vines: V2Vfx = (c, k) =>
  k.playUntilHit(async (hit) => {
    const a = c.actor;
    c.sfx('rootsRumble');
    a.play('cast');
    c.scene.tweens.add({ targets: a.container, y: a.container.y + 6, scaleY: 0.96, duration: k.slow(110), yoyo: true, hold: k.slow(60) });
    const f = k.feet(a);
    runeAt(c, k, f, 200, '#7ed957', 600);
    glowAt(c, k, staffTop(a).x, staffTop(a).y, 90, 400);
    await k.wait(c.scene, k.slow(170));
    c.sfx('thud');
    k.shake(c.scene, 120, 0.004);
    soilBurst(c, k, { x: a.container.x - facing(a) * spriteW(a) * 0.36, y: a.container.y - 4 }, 0.6);
    const stages = c.stages?.length ? c.stages : [{ slots: c.slots ?? [], cells: c.cells, targets: c.targets }];
    const root = { x: a.container.x + facing(a) * 30, y: a.container.y - 4 };
    const fades: Array<(d: number) => void> = [];
    let prev: number[] = [];
    for (const [si, st] of stages.entries()) {
      const runs = st.slots.map((slot) => {
        const to = k.cellMid(c.board, slot);
        const fromSlot = prev.length ? prev.reduce((b, s) => (Math.hypot(k.cellMid(c.board, s).x - to.x, k.cellMid(c.board, s).y - to.y) < Math.hypot(k.cellMid(c.board, b).x - to.x, k.cellMid(c.board, b).y - to.y) ? s : b)) : null;
        const from = fromSlot === null ? root : k.cellMid(c.board, fromSlot);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const rr = rootRidge(c, k, from, to, Math.max(180, dist / (si === 0 ? 2.6 : 1.7)), si === 0 ? 12 : 10);
        fades.push(rr.fade);
        return { slot, done: rr.done };
      });
      if (si > 0) c.sfx('rootsRumble');
      await Promise.all(
        runs.map(async (r, i) => {
          await r.done;
          wrathCell(c, k, r.slot, st.targets.filter((t) => t.combatant.slot === r.slot), si === 0);
          if (i === 0) {
            c.sfx('soilBurst');
            c.sfx('leafRustle');
            k.shake(c.scene, 130, si === 0 ? 0.005 : 0.004);
          }
        }),
      );
      await k.wait(c.scene, k.slow(80));
      c.releaseStage(si);
      if (si === 0) hit();
      prev = st.slots;
      if (si < stages.length - 1) await k.wait(c.scene, k.slow(200));
    }
    a.play('idle');
    for (const fd of fades) fd(500);
    await k.wait(c.scene, k.slow(300));
  });

// ---------------------------------------------------------------------------------------------------------------- REJUVENATE

/**
 * Rejuvenate (tek dost; anında şifa + 3 tur iyileşme-zaman-içinde): Druid avucundaki yaprağa nefes verir; avuçtan ışıyan bir tohum süzülüp
 * dostun ayağına düşer. Toprakta yeşil meşe mührü açılır, çevresinde filizler halka hâlinde yükselir, gövdeyi saran yaprak sarmalı ve
 * yumuşak yeşil ışık sütunu yükselir (anında şifa). Ardından filizlerin arasında çiçekler açar ve bir süre polen saçarak kalır: iyileşme
 * sonraki turlarda da sürecek.
 */
const rejuvenate: V2Vfx = async (c, k) => {
  const a = c.actor;
  c.sfx('dewBreath');
  a.play('cast');
  const h = leafHand(a);
  glowAt(c, k, h.x, h.y, 90, 420);
  await k.wait(c.scene, k.slow(160));
  await Promise.all(
    c.targets.map(async (t) => {
      const f = k.feet(t);
      const body = k.spot(t);
      // ışıyan tohum avuçtan dosta süzülür
      const seed = k.v2Sprite(c, 'seedlight', '#7dff9b', h.x, h.y, 34, k.DEPTH + 40);
      const glow = c.scene.add.image(h.x, h.y, greenGlowTex(c, k)).setDisplaySize(70, 70).setDepth(k.DEPTH + 39).setBlendMode(k.Phaser.BlendModes.ADD);
      await k.travel(c.scene, seed, { x: f.x, y: f.y - 8 }, t === a ? 260 : 360, {
        arc: t === a ? 60 : 90,
        trail: (x, y) => {
          glow.setPosition(x, y);
          k.burst(c.scene, x, y, { colors: HEAL, n: 1, speed: [5, 40], gravity: -40, life: [300, 520], size: [5, 8] });
        },
        trailEvery: 30,
      });
      seed.destroy();
      glow.destroy();
      // tohum toprağa düşer: mühür + filiz halkası + ışık sütunu
      c.sfx('chimeHeal');
      runeAt(c, k, f, 180, '#7dff9b', 900, 0.85);
      glowAt(c, k, f.x, f.y - 6, 120, 500, k.FLOOR_FX + 5);
      const col = c.scene.add.image(f.x, f.y + 4, healColumnTex(c, k)).setOrigin(0.5, 1).setDisplaySize(spriteW(t) * 1.1, t.h * 1.3).setDepth(k.DEPTH + 10).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0);
      c.scene.tweens.add({ targets: col, alpha: 0.75, duration: k.slow(200), yoyo: true, hold: k.slow(320), onComplete: () => col.destroy() });
      const sprouts: Phaser.GameObjects.Image[] = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + 0.3;
        const sx = f.x + Math.cos(ang) * spriteW(t) * 0.55;
        const sy = f.y + Math.sin(ang) * 14;
        const sp = k.v2Sprite(c, 'sprout', '#7dff9b', sx, sy + 2, 40, sy + (Math.sin(ang) > 0 ? t.container.depth + 1 : t.container.depth - 1)).setOrigin(0.5, 1);
        if (Math.cos(ang) < 0) sp.setFlipX(true);
        const s0 = sp.scaleY;
        sp.setScale(sp.scaleX, s0 * 0.05);
        c.scene.tweens.add({ targets: sp, scaleY: s0, duration: k.slow(220), delay: k.slow(i * 30), ease: 'Back.easeOut' });
        sprouts.push(sp);
      }
      // yaprak sarmalı gövdeyi sarar
      for (let i = 0; i < 12; i++) {
        void k.wait(c.scene, k.slow(i * 28)).then(() => {
          const leaf = k.v2Sprite(c, 'oakleaf', '#7dff9b', f.x, f.y - 6, 22, k.DEPTH + 35);
          const ph = (i / 12) * Math.PI * 2;
          void k.counter(c.scene, k.slow(700), (u) => {
            const ang = ph + u * Math.PI * 3;
            const r = spriteW(t) * (0.5 - 0.15 * u);
            leaf.setPosition(k.snap(f.x + Math.cos(ang) * r), k.snap(f.y - 6 - u * t.h * 1.0)).setRotation(ang).setAlpha(1 - u * u);
            leaf.setDepth(Math.sin(ang) > 0 ? t.container.depth + 2 : t.container.depth - 1);
            if (u >= 1) leaf.destroy();
          });
        });
      }
      void k.ring(c.scene, t.container.x, t.container.y - 4, { r: 90, flat: 0.32, n: 20, colors: HEAL, dur: 460, size: 8 });
      c.sfx('leafRustle');
      await k.wait(c.scene, k.slow(220));
      // iyileşme-zaman-içinde: çiçekler açar, polen saçar, sonra solar
      const blossoms: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < 4; i++) {
        const sp = sprouts[(i * 2 + 1) % sprouts.length]!;
        const b = k.v2Sprite(c, 'blossom', '#ffd6f0', sp.x, sp.y - 34, 20, sp.depth + 0.5).setAlpha(0);
        c.scene.tweens.add({ targets: b, alpha: 1, duration: k.slow(160), delay: k.slow(i * 60) });
        k.grow(c.scene, b, 0.2, 1, 260, 'Back.easeOut');
        blossoms.push(b);
      }
      const pollen = c.scene.time.addEvent({
        delay: k.slow(120),
        repeat: 8,
        callback: () => {
          const b = blossoms[Math.floor(Math.random() * blossoms.length)]!;
          k.burst(c.scene, b.x, b.y, { colors: ['#fff0a0', '#e8ffe0', '#a8f08a'], n: 1, speed: [10, 40], angle: [-Math.PI * 0.8, -Math.PI * 0.2], gravity: -50, life: [500, 800], size: [4, 7] });
        },
      });
      void k.wait(c.scene, k.slow(1100)).then(() => {
        pollen.remove();
        c.scene.tweens.add({ targets: [...sprouts, ...blossoms], alpha: 0, scaleY: '*=0.3', duration: k.slow(360), onComplete: () => [...sprouts, ...blossoms].forEach((s) => s.destroy()) });
      });
      void body;
    }),
  );
  a.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------- SUMMON TREANT

/**
 * Summon Treant (kendine; çağrı 3 tur): Druid asasını kaldırır, ayağında meşe mührü döner; avucundan bir palamut kavisle Treant'ın doğacağı
 * yuvaya (skillUsed.slot) uçar ve toprağa gömülür (toz, ilk filiz), oradan zemin altında kök sırtları druid'e doğru uzanır ve yuvada büyük
 * meşe mührü açılır: ağaç orada yükselecek. Verdant Blessing (pasif: çağırınca tüm dostlar iyileşir): dostların üstüne yeşil yaprak süzülür.
 * Ardından oyunun Treant doğuş efekti (kökler, topraktan yükseliş) gelir.
 */
const summonroots: V2Vfx = async (c, k) => {
  const a = c.actor;
  const { used } = useEvents(c);
  c.sfx('woodCreak');
  a.play('cast');
  const f = k.feet(a);
  runeAt(c, k, f, 200, '#7ed957', 800);
  const st = staffTop(a);
  glowAt(c, k, st.x, st.y, 100, 520);
  k.burst(c.scene, st.x, st.y, { colors: LEAF, n: 8, speed: [30, 140], gravity: -40, life: [400, 800], size: [6, 10] });
  await k.wait(c.scene, k.slow(200));
  const slot = used?.['slot'];
  const side = a.combatant.side === 'party' ? 'party' : 'enemy';
  const target = typeof slot === 'number' ? k.cellMid(side, slot) : { x: a.container.x + facing(a) * 140, y: a.container.y - 4 };
  const h = leafHand(a);
  const acorn = k.v2Sprite(c, 'acorn', '#8c5a2b', h.x, h.y, 34, k.DEPTH + 40);
  await k.travel(c.scene, acorn, { x: target.x, y: target.y - 6 }, 360, { arc: 120, spin: 1.5, trail: (x, y) => k.burst(c.scene, x, y, { colors: LEAF, n: 1, speed: [5, 40], gravity: -30, life: [260, 460], size: [5, 8] }), trailEvery: 32 });
  acorn.destroy();
  c.sfx('rootsRumble');
  soilBurst(c, k, target, 0.8);
  runeAt(c, k, target, 230, '#7ed957', 900);
  const shoot = erupt(c, k, 'sprout', '#7ed957', target.x, target.y, 36, 46, 0, 700);
  void shoot;
  k.shake(c.scene, 160, 0.004);
  // kök sırtları druid'den yuvaya (iki iplik)
  const r1 = rootRidge(c, k, { x: f.x + facing(a) * 20, y: f.y }, target, 300, 10);
  const r2 = rootRidge(c, k, { x: f.x + facing(a) * 10, y: f.y + 8 }, { x: target.x, y: target.y + 10 }, 340, 8);
  // Verdant Blessing: dostların üstüne yaprak
  const allies = [...(sceneOf(c).views?.values() ?? [])].filter((v) => v.combatant.side === a.combatant.side && v.combatant.hp > 0 && v !== a);
  for (const v of [a, ...allies].slice(0, 12)) {
    for (let i = 0; i < 2; i++) {
      const lx = v.container.x + k.rnd(-30, 30);
      const leaf = k.v2Sprite(c, 'oakleaf', '#7dff9b', lx, v.container.y - v.h - 40, 20, k.DEPTH + 42).setAlpha(0).setRotation(k.rnd(0, 6));
      c.scene.tweens.add({ targets: leaf, alpha: 1, duration: k.slow(120), delay: k.slow(200 + i * 120) });
      c.scene.tweens.add({ targets: leaf, y: v.container.y - v.h * 0.4, x: lx + k.rnd(-30, 30), rotation: leaf.rotation + k.rnd(-3, 3), delay: k.slow(200 + i * 120), duration: k.slow(800), ease: 'Sine.easeInOut', onComplete: () => c.scene.tweens.add({ targets: leaf, alpha: 0, duration: k.slow(200), onComplete: () => leaf.destroy() }) });
    }
  }
  await Promise.all([r1.done, r2.done]);
  r1.fade(400);
  r2.fade(400);
  await k.wait(c.scene, k.slow(160));
  a.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------- TREANT

/** Treant'ın gövdesi ileri eğilip kolunu yere gömer (hazırlık); kolun toprağa girdiği nokta. */
async function treantSlam(c: VfxCtx, k: VfxKit, squat = 0.92): Promise<Pt> {
  const a = c.actor;
  const dir = facing(a);
  a.play('attack');
  c.sfx('woodCreak');
  // gerinme: gövde yükselir, tepeden kuru yaprak dökülür
  await new Promise<void>((r) => c.scene.tweens.add({ targets: a.container, scaleY: 1.06, scaleX: 0.97, duration: k.slow(150), ease: 'Quad.easeOut', onComplete: () => r() }));
  leafSpray(c, k, { x: a.container.x, y: a.container.y - a.h * 0.92 }, 3, { dry: true, spread: 60, up: 20, size: 22 });
  // çöküş: kol yere iner
  await new Promise<void>((r) => c.scene.tweens.add({ targets: a.container, scaleY: squat, scaleX: 1.05, y: a.container.y + 6, duration: k.slow(110), ease: 'Quad.easeIn', onComplete: () => r() }));
  c.scene.tweens.add({ targets: a.container, scaleY: 1, scaleX: 1, y: a.container.y - 6, duration: k.slow(220), delay: k.slow(80), ease: 'Quad.easeOut' });
  const slam = { x: a.container.x + dir * spriteW(a) * 0.45, y: a.container.y - 4 };
  k.cracks(c.scene, slam.x, slam.y, { len: 100, n: 6, dur: 600 });
  soilBurst(c, k, slam, 0.8);
  k.shake(c.scene, 120, 0.005);
  return slam;
}

/**
 * Treant - Root Smash (tek hedef, fiziksel): Treant gerinir ve kolunu toprağa gömer; kök toprağın altından hedefe doğru sırt kabartarak
 * koşar, hedefin altında yer kabarır ve dev, yosunlu ahşap yumruk yerden YUKARI fırlayıp hedefe aparkat atar (hedef havalanır: vuruş anı),
 * sonra yumruk hedefi yere geri çakar (toprak, kıymık, yaprak, sarsıntı) ve toprağa çekilir.
 */
const rootfall: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const dir = t.container.x >= a.container.x ? 1 : -1;
  const slam = await treantSlam(c, k);
  const f = k.feet(t);
  const ridge = rootRidge(c, k, slam, { x: f.x - dir * 10, y: f.y }, 260, 14);
  c.sfx('rootsRumble');
  await ridge.done;
  ridge.fade(500);
  // yer kabarır
  const bulge = c.scene.add.ellipse(f.x, f.y, 30, 10, 0x2a1a0e, 0.7).setDepth(k.FLOOR_FX + 3);
  c.scene.tweens.add({ targets: bulge, scaleX: 4, scaleY: 3, duration: k.slow(80), ease: 'Quad.easeOut' });
  k.burst(c.scene, f.x, f.y - 2, { colors: SOIL, n: 6, speed: [40, 140], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 600, life: [200, 400], size: [6, 10] });
  await k.wait(c.scene, k.slow(80));
  // yumruk yerden fırlar: aparkat
  const size = Math.max(110, Math.min(200, Math.round((t.h * 0.75) / 8) * 8));
  const fist = k.v2Sprite(c, 'rootfist', '#8a6a3a', f.x, f.y + 6, size, t.container.depth + 2).setOrigin(0.5, 1);
  fist.setDisplaySize(size, size);
  const fs = fist.scaleY;
  fist.setScale(fist.scaleX, fs * 0.05);
  c.sfx('woodSmash');
  c.scene.tweens.add({ targets: fist, scaleY: fs * 1.08, duration: k.slow(110), ease: 'Back.easeOut' });
  c.scene.tweens.add({ targets: t.container, y: t.container.y - 46, duration: k.slow(120), ease: 'Quad.easeOut', yoyo: true, hold: k.slow(60) });
  await k.wait(c.scene, k.slow(70));
  const p = k.spot(t);
  k.hit(c.scene, p.x, p.y + t.h * 0.2, BARK, 1.4);
  soilBurst(c, k, f, 1.3);
  for (let i = 0; i < 6; i++) {
    const sp = k.v2Sprite(c, i % 2 ? 'dryleaf' : 'oakleaf', '#62d04b', f.x, f.y - size * 0.6, 22, k.DEPTH + 45).setRotation(k.rnd(0, 6));
    c.scene.tweens.add({ targets: sp, x: f.x + k.rnd(-150, 150), y: f.y - size * 0.6 - k.rnd(40, 140), rotation: sp.rotation + k.rnd(-5, 5), alpha: 0, duration: k.slow(700), ease: 'Quad.easeOut', onComplete: () => sp.destroy() });
  }
  k.shake(c.scene, 140, 0.007);
  // geri çakma ve toprağa çekilme
  void k.wait(c.scene, k.slow(180)).then(() => {
    c.sfx('leafRustle');
    c.scene.tweens.add({ targets: t.container, scaleY: 0.9, scaleX: 1.06, duration: k.slow(70), yoyo: true });
    k.dustCloud(c.scene, f.x, f.y, { n: 6, spread: 90, rise: 40, size: [30, 54], tint: 0x8a6a3a });
    k.cracks(c.scene, f.x, f.y, { len: 130, n: 8, dur: 700 });
    c.scene.tweens.add({ targets: fist, scaleY: fs * 0.05, alpha: 0.4, delay: k.slow(120), duration: k.slow(260), ease: 'Quad.easeIn', onComplete: () => fist.destroy() });
    c.scene.tweens.add({ targets: bulge, alpha: 0, delay: k.slow(200), duration: k.slow(400), onComplete: () => bulge.destroy() });
  });
  a.play('idle');
};

/**
 * Treant - Vine Snare (rect 2x2; büyü hasarı + %25 Stun "Rooted"): Treant kök parmaklarını toprağa gömer; kökler zeminin altından alanın her
 * hücresine koşar (sırtlar), her hücrede kalın kök uçları kamçı gibi fırlar, oradaki düşmanların bacaklarını kalın kök halkaları sarıp sıkar
 * (hasar anı). Yere bağlanan (stun, cause 'vines') düşmanda halka daha sıkı ve yapraklıdır; oyunun "Rooted" sarması stun boyunca kalır.
 */
const vinesnare: V2Vfx = (c, k) =>
  k.playUntilHit(async (hit) => {
    const a = c.actor;
    const { after } = useEvents(c);
    const slots = c.slots?.length ? c.slots : c.targets.map((t) => t.combatant.slot);
    const slam = await treantSlam(c, k, 0.9);
    c.sfx('vineLash');
    const arrivals = slots.map(async (slot) => {
      const to = k.cellMid(c.board, slot);
      const dist = Math.hypot(to.x - slam.x, to.y - slam.y);
      const rr = rootRidge(c, k, slam, to, Math.max(170, dist / 2.8), 11);
      await rr.done;
      rr.fade(400);
      const q = k.quadOf(c.board, slot, 0.85);
      for (let i = 0; i < 3; i++) {
        const p = k.inQuad(q, 0.8);
        erupt(c, k, 'rootspike', '#8bd06a', k.snap(p.x), k.snap(p.y), 44, k.rnd(80, 120), i * 30, 620 + i * 40, k.rnd(-0.4, 0.4));
      }
      const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1);
      k.fillCells(g, c.board, [slot], { fill: 0x3a2412, fillA: 0.45, edge: 0x8c5a2b, edgeA: 0.7, edgeW: 3, k: 0.86 });
      c.scene.tweens.add({ targets: g, alpha: 0, delay: k.slow(600), duration: k.slow(500), onComplete: () => g.destroy() });
      soilBurst(c, k, to, 0.6);
      for (const t of c.targets.filter((u) => u.combatant.slot === slot)) {
        const rooted = after.some((e) => e['type'] === 'status' && e['status'] === 'stun' && e['cause'] === 'vines' && e['target'] === t.combatant.uid);
        rootCoil(c, k, t, rooted ? 620 : 380, rooted);
        c.scene.tweens.add({ targets: t.container, y: t.container.y + 6, duration: k.slow(80), yoyo: true, hold: k.slow(120) });
      }
    });
    await Promise.all(arrivals);
    c.sfx('rootGrip');
    k.shake(c.scene, 110, 0.004);
    await k.wait(c.scene, k.slow(150)); // halkalar sıkar: hasar rakamları o an
    hit();
    a.play('idle');
    await k.wait(c.scene, k.slow(500));
  });

export const VFX: Record<string, V2Vfx> = {
  thornwhip,
  vines,
  rejuvenate,
  summonroots,
  rootfall,
  vinesnare,
};
