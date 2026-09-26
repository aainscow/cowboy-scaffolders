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
  return true;
}
// Plywood over the windows the player has boarded up.
const plyMat = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.85, map: woodTex });
let boardUps = [];
function syncBoardUps(L, pieces) {
  for (const m of boardUps) m.parent && m.parent.remove(m);
  boardUps = [];
  const set = new Set(pieces.filter(p => p.type === 'protect').map(p => p.a[0]));
  for (const b of breakables) if (b.kind === 'window') b.protected = set.has(b.wi);
  (L.house.windows || []).forEach((w, i) => {
    if (!set.has(i)) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.26, w.h + 0.26, 0.025), plyMat);
    m.position.set(w.x + w.w / 2, w.y + w.h / 2, 0.13); m.castShadow = true; m.receiveShadow = true;
    levelGroup.add(m); boardUps.push(m);
  });
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
  const w = h.x1 - h.x0, depth = opts.depth ?? 8, eaves = h.eaves;
  const cx = (h.x0 + h.x1) / 2;
  const facade = texFromFacade(h.brick, w, eaves);
  const side = texFromFacade(h.brick, depth, eaves);
  const plinth = opts.base ?? 0;
  // main walls
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, eaves - plinth, depth), [side, side, M.dark, M.dark, facade, side]);
  body.position.set(cx, plinth + (eaves - plinth) / 2, -depth / 2);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
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

function addWindow(g, wd, brick, reg, wi) {
  const { x, y, w, h } = wd;
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
  breakables = []; clearTags(); sceneDirty = false;
  buildHouse(G, L.house, { main: true });
  // neighbours
  const nb = [
    { x0: L.house.x0 - 12, x1: L.house.x0 - 3.5, eaves: 6, brick: L.house.brick === 'red' ? 'yellow' : 'red', windows: [{ x: L.house.x0 - 10.5, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 7, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 10.5, y: 3.9, w: 1.2, h: 1.3 }, { x: L.house.x0 - 7, y: 3.9, w: 1.2, h: 1.3 }], door: { x: L.house.x0 - 5.4, w: 1, h: 2.1, color: '#355c7d' }, chimney: L.house.x0 - 9 },
    { x0: L.house.x1 + 3.5, x1: L.house.x1 + 12, eaves: 6, brick: L.house.brick === 'stone' ? 'render' : 'stone', windows: [{ x: L.house.x1 + 5, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 9, y: 0.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 5, y: 3.9, w: 1.2, h: 1.3 }, { x: L.house.x1 + 9, y: 3.9, w: 1.2, h: 1.3 }], door: { x: L.house.x1 + 7.2, w: 1, h: 2.1, color: '#a23b2a' }, chimney: L.house.x1 + 6 },
  ];
  for (const n of nb) { const hg = buildHouse(G, n); hg.position.z = -2.5; }
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
  addProps(G, L);
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
