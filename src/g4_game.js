// ============================================================================
//  Sound (synthesised), overlays, input, HUD and the game flow.
// ============================================================================
const sfx = (() => {
  let ctx = null, master = null, muted = false, noiseBuf = null, windNode = null, windGain = null;
  try { muted = localStorage.getItem('tf.muted') === '1'; } catch (e) { }
  function ensure() {
    if (muted) return false;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        windNode = ctx.createBufferSource(); windNode.buffer = noiseBuf; windNode.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
        windGain = ctx.createGain(); windGain.gain.value = 0;
        windNode.connect(f); f.connect(windGain); windGain.connect(master); windNode.start();
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  const now = () => ctx.currentTime;
  function tone(freq, dur, { type = 'sine', gain = 0.3, when = 0, slide = null, attack = 0.004 } = {}) {
    if (!ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now() + when);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, now() + when + dur);
    g.gain.setValueAtTime(0, now() + when);
    g.gain.linearRampToValueAtTime(gain, now() + when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + when + dur);
    o.connect(g); g.connect(master); o.start(now() + when); o.stop(now() + when + dur + 0.05);
  }
  function noise(dur, { gain = 0.3, when = 0, type = 'lowpass', freq = 2000, q = 0.7, sweep = null } = {}) {
    if (!ensure()) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, now() + when); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now() + when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now() + when); g.gain.exponentialRampToValueAtTime(0.0001, now() + when + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(now() + when, Math.random()); s.stop(now() + when + dur + 0.05);
  }
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('tf.muted', muted ? '1' : '0'); } catch (e) { } if (ctx) master.gain.value = muted ? 0 : 0.55; if (!muted) ensure(); return muted; },
    unlock() { ensure(); },
    clank(v = 1) { const b = 500 + Math.random() * 300; for (const [k, a] of [[1, 0.16], [2.63, 0.09], [4.1, 0.06], [5.9, 0.04]]) tone(b * k, 0.25 + 0.3 / k, { gain: a * v, type: 'sine' }); noise(0.03, { gain: 0.12 * v, type: 'highpass', freq: 3000 }); },
    thunk() { tone(150, 0.14, { type: 'triangle', gain: 0.3, slide: 90 }); noise(0.05, { gain: 0.12, type: 'bandpass', freq: 900, q: 1.5 }); },
    click() { tone(1800, 0.04, { gain: 0.06, type: 'square' }); },
    snap() { noise(0.12, { gain: 0.45, type: 'highpass', freq: 1800 }); tone(2400, 0.3, { gain: 0.1 }); tone(3900, 0.2, { gain: 0.06 }); },
    crack() { noise(0.09, { gain: 0.5, type: 'bandpass', freq: 1600, q: 0.8 }); tone(110, 0.2, { type: 'triangle', gain: 0.3, slide: 60 }); },
    thud(mass) { const k = Math.min(1, mass / 800); tone(120 - k * 60, 0.3 + k * 0.4, { type: 'sine', gain: 0.35 + k * 0.4, slide: 40 }); noise(0.15 + k * 0.3, { gain: 0.2 + k * 0.3, freq: 500 - k * 300 }); },
    crash() { noise(1.8, { gain: 0.5, freq: 3500, sweep: 200 }); for (let i = 0; i < 7; i++) { const b = 400 + Math.random() * 600, w = Math.random() * 1.2; tone(b, 0.5, { gain: 0.08, when: w }); tone(b * 2.7, 0.3, { gain: 0.04, when: w }); } },
    fanfare() { [523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.35, { type: 'triangle', gain: 0.22, when: i * 0.11 }); tone(f * 2, 0.2, { type: 'sine', gain: 0.05, when: i * 0.11 }); }); tone(1046, 0.9, { type: 'triangle', gain: 0.18, when: 0.45 }); tone(1318, 0.9, { type: 'triangle', gain: 0.12, when: 0.45 }); },
    wah() { [[311, 0], [293, 0.32], [277, 0.64], [262, 0.96]].forEach(([f, w], i) => tone(f, i === 3 ? 1.1 : 0.34, { type: 'sawtooth', gain: 0.1, when: w, slide: i === 3 ? 180 : null, attack: 0.03 })); },
    harp() { [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 1.2, { type: 'sine', gain: 0.11, when: i * 0.07 })); tone(262, 2, { type: 'triangle', gain: 0.06, when: 0.1 }); },
    nag() { const b = 330 + Math.random() * 90; for (let i = 0; i < 3; i++) tone(b * (1 + i * 0.12), 0.11, { type: 'sawtooth', gain: 0.05, when: i * 0.12, slide: b * 0.8, attack: 0.01 }); },
    glass() { noise(0.25, { gain: 0.35, type: 'highpass', freq: 4000 }); for (let i = 0; i < 6; i++) tone(2500 + Math.random() * 3000, 0.25, { gain: 0.05, when: Math.random() * 0.2 }); },
    splat() { noise(0.2, { gain: 0.5, freq: 700 }); tone(90, 0.25, { type: 'sine', gain: 0.4, slide: 40 }); tone(420, 0.12, { type: 'square', gain: 0.05, slide: 150, when: 0.05 }); },
    siren() { for (let i = 0; i < 6; i++) { tone(960, 0.42, { type: 'triangle', gain: 0.07, when: i * 0.9, attack: 0.05 }); tone(720, 0.42, { type: 'triangle', gain: 0.07, when: i * 0.9 + 0.45, attack: 0.05 }); } },
    spray() { noise(1.4, { gain: 0.12, type: 'highpass', freq: 5000 }); },
    wind(level) { if (!ctx || !windGain) return; windGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.35, level / 200), now(), 0.3); },
  };
})();

// ---------------------------------------------------------------------------
//  Screen-space labels
// ---------------------------------------------------------------------------
const labelsEl = document.getElementById('labels');
const labels = [];
function addLabel(cls, html, x, y, z, group = 'design') {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.innerHTML = html;
  labelsEl.appendChild(el);
  const l = { el, pos: new THREE.Vector3(x, y, z), group, visible: true };
  labels.push(l);
  return l;
}
function clearLabels(group) {
  for (let i = labels.length - 1; i >= 0; i--) if (!group || labels[i].group === group) { labels[i].el.remove(); labels.splice(i, 1); }
}
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const l of labels) {
    if (!l.visible) { l.el.style.display = 'none'; continue; }
    _v.copy(l.pos); root.localToWorld(_v); _v.project(camera);
    if (_v.z > 1) { l.el.style.display = 'none'; continue; }
    l.el.style.display = '';
    l.el.style.left = ((_v.x + 1) / 2 * w).toFixed(1) + 'px';
    l.el.style.top = ((1 - _v.y) / 2 * h).toFixed(1) + 'px';
  }
}
const tipLabel = addLabel('tip', '', 0, 0, 0, 'tip');
tipLabel.visible = false;

// ---------------------------------------------------------------------------
//  Design overlays
// ---------------------------------------------------------------------------
const overlay = new THREE.Group();
root.add(overlay);
const dotTex = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill(); });
const hatchTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(215,49,42,.35)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(215,49,42,.9)'; g.lineWidth = 7; for (let i = -w; i < w * 2; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } });
const zoneTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = 'rgba(46,158,79,.45)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(160,255,190,.7)'; g.lineWidth = 3; for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } });
const hoverRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf3d40b, depthTest: false, transparent: true }));
hoverRing.renderOrder = 10; root.add(hoverRing); hoverRing.visible = false;
const startRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff6a13, depthTest: false, transparent: true }));
startRing.renderOrder = 10; root.add(startRing); startRing.visible = false;
const previewMat = new THREE.MeshBasicMaterial({ color: 0x5cff8a, transparent: true, opacity: 0.55, depthWrite: false });
const previewTube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), previewMat);
previewTube.renderOrder = 9; root.add(previewTube); previewTube.visible = false;
const previewBoard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, Z_OUT - Z_IN + 0.1), previewMat);
previewBoard.renderOrder = 9; root.add(previewBoard); previewBoard.visible = false;
const flyTube = new THREE.Mesh(tubeGeo, M.steel); flyTube.castShadow = true; root.add(flyTube); flyTube.visible = false;
const flyTube2 = new THREE.Mesh(tubeGeo, M.steel); flyTube2.castShadow = true; root.add(flyTube2); flyTube2.visible = false;
const flyBoard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, Z_OUT - Z_IN + 0.1), M.wood); flyBoard.castShadow = true; root.add(flyBoard); flyBoard.visible = false;

function buildOverlay(L) {
  overlay.clear();
  // grid lines and dots
  const pts = [], basePts = [], lines = [];
  for (let x = 0; x <= L.W; x++) {
    const g0 = L.groundCol(x);
    for (let y = g0; y <= L.H; y++) {
      if (L.inForbidden(x, y)) continue;
      (y === g0 && L.canBase(x) ? basePts : pts).push(x, y, Z_OUT + 0.005);
    }
    lines.push(x, g0, Z_OUT, x, L.H, Z_OUT);
  }
  for (let y = Math.min(...Array.from({ length: L.W + 1 }, (_, i) => L.groundCol(i))); y <= L.H; y++) {
    let a = null;
    for (let x = 0; x <= L.W + 1; x++) {
      const ok = x <= L.W && y >= L.groundCol(x);
      if (ok && a === null) a = x;
      if (!ok && a !== null) { if (x - 1 > a) lines.push(a, y, Z_OUT, x - 1, y, Z_OUT); a = null; }
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  overlay.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })));
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  overlay.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.34, map: dotTex, transparent: true, alphaTest: 0.3, color: 0xffffff, depthWrite: false })));
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(basePts, 3));
  overlay.add(new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.55, map: dotTex, transparent: true, alphaTest: 0.3, color: 0xff7a26, depthWrite: false })));
  // zones
  clearLabels('design');
  for (const z of L.zones) {
    const t = zoneTex.clone(); t.needsUpdate = true; t.repeat.set((z.x1 - z.x0) * 2, 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(z.x1 - z.x0, 0.04, Z_OUT - Z_IN), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.position.set((z.x0 + z.x1) / 2, z.y + 0.13, Z_MID);
    overlay.add(m);
    z._label = addLabel('zone', `Platform · ${z.label}`, (z.x0 + z.x1) / 2, z.y - 0.35, Z_OUT + 0.2);
  }
  L.deliveries.forEach((d, i) => {
    const z = L.zones[d.zone];
    const it = ITEMS[d.item];
    addLabel('drop', `${it.name} <b>${it.mass >= 1000 ? (it.mass / 1000) + ' t' : it.mass + ' kg'}</b>`, d.x, z.y + 0.9 + (i % 2) * 0.5, Z_MID);
    const mk = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.02, Z_OUT - Z_IN - 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    mk.position.set(d.x, z.y + 0.16, Z_MID); overlay.add(mk);
  });
  for (const f of L.forbidden) {
    const t = hatchTex.clone(); t.needsUpdate = true; t.repeat.set(f.x1 - f.x0, f.y1 - f.y0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(f.x1 - f.x0 - 0.08, f.y1 - f.y0 - 0.08, Z_OUT - Z_IN), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.8 }));
    m.position.set((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, Z_MID);
    overlay.add(m);
    addLabel('keep', f.kind === 'porch' ? 'Porch · keep clear' : 'Doorway · keep clear', (f.x0 + f.x1) / 2, f.y1 - 0.4, Z_OUT);
  }
  for (const [a, b] of L.noBase) {
    const t = hatchTex.clone(); t.needsUpdate = true; t.repeat.set((b - a + 0.9) * 2, 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a + 0.9, Z_OUT - Z_IN + 0.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, L.groundCol(a) + 0.2, Z_MID); overlay.add(m);
    addLabel('keep', 'No base plates', (a + b) / 2, L.groundCol(a) + 0.5, Z_OUT + 0.3);
  }
  // tie points on the wall (shown when the tie tool is active)
  const tp = [];
  for (let x = 0; x <= L.W; x++) for (let y = 0; y <= L.H; y++) if (L.canTie(x, y)) tp.push(x, y, 0.06);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tiePoints = new THREE.Points(tg, new THREE.PointsMaterial({ size: 0.16, map: dotTex, transparent: true, alphaTest: 0.3, color: 0x7fd6ff, depthWrite: false }));
  tiePoints.visible = false;
  overlay.add(tiePoints);
}
let tiePoints = null;

