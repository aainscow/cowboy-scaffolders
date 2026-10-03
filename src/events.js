// ============================================================================
//  Special jobs: what happens on the top platform once Dave has done his
//  deliveries. Each level may have one `event` ({ type, ...params }). These
//  are mixed into Trial (see eventMixin at the bottom of engine.js).
//
//  Nothing at the top level of this file may touch engine exports: in the
//  bundle this file comes first, so only function declarations live here.
// ============================================================================
import { ITEMS, GRAV, BUILDER_MASS, CHAV_MASS } from './engine.js';

// ---------------------------------------------------------------------------
//  Helpers shared with the design checks
// ---------------------------------------------------------------------------
// The unbroken run of real (non-trap) boards at level gy that contains x.
export function boardRun(sim, gy, x) {
  const real = (u) => { const b = sim.boardUnder(u, gy); return !!b && b.type.id !== 'trap'; };
  let k = Math.floor(x);
  if (!real(k + 0.5)) { if (x === k && real(k - 0.5)) k -= 1; else return null; }
  let x0 = k, x1 = k + 1;
  while (real(x0 - 0.5)) x0 -= 1;
  while (real(x1 + 0.5)) x1 += 1;
  return { x0, x1 };
}
export function pieceNode(sim, pieces, type) {
  const p = pieces.find(q => q.type === type);
  if (!p) return null;
  return sim.nodeAt(p.a[0], p.a[1]);
}
// Where the gin wheel's load can be swung in and landed: nearest point on the
// platform within reach of the wheel.
export function hoistLanding(sim, level, wx, w = 0.8) {
  const zy = level.zones[0].y;
  let best = null, bd = 1.8;
  for (const b of sim.boardsAtLevel(zy)) {
    if (b.type.id === 'trap') continue;
    const x = Math.max(b.x0 + 0.5, Math.min(b.x1 - 0.5, wx));
    const d = Math.abs(x - wx);
    if (d < bd - 1e-6) { bd = d; best = x; }
  }
  return best;
}
// ---------------------------------------------------------------------------
//  The BMX. One rider model, stepped at a fixed rate, drives both the live
//  run and the design-time prediction (the dotted line and the checklist), so
//  what the checklist promises is what happens, unless the scaffold gives way.
// ---------------------------------------------------------------------------
export const RAMP = { cost: 25, vy: 5 };      // kicker: launches him up and on
export const QPIPE = { cost: 35, vy: 5.5 };   // quarter pipe: straight up, back down the way he came
export const BMX_DT = 1 / 120;
export const BMX_MASS = 85;
export function bmxSpec(level) {
  const E = level.event, z = level.zones[0];
  const start = typeof E.start === 'number' ? { x: E.start, y: z.y, dir: 1 } : { y: z.y, dir: 1, ...E.start };
  const finish = E.finish || { kind: 'ground', x0: E.pool[0], x1: E.pool[1], y: 0.3, prop: 'pool', label: 'paddling pool' };
  return { start, v: E.v ?? 6, hop: E.hop ?? 0.8, finish, hoops: E.hoops || [], obstacles: E.obstacles || [], drain: E.drain || null, maxDrop: E.maxDrop ?? 3.5 };
}
// What the rider can touch: boards (real or trap), fixed ledges, and the kit on the joints.
export function bmxWorld(sim, level, pieces) {
  const B = bmxSpec(level), E = level.event;
  const ledges = [];
  if (B.finish.kind === 'ledge') ledges.push({ ...B.finish, finish: true });
  for (const l of E.ledges || []) ledges.push(l);
  const lv = new Set(sim.boards.map(b => b.gy));
  for (const l of ledges) lv.add(l.y);
  const at = (type) => { const m = new Map(); for (const q of pieces) if (q.type === type) m.set(q.a[0] + ',' + q.a[1], q); return m; };
  const hatch = pieces.find(q => q.type === 'hatch');
  const broken = new Set();
  return {
    B, level, broken, ledges, levels: [...lv].sort((a, b) => b - a), ramps: at('ramp'), qpipes: at('qpipe'), hatchX: hatch ? hatch.a[0] : null,
    surf(x, gy) {
      for (const l of ledges) if (l.y === gy && x >= l.x0 - 1e-9 && x <= l.x1 + 1e-9) return { ledge: l };
      let best = null;
      for (const bd of sim.boards) {
        if (bd.broken || broken.has(bd.id) || bd.gy !== gy || x < bd.x0 - 1e-6 || x > bd.x1 + 1e-6) continue;
        if (!best || (best.type.id === 'trap' && bd.type.id !== 'trap')) best = bd;
      }
      return best ? { bd: best, trap: best.type.id === 'trap' } : null;
    },
  };
}
export function bmxNew(B) {
  return { mode: 'ride', x: B.start.x + B.start.dir * 0.3, y: B.start.y, gy: B.start.y, dir: B.start.dir, vx: 0, vy: 0, peak: B.start.y, t: 0, air: 0, bt: 0, qp: false, hoops: new Set(), out: null };
}
function bmxFly(s, vx, vy, x) { s.mode = 'fly'; s.vx = vx; s.vy = vy; s.x = x; s.y = s.gy; s.peak = s.y; s.air = 0; }
function bmxEnd(s, out) { s.mode = 'done'; s.out = out; }
// Advance the rider by dt. Returns what happened (usually nothing).
export function bmxStep(W, s, dt) {
  const B = W.B, L = W.level, ev = [];
  s.t += dt;
  if (s.t > 45 && s.mode !== 'done') { bmxEnd(s, { kind: 'bored', x: s.x, y: s.y }); ev.push({ what: 'bored', x: s.x, y: s.y }); return ev; }
  if (s.mode === 'ride') {
    const x0 = s.x;
    s.x += s.dir * B.v * dt;
    // kit on the joints he rolls over
    const lo = Math.min(x0, s.x), hi = Math.max(x0, s.x);
    for (let gx = Math.ceil(lo - 1e-9); gx <= hi + 1e-9; gx++) {
      if (Math.abs(gx - x0) < 1e-9) continue;
      const k = gx + ',' + s.gy;
      if (W.ramps.has(k)) { bmxFly(s, s.dir * B.v, RAMP.vy, gx); ev.push({ what: 'kick', x: gx, y: s.gy }); return ev; }
      if (W.qpipes.has(k)) { bmxFly(s, 0, QPIPE.vy, gx - s.dir * 0.05); s.qp = true; ev.push({ what: 'qpipe', x: gx, y: s.gy }); return ev; }
    }
    const su = W.surf(s.x, s.gy);
    const edge = s.dir > 0 ? Math.floor(s.x + 1e-9) : Math.ceil(s.x - 1e-9);
    if (!su) { bmxFly(s, s.dir * B.v, B.hop, edge); ev.push({ what: 'launch', x: edge, y: s.gy }); return ev; }
    if (su.trap) { W.broken.add(su.bd.id); ev.push({ what: 'trap', x: edge, y: s.gy, bd: su.bd.id }); bmxFly(s, s.dir * B.v, 0, edge); return ev; }
    if (su.ledge && su.ledge.finish) { bmxEnd(s, { kind: 'finish', x: s.x, y: s.gy }); ev.push({ what: 'finish', x: s.x, y: s.gy }); }
    return ev;
  }
  if (s.mode === 'basement') {
    s.bt += dt;
    if (s.bt > 1.5) {
      const D = B.drain;
      s.gy = L.groundAt(D.x); s.dir = Math.sign(D.vx) || s.dir;
      bmxFly(s, D.vx, D.vy, D.x);
      s.drained = true;
      ev.push({ what: 'drain', x: D.x, y: s.gy });
    }
    return ev;
  }
  if (s.mode !== 'fly') return ev;
  const y0 = s.y;
  s.vy -= GRAV * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.air += dt;
  s.peak = Math.max(s.peak, s.y);
  B.hoops.forEach((h, i) => {
    if (!s.hoops.has(i) && Math.hypot(s.x - h.x, s.y + 0.6 - h.y) < (h.r ?? 0.6)) { s.hoops.add(i); ev.push({ what: 'hoop', i, x: h.x, y: h.y, cash: h.cash }); }
  });
  for (const o of B.obstacles) {
    if (s.x > o.x0 && s.x < o.x1 && s.y < o.y1 && s.y + 1.2 > o.y0) { bmxEnd(s, { kind: 'crash', why: 'obstacle', label: o.label, x: s.x, y: s.y }); ev.push({ what: 'crash', x: s.x, y: s.y }); return ev; }
  }
  // coming down onto a platform (he goes up through them: no ceilings in BMX)
  if (s.vy < 0) for (const gy of W.levels) {
    if (!(y0 >= gy - 1e-9 && s.y < gy)) continue;
    const su = W.surf(s.x, gy);
    if (!su) continue;
    if (su.trap) { W.broken.add(su.bd.id); ev.push({ what: 'trap', x: s.x, y: gy, bd: su.bd.id }); continue; }
    const drop = s.peak - gy;
    s.y = gy; s.gy = gy;
    if (su.ledge && su.ledge.finish) { bmxEnd(s, { kind: 'finish', x: s.x, y: gy, drop }); ev.push({ what: 'finish', x: s.x, y: gy }); return ev; }
    if (drop > B.maxDrop + 1e-6) { bmxEnd(s, { kind: 'crash', why: 'drop', drop, x: s.x, y: gy }); ev.push({ what: 'crash', x: s.x, y: gy }); return ev; }
    s.mode = 'ride';
    if (s.qp) { s.dir = -s.dir; s.qp = false; }
    ev.push({ what: 'land', x: s.x, y: gy, drop, ledge: su.ledge ? su.ledge.label : null });
    return ev;
  }
  // the finish (a pool, a skip, a mat) has sides as well as a top
  const F = B.finish;
  if (F.kind === 'ground' && s.x >= F.x0 && s.x <= F.x1 && s.y <= F.y) {
    const drop = s.peak - F.y;
    if (y0 <= F.y) { bmxEnd(s, { kind: 'crash', why: 'side', x: s.x, y: s.y }); ev.push({ what: 'crash', x: s.x, y: s.y }); }
    else if (F.maxDrop && drop > F.maxDrop + 1e-6) { bmxEnd(s, { kind: 'crash', why: 'soft', drop, x: s.x, y: F.y }); ev.push({ what: 'crash', x: s.x, y: F.y }); }
    else { s.y = F.y; bmxEnd(s, { kind: 'finish', x: s.x, y: F.y, drop }); ev.push({ what: 'finish', x: s.x, y: F.y }); }
    return ev;
  }
  const g = L.groundAt(s.x);
  if (s.y <= g) {
    s.y = g;
    if (W.hatchX !== null && B.drain && Math.abs(s.x - W.hatchX) <= 0.55) { s.mode = 'basement'; s.bt = 0; s.x = W.hatchX; s.vx = 0; s.vy = 0; ev.push({ what: 'hatch', x: W.hatchX, y: g }); }
    else { bmxEnd(s, { kind: 'crash', why: 'ground', x: s.x, y: g }); ev.push({ what: 'crash', x: s.x, y: g }); }
  }
  return ev;
}
const m1 = (x) => (Math.round(x * 10) / 10).toString();
// The whole run, worked out in advance. Path segments break where he goes down the drain.
export function bmxPredict(sim, level, pieces) {
  const W = bmxWorld(sim, level, pieces), B = W.B;
  const s = bmxNew(B);
  const su = W.surf(s.x, s.gy);
  if (!su || su.trap) return null;
  const segs = [[[s.x, s.y]]], evs = [];
  let n = 0;
  while (s.mode !== 'done' && n < 50 / BMX_DT) {
    const e = bmxStep(W, s, BMX_DT);
    for (const x of e) evs.push(x);
    if (e.some(x => x.what === 'drain')) segs.push([]);
    if (s.mode !== 'basement' && (n % 3 === 0 || e.length || s.mode === 'done')) segs[segs.length - 1].push([s.x, s.y]);
    n++;
  }
  if (!s.out) s.out = { kind: 'bored', x: s.x, y: s.y };
  return { out: s.out, segs, evs, hoops: s.hoops, B, hatchX: W.hatchX, cash: [...s.hoops].reduce((a, i) => a + (B.hoops[i].cash || 0), 0) };
}
// What the checklist says about the predicted run.
export function bmxSummary(P, level) {
  const B = P.B, F = B.finish, parts = [];
  for (const e of P.evs) {
    if (e.what === 'kick') parts.push(`kicker at ${e.x} m`);
    else if (e.what === 'qpipe') parts.push(`quarter pipe at ${e.x} m`);
    else if (e.what === 'trap') parts.push(`through the trap board at ${m1(e.x)} m`);
    else if (e.what === 'launch') parts.push(`off the end at ${m1(e.x)} m`);
    else if (e.what === 'land') parts.push(e.ledge ? `onto the ${e.ledge}` : `lands on the ${e.y} m platform`);
    else if (e.what === 'hatch') parts.push('down the trap door');
    else if (e.what === 'drain') parts.push('out of the drain');
  }
  const o = P.out;
  let end;
  if (o.kind === 'finish') end = `${F.kind === 'ledge' ? 'onto' : 'into'} the ${F.label}`;
  else if (o.kind === 'bored') end = 'round and round until he gets bored';
  else if (o.why === 'drop') end = `lands on the ${o.y} m platform from ${m1(o.drop)} m up: too far (${B.maxDrop} m max)`;
  else if (o.why === 'soft') end = `drops ${m1(o.drop)} m into the ${F.label}: it's only good for ${F.maxDrop} m`;
  else if (o.why === 'obstacle') end = `straight into the ${o.label}`;
  else if (o.why === 'side') end = `into the side of the ${F.label}`;
  else if (B.drain && P.evs.every(e => e.what !== 'drain')) end = P.hatchX === null ? `lands at ${m1(o.x)} m, and there's no trap door` : `lands at ${m1(o.x)} m, ${m1(Math.abs(o.x - P.hatchX))} m from the trap door`;
  else if (F.kind === 'ground') end = `lands at ${m1(o.x)} m: ${o.x < F.x0 ? 'short of' : 'past'} the ${F.label} (${m1(F.x0)}–${m1(F.x1)} m)`;
  else end = `hits the ground at ${m1(o.x)} m`;
  parts.push(end);
  const s = parts.join(' → ');
  return s[0].toUpperCase() + s.slice(1);
}
// Sleigh stopping distance on snowy boards.
export function sleighNeeds(E) { return E.v * E.v / (2 * E.mu * GRAV) + 0.9; }

