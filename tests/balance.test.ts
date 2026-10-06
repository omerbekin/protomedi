import { describe, expect, it } from 'vitest';
import { content } from '../src/engine';
import { simulate, winRate } from '../src/sim/simulate';

/**
 * Denge kontrolü: yapay zeka vs yapay zeka, rastgele takımlar. Genel denge ayarı yapıldı (open-questions.md madde 205);
 * eşikler docs/balance.md hedeflerine sıkıştırıldı: her class %40-60, taraf avantajı yok (%45-55).
 */
const RUNS = 3000;
const result = simulate(RUNS, 900001);

describe('sağlamlık (rastgele takımlar, YZ vs YZ)', () => {
  it('iki taraf da yaklaşık eşit kazanıyor (taraf avantajı yok)', () => {
    const party = (result.partyWins / RUNS) * 100;
    expect(party).toBeGreaterThan(45);
    expect(party).toBeLessThan(55);
  });

  it('her class kazanma oranı hedef aralığında (%40-60; docs/balance.md)', () => {
    for (const id of Object.keys(content.classes)) {
      const win = winRate(result.classes.get(id)!);
      expect(win, `${id} %${win.toFixed(1)}`).toBeGreaterThanOrEqual(40);
      expect(win, `${id} %${win.toFixed(1)}`).toBeLessThanOrEqual(60);
    }
  });

  it('yeterince örneklenen kompozisyonlar uç değerde değil (%10-90)', () => {
    for (const [key, c] of result.comps) {
      if (c.games < 60) continue;
      const win = winRate(c);
      expect(win, `${key} %${win.toFixed(1)} (${c.games} savaş)`).toBeGreaterThan(10);
      expect(win, `${key} %${win.toFixed(1)} (${c.games} savaş)`).toBeLessThan(90);
    }
  });

  it('savaşların neredeyse hepsi sonuçlanıyor (bitmeyen < %3)', () => {
    expect((result.draws / RUNS) * 100).toBeLessThan(3);
  });

  it('hiçbir bedelli skill, sınıfının hamlelerinin %60\'ından fazlasını oluşturmuyor', () => {
    for (const [id, s] of result.classes) {
      const total = [...s.skillUses.values()].reduce((a, b) => a + b, 0);
      for (const [skillId, n] of s.skillUses) {
        if ((content.skills[skillId]?.cost.amount ?? 0) === 0) continue; // bedelsiz temel saldırı hariç
        expect((n / total) * 100, `${id} ${skillId}`).toBeLessThan(60);
      }
    }
  });

  it('kalkan savaşın gidişatını belirlemiyor: toplam kalkan, toplam hasarın %15\'inden az', () => {
    let shield = 0;
    let damage = 0;
    for (const s of result.classes.values()) {
      shield += s.shield;
      damage += s.damage;
    }
    expect(shield / damage).toBeLessThan(0.15);
  });

  it('her class en az bir savaşta oynuyor ve hamle yapıyor (hiçbiri hep pas geçmiyor)', () => {
    for (const [id, s] of result.classes) {
      expect(s.moves, id).toBeGreaterThan(0);
      // çağrılan birimler (Treant, iskelet) ön sırada değilse melee kuralı yüzünden çok pas geçebilir; bu yüzden onlar hariç
      if (id in content.summons) continue;
      expect(s.skips / s.moves, id).toBeLessThan(0.5);
    }
  });
});