// ---------------------------------------------------------------------------
//  Game state
// ---------------------------------------------------------------------------
const S = {
  mode: 'title', li: 0, L: null, pieces: [], undo: [], tool: 'tube',
  chain: null, drag: null, paint: null, hover: null,
  designSim: null, trial: null, speed: 2, acc: 0, logI: 0, evI: 0, zoff: [],
  showOrder: false, stress: true, resultT: 0, lastIdx: -1, shake: 0, shakeOff: new THREE.Vector3(),
  camGoal: null, itemMeshes: new Map(), t: 0, titleSim: null,
};
const save = (() => {
  let d = { stars: {}, best: {}, designs: {} };
  try { const raw = localStorage.getItem('tf.save.v1'); if (raw) d = Object.assign(d, JSON.parse(raw)); } catch (e) { }
  return {
    d,
    write() { try { localStorage.setItem('tf.save.v1', JSON.stringify(d)); } catch (e) { } },
  };
})();
const unlocked = (i) => i === 0 || (save.d.stars[LEVELS[i - 1].id] || 0) > 0 || (save.d.stars[LEVELS[i].id] || 0) > 0;

const $ = (id) => document.getElementById(id);
const fmt = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const kg = (m) => m >= 1000 ? (m / 1000).toFixed(m % 1000 ? 1 : 0) + ' t' : m + ' kg';

// ---------------------------------------------------------------------------
//  Tools
// ---------------------------------------------------------------------------
const ICON = {
  tube: '<svg viewBox="0 0 34 34"><rect x="4" y="15" width="26" height="4" rx="2" fill="#bfc7cd"/><rect x="4" y="15" width="26" height="1.5" rx=".75" fill="#fff" opacity=".6"/></svg>',
  heavy: '<svg viewBox="0 0 34 34"><rect x="3" y="13.5" width="28" height="7" rx="3.5" fill="#f0b90b"/><rect x="3" y="14" width="28" height="2" rx="1" fill="#fff" opacity=".45"/></svg>',
  board: '<svg viewBox="0 0 34 34"><rect x="3" y="12" width="28" height="10" rx="1" fill="#c99a58"/><path d="M3 15h28M3 18.5h28" stroke="#8a6230" stroke-width=".8"/><rect x="3" y="12" width="3" height="10" fill="#b8bec3"/><rect x="28" y="12" width="3" height="10" fill="#b8bec3"/></svg>',
  deck: '<svg viewBox="0 0 34 34"><rect x="3" y="12" width="28" height="10" rx="1" fill="#8e969d"/><g fill="#5c646b"><circle cx="9" cy="17" r="1.4"/><circle cx="14" cy="17" r="1.4"/><circle cx="19" cy="17" r="1.4"/><circle cx="24" cy="17" r="1.4"/></g><rect x="3" y="12" width="2.5" height="10" fill="#f3d40b"/><rect x="28.5" y="12" width="2.5" height="10" fill="#f3d40b"/></svg>',
  tie: '<svg viewBox="0 0 34 34"><rect x="3" y="5" width="7" height="24" fill="#a4472e"/><path d="M3 11h7M3 17h7M3 23h7" stroke="#d8c7b0" stroke-width=".8"/><rect x="10" y="15" width="20" height="4" rx="2" fill="#bfc7cd"/><circle cx="11" cy="17" r="3" fill="none" stroke="#7fd6ff" stroke-width="2"/></svg>',
  erase: '<svg viewBox="0 0 34 34" fill="none" stroke="#ff8a7a" stroke-width="3" stroke-linecap="round"><path d="M10 10l14 14M24 10L10 24"/></svg>',
  ladder: '<svg viewBox="0 0 34 34" fill="none" stroke="#dfe4e8" stroke-width="2.4" stroke-linecap="round"><path d="M11 3v28M23 3v28M11 8h12M11 14h12M11 20h12M11 26h12"/></svg>',
  lock: '<svg viewBox="0 0 34 34"><path d="M11 3v28M23 3v28" stroke="#dfe4e8" stroke-width="2.4" stroke-linecap="round"/><rect x="8" y="15" width="18" height="15" rx="1.5" fill="#f3d40b"/><path d="M8 20l6-5M8 27l12-12M14 30l12-10" stroke="#161b21" stroke-width="2"/><rect x="21" y="9" width="7" height="6" rx="1" fill="#d4a843"/><path d="M22.5 9V7a2 2 0 0 1 4 0v2" stroke="#d4a843" stroke-width="1.6" fill="none"/></svg>',
  trap: '<svg viewBox="0 0 34 34"><rect x="3" y="12" width="28" height="10" rx="1" fill="#c99a58"/><path d="M3 15h28M3 18.5h28" stroke="#8a6230" stroke-width=".8"/><path d="M15 12l3 4-3 2 4 4" stroke="#d7312a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  protect: '<svg viewBox="0 0 34 34"><rect x="6" y="5" width="22" height="24" fill="#2a3440" stroke="#f6f5f0" stroke-width="2"/><rect x="4" y="8" width="26" height="18" rx="1" fill="#d9b27a" transform="rotate(-8 17 17)"/><g fill="#6b4e2e"><circle cx="8" cy="12" r="1.2"/><circle cx="27" cy="9" r="1.2"/><circle cx="8" cy="26" r="1.2"/><circle cx="28" cy="23" r="1.2"/></g></svg>',
  order: '<svg viewBox="0 0 34 34"><circle cx="9" cy="9" r="6" fill="#161b21" stroke="#fff" stroke-width="1.2"/><text x="9" y="12.2" font-size="9" text-anchor="middle" fill="#f3d40b" font-family="Arial" font-weight="700">1</text><circle cx="25" cy="25" r="6" fill="#161b21" stroke="#fff" stroke-width="1.2"/><text x="25" y="28.2" font-size="9" text-anchor="middle" fill="#f3d40b" font-family="Arial" font-weight="700">2</text><path d="M13 13l8 8" stroke="#f3d40b" stroke-width="2.2" stroke-linecap="round"/><path d="M21 16v5h-5" stroke="#f3d40b" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
};
const TOOLS = [
  { id: 'tube', name: 'Tube', price: `£${MATS.tube.cost}/m`, key: '1' },
  { id: 'heavy', name: 'Heavy tube', price: `£${MATS.heavy.cost}/m`, key: '2', req: 'heavy' },
  { id: 'board', name: 'Boards', price: `£${BOARDS.board.cost}/m · ${BOARDS.board.cap} kg`, key: '3' },
  { id: 'deck', name: 'Steel deck', price: `£${BOARDS.deck.cost}/m · ${BOARDS.deck.cap} kg`, key: '4', req: 'deck' },
  { id: 'ladder', name: 'Ladder', price: `£${LADDER.cost}/m · up to ${LADDER.maxLen} m`, key: '5' },
  { id: 'lock', name: 'Ladder lock', price: `£${LOCK.cost} · keeps chavs off`, key: '6', req: 'chavs' },
  { id: 'trap', name: 'Trap board', price: `£${BOARDS.trap.cost}/m · gives way under anyone`, key: 't', req: 'chavs' },
  { id: 'protect', name: 'Board up', price: `£${BOARDUP.cost} a window · glazier £${GLAZIER}`, key: '0' },
  { id: 'tie', name: 'Wall tie', price: `£${TIE.cost} each`, key: '7' },
  { id: 'order', name: 'Build order', price: 'Click pieces in order', key: '8' },
  { id: 'erase', name: 'Remove', price: 'Full refund', key: '9' },
];
function renderTools() {
  const L = S.L;
  const el = $('tools');
  el.innerHTML = TOOLS.map(t => {
    const dis = (t.req && !L[t.req]) || (t.id === 'tie' && L.maxTies === 0);
    const price = dis ? (t.id === 'tie' ? 'Not allowed here' : t.id === 'lock' ? 'No chavs on this job' : 'Later jobs') : t.price;
    return `<button class="tool${S.tool === t.id ? ' on' : ''}" data-tool="${t.id}" ${dis ? 'disabled' : ''} id="tool-${t.id}">${ICON[t.id]}<span class="tn">${t.name}<kbd>${t.key}</kbd></span><span class="tp">${price}</span></button>`;
  }).join('') + `<hr><div class="mini"><button id="undoBtn" title="Undo (Ctrl+Z)">Undo</button><button id="clearBtn" title="Remove everything">Clear</button></div><div class="mini"><button id="orderBtn" class="${S.showOrder ? 'on' : ''}" title="List the order the crew puts pieces up, and change it">Order list</button></div>`;
  el.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => { if (!b.disabled) setTool(b.dataset.tool); }));
  $('undoBtn').onclick = undo;
  $('clearBtn').onclick = () => {
    if (!S.pieces.length) return;
    if ($('clearBtn').dataset.arm === '1') { pushUndo(); S.pieces = []; afterEdit(); $('clearBtn').textContent = 'Clear'; $('clearBtn').dataset.arm = ''; }
    else { $('clearBtn').textContent = 'Sure?'; $('clearBtn').dataset.arm = '1'; setTimeout(() => { const b = $('clearBtn'); if (b) { b.textContent = 'Clear'; b.dataset.arm = ''; } }, 2200); }
  };
  $('orderBtn').onclick = () => { S.showOrder = !S.showOrder; $('orderBtn').classList.toggle('on', S.showOrder); refreshOrderLabels(); renderOrderPanel(); };
}
// ---- build order editing ----
function countInvalid(ps) { let n = 0; for (let i = 0; i < ps.length; i++) if (validatePlacement(S.L, ps.slice(0, i), ps[i])) n++; return n; }
// Move piece `from` to index `to`, stepping back towards `from` until the order is legal. Returns the new index or -1.
function movePiece(from, to) {
  to = Math.max(0, Math.min(S.pieces.length - 1, to));
  if (to === from) return from;
  const base = countInvalid(S.pieces);
  const dir = Math.sign(from - to);
  for (let k = to; k !== from; k += dir) {
    const ps = S.pieces.slice(); const [p] = ps.splice(from, 1); ps.splice(k, 0, p);
    if (countInvalid(ps) <= base) { pushUndo(); S.pieces = ps; afterEdit(); return k; }
  }
  return -1;
}
function whyNotAt(i, to) {
  const ps = S.pieces.slice(); const [p] = ps.splice(i, 1);
  return validatePlacement(S.L, ps.slice(0, to), p) || 'something else needs it first';
}
const TERRY = [
  "Two lengths of tube and a plank. Don't overthink it.",
  "Client's paying for the platform, not the view. Keep it lean.",
  "A pallet of bricks is just bricks. Don't go buying fancy boards.",
  "The vicar wants his door. I want my margin. We can both be happy.",
  "Nobody's ever died from a rose bush. Well. Stay off it anyway.",
  "Bit breezy. That's what ties are for. Well, some ties.",
  "Can't drill the wall? Then don't. Still cheaper than the fine.",
  "Hole in the ground? Longer tubes. Same price, mind.",
  "Baths are heavy. Terry's budget is not.",
  "Pianos. Up. Cheap. In that order.",
  "It's windy up there. That's the chimney's problem, not mine.",
  "An elephant? On a scaffold? As long as it doesn't fall down, it's fine.",
];
function windowAt(pt) {
  const ws = S.L.house.windows || [];
  return ws.findIndex(w => pt.x > w.x - 0.25 && pt.x < w.x + w.w + 0.25 && pt.y > w.y - 0.25 && pt.y < w.y + w.h + 0.25);
}
const PNAME = { trap: 'Trap board', protect: 'Window board', tube: 'Tube', heavy: 'Heavy tube', board: 'Boards', deck: 'Steel deck', tie: 'Wall tie', ladder: 'Ladder', lock: 'Ladder lock' };
function pieceDesc(p) {
  if (p.type === 'tube' || p.type === 'heavy') {
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1];
    const kind = dx === 0 ? 'upright' : dy === 0 ? 'ledger' : 'brace';
    return `${PNAME[p.type]} · ${kind} ${Math.hypot(dx, dy).toFixed(1)} m`;
  }
  if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') return `${PNAME[p.type]} at ${p.a[1]} m`;
  if (p.type === 'ladder') return `Ladder ${p.a[1]}→${p.b[1]} m`;
  return PNAME[p.type];
}
function renderOrderPanel() {
  const el = $('orderPanel');
  const on = S.showOrder && S.mode === 'design';
  el.hidden = !on;
  if (!on) return;
  el.innerHTML = `<div class="oh"><span>Build order</span><span class="od">Drag, or use the arrows. First at the top.</span></div><ol id="orderList">${S.pieces.map((p, i) => `<li draggable="true" data-i="${i}"><span class="oi num">${i + 1}</span><span class="on">${pieceDesc(p)}</span><button data-up="${i}" aria-label="Earlier">▲</button><button data-dn="${i}" aria-label="Later">▼</button></li>`).join('')}</ol>`;
  const list = $('orderList');
  let dragI = -1;
  list.querySelectorAll('li').forEach(li => {
    const i = +li.dataset.i;
    li.addEventListener('mouseenter', () => { S.hiList = i; });
    li.addEventListener('mouseleave', () => { if (S.hiList === i) S.hiList = -1; });
    li.addEventListener('dragstart', (e) => { dragI = i; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (err) { } });
    li.addEventListener('dragend', () => li.classList.remove('drag'));
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
    li.addEventListener('dragleave', () => li.classList.remove('over'));
    li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('over'); if (dragI >= 0) reorder(dragI, i); dragI = -1; });
  });
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.up !== undefined) reorder(+b.dataset.up, +b.dataset.up - 1);
    else reorder(+b.dataset.dn, +b.dataset.dn + 1);
  }));
}
function reorder(from, to) {
  const k = movePiece(from, to);
  if (k < 0) { toast(`Can't go there yet: ${whyNotAt(from, to).toLowerCase()}`); return -1; }
  if (k !== to) toast(`Moved as far as it can go (#${k + 1})`);
  sfx.click();
  return k;
}
function setTool(id) {
  S.tool = id; S.chain = null; S.drag = null; S.paint = null;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  if (tiePoints) tiePoints.visible = id === 'tie';
  S.seq = 0;
  if (id === 'order' && !S.showOrder) { S.showOrder = true; const ob = $('orderBtn'); if (ob) ob.classList.add('on'); renderOrderPanel(); }
  refreshOrderLabels();
  sfx.click();
  updateHelp();
}
function updateHelp() {
  const h = {
    tube: '<b>Click</b> a dot, then another, to place one tube. <b>Hold and drag</b> through dots to lay a chain of tubes. Orange dots take base plates.',
    heavy: 'Heavy tube: stiffer and much stronger. Place it like a normal tube.',
    board: '<b>Click or drag</b> along a horizontal tube to lay boards. Timber holds 360 kg at mid-span.',
    deck: '<b>Click or drag</b> along a horizontal tube to lay steel deck. Holds 1500 kg.',
    tie: '<b>Click</b> a joint next to solid wall (blue dots) to tie it in. Ties stop sway but carry no weight.',
    ladder: '<b>Click</b> the foot (ground or a boarded platform), then the top. The top must land on boards. Dave only climbs ladders.',
    trap: `<b>Click or drag</b> along a tube to lay a fake board. It looks real but gives way under anyone. A chav who drops ${SAFE_FALL} m or less lies there dazed and the police pay ${fmt(TRAP_REWARD)} for them. Any higher and you get sued. Dave avoids trap boards if there's another way up.`,
    protect: `<b>Click</b> a window to screw plywood over it (£${BOARDUP.cost}). Dumping ${WINDOW_BREAK_KG} kg or more in front of a window puts a brick through it (£${GLAZIER} glazier). Windows marked ⚠ are in the firing line.`,
    lock: '<b>Click</b> any ladder to lock it. Chavs can\'t climb locked ladders, and Dave has the key.',
    order: '<b>Click pieces in the order you want them put up</b>, starting from #1. Anything you don\'t click keeps its place after. Use the order list to fine-tune.',
    erase: '<b>Click</b> a tube, board, ladder, lock or tie to remove it.',
  }[S.tool];
  $('help').innerHTML = h + '<br><b>Drag empty space</b> to pan · <b>right-drag</b> to orbit · <b>wheel</b> to zoom · <b>Ctrl+Z</b> undo';
}

