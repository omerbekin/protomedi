/**
 * Undead - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Görsel dil (assets/sprites/undead/idle.png): lich'in avucundaki TURKUAZ ruh ateşi + asasındaki turkuaz kristal + mezar moru +
 * kemik. Skeleton (çağrı): paslı kısa kılıç ve ahşap kalkan; vuruşları paslı demir (gri-kahve iz, pas pulu), "ölü ışığı" değil.
 * Vampiric Bite (pasif, lifesteal): Undead (ya da onun Skeleton'u) hasar verip GERÇEKTEN iyileştiyse, vurulan hedeften Undead'e turkuaz ruh
 * akar; Dark Bond kuruluysa akış Undead'den bağlı dosta kan-kırmızısı ruh olarak devam eder (motor olaylarından okunur: battle.log).
 *
 * Bu class'ın skill'leri -> VFX anahtarları:
 *   bone_throw (Bone Throw) -> 'bonethrow'
 *   wail_of_the_dead (Wail of the Dead) -> 'wail'
 *   dark_bond (Dark Bond) -> 'guardlink'
 *   raise_dead (Raise Dead) -> 'raise'
 *   skeleton_strike (Bone Strike) -> 'bonestrike'
 *   skeleton_slash (Bone Slash) -> 'boneslash'
 * Phaser'ı ve ../../vfx'i ÇALIŞMA ZAMANINDA içe aktarma (yalnızca import type); her şey k üzerinden gelir.
 */
import type Phaser from 'phaser';
import type { CombatantView } from '../../combatant-view';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { V2Vfx } from '../types';

type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------------------------------------------- renkler

const SOUL = ['#e8fff8', '#8ff5dc', '#3fd6b4', '#1f8a78'];
const SOUL_HEX = '#3fd6b4';
const GRAVE = ['#c79bff', '#8a52c9', '#5a2a9c', '#2e1446'];
const BLOODSOUL = ['#ff9aa8', '#e5463b', '#8e1f2c', '#b0304f'];
const MIASMA = ['#9fe36a', '#62b04b', '#5a7a3a', '#8a52c9'];
const RUST = ['#d7d0bf', '#a8a294', '#8c5a2b', '#6b4423'];
const BONEDUST = 0xd9d4c0;

// ---------------------------------------------------------------------------------------------------------------- ortak yardımcılar

/** Sahnenin motor/görünüm alanlarına güvenli erişim (yalnızca okuma; yoksa boş). */
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

const viewOf = (c: VfxCtx, uid: unknown): CombatantView | undefined => (typeof uid === 'string' ? sceneOf(c).views?.get(uid) : undefined);

/** Kullanıcının baktığı yön (oyuncu sağa, düşman sola). */
const facing = (v: CombatantView): number => (v.combatant.side === 'party' ? 1 : -1);
/** Sprite'ın ekrandaki genişliği (birim kutusu w daha geniş olabilir). */
const spriteW = (v: CombatantView): number => Math.abs(v.sprite.displayWidth * v.container.scaleX) || v.w * 0.6;
/** Lich'in ruh ateşli avucu (sprite'ta öndeki el: idle.png'de genişliğin ~%40'ı önde, boyun ~2/3'ü). */
const handOf = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * spriteW(v) * 0.4, y: v.container.y - v.h * 0.64 });
/** Lich asasının kristali (arkadaki el, tepede). */
const staffOf = (v: CombatantView): Pt => ({ x: v.container.x - facing(v) * spriteW(v) * 0.4, y: v.container.y - v.h * 0.92 });
/** Göğüs (bağ / ruh çıkışı). */
const chestOf = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.05, y: v.container.y - v.h * 0.62 });

/** Yumuşak turkuaz ruh ışıması dokusu (ADD karışımıyla). */
const soulGlowTex = (c: VfxCtx, k: VfxKit): string =>
  k.softTexture(c.scene, 'v2undead:soulglow', 48, 48, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 24) / 24);
    if (d >= 1) return null;
    return { c: d < 0.25 ? '#e8fff8' : d < 0.55 ? '#8ff5dc' : '#3fd6b4', a: (1 - d) ** 1.4 };
  });

/** Yumuşak zehir/ölü pusu dokusu (yere yatık). */
const miasmaTex = (c: VfxCtx, k: VfxKit): string =>
  k.softTexture(c.scene, 'v2undead:miasma', 48, 24, (x, y) => {
    const d = Math.hypot((x + 0.5 - 24) / 24, (y + 0.5 - 12) / 12);
    if (d >= 1) return null;
    return { c: d < 0.4 ? '#b6f07a' : d < 0.75 ? '#6fae4a' : '#6b3a8c', a: (1 - d) ** 1.1 * 0.9 };
  });

/** Bir noktada kısa ADD ışıması. */
function glowAt(c: VfxCtx, k: VfxKit, x: number, y: number, size: number, life: number, depth = k.DEPTH + 30, tint?: number): Phaser.GameObjects.Image {
  const img = c.scene.add.image(x, y, soulGlowTex(c, k)).setDisplaySize(size, size).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
  if (tint !== undefined) img.setTint(tint);
  c.scene.tweens.add({ targets: img, alpha: 0, scaleX: img.scaleX * 1.4, scaleY: img.scaleY * 1.4, duration: k.slow(life), ease: 'Quad.easeOut', onComplete: () => img.destroy() });
  return img;
}

/** Lich'in avucunda ruh ateşi kabarır (hazırlık); ateş sprite'ını döndürür (çağıran söndürür). */
function handFlare(c: VfxCtx, k: VfxKit, size = 84, hold = 260): Phaser.GameObjects.Image {
  const h = handOf(c.actor);
  const fl = k.v2Sprite(c, 'soulflame', SOUL_HEX, h.x, h.y - size * 0.22, size, k.DEPTH + 32).setAlpha(0);
  k.grow(c.scene, fl, 0.3, 1, 200, 'Back.easeOut', { alpha: 1 });
  c.scene.tweens.add({ targets: fl, angle: { from: -6, to: 6 }, duration: k.slow(90), yoyo: true, repeat: 2 });
  glowAt(c, k, h.x, h.y - 10, size * 1.6, hold + 200);
  k.burst(c.scene, h.x, h.y - 10, { colors: SOUL, n: 6, speed: [20, 90], angle: [-Math.PI, 0], gravity: -160, life: [300, 600], size: [6, 10] });
  return fl;
}

