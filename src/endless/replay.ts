// Yarım kalan savaşın kaydı (saf; yalnızca motor). Motor seed'li ve belirleyici: aynı kurulum + aynı seed + aynı eylem sırası = birebir aynı durum.
// Bu yüzden savaşın kendisi değil, yalnızca EYLEM GÜNLÜĞÜ saklanır; devam ederken savaş baştan kurulur ve günlük oynatılır (multiplayer lockstep ile
// aynı ilke). Durum özeti (stateHash) kayıtla karşılaştırılır: tutmazsa (ör. veri değişti) kayıt kullanılmaz, dalga baştan başlar.
//
// Kayda giren yollar: motorun dışarıya açık eylem kapıları useSkill / useGlobal / skipTurn / applyChoice (BattleScene oyuncu ve YZ hamlelerini
// bunlarla yapar; sersemlik pası motorun içinde kendiliğinden olur, kayıt gerekmez). Kapılar savaş NESNESİNDE sarılır (motor kodu değişmez);
// iç içe çağrı (applyChoice -> useSkill -> useGlobal) tek eylem sayılır. Debug araçlarının doğrudan durum değiştirmesi (can ver vb.) kayda girmez.
import type { Battle } from '../engine';
import type { Side } from '../engine/types';
import { fnv1a, stateHash } from '../net/state-hash';

/** Bir eylem: `use` = useSkill(actor, skill, target, slot, board, corpse) (global skill'ler de bu kapıdan geçer), `skip` = skipTurn(). */
export type ReplayAction = { k: 'use'; a: string; s: string; t?: string; slot?: number; b?: Side; c?: string } | { k: 'skip' };

/** Yarım kalan savaş: hangi dalga, hangi seed, eylemler ve son durumun özeti. */
export interface SuspendedBattle {
  wave: number;
  seed: number;
  actions: ReplayAction[];
  /** Kaydedildiği andaki battle.turnsTaken (ekranda "turn T+1"). */
  turn: number;
  /** Kaydedildiği andaki stateHash (devamda doğrulama). */
  hash: string;
  /** Savaş kurulumunun parmak izi (planKey): kurulum değiştiyse (ör. debug kalıntı/item) kayıt kullanılmaz. Eski kayıtta yok. */
  setup?: string;
}

/** Dalga planının parmak izi (takımlar + birim kurulumları + seed): devam ederken aynı savaşın kurulduğunu doğrular. */
export const planKey = (plan: { seed: number; party: string[]; enemies: string[]; units: unknown }): string => fnv1a(JSON.stringify([plan.seed, plan.party, plan.enemies, plan.units]));

export const battleHash = (battle: Battle): string => stateHash(battle);

const useAction = (a: string, s: string, t?: string, slot?: number, b?: Side, c?: string): ReplayAction => ({
  k: 'use',
  a,
  s,
  ...(t !== undefined ? { t } : {}),
  ...(slot !== undefined ? { slot } : {}),
  ...(b !== undefined ? { b } : {}),
  ...(c !== undefined ? { c } : {}),
});

/**
 * Savaşın eylem kapılarını sarar: başarılı her dış eylemden SONRA `onAction(eylem)` çağrılır. Dönen fonksiyon sarmayı kaldırır.
 * Davranış değişmez (aynı argümanlar, aynı sonuç); yalnızca kayıt tutulur.
 */
export function attachRecorder(battle: Battle, onAction: (action: ReplayAction) => void): () => void {
  const orig = { useSkill: battle.useSkill, useGlobal: battle.useGlobal, skipTurn: battle.skipTurn, applyChoice: battle.applyChoice };
  let depth = 0;
  const wrap = <A extends unknown[]>(fn: (...args: A) => ReturnType<Battle['skipTurn']>, toAction: (...args: A) => ReplayAction) =>
    function (this: Battle, ...args: A) {
      depth++;
      try {
        const res = fn.apply(battle, args);
        if (depth === 1 && res.ok) onAction(toAction(...args));
        return res;
      } finally {
        depth--;
      }
    };
  battle.useSkill = wrap(orig.useSkill, (a: string, s: string, t?: string, slot?: number, b?: Side, c?: string) => useAction(a, s, t, slot, b, c));
  battle.useGlobal = wrap(orig.useGlobal, (a: string, s: string, slot?: number) => useAction(a, s, undefined, slot));
  battle.skipTurn = wrap(orig.skipTurn, () => ({ k: 'skip' }));
  battle.applyChoice = wrap(orig.applyChoice, (a, choice) => (choice ? useAction(a, choice.skillId, choice.targetUid, choice.slot, choice.board, choice.corpseUid) : { k: 'skip' }));
  return () => {
    // Örnek üzerindeki sarmalar silinir: prototip yöntemleri yeniden görünür
    for (const k of Object.keys(orig) as Array<keyof typeof orig>) delete (battle as unknown as Record<string, unknown>)[k];
  };
}

/** Günlüğü sırayla oynatır. Herhangi bir eylem geçersizse durur. */
export function replayActions(battle: Battle, actions: ReplayAction[]): { ok: true } | { ok: false; at: number; reason: string } {
  for (let i = 0; i < actions.length; i++) {
    const x = actions[i]!;
    const res = x.k === 'skip' ? battle.skipTurn() : battle.useSkill(x.a, x.s, x.t, x.slot, x.b, x.c);
    if (!res.ok) return { ok: false, at: i, reason: res.reason };
  }
  return { ok: true };
}

/** Günlüğü oynatır ve kayıttaki durum özetiyle karşılaştırır: ikisi de tutarsa devam edilebilir. */
export function restoreBattle(battle: Battle, s: SuspendedBattle): boolean {
  if (!replayActions(battle, s.actions).ok) return false;
  return battle.turnsTaken === s.turn && battleHash(battle) === s.hash;
}

/** Kayıttaki yarım savaş biçimce geçerli mi (bozuk kayıt oyunu çökertmez). */
export function validSuspended(v: unknown): v is SuspendedBattle {
  const s = v as SuspendedBattle;
  if (!s || typeof s !== 'object' || !Number.isFinite(s.wave) || !Number.isFinite(s.seed) || !Number.isFinite(s.turn) || typeof s.hash !== 'string' || !Array.isArray(s.actions)) return false;
  return s.actions.every((a) => a && (a.k === 'skip' || (a.k === 'use' && typeof a.a === 'string' && typeof a.s === 'string')));
}
