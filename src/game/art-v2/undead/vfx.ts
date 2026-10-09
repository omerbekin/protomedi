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
 *   raise_dead (Raise Dead) -> 'raise' (+ olay efektleri 'corpsedrain' ve 'summon_skeleton')
 *   skeleton_strike (Bone Strike) -> 'bonestrike'
 *   skeleton_slash (Bone Slash) -> 'boneslash'
 * Phaser'ı ve ../../vfx'i ÇALIŞMA ZAMANINDA içe aktarma (yalnızca import type); her şey k üzerinden gelir.
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: karartma görünen alanın tamamını kaplar
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

/*
 * RAISE DEAD - YENİ TASARIM DİLİ (2026-10-09, Ömer: "toprak çatlasın, yarılsın, kemik eller ve iskelet gerçekten ürkütücü biçimde
 * topraktan pençeleyerek çıksın"). Mage v2 ile aynı gerçekçi, ağır dil: gürültü dokulu toz/toprak, yerçekimli topaklar, soğuk ölü ışığı
 * (turkuaz, ADD, abartısız), sıçrayan/esneyen hareket yok. Üç parça art arda oynar (olay akışı değişmez):
 *  1) 'raise' (skill, ~0,7 sn): lich asasını kaldırır, kristale soğuk ışık toplanır; ayaklarından yere yatık soğuk bir sis doğup mezarın
 *     açılacağı yuvaya sürünür, orada toprak ilk kez kıpırdar (çakıl zıplar, ince çatlak).
 *  2) 'corpsedrain' (olay, yalnızca ceset tüketildiyse, ~1 sn): ölünün soluk turkuaz hayaleti cesedinden doğrulur, dağılarak ruh tellerine
 *     ayrılır; teller kıvrılarak mezar yuvasına akar ve toprağa siner (toprak ölünün özünü içer).
 *  3) 'summon_skeleton' (olay, ~2,4 sn): yer titrer, çatlaklar örümcek ağı gibi yayılır ve aralarından soğuk ışık sızar; toprak yarılır
 *     (koyu çukur, havaya savrulan ve yere düşen toprak topakları, kabaran kahverengi toz); çukurun kenarından kemik eller pençeleyerek
 *     çıkar, parmaklar kıvrılıp toprağa tutunur; iskelet sarsak hamlelerle (çek, dur, çek) yükselir, üstünden toprak dökülür, toprak
 *     lekesi açılarak temizlenir; beslenmişse çukurdan ölünün özü göğsüne akar ve gözleri turkuaz yanar. Toz bulutu ve yerde soğuk sis
 *     bir süre kalır. Beslenmemiş: soluk, gri, daha titrek ve yavaş, ışık yok denecek kadar az.
 */

// --- gürültü (yalnızca doku üretiminde; deterministik)
function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4): number {
  let t = 0;
  let amp = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    t += vnoise(x * f, y * f, s + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return t / n;
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** İki rengi karıştırır (toprak lekesinin temizlenmesi gibi tint geçişleri). */
function mixHex(a: number, b: number, t: number): number {
  const u = clamp01(t);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * u;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * u;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * u;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

// --- dokular
/** Toz / duman topağı: düzensiz kenarlı, içi gürültülü gri (tint ile toprak tozu ya da soğuk sis olur). 3 varyant. */
const dustTex = (k: VfxKit, s: Phaser.Scene, v: number): string =>
  k.softTexture(s, `v2undead:dust${v}`, 40, 40, (x, y) => {
    const nx = (x + 0.5) / 40;
    const ny = (y + 0.5) / 40;
    const r = 0.36 + (fbm(nx * 3.5, ny * 3.5, 301 + v * 9) - 0.5) * 0.3;
    const d = Math.hypot(nx - 0.5, ny - 0.5) / r;
    if (d >= 1) return null;
    const n = fbm(nx * 7, ny * 7, 331 + v * 3);
    const L = clamp01(0.5 + (n - 0.5) * 0.9 + (0.5 - ny) * 0.35);
    const c = L > 0.72 ? '#ffffff' : L > 0.56 ? '#d9d9d9' : L > 0.4 ? '#b0b0b0' : '#8a8a8a';
    return { c, a: Math.min(1, (1 - d) * 2.2) * (0.55 + n * 0.5) };
  });

/** Yere yatık sis şeridi (yassı, gürültülü; tint + normal karışım). */
const mistTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2undead:mist', 64, 20, (x, y) => {
    const nx = (x + 0.5) / 64 - 0.5;
    const ny = (y + 0.5) / 20 - 0.5;
    const d = Math.hypot(nx * 2, ny * 2);
    const n = fbm(x / 7, y / 3, 351);
    const lim = 0.8 + (n - 0.5) * 0.5;
    if (d >= lim) return null;
    return { c: n > 0.55 ? '#ffffff' : '#c8d4d0', a: (1 - d / lim) ** 0.8 * (0.45 + n * 0.55) };
  });

/** Açılan mezar: kenarı yırtık koyu çukur, içi zifiri, üst dudağında ışık alan toprak (yere yatık). */
const pitTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2undead:pit', 72, 26, (x, y) => {
    const nx = (x + 0.5) / 72 - 0.5;
    const ny = (y + 0.5) / 26 - 0.5;
    const d = Math.hypot(nx * 2, ny * 2);
    const n = fbm(x / 6, y / 3, 371);
    const lim = 0.86 + (n - 0.5) * 0.36;
    if (d >= lim) return null;
    const q = d / lim;
    if (q > 0.8) return { c: ny < 0 ? (n > 0.55 ? '#5c4632' : '#46341f') : '#2a1d13', a: 1 };
    if (q > 0.62) return { c: '#1c130d', a: 1 };
    return { c: q > 0.4 ? '#0d0907' : '#050403', a: 1 };
  });

/** Islak toprak lekesi (çukurun çevresine savrulan koyu toprak; yere yatık). */
const spoilTex = (k: VfxKit, s: Phaser.Scene): string =>
  k.softTexture(s, 'v2undead:spoil', 72, 26, (x, y) => {
    const nx = (x + 0.5) / 72 - 0.5;
    const ny = (y + 0.5) / 26 - 0.5;
    const d = Math.hypot(nx * 2, ny * 2);
    const n = fbm(x / 4, y / 2, 391);
    const lim = 0.95 + (n - 0.5) * 0.5;
    if (d >= lim || n < 0.38) return null;
    return { c: n > 0.66 ? '#6b5038' : n > 0.52 ? '#4a3524' : '#33241a', a: d > 0.75 ? 0.6 : 0.9 };
  });

