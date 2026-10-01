// Cells section of the Cell and Molecule Explorer: six illustrative 3D cutaways drawn by code (no model files),
// each with tappable parts. Words and colours come from cells.json, so the legend on screen always matches the drawing.
// D3 upgrade: thick cut membranes that show their bilayer edge, double nuclear envelope with pores and chromatin,
// mitochondria cut open to show cristae, stacked Golgi cisternae, rough ER sheets studded with ribosomes, grana inside
// chloroplasts, studio lighting with a soft environment, depth haze and a contact shadow. Gentle life runs in the
// shaders (streaming, beating flagellum, a nerve impulse, Brownian jitter) so it costs almost no CPU, and it stops
// for reduced motion or the pause button. Tapping a part flies the camera to it and fades the rest.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark' || params.get('theme') === 'light') document.documentElement.dataset.theme = params.get('theme');

let DATA = null, UI = {}, CELL = null, PART = null, view = null, overlay = null;

function webglOK() {
  if (params.get('nogl') === '1') return false;
  try { const c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
}

/* ======================= maths and geometry helpers ======================= */
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const CUT = 1.9;                                  // the wedge removed from the front of each cell, in radians
const WHITE = new THREE.Color(1, 1, 1);
const CAMDIR = V(0.38, 0.38, 0.84).normalize();   // roughly where the default camera looks from, so cut organelles face it

function makeNoise(seed) {                         // small 3D value noise for organic surfaces
  const R = rng(seed), p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => R() * 2 - 1);
  const h = (x, y, z) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t) => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = s(x - xi), yf = s(y - yi), zf = s(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  };
}
const NOISE = makeNoise(7);

const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
const shade = (c, k) => { const x = col(c).clone(); return k >= 0 ? x.lerp(WHITE, k) : x.multiplyScalar(1 + k); };
const randDir = (R) => { const v = V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); return v.lengthSq() < 1e-6 ? V(1, 0, 0) : v.normalize(); };
const randIn = (R, r) => { for (;;) { const v = V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (v.lengthSq() <= 1) return v.multiplyScalar(r); } };
const M4 = (p, q, s) => new THREE.Matrix4().compose(p || V(0, 0, 0), q || new THREE.Quaternion(), typeof s === 'number' ? V(s, s, s) : (s || V(1, 1, 1)));
const xf = (g, p, q, s) => g.applyMatrix4(M4(p, q, s));
const randomQuat = (R) => new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU));

function paint(g, c) {
  c = col(c);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// Merge geometries (indexed or not) into one indexed geometry with position, normal, colour and uv.
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3).fill(1), U = new Float32Array(nv * 2), I = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.color) Cc.set(g.attributes.color.array, vo * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) I[io + k] = a[k] + vo; io += a.length; } else { for (let k = 0; k < c; k++) I[io + k] = vo + k; io += c; }
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}
// A surface sampled on a (nu x nv) grid. pos(i, j, u, v, out) places a vertex; color is a colour or a function of the same.
function grid(nu, nv, pos, color) {
  const n = (nu + 1) * (nv + 1), P = new Float32Array(n * 3), Cc = new Float32Array(n * 3), U = new Float32Array(n * 2), I = [];
  const p = V(0, 0, 0), fixed = typeof color === 'function' ? null : col(color);
  let k = 0;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++, k++) {
    const u = i / nu, v = j / nv;
    pos(i, j, u, v, p); P[k * 3] = p.x; P[k * 3 + 1] = p.y; P[k * 3 + 2] = p.z;
    const c = fixed || col(color(i, j, u, v)); Cc[k * 3] = c.r; Cc[k * 3 + 1] = c.g; Cc[k * 3 + 2] = c.b;
    U[k * 2] = u; U[k * 2 + 1] = v;
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
// Shape of revolution about y from a profile [[r, y], ...] listed bottom to top.
function lathe(prof, segs, ph0, phL, warp, color) {
  return grid(segs, prof.length - 1, (i, j, u, v, p) => { const ph = ph0 + u * phL, [r, y] = prof[j]; p.set(r * Math.sin(ph), y, r * Math.cos(ph)); if (warp) warp(p); }, color);
}
// A membrane or wall with real thickness: outer and inner surfaces with the front wedge cut away, plus the two cut
// edges ("lips") coloured across the thickness, so a cell membrane shows its two-layer edge like a textbook cutaway.
function shell(o) {
  const cut = o.cut ?? CUT, segs = o.segs || 64, ph0 = cut / 2, phL = TAU - cut, A = V(0, 0, 0), B = V(0, 0, 0), wIn = o.warpIn || o.warpOut;
  const geos = [lathe(o.out, segs, ph0, phL, o.warpOut, o.cOut), lathe(o.in, segs, ph0, phL, wIn, o.cIn)];
  if (cut > 0 && o.lip) {
    const n = o.out.length - 1, stops = o.lip;
    for (const ph of [ph0, ph0 + phL]) {
      const sn = Math.sin(ph), cs = Math.cos(ph);
      geos.push(grid(n, stops.length - 1, (i, j, u, v, p) => {
        const [r1, y1] = o.out[i], [r2, y2] = o.in[i];
        A.set(r1 * sn, y1, r1 * cs); if (o.warpOut) o.warpOut(A);
        B.set(r2 * sn, y2, r2 * cs); if (wIn) wIn(B);
        p.copy(A).lerp(B, stops[j][0]);
      }, (i, j) => stops[j][1]));
    }
  }
  return mergeGeos(geos);
}
const semi = (r, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const t = -Math.PI / 2 + (i / n) * Math.PI; return [Math.max(1e-4, Math.cos(t) * r), Math.sin(t) * r]; });
function capsule(r, half, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push([Math.max(1e-4, Math.cos(a) * r), -half + Math.sin(a) * r]); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push([Math.max(1e-4, Math.cos(a) * r), half + Math.sin(a) * r]); }
  return pts;
}
// Colour stops across a cut edge: dark head groups on both faces, pale tails in the middle (a phospholipid bilayer).
const bilayer = (hex) => { const h = shade(hex, -0.34), t = shade(hex, 0.62); return [[0, h], [0.2, h], [0.33, t], [0.67, t], [0.8, h], [1, h]]; };
const doubleMem = (hex) => { const d = shade(hex, -0.32), l = shade(hex, 0.5); return [[0, d], [0.26, d], [0.38, l], [0.62, l], [0.74, d], [1, d]]; };

function tube(points, radius, segs = 48, radial = 6, closed = false, taper = null) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, closed);
  if (taper) {
    const P = g.attributes.position, c = V(0, 0, 0), p = V(0, 0, 0);
    for (let i = 0; i <= segs; i++) {
      curve.getPointAt(Math.min(1, i / segs), c); const k = taper(i / segs);
      for (let j = 0; j <= radial; j++) { const idx = i * (radial + 1) + j; p.fromBufferAttribute(P, idx).sub(c).multiplyScalar(k).add(c); P.setXYZ(idx, p.x, p.y, p.z); }
    }
  }
  return g;
}
function lumpy(g, amp, freq, seed = 0) {
  const P = g.attributes.position, p = V(0, 0, 0);
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i);
    const n = NOISE(p.x * freq + seed, p.y * freq, p.z * freq) + 0.5 * NOISE(p.x * freq * 2.3, p.y * freq * 2.3 + seed, p.z * freq * 2.3);
    p.multiplyScalar(1 + amp * n); P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}
// Orientation whose local `axis` ('x' or 'y') follows dir, and whose local +z (the cut-open side) faces the camera.
function faceQuat(dir, axis = 'y', toward = CAMDIR) {
  const a = dir.clone().normalize();
  let z = toward.clone().sub(a.clone().multiplyScalar(toward.dot(a)));
  if (z.lengthSq() < 1e-4) z = Math.abs(a.y) < 0.9 ? V(0, 1, 0).sub(a.clone().multiplyScalar(a.y)) : V(1, 0, 0);
  z.normalize();
  const m = new THREE.Matrix4();
  if (axis === 'y') m.makeBasis(V(0, 0, 0).crossVectors(a, z), a, z); else m.makeBasis(a, V(0, 0, 0).crossVectors(z, a), z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/* ======================= textures and the shared material ======================= */
let BUMP = null;
function bumpTex() {
  if (BUMP) return BUMP;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  const R = rng(4);
  for (let i = 0; i < 700; i++) {
    const x = R() * 128, y = R() * 128, r = 1 + R() * 2.6, v = R() < 0.55 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.07 + R() * 0.12})`;
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, TAU); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 5);
  return (BUMP = t);
}
// Sarcomere bands along a myofibril: light I band with a dark Z line at each end, dark A band with a paler H zone and M line.
function bandTexture(hex, repeat) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), css = (k) => '#' + shade(hex, k).getHexString(THREE.SRGBColorSpace);
  g.fillStyle = css(0.08); g.fillRect(0, 0, 4, 256);
  g.fillStyle = css(-0.5); g.fillRect(0, 72, 4, 112);
  g.fillStyle = css(-0.3); g.fillRect(0, 110, 4, 36);
  g.fillStyle = css(-0.58); g.fillRect(0, 126, 4, 4);
  g.fillStyle = css(-0.7); g.fillRect(0, 0, 4, 3); g.fillRect(0, 253, 4, 3);
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, repeat);
  return t;
}
function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// A soft studio: bright sky, grey horizon, dark floor and three softboxes, turned into a blurred reflection map.
function studioEnv(renderer) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.42, '#cdd8d5'); grd.addColorStop(0.55, '#7f8c8a'); grd.addColorStop(1, '#262e2d');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  const box = (x, y, r, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
  box(64, 30, 34, 1); box(190, 36, 28, 0.75); box(128, 14, 24, 0.9);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(t).texture;
  t.dispose(); pm.dispose();
  return env;
}

const SHARED = { uTime: { value: 0 } };
const VERT_COMMON = `#include <common>
uniform float uTime; uniform vec4 uWave; uniform float uJitter; uniform vec2 uFlow; varying float vLX;`;
const VERT_BEGIN = `#include <begin_vertex>
vLX = position.x;
#ifdef WAVE
{ float wx = position.x - uWave.x; float amp = uWave.y * smoothstep(0.0, uWave.z, wx); float ph = wx * uWave.w - uTime * 7.0;
  transformed.y += amp * sin(ph); transformed.z += amp * cos(ph); }
#endif`;
const VERT_PROJECT = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef JITTER
{ float fi = float(gl_InstanceID); mvPosition.xyz += uJitter * vec3(sin(uTime * 1.7 + fi * 12.9), sin(uTime * 1.3 + fi * 7.13), sin(uTime * 2.1 + fi * 3.71)); }
#endif
#ifdef FLOW
{ float fi = float(gl_InstanceID); float a = uTime * uFlow.x * (0.55 + 0.45 * fract(fi * 0.618)); float c = cos(a), s = sin(a);
  mvPosition.xz = vec2(c * mvPosition.x - s * mvPosition.z, s * mvPosition.x + c * mvPosition.z); mvPosition.y += uFlow.y * sin(uTime * 0.7 + fi); }
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;
const FRAG_COMMON = `#include <common>
uniform float uTime; uniform float uGlow; uniform float uRim; uniform vec3 uPulse; uniform vec3 uPulseCol; varying float vLX;`;
const FRAG_OUT = `{
  float nv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
  float rim = pow(1.0 - nv, 2.4);
  vec3 base = diffuseColor.rgb;
  outgoingLight += (base * 0.75 + vec3(0.1)) * rim * uRim;
  outgoingLight += mix(base, vec3(1.0), 0.55) * (0.16 + 0.95 * rim) * uGlow;
#ifdef PULSE
  float span = uPulse.y - uPulse.x; float px = uPulse.x - 1.0 + fract(uTime / uPulse.z) * (span + 2.0);
  float d = (vLX - px) / 0.3; outgoingLight += uPulseCol * exp(-d * d) * 1.7 * step(0.001, uTime);
#endif
}
#include <opaque_fragment>`;

function cellMat(o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: o.rough ?? 0.5, metalness: 0, side: THREE.DoubleSide,
    transparent: true, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? true, map: o.map || null });
  if (o.bump) { m.bumpMap = bumpTex(); m.bumpScale = o.bumpScale ?? 0.8; }
  if (o.env != null) m.envMapIntensity = o.env;
  const u = m.userData.u = {
    uGlow: { value: 0 }, uRim: { value: o.rim ?? 0.35 }, uWave: { value: new THREE.Vector4(...(o.wave || [0, 0, 1, 1])) }, uJitter: { value: o.jitter || 0 },
    uFlow: { value: new THREE.Vector2(...(o.flow || [0, 0])) }, uPulse: { value: new THREE.Vector3(...(o.pulse || [0, 1, 1])) }, uPulseCol: { value: new THREE.Color(o.pulseCol || '#8ff0ff') },
  };
  m.defines = {};
  for (const k of ['wave', 'jitter', 'flow', 'pulse']) if (o[k]) m.defines[k.toUpperCase()] = '';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, SHARED);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_BEGIN).replace('#include <project_vertex>', VERT_PROJECT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', FRAG_COMMON).replace('#include <opaque_fragment>', FRAG_OUT);
  };
  return m;
}
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });

