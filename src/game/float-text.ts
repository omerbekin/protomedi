/**
 * Yüzen savaş yazılarının (hasar, şifa, kalkan, MISS, Dodge, pasif/durum yazıları) SAF stil ve yerleşim mantığı (Phaser'sız, test edilebilir).
 * Çizimi combatant-view.ts > floatText yapar. Yeni font dosyası yok: oyunun serif dil ailesinden, rakamları düz (lining) olan
 * Palatino/Book Antiqua öncelikli bir yığın (Georgia'nın eski stil rakamları 3/4/5/7/9'u aşağı sarkıtır, hasar rakamında okunmaz).
 */

export type FloatKind = 'damage' | 'crit' | 'heal' | 'shield' | 'miss' | 'dodge' | 'resource' | 'info';

/** Yüzen yazı için serif yığını (harici font yok). */
export const FLOAT_SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", Georgia, serif';

export interface FloatStyle {
  fontFamily: string;
  fontSize: string;
  fontStyle: 'bold' | 'italic' | 'bold italic';
  color: string;
  stroke: string;
  strokeThickness: number;
  shadow: { offsetX: number; offsetY: number; color: string; blur: number; stroke: boolean; fill: boolean };
  /** Üst ışık: metnin üst kenarı bu renge doğru açılır (taban rengi `color`); null = düz renk. */
  topLight: string | null;
}

/** Rengi beyaza doğru açar (0-1). Hex "#rrggbb". */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (255 - v) * amount);
  };
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** Rengi karartır (0-1). */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** Her tür için tipografi: hasar iri ve kalın, şifa yumuşak yeşil, kalkan mavi-gri, miss soluk italik, dodge beyazımsı italik. */
export function floatStyle(kind: FloatKind, px: number, hex: string): FloatStyle {
  const size = Math.max(14, Math.round(px));
  const base = (over: Partial<FloatStyle>): FloatStyle => ({
    fontFamily: FLOAT_SERIF,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color: hex,
    stroke: '#1b0f08',
    strokeThickness: Math.max(4, Math.round(size / 5)),
    // Tasarım kiti: sert yerine yumuşak, hafif aşağı düşen koyu gölge (parlak arenada da okunur)
    shadow: { offsetX: 0, offsetY: Math.max(2, Math.round(size / 14)), color: 'rgba(0,0,0,0.85)', blur: Math.max(4, Math.round(size / 8)), stroke: true, fill: true },
    topLight: lighten(hex, 0.45),
    ...over,
  });
  switch (kind) {
    case 'damage':
      return base({ stroke: darken(hex, 0.86), strokeThickness: Math.max(5, Math.round(size / 4.2)) });
    case 'crit':
      // Kritik: kor rengi yumuşak dış parıltı (combatant-view arkasına ayrıca kor ışıması koyar)
      return base({ stroke: '#3a1204', strokeThickness: Math.max(6, Math.round(size / 3.8)), topLight: '#fff6c8', shadow: { offsetX: 0, offsetY: 0, color: 'rgba(240,140,40,0.9)', blur: Math.max(10, Math.round(size / 4)), stroke: true, fill: false } });
    case 'heal':
      return base({ stroke: '#0c2a16', topLight: lighten(hex, 0.55) });
    case 'shield':
      return base({ stroke: '#0e1a24', topLight: lighten(hex, 0.5) });
    case 'miss':
      return base({ fontStyle: 'italic', stroke: '#26200f', strokeThickness: Math.max(3, Math.round(size / 7)), topLight: null });
    case 'dodge':
      return base({ fontStyle: 'bold italic', stroke: '#14222f', strokeThickness: Math.max(3, Math.round(size / 6.5)), topLight: lighten(hex, 0.6) });
    case 'resource':
      return base({ stroke: darken(hex, 0.88), topLight: lighten(hex, 0.4) });
    default:
      return base({ stroke: '#14100a', strokeThickness: Math.max(3, Math.round(size / 6)), topLight: lighten(hex, 0.35) });
  }
}

