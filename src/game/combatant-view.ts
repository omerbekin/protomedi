import Phaser from 'phaser';
import { paintedOr } from '../ui/misc-icons';
import layout from '../../data/battle-layout.json';
import type { Combatant, TargetPreview } from '../engine';
import { animKey, characterTexture, type AnimName } from './assets';
import { debugState } from './debug-state';
import { formatHit, hitColor } from './hit-format';
import { type DamageTags, FLOAT_ICON_TINT, damagePaintedIcon, floatStyle, floatTimes, placeFloat, rowLayout, type FloatKind } from './float-text';
import { ensureIcon } from './icons';
import { SHARED_KEY } from './asset-versions';
import { tierStyle, unitName } from './unit-label';
import { DISPLAY_FONT } from '../ui/menu-style';
import { ensureGlow } from './menu-ui';

/** floatText seçenekleri: tür (tipografi) ve rakamın solundaki/sağındaki küçük ikon (piksel ikon adı). */
export interface FloatOpts {
  kind?: FloatKind;
  leftIcon?: string;
  rightIcon?: string;
}

export const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const { spriteBox: box, hpBar, animation: timing, colors } = layout;

/** Skill animasyonları bu kat yavaş (Ömer: %20). */
export const SLOW = timing.skillSlowdown;
export const slow = (ms: number) => ms * SLOW;

/** Hasar / maks can oranından 0-1 arası vuruş şiddeti: ne kadar büyük vuruşsa efektler o kadar belirgin. */
export const hitLevel = (ratio: number) => Math.min(1, Math.max(0, ratio / timing.hitMaxRatio));
/** Hasar RAKAMI boyutu/rengi için seviye: kendi (daha düşük) barem değeri, can oranına göre. */
export const damageNumberLevel = (ratio: number) => Math.min(1, Math.max(0, ratio / timing.damageNumberMaxRatio));

export const textStyle = (px: number, fill: string = colors.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: layout.fontFamily,
  fontSize: `${px}px`,
  fontStyle: 'bold',
  color: fill,
  stroke: colors.textStroke,
  strokeThickness: Math.max(3, Math.round(px / 6)),
});

/** Tasarım kiti (dünya katmanı, Ömer 2026-10-09): ince altın çizgi, kor vurgu, düz rakamlı serif. */
const KIT = { gold: 0xd9b26a, on: 0xf3d999, ember: 0xe0702a, ember2: 0xffb35a, ink: 0x0c0806, back: 0x140d08 } as const;
/** Hedef parıltısı: yardımcı = yumuşak yeşil, zararlı = kor kırmızısı (eski saf yeşil / kırmızı yerine). */
const GLOW = { good: 0x6fe0a2, bad: 0xff5a32 } as const;
/** Rozet / önizleme rakamları: düz rakamlı serif, koyu kenar + yumuşak gölge. */
const NUM_FONT = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
export const numStyle = (px: number, fill: string = colors.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: NUM_FONT,
  fontSize: `${px}px`,
  fontStyle: 'bold',
  color: fill,
  stroke: '#140c06',
  strokeThickness: Math.max(3, Math.round(px / 6)),
  shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.8)', blur: 4, stroke: true, fill: true },
});

/** Şiddete göre hasar rengi: sarı -> turuncu -> kırmızı. */
const damageColor = (level: number) => (level < 0.34 ? colors.damage : level < 0.67 ? colors.damageMid : colors.damageHigh);

/** Zırh değerinden 0-1 belirginlik: zırh arttıkça ikon büyür ve daha opak olur. */
export const armorProminence = (armor: number) => Math.min(1, Math.max(0, armor / layout.armorIcon.maxArmor));

