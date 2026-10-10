/**
 * Savaş durum rozetlerinin TELEFON boyutu (Ömer 2026-10-10): rozetler can çubuğunun iki yanında tek sıradır (buff solda, debuff sağda).
 * Telefonda (html.short / html.compact) rozetler `phoneScale` kadar büyür, AMA hiçbir şeyin üstüne binmeyecek kadar: her birim için en büyük
 * boy, rozet sırası diğer birimlerin can/MP çubuklarına, adlarına, gövde çekirdeğine ve başka birimlerin rozetlerine çarpmayana kadar küçültülür;
 * hiç sığmıyorsa masaüstü boyuna (bugünkü düzen) iner. Yüzen yazılar başın üstünde (çubuğun ~36 birim yukarısı) çıktığı, sıra çubuğu ve HUD
 * sahnenin üst / alt kenarında olduğu için tek sıralı rozet onlara ulaşmaz. Saf ve test edilebilir (Phaser'sız).
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BadgeUnit {
  id: string;
  /** Can çubuğunun ortası (sahne koordinatı). */
  x: number;
  barY: number;
  /** Çubuğun yarı genişliği. */
  barHalfW: number;
  /** Soldaki (buff) ve sağdaki (debuff) rozet sayısı. */
  left: number;
  right: number;
  /** Bu birimin, rozetlerin çarpmaması gereken parçaları (ad, çubuk + MP/hız, gövde çekirdeği): diğer birimler için engel; kendi adı ve gövdesi de. */
  parts: Rect[];
  /** `parts` içinde kendi rozetlerinin zaten bitişiğinde olan parça (kendi can çubuğu): kendisi için engel sayılmaz. */
  ownBar: Rect;
}

export interface BadgeLayoutOpts {
  /** Masaüstü (bugünkü) rozet boyu = alt sınır. */
  base: number;
  /** Telefonda hedef boy (base x phoneScale). */
  max: number;
  /** Çubuk ile ilk rozet arası, rozetler arası. */
  gapBar: number;
  gapItem: number;
  /** Engellerle en az bu kadar boşluk. */
  margin: number;
}

const hit = (a: Rect, b: Rect, m: number): boolean => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;

export interface SideSizes {
  left: number;
  right: number;
}

/**
 * Bir taraftaki rozet sırası (dir -1 sol, +1 sağ; `n` rozet, `s` boy). Sıranın ÜST kenarı masaüstü boyundaki yerinde kalır (`base`), büyüyen
 * rozet aşağı doğru uzar: hemen üstteki kendi adına hiç yaklaşmaz. n = 0 -> null.
 */
export function badgeRow(u: Pick<BadgeUnit, 'x' | 'barY' | 'barHalfW'>, dir: -1 | 1, n: number, s: number, gapBar: number, gapItem: number, base = s): Rect | null {
  if (n <= 0) return null;
  const inner = u.barHalfW + gapBar;
  const outer = inner + n * s + (n - 1) * gapItem;
  const xa = u.x + dir * inner;
  const xb = u.x + dir * outer;
  return { x0: Math.min(xa, xb), y0: u.barY - base / 2, x1: Math.max(xa, xb), y1: u.barY - base / 2 + s };
}

/** Birimin iki taraftaki rozet sıraları (boş taraf yok). */
export function badgeRows(u: Pick<BadgeUnit, 'x' | 'barY' | 'barHalfW' | 'left' | 'right'>, sz: SideSizes, gapBar: number, gapItem: number, base: number): Rect[] {
  return [badgeRow(u, -1, u.left, sz.left, gapBar, gapItem, base), badgeRow(u, 1, u.right, sz.right, gapBar, gapItem, base)].filter((r): r is Rect => !!r);
}

/**
 * Her birimin her tarafı için rozet boyu: `max`'tan başlayıp 1 birimlik adımlarla `base`'e kadar, sığan ilk (en büyük) boy; iki taraf ayrı karar
 * verir (bir yanda komşu varsa öbür yan yine büyür). Birimler sırayla yerleşir; henüz yerleşmemiş tarafların rozetleri `base` boyda yer tutar.
 */
export function solveBadgeSizes(units: BadgeUnit[], o: BadgeLayoutOpts): Map<string, SideSizes> {
  const sizes = new Map<string, SideSizes>(units.map((u) => [u.id, { left: o.base, right: o.base }]));
  const rowsOf = (u: BadgeUnit): Rect[] => badgeRows(u, sizes.get(u.id)!, o.gapBar, o.gapItem, o.base);
  for (const u of units) {
    for (const [dir, side] of [[-1, 'left'], [1, 'right']] as const) {
      const n = u[side];
      if (n <= 0) continue;
      const blockers: Rect[] = [];
      for (const v of units) {
        if (v === u) blockers.push(...u.parts.filter((p) => p !== u.ownBar));
        else blockers.push(...v.parts, ...rowsOf(v));
      }
      for (let s = Math.floor(o.max); s >= o.base; s--) {
        const mine = badgeRow(u, dir, n, s, o.gapBar, o.gapItem, o.base)!;
        if (s === o.base || !blockers.some((b) => hit(mine, b, o.margin))) {
          sizes.get(u.id)![side] = s;
          break;
        }
      }
    }
  }
  return sizes;
}
