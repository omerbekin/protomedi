/**
 * Multiplayer kancaları (yalnızca tipler): sahneler (TeamSelectScene, BattleScene) multiplayer'ı bu dar arayüzden görür;
 * ağ katmanını doğrudan içe aktarmaz. Kancaları src/game/mp-client.ts üretir.
 */
import type { Battle, ChoiceLike } from '../engine';
import type { ResultAction } from './result-screen';

export interface MpResultInfo {
  victory: boolean;
  title?: string;
  subtitle?: string;
}

export interface MpBattleHooks {
  /** Yerel oyuncunun tarafı: kurucu 'party' (sol), katılan 'enemy' (sağ). */
  localSide: 'party' | 'enemy';
  /** Lockstep savaşı (iki tarafta birebir aynı kurulum). */
  battle: Battle;
  /** Yerel hamle (null = pas). Geçerliyse uygulanır ve rakibe gider. */
  submit(choice: ChoiceLike | null): boolean;
  /** Giriş açık mı (bağlantı var, maç sürüyor)? */
  canAct(): boolean;
  /** Rakibin hamlesi uygulandı. Dönen fonksiyon aboneliği bitirir. */
  onRemote(cb: () => void): () => void;
  /** Bağlantı durumu değişti (koptu / geri geldi): giriş kilidi ve "Opponent's turn" yazısı tazelenir. */
  onStatus(cb: () => void): () => void;
  /** Maç savaş dışı bir sebeple bitti (kopma, ayrılma, desync). */
  onEnded(cb: (r: MpResultInfo) => void): () => void;
  /** Savaş sonu (motorun kazananı ya da diğer sebepler) için sonuç bilgisi. */
  result(): MpResultInfo | null;
  resultActions(): ResultAction[];
  /** Sonuç ekranı durum satırı (rakip ayrıldı / bekleniyor / rövanş istiyor). */
  resultStatus(): { text: string; tone: 'info' | 'warn' | 'error' };
  /** Oyuncu adları (boşsa Player 1/2). */
  names(): { local: string; remote: string };
}

export interface MpTeamHooks {
  /** TeamSelectScene tarafı: kurucu 'party', katılan 'enemies'. */
  localSide: 'party' | 'enemies';
  /** Önceki seçim (rövanşta korunur). */
  initial: string[] | null;
  setTeam(cells: string[], ready: boolean): boolean;
  myReady(): boolean;
  opponentReady(): boolean;
  opponentName(): string;
  onChange(cb: () => void): () => void;
}