// --- yardımcılar
type Img = Phaser.GameObjects.Image;
type Gfx = Phaser.GameObjects.Graphics;

/** Soğuk ölü ışığı (ADD) noktası; kendini söndürmez (çağıran yönetir). */
function coldLight(c: VfxCtx, k: VfxKit, x: number, y: number, w: number, h: number, tint: number, alpha: number, depth: number): Img {
  return c.scene.add.image(x, y, soulGlowTex(c, k)).setDisplaySize(w, h).setTint(tint).setAlpha(alpha).setDepth(depth).setBlendMode(k.Phaser.BlendModes.ADD);
}

/** Nesneyi söndürüp yok eder. */
function fadeOut(c: VfxCtx, k: VfxKit, obj: Phaser.GameObjects.GameObject, delay: number, dur: number, extra: Record<string, unknown> = {}): void {
  c.scene.tweens.add({ targets: obj, alpha: 0, delay: k.slow(delay), duration: k.slow(dur), ...extra, onComplete: () => obj.destroy() });
}

/** Kabaran, yavaşça yükselip dağılan toz (normal karışım; toprak rengi). */
function billow(c: VfxCtx, k: VfxKit, x: number, y: number, o: { n: number; spread: number; size: [number, number]; rise: [number, number]; life: [number, number]; tint?: number | number[]; alpha?: number; drift?: number; delay?: [number, number]; depth?: number; grow?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const s = k.rnd(o.size[0], o.size[1]);
    const p = c.scene.add
      .image(x + k.rnd(-o.spread, o.spread), y + k.rnd(-o.spread * 0.12, o.spread * 0.12), dustTex(k, c.scene, i % 3))
      .setDisplaySize(s * 0.5, s * 0.4)
      .setTint(Array.isArray(o.tint) ? k.pick(o.tint) : (o.tint ?? 0xa88e6c))
      .setAlpha(0)
      .setDepth(o.depth ?? k.DEPTH + 22)
      .setRotation(k.rnd(0, 6))
      .setFlipX(Math.random() < 0.5);
    const life = k.rnd(o.life[0], o.life[1]);
    const dl = o.delay ? k.rnd(o.delay[0], o.delay[1]) : 0;
    const g = o.grow ?? 1.8;
    c.scene.tweens.add({ targets: p, alpha: o.alpha ?? 0.7, delay: k.slow(dl), duration: k.slow(life * 0.12) });
    c.scene.tweens.add({ targets: p, x: p.x + (o.drift ?? 0) * k.rnd(0.5, 1.2) + (p.x - x) * 0.6, y: p.y - k.rnd(o.rise[0], o.rise[1]), displayWidth: s * g, displayHeight: s * g * 0.8, rotation: p.rotation + k.rnd(-0.4, 0.4), delay: k.slow(dl), duration: k.slow(life), ease: 'Cubic.easeOut' });
    fadeOut(c, k, p, dl + life * 0.4, life * 0.6, { ease: 'Sine.easeIn' });
  }
}

/** Fizikli parçacık: toprak topağı (yere düşüp kalır), ince toprak kırıntısı, ruh zerresi (ADD tabakada çizilir). */
type Part = { x: number; y: number; vx: number; vy: number; g: number; drag: number; life: number; age: number; size: number; col: number; floor?: number; a?: number; ph?: number };

/** Tek Graphics üstünde parçacık alanı; `add` ise ADD karışım (ışık). dur: yavaşlatılmamış ms. */
function particles(c: VfxCtx, k: VfxKit, depth: number, dur: number, init: Part[], o: { add?: boolean; spawn?: (t: number, out: Part[]) => void } = {}): Gfx {
  const g = c.scene.add.graphics().setDepth(depth);
  if (o.add) g.setBlendMode(k.Phaser.BlendModes.ADD);
  const ps = init.slice();
  let last = 0;
  void k.counter(c.scene, k.slow(dur), (u) => {
    const t = u * dur;
    const dt = Math.min(50, t - last) / 1000;
    last = t;
    o.spawn?.(t, ps);
    g.clear();
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.age += dt * 1000;
      if (p.age >= p.life) {
        ps.splice(i, 1);
        continue;
      }
      p.vx *= 1 - p.drag * dt;
      p.vy = p.vy * (1 - p.drag * dt) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor;
        p.vy = 0;
        p.vx *= 0.25;
        p.g = 0;
      }
      const q = p.age / p.life;
      const al = (p.a ?? 1) * (q > 0.7 ? (1 - q) / 0.3 : 1) * (o.add ? Math.min(1, q * 6) : 1);
      const sw = p.ph !== undefined ? Math.sin(p.age * 0.008 + p.ph) * 4 : 0;
      g.fillStyle(p.col, al).fillRect(k.snap(p.x + sw), k.snap(p.y), p.size, p.size);
      if (!o.add && p.size >= 6) g.fillStyle(0x1a120c, al * 0.8).fillRect(k.snap(p.x + sw), k.snap(p.y) + p.size - 2, p.size, 2);
    }
    if (u >= 1) g.destroy();
  });
  return g;
}

/** Yerden savrulan toprak topakları (yerçekimi; yere düşüp bir süre kalır). */
function clods(k: VfxKit, x: number, y: number, n: number, o: { speed: [number, number]; spread?: number; size?: [number, number]; floorY: number; pale?: boolean }): Part[] {
  const cols = o.pale ? [0x6e6458, 0x8a7f70, 0x4e463e, 0x9a8f80] : [0x2e2017, 0x4a3524, 0x6b5038, 0x3a2a1e, 0x8a6e52];
  return Array.from({ length: n }, () => {
    const a = k.rnd(-Math.PI * 0.92, -Math.PI * 0.08);
    const sp = k.rnd(o.speed[0], o.speed[1]);
    return { x: x + k.rnd(-(o.spread ?? 20), o.spread ?? 20), y: y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1500, drag: 0.6, life: k.rnd(900, 1600), age: 0, size: k.snap(k.rnd(o.size?.[0] ?? 4, o.size?.[1] ?? 10)) || 4, col: k.pick(cols), floor: o.floorY + k.rnd(-10, 14) };
  });
}

/**
 * Çatlak ağı: merkezden kırık çizgili, dallanan çatlaklar yere yatık (perspektif) yayılır; içi zifiri, üst kenarı ışık alan toprak.
 * `glow` verilirse aynı çatlakların içinden ADD soğuk ışık sızar (setGlow ile şiddet). `grow(u)` yayılmayı 0..1 ilerletir.
 */