/* A cell builder returns { group, parts: { id: { objects, anchor } }, extent, zoom, anim, decor } */
function Builder(C) {
  const group = new THREE.Group(), parts = {}, mats = {};
  const b = {
    C, group, parts, zoom: {}, anim: [], decor: [],
    mat(id, o = {}, key = 'base') { const k = id + ':' + key; return mats[k] || (mats[k] = cellMat(o)); },
    add(id, obj, anchor) {
      const p = parts[id] || (parts[id] = { objects: [], anchor: null });
      obj.userData.part = id; obj.traverse((n) => { n.userData.part = id; });
      p.objects.push(obj); group.add(obj);
      if (anchor && !p.anchor) p.anchor = anchor;
      return obj;
    },
    mesh(id, geo, o, key, anchor) { return b.add(id, new THREE.Mesh(geo, b.mat(id, o, key)), anchor); },
    inst(id, geo, list, o, key, anchor) {
      const m = new THREE.InstancedMesh(geo, b.mat(id, o, key), list.length), m4 = new THREE.Matrix4();
      list.forEach((x, i) => { m4.compose(x.p, x.q || new THREE.Quaternion(), x.s ? (typeof x.s === 'number' ? V(x.s, x.s, x.s) : x.s) : V(1, 1, 1)); m.setMatrixAt(i, m4); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
      return b.add(id, m, anchor);
    },
    proxy(id, geo) { const m = new THREE.Mesh(geo, PROXY_MAT); m.userData.proxy = true; return b.add(id, m); },
    // decoration that is not a part of its own (cytoplasm specks): drawn, faded with the rest, never picked
    deco(obj) { obj.raycast = () => {}; b.decor.push(obj); group.add(obj); return obj; },
  };
  return b;
}

/* ---------- shared organelles ---------- */
function nucleus(b, id, c, Rn, R, n = 28) {
  const hex = b.C(id), geos = [];
  const lipEnv = [[0, shade(hex, -0.3)], [0.28, shade(hex, 0.42)], [0.72, shade(hex, 0.42)], [1, shade(hex, -0.3)]];
  // the nuclear envelope is two membranes with a narrow space between them
  geos.push(shell({ out: semi(Rn, n), in: semi(Rn * 0.955, n), cOut: hex, cIn: shade(hex, 0.12), lip: lipEnv, segs: 48 }));
  geos.push(shell({ out: semi(Rn * 0.925, n), in: semi(Rn * 0.885, n), cOut: shade(hex, 0.08), cIn: shade(hex, 0.34), lip: lipEnv, segs: 48 }));
  const torus = new THREE.TorusGeometry(Rn * 0.055, Rn * 0.019, 4, 10), pc = shade(hex, -0.55);
  for (let k = 0, tries = 0; k < 64 && tries < 3000; tries++) {
    const d = randDir(R);
    if (Math.abs(Math.atan2(d.x, d.z)) < CUT / 2 + 0.12) continue;
    geos.push(xf(paint(torus.clone(), pc), d.clone().multiplyScalar(Rn * 1.004), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d))); k++;
  }
  const chc = shade(hex, -0.4);
  for (let k = 0; k < 16; k++) {
    let p = randIn(R, Rn * 0.68); const pts = [p.clone()], dir = randDir(R);
    for (let s = 0; s < 10; s++) {
      dir.add(randDir(R).multiplyScalar(0.9)).normalize();
      p = p.clone().add(dir.clone().multiplyScalar(Rn * 0.15));
      if (p.length() > Rn * 0.8) { p.setLength(Rn * 0.76); dir.negate(); }
      pts.push(p);
    }
    geos.push(paint(tube(pts, Rn * 0.026, 40, 4), chc));
  }
  geos.push(xf(paint(lumpy(new THREE.SphereGeometry(Rn * 0.3, 24, 16), 0.16, 3.2 / Rn, 3), shade(hex, -0.6)), V(Rn * 0.12, -Rn * 0.08, Rn * 0.02)));
  const g = mergeGeos(geos); g.translate(c.x, c.y, c.z);
  b.mesh(id, g, { rough: 0.48, rim: 0.4 }, 'base', c.clone().add(V(Rn * 0.2, Rn * 0.72, Rn * 0.55)));
}
// Rough ER: flattened sacs wrapped around the nucleus, studded with ribosomes on the outside.
function erSheets(b, id, c, r0, n, R, ribos, s = 1) {
  const hex = b.C(id), geos = [];
  for (let k = 0; k < n; k++) {
    const r = r0 + k * 0.15 * s, room = TAU - CUT - 0.5;
    const span = room * (0.5 + R() * 0.35), la = CUT / 2 + 0.25 + R() * (room - span);
    const lc = (R() - 0.5) * 0.7, hh = 0.2 + R() * 0.14, ph = R() * 6;
    const P = (u, v, off, p) => {
      const lon = la + u * span, lat = lc + (v - 0.5) * 2 * hh, edge = Math.min(u * span * r, (1 - u) * span * r, v, 1 - v);
      const rr = r + off * Math.sqrt(Math.min(1, edge * 6)) + 0.06 * s * Math.sin(lon * 6 + ph) + 0.04 * s * Math.sin(lat * 9 + ph);
      return p.set(rr * Math.cos(lat) * Math.sin(lon), rr * Math.sin(lat), rr * Math.cos(lat) * Math.cos(lon)).add(c);
    };
    for (const off of [-0.03 * s, 0.03 * s]) geos.push(grid(40, 6, (i, j, u, v, p) => P(u, v, off, p), shade(hex, off < 0 ? 0.12 : -0.04)));
    const count = Math.round(span * r * 16 / s);
    for (let m = 0; m < count; m++) {
      const u = R(), v = 0.08 + R() * 0.84, side = R() < 0.5 ? -1 : 1;
      ribos.push({ p: P(u, v, side * 0.075 * s, V(0, 0, 0)), q: randomQuat(R), s });
    }
  }
  return geos;
}
function golgi(b, id, pos, s, euler, R) {
  const hex = b.C(id), geos = [], N = 6, h = 0.045 * s, gap = 0.036 * s, k = 0.42 / s;
  for (let i = 0; i < N; i++) {
    const rad = (0.95 - Math.abs(i - 2) * 0.07 - i * 0.03) * s, prof = [];
    for (let q = 0; q <= 22; q++) {
      const a = Math.PI - (q / 22) * Math.PI, sa = Math.sin(a), ca = Math.cos(a);
      const rr = rad * Math.pow(Math.abs(sa), 0.35);
      const yy = h * Math.sign(ca) * Math.pow(Math.abs(ca), 0.35) * (1 + 0.9 * Math.pow(rr / rad, 6));   // swollen rims
      prof.push([Math.max(1e-4, rr), yy]);
    }
    const y0 = (i - (N - 1) / 2) * (2 * h + gap);
    geos.push(lathe(prof, 36, 0, TAU, (p) => { p.y += y0 + 0.5 * k * (p.x * p.x + p.z * p.z); }, shade(hex, 0.34 - i * 0.11)));
  }
  for (let v = 0; v < 12; v++) {
    const a = R() * TAU, rr = (0.82 + R() * 0.32) * s, yy = (R() - 0.5) * N * (2 * h + gap) * 1.3;
    geos.push(xf(paint(new THREE.SphereGeometry((0.06 + R() * 0.03) * s, 10, 8), shade(hex, 0.12)), V(Math.cos(a) * rr, yy + 0.5 * k * rr * rr, Math.sin(a) * rr)));
  }
  const g = mergeGeos(geos); g.applyMatrix4(M4(pos, new THREE.Quaternion().setFromEuler(euler)));
  b.mesh(id, g, { rough: 0.42, rim: 0.45 }, 'base', pos.clone().add(V(0, 0.3 * s, 0.25 * s)));
}
// A mitochondrion cut open lengthwise: outer membrane, inner membrane folded into shelf-like cristae, darker matrix.
function mitoGeo(hex, lo = false) {
  const r = 0.2, half = 0.28, n = lo ? 6 : 10;
  const geos = [shell({ out: capsule(r, half, n), in: capsule(r * 0.84, half, n), cut: Math.PI, segs: lo ? 12 : 20, cOut: hex, cIn: shade(hex, -0.4), lip: doubleMem(hex) })];
  const cr = new THREE.SphereGeometry(1, lo ? 8 : 12, lo ? 5 : 7), K = lo ? 5 : 7;
  for (let k = 0; k < K; k++) {
    const y = -half - r * 0.5 + ((k + 0.5) / K) * (2 * half + r), side = k % 2 ? 1 : -1;
    geos.push(xf(paint(cr.clone(), shade(hex, 0.3)), V(side * r * 0.22, y, -r * 0.3), null, V(r * 0.62, 0.022, r * 0.5)));
  }
  return mergeGeos(geos);
}
// A chloroplast cut in half: double envelope, pale stroma, stacks of thylakoids (grana) joined by lamellae.
function chloroGeo(hex) {
  const sc = (p) => { p.x *= 0.46; p.y *= 0.2; p.z *= 0.3; };
  const geos = [shell({ out: semi(1, 16), in: semi(0.88, 16), warpOut: sc, cut: Math.PI, segs: 24, cOut: hex, cIn: shade(hex, 0.45), lip: doubleMem(hex) })];
  const disc = new THREE.CylinderGeometry(0.056, 0.056, 0.012, 12, 1), gc = shade(hex, -0.38);
  for (const x of [-0.28, -0.16, -0.04, 0.08, 0.2, 0.31]) {
    const nmax = Math.max(2, Math.round(6 * Math.sqrt(1 - (x / 0.42) ** 2)));
    for (let k = 0; k < nmax; k++) geos.push(xf(paint(disc.clone(), gc), V(x, (k - (nmax - 1) / 2) * 0.019, -0.09)));
  }
  for (const y of [-0.028, 0.026]) geos.push(xf(paint(new THREE.BoxGeometry(0.64, 0.005, 0.05), shade(hex, -0.18)), V(0.01, y, -0.09)));
  return mergeGeos(geos);
}
const riboGeo = (hex, s = 1) => mergeGeos([paint(new THREE.IcosahedronGeometry(0.05 * s, 0), shade(hex, 0.12)), xf(paint(new THREE.IcosahedronGeometry(0.036 * s, 0), shade(hex, -0.12)), V(0, 0.048 * s, 0.01 * s))]);
// Tiny specks drifting round the cell: cytoplasmic streaming, done in the vertex shader.
function specks(b, count, accept, R, size = 0.024, speed = 0.09) {
  const list = [];
  for (let t = 0; list.length < count && t < count * 60; t++) { const p = V((R() - 0.5) * 7, (R() - 0.5) * 6, (R() - 0.5) * 7); if (accept(p)) list.push(p); }
  const m = new THREE.InstancedMesh(paint(new THREE.IcosahedronGeometry(size, 0), '#f1e3bf'), cellMat({ rough: 0.7, rim: 0.2, flow: [speed, 0.05] }), list.length), m4 = new THREE.Matrix4();
  list.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); m.setMatrixAt(i, m4); });
  m.frustumCulled = false;
  return b.deco(m);
}

