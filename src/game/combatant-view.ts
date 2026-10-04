import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import type { Combatant } from '../engine';
import { animKey, characterTexture, type AnimName } from './assets';

export const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const { spriteBox: box, hpBar, animation: timing, colors } = layout;

export const textStyle = (px: number, fill: string = colors.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: layout.fontFamily,
  fontSize: `${px}px`,
  fontStyle: 'bold',
  color: fill,
  stroke: colors.textStroke,
  strokeThickness: Math.max(3, Math.round(px / 6)),
});

/** Sahnedeki tek bir karakter: sprite (veya placeholder), isim, can / MP çubuğu, kalkan çubuğu. */
export class CombatantView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Ekranda kaplanan boyut (sprite, spriteBox içine oranı korunarak sığdırılır). */
  readonly w: number;
  readonly h: number;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly mpFill: Phaser.GameObjects.Rectangle;
  private readonly shieldFill: Phaser.GameObjects.Rectangle;
  private readonly highlight: Phaser.GameObjects.Rectangle;
  private readonly marker: Phaser.GameObjects.Triangle;
  private readonly realSprite: boolean;
  private readonly homeX: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly combatant: Combatant,
    x: number,
    y: number,
  ) {
    this.homeX = x;
    const tex = characterTexture(scene, combatant.spriteId, combatant.color);
    this.realSprite = tex.real;

    this.sprite = scene.add.sprite(0, 0, tex.key).setOrigin(0.5, 1);
    // Çok kareli sheet'te ilk kare; tek resimde tüm resim
    if (tex.real && scene.textures.get(tex.key).has('0')) this.sprite.setFrame(0);
    const scale = Math.min(box.width / this.sprite.frame.width, box.height / this.sprite.frame.height);
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

    this.highlight = scene.add
      .rectangle(0, -this.h / 2, this.w + 24, this.h + 24)
      .setStrokeStyle(6, color(colors.targetHighlight))
      .setVisible(false);

    const hpY = -this.h - hpBar.offsetY;
    const mpY = hpY + hpBar.height / 2 + hpBar.mpHeight / 2 + 3;
    const hpBack = scene.add.rectangle(0, hpY, hpBar.width, hpBar.height, color(colors.hpBack)).setStrokeStyle(3, 0x000000);
    this.hpFill = scene.add
      .rectangle(-hpBar.width / 2, hpY, hpBar.width, hpBar.height, color(combatant.side === 'party' ? colors.hpFill : colors.hpFillEnemy))
      .setOrigin(0, 0.5);
    const mpBack = scene.add
      .rectangle(0, mpY, hpBar.width, hpBar.mpHeight, color(colors.hpBack))
      .setStrokeStyle(2, 0x000000)
      .setVisible(combatant.maxMp > 0);
    this.mpFill = scene.add
      .rectangle(-hpBar.width / 2, mpY, hpBar.width, hpBar.mpHeight, color(colors.mpFill))
      .setOrigin(0, 0.5)
      .setVisible(combatant.maxMp > 0);
    // Kalkan: can çubuğunun hemen üstünde ince açık mavi çizgi (kalkan / maks can oranında)
    this.shieldFill = scene.add
      .rectangle(-hpBar.width / 2, hpY - hpBar.height / 2 - 5, 0, 6, color(colors.shield))
      .setOrigin(0, 0.5);
    const name = scene.add.text(0, hpY - hpBar.height - 4, combatant.name, textStyle(30)).setOrigin(0.5, 1);
    this.marker = scene.add
      .triangle(0, hpY - hpBar.height - 62, 0, 0, 40, 0, 20, 28, color(colors.targetHighlight))
      .setStrokeStyle(3, 0x000000)
      .setVisible(false);

    this.container = scene.add.container(x, y, [
      ...(shadow ? [shadow] : []),
      this.highlight,
      this.sprite,
      hpBack,
      this.hpFill,
      mpBack,
      this.mpFill,
      this.shieldFill,
      name,
      this.marker,
    ]);
    this.container.setDepth(y); // öndeki sıra arkadakinin üstünde çizilir
    this.setHp(combatant.hp, false);
    this.setMp(combatant.mp, false);
    this.setShield(combatant.shield, false);
    this.play('idle');
  }

  get alive(): boolean {
    return this.combatant.hp > 0;
  }

  setHighlight(on: boolean): void {
    this.highlight.setVisible(on);
  }

  /** Komut verilen (aktif) karakterin üstünde ok işareti. */
  setActive(on: boolean): void {
    this.marker.setVisible(on && this.alive);
  }

  /** Dokunma alanı: karakterin tamamı. */
  makeTappable(onTap: () => void): void {
    const zone = this.scene.add.zone(0, -this.h / 2, this.w + 24, this.h + 24).setInteractive();
    zone.on('pointerdown', onTap);
    this.container.add(zone);
  }

  setHp(hp: number, animate = true): void {
    this.tweenWidth(this.hpFill, hpBar.width * Math.max(0, hp / this.combatant.maxHp), animate);
  }

  setMp(mp: number, animate = true): void {
    if (this.combatant.maxMp <= 0) return;
    this.tweenWidth(this.mpFill, hpBar.width * Math.max(0, mp / this.combatant.maxMp), animate);
  }

  setShield(shield: number, animate = true): void {
    this.tweenWidth(this.shieldFill, hpBar.width * Math.min(1, shield / this.combatant.maxHp), animate);
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
    const key = animKey(this.combatant.spriteId, anim);
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
        duration: timing.attackDurationMs,
        ease: 'Quad.easeIn',
        yoyo: true,
        hold: 60,
        onYoyo: () => onHit(),
        onComplete: () => {
          this.play('idle');
          resolve();
        },
      });
    });
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
        duration: 140,
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
      duration: 450,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  hit(): void {
    this.play('hit');
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(timing.hitFlashMs, () => this.sprite.clearTint());
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: 10 * (this.combatant.side === 'enemy' ? 1 : -1), to: 0 },
      duration: 160,
      ease: 'Bounce.easeOut',
    });
  }

  /** Karakterin üstünde yukarı süzülüp kaybolan sayı/yazı. */
  floatText(text: string, hex: string, px = 64): void {
    const t = this.scene.add
      .text(this.container.x, this.container.y - this.h - 60, text, textStyle(px, hex))
      .setOrigin(0.5)
      .setDepth(5000);
    this.scene.tweens.add({
      targets: t,
      y: t.y - timing.damageNumberRise,
      alpha: { from: 1, to: 0 },
      duration: timing.damageNumberMs,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  fadeIn(): void {
    this.container.setAlpha(0);
    this.ring(colors.heal, 1.2);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 350 });
  }

  die(): Promise<void> {
    this.play('death');
    this.setHighlight(false);
    this.setActive(false);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        y: this.container.y + 20,
        duration: timing.deathFadeMs,
        onComplete: () => resolve(),
      });
    });
  }
}