/** İki nokta arasında kavisli yol (arc = yukarı kavis). */
const arcPt = (a: Pt, b: Pt, u: number, arc: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * arc });

/**
 * Ruh akışı: `from`dan `to`ya kavisli yolda akan ruh kıvılcımları (lifesteal). Promise ilk kıvılcım varınca çözülür; `tint` kan kırmızısı (bağ).
 */
async function soulStream(c: VfxCtx, k: VfxKit, from: Pt, to: Pt, o: { n?: number; arc?: number; dur?: number; colors?: string[]; hex?: string; size?: number } = {}): Promise<void> {
  const n = o.n ?? 5;
  const dur = o.dur ?? 460;
  const arrivals: Array<Promise<void>> = [];
  for (let i = 0; i < n; i++) {
    const delay = i * 55;
    arrivals.push(
      k.wait(c.scene, k.slow(delay)).then(async () => {
        const m = k.v2Sprite(c, 'soulmote', o.hex ?? SOUL_HEX, from.x + k.rnd(-12, 12), from.y + k.rnd(-14, 14), (o.size ?? 34) * k.rnd(0.75, 1.15), k.DEPTH + 36);
        const arc = (o.arc ?? 90) * k.rnd(0.7, 1.3);
        const start = { x: m.x, y: m.y };
        let next = 0;
        await k.counter(
          c.scene,
          k.slow(dur * k.rnd(0.9, 1.1)),
          (u) => {
            const p = arcPt(start, to, u, arc);
            m.setPosition(k.snap(p.x + Math.sin(u * 9 + i) * 8 * (1 - u)), k.snap(p.y)).setAlpha(0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
            if (u * 1000 > next) {
              next += 80;
              k.burst(c.scene, m.x, m.y, { colors: o.colors ?? SOUL, n: 1, speed: [5, 40], gravity: -30, life: [200, 380], size: [5, 8] });
            }
          },
          'Sine.easeInOut',
        );
        m.destroy();
      }),
    );
  }
  await arrivals[0];
  void Promise.all(arrivals);
}

/**
 * Vampiric Bite (pasif): bu kullanımda Undead gerçekten can çaldıysa vurulanlardan Undead'e turkuaz ruh akar, Undead turkuaz parlar;
 * Dark Bond şifası da varsa akış Undead'den bağlı dosta kırmızı ruh olarak sürer. Arka planda oynar (beklenmez).
 */
function vampiricEcho(c: VfxCtx, k: VfxKit, victims: CombatantView[]): void {
  const { after } = useEvents(c);
  const heals = after.filter((e) => e['type'] === 'heal' && e['source'] === e['target'] && !e['cause']);
  const drainHeal = heals.find((e) => viewOf(c, e['target'])?.combatant.passive?.effect.type === 'soulDrain');
  if (!drainHeal) return;
  const drainer = viewOf(c, drainHeal['target']);
  if (!drainer || !victims.length) return;
  const bond = after.find((e) => e['type'] === 'heal' && e['cause'] === 'dark_bond' && e['source'] === drainer.combatant.uid);
  const partner = bond ? viewOf(c, bond['target']) : undefined;
  void (async () => {
    await k.wait(c.scene, k.slow(140));
    c.sfx('soulDrain');
    const to = chestOf(drainer);
    const streams = victims.map((v) => soulStream(c, k, k.spot(v), to, { n: 4, arc: 110 + k.rnd(-20, 30), dur: 520 }));
    await Promise.race(streams);
    await k.wait(c.scene, k.slow(160));
    glowAt(c, k, to.x, to.y, 150, 520, k.DEPTH + 20);
    void k.ring(c.scene, drainer.container.x, drainer.container.y - 4, { r: 90, flat: 0.32, n: 18, colors: SOUL, dur: 420, size: 8 });
    if (partner) {
      await k.wait(c.scene, k.slow(120));
      await soulStream(c, k, to, chestOf(partner), { n: 4, arc: 70, dur: 440, colors: BLOODSOUL, hex: '#e5463b', size: 30 });
      glowAt(c, k, chestOf(partner).x, chestOf(partner).y, 130, 480, k.DEPTH + 20, 0xff6a7a);
      const hrt = k.v2Sprite(c, 'bondheart', '#b0304f', partner.container.x, partner.container.y - partner.h - 30, 44, k.DEPTH + 60);
      k.grow(c.scene, hrt, 0.4, 1.1, 200, 'Back.easeOut');
      c.scene.tweens.add({ targets: hrt, alpha: 0, y: hrt.y - 30, delay: k.slow(380), duration: k.slow(360), onComplete: () => hrt.destroy() });
    }
  })();
}

/** Kemik kıymıkları saçılır (Bone Throw parçalanması). */
function boneShatter(c: VfxCtx, k: VfxKit, p: Pt, dir: number, n = 7): void {
  for (let i = 0; i < n; i++) {
    const sp = k.v2Sprite(c, 'bonechip', '#d9d4c0', p.x, p.y, k.rnd(22, 38), k.DEPTH + 45).setRotation(k.rnd(0, 6));
    const tx = p.x + dir * k.rnd(-30, 140) + k.rnd(-40, 40);
    c.scene.tweens.add({ targets: sp, x: tx, rotation: sp.rotation + k.rnd(-6, 6), duration: k.slow(k.rnd(420, 640)), ease: 'Cubic.easeOut' });
    c.scene.tweens.add({
      targets: sp,
      y: p.y - k.rnd(30, 90),
      duration: k.slow(170),
      ease: 'Quad.easeOut',
      onComplete: () => c.scene.tweens.add({ targets: sp, y: p.y + k.rnd(60, 130), alpha: 0, duration: k.slow(360), ease: 'Quad.easeIn', onComplete: () => sp.destroy() }),
    });
  }
  k.dustCloud(c.scene, p.x, p.y + 10, { n: 4, spread: 50, rise: 30, size: [26, 46], tint: BONEDUST, life: 600 });
}

/** Slow (Bone Throw): yerden iki iskelet eli çıkar, hedefin bileklerini kavrar; ayakları turkuaz-gri ağır pus sarar, hedef bir an çöker. */
function graveGrip(c: VfxCtx, k: VfxKit, t: CombatantView): void {
  const f = k.feet(t);
  c.sfx('graveGrip');
  k.cracks(c.scene, f.x, f.y, { len: 70, n: 6, dur: 700 });
  k.burst(c.scene, f.x, f.y - 4, { colors: ['#4a2e1a', '#6b4423', '#5b6579'], n: 8, speed: [60, 200], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 700, life: [300, 600], size: [8, 14] });
  const hands: Phaser.GameObjects.Image[] = [];
  for (const dx of [-t.w * 0.22, t.w * 0.2]) {
    const h = k.v2Sprite(c, 'gravehand', '#d9d4c0', f.x + dx, f.y + 10, 104, t.container.depth + 1).setRotation(dx < 0 ? 0.35 : -0.35);
    k.sprout(c.scene, h, 220);
    hands.push(h);
  }
  // kavrama: eller içe kapanır, hedef çöker
  void k.wait(c.scene, k.slow(230)).then(() => {
    for (const h of hands) c.scene.tweens.add({ targets: h, rotation: h.rotation * -0.6, scaleX: h.scaleX * 0.85, duration: k.slow(90), ease: 'Quad.easeIn' });
    c.scene.tweens.add({ targets: t.container, scaleY: 0.94, duration: k.slow(90), yoyo: true, hold: k.slow(160) });
  });
  // ağır ölü pusu ayaklarda
  const mist = c.scene.add.image(f.x, f.y - 6, soulGlowTex(c, k)).setDisplaySize(t.w * 1.6, 44).setTint(0x7fb2c8).setAlpha(0).setDepth(t.container.depth + 2);
  c.scene.tweens.add({ targets: mist, alpha: 0.75, duration: k.slow(200), yoyo: true, hold: k.slow(600), onComplete: () => mist.destroy() });
  // yavaşlama: hedefin silik "geride kalan" izleri
  for (let i = 1; i <= 3; i++) void k.wait(c.scene, k.slow(240 + i * 90)).then(() => t.afterimage(0x7fb2ff, 0.32 - i * 0.07, 520));
  c.scene.tweens.add({ targets: hands, scaleY: 0.02, alpha: 0, delay: k.slow(820), duration: k.slow(300), ease: 'Quad.easeIn', onComplete: () => hands.forEach((h) => h.destroy()) });
}

// ---------------------------------------------------------------------------------------------------------------- BONE THROW

/**
 * Bone Throw (tek hedef, fiziksel + Slow 2 tur): lich'in avucunda turkuaz ruh ateşi kabarır, kemik kıymıkları avuca toplanıp bir femur olur;
 * femur ruh alevine sarılı, dönerek kavisle hedefe uçar (turkuaz iz + mor duman). Çarpınca kemik paramparça olur (kıymıklar, kemik tozu).
 * Slow tuttuysa yerden iki iskelet eli çıkıp hedefin bileklerini kavrar (ağır pus, geride kalan silik izler). Vampiric Bite: can çalındıysa
 * hedeften lich'e turkuaz ruh akar.
 */
const bonethrow: V2Vfx = async (c, k) => {
  const a = c.actor;
  const dir = facing(a);
  a.play('attack');
  const fl = handFlare(c, k, 52, 240);
  const h = handOf(a);
  // kıymıklar avuca toplanır
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const sp = k.v2Sprite(c, 'bonechip', '#d9d4c0', h.x + Math.cos(ang) * 70, h.y - 20 + Math.sin(ang) * 50, 22, k.DEPTH + 34).setRotation(ang);
    void k.travel(c.scene, sp, { x: h.x, y: h.y - 18 }, 200, { ease: 'in', spin: 1 }).then(() => sp.destroy());
  }
  await k.wait(c.scene, k.slow(210));
  const { after } = useEvents(c);
  await Promise.all(
    c.targets.map(async (t) => {
      const p = k.spot(t);
      const start = { x: h.x + dir * 10, y: h.y - 20 };
      const bone = k.v2Sprite(c, 'femur', '#d9d4c0', start.x, start.y, 76, k.DEPTH + 40);
      const glow = c.scene.add.image(start.x, start.y, soulGlowTex(c, k)).setDisplaySize(120, 120).setDepth(k.DEPTH + 39).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0.8);
      c.sfx('boneSpin');
      fl.setAlpha(0.5);
      c.scene.tweens.add({ targets: a.container, x: a.container.x + dir * 12, duration: k.slow(70), yoyo: true });
      await k.travel(c.scene, bone, p, 360, {
        spin: 3,
        arc: 80,
        trail: (x, y) => {
          glow.setPosition(x, y);
          k.burst(c.scene, x, y, { colors: SOUL, n: 2, speed: [10, 60], gravity: -60, life: [260, 460], size: [6, 10] });
          const pf = c.scene.add.image(x, y, soulGlowTex(c, k)).setDisplaySize(30, 30).setTint(0x5a2a9c).setAlpha(0.5).setDepth(k.DEPTH + 30);
          c.scene.tweens.add({ targets: pf, alpha: 0, displayWidth: 60, displayHeight: 60, duration: k.slow(360), onComplete: () => pf.destroy() });
        },
        trailEvery: 26,
      });
      bone.destroy();
      glow.destroy();
      // çarpma: kemik paramparça
      c.sfx('boneImpact');
      glowAt(c, k, p.x, p.y, 170, 300, k.DEPTH + 44);
      boneShatter(c, k, p, dir, 8);
      k.hit(c.scene, p.x, p.y, ['#fdfaf2', '#8ff5dc', '#d7dce6']);
      void k.ring(c.scene, p.x, p.y, { r: 80, flat: 0.85, n: 18, colors: SOUL, dur: 300, size: 8 });
      k.shake(c.scene, 110, 0.004);
      c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 12, duration: k.slow(50), yoyo: true });
      const slowed = after.some((e) => e['type'] === 'status' && e['status'] === 'slow' && e['target'] === t.combatant.uid);
      if (slowed) void k.wait(c.scene, k.slow(120)).then(() => graveGrip(c, k, t));
    }),
  );
  c.scene.tweens.add({ targets: fl, alpha: 0, duration: k.slow(200), onComplete: () => fl.destroy() });
  vampiricEcho(c, k, c.targets);
};