function pushUndo() { S.undo.push(JSON.stringify(S.pieces)); if (S.undo.length > 200) S.undo.shift(); }
function undo() { if (!S.undo.length) return; S.pieces = JSON.parse(S.undo.pop()); S.chain = null; afterEdit(); sfx.click(); }
function cleanPieces(ps) { return ps.map(p => ({ type: p.type, a: [...p.a], ...(p.b ? { b: [...p.b] } : {}) })); }

function afterEdit() {
  const L = S.L;
  S.pieces = cleanPieces(S.pieces);
  // drop boards/ties that lost their support
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < S.pieces.length; i++) {
      const p = S.pieces[i];
      if (p.type === 'tube' || p.type === 'heavy') continue;
      const others = S.pieces.filter((_, j) => j !== i);
      if (validatePlacement(L, others, p)) { S.pieces.splice(i, 1); changed = true; break; }
    }
  }
  S.designSim = new Sim(L);
  for (const p of S.pieces) S.designSim.addPiece({ ...p });
  save.d.designs[L.id] = S.pieces;
  save.write();
  syncBoardUps(L, S.pieces);
  refreshRiskLabels();
  refreshDocket();
  refreshOrderLabels();
  renderOrderPanel();
}
function refreshRiskLabels() {
  clearLabels('risk');
  if (S.mode !== 'design') return;
  const prot = new Set(S.pieces.filter(p => p.type === 'protect').map(p => p.a[0]));
  for (const i of S.risk || []) {
    if (prot.has(i)) continue;
    const w = S.L.house.windows[i];
    addLabel('risk', `⚠ Glass at risk · £${GLAZIER}`, w.x + w.w / 2, w.y + w.h / 2, 0.2, 'risk');
  }
}
function refreshOrderLabels() {
  clearLabels('order');
  if (!(S.showOrder || S.tool === 'order') || S.mode !== 'design') return;
  S.pieces.forEach((p, i) => {
    let x, y;
    if (p.type === 'ladder') { x = p.a[0] + LAD_OFF; y = (p.a[1] + p.b[1]) / 2; }
    else if (p.type === 'lock') { x = p.a[0] + LAD_OFF; y = p.a[1] + 0.6; }
    else if (p.type === 'protect') { const w = S.L.house.windows[p.a[0]]; x = w.x + w.w / 2; y = w.y + w.h / 2; }
    else if (p.b) { x = (p.a[0] + p.b[0]) / 2; y = (p.a[1] + p.b[1]) / 2 + (p.type === 'board' || p.type === 'deck' || p.type === 'trap' ? 0.25 : 0); }
    else { x = p.a[0] + 0.25; y = p.a[1] - 0.25; }
    const l = addLabel('order' + (S.tool === 'order' && i < S.seq ? ' done' : ''), String(i + 1), x, y, Z_OUT + 0.1, 'order');
    l.idx = i;
  });
}

function refreshDocket() {
  const L = S.L;
  const cost = designCost(L, S.pieces);
  const req = checkRequirements(L, S.pieces);
  const groundLadders = S.pieces.filter(p => p.type === 'ladder' && p.a[1] === L.groundCol(p.a[0]));
  const locks = S.pieces.filter(p => p.type === 'lock').length;
  const ties = S.pieces.filter(p => p.type === 'tie').length;
  $('spent').textContent = fmt(cost);
  $('budget').textContent = 'of ' + fmt(L.budget) + ' quote';
  $('profit').textContent = cost <= L.budget ? `Profit ${fmt(L.budget - cost)}` : `Loss ${fmt(cost - L.budget)}`;
  $('profit').classList.toggle('neg', cost > L.budget);
  const f = $('barFill');
  const frac = cost / L.budget;
  f.style.width = Math.min(100, frac * 100) + '%';
  f.style.background = frac > 1 ? 'var(--danger)' : frac > 0.85 ? 'var(--hivis-yellow)' : 'var(--safe)';
  $('tieCount').textContent = L.maxTies === 0 ? 'No ties allowed' : L.maxTies < 99 ? `Ties ${ties} / ${L.maxTies}` : `Ties ${ties}`;
  const z = req.zones[0];
  const items = [];
  L.zones.forEach((zz, i) => {
    const r = req.zones[i];
    items.push([r.boarded, `Platform boarded: ${r.covered} of ${r.need} m`]);
    items.push([r.reachable, r.reachable ? 'Dave has a ladder up to it' : 'Dave needs ladders up to the platform']);
    if (zz._label) zz._label.el.classList.toggle('done', r.boarded);
  });
  for (const h of req.heavy || []) items.push([false, `Dave + ${ITEMS[h.item].name.toLowerCase()} = ${h.carry} kg: he'd carry it across boards and snap them. Put his ladder within 1 m of the drop at ${h.x} m`]);
  const unlocked = groundLadders.length - Math.min(locks, groundLadders.length);
  const traps = S.pieces.filter(p => p.type === 'trap').length;
  if (L.chavs) items.push(['info', unlocked ? `${unlocked} ladder${unlocked > 1 ? 's' : ''} unlocked: chavs can get up${traps ? ` · ${traps} trap board${traps > 1 ? 's' : ''} waiting` : ''}` : 'Ladders locked: chavs stay on the ground']);
  const unprot = [...(S.risk || [])].filter(i => !S.pieces.some(p => p.type === 'protect' && p.a[0] === i)).length;
  if (S.risk && S.risk.size) items.push([unprot === 0, unprot === 0 ? 'Windows in the firing line boarded' : `${unprot} window${unprot > 1 ? 's' : ''} at risk: £${GLAZIER} each if smashed`]);
  items.push([frac <= 1, frac <= 1 ? `Under the quote by ${fmt(L.budget - cost)}` : `Over the quote by ${fmt(cost - L.budget)}`]);
  $('checks').innerHTML = items.map(([ok, t]) => `<li class="${ok === 'info' ? 'info' : ok ? 'ok' : ''}">${t}</li>`).join('');
  const b = $('buildBtn');
  b.disabled = !S.pieces.length;
  b.textContent = req.ok ? 'Build it' : 'Build anyway';
  b.title = req.ok ? 'Put it up and load it' : "The platform or Dave's ladder isn't finished, so you can't get paid. The chavs will still come.";
  S.req = req;
}

