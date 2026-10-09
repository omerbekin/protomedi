/**
 * Sefer kuşanma ekranı (Gear) + "Spoils" (loot) kartı + Ashford teslim kartı (madde 280; items.md 5.4). DOM katmanı, ana menünün zarif stili
 * (Cinzel başlık, EB Garamond metin, kor/altın renkler; src/ui/gear.css). Açıkken Phaser girişi kilitli (input-lock).
 * Kurallar saf modüllerde: kuşanma `src/campaign/gear.ts`, karşılaştırma/metin `src/progression/item-text.ts`, primary uyarısı `primaryCheck`.
 * Ekran bir KAYNAK (GearSource) ile çalışır: sefer (`openGearScreen`, CampaignState) ve endless (`openGear` + src/game/endless-gear.ts) aynı ekranı besler.
 * Oyun içi metinler İngilizce.
 */
import './gear.css';
import { activeHeroes, discardItem, discardNeedsConfirm, equipBest, equipItem, takeLeftover, unequipItem, type CampaignState, type Hero } from '../campaign';
import { content } from '../engine';
import {
  BAG_SIZE,
  PRIMARY_BONUS_NAME,
  RARITY_IDS,
  SLOT_IDS,
  STAT_IDS,
  canEquip,
  classWeaponFamilies,
  equipDiff,
  fmtPanel,
  heroPanel,
  heroStats,
  itemDef,
  itemLines,
  itemSubtitle,
  itemValue,
  ITEMS,
  primaryCheck,
  rarityDef,
  slotDef,
  statLine,
  type Equipment,
  type ItemDef,
  type ItemInstance,
  type SlotId,
} from '../progression';
import { wikiFiles } from '../wiki/files';
import { lockInput, unlockInput } from './input-lock';
import { itemDefIcon } from './item-icon-dom';
import { statIconUrl, statTip } from './stat-tips';
import { dropAction, isDoubleTap, type DragSource, type DropTarget } from './gear-drop';
import { dismissOnBackdrop } from './backdrop';
import type { Stats } from '../engine';

/** Düğümün `anc` içindeki konumu (offset zinciri; döndürülmüş sahnede de doğru, kaydırmalar düşülür). */
function offsetIn(node: HTMLElement, anc: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = node;
  while (n && n !== anc) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const parent = n.offsetParent as HTMLElement | null;
    for (let q: HTMLElement | null = n.parentElement; q && q !== anc; q = q.parentElement) {
      x -= q.scrollLeft;
      y -= q.scrollTop;
      if (q === parent) break;
    }
    n = parent;
  }
  return { x, y };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (cls: string, text: string, run: () => void): HTMLButtonElement => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', run);
  return b;
};

/**
 * Item / yuva ikonu: piksel art (tek ortak kaynak src/game/item-icons.ts; Endless kartları ve Codex de aynısını çizer). Nadirlik rengi yalnızca
 * taş / kenar ayrıntısını boyar ve hafif bir parıltı verir; boş yuvada yuvanın ikonu soluk durur.
 */
function slotIcon(d: ItemDef | undefined, slot: SlotId, color: string | null, size = 1, dim = !d): HTMLImageElement {
  const img = itemDefIcon(d, slot, color ?? undefined, `gr-svg gr-px${dim ? ' dim' : ''}`);
  img.style.setProperty('--sz', String(size));
  if (!dim && color) img.style.setProperty('--glow', color);
  return img;
}

const avatarUrl = (classId: string): string | undefined => wikiFiles.avatars[`../../assets/avatars/${classId}.png`];
const className = (id: string): string => content.classes[id]?.name ?? id;
const rarityColor = (inst: ItemInstance | null | undefined): string => {
  const d = inst ? itemDef(inst.id) : undefined;
  return d ? rarityDef(d.rarity).color : '#5b4a33';
};

export interface GearOptions {
  get: () => CampaignState;
  set: (s: CampaignState) => void;
  /** Açılınca seçili kahraman (yoksa aktif takımın ilki). */
  hero?: string;
  /** Item takma tutorial'ı (Ashford teslimi): üstte yönlendirme satırı. */
  tutorial?: boolean;
  onClose?: () => void;
}

/** Gear ekranının gördüğü kahraman (sefer Hero'su ve endless kahramanı bu şekle uyar; ekipman 6 yuvalı, boş = null). */
export interface GearHero {
  id: string;
  class: string;
  level: number;
  equipment: Equipment;
}

/**
 * Gear ekranının veri kaynağı (adaptör). İşlemler hata durumunda Error fırlatır (ekran mesajı gösterir); her işlemden sonra ekran
 * kaynaktan yeniden okur. Sefer: `campaignGearSource`; endless: src/game/endless-gear.ts.
 */