// ---------------------------------------------------------------------------------------------------------------- WAIL OF THE DEAD

/** Çığlığın bir hücreye çarpması: zeminde ses dalgası halkaları, ölü pusu (zehir zemini doğar), hayalet kafatasları yükselir, hedef titrer. */
function wailCell(c: VfxCtx, k: VfxKit, slot: number, victims: CombatantView[], power: number): void {
  const m = k.cellMid(c.board, slot);
  const q = k.quadOf(c.board, slot, 1);
  const cw = Math.abs(q[1]!.x - q[0]!.x) + Math.abs(q[3]!.x - q[0]!.x);
  // hücre plakası: mor ses-dalgası lekesi
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 1);
  k.fillCells(g, c.board, [slot], { fill: 0x3a1858, fillA: 0.45, edge: 0xb872ff, edgeA: 0.85, edgeW: 3, k: 0.94 });
  g.setAlpha(0);
  c.scene.tweens.add({ targets: g, alpha: 1, duration: k.slow(100), yoyo: true, hold: k.slow(300), onComplete: () => g.destroy() });
  for (let i = 0; i < 3; i++) void k.wait(c.scene, k.slow(i * 80)).then(() => k.ring(c.scene, m.x, m.y, { r: cw * 0.42 * power * (1 + i * 0.18), flat: 0.34, n: 22, colors: ['#e3ccff', '#b872ff', '#8a52c9'], dur: 460, size: 9, startR: 10 }));
  // zehir pusu (zemin doğar): yeşil-mor yassı bulut + kabarcıklar
  const mist = c.scene.add.image(m.x, m.y, miasmaTex(c, k)).setDisplaySize(cw * 0.9, cw * 0.32).setDepth(k.FLOOR_FX + 3).setAlpha(0);
  c.scene.tweens.add({ targets: mist, alpha: 0.85, displayWidth: cw * 1.05, displayHeight: cw * 0.38, duration: k.slow(260), ease: 'Quad.easeOut' });
  c.scene.tweens.add({ targets: mist, alpha: 0, delay: k.slow(900), duration: k.slow(500), onComplete: () => mist.destroy() });
  for (let i = 0; i < 6; i++) {
    const p = k.inQuad(q, 0.75);
    k.burst(c.scene, p.x, p.y, { colors: MIASMA, n: 1, speed: [20, 70], angle: [-Math.PI * 0.8, -Math.PI * 0.2], gravity: -120, life: [500, 900], size: [6, 10] });
  }
  // yükselen hayalet kafatası buharları
  for (let i = 0; i < 2; i++) {
    const s = k.v2Sprite(c, 'banshee', '#b36bff', m.x + k.rnd(-cw * 0.25, cw * 0.25), m.y - 20, 48, k.DEPTH + 38).setAlpha(0.7);
    c.scene.tweens.add({ targets: s, y: s.y - k.rnd(120, 180), alpha: 0, displayWidth: 30, displayHeight: 30, delay: k.slow(i * 110), duration: k.slow(900), ease: 'Sine.easeOut', onComplete: () => s.destroy() });
  }
  for (const t of victims) {
    c.scene.tweens.add({ targets: t.container, x: t.container.x + 6, duration: k.slow(28), yoyo: true, repeat: 4 });
    const p = k.spot(t);
    void k.ring(c.scene, p.x, p.y, { r: 70, flat: 0.95, n: 18, colors: ['#e3ccff', '#b872ff'], dur: 320, size: 7 });
    const fx = t.sprite.postFX?.addGlow(k.color('#9fe36a'), 6, 0, false, 0.1, 12);
    if (fx) c.scene.tweens.add({ targets: fx, outerStrength: 0, duration: k.slow(900), ease: 'Quad.easeIn', onComplete: () => t.sprite.postFX?.remove(fx) });
  }
}

