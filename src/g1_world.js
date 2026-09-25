import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { prepLevel, Trial, Sim, MATS, BOARDS, TIE, BASEPLATE, ITEMS, MAX_LEN, designCost, validatePlacement, checkRequirements, splitTube, pieceCost, PIECE_ANIM, PIECE_SETTLE } from './engine.js';
import { LEVELS } from './levels.js';

// ============================================================================
//  World: renderer, sky, lighting, procedural textures, street scenery.
// ============================================================================
const Z_IN = 0.34, Z_OUT = 1.56, Z_MID = (Z_IN + Z_OUT) / 2;
const STRIP_D = 3.4;          // depth of the paved strip in front of the house
const TUBE_R = 0.03;

const stageEl = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.3, 3000);
camera.position.set(4, 6, 22);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 6;
controls.maxDistance = 48;
controls.minAzimuthAngle = -1.25;
controls.maxAzimuthAngle = 1.25;
controls.enablePan = true;
controls.screenSpacePanning = true;

// ---- sky + sun ----
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(56), THREE.MathUtils.degToRad(34));
function makeSky(scale) {
  const s = new Sky();
  s.scale.setScalar(scale);
  const u = s.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.25;
  u.mieCoefficient.value = 0.0042;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(SUN_DIR);
  return s;
}
const sky = makeSky(2500);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(1000));
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x55603f }));
  g.rotation.x = -Math.PI / 2; g.position.y = -2;
  envScene.add(g);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.5;
}
scene.fog = new THREE.Fog(0xbfd3e3, 70, 330);

