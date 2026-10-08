import { balance } from '../src/sim/simulate';
import { balanceSuite } from './balance-checks';

// Denge testi, 2. seed grubu (ayrı dosya: vitest iki grubu paralel koşar). Kontroller: tests/balance-checks.ts.
balanceSuite('grup 2', balance.test.seedGroups[1]!);