/**
 * Wail of the Dead (plus, aşamalı distance; büyü hasarı + 2 tur zehir zemini; bedel: mevcut canın %20'si):
 * 1) Bedel: lich göğsünü pençeler, göğsünden kan-ruh damlaları kopup avucundaki ateşe akar (can bedeli), ateş mor-turkuaz kabarır.
 * 2) Ateş bir banshee'ye dönüşür, kavis çizerek MERKEZ hücrenin üstüne uçar, çığlık atar (yüzü titrer, ekran morarır).
 * 3) 1. aşama: merkez hücre (ses dalgası halkaları, ölü pusu = zehir zemini, yükselen hayalet kafatasları). 2. aşama: zeminde dalga
 *    dışa yayılır, artının dört koluna çarpar; ölülerin inlemesi. Vampiric Bite: çalınan can tüm vurulanlardan lich'e akar.
 */
const wail: V2Vfx = (c, k) =>
  k.playUntilHit(async (hit) => {
    const a = c.actor;
    const dir = facing(a);
    // 1) can bedeli
    c.sfx('lifeTithe');
    a.play('cast');
    const chest = chestOf(a);
    const hand = handOf(a);
    c.scene.tweens.add({ targets: a.container, scaleX: 0.95, scaleY: 1.03, duration: k.slow(80), yoyo: true, repeat: 1 });
    for (let i = 0; i < 6; i++) {
      const d = k.v2Sprite(c, 'soulmote', '#e5463b', chest.x + k.rnd(-14, 14), chest.y + k.rnd(-10, 14), k.rnd(20, 30), k.DEPTH + 36).setTint(0xff5a5a);
      void k.travel(c.scene, d, { x: hand.x, y: hand.y - 14 }, 230 + i * 25, { arc: 40, ease: 'in' }).then(() => d.destroy());
    }
    k.burst(c.scene, chest.x, chest.y, { colors: BLOODSOUL, n: 6, speed: [40, 140], gravity: 300, life: [300, 520], size: [6, 10] });
    await k.wait(c.scene, k.slow(130));
    const fl = handFlare(c, k, 64, 200);
    fl.setTint(0xd0a8ff);
    await k.wait(c.scene, k.slow(70));
    // 2) banshee uçar
    const stages = c.stages?.length ? c.stages : [{ slots: c.slots ?? [], cells: c.cells, targets: c.targets }];
    const midSlot = stages[0]?.slots[0] ?? c.center;
    const cell = midSlot !== undefined ? k.cellMid(c.board, midSlot) : (c.centerPos ?? k.feet(a));
    const ghost = k.v2Sprite(c, 'banshee', '#b36bff', hand.x, hand.y - 20, 150, k.DEPTH + 40);
    if (dir < 0) ghost.setFlipX(true);
    fl.destroy();
    c.sfx('ghostWail');
    await k.travel(c.scene, ghost, { x: cell.x, y: cell.y - 250 }, 340, {
      arc: 110,
      trail: (x, y) => {
        k.burst(c.scene, x, y, { colors: GRAVE, n: 2, speed: [10, 70], gravity: -40, life: [300, 560], size: [8, 14] });
        const pf = c.scene.add.image(x, y, soulGlowTex(c, k)).setDisplaySize(50, 50).setTint(0x8a52c9).setAlpha(0.45).setDepth(k.DEPTH + 30);
        c.scene.tweens.add({ targets: pf, alpha: 0, displayWidth: 90, displayHeight: 90, duration: k.slow(420), onComplete: () => pf.destroy() });
      },
      trailEvery: 30,
    });
    // çığlık: banshee şişer, titrer, dağılır
    c.scene.tweens.add({ targets: ghost, x: ghost.x + 6, duration: k.slow(26), yoyo: true, repeat: 7 });
    c.scene.tweens.add({ targets: ghost, displayWidth: 240, displayHeight: 240, alpha: 0, delay: k.slow(240), duration: k.slow(480), onComplete: () => ghost.destroy() });
    k.flash(c.scene, '#3a1858', 0.32, 460);
    k.shake(c.scene, 240, 0.005);
    // ağızdan aşağı inen çığlık konisi (ses dalgası halkaları gökten yere)
    for (let i = 0; i < 4; i++) void k.wait(c.scene, k.slow(i * 50)).then(() => k.ring(c.scene, cell.x, cell.y - 200 + i * 48, { r: 40 + i * 24, flat: 0.4, n: 18, colors: ['#e3ccff', '#b872ff'], dur: 260, size: 7 }));
    await k.wait(c.scene, k.slow(90));
    const R = Math.abs(k.cellMid(c.board, 3).x - k.cellMid(c.board, 0).x) || 140;
    for (const [si, st] of stages.entries()) {
      if (si > 0) {
        const reach = Math.max(...st.slots.map((s) => Math.hypot(k.cellMid(c.board, s).x - cell.x, k.cellMid(c.board, s).y - cell.y)), R);
        const dur = 280;
        void k.ring(c.scene, cell.x, cell.y, { r: reach * 1.08, flat: 0.34, n: 46, colors: ['#e3ccff', '#b872ff', '#8a52c9'], dur, size: 11, startR: R * 0.4 });
        void k.ring(c.scene, cell.x, cell.y - 26, { r: reach, flat: 0.45, n: 30, colors: MIASMA, dur: dur + 60, size: 7, startR: R * 0.3 });
        if (si === 1) c.sfx('graveMoan');
        await k.wait(c.scene, k.slow(dur * 0.8));
      }
      for (const s of st.slots) wailCell(c, k, s, st.targets.filter((t) => t.combatant.slot === s), si === 0 ? 1.2 : 1);
      await k.wait(c.scene, k.slow(60));
      c.releaseStage(si);
      if (si === 0) hit();
      if (si < stages.length - 1) await k.wait(c.scene, k.slow(180));
    }
    a.play('idle');
    vampiricEcho(c, k, stages.flatMap((s) => s.targets));
    await k.wait(c.scene, k.slow(400));
  });

