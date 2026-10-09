import Phaser from 'phaser';
import { content } from '../engine';
import { CONFIG, deleteSave, deleteSlot, listSaves, slotSummaries, type CampaignMode, type Difficulty, type SaveEntry, type SlotSummary } from '../campaign';
import { storage } from './campaign-session';
import { H, W, crown, hpBar } from './campaign-ui';
import { classAvatar, classLogoBadge } from './menu-ui';
import { EL, elBack, elBody, elButton, elDiamond, elGlow, elPanel, elText, fadeLine, fitW, hGradient } from './elegant-ui';
import { FULL_W, FULL_X0 } from '../ui/viewport';
import { onStageResize, stageView } from './stage';

/**
 * Sefer yuvaları "Column" (Ömer 2026-10-09, taslak campaign-slots.html v3; seçimden sonra silindi): New Campaign ve Load Game aynı ekran.
 * Solda ana menü dilinde yuva satırları (kor elmas + Cinzel ad + Garamond alt yazı), sağda detay paneli:
 *  - New: adım I (yuva: dolu yuvada "Overwrite this slot" -> panel içi onay "Accept" / "Cancel"; boşta "Choose"), adım II (mod + zorluk
 *    seçenek kartları, Back / "Begin the journey"). Yuva silme Accept'te değil başlangıçta olur (startNewCampaign yuvayı yeniden kurar).
 *  - Load: yuvanın kayıtları (Load / Delete, silme panel içinde onaylanır) + "Delete slot". Haritadan açılınca (`onlySlot`) yalnızca o yuva.
 * Sol üstte kit "◂ Back  Esc" (Geri / Menu kuralı). Esc = `back()`: önce onay, sonra adım II -> I, sonra kapanır.
 */

export interface SlotBrowserOptions {
  flow: 'new' | 'load';
  /** Başta seçili yuva (verilmezse New: ilk boş, Load: en son oynanan). */
  slot?: number;
  /** Yalnızca bu yuvayı göster (harita > Menu > Load). */
  onlySlot?: boolean;
  onClose: () => void;
  onStart?: (mode: CampaignMode, difficulty: Difficulty, slot: number) => void;
  onLoad?: (entry: SaveEntry) => void;
  /** Kayıt / yuva silindi (ana menü Campaign kartını yeniler). */
  onChanged?: () => void;
}

