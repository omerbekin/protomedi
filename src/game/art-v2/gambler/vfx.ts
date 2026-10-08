/**
 * Gambler - SÜRÜM 2 SKILL ANİMASYONLARI. Kılavuz: docs/design/art-v2.md
 *
 * Ortak dil (karakter: tüylü şapkalı kumarbaz; sprite'ta bir elde yelpaze kartlar (önde, yukarıda), öbür elde zarlar (arkada, bel
 * hizasında), kemerde altın paralar): Gambler YERİNDE kalır; silahı gerçek nesneler: kemik zar, oyun kartı, altın para, hançer.
 * Fizik gerçekçi: zar yuvarlanarak döner (kareler gerçek zar yüzleri), çarpınca seker ve yerde durur; para başparmakla fırlatılır,
 * havada döner (kenar/yüz), avuçta yakalanır; kart bıçak gibi kenarıyla saplanır.
 * Bahis sonucu (c.result.bet: win/lose, c.result.doubleHit) görsel olarak anlatılır: kazanınca altın parıltı, kaybedince kararan para.
 *
 *   loaded_dice (Loaded Dice) -> 'loadeddice' : zar elde sallanır, yuvarlanarak hedefe çarpar, seker ve 6 gelir; çifte vuruşta ikinci altın izli zar.
 *   high_stakes (High Stakes) -> 'duelbet'    : kendi kanından üç damla paraya akar (bahis), para havaya atılıp yakalanır (yazı-tura),
 *                                               sonra hançer fırlatılır: kazanırsa altın patlama, kaybederse kararmış para ve zayıf darbe.
 *   card_trick (Card Trick)   -> 'cardfan'    : elde üç kart yelpaze açılır, iki kart dönerek iki hedefe kenarıyla saplanır,
 *                                               kart çevrilip yüzü görünür ve kâğıt kırıntısına dağılır (rastgele durum).
 *   all_in (All In)           -> 'allin'      : ekran kararır, kalp atışı; tüm manası mavi kıvılcımlar halinde başının üstünde altın zara
 *                                               dönüşür, zar atılır, yuvarlanır: jackpot = 6 + ışık sütunu + altın yağmuru; kayıp = tek göz,
 *                                               zar çatlayıp parçalanır, Gambler kararıp sendeler, mana söner, paralar kül olur.
 */
import { FULL_W } from '../../../ui/viewport'; // geniş ekran: tam ekran karartma görünen alanın tamamını kaplar
import type Phaser from 'phaser';
import type { V2Vfx } from '../types';
import type { VfxCtx } from '../../vfx';
import type { VfxKit } from '../../vfx-versions';
import type { CombatantView } from '../../combatant-view';

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

const GOLD = ['#fff2b0', '#ffd23f', '#e0a020', '#ffffff'];
const BONE = ['#fdfaf2', '#d7dce6', '#98a2b4'];
const BLOOD = ['#e5463b', '#8e1f2c', '#c0203a'];
const PAPER = ['#ffffff', '#d7dce6', '#e5463b', '#15101c'];
const MANA = ['#a8ebff', '#4aa3ff', '#ffffff'];

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function facing(c: VfxCtx): number {
  const to = c.targets[0]?.container.x;
  if (to !== undefined && to !== c.actor.container.x) return to > c.actor.container.x ? 1 : -1;
  return c.actor.combatant.side === 'party' ? 1 : -1;
}
/** Kart eli (önde, yukarıda) ve zar eli (arkada, bel hizasında): idle.png'ye göre. */
const cardHand = (c: VfxCtx, d: number): Pt => ({ x: c.actor.container.x + d * c.actor.w * 0.3, y: c.actor.container.y - c.actor.h * 0.78 });
const diceHand = (c: VfxCtx, d: number): Pt => ({ x: c.actor.container.x - d * c.actor.w * 0.3, y: c.actor.container.y - c.actor.h * 0.5 });
const chest = (t: CombatantView): Pt => ({ x: t.container.x, y: t.container.y - t.h * 0.55 });
const feetOf = (t: CombatantView): Pt => ({ x: t.container.x, y: t.container.y - 6 });