// ---------------------------------------------------------------------------------------------------------------- DARK BOND

/**
 * Dark Bond (tek dost, kendisi hariç; 3 tur bağ; YARIM TUR): lich alçak sesle büyü mırıldanır, göğsünden dostunun göğsüne omur
 * boncuklarından bir kemik zincir uzanır (halkalar tek tek takılır), bağ mühürlenince iki göğüste kan-ruh kalbi atar ve zincir boyunca iki
 * kalp atışı akar (lifesteal'ın paylaşılacağı yol). Yarım tur: lich'in başının üstünde kum saati belirir, kumun YARISI akar ve saat söner.
 */
const guardlink: V2Vfx = (c, k) =>
  k.playUntilHit(async (hit) => {
    const a = c.actor;
    const { used } = useEvents(c);
    const turnCost = typeof used?.['turnCost'] === 'number' ? (used['turnCost'] as number) : 1;
    c.sfx('darkChant');
    a.play('cast');
    const fl = handFlare(c, k, 50, 300);
    fl.setTint(0xff8a9a);
    await k.wait(c.scene, k.slow(200));
    for (const t of c.targets) {
      const from = chestOf(a);
      const to = chestOf(t);
      // 1) kemik zincir: omur boncukları sırayla takılır
      c.sfx('chainTether');
      const n = Math.max(6, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 34));
      const sag = 40;
      const beads: Phaser.GameObjects.Image[] = [];
      const thread = c.scene.add.graphics().setDepth(k.DEPTH + 33);
      const drawThread = (upto: number, pulse: number) => {
        thread.clear();
        for (let i = 0; i <= 40 * upto; i++) {
          const u = i / 40;
          const p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * sag };
          const hot = pulse >= 0 && Math.abs(u - pulse) < 0.08;
          thread.fillStyle(hot ? 0xff9aa8 : 0x8e1f2c, hot ? 1 : 0.85).fillRect(k.snap(p.x) - (hot ? 4 : 2), k.snap(p.y) - (hot ? 4 : 2), hot ? 8 : 4, hot ? 8 : 4);
        }
      };
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * sag };
        const b = k.v2Sprite(c, 'vertebra', '#d9d4c0', p.x, p.y, 40, k.DEPTH + 34).setRotation(Math.atan2(to.y - from.y, to.x - from.x)).setAlpha(0);
        void k.wait(c.scene, k.slow(i * 16)).then(() => {
          b.setAlpha(1);
          k.grow(c.scene, b, 1.6, 1, 90);
          drawThread(u, -1);
        });
        beads.push(b);
      }
      await k.wait(c.scene, k.slow(n * 16 + 60));
      // 2) bağ mühürlenir: iki kalp + zincir boyunca iki atış
      c.sfx('bondPulse');
      for (const v of [a, t]) {
        const hp = k.v2Sprite(c, 'bondheart', '#b0304f', v.container.x, v.container.y - v.h - 34, 56, k.DEPTH + 60);
        k.grow(c.scene, hp, 0.3, 1, 220, 'Back.easeOut');
        c.scene.tweens.add({ targets: hp, scaleX: hp.scaleX * 1.18, scaleY: hp.scaleY * 1.18, delay: k.slow(260), duration: k.slow(90), yoyo: true, repeat: 1 });
        c.scene.tweens.add({ targets: hp, alpha: 0, y: hp.y - 24, delay: k.slow(900), duration: k.slow(320), onComplete: () => hp.destroy() });
        glowAt(c, k, chestOf(v).x, chestOf(v).y, 130, 520, k.DEPTH + 20, 0xff6a7a);
        void k.ring(c.scene, v.container.x, v.container.y - 4, { r: 96, flat: 0.32, n: 20, colors: BLOODSOUL, dur: 460, size: 9 });
      }
      hit();
      if (turnCost < 1) halfTurnGlass(c, k, turnCost);
      for (let beat = 0; beat < 2; beat++) {
        await k.counter(c.scene, k.slow(230), (u) => {
          drawThread(1, u);
          const i = Math.round(u * n);
          beads.forEach((b, j) => b.setTint(Math.abs(j - i) <= 1 ? 0xff9aa8 : 0xffffff));
        });
      }
      // 3) zincir motlara dağılır (kalıcı bağ çizgisini arayüz çizer)
      for (const b of beads) {
        k.burst(c.scene, b.x, b.y, { colors: ['#d9d4c0', '#b0304f'], n: 1, speed: [10, 60], gravity: 80, life: [260, 460], size: [5, 8] });
        c.scene.tweens.add({ targets: b, alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: k.slow(260), delay: k.slow(k.rnd(0, 120)), onComplete: () => b.destroy() });
      }
      c.scene.tweens.add({ targets: thread, alpha: 0, duration: k.slow(300), onComplete: () => thread.destroy() });
    }
    c.scene.tweens.add({ targets: fl, alpha: 0, duration: k.slow(200), onComplete: () => fl.destroy() });
    a.play('idle');
  });

