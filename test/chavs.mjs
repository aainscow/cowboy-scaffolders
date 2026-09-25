import { prepLevel, Trial } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { REFS } from './refs.mjs';
import { D, run } from './run.mjs';
const L = (id) => prepLevel(LEVELS.find(l => l.id === id));
// unlocked ladder: chavs should get up and tag
const noLock = REFS[3]().filter(p => p.type !== 'lock');
console.log('L3 no lock', JSON.stringify(run(L(3), noLock)).slice(0, 220));
const noLock7 = REFS[7]().filter(p => p.type !== 'lock');
console.log('L7 no lock', JSON.stringify(run(L(7), noLock7)).slice(0, 220));
// weak unbraced lower lift with low ledgers: swinging chavs
const weak = D().std(3, 0, 4).std(6, 0, 4).std(8, 0, 4).led(3, 6, 2).led(6, 8, 2).br(3, 2, 5, 4).led(3, 6, 4).led(6, 8, 4).bd(3, 8, 4).lad(8, 0, 4).lock(8).ps;
console.log('L2 swingy', JSON.stringify(run(L(2), weak)).slice(0, 260));
// trace chav states in L3 no lock
const tr = new Trial(L(3), noLock); let last = '';
for (let i = 0; i < 60 * 120 && tr.phase !== 'done'; i++) { tr.update(1 / 60); const s = tr.phase + ' ' + tr.chavs.map(c => c.state + ':' + c.plan).join(' '); if (s !== last) { console.log((i / 60).toFixed(1), s); last = s; } }
