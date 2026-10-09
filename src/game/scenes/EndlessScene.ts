import Phaser from 'phaser';
import layout from '../../../data/battle-layout.json';
import { content } from '../../engine';
import type { CombatantDef } from '../../engine/types';
import {
  ENDLESS,
  UI_TEXT as T,
  buyItem,
  chooseRelic,
  relicDef,
  cardText,
  cardTitle,
  chooseReward,
  className,
  endlessBack,
  endlessView,
  gearScore,
  heroOf,
  itemKindLine,
  itemStatLines,
  leaveShop,
  rarityColor,
  replacedItem,
  resumeLabel,
  suspendedOf,
  togglePick,
  waveKind,
  wavePlan,
  type EndlessHero,
  type EndlessRun,
  type EndlessView,
  type RewardCard,
  type ScoreEntry,
} from '../../endless';
import { ITEMS, SLOT_IDS, itemDef, itemValue, primaryBonusLost, slotDef, type ItemDef } from '../../progression';
import { backgroundKey, hasBackground, preloadAssets } from '../assets';
import { classAvatar, fitText } from '../menu-ui';
import { EL, elBody, elButton, elConfirm, elConfirmOpen, elHeading, elIconButton, elLink, elPanel, elText, elTip, placeElTip, type ElButton } from '../elegant-ui';
import { ensureIcon } from '../icons';
import { onStageResize, stageView } from '../stage';
import { FULL_W, FULL_X0 } from '../../ui/viewport';
import { menuFontsReady, whenMenuFontsReady } from '../../ui/menu-fonts';
import { groupColor, sortByPrimary } from '../class-order';
import { ENDLESS_SCENE, abandon, commit, continueRun, endless, savedRun, scores, startRun, startWave } from '../endless-session';

export interface EndlessSceneData {
  /** 'title': başlık ekranıyla aç (ana menü / debug); 'pick': doğrudan takım seçimi. Yoksa bellekteki koşunun aşaması. */
  view?: 'title' | 'pick';
}

const W = layout.width;
const H = layout.height;
const CX = W / 2;
const PRIMARY_COLORS = layout.colors.primaryGroup as Record<string, string>;

/** Görünüm sabitleri (yeniden tasarımda yalnızca burası ve çizim yardımcıları değişir). Yazılar: src/endless/ui-text.ts. */
const LOOK = {
  bg: 'proving-grounds-sunset',
  shade: 0.72,
  color: { text: '#d9c8a2', dim: '#9c8a68', warn: '#e0806a', accent: '#e8c47e', bright: '#f3d999', sub: '#cdb88d', stat: '#f0e2bf', empty: '#5d5040' },
  headingY: 118,
  subY: 204,
  buttonY: 920,
  card: { top: 290, h: 560, maxW: 440, gap: 40 },
} as const;
const C = LOOK.color;

/**
 * Endless Lite ekranı (roadmap.md bölüm 3; open-questions madde 281). Görünümler: başlık (Continue / Resume / New Run / en iyi koşular), takım seçimi,
 * kamp (sıradaki dalga ya da yarım kalan savaşa devam), ödül kartları, dükkân, koşu sonu. Kurallar src/endless/ (saf), oturum
 * src/game/endless-session.ts, yazılar src/endless/ui-text.ts. Yapı: her görünüm `draw<Görünüm>()` içinde baştan çizilir; oyuncu eylemleri
 * `act*` yöntemlerinde (ekran düzeninden bağımsız); çizim yardımcıları (heading, note, label, button, panel, avatar, hpBar) ortak.
 */