/**
 * Yarım tur göstergesi (turnCost < 1): lich'in başının yanında kum saati belirir, kumun yalnızca bir kısmı (turnCost oranı) akar, saat yarım
 * döner ve yanında "½" parlar; tur sırası çubuğu da yarım tur ilerler. Arka planda oynar.
 */
function halfTurnGlass(c: VfxCtx, k: VfxKit, turnCost: number): void {
  const a = c.actor;
  void (async () => {
    c.sfx('sandHiss');
    const gx = a.container.x + facing(a) * (spriteW(a) * 0.5 + 36);
    const gy = a.container.y - a.h * 0.78;
    const glass = k.v2Sprite(c, 'halfglass', '#d9c9a3', gx, gy, 56, k.DEPTH + 62).setAlpha(0);
    k.grow(c.scene, glass, 0.5, 1, 160, 'Back.easeOut', { alpha: 1 });
    const sand = c.scene.add.graphics().setDepth(k.DEPTH + 63);
    await k.counter(c.scene, k.slow(Math.round(560 * turnCost)), (u) => {
      sand.clear();
      for (let i = 0; i < 5; i++) if ((i + Math.floor(u * 24)) % 2) sand.fillStyle(0xe3b983, 1).fillRect(k.snap(gx) - 1, gy - 1 + i * 3, 3, 3);
    });
    sand.destroy();
    c.scene.tweens.add({ targets: glass, angle: facing(a) * 90, duration: k.slow(150), ease: 'Back.easeOut' });
    const txt = c.scene.add
      .text(gx + facing(a) * 34, gy - 4, '½', { fontFamily: 'serif', fontSize: '30px', fontStyle: 'bold', color: '#f2e6c8', stroke: '#2a1a0e', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(k.DEPTH + 64)
      .setAlpha(0);
    c.scene.tweens.add({ targets: txt, alpha: 1, y: txt.y - 10, duration: k.slow(160) });
    await k.wait(c.scene, k.slow(380));
    c.scene.tweens.add({ targets: [glass, txt], alpha: 0, y: '-=20', duration: k.slow(240), onComplete: () => { glass.destroy(); txt.destroy(); } });
  })();
}

// ---------------------------------------------------------------------------------------------------------------- RAISE DEAD

/** Yere yatık dönen mezar mührü (hücre ortasında); `power` boyut/parlaklık, `hex` renk. */
function sigilAt(c: VfxCtx, k: VfxKit, p: Pt, size: number, hex: string, life: number, alpha = 0.95): Phaser.GameObjects.Image {
  const s = k.v2Sprite(c, 'gravesigil', hex, p.x, p.y, size, k.FLOOR_FX + 4).setScale(1, 1).setAlpha(0);
  s.setDisplaySize(size, size * 0.36);
  const sx = s.scaleX;
  const sy = s.scaleY;
  s.setScale(sx * 0.3, sy * 0.3);
  c.scene.tweens.add({ targets: s, scaleX: sx, scaleY: sy, alpha, duration: k.slow(260), ease: 'Back.easeOut' });
  c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(life), duration: k.slow(380), onComplete: () => s.destroy() });
  return s;
}

/**
 * Raise Dead (kendine; ceset seçimi + yuva): lich asasını kaldırır, turkuaz kristal parlar, ayaklarının dibinde mor mezar mührü döner.
 * Ceset seçildiyse (motorun skillUsed.corpseUid'i): asadan cesede turkuaz bir "ruh kancası" uzanır, cesedin hücresinde mühür açılır ve
 * cesetten bir iskelet eli fırlayıp kancaya yapışır (seçilen ceset). Çağrının doğacağı yuvada (skillUsed.slot) mezar mührü açılır, toprak
 * çatlar: mezar orada açılacak. Ceset yoksa (beslenmemiş) mühür soluk ve küçük. Ardından oyunun ceset emme ve doğuş efektleri gelir.
 */