const sun = new THREE.DirectionalLight(0xffeccc, 3.3);
sun.position.copy(SUN_DIR).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -17; sun.shadow.camera.right = 17;
sun.shadow.camera.top = 17; sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe2f5, 0x5d6b3e, 0.38);
scene.add(hemi);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ---- procedural textures ----
const rnd = (() => { let s = 1234567; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noiseFill(g, w, h, base, amt, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / (size * size) / 3; i++) {
    const v = (rnd() - 0.5) * amt;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rnd() * w, rnd() * h, size, size);
  }
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

// Brick / stone / render facade: returns {map, bump} covering 2 m x 2 m.
const facadeCache = {};
function facadeTextures(style) {
  if (facadeCache[style]) return facadeCache[style];
  const W = 1024, H = 1024;
  const pal = {
    red: { h: [8, 18], s: [42, 58], l: [30, 44], mortar: '#b9ae9f' },
    yellow: { h: [34, 44], s: [34, 48], l: [55, 68], mortar: '#cfc6b3' },
    stone: { h: [36, 46], s: [10, 20], l: [60, 72], mortar: '#a79f90' },
    render: null,
  }[style];
  let draw, bumpDraw;
  if (!pal) {
    draw = (g) => { noiseFill(g, W, H, '#ece4d4', 0.05, 3); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,110,90,${rnd() * 0.04})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 30 + rnd() * 120, 0, 7); g.fill(); } g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2; for (let y = 0; y < H; y += H / 4) { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(W, y + 1); g.stroke(); } };
    bumpDraw = (g) => { noiseFill(g, W, H, '#808080', 0.25, 2); g.fillStyle = '#6a6a6a'; for (let y = 0; y < H; y += H / 4) g.fillRect(0, y, W, 3); };
  } else {
    const stone = style === 'stone';
    const rows = stone ? 10 : 30, cols = stone ? 5 : 9;
    const bh = H / rows, bw = W / cols, m = stone ? 5 : 4;
    const bricks = [];
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2 + (stone ? (rnd() - 0.5) * bw * 0.3 : 0);
      for (let c = -1; c <= cols; c++) bricks.push({ x: c * bw + off, y: r * bh, w: bw * (stone ? 0.8 + rnd() * 0.5 : 1), h: bh, col: hsl(pal.h[0] + rnd() * (pal.h[1] - pal.h[0]), pal.s[0] + rnd() * (pal.s[1] - pal.s[0]), pal.l[0] + rnd() * (pal.l[1] - pal.l[0])) });
    }
    draw = (g) => {
      noiseFill(g, W, H, pal.mortar, 0.12, 2);
      for (const b of bricks) {
        g.fillStyle = b.col;
        g.fillRect(b.x + m / 2, b.y + m / 2, b.w - m, b.h - m);
        for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.09})`; g.fillRect(b.x + m / 2 + rnd() * (b.w - m - 4), b.y + m / 2 + rnd() * (b.h - m - 3), 2 + rnd() * 6, 1 + rnd() * 3); }
        if (!stone && rnd() < 0.1) { g.fillStyle = 'rgba(20,10,5,.18)'; g.fillRect(b.x + m / 2, b.y + m / 2, b.w - m, b.h - m); }
      }
    };
    bumpDraw = (g) => {
      g.fillStyle = '#303030'; g.fillRect(0, 0, W, H);
      for (const b of bricks) { g.fillStyle = `rgb(${190 + rnd() * 40},${190 + rnd() * 40},${190 + rnd() * 40})`; g.fillRect(b.x + m / 2 + 1, b.y + m / 2 + 1, b.w - m - 2, b.h - m - 2); }
      noiseFill(g, 0, 0, '#000', 0);
    };
  }
  const map = canvasTex(W, H, draw);
  const bump = canvasTex(W, H, bumpDraw, { srgb: false });
  return (facadeCache[style] = { map, bump });
}

const tileTex = canvasTex(512, 512, (g, w, h) => {
  const rows = 16, cols = 8;
  g.fillStyle = '#3b2a22'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * w / cols + (r % 2) * w / cols / 2, y = r * h / rows;
    const l = 26 + rnd() * 12;
    const grd = g.createLinearGradient(0, y, 0, y + h / rows);
    grd.addColorStop(0, hsl(12 + rnd() * 8, 38, l + 8)); grd.addColorStop(1, hsl(12, 40, l - 6));
    g.fillStyle = grd;
    g.beginPath(); g.roundRect(x + 2, y + 1, w / cols - 4, h / rows - 2, [0, 0, 8, 8]); g.fill();
  }
});
const slateTex = canvasTex(512, 512, (g, w, h) => {
  const rows = 18, cols = 7;
  g.fillStyle = '#23272d'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * w / cols + (r % 2) * w / cols / 2, y = r * h / rows;
    g.fillStyle = hsl(215, 8 + rnd() * 6, 24 + rnd() * 10);
    g.fillRect(x + 1.5, y + 1, w / cols - 3, h / rows - 1.5);
  }
});
const grassTex = canvasTex(512, 512, (g, w, h) => {
  noiseFill(g, w, h, '#5d7d34', 0.2, 2);
  for (let i = 0; i < 9000; i++) { g.strokeStyle = hsl(80 + rnd() * 25, 35 + rnd() * 25, 22 + rnd() * 22); g.lineWidth = 1; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5); g.stroke(); }
}, { repeat: [80, 80] });
const mowTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w / 2, h);
}, { srgb: false });
const pavingTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, h);
  const n = 4;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const l = 66 + rnd() * 10;
    g.fillStyle = hsl(38, 8 + rnd() * 6, l);
    g.fillRect(c * w / n + 3, r * h / n + 3, w / n - 6, h / n - 6);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.07})`; g.fillRect(c * w / n + 3 + rnd() * (w / n - 8), r * h / n + 3 + rnd() * (h / n - 8), 2, 2); }
  }
});
const stoneWallTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#6e6a62'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 5; r++) { let x = -rnd() * 40; while (x < w) { const bw = 40 + rnd() * 70; g.fillStyle = hsl(35, 6 + rnd() * 8, 45 + rnd() * 18); g.fillRect(x + 2, r * h / 5 + 2, bw - 4, h / 5 - 4); x += bw; } }
});
const asphaltTex = canvasTex(512, 512, (g, w, h) => noiseFill(g, w, h, '#3d4045', 0.22, 2), { repeat: [60, 4] });
const pavementTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9d9a94'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.fillStyle = hsl(40, 4, 68 + rnd() * 8); g.fillRect(c * 128 + 2, r * 128 + 2, 124, 124); }
}, { repeat: [60, 1] });
const woodTex = canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#c99a58'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${90 + rnd() * 40},${55 + rnd() * 25},${20},${0.15 + rnd() * 0.25})`; g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5); g.stroke(); }
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(80,45,15,.35)'; g.beginPath(); g.ellipse(40 + rnd() * (w - 80), rnd() * h, 5 + rnd() * 5, 2.5, 0, 0, 7); g.fill(); }
  // galvanised nail plates at the ends
  for (const x of [0, w - 20]) { g.fillStyle = '#b8bec3'; g.fillRect(x, 0, 20, h); g.fillStyle = 'rgba(0,0,0,.2)'; for (let k = 4; k < h; k += 12) g.fillRect(x + 8, k, 3, 3); }
}, { aniso: 4 });
const deckTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#8e969d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5c646b';
  for (let x = 8; x < w; x += 14) for (let y = 8; y < h - 4; y += 14) { g.beginPath(); g.arc(x + (y / 14 % 2) * 7, y, 3.2, 0, 7); g.fill(); }
  g.fillStyle = '#f3d40b'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
}, { aniso: 4 });
const softTex = canvasTex(64, 64, (g, w, h) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
const cloudTex = canvasTex(256, 128, (g, w, h) => {
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 16 + rnd() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});
const vanTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#f5f6f3'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff6a13'; g.fillRect(0, h * 0.62, w, h * 0.16);
  g.fillStyle = '#161b21'; g.fillRect(0, h * 0.78, w, h * 0.05);
  g.fillStyle = '#161b21'; g.font = '900 82px "Big Shoulders Stencil Display", Impact, sans-serif'; g.textBaseline = 'middle';
  g.fillText('COWBOY SCAFFOLDERS', 40, h * 0.32);
  g.font = '600 30px "Barlow Condensed", Arial, sans-serif'; g.fillStyle = '#3b444d';
  g.fillText('CASH ONLY  ·  NO VAT  ·  "IT\'LL BE FINE"', 44, h * 0.53);
});
const labelTex = (text, bg = '#f7f7f2', fg = '#1b1f24') => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg; g.font = '700 34px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n'); lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 34));
});