// ---------------------------------------------------------------------------
//  Picking
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_OUT);
const _ndc = new THREE.Vector2();
function pickLocal(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  _ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
  return { x: hit.x - root.position.x, y: hit.y };
}
function nearestNode(pt, radius = 0.45) {
  const L = S.L;
  const gx = Math.round(pt.x), gy = Math.round(pt.y);
  if (gx < 0 || gx > L.W || gy > L.H || gy < L.groundCol(gx)) return null;
  if (Math.hypot(pt.x - gx, pt.y - gy) > radius) return null;
  return [gx, gy];
}
function isStartable(n) {
  const L = S.L;
  const key = n.join(',');
  if (S.designSim && S.designSim.nodeMap.has(key)) return true;
  return n[1] === L.groundCol(n[0]) && L.canBase(n[0]);
}
function tubeTarget(start, pt) {
  const L = S.L;
  let best = null, bd = Infinity;
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    if (!dx && !dy) continue;
    if (Math.hypot(dx, dy) > MAX_LEN + 1e-6) continue;
    const x = start[0] + dx, y = start[1] + dy;
    if (x < 0 || x > L.W || y > L.H || y < L.groundCol(x)) continue;
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function pieceAt(pt) {
  let best = -1, bd = 0.3;
  S.pieces.forEach((p, i) => {
    let d;
    if (p.type === 'tie') d = Math.hypot(pt.x - p.a[0], pt.y - p.a[1]) - 0.12;
    else if (p.type === 'protect') { const w = S.L.house.windows[p.a[0]]; d = w ? Math.hypot(pt.x - w.x - w.w / 2, pt.y - w.y - w.h / 2) - 0.45 : 9; }
    else if (p.type === 'lock') d = Math.hypot(pt.x - p.a[0] - LAD_OFF, pt.y - p.a[1] - 0.75) - 0.35;
    else if (p.type === 'ladder') d = segDist(pt.x, pt.y, p.a[0] + LAD_OFF, p.a[1], p.b[0] + LAD_OFF, p.b[1] + 1) - 0.1;
    else if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') d = segDist(pt.x, pt.y, p.a[0] + 0.1, p.a[1] + 0.14, p.b[0] - 0.1, p.b[1] + 0.14) - 0.05;
    else d = segDist(pt.x, pt.y, p.a[0], p.a[1], p.b[0], p.b[1]);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function ladderFootOk(n) {
  const L = S.L;
  if (n[1] === L.groundCol(n[0])) return true;
  return S.designSim && S.designSim.nodeMap.has(n.join(','));
}
function ladderTarget(foot, pt) {
  const y = Math.max(foot[1] + 1, Math.min(foot[1] + LADDER.maxLen, Math.round(pt.y)));
  return [foot[0], Math.min(S.L.H, y)];
}
function ladderAt(pt) {
  let best = null, bd = 0.7;
  for (const p of S.pieces) if (p.type === 'ladder') {
    const d = segDist(pt.x, pt.y, p.a[0] + LAD_OFF, p.a[1], p.b[0] + LAD_OFF, p.b[1]);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function boardSegAt(pt) {
  const gy = Math.round(pt.y);
  if (Math.abs(pt.y - gy) > 0.5) return null;
  const x0 = Math.floor(pt.x);
  if (x0 < 0 || x0 >= S.L.W) return null;
  return { type: S.tool, a: [x0, gy], b: [x0 + 1, gy] };
}

function tryPlace(p) {
  const err = validatePlacement(S.L, S.pieces, p);
  if (err) { toast(err); sfx.click(); return false; }
  pushUndo();
  S.pieces.push(p);
  afterEdit();
  if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') sfx.thunk(); else sfx.clank(0.7);
  return true;
}
let toastT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}

// pointer input
const cvs = renderer.domElement;
let downInfo = null;
const touchesDown = new Set();
// a second finger means the camera gesture (orbit/zoom) takes over: drop any one-finger pan
function secondFinger() {
  if (!downInfo) return;
  downInfo.canPan = false; downInfo.panned = true;
  S.drag = null; S.dragEnd = null; S.paint = null;
}
const forgetTouch = (ev) => { if (ev.pointerType === 'touch') touchesDown.delete(ev.pointerId); };
window.addEventListener('pointercancel', (ev) => { forgetTouch(ev); if (!touchesDown.size) { S.drag = null; S.dragEnd = null; S.paint = null; downInfo = null; } });
cvs.addEventListener('pointerdown', (ev) => {
  sfx.unlock();
  if (ev.pointerType === 'touch') { touchesDown.add(ev.pointerId); if (touchesDown.size > 1) { secondFinger(); return; } }
  // watching a job: a one-finger (or left-button) drag just moves the view
  if (S.mode === 'test') {
    if (ev.button === 0) downInfo = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, canPan: true, viewOnly: true };
    return;
  }
  if (S.mode !== 'design') return;
  if (ev.button === 2) { downInfo = { x: ev.clientX, y: ev.clientY, right: true }; return; }
  if (ev.button !== 0) return;
  const pt = pickLocal(ev);
  downInfo = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, mouse: ev.pointerType === 'mouse' };
  if (!pt) { downInfo.canPan = true; return; }
  if (S.tool === 'tube' || S.tool === 'heavy') {
    if (!S.chain) {
      const n = nearestNode(pt);
      if (n && isStartable(n)) { S.drag = n; S.dragEnd = null; }
      else if (n) downInfo.hint = 'Start from the ground (orange dots) or an existing joint';
    }
  } else if (S.tool === 'ladder') {
    if (!S.chain) {
      const n = nearestNode({ x: pt.x - LAD_OFF * 0.5, y: pt.y }, 0.6);
      if (n && ladderFootOk(n)) S.drag = n;
      else if (n) downInfo.hint = 'Stand ladders on the ground or on a boarded platform';
    }
  } else if (S.tool === 'board' || S.tool === 'deck' || S.tool === 'trap') {
    const seg = boardSegAt(pt);
    S.paint = { y: seg ? seg.a[1] : null, done: new Set() };
    if (seg) { S.paint.done.add(seg.a[0]); tryPlace(seg); }
  }
  // a press (mouse or finger) that didn't grab anything drags the view instead
  downInfo.canPan = !S.drag && !(S.paint && S.paint.y !== null);
});
function panByPixels(dx, dy) {
  S.camGoal = null;
  const dist = camera.position.distanceTo(controls.target);
  const k = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / window.innerHeight;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  const mv = right.multiplyScalar(-dx * k).addScaledVector(up, dy * k);
  const t2 = controls.target.clone().add(mv);
  t2.x = Math.max(-14, Math.min(14, t2.x)); t2.y = Math.max(0, Math.min(14, t2.y));
  mv.subVectors(t2, controls.target);
  controls.target.add(mv); camera.position.add(mv);
}
const sameDir = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1]; return ux * vy - uy * vx === 0 && ux * vx + uy * vy > 0; };
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// Holding and dragging lays a chain of tubes: one tube per straight run.
function dragChain(pt) {
  const n = nearestNode(pt, 0.35);
  if (!n) return;
  const A = S.drag, E = S.dragEnd;
  if (n[0] === A[0] && n[1] === A[1]) return;
  if (E && n[0] === E[0] && n[1] === E[1]) return;
  const tool = S.tool;
  if (!E) { if (segLen(A, n) <= MAX_LEN + 1e-6 && !validatePlacement(S.L, S.pieces, { type: tool, a: A, b: n })) S.dragEnd = n; return; }
  if (sameDir(A, E, n) && segLen(A, n) <= MAX_LEN + 1e-6 && !validatePlacement(S.L, S.pieces, { type: tool, a: A, b: n })) { S.dragEnd = n; return; }
  // direction changed (or too long): commit what we have and carry on from its end
  if (tryPlace({ type: tool, a: A, b: E })) {
    S.drag = E;
    S.dragEnd = segLen(E, n) <= MAX_LEN + 1e-6 && !validatePlacement(S.L, S.pieces, { type: tool, a: E, b: n }) ? n : null;
  }
}
cvs.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'touch' && touchesDown.size > 1) return;
  if (S.mode === 'test' && downInfo && downInfo.viewOnly && ev.buttons) {
    if (Math.hypot(ev.clientX - downInfo.x, ev.clientY - downInfo.y) > 4) panByPixels(ev.clientX - downInfo.lx, ev.clientY - downInfo.ly);
    downInfo.lx = ev.clientX; downInfo.ly = ev.clientY;
    return;
  }
  if (S.mode !== 'design') return;
  const pt = pickLocal(ev);
  S.hoverPt = pt;
  if (downInfo && !downInfo.right && ev.buttons) {
    const moved = Math.hypot(ev.clientX - downInfo.x, ev.clientY - downInfo.y);
    if (downInfo.canPan && (moved > 8 || downInfo.panned)) { panByPixels(ev.clientX - downInfo.lx, ev.clientY - downInfo.ly); downInfo.panned = true; }
    if (S.drag && (S.tool === 'tube' || S.tool === 'heavy') && moved > 8 && pt) dragChain(pt);
    downInfo.lx = ev.clientX; downInfo.ly = ev.clientY;
  }
  if (S.paint && pt && S.paint.y !== null) {
    const x0 = Math.floor(pt.x);
    if (!S.paint.done.has(x0) && x0 >= 0 && x0 < S.L.W && Math.abs(pt.y - S.paint.y) < 0.8) {
      S.paint.done.add(x0);
      const seg = { type: S.tool, a: [x0, S.paint.y], b: [x0 + 1, S.paint.y] };
      if (!validatePlacement(S.L, S.pieces, seg)) tryPlace(seg);
    }
  }
});
window.addEventListener('pointerup', (ev) => {
  forgetTouch(ev);
  if (ev.pointerType === 'touch' && touchesDown.size) return;   // other fingers still down
  if (S.mode !== 'design') { downInfo = null; return; }
  if (downInfo && downInfo.hint && !downInfo.panned) toast(downInfo.hint);
  const moved = downInfo ? Math.hypot(ev.clientX - downInfo.x, ev.clientY - downInfo.y) : 99;
  if (downInfo && downInfo.right) { if (moved < 5) S.chain = null; downInfo = null; return; }
  const pt = ev.target === cvs ? pickLocal(ev) : null;
  if (S.paint) { S.paint = null; downInfo = null; return; }
  const tool = S.tool;
  if ((tool === 'tube' || tool === 'heavy') && S.drag && moved > 8) {
    // end of a held drag: lay the last straight run
    if (pt) dragChain(pt);
    if (S.dragEnd) tryPlace({ type: tool, a: S.drag, b: S.dragEnd });
    S.drag = null; S.dragEnd = null; downInfo = null; return;
  }
  if (!pt || !downInfo || downInfo.panned) { S.drag = null; S.dragEnd = null; downInfo = null; return; }
  if (tool === 'tube' || tool === 'heavy') {
    if (S.drag) {
      // a tap: remember the first point, the next tap places the tube
      S.chain = S.drag; S.drag = null; S.dragEnd = null;
      sfx.click();
    } else if (S.chain && moved < 8) {
      const n = nearestNode(pt, 0.6);
      if (n && n[0] === S.chain[0] && n[1] === S.chain[1]) { S.chain = null; }
      else {
        const tgt = tubeTarget(S.chain, pt);
        if (tgt && tryPlace({ type: tool, a: S.chain, b: tgt })) S.chain = null;
      }
    }
  } else if (tool === 'ladder') {
    if (S.drag) {
      if (moved > 8) tryPlace({ type: 'ladder', a: S.drag, b: ladderTarget(S.drag, pt) });
      else { S.chain = S.drag; sfx.click(); }
      S.drag = null;
    } else if (S.chain && moved < 8) {
      if (tryPlace({ type: 'ladder', a: S.chain, b: ladderTarget(S.chain, pt) })) S.chain = null;
    }
  } else if (tool === 'lock' && moved < 8) {
    const l = ladderAt(pt);
    if (l) tryPlace({ type: 'lock', a: [...l.a] }); else toast('Click a ladder to lock it');
  } else if (tool === 'order' && moved < 8) {
    const i = pieceAt(pt);
    if (i >= 0) {
      if (i < S.seq) { toast(`That's already #${i + 1}`); }
      else {
        const k = reorder(i, S.seq);
        if (k >= 0) { S.seq = Math.min(S.pieces.length, k + 1); toast(`#${k + 1}: ${pieceDesc(S.pieces[k]).toLowerCase()}. Next click is #${S.seq + 1}`); }
        refreshOrderLabels();
      }
    }
  } else if (tool === 'protect' && moved < 8) {
    const i = windowAt(pt);
    if (i >= 0) tryPlace({ type: 'protect', a: [i, 0] }); else toast('Click a window to board it up');
  } else if (tool === 'tie' && moved < 8) {
    const n = nearestNode(pt);
    if (n) tryPlace({ type: 'tie', a: n });
  } else if (tool === 'erase' && moved < 8) {
    const i = pieceAt(pt);
    if (i >= 0) { pushUndo(); S.pieces.splice(i, 1); afterEdit(); sfx.click(); }
  }
  downInfo = null;
});
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (S.mode === 'design') {
    const t = TOOLS.find(t => t.key === e.key);
    if (t) { const b = $('tool-' + t.id); if (b && !b.disabled) setTool(t.id); }
    if (e.key === 'Escape') { S.chain = null; S.drag = null; if (S.tool === 'order') { S.seq = 0; refreshOrderLabels(); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Enter' && !$('buildBtn').disabled) startTest();
  } else if (S.mode === 'test') {
    if (e.key === 'Escape') stopTest();
    if (['1', '2', '3', '4'].includes(e.key)) setSpeed([1, 2, 4, 8][+e.key - 1]);
  }
});

