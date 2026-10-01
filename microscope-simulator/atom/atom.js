// Atom viewer for the Cell and Molecule Explorer. One ES module, no globals, no external requests.
//
//   import { mount, unmount } from '../atom/atom.js';         // path from web/elements/index.html
//   const viewer = mount(containerEl, 26, { mode: 'orbital' }); // 1..118 or a symbol like 'Fe'
//   await viewer.ready;  viewer.setElement('Au');  viewer.setMode('nucleus');  unmount(containerEl);
//
// Three views of one atom, all drawn by code:
//   orbital  glowing point clouds with the shapes of hydrogen-like orbitals (s, p, d, f), filled from the element's
//            ground-state configuration. A teaching picture, labelled as such on screen.
//   bohr     the nucleus with electrons circling in shells (Bohr model, a simplified picture).
//   nucleus  a packed ball of protons, plus neutrons from the most abundant natural isotope when one is listed.
// Data: atoms.json beside this file (configurations and isotopes from the RSC periodic table, see its sources block).
// Words on screen come from atoms.json "ui" by key, so COPYWRITER edits one file.
import * as THREE from '../vendor/three/0.170.0/build/three.module.js';

const DATA_URL = new URL('./atoms.json', import.meta.url);
const L_NAME = ['s', 'p', 'd', 'f'];
const MAX_SUB = 24;
const GHOST_SUB = MAX_SUB - 1;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/* ---------------- data ---------------- */
let dataPromise = null;
export function loadData() {
  if (!dataPromise) {
    dataPromise = fetch(DATA_URL).then((r) => {
      if (!r.ok) throw new Error(`atoms.json: HTTP ${r.status}`);
      return r.json();
    }).then((d) => {
      d.bySymbol = new Map(d.elements.map((e) => [e.symbol.toLowerCase(), e]));
      return d;
    });
    dataPromise.catch(() => { dataPromise = null; });
  }
  return dataPromise;
}
function findElement(data, key) {
  if (typeof key === 'number' || /^\d+$/.test(String(key))) return data.elements[clamp(Number(key) | 0, 1, 118) - 1];
  return data.bySymbol.get(String(key).trim().toLowerCase()) || data.elements[0];
}
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));

/* ---------------- colour per subshell ---------------- */
// One hue family per subshell type (s teal-blue, p rose-violet, d amber, f green); within a family the hue and
// lightness step with n, so 2p and 3p read as relatives but stay distinguishable. The legend uses the same numbers.
const FAMILY = [
  { h0: 168, step: 11, s: 0.86 },  // s
  { h0: 292, step: 12, s: 0.82 },  // p
  { h0: 22, step: 13, s: 0.92 },   // d
  { h0: 112, step: 24, s: 0.72 },  // f
];
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
function subColor(n, l, dark) {
  const F = FAMILY[l], i = n - (l + 1);
  return hsl(F.h0 + i * F.step, F.s, dark ? clamp(0.66 - i * 0.025, 0.5, 0.7) : clamp(0.42 - i * 0.02, 0.28, 0.44));
}
// Each orbital of a subshell gets a slight tint of the subshell colour, so the separate lobes of a filled
// subshell (which add up to a round cloud) can still be told apart.
function orbColor(n, l, m, dark) {
  const F = FAMILY[l], i = n - (l + 1), off = m - l;
  const L = dark ? clamp(0.66 - i * 0.025, 0.5, 0.7) : clamp(0.42 - i * 0.02, 0.28, 0.44);
  return hsl(F.h0 + i * F.step + off * [0, 14, 9, 7][l], F.s, clamp(L + (off % 2 ? 0.05 : -0.03) * (dark ? 1 : -1), 0.2, 0.8));
}
const cssColor = (c) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

