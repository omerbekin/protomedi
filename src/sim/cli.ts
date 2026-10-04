// Headless denge simülatörü. Savaş motoru yazılınca burada binlerce savaş koşturulacak.
import { Rng } from '../engine';

const seed = Number(process.argv[2] ?? 1);
const rng = new Rng(seed);
const sample = Array.from({ length: 5 }, () => rng.int(1, 100));

console.log('Proto denge simülatörü');
console.log('----------------------');
console.log('Henüz savaş motoru yok; simüle edilecek savaş bulunmuyor.');
console.log(`Motor Node'da başsız (headless) çalışıyor. Seed ${seed} örnek zarlar: ${sample.join(', ')}`);