/** v2 sprite'ının doku anahtarı (doku bir kez üretilir; geçici görüntü hemen silinir). */
function texKey(c: VfxCtx, k: VfxKit, name: string, hex: string): string {
  const tmp = k.v2Sprite(c, name, hex, -999, -999, 1);
  const key = tmp.texture.key;
  tmp.destroy();
  return key;
}
/** Dönen zar: yüz kareleri sırayla değişir, gövde döner. `frames` v2 sprite adları. Durdurmak için dönen fonksiyonu çağır. */
function tumble(c: VfxCtx, k: VfxKit, s: Img, frames: string[], hex: string, every = 55): () => void {
  let i = 0;
  const ev = c.scene.time.addEvent({
    delay: k.slow(every),
    loop: true,
    callback: () => {
      i = (i + 1) % frames.length;
      s.setTexture(texKey(c, k, frames[i]!, hex));
    },
  });
  return () => ev.remove();
}
/** Sprite dokusunu başka bir v2 sprite'ıyla değiştirir (boyut korunur). */
function swap(c: VfxCtx, k: VfxKit, s: Img, name: string, hex: string): void {
  const w = s.displayWidth;
  const h = s.displayHeight;
  s.setTexture(texKey(c, k, name, hex)).setDisplaySize(w, h);
}
/** Yayla uçuş (sprite merkezi), dönüşlü. */
function arcTo(c: VfxCtx, k: VfxKit, s: Img, to: Pt, ms: number, arc: number, spin = 0, ease: 'in' | 'out' | 'lin' = 'lin'): Promise<void> {
  const from = { x: s.x, y: s.y };
  const r0 = s.rotation;
  return k.counter(c.scene, k.slow(ms), (u) => {
    const e = ease === 'in' ? u * u : ease === 'out' ? 1 - (1 - u) ** 2 : u;
    s.setPosition(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - 4 * arc * u * (1 - u)).setRotation(r0 + spin * u * Math.PI * 2);
  });
}
/** Yerde sekme: iki-üç azalan sıçrama, yuvarlanarak durur. */
async function bounceRest(c: VfxCtx, k: VfxKit, s: Img, groundY: number, dx: number, hops = 3): Promise<void> {
  let h = 46;
  let x = s.x;
  for (let i = 0; i < hops; i++) {
    const to = { x: x + dx * (0.55 ** i), y: groundY };
    await arcTo(c, k, s, to, 160 * 0.8 ** i, h, 0.35 * Math.sign(dx || 1) * 0.8 ** i);
    k.burst(c.scene, to.x, groundY + 4, { colors: ['#98a2b4', '#5b6579'], n: 2, speed: [30, 90], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 300, life: [160, 300], size: [6, 8] });
    if (i === 0) c.sfx('diceTable');
    x = to.x;
    h *= 0.45;
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * Loaded Dice: zar elde sallanır (0,22 sn), yuvarlanarak yayla hedefin göğsüne çarpar (vuruş), kemik kıymığı; zar geri seker, yerde iki
 * kez zıplayıp 6 gelerek durur ve kurşun hilesi küçük bir parıltıyla belli olur. Çifte vuruşta ikinci zar altın izle (gate).
 */
const loadeddice: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  const throwDie = async (second: boolean) => {
    const h = diceHand(c, d);
    c.actor.play('attack');
    c.sfx('diceShake');
    const s = k.v2Sprite(c, 'die_a', '#e8d9a8', h.x, h.y, 46, k.DEPTH + 30);
    // elde sallama: küçük titreşimli yay
    await k.counter(c.scene, k.slow(second ? 120 : 220), (u) => {
      s.setPosition(h.x + Math.sin(u * 40) * 5, h.y - Math.abs(Math.sin(u * 22)) * 10).setRotation(Math.sin(u * 30) * 0.5);
    });
    const stop = tumble(c, k, s, ['die_a', 'die_b', 'die_c'], '#e8d9a8');
    const p = chest(t);
    const trail = c.scene.time.addEvent({ delay: k.slow(28), loop: true, callback: () => k.burst(c.scene, s.x, s.y, { colors: second ? GOLD : BONE, n: 1, speed: [5, 30], gravity: 0, life: [180, 300], size: [5, 8] }) });
    await arcTo(c, k, s, { x: p.x - d * 14, y: p.y }, second ? 360 : 420, Math.abs(p.x - h.x) * 0.22 + 40, 2.2 * d);
    trail.remove();
    c.sfx('diceTable');
    k.burst(c.scene, p.x, p.y, { colors: second ? GOLD : BONE, n: 7, speed: [100, 300], angle: d > 0 ? [Math.PI * 0.6, Math.PI * 1.4] : [-0.8, 0.8], gravity: 700, life: [240, 420], size: [6, 10] });
    k.hit(c.scene, p.x, p.y, second ? GOLD : ['#ffffff', '#fdfaf2', '#e8d9a8'], second ? 1.2 : 0.9);
    c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 10, duration: k.slow(50), yoyo: true });
    // zar geri seker, yerde durur: 6
    void (async () => {
      await bounceRest(c, k, s, feetOf(t).y + 4, -d * 90, 3);
      stop();
      swap(c, k, s, 'die_six', '#e8d9a8');
      s.setRotation(0);
      const gl = k.sprite(c.scene, 'spark', '#ffd23f', s.x + 10, s.y - 14, 18, k.DEPTH + 40);
      k.grow(c.scene, gl, 0.4, 1.8, 300, 'Quad.easeOut', { alpha: 0, onComplete: () => gl.destroy() });
      c.scene.tweens.add({ targets: s, alpha: 0, delay: k.slow(420), duration: k.slow(280), onComplete: () => s.destroy() });
    })();
  };
  await throwDie(false);
  c.actor.play('idle');
  if (c.result?.doubleHit) c.gate(1, () => throwDie(true), () => undefined);
};