/* ======================= the six cells ======================= */
function buildAnimal(C) {
  const b = Builder(C), R = rng(11), RC = 3, SY = 0.88, memHex = C('membrane');
  const sy = (p) => { p.y *= SY; };
  b.mesh('membrane', shell({ out: semi(RC, 40), in: semi(RC * 0.962, 40), warpOut: sy, cOut: memHex, cIn: shade(memHex, 0.6), lip: bilayer(memHex), segs: 72 }),
    { rough: 0.55, bump: true, rim: 0.5 }, 'base', V(-1.6, 2.2, 1.4));
  b.zoom.membrane = 0.9;
  const nc = V(-0.7, 0.15, -0.6);
  nucleus(b, 'nucleus', nc, 1.05, R);
  b.zoom.nucleus = 0.62;
  const ribos = [];
  const erG = erSheets(b, 'er', nc, 1.24, 4, R, ribos, 1);
  for (let k = 0; k < 6; k++) {          // smooth ER: branching tubes further out
    const d = randDir(R); if (Math.abs(Math.atan2(d.x, d.z)) < CUT / 2) d.x = -d.x - 0.3;
    const pts = [nc.clone().add(d.clone().setLength(1.85))];
    for (let s = 1; s <= 4; s++) pts.push(pts[s - 1].clone().add(randDir(R).multiplyScalar(0.32)).add(d.clone().multiplyScalar(0.12)));
    erG.push(paint(tube(pts, 0.04, 30, 6), shade(C('er'), 0.25)));
  }
  b.mesh('er', mergeGeos(erG), { rough: 0.45, rim: 0.45 }, 'base', V(nc.x - 0.9, nc.y + 1.1, nc.z + 0.6));
  b.zoom.er = 0.7;
  while (ribos.length < 430) {
    const p = V((R() - 0.5) * 5.4, (R() - 0.5) * 4.6, (R() - 0.5) * 5.4);
    if (p.length() > 2.62 || p.distanceTo(nc) < 1.3) continue;
    ribos.push({ p, q: randomQuat(R) });
  }
  b.inst('ribosomes', riboGeo(C('ribosomes')), ribos, { rough: 0.5, rim: 0.25, jitter: 0.012 }, 'base', V(1.2, 1.1, 1.0));
  b.zoom.ribosomes = 0.55;
  golgi(b, 'golgi', V(1.2, -0.55, 0.15), 0.85, new THREE.Euler(1.0, 0.5, 0.15), R);
  b.zoom.golgi = 0.5;
  const mitos = [[1.65, 0.9, -0.5], [0.45, -1.65, 0.55], [1.8, -0.15, 1.05], [-1.45, -1.55, 0.35], [0.25, 1.75, -0.9], [0.95, 0.55, 1.6], [-0.2, -0.9, 1.9]];
  b.inst('mitochondrion', mitoGeo(C('mitochondrion')), mitos.map(([x, y, z]) => ({ p: V(x, y, z), q: faceQuat(randDir(R)), s: 1.35 })), { rough: 0.45, rim: 0.4 }, 'base', V(1.8, 0.2, 1.05));
  b.zoom.mitochondrion = 0.42;
  const lys = [];
  for (const [x, y, z] of [[0.6, -0.95, 1.5], [-0.3, -1.95, -0.6], [1.95, 1.2, 0.45], [-1.6, 0.9, 1.4]]) lys.push(xf(paint(lumpy(new THREE.SphereGeometry(0.2, 20, 14), 0.12, 9, x), C('lysosome')), V(x, y, z)));
  b.mesh('lysosome', mergeGeos(lys), { rough: 0.35, rim: 0.6 }, 'base', V(0.6, -0.75, 1.5));
  b.zoom.lysosome = 0.42;
  // cytoskeleton: microtubules radiating from near the nucleus, with Golgi vesicles carried along them
  const cg = [], curves = [], ckHex = C('cytoskeleton');
  for (let k = 0; k < 22; k++) {
    const th = R() * TAU, ph = Math.acos(2 * R() - 1);
    const dir = V(Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.88, Math.sin(ph) * Math.sin(th));
    const pts = [nc.clone().add(dir.clone().multiplyScalar(1.15))];
    for (let s = 1; s <= 3; s++) pts.push(dir.clone().multiplyScalar(1.15 + s * 0.48).add(V((R() - 0.5) * 0.4, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4)));
    const g = tube(pts, 0.02, 30, 5); cg.push(paint(g, shade(ckHex, 0.15)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5); curves.push(curve);
    b.proxy('cytoskeleton', new THREE.TubeGeometry(curve, 12, 0.07, 4, false));
  }
  b.mesh('cytoskeleton', mergeGeos(cg), { rough: 0.6, rim: 0.3 }, 'base', V(-1.9, -0.9, 1.4));
  b.zoom.cytoskeleton = 0.8;
  const NV = 14, vesM = new THREE.InstancedMesh(paint(new THREE.SphereGeometry(0.075, 12, 9), shade(C('golgi'), 0.15)), b.mat('golgi'), NV), m4 = new THREE.Matrix4(), vp = V(0, 0, 0);
  const ves = Array.from({ length: NV }, (_, i) => ({ c: curves[(i * 3) % curves.length], t0: R(), sp: 0.05 + R() * 0.05 }));
  vesM.boundingSphere = new THREE.Sphere(V(0, 0, 0), 3.2); vesM.frustumCulled = false; vesM.userData.dynamic = true;
  const moveVes = (t) => { ves.forEach((v, i) => { const k = (v.t0 + t * v.sp) % 2, u = k > 1 ? 2 - k : k; v.c.getPointAt(u, vp); m4.makeTranslation(vp.x, vp.y, vp.z); vesM.setMatrixAt(i, m4); }); vesM.instanceMatrix.needsUpdate = true; };
  moveVes(0); b.anim.push(moveVes); b.add('golgi', vesM);
  specks(b, 260, (p) => p.length() < 2.6 && Math.hypot(Math.hypot(p.x, p.z) - 0.92, p.y - 0.15) > 1.2 && Math.hypot(p.x, p.z) < 2.5, R);
  return { ...b, extent: { w: 6.2, h: 5.4, d: 6.2, pad: 1.05 } };
}

function buildPlant(C) {
  const b = Builder(C), R = rng(5), A = 2.6, Bh = 1.8, Cd = 1.7, T = 0.13, cut = 2.15;
  const se = (a, bb, c, e = 7) => (p) => { const d = p.clone().normalize(); const r = Math.pow(Math.abs(d.x / a) ** e + Math.abs(d.y / bb) ** e + Math.abs(d.z / c) ** e, -1 / e); p.copy(d).multiplyScalar(r); };
  const wHex = C('cellwall'), mHex = C('membrane');
  b.mesh('cellwall', shell({ out: semi(1, 44), in: semi(1, 44), warpOut: se(A, Bh, Cd), warpIn: se(A - T, Bh - T, Cd - T), cut, segs: 84, cOut: wHex, cIn: shade(wHex, 0.25),
    lip: [[0, shade(wHex, -0.2)], [0.35, shade(wHex, 0.32)], [0.65, shade(wHex, 0.22)], [1, shade(wHex, 0.02)]] }), { rough: 0.82, bump: true, bumpScale: 1.4, rim: 0.25 }, 'base', V(-A + 0.1, Bh - 0.05, Cd - 0.2));
  b.zoom.cellwall = 0.9;
  const m0 = T + 0.02, m1 = T + 0.058;
  b.mesh('membrane', shell({ out: semi(1, 44), in: semi(1, 44), warpOut: se(A - m0, Bh - m0, Cd - m0), warpIn: se(A - m1, Bh - m1, Cd - m1), cut, segs: 84, cOut: mHex, cIn: shade(mHex, 0.6), lip: bilayer(mHex) }),
    { rough: 0.55, rim: 0.35 }, 'base', V(A - m1 - 0.05, -Bh + m1 + 0.4, Cd - 0.35));
  b.zoom.membrane = 0.8;
  const vg = lumpy(new THREE.SphereGeometry(1, 48, 32), 0.05, 2.2, 9); vg.scale(1.75, 1.12, 1.05); paint(vg, C('vacuole'));
  const vac = b.mesh('vacuole', vg, { rough: 0.12, opacity: 0.36, depthWrite: false, rim: 1.2, env: 1.4 }, 'glass', V(0.6, 0.75, 0.6));
  vac.position.set(0.55, -0.15, -0.25); vac.renderOrder = 2;
  b.zoom.vacuole = 0.85;
  const nc = V(-1.72, 0.55, -0.5);
  nucleus(b, 'nucleus', nc, 0.62, R, 24);
  b.zoom.nucleus = 0.5;
  const ribos = [];
  b.mesh('er', mergeGeos(erSheets(b, 'er', nc, 0.74, 2, R, ribos, 0.62)), { rough: 0.45, rim: 0.45 }, 'base', V(nc.x + 0.3, nc.y + 0.75, nc.z + 0.3));
  b.zoom.er = 0.55;
  while (ribos.length < 220) {
    const p = V((R() - 0.5) * (2 * A - 0.7), (R() - 0.5) * (2 * Bh - 0.7), (R() - 0.5) * (2 * Cd - 0.7));
    const q = p.clone().sub(V(0.55, -0.15, -0.25)); q.x /= 1.85; q.y /= 1.22; q.z /= 1.15;
    if (q.length() < 1 || p.distanceTo(nc) < 0.75) continue;
    ribos.push({ p, q: randomQuat(R), s: 0.9 });
  }
  b.inst('ribosomes', riboGeo(C('ribosomes')), ribos, { rough: 0.5, rim: 0.25, jitter: 0.01 }, 'base', V(-1.9, -1.1, 0.9));
  b.zoom.ribosomes = 0.55;
  // chloroplasts carried round the cell's edge by cytoplasmic streaming
  const loops = [
    new THREE.CatmullRomCurve3([V(-1.95, -1.2, -1.3), V(0, -1.3, -1.32), V(1.95, -1.2, -1.3), V(2.1, 0, -1.3), V(1.95, 1.2, -1.3), V(0, 1.3, -1.32), V(-1.95, 1.2, -1.3), V(-2.1, 0, -1.3)], true),
    new THREE.CatmullRomCurve3([V(-1.95, -1.4, -0.95), V(0, -1.44, -1.05), V(1.95, -1.4, -0.95), V(2.0, -1.4, 0.45), V(1.5, -1.4, 1.15), V(-1.5, -1.4, 1.15), V(-2.0, -1.4, 0.45)], true),
    new THREE.CatmullRomCurve3([V(-2.2, -1.1, -0.9), V(-2.24, 0, -1.0), V(-2.2, 1.1, -0.9), V(-2.2, 1.15, 0.7), V(-2.24, 0, 0.9), V(-2.2, -1.1, 0.7)], true),
  ];
  const chlSpec = [];
  [[0, 6], [1, 5], [2, 3]].forEach(([l, n]) => { for (let i = 0; i < n; i++) chlSpec.push({ c: loops[l], t0: i / n + R() * 0.05, sp: 0.007 + R() * 0.004 }); });
  const chl = new THREE.InstancedMesh(chloroGeo(C('chloroplast')), b.mat('chloroplast', { rough: 0.45, rim: 0.4 }), chlSpec.length), cm4 = new THREE.Matrix4(), cp = V(0, 0, 0), ct = V(0, 0, 0), one = V(1.25, 1.25, 1.25);
  chl.boundingSphere = new THREE.Sphere(V(0, 0, 0), 3.4); chl.frustumCulled = false; chl.userData.dynamic = true;
  const moveChl = (t) => { chlSpec.forEach((s, i) => { const u = (s.t0 + t * s.sp) % 1; s.c.getPointAt(u, cp); s.c.getTangentAt(u, ct); cm4.compose(cp, faceQuat(ct, 'x'), one); chl.setMatrixAt(i, cm4); }); chl.instanceMatrix.needsUpdate = true; };
  moveChl(0); b.anim.push(moveChl); b.add('chloroplast', chl, V(0.4, 1.3, -1.25));
  b.zoom.chloroplast = 0.42;
  b.inst('mitochondrion', mitoGeo(C('mitochondrion')), [[-1.0, -0.65, 1.2], [1.9, 0.6, 1.0], [-2.0, 0.3, 1.15], [1.2, -1.0, 1.25]].map(([x, y, z]) => ({ p: V(x, y, z), q: faceQuat(randDir(R)), s: 1.05 })), { rough: 0.45, rim: 0.4 }, 'base', V(-1.0, -0.4, 1.2));
  b.zoom.mitochondrion = 0.4;
  golgi(b, 'p-golgi', V(-1.3, -0.9, -0.5), 0.52, new THREE.Euler(1.0, 0.6, 0.1), R);
  b.zoom['p-golgi'] = 0.42;
  return { ...b, extent: { w: 2 * A, h: 2 * Bh, d: 2 * Cd, pad: 1.25 } };
}

function buildBacterium(C) {
  const b = Builder(C), R = rng(3), half = 1.7, rot = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2);
  const wHex = C('b-wall'), mHex = C('b-membrane');
  const wall = shell({ out: capsule(1.0, half, 14), in: capsule(0.93, half, 14), segs: 64, cOut: wHex, cIn: shade(wHex, 0.3), lip: [[0, shade(wHex, -0.22)], [0.5, shade(wHex, 0.3)], [1, shade(wHex, 0.05)]] });
  wall.applyQuaternion(rot);
  b.mesh('b-wall', wall, { rough: 0.8, bump: true, bumpScale: 1.2, rim: 0.3 }, 'base', V(-1.8, 0.9, 0.55));
  b.zoom['b-wall'] = 0.85;
  const mem = shell({ out: capsule(0.9, half, 14), in: capsule(0.865, half, 14), segs: 64, cOut: mHex, cIn: shade(mHex, 0.6), lip: bilayer(mHex) });
  mem.applyQuaternion(rot);
  b.mesh('b-membrane', mem, { rough: 0.55, rim: 0.35 }, 'base', V(1.6, -0.6, 0.62));
  b.zoom['b-membrane'] = 0.8;
  const nucG = [];
  for (let loop = 0; loop < 2; loop++) {   // nucleoid: one long, tangled, closed loop of DNA
    const pts = []; let p = V((loop - 0.5) * 0.5, 0, 0); const d = V(1, 0, 0);
    for (let i = 0; i < 130; i++) {
      d.add(randDir(R).multiplyScalar(0.85)).normalize(); p = p.clone().add(d.clone().multiplyScalar(0.12));
      const q = V(p.x / 1.25, p.y / 0.42, p.z / 0.42);
      if (q.length() > 1) { p.multiplyScalar(0.92 / q.length()); d.negate().add(randDir(R).multiplyScalar(0.5)).normalize(); }
      pts.push(p);
    }
    nucG.push(paint(tube(pts, 0.024, 820, 4, true), loop ? shade(C('nucleoid'), 0.15) : C('nucleoid')));
  }
  b.mesh('nucleoid', mergeGeos(nucG), { rough: 0.45, rim: 0.4 }, 'base', V(0.2, 0.3, 0.3));
  b.proxy('nucleoid', xf(new THREE.SphereGeometry(1, 12, 8), V(0, 0, 0), null, V(1.25, 0.42, 0.42)));
  b.zoom.nucleoid = 0.6;
  const ribos = [];
  while (ribos.length < 330) {
    const p = V((R() - 0.5) * 2 * (half + 0.8), (R() - 0.5) * 1.6, (R() - 0.5) * 1.6);
    const ax = Math.max(0, Math.abs(p.x) - half), d = Math.hypot(ax, p.y, p.z);
    if (d > 0.8 || (Math.abs(p.x) < 1.2 && Math.hypot(p.y, p.z) < 0.4)) continue;
    ribos.push({ p, q: randomQuat(R), s: 0.85 });
  }
  b.inst('b-ribosomes', riboGeo(C('b-ribosomes')), ribos, { rough: 0.5, rim: 0.25, jitter: 0.012 }, 'base', V(-1.5, -0.4, 0.5));
  b.zoom['b-ribosomes'] = 0.5;
  const fHex = C('flagellum'), fl = [], x1 = half + 1.25;
  for (const [x, r] of [[half + 0.84, 0.1], [half + 0.92, 0.1], [half + 1.0, 0.08]]) fl.push(xf(paint(new THREE.TorusGeometry(r, 0.026, 6, 18), shade(fHex, -0.25)), V(x, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2)));
  fl.push(paint(tube([V(half + 0.8, 0, 0), V(half + 1.05, 0.03, 0), V(x1, 0, 0)], 0.05, 12, 8), shade(fHex, -0.1)));
  b.mesh('flagellum', mergeGeos(fl), { rough: 0.5, rim: 0.3 }, 'base', V(half + 1.05, 0.2, 0.1));
  b.mesh('flagellum', paint(tube(Array.from({ length: 12 }, (_, i) => V(x1 + i * 0.4, 0, 0)), 0.044, 260, 6), fHex), { rough: 0.45, rim: 0.4, wave: [x1, 0.3, 0.9, TAU / 1.5] }, 'wave');
  b.proxy('flagellum', xf(new THREE.CylinderGeometry(0.38, 0.38, 4.4, 8, 1), V(x1 + 2.2, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2)));
  b.parts.flagellum.anchor = V(x1 + 0.2, 0.05, 0);
  b.zoom.flagellum = 0.6;
  b.group.position.x = -2.3;
  return { ...b, extent: { w: 10.6, h: 2.6, d: 2.2, pad: 1.05, labelPad: 1.12 } };
}

