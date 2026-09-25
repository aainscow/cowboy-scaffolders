// ============================================================================
//  SCAFFOLD engine: 2D XPBD structural sim + construction/loading trial runner.
//  Pure logic, no rendering. Units: metres, kilograms, seconds, newtons.
// ============================================================================

export const GRAV = 9.81;

export const MATS = {
  tube:  { id: 'tube',  name: 'Tube',       kgPerM: 10, K: 3e7, T: 26000, Y: 26000, EI: 9000,  Mcont: 2400, cost: 12 },
  heavy: { id: 'heavy', name: 'Heavy tube', kgPerM: 17, K: 6e7, T: 60000, Y: 60000, EI: 26000, Mcont: 6500, cost: 28 },
};
export const BOARDS = {
  board: { id: 'board', name: 'Timber boards', kgPerM: 26, cap: 360,  cost: 18 },
  deck:  { id: 'deck',  name: 'Steel deck',    kgPerM: 42, cap: 1500, cost: 50 },
  trap:  { id: 'trap',  name: 'Trap board',    kgPerM: 14, cap: 30,   cost: 12 }, // looks real, isn't
};
export const TIE = { K: 4e6, T: 5000, cost: 40 };
export const COUPLER = { k: 1000, M: 480 };
export const BASEPLATE = { k: 2500, M: 520, cost: 6 };
export const LADDER = { cost: 8, kgPerM: 9, maxLen: 4 };
export const LOCK = { cost: 25 };
export const TAG_COST = 150;
export const TRAP_REWARD = 100;      // police reward per chav handed over
export const SAFE_FALL = 3.5;        // a chav survives a drop up to this (metres)
export const GLAZIER = 120;          // per broken window
export const BOARDUP = { cost: 35 }; // plywood over a window
export const WINDOW_BREAK_KG = 100;  // dumping this much in front of a window puts a brick through it

// Windows a delivery will smash unless they're boarded up: heavy drops landing right in front of them.
export function windowsAtRisk(level) {
  const out = new Set();
  const ws = level.house.windows || [];
  for (const d of level.deliveries) {
    const it = ITEMS[d.item], z = level.zones[d.zone];
    if (it.mass < WINDOW_BREAK_KG) continue;
    ws.forEach((w, i) => {
      if (w.x < d.x + it.w / 2 + 0.3 && w.x + w.w > d.x - it.w / 2 - 0.3 && w.y >= z.y - 0.5 && w.y <= z.y + 1.8) out.add(i);
    });
  }
  return out;
}
export function windowInFront(level, x, y, pad = 0.3) {
  const ws = level.house.windows || [];
  const i = ws.findIndex(w => x > w.x - pad && x < w.x + w.w + pad && w.y >= y - 0.5 && w.y <= y + 1.8);
  return i;
}
export const CHAV_MASS = 65;
export const BUILDER_MASS = 90;
export const MAX_LEN = 3.2;

export const ITEMS = {
  hod:     { name: 'Hod of bricks',        mass: 45,   w: 0.5 },
  bags:    { name: 'Cement bags',          mass: 100,  w: 0.7 },
  tiles:   { name: 'Crate of roof tiles',  mass: 220,  w: 0.9 },
  pallet:  { name: 'Pallet of bricks',     mass: 420,  w: 1.0 },
  bath:    { name: 'Cast-iron bath',       mass: 190,  w: 1.6 },
  mixer:   { name: 'Cement mixer',         mass: 260,  w: 0.9 },
  anvil:   { name: 'Anvil',                mass: 160,  w: 0.5 },
  piano:   { name: 'Upright piano',        mass: 300,  w: 1.5 },
  safe:    { name: 'Walk-in safe',         mass: 850,  w: 0.9 },
  dumpy:   { name: 'Tonne bag of sand',    mass: 1000, w: 1.0 },
  grand:   { name: 'Grand piano',          mass: 520,  w: 1.8 },
  statue:  { name: 'Bronze elephant',      mass: 1600, w: 1.8 },
};

// ---------------------------------------------------------------------------
//  Level helpers
// ---------------------------------------------------------------------------
export function prepLevel(def) {
  const L = Object.assign({ ground: null, noBase: [], forbidden: [], wind: 0, gust: 0, maxTies: 99, heavy: false, deck: false, chavs: 0 }, def);
  L.groundCol = (gx) => {
    if (!L.ground) return 0;
    const i = Math.max(0, Math.min(L.W, Math.round(gx)));
    return L.ground[i] ?? 0;
  };
  L.groundAt = (x) => {
    if (!L.ground) return 0;
    if (x < 0 || x > L.W) return L.groundCol(x < 0 ? 0 : L.W);
    return L.groundCol(Math.round(x));
  };
  L.canBase = (gx) => !L.noBase.some(([a, b]) => gx >= a && gx <= b);
  L.inForbidden = (x, y) => L.forbidden.some(f => x > f.x0 + 1e-6 && x < f.x1 - 1e-6 && y > f.y0 + 1e-6 && y < f.y1 - 1e-6);
  L.onForbiddenEdgeOrIn = (x, y) => L.forbidden.some(f => x >= f.x0 - 1e-6 && x <= f.x1 + 1e-6 && y >= f.y0 - 1e-6 && y <= f.y1 + 1e-6 && !(Math.abs(y - f.y0) < 1e-6 && f.y0 <= L.groundCol(x)));
  L.canTie = (gx, gy) => {
    const h = L.house;
    if (gx < h.x0 || gx > h.x1 || gy < L.groundCol(gx) + 1 || gy > h.eaves) return false;
    for (const w of h.windows || []) if (gx >= w.x - 0.01 && gx <= w.x + w.w + 0.01 && gy >= w.y - 0.01 && gy <= w.y + w.h + 0.01) return false;
    if (h.door && gx >= h.door.x - 0.01 && gx <= h.door.x + h.door.w + 0.01 && gy <= h.door.h + 0.01) return false;
    return true;
  };
  return L;
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

export function pieceCost(p) {
  if (p.type === 'tube' || p.type === 'heavy') return MATS[p.type].cost * Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) + baseCostFor(p);
  if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') return BOARDS[p.type].cost * Math.abs(p.b[0] - p.a[0]);
  if (p.type === 'tie') return TIE.cost;
  if (p.type === 'ladder') return LADDER.cost * Math.abs(p.b[1] - p.a[1]);
  if (p.type === 'lock') return LOCK.cost;
  if (p.type === 'protect') return BOARDUP.cost;
  return 0;
}
function baseCostFor(p) { return 0; }

export function designCost(level, pieces) {
  let c = 0;
  const bases = new Set();
  for (const p of pieces) {
    c += pieceCost(p);
    if (p.type === 'tube' || p.type === 'heavy') {
      for (const pt of [p.a, p.b]) if (pt[1] === level.groundCol(pt[0]) && level.canBase(pt[0])) bases.add(pt[0] + ',' + pt[1]);
    }
  }
  return Math.round(c + bases.size * BASEPLATE.cost);
}

// Split a tube into grid-aligned segments (so it connects at every grid node it passes).
export function splitTube(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const g = Math.max(1, gcd(dx, dy));
  const pts = [];
  for (let i = 0; i <= g; i++) pts.push([a[0] + dx * i / g, a[1] + dy * i / g]);
  return pts;
}

// ---------------------------------------------------------------------------
//  Simulation
// ---------------------------------------------------------------------------
export class Sim {
  constructor(level) {
    this.level = level;
    this.nodes = [];
    this.members = [];
    this.boards = [];
    this.ties = [];
    this.ladders = [];
    this.joints = [];
    this.nodeMap = new Map();
    this.segMap = new Map();
    this.time = 0;
    this.substeps = 40;
    this.damping = 2.5;
    this.events = [];
    this.loads = [];
    this.jointsDirty = true;
    this.pieceSeq = 0;
    this.rng = mulberry32(12345);
  }
  key(gx, gy) { return gx + ',' + gy; }
  nodeAt(gx, gy) { const id = this.nodeMap.get(this.key(gx, gy)); return id === undefined ? null : this.nodes[id]; }

