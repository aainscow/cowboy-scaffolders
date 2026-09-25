// ============================================================================
//  Scaffold renderer (instanced), Dave the builder, loads, debris, particles.
// ============================================================================
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const COL = {
  steel: new THREE.Color(0xbfc7cd), heavy: new THREE.Color(0xf0b90b),
  warm: new THREE.Color(0xffb020), hot: new THREE.Color(0xff2a10), sel: new THREE.Color(0xff4d3a),
  wood: new THREE.Color(0xffffff), woodHot: new THREE.Color(0xff5030),
  trap: new THREE.Color(0xff9a8a), alu: new THREE.Color(0xdfe4e8), lock: new THREE.Color(0xf3d40b),
};
function stressColor(base, u, out) {
  if (u < 0.35) return out.copy(base);
  if (u < 0.7) return out.copy(base).lerp(COL.warm, (u - 0.35) / 0.35);
  return out.copy(COL.warm).lerp(COL.hot, Math.min(1, (u - 0.7) / 0.3));
}

class InstPool {
  constructor(geo, mat, max, { shadow = true, color = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadow; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    if (color) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.max = max; this.n = 0;
    root.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(mat4, color) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, mat4);
    if (color && this.mesh.instanceColor) this.mesh.setColorAt(this.n, color);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
function segMatrix(ax, ay, az, bx, by, bz, r = 1, out = _m) {
  _v.set(bx - ax, by - ay, bz - az);
  const len = _v.length() || 1e-6;
  _q.setFromUnitVectors(UP, _v.multiplyScalar(1 / len));
  _v2.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  _s.set(r, len, r);
  return out.compose(_v2, _q, _s);
}

const tubeGeo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, 1, 10, 1);
const tubeGeoHeavy = new THREE.CylinderGeometry(TUBE_R * 1.35, TUBE_R * 1.35, 1, 10, 1);
const couplerGeo = new RoundedBoxGeometry(0.1, 0.1, 0.1, 2, 0.02);
const plankGeo = new THREE.BoxGeometry(1, 0.038, 0.225);
const deckGeo = new THREE.BoxGeometry(1, 0.05, 0.3);
const plateGeo = new THREE.BoxGeometry(0.16, 0.012, 0.16);
const soleGeo = new THREE.BoxGeometry(0.24, 0.04, 1.75);
const tieRingGeo = new THREE.TorusGeometry(0.05, 0.015, 6, 12);
const lockGeo = new THREE.BoxGeometry(0.5, 1.3, 0.03);
const padGeo = new RoundedBoxGeometry(0.09, 0.1, 0.05, 2, 0.015);

class ScaffoldView {
  constructor() {
    this.tubes = new InstPool(tubeGeo, M.steel, 2600);
    this.heavy = new InstPool(tubeGeoHeavy, M.heavy, 1200);
    this.couplers = new InstPool(couplerGeo, M.coupler, 1400);
    this.planks = new InstPool(plankGeo, M.wood, 900);
    this.decks = new InstPool(deckGeo, M.deck, 500);
    this.plates = new InstPool(plateGeo, M.coupler, 80);
    this.soles = new InstPool(soleGeo, M.wood, 40);
    this.rings = new InstPool(tieRingGeo, M.coupler, 40, { color: false });
    this.alu = new InstPool(tubeGeo, M.alu, 900);
    this.locks = new InstPool(lockGeo, M.lock, 30);
    this.padlocks = new InstPool(padGeo, M.brass, 30, { color: false });
    this.ghost = new InstPool(tubeGeo, M.ghost, 800, { shadow: false, color: false });
    this.ghost.mesh.receiveShadow = false;
    this.zoff = [];
  }
  // src: { nodes, members, boards, ties } from a Sim (live or static design sim)
  update(sim, opt = {}) {
    const { stress = false, highlight = null, zoff = null, ghost = null, hiBoard = null, showTraps = false } = opt;
    const T = this.tubes, H = this.heavy, C = this.couplers, P = this.planks, D = this.decks;
    const pools = [T, H, C, P, D, this.plates, this.soles, this.rings, this.ghost, this.alu, this.locks, this.padlocks];
    for (const p of pools) p.begin();
    const nodes = sim.nodes;
    const nz = (n) => (zoff ? zoff[n.id] || 0 : 0);
    const nodeU = new Float32Array(nodes.length);
    for (const j of sim.joints) nodeU[j.c] = Math.max(nodeU[j.c], j.util);
    // members: inner + outer frame
    for (const m of sim.members) {
      if (m.broken) continue;
      const a = nodes[m.a], b = nodes[m.b];
      const heavy = m.mat.id === 'heavy';
      const pool = heavy ? H : T;
      let col = heavy ? COL.heavy : COL.steel;
      if (highlight && highlight.has(m.piece)) col = COL.sel;
      else if (stress) col = stressColor(col, Math.max(m.util, 0.8 * Math.max(nodeU[m.a], nodeU[m.b])), _c);
      for (const z of [Z_IN, Z_OUT]) {
        pool.push(segMatrix(a.x, a.y, z + nz(a), b.x, b.y, z + nz(b)), col);
      }
    }
    // nodes: couplers, transoms, base plates
    for (const n of nodes) {
      if (n.hidden || !n.arms.length) continue;
      const z0 = nz(n);
      let col = COL.steel;
      if (stress) col = stressColor(_c.set(0x7a828a), nodeU[n.id], new THREE.Color());
      else col = _c.set(0x7a828a);
      for (const z of [Z_IN, Z_OUT]) { _m.makeTranslation(n.x, n.y, z + z0); C.push(_m, col); }
      T.push(segMatrix(n.x, n.y + 0.055, Z_IN - 0.12 + z0, n.x, n.y + 0.055, Z_OUT + 0.12 + z0), COL.steel);
      if (n.base && n.contact) {
        for (const z of [Z_IN, Z_OUT]) { _m.makeTranslation(n.x, n.y + 0.046, z + z0); this.plates.push(_m); }
        _m.makeTranslation(n.x, n.y + 0.02, Z_MID + z0); this.soles.push(_m);
      }
    }
    // boards
    for (const bd of sim.boards) {
      if (bd.broken) continue;
      const a = nodes[bd.a], b = nodes[bd.b];
      const deck = bd.type.id === 'deck';
      const pool = deck ? D : P;
      const k = deck ? 4 : 5;
      const w = (Z_OUT - Z_IN + 0.1) / k;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) + 0.12;
      const ang = Math.atan2(dy, dx);
      let col = COL.wood;
      if (hiBoard && hiBoard.has(bd.piece)) col = COL.sel;
      else if (showTraps && bd.type.id === 'trap') col = COL.trap;
      else if (stress) col = stressColor(COL.wood, bd.util || 0, _c);
      for (let i = 0; i < k; i++) {
        const z = Z_IN - 0.05 + w * (i + 0.5) + (nz(a) + nz(b)) / 2;
        _q.setFromAxisAngle(_v.set(0, 0, 1), ang);
        _v2.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.105, z);
        _s.set(len, 1, deck ? 0.94 : 1);
        _m.compose(_v2, _q, _s);
        pool.push(_m, col);
      }
    }
    // ties: short tube into the wall + ring
    for (const t of sim.ties) {
      if (t.broken) continue;
      const n = nodes[t.node];
      let col = COL.steel;
      if (highlight && highlight.has(t.piece)) col = COL.sel;
      else if (stress) col = stressColor(COL.steel, t.util || 0, _c);
      T.push(segMatrix(n.x, n.y - 0.07, Z_IN + nz(n), t.ax, n.y - 0.07, 0.02), col);
      _m.makeTranslation(t.ax, n.y - 0.07, 0.03); this.rings.push(_m);
    }
    // ladders: aluminium, leaning on the outer frame, running 1 m past the landing
    for (const l of sim.ladders || []) {
      const F = sim.ladderFoot(l), top = nodes[l.top];
      let dx = top.x - F.x, dy = top.y - F.y;
      const len0 = Math.hypot(dx, dy) || 1; dx /= len0; dy /= len0;
      const len = len0 + 1.0;
      const zt = (t) => ladderZ(t * len / len0) + nz(top) * t;
      const hi = (highlight && (highlight.has(l.piece) || highlight.has(l.lockPiece)));
      const col = hi ? COL.sel : COL.alu;
      const cx = F.x + LAD_OFF;
      for (const side of [-0.2, 0.2]) this.alu.push(segMatrix(cx + side, F.y, zt(0), cx + side + dx * len, F.y + dy * len, zt(1), 1.25), col);
      for (let d = 0.25; d < len - 0.05; d += 0.28) {
        const k = d / len, px = cx + dx * d, py = F.y + dy * d;
        this.alu.push(segMatrix(px - 0.2, py, zt(k), px + 0.2, py, zt(k), 0.8), col);
      }
      if (l.locked) {
        _q.identity(); _s.set(1, 1, 1);
        _v2.set(cx, F.y + 0.75, zt(0.75 / len) + 0.04); _m.compose(_v2, _q, _s); this.locks.push(_m, hi ? COL.sel : COL.lock);
        _m.makeTranslation(cx + 0.18, F.y + 0.9, zt(0.9 / len) + 0.08); this.padlocks.push(_m);
      }
    }
    if (ghost) for (const g of ghost) this.ghost.push(segMatrix(g[0], g[1], Z_OUT, g[2], g[3], Z_OUT, 1.6));
    for (const p of pools) p.end();
  }
}