/**
 * High Stakes (canının %15'i bahis, %50 kazanırsa 2 kat): (1) göğsünden üç kan damlası kart eline süzülür, orada altın para belirir
 * (bahis kana bağlanır); (2) başparmakla fırlatılan para havada döner (yüz/kenar) ve avuca düşer; yakalandığı an sonuç: kazanınca altın
 * çakar, kaybedince kararır. (3) Yakut kabzalı hançer fırlatılır, dönerek hedefe saplanır: kazanç = altın-kırmızı büyük patlama ve saçılan
 * paralar, kayıp = sönük kıvılcım. Vuruş ~1,1 sn (x1,2).
 */
const duelbet: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  const won = c.result?.bet === 'win';
  const lost = c.result?.bet === 'lose';
  const hand = cardHand(c, d);
  const body = { x: c.actor.container.x, y: c.actor.container.y - c.actor.h * 0.55 };
  c.actor.play('cast');
  c.sfx('bloodStake');
  // 1) kan bahsi
  await Promise.all(
    [0, 1, 2].map(async (i) => {
      await k.wait(c.scene, k.slow(i * 60));
      const b = k.v2Sprite(c, 'blood', '#c0203a', body.x + k.rnd(-8, 8), body.y + k.rnd(-10, 10), 22, k.DEPTH + 31);
      await arcTo(c, k, b, hand, 200, 26, 0, 'in');
      k.burst(c.scene, hand.x, hand.y, { colors: BLOOD, n: 2, speed: [20, 80], gravity: 200, life: [200, 320], size: [5, 7] });
      b.destroy();
    }),
  );
  const coin = k.v2Sprite(c, 'coin', '#ffd23f', hand.x, hand.y, 30, k.DEPTH + 32);
  coin.setTint(0xffb0a0);
  c.scene.tweens.add({ targets: coin, duration: k.slow(120), onComplete: () => coin.clearTint() });
  // 2) yazı-tura: para döner (yatay ölçek kosinüsle), yükselir ve avuca düşer
  c.sfx('duelDraw');
  const top = hand.y - 150;
  const base = coin.scaleX;
  await k.counter(c.scene, k.slow(500), (u) => {
    const y = hand.y - (hand.y - top) * 4 * u * (1 - u);
    const flip = Math.cos(u * Math.PI * 9);
    coin.setPosition(hand.x, y).setScale(base * Math.max(0.12, Math.abs(flip)), base);
    coin.setTint(flip < 0 ? 0xc4821a : 0xffffff);
  });
  coin.clearTint().setScale(base);
  c.sfx('coinCatch');
  if (won) {
    for (let i = 0; i < 4; i++) {
      const sp = k.sprite(c.scene, 'spark', '#ffd23f', hand.x + k.rnd(-16, 16), hand.y + k.rnd(-16, 10), 20, k.DEPTH + 40);
      c.scene.tweens.add({ targets: sp, y: sp.y - k.rnd(20, 50), alpha: 0, duration: k.slow(360), onComplete: () => sp.destroy() });
    }
    void k.ring(c.scene, hand.x, hand.y, { r: 40, n: 14, colors: GOLD, dur: 260, size: 7 });
  } else if (lost) {
    swap(c, k, coin, 'coindark', '#98a2b4');
    k.burst(c.scene, hand.x, hand.y, { colors: ['#5b6579', '#15101c'], n: 4, speed: [20, 80], gravity: 300, life: [260, 420], size: [6, 9] });
  }
  // 3) hançer
  c.actor.play('attack');
  const p = chest(t);
  const dagger = k.v2Sprite(c, 'dagger', '#d7dce6', hand.x + d * 20, hand.y + 10, 58, k.DEPTH + 33);
  if (d < 0) dagger.setFlipX(true);
  c.sfx('duelCut');
  c.scene.tweens.add({ targets: coin, alpha: 0, y: coin.y + (lost ? 60 : 0), duration: k.slow(lost ? 420 : 200), onComplete: () => coin.destroy() });
  await arcTo(c, k, dagger, { x: p.x - d * 16, y: p.y }, 170, 22, d, 'in');
  dagger.setRotation(Math.atan2(p.y - hand.y, p.x - hand.x) * (d > 0 ? 1 : -1) * 0.3);
  c.scene.tweens.add({ targets: dagger, alpha: 0, delay: k.slow(380), duration: k.slow(260), onComplete: () => dagger.destroy() });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * (won ? 20 : 10), duration: k.slow(55), yoyo: true });
  if (won) {
    k.hit(c.scene, p.x, p.y, GOLD, 1.8);
    k.burst(c.scene, p.x, p.y, { colors: [...GOLD, '#e5463b'], n: 22, speed: [160, 500], angle: [-Math.PI, 0], gravity: 800, life: [420, 760], size: [7, 13] });
    k.flash(c.scene, '#ffd23f', 0.28, 300);
    k.shake(c.scene, 200, 0.007);
    for (let i = 0; i < 6; i++) {
      const cn = k.v2Sprite(c, 'coin', '#ffd23f', p.x, p.y - k.rnd(20, 80), 22, k.DEPTH + 50);
      const sx = cn.scaleX;
      c.scene.tweens.add({ targets: cn, scaleX: sx * 0.15, yoyo: true, repeat: 4, duration: k.slow(70) });
      c.scene.tweens.add({ targets: cn, x: p.x + k.rnd(-120, 120), y: feetOf(t).y + k.rnd(-10, 20), duration: k.slow(620), ease: 'Bounce.easeOut', onComplete: () => c.scene.tweens.add({ targets: cn, alpha: 0, duration: k.slow(260), onComplete: () => cn.destroy() }) });
    }
  } else if (lost) {
    k.hit(c.scene, p.x, p.y, ['#8e1f2c', '#5b6579', '#e5463b'], 0.8);
    k.burst(c.scene, p.x, p.y, { colors: ['#5b6579', '#8e1f2c'], n: 8, speed: [60, 200], gravity: 900, life: [300, 520], size: [6, 10] });
  } else {
    k.hit(c.scene, p.x, p.y, ['#ffffff', '#ff7a6a', '#ffd23f'], 1.2);
  }
  c.actor.play('idle');
};

