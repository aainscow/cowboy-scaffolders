import { prepLevel, Trial } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
const L = prepLevel(LEVELS[11]); // 4 chavs
const ps = [];
const t = (a, b) => ps.push({ type: 'tube', a, b });
for (const x of [2, 4, 6, 8]) t([x, 0], [x, 2]);
t([2, 2], [4, 2]); t([4, 2], [6, 2]); t([6, 2], [8, 2]);
for (const x of [2, 4, 6, 8]) t([x, 2], [x, 4]);
t([2, 4], [4, 4]); t([4, 4], [6, 4]); t([6, 4], [8, 4]);
const tr = new Trial(L, ps); tr.skipDeliveries = true;
let last = '';
for (let i = 0; i < 60 * 90 && tr.phase !== 'done'; i++) { tr.update(1 / 60); const s = tr.phase + ' ' + tr.chavs.map(c => c.state).join(','); if (s !== last) { console.log((i / 60).toFixed(1), s); last = s; } }
console.log(tr.result);
import { writeFileSync } from 'node:fs';
writeFileSync('test/pre_trap.js', `window.__DEBUG_DESIGN = { level: 11, test: 4, pieces: ${JSON.stringify(ps)} };`);
