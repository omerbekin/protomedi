import Phaser from 'phaser';
import { content } from '../../engine';
import { CONFIG, deleteSave, deleteSlot, latestSave, listSaves, migrateSaves, readSaves, slotSummaries, type CampaignMode, type Difficulty, type SaveEntry, type SlotSummary } from '../../campaign';
import { preloadAssets } from '../assets';
import { campaignArtKey, hasCampaignArt, preloadCampaignArt } from '../campaign-art';
import { H, W, crown, hpBar, openModal, type Modal } from '../campaign-ui';
import { MAP_SCENE, loadEntry, startNewCampaign, storage } from '../campaign-session';
import { buildBackdrop, classAvatar, classLogoBadge, goldText, makeMenuButton, serif } from '../menu-ui';
import { makePanel } from '../ui-frame';

export interface MainMenuData {
  /** 'load': Load Game penceresi açık başlar (yenilgi sonrası "Load Game"). */
  open?: 'load' | 'new';
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const dateText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Ana menü (campaign.md 1.1 + madde 256): Continue (en son oynanan yuvanın en yeni kaydı) / New Campaign (yuva -> mod + genel zorluk) /
 * Load Game (önce yuva, sonra o yuvanın kayıtları) / Quick Battle (bugünkü takım seçimi akışı).
 */
export class MainMenuScene extends Phaser.Scene {
  static readonly KEY = 'MainMenuScene';
  private layer!: Phaser.GameObjects.Container;
  private modal: Modal | null = null;
  private openOnStart: MainMenuData['open'];

  constructor() {
    super(MainMenuScene.KEY);
  }

  init(data: MainMenuData): void {
    this.openOnStart = data?.open;
    this.modal = null;
  }

  preload(): void {
    preloadAssets(this);
    preloadCampaignArt(this);
  }

