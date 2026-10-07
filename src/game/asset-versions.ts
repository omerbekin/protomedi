/**
 * Görsel-işitsel SÜRÜM seçimi (Ömer isteği: tüm karakterlerin ses, ikon ve skill animasyonları yeniden tasarlanıyor; eskiler korunur,
 * debug > Versions sekmesinden KARAKTER BAZINDA v1 / v2 seçilip karşılaştırılır).
 *
 *  - `v1` = mevcut içerik (pixel-icons.ts, pixel-fx.ts, vfx.ts, data/audio.json). DOKUNULMAZ ve varsayılandır.
 *  - `v2` = yeni tasarım: src/game/art-v2/<classId>/icons.ts, src/game/art-v2/<classId>/vfx.ts, data/audio-v2/<classId>.json.
 *
 * Seçim class başınadır (anahtar = class id; ortak öğeler için `shared`): o class'ın skill ikonları, pasif/logo ikonu, skill
 * vfx'leri ve sesleri seçili sürüme göre çözülür. Çağrılar sahibinin sürümünü izler (Skeleton -> Undead, Treant -> Druid).
 * v2'de karşılığı henüz olmayan öğe v1'e düşer (karışık sürüm çökmez). Seçim localStorage'da (`proto.assetVersions`), bozuk/erişilemez
 * depolamada varsayılan v1. Phaser'a ve DOM'a bağımlı değildir (window yalnızca varsa kullanılır; testlenebilir).
 */
import { content } from '../engine';

export type AssetVersion = 'v1' | 'v2';
export const ASSET_VERSIONS: readonly AssetVersion[] = ['v1', 'v2'];
export const DEFAULT_VERSION: AssetVersion = 'v1';

/** Ortak/global öğelerin sürüm anahtarı (Rest/Skip/Move ikon+sesleri, durum rozetleri). */
export const SHARED_KEY = 'shared';

export type ArtKind = 'icon' | 'vfx' | 'sfx';

/** Yeniden tasarım kapsamı dışındaki class'lar (Ömer: Cutthroat tamamen kapsam dışı). Sürüm seçicide görünmez, hep v1. */
export const VERSION_EXCLUDED: readonly string[] = ['cutthroat'];

/** Kapsamı kısıtlı anahtarlar: yalnızca listelenen türler v2 olabilir (Defender: skill ikonları ve animasyonları kapsam dışı, sesleri kapsamda). */
export const V2_SCOPE: Readonly<Record<string, readonly ArtKind[]>> = { defender: ['sfx'], [SHARED_KEY]: ['icon', 'sfx'] };

/**
 * Skill verisinde görünmeyen ama koddan çalan sesler (sahibine göre). summonFx/corpseDrainFx (src/game/vfx.ts) ve global eylemler
 * (BattleScene: Rest 'gasp', Skip 'fistWhoosh', Move 'armorRun'). Bu sesler de sahibinin v2 ses dosyasından çözülebilir.
 */
export const CODE_SFX: Readonly<Record<string, readonly string[]>> = {
  undead: ['soulDrain', 'earthCrack', 'graveMoan', 'boneClatter', 'thud'],
  druid: ['woodCreak', 'thud'],
  [SHARED_KEY]: ['gasp', 'fistWhoosh', 'armorRun'],
};

export const VERSIONS_STORAGE_KEY = 'proto.assetVersions';

// ---------------------------------------------------------------- sahiplik (hangi öğe hangi class'ın)

const summonerMemo = new Map<string, string>();
/** Çağrı birimi -> onu çağıran class (summon etkisi olan skill'in sahibi). */
function summonerOf(unitId: string): string | null {
  if (summonerMemo.size === 0)
    for (const c of Object.values(content.classes))
      for (const sid of c.skills)
        for (const ef of content.skills[sid]?.effects ?? []) if (ef.type === 'summon' && !summonerMemo.has(ef.unit)) summonerMemo.set(ef.unit, c.id);
  return summonerMemo.get(unitId) ?? null;
}

/** Birimin (class ya da çağrı) sürüm sahibi: class'ın kendisi, çağrıda çağıran class. Bilinmeyen birimde null. */
export function ownerOfUnit(defId: string | null | undefined): string | null {
  if (!defId) return null;
  const id = defId.replace(/^enemy_/, '');
  if (content.classes[id]) return id;
  if (content.summons[id]) return summonerOf(id);
  return null;
}