const raise: V2Vfx = async (c, k) => {
  const a = c.actor;
  const { used } = useEvents(c);
  c.sfx('graveMoan');
  a.play('cast');
  const st = staffOf(a);
  glowAt(c, k, st.x, st.y, 140, 700, k.DEPTH + 32);
  k.burst(c.scene, st.x, st.y, { colors: SOUL, n: 10, speed: [40, 180], gravity: -60, life: [400, 800], size: [6, 10] });
  const f = k.feet(a);
  sigilAt(c, k, f, 220, '#b36bff', 900);
  await k.wait(c.scene, k.slow(220));
  const corpseUid = used?.['corpseUid'];
  const corpse = typeof corpseUid === 'string' ? viewOf(c, corpseUid) : undefined;
  const fed = !!corpse;
  // ceset seçimi: ruh kancası
  if (corpse) {
    const cp = { x: corpse.container.x, y: corpse.container.y - 6 };
    c.sfx('earthCrack');
    // asadan fırlatılan hayalet iskelet eli, arkasında iki iplikli turkuaz ruh ipi bırakarak cesede uçar
    const line = c.scene.add.graphics().setDepth(k.DEPTH + 30);
    const to = { x: cp.x, y: cp.y - 30 };
    const claw = k.v2Sprite(c, 'gravehand', '#d9d4c0', st.x, st.y, 64, k.DEPTH + 36).setTint(0x8ff5dc).setRotation(to.x > st.x ? Math.PI / 2 : -Math.PI / 2);
    await k.counter(c.scene, k.slow(300), (u) => {
      line.clear();
      const n = 60;
      for (let strand = 0; strand < 2; strand++)
        for (let i = 0; i <= n * u; i++) {
          const v = i / n;
          const p = arcPt(st, to, v, 120);
          const w = Math.sin(v * Math.PI * 3 + u * 10 + strand * Math.PI) * 8 * Math.sin(v * Math.PI);
          line.fillStyle(strand ? 0x1f8a78 : 0x3fd6b4, 0.9).fillRect(k.snap(p.x) - 3, k.snap(p.y + w) - 3, 6, 6);
          if (i % 4 === 0) line.fillStyle(0xe8fff8, 1).fillRect(k.snap(p.x) - 1, k.snap(p.y + w) - 1, 3, 3);
        }
      const h = arcPt(st, to, u, 120);
      claw.setPosition(k.snap(h.x), k.snap(h.y));
    }, 'Quad.easeOut');
    c.scene.tweens.add({ targets: claw, alpha: 0, scaleX: claw.scaleX * 1.4, scaleY: claw.scaleY * 1.4, duration: k.slow(260), onComplete: () => claw.destroy() });
    sigilAt(c, k, cp, 200, '#3fd6b4', 700);
    k.cracks(c.scene, cp.x, cp.y, { len: 90, n: 7, dur: 700 });
    const hand = k.v2Sprite(c, 'gravehand', '#d9d4c0', cp.x, cp.y + 8, 110, k.DEPTH + 10).setRotation(0.15);
    k.sprout(c.scene, hand, 200);
    k.dustCloud(c.scene, cp.x, cp.y, { n: 5, spread: 70, rise: 50, size: [30, 54], tint: BONEDUST, life: 800 });
    glowAt(c, k, cp.x, cp.y - 30, 160, 600, k.DEPTH + 9);
    c.scene.tweens.add({ targets: line, alpha: 0, delay: k.slow(200), duration: k.slow(300), onComplete: () => line.destroy() });
    c.scene.tweens.add({ targets: hand, scaleY: 0.02, alpha: 0, delay: k.slow(520), duration: k.slow(260), onComplete: () => hand.destroy() });
  }
  // doğacağı yuva: mezar açılır
  const slot = used?.['slot'];
  if (typeof slot === 'number') {
    const sp = k.cellMid(a.combatant.side === 'party' ? 'party' : 'enemy', slot);
    sigilAt(c, k, sp, fed ? 240 : 170, fed ? '#b36bff' : '#8a7f96', 1000, fed ? 0.95 : 0.55);
    k.cracks(c.scene, sp.x, sp.y, { len: fed ? 120 : 70, n: fed ? 8 : 5, dur: 900 });
    k.burst(c.scene, sp.x, sp.y - 6, { colors: fed ? GRAVE : ['#8a7f96', '#5b6579'], n: fed ? 10 : 5, speed: [20, 100], angle: [-Math.PI, 0], gravity: -90, life: [500, 900], size: [8, 12] });
  }
  await k.wait(c.scene, k.slow(300));
  a.play('idle');
};

// ---------------------------------------------------------------------------------------------------------------- SKELETON

/** Paslı kılıç izi: yay boyunca kalınlaşıp incelen gri-pas bant (beyaz kenar); `dir` yön, `from/to` açı (radyan). */
function rustArc(c: VfxCtx, k: VfxKit, x: number, y: number, o: { r: number; from: number; to: number; dir: number; dur: number; flat?: number; width?: number; xs?: number }): Promise<void> {
  const g = c.scene.add.graphics().setDepth(k.DEPTH + 40);
  const width = o.width ?? 26;
  const N = 36;
  // hilal bant: dış kenar (kılıç ucu) parlak beyaz, gövde açık gri, iç kenar pas-kahve; kuyruk sönerek incelir
  return k
    .counter(c.scene, k.slow(o.dur), (u) => {
      g.clear();
      const head = Math.min(1, u * 1.3);
      const tail = Math.max(0, u * 1.3 - 0.55);
      const steps = Math.ceil((head - tail) * N * 2);
      for (let i = 0; i <= steps; i++) {
        const kk = tail + ((head - tail) * i) / Math.max(1, steps);
        const age = (head - kk) / 0.55;
        const ang = o.from + (o.to - o.from) * kk;
        const ox = Math.cos(ang);
        const oy = Math.sin(ang) * (o.flat ?? 1);
        const w = width * Math.max(0.15, 1 - age) * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, kk)));
        for (let j = 0; j < w; j += 3) {
          const rr = o.r - j;
          const px = k.snap(x + o.dir * ox * rr * (o.xs ?? 1));
          const py = k.snap(y + oy * rr);
          const col = j < 4 ? 0xffffff : j < w * 0.55 ? 0xd7d0bf : j < w * 0.8 ? 0xa8a294 : 0x8c5a2b;
          g.fillStyle(col, Math.max(0.25, 1 - age * 0.7)).fillRect(px - 2, py - 2, 5, 5);
        }
      }
      if (u >= 1) g.clear();
    })
    .then(() => g.destroy());
}