// ---------------------------------------------------------------------------
//  People: Dave and the local youth
// ---------------------------------------------------------------------------
const STYLES = {
  dave: { top: 0xff6a13, vest: true, sleeve: 0x2b3a55, legs: 0x3a3f46, shoe: 0x6b4423, hat: 'hard', hatCol: 0xf6f6f2, skin: 0xe0a987 },
  chav0: { top: 0x8a1c2b, sleeve: 0x8a1c2b, legs: 0x8a1c2b, shoe: 0xf6f6f6, hat: 'cap', hatCol: 0xf6f6f6, skin: 0xefc3a0, stripe: 0xffffff, can: 0xff2d8a },
  chav1: { top: 0x24398a, sleeve: 0x24398a, legs: 0x24398a, shoe: 0xf6f6f6, hat: 'cap', hatCol: 0x141414, skin: 0x8d5a3b, stripe: 0xffffff, can: 0x2dff6a },
  chav2: { top: 0xa1a7ad, sleeve: 0xa1a7ad, legs: 0x5e6369, shoe: 0xf6f6f6, hat: 'cap', hatCol: 0xd8c690, skin: 0xf2c9a8, stripe: 0x111111, can: 0x2dc8ff },
  police: { top: 0xc8f000, vest: true, glow: 0x88aa00, sleeve: 0x1b2233, legs: 0x1b2233, shoe: 0x111111, hat: 'police', hatCol: 0x141c2e, skin: 0xe8b996 },
  chav3: { top: 0x161616, sleeve: 0x161616, legs: 0x161616, shoe: 0xf6f6f6, hat: 'cap', hatCol: 0xb0122a, skin: 0xd79e7a, stripe: 0xffffff, can: 0xffd12d },
};
const personMats = {};
function pmats(key) {
  if (personMats[key]) return personMats[key];
  const st = STYLES[key];
  const std = (c, r = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
  return (personMats[key] = {
    skin: std(st.skin, 0.7), top: st.vest ? std(st.top, 0.55, { emissive: st.glow ?? 0xff5000, emissiveIntensity: 0.12 }) : std(st.top, 0.6),
    sleeve: std(st.sleeve, 0.8), legs: std(st.legs, 0.8), shoe: std(st.shoe, 0.6), hat: std(st.hatCol, 0.35),
    refl: new THREE.MeshStandardMaterial({ color: 0xe9eef2, metalness: 0.7, roughness: 0.25 }),
    stripe: st.stripe ? std(st.stripe, 0.6) : null, can: st.can ? std(st.can, 0.3, { metalness: 0.6 }) : null,
    eye: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
  });
}
function addHat(parent, st, mt, part) {
  if (st.hat === 'police') {
    const h = part(new THREE.SphereGeometry(0.14, 16, 12), mt.hat, 0, 0.12, 0, parent); h.scale.set(1, 1.55, 1.05);
    part(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), mt.hat, 0, 0.04, 0, parent);
    part(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xdfe4e8, metalness: 0.9, roughness: 0.2 }), 0, 0.17, 0.13, parent);
  } else if (st.hat === 'hard') {
    part(new THREE.SphereGeometry(0.148, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mt.hat, 0, 0.05, 0, parent).scale.set(1, 0.95, 1.08);
    part(new THREE.CylinderGeometry(0.17, 0.17, 0.018, 20), mt.hat, 0, 0.055, 0.03, parent).scale.set(1, 1, 1.12);
  } else {
    part(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mt.hat, 0, 0.04, 0, parent);
    const brim = part(new THREE.BoxGeometry(0.2, 0.014, 0.14), mt.hat, 0, 0.05, -0.17, parent); // worn backwards, obviously
    brim.rotation.x = -0.12;
  }
}
function makePerson(key) {
  const st = STYLES[key], mt = pmats(key);
  const g = new THREE.Group();
  const pivot = new THREE.Group(); g.add(pivot);
  const body = new THREE.Group(); pivot.add(body);
  const part = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  part(new RoundedBoxGeometry(0.36, 0.2, 0.22, 2, 0.05), mt.legs, 0, 0, 0, hips);
  const torso = new THREE.Group(); hips.add(torso);
  part(new RoundedBoxGeometry(0.44, 0.56, 0.26, 2, 0.07), mt.top, 0, 0.36, 0, torso);
  if (st.vest) {
    part(new THREE.BoxGeometry(0.452, 0.045, 0.272), mt.refl, 0, 0.22, 0, torso);
    part(new THREE.BoxGeometry(0.452, 0.045, 0.272), mt.refl, 0, 0.36, 0, torso);
    part(new THREE.BoxGeometry(0.05, 0.3, 0.272), mt.refl, -0.12, 0.52, 0.001, torso);
    part(new THREE.BoxGeometry(0.05, 0.3, 0.272), mt.refl, 0.12, 0.52, 0.001, torso);
  } else {
    part(new THREE.BoxGeometry(0.02, 0.5, 0.02), mt.stripe, 0, 0.38, 0.132, torso); // zip
    part(new THREE.BoxGeometry(0.2, 0.08, 0.28), mt.stripe, 0, 0.66, 0, torso).scale.set(1, 1, 0.97);
  }
  part(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), mt.skin, 0, 0.68, 0, torso);
  const head = new THREE.Group(); head.position.y = 0.8; torso.add(head);
  part(new THREE.SphereGeometry(0.125, 16, 12), mt.skin, 0, 0, 0, head).scale.set(1, 1.1, 1);
  part(new THREE.BoxGeometry(0.035, 0.05, 0.05), mt.skin, 0, -0.01, 0.125, head);
  part(new THREE.SphereGeometry(0.014, 6, 6), mt.eye, -0.045, 0.03, 0.115, head);
  part(new THREE.SphereGeometry(0.014, 6, 6), mt.eye, 0.045, 0.03, 0.115, head);
  addHat(head, st, mt, part);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 0.6, 0); torso.add(sh);
    part(new THREE.CapsuleGeometry(0.058, 0.2, 4, 8), mt.sleeve, 0, -0.14, 0, sh);
    if (mt.stripe) part(new THREE.BoxGeometry(0.02, 0.26, 0.02), mt.stripe, s * 0.055, -0.14, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    part(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), st.vest ? mt.skin : mt.sleeve, 0, -0.13, 0, el);
    part(new THREE.SphereGeometry(0.058, 8, 6), mt.skin, 0, -0.28, 0, el);
    if (s === 1 && mt.can) part(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), mt.can, 0, -0.33, 0.05, el);
    arms.push({ sh, el });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.05, 0); hips.add(hp);
    part(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), mt.legs, 0, -0.22, 0, hp);
    if (mt.stripe) part(new THREE.BoxGeometry(0.02, 0.8, 0.02), mt.stripe, s * 0.075, -0.42, 0, hp);
    const kn = new THREE.Group(); kn.position.y = -0.43; hp.add(kn);
    part(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), mt.legs, 0, -0.2, 0, kn);
    part(new RoundedBoxGeometry(0.13, 0.1, 0.25, 2, 0.03), mt.shoe, 0, -0.42, 0.04, kn);
    legs.push({ hp, kn });
  }
  g.userData = { pivot, body, hips, torso, head, arms, legs, key, anim: { phase: Math.random() * 6, z: 2.4, yaw: 0, lastX: 0, lastY: 0 } };
  return g;
}

