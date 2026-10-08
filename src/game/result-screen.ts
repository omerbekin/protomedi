import Phaser from 'phaser';
import type { Battle, BattleEvent, Combatant } from '../engine';
import { debugState } from './debug-state';
import { copyMatchData } from '../ui/match-copy';
import { fitText, goldText, makeMenuButton, serif } from './menu-ui';
import { GOLD, makePanel } from './ui-frame';
import { tierStyle, unitName } from './unit-label';
import { FULL_W, FULL_X0 } from '../ui/viewport';

/**
 * Savaş sonu ekranı (VICTORY / DEFEAT): koyu vinyet, ortada plaket, altında iki takımın özet paneli, altta düğmeler.
 * Oyun kuralı bilmez: özet sayıları yalnızca olay akışından (`BattleStats`) ve birimlerin son canından okunur.
 */

/** Olay akışından (damage / heal / turnStart) biriktirilen savaş sayaçları. Çağrılanların sayıları sahibine yazılır. */
export class BattleStats {
  /** Savaşta oynanan toplam sıra (turnStart olayları). */
  turns = 0;
  readonly dealt = new Map<string, number>();
  readonly taken = new Map<string, number>();
  readonly healed = new Map<string, number>();

  constructor(private readonly battle: Battle) {}

  /** Çağrılan birim ise sahibinin uid'i, değilse kendi uid'i. */
  private credit(uid: string): string {
    const c = this.battle.get(uid);
    return c?.summoned && c.owner ? c.owner : uid;
  }

  private add(map: Map<string, number>, uid: string, n: number): void {
    map.set(uid, (map.get(uid) ?? 0) + n);
  }

  record(e: BattleEvent): void {
    if (e.type === 'turnStart') this.turns++;
    else if (e.type === 'damage') {
      if (e.amount <= 0) return;
      const src = this.credit(e.source);
      const dst = this.credit(e.target);
      this.add(this.taken, dst, e.amount);
      const a = this.battle.get(src);
      const b = this.battle.get(dst);
      if (src !== dst && a && b && a.side !== b.side) this.add(this.dealt, src, e.amount);
    } else if (e.type === 'heal') {
      if (e.amount > 0) this.add(this.healed, this.credit(e.source), e.amount);
    }
  }
}

export interface ResultScreenOptions {
  victory: boolean;
  battle: Battle;
  stats: BattleStats;
  /** Birimin kafa avatarı (BattleScene.avatarImage). */
  avatar: (unit: Combatant, cx: number, cy: number, size: number) => Phaser.GameObjects.Image;
  onNewGame: () => void;
  onTeamSelect: () => void;
  /** Maç kaydı (Copy match data bağlantısı); yoksa bağlantı gösterilmez. */
  matchData?: () => { text: string; moves: number } | null;
  /** Debug önizlemesi: gerçek savaş bitmedi; "Close" düğmesi + Esc ile kapanır. */
  preview?: boolean;
  /** Sefer savaşı: New Game / Team Select yerine bu düğmeler (Continue, Load Last Save, Load Game, Main Menu). Enter = ilk düğme. */
  actions?: ResultAction[];
  /** Multiplayer: yerel oyuncunun tarafı (katılan sağ taraf = 'enemy'); yoksa 'party'. */
  localSide?: 'party' | 'enemy';
  /** Multiplayer: başlık ve alt yazı yerine (ör. 'NO CONTEST', 'Your opponent left the battle'). */
  title?: string;
  subtitle?: string;
  /** Multiplayer: sütun başlıkları (yerel ve rakip oyuncunun adı). */
  headings?: { local: string; remote: string };
}

/** Sonuç ekranının özel düğmesi (sefer bağlamı: src/game/campaign-session.ts). */
export interface ResultAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface ResultScreen {
  destroy(): void;
}

