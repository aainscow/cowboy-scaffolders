import { prepLevel, Trial, designCost, validatePlacement, checkRequirements } from '../src/engine.js';

export const D = () => {
  const ps = [];
  const api = {
    ps,
    t(a, b, type = 'tube') { ps.push({ type, a, b }); return api; },
    std(x, y0, y1, type = 'tube', seg = 2) { for (let y = y0; y < y1; y += seg) ps.push({ type, a: [x, y], b: [x, Math.min(y1, y + seg)] }); return api; },
    led(x0, x1, y, type = 'tube', seg = 3) { for (let x = x0; x < x1; x += seg) ps.push({ type, a: [x, y], b: [Math.min(x1, x + seg), y] }); return api; },
    br(x0, y0, x1, y1, type = 'tube') { ps.push({ type, a: [x0, y0], b: [x1, y1] }); return api; },
    bd(x0, x1, y, type = 'board') { ps.push({ type, a: [x0, y], b: [x1, y] }); return api; },
    tie(x, y) { ps.push({ type: 'tie', a: [x, y] }); return api; },
    lad(x, y0, y1) { ps.push({ type: 'ladder', a: [x, y0], b: [x, y1] }); return api; },
    lock(x, y = 0) { ps.push({ type: 'lock', a: [x, y] }); return api; },
  };
  return api;
};

export function run(level, pieces, { verbose = false, maxT = 400 } = {}) {
  const tr = new Trial(level, pieces);
  const dt = 1 / 60;
  let t = 0;
  let lastPhase = '';
  while (tr.phase !== 'done' && t < maxT) {
    tr.update(dt); t += dt;
    if (verbose && tr.phase !== lastPhase) { console.log('  phase', tr.phase, t.toFixed(1)); lastPhase = tr.phase; }
  }
  const sim = tr.sim;
  let maxU = 0, maxJ = 0;
  for (const m of sim.members) if (!m.broken) maxU = Math.max(maxU, m.util);
  for (const j of sim.joints) maxJ = Math.max(maxJ, j.util);
  return { ev: tr.log.slice(0,3).map(e=>e.type+':'+(e.reason||'')+'@'+(e.ax??e.x)?.toFixed?.(1)+','+(e.ay??e.y)?.toFixed?.(1)).join(' '), bs: tr.builder.state+'/'+tr.deliv+' '+tr.builder.x.toFixed(1)+','+tr.builder.y.toFixed(1), ok: tr.result?.ok, tags: tr.tags.length, reason: tr.result?.reason, t: t.toFixed(1), disp: tr.maxDispSeen.toFixed(3), broken: sim.members.filter(m => m.broken).length, maxU: maxU.toFixed(2), maxJ: maxJ.toFixed(2), cost: designCost(level, pieces) };
}

export function checkValid(level, pieces) {
  const acc = [];
  for (const p of pieces) {
    const e = validatePlacement(level, acc, p);
    if (e) return `piece ${acc.length} ${JSON.stringify(p)}: ${e}`;
    acc.push(p);
  }
  const r = checkRequirements(level, pieces);
  if (!r.ok) return 'requirements: ' + JSON.stringify(r.zones);
  return null;
}

if ((process.argv[1] || '').endsWith('run.mjs')) {
  const base = {
    W: 8, H: 8,
    house: { x0: 0, x1: 8, eaves: 6, windows: [], door: null },
    zones: [{ x0: 2, x1: 5, y: 4 }],
    deliveries: [{ item: 'hod', zone: 0, x: 3.5 }],
    startX: 10,
  };
  const cases = [];
  const lv = (o) => prepLevel({ ...base, ...o });

  // 1. Unbraced frame to y=4, 2 bays
  cases.push(['unbraced 2lift light', lv({}), D().std(2, 0, 4).std(5, 0, 4).led(2, 5, 2).led(2, 5, 4).bd(2, 5, 4).ps]);
  // 2. Braced frame
  cases.push(['braced 2lift light', lv({}), D().std(2, 0, 2).std(5, 0, 2).led(2, 5, 2).br(2, 0, 4, 2).std(2, 2, 4).std(5, 2, 4).led(2, 5, 4).br(3, 2, 5, 4).bd(2, 5, 4).ps]);
  // 3. heavy pallet on unbraced
  cases.push(['unbraced pallet', lv({ deliveries: [{ item: 'pallet', zone: 0, x: 3.5 }] }), D().std(2, 0, 4).std(5, 0, 4).led(2, 5, 2).led(2, 5, 4).bd(2, 5, 4).ps]);
  cases.push(['braced pallet', lv({ deliveries: [{ item: 'pallet', zone: 0, x: 3.5 }] }), D().std(2, 0, 2).std(5, 0, 2).led(2, 5, 2).br(2, 0, 4, 2).std(2, 2, 4).std(5, 2, 4).led(2, 5, 4).br(3, 2, 5, 4).bd(2, 5, 4).ps]);
  cases.push(['braced+mid std pallet', lv({ deliveries: [{ item: 'pallet', zone: 0, x: 3.5 }] }), D().std(2, 0, 2).std(5, 0, 2).std(3, 0, 2).led(2, 5, 2).br(2, 0, 4, 2).std(2, 2, 4).std(5, 2, 4).std(3, 2, 4).led(2, 5, 4).br(3, 2, 5, 4).bd(2, 5, 4).ps]);
  // lone tower 6m
  cases.push(['lone std 6m', lv({ deliveries: [] , zones: []}), D().std(2, 0, 6, 'tube', 3).ps]);
  cases.push(['lone std 4m', lv({ deliveries: [] , zones: []}), D().std(2, 0, 4).ps]);
  // wind tests
  cases.push(['braced windy no tie', lv({ wind: 30, gust: 30 }), D().std(2, 0, 2).std(5, 0, 2).led(2, 5, 2).br(2, 0, 4, 2).std(2, 2, 4).std(5, 2, 4).led(2, 5, 4).br(3, 2, 5, 4).bd(2, 5, 4).ps]);
  cases.push(['unbraced windy tied', lv({ wind: 30, gust: 30 }), D().std(2, 0, 4).std(5, 0, 4).led(2, 5, 2).tie(2, 2).led(2, 5, 4).tie(5,4).bd(2, 5, 4).ps]);
  cases.push(['dumpy on deck braced', lv({ deliveries: [{ item: 'dumpy', zone: 0, x: 3.5 }] }), D().std(2, 0, 2).std(5, 0, 2).std(3, 0, 2).std(4,0,2).led(2, 5, 2).br(2, 0, 4, 2).std(2, 2, 4).std(5, 2, 4).std(3, 2, 4).std(4,2,4).led(2, 5, 4).br(3, 2, 5, 4).bd(2, 5, 4, 'deck').ps]);

  for (const [name, L, ps] of cases) {
    const v = checkValid(L, ps);
    const r = run(L, ps);
    console.log(name.padEnd(26), v ? 'INVALID ' + v : '', JSON.stringify(r));
  }
}