export interface GearSource {
  /** Kahramanlar (ekrandaki sırayla). */
  heroes(): GearHero[];
  bag(): ItemInstance[];
  bagSize: number;
  gold(): number;
  equip(heroId: string, uid: string): void;
  unequip(heroId: string, slot: SlotId): void;
  discard(uid: string): void;
  /** "Equip best": verilen kahramanlar (yoksa tüm takım). */
  equipBest(heroIds?: string[]): void;
  /** Torba boşken kartta görünen yazı. */
  emptyText?: string;
}

/** Seferin kaynağı: CampaignState üzerinden (davranış eskisiyle birebir). */
export function campaignGearSource(get: () => CampaignState, set: (s: CampaignState) => void): GearSource {
  const apply = (fn: (s: CampaignState) => CampaignState): void => set(fn(get()));
  return {
    heroes: () => {
      const s = get();
      return [...activeHeroes(s), ...s.roster.filter((h) => !s.active.includes(h.id))];
    },
    bag: () => get().inventory,
    bagSize: BAG_SIZE,
    gold: () => get().gold,
    equip: (heroId, uid) => apply((x) => equipItem(x, heroId, uid)),
    unequip: (heroId, slot) => apply((x) => unequipItem(x, heroId, slot)),
    discard: (uid) => apply((x) => discardItem(x, uid)),
    equipBest: (ids) => apply((x) => equipBest(x, ids)),
    emptyText: 'The bag is empty. Victories and chests bring new gear.',
  };
}

type Selection = { kind: 'bag'; uid: string } | { kind: 'slot'; slot: SlotId } | null;

/** Sefer Gear ekranı (eski giriş; kaynak CampaignState). */
export function openGearScreen(root: HTMLElement, o: GearOptions): () => void {
  const s0 = o.get();
  return openGear(root, campaignGearSource(o.get, o.set), { hero: o.hero ?? activeHeroes(s0)[0]?.id ?? s0.roster[0]?.id ?? '', tutorial: o.tutorial, onClose: o.onClose });
}

