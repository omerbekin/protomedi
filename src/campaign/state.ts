import { classes, defaultSlots, skills, CELL_COUNT } from '../engine/content';
import { CONFIG, getMap } from './data';
import { finalNode, forwardDistances, incoming, node, outgoing } from './graph';
import { rngFor, shuffle } from './seed';
import { emptyEquipment, SLOT_IDS } from '../progression/items';
import { emptyLootState, grantLoot } from './loot';
import type { BattleOutcome, CampaignMap, CampaignMode, Difficulty, CampaignRules, CampaignState, Hero, MapNode, NextStep, StepKind } from './types';

/**
 * Sefer ilerlemesi (saf; durum JSON'dur ve her işlem YENİ bir durum döndürür). Akış: campaign.md 1.2 ve 4.
 * Bir düğümdeki adımlar sırayla tamamlanır (nodeSteps); hepsi bitince yola çıkılır (moveTo). Seçim noktasında
 * seçilen yol kilitlenir: geri dönüş yok, seçilmeyen dallar graftan ulaşılamaz olur (sis 'closed').
 */

export const clone = (s: CampaignState): CampaignState => JSON.parse(JSON.stringify(s)) as CampaignState;
const key = (nodeId: string, kind: StepKind) => `${nodeId}:${kind}`;
export const mapOf = (s: CampaignState): CampaignMap => getMap(s.mapId);

export function newCampaign(o: { mode: CampaignMode; seed: number; mapId?: string; campaignId?: string; difficulty?: Difficulty; slot?: number }): CampaignState {
  const map = getMap(o.mapId ?? CONFIG.maps[0]!);
  return {
    version: 2,
    campaignId: o.campaignId ?? `c-${o.seed}`,
    mode: o.mode,
    difficulty: o.difficulty ?? CONFIG.defaultDifficulty,
    slot: o.slot ?? 0,
    mapId: map.id,
    seed: o.seed,
    roster: [],
    active: Array.from({ length: CELL_COUNT }, () => ''),
    at: map.start,
    path: [map.start],
    done: [],
    tipsSeen: [],
    stats: { victories: 0, defeats: 0 },
    nextHeroId: 1,
    inventory: [],
    gold: 0,
    nextItemId: 1,
    lootState: emptyLootState(),
  };
}

/** Bir düğümün adımları (sırayla). Başlangıç düğümünde önce kahraman seçimi. */
export function nodeSteps(map: CampaignMap, n: MapNode): StepKind[] {
  const steps: StepKind[] = [];
  if (n.id === map.start) steps.push('hero');
  if (n.recruit?.when === 'before') steps.push('recruit');
  if (n.endsTutorial) steps.push('farewell');
  if (n.newCompany) steps.push('company');
  if (n.encounter) steps.push('battle');
  if (n.treasure) steps.push('treasure');
  if (n.event) steps.push('event');
  if (n.type === 'town') steps.push('town');
  if (n.recruit?.when === 'leave') steps.push('volunteer');
  return steps;
}

export const isDone = (s: CampaignState, nodeId: string, kind: StepKind): boolean => s.done.includes(key(nodeId, kind));

/** Düğümün tüm adımları bitti mi? */
export function nodeCleared(s: CampaignState, nodeId: string): boolean {
  const map = mapOf(s);
  return nodeSteps(map, node(map, nodeId)).every((k) => isDone(s, nodeId, k));
}

/** Şu an yapılacak iş. */
export function nextStep(s: CampaignState): NextStep {
  const map = mapOf(s);
  const n = node(map, s.at);
  for (const kind of nodeSteps(map, n)) {
    if (isDone(s, n.id, kind)) continue;
    switch (kind) {
      case 'hero':
        return { kind: 'hero' };
      case 'recruit':
        return { kind: 'recruit', node: n.id, offer: recruitOffer(s, n.id) };
      case 'volunteer':
        return { kind: 'volunteer', node: n.id, offer: recruitOffer(s, n.id) };
      case 'farewell':
        return { kind: 'farewell', node: n.id };
      case 'company':
        return { kind: 'company', node: n.id, size: n.newCompany!.size };
      case 'battle':
        return { kind: 'battle', node: n.id, encounter: n.encounter! };
      case 'treasure':
        return { kind: 'treasure', node: n.id, treasure: n.treasure! };
      case 'event':
        return { kind: 'event', node: n.id, event: n.event! };
      case 'town':
        return { kind: 'town', node: n.id };
    }
  }
  const options = outgoing(map, n.id);
  return options.length ? { kind: 'move', options } : { kind: 'complete' };
}