// Checklist lines + whether the job can go ahead at all.
export function eventChecks(level, sim, pieces) {
  const E = level.event, out = [];
  let ok = true, bmx = null;
  if (!E) return { checks: out, ok };
  const z = level.zones[0];
  if (E.type === 'hoist') {
    const n = pieceNode(sim, pieces, 'wheel');
    const land = n ? hoistLanding(sim, level, n.gx) : null;
    if (!n) { ok = false; out.push([false, 'Fit a gin wheel where the loads can hang clear to the ground']); }
    else if (land === null) { ok = false; out.push([false, 'Nothing to land the loads on: board the platform within 1.5 m of the gin wheel']); }
    else out.push([true, `Gin wheel ready: loads land at ${land.toFixed(1)} m`]);
  } else if (E.type === 'zip') {
    const n = pieceNode(sim, pieces, 'zip');
    if (!n) { ok = false; out.push([false, 'Fix the zip wire anchor to a joint at platform level']); }
    else out.push([true, `Zip wire anchored at ${n.gy} m. It pulls hard towards the pub`]);
  } else if (E.type === 'chute') {
    const n = pieceNode(sim, pieces, 'chute');
    if (!n) out.push([false, `No rubble chute: the roofers will chuck it off the edge (${'£' + E.carCost} a bag to the Bishop's car)`]);
    else if (n.gx >= E.skip[0] && n.gx <= E.skip[1]) out.push([true, 'Rubble chute runs into the skip']);
    else out.push([false, `The chute misses the skip (skip is at ${E.skip[0]}–${E.skip[1]} m)`]);
  } else if (E.type === 'bmx') {
    const P = bmxPredict(sim, level, pieces), B = bmxSpec(level);
    bmx = P;
    if (!P) { ok = false; out.push([false, `Tyler needs real boards to ride out onto at ${B.start.x} m, ${B.start.y} m up`]); }
    else {
      out.push([P.out.kind === 'finish', `Tyler: ${bmxSummary(P, level)}`]);
      if (B.hoops.length) { const got = [...P.hoops].reduce((a, i) => a + B.hoops[i].cash, 0); out.push([P.hoops.size === B.hoops.length, `Sponsor's hoops: ${P.hoops.size} of ${B.hoops.length}${got ? ` (+£${got})` : ''}`]); }
    }
  } else if (E.type === 'sleigh') {
    const run = boardRun(sim, z.y, z.x0 + 0.5);
    const need = sleighNeeds(E);
    const len = run ? run.x1 - run.x0 : 0;
    out.push([len >= need, run ? `Runway ${len} m of real boards; the sleigh needs about ${need.toFixed(1)} m to stop` : 'No runway: the sleigh lands on the left end of the platform']);
  } else if (E.type === 'party') {
    out.push(['info', `${E.guests} guests will dance on the platform for ${E.dur} s. Floppy scaffolds bounce`]);
  } else if (E.type === 'fireworks') {
    out.push(['info', `Terry's fireworks go off from the platform. Stray rockets go for the windows`]);
  } else if (E.type === 'launch') {
    out.push(['info', 'The astronaut climbs to the capsule, then the rocket blast hits the scaffold']);
  }
  return { checks: out, ok, bmx };
}