/* ---------------- hydrogen-like orbital sampling ---------------- */
// Radial part R_nl(r) ~ rho^l e^(-rho/2) L_(n-l-1)^(2l+1)(rho), rho = 2r/n (Z = 1, r in Bohr radii). The radial
// probability r^2 R^2 is tabulated and sampled by its cumulative sum. The angular part is the real (cubic) form of
// each orbital; directions are drawn uniformly and kept with probability |Y|^2 / max|Y|^2.
function rng(seed) {
  let s = (seed | 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function laguerre(k, a, x) {
  if (k === 0) return 1;
  let L0 = 1, L1 = 1 + a - x;
  for (let i = 1; i < k; i++) { const L2 = ((2 * i + 1 + a - x) * L1 - (i + a) * L0) / (i + 1); L0 = L1; L1 = L2; }
  return L1;
}
const meanR = (n, l) => (3 * n * n - l * (l + 1)) / 2;
const radialTables = new Map();
function radialTable(n, l) {
  const key = n * 10 + l;
  let t = radialTables.get(key);
  if (t) return t;
  const N = 1400, rmax = meanR(n, l) * 2.5 + 9;
  const cdf = new Float64Array(N + 1);
  let acc = 0;
  for (let i = 1; i <= N; i++) {
    const r = (i / N) * rmax, rho = (2 * r) / n;
    const R = Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
    acc += r * r * R * R;
    cdf[i] = acc;
  }
  t = { cdf, total: acc, rmax, N };
  radialTables.set(key, t);
  return t;
}
function sampleR(t, u) {
  const target = u * t.total, c = t.cdf;
  let lo = 0, hi = t.N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] < target) lo = mid; else hi = mid; }
  const f = (target - c[lo]) / Math.max(1e-300, c[hi] - c[lo]);
  return ((lo + f) / t.N) * t.rmax;
}
// Real angular forms, in an order that fills nicely under Hund's rule (one electron per orbital first).
// Chemistry z is drawn as screen-up (three.js y), so pz stands upright and the dz2 ring lies flat.
const ANG = [
  [() => 1],
  [(x, y, z) => z, (x) => x, (x, y) => y],                                                   // pz, px, py
  [(x, y, z) => 3 * z * z - 1, (x, y, z) => x * z, (x, y) => x * x - y * y, (x, y) => x * y, (x, y, z) => y * z], // dz2, dxz, dx2-y2, dxy, dyz
  [(x, y, z) => z * (5 * z * z - 3), (x, y, z) => x * (5 * z * z - 1), (x, y, z) => y * (5 * z * z - 1), (x, y, z) => x * y * z,
    (x, y, z) => z * (x * x - y * y), (x, y) => x * (x * x - 3 * y * y), (x, y) => y * (3 * x * x - y * y)],
];
const angMax = new Map();
function angularMax(l, m) {
  const key = l * 10 + m;
  if (angMax.has(key)) return angMax.get(key);
  const f = ANG[l][m], r = rng(991 + key);
  let mx = 1e-9;
  for (let i = 0; i < 6000; i++) {
    const z = 2 * r() - 1, ph = TAU * r(), s = Math.sqrt(1 - z * z);
    const v = f(s * Math.cos(ph), s * Math.sin(ph), z);
    mx = Math.max(mx, v * v);
  }
  angMax.set(key, mx * 1.03);
  return mx * 1.03;
}
const radialAt = (n, l, r) => { const rho = (2 * r) / n; return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho); };
// One draw from |psi|^2 for orbital (n, l, m): direction by rejection on |Y|^2, radius from the radial table.
function drawOne(n, l, m, t, f, mx, r, out) {
  let x = 0, y = 0, z = 1;
  for (let guard = 0; guard < 400; guard++) {
    z = 2 * r() - 1; const ph = TAU * r(), s = Math.sqrt(1 - z * z);
    x = s * Math.cos(ph); y = s * Math.sin(ph);
    const v = f(x, y, z);
    if (r() * mx <= v * v) break;
  }
  const rad = sampleR(t, r()), R = radialAt(n, l, rad), Y = f(x, y, z);
  out[0] = x * rad; out[1] = z * rad; out[2] = y * rad; out[3] = R * R * Y * Y;
  return out;
}
// Each orbital keeps a growing list of sample points (in Bohr radii), shared by every element that uses it.
// Points are drawn from |psi|^2 and kept only inside the surface that encloses 90% of the probability, the
// "boundary surface" convention textbook orbital pictures use, so lobes read as shapes instead of fog.
const orbitalCache = new Map();
function orbitalPoints(n, l, m, count) {
  const key = `${n}${l}${m}`;
  let c = orbitalCache.get(key);
  const t = radialTable(n, l), f = ANG[l][m], mx = angularMax(l, m);
  const tmp = [0, 0, 0, 0];
  if (!c) {
    c = { pts: new Float32Array(0), n: 0, rand: rng(7919 * n + 131 * l + 17 * m + 3) };
    const probe = rng(31 * n + 7 * l + m + 11), dens = new Float64Array(2400);
    for (let i = 0; i < dens.length; i++) dens[i] = drawOne(n, l, m, t, f, mx, probe, tmp)[3];
    dens.sort();
    c.thr = dens[Math.floor(dens.length * 0.1)];   // the densest 90% of draws lie above this value
    orbitalCache.set(key, c);
  }
  if (c.n >= count) return c.pts;
  const grown = new Float32Array(count * 3);
  grown.set(c.pts.subarray(0, c.n * 3));
  const r = c.rand;
  for (let i = c.n; i < count; i++) {
    for (let guard = 0; guard < 60; guard++) { drawOne(n, l, m, t, f, mx, r, tmp); if (tmp[3] >= c.thr) break; }
    grown[i * 3] = tmp[0]; grown[i * 3 + 1] = tmp[1]; grown[i * 3 + 2] = tmp[2];
  }
  c.pts = grown; c.n = count;
  return grown;
}
// Boundary shapes: the textbook polar picture of each orbital's angular part, r = Y(direction)^2 (OpenStax 2e,
// Figure 6.21 draws the same s sphere, p dumbbell, d cloverleaf and dz2 ring shapes). Lobes keep the sign of Y so
// the two phases can be shaded apart. One geometry per (l, m), shared by every shell and element.
const lobeGeoCache = new Map();
function lobeGeometry(l, m) {
  const key = l * 10 + m;
  if (lobeGeoCache.has(key)) return lobeGeoCache.get(key);
  const g = new THREE.SphereGeometry(1, l === 0 ? 40 : 72, l === 0 ? 28 : 54);
  const pos = g.attributes.position, sign = new Float32Array(pos.count), f = ANG[l][m];
  const mx = Math.sqrt(angularMax(l, m));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = f(x, z, y);                          // chemistry (x, y, z) from three.js (x, z, y)
    const r = l === 0 ? 1 : (v * v) / (mx * mx);
    pos.setXYZ(i, x * r, y * r, z * r);
    sign[i] = v >= 0 ? 1 : 0;
  }
  g.setAttribute('aSign', new THREE.BufferAttribute(sign, 1));
  g.computeVertexNormals();
  lobeGeoCache.set(key, g);
  return g;
}
const LOBE_VERT = /* glsl */`
attribute float aSign;
varying vec3 vN; varying vec3 vV; varying float vSign;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vSign = aSign;
  gl_Position = projectionMatrix * mv;
}`;
const LOBE_FRAG = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB; uniform float uOpacity; uniform float uLight;
varying vec3 vN; varying vec3 vV; varying float vSign;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec3 col = mix(uColB, uColA, vSign);
  float a = (0.07 + 0.8 * fres) * uOpacity;
  if (uLight > 0.5) gl_FragColor = vec4(1.0 - col, a * 0.9);
  else gl_FragColor = vec4(col * (0.55 + 0.7 * fres), a);
}`;
function lobeMaterial(colA, colB, light) {
  const m = new THREE.ShaderMaterial({
    vertexShader: LOBE_VERT, fragmentShader: LOBE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColA: { value: new THREE.Vector3(...colA) }, uColB: { value: new THREE.Vector3(...colB) }, uOpacity: { value: 0 }, uLight: { value: 0 } },
  });
  setLightBlend(m, light);
  return m;
}
// The outer shell, any partly filled subshell, and d or f subshells just under the outer shell (they set the
// chemistry of the metals) are drawn bright; filled inner subshells stay as a dimmer core.
const isOuter = (s, nmax) => s.n === nmax || s.cnt < 2 * (2 * s.l + 1) || (s.l >= 2 && s.n >= nmax - 2);
// Lobes are drawn for fewer subshells than get bright points: partly filled ones, the outer shell, and a full d
// subshell right under it (copper, silver, gold). A full f subshell adds seven lobes and only clutters.
const hasLobes = (s, nmax) => s.cnt < 2 * (2 * s.l + 1) || s.n === nmax || (s.l === 2 && s.n === nmax - 1);
function hund(count, orbitals) {
  const occ = new Array(orbitals).fill(0);
  for (let e = 0; e < count; e++) occ[e < orbitals ? e : e - orbitals] += 1;
  return occ;
}
// Display radius of shell n: grows slower than the true n^2 so that all seven shells fit on one screen.
const shellR = (n) => 0.9 * Math.pow(n, 0.88);

/* ---------------- glow shader (orbital clouds and Bohr electrons) ---------------- */
const VERT = /* glsl */`
uniform float uT, uTime, uSize, uPix, uShellMax, uAlpha, uScale, uTwinkle, uDrift, uCut, uSlab;
uniform float uSubVis[${MAX_SUB}];
attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aCol0; attribute vec3 aCol1;
attribute vec2 aAlpha; attribute vec4 aMeta;
varying vec3 vCol; varying float vA;
float easeIO(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
void main() {
  float seed = aMeta.z;
  float e = easeIO(clamp((uT - seed * 0.35) / 0.65, 0.0, 1.0));
  vec3 d = aTo - aFrom;
  vec3 side = cross(d, vec3(0.0, 1.0, 0.0));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  vec3 p = mix(aFrom, aTo, e) + side * sin(3.14159 * e) * 0.22 * length(d);
  float shellVis = clamp(uShellMax - aMeta.y + 1.0, 0.0, 1.0);
  float vis = shellVis * uSubVis[int(aMeta.x + 0.5)];
  p += uDrift * aMeta.w * 0.7 * vec3(sin(uTime * 0.9 + seed * 91.0), sin(uTime * 1.1 + seed * 53.0), sin(uTime * 0.7 + seed * 17.0));
  p *= uScale * (1.0 + (1.0 - shellVis) * 0.45);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // slice: keep only a slab through the centre, facing the camera, so nested shells and lobes show in section
  float cz = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float slab = 1.0 - smoothstep(uSlab * 0.75, uSlab, abs(mv.z - cz));
  vis *= mix(1.0, slab * 1.7, uCut);
  float tw = 1.0 - uTwinkle * 0.4 * (0.5 + 0.5 * sin(uTime * 2.1 + seed * 61.0));
  vA = mix(aAlpha.x, aAlpha.y, e) * vis * uAlpha * tw;
  vCol = mix(aCol0, aCol1, e);
  gl_PointSize = clamp(uSize * aMeta.w * uPix / -mv.z, 1.0, 120.0);
  if (vA < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = /* glsl */`
uniform float uLight;
varying vec3 vCol; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float g = max(exp(-d2 * 3.6) - 0.027, 0.0);
  float core = exp(-d2 * 20.0);
  if (uLight > 0.5) gl_FragColor = vec4(1.0 - vCol, min(1.0, (g * 1.1 + core * 0.6) * vA));
  else gl_FragColor = vec4(vCol * 0.8 + core * 0.5, g * vA);
}`;
function glowMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uT: { value: 1 }, uTime: { value: 0 }, uSize: { value: 1 }, uPix: { value: 600 }, uShellMax: { value: 9 },
      uAlpha: { value: 1 }, uScale: { value: 1 }, uTwinkle: { value: 1 }, uDrift: { value: 1 }, uLight: { value: 0 }, uCut: { value: 0 }, uSlab: { value: 0.5 },
      uSubVis: { value: new Array(MAX_SUB).fill(1) },
    },
  });
}
function setLightBlend(mat, light) {
  mat.uniforms.uLight.value = light ? 1 : 0;
  if (light) {
    mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.ReverseSubtractEquation;
    mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneFactor;
  } else mat.blending = THREE.AdditiveBlending;
  mat.needsUpdate = true;
}
function glowGeometry(cap) {
  const g = new THREE.BufferGeometry();
  const add = (name, size) => g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(cap * size), size));
  add('position', 3); add('aFrom', 3); add('aTo', 3); add('aCol0', 3); add('aCol1', 3); add('aAlpha', 2); add('aMeta', 4);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  g.setDrawRange(0, 0);
  return g;
}

