import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUPS, type GoldenBattle, type GoldenGroup } from './golden/harness';

// Altın kayıt testi (×2 stat ölçeği dönüşümü güvencesi; tests/golden/harness.ts): sabit seed'li savaşlar, kayıtlı olay akışı ve değişmezlerle
// BİREBİR aynı olmalı. Kayıtlar tests/fixtures/golden/ (yeniden yazmak: npx tsx tests/golden/record.ts). Fark çıkarsa ilk farklı satır raporlanır.

const load = (name: string): GoldenGroup => JSON.parse(readFileSync(new URL(`./fixtures/golden/${name}.json`, import.meta.url), 'utf8')) as GoldenGroup;

/** İlk farkı okunur biçimde döndürür (yoksa null). */
function firstDiff(want: GoldenBattle, got: GoldenBattle): string | null {
  for (const part of ['start', 'events', 'end'] as const) {
    const a = want[part];
    const b = got[part];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `${want.id} ${part}[${i}]\n  want: ${a[i]}\n  got:  ${b[i]}`;
  }
  return null;
}

describe('altın kayıtlar (golden records)', () => {
  for (const [name, fn] of Object.entries(GROUPS)) {
    it(`${name}: aynı seed'ler aynı olay akışı ve değişmezler`, () => {
      const want = load(name);
      const got = fn();
      expect(got.battles.length, `${name}: savaş sayısı`).toBe(want.battles.length);
      const diffs: string[] = [];
      want.battles.forEach((w, i) => {
        const d = firstDiff(w, got.battles[i]!);
        if (d) diffs.push(d);
      });
      (want.extra ?? []).forEach((w, i) => {
        if (got.extra?.[i] !== w) diffs.push(`${name} extra[${i}]\n  want: ${w}\n  got:  ${got.extra?.[i]}`);
      });
      expect(diffs.slice(0, 5).join('\n'), `${diffs.length} fark`).toBe('');
    }, 300_000);
  }
});
