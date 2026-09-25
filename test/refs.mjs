import { prepLevel, designCost, windowsAtRisk } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { D, run, checkValid } from './run.mjs';

const RAW = {
  1: () => D().std(2, 0, 2).std(5, 0, 2).led(2, 5, 2).br(2, 0, 4, 2).bd(2, 5, 2).lad(5, 0, 2).ps,
  2: () => D()
    .std(3, 0, 2).std(6, 0, 2).led(3, 6, 2).br(3, 0, 5, 2).std(8, 0, 2).led(6, 8, 2)
    .std(3, 2, 4).std(6, 2, 4).std(8, 2, 4).led(3, 6, 4).br(4, 2, 6, 4).led(6, 8, 4)
    .bd(3, 8, 4).lad(3, 0, 4).lock(3).ps,
  3: () => D()
    .std(2, 0, 3, 'tube', 3).std(4, 0, 3, 'tube', 3).led(2, 4, 3).br(2, 1, 4, 3).std(6, 0, 3, 'tube', 3).led(4, 6, 3).br(4, 1, 6, 3)
    .bd(2, 6, 3).lad(4, 0, 3).lock(4).ps,
  4: () => D()
    .std(3, 0, 3, 'tube', 3).std(4, 0, 3, 'tube', 3).led(3, 4, 3).br(3, 0, 4, 1).br(3, 1, 4, 2).br(3, 2, 4, 3)
    .std(7, 0, 3, 'tube', 3).std(8, 0, 3, 'tube', 3).led(7, 8, 3).br(8, 0, 7, 1).br(8, 1, 7, 2).br(8, 2, 7, 3)
    .led(4, 7, 3).std(3, 3, 4).std(5, 3, 4).std(6, 3, 4).std(8, 3, 4).std(4, 3, 4).std(7, 3, 4).led(3, 8, 4).br(4, 3, 5, 4).br(7, 3, 6, 4)
    .bd(3, 8, 4).lad(3, 0, 4).lock(3).ps,
  5: () => {
    const d = D()
      .std(1, 0, 3, 'tube', 3).std(2, 0, 3, 'tube', 3).led(1, 2, 3).br(1, 0, 2, 1).br(1, 1, 2, 2).br(1, 2, 2, 3)
      .std(7, 0, 3, 'tube', 3).std(8, 0, 3, 'tube', 3).led(7, 8, 3).br(8, 0, 7, 1).br(8, 1, 7, 2).br(8, 2, 7, 3).tie(2, 3).tie(7, 3);
    for (const x of [2, 3]) d.t([x, 2], [x + 1, 2]).t([x, 3], [x + 1, 3]).t([x + 1, 2], [x + 1, 3]).t([x, 2], [x + 1, 3]);
    for (const x of [7, 6]) d.t([x, 2], [x - 1, 2]).t([x, 3], [x - 1, 3]).t([x - 1, 2], [x - 1, 3]).t([x, 2], [x - 1, 3]);
    d.t([4, 2], [5, 2]).t([4, 3], [5, 3]).t([4, 2], [5, 3]);
    return d.bd(3, 7, 3).lad(7, 0, 3).lock(7).ps;
  },
  6: () => D()
    .std(4, 0, 2).br(2, 0, 4, 2).std(2, 0, 2).led(2, 4, 2).tie(4, 2)
    .std(6, 0, 2).br(6, 0, 4, 2).led(4, 6, 2)
    .std(4, 2, 4).br(2, 2, 4, 4).std(2, 2, 4).led(2, 4, 4).std(6, 2, 4).br(6, 2, 4, 4).led(4, 6, 4)
    .std(2, 4, 5).std(4, 4, 5).std(6, 4, 5).led(2, 4, 5).led(4, 6, 5).br(2, 4, 4, 5).br(6, 4, 4, 5).tie(2, 5).tie(6, 5)
    .bd(2, 6, 5).bd(5, 6, 4).lad(6, 0, 4).lad(6, 4, 5).lock(6).ps,
  7: () => D()
    .std(5, 0, 2).br(3, 0, 5, 2).std(3, 0, 2).led(3, 5, 2).std(6, 0, 2).br(8, 0, 6, 2).std(8, 0, 2).led(5, 8, 2)
    .std(3, 2, 4).std(5, 2, 4).br(3, 2, 5, 4).led(3, 5, 4).std(6, 2, 4).std(8, 2, 4).br(8, 2, 6, 4).led(5, 8, 4)
    .std(3, 4, 6).std(5, 4, 6).br(5, 4, 3, 6).led(3, 5, 6).std(6, 4, 6).std(8, 4, 6).br(6, 4, 8, 6).led(5, 8, 6)
    .bd(3, 8, 6).bd(7, 8, 4).lad(8, 0, 4).lad(8, 4, 6).lock(8).ps,
  8: () => D()
    .std(1, 0, 3, 'tube', 3).std(2, 0, 3, 'tube', 3).led(1, 2, 3).br(1, 0, 2, 1).br(1, 1, 2, 2).br(1, 2, 2, 3)
    .std(7, 0, 3, 'tube', 3).std(8, 0, 3, 'tube', 3).led(7, 8, 3).br(8, 0, 7, 1).br(8, 1, 7, 2).br(8, 2, 7, 3)
    .std(5, -2, 1, 'tube', 3).std(5, 1, 3).led(2, 5, 3).led(5, 7, 3).br(2, 3, 3, 2).t([3, 2], [5, 2]).br(5, 2, 7, 3).br(5, 1, 7, 2).t([5, 2], [7, 2])
    .bd(1, 8, 3).lad(8, 0, 3).lock(8).ps,
  9: () => D()
    .std(2, 0, 2).std(4, 0, 2).led(2, 4, 2).br(2, 0, 4, 2).std(6, 0, 2).std(8, 0, 2).led(4, 8, 2).br(8, 0, 6, 2)
    .std(2, 2, 4).std(4, 2, 4).std(6, 2, 4).std(8, 2, 4).led(2, 5, 4).led(5, 8, 4).br(2, 2, 4, 4).br(8, 2, 6, 4)
    .bd(2, 3, 4).bd(3, 5, 4, 'deck').bd(5, 6, 4).bd(6, 8, 4, 'deck').lad(8, 0, 4).lock(8).ps,
  10: () => D()
    .std(3, 0, 3, 'heavy', 3).std(4, 0, 3, 'heavy', 3).led(3, 4, 3).br(3, 0, 4, 1).br(3, 1, 4, 2).br(3, 2, 4, 3)
    .std(7, 0, 3, 'heavy', 3).std(8, 0, 3, 'heavy', 3).led(7, 8, 3).br(8, 0, 7, 1).br(8, 1, 7, 2).br(8, 2, 7, 3)
    .led(4, 7, 3).tie(3, 3).tie(8, 3)
    .std(4, 3, 6, 'heavy', 3).std(7, 3, 6, 'heavy', 3).std(3, 3, 6, 'tube', 3).std(8, 3, 6, 'tube', 3)
    .led(3, 4, 6).led(7, 8, 6).br(3, 3, 4, 6).br(8, 3, 7, 6)
    .t([4, 3], [5, 4]).t([7, 3], [6, 4]).led(4, 7, 4).std(5, 4, 6).std(6, 4, 6).led(4, 7, 6).br(5, 4, 6, 6).br(4, 4, 5, 6)
    .tie(3, 6).tie(8, 6)
    .bd(3, 8, 6, 'deck').bd(7, 8, 3).lad(8, 0, 3).lad(8, 3, 6).lock(8).ps,
  11: () => D()
    .std(5, 0, 2).br(3, 0, 5, 2).std(3, 0, 2).led(3, 6, 2).std(6, 0, 2).br(1, 0, 3, 2).br(8, 0, 6, 2)
    .std(3, 2, 4).std(5, 2, 4).std(6, 2, 4).br(3, 2, 5, 4).led(3, 6, 4).tie(3, 4)
    .std(3, 4, 6).std(5, 4, 6).std(6, 4, 6).br(5, 4, 3, 6).led(3, 6, 6)
    .std(3, 6, 8).std(5, 6, 8).std(6, 6, 8).br(3, 6, 5, 8).led(3, 6, 8).tie(6, 8)
    .bd(3, 6, 8).bd(5, 6, 4).lad(6, 0, 4).lad(6, 4, 8).lock(6).ps,
  12: () => D()
    .std(2, 0, 3, 'heavy', 3).std(3, 0, 3, 'heavy', 3).led(2, 3, 3).br(2, 0, 3, 1).br(2, 1, 3, 2).br(2, 2, 3, 3)
    .std(5, 0, 3, 'heavy', 3).std(6, 0, 3, 'heavy', 3).led(5, 6, 3).br(5, 0, 6, 1).br(5, 1, 6, 2).br(5, 2, 6, 3)
    .std(8, 0, 3, 'heavy', 3).std(9, 0, 3, 'tube', 3).led(8, 9, 3).br(9, 0, 8, 1).br(9, 1, 8, 2).br(9, 2, 8, 3)
    .led(3, 5, 3).led(6, 8, 3).std(4, 0, 3, 'tube', 3).std(7, 0, 3, 'tube', 3)
    .bd(2, 4, 3, 'deck').bd(4, 5, 3).bd(5, 6, 3, 'deck').bd(6, 7, 3, 'deck').bd(7, 9, 3, 'deck').lad(3, 0, 3).lad(8, 0, 3).lad(6, 0, 3).lock(3).lock(8).lock(6).ps,
};

// every reference solution boards up the windows its heavy drops would smash
export const REFS = Object.fromEntries(Object.entries(RAW).map(([id, f]) => [id, () => {
  const L = prepLevel(LEVELS.find(l => l.id === +id));
  return [...f(), ...[...windowsAtRisk(L)].map(i => ({ type: 'protect', a: [i, 0] }))];
}]));

if ((process.argv[1] || '').endsWith('refs.mjs')) {
  const only = process.argv[2] ? +process.argv[2] : null;
  for (const def of LEVELS) {
    if (only && def.id !== only) continue;
    const L = prepLevel(def);
    const ps = REFS[def.id]?.();
    if (!ps) { console.log(def.id, 'no ref'); continue; }
    const v = checkValid(L, ps);
    const t0 = Date.now();
    const r = run(L, ps);
    console.log(String(def.id).padEnd(3), def.name.padEnd(18), v ? 'INVALID ' + v : '', JSON.stringify(r), (Date.now() - t0) + 'ms');
  }
}