function updateDesignHover() {
  const pt = S.hoverPt;
  hoverRing.visible = false; startRing.visible = false; previewTube.visible = false; previewBoard.visible = false; tipLabel.visible = false;
  let hiPieces = null, hiBoards = null;
  if (!pt) return { hiPieces, hiBoards };
  const tool = S.tool;
  const setTip = (html, bad, x, y) => { tipLabel.visible = true; tipLabel.el.innerHTML = html; tipLabel.el.classList.toggle('bad', !!bad); tipLabel.pos.set(x, y, Z_OUT); };
  if (tool === 'tube' || tool === 'heavy') {
    const start = S.chain || S.drag;
    if (start) {
      startRing.visible = true; startRing.position.set(start[0], start[1], Z_OUT + 0.02);
      const tgt = (S.drag && S.dragEnd) || tubeTarget(start, pt);
      if (tgt) {
        const p = { type: tool, a: start, b: tgt };
        const err = validatePlacement(S.L, S.pieces, p);
        const len = Math.hypot(tgt[0] - start[0], tgt[1] - start[1]);
        segMatrix(start[0], start[1], Z_OUT + 0.02, tgt[0], tgt[1], Z_OUT + 0.02, 1, previewTube.matrix);
        previewTube.matrix.decompose(previewTube.position, previewTube.quaternion, previewTube.scale);
        previewTube.visible = true;
        previewMat.color.set(err ? 0xff4d3a : 0x5cff8a);
        hoverRing.visible = true; hoverRing.position.set(tgt[0], tgt[1], Z_OUT + 0.02);
        setTip(err ? err : `${len.toFixed(1)} m · ${fmt(pieceCost(p))}`, !!err, tgt[0], tgt[1]);
      }
    } else {
      const n = nearestNode(pt);
      if (n) { hoverRing.visible = true; hoverRing.position.set(n[0], n[1], Z_OUT + 0.02); hoverRing.material.color.set(isStartable(n) ? 0xf3d40b : 0x777777); }
    }
  } else if (tool === 'board' || tool === 'deck' || tool === 'trap') {
    const seg = boardSegAt(pt);
    if (seg) {
      const err = validatePlacement(S.L, S.pieces, seg);
      previewBoard.visible = true; previewBoard.position.set(seg.a[0] + 0.5, seg.a[1] + 0.11, Z_MID);
      previewMat.color.set(err ? 0xff4d3a : 0x5cff8a);
      if (err) setTip(err, true, seg.a[0] + 0.5, seg.a[1]);
      else setTip(`${BOARDS[tool].name} · ${fmt(BOARDS[tool].cost)} · holds ${BOARDS[tool].cap} kg`, false, seg.a[0] + 0.5, seg.a[1]);
    }
  } else if (tool === 'tie') {
    const n = nearestNode(pt);
    if (n) {
      const err = validatePlacement(S.L, S.pieces, { type: 'tie', a: n });
      hoverRing.visible = true; hoverRing.position.set(n[0], n[1], Z_OUT + 0.02); hoverRing.material.color.set(err ? 0xff4d3a : 0x7fd6ff);
      setTip(err || `Wall tie · ${fmt(TIE.cost)}`, !!err, n[0], n[1]);
    }
  } else if (tool === 'ladder') {
    const foot = S.chain || S.drag;
    if (foot) {
      const top = ladderTarget(foot, pt);
      const p = { type: 'ladder', a: foot, b: top };
      const err = validatePlacement(S.L, S.pieces, p);
      segMatrix(foot[0] + LAD_OFF, foot[1], Z_OUT + 0.3, top[0] + LAD_OFF, top[1] + 1, Z_OUT + 0.3, 1.8, previewTube.matrix);
      previewTube.matrix.decompose(previewTube.position, previewTube.quaternion, previewTube.scale);
      previewTube.visible = true;
      previewMat.color.set(err ? 0xff4d3a : 0x5cff8a);
      startRing.visible = true; startRing.position.set(foot[0], foot[1], Z_OUT + 0.02);
      hoverRing.visible = true; hoverRing.position.set(top[0], top[1], Z_OUT + 0.02);
      setTip(err || `Ladder ${top[1] - foot[1]} m · ${fmt(pieceCost(p))}`, !!err, top[0], top[1]);
    } else {
      const n = nearestNode({ x: pt.x - LAD_OFF * 0.5, y: pt.y }, 0.6);
      if (n) { hoverRing.visible = true; hoverRing.position.set(n[0], n[1], Z_OUT + 0.02); hoverRing.material.color.set(ladderFootOk(n) ? 0xf3d40b : 0x777777); setTip('Ladder foot', false, n[0], n[1]); }
    }
  } else if (tool === 'lock') {
    const l = ladderAt(pt);
    if (l) {
      const err = validatePlacement(S.L, S.pieces, { type: 'lock', a: l.a });
      hiPieces = new Set([S.pieces.indexOf(l)]);
      setTip(err || `Lock this ladder · ${fmt(LOCK.cost)}`, !!err, pt.x, pt.y);
    }
  } else if (tool === 'protect') {
    const i = windowAt(pt);
    if (i >= 0) {
      const w = S.L.house.windows[i];
      const err = validatePlacement(S.L, S.pieces, { type: 'protect', a: [i, 0] });
      setTip(err || `Board up · ${fmt(BOARDUP.cost)}${S.risk && S.risk.has(i) ? ' · in the firing line' : ''}`, !!err, w.x + w.w / 2, w.y + w.h);
    }
  } else if (tool === 'order') {
    const i = pieceAt(pt);
    if (i >= 0) {
      hiPieces = new Set([i]); hiBoards = hiPieces;
      setTip(i < S.seq ? `#${i + 1} (already ordered)` : `Make this #${S.seq + 1}`, false, pt.x, pt.y);
    }
  } else if (tool === 'erase') {
    const i = pieceAt(pt);
    if (i >= 0) {
      const p = S.pieces[i];
      hiPieces = new Set([i]); hiBoards = hiPieces;
      setTip(`Remove · refund ${fmt(pieceCost(p))}`, false, pt.x, pt.y);
    }
  }
  if (!(tool === 'tube' || tool === 'heavy' || tool === 'ladder')) hoverRing.material.color.set(tool === 'tie' ? hoverRing.material.color : 0xf3d40b);
  if (S.hiList >= 0 && S.showOrder) { hiPieces = new Set([S.hiList]); hiBoards = hiPieces; }
  return { hiPieces, hiBoards };
}

// ---------------------------------------------------------------------------
//  Screens & flow
// ---------------------------------------------------------------------------
function show(id, on = true) { $(id).hidden = !on; }
function hudDesign(on) { for (const id of ['job', 'docket', 'tools', 'go', 'corner', 'help', 'campad']) show(id, on); if (!on) $('orderPanel').hidden = true; }

function frameCamera(L, instant = false) {
  const target = new THREE.Vector3(0, Math.max(2.2, L.H * 0.46), 1.2);
  const aspect = window.innerWidth / window.innerHeight;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * aspect;
  const narrow = window.innerWidth < 760;
  const dist = Math.max((L.W / 2 + 1.5) / th * (narrow ? 0.62 : 0.85), (L.H / 2 + 2.6) / tv) + (narrow ? 3 : 6.5);
  if (narrow) target.x -= 0.7;
  const pos = new THREE.Vector3(dist * Math.sin(0.14), target.y + dist * 0.1, target.z + dist * Math.cos(0.14));
  S.camGoal = { target, pos, t: 0 };
  if (instant) { controls.target.copy(target); camera.position.copy(pos); S.camGoal = null; }
}

function loadLevel(i) {
  S.li = i;
  const def = LEVELS[i];
  const L = prepLevel(def);
  S.L = L;
  S.risk = windowsAtRisk(L);
  buildLevelScene(L);
  buildOverlay(L);
  S.pieces = cleanPieces(save.d.designs[L.id] || []);
  S.undo = [];
  S.chain = null;
  S.trial = null;
  clearDebris();
  for (const m of S.itemMeshes.values()) root.remove(m);
  S.itemMeshes.clear();
  $('jobNo').textContent = String(L.id).padStart(2, '0');
  $('jobName').textContent = L.name;
  $('jobClient').textContent = L.client;
  const chips = [];
  if (L.wind) chips.push(`<span class="chip warn">Wind: ${L.wind + L.gust > 35 ? 'strong gusts' : 'breezy'}</span>`);
  if (L.chavs) chips.push(`<span class="chip bad">Chavs: ${L.chavs}</span>`);
  if (L.maxTies === 0) chips.push('<span class="chip bad">No ties</span>');
  else if (L.maxTies < 99) chips.push(`<span class="chip">Max ${L.maxTies} ties</span>`);
  if (L.heavy) chips.push('<span class="chip">Heavy tube</span>');
  if (L.deck) chips.push('<span class="chip">Steel deck</span>');
  $('jobChips').innerHTML = chips.join('');
  const bar = $('bar');
  bar.querySelectorAll('.tick').forEach(t => t.remove());
  for (const [f, s] of [[0.7, '★★★'], [0.85, '★★']]) { const t = document.createElement('div'); t.className = 'tick'; t.style.left = f * 100 + '%'; t.innerHTML = `<span>${s}</span>`; bar.appendChild(t); }
  if (!TOOLS.some(t => t.id === S.tool && (!t.req || L[t.req]))) S.tool = 'tube';
  renderTools();
  setTool(S.tool);
  afterEdit();
  frameCamera(L);
}

function openBrief() {
  const L = S.L;
  S.mode = 'brief';
  const loads = L.deliveries.map(d => `<span>${ITEMS[d.item].name}</span><span class="kg num">${kg(ITEMS[d.item].mass)}</span><span class="at num">${L.zones[d.zone].y} m up</span>`).join('');
  const facts = [`<span class="chip">Quote ${fmt(L.budget)}</span>`];
  if (L.chavs) facts.push(`<span class="chip bad">Chavs: ${L.chavs}</span>`);
  if (L.wind) facts.push(`<span class="chip warn">Wind: ${L.wind + L.gust > 35 ? 'strong gusts' : 'breezy'}</span>`);
  if (L.maxTies === 0) facts.push('<span class="chip bad">No wall ties</span>'); else if (L.maxTies < 99) facts.push(`<span class="chip">Max ${L.maxTies} wall ties</span>`);
  if (L.heavy) facts.push('<span class="chip">Heavy tube unlocked</span>');
  if (L.deck) facts.push('<span class="chip">Steel deck unlocked</span>');
  const best = save.d.best[L.id];
  $('briefIn').innerHTML = `
    <div class="kicker">Job ${String(L.id).padStart(2, '0')} · ${L.client}</div>
    <h2>${L.name}</h2>
    <p>${L.brief}</p>
    <div class="loads"><span class="h">Dave will carry up</span><span class="h" style="text-align:right">Weight</span><span class="h" style="text-align:right">Height</span>${loads}</div>
    <div class="facts">${facts.join('')}${best ? `<span class="chip">Your best ${fmt(best)}</span>` : ''}</div>
    <p class="tipline">${L.tip}</p>
    ${S.risk && S.risk.size ? `<p class="tipline">Anything over ${WINDOW_BREAK_KG} kg dumped in front of a window puts a brick through it: £${GLAZIER} to the glazier, or £${BOARDUP.cost} to board it up first. ${S.risk.size} window${S.risk.size > 1 ? 's are' : ' is'} in the firing line on this job.</p>` : ''}
    ${L.chavs ? `<p class="tipline chav">After Dave's done, ${L.chavs > 1 ? L.chavs + ' local lads' : 'a local lad'} will turn up to swing on your tubes and climb any ladder that isn't locked. Every tag on the house costs ${fmt(TAG_COST)} to clean off. You don't have to lock them out: lay <b>trap boards</b> where they'll walk. A chav who drops ${SAFE_FALL} m or less gets carted off by the police, who pay ${fmt(TRAP_REWARD)} each. Drop one further than that and you get sued.</p>` : ''}
    <p class="terry"><b>Big Terry:</b> “${TERRY[L.id - 1]}”</p>
    <div class="row"><button class="big ghost" id="briefBack">Job sheet</button><button class="big" id="briefGo">${S.pieces.length ? 'Back to it' : 'Start the job'}</button></div>`;
  hudDesign(false);
  show('brief');
  $('briefGo').onclick = () => { sfx.unlock(); sfx.click(); show('brief', false); enterDesign(); };
  $('briefBack').onclick = () => { sfx.click(); show('brief', false); openSelect(); };
}