function crackNet(c: VfxCtx, k: VfxKit, p: Pt, o: { len: number; n: number; flat?: number; glow?: number | null; seed?: number }): { grow: (u: number) => void; setGlow: (a: number) => void; fade: (delay: number, dur: number) => void } {
  const flat = o.flat ?? 0.32;
  type Seg = { pts: Array<[number, number]>; w: number; at: number };
  const segs: Seg[] = [];
  const walk = (x: number, y: number, ang: number, len: number, w: number, at: number, depth: number): void => {
    const pts: Array<[number, number]> = [[x, y]];
    let px = x;
    let py = y;
    let a = ang;
    const steps = Math.max(2, Math.round(len / 9));
    for (let i = 0; i < steps; i++) {
      a += k.rnd(-0.38, 0.38) + (ang - a) * 0.25;
      const st = k.rnd(6, 12);
      px += Math.cos(a) * st;
      py += Math.sin(a) * st * flat;
      pts.push([px, py]);
      if (depth < 2 && i > 1 && Math.random() < 0.22) walk(px, py, a + k.pick([-1, 1]) * k.rnd(0.5, 1.1), len * k.rnd(0.3, 0.5), Math.max(2, w - 2), at + (i / steps) * 0.5, depth + 1);
    }
    segs.push({ pts, w, at });
  };
  for (let i = 0; i < o.n; i++) walk(p.x + k.rnd(-6, 6), p.y + k.rnd(-2, 2), (i / o.n) * Math.PI * 2 + k.rnd(-0.3, 0.3), o.len * k.rnd(0.65, 1.15), 6, 0, 0);
  const g = c.scene.add.graphics().setDepth(k.FLOOR_FX + 3);
  const gl = o.glow != null ? c.scene.add.graphics().setDepth(k.FLOOR_FX + 4).setBlendMode(k.Phaser.BlendModes.ADD).setAlpha(0) : null;
  const draw = (u: number): void => {
    g.clear();
    gl?.clear();
    for (const s of segs) {
      const local = clamp01((u - s.at) / Math.max(0.2, 1 - s.at));
      const shown = Math.ceil((s.pts.length - 1) * local);
      for (let i = 0; i < shown; i++) {
        const [x0, y0] = s.pts[i]!;
        const [x1, y1] = s.pts[i + 1]!;
        const w = Math.max(2, Math.round(s.w * (1 - i / s.pts.length) * 0.5) * 2);
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
        for (let j = 0; j <= n; j++) {
          const x = k.snap(x0 + ((x1 - x0) * j) / n);
          const y = k.snap(y0 + ((y1 - y0) * j) / n);
          g.fillStyle(0x6a5440, 0.9).fillRect(x - w / 2, y - w / 2 - 2, w, 2);
          g.fillStyle(0x0a0705, 1).fillRect(x - w / 2, y - w / 2, w, Math.max(2, w * 0.6));
          if (gl) gl.fillStyle(o.glow!, 1).fillRect(x - Math.max(2, w / 2) / 2, y - w / 2, Math.max(2, w / 2), Math.max(2, w * 0.5));
        }
      }
    }
  };
  return {
    grow: draw,
    setGlow: (a) => gl?.setAlpha(a),
    fade: (delay, dur) => {
      fadeOut(c, k, g, delay, dur);
      if (gl) fadeOut(c, k, gl, delay * 0.6, dur * 0.7);
    },
  };
}

/** Bir doğru parçası boyunca kare damgalar (piksel art kalın çizgi); `clipY` altını çizmez (toprağın altı). */
function stamp(g: Gfx, k: VfxKit, x0: number, y0: number, x1: number, y1: number, w: number, col: number, clipY: number, alpha = 1): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  g.fillStyle(col, alpha);
  for (let j = 0; j <= n; j++) {
    const x = k.snap(x0 + ((x1 - x0) * j) / n);
    const y = k.snap(y0 + ((y1 - y0) * j) / n);
    if (y > clipY) continue;
    g.fillRect(x - w / 2, y - w / 2, w, w);
  }
}

/**
 * Kemik kol ve pençe (yan görünüş, piksel art): iki kalın önkol kemiği, yumru bilek, boğumlu tarak, 3 kanca parmak (3 boğum) + başparmak.
 * `ang` dikeyden sapma (radyan, + = sağa), `reach` bileğin topraktan uzaklığı (negatifse el henüz kısmen toprakta: kırpılır), `curl`
 * 0 açık pençe - 1 kapanmış (parmak uçları kanca gibi içe döner), `side` kıvrılma yönü. Toprak çizgisinin (by) altı çizilmez: el gerçekten
 * topraktan çıkar. `dirt` 1 = toprağa bulanmış koyu kemik, 0 = temiz kemik.
 */