/** Paslı demir darbesi: pas pulları, toz, hedef geri savrulur. */
function rustHit(c: VfxCtx, k: VfxKit, t: CombatantView, dir: number, size = 1): void {
  const p = k.spot(t);
  k.hit(c.scene, p.x, p.y, ['#fdfaf2', '#d7d0bf', '#a8a294'], 1.1 * size);
  for (let i = 0; i < 5; i++) {
    const r = k.v2Sprite(c, 'rustflake', '#8c5a2b', p.x, p.y, k.rnd(16, 26), k.DEPTH + 50).setRotation(k.rnd(0, 6));
    c.scene.tweens.add({ targets: r, x: p.x + dir * k.rnd(20, 120), y: p.y + k.rnd(-60, 80), rotation: r.rotation + k.rnd(-5, 5), alpha: 0, duration: k.slow(k.rnd(420, 700)), ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }
  k.burst(c.scene, p.x, p.y, { colors: RUST, n: 8, speed: [100, 320], angle: dir > 0 ? [-1.2, 0.6] : [Math.PI - 0.6, Math.PI + 1.2], gravity: 700, life: [300, 560], size: [6, 10] });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + dir * 14 * size, duration: k.slow(55), yoyo: true });
}

/** İskelet hedefin yanına (takırdayarak) koşar; duruş noktası ve yön. */
async function skeletonRun(c: VfxCtx, _k: VfxKit, t: CombatantView): Promise<{ x: number; y: number; dir: number }> {
  const a = c.actor;
  const dir = t.container.x >= a.container.x ? 1 : -1;
  const stand = { x: t.container.x - dir * (t.w * 0.5 + a.w * 0.5 + 6), y: t.container.y, dir };
  c.sfx('boneRattle');
  await a.approach(stand.x, stand.y, 170);
  return stand;
}

/**
 * Skeleton - Bone Strike (tek hedef, yakın): iskelet takırdayarak hedefe koşar, paslı kılıcını başının üstüne kaldırıp (kemik eklemleri
 * gıcırdar) yukarıdan çapraz indirir; gri-pas kılıç izi, pas pulları ve toz saçılır, hedef sarsılır. Vampiric Bite: Skeleton'ın verdiği
 * hasardan Undead can çaldıysa hedeften Undead'e ruh akar.
 */
const bonestrike: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const stand = await skeletonRun(c, k, t);
  a.play('attack');
  // kaldır
  await new Promise<void>((r) => c.scene.tweens.add({ targets: a.container, x: stand.x - stand.dir * 16, scaleY: 1.04, duration: k.slow(90), ease: 'Quad.easeOut', onComplete: () => r() }));
  c.sfx('rustySlash');
  c.scene.tweens.add({ targets: a.container, x: stand.x + stand.dir * 24, scaleY: 1, duration: k.slow(70), yoyo: true, hold: k.slow(60) });
  const p = k.spot(t);
  void rustArc(c, k, p.x - stand.dir * 70, p.y - 10, { r: 100, from: -1.25, to: 1.05, dir: stand.dir, dur: 170, width: 30 });
  await k.wait(c.scene, k.slow(70));
  rustHit(c, k, t, stand.dir, 1);
  k.shake(c.scene, 90, 0.003);
  void k.wait(c.scene, k.slow(220)).then(() => a.returnHome());
  vampiricEcho(c, k, [t]);
};

/**
 * Skeleton - Bone Slash (hedef + iki yanındaki şerit; cooldown 3): iskelet koşar, kılıcı geriye çeker (eklemler çatırdar), dikey sıra boyunca
 * GENİŞ bir yay çizer: ana hedef hemen kesilir; yan şeritlerdeki hedefler (ikinci vuruş, kendi hasar rakamlarından hemen önce) dönüş
 * savuruşuyla kesilir (VfxCtx.gate). Paslı demir izi, pas pulları, kemik tozu.
 */
const boneslash: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const a = c.actor;
  const sides = c.targets.slice(1);
  const stand = await skeletonRun(c, k, t);
  const dir = stand.dir;
  a.play('attack');
  c.sfx('boneSlashCrack');
  await new Promise<void>((r) => c.scene.tweens.add({ targets: a.container, x: stand.x - dir * 26, angle: -dir * 4, duration: k.slow(100), ease: 'Quad.easeOut', onComplete: () => r() }));
  c.sfx('boneSlashWhoosh');
  c.scene.tweens.add({ targets: a.container, x: stand.x + dir * 30, angle: dir * 3, duration: k.slow(80), yoyo: true, hold: k.slow(40), onComplete: () => a.container.setAngle(0) });
  const spots = c.targets.map((u) => k.spot(u));
  const pad = sides.length ? 90 : 110;
  const yTop = Math.min(...spots.map((q) => q.y)) - pad;
  const yBot = Math.max(...spots.map((q) => q.y)) + pad;
  const cx = spots.reduce((s, q) => s + q.x, 0) / spots.length - dir * 30;
  const cy = (yTop + yBot) / 2;
  const rr = (yBot - yTop) / 2;
  void rustArc(c, k, cx, cy, { r: rr, from: -Math.PI / 2 - 0.1, to: Math.PI / 2 + 0.1, dir, dur: 210, xs: 0.4, width: 40 });
  await k.wait(c.scene, k.slow(sides.length ? 60 : 85));
  c.sfx('boneSlashHit');
  rustHit(c, k, t, dir, 1.15);
  k.shake(c.scene, 110, 0.0035);
  const finish = () => {
    void k.wait(c.scene, k.slow(160)).then(() => a.returnHome());
    vampiricEcho(c, k, c.targets);
  };
  if (!sides.length) {
    finish();
    return;
  }
  c.gate(
    1,
    async () => {
      c.sfx('boneSlashHit');
      a.play('attack');
      c.scene.tweens.add({ targets: a.container, x: stand.x + dir * 22, duration: k.slow(60), yoyo: true });
      void rustArc(c, k, cx, cy, { r: rr, from: Math.PI / 2 + 0.1, to: -Math.PI / 2 - 0.1, dir, dur: 180, xs: 0.4, width: 32 });
      await k.wait(c.scene, k.slow(50));
      for (const s of sides) rustHit(c, k, s, dir, 1);
      k.shake(c.scene, 110, 0.0035);
      finish();
    },
    () => finish(),
  );
};

export const VFX: Record<string, V2Vfx> = {
  bonethrow,
  wail,
  guardlink,
  raise,
  bonestrike,
  boneslash,
};
