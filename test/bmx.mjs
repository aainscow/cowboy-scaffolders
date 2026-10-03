// Predicted BMX lines for the reference designs: node test/bmx.mjs [id-prefix]
import { prepLevel, checkRequirements, designCost } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
import { REFS } from './refs.mjs';
import { checkValid } from './run.mjs';
const only = process.argv[2];
for (const k of Object.keys(REFS)) {
  const id = parseInt(k), L0 = LEVELS.find(l => l.id === id);
  if (!L0 || !L0.event || L0.event.type !== 'bmx' || (only && !k.startsWith(only))) continue;
  const L = prepLevel(L0), ps = REFS[k]();
  const r = checkRequirements(L, ps);
  console.log(k.padEnd(9), checkValid(L, ps) || '', 'cost', designCost(L, ps), 'budget', L.budget, r.ok ? '' : 'NOT OK', '\n   ', r.event.map(e => (e[0] === true ? '✓ ' : e[0] === 'info' ? '· ' : '✗ ') + e[1]).join('\n    '));
}
