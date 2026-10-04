import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import type { Combatant, TargetPreview } from '../engine';
import { animKey, characterTexture, type AnimName } from './assets';
import { ensureIcon } from './icons';

export const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const { spriteBox: box, hpBar, animation: timing, colors } = layout;

/** Skill animasyonları bu kat yavaş (Ömer: %20). */
export const SLOW = timing.skillSlowdown;
export const slow = (ms: number) => ms * SLOW;

/** Hasar / maks can oranından 0-1 arası vuruş şiddeti: ne kadar büyük vuruşsa efektler o kadar belirgin. */
export const hitLevel = (ratio: number) => Math.min(1, Math.max(0, ratio / timing.hitMaxRatio));

export const textStyle = (px: number, fill: string = colors.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: layout.fontFamily,
  fontSize: `${px}px`,
  fontStyle: 'bold',
  color: fill,
  stroke: colors.textStroke,
  strokeThickness: Math.max(3, Math.round(px / 6)),
});

/** Şiddete göre hasar rengi: sarı -> turuncu -> kırmızı. */
const damageColor = (level: number) => (level < 0.34 ? colors.damage : level < 0.67 ? colors.damageMid : colors.damageHigh);

/** Zırh değerinden 0-1 belirginlik: zırh arttıkça ikon büyür ve daha opak olur. */
export const armorProminence = (armor: number) => Math.min(1, Math.max(0, armor / layout.armorIcon.maxArmor));