/** Skill'in sürüm sahibi: skill'i taşıyan class (çağrı skill'inde çağıran class). Global eylem/bilinmeyen skill'de null. */
export function ownerOfSkill(skillId: string | null | undefined): string | null {
  if (!skillId) return null;
  for (const c of Object.values(content.classes)) if (c.skills.includes(skillId)) return c.id;
  for (const s of Object.values(content.summons)) if (s.skills.includes(skillId)) return summonerOf(s.id);
  return null;
}

const logoMemo = new Map<string, string | null>();
/**
 * Class logosunun (ya da çağrı logosunun) sürüm sahibi: adı yalnızca TEK bir sahibin logosuysa o sahip, yoksa null. Sahipsiz çağrılan
 * DOM ikonları (debug düğmeleri, takım listeleri) logoyu bu sayede seçili sürümle çizer.
 */
export function ownerOfLogo(icon: string | null | undefined): string | null {
  if (!icon) return null;
  if (logoMemo.size === 0) {
    const seen = new Map<string, Set<string>>();
    for (const u of [...Object.values(content.classes), ...Object.values(content.summons)]) {
      const owner = ownerOfUnit(u.id);
      if (owner) seen.set(u.logo, new Set([...(seen.get(u.logo) ?? []), owner]));
    }
    for (const [name, owners] of seen) logoMemo.set(name, owners.size === 1 ? [...owners][0]! : null);
  }
  return logoMemo.get(icon) ?? null;
}

const statusOwnerMemo = new Map<string, string | null>();
/**
 * Durumun "sahibi" (rozet sürümü için): durumu yalnızca TEK bir class'ın (ve çağrılarının) skill'leri uyguluyorsa o class (ör. Omen, Wither,
 * Jinxed -> Hexer; Dark Bond -> Undead); birden çok class'ın uyguladığı ortak durumlarda (Stun, Slow...) ve hiç uygulanmayanda null (= Shared).
 */
export function statusOwner(statusId: string): string | null {
  if (statusOwnerMemo.size === 0) {
    const users = new Map<string, Set<string>>();
    for (const s of Object.values(content.skills)) {
      const owner = ownerOfSkill(s.id);
      if (!owner) continue;
      for (const ef of s.effects) {
        const e = ef as { type: string; status?: string; options?: Array<{ status: string }> };
        const ids =
          e.type === 'status' || e.type === 'dot' || e.type === 'detonate' ? [e.status] : e.type === 'omen' ? [e.status ?? 'omen'] : e.type === 'bond' ? [e.status ?? 'dark_bond'] : e.type === 'randomStatus' ? (e.options ?? []).map((o) => o.status) : [];
        for (const id of ids) if (id) users.set(id, new Set([...(users.get(id) ?? []), owner]));
      }
    }
    for (const id of Object.keys(content.statuses)) {
      const set = users.get(id);
      statusOwnerMemo.set(id, set && set.size === 1 ? [...set][0]! : null);
    }
  }
  return statusOwnerMemo.get(statusId) ?? null;
}

/** Bir sahibin (class ya da shared) sürümlenen öğeleri. vfx anahtarı = skill'in `vfx` adı (vfx'siz skill'de skill id'si). */
export interface OwnedArt {
  icons: string[];
  /** skill id -> vfx anahtarı (skill.vfx ?? skill.id). */
  vfx: Array<{ skillId: string; key: string }>;
  sfx: string[];
}

const ownedMemo = new Map<string, OwnedArt>();
export function ownedArt(owner: string): OwnedArt {
  const hit = ownedMemo.get(owner);
  if (hit) return hit;
  const icons = new Set<string>();
  const sfx = new Set<string>();
  const vfx: OwnedArt['vfx'] = [];
  if (owner === SHARED_KEY) {
    for (const g of Object.values(content.globalSkills)) if (g.icon) icons.add(g.icon);
    for (const st of Object.values(content.statuses)) if (st.icon) icons.add(st.icon);
  } else {
    const units = [content.classes[owner], ...Object.values(content.summons).filter((s) => summonerOf(s.id) === owner)].filter((u) => !!u);
    for (const u of units) {
      icons.add(u.logo);
      if (u.passive?.icon) icons.add(u.passive.icon);
      for (const sid of u.skills) {
        const s = content.skills[sid];
        if (!s) continue;
        icons.add(s.icon);
        vfx.push({ skillId: sid, key: s.vfx ?? sid });
        for (const id of s.sfx ?? []) sfx.add(id);
      }
    }
  }
  for (const id of CODE_SFX[owner] ?? []) sfx.add(id);
  const out: OwnedArt = { icons: [...icons], vfx, sfx: [...sfx] };
  ownedMemo.set(owner, out);
  return out;
}

