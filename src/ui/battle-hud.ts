import './battle-hud.css';

/**
 * SAVAŞ HUD'ı (Ömer 2026-10-09, taslak public/mockups/battle-hud.html?v=2 "Slim bar, sheet rises"): DOM katmanı, oyun biriminde çizilir ve
 * görünür sahneye ölçeklenir (BattleScene `layout` ile verir). İçerik saf veridir (HudModel); tıklamalar geri çağrılarla sahneye gider.
 *  - Alt ince çubuk: sol altta portre, ad, HP/MP (Warrior'da Rage), 4 ana stat ve "◇ All stats"; portreye / stat alanına tıklayınca karakter
 *    sayfası yükselir (Main / Attack / Defense, simge + ad + değer, primary statta kor elmas; pasif ve Lucky Escape); ikinci tık ya da boş yere tık kapatır.
 *  - 4 skill tam ortada, Rest / Skip / Move hemen sağında dikey sütun; skill açıklaması yalnızca üstüne gelinen ya da seçili skill'in üstünde.
 *  - Sıra çubuğu ekranın tam ortasında, şu an oynayan tam ortada (geçmiş solda, sıradakiler sağda).
 *  - Birim kartları: düşman sağ kenarda, dost sol kenarda; her tarafta bir kart sabitlenebilir, hover diğer tarafın sabitini kapatmaz.
 *  - Pasif madalyonu 4 skill'in hemen solunda (Luck primary'de yanında Lucky Escape elması); skill'ler yine tam ortada.
 *  - Sağ alt (Ömer 2026-10-09): koşu boyu etkilerin ikonları yan yana (önce Endless kalıntıları, sonra zorluk / bölüm ölçeği ve
 *    ileride gelecek kalıcı güçlendirmeler; her biri kit tooltip'i) ve tek düğme "Combat log" (yukarı açılan panelde yalnızca günlük).
 *    Panel ikinci tıkla, dışarı tıklayınca ya da Esc ile kapanır. Etki yoksa (Quick Battle) yalnızca Combat log görünür.
 *  - Stat / global / sıra hücresi açıklamaları öğenin hemen üstünde; boş yere gelince açıklama yok.
 */

export interface TipRow {
  text: string;
  color?: string;
}
export interface TipMeta {
  iconUrl?: string;
  text: string;
  color?: string;
}
export interface MiniShapeLike {
  cols: number;
  rows: number;
  cells: Array<{ col: number; row: number; on: boolean; anchor?: boolean; stage?: number; hits?: number }>;
  note?: string;
}
export interface TipContent {
  title: string;
  titleColor?: string;
  iconUrl?: string;
  /** Sağdaki etiket (hedef türü: 'One enemy', 'Passive'...). */
  badge?: string;
  /** Başlığın sağındaki değer (stat tooltip'i). */
  value?: string;
  valueColor?: string;
  meta?: TipMeta[];
  /** Başlığın altında yan yana küçük etiketler (skill: hedef türü · element · Melee / Ranged; src/ui/skill-tags.ts). */
  tags?: Array<{ text: string; color?: string; iconUrl?: string }>;
  rows: TipRow[];
  shape?: MiniShapeLike | null;
}
export interface HudStat {
  kind: string;
  label: string;
  name: string;
  value: string;
  iconUrl: string;
  primary?: boolean;
  /** Değer rengi (ACC / EVA bir durumla düşmüş ya da artmışsa). */
  color?: string;
  tip: TipContent;
}
export interface HudSkill {
  id: string;
  name: string;
  iconUrl: string;
  key: number;
  cost: TipMeta[];
  /** Kalan cooldown (0 = hazır). */
  wait: number;
  enabled: boolean;
  selected: boolean;
  ult: boolean;
  tip: TipContent;
}
export interface HudGlobal {
  id: string;
  name: string;
  iconUrl: string;
  enabled: boolean;
  active: boolean;
  tip: TipContent;
}
export interface HudBar {
  value: number;
  max: number;
  tip: TipContent;
  iconUrl?: string;
}
export interface HudActor {
  uid: string;
  name: string;
  sub: string;
  portraitUrl: string;
  flip: boolean;
  enemy: boolean;
  nameColor?: string;
  hp: HudBar;
  mp: HudBar | null;
  rage: (HudBar & { iconUrl: string }) | null;
  main: HudStat[];
  groups: Array<{ title: string; stats: HudStat[] }>;
  passive: { name: string; text: string; iconUrl: string } | null;
  /** Sayfanın altındaki ek satırlar (Lucky Escape, kalkan, beslenmiş çağrı...). */
  notes: TipRow[];
}
export interface HudQueueCell {
  uid: string;
  avatarUrl: string;
  enemy: boolean;
  flip: boolean;
  state: 'past' | 'now' | 'next';
  tag?: { text: string; color: string };
  tip: TipContent;
}
export interface HudPassive {
  name: string;
  iconUrl: string;
  tip: TipContent;
  /** Luck primary: Lucky Escape (hazır / bu savaşta kullanıldı). */
  lucky: { ready: boolean; tip: TipContent } | null;
}
/** Savaş günlüğü satırının parçası: p / e = dost / düşman adı, sk = skill, dm = sayı, cr = kritik sayı, hl = şifa, ko = düştü, n = not. */
export interface LogPart {
  t: string;
  k?: 'p' | 'e' | 'sk' | 'dm' | 'cr' | 'hl' | 'ko' | 'n';
}
export interface HudLogEntry {
  round: number;
  parts: LogPart[];
}
/** Koşu boyu etki (Endless kalıntısı, sefer zorluk ölçeği; ileride başka sistemler). */
export interface HudEffect {
  name: string;
  text: string;
  iconUrl?: string;
  color?: string;
  /** Başlık grubu ('Relics', 'Enemy scaling'...). */
  group?: string;
}
export interface HudModel {
  actor: HudActor | null;
  passive?: HudPassive | null;
  skills: HudSkill[];
  globals: HudGlobal[];
  turnLabel: string;
}
export interface UnitCard {
  uid: string;
  enemy: boolean;
  name: string;
  nameColor?: string;
  sub: string;
  portraitUrl: string;
  flip: boolean;
  tag?: { text: string; color: string };
  hp: { value: number; max: number };
  mp: { value: number; max: number } | null;
  rage: { value: number; max: number } | null;
  attrs: HudStat[];
  grid: Array<{ iconUrl: string; label: string; value: string; small?: string; color?: string }>;
  effects: Array<{ name: string; color: string; turns: string; text: string }>;
  passive: { name: string; text: string } | null;
  preview: { iconUrl: string; skill: string; hit?: string; amount?: string; note?: string } | null;
}
export interface HudCallbacks {
  onSkill: (id: string) => void;
  onGlobal: (id: string) => void;
  /** Kart sabitleme değişti (sahne hedef parıltısını vb. yenileyebilir). */
  onPinChange?: () => void;
}