// ---------------------------------------------------------------------------
//  People who climb up for an event (party guests, zip riders, Terry, ...)
// ---------------------------------------------------------------------------
function newVisitor(tr, o) {
  return Object.assign({ who: 'visitor', style: 'guest0', name: 'A guest', id: tr.visitors.length, x: tr.startX + 2, y: 0, state: 'wait', delay: 0, visible: false,
    mode: 'ground', face: -1, t: 0, onBoard: -1, onLadder: -1, onMember: -1, load: null, u: null, mass: 80, gy: tr.level.zones[0].y, targetX: tr.level.zones[0].x0 + 0.5,
    homeX: tr.startX + 3, massK: 1, fx: 0, walkV: 1.6, climbV: 1.1 }, o);
}
function visitorStep(tr, v, dt) {
  const sim = tr.sim;
  if (v.state === 'gone' || v.state === 'falling' || v.state === 'flat') return;
  v.t += dt;
  const end = () => sim.nodes[v.route[v.route.length - 1].node];
  if (v.swinger && (v.state === 'plan' || v.state === 'toSwing' || v.state === 'swinghang')) return;   // the party handles these
  switch (v.state) {
    case 'wait': if (v.t > v.delay) { v.visible = true; v.state = 'plan'; v.t = 0; v.y = tr.level.groundAt(v.x); } return;
    case 'plan': {
      const nodes = [];
      for (const bd of sim.boardsAtLevel(v.gy)) if (bd.type.id !== 'trap') nodes.push(bd.a, bd.b);
      const route = nodes.length ? sim.findRoute(v.x, nodes, v.targetX, { traps: 'avoid' }) : null;
      if (!route) { v.state = 'stuck'; v.t = 0; return; }
      v.route = route; v.routeI = 0; v.segT = 0; v.returning = false; v.state = 'go';
      return;
    }
    case 'go': if (tr._walkGround(v, v.route[0].x, v.walkV, dt)) { v.state = 'route'; v.routeI = 1; v.segT = 0; } return;
    case 'route':
      if (tr._routeStep(v, dt, v.mass, v.climbV, v.walkV)) {
        if (!v.returning) { v.state = 'toX'; v.u = end().gx; }
        else { v.state = 'home'; tr._setLoad(v, null); v.onLadder = -1; v.onBoard = -1; }
      }
      return;
    case 'toX': case 'back': {
      const tx = v.state === 'toX' ? v.targetX : end().gx;
      const dir = Math.sign(tx - v.u);
      v.face = dir || v.face; v.mode = 'walk';
      v.u += dir * Math.min(Math.abs(tx - v.u), v.walkV * dt);
      if (!tr._placeOnBoard(v, v.gy, v.mass)) { tr._fall(v, 0, 0); return; }
      if (Math.abs(tx - v.u) < 1e-3) {
        if (v.state === 'toX') { v.state = 'act'; v.t = 0; }
        else { v.u = null; v.returning = true; v.state = 'route'; v.routeI = v.route.length - 2; v.segT = 0; }
      }
      return;
    }
    case 'act': tr._placeOnBoard(v, v.gy, v.mass * v.massK, v.fx); return;
    case 'home': case 'stuck': if (tr._walkGround(v, v.homeX, 1.7, dt)) { if (v.state === 'home') { v.state = 'gone'; v.visible = false; } } return;
  }
}