// ---------------------------------------------------------------- kadro

/** Alan saldırısı olan sınıf mı (skill'lerinden biri bir alanı vuruyor)? */
export function isAreaClass(classId: string): boolean {
  const def = classes[classId];
  return !!def?.skills.some((id) => {
    const t = skills[id]?.target ?? '';
    return t === 'area_enemies' || t === 'area_any';
  });
}

/**
 * Aday kartları (seed'li; aynı sefer + düğüm = aynı adaylar). Kadroda olan sınıflar çıkarılır (aynı sınıftan ikinci karakter yok).
 * `requireArea`: adaylardan en az biri alan saldırılı sınıf.
 */
export function recruitOffer(s: CampaignState, nodeId: string): string[] {
  const map = mapOf(s);
  const def = node(map, nodeId).recruit;
  if (!def) return [];
  const owned = new Set(s.roster.map((h) => h.class));
  const pool = shuffle(CONFIG.recruitPool.filter((c) => !owned.has(c) && classes[c]), rngFor(s.seed, s.mapId, nodeId, 'recruit'));
  const offer = pool.slice(0, def.offer);
  if (def.requireArea && !offer.some(isAreaClass)) {
    const area = pool.slice(def.offer).find(isAreaClass);
    if (area) offer[offer.length - 1] = area;
  }
  return offer;
}

export const heroById = (s: CampaignState, id: string): Hero | undefined => s.roster.find((h) => h.id === id);
export const leaderOf = (s: CampaignState): Hero | undefined => s.roster.find((h) => h.leader) ?? s.roster[0];

/** Aktif takım (dizilimdeki karakterler, yuva sırasıyla). */
export function activeHeroes(s: CampaignState): Hero[] {
  return s.active.filter(Boolean).map((id) => heroById(s, id)).filter((h): h is Hero => !!h);
}

/** Yeni karakteri dizilime koyar: otomatik dizilimin önerdiği hücre boşsa oraya, değilse önden arkaya ilk boş hücreye. */
function place(s: CampaignState, hero: Hero): void {
  const classesNow = [...activeHeroes(s).map((h) => h.class), hero.class];
  const suggested = defaultSlots(classesNow)[classesNow.length - 1] ?? -1;
  const cell = suggested >= 0 && !s.active[suggested] ? suggested : s.active.findIndex((c) => !c);
  if (cell >= 0) s.active[cell] = hero.id;
}

function addHero(s: CampaignState, classId: string, o: { leader?: boolean; tutorial?: boolean } = {}): Hero {
  if (!classes[classId]) throw new Error(`Unknown class: ${classId}`);
  const hero: Hero = {
    id: `h${s.nextHeroId++}`,
    class: classId,
    hpRatio: 1,
    alive: true,
    ...(o.leader ? { leader: true } : {}),
    ...(o.tutorial ? { tutorial: true } : {}),
    level: 1,
    xp: 0,
    equipment: emptyEquipment(),
  };
  s.roster.push(hero);
  place(s, hero);
  return hero;
}

/** Tüm kadroyu otomatik dizilime göre yeniden yerleştirir. */
export function autoFormation(s: CampaignState): CampaignState {
  const t = clone(s);
  t.active = Array.from({ length: CELL_COUNT }, () => '');
  const slots = defaultSlots(t.roster.map((h) => h.class));
  t.roster.forEach((h, i) => {
    const slot = slots[i] ?? -1;
    if (slot >= 0) t.active[slot] = h.id;
  });
  return t;
}

/** Party ekranı: bir karakteri hücreye taşır (hücre doluysa yer değiştirir). */
export function moveHero(s: CampaignState, heroId: string, cell: number): CampaignState {
  const t = clone(s);
  const from = t.active.indexOf(heroId);
  if (from < 0 || cell < 0 || cell >= t.active.length) return s;
  const other = t.active[cell]!;
  t.active[cell] = heroId;
  t.active[from] = other;
  return t;
}

