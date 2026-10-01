// Light scene: the three.js stage for "Follow a photon". One renderer, one scene per stop, a small home-made bloom
// (no extra libraries), a label layer, and a gentle orbit. Built by light.js; words come from light.json.
//
// What is real and what is drawn:
//   sun:     prism angles from flint glass (physics.js, OpenStax Table 1.2), fan drawn 3x wider; band brightness from
//            the ASTM G173 sunlight curve; colours from CIE 1931. The Sun's surface and glow are drawn.
//   leaf:    each photon's wavelength is sampled from ASTM G173 sunlight (as photons), and it is caught or bounced with
//            the chance from the PhotochemCAD chlorophyll spectra (physics.js). The leaf itself is drawn.
//   cell:    drawn, not to scale.
//   antenna: every atom of 42 chlorophylls and 12 carotenoids, and the protein trace, from PDB 2BHW. The hop route is
//            picked here from real magnesium to magnesium distances. Reaction centre, electron and water are drawn.
import * as THREE from '../vendor/three/0.170.0/build/three.module.js';
import { photon, prismDeviation } from './physics.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const FAN_X = 3;            // the prism fan is drawn this many times wider than real

// ---------------------------------------------------------------------------------------------------------------
// shared GLSL
const NOISE = `
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise3(p); p *= 2.03; a *= 0.5; } return s; }
`;

const FS_VERT = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Bloom: dual filter (down, then additive up) on a half-float chain, then composite with tone mapping and fade.
class Post {
  constructor(renderer, samples) {
    this.r = renderer;
    this.enabled = true;
    const opt = { type: THREE.HalfFloatType, depthBuffer: true };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { ...opt, samples });
    this.mips = [];
    for (let i = 0; i < 5; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(fsTriangle());
    this.quad.frustumCulled = false;
    this.fs = new THREE.Scene(); this.fs.add(this.quad);
    this.down = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.9 }, first: { value: 1 } },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float first; varying vec2 vUv;
        vec3 pre(vec3 c){ if (first < 0.5) return c; float br = max(c.r, max(c.g, c.b)); float soft = clamp(br - threshold + 0.6, 0.0, 1.2); soft = soft * soft / 4.8;
          return c * max(soft, br - threshold) / max(br, 1e-4); }
        void main(){ vec2 o = texel * 0.5; vec3 s = pre(texture2D(tSrc, vUv).rgb) * 4.0;
          s += pre(texture2D(tSrc, vUv - o).rgb) + pre(texture2D(tSrc, vUv + o).rgb) + pre(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) + pre(texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb);
          gl_FragColor = vec4(min(s / 8.0, vec3(60.0)), 1.0); }`,
    });
    this.up = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, gain: { value: 1 } },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 texel; uniform float gain; varying vec2 vUv;
        void main(){ vec2 o = texel * 0.5; vec3 s = vec3(0.0);
          s += texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
          s += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
          s += (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb) * 2.0;
          gl_FragColor = vec4(s / 12.0 * gain, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.9 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) },
        vignette: { value: 0.55 }, time: { value: 0 }, useBloom: { value: 1 } },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength; uniform float fade; uniform vec3 fadeColor; uniform float vignette; uniform float time; uniform float useBloom; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){ vec3 c = texture2D(tScene, vUv).rgb;
          if (useBloom > 0.5) c += texture2D(tBloom, vUv).rgb * strength;
          vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 1.5;
          c = mix(c, fadeColor, fade);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (h(gl_FragCoord.xy + time) - 0.5) / 255.0; }`,
    });
  }
  setSize(w, h) {
    this.scene.setSize(w, h);
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (const m of this.mips) { m.setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
  }
  pass(mat, src, dst, clear = true) {
    this.quad.material = mat;
    mat.uniforms.tSrc.value = src.texture;
    mat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
    this.r.setRenderTarget(dst);
    if (clear) this.r.clear();
    this.r.render(this.fs, this.cam);
  }
  render(scene, camera, t) {
    const r = this.r;
    r.setRenderTarget(this.scene); r.clear(); r.render(scene, camera);
    if (this.enabled) {
      this.down.uniforms.first.value = 1; this.pass(this.down, this.scene, this.mips[0]);
      this.down.uniforms.first.value = 0;
      for (let i = 1; i < this.mips.length; i++) this.pass(this.down, this.mips[i - 1], this.mips[i]);
      r.autoClear = false;
      for (let i = this.mips.length - 1; i > 0; i--) this.pass(this.up, this.mips[i], this.mips[i - 1], false);
      r.autoClear = true;
    }
    this.quad.material = this.comp;
    const u = this.comp.uniforms;
    u.tScene.value = this.scene.texture; u.tBloom.value = this.mips[0].texture; u.time.value = t % 100; u.useBloom.value = this.enabled ? 1 : 0;
    r.setRenderTarget(null); r.render(this.fs, this.cam);
  }
  dispose() { this.scene.dispose(); this.mips.forEach((m) => m.dispose()); [this.down, this.up, this.comp].forEach((m) => m.dispose()); this.quad.geometry.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------
// glowing points: one material for photons, sparks, flashes, magnesium halos, bubbles
function glowPoints(n, { ring = false } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('acol', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, n);
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 acol; attribute float asize; uniform float uScale; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = asize > 0.0 ? clamp(asize * uScale / max(-mv.z, 0.05), 1.5, 512.0) : 0.0; vC = acol; }`,
    fragmentShader: ring
      ? `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float a = smoothstep(1.0, 0.82, d) * smoothstep(0.55, 0.8, d) + exp(-d * d * 6.0) * 0.15; gl_FragColor = vec4(vC * a, 1.0); }`
      : `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float a = exp(-d * d * 5.0) * 0.75 + smoothstep(0.32, 0.0, d) * 1.3; gl_FragColor = vec4(vC * a * (1.0 - d * d * 0.35), 1.0); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.userData.n = n;
  p.userData.set = (i, pos, col, size) => {
    const P = g.attributes.position.array, Cc = g.attributes.acol.array, S = g.attributes.asize.array;
    P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z;
    Cc[i * 3] = col[0]; Cc[i * 3 + 1] = col[1]; Cc[i * 3 + 2] = col[2]; S[i] = size;
  };
  p.userData.hide = (i) => { g.attributes.asize.array[i] = 0; };
  p.userData.flush = () => { g.attributes.position.needsUpdate = true; g.attributes.acol.needsUpdate = true; g.attributes.asize.needsUpdate = true; };
  return p;
}

function backdrop(top, bottom, glowPos, glowCol) {
  const m = new THREE.ShaderMaterial({
    uniforms: { cTop: { value: new THREE.Color(top) }, cBot: { value: new THREE.Color(bottom) }, gPos: { value: new THREE.Vector2(...(glowPos || [0.5, 1.2])) },
      gCol: { value: new THREE.Color(glowCol || 0x000000) }, time: { value: 0 } },
    depthWrite: false, depthTest: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `uniform vec3 cTop; uniform vec3 cBot; uniform vec2 gPos; uniform vec3 gCol; uniform float time; varying vec2 vUv; ${NOISE}
      void main(){ vec3 c = mix(cBot, cTop, smoothstep(0.0, 1.0, vUv.y));
        float g = exp(-length((vUv - gPos) * vec2(1.6, 1.0)) * 2.6); c += gCol * g;
        c *= 0.92 + 0.16 * fbm(vec3(vUv * 3.0, time * 0.02));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(fsTriangle(), m);
  mesh.frustumCulled = false; mesh.renderOrder = -100;
  return mesh;
}

function fresnelMat(color, { base = 0.06, rim = 0.75, power = 2.2, glow = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, base: { value: base }, rim: { value: rim }, pw: { value: power }, glow: { value: glow }, fade: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 col; uniform float base; uniform float rim; uniform float pw; uniform float glow; uniform float fade; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), pw); float a = (base + rim * f) * fade; gl_FragColor = vec4(col * (0.6 + glow * f), a); }`,
  });
}

// quad from a to b in the XY plane, with widths at each end (ribbon facing +z)
function ribbon(a, b, wa, wb, mat) {
  const d = new V3().subVectors(b, a); const n = new V3(-d.y, d.x, 0).normalize();
  const g = new THREE.BufferGeometry();
  const P = [a.x + n.x * wa, a.y + n.y * wa, a.z, a.x - n.x * wa, a.y - n.y * wa, a.z, b.x + n.x * wb, b.y + n.y * wb, b.z, b.x - n.x * wb, b.y - n.y * wb, b.z];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return new THREE.Mesh(g, mat);
}