/** Sahnedeki tek bir karakter: sprite (veya placeholder), isim, can / MP çubuğu, kalkan çubukları, zırh ve durum ikonları. */
export class CombatantView {
  readonly container: Phaser.GameObjects.Container;
  /** Ölüm animasyonu bitti: birim sahnede görünmez (diriltme hedefi olarak hayalet gösterilebilir). */
  private fallen = false;
  private baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Ekranda kaplanan boyut (sprite, spriteBox içine oranı korunarak sığdırılır). */
  readonly w: number;
  readonly h: number;
  /** Zırh ikonları (fiziksel, büyü): sınıf zırhı yoksa yok. Boyut ve opaklık zırhla artar. */
  private readonly hpBox: Phaser.GameObjects.Container;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpGhost: Phaser.GameObjects.Rectangle;
  private readonly mpFill: Phaser.GameObjects.Rectangle;
  /** SPEED (sıra sayacı) çubuğu: mana çubuğunun altında, yalnızca turns modunda görünür. */
  private readonly speedBox: Phaser.GameObjects.Container;
  private readonly speedFill: Phaser.GameObjects.Rectangle;
  private readonly speedGlow: Phaser.GameObjects.Rectangle;
  private speedFull = false;
  private readonly shieldFill: Phaser.GameObjects.Rectangle;
  private readonly magicShieldFill: Phaser.GameObjects.Rectangle;
  private readonly statusBox: Phaser.GameObjects.Container;
  private readonly sealBox: Phaser.GameObjects.Container;
  private glowFx?: Phaser.FX.Glow;
  private glowKey = '';
  /** Sırası gelen birim: adın üstünde küçük kor elmas (eski sarı ok yerine). */
  private readonly marker: Phaser.GameObjects.Graphics;
  /** Sırası gelen birimin ayaklarının altında kor / altın halka (yavaşça nabız atar). */
  private readonly footRing: Phaser.GameObjects.Graphics;
  /** Ctrl+tık seçimi: birimin çevresinde ince çerçeve. */
  private readonly selFrame: Phaser.GameObjects.Graphics;
  private readonly realSprite: boolean;
  private homeX: number;
  private readonly hpY: number;
  private readonly shieldY: number;
  private previewItems: Phaser.GameObjects.GameObject[] = [];
  /** Ad, can / MP / hız çubukları, durum ikonları, işaretler: sonuç ekranında birlikte söner (`setOverlayHidden`). */
  private overlayParts: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Alpha> = [];
  private overlayAlpha: number[] | null = null;
  /** Yüzen yazı şeritleri: her şeridi tutan yazının punto değeri (float-text.ts > placeFloat). */
  private lanes: Array<number | undefined> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly combatant: Combatant,
    x: number,
    y: number,
  ) {
    this.homeX = x;
    this.baseY = y;
    const tex = characterTexture(scene, combatant.spriteId, combatant.color);
    this.realSprite = tex.real;

    this.sprite = scene.add.sprite(0, 0, tex.key).setOrigin(0.5, 1);
    // Çok kareli sheet'te ilk kare; tek resimde tüm resim
    if (tex.real && scene.textures.get(tex.key).has('0')) this.sprite.setFrame(0);
    const scale = Math.min(box.width / this.sprite.frame.width, box.height / this.sprite.frame.height) * (combatant.spriteScale ?? 1);
    this.sprite.setScale(scale);
    this.w = this.sprite.frame.width * scale;
    this.h = this.sprite.frame.height * scale;
    // Küçültülen illüstrasyon yumuşak, büyütülen pixel art/placeholder keskin görünür
    scene.textures
      .get(tex.key)
      .setFilter(scale < 1 ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
    if (combatant.side === 'enemy') this.sprite.setFlipX(true);

    // Gerçek sprite'ların altına yer gölgesi (placeholder dokusunda zaten var)
    const shadow = tex.real ? scene.add.ellipse(0, -6, this.w * 0.8, 24, 0x000000, 0.35) : undefined;

    this.hpY = -this.h - hpBar.offsetY;
    const mpY = this.hpY + hpBar.height / 2 + hpBar.mpHeight / 2 + 3;
    this.shieldY = this.hpY - hpBar.height / 2 - 5;
    // Tasarım kiti: koyu zemin + ince altın çizgi; dışında yumuşak koyu kenar (parlak arenada çubuk seçilsin)
    const hpOuter = scene.add.rectangle(0, this.hpY, hpBar.width + 6, hpBar.height + 6, 0x050302, 0.55);
    const hpBack = scene.add.rectangle(0, this.hpY, hpBar.width, hpBar.height, KIT.back, 0.92).setStrokeStyle(1, KIT.gold, 0.6);
    // Hayalet çubuk: can düşünce bir süre eski seviyede kalıp yavaşça iner (büyük vuruşta daha uzun ve belirgin)
    this.hpGhost = scene.add.rectangle(-hpBar.width / 2, this.hpY, hpBar.width, hpBar.height, color('#ffd6a0')).setOrigin(0, 0.5);
    this.hpFill = scene.add
      .rectangle(-hpBar.width / 2, this.hpY, hpBar.width, hpBar.height, color(combatant.side === 'party' ? colors.hpFill : colors.hpFillEnemy))
      .setOrigin(0, 0.5);
    this.hpBox = scene.add.container(0, 0, [hpOuter, hpBack, this.hpGhost, this.hpFill]);
    const mpBack = scene.add
      .rectangle(0, mpY, hpBar.width, hpBar.mpHeight, KIT.back, 0.92)
      .setStrokeStyle(1, KIT.gold, 0.4)
      .setVisible(combatant.maxMp > 0);
    this.mpFill = scene.add
      .rectangle(-hpBar.width / 2, mpY, hpBar.width, hpBar.mpHeight, color(colors.mpFill))
      .setOrigin(0, 0.5)
      .setVisible(combatant.maxMp > 0);
    // SPEED çubuğu: mana çubuğunun altında ince bir şerit; sayaç dolunca (sıra bu karakterde) parlar
    const spdY = mpY + hpBar.mpHeight / 2 + hpBar.speedHeight / 2 + 3;
    const speedBack = scene.add.rectangle(0, spdY, hpBar.width, hpBar.speedHeight, KIT.back, 0.9).setStrokeStyle(1, KIT.gold, 0.32);
    this.speedFill = scene.add.rectangle(-hpBar.width / 2, spdY, 0, hpBar.speedHeight, color(colors.speedFill)).setOrigin(0, 0.5);
    this.speedGlow = scene.add.rectangle(0, spdY, hpBar.width + 6, hpBar.speedHeight + 6, 0xffffff, 0).setStrokeStyle(1.5, KIT.ember2).setVisible(false);
    this.speedBox = scene.add.container(0, 0, [speedBack, this.speedFill, this.speedGlow]).setVisible(false);
    // Kalkan çubukları: can çubuğunun hemen üstünde ince çizgiler (genel: açık mavi, büyü: mor)
    this.shieldFill = scene.add.rectangle(-hpBar.width / 2, this.shieldY, 0, 6, color(colors.shield)).setOrigin(0, 0.5);
    this.magicShieldFill = scene.add.rectangle(-hpBar.width / 2, this.shieldY - 7, 0, 6, color(colors.magicShield)).setOrigin(0, 0.5);
    // Ad plakası: sefer özel adı ('Bandit Chief') ya da class adı; elit altın, boss kızıl yazı + üstünde küçük rütbe rozeti
    const tier = tierStyle(combatant.tier);
    const isBoss = tier?.tier === 'boss';
    // Tasarım kiti: Cinzel 600 (kitin başlık yazısı), koyu kenar + yumuşak gölge (parlak arenada okunur)
    const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: DISPLAY_FONT,
      fontSize: `${isBoss ? 32 : 26}px`,
      fontStyle: '600',
      color: tier?.hex ?? '#f4ead2',
      stroke: '#120a05',
      strokeThickness: 4,
      letterSpacing: 0.5,
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.85)', blur: 5, stroke: true, fill: true },
    };
    if (isBoss) {
      // Boss: kalın koyu kenar + ince kor/altın parıltı (BOSS rozetiyle uyumlu); tek ve büyük olduğu için geniş alan
      nameStyle.stroke = '#12060a';
      nameStyle.strokeThickness = 7;
      nameStyle.shadow = { offsetX: 0, offsetY: 0, color: '#f0a43a', blur: 10, stroke: true, fill: true };
    }
    const name = scene.add.text(0, this.hpY - hpBar.height - 4, unitName(combatant), nameStyle).setOrigin(0.5, 1);
    if (isBoss) {
      // Çok uzunsa iki satıra böl (orta boşluktan), hâlâ taşıyorsa ORANI KORUYARAK küçült
      const maxBossW = hpBar.width * 2.2;
      const full = unitName(combatant);
      if (name.width > maxBossW && full.includes(' ')) {
        const mid = full.length / 2;
        let cut = -1;
        for (let i = 0; i < full.length; i++) if (full[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
        name.setText(`${full.slice(0, cut)}\n${full.slice(cut + 1)}`).setAlign('center');
      }
      if (name.width > maxBossW) name.setScale(maxBossW / name.width);
    } else if (tier) {
      // Elit: oranı bozan sıkıştırma yok, orantılı küçült
      const maxNameW = hpBar.width * 2;
      if (name.width > maxNameW) name.setScale(maxNameW / name.width);
    } else {
      const maxNameW = hpBar.width * 1.7; // uzun özel adlar ('Bandit Chief') komşu hücrenin adına taşmasın
      if (name.width > maxNameW) name.setScale(maxNameW / name.width);
    }
    const tierBadge: Phaser.GameObjects.GameObject[] = [];
    if (tier) {
      // Rütbe rozeti (kit etiketi): koyu zemin + rütbe renginde ince çerçeve ve Cinzel yazı
      const label = scene.add.text(0, name.y - name.height * name.scaleY - 2, tier.label.toUpperCase(), { fontFamily: DISPLAY_FONT, fontSize: '14px', fontStyle: '600', color: tier.hex, letterSpacing: 2 }).setOrigin(0.5, 1);
      const bg = scene.add.rectangle(0, label.y - label.height / 2, label.width + 16, label.height + 2, KIT.ink, 0.92).setStrokeStyle(1, color(tier.hex), 0.9);
      tierBadge.push(bg, label);
    }
    // Sırası gelen birim: adın üstünde kor elmas (eski sarı ok) + ayaklarının altında kor / altın halka
    const my = this.hpY - hpBar.height - 62 + 14;
    this.marker = scene.add.graphics().setVisible(false);
    const dpts = (r: number) => [new Phaser.Math.Vector2(0, my - r), new Phaser.Math.Vector2(r, my), new Phaser.Math.Vector2(0, my + r), new Phaser.Math.Vector2(-r, my)];
    this.marker.fillStyle(KIT.ember, 0.25).fillPoints(dpts(17), true);
    this.marker.fillStyle(KIT.ember, 1).fillPoints(dpts(11), true);
    this.marker.lineStyle(1.5, KIT.ember2, 1).strokePoints(dpts(11), true);
    this.marker.lineStyle(2, 0x1a0c04, 0.8).strokePoints(dpts(13), true);
    this.footRing = scene.add.graphics().setVisible(false);
    const rw = Math.max(110, this.w * 0.95);
    this.footRing.lineStyle(10, KIT.ember, 0.14).strokeEllipse(0, -6, rw + 8, 32);
    this.footRing.lineStyle(2, KIT.ember2, 0.9).strokeEllipse(0, -6, rw, 26);
    this.footRing.lineStyle(1, KIT.on, 0.55).strokeEllipse(0, -6, rw - 16, 19);

    // Ctrl+tık seçimi (debug birim araçları): ayakların altında ince açık mavi halka + üstte küçük köşe çizgileri (eski kutu yerine)
    this.selFrame = scene.add.graphics().setVisible(false);
    this.selFrame.lineStyle(2, 0x8ec9ff, 0.95).strokeEllipse(0, -6, rw + 22, 34);
    const bw = this.w / 2 + 10;
    const top = -this.h - 8;
    this.selFrame.lineStyle(2, 0x8ec9ff, 0.85);
    for (const sx of [-1, 1]) this.selFrame.beginPath().moveTo(sx * bw, top + 18).lineTo(sx * bw, top).lineTo(sx * (bw - 18), top).strokePath();

    // Durum ikonları (taunt, guard, regen) can çubuğunun solunda
    this.statusBox = scene.add.container(0, this.hpY);
    // Yığılan durum (Omen) mühür yuvaları: can çubuğunun SOL ucunun hemen üstünde
    this.sealBox = scene.add.container(-hpBar.width / 2, this.hpY - hpBar.height / 2 - 9);

    this.container = scene.add.container(x, y, [
      ...(shadow ? [shadow] : []),
      this.footRing,
      this.sprite,
      this.hpBox,
      mpBack,
      this.mpFill,
      this.speedBox,
      this.shieldFill,
      this.magicShieldFill,
      this.statusBox,
      this.sealBox,
      name,
      ...tierBadge,
      this.marker,
      this.selFrame,
    ]);
    this.container.setDepth(y); // öndeki sıra arkadakinin üstünde çizilir
    this.overlayParts = [this.hpBox, mpBack, this.mpFill, this.speedBox, this.shieldFill, this.magicShieldFill, this.statusBox, this.sealBox, name, ...tierBadge, this.marker, this.footRing, this.selFrame] as Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Alpha>;
    this.setHp(combatant.hp, false);
    this.setMp(combatant.mp, false);
    this.setShield(combatant.shield, combatant.magicShield, false);
    this.play('idle');
    if (combatant.empowered) this.setEmpowered(true); // beslenmiş çağrı (Raise Dead): kalıcı hafif mor aura
  }

  get alive(): boolean {
    return this.combatant.hp > 0;
  }

  /** Sonuç ekranı: ad plakası ve çubuklar yumuşakça söner (sprite kalır); false = eski hâline döner. */
  setOverlayHidden(hidden: boolean): void {
    const parts = this.overlayParts.filter((o) => o.active);
    this.scene.tweens.killTweensOf(parts);
    if (hidden) {
      if (!this.overlayAlpha) this.overlayAlpha = this.overlayParts.map((o) => o.alpha);
      this.scene.tweens.add({ targets: parts, alpha: 0, duration: 260 });
    } else if (this.overlayAlpha) {
      this.overlayParts.forEach((o, i) => o.active && o.setAlpha(this.overlayAlpha![i] ?? 1));
      this.overlayAlpha = null;
    }
  }

  /**
   * Targeting glow around the drawing itself (its outline, not a box): green = helpful effect, red = harmful one.
   * `strong` marks the unit(s) the effect will actually hit; weak marks units that can be chosen.
   */
  setGlow(kind: 'good' | 'bad' | null, strong = false): void {
    const key = kind ? `${kind}:${strong}` : '';
    if (key === this.glowKey) return;
    if (this.fallen) this.container.setAlpha(kind && strong ? 0.8 : 0); // düşmüş birim: yalnızca üstüne gelinen diriltme hedefi hayalet olur (yuvada ceset işareti durur; madde 222)
    this.glowKey = key;
    if (this.glowFx) {
      this.scene.tweens.killTweensOf(this.glowFx);
      this.sprite.postFX?.remove(this.glowFx);
      this.glowFx = undefined;
    }
    if (!kind || !this.sprite.postFX) return;
    const hex = kind === 'good' ? GLOW.good : GLOW.bad;
    // Weak: a thin, quiet rim. Strong: the pulsing glow around the unit that will be hit.
    const [lo, hi] = strong ? [5, 11] : [1.2, 2];
    const fx = this.sprite.postFX.addGlow(hex, lo, 0, false, 0.1, strong ? 16 : 8);
    this.glowFx = fx;
    this.scene.tweens.add({ targets: fx, outerStrength: hi, duration: strong ? 480 : 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Ctrl+tık ile seçili birimin çerçevesi (ince, açık mavi). */
  setSelected(on: boolean): void {
    this.selFrame.setVisible(on);
  }

  get selected(): boolean {
    return this.selFrame.visible;
  }

  /** Komut verilen (aktif) karakterin üstünde ok işareti. */
  setActive(on: boolean): void {
    const show = on && this.alive;
    if (show === this.marker.visible) return;
    this.marker.setVisible(show);
    this.footRing.setVisible(show);
    this.scene.tweens.killTweensOf([this.marker, this.footRing]);
    if (show) {
      this.footRing.setAlpha(1);
      this.marker.setY(0);
      this.scene.tweens.add({ targets: this.footRing, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.scene.tweens.add({ targets: this.marker, y: -6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  /** Dokunma/tıklama alanı: karakterin tamamı; fare üstüne gelince onOver/onOut çağrılır. */
  makeTappable(onTap: (p?: Phaser.Input.Pointer) => void, onOver?: () => void, onOut?: () => void): void {
    const zone = this.scene.add.zone(0, -this.h / 2, this.w + 24, this.h + 24).setInteractive();
    zone.on('pointerdown', onTap);
    if (onOver) zone.on('pointerover', onOver);
    if (onOut) zone.on('pointerout', onOut);
    this.container.add(zone);
  }

  /**
   * Can çubuğunu günceller. Can düşüyorsa `hitRatio` (hasar / maks can) şiddeti belirler:
   * büyük vuruşta çubuk sarsılır, beyaza yanar ve hayalet çubuk daha uzun süre görünür.
   */
  setHp(hp: number, animate = true, hitRatio = 0): void {
    const target = hpBar.width * Math.max(0, hp / this.combatant.maxHp);
    if (!animate) {
      this.hpFill.width = target;
      this.hpGhost.width = target;
      return;
    }
    this.scene.tweens.killTweensOf([this.hpFill, this.hpGhost]);
    if (target < this.hpFill.width - 0.5) {
      const level = hitLevel(hitRatio);
      this.hpGhost.width = Math.max(this.hpGhost.width, this.hpFill.width);
      this.scene.tweens.add({ targets: this.hpFill, width: target, duration: slow(140), ease: 'Quad.easeOut' });
      this.scene.tweens.add({
        targets: this.hpGhost,
        width: target,
        delay: timing.hpGhostDelayMs * (1 + level),
        duration: timing.hpGhostBaseMs + timing.hpGhostPerLevelMs * level,
        ease: 'Quad.easeIn',
      });
      if (level > 0.15) this.flashHpBar(level);
    } else {
      this.hpGhost.width = target;
      this.scene.tweens.add({ targets: this.hpFill, width: target, duration: 300, ease: 'Quad.easeOut' });
    }
  }

  private flashHpBar(level: number): void {
    const original = this.combatant.side === 'party' ? colors.hpFill : colors.hpFillEnemy;
    this.hpFill.setFillStyle(0xffffff);
    this.scene.time.delayedCall(60 + 120 * level, () => this.hpFill.setFillStyle(color(original)));
    const amp = 3 + 14 * level;
    this.scene.tweens.add({ targets: this.hpBox, x: { from: amp, to: 0 }, duration: 120 + 260 * level, ease: 'Bounce.easeOut' });
  }

  setMp(mp: number, animate = true): void {
    if (this.combatant.maxMp <= 0) return;
    this.tweenWidth(this.mpFill, hpBar.width * Math.max(0, mp / this.combatant.maxMp), animate);
  }

  /**
   * SPEED çubuğu: `ratio` sıra sayacının eşiğe oranı (0-1); null = gizli (test modu, ölü birim).
   * Dolunca (1) çubuk açık sarıya döner ve parlayarak nabız atar: sıra bu karakterdedir.
   */
  setSpeed(ratio: number | null): void {
    if (ratio === null || !this.alive) {
      this.speedBox.setVisible(false);
      this.setSpeedFull(false);
      return;
    }
    this.speedBox.setVisible(true);
    this.speedFill.width = hpBar.width * Math.max(0, Math.min(1, ratio));
    this.setSpeedFull(ratio >= 1);
  }

  private setSpeedFull(full: boolean): void {
    if (full === this.speedFull) return;
    this.speedFull = full;
    this.scene.tweens.killTweensOf(this.speedGlow);
    this.speedGlow.setVisible(full).setAlpha(1);
    this.speedFill.setFillStyle(color(full ? colors.speedFull : colors.speedFill));
    if (full) this.scene.tweens.add({ targets: this.speedGlow, alpha: 0.25, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  setShield(shield: number, magicShield: number, animate = true): void {
    this.tweenWidth(this.shieldFill, hpBar.width * Math.min(1, shield / this.combatant.maxHp), animate);
    this.tweenWidth(this.magicShieldFill, hpBar.width * Math.min(1, magicShield / this.combatant.maxHp), animate);
  }

  /**
   * Can çubuğunun yanındaki rozetler: durumlar (buff/debuff), üzerinde durulan yer etkileri (zehir, yanan zemin, holy fire)
   * ve zırh aurası gibi etkilerden gelen zırh bonusu. Her rozet ikon + kalan tur / değer.
   */
  setBadges(badges: Array<{ icon: string; owner?: string; color: string; text: string; debuff: boolean; turns: boolean }>): void {
    this.statusBox.removeAll(true);
    const size = layout.statusIcon.size;
    const hourglass = ensureIcon(this.scene, 'hourglass', '#d9c9a3', false);
    // Buffs on the left of the HP bar, debuffs (and harmful ground effects) on the right; 4 per row
    for (const debuff of [false, true]) {
      badges
        .filter((bd) => bd.debuff === debuff)
        .forEach((bd, i) => {
          const dir = debuff ? 1 : -1;
          const cx = dir * (hpBar.width / 2 + 8 + size / 2 + (i % 4) * (size + 6));
          const cy = Math.floor(i / 4) * (size + 4);
          const icon = this.scene.add.image(cx, cy, ensureIcon(this.scene, bd.icon, bd.color, false, bd.owner ?? SHARED_KEY)).setDisplaySize(size, size); // durum/zemin rozeti: sahibi (sınıfa özgü durum) ya da Shared sürümü
          const label = this.scene.add.text(cx + size / 2, cy + size / 2, bd.text, numStyle(18, bd.color)).setOrigin(1, 0.5);
          this.statusBox.add([icon, label]);
          if (bd.turns) this.statusBox.add(this.scene.add.image(label.x - label.width - 8, label.y, hourglass).setDisplaySize(15, 15));
        });
    }
  }

  /**
   * Yığılan durumun (Omen) mühür yuvaları: can çubuğunun sol ucunda `max` küçük elmas; dolu = durum renginde mühür + açık iç ışık, boş = sönük
   * kemik konturu; yanında kalan tur (küçük rakam: süre dolunca patlar). null = gizli (yığın yok / Doom patladı). hexer.md bölüm 8.
   */
  setSeals(s: { stacks: number; max: number; turns: number; color: string } | null): void {
    this.sealBox.removeAll(true);
    if (!s || s.stacks <= 0) return;
    const g = this.scene.add.graphics();
    const r = 6;
    const step = 15;
    for (let i = 0; i < s.max; i++) {
      const x = r + i * step;
      const pts = [new Phaser.Math.Vector2(x, -r), new Phaser.Math.Vector2(x + r, 0), new Phaser.Math.Vector2(x, r), new Phaser.Math.Vector2(x - r, 0)];
      if (i < s.stacks) {
        g.fillStyle(color(s.color), 1).fillPoints(pts, true);
        g.fillStyle(0xc9d27a, 0.9).fillRect(x - 1.5, -1.5, 3, 3);
        g.lineStyle(2, 0x1a0a18, 1).strokePoints(pts, true);
      } else {
        g.fillStyle(0x000000, 0.45).fillPoints(pts, true);
        g.lineStyle(2, 0xb8ad94, 0.8).strokePoints(pts, true);
      }
    }
    const turns = this.scene.add.text(r + s.max * step - 2, 0, String(s.turns), numStyle(14, '#e9dfc4')).setOrigin(0, 0.5);
    this.sealBox.add([g, turns]);
  }

  /**
   * Beslenmiş (ceset tüketilerek çağrılmış, `combatant.empowered`) birimin kalıcı, hafif mor aurası: sprite'ın arkasında yumuşak mor ışıma
   * (yavaş nabız), Skeleton'da gözlerde mor ışık, arada gövdeden yükselen tek tük mor kıvılcım. Sprite sınırını çok az aşar; hedef seçim
   * parıltısıyla (setGlow, postFX) çakışmaz. Beslenmemiş birimde yok.
   */
  private empowerFx: { items: Phaser.GameObjects.GameObject[]; timer: Phaser.Time.TimerEvent } | null = null;

  setEmpowered(on: boolean): void {
    if (on === !!this.empowerFx) return;
    if (!on) {
      const old = this.empowerFx!;
      this.empowerFx = null;
      old.timer.remove();
      for (const it of old.items) {
        this.scene.tweens.killTweensOf(it);
        this.scene.tweens.add({ targets: it, alpha: 0, duration: 260, onComplete: () => it.destroy() });
      }
      return;
    }
    const scene = this.scene;
    const key = 'fx:empoweraura';
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, 32, 48);
      if (tex) {
        const ctx = tex.getContext();
        for (let y = 0; y < 48; y++)
          for (let x = 0; x < 32; x++) {
            const d = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 26) / 22);
            if (d >= 1) continue;
            ctx.globalAlpha = Math.round((1 - d) ** 1.6 * 6) / 6;
            ctx.fillStyle = d < 0.35 ? '#e3ccff' : d < 0.7 ? '#b872ff' : '#5a2a9c';
            ctx.fillRect(x, y, 1, 1);
          }
        tex.refresh();
      }
    }
    const aura = scene.add.image(0, -this.h * 0.5, key).setDisplaySize(this.w * 1.05, this.h * 1.02).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.container.addAt(aura, this.container.getIndex(this.sprite));
    scene.tweens.add({ targets: aura, alpha: { from: 0.5, to: 0.8 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // ayak dibinde yassı mor ölü ışığı (koyu zeminde aurayı okunur kılar)
    const pool = scene.add.ellipse(0, -6, this.w * 0.9, 22, 0x7d3fb0, 0.3).setBlendMode(Phaser.BlendModes.ADD);
    this.container.addAt(pool, this.container.getIndex(aura));
    scene.tweens.add({ targets: pool, alpha: { from: 0.22, to: 0.4 }, scaleX: { from: 0.95, to: 1.05 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const items: Phaser.GameObjects.GameObject[] = [aura, pool];
    // Skeleton gözleri (sprite'taki göz çukurları: genişliğin %58 ve %64'ü, yüksekliğin %10'u; düşmanda ayna)
    if (this.combatant.spriteId === 'skeleton' && this.realSprite) {
      const flip = this.sprite.flipX ? -1 : 1;
      for (const u of [0.577, 0.637]) {
        const eye = scene.add.ellipse(flip * (u - 0.5) * this.w, -this.h * 0.9, 9, 6, 0xd9a8ff, 0.95).setBlendMode(Phaser.BlendModes.ADD);
        this.container.add(eye);
        scene.tweens.add({ targets: eye, alpha: { from: 0.95, to: 0.5 }, scaleX: { from: 1, to: 1.4 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        items.push(eye);
      }
    }
    // tek tük yükselen mor kıvılcım (kapta kalır: birim hareket edince birlikte gider)
    const timer = scene.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => {
        if (!this.container.active || this.fallen) return;
        const m = scene.add.rectangle(Phaser.Math.Between(-this.w * 0.3, this.w * 0.3), -this.h * Phaser.Math.FloatBetween(0.2, 0.8), 4, 4, Phaser.Math.RND.pick([0xb872ff, 0xe3ccff, 0x7d3fb0]));
        this.container.add(m);
        scene.tweens.add({ targets: m, y: m.y - Phaser.Math.Between(30, 60), alpha: 0, duration: 900, onComplete: () => m.destroy() });
      },
    });
    this.empowerFx = { items, timer };
  }

  /**
   * Vine Snare ile yere bağlanan (status `cause: 'vines'`, Stun) birimin bacaklarındaki kalın kök-sarmaşık sargısı: arka kıvrımlar sprite'ın
   * arkasında, öndekiler önünde; yavaşça sıkışıp gevşer. Stun bitince (statusEnd) ya da ölünce çözülüp yere iner. Sprite'ın alt üçte birinde kalır.
   */
  private vineWrap: { back: Phaser.GameObjects.Graphics; front: Phaser.GameObjects.Graphics } | null = null;

  setVineWrap(on: boolean): void {
    if (on === !!this.vineWrap) return;
    if (!on) {
      const old = this.vineWrap!;
      this.vineWrap = null;
      for (const g of [old.back, old.front]) {
        this.scene.tweens.killTweensOf(g);
        this.scene.tweens.add({ targets: g, alpha: 0, scaleY: 0.2, duration: slow(320), ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      }
      return;
    }
    const back = this.scene.add.graphics();
    const front = this.scene.add.graphics();
    const H = this.h * 0.3;
    const W = Math.max(24, this.w * 0.3);
    const turns = 2.1;
    const max = turns * Math.PI * 2;
    for (let a = 0; a <= max; a += 0.1) {
      const k = a / max;
      const x = Math.round(Math.cos(a) * W * (1 - 0.12 * k) / 2) * 2;
      const y = Math.round((-2 - k * H + Math.sin(a) * 6) / 2) * 2;
      const isFront = Math.sin(a) > 0;
      const g = isFront ? front : back;
      const th = isFront ? 12 : 9;
      g.fillStyle(0x2a1a0e, 1).fillRect(x - th / 2 - 1, y - th / 2 - 1, th + 2, th + 2);
      g.fillStyle(isFront ? (Math.round(a / 0.3) % 2 ? 0x8c5a2b : 0x6b4423) : 0x4a2e1a, 1).fillRect(x - th / 2, y - th / 2, th, th);
      const i = Math.round(a / 0.1);
      if (isFront && i % 4 === 0) g.fillStyle(0x62d04b, 1).fillRect(x - th / 2, y - th / 2, th, 3);
      if (isFront && i % 17 === 8) g.fillStyle(0xa8f08a, 1).fillRect(x - 7, y - 11, 14, 6).fillStyle(0x2c7a2b, 1).fillRect(x - 1, y - 9, 3, 3); // yaprak
    }
    const at = this.container.getIndex(this.sprite);
    this.container.addAt(back, at);
    this.container.addAt(front, at + 2);
    for (const g of [back, front]) {
      g.setScale(1, 0.1);
      this.scene.tweens.add({ targets: g, scaleY: 1, duration: slow(220), ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: g, scaleX: 0.94, duration: 900, yoyo: true, repeat: -1, delay: slow(300), ease: 'Sine.easeInOut' });
    }
    this.vineWrap = { back, front };
  }

  private tweenWidth(bar: Phaser.GameObjects.Rectangle, width: number, animate: boolean): void {
    if (!animate) {
      bar.width = width;
      return;
    }
    this.scene.tweens.add({ targets: bar, width, duration: 250, ease: 'Quad.easeOut' });
  }

  play(anim: AnimName): void {
    if (!this.realSprite) return;
    const key = animKey(this.combatant.spriteId, anim, this.scene);
    if (key && this.scene.anims.exists(key)) this.sprite.play(key);
  }

  /** Hedefe doğru atılıp geri döner. Vuruş anında onHit çağrılır. */
  lunge(towardX: number, onHit: () => void): Promise<void> {
    this.play('attack');
    const dir = Math.sign(towardX - this.homeX) || 1;
    const reach = Math.min(timing.attackLungeDistance, Math.abs(towardX - this.homeX) - this.w);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        x: this.homeX + dir * Math.max(0, reach),
        duration: slow(timing.attackDurationMs),
        ease: 'Quad.easeIn',
        yoyo: true,
        hold: slow(60),
        onYoyo: () => onHit(),
        onComplete: () => {
          this.play('idle');
          resolve();
        },
      });
    });
  }

  /**
   * Yerden çıkış: karakter zeminin altından yükselir; zemin çizgisinin altı bir geometri maskesiyle gizlenir (gömülü kısım görünmez).
   * `jitter`: yükselirken yanlara titreme (piksel). Çıkış bitince Promise çözülür.
   */
  riseFromGround(ms: number, jitter = 4): Promise<void> {
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(this.homeX - 500, this.baseY - 900, 1000, 900 + 4);
    this.container.setMask(g.createGeometryMask());
    this.container.setAlpha(1);
    this.container.setY(this.baseY + this.h + 16);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        y: this.baseY,
        duration: slow(ms),
        ease: 'Cubic.easeOut',
        onUpdate: () => this.container.setX(this.homeX + Phaser.Math.Between(-jitter, jitter)),
        onComplete: () => {
          this.container.setX(this.homeX);
          this.container.clearMask(true);
          resolve();
        },
      });
    });
  }

  /** Karakterin durduğu (ev) zemin noktası. */
  get home(): { x: number; y: number } {
    return { x: this.homeX, y: this.baseY };
  }

  /** Hızla (x, y) noktasına koşar; `ghost` doluysa arkasında bu renkte hayalet izler bırakır. Varışta çözülür. */
  approach(x: number, y: number, ms: number, ghost?: number): Promise<void> {
    this.play('attack');
    this.container.setDepth(3500);
    let next = 0;
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        x,
        y,
        duration: slow(ms),
        ease: 'Quad.easeIn',
        onUpdate: () => {
          const now = this.scene.time.now;
          if (ghost !== undefined && now >= next) {
            this.afterimage(ghost, 0.55, 260);
            next = now + 26;
          }
        },
        onComplete: () => resolve(),
      });
    });
  }

  /** Ev noktasına geri döner (isteğe bağlı hayalet izli). */
  returnHome(ms = 240, ghost?: number): Promise<void> {
    let next = 0;
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        x: this.homeX,
        y: this.baseY,
        duration: slow(ms),
        ease: 'Quad.easeOut',
        onUpdate: () => {
          const now = this.scene.time.now;
          if (ghost !== undefined && now >= next) {
            this.afterimage(ghost, 0.35, 200);
            next = now + 30;
          }
        },
        onComplete: () => {
          this.container.setDepth(this.baseY);
          this.container.setScale(1);
          this.play('idle');
          resolve();
        },
      });
    });
  }

  /** Karakterin anlık görüntüsü (renkli, sönen hayalet): hız izi. */
  afterimage(tint: number, alpha = 0.5, life = 240): void {
    const img = this.scene.add
      .image(this.container.x, this.container.y, this.sprite.texture.key, this.sprite.frame.name)
      .setOrigin(0.5, 1)
      .setScale(this.sprite.scaleX * this.container.scaleX, this.sprite.scaleY * this.container.scaleY)
      .setFlipX(this.sprite.flipX)
      .setTint(tint)
      .setAlpha(alpha)
      .setDepth(this.container.depth - 1);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: slow(life), onComplete: () => img.destroy() });
  }

  /** Büyü / atış hazırlığı: hafif şişip halka bırakır. */
  windUp(hex: string, anim: AnimName = 'cast'): Promise<void> {
    this.play(anim);
    this.ring(hex, 0.7);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.07,
        scaleY: 1.07,
        duration: slow(140),
        yoyo: true,
        onComplete: () => {
          this.play('idle');
          resolve();
        },
      });
    });
  }

  /** Karakterin etrafında genişleyip sönen halka (şifa, kalkan, büyü hazırlığı, çağrı). */
  ring(hex: string, scale = 1): void {
    const ring = this.scene.add
      .ellipse(this.container.x, this.container.y - this.h / 2, this.w * 0.8 * scale, this.h * 0.8 * scale)
      .setStrokeStyle(8, color(hex))
      .setDepth(4200);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.7,
      scaleY: 1.5,
      alpha: { from: 1, to: 0 },
      duration: slow(450),
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Vuruş tepkisi. `ratio` = hasar / maks can: küçük vuruşta hafif titreme, büyük vuruşta uzun beyaz/kırmızı
   * yanıp sönme, geri savrulma ve ekran sarsıntısı.
   */
  hit(ratio = 0.1): void {
    const level = hitLevel(ratio);
    this.play('hit');
    const flash = slow(timing.hitFlashMs) * (1 + 2.5 * level);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(flash, () => {
      if (level > 0.6) {
        this.sprite.setTint(0xff6a6a);
        this.scene.time.delayedCall(260, () => this.sprite.clearTint());
      } else this.sprite.clearTint();
    });
    const dir = this.combatant.side === 'enemy' ? 1 : -1;
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: (10 + 44 * level) * dir, to: 0 },
      duration: slow(160 + 260 * level),
      ease: 'Bounce.easeOut',
    });
    if (level > 0.45) {
      this.scene.tweens.add({ targets: this.container, x: this.homeX + dir * 46 * level, duration: slow(110), yoyo: true, ease: 'Quad.easeOut' });
    }
    if (ratio >= timing.cameraShakeRatio) this.scene.cameras.main.shake(140 + 160 * level, 0.0015 + 0.005 * level);
  }

  /** Fiziksel saldırıdan kaçınma: yana kayıp geri döner. */
  dodge(): void {
    const dir = this.combatant.side === 'enemy' ? 1 : -1;
    this.scene.tweens.add({ targets: this.sprite, x: dir * 46, duration: slow(120), yoyo: true, ease: 'Quad.easeOut' });
    this.floatText('Dodge', colors.dodge, 48, false, { kind: 'dodge' });
  }

  /** Saldıranın isabeti yetmedi (accuracy yüzünden iska): saldıranın üstünde soluk "MISS" yazısı; kendisi kıpırdamaz. */
  missText(): void {
    this.floatText('MISS', colors.miss, 46, false, { kind: 'miss' });
  }

  /**
   * Move Tile: birim yeni yuvaya kayar (kısa yürüyüş: küçük sıçrayışlarla, arkada hafif iz). Yeni yuva birimin yeni "evi" olur.
   * Çubuklar, gölge ve rozetler container'ın içinde olduğundan birlikte gelir. Varışta çözülür.
   */
  moveTo(x: number, y: number, ms = 520): Promise<void> {
    const dx = x - this.homeX;
    this.homeX = x;
    this.baseY = y;
    if (dx !== 0) this.sprite.setFlipX(dx < 0); // yürüdüğü yöne bakar
    this.container.setDepth(Math.max(y, this.container.y) + 2);
    this.play('attack');
    const hops = Math.max(2, Math.round(ms / 170));
    this.scene.tweens.add({ targets: this.sprite, y: { from: 0, to: -16 }, duration: slow(ms) / (hops * 2), yoyo: true, repeat: hops - 1, ease: 'Sine.easeOut' });
    let next = 0;
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        x,
        y,
        duration: slow(ms),
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const now = this.scene.time.now;
          if (now >= next) {
            this.afterimage(0xe8c47e, 0.28, 220);
            next = now + 55;
          }
        },
        onComplete: () => {
          this.sprite.setY(0);
          this.sprite.setFlipX(this.combatant.side === 'enemy');
          this.container.setDepth(y);
          this.play('idle');
          resolve();
        },
      });
    });
  }

  /**
   * Hasar sayısı: vuruş şiddetiyle büyür ve sarıdan kırmızıya döner; kritikte altın renk, daha iri ve rakamın solunda patlama ikonu;
   * hasarın elementi/kaynağı varsa rakamın sağında küçük element ikonu (ateş, buz, zehir...). Üst üste binmez.
   */
  damageText(amount: number, ratio: number, crit = false, tags: DamageTags = {}): void {
    const level = damageNumberLevel(ratio);
    const px = Math.round(timing.damageNumberMinPx + timing.damageNumberSpanPx * level) + (crit ? timing.damageNumberCritBonusPx : 0); // boyutlar data/battle-layout.json > animation
    const icon = damagePaintedIcon({ ...tags, crit });
    this.floatText(String(amount), crit ? colors.crit : damageColor(level), px, true, {
      kind: crit ? 'crit' : 'damage',
      ...(crit ? { leftIcon: paintedOr('fx', 'crit', 'burst') } : {}),
      ...(icon ? { rightIcon: icon } : {}),
    });
  }

  /**
   * Karakterin üstünde yukarı süzülüp kaybolan sayı/yazı (stil: float-text.ts). Aynı anda birden fazlası şeritlere dizilir (üst üste binmez);
   * ömür data/battle-layout.json > animation.damageNumberMs, son floatFadeMs solar. `opts`: tür (tipografi) ve rakamın yanındaki ikonlar.
   */
  floatText(text: string, hex: string, px = 64, pop = false, opts: FloatOpts = {}): void {
    if (debugState.hideNumbers) return; // debug: numbers and texts above units hidden
    const { lane, offset } = placeFloat(this.lanes);
    this.lanes[lane] = px;
    const startY = this.container.y - this.h - 60 - offset;
    const style = floatStyle(opts.kind ?? 'info', px, hex);
    const t = this.scene.add.text(0, 0, text, style).setOrigin(0.5);
    if (style.topLight) {
      try {
        const grad = t.context.createLinearGradient(0, 0, 0, t.height);
        grad.addColorStop(0, style.topLight);
        grad.addColorStop(0.55, hex);
        t.setFill(grad);
      } catch {
        /* düz renk yeter */
      }
    }
    const parts: Phaser.GameObjects.GameObject[] = [];
    const sizeOf = (o: Phaser.GameObjects.GameObject) => (o as Phaser.GameObjects.Image).displayWidth;
    const mk = (kind: string): Phaser.GameObjects.Image => {
      const img = this.scene.add.image(0, 0, ensureIcon(this.scene, kind, FLOAT_ICON_TINT[kind] ?? hex, false));
      const d = Math.round(px * (kind === 'burst' || kind.includes(':') ? 0.66 : 0.58)); // boyalı ikonlar (kenar paylı) patlama boyunda
      return img.setDisplaySize(d, d).setOrigin(0.5);
    };
    const left = opts.leftIcon ? mk(opts.leftIcon) : null;
    const right = opts.rightIcon ? mk(opts.rightIcon) : null;
    if (left) parts.push(left);
    parts.push(t);
    if (right) parts.push(right);
    const { lefts } = rowLayout(parts.map((o) => (o === t ? t.width : sizeOf(o))), -Math.round(px * 0.07));
    parts.forEach((o, i) => (o as Phaser.GameObjects.Image).setX(lefts[i]! + (o === t ? t.width : sizeOf(o)) / 2));
    if (opts.kind === 'crit') {
      // Kritik: rakamın arkasında yumuşak kor ışıması (tasarım kiti: kor vurgu)
      const glow = this.scene.add.image(0, 0, ensureGlow(this.scene)).setTint(KIT.ember).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(px * 3.4, px * 1.9).setAlpha(0.55);
      parts.unshift(glow);
    }
    const box = this.scene.add.container(this.container.x, startY, parts).setDepth(5000 + lane);
    const times = floatTimes(timing.damageNumberMs, timing.floatFadeMs);
    if (pop) {
      box.setScale(0.4);
      this.scene.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.scene.tweens.add({ targets: box, y: startY - timing.damageNumberRise, duration: times.total, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: box,
      alpha: 0,
      delay: times.fadeDelay,
      duration: times.fade,
      onComplete: () => {
        box.destroy();
        this.lanes[lane] = undefined;
        while (this.lanes.length > 0 && this.lanes[this.lanes.length - 1] === undefined) this.lanes.pop();
      },
    });
  }

  // --- Hover önizlemesi: can çubuğunda hayalet parça + hasar/şifa/kalkan yazısı ---

  /** Bir skill'in bu karaktere tahmini etkisini çubukta ve yazıyla gösterir. */
  showPreview(p: TargetPreview): void {
    this.clearPreview();
    const W = hpBar.width;
    const curFrac = Math.max(0, this.combatant.hp / this.combatant.maxHp);
    const segment = (parent: Phaser.GameObjects.Container | null, x: number, y: number, w: number, h: number, hex: string) => {
      const r = this.scene.add.rectangle(x, y, Math.max(2, w), h, color(hex), 0.85).setOrigin(0, 0.5);
      (parent ?? this.container).add(r);
      this.scene.tweens.add({ targets: r, alpha: 0.35, duration: 380, yoyo: true, repeat: -1 });
      this.previewItems.push(r);
    };
    const lines: Array<[string, string, number]> = []; // [yazı, renk, punto]

    if (p.damage) {
      const d = p.damage;
      if (d.hpLoss > 0) {
        const newFrac = Math.max(0, (this.combatant.hp - d.hpLoss) / this.combatant.maxHp);
        segment(this.hpBox, -W / 2 + newFrac * W, this.hpY, (curFrac - newFrac) * W, hpBar.height - 4, colors.previewDamage);
      }
      const range = d.min === d.max ? '' : `${d.min}-${d.max}`;
      const blocked = d.absorbed > 0 ? `${range ? ' ' : ''}(${d.absorbed} blocked)` : '';
      if (d.lethal) {
        const skull = this.scene.add.image(0, -this.h / 2, ensureIcon(this.scene, 'skull', colors.lethal, false)).setDisplaySize(120, 120).setAlpha(d.lethal === 'sure' ? 0.95 : 0.55);
        this.container.add(skull);
        this.previewItems.push(skull);
        this.scene.tweens.add({ targets: skull, scale: skull.scale * 1.12, duration: 420, yoyo: true, repeat: -1 });
      }
      lines.push([d.hpLoss === 0 ? 'Blocked' : `-${d.avg}`, damageColor(damageNumberLevel(d.hpLoss / this.combatant.maxHp)), 46]);
      lines.push([formatHit(d.hitChance), hitColor(d.hitChance), 26]); // hasar satırının hemen altında
      if (blocked) lines.push([blocked.trim(), colors.muted, 24]);
      if (d.splash) lines.push(['splash', colors.muted, 22]);
    }
    if (p.heal && p.heal.avg > 0) {
      const newFrac = Math.min(1, (this.combatant.hp + p.heal.avg) / this.combatant.maxHp);
      segment(this.hpBox, -W / 2 + curFrac * W, this.hpY, (newFrac - curFrac) * W, hpBar.height - 4, colors.previewHeal);
      lines.push([`+${p.heal.avg}`, colors.heal, 46]);
    } else if (p.heal) {
      lines.push(['Full HP', colors.muted, 30]);
    }
    if (p.hot) {
      const newFrac = Math.min(1, (this.combatant.hp + p.hot.total) / this.combatant.maxHp);
      if (p.hot.total > 0) segment(this.hpBox, -W / 2 + curFrac * W, this.hpY, (newFrac - curFrac) * W, hpBar.height - 4, colors.previewHeal);
      lines.push([`+${p.hot.perTurn} x${p.hot.turns} turns`, colors.heal, 34]);
    }
    if (p.ground) lines.push([`-${p.ground.perTick} x${p.ground.turns} turns`, colors.burn, 34]);
    if (p.shield) {
      const bar = p.shield.magic ? this.magicShieldFill : this.shieldFill;
      const extra = Math.min(W - bar.width, (W * p.shield.amount) / this.combatant.maxHp);
      segment(null, -W / 2 + bar.width, bar.y, Math.max(4, extra), 8, p.shield.magic ? colors.magicShield : colors.shield);
      lines.push([`+${p.shield.amount} ${p.shield.magic ? 'magic shield' : 'shield'}`, p.shield.magic ? colors.magicShield : colors.shield, 34]);
    }
    if (p.burn) lines.push([`-${p.burn} MP`, colors.burn, 36]);
    // Drain Field (madde 260): manası bitecek hedefte zar: "50%: Silenced 1t + 12-15 dmg"
    if (p.emptyProc) lines.push([`${Math.round(p.emptyProc.chance * 100)}%: ${p.emptyProc.statusName} ${p.emptyProc.turns}t + ${p.emptyProc.damage.min}-${p.emptyProc.damage.max} dmg`, colors.burn, 30]);
    for (const s of p.statuses ?? []) lines.push([s, colors.targetHighlight, 30]);

    // Yazılar ismin üstünde, alttan yukarı dizilir (en önemli satır en altta durur)
    let y = this.hpY - hpBar.height - 44;
    for (const [text, hex, px] of [...lines].reverse()) {
      const t = this.scene.add.text(0, y, text, numStyle(px, hex)).setOrigin(0.5, 1);
      this.container.add(t);
      this.previewItems.push(t);
      y -= px * 1.05;
    }
  }

  clearPreview(): void {
    for (const item of this.previewItems) {
      this.scene.tweens.killTweensOf(item);
      item.destroy();
    }
    this.previewItems = [];
  }

  fadeIn(): void {
    this.container.setAlpha(0);
    this.ring(colors.heal, 1.2);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: slow(350) });
  }

  /** Süresi dolan çağrı: ölmez, sessizce solar. */
  vanish(): Promise<void> {
    this.setEmpowered(false);
    this.setVineWrap(false);
    this.setGlow(null);
    this.setActive(false);
    this.clearPreview();
    this.ring(colors.heal, 0.9);
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this.container, alpha: 0, duration: slow(500), onComplete: () => resolve() });
    });
  }

  die(): Promise<void> {
    this.setVineWrap(false);
    this.setEmpowered(false);
    this.play('death');
    this.setGlow(null);
    this.setActive(false);
    this.clearPreview();
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        y: this.container.y + 20,
        duration: timing.deathFadeMs,
        onComplete: () => {
          this.fallen = true;
          resolve();
        },
      });
    });
  }

  /** Savaş zaten bu birim düşmüşken başladıysa/yüklendiyse: ölüm animasyonu oynamadan sahneden kalkar (ceset işareti ayrıca çizilir). */
  markFallen(): void {
    this.fallen = true;
    this.setGlow(null);
    this.setActive(false);
    this.container.setAlpha(0);
  }

  /**
   * Diriltme: düşmüş birim canlanır. `at` verilirse (madde 257: Resurrection seçilen BOŞ hücreye diriltir) görünmezken o hücreye ışınlanır ve orası
   * yeni "evi" olur; verilmezse olduğu yerde.
   */
  revive(hp: number, mp: number, at?: { x: number; y: number }): void {
    this.fallen = false;
    this.setGlow(null);
    this.scene.tweens.killTweensOf(this.container);
    if (at) {
      this.homeX = at.x;
      this.baseY = at.y;
      this.container.setX(at.x).setDepth(at.y);
    }
    this.container.setY(this.baseY).setAlpha(0);
    this.setHp(hp, false);
    this.setMp(mp, false);
    this.setShield(0, 0, false);
    this.play('idle');
    this.ring(colors.heal, 1.2);
    this.floatText('Revived', colors.heal, 48, false, { kind: 'heal' });
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: slow(450) });
  }
}
