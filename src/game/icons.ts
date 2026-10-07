import Phaser from 'phaser';
import type { SkillDef } from '../engine';
import { GRID, INTERNAL_TOKEN_VALUES, shadeColor } from './pixel-art';
import { resolveSprite } from './art-registry';
import { onVersionsChange, ownerOfSkill } from './asset-versions';

/**
 * Piksel art ikon dokuları. Çizimler src/game/pixel-art.ts motoruyla ızgaralara çizilir (otomatik kontur + ışık/gölge);
 * burada 1:1 Phaser dokusuna çevrilir ve NEAREST filtreyle keskin gösterilir. Sürüm farkında (src/game/art-registry.ts):
 * `owner` verilirse o class'ın seçili sürümü (v1 64x64 / v2 varsayılan 128x128) kullanılır; çağıranlar `setDisplaySize` ile
 * boyut verdiği için yüksek çözünürlüklü doku ekranda aynı yeri kaplar. v1 doku anahtarları değişmedi.
 */
const UNIT = 1;
const FRAME = 6; // çerçeveli skill ikonu (64'lükte): 3 piksel çerçeve + 3 piksel boşluk

const iconKey = (kind: string, hex: string, framed: boolean) => `icon:${kind}:${hex}:${framed ? 'f' : 'n'}`;

const css = (v: number) => `#${v.toString(16).padStart(6, '0')}`;

/**
 * Bir ikon türünün dokusunu (yoksa) üretir ve anahtarını döndürür. `framed`: koyu zemin ve renkli çerçeve (skill ikonu);
 * çerçevesiz: yalnızca sembol (stat, logo, rozet). Bilinmeyen tür düz bir kareye düşer. `owner`: sürüm sahibi (class id ya da
 * 'shared'); verilmezse daima v1.
 */
export function ensureIcon(scene: Phaser.Scene, kind: string, hex: string, framed = true, owner?: string | null): string {
  const art = resolveSprite(kind, owner);
  const key = iconKey(art.key, hex, framed);
  if (owner) {
    versioned.set(key, { kind, hex, framed, owner });
    watch(scene.game);
  }
  if (scene.textures.exists(key)) return key;
  const S = art.size;
  const q = S / GRID;
  const cells =
    art.cells() ?? Array.from({ length: S }, (_, y) => Array.from({ length: S }, (_, x) => ({ t: x > S / 4 - 1 && x < (S * 3) / 4 && y > S / 4 - 1 && y < (S * 3) / 4 ? 'a' : '.', s: 0 })));
  const pal = INTERNAL_TOKEN_VALUES(hex);
  const frame = Math.round(FRAME * q);
  const frameGrid = S + frame * 2;
  const size = framed ? frameGrid : S;
  const tex = scene.textures.createCanvas(key, size * UNIT, size * UNIT);
  if (!tex) return key;
  const ctx = tex.getContext();
  const px = (x: number, y: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * UNIT, y * UNIT, UNIT, UNIT);
  };
  if (framed) {
    const accent = css(pal.a!);
    const cut = Math.round(6 * q); // köşe kesiği
    const border = Math.round(3 * q);
    for (let y = 0; y < frameGrid; y++)
      for (let x = 0; x < frameGrid; x++) {
        const dx = Math.min(x, frameGrid - 1 - x);
        const dy = Math.min(y, frameGrid - 1 - y);
        if (dx + dy < cut) continue;
        if (dx < border || dy < border) px(x, y, accent);
        else px(x, y, '#1a1410', 0.92);
      }
  }
  const off = framed ? frame : 0;
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.t === '.') return;
      const v = pal[cell.t];
      px(x + off, y + off, v === undefined ? '#ff00ff' : css(shadeColor(v, cell.s)));
    });
  });
  ctx.globalAlpha = 1;
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// ---------------------------------------------------------------- canlı sürüm değişimi

/** Sahipli (sürüm farkında) üretilen doku anahtarı -> üretim girdisi: sürüm değişince aynı ikon yeni sürümle yeniden üretilir. */
const versioned = new Map<string, { kind: string; hex: string; framed: boolean; owner: string }>();
let watchedGame: Phaser.Game | null = null;

function watch(game: Phaser.Game | undefined): void {
  if (!game || watchedGame === game) return;
  const first = watchedGame === null;
  watchedGame = game;
  if (first) onVersionsChange(() => refreshAllSceneIcons());
}

/**
 * Sahnedeki (kapların içi dahil) sahipli ikon resimlerini seçili sürüme göre yeniden dokular; ekrandaki boyut korunur. Debug > Versions'ta
 * seçim değişince tüm etkin sahnelerde (takım seçimi kartları, sefer haritası, savaş) kendiliğinden çağrılır. Değişen resim sayısını döner.
 */
export function refreshSceneIcons(scene: Phaser.Scene): number {
  let n = 0;
  const visit = (list: Phaser.GameObjects.GameObject[]): void => {
    for (const o of list) {
      if (o instanceof Phaser.GameObjects.Container) visit(o.list);
      else if (o instanceof Phaser.GameObjects.Image) {
        const meta = versioned.get(o.texture.key);
        if (!meta) continue;
        const key = ensureIcon(scene, meta.kind, meta.hex, meta.framed, meta.owner);
        if (key === o.texture.key) continue;
        const w = o.displayWidth;
        const h = o.displayHeight;
        o.setTexture(key).setDisplaySize(w, h);
        n++;
      }
    }
  };
  visit(scene.children.list);
  return n;
}

function refreshAllSceneIcons(): void {
  for (const s of watchedGame?.scene.getScenes(true) ?? []) {
    try {
      refreshSceneIcons(s);
    } catch (err) {
      console.warn('[art-v2] ikonlar yenilenemedi', err);
    }
  }
}

/** Skill ikonu: skill'in `fx` renginde, çerçeveli; sahibinin (class / çağıran class) seçili sürümüyle. */
export const ensureSkillIcon = (scene: Phaser.Scene, skill: SkillDef): string => ensureIcon(scene, skill.icon, skill.fx, true, ownerOfSkill(skill.id));
