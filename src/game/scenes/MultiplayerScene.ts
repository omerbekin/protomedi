import Phaser from 'phaser';
import { formatLobbyCode, normalizeLobbyCode } from '../../net/lobby-code';
import { sanitizeName } from '../../net/protocol';
import { copyText, promptCode, promptName, toast } from '../../ui/mp-overlay';
import { preloadCampaignArt } from '../campaign-art';
import { mapArt } from '../map-art';
import { getMap } from '../../campaign';
import { W, H } from '../campaign-ui';
import { buildBackdrop, goldText, makeMenuButton, serif } from '../menu-ui';
import { mp, MP_SCENE } from '../mp-client';
import { makePanel } from '../ui-frame';
import { toggleGameMenu } from '../../ui/game-menu';
import { debugState } from '../debug-state';

/** Sayfa açılışında bir kez: davet linki (?lobby=KOD) ya da yenilenen sekmenin yarım kalan lobisi. main.ts ayarlar. */
let bootIntent: { join: string } | { rejoin: true } | null = null;
export const setMultiplayerBoot = (v: typeof bootIntent): void => {
  bootIntent = v;
};

/**
 * Multiplayer ekranı (docs/design/multiplayer.md): Host lobby / Join lobby menüsü, bağlanma, lobi (büyük kod, Copy code,
 * Copy invite link, rakip göstergesi, Ready) ve hata. İçerik her multiplayer değişikliğinde baştan çizilir.
 */
export class MultiplayerScene extends Phaser.Scene {
  static readonly KEY = MP_SCENE;
  private layer!: Phaser.GameObjects.Container;
  private off: (() => void) | null = null;

  constructor() {
    super(MultiplayerScene.KEY);
  }

  preload(): void {
    preloadCampaignArt(this);
  }

  create(): void {
    const art = mapArt(this, getMap('valdoria')); // geniş harita görseli varsa o (eski 16:9 bölgesi eski yerinde)
    buildBackdrop(this, W, H, art?.key ?? null, art?.region);
    this.layer = this.add.container(0, 0).setDepth(100);
    this.input.keyboard?.on('keydown-ESC', () => !debugState.uiPaused && toggleGameMenu()); // Esc: sağ üstteki Menu
    this.off = mp.onChange(() => this.scene.isActive() && this.draw());
    this.events.once('shutdown', () => {
      this.off?.();
      this.off = null;
    });
    const boot = bootIntent;
    bootIntent = null;
    if (boot && !mp.active) {
      if ('join' in boot) mp.join(boot.join);
      else {
        const s = mp.pendingRejoin();
        if (s) mp.rejoin(s);
      }
    }
    this.draw();
  }

  private draw(): void {
    this.layer.removeAll(true);
    const L = this.layer;
    L.add(goldText(this, W / 2, 130, 'MULTIPLAYER', 96, 10).setOrigin(0.5));
    L.add(serif(this, W / 2, 210, 'Quick Battle against a friend', 30, '#d8c49a', { bold: false, spacing: 3 }).setOrigin(0.5));
    if (mp.state === 'error') return this.drawError();
    if (mp.state === 'connecting') return this.drawConnecting();
    if (mp.active) return this.drawLobby();
    this.drawMenu();
  }

  private button(x: number, y: number, w: number, label: string, run: () => void, primary = false, enabled = true): void {
    const b = makeMenuButton(this, x, y, w, 92, label, () => (enabled ? run() : b.shake()), { primary, size: primary ? 38 : 32 });
    if (!enabled) b.setEnabled(false);
    this.layer.add(b.container);
  }

