// The three.js side of the Cell and Molecule Explorer: three illustrative scenes (muscle, fibre, sarcomere), a camera,
// and the zoom transitions between them. Everything here is drawn by code and labelled "illustrative, not to scale".
// Colours are not hard-coded: they come from the legend in data/stops.json through colorFor(key), so the key on screen
// always matches what is drawn.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const X_AXIS = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let x = 0; x < 256; x++) {
    const v = 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(x * 0.9)) * (0.6 + 0.4 * rnd());
    g.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`; g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function bandTexture(light, dark) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = light; g.fillRect(0, 0, 8, 256);
  g.fillStyle = dark; g.fillRect(0, 70, 8, 116);       // A band: dark, the long middle part
  g.fillRect(0, 0, 8, 8); g.fillRect(0, 248, 8, 8);    // Z line at each end of the repeat
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ---------- level 1: a muscle ---------- */
function buildMuscle(C) {
  const group = new THREE.Group();
  const L = 7.4, N = 90;
  const prof = [new THREE.Vector2(0, -L / 2)];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = clamp((t - 0.17) / 0.66, 0, 1);
    prof.push(new THREE.Vector2(0.15 + 1.1 * Math.pow(Math.sin(Math.PI * u), 0.8), (t - 0.5) * L));
  }
  prof.push(new THREE.Vector2(0, L / 2));
  const geo = new THREE.LatheGeometry(prof, 72);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const muscle = new THREE.Color(C('muscle-fibre')), tendon = new THREE.Color(C('tendon')), tmp = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const j = k % prof.length, t = prof[j].y / L + 0.5;
    const m = smooth(0.14, 0.23, t) * (1 - smooth(0.77, 0.86, t));
    tmp.copy(tendon).lerp(muscle, m);
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = stripeTexture(); tex.repeat.set(3, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.55, metalness: 0 }));
  mesh.rotation.z = Math.PI / 2;
  group.add(mesh);
  return { group, extent: { w: L + 0.2, h: 2.6, d: 2.8, pad: 0.98 }, anchor: () => new THREE.Vector3(0.1, 0.75, 1.0) };
}

/* ---------- level 2: a fibre cut open to show its strands ---------- */
function buildFibre(C) {
  const group = new THREE.Group();
  const R = 1.0, LEN = 6.2;
  const tex = stripeTexture(); tex.repeat.set(3, 1);
  const fibreMat = new THREE.MeshStandardMaterial({ color: C('muscle-fibre'), map: tex, roughness: 0.55, side: THREE.DoubleSide });
  const cyl = (open, ts, tl) => new THREE.CylinderGeometry(R, R, LEN, 56, 1, open, ts, tl);
  // the neighbours are whole fibres; one fibre (the front one) is cut open on its upper front
  for (const [y, z] of [[2.15, 0], [-2.15, 0], [1.05, -1.9], [-1.05, -1.9]]) {
    const m = new THREE.Mesh(cyl(false), fibreMat); m.rotation.z = Math.PI / 2; m.position.set(0, y, z); group.add(m);
  }
  const gap = 1.75, cutStart = Math.PI / 4 + gap / 2;
  const main = new THREE.Mesh(cyl(true, cutStart, Math.PI * 2 - gap), fibreMat);
  main.rotation.z = Math.PI / 2; group.add(main);
  // the thinner strands inside the front fibre, with their light and dark bands
  const bands = bandTexture(C('myofibril'), C('band-dark')); bands.repeat.set(1, 10);
  const sGeo = new THREE.CylinderGeometry(0.16, 0.16, LEN - 0.3, 24, 1);
  const spots = [[0, 0]];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 4 + k * Math.PI / 3; spots.push([Math.cos(a) * 0.38, Math.sin(a) * 0.38]); }
  for (let k = 0; k < 12; k++) { const a = Math.PI / 4 + k * Math.PI / 6; spots.push([Math.cos(a) * 0.74, Math.sin(a) * 0.74]); }
  const inst = new THREE.InstancedMesh(sGeo, new THREE.MeshStandardMaterial({ map: bands, roughness: 0.5 }), spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([y, z], i) => { m4.compose(new THREE.Vector3(0, y, z), X_AXIS, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, m4); });
  group.add(inst);
  return { group, extent: { w: LEN + 0.4, h: 6.3, d: 4.6, pad: 1.28 }, anchor: () => new THREE.Vector3(0.3, 0.52, 0.52) };
}

/* ---------- level 3: one sarcomere ---------- */
function buildSarcomere(C) {
  const group = new THREE.Group();
  const d = 0.95, THIN = 2.2, THICK = 3.2, H_RELAXED = 3.0, H_SHORT = 2.3;
  const a = [d, 0], b = [d / 2, d * Math.sqrt(3) / 2];
  const P = (i, j) => [i * a[0] + j * b[0], i * a[1] + j * b[1]];
  const thick = [], thin = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    if (Math.abs(i) <= 1 && Math.abs(j) <= 1 && Math.abs(i + j) <= 1) thick.push(P(i, j));
    for (const o of [1 / 3, 2 / 3]) { const q = P(i + o, j + o); if (Math.hypot(q[0], q[1]) <= d * 1.3) thin.push(q); }
  }
  const v1 = new THREE.Vector3(1, 1, 1);
  const thickGeo = new THREE.CylinderGeometry(0.13, 0.13, THICK, 20, 1);
  const thickMat = new THREE.MeshStandardMaterial({ color: C('thick'), roughness: 0.45 });
  const thickMesh = new THREE.InstancedMesh(thickGeo, thickMat, thick.length);
  const m4 = new THREE.Matrix4();
  thick.forEach(([y, z], i) => { m4.compose(new THREE.Vector3(0, y, z), X_AXIS, v1); thickMesh.setMatrixAt(i, m4); });
  group.add(thickMesh);
  // myosin heads: small bumps spiralling out of each thick filament, none in the bare middle
  const heads = [];
  for (const [y, z] of thick) for (const side of [-1, 1]) for (let r = 0; r < 8; r++) for (let k = 0; k < 3; k++) {
    const ang = r * 0.9 + k * (Math.PI * 2 / 3) + (side > 0 ? 0.5 : 0);
    heads.push([side * (0.32 + r * 0.16), y + Math.cos(ang) * 0.17, z + Math.sin(ang) * 0.17]);
  }
  const headMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), thickMat, heads.length);
  heads.forEach(([x, y, z], i) => { m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), v1); headMesh.setMatrixAt(i, m4); });
  group.add(headMesh);
  const thinMat = new THREE.MeshStandardMaterial({ color: C('thin'), roughness: 0.4 });
  const thinGeo = new THREE.CylinderGeometry(0.055, 0.055, THIN, 14, 1);
  const thinL = new THREE.InstancedMesh(thinGeo, thinMat, thin.length), thinR = new THREE.InstancedMesh(thinGeo, thinMat, thin.length);
  group.add(thinL, thinR);
  const zMat = new THREE.MeshStandardMaterial({ color: C('zdisc'), roughness: 0.6 });
  const zGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.14, 6, 1);
  const zL = new THREE.Mesh(zGeo, zMat), zR = new THREE.Mesh(zGeo, zMat);
  zL.rotation.z = zR.rotation.z = Math.PI / 2; zL.rotation.y = zR.rotation.y = Math.PI / 6;
  group.add(zL, zR);
  let front = 0; thin.forEach((q, i) => { if (q[1] > thin[front][1] + 1e-6) front = i; });
  let H = H_RELAXED;
  function setContraction(s) {
    H = H_RELAXED - (H_RELAXED - H_SHORT) * clamp(s, 0, 1);
    thin.forEach(([y, z], i) => {
      m4.compose(new THREE.Vector3(-H + THIN / 2, y, z), X_AXIS, v1); thinL.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(H - THIN / 2, y, z), X_AXIS, v1); thinR.setMatrixAt(i, m4);
    });
    thinL.instanceMatrix.needsUpdate = thinR.instanceMatrix.needsUpdate = true;
    zL.position.x = -H; zR.position.x = H;
  }
  setContraction(0);
  return {
    group, extent: { w: 2 * H_RELAXED + 0.5, h: 3.7, d: 3.7, pad: 1.2 }, setContraction,
    anchor: () => new THREE.Vector3(H - 0.7, thin[front][0], thin[front][1] + 0.08),
  };
}

export function createView(canvas, wrap, { colorFor, reduceMotion }) {
  const C = (k) => colorFor(k);
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a98, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-5, -2, 3); scene.add(fill);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, enablePan: false, rotateSpeed: 0.7, minAzimuthAngle: -1.2, maxAzimuthAngle: 1.2, minPolarAngle: 0.7, maxPolarAngle: 2.1 });

  const levels = { muscle: buildMuscle(C), fibre: buildFibre(C), sarcomere: buildSarcomere(C) };
  for (const lv of Object.values(levels)) {
    lv.group.visible = false; scene.add(lv.group);
    lv.mats = new Set(); lv.group.traverse((o) => { if (o.material) lv.mats.add(o.material); });
  }
  const setOpacity = (lv, a) => { for (const m of lv.mats) { m.transparent = a < 0.999; m.opacity = a; } };
  const setScale = (lv, s, pivot) => { lv.group.scale.setScalar(s); lv.group.position.copy(pivot).multiplyScalar(1 - s); };

  let current = null, hidden = false, raf = 0, dirty = true, anchorCb = null, interacting = false, settleUntil = 0;
  let swayUntil = 0, lastSway = 0, userMoved = false, width = 1, height = 1, anims = 0, restDist = 12;

  function fitDistance(ext) {
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    return Math.max((ext.h / 2) / Math.tan(vf / 2), (ext.w / 2) / Math.tan(hf / 2)) * (ext.pad || 1.1) + ext.d / 2;
  }
  function placeCamera(dist, az = 0.32, pol = 1.28) {
    camera.position.set(dist * Math.sin(pol) * Math.sin(az), dist * Math.cos(pol), dist * Math.sin(pol) * Math.cos(az));
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
  }
  function setLimits(dist) { restDist = dist; controls.minDistance = dist * 0.55; controls.maxDistance = dist * 1.5; }
  function resize() {
    const r = wrap.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width)); height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (current) { const dist = fitDistance(levels[current].extent); const ratio = camera.position.length() / restDist; setLimits(dist); camera.position.setLength(dist * clamp(ratio, 0.55, 1.5)); }
    invalidate();
  }
  new ResizeObserver(resize).observe(wrap);

  function project() {
    if (!anchorCb || !current) return;
    const lv = levels[current];
    const v = lv.group.localToWorld(lv.anchor()).project(camera);
    anchorCb((v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height, v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05);
  }
  function invalidate() { dirty = true; if (!raf && !hidden) raf = requestAnimationFrame(tick); }
  const running = new Set();
  function tick(t) {
    raf = 0; if (hidden) return;
    let more = false;
    for (const fn of [...running]) { if (fn(t) === false) running.delete(fn); else more = true; }
    if (controls.update()) dirty = true;
    if (interacting || t < settleUntil) more = true;
    if (current && !reduceMotion() && t < swayUntil && !userMoved && !running.size) {
      more = true;
      if (t - lastSway > 33) { lastSway = t; levels[current].group.rotation.y = 0.16 * Math.sin(t * 0.0007); dirty = true; }
    }
    if (dirty) { dirty = false; renderer.render(scene, camera); project(); }
    if (more) raf = requestAnimationFrame(tick);
  }
  controls.addEventListener('start', () => { interacting = true; userMoved = true; if (current) levels[current].group.rotation.y = 0; invalidate(); });
  controls.addEventListener('end', () => { interacting = false; settleUntil = performance.now() + 900; invalidate(); });
  controls.addEventListener('change', () => { dirty = true; });

  function tween(ms, step) {
    return new Promise((resolve) => {
      let t0 = 0;
      const fn = (t) => { if (!t0) t0 = t; const k = clamp((t - t0) / ms, 0, 1); step(k); dirty = true; if (k >= 1) { resolve(); return false; } return true; };
      running.add(fn); invalidate();
    });
  }

  async function show(id, fromId, dir, instant) {
    hidden = false; canvas.style.visibility = 'visible';
    const to = levels[id], from = fromId && fromId !== id ? levels[fromId] : null;
    for (const [k, lv] of Object.entries(levels)) if (lv !== to && lv !== from) { lv.group.visible = false; }
    to.group.visible = true; to.group.rotation.y = 0;
    const destDist = fitDistance(to.extent);
    if (instant || !from) {
      if (from) from.group.visible = false;
      setScale(to, 1, new THREE.Vector3()); setOpacity(to, 1);
      const dir0 = current ? camera.position.clone().normalize() : null;
      current = id; setLimits(destDist);
      if (dir0) camera.position.copy(dir0.multiplyScalar(destDist)); else placeCamera(destDist);
      swayUntil = performance.now() + 14000; userMoved = false;
      invalidate(); return;
    }
    from.group.rotation.y = 0;
    const fromAnchor = from.anchor(), toAnchor = to.anchor();
    const d0 = camera.position.length(), camDir = camera.position.clone().normalize();
    from.group.visible = true;
    await tween(1000, (k) => {
      const e = ease(k);
      const outS = dir > 0 ? 1 + 2.2 * e : 1 - 0.65 * e, inS = dir > 0 ? 0.35 + 0.65 * e : 2.4 - 1.4 * e;
      setScale(from, outS, fromAnchor); setOpacity(from, 1 - smooth(0.05, 0.6, k));
      setScale(to, inS, dir > 0 ? new THREE.Vector3() : toAnchor); setOpacity(to, smooth(0.3, 0.95, k));
      camera.position.copy(camDir).multiplyScalar(d0 + (destDist - d0) * e);
    });
    from.group.visible = false; setScale(from, 1, new THREE.Vector3()); setOpacity(from, 1);
    setScale(to, 1, new THREE.Vector3()); setOpacity(to, 1);
    current = id; setLimits(destDist); userMoved = false; swayUntil = performance.now() + 9000;
    invalidate();
  }

  return {
    show,
    setMode(mode) { if (mode === 'hidden') { hidden = true; canvas.style.visibility = 'hidden'; } },
    setAnchorCallback(fn) { anchorCb = fn; invalidate(); },
    setContraction(s) { levels.sarcomere.setContraction(s); invalidate(); },
    resetCamera() { if (!current) return; const d = fitDistance(levels[current].extent); setLimits(d); placeCamera(d); userMoved = true; invalidate(); },
    nudge(dAz, dPol) {
      userMoved = true;
      const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
      sph.theta = clamp(sph.theta + dAz, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      sph.phi = clamp(sph.phi + dPol, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.setFromSpherical(sph).add(controls.target); camera.lookAt(controls.target); invalidate();
    },
    zoomBy(f) { userMoved = true; camera.position.setLength(clamp(camera.position.length() * f, controls.minDistance, controls.maxDistance)); invalidate(); },
    get info() { return { renderer: renderer.info.render, pixelRatio: renderer.getPixelRatio(), current, lowEnd }; },
  };
}
