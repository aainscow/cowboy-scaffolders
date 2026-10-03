// ============================================================================
//  Per-level scenery: the house, terrain strip, decorations. All positions in
//  grid space inside `root` (root is shifted so the grid is centred at x=0).
// ============================================================================
const root = new THREE.Group();
scene.add(root);
let levelGroup = null;
let windsock = null;
let breakables = [];
let tagDecals = [];
let sceneDirty = false;

// Turn already-placed meshes into one breakable lump that can be knocked off by a collapse.
function makeBreakable(kind, meshes, parent, extra = {}) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  for (const m of meshes) bb.expandByObject(m);
  const c = root.worldToLocal(bb.getCenter(new THREE.Vector3()));
  const size = bb.getSize(new THREE.Vector3());
  const grp = new THREE.Group();
  grp.position.copy(c);
  parent.add(grp);
  grp.updateMatrixWorld(true);
  for (const m of meshes) grp.attach(m);
  const b = { kind, obj: grp, x: c.x, y: c.y, z: c.z, rx: size.x / 2 + 0.2, ry: size.y / 2 + 0.2, rz: Math.max(0.8, size.z / 2 + 0.5), lift: size.y / 2, broken: false, ...extra };
  breakables.push(b);
  return b;
}
function breakObject(b, h) {
  if (b.broken) return;
  b.broken = true; sceneDirty = true;
  root.attach(b.obj);
  const r = () => Math.random() - 0.5;
  // the pane may already be gone (a brick went through it earlier)
  if (b.kind === 'window' && b.glass && b.glass.parent && !b.glassBroken) {
    const gp = new THREE.Vector3(); b.glass.getWorldPosition(gp); root.worldToLocal(gp);
    b.glass.parent.remove(b.glass);
    b.glassBroken = true;
    const shardGeo = new THREE.BufferGeometry();
    shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0.03, 0, 0.05, 0.2, 0], 3));
    shardGeo.computeVertexNormals();
    const sm = M.glass.clone(); sm.side = THREE.DoubleSide;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(shardGeo, sm);
      m.position.set(gp.x + r() * b.rx, gp.y + r() * b.ry, 0.1);
      m.scale.setScalar(0.6 + Math.random());
      root.add(m);
      debris.push({ mesh: m, vx: (h.vx || 0) * 0.3 + r() * 2, vy: Math.random() * 2, vz: 0.8 + Math.random() * 2, w: new THREE.Vector3(r() * 12, r() * 12, r() * 12), level: currentLevel(), keep: true, lift: 0.01, quiet: true, noHit: true });
    }
    sfx.glass();
  }
  debris.push({ mesh: b.obj, vx: (h.vx || 0) * 0.5 + r() * 1.5, vy: 0.5 + Math.random() * 1.5 + Math.max(0, h.vy || 0) * 0.3, vz: 0.8 + Math.random() * 2.2, w: new THREE.Vector3(r() * 5, r() * 5, r() * 5), level: currentLevel(), keep: true, lift: b.lift, quiet: b.kind !== 'gutter' && b.kind !== 'pipe' });
  if (b.kind === 'pot' || b.kind === 'gnome' || b.kind === 'birdbath') { sfx.crack(); puff(b.x, b.y, b.z, 5, 0.4, 0x6b4e2e); }
  else if (b.kind === 'rose' || b.kind === 'hedge') puff(b.x, b.y, b.z, 6, 0.5, 0x4f7a2c);
  else if (b.kind === 'gutter' || b.kind === 'pipe' || b.kind === 'rail' || b.kind === 'sock') sfx.clank(0.8);
  else if (b.kind === 'bin') { sfx.thunk(); puff(b.x, b.y, b.z, 4, 0.5, 0x7a7a60); }
  if (b.kind === 'sock') windsock = null;
}
function checkBreakables(hitters) {
  for (const b of breakables) {
    if (b.broken || b.protected) continue;
    for (const h of hitters) {
      if (Math.abs(h.x - b.x) < b.rx && Math.abs(h.y - b.y) < b.ry && Math.abs(h.z - b.z) < b.rz) { breakObject(b, h); break; }
    }
  }
}
// A brick through the glass: the pane shatters, the frame stays put.
function smashGlass(b) {
  if (!b || b.broken || b.protected || !b.glass || !b.glass.parent) return false;
  const gp = new THREE.Vector3(); b.glass.getWorldPosition(gp); root.worldToLocal(gp);
  b.glass.parent.remove(b.glass);
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0.03, 0, 0.05, 0.2, 0], 3));
  shardGeo.computeVertexNormals();
  const sm = M.glass.clone(); sm.side = THREE.DoubleSide;
  const r = () => Math.random() - 0.5;
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(shardGeo, sm);
    m.position.set(gp.x + r() * b.rx, gp.y + r() * b.ry, 0.1); m.scale.setScalar(0.5 + Math.random());
    root.add(m);
    debris.push({ mesh: m, vx: r() * 1.5, vy: Math.random(), vz: 0.5 + Math.random() * 1.5, w: new THREE.Vector3(r() * 12, r() * 12, r() * 12), level: currentLevel(), keep: true, lift: 0.01, quiet: true, noHit: true });
  }
  b.glassBroken = true; sceneDirty = true;
  sfx.glass();
  sheilaSmash(currentLevel(), b.x);
  return true;
}
// Plywood over the windows the player has boarded up.
const plyMat = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.85, map: woodTex });
let boardUps = [];
const awningMat = new THREE.MeshStandardMaterial({ roughness: 0.85, map: canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe2' : '#1f3b2c'; g.fillRect(i * 16, 0, 16, h); } }) });
function syncBoardUps(L, pieces) {
  for (const m of boardUps) m.parent && m.parent.remove(m);
  boardUps = [];
  const set = new Set(pieces.filter(p => p.type === 'protect').map(p => p.a[0]));
  for (const b of breakables) if (b.kind === 'window') b.protected = set.has(b.wi);
  (L.house.windows || []).forEach((w, i) => {
    if (!set.has(i)) return;
    if (L.house.style === 'pub') {
      // a striped canvas awning, sloping out over the window
      const g = new THREE.Group(); g.position.set(w.x + w.w / 2, w.y + w.h + 0.35, 0.05);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.5, 0.03, 1.0), awningMat); aw.position.set(0, -0.25, 0.45); aw.rotation.x = 0.55; aw.castShadow = true; g.add(aw);
      const val = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.5, 0.18, 0.02), awningMat); val.position.set(0, -0.6, 0.88); g.add(val);
      for (const sx of [-1, 1]) { const arm = box(0.03, 0.03, 0.95, M.iron, sx * (w.w / 2 + 0.2), -0.28, 0.45, g, false); arm.rotation.x = 0.55; }
      levelGroup.add(g); boardUps.push(g);
      return;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.26, w.h + 0.26, 0.025), plyMat);
    m.position.set(w.x + w.w / 2, w.y + w.h / 2, 0.13); m.castShadow = true; m.receiveShadow = true;
    levelGroup.add(m); boardUps.push(m);
  });
}
// The trap door into the secret basement, and the drain the monster lives in.
const HATCH_Z = 2.95;
let hatchViews = [], manhole = null;
const hatchMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8, map: woodTex });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x07030c });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.7 });
function syncHatches(L, pieces) {
  for (const h of hatchViews) h.g.parent && h.g.parent.remove(h.g);
  hatchViews = [];
  if (manhole) { manhole.g.parent && manhole.g.parent.remove(manhole.g); manhole = null; }
  if (!L.monster && !L.toolHatch) return;
  for (const p of pieces.filter(q => q.type === 'hatch')) {
    const x = p.a[0], y = L.groundAt(x);
    const g = new THREE.Group(); g.position.set(x, y, L.monster ? HATCH_Z : Z_MID);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), holeMat); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; hole.visible = false; g.add(hole);
    const glow = new THREE.PointLight(0xb04dff, 0, 6); glow.position.y = 0.4; g.add(glow);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.03, -0.55); g.add(hinge);   // hinged on the house side
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.05, 1.08), hatchMat); lid.position.z = 0.55; lid.castShadow = true; lid.receiveShadow = true; hinge.add(lid);
    for (const dz of [0.2, 0.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.07), ironMat); s.position.set(0, 0.005, dz); hinge.add(s); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 14), ironMat); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.035, 0.95); hinge.add(ring);
    levelGroup.add(g);
    hatchViews.push({ g, hinge, hole, glow, x, open: 0, target: 0, glowT: 0 });
  }
  if (!L.monster) return;
  const mx = MONSTER_X, my = L.groundAt(0);
  const g = new THREE.Group(); g.position.set(mx, my, HATCH_Z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), holeMat); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.01; g.add(hole);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 24), ironMat); cover.position.y = 0.03; cover.receiveShadow = true; g.add(cover);
  levelGroup.add(g);
  manhole = { g, cover, open: 0 };
}
// BMX kit: a kicker (a little funbox, ramped both ways) and a quarter pipe.
const bmxKit = [];
const plyMatK = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.75, map: woodTex, side: THREE.DoubleSide });
const kickerGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(-0.55, 0); sh.lineTo(0.55, 0); sh.lineTo(0.15, 0.32); sh.lineTo(-0.15, 0.32); sh.lineTo(-0.55, 0);
  return new THREE.ExtrudeGeometry(sh, { depth: Z_OUT - Z_IN + 0.1, bevelEnabled: false });
})();
const qpipeGeo = (() => {
  // concave face towards +x (the boards); the lip is at x = 0, over the joint
  const R = 0.85, sh = new THREE.Shape();
  sh.moveTo(-0.12, 0); sh.lineTo(R, 0);
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI / 2; sh.lineTo(R - R * Math.sin(a), R - R * Math.cos(a)); }
  sh.lineTo(-0.12, R); sh.lineTo(-0.12, 0);
  return new THREE.ExtrudeGeometry(sh, { depth: Z_OUT - Z_IN + 0.1, bevelEnabled: false, curveSegments: 12 });
})();
// Gin wheel, zip wire anchor and rubble chute, as placed in the design.
const eventPieces = { wheel: null, cable: null, chute: null, anchor: null };
const orangeM = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
function syncEventPieces(L, pieces) {
  for (const k of Object.keys(eventPieces)) { const m = eventPieces[k]; if (m && m.parent) m.parent.remove(m); eventPieces[k] = null; }
  const E = L.event;
  if (!E) return;
  const w = pieces.find(p => p.type === 'wheel');
  if (w) {
    const g = new THREE.Group(); g.position.set(w.a[0], w.a[1] + 0.18, Z_OUT + 0.15);
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), M.iron); g.add(wh);
    for (let i = 0; i < 3; i++) { const sp = box(0.3, 0.02, 0.02, M.iron, 0, 0, 0, g, false); sp.rotation.z = i * Math.PI / 3; }
    const hook = box(0.05, 0.25, 0.05, M.iron, 0, 0.22, 0, g, false);
    levelGroup.add(g); eventPieces.wheel = g;
  }
  const z = pieces.find(p => p.type === 'zip');
  if (z && E.type === 'zip') {
    const a = box(0.3, 0.3, 0.12, orangeM, z.a[0], z.a[1] + 0.2, Z_OUT + 0.3, levelGroup);
    eventPieces.anchor = a;
    const tx = L.W + E.dx, ty = E.y + 2.2;
    const x0 = z.a[0], y0 = z.a[1] + 0.2, z0 = Z_OUT + 0.3, z1 = -2.4;
    const dx = tx - x0, dy = ty - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 5), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.35 }));
    c.position.set((x0 + tx) / 2, (y0 + ty) / 2, (z0 + z1) / 2);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    levelGroup.add(c); eventPieces.cable = c;
  }
  for (const k of bmxKit) k.parent && k.parent.remove(k);
  bmxKit.length = 0;
  if (E.type === 'bmx') for (const p of pieces.filter(q => q.type === 'ramp' || q.type === 'qpipe')) {
    const [x, y] = p.a, dep = Z_OUT - Z_IN + 0.1;
    const geo = p.type === 'ramp' ? kickerGeo : qpipeGeo;
    const m = new THREE.Mesh(geo, plyMatK); m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, y + 0.13, Z_IN - 0.05);
    if (p.type === 'qpipe') { const right = pieces.some(q => (q.type === 'board' || q.type === 'deck' || q.type === 'trap') && q.a[1] === y && Math.min(q.a[0], q.b[0]) <= x && Math.max(q.a[0], q.b[0]) > x); m.scale.x = right ? 1 : -1; }
    levelGroup.add(m); bmxKit.push(m);
  }
  const ch = pieces.find(p => p.type === 'chute');
  if (ch && E.type === 'chute') {
    const g = new THREE.Group(); g.userData = { x: ch.a[0], y: ch.a[1] };
    const top = { x: ch.a[0] + 0.1, y: ch.a[1] + 0.1, z: Z_OUT + 0.3 }, bot = { x: ch.a[0] + 0.15, y: 1.15, z: 2.3 };
    const n = Math.max(3, Math.round((top.y - bot.y) / 0.9));
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = (i + 1) / n;
      const ax = top.x + (bot.x - top.x) * k0, ay = top.y + (bot.y - top.y) * k0, az = top.z + (bot.z - top.z) * k0;
      const bx = top.x + (bot.x - top.x) * k1, by = top.y + (bot.y - top.y) * k1, bz = top.z + (bot.z - top.z) * k1;
      const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, len * 1.02, 12, 1, true), orangeM);
      c.material.side = THREE.DoubleSide;
      c.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx / len, -dy / len, -dz / len));
      c.castShadow = true; g.add(c);
    }
    levelGroup.add(g); eventPieces.chute = g;
  }
}
function windowBreakable(i) { return breakables.find(b => b.kind === 'window' && b.wi === i); }
function wallChunks(x, y) {
  const bm = new THREE.MeshStandardMaterial({ color: 0x9c4a33, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.065, 0.1), bm);
    m.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.3, 0.06); m.castShadow = true; root.add(m);
    debris.push({ mesh: m, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: 1 + Math.random() * 2, w: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), level: currentLevel(), keep: true, lift: 0.03, quiet: true });
  }
  puff(x, y, 0.2, 8, 0.5, 0xb08070);
  sceneDirty = true;
}
const TAG_WORDS = ['BAZ', 'KEV', 'TEZ', 'OI OI', 'DAZZA', 'SHAZ', 'WOZ ERE', 'CHAZ', 'BIG TEL', 'LOL', 'BRAP', 'MAZZA'];
function addTagDecal(tag, n) {
  const col = ['#ff2d8a', '#2dff6a', '#2dc8ff', '#ffd12d', '#b04dff'][n % 5];
  const word = TAG_WORDS[(n * 7 + tag.style * 3) % TAG_WORDS.length];
  const tex = canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.12 + (n % 3) * 0.08); g.transform(1, 0, -0.25, 1, 0, 0);
    g.font = '900 120px "Big Shoulders Stencil Display", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#111'; g.strokeText(word, 0, 0);
    g.fillStyle = col; g.fillText(word, 0, 0);
    g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(word, 0, 0);
    g.restore();
    g.fillStyle = col;
    for (let i = 0; i < 9; i++) { const x = 80 + Math.random() * 350, y0 = 150 + Math.random() * 30; g.fillRect(x, y0, 5, 20 + Math.random() * 60); g.beginPath(); g.arc(x + 2.5, y0 + 80, 4, 0, 7); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(tag.x + 0.45, tag.y + 0.1, 0.015 + n * 0.002);
  root.add(m);
  tagDecals.push({ m, t: 0 });
  sceneDirty = true;
}
function clearTags() { for (const d of tagDecals) root.remove(d.m); tagDecals = []; }

