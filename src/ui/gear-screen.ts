/**
 * Sefer kuşanma ekranı (Gear) + "Spoils" (loot) kartı + Ashford teslim kartı (madde 280; items.md 5.4). DOM katmanı, ana menünün zarif stili
 * (Cinzel başlık, EB Garamond metin, kor/altın renkler; src/ui/gear.css). Açıkken Phaser girişi kilitli (input-lock).
 * Kurallar saf modüllerde: kuşanma `src/campaign/gear.ts`, karşılaştırma/metin `src/progression/item-text.ts`, primary uyarısı `primaryCheck`.
 * Oyun içi metinler İngilizce.
 */
import './gear.css';
import { activeHeroes, discardItem, discardNeedsConfirm, equipBest, equipItem, heroById, takeLeftover, unequipItem, type CampaignState, type Hero } from '../campaign';
import { content } from '../engine';
import {
  BAG_SIZE,
  PRIMARY_BONUS_NAME,
  RARITY_IDS,
  SLOT_IDS,
  canEquip,
  classWeaponFamilies,
  equipDiff,
  fmtPanel,
  heroPanel,
  itemDef,
  itemLines,
  itemSubtitle,
  itemValue,
  ITEMS,
  primaryCheck,
  rarityDef,
  slotDef,
  type ItemInstance,
  type SlotId,
} from '../progression';
import { wikiFiles } from '../wiki/files';
import { lockInput, unlockInput } from './input-lock';

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

/** Yuva siluetleri (24x24 çizgi; nadirlik rengiyle boyanır). */
const SLOT_SVG: Record<SlotId, string> = {
  weapon: 'M5 19 L15 9 M13 7 L17 3 L21 3 L21 7 L17 11 M4 16 L8 20 M3 21 L5 19',
  helm: 'M4 15 C4 8 8 4 12 4 C16 4 20 8 20 15 L20 19 L15 19 L15 14 L9 14 L9 19 L4 19 Z',
  armor: 'M7 3 L10 5 L14 5 L17 3 L21 7 L18 10 L18 21 L6 21 L6 10 L3 7 Z',
  gloves: 'M7 21 L7 11 L5 7 L7 6 L9 9 L9 4 L11 4 L11 9 L12 3 L14 3 L14 9 L15 4 L17 4 L17 13 L15 21 Z',
  boots: 'M7 3 L13 3 L13 14 L20 16 L21 20 L5 20 L5 14 Z',
  trinket: 'M12 3 L12 8 M8 6 C8 4 16 4 16 6 M12 9 A6 6 0 1 0 12.01 9 Z M12 12 L12 18 M9 15 L15 15',
};

function slotIcon(slot: SlotId, color: string, size = 1): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'gr-svg');
  svg.style.setProperty('--sz', String(size));
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', SLOT_SVG[slot]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', '1.6');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
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

type Selection = { kind: 'bag'; uid: string } | { kind: 'slot'; slot: SlotId } | null;

