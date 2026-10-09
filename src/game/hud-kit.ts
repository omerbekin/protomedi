import Phaser from 'phaser';
import { EL, diamondPts, elText, fadeLine, hGradient, vGradient } from './elegant-ui';

/**
 * Savaş HUD'ı (alt çubuk: stat bloğu, skill düğmeleri, global düğmeler, bilgi kutusu; üst sıra çubuğu) için tasarım kiti parçaları
 * (Ömer 2026-10-09: eski bronz `ui-frame` çerçevelerinin yerine). Yerleşim ve bilgiler aynı; yalnızca görünüm: koyu mürekkep dolgu,
 * ince altın çizgi (alfa .3 / .55 / .9), seçili = açık altın 2 px + kor ışıması, küçük köşe elmasları, Cinzel yazı.
 */

/** Rakamlı küçük yazılar (stat satırları, can / MP): düz rakamlı serif (Cinzel'in rakamları küçük boyda zor okunur). */
export const HUD_NUM_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";

export type PlateState = 'idle' | 'hot' | 'chosen';

/**
 * Kit düğme / kutu plakası (sol üst x, y). idle: ince altın çizgi; hot (basılı / üstünde): parlak çizgi + hafif kor dolgu;
 * chosen: açık altın 2 px + dışa sönen kor ışıması. `strong` (4. skill): biraz daha belirgin çizgi + köşe elmasları + üstte kor çizgi.
 */
export function kitPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: { state?: PlateState; strong?: boolean; alpha?: number } = {}): void {
  const st = o.state ?? 'idle';
  const a = o.alpha ?? 1;
  if (st === 'chosen') for (let i = 0; i < 7; i++) g.lineStyle(2, EL.EMBER, 0.32 * (1 - i / 7) * a).strokeRect(x - 2 - i * 2, y - 2 - i * 2, w + 4 + i * 4, h + 4 + i * 4);
  g.fillStyle(0x000000, 0.35 * a).fillRect(x + 3, y + 6, w, h);
  g.fillGradientStyle(0x22180f, 0x22180f, 0x0b0805, 0x0b0805, 0.96 * a).fillRect(x, y, w, h);
  if (st !== 'idle') g.fillStyle(EL.EMBER, (st === 'chosen' ? 0.14 : 0.1) * a).fillRect(x, y, w, h);
  if (o.strong) {
    g.fillGradientStyle(EL.EMBER, EL.EMBER, EL.EMBER, EL.EMBER, 0.16 * a, 0.16 * a, 0, 0).fillRect(x + 1, y + 1, w - 2, h * 0.3);
    fadeLine(g, x + 6, x + w - 6, y + 1.5, EL.EMBER2, 0.75 * a, 'both');
  }
  if (st === 'chosen') g.lineStyle(2, EL.ON_N, a).strokeRect(x + 1, y + 1, w - 2, h - 2);
  else g.lineStyle(1, EL.GOLD, (st === 'hot' ? 0.9 : o.strong ? EL.LINE.a3 : EL.LINE.a2 + 0.06) * a).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (o.strong || st === 'chosen') kitCorners(g, x, y, w, h, 4, a);
}

/** Dört köşede küçük içi koyu, altın çizgili elmas. */
export function kitCorners(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 4, alpha = 1): void {
  for (const [cx, cy] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const) {
    g.fillStyle(0x140e09, alpha).fillPoints(diamondPts(cx, cy, r), true);
    g.lineStyle(1, EL.GOLD, 0.75 * alpha).strokePoints(diamondPts(cx, cy, r), true);
  }
}

/**
 * Portre / sıra hücresi çerçevesi (dolgu ayrı çizilir): dış ince altın çizgi + içte taraf rengi (mavi dost / kırmızı düşman, elite/boss
 * rütbe rengi) ince çizgisi. `now` = şu anki birim: açık altın 2 px + kor ışıması. `faded` = sırası geçmiş.
 */
export function kitCellFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, o: { inner?: number; now?: boolean; faded?: boolean } = {}): void {
  const a = o.faded ? 0.5 : 1;
  if (o.now) {
    for (let i = 0; i < 7; i++) g.lineStyle(2, EL.EMBER, 0.34 * (1 - i / 7)).strokeRect(x - 2 - i * 2, y - 2 - i * 2, s + 4 + i * 4, s + 4 + i * 4);
    g.lineStyle(2, EL.ON_N, 1).strokeRect(x + 1, y + 1, s - 2, s - 2);
  } else g.lineStyle(1, EL.GOLD, EL.LINE.a3 * a).strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  if (o.inner !== undefined) g.lineStyle(1, o.inner, (o.now ? 0.85 : 0.7) * a).strokeRect(x + 4.5, y + 4.5, s - 9, s - 9);
}