type Side = 'party' | 'enemy';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (a: number, b: number) => `${b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0}%`;
const img = (url: string, cls = 'bh-ico', extra = '') => (url ? `<img class="${cls}" src="${url}" alt="" draggable="false" ${extra}>` : '');

/** Kit tooltip'inin iç HTML'i (skill, stat, global, sıra hücresi, bağlam ipuçları). */
export function tipHtml(t: TipContent): string {
  const shape = t.shape ? miniShapeHtml(t.shape) : '';
  return `<div class="bh-tt">${img(t.iconUrl ?? '', 'bh-ico bh-tt-ico')}<span class="bh-tt-name" style="${t.titleColor ? `color:${t.titleColor}` : ''}">${esc(t.title)}</span>${
    t.value !== undefined ? `<span class="bh-tt-v" style="${t.valueColor ? `color:${t.valueColor}` : ''}">${esc(t.value)}</span>` : ''
  }${shape}${t.badge ? `<span class="bh-tag">${esc(t.badge)}</span>` : ''}</div>${
    t.tags && t.tags.length
      ? `<div class="bh-tags">${t.tags.map((g) => `<span style="${g.color ? `color:${g.color}` : ''}">${g.iconUrl ? img(g.iconUrl) : ''}${esc(g.text)}</span>`).join('<i class="bh-tdot"></i>')}</div>`
      : ''
  }${
    t.meta && t.meta.length ? `<div class="bh-meta">${t.meta.map((m) => `<span style="${m.color ? `color:${m.color}` : ''}">${img(m.iconUrl ?? '')}${esc(m.text)}</span>`).join('')}</div>` : ''
  }${t.rows.length ? `<div class="bh-fade"></div><ul class="bh-rows">${t.rows.map((r) => `<li style="${r.color ? `color:${r.color}` : ''}">${esc(r.text)}</li>`).join('')}</ul>` : ''}`;
}

function miniShapeHtml(m: MiniShapeLike): string {
  const cells = m.cells
    .map((c) => `<i class="${c.on ? 'on' : ''} ${c.anchor ? 'an' : ''}" style="grid-column:${c.col + 1};grid-row:${c.row + 1};${c.on && c.stage && c.stage > 1 ? `opacity:${Math.max(0.4, 1 - 0.3 * (c.stage - 1))}` : ''}">${c.hits && c.hits > 1 ? c.hits : ''}</i>`)
    .join('');
  return `<span class="bh-mini" style="grid-template-columns:repeat(${m.cols},11px);grid-template-rows:repeat(${m.rows},11px)">${cells}</span>${m.note ? `<span class="bh-mini-note">${esc(m.note)}</span>` : ''}`;
}