// ---------------------------------------------------------------------------
//  The events
// ---------------------------------------------------------------------------
const PARTY_STYLES = ['guest0', 'guest1', 'guest2', 'guest3', 'guest4', 'guest5'];

function hoistStart(E, ev) {
  const n = pieceNode(this.sim, this.pieces, 'wheel');
  ev.node = n.id; ev.wx = n.gx; ev.i = 0; ev.stage = 'walk';
  const b = this.builder; b.visible = true; b.carrying = null;
}
function hoistUpdate(E, ev, dt) {
  const b = this.builder, sim = this.sim, L = this.level, zy = L.zones[0].y;
  const node = sim.nodes[ev.node];
  ev.st = (ev.st || 0) + dt;
  if (ev.stage === 'walk') {
    b.state = 'walk';
    if (this._walkGround(b, ev.wx + 0.7, 1.7, dt)) {
      const key = E.loads[ev.i];
      const g = L.groundAt(ev.wx);
      const it = { def: ITEMS[key], key, x: ev.wx, y: g, vx: 0, vy: 0, state: 'hoist', loads: [], rot: 0, vr: 0, targetX: ev.wx, zoneY: zy, hanging: true };
      this.items.push(it);
      ev.item = it; ev.ld = { kind: 'node', node: ev.node, mass: 0 }; sim.loads.push(ev.ld);
      ev.stage = 'lift'; ev.st = 0; b.state = 'haul'; b.face = -1;
      this.events.push({ type: 'hoist', what: 'lift', key });
    }
  } else if (ev.stage === 'lift') {
    const it = ev.item, g = L.groundAt(ev.wx);
    const dur = 1.5 + (zy - g) * 0.75;
    const k = Math.min(1, ev.st / dur);
    it.x = ev.wx; it.y = g + (zy + 0.45 - g) * k;
    // rope over the wheel: the load on one side, Dave pulling on the other
    ev.ld.mass = 2 * it.def.mass * Math.min(1, ev.st / 0.35) * (1 + 0.2 * Math.exp(-ev.st * 2));
    if (!node.alive || !node.arms.length) { this._dropItem(it, it.x, it.y, 0); it.zoneY = null; this._removeLoad(ev.ld); ev.stage = 'done'; return; }
    if (k >= 1) { ev.land = hoistLanding(sim, L, ev.wx); ev.stage = ev.land === null ? 'noland' : 'swing'; ev.st = 0; }
  } else if (ev.stage === 'swing') {
    const it = ev.item, k = Math.min(1, ev.st / 1.3);
    const s = k * k * (3 - 2 * k);
    it.x = ev.wx + (ev.land - ev.wx) * s;
    it.y = zy + 0.45 + Math.sin(k * Math.PI) * 0.15;
    if (k >= 1) {
      this._removeLoad(ev.ld); ev.ld = null;
      it.hanging = false; this._dropItem(it, ev.land, zy + 0.4, -0.3); it.zoneY = zy;
      ev.stage = 'rest'; ev.st = 0; b.state = 'walk';
    }
  } else if (ev.stage === 'noland') {
    this.fail(`Nowhere to land the ${ev.item.def.name.toLowerCase()}`, null, true);
  } else if (ev.stage === 'rest') {
    if (ev.st > 1.8) { ev.i++; ev.stage = ev.i < E.loads.length ? 'walk' : 'home'; }
  } else if (ev.stage === 'home') {
    if (this._walkGround(b, this.startX + 0.8, 1.7, dt)) { b.state = 'watch'; ev.stage = 'done'; }
  } else if (ev.stage === 'done') this._eventEnd();
}