/** Yüzen yazının toplam ömrü (ms): temel süre + son `fadeMs` solma. Hover önizleme yazıları bunu kullanmaz. */
export function floatTimes(totalMs: number, fadeMs: number): { total: number; fadeDelay: number; fade: number } {
  const fade = Math.min(fadeMs, totalMs);
  return { total: totalMs, fadeDelay: totalMs - fade, fade };
}

/**
 * Aynı hedefte ardışık yazıların yığınlanması: `lanes[i]` i. şeridi tutan yazının punto değeri (boşsa undefined).
 * Yeni yazı ilk boş şeridi alır; şeridin dikey kayması, altındaki şeritlerin (boşsa varsayılan puntoyla) yüksekliğinin toplamıdır.
 */
export function placeFloat(lanes: Array<number | undefined>, defaultPx = 56, spacing = 0.95): { lane: number; offset: number } {
  let lane = lanes.findIndex((l) => l === undefined);
  if (lane < 0) lane = lanes.length;
  let offset = 0;
  for (let i = 0; i < lane; i++) offset += (lanes[i] ?? defaultPx) * spacing;
  return { lane, offset };
}

/** Parçaları (ikon, sayı, ikon...) yan yana ortalar: her parçanın sol x'i (toplam genişlik ortada 0'a göre) ve toplam. */
export function rowLayout(widths: number[], gap: number): { lefts: number[]; total: number } {
  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * gap;
  const lefts: number[] = [];
  let x = -total / 2;
  for (const w of widths) {
    lefts.push(x);
    x += w + gap;
  }
  return { lefts, total };
}

/** Hasar olayı ek alanları (hepsi opsiyonel; motorun damage olayındaki `origin`, `element`, `ground` alanları). */
export interface DamageTags {
  crit?: boolean;
  element?: string;
  /** 'skill' | 'ground' | 'status' | 'self'. */
  origin?: string;
  /** origin 'ground': yer etkisi türü (poison | burning | holy_fire). */
  ground?: string;
  /** origin 'status': hasarı veren durum (wound / bleed / poison / burn), varsa. */
  statusId?: string;
}

export type DamageSourceKind = 'skill' | 'ground' | 'status' | 'self';

export function damageSourceKind(t: DamageTags): DamageSourceKind {
  if (t.origin === 'self') return 'self';
  if (t.origin === 'ground' || t.ground) return 'ground';
  if (t.origin === 'status' || t.statusId) return 'status';
  return 'skill';
}

/** Zemin etkisi -> ikon (data/grounds.json ikonlarıyla aynı). */
const GROUND_ICON: Record<string, string> = { poison: 'poison', burning: 'flame', holy_fire: 'holy' };
/** Durum hasarı -> ikon (kanama/yara = kan damlası). */
const STATUS_ICON: Record<string, string> = { wound: 'drop', bleed: 'drop', poison: 'poison', burn: 'flame', burning: 'flame' };
/** Element -> ikon (fiziksel: ikon yok). Mevcut piksel ikonlar yeniden kullanılır (yeni ikon çizilmez). */
export const ELEMENT_ICON: Record<string, string> = { fire: 'flame', ice: 'blizzard', holy: 'holy', arcane: 'rune', nature: 'leaf', dark: 'skull' };
/** Element ikon renkleri (data/battle-layout.json > colors.element ile uyumlu; zehir yeşil, kan kırmızı). */
export const FLOAT_ICON_TINT: Record<string, string> = { poison: '#6fcf4b', flame: '#ff7a1a', drop: '#c0203a', holy: '#fff0a0', blizzard: '#8fd8ff', rune: '#e05cff', leaf: '#7ed957', skull: '#b36bff', burst: '#ffd23f' };

/** Hasar rakamının yanındaki element/kaynak ikonu (yoksa null: fiziksel ya da bilinmeyen). Önce zemin/durum, sonra element. */
export function damageIconKind(t: DamageTags): string | null {
  const src = damageSourceKind(t);
  if (src === 'self') return null;
  if (src === 'ground') {
    const byGround = t.ground ? GROUND_ICON[t.ground] : undefined;
    if (byGround) return byGround;
  }
  if (src === 'status') {
    const byStatus = t.statusId ? STATUS_ICON[t.statusId] : undefined;
    if (byStatus) return byStatus;
  }
  return t.element ? (ELEMENT_ICON[t.element] ?? null) : null;
}