  _newNode(gx, gy, x, y, hidden = false) {
    const n = { id: this.nodes.length, gx, gy, dxg: gx, dyg: gy, x, y, px: x, py: y, vx: 0, vy: 0, self: 0, load: 0, w: 0,
      arms: [], hidden, fixed: hidden, base: false, contact: false, cx: x, anchor: -1, joints: [], tie: null, expo: 0, alive: true, fx: 0 };
    this.nodes.push(n);
    return n;
  }
  _ensureNode(gx, gy, x, y) {
    let n = this.nodeAt(gx, gy);
    if (n) return n;
    n = this._newNode(gx, gy, x, y);
    this.nodeMap.set(this.key(gx, gy), n.id);
    const L = this.level;
    if (Math.abs(gy - L.groundCol(gx)) < 1e-6 && L.canBase(gx)) {
      n.base = true; n.x = gx; n.y = gy; n.px = gx; n.py = gy; n.contact = true; n.cx = gx;
      const an = this._newNode(gx, gy, gx + 1, gy, true);
      an.dxg = gx + 1;
      n.anchor = an.id;
    }
    return n;
  }

  addPiece(p) {
    const pid = this.pieceSeq++;
    p._pid = pid;
    if (p.type === 'tube' || p.type === 'heavy') {
      const mat = MATS[p.type];
      const pts = splitTube(p.a, p.b);
      // find an existing reference node so new nodes attach to the (deformed) structure
      // New nodes are placed relative to the existing (deformed) structure: interpolate between
      // existing nodes along the tube, or offset from the nearest one. Tubes are fitted where the
      // structure actually is, so no fit-up stress is introduced.
      const ex = pts.map(([gx, gy]) => this.nodeAt(gx, gy));
      const idx = ex.map((n, i) => n ? i : -1).filter(i => i >= 0);
      const pos = pts.map(([gx, gy], i) => {
        if (ex[i]) return [ex[i].x, ex[i].y];
        if (!idx.length) return [gx, gy];
        let lo = -1, hi = -1;
        for (const k of idx) { if (k < i) lo = k; if (k > i && hi < 0) hi = k; }
        if (lo >= 0 && hi >= 0) {
          const f = (i - lo) / (hi - lo), A = ex[lo], B = ex[hi];
          return [A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f];
        }
        const r = ex[lo >= 0 ? lo : hi];
        return [r.x + gx - r.gx, r.y + gy - r.gy];
      });
      const ns = pts.map(([gx, gy], i) => this._ensureNode(gx, gy, pos[i][0], pos[i][1]));
      const mids = [];
      for (let i = 0; i < ns.length - 1; i++) {
        const a = ns[i], b = ns[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const sk = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
        if (this.segMap.has(sk) && !this.members[this.segMap.get(sk)].broken) continue;
        const Ld = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const m = { id: this.members.length, a: a.id, b: b.id, L: len, L0: len, Ld, age: 0, mat, piece: pid, broken: false,
          alpha: Ld / mat.K, f: 0, util: 0, mass: mat.kgPerM * Ld, Pc: Math.min(mat.Y, Math.PI * Math.PI * mat.EI / (Ld * Ld)), vertical: pts[i][0] === pts[i + 1][0] };
        this.members.push(m);
        this.segMap.set(sk, m.id);
        a.arms.push(m.id); b.arms.push(m.id);
        a.self += m.mass / 2; b.self += m.mass / 2;
        mids.push(m.id);
      }
      p._members = mids;
      for (const n of ns) this._rebuildJoints(n);
      this._updateExposure();
      return mids;
    }
    if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') {
      const bt = BOARDS[p.type];
      const x0 = Math.min(p.a[0], p.b[0]), x1 = Math.max(p.a[0], p.b[0]), y = p.a[1];
      const made = [];
      for (let x = x0; x < x1; x++) {
        const a = this.nodeAt(x, y), b = this.nodeAt(x + 1, y);
        if (!a || !b) continue;
        const sk = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
        const mid = this.segMap.get(sk);
        if (mid === undefined || this.members[mid].broken) continue;
        if (this.boards.some(bd => !bd.broken && bd.member === mid)) continue;
        const bd = { id: this.boards.length, a: a.id, b: b.id, member: mid, type: bt, x0: x, x1: x + 1, gy: y, broken: false, load: 0, piece: pid, mass: bt.kgPerM };
        this.boards.push(bd);
        a.self += bd.mass / 2; b.self += bd.mass / 2;
        made.push(bd.id);
      }
      this._updateExposure();
      return made;
    }
    if (p.type === 'ladder') {
      const top = this.nodeAt(p.b[0], p.b[1]);
      if (!top) return [];
      const ground = Math.abs(p.a[1] - this.level.groundCol(p.a[0])) < 1e-6;
      const bot = ground ? null : this.nodeAt(p.a[0], p.a[1]);
      const len = p.b[1] - p.a[1];
      const l = { id: this.ladders.length, x: p.a[0], y0: p.a[1], y1: p.b[1], len, top: top.id, bottom: bot ? bot.id : -1, locked: false, piece: pid, mass: LADDER.kgPerM * len };
      this.ladders.push(l);
      top.self += l.mass / 2;
      if (bot) bot.self += l.mass / 2;
      return [l.id];
    }
    if (p.type === 'lock') {
      const l = this.ladders.find(l => l.x === p.a[0] && l.y0 === p.a[1]);
      if (l) { l.locked = true; l.lockPiece = pid; }
      return l ? [l.id] : [];
    }
    if (p.type === 'tie') {
      const n = this.nodeAt(p.a[0], p.a[1]);
      if (!n || n.tie) return [];
      const t = { id: this.ties.length, node: n.id, ax: n.x, broken: false, f: 0, piece: pid, util: 0 };
      this.ties.push(t);
      n.tie = t.id;
      return [t.id];
    }
    return [];
  }

  _updateExposure() {
    for (const n of this.nodes) n.expo = 0;
    for (const m of this.members) if (!m.broken) { this.nodes[m.a].expo += m.L * 0.5; this.nodes[m.b].expo += m.L * 0.5; }
    for (const b of this.boards) if (!b.broken) { this.nodes[b.a].expo += 0.6; this.nodes[b.b].expo += 0.6; }
  }

  _rebuildJoints(n) {
    const old = new Map();
    for (const j of n.joints) old.set(j.key, j);
    const arms = [];
    for (const mid of n.arms) {
      const m = this.members[mid];
      if (m.broken) continue;
      const o = this.nodes[m.a === n.id ? m.b : m.a];
      arms.push({ mid, other: o.id, ang: Math.atan2(o.y - n.y, o.x - n.x), piece: m.piece, m });
    }
    if (n.base) {
      const an = this.nodes[n.anchor];
      arms.push({ mid: -1, other: an.id, ang: Math.atan2(an.y - n.y, an.x - n.x), piece: -1 });
    }
    arms.sort((p, q) => p.ang - q.ang);
    const k = arms.length;
    const pairs = [];
    if (k === 2) pairs.push([0, 1]);
    else if (k > 2) {
      let drop = -1, dropGap = -1;
      for (let i = 0; i < k; i++) {
        const A = arms[i], B = arms[(i + 1) % k];
        let gap = B.ang - A.ang; if (gap <= 0) gap += Math.PI * 2;
        const cont = isCollinear(A, B);
        if (!cont && gap > dropGap) { dropGap = gap; drop = i; }
      }
      for (let i = 0; i < k; i++) if (i !== drop) pairs.push([i, (i + 1) % k]);
    }
    n.joints = [];
    for (const [i, j] of pairs) {
      const A = arms[i], B = arms[j];
      const key = Math.min(A.mid, B.mid) + '|' + Math.max(A.mid, B.mid);
      const prev = old.get(key);
      let type, kk, M;
      if (A.mid === -1 || B.mid === -1) { type = 'base'; kk = BASEPLATE.k; M = BASEPLATE.M; }
      else if (isCollinear(A, B)) {
        // same tube, or two tubes joined end-to-end with a sleeve coupler
        type = 'cont'; const avg = (A.m.L + B.m.L) / 2;
        const EI = Math.min(A.m.mat.EI, B.m.mat.EI);
        kk = EI / avg; M = Math.min(A.m.mat.Mcont, B.m.mat.Mcont) * (A.piece === B.piece ? 1 : 0.7);
      }
      else { type = 'coupler'; kk = COUPLER.k; M = COUPLER.M; }
      const a = this.nodes[A.other], b = this.nodes[B.other];
      let rest, rest0, restD, age = 0;
      const dA = designAngle(a, n, b);
      if (prev && prev.a === A.other && prev.b === B.other) { rest = prev.rest; rest0 = prev.rest0; restD = prev.restD; age = prev.age; }
      else if (prev && prev.a === B.other && prev.b === A.other) { rest = -prev.rest; rest0 = -prev.rest0; restD = -prev.restD; age = prev.age; }
      else { rest = rest0 = angleAt(a, n, b); restD = rest0 + wrapPi(dA - rest0); }
      n.joints.push({ key, a: A.other, c: n.id, b: B.other, rest, rest0, restD, age, k: kk, alpha: 1 / kk, M, type, util: 0, slip: prev ? prev.slip : 0, ma: A.mid, mb: B.mid });
    }
    this.jointsDirty = true;
  }