function buildRBC(C) {
  const b = Builder(C), R = rng(17);
  // Biconcave disc: a standard parametric fit of red cell thickness (Evans and Fung, 1972), drawn as a lathe.
  const Rr = 3.0, k = Rr / 3.91, c0 = 0.81, c2 = 7.83, c4 = -4.39, n = 26;
  const halfH = (r) => Math.sqrt(Math.max(0, 1 - r * r)) * (c0 + c2 * r * r + c4 * r ** 4) * k / 2;
  const prof = (scale) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const r = Math.sin((i / n) * Math.PI / 2); pts.push([r * Rr * scale + 1e-4, -halfH(r) * scale]); }
    for (let i = n - 1; i >= 0; i--) { const r = Math.sin((i / n) * Math.PI / 2); pts.push([r * Rr * scale + 1e-4, halfH(r) * scale]); }
    return pts;
  };
  const hex = C('rbc-membrane');
  const cut = 1.35;
  b.mesh('rbc-membrane', shell({ out: prof(1), in: prof(0.95), cut, segs: 80, cOut: hex, cIn: shade(hex, -0.4), lip: bilayer(hex) }), { rough: 0.32, rim: 0.9, bump: true, bumpScale: 0.4 }, 'base', V(-1.9, 0.75, 1.9));
  b.zoom['rbc-membrane'] = 0.85;
  // the inside is packed with hemoglobin: drawn as thousands of small grains that show at the cut faces
  const hb = [];
  for (let t = 0; hb.length < 2600 && t < 90000; t++) {
    const rr = Math.sqrt(R()) * 0.94, a = R() * TAU;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < cut / 2 - 0.01) continue;
    const y = (R() * 2 - 1) * halfH(rr) * 0.84;
    hb.push({ p: V(rr * Rr * Math.sin(a), y, rr * Rr * Math.cos(a)), q: randomQuat(R), s: 0.7 + R() * 0.45 });
  }
  b.inst('rbc-hb', paint(new THREE.IcosahedronGeometry(0.05, 0), C('rbc-hb')), hb, { rough: 0.55, rim: 0.35, jitter: 0.007 }, 'base', V(1.1, 0.5, 1.6));
  b.zoom['rbc-hb'] = 0.5;
  b.group.rotation.set(0.16, 0.95, 0.12);
  return { ...b, extent: { w: 6.2, h: 3.4, d: 6.2, pad: 1.05 } };
}

function buildNeuron(C) {
  const b = Builder(C), R = rng(21), sHex = C('soma');
  const bumpy = (p) => { const nn = NOISE(p.x * 2.4, p.y * 2.4, p.z * 2.4); p.multiplyScalar(1 + 0.07 * nn); p.x *= 1.05; p.y *= 0.95; };
  b.mesh('soma', shell({ out: semi(0.95, 32), in: semi(0.9, 32), warpOut: bumpy, cOut: sHex, cIn: shade(sHex, 0.4), lip: bilayer(sHex), segs: 56 }), { rough: 0.55, bump: true, rim: 0.45 }, 'base', V(-0.55, 0.85, 0.3));
  b.zoom.soma = 0.6;
  nucleus(b, 'nucleus', V(0.05, 0.05, -0.08), 0.42, R, 20);
  b.zoom.nucleus = 0.42;
  const dHex = C('dendrites'), dg = [];
  const dirs = [[-1, 0.7, 0.2], [-1, -0.6, -0.1], [-0.3, 1, -0.3], [-0.2, -1, 0.3], [0.3, 1, 0.4], [-1, 0.05, -0.8], [0.4, -1, -0.4]];
  dirs.forEach((d) => {
    const dir = V(...d).normalize(), start = dir.clone().multiplyScalar(0.7), len = 1.6 + R() * 0.9, pts = [start];
    for (let s = 1; s <= 4; s++) pts.push(dir.clone().multiplyScalar(0.7 + (s / 4) * len).add(V((R() - 0.5) * 0.3, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3)));
    dg.push(paint(tube(pts, 0.15, 36, 8, false, (t) => 1 - 0.78 * t), dHex));
    for (let br = 0; br < 3; br++) {
      const from = pts[1 + br], side = randDir(R).multiplyScalar(0.6);
      const tip = from.clone().add(dir.clone().multiplyScalar(0.55)).add(side), mid = from.clone().lerp(tip, 0.5).add(V(0, (R() - 0.5) * 0.2, 0));
      dg.push(paint(tube([from, mid, tip], 0.07 - br * 0.012, 14, 6, false, (t) => 1 - 0.7 * t), shade(dHex, 0.06)));
    }
  });
  b.mesh('dendrites', mergeGeos(dg), { rough: 0.55, rim: 0.4 }, 'base', V(-2.0, 1.5, 0.4));
  b.zoom.dendrites = 0.7;
  const AX0 = 0.9, AX1 = 7.4, aHex = C('axon'), pulse = { pulse: [0.7, AX1 + 1.2, 2.6] };
  const ax = [];
  ax.push(xf(paint(new THREE.CylinderGeometry(0.105, 0.105, AX1 - AX0, 16, 24), aHex), V((AX0 + AX1) / 2, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2)));
  ax.push(xf(paint(new THREE.CylinderGeometry(0.105, 0.34, 0.6, 16, 6), aHex), V(0.95, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2)));
  b.mesh('axon', mergeGeos(ax), { rough: 0.5, rim: 0.35, ...pulse }, 'base', V(1.4, 0.2, 0.1));
  b.zoom.axon = 0.7;
  // myelin: each segment cut open so its wrapped layers show as stripes at the cut edge
  const myHex = C('myelin'), ra = 0.125, rm = 0.28, L = 0.95, outP = [], inP = [], stripes = [];
  for (let j = 0; j <= 24; j++) {
    const y = -L / 2 + (L * j) / 24, e = Math.min(1, (L / 2 - Math.abs(y)) / 0.14), s = Math.sqrt(Math.max(0, e * (2 - e)));
    outP.push([ra + 0.004 + (rm - ra - 0.004) * s, y]); inP.push([ra, y]);
  }
  for (let k = 0; k < 8; k++) { const c = k % 2 ? shade(myHex, -0.18) : shade(myHex, 0.2); stripes.push([k / 8, c], [(k + 1) / 8, c]); }
  const seg = shell({ out: outP, in: inP, segs: 40, cOut: myHex, cIn: shade(myHex, -0.12), lip: stripes }), my = [];
  for (let x = 1.85; x + 0.95 <= AX1 - 0.4; x += 1.13) my.push(seg.clone().applyMatrix4(M4(V(x + 0.475, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2))));
  b.mesh('myelin', mergeGeos(my), { rough: 0.5, rim: 0.35 }, 'base', V(3.0, 0.3, 0.2));
  b.zoom.myelin = 0.6;
  const tHex = C('terminals'), tg = [];
  for (const [dy, dz] of [[0.7, 0.2], [0.25, -0.5], [-0.35, 0.45], [-0.75, -0.2]]) {
    const a = V(AX1 - 0.1, 0, 0), m = V(AX1 + 0.45, dy * 0.5, dz * 0.5), e = V(AX1 + 1.0, dy, dz);
    tg.push(paint(tube([a, m, e], 0.07, 16, 6, false, (t) => 1 - 0.4 * t), tHex));
    tg.push(xf(paint(lumpy(new THREE.SphereGeometry(0.17, 18, 12), 0.1, 8, dy), shade(tHex, 0.05)), e));
  }
  b.mesh('terminals', mergeGeos(tg), { rough: 0.5, rim: 0.45, ...pulse }, 'base', V(AX1 + 1.0, 0.85, 0.2));
  b.zoom.terminals = 0.55;
  b.group.position.x = -2.9;
  return { ...b, extent: { w: 11.4, h: 5.0, d: 3, pad: 1.0, labelPad: 1.1 } };
}