function drawBoneArm(g: Gfx, k: VfxKit, bx: number, by: number, o: { ang: number; reach: number; curl: number; s: number; side: number; dirt: number }): void {
  const { s, side } = o;
  const dx = Math.sin(o.ang);
  const dy = -Math.cos(o.ang);
  const px = -dy;
  const py = dx;
  const wx = bx + dx * o.reach;
  const wy = by + dy * o.reach;
  const bone = mixHex(0xeee6cc, 0x6e5a44, o.dirt);
  const mid = mixHex(0xc4b897, 0x4e3e2e, o.dirt);
  const shade = mixHex(0x857a62, 0x2e241a, o.dirt);
  const line = 0x120d09;
  type L = [number, number, number, number, number];
  const lines: L[] = [];
  const knobs: Array<[number, number, number]> = [];
  // önkol: iki kemik (radius / ulna) topraktan bileğe, bilekte birbirine yaklaşır
  const fx = bx - dx * 40;
  const fy = by - dy * 40;
  lines.push([fx + px * 3.4 * s, fy + py * 3.4 * s, wx + px * 1.8 * s, wy + py * 1.8 * s, 4.2 * s]);
  lines.push([fx - px * 3 * s, fy - py * 3 * s, wx - px * 1.6 * s, wy - py * 1.6 * s, 3.4 * s]);
  knobs.push([wx, wy, 6.5 * s]);
  // tarak + 3 kanca parmak
  const palm = 9 * s;
  const kx = wx + dx * palm;
  const ky = wy + dy * palm;
  for (let f = 0; f < 3; f++) {
    const off = (f - 1) * 3.4 * s;
    const kx1 = kx + px * off;
    const ky1 = ky + py * off;
    lines.push([wx + px * off * 0.35, wy + py * off * 0.35, kx1, ky1, 3 * s]);
    knobs.push([kx1, ky1, 4 * s]);
    let a = o.ang + (f - 1) * 0.26 * (1 - o.curl * 0.4);
    let x = kx1;
    let y = ky1;
    const segL = (f === 1 ? 7 : 6) * s;
    for (let j = 0; j < 3; j++) {
      a += side * (0.12 + o.curl * (j === 0 ? 0.45 : 0.85));
      const L2 = segL * (1 - j * 0.22);
      const nx = x + Math.sin(a) * L2;
      const ny = y - Math.cos(a) * L2;
      lines.push([x, y, nx, ny, (3 - j * 0.6) * s]);
      if (j < 2) knobs.push([nx, ny, 3.2 * s]);
      x = nx;
      y = ny;
    }
  }
  // başparmak (karşı yandan)
  {
    let a = o.ang - side * (0.95 - o.curl * 0.45);
    let x = wx + dx * 3 * s - px * side * 3.2 * s;
    let y = wy + dy * 3 * s - py * side * 3.2 * s;
    for (let j = 0; j < 2; j++) {
      a += side * (0.15 + o.curl * 0.55);
      const nx = x + Math.sin(a) * 6 * s;
      const ny = y - Math.cos(a) * 6 * s;
      lines.push([x, y, nx, ny, 3 * s]);
      x = nx;
      y = ny;
    }
  }
  for (const [x0, y0, x1, y1, w] of lines) stamp(g, k, x0, y0, x1, y1, Math.round(w + 4), line, by);
  for (const [x, y, r] of knobs) stamp(g, k, x, y, x, y, Math.round(r + 4), line, by);
  for (const [x0, y0, x1, y1, w] of lines) stamp(g, k, x0, y0, x1, y1, Math.max(2, Math.round(w)), mid, by);
  for (const [x, y, r] of knobs) stamp(g, k, x, y, x, y, Math.max(2, Math.round(r)), mid, by);
  // ışık sol-üstten: kemiklerin bir yanı açık, öbür yanı gölge; boğumlarda parlak tepe
  for (const [x0, y0, x1, y1, w] of lines) stamp(g, k, x0 - px * w * 0.22, y0 - py * w * 0.22 - 1, x1 - px * w * 0.22, y1 - py * w * 0.22 - 1, Math.max(2, Math.round(w * 0.45)), bone, by);
  for (const [x0, y0, x1, y1, w] of lines) if (w > 4) stamp(g, k, x0 + px * w * 0.32, y0 + py * w * 0.32, x1 + px * w * 0.32, y1 + py * w * 0.32, 2, shade, by);
  for (const [x, y, r] of knobs) stamp(g, k, x - 1, y - 1, x - 1, y - 1, Math.max(2, Math.round(r * 0.5)), bone, by);
}

/**
 * Mezar eli: çukurun kenarından sarsak hamlelerle (kımılda, dur, hamle) çıkar, parmakları seğirip açılır, sonra çukurun kenarına doğru
 * eğilip toprağı avuçlar; `sink()` geri toprağa çeker. Toprak lekesi el çıktıkça kurur.
 */
function graveHand(c: VfxCtx, k: VfxKit, x: number, y: number, o: { depth: number; s: number; side: number; lean: number; len: number; dur: number; delay: number; pale: boolean }): { grip: (delay: number) => void; sink: (delay: number, dur: number) => void; done: Promise<void> } {
  const g = c.scene.add.graphics().setDepth(o.depth);
  const st = { reach: -30 * o.s, ang: o.lean, curl: 0.8, dirt: 1 };
  let alive = true;
  const redraw = (): void => {
    if (!alive) return;
    g.clear();
    drawBoneArm(g, k, x, y, { ang: st.ang, reach: st.reach, curl: st.curl, s: o.s, side: o.side, dirt: st.dirt * (o.pale ? 1 : 0.9) });
  };
  c.scene.events.on('update', redraw);
  const stop = (): void => {
    alive = false;
    c.scene.events.off('update', redraw);
    g.destroy();
  };
  c.scene.time.delayedCall(8000, () => alive && stop()); // güvence: efekt yarıda kesilse de kalkar
  // sarsak çıkış: üç hamle, aralarda kısa duraklama; parmaklar seğirir (birim: s ile ölçeklenir)
  const KF: Array<[number, number]> = [[0, -30], [0.22, -8], [0.34, -6], [0.62, o.len * 0.55], [0.72, o.len * 0.58], [1, o.len]];
  const done = k.wait(c.scene, k.slow(o.delay)).then(() =>
    k.counter(c.scene, k.slow(o.dur), (u) => {
      let i = 0;
      while (i < KF.length - 2 && u > KF[i + 1]![0]) i++;
      const [u0, r0] = KF[i]!;
      const [u1, r1] = KF[i + 1]!;
      const t = clamp01((u - u0) / Math.max(0.001, u1 - u0));
      st.reach = (r0 + (r1 - r0) * (1 - (1 - t) ** 2)) * o.s;
      st.curl = 0.15 + 0.5 * Math.abs(Math.sin(u * 15 + x * 0.1)) * (1 - u * 0.7);
      st.dirt = 1 - u * 0.6;
      st.ang = o.lean + Math.sin(u * 9 + y * 0.1) * 0.1 * (1 - u);
    }),
  );
  return {
    done,
    grip: (delay) => {
      void k.wait(c.scene, k.slow(delay)).then(() => {
        const a0 = st.ang;
        const r0 = st.reach;
        return k.counter(c.scene, k.slow(240), (u) => {
          // el çukurun kenarına doğru eğilir ve toprağı avuçlar
          const e = 1 - (1 - u) ** 3;
          st.ang = a0 + o.side * 0.3 * e;
          st.reach = r0 * (1 - 0.18 * e);
          st.curl = 0.25 + 0.75 * e;
        }).then(() => {
          if (!alive) return;
          const L = st.reach + 22 * o.s;
          const tip = { x: x + Math.sin(st.ang) * L, y: y - Math.cos(st.ang) * L };
          particles(c, k, o.depth + 1, 700, clods(k, tip.x, Math.max(tip.y, y - 8), 5, { speed: [40, 130], spread: 6, size: [2, 6], floorY: y + 4, pale: o.pale }));
        });
      });
    },
    sink: (delay, dur) => {
      void k.wait(c.scene, k.slow(delay)).then(() => {
        const r0 = st.reach;
        return k.counter(c.scene, k.slow(dur), (u) => {
          st.reach = r0 + (-40 * o.s - r0) * u;
          st.curl = Math.min(1, st.curl + 0.02);
          if (u >= 1 && alive) stop();
        }, 'Quad.easeIn');
      });
    },
  };
}