const dave = makePerson('dave');
dave.visible = false;
root.add(dave);
const chavMeshes = [];
function chavMesh(i) {
  while (chavMeshes.length <= i) { const m = makePerson('chav' + (chavMeshes.length % 4)); m.visible = false; root.add(m); chavMeshes.push(m); }
  return chavMeshes[i];
}

// Ladders lean on the outside of the outer frame: foot a little further out than the top.
const LAD_OFF = 0.32;
const ladderZ = (t) => Z_OUT + 0.46 - 0.3 * t;

function animatePerson(g, p, dt, t) {
  const u = g.userData, A = u.anim;
  g.visible = !!p.visible && p.state !== 'gone' && !p.ragdolled;
  if (!g.visible) return;
  const isDave = p.who === 'dave';
  const pz = p.z ?? A.z;
  const moving = Math.hypot(p.x - A.lastX, p.y - A.lastY, pz - (A.lastZ ?? pz)) / Math.max(dt, 1e-4);
  A.lastX = p.x; A.lastY = p.y; A.lastZ = pz;
  const st = p.state;
  const onBoard = p.onBoard >= 0 && p.mode !== 'climb';
  const mode = ['dump', 'waving', 'watch', 'spray', 'bounce', 'hang', 'rattle'].includes(st) ? st : p.mode;
  const cuffed = st === 'cuffed';
  const groundZ = isDave ? 2.4 : 2.55 + (p.id || 0) * 0.14;
  let x = p.x, y = p.y, zT = groundZ, yawT = p.face > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (mode === 'climb') { x = p.x + LAD_OFF; zT = ladderZ(p.ladderT ?? 0) + 0.34; yawT = Math.PI; }
  else if (onBoard || mode === 'walk') { zT = isDave ? Z_MID : Z_MID + 0.15; y += 0.125; }
  if (mode === 'waving' || mode === 'watch') { yawT = 0; }
  if (mode === 'spray') { yawT = Math.PI; zT = Z_IN + 0.32; y = p.y + 0.125; }
  if (mode === 'bounce') { y = p.y + 0.125 + (p.hop || 0) * 0.35; zT = Z_MID; yawT = Math.sin(t * 3) * 0.6; }
  if (mode === 'hang') { zT = Z_OUT + 0.3; yawT = Math.PI; }
  if (mode === 'rattle') { yawT = Math.PI; zT = Z_OUT + 0.85; x = p.x; }
  A.z += (zT - A.z) * Math.min(1, dt * 8);
  A.yaw += wrapAngle(yawT - A.yaw) * Math.min(1, dt * 10);
  A.phase += dt * Math.min(10, 2 + moving * 7);
  const ph = A.phase;
  const carrying = !!p.carrying;
  u.pivot.position.set(0, 0, 0); u.pivot.rotation.set(0, 0, 0);
  u.body.rotation.set(0, 0, 0); u.body.position.set(0, 0, 0);
  u.torso.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0);
  for (const a of u.arms) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  for (const l of u.legs) { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); }
  const walkLegs = (amp) => {
    u.legs[0].hp.rotation.x = Math.sin(ph) * amp; u.legs[1].hp.rotation.x = -Math.sin(ph) * amp;
    u.legs[0].kn.rotation.x = Math.max(0, -Math.sin(ph - 0.8)) * amp * 1.4; u.legs[1].kn.rotation.x = Math.max(0, Math.sin(ph - 0.8)) * amp * 1.4;
    u.body.position.y = Math.abs(Math.cos(ph)) * 0.03 * amp;
  };
  const armsUp = () => { for (const a of u.arms) { a.sh.rotation.x = -2.9; a.el.rotation.x = -0.3; } u.arms[0].sh.rotation.z = 0.15; u.arms[1].sh.rotation.z = -0.15; };
  if (mode === 'ground' || mode === 'walk') {
    const amp = moving > 0.05 ? (carrying ? 0.45 : 0.6) : 0.02;
    walkLegs(amp);
    if (carrying) { armsUp(); u.torso.rotation.z = Math.sin(ph) * 0.05; }
    else if (!isDave && moving > 0.05) { // the swagger
      u.arms[0].sh.rotation.x = -Math.sin(ph) * 0.3; u.arms[1].sh.rotation.x = -0.9; u.arms[1].el.rotation.x = -1.3;
      u.torso.rotation.z = Math.sin(ph) * 0.1; u.head.rotation.z = Math.sin(ph * 0.5) * 0.15;
    } else { u.arms[0].sh.rotation.x = -Math.sin(ph) * amp * 0.9; u.arms[1].sh.rotation.x = Math.sin(ph) * amp * 0.9; u.arms[0].el.rotation.x = -0.3; u.arms[1].el.rotation.x = -0.3; }
  } else if (mode === 'climb') {
    const s = Math.sin(ph * 0.9);
    u.legs[0].hp.rotation.x = -0.7 - s * 0.45; u.legs[1].hp.rotation.x = -0.7 + s * 0.45;
    u.legs[0].kn.rotation.x = 1.1 + s * 0.4; u.legs[1].kn.rotation.x = 1.1 - s * 0.4;
    u.body.position.z = -0.08;
    if (carrying) { u.arms[1].sh.rotation.x = -2.9; u.arms[1].el.rotation.x = -0.2; u.arms[0].sh.rotation.x = -2.0 + s * 0.4; u.arms[0].el.rotation.x = -0.6; }
    else { u.arms[0].sh.rotation.x = -2.2 + s * 0.45; u.arms[1].sh.rotation.x = -2.2 - s * 0.45; u.arms[0].el.rotation.x = -0.7; u.arms[1].el.rotation.x = -0.7; }
  } else if (mode === 'dump') {
    const k = Math.min(1, p.t / 0.55);
    for (const a of u.arms) { a.sh.rotation.x = -2.9 + k * 1.6; a.el.rotation.x = -0.3 * (1 - k); }
    u.torso.rotation.x = k * 0.35;
    u.legs[0].hp.rotation.x = -0.3 * k; u.legs[0].kn.rotation.x = 0.4 * k;
  } else if (mode === 'waving') {
    u.arms[1].sh.rotation.z = -2.6; u.arms[1].el.rotation.z = Math.sin(t * 9) * 0.5;
    u.head.rotation.z = Math.sin(t * 3) * 0.08;
  } else if (mode === 'watch') {
    // Dave on his phone, not watching at all
    u.arms[1].sh.rotation.x = -0.4; u.arms[1].sh.rotation.z = -0.3; u.arms[1].el.rotation.x = -2.2;
    u.arms[0].sh.rotation.x = -0.5; u.arms[0].el.rotation.x = -1.3; u.arms[0].sh.rotation.z = 0.4;
    u.head.rotation.x = 0.45 + Math.sin(t * 0.7) * 0.05;
  } else if (mode === 'spray') {
    u.arms[1].sh.rotation.x = -1.9 + Math.sin(t * 14) * 0.08; u.arms[1].sh.rotation.z = Math.sin(t * 2.3) * 0.5;
    u.arms[0].sh.rotation.x = -0.3;
    u.legs[0].hp.rotation.x = 0.1;
  } else if (mode === 'bounce') {
    const k = p.hop || 0;
    u.legs[0].kn.rotation.x = u.legs[1].kn.rotation.x = (1 - k) * 0.7;
    u.legs[0].hp.rotation.x = u.legs[1].hp.rotation.x = -(1 - k) * 0.4;
    u.arms[0].sh.rotation.z = 2.4 + k * 0.5; u.arms[1].sh.rotation.z = -2.4 - k * 0.5;
    u.head.rotation.z = Math.sin(t * 6) * 0.2;
  } else if (mode === 'hang') {
    // hands on the tube, swinging like a pendulum
    y = p.y + 2.0;
    u.pivot.position.y = 0; u.body.position.y = -2.0;
    u.pivot.rotation.x = (p.swing || 0) * 0.55;
    u.pivot.rotation.z = (p.swing || 0) * 0.15;
    for (const a of u.arms) { a.sh.rotation.x = -3.05; }
    u.legs[0].hp.rotation.x = -0.3 - (p.swing || 0) * 0.5; u.legs[1].hp.rotation.x = -0.1 - (p.swing || 0) * 0.6;
    u.legs[0].kn.rotation.x = 0.5; u.legs[1].kn.rotation.x = 0.3;
  } else if (mode === 'rattle') {
    for (const a of u.arms) { a.sh.rotation.x = -1.5 + Math.sin(t * 22) * 0.12; a.el.rotation.x = -0.2; }
    u.torso.rotation.x = 0.1 + Math.sin(t * 22) * 0.05;
    u.body.position.x = Math.sin(t * 22) * 0.03;
  }
  if (cuffed) { for (const a of u.arms) { a.sh.rotation.x = 0.45; a.el.rotation.x = -0.6; } u.arms[0].sh.rotation.z = 0.25; u.arms[1].sh.rotation.z = -0.25; u.head.rotation.x = 0.35; }
  if (mode === 'climb') y -= 0.35;
  if (p.z !== undefined) { A.z = p.z; if (p.yaw !== undefined) A.yaw = p.yaw; }
  g.position.set(x, y, A.z);
  g.rotation.y = A.yaw;
}

