import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { Rng } from '../../engine';

export interface BattleSceneData {
  seed: number;
  showSlots: boolean;
}

const color = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const TEXT_RESOLUTION = 4;

/**
 * Boş savaş sahnesi: zemin, sıra çubuğu yuvaları, parti (solda 4) ve düşman (sağda 5) yuvaları.
 * Henüz karakter yok; yuvalar kesikli çerçeve olarak gösterilir.
 */
export class BattleScene extends Phaser.Scene {
  static readonly KEY = 'BattleScene';

  seed = 1;
  showSlots = true;
  private slotLayer?: Phaser.GameObjects.Container;

  constructor() {
    super(BattleScene.KEY);
  }

  init(data: Partial<BattleSceneData>): void {
    this.seed = data.seed ?? this.seed;
    this.showSlots = data.showSlots ?? this.showSlots;
  }

  create(): void {
    const { virtualWidth: w, virtualHeight: h, groundY, colors } = layout;
    this.cameras.main.setBackgroundColor(colors.sky);

    this.add.rectangle(0, groundY, w, h - groundY, color(colors.ground)).setOrigin(0, 0);
    this.add.rectangle(0, groundY, w, 1, color(colors.groundLine)).setOrigin(0, 0);

    this.drawTurnBar();

    this.slotLayer = this.add.container(0, 0);
    layout.partySlots.forEach((s, i) => this.drawSlot(s.x, s.y, colors.partySlot, `P${i + 1}`));
    layout.enemySlots.forEach((s, i) => this.drawSlot(s.x, s.y, colors.enemySlot, `D${i + 1}`));
    this.slotLayer.setVisible(this.showSlots);

    // Seed'in sahneye ulaştığını gösterir: aynı seed hep aynı zarı verir.
    const roll = new Rng(this.seed).int(1, 6);
    this.label(w / 2, h - 18, `Boş savaş sahnesi · seed ${this.seed} · zar ${roll}`, colors.text).setOrigin(0.5, 0);
  }

  setSlotsVisible(visible: boolean): void {
    this.showSlots = visible;
    this.slotLayer?.setVisible(visible);
  }

  private label(x: number, y: number, text: string, hex: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '8px', color: hex })
      .setResolution(TEXT_RESOLUTION);
  }

  private drawTurnBar(): void {
    const { x, y, cells, cellSize, gap } = layout.turnBar;
    const g = this.add.graphics();
    g.lineStyle(1, color(layout.colors.turnCell), 1);
    for (let i = 0; i < cells; i++) {
      g.strokeRect(x + i * (cellSize + gap) + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    }
    this.label(x - 6, y + cellSize / 2, 'SIRA', layout.colors.text).setOrigin(1, 0.5);
  }

  /** Yuva: ayak noktası (x, y) olan slotSize x slotSize kesikli çerçeve. */
  private drawSlot(x: number, y: number, hex: string, text: string): void {
    const size = layout.slotSize;
    const left = x - size / 2;
    const top = y - size;
    const g = this.add.graphics();
    g.fillStyle(color(hex), 1);
    for (let i = 0; i < size; i += 2) {
      g.fillRect(left + i, top, 1, 1);
      g.fillRect(left + i, top + size - 1, 1, 1);
      g.fillRect(left, top + i, 1, 1);
      g.fillRect(left + size - 1, top + i, 1, 1);
    }
    const t = this.label(x, top + size / 2, text, hex).setOrigin(0.5);
    this.slotLayer?.add([g, t]);
  }
}