/**
 * İskelet topraktan pençeleyerek çıkar: birim zemin çizgisinin altında maskelenir (gömülü kısım görünmez), sarsak hamlelerle (çek -
 * dur - çek) yükselir, her hamlede yana yalpalar ve üstünden toprak dökülür; gövdedeki koyu toprak lekesi yükseldikçe temizlenir.
 * Beslenmemişte hamleler daha çok ve daha zayıf (titrek). Promise birim tam çıkınca çözülür.
 */
function clawRise(c: VfxCtx, k: VfxKit, v: CombatantView, ms: number, o: { fed: boolean; onJerk: (i: number, p: number) => void }): Promise<void> {
  const home = v.home;
  const mask = c.scene.make.graphics({ x: 0, y: 0 }, false);
  mask.fillStyle(0xffffff).fillRect(home.x - 500, home.y - 1000, 1000, 1004);
  v.container.setMask(mask.createGeometryMask());
  v.container.setAlpha(1);
  // can çubuğu / ad yazısı topraktan önce çıkmasın: yükseliş boyunca gizli, iskelet çıkınca belirir
  const ui = v.container.list.filter((ch) => ch !== v.sprite) as unknown as Array<Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.GameObject>;
  const uiAlpha = ui.map((ch) => ch.alpha);
  ui.forEach((ch) => ch.setAlpha(0));
  const start = home.y + v.h + 20;
  v.container.setY(start);
  v.sprite.setTint(0x3a3028);
  // [zaman, ilerleme]: hareketli parçalar ve araya giren kısa duraklamalar
  const KF: Array<[number, number]> = o.fed
    ? [[0, 0], [0.14, 0.2], [0.24, 0.22], [0.4, 0.48], [0.5, 0.5], [0.66, 0.78], [0.74, 0.8], [0.9, 0.99], [1, 1]]
    : [[0, 0], [0.12, 0.14], [0.22, 0.15], [0.33, 0.33], [0.42, 0.34], [0.54, 0.55], [0.6, 0.56], [0.72, 0.74], [0.8, 0.75], [0.93, 0.99], [1, 1]];
  let lastSeg = -1;
  return k
    .counter(c.scene, k.slow(ms), (u) => {
      let i = 0;
      while (i < KF.length - 2 && u > KF[i + 1]![0]) i++;
      const [u0, p0] = KF[i]!;
      const [u1, p1] = KF[i + 1]!;
      const t = clamp01((u - u0) / Math.max(0.001, u1 - u0));
      const moving = p1 - p0 > 0.05;
      const e = moving ? 1 - (1 - t) ** 2.4 : t;
      const p = p0 + (p1 - p0) * e;
      if (i !== lastSeg) {
        lastSeg = i;
        if (moving) o.onJerk(i, p0);
      }
      const jerk = moving ? Math.sin(t * Math.PI) : 0;
      const sideSign = i % 4 === 0 ? 1 : -1;
      v.container.setY(start + (home.y - start) * p);
      v.container.setX(home.x + (o.fed ? 2 : 4) * jerk * sideSign + (moving ? k.rnd(-1, 1) : 0));
      v.container.setAngle(sideSign * (o.fed ? 3.5 : 5) * jerk * (1 - p * 0.6));
      v.sprite.setTint(mixHex(0x3a3028, 0xffffff, clamp01((p - 0.25) / 0.75) ** 1.4));
    })
    .then(() => {
      v.container.setPosition(home.x, home.y).setAngle(0);
      v.container.clearMask(true);
      v.sprite.clearTint();
      ui.forEach((ch, i) => c.scene.tweens.add({ targets: ch, alpha: uiAlpha[i] ?? 1, duration: k.slow(260) }));
    });
}

/** Skeleton'un kafatası göz çukurları ve göğsü (sprite oranlarından: assets/sprites/skeleton/idle.png). */
const skullEyes = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.08, y: v.container.y - v.h * 0.9 });
const ribs = (v: CombatantView): Pt => ({ x: v.container.x + facing(v) * v.w * 0.02, y: v.container.y - v.h * 0.64 });

/** Çağrının doğacağı yuvanın zemin noktası (kullanım özeti ya da skillUsed.slot); yoksa undefined. */
function graveSpot(c: VfxCtx, k: VfxKit, slot: unknown): Pt | undefined {
  if (typeof slot !== 'number') return undefined;
  return k.cellMid(c.actor.combatant.side === 'party' ? 'party' : 'enemy', slot);
}

/**
 * Raise Dead (skill): lich asasını kaldırır, kristalinde soğuk ışık toplanır (ince ruh zerreleri içe çekilir); ayaklarından yere yatık
 * soğuk sis doğup mezarın açılacağı yuvaya sürünür ve orada toprak ilk kez kıpırdar (çakıl zıplar, ince çatlak, derinden inilti).
 * Gerisi olay efektlerinde: ceset emme ('corpsedrain') ve topraktan çıkış ('summon_skeleton'). ~0,7 sn.
 */
const raise: V2Vfx = async (c, k) => {
  const a = c.actor;
  const { used } = useEvents(c);
  c.sfx('graveMoan');
  a.play('cast');
  const st = staffOf(a);
  const halo = coldLight(c, k, st.x, st.y, 30, 30, 0x8ff5dc, 0, k.DEPTH + 32);
  c.scene.tweens.add({ targets: halo, alpha: 0.8, displayWidth: 120, displayHeight: 120, duration: k.slow(380), ease: 'Sine.easeIn' });
  fadeOut(c, k, halo, 420, 360);
  particles(c, k, k.DEPTH + 34, 420, Array.from({ length: 10 }, () => {
    const an = k.rnd(0, Math.PI * 2);
    const r = k.rnd(60, 110);
    const life = k.rnd(260, 420);
    return { x: st.x + Math.cos(an) * r, y: st.y + Math.sin(an) * r, vx: (-Math.cos(an) * r) / (life / 1000), vy: (-Math.sin(an) * r) / (life / 1000), g: 0, drag: 0, life, age: 0, size: 2, col: k.pick([0xe8fff8, 0x8ff5dc, 0x3fd6b4]) };
  }), { add: true });
  const f = k.feet(a);
  const to = graveSpot(c, k, used?.['slot']) ?? { x: f.x + facing(a) * 160, y: f.y };
  // soğuk sis: ayaktan yuvaya yerde sürünür
  for (let i = 0; i < 7; i++) {
    const m = c.scene.add.image(f.x, f.y + k.rnd(-4, 6), mistTex(k, c.scene)).setDisplaySize(110, 30).setTint(0x9fd8cc).setAlpha(0).setDepth(k.FLOOR_FX + 6);
    const dl = 120 + i * 50;
    c.scene.tweens.add({ targets: m, alpha: 0.7, delay: k.slow(dl), duration: k.slow(120) });
    c.scene.tweens.add({ targets: m, x: to.x + k.rnd(-40, 40), y: to.y + k.rnd(-6, 8), displayWidth: k.rnd(130, 180), displayHeight: 30, delay: k.slow(dl), duration: k.slow(420), ease: 'Sine.easeInOut' });
    fadeOut(c, k, m, dl + 380, 520);
  }
  await k.wait(c.scene, k.slow(460));
  // toprak kıpırdar: çakıllar zıplar, ilk ince çatlak
  const pre = crackNet(c, k, to, { len: 46, n: 4, glow: null });
  void k.counter(c.scene, k.slow(220), (u) => pre.grow(u));
  pre.fade(500, 400);
  particles(c, k, k.FLOOR_FX + 8, 500, clods(k, to.x, to.y, 8, { speed: [40, 120], spread: 40, size: [2, 4], floorY: to.y }));
  k.shake(c.scene, 160, 0.0015);
  await k.wait(c.scene, k.slow(220));
  a.play('idle');
};