export class EndlessScene extends Phaser.Scene {
  static readonly KEY = ENDLESS_SCENE;
  private view: EndlessView = 'title';
  private requested: EndlessSceneData['view'];
  private root!: Phaser.GameObjects.Container;
  private backBtn: Phaser.GameObjects.Container | null = null;
  private bg: Phaser.GameObjects.Image | null = null;
  private picked: string[] = [];
  private hoverClass: string | null = null;
  private confirm: { close(): void } | null = null;
  private pending = false;
  /** Takım seçiminde üstüne gelinen class'ın bilgi satırı. */
  private infoText: Phaser.GameObjects.Text | null = null;
  /** Açık tooltip (kalıntı ikonu). */
  private tip: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(ENDLESS_SCENE);
  }

  init(data: EndlessSceneData): void {
    this.requested = data?.view;
    this.picked = [];
    this.hoverClass = null;
    this.confirm = null;
    this.backBtn = null;
    this.bg = null;
    this.pending = false;
    this.infoText = null;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0a07');
    // Phaser yazıları çizildiği andaki fontla kalır: menü fontları hazır değilse bekle ve yeniden kur (ana menüyle aynı)
    if (!menuFontsReady()) {
      void whenMenuFontsReady().then(() => {
        if (this.sys.isActive()) this.scene.restart({ view: this.requested });
      });
      return;
    }
    if (hasBackground(this, LOOK.bg)) this.bg = this.add.image(CX, H / 2, backgroundKey(LOOK.bg)).setDepth(0);
    this.add.rectangle(FULL_X0, 0, FULL_W, H, 0x080604, LOOK.shade).setOrigin(0, 0).setDepth(1);
    this.root = this.add.container(0, 0).setDepth(10);
    // Bellekte koşu yoksa kayıtlıyı yükle (sayfa yenilendi / ana menüden geldi); bitmiş koşu bellekte yalnızca skor ekranı için durur
    if (!endless.run) continueRun();
    this.view = endlessView(endless.run, this.requested);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    onStageResize(this, () => this.layoutStage());
    this.renderNow();
  }

  // ============================================================ oyuncu eylemleri (düzenden bağımsız)

  private actStartPick(): void {
    this.picked = [];
    this.go('pick');
  }

  private actContinue(): void {
    continueRun();
    this.go(endlessView(endless.run));
  }

  /** Yarım kalan savaşa dön (kayıttaki tura). */
  private actResume(): void {
    if (!endless.run) continueRun();
    startWave(this, true);
  }

  private actFight(): void {
    startWave(this);
  }

  /** Yeni koşu: mevcut koşu (ve yarım savaşı) biter, skoru yazılır; onay ister. */
  private actNewRun(): void {
    const run = savedRun();
    if (!run) return this.actStartPick();
    this.ask(suspendedOf(run) ? T.confirmNewRunSuspended : T.confirmNewRun, () => {
      if (!endless.run) continueRun();
      abandon();
      endless.run = null;
      this.actStartPick();
    });
  }

  private actAbandon(): void {
    this.ask(T.confirmAbandon, () => {
      abandon();
      this.go('over');
    });
  }

  private actRandomize(): void {
    const pool = [...content.randomPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    this.picked = pool.slice(0, ENDLESS.partySize);
    this.render();
  }

  private actTogglePick(id: string): void {
    this.picked = togglePick(this.picked, id, ENDLESS.partySize);
    this.render();
  }

  private actBeginRun(): void {
    startRun(this.picked);
    this.go('camp');
  }

  private actTakeReward(run: EndlessRun, index: number): void {
    const next = chooseReward(run, index);
    if (next === run) return;
    commit(next);
    this.go(endlessView(next));
  }

  private actChooseRelic(run: EndlessRun, id: string): void {
    const next = chooseRelic(run, id);
    if (next === run) return;
    commit(next);
    this.go(endlessView(next));
  }

  private actBuy(run: EndlessRun, index: number): void {
    const next = buyItem(run, index);
    if (next === run) return;
    commit(next);
    this.render();
  }

  private actLeaveShop(run: EndlessRun): void {
    const next = leaveShop(run);
    commit(next);
    this.go(endlessView(next));
  }

  private actMainMenu(): void {
    if (endless.run?.phase === 'over') endless.run = null;
    this.scene.start('MainMenuScene');
  }

  private back(): void {
    if (this.confirm) return this.closeConfirm();
    const to = endlessBack(this.view);
    if (to === 'menu') this.actMainMenu();
    else if (to === 'title') {
      if (endless.run?.phase === 'over') endless.run = null;
      this.go('title');
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && !elConfirmOpen(this)) this.back();
  }

  // ============================================================ görünüm döngüsü

  private layoutStage(): void {
    if (this.bg) {
      const k = Math.max(stageView.viewW / this.bg.width, H / this.bg.height);
      this.bg.setScale(k).setPosition(CX, H / 2);
    }
    this.backBtn?.setX(stageView.left + 48);
  }

  private go(view: EndlessView): void {
    this.view = view;
    this.render();
  }

  /** Görünümü yeniden çizer. Dokunma olayının içinden çağrıldığında olayı veren nesne yok edilmesin diye bir sonraki kareye ertelenir. */
  private render(): void {
    if (this.pending) return;
    this.pending = true;
    this.time.delayedCall(0, () => {
      this.pending = false;
      if (this.sys.isActive()) this.renderNow();
    });
  }

  private renderNow(): void {
    this.infoText = null;
    this.hideTip();
    this.closeConfirm();
    this.root.removeAll(true);
    this.backBtn?.destroy();
    this.backBtn = null;
    const draw: Record<EndlessView, () => void> = {
      title: () => this.drawTitle(),
      pick: () => this.drawPick(),
      camp: () => this.drawCamp(),
      relic: () => this.drawRelic(),
      reward: () => this.drawReward(),
      shop: () => this.drawShop(),
      over: () => this.drawOver(),
    };
    draw[this.view]();
    if (endlessBack(this.view)) this.drawBack();
    this.layoutStage();
  }

  // ============================================================ görünümler

  private drawTitle(): void {
    this.heading(T.title, T.titleSub);
    const saved = savedRun();
    const susp = suspendedOf(saved);
    const bx = CX - 380;
    let y = 400;
    if (saved) {
      if (susp) this.button(bx, y, 460, resumeLabel(susp.wave, susp.turn), () => this.actResume(), { primary: true });
      else this.button(bx, y, 460, T.continueRun(saved.wave), () => this.actContinue(), { primary: true });
      this.add2(this.note(bx, y + 52, saved.heroes.map((h) => className(h.class)).join(' · '), 20, C.dim).setOrigin(0.5, 0));
      y += 140;
    }
    this.button(bx, y, 460, saved ? T.newRun : T.startRun, () => (saved ? this.actNewRun() : this.actStartPick()), { primary: !saved });
    y += 110;
    this.button(bx, y, 460, T.mainMenu, () => this.actMainMenu());
    this.panel(CX - 60, 300, 720, 600, 0.8);
    this.scoreList(CX - 20, 330, 640, scores());
    this.add2(this.note(CX + 300, 960, T.rules, 22, C.dim, true).setOrigin(0.5));
  }

  private drawPick(): void {
    const size = ENDLESS.partySize;
    this.heading(T.pickTitle, T.pickSub(size));
    // Seçilen yuvalar
    for (let i = 0; i < size; i++) {
      const x = CX + (i - (size - 1) / 2) * 190;
      const y = 340;
      const id = this.picked[i];
      const g = this.add2(this.add.graphics());
      // Kit: ince çerçeve; boş yuvada ortada içi boş elmas
      g.fillStyle(EL.INK, 0.38).fillRect(x - 75, y - 75, 150, 150);
      g.lineStyle(1, EL.GOLD, id ? 0.62 : EL.LINE.a2).strokeRect(x - 74.5, y - 74.5, 149, 149);
      if (!id) {
        g.lineStyle(1, EL.GOLD, 0.35).strokePoints([{ x, y: y - 7 }, { x: x + 7, y }, { x, y: y + 7 }, { x: x - 7, y }], true);
        continue;
      }
      this.avatar(content.classes[id]!, x, y, 124);
      this.add2(this.label(x, y + 94, className(id).toUpperCase(), 22).setOrigin(0.5, 0));
      this.tapZone(x, y, 150, 150, () => this.actTogglePick(id));
    }
    // Raf: rastgele havuz (test class'ları yok), primary grubuna göre
    const defs = sortByPrimary(content.randomPool.map((id) => content.classes[id]!).filter(Boolean));
    const step = Math.min(150, 1700 / Math.max(1, defs.length));
    defs.forEach((def, i) => {
      const x = CX + (i - (defs.length - 1) / 2) * step;
      const y = 640;
      const on = this.picked.includes(def.id);
      this.avatar(def, x, y, step - 26);
      if (on) this.add2(this.add.rectangle(x, y, step - 14, step - 14).setStrokeStyle(2, EL.ON_N, 1));
      this.add2(fitText(this.label(x, y + step / 2 + 8, def.name.toUpperCase(), 15, on ? C.bright : C.text).setOrigin(0.5, 0), step - 4));
      this.add2(this.add.rectangle(x, y + step / 2 + 40, 34, 3, Phaser.Display.Color.HexStringToColor(groupColor(PRIMARY_COLORS, def.primary)).color, 1));
      const z = this.tapZone(x, y + 20, step - 6, step + 50, () => this.actTogglePick(def.id));
      z.on('pointerover', () => {
        this.hoverClass = def.id;
        this.infoText?.setText(this.classInfo(def.id));
      });
    });
    this.infoText = this.add2(this.note(CX, 800, this.classInfo(this.hoverClass), 26, C.sub).setOrigin(0.5));
    this.button(CX - 230, LOOK.buttonY, 300, T.randomize, () => this.actRandomize());
    this.button(CX + 230, LOOK.buttonY, 340, T.startRunButton, () => this.actBeginRun(), { primary: true, enabled: this.picked.length === size });
  }

  private classInfo(id: string | null): string {
    const def = id ? content.classes[id] : undefined;
    if (!def) return T.pickHint;
    return T.classInfo(def.name, def.primary ?? '', (def as unknown as { passive?: { name?: string } }).passive?.name);
  }

  private drawCamp(): void {
    const run = endless.run;
    if (!run) return this.go('title');
    const plan = wavePlan(run);
    const kind = waveKind(run.wave);
    const susp = suspendedOf(run);
    this.heading(T.campTitle(run.wave), kind === 'normal' ? T.campFoes(plan.enemyNames) : T.campSpecial(kind === 'boss', plan.name));
    this.add2(this.note(CX, 246, T.campStats(run.gold, gearScore(run), run.stats.cleared), 24, C.accent).setOrigin(0.5));
    if (run.blessing) this.add2(this.note(CX, 280, T.campBlessing(run.blessing.hpMult, run.blessing.waves), 22, C.bright, true).setOrigin(0.5));
    run.heroes.forEach((h, i) => this.heroPanel(h, CX + (i - (run.heroes.length - 1) / 2) * 420, 310));
    this.relicRow(run.relics ?? [], CX, 852);
    if (endless.notice) {
      this.add2(this.note(CX, 806, endless.notice, 22, C.accent, true).setOrigin(0.5));
      endless.notice = '';
    }
    this.button(CX - 420, LOOK.buttonY, 320, T.abandonRun, () => this.actAbandon());
    // Yarım kalan savaş varsa yalnızca ona dönülür (aynı dalgayı baştan başlatmak yok: yeniden deneme hilesi olmasın)
    if (susp) this.button(CX + 300, LOOK.buttonY, 520, resumeLabel(susp.wave, susp.turn), () => this.actResume(), { primary: true });
    else this.button(CX + 300, LOOK.buttonY, 420, kind === 'boss' ? T.faceBoss : T.fightWave(run.wave), () => this.actFight(), { primary: true });
  }

  /** Sahip olunan kalıntılar: ikon sırası (kit ikon düğmesi), üstüne gelince / dokununca ad + etki tooltip'i. */
  private relicRow(ids: string[], cx: number, y: number): void {
    const defs = ids.map((id) => relicDef(id)).filter((d): d is NonNullable<typeof d> => !!d);
    if (!defs.length) return;
    const size = 44;
    const step = 56;
    const x0 = cx - ((defs.length - 1) * step) / 2;
    this.add2(this.label(x0 - size, y, T.relicsOwned, 18, C.dim).setOrigin(1, 0.5));
    defs.forEach((d, i) => {
      const x = x0 + i * step;
      const show = (on: boolean) => (on ? this.showRelicTip(d.id, x, y, size) : this.hideTip());
      const b = elIconButton(this, { icon: ensureIcon(this, d.icon, d.color, false) }, () => show(true), { size, onHover: show });
      b.root.setPosition(x, y);
      this.add2(b.root);
    });
  }

  private showRelicTip(id: string, x: number, y: number, size: number): void {
    const d = relicDef(id);
    if (!d) return;
    this.hideTip();
    const tip = elTip(this, { icon: ensureIcon(this, d.icon, d.color, false), title: d.name, meta: T.relicEffectLabel, lines: [[d.text]], width: 420 });
    placeElTip(this, tip, { x: x - size / 2, y: y - size / 2, w: size, h: size }, 'above');
    this.tip = tip.container;
  }

  private hideTip(): void {
    this.tip?.destroy();
    this.tip = null;
  }

  /** Boss sonrası kalıntı seçimi: teklif edilen kalıntılar kart olarak; biri alınır. */
  private drawRelic(): void {
    const run = endless.run;
    if (!run?.relicOffer?.length) return this.go(endlessView(run));
    this.heading(T.relicTitle, T.relicSub);
    const n = run.relicOffer.length;
    const w = 420;
    const gap = 60;
    run.relicOffer.forEach((id, i) => {
      const d = relicDef(id);
      if (!d) return;
      const cx = CX + (i - (n - 1) / 2) * (w + gap);
      const top = 300;
      const h = 500;
      this.panel(cx - w / 2, top, w, h, 0.9);
      this.add2(this.add.image(cx, top + 110, ensureIcon(this, d.icon, d.color, false)).setDisplaySize(112, 112));
      this.add2(fitText(this.label(cx, top + 190, d.name.toUpperCase(), 28).setOrigin(0.5, 0), w - 40));
      this.add2(this.note(cx, top + 250, d.text, 24, C.text).setOrigin(0.5, 0).setWordWrapWidth(w - 60).setAlign('center'));
      this.button(cx, top + h - 58, 220, T.relicTake, () => this.actChooseRelic(run, id), { primary: true, h: 68 });
    });
    if (run.relics?.length) this.relicRow(run.relics, CX, 900);
  }

  private heroPanel(h: EndlessHero, cx: number, top: number): void {
    const def = content.classes[h.class];
    if (!def) return;
    const w = 390;
    this.panel(cx - w / 2, top, w, 480, 0.85);
    this.avatar(def, cx, top + 78, 108);
    this.add2(this.label(cx, top + 142, def.name.toUpperCase(), 26).setOrigin(0.5, 0));
    this.hpBar(cx - 140, top + 186, 280, 16, h.hpRatio);
    this.add2(this.note(cx, top + 206, T.heroHealth(h.hpRatio), 20, C.dim).setOrigin(0.5, 0));
    SLOT_IDS.forEach((slot, k) => {
      const y = top + 250 + k * 36;
      const inst = h.equipment[slot];
      const d = inst ? itemDef(inst.id) : undefined;
      this.add2(this.note(cx - w / 2 + 26, y, slotDef(slot).name, 20, C.dim));
      this.add2(fitText(this.note(cx - w / 2 + 120, y, d ? d.name : T.emptySlot, 20, d ? rarityColor(d) : C.empty), w - 150));
    });
  }

  private drawReward(): void {
    const run = endless.run;
    if (!run?.offer) return this.go('title');
    const kind = waveKind(run.stats.cleared);
    this.heading(T.rewardTitle, T.rewardSub(run.stats.cleared, kind === 'normal' ? null : kind));
    // Kart genişliği kart sayısına uyar (normal 3, elit/boss 4)
    const n = run.offer.length;
    const w = Math.min(LOOK.card.maxW, (1760 - (n - 1) * LOOK.card.gap) / n);
    run.offer.forEach((card, i) => this.rewardCard(run, card, i, CX + (i - (n - 1) / 2) * (w + LOOK.card.gap), w));
  }

  private rewardCard(run: EndlessRun, card: RewardCard, index: number, cx: number, w: number): void {
    const { top, h } = LOOK.card;
    this.panel(cx - w / 2, top, w, h, 0.9);
    this.add2(fitText(this.label(cx, top + 34, cardTitle(card).toUpperCase(), 28).setOrigin(0.5, 0), w - 40));
    const y = top + 100;
    if (card.kind === 'item') {
      const d = itemDef(card.itemId);
      const hero = heroOf(run, card.heroId);
      if (d && hero) this.itemBlock(run, d, hero, cx, y, w - 50);
    } else {
      const big = card.kind === 'gold' ? `+${card.amount}` : card.kind === 'heal' ? `+${Math.round(card.ratio * 100)}%` : '100%';
      this.add2(elText(this, cx, y + 40, big, 64, EL.ON, { em: 0.04, weight: '700' }).setOrigin(0.5));
      this.add2(this.note(cx, y + 120, cardText(card), 24, C.text).setOrigin(0.5, 0).setWordWrapWidth(w - 60).setAlign('center'));
      if (card.kind === 'heal' || card.kind === 'feast')
        run.heroes.forEach((hh, k) => {
          const ry = y + 250 + k * 34;
          const to = card.kind === 'heal' ? Math.min(1, hh.hpRatio + card.ratio) : 1;
          this.add2(this.note(cx - w / 2 + 40, ry, className(hh.class), 20, C.dim));
          this.add2(this.note(cx + w / 2 - 40, ry, T.healPreview(hh.hpRatio, to), 20, C.text).setOrigin(1, 0));
        });
      else this.add2(this.note(cx, y + 250, T.youHaveGold(run.gold), 22, C.dim).setOrigin(0.5, 0));
    }
    this.button(cx, top + h - 58, 220, T.take, () => this.actTakeReward(run, index), { primary: true, h: 68 });
  }

  /** Item ayrıntısı (ad, tür, statlar, kime, neyin yerine, primary uyarısı). */
  private itemBlock(run: EndlessRun, d: ItemDef, hero: EndlessHero, cx: number, y: number, maxW: number): void {
    this.add2(fitText(this.label(cx, y, d.name, 28, rarityColor(d)).setOrigin(0.5, 0), maxW));
    this.add2(this.note(cx, y + 42, itemKindLine(d), 20, C.dim).setOrigin(0.5, 0));
    let ly = y + 84;
    for (const line of itemStatLines(d)) {
      this.add2(this.note(cx, ly, line, 24, C.stat).setOrigin(0.5, 0));
      ly += 32;
    }
    ly += 14;
    this.add2(this.note(cx, ly, T.forHero(className(hero.class)), 22, C.accent).setOrigin(0.5, 0));
    const old = replacedItem(run, hero.id, d.id);
    this.add2(fitText(this.note(cx, ly + 32, old ? T.replacesSold(old.name, Math.round(itemValue(old) * ITEMS.budget.sellRatio)) : T.fillsEmpty, 20, C.dim).setOrigin(0.5, 0), maxW));
    if (primaryBonusLost(hero, { equip: { uid: 'preview', id: d.id } })) this.add2(fitText(this.note(cx, ly + 64, T.primaryWarning, 20, C.warn).setOrigin(0.5, 0), maxW));
  }

  private drawShop(): void {
    const run = endless.run;
    if (!run?.shop) return this.go('title');
    this.heading(T.shopTitle, T.shopSub(run.gold));
    run.shop.forEach((e, i) => {
      const d = itemDef(e.itemId);
      const hero = heroOf(run, e.heroId);
      if (!d || !hero) return;
      const top = 280 + i * 190;
      const x0 = CX - 640;
      this.panel(x0, top, 1280, 170, 0.88);
      this.add2(fitText(this.label(x0 + 40, top + 26, d.name, 28, rarityColor(d)), 520));
      this.add2(this.note(x0 + 40, top + 70, itemKindLine(d), 20, C.dim));
      this.add2(fitText(this.note(x0 + 40, top + 104, itemStatLines(d).join('   ·   '), 22, C.stat), 540));
      const old = replacedItem(run, hero.id, d.id);
      this.add2(this.note(x0 + 640, top + 40, T.forHero(className(hero.class)), 22, C.accent));
      this.add2(fitText(this.note(x0 + 640, top + 76, old ? T.replaces(old.name) : T.fillsEmpty, 20, C.dim), 330));
      if (primaryBonusLost(hero, { equip: { uid: 'preview', id: d.id } })) this.add2(this.note(x0 + 640, top + 108, T.primaryWarningShort, 20, C.warn));
      if (e.sold) this.add2(this.label(x0 + 1150, top + 85, T.sold, 28, C.dim).setOrigin(0.5));
      else this.button(x0 + 1150, top + 85, 210, T.buy(e.price), () => this.actBuy(run, i), { enabled: run.gold >= e.price, h: 68 });
    });
    this.button(CX, 930, 340, T.moveOn, () => this.actLeaveShop(run), { primary: true });
  }

  private drawOver(): void {
    const run = endless.run;
    const last = endless.last;
    if (!run || !last) return this.go('title');
    const abandoned = run.end === 'abandoned';
    this.heading(T.overTitle(abandoned), T.overSub(abandoned, run.wave));
    const e = last.entry;
    this.add2(this.note(CX, 250, T.overStats(e.cleared, e.turns, e.kills, e.gearScore), 26, C.accent).setOrigin(0.5));
    this.add2(this.note(CX, 296, T.overRank(last.rank), 26, last.rank === 0 ? C.bright : C.text, true).setOrigin(0.5));
    this.panel(CX - 400, 350, 800, 520, 0.8);
    this.scoreList(CX - 360, 378, 720, scores(), last.rank);
    this.button(CX - 220, 950, 320, T.mainMenu, () => this.actMainMenu());
    this.button(CX + 220, 950, 320, T.newRun, () => {
      endless.run = null;
      this.actStartPick();
    }, { primary: true });
  }

  /** En iyi koşular listesi (yerel, ilk 10). `mark`: vurgulanacak satır. */
  private scoreList(x: number, y: number, w: number, list: ScoreEntry[], mark = -1): void {
    this.add2(this.label(x, y, T.bestRuns, 26));
    if (!list.length) {
      this.add2(this.note(x, y + 52, T.noRuns, 24, C.dim, true));
      return;
    }
    list.forEach((e, i) => {
      const ry = y + 52 + i * 44;
      const on = i === mark;
      if (on) this.add2(this.add.rectangle(x - 12, ry - 4, w + 24, 40, 0xe0702a, 0.16).setOrigin(0, 0));
      const col = on ? C.bright : C.text;
      this.add2(this.note(x, ry, `${i + 1}.`, 24, col));
      this.add2(this.label(x + 50, ry + 2, T.scoreWave(e.wave), 22, col));
      this.add2(fitText(this.note(x + 210, ry, e.classes.map(className).join(' · '), 22, col), w - 210 - 130));
      this.add2(this.note(x + w, ry, T.scoreTurns(e.turns), 22, C.dim).setOrigin(1, 0));
    });
  }

  // ============================================================ çizim yardımcıları

  /** Sol üst "◂ Back  Esc" (tasarım kiti; geri / menu kuralı CLAUDE.md). */
  private drawBack(): void {
    this.backBtn = elLink(this, `◂ ${T.back.replace(/^[◂<\s]+/, '')}`, () => !this.confirm && this.back(), { small: 'Esc' }).root.setDepth(20).setY(56);
  }

  private add2<O extends Phaser.GameObjects.GameObject>(o: O): O {
    this.root.add(o);
    return o;
  }

  private tapZone(x: number, y: number, w: number, h: number, run: () => void): Phaser.GameObjects.Zone {
    const z = this.add2(this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }));
    z.on('pointerup', () => !this.confirm && run());
    return z;
  }

  /** Altın degradeli Cinzel başlık + süs çizgileri (kit: elHeading) ve EB Garamond italik alt yazı. */
  private heading(title: string, sub?: string): void {
    this.add2(elHeading(this, CX, LOOK.headingY, title, 46));
    if (sub) this.add2(this.note(CX, LOOK.subY - 14, sub, 25, C.sub, true).setOrigin(0.5));
  }

  /** EB Garamond açıklama yazısı (kit: elBody). */
  private note(x: number, y: number, text: string, size = 24, color: string = C.text, italic = false): Phaser.GameObjects.Text {
    return elBody(this, x, y, text, size, color, italic);
  }

  /** Cinzel küçük başlık (kit: elText). */
  private label(x: number, y: number, text: string, size = 26, color: string = C.bright): Phaser.GameObjects.Text {
    return elText(this, x, y, text, size, color, { em: 0.04, upper: false });
  }

  /** Kit düğmesi: primary (START dili) / secondary; pasifken soluk, dokununca sallanır. Merkez (cx, cy). */
  private button(cx: number, cy: number, w: number, label: string, run: () => void, o: { primary?: boolean; enabled?: boolean; h?: number } = {}): ElButton {
    const enabled = o.enabled ?? true;
    const b = elButton(
      this,
      label,
      () => {
        if (this.confirm) return;
        if (!enabled) return b.shake();
        run();
      },
      { kind: o.primary ? 'primary' : 'secondary', w, h: o.h ?? (o.primary ? 76 : 60), size: o.primary ? 24 : 19, ready: enabled },
    );
    b.root.setPosition(cx, cy);
    this.add2(b.root);
    return b;
  }

  private panel(x: number, y: number, w: number, h: number, alpha = 0.92): void {
    this.add2(elPanel(this, x, y, w, h, { alpha }));
  }

  /** Kafa portresi ("avatar") + primary grubu renginde ince çerçeve. */
  private avatar(def: CombatantDef, cx: number, cy: number, size: number): void {
    const col = Phaser.Display.Color.HexStringToColor(groupColor(PRIMARY_COLORS, def.primary)).color;
    this.add2(this.add.rectangle(cx, cy, size + 6, size + 6, 0x120c07, 1).setStrokeStyle(1, col, 0.8));
    this.add2(classAvatar(this, def, cx, cy, size));
  }

  private hpBar(x: number, y: number, w: number, h: number, ratio: number): void {
    const g = this.add2(this.add.graphics());
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    const col = r > 0.6 ? 0x7fb85a : r > 0.3 ? 0xd9b24a : 0xc4553f;
    // Kit: ince çubuk (koyu zemin + ince altın çizgi)
    g.fillStyle(EL.INK, 0.8).fillRect(x, y, w, h);
    if (r > 0) g.fillStyle(col, 0.95).fillRect(x + 1, y + 1, Math.max(2, (w - 2) * r), h - 2);
    g.lineStyle(1, EL.GOLD, EL.LINE.a2).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  /** Onay (kit: elConfirm). Yalnızca ilerleme kaybolacaksa sorulur (koşuyu bırakmak, yeni koşu). */
  private ask(text: string, yes: () => void): void {
    this.closeConfirm();
    const c = elConfirm(this, {
      text,
      yes: T.yes,
      no: T.no,
      onYes: () => {
        this.confirm = null;
        yes();
      },
      onNo: () => (this.confirm = null),
    });
    this.confirm = c;
  }

  private closeConfirm(): void {
    this.confirm?.close();
    this.confirm = null;
  }
}