export class BattleHud {
  readonly root: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly turn: HTMLDivElement;
  private readonly turnLbl: HTMLDivElement;
  private readonly actorBox: HTMLDivElement;
  private readonly skillBox: HTMLDivElement;
  private readonly globBox: HTMLDivElement;
  private readonly rightSlot: HTMLDivElement;
  private readonly pasBox: HTMLDivElement;
  private readonly infoBox: HTMLDivElement;
  private readonly logPanel: HTMLDivElement;
  private log: HudLogEntry[] = [];
  private effects: HudEffect[] = [];
  private panel: 'log' | null = null;
  /** Dokunmatik uzun basma (skill açıklaması). */
  private pressTimer = 0;
  private pressFired = false;
  private readonly ftip: HTMLDivElement;
  private readonly ctip: HTMLDivElement;
  private readonly cards: Record<Side, HTMLDivElement>;
  private model: HudModel = { actor: null, skills: [], globals: [], turnLabel: '' };
  private queue: HudQueueCell[] | null = null;
  private testLabel = '';
  private viewW = 1920;
  private open = false;
  private tipEl: HTMLElement | null = null;
  private tipPinned = false;
  private readonly tips = new Map<string, TipContent>();
  private hover: Partial<Record<Side, UnitCard>> = {};
  private pins: Partial<Record<Side, UnitCard>> = {};
  private readonly offDoc: () => void;
  private hidden = false;