/**
 * Raise Dead - ceset emme (olay corpseConsumed; yalnızca ceset tüketildiyse): ölünün soluk turkuaz hayaleti cesedinden yarı doğrulur,
 * titreyerek aşınır ve onlarca ince ruh teline ayrılır; teller kıvrılarak mezar yuvasına akar ve toprağa siner (orada soğuk ışık birikir,
 * doğuş efekti oradan devam eder). Cesedin yerinde soluk kemik tozu kalkar. Promise tellerin çoğu yuvaya varınca çözülür. ~1 sn.
 */
const corpsedrain: V2Vfx = async (c, k) => {
  const a = c.actor;
  const at = c.centerPos ?? k.feet(a);
  const uid = (c.event as { uid?: unknown } | undefined)?.uid;
  const dead = typeof uid === 'string' ? c.viewOf?.(uid) : undefined;
  const to = graveSpot(c, k, c.usage?.slot) ?? k.feet(a);
  c.sfx('soulDrain');
  // ceset yerinde soluk kemik tozu ve soğuk ışık
  billow(c, k, at.x, at.y, { n: 6, spread: 50, size: [50, 80], rise: [30, 70], life: [900, 1300], tint: [0xb8b2a0, 0x8f8a7c], alpha: 0.55, depth: k.FLOOR_FX + 9 });
  const pool = coldLight(c, k, at.x, at.y, 160, 46, 0x3fd6b4, 0, k.FLOOR_FX + 7);
  c.scene.tweens.add({ targets: pool, alpha: 0.6, duration: k.slow(200) });
  fadeOut(c, k, pool, 500, 500);
  // ölünün hayaleti: kendi silueti, soluk turkuaz ve yarı saydam (aydınlık zeminde de seçilsin diye normal karışım); yarı doğrulup aşınır
  let ghost: Img | null = null;
  let box = { x: at.x, y: at.y - 80, w: 70, h: 140 };
  if (dead) {
    const sp = dead.sprite;
    const sc = Math.abs(sp.scaleX * dead.container.scaleX);
    ghost = c.scene.add
      .image(dead.home.x, dead.home.y, sp.texture.key, sp.frame.name)
      .setOrigin(0.5, 1)
      .setScale(sc, sc * 0.2)
      .setFlipX(sp.flipX)
      .setTintFill(0x9ff0e0)
      .setAlpha(0)
      .setDepth(k.DEPTH + 20);
    box = { x: dead.home.x, y: dead.home.y - dead.h * 0.5, w: dead.w * 0.5, h: dead.h * 0.8 };
    const g0 = ghost;
    c.scene.tweens.add({ targets: g0, alpha: 0.55, scaleY: sc * 0.92, y: g0.y - 10, duration: k.slow(260), ease: 'Sine.easeOut' });
    c.scene.tweens.add({ targets: g0, scaleX: sc * 1.04, duration: k.slow(70), yoyo: true, repeat: 5, delay: k.slow(200) });
  }
  await k.wait(c.scene, k.slow(260));
  // ruh telleri: hayaletin gövdesinden kopar, kıvrılarak mezar yuvasına akar
  const N = 34;
  const strands: Array<{ x: number; y: number; t: number; d: number; arc: number; ph: number; trail: Array<[number, number]> }> = [];
  for (let i = 0; i < N; i++) strands.push({ x: box.x + k.rnd(-box.w, box.w) * 0.6, y: box.y + k.rnd(-box.h, box.h) * 0.5, t: -k.rnd(0, 0.5), d: k.rnd(0.55, 0.75), arc: k.rnd(60, 150), ph: k.rnd(0, 6), trail: [] });
  const sg = c.scene.add.graphics().setDepth(k.DEPTH + 30).setBlendMode(k.Phaser.BlendModes.ADD);
  const sink = coldLight(c, k, to.x, to.y - 4, 60, 20, 0x3fd6b4, 0, k.FLOOR_FX + 7);
  let arrived = 0;
  const flow = k.counter(c.scene, k.slow(820), (u) => {
    sg.clear();
    for (const s of strands) {
      const tt = clamp01((u * 1.25 + s.t) / s.d);
      if (tt <= 0) continue;
      const e = tt * tt * (3 - 2 * tt);
      const x = s.x + (to.x - s.x) * e + Math.sin(e * 7 + s.ph) * 18 * (1 - e);
      const y = s.y + (to.y - 6 - s.y) * e - Math.sin(e * Math.PI) * s.arc;
      s.trail.push([x, y]);
      if (s.trail.length > 7) s.trail.shift();
      if (tt >= 1) {
        if (s.trail.length) s.trail.shift();
        if (s.d > 0) {
          s.d = -1;
          arrived++;
        }
      }
      s.trail.forEach(([tx, ty], j) => {
        const al = ((j + 1) / s.trail.length) * (tt >= 1 ? 0.5 : 0.9);
        sg.fillStyle(j === s.trail.length - 1 ? 0xe8fff8 : j > 3 ? 0x8ff5dc : 0x1f8a78, al).fillRect(k.snap(tx), k.snap(ty), j === s.trail.length - 1 ? 4 : 2, j === s.trail.length - 1 ? 4 : 2);
      });
    }
    sink.setAlpha(Math.min(0.85, arrived / N)).setDisplaySize(60 + (arrived / N) * 120, 20 + (arrived / N) * 26);
  });
  if (ghost) {
    const g0 = ghost;
    c.scene.tweens.add({ targets: g0, alpha: 0, scaleX: g0.scaleX * 0.7, y: g0.y - 30, delay: k.slow(260), duration: k.slow(480), ease: 'Quad.easeIn', onComplete: () => g0.destroy() });
  }
  await k.wait(c.scene, k.slow(640));
  // toprak özü içer: yuvada ışık bir an kabarır ve toprağa çekilir
  c.sfx('earthCrack');
  particles(c, k, k.FLOOR_FX + 8, 500, clods(k, to.x, to.y, 6, { speed: [30, 100], spread: 30, size: [2, 4], floorY: to.y }));
  void flow.then(() => sg.destroy());
  c.scene.tweens.add({ targets: sink, alpha: 0.35, duration: k.slow(300), delay: k.slow(200) });
  fadeOut(c, k, sink, 900, 900);
  await k.wait(c.scene, k.slow(160));
};

