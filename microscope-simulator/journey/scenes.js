// The home-page "powers of ten" journey: six scenes drawn by code, nested inside each other, and one camera that
// zooms through them. Each scene is built in its own units: 10 units = the short side of the screen when you arrive
// at that level (level.view metres). Every frame each scene is scaled by view / currentView and slid so the next
// scene's spot stays under the camera, which makes eight orders of magnitude feel like one unbroken move.
// Sizes follow web/journey/journey.json (paramecium 240 um, mitochondrion 2 by 1 um, ATP synthase head 9 nm,
// real ATP atom positions). Everything else is illustrative. Cheap shaders only: rim light, soft points, lines.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- shared uniforms and shaders ---------- */
const G = {
  uTime: { value: 0 }, uNear: { value: 1 }, uFocus: { value: 10 }, uPx: { value: 500 }, uLight: { value: 0 }, uMaxPx: { value: 80 },
};

const RIM_VS = `
uniform float uTime; uniform float uWob;
varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vZ;
void main() {
  vec3 p = position; vec3 n = normal;
  #ifdef USE_INSTANCING
    p = (instanceMatrix * vec4(p, 1.0)).xyz; n = mat3(instanceMatrix) * n;
  #endif
  if (uWob > 0.0) p += n * uWob * sin(p.x * 2.3 + uTime * 0.9) * sin(p.y * 2.9 + uTime * 0.7 + p.z * 1.7);
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalMatrix * n; vV = -mv.xyz; vZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const RIM_FS = `
uniform vec3 uRim; uniform vec3 uCore; uniform float uA; uniform float uCoreA; uniform float uPow; uniform float uNear; uniform float uLight; uniform float uSpec;
varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vZ;
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float nd = dot(n, v); if (nd < 0.0) { n = -n; nd = -nd; }
  float f = pow(1.0 - nd, uPow);
  float d = max(dot(n, normalize(vec3(-0.45, 0.75, 0.5))), 0.0);
  vec3 core = uCore * vTint * (0.5 + 0.75 * d);
  vec3 rim = uRim * mix(vec3(1.0), vTint, 0.8);
  vec3 c = mix(core, rim, f) + uSpec * pow(d, 24.0) * mix(vec3(1.0), vec3(0.0), uLight);
  float a = uA * mix(uCoreA, 1.0, f);
  a *= smoothstep(uNear * 0.35, uNear, vZ);
  if (a < 0.002) discard;
  gl_FragColor = vec4(c, a);
}`;

const PTS_VS = `
attribute float aSeed; attribute float aSize; attribute vec3 aColor;
uniform float uTime; uniform float uScale; uniform float uPx; uniform float uFocus; uniform float uNear; uniform float uDrift; uniform float uSpeed; uniform float uMaxPx; uniform float uDof; uniform float uSoft;
varying vec3 vC; varying float vA; varying float vS;
void main() {
  float t = uTime * uSpeed;
  vec3 p = position + uDrift * vec3(sin(t * 0.7 + aSeed * 6.283), sin(t * 0.53 + aSeed * 17.0), sin(t * 0.41 + aSeed * 29.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = -mv.z;
  float blur = min(abs(z - uFocus) / uFocus, 2.5) * uDof;
  float s = aSize * uScale * uPx / max(z, 0.001) * (1.0 + 1.6 * blur);
  vA = (1.0 / (1.0 + 3.0 * blur * blur)) * smoothstep(uNear * 0.3, uNear, z);
  if (s > uMaxPx) { vA *= (uMaxPx * uMaxPx) / (s * s); s = uMaxPx; }
  if (s < 1.5) { vA *= s / 1.5; s = 1.5; }
  vS = clamp(max(uSoft, 0.3 + blur * 0.5), 0.3, 1.0);
  vC = aColor;
  gl_PointSize = s;
  gl_Position = projectionMatrix * mv;
}`;
const PTS_FS = `
uniform float uA; uniform float uLight; uniform float uLightA;
varying vec3 vC; varying float vA; varying float vS;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(1.0 - vS, 1.0, d)) * vA * uA * mix(1.0, uLightA, uLight);
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vC, pow(vC, vec3(1.8)) * 0.8, uLight), a);
}`;

const LINE_VS = `
attribute vec3 aN; attribute vec3 aT; attribute float aTip; attribute float aPhase; attribute float aLen;
uniform float uTime; uniform float uFreq; uniform float uAmp; uniform float uNear;
varying float vTip; varying float vZ;
void main() {
  float w = sin(uTime * uFreq - aPhase);
  vec3 p = position + aTip * (aN * aLen + aT * aLen * uAmp * (w + 0.35 * aTip * cos(uTime * uFreq - aPhase)));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTip = aTip; vZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const LINE_FS = `
uniform vec3 uColor; uniform float uA; uniform float uNear;
varying float vTip; varying float vZ;
void main() {
  float a = uA * (1.0 - 0.65 * vTip) * smoothstep(uNear * 0.35, uNear, vZ);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// Lipid heads on the inner membrane: a packed lattice of shaded dots drawn in the fragment shader, fading out at the edges.
const LIPID_VS = `
varying vec2 vP; varying float vZ;
void main() { vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`;
const LIPID_FS = `
uniform vec3 uBase; uniform vec3 uDeep; uniform float uA; uniform float uTime; uniform float uNear; uniform float uSpacing; uniform float uR0; uniform float uR1;
varying vec2 vP; varying float vZ;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 q = vP / uSpacing;
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 cell = floor(q); vec2 f = fract(q) - 0.5;
  float r = h21(cell);
  f += 0.08 * vec2(sin(uTime * 1.7 + r * 40.0), cos(uTime * 1.3 + r * 23.0));
  float d = length(f) / 0.47;
  float h = sqrt(max(0.0, 1.0 - d * d));
  float aa = clamp(fwidth(q.x) * 1.5, 0.0, 1.0);
  float pattern = mix(h, 0.55, aa);
  vec3 c = mix(uDeep, uBase * (0.75 + 0.25 * r), pattern);
  float edge = 1.0 - smoothstep(uR0, uR1, length(vP));
  float a = uA * edge * smoothstep(uNear * 0.35, uNear, vZ);
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;

const BG_VS = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FS = `
uniform vec3 uC0; uniform vec3 uC1; uniform vec2 uAspect;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = (vUv - vec2(0.5, 0.56)) * uAspect;
  float r = length(p);
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 1.05, r));
  c += (h21(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------- material factories (each remembers its colour so the theme can be switched live) ---------- */
function makeLevel() { return { group: new THREE.Group(), rims: [], pts: [], lines: [], lipids: [], alpha: 0 }; }

function rim(L, hex, o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: G.uTime, uNear: G.uNear, uLight: G.uLight, uWob: { value: o.wob || 0 },
      uRim: { value: new THREE.Color() }, uCore: { value: new THREE.Color() },
      uA: { value: 1 }, uCoreA: { value: o.coreA ?? 0.12 }, uPow: { value: o.pow ?? 2.2 }, uSpec: { value: o.spec ?? 0.25 },
    },
    vertexShader: RIM_VS, fragmentShader: RIM_FS, transparent: true, depthWrite: !!o.solid, side: o.side ?? (o.solid ? THREE.FrontSide : THREE.DoubleSide),
  });
  m.userData = { base: new THREE.Color(hex), o, op: o.op ?? 1 };
  L.rims.push(m);
  return m;
}
function points(L, positions, colors, sizes, o = {}) {
  const n = positions.length / 3, seed = new Float32Array(n), R = rng(o.seed || 11);
  for (let i = 0; i < n; i++) seed[i] = R();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(sizes), 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: G.uTime, uPx: G.uPx, uFocus: G.uFocus, uNear: G.uNear, uLight: G.uLight, uMaxPx: o.maxPx ? { value: o.maxPx } : G.uMaxPx,
      uScale: { value: 1 }, uA: { value: 1 }, uDrift: { value: o.drift ?? 0.05 }, uSpeed: { value: o.speed ?? 1 },
      uDof: { value: o.dof ?? 1 }, uLightA: { value: o.lightA ?? 0.8 }, uSoft: { value: o.soft ?? 0 },
    },
    vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false,
  });
  m.userData = { op: o.op ?? 1 };
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  L.pts.push(m);
  return p;
}
function lines(L, hex, data, o = {}) {
  // data: arrays position, aN, aT, aTip, aPhase, aLen
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
  g.setAttribute('aN', new THREE.BufferAttribute(new Float32Array(data.aN), 3));
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(data.aT), 3));
  g.setAttribute('aTip', new THREE.BufferAttribute(new Float32Array(data.aTip), 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(data.aPhase), 1));
  g.setAttribute('aLen', new THREE.BufferAttribute(new Float32Array(data.aLen), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uNear: G.uNear, uColor: { value: new THREE.Color() }, uA: { value: 1 }, uFreq: { value: o.freq ?? 6 }, uAmp: { value: o.amp ?? 0.45 } },
    vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
  });
  m.userData = { base: new THREE.Color(hex), op: o.op ?? 1 };
  L.lines.push(m);
  const s = new THREE.LineSegments(g, m); s.frustumCulled = false;
  return s;
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (hex) => new THREE.Color(hex);
function pushCol(arr, c, k = 1) { arr.push(c.r * k, c.g * k, c.b * k); }

/* ---------- level 0: a drop of pond water with a paramecium (10 units = 1 mm) ---------- */
function buildOrganism() {
  const L = makeLevel(), R = rng(3);
  // built in units of 100 um, then scaled so 10 units = the level's 0.6 mm view
  const INNER = 1e-3 / 6e-4, S = new THREE.Group(); S.scale.setScalar(INNER); L.group.add(S); L.inner = INNER;
  const P = new THREE.Group(); P.position.set(1.95, 0.3, 0); P.rotation.set(0.15, 0.25, 0.42); S.add(P);
  const body = new THREE.Group(); P.add(body);
  // slipper shape: 2.4 units long (240 um), about 0.6 wide (4 times as long as broad), with an oral groove
  const shape = (x, y, z) => {
    const k = 0.30 * (1 + 0.1 * x - 0.12 * x * x * x);
    let Y = y * k, Z = z * k * 0.86;
    const groove = 0.42 * Math.exp(-((x - 0.05) ** 2) / 0.07) * Math.max(0, -y) ** 2;
    Y += groove * 0.3 * k / 0.3;
    return v3(x * 1.2, Y, Z);
  };
  const geo = new THREE.SphereGeometry(1, 80, 44);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const s = shape(pa.getX(i), pa.getY(i), pa.getZ(i)); pa.setXYZ(i, s.x, s.y, s.z); }
  geo.computeVertexNormals();
  body.add(new THREE.Mesh(geo, rim(L, '#6fe3cf', { coreA: 0.10, pow: 1.8, wob: 0.004, spec: 0.3 })));
  // macronucleus, micronucleus, contractile vacuoles, food vacuoles
  const sph = new THREE.SphereGeometry(1, 32, 20);
  const mac = new THREE.Mesh(sph, rim(L, '#ffb35c', { coreA: 0.22, pow: 1.6, wob: 0.01 })); mac.scale.set(0.34, 0.13, 0.12); mac.position.set(0.02, 0.03, 0); body.add(mac);
  const mic = new THREE.Mesh(sph, rim(L, '#ffd27a', { coreA: 0.35 })); mic.scale.setScalar(0.04); mic.position.set(0.22, 0.11, 0.04); body.add(mic);
  const vac = new THREE.InstancedMesh(sph, rim(L, '#c59cff', { coreA: 0.18, pow: 1.5 }), 13);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 13; i++) {
    const x = -0.9 + R() * 1.6, r = 0.025 + R() * 0.04, k = 0.3 * (1 + 0.1 * x / 1.2) * Math.sqrt(Math.max(0, 1 - (x / 1.2) ** 2)) * 0.6, a = R() * 6.283;
    m4.compose(v3(x, Math.cos(a) * k, Math.sin(a) * k * 0.8), new THREE.Quaternion(), v3(r, r, r)); vac.setMatrixAt(i, m4);
  }
  vac.setColorAt(0, col('#ffffff')); for (let i = 0; i < 13; i++) vac.setColorAt(i, col(i % 3 ? '#ffffff' : '#ffd0a8'));
  body.add(vac);
  const cv = new THREE.InstancedMesh(sph, rim(L, '#8fdcff', { coreA: 0.3, pow: 1.4 }), 2);
  m4.compose(v3(0.66, 0.1, 0.05), new THREE.Quaternion(), v3(0.06, 0.06, 0.06)); cv.setMatrixAt(0, m4);
  m4.compose(v3(-0.62, 0.1, 0.05), new THREE.Quaternion(), v3(0.06, 0.06, 0.06)); cv.setMatrixAt(1, m4);
  body.add(cv);
  // radial canals around each contractile vacuole (6 to 10 each in the source; 8 drawn) + cilia
  const C = { position: [], aN: [], aT: [], aTip: [], aPhase: [], aLen: [] };
  const add = (b, n, t, len, phase, tip0 = 0, tip1 = 1) => {
    C.position.push(b.x, b.y, b.z, b.x, b.y, b.z); C.aN.push(n.x, n.y, n.z, n.x, n.y, n.z); C.aT.push(t.x, t.y, t.z, t.x, t.y, t.z);
    C.aTip.push(tip0, tip1); C.aPhase.push(phase, phase); C.aLen.push(len, len);
  };
  // cilia: 11 um long (jana2012), about 2600 drawn of the 10,000 to 14,000 real ones, beating in a wave along the body
  for (let i = 0; i < 2600; i++) {
    const u = R() * 2 - 1, a = R() * 6.283, s = Math.sqrt(1 - u * u);
    const pt = shape(u, Math.cos(a) * s, Math.sin(a) * s);
    const e = shape(u + 0.01, Math.cos(a) * Math.sqrt(1 - (u + 0.01) ** 2), Math.sin(a) * Math.sqrt(1 - (u + 0.01) ** 2));
    const e2 = shape(u, Math.cos(a + 0.02) * s, Math.sin(a + 0.02) * s);
    const n = new THREE.Vector3().subVectors(e, pt).cross(new THREE.Vector3().subVectors(e2, pt)).normalize();
    if (n.dot(pt) < 0) n.negate();
    const t = v3(-1, 0, 0).addScaledVector(n, n.x).normalize();
    add(pt, n, t, 0.11, pt.x * 16 + R() * 0.6);
  }
  const cil = lines(L, '#8ff0e0', C, { freq: 7, amp: 0.5, op: 0.32 }); body.add(cil);
  // granules inside
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 420; i++) { const x = (R() * 2 - 1) * 1.05, k = 0.26 * Math.sqrt(Math.max(0, 1 - (x / 1.2) ** 2)), a = R() * 6.283, r = Math.sqrt(R()) * k;
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r * 0.8); pushCol(cs, col(R() < 0.7 ? '#7ff5dc' : '#ffcf8a')); sz.push(0.006 + R() * 0.01); }
    body.add(points(L, pos, cs, sz, { drift: 0.006, speed: 0.8, seed: 5 })); }

  // a Euglena (90 um) and two diatoms (100 um) drifting nearby
  const drifters = [];
  const eug = new THREE.Group();
  { const g2 = new THREE.SphereGeometry(1, 40, 20); const q = g2.attributes.position;
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), k = 0.09 * (0.72 + 0.28 * x) * (1 + 0.15 * Math.sin(x * 9)); q.setXYZ(i, x * 0.45, q.getY(i) * k, q.getZ(i) * k); }
    g2.computeVertexNormals();
    eug.add(new THREE.Mesh(g2, rim(L, '#a6e86e', { coreA: 0.14, pow: 1.7, wob: 0.003 })));
    const ch = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), rim(L, '#d4ff86', { coreA: 0.35 }), 16);
    for (let i = 0; i < 16; i++) { const x = -0.3 + R() * 0.55, k = 0.05, a = R() * 6.283; m4.compose(v3(x, Math.cos(a) * k, Math.sin(a) * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, 0)), v3(0.03, 0.012, 0.012)); ch.setMatrixAt(i, m4); }
    eug.add(ch);
    eug.add(points(L, [0.36, 0.035, 0.03], [1, 0.3, 0.25], [0.035], { drift: 0, dof: 0.5 }));
    const F = { position: [], aN: [], aT: [], aTip: [], aPhase: [], aLen: [] }, N = 24;
    for (let i = 0; i < N; i++) for (const s of [i / N, (i + 1) / N]) { F.position.push(0.45, 0, 0); F.aN.push(1, 0, 0); F.aT.push(0, 1, 0); F.aTip.push(s); F.aPhase.push(s * 9); F.aLen.push(0.5); }
    eug.add(lines(L, '#d8ffc0', F, { freq: 9, amp: 0.18, op: 0.7 }));
  }
  eug.position.set(2.9, -1.9, -0.8); eug.rotation.set(0.3, 0.4, 2.4); S.add(eug);
  drifters.push({ o: eug, v: v3(-0.05, 0.02, 0), spin: 0.25 });
  for (const [x, y, z, rz] of [[-1.6, 2.4, -1.5, -0.5], [-0.6, -2.9, -2.2, 0.9]]) {
    const d = new THREE.Group();
    const cap = new THREE.CapsuleGeometry(0.08, 0.84, 8, 24); cap.rotateZ(Math.PI / 2); cap.scale(1, 1, 0.75);
    d.add(new THREE.Mesh(cap, rim(L, '#ffdc8f', { coreA: 0.16, pow: 2.2, spec: 0.8 })));
    const pl = new THREE.CapsuleGeometry(0.045, 0.6, 6, 16); pl.rotateZ(Math.PI / 2);
    const p1 = new THREE.Mesh(pl, rim(L, '#f0a845', { coreA: 0.4 })); p1.position.y = 0.025; d.add(p1);
    d.position.set(x, y, z); d.rotation.set(0.2, 0.3, rz); S.add(d);
    drifters.push({ o: d, v: v3(-0.025 * Math.sign(x), 0.012, 0), spin: 0 });
  }
  // bacteria (1 to 4 um, so specks at this zoom) and soft out-of-focus specks for depth
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 700; i++) { pos.push((R() * 2 - 1) * 9, (R() * 2 - 1) * 12, -4 + R() * 5); pushCol(cs, col('#cfe9e4'), 0.8); sz.push(0.02); }
    S.add(points(L, pos, cs, sz, { drift: 0.12, speed: 1.6, seed: 9, op: 0.6 })); }
  { const pos = [], cs = [], sz = [];
    const pal = ['#3aa898', '#6fb98e', '#b99a62', '#4f86a6'];
    for (let i = 0; i < 220; i++) { pos.push((R() * 2 - 1) * 12, (R() * 2 - 1) * 16, -14 + R() * 20); pushCol(cs, col(pal[i % 4]), 0.7); sz.push(0.08 + R() * 0.2); }
    S.add(points(L, pos, cs, sz, { drift: 0.3, speed: 0.35, seed: 13, op: 0.32, lightA: 0.35, soft: 0.95 })); }

  // the next level (inside the cell) sits on the body's long axis, so the slow roll keeps it still
  const q = v3();
  L.layout = (aspect) => {
    if (aspect >= 1) P.position.set(1.95, 0.3, 0); else P.position.set(0.25, 1.1, 0);
    q.set(0.18, 0, 0).applyEuler(P.rotation).add(P.position).multiplyScalar(INNER);
  };
  L.layout(1.6);
  L.update = (t, dt, still) => {
    body.rotation.x = still ? 0.6 : t * 0.22 + 0.6;
    if (!still) for (const d of drifters) {
      d.o.position.addScaledVector(d.v, dt);
      if (d.o.position.x > 8) d.o.position.x = -8; if (d.o.position.x < -8) d.o.position.x = 8;
      if (d.o.position.y > 10) d.o.position.y = -10;
      d.o.rotation.x += d.spin * dt;
    }
  };
  L.q = () => q;
  return L;
}

/* ---------- level 1: inside the cell (10 units = 30 um) ---------- */
const MITO_TILT = -0.35;
function buildCell() {
  const L = makeLevel(), R = rng(21), m4 = new THREE.Matrix4();
  // mitochondria: 2 um long and 1 um across (bionumbers-mito) = 0.667 by 0.333 units
  const cap = new THREE.CapsuleGeometry(1 / 6, 1 / 3, 8, 24); cap.rotateZ(Math.PI / 2);
  const target = new THREE.Mesh(cap, rim(L, '#ff8b5e', { coreA: 0.2, pow: 1.8, wob: 0.006, spec: 0.4 }));
  target.rotation.z = MITO_TILT; L.group.add(target);
  const N = 30, mito = new THREE.InstancedMesh(cap, rim(L, '#ff8b5e', { coreA: 0.16, pow: 1.8, wob: 0.006 }), N);
  for (let i = 0; i < N; i++) {
    let p;
    if (i < 9) { const a = R() * 6.283, r = 1.4 + R() * 3.4; p = v3(Math.cos(a) * r, Math.sin(a) * r, -2.5 + R() * 3); }
    else do { p = v3((R() * 2 - 1) * 14, (R() * 2 - 1) * 16, -9 + R() * 11); } while (p.length() < 2.2);
    const s = 0.8 + R() * 0.5;
    m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), v3(s * (0.9 + R() * 0.5), s, s)); mito.setMatrixAt(i, m4);
  }
  L.group.add(mito);
  // food vacuoles 3 to 8 um, with a few swallowed bacteria inside
  const sph = new THREE.SphereGeometry(1, 40, 24);
  const fv = new THREE.InstancedMesh(sph, rim(L, '#b993ff', { coreA: 0.07, pow: 1.6, wob: 0.03 }), 7);
  const fvPos = [];
  for (let i = 0; i < 7; i++) { let p; do { p = v3((R() * 2 - 1) * 12, (R() * 2 - 1) * 13, -10 + R() * 9); } while (p.length() < 4); const r = 0.5 + R() * 0.9; fvPos.push([p, r]); m4.compose(p, new THREE.Quaternion(), v3(r, r, r)); fv.setMatrixAt(i, m4); }
  L.group.add(fv);
  { const pos = [], cs = [], sz = [];
    for (const [p, r] of fvPos) for (let k = 0; k < 14; k++) { const d = v3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(r * 0.6 * R()); pos.push(p.x + d.x, p.y + d.y, p.z + d.z); pushCol(cs, col('#e3d4ff')); sz.push(0.12); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.05, speed: 1.2, seed: 22 })); }
  // endoplasmic reticulum: thin winding tubes
  for (let k = 0; k < 7; k++) {
    const pts = []; let p = v3((R() * 2 - 1) * 10, (R() * 2 - 1) * 10, -6 + R() * 5), d = v3(R() - 0.5, R() - 0.5, (R() - 0.5) * 0.4).normalize();
    for (let i = 0; i < 9; i++) { pts.push(p.clone()); d.add(v3(R() - 0.5, R() - 0.5, (R() - 0.5) * 0.3).multiplyScalar(0.9)).normalize(); p = p.clone().addScaledVector(d, 1.6); }
    L.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.06, 8), rim(L, '#9aa6ff', { coreA: 0.12, pow: 1.4, wob: 0.01 })));
  }
  // edge of the large nucleus (macronucleus), with chromatin specks
  const nuc = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), rim(L, '#ffb35c', { coreA: 0.05, pow: 1.5, wob: 0.025 }));
  nuc.scale.setScalar(7); nuc.position.set(-11, 8.5, -7); L.group.add(nuc);
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 380; i++) { const d = v3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(6.5 * Math.cbrt(R())); pos.push(-11 + d.x, 8.5 + d.y, -7 + d.z); pushCol(cs, col('#ffc77e')); sz.push(0.08 + R() * 0.1); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.04, speed: 0.5, seed: 23, op: 0.7 })); }
  // cytoplasm: ribosome-sized specks and big soft out-of-focus ones
  { const pos = [], cs = [], sz = [];
    const pal = ['#5fe0cc', '#7cc4ff', '#ffcf8a', '#9df2b8'];
    for (let i = 0; i < 1900; i++) { pos.push((R() * 2 - 1) * 18, (R() * 2 - 1) * 20, -12 + R() * 17); pushCol(cs, col(pal[i % 4]), 0.85); sz.push(i % 9 ? 0.03 + R() * 0.03 : 0.12 + R() * 0.2); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.06, speed: 0.9, seed: 24, op: 0.6, lightA: 0.5 })); }
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 90; i++) { pos.push((R() * 2 - 1) * 9, (R() * 2 - 1) * 11, 1 + R() * 7); pushCol(cs, col(i % 3 ? '#4fb8a8' : '#d29a5c'), 0.7); sz.push(0.2 + R() * 0.4); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.2, speed: 0.4, seed: 25, op: 0.3, lightA: 0.3, soft: 0.95 })); }
  L.update = () => {};
  L.q = () => v3(0, 0, 0);
  return L;
}

/* ---------- level 2: a mitochondrion (10 units = 3 um) ---------- */
function buildPart() {
  const L = makeLevel(), R = rng(31), m4 = new THREE.Matrix4();
  const M = new THREE.Group(); M.rotation.z = MITO_TILT; L.group.add(M);
  const outer = new THREE.CapsuleGeometry(10 / 6, 10 / 3, 16, 64); outer.rotateZ(Math.PI / 2);
  M.add(new THREE.Mesh(outer, rim(L, '#ff8f66', { coreA: 0.05, pow: 2.4, wob: 0.03, spec: 0.35 })));
  const inner = new THREE.CapsuleGeometry(1.5, 3.1, 16, 64); inner.rotateZ(Math.PI / 2);
  M.add(new THREE.Mesh(inner, rim(L, '#ffae86', { coreA: 0.03, pow: 2.0, wob: 0.04, op: 0.7 })));
  // cristae: folds of the inner membrane, alternating from top and bottom
  const crGeo = new THREE.SphereGeometry(1, 48, 28);
  const NC = 9, cr = new THREE.InstancedMesh(crGeo, rim(L, '#ffc79e', { coreA: 0.06, pow: 1.7, wob: 0.03 }), NC);
  const crist = [];
  for (let i = 0; i < NC; i++) {
    const x = -2.9 + i * (5.8 / (NC - 1)), side = i % 2 ? 1 : -1, len = 1.0 + R() * 0.25;
    const halfSpan = Math.sqrt(Math.max(0.2, 1 - (Math.max(0, Math.abs(x) - 1.55) / 1.5) ** 2)) * 1.45;
    const pos = v3(x, side * (halfSpan - len) * 0.9, 0);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (R() - 0.5) * 0.3, (R() - 0.5) * 0.25));
    const sc = v3(0.085, len * Math.min(1, halfSpan), 1.05 * Math.min(1, halfSpan));
    m4.compose(pos, rot, sc); cr.setMatrixAt(i, m4); crist.push({ pos, rot, sc });
  }
  M.add(cr);
  // ATP synthase heads (9 nm) pepper the cristae: specks on their surfaces
  { const pos = [], cs = [], sz = [];
    for (const c of crist) for (let k = 0; k < 170; k++) {
      const a = R() * 6.283, r = Math.sqrt(R()) * 0.97, side = R() < 0.5 ? -1 : 1;
      const p = v3(side * 1.05, Math.cos(a) * r, Math.sin(a) * r).multiply(c.sc).applyQuaternion(c.rot).add(c.pos);
      pos.push(p.x, p.y, p.z); pushCol(cs, col('#ffe08a')); sz.push(0.035);
    }
    M.add(points(L, pos, cs, sz, { drift: 0.004, speed: 1.5, seed: 32, dof: 0.6 })); }
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 420; i++) { const x = (R() * 2 - 1) * 3.6, k = 1.35 * Math.sqrt(Math.max(0, 1 - (Math.max(0, Math.abs(x) - 1.66) / 1.5) ** 2)), a = R() * 6.283, r = Math.sqrt(R()) * k;
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r); pushCol(cs, col(R() < 0.8 ? '#ffb48f' : '#fff0c0')); sz.push(0.03 + R() * 0.05); }
    M.add(points(L, pos, cs, sz, { drift: 0.03, speed: 1, seed: 33 })); }
  // surrounding cytoplasm
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 700; i++) { let p; do { p = v3((R() * 2 - 1) * 16, (R() * 2 - 1) * 18, -12 + R() * 16); } while (Math.abs(p.y) < 2 && Math.abs(p.x) < 5 && Math.abs(p.z) < 2); pos.push(p.x, p.y, p.z); pushCol(cs, col(i % 3 ? '#5fe0cc' : '#8ab8ff'), 0.8); sz.push(i % 7 ? 0.05 : 0.25 + R() * 0.3); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.08, speed: 0.7, seed: 34, op: 0.5, lightA: 0.5, soft: 0.6 })); }
  // next level: a spot on the face of the middle crista
  const c = crist[4];
  const q = v3(1.0, 0.35, 0.3).multiply(c.sc).applyQuaternion(c.rot).add(c.pos).applyEuler(M.rotation);
  L.update = () => {};
  L.q = () => q;
  return L;
}

/* ---------- level 3: ATP synthase in the inner membrane (10 units = 32 nm, so 1 unit = 3.2 nm) ---------- */
function buildBig() {
  const L = makeLevel(), R = rng(41), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion();
  const T = new THREE.Group(); T.rotation.set(0.34, 0.0, 0.0); T.position.y = -2.3; L.group.add(T);
  const TOP = 0.75;
  const lip = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uNear: G.uNear, uBase: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uA: { value: 1 }, uSpacing: { value: 0.26 }, uR0: { value: 9 }, uR1: { value: 26 } },
    vertexShader: LIPID_VS, fragmentShader: LIPID_FS, transparent: true, depthWrite: true,
  });
  lip.userData = { base: new THREE.Color('#5fd6c4'), op: 1 }; L.lipids.push(lip);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), lip); plane.rotation.x = -Math.PI / 2; plane.position.y = TOP; T.add(plane);
  const lip2 = lip.clone(); lip2.uniforms = { ...lip.uniforms, uBase: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uA: { value: 1 } };
  lip2.userData = { base: new THREE.Color('#3b9f93'), op: 0.6 }; L.lipids.push(lip2);
  const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), lip2); plane2.rotation.x = -Math.PI / 2; plane2.position.y = -TOP; T.add(plane2);

  const spots = [[0, 0], [6.4, -3.2], [-6.6, -2.6], [2.4, -10.5], [-4.2, -11.2], [9.6, -11.5], [-11.2, -8.2]];
  const NS = spots.length, NC = 10;
  const sph = new THREE.SphereGeometry(1, 28, 18);
  // F1 head: alternating alpha and beta subunits in a ring, 9 nm across = 2.8 units, and a cap on top
  const heads = new THREE.InstancedMesh(sph, rim(L, '#ffffff', { coreA: 0.5, pow: 1.6, spec: 0.5, solid: true }), NS * 7);
  const cA = col('#ff9a62'), cB = col('#ffd36e'), cD = col('#ff7a8a');
  let k = 0;
  for (const [x, z] of spots) {
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; m4.compose(v3(x + Math.cos(a) * 0.78, 3.45, z + Math.sin(a) * 0.78), qt.identity(), v3(0.62, 0.7, 0.62)); heads.setMatrixAt(k, m4); heads.setColorAt(k++, i % 2 ? cA : cB); }
    m4.compose(v3(x, 4.25, z), qt.identity(), v3(0.38, 0.32, 0.38)); heads.setMatrixAt(k, m4); heads.setColorAt(k++, cD);
  }
  T.add(heads);
  // rotor: the c-ring in the membrane and the central stalk, which turn together
  const cring = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 1.3, 4, 12), rim(L, '#b48cff', { coreA: 0.45, pow: 1.5, solid: true }), NS * NC);
  const stalk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 2.5, 16), rim(L, '#e9e4ff', { coreA: 0.45, pow: 1.5, solid: true }), NS);
  T.add(cring, stalk);
  // stator: the peripheral stalk and subunit a beside the ring
  const per = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(1.25, 0.2, 0), v3(1.32, 1.5, 0), v3(1.38, 2.9, 0), v3(1.0, 3.95, 0), v3(0.45, 4.3, 0)]), 40, 0.1, 8);
  const peri = new THREE.InstancedMesh(per, rim(L, '#d7c6ff', { coreA: 0.4, pow: 1.5, solid: true }), NS);
  const subA = new THREE.InstancedMesh(sph, rim(L, '#9fb4ff', { coreA: 0.4, pow: 1.5, solid: true }), NS);
  const yaw = spots.map(() => R() * 6.283);
  spots.forEach(([x, z], i) => {
    qt.setFromAxisAngle(v3(0, 1, 0), yaw[i]);
    m4.compose(v3(x, 0, z), qt, v3(1, 1, 1)); peri.setMatrixAt(i, m4);
    m4.compose(v3(x + Math.cos(-yaw[i]) * 1.25, 0.3, z + Math.sin(-yaw[i]) * 1.25), qt.identity(), v3(0.5, 0.6, 0.45)); subA.setMatrixAt(i, m4);
  });
  T.add(peri, subA);
  // protons crossing, and soft specks for depth
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 320; i++) { pos.push((R() * 2 - 1) * 14, (R() < 0.5 ? -1 : 1) * (1 + R() * 4), (R() * 2 - 1) * 12); pushCol(cs, col('#86ecff')); sz.push(0.09); }
    T.add(points(L, pos, cs, sz, { drift: 0.5, speed: 1.4, seed: 42 })); }
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 260; i++) { pos.push((R() * 2 - 1) * 16, -6 + R() * 18, -10 + R() * 18); pushCol(cs, col(i % 2 ? '#5fe0cc' : '#ffcf8a'), 0.8); sz.push(0.15 + R() * 0.4); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.4, speed: 0.5, seed: 43, op: 0.4, lightA: 0.4, soft: 0.9 })); }

  const e = new THREE.Euler(), ax = v3(0, 1, 0);
  L.update = (t, dt, still) => {
    const tt = still ? 0 : t;
    let n = 0;
    spots.forEach(([x, z], i) => {
      const ang = tt * (1.4 + 0.15 * i) + yaw[i];
      for (let j = 0; j < NC; j++) { const a = ang + j * Math.PI * 2 / NC; m4.compose(v3(x + Math.cos(a) * 0.62, 0.3, z + Math.sin(a) * 0.62), qt.identity(), v3(1, 1, 1)); cring.setMatrixAt(n++, m4); }
      e.set(0.12 * Math.cos(ang), 0, 0.12 * Math.sin(ang)); qt.setFromEuler(e);
      m4.compose(v3(x, 1.95, z), qt, v3(1, 1, 1)); stalk.setMatrixAt(i, m4);
    });
    cring.instanceMatrix.needsUpdate = true; stalk.instanceMatrix.needsUpdate = true;
  };
  // next level: one ATP just made, leaving the head of the front machine
  // on wide desktop screens the level rail sits over the right edge, so the membrane slides left to keep the machines clear of it
  const q = v3();
  L.layout = (aspect, width) => {
    T.position.x = width >= 900 && aspect > 1 ? -clamp((aspect - 1) * 2.2, 0, 1.7) : 0;
    q.set(1.55, 4.85, 1.45).applyEuler(T.rotation).add(T.position);
  };
  L.layout(1, 0);
  L.q = () => q;
  return L;
}

/* ---------- level 4: one ATP molecule, real atom positions (10 units = 2.6 nm, so 1 unit = 2.6 angstrom) ---------- */
const CPK = { C: '#aab5bf', N: '#6f9bff', O: '#ff6b5e', P: '#ffab4a', H: '#eef3f5' };
const RAD = { H: 0.26, C: 0.4, N: 0.4, O: 0.4, P: 0.52 };
function buildMol(atp) {
  const L = makeLevel(), R = rng(51), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), U = 2.6;
  const Mol = new THREE.Group(); L.group.add(Mol);
  const A = atp.atoms.map(([el, x, y, z, id]) => ({ el, id, p: v3(x / U, y / U, z / U) }));
  const sph = new THREE.SphereGeometry(1, 28, 18);
  const balls = new THREE.InstancedMesh(sph, rim(L, '#ffffff', { coreA: 0.9, pow: 2.0, spec: 0.7, solid: true }), A.length);
  A.forEach((a, i) => { const r = RAD[a.el] / U; m4.compose(a.p, qt.identity(), v3(r, r, r)); balls.setMatrixAt(i, m4); balls.setColorAt(i, col(CPK[a.el])); });
  Mol.add(balls);
  const bonds = [];
  for (const [i, j, order] of atp.bonds) {
    const a = A[i].p, b = A[j].p, d = new THREE.Vector3().subVectors(b, a), mid = a.clone().add(b).multiplyScalar(0.5);
    const off = new THREE.Vector3().crossVectors(d, v3(0.3, 0.8, 0.5)).normalize().multiplyScalar(0.11 / U);
    if (order === 2) { bonds.push([mid.clone().add(off), d, A[i].el, A[j].el]); bonds.push([mid.clone().sub(off), d, A[i].el, A[j].el]); } else bonds.push([mid, d, A[i].el, A[j].el]);
  }
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const sticks = new THREE.InstancedMesh(cyl, rim(L, '#ffffff', { coreA: 0.85, pow: 1.6, solid: true }), bonds.length);
  bonds.forEach(([mid, d, e1, e2], i) => {
    qt.setFromUnitVectors(v3(0, 1, 0), d.clone().normalize());
    m4.compose(mid, qt, v3(0.075 / U * 1.6, d.length(), 0.075 / U * 1.6)); sticks.setMatrixAt(i, m4);
    sticks.setColorAt(i, col(CPK[e1]).lerp(col(CPK[e2]), 0.5).lerp(col('#ffffff'), 0.25));
  });
  Mol.add(sticks);
  // soft glow around each heavy atom
  { const pos = [], cs = [], sz = [];
    A.forEach((a) => { if (a.el === 'H') return; pos.push(a.p.x, a.p.y, a.p.z); pushCol(cs, col(CPK[a.el]), 0.8); sz.push(a.el === 'P' ? 0.75 : 0.55); });
    Mol.add(points(L, pos, cs, sz, { drift: 0.01, speed: 2, seed: 52, op: 0.35, lightA: 0.2, dof: 0.3, soft: 1 })); }
  // water molecules jostling around it
  const NW = 26, wO = new THREE.InstancedMesh(sph, rim(L, CPK.O, { coreA: 0.5, pow: 1.8, solid: true, op: 0.6 }), NW);
  const wH = new THREE.InstancedMesh(sph, rim(L, CPK.H, { coreA: 0.5, pow: 1.8, solid: true, op: 0.6 }), NW * 2);
  const W = [];
  for (let i = 0; i < NW; i++) { let p; do { p = v3((R() * 2 - 1) * 11, (R() * 2 - 1) * 12, -9 + R() * 11); } while (p.length() < 4.8); W.push({ p, base: p.clone(), e: new THREE.Euler(R() * 6, R() * 6, R() * 6), s: R() * 100 }); }
  const hA = v3(0.757, 0.586, 0).multiplyScalar(1 / U), hB = v3(-0.757, 0.586, 0).multiplyScalar(1 / U);
  let wS = 1, lastT = 0;
  const placeWater = (t) => {
    W.forEach((w, i) => {
      w.p.set(w.base.x + 0.35 * Math.sin(t * 0.9 + w.s), w.base.y + 0.35 * Math.sin(t * 0.7 + w.s * 2), w.base.z + 0.3 * Math.sin(t * 0.8 + w.s * 3));
      w.e.x += 0.004; w.e.y += 0.006; qt.setFromEuler(w.e);
      m4.compose(w.p, qt, v3(0.4 / U * wS, 0.4 / U * wS, 0.4 / U * wS)); wO.setMatrixAt(i, m4);
      const r = 0.26 / U * wS;
      m4.compose(hA.clone().applyQuaternion(qt).add(w.p), qt, v3(r, r, r)); wH.setMatrixAt(i * 2, m4);
      m4.compose(hB.clone().applyQuaternion(qt).add(w.p), qt, v3(r, r, r)); wH.setMatrixAt(i * 2 + 1, m4);
    });
    wO.instanceMatrix.needsUpdate = true; wH.instanceMatrix.needsUpdate = true;
  };
  placeWater(0);
  L.group.add(wO, wH);
  { const pos = [], cs = [], sz = [];
    for (let i = 0; i < 160; i++) { pos.push((R() * 2 - 1) * 14, (R() * 2 - 1) * 16, -12 + R() * 18); pushCol(cs, col(i % 2 ? '#7cc4ff' : '#5fe0cc'), 0.7); sz.push(0.2 + R() * 0.5); }
    L.group.add(points(L, pos, cs, sz, { drift: 0.5, speed: 0.6, seed: 53, op: 0.25, lightA: 0.3, soft: 0.95 })); }
  const PG = A.find((a) => a.id === 'PG').p;
  const neighbours = atp.bonds.filter(([i, j]) => A[i].id === 'PG' || A[j].id === 'PG').map(([i, j]) => (A[i].id === 'PG' ? A[j] : A[i]));
  const base = new THREE.Euler(-0.35, 0.5, 0.25);
  L.update = (t, dt, still) => {
    const tt = still ? 0 : t;
    Mol.rotation.set(base.x + 0.12 * Math.sin(tt * 0.31), base.y + 0.25 * Math.sin(tt * 0.23), base.z + 0.06 * Math.sin(tt * 0.4));
    lastT = still ? 0 : t;
    if (!still) placeWater(t);
  };
  // zooming in from the ATP level, the balls would fill the screen before the atom cloud takes over: they shrink to points first
  let shrunk = 1;
  L.shrink = (f) => {
    const k = 1 - 0.8 * f;
    if (Math.abs(k - shrunk) < 0.004) return;
    shrunk = k; wS = k; placeWater(lastT);
    A.forEach((a, i) => { const r = RAD[a.el] / U * k; m4.compose(a.p, qt.identity(), v3(r, r, r)); balls.setMatrixAt(i, m4); });
    balls.instanceMatrix.needsUpdate = true;
  };
  L.q = () => PG.clone().applyEuler(Mol.rotation);
  L.rotation = () => Mol.rotation;
  L.PG = PG; L.neighbours = neighbours.map((a) => ({ el: a.el, p: a.p.clone().sub(PG) }));
  return L;
}

/* ---------- level 5: one phosphorus atom (10 units = 4 angstrom, so 1 unit = 0.4 angstrom) ---------- */
function buildAtom(molLevel) {
  const L = makeLevel(), R = rng(61), U = 0.4 / 2.6;   // level-4 units to level-5 units: 2.6 / 0.4
  const A = new THREE.Group(); L.group.add(A);
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += R(); return (s - 2) / 0.58; };
  const cloud = (center, n, shells, color, coreColor, size) => {
    const pos = [], cs = [], sz = [];
    for (let i = 0; i < n; i++) {
      const pick = R(); let acc = 0, sh = shells[shells.length - 1];
      for (const s of shells) { acc += s.w; if (pick < acc) { sh = s; break; } }
      const r = Math.abs(sh.r + gauss() * sh.sd);
      const d = v3(gauss(), gauss(), gauss()).normalize().multiplyScalar(r);
      pos.push(center.x + d.x, center.y + d.y, center.z + d.z);
      pushCol(cs, col(color).lerp(col(coreColor), clamp(1 - r / 2.5, 0, 1)));
      sz.push(size * (0.6 + R() * 0.8));
    }
    return points(L, pos, cs, sz, { drift: 0.07, speed: 5, seed: 62 + n, dof: 0.25, op: 0.5, lightA: 0.9 });
  };
  const glow = (c, size, hex, op) => points(L, [c.x, c.y, c.z], [...col(hex).toArray()], [size], { drift: 0, dof: 0, op, soft: 1, lightA: 0.6, maxPx: 1400 });
  // phosphorus: 15 electrons drawn as three hazy shells (2, 8, 5); radii are illustrative, overall size about 2 angstrom
  A.add(glow(v3(0, 0, 0), 7.5, '#ff9a3a', 0.22));
  A.add(cloud(v3(0, 0, 0), 7000, [{ r: 0.35, sd: 0.15, w: 0.13 }, { r: 1.2, sd: 0.3, w: 0.53 }, { r: 2.35, sd: 0.55, w: 0.34 }], '#ffab4a', '#fff4d6', 0.036));
  // the nucleus: far too small to see at this zoom (about 100,000 times smaller than the atom), marked by a point of light
  A.add(points(L, [0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 0.85, 0.6], [0.05, 0.4], { drift: 0, dof: 0, op: 1, lightA: 1 }));
  for (const nb of molLevel.neighbours) {
    const c = nb.p.clone().multiplyScalar(1 / U);
    A.add(glow(c, 5, '#ff5a4a', 0.16));
    A.add(cloud(c, 2400, [{ r: 0.3, sd: 0.12, w: 0.2 }, { r: 1.35, sd: 0.45, w: 0.8 }], CPK[nb.el], '#ffe1d6', 0.036));
    // shared electrons along the bond
    const pos = [], cs = [], sz = [];
    for (let i = 0; i < 160; i++) { const s = R(); const p = c.clone().multiplyScalar(s).add(v3(gauss(), gauss(), gauss()).multiplyScalar(0.28)); pos.push(p.x, p.y, p.z); pushCol(cs, col('#ffab4a').lerp(col(CPK[nb.el]), s)); sz.push(0.1); }
    A.add(points(L, pos, cs, sz, { drift: 0.06, speed: 5, seed: 70 + i0++, dof: 0.4, op: 0.4 }));
  }
  L.update = () => { A.rotation.copy(molLevel.rotation()); };
  L.q = () => v3(0, 0, 0);
  return L;
}
let i0 = 0;

/* ---------- the journey: levels, transforms, crossfades ---------- */
// u = log10(view in metres). Fade windows in u: [in starts, fully in, starts out, fully out]. Zooming in = u going down.
const WINDOWS = [[9, 9, -3.72, -4.3], [-3.5, -4.0, -5.05, -5.45], [-4.85, -5.25, -6.55, -7.05], [-6.45, -6.95, -8.2, -8.6], [-7.65, -8.1, -8.8, -9.1], [-8.7, -9.1, -99, -99]];
// level 4 balls shrink to points over this span (u), before the atom cloud fades in, so they never fill the screen
const SHRINK = [-8.62, -9.0];
const BG = {
  dark: [['#0b2a2a', '#020909'], ['#0b2230', '#02070b'], ['#2a1414', '#080304'], ['#0d1733', '#03050c'], ['#0b0d24', '#020208'], ['#17110a', '#030202']],
  light: [['#f4faf8', '#cfdeda'], ['#f2f6fb', '#d0dbe6'], ['#fbf3ee', '#e6d3c9'], ['#f1f3fb', '#d3d8ea'], ['#f3f2f9', '#d8d6e8'], ['#fbf7f0', '#e6dccb']],
};

export function createJourney(canvas, { levels, atp, dark = true, lowPower = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: false, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  const dprCap = lowPower ? 1.25 : 1.75;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 600);
  const bgMat = new THREE.ShaderMaterial({ uniforms: { uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uAspect: { value: new THREE.Vector2(1, 1) } }, vertexShader: BG_VS, fragmentShader: BG_FS, depthWrite: false, depthTest: false });
  const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const bgMesh = new THREE.Mesh(tri, bgMat); bgMesh.frustumCulled = false; bgScene.add(bgMesh);

  const L4 = buildMol(atp);
  const L = [buildOrganism(), buildCell(), buildPart(), buildBig(), L4, buildAtom(L4)];
  const anchors = levels.map((l) => Math.log10(l.view));
  const views = levels.map((l) => l.view);
  for (const l of L) scene.add(l.group);

  let isDark = dark, D = 10, w = 1, h = 1;
  function setTheme(d) {
    isDark = d; G.uLight.value = d ? 0 : 1;
    const white = new THREE.Color('#ffffff');
    for (const l of L) {
      for (const m of l.rims) {
        const b = m.userData.base, o = m.userData.o;
        if (d) {
          m.uniforms.uRim.value.copy(b).multiplyScalar(o.solid ? 1.0 : 1.1);
          m.uniforms.uCore.value.copy(b).multiplyScalar(o.solid ? 0.6 : 0.3);
          m.blending = o.solid ? THREE.NormalBlending : THREE.AdditiveBlending;
        } else {
          const hsl = {}; b.getHSL(hsl);
          m.uniforms.uRim.value.setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.1), Math.min(hsl.l, 0.5) * 0.62);
          m.uniforms.uCore.value.copy(b).lerp(white, o.solid ? 0.25 : 0.5);
          m.blending = THREE.NormalBlending;
        }
        m.needsUpdate = true;
      }
      for (const m of l.pts) { m.blending = d ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true; }
      for (const m of l.lines) {
        const b = m.userData.base;
        if (d) m.uniforms.uColor.value.copy(b); else { const hsl = {}; b.getHSL(hsl); m.uniforms.uColor.value.setHSL(hsl.h, 0.7, 0.3); }
        m.blending = d ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true;
      }
      for (const m of l.lipids) {
        const b = m.userData.base;
        if (d) { m.uniforms.uBase.value.copy(b).multiplyScalar(0.9); m.uniforms.uDeep.value.copy(b).multiplyScalar(0.12); }
        else { const hsl = {}; b.getHSL(hsl); m.uniforms.uBase.value.copy(b).lerp(white, 0.35); m.uniforms.uDeep.value.setHSL(hsl.h, 0.5, 0.32); }
      }
    }
  }
  setTheme(isDark);

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    D = w >= h ? 5 / t : 5 / (t * camera.aspect);   // the short side shows 10 units at z = 0
    camera.near = D * 0.02; camera.far = D * 40; camera.updateProjectionMatrix();
    G.uFocus.value = D; G.uNear.value = D * 0.22;
    G.uPx.value = (h * dpr) / (2 * t);
    G.uMaxPx.value = 70 * dpr;
    bgMat.uniforms.uAspect.value.set(w >= h ? w / h : 1, w >= h ? 1 : h / w);
    L[0].layout(w / h);
    L[3].layout(w / h, w);
  }

  const c0 = new THREE.Color(), c1 = new THREE.Color(), tmpA = new THREE.Color(), tmpB = new THREE.Color();
  const centres = L.map(() => new THREE.Vector3());
  let par = { x: 0, y: 0 };
  function frame(u, t, dt, still) {
    G.uTime.value = still ? 0 : t;
    // which pair of levels are we between, and how far
    let k = 0; while (k < L.length - 2 && u < anchors[k + 1]) k++;
    const span = anchors[k] - anchors[k + 1];
    const s = clamp((anchors[k] - u) / span, 0, 1);
    const pan = smooth(0, 0.62, s);
    for (const l of L) l.update && l.update(t, dt, still);
    // camera centre in each level's own units, chained so the next level's spot stays under the camera
    centres[k].copy(L[k].q()).multiplyScalar(u > anchors[0] && k === 0 ? 0 : pan);
    if (u <= anchors[L.length - 1]) { centres[L.length - 1].set(0, 0, 0); for (let j = L.length - 2; j >= 0; j--) centres[j].copy(L[j].q()).addScaledVector(centres[j + 1], views[j + 1] / views[j]); }
    else {
      for (let j = k + 1; j < L.length; j++) centres[j].copy(centres[j - 1]).sub(L[j - 1].q()).multiplyScalar(views[j - 1] / views[j]);
      for (let j = k - 1; j >= 0; j--) centres[j].copy(L[j].q()).addScaledVector(centres[j + 1], views[j + 1] / views[j]);
    }
    const view = Math.pow(10, u);
    L.forEach((l, i) => {
      const [a, b, c, d] = WINDOWS[i];
      const alpha = (a === b ? 1 : smooth(0, 1, (a - u) / (a - b))) * (c === d ? 1 : 1 - smooth(0, 1, (c - u) / (c - d)));
      l.alpha = alpha;
      if (l.shrink) l.shrink(smooth(0, 1, (SHRINK[0] - u) / (SHRINK[0] - SHRINK[1])));
      l.group.visible = alpha > 0.004;
      if (!l.group.visible) return;
      const sc = views[i] / view;
      l.group.scale.setScalar(sc);
      l.group.position.copy(centres[i]).multiplyScalar(-sc);
      for (const m of l.rims) m.uniforms.uA.value = alpha * m.userData.op;
      for (const m of l.lines) m.uniforms.uA.value = alpha * m.userData.op;
      for (const m of l.lipids) m.uniforms.uA.value = alpha * m.userData.op;
      for (const m of l.pts) { m.uniforms.uA.value = alpha * m.userData.op; m.uniforms.uScale.value = sc * (l.inner || 1); }
    });
    // background drifts from one level's colour to the next
    const pal = BG[isDark ? 'dark' : 'light'];
    // background colours are used as written (no sRGB to linear step), so the gradient matches the CSS fallback
    const LIN = THREE.LinearSRGBColorSpace;
    tmpA.setStyle(pal[k][0], LIN); tmpB.setStyle(pal[k + 1][0], LIN); c0.copy(tmpA).lerp(tmpB, s);
    tmpA.setStyle(pal[k][1], LIN); tmpB.setStyle(pal[k + 1][1], LIN); c1.copy(tmpA).lerp(tmpB, s);
    bgMat.uniforms.uC0.value.copy(c0); bgMat.uniforms.uC1.value.copy(c1);
    // a slow drift plus a little pointer parallax, like a camera on a slider
    const drift = still ? 0 : 1;
    camera.position.set((par.x * 0.35 + 0.12 * Math.sin(t * 0.11) * drift) * D * 0.06, (par.y * 0.3 + 0.1 * Math.cos(t * 0.09) * drift) * D * 0.06, D);
    camera.lookAt(0, 0, 0);
    renderer.clear();
    renderer.render(bgScene, bgCam);
    renderer.render(scene, camera);
  }
  return {
    frame, resize, setTheme, renderer,
    setParallax(x, y) { par = { x, y }; },
    levelAlphas: () => L.map((l) => l.alpha),
    dispose() { renderer.dispose(); },
  };
}