  _flatJoints() {
    if (!this.jointsDirty) return this.joints;
    this.joints = [];
    for (const n of this.nodes) for (const j of n.joints) this.joints.push(j);
    this.jointsDirty = false;
    return this.joints;
  }

  breakMember(m, reason) {
    if (m.broken) return;
    m.broken = true;
    const a = this.nodes[m.a], b = this.nodes[m.b];
    a.arms = a.arms.filter(x => x !== m.id); b.arms = b.arms.filter(x => x !== m.id);
    a.self = Math.max(0, a.self - m.mass / 2); b.self = Math.max(0, b.self - m.mass / 2);
    this.events.push({ type: 'member', id: m.id, reason, ax: a.x, ay: a.y, bx: b.x, by: b.y, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2, mat: m.mat.id });
    for (const bd of this.boards) if (!bd.broken && bd.member === m.id) this.breakBoard(bd, 'support');
    this._rebuildJoints(a); this._rebuildJoints(b);
    this._updateExposure();
  }
  breakBoard(bd, reason) {
    if (bd.broken) return;
    bd.broken = true;
    const a = this.nodes[bd.a], b = this.nodes[bd.b];
    a.self = Math.max(0, a.self - bd.mass / 2); b.self = Math.max(0, b.self - bd.mass / 2);
    this.events.push({ type: 'board', id: bd.id, reason, ax: a.x, ay: a.y, bx: b.x, by: b.y, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2 });
    this._updateExposure();
  }
  breakTie(t) {
    if (t.broken) return;
    t.broken = true;
    this.nodes[t.node].tie = null;
    const n = this.nodes[t.node];
    this.events.push({ type: 'tie', id: t.id, x: n.x, y: n.y });
  }

  windAt(t) {
    const L = this.level;
    const breeze = 1.5 * Math.sin(t * 2.9) + 1.5 * Math.sin(t * 0.47 + 1.1);
    if (!L.wind) return breeze;
    const w = L.wind * (0.7 + 0.3 * Math.sin(t * 0.61) * Math.sin(t * 0.23 + 0.4));
    const g = L.gust * Math.pow(Math.max(0, Math.sin(t * 0.33 + 0.5)), 6);
    return (breeze + w + g) * (L.windDir || 1);
  }

  _applyLoads() {
    for (const n of this.nodes) { n.load = 0; n.efx = 0; }
    for (const b of this.boards) b.load = 0;
    for (const ld of this.loads) {
      if (ld.kind === 'board') {
        const bd = this.boards[ld.board];
        if (bd.broken) continue;
        // capacity is governed by bending: loads near a support barely stress the board
        bd.load += ld.mass * 4 * ld.t * (1 - ld.t) * (1 - 0.5 * (ld.cov || 0));
        this.nodes[bd.a].load += ld.mass * (1 - ld.t);
        this.nodes[bd.b].load += ld.mass * ld.t;
      } else if (ld.kind === 'member') {
        const m = this.members[ld.member];
        if (m.broken) continue;
        this.nodes[m.a].load += ld.mass * (1 - ld.t);
        this.nodes[m.b].load += ld.mass * ld.t;
      } else if (ld.kind === 'node') {
        this.nodes[ld.node].load += ld.mass;
        if (ld.fx) this.nodes[ld.node].efx += ld.fx;
      } else if (ld.kind === 'span') {
        // ladders: bottom (-1 = ground) and top node
        if (ld.a >= 0) this.nodes[ld.a].load += ld.mass * (1 - ld.t);
        this.nodes[ld.b].load += ld.mass * ld.t;
        if (ld.fx) this.nodes[ld.b].efx += ld.fx;
      }
      if (ld.fx && ld.kind === 'member') {
        const m = this.members[ld.member];
        if (!m.broken) { this.nodes[m.a].efx += ld.fx * (1 - ld.t); this.nodes[m.b].efx += ld.fx * ld.t; }
      }
      if (ld.fx && ld.kind === 'board') {
        const bd = this.boards[ld.board];
        if (!bd.broken) { this.nodes[bd.a].efx += ld.fx * (1 - ld.t); this.nodes[bd.b].efx += ld.fx * ld.t; }
      }
    }
  }

