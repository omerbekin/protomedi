/**
 * Raise Dead'in İKİ ADIMLI seçim durum makinesi (madde 230/231; SAF, Phaser'sız): önce tüketilecek düşman cesedi, sonra çağrı yuvası.
 * Ceset yoksa tek adım (yalnızca yuva). Kural motorda kalır (corpseChoices / summonSlots); burası yalnızca "hangi tıklama ne yapar" akışıdır.
 * BattleScene bu modülün döndürdüğü sonuca göre çizer ve (cast aksiyonunda) `useSkill(uid, skill, undefined, slot, undefined, corpseUid)` çağırır.
 */

/** Motorun `corpseChoices` satırından UI'ın ihtiyacı olan kısım. */
export interface CorpseOption {
  uid: string;
  slot: number;
  name: string;
  danger: number;
  why: string;
}

/** Akış durumu: step 'corpse' = 1. adım (ceset seç); 'slot' = yuva seç (ceset seçildiyse corpseUid dolu). `twoStep` = ceset adımı var mı. */
export interface RaiseFlow {
  step: 'corpse' | 'slot';
  twoStep: boolean;
  corpseUid?: string;
}

/** Akışın girdileri (motordan): seçilebilir cesetler ve çağrı yuvaları. */
export interface RaiseInputs {
  choices: readonly CorpseOption[];
  slots: readonly number[];
}

/** Akışı başlatır: boş yuva yoksa null (skill zaten kullanılamaz); ceset varsa 1. adım, yoksa doğrudan yuva adımı. */
export function startRaiseFlow(inp: RaiseInputs): RaiseFlow | null {
  if (inp.slots.length === 0) return null;
  return inp.choices.length > 0 ? { step: 'corpse', twoStep: true } : { step: 'slot', twoStep: false };
}

export type RaiseResult =
  | { kind: 'state'; flow: RaiseFlow }
  | { kind: 'cast'; slot: number; corpseUid?: string }
  | { kind: 'cancel' }
  | { kind: 'invalid'; reason: string };

/** Bir cesede tıklama: 1. adımda seçilebilirse ceset seçilir ve yuva adımına geçilir; seçili cesede tekrar tık 1. adıma döner; geçersizse neden. */
export function pickCorpse(flow: RaiseFlow, inp: RaiseInputs, uid: string, consumedUids: ReadonlySet<string> = new Set()): RaiseResult {
  if (!flow.twoStep) return { kind: 'invalid', reason: 'No corpse to consume' };
  if (flow.step === 'slot' && flow.corpseUid === uid) return { kind: 'state', flow: { step: 'corpse', twoStep: true } }; // geri al
  if (!inp.choices.some((c) => c.uid === uid)) return { kind: 'invalid', reason: consumedUids.has(uid) ? 'Corpse was consumed' : 'Invalid corpse' };
  return { kind: 'state', flow: { step: 'slot', twoStep: true, corpseUid: uid } };
}

/** Bir yuvaya tıklama: yalnızca yuva adımında ve yuva summonSlots içindeyse cast (ceset seçilmişse onunla). */
export function pickSlot(flow: RaiseFlow, inp: RaiseInputs, slot: number): RaiseResult {
  if (flow.step !== 'slot') return { kind: 'invalid', reason: 'Choose a corpse to consume first' };
  if (!inp.slots.includes(slot)) return { kind: 'invalid', reason: 'That cell is not free' };
  if (flow.twoStep && (!flow.corpseUid || !inp.choices.some((c) => c.uid === flow.corpseUid))) return { kind: 'invalid', reason: 'Invalid corpse' };
  return flow.corpseUid ? { kind: 'cast', slot, corpseUid: flow.corpseUid } : { kind: 'cast', slot };
}

/** Geri (Esc): ceset seçiliyse 1. adıma döner; aksi halde skill seçimi iptal. */
export function backRaiseFlow(flow: RaiseFlow): RaiseResult {
  if (flow.twoStep && flow.step === 'slot') return { kind: 'state', flow: { step: 'corpse', twoStep: true } };
  return { kind: 'cancel' };
}

/**
 * Savaş durumu değişince (ceset tüketildi/diriltildi, yuva doldu) akışı yeniden doğrular: seçili ceset artık seçilemiyorsa 1. adıma düşer,
 * ceset kalmadıysa tek adıma geçer, yuva kalmadıysa null (iptal).
 */
export function reconcileRaiseFlow(flow: RaiseFlow, inp: RaiseInputs): RaiseFlow | null {
  if (inp.slots.length === 0) return null;
  if (inp.choices.length === 0) return { step: 'slot', twoStep: false };
  if (!flow.twoStep) return { step: 'corpse', twoStep: true };
  if (flow.step === 'slot' && !(flow.corpseUid && inp.choices.some((c) => c.uid === flow.corpseUid))) return { step: 'corpse', twoStep: true };
  return flow;
}