/** Sahnedeki tek bir karakter: sprite (veya placeholder), isim, can / MP çubuğu, kalkan çubukları, zırh ve durum ikonları. */
export class CombatantView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Ekranda kaplanan boyut (sprite, spriteBox içine oranı korunarak sığdırılır). */
  readonly w: number;
  readonly h: number;
  /** Zırh ikonları (fiziksel, büyü): sınıf zırhı yoksa yok. Boyut ve opaklık zırhla artar. */
  private readonly hpBox: Phaser.GameObjects.Container;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpGhost: Phaser.GameObjects.Rectangle;
  private readonly mpFill: Phaser.GameObjects.Rectangle;
  private readonly shieldFill: Phaser.GameObjects.Rectangle;
  private readonly magicShieldFill: Phaser.GameObjects.Rectangle;
  private readonly statusBox: Phaser.GameObjects.Container;
  private glowFx?: Phaser.FX.Glow;
  private glowKey = '';
  private readonly marker: Phaser.GameObjects.Triangle;
  private readonly realSprite: boolean;
  private readonly homeX: number;
  private readonly hpY: number;
  private readonly shieldY: number;
  private previewItems: Phaser.GameObjects.GameObject[] = [];
  private floating = 0;

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
    const hpBack = scene.add.rectangle(0, this.hpY, hpBar.width, hpBar.height, color(colors.hpBack)).setStrokeStyle(3, 0x000000);
    // Hayalet çubuk: can düşünce bir süre eski seviyede kalıp yavaşça iner (büyük vuruşta daha uzun ve belirgin)
    this.hpGhost = scene.add.rectangle(-hpBar.width / 2, this.hpY, hpBar.width, hpBar.height, color('#ffd6a0')).setOrigin(0, 0.5);
    this.hpFill = scene.add
      .rectangle(-hpBar.width / 2, this.hpY, hpBar.width, hpBar.height, color(combatant.side === 'party' ? colors.hpFill : colors.hpFillEnemy))
      .setOrigin(0, 0.5);
    this.hpBox = scene.add.container(0, 0, [hpBack, this.hpGhost, this.hpFill]);
    const mpBack = scene.add
      .rectangle(0, mpY, hpBar.width, hpBar.mpHeight, color(colors.hpBack))
      .setStrokeStyle(2, 0x000000)
      .setVisible(combatant.maxMp > 0);
    this.mpFill = scene.add
      .rectangle(-hpBar.width / 2, mpY, hpBar.width, hpBar.mpHeight, color(colors.mpFill))
      .setOrigin(0, 0.5)
      .setVisible(combatant.maxMp > 0);
    // Kalkan çubukları: can çubuğunun hemen üstünde ince çizgiler (genel: açık mavi, büyü: mor)
    this.shieldFill = scene.add.rectangle(-hpBar.width / 2, this.shieldY, 0, 6, color(colors.shield)).setOrigin(0, 0.5);
    this.magicShieldFill = scene.add.rectangle(-hpBar.width / 2, this.shieldY - 7, 0, 6, color(colors.magicShield)).setOrigin(0, 0.5);
    const name = scene.add.text(0, this.hpY - hpBar.height - 4, combatant.name, textStyle(30)).setOrigin(0.5, 1);
    this.marker = scene.add
      .triangle(0, this.hpY - hpBar.height - 62, 0, 0, 40, 0, 20, 28, color(colors.targetHighlight))
      .setStrokeStyle(3, 0x000000)
      .setVisible(false);

    // Durum ikonları (taunt, guard, regen) can çubuğunun solunda
    this.statusBox = scene.add.container(0, this.hpY);

    this.container = scene.add.container(x, y, [
      ...(shadow ? [shadow] : []),
      this.sprite,
      this.hpBox,
      mpBack,
      this.mpFill,
      this.shieldFill,
      this.magicShieldFill,
      this.statusBox,
      name,
      this.marker,
    ]);
    this.container.setDepth(y); // öndeki sıra arkadakinin üstünde çizilir
    this.setHp(combatant.hp, false);
    this.setMp(combatant.mp, false);
    this.setShield(combatant.shield, combatant.magicShield, false);
    this.play('idle');
  }

  get alive(): boolean {
    return this.combatant.hp > 0;
  }

  /**
   * Targeting glow around the drawing itself (its outline, not a box): green = helpful effect, red = harmful one.
   * `strong` marks the unit(s) the effect will actually hit; weak marks units that can be chosen.
   */
  setGlow(kind: 'good' | 'bad' | null, strong = false): void {
    const key = kind ? `${kind}:${strong}` : '';
    if (key === this.glowKey) return;
    this.glowKey = key;
    if (this.glowFx) {
      this.scene.tweens.killTweensOf(this.glowFx);
      this.sprite.postFX?.remove(this.glowFx);
      this.glowFx = undefined;
    }
    if (!kind || !this.sprite.postFX) return;
    const hex = color(kind === 'good' ? colors.glowGood : colors.glowBad);
    // Weak: a thin, quiet rim. Strong: the pulsing glow around the unit that will be hit.
    const [lo, hi] = strong ? [5, 11] : [1.2, 2];
    const fx = this.sprite.postFX.addGlow(hex, lo, 0, false, 0.1, strong ? 16 : 8);
    this.glowFx = fx;
    this.scene.tweens.add({ targets: fx, outerStrength: hi, duration: strong ? 480 : 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Komut verilen (aktif) karakterin üstünde ok işareti. */
  setActive(on: boolean): void {
    this.marker.setVisible(on && this.alive);
  }

  /** Dokunma/tıklama alanı: karakterin tamamı; fare üstüne gelince onOver/onOut çağrılır. */
  makeTappable(onTap: () => void, onOver?: () => void, onOut?: () => void): void {
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

  setShield(shield: number, magicShield: number, animate = true): void {
    this.tweenWidth(this.shieldFill, hpBar.width * Math.min(1, shield / this.combatant.maxHp), animate);
    this.tweenWidth(this.magicShieldFill, hpBar.width * Math.min(1, magicShield / this.combatant.maxHp), animate);
  }

  /**
   * Can çubuğunun yanındaki rozetler: durumlar (buff/debuff), üzerinde durulan yer etkileri (zehir, yanan zemin, holy fire)
   * ve zırh aurası gibi etkilerden gelen zırh bonusu. Her rozet ikon + kalan tur / değer.
   */
  setBadges(badges: Array<{ icon: string; color: string; text: string; debuff: boolean; turns: boolean }>): void {
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
          const icon = this.scene.add.image(cx, cy, ensureIcon(this.scene, bd.icon, bd.color, false)).setDisplaySize(size, size);
          const label = this.scene.add.text(cx + size / 2, cy + size / 2, bd.text, textStyle(18, bd.color)).setOrigin(1, 0.5);
          this.statusBox.add([icon, label]);
          if (bd.turns) this.statusBox.add(this.scene.add.image(label.x - label.width - 8, label.y, hourglass).setDisplaySize(15, 15));
        });
    }
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
    this.floatText('Dodge', colors.dodge, 46);
  }

  /**
   * Hasar sayısı: vuruş şiddetiyle büyür ve sarıdan kırmızıya döner; kritikte altın renk, daha iri ve "CRIT" yazısı.
   * Üst üste binmez.
   */
  damageText(amount: number, ratio: number, crit = false): void {
    const level = hitLevel(ratio);
    const px = Math.round(52 + 64 * level) + (crit ? 14 : 0);
    this.floatText(String(amount), crit ? colors.crit : damageColor(level), px, true);
    if (crit) this.floatText('CRIT', colors.crit, 34);
  }

  /** Karakterin üstünde yukarı süzülüp kaybolan sayı/yazı. Aynı anda birden fazlası alt alta dizilir. */
  floatText(text: string, hex: string, px = 64, pop = false): void {
    const slot = this.floating++;
    const startY = this.container.y - this.h - 60 - slot * (px * 0.95);
    const t = this.scene.add.text(this.container.x, startY, text, textStyle(px, hex)).setOrigin(0.5).setDepth(5000 + slot);
    const total = timing.damageNumberMs;
    if (pop) {
      t.setScale(0.4);
      this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.scene.tweens.add({ targets: t, y: startY - timing.damageNumberRise, duration: total, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: total * 0.55,
      duration: total * 0.45,
      onComplete: () => {
        t.destroy();
        this.floating = Math.max(0, this.floating - 1);
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
      lines.push([d.hpLoss === 0 ? 'Blocked' : `-${d.avg}`, damageColor(hitLevel(d.hpLoss / this.combatant.maxHp)), 46]);
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
    if (p.shield) {
      const bar = p.shield.magic ? this.magicShieldFill : this.shieldFill;
      const extra = Math.min(W - bar.width, (W * p.shield.amount) / this.combatant.maxHp);
      segment(null, -W / 2 + bar.width, bar.y, Math.max(4, extra), 8, p.shield.magic ? colors.magicShield : colors.shield);
      lines.push([`+${p.shield.amount} ${p.shield.magic ? 'magic shield' : 'shield'}`, p.shield.magic ? colors.magicShield : colors.shield, 34]);
    }
    if (p.burn) lines.push([`-${p.burn} MP`, colors.burn, 36]);
    for (const s of p.statuses ?? []) lines.push([s, colors.targetHighlight, 30]);

    // Yazılar ismin üstünde, alttan yukarı dizilir (en önemli satır en altta durur)
    let y = this.hpY - hpBar.height - 44;
    for (const [text, hex, px] of [...lines].reverse()) {
      const t = this.scene.add.text(0, y, text, textStyle(px, hex)).setOrigin(0.5, 1);
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
    this.setGlow(null);
    this.setActive(false);
    this.clearPreview();
    this.ring(colors.heal, 0.9);
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this.container, alpha: 0, duration: slow(500), onComplete: () => resolve() });
    });
  }

  die(): Promise<void> {
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
        onComplete: () => resolve(),
      });
    });
  }
}