  step(dt) {
    this._applyLoads();
    const joints = this._flatJoints();
    const S = this.substeps, h = dt / S, h2 = h * h;
    const nodes = this.nodes, mem = this.members, ties = this.ties;
    const L = this.level;
    const sm = Math.min(1, h / 0.03);
    const damp = Math.exp(-this.damping * h);
    for (const n of nodes) {
      if (n.fixed) { n.w = 0; continue; }
      const m = n.self + n.load;
      n.alive = n.arms.length > 0 || n.load > 0;
      n.w = m > 0 ? 1 / m : 0;
    }
    // scaffolders pull freshly fitted tubes into line over a moment
    for (const m of mem) if (!m.broken && m.age < FIT_T) { m.age += dt; m.L = m.L0 + (m.Ld - m.L0) * smooth01(m.age / FIT_T); }
    for (const j of joints) if (j.age < FIT_T) { j.age += dt; j.rest = j.rest0 + (j.restD - j.rest0) * smooth01(j.age / FIT_T); }
    for (let s = 0; s < S; s++) {
      this.time += h;
      const wind = this.windAt(this.time);
      // predict
      for (const n of nodes) {
        if (n.w === 0) continue;
        const fx = wind * n.expo * (1 + 0.06 * Math.max(0, n.y)) + (n.efx || 0);
        n.fx = fx;
        n.vx += h * fx * n.w;
        n.vy -= h * GRAV;
        n.px = n.x; n.py = n.y;
        n.x += h * n.vx; n.y += h * n.vy;
      }
      // members
      for (const m of mem) {
        if (m.broken) continue;
        const a = nodes[m.a], b = nodes[m.b];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) continue;
        const C = d - m.L;
        const at = m.alpha / h2;
        const ws = a.w + b.w;
        if (ws === 0) continue;
        const dl = -C / (ws + at);
        const nx = dx / d, ny = dy / d;
        a.x -= a.w * dl * nx; a.y -= a.w * dl * ny;
        b.x += b.w * dl * nx; b.y += b.w * dl * ny;
        const F = -dl / h2;
        m.f += (F - m.f) * sm;
      }
      // joints (rotational springs, plastic beyond M)
      for (const j of joints) {
        if (j.type === 'base' && !nodes[j.c].contact) { j.util = 0; continue; }
        const a = nodes[j.a], c = nodes[j.c], b = nodes[j.b];
        const ux = a.x - c.x, uy = a.y - c.y, vx = b.x - c.x, vy = b.y - c.y;
        const lu = ux * ux + uy * uy, lv = vx * vx + vy * vy;
        if (lu < 1e-6 || lv < 1e-6) continue;
        const th = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        let C = th - j.rest;
        if (C > Math.PI) C -= 2 * Math.PI; else if (C < -Math.PI) C += 2 * Math.PI;
        // gradients
        const gax = uy / lu, gay = -ux / lu;
        const gbx = -vy / lv, gby = vx / lv;
        const gcx = -(gax + gbx), gcy = -(gay + gby);
        const wsum = a.w * (gax * gax + gay * gay) + b.w * (gbx * gbx + gby * gby) + c.w * (gcx * gcx + gcy * gcy);
        const at = j.alpha / h2;
        if (wsum + at === 0) continue;
        const dl = -C / (wsum + at);
        a.x += a.w * gax * dl; a.y += a.w * gay * dl;
        b.x += b.w * gbx * dl; b.y += b.w * gby * dl;
        c.x += c.w * gcx * dl; c.y += c.w * gcy * dl;
        // plastic slip
        const Cn = C + dl * wsum; // remaining violation (approx)
        const mom = j.k * Cn;
        j.util += (Math.abs(mom) / j.M - j.util) * sm;
        if (Math.abs(mom) > j.M) {
          const excess = Cn - Math.sign(Cn) * j.M / j.k;
          j.rest += excess; j.rest0 += excess; j.restD += excess;
          j.slip += Math.abs(excess);
        }
      }
      // ties (horizontal restraint to the wall)
      for (const t of ties) {
        if (t.broken) continue;
        const n = nodes[t.node];
        if (n.w === 0) continue;
        const C = n.x - t.ax;
        const at = (1 / TIE.K) / h2;
        const dl = -C / (n.w + at);
        n.x += n.w * dl;
        t.f += (Math.abs(dl / h2) - t.f) * sm;
      }
      // ground contact (sticky friction, can lift off)
      for (const n of nodes) {
        if (n.w === 0) continue;
        const g = L.groundAt(n.x);
        if (n.y <= g) {
          if (!n.contact) {
            n.contact = true; n.cx = n.x;
            if (n.base) for (const j of n.joints) if (j.type === 'base') {
              const an = nodes[j.a === n.anchor ? j.a : j.b];
              an.x = n.x + 1; an.y = g; an.px = an.x; an.py = an.y;
              j.rest = j.rest0 = j.restD = angleAt(nodes[j.a], n, nodes[j.b]); j.age = FIT_T;
            }
          }
          n.y = g; n.x = n.cx;
        } else if (n.contact) {
          if (n.y > g + 0.03) n.contact = false; else n.x = n.cx;
        }
      }
      // velocities
      for (const n of nodes) {
        if (n.w === 0) continue;
        n.vx = (n.x - n.px) / h * damp; n.vy = (n.y - n.py) / h * damp;
      }
    }
    // failure checks
    for (const m of mem) {
      if (m.broken) continue;
      const u = m.f >= 0 ? m.f / m.mat.T : -m.f / m.Pc;
      m.util = u;
      if (u > 1) this.breakMember(m, m.f >= 0 ? 'tension' : 'buckle');
    }
    for (const t of ties) {
      if (t.broken) continue;
      t.util = t.f / TIE.T;
      if (t.util > 1) this.breakTie(t);
    }
    for (const b of this.boards) {
      if (b.broken) continue;
      b.util = b.load / b.type.cap;
      if (b.load > b.type.cap) this.breakBoard(b, 'overload');
    }
  }

  maxDisp() {
    let d = 0, who = null;
    for (const n of this.nodes) {
      if (n.hidden || !n.alive) continue;
      const e = Math.hypot(n.x - n.gx, n.y - n.gy);
      if (e > d) { d = e; who = n; }
    }
    return { d, node: who };
  }

  // Find a climbing/walking route from the ground to a board node.
  // Route up ladders and along boards. Path: [{ground foot}, {node, via}, ...]
  findRoute(startX, targetNodes, dropX = null, { allowLocked = true, traps = 'walk' } = {}) {
    const nodes = this.nodes;
    const adj = new Map();
    const add = (a, b, w, kind, ref) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, w, kind, ref });
      adj.get(b).push({ to: a, w, kind, ref });
    };
    for (const b of this.boards) {
      if (b.broken) continue;
      if (b.type.id === 'trap' && traps === 'exclude') continue;
      add(b.a, b.b, b.type.id === 'trap' && traps === 'avoid' ? 500 : 1, 'walk', b.id);
    }
    const dist = new Map(), prev = new Map();
    const pq = [];
    for (const l of this.ladders) {
      if (!this.ladderOk(l)) continue;
      if (l.bottom >= 0) { add(l.bottom, l.top, l.len * 1.5, 'climb', l.id); continue; }
      if (l.locked && !allowLocked) continue;
      const d0 = Math.abs(l.x - startX) * 0.3 + l.len * 1.5;
      if (!dist.has(l.top) || d0 < dist.get(l.top)) {
        dist.set(l.top, d0); prev.set(l.top, { from: null, edge: { kind: 'climb', ref: l.id }, foot: l }); pq.push([d0, l.top]);
      }
    }
    while (pq.length) {
      pq.sort((p, q) => p[0] - q[0]);
      const [d, u] = pq.shift();
      if (d > dist.get(u)) continue;
      for (const e of adj.get(u) || []) {
        if (e.kind === 'climb') {
          const l = this.ladders[e.ref];
          if (l.locked && !allowLocked) continue;
        }
        const nd = d + e.w;
        if (!dist.has(e.to) || nd < dist.get(e.to)) {
          dist.set(e.to, nd); prev.set(e.to, { from: u, edge: e }); pq.push([nd, e.to]);
        }
      }
    }
    let best = null, bestC = Infinity;
    for (const t of targetNodes) {
      if (!dist.has(t)) continue;
      const c = dist.get(t) + (dropX === null ? 0 : Math.abs(nodes[t].gx - dropX) * 1.01);
      if (c < bestC) { bestC = c; best = t; }
    }
    if (best === null) return null;
    const path = [];
    let cur = best;
    while (true) {
      const p = prev.get(cur);
      path.unshift({ node: cur, via: p.edge });
      if (p.from === null) { path.unshift({ node: null, x: p.foot.x, y: p.foot.y0, via: null }); break; }
      cur = p.from;
    }
    return path;
  }
  // every node reachable from the ground (used by the chavs)
  reachable(allowLocked) {
    const all = [];
    for (const n of this.nodes) if (!n.hidden) all.push(n.id);
    const out = [];
    for (const id of all) { const r = this.findRoute(0, [id], null, { allowLocked }); if (r) out.push(id); }
    return out;
  }

  ladderOk(l) {
    const top = this.nodes[l.top];
    if (!top.arms.length) return false;
    if (Math.hypot(top.x - top.gx, top.y - top.gy) > 0.7) return false;
    if (l.bottom >= 0 && !this.nodes[l.bottom].arms.length) return false;
    return true;
  }
  ladderFoot(l) {
    if (l.bottom >= 0) { const n = this.nodes[l.bottom]; return { x: n.x, y: n.y }; }
    return { x: l.x, y: l.y0 };
  }

  boardsAtLevel(gy) { return this.boards.filter(b => !b.broken && b.gy === gy); }
  boardUnder(x, gy) { return this.boards.find(b => !b.broken && b.gy === gy && x >= b.x0 - 1e-6 && x <= b.x1 + 1e-6); }
}

function isCollinear(A, B) {
  if (A.mid < 0 || B.mid < 0) return false;
  let d = Math.abs(A.ang - B.ang);
  return Math.abs(d - Math.PI) < 0.05;
}

const FIT_T = 0.6;
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function designAngle(a, c, b) {
  const ux = a.dxg - c.dxg, uy = a.dyg - c.dyg, vx = b.dxg - c.dxg, vy = b.dyg - c.dyg;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}
function smooth01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