function partyStart(E, ev) {
  const z = this.level.zones[0], n = E.guests;
  for (let i = 0; i < n; i++) {
    const tx = n > 1 ? z.x0 + 0.35 + i * (z.x1 - z.x0 - 0.7) / (n - 1) : (z.x0 + z.x1) / 2;
    this.visitors.push(newVisitor(this, { style: PARTY_STYLES[i % PARTY_STYLES.length], name: 'A party guest', x: this.startX + 1.5 + (i % 3) * 0.5, homeX: this.startX + 4 + i * 0.3, delay: i * 1.1, targetX: tx, mass: 78, gy: z.y, swinger: i % 5 === 3 }));
  }
  ev.partyT = -1; ev.beat = 0;
  this.builder.state = 'watch';
  this.events.push({ type: 'party', what: 'arrive' });
}
function partyUpdate(E, ev, dt) {
  const V = this.visitors, sim = this.sim, L = this.level;
  // a couple of guests would rather swing off the tubes
  for (const v of V) {
    if (!v.swinger) continue;
    if (v.state === 'plan') {
      const taken = new Set(V.filter(o => o !== v && o.member !== undefined).map(o => o.member));
      const m = sim.members.find(mm => {
        if (mm.broken || taken.has(mm.id)) return false;
        const a = sim.nodes[mm.a], b = sim.nodes[mm.b];
        if (a.gy !== b.gy) return false;
        const h = a.gy - L.groundCol(Math.round((a.gx + b.gx) / 2));
        return h >= 1 && h <= 2.6;
      });
      if (!m) { v.swinger = false; continue; }
      v.member = m.id; v.swingX = (sim.nodes[m.a].gx + sim.nodes[m.b].gx) / 2; v.state = 'toSwing';
    } else if (v.state === 'toSwing') {
      if (this._walkGround(v, v.swingX, 1.7, dt)) { v.state = 'swinghang'; v.t = 0; }
    } else if (v.state === 'swinghang') {
      const m = sim.members[v.member];
      const a = sim.nodes[m.a], b = sim.nodes[m.b];
      v.x = (a.x + b.x) / 2; v.y = (a.y + b.y) / 2 - 2.0;
      v.onMember = m.id; v.onBoard = -1; v.onLadder = -1;
      const going = ev.partyT >= 0 && ev.partyT <= E.dur;
      v.swing = going ? Math.sin(ev.beat / 2 + v.id) * Math.min(1, ev.partyT / 3) : Math.sin((v.t || 0) * 2) * 0.2;
      this._setLoad(v, { kind: 'member', member: m.id, t: 0.5, mass: v.mass * (1 + 0.35 * Math.abs(v.swing)), fx: 300 * v.swing });
      if (ev.partyT > E.dur) { this._setLoad(v, null); v.onMember = -1; v.swing = 0; v.y = L.groundAt(v.x); v.state = 'home'; }
    }
  }
  const dancing = V.filter(v => v.state === 'act');
  if (ev.partyT < 0 && dancing.length && V.every(v => v.state === 'act' || v.state === 'swinghang' || v.state === 'stuck' || v.state === 'gone' || v.state === 'falling' || v.state === 'flat')) { ev.partyT = 0; this.events.push({ type: 'party', what: 'music' }); }
  if (ev.partyT >= 0 && ev.partyT <= E.dur) {
    ev.partyT += dt;
    const f = E.beat * (1 + 0.25 * Math.min(1, ev.partyT / E.dur));   // the DJ speeds up
    ev.beat += 2 * Math.PI * f * dt;
    const ramp = Math.min(1, ev.partyT / 3);
    for (const v of dancing) {
      v.hop = Math.max(0, Math.sin(ev.beat));
      v.massK = 1 + 0.6 * ramp * Math.sin(ev.beat);
      v.fx = E.sway * ramp * Math.sin(ev.beat / 2);   // everyone sways side to side together
      v.dance = true; v.beat = ev.beat;
    }
    if (ev.partyT > E.dur) {
      this.events.push({ type: 'party', what: 'end' });
      for (const v of V) { v.massK = 1; v.fx = 0; v.hop = 0; v.dance = false; if (v.state === 'act') { v.state = 'back'; } }
    }
  }
  // nobody made it up? call it off
  if (ev.partyT < 0 && V.every(v => v.state === 'stuck' || v.state === 'gone' || v.state === 'flat')) ev.partyT = E.dur + 1;
  if ((ev.partyT > E.dur && V.every(v => v.state === 'gone' || v.state === 'flat' || v.state === 'stuck')) || ev.t > 240) this._eventEnd();
}

function zipStart(E, ev) {
  const n = pieceNode(this.sim, this.pieces, 'zip');
  const L = this.level;
  ev.node = n.id;
  ev.to = { x: L.W + E.dx, y: E.y };
  ev.ld = { kind: 'node', node: n.id, mass: 0, fx: 0 }; this.sim.loads.push(ev.ld);
  const stand = this.sim.boardUnder(n.gx - 0.3, n.gy) ? n.gx - 0.35 : n.gx + 0.35;
  E.riders.forEach((r, i) => this.visitors.push(newVisitor(this, { style: r.style, name: r.name, x: this.startX + 1.5, homeX: this.startX + 3, delay: i === 0 ? 0 : 1e9, targetX: stand, mass: r.mass, gy: n.gy })));
  ev.next = 1; ev.pre = 0; ev.riding = [];
  this.builder.state = 'watch';
}
function zipUpdate(E, ev, dt) {
  const sim = this.sim, n = sim.nodes[ev.node];
  const V = this.visitors;
  ev.pre = Math.min(1, ev.pre + dt / 2);
  // clipping on, then off down the wire
  for (const v of V) {
    if (v.state === 'act') {
      if (v.t > 0.9) {
        v.state = 'zip'; v.s = 0; v.zv = 1.2; this._setLoad(v, null); v.onBoard = -1; v.mode = 'zip';
        this.events.push({ type: 'zip', what: 'go', name: v.name });
        if (ev.next < V.length) { V[ev.next].delay = V[ev.next].t + 0.5; ev.next++; }
      }
    } else if (v.state === 'zip') {
      const len = Math.hypot(ev.to.x - n.x, ev.to.y - n.y);
      v.zv = Math.min(13, v.zv + 3.2 * dt);
      v.s += v.zv * dt / len;
      const s = Math.min(1, v.s);
      v.x = n.x + (ev.to.x - n.x) * s; v.y = n.y + (ev.to.y - n.y) * s - 4 * E.sag * s * (1 - s) - 1.9;
      if (v.s >= 1) { v.state = 'gone'; v.visible = false; this.events.push({ type: 'zip', what: 'arrive', name: v.name }); }
    }
  }
  // cable tension at the anchor: pretension plus each rider's pull (worst mid-span)
  const theta = Math.atan2(n.y - ev.to.y, ev.to.x - n.x);
  let Fh = E.pre * ev.pre, Wv = 0;
  for (const v of V) if (v.state === 'zip') { const s = Math.min(1, v.s); Fh += v.mass * GRAV * E.k * 4 * s * (1 - s); Wv += v.mass * (1 - s); }
  ev.Fh = Fh;
  ev.ld.fx = Fh; ev.ld.mass = Fh * Math.tan(theta) / GRAV + Wv;
  if (V.every(v => v.state === 'gone' || v.state === 'stuck' || v.state === 'flat')) {
    ev.pre = 0; this._removeLoad(ev.ld); this._eventEnd();
  }
}