  private drawMenu(): void {
    const ok = !!mp.serverUrl();
    if (!ok) {
      this.layer.add(serif(this, W / 2, 330, 'Server not configured', 34, '#e08a7a').setOrigin(0.5));
      this.layer.add(serif(this, W / 2, 380, 'The multiplayer server address has not been set up yet.', 22, '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5));
    }
    this.nameLine(W / 2, ok ? 300 : 440);
    const y0 = ok ? 420 : 520;
    this.button(W / 2, y0, 560, 'Host lobby', () => mp.host(), true, ok);
    this.layer.add(serif(this, W / 2, y0 + 62, 'Create a lobby and share its code', 19, '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5));
    this.button(W / 2, y0 + 160, 560, 'Join lobby', () => void this.askCode(), false, ok);
    this.layer.add(serif(this, W / 2, y0 + 222, "Enter a friend's lobby code", 19, '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5));
    this.button(W / 2, y0 + 340, 400, 'Back', () => this.scene.start('MainMenuScene'));
  }

  /** "Name: X  [Change name]" satırı (ad isteğe bağlı; yalnızca rakibe gider). */
  private nameLine(cx: number, y: number): void {
    const { local } = mp.names();
    this.layer.add(serif(this, cx - 30, y, `Name: ${local}`, 26, '#f3e4c4').setOrigin(1, 0.5));
    const b = makeMenuButton(this, cx + 130, y, 260, 56, 'Change name', () => void this.askName(), { size: 22 });
    this.layer.add(b.container);
  }

  private async askName(): Promise<void> {
    const name = await promptName(mp.session?.localName ?? '', sanitizeName);
    if (name !== null && this.scene.isActive()) {
      mp.setName(name);
      this.draw();
    }
  }

  private async askCode(): Promise<void> {
    const code = await promptCode(normalizeLobbyCode);
    if (code && this.scene.isActive()) mp.join(code);
  }

  private drawConnecting(): void {
    this.layer.add(serif(this, W / 2, 470, mp.role === 'host' ? 'Opening the lobby...' : `Joining lobby ${formatLobbyCode(mp.code)}...`, 40, '#f3e4c4').setOrigin(0.5));
    this.button(W / 2, 640, 400, 'Cancel', () => mp.leave());
  }

  private drawError(): void {
    this.layer.add(serif(this, W / 2, 460, mp.error || 'Something went wrong', 38, '#e08a7a').setOrigin(0.5));
    this.button(W / 2, 640, 400, 'Back', () => {
      mp.state = 'idle';
      mp.error = '';
      this.draw();
    });
  }

  private drawLobby(): void {
    const s = mp.session!;
    const L = this.layer;
    // --- Kod paneli ---
    const pw = 1000;
    const px = W / 2 - pw / 2;
    L.add(makePanel(this, px, 270, pw, 300, { top: 0x2e2218, bottom: 0x110b07, bevel: 5, alpha: 0.96 }));
    L.add(serif(this, W / 2, 312, mp.isFake ? 'LOCAL TEST LOBBY (FAKE OPPONENT)' : 'LOBBY CODE', 24, '#c9b27a', { spacing: 6, stroke: 2 }).setOrigin(0.5));
    L.add(goldText(this, W / 2, 400, mp.isFake ? 'LOCAL' : formatLobbyCode(mp.code), 120, 18).setOrigin(0.5));
    const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copied` : 'Could not copy - select it by hand');
    if (!mp.isFake) {
      this.button(W / 2 - 230, 515, 400, 'Copy code', () => void copy(mp.code, 'Code'));
      this.button(W / 2 + 230, 515, 400, 'Copy invite link', () => void copy(mp.inviteLink(), 'Invite link'));
    }
    // --- Oyuncular ---
    const rowY = 640;
    const names = mp.names();
    const you = `${names.local} (you, ${mp.role === 'host' ? 'host, left side' : 'right side'})`;
    const opp = `${names.remote} (${mp.role === 'host' ? 'right side' : 'host, left side'})`;
    const link = s.linkStatus();
    const oppState = s.connected ? (s.ready.remote ? 'Ready' : 'Connected') : s.everConnected && link.phase === 'waiting' ? 'Disconnected...' : 'Waiting for opponent...';
    const rows: Array<[string, string, string]> = [
      [you, s.ready.local ? 'Ready' : 'Not ready', s.ready.local ? '#9be29a' : '#c9b48a'],
      [opp, oppState, s.connected ? (s.ready.remote ? '#9be29a' : '#9cc4ff') : '#e0b07a'],
    ];
    rows.forEach(([who, st, hex], i) => {
      const y = rowY + i * 70;
      L.add(makePanel(this, W / 2 - 500, y - 30, 1000, 60, { top: 0x2a2017, bottom: 0x150e09, bevel: 3, ornaments: false, alpha: 0.95 }));
      const dot = this.add.graphics();
      dot.fillStyle(Phaser.Display.Color.HexStringToColor(hex).color, 1).fillCircle(W / 2 - 460, y, 10);
      L.add(dot);
      L.add(serif(this, W / 2 - 430, y, who, 26, '#f3e4c4').setOrigin(0, 0.5));
      L.add(serif(this, W / 2 + 470, y, st, 26, hex).setOrigin(1, 0.5));
    });
    if (mp.channelMode === 'relay') L.add(serif(this, W / 2, 590, 'Connected through the server (direct link was not possible)', 18, '#9cc4ff', { bold: false, stroke: 2 }).setOrigin(0.5));
    this.nameLine(W / 2, 1010);
    L.add(serif(this, W / 2, 800, s.connected ? 'Both players press Ready to choose teams (4 champions each).' : 'Share the code or the invite link with your friend.', 22, '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5));
    this.button(W / 2 - 230, 900, 400, s.ready.local ? 'Not ready' : 'Ready', () => s.setReady(!s.ready.local), !s.ready.local, s.connected || s.ready.local);
    this.button(W / 2 + 230, 900, 400, 'Leave', () => {
      mp.leave();
      this.scene.start('MainMenuScene');
    });
  }
}