export function angleAt(a, c, b) {
  const ux = a.x - c.x, uy = a.y - c.y, vx = b.x - c.x, vy = b.y - c.y;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------
//  Design validation (static, no simulation)
// ---------------------------------------------------------------------------
export function validatePlacement(level, pieces, p) {
  const L = level;
  const inGrid = ([x, y]) => x >= 0 && x <= L.W && y <= L.H && y >= L.groundCol(x);
  const nodeSet = new Set();
  const segSet = new Set();
  const boardSet = new Set();
  const tieSet = new Set();
  const ladders = [];
  const lockSet = new Set();
  for (const q of pieces) {
    if (q.type === 'ladder') ladders.push(q);
    if (q.type === 'lock') lockSet.add(q.a.join(','));
    if (q.type === 'tube' || q.type === 'heavy') {
      const pts = splitTube(q.a, q.b);
      pts.forEach(pt => nodeSet.add(pt.join(',')));
      for (let i = 0; i < pts.length - 1; i++) segSet.add(segKey(pts[i], pts[i + 1]));
    } else if (q.type === 'board' || q.type === 'deck' || q.type === 'trap') {
      for (let x = Math.min(q.a[0], q.b[0]); x < Math.max(q.a[0], q.b[0]); x++) boardSet.add(x + ',' + q.a[1]);
    } else if (q.type === 'tie') tieSet.add(q.a.join(','));
  }
  if (p.type === 'tube' || p.type === 'heavy') {
    if (!inGrid(p.a) || !inGrid(p.b)) return 'Outside the building area';
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1];
    if (dx === 0 && dy === 0) return null;
    const len = Math.hypot(dx, dy);
    if (len > MAX_LEN + 1e-6) return 'Too long: tubes are at most 3 m';
    const pts = splitTube(p.a, p.b);
    for (const pt of pts) if (Math.abs(pt[1] - L.groundCol(pt[0])) < 1e-6 && !L.canBase(pt[0])) return "Can't put a base plate there";
    for (let i = 0; i <= 20; i++) {
      const x = p.a[0] + dx * i / 20, y = p.a[1] + dy * i / 20;
      if (L.inForbidden(x, y)) return 'Keep that area clear';
      if (y < L.groundAt(x) - 1e-6) return 'That would go into the ground';
    }
    let newSeg = false;
    for (let i = 0; i < pts.length - 1; i++) if (!segSet.has(segKey(pts[i], pts[i + 1]))) newSeg = true;
    if (!newSeg) return 'Already a tube there';
    const touches = pts.some(pt => nodeSet.has(pt.join(',')) || (Math.abs(pt[1] - L.groundCol(pt[0])) < 1e-6 && L.canBase(pt[0])));
    if (!touches) return 'Must connect to the ground or existing scaffold';
    return null;
  }
  if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') {
    const x0 = Math.min(p.a[0], p.b[0]), x1 = Math.max(p.a[0], p.b[0]);
    if (p.a[1] !== p.b[1] || x1 - x0 < 1) return 'Boards lie on horizontal tubes';
    for (let x = x0; x < x1; x++) {
      if (!segSet.has(segKey([x, p.a[1]], [x + 1, p.a[1]]))) return 'Boards need a horizontal tube underneath';
      if (boardSet.has(x + ',' + p.a[1])) return 'Already boarded';
    }
    return null;
  }
  const landing = ([x, y]) => nodeSet.has(x + ',' + y) && (boardSet.has((x - 1) + ',' + y) || boardSet.has(x + ',' + y));
  if (p.type === 'ladder') {
    if (p.a[0] !== p.b[0]) return 'Ladders go straight up';
    if (!inGrid(p.a) || !inGrid(p.b)) return 'Outside the building area';
    const len = p.b[1] - p.a[1];
    if (len < 1) return 'Drag the ladder upwards';
    if (len > LADDER.maxLen) return `Ladders are at most ${LADDER.maxLen} m`;
    const onGround = p.a[1] === L.groundCol(p.a[0]);
    if (onGround && !L.canBase(p.a[0])) return "Can't stand a ladder there";
    if (!onGround && !landing(p.a)) return 'The foot needs the ground or a boarded platform';
    if (!landing(p.b)) return 'The top needs a boarded platform to step off onto';
    for (let y = p.a[1]; y <= p.b[1] + 1; y += 0.25) if (L.inForbidden(p.a[0] + 0.3, y) || L.inForbidden(p.a[0] + 0.1, y)) return 'Keep that area clear';
    for (const q of ladders) if (q.a[0] === p.a[0] && q.a[1] < p.b[1] && q.b[1] > p.a[1]) return 'Already a ladder there';
    return null;
  }
  if (p.type === 'lock') {
    const l = ladders.find(q => q.a[0] === p.a[0] && q.a[1] === p.a[1]);
    if (!l) return 'Locks go on the foot of a ladder';
    if (lockSet.has(p.a.join(','))) return 'Already locked';
    return null;
  }
  if (p.type === 'protect') {
    const w = (L.house.windows || [])[p.a[0]];
    if (!w) return 'Click a window to board it up';
    if (pieces.some(q => q.type === 'protect' && q.a[0] === p.a[0])) return 'Already boarded up';
    return null;
  }
  if (p.type === 'tie') {
    if (!nodeSet.has(p.a.join(','))) return 'Ties attach to a scaffold joint';
    if (!L.canTie(p.a[0], p.a[1])) return 'Nothing solid to tie into there';
    if (tieSet.has(p.a.join(','))) return 'Already tied';
    if (tieSet.size >= L.maxTies) return L.maxTies === 0 ? 'No ties allowed on this job' : `Only ${L.maxTies} tie${L.maxTies > 1 ? 's' : ''} allowed`;
    return null;
  }
  return 'Unknown';
}
function segKey(a, b) { const s = a.join(','), t = b.join(','); return s < t ? s + '|' + t : t + '|' + s; }

// Static requirement checks: platforms boarded + builder access.
export function checkRequirements(level, pieces) {
  const sim = new Sim(level);
  for (const p of pieces) sim.addPiece({ ...p });
  const zones = level.zones.map(z => {
    let covered = 0;
    for (let x = z.x0; x < z.x1; x++) { const b = sim.boardUnder(x + 0.5, z.y); if (b && b.type.id !== 'trap') covered++; }
    const need = z.x1 - z.x0;
    const zNodes = [];
    for (const b of sim.boardsAtLevel(z.y)) if (b.x1 > z.x0 && b.x0 < z.x1) zNodes.push(b.a, b.b);
    const route = zNodes.length ? sim.findRoute(level.startX ?? level.W + 2, zNodes, null, { traps: 'exclude' }) : null;
    return { covered, need, boarded: covered >= need, reachable: !!route };
  });
  return { zones, ok: zones.every(z => z.boarded && z.reachable) };
}

// ---------------------------------------------------------------------------
//  Trial runner: construction sequence, then the builder delivers the loads.
// ---------------------------------------------------------------------------
export const PIECE_ANIM = 0.22, PIECE_SETTLE = 0.3;
const COLLAPSE_DISP = 0.45;

export class Trial {
  constructor(level, pieces) {
    this.level = level;
    this.pieces = pieces.map(p => ({ ...p }));
    this.sim = new Sim(level);
    this.phase = 'build';
    this.t = 0;
    this.idx = 0;
    this.pieceT = 0;
    this.building = null;
    this.result = null;
    this.failT = 0;
    this.items = [];
    this.log = [];
    this.events = [];
    this.startX = level.startX ?? level.W + 2;
    this.builder = { who: 'dave', x: this.startX, y: level.groundAt(this.startX), state: 'idle', mode: 'ground', carrying: null, face: -1, t: 0, onMember: -1, onBoard: -1, onLadder: -1, visible: false, load: null };
    this.deliv = 0;
    this.maxDispSeen = 0;
    this.chavs = [];
    this.tags = [];
    this.chavT = 0;
    this.rng = mulberry32(777 + (level.id || 0));
  }