/** Sürüm seçicide görünen anahtarlar: kapsamdaki tüm class'lar (veri sırasıyla) + `shared`. */
export function versionKeys(): string[] {
  return [...Object.keys(content.classes).filter((id) => !VERSION_EXCLUDED.includes(id)), SHARED_KEY];
}

/** Bu anahtarın bu öğe türü için v2'si olabilir mi (kapsam). */
export function inScope(owner: string, kind: ArtKind): boolean {
  if (VERSION_EXCLUDED.includes(owner)) return false;
  const scope = V2_SCOPE[owner];
  return !scope || scope.includes(kind);
}

// ---------------------------------------------------------------- seçim durumu

type Listener = () => void;
const listeners = new Set<Listener>();
let state: Record<string, AssetVersion> | null = null;

const isVersion = (v: unknown): v is AssetVersion => v === 'v1' || v === 'v2';

function storage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function load(): Record<string, AssetVersion> {
  if (state) return state;
  const out: Record<string, AssetVersion> = {};
  try {
    const raw = storage()?.getItem(VERSIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) for (const [k, v] of Object.entries(parsed)) if (isVersion(v)) out[k] = v;
  } catch {
    /* bozuk JSON / depolama yok: hepsi v1 */
  }
  state = out;
  return out;
}

function save(): void {
  try {
    storage()?.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(load()));
  } catch {
    /* depolama dolu/kapalı: yalnızca bu oturum */
  }
}

const notify = (): void => {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* bir dinleyicinin hatası diğerlerini durdurmasın */
    }
  }
};

/** Anahtarın seçili sürümü (kapsam dışı / bilinmeyen anahtarda v1). */
export function getVersion(key: string | null | undefined): AssetVersion {
  if (!key || VERSION_EXCLUDED.includes(key)) return DEFAULT_VERSION;
  return load()[key] ?? DEFAULT_VERSION;
}

/** Sürüm seçer. `persist` false ise yalnızca bu sayfada geçerli (ör. gallery.html?embed=1&ver=v2). */
export function setVersion(key: string, v: AssetVersion, persist = true): void {
  if (VERSION_EXCLUDED.includes(key) || !isVersion(v)) return;
  const s = load();
  if (v === DEFAULT_VERSION) delete s[key];
  else s[key] = v;
  if (persist) save();
  notify();
}

/** Tüm anahtarları aynı sürüme çeker (debug > Versions > All classes). */
export function setAllVersions(v: AssetVersion, persist = true): void {
  if (!isVersion(v)) return;
  const s = load();
  for (const k of versionKeys()) {
    if (v === DEFAULT_VERSION) delete s[k];
    else s[k] = v;
  }
  if (persist) save();
  notify();
}

/** Tüm anahtarların seçimi aynıysa o sürüm, karışıksa 'mixed'. */
export function allVersionsState(): AssetVersion | 'mixed' {
  const vs = new Set(versionKeys().map((k) => getVersion(k)));
  return vs.size === 1 ? [...vs][0]! : 'mixed';
}

/** Sahibin `kind` türü için v2 seçili ve kapsamda mı. */
export function wantsV2(owner: string | null | undefined, kind: ArtKind): boolean {
  return !!owner && inScope(owner, kind) && getVersion(owner) === 'v2';
}

/** Seçim değişince çağrılır; dönen fonksiyon aboneliği kaldırır. */
export function onVersionsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Testler ve başka sekmedeki değişiklik için: bellekteki seçimi atar, depodan yeniden okur. */
export function reloadVersions(): void {
  state = null;
  notify();
}

// Başka sekmede (ör. wiki'nin gömülü sahnesi ya da ikinci pencere) seçim değişirse burada da uygula
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key === VERSIONS_STORAGE_KEY) reloadVersions();
  });
}
