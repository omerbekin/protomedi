import Phaser from 'phaser';
import { content } from '../engine';
import { heroById, type CampaignState, type Hero, type NodeType } from '../campaign';
import { SLOT_IDS, fmtPanel, heroPanel, itemDef, itemLines, rarityDef, slotDef, type SlotId } from '../progression';
import { characterTexture } from './assets';
import { classAvatar } from './menu-ui';
import { EL, diamondPts, elBody, elButton, elText, fitW } from './elegant-ui';
import { crown, hpBar, openModal, type Modal } from './campaign-ui';
import { ensureIcon } from './icons';
import { hasMiscImage, miscIconName } from '../ui/misc-icons';

/**
 * Sefer haritası "War table" parçaları (Ömer 2026-10-09, taslak 2): düğüm glifleri, kahraman paneli (seviye / XP, 6 yuva, statlar),
 * dizilim (formation) penceresi. Kurallar src/campaign (moveHero, autoFormation); burası yalnızca çizer ve seçimi iletir.
 */

const W = 1920;

// ------------------------------------------------------------ düğüm glifleri

/**
 * Düğüm türünün boyalı ikonu (assets/misc-icons/node/<tür>.png; harita madalyonu, düğüm kartı, lejant). Görsel yoksa null: çağıran ince
 * çizgili glifi (drawNodeGlyph) çizer. `size` ekrandaki kenar.
 */
export function nodeGlyphImage(scene: Phaser.Scene, type: NodeType, x: number, y: number, size: number): Phaser.GameObjects.Image | null {
  if (!hasMiscImage('node', type)) return null;
  return scene.add.image(x, y, ensureIcon(scene, miscIconName('node', type), '#e8c47e', false)).setDisplaySize(size, size);
}

/** Düğüm türünün ince çizgili glifi (merkez ox, oy; s = ölçek, ~24 px kutu). Boyalı ikon yoksa yedek (nodeGlyphImage). */
export function drawNodeGlyph(g: Phaser.GameObjects.Graphics, type: NodeType, col: number, s: number, ox = 0, oy = 0, alpha = 1): void {
  const P = (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s });
  const L = (x1: number, y1: number, x2: number, y2: number) => g.lineBetween(ox + x1 * s, oy + y1 * s, ox + x2 * s, oy + y2 * s);
  g.lineStyle(Math.max(1.5, 2.4 * s), col, alpha);
  switch (type) {
    case 'battle': // çapraz kılıçlar
      L(-9, -9, 9, 9);
      L(9, -9, -9, 9);
      L(-9, 4, -4, 9);
      L(9, 4, 4, 9);
      break;
    case 'elite': // kafatası
      g.strokeCircle(ox, oy - 2 * s, 8 * s);
      g.fillStyle(col, alpha).fillCircle(ox - 3 * s, oy - 3 * s, 1.8 * s).fillCircle(ox + 3 * s, oy - 3 * s, 1.8 * s);
      L(-4, 6, -4, 10);
      L(0, 6, 0, 10);
      L(4, 6, 4, 10);
      break;
    case 'boss': // taç
      g.strokePoints([P(-10, 7), P(-10, -5), P(-5, 1), P(0, -9), P(5, 1), P(10, -5), P(10, 7)], true);
      g.fillStyle(col, alpha).fillCircle(ox, oy + 3 * s, 1.8 * s);
      break;
    case 'town': // burç
      g.strokePoints([P(-9, 9), P(-9, -3), P(-9, -8), P(-5, -8), P(-5, -4), P(-1, -4), P(-1, -8), P(3, -8), P(3, -4), P(9, -4), P(9, 9)], true);
      g.strokePoints([P(-3, 9), P(-3, 3), P(3, 3), P(3, 9)], false);
      break;
    case 'treasure': // sandık
      g.strokeRect(ox - 10 * s, oy - 2 * s, 20 * s, 10 * s);
      g.strokePoints([P(-10, -2), P(-10, -6), P(-6, -9), P(6, -9), P(10, -6), P(10, -2)], false);
      L(-2, -2, -2, 2);
      L(2, -2, 2, 2);
      break;
    case 'event': // soru işareti (yol ayrımı / karşılaşma)
      g.beginPath();
      g.arc(ox, oy - 4 * s, 6 * s, Math.PI * 1.05, Math.PI * 0.45, false);
      g.strokePath();
      L(2.5, 1.5, 0, 4);
      g.fillStyle(col, alpha).fillCircle(ox, oy + 8.5 * s, 1.8 * s);
      break;
  }
}