/** Gear ekranı: sol kahramanlar, orta 6 yuva + statlar, sağ torba + seçilen item kartı. Kaynaktan beslenir (sefer / endless). */
export function openGear(root: HTMLElement, src: GearSource, o: { hero?: string; tutorial?: boolean; onClose?: () => void } = {}): () => void {
  const overlay = el('div', 'gr-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Gear');
  const panel = el('div', 'gr-panel');
  overlay.append(panel);
  root.append(overlay);
  lockInput('gear');
  let heroId = o.hero ?? src.heroes()[0]?.id ?? '';
  let sel: Selection = null;
  let usableOnly = false;
  /** Rare+ atma onayı bekleyen item (uid). */
  let confirmDiscard = '';
  // Stat açıklamaları (savaş HUD'ıyla aynı metin: src/ui/stat-tips.ts): fareyle üstüne gelince; dokunmatikte dokununca açılır / kapanır
  let curStats: Stats | null = null;
  /** Seçili torba item'i bu kahramana takılırsa statlar (yoksa null): açıklamada "önce → sonra". */
  let afterStats: Stats | null = null;
  const tip = el('div', 'el-tip gr-tip');
  overlay.append(tip);
  let tipFor: HTMLElement | null = null;
  let tipPinned = false;
  const hideTip = (): void => {
    tip.classList.remove('on');
    tipFor = null;
    tipPinned = false;
  };
  const showTip = (t: HTMLElement): void => {
    const info = curStats ? statTip(t.dataset['stat'] ?? '', curStats, t.dataset['delta'] ? afterStats : null) : null;
    if (!info) return;
    const head = el('b', '', info.title);
    if (t.dataset['delta']) head.append(el('span', `gr-tip-d ${t.dataset['dir'] ?? ''}`, ` (${t.dataset['delta']})`));
    tip.replaceChildren(head, ...info.lines.map((l) => el('div', 'gr-tip-l', l)));
    tip.classList.add('on');
    const o = offsetIn(t, overlay);
    const W = overlay.clientWidth;
    const H = overlay.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x = o.x + t.offsetWidth / 2 - tw / 2;
    let y = o.y - th - 8;
    if (y < 6) y = o.y + t.offsetHeight + 8;
    x = Math.max(6, Math.min(W - tw - 6, x));
    y = Math.max(6, Math.min(H - th - 6, y));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tipFor = t;
  };
  overlay.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || tipPinned) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]');
    if (t && t !== tipFor) showTip(t);
  });
  overlay.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch' || tipPinned) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]');
    if (t && !(e.relatedTarget instanceof Node && t.contains(e.relatedTarget))) hideTip();
  });
  overlay.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]');
    if (!t) {
      if (tipPinned) hideTip();
      return;
    }
    if (tipFor === t && tipPinned) hideTip();
    else {
      showTip(t);
      tipPinned = true;
    }
  });

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', onTouchMove);
    unlockInput('gear');
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      if (sel) {
        sel = null;
        render();
      } else close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  // Panelin dışına (kararan zemine) dokunmak Gear'ı kapatır (Done ile aynı; src/ui/backdrop.ts)
  dismissOnBackdrop(overlay, panel, () => close());

  const apply = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err));
    }
    render();
  };
  let flashText = '';
  const flash = (t: string): void => {
    flashText = t;
  };
  /** Kuşanılamayan item'e çift tıklama / bırakma: hücre kısa sallanır (bir sonraki çizimde). */
  let shakeUid = '';

  /**
   * Çift tıklama / sürükle-bırak ile kuşanma (Equip düğmesiyle aynı kurallar): silah ailesi uymuyorsa uyarı + sallanma, hiçbir şey olmaz;
   * primary bonusu düşecekse item o kahramanda seçili kalır ve kartta "Equip anyway" onayı görünür.
   */
  const tryEquip = (targetHero: string, uid: string): void => {
    const h = src.heroes().find((x) => x.id === targetHero);
    const inst = src.bag().find((i) => i.uid === uid);
    const d = inst ? itemDef(inst.id) : undefined;
    if (!h || !inst || !d) return;
    heroId = targetHero;
    confirmDiscard = '';
    if (!canEquip(h.class, d)) {
      const fam = ITEMS.weaponFamilies.find((f) => f.id === d.family);
      sel = { kind: 'bag', uid };
      shakeUid = uid;
      flash(`${className(h.class)} cannot use ${fam?.name ?? 'this weapon'}.`);
      render();
      return;
    }
    if (primaryCheck(h, { equip: inst }).lost) {
      sel = { kind: 'bag', uid };
      flash('Confirm with Equip anyway.');
      render();
      return;
    }
    sel = null;
    apply(() => src.equip(targetHero, uid));
  };
  let lastTap: { key: string; at: number } | null = null;

  // Sürükle-bırak: fare 6 px kaydırınca, dokunmatikte uzun basınca (380 ms) başlar; ikonun hayaleti imleci izler, geçerli hedefler parlar.
  // Bırakılan yer geçersizse hiçbir şey olmaz (ikon yerinde). Sürükleme zemine dokunma sayılmaz (basış panelin içinde başlar).
  let drag: { src: DragSource; ghost: HTMLElement; rc: string } | null = null;
  let press: { src: DragSource; x: number; y: number; touch: boolean; timer: number; icon: HTMLElement; rc: string } | null = null;
  let dragJustEnded = false;
  const targetOf = (node: Element | null): DropTarget | null => {
    const t = node?.closest<HTMLElement>('[data-drop]');
    const v = t?.dataset['drop'] ?? '';
    if (v === 'bag') return { kind: 'bag' };
    if (v.startsWith('slot:')) return { kind: 'slot', heroId, slot: v.slice(5) as SlotId };
    if (v.startsWith('hero:')) return { kind: 'hero', heroId: v.slice(5) };
    return null;
  };
  const classOf = (id: string) => src.heroes().find((h) => h.id === id)?.class;
  const markTargets = (on: boolean): void => {
    overlay.classList.toggle('gr-dragging', on);
    panel.querySelectorAll<HTMLElement>('[data-drop]').forEach((t) => {
      t.classList.remove('drop-ok', 'drop-no');
      if (!on || !drag) return;
      const tg = targetOf(t);
      const ok = !!tg && dropAction(drag.src, tg, classOf).kind !== 'none';
      t.classList.add(ok ? 'drop-ok' : 'drop-no');
    });
    if (on && drag) overlay.style.setProperty('--drag-rc', drag.rc);
  };
  const moveGhost = (x: number, y: number): void => {
    if (!drag) return;
    const r = overlay.getBoundingClientRect();
    const s = r.width / Math.max(1, overlay.offsetWidth);
    drag.ghost.style.left = `${(x - r.left) / s}px`;
    drag.ghost.style.top = `${(y - r.top) / s}px`;
  };
  const startDrag = (x: number, y: number): void => {
    if (!press) return;
    const ghost = el('div', 'gr-ghost');
    ghost.style.setProperty('--rc', press.rc);
    ghost.append(press.icon.cloneNode(true));
    overlay.append(ghost);
    drag = { src: press.src, ghost, rc: press.rc };
    hideTip();
    markTargets(true);
    moveGhost(x, y);
  };
  const endDrag = (x: number, y: number, drop: boolean): void => {
    const d = drag;
    drag = null;
    if (press) window.clearTimeout(press.timer);
    press = null;
    if (!d) return;
    d.ghost.remove();
    markTargets(false);
    dragJustEnded = true;
    window.setTimeout(() => (dragJustEnded = false), 0);
    if (!drop) return;
    const tg = targetOf(document.elementFromPoint(x, y));
    if (!tg) return;
    const act = dropAction(d.src, tg, classOf);
    if (act.kind === 'equip') tryEquip(act.heroId, act.uid);
    else if (act.kind === 'unequip') {
      sel = null;
      apply(() => src.unequip(act.heroId, act.slot));
    } else if (d.src.kind === 'bag' && act.reason === 'Cannot use' && tg.kind !== 'bag') tryEquip(tg.heroId, d.src.uid);
  };
  panel.addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!t || e.button > 0) return;
    const v = t.dataset['drag'] ?? '';
    const srcD: DragSource | null = v.startsWith('bag:')
      ? { kind: 'bag', uid: v.slice(4), itemId: t.dataset['item'] ?? '' }
      : v.startsWith('slot:')
        ? { kind: 'slot', heroId, slot: v.slice(5) as SlotId }
        : null;
    if (!srcD) return;
    const touch = e.pointerType === 'touch';
    const icon = t.querySelector<HTMLElement>('.gr-svg') ?? t;
    press = { src: srcD, x: e.clientX, y: e.clientY, touch, icon, rc: t.style.getPropertyValue('--rc') || '#f3d999', timer: 0 };
    if (touch) press.timer = window.setTimeout(() => press && startDrag(press.x, press.y), 380);
  });
  const onMove = (e: PointerEvent): void => {
    if (drag) {
      moveGhost(e.clientX, e.clientY);
      return;
    }
    if (!press) return;
    const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) {
      if (dist > 10) {
        window.clearTimeout(press.timer); // parmak kaydı: kaydırma, sürükleme değil
        press = null;
      }
    } else if (dist > 6) startDrag(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent): void => endDrag(e.clientX, e.clientY, true);
  const onCancel = (e: PointerEvent): void => endDrag(e.clientX, e.clientY, false);
  // Sürükleme sürerken dokunmatik kaydırma olmasın
  const onTouchMove = (e: TouchEvent): void => {
    if (drag) e.preventDefault();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  // Sürüklemeden sonra gelen tıklama (bırakılan yerdeki düğme) yok sayılır
  panel.addEventListener('click', (e) => {
    if (dragJustEnded) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  panel.addEventListener('contextmenu', (e) => (e.target as HTMLElement).closest('[data-drag]') && e.preventDefault());

  function render(): void {
    const list = src.heroes();
    const bag = src.bag();
    const hero = list.find((h) => h.id === heroId) ?? list[0];
    hideTip();
    curStats = hero ? heroStats(hero) : null;
    // Yeniden çizim kaydırma konumlarını korur (tıklamada torba / sütunlar başa sıçramasın)
    const scrolls = ['.gr-heroes', '.gr-mid', '.gr-bag', '.gr-card'].map((q) => [q, panel.querySelector<HTMLElement>(q)?.scrollTop ?? 0] as const);
    queueMicrotask(() => {
      for (const [q, top] of scrolls) {
        const e = panel.querySelector<HTMLElement>(q);
        if (e && q !== '.gr-card') e.scrollTop = top;
      }
    });
    panel.replaceChildren();
    // Başlık
    const head = el('div', 'gr-head');
    head.append(el('div', 'gr-title', 'Gear'), el('div', 'gr-gold', `${src.gold()} gold`));
    panel.append(head);
    if (o.tutorial)
      panel.append(el('div', 'gr-hint', 'Your escort left their gear for the new company. Tap an item in the bag, then Equip, or let Equip best choose.'));
    const body = el('div', 'gr-body');
    panel.append(body);

    // --- Sol: kahramanlar
    const heroes = el('div', 'gr-heroes');
    for (const h of list) {
      const card = btn(`gr-hero${hero && h.id === hero.id ? ' on' : ''}`, '', () => {
        heroId = h.id;
        // Torbadan seçili item kahraman değişince seçili kalır (aynı item'i farklı kahramanlarda dene: fark, uyarılar yeni kahramana göre);
        // önceki kahramanın kuşanılmış yuvası seçiliyse seçim kalkar (o yuva yeni kahramanda başka item'dir)
        if (sel?.kind === 'slot') sel = null;
        confirmDiscard = '';
        render();
      });
      card.dataset['drop'] = `hero:${h.id}`;
      const url = avatarUrl(h.class);
      const face = el('div', 'gr-face');
      if (url) face.style.backgroundImage = `url("${url}")`;
      const meta = el('div', 'gr-hero-meta');
      const count = SLOT_IDS.filter((k) => h.equipment[k]).length;
      meta.append(el('div', 'gr-hero-name', className(h.class)), el('div', 'gr-hero-sub', `Level ${h.level} · ${count}/6 items`));
      card.append(face, meta);
      heroes.append(card);
    }
    body.append(heroes);
    if (!hero) return;

    // --- Orta: yuvalar + statlar
    const mid = el('div', 'gr-mid');
    mid.append(el('div', 'gr-sec', `${className(hero.class)} · ${classWeaponFamilies(hero.class).map((f) => ITEMS.weaponFamilies.find((x) => x.id === f)?.name).join(' / ')}`));
    const slots = el('div', 'gr-slots');
    for (const k of SLOT_IDS) {
      const inst = hero.equipment[k];
      const d = inst ? itemDef(inst.id) : undefined;
      const on = sel?.kind === 'slot' && sel.slot === k;
      const cell = btn(`gr-slot${on ? ' on' : ''}${inst ? '' : ' empty'}`, '', () => {
        sel = inst ? { kind: 'slot', slot: k } : null;
        render();
      });
      cell.style.setProperty('--rc', rarityColor(inst));
      cell.dataset['drop'] = `slot:${k}`;
      if (inst) cell.dataset['drag'] = `slot:${k}`;
      cell.append(slotIcon(d, k, d ? rarityColor(inst) : null, 1.3));
      const txt = el('div', 'gr-slot-text');
      txt.append(el('div', 'gr-slot-name', d ? d.name : slotDef(k).name), el('div', 'gr-slot-sub', d ? itemLines(d).join(', ') : 'Empty'));
      if (d) cell.title = `${d.name}: ${itemLines(d).join(', ')}`;
      cell.append(txt);
      slots.append(cell);
    }
    mid.append(slots);
    // Stat paneli (seçili torba item'i için fark)
    // Seçili item torbadan çıktıysa (kuşanıldı, atıldı) seçim kalkar
    if (sel?.kind === 'bag') {
      const uid = sel.uid;
      if (!bag.some((i) => i.uid === uid)) sel = null;
    }
    const bagUid = sel?.kind === 'bag' ? sel.uid : '';
    const candidate = bagUid ? bag.find((i) => i.uid === bagUid) : undefined;
    const usableCandidate = candidate && itemDef(candidate.id) && canEquip(hero.class, itemDef(candidate.id)!) ? candidate : undefined;
    const diff = new Map((usableCandidate ? equipDiff(hero, usableCandidate) : []).map((x) => [x.id, x.delta]));
    const cd = usableCandidate ? itemDef(usableCandidate.id) : undefined;
    afterStats = cd ? heroStats({ ...hero, equipment: { ...hero.equipment, [cd.slot]: usableCandidate } }) : null;
    const stats = el('div', 'gr-stats');
    for (const p of heroPanel(hero)) {
      const row = el('div', 'gr-stat');
      row.dataset['stat'] = p.id;
      const dv = diff.get(p.id);
      // ikon + etiket + değer (+ fark), HUD karakter sayfası gibi hizalı; ikon kaynağı ortak (stat-tips > statIconUrl)
      const ico = el('img', 'gr-sico');
      ico.src = statIconUrl(p.id);
      ico.alt = '';
      ico.draggable = false;
      row.append(ico, el('span', 'gr-stat-k', p.label), el('span', 'gr-stat-v', fmtPanel(p)));
      const dText = dv ? `${dv > 0 ? '+' : ''}${fmtPanel({ value: dv, fmt: p.fmt })}` : '';
      row.append(el('span', `gr-stat-d ${dv ? (dv > 0 ? 'up' : 'down') : ''}`, dText));
      if (dv) {
        row.dataset['delta'] = dText;
        row.dataset['dir'] = dv > 0 ? 'up' : 'down';
      }
      stats.append(row);
    }
    mid.append(stats);
    body.append(mid);

    // --- Sağ: torba
    const right = el('div', 'gr-right');
    const bagHead = el('div', 'gr-bag-head');
    bagHead.append(
      el('div', 'gr-sec', `Bag ${bag.length} / ${src.bagSize}`),
      btn(`gr-chip${usableOnly ? ' on' : ''}`, usableOnly ? `Usable by ${className(hero.class)}` : 'All items', () => {
        usableOnly = !usableOnly;
        render();
      }),
    );
    right.append(bagHead);
    const grid = el('div', 'gr-bag');
    grid.dataset['drop'] = 'bag';
    // Filtre yerleşimi değiştirmez: tüm yuvalar hep çizilir, kullanılamayan item'ler yerinde söner (Ömer 2026-10-09: tıklamada boyut değişmesin)
    const items = [...bag]
      .sort((a, b) => {
        const da = itemDef(a.id);
        const db = itemDef(b.id);
        if (!da || !db) return 0;
        return SLOT_IDS.indexOf(da.slot) - SLOT_IDS.indexOf(db.slot) || RARITY_IDS.indexOf(db.rarity) - RARITY_IDS.indexOf(da.rarity) || db.ilvl - da.ilvl;
      });
    for (const inst of items) {
      const d = itemDef(inst.id);
      if (!d) continue;
      const usable = canEquip(hero.class, d);
      const on = sel?.kind === 'bag' && sel.uid === inst.uid;
      const cell = btn(`gr-item${on ? ' on' : ''}${usable ? '' : ' no'}${usableOnly && !usable ? ' filtered' : ''}${shakeUid === inst.uid ? ' shake' : ''}`, '', () => {
        // Çift tıklama / çift dokunma: bu kahramana kuşan
        const now = performance.now();
        if (isDoubleTap(lastTap, inst.uid, now)) {
          lastTap = null;
          tryEquip(hero.id, inst.uid);
          return;
        }
        lastTap = { key: inst.uid, at: now };
        // Aynı item'e yeniden dokunmak seçimi kaldırır
        sel = sel?.kind === 'bag' && sel.uid === inst.uid ? null : { kind: 'bag', uid: inst.uid };
        confirmDiscard = '';
        render();
      });
      cell.dataset['drag'] = `bag:${inst.uid}`;
      cell.dataset['item'] = inst.id;
      cell.title = d.name;
      cell.style.setProperty('--rc', rarityDef(d.rarity).color);
      cell.append(slotIcon(d, d.slot, rarityDef(d.rarity).color));
      grid.append(cell);
    }
    for (let i = items.length; i < src.bagSize; i++) grid.append(el('div', 'gr-item empty'));
    shakeUid = '';
    right.append(grid);

    // Seçilen item kartı
    const card = el('div', 'gr-card');
    const selInst = sel?.kind === 'bag' ? candidate : sel?.kind === 'slot' ? hero.equipment[sel.slot] : undefined;
    const selDef = selInst ? itemDef(selInst.id) : undefined;
    if (selInst && selDef) {
      const name = el('div', 'gr-card-name', selDef.name);
      name.style.color = rarityDef(selDef.rarity).color;
      card.append(name, el('div', 'gr-card-sub', itemSubtitle(selDef)));
      const lines = el('div', 'gr-card-lines');
      for (const k of STAT_IDS) {
        const v = selDef.stats[k];
        if (!v) continue;
        const line = statLineEl(k, v, 'gr-card-line gr-line');
        line.dataset['stat'] = k;
        lines.append(line);
      }
      card.append(lines, el('div', 'gr-card-value', `Value ${itemValue(selDef)} gold`));
      const actions = el('div', 'gr-card-actions');
      if (sel?.kind === 'bag') {
        const cur = hero.equipment[selDef.slot];
        const curDef = cur ? itemDef(cur.id) : undefined;
        if (curDef) card.append(el('div', 'gr-card-note', `Replaces ${curDef.name}`));
        if (!canEquip(hero.class, selDef)) {
          const fam = ITEMS.weaponFamilies.find((f) => f.id === selDef.family);
          card.append(el('div', 'gr-card-warn', `${className(hero.class)} cannot use ${fam?.name ?? 'this weapon'}.`));
        } else {
          const pc = primaryCheck(hero, { equip: selInst });
          if (pc.lost && pc.primary) {
            const over = pc.overtakenBy.map((k) => k.toUpperCase()).join(' and ');
            card.append(el('div', 'gr-card-warn', `Warning: ${over} would exceed ${pc.primary.toUpperCase()}. ${PRIMARY_BONUS_NAME[pc.primary]} will be disabled.`));
          }
          // Uyarı görünürken düğme "Equip anyway" olur (Ömer, madde 278: uyar, engelleme)
          actions.append(
            btn('gr-btn primary', pc.lost ? 'Equip anyway' : 'Equip', () => {
              sel = null;
              apply(() => src.equip(hero.id, selInst.uid));
            }),
          );
        }
        actions.append(
          discardButton(selInst, confirmDiscard === selInst.uid, () => {
            confirmDiscard = selInst.uid;
            render();
          }, () => {
            sel = null;
            confirmDiscard = '';
            apply(() => src.discard(selInst.uid));
          }),
        );
        if (discardNeedsConfirm(selInst) && confirmDiscard === selInst.uid) card.append(el('div', 'gr-card-warn', `Discard ${selDef.name}? It is gone for good.`));
      } else if (sel?.kind === 'slot') {
        actions.append(
          btn('gr-btn', 'Unequip', () => {
            const slot = sel?.kind === 'slot' ? sel.slot : undefined;
            if (!slot) return;
            sel = null;
            apply(() => src.unequip(hero.id, slot));
          }),
        );
      }
      card.append(actions);
    } else card.append(el('div', 'gr-card-empty', bag.length ? 'Tap an item to see it here.' : (src.emptyText ?? 'The bag is empty.')));
    if (flashText) {
      card.append(el('div', 'gr-card-warn', flashText));
      flashText = '';
    }
    right.append(card);
    body.append(right);

    // Alt satır
    const foot = el('div', 'gr-foot');
    foot.append(
      btn('gr-btn', `Equip best: ${className(hero.class)}`, () => {
        sel = null;
        apply(() => src.equipBest([hero.id]));
      }),
      btn('gr-btn', 'Equip best: all', () => {
        sel = null;
        apply(() => src.equipBest());
      }),
      btn('gr-btn primary', 'Done', close),
    );
    panel.append(foot);
  }
  render();
  return close;
}

/** Ortak küçük kart (Spoils / teslim). */
function smallCard(root: HTMLElement, title: string, subtitle: string, items: string[], extra: string[], buttons: Array<{ label: string; primary?: boolean; run: () => void }>): () => void {
  const overlay = el('div', 'gr-overlay gr-small');
  const panel = el('div', 'gr-panel gr-mini');
  overlay.append(panel);
  root.append(overlay);
  lockInput('gear-card');
  const close = (): void => {
    overlay.remove();
    unlockInput('gear-card');
  };
  panel.append(el('div', 'gr-title', title));
  if (subtitle) panel.append(el('div', 'gr-mini-sub', subtitle));
  const list = el('div', 'gr-mini-list');
  for (const id of items) if (itemDef(id)) list.append(itemRow(id));
  if (items.length) panel.append(list);
  for (const x of extra) panel.append(el('div', 'gr-mini-extra', x));
  const foot = el('div', 'gr-foot');
  for (const b of buttons)
    foot.append(
      btn(`gr-btn${b.primary ? ' primary' : ''}`, b.label, () => {
        close();
        b.run();
      }),
    );
  panel.append(foot);
  return close;
}

/**
 * Item stat satırı: stat ikonu + "+2 Magic Armor" (Gear kartı, Spoils / teslim kartları; ikon kaynağı savaş HUD'ıyla aynı:
 * src/ui/stat-tips.ts > statIconUrl). Phaser ekranları (Endless ödül / tüccar) `statIcon(id)` ile aynı ikonu çizer.
 */
export function statLineEl(k: string, v: number, cls = 'gr-line'): HTMLDivElement {
  const row = el('div', cls);
  const url = statIconUrl(k);
  if (url) {
    const i = el('img', 'gr-sico');
    i.src = url;
    i.alt = '';
    i.draggable = false;
    row.append(i);
  }
  row.append(el('span', '', statLine(k as (typeof STAT_IDS)[number], v)));
  return row;
}

/** Tek item satırı (Spoils / teslim kartları). `gone`: geride kalan (soluk). */
function itemRow(id: string, gone = false): HTMLDivElement {
  const d = itemDef(id)!;
  const row = el('div', `gr-mini-row${gone ? ' gone' : ''}`);
  row.append(slotIcon(d, d.slot, rarityDef(d.rarity).color, 0.9, gone));
  const t = el('div', 'gr-mini-text');
  const n = el('div', 'gr-mini-name', d.name);
  if (!gone) n.style.color = rarityDef(d.rarity).color;
  const lines = el('div', 'gr-mini-lines');
  lines.append(el('span', 'gr-mini-subt', itemSubtitle(d)));
  for (const k of STAT_IDS) if (d.stats[k]) lines.append(statLineEl(k, d.stats[k]!, 'gr-line inline'));
  t.append(n, lines);
  row.append(t);
  return row;
}

export interface SpoilsHooks {
  get: () => CampaignState;
  set: (s: CampaignState) => void;
  /** Gear ekranını aç (kart kapanır; çağıran kart dönüşünü yönetir). */
  gear: () => void;
  /** Kart kapandı (geride kalanlar kaybolur; çağıran acknowledgeLoot yapar). */
  done: () => void;
}

/**
 * Zafer / sandık sonrası "Spoils" kartı (pendingLoot). Torba doluysa sığmayan item'ler soluk listelenir ("Bag full: N items left behind");
 * kart açıkken oyuncu torbadan item atıp (Rare+ onaylı) yer açabilir ve "Take" ile alabilir. Kart kapanınca geride kalanlar kaybolur (madde 280).
 */
export function showSpoils(root: HTMLElement, on: SpoilsHooks): () => void {
  const overlay = el('div', 'gr-overlay gr-small');
  const panel = el('div', 'gr-panel gr-mini');
  overlay.append(panel);
  root.append(overlay);
  lockInput('gear-card');
  let pick = '';
  let confirm = '';
  const close = (): void => {
    overlay.remove();
    unlockInput('gear-card');
  };
  const render = (): void => {
    const s = on.get();
    const drop = s.pendingLoot;
    panel.replaceChildren();
    if (!drop) return;
    const ids = drop.items.map((u) => s.inventory.find((i) => i.uid === u)?.id).filter((x): x is string => !!x);
    const left = (drop.left ?? []).filter((id) => itemDef(id));
    panel.append(el('div', 'gr-title', drop.kind === 'treasure' ? 'Treasure' : 'Spoils'));
    if (ids.length) panel.append(el('div', 'gr-mini-sub', `${ids.length} new item${ids.length > 1 ? 's' : ''} in the bag`));
    const list = el('div', 'gr-mini-list');
    for (const id of ids) list.append(itemRow(id));
    if (ids.length) panel.append(list);
    panel.append(el('div', 'gr-mini-extra', ids.length || left.length ? `+${drop.gold} gold` : `No gear this time. +${drop.gold} gold`));
    if (left.length) {
      const room = s.inventory.length < BAG_SIZE;
      panel.append(el('div', 'gr-card-warn', `Bag full: ${left.length} item${left.length > 1 ? 's' : ''} left behind. Make room to take ${left.length > 1 ? 'them' : 'it'}, or ${left.length > 1 ? 'they are' : 'it is'} lost when you continue.`));
      const lost = el('div', 'gr-mini-list');
      left.forEach((id, i) => {
        const row = itemRow(id, true);
        const take = btn('gr-btn', 'Take', () => {
          on.set(takeLeftover(on.get(), i));
          render();
        });
        take.disabled = !room;
        row.append(take);
        lost.append(row);
      });
      panel.append(lost);
      // Yer aç: torbadan seç + at (Rare ve üstü onaylı)
      panel.append(el('div', 'gr-sec', `Make room · Bag ${s.inventory.length} / ${BAG_SIZE}`));
      const grid = el('div', 'gr-bag');
      for (const inst of s.inventory) {
        const d = itemDef(inst.id);
        if (!d) continue;
        const cell = btn(`gr-item${pick === inst.uid ? ' on' : ''}`, '', () => {
          pick = pick === inst.uid ? '' : inst.uid;
          confirm = '';
          render();
        });
        cell.title = d.name;
        cell.style.setProperty('--rc', rarityDef(d.rarity).color);
        cell.append(slotIcon(d, d.slot, rarityDef(d.rarity).color));
        grid.append(cell);
      }
      panel.append(grid);
      const picked = s.inventory.find((i) => i.uid === pick);
      if (picked) {
        const row = itemRow(picked.id);
        row.append(discardButton(picked, confirm === picked.uid, () => {
          confirm = picked.uid;
          render();
        }, () => {
          on.set(discardItem(on.get(), picked.uid));
          pick = '';
          confirm = '';
          render();
        }));
        panel.append(row);
      }
    }
    const foot = el('div', 'gr-foot');
    foot.append(
      btn('gr-btn', 'Gear', () => {
        close();
        on.gear();
      }),
      btn('gr-btn primary', left.length ? `Continue (leave ${left.length})` : 'Continue', () => {
        close();
        on.done();
      }),
    );
    panel.append(foot);
  };
  render();
  return close;
}

/** "Discard" düğmesi: Rare ve üstü önce "Confirm discard" ister (madde 280). */
function discardButton(inst: ItemInstance, confirming: boolean, ask: () => void, run: () => void): HTMLButtonElement {
  if (!discardNeedsConfirm(inst)) return btn('gr-btn', 'Discard', run);
  return confirming ? btn('gr-btn danger', 'Confirm discard', run) : btn('gr-btn', 'Discard', ask);
}

/** Ashford teslim kartı (pendingHandover): eski takım item'lerini yeni bölüğe bırakır. */
export function showHandover(root: HTMLElement, s: CampaignState, on: { equip: () => void; later: () => void }): () => void {
  const ho = s.pendingHandover;
  const ids = (ho?.items ?? []).map((u) => s.inventory.find((i) => i.uid === u)?.id ?? findEquipped(s, u)).filter((x): x is string => !!x);
  const from = (ho?.from ?? []).map((f) => className(f.class)).join(', ');
  return smallCard(root, 'Left for the Company', from ? `${from} leave${ho!.from.length > 1 ? '' : 's'} their gear for you` : '', ids, ['Equip it on your new heroes before the road north.'], [
    { label: 'Later', run: on.later },
    { label: 'Equip now', primary: true, run: on.equip },
  ]);
}

function findEquipped(s: CampaignState, uid: string): string | undefined {
  for (const h of s.roster as Hero[]) for (const k of SLOT_IDS) if (h.equipment[k]?.uid === uid) return h.equipment[k]!.id;
  return undefined;
}