// ---------------------------------------------------------------------------
//  Ragdolls (verlet) and comedy ghosts
// ---------------------------------------------------------------------------
const RD = {
  names: ['head', 'neck', 'pelvis', 'lSh', 'rSh', 'lEl', 'rEl', 'lHa', 'rHa', 'lHip', 'rHip', 'lKn', 'rKn', 'lFt', 'rFt'],
  rest: [[0, 1.72, 0], [0, 1.5, 0], [0, 0.95, 0], [-0.24, 1.46, 0], [0.24, 1.46, 0], [-0.3, 1.16, 0], [0.3, 1.16, 0], [-0.32, 0.88, 0], [0.32, 0.88, 0], [-0.1, 0.9, 0], [0.1, 0.9, 0], [-0.1, 0.5, 0], [0.1, 0.5, 0], [-0.1, 0.07, 0], [0.1, 0.07, 0]],
  sticks: [[0, 1], [1, 3], [1, 4], [3, 4], [3, 2], [4, 2], [1, 2], [3, 5], [5, 7], [4, 6], [6, 8], [2, 9], [2, 10], [9, 10], [9, 11], [11, 13], [10, 12], [12, 14], [3, 9], [4, 10], [3, 10], [4, 9], [0, 3], [0, 4]],
  limbs: [[3, 5, 'sleeve', 0.06], [5, 7, 'arm', 0.05], [4, 6, 'sleeve', 0.06], [6, 8, 'arm', 0.05], [9, 11, 'legs', 0.075], [11, 13, 'legs', 0.065], [10, 12, 'legs', 0.075], [12, 14, 'legs', 0.065]],
};
const ragdolls = [];
const capGeo = new THREE.CapsuleGeometry(1, 1, 4, 8);
class Ragdoll {
  constructor(key, x, y, z, yaw, v, level, person, spinK = 1) {
    this.key = key; this.level = level; this.person = person; this.still = 0; this.dead = false; this.age = 0;
    this.anchors = []; this.nodePos = null;
    const st = STYLES[key], mt = pmats(key);
    this.g = new THREE.Group(); root.add(this.g);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 7).multiplyScalar(spinK);
    this.p = RD.rest.map(([rx, ry, rz]) => new THREE.Vector3(x + rx * c + rz * s, y + ry, z - rx * s + rz * c));
    const center = this.p[2].clone();
    const h = 1 / 60;
    this.o = this.p.map(q => {
      const r = q.clone().sub(center);
      const vel = new THREE.Vector3(v.x, v.y, v.z).add(new THREE.Vector3().crossVectors(spin, r));
      return q.clone().addScaledVector(vel, -h);
    });
    this.len = RD.sticks.map(([a, b]) => this.p[a].distanceTo(this.p[b]));
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; this.g.add(m); return m; };
    this.torso = mk(new RoundedBoxGeometry(0.44, 0.56, 0.26, 2, 0.07), mt.top);
    this.pelvis = mk(new RoundedBoxGeometry(0.36, 0.2, 0.22, 2, 0.05), mt.legs);
    this.head = new THREE.Group(); this.g.add(this.head);
    const part = (geo, mat, px, py, pz, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; parent.add(m); return m; };
    part(new THREE.SphereGeometry(0.125, 16, 12), mt.skin, 0, 0, 0, this.head).scale.set(1, 1.1, 1);
    // X_X eyes
    for (const ex of [-0.045, 0.045]) for (const r of [0.7, -0.7]) { const e = part(new THREE.BoxGeometry(0.045, 0.011, 0.01), mt.eye, ex, 0.03, 0.122, this.head); e.rotation.z = r; }
    part(new THREE.TorusGeometry(0.025, 0.008, 6, 10), mt.eye, 0, -0.06, 0.118, this.head);
    if (st.hat === 'cap') addHat(this.head, st, mt, part);
    this.limbs = RD.limbs.map(([a, b, m, r]) => ({ a, b, r, mesh: mk(capGeo, m === 'arm' ? (st.vest ? mt.skin : mt.sleeve) : m === 'sleeve' ? mt.sleeve : mt.legs) }));
    this.feet = [mk(new RoundedBoxGeometry(0.13, 0.1, 0.25, 2, 0.03), mt.shoe), mk(new RoundedBoxGeometry(0.13, 0.1, 0.25, 2, 0.03), mt.shoe)];
    this.sync();
    ragdolls.push(this);
  }
  floorAt(q) { return (q.z >= 0 && q.z <= STRIP_D && this.level ? this.level.groundAt(q.x) : 0); }
  step(dt) {
    this.age += dt;
    const g = 9.81 * dt * dt;
    let sp = 0;
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i], o = this.o[i];
      const vx = (q.x - o.x) * 0.995, vy = (q.y - o.y) * 0.995, vz = (q.z - o.z) * 0.995;
      o.copy(q);
      q.x += vx; q.y += vy - g; q.z += vz;
      sp += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (let it = 0; it < 8; it++) {
      RD.sticks.forEach(([a, b], k) => {
        const A = this.p[a], B = this.p[b];
        _v.subVectors(B, A); const d = _v.length() || 1e-6;
        const f = (d - this.len[k]) / d * 0.5;
        A.addScaledVector(_v, f); B.addScaledVector(_v, -f);
      });
      // tangled in the wreckage: limbs are dragged along with the scaffold joints they're caught on
      if (this.nodePos) for (const an of this.anchors) {
        const t = this.nodePos(an.node);
        if (!t) continue;
        const q = this.p[an.i];
        q.x += (t.x + an.ox - q.x) * an.k; q.y += (t.y + an.oy - q.y) * an.k; q.z += (t.z + an.oz - q.z) * an.k;
      }
      const L = this.level;
      for (let i = 0; i < this.p.length; i++) {
        const q = this.p[i], o = this.o[i];
        const fl = this.floorAt(q) + (i === 0 ? 0.13 : 0.06);
        if (q.y < fl) {
          const vy = q.y - o.y;
          q.y = fl; o.y = q.y + (vy < -0.02 ? vy * 0.3 : 0);
          o.x = q.x - (q.x - o.x) * 0.5; o.z = q.z - (q.z - o.z) * 0.5;
        }
        if (L && q.z < 0.14 && q.x > L.house.x0 && q.x < L.house.x1 && q.y < L.house.eaves) { const vz = q.z - o.z; q.z = 0.14; o.z = q.z + vz * 0.3; }
      }
    }
    this.speed = sp / this.p.length / dt;
    if (this.speed < 0.35) this.still += dt; else this.still = 0;
    this.sync();
  }
  sync() {
    const P = this.p;
    const up = _v.subVectors(P[1], P[2]).normalize();
    const right = _v2.subVectors(P[4], P[3]); right.addScaledVector(up, -right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up);
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
    this.torso.quaternion.setFromRotationMatrix(basis);
    this.torso.position.copy(P[1]).lerp(P[2], 0.55);
    this.pelvis.quaternion.copy(this.torso.quaternion); this.pelvis.position.copy(P[2]);
    this.head.quaternion.copy(this.torso.quaternion); this.head.position.copy(P[0]);
    for (const l of this.limbs) {
      const A = P[l.a], B = P[l.b];
      segMatrix(A.x, A.y, A.z, B.x, B.y, B.z, 1, l.mesh.matrix);
      l.mesh.matrix.decompose(l.mesh.position, l.mesh.quaternion, l.mesh.scale);
      const len = A.distanceTo(B);
      l.mesh.scale.set(l.r, Math.max(0.01, len / 3), l.r);
    }
    for (const [i, f] of [[13, 0], [14, 1]]) { this.feet[f].position.copy(P[i]); this.feet[f].quaternion.copy(this.torso.quaternion); }
  }
  get center() { return this.p[2]; }
  dispose() { root.remove(this.g); }
}
// anchors: optional { nodes: [{id, x, y, z}], nodePos(id) } to pin limbs to the wreckage
function spawnRagdoll(personMesh, p, level, vel, tangle = null) {
  const A = personMesh.userData.anim;
  p.ragdolled = true;
  const rd = new Ragdoll(personMesh.userData.key, personMesh.position.x, personMesh.position.y, personMesh.position.z, A.yaw, vel, level, p, tangle ? 0.25 : 1);
  if (tangle && tangle.nodes.length) {
    rd.nodePos = tangle.nodePos;
    // feet, a hand and the pelvis each snag on the nearest joint
    const used = new Set();
    for (const [i, k] of [[13, 0.35], [8, 0.3], [2, 0.12], [7, 0.2]]) {
      const q = rd.p[i];
      let best = null, bd = 1.6;
      for (const n of tangle.nodes) {
        if (used.has(n.id) && i !== 2) continue;
        const d = Math.hypot(n.x - q.x, n.y - q.y);
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) continue;
      used.add(best.id);
      // snag point: pulled most of the way onto the joint, so the body wraps round the tubes
      rd.anchors.push({ i, node: best.id, k, ox: (q.x - best.x) * 0.3, oy: (q.y - best.y) * 0.3, oz: (q.z - best.z) * 0.5 });
    }
  }
  if (personMesh.userData.key === 'dave') {
    // the hard hat, which was never going to help
    const hat = new THREE.Group();
    addHat(hat, STYLES.dave, pmats('dave'), (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; });
    hat.position.set(personMesh.position.x, personMesh.position.y + 1.8, personMesh.position.z);
    root.add(hat);
    debris.push({ mesh: hat, vx: vel.x + (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 2, vz: 1.5, w: new THREE.Vector3(3, 8, 2), level, keep: true, lift: 0.05 });
  }
  return rd;
}

const ghosts = [];
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xf2f7ff, transparent: true, opacity: 0.5, depthWrite: false });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd84a });
const wingGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.35, 0.5, 0.75, 0.35); s.quadraticCurveTo(0.6, 0.1, 0.7, -0.05); s.quadraticCurveTo(0.4, 0.0, 0.45, -0.25); s.quadraticCurveTo(0.2, -0.1, 0, 0); return new THREE.ShapeGeometry(s); })();
function comicDeath(rd) {
  const g = makePerson(rd.key);
  g.traverse(o => { if (o.isMesh) { o.material = ghostMat.clone(); o.castShadow = false; } });
  const u = g.userData;
  for (const a of u.arms) { a.sh.rotation.z = (a === u.arms[0] ? 1 : -1) * 0.5; }
  u.arms[0].sh.rotation.x = u.arms[1].sh.rotation.x = -0.3;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 24), haloMat.clone());
  halo.rotation.x = Math.PI / 2; halo.position.y = 1.98; g.add(halo);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, ghostMat.clone()); w.material.side = THREE.DoubleSide; w.material.opacity = 0.75;
    w.position.set(s * 0.1, 1.42, -0.16); w.scale.set(s, 1, 1); g.add(w); wings.push(w);
  }
  const c = rd.center;
  g.position.set(c.x, c.y - 0.2, Math.max(0.6, c.z));
  root.add(g);
  ghosts.push({ g, wings, halo, t: 0, x0: c.x, key: rd.key });
  sfx.harp();
  if (typeof shout === 'function') {
    if (rd.key === 'dave') shout('RIP DAVE', c.x, c.y + 1.2);
    else { shout('+1 CHAV', c.x, c.y + 1.6, 'bonus'); sfx.fanfare(); }
  }
}
function updateGhosts(dt, t) {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const G = ghosts[i];
    G.t += dt;
    G.g.position.y += dt * 0.75;
    G.g.position.x = G.x0 + Math.sin(G.t * 1.6) * 0.3;
    G.g.rotation.y = Math.sin(G.t * 0.8) * 0.4;
    for (const [k, w] of G.wings.entries()) w.rotation.y = (k ? -1 : 1) * (0.5 + Math.sin(G.t * 9) * 0.5);
    G.halo.position.y = 1.98 + Math.sin(G.t * 4) * 0.03;
    const fade = G.t > 4 ? Math.max(0, 1 - (G.t - 4) / 2.5) : 1;
    G.g.traverse(o => { if (o.isMesh && o !== G.halo) o.material.opacity = (G.wings.includes(o) ? 0.75 : 0.5) * fade; });
    G.halo.material.transparent = true; G.halo.material.opacity = fade;
    if (G.t > 6.5) { root.remove(G.g); ghosts.splice(i, 1); }
  }
}
function clearPeopleFx() {
  for (const r of ragdolls) r.dispose(); ragdolls.length = 0;
  for (const G of ghosts) root.remove(G.g); ghosts.length = 0;
}