/** Yuva glifi (ince çizgi; Phaser kahraman panelinde). */
export function drawSlotGlyph(g: Phaser.GameObjects.Graphics, slot: SlotId, col: number, s: number, ox: number, oy: number): void {
  const P = (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s });
  g.lineStyle(Math.max(1.2, 1.8 * s), col, 1);
  switch (slot) {
    case 'weapon':
      g.strokePoints([P(-10, 10), P(6, -6), P(10, -10), P(8, -4), P(-8, 12)], true);
      g.lineBetween(ox - 6 * s, oy + 4 * s, ox - 2 * s, oy + 8 * s);
      break;
    case 'helm':
      g.beginPath();
      g.arc(ox, oy + 2 * s, 9 * s, Math.PI, 0, false);
      g.strokePath();
      g.strokePoints([P(-9, 2), P(-9, 9), P(-3, 9), P(-3, 3), P(3, 3), P(3, 9), P(9, 9), P(9, 2)], false);
      break;
    case 'armor':
      g.strokePoints([P(-7, -10), P(-3, -8), P(3, -8), P(7, -10), P(11, -5), P(8, -2), P(8, 11), P(-8, 11), P(-8, -2), P(-11, -5)], true);
      break;
    case 'gloves':
      g.strokePoints([P(-6, 11), P(-6, -1), P(-8, -7), P(-5, -8), P(-3, -2), P(-3, -10), P(0, -10), P(0, -2), P(1, -11), P(4, -11), P(3, -2), P(5, -7), P(8, -6), P(6, 2), P(6, 11)], true);
      break;
    case 'boots':
      g.strokePoints([P(-6, -11), P(1, -11), P(1, 3), P(10, 6), P(10, 11), P(-8, 11), P(-8, 5)], true);
      break;
    case 'trinket':
      g.strokeCircle(ox, oy + 3 * s, 7 * s);
      g.strokePoints([P(-4, -10), P(0, -4), P(4, -10)], false);
      break;
  }
}

// ------------------------------------------------------------ kahraman paneli

export interface HeroPanelHooks {
  get: () => CampaignState;
  gear: (heroId: string) => void;
  formation: () => void;
  close: () => void;
}

/**
 * Kahraman paneli (War table taslağı): ad, sınıf · primary, seviye + XP çubuğu, ortada karakter, iki yanda 6 ekipman yuvası (nadirlik rengi),
 * altta savaşa gireceği statlar (temel + item'ler: progression > heroPanel), pasif. Yuva ya da "Gear" = Gear ekranı (bu kahramanla).
 */
