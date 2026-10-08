/**
 * Debug menüsü > Setup > Multiplayer: sahte rakip (sunucusuz, aynı sekmede loopback), gecikme simülasyonu, bağlantıyı kopar,
 * sahte rakip dönmesin (60 sn kuralı), desync simülasyonu; Data sekmesinde bağlantı bilgisi. Sahne sınıflarını içe aktarmaz.
 */
import type Phaser from 'phaser';
import { mp, MP_SCENE } from '../game/mp-client';
import type { DebugMenu } from './debug-menu';

const SCENES = ['BattleScene', 'TeamSelectScene', 'CampaignMapScene', 'MainMenuScene', MP_SCENE];
export const MP_LATENCIES = [0, 150, 500, 1500];
const TAB = 'Setup';
const SECTION = 'Multiplayer';

function openLobby(game: Phaser.Game): void {
  const active = SCENES.find((k) => game.scene.isActive(k));
  if (active) (game.scene.getScene(active) as Phaser.Scene).scene.start(MP_SCENE);
  else game.scene.start(MP_SCENE);
}

export function registerMultiplayerDebug(game: Phaser.Game, debug: DebugMenu): void {
  debug.register({
    id: 'mp.fake',
    tab: TAB,
    section: SECTION,
    icon: 'robot',
    label: 'Fake opponent',
    hint: 'Open a local multiplayer lobby with a fake opponent in this tab (no server needed): it gets ready, picks a random team and plays its moves; you play the left side',
    run: () => {
      mp.hostWithFake();
      openLobby(game);
    },
  });
  debug.register({
    id: 'mp.latency',
    tab: TAB,
    section: SECTION,
    icon: 'hourglass',
    label: () => `Latency: ${mp.latencyMs} ms`,
    hint: 'Simulated network delay for every multiplayer message (0 / 150 / 500 / 1500 ms)',
    run: () => mp.setLatency(MP_LATENCIES[(MP_LATENCIES.indexOf(mp.latencyMs) + 1) % MP_LATENCIES.length]!),
  });
  debug.register({
    id: 'mp.drop',
    tab: TAB,
    section: SECTION,
    icon: 'drop',
    label: 'Drop connection',
    hint: 'Break the multiplayer connection: with the fake opponent it disconnects (and comes back after 10 s unless "Fake stays away" is on); with a real opponent this tab goes offline for 10 s',
    run: () => mp.dropConnection(),
  });
  debug.register({
    id: 'mp.stay-away',
    tab: TAB,
    section: SECTION,
    icon: 'eye',
    on: () => mp.fakeStaysAway,
    label: () => (mp.fakeStaysAway ? 'Fake stays away: on' : 'Fake stays away: off'),
    hint: 'When on, the fake opponent does not come back after Drop connection: after 60 s you win (disconnect rule)',
    run: () => {
      mp.fakeStaysAway = !mp.fakeStaysAway;
      if (mp.fake) mp.fake.stayAway = mp.fakeStaysAway;
    },
  });
  debug.register({
    id: 'mp.force-relay',
    tab: TAB,
    section: SECTION,
    icon: 'swap',
    on: () => mp.forceRelay,
    label: () => (mp.forceRelay ? 'Force relay: on' : 'Force relay: off'),
    hint: 'For the next lobby you host: skip the direct WebRTC link and send game messages through the server (the backup path used when a direct link fails)',
    run: () => {
      mp.forceRelay = !mp.forceRelay;
    },
  });
  debug.register({
    id: 'mp.desync',
    tab: TAB,
    section: SECTION,
    icon: 'skull',
    label: 'Simulate desync',
    hint: 'Change this side of the multiplayer battle by 1 HP: the next move check finds the desync and the match stops on both sides',
    run: () => void mp.simulateDesync(),
  });
  debug.registerInfo('multiplayer', () => mp.info());
}