export interface SlotBrowser {
  root: Phaser.GameObjects.Container;
  /** Esc / Back: onay -> adım -> kapat. */
  back(): void;
  close(): void;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const MODES: Array<{ id: CampaignMode; name: string; lines: string[] }> = [
  { id: 'normal', name: 'Normal', lines: ['Autosave after every victory', 'Save on the map at any time', 'Up to 5 saves in this slot'] },
  { id: 'ironman', name: 'Ironman', lines: ['Saved only after a victory', 'No manual saves', 'One save, always overwritten'] },
];
const KICKER = 'rgba(217,178,106,0.85)';
const COL_X = 110;
const ROW_W = 470;
const ROW_H = 100;
const PANEL_X = 680;
const PANEL_R = 110;
const PANEL_Y = 190;
const PAD = 44;

const dateText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const modeName = (m: CampaignMode) => (m === 'ironman' ? 'Ironman' : 'Normal');
const diffName = (d: Difficulty) => CONFIG.difficulties[d]?.name ?? d;
const kindName = (k: SaveEntry['kind']) => (k === 'manual' ? 'Manual' : k === 'start' ? 'Start' : 'Auto');

interface Confirm {
  text: string;
  yes: string;
  run: () => void;
}

export function openSlotBrowser(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, o: SlotBrowserOptions): SlotBrowser {
  const root = scene.add.container(0, 0);
  layer.add(root);
  let sums = slotSummaries(storage());
  const visible = (): number[] => (o.onlySlot && o.slot !== undefined ? [o.slot] : sums.map((_, i) => i));
  const st = {
    slot: o.slot ?? (o.flow === 'new' ? Math.max(0, sums.findIndex((x) => !x)) : latestSlot(sums)),
    step: 1 as 1 | 2,
    confirm: null as Confirm | null,
    mode: 'normal' as CampaignMode,
    diff: CONFIG.defaultDifficulty as Difficulty,
  };
  let closed = false;

  // --- zemin: tüm alanı kaplayan örtü (alttaki tıklamaları yutar) + soldan gölge ---
  const dim = scene.add.rectangle(FULL_X0, 0, FULL_W, H, 0x050302, 0.86).setOrigin(0, 0).setInteractive();
  const shade = scene.add.graphics();
  const drawShade = () => {
    shade.clear();
    const x0 = Math.min(FULL_X0, stageView.left);
    hGradient(shade, x0, 0, 640 - x0, H, EL.INK, [
      [0, 1],
      [0.75, 0.97],
      [1, 0],
    ]);
  };
  drawShade();
  onStageResize(scene, () => shade.active && drawShade());
  root.add([dim, shade]);
  const back = elBack(scene, () => api.back());
  root.add(back.root);

  // --- başlık + adımlar ---
  const title = elText(scene, COL_X, 168, o.flow === 'new' ? 'New Campaign' : 'Load Game', 44, '#ffffff', { em: 0.14 }).setOrigin(0, 0.5);
  title.setTint(0xfbe7b0, 0xfbe7b0, 0xc7984f, 0xc7984f);
  root.add(title);
  const steps = scene.add.container(COL_X, 236);
  root.add(steps);
  const drawSteps = () => {
    steps.removeAll(true);
    if (o.flow !== 'new') return;
    const a = elText(scene, 0, 0, 'I · Slot', 16, st.step === 1 ? EL.ON : EL.DIM, { em: 0.14 }).setOrigin(0, 0.5);
    const line = scene.add.graphics();
    line.lineStyle(1, EL.GOLD, EL.LINE.a2).lineBetween(a.width + 16, 0, a.width + 60, 0);
    const b = elText(scene, a.width + 76, 0, 'II · Mode & difficulty', 16, st.step === 2 ? EL.ON : EL.DIM, { em: 0.14 }).setOrigin(0, 0.5);
    steps.add([a, line, b]);
  };

  // --- yuva satırları (ana menü sütunu dili) ---
  const rows: Array<{ i: number; setOn(on: boolean): void; refresh(): void }> = [];
  const rowsTop = o.flow === 'new' ? 290 : 250;
  const buildRows = () => {
    for (const r of rows) r.refresh();
  };
  visible().forEach((i, k) => {
    const y = rowsTop + k * ROW_H;
    const c = scene.add.container(COL_X, y);
    const line = scene.add.graphics();
    fadeLine(line, -8, ROW_W, ROW_H - 1, EL.GOLD, EL.LINE.a1 * 2, 'out');
    const dia = elDiamond(scene, 7).setPosition(4, ROW_H / 2 - 12).setAlpha(0).setScale(0.4);
    const name = elText(scene, 24, ROW_H / 2 - 12, `Slot ${i + 1}`, 30, EL.TXT, { em: 0.05, pad: true }).setOrigin(0, 0.5);
    const sub = elBody(scene, 24, ROW_H / 2 + 22, '', 21, EL.MUTED).setOrigin(0, 0.5);
    const zone = scene.add.zone(ROW_W / 2 - 8, ROW_H / 2, ROW_W + 16, ROW_H).setInteractive({ useHandCursor: true });
    c.add([line, dia, name, sub, zone]);
    root.add(c);
    let hover = false;
    const paint = () => {
      const on = hover || st.slot === i;
      scene.tweens.killTweensOf([dia, name, sub]);
      scene.tweens.add({ targets: dia, alpha: on ? 1 : 0, scale: on ? 1 : 0.4, duration: 180, ease: EL.EASE });
      scene.tweens.add({ targets: [name], x: (on ? 32 : 24) - EL.PAD, duration: 180, ease: EL.EASE });
      scene.tweens.add({ targets: [sub], x: on ? 32 : 24, duration: 180, ease: EL.EASE });
      name.setColor(on ? EL.ON : EL.TXT);
      elGlow(name, on);
    };
    const refresh = () => {
      const s = sums[i];
      sub.setText(s ? `${modeName(s.mode)} · ${diffName(s.difficulty)}${s.latest ? ` · Stop ${s.latest.summary.stop}` : ''}` : 'Empty');
      paint();
    };
    zone.on('pointerover', () => ((hover = true), paint()));
    zone.on('pointerout', () => ((hover = false), paint()));
    zone.on('pointerup', () => {
      if (st.slot === i && st.step === 1 && !st.confirm) return;
      st.slot = i;
      st.step = 1;
      st.confirm = null;
      render();
    });
    rows.push({ i, setOn: paint, refresh });
  });

  // --- detay paneli ---
  const panel = scene.add.container(0, 0);
  root.add(panel);
  const PW = W - PANEL_R - PANEL_X;
  const IX = PANEL_X + PAD;
  const IW = PW - PAD * 2;

  const faces = (y: number, s: SaveEntry, size = 58): number => {
    s.summary.classes.forEach((cls, k) => {
      const def = content.classes[cls];
      if (!def) return;
      const ax = IX + size / 2 + k * (size + 18);
      panel.add(classAvatar(scene, def, ax, y + size / 2, size));
      panel.add(classLogoBadge(scene, def, ax - size / 2 + 6, y + size - 6, 11));
      panel.add(hpBar(scene, ax - size / 2, y + size + 8, size, 5, s.summary.hp[k] ?? 1));
      if (s.state.roster.find((h) => h.class === cls)?.leader) panel.add(crown(scene, ax + size / 2 - 6, y + 4, 0.7));
    });
    return y + size + 38;
  };

  const button = (label: string, run: () => void, x: number, y: number, primary = true, w?: number): number => {
    const b = elButton(scene, label, run, { kind: primary ? 'primary' : 'secondary', w, h: primary ? 70 : 58, size: primary ? 23 : 19, ready: true });
    b.root.setPosition(x + b.w / 2, y + b.h / 2);
    panel.add(b.root);
    return b.w;
  };

  /** Panel içi onay kutusu (kırmızımsı ince çerçeve): metin + yes (primary) / Cancel. */
  const confirmBox = (y: number, c: Confirm): number => {
    const text = elBody(scene, IX + 24, y + 20, c.text, 22, EL.NOTE, true, IW - 48);
    const h = text.height + 40 + 90;
    const g = scene.add.graphics();
    g.fillStyle(0x280e0a, 0.55).fillRect(IX, y, IW, h);
    g.lineStyle(1, 0xe8806a, 0.5).strokeRect(IX + 0.5, y + 0.5, IW - 1, h - 1);
    panel.add([g, text]);
    const by = y + text.height + 40;
    const yw = button(c.yes, () => {
      st.confirm = null;
      c.run();
    }, IX + 24, by, true, 220);
    button('Cancel', () => ((st.confirm = null), render()), IX + 24 + yw + 30, by + 6, false, 200);
    return y + h;
  };

  const kicker = (y: number, text: string): number => {
    panel.add(elText(scene, IX, y, text, 15, KICKER, { em: 0.24 }).setOrigin(0, 0));
    return y + 34;
  };

  /** Yuva özeti: büyük durak adı, mod · zorluk, ayrıntı satırı, takım. */
  const slotHeader = (y: number, s: SlotSummary): number => {
    y = kicker(y, `Slot ${st.slot + 1}`);
    const l = s.latest;
    panel.add(fitW(elText(scene, IX, y, l ? l.summary.node : 'Journey started', 36, EL.ON, { em: 0.04, upper: false }).setOrigin(0, 0), IW));
    y += 54;
    panel.add(elText(scene, IX, y, `${modeName(s.mode)} · ${diffName(s.difficulty)}`, 15, s.mode === 'ironman' ? EL.BAD : EL.MUTED, { em: 0.14 }).setOrigin(0, 0));
    y += 30;
    const meta = l ? `${l.summary.map} · Stop ${l.summary.stop} of ${l.summary.stops} · ${l.summary.victories} victories · ${s.saveCount} save${s.saveCount === 1 ? '' : 's'} · ${dateText(s.lastPlayed)}` : `Not saved yet · ${dateText(s.lastPlayed)}`;
    panel.add(elBody(scene, IX, y, meta, 21, EL.MUTED, true, IW).setOrigin(0, 0));
    y += 44;
    if (l) y = faces(y, l);
    return y;
  };

  const optionRow = <T extends string>(y: number, opts: Array<{ id: T; name: string; lines: string[] }>, cur: T, set: (v: T) => void, h: number): number => {
    const gap = 20;
    const bw = (IW - gap * (opts.length - 1)) / opts.length;
    opts.forEach((op, k) => optionCard(scene, panel, IX + k * (bw + gap), y, bw, h, op.name, op.lines, op.id === cur, () => ((set(op.id), render()))));
    return y + h;
  };

  const newPanel = (y: number): number => {
    const s = sums[st.slot] ?? null;
    if (st.step === 2) {
      y = kicker(y, 'Mode');
      y = optionRow(y, MODES, st.mode, (v) => (st.mode = v), 150) + 28;
      y = kicker(y, 'Difficulty');
      y = optionRow(y, DIFFS.map((d) => ({ id: d, name: diffName(d), lines: [CONFIG.difficulties[d].text] })), st.diff, (v) => (st.diff = v), 122) + 18;
      panel.add(elBody(scene, IX, y, `Slot ${st.slot + 1} · Mode and difficulty cannot be changed later.`, 20, EL.MUTED).setOrigin(0, 0));
      y += 50;
      button('Back', () => ((st.step = 1), render()), IX, y + 6, false, 200);
      const begin = elButton(scene, 'Begin the journey', () => o.onStart?.(st.mode, st.diff, st.slot), { kind: 'primary', h: 70, size: 23, ready: true });
      begin.root.setPosition(IX + IW - begin.w / 2, y + 35);
      panel.add(begin.root);
      return y + 70;
    }
    if (!s) {
      y = kicker(y, `Slot ${st.slot + 1}`);
      panel.add(elBody(scene, IX, y, 'An empty slot. A new journey can begin here.', 26, EL.NOTE, true, IW).setOrigin(0, 0));
      y += 66;
      button('Choose', () => ((st.step = 2), render()), IX, y, true, 240);
      return y + 70;
    }
    y = slotHeader(y, s) + 8;
    if (st.confirm) return confirmBox(y, st.confirm);
    const l = s.latest;
    button('Overwrite this slot', () => {
      st.confirm = {
        text: `Slot ${st.slot + 1} holds a journey (${modeName(s.mode)}, ${l ? `stop ${l.summary.stop}, ${l.summary.node}` : 'not saved yet'}) with ${s.saveCount} save${s.saveCount === 1 ? '' : 's'}. Overwriting deletes it for good.`,
        yes: 'Accept',
        run: () => ((st.step = 2), render()),
      };
      render();
    }, IX, y, true);
    return y + 70;
  };

  const loadPanel = (y: number): number => {
    const s = sums[st.slot] ?? null;
    if (!s) {
      y = kicker(y, `Slot ${st.slot + 1}`);
      panel.add(elBody(scene, IX, y, 'This slot is empty.', 26, EL.NOTE).setOrigin(0, 0));
      return y + 50;
    }
    y = slotHeader(y, s) + 4;
    if (st.confirm) return confirmBox(y, st.confirm);
    y = kicker(y, 'Saves');
    const saves = listSaves(storage(), st.slot);
    if (!saves.length) {
      panel.add(elBody(scene, IX, y, 'No saved games in this slot.', 22, EL.MUTED).setOrigin(0, 0));
      y += 46;
    }
    const rowH = saves.length > 4 ? 80 : 92;
    const g = scene.add.graphics();
    panel.add(g);
    saves.forEach((e, k) => {
      const ry = y + k * rowH;
      if (k) g.lineStyle(1, EL.GOLD, EL.LINE.a1).lineBetween(IX, ry, IX + IW, ry);
      panel.add(elText(scene, IX, ry + 14, `${kindName(e.kind)}${k === 0 ? ' · Newest' : ''}`, 13, KICKER, { em: 0.2 }).setOrigin(0, 0));
      panel.add(fitW(elText(scene, IX, ry + 34, `Stop ${e.summary.stop}/${e.summary.stops} · ${e.summary.node}`, 21, EL.TXT, { em: 0.04, upper: false }).setOrigin(0, 0), IW - 400));
      panel.add(elBody(scene, IX, ry + 60, `${e.summary.region} · ${dateText(e.savedAt)}`, 18, EL.MUTED).setOrigin(0, 0));
      const cy = ry + rowH / 2;
      const lb = elButton(scene, 'Load', () => o.onLoad?.(e), { kind: 'primary', w: 160, h: 58, size: 20, ready: true });
      lb.root.setPosition(IX + IW - 150 - 30 - 80, cy);
      const db = elButton(scene, 'Delete', () => {
        st.confirm = {
          text: `Delete the save at stop ${e.summary.stop}, ${e.summary.node}? This cannot be undone.`,
          yes: 'Delete',
          run: () => {
            deleteSave(storage(), st.slot, e.id);
            sums = slotSummaries(storage());
            o.onChanged?.();
            render();
          },
        };
        render();
      }, { kind: 'secondary', w: 130, h: 50, size: 16 });
      db.root.setPosition(IX + IW - 65, cy);
      panel.add([lb.root, db.root]);
    });
    y += saves.length * rowH + 16;
    if (!o.onlySlot) {
      button('Delete slot', () => {
        st.confirm = {
          text: `Delete slot ${st.slot + 1}? The whole journey (${modeName(s.mode)}) and all of its ${s.saveCount} save${s.saveCount === 1 ? '' : 's'} will be lost. This cannot be undone.`,
          yes: 'Delete',
          run: () => {
            deleteSlot(storage(), st.slot);
            sums = slotSummaries(storage());
            o.onChanged?.();
            render();
          },
        };
        render();
      }, IX, y, false, 220);
      y += 58;
    }
    return y;
  };

  const render = () => {
    if (closed) return;
    drawSteps();
    buildRows();
    panel.removeAll(true);
    const y1 = (o.flow === 'new' ? newPanel : loadPanel)(PANEL_Y + PAD - 4);
    const ph = Math.min(H - 40 - PANEL_Y, y1 - PANEL_Y + PAD);
    panel.addAt(elPanel(scene, PANEL_X, PANEL_Y, PW, ph, { corners: true, alpha: 0.95 }), 0);
    panel.setAlpha(0).setY(14);
    scene.tweens.add({ targets: panel, alpha: 1, y: 0, duration: 260, ease: EL.EASE });
  };

  const api: SlotBrowser = {
    root,
    back() {
      if (closed) return;
      if (st.confirm) {
        st.confirm = null;
        return render();
      }
      if (st.step === 2) {
        st.step = 1;
        return render();
      }
      api.close();
      o.onClose();
    },
    close() {
      if (closed) return;
      closed = true;
      root.destroy(true);
    },
  };
  render();
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 220, ease: EL.EASE });
  return api;
}