function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  g.parent && g.parent.remove(g);
}

function buildHouse(parent, h, opts = {}) {
  const g = new THREE.Group();
  parent.add(g);
  const churchy = h.style === 'church' || h.style === 'abbey' || h.style === 'cathedral';
  const depth = opts.depth ?? (churchy ? 12 : h.style === 'tower' ? 14 : 8);
  const w = h.x1 - h.x0, eaves = h.eaves;
  const cx = (h.x0 + h.x1) / 2;
  const skin = h.style === 'tower' ? 'glass' : h.brick;
  const facade = texFromFacade(skin, w, eaves);
  const side = texFromFacade(skin, depth, eaves);
  if (!opts.pitch && churchy) opts.pitch = h.style === 'cathedral' ? 7 : 5.2;
  const plinth = opts.base ?? 0;
  // main walls
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, eaves - plinth, depth), [side, side, M.dark, M.dark, facade, side]);
  body.position.set(cx, plinth + (eaves - plinth) / 2, -depth / 2);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  if (h.roof === 'flat') {
    // parapet and coping; no pitched roof
    box(w + 0.3, 0.5, depth + 0.3, h.style === 'tower' ? M.dark : M.sill, cx, eaves + 0.25, -depth / 2, g);
    box(w + 0.4, 0.08, 0.4, M.sill, cx, eaves + 0.54, 0.05, g);
    if (h.style === 'tower' && h.tieRows) for (let y = 3; y < Math.min(eaves, 60); y += 3) box(w + 0.06, 0.28, 0.1, new THREE.MeshStandardMaterial({ color: 0xb9b7b0, roughness: 0.8 }), cx, y, 0.02, g, false);
    if (h.style === 'leisure') for (const [yy, col] of [[2.6, 0x1a6fb8], [2.85, 0x2dbf8a]]) box(w + 0.04, 0.22, 0.06, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }), cx, yy, 0.03, g, false);
    (h.windows || []).forEach((wd, i) => addWindow(g, wd, h.brick, opts.main, i));
    if (h.door) addDoor(g, h.door);
    return g;
  }
  // gable roof: ridge parallel to facade
  const pitch = opts.pitch ?? 3.4, over = 0.35;
  const roofMat = new THREE.MeshStandardMaterial({ map: (h.brick === 'stone' || h.brick === 'render') ? slateTex.clone() : tileTex.clone(), roughness: 0.8 });
  roofMat.map.needsUpdate = true;
  const slopeLen = Math.hypot(depth / 2 + over, pitch);
  roofMat.map.repeat.set((w + 2 * over) / 2.2, slopeLen / 2.2);
  for (const s of [1, -1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * over, 0.12, slopeLen), roofMat);
    const ang = Math.atan2(pitch, depth / 2 + over);
    r.rotation.x = s * ang;
    r.position.set(cx, eaves + pitch / 2 + 0.02, -depth / 2 + s * (depth / 2 + over) / 2);
    r.castShadow = true; r.receiveShadow = true;
    g.add(r);
  }
  // gable ends
  const tri = new THREE.Shape(); tri.moveTo(-depth / 2, 0); tri.lineTo(depth / 2, 0); tri.lineTo(0, pitch); tri.lineTo(-depth / 2, 0);
  const tg = new THREE.ShapeGeometry(tri);
  const tuv = tg.attributes.uv, tp = tg.attributes.position;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i) / depth, tp.getY(i) / eaves);
  for (const sx of [h.x0, h.x1]) {
    const m = new THREE.Mesh(tg, side);
    m.rotation.y = sx === h.x0 ? -Math.PI / 2 : Math.PI / 2;
    m.position.set(sx, eaves, -depth / 2);
    m.castShadow = true; g.add(m);
  }
  box(w + 2 * over, 0.14, 0.2, M.dark, cx, eaves + pitch + 0.05, -depth / 2, g);
  if (opts.snow) {
    const snowM = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.9 });
    for (const sgn of [1, -1]) {
      const slopeL = Math.hypot(depth / 2 + over, pitch);
      const r = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * over + 0.02, 0.14, slopeL * 0.96), snowM);
      r.rotation.x = sgn * Math.atan2(pitch, depth / 2 + over);
      r.position.set(cx, eaves + pitch / 2 + 0.12, -depth / 2 + sgn * (depth / 2 + over) / 2);
      r.castShadow = true; g.add(r);
    }
  }
  // fascia + gutter
  box(w + 2 * over, 0.22, 0.04, M.white, cx, eaves - 0.02, over - 0.02, g);
  const gl = w + 2 * over, nseg = Math.max(1, Math.round(gl / 1.6));
  for (let i = 0; i < nseg; i++) {
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, gl / nseg - 0.01, 10, 1, false, 0, Math.PI), M.gutter);
    gut.rotation.z = Math.PI / 2; gut.rotation.x = Math.PI; gut.position.set(h.x0 - over + (i + 0.5) * gl / nseg, eaves - 0.08, over + 0.06); gut.castShadow = true; g.add(gut);
    if (opts.main) makeBreakable('gutter', [gut], g, { ry: 0.6, rz: 1.4 });
  }
  const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, eaves, 8), M.gutter);
  dp.position.set(h.x1 - 0.25, eaves / 2, 0.08); dp.castShadow = true; g.add(dp);
  if (opts.main) makeBreakable('pipe', [dp], g, { rx: 0.5 });
  // chimney
  if (h.chimney !== undefined) {
    const chx = h.chimney, cht = eaves + pitch + 1.3;
    const cm = texFromFacade(h.brick === 'render' ? 'red' : h.brick, 1.2, 2);
    box(1.0, cht - eaves, 0.8, cm, chx, eaves + (cht - eaves) / 2, -depth / 2, g);
    box(1.15, 0.12, 0.95, M.sill, chx, cht + 0.06, -depth / 2, g);
    for (const dx of [-0.25, 0.25]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.5, 12), M.terracotta);
      pot.position.set(chx + dx, cht + 0.36, -depth / 2); pot.castShadow = true; g.add(pot);
      if (opts.main) makeBreakable('pot', [pot], g, { rz: 5 });
    }
  }
  // plinth band
  box(w, 0.3, 0.04, M.stoneWall, cx, 0.15, 0.02, g, false);
  // windows
  (h.windows || []).forEach((wd, i) => addWindow(g, wd, h.brick, opts.main, i));
  if (h.door) addDoor(g, h.door);
  return g;
}