function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ---------------------------------------------------------------------------
//  Loads (items)
// ---------------------------------------------------------------------------
const brickMat = (() => { const m = texFromFacade('red', 0.5, 0.5); return m; })();
function makeItem(key) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const redBrick = new THREE.MeshStandardMaterial({ color: 0xa4472e, roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0xc7a06a, roughness: 0.9 });
  switch (key) {
    case 'hod': {
      const tray = new THREE.MeshStandardMaterial({ color: 0x2d2f33, roughness: 0.6 });
      add(new THREE.BoxGeometry(0.5, 0.04, 0.28), tray, 0, 0.04, 0);
      add(new THREE.BoxGeometry(0.5, 0.2, 0.03), tray, 0, 0.13, -0.13, 0.4);
      add(new THREE.BoxGeometry(0.5, 0.2, 0.03), tray, 0, 0.13, 0.13, -0.4);
      for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.215, 0.065, 0.1), redBrick, -0.12 + (i % 2) * 0.23, 0.1 + Math.floor(i / 2) * 0.068, (i % 3 - 1) * 0.04);
      break;
    }
    case 'bags': {
      const sack = new THREE.MeshStandardMaterial({ color: 0xb6b2a8, roughness: 1 });
      const band = new THREE.MeshStandardMaterial({ color: 0x1d5da8, roughness: 0.8 });
      for (let i = 0; i < 4; i++) { const s = add(new RoundedBoxGeometry(0.62, 0.12, 0.38, 2, 0.05), sack, 0, 0.06 + i * 0.12, 0, 0, (i % 2) * 0.12); add(new THREE.BoxGeometry(0.2, 0.121, 0.382), band, 0, 0.06 + i * 0.12, 0, 0, (i % 2) * 0.12); }
      break;
    }
    case 'tiles': {
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.9, 0.05, 0.7), timber, 0, 0.03 + i * 0.13, 0);
      for (const x of [-0.42, 0.42]) add(new THREE.BoxGeometry(0.05, 0.5, 0.7), timber, x, 0.27, 0);
      for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.1, 0.4, 0.62), M.terracotta, -0.3 + i * 0.1, 0.27, 0, 0, 0, 0.2);
      break;
    }
    case 'pallet': {
      add(new THREE.BoxGeometry(1.0, 0.12, 0.9), timber, 0, 0.06, 0);
      const bm = brickMat.clone(); bm.map = bm.map.clone(); bm.map.repeat.set(0.45, 0.35); bm.map.needsUpdate = true;
      add(new THREE.BoxGeometry(0.92, 0.66, 0.82), bm, 0, 0.45, 0);
      const wrap = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, clearcoat: 1 });
      add(new THREE.BoxGeometry(0.95, 0.5, 0.85), wrap, 0, 0.55, 0);
      break;
    }
    case 'bath': {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; pts.push(new THREE.Vector2(0.12 + Math.sin(a) * 0.28, 0.12 + (1 - Math.cos(a)) * 0.42)); }
      pts.push(new THREE.Vector2(0.44, 0.56), new THREE.Vector2(0.37, 0.56), new THREE.Vector2(0.33, 0.3), new THREE.Vector2(0.0, 0.18));
      const enamel = new THREE.MeshPhysicalMaterial({ color: 0xf8f8f4, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide });
      const tub = add(new THREE.LatheGeometry([new THREE.Vector2(0, 0.12), ...pts], 28), enamel, 0, 0, 0);
      tub.scale.set(1.8, 1, 0.95);
      for (const [x, z] of [[-0.6, -0.22], [0.6, -0.22], [-0.6, 0.22], [0.6, 0.22]]) add(new THREE.SphereGeometry(0.06, 8, 6), M.brass, x, 0.07, z);
      break;
    }
    case 'mixer': {
      const orange = new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: 0.5, metalness: 0.2 });
      const pts = [new THREE.Vector2(0.0, -0.3), new THREE.Vector2(0.3, -0.28), new THREE.Vector2(0.36, 0.0), new THREE.Vector2(0.3, 0.22), new THREE.Vector2(0.15, 0.36), new THREE.Vector2(0.13, 0.4)];
      const drum = add(new THREE.LatheGeometry(pts, 20), orange, 0.05, 0.7, 0, 0, 0, -0.6);
      add(new THREE.BoxGeometry(0.8, 0.06, 0.06), M.dark, 0, 0.3, 0.25); add(new THREE.BoxGeometry(0.8, 0.06, 0.06), M.dark, 0, 0.3, -0.25);
      add(new THREE.BoxGeometry(0.06, 0.5, 0.06), M.dark, -0.1, 0.5, 0);
      for (const z of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), M.dark, 0.35, 0.14, z, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.3, 0.06), M.dark, -0.35, 0.15, 0);
      break;
    }
    case 'anvil': {
      const s = new THREE.Shape();
      s.moveTo(-0.2, 0); s.lineTo(0.2, 0); s.lineTo(0.15, 0.12); s.lineTo(0.1, 0.14); s.lineTo(0.1, 0.24); s.lineTo(0.22, 0.26); s.lineTo(0.24, 0.34); s.lineTo(-0.2, 0.34); s.quadraticCurveTo(-0.34, 0.33, -0.42, 0.3); s.quadraticCurveTo(-0.28, 0.25, -0.12, 0.24); s.lineTo(-0.1, 0.14); s.lineTo(-0.15, 0.12); s.lineTo(-0.2, 0);
      const ge = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
      ge.translate(0, 0, -0.1);
      add(ge, new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.8, roughness: 0.4 }), 0.05, 0, 0);
      break;
    }
    case 'piano': {
      const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      add(new THREE.BoxGeometry(1.45, 1.25, 0.5), black, 0, 0.66, -0.05);
      add(new THREE.BoxGeometry(1.45, 0.08, 0.3), black, 0, 0.72, 0.3);
      const keys = canvasTex(256, 32, (gg, w, h) => { gg.fillStyle = '#f7f5ee'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#111'; for (let i = 0; i < 52; i++) gg.fillRect(i * w / 52, 0, 1, h); for (let i = 0; i < 52; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) gg.fillRect(i * w / 52 + 3, 0, 3, h * 0.6); });
      add(new THREE.BoxGeometry(1.3, 0.03, 0.18), new THREE.MeshStandardMaterial({ map: keys }), 0, 0.775, 0.32);
      for (const x of [-0.65, 0.65]) add(new THREE.BoxGeometry(0.08, 0.72, 0.1), black, x, 0.36, 0.32);
      for (const x of [-0.45, 0.45]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), M.brass, x, 1.1, 0.24, Math.PI / 2);
      break;
    }
    case 'grand': {
      const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      const s = new THREE.Shape();
      s.moveTo(-0.9, -0.62); s.lineTo(0.9, -0.62); s.lineTo(0.9, -0.3); s.bezierCurveTo(0.9, 0.2, 0.2, 0.05, 0.0, 0.5); s.bezierCurveTo(-0.3, 0.8, -0.9, 0.75, -0.9, 0.3); s.lineTo(-0.9, -0.62);
      const ge = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: false, curveSegments: 20 });
      add(ge, black, 0, 0.62, 0, -Math.PI / 2);
      add(new THREE.BoxGeometry(1.4, 0.02, 0.9), black, 0.1, 1.28, -0.1, 0.55);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.62, 5), black, 0.25, 1.0, 0.2, 0.5);
      for (const [x, z] of [[-0.75, 0.5], [0.75, 0.5], [-0.4, -0.45]]) add(new THREE.CylinderGeometry(0.05, 0.04, 0.62, 10), black, x, 0.31, z);
      break;
    }
    case 'safe': {
      const steelG = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, metalness: 0.7, roughness: 0.35 });
      add(new RoundedBoxGeometry(0.9, 1.1, 0.8, 2, 0.04), steelG, 0, 0.55, 0);
      add(new THREE.BoxGeometry(0.72, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: 0x27403a, metalness: 0.7, roughness: 0.3 }), 0, 0.57, 0.405);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), M.brass, 0, 0.7, 0.43, Math.PI / 2);
      add(new THREE.BoxGeometry(0.22, 0.03, 0.03), M.brass, 0, 0.45, 0.44);
      for (const x of [-0.37, 0.37]) add(new THREE.BoxGeometry(0.04, 0.12, 0.04), M.brass, x, 0.85, 0.42);
      break;
    }
    case 'dumpy': {
      const bag = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.95 });
      add(new RoundedBoxGeometry(0.98, 0.9, 0.95, 3, 0.14), bag, 0, 0.45, 0);
      const sand = add(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8b77a, roughness: 1 }), 0, 0.84, 0);
      sand.scale.y = 0.35;
      const strap = new THREE.MeshStandardMaterial({ color: 0x1d5da8, roughness: 0.8 });
      for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) add(new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI), strap, x, 0.9, z, 0, Math.PI / 4);
      add(new THREE.BoxGeometry(0.4, 0.2, 0.01), new THREE.MeshStandardMaterial({ map: labelTex('1000 kg\nSHARP SAND'), roughness: 0.8 }), 0, 0.5, 0.48);
      break;
    }
    case 'statue': {
      const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5a30, metalness: 0.85, roughness: 0.38 });
      add(new THREE.BoxGeometry(1.5, 0.18, 0.95), M.sill, 0, 0.09, 0);
      const bd = add(new THREE.SphereGeometry(0.5, 20, 14), bronze, -0.08, 0.95, 0); bd.scale.set(1.45, 0.95, 0.85);
      const hd = add(new THREE.SphereGeometry(0.3, 16, 12), bronze, 0.62, 1.15, 0);
      for (const s of [-1, 1]) { const e = add(new THREE.SphereGeometry(0.28, 12, 8), bronze, 0.55, 1.2, s * 0.28); e.scale.set(0.3, 1, 0.85); }
      const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0.82, 1.1, 0), new THREE.Vector3(0.98, 0.85, 0), new THREE.Vector3(0.98, 0.55, 0), new THREE.Vector3(1.12, 0.42, 0)]);
      add(new THREE.TubeGeometry(tc, 16, 0.07, 8), bronze, 0, 0, 0);
      for (const [x, z] of [[-0.5, -0.22], [-0.5, 0.22], [0.3, -0.22], [0.3, 0.22]]) add(new THREE.CylinderGeometry(0.13, 0.14, 0.62, 12), bronze, x, 0.48, z);
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.035, 0.28, 6), new THREE.MeshStandardMaterial({ color: 0xeee6d0 }), 0.82, 0.98, s * 0.1, 0, 0, 1.9);
      add(new THREE.CylinderGeometry(0.015, 0.01, 0.4, 5), bronze, -0.82, 0.8, 0, 0, 0, -0.5);
      break;
    }
  }
  return g;
}
function itemLabel(key) { const d = ITEMS[key]; return `${d.name} · ${d.mass >= 1000 ? (d.mass / 1000).toFixed(d.mass % 1000 ? 1 : 0) + ' t' : d.mass + ' kg'}`; }