const tutorialActive = (s: CampaignState): boolean => !mapOf(s).nodes.some((n) => n.endsTutorial && isDone(s, n.id, 'farewell'));

function complete(s: CampaignState, kind: StepKind): void {
  const k = key(s.at, kind);
  if (!s.done.includes(k)) s.done.push(k);
}

function expectStep(s: CampaignState, kind: NextStep['kind']): NextStep {
  const step = nextStep(s);
  if (step.kind !== kind) throw new Error(`Expected step ${kind}, current step is ${step.kind}`);
  return step;
}

/** "Choose your hero": tutorial kahramanı (lider). */
export function pickHero(s: CampaignState, classId: string): CampaignState {
  expectStep(s, 'hero');
  if (!CONFIG.starterPool.includes(classId)) throw new Error(`Class not in the starter pool: ${classId}`);
  const t = clone(s);
  addHero(t, classId, { leader: true, tutorial: true });
  complete(t, 'hero');
  return t;
}

/** Aday kartlarından birini seçer (Ravenwood'da önce / Valdren Keep'ten ayrılırken). */
export function recruit(s: CampaignState, classId: string): CampaignState {
  const step = nextStep(s);
  if (step.kind !== 'recruit' && step.kind !== 'volunteer') throw new Error(`No recruit here (step: ${step.kind})`);
  if (!step.offer.includes(classId)) throw new Error(`${classId} is not on offer`);
  const t = clone(s);
  addHero(t, classId, { tutorial: tutorialActive(t) });
  complete(t, step.kind);
  return t;
}

/**
 * Ashford: tutorial takımı veda eder (kadrodan çıkar). Takılı item'leri torbaya düşer: yeni bölük onları takar, item takma tutorial'ı burada
 * başlar (items.md karar 7). Torba sınırı burada uygulanmaz (hiçbir item kaybolmaz; Ömer, madde 278). Teslim anı için `pendingHandover` yazılır.
 */
export function farewell(s: CampaignState): CampaignState {
  expectStep(s, 'farewell');
  const t = clone(s);
  const given: string[] = [];
  const from: Array<{ heroId: string; class: string }> = [];
  for (const h of t.roster.filter((x) => x.tutorial)) {
    let gave = false;
    for (const slot of SLOT_IDS) {
      const it = h.equipment[slot];
      if (it) {
        t.inventory.push(it);
        given.push(it.uid);
        gave = true;
      }
      h.equipment[slot] = null;
    }
    if (gave) from.push({ heroId: h.id, class: h.class });
  }
  // Teslim anı (Aşama 1 arayüzü gösterip onaylatır); item yoksa kayıt yok
  if (given.length) t.pendingHandover = { node: t.at, from, items: given };
  const leaving = new Set(t.roster.filter((h) => h.tutorial).map((h) => h.id));
  t.roster = t.roster.filter((h) => !leaving.has(h.id));
  t.active = t.active.map((id) => (leaving.has(id) ? '' : id));
  complete(t, 'farewell');
  return t;
}

/** Teslim anı görüldü/onaylandı: bekleyen teslim kaydı silinir (item'ler zaten torbada). */
export function acknowledgeHandover(s: CampaignState): CampaignState {
  if (!s.pendingHandover) return s;
  const t = clone(s);
  delete t.pendingHandover;
  return t;
}

/** "Form your company": `size` farklı sınıf, companyPool'dan serbest; ilk seçilen (ya da `leaderIndex`) lider. */
export function formCompany(s: CampaignState, picks: string[], leaderIndex = 0): CampaignState {
  const step = expectStep(s, 'company');
  const size = (step as Extract<NextStep, { kind: 'company' }>).size;
  if (picks.length !== size) throw new Error(`Pick exactly ${size} classes`);
  if (new Set(picks).size !== picks.length) throw new Error('Each class can be picked only once');
  for (const c of picks) if (!CONFIG.companyPool.includes(c)) throw new Error(`Class not in the company pool: ${c}`);
  const t = clone(s);
  picks.forEach((c, i) => addHero(t, c, { leader: i === leaderIndex }));
  const arranged = autoFormation(t);
  complete(arranged, 'company');
  return arranged;
}