function chuteStart(E, ev) {
  const n = pieceNode(this.sim, this.pieces, 'chute');
  ev.node = n ? n.id : -1; ev.i = 0; ev.stage = 'throw'; ev.st = 0;
  if (n) { ev.cl = { kind: 'node', node: n.id, mass: 55 }; this.sim.loads.push(ev.cl); }
  this.builder.state = 'watch';
}
function chuteUpdate(E, ev, dt) {
  const sim = this.sim, L = this.level, zy = L.zones[0].y;
  ev.st += dt;
  if (ev.stage === 'throw') {
    if (ev.st < 0.9) return;
    const bx = E.bags[ev.i];
    const it = { def: ITEMS.rubble, key: 'rubble', x: bx, y: zy + 2.6, vx: 0, vy: -0.5, state: 'falling', loads: [], rot: 0, vr: 1.5, targetX: bx, zoneY: zy };
    this.items.push(it); ev.item = it; ev.stage = 'land'; ev.st = 0;
    this.events.push({ type: 'chute', what: 'throw', x: bx });
  } else if (ev.stage === 'land') {
    if (ev.item.state === 'placed' && ev.st > 1.3) {
      const it = ev.item;
      for (const ld of it.loads) this._removeLoad(ld); it.loads = []; it.state = 'hoist';
      const n = ev.node >= 0 ? sim.nodes[ev.node] : null;
      if (n) ev.dest = n.gx;
      else { const run = boardRun(sim, zy, it.x); ev.dest = run ? (it.x - run.x0 < run.x1 - it.x ? run.x0 - 0.3 : run.x1 + 0.3) : it.x; }
      ev.from = it.x; ev.stage = 'slide'; ev.st = 0;
    } else if (ev.item.state === 'ground' || ev.st > 12) ev.stage = 'next';
  } else if (ev.stage === 'slide') {
    const it = ev.item, k = Math.min(1, ev.st / 0.9);
    it.x = ev.from + (ev.dest - ev.from) * k;
    it.y = sim.boardUnder(it.x, zy) ? zy + 0.1 : zy + 0.1 - (k - 0.9) * 2;
    if (k >= 1) {
      it.state = 'falling'; it.zoneY = null; it.vy = -1; it.chuted = true; it.x = ev.dest;
      if (ev.node >= 0) { ev.kick = { kind: 'node', node: ev.node, mass: it.def.mass * 1.6 }; sim.loads.push(ev.kick); ev.kickT = 0.4; }
      ev.stage = 'fall'; ev.st = 0;
      this.events.push({ type: 'chute', what: 'drop', x: ev.dest, chute: ev.node >= 0 });
    }
  } else if (ev.stage === 'fall') {
    if (ev.kick && (ev.kickT -= dt) <= 0) { this._removeLoad(ev.kick); ev.kick = null; }
    if (ev.item.state === 'ground') {
      const x = ev.item.x;
      if (x >= E.skip[0] && x <= E.skip[1]) this.events.push({ type: 'chute', what: 'skip', x });
      else if (x >= E.car[0] - 0.5 && x <= E.car[1] + 0.5) { this.charges.push({ what: "Bishop's car", cost: E.carCost }); this.events.push({ type: 'chute', what: 'car', x }); }
      else { this.charges.push({ what: 'Rubble clear-up', cost: 60 }); this.events.push({ type: 'chute', what: 'mess', x }); }
      ev.item.state = 'gone';
      ev.stage = 'next';
    }
  } else if (ev.stage === 'next') {
    ev.i++; ev.st = 0;
    ev.stage = ev.i < E.bags.length ? 'throw' : 'done';
  } else if (ev.stage === 'done') {
    if (ev.cl) this._removeLoad(ev.cl);
    this._eventEnd();
  }
}

function bmxStart(E, ev) {
  const W = bmxWorld(this.sim, this.level, this.pieces), B = W.B;
  const s = bmxNew(B);
  const r = { who: 'tyler', style: 'tyler', name: 'Tyler', visible: true, x: B.start.x, y: B.start.y, u: s.x, state: 'appear', mode: 'walk', face: B.start.dir, t: 0, onBoard: -1, onLadder: -1, onMember: -1, load: null, gy: B.start.y, bike: true };
  this.visitors.push(r); ev.r = r; ev.W = W; ev.s = s; ev.acc = 0; ev.impact = 0; ev.drop = 0;
  this.builder.state = 'watch';
  this.events.push({ type: 'bmx', what: 'appear', x: B.start.x, y: B.start.y });
}
function bmxUpdate(E, ev, dt) {
  const r = ev.r, s = ev.s, W = ev.W, B = W.B, sim = this.sim;
  if (r.state === 'falling' || r.state === 'flat' || r.state === 'gone') return;
  r.t += dt;
  if (r.state === 'appear') {
    r.u = s.x;
    const su = W.surf(s.x, s.gy);
    if (!su || !su.bd || su.trap) { this._fall(r, 0, 0); this.fail("Tyler's start platform has gone", null, true); return; }
    this._setLoad(r, { kind: 'board', board: su.bd.id, t: Math.max(0, Math.min(1, s.x - su.bd.x0)), mass: BMX_MASS });
    r.onBoard = su.bd.id; r.x = s.x; r.y = sim.nodes[su.bd.a].y;
    if (r.t > 1.4) { r.state = 'ride'; r.t = 0; this.events.push({ type: 'bmx', what: 'go' }); }
    return;
  }
  if (r.state === 'finish') {
    if (r.t > 3) { r.state = 'gone'; r.visible = false; this._eventEnd(); }
    return;
  }
  ev.acc += dt;
  while (ev.acc >= BMX_DT && s.mode !== 'done') {
    ev.acc -= BMX_DT;
    for (const e of bmxStep(W, s, BMX_DT)) {
      this.events.push({ type: 'bmx', ...e, prop: B.finish.prop });
      if (e.what === 'trap') { this._setLoad(r, null); r.onBoard = -1; const bd = sim.boards[e.bd]; if (bd && !bd.broken) sim.breakBoard(bd, 'trap'); }
      if (e.what === 'hoop' && e.cash) this.charges.push({ what: "Sponsor's hoops", cost: -e.cash });
      if (e.what === 'land') { ev.impact = 0.3; ev.drop = e.drop; }
      if (e.what === 'kick') { const n = sim.nodeAt(e.x, e.y); if (n) { ev.kick = { kind: 'node', node: n.id, mass: BMX_MASS * 1.8 }; sim.loads.push(ev.kick); ev.kickT = 0.15; } }
    }
    if (s.mode === 'done') break;
  }
  if (ev.kick && (ev.kickT -= dt) <= 0) { this._removeLoad(ev.kick); ev.kick = null; }
  r.face = s.mode === 'fly' && s.vx ? Math.sign(s.vx) : s.dir;
  if (s.mode === 'ride') {
    r.state = 'ride'; r.visible = true;
    const su = W.surf(s.x, s.gy);
    if (!su || su.ledge || su.trap) { this._setLoad(r, null); r.onBoard = -1; r.x = s.x; r.y = s.gy; return; }
    // sit on the board the rider model is using (never a trap board he's about to find out about)
    r.u = s.x;
    ev.impact = Math.max(0, ev.impact - dt);
    const bump = 1.25 + 0.2 * Math.sin(s.x * 6) + (ev.impact > 0 ? (1.3 + 0.5 * ev.drop) * ev.impact / 0.3 : 0);
    const bd = su.bd, na = sim.nodes[bd.a], nb = sim.nodes[bd.b], t = Math.max(0, Math.min(1, s.x - bd.x0));
    r.x = na.x + (nb.x - na.x) * t; r.y = na.y + (nb.y - na.y) * t; r.zy = s.gy;
    r.onBoard = bd.id; r.onLadder = -1; r.onMember = -1;
    this._setLoad(r, { kind: 'board', board: bd.id, t, mass: BMX_MASS * bump, fx: 60 * s.dir });
  } else if (s.mode === 'fly') {
    if (r.onBoard >= 0 || r.load) { this._setLoad(r, null); r.onBoard = -1; }
    r.state = 'fly'; r.visible = true; r.x = s.x; r.y = s.y; r.vy = s.vy;
  } else if (s.mode === 'basement') {
    r.state = 'basement'; r.visible = false; r.x = s.x; r.y = s.y;
  } else if (s.mode === 'done') {
    const o = s.out;
    r.x = s.x; r.y = s.y; r.visible = true;
    if (o.kind === 'finish') { r.state = 'finish'; r.onLedge = B.finish.kind === 'ledge'; r.t = 0; this._setLoad(r, null); r.onBoard = -1; return; }
    const F = B.finish;
    let msg;
    if (o.kind === 'bored') msg = 'Tyler went round in circles until he got bored and went home.';
    else if (o.why === 'drop') msg = `Tyler dropped ${(Math.round(o.drop * 10) / 10)} m onto the ${o.y} m platform. He's fine. The bike isn't.`;
    else if (o.why === 'soft') msg = `Tyler dropped ${(Math.round(o.drop * 10) / 10)} m into the ${F.label}, and it's only good for ${F.maxDrop} m. He's fine. His mum isn't.`;
    else if (o.why === 'obstacle') msg = `Tyler rode straight into the ${o.label}. He's fine. The ${o.label} isn't.`;
    else if (o.why === 'side') msg = `Tyler hit the side of the ${F.label}. He's fine. His mum isn't.`;
    else if (B.drain && !s.drained) msg = W.hatchX === null ? "Tyler came down on the pavement: there was no trap door. He's fine. His mum isn't." : `Tyler missed the trap door by ${Math.abs(o.x - W.hatchX).toFixed(1)} m. He's fine. His mum isn't.`;
    else if (F.kind === 'ground') { const d = o.x < F.x0 ? F.x0 - o.x : o.x - F.x1; msg = `Tyler missed the ${F.label} by ${d.toFixed(1)} m. He's fine. His mum isn't.`; }
    else msg = `Tyler never made the ${F.label}. He's fine. His mum isn't.`;
    if (o.kind === 'bored') { r.state = 'gone'; r.visible = false; }
    else this._fall(r, (s.vx || 0) * 0.5, 1.5);
    this.fail(msg, null, true);
  }
}