// ---- shared materials ----
const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.34 }),
  heavy: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.45 }),
  coupler: new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.8, roughness: 0.45 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTex, roughness: 0.82 }),
  deck: new THREE.MeshStandardMaterial({ color: 0xffffff, map: deckTex, metalness: 0.6, roughness: 0.5 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.3 }),
  lock: new THREE.MeshStandardMaterial({ color: 0xffffff, map: canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#f3d40b'; g.fillRect(0, 0, w, h); g.fillStyle = '#161b21'; for (let y = -w; y < h; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.lineTo(w, y + w + 12); g.lineTo(0, y + 12); g.fill(); } }), roughness: 0.5, metalness: 0.3 }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.28, depthWrite: false }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.55 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x223040, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.6, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05 }),
  sill: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.6 }),
  gutter: new THREE.MeshStandardMaterial({ color: 0x1f2326, metalness: 0.3, roughness: 0.5 }),
  paving: new THREE.MeshStandardMaterial({ map: pavingTex, roughness: 0.9 }),
  stoneWall: new THREE.MeshStandardMaterial({ map: stoneWallTex, roughness: 0.95 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0xb4583a, roughness: 0.7 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.9, roughness: 0.3 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x15181b, metalness: 0.6, roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4f7a2c, roughness: 0.9, flatShading: true }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0x3f6a26, roughness: 0.9, flatShading: true }),
  bark: new THREE.MeshStandardMaterial({ color: 0x5a4331, roughness: 1 }),
};
const texFromFacade = (style, w, h) => {
  const { map, bump } = facadeTextures(style);
  const m2 = map.clone(), b2 = bump.clone();
  m2.needsUpdate = true; b2.needsUpdate = true;
  m2.repeat.set(w / 2, h / 2); b2.repeat.set(w / 2, h / 2);
  return new THREE.MeshStandardMaterial({ map: m2, bumpMap: b2, bumpScale: style === 'render' ? 0.6 : 2.2, roughness: 0.92 });
};