/**
 * Card Trick (iki rastgele hedef): kart elinde üç kart yelpaze açılır (0,18 sn, deste hışırtısı); iki kart bilekten fırlar, havada hem
 * döner hem çevrilir (arka/kenar), farklı yaylarla iki hedefe kenarıyla saplanır (her hedefin hasarı kendi anında), titrer; sonra kart
 * çevrilir, yüzü görünür (karo / maça / kupa / sinek) ve kâğıt kırıntısına dağılır.
 */
const cardfan: V2Vfx = async (c, k) => {
  const d = facing(c);
  const h = cardHand(c, d);
  c.actor.play('attack');
  c.sfx('cardFan');
  // 1) yelpaze
  const fan = (['card_d', 'card_s', 'card_h'] as const).map((n, i) => k.v2Sprite(c, n, '#ffffff', h.x, h.y, 48, k.DEPTH + 30 + i).setOrigin(0.5, 0.9).setAlpha(0));
  await k.counter(c.scene, k.slow(180), (u) => {
    fan.forEach((s, i) => s.setAlpha(1).setRotation((i - 1) * 0.45 * u * d));
  });
  const faces = ['card_d', 'card_s', 'card_h', 'card_c'];
  const arrive = new Map<CombatantView, ReturnType<typeof deferred>>(c.targets.map((t) => [t, deferred()]));
  c.targets.forEach((t, i) => {
    void (async () => {
      await k.wait(c.scene, k.slow(i * 90));
      c.sfx('cardFlick');
      if (fan[2 - i]) fan[2 - i]!.setAlpha(0);
      const p = chest(t);
      const card = k.v2Sprite(c, 'card_back', '#ffffff', h.x, h.y, 46, k.DEPTH + 34);
      const base = card.scaleX;
      const from = { x: h.x, y: h.y };
      const arc = i % 2 ? -50 : 70;
      const ang = Math.atan2(p.y - from.y, p.x - from.x);
      await k.counter(c.scene, k.slow(260), (u) => {
        card.setPosition(from.x + (p.x - from.x) * u, from.y + (p.y - from.y) * u - 4 * arc * u * (1 - u));
        card.setRotation(u * Math.PI * 6 * d).setScale(base, base * Math.max(0.2, Math.abs(Math.cos(u * Math.PI * 3))));
        if (Math.random() < 0.5) k.burst(c.scene, card.x, card.y, { colors: ['#ffffff', '#e5463b'], n: 1, speed: [5, 25], gravity: 0, life: [140, 240], size: [5, 7] });
      });
      // saplanma: kenarı hedefe dönük, hafif açılı, titrer
      c.sfx('cardSlice');
      const stuck = ang + Math.PI / 2 + (i ? -0.25 : 0.25);
      card.setScale(base, base * 0.42).setRotation(stuck).setPosition(p.x - d * 6, p.y + (i ? 8 : -6)).setDepth(t.container.depth + 1);
      k.burst(c.scene, p.x, p.y, { colors: BLOOD, n: 4, speed: [80, 220], angle: d > 0 ? [-0.8, 0.8] : [Math.PI - 0.8, Math.PI + 0.8], gravity: 600, life: [200, 360], size: [5, 8] });
      c.scene.tweens.add({ targets: card, rotation: stuck + 0.12, duration: k.slow(35), yoyo: true, repeat: 4 });
      c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 8, duration: k.slow(45), yoyo: true });
      arrive.get(t)?.resolve();
      // çevrilir, yüzü görünür, kâğıt kırıntısı
      await k.wait(c.scene, k.slow(260));
      await k.counter(c.scene, k.slow(120), (u) => card.setScale(base * Math.max(0.05, 1 - u), base * (0.42 + 0.58 * u)));
      swap(c, k, card, faces[(t.combatant.slot + i) % faces.length]!, '#ffffff');
      card.setRotation(0).setPosition(p.x, p.y - t.h * 0.35);
      const sb = card.scaleX;
      await k.counter(c.scene, k.slow(120), (u) => card.setScale(sb * u + 0.01, sb));
      await k.wait(c.scene, k.slow(160));
      k.burst(c.scene, card.x, card.y, { colors: PAPER, n: 12, speed: [60, 220], gravity: 260, life: [300, 560], size: [5, 9] });
      card.destroy();
    })();
  });
  void k.wait(c.scene, k.slow(260)).then(() => {
    for (const s of fan) c.scene.tweens.add({ targets: s, alpha: 0, duration: k.slow(160), onComplete: () => s.destroy() });
    c.actor.play('idle');
  });
  await k.hitsAt(c, (t) => arrive.get(t)?.promise ?? Promise.resolve(), k.wait(c.scene, k.slow(500)));
};