function enterDesign() {
  S.mode = 'design';
  show('select', false); show('title', false); show('result', false); show('status', false);
  hudDesign(true);
  $('buildBtn').hidden = false; $('speed').hidden = true; $('stopBtn').hidden = true;
  overlay.visible = true;
  clearLabels('fx');
  for (const l of labels) if (l.group === 'design') l.visible = true;
  S.trial = null;
  S.zoff = [];
  clearDebris();
  for (const m of S.itemMeshes.values()) root.remove(m);
  S.itemMeshes.clear();
  dave.visible = false;
  for (const m of chavMeshes) m.visible = false;
  clearPeopleFx();
  resetPolice();
  resetSheila();
  if (sceneDirty) { const hl = labels.filter(l => l.group === 'design'); buildLevelScene(S.L); }
  S.dusk = 0;
  afterEdit();
  updateHelp();
  sfx.wind(0);
}
function currentLevel() { return S.L; }

function openSelect() {
  S.mode = 'select';
  hudDesign(false); show('title', false); show('result', false); show('status', false);
  const cards = LEVELS.map((d, i) => {
    const st = save.d.stars[d.id] || 0, best = save.d.best[d.id];
    const open = unlocked(i);
    return `<button class="card" data-i="${i}" ${open ? '' : 'disabled'} id="card-${d.id}">
      <span class="cn num">${String(d.id).padStart(2, '0')}</span>
      <span class="ct">${d.name}</span>
      <span class="cc">${d.client}</span>
      ${open ? `<span class="stars">${'★'.repeat(st)}<span class="off">${'★'.repeat(3 - st)}</span></span>` : '<span class="lock">Locked</span>'}
      <span class="best num">${best ? 'Best ' + fmt(best) + ' · ' : ''}Quote ${fmt(d.budget)}</span></button>`;
  }).join('');
  $('cards').innerHTML = cards;
  $('chavTally').textContent = save.d.chavKills ? `Chavs nicked: ${save.d.chavKills}` : '';
  $('cards').querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { sfx.unlock(); sfx.click(); show('select', false); loadLevel(+c.dataset.i); openBrief(); }));
  show('select');
}

function setSpeed(v) {
  S.speed = v;
  $('speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === v));
}
$('speed').innerHTML = [1, 2, 4, 8].map(s => `<button data-s="${s}" id="speed-${s}" title="Speed ${s}×">${s}×</button>`).join('');
$('speed').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.s)));

function startTest() {
  if (!S.req) return;
  sfx.unlock(); sfx.clank(1);
  S.mode = 'test';
  S.trial = new Trial(S.L, cleanPieces(S.pieces));
  S.trial.skipDeliveries = !S.req.ok;
  S.trial.unfinished = !S.req.ok;

  S.windows = 0;
  S.acc = 0; S.logI = 0; S.evI = 0; S.lastIdx = -1; S.resultT = 0; S.zoff = []; S.dusk = 0; S.policeWait = 0;
  clearPeopleFx();
  resetPolice();
  resetSheila();
  S.chain = null;
  hoverRing.visible = startRing.visible = previewTube.visible = previewBoard.visible = false;
  tipLabel.visible = false;
  overlay.visible = false;
  for (const l of labels) if (l.group === 'design') l.visible = false;
  clearLabels('order'); clearLabels('risk');
  show('tools', false); show('help', false); $('orderPanel').hidden = true;
  $('buildBtn').hidden = true; $('speed').hidden = false; $('stopBtn').hidden = false;
  show('status');
  setSpeed(S.speed);
}
function stopTest() {
  sfx.click();
  show('result', false);
  enterDesign();
  show('tools'); show('help');
}
$('buildBtn').onclick = startTest;
$('stopBtn').onclick = stopTest;
$('menuBtn').onclick = () => { sfx.click(); openSelect(); };
$('undoCornerBtn').onclick = () => { if (S.mode === 'design') undo(); };
$('briefBtn').onclick = () => { sfx.click(); openBrief(); };
const syncSoundBtn = () => { $('soundBtn').querySelector('.wave').style.opacity = sfx.muted ? 0.15 : 1; };
$('soundBtn').onclick = () => { sfx.toggle(); syncSoundBtn(); };
syncSoundBtn();
$('playBtn').onclick = () => { sfx.unlock(); sfx.clank(1); show('title', false); S.titleSim = null; for (const m of chavMeshes) m.visible = false; openSelect(); };

function status(ph, msg, bad = false) {
  $('statusPh').textContent = ph;
  $('statusPh').style.color = bad ? '#ff8a7a' : '';
  $('statusMsg').textContent = msg;
}
function testStatus() {
  const tr = S.trial;
  if (!tr) return;
  const b = tr.builder;
  const it = b.carrying ? `${b.carrying.def.name.toLowerCase()} (${kg(b.carrying.def.mass)})` : '';
  if (tr.result && !tr.result.ok) return status(tr.result.sued ? 'Sued' : 'Collapse', tr.result.reason, true);
  if (tr.phase === 'chavs') {
    const cs = tr.chavs.filter(c => c.visible && c.state !== 'gone');
    const tags = (S.windows ? ` · ${S.windows} window${S.windows > 1 ? 's' : ''} smashed` : '') + (tr.tags.length ? ` · ${tr.tags.length} tag${tr.tags.length > 1 ? 's' : ''} (${fmt(tr.tags.length * TAG_COST)} clean-up)` : '');
    let msg = 'The local youth have arrived';
    if (tr.trappedCount) msg = `${tr.trappedCount} chav${tr.trappedCount > 1 ? 's' : ''} through a trap board!`;
    if (tr.trappedCount && S.t % 4 < 2) {}
    else if (cs.some(c => c.state === 'spray')) msg = 'A chav is tagging the house!';
    else if (cs.some(c => c.state === 'bounce')) msg = 'Chavs jumping on your boards';
    else if (cs.some(c => c.state === 'route')) msg = 'A chav is up your ladder!';
    else if (cs.some(c => c.state === 'hang' && c.angry)) msg = "Locked out and livid: they're swinging on anything they can reach";
    else if (cs.some(c => c.state === 'hang')) msg = 'Chavs swinging on your tubes';
    else if (cs.some(c => c.state === 'rattle')) msg = 'Rattling the locked ladder. Nice try.';
    else if (!cs.length && tr.chavs.every(c => c.state === 'gone' || c.state === 'flat' || c.nicked)) msg = 'They got bored and went home';
    return status('After dark', msg + tags);
  }
  if (tr.phase === 'build') return status('Erecting', `Piece ${Math.min(tr.idx + 1, tr.pieces.length)} of ${tr.pieces.length}`);
  if (tr.phase === 'settle') return status('Inspection', 'Checking it over');
  if (tr.phase === 'hold' || (tr.phase === 'done' && tr.result?.ok)) return status('Loaded', tr.result?.ok ? "Still up. Terry's happy." : `Holding the load… ${Math.max(0, 2.5 - tr.pieceT).toFixed(1)} s`);
  if (tr.phase === 'deliver') {
    const n = `Load ${tr.deliv + 1} of ${S.L.deliveries.length}`;
    if (b.state === 'toBase') return status(n, `Dave is fetching the ${it}`);
    if (b.state === 'route' && !b.returning) return status(n, b.mode === 'climb' ? `Dave is climbing with the ${it}` : `Dave is carrying the ${it}`);
    if (b.state === 'toDrop') return status(n, `Dave is carrying the ${it}`);
    if (b.state === 'dump') return status(n, 'Dumping it!');
    return status(n, 'Dave is heading back down');
  }
}