// ---------------------------------------------------------------------------
//  Debris + particles
// ---------------------------------------------------------------------------
const debris = [];
function spawnTubeDebris(ev, level) {
  const len = Math.hypot(ev.bx - ev.ax, ev.by - ev.ay);
  for (const z of [Z_IN, Z_OUT]) {
    if (debris.length > 90) { const d = debris.shift(); root.remove(d.mesh); }
    const heavy = ev.mat === 'heavy';
    const mesh = new THREE.Mesh(heavy ? tubeGeoHeavy : tubeGeo, heavy ? M.heavy : M.steel);
    mesh.scale.set(1, len, 1);
    mesh.castShadow = true;
    mesh.position.set((ev.ax + ev.bx) / 2, (ev.ay + ev.by) / 2, z);
    mesh.quaternion.setFromUnitVectors(UP, _v.set(ev.bx - ev.ax, ev.by - ev.ay, 0).normalize());
    root.add(mesh);
    debris.push({ mesh, vx: ev.vx + (Math.random() - 0.5), vy: ev.vy + Math.random() * 1.5, vz: 0.5 + Math.random() * 2, w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), half: len / 2, level, rest: false, snd: 0 });
  }
  sfx.snap();
}
function spawnBoardDebris(ev, level) {
  for (let i = 0; i < 5; i++) {
    for (const half of [0, 1]) {
      const mesh = new THREE.Mesh(plankGeo, M.wood);
      mesh.scale.set(0.5, 1, 1);
      const fx = half ? 0.75 : 0.25;
      mesh.position.set(ev.ax + (ev.bx - ev.ax) * fx, ev.ay + (ev.by - ev.ay) * fx + 0.1, Z_IN + 0.1 + i * 0.24);
      mesh.castShadow = true; root.add(mesh);
      debris.push({ mesh, vx: ev.vx + (half ? 1 : -1) * (0.5 + Math.random()), vy: ev.vy + Math.random(), vz: (Math.random() - 0.3) * 1.5, w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, (half ? -1 : 1) * (2 + Math.random() * 4)), half: 0.25, level, rest: false, snd: 0 });
    }
  }
  sfx.crack();
}
function updateDebris(dt) {
  for (const d of debris) {
    if (d.rest) continue;
    d.vy -= 9.81 * dt;
    d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
    d.mesh.rotateOnWorldAxis(_v.copy(d.w).normalize(), d.w.length() * dt);
    const pz = d.mesh.position.z;
    const floor = (d.level && pz >= 0 && pz <= STRIP_D ? d.level.groundAt(d.mesh.position.x) : 0) + (d.lift ?? 0.03);
    if (d.mesh.position.y < floor + 0.02) {
      d.mesh.position.y = floor + 0.02;
      if (Math.abs(d.vy) > 1.5) { puff(d.mesh.position.x, floor, d.mesh.position.z, 3, 0.4); if (!d.quiet) sfx.clank(Math.min(1, Math.abs(d.vy) / 6)); }
      d.vy = -d.vy * 0.25; d.vx *= 0.5; d.vz *= 0.5; d.w.multiplyScalar(0.4);
      if (Math.abs(d.vy) < 0.4) {
        d.rest = true;
        if (!d.keep) {
          const e = new THREE.Euler().setFromQuaternion(d.mesh.quaternion);
          d.mesh.rotation.set(Math.PI / 2 * Math.round(e.x / (Math.PI / 2)) || Math.PI / 2, e.y, Math.PI / 2);
        }
      }
    }
  }
}
function clearDebris() { for (const d of debris) root.remove(d.mesh); debris.length = 0; }