/** Gear ekranı: sol kahramanlar, orta 6 yuva + statlar, sağ torba (30) + seçilen item kartı. */
export function openGearScreen(root: HTMLElement, o: GearOptions): () => void {
  const overlay = el('div', 'gr-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Gear');
  const panel = el('div', 'gr-panel');
  overlay.append(panel);
  root.append(overlay);
  lockInput('gear');
  let heroId = o.hero ?? activeHeroes(o.get())[0]?.id ?? o.get().roster[0]?.id ?? '';
  let sel: Selection = null;
  let usableOnly = false;
  /** Rare+ atma onayı bekleyen item (uid). */
  let confirmDiscard = '';

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
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

  const apply = (fn: (s: CampaignState) => CampaignState): void => {
    try {
      o.set(fn(o.get()));
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err));
    }
    render();
  };
  let flashText = '';
  const flash = (t: string): void => {
    flashText = t;
  };

  function render(): void {
    const s = o.get();
    const hero = heroById(s, heroId) ?? activeHeroes(s)[0];
    panel.replaceChildren();
    // Başlık
    const head = el('div', 'gr-head');
    head.append(el('div', 'gr-title', 'Gear'), el('div', 'gr-gold', `${s.gold} gold`));
    panel.append(head);
    if (o.tutorial)
      panel.append(el('div', 'gr-hint', 'Your escort left their gear for the new company. Tap an item in the bag, then Equip, or let Equip best choose.'));
    const body = el('div', 'gr-body');
    panel.append(body);

    // --- Sol: kahramanlar
    const heroes = el('div', 'gr-heroes');
    const list = [...activeHeroes(s), ...s.roster.filter((h) => !s.active.includes(h.id))];
    for (const h of list) {
      const card = btn(`gr-hero${hero && h.id === hero.id ? ' on' : ''}`, '', () => {
        heroId = h.id;
        sel = null;
        render();
      });
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
      cell.append(slotIcon(k, inst ? rarityColor(inst) : '#6b5a40', 1.3));
      const txt = el('div', 'gr-slot-text');
      txt.append(el('div', 'gr-slot-name', d ? d.name : slotDef(k).name), el('div', 'gr-slot-sub', d ? itemLines(d).join(', ') : 'Empty'));
      cell.append(txt);
      slots.append(cell);
    }
    mid.append(slots);
    // Stat paneli (seçili torba item'i için fark)
    const bagUid = sel?.kind === 'bag' ? sel.uid : '';
    const candidate = bagUid ? s.inventory.find((i) => i.uid === bagUid) : undefined;
    const usableCandidate = candidate && itemDef(candidate.id) && canEquip(hero.class, itemDef(candidate.id)!) ? candidate : undefined;
    const diff = new Map((usableCandidate ? equipDiff(hero, usableCandidate) : []).map((x) => [x.id, x.delta]));
    const stats = el('div', 'gr-stats');
    for (const p of heroPanel(hero)) {
      const row = el('div', 'gr-stat');
      const dv = diff.get(p.id);
      row.append(el('span', 'gr-stat-k', p.label), el('span', 'gr-stat-v', fmtPanel(p)));
      if (dv) row.append(el('span', `gr-stat-d ${dv > 0 ? 'up' : 'down'}`, `${dv > 0 ? '+' : ''}${fmtPanel({ value: dv, fmt: p.fmt })}`));
      stats.append(row);
    }
    mid.append(stats);
    body.append(mid);

    // --- Sağ: torba
    const right = el('div', 'gr-right');
    const bagHead = el('div', 'gr-bag-head');
    bagHead.append(
      el('div', 'gr-sec', `Bag ${s.inventory.length} / ${BAG_SIZE}`),
      btn(`gr-chip${usableOnly ? ' on' : ''}`, usableOnly ? `Usable by ${className(hero.class)}` : 'All items', () => {
        usableOnly = !usableOnly;
        render();
      }),
    );
    right.append(bagHead);
    const grid = el('div', 'gr-bag');
    const items = [...s.inventory]
      .filter((i) => !usableOnly || (itemDef(i.id) && canEquip(hero.class, itemDef(i.id)!)))
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
      const cell = btn(`gr-item${on ? ' on' : ''}${usable ? '' : ' no'}`, '', () => {
        sel = { kind: 'bag', uid: inst.uid };
        confirmDiscard = '';
        render();
      });
      cell.title = d.name;
      cell.style.setProperty('--rc', rarityDef(d.rarity).color);
      cell.append(slotIcon(d.slot, rarityDef(d.rarity).color));
      grid.append(cell);
    }
    for (let i = items.length; i < BAG_SIZE && !usableOnly; i++) grid.append(el('div', 'gr-item empty'));
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
      for (const l of itemLines(selDef)) lines.append(el('div', '', l));
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
              apply((x) => equipItem(x, hero.id, selInst.uid));
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
            apply((x) => discardItem(x, selInst.uid));
          }),
        );
        if (discardNeedsConfirm(selInst) && confirmDiscard === selInst.uid) card.append(el('div', 'gr-card-warn', `Discard ${selDef.name}? It is gone for good.`));
      } else if (sel?.kind === 'slot') {
        actions.append(
          btn('gr-btn', 'Unequip', () => {
            const slot = sel?.kind === 'slot' ? sel.slot : undefined;
            if (!slot) return;
            sel = null;
            apply((x) => unequipItem(x, hero.id, slot));
          }),
        );
      }
      card.append(actions);
    } else card.append(el('div', 'gr-card-empty', s.inventory.length ? 'Tap an item to see it here.' : 'The bag is empty. Victories and chests bring new gear.'));
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
        apply((x) => equipBest(x, [hero.id]));
      }),
      btn('gr-btn', 'Equip best: all', () => {
        sel = null;
        apply((x) => equipBest(x));
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

/** Tek item satırı (Spoils / teslim kartları). `gone`: geride kalan (soluk). */
function itemRow(id: string, gone = false): HTMLDivElement {
  const d = itemDef(id)!;
  const row = el('div', `gr-mini-row${gone ? ' gone' : ''}`);
  row.append(slotIcon(d.slot, gone ? '#6b5a40' : rarityDef(d.rarity).color, 0.9));
  const t = el('div', 'gr-mini-text');
  const n = el('div', 'gr-mini-name', d.name);
  if (!gone) n.style.color = rarityDef(d.rarity).color;
  t.append(n, el('div', 'gr-mini-lines', `${itemSubtitle(d)} · ${itemLines(d).join(', ')}`));
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
        cell.append(slotIcon(d.slot, rarityDef(d.rarity).color));
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