/* ---------------- nucleus packing ---------------- */
// Face-centred cubic lattice points, nearest first, with a tiny fixed jitter so the ball is not perfectly faceted.
let fccCache = null;
function fccPoints(count) {
  if (!fccCache || fccCache.length < count) {
    const pts = [], R = 7, r = rng(4242);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
      if ((i + j + k) & 1) continue;
      const x = i * 0.707 + (r() - 0.5) * 0.06, y = j * 0.707 + (r() - 0.5) * 0.06, z = k * 0.707 + (r() - 0.5) * 0.06;
      pts.push([x, y, z, x * x + y * y + z * z + r() * 0.02]);
    }
    pts.sort((a, b) => a[3] - b[3]);
    fccCache = pts;
  }
  return fccCache.slice(0, count);
}
function nucleusLayout(z, neutrons) {
  const A = z + (neutrons || 0);
  const pts = fccPoints(A);
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= A; cy /= A; cz /= A;
  // spread protons evenly through the ball: a deterministic interleave
  const types = new Array(A).fill(1);
  const r = rng(z * 31 + 7);
  let placed = 0;
  for (let i = 0; i < A && placed < z; i++) {
    const want = Math.round(((i + 1) * z) / A);
    if (placed < want) { types[i] = 0; placed++; }
  }
  for (let i = A - 1; i > 0; i--) { if (r() < 0.35) { const j = Math.floor(r() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; } }
  let rad = 0.5;
  const out = pts.map((p, i) => { const q = [p[0] - cx, p[1] - cy, p[2] - cz]; rad = Math.max(rad, Math.hypot(q[0], q[1], q[2]) + 0.5); return { p: q, type: types[i] }; });
  return { nucleons: out, radius: rad };
}

/* ---------------- styles (injected once) ---------------- */
const CSS = `
.atomv{container-type:inline-size;--av-ink:#e8f1ef;--av-muted:#a4b8b4;--av-line:#35504c;--av-raised:rgba(20,34,33,.72);--av-accent:#39b9ab;--av-bg:#060b0e;font-family:var(--font-ui,system-ui,sans-serif);color:var(--ink,#13201e)}
.atomv[data-stage=light]{--av-ink:#13201e;--av-muted:#4c5e5b;--av-line:#b7c6c2;--av-raised:rgba(255,255,255,.8);--av-accent:#0b7469;--av-bg:#f3f7f6}
.atomv *{box-sizing:border-box}
.atomv-body{position:relative}
.atomv-stage{position:relative;overflow:hidden;border-radius:14px;background:var(--av-bg);aspect-ratio:var(--atomv-aspect,4/3);min-height:280px;height:var(--atomv-height,auto);isolation:isolate}
.atomv-stage canvas{display:block;width:100%;height:100%;outline:none;cursor:grab;touch-action:pan-y}
.atomv-stage canvas:active{cursor:grabbing}
.atomv-stage canvas:focus-visible{outline:3px solid var(--av-accent);outline-offset:-3px;border-radius:14px}
.atomv[data-zoom] .atomv-stage canvas{touch-action:none}
.atomv-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 48%,transparent 55%,rgba(0,0,0,.55) 100%)}
.atomv[data-stage=light] .atomv-vig{background:radial-gradient(ellipse 75% 70% at 50% 48%,transparent 60%,rgba(120,150,145,.18) 100%)}
.atomv-badge{position:absolute;left:14px;top:12px;pointer-events:none;color:var(--av-ink);line-height:1.05;text-shadow:0 1px 12px rgba(0,0,0,.35)}
.atomv[data-stage=light] .atomv-badge{text-shadow:none}
.atomv-sym{font-family:var(--font-name,Georgia,serif);font-size:clamp(38px,9cqi,64px);font-weight:600;letter-spacing:-.02em}
.atomv-name{font-size:15px;font-weight:600;margin-top:2px}
.atomv-z{font-family:var(--font-data,ui-monospace,monospace);font-size:12px;color:var(--av-muted);margin-top:3px}
.atomv-pred{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;border:1px solid var(--av-accent);color:var(--av-ink);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;text-shadow:none}
.atomv-pred[hidden]{display:none}
.atomv-info .atomv-pred{margin:0 0 0 8px;vertical-align:1px}
.atomv-fps{position:absolute;right:10px;bottom:8px;font:11px var(--font-data,monospace);color:var(--av-muted);pointer-events:none}
.atomv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:10px}
.atomv-modes{display:inline-flex;border:1px solid var(--line,#9aa9a6);border-radius:10px;padding:3px;gap:3px;background:var(--raised,#fff)}
.atomv-btn{border:1px solid transparent;background:transparent;border-radius:7px;padding:8px 14px;min-height:40px;font:inherit;font-size:14px;font-weight:600;color:inherit;cursor:pointer}
.atomv-btn:hover{border-color:var(--accent,#0b7469)}
.atomv-modes .atomv-btn[aria-pressed=true]{background:var(--accent,#0b7469);color:var(--on-accent,#fff)}
.atomv-plain{border:1px solid var(--line,#9aa9a6);background:var(--raised,#fff)}
.atomv-peel{display:flex;align-items:center;gap:10px;font-size:14px;flex:1 1 220px;max-width:340px}
.atomv-peel input{flex:1;accent-color:var(--accent,#0b7469);min-height:32px}
.atomv-peel output{font-family:var(--font-data,monospace);font-size:13px;min-width:4.5em}
.atomv-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding:0;list-style:none}
.atomv-legend[hidden]{display:none}
.atomv-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-soft,#cad5d2);background:var(--raised,#fff);border-radius:999px;padding:4px 10px 4px 6px;min-height:32px;font:13px var(--font-data,monospace);color:inherit;cursor:pointer}
.atomv-chip[aria-pressed=false]{opacity:.45;text-decoration:line-through}
.atomv-chip i{width:14px;height:14px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor}
.atomv-chip sup{font-size:10px}
.atomv-legend-title{font-size:12px;color:var(--muted,#4c5e5b);margin:12px 0 0}
.atomv-note{font-size:13px;color:var(--muted,#4c5e5b);margin:8px 2px 0;line-height:1.4}
.atomv-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:1px;margin:12px 0 0;border:1px solid var(--line-soft,#cad5d2);border-radius:10px;overflow:hidden;background:var(--line-soft,#cad5d2)}
.atomv-info div{background:var(--panel,#f7faf9);padding:8px 12px;min-width:0}
.atomv-info dt{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#4c5e5b)}
.atomv-info dd{margin:2px 0 0;font:600 15px var(--font-data,monospace);overflow-wrap:anywhere}
.atomv-info .atomv-wide{grid-column:span 2}
.atomv-src{font-size:12px;color:var(--muted,#4c5e5b);margin:8px 2px 0}
.atomv-svg{display:block;width:100%;height:100%}
.atomv-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;color:var(--av-ink)}
.atomv-fallback p{font-size:13px;margin:6px 0 0;text-align:center;color:var(--av-muted)}
.atomv-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@container (min-width:720px){
 .atomv-body .atomv-legend.atomv-over{position:absolute;right:12px;top:12px;margin:0;flex-direction:column;flex-wrap:nowrap;max-height:calc(100% - 24px);overflow:auto;padding:8px;border-radius:12px;background:var(--av-raised);backdrop-filter:blur(6px);color:var(--av-ink)}
 .atomv-body .atomv-legend.atomv-over .atomv-chip{background:transparent;border-color:transparent;color:var(--av-ink)}
 .atomv-body .atomv-legend.atomv-over .atomv-chip:hover{border-color:var(--av-accent)}
 .atomv-body .atomv-legend.atomv-over.atomv-two{display:grid;grid-template-columns:auto auto;gap:2px 4px}
}
@container (max-width:420px){ .atomv-info{grid-template-columns:1fr 1fr} .atomv-btn{padding:8px 10px} }
`;
function injectCSS() {
  if (document.getElementById('atomv-style')) return;
  const s = document.createElement('style');
  s.id = 'atomv-style'; s.textContent = CSS;
  document.head.append(s);
}
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
// "[Ar] 3d^6 4s^2" as DOM with superscripts
function configNodes(markup) {
  const frag = document.createDocumentFragment();
  for (const part of markup.split(/(\^\d+)/)) {
    if (part.startsWith('^')) frag.append(h('sup', { text: part.slice(1) }));
    else if (part) frag.append(part.replace(/ +$/, ' '));
  }
  return frag;
}

/* ---------------- WebGL check and SVG fallback ---------------- */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { return false; }
}
function shellSVG(el, dark) {
  const shells = el.shells, n = shells.length, S = 400, c = S / 2;
  const R = (i) => 46 + ((c - 60) * (i + 1)) / n;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${S} ${S}`); svg.setAttribute('class', 'atomv-svg'); svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  const line = dark ? '#3c5753' : '#a9bab6';
  // which subshell each electron of a shell belongs to, for its colour
  const bySh = shells.map(() => []);
  for (const [sn, l, cnt] of el.subshells) for (let k = 0; k < cnt; k++) bySh[sn - 1].push(subColor(sn, L_NAME.indexOf(l), dark));
  shells.forEach((cnt, i) => {
    add('circle', { cx: c, cy: c, r: R(i), fill: 'none', stroke: line, 'stroke-width': 1.2 });
    for (let k = 0; k < cnt; k++) {
      const a = -Math.PI / 2 + (k * TAU) / cnt;
      add('circle', { cx: (c + R(i) * Math.cos(a)).toFixed(1), cy: (c + R(i) * Math.sin(a)).toFixed(1), r: cnt > 18 ? 3.2 : 4.6, fill: cssColor(bySh[i][k] || [0.5, 0.5, 0.5]) });
    }
  });
  add('circle', { cx: c, cy: c, r: 30, fill: dark ? '#c9473d' : '#d4574c' });
  const t = add('text', { x: c, y: c + 7, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#fff', 'font-family': 'system-ui, sans-serif' });
  t.textContent = el.symbol;
  return svg;
}

/* ---------------- the viewer ---------------- */
const instances = new Map();

export function mount(container, atomicNumber = 1, options = {}) {
  if (!container) throw new Error('atom viewer: mount needs a container element');
  unmount(container);
  const inst = createViewer(container, atomicNumber, options);
  instances.set(container, inst);
  return inst;
}
export function unmount(container) {
  if (container === undefined) { for (const c of [...instances.keys()]) unmount(c); return; }
  const inst = instances.get(container);
  if (inst) { instances.delete(container); inst.destroy(); }
}

function createViewer(container, atomicNumber, options) {
  const opt = { mode: 'orbital', ui: true, info: true, zoom: false, theme: 'auto', quality: 'auto', showFps: false, onChange: null, ...options };
  injectCSS();
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const st = {
    data: null, el: null, mode: ['orbital', 'bohr', 'nucleus'].includes(opt.mode) ? opt.mode : 'orbital',
    motion: !reduceMQ.matches, dark: true, shellsShown: 9, subVis: new Array(MAX_SUB).fill(1), destroyed: false,
    visible: true, pageVisible: document.visibilityState !== 'hidden', fps: 0,
  };
  const U = (k, vars) => fill((st.data && st.data.ui && st.data.ui[k]) || k, vars || {});

  /* DOM */
  const root = h('div', { class: 'atomv', 'data-stage': 'dark' });
  if (opt.zoom) root.setAttribute('data-zoom', '');
  const stage = h('div', { class: 'atomv-stage' });
  const vig = h('div', { class: 'atomv-vig', 'aria-hidden': 'true' });
  const badge = h('div', { class: 'atomv-badge', 'aria-hidden': 'true' }, h('div', { class: 'atomv-sym' }), h('div', { class: 'atomv-name' }), h('div', { class: 'atomv-z' }), h('div', { class: 'atomv-pred', hidden: '' }));
  const fpsTag = opt.showFps ? h('div', { class: 'atomv-fps', 'aria-hidden': 'true' }) : null;
  const live = h('p', { class: 'atomv-sr', 'aria-live': 'polite' });
  const body = h('div', { class: 'atomv-body' }, stage);
  root.append(body, live);
  const ui = {};
  if (opt.ui) {
    ui.modes = h('div', { class: 'atomv-modes', role: 'group' });
    ui.modeBtn = {};
    for (const m of ['orbital', 'bohr', 'nucleus']) {
      const b = h('button', { class: 'atomv-btn', type: 'button', 'aria-pressed': 'false', onclick: () => api.setMode(m) });
      ui.modeBtn[m] = b; ui.modes.append(b);
    }
    ui.peelOut = h('output');
    ui.peelLabel = h('span');
    ui.peel = h('input', { type: 'range', min: '1', max: '7', step: '1', value: '7', oninput: (e) => api.setShells(+e.target.value) });
    ui.peelWrap = h('label', { class: 'atomv-peel' }, ui.peelLabel, ui.peel, ui.peelOut);
    ui.pause = h('button', { class: 'atomv-btn atomv-plain', type: 'button', 'aria-pressed': 'false', onclick: () => api.setMotion(!st.motion) });
    ui.bar = h('div', { class: 'atomv-bar' }, ui.modes, ui.peelWrap, ui.pause);
    ui.legend = h('ul', { class: 'atomv-legend atomv-over' });
    ui.note = h('p', { class: 'atomv-note' });
    body.append(ui.legend);
    root.append(ui.bar, ui.note);
  }
  if (opt.info) {
    ui.info = h('dl', { class: 'atomv-info' });
    ui.src = h('p', { class: 'atomv-src' });
    root.append(ui.info, ui.src);
  }
  container.append(root);

  /* theme */
  const themeFromPage = () => {
    if (opt.theme === 'dark') return true;
    if (opt.theme === 'light') return false;
    return document.documentElement.dataset.theme !== 'light';   // dark stage unless the page is set to light
  };
  const themeObs = new MutationObserver(() => applyTheme());
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* three.js */
  const gl = webglOK();
  let renderer = null, scene, camera, spin, cloud, cloudMat, bohrPts, bohrMat, rings, nucMesh, nucGroup, lobes;
  const clouds = { cap: 0, count: 0, live: 0, from: null, to: null, seed: null, t: 1, dur: 1.4 };
  const bohr = { electrons: [], ghosts: [], t: 1, time: 0 };
  const nuc = { cur: [], from: [], to: [], types: [], scaleFrom: [], scaleTo: [], t: 1, count: 0, radius: 1, displayR: 0.1 };
  const cam = { dist: 12, zoom: 1, fov: 38, frame: 3 };
  const anim = { modeT: { orbital: 1, bohr: 0, nucleus: 0 }, shellMax: 9, nucR: 0.1, cloudScale: 1, cut: 0 };
  const Q_BOHR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.62, 0, 0));
  // slice view: kept in the shader but switched off (a points-only slice read poorly next to the lobes)
  const cutOn = () => false;
  let canvas = null;
  if (gl) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { renderer = null; }
  }
  if (renderer) {
    canvas = renderer.domElement;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('tabindex', '0');
    canvas.style.visibility = 'hidden';   // until the first frame is drawn (see drawn())
    stage.append(canvas, vig, badge);
    if (fpsTag) stage.append(fpsTag);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.05, 400);
    spin = new THREE.Group();
    spin.rotation.set(0.32, -0.5, 0);
    scene.add(spin);
    cloudMat = glowMaterial();
    cloud = new THREE.Points(glowGeometry(4), cloudMat); cloud.frustumCulled = false;
    bohrMat = glowMaterial(); bohrMat.uniforms.uTwinkle.value = 0; bohrMat.uniforms.uDrift.value = 0; bohrMat.uniforms.uSize.value = 1;
    bohrPts = new THREE.Points(glowGeometry(118 * 9 + 120), bohrMat); bohrPts.frustumCulled = false;
    rings = new THREE.Group();
    nucGroup = new THREE.Group();
    const nGeo = new THREE.IcosahedronGeometry(0.56, 2);
    nucMesh = new THREE.InstancedMesh(nGeo, new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05 }), 420);
    nucMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    nucMesh.setColorAt(0, new THREE.Color());
    nucMesh.count = 0; nucMesh.frustumCulled = false;
    nucGroup.add(nucMesh);
    lobes = new THREE.Group();
    spin.add(lobes, cloud, rings, bohrPts, nucGroup);
    scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x1a2028, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fd8ff, 1.4); rim.position.set(-5, -2, -4); scene.add(rim);
  } else {
    st.fallback = h('div', { class: 'atomv-fallback' });
    stage.append(st.fallback, badge);
    // the flat diagram is a shell picture, so the 3D controls go and the note describes the Bohr picture
    st.mode = 'bohr';
    if (ui.bar) { ui.bar.remove(); ui.legend.remove(); }
  }

  /* sizing */
  let dpr = 1, maxDpr = 1.75, W = 1, H = 1;
  const small = () => Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
  const budget = () => (opt.quality === 'low' ? 16000 : opt.quality === 'high' ? 52000 : small() ? 22000 : 42000);
  function resize() {
    if (!renderer) return;
    const r = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    maxDpr = small() ? 1.5 : 1.75;
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr, st.dprCap || 9);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const pix = (H * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    cloudMat.uniforms.uPix.value = pix; bohrMat.uniforms.uPix.value = pix;
    if (st.el) { step(0.001); renderer.render(scene, camera); drawn(); }
    kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  /* ---- build the orbital cloud for an element ---- */
  function subshellList(el) {
    return el.subshells.map(([n, l, cnt], i) => ({ i, n, l: L_NAME.indexOf(l), cnt, key: `${n}${l}` }));
  }
  function buildCloud(el, instant) {
    const subs = subshellList(el), nmax = el.shells.length;
    const occs = subs.map((s) => hund(s.cnt, 2 * s.l + 1));
    // Outer subshells (see isOuter) get more points and full brightness; filled inner ones stay a dimmer core.
    const isValence = (s) => isOuter(s, nmax);
    let wsum = 0;
    const weight = (s) => (0.45 + 0.55 * (shellR(s.n) / shellR(nmax))) * (s.l === 0 ? 0.55 : 1) * (isValence(s) ? 1.5 : 0.5);
    subs.forEach((s, k) => occs[k].forEach((o) => { wsum += o * weight(s); }));
    const pp = Math.min(budget() / wsum, 2400);
    const parts = [];
    let total = 0;
    subs.forEach((s, k) => occs[k].forEach((o, m) => {
      if (!o) return;
      const cnt = Math.max(60, Math.round(pp * o * weight(s)));
      parts.push({ s, m, o, cnt, val: isValence(s) }); total += cnt;
    }));
    const crowd = clamp(Math.sqrt(14000 / total), 0.75, 1.2);
    const innerTotal = parts.reduce((a, p) => a + (p.val ? 0 : p.cnt), 0);
    const heavy = clamp((nmax - 3) / 3, 0, 1);   // 0 up to period 3, 1 from period 6
    const innerK = clamp(Math.sqrt(1500 / Math.max(1, innerTotal)), 0.35, 1);
    clouds.m = new Uint8Array(Math.max(total, 1));
    const oldLive = clouds.live, oldPos = currentCloudPositions();
    const cap = Math.max(total, oldLive);
    const g = cloud.geometry;
    if (cap > clouds.cap) {
      const ng = glowGeometry(Math.ceil(cap * 1.15));
      cloud.geometry = ng; g.dispose();
      clouds.cap = Math.ceil(cap * 1.15);
    }
    const G = cloud.geometry.attributes;
    const from = G.aFrom.array, to = G.aTo.array, c0 = G.aCol0.array, c1 = G.aCol1.array, al = G.aAlpha.array, meta = G.aMeta.array;
    const oldCol = clouds.col || new Float32Array(0), oldAl = clouds.alpha || new Float32Array(0);
    const rs = rng(el.z * 977 + 5);
    let i = 0;
    const densityK = clamp(Math.sqrt(900 / pp), 0.75, 1.9);
    for (const { s, m, o, cnt, val } of parts) {
      const pts = orbitalPoints(s.n, s.l, m, cnt);
      const scale = shellR(s.n) / meanR(s.n, s.l);
      const col = orbColor(s.n, s.l, m, st.dark);
      const rel = shellR(s.n) / shellR(nmax);
      const coreDim = val ? 1 : 1 - heavy * (1 - innerK * clamp(0.35 + rel, 0.35, 1));
      const alpha = clamp(0.45 + 0.4 * Math.pow(rel, 0.8), 0.4, 0.85) * (o === 2 ? 1 : 0.85) * (val ? 1 : 0.3) * (s.l === 0 && s.n > 1 ? 0.7 : 1) * crowd * coreDim;
      const size = 0.062 * Math.pow(shellR(s.n), 0.7) * densityK * (val ? 1 : 0.8);
      for (let k = 0; k < cnt; k++, i++) {
        clouds.m[i] = m;
        const j = i * 3;
        to[j] = pts[k * 3] * scale; to[j + 1] = pts[k * 3 + 1] * scale; to[j + 2] = pts[k * 3 + 2] * scale;
        if (i < oldLive && !instant) {
          from[j] = oldPos[j]; from[j + 1] = oldPos[j + 1]; from[j + 2] = oldPos[j + 2];
          c0[j] = oldCol[j]; c0[j + 1] = oldCol[j + 1]; c0[j + 2] = oldCol[j + 2];
          al[i * 2] = oldAl[i];
        } else if (instant) {
          from[j] = to[j]; from[j + 1] = to[j + 1]; from[j + 2] = to[j + 2];
          c0[j] = col[0]; c0[j + 1] = col[1]; c0[j + 2] = col[2]; al[i * 2] = alpha;
        } else {
          // new electrons' clouds stream out of the nucleus
          const f = 0.04 * rs();
          from[j] = to[j] * f; from[j + 1] = to[j + 1] * f; from[j + 2] = to[j + 2] * f;
          c0[j] = col[0]; c0[j + 1] = col[1]; c0[j + 2] = col[2]; al[i * 2] = 0;
        }
        c1[j] = col[0]; c1[j + 1] = col[1]; c1[j + 2] = col[2];
        al[i * 2 + 1] = alpha;
        meta[i * 4] = s.i; meta[i * 4 + 1] = s.n; meta[i * 4 + 2] = rs(); meta[i * 4 + 3] = size;
      }
    }
    // points the new atom does not need drift outward and fade
    for (; i < cap; i++) {
      const j = i * 3;
      from[j] = oldPos[j]; from[j + 1] = oldPos[j + 1]; from[j + 2] = oldPos[j + 2];
      to[j] = from[j] * 1.9; to[j + 1] = from[j + 1] * 1.9; to[j + 2] = from[j + 2] * 1.9;
      c0[j] = c1[j] = oldCol[j]; c0[j + 1] = c1[j + 1] = oldCol[j + 1]; c0[j + 2] = c1[j + 2] = oldCol[j + 2];
      al[i * 2] = oldAl[i]; al[i * 2 + 1] = 0;
      meta[i * 4] = GHOST_SUB; meta[i * 4 + 1] = 0; meta[i * 4 + 2] = rs(); meta[i * 4 + 3] = 0.08;
    }
    for (const name of ['aFrom', 'aTo', 'aCol0', 'aCol1', 'aAlpha', 'aMeta']) G[name].needsUpdate = true;
    cloud.geometry.setDrawRange(0, cap);
    clouds.count = cap; clouds.live = total;
    clouds.col = new Float32Array(c1.subarray(0, total * 3));
    clouds.alpha = new Float32Array(total); for (let k = 0; k < total; k++) clouds.alpha[k] = al[k * 2 + 1];
    clouds.t = instant ? 1 : 0;
    clouds.dur = st.motion ? 1.5 : 0.45;
    cloudMat.uniforms.uT.value = clouds.t;
  }
  // where each point is right now (the same maths as the vertex shader, without the small drift)
  function currentCloudPositions() {
    const n = clouds.count, out = new Float32Array(Math.max(n, 1) * 3);
    if (!n) return out;
    const G = cloud.geometry.attributes, from = G.aFrom.array, to = G.aTo.array, meta = G.aMeta.array, T = clouds.t;
    for (let i = 0; i < n; i++) {
      const j = i * 3, e = easeIO(clamp((T - meta[i * 4 + 2] * 0.35) / 0.65, 0, 1));
      const dx = to[j] - from[j], dy = to[j + 1] - from[j + 1], dz = to[j + 2] - from[j + 2];
      let sx = -dz, sz = dx; const sl = Math.hypot(sx, sz);
      if (sl > 1e-4) { sx /= sl; sz /= sl; } else { sx = 1; sz = 0; }
      const arc = Math.sin(Math.PI * e) * 0.22 * Math.hypot(dx, dy, dz);
      out[j] = from[j] + dx * e + sx * arc; out[j + 1] = from[j + 1] + dy * e; out[j + 2] = from[j + 2] + dz * e + sz * arc;
    }
    return out;
  }
  function recolorCloud() {
    if (!st.el || !clouds.live) return;
    const G = cloud.geometry.attributes, c0 = G.aCol0.array, c1 = G.aCol1.array, meta = G.aMeta.array;
    const subs = subshellList(st.el);
    for (let i = 0; i < clouds.live; i++) {
      const s = subs[meta[i * 4] | 0]; if (!s) continue;
      const col = orbColor(s.n, s.l, clouds.m[i], st.dark), j = i * 3;
      c0[j] = c1[j] = col[0]; c0[j + 1] = c1[j + 1] = col[1]; c0[j + 2] = c1[j + 2] = col[2];
    }
    clouds.col = new Float32Array(c1.subarray(0, clouds.live * 3));
    G.aCol0.needsUpdate = G.aCol1.needsUpdate = true;
  }

  /* ---- boundary lobes for the outer subshells ---- */
  function buildLobes(el, instant) {
    for (const m of lobes.children) m.userData.dying = true;
    const nmax = el.shells.length;
    const chosen = subshellList(el).filter((s) => hasLobes(s, nmax));
    const nLobes = chosen.reduce((a, s) => a + Math.min(s.cnt, 2 * s.l + 1), 0);
    const dim = clamp(Math.sqrt(5 / Math.max(1, nLobes)), 0.6, 1);
    for (const s of chosen) {
      const occ = hund(s.cnt, 2 * s.l + 1);
      occ.forEach((o, m) => {
        if (!o) return;
        const mesh = new THREE.Mesh(lobeGeometry(s.l, m), null);
        mesh.userData = { sub: s.i, n: s.n, l: s.l, m, fade: instant ? 1 : 0, grow: instant ? 1 : 0, dying: false,
          base: (s.l === 0 ? 0.3 : 0.95 * dim) * (o === 2 ? 1 : 0.8), size: shellR(s.n) * (s.l === 0 ? 1.3 : 1.5) };
        mesh.material = lobeMaterial(...lobeColors(s.n, s.l, m), !st.dark);
        mesh.renderOrder = 1;
        lobes.add(mesh);
      });
    }
  }
  function lobeColors(n, l, m) {
    const c = orbColor(n, l, m, st.dark);
    const k = st.dark ? 0.62 : 1.35;
    return [c, c.map((v) => clamp(v * k, 0, 1))];
  }
  function recolorLobes() {
    for (const mesh of lobes.children) {
      const u = mesh.userData, [a, b] = lobeColors(u.n, u.l, u.m);
      mesh.material.uniforms.uColA.value.set(...a); mesh.material.uniforms.uColB.value.set(...b);
      setLightBlend(mesh.material, !st.dark);
    }
  }
  function updateLobes(dt) {
    let busyL = false;
    const sc = anim.cloudScale;
    for (const mesh of [...lobes.children]) {
      const u = mesh.userData;
      if (u.dying) { u.fade = Math.max(0, u.fade - dt * 2.4); if (u.fade <= 0) { lobes.remove(mesh); mesh.material.dispose(); continue; } busyL = true; }
      else if (u.fade < 1) { u.fade = Math.min(1, u.fade + dt * (st.motion ? 0.9 : 3)); busyL = true; }
      if (u.grow < 1 && !u.dying) { u.grow = Math.min(1, u.grow + dt * (st.motion ? 0.75 : 3)); busyL = true; }
      const shellVis = clamp(anim.shellMax - u.n + 1, 0, 1);
      const subVis = u.dying ? 1 : cloudMat.uniforms.uSubVis.value[u.sub];
      u.sizeK = u.sizeK || 1;
      const g = easeIO(u.grow);
      mesh.scale.setScalar(u.size * sc * (0.35 + 0.65 * g) * (1 + (1 - shellVis) * 0.45) * (u.dying ? 1 + (1 - u.fade) * 0.3 : 1));
      const op = u.base * u.fade * shellVis * subVis * anim.modeT.orbital;
      mesh.material.uniforms.uOpacity.value = op;
      mesh.visible = op > 0.003;
    }
    return busyL;
  }

  /* ---- Bohr shells ---- */
  const TRAIL = 8;
  function ringQuat(n) {
    const q = new THREE.Quaternion();
    const deg = Math.PI / 180;
    q.setFromEuler(new THREE.Euler((n % 2 ? 1 : -1) * (2.5 + n * 0.9) * deg, 0, (((n * 37) % 15) - 7) * deg));
    return q;
  }
  function buildBohr(el, instant) {
    // rings
    for (const r of [...rings.children]) { rings.remove(r); r.geometry.dispose(); r.material.dispose(); }
    el.shells.forEach((cnt, i) => {
      const n = i + 1, R = shellR(n), pts = [];
      for (let k = 0; k <= 160; k++) { const a = (k / 160) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      line.quaternion.copy(ringQuat(n)); line.userData.n = n;
      rings.add(line);
    });
    styleRings();
    // electrons: which subshell each belongs to (for its colour and legend toggle)
    const subs = subshellList(el), list = [];
    const perShell = el.shells.map(() => []);
    for (const s of subs) for (let k = 0; k < s.cnt; k++) perShell[s.n - 1].push(s);
    perShell.forEach((arr, si) => arr.forEach((s, k) => list.push({ n: si + 1, k, c: arr.length, sub: s.i, col: subColor(s.n, s.l, st.dark) })));
    const old = bohr.electrons;
    const r = rng(el.z * 13 + 1);
    list.forEach((e, idx) => {
      e.phase0 = r() * 0.4 + e.n * 0.7;
      e.q = ringQuat(e.n);
      const o = old[idx];
      e.from = instant ? null : (o ? o.pos.clone() : new THREE.Vector3((r() - 0.5) * 0.1, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1));
      e.fromCol = o ? o.col : e.col;
      e.pos = new THREE.Vector3();
    });
    for (let idx = list.length; idx < old.length; idx++) {
      const o = old[idx];
      bohr.ghosts.push({ pos: o.pos.clone(), vel: o.pos.clone().normalize().multiplyScalar(2.2), life: 1, col: o.col });
    }
    bohr.electrons = list;
    bohr.t = instant ? 1 : 0;
  }
  function styleRings() {
    for (const line of rings.children) {
      line.material.color.set(st.dark ? 0x7fb5ae : 0x52706b);
      line.material.blending = st.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      line.material.needsUpdate = true;
    }
  }
  const tmpV = new THREE.Vector3();
  function bohrPos(e, time, back, out) {
    const speed = st.motion ? 0.75 / Math.pow(e.n, 0.9) : 0;
    const a = e.phase0 + (e.k * TAU) / e.c + time * speed - back;
    const R = shellR(e.n);
    return out.set(Math.cos(a) * R, 0, Math.sin(a) * R).applyQuaternion(e.q);
  }
  function updateBohr(dt) {
    bohr.time += dt;
    if (bohr.t < 1) bohr.t = Math.min(1, bohr.t + dt / (st.motion ? 1.4 : 0.4));
    const G = bohrPts.geometry.attributes, to = G.aTo.array, c1 = G.aCol1.array, al = G.aAlpha.array, meta = G.aMeta.array;
    let i = 0;
    const big = bohr.electrons.length > 40 ? 0.85 : 1;
    const step = st.motion ? 0.055 : 0;
    for (const [idx, e] of bohr.electrons.entries()) {
      const local = easeIO(clamp((bohr.t - (idx % 12) * 0.02) / 0.76, 0, 1));
      for (let k = 0; k <= TRAIL; k++) {
        if (k > 0 && !st.motion) break;
        bohrPos(e, bohr.time, k * step, tmpV);
        if (e.from && local < 1) tmpV.lerpVectors(e.from, tmpV, local);
        if (k === 0) e.pos.copy(tmpV);
        const j = i * 3;
        to[j] = tmpV.x; to[j + 1] = tmpV.y; to[j + 2] = tmpV.z;
        const col = local < 1 ? e.fromCol.map((v, q) => v + (e.col[q] - v) * local) : e.col;
        c1[j] = col[0]; c1[j + 1] = col[1]; c1[j + 2] = col[2];
        al[i * 2 + 1] = k === 0 ? 1 : 0.5 * Math.pow(1 - k / (TRAIL + 1), 1.6);
        meta[i * 4] = e.sub; meta[i * 4 + 1] = e.n; meta[i * 4 + 2] = 0; meta[i * 4 + 3] = (k === 0 ? 0.42 : 0.26 * (1 - k / (TRAIL + 2))) * big;
        i++;
      }
    }
    if (bohr.t >= 1) for (const e of bohr.electrons) e.from = null;
    for (const g of bohr.ghosts) {
      g.life -= dt * 1.2; g.pos.addScaledVector(g.vel, dt);
      const j = i * 3;
      to[j] = g.pos.x; to[j + 1] = g.pos.y; to[j + 2] = g.pos.z;
      c1[j] = g.col[0]; c1[j + 1] = g.col[1]; c1[j + 2] = g.col[2];
      al[i * 2 + 1] = Math.max(0, g.life);
      meta[i * 4] = GHOST_SUB; meta[i * 4 + 1] = 0; meta[i * 4 + 2] = 0; meta[i * 4 + 3] = 0.28;
      i++;
    }
    bohr.ghosts = bohr.ghosts.filter((g) => g.life > 0);
    bohrPts.geometry.setDrawRange(0, i);
    G.aTo.needsUpdate = G.aCol1.needsUpdate = G.aAlpha.needsUpdate = G.aMeta.needsUpdate = true;
  }

  /* ---- nucleus ---- */
  const PROTON = new THREE.Color(0xf0533f), NEUTRON = new THREE.Color(0xa7b6c6);
  const nucTmp = new THREE.Object3D(), colTmp = new THREE.Color();
  function buildNucleus(el, instant) {
    const lay = nucleusLayout(el.z, el.isotope ? el.isotope.neutrons : 0);
    const old = nuc.cur, A = lay.nucleons.length, cap = Math.max(A, old.length);
    nuc.from = []; nuc.to = []; nuc.scaleFrom = []; nuc.scaleTo = []; nuc.colFrom = []; nuc.colTo = [];
    for (let i = 0; i < cap; i++) {
      const target = i < A ? lay.nucleons[i] : null;
      const was = old[i];
      nuc.to.push(target ? new THREE.Vector3(...target.p) : was.p.clone().multiplyScalar(1.6));
      nuc.from.push(was && !instant ? was.p.clone() : target ? new THREE.Vector3(...target.p).multiplyScalar(instant ? 1 : 1.8) : new THREE.Vector3());
      nuc.scaleFrom.push(was && !instant ? was.s : instant ? 1 : 0);
      nuc.scaleTo.push(target ? 1 : 0);
      nuc.colFrom.push(was && !instant ? was.c.clone() : (target && target.type === 0 ? PROTON : NEUTRON).clone());
      nuc.colTo.push(target ? (target.type === 0 ? PROTON : NEUTRON).clone() : was.c.clone());
    }
    nuc.cur = nuc.from.map((p, i) => ({ p: p.clone(), s: nuc.scaleFrom[i], c: nuc.colFrom[i].clone() }));
    nuc.A = A; nuc.radius = lay.radius; nuc.t = instant ? 1 : 0;
    nucMesh.count = Math.min(cap, 420);
    writeNucleus(0);
  }
  function writeNucleus(time) {
    const T = nuc.t, wob = st.motion ? 0.035 : 0;
    for (let i = 0; i < nucMesh.count; i++) {
      const e = easeIO(clamp((T - (i % 17) * 0.025) / 0.6, 0, 1));
      const c = nuc.cur[i];
      c.p.lerpVectors(nuc.from[i], nuc.to[i], e);
      c.s = nuc.scaleFrom[i] + (nuc.scaleTo[i] - nuc.scaleFrom[i]) * e;
      c.c.copy(nuc.colFrom[i]).lerp(nuc.colTo[i], e);
      nucTmp.position.copy(c.p);
      if (wob) nucTmp.position.addScalar(Math.sin(time * 3 + i * 1.7) * wob);
      nucTmp.scale.setScalar(Math.max(c.s, 1e-4));
      nucTmp.updateMatrix();
      nucMesh.setMatrixAt(i, nucTmp.matrix);
      nucMesh.setColorAt(i, colTmp.copy(c.c));
    }
    nucMesh.instanceMatrix.needsUpdate = true;
    if (nucMesh.instanceColor) nucMesh.instanceColor.needsUpdate = true;
    if (T >= 1 && nucMesh.count > nuc.A) {
      nucMesh.count = nuc.A; nuc.cur.length = nuc.A; nuc.from.length = nuc.to.length = nuc.A;
      nuc.scaleFrom.length = nuc.scaleTo.length = nuc.colFrom.length = nuc.colTo.length = nuc.A;
    }
  }

  /* ---- framing per mode ---- */
  function targets() {
    const nmax = st.el ? st.el.shells.length : 1, outer = shellR(nmax);
    const m = st.mode;
    const frame = m === 'orbital' ? outer * 1.72 : m === 'bohr' ? outer * 1.12 + 0.2 : 1.9;
    const nucR = m === 'nucleus' ? 1.55 : m === 'bohr' ? Math.min(0.42, shellR(1) * 0.48) : Math.max(0.05, outer * 0.035);
    return { frame, nucR, cloudScale: m === 'orbital' ? 1 : m === 'bohr' ? 0.92 : 2.6 };
  }
  function fitDistance(frame) {
    const vf = (cam.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * (W / H));
    return frame / Math.sin(Math.min(vf, hf) / 2);
  }

  /* ---- interaction: drag to turn, optional wheel and pinch zoom, arrow keys ---- */
  const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, id: null, pts: new Map(), pinch: 0 };
  const qTmp = new THREE.Quaternion(), axY = new THREE.Vector3(0, 1, 0), axX = new THREE.Vector3(1, 0, 0);
  function turn(dx, dy) {
    qTmp.setFromAxisAngle(axY, dx); spin.quaternion.premultiply(qTmp);
    qTmp.setFromAxisAngle(axX, dy); spin.quaternion.premultiply(qTmp);
  }
  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.pts.size === 2 && opt.zoom) { const [a, b] = [...drag.pts.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.vx = drag.vy = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      kick();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag.on) return;
      const p = drag.pts.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (drag.pts.size === 2 && opt.zoom) {
        const [a, b] = [...drag.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (drag.pinch) cam.zoom = clamp(cam.zoom * (drag.pinch / d), 0.35, 2.4);
        drag.pinch = d; kick(); return;
      }
      const dx = (e.clientX - drag.x) * 0.008, dy = (e.clientY - drag.y) * 0.008;
      drag.x = e.clientX; drag.y = e.clientY;
      if (dx || dy) st.userTurned = true;
      turn(dx, dy); drag.vx = dx; drag.vy = dy; kick();
    });
    const end = (e) => { drag.pts.delete(e.pointerId); if (!drag.pts.size) drag.on = false; drag.pinch = 0; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    if (opt.zoom) canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 2.4); kick(); }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      const k = e.key, s = 0.12;
      if (k === 'ArrowLeft') turn(-s, 0); else if (k === 'ArrowRight') turn(s, 0);
      else if (k === 'ArrowUp') turn(0, -s); else if (k === 'ArrowDown') turn(0, s);
      else if (k === '+' || k === '=') cam.zoom = clamp(cam.zoom / 1.15, 0.35, 2.4);
      else if (k === '-' || k === '_') cam.zoom = clamp(cam.zoom * 1.15, 0.35, 2.4);
      else return;
      st.userTurned = true;
      e.preventDefault(); kick();
    });
  }

  /* ---- loop: runs only while on screen, the tab is visible and something is moving ---- */
  let raf = 0, last = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, slowFor = 0;
  const clock = { t: 0 };
  function busy() {
    if (st.motion) return true;
    if (drag.on || Math.abs(drag.vx) + Math.abs(drag.vy) > 1e-4) return true;
    if (clouds.t < 1 || bohr.t < 1 || nuc.t < 1 || bohr.ghosts.length) return true;
    return !!st.settling;
  }
  function drawn() { if (canvas && canvas.style.visibility) canvas.style.visibility = ''; }
  function kick() {
    if (!renderer || raf || st.destroyed || !st.visible || !st.pageVisible) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (st.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    step(dt);
    renderer.render(scene, camera);
    drawn();
    // fps over the last second; if it stays low, render at a lower pixel ratio
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1) {
      st.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fpsTag) fpsTag.textContent = `${st.fps.toFixed(0)} fps`;
      if (st.fps < 40 && dpr > 1) { slowFor++; if (slowFor >= 2) { st.dprCap = Math.max(1, dpr - 0.25); slowFor = 0; resize(); } } else slowFor = 0;
    }
    if (busy() && st.visible && st.pageVisible) raf = requestAnimationFrame(frame);
  }
  function step(dt) {
    clock.t += dt;
    const tg = targets();
    let settling = false;
    const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;
    // camera distance
    const dist = fitDistance(tg.frame) * cam.zoom;
    cam.dist = damp(cam.dist, dist, 3.2, dt); if (!near(cam.dist, dist, 0.002)) settling = true;
    camera.position.set(0, 0, cam.dist); camera.lookAt(0, 0, 0);
    // auto turn and drag inertia
    if (!drag.on) {
      if (Math.abs(drag.vx) + Math.abs(drag.vy) > 1e-4) { turn(drag.vx, drag.vy); drag.vx *= Math.pow(0.04, dt); drag.vy *= Math.pow(0.04, dt); }
      else { drag.vx = drag.vy = 0; }
      if (st.mode === 'bohr' && !st.userTurned) {
        // shells read best seen from a little above: ease the atom to that angle unless the visitor has turned it
        if (spin.quaternion.angleTo(Q_BOHR) > 0.002) { spin.quaternion.slerp(Q_BOHR, 1 - Math.exp(-2.6 * dt)); settling = true; }
      } else if (st.motion && st.mode !== 'bohr') { qTmp.setFromAxisAngle(axY, dt * 0.16); spin.quaternion.premultiply(qTmp); }
    }
    anim.cut = damp(anim.cut, cutOn() ? 1 : 0, 4, dt);
    if (!near(anim.cut, cutOn() ? 1 : 0)) settling = true;
    cloudMat.uniforms.uCut.value = anim.cut;
    cloudMat.uniforms.uSlab.value = 0.2 * shellR(st.el ? st.el.shells.length : 1) * anim.cloudScale;
    // mode fades
    for (const m of ['orbital', 'bohr', 'nucleus']) {
      const goal = st.mode === m ? 1 : 0;
      anim.modeT[m] = damp(anim.modeT[m], goal, 4.5, dt);
      if (!near(anim.modeT[m], goal)) settling = true;
    }
    anim.cloudScale = damp(anim.cloudScale, tg.cloudScale, 3.5, dt);
    anim.nucR = damp(anim.nucR, tg.nucR, 3.5, dt);
    if (!near(anim.cloudScale, tg.cloudScale) || !near(anim.nucR, tg.nucR, 1e-4)) settling = true;
    anim.shellMax = damp(anim.shellMax, st.shellsShown, 6, dt);
    if (!near(anim.shellMax, st.shellsShown)) settling = true;
    for (let k = 0; k < MAX_SUB; k++) {
      // a legend chip under the pointer or keyboard focus spotlights its subshell and dims the rest
      const goal = k === GHOST_SUB ? 1 : st.subVis[k] * (st.solo == null || st.solo === k ? 1 : 0.1);
      const cur = cloudMat.uniforms.uSubVis.value[k];
      const v = damp(cur, goal, 8, dt);
      cloudMat.uniforms.uSubVis.value[k] = v; bohrMat.uniforms.uSubVis.value[k] = v;
      if (!near(v, goal)) settling = true;
    }
    // cloud
    if (clouds.t < 1) {
      clouds.t = Math.min(1, clouds.t + dt / clouds.dur);
      if (clouds.t >= 1) { cloud.geometry.setDrawRange(0, clouds.live); clouds.count = clouds.live; }
    }
    const cu = cloudMat.uniforms;
    cu.uT.value = clouds.t; cu.uTime.value = clock.t; cu.uShellMax.value = anim.shellMax;
    cu.uAlpha.value = anim.modeT.orbital; cu.uScale.value = anim.cloudScale;
    cu.uTwinkle.value = st.motion ? 1 : 0; cu.uDrift.value = st.motion ? 1 : 0;
    cloud.visible = anim.modeT.orbital > 0.004;
    if (updateLobes(dt)) settling = true;
    // bohr
    const bu = bohrMat.uniforms;
    bu.uShellMax.value = anim.shellMax; bu.uAlpha.value = anim.modeT.bohr; bu.uTime.value = clock.t;
    bohrPts.visible = rings.visible = anim.modeT.bohr > 0.004;
    if (bohrPts.visible || bohr.t < 1) updateBohr(dt);
    for (const line of rings.children) {
      const sv = clamp(anim.shellMax - line.userData.n + 1, 0, 1);
      line.material.opacity = (st.dark ? 0.5 : 0.6) * anim.modeT.bohr * sv;
      line.scale.setScalar(1 + (1 - sv) * 0.45);
    }
    // nucleus
    if (nuc.t < 1) nuc.t = Math.min(1, nuc.t + dt / (st.motion ? 1.3 : 0.4));
    if (nuc.t < 1 || st.motion || settling) writeNucleus(clock.t);
    nucGroup.scale.setScalar(anim.nucR / Math.max(0.5, nuc.radius));
    st.settling = settling;
  }

  /* ---- visibility ---- */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) st.visible = e.isIntersecting;
    if (st.visible) kick();
  }, { threshold: 0.01 });
  io.observe(stage);
  const onVis = () => { st.pageVisible = document.visibilityState !== 'hidden'; if (st.pageVisible) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const onReduce = () => { api.setMotion(!reduceMQ.matches); };
  reduceMQ.addEventListener('change', onReduce);

  /* ---- UI text ---- */
  function neutronText(el) { return el.isotope ? String(el.isotope.neutrons) : U('info.neutronsNone'); }
  function summary() {
    const el = st.el;
    if (!el) return '';
    const iso = el.isotope;
    return U('alt.summary', {
      name: el.name, z: el.z, protons: el.z, electrons: el.z, shellCount: el.shells.length, shells: el.shells.join(', '),
      config: el.predicted ? `${el.config} (${U('tag.predicted').toLowerCase()})` : el.config, mode: U(`mode.${st.mode}`).toLowerCase(),
      neutronsText: iso ? U('alt.neutrons', { neutrons: iso.neutrons, name: el.name.toLowerCase(), A: iso.A }) : U('alt.noNeutrons'),
    });
  }
  function noteText() {
    const el = st.el;
    if (st.mode === 'orbital') return U('note.orbital');
    if (st.mode === 'bohr') return U('note.bohr');
    return el.isotope ? U('note.nucleus', { protons: el.z, neutrons: el.isotope.neutrons, name: el.name.toLowerCase(), A: el.isotope.A })
      : U('note.nucleusProtonsOnly', { protons: el.z, name: el.name });
  }
  let liveTimer = 0;
  function refreshText() {
    const el = st.el;
    badge.children[0].textContent = el.symbol;
    badge.children[1].textContent = el.name;
    badge.children[2].textContent = `Z = ${el.z}`;
    // elements whose configuration is a prediction (see atoms.json sources, pubchem-pt) carry a tag
    badge.children[3].textContent = U('tag.predicted');
    badge.children[3].hidden = !el.predicted;
    const s = summary();
    if (canvas) canvas.setAttribute('aria-label', s);
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = s; }, 400);
    if (opt.ui) {
      ui.modes.setAttribute('aria-label', U('mode.group'));
      for (const m in ui.modeBtn) { ui.modeBtn[m].textContent = U(`mode.${m}`); ui.modeBtn[m].setAttribute('aria-pressed', String(st.mode === m)); }
      ui.pause.textContent = st.motion ? U('motion.pause') : U('motion.play');
      ui.pause.setAttribute('aria-pressed', String(!st.motion));
      ui.note.textContent = noteText() + (el.predicted ? ' ' + U('tag.predictedNote') : '');
      const nmax = el.shells.length;
      ui.peel.max = String(nmax); ui.peel.value = String(Math.min(st.shellsShown, nmax));
      ui.peel.disabled = nmax < 2 || st.mode === 'nucleus';
      ui.peelWrap.hidden = st.mode === 'nucleus';
      ui.peelLabel.textContent = U('peel.label');
      ui.peelOut.textContent = U('peel.value', { shown: Math.min(st.shellsShown, nmax), total: nmax });
      ui.legend.hidden = st.mode === 'nucleus';
    }
    if (opt.info) {
      const iso = el.isotope;
      ui.info.replaceChildren(
        h('div', {}, h('dt', { text: U('info.protons') }), h('dd', { text: String(el.z) })),
        h('div', {}, h('dt', { text: U('info.neutrons') }), h('dd', { text: neutronText(el), title: iso ? `${el.name}-${iso.A}` : null })),
        h('div', {}, h('dt', { text: U('info.electrons') }), h('dd', { text: String(el.z) })),
        h('div', {}, h('dt', { text: U('info.shells') }), h('dd', { text: el.shells.join(', ') })),
        h('div', { class: 'atomv-wide' }, h('dt', { text: U('info.config') }), h('dd', {}, configNodes(el.configMarkup),
          el.predicted ? h('span', { class: 'atomv-pred', title: U('tag.predictedNote') }, U('tag.predicted')) : null)),
      );
      ui.src.textContent = U('source.line');
    }
  }
  function buildLegend() {
    if (!opt.ui) return;
    const el = st.el;
    ui.legend.replaceChildren();
    ui.legend.setAttribute('aria-label', U('legend.title'));
    ui.legend.title = U('legend.hint');
    ui.legend.classList.toggle('atomv-two', el.subshells.length > 9);
    for (const s of subshellList(el)) {
      const col = subColor(s.n, s.l, st.dark);
      const b = h('button', {
        class: 'atomv-chip', type: 'button', 'aria-pressed': String(st.subVis[s.i] > 0.5),
        onclick: () => { st.subVis[s.i] = st.subVis[s.i] > 0.5 ? 0 : 1; b.setAttribute('aria-pressed', String(st.subVis[s.i] > 0.5)); kick(); },
      }, h('i', { style: `background:${cssColor(col)};color:${cssColor(col)}`, 'aria-hidden': 'true' }), `${s.n}${L_NAME[s.l]}`, h('sup', { text: String(s.cnt) }));
      const spot = (on) => { st.solo = on ? s.i : null; kick(); };
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') spot(true); });
      b.addEventListener('pointerleave', () => spot(false));
      b.addEventListener('focus', () => spot(true));
      b.addEventListener('blur', () => spot(false));
      ui.legend.append(h('li', {}, b));
    }
  }
  function applyTheme() {
    const dark = themeFromPage();
    const changed = dark !== st.dark;
    st.dark = dark;
    root.setAttribute('data-stage', dark ? 'dark' : 'light');
    if (renderer) {
      renderer.setClearColor(dark ? 0x060b0e : 0xf3f7f6, 1);
      setLightBlend(cloudMat, !dark); setLightBlend(bohrMat, !dark);
      if (changed && st.el) { recolorCloud(); recolorLobes(); for (const e of bohr.electrons) { const s = subshellList(st.el)[e.sub]; e.col = subColor(s.n, s.l, dark); } }
      styleRings();
      kick();
    } else if (st.el) drawFallback();
    if (changed && st.el) buildLegend();
  }
  function drawFallback() {
    st.fallback.replaceChildren(shellSVG(st.el, st.dark), h('p', { text: U('fallback.note') }));
    stage.setAttribute('role', 'img'); stage.setAttribute('aria-label', summary());
  }

  /* ---- public API ---- */
  const api = {
    ready: null,
    get element() { return st.el; },
    get mode() { return st.mode; },
    get fps() { return st.fps; },
    get points() { return clouds.live; },
    setElement(key) {
      if (!st.data) { atomicNumber = key; return api; }
      const el = findElement(st.data, key);
      if (st.el && el.z === st.el.z) return api;
      const first = !st.el;
      st.el = el;
      st.shellsShown = el.shells.length;
      st.subVis.fill(1); st.solo = null;
      if (renderer) {
        buildCloud(el, first && !st.motion);
        buildLobes(el, first && !st.motion);
        buildBohr(el, first && !st.motion);
        buildNucleus(el, first && !st.motion);
        if (first) {
          anim.shellMax = st.shellsShown;
          const tg = targets();
          for (const m in anim.modeT) anim.modeT[m] = st.mode === m ? 1 : 0;
          anim.cloudScale = tg.cloudScale; anim.nucR = tg.nucR;
          cam.dist = fitDistance(tg.frame) * (st.motion ? 1.25 : 1);
        }
      } else drawFallback();
      buildLegend();
      refreshText();
      kick();
      if (typeof opt.onChange === 'function') opt.onChange({ z: el.z, symbol: el.symbol, mode: st.mode });
      return api;
    },
    setMode(m) {
      if (!['orbital', 'bohr', 'nucleus'].includes(m) || m === st.mode) return api;
      st.mode = m; st.userTurned = false;
      if (st.el) { refreshText(); if (typeof opt.onChange === 'function') opt.onChange({ z: st.el.z, symbol: st.el.symbol, mode: m }); }
      kick();
      return api;
    },
    setShells(k) {
      if (!st.el) return api;
      st.shellsShown = clamp(k | 0, 1, st.el.shells.length);
      refreshText(); kick();
      return api;
    },
    setMotion(on) {
      st.motion = !!on;
      if (st.el) refreshText();
      kick();
      return api;
    },
    resetView() { spin.quaternion.setFromEuler(new THREE.Euler(0.32, -0.5, 0)); cam.zoom = 1; kick(); return api; },
    destroy() {
      if (st.destroyed) return;
      st.destroyed = true;
      cancelAnimationFrame(raf); raf = 0; clearTimeout(liveTimer);
      ro.disconnect(); io.disconnect(); themeObs.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reduceMQ.removeEventListener('change', onReduce);
      if (renderer) {
        cloud.geometry.dispose(); cloudMat.dispose(); bohrPts.geometry.dispose(); bohrMat.dispose();
        for (const r of rings.children) { r.geometry.dispose(); r.material.dispose(); }
        nucMesh.geometry.dispose(); nucMesh.material.dispose(); nucMesh.dispose();
        for (const m of lobes.children) m.material.dispose();
        for (const g of lobeGeoCache.values()) g.dispose();
        lobeGeoCache.clear();
        renderer.dispose(); renderer.forceContextLoss();
      }
      root.remove();
      if (instances.get(container) === api) instances.delete(container);
    },
  };
  st.dark = themeFromPage();
  root.setAttribute('data-stage', st.dark ? 'dark' : 'light');
  api.ready = loadData().then((data) => {
    if (st.destroyed) return api;
    st.data = data;
    applyTheme();
    resize();
    api.setElement(atomicNumber);
    return api;
  });
  return api;
}