  constructor(parent: HTMLElement, private readonly cb: HudCallbacks) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      e.className = cls;
      return e;
    };
    this.root = el('div', 'bh-root');
    this.band = el('div', 'bh-band');
    this.band.innerHTML = '<i class="bh-dia bh-band-dia"></i>';
    this.turn = el('div', 'bh-turn');
    this.turnLbl = el('div', 'bh-turn-lbl');
    this.actorBox = el('div', 'bh-actor');
    this.skillBox = el('div', 'bh-skills');
    this.globBox = el('div', 'bh-globs');
    this.rightSlot = el('div', 'bh-right');
    this.pasBox = el('div', 'bh-pasv');
    this.infoBox = el('div', 'bh-binfo');
    this.logPanel = el('div', 'bh-logp bh-panel bh-corners');
    this.rightSlot.append(this.infoBox, this.logPanel);
    this.ftip = el('div', 'bh-ftip bh-panel');
    this.ctip = el('div', 'bh-ctip bh-panel bh-corners');
    this.cards = { party: el('div', 'bh-card bh-panel bh-corners party'), enemy: el('div', 'bh-card bh-panel bh-corners enemy') };
    this.root.append(this.band, this.turn, this.turnLbl, this.actorBox, this.pasBox, this.skillBox, this.globBox, this.rightSlot, this.cards.party, this.cards.enemy, this.ctip, this.ftip);
    parent.append(this.root);

    // Fare bırakması alttaki Phaser sahnesine gitmesin (Phaser window mouseup'ı dinler, defaultPrevented olanı yok sayar)
    this.root.addEventListener('mouseup', (e) => e.preventDefault());
    this.root.addEventListener('pointerover', (e) => this.onOver(e));
    this.root.addEventListener('pointerout', (e) => this.onOut(e));
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const sk = (e.target as HTMLElement).closest<HTMLElement>('.bh-sk');
      if (!sk) return;
      this.pressFired = false;
      window.clearTimeout(this.pressTimer);
      this.pressTimer = window.setTimeout(() => {
        this.pressFired = true;
        sk.classList.add('tip');
      }, 420);
    });
    const endPress = () => {
      window.clearTimeout(this.pressTimer);
      this.skillBox.querySelectorAll('.bh-sk.tip').forEach((x) => x.classList.remove('tip'));
    };
    this.root.addEventListener('pointerup', endPress);
    this.root.addEventListener('pointercancel', endPress);
    this.root.addEventListener('contextmenu', (e) => (e.target as HTMLElement).closest('.bh-sk') && e.preventDefault());
    // Boş yere (HUD dışına, sahneye) dokunmak açık karakter sayfasını ve günlük / etki panelini kapatır
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (this.open && !(t && this.actorBox.contains(t))) this.setOpen(false);
      if (this.panel && !(t && this.rightSlot.contains(t))) this.setPanel(null);
    };
    document.addEventListener('pointerdown', onDoc, true);
    this.offDoc = () => document.removeEventListener('pointerdown', onDoc, true);
  }

  destroy(): void {
    this.offDoc();
    this.root.remove();
  }

  /** Görünür sahne: CSS sol / üst (px), ölçek (CSS px / oyun birimi), görünür mantıksal genişlik. */
  layout(left: number, top: number, scale: number, viewW: number): void {
    const r = this.root.style;
    r.left = `${left}px`;
    r.top = `${top}px`;
    r.width = `${viewW}px`;
    r.transform = `scale(${scale})`;
    if (viewW !== this.viewW) {
      this.viewW = viewW;
      this.place();
    }
  }

  setHidden(on: boolean): void {
    this.hidden = on;
    this.root.classList.toggle('hidden', on);
    if (on) {
      this.hideTip();
      this.hideContextTip();
      this.setOpen(false);
      this.setPanel(null);
    }
  }

  // ------------------------------------------------------------------ sağ alt: etkiler + Combat log
  /** Savaş günlüğü (en yeni önce). Panel açıksa hemen yenilenir. */
  setLog(entries: HudLogEntry[]): void {
    this.log = entries;
    if (this.panel === 'log') this.renderLog();
  }

  /** Koşu boyu etkiler (kalıntılar, zorluk / bölüm ölçeği, ileride başka sistemler): sağ altta ikon sırası; boşsa yalnızca Combat log. */
  setEffects(list: HudEffect[]): void {
    this.effects = list;
    this.renderInfo();
  }

  /** Esc: açık günlük panelini kapatır; kapattıysa true. */
  closePanels(): boolean {
    if (!this.panel) return false;
    this.setPanel(null);
    return true;
  }

  private setPanel(p: 'log' | null): void {
    this.panel = p;
    if (p === 'log') this.renderLog();
    this.logPanel.classList.toggle('open', p === 'log');
    this.infoBox.querySelector('[data-panel="log"]')?.classList.toggle('open', p === 'log');
    if (p) this.hideTip();
  }

  private renderInfo(): void {
    const icons = this.effects
      .map((e, i) => {
        const tip: TipContent = { title: e.name, ...(e.color ? { titleColor: e.color } : {}), ...(e.iconUrl ? { iconUrl: e.iconUrl } : {}), ...(e.group ? { badge: e.group } : {}), rows: [{ text: e.text }] };
        return `<span class="bh-buff" ${this.reg(`fx:${i}`, tip)} style="${e.color ? `--c:${e.color}` : ''}">${e.iconUrl ? img(e.iconUrl) : '<i class="bh-dia s"></i>'}</span>`;
      })
      .join('');
    this.infoBox.innerHTML = `${icons ? `<div class="bh-buffs">${icons}</div>` : ''}<div class="bh-links"><span class="bh-more bh-plink ${this.panel === 'log' ? 'open' : ''}" data-panel="log">Combat log</span></div>`;
  }

  private renderLog(): void {
    const lines = this.log
      .slice(0, 40)
      .map((e) => `<div class="bh-ln"><span class="r">R${e.round}</span><span>${e.parts.map((p) => (p.k ? `<b class="${p.k}">${esc(p.t)}</b>` : esc(p.t))).join('')}</span></div>`)
      .join('');
    this.logPanel.innerHTML = `<div class="bh-hd"><i class="bh-dia h s"></i>Combat log<span class="bh-hd-r">latest first</span></div><div class="bh-lns">${lines || '<div class="bh-none">Nothing has happened yet.</div>'}</div>`;
  }

  isSheetOpen(): boolean {
    return this.open;
  }

  setOpen(v: boolean): void {
    if (v === this.open) return;
    this.open = v;
    this.actorBox.classList.toggle('open', v);
    this.root.classList.toggle('sheet-open', v);
    if (v) this.hideTip();
  }

  // ------------------------------------------------------------------ alt çubuk

  setModel(m: HudModel): void {
    this.model = m;
    this.tips.clear();
    this.renderActor();
    this.renderSkills();
    this.renderGlobals();
    this.renderTurnLabel();
    this.renderPassive();
    this.renderInfo();
    this.place();
    if (this.tipEl && !this.root.contains(this.tipEl)) this.hideTip();
  }

  /** Rage çubuğunu yeniden çizmeden günceller (savaş animasyonuyla akan değer). */
  setRage(value: number): void {
    const r = this.model.actor?.rage;
    if (!r) return;
    r.value = value;
    const fill = this.actorBox.querySelector<HTMLElement>('.bh-rage i');
    const lab = this.actorBox.querySelector<HTMLElement>('.bh-rage span');
    if (fill) fill.style.width = pct(value, r.max);
    if (lab) lab.textContent = `${Math.round(value)} / ${r.max}`;
  }

  private reg(key: string, t: TipContent): string {
    this.tips.set(key, t);
    return `data-tip="${esc(key)}"`;
  }

  private renderActor(): void {
    const a = this.model.actor;
    const wasOpen = this.open;
    if (!a) {
      this.actorBox.innerHTML = '';
      return;
    }
    const st = (s: HudStat) => `<div class="bh-st ${s.primary ? 'pri' : ''}" ${this.reg(`s:${s.kind}`, s.tip)} style="${s.color ? `color:${s.color}` : ''}">${img(s.iconUrl)}<span class="l">${esc(s.label)}</span><span>${esc(s.value)}</span></div>`;
    const srow = (s: HudStat) => `<div class="bh-srow ${s.primary ? 'pri' : ''}" ${this.reg(`s:${s.kind}`, s.tip)}>${img(s.iconUrl)}<span class="l">${esc(s.name)}${s.primary ? '<i class="bh-pd"></i>' : ''}</span><span class="v" style="${s.color ? `color:${s.color}` : ''}">${esc(s.value)}</span></div>`;
    const bar = (kind: 'hp' | 'mp', b: HudBar) =>
      `<div class="bh-hpmp ${kind}" ${this.reg(`b:${kind}`, b.tip)}><div class="bh-num">${img(b.iconUrl ?? '')}${b.value}<span class="of">/ ${b.max}</span></div><div class="bh-bar ${kind}${a.enemy && kind === 'hp' ? ' en' : ''}"><i style="width:${pct(b.value, b.max)}"></i></div></div>`;
    const rage = a.rage
      ? `<div class="bh-rage" ${this.reg('b:rage', a.rage.tip)}>${img(a.rage.iconUrl)}<div class="bh-bar rage"><i style="width:${pct(a.rage.value, a.rage.max)}"></i><span>${Math.round(a.rage.value)} / ${a.rage.max}</span></div></div>`
      : '';
    const passive = a.passive
      ? `<div class="bh-sheet-sec"><div class="bh-hd"><i class="bh-dia h s"></i>Passive</div><div class="bh-pas">${img(a.passive.iconUrl, 'bh-ico bh-medal')}<div><div class="t">${esc(a.passive.name)}</div><div class="d">${esc(a.passive.text)}</div></div></div></div>`
      : '';
    const notes = a.notes.length ? `<div class="bh-sheet-notes">${a.notes.map((n) => `<div class="bh-note" style="${n.color ? `color:${n.color}` : ''}"><i class="bh-dia s"></i>${esc(n.text)}</div>`).join('')}</div>` : '';
    this.actorBox.innerHTML = `
      <div class="bh-sheet bh-panel bh-corners">
        <div class="bh-sheet-head"><span class="bh-n">${esc(a.name)}</span><span class="bh-m">${esc(a.sub)}</span><span class="bh-k">Character</span></div>
        <div class="bh-cols">${a.groups.map((g, gi) => `${gi ? '<div class="bh-vfade"></div>' : ''}<div class="bh-col"><div class="bh-hd"><i class="bh-dia h s"></i>${esc(g.title)}</div>${g.stats.map(srow).join('')}</div>`).join('')}</div>
        ${passive}${notes}
      </div>
      <div class="bh-opener" data-open="1">
        <div class="bh-pframe${a.enemy ? ' en' : ''}">${img(a.portraitUrl, 'bh-portrait', a.flip ? 'style="transform:scaleX(-1)"' : '')}</div>
        <div class="bh-actor-info">
          <div class="bh-name"><span class="bh-n" style="${a.nameColor ? `color:${a.nameColor}` : ''}">${esc(a.name)}</span><span class="bh-m">${esc(a.sub)}</span></div>
          <div class="bh-hpmp-row">${bar('hp', a.hp)}${a.mp ? bar('mp', a.mp) : ''}</div>
          ${rage}
          <div class="bh-main">${a.main.map(st).join('')}</div>
          <span class="bh-more">All stats</span>
        </div>
      </div>`;
    if (wasOpen) this.actorBox.classList.add('open');
  }

  private renderSkills(): void {
    this.skillBox.innerHTML = this.model.skills
      .map(
        (s) => `<div class="bh-sk ${s.ult ? 'ult' : ''} ${s.wait > 0 ? 'cdn' : ''} ${s.selected ? 'sel' : ''} ${s.enabled ? '' : 'off'}" data-skill="${esc(s.id)}">
          <div class="fr">${img(s.iconUrl)}${s.wait > 0 ? `<span class="cdv">${s.wait}</span>` : ''}<span class="key">${s.key}</span></div>
          <span class="nm">${esc(s.name)}</span>
          <span class="cost">${s.cost.length ? s.cost.map((c) => `<span style="${c.color ? `color:${c.color}` : ''}">${img(c.iconUrl ?? '')}${esc(c.text)}</span>`).join('') : '<span class="free">Free</span>'}</span>
          <div class="bh-sktip bh-panel bh-corners">${tipHtml(s.tip)}</div>
        </div>`,
      )
      .join('');
  }

  private renderGlobals(): void {
    const g = this.model.globals;
    this.globBox.classList.toggle('empty', g.length === 0);
    this.globBox.innerHTML = g.length
      ? `<div class="bh-vfade"></div><div class="bh-gcol">${g
          .map((x) => `<div class="bh-gl ${x.enabled ? '' : 'off'} ${x.active ? 'on' : ''}" data-global="${esc(x.id)}" ${this.reg(`g:${x.id}`, x.tip)}>${img(x.iconUrl)}<span>${esc(x.name)}</span></div>`)
          .join('')}</div>`
      : '';
  }

  /** Pasif madalyonu (4 skill'in solunda) + Luck primary'de Lucky Escape elması. */
  private renderPassive(): void {
    const p = this.model.passive;
    this.pasBox.innerHTML = p
      ? `<div class="bh-medal lg" ${this.reg('p:passive', p.tip)}>${img(p.iconUrl)}</div><span class="bh-pasv-n">Passive</span>${
          p.lucky ? `<span class="bh-lucky ${p.lucky.ready ? '' : 'used'}" ${this.reg('p:lucky', p.lucky.tip)}><i></i></span>` : ''
        }`
      : '';
  }

  private renderTurnLabel(): void {
    const t = this.model.turnLabel;
    this.turnLbl.innerHTML = t ? `<i class="bh-dia s"></i>${esc(t)}<i class="bh-dia s"></i>` : '';
  }

  /** Sıra çubuğu (null = gizli); test modunda hücreler yerine yazı. */
  setQueue(cells: HudQueueCell[] | null, testLabel = ''): void {
    this.queue = cells;
    this.testLabel = testLabel;
    if (testLabel) {
      this.turn.innerHTML = `<div class="bh-test">${esc(testLabel)}</div>`;
    } else if (cells) {
      this.turn.innerHTML = cells
        .map(
          (c, i) =>
            `<div class="bh-cell ${c.enemy ? 'enemy' : ''} ${c.state}" ${this.reg(`q:${i}:${c.uid}`, c.tip)}>${img(c.avatarUrl, 'bh-portrait', c.flip ? 'style="transform:scaleX(-1)"' : '')}${
              c.tag ? `<span class="bh-ctag" style="color:${c.tag.color};border-color:${c.tag.color}">${esc(c.tag.text)}</span>` : ''
            }</div>`,
        )
        .join('');
    } else this.turn.innerHTML = '';
    this.place();
  }

  // ------------------------------------------------------------------ yerleşim (oyun birimi)

  private place(): void {
    const W = this.viewW;
    // Sıra çubuğu: şu anki birim ekranın tam ortasında
    const past = this.queue ? this.queue.filter((c) => c.state === 'past').length : 0;
    const CW = 70;
    const NW = 92;
    const GAP = 10;
    this.turn.style.left = this.testLabel ? `${W / 2}px` : `${W / 2 - NW / 2 - past * (CW + GAP)}px`;
    this.turn.classList.toggle('test', !!this.testLabel);
    this.turnLbl.style.left = `${W / 2}px`;
    // 4 skill tam ortada, global sütun hemen sağında
    const n = Math.max(1, this.model.skills.length);
    const SKW = n * 146 + (n - 1) * 12;
    const sx = W / 2 - (4 * 146 + 3 * 12) / 2 + (4 - n) * 79; // 4'ten az skill (çağrı) yine ortalı
    this.skillBox.style.left = `${sx}px`;
    this.pasBox.style.left = `${sx - 100}px`;
    const gx = sx + SKW + 22;
    this.globBox.style.left = `${gx}px`;
    const rx = gx + 170;
    this.rightSlot.style.left = `${rx}px`;
    this.rightSlot.style.width = `${Math.max(0, W - rx - 28)}px`;
    this.cards.enemy.style.left = `${W - 384 - 40}px`;
  }

  // ------------------------------------------------------------------ birim kartları

  /** Fareyle üstüne gelinen birim (null = bıraktı). Sabitlenmiş kart o tarafta öncelikli; diğer taraf etkilenmez. */
  hoverCard(card: UnitCard | null, side?: Side): void {
    if (card) this.hover[card.enemy ? 'enemy' : 'party'] = card;
    else if (side) delete this.hover[side];
    else this.hover = {};
    this.renderCards();
  }

  /** Birime tıklama: o tarafta kart sabitlenir; aynı birime yeniden tıklamak sabiti kaldırır. true = sabitlendi. */
  togglePin(card: UnitCard): boolean {
    const side: Side = card.enemy ? 'enemy' : 'party';
    const pinned = this.pins[side]?.uid === card.uid;
    if (pinned) delete this.pins[side];
    else this.pins[side] = card;
    this.renderCards();
    this.cb.onPinChange?.();
    return !pinned;
  }

  /** Esc: tüm sabitleri kaldırır; bir şey kaldırıldıysa true. */
  unpinAll(): boolean {
    const had = !!(this.pins.party || this.pins.enemy);
    this.pins = {};
    if (had) {
      this.renderCards();
      this.cb.onPinChange?.();
    }
    return had;
  }

  pinnedUids(): string[] {
    return [this.pins.party?.uid, this.pins.enemy?.uid].filter((u): u is string => !!u);
  }

  /** Açık kartları güncel veriyle yeniden çizer (can, durumlar, önizleme değişti); birim yoksa (null) kart kapanır. */
  refreshCards(build: (uid: string) => UnitCard | null): void {
    for (const side of ['party', 'enemy'] as const) {
      const p = this.pins[side];
      if (p) {
        const c = build(p.uid);
        if (c) this.pins[side] = c;
        else delete this.pins[side];
      }
      const h = this.hover[side];
      if (h) {
        const c = build(h.uid);
        if (c) this.hover[side] = c;
        else delete this.hover[side];
      }
    }
    this.renderCards();
  }

  private renderCards(): void {
    for (const side of ['party', 'enemy'] as const) {
      const el = this.cards[side];
      const card = this.hover[side] ?? this.pins[side];
      if (!card || this.hidden) {
        el.classList.remove('on', 'pin');
        el.dataset['uid'] = '';
        continue;
      }
      const pinned = this.pins[side]?.uid === card.uid;
      const html = this.cardHtml(card, pinned);
      if (el.dataset['html'] !== html) {
        el.innerHTML = html;
        el.dataset['html'] = html;
      }
      el.dataset['uid'] = card.uid;
      el.classList.add('on');
      el.classList.toggle('pin', pinned);
    }
  }

  private cardHtml(c: UnitCard, pinned: boolean): string {
    const attr = c.attrs.map((s) => `<div class="bh-st ${s.primary ? 'pri' : ''}">${img(s.iconUrl)}<span class="l">${esc(s.label)}</span><span>${esc(s.value)}</span></div>`).join('');
    const grid = c.grid.map((g) => `<div class="bh-row">${img(g.iconUrl)}<span class="l">${esc(g.label)}</span><span class="v" style="${g.color ? `color:${g.color}` : ''}">${esc(g.value)}${g.small ? `<small>${esc(g.small)}</small>` : ''}</span></div>`).join('');
    const fx = c.effects.map((e) => `<div class="bh-e" style="--c:${e.color}"><i></i><b>${esc(e.name)}<em>${esc(e.turns)}</em></b><span>${esc(e.text)}</span></div>`).join('');
    const bar = (kind: string, b: { value: number; max: number }, color: string, en = false) =>
      `<div><div class="lab"><span style="color:${color}">${b.value}</span><span class="of">/ ${b.max}</span></div><div class="bh-bar ${kind}${en ? ' en' : ''}"><i style="width:${pct(b.value, b.max)}"></i></div></div>`;
    const pv = c.preview
      ? `<div class="bh-pv">${img(c.preview.iconUrl)}<b>${esc(c.preview.skill)}</b>${c.preview.hit ? `<span class="r">${esc(c.preview.hit)}<em> to hit</em></span>` : ''}${c.preview.amount ? `<span>${esc(c.preview.amount)}</span>` : ''}${c.preview.note ? `<em class="n">${esc(c.preview.note)}</em>` : ''}</div>`
      : '';
    return `<div class="bh-hdr"><div class="bh-cell ${c.enemy ? 'enemy' : ''}">${img(c.portraitUrl, 'bh-portrait', c.flip ? 'style="transform:scaleX(-1)"' : '')}</div>
        <div class="bh-hdr-t"><div class="bh-n" style="${c.nameColor ? `color:${c.nameColor}` : ''}">${esc(c.name)}</div><div class="bh-m">${esc(c.sub)}</div></div>
        <span class="bh-side-tag">${c.tag ? `<b style="color:${c.tag.color}">${esc(c.tag.text)}</b> · ` : ''}${c.enemy ? 'Enemy' : 'Ally'}</span></div>
      <div class="bh-bars">${bar('hp', c.hp, '#f4ede1', c.enemy)}${c.mp ? bar('mp', c.mp, '#9cc4ff') : c.rage ? bar('rage', c.rage, '#ffb35a') : '<div></div>'}</div>
      ${c.mp && c.rage ? `<div class="bh-bars one">${bar('rage', c.rage, '#ffb35a')}</div>` : ''}
      <div class="bh-attrs">${attr}</div>
      <div class="bh-fade"></div><div class="bh-grid">${grid}</div>
      ${fx ? `<div class="bh-sec"><div class="bh-hd"><i class="bh-dia h s"></i>Effects</div><div class="bh-eff">${fx}</div></div>` : ''}
      ${c.passive ? `<div class="bh-sec"><div class="bh-hd"><i class="bh-dia h s"></i>Passive</div><div class="bh-pas-t">${esc(c.passive.name)}</div><div class="bh-pas-d">${esc(c.passive.text)}</div></div>` : ''}
      ${pv}${pinned ? '<div class="bh-hint">Pinned · tap again or Esc to close</div>' : ''}`;
  }

  // ------------------------------------------------------------------ bağlam ipucu (hücre: yürü, ceset, diriltme...)

  /** Hücre / ceset ipuçları: alt çubuğun hemen üstünde, ortada (boş yere gelince gösterilmez). */
  showContextTip(t: TipContent): void {
    this.ctip.innerHTML = tipHtml(t);
    this.ctip.classList.add('on');
    this.root.classList.add('ctx');
  }

  hideContextTip(): void {
    this.ctip.classList.remove('on');
    this.root.classList.remove('ctx');
  }

  // ------------------------------------------------------------------ olaylar

  private onOver(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (t && t !== this.tipEl && !this.tipPinned) this.showTip(t);
  }

  private onOut(e: PointerEvent): void {
    if (e.pointerType === 'touch' || this.tipPinned) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (t && !(e.relatedTarget instanceof Node && t.contains(e.relatedTarget))) this.hideTip();
  }

  private onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.bh-sktip, .bh-logp')) return;
    const pl = target.closest<HTMLElement>('[data-panel]');
    if (pl) {
      this.setPanel(this.panel ? null : 'log');
      return;
    }
    const sk = target.closest<HTMLElement>('[data-skill]');
    if (sk && this.pressFired) {
      this.pressFired = false; // uzun basma yalnızca açıklamayı gösterdi: skill seçilmez
      return;
    }
    if (sk) {
      this.hideTip();
      this.cb.onSkill(sk.dataset['skill']!);
      return;
    }
    const gl = target.closest<HTMLElement>('[data-global]');
    if (gl) {
      this.hideTip();
      this.cb.onGlobal(gl.dataset['global']!);
      return;
    }
    const tp = target.closest<HTMLElement>('[data-tip]');
    const inSheet = !!target.closest('.bh-sheet');
    // Dokunmatik: stata dokununca açıklama açılır / kapanır
    if (tp && (e as PointerEvent).pointerType === 'touch') {
      if (this.tipEl === tp && this.tipPinned) this.hideTip();
      else {
        this.showTip(tp);
        this.tipPinned = true;
      }
    }
    if (inSheet) return;
    if (target.closest('[data-open]')) {
      this.setOpen(!this.open);
      return;
    }
  }

  private showTip(el: HTMLElement): void {
    const t = this.tips.get(el.dataset['tip'] ?? '');
    if (!t) return;
    this.ftip.innerHTML = tipHtml(t);
    this.ftip.classList.add('on');
    // Öğenin hemen üstünde (yer yoksa altında); ölçek: root dönüştürülmüş, offset'ler oyun biriminde
    const rr = this.root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const s = rr.width / Math.max(1, this.root.offsetWidth);
    const ex = (r.left - rr.left) / s;
    const ey = (r.top - rr.top) / s;
    const ew = r.width / s;
    const eh = r.height / s;
    const tw = this.ftip.offsetWidth;
    const th = this.ftip.offsetHeight;
    const side = el.closest('.bh-sheet') ? 'right' : 'above';
    let x = side === 'right' ? ex + ew + 16 : ex + ew / 2 - tw / 2;
    let y = side === 'right' ? ey + eh / 2 - th / 2 : ey - th - 12;
    if (y < 10) y = ey + eh + 12;
    x = Math.max(12, Math.min(this.viewW - tw - 12, x));
    y = Math.max(10, Math.min(1080 - th - 10, y));
    this.ftip.style.left = `${x}px`;
    this.ftip.style.top = `${y}px`;
    this.tipEl = el;
  }

  hideTip(): void {
    this.ftip.classList.remove('on');
    this.tipEl = null;
    this.tipPinned = false;
  }
}