function buildMuscle(C) {
  const b = Builder(C), R = rng(9), Rc = 1.3, LEN = 6.4, slHex = C('sarcolemma');
  const toX = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2), X = toX;
  const prof = (r) => Array.from({ length: 9 }, (_, i) => [r, -LEN / 2 + (LEN * i) / 8]);
  const sl = shell({ out: prof(Rc), in: prof(Rc * 0.968), cut: 1.7, segs: 72, cOut: slHex, cIn: shade(slHex, 0.45), lip: bilayer(slHex) });
  sl.applyMatrix4(M4(null, toX.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 4))));
  b.mesh('sarcolemma', sl, { rough: 0.5, bump: true, rim: 0.4 }, 'base', V(-2.2, -1.0, 0.85));
  b.zoom.sarcolemma = 0.85;
  const spots = [[0, 0]];
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; spots.push([Math.cos(a) * 0.46, Math.sin(a) * 0.46]); }
  for (let k = 0; k < 12; k++) { const a = Math.PI / 12 + (k * Math.PI) / 6; spots.push([Math.cos(a) * 0.9, Math.sin(a) * 0.9]); }
  const FL = LEN - 0.2, NS = 14, SL = FL / NS;
  b.inst('myofibrils', paint(new THREE.CylinderGeometry(0.19, 0.19, FL, 18, 1), '#ffffff'), spots.map(([y, z]) => ({ p: V(0, y, z), q: X })),
    { rough: 0.45, rim: 0.3, map: bandTexture(C('myofibrils'), NS) }, 'base', V(1.4, 0.55, 0.75));
  b.zoom.myofibrils = 0.55;
  // sarcoplasmic reticulum: a sleeve round each myofibril. Wide rings (terminal cisternae) where the dark and light
  // bands meet, joined by fine tubules over the dark band.
  const srHex = C('sr'), srG = [], ring = paint(new THREE.TorusGeometry(0.218, 0.036, 4, 14), srHex), tub = paint(new THREE.CylinderGeometry(0.014, 0.014, 1, 4, 1), shade(srHex, 0.2));
  for (let s = 0; s < NS; s++) {
    const x0 = -FL / 2 + s * SL, xa = x0 + 0.28 * SL, xb = x0 + 0.72 * SL;
    for (const x of [xa, xb]) srG.push(xf(ring.clone(), V(x, 0, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2)));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + s; srG.push(xf(tub.clone(), V((xa + xb) / 2, Math.cos(a) * 0.212, Math.sin(a) * 0.212), toX, V(1, xb - xa, 1))); }
  }
  const srList = spots.slice(1).map(([y, z]) => ({ p: V(0, y, z) }));
  b.inst('sr', mergeGeos(srG), srList, { rough: 0.4, rim: 0.5 }, 'base', V(-0.75, 0.46 * Math.sin(Math.PI / 3) + 0.25, 0.5));
  b.zoom.sr = 0.42;
  const mlist = [];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; for (let x = -2.4; x <= 2.4; x += 1.6) mlist.push({ p: V(x + 0.4 * (k % 2), Math.cos(a) * 0.64, Math.sin(a) * 0.64), q: faceQuat(V(1, 0, 0)), s: V(0.6, 0.95, 0.6) }); }
  [-0.45, 0, 0.45].forEach((da, k) => { const a = Math.PI / 4 + da; for (let x = -2.5 + k * 0.5; x <= 2.6; x += 1.5) mlist.push({ p: V(x, Math.cos(a) * 1.15, Math.sin(a) * 1.15), q: faceQuat(V(1, 0, 0), 'y', V(0, Math.cos(a), Math.sin(a))), s: V(0.6, 0.95, 0.6) }); });
  b.inst('m-mito', paint(lumpy(new THREE.CapsuleGeometry(0.2, 0.56, 5, 12), 0.06, 9, 2), C('m-mito')), mlist, { rough: 0.45, rim: 0.4 }, 'base', V(0.8, Math.cos(Math.PI / 6) * 0.62 + 0.2, Math.sin(Math.PI / 6) * 0.62 + 0.3));
  b.zoom['m-mito'] = 0.4;
  const nHex = C('m-nuclei'), ng = [];
  for (const [x, a] of [[-2.3, -0.66], [-0.4, 1.16], [1.2, -0.62], [2.5, 1.2], [-1.4, Math.PI * 1.1], [0.6, Math.PI * 1.45]]) {
    const g = lumpy(new THREE.SphereGeometry(1, 28, 16), 0.05, 2.5, x);
    const cc = g.attributes.position, cl = new Float32Array(cc.count * 3), dark = shade(nHex, -0.45), base = col(nHex), tmp = new THREE.Color();
    for (let i = 0; i < cc.count; i++) { const t = clamp(NOISE(cc.getX(i) * 4 + x, cc.getY(i) * 4, cc.getZ(i) * 4) * 2.2, 0, 1); tmp.copy(base).lerp(dark, t); cl.set([tmp.r, tmp.g, tmp.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.applyMatrix4(M4(V(x, Math.cos(a) * 1.15, Math.sin(a) * 1.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, 0)), V(0.5, 0.13, 0.2)));
    ng.push(g);
  }
  b.mesh('m-nuclei', mergeGeos(ng), { rough: 0.5, rim: 0.4 }, 'base', V(-0.4, Math.cos(1.16) * 1.16, Math.sin(1.16) * 1.16));
  b.zoom['m-nuclei'] = 0.45;
  return { ...b, extent: { w: LEN + 0.2, h: 2.8, d: 2.8, pad: 1.05, labelPad: 1.2 } };
}

const BUILDERS = { animal: buildAnimal, plant: buildPlant, bacterium: buildBacterium, rbc: buildRBC, neuron: buildNeuron, muscle: buildMuscle };

/* ======================= the 3D view ======================= */
function createView(canvas, wrap, colorOf) {
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  scene.add(camera);
  scene.environment = studioEnv(renderer); scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a98, 0.9));
  const head = new THREE.DirectionalLight(0xffffff, 1.9); head.position.set(1.0, 1.25, 0.9); camera.add(head, head.target); head.target.position.set(0, 0, -1);
  const back = new THREE.DirectionalLight(0xe4f6ff, 1.3); back.position.set(-4, 5, -6); scene.add(back);
  scene.fog = new THREE.Fog(0xdde6e3, 10, 40);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, enablePan: false, rotateSpeed: 0.7, zoomSpeed: 0.8 });
  const SH_TEX = shadowTex();

  const cache = {};
  let cur = null, raf = 0, dirty = true, interacting = false, settleUntil = 0, swayStart = 0, userMoved = false, paused = false, labelsWide = false;
  let width = 1, height = 1, restDist = 12, selected = null, hovered = null, frames = 0, tapHit = null, selAnchor = null, fly = null, lastT = 0, viewMoved = true;
  let onFrame = null, onFlyEnd = null, needAll = false;
  const anchors = {}, anchorScr = {};
  let anchorQueue = [];
  const lifeOn = () => !paused && !reduceMotion() && !document.hidden;

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    scene.fog.color.set((cs.getPropertyValue('--fog') || '#dde6e3').trim());
    const so = parseFloat(cs.getPropertyValue('--shadow3d-o')) || 0.3;
    for (const c of Object.values(cache)) c.shadow.material.opacity = so;
    invalidate();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  document.addEventListener('cme:theme', () => requestAnimationFrame(readTheme)); // the app shell's theme button

  // Fewer draw calls: within each part, plain meshes that share a material are baked into one mesh.
  function mergeParts(c) {
    c.group.updateMatrixWorld(true);
    const inv = c.group.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
    for (const [pid, p] of Object.entries(c.parts)) {
      const byMat = new Map(), made = [];
      for (const o of p.objects) o.traverse((n) => {
        if (n.isMesh && !n.isInstancedMesh && n.renderOrder === 0 && !n.userData.proxy) { if (!byMat.has(n.material)) byMat.set(n.material, []); byMat.get(n.material).push(n); }
      });
      for (const [material, meshes] of byMat) {
        const geos = meshes.map((n) => { rel.multiplyMatrices(inv, n.matrixWorld); const g = n.geometry.clone().applyMatrix4(rel); n.parent.remove(n); return g; });
        const merged = new THREE.Mesh(mergeGeos(geos), material); merged.userData.part = pid; c.group.add(merged); made.push(merged);
      }
      p.objects = p.objects.filter((o) => o.parent && (o.isMesh || o.children.length)).concat(made);
    }
  }
  function get(id) {
    if (cache[id]) return cache[id];
    const c = BUILDERS[id]((k) => colorOf(k));
    mergeParts(c);
    c.mats = {};
    for (const [pid, p] of Object.entries(c.parts)) {
      const set = new Set();
      for (const o of p.objects) o.traverse((n) => { if (n.material && !n.userData.proxy) set.add(n.material); });
      c.mats[pid] = [...set].map((m) => ({ m, opacity: m.opacity, depthWrite: m.depthWrite, fade: 1, glow: 0 }));
      for (const o of p.objects) o.userData.ro = o.renderOrder;
    }
    c.decorMats = c.decor.map((o) => ({ m: o.material, opacity: o.material.opacity, depthWrite: o.material.depthWrite, fade: 1, glow: 0 }));
    c.spin = new THREE.Group(); c.spin.add(c.group); c.spin.visible = false; scene.add(c.spin);
    const e = c.extent, sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: SH_TEX, color: 0x0a1f1c, transparent: true, depthWrite: false, fog: false, opacity: 0.3 }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(e.w * 1.05, e.d * 1.05, 1); sh.position.y = -e.h / 2 - 0.45; sh.renderOrder = -1; sh.raycast = () => {};
    c.shadow = sh; c.spin.add(sh);
    c.radius = Math.max(e.h, e.d) / 2 * 1.1;
    cache[id] = c; readTheme();
    return c;
  }
  function fitDistance(ext) {
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), pad = (ext.pad || 1.1) * (labelsWide ? (ext.labelPad || 1.32) : 1);
    return Math.max((ext.h / 2) / Math.tan(vf / 2), (ext.w / 2) / Math.tan(hf / 2)) * pad + ext.d / 2;
  }
  const AZ = 0.42, POL = 1.18;
  const homePos = (dist) => V(dist * Math.sin(POL) * Math.sin(AZ), dist * Math.cos(POL), dist * Math.sin(POL) * Math.cos(AZ));
  function place(dist) { camera.position.copy(homePos(dist)); controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0); viewMoved = true; }
  function limits(dist) { restDist = dist; controls.minDistance = dist * 0.22; controls.maxDistance = dist * 1.6; }
  function resize() {
    const r = wrap.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width)); height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if (cur) { const d = fitDistance(cache[cur].extent), k = camera.position.distanceTo(controls.target) / restDist; limits(d); if (!selected) camera.position.sub(controls.target).setLength(d * clamp(k, 0.22, 1.6)).add(controls.target); }
    viewMoved = true; invalidate();
  }
  new ResizeObserver(resize).observe(wrap);

  /* ---------- anchors: where a part's label points ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _m = new THREE.Matrix4(), _v = V(0, 0, 0);
  function partOfObject(o) { while (o && !o.userData.part) o = o.parent; return o ? o.userData.part : null; }
  function anchorFromHit(h) {
    const o = h.object;
    if (o.isInstancedMesh && o.userData.dynamic && h.instanceId != null) {   // a moving part: follow that one instance
      o.getMatrixAt(h.instanceId, _m); const inv = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, _m).invert();
      return { mesh: o, i: h.instanceId, pt: h.point.clone().applyMatrix4(inv) };
    }
    return { local: cache[cur].group.worldToLocal(h.point.clone()) };
  }
  function anchorWorld(a, out = V(0, 0, 0)) {
    if (a.mesh) { a.mesh.getMatrixAt(a.i, _m); return out.copy(a.pt).applyMatrix4(_m).applyMatrix4(a.mesh.matrixWorld); }
    return cache[cur].group.localToWorld(out.copy(a.local));
  }
  // A point on the part that the camera can actually see (a ray to it hits that part first), nearest the middle.
  function findAnchor(pid) {
    const c = cache[cur], p = c.parts[pid];
    c.spin.updateMatrixWorld(true); camera.updateMatrixWorld();
    const cands = [];
    for (const o of p.objects) o.traverse((n) => {
      if (!n.isMesh || n.userData.proxy) return;
      if (n.isInstancedMesh) {
        const step = Math.max(1, Math.floor(n.count / 24));
        // instance centres can sit inside other parts (the SR wraps a myofibril), so sample surface vertices too
        const pos = n.geometry.attributes.position, vs = Math.max(1, Math.floor(pos.count / (n.count > 60 ? 1 : 12)));
        for (let i = 0; i < n.count; i += step) {
          n.getMatrixAt(i, _m); cands.push(V(0, 0, 0).applyMatrix4(_m).applyMatrix4(n.matrixWorld));
          if (n.count <= 60) for (let j = 0; j < pos.count; j += vs) cands.push(V(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(_m).applyMatrix4(n.matrixWorld));
        }
      } else {
        const pos = n.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 40));
        for (let i = 0; i < pos.count; i += step) cands.push(V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(n.matrixWorld));
      }
    });
    let best = null, bestScore = -Infinity, bestS = null;
    const taken = Object.values(anchorScr);
    for (const w of cands) {
      const s = w.clone().project(camera);
      if (s.z > 1 || Math.abs(s.x) > 0.85 || Math.abs(s.y) > 0.8) continue;
      ray.setFromCamera(new THREE.Vector2(s.x, s.y), camera);
      const hits = ray.intersectObject(c.group, true);
      const h = hits.find((x) => !x.object.userData.proxy);
      if (!h || partOfObject(h.object) !== pid) continue;
      // near the middle, but spread away from anchors already placed so leaders do not share a point
      let dmin = 0.4;
      for (const t of taken) dmin = Math.min(dmin, Math.hypot(t[0] - s.x, t[1] - s.y));
      const score = -(s.x * s.x + s.y * s.y) * 0.5 + dmin * 2.5;
      if (score > bestScore) { bestScore = score; best = h; bestS = [s.x, s.y]; }
    }
    if (best) anchorScr[pid] = bestS;
    return best ? anchorFromHit(best) : null;
  }
  const anchorFor = (pid) => anchors[pid] || (anchors[pid] = findAnchor(pid) || { local: cache[cur].parts[pid].anchor || V(0, 0, 0) });
  function queueAnchors() { for (const k of Object.keys(anchors)) delete anchors[k]; for (const k of Object.keys(anchorScr)) delete anchorScr[k]; anchorQueue = needAll && cur ? Object.keys(cache[cur].parts) : []; invalidate(); }

  function emitFrame() {
    if (!onFrame || !cur) return;
    const c = cache[cur], list = [];
    const want = needAll ? Object.keys(c.parts) : (selected ? [selected] : []);
    for (const pid of want) {
      const a = pid === selected && selAnchor ? selAnchor : anchors[pid];
      if (!a) continue;
      const v = anchorWorld(a).project(camera);
      list.push({ pid, x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, on: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 });
    }
    const o = V(0, 0, 0).project(camera), d = camera.position.length(), th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const e = c.extent;
    onFrame({ anchors: list, cx: (o.x * 0.5 + 0.5) * width, cy: (-o.y * 0.5 + 0.5) * height, rx: (e.w / 2) / (d * th * camera.aspect) * width / 2, ry: (Math.max(e.h, e.d * 0.6) / 2) / (d * th) * height / 2, w: width, h: height, selected });
  }

  /* ---------- the frame loop ---------- */
  function invalidate() { dirty = true; if (!raf) raf = requestAnimationFrame(tick); }
  let spinner = null;
  function easeSelection(dt) {
    const c = cache[cur], k = reduceMotion() ? 1 : 1 - Math.exp(-dt * 9), t = SHARED.uTime.value;
    let busy = false;
    const step = (r, tf, tg) => {
      r.fade += (tf - r.fade) * k; r.glow += (tg - r.glow) * k;
      if (Math.abs(tf - r.fade) < 0.003) r.fade = tf;
      if (Math.abs(tg - r.glow) < 0.003) r.glow = tg; else busy = true;
      if (r.fade !== tf) busy = true;
      r.m.opacity = r.opacity * r.fade; r.m.depthWrite = r.depthWrite && r.fade > 0.97;
      if (r.m.userData.u) r.m.userData.u.uGlow.value = r.glow;
    };
    for (const [pid, list] of Object.entries(c.mats)) {
      const on = selected === pid, tf = selected && !on ? 0.1 : 1;
      const tg = on ? 0.5 + (lifeOn() ? 0.14 * Math.sin(t * 2.6) : 0) : hovered === pid ? 0.42 : 0;
      for (const r of list) step(r, tf, tg);
    }
    for (const r of c.decorMats) step(r, selected ? 0.1 : 1, 0);
    return busy;
  }
  function updateFog() {
    const c = cache[cur]; if (!c) return;
    const d = camera.position.distanceTo(controls.target);
    scene.fog.near = Math.max(0.1, d - c.radius * 0.4); scene.fog.far = d + c.radius * 3.4;
  }
  function stepFly(t) {
    const k = clamp((t - fly.t0) / fly.ms, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    controls.target.lerpVectors(fly.fT, fly.toT, e); camera.position.lerpVectors(fly.fP, fly.toP, e); camera.lookAt(controls.target);
    if (k >= 1) { fly = null; if (onFlyEnd) onFlyEnd(); }
  }
  function tick(t) {
    raf = 0;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016; lastT = t;
    let more = false;
    if (spinner) { if (spinner(t) !== false) { more = true; viewMoved = true; } else spinner = null; }
    if (fly) { stepFly(t); more = true; viewMoved = true; }
    if (controls.update()) viewMoved = true;
    if (interacting || t < settleUntil) more = true;
    const live = !!cur && lifeOn();
    if (live && !userMoved && !selected) { cache[cur].spin.rotation.y = 0.24 * Math.sin((t - swayStart) * 0.00035); viewMoved = true; }
    if (live) { SHARED.uTime.value += dt; for (const f of cache[cur].anim) f(SHARED.uTime.value); more = true; dirty = true; }
    if (cur && easeSelection(dt)) { more = true; dirty = true; }
    if (anchorQueue.length) { const pid = anchorQueue.shift(); if (cache[cur].parts[pid] && !anchors[pid]) anchorFor(pid); more = true; viewMoved = true; }
    if (viewMoved) dirty = true;
    if (dirty && cur) { updateFog(); renderer.render(scene, camera); frames++; dirty = false; }
    if (viewMoved || (live && (needAll || selAnchor))) { emitFrame(); viewMoved = false; }
    if (more) raf = requestAnimationFrame(tick); else lastT = 0;
  }
  document.addEventListener('visibilitychange', () => { lastT = 0; invalidate(); });
  const stopSway = () => { userMoved = true; };
  let reAnchor = 0;
  controls.addEventListener('start', () => { interacting = true; fly = null; stopSway(); invalidate(); });
  controls.addEventListener('end', () => {
    interacting = false; settleUntil = performance.now() + 900; invalidate();
    clearTimeout(reAnchor); if (needAll) reAnchor = setTimeout(queueAnchors, 950);   // labels follow what is visible after a turn
  });
  controls.addEventListener('change', () => { viewMoved = true; dirty = true; });

  function flyPose(toT, toP, ms = 950) {
    if (reduceMotion() || ms <= 0) { controls.target.copy(toT); camera.position.copy(toP); camera.lookAt(toT); fly = null; viewMoved = true; invalidate(); if (onFlyEnd) onFlyEnd(); return; }
    fly = { t0: performance.now(), ms, fT: controls.target.clone(), fP: camera.position.clone(), toT: toT.clone(), toP: toP.clone() };
    invalidate();
  }
  function flyTo(target, dist) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    flyPose(target, target.clone().add(dir.multiplyScalar(dist)));
  }

  /* ---------- picking and hover ---------- */
  function hit(clientX, clientY) {
    if (!cur) return null;
    camera.updateMatrixWorld(); cache[cur].spin.updateMatrixWorld(true);
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(cache[cur].group, true), found = [];
    for (const h of hits) { const pid = partOfObject(h.object); if (pid) found.push({ pid, h, proxy: !!h.object.userData.proxy }); }
    if (!found.length) return null;
    if (selected) { const keep = found.find((f) => f.pid === selected && !f.proxy); if (keep) return keep; }   // a tap on the chosen part keeps it, through faded parts
    const real = found.find((f) => !f.proxy);
    return found[0].proxy && real && real.h.distance - found[0].h.distance < 0.25 ? real : (real && !found[0].proxy ? real : found[0]);
  }
  let down = null, pickCb = null, hoverCb = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved < 8 && dt < 600 && pickCb) {
      const f = hit(e.clientX, e.clientY);
      tapHit = f && !f.proxy ? { pid: f.pid, h: f.h } : null;
      pickCb(f ? f.pid : null);
    }
  });
  let hoverT = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now(); if (now - hoverT < 50) return; hoverT = now;
    const f = hit(e.clientX, e.clientY), pid = f ? f.pid : null;
    wrap.classList.toggle('picky', !!pid);
    if (pid !== hovered) { hovered = pid; invalidate(); }
    if (hoverCb) { const r = wrap.getBoundingClientRect(); hoverCb(pid, e.clientX - r.left, e.clientY - r.top); }
  });
  canvas.addEventListener('pointerleave', () => { if (hovered) { hovered = null; invalidate(); } wrap.classList.remove('picky'); if (hoverCb) hoverCb(null); });

  function setRenderOrder() {
    const c = cache[cur];
    for (const [pid, p] of Object.entries(c.parts)) for (const o of p.objects) o.renderOrder = pid === selected ? 3 : o.userData.ro || 0;
  }

  return {
    show(id) {
      const c = get(id);
      for (const [k, o] of Object.entries(cache)) o.spin.visible = k === id;
      c.spin.rotation.y = 0;
      cur = id; selected = null; selAnchor = null; tapHit = null; hovered = null; fly = null;
      for (const list of Object.values(c.mats)) for (const r of list) { r.fade = 1; r.glow = 0; }
      for (const r of c.decorMats) r.fade = 1;
      setRenderOrder();
      const d = fitDistance(c.extent); limits(d); place(d);
      userMoved = false; swayStart = performance.now();
      queueAnchors(); invalidate();
    },
    select(pid) {
      if (!cur) return;
      const c = cache[cur], prev = selected;
      selected = pid || null;
      if (!selected && !prev) { selAnchor = null; tapHit = null; setRenderOrder(); viewMoved = true; invalidate(); return; }
      if (selected) {
        stopSway();
        c.spin.updateMatrixWorld(true);
        selAnchor = tapHit && tapHit.pid === selected ? anchorFromHit(tapHit.h) : anchorFor(selected);
        const zoom = c.zoom[selected] ?? 0.62, w = anchorWorld(selAnchor);
        flyTo(zoom >= 0.8 ? w.multiplyScalar(0.35) : w, restDist * zoom);
      } else {
        selAnchor = null;
        flyTo(V(0, 0, 0), restDist);
      }
      tapHit = null; setRenderOrder(); viewMoved = true; invalidate();
    },
    hover(pid) { if (pid !== hovered) { hovered = pid || null; invalidate(); } },
    onPick(fn) { pickCb = fn; },
    onHover(fn) { hoverCb = fn; },
    onFrame(fn) { onFrame = fn; viewMoved = true; invalidate(); },
    setLabels(all, wide) {
      needAll = !!all; const was = labelsWide; labelsWide = !!(all && wide);
      if (cur && was !== labelsWide) { const d = fitDistance(cache[cur].extent); limits(d); if (!selected) flyPose(V(0, 0, 0), camera.position.clone().sub(controls.target).setLength(d)); }
      queueAnchors(); viewMoved = true; invalidate();
    },
    setPaused(p) { paused = !!p; lastT = 0; invalidate(); },
    reset() { if (!cur) return; const d = fitDistance(cache[cur].extent); limits(d); stopSway(); cache[cur].spin.rotation.y = 0; flyPose(V(0, 0, 0), homePos(d)); if (needAll) setTimeout(queueAnchors, reduceMotion() ? 0 : 1000); },
    nudge(dAz, dPol) {
      stopSway(); fly = null;
      const off = camera.position.clone().sub(controls.target), s = new THREE.Spherical().setFromVector3(off);
      s.theta += dAz; s.phi = clamp(s.phi + dPol, 0.15, Math.PI - 0.15);
      camera.position.setFromSpherical(s).add(controls.target); camera.lookAt(controls.target); viewMoved = true; invalidate();
    },
    zoomBy(f) { stopSway(); fly = null; const off = camera.position.clone().sub(controls.target); off.setLength(clamp(off.length() * f, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(off); viewMoved = true; invalidate(); },
    // test hook: orbit continuously for ms and report rendered frames per second
    measure(ms = 3000) {
      return new Promise((res) => {
        stopSway(); const f0 = frames; let t0 = 0;
        spinner = (t) => { if (!t0) t0 = t; const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(V(0, 1, 0), 0.01); camera.position.copy(controls.target).add(off); camera.lookAt(controls.target); if (t - t0 >= ms) { res({ fps: Math.round(((frames - f0) / ((t - t0) / 1000)) * 10) / 10, pixelRatio: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, lowEnd }); return false; } return true; };
        invalidate();
      });
    },
    screenPoint(pid) {   // test hook: where a part's visible anchor sits on screen
      const c = cache[cur]; if (!c || !c.parts[pid]) return null;
      const a = findAnchor(pid); if (!a) return null;
      const v = anchorWorld(a).project(camera), r = canvas.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },
    hitAt: (x, y) => { const f = hit(x, y); return f && f.pid; },
    busy: () => !!fly || anchorQueue.length > 0,
    setFlyEnd(fn) { onFlyEnd = fn; },
  };
}

/* ======================= labels over the 3D view ======================= */
function createOverlay(stage) {
  const svg = $('#leaders'), box = $('#callouts'), tip = $('#hovertip');
  let items = {}, last = null, cardW = 0;
  const wideNow = () => stage.getBoundingClientRect().width >= 640;
  function build() {
    box.replaceChildren(); svg.replaceChildren(); items = {};
    CELL.parts.forEach((pid, i) => {
      const p = partOf(pid);
      const label = el('div', { class: 'co', 'data-part': pid, onclick: (e) => { e.stopPropagation(); choosePart(pid === PART ? null : pid, false); } },
        el('span', { class: 'cdot', style: 'background:' + p.swatch }), el('span', { class: 'cname', text: p.name }));
      const pin = el('div', { class: 'pin', 'data-part': pid, style: '--sw:' + p.swatch, text: String(i + 1), onclick: (e) => { e.stopPropagation(); choosePart(pid === PART ? null : pid, false); } });
      const line = svgEl('path', { class: 'lead' }), dot = svgEl('circle', { class: 'ldot', r: '4' });
      box.append(label, pin); svg.append(line, dot);
      items[pid] = { label, pin, line, dot, idx: i };
    });
    const card = el('div', { class: 'co sel', id: 'selCard' },
      el('span', { class: 'cdot', id: 'selDot' }), el('span', { class: 'cname', id: 'selName' }),
      el('a', { class: 'chip', id: 'selMol', href: '#', hidden: '' }));
    card.addEventListener('click', (e) => { if (e.target.closest('a')) return; e.stopPropagation(); });
    box.append(card); items._card = card;
    const line = svgEl('path', { class: 'lead sel' }), dot = svgEl('circle', { class: 'ldot sel', r: '5' });
    svg.append(line, dot); items._line = line; items._dot = dot;
    refreshCard();
  }
  function refreshCard() {
    const card = items._card; if (!card) return;
    if (!PART) { card.hidden = true; return; }
    const p = partOf(PART);
    $('#selDot').style.background = p.swatch; $('#selName').textContent = p.name;
    const m = $('#selMol');
    if (p.molecule) { m.hidden = false; m.href = '../molecules/#' + p.molecule; m.textContent = (UI.moleculeChip || 'Molecule: {name}').replace('{name}', p.moleculeName || p.molecule); } else m.hidden = true;
    card.hidden = false; cardW = 0;
  }
  const hide = (n) => { if (!n.hidden) n.hidden = true; };
  const show = (n) => { if (n.hidden) n.hidden = false; };
  function frame(f) {
    last = f;
    const mode = labelsOn ? (wideNow() ? 'callouts' : 'pins') : 'none', on = new Set();
    for (const [pid, it] of Object.entries(items)) {
      if (pid.startsWith('_')) continue;
      hide(it.label); hide(it.pin); it.line.style.display = 'none'; it.dot.style.display = 'none';
    }
    const card = items._card, sl = items._line, sd = items._dot;
    sl.style.display = 'none'; sd.style.display = 'none';
    if (f.selected) {
      hide(card);
      const a = f.anchors.find((x) => x.pid === f.selected);
      if (a && a.on) {
        show(card); if (!cardW) cardW = card.offsetWidth || 160;
        const right = a.x < f.w * 0.62, gap = 54;
        let lx = right ? a.x + gap : a.x - gap; lx = right ? Math.min(lx, f.w - cardW - 10) : Math.max(lx, cardW + 10);
        const ly = clamp(a.y - 46, 64, f.h - 40);
        card.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px) translate(${right ? 0 : -100}%, -50%)`;
        sl.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${(lx + (right ? -14 : 14)).toFixed(1)} ${ly.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)}`);
        sd.setAttribute('cx', a.x.toFixed(1)); sd.setAttribute('cy', a.y.toFixed(1));
        sl.style.display = ''; sd.style.display = '';
      }
      return;
    }
    hide(card);
    if (mode === 'none') return;
    const vis = f.anchors.filter((a) => a.on && items[a.pid]);
    if (mode === 'pins') {
      for (const a of vis) { const it = items[a.pid]; show(it.pin); it.pin.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -50%)`; }
      return;
    }
    // callouts: labels outside the cell's outline, left or right of it, pushed apart so they never overlap
    const sides = { L: [], R: [] };
    for (const a of vis) {
      let dx = a.x - f.cx, dy = a.y - f.cy; const len = Math.hypot(dx / Math.max(1, f.rx), dy / Math.max(1, f.ry)) || 1;
      dx /= len; dy /= len;
      const side = a.x < f.cx ? 'L' : 'R';
      sides[side].push({ a, ey: f.cy + dy * 1.08 + (a.y - f.cy) * 0.15, side });
    }
    for (const s of ['L', 'R']) {
      const list = sides[s].sort((p, q) => p.ey - q.ey), gapY = 30, top = 62, bot = f.h - 44;
      for (let i = 0; i < list.length; i++) list[i].ey = Math.max(list[i].ey, i ? list[i - 1].ey + gapY : top);
      const over = list.length ? list[list.length - 1].ey - bot : 0;
      if (over > 0) for (let i = list.length - 1; i >= 0; i--) list[i].ey = Math.min(list[i].ey - (i === list.length - 1 ? over : 0), i < list.length - 1 ? list[i + 1].ey - gapY : Infinity);
      const ex = s === 'L' ? clamp(f.cx - f.rx - 26, 182, f.w * 0.5) : clamp(f.cx + f.rx + 26, f.w * 0.5, f.w - 182);
      for (const it0 of list) {
        const it = items[it0.a.pid], lx = s === 'L' ? ex - 6 : ex + 6;
        show(it.label);
        it.label.style.transform = `translate(${Math.round(lx)}px, ${Math.round(it0.ey)}px) translate(${s === 'L' ? -100 : 0}%, -50%)`;
        it.line.setAttribute('d', `M${it0.a.x.toFixed(1)} ${it0.a.y.toFixed(1)} L${ex.toFixed(1)} ${it0.ey.toFixed(1)} L${lx.toFixed(1)} ${it0.ey.toFixed(1)}`);
        it.dot.setAttribute('cx', it0.a.x.toFixed(1)); it.dot.setAttribute('cy', it0.a.y.toFixed(1));
        it.line.style.display = ''; it.dot.style.display = '';
      }
    }
  }
  function hover(pid, x, y) {
    if (!pid || PART === pid) { tip.hidden = true; return; }
    tip.textContent = partOf(pid).name; tip.hidden = false;
    tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`;
  }
  return { build, frame, hover, refreshCard, redraw: () => last && frame(last), wide: wideNow };
}

