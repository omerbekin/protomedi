import { describe, expect, it, vi } from 'vitest';
import { isInputLocked, lockInput, lockReasons, onInputLockChange, unlockInput } from '../src/ui/input-lock';

describe('giriş kilidi: DOM katmanı (ayarlar / Menu / wiki) açıkken alttaki sahne tıklama almaz', () => {
  it('kilit hemen gelir; son neden kalkınca kısa gecikmeyle açılır (kapatan tıklama sızmaz); nedenler sayılır', () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const off = onInputLockChange((l) => seen.push(l));
    lockInput('settings');
    expect(isInputLocked()).toBe(true);
    lockInput('game-menu');
    unlockInput('settings');
    vi.advanceTimersByTime(200);
    expect(isInputLocked()).toBe(true); // Menu hâlâ açık
    expect(lockReasons()).toEqual(['game-menu']);
    unlockInput('game-menu');
    expect(isInputLocked()).toBe(true); // aynı dokunuşun bırakması için kısa süre kilitli
    vi.advanceTimersByTime(100);
    expect(isInputLocked()).toBe(false);
    expect(seen).toEqual([true, false]);
    // Gecikme sürerken yeniden açılan katman kilidi korur
    lockInput('settings');
    unlockInput('settings');
    lockInput('wiki');
    vi.advanceTimersByTime(100);
    expect(isInputLocked()).toBe(true);
    unlockInput('wiki', 0);
    expect(isInputLocked()).toBe(false);
    off();
    vi.useRealTimers();
  });
});
