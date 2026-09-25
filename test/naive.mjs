import { prepLevel } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { D, run, checkValid } from './run.mjs';
const L = (id) => prepLevel(LEVELS.find(l => l.id === id));
const cases = [
  [1, 'unbraced portal', D().std(2, 0, 2).std(5, 0, 2).led(2, 5, 2).bd(2, 5, 2).ps],
  [1, 'three stds unbraced', D().std(2, 0, 2).std(3,0,2).std(5, 0, 2).led(2, 5, 2).bd(2, 5, 2).ps],
  [2, 'unbraced 2 lift', D().std(3, 0, 4).std(6, 0, 4).std(8, 0, 4).led(3, 6, 2).led(6, 8, 2).led(3, 6, 4).led(6, 8, 4).bd(3, 8, 4).ps],
  [2, 'braced bottom only', D().std(3, 0, 4).std(6, 0, 4).std(8, 0, 4).led(3, 6, 2).led(6, 8, 2).br(3,0,5,2).led(3, 6, 4).led(6, 8, 4).bd(3, 8, 4).ps],
  [2, 'tied not braced', D().std(3, 0, 2).std(6, 0, 2).std(8, 0, 2).led(3, 6, 2).led(6, 8, 2).tie(3,2).tie(8,2).std(3, 2, 4).std(6, 2, 4).std(8, 2, 4).led(3, 6, 4).led(6, 8, 4).tie(3,4).tie(8,4).bd(3, 8, 4).ps],
  [3, 'no std under pallet', D().std(2, 0, 3, 'tube', 3).std(6, 0, 3, 'tube', 3).led(2, 5, 3).led(5,6,3).br(2, 1, 4, 3).br(6,0,4,2).bd(2, 6, 3).ps],
];
for (const [id, name, ps] of cases) {
  const lv = L(id);
  const v = checkValid(lv, ps);
  const r = run(lv, ps);
  console.log(id, name.padEnd(22), v ? 'INVALID ' + v : '', r.ok ? 'PASS' : 'FAIL: ' + r.reason, 'cost', r.cost, 'budget', lv.budget);
}