/* ======================= the panel ======================= */
const partOf = (pid) => DATA.parts[pid];
const colorOf = (pid) => (partOf(pid) && partOf(pid).swatch) || '#888888';
let labelsOn = false, motionPaused = false;

// Small line drawings for the cell picker, drawn in the text colour.
const ICONS = {
  animal: '<ellipse cx="16" cy="16" rx="12" ry="10.5"/><circle cx="13" cy="15" r="4.2"/><path d="M20 20.5c1.5-.6 2.5-1.6 3-3"/>',
  plant: '<rect x="4.5" y="7" width="23" height="18" rx="3"/><rect x="7.5" y="10" width="17" height="12" rx="2"/><ellipse cx="18" cy="16" rx="4.5" ry="3"/>',
  bacterium: '<rect x="3.5" y="11" width="19" height="10" rx="5"/><path d="M22.5 16c2-2 3 2 5 0s2.5 1 3 .5"/>',
  rbc: '<ellipse cx="16" cy="16" rx="12" ry="8.5"/><ellipse cx="16" cy="16" rx="5.5" ry="3.2"/>',
  neuron: '<circle cx="9" cy="16" r="4"/><path d="M13 16h15M5.5 13 3 10M5.5 19 3 22M9 12V8M28 16l2-2M28 16l2 2"/>',
  muscle: '<rect x="3.5" y="10" width="25" height="12" rx="6"/><path d="M9 10v12M14 10v12M19 10v12M24 10v12"/>',
};
const icon = (id) => { const s = svgEl('svg', { viewBox: '0 0 32 32', width: '26', height: '26', 'aria-hidden': 'true', class: 'ico' }); s.innerHTML = ICONS[id] || ''; return s; };