  create(): void {
    migrateSaves(storage()); // eski tek-liste kayıtlar Slot 1'e taşınır
    buildBackdrop(this, W, H, hasCampaignArt(this, 'valdoria-bg') ? campaignArtKey('valdoria-bg') : null);
    this.layer = this.add.container(0, 0).setDepth(100);
    const L = this.layer;
    L.add(goldText(this, W / 2, 190, 'PROTOMEDI', 120, 14).setOrigin(0.5));
    L.add(serif(this, W / 2, 285, 'The Valdoria Campaign', 34, '#d8c49a', { bold: false, spacing: 4 }).setOrigin(0.5));

    const { corrupt } = readSaves(storage());
    const latest = latestSave(storage());
    const anySaves = slotSummaries(storage()).some((x) => x && x.saveCount > 0);
    const items: Array<{ label: string; run: () => void; primary?: boolean; enabled?: boolean; sub?: string }> = [];
    if (latest)
      items.push({
        label: 'Continue Campaign',
        primary: true,
        run: () => this.loadSave(latest),
        sub: `Slot ${latest.state.slot + 1} · ${latest.mode === 'ironman' ? 'Ironman' : 'Normal'} · ${CONFIG.difficulties[latest.state.difficulty]?.name} · Stop ${latest.summary.stop}/${latest.summary.stops} · ${latest.summary.node}`,
      });
    items.push({ label: 'New Campaign', primary: !latest, run: () => this.chooseSlot() });
    items.push({ label: 'Load Game', run: () => this.loadSlots(), enabled: anySaves });
    items.push({ label: 'Quick Battle', run: () => this.scene.start('TeamSelectScene'), sub: 'Pick two teams and fight one battle' });
    let y = 420;
    for (const it of items) {
      const b = makeMenuButton(this, W / 2, y, 560, 96, it.label, () => (it.enabled === false ? b.shake() : it.run()), { primary: !!it.primary, size: it.primary ? 42 : 36 });
      if (it.enabled === false) b.setEnabled(false);
      L.add(b.container);
      if (it.sub) L.add(serif(this, W / 2, y + 62, it.sub, 19, '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5));
      y += it.sub ? 148 : 126;
    }
    if (corrupt) L.add(serif(this, W / 2, H - 50, 'A damaged save file was ignored.', 20, '#d88a7e', { bold: false, stroke: 2 }).setOrigin(0.5));
    if (this.openOnStart === 'load' && anySaves) this.loadSlots();
    if (this.openOnStart === 'new') this.chooseSlot();
  }

  private closeModal(): void {
    this.modal?.close();
    this.modal = null;
  }

  private loadSave(entry: SaveEntry): void {
    loadEntry(entry);
    this.scene.start(MAP_SCENE);
  }

  /** Yuva kartı: mod, zorluk, durak, takım avatarları + can, tarih, kayıt sayısı. Boşsa "Empty slot". */
  private slotCard(root: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, i: number, sum: SlotSummary | null, buttons: Array<{ label: string; run: () => void; primary?: boolean }>): void {
    root.add(makePanel(this, x, y, w, h, { top: 0x2a2017, bottom: 0x150e09, bevel: 3, ornaments: false, alpha: 0.95 }));
    root.add(serif(this, x + 24, y + 26, `SLOT ${i + 1}`, 22, '#f3d9a0', { spacing: 3 }));
    if (!sum) {
      root.add(serif(this, x + 24, y + 66, 'Empty slot', 26, '#a8977a', { bold: false }));
    } else {
      const diff = CONFIG.difficulties[sum.difficulty]?.name ?? sum.difficulty;
      root.add(serif(this, x + 150, y + 30, `${sum.mode === 'ironman' ? 'IRONMAN' : 'NORMAL'} · ${diff.toUpperCase()}`, 17, sum.mode === 'ironman' ? '#e08a7a' : '#9cc4ff', { spacing: 2 }));
      const l = sum.latest;
      root.add(serif(this, x + 24, y + 64, l ? `${l.summary.map} · Stop ${l.summary.stop}/${l.summary.stops} · ${l.summary.node}` : 'Journey started, not saved yet', 24, '#f3e4c4'));
      root.add(serif(this, x + 24, y + 98, `${l ? `${l.summary.victories} victories  ·  ` : ''}${sum.saveCount} save${sum.saveCount === 1 ? '' : 's'}  ·  last played ${dateText(sum.lastPlayed)}`, 17, '#a8977a', { bold: false, stroke: 2 }));
      l?.summary.classes.forEach((cls, k) => {
        const def = content.classes[cls];
        if (!def) return;
        const ax = x + 720 + k * 74;
        root.add(classAvatar(this, def, ax, y + 52, 56));
        root.add(classLogoBadge(this, def, ax - 22, y + 72, 11));
        root.add(hpBar(this, ax - 28, y + 86, 56, 8, l.summary.hp[k] ?? 1));
        if (l.state.roster.find((h) => h.class === cls)?.leader) root.add(crown(this, ax + 22, y + 26, 0.7));
      });
    }
    buttons.forEach((b, k) => root.add(makeMenuButton(this, x + w - 90 - (buttons.length - 1 - k) * 170, y + h / 2, 150, 64, b.label, b.run, { primary: !!b.primary, size: 24 }).container));
  }

  // ------------------------------------------------------------ New Campaign: yuva -> mod + zorluk

  private chooseSlot(): void {
    this.closeModal();
    const sums = slotSummaries(storage());
    const rowH = 150;
    this.modal = openModal(this, this.layer, { title: 'New Campaign', subtitle: 'Choose a slot for your journey', width: 1400, height: 250 + sums.length * rowH, buttons: [{ label: 'Back', run: () => this.closeModal() }] });
    const { root, area } = this.modal;
    sums.forEach((sum, i) => {
      const pick = () => (sum ? this.confirmOverwrite(i, sum) : this.chooseOptions(i));
      this.slotCard(root, W / 2 - 660, area.y + i * rowH, 1320, rowH - 14, i, sum, [{ label: sum ? 'Overwrite' : 'Choose', primary: !sum, run: pick }]);
    });
  }

  private confirmOverwrite(slot: number, sum: SlotSummary): void {
    this.closeModal();
    this.modal = openModal(this, this.layer, {
      title: `Overwrite slot ${slot + 1}?`,
      text: `The journey in this slot (${sum.mode === 'ironman' ? 'Ironman' : 'Normal'}, ${sum.latest ? `stop ${sum.latest.summary.stop}, ${sum.latest.summary.node}` : 'not saved yet'}) and all of its ${sum.saveCount} saves will be deleted. This cannot be undone.`,
      height: 440,
      buttons: [
        { label: 'Delete and start', primary: true, run: () => this.chooseOptions(slot) },
        { label: 'Cancel', run: () => this.chooseSlot() },
      ],
    });
  }

  private chooseOptions(slot: number): void {
    this.closeModal();
    let mode: CampaignMode = 'normal';
    let diff: Difficulty = CONFIG.defaultDifficulty;
    this.modal = openModal(this, this.layer, {
      title: 'New Campaign',
      subtitle: `Slot ${slot + 1} · Mode and difficulty cannot be changed later`,
      width: 1300,
      height: 760,
      buttons: [
        {
          label: 'Start',
          primary: true,
          run: () => {
            startNewCampaign(mode, diff, slot);
            this.scene.start(MAP_SCENE);
          },
        },
        { label: 'Back', run: () => this.chooseSlot() },
      ],
    });
    const { root, area } = this.modal;
    const layer = this.add.container(0, 0);
    root.add(layer);
    const draw = () => {
      layer.removeAll(true);
      const pickRow = <T extends string>(y: number, title: string, opts: Array<{ id: T; name: string; lines: string[] }>, cur: T, set: (v: T) => void) => {
        layer.add(serif(this, W / 2, y, title, 22, '#c9b27a', { spacing: 4, stroke: 2 }).setOrigin(0.5, 0));
        const bw = Math.min(360, 1180 / opts.length - 20);
        opts.forEach((o, i) => {
          const x = W / 2 + (i - (opts.length - 1) / 2) * (bw + 20);
          const on = o.id === cur;
          layer.add(makeMenuButton(this, x, y + 74, bw, 70, o.name, () => { set(o.id); draw(); }, { primary: on, size: on ? 32 : 28 }).container);
          o.lines.forEach((l, k) => layer.add(serif(this, x, y + 124 + k * 26, l, 18, on ? '#f3e4c4' : '#a8977a', { bold: false, stroke: 2 }).setOrigin(0.5, 0)));
        });
      };
      pickRow(area.y, 'MODE', [
        { id: 'normal' as CampaignMode, name: 'Normal', lines: ['Autosave after every victory', 'Save on the map at any time', 'Up to 5 saves in this slot'] },
        { id: 'ironman' as CampaignMode, name: 'Ironman', lines: ['Saved only after a victory', 'No manual saves', 'A single save, always overwritten'] },
      ], mode, (v) => (mode = v));
      pickRow(area.y + 250, 'DIFFICULTY', DIFFS.map((d) => ({ id: d, name: CONFIG.difficulties[d].name, lines: [CONFIG.difficulties[d].text] })), diff, (v) => (diff = v));
    };
    draw();
  }

  // ------------------------------------------------------------ Load Game: yuva -> kayıtlar

  private loadSlots(): void {
    this.closeModal();
    const sums = slotSummaries(storage());
    const rowH = 150;
    this.modal = openModal(this, this.layer, { title: 'Load Game', subtitle: 'Choose a slot', width: 1400, height: 250 + sums.length * rowH, buttons: [{ label: 'Back', run: () => this.closeModal() }] });
    const { root, area } = this.modal;
    sums.forEach((sum, i) => {
      const buttons = sum
        ? [
            { label: 'Delete', run: () => this.confirmDeleteSlot(i, sum) },
            { label: 'Open', primary: true, run: () => (sum.saveCount ? this.loadGame(i) : undefined) },
          ]
        : [];
      this.slotCard(root, W / 2 - 660, area.y + i * rowH, 1320, rowH - 14, i, sum, buttons);
    });
  }

  private confirmDeleteSlot(slot: number, sum: SlotSummary): void {
    this.closeModal();
    this.modal = openModal(this, this.layer, {
      title: `Delete slot ${slot + 1}?`,
      text: `The whole journey (${sum.mode === 'ironman' ? 'Ironman' : 'Normal'}) and all of its ${sum.saveCount} saves will be lost. This cannot be undone.`,
      height: 420,
      buttons: [
        {
          label: 'Delete',
          primary: true,
          run: () => {
            deleteSlot(storage(), slot);
            this.loadSlots();
          },
        },
        { label: 'Cancel', run: () => this.loadSlots() },
      ],
    });
  }

  private loadGame(slot: number): void {
    this.closeModal();
    const saves = listSaves(storage(), slot);
    const rows = Math.max(1, saves.length);
    const rowH = 118;
    this.modal = openModal(this, this.layer, {
      title: `Load Game · Slot ${slot + 1}`,
      width: 1400,
      height: Math.min(1000, 210 + rows * rowH + 40),
      buttons: [{ label: 'Back to slots', run: () => this.loadSlots() }],
    });
    const { root, area } = this.modal;
    if (!saves.length) root.add(serif(this, W / 2, area.y + 40, 'No saved games in this slot.', 26, '#c9b48a', { bold: false }).setOrigin(0.5, 0));
    saves.forEach((e, i) => {
      const y = area.y + i * rowH;
      const x = W / 2 - 660;
      root.add(makePanel(this, x, y, 1320, rowH - 12, { top: 0x2a2017, bottom: 0x150e09, bevel: 3, ornaments: false, alpha: 0.95 }));
      root.add(serif(this, x + 24, y + 18, `${e.kind === 'manual' ? 'MANUAL' : e.kind === 'start' ? 'START' : 'AUTO'} · ${i === 0 ? 'NEWEST' : ''}`.replace(/ · $/, ''), 16, '#9cc4ff', { spacing: 2 }));
      root.add(serif(this, x + 24, y + 44, `${e.summary.map} · Stop ${e.summary.stop}/${e.summary.stops} · ${e.summary.node}`, 24, '#f3e4c4'));
      root.add(serif(this, x + 24, y + 76, `${e.summary.region}  ·  ${e.summary.victories} victories  ·  ${dateText(e.savedAt)}`, 17, '#a8977a', { bold: false, stroke: 2 }));
      e.summary.classes.forEach((cls, k) => {
        const def = content.classes[cls];
        if (!def) return;
        const ax = x + 720 + k * 74;
        root.add(classAvatar(this, def, ax, y + 40, 56));
        root.add(classLogoBadge(this, def, ax - 22, y + 60, 11));
        root.add(hpBar(this, ax - 28, y + 74, 56, 8, e.summary.hp[k] ?? 1));
      });
      root.add(makeMenuButton(this, x + 1110, y + 52, 150, 64, 'Load', () => this.loadSave(e), { primary: true, size: 26 }).container);
      const del = makeMenuButton(this, x + 1250, y + 52, 110, 64, 'Delete', () => {
        this.closeModal();
        this.modal = openModal(this, this.layer, {
          title: 'Delete save?',
          text: `${e.summary.node}, stop ${e.summary.stop}. This cannot be undone.`,
          height: 400,
          buttons: [
            {
              label: 'Delete',
              primary: true,
              run: () => {
                deleteSave(storage(), slot, e.id);
                this.loadGame(slot);
              },
            },
            { label: 'Cancel', run: () => this.loadGame(slot) },
          ],
        });
      }, { size: 22 });
      root.add(del.container);
    });
  }
}