/**
 * Skeleton doğuşu (olay summon): bkz. bölüm başındaki açıklama. `c.targets[0]` yeni iskelet (görünmez başlar, burada görünür olur),
 * `c.event.empowered` beslenmiş mi; beslenmişte aura sahne tarafından efekt bitince yakılır. Promise iskelet tam çıkıp yere oturunca
 * çözülür (~2,4 sn beslenmiş, ~2,7 sn beslenmemiş); toz bulutu ve sis arkada söner.
 */
const summon_skeleton: V2Vfx = async (c, k) => {
  const v = c.targets[0];
  if (!v) return;
  const fed = (c.event as { empowered?: boolean } | undefined)?.empowered !== false;
  const f = { x: v.home.x, y: v.home.y - 2 };
  const glowCol = fed ? 0x3fd6b4 : 0x8a9a92;
  const cellW = Math.max(130, Math.min(200, v.w * 1.1));
  v.container.setAlpha(0);
  // 0) soğuk karanlık çöker (yalnızca arka plan: birimlerin altında), yer derinden titrer
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x04070b, 0).setDepth(k.FLOOR_FX - 6);
  c.scene.tweens.add({ targets: dim, alpha: fed ? 0.42 : 0.26, duration: k.slow(500) });
  c.sfx('earthCrack');
  k.shake(c.scene, 520, fed ? 0.0018 : 0.0012);
  const net = crackNet(c, k, f, { len: cellW * 0.62, n: fed ? 7 : 5, glow: glowCol });
  const ground = coldLight(c, k, f.x, f.y, cellW * 0.6, cellW * 0.2, glowCol, 0, k.FLOOR_FX + 2);
  c.scene.tweens.add({ targets: ground, alpha: fed ? 0.7 : 0.3, displayWidth: cellW * 1.3, displayHeight: cellW * 0.38, duration: k.slow(600), ease: 'Sine.easeIn' });
  void k.counter(c.scene, k.slow(620), (u) => {
    net.grow(u);
    net.setGlow((fed ? 0.95 : 0.4) * u * (0.75 + 0.25 * Math.sin(u * 30)));
  }, 'Quad.easeOut');
  // çakıllar zıplar (titreme)
  particles(c, k, k.FLOOR_FX + 8, 700, [], {
    spawn: (t, out) => {
      if (t < 520 && Math.random() < 0.35) out.push(...clods(k, f.x + k.rnd(-cellW * 0.4, cellW * 0.4), f.y + k.rnd(-8, 8), 1, { speed: [40, 110], spread: 2, size: [2, 4], floorY: f.y + k.rnd(-8, 8), pale: !fed }));
    },
  });
  await k.wait(c.scene, k.slow(560));
  // 1) toprak yarılır: çukur açılır, topaklar savrulur, toz kabarır, soğuk ışık yukarı vurur
  c.sfx('thud');
  c.sfx('earthCrack');
  k.shake(c.scene, 220, fed ? 0.006 : 0.004);
  const spoil = c.scene.add.image(f.x, f.y + 2, spoilTex(k, c.scene)).setDisplaySize(cellW * 0.6, cellW * 0.22).setDepth(k.FLOOR_FX + 2).setAlpha(0.95);
  c.scene.tweens.add({ targets: spoil, displayWidth: cellW * 1.5, displayHeight: cellW * 0.5, duration: k.slow(240), ease: 'Cubic.easeOut' });
  const pit = c.scene.add.image(f.x, f.y, pitTex(k, c.scene)).setDisplaySize(cellW * 0.2, cellW * 0.08).setDepth(k.FLOOR_FX + 5);
  c.scene.tweens.add({ targets: pit, displayWidth: cellW * 0.95, displayHeight: cellW * 0.3, duration: k.slow(260), ease: 'Cubic.easeOut' });
  const shaft = coldLight(c, k, f.x, f.y - 90, cellW * 0.5, 240, glowCol, 0, v.container.depth - 2);
  c.scene.tweens.add({ targets: shaft, alpha: fed ? 0.4 : 0.14, duration: k.slow(160), yoyo: true, hold: k.slow(900), onComplete: () => shaft.destroy() });
  const pitGlow = coldLight(c, k, f.x, f.y, cellW * 0.7, cellW * 0.22, glowCol, fed ? 0.9 : 0.35, k.FLOOR_FX + 6);
  particles(c, k, v.container.depth + 3, 1700, clods(k, f.x, f.y, fed ? 34 : 22, { speed: [220, fed ? 620 : 460], spread: cellW * 0.2, size: [4, 12], floorY: f.y + 6, pale: !fed }));
  billow(c, k, f.x, f.y + 4, { n: fed ? 6 : 4, spread: cellW * 0.5, size: [60, 100], rise: [10, 40], life: [1400, 2200], tint: fed ? [0xa88e6c, 0x96805f, 0xb8a07c] : [0xa49c90, 0x948c80], alpha: 0.6, depth: v.container.depth + 2, drift: 20 });
  billow(c, k, f.x, f.y - 10, { n: fed ? 10 : 7, spread: cellW * 0.4, size: [80, 140], rise: [70, 170], life: [1600, 2600], tint: fed ? [0x8a7458, 0x7a664e, 0x9c8464] : [0x8e867a, 0x7e766c], alpha: 0.7, depth: v.container.depth - 3, drift: 16 });
  await k.wait(c.scene, k.slow(140));
  // 2) mezar elleri çukurun kenarından pençeleyerek çıkar
  c.sfx('boneClatter');
  const s = Math.max(1.6, Math.min(2.6, v.h / 110));
  const specs = fed
    ? [{ dx: -0.44, lean: -0.28, front: true, len: 30 }, { dx: 0.42, lean: 0.32, front: true, len: 34 }, { dx: -0.12, lean: 0.1, front: false, len: 26 }]
    : [{ dx: -0.4, lean: -0.25, front: true, len: 26 }, { dx: 0.38, lean: 0.3, front: false, len: 22 }];
  const hands = specs.map((h, i) =>
    graveHand(c, k, k.snap(f.x + h.dx * cellW), k.snap(f.y + (h.front ? 6 : -6)), { depth: v.container.depth + (h.front ? 1 : -1), s, side: h.dx < 0 ? -1 : 1, lean: h.lean, len: h.len, dur: fed ? 620 : 780, delay: i * 90, pale: !fed }),
  );
  hands.forEach((h, i) => h.grip((fed ? 640 : 800) + i * 90));
  await k.wait(c.scene, k.slow(320));
  // 3) iskelet sarsak hamlelerle yükselir; her hamlede toprak dökülür, toz kalkar, kemik takırdar
  c.sfx('boneRattle');
  const rise = clawRise(c, k, v, fed ? 1300 : 1560, {
    fed,
    onJerk: (i, p) => {
      if (i > 0 && i % 2 === 0) c.sfx(i === 2 ? 'boneClatter' : 'boneRattle');
      const top = v.home.y - v.h * Math.max(0.1, p + 0.18);
      particles(c, k, v.container.depth + 2, 900, [
        ...clods(k, f.x, f.y, 6, { speed: [120, 260], spread: cellW * 0.25, size: [4, 8], floorY: f.y + 6, pale: !fed }),
        ...Array.from({ length: 10 }, () => ({ x: f.x + k.rnd(-v.w * 0.3, v.w * 0.3), y: top + k.rnd(0, 30), vx: k.rnd(-30, 30), vy: k.rnd(-40, 20), g: 1200, drag: 0.4, life: k.rnd(500, 800), age: 0, size: k.pick([2, 2, 4]), col: k.pick(fed ? [0x4a3524, 0x6b5038, 0x2e2017] : [0x6e6458, 0x8a7f70]), floor: f.y + k.rnd(-4, 8) })),
      ]);
      billow(c, k, f.x, f.y, { n: 3, spread: cellW * 0.35, size: [50, 80], rise: [30, 70], life: [900, 1300], tint: fed ? 0x9c8464 : 0x948c80, alpha: 0.45, depth: v.container.depth - 3 });
      k.shake(c.scene, 90, fed ? 0.0025 : 0.0018);
    },
  });
  await rise;
  // 4) yere oturur: ağır adım, eller toprağa geri çekilir, çukur kapanır
  c.sfx('thud');
  k.shake(c.scene, 160, fed ? 0.004 : 0.0025);
  hands.forEach((h, i) => h.sink(i * 50, 320));
  particles(c, k, v.container.depth + 2, 900, clods(k, f.x, f.y, 10, { speed: [80, 200], spread: cellW * 0.3, size: [2, 6], floorY: f.y + 8, pale: !fed }));
  billow(c, k, f.x, f.y + 6, { n: fed ? 8 : 6, spread: cellW * 0.6, size: [70, 120], rise: [10, 40], life: [2400, 3200], tint: fed ? [0xa88e6c, 0xb8a07c] : [0xa49c90, 0x948c80], alpha: 0.42, depth: v.container.depth + 2, drift: 30, grow: 2.2 });
  // ayaklarda yere çöken soğuk sis
  for (let i = 0; i < 4; i++) {
    const m = c.scene.add.image(f.x + k.rnd(-cellW * 0.3, cellW * 0.3), f.y + k.rnd(-4, 6), mistTex(k, c.scene)).setDisplaySize(cellW * 0.6, 26).setTint(fed ? 0x6fa89c : 0x8a8f8c).setAlpha(0).setDepth(v.container.depth + 1);
    c.scene.tweens.add({ targets: m, alpha: fed ? 0.45 : 0.3, displayWidth: cellW * 1.2, x: m.x + k.rnd(-40, 40), duration: k.slow(600), ease: 'Sine.easeOut' });
    fadeOut(c, k, m, 900 + i * 120, 1200);
  }
  if (fed) {
    // beslenmiş: ölünün özü çukurdan göğse akar, gözler soğuk turkuaz yanar
    c.sfx('soulDrain');
    const chest = ribs(v);
    particles(c, k, v.container.depth + 4, 700, Array.from({ length: 16 }, () => {
      const x0 = f.x + k.rnd(-cellW * 0.35, cellW * 0.35);
      const life = k.rnd(360, 560);
      return { x: x0, y: f.y - k.rnd(0, 10), vx: (chest.x - x0) / (life / 1000), vy: (chest.y - f.y) / (life / 1000), g: 0, drag: 0, life, age: 0, size: k.pick([2, 2, 4]), col: k.pick([0xe8fff8, 0x8ff5dc, 0x3fd6b4]), ph: k.rnd(0, 6) };
    }), { add: true });
    await k.wait(c.scene, k.slow(380));
    const eyes = skullEyes(v);
    const eg = coldLight(c, k, eyes.x, eyes.y, 16, 16, 0x8ff5dc, 0, v.container.depth + 5);
    c.scene.tweens.add({ targets: eg, alpha: 1, displayWidth: 70, displayHeight: 46, duration: k.slow(120), ease: 'Quad.easeOut' });
    fadeOut(c, k, eg, 160, 500, { displayWidth: 30, displayHeight: 20 });
    const cg = coldLight(c, k, chest.x, chest.y, v.w * 0.6, v.h * 0.5, 0x3fd6b4, 0.5, v.container.depth + 4);
    fadeOut(c, k, cg, 60, 600);
  } else await k.wait(c.scene, k.slow(160));
  net.fade(300, 1400);
  fadeOut(c, k, pit, 500, 1100, { displayWidth: cellW * 0.6, displayHeight: cellW * 0.16 });
  fadeOut(c, k, spoil, 1200, 1600);
  fadeOut(c, k, pitGlow, 0, 700);
  fadeOut(c, k, ground, 0, 900);
  fadeOut(c, k, dim, 200, 800);
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
  // olay efektleri (docs/design/art-v2.md > 3.1): Raise Dead ceset emme ve Skeleton doğuşu
  corpsedrain,
  summon_skeleton,
  bonestrike,
  boneslash,
};