  fail(reason, where) {
    if (this.result) return;
    this.phase = 'failing';
    this.failT = 0;
    this.sim.damping = 0.3;
    // anyone on the scaffold, or standing right under it, gets caught up in the wreckage
    const W = this.level.W;
    for (const p of [this.builder, ...this.chavs]) {
      if (!p.visible || p.state === 'gone' || p.state === 'falling' || p.state === 'flat') continue;
      const near = p.x > -0.3 && p.x < W + 0.3 && p.y < 2.5 + this.level.groundAt(p.x);
      if (this._onStructure(p) || near) {
        const n = this._nearestNode(p.x, p.y + 0.9);
        p.tangled = true;
        this._fall(p, n ? n.vx : 0, n ? n.vy : 0);
      }
    }
    const trapped = this.chavs.filter(c => c.state === 'falling' && c.tangled).length + (this.trappedCount || 0);
    this.result = { ok: false, reason, where, trapped, sued: !!this.sued };
    this.result.daveDown = this.builder.state === 'falling';
  }
  _nearestNode(x, y) {
    let best = null, bd = 2.5;
    for (const n of this.sim.nodes) {
      if (n.hidden || !n.arms.length) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _onStructure(p) { return p.visible && p.state !== 'falling' && p.state !== 'flat' && (p.onBoard >= 0 || p.onLadder >= 0 || p.onMember >= 0); }

  update(dt) {
    const sim = this.sim;
    this.t += dt;
    if (this.phase === 'done') { sim.step(dt); this._items(dt); this._people(dt); return; }
    if (this.phase === 'build') {
      if (this.idx >= this.pieces.length) { this.phase = 'settle'; this.pieceT = 0; }
      else {
        this.building = this.pieces[this.idx];
        this.pieceT += dt;
        if (this.pieceT >= PIECE_ANIM && !this.building._added) {
          sim.addPiece(this.building); this.building._added = true;
        }
        if (this.pieceT >= PIECE_ANIM + PIECE_SETTLE) { this.idx++; this.pieceT = 0; this.building = null; }
      }
    } else if (this.phase === 'settle') {
      this.pieceT += dt;
      if (this.pieceT > 0.8) this._startDelivery();
    } else if (this.phase === 'deliver') {
      this._builder(dt);
    } else if (this.phase === 'chavs') {
      this.chavT += dt;
      this._chavsUpdate(dt);
      if (this.chavs.every(c => c.state === 'gone' || c.state === 'flat') || this.chavT > 60) { this.phase = 'hold'; this.pieceT = 0; this.builder.state = 'waving'; }
    } else if (this.phase === 'hold') {
      this.pieceT += dt;
      if (this.pieceT > 2.5 && !this.result) { this.phase = 'done'; this.result = { ok: true, tags: this.tags.length, trapped: this.trappedCount || 0 }; }
    } else if (this.phase === 'failing') {
      this.failT += dt;
      if (this.failT > 4.5) this.phase = 'done';
    }
    this._people(dt);
    sim.step(dt);
    this._items(dt);
    for (const ev of sim.events) this.log.push(ev);
    if (this.phase !== 'failing' && this.phase !== 'done') {
      const md = sim.maxDisp();
      this.maxDispSeen = Math.max(this.maxDispSeen, md.d);
      if (md.d > COLLAPSE_DISP) this.fail(this.phase === 'build' ? `Collapsed during construction (piece ${this.idx + 1} of ${this.pieces.length})` : this.phase === 'chavs' ? 'The chavs brought it down' : 'The scaffold collapsed under load', md.node);
      for (const ev of sim.events) if (ev.type === 'board' && ev.reason === 'overload') {
        if (sim.boards[ev.id].type.id === 'trap') { this.events.push({ type: 'trapSprung', ev }); continue; }
        this.fail('A board snapped under the weight', ev);
      }
    }
    sim.events.length = 0;
  }

  // ---- people shared helpers ----
  _people(dt) {
    for (const p of [this.builder, ...this.chavs]) {
      if (!p.visible) continue;
      if (p.state === 'falling') {
        p.vy -= GRAV * dt; p.y += p.vy * dt; p.x += p.vx * dt;
        const g = this.level.groundAt(p.x);
        if (p.y <= g) {
          p.y = g; p.state = 'flat';
          const h = (p.fallFrom ?? g) - g;
          this.events.push({ type: 'splat', who: p, h });
          if (p.who === 'chav' && !p.tangled) {
            if (h > SAFE_FALL) { p.dead = true; this.sued = true; this.fail(`SUED! A chav fell ${h.toFixed(1)} m through your scaffold.`); if (this.result) this.result.sued = true; }
            else { p.trapped = true; this.trappedCount = (this.trappedCount || 0) + 1; this.events.push({ type: 'nicked', who: p }); }
          }
        }
        continue;
      }
      if (p.state === 'flat' || p.state === 'gone') continue;
      if (this.phase !== 'failing' && this.phase !== 'done' && this._unsupported(p)) {
        const bd = p.onBoard >= 0 ? this.sim.boards[p.onBoard] : null;
        const trap = bd && bd.type.id === 'trap';
        if (!trap) p.tangled = true;
        this._fall(p, 0, 0);
        if (p === this.builder) this.fail(trap ? 'Dave fell through a trap board! The only way up went over it.' : 'Dave fell off!');
        else if (!trap) this.fail('A chav fell off');
        continue;
      }
      if (this.phase === 'failing') this._cling(p);
    }
  }
  _unsupported(p) {
    const sim = this.sim;
    if (p.onBoard >= 0 && sim.boards[p.onBoard].broken) return true;
    if (p.onLadder >= 0 && !sim.ladderOk(sim.ladders[p.onLadder])) return true;
    if (p.onMember >= 0 && sim.members[p.onMember].broken) return true;
    return false;
  }
  _fall(p, vx, vy) {
    p.fallFrom = p.y;
    p.state = 'falling'; p.vx = vx; p.vy = vy; p.onMember = -1; p.onBoard = -1; p.onLadder = -1;
    this._setLoad(p, null);
    if (p.carrying) { this._dropItem(p.carrying, p.x, p.y + 0.8, 0); p.carrying.vr = (this.rng() - 0.5) * 4; p.carrying = null; }
  }
  _cling(p) {
    // ride whatever they are on while it comes down; let go when it gets violent
    const sim = this.sim;
    if (!this._onStructure(p)) return;
    let n = null;
    if (p.onBoard >= 0) { const bd = sim.boards[p.onBoard]; n = sim.nodes[bd.a]; const nb = sim.nodes[bd.b]; const t = Math.max(0, Math.min(1, (p.u ?? p.x) - bd.x0)); p.x = n.x + (nb.x - n.x) * t; p.y = n.y + (nb.y - n.y) * t; }
    else if (p.onLadder >= 0) { n = sim.nodes[sim.ladders[p.onLadder].top]; }
    else if (p.onMember >= 0) { const m = sim.members[p.onMember]; n = sim.nodes[m.a]; }
    if (!n || Math.hypot(n.vx, n.vy) > 2.2 || this.failT > 1.2) this._fall(p, n ? n.vx : 0, n ? Math.max(0, n.vy) : 0);
  }
  _setLoad(p, ld) {
    const sim = this.sim;
    if (p.load) { const i = sim.loads.indexOf(p.load); if (i >= 0) sim.loads.splice(i, 1); }
    p.load = ld;
    if (ld) sim.loads.push(ld);
  }
  _pos(e) { if (e.node === null) return { x: e.x, y: e.y }; const n = this.sim.nodes[e.node]; return { x: n.x, y: n.y }; }
  // advance a person along p.route; returns true when the end (or start, if returning) is reached
  _routeStep(p, dt, mass, climbV, walkV) {
    const sim = this.sim, route = p.route;
    const i = p.routeI;
    if (i >= route.length || i < 0) return true;
    const step = route[i];
    const from = p.returning ? route[i + 1] : route[i - 1];
    const edge = p.returning ? route[i + 1].via : step.via;
    const pa = this._pos(from), pb = this._pos(step);
    let len = 1, v = walkV;
    if (edge.kind === 'climb') { len = sim.ladders[edge.ref].len; v = climbV; }
    p.segT = Math.min(1, p.segT + v * dt / len);
    const t = p.segT;
    p.x = pa.x + (pb.x - pa.x) * t; p.y = pa.y + (pb.y - pa.y) * t;
    p.mode = edge.kind;
    if (edge.kind === 'walk') {
      const bd = sim.boards[edge.ref];
      p.face = Math.sign(pb.x - pa.x) || p.face;
      p.onBoard = bd.id; p.onLadder = -1; p.onMember = -1;
      this._setLoad(p, { kind: 'board', board: bd.id, t: bd.a === from.node ? t : 1 - t, mass });
    } else {
      const l = sim.ladders[edge.ref];
      const fromBottom = from.node === null || from.node === l.bottom;
      const tt = fromBottom ? t : 1 - t;
      p.onLadder = l.id; p.onBoard = -1; p.onMember = -1; p.ladderT = tt; p.ladderX = l.x;
      this._setLoad(p, { kind: 'span', a: l.bottom, b: l.top, t: tt, mass });
    }
    if (p.segT >= 1) { p.segT = 0; p.routeI += p.returning ? -1 : 1; }
    return false;
  }
  // stand on the board under design-x p.u at level zy
  _placeOnBoard(p, zy, mass, fx = 0) {
    const sim = this.sim;
    p.zy = zy;
    const bd = sim.boardUnder(p.u, zy);
    if (!bd) return false;
    const na = sim.nodes[bd.a], nb = sim.nodes[bd.b];
    const t = Math.max(0, Math.min(1, p.u - bd.x0));
    p.x = na.x + (nb.x - na.x) * t; p.y = na.y + (nb.y - na.y) * t;
    p.onBoard = bd.id; p.onLadder = -1; p.onMember = -1;
    this._setLoad(p, { kind: 'board', board: bd.id, t, mass, fx });
    return true;
  }
  _walkGround(p, tx, v, dt) {
    const dir = Math.sign(tx - p.x);
    p.face = dir || p.face;
    p.mode = 'ground';
    p.onBoard = p.onLadder = p.onMember = -1;
    p.x += dir * Math.min(Math.abs(tx - p.x), v * dt);
    p.y = this.level.groundAt(p.x);
    return Math.abs(tx - p.x) < 1e-3;
  }

  // ---- Dave ----
  _startDelivery() {
    if (this.result) return;
    const L = this.level;
    const b = this.builder;
    if (this.skipDeliveries) this.deliv = L.deliveries.length;
    if (this.deliv >= L.deliveries.length) {
      if (L.chavs > 0) { this.phase = 'chavs'; this.chavT = 0; this._spawnChavs(); b.state = 'watch'; b.visible = true; b.x = this.startX + 0.8; b.face = -1; }
      else { this.phase = 'hold'; this.pieceT = 0; b.state = 'waving'; }
      return;
    }
    this.phase = 'deliver';
    const d = L.deliveries[this.deliv];
    const z = L.zones[d.zone];
    const item = { def: ITEMS[d.item], key: d.item, x: this.startX, y: 0, vx: 0, vy: 0, state: 'carried', loads: [], rot: 0, vr: 0, targetX: d.x, zoneY: z.y };
    this.items.push(item);
    b.visible = true; b.carrying = item; b.x = this.startX; b.y = L.groundAt(this.startX); b.mode = 'ground';
    const cands = [];
    for (const bd of this.sim.boardsAtLevel(z.y)) if (bd.x1 > z.x0 - 0.01 && bd.x0 < z.x1 + 0.01) cands.push(bd.a, bd.b);
    const route = this.sim.findRoute(this.startX, cands, d.x, { traps: 'avoid' });
    if (!route) { this.fail("Dave can't get up to the platform"); return; }
    b.route = route; b.routeI = 0; b.segT = 0; b.returning = false; b.u = null;
    b.state = 'toBase';
    const endX = this.sim.nodes[route[route.length - 1].node].gx;
    const side = endX === d.x ? (d.x > z.x0 ? -1 : 1) : Math.sign(endX - d.x);
    let sx = Math.abs(endX - d.x) <= ITEMS[d.item].w / 2 + 0.9 ? endX : d.x + side * (ITEMS[d.item].w / 2 + 0.3);
    sx = Math.max(z.x0 + 0.15, Math.min(z.x1 - 0.15, sx));
    b.dropX = sx; b.itemX = d.x;
  }

  _builder(dt) {
    const b = this.builder, sim = this.sim;
    if (!b.visible || b.state === 'falling' || b.state === 'flat') return;
    const mass = BUILDER_MASS + (b.carrying ? b.carrying.def.mass : 0);
    const heavy = b.carrying ? Math.min(1, b.carrying.def.mass / 800) : 0;
    const climbV = 0.8 * (1 - 0.35 * heavy) * (b.returning ? 1.8 : 1);
    const walkV = 1.5 * (1 - 0.3 * heavy) * (b.returning ? 1.4 : 1);
    b.t += dt;
    const route = b.route;
    if (b.state === 'toBase') {
      if (this._walkGround(b, route[0].x, walkV * 1.3, dt)) { b.state = 'route'; b.routeI = 1; b.segT = 0; }
      return;
    }
    if (b.state === 'toVan') {
      if (this._walkGround(b, this.startX, walkV * 1.3, dt)) { b.state = 'idle'; this.deliv++; this._startDelivery(); }
      return;
    }
    if (b.state === 'route') {
      if (this._routeStep(b, dt, mass, climbV, walkV)) {
        if (!b.returning) b.state = 'toDrop';
        else { b.state = 'toVan'; this._setLoad(b, null); }
      }
      return;
    }
    if (b.state === 'toDrop') {
      const zy = b.carrying.zoneY;
      if (b.u === null || b.u === undefined) b.u = sim.nodes[route[route.length - 1].node].gx;
      const dir = Math.sign(b.dropX - b.u);
      b.face = dir || b.face; b.mode = 'walk';
      b.u += dir * Math.min(Math.abs(b.dropX - b.u), walkV * dt);
      if (!this._placeOnBoard(b, zy, mass)) { this._fall(b, 0, 0); this.fail('Dave fell off!'); return; }
      if (Math.abs(b.dropX - b.u) < 1e-3) { b.state = 'dump'; b.t = 0; }
      return;
    }
    if (b.state === 'dump') {
      this._placeOnBoard(b, b.zy, mass);
      if (b.t > 0.55 && b.carrying) { const it = b.carrying; b.carrying = null; this._dropItem(it, b.itemX, b.y + 0.75, -0.4); }
      if (b.t > 1.1) b.state = 'backToRoute';
      return;
    }
    if (b.state === 'backToRoute') {
      const end = sim.nodes[route[route.length - 1].node];
      const dir = Math.sign(end.gx - b.u);
      b.face = dir || b.face;
      b.u += dir * Math.min(Math.abs(end.gx - b.u), walkV * dt);
      if (!this._placeOnBoard(b, b.zy, mass)) { this._fall(b, 0, 0); return; }
      if (Math.abs(end.gx - b.u) < 1e-3) { b.u = null; b.returning = true; b.state = 'route'; b.routeI = route.length - 2; b.segT = 0; }
    }
  }

  // ---- chavs ----
  _spawnChavs() {
    const L = this.level;
    this.chavs = [];
    for (let i = 0; i < L.chavs; i++) {
      this.chavs.push({ who: 'chav', id: i, x: -4 - i * 0.9, y: L.groundAt(-4), state: 'wait', delay: 0.4 + i * 2.4, visible: false, mode: 'ground', face: 1, t: 0,
        onBoard: -1, onLadder: -1, onMember: -1, load: null, phase: this.rng() * 6, swings: 0, u: null });
    }
  }
  _chavPlan(c) {
    const sim = this.sim, L = this.level;
    // 1) an unlocked way up? go as high as possible and tag the wall
    const eaves = L.house.eaves;
    const levels = [...new Set(sim.boards.filter(b => !b.broken).map(b => b.gy))]
      .sort((a, b) => ((b + 1.3 < eaves) - (a + 1.3 < eaves)) || b - a);
    for (const gy of levels) {
      const nodes = [];
      for (const bd of sim.boardsAtLevel(gy)) nodes.push(bd.a, bd.b);
      const route = sim.findRoute(c.x, nodes, null, { allowLocked: false });
      if (route) {
        const bds = sim.boardsAtLevel(gy).filter(bd => bd.x0 >= L.house.x0 - 0.5 && bd.x1 <= L.house.x1 + 0.5);
        const pool = bds.length ? bds : sim.boardsAtLevel(gy);
        const pick = pool[Math.floor(this.rng() * pool.length)];
        c.plan = 'climb'; c.route = route; c.routeI = 0; c.segT = 0; c.returning = false;
        c.tagX = pick.x0 + 0.3 + this.rng() * 0.4; c.target = route[0].x;
        return;
      }
    }
    // 2) something low enough to jump up and swing on
    const taken = new Set(this.chavs.filter(o => o !== c && o.member !== undefined).map(o => o.member));
    const low = sim.members.filter(m => {
      if (m.broken) return false;
      const a = sim.nodes[m.a], b = sim.nodes[m.b];
      if (a.gy !== b.gy) return false;
      const h = a.gy - L.groundCol(Math.round((a.gx + b.gx) / 2));
      return h >= 1 && h <= 2.6;
    });
    const free = low.filter(m => !taken.has(m.id));
    if (free.length && c.swings < 2) {
      const m = free[Math.floor(this.rng() * free.length)];
      c.plan = 'swing'; c.member = m.id;
      c.target = (sim.nodes[m.a].gx + sim.nodes[m.b].gx) / 2;
      return;
    }
    // 3) rattle a locked ladder, then give up
    const locked = sim.ladders.filter(l => l.locked && l.bottom < 0 && sim.ladderOk(l));
    if (locked.length && !c.rattled) { const l = locked[c.id % locked.length]; c.plan = 'rattle'; c.ladder = l.id; c.target = l.x + 0.3; return; }
    c.plan = 'leave'; c.target = -6;
  }
  _chavsUpdate(dt) {
    for (const c of this.chavs) this._chav(c, dt);
  }
  _chav(c, dt) {
    const sim = this.sim;
    if (c.state === 'gone' || c.state === 'falling' || c.state === 'flat') return;
    c.t += dt;
    if (c.state === 'wait') { if (c.t > c.delay) { c.visible = true; c.state = 'plan'; } return; }
    if (c.state === 'plan') { this._chavPlan(c); c.state = 'go'; c.t = 0; return; }
    if (c.state === 'go') {
      if (this._walkGround(c, c.target, 1.7, dt)) {
        c.t = 0;
        if (c.plan === 'climb') { c.state = 'route'; c.routeI = 1; c.segT = 0; }
        else if (c.plan === 'swing') { c.state = 'hang'; c.swings++; }
        else if (c.plan === 'rattle') c.state = 'rattle';
        else { c.state = 'gone'; c.visible = false; }
      }
      return;
    }
    if (c.state === 'route') {
      if (this._routeStep(c, dt, CHAV_MASS, 1.3, 1.8)) {
        if (!c.returning) { c.state = 'toTag'; c.u = sim.nodes[c.route[c.route.length - 1].node].gx; }
        else { c.state = 'plan2'; this._setLoad(c, null); c.onLadder = -1; }
      }
      return;
    }
    if (c.state === 'toTag') {
      const zy = sim.nodes[c.route[c.route.length - 1].node].gy;
      const dir = Math.sign(c.tagX - c.u);
      c.face = dir || c.face; c.mode = 'walk';
      c.u += dir * Math.min(Math.abs(c.tagX - c.u), 1.6 * dt);
      if (!this._placeOnBoard(c, zy, CHAV_MASS)) { c.state = 'backToRoute'; return; }
      if (Math.abs(c.tagX - c.u) < 1e-3) { c.state = 'spray'; c.t = 0; }
      return;
    }
    if (c.state === 'spray') {
      this._placeOnBoard(c, c.zy, CHAV_MASS);
      if (c.t > 2.6) {
        const L = this.level;
        const onWall = c.x > L.house.x0 + 0.2 && c.x < L.house.x1 - 0.2 && c.y + 1.3 < L.house.eaves;
        const tag = { x: c.x, y: c.y + 1.25, style: (this.tags.length + c.id) % 4, onWall };
        if (onWall) { this.tags.push(tag); this.events.push({ type: 'tag', tag }); }
        c.state = 'bounce'; c.t = 0;
      }
      return;
    }
    if (c.state === 'bounce') {
      const k = Math.max(0, Math.sin(c.t * 9 + c.phase));
      this._placeOnBoard(c, c.zy, CHAV_MASS * (0.3 + 1.6 * k), 90 * Math.sin(c.t * 4.5));
      c.hop = k;
      if (c.t > 3.5) { c.hop = 0; c.state = 'backToRoute'; }
      return;
    }
    if (c.state === 'backToRoute') {
      const end = sim.nodes[c.route[c.route.length - 1].node];
      const dir = Math.sign(end.gx - c.u);
      c.face = dir || c.face;
      c.u += dir * Math.min(Math.abs(end.gx - c.u), 1.8 * dt);
      this._placeOnBoard(c, c.zy, CHAV_MASS);
      if (Math.abs(end.gx - c.u) < 1e-3) { c.u = null; c.returning = true; c.state = 'route'; c.routeI = c.route.length - 2; c.segT = 0; }
      return;
    }
    if (c.state === 'hang') {
      const m = sim.members[c.member];
      const a = sim.nodes[m.a], b = sim.nodes[m.b];
      c.x = (a.x + b.x) / 2; c.y = (a.y + b.y) / 2 - 2.0;
      c.onMember = m.id; c.onBoard = -1; c.onLadder = -1;
      c.swing = Math.sin(c.t * 2.4 + c.phase) * Math.min(1, c.t / 1.5);
      this._setLoad(c, { kind: 'member', member: m.id, t: 0.5, mass: CHAV_MASS * (1 + 0.35 * Math.abs(c.swing)), fx: 340 * c.swing });
      if (c.t > 6.5) { this._setLoad(c, null); c.onMember = -1; c.swing = 0; c.state = 'plan2'; c.t = 0; c.y = this.level.groundAt(c.x); }
      return;
    }
    if (c.state === 'rattle') {
      const l = sim.ladders[c.ladder];
      c.rattled = true;
      this._setLoad(c, { kind: 'span', a: -1, b: l.top, t: 0.001, mass: 0, fx: 160 * Math.sin(c.t * 9) });
      if (c.t > 3) { this._setLoad(c, null); c.state = 'plan2'; c.t = 0; }
      return;
    }
    if (c.state === 'plan2') {
      // one more go at something, then leave
      if (c.plan === 'swing' && c.swings < 2 && this.rng() < 0.6) { c.state = 'plan'; return; }
      if (c.plan === 'rattle') { c.plan = 'leave'; }
      c.plan = 'leave'; c.target = -6; c.state = 'go'; c.t = 0;
      return;
    }
  }

  _dropItem(it, x, y, vy) {
    it.state = 'falling'; it.x = x; it.y = y; it.vy = vy; it.vx = 0; it.dropY = y;
  }

  _itemSupport(it) {
    // Distribute an item's footprint over boards at its zone level.
    const sim = this.sim;
    const x0 = it.x - it.def.w / 2, x1 = it.x + it.def.w / 2;
    const parts = [];
    let tot = 0;
    for (const bd of sim.boards) {
      if (bd.broken || bd.gy !== it.zoneY) continue;
      const o0 = Math.max(x0, bd.x0), o1 = Math.min(x1, bd.x1);
      if (o1 - o0 <= 1e-6) continue;
      parts.push({ bd, w: o1 - o0, t: ((o0 + o1) / 2 - bd.x0), cov: (o1 - o0) / (bd.x1 - bd.x0) });
      tot += o1 - o0;
    }
    const centerOn = parts.some(p => it.x >= p.bd.x0 - 1e-6 && it.x <= p.bd.x1 + 1e-6);
    if (!parts.length || !centerOn) return null;
    return parts.map(p => ({ bd: p.bd, share: p.w / tot, t: p.t, cov: p.cov }));
  }

  _surfaceY(it) {
    const sup = this._itemSupport(it);
    if (!sup) return null;
    let y = 0;
    for (const s of sup) { const a = this.sim.nodes[s.bd.a], b = this.sim.nodes[s.bd.b]; y += s.share * (a.y + (b.y - a.y) * s.t); }
    return y + 0.08;
  }

  _items(dt) {
    const sim = this.sim;
    for (const it of this.items) {
      if (it.state === 'carried') {
        const b = this.builder;
        it.x = b.x; it.y = b.y + 1.55;
      } else if (it.state === 'falling') {
        it.vy -= GRAV * dt;
        const ny = it.y + it.vy * dt;
        it.rot += it.vr * dt;
        const sy = it.zoneY !== null && it.y > it.zoneY - 0.2 ? this._surfaceY(it) : null;
        if (sy !== null && ny <= sy && it.y >= sy - 0.3) {
          const sup = this._itemSupport(it);
          it.state = 'placed'; it.y = sy;
          // Impact: the load ramps in with a dynamic overshoot that decays (timber flex).
          it.impact = 0.55 * Math.min(1, Math.abs(it.vy) / 4);
          it.landT = 0;
          it.loads = sup.map(s => ({ kind: 'board', board: s.bd.id, t: s.t, share: s.share, cov: s.cov, mass: 0 }));
          for (const ld of it.loads) sim.loads.push(ld);
          this.events?.push?.({ type: 'land', item: it });
          it.landed = true;
          it.vy = 0;
        } else {
          it.y = ny;
          const g = this.level.groundAt(it.x);
          if (it.y <= g) {
            it.y = g; it.vy = 0; it.state = 'ground'; it.vr = 0;
            if (this.phase !== 'failing' && this.phase !== 'done') this.fail(`The ${it.def.name.toLowerCase()} fell off the scaffold`);
          }
        }
      } else if (it.state === 'placed') {
        const alive = it.loads.every(ld => !sim.boards[ld.board].broken);
        if (!alive) {
          for (const ld of it.loads) { const i = sim.loads.indexOf(ld); if (i >= 0) sim.loads.splice(i, 1); }
          it.loads = []; it.state = 'falling'; it.zoneY = null; it.vr = (Math.random() - 0.5) * 3;
        } else {
          const sy = this._surfaceY(it);
          if (sy !== null) it.y = sy;
          it.landT += dt;
          const tt = it.landT;
          const ramp = Math.min(1, tt / 0.07);
          const f = ramp * (1 + it.impact * (tt < 0.07 ? 1 : Math.exp(-(tt - 0.07) / 0.18)));
          for (const ld of it.loads) ld.mass = it.def.mass * ld.share * f;
        }
      }
    }
  }
}