/** Tek tıkla biten adımlar: olay, hazine, kasaba (Leave). */
export function completeSimple(s: CampaignState, kind: 'event' | 'treasure' | 'town'): CampaignState {
  expectStep(s, kind);
  const t = clone(s);
  // Hazine sandığı (saf hazine ya da korunan hazine): loot torbaya (items.md 3.1)
  if (kind === 'treasure') grantLoot(t, t.at, 'treasure', activeHeroes(t));
  complete(t, kind);
  return t;
}

// ---------------------------------------------------------------- can

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Savaş sonucu (campaign.md 5.1): zaferde hayatta kalanlar maks canın `victoryHeal` kadarını geri alır, düşenler `reviveRatio` ile kalkar;
 * boss zaferinde (type boss) herkes tam can. Savaşa girmeyenler değişmez. Yenilgide durum yalnızca sayaç olarak değişir (çağıran son kaydı yükler).
 */
/** Seferin zorluğuna göre geçerli kurallar: campaign.json > rules + difficulties[x].rules üstüne yazımları. */
export function rulesFor(s: Pick<CampaignState, 'difficulty'>): CampaignRules {
  return { ...CONFIG.rules, ...(CONFIG.difficulties[s.difficulty]?.rules ?? {}) };
}

export function applyBattle(s: CampaignState, outcome: BattleOutcome, rules: CampaignRules = rulesFor(s)): CampaignState {
  const t = clone(s);
  if (!outcome.victory) {
    t.stats.defeats++;
    return t;
  }
  expectStep(t, 'battle');
  const boss = node(mapOf(t), t.at).type === 'boss';
  for (const u of outcome.units) {
    const h = heroById(t, u.heroId);
    if (!h) continue;
    if (boss) h.hpRatio = rules.bossVictoryHeal;
    else if (u.alive && u.hpRatio > 0) h.hpRatio = clamp01(u.hpRatio + rules.victoryHeal);
    else h.hpRatio = clamp01(rules.reviveRatio);
    h.hpRatio = Math.round(clamp01(h.hpRatio) * 1000) / 1000;
    h.alive = true;
  }
  t.stats.victories++;
  // Zafer loot'u (items.md 3.1; zorluktan bağımsız, karar 6). Savaşa giren takım = bu sonuçtaki kahramanlar
  const fought = outcome.units.map((u) => heroById(t, u.heroId)).filter((h): h is Hero => !!h);
  const type = node(mapOf(t), t.at).type;
  grantLoot(t, t.at, type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'battle', fought.length ? fought : activeHeroes(t));
  complete(t, 'battle');
  return t;
}

function healAll(s: CampaignState, ratio: number): void {
  for (const h of s.roster) {
    h.hpRatio = Math.max(h.hpRatio, clamp01(ratio));
    h.alive = true;
  }
}

// ---------------------------------------------------------------- hareket

/** Yola çıkar: yalnızca düğüm temizlendiyse ve hedef bir çıkışsa. Varılan kasaba iyileştirir. */
export function moveTo(s: CampaignState, to: string): CampaignState {
  const step = nextStep(s);
  if (step.kind !== 'move' || !step.options.includes(to)) throw new Error(`Cannot move to ${to} now`);
  const t = clone(s);
  t.at = to;
  t.path.push(to);
  const n = node(mapOf(t), to);
  if (n.heal) healAll(t, n.heal);
  return t;
}

/** Takım sınırı: geçilen düğümlerin en büyük `partyCap`'i (ayrılırken katılım olan düğümde katılım bitince geçerli). */
export function partyCap(s: CampaignState): number {
  const map = mapOf(s);
  let cap = 0;
  for (const id of s.path) {
    const n = node(map, id);
    if (n.partyCap === undefined) continue;
    if (n.recruit?.when === 'leave' && !isDone(s, id, 'volunteer')) continue;
    cap = Math.max(cap, n.partyCap);
  }
  return cap;
}

/** Durak numarası (1..stopsPerRun). */
export const stopNumber = (s: CampaignState): number => s.path.length;
export const isComplete = (s: CampaignState): boolean => nextStep(s).kind === 'complete';
export const isFinal = (s: CampaignState): boolean => s.at === finalNode(mapOf(s));