export function openHeroPanel(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, heroId: string, on: HeroPanelHooks): Modal | null {
  const hero = heroById(on.get(), heroId);
  const def = hero ? content.classes[hero.class] : undefined;
  if (!hero || !def) return null;
  const m = openModal(scene, layer, {
    title: def.name,
    subtitle: `${def.role ?? ''}${def.primary ? ` · ${def.primary.toUpperCase()}` : ''}${hero.leader ? ' · Leader of the company' : ''}`,
    width: 1180,
    height: 880,
    y: 100,
    buttons: [
      { label: 'Formation', run: () => on.formation() },
      { label: 'Gear', run: () => on.gear(heroId) },
      { label: 'Close', primary: true, run: () => on.close() },
    ],
    onDismiss: () => on.close(),
  });
  const a = m.area;
  const cx = W / 2;
  // Seviye + XP (level sistemi Aşama 2'de; şimdilik kayıttaki değer)
  const lvl = elText(scene, cx - 160, a.y + 10, `Level ${hero.level}`, 20, EL.TXT, { em: 0.1, upper: false }).setOrigin(0, 0.5);
  const xp = elBody(scene, cx + 160, a.y + 10, `${hero.xp} XP`, 18, EL.MUTED).setOrigin(1, 0.5);
  const bar = scene.add.graphics();
  bar.fillStyle(EL.INK, 0.85).fillRect(cx - 160, a.y + 30, 320, 5);
  bar.fillGradientStyle(EL.EMBER, 0xffd76a, EL.EMBER, 0xffd76a, 0.9).fillRect(cx - 160, a.y + 30, Math.max(2, 320 * Math.min(1, hero.xp / 100)), 5);
  m.root.add([lvl, xp, bar]);
  // Karakter + can
  const figY = a.y + 330;
  const glow = scene.add.graphics();
  glow.fillStyle(EL.EMBER, 0.12).fillEllipse(cx, figY + 4, 220, 34);
  m.root.add(glow);
  const tex = characterTexture(scene, def.spriteId, def.color);
  const fig = scene.add.image(cx, figY, tex.key, tex.real && scene.textures.get(tex.key).has('0') ? '0' : undefined).setOrigin(0.5, 1);
  fig.setScale(Math.min(270 / fig.height, 230 / fig.width));
  m.root.add(fig);
  m.root.add(hpBar(scene, cx - 90, figY + 28, 180, 7, hero.hpRatio));
  m.root.add(elBody(scene, cx, figY + 52, `${Math.round(hero.hpRatio * 100)}% health`, 17, EL.MUTED).setOrigin(0.5));
  // 6 yuva: sol 3, sağ 3
  const sw = 330;
  const sh = 72;
  SLOT_IDS.forEach((slot, k) => {
    const left = k < 3;
    const x = left ? cx - 190 - sw : cx + 190;
    const y = a.y + 70 + (k % 3) * (sh + 16);
    m.root.add(slotRow(scene, hero, slot, x, y, sw, sh, left, () => on.gear(heroId)));
  });
  // Statlar (4 sütun)
  const stats = heroPanel(hero);
  const top = a.y + 450;
  const line = scene.add.graphics();
  line.lineStyle(1, EL.GOLD, EL.LINE.a1).lineBetween(a.x + 60, top - 14, a.x + a.w - 60, top - 14);
  m.root.add(line);
  const colW = (a.w - 120) / 4;
  stats.forEach((p, i) => {
    const x = a.x + 60 + (i % 4) * colW;
    const y = top + Math.floor(i / 4) * 38;
    const pri = def.primary && p.id === def.primary;
    m.root.add(elText(scene, x, y, p.label, 13, pri ? '#e9c062' : EL.MUTED, { em: 0.14 }).setOrigin(0, 0.5));
    m.root.add(elText(scene, x + colW - 30, y, fmtPanel(p), 19, pri ? EL.PRI : EL.TXT, { em: 0.02 }).setOrigin(1, 0.5));
    const u = scene.add.graphics();
    u.lineStyle(1, EL.GOLD, EL.LINE.a1).lineBetween(x, y + 17, x + colW - 30, y + 17);
    m.root.add(u);
  });
  const rows = Math.ceil(stats.length / 4);
  if (def.passive) {
    const py = top + rows * 38 + 18;
    const t = elBody(scene, cx, py, `${def.passive.name}: ${def.passive.text ?? ''}`, 19, EL.NOTE, true, a.w - 160).setOrigin(0.5, 0).setAlign('center');
    m.root.add(t);
  }
  return m;
}