function refs(sentences, srcIndex) {
  const p = el('p');
  sentences.forEach((x, i) => {
    if (i) p.append(' ');
    p.append(x.s);
    const n = srcIndex(x.src);
    p.append(el('sup', { class: 'ref' }, el('a', { href: '#src-' + x.src, 'aria-label': 'source ' + n, text: '[' + n + ']' })));
  });
  return p;
}

function renderCell(id, focusTitle) {
  CELL = DATA.cells.find((c) => c.id === id) || DATA.cells[0];
  PART = null;
  document.title = CELL.name + ': ' + UI.pageTitle;
  $('#brand').textContent = CELL.name;
  for (const b of document.querySelectorAll('#picker button')) b.setAttribute('aria-current', b.dataset.id === CELL.id ? 'true' : 'false');
  $('#cellTitle').textContent = CELL.name;
  const used = [];
  const idx = (s) => { let i = used.indexOf(s); if (i < 0) { used.push(s); i = used.length - 1; } return i + 1; };
  CELL.summary.forEach((x) => idx(x.src));
  for (const pid of CELL.parts) for (const x of partOf(pid).text) idx(x.src);
  $('#summary').replaceWith(Object.assign(refs(CELL.summary, idx), { id: 'summary', className: 'summary' }));
  $('#linkCard').hidden = !CELL.link;
  if (CELL.link) { $('#extraLink').href = CELL.link.href; $('#extraLink').textContent = CELL.link.text; }
  const list = $('#parts'); list.replaceChildren();
  CELL.parts.forEach((pid, i) => {
    const p = partOf(pid);
    const btn = el('button', { type: 'button', 'aria-pressed': 'false', 'data-part': pid, onclick: () => choosePart(pid === PART ? null : pid, true) },
      el('span', { class: 'sw', style: 'background:' + p.swatch, 'aria-hidden': 'true' }), el('span', { class: 'pname', text: p.name }), el('span', { class: 'num', 'aria-hidden': 'true', text: String(i + 1) }));
    const hv = (on) => () => { if (view) view.hover(on ? pid : null); };
    btn.addEventListener('mouseenter', hv(true)); btn.addEventListener('mouseleave', hv(false)); btn.addEventListener('focus', hv(true)); btn.addEventListener('blur', hv(false));
    list.append(el('li', {}, btn));
  });
  $('#alt').textContent = CELL.alt;
  const sl = $('#sourceList'); sl.replaceChildren();
  for (const s of used) {
    const S = DATA.sources[s];
    sl.append(el('li', { id: 'src-' + s }, S.authors + '. ' + S.title + '. ' + S.publisher + '. ', el('a', { href: S.url, rel: 'noopener', text: S.url }), '. Licence ' + S.licence + '. Checked ' + S.checked + '.'));
  }
  CELL._idx = idx;
  if (overlay) overlay.build();
  if (view) view.show(CELL.id);
  choosePart(null, false, true);
  if (focusTitle) $('#cellTitle').focus({ preventScroll: false });
}