// ---- static street scenery (built once) ----
const world = new THREE.Group();
scene.add(world);
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = world, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const trees = [];
function makeTree(x, z, s = 1, kind = 0) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 3 * s, 7), M.bark);
  trunk.position.y = 1.5 * s; trunk.castShadow = true; g.add(trunk);
  const crown = new THREE.Group(); crown.position.y = 3 * s; g.add(crown);
  const n = kind ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const r = (kind ? 1.3 : 1.1 + rnd() * 0.7) * s;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rnd() > 0.5 ? M.leaf : M.leaf2);
    b.position.set((rnd() - 0.5) * 1.8 * s, (kind ? i * 1.1 : rnd() * 1.6) * s + 0.6 * s, (rnd() - 0.5) * 1.6 * s);
    if (kind) b.scale.set(1 - i * 0.25, 1.2, 1 - i * 0.25);
    b.castShadow = true; b.receiveShadow = true;
    crown.add(b);
  }
  g.position.set(x, 0, z);
  world.add(g);
  trees.push({ crown, ph: rnd() * 6 });
  return g;
}
{
  // grass (with a hole under the paved strip, filled per level)
  const shape = new THREE.Shape();
  shape.moveTo(-300, -300); shape.lineTo(300, -300); shape.lineTo(300, 300); shape.lineTo(-300, 300); shape.lineTo(-300, -300);
  const hole = new THREE.Path();
  hole.moveTo(-9, 0); hole.lineTo(-9, -STRIP_D); hole.lineTo(9, -STRIP_D); hole.lineTo(9, 0); hole.lineTo(-9, 0);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 7.5, pos.getZ(i) / 7.5);
  const gt = grassTex.clone(); gt.needsUpdate = true; gt.repeat.set(1, 1);
  const lawn = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0xc4cfa8, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
  lawn.receiveShadow = true;
  world.add(lawn);
  // pavement + kerb + road
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(600, 2.4), new THREE.MeshStandardMaterial({ map: pavementTex, roughness: 0.95 }));
  pv.rotation.x = -Math.PI / 2; pv.position.set(0, 0.045, 9.6); pv.receiveShadow = true; world.add(pv);
  box(600, 0.14, 0.18, new THREE.MeshStandardMaterial({ color: 0xa6a39c, roughness: 0.9 }), 0, 0.05, 10.85, world, false);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 9), new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 15.4); road.receiveShadow = true; world.add(road);
  for (let x = -150; x < 150; x += 6) box(3, 0.01, 0.14, new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.8 }), x, 0.03, 15.4, world, false);
  // front garden walls with gap
  const wallMat = texFromFacade('red', 2, 0.6);
  box(9, 0.7, 0.3, wallMat, -9.5, 0.35, 8.1);
  box(9, 0.7, 0.3, wallMat, 9.5, 0.35, 8.1);
  box(9.3, 0.08, 0.36, M.sill, -9.5, 0.74, 8.1); box(9.3, 0.08, 0.36, M.sill, 9.5, 0.74, 8.1);
  // hedges
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3c6b2a, roughness: 1, bumpMap: grassTex, bumpScale: 4 });
  for (const x of [-16, 16]) box(8, 1.6, 1.2, hedgeMat, x, 0.8, 7.2);
  // trees
  makeTree(-17, -6, 1.5); makeTree(-21, 3, 1.2, 1); makeTree(18, -5, 1.6); makeTree(22, 4, 1.1, 1);
  makeTree(-6, -16, 1.8); makeTree(7, -18, 1.7); makeTree(-30, -10, 1.8); makeTree(30, -14, 1.9);
  makeTree(-40, 25, 1.5, 1); makeTree(40, 24, 1.4); makeTree(-14, 26, 1.3); makeTree(16, 27, 1.6, 1);
  // distant hills
  for (let i = 0; i < 9; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(60 + rnd() * 50, 16, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.27, 0.25, 0.32 + rnd() * 0.08), roughness: 1, flatShading: true }));
    h.scale.y = 0.25 + rnd() * 0.15; h.position.set(-300 + i * 75, -8, -230 - rnd() * 60); world.add(h);
  }
  // clouds
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8 + rnd() * 0.2, depthWrite: false, fog: false }));
    s.scale.set(90 + rnd() * 80, 40 + rnd() * 20, 1);
    s.position.set(-400 + rnd() * 800, 70 + rnd() * 70, -350 - rnd() * 150);
    s.userData.v = 1 + rnd() * 2;
    world.add(s);
    trees.push({ cloud: s });
  }
}