const stainedTex = canvasTex(128, 256, (g, w, h) => {
  const cols = ['#b3202f', '#1f4fa8', '#e2b62d', '#2f8a45', '#7a2fa0', '#d86a1c'];
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = cols[(x * 7 + y * 3 + ((x ^ y) >> 3)) % cols.length]; g.globalAlpha = 0.85; g.fillRect(x + 1.5, y + 1.5, 13, 13); }
  g.globalAlpha = 1; g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.62); g.stroke();
});
const stainedMat = new THREE.MeshStandardMaterial({ map: stainedTex, roughness: 0.3, emissive: 0x442211, emissiveIntensity: 0.25 });
function lancetShape(w, h) {
  const s = new THREE.Shape(), r = w / 2, archH = w * 0.85;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - archH);
  s.quadraticCurveTo(r, h - archH * 0.3, 0, h); s.quadraticCurveTo(-r, h - archH * 0.3, -r, h - archH); s.lineTo(-r, 0);
  return s;
}
function addWindow(g, wd, brick, reg, wi) {
  const { x, y, w, h } = wd;
  if (wd.kind === 'mill') {
    // small-paned cast-iron window under a segmental stone arch
    const cx = x + w / 2, cy = y + h / 2;
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 1 }));
    inside.position.set(cx, cy, 0.006); g.add(inside);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass); glass.position.set(cx, cy, 0.02); g.add(glass);
    const parts = [glass];
    const bar = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.4 });
    for (let i = 1; i < 3; i++) parts.push(box(0.025, h, 0.03, bar, x + i * w / 3, cy, 0.03, g, false));
    for (let i = 1; i < 4; i++) parts.push(box(w, 0.025, 0.03, bar, cx, y + i * h / 4, 0.03, g, false));
    parts.push(box(w + 0.06, 0.05, 0.05, bar, cx, y + h, 0.03, g, false));
    const arch = new THREE.Mesh(new THREE.RingGeometry(w / 2 + 0.02, w / 2 + 0.2, 16, 1, 0.35, Math.PI - 0.7), M.sill);
    arch.position.set(cx, y + h - 0.12, 0.03); g.add(arch); parts.push(arch);
    parts.push(box(w + 0.3, 0.1, 0.18, M.sill, cx, y - 0.05, 0.08, g));
    if (reg) makeBreakable('window', parts, g, { glass, rz: 1.3, wi });
    return;
  }
  if (wd.kind === 'lancet' || wd.kind === 'rose' || wd.kind === 'louvre') {
    const cx = x + w / 2;
    const geo = wd.kind === 'rose' ? new THREE.CircleGeometry(w / 2, 32) : new THREE.ShapeGeometry(lancetShape(w, h));
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, wd.kind === 'rose' ? (pos.getY(i) + w / 2) / w : pos.getY(i) / h);
    const glass = new THREE.Mesh(geo, wd.kind === 'louvre' ? M.dark : stainedMat);
    glass.position.set(cx, wd.kind === 'rose' ? y + h / 2 : y, 0.02); g.add(glass);
    const surroundGeo = wd.kind === 'rose' ? new THREE.RingGeometry(w / 2, w / 2 + 0.14, 32) : (() => { const o = lancetShape(w + 0.28, h + 0.16); o.holes.push(lancetShape(w, h)); return new THREE.ShapeGeometry(o); })();
    const sur = new THREE.Mesh(surroundGeo, M.sill); sur.position.set(cx, wd.kind === 'rose' ? y + h / 2 : y - 0.08, 0.03); sur.castShadow = true; g.add(sur);
    const parts = [glass, sur];
    if (wd.kind === 'louvre') for (let yy = y + 0.2; yy < y + h - 0.6; yy += 0.24) { const sl = box(w - 0.1, 0.05, 0.14, M.bark, cx, yy, 0.06, g, false); sl.rotation.x = 0.6; parts.push(sl); }
    else parts.push(box(w + 0.35, 0.08, 0.22, M.sill, cx, y - 0.06, 0.08, g));
    if (reg) makeBreakable('window', parts, g, { glass, rz: 1.3, wi });
    return;
  }
  const cx = x + w / 2, cy = y + h / 2;
  // interior glow + curtains behind glass
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1 }));
  inside.position.set(cx, cy, 0.006); g.add(inside);
  const cur = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rnd(), 0.35, 0.5), roughness: 1 });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.22, h * 0.95), cur); c.position.set(cx + s * w * 0.38, cy, 0.01); g.add(c); }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
  glass.position.set(cx, cy, 0.02); g.add(glass);
  const t = 0.07, d = 0.1;
  const parts = [glass];
  parts.push(box(w + 2 * t, t, d, M.frame, cx, y - t / 2, 0.03, g));
  parts.push(box(w + 2 * t, t, d, M.frame, cx, y + h + t / 2, 0.03, g));
  parts.push(box(t, h, d, M.frame, x - t / 2, cy, 0.03, g));
  parts.push(box(t, h, d, M.frame, x + w + t / 2, cy, 0.03, g));
  parts.push(box(w, 0.045, 0.06, M.frame, cx, cy + 0.05, 0.04, g, false));
  parts.push(box(0.04, h, 0.06, M.frame, cx, cy, 0.04, g, false));
  parts.push(box(w + 0.35, 0.07, 0.2, M.sill, cx, y - t - 0.035, 0.08, g));
  if (reg) makeBreakable('window', parts, g, { glass, rz: 1.3, wi });
  if (brick !== 'render') box(w + 0.3, 0.16, 0.03, M.sill, cx, y + h + t + 0.08, 0.015, g, false);
}

function addDoor(g, dr) {
  const { x, w, h, color } = dr;
  const cx = x + w / 2;
  if (dr.round) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, map: woodTex });
    const shp = (ww, hh) => { const s2 = new THREE.Shape(), r = ww / 2; s2.moveTo(-r, 0); s2.lineTo(r, 0); s2.lineTo(r, hh - r); s2.absarc(0, hh - r, r, 0, Math.PI, false); s2.lineTo(-r, 0); return s2; };
    const d = new THREE.Mesh(new THREE.ShapeGeometry(shp(w, h)), mat); d.position.set(cx, 0, 0.03); g.add(d);
    const o = shp(w + 0.4, h + 0.2); o.holes.push(shp(w, h));
    const sur = new THREE.Mesh(new THREE.ShapeGeometry(o), M.sill); sur.position.set(cx, 0, 0.045); g.add(sur);
    const key = box(0.26, 0.34, 0.08, M.sill, cx, h + 0.06, 0.06, g, false);
    box(0.03, h - w / 2, 0.04, M.dark, cx, (h - w / 2) / 2, 0.05, g, false);
    for (const sx of [-1, 1]) for (const hy of [0.5, h - w / 2 - 0.3]) box(w / 2 - 0.12, 0.05, 0.04, M.iron, cx + sx * w / 4, hy, 0.05, g, false);
    return;
  }
  if (dr.arch) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, map: woodTex });
    const d = new THREE.Mesh(new THREE.ShapeGeometry(lancetShape(w, h)), mat); d.position.set(cx, 0, 0.03); g.add(d);
    const o = lancetShape(w + 0.36, h + 0.22); o.holes.push(lancetShape(w, h));
    const sur = new THREE.Mesh(new THREE.ShapeGeometry(o), M.sill); sur.position.set(cx, 0, 0.04); g.add(sur);
    for (const dy of [0.7, 1.7]) box(w, 0.06, 0.03, M.iron, cx, dy, 0.05, g, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), M.iron); ring.position.set(cx + w * 0.3, 1.1, 0.06); g.add(ring);
    return;
  }
  if (dr.wreath) {
    const wr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 18), M.leaf2); wr.position.set(cx, 1.55, 0.12); wr.castShadow = true; g.add(wr);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd8203a })); const a = i * 1.05; b.position.set(cx + Math.cos(a) * 0.2, 1.55 + Math.sin(a) * 0.2, 0.19); g.add(b); }
  }
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
  box(w, h - 0.35, 0.06, mat, cx, (h - 0.35) / 2, 0.02, g);
  box(w * 0.34, (h - 0.35) * 0.36, 0.02, mat, cx - w * 0.22, (h - 0.35) * 0.72, 0.06, g, false);
  box(w * 0.34, (h - 0.35) * 0.36, 0.02, mat, cx + w * 0.22, (h - 0.35) * 0.72, 0.06, g, false);
  box(w * 0.34, (h - 0.35) * 0.36, 0.02, mat, cx - w * 0.22, (h - 0.35) * 0.28, 0.06, g, false);
  box(w * 0.34, (h - 0.35) * 0.36, 0.02, mat, cx + w * 0.22, (h - 0.35) * 0.28, 0.06, g, false);
  const fan = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.28), M.glass); fan.position.set(cx, h - 0.2, 0.03); g.add(fan);
  box(w + 0.16, 0.07, 0.1, M.frame, cx, h - 0.35, 0.04, g);
  box(w + 0.16, 0.08, 0.1, M.frame, cx, h + 0.02, 0.04, g);
  box(0.08, h, 0.1, M.frame, x - 0.04, h / 2, 0.04, g);
  box(0.08, h, 0.1, M.frame, x + w + 0.04, h / 2, 0.04, g);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.brass); knob.position.set(x + w * 0.82, 1.0, 0.09); g.add(knob);
  box(0.24, 0.06, 0.02, M.brass, cx, 1.25, 0.07, g, false);
  box(w + 0.5, 0.12, 0.45, M.sill, cx, 0.06, 0.24, g);
}