/** All In ışık sütunu (yumuşak doku). */
const pillarTex = (c: VfxCtx, k: VfxKit) =>
  k.softTexture(c.scene, 'v2gambler:pillar', 32, 96, (x, y) => {
    const u = Math.abs((x + 0.5) / 32 - 0.5) * 2;
    const body = (1 - u ** 1.8) ** 1.2;
    const top = Math.min(1, (y + 1) / 40);
    return { c: u < 0.3 ? '#ffffff' : u < 0.62 ? '#fff2b0' : '#ffd23f', a: body * top };
  });

/** Renk karışımı (0xRRGGBB, u 0..1). */
const mixHex = (a: number, b: number, u: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * All In KAYBI (Ömer: 'çok kaybediyormuş gibi değil'): zar hedefin önüne boğuk düşer, tek göz gelir, altını solar, çatlar ve ikiye
 * ayrılır; parçalardan biri hedefe güçsüzce yuvarlanıp değer (vuruş: zayıf, gri toz). Ardından (vuruştan sonra) Gambler'ın üstüne
 * kararma ve sendeleme (geri yalpalar), bedeninden çıkan mavi mana kıvılcımları titreyip griye döner ve söner (MP boşa gitti), başının
 * üstünde beliren bahis paraları kararır, ufalanıp kül tozu olarak yere dökülür. Ses: allInLose (boğuk düşüş + çatlama + para dökülmesi +
 * iç çekiş). Vuruş parçanın değdiği an (zar düştükten ~0,65 sn sonra); kuyruk ~1,4 sn.
 */
async function allinLost(c: VfxCtx, k: VfxKit, die: Img, dim: Phaser.GameObjects.Rectangle, land: Pt, t: CombatantView, d: number): Promise<void> {
  const view = c.actor;
  const a = view.container;
  c.sfx('allInLose');
  // ekran soğuk griye çöker (kazancın sıcak kararmasının tersi)
  dim.setFillStyle(0x0a0d18, 1);
  c.scene.tweens.add({ targets: dim, alpha: 0.42, duration: k.slow(260) });
  // 1) boğuk düşüş: altın ışık yok, yalnızca gri toz; zar kayarak durur, sallanır, altını solar
  k.burst(c.scene, land.x, land.y + 22, { colors: ['#5b6579', '#6b6558', '#98a2b4'], n: 8, speed: [40, 150], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 500, life: [260, 460], size: [7, 11] });
  k.dustCloud(c.scene, land.x, land.y + 26, { n: 2, spread: 40, rise: 18, size: [34, 54], tint: 0x6b6558, life: 700 });
  const x0 = die.x;
  await k.counter(c.scene, k.slow(260), (u) => {
    const e = 1 - (1 - u) ** 2;
    die.setPosition(x0 + d * 22 * e, land.y - Math.abs(Math.sin(u * Math.PI * 2)) * 6 * (1 - u)).setRotation(Math.sin(u * Math.PI * 3) * 0.3 * (1 - u));
    die.setTint(mixHex(0xffffff, 0x625c50, u));
  });
  die.setRotation(0);
  // 2) çatlak büyür (zig-zag), altın kıymıklar
  const s = die.displayWidth;
  const crack = c.scene.add.graphics().setDepth(die.depth + 1);
  const pts: Array<[number, number]> = [[-0.1, -0.42], [0.04, -0.2], [-0.07, -0.02], [0.08, 0.14], [-0.02, 0.28], [0.06, 0.42]];
  await k.counter(c.scene, k.slow(150), (u) => {
    crack.clear().lineStyle(Math.max(3, s * 0.05), 0x15101c, 1).beginPath();
    const n = Math.max(1, Math.round(u * (pts.length - 1)));
    crack.moveTo(die.x + pts[0]![0] * s, die.y + pts[0]![1] * s);
    for (let i = 1; i <= n; i++) crack.lineTo(die.x + pts[i]![0] * s, die.y + pts[i]![1] * s);
    crack.strokePath();
    if (u > 0.5) crack.lineStyle(2, 0x15101c, 1).lineBetween(die.x - 0.07 * s, die.y - 0.02 * s, die.x - 0.26 * s, die.y + 0.06 * s);
  });
  k.burst(c.scene, die.x, die.y, { colors: ['#c4821a', '#8a7f6a', '#fdfaf2'], n: 6, speed: [60, 180], gravity: 700, life: [240, 420], size: [5, 8] });
  // 3) ikiye ayrılır: sol yarım geriye düşer, sağ yarım hedefe güçsüzce yuvarlanır
  const key = die.texture.key;
  const fw = die.frame.width;
  const fh = die.frame.height;
  const half = (left: boolean): Img =>
    c.scene.add.image(die.x, die.y, key).setDisplaySize(die.displayWidth, die.displayHeight).setDepth(die.depth).setTint(0x625c50).setCrop(left ? 0 : fw / 2, 0, fw / 2, fh);
  const L = half(true);
  const R = half(false);
  die.destroy();
  c.scene.tweens.add({ targets: crack, alpha: 0, duration: k.slow(120), onComplete: () => crack.destroy() });
  k.dustCloud(c.scene, L.x, L.y + 10, { n: 2, spread: 26, rise: 30, size: [26, 40], tint: 0x5f5a50, life: 620 });
  void arcTo(c, k, L, { x: L.x - d * 46, y: land.y + 22 }, 300, 30, -0.45 * d, 'in').then(() => {
    k.burst(c.scene, L.x, L.y + 10, { colors: ['#5b6579', '#6b6558'], n: 4, speed: [30, 90], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: 400, life: [200, 340], size: [6, 9] });
    c.scene.tweens.add({ targets: L, alpha: 0, delay: k.slow(500), duration: k.slow(400), onComplete: () => L.destroy() });
  });
  const f = feetOf(t);
  const p = { x: f.x - d * t.w * 0.32, y: f.y - 22 };
  await arcTo(c, k, R, p, 260, 18, 0.6 * d, 'out');
  // VURUŞ: zayıf, boğuk; gri toz
  k.hit(c.scene, p.x, p.y, ['#98a2b4', '#5b6579', '#6b6558'], 0.6);
  k.burst(c.scene, p.x, p.y, { colors: ['#5b6579', '#6b6558', '#8a7f6a'], n: 6, speed: [40, 140], gravity: 600, life: [240, 420], size: [6, 9] });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 6, duration: k.slow(70), yoyo: true });
  c.scene.tweens.add({ targets: R, alpha: 0, y: R.y + 10, delay: k.slow(260), duration: k.slow(380), onComplete: () => R.destroy() });

  // 4) KUYRUK (vuruştan sonra, arka planda): Gambler sendeler ve kararır, mana söner, paralar kül olur
  void (async () => {
    const body = { x: a.x, y: a.y - view.h * 0.55 };
    const top = { x: a.x, y: a.y - view.h - 120 };
    // a) bahis paraları başının üstünde belirir (kısa altın an)
    const coins = Array.from({ length: 9 }, (_, i) => {
      const u = i / 8 - 0.5;
      const cn = k.v2Sprite(c, 'coin', '#ffd23f', top.x + u * 230, top.y - Math.cos(u * Math.PI) * 40 + k.rnd(-8, 8), k.rnd(38, 46), k.DEPTH + 52).setAlpha(0);
      return { cn, y0: cn.y, sx: cn.scaleX, sy: cn.scaleY, ph: k.rnd(0, Math.PI * 2), drop: k.rnd(70, 120) };
    });
    // b) mana kıvılcımları bedenden çıkar
    const sparks = Array.from({ length: 24 }, () => {
      const r = c.scene.add.rectangle(body.x + k.rnd(-view.w * 0.4, view.w * 0.4), body.y + k.rnd(-view.h * 0.35, view.h * 0.4), 8, 8, 0x4aa3ff).setDepth(k.DEPTH + 45).setAlpha(0);
      return { r, x: r.x, y: r.y, dy: k.rnd(16, 40), fall: k.rnd(30, 70), d0: k.rnd(0, 0.25) };
    });
    // c) sendeleme: geri yalpalar, iki kez sallanır, toparlanır; üstüne kararma
    view.play('hit');
    const ax = a.x;
    const ay = a.y;
    const sp = view.sprite;
    const stagger = k.counter(c.scene, k.slow(1100), (u) => {
      const back = u < 0.2 ? u / 0.2 : u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      const wob = u > 0.18 && u < 0.62 ? Math.sin(((u - 0.18) / 0.44) * Math.PI * 3) * 0.035 : 0;
      a.setPosition(ax - d * 14 * back, ay + 5 * back).setRotation(-d * (0.075 * back + wob));
      const dark = u < 0.15 ? u / 0.15 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      sp.setTint(mixHex(0xffffff, 0x4c4660, dark * 0.85));
    });
    const fizzle = k.counter(c.scene, k.slow(900), (u) => {
      for (const s2 of sparks) {
        const v = Math.max(0, Math.min(1, (u - s2.d0) / 0.75));
        if (v <= 0) continue;
        if (v < 0.4) {
          // yükselir, parlar
          const w = v / 0.4;
          s2.r.setPosition(Math.round(s2.x), Math.round(s2.y - s2.dy * w)).setFillStyle(w > 0.5 ? 0xa8ebff : 0x4aa3ff).setAlpha(1);
        } else {
          // titrer, griye döner, düşerek küçülür ve söner
          const w = (v - 0.4) / 0.6;
          const flick = Math.sin(w * 40 + s2.x) > 0.2 ? 1 : 0.35;
          s2.r.setPosition(Math.round(s2.x + Math.sin(w * 9) * 3), Math.round(s2.y - s2.dy + s2.fall * w * w)).setFillStyle(mixHex(0x4aa3ff, 0x3a4050, Math.min(1, w * 1.6))).setAlpha((1 - w) * flick).setScale(1 - w * 0.7);
        }
      }
    });
    // paralar: belirir (0-0,15), kararır (0,15-0,5), ufalanıp düşer (0,5-1)
    let crumbled = false;
    const coinRun = k.counter(c.scene, k.slow(1200), (u) => {
      for (const o of coins) {
        const spin = Math.max(0.15, Math.abs(Math.cos(u * 6 + o.ph)));
        if (u < 0.15) o.cn.setAlpha(u / 0.15).setScale(o.sx * spin, o.sy);
        else if (u < 0.5) {
          const w = (u - 0.15) / 0.35;
          o.cn.setAlpha(1).setScale(o.sx * spin, o.sy).setTint(mixHex(0xffffff, 0x3a3428, w)).setY(o.y0 + w * 6);
        } else {
          const w = (u - 0.5) / 0.5;
          o.cn.setScale(o.sx * spin * (1 - w * 0.6), o.sy * (1 - w)).setAlpha(1 - w).setY(o.y0 + 6 + o.drop * w * w);
        }
      }
      if (u >= 0.5 && !crumbled) {
        crumbled = true;
        for (const o of coins) {
          swap(c, k, o.cn, 'coindark', '#98a2b4');
          o.cn.setTint(0x6b6558);
          k.burst(c.scene, o.cn.x, o.cn.y, { colors: ['#9a9284', '#6b6558', '#5b6579', '#3a3428'], n: 10, speed: [10, 80], angle: [Math.PI * 0.15, Math.PI * 0.85], gravity: 520, life: [620, 980], size: [6, 10] });
        }
        void k.wait(c.scene, k.slow(420)).then(() => k.dustCloud(c.scene, a.x, a.y - 4, { n: 3, spread: 90, rise: 16, size: [40, 64], tint: 0x5f5a50, life: 800 }));
      }
    });
    await Promise.all([stagger, fizzle, coinRun]);
    for (const o of coins) o.cn.destroy();
    for (const s2 of sparks) s2.r.destroy();
    a.setPosition(ax, ay).setRotation(0);
    sp.clearTint();
    view.play('idle');
    c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(420), onComplete: () => dim.destroy() });
  })();
}