function latestSlot(sums: Array<SlotSummary | null>): number {
  let best = 0;
  let t = -Infinity;
  sums.forEach((s, i) => {
    const v = s ? Date.parse(s.lastPlayed) : NaN;
    if (s && s.saveCount > 0 && v > t) {
      t = v;
      best = i;
    }
  });
  return best;
}

/** Seçilebilir seçenek kartı (kit): seçili = açık altın 2 px çerçeve + kor elmas + parıltı; sol üst (x, y). */
export function optionCard(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, name: string, lines: string[], on: boolean, pick: () => void): void {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  let hover = false;
  const draw = () => {
    g.clear();
    g.fillStyle(EL.INK, on ? 0.7 : 0.45).fillRect(0, 0, w, h);
    if (on) g.lineStyle(2, EL.ON_N, 1).strokeRect(1, 1, w - 2, h - 2);
    else g.lineStyle(1, EL.GOLD, hover ? 0.9 : EL.LINE.a2).strokeRect(0.5, 0.5, w - 1, h - 1);
  };
  draw();
  c.add(g);
  const dia = elDiamond(scene, 6, !on).setPosition(24, 32);
  const t = elText(scene, 42, 32, name, 22, on ? EL.ON : EL.TXT, { em: 0.08 }).setOrigin(0, 0.5);
  if (on) elGlow(t, true);
  c.add([dia, t]);
  lines.forEach((l, k) => c.add(elBody(scene, 42, 66 + k * 27, l, 20, on ? EL.NOTE : EL.MUTED, true, w - 60).setOrigin(0, 0.5)));
  const z = scene.add.zone(w / 2, h / 2, w, h).setInteractive({ useHandCursor: true });
  z.on('pointerover', () => ((hover = true), draw()));
  z.on('pointerout', () => ((hover = false), draw()));
  z.on('pointerup', pick);
  c.add(z);
  layer.add(c);
}