// ---- the van + material pile (placed per level) ----
const van = new THREE.Group();
{
  const body = new THREE.MeshStandardMaterial({ color: 0xf5f6f3, roughness: 0.35, metalness: 0.2 });
  const livery = new THREE.MeshStandardMaterial({ map: vanTex, roughness: 0.35, metalness: 0.2 });
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 2.0), [body, body, body, body, livery, livery]);
  cargo.position.set(-0.6, 1.5, 0); cargo.rotation.y = Math.PI / 2; cargo.castShadow = true; cargo.receiveShadow = true;
  // livery on the long sides: rotate so +z face points at camera
  cargo.rotation.y = 0;
  van.add(cargo);
  const cab = box(1.6, 1.6, 2.0, body, 2.3, 1.2, 0, van);
  const win1 = box(0.05, 0.7, 1.8, M.glass, 3.12, 1.55, 0, van, false);
  win1.rotation.z = -0.35;
  box(1.0, 0.65, 0.05, M.glass, 2.25, 1.6, 1.01, van, false);
  box(1.0, 0.65, 0.05, M.glass, 2.25, 1.6, -1.01, van, false);
  box(6.2, 0.3, 2.05, M.dark, 0, 0.45, 0, van);
  for (const [x, z] of [[-2, 1], [-2, -1], [2.3, 1], [2.3, -1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 18), M.dark);
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.4, z * 0.92); w.castShadow = true; van.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 10), M.steel);
    hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); van.add(hub);
  }
  // roof rack with tubes
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.6, 8), M.steel); t.rotation.z = Math.PI / 2; t.position.set(-0.2, 2.68 + (i % 2) * 0.06, -0.6 + i * 0.24); t.castShadow = true; van.add(t); }
  box(0.08, 0.1, 2.0, M.dark, -2.4, 2.62, 0, van); box(0.08, 0.1, 2.0, M.dark, 1.4, 2.62, 0, van);
  // amber beacon
  const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xffa200, emissive: 0xff7a00, emissiveIntensity: 0.6 }));
  bc.position.set(2.3, 2.08, 0); van.add(bc);
  scene.add(van);
}
const pile = new THREE.Group();
{
  for (let i = 0; i < 14; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 8), M.steel); t.rotation.x = Math.PI / 2; t.position.set((i % 5) * 0.07 - 0.14, 0.05 + Math.floor(i / 5) * 0.06, 0); t.castShadow = true; pile.add(t); }
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.038, 3), M.wood); b.position.set(0.7, 0.03 + i * 0.04, 0); b.castShadow = true; b.receiveShadow = true; pile.add(b); }
  for (let i = 0; i < 2; i++) box(0.1, 0.1, 3, M.wood, 0.7 + (i - 0.5) * 0.3, -0.02, 0, pile);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2c4a7a, roughness: 0.9 }));
  bag.scale.y = 0.7; bag.position.set(-0.6, 0.18, 0.9); bag.castShadow = true; pile.add(bag);
  scene.add(pile);
}
