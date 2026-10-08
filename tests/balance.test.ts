import { balance } from '../src/sim/simulate';
import { balanceSuite } from './balance-checks';

// Denge testi, 1. seed grubu (bantlar ve kontroller: tests/balance-checks.ts, data/balance.json). 2. grup: balance-b.test.ts.
balanceSuite('grup 1', balance.test.seedGroups[0]!);