function makeRose(x, z, parent) {
  const g = new THREE.Group();
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), M.leaf2);
  bush.scale.set(1, 0.9, 1); bush.position.y = 0.32; bush.castShadow = true; g.add(bush);
  const col = [0xd8203a, 0xf06a8c, 0xfff1f0, 0xe8452c][Math.floor(rnd() * 4)];
  const pm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), pm); const a = rnd() * 6.3, e = rnd() * 1.2; f.position.set(Math.cos(a) * 0.3 * Math.cos(e), 0.32 + Math.sin(e) * 0.28, Math.sin(a) * 0.3 * Math.cos(e)); g.add(f); }
  g.position.set(x, 0, z);
  parent.add(g);
  breakables.push({ kind: 'rose', obj: g, x, y: 0.35, z, rx: 0.45, ry: 0.6, rz: 0.5, lift: 0.3, broken: false });
}

function buildLevelScene(L) {
  if (levelGroup) disposeGroup(levelGroup);
  levelGroup = new THREE.Group();
  root.add(levelGroup);
  root.position.x = -L.W / 2;
  const G = levelGroup;
  breakables = []; clearTags(); sceneDirty = false; sceneTickers.length = 0;
  const style = L.house.style || 'terrace';
  if (style !== 'rocket') buildHouse(G, L.house, { main: true, snow: L.snow });
  // world dressing that doesn't suit every job
  const lawn = world.userData.lawn;
  if (!lawn.userData.map) lawn.userData.map = lawn.material.map;
  lawn.material.map = L.snow || style === 'rocket' || style === 'tower' ? null : lawn.userData.map;
  lawn.material.color.set(L.snow ? 0xeef2f6 : style === 'rocket' ? 0xb8a57c : style === 'tower' ? 0x9a9c9e : 0xc4cfa8);
  lawn.material.needsUpdate = true;
  for (const m of world.userData.suburb) m.visible = style !== 'rocket' && style !== 'tower';
  // neighbours
  const nbAll = [
    { x0: L.house.x0 - 12, x1: L.house.x0 - 3.5, eaves: 6, brick: L.house.brick === 'red' ? 'yellow' : 'red', windows: [{ x: L.house.x0 - 10.5, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 7, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 10.5, y: 3.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 7, y: 3.9, w: 1.2, h: 1.3 }], door: { x: L.house.x0 - 5.4, w: 1, h: 2.1, color: '#355c7d' }, chimney: L.house.x0 - 9 },
    { x0: L.house.x1 + 3.5, x1: L.house.x1 + 12, eaves: 6, brick: L.house.brick === 'stone' ? 'render' : 'stone', windows: [{ x: L.house.x1 + 5, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 9, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 5, y: 3.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 9, y: 3.9, w: 1.2, h: 1.3 }], door: { x: L.house.x1 + 7.2, w: 1, h: 2.1, color: '#a23b2a' }, chimney: L.house.x1 + 6 },
  ];
  const nb = ['church', 'abbey', 'cathedral', 'rocket', 'tower'].includes(style) ? [] : style === 'leisure' || style === 'hall' || (L.event && (L.event.obstacles || []).some(o => o.prop === 'wall')) ? [nbAll[0]] : nbAll;
  for (const n of nb) { const hg = buildHouse(G, { ...n, style: 'terrace' }, { snow: L.snow }); hg.position.z = -2.5; }
  buildTheme(G, L, style);
  // paved strip in front, stepped by column
  const x0 = -9 + L.W / 2, x1 = 9 + L.W / 2;
  let runStart = x0, runG = L.groundAt(x0 + 0.01);
  const flush = (a, b, gy) => {
    if (b - a < 1e-3) return;
    const top = gy, bottom = -3;
    const geo = new THREE.BoxGeometry(b - a, top - bottom, STRIP_D);
    const mats = [M.stoneWall, M.stoneWall, M.paving, M.paving, M.stoneWall, M.stoneWall];
    const m = new THREE.Mesh(geo, mats);
    m.position.set((a + b) / 2, (top + bottom) / 2, STRIP_D / 2);
    m.receiveShadow = true; m.castShadow = true;
    // paving uv in metres
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (b - a) / 2.4, uv.getY(i) * STRIP_D / 2.4);
    G.add(m);
  };
  const edges = [];
  for (let x = Math.ceil(x0) - 0.5; x <= x1; x += 1) {
    const gy = L.groundAt(x + 0.5);
    if (gy !== runG) { flush(runStart, x, runG); edges.push({ x, a: runG, b: gy }); runStart = x; runG = gy; }
  }
  flush(runStart, x1, runG);
  // front retaining wall + railings for sunken areas
  let pit = null;
  for (let x = Math.ceil(x0) - 0.5; x <= x1; x += 1) {
    const gy = L.groundAt(x + 0.5);
    if (gy < 0) { if (!pit) pit = { a: x, b: x + 1, g: gy }; else pit.b = x + 1; }
  }
  if (pit) {
    box(pit.b - pit.a, -pit.g, 0.3, M.stoneWall, (pit.a + pit.b) / 2, pit.g / 2, STRIP_D + 0.15, G);
    const railY = 0, railH = 1.05;
    const railBits = [];
    const n = Math.round((pit.b - pit.a) / 0.14);
    for (let i = 0; i <= n; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, railH, 5), M.iron);
      bar.position.set(pit.a + i * (pit.b - pit.a) / n, railY + railH / 2, STRIP_D + 0.15); G.add(bar);
      railBits.push(bar);
      if (i % 2 === 0) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5), M.brass); sp.position.set(bar.position.x, railY + railH + 0.04, STRIP_D + 0.15); G.add(sp); railBits.push(sp); }
      if (railBits.length > 10) { makeBreakable('rail', railBits.splice(0), G, { rz: 1.2 }); }
    }
    box(pit.b - pit.a, 0.03, 0.04, M.iron, (pit.a + pit.b) / 2, railH - 0.1, STRIP_D + 0.15, G, false);
    box(pit.b - pit.a, 0.03, 0.04, M.iron, (pit.a + pit.b) / 2, 0.12, STRIP_D + 0.15, G, false);
    // basement window + door in the lightwell
    box(1.4, 1.2, 0.05, M.glass, (pit.a + pit.b) / 2 - 1, pit.g + 1.0, 0.03, G, false);
    box(0.9, 1.9, 0.05, new THREE.MeshStandardMaterial({ color: 0x223a5e, roughness: 0.4 }), (pit.a + pit.b) / 2 + 1.2, pit.g + 0.95, 0.03, G, false);
  }
  // no-base zones (rose beds)
  for (const nb2 of L.noBase) {
    const [a, b, kind] = nb2;
    if (kind === 'graves') {
      const stoneM = new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.95 });
      for (let x = a; x <= b; x += 1) for (const z of [1.0, 2.4]) {
        const p = [];
        const st = box(0.5, 0.75, 0.12, stoneM, x, 0.37, z, G); p.push(st);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 14, 1, false, 0, Math.PI), stoneM); top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2; top.position.set(x, 0.75, z); top.castShadow = true; G.add(top); p.push(top);
        makeBreakable('pot', p, G);
      }
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshStandardMaterial({ map: labelTex('R.I.P.\nNO BASE PLATES'), roughness: 0.8 }));
      sg.position.set(a + 0.9, 0.9, 3.1); G.add(sg);
      continue;
    }
    if (kind === 'roses') {
      const bedA = a - 0.45, bedB = b + 0.45;
      const soil = box(bedB - bedA, 0.08, STRIP_D - 0.4, new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 }), (bedA + bedB) / 2, 0.04, STRIP_D / 2 + 0.1, G, false);
      const edgeMat = texFromFacade('red', 1, 0.2);
      box(bedB - bedA + 0.2, 0.18, 0.1, edgeMat, (bedA + bedB) / 2, 0.09, STRIP_D - 0.05, G);
      box(bedB - bedA + 0.2, 0.18, 0.1, edgeMat, (bedA + bedB) / 2, 0.09, 0.25, G);
      box(0.1, 0.18, STRIP_D - 0.3, edgeMat, bedA - 0.05, 0.09, STRIP_D / 2 + 0.1, G);
      box(0.1, 0.18, STRIP_D - 0.3, edgeMat, bedB + 0.05, 0.09, STRIP_D / 2 + 0.1, G);
      for (let x = bedA + 0.4; x < bedB - 0.2; x += 0.75) for (const z of [0.8, 1.7, 2.6]) makeRose(x + (rnd() - 0.5) * 0.2, z + (rnd() - 0.5) * 0.2, G);
      // sign
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), M.bark); post.position.set(bedB - 0.2, 0.5, STRIP_D - 0.2); G.add(post);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: labelTex('PRIZE ROSES\nKEEP OFF'), roughness: 0.8 }));
      sg.position.set(bedB - 0.2, 1.0, STRIP_D - 0.18); G.add(sg);
      makeBreakable('sign', [post, sg], G);
    }
  }
  // forbidden zones: porch canopy or door mats
  for (const f of L.forbidden) {
    if (f.kind === 'buttress') {
      const stoneM = texFromFacade('stone', 1.2, 6);
      box(1.1, f.y1 + 1.2, 1.4, stoneM, (f.x0 + f.x1) / 2 + 0.3, (f.y1 + 1.2) / 2, 0.8, G);
      const arch = box(2.6, 0.6, 0.9, stoneM, (f.x0 + f.x1) / 2 - 0.4, f.y1 + 1.6, 0.45, G); arch.rotation.z = 0.5;
      for (const dx of [0, 0.5]) box(0.25, 0.8, 0.25, M.sill, (f.x0 + f.x1) / 2 + 0.3 + dx - 0.25, f.y1 + 1.6, 0.8, G);
    }
    if (f.kind === 'porch') {
      const cw = f.x1 - f.x0 - 0.4;
      const cmx = (f.x0 + f.x1) / 2;
      const roofM = new THREE.MeshStandardMaterial({ map: slateTex, roughness: 0.8 });
      const r = box(cw, 0.1, 1.5, roofM, cmx, 2.85, 0.72, G); r.rotation.x = 0.28;
      const fr = box(cw, 0.2, 0.08, M.white, cmx, 2.68, 1.45, G);
      const cols = [];
      for (const dx of [-cw / 2 + 0.12, cw / 2 - 0.12]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 12), M.white); c.position.set(cmx + dx, 1.3, 1.35); c.castShadow = true; G.add(c); cols.push(c); }
      makeBreakable('porch', [r, fr, ...cols], G, { rz: 1.6 });
    }
    if (f.kind === 'door') {
      box(1.0, 0.02, 0.6, new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 1 }), (f.x0 + f.x1) / 2, 0.01, 0.8, G, false);
      for (const dx of [-1.1, 1.1]) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.45, 14), M.terracotta); pot.position.set((f.x0 + f.x1) / 2 + dx, 0.22, 0.45); pot.castShadow = true; G.add(pot);
        const bay = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), M.leaf2); bay.position.set(pot.position.x, 0.85, 0.45); bay.castShadow = true; G.add(bay);
        makeBreakable('pot', [pot, bay], G);
      }
    }
  }
  // garden clutter for the scaffold to flatten
  if (!['church', 'abbey', 'cathedral', 'tower', 'rocket', 'leisure'].includes(style)) addProps(G, L);
  // windsock for windy jobs
  windsock = null;
  if (L.wind > 0) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5, 8), M.white);
    const wx = L.W + 3.5;
    pole.position.set(wx, 2.5, 5.5); pole.castShadow = true; G.add(pole);
    const sock = new THREE.Group(); sock.position.set(wx, 4.85, 5.5); G.add(sock);
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.025, 0.2 - (i + 1) * 0.025, 0.28, 14, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff6a13, side: THREE.DoubleSide, roughness: 0.8 }));
      c.rotation.z = -Math.PI / 2; c.position.x = 0.14 + i * 0.28; c.castShadow = true; sock.add(c); segs.push(c);
    }
    windsock = sock;
    makeBreakable('sock', [pole, sock], G, { rz: 1.2 });
  }
  // van + pile placement
  van.position.set(L.W / 2 + 6.5, 0, 13.6);
  pile.position.set(L.W / 2 + 7.8, 0.02, 5.3);
  pile.rotation.y = 0.3;
}

