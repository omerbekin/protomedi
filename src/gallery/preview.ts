/**
 * Galerideki gömülü savaş sahnesi: oyunun kendi BattleScene'i TEST modunda (sırasız) çalışır; skill'ler debug galerisinin
 * kullandığı `debugCastSkill` ile oynatılır (aynı animasyon ve ses kodu, kopya yok). Bu modül Phaser'ı yüklediği için
 * sayfa tarafından tembel (dynamic import) çağrılır.
 */
import Phaser from 'phaser';
import layout from '../../data/battle-layout.json';
import { debugState } from '../game/debug-state';
import { BattleScene } from '../game/scenes/BattleScene';
import { skillOwner } from './catalog';
import { stageTeams } from './stage-teams';

const SEED = 7;

export class Preview {
  readonly game: Phaser.Game;
  readonly ready: Promise<BattleScene>;
  /** Hedef yuva; null = otomatik (ilk canlı düşman). */
  cell: number | null = null;
  slow = false;

  constructor(host: HTMLElement) {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: layout.width,
      height: layout.height,
      backgroundColor: '#000000',
      antialias: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
    });
    // Debug menüsündeki gibi: ayar dışarıdan değişebilsin
    (window as unknown as { __game?: Phaser.Game }).__game = this.game;
    this.ready = new Promise((resolve) => {
      const start = (): void => {
        this.game.scene.add(BattleScene.KEY, BattleScene, true, { seed: SEED, mode: 'test', teams: stageTeams() });
        const timer = window.setInterval(() => {
          const scene = this.game.scene.getScene(BattleScene.KEY) as BattleScene | null;
          if (scene && (scene as { battle?: unknown }).battle && scene.scene.isActive()) {
            window.clearInterval(timer);
            debugState.galleryReset = true;
            resolve(scene);
          }
        }, 50);
      };
      if (this.game.isBooted) start();
      else this.game.events.once(Phaser.Core.Events.READY, start);
    });
  }

  /** Skill'i sahibinin birimiyle oynatır. Hata varsa kısa mesaj, yoksa ''. */
  async play(skillId: string): Promise<string> {
    const scene = await this.ready;
    debugState.speed = this.slow ? 0.25 : 1;
    scene.applyDebugTiming();
    const owner = skillOwner(skillId);
    const units = scene.debugUnits().filter((c) => c.side === 'party' && c.hp > 0 && !c.summoned);
    const caster = units.find((c) => c.defId === owner.id) ?? units[0];
    if (!caster) return 'No caster on stage';
    scene.galleryCaster = caster.uid;
    scene.galleryCell = this.cell;
    const audio = (this.game.sound as unknown as { context?: AudioContext }).context;
    if (audio) void audio.resume();
    return scene.debugCastSkill(skillId);
  }

  /** Sahne içindeki birim adı (hedef hücre etiketi için). */
  async unitAt(board: 'party' | 'enemy', slot: number): Promise<string | null> {
    const scene = await this.ready;
    return scene.battle.combatants.find((c) => c.board === board && c.slot === slot && c.hp > 0)?.name ?? null;
  }
}