function sleighStart(E, ev) {
  const L = this.level, z = L.zones[0];
  const run = boardRun(this.sim, z.y, z.x0 + 0.5);
  ev.touch = run ? run.x0 + 0.9 : z.x0 + 0.9;
  ev.s = { who: 'sleigh', x: ev.touch - 14, y: z.y + 6, state: 'fly', v: E.v, u: null, gy: z.y, loads: [] };
  ev.st = 0;
  this.builder.state = 'watch';
  this.events.push({ type: 'sleigh', what: 'bells' });
}
function sleighLoads(tr, ev, E, mass, fx) {
  for (const ld of ev.s.loads) tr._removeLoad(ld);
  ev.s.loads = [];
  if (mass <= 0) return true;
  for (const dx of [-0.7, 0.7]) {
    const bd = tr.sim.boardUnder(ev.s.u + dx, ev.s.gy);
    if (!bd || bd.broken) return false;
    const ld = { kind: 'board', board: bd.id, t: Math.max(0, Math.min(1, ev.s.u + dx - bd.x0)), mass: mass / 2, fx: fx / 2 };
    tr.sim.loads.push(ld); ev.s.loads.push(ld);
  }
  return true;
}
function sleighUpdate(E, ev, dt) {
  const s = ev.s, L = this.level;
  ev.st += dt;
  if (s.state === 'fly') {
    const k = Math.min(1, ev.st / 3.2);
    s.x = ev.touch - 14 * (1 - k); s.y = s.gy + 0.05 + 6 * (1 - k) * (1 - k);
    if (k >= 1) {
      s.u = ev.touch; s.state = 'slide'; ev.st = 0;
      if (!sleighLoads(this, ev, E, E.mass * 1.6, 0)) { s.state = 'crash'; s.vy = 0; this.fail('The sleigh missed the platform. Christmas is cancelled.', null, true); return; }
      this.events.push({ type: 'sleigh', what: 'touchdown', x: s.u });
    }
  } else if (s.state === 'slide') {
    const impact = 1 + 0.6 * Math.exp(-ev.st * 4);
    s.v = Math.max(0, s.v - E.mu * GRAV * dt);
    s.u += s.v * dt; s.x = s.u;
    const fx = s.v > 0 ? E.mu * E.mass * GRAV : 0;
    if (!sleighLoads(this, ev, E, E.mass * impact, fx)) {
      s.state = 'crash'; s.vy = 0; sleighLoads(this, ev, E, 0, 0);
      this.events.push({ type: 'sleigh', what: 'crash', x: s.x });
      this.fail('The sleigh went off the end of the platform. Christmas is cancelled.', null, true);
      return;
    }
    if (s.v <= 0) { s.state = 'parked'; ev.st = 0; this.events.push({ type: 'sleigh', what: 'stop', x: s.x }); }
  } else if (s.state === 'parked') {
    sleighLoads(this, ev, E, E.mass - (ev.st > 1 && ev.st < 6 ? 110 : 0), 0);   // Santa hops out for a bit
    if (ev.st > 1 && !ev.santaOut) { ev.santaOut = true; this.events.push({ type: 'sleigh', what: 'santa', x: s.x }); }
    if (ev.st > 7) { s.state = 'takeoff'; ev.st = 0; sleighLoads(this, ev, E, 0, 0); this.events.push({ type: 'sleigh', what: 'takeoff' }); }
  } else if (s.state === 'takeoff') {
    s.x += (2 + ev.st * 8) * dt; s.y += (ev.st * 4) * dt;
    if (ev.st > 4) { s.state = 'gone'; this._eventEnd(); }
  } else if (s.state === 'crash') {
    s.vy -= GRAV * dt; s.y += s.vy * dt; s.x += 2 * dt;
    if (s.y < L.groundAt(s.x)) s.y = L.groundAt(s.x);
  }
}