function showResult() {
  const tr = S.trial, L = S.L;
  const materials = designCost(L, S.pieces);
  const tags = tr.tags.length;
  const smashed = (tr.result && tr.result.ok) ? (S.windows || 0) : 0;
  const trappedN = (tr.result && tr.result.trapped) || 0;
  const reward = (tr.result && tr.result.ok) ? trappedN * TRAP_REWARD : 0;
  const cost = materials + tags * TAG_COST + smashed * GLAZIER - reward;
  const stood = tr.result && tr.result.ok && !tr.unfinished;
  const unfinished = tr.result && tr.result.ok && tr.unfinished;
  const sued = tr.result && tr.result.sued;
  const under = cost <= L.budget;
  const ok = stood && under;
  let stars = 0;
  if (ok) {
    stars = cost <= L.budget * 0.7 ? 3 : cost <= L.budget * 0.85 ? 2 : 1;
    save.d.stars[L.id] = Math.max(save.d.stars[L.id] || 0, stars);
    save.d.best[L.id] = Math.min(save.d.best[L.id] || Infinity, cost);
    save.write();
    sfx.fanfare();
  } else sfx.wah();
  const next = S.li + 1 < LEVELS.length;
  const reason = unfinished ? "The platform or Dave's ladder wasn't finished, so Dave never went up. Nobody's paying for that." : sued ? `${tr.result.reason} Their mum's already got a no-win-no-fee solicitor.` : !stood ? tr.result.reason : (tags || smashed) && materials <= L.budget ? `It stood, but ${smashed ? `the glazier (${fmt(smashed * GLAZIER)})` : ''}${smashed && tags ? ' and ' : ''}${tags ? `the graffiti clean-up (${fmt(tags * TAG_COST)})` : ''} ate the profit.` : `It stood, but you spent ${fmt(cost - L.budget)} more than the quote. Terry's docking your wages.`;
  const band = ok ? ['Safe for use*', '*as far as Terry knows'] : unfinished ? ['Not finished', 'No platform, no pay'] : sued ? ['Sued', 'See you in court'] : stood ? ['Not paid', 'Over the quote'] : ['Do not use', 'Scaffold incomplete'];
  const kills = trappedN;
  if (kills) { save.d.chavKills = (save.d.chavKills || 0) + kills; save.write(); }
  const daveLine = tr.result && tr.result.daveDown ? "Deceased (it's what he'd have wanted)" : 'Dave (signed with an X)';
  $('result').innerHTML = `<div class="tag ${ok ? 'good' : sued ? 'sued' : 'bad'}">
    <div class="band"><div class="big1">${band[0]}</div><div class="small1">${band[1]}</div></div>
    <div class="fields">
      <span class="k">Job</span><span class="v">${String(L.id).padStart(2, '0')} · ${L.name}</span>
      <span class="k">Materials</span><span class="v num">${fmt(materials)}</span>
      ${reward ? `<span class="k">Police reward</span><span class="v num bonus">+${fmt(reward)} (${trappedN} chav${trappedN > 1 ? 's' : ''})</span>` : ''}
      ${smashed ? `<span class="k">Glazier</span><span class="v num">${fmt(smashed * GLAZIER)} (${smashed} window${smashed > 1 ? 's' : ''})</span>` : ''}
      ${tags ? `<span class="k">Graffiti</span><span class="v num">${fmt(tags * TAG_COST)} (${tags} tag${tags > 1 ? 's' : ''})</span>` : ''}
      <span class="k">Quote</span><span class="v num">${fmt(L.budget)}</span>
      ${ok ? `<span class="k">Profit</span><span class="v num">${fmt(L.budget - cost)}</span>` : `<span class="k">Reason</span><span class="v">${reason}</span>`}
      <span class="k">Inspected by</span><span class="v hand">${daveLine}</span>
      ${kills ? `<span class="k">Bonus</span><span class="v bonus num">+${kills} chav${kills > 1 ? 's' : ''} nicked · tally ${save.d.chavKills}</span>` : ''}
    </div>
    ${ok ? `<div class="tstars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>` : ''}
    <div class="tbtns">
      <button id="resEdit">${ok ? 'Do it cheaper' : 'Fix it'}</button>
      ${ok && next ? '<button class="pri" id="resNext">Next job</button>' : ok ? '<button class="pri" id="resJobs">Job sheet</button>' : '<button class="pri" id="resRetry">Run again</button>'}
    </div></div>`;
  show('result');
  $('resEdit').onclick = () => stopTest();
  if ($('resNext')) $('resNext').onclick = () => { sfx.click(); show('result', false); loadLevel(S.li + 1); openBrief(); };
  if ($('resJobs')) $('resJobs').onclick = () => { sfx.click(); show('result', false); openSelect(); };
  if ($('resRetry')) $('resRetry').onclick = () => { show('result', false); enterDesign(); show('tools'); show('help'); startTest(); };
}

// ---------------------------------------------------------------------------
//  Per-frame test update
// ---------------------------------------------------------------------------
const pileLocal = () => new THREE.Vector3(S.L.W + 3.4 - 0.2, 0.4, 4.8);
function stepTest(dt) {
  const tr = S.trial, L = S.L;
  if (!tr) return;
  if (tr.phase !== 'done' || S.resultT < 1) {
    S.acc += dt * S.speed;
    let n = 0;
    while (S.acc >= 1 / 60 && n < 16) { tr.update(1 / 60); S.acc -= 1 / 60; n++; }
    if (n >= 16) S.acc = 0;
  }
  // sim events -> effects
  for (; S.logI < tr.log.length; S.logI++) {
    const ev = tr.log[S.logI];
    if (ev.type === 'member') { spawnTubeDebris(ev, L); S.shake = Math.max(S.shake, 0.08); }
    else if (ev.type === 'board') {
      spawnBoardDebris(ev, L); S.shake = Math.max(S.shake, 0.1);
      const isTrap = tr.sim.boards[ev.id] && tr.sim.boards[ev.id].type.id === 'trap';
      if (ev.reason === 'overload') shout(isTrap ? 'GOTCHA!' : 'SNAP!', (ev.ax + ev.bx) / 2, ev.ay + 0.6, isTrap ? 'bonus' : '');
    }
    else if (ev.type === 'tie') { wallChunks(ev.x, ev.y); sfx.crack(); shout('POP!', ev.x, ev.y + 0.5); }
  }
  for (; S.evI < tr.events.length; S.evI++) {
    const ev = tr.events[S.evI];
    if (ev.type === 'tag') { addTagDecal(ev.tag, tagDecals.length); shout('TAGGED!', ev.tag.x, ev.tag.y + 0.6); }
    else if (ev.type === 'splat') { sfx.splat(); }
    else if (ev.type === 'angry') { shout('OI!! 😡', ev.x, ev.y + 2.2); }
    if (ev.type === 'land') {
      const it = ev.item;
      if (it.def.mass >= WINDOW_BREAK_KG) (S.L.house.windows || []).forEach((w, i) => {
        if (w.x < it.x + it.def.w / 2 + 0.3 && w.x + w.w > it.x - it.def.w / 2 - 0.3 && w.y >= it.zoneY - 0.5 && w.y <= it.zoneY + 1.8) {
          const b = windowBreakable(i);
          if (b && !b.glassBroken && smashGlass(b)) { S.windows++; shout('SMASH!', w.x + w.w / 2, w.y + w.h / 2); }
        }
      });
      puff(it.x, it.y, Z_MID, 6 + Math.round(it.def.mass / 100), 0.5 + it.def.mass / 1500);
      sfx.thud(it.def.mass);
      S.shake = Math.max(S.shake, Math.min(0.25, it.def.mass / 4000));
      if (it.def.mass >= 500) shout(it.def.mass >= 1000 ? 'THUMP!!' : 'THUMP!', it.x, it.y + 1.8);
    }
  }
  // piece placement sounds
  if (tr.phase === 'build' && tr.idx !== S.lastIdx) {
    S.lastIdx = tr.idx;
  }
  if (tr.building && tr.building._added && !tr.building._snd) {
    tr.building._snd = true;
    const t = tr.building.type;
    if (t === 'board' || t === 'deck' || t === 'trap') sfx.thunk(); else sfx.clank(0.8);
  }
  // collapse drama: failing nodes drift away from the wall
  if (tr.result && !tr.result.ok) {
    if (!S.crashed) { S.crashed = true; sfx.crash(); S.shake = 0.3; }
    for (const n of tr.sim.nodes) {
      if (n.hidden) continue;
      const sp = Math.hypot(n.vx, n.vy);
      S.zoff[n.id] = (S.zoff[n.id] || 0) + dt * Math.min(1.6, sp * 0.3) * (n.y > 0.25 ? 1 : 0.1);
    }
  } else S.crashed = false;
  // people who come off become ragdolls
  const people = [[tr.builder, dave], ...tr.chavs.map((c, i) => [c, chavMesh(i)])];
  for (const [p, mesh] of people) {
    if ((p.state === 'falling' || p.state === 'flat') && !p.ragdolled && mesh.visible) {
      const sim = tr.sim;
      const tangle = p.tangled ? {
        nodes: sim.nodes.filter(n => !n.hidden && n.arms.length).map(n => ({ id: n.id, x: n.x, y: n.y, z: Z_MID + (S.zoff[n.id] || 0) })),
        nodePos: (id) => { const n = sim.nodes[id]; return { x: n.x, y: n.y, z: Z_MID + (S.zoff[id] || 0) }; },
      } : null;
      const vel = { x: p.vx || 0, y: p.tangled ? (p.vy || 0) : -1, z: 0.3 };
      const rd = spawnRagdoll(mesh, p, L, vel, tangle);
      if (p.who === 'chav') rd.chavMesh = mesh;
      shout(p.who === 'dave' ? 'AAARGH!' : 'OI!', p.x, p.y + 2);
    }
  }
  const sdt = Math.min(0.033, dt * Math.min(S.speed, 2));
  for (const r of ragdolls) {
    r.step(sdt / 2); r.step(sdt / 2);
    r.life = (r.life || 0) + dt;
    if (!r.dead && r.life > 0.8 && (r.still > 0.25 || r.life > 3)) {
      r.dead = true;
      if (r.key === 'dave' || (r.person && r.person.dead)) comicDeath(r);
      else { shout(`+${fmt(TRAP_REWARD)} REWARD`, r.center.x, r.center.y + 1.6, 'bonus'); sfx.fanfare(); }
    }
  }
  // chavs lying dazed or stuck in the wreckage: somebody's called the police
  const stuck = ragdolls.filter(r => r.key !== 'dave' && r.dead && !r.queued && !(r.person && r.person.dead));
  if (stuck.length && !police.active) { S.policeWait = (S.policeWait || 0) + dt; if (S.policeWait > 1.2) { S.policeWait = 0; startPolice(stuck, L); } }
  // anything moving fast knocks the scenery about
  const hitters = [];
  const collapsed = tr.result && !tr.result.ok;
  if (collapsed) for (const n of tr.sim.nodes) {
    if (n.hidden || !n.alive) continue;
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > 1.0) hitters.push({ x: n.x, y: n.y, z: Z_MID + (S.zoff[n.id] || 0), vx: n.vx, vy: n.vy });
  }
  for (const d of debris) if (!d.rest && !d.noHit && Math.hypot(d.vx, d.vy) > 1.5) hitters.push({ x: d.mesh.position.x, y: d.mesh.position.y, z: d.mesh.position.z, vx: d.vx, vy: d.vy });
  for (const r of ragdolls) if (r.speed > 2) hitters.push({ x: r.center.x, y: r.center.y, z: r.center.z, vx: 0, vy: -2 });
  for (const it of tr.items) if (it.state === 'falling' && it.zoneY === null && Math.abs(it.vy) > 2) hitters.push({ x: it.x, y: it.y, z: Z_MID, vx: 0, vy: it.vy });
  if (hitters.length) checkBreakables(hitters);
  // chavs jumping about in front of a window
  for (const c of tr.chavs) if (c.state === 'bounce' && c.t > 1) {
    const i = windowInFront(S.L, c.x, c.zy ?? Math.round(c.y), 0.2);
    const b = i >= 0 ? windowBreakable(i) : null;
    if (b && !b.glassBroken && !b.protected && smashGlass(b)) { S.windows++; shout('SMASH!', c.x, c.y + 1.4); }
  }
  // spray-paint mist
  for (const [i, c] of tr.chavs.entries()) if (c.state === 'spray' && Math.random() < 0.5) {
    puff(c.x - 0.15 + Math.sin(S.t * 2.3) * 0.4, c.y + 1.3, 0.2, 1, 0.25, [0xff2d8a, 0x2dff6a, 0x2dc8ff, 0xffd12d][i % 4]);
    if (!c._sprayed) { c._sprayed = true; sfx.spray(); }
  }
  // dusk falls when the chavs come out
  const duskT = tr.phase === 'chavs' || (S.L.chavs && (tr.phase === 'hold' || tr.phase === 'done' || tr.phase === 'failing') && tr.deliv >= S.L.deliveries.length) ? 1 : 0;
  S.dusk = (S.dusk || 0) + (duskT - (S.dusk || 0)) * Math.min(1, dt * S.speed * 0.4);
  if (tr.phase === 'done') {
    S.resultT += dt;
    const waitPolice = (police.active || ragdolls.some(r => r.key !== 'dave' && !r.queued && !(r.person && r.person.dead))) && S.resultT < 30;
    if (S.resultT > (ragdolls.length ? 4 : 1.1) && !waitPolice && $('result').hidden) showResult();
  }
  testStatus();
}
function shout(text, x, y, cls = '', z = Z_OUT + 0.5) {
  const l = addLabel('shout ' + cls, text, x, y, z, 'fx');
  l.born = S.t;
  return l;
}

function renderTrial(dt) {
  const tr = S.trial, sim = tr.sim;
  // pending pieces as a faint blueprint
  const ghost = [];
  for (let i = tr.idx + (tr.building && tr.building._added ? 1 : 0); i < tr.pieces.length; i++) {
    const p = tr.pieces[i];
    if (p.type === 'tube' || p.type === 'heavy') ghost.push([p.a[0], p.a[1], p.b[0], p.b[1]]);
  }
  if (tr.phase !== 'build') ghost.length = 0;
  if (S.speed > 0 && tr.phase === 'build') for (let i = tr.idx; i < tr.pieces.length; i++) { const q = tr.pieces[i]; if (q.type === 'ladder') ghost.push([q.a[0] + LAD_OFF, q.a[1], q.b[0] + LAD_OFF, q.b[1] + 1]); }
  scaffold.update(sim, { stress: S.stress && tr.phase !== 'build', zoff: S.zoff, ghost });
  // flying piece
  flyTube.visible = flyTube2.visible = flyBoard.visible = false;
  const p = tr.building;
  if (p && !p._added && tr.phase === 'build') {
    const k = Math.min(1, tr.pieceT / PIECE_ANIM);
    const e = 1 - Math.pow(1 - k, 3);
    const src = pileLocal();
    const lift = Math.sin(k * Math.PI) * 1.5;
    if (p.type === 'tube' || p.type === 'heavy') {
      const mx = (p.a[0] + p.b[0]) / 2, my = (p.a[1] + p.b[1]) / 2;
      const cx = src.x + (mx - src.x) * e, cy = src.y + (my - src.y) * e + lift;
      const hx = (p.b[0] - p.a[0]) / 2, hy = (p.b[1] - p.a[1]) / 2;
      const mat = p.type === 'heavy' ? M.heavy : M.steel;
      const geo = p.type === 'heavy' ? tubeGeoHeavy : tubeGeo;
      for (const [f, z] of [[flyTube, Z_IN], [flyTube2, Z_OUT]]) {
        f.material = mat; f.geometry = geo;
        const zz = src.z + (z - src.z) * e;
        segMatrix(cx - hx, cy - hy, zz, cx + hx, cy + hy, zz, 1, f.matrix);
        f.matrix.decompose(f.position, f.quaternion, f.scale);
        f.visible = true;
      }
    } else if (p.type === 'board' || p.type === 'deck' || p.type === 'trap') {
      const mx = (p.a[0] + p.b[0]) / 2, my = p.a[1] + 0.1;
      flyBoard.material = p.type === 'deck' ? M.deck : M.wood;
      flyBoard.position.set(src.x + (mx - src.x) * e, src.y + (my - src.y) * e + lift, src.z + (Z_MID - src.z) * e);
      flyBoard.visible = true;
    }
  }
  // items
  for (const it of tr.items) {
    let m = S.itemMeshes.get(it);
    if (!m) { m = makeItem(it.key); root.add(m); S.itemMeshes.set(it, m); }
    if (it.state === 'carried') {
      m.position.set(dave.position.x, dave.position.y + (tr.builder.mode === 'climb' ? 2.05 : 1.98), dave.position.z + (tr.builder.mode === 'climb' ? 0.15 : 0));
      m.rotation.set(0, 0, Math.sin(S.t * 3) * 0.03);
    } else {
      m.position.set(it.x, it.y + (it.state === 'placed' ? 0.04 : 0), it.state === 'ground' ? Z_MID + 0.4 : Z_MID);
      m.rotation.set(0, 0, it.rot || 0);
    }
  }
  animatePerson(dave, tr.builder, dt, S.t);
  tr.chavs.forEach((c, i) => { if (!c.nicked) animatePerson(chavMesh(i), c, dt, S.t); });
  for (let i = tr.chavs.length; i < chavMeshes.length; i++) chavMeshes[i].visible = false;
  // wind noise + visuals
  sfx.wind(S.L.wind ? Math.abs(sim.windAt(sim.time)) : 0);
}

// ---------------------------------------------------------------------------
//  Title backdrop: a finished scaffold on job 2
// ---------------------------------------------------------------------------
const TITLE_DESIGN = [
  { type: 'tube', a: [3, 0], b: [3, 2] }, { type: 'tube', a: [6, 0], b: [6, 2] }, { type: 'tube', a: [3, 2], b: [6, 2] }, { type: 'tube', a: [3, 0], b: [5, 2] },
  { type: 'tube', a: [8, 0], b: [8, 2] }, { type: 'tube', a: [6, 2], b: [8, 2] }, { type: 'tube', a: [8, 0], b: [6, 2] }, { type: 'tube', a: [3, 2], b: [3, 4] }, { type: 'tube', a: [6, 2], b: [6, 4] },
  { type: 'tube', a: [8, 2], b: [8, 4] }, { type: 'tube', a: [3, 4], b: [6, 4] }, { type: 'tube', a: [4, 2], b: [6, 4] }, { type: 'tube', a: [6, 4], b: [8, 4] }, { type: 'tube', a: [8, 2], b: [6, 4] },
  { type: 'board', a: [3, 4], b: [8, 4] }, { type: 'board', a: [3, 2], b: [6, 2] }, { type: 'tie', a: [3, 3] }, { type: 'ladder', a: [7, 0], b: [7, 4] },
];
function openTitle() {
  S.mode = 'title';
  loadLevel(1);
  overlay.visible = false;
  for (const l of labels) if (l.group === 'design') l.visible = false;
  S.titleSim = new Sim(S.L);
  for (const p of TITLE_DESIGN) S.titleSim.addPiece({ ...p });
  hudDesign(false);
  show('title');
  dave.visible = true;
  S.titleDave = { who: 'dave', visible: true, x: 5.4, y: 4, state: 'waving', mode: 'walk', face: 1, t: 0, onBoard: 1, onLadder: -1, onMember: -1 };
  S.titleChav = { who: 'chav', id: 0, visible: true, x: 4.5, y: 0, state: 'hang', mode: 'ground', face: 1, t: 0, onBoard: -1, onLadder: -1, onMember: 1, swing: 0 };
  frameCamera(S.L, true);
}

// ---------------------------------------------------------------------------
//  Main loop
// ---------------------------------------------------------------------------
const scaffold = new ScaffoldView();
let lastT = performance.now();
// ---- camera: keys + on-screen pad ----
const held = new Set();
const PAN_KEYS = { KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0], KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1] };
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey)) return;
  if (PAN_KEYS[e.code] || e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'Equal' || e.code === 'Minus') { held.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
document.querySelectorAll('#campad [data-cam]').forEach(b => {
  const code = b.dataset.cam;
  if (code === 'reset') { b.addEventListener('click', () => { if (S.L) frameCamera(S.L); }); return; }
  const on = (e) => { e.preventDefault(); held.add(code); b.setPointerCapture?.(e.pointerId); };
  const off = () => held.delete(code);
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
function moveCamera(dt) {
  if (!held.size || S.mode === 'title') return;
  S.camGoal = null;
  let px = 0, py = 0;
  for (const c of held) if (PAN_KEYS[c]) { px += PAN_KEYS[c][0]; py += PAN_KEYS[c][1]; }
  const off = camera.position.clone().sub(controls.target);
  const dist = off.length();
  if (px || py) {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
    const mv = right.multiplyScalar(px * dist * 0.7 * dt).add(new THREE.Vector3(0, py * dist * 0.7 * dt, 0));
    const t2 = controls.target.clone().add(mv);
    t2.x = Math.max(-14, Math.min(14, t2.x)); t2.y = Math.max(0, Math.min(14, t2.y));
    mv.subVectors(t2, controls.target);
    controls.target.add(mv); camera.position.add(mv);
  }
  if (held.has('KeyQ') || held.has('KeyE')) {
    const a = (held.has('KeyQ') ? 1 : -1) * dt * 1.1;
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(controls.target).add(off);
  }
  if (held.has('Equal') || held.has('Minus')) {
    const k = held.has('Equal') ? Math.exp(-dt * 1.3) : Math.exp(dt * 1.3);
    off.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, dist * k)));
    camera.position.copy(controls.target).add(off);
  }
}
const SUN_DAY = new THREE.Color(0xffeccc), SUN_DUSK = new THREE.Color(0xff8a4a);
// One bad frame must never freeze the whole game: keep the loop alive and report the error once.
let frameErr = null;
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); } catch (e) {
    if (!frameErr || frameErr.message !== e.message) console.error(e);
    frameErr = e;
    try { renderer.render(scene, camera); } catch (e2) { }
  }
}
function frameBody(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  S.t += dt;
  // camera
  camera.position.sub(S.shakeOff);
  if (S.camGoal) {
    const g = S.camGoal;
    g.t = Math.min(1, g.t + dt * 1.2);
    const k = g.t * g.t * (3 - 2 * g.t);
    controls.target.lerp(g.target, k * 0.25 + 0.02);
    camera.position.lerp(g.pos, k * 0.25 + 0.02);
    if (g.t >= 1 && camera.position.distanceTo(g.pos) < 0.05) S.camGoal = null;
  }
  if (S.mode === 'title') {
    const a = S.t * 0.05;
    const r = 23;
    camera.position.set(Math.sin(0.35 * Math.sin(a)) * r, 5.5, 1 + Math.cos(0.35 * Math.sin(a)) * r);
    controls.target.set(0, 3.4, 0);
  }
  moveCamera(dt);
  controls.update();
  S.shake *= Math.pow(0.02, dt);
  S.shakeOff.set((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake, 0);
  camera.position.add(S.shakeOff);

  let windNow = S.L ? (S.L.wind ? S.L.wind * (0.7 + 0.3 * Math.sin(S.t * 0.61)) : 2) : 2;
  if (S.mode === 'design' && S.designSim) {
    const { hiPieces, hiBoards } = updateDesignHover();
    scaffold.update(S.designSim, { highlight: hiPieces, hiBoard: hiBoards, showTraps: true });
  } else if (S.mode === 'test' && S.trial) {
    stepTest(dt);
    if (S.trial) { renderTrial(dt); windNow = S.trial.sim.windAt(S.trial.sim.time); }
  } else if (S.mode === 'title' && S.titleSim) {
    scaffold.update(S.titleSim, {});
    animatePerson(dave, S.titleDave, dt, S.t);
    S.titleChav.swing = Math.sin(S.t * 2.2);
    animatePerson(chavMesh(0), S.titleChav, dt, S.t);
  } else if (S.designSim) {
    scaffold.update(S.designSim, {});
  }
  // scenery life
  const wf = Math.min(1.5, Math.abs(windNow) / 40);
  for (const t of trees) {
    if (t.cloud) { t.cloud.position.x += t.cloud.userData.v * dt; if (t.cloud.position.x > 450) t.cloud.position.x = -450; continue; }
    t.crown.rotation.z = Math.sin(S.t * 1.3 + t.ph) * 0.015 * (0.4 + wf * 2) + wf * 0.03;
    t.crown.rotation.x = Math.sin(S.t * 0.9 + t.ph * 2) * 0.01 * (0.4 + wf);
  }
  if (windsock) {
    const droop = Math.max(0, 1 - Math.abs(windNow) / 45);
    windsock.rotation.z = -droop * 1.2 + Math.sin(S.t * 5) * 0.05;
    windsock.rotation.y = Math.sign(windNow || 1) > 0 ? 0 : Math.PI;
    windsock.children.forEach((c, i) => { c.position.z = Math.sin(S.t * 8 + i) * 0.03 * (1 - droop); });
  }
  // shouts fade
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i];
    if (l.group === 'fx' && l.born !== undefined) {
      const age = S.t - l.born;
      l.pos.y += dt * 0.6;
      const life = l.life || 1.4;
      l.el.style.opacity = l.life ? Math.max(0, Math.min(1, (life - age) / 0.5)) : Math.max(0, 1 - age / 1.4);
      if (age > life) { l.el.remove(); labels.splice(i, 1); }
    }
  }
  updateDebris(dt);
  updateGhosts(dt, S.t);
  updatePolice(dt, S.t);
  updateSheila(dt, S.t, S.mode === 'test' && S.trial ? { x: dave.position.x, y: dave.position.y, visible: dave.visible } : null);
  for (const d of tagDecals) { d.t += dt; d.m.material.opacity = Math.min(1, d.t / 0.6); }
  const dk = S.mode === 'test' ? (S.dusk || 0) : 0;
  sun.intensity = 3.3 - 2.0 * dk; sun.color.copy(SUN_DAY).lerp(SUN_DUSK, dk);
  hemi.intensity = 0.38 - 0.18 * dk; renderer.toneMappingExposure = 0.92 - 0.22 * dk;
  updateParticles(dt, windNow, S.L);
  // keep the sun's shadow box on the house
  sun.target.position.set(0, 3, 1);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
  updateLabels();
  renderer.render(scene, camera);
}

// boot
(function boot() {
  const m = /job(\d+)/.exec(location.hash || '');
  if (window.__DEBUG_DESIGN) {
    const { level, pieces, test } = window.__DEBUG_DESIGN;
    window.__proj = (x, y) => { const v = new THREE.Vector3(x, y, Z_OUT); root.localToWorld(v); v.project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
    window.__S = S; window.__brk = () => breakables.filter(b => b.broken).map(b => b.kind); window.__fx = () => [ghosts.length, ragdolls.length, police.state, police.queue.length];
    loadLevel(level);
    if (pieces) { S.pieces = cleanPieces(pieces); afterEdit(); }
    enterDesign();
    frameCamera(S.L, true);
    if (test) setTimeout(() => { S.speed = test; startTest(); }, 50);
  } else if (m && +m[1] >= 1 && +m[1] <= LEVELS.length && unlocked(+m[1] - 1)) {
    loadLevel(+m[1] - 1);
    frameCamera(S.L, true);
    openBrief();
  } else openTitle();
  requestAnimationFrame(frame);
})();