/** İpucu şeridi metni (adım numarasıyla). */
export function raiseFlowHint(flow: RaiseFlow, unitName = 'Skeleton'): { step: string; text: string } {
  if (!flow.twoStep) return { step: '', text: `Choose where the ${unitName} rises` };
  if (flow.step === 'corpse') return { step: 'Step 1/2', text: 'Choose a corpse to consume' };
  return { step: 'Step 2/2', text: `Choose where the ${unitName} rises` };
}

/** Tooltip: cesedin üstüne gelince (1. adım). `danger` ve gerekçe motordan; önizleme = seçilirse çıkacak birim. */
export function corpseHoverTip(c: CorpseOption, preview: { unitName: string; hp: number } | null): { title: string; rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> } {
  const rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> = [{ text: c.why, tone: 'muted' }];
  if (preview) rows.push({ text: `Empowered ${preview.unitName} HP ${preview.hp}`, tone: 'good' });
  rows.push({ text: 'Click to choose this corpse', tone: 'info' });
  return { title: `Consume ${c.name}'s corpse (danger ${c.danger})`, rows };
}

/** Tooltip: yuvanın üstüne gelince (2. adım): çağrılacak birim ve (varsa) tüketilecek ceset. `reserved` = ölü dosta ayrılmış yuva. */
export function slotHoverTip(p: { unitName: string; hp: number; empowered: boolean | undefined; corpseName: string | null; row: number; reserved: boolean }): { title: string; rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> } {
  if (p.reserved) return { title: 'Reserved cell', rows: [{ text: 'A fallen ally fell here: the cell is reserved for their resurrection', tone: 'bad' }] };
  const rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> = [];
  if (p.empowered === true) rows.push({ text: `Empowered ${p.unitName} HP ${p.hp}`, tone: 'good' });
  else if (p.empowered === false) rows.push({ text: `Unfed ${p.unitName} HP ${p.hp}`, tone: 'muted' });
  else rows.push({ text: `${p.unitName} HP ${p.hp}`, tone: 'good' });
  if (p.corpseName) rows.push({ text: `Consumes ${p.corpseName}'s corpse`, tone: 'muted' });
  rows.push({ text: `Row ${p.row + 1}${p.row === 0 ? ' (front)' : ''}`, tone: 'muted' });
  rows.push({ text: 'Click to raise it here', tone: 'info' });
  return { title: `Raise ${p.unitName}`, rows };
}

// ---------------------------------------------------------------- Resurrection (madde 257): aynı iki adımlı akış
// Adım 1 = diriltilecek ölü DOST (choices: battle.validTargets ile ölü dostlar; danger/why kullanılmaz), adım 2 = kendi tarafında BOŞ hücre
// (slots: battle.reviveSlots). Cesedin hücresinde canlı birim (ör. Skeleton) olsa da ölü seçilebilir. Aynı fonksiyonlar (startRaiseFlow, pickCorpse,
// pickSlot, backRaiseFlow, reconcileRaiseFlow) kullanılır; yalnızca metinler farklı. Cast: useSkill(uid, skill, corpseUid (= dirilecek dost), slot).

/** Resurrection ipucu şeridi metni. */
export function reviveFlowHint(flow: RaiseFlow, allyName?: string): { step: string; text: string } {
  if (flow.step === 'corpse') return { step: 'Step 1/2', text: 'Choose a fallen ally to revive' };
  return { step: 'Step 2/2', text: `Choose an empty cell where ${allyName ?? 'the ally'} rises` };
}

/** Tooltip: 1. adımda ölü dostun üstüne gelince. `taken`: cesedin hücresinde şu an duran birimin adı (varsa; diriltmeye engel değil). */
export function reviveCorpseTip(p: { name: string; hp: number; mp: number; taken: string | null }): { title: string; rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> } {
  const rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> = [{ text: `Rises with ${p.hp} HP, ${p.mp} MP`, tone: 'good' }];
  if (p.taken) rows.push({ text: `${p.taken} stands on the corpse: you will choose another empty cell`, tone: 'muted' });
  rows.push({ text: 'Click to choose this ally', tone: 'info' });
  return { title: `Revive ${p.name}`, rows };
}

/** Tooltip: 2. adımda boş hücrenin üstüne gelince. `ownCell`: ölünün düştüğü hücre. */
export function reviveSlotTip(p: { name: string; row: number; ownCell: boolean }): { title: string; rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> } {
  const rows: Array<{ text: string; tone: 'info' | 'good' | 'muted' | 'bad' }> = [];
  if (p.ownCell) rows.push({ text: 'Where it fell', tone: 'muted' });
  rows.push({ text: `Row ${p.row + 1}${p.row === 0 ? ' (front)' : ''}`, tone: 'muted' });
  rows.push({ text: 'Click to revive it here', tone: 'info' });
  return { title: `${p.name} rises here`, rows };
}
