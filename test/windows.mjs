import { prepLevel, windowsAtRisk } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';
for (const d of LEVELS) { const L = prepLevel(d); console.log(d.id, d.name, [...windowsAtRisk(L)]); }