function beamMat(rgb, intensity, { flow = 0.6 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(rgb[0], rgb[1], rgb[2]) }, k: { value: intensity }, time: { value: 0 }, flow: { value: flow } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 col; uniform float k; uniform float time; uniform float flow; varying vec2 vUv;
      void main(){ float across = 1.0 - abs(vUv.y - 0.5) * 2.0; float a = pow(across, 1.8);
        float streak = 0.85 + 0.15 * sin(vUv.x * 40.0 - time * 6.0 * flow) * sin(vUv.x * 13.0 - time * 2.3 * flow);
        float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        gl_FragColor = vec4(col * k * a * streak * ends, 1.0); }`,
  });
}

// ---------------------------------------------------------------------------------------------------------------
export function createStage(host, ctx) {
  const { S, ui } = ctx;
  const canvas = document.createElement('canvas');
  canvas.className = 'lt-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'lt-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  host.appendChild(labelLayer);

  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let dprCap = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  const post = new Post(renderer, mobile ? 2 : 4);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);

  const state = { stop: null, nm: 550, t: 0, fade: 0, fadeTarget: 0, pending: null, reduced: !!ctx.reduced, running: false, w: 1, h: 1 };
  const scenes = {};
  const labels = [];

  // ---------- orbit: drag to turn, wheel or pinch to zoom; each scene sets its own limits ----------
  const orbit = { yaw: 0, pitch: 0.3, dist: 10, target: new V3(), minD: 4, maxD: 30, minP: -0.2, maxP: 1.3, enabled: false, yawLimit: Math.PI, idle: 0, auto: 0 };
  const pointers = new Map();
  let pinch0 = 0, dist0 = 0;
  canvas.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); orbit.idle = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = orbit.dist; } });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!orbit.enabled) return;
    if (pointers.size === 1) {
      orbit.yaw = clamp(orbit.yaw - (e.clientX - prev[0]) * 0.006, -orbit.yawLimit, orbit.yawLimit);
      orbit.pitch = clamp(orbit.pitch + (e.clientY - prev[1]) * 0.005, orbit.minP, orbit.maxP);
    } else if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      orbit.dist = clamp(dist0 * pinch0 / Math.max(d, 1), orbit.minD, orbit.maxD);
    }
    kick();
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (!orbit.enabled) return; e.preventDefault(); orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), orbit.minD, orbit.maxD); kick(); }, { passive: false });

  function placeCamera() {
    const cp = Math.cos(orbit.pitch);
    camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
    camera.lookAt(orbit.target);
  }

  // ---------- labels ----------
  function label(text, getPos, cls = '') {
    const el = document.createElement('div');
    el.className = 'lt-label ' + cls; el.textContent = text;
    labelLayer.appendChild(el);
    const L = { el, getPos, scene: null, on: true, alpha: 1 };
    labels.push(L);
    return L;
  }
  const tmp = new V3();
  function updateLabels() {
    for (const L of labels) {
      const show = L.on && L.scene === state.stop && state.fade < 0.5;
      if (!show) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; continue; }
      const p = L.getPos(tmp);
      if (!p) { L.el.style.display = 'none'; continue; }
      tmp.copy(p).project(camera);
      if (tmp.z > 1 || tmp.z < -1) { L.el.style.display = 'none'; continue; }
      const x = (tmp.x * 0.5 + 0.5) * state.w, y = (-tmp.y * 0.5 + 0.5) * state.h;
      L.el.style.display = '';
      L.el.style.opacity = String(L.alpha);
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -130%)`;
    }
  }

  // =============================================================================================================
  // STOP 1: the Sun, a prism and a photon
  function buildSun() {
    const scene = new THREE.Scene();
    scene.add(backdrop(0x0b1a38, 0x02040b, [0.18, 0.86], 0x3a2208));
    // dust and stars
    const stars = glowPoints(420);
    for (let i = 0; i < 420; i++) {
      const p = new V3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 34, -8 - Math.random() * 30);
      const c = 0.25 + Math.random() * 0.5;
      stars.userData.set(i, p, [c * 0.8, c * 0.9, c * 1.1], 0.05 + Math.random() * 0.09);
    }
    stars.userData.flush(); scene.add(stars);

    // prism, apex down, turned by rho so the fan rises gently to the right
    const s = 2.7, hgt = s * Math.sqrt(3) / 2, rho = -10 * DEG;
    const center = new V3(-0.4, -0.9, 0);
    const local = { apex: new V3(0, -hgt * 2 / 3, 0), tl: new V3(-s / 2, hgt / 3, 0), tr: new V3(s / 2, hgt / 3, 0) };
    const toW = (v) => new V3(v.x * Math.cos(rho) - v.y * Math.sin(rho), v.x * Math.sin(rho) + v.y * Math.cos(rho), v.z).add(center);
    const pinL = new V3().lerpVectors(local.tl, local.apex, 0.4), poutL = new V3(-pinL.x, pinL.y, 0);
    const pIn = toW(pinL), pOut = toW(poutL);
    const d550 = prismDeviation(550);
    const aIn = rho - d550 / 2 * DEG;
    const devVis = (nm) => (d550 + FAN_X * (prismDeviation(nm) - d550)) * DEG;
    const aOut = (nm) => aIn + devVis(nm);
    const sunPos = new V3(pIn.x - Math.cos(aIn) * 7.6, pIn.y - Math.sin(aIn) * 7.6, -0.6);
    const screenX = pOut.x + 7.4;
    const hitOf = (nm) => new V3(screenX, pOut.y + (screenX - pOut.x) * Math.tan(aOut(nm)), 0);

    // prism glass
    const shape = new THREE.Shape([new THREE.Vector2(local.apex.x, local.apex.y), new THREE.Vector2(local.tr.x, local.tr.y), new THREE.Vector2(local.tl.x, local.tl.y)]);
    const pg = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    pg.translate(0, 0, -0.8);
    const prism = new THREE.Group();
    const glass = new THREE.Mesh(pg, fresnelMat(0x9fd8ff, { base: 0.07, rim: 0.55, power: 1.6, glow: 1.6 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(pg, 20), new THREE.LineBasicMaterial({ color: new THREE.Color(0.75, 0.95, 1.25), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    prism.add(glass, edges); prism.rotation.z = rho; prism.position.copy(center);
    scene.add(prism);

    // the Sun
    const sunMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float time; varying vec3 vN; varying vec3 vP; ${NOISE}
        void main(){ float mu = clamp(vN.z, 0.0, 1.0); float limb = 0.35 + 0.65 * pow(mu, 0.55);
          float g = fbm(vP * 5.0 + vec3(time * 0.07, -time * 0.05, time * 0.04)); float cells = smoothstep(0.35, 0.75, g);
          vec3 col = mix(vec3(5.2, 2.6, 0.8), vec3(7.5, 5.6, 3.2), cells) * limb; gl_FragColor = vec4(col, 1.0); }`,
    });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 32), sunMat);
    sun.position.copy(sunPos); scene.add(sun);
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float glow = exp(-r * 3.4) * 1.5 + exp(-r * 10.0) * 2.0;
          float rays = pow(0.5 + 0.5 * sin(a * 11.0 + time * 0.15) * sin(a * 6.0 - time * 0.11), 3.0) * exp(-r * 2.2) * 0.8;
          vec3 c = vec3(1.0, 0.72, 0.42) * (glow + rays) * smoothstep(1.0, 0.55, r); gl_FragColor = vec4(c, 1.0); }`,
    });
    const corona = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), coronaMat);
    corona.position.copy(sunPos).add(new V3(0, 0, -0.4)); scene.add(corona);

    // white beam in, a pale beam inside the glass
    const beamIn = ribbon(new V3().copy(sunPos).setZ(0), pIn, 0.22, 0.12, beamMat([1, 0.95, 0.88], 1.5));
    const beamGlass = ribbon(pIn, pOut, 0.11, 0.12, beamMat([1, 0.97, 0.93], 0.9, { flow: 0.3 }));
    scene.add(beamIn, beamGlass);

    // the fan: one band every 5 nm, brightness from the ASTM G173 sunlight curve
    let smax = 0; for (let nm = 380; nm <= 750; nm += 5) smax = Math.max(smax, S.v('solar', nm));
    const fan = new THREE.Group();
    for (let nm = 380; nm <= 750; nm += 5) {
      const k = 0.25 + 1.4 * S.v('solar', nm) / smax;
      const m = beamMat(S.linColour(nm), k, { flow: 0.4 });
      fan.add(ribbon(pOut, hitOf(nm), 0.02, 0.085, m));
    }
    scene.add(fan);
    // the screen and where the colours land
    const scrTop = hitOf(380).y + 0.6, scrBot = hitOf(750).y - 0.6;
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.12, scrTop - scrBot + 1.2, 2.2), new THREE.MeshBasicMaterial({ color: 0x10182a }));
    scr.position.set(screenX + 0.08, (scrTop + scrBot) / 2, 0); scene.add(scr);
    const strip = glowPoints(75);
    let si = 0;
    for (let nm = 380; nm <= 750; nm += 5, si++) {
      const c = S.linColour(nm), k = 0.5 + 1.2 * S.v('solar', nm) / smax;
      strip.userData.set(si, hitOf(nm).setX(screenX - 0.02), [c[0] * k, c[1] * k, c[2] * k], 0.42);
    }
    strip.userData.flush(); scene.add(strip);
    // your photon's band, brighter
    const selMat = beamMat([1, 1, 1], 2.4, { flow: 1 });
    let sel = ribbon(pOut, hitOf(550), 0.03, 0.12, selMat);
    scene.add(sel);

    // the photon: a short wave packet drawn with glowing points
    const N = 200;
    const pkt = glowPoints(N + 1);
    scene.add(pkt);
    const L1 = sunPos.clone().setZ(0).distanceTo(pIn), L2 = pIn.distanceTo(pOut);
    let path = [], plen = 0;
    const setPath = (nm) => {
      const a = sunPos.clone().setZ(0), h = hitOf(nm);
      path = [[a, pIn], [pIn, pOut], [pOut, h]];
      plen = L1 + L2 + pOut.distanceTo(h);
    };
    const along = (s, out, tan) => {
      let acc = 0;
      for (const [a, b] of path) {
        const l = a.distanceTo(b);
        if (s <= acc + l || b === path[path.length - 1][1]) {
          const t = clamp((s - acc) / l, 0, 1); out.lerpVectors(a, b, t); tan.subVectors(b, a).normalize(); return;
        }
        acc += l;
      }
    };
    setPath(550);
    let pos = 0;
    const P = new V3(), T = new V3(), Nn = new V3();
    const updPacket = (dt) => {
      const nm = state.nm;
      const lam = nm * 0.00052;         // on-screen wavelength, proportional to the real one
      const half = lam * 3.4;            // packet half-length
      const speed = 2.8;
      if (!state.reduced) pos += dt * speed; else pos = L1 + L2 + 2.2;
      if (pos > plen + half) pos = -half;
      const lc = S.linColour(nm), k = 3.0;
      for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1, s = pos + u * half;
        if (s < 0 || s > plen) { pkt.userData.hide(i); continue; }
        along(s, P, T);
        Nn.set(-T.y, T.x, 0);
        const env = Math.exp(-u * u * 3.2);
        const y = Math.sin((s - pos) / lam * Math.PI * 2) * 0.22 * env;
        P.addScaledVector(Nn, y);
        const glow = env * k;
        pkt.userData.set(i, P, [lc[0] * glow, lc[1] * glow, lc[2] * glow], 0.06 + 0.05 * env);
      }
      pkt.userData.flush();
    };

    const labs = [
      label(ui.labelSun, (v) => v.copy(sunPos).add(new V3(0, 1.6, 0))),
      label(ui.labelPrism, (v) => v.copy(center).add(new V3(0, -1.9, 0))),
      label(ui.labelWhite, (v) => v.lerpVectors(sunPos, pIn, 0.55).add(new V3(0, 0.35, 0)), 'lt-label-soft'),
    ];
    const here = label('', (v) => v.copy(hitOf(state.nm)).add(new V3(0.15, 0.25, 0)), 'lt-label-photon');
    labs.push(here);
    labs.forEach((l) => (l.scene = 'sun'));

    const setNm = (nm) => {
      scene.remove(sel); sel.geometry.dispose();
      const c = S.linColour(nm);
      selMat.uniforms.col.value.setRGB(c[0], c[1], c[2]);
      sel = ribbon(pOut, hitOf(nm), 0.035, 0.13, selMat); scene.add(sel);
      setPath(nm);
      here.el.textContent = `${Math.round(nm)} nm`;
      here.el.style.setProperty('--c', S.cssOf(nm, false));
    };
    const mats = [sunMat, coronaMat, beamIn.material, beamGlass.material, selMat, ...fan.children.map((m) => m.material)];
    return {
      scene, setNm,
      enter() {
        orbit.enabled = false; orbit.target.set(0.6, 0.4, 0); orbit.yaw = 0; orbit.pitch = 0;
        const aspect = state.w / state.h;
        orbit.dist = Math.max(13.5, 10.6 / (Math.tan(camera.fov / 2 * DEG) * aspect));
        post.comp.uniforms.vignette.value = 0.6;
      },
      update(dt, t) {
        mats.forEach((m) => { if (m.uniforms.time) m.uniforms.time.value = t; });
        updPacket(dt);
        // gentle drift so the scene breathes
        if (!state.reduced) { orbit.yaw = Math.sin(t * 0.07) * 0.05; orbit.pitch = Math.sin(t * 0.05) * 0.03; }
      },
    };
  }

  // =============================================================================================================
  // STOP 2 (and 5): the leaf in sunlight, photon rain with real catch chances
  const LEAF_LEN = 6.6, LEAF_W = 2.0;
  const leafHalf = (u) => 0.98 * Math.pow(Math.sin(Math.PI * Math.pow(clamp(u, 0, 1), 0.72)), 0.8) * (1 - 0.18 * u);
  const leafY = (u, v, t) => 0.42 * Math.pow(Math.abs(v), 1.4) - 0.9 * Math.pow(u - 0.45, 2) + 0.05 * Math.sin(t * 0.7 + u * 3.0) * u;
  const leafXZ = (u, v) => [(u - 0.5) * LEAF_LEN, v * LEAF_W];

  function buildLeaf(payoff) {
    const scene = new THREE.Scene();
    scene.add(backdrop(0x16354a, 0x04110b, [0.15, 0.95], 0x5a4a1c));
    const sunDir = new V3(-0.55, 1, -0.45).normalize();
    // bokeh foliage behind
    const bokeh = glowPoints(70);
    for (let i = 0; i < 70; i++) {
      const p = new V3((Math.random() - 0.5) * 30, -3 - Math.random() * 6, -6 - Math.random() * 14);
      const g = 0.04 + Math.random() * 0.06;
      bokeh.userData.set(i, p, [g * 0.5, g * 1.2, g * 0.45], 0.8 + Math.random() * 2.2);
    }
    bokeh.userData.flush(); scene.add(bokeh);
    const sunGlow = glowPoints(1);
    sunGlow.userData.set(0, sunDir.clone().multiplyScalar(22), [1.4, 1.1, 0.7], 9); sunGlow.userData.flush(); scene.add(sunGlow);

    // leaf surface
    const geo = new THREE.PlaneGeometry(1, 1, 200, 80);
    const leafMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: sunDir }, len: { value: LEAF_LEN }, wid: { value: LEAF_W } },
      side: THREE.DoubleSide, transparent: false,
      vertexShader: `uniform float time; uniform float len; uniform float wid; varying vec2 vL; varying vec3 vNw; varying vec3 vPw;
        float hw(float u){ return 0.98 * pow(sin(3.14159265 * pow(clamp(u, 0.0, 1.0), 0.72)), 0.8) * (1.0 - 0.18 * u); }
        float ly(float u, float v){ return 0.42 * pow(abs(v), 1.4) - 0.9 * pow(u - 0.45, 2.0) + 0.05 * sin(time * 0.7 + u * 3.0) * u; }
        vec3 at(float u, float v){ return vec3((u - 0.5) * len, ly(u, v), v * wid); }
        void main(){ float u = uv.x; float v = (uv.y - 0.5) * 2.0 * max(hw(u), 0.02) * 1.04;
          vec3 p = at(u, v); vec3 du = at(u + 0.004, v) - p; vec3 dv = at(u, v + 0.004) - p;
          vNw = normalize(cross(dv, du)); vPw = (modelMatrix * vec4(p, 1.0)).xyz; vL = vec2(u, v);
          gl_Position = projectionMatrix * viewMatrix * vec4(vPw, 1.0); }`,
      fragmentShader: `uniform vec3 sunDir; varying vec2 vL; varying vec3 vNw; varying vec3 vPw; ${NOISE}
        float hw(float u){ return 0.98 * pow(sin(3.14159265 * pow(clamp(u, 0.0, 1.0), 0.72)), 0.8) * (1.0 - 0.18 * u); }
        vec2 cellD(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hash3(vec3(i + g, 1.0)), hash3(vec3(i + g, 7.0)));
            float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } return vec2(d1, d2); }
        void main(){ float u = vL.x, v = vL.y; float h = hw(u); float e = abs(v) / max(h, 1e-3); if (e > 1.0) discard;
          vec3 N = normalize(vNw); vec3 V = normalize(cameraPosition - vPw); if (dot(N, V) < 0.0) N = -N;
          float mid = smoothstep(0.022 * (1.2 - u), 0.0, abs(v));
          float side = 0.0; float k = fract(u * 11.0 - abs(v) * 3.2); side = smoothstep(0.06, 0.0, abs(k - 0.5) - 0.44) * smoothstep(0.98, 0.2, e) * step(0.06, u);
          vec2 cd = cellD(vec2(u * 95.0, v * 30.0)); float cell = smoothstep(0.0, 0.12, cd.y - cd.x);
          float n = fbm(vec3(u * 14.0, v * 6.0, 0.0));
          vec3 base = mix(vec3(0.035, 0.16, 0.035), vec3(0.11, 0.36, 0.07), n * 0.8 + 0.2);
          base *= 0.78 + 0.22 * cell;
          vec3 vein = vec3(0.32, 0.55, 0.16);
          base = mix(base, vein, max(mid * 0.85, side * 0.55));
          float diff = max(dot(N, sunDir), 0.0); float back = pow(max(dot(-N, sunDir), 0.0), 2.0);
          vec3 H = normalize(sunDir + V); float spec = pow(max(dot(N, H), 0.0), 60.0) * 0.55;
          float trans = pow(max(dot(V, -sunDir), 0.0), 3.0) * 0.6;
          vec3 c = base * (0.25 + 1.35 * diff) + vec3(0.35, 0.8, 0.12) * (back * 0.4 + trans * 0.5) * base * 4.0 + vec3(1.0, 0.96, 0.85) * spec;
          c *= mix(0.55, 1.0, smoothstep(1.0, 0.86, e));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const leaf = new THREE.Mesh(geo, leafMat);
    leaf.frustumCulled = false;
    scene.add(leaf);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.4, 10), new THREE.MeshBasicMaterial({ color: 0x2a5e1a }));
    stem.rotation.z = Math.PI / 2; stem.position.set(-LEAF_LEN / 2 - 0.62, leafY(0, 0, 0) - 0.05, 0); scene.add(stem);

    // photons
    const MAXP = 220, TR = 5;
    const pts = glowPoints(MAXP * TR + 1);
    scene.add(pts);
    const flashes = glowPoints(80, { ring: true });
    const flashCore = glowPoints(80);
    scene.add(flashes, flashCore);
    const bubbles = glowPoints(60, { ring: true });
    if (payoff) scene.add(bubbles);
    const pool = [];
    const fl = [];
    const bub = [];
    let rainOn = !state.reduced, spawnAcc = 0;
    const counts = { caught: 0, bounced: 0 };
    const recent = [];

    function landPoint() {
      for (let k = 0; k < 30; k++) {
        const u = 0.12 + Math.random() * 0.8, v = (Math.random() * 2 - 1) * leafHalf(u) * 0.85;
        const [x, z] = leafXZ(u, v);
        return { u, v, x, z };
      }
      return { u: 0.5, v: 0, x: 0, z: 0 };
    }
    function spawn(nm, special) {
      let p = pool.find((q) => !q.live);
      if (!p) { if (pool.length >= MAXP) return null; p = { trail: [] }; pool.push(p); }
      const lp = landPoint();
      const target = new V3(lp.x, leafY(lp.u, lp.v, state.t), lp.z);
      const start = target.clone().addScaledVector(sunDir, special ? 7 : 9 + Math.random() * 3);
      Object.assign(p, { live: true, nm, special: !!special, pos: start, target, lp, phase: 'fall', speed: special ? 3.2 : 6.5 + Math.random() * 2,
        col: S.linColour(nm), vel: new V3().subVectors(target, start).normalize(), age: 0, trail: Array.from({ length: TR }, () => start.clone()) });
      return p;
    }
    function flash(pos, col, big) {
      let f = fl.find((q) => !q.live);
      if (!f) { if (fl.length >= 80) return; f = {}; fl.push(f); }
      Object.assign(f, { live: true, pos: pos.clone(), col, age: 0, life: big ? 1.4 : 0.7, size: big ? 1.6 : 0.55 });
    }
    function land(p) {
      const chance = S.pCatch(p.nm);
      const caught = Math.random() < chance;
      if (caught) {
        counts.caught++; p.live = false; flash(p.pos, p.col, p.special);
      } else {
        counts.bounced++;
        p.phase = 'bounce';
        const camDir = new V3().subVectors(camera.position, p.pos).normalize();
        p.vel = camDir.add(new V3((Math.random() - 0.5) * 0.5, Math.random() * 0.2, (Math.random() - 0.5) * 0.5)).normalize();
        p.speed = p.special ? 3.0 : 6;
      }
      recent.push({ nm: p.nm, caught }); if (recent.length > 160) recent.shift();
      if (p.special) ctx.onEvent('leafResult', { nm: p.nm, caught, p: chance });
      ctx.onEvent('leafCount', counts);
    }

    const youLabel = label('', (v) => { const sp = pool.find((q) => q.live && q.special); return sp ? v.copy(sp.pos).add(new V3(0, 0.25, 0)) : null; }, 'lt-label-photon');
    youLabel.scene = payoff ? 'payoff' : 'leaf';

    const update = (dt, t) => {
      leafMat.uniforms.time.value = t;
      // rain
      if (rainOn && !state.reduced) {
        spawnAcc += dt * (payoff ? 6 : 26);
        while (spawnAcc > 1) { spawnAcc--; spawn(S.sampleNm(Math.random())); }
      }
      let i = 0;
      for (const p of pool) {
        if (!p.live) continue;
        p.age += dt;
        if (p.phase === 'fall') {
          const step = p.speed * dt;
          const toT = p.pos.distanceTo(p.target);
          if (toT <= step) { p.pos.copy(p.target); land(p); }
          else p.pos.addScaledVector(p.vel, step);
        } else {
          p.pos.addScaledVector(p.vel, p.speed * dt);
          if (p.pos.distanceTo(camera.position) < 1.6 || p.age > 8) p.live = false;
        }
        p.trail.pop(); p.trail.unshift(p.pos.clone());
      }
      for (const p of pool) {
        if (!p.live) { for (let k = 0; k < TR; k++) pts.userData.hide(i * TR + k); i++; continue; }
        const near = p.phase === 'bounce' ? clamp((p.pos.distanceTo(camera.position) - 1.6) / 2.5, 0, 1) : 1;
        for (let k = 0; k < TR; k++) {
          const a = (1 - k / TR) * near * (p.special ? 4 : 2.2);
          pts.userData.set(i * TR + k, p.trail[k], [p.col[0] * a, p.col[1] * a, p.col[2] * a], (p.special ? 0.22 : 0.075) * (1 - k * 0.14));
        }
        i++;
      }
      for (let j = i * TR; j < MAXP * TR; j++) pts.userData.hide(j);
      pts.userData.flush();
      // flashes
      fl.forEach((f, j) => {
        if (!f.live) { flashes.userData.hide(j); flashCore.userData.hide(j); return; }
        f.age += dt; const k = f.age / f.life;
        if (k >= 1) { f.live = false; flashes.userData.hide(j); flashCore.userData.hide(j); return; }
        const a = (1 - k) * 2.4, g = [0.25 * a, 1.0 * a, 0.35 * a];
        flashes.userData.set(j, f.pos, [f.col[0] * a, f.col[1] * a, f.col[2] * a], f.size * (0.3 + k * 1.4));
        flashCore.userData.set(j, f.pos, g, f.size * 0.5 * (1 - k));
      });
      for (let j = fl.length; j < 80; j++) { flashes.userData.hide(j); flashCore.userData.hide(j); }
      flashes.userData.flush(); flashCore.userData.flush();
      // oxygen bubbles on the payoff stop
      if (payoff) {
        if (!state.reduced && bub.length < 60 && Math.random() < dt * 5) {
          const lp = landPoint(); bub.push({ pos: new V3(lp.x, leafY(lp.u, lp.v, t) + 0.05, lp.z), sp: 0.4 + Math.random() * 0.5, age: 0, s: 0.12 + Math.random() * 0.12 });
        }
        if (state.reduced && !bub.length) for (let k = 0; k < 24; k++) { const lp = landPoint(); bub.push({ pos: new V3(lp.x, leafY(lp.u, lp.v, 0) + 0.2 + Math.random() * 2.5, lp.z), sp: 0, age: 1, s: 0.15 }); }
        for (let k = bub.length - 1; k >= 0; k--) {
          const b = bub[k]; b.age += dt; b.pos.y += b.sp * dt; b.pos.x += Math.sin(b.age * 2 + k) * dt * 0.1;
          if (b.pos.y > 5) bub.splice(k, 1);
        }
        for (let k = 0; k < 60; k++) {
          const b = bub[k];
          if (!b) { bubbles.userData.hide(k); continue; }
          const a = Math.min(1, b.age * 2) * 0.9;
          bubbles.userData.set(k, b.pos, [0.55 * a, 0.85 * a, 1.0 * a], b.s);
        }
        bubbles.userData.flush();
      }
      if (!payoff) youLabel.el.textContent = `${Math.round(state.nm)} nm`;
    };
    return {
      scene,
      enter() {
        orbit.enabled = true; orbit.target.set(0.2, 0, 0.2); orbit.yaw = payoff ? 0.4 : 0.15; orbit.pitch = 0.62;
        const aspect = state.w / state.h;
        orbit.dist = Math.max(8.2, 5.4 / (Math.tan(camera.fov / 2 * DEG) * aspect));
        orbit.minD = 4.5; orbit.maxD = 20; orbit.minP = 0.15; orbit.maxP = 1.35; orbit.yawLimit = 1.4;
        post.comp.uniforms.vignette.value = 0.5;
      },
      update(dt, t) {
        update(dt, t);
        if (payoff && !state.reduced && orbit.idle > 4) orbit.yaw += dt * 0.04;
      },
      send(nm) {
        const p = spawn(nm, true);
        if (!p) return;
        if (state.reduced) {
          // still frame: decide at once and show where it went
          p.pos.copy(p.target); land(p);
          if (p.live) p.pos.addScaledVector(p.vel, 1.2);
          for (let k = 0; k < TR; k++) p.trail[k] = p.pos.clone().addScaledVector(p.vel, -0.15 * k);
        }
      },
      setRain(on) { rainOn = on; },
      rain: () => rainOn,
      counts, recent,
      reset() { counts.caught = 0; counts.bounced = 0; recent.length = 0; },
    };
  }

  // =============================================================================================================
  // STOP 3: into the leaf, into a cell, a chloroplast, a thylakoid stack (drawn, not to scale)
  function buildCell() {
    const scene = new THREE.Scene();
    scene.add(backdrop(0x0d2a22, 0x020806, [0.5, 1.1], 0x123a1c));
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0b2a12, 1.4));
    const dl = new THREE.DirectionalLight(0xfff2dd, 2.2); dl.position.set(-3, 8, 5); scene.add(dl);
    const chloroMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, emissive: 0x0a3a12, roughness: 0.45 });
    const levels = [];
    const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const dummy = new THREE.Object3D();

    // level 0: leaf layers
    {
      const g = new THREE.Group();
      const top = fresnelMat(0xbfeaff, { base: 0.1, rim: 0.6, glow: 1.2 });
      for (let i = 0; i < 10; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.42, 3.0), top); b.position.set(-4.5 + i, 2.35, 0); g.add(b);
      }
      const cut = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.06, 3.1), new THREE.MeshStandardMaterial({ color: 0xcff7ff, transparent: true, opacity: 0.35, roughness: 0.1 }));
      cut.position.set(0, 2.6, 0); g.add(cut);
      const wall = fresnelMat(0xa8f0b8, { base: 0.08, rim: 0.7, glow: 1.4 });
      const cap = new THREE.CapsuleGeometry(0.38, 1.6, 6, 16);
      const ch = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), chloroMat, 11 * 12 + 9 * 6);
      let k = 0;
      for (let i = 0; i < 11; i++) {
        const x = -4.5 + i * 0.9;
        for (const z of [-0.85, 0, 0.85]) { const c = new THREE.Mesh(cap, wall); c.position.set(x, 1.0, z); g.add(c); }
        for (let j = 0; j < 12; j++) {
          const a = rnd() * Math.PI * 2, y = 0.3 + rnd() * 1.4, z = (rnd() - 0.5) * 1.9;
          dummy.position.set(x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.12); dummy.scale.set(0.12, 0.08, 0.09); dummy.rotation.set(rnd(), rnd(), rnd());
          dummy.updateMatrix(); ch.setMatrixAt(k++, dummy.matrix);
        }
      }
      const sp = new THREE.SphereGeometry(1, 20, 14);
      for (let i = 0; i < 9; i++) {
        const x = -4 + i * 1.0 + (rnd() - 0.5) * 0.3, y = -0.85 - rnd() * 0.5, r = 0.38 + rnd() * 0.12;
        const c = new THREE.Mesh(sp, wall); c.position.set(x, y, (rnd() - 0.5) * 1.2); c.scale.setScalar(r); g.add(c);
        for (let j = 0; j < 6; j++) { dummy.position.set(x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, c.position.z + (rnd() - 0.5) * r); dummy.scale.set(0.1, 0.07, 0.08); dummy.updateMatrix(); ch.setMatrixAt(k++, dummy.matrix); }
      }
      ch.count = k; g.add(ch);
      for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.26, 3.0), top); b.position.set(-4.5 + i, -2.15, 0); g.add(b); }
      levels.push({ g, target: new V3(0, 1.2, 0.85), start: new V3(0.4, 6, 3), cam: { t: new V3(0, 0.1, 0), dist: 10.5, pitch: 0.18, yaw: 0.3 },
        labels: [[ui.labelTop, new V3(-3.6, 2.9, 1.4)], [ui.labelPalisade, new V3(-4.1, 1.9, 1.5)], [ui.labelSpongy, new V3(2.6, -1.6, 1.0)]] });
    }
    // level 1: one plant cell
    {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 3.2, 1, 1, 1), fresnelMat(0xb9f5c4, { base: 0.06, rim: 0.65, glow: 1.3 }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x8fe0a0, transparent: true, opacity: 0.6 }));
      g.add(box, edges);
      const vac = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), fresnelMat(0x9fd3ff, { base: 0.1, rim: 0.5, glow: 1.0 }));
      vac.scale.set(1.05, 1.95, 1.05); vac.position.set(-0.1, -0.2, -0.1); g.add(vac);
      const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), new THREE.MeshStandardMaterial({ color: 0x9b6bd6, roughness: 0.5, emissive: 0x24123d }));
      nuc.position.set(1.05, 1.7, 0.85); g.add(nuc);
      const ch = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), chloroMat, 40);
      const chPos = [];
      for (let i = 0; i < 40; i++) {
        const face = i % 4, y = -2.2 + rnd() * 4.4, s = (rnd() - 0.5) * 2.6;
        const p = face === 0 ? new V3(1.38, y, s) : face === 1 ? new V3(-1.38, y, s) : face === 2 ? new V3(s, y, 1.38) : new V3(s, y, -1.38);
        dummy.position.copy(p); dummy.scale.set(0.34, 0.2, 0.22); dummy.lookAt(0, y, 0); dummy.updateMatrix(); ch.setMatrixAt(i, dummy.matrix); chPos.push(p);
      }
      chPos[0].set(1.38, 1.6, 1.2); dummy.position.copy(chPos[0]); dummy.scale.set(0.34, 0.2, 0.22); dummy.lookAt(0, 1.6, 0); dummy.updateMatrix(); ch.setMatrixAt(0, dummy.matrix);
      g.add(ch);
      const cyto = glowPoints(160);
      for (let i = 0; i < 160; i++) { const p = new V3((rnd() - 0.5) * 3, (rnd() - 0.5) * 5, (rnd() - 0.5) * 3); if (p.x * p.x / 1.2 + p.y * p.y / 4 + p.z * p.z / 1.2 < 1) p.multiplyScalar(1.4); cyto.userData.set(i, p, [0.05, 0.09, 0.07], 0.06); }
      cyto.userData.flush(); g.add(cyto);
      levels.push({ g, target: chPos[0].clone(), start: new V3(-1, 6.5, 2), cam: { t: new V3(0, 0, 0), dist: 10, pitch: 0.25, yaw: 0.55 },
        labels: [[ui.labelWall, new V3(-1.6, 2.75, 1.6)], [ui.labelVacuole, new V3(-0.1, -0.2, 1.1)], [ui.labelNucleus, new V3(1.05, 2.25, 0.85)], [ui.labelChloroplast, new V3(1.5, 1.2, 1.5)]] });
    }
    // level 2: a chloroplast
    {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), fresnelMat(0x9ff0a8, { base: 0.05, rim: 0.7, glow: 1.5 }));
      outer.scale.set(4.0, 2.0, 2.2); g.add(outer);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), fresnelMat(0x6fd87e, { base: 0.03, rim: 0.45, glow: 1.2 }));
      inner.scale.set(3.82, 1.86, 2.05); g.add(inner);
      const discMat = new THREE.MeshStandardMaterial({ color: 0x2c9a3c, emissive: 0x0d4a18, roughness: 0.35 });
      const disc = new THREE.CylinderGeometry(0.36, 0.36, 0.06, 28);
      const stacks = [];
      for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 2; iz++) {
        const x = -2.7 + ix * 1.08 + (rnd() - 0.5) * 0.2, z = (iz - 0.5) * 1.15 + (rnd() - 0.5) * 0.2, y = (rnd() - 0.5) * 0.35;
        if ((x * x) / 13 + (z * z) / 3.6 > 1) continue;
        stacks.push(new V3(x, y, z));
      }
      const per = 8, im = new THREE.InstancedMesh(disc, discMat, stacks.length * per);
      let k = 0;
      for (const s of stacks) for (let j = 0; j < per; j++) { dummy.position.set(s.x, s.y - 0.32 + j * 0.09, s.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); im.setMatrixAt(k++, dummy.matrix); }
      g.add(im);
      const lamMat = new THREE.MeshStandardMaterial({ color: 0x3fae52, emissive: 0x0b3a14, roughness: 0.5, transparent: true, opacity: 0.8 });
      for (let i = 0; i < stacks.length; i++) for (let j = i + 1; j < stacks.length; j++) {
        const d = stacks[i].distanceTo(stacks[j]); if (d > 1.3) continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(d, 0.025, 0.18), lamMat);
        m.position.lerpVectors(stacks[i], stacks[j], 0.5); m.lookAt(stacks[j]); m.rotateY(Math.PI / 2); g.add(m);
      }
      const str = glowPoints(220);
      for (let i = 0; i < 220; i++) { const p = new V3((rnd() - 0.5) * 7, (rnd() - 0.5) * 3.4, (rnd() - 0.5) * 3.8); if ((p.x * p.x) / 14 + (p.y * p.y) / 3.2 + (p.z * p.z) / 4 > 1) p.multiplyScalar(0.6); str.userData.set(i, p, [0.06, 0.1, 0.06], 0.05); }
      str.userData.flush(); g.add(str);
      const tgt = stacks[Math.floor(stacks.length / 2)].clone().add(new V3(0, 0.36, 0));
      levels.push({ g, target: tgt, start: new V3(-2, 5.5, 3), cam: { t: new V3(0, 0, 0), dist: 9.5, pitch: 0.42, yaw: 0.2 },
        labels: [[ui.labelStack, tgt.clone().add(new V3(0, 0.35, 0))], [ui.labelStroma, new V3(-2.6, -0.9, 1.4)], [ui.labelChloroplast, new V3(2.6, 1.9, 0)]] });
    }
    // level 3: a thylakoid stack with light-harvesting complexes on the membrane
    {
      const g = new THREE.Group();
      const memMat = new THREE.MeshStandardMaterial({ color: 0x2f9a40, emissive: 0x0c3d16, roughness: 0.4 });
      for (let j = 0; j < 5; j++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.24, 64), memMat); d.position.y = -2.2 + j * 0.56; g.add(d); }
      const top = -2.2 + 4 * 0.56 + 0.12;
      const lhc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9fe08c, emissive: 0x1d4a12, roughness: 0.35 }), 60 * 3);
      const ps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), new THREE.MeshStandardMaterial({ color: 0x7c8fd6, emissive: 0x141c40, roughness: 0.4 }), 14);
      let k = 0, q = 0; const spots = [];
      for (let i = 0; i < 74; i++) {
        const r = Math.sqrt(rnd()) * 2.35, a = rnd() * Math.PI * 2, p = new V3(Math.cos(a) * r, top + 0.06, Math.sin(a) * r);
        if (spots.some((s) => s.distanceTo(p) < 0.42)) continue;
        spots.push(p);
        if (q < 14 && i % 5 === 0) { dummy.position.copy(p); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); ps.setMatrixAt(q++, dummy.matrix); continue; }
        for (let t = 0; t < 3 && k < 180; t++) { const b = a + t * 2.094; dummy.position.set(p.x + Math.cos(b) * 0.11, p.y, p.z + Math.sin(b) * 0.11); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); lhc.setMatrixAt(k++, dummy.matrix); }
      }
      lhc.count = k; ps.count = q; g.add(lhc, ps);
      const tgt = spots.reduce((best, s) => (s.length() < best.length() ? s : best), spots[0]).clone();
      const ringPts = glowPoints(1, { ring: true }); ringPts.userData.set(0, tgt.clone().add(new V3(0, 0.05, 0)), [1.2, 2.2, 0.8], 0.75); ringPts.userData.flush(); g.add(ringPts);
      levels.push({ g, target: tgt.clone(), start: new V3(-1.5, 5.5, 2.5), cam: { t: new V3(0, top - 0.4, 0), dist: 5.8, pitch: 0.75, yaw: 0.25 },
        labels: [[ui.labelThylakoid, new V3(-2.4, -1.0, 1.4)], [ui.labelLHC, tgt.clone().add(new V3(0, 0.3, 0))]] });
    }
    levels.forEach((L, i) => {
      L.g.visible = false; scene.add(L.g);
      L.labs = L.labels.map(([t, p]) => { const l = label(t, (v) => v.copy(p)); l.scene = 'cell'; l.on = false; return l; });
    });

    // the photon guide
    const guide = glowPoints(14);
    scene.add(guide);
    let level = 0, gT = 0, dive = null;
    const gp = new V3();
    const showLevel = (i) => {
      levels.forEach((L, j) => { L.g.visible = j === i; L.labs.forEach((l) => (l.on = j === i)); });
      level = i; gT = 0;
      const c = levels[i].cam;
      orbit.target.copy(c.t); orbit.dist = c.dist * Math.max(1, 1.25 / (state.w / state.h)); orbit.pitch = c.pitch; orbit.yaw = c.yaw;
    };
    return {
      scene,
      enter() { orbit.enabled = true; orbit.minD = 2.5; orbit.maxD = 22; orbit.minP = -0.4; orbit.maxP = 1.3; orbit.yawLimit = Math.PI; showLevel(level); post.comp.uniforms.vignette.value = 0.55; },
      update(dt, t) {
        const L = levels[level];
        gT = state.reduced ? 0.999 : (gT + dt / 2.6) % 1.6;
        const k = smooth(Math.min(gT, 1));
        gp.lerpVectors(L.start, L.target, k);
        const lc = S.linColour(state.nm);
        for (let i = 0; i < 14; i++) {
          const kk = smooth(Math.max(0, Math.min(gT, 1) - i * 0.012));
          const p = new V3().lerpVectors(L.start, L.target, kk);
          const a = (1 - i / 14) * (gT > 1 ? Math.max(0, 1 - (gT - 1) * 2.5) : 1) * 3;
          guide.userData.set(i, p, [lc[0] * a, lc[1] * a, lc[2] * a], i === 0 ? 0.2 : 0.11);
        }
        if (state.reduced) for (let i = 1; i < 14; i++) guide.userData.hide(i);
        guide.userData.flush();
        if (dive) {
          dive.t += dt / 0.9;
          orbit.dist = lerp(dive.d0, dive.d1, smooth(dive.t));
          orbit.target.lerpVectors(dive.t0, dive.t1, smooth(dive.t));
          if (dive.t >= 1) { const to = dive.to; dive = null; fadeSwap(() => { showLevel(to); ctx.onEvent('cellLevel', to); }); }
        }
      },
      level: () => level,
      setLevel(i, animate) {
        i = clamp(i, 0, levels.length - 1);
        if (i === level) return;
        if (animate && !state.reduced && i === level + 1) {
          dive = { t: 0, d0: orbit.dist, d1: 1.2, t0: orbit.target.clone(), t1: levels[level].target.clone(), to: i };
        } else { fadeSwap(() => { showLevel(i); ctx.onEvent('cellLevel', i); }); }
      },
      count: levels.length,
    };
  }

  // =============================================================================================================
  // STOP 4: the antenna. Real LHC-II (PDB 2BHW): energy hops pigment to pigment, then a drawn reaction centre.
  function buildAntenna() {
    const lhc = ctx.lhc;
    const scene = new THREE.Scene();
    scene.add(backdrop(0x0c1f2e, 0x020507, [0.5, 1.15], 0x0f2d26));
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x10261c, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(4, 10, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88c8ff, 0.9); rim.position.set(-6, -2, -6); scene.add(rim);
    const exLight = new THREE.PointLight(0xc8ff9a, 0, 3.5, 2); scene.add(exLight);
    const SC = 0.1;
    const root = new THREE.Group(); scene.add(root);

    // protein: alpha carbon trace as soft translucent tubes
    const chainCols = [0x9fb8de, 0xb9a9e0, 0x9fdcc6];
    const protein = new THREE.Group();
    lhc.chains.forEach((c, i) => {
      const pts = []; for (let k = 0; k < c.ca.length; k += 3) pts.push(new V3(c.ca[k] * SC, c.ca[k + 1] * SC, c.ca[k + 2] * SC));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, 0.13, 7, false), fresnelMat(chainCols[i % 3], { base: 0.16, rim: 0.55, power: 1.8, glow: 1.0 }));
      protein.add(tube);
    });
    root.add(protein);

    // pigments: atoms and bonds, instanced
    const EL = { C: [0.055], N: [0.06], O: [0.06], M: [0.095] };
    const COL = {
      a: { C: [0.18, 0.78, 0.55] }, b: { C: [0.78, 0.86, 0.28] },
      lutein: { C: [1.0, 0.6, 0.12] }, neoxanthin: { C: [1.0, 0.5, 0.15] }, violaxanthin: { C: [1.0, 0.68, 0.2] },
      N: [0.42, 0.6, 1.0], O: [1.0, 0.35, 0.32], M: [0.75, 1.0, 0.35],
    };
    const all = [...lhc.pigments.map((p) => ({ ...p, kind: 'pig' })), ...lhc.carotenoids.map((p) => ({ ...p, kind: 'car' }))];
    let nAtoms = 0, nBonds = 0; all.forEach((p) => { nAtoms += p.el.length; nBonds += p.bonds.length / 2; });
    const atomMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.0 }), nAtoms);
    const bondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.4 }), nBonds);
    const dummy = new THREE.Object3D(), up = new V3(0, 1, 0), c3 = new THREE.Color();
    let ai = 0, bi = 0;
    const pigRanges = [];
    all.forEach((p) => {
      const start = ai, bstart = bi;
      const P = (j) => new V3(p.xyz[j * 3] * SC, p.xyz[j * 3 + 1] * SC, p.xyz[j * 3 + 2] * SC);
      for (let j = 0; j < p.el.length; j++) {
        const e = p.el[j];
        dummy.position.copy(P(j)); dummy.quaternion.identity(); dummy.scale.setScalar(EL[e][0]); dummy.updateMatrix();
        atomMesh.setMatrixAt(ai, dummy.matrix);
        const col = e === 'C' ? COL[p.type].C : COL[e];
        atomMesh.setColorAt(ai, c3.setRGB(col[0], col[1], col[2]));
        ai++;
      }
      for (let j = 0; j < p.bonds.length; j += 2) {
        const a = P(p.bonds[j]), b = P(p.bonds[j + 1]);
        const d = new V3().subVectors(b, a), len = d.length();
        dummy.position.lerpVectors(a, b, 0.5); dummy.quaternion.setFromUnitVectors(up, d.normalize()); dummy.scale.set(0.02, len, 0.02); dummy.updateMatrix();
        bondMesh.setMatrixAt(bi, dummy.matrix);
        const col = COL[p.type] ? COL[p.type].C : [0.7, 0.7, 0.7];
        bondMesh.setColorAt(bi, c3.setRGB(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8));
        bi++;
      }
      pigRanges.push({ a0: start, a1: ai, b0: bstart, b1: bi });
    });
    root.add(atomMesh, bondMesh);
    const baseCols = new Float32Array(atomMesh.instanceColor.array);

    // magnesium glow, one point per chlorophyll
    const pigs = lhc.pigments.map((p, i) => ({ ...p, i, mgV: new V3(p.mg[0] * SC, p.mg[1] * SC, p.mg[2] * SC) }));
    const mgGlow = glowPoints(pigs.length);
    root.add(mgGlow);
    const mgLevel = new Float32Array(pigs.length).fill(0);

    // membrane: lipid heads drawn as faint points above and below, kept clear of the protein
    const lip = glowPoints(1400);
    {
      const ca = []; lhc.chains.forEach((c) => { for (let k = 0; k < c.ca.length; k += 3) ca.push([c.ca[k] * SC, c.ca[k + 2] * SC]); });
      let k = 0;
      for (let y of [-2.25, 2.25]) for (let x = -8; x <= 8 && k < 1400; x += 0.42) for (let z = -8; z <= 8 && k < 1400; z += 0.42) {
        const xx = x + (Math.random() - 0.5) * 0.15, zz = z + (Math.random() - 0.5) * 0.15;
        if (xx * xx + zz * zz > 64) continue;
        if (ca.some(([a, b]) => (a - xx) * (a - xx) + (b - zz) * (b - zz) < 0.36)) continue;
        lip.userData.set(k++, new V3(xx, y, zz), [0.05, 0.08, 0.11], 0.14);
      }
      for (; k < 1400; k++) lip.userData.hide(k);
      lip.userData.flush();
    }
    root.add(lip);

    // route: the exit chlorophyll a is the one furthest out along +x; the reaction centre is drawn beyond it
    const exit = pigs.filter((p) => p.type === 'a').reduce((b, p) => (p.mgV.x > b.mgV.x ? p : b));
    const outDir = new V3(exit.mgV.x, 0, exit.mgV.z).normalize();
    const rcPos = exit.mgV.clone().addScaledVector(outDir, 3.4).setY(exit.mgV.y);
    function route(start) {
      // cheapest path where each hop costs (distance / 10 A)^6, a nod to Forster transfer falling with distance^6,
      // and a hop from chlorophyll a up to b costs 4 times more (b holds a little more energy than a)
      const n = pigs.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
      dist[start.i] = 0;
      for (;;) {
        let u = -1; for (let k = 0; k < n; k++) if (!done[k] && (u < 0 || dist[k] < dist[u])) u = k;
        if (u < 0 || dist[u] === Infinity) break;
        done[u] = true; if (u === exit.i) break;
        for (let v = 0; v < n; v++) {
          if (done[v]) continue;
          const d = pigs[u].mgV.distanceTo(pigs[v].mgV) * 10;
          if (d > 17) continue;
          let w = Math.pow(d / 10, 6); if (pigs[u].type === 'a' && pigs[v].type === 'b') w *= 4;
          if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
        }
      }
      const path = []; for (let u = exit.i; u >= 0; u = prev[u]) path.unshift(pigs[u]);
      return path[0] === start ? path : [start, exit];
    }

    // drawn reaction centre: a soft body and two copies of a real chlorophyll a (P680)
    const rc = new THREE.Group(); rc.position.copy(rcPos); root.add(rc);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.6, 8, 24), fresnelMat(0xc6a6ff, { base: 0.08, rim: 0.6, glow: 1.4 }));
    rc.add(body);
    const ref = lhc.pigments.find((p) => p.type === 'a');
    const refMg = new V3(ref.mg[0] * SC, ref.mg[1] * SC, ref.mg[2] * SC);
    const ringIdx = []; for (let j = 0; j < ref.el.length; j++) { const p = new V3(ref.xyz[j * 3] * SC, ref.xyz[j * 3 + 1] * SC, ref.xyz[j * 3 + 2] * SC); if (p.distanceTo(refMg) < 0.55) ringIdx.push(j); }
    const pairMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.3, emissive: 0x000000 }), ringIdx.length * 2);
    [[-0.24, 0], [0.24, Math.PI]].forEach(([dx, rot], copy) => {
      ringIdx.forEach((j, n) => {
        const p = new V3(ref.xyz[j * 3] * SC, ref.xyz[j * 3 + 1] * SC, ref.xyz[j * 3 + 2] * SC).sub(refMg);
        p.applyAxisAngle(new V3(0, 1, 0), rot); p.x += dx;
        const e = ref.el[j];
        dummy.position.copy(p); dummy.quaternion.identity(); dummy.scale.setScalar(EL[e][0] * 1.1); dummy.updateMatrix();
        pairMesh.setMatrixAt(copy * ringIdx.length + n, dummy.matrix);
        const col = e === 'C' ? COL.a.C : COL[e];
        pairMesh.setColorAt(copy * ringIdx.length + n, c3.setRGB(col[0], col[1], col[2]));
      });
    });
    rc.add(pairMesh);
    const pairCols = new Float32Array(pairMesh.instanceColor.array);

    // water and oxygen, drawn
    const waterG = new THREE.Group(); waterG.position.set(0, -2.0, 0.2); rc.add(waterG);
    const oMat = new THREE.MeshStandardMaterial({ color: 0xff5a4f, roughness: 0.3, emissive: 0x3a0806 });
    const hMat = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.3 });
    const oGeo = new THREE.SphereGeometry(0.17, 20, 14), hGeo = new THREE.SphereGeometry(0.11, 16, 12);
    const waters = [-0.55, 0.55].map((x) => {
      const o = new THREE.Mesh(oGeo, oMat); o.position.set(x, 0, 0);
      const h1 = new THREE.Mesh(hGeo, hMat), h2 = new THREE.Mesh(hGeo, hMat);
      h1.userData.home = new V3(x - 0.18, -0.14, 0.1); h2.userData.home = new V3(x + 0.18, -0.14, 0.1);
      h1.position.copy(h1.userData.home); h2.position.copy(h2.userData.home);
      o.userData.home = o.position.clone();
      waterG.add(o, h1, h2);
      return { o, hs: [h1, h2] };
    });

    // sparks: the excitation, the electron, and the trail of hops
    const spark = glowPoints(16); root.add(spark);
    const trail = glowPoints(600); root.add(trail);
    const elec = glowPoints(30); root.add(elec);
    const incoming = glowPoints(12); root.add(incoming);
    let trailN = 0;
    const addTrail = (a, b, col) => {
      const mid = new V3().lerpVectors(a, b, 0.5).add(new V3(0, a.distanceTo(b) * 0.25, 0));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      for (let k = 0; k <= 24 && trailN < 600; k++) trail.userData.set(trailN++, curve.getPoint(k / 24), col, 0.07);
      trail.userData.flush();
    };
    const clearTrail = () => { for (let k = 0; k < 600; k++) trail.userData.hide(k); trailN = 0; trail.userData.flush(); };

    // labels
    const L = (t, f, c) => { const l = label(t, f, c); l.scene = 'antenna'; return l; };
    const lLHC = L(ui.labelLHC, (v) => v.set(-0.5, 3.2, 0), 'lt-label-soft');
    const lRC = L(ui.labelRC, (v) => v.copy(rcPos).add(new V3(0, 2.2, 0)), 'lt-label-soft');
    const lP680 = L(ui.labelP680, (v) => v.copy(rcPos).add(new V3(0, 0.55, 0)));
    const lHop = L('', () => hopLabelPos, 'lt-label-photon');
    const lO2 = L(ui.labelO2, () => (o2Pos ? o2Pos.clone().add(new V3(0, 0.35, 0)) : null));
    const lE = L(ui.labelElectron, () => (ePos ? ePos.clone().add(new V3(0, 0.3, 0)) : null), 'lt-label-soft');
    const lWater = L(ui.labelWater, () => (seq && seq.phase === 'water' ? new V3().copy(rcPos).add(new V3(0, -1.55, 0.2)) : null), 'lt-label-soft');
    let hopLabelPos = null, o2Pos = null, ePos = null;

    // ---- the sequence ----
    let seq = null, playing = !state.reduced;
    function newSeq() {
      const nm = state.nm;
      const wantB = Math.random() < S.pB(nm);
      const cands = pigs.filter((p) => p.type === (wantB ? 'b' : 'a') && p !== exit && p.mgV.y > -0.2);
      const start = cands[Math.floor(Math.random() * cands.length)] || pigs[0];
      const path = route(start);
      clearTrail(); mgLevel.fill(0);
      atomMesh.instanceColor.array.set(baseCols); atomMesh.instanceColor.needsUpdate = true;
      pairMesh.instanceColor.array.set(pairCols); pairMesh.instanceColor.needsUpdate = true;
      waters.forEach((w) => { w.o.visible = true; w.o.position.copy(w.o.userData.home); w.hs.forEach((h) => { h.visible = true; h.position.copy(h.userData.home); }); });
      o2Pos = null; ePos = null; hopLabelPos = null;
      for (let k = 0; k < 30; k++) elec.userData.hide(k); elec.userData.flush();
      seq = { nm, start, path, phase: 'in', t: 0, hop: 0, pB: S.pB(nm) };
      ctx.onEvent('antennaReset', {});
      return seq;
    }
    const glowPig = (p, k) => {
      const r = pigRanges[p.i], arr = atomMesh.instanceColor.array;
      for (let j = r.a0; j < r.a1; j++) for (let c = 0; c < 3; c++) arr[j * 3 + c] = baseCols[j * 3 + c] * (1 + k * 3.5);
      atomMesh.instanceColor.needsUpdate = true;
    };
    const say = (key, o) => ctx.onEvent('antennaStep', { key, ...o });
    const DUR = { in: 1.3, caught: 0.8, hop: 0.95, leave: 1.2, p680: 0.9, electron: 1.3, water: 2.2, o2: 2.4 };
    function advance() {
      const s = seq;
      if (s.phase === 'in') {
        s.phase = 'caught'; s.t = 0; glowPig(s.start, 1); mgLevel[s.start.i] = 1.6;
        say('stepCaught', { type: s.start.type, chain: s.start.chain, nm: Math.round(s.nm), pb: Math.round(s.pB * 100) });
      } else if (s.phase === 'caught' || s.phase === 'hop') {
        if (s.hop < s.path.length - 1) {
          const a = s.path[s.hop], b = s.path[s.hop + 1];
          s.phase = 'hop'; s.t = 0; s.from = a; s.to = b;
          const d = a.mgV.distanceTo(b.mgV) * 10;
          hopLabelPos = new V3().lerpVectors(a.mgV, b.mgV, 0.5).add(new V3(0, d * 0.025 + 0.25, 0));
          lHop.el.textContent = `${d.toFixed(1)} Å`;
          say('stepHop', { n: s.hop + 1, d: d.toFixed(1), type: b.type });
          s.hop++;
        } else {
          s.phase = 'leave'; s.t = 0; hopLabelPos = null;
          say('stepLeave', {});
        }
      } else if (s.phase === 'leave') {
        s.phase = 'p680'; s.t = 0; say('stepP680', {});
      } else if (s.phase === 'p680') {
        s.phase = 'electron'; s.t = 0; say('stepElectron', {});
      } else if (s.phase === 'electron') {
        s.phase = 'water'; s.t = 0; say('stepWater', {});
      } else if (s.phase === 'water') {
        s.phase = 'o2'; s.t = 0;
      } else if (s.phase === 'o2') {
        s.phase = 'done'; s.t = 0; say('stepDone', { hops: s.path.length - 1 });
        ctx.onEvent('antennaDone', { hops: s.path.length - 1, nm: s.nm });
      }
    }
    // reduced motion: lay the whole story out as one still frame
    function stillFrame() {
      const s = newSeq();
      glowPig(s.start, 1); mgLevel[s.start.i] = 1.6;
      say('stepCaught', { type: s.start.type, chain: s.start.chain, nm: Math.round(s.nm), pb: Math.round(s.pB * 100) });
      for (let h = 0; h < s.path.length - 1; h++) {
        const a = s.path[h], b = s.path[h + 1]; const lc = [1.4, 1.6, 0.6];
        addTrail(a.mgV, b.mgV, lc); mgLevel[b.i] = 1.2; glowPig(b, 0.6);
        say('stepHop', { n: h + 1, d: (a.mgV.distanceTo(b.mgV) * 10).toFixed(1), type: b.type });
      }
      addTrail(exit.mgV, rcPos.clone(), [1.2, 1.0, 1.6]);
      ['stepLeave', 'stepP680', 'stepElectron', 'stepWater'].forEach((k) => say(k, {}));
      waters.forEach((w) => { w.o.visible = false; w.hs.forEach((h) => (h.visible = false)); });
      o2Pos = rcPos.clone().add(new V3(0.6, -2.6, 0.4));
      ePos = rcPos.clone().add(new V3(0.8, 1.9, 0));
      say('stepDone', { hops: s.path.length - 1 });
      s.phase = 'still';
      ctx.onEvent('antennaDone', { hops: s.path.length - 1, nm: s.nm });
    }
    const o2Mesh = new THREE.Group(); const oA = new THREE.Mesh(oGeo, oMat), oB = new THREE.Mesh(oGeo, oMat); oA.position.x = -0.13; oB.position.x = 0.13; o2Mesh.add(oA, oB); o2Mesh.visible = false; root.add(o2Mesh);

    function update(dt, t) {
      if (!seq) { if (state.reduced) stillFrame(); else newSeq(); }
      const s = seq;
      const lc = S.linColour(s.nm);
      // magnesium glow: all faintly, visited ones brighter, a slow breath
      for (let i = 0; i < pigs.length; i++) {
        mgLevel[i] = Math.max(state.reduced ? mgLevel[i] : mgLevel[i] - dt * 0.25, 0);
        const b = 0.55 + 0.15 * Math.sin(t * 1.3 + i) + mgLevel[i] * 2.2;
        mgGlow.userData.set(i, pigs[i].mgV, [0.55 * b, 1.0 * b, 0.35 * b], 0.32 + mgLevel[i] * 0.25);
      }
      mgGlow.userData.flush();
      if (s.phase !== 'still' && playing && !state.reduced) s.t += dt;
      const k = s.phase in DUR ? clamp(s.t / DUR[s.phase], 0, 1) : 1;
      // incoming photon
      if (s.phase === 'in') {
        const from = s.start.mgV.clone().add(new V3(-1.5, 7, 2.5));
        for (let i = 0; i < 12; i++) {
          const kk = clamp(k - i * 0.02, 0, 1); const p = new V3().lerpVectors(from, s.start.mgV, smooth(kk) * 0.6 + kk * 0.4);
          const a = (1 - i / 12) * 4; incoming.userData.set(i, p, [lc[0] * a, lc[1] * a, lc[2] * a], i === 0 ? 0.3 : 0.16);
        }
      } else for (let i = 0; i < 12; i++) incoming.userData.hide(i);
      incoming.userData.flush();
      // the excitation spark
      let sp = null;
      if (s.phase === 'caught') { sp = s.start.mgV; exLight.intensity = 6 * (1 - k * 0.5); }
      else if (s.phase === 'hop') {
        const a = s.from.mgV, b = s.to.mgV, mid = new V3().lerpVectors(a, b, 0.5).add(new V3(0, a.distanceTo(b) * 0.25, 0));
        sp = new THREE.QuadraticBezierCurve3(a, mid, b).getPoint(smooth(k));
        if (k >= 1 && !s.trailed) { s.trailed = true; }
        if (s.lastHop !== s.hop) { s.lastHop = s.hop; addTrail(a, b, [lc[0] * 0.6 + 0.5, lc[1] * 0.6 + 0.6, lc[2] * 0.6 + 0.3]); }
        if (k > 0.85) { glowPig(s.to, 1); mgLevel[s.to.i] = 1.6; glowPig(s.from, 0.25); }
        exLight.intensity = 5;
      } else if (s.phase === 'leave') {
        const a = exit.mgV; if (!s.leftTrail) { s.leftTrail = true; addTrail(a, rcPos.clone(), [1.2, 1.0, 1.6]); glowPig(exit, 0.25); }
        const mid = new V3().lerpVectors(a, rcPos, 0.5).add(new V3(0, 0.8, 0));
        sp = new THREE.QuadraticBezierCurve3(a, mid, rcPos).getPoint(smooth(k));
        exLight.intensity = 4;
      } else exLight.intensity = Math.max(0, exLight.intensity - dt * 6);
      if (sp) { exLight.position.copy(sp); for (let i = 0; i < 16; i++) spark.userData.set(i, sp, i ? [0.5, 0.6, 0.25] : [3.2, 3.6, 2.0], i ? 0.12 + i * 0.03 : 0.34); }
      else for (let i = 0; i < 16; i++) spark.userData.hide(i);
      spark.userData.flush();
      // P680 lights up
      const pk = s.phase === 'p680' ? Math.sin(k * Math.PI) : (s.phase === 'electron' || s.phase === 'water' || s.phase === 'o2' || s.phase === 'done' || s.phase === 'still') ? 0.35 : 0;
      { const arr = pairMesh.instanceColor.array; for (let j = 0; j < arr.length; j++) arr[j] = pairCols[j] * (1 + pk * 4); pairMesh.instanceColor.needsUpdate = true; }
      // electron out
      if (s.phase === 'electron') {
        const a = rcPos.clone().add(new V3(0, 0.3, 0)), b = rcPos.clone().add(new V3(1.8, 3.2, 0.4));
        ePos = new V3().lerpVectors(a, b, smooth(k));
        for (let i = 0; i < 30; i++) { const kk = clamp(smooth(k) - i * 0.012, 0, 1); elec.userData.set(i, new V3().lerpVectors(a, b, kk), i ? [0.2, 0.6, 1.4].map((x) => x * (1 - i / 30)) : [1.6, 2.6, 4], i ? 0.08 : 0.24); }
        elec.userData.flush();
      } else if (s.phase !== 'still' && s.phase !== 'done' && s.phase !== 'water' && s.phase !== 'o2') ePos = null;
      if (s.phase === 'water') {
        // water molecules split: hydrogens drift off, the two oxygens move together
        waters.forEach((w, j) => {
          w.o.position.lerpVectors(w.o.userData.home, new V3(j ? 0.13 : -0.13, -0.25, 0), smooth(k));
          w.hs.forEach((h, m) => { h.position.copy(h.userData.home).add(new V3((m ? 1 : -1) * (j ? 1 : -1) * 0.9 * smooth(k), -0.6 * smooth(k), 0.3 * smooth(k))); h.visible = k < 0.95; });
        });
        for (let i = 0; i < 30; i++) {
          const kk = smooth(clamp(k * 1.3 - (i % 4) * 0.08, 0, 1)), a = rcPos.clone().add(new V3(((i % 4) - 1.5) * 0.3, -2.0, 0.2)), b = rcPos.clone().add(new V3(0, -0.2, 0));
          if (i < 4) elec.userData.set(i, new V3().lerpVectors(a, b, kk), [1.0, 1.8, 3], 0.13); else elec.userData.hide(i);
        }
        elec.userData.flush();
      }
      if (s.phase === 'o2' || s.phase === 'done' || s.phase === 'still') {
        waters.forEach((w) => { w.o.visible = false; w.hs.forEach((h) => (h.visible = false)); });
        if (s.phase === 'o2') o2Pos = rcPos.clone().add(new V3(0, -2.25, 0.2)).add(new V3(0.6 * smooth(k), -0.8 * smooth(k), 0.4 * smooth(k)));
        o2Mesh.visible = true; o2Mesh.position.copy(o2Pos); o2Mesh.rotation.y = t * 0.6;
      } else o2Mesh.visible = false;
      lO2.on = o2Mesh.visible; lE.on = !!ePos;
      lHop.on = s.phase === 'hop' || (state.reduced && false);
      if (s.phase in DUR && s.t >= DUR[s.phase] && playing && !state.reduced) advance();
      if (s.phase === 'done' && playing && !state.reduced) { s.t += 0; }
    }

    return {
      scene,
      enter() {
        orbit.enabled = true; orbit.target.set(1.3, 0, 0); orbit.yaw = 0.35; orbit.pitch = 0.78;
        const aspect = state.w / state.h;
        orbit.dist = Math.max(15, 8.5 / (Math.tan(camera.fov / 2 * DEG) * aspect));
        orbit.minD = 5; orbit.maxD = 40; orbit.minP = -0.9; orbit.maxP = 1.45; orbit.yawLimit = Math.PI;
        post.comp.uniforms.vignette.value = 0.6;
        if (!seq || seq.phase === 'done' || seq.nm !== state.nm) { seq = null; }
      },
      update(dt, t) { update(dt, t); if (!state.reduced && orbit.idle > 5) orbit.yaw += dt * 0.05; },
      play() { playing = true; if (seq && seq.phase === 'done') newSeq(); },
      pause() { playing = false; },
      playing: () => playing,
      step() { playing = false; if (!seq || seq.phase === 'done' || seq.phase === 'still') { newSeq(); return; } seq.t = 0; advance(); },
      replay() { seq = null; if (state.reduced) stillFrame(); else { newSeq(); playing = true; } },
      showProtein(on) { protein.visible = on; },
      reroute() { seq = null; },
    };
  }

  // =============================================================================================================
  const builders = { sun: buildSun, leaf: () => buildLeaf(false), cell: buildCell, antenna: buildAntenna, payoff: () => buildLeaf(true) };
  function get(id) { if (!scenes[id]) scenes[id] = builders[id](); return scenes[id]; }

  let swapFn = null;
  function fadeSwap(fn) {
    if (state.reduced) { fn(); return; }
    swapFn = fn; state.fadeTarget = 1;
  }

  function setStop(id) {
    const go = () => {
      state.stop = id;
      const sc = get(id);
      sc.enter();
      if (id === 'sun' && sc.setNm) sc.setNm(state.nm);
      placeCamera();
      kick();
    };
    if (state.stop === null || state.reduced) go(); else fadeSwap(go);
  }

  // ---------- size, loop ----------
  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    state.w = w; state.h = h;
    let dpr = dprCap;
    if (w * h * dpr * dpr > 2.6e6) dpr = Math.sqrt(2.6e6 / (w * h));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    post.setSize(bw, bh);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const scale = bh / (2 * Math.tan(camera.fov / 2 * DEG));
    for (const id in scenes) scenes[id].scene.traverse((o) => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uScale) o.material.uniforms.uScale.value = scale; });
    pointScale = scale;
    if (state.stop) { scenes[state.stop].enter(); placeCamera(); }
    kick();
  }
  let pointScale = 400;

  let raf = 0, last = 0, slow = 0, frames = 0, visible = true, inView = true;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    state.t += dt;
    orbit.idle += dt;
    // fades between scenes
    if (state.fadeTarget === 1) {
      state.fade = Math.min(1, state.fade + dt / 0.32);
      if (state.fade >= 1) { const f = swapFn; swapFn = null; state.fadeTarget = 0; if (f) f(); }
    } else state.fade = Math.max(0, state.fade - dt / 0.45);
    const sc = state.stop ? scenes[state.stop] : null;
    if (sc) {
      sc.scene.traverse((o) => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uScale && o.material.uniforms.uScale.value !== pointScale) o.material.uniforms.uScale.value = pointScale; });
      sc.scene.children.forEach((o) => { if (o.renderOrder === -100) o.material.uniforms.time.value = state.t; });
      sc.update(dt, state.t);
      placeCamera();
      post.comp.uniforms.fade.value = state.fade;
      post.render(sc.scene, camera, state.t);
      updateLabels();
    }
    // quality guard: if frames are slow for a while, drop the bloom, then the pixel ratio
    frames++;
    if (dt > 0.034) slow++;
    if (frames >= 90) {
      if (slow > 60) {
        if (post.enabled) post.enabled = false;
        else if (dprCap > 1) { dprCap = 1; resize(); }
      }
      frames = 0; slow = 0;
    }
    if (state.running && (!state.reduced || state.fade > 0 || state.fadeTarget)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!state.running) return;
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function start() { if (!visible || !inView) return; state.running = true; kick(); }
  function stop() { state.running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  const ro = new ResizeObserver(() => resize()); ro.observe(host);
  const io = new IntersectionObserver((e) => { inView = e[0].isIntersecting; inView ? start() : stop(); }); io.observe(host);
  const onVis = () => { visible = !document.hidden; visible ? start() : stop(); };
  document.addEventListener('visibilitychange', onVis);
  resize();

  return {
    setStop, start, stop, kick,
    setNm(nm) {
      state.nm = nm;
      if (scenes.sun) scenes.sun.setNm(nm);
      if (scenes.antenna && state.stop !== 'antenna') scenes.antenna.reroute();
      kick();
    },
    setReduced(r) { state.reduced = r; kick(); },
    leaf: () => get('leaf'),
    cell: () => get('cell'),
    antenna: () => get('antenna'),
    payoff: () => get('payoff'),
    current: () => state.stop,
    dispose() {
      stop(); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis);
      for (const id in scenes) scenes[id].scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      post.dispose(); renderer.dispose(); canvas.remove(); labelLayer.remove();
    },
  };
}

export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; }
}
export { photon };