const particles = [];
const puffMat = new THREE.SpriteMaterial({ map: softTex, color: 0xc8b89a, transparent: true, depthWrite: false, opacity: 0.6 });
function puff(x, y, z, n = 6, size = 0.6, color = 0xc8b89a) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 260) { const p = particles.shift(); root.remove(p.s); }
    const mat = puffMat.clone(); mat.color.set(color);
    const s = new THREE.Sprite(mat);
    s.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.1, z + (Math.random() - 0.5) * 0.6);
    s.scale.setScalar(size * (0.5 + Math.random() * 0.5));
    root.add(s);
    particles.push({ s, vx: (Math.random() - 0.5) * 1.6, vy: 0.3 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.6, life: 0, max: 1.2 + Math.random() * 0.8, grow: size * 1.4 });
  }
}
const windStreaks = [];
{
  const geo = new THREE.PlaneGeometry(1.6, 0.012);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.position.set(Math.random() * 24 - 6, 0.5 + Math.random() * 10, -1 + Math.random() * 10);
    m.userData.v = 0.7 + Math.random() * 0.6;
    m.visible = false;
    root.add(m);
    windStreaks.push(m);
  }
}
function updateParticles(dt, windNow, L) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    const k = p.life / p.max;
    p.s.position.x += (p.vx + windNow * 0.02) * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.vx *= 0.97; p.vy *= 0.97; p.vz *= 0.97;
    p.s.scale.setScalar(p.grow * (0.4 + k));
    p.s.material.opacity = 0.55 * (1 - k);
    if (k >= 1) { root.remove(p.s); p.s.material.dispose(); particles.splice(i, 1); }
  }
  const w = Math.abs(windNow);
  for (const s of windStreaks) {
    const on = L && L.wind > 0;
    s.visible = on;
    if (!on) continue;
    s.position.x += Math.sign(windNow || 1) * (4 + w * 0.25) * s.userData.v * dt;
    if (s.position.x > (L.W + 12)) s.position.x = -12;
    if (s.position.x < -12) s.position.x = L.W + 12;
    s.material.opacity = Math.min(0.35, w / 120) * s.userData.v;
  }
}