const W = 1920;
const H = 1080;
const DEPTH = 6000;
const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`;

/** Ortası elmaslı ince süs çizgisi (merkez cx, cy). */
function ornamentLine(scene: Phaser.Scene, cx: number, cy: number, half: number, edge: number, light: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  for (const dir of [-1, 1]) {
    g.lineStyle(2, edge, 0.9).lineBetween(cx + dir * 16, cy, cx + dir * half, cy);
    g.lineStyle(1, light, 0.55).lineBetween(cx + dir * 16, cy + 4, cx + dir * (half - 30), cy + 4);
    g.fillStyle(light, 0.9).fillCircle(cx + dir * half, cy, 3);
  }
  const d = 8;
  const pts = [new Phaser.Math.Vector2(cx, cy - d), new Phaser.Math.Vector2(cx + d, cy), new Phaser.Math.Vector2(cx, cy + d), new Phaser.Math.Vector2(cx - d, cy)];
  g.fillStyle(0x1a1008, 1).fillPoints(pts, true);
  g.lineStyle(1.5, light, 1).strokePoints(pts, true);
  return g;
}

export function showResultScreen(scene: Phaser.Scene, o: ResultScreenOptions): ResultScreen {
  const { victory, battle, stats } = o;
  const accent = victory ? { edge: GOLD.edge, light: GOLD.light, text: '#f3d9a0' } : { edge: 0x6e2c26, light: 0xb0584c, text: '#d88a7e' };
  const root = scene.add.container(0, 0).setDepth(DEPTH);

  // --- Vinyet: sahne hafifçe kararır; altındaki tıklamaları yutar ---
  // geniş ekran: örtüler görünen alanın tamamını kaplar (FULL_X0..)
  const dim = scene.add.rectangle(FULL_X0, 0, FULL_W, H, 0x050302, 0).setOrigin(0, 0).setInteractive();
  const edge = scene.add.graphics();
  edge.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.5, 0.5, 0, 0).fillRect(FULL_X0, 0, FULL_W, 200);
  edge.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.55, 0.55).fillRect(FULL_X0, H - 260, FULL_W, 260);
  edge.setAlpha(0);
  root.add([dim, edge]);
  scene.tweens.add({ targets: dim, fillAlpha: victory ? 0.5 : 0.62, duration: 360 });
  scene.tweens.add({ targets: edge, alpha: 1, duration: 360 });

  // --- Plaket ---
  const plaqueW = 820;
  const plaqueH = 198;
  const px = W / 2 - plaqueW / 2;
  const py = 70;
  const plaque = scene.add.container(0, -50).setAlpha(0);
  const panelParts = makePanel(scene, px, py, plaqueW, plaqueH, { top: victory ? 0x3a2b16 : 0x2c1613, bottom: 0x120a06, edge: accent.edge, light: accent.light, bevel: 5 });
  plaque.add(panelParts);
  const local = o.localSide ?? 'party';
  const title = victory ? goldText(scene, W / 2, py + 58, o.title ?? 'VICTORY', 96, 8) : serif(scene, W / 2, py + 58, o.title ?? 'DEFEAT', 96, '#c4695d', { spacing: 8 });
  title.setOrigin(0.5);
  if (!victory) title.setTint(0xd98a7e, 0xd98a7e, 0x8a3a32, 0x8a3a32);
  plaque.add(title);
  plaque.add(ornamentLine(scene, W / 2, py + 118, 300, accent.edge, accent.light));
  const myUnits = battle.combatants.filter((c) => c.side === local && !c.summoned);
  const standing = myUnits.filter((c) => c.hp > 0).length;
  const sub = o.subtitle ?? (victory ? 'The enemy line is broken' : 'Your party has fallen');
  plaque.add(serif(scene, W / 2, py + 148, sub, 26, accent.text, { bold: false, spacing: 1 }).setOrigin(0.5));
  plaque.add(serif(scene, W / 2, py + 176, `${stats.turns} turns  -  ${standing} of ${myUnits.length} heroes standing`, 18, '#9c8a68', { bold: false, stroke: 2 }).setOrigin(0.5));
  plaque.setSize(plaqueW, plaqueH);
  root.add(plaque);
  plaque.setAlpha(0);
  scene.tweens.add({ targets: plaque, y: 0, alpha: 1, duration: 520, ease: 'Cubic.easeOut', delay: 120 });

  // --- Özet paneli ---
  const sx = 230;
  const sy = 300;
  const sw = W - sx * 2;
  const headH = 82;
  // Up to 12 units per team: with more than 5 rows the rows get shorter so the panel and the buttons still fit the screen
  const rowCount = Math.max(5, ...(['party', 'enemy'] as const).map((side) => battle.combatants.filter((c) => c.side === side && !c.summoned).length));
  const rowH = Math.max(36, Math.min(70, Math.floor((590 - headH - 28) / rowCount)));
  const compact = rowH < 58;
  const sh = headH + rowH * rowCount + 28;
  const summary = scene.add.container(0, 24).setAlpha(0);
  summary.add(makePanel(scene, sx, sy, sw, sh, { top: 0x2a2018, bottom: 0x0e0906, bevel: 4, alpha: 0.97 }));
  const colW = (sw - 60) / 2;
  const divider = scene.add.graphics();
  divider.lineStyle(2, GOLD.dark, 0.9).lineBetween(W / 2, sy + 26, W / 2, sy + sh - 26);
  divider.lineStyle(1, GOLD.edge, 0.4).lineBetween(W / 2 + 3, sy + 26, W / 2 + 3, sy + sh - 26);
  summary.add(divider);
  root.add(summary);
  scene.tweens.add({ targets: summary, y: 0, alpha: 1, duration: 480, ease: 'Cubic.easeOut', delay: 380 });

  const winnerSide = victory ? local : local === 'party' ? 'enemy' : 'party';
  const roster = (side: 'party' | 'enemy') => battle.combatants.filter((c) => c.side === side && !c.summoned).sort((a, b) => a.slot - b.slot);
  // MVP: yalnızca Victory'de oyuncu tarafının en çok hasar vereni (hiç hasar yoksa yok)
  const winners = roster(winnerSide);
  const mvp = !victory ? undefined : winners.reduce<Combatant | undefined>((best, c) => ((stats.dealt.get(c.uid) ?? 0) > (stats.dealt.get(best?.uid ?? '') ?? 0) ? c : best), undefined);

  const rowItems: Phaser.GameObjects.Container[] = [];
  (['party', 'enemy'] as const).forEach((side, col) => {
    const cx0 = sx + 30 + col * (colW + 0);
    const heading = o.headings ? (side === local ? o.headings.local : o.headings.remote).toUpperCase() : side === local ? 'YOUR PARTY' : 'ENEMY';
    const head = serif(scene, cx0 + 14, sy + 30, heading, 26, side === winnerSide ? '#f3d9a0' : '#a8977a', { spacing: 4 }).setOrigin(0, 0.5);
    summary.add(head);
    const cols = [colW - 215, colW - 135, colW - 55]; // DMG / TAKEN / HEAL merkez x (sütun içi)
    ['DEALT', 'TAKEN', 'HEALED'].forEach((label, i) => {
      summary.add(serif(scene, cx0 + cols[i]!, sy + 58, label, 14, '#8d7d5f', { bold: false, stroke: 2, spacing: 2 }).setOrigin(0.5));
    });
    const lineG = scene.add.graphics();
    lineG.lineStyle(1, GOLD.edge, 0.5).lineBetween(cx0 + 10, sy + 70, cx0 + colW - 10, sy + 70);
    summary.add(lineG);

    roster(side).forEach((c, i) => {
      const alive = c.hp > 0;
      const ry = sy + headH + i * rowH + rowH / 2;
      const row = scene.add.container(0, 0).setAlpha(0);
      const isMvp = mvp?.uid === c.uid;
      const g = scene.add.graphics();
      g.fillStyle(isMvp ? 0x5a4220 : 0x000000, isMvp ? 0.45 : i % 2 === 0 ? 0.18 : 0.08).fillRoundedRect(cx0 + 4, ry - rowH / 2 + 3, colW - 8, rowH - 6, 6);
      if (isMvp) g.lineStyle(1.5, GOLD.light, 0.8).strokeRoundedRect(cx0 + 4, ry - rowH / 2 + 3, colW - 8, rowH - 6, 6);
      // Avatar çerçevesi
      const av = Math.min(54, rowH - 10);
      const ax = cx0 + 14 + av / 2;
      g.fillStyle(0x0c0805, 1).fillRect(ax - av / 2, ry - av / 2, av, av);
      row.add(g);
      const face = o.avatar(c, ax, ry, av - 4);
      face.setDepth(0);
      if (!alive) face.setTint(0x555555).setAlpha(0.6);
      row.add(face);
      const fr = scene.add.graphics();
      fr.lineStyle(2, alive ? GOLD.edge : 0x4a3f33, 1).strokeRect(ax - av / 2, ry - av / 2, av, av);
      row.add(fr);
      // İsim + MVP
      const nameX = ax + av / 2 + 14;
      const nameText = fitText(serif(scene, nameX, compact ? ry : ry - 13, unitName(c), compact ? 19 : 24, alive ? (tierStyle(c.tier)?.hex ?? '#f3e4c4') : '#8d8070').setOrigin(0, 0.5), compact ? 120 : 175);
      row.add(nameText);
      const tagX = compact ? nameX + nameText.displayWidth + 8 : nameX;
      const tagY = compact ? ry : ry + 15;
      const tagSize = compact ? 13 : 17;
      if (isMvp) row.add(serif(scene, tagX, tagY, 'MVP', tagSize, '#ffe29a', { spacing: 3 }).setOrigin(0, 0.5));
      else if (!alive) row.add(serif(scene, tagX, tagY, 'Fallen', tagSize, '#7d6f62', { bold: false, stroke: 2 }).setOrigin(0, 0.5));
      // Can çubuğu
      const bx = nameX + (compact ? 190 : 185);
      const bw = compact ? 110 : 120;
      const ratio = Phaser.Math.Clamp(c.hp / Math.max(1, c.maxHp), 0, 1);
      const bar = scene.add.graphics();
      const barH = compact ? 9 : 14;
      const barY = compact ? ry - 14 : ry - 16;
      bar.fillStyle(0x090604, 1).fillRect(bx, barY, bw, barH);
      if (ratio > 0) bar.fillStyle(side === 'party' ? 0x4f9a4a : 0xb2463c, 1).fillRect(bx + 1, barY + 1, Math.max(2, (bw - 2) * ratio), barH - 2);
      bar.fillStyle(0xffffff, 0.12).fillRect(bx + 1, barY + 1, bw - 2, compact ? 2 : 4);
      bar.lineStyle(1, GOLD.dark, 1).strokeRect(bx - 0.5, barY - 0.5, bw + 1, barH + 1);
      row.add(bar);
      row.add(serif(scene, bx + bw / 2, compact ? ry + 8 : ry + 14, alive ? `${c.hp} / ${c.maxHp}` : '0', compact ? 12 : 15, '#b5a587', { bold: false, stroke: 2 }).setOrigin(0.5));
      // Sayaçlar
      const nums: Array<[number, string]> = [
        [stats.dealt.get(c.uid) ?? 0, '#f0cf8a'],
        [stats.taken.get(c.uid) ?? 0, '#d98a7e'],
        [stats.healed.get(c.uid) ?? 0, '#8fd08a'],
      ];
      nums.forEach(([n, hexc], k) => {
        row.add(serif(scene, cx0 + cols[k]!, ry, n > 0 ? String(n) : '-', compact ? 19 : 24, n > 0 ? hexc : '#6b5f4d', { stroke: 3 }).setOrigin(0.5));
      });
      summary.add(row);
      rowItems.push(row);
    });
  });
  rowItems.forEach((row, i) => {
    const [dx, dy] = [0, 12];
    row.y = dy;
    row.x = dx;
    scene.tweens.add({ targets: row, alpha: 1, y: 0, duration: 340, ease: 'Sine.easeOut', delay: 640 + (i % 5) * 70 + Math.floor(i / 5) * 30 });
  });

  // --- Düğmeler ---
  const by = sy + sh + 80;
  let done = false;
  const once = (fn: () => void) => () => {
    if (done) return;
    done = true;
    fn();
  };
  const newGame = once(() => o.onNewGame());
  const teamSelect = once(() => o.onTeamSelect());
  const buttons = scene.add.container(0, 0).setAlpha(0);
  const bw = 400;
  const bh = 84;
  // Sefer savaşı: özel düğmeler (yan yana, ortalı); önizlemede yok sayılır
  const actions = !o.preview && o.actions?.length ? o.actions.map((a) => ({ ...a, run: once(a.run) })) : null;
  if (actions) {
    const aw = actions.length > 2 ? 360 : bw;
    const gap = 40;
    const x0 = W / 2 - ((actions.length - 1) * (aw + gap)) / 2;
    actions.forEach((a, i) => buttons.add(makeMenuButton(scene, x0 + i * (aw + gap), by, aw, bh, a.label, a.run, { primary: !!a.primary, size: a.primary ? 38 : 32 }).container));
  } else if (o.preview) {
    buttons.add(makeMenuButton(scene, W / 2 - 220, by, bw, bh, 'Close preview', () => destroy(), { primary: true, size: 36 }).container);
    buttons.add(makeMenuButton(scene, W / 2 + 220, by, bw, bh, 'Team Select', teamSelect, { size: 36 }).container);
  } else {
    buttons.add(makeMenuButton(scene, W / 2 - 220, by, bw, bh, 'New Game', newGame, { primary: true, size: 40 }).container);
    buttons.add(makeMenuButton(scene, W / 2 + 220, by, bw, bh, 'Team Select', teamSelect, { size: 36 }).container);
  }
  const hintText = actions ? `Enter: ${actions[0]!.label}` : o.preview ? 'Preview  -  Enter or Esc closes' : 'Enter: New Game     Esc: Team Select';
  const hint = serif(scene, W / 2, by + bh / 2 + 28, hintText, 18, hex(0x8d7d5f), { bold: false, stroke: 2, spacing: 1 }).setOrigin(0.5);
  buttons.add(hint);
  if (o.matchData) {
    const matchData = o.matchData;
    const link = serif(scene, W / 2, Math.min(by + bh / 2 + 62, H - 18), 'Copy match data', 20, '#c9b27a', { bold: false, stroke: 2, spacing: 1 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor('#ffe29a'));
    link.on('pointerout', () => link.setColor('#c9b27a'));
    link.on('pointerdown', () => {
      void copyMatchData({ get: matchData }).then((r) => link.setText(r.ok ? `Copied (${r.moves} moves)` : 'Copy match data'));
    });
    buttons.add(link);
  }
  root.add(buttons);
  scene.tweens.add({ targets: buttons, alpha: 1, duration: 420, delay: 1000 });

  // --- Klavye: Enter = New Game, Esc = Team Select (wiki/debug menüsü açıkken yok sayılır) ---
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || debugState.uiPaused || e.defaultPrevented) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (actions) actions[0]!.run();
      else if (o.preview) destroy();
      else newGame();
    } else if (e.key === 'Escape') {
      if (actions) return;
      if (o.preview) destroy();
      else teamSelect();
    }
  };
  // Aynı tuş vuruşunu menü/wiki da yakalayabilir: onlar önce çalıştıysa defaultPrevented görürüz
  window.addEventListener('keydown', onKey);
  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('keydown', onKey);
    scene.tweens.killTweensOf(root.list);
    root.destroy(true);
  }
  scene.events.once('shutdown', destroy);
  return { destroy };
}