function slotRow(scene: Phaser.Scene, hero: Hero, slot: SlotId, x: number, y: number, w: number, h: number, left: boolean, run: () => void): Phaser.GameObjects.Container {
  const inst = hero.equipment[slot];
  const d = inst ? itemDef(inst.id) : undefined;
  const col = d ? rarityDef(d.rarity).color : EL.DIM;
  const colN = Phaser.Display.Color.HexStringToColor(col).color;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  let hover = false;
  const draw = () => {
    g.clear();
    g.fillStyle(EL.INK, 0.55).fillRect(0, 0, w, h);
    g.lineStyle(1, hover ? EL.ON_N : d ? colN : EL.GOLD, hover ? 1 : d ? 0.7 : EL.LINE.a2).strokeRect(0.5, 0.5, w - 1, h - 1);
  };
  draw();
  const icX = left ? 36 : w - 36;
  const ic = scene.add.graphics();
  ic.lineStyle(1, EL.GOLD, EL.LINE.a2).strokeRect(icX - 25, h / 2 - 25, 50, 50);
  drawSlotGlyph(ic, slot, d ? colN : 0x7d705a, 1, icX, h / 2);
  const tx = left ? 72 : w - 72;
  const name = fitW(elText(scene, tx, h / 2 - 11, d ? d.name : slotDef(slot).name, 15, d ? col : EL.DIM, { em: 0.05 }).setOrigin(left ? 0 : 1, 0.5), w - 90);
  const sub = fitW(elBody(scene, tx, h / 2 + 13, d ? itemLines(d).join(' · ') : 'Empty slot', 15, EL.MUTED).setOrigin(left ? 0 : 1, 0.5), w - 90);
  const zone = scene.add.zone(w / 2, h / 2, w, h).setInteractive({ useHandCursor: true });
  zone.on('pointerover', () => {
    hover = true;
    draw();
  });
  zone.on('pointerout', () => {
    hover = false;
    draw();
  });
  zone.on('pointerup', run);
  c.add([g, ic, name, sub, zone]);
  return c;
}

// ------------------------------------------------------------ dizilim (formation)

/**
 * Pencerenin okuduğu dizilim (genel bağdaştırıcı; Endless koşu başı dizilimi 2026-10-10'dan beri takım seçimi ekranında, bu pencerede değil). CampaignState buna
 * doğrudan uyar: `active` = hücre -> kahraman id ('' boş), `roster` = kahramanlar (yalnızca `active`tekiler çizilir).
 */
export interface FormationState {
  active: readonly string[];
  roster: ReadonlyArray<{ id: string; class: string; hpRatio: number; leader?: boolean }>;
}

const rosterHero = (s: FormationState, id: string) => (id ? s.roster.find((h) => h.id === id) : undefined);

export interface FormationHooks {
  get: () => FormationState;
  move: (heroId: string, cell: number) => void;
  auto: () => void;
  done: () => void;
  /** Arayüz kamerasında işaretçinin dünya noktası (pencere arayüz katmanında). */
  toUi: (p: Phaser.Input.Pointer) => { x: number; y: number };
  heroPanel?: (heroId: string) => void;
  /** Bitir düğmesinin yazısı (varsayılan 'Done'; Endless: 'Start Run'). */
  doneLabel?: string;
  /** Verilirse solda 'Back' düğmesi olur ve zemine dokunmak / pencereyi kapatmak bunu çağırır (Done yerine). Sefer vermez. */
  back?: () => void;
  /** Alt başlık (varsayılan seferin açıklaması). */
  subtitle?: string;
}

/**
 * Dizilim penceresi: 4 sıra x 3 şerit (ön sıra sağda, düşmana bakar). Bir kahramanı başka hücreye SÜRÜKLE ya da önce kahramana sonra
 * hücreye DOKUN: boşsa taşır, doluysa yer değiştirir (src/campaign > moveHero). Sağda seçilen kahramanın notu (yakın dövüş ön sıra ister).
 */
