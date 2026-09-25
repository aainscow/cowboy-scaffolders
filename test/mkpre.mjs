import { REFS } from './refs.mjs';
import { writeFileSync } from 'node:fs';
for (const id of process.argv.slice(2).map(Number)) writeFileSync(`test/pre_${id}.js`, `window.__DEBUG_DESIGN = { level: ${id - 1}, test: 4, pieces: ${JSON.stringify(REFS[id]())} };`);