/** Bir ipucu bu düğümde gösterilmeli mi (tek seferlik)? */
export function pendingTip(s: CampaignState): string | null {
  const tip = CONFIG.tips[s.at];
  return tip && !s.tipsSeen.includes(s.at) ? tip : null;
}

export function markTipSeen(s: CampaignState): CampaignState {
  if (s.tipsSeen.includes(s.at)) return s;
  const t = clone(s);
  t.tipsSeen.push(s.at);
  return t;
}

// ---------------------------------------------------------------- debug

/** Başlangıçtan `target`'a giden bir yol (ilk bulunan; dallar veri sırasıyla). */
export function pathTo(map: CampaignMap, target: string): string[] {
  const parent = new Map<string, string>();
  const queue = [map.start];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === target) break;
    for (const o of outgoing(map, id))
      if (!seen.has(o)) {
        seen.add(o);
        parent.set(o, id);
        queue.push(o);
      }
  }
  if (!seen.has(target)) throw new Error(`Node ${target} is unreachable`);
  const out = [target];
  while (out[0] !== map.start) out.unshift(parent.get(out[0]!)!);
  return out;
}

/**
 * Debug: düğüme ışınlan. Yol başlangıçtan oraya kurulur, önceki düğümlerin adımları bitmiş sayılır; kadro gerekiyorsa seed'li otomatik
 * seçimlerle doldurulur (kahraman, adaylar, Ashford takımı). Hedef düğümün adımları baştan başlar.
 */
export function debugTeleport(s: CampaignState, target: string): CampaignState {
  const map = mapOf(s);
  let t = newCampaign({ mode: s.mode, seed: s.seed, mapId: s.mapId, campaignId: s.campaignId, difficulty: s.difficulty, slot: s.slot });
  t.stats = { ...s.stats };
  t.tipsSeen = [...s.tipsSeen];
  const route = pathTo(map, target);
  for (let i = 0; i < route.length; i++) {
    const last = i === route.length - 1;
    // Hedef düğümde yalnızca oyuncunun kendisinin yapacağı adımlar kalır; kahraman yoksa otomatik seçilir
    while (true) {
      const step = nextStep(t);
      if (step.kind === 'move' || step.kind === 'complete') break;
      if (last && step.kind !== 'hero') break;
      t = autoResolve(t, step);
    }
    if (!last) t = moveTo(t, route[i + 1]!);
  }
  return t;
}

/** Bir adımı oyuncu yerine (seed'li, ilk seçenekle) çözer: debug ve testler. */
export function autoResolve(s: CampaignState, step: NextStep = nextStep(s)): CampaignState {
  switch (step.kind) {
    case 'hero':
      return pickHero(s, CONFIG.starterPool[rngFor(s.seed, 'auto-hero').int(0, CONFIG.starterPool.length - 1)]!);
    case 'recruit':
    case 'volunteer':
      return recruit(s, step.offer[0]!);
    case 'farewell':
      return farewell(s);
    case 'company':
      return formCompany(s, shuffle(CONFIG.companyPool, rngFor(s.seed, 'auto-company')).slice(0, step.size));
    case 'battle':
      return applyBattle(s, { victory: true, units: activeHeroes(s).map((h) => ({ heroId: h.id, hpRatio: h.hpRatio, alive: true })) });
    case 'treasure':
    case 'event':
    case 'town':
      return completeSimple(s, step.kind);
    default:
      return s;
  }
}

/** Debug: bulunulan düğümün savaşını kazanılmış say (can değişmeden). */
export const debugWinNode = (s: CampaignState): CampaignState => (nextStep(s).kind === 'battle' ? autoResolve(s) : s);

/** Kapanan dalların düğümleri (seçilmeyen yollar). */
export function closedNodes(s: CampaignState): string[] {
  const map = mapOf(s);
  const reach = forwardDistances(map, s.at);
  return map.nodes.filter((n) => !reach.has(n.id) && !s.path.includes(n.id)).map((n) => n.id);
}

/** Birleşme noktası mı (rozet işareti için)? */
export const isMerge = (map: CampaignMap, id: string): boolean => incoming(map, id).length > 1;