function signTex(text, bg = '#1f3b2c', fg = '#f1d38a') {
  return canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.font = '700 84px "Big Shoulders Stencil Display", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}
function bunting(G, x0, x1, y, z, sag = 0.35) {
  const cols = [0xd8203a, 0xf3d40b, 0x1f6fd1, 0xffffff, 0x2f9a4a];
  const n = Math.max(4, Math.round((x1 - x0) / 0.35));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = x0 + (x1 - x0) * t, yy = y - sag * 4 * t * (1 - t);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 3), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.8, side: THREE.DoubleSide }));
    f.rotation.x = Math.PI; f.position.set(x, yy - 0.12, z); G.add(f);
  }
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, x1 - x0, 4), M.dark); line.rotation.z = Math.PI / 2; line.position.set((x0 + x1) / 2, y - sag * 0.7, z); G.add(line);
}
function buildTheme(G, L, style) {
  const h = L.house, E = L.event || {};
  const stoneM = texFromFacade('stone', 2, 2);
  if (h.sign) {
    const tex = signTex(h.sign, style === 'leisure' ? '#1a6fb8' : style === 'hall' ? '#f4efe2' : '#1f3b2c', style === 'leisure' ? '#ffffff' : style === 'hall' ? '#2c4a7a' : '#f1d38a');
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(7, h.x1 - h.x0 - 1), 0.62), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    sg.position.set((h.x0 + h.x1) / 2, style === 'leisure' ? h.eaves - 0.6 : style === 'hall' ? 3.2 : 2.75, 0.05); G.add(sg);
  }
  if (style === 'pub') {
    for (const x of [h.x0 + 0.9, h.x1 - 0.9]) {
      const bk = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.leaf); bk.rotation.x = Math.PI; bk.position.set(x, 2.55, 0.35); G.add(bk);
      for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshStandardMaterial({ color: [0xd8203a, 0xf06a8c, 0xfff1f0][i % 3] })); f.position.set(x + (i - 2) * 0.1, 2.45, 0.55); G.add(f); }
    }
    bunting(G, h.x0, h.x1, h.eaves - 0.3, 0.25, 0.4);
    for (const x of [1.5, L.W - 1.5]) { box(1.4, 0.06, 0.5, M.bark, x, 0.72, 3.0, G); for (const dz of [-0.45, 0.45]) box(1.4, 0.05, 0.25, M.bark, x, 0.45, 3.0 + dz, G); }
  }
  if (style === 'mill') buildMill(G, L);
  if (style === 'yard') {
    // racks of tube and stacks of boards by the gate
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 8), M.steel); t.rotation.z = Math.PI / 2; t.position.set(-3.5, 0.3 + i * 0.12, 4.0 + (i % 2) * 0.1); G.add(t); }
    for (let i = 0; i < 6; i++) box(3.9, 0.06, 0.25, M.wood, -3.2, 0.05 + i * 0.07, 5.0, G);
    for (const [x, z] of [[-1.5, 3.6], [-0.8, 3.9]]) { box(1.2, 0.14, 1.0, M.bark, x, 0.07, z, G); box(1.0, 0.6, 0.9, texFromFacade('red', 1, 0.6), x, 0.44, z, G); }
  }
  if (style === 'church') {
    // west tower and spire off to the left
    const tx0 = h.x0 - 4.2, tw = 3.6, th = 14;
    const tm = texFromFacade('stone', tw, th);
    box(tw, th, tw, tm, tx0 + tw / 2, th / 2, -tw / 2 - 1, G);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.62, 8, 4), new THREE.MeshStandardMaterial({ map: slateTex, roughness: 0.8 }));
    sp.rotation.y = Math.PI / 4; sp.position.set(tx0 + tw / 2, th + 4, -tw / 2 - 1); sp.castShadow = true; G.add(sp);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.4 })); clock.position.set(tx0 + tw / 2, th - 2, 0.82 - 1 + 0.2); G.add(clock);
    box(0.05, 0.45, 0.02, M.brass, tx0 + tw / 2, th - 1.8, -0.0, G, false);
    for (const [x, z, s2] of [[-6, 4.5, 1.1], [L.W + 3, 4, 1.3], [L.W + 6, -2, 1.5]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s2, 3.4 * s2, 8), M.leaf2); t.position.set(x, 1.7 * s2, z); t.castShadow = true; G.add(t); }
    for (const x of [-2.5, L.W + 1.2, L.W + 2.2]) for (const z of [4.3, 5.4]) { const st = box(0.5, 0.75, 0.12, new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 0.95 }), x, 0.37, z, G); }
  }
  if (style === 'abbey' || style === 'cathedral') {
    // buttresses between the windows, pinnacles along the top
    const wins = h.windows || [];
    const clear = (x) => !wins.some(w => x > w.x - 0.4 && x < w.x + w.w + 0.4) && !(h.door && x > h.door.x - 0.4 && x < h.door.x + h.door.w + 0.4);
    for (let x = h.x0 + 0.3; x <= h.x1 - 0.3; x += 0.5) if (clear(x) && (Math.round((x - h.x0) * 2) % 5 === 0)) {
      box(0.45, h.eaves * 0.62, 0.35, stoneM, x, h.eaves * 0.31, 0.17, G);
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 4), M.sill); pin.position.set(x, h.eaves + 0.55, 0.12); pin.castShadow = true; G.add(pin);
    }
    if (style === 'cathedral' && h.tower) {
      box(h.x1 - h.x0 + 0.4, 0.5, 0.4, M.sill, (h.x0 + h.x1) / 2, 8.9, 0.15, G);
      box(h.x1 - h.x0 + 0.4, 0.5, 0.4, M.sill, (h.x0 + h.x1) / 2, 12.6, 0.15, G);
    }
    if (style === 'cathedral') {
      for (const x of [h.x0 - 1.6, h.x1 + 1.6]) {
        const tm = texFromFacade('stone', 3, h.eaves + 6);
        box(3, h.eaves + 6, 3, tm, x, (h.eaves + 6) / 2, -1.2, G);
        for (const dx of [-1.2, 1.2]) { const pin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2, 4), M.sill); pin.position.set(x + dx, h.eaves + 7, -0.1); G.add(pin); }
      }
    }
    for (const [x, z] of [[-4, 4.5], [L.W + 4, 4.8]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.6, 8), M.leaf2); t.position.set(x, 1.8, z); t.castShadow = true; G.add(t); }
  }
  if (E.type === 'chute') {
    // the skip, and the Bishop's car right next to it
    const [s0, s1] = E.skip;
    const skipM = new THREE.MeshStandardMaterial({ color: 0xf0b90b, roughness: 0.6, metalness: 0.2 });
    const sk = new THREE.Group(); G.add(sk); sk.position.set((s0 + s1) / 2, 0, 2.3);
    const mk = (w, hh, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), skipM); m.position.set(x, y, z); m.castShadow = true; sk.add(m); };
    const sw = s1 - s0 + 0.6;
    mk(sw, 0.1, 1.5, 0, 0.1, 0); mk(sw, 1.0, 0.08, 0, 0.6, -0.75); mk(sw, 1.0, 0.08, 0, 0.6, 0.75); mk(0.08, 1.0, 1.5, -sw / 2, 0.6, 0); mk(0.08, 1.0, 1.5, sw / 2, 0.6, 0);
    const [c0, c1] = E.car;
    const car = new THREE.Group(); G.add(car); car.position.set((c0 + c1) / 2, 0, 3.6);
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x5a1f6e, roughness: 0.25, metalness: 0.6, clearcoat: 1 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(c1 - c0 + 0.8, 0.7, 1.7, 3, 0.2), paint); body.position.y = 0.6; body.castShadow = true; car.add(body);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.55, 1.5, 3, 0.15), M.glass); cab.position.set(-0.1, 1.15, 0); car.add(cab);
    for (const dx of [-0.95, 0.95]) for (const dz of [-0.8, 0.8]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), M.dark); wh.rotation.x = Math.PI / 2; wh.position.set(dx, 0.3, dz); car.add(wh); }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.16), new THREE.MeshStandardMaterial({ map: labelTex('BI5HOP'), roughness: 0.6 })); plate.position.set(0, 0.55, 0.86); car.add(plate);
    G.userData.car = car;
  }
  if (E.type === 'zip' || style === 'hall') {
    // the pub across the road the zip wire runs to
    const px = L.W + (E.dx || 16);
    const pub = buildHouse(G, { style: 'pub', x0: px - 1.5, x1: px + 6, eaves: 5, brick: 'render', windows: [{ x: px - 0.6, y: 0.9, w: 1.4, h: 1.3 }, { x: px + 3.6, y: 0.9, w: 1.4, h: 1.3 }], door: { x: px + 1.6, w: 1, h: 2.1, color: '#1f3b2c' } });
    pub.position.z = -2.5;
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.55), new THREE.MeshStandardMaterial({ map: signTex('THE DOG & DUCK'), roughness: 0.6 })); sg.position.set(px + 2.2, 2.6, -2.4); G.add(sg);
    bunting(G, 0.2, L.W - 0.2, 4.2, 3.2, 0.5);
    for (const [x, col] of [[2, 0xd8203a], [6.5, 0x1f6fd1]]) {
      const stall = new THREE.Group(); stall.position.set(x, 0, 5.2); G.add(stall);
      box(1.8, 0.8, 0.8, M.bark, 0, 0.4, 0, stall);
      const can = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); can.position.y = 2.0; can.rotation.x = -0.15; stall.add(can);
      for (const dx of [-0.9, 0.9]) box(0.05, 2, 0.05, M.white, dx, 1, -0.5, stall);
    }
  }
  if (E.type === 'bmx') buildBmxScene(G, L);
  if (E.type === 'fireworks') {
    // bonfire in the close
    const bx = -3.5;
    for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), M.bark); l.position.set(bx + Math.cos(i * 0.7) * 0.4, 0.8, 4.5 + Math.sin(i * 0.7) * 0.4); l.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i * 1.3) * 0.5); G.add(l); }
    const fire = new THREE.PointLight(0xff7a2a, 30, 14); fire.position.set(bx, 1.4, 4.5); G.add(fire);
    G.userData.fire = { light: fire, x: bx, z: 4.5 };
  }
  if (L.snow) {
    const snowM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const sm = new THREE.Group(); sm.position.set(-2.5, 0, 4.5); G.add(sm);
    for (const [r, y] of [[0.45, 0.42], [0.32, 1.1], [0.22, 1.6]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), snowM); b.position.y = y; b.castShadow = true; sm.add(b); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xff7a1a })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.6, 0.25); sm.add(nose);
    // fairy lights along the gutter
    const lightsCol = [0xff4040, 0x40ff60, 0x4080ff, 0xffd040];
    for (let x = h.x0; x <= h.x1; x += 0.35) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshStandardMaterial({ color: lightsCol[Math.round(x / 0.35) % 4], emissive: lightsCol[Math.round(x / 0.35) % 4], emissiveIntensity: 2 })); b.position.set(x, h.eaves - 0.25 - 0.08 * Math.abs(Math.sin(x * 2)), 0.45); G.add(b); }
    box(18, 0.03, STRIP_D, snowM, L.W / 2, 0.012, STRIP_D / 2, G, false);
  }
  if (style === 'tower') {
    for (const [x, hh, z, wdt] of [[-10, 46, -4, 8], [L.W + 9, 58, -6, 9], [-22, 34, -10, 10], [L.W + 22, 40, -12, 10]]) {
      const tm = texFromFacade('glass', wdt, hh);
      box(wdt, hh, wdt, tm, x, hh / 2, z - wdt / 2, G);
    }
    for (const x of [0, L.W]) { const planter = box(1.4, 0.5, 1.0, M.stoneWall, x, 0.25, 3.0, G); const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), M.leaf); t.position.set(x, 0.9, 3.0); G.add(t); }
  }
  if (style === 'rocket') buildRocket(G, L);
}
// ---------------------------------------------------------------------------
//  The corn mill: stone bands and quoins, a stack of loading doors under a
//  timber lucam with its hoist beam, a date stone, a brick chimney and the
//  waterwheel on its race.
// ---------------------------------------------------------------------------
const sceneTickers = [];
// ---------------------------------------------------------------------------
//  BMX jobs: the finish (pool, skip, airbag, crash mat, belfry balcony),
//  things to hit (vans, walls), the sponsor's hoops and the storm drain.
// ---------------------------------------------------------------------------
const bmxProps = { hoops: [], bell: null, finish: null, drain: null };
function buildBmxScene(G, L) {
  const E = L.event, F = E.finish || { kind: 'ground', x0: E.pool[0], x1: E.pool[1], y: 0.25, prop: 'pool' };
  bmxProps.hoops = []; bmxProps.bell = null; bmxProps.finish = null; bmxProps.drain = null;
  const fw = F.x1 - F.x0, fx = (F.x0 + F.x1) / 2;
  const post = (text, x, z) => {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshStandardMaterial({ map: labelTex(text), roughness: 0.8 })); sg.position.set(x, 1.1, z); G.add(sg);
    box(0.05, 1, 0.05, M.bark, x, 0.5, z - 0.03, G);
  };
  if (F.prop === 'pool') {
    const pool = new THREE.Group(); G.add(pool); pool.position.set(fx, 0, Z_MID);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(fw / 2, 0.22, 10, 32), new THREE.MeshStandardMaterial({ color: 0x3fa9f5, roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.22; pool.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(fw / 2 - 0.05, 32), new THREE.MeshStandardMaterial({ color: 0x6fd0ff, roughness: 0.1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.3; pool.add(water);
    const duck = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd12d })); duck.position.set(0.3, 0.38, 0.2); pool.add(duck);
    post('LANDING\nZONE', fx, Z_MID - 1.3);
    bmxProps.finish = pool;
  } else if (F.prop === 'skip') {
    const sk = new THREE.Group(); G.add(sk); sk.position.set(fx, 0, Z_MID);
    const yel = new THREE.MeshStandardMaterial({ color: 0xf0b90b, roughness: 0.6, metalness: 0.2 });
    const sh = new THREE.Shape(); sh.moveTo(-fw / 2 + 0.35, 0); sh.lineTo(fw / 2 - 0.35, 0); sh.lineTo(fw / 2, F.y); sh.lineTo(-fw / 2, F.y); sh.lineTo(-fw / 2 + 0.35, 0);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: false }), yel); body.position.z = -0.85; body.castShadow = true; sk.add(body);
    box(fw + 0.06, 0.08, 1.76, M.dark, 0, F.y, 0, sk);
    const matt = [0xf2efe6, 0xdfe8f2, 0xe9dccb];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new RoundedBoxGeometry(fw * 0.42, 0.22, 1.4, 2, 0.08), new THREE.MeshStandardMaterial({ color: matt[i], roughness: 0.95 })); m.position.set(-fw * 0.25 + i * fw * 0.25, F.y + 0.05 + i * 0.06, 0); m.rotation.z = (i - 1) * 0.12; m.castShadow = true; sk.add(m); }
    post('MIND THE\nSKIP', F.x1 + 0.8, Z_MID - 0.9);
    bmxProps.finish = sk;
  } else if (F.prop === 'airbag' || F.prop === 'mat') {
    const big = F.prop === 'airbag';
    const col = big ? 0x2a6fdb : 0x2b4fa0;
    const m = new THREE.Mesh(new RoundedBoxGeometry(fw, F.y, big ? 3 : 2.2, 4, big ? 0.35 : 0.12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    m.position.set(fx, F.y / 2, Z_MID); m.castShadow = true; m.receiveShadow = true; G.add(m);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(fw - 0.3, 2.2), F.y * 0.6), new THREE.MeshStandardMaterial({ map: labelTex(big ? 'STUNT' : 'CRASH MAT', '#2a6fdb', '#ffffff'), roughness: 0.7, transparent: true }));
    lab.position.set(fx, F.y / 2, Z_MID + (big ? 1.51 : 1.11)); G.add(lab);
    if (big) for (const dx of [-fw / 2 + 0.3, fw / 2 - 0.3]) { const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16), M.dark); fan.rotation.x = Math.PI / 2; fan.position.set(fx + dx, 0.3, Z_MID + 1.7); G.add(fan); }
    bmxProps.finish = m;
  } else if (F.prop === 'balcony') {
    // a stone balcony round the belfry, with the bell in the louvred opening above it
    const dressed = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.85 });
    const z0 = -1.0, z1 = 1.6, zc = (z0 + z1) / 2;
    box(fw + 0.3, 0.22, z1 - z0, dressed, fx, F.y - 0.11, zc, G);
    for (let i = 0; i <= 8; i++) { const x = F.x0 - 0.1 + i * (fw + 0.2) / 8; box(0.07, 0.75, 0.07, dressed, x, F.y + 0.37, z1 - 0.05, G, false); }
    box(fw + 0.3, 0.08, 0.14, dressed, fx, F.y + 0.78, z1 - 0.05, G);
    for (const sx of [F.x0 - 0.1, F.x1 + 0.1]) box(0.14, 0.08, z1 - z0, dressed, sx, F.y + 0.78, zc, G);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), dressed); c.rotation.x = Math.PI; c.position.set(F.x0 + 0.3 + i * (fw - 0.6) / 2, F.y - 0.45, z1 - 0.2); G.add(c); }
    const arch = new THREE.Mesh(new THREE.ShapeGeometry(lancetShape(1.5, 2.6)), M.dark); arch.position.set(fx, F.y + 1.0, -0.98); G.add(arch);
    const bellG = new THREE.Group(); bellG.position.set(fx, F.y + 3.2, -0.6); G.add(bellG);
    const prof = [[0, 0], [0.42, 0], [0.45, 0.06], [0.36, 0.25], [0.26, 0.7], [0.24, 0.9], [0.1, 0.98], [0, 1]].map(([x, y]) => new THREE.Vector2(x, -y));
    const bell = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 24), M.brass); bell.position.y = -0.05; bell.rotation.x = Math.PI; bell.position.y = -1.0;
    const bell2 = new THREE.Group(); bell2.add(bell); bellG.add(bell2);
    box(1.2, 0.12, 0.12, M.bark, 0, 0.05, 0, bellG);
    bmxProps.bell = { g: bell2, ring: 0 };
    sceneTickers.push((dt) => { const b = bmxProps.bell; if (!b) return; b.ring = Math.max(0, b.ring - dt * 0.12); b.g.rotation.z = Math.sin(performance.now() / 260) * 0.9 * b.ring; });
    bmxProps.finish = bellG;
  }
  // things in the way
  const vanCols = [0xf4f2ec, 0x2f6fb8, 0xc0392b];
  (E.obstacles || []).forEach((o, i) => {
    const w = o.x1 - o.x0, cx = (o.x0 + o.x1) / 2;
    if (o.prop === 'van') {
      const v = new THREE.Group(); G.add(v); v.position.set(cx, 0, Z_MID);
      const paint = new THREE.MeshPhysicalMaterial({ color: vanCols[i % 3], roughness: 0.35, clearcoat: 0.6 });
      const body = new THREE.Mesh(new RoundedBoxGeometry(w, o.y1 - 0.35, 1.8, 3, 0.12), paint); body.position.y = 0.35 + (o.y1 - 0.35) / 2; body.castShadow = true; v.add(body);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 1.5), M.glass); ws.position.set(w / 2 + 0.01, o.y1 - 0.55, 0); v.add(ws);
      for (const dx of [-w / 2 + 0.45, w / 2 - 0.45]) for (const dz of [-0.85, 0.85]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16), M.dark); wh.rotation.x = Math.PI / 2; wh.position.set(dx, 0.33, dz); v.add(wh); }
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.4), new THREE.MeshStandardMaterial({ map: labelTex(['TUBE & CLAMP', 'PLUMBING', 'DAVE & SON'][i % 3]), roughness: 0.6 })); sg.position.set(0, o.y1 * 0.55, 0.91); v.add(sg);
    } else if (o.prop === 'wall') {
      const d = 11, zc = 3.3 - d / 2, tm = texFromFacade('red', d, o.y1), tf = texFromFacade('red', w, o.y1);
      box(w, o.y1, d, [tm, tm, M.sill, M.sill, tf, tf], cx, o.y1 / 2, zc, G);
      box(w + 0.2, 0.16, d + 0.1, M.sill, cx, o.y1 + 0.08, zc, G);
      for (let z = zc - d / 2 + 1; z < zc + d / 2; z += 2.5) box(w + 0.25, o.y1 * 0.92, 0.5, tf, cx, o.y1 * 0.46, z, G);
      const ps = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: labelTex('MEMORIAL\nPARK', '#2f5d3a', '#ffffff'), roughness: 0.7 })); ps.position.set(cx, 2.6, zc + d / 2 + 0.27); G.add(ps);
      // the park beyond
      for (const [x, z, s2] of [[o.x1 + 2, -3, 1.2], [o.x1 + 6.5, -4, 1.5], [o.x1 + 4, 5, 1]]) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s2, 1), M.leaf); t.position.set(x, 2.6 * s2, z); t.castShadow = true; G.add(t); box(0.25, 2 * s2, 0.25, M.bark, x, s2, z, G); }
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(14, 16), new THREE.MeshStandardMaterial({ color: 0x6f9a45, roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.position.set(o.x1 + 7, 0.015, Z_MID - 3); gr.receiveShadow = true; G.add(gr);
    }
  });
  // the sponsor's hoops, on poles
  (E.hoops || []).forEach((h, i) => {
    const g = new THREE.Group(); g.position.set(h.x, h.y, Z_MID); G.add(g);
    const r = h.r ?? 0.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 10, 36), new THREE.MeshStandardMaterial({ color: h.fire ? 0x3a3d42 : 0xff2d8a, roughness: 0.4, metalness: h.fire ? 0.7 : 0.1, emissive: h.fire ? 0x000000 : 0x550022 }));
    ring.rotation.y = 1.0; g.add(ring);
    box(0.06, h.y - r, 0.06, M.iron, h.x, (h.y - r) / 2, Z_MID - 0.5, G);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: labelTex(`FIZZ £${h.cash}`, '#ff2d8a', '#ffffff'), roughness: 0.6 })); tag.position.set(0, -r - 0.3, -0.45); g.add(tag);
    const flames = [];
    if (h.fire) for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xff7a1a : 0xffd12d, transparent: true, opacity: 0.9 }));
      f.position.set(Math.cos(a) * r * Math.cos(1.0), Math.sin(a) * r + 0.12, -Math.cos(a) * r * Math.sin(1.0)); g.add(f); flames.push(f);
    }
    const hv = { g, ring, flames, got: 0 };
    bmxProps.hoops[i] = hv;
    sceneTickers.push((dt) => {
      const t = performance.now() / 1000;
      for (const [k, f] of flames.entries()) f.scale.y = 1 + Math.sin(t * 17 + k * 1.7) * 0.35;
      if (hv.got > 0) { hv.got = Math.max(0, hv.got - dt); ring.rotation.z += dt * 14 * hv.got; g.scale.setScalar(1 + 0.25 * Math.sin(hv.got * 12) * hv.got); }
    });
  });
  // the storm drain he shoots out of
  if (E.drain) {
    const D = E.drain, gy = L.groundAt(D.x);
    const g = new THREE.Group(); g.position.set(D.x, gy, Z_MID); G.add(g);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), holeMat); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; g.add(hole);
    for (let k = -2; k <= 2; k++) box(0.06, 0.04, 1.0, ironMat, k * 0.18, 0.03, 0, g, false);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshStandardMaterial({ map: labelTex('STORM\nDRAIN'), roughness: 0.8 })); sg.position.set(0.9, 0.9, -1.2); g.add(sg);
    box(0.05, 0.7, 0.05, M.bark, 0.9, 0.35, -1.23, g);
    bmxProps.drain = g;
  }
}
function sceneryTick(dt) { for (const f of sceneTickers) f(dt); }
function buildMill(G, L) {
  const h = L.house, w = h.x1 - h.x0, cx = (h.x0 + h.x1) / 2, ld = h.loadingDoors;
  const dressed = new THREE.MeshStandardMaterial({ color: 0xd9d0bd, roughness: 0.85 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8, map: woodTex });
  const darkTimber = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.85, map: woodTex });
  const iron = M.iron;
  // string courses at each floor, and a cornice
  for (const y of [3, 6]) box(w + 0.12, 0.16, 0.12, dressed, cx, y - 0.08, 0.06, G, false);
  box(w + 0.3, 0.22, 0.25, dressed, cx, h.eaves - 0.11, 0.1, G);
  // quoins: alternating long and short dressed stones up both corners
  for (const [x, s] of [[h.x0, 1], [h.x1, -1]]) for (let y = 0.15, i = 0; y < h.eaves - 0.3; y += 0.34, i++) {
    const lw = i % 2 ? 0.34 : 0.56;
    box(lw, 0.3, 0.06, dressed, x + s * lw / 2, y + 0.15, 0.03, G, false);
  }
  // loading doors on the first and second floors: frame, two planked leaves, strap hinges, a stone lintel
  for (const y0 of [3, 6]) {
    const dw = 1.1, dh = 2.0;
    box(dw + 0.24, 0.24, 0.14, dressed, ld, y0 + dh + 0.12, 0.07, G);
    box(dw + 0.3, 0.1, 0.18, dressed, ld, y0 + 0.05, 0.09, G);
    for (const sx of [-1, 1]) {
      box(0.1, dh, 0.08, darkTimber, ld + sx * (dw / 2 + 0.05), y0 + dh / 2, 0.04, G, false);
      const leaf = box(dw / 2 - 0.02, dh - 0.1, 0.05, timber, ld + sx * (dw / 4), y0 + dh / 2 + 0.05, 0.03, G, false);
      for (let k = 1; k < 4; k++) box(0.012, dh - 0.12, 0.055, darkTimber, ld + sx * (dw / 4) - dw / 4 + k * dw / 8, y0 + dh / 2 + 0.05, 0.035, G, false);
      for (const hy of [0.45, dh - 0.35]) box(dw / 2 - 0.1, 0.05, 0.065, iron, ld + sx * (dw / 4 + 0.03), y0 + hy, 0.04, G, false);
      box(0.05, 0.05, 0.08, iron, ld + sx * 0.08, y0 + dh / 2, 0.06, G, false);
    }
  }
  // the lucam: a timber hoist housing sticking out over the loading doors, with its own little roof
  const luc = new THREE.Group(); luc.position.set(ld, h.eaves - 0.9, 0); G.add(luc);
  const board = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.85, map: woodTex });
  box(1.7, 2.1, 1.3, board, 0, 1.05, 0.2, luc);
  for (let y = 0.15; y < 2.1; y += 0.22) box(1.72, 0.03, 1.32, darkTimber, 0, y, 0.2, luc, false);
  box(0.9, 1.1, 0.04, darkTimber, 0, 0.75, 0.87, luc, false);
  const slate = new THREE.MeshStandardMaterial({ map: slateTex, roughness: 0.8 });
  for (const sg of [-1, 1]) { const r = box(1.05, 0.08, 1.6, slate, sg * 0.45, 2.45, 0.25, luc); r.rotation.z = -sg * 0.62; }
  box(0.1, 0.12, 1.65, darkTimber, 0, 2.78, 0.25, luc);
  // hoist beam, pulley and chain
  box(0.18, 0.2, 1.4, darkTimber, 0, 2.05, 1.35, luc);
  const pul = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 16), iron); pul.position.set(0, 1.85, 1.9); luc.add(pul);
  for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 8), iron); l.position.set(0, 1.7 - i * 0.09, 1.9); l.rotation.y = (i % 2) * Math.PI / 2; luc.add(l); }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 10, Math.PI * 1.4), iron); hook.position.set(0, 1.02, 1.9); luc.add(hook);
  // date stone
  if (h.datestone) {
    const tex = canvasTex(512, 128, (g, cw, ch) => { g.fillStyle = '#d9d0bd'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#8a8070'; g.lineWidth = 8; g.strokeRect(8, 8, cw - 16, ch - 16); g.fillStyle = '#5a5244'; g.font = '700 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.datestone, cw / 2, ch / 2 + 3); });
    const ds = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.48, 0.08), [dressed, dressed, dressed, dressed, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), dressed]);
    ds.position.set(2.3, 8.45, 0.05); G.add(ds);
  }
  // tall brick chimney behind the mill
  const brick = texFromFacade('red', 1.6, 16);
  const ch = box(1.5, 16, 1.5, brick, h.x1 + 1.7, 8, -6, G);
  for (const y of [15.2, 15.6]) box(1.8, 0.25, 1.8, dressed, h.x1 + 1.7, y, -6, G);
  box(1.8, 0.3, 1.8, dressed, h.x1 + 1.7, 0.15, -6, G);
  // the waterwheel on the side wall, turning on its race
  const wheel = new THREE.Group(); wheel.position.set(h.x0 - 0.75, 2.3, -3.4); G.add(wheel);
  const wt = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9, map: woodTex });
  const R = 2.3;
  for (const dx of [-0.3, 0.3]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 8, 40), wt); rim.rotation.y = Math.PI / 2; rim.position.x = dx; wheel.add(rim); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), iron); hub.rotation.z = Math.PI / 2; wheel.add(hub);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 10), iron); axle.rotation.z = Math.PI / 2; axle.position.x = 0.6; wheel.add(axle);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (const dx of [-0.3, 0.3]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, R * 2, 0.1), wt); sp.position.x = dx; sp.rotation.x = a; wheel.add(sp); } }
  for (let i = 0; i < 20; i++) { const a = i * Math.PI * 2 / 20; const pd = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.42), wt); pd.position.set(0, Math.sin(a) * (R - 0.15), Math.cos(a) * (R - 0.15)); pd.rotation.x = -a; pd.castShadow = true; wheel.add(pd); }
  sceneTickers.push((dt) => { wheel.rotation.x -= dt * 0.45; });
  // the race: a stone channel of water running past the wheel
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 12), new THREE.MeshStandardMaterial({ color: 0x3f6f86, roughness: 0.15, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(h.x0 - 0.75, 0.06, -3); G.add(water);
  for (const dx of [-0.6, 0.6]) box(0.2, 0.3, 12, M.stoneWall, h.x0 - 0.75 + dx, 0.15, -3, G);
  // sacks and a cart by the door
  const sackM = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1 });
  for (let i = 0; i < 3; i++) { const sk = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.7, 0.4, 3, 0.12), sackM); sk.position.set(6.3 + i * 0.5, 0.35, 3.1 - (i % 2) * 0.25); sk.rotation.y = i * 0.4; sk.castShadow = true; G.add(sk); }
}
const rocketParts = { g: null, flame: null, y0: 0 };
function buildRocket(G, L) {
  const h = L.house, cx = (h.x0 + h.x1) / 2, r = (h.x1 - h.x0) / 2;
  const g = new THREE.Group(); G.add(g); g.position.set(cx, 0, -r - 0.05);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.45, metalness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h.eaves - 4, 32), white); body.position.y = 1.2 + (h.eaves - 4) / 2; body.castShadow = true; g.add(body);
  for (const y of [3, 7, 11]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.6, 32), black); b.position.y = y; g.add(b); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(r, 4, 32), white); nose.position.y = h.eaves - 2.8 + 2; nose.castShadow = true; g.add(nose);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ map: labelTex('WSA\nWESSEX', '#1f3b73', '#ffffff'), roughness: 0.6 })); flag.position.set(0, 6, r + 0.01); g.add(flag);
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), black); hatch.rotation.y = Math.PI / 2; hatch.position.set(r + 0.01, L.zones[0].y + 1.0, 0); g.add(hatch);
  for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.1), black); const a = i * Math.PI / 2 + Math.PI / 4; fin.position.set(Math.cos(a) * (r + 0.4), 2.2, Math.sin(a) * (r + 0.4)); fin.rotation.y = -a; g.add(fin); }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.85, 1.2, 24), black); nozzle.position.y = 0.6; g.add(nozzle);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.85, depthWrite: false }));
  flame.rotation.x = Math.PI; flame.position.y = -3; flame.visible = false; g.add(flame);
  rocketParts.g = g; rocketParts.flame = flame; rocketParts.y0 = 0;
  // launch pad and flame trench
  box(8, 0.3, 8, M.stoneWall, cx, 0.15, -r, G);
  box(3.2, 0.32, 3.2, M.dark, cx, 0.16, -r, G);
  for (const [x, z] of [[-6, 3], [L.W + 5, 4], [L.W + 8, -3]]) { const cac = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2, 8), M.leaf2); cac.position.set(x, 1, z); G.add(cac); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: labelTex('DANGER\nLAUNCH AREA', '#f3d40b', '#161b21'), roughness: 0.7 })); sign.position.set(L.W + 2, 1.2, 4.5); G.add(sign);
}
function addProps(G, L) {
  const clear = (x) => x > 0.3 && x < L.W - 0.3 && !L.forbidden.some(f => x > f.x0 - 0.6 && x < f.x1 + 0.6) && !L.noBase.some(([a, b]) => x > a - 0.8 && x < b + 0.8) && L.groundAt(x) === 0;
  const spots = [];
  for (let x = 0.6; x < L.W; x += 0.5) if (clear(x)) spots.push(x);
  if (!spots.length) return;
  const pick = (i) => spots[Math.floor((i * 0.37 + 0.13) % 1 * spots.length)];
  const mk = (geo, mat, x, y, z, grp) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; grp.push(m); G.add(m); return m; };
  // gnome
  { const x = pick(0), z = 3.2, p = [];
    mk(new THREE.CylinderGeometry(0.09, 0.12, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x2e62b8, roughness: 0.6 }), x, 0.11, z, p);
    mk(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 }), x, 0.28, z, p);
    mk(new THREE.ConeGeometry(0.09, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0xd8203a, roughness: 0.5 }), x, 0.44, z, p);
    mk(new THREE.ConeGeometry(0.07, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), x, 0.23, z + 0.05, p).rotation.x = Math.PI;
    makeBreakable('gnome', p, G); }
  // wheelie bin
  { const x = pick(1), z = 3.2, p = [];
    const binM = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.6 });
    mk(new RoundedBoxGeometry(0.58, 1.0, 0.7, 2, 0.04), binM, x, 0.52, z, p);
    mk(new RoundedBoxGeometry(0.62, 0.06, 0.76, 2, 0.02), binM, x, 1.05, z, p);
    for (const dx of [-0.24, 0.24]) mk(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), M.dark, x + dx, 0.1, z - 0.3, p).rotation.z = Math.PI / 2;
    makeBreakable('bin', p, G); }
  // bird bath
  { const x = pick(2), z = 3.05, p = [];
    mk(new THREE.CylinderGeometry(0.07, 0.12, 0.7, 10), M.sill, x, 0.35, z, p);
    mk(new THREE.CylinderGeometry(0.3, 0.16, 0.12, 16), M.sill, x, 0.76, z, p);
    makeBreakable('birdbath', p, G); }
  // potted plants
  for (const i of [3, 4]) {
    const x = pick(i), z = 3.1, p = [];
    mk(new THREE.CylinderGeometry(0.17, 0.12, 0.32, 12), M.terracotta, x, 0.16, z, p);
    mk(new THREE.IcosahedronGeometry(0.24, 1), M.leaf, x, 0.5, z, p);
    makeBreakable('pot', p, G);
  }
}