// ---------------------------------------------------------------------------
//  The police: turn up for any chav trapped in the wreckage and take them away
// ---------------------------------------------------------------------------
const policeCar = new THREE.Group();
const policeLights = [];
{
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f6f3, roughness: 0.35, metalness: 0.2 });
  const check = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, map: canvasTex(512, 64, (g, w, h) => {
    for (let i = 0; i < 16; i++) for (let r = 0; r < 2; r++) { g.fillStyle = (i + r) % 2 ? '#1e4fd8' : '#f3d40b'; g.fillRect(i * 32, r * 32, 32, 32); }
  }) });
  const text = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#f5f6f3'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e4fd8'; g.font = '900 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', w / 2, h / 2 + 2); }), roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 1.8), white); body.position.y = 0.75; body.castShadow = true; policeCar.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 1.7), white); cabin.position.set(-0.2, 1.45, 0); cabin.castShadow = true; policeCar.add(cabin);
  for (const z of [0.905, -0.905]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 0.3), check); band.position.set(0, 0.7, z); if (z < 0) band.rotation.y = Math.PI; policeCar.add(band);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.34), text); t.position.set(-0.2, 1.45, z * 0.95); if (z < 0) t.rotation.y = Math.PI; policeCar.add(t);
  }
  const glassM = new THREE.MeshStandardMaterial({ color: 0x1a232e, roughness: 0.1, metalness: 0.4 });
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 1.6), glassM); ws.position.set(1.0, 1.42, 0); ws.rotation.z = -0.5; policeCar.add(ws);
  for (const [x, z] of [[-1.4, 0.85], [1.4, 0.85], [-1.4, -0.85], [1.4, -0.85]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16), M.dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z); policeCar.add(w); }
  for (const [i, col] of [[0, 0x2a6bff], [1, 0xff2a2a]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 1.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2 }));
    l.position.set(-0.2 + (i ? 0.2 : -0.2), 1.85, 0); policeCar.add(l); policeLights.push(l);
  }
  const glow = new THREE.PointLight(0x2a6bff, 0, 12); glow.position.set(-0.2, 2.2, 0); policeCar.add(glow); policeLights.push(glow);
  policeCar.visible = false;
  scene.add(policeCar);
}
const officer = makePerson('police'); officer.visible = false; root.add(officer);
const police = { active: false, t: 0, queue: [], state: 'idle', car: { x: -40 }, cop: null, chav: null, done: false };
function startPolice(trapped, level) {
  if (police.active || !trapped.length) return;
  for (const r of trapped) r.queued = true;
  Object.assign(police, { active: true, done: false, t: 0, queue: trapped.slice(), state: 'arrive', level, car: { x: -45 } });
  policeCar.visible = true;
  sfx.siren();
}
function updatePolice(dt, t) {
  if (!police.active) return;
  const P = police;
  const L = P.level;
  const stopX = -L.W / 2 - 7;              // world x where the car pulls up (left of the house, out of shot)
  const carLocalX = stopX + L.W / 2;       // same point in grid space
  // flashing lights
  const f = Math.floor(t * 6) % 2;
  policeLights[0].material.emissiveIntensity = f ? 2.5 : 0.1;
  policeLights[1].material.emissiveIntensity = f ? 0.1 : 2.5;
  policeLights[2].intensity = 25; policeLights[2].color.set(f ? 0x2a6bff : 0xff2a2a);
  const walk = (o, tx, tz, v) => {
    const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const k = Math.min(1, v * dt / d);
    o.x += dx * k; o.z += dz * k;
    o.face = Math.sign(dx) || o.face;
    o.yaw = Math.atan2(dx, dz);
    return false;
  };
  if (P.state === 'arrive') {
    P.car.x += (stopX - P.car.x) * Math.min(1, dt * 1.6) + 0.05;
    if (P.car.x > stopX - 0.1) { P.car.x = stopX; P.state = 'next'; }
  } else if (P.state === 'next') {
    if (!P.queue.length) { P.state = 'leave'; if (P.cop) P.cop.visible = false; officer.visible = false; }
    else {
      const rd = P.queue.shift();
      P.rd = rd;
      P.cop = { who: 'police', id: 0, visible: true, x: carLocalX + 1, y: 0, z: 11.6, state: 'walk', mode: 'ground', face: 1, t: 0, onBoard: -1, onLadder: -1, onMember: -1 };
      P.state = 'fetch';
    }
  } else if (P.state === 'fetch') {
    const c = P.rd.center;
    if (walk(P.cop, c.x + 0.6, Math.max(2.3, c.z + 0.6), 2.4)) {
      // haul them out of the wreckage and cuff them
      const rd = P.rd;
      const mesh = rd.chavMesh;
      if (rd.person) rd.person.nicked = true;
      rd.dispose(); const i = ragdolls.indexOf(rd); if (i >= 0) ragdolls.splice(i, 1);
      P.chav = { who: 'chav', id: 0, visible: true, x: c.x, y: L.groundAt(c.x), z: Math.max(2.3, c.z), state: 'cuffed', mode: 'ground', face: 1, t: 0, onBoard: -1, onLadder: -1, onMember: -1 };
      P.chavMesh = mesh; mesh.visible = true;
      if (typeof shout === 'function') shout("YOU'RE NICKED", c.x, c.y + 2.2, 'bonus');
      P.state = 'escort';
    }
  } else if (P.state === 'escort') {
    const a = walk(P.cop, carLocalX + 0.6, 11.6, 1.8);
    const b = walk(P.chav, carLocalX - 0.2, 11.8, 1.8);
    P.chav.y = L.groundAt(P.chav.x);
    if (a && b) { P.chavMesh.visible = false; P.chav.visible = false; P.chav.gone = true; sfx.thunk(); P.state = 'next'; }
  } else if (P.state === 'leave') {
    P.car.x += dt * (4 + P.t * 2); P.t += dt;
    if (P.car.x > 60) { P.active = false; P.done = true; policeCar.visible = false; }
  }
  policeCar.position.set(P.car.x, 0, 13.4);
  if (P.cop && P.cop.visible && P.state !== 'leave') { P.cop.y = L.groundAt(P.cop.x); animatePerson(officer, P.cop, dt, t); } else officer.visible = false;
  if (P.chav && !P.chav.gone && P.state === 'escort') animatePerson(P.chavMesh, P.chav, dt, t);
}
function resetPolice() {
  police.active = false; police.done = false; police.queue = []; police.state = 'idle';
  policeCar.visible = false; officer.visible = false;
}
