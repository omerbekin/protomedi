// Yerel lobi sunucusu denemesi: önce `npm run dev` (http://127.0.0.1:8787). Kullanım: node scripts/smoke.mjs [ws://127.0.0.1:8787]
// Node 22+ gerekir (yerleşik WebSocket). İnternete çıkmaz.
const base = `${process.argv[2] ?? 'ws://127.0.0.1:8787'}/lobby/`;
const ABC = 'ACDEFGHJKMNPQRTUVWXY34679';
const code = Array.from({ length: 6 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (role, id, origin = 'http://localhost:5173') =>
  new Promise((res) => {
    const ws = new WebSocket(`${base}${code}?role=${role}&id=${id}`, { headers: { Origin: origin } });
    const msgs = [];
    ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
    ws.onopen = () => setTimeout(() => res({ ws, msgs }), 200);
    ws.onerror = () => res({ ws, msgs, err: true });
  });
let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) fails++;
};
const H = 'a'.repeat(16), G = 'b'.repeat(16), X = 'c'.repeat(16);
const g0 = await open('guest', G);
await wait(100);
check('kurucusuz katılma reddedilir (no-lobby)', g0.msgs[0]?.code === 'no-lobby');
const h = await open('host', H);
check('kurucu lobi açar', h.msgs[0]?.t === 'welcome' && h.msgs[0].peer === false);
const g = await open('guest', G);
await wait(100);
check('katılan girer, kurucuya haber gider', g.msgs[0]?.peer === true && h.msgs.some((m) => m.t === 'peer' && m.present));
g.ws.send(JSON.stringify({ t: 'signal', data: { hello: 1 } }));
await wait(150);
check('signal eşe aktarılır', h.msgs.some((m) => m.t === 'signal' && m.data?.hello === 1));
h.ws.send(JSON.stringify({ t: 'relay', d: '{"t":"ping","n":1}' }));
await wait(150);
check('röle mesajı eşe aktarılır', g.msgs.some((m) => m.t === 'relay' && m.d === '{"t":"ping","n":1}'));
const x = await open('guest', X);
await wait(100);
check('üçüncü kişi giremez (full)', x.msgs[0]?.code === 'full');
const evil = await open('host', H, 'https://evil.example');
check('izinsiz köken reddedilir', !!evil.err);
h.ws.send('x'.repeat(30000));
await wait(100);
check('büyük mesaj reddedilir', h.msgs.at(-1)?.code === 'bad-request');
g.ws.send(JSON.stringify({ t: 'leave' }));
await wait(200);
const x2 = await open('guest', X);
await wait(100);
check('katılan ayrılınca yer boşalır', x2.msgs[0]?.t === 'welcome');
for (const s of [h, g, x2]) s.ws.close();
console.log(fails ? `${fails} FAIL` : 'All OK');
process.exit(fails ? 1 : 0);