function fireworksStart(E, ev) {
  const z = this.level.zones[0];
  this.visitors.push(newVisitor(this, { style: 'terry', name: 'Terry', x: this.startX + 1.5, homeX: this.startX + 2.5, targetX: E.launchX + 0.8, mass: 120, gy: z.y }));
  ev.fired = 0; ev.st = 0; ev.lit = false;
  this.builder.state = 'watch';
}
function fireworksUpdate(E, ev, dt) {
  const T = this.visitors[0], z = this.level.zones[0];
  if (!ev.lit && T.state === 'act' && T.t > 1.2) { ev.lit = true; ev.st = 0; this.events.push({ type: 'fireworks', what: 'lit' }); }
  if (ev.lit && ev.fired < E.rockets) {
    ev.st += dt;
    if (ev.st > 0.7) {
      ev.st = 0;
      const rogue = E.rogue[ev.fired] ?? -1;
      this.events.push({ type: 'rocket', i: ev.fired, x: E.launchX, y: z.y + 0.7, rogue });
      ev.fired++;
      T.massK = 1.05;
    }
  } else if (ev.lit && ev.fired >= E.rockets) {
    ev.st += dt;
    if (ev.st > 3 && T.state === 'act') { T.state = 'back'; this.events.push({ type: 'fireworks', what: 'done' }); }
  }
  if (T.state === 'stuck' && !ev.lit) { ev.lit = true; ev.fired = E.rockets; }
  if ((ev.lit && ev.fired >= E.rockets && (T.state === 'gone' || T.state === 'stuck' || T.state === 'flat')) || ev.t > 200) this._eventEnd();
}

function launchStart(E, ev) {
  const z = this.level.zones[0];
  this.visitors.push(newVisitor(this, { style: 'astro', name: 'The astronaut', x: this.startX + 1.5, homeX: this.startX + 2.5, targetX: E.capsuleX, mass: 110, gy: z.y, climbV: 0.8 }));
  ev.stage = 'climb'; ev.st = 0; ev.rocketY = 0;
  this.builder.state = 'watch';
}
function launchUpdate(E, ev, dt) {
  const A = this.visitors[0];
  ev.st += dt;
  if (ev.stage === 'climb') {
    if (A.state === 'act' && A.t > 0.8) { A.state = 'gone'; A.visible = false; this._setLoad(A, null); ev.stage = 'count'; ev.st = 0; ev.n = 10; this.events.push({ type: 'launch', what: 'aboard' }); }
    if (A.state === 'stuck') { ev.stage = 'count'; ev.st = 0; ev.n = 10; this.events.push({ type: 'launch', what: 'scrub' }); }
  } else if (ev.stage === 'count') {
    if (ev.st > 1) { ev.st = 0; ev.n--; this.events.push({ type: 'launch', what: 'count', n: ev.n }); if (ev.n <= 0) { ev.stage = 'lift'; this.events.push({ type: 'launch', what: 'ignition' }); } }
  } else if (ev.stage === 'lift') {
    // engines build up on the pad, then the rocket climbs past the tower. The flame deflects
    // sideways off the pad at first, then the plume blasts whatever part of the tower the
    // nozzle is level with, working its way up.
    const t = ev.st, L = this.level, B = E.blast, rx = L.house.x1;
    const hold = 1.6;
    ev.rocketY = t < hold ? 0 : 0.7 * (t - hold) * (t - hold);
    const nozzle = ev.rocketY - 0.3;
    ev.nozzleY = nozzle;
    const ramp = Math.min(1, t / 1.0);
    const fade = ev.rocketY > 20 ? Math.max(0, 1 - (ev.rocketY - 20) / 12) : 1;
    this.sim.blastAt = (n) => {
      const side = Math.exp(-Math.max(0, n.x - rx) / 5);
      const ground = Math.exp(-Math.max(0, nozzle) / 3) * Math.exp(-Math.max(0, n.y) / 2.5);
      const dz = (n.y - nozzle) / 1.8, plume = Math.exp(-dz * dz);
      return B * n.expo * side * ramp * fade * (1.2 * ground + plume) * (1 + 0.3 * Math.sin(t * 23 + n.y * 1.7));
    };
    if (ev.rocketY > 45) { this.sim.blastAt = null; ev.stage = 'done'; this.events.push({ type: 'launch', what: 'away' }); }
  } else if (ev.stage === 'done') this._eventEnd();
}

const EVENTS = {
  hoist: [hoistStart, hoistUpdate],
  party: [partyStart, partyUpdate],
  zip: [zipStart, zipUpdate],
  chute: [chuteStart, chuteUpdate],
  bmx: [bmxStart, bmxUpdate],
  sleigh: [sleighStart, sleighUpdate],
  fireworks: [fireworksStart, fireworksUpdate],
  launch: [launchStart, launchUpdate],
};

export function eventMixin(T) {
  Object.assign(T.prototype, {
    _afterDeliveries() {
      const L = this.level;
      if (L.event && EVENTS[L.event.type] && !this.evDone && !this.skipDeliveries) {
        this.phase = 'event';
        this.ev = { t: 0, type: L.event.type };
        const b = this.builder;
        b.visible = true; b.x = this.startX + 0.8; b.y = L.groundAt(b.x); b.face = -1; b.mode = 'ground'; b.state = 'watch';
        EVENTS[L.event.type][0].call(this, L.event, this.ev);
        return;
      }
      this._startNight();
    },
    _eventUpdate(dt) {
      if (this.phase !== 'event') return;
      this.ev.t += dt;
      for (const v of this.visitors) visitorStep(this, v, dt);
      EVENTS[this.ev.type][1].call(this, this.level.event, this.ev, dt);
    },
    _eventEnd() {
      if (this.phase !== 'event') return;
      this.evDone = true;
      this.sim.blast = 0; this.sim.blastAt = null;
      this._startNight();
    },
    _removeLoad(ld) {
      if (!ld) return;
      const i = this.sim.loads.indexOf(ld);
      if (i >= 0) this.sim.loads.splice(i, 1);
    },
    _visitorsTick(dt) { if (this.phase !== 'event') for (const v of this.visitors) visitorStep(this, v, dt); },
  });
}