export function openFormation(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, on: FormationHooks): Modal {
  const m = openModal(scene, layer, {
    title: 'Formation',
    subtitle: on.subtitle ?? 'Drag a hero onto another cell, or tap a hero and then a cell. The front row faces the enemy.',
    width: 1360,
    height: 820,
    y: 120,
    buttons: [
      ...(on.back ? [{ label: 'Back', run: () => on.back?.() }] : []),
      { label: 'Auto arrange', run: () => (on.auto(), draw()) },
      { label: on.doneLabel ?? 'Done', primary: true, run: () => on.done() },
    ],
    onDismiss: () => (on.back ? on.back() : on.done()),
  });
  const cell = 128;
  const gap = 10;
  const gw = 4 * cell + 3 * gap;
  const gx = W / 2 - 360 - gw / 2 + 160; // ızgara solda, bilgi sağda
  const gy = m.area.y + 40;
  const layerC = scene.add.container(0, 0);
  m.root.add(layerC);
  let selected = '';
  let drag: { id: string; from: number; sx: number; sy: number; moved: boolean; ghost?: Phaser.GameObjects.Container } | null = null;
  const cellAt = (x: number, y: number): number => {
    for (let row = 0; row < 4; row++)
      for (let lane = 0; lane < 3; lane++) {
        const cx = gx + (3 - row) * (cell + gap);
        const cy = gy + lane * (cell + gap);
        if (x >= cx && x <= cx + cell && y >= cy && y <= cy + cell) return row * 3 + lane;
      }
    return -1;
  };
  let hot = -1;
  const draw = () => {
    layerC.removeAll(true);
    const s = on.get();
    // FRONT / BACK etiketleri + düşman yönü
    layerC.add(elText(scene, gx + gw + 26, gy + (3 * cell + 2 * gap) / 2, 'Front ▸', 16, EL.ON, { em: 0.2 }).setOrigin(0, 0.5));
    layerC.add(elText(scene, gx - 22, gy + (3 * cell + 2 * gap) / 2, 'Back', 14, EL.MUTED, { em: 0.2 }).setOrigin(1, 0.5));
    for (let row = 0; row < 4; row++)
      for (let lane = 0; lane < 3; lane++) {
        const slot = row * 3 + lane;
        const x = gx + (3 - row) * (cell + gap);
        const y = gy + lane * (cell + gap);
        const id = s.active[slot] ?? '';
        const h = rosterHero(s, id);
        const g = scene.add.graphics();
        const isSel = !!selected && id === selected;
        g.fillStyle(EL.INK, h ? 0.75 : 0.38).fillRect(x, y, cell, cell);
        if (slot === hot) {
          g.lineStyle(2, EL.EMBER, 1).strokeRect(x + 1, y + 1, cell - 2, cell - 2);
          g.fillStyle(EL.EMBER, 0.12).fillRect(x, y, cell, cell);
        } else if (isSel) g.lineStyle(2, EL.ON_N, 1).strokeRect(x + 1, y + 1, cell - 2, cell - 2);
        else g.lineStyle(1, EL.GOLD, h ? 0.62 : row === 0 ? 0.42 : EL.LINE.a2).strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        if (!h) g.lineStyle(1, EL.GOLD, 0.22).strokePoints(diamondPts(x + cell / 2, y + cell / 2, 6.4), true);
        layerC.add(g);
        if (h) {
          const def = content.classes[h.class]!;
          const img = classAvatar(scene, def, x + cell / 2, y + cell / 2 - 6, cell - 18);
          if (drag?.moved && drag.id === id) img.setAlpha(0.3);
          layerC.add(img);
          const nm = scene.add.graphics();
          nm.fillGradientStyle(0x080604, 0x080604, 0x080604, 0x080604, 0, 0, 0.92, 0.92).fillRect(x + 1, y + cell - 42, cell - 2, 41);
          layerC.add(nm);
          layerC.add(fitW(elText(scene, x + cell / 2, y + cell - 22, def.name, 13, EL.ON, { em: 0.06 }).setOrigin(0.5), cell - 10));
          layerC.add(hpBar(scene, x + 14, y + cell - 9, cell - 28, 4, h.hpRatio));
          if (h.leader) layerC.add(crown(scene, x + cell - 18, y + 16, 0.62));
        }
        const z = scene.add.zone(x + cell / 2, y + cell / 2, cell, cell).setInteractive({ useHandCursor: !!h || !!selected });
        z.on('pointerdown', (p: Phaser.Input.Pointer) => {
          if (!h) return;
          const q = on.toUi(p);
          drag = { id, from: slot, sx: q.x, sy: q.y, moved: false };
        });
        z.on('pointerup', () => {
          if (drag?.moved) return;
          drag = null;
          if (!selected) selected = id;
          else if (selected === id) selected = '';
          else {
            on.move(selected, slot);
            selected = '';
          }
          draw();
        });
        layerC.add(z);
      }
    // Bilgi (sağ): seçilen ya da lider kahraman
    const team = s.roster.filter((x) => s.active.includes(x.id));
    const focus = rosterHero(s, selected) ?? team.find((x) => x.leader) ?? team[0];
    const ix = gx + gw + 190;
    const iy = gy;
    const iw = W / 2 + 640 - 30 - ix;
    if (focus) {
      const def = content.classes[focus.class]!;
      const slot = s.active.indexOf(focus.id);
      const row = Math.floor(slot / 3);
      const melee = content.isMeleeClass(focus.class);
      layerC.add(elText(scene, ix, iy, selected ? 'Selected' : 'Your company', 14, EL.MUTED, { em: 0.24 }).setOrigin(0, 0));
      const ln = scene.add.graphics();
      ln.lineStyle(1, EL.GOLD, EL.LINE.a1).lineBetween(ix, iy + 28, ix + iw, iy + 28);
      layerC.add(ln);
      layerC.add(classAvatar(scene, def, ix + 48, iy + 92, 92));
      layerC.add(fitW(elText(scene, ix + 112, iy + 70, def.name, 26, EL.ON, { em: 0.05 }).setOrigin(0, 0.5), iw - 120));
      layerC.add(elBody(scene, ix + 112, iy + 104, `${def.role ?? ''} · ${['Front row', '2nd row', '3rd row', 'Back row'][row] ?? ''}`, 18, EL.MUTED).setOrigin(0, 0.5));
      const note = melee
        ? row === 0
          ? 'Melee: in the front row, ready to strike.'
          : 'Melee heroes can only hit from the front row. Move them forward.'
        : 'Ranged and spells reach any row: the back keeps them safe.';
      layerC.add(elBody(scene, ix, iy + 160, note, 20, melee && row !== 0 ? EL.BAD : EL.NOTE, true, iw).setOrigin(0, 0));
      if (on.heroPanel) {
        const b = elButton(scene, 'Hero details', () => on.heroPanel?.(focus.id), { kind: 'secondary', w: 260, h: 54, size: 17 });
        b.root.setPosition(ix + 130, iy + 290);
        layerC.add(b.root);
      }
    }
  };
  // Sürükleme (sahne geneli; pencere kapanınca kaldırılır)
  const onMove = (p: Phaser.Input.Pointer) => {
    if (!drag || !p.isDown) return;
    const q = on.toUi(p);
    if (!drag.moved && Math.hypot(q.x - drag.sx, q.y - drag.sy) > 10) {
      drag.moved = true;
      const h = rosterHero(on.get(), drag.id);
      const def = h ? content.classes[h.class] : undefined;
      if (def) {
        const gg = scene.add.graphics();
        gg.fillStyle(0x120c08, 1).fillRect(-56, -56, 112, 112).lineStyle(2, EL.ON_N, 1).strokeRect(-56, -56, 112, 112);
        drag.ghost = scene.add.container(q.x, q.y, [gg, classAvatar(scene, def, 0, 0, 104)]);
        m.root.add(drag.ghost);
      }
      draw();
    }
    if (!drag.moved) return;
    drag.ghost?.setPosition(q.x, q.y);
    const c = cellAt(q.x, q.y);
    if (c !== hot) {
      hot = c;
      draw();
      if (drag.ghost) m.root.bringToTop(drag.ghost);
    }
  };
  const onUp = (p: Phaser.Input.Pointer) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ghost?.destroy();
    hot = -1;
    if (d.moved) {
      const q = on.toUi(p);
      const c = cellAt(q.x, q.y);
      if (c >= 0 && c !== d.from) on.move(d.id, c);
      selected = '';
      draw();
    }
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);
  const close0 = m.close;
  m.close = () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('pointerupoutside', onUp);
    close0();
  };
  draw();
  return m;
}