function choosePart(pid, fromList, quiet) {
  PART = pid && CELL.parts.includes(pid) ? pid : null;
  for (const b of document.querySelectorAll('#parts button')) b.setAttribute('aria-pressed', b.dataset.part === PART ? 'true' : 'false');
  $('#showAll').disabled = !PART;
  const text = $('#partText'), mol = $('#partMol'), sw = $('#partSw');
  $('#partCard').classList.toggle('chosen', !!PART);
  if (!PART) {
    $('#partTitle').textContent = UI.partEmptyTitle || '';
    text.replaceChildren(el('p', { class: 'small', id: 'partPrompt', text: UI.partPrompt }));
    mol.hidden = true; sw.hidden = true;
  } else {
    const p = partOf(PART);
    $('#partTitle').textContent = p.name;
    sw.hidden = false; sw.style.background = p.swatch;
    text.replaceChildren(refs(p.text, CELL._idx));
    mol.hidden = !p.molecule;
    if (p.molecule) { $('#partMolLink').href = '../molecules/#' + p.molecule; $('#partMolLink').textContent = UI.moleculeLink.replace('{name}', p.moleculeName || p.molecule); }
    if (!quiet) $('#live').textContent = p.name + ' selected.';
  }
  const i = PART ? CELL.parts.indexOf(PART) : -1;
  $('#stepPos').textContent = PART ? (i + 1) + ' / ' + CELL.parts.length : CELL.parts.length + '';
  if (overlay) overlay.refreshCard();
  if (view) view.select(PART);
  writeHash();
  if (PART && !fromList && !quiet && matchMedia('(max-width: 879px)').matches) $('#partCard').scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}
function stepPart(d) {
  const n = CELL.parts.length, i = PART ? CELL.parts.indexOf(PART) : (d > 0 ? -1 : 0);
  choosePart(CELL.parts[(i + d + n) % n], true);
}

function writeHash() {
  const h = '#' + CELL.id + (PART ? '/' + PART : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const [c, p] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { c: DATA.cells.some((x) => x.id === c) ? c : DATA.cells[0].id, p: p || null };
}

function setLabels(on) {
  labelsOn = !!on;
  const b = $('#labelsBtn'); b.setAttribute('aria-pressed', labelsOn ? 'true' : 'false');
  $('#parts').classList.toggle('numbered', labelsOn && overlay && !overlay.wide());
  if (view) view.setLabels(labelsOn, overlay && overlay.wide());
  try { localStorage.setItem('cells-labels', labelsOn ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
}
function setMotion(paused) {
  motionPaused = !!paused;
  const b = $('#motionBtn'); b.setAttribute('aria-pressed', motionPaused ? 'true' : 'false');
  b.textContent = motionPaused ? UI.playMotion : UI.pauseMotion;
  if (view) view.setPaused(motionPaused);
}

/* ======================= boot ======================= */
(async function boot() {
  try {
    const r = await fetch('cells.json');
    if (!r.ok) throw new Error('cells.json ' + r.status);
    DATA = await r.json();
  } catch (e) {
    $('#panel').replaceChildren(el('h1', { text: 'Could not load the cells' }), el('p', { text: 'The content file did not load. Please reload the page.' }), el('button', { class: 'btn', type: 'button', onclick: () => location.reload(), text: 'Reload' }));
    return;
  }
  UI = DATA.ui;
  const set = (sel, k) => { const n = $(sel); if (n && UI[k]) n.textContent = UI[k]; };
  set('#pageTitle', 'pageTitle'); set('#intro', 'intro'); set('#home', 'homeLink'); set('#resetView', 'resetView'); set('#showAll', 'showAll');
  set('#partsHeading', 'partsHeading'); set('#partsHint', 'partsHint'); set('#altSummary', 'altSummary'); set('#badge', 'scaleBadge');
  set('#viewhelp', 'viewHelp'); set('#creditsSummary', 'credits'); set('#srcHeading', 'sourcesHeading'); set('#noglTxt', 'noWebGL');
  set('#labelsTxt', 'labelsButton'); set('#prevPart', 'prevPart'); set('#nextPart', 'nextPart'); set('#motionBtn', 'pauseMotion');
  $('#pickerNav').setAttribute('aria-label', UI.pickerLabel);
  $('#credits').append(el('p', { text: UI.creditThree }), el('p', { text: UI.creditFonts }), el('p', { text: UI.creditText }));
  const picker = $('#picker');
  for (const c of DATA.cells) picker.append(el('li', {}, el('button', { type: 'button', 'data-id': c.id, onclick: () => { if (c.id !== CELL.id) renderCell(c.id, false); } }, icon(c.id), el('span', { text: c.short }))));

  if (webglOK()) {
    try { view = createView($('#gl'), $('#viewport'), colorOf); } catch (e) { console.warn('3D view failed, using the text fallback', e); view = null; }
  }
  if (!view) {
    $('#app').classList.add('nogl');
    for (const s of ['#viewport', '#resetView', '#labelsBtn', '#motionBtn']) $(s).hidden = true;
    $('#nogl').hidden = false; $('#altCard').open = true;
  } else {
    overlay = createOverlay($('#stagewrap'));
    view.onPick((pid) => choosePart(pid, false));
    view.onFrame((f) => overlay.frame(f));
    view.onHover((pid, x, y) => overlay.hover(pid, x, y));
    $('#resetView').addEventListener('click', () => view.reset());
    $('#labelsBtn').addEventListener('click', () => setLabels(!labelsOn));
    $('#motionBtn').addEventListener('click', () => setMotion(!motionPaused));
    if (reduceMotion()) $('#motionBtn').hidden = true;
    let wasWide = overlay.wide();
    new ResizeObserver(() => { const w = overlay.wide(); if (w !== wasWide) { wasWide = w; setLabels(labelsOn); } overlay.redraw(); }).observe($('#stagewrap'));
    $('#viewport').addEventListener('keydown', (e) => {
      const step = 0.12;
      const map = { ArrowLeft: () => view.nudge(-step, 0), ArrowRight: () => view.nudge(step, 0), ArrowUp: () => view.nudge(0, -step), ArrowDown: () => view.nudge(0, step),
        '+': () => view.zoomBy(0.9), '=': () => view.zoomBy(0.9), '-': () => view.zoomBy(1.1), '_': () => view.zoomBy(1.1), '0': () => view.reset(), Escape: () => choosePart(null, false),
        l: () => setLabels(!labelsOn), L: () => setLabels(!labelsOn) };
      if (map[e.key]) { e.preventDefault(); map[e.key](); }
    });
  }
  $('#showAll').addEventListener('click', () => choosePart(null, true));
  $('#prevPart').addEventListener('click', () => stepPart(-1));
  $('#nextPart').addEventListener('click', () => stepPart(1));
  const { c, p } = readHash();
  let lab = params.get('labels');
  if (lab == null) { try { lab = localStorage.getItem('cells-labels'); } catch (e) { lab = null; } }
  if (view) setLabels(lab == null ? overlay.wide() : lab === '1');
  renderCell(c, false);
  if (p) choosePart(p, true);
  window.addEventListener('hashchange', () => { const h = readHash(); if (h.c !== CELL.id) renderCell(h.c, false); if (h.p !== PART) choosePart(h.p, true); });
  window.__cells = { ready: true, gl: !!view, measure: (ms) => view && view.measure(ms), point: (pid) => view && view.screenPoint(pid), hitAt: (x, y) => view && view.hitAt(x, y),
    select: (pid) => choosePart(pid, true), labels: (on) => setLabels(on), pause: (on) => setMotion(on), busy: () => !!view && view.busy(), cells: DATA.cells.map((x) => ({ id: x.id, parts: x.parts })) };
})();
