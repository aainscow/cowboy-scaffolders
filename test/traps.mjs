import { prepLevel, Trial, designCost } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { REFS } from './refs.mjs';
import { writeFileSync } from 'node:fs';
const L = prepLevel(LEVELS[2]);
const ps = [...REFS[3](), { type: 'tube', a: [6, 0], b: [6, 3] }, { type: 'tube', a: [7, 0], b: [7, 3] }, { type: 'tube', a: [6, 3], b: [7, 3] }, { type: 'tube', a: [6, 0], b: [7, 1] },
  { type: 'trap', a: [6, 3], b: [7, 3] }, { type: 'ladder', a: [7, 0], b: [7, 3] }];
const tr = new Trial(L, ps);
let last = '';
for (let i = 0; i < 60 * 150 && tr.phase !== 'done'; i++) {
  tr.update(1 / 60);
  const s = tr.phase + ' ' + tr.chavs.map(c => c.state + (c.trapped ? '*' : '')).join(',');
  if (s !== last) { console.log((i / 60).toFixed(1), s); last = s; }
}
console.log(JSON.stringify({ ok: tr.result.ok, reason: tr.result.reason, trapped: tr.result.trapped, tags: tr.tags.length, cost: designCost(L, ps) }));
writeFileSync('test/pre_traps.js', `window.__DEBUG_DESIGN = { level: 2, test: 8, pieces: ${JSON.stringify(ps)} };`);