/**
 * All In (tüm MP bahis, %75 jackpot): ekran kararır, kalp atışı hızlanır; Gambler'ın bedeninden mavi mana kıvılcımları sarmal çizerek
 * başının üstüne toplanır ve altın zara dönüşür (bütün mana ortada); zar nabız gibi şişer. Atış: yüksek yay, hedefin önüne düşer,
 * yuvarlanıp hedefe çarpar (vuruş). Jackpot: üst yüz 6, yumuşak altın ışık sütunu iner, altın yağmuru ve paralar; kayıp: bkz. allinLost
 * (tek göz, zar çatlayıp parçalanır; Gambler kararıp sendeler, mana söner, paralar kül olur). Vuruş ~2,1 sn (x1,2; v1 ~2,6 sn).
 */
const allin: V2Vfx = async (c, k) => {
  const t = c.targets[0];
  if (!t) return;
  const d = facing(c);
  const won = c.result?.bet === 'win';
  const lost = c.result?.bet === 'lose';
  const a = c.actor.container;
  const top = { x: a.x, y: a.y - c.actor.h - 70 };
  c.actor.play('cast');
  c.sfx('heartbeatRise');
  const dim = c.scene.add.rectangle(960, 540, FULL_W, 1080, 0x140c02, 0).setDepth(k.DEPTH - 25);
  c.scene.tweens.add({ targets: dim, alpha: 0.36, duration: k.slow(520) });
  // 1) mana -> altın zar
  c.sfx('manaToGold');
  k.burst(c.scene, a.x, a.y - c.actor.h * 0.5, { colors: MANA, n: 6, speed: [40, 140], gravity: -60, life: [260, 460], size: [5, 8] });
  const motes = Array.from({ length: 26 }, (_, i) => {
    const r = c.scene.add.rectangle(a.x + k.rnd(-c.actor.w * 0.35, c.actor.w * 0.35), a.y - k.rnd(10, c.actor.h * 0.9), 5, 5, 0xa8ebff).setDepth(k.DEPTH + 30);
    return { r, x0: r.x, y0: r.y, ph: (i / 26) * Math.PI * 2, delay: k.rnd(0, 0.35) };
  });
  const die = k.v2Sprite(c, 'gdie_a', '#ffd166', top.x, top.y, 84, k.DEPTH + 40).setAlpha(0);
  const dieBase = die.scaleX;
  await k.counter(c.scene, k.slow(620), (u) => {
    for (const m of motes) {
      const v = Math.max(0, Math.min(1, (u - m.delay) / 0.6));
      const ang = m.ph + v * Math.PI * 3;
      const rr = 60 * (1 - v);
      const x = m.x0 + (top.x + Math.cos(ang) * rr - m.x0) * v;
      const y = m.y0 + (top.y + Math.sin(ang) * rr * 0.4 - m.y0) * v;
      m.r.setPosition(Math.round(x), Math.round(y)).setFillStyle(v > 0.7 ? 0xffd23f : v > 0.4 ? 0xffffff : 0xa8ebff).setAlpha(v >= 1 ? 0 : 1);
    }
    die.setAlpha(Math.max(0, (u - 0.55) / 0.45)).setScale(dieBase * (0.4 + 0.6 * u));
  });
  for (const m of motes) m.r.destroy();
  k.burst(c.scene, top.x, top.y, { colors: GOLD, n: 10, speed: [60, 200], gravity: 0, life: [260, 420], size: [6, 9] });
  // 2) nabız: zar şişip iner, döner
  const stopSpin = tumble(c, k, die, ['gdie_a', 'gdie_b', 'gdie_c'], '#ffd166', 90);
  for (const b of [0, 0.16, 0.36, 0.5]) {
    void k.wait(c.scene, k.slow(b * 1000)).then(() => {
      if (!die.active) return;
      die.setScale(dieBase * 1.18);
      c.scene.tweens.add({ targets: die, scaleX: dieBase, scaleY: dieBase, duration: k.slow(120) });
    });
  }
  await k.counter(c.scene, k.slow(480), (u) => die.setPosition(top.x + Math.sin(u * 50) * 2 * u, top.y));
  // 3) atış: yüksek yay, hedefin önüne düşer, yuvarlanır, çarpar
  c.actor.play('attack');
  const f = feetOf(t);
  const land = { x: f.x - d * (t.w * 0.5 + 60), y: f.y - 26 };
  await arcTo(c, k, die, land, 430, 220, 2.5 * d, 'lin');
  if (lost) {
    stopSpin();
    swap(c, k, die, 'gdie_one', '#ffd166');
    await allinLost(c, k, die, dim, land, t, d);
    return;
  }
  c.sfx('diceRoll');
  void k.ring(c.scene, land.x, land.y + 26, { r: 60, flat: 0.32, n: 16, colors: GOLD, dur: 280, size: 8 });
  k.burst(c.scene, land.x, land.y + 20, { colors: ['#98a2b4', '#5b6579', '#e3b983'], n: 6, speed: [60, 200], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 400, life: [240, 420], size: [8, 12] });
  const p = chest(t);
  await arcTo(c, k, die, { x: p.x - d * 20, y: p.y + 16 }, 220, 50, 1.2 * d, 'in');
  stopSpin();
  swap(c, k, die, 'gdie_six', '#ffd166');
  die.setRotation(0);
  c.sfx('allInSlam');
  c.scene.tweens.add({ targets: dim, alpha: 0, duration: k.slow(480), onComplete: () => dim.destroy() });
  c.scene.tweens.add({ targets: t.container, x: t.container.x + d * 24, duration: k.slow(70), yoyo: true });
  k.hit(c.scene, p.x, p.y, GOLD, won ? 2.1 : 1.5);
  k.shake(c.scene, won ? 300 : 180, won ? 0.011 : 0.006);
  k.burst(c.scene, p.x, p.y, { colors: GOLD, n: won ? 34 : 18, speed: [160, 560], angle: [-Math.PI, 0], gravity: 800, life: [460, 860], size: [7, 14] });
  k.grow(c.scene, die, 1, 1.6, 360, 'Quad.easeOut', { alpha: 0, onComplete: () => die.destroy() });
  if (won) {
    c.sfx('coinSpill');
    k.flash(c.scene, '#ffd23f', 0.4, 380);
    const pil = c.scene.add.image(p.x, -40, pillarTex(c, k)).setOrigin(0.5, 0).setDisplaySize(130, f.y + 40).setDepth(k.DEPTH + 10).setAlpha(0.9).setBlendMode(k.Phaser.BlendModes.ADD);
    pil.setCrop(0, 0, 32, 1);
    void k.counter(c.scene, k.slow(200), (u) => pil.setCrop(0, 0, 32, Math.max(1, Math.round(96 * u * u)))).then(() => {
      pil.setCrop();
      c.scene.tweens.add({ targets: pil, alpha: 0, displayWidth: 40, duration: k.slow(620), ease: 'Quad.easeIn', onComplete: () => pil.destroy() });
    });
    for (let i = 0; i < 26; i++) {
      const cn = k.v2Sprite(c, 'coin', '#ffd23f', p.x + k.rnd(-200, 200), f.y - k.rnd(380, 600), k.rnd(20, 30), k.DEPTH + 55).setAlpha(0);
      const sx = cn.scaleX;
      c.scene.tweens.add({ targets: cn, scaleX: sx * 0.15, yoyo: true, repeat: 6, duration: k.slow(75), delay: k.slow(i * 24) });
      c.scene.tweens.add({
        targets: cn,
        y: f.y + k.rnd(-26, 30),
        duration: k.slow(k.rnd(600, 860)),
        delay: k.slow(i * 24),
        ease: 'Bounce.easeOut',
        onStart: () => cn.setAlpha(1),
        onComplete: () => c.scene.tweens.add({ targets: cn, alpha: 0, delay: k.slow(300), duration: k.slow(300), onComplete: () => cn.destroy() }),
      });
    }
    await k.wait(c.scene, k.slow(200));
  }
  c.actor.play('idle');
};

export const VFX: Record<string, V2Vfx> = { loadeddice, duelbet, cardfan, allin };