/** Hücre / portre dolgusu (koyu mürekkep degradesi). */
export function kitCellFill(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 1): void {
  g.fillGradientStyle(0x22180f, 0x22180f, 0x0a0705, 0x0a0705, alpha).fillRect(x, y, w, h);
}

/** Alt çubuk zemini: koyu degrade şerit, üst kenarda ince altın çizgi (+ ortada kor elmas), altına yumuşak gölge. */
export function kitBand(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, centerX: number): void {
  g.fillStyle(0x000000, 0.35).fillRect(x, y - 14, w, 14);
  vGradient(g, x, y - 14, w, 14, 0x000000, [
    [0, 0],
    [1, 0.35],
  ]);
  g.fillGradientStyle(0x1a130c, 0x1a130c, 0x070504, 0x070504, 0.97).fillRect(x, y, w, h);
  g.lineStyle(1, 0x050302, 1).lineBetween(x, y - 0.5, x + w, y - 0.5);
  g.lineStyle(1, EL.GOLD, EL.LINE.a2).lineBetween(x, y + 0.5, x + w, y + 0.5);
  fadeLine(g, centerX - 760, centerX + 760, y + 0.5, EL.GOLD, 0.6, 'both');
  g.fillStyle(0x140e09, 1).fillPoints(diamondPts(centerX, y + 0.5, 5), true);
  g.lineStyle(1, EL.GOLD, 0.8).strokePoints(diamondPts(centerX, y + 0.5, 5), true);
}

/** Dikey ince ayraç (uçlara doğru söner). */
export function kitDivider(g: Phaser.GameObjects.Graphics, x: number, y0: number, y1: number): void {
  const mid = (y0 + y1) / 2;
  g.fillGradientStyle(EL.GOLD, EL.GOLD, EL.GOLD, EL.GOLD, 0, 0, 0.32, 0.32).fillRect(x, y0, 1, mid - y0);
  g.fillGradientStyle(EL.GOLD, EL.GOLD, EL.GOLD, EL.GOLD, 0.32, 0.32, 0, 0).fillRect(x, mid, 1, y1 - mid);
}

/** Küçük etiket (rütbe, ek eylem, bilgi kutusunun rozeti): koyu zemin + renkli ince çerçeve + Cinzel yazı. Kök = orta. */
export function kitTag(scene: Phaser.Scene, cx: number, cy: number, text: string, hex: string, o: { size?: number; faded?: boolean } = {}): Phaser.GameObjects.GameObject[] {
  const label = elText(scene, cx, cy, text, o.size ?? 12, hex, { em: 0.12 }).setOrigin(0.5);
  const w = label.width + 14;
  const h = label.height + 2;
  const bg = scene.add.graphics();
  bg.fillStyle(0x0c0906, 0.95).fillRect(cx - w / 2, cy - h / 2, w, h);
  bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(hex).color, 0.85).strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
  if (o.faded) for (const ob of [label, bg]) ob.setAlpha(0.5);
  return [bg, label];
}

/** Sağ kenarı `right`, üstü `top` olan rozet (bilgi kutusu). */
export function kitBadge(scene: Phaser.Scene, right: number, top: number, text: string): Phaser.GameObjects.GameObject[] {
  const probe = elText(scene, 0, 0, text, 12, EL.ON, { em: 0.14 });
  const w = probe.width + 18;
  const h = probe.height + 6;
  probe.destroy();
  return kitTag(scene, right - w / 2, top + h / 2, text, '#d9b26a', { size: 12 });
}

/** Yazı için iki yana saydamlaşan koyu bant (sıra yazısı plakası, duyuru). Kök = orta. */
export function kitTextBand(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  hGradient(g, cx - w / 2, cy - h / 2, w, h, 0x0a0705, [
    [0, 0],
    [0.2, 0.94],
    [0.8, 0.94],
    [1, 0],
  ]);
  fadeLine(g, cx - w / 2, cx + w / 2, cy - h / 2 + 0.5, EL.GOLD, 0.5, 'both');
  return g;
}

/** Rakamlı küçük HUD yazısı (koyu gölgeli düz rakamlı serif). */
export function hudNum(scene: Phaser.Scene, x: number, y: number, text: string, size: number, fill: string = EL.TXT): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: HUD_NUM_FONT, fontSize: `${size}px`, fontStyle: 'bold', color: fill })
    .setResolution(2)
    .setShadow(0, 1.5, EL.SH_DARK, 3, true, true);
}
