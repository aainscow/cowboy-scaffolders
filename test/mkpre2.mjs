import { REFS } from './refs.mjs';
import { writeFileSync } from 'node:fs';
const [id, name, drop] = process.argv.slice(2);
let ps = REFS[+id]();
if (drop) ps = ps.filter(p => !drop.split(',').includes(p.type));
writeFileSync(`test/pre_${name}.js`, `window.__DEBUG_DESIGN = { level: ${id - 1}, test: 8, pieces: ${JSON.stringify(ps)} };`);
